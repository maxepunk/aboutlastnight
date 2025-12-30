/**
 * Validation Nodes - Programmatic validation before LLM evaluation
 *
 * Commit 8.20: Programmatic validation layer
 *
 * These nodes run BEFORE LLM evaluators to check structural requirements
 * that can be verified without AI judgment:
 * - validateOutlineStructure: Check required sections, arc coverage, ID validity
 * - validateArticleContent: Check banned patterns, voice markers, roster mentions
 *
 * Flow:
 *   generateOutline → validateOutlineStructure → evaluateOutline
 *   generateContentBundle → validateArticleContent → evaluateArticle
 *
 * If validation fails with structural issues → regenerate (don't waste LLM eval tokens)
 * If validation passes or only advisory issues → proceed to LLM evaluation
 *
 * Uses config-driven rules from theme-config.js (Commit 8.19)
 */

const { PHASES } = require('../state');
const { getOutlineRules, getArticleRules } = require('../../theme-config');
const { traceNode } = require('../../observability');
const { resolveArc } = require('./node-helpers');

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if a pattern matches in text
 * @param {Object} patternDef - Pattern definition from config
 * @param {string} text - Text to search
 * @returns {boolean} True if pattern found
 */
function matchesPattern(patternDef, text) {
  const { pattern, caseSensitive = true, isRegex = false } = patternDef;

  if (isRegex) {
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(pattern, flags);
    return regex.test(text);
  }

  const searchText = caseSensitive ? text : text.toLowerCase();
  const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
  return searchText.includes(searchPattern);
}

/**
 * Find all occurrences of a pattern in text
 * @param {Object} patternDef - Pattern definition from config
 * @param {string} text - Text to search
 * @returns {Array<{line: number, snippet: string}>} Matches with context
 */
function findPatternOccurrences(patternDef, text) {
  const { pattern, caseSensitive = true, isRegex = false } = patternDef;
  const lines = text.split('\n');
  const occurrences = [];

  lines.forEach((line, idx) => {
    let matches = false;

    if (isRegex) {
      const flags = caseSensitive ? '' : 'i';
      const regex = new RegExp(pattern, flags);
      matches = regex.test(line);
    } else {
      const searchLine = caseSensitive ? line : line.toLowerCase();
      const searchPattern = caseSensitive ? pattern : pattern.toLowerCase();
      matches = searchLine.includes(searchPattern);
    }

    if (matches) {
      occurrences.push({
        line: idx + 1,
        snippet: line.trim().substring(0, 100)
      });
    }
  });

  return occurrences;
}

/**
 * Extract text content from outline for validation
 * @param {Object} outline - Article outline
 * @returns {Object} Section texts keyed by section name
 */
function extractOutlineText(outline) {
  const texts = {};

  // Handle different outline structures
  if (outline.sections) {
    for (const section of outline.sections) {
      const name = section.name || section.sectionName || 'unknown';
      texts[name] = section.description || section.content || '';
    }
  }

  // Also extract from top-level section keys
  const sectionKeys = ['lede', 'theStory', 'thePlayers', 'followTheMoney', 'whatsMissing', 'closing'];
  for (const key of sectionKeys) {
    if (outline[key] && typeof outline[key] === 'object') {
      texts[key] = outline[key].description || outline[key].content || JSON.stringify(outline[key]);
    } else if (outline[key] && typeof outline[key] === 'string') {
      texts[key] = outline[key];
    }
  }

  return texts;
}

/**
 * Extract full text content from content bundle for validation
 * @param {Object} contentBundle - Article content bundle
 * @returns {string} Combined text content
 */
function extractArticleText(contentBundle) {
  if (!contentBundle) return '';

  // Handle string content directly
  if (typeof contentBundle === 'string') {
    return contentBundle;
  }

  // Handle structured content bundle
  const parts = [];

  if (contentBundle.lede) parts.push(contentBundle.lede);
  if (contentBundle.theStory) parts.push(contentBundle.theStory);
  if (contentBundle.thePlayers) parts.push(contentBundle.thePlayers);
  if (contentBundle.followTheMoney) parts.push(contentBundle.followTheMoney);
  if (contentBundle.whatsMissing) parts.push(contentBundle.whatsMissing);
  if (contentBundle.closing) parts.push(contentBundle.closing);

  // Handle sections array
  if (contentBundle.sections && Array.isArray(contentBundle.sections)) {
    for (const section of contentBundle.sections) {
      if (section.content) parts.push(section.content);
      if (section.paragraphs && Array.isArray(section.paragraphs)) {
        parts.push(section.paragraphs.join('\n'));
      }
    }
  }

  return parts.join('\n\n');
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTLINE STRUCTURE VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate outline structure before LLM evaluation
 *
 * Checks:
 * - Required sections exist
 * - All selected arcs are covered
 * - Photo/evidence IDs are valid
 *
 * @param {Object} state - LangGraph state
 * @param {Object} config - LangGraph config
 * @returns {Object} Partial state update with validation results
 */
async function validateOutlineStructure(state, config) {
  const startTime = Date.now();
  const theme = config?.configurable?.theme || 'journalist';
  const rules = getOutlineRules(theme);
  const outline = state.outline || {};
  const issues = [];

  console.log(`[validateOutlineStructure] Validating outline for theme: ${theme}`);

  // 1. Check required sections
  const sectionTexts = extractOutlineText(outline);
  const presentSections = new Set(Object.keys(sectionTexts).filter(k => sectionTexts[k]));

  for (const section of rules.requiredSections || []) {
    if (!presentSections.has(section)) {
      issues.push({
        type: 'structural',
        field: 'requiredSections',
        section,
        message: `Required section "${section}" is missing from outline`
      });
    }
  }

  // 2. Check arc coverage
  const selectedArcs = Array.isArray(state.selectedArcs) ? state.selectedArcs : [];
  const narrativeArcs = Array.isArray(state.narrativeArcs) ? state.narrativeArcs : [];

  // Get arc IDs that are selected
  const selectedArcIds = new Set(
    selectedArcs.map(a => typeof a === 'string' ? a : a.id)
  );

  // Look for arc references in theStory section
  const theStoryText = sectionTexts.theStory || '';
  const fullOutlineText = Object.values(sectionTexts).join(' ');

  for (const arcId of selectedArcIds) {
    // Resolve arc ID to full arc object using helper (DRY - Commit 8.25)
    const arcData = resolveArc(arcId, narrativeArcs);
    const arcTitle = arcData?.title || arcId;

    // Check if arc is mentioned (by ID or title)
    const isMentioned = fullOutlineText.includes(arcId) ||
                        fullOutlineText.toLowerCase().includes(arcTitle.toLowerCase());

    if (!isMentioned) {
      issues.push({
        type: 'structural',
        field: 'arcCoverage',
        arcId,
        arcTitle,
        message: `Selected arc "${arcTitle}" (${arcId}) is not covered in outline`
      });
    }
  }

  // 3. Check evidence bundle ID references
  const evidenceBundle = state.evidenceBundle || {};
  const validEvidenceIds = new Set([
    ...(Array.isArray(evidenceBundle.exposed) ? evidenceBundle.exposed : []).map(e => e.id),
    ...(Array.isArray(evidenceBundle.buried) ? evidenceBundle.buried : []).map(e => e.id),
    ...(Array.isArray(evidenceBundle.context) ? evidenceBundle.context : []).map(e => e.id)
  ]);

  // Check photo references
  const photoAnalyses = Array.isArray(state.photoAnalyses) ? state.photoAnalyses : [];
  const validPhotoIds = new Set(photoAnalyses.map(p => p.filename || p.id));

  // Look for ID references in outline
  const idPattern = /[A-Z0-9]{8,}/g; // Common ID pattern
  const referencedIds = fullOutlineText.match(idPattern) || [];

  for (const refId of referencedIds) {
    if (!validEvidenceIds.has(refId) && !validPhotoIds.has(refId) && !selectedArcIds.has(refId)) {
      // Only flag if it looks like an ID reference (8+ chars, alphanumeric)
      if (refId.length >= 8 && /^[A-Z0-9]+$/.test(refId)) {
        issues.push({
          type: 'advisory',  // Could be false positive
          field: 'evidenceIdValidity',
          refId,
          message: `Potential invalid evidence/photo ID reference: "${refId}"`
        });
      }
    }
  }

  // 4. Check word budgets (advisory)
  const wordBudgets = rules.wordBudgets || {};
  for (const [section, budget] of Object.entries(wordBudgets)) {
    const text = sectionTexts[section] || '';
    const wordCount = text.split(/\s+/).filter(w => w).length;

    if (wordCount > 0 && wordCount < budget.min) {
      issues.push({
        type: 'advisory',
        field: 'wordBudget',
        section,
        actual: wordCount,
        expected: budget,
        message: `Section "${section}" has ${wordCount} words, minimum is ${budget.min}`
      });
    }

    if (wordCount > budget.max) {
      issues.push({
        type: 'advisory',
        field: 'wordBudget',
        section,
        actual: wordCount,
        expected: budget,
        message: `Section "${section}" has ${wordCount} words, maximum is ${budget.max}`
      });
    }
  }

  // Determine if validation passed
  const structuralIssues = issues.filter(i => i.type === 'structural');
  const valid = structuralIssues.length === 0;

  const result = {
    outlineValidation: {
      valid,
      issues,
      structuralIssues: structuralIssues.length,
      advisoryIssues: issues.length - structuralIssues.length,
      validatedAt: new Date().toISOString()
    }
  };

  console.log(`[validateOutlineStructure] Validation complete: valid=${valid}, issues=${issues.length} (${structuralIssues.length} structural)`);

  // Note: Routing and revision increment handled by graph.js routeOutlineValidation
  // Validation node only sets validation result - no counter/phase updates here
  if (!valid) {
    console.log(`[validateOutlineStructure] Structural issues found, routing will handle revision`);
  }

  traceNode('validateOutlineStructure', startTime, { valid, issueCount: issues.length });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// ARTICLE CONTENT VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate article content before LLM evaluation
 *
 * Checks:
 * - No banned patterns (em-dash, game mechanics, etc.)
 * - Required voice markers present
 * - Roster member mentions
 *
 * @param {Object} state - LangGraph state
 * @param {Object} config - LangGraph config
 * @returns {Object} Partial state update with validation results
 */
async function validateArticleContent(state, config) {
  const startTime = Date.now();
  const theme = config?.configurable?.theme || 'journalist';
  const rules = getArticleRules(theme);
  const contentBundle = state.contentBundle || {};
  const issues = [];

  console.log(`[validateArticleContent] Validating article content for theme: ${theme}`);

  // Extract full article text
  const articleText = extractArticleText(contentBundle);

  if (!articleText || articleText.length < 100) {
    issues.push({
      type: 'structural',
      field: 'content',
      message: 'Article content is missing or too short (< 100 chars)'
    });

    // Note: Routing handles revision increment - we only set validation result
    return {
      articleValidation: {
        valid: false,
        issues,
        structuralIssues: 1,
        advisoryIssues: 0,
        validatedAt: new Date().toISOString()
      }
    };
  }

  // 1. Check banned patterns
  const bannedPatterns = rules.bannedPatterns || [];
  for (const patternDef of bannedPatterns) {
    const occurrences = findPatternOccurrences(patternDef, articleText);

    if (occurrences.length > 0) {
      issues.push({
        type: 'structural',
        field: 'bannedPattern',
        pattern: patternDef.name,
        description: patternDef.description,
        occurrences: occurrences.slice(0, 5), // Limit to first 5
        count: occurrences.length,
        message: `Banned pattern "${patternDef.name}" found ${occurrences.length} time(s): ${patternDef.description}`
      });
    }
  }

  // 2. Check required voice markers
  const requiredMarkers = rules.requiredVoiceMarkers || [];
  const missingMarkers = [];

  for (const marker of requiredMarkers) {
    if (!articleText.includes(marker)) {
      missingMarkers.push(marker);
    }
  }

  if (missingMarkers.length > 0) {
    issues.push({
      type: 'structural',
      field: 'voiceMarkers',
      missing: missingMarkers,
      message: `Missing required voice markers: ${missingMarkers.map(m => `"${m}"`).join(', ')} - article should use first-person participatory voice`
    });
  }

  // 3. Check roster coverage (advisory)
  const sessionConfig = state.sessionConfig || {};
  const roster = Array.isArray(sessionConfig.roster) ? sessionConfig.roster : [];
  const minMentions = rules.minRosterMentions || 1;

  for (const player of roster) {
    const playerName = typeof player === 'string' ? player : player.name;
    if (!playerName) continue;

    // Count mentions (case insensitive)
    const regex = new RegExp(playerName, 'gi');
    const matches = articleText.match(regex) || [];

    if (matches.length < minMentions) {
      issues.push({
        type: 'advisory',
        field: 'rosterCoverage',
        player: playerName,
        actual: matches.length,
        expected: minMentions,
        message: `Roster member "${playerName}" mentioned ${matches.length} time(s), minimum is ${minMentions}`
      });
    }
  }

  // Determine if validation passed
  const structuralIssues = issues.filter(i => i.type === 'structural');
  const valid = structuralIssues.length === 0;

  const result = {
    articleValidation: {
      valid,
      issues,
      structuralIssues: structuralIssues.length,
      advisoryIssues: issues.length - structuralIssues.length,
      articleLength: articleText.length,
      wordCount: articleText.split(/\s+/).filter(w => w).length,
      validatedAt: new Date().toISOString()
    }
  };

  console.log(`[validateArticleContent] Validation complete: valid=${valid}, issues=${issues.length} (${structuralIssues.length} structural)`);

  // Note: Routing and revision increment handled by graph.js routeArticleValidation
  // Validation node only sets validation result - no counter/phase updates here
  if (!valid) {
    console.log(`[validateArticleContent] Structural issues found, routing will handle revision`);
  }

  traceNode('validateArticleContent', startTime, { valid, issueCount: issues.length });
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  validateOutlineStructure,
  validateArticleContent,

  // Testing utilities
  _testing: {
    matchesPattern,
    findPatternOccurrences,
    extractOutlineText,
    extractArticleText
  }
};
