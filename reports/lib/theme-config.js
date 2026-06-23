/**
 * Theme Configuration - Theme-specific settings for report generation
 *
 * Commit 8.17: Centralized theme config for DRY/SOLID compliance
 * Commit 8.19: Added outlineRules for programmatic validation
 * F9/CR-5: articleRules (bannedPatterns) removed — ban enforcement is prompt-only.
 *
 * Each theme defines:
 * - npcs: Characters valid in characterPlacements but not on player roster
 * - outlineRules: Structural requirements for article outlines
 *
 * To add a new theme:
 * 1. Add entry to THEME_CONFIGS with theme name as key
 * 2. Define npcs, outlineRules
 * 3. No changes needed to validation code (Open/Closed principle)
 */

const THEME_CONFIGS = {
  journalist: {
    // NPCs for the NovaNews investigative journalism theme
    // These characters are valid in arc characterPlacements but don't count toward roster coverage
    npcs: [
      'Marcus',   // The murder victim - central to every arc
      'Nova',     // The journalist narrator (matches "Nova" or "* Nova" patterns)
      'Blake',    // The valet NPC
      'Valet',    // Alias for Blake
    ],

    // Outline structure rules (Commit 8.19)
    // Used by programmatic validation BEFORE LLM evaluation
    outlineRules: {
      // Sections that MUST exist (structural requirement)
      requiredSections: ['lede', 'theStory', 'thePlayers', 'closing'],
      // Sections that MAY exist
      optionalSections: ['followTheMoney', 'whatsMissing'],
      // Target word counts per section (advisory)
      // Reconciled to sum to 1000-1500 word envelope (see docs/superpowers/plans/2026-03-30-word-budget-reconciliation.md)
      wordBudgets: {
        lede: { min: 75, max: 150 },
        theStory: { min: 350, max: 550 },
        followTheMoney: { min: 75, max: 200 },
        thePlayers: { min: 150, max: 250 },
        whatsMissing: { min: 75, max: 150 },
        closing: { min: 75, max: 150 }
      }
    },

    // Article content rules: REMOVED (F9/CR-5). The bannedPatterns/getArticleRules
    // config had zero runtime consumers — ban enforcement is PROMPT-ONLY (see
    // anti-patterns.md + evaluator-nodes.js critical checks + buildValidationPrompt).

    // canonicalCharacters REMOVED — now derived from Notion Character database
    // via extractCanonicalCharacters() in node-helpers.js at fetch time.
    // Stored in state.canonicalCharacters for downstream use.

    // Display constants for template rendering and post-generation validation
    // Used by template-helpers.js (articleIdPrefix), Article.js (crystallizationLabel),
    // and ai-nodes.js (postGenValidation)
    display: {
      articleIdPrefix: 'NNA',           // NovaNews Article
      crystallizationLabel: "Nova's Insight",
      storyDate: '2027-02-22',           // In-world article date (always Feb 22, 2027)
      postGenValidation: {
        minInlineEvidenceCards: 3
      }
    }
  },

  detective: {
    // NPCs for the detective investigation theme
    // Same game universe, different narrator (Detective Anondono)
    npcs: [
      'Marcus',   // The murder victim
      'Blake',    // The valet NPC
      'Valet',    // Alias for Blake
    ],

    // Outline structure rules for detective case report
    outlineRules: {
      requiredSections: ['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'],
      optionalSections: ['memoryAnalysis'],
      wordBudgets: {
        executiveSummary: { min: 50, max: 150 },
        evidenceLocker: { min: 150, max: 400 },
        memoryAnalysis: { min: 80, max: 200 },
        suspectNetwork: { min: 80, max: 200 },
        outstandingQuestions: { min: 40, max: 120 },
        finalAssessment: { min: 80, max: 200 }
      }
    },

    // Article content rules: REMOVED (F9/CR-5) — ban enforcement is PROMPT-ONLY.

    // canonicalCharacters REMOVED — now derived from Notion Character database
    // via extractCanonicalCharacters() in node-helpers.js at fetch time.

    // Display constants for template rendering and post-generation validation
    // Detective case reports use a different ID prefix and no evidence-card minimum (minInlineEvidenceCards: 0)
    display: {
      articleIdPrefix: 'DCR',           // Detective Case Report
      crystallizationLabel: "Detective's Note",
      postGenValidation: {
        minInlineEvidenceCards: 0
      }
    }
  }
};

/**
 * Get NPCs for a theme
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @returns {string[]} Array of NPC names, empty array if theme not found
 */
function getThemeNPCs(theme) {
  return THEME_CONFIGS[theme]?.npcs || [];
}

/**
 * Get full config for a theme
 * @param {string} theme - Theme name
 * @returns {Object|null} Theme config or null if not found
 */
function getThemeConfig(theme) {
  return THEME_CONFIGS[theme] || null;
}

/**
 * Check if a theme exists
 * @param {string} theme - Theme name
 * @returns {boolean}
 */
function isValidTheme(theme) {
  return theme in THEME_CONFIGS;
}

/**
 * Get outline rules for a theme (Commit 8.19)
 * @param {string} theme - Theme name
 * @returns {Object} Outline rules or empty object if theme not found
 */
function getOutlineRules(theme) {
  return THEME_CONFIGS[theme]?.outlineRules || {};
}

/**
 * Get canonical full name for a character first name
 *
 * Looks up a first name in a Notion-derived canonical characters map.
 * The map is built by extractCanonicalCharacters() from token owner data.
 *
 * @param {string} firstName - First name (e.g., 'Vic')
 * @param {Object} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @returns {string} Full canonical name (e.g., 'Vic Kingsley') or firstName if not found
 */
function getCanonicalName(firstName, canonicalCharacters = {}) {
  if (!firstName) return firstName;
  // Normalize to title case for lookup
  const normalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return canonicalCharacters[normalized] || firstName;
}

/**
 * @deprecated Use Object.keys(state.canonicalCharacters) instead.
 * Character names are now derived from Notion at fetch time, not hardcoded.
 *
 * @param {string} theme - Theme name (unused)
 * @returns {string[]} Always returns empty array
 */
function getThemeCharacters(theme = 'journalist') {
  console.warn('[getThemeCharacters] DEPRECATED: Use Object.keys(state.canonicalCharacters) instead. Hardcoded character maps have been removed.');
  return [];
}

module.exports = {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getCanonicalName,
  getThemeCharacters
};
