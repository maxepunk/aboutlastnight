/**
 * AI Nodes - AI processing nodes for report generation workflow
 *
 * These nodes handle the AI-powered phases of the pipeline:
 * - curateEvidenceBundle: Curate evidence into three-layer structure (1.8)
 * - analyzeNarrativeArcs: Analyze evidence for narrative arcs (2)
 * - generateOutline: Generate article outline from selected arcs (3)
 * - generateContentBundle: Generate structured content JSON (4)
 * - validateArticle: Validate voice and anti-patterns (5.1)
 * - reviseContentBundle: Revise content based on validation feedback (4.2)
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES and APPROVAL_TYPES constants
 * - Support dependency injection via config.configurable
 *
 * Testing:
 * - Use createMockClaudeClient(fixtures) for mocking AI responses
 * - Use createMockPromptBuilder() for mocking prompt generation
 * - Internal functions exported via _testing
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
const { callClaude } = require('../../claude-client');
const { SchemaValidator } = require('../../schema-validator');
const { createPromptBuilder } = require('../../prompt-builder');

/**
 * Safely parse JSON response with actionable error messages
 *
 * When Claude returns invalid JSON, we need:
 * 1. The context (which node failed)
 * 2. The actual error from JSON.parse
 * 3. A preview of the response for debugging
 *
 * This is critical because LLM responses can be unpredictable,
 * and silent failures or generic errors make debugging impossible.
 *
 * @param {string} response - Raw response from Claude
 * @param {string} context - Description of what we're parsing (e.g., "evidence bundle")
 * @returns {Object} Parsed JSON object
 * @throws {Error} With actionable message including context and response preview
 */
function safeParseJson(response, context) {
  try {
    return JSON.parse(response);
  } catch (error) {
    // Truncate response for logging (avoid huge error messages)
    const preview = response.length > 500
      ? response.substring(0, 500) + '... [truncated]'
      : response;

    throw new Error(
      `Failed to parse ${context}: ${error.message}\n` +
      `Response preview: ${preview}`
    );
  }
}

/**
 * Get Claude client from config or use default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.claudeClient
 * @returns {Function} Claude client function
 */
function getClaudeClient(config) {
  return config?.configurable?.claudeClient || callClaude;
}

/**
 * Get PromptBuilder from config or create default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.promptBuilder
 * @returns {Object} PromptBuilder instance
 */
function getPromptBuilder(config) {
  return config?.configurable?.promptBuilder || createPromptBuilder();
}

/**
 * Get SchemaValidator from config or create default
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.schemaValidator
 * @returns {Object} SchemaValidator instance
 */
function getSchemaValidator(config) {
  return config?.configurable?.schemaValidator || new SchemaValidator();
}

/**
 * Curate evidence bundle from raw tokens and paper evidence
 *
 * Uses Claude to organize evidence into three layers:
 * - exposed: Evidence players actively discovered
 * - buried: Evidence that requires inference
 * - context: Timeline and metadata
 *
 * @param {Object} state - Current state with memoryTokens, paperEvidence, playerFocus
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with evidenceBundle, currentPhase, approval flags
 */
async function curateEvidenceBundle(state, config) {
  // Skip if already curated and approval cleared (resume case)
  if (state.evidenceBundle && !state.awaitingApproval) {
    return {
      currentPhase: PHASES.CURATE_EVIDENCE
    };
  }

  const claude = getClaudeClient(config);

  // Build curation prompt
  const systemPrompt = `You are curating evidence for a NovaNews investigative article.

Organize the evidence into three layers:
1. EXPOSED: Evidence that players actively discovered and investigated
2. BURIED: Evidence that requires inference or wasn't fully explored
3. CONTEXT: Timeline, relationships, and metadata

Weight evidence based on player focus - what they emphasized matters most.`;

  const userPrompt = `Curate this evidence based on player focus.

PLAYER FOCUS:
${JSON.stringify(state.playerFocus || {}, null, 2)}

MEMORY TOKENS:
${JSON.stringify(state.memoryTokens || [], null, 2)}

PAPER EVIDENCE:
${JSON.stringify(state.paperEvidence || [], null, 2)}

Return JSON with structure:
{
  "exposed": { "tokens": [...], "paperEvidence": [...] },
  "buried": { "transactions": [...], "relationships": [...] },
  "context": { "timeline": {...}, "playerFocus": {...}, "sessionMetadata": {...} },
  "curatorNotes": { "layerRationale": "...", "characterCoverage": {...} }
}`;

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'haiku',
    outputFormat: 'json'
  });

  const evidenceBundle = safeParseJson(response, 'evidence bundle from curateEvidenceBundle');

  return {
    evidenceBundle,
    currentPhase: PHASES.CURATE_EVIDENCE,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.EVIDENCE_BUNDLE
  };
}

/**
 * Analyze narrative arcs based on curated evidence
 *
 * Uses Claude to identify narrative arcs weighted by player emphasis.
 * The director's observations from whiteboard drive arc priority.
 *
 * @param {Object} state - Current state with evidenceBundle, directorNotes, sessionConfig
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with narrativeArcs, currentPhase, approval flags
 */
async function analyzeNarrativeArcs(state, config) {
  // Skip if already analyzed and approval cleared (resume case)
  if (state.narrativeArcs && state.narrativeArcs.length > 0 && !state.awaitingApproval) {
    return {
      currentPhase: PHASES.ANALYZE_ARCS
    };
  }

  const claude = getClaudeClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Build session data for prompt builder
  const sessionData = {
    roster: state.sessionConfig?.roster?.map(p => p.name) || [],
    accusation: state.sessionConfig?.accusation?.accused?.join(' and ') || 'Unknown',
    directorNotes: state.directorNotes || {},
    evidenceBundle: state.evidenceBundle || {}
  };

  const { systemPrompt, userPrompt } = await promptBuilder.buildArcAnalysisPrompt(sessionData);

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    outputFormat: 'json'
  });

  const arcAnalysis = safeParseJson(response, 'arc analysis from analyzeNarrativeArcs');

  return {
    narrativeArcs: arcAnalysis.narrativeArcs || [],
    currentPhase: PHASES.ANALYZE_ARCS,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARC_SELECTION,
    // Store full analysis for outline generation
    _arcAnalysisCache: arcAnalysis
  };
}

/**
 * Generate article outline from selected arcs
 *
 * Uses Claude to create structured outline with section placement,
 * evidence cards, photo suggestions, and pull quotes.
 *
 * @param {Object} state - Current state with selectedArcs, evidenceBundle, narrativeArcs
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with outline, currentPhase, approval flags
 */
async function generateOutline(state, config) {
  // Skip if already outlined and approval cleared (resume case)
  if (state.outline && !state.awaitingApproval) {
    return {
      currentPhase: PHASES.GENERATE_OUTLINE
    };
  }

  const claude = getClaudeClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Get arc analysis from cache or reconstruct from narrativeArcs
  const arcAnalysis = state._arcAnalysisCache || {
    narrativeArcs: state.narrativeArcs || [],
    characterPlacementOpportunities: {},
    rosterCoverage: { featured: [], mentioned: [], needsPlacement: [] },
    heroImageSuggestion: null
  };

  // Use first photo as hero image or default
  const heroImage = state.sessionPhotos?.[0]?.filename || 'evidence-board.png';

  const { systemPrompt, userPrompt } = await promptBuilder.buildOutlinePrompt(
    arcAnalysis,
    state.selectedArcs || [],
    heroImage,
    state.evidenceBundle || {}
  );

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    outputFormat: 'json'
  });

  const outline = safeParseJson(response, 'outline from generateOutline');

  return {
    outline,
    currentPhase: PHASES.GENERATE_OUTLINE,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.OUTLINE
  };
}

/**
 * Generate structured ContentBundle from approved outline
 *
 * Uses Claude with JSON schema for structured output.
 * Generates the complete article content in JSON format.
 *
 * @param {Object} state - Current state with outline, evidenceBundle
 * @param {Object} config - Graph config with optional configurable.contentBundleSchema
 * @returns {Object} Partial state update with contentBundle, currentPhase
 */
async function generateContentBundle(state, config) {
  // Skip if content bundle already exists (resume case or pre-populated)
  if (state.contentBundle) {
    return {
      currentPhase: PHASES.GENERATE_CONTENT
    };
  }

  const claude = getClaudeClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Load template for context (optional - article generation can proceed without it)
  const template = await promptBuilder.theme.loadTemplate().catch(err => {
    console.warn(`[generateContentBundle] Template load failed, proceeding without template context: ${err.message}`);
    return '';
  });

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    state.outline || {},
    state.evidenceBundle || {},
    template
  );

  // Get JSON schema for structured output
  const contentBundleSchema = config?.configurable?.contentBundleSchema ||
    require('../../schemas/content-bundle.schema.json');

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    outputFormat: 'json',
    jsonSchema: contentBundleSchema
  });

  const generatedContent = safeParseJson(response, 'content bundle from generateContentBundle');

  // Extract ContentBundle from response (may include voice_self_check)
  // State values take precedence over generated values for metadata
  const contentBundle = generatedContent.html
    ? { ...generatedContent, _voiceSelfCheck: generatedContent.voice_self_check }
    : {
        ...generatedContent,
        metadata: {
          ...generatedContent.metadata,
          sessionId: state.sessionId || generatedContent.metadata?.sessionId,
          theme: state.theme || generatedContent.metadata?.theme || 'journalist',
          generatedAt: new Date().toISOString()
        }
      };

  return {
    contentBundle,
    currentPhase: PHASES.GENERATE_CONTENT
  };
}

/**
 * Validate ContentBundle against JSON schema
 *
 * This is a deterministic validation node (no AI).
 * Uses SchemaValidator to check structure compliance.
 *
 * @param {Object} state - Current state with contentBundle
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase, possibly errors
 */
async function validateContentBundle(state, config) {
  const validator = getSchemaValidator(config);

  const result = validator.validate('content-bundle', state.contentBundle);

  if (!result.valid) {
    return {
      currentPhase: PHASES.ERROR,
      errors: result.errors.map(e => ({
        phase: PHASES.VALIDATE_SCHEMA,
        type: 'schema-validation',
        ...e
      }))
    };
  }

  return {
    currentPhase: PHASES.VALIDATE_SCHEMA
  };
}

/**
 * Validate article against voice requirements and anti-patterns
 *
 * Uses Claude to check:
 * - First-person participatory voice
 * - No em-dashes
 * - No game mechanics language
 * - Character roster coverage
 *
 * @param {Object} state - Current state with contentBundle or assembledHtml, sessionConfig
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with validationResults, currentPhase, voiceRevisionCount
 */
async function validateArticle(state, config) {
  const claude = getClaudeClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Get roster for coverage check
  const roster = state.sessionConfig?.roster?.map(p => p.name) || [];

  // Use assembled HTML if available, otherwise stringify contentBundle
  const articleContent = state.assembledHtml ||
    JSON.stringify(state.contentBundle, null, 2);

  const { systemPrompt, userPrompt } = await promptBuilder.buildValidationPrompt(
    articleContent,
    roster
  );

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'haiku',
    outputFormat: 'json'
  });

  const validationResults = safeParseJson(response, 'validation results from validateArticle');

  // Determine next phase based on validation
  const passed = validationResults.passed;
  const currentRevisions = state.voiceRevisionCount || 0;
  const maxRevisions = 2;

  // Calculate new revision count first to align phase with routing logic
  const newRevisionCount = currentRevisions + (passed ? 0 : 1);

  let nextPhase;
  if (passed || newRevisionCount >= maxRevisions) {
    // Complete if passed OR max revisions reached (including this one)
    nextPhase = PHASES.COMPLETE;
  } else {
    nextPhase = PHASES.REVISE_CONTENT;
  }

  return {
    validationResults,
    currentPhase: nextPhase,
    voiceRevisionCount: newRevisionCount
  };
}

/**
 * Revise ContentBundle based on validation feedback
 *
 * Uses Claude to make targeted fixes based on validation issues.
 * Preserves structure while fixing voice/style problems.
 *
 * @param {Object} state - Current state with contentBundle, validationResults
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with contentBundle, currentPhase
 */
async function reviseContentBundle(state, config) {
  const claude = getClaudeClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Build revision prompt from validation feedback
  const voiceSelfCheck = state.validationResults?.voice_notes ||
    state.contentBundle?._voiceSelfCheck ||
    'No specific feedback available';

  const articleContent = state.assembledHtml ||
    JSON.stringify(state.contentBundle, null, 2);

  const { systemPrompt, userPrompt } = await promptBuilder.buildRevisionPrompt(
    articleContent,
    voiceSelfCheck
  );

  const response = await claude({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    outputFormat: 'json'
  });

  const revised = safeParseJson(response, 'revised content from reviseContentBundle');

  // Update contentBundle or assembledHtml based on response
  const updatedBundle = revised.contentBundle || state.contentBundle;

  return {
    contentBundle: {
      ...updatedBundle,
      _revisionHistory: [
        ...(state.contentBundle?._revisionHistory || []),
        {
          timestamp: new Date().toISOString(),
          fixes: revised.fixes_applied || []
        }
      ]
    },
    assembledHtml: revised.html || state.assembledHtml,
    currentPhase: PHASES.GENERATE_CONTENT
  };
}

// ═══════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Create a mock Claude client for testing
 *
 * Returns a function that mimics callClaude behavior but returns
 * fixture data based on prompt content or schema.
 *
 * Mock data structure should match actual Claude response format.
 *
 * @param {Object} fixtures - Mock response data
 * @param {Object} fixtures.evidenceBundle - Response for evidence curation
 * @param {Object} fixtures.arcAnalysis - Response for arc analysis
 * @param {Object} fixtures.outline - Response for outline generation
 * @param {Object} fixtures.contentBundle - Response for content generation
 * @param {Object} fixtures.validationResults - Response for validation
 * @param {Object} fixtures.revision - Response for revision
 * @returns {Function} Mock client with getCalls() and getLastCall() methods
 */
function createMockClaudeClient(fixtures = {}) {
  const callLog = [];

  async function mockCallClaude(options) {
    callLog.push({
      ...options,
      timestamp: new Date().toISOString()
    });

    const { prompt, systemPrompt, jsonSchema } = options;
    const promptLower = (prompt || '').toLowerCase();
    const systemLower = (systemPrompt || '').toLowerCase();

    // Match based on prompt content or schema
    // Order matters: more specific matches first, schema matches take priority

    // Content bundle generation - schema match is most reliable
    if (
      jsonSchema?.$id === 'content-bundle' ||
      (promptLower.includes('generate article') && !promptLower.includes('generate outline')) ||
      systemLower.includes('article generation')
    ) {
      return JSON.stringify(fixtures.contentBundle || getDefaultContentBundle());
    }

    if (promptLower.includes('curate') || systemLower.includes('curating evidence')) {
      return JSON.stringify(fixtures.evidenceBundle || getDefaultEvidenceBundle());
    }

    if (promptLower.includes('narrative arc') || systemLower.includes('analyzing narrative')) {
      return JSON.stringify(fixtures.arcAnalysis || getDefaultArcAnalysis());
    }

    // Outline generation - check for "generate outline" or just "outline" in prompt
    if (
      promptLower.includes('generate outline') ||
      systemLower.includes('creating an article outline') ||
      (promptLower.includes('outline') && !promptLower.includes('from outline'))
    ) {
      return JSON.stringify(fixtures.outline || getDefaultOutline());
    }

    if (promptLower.includes('validate') || systemLower.includes('validating')) {
      return JSON.stringify(fixtures.validationResults || getDefaultValidationResults());
    }

    if (promptLower.includes('revise') || systemLower.includes('revising')) {
      return JSON.stringify(fixtures.revision || getDefaultRevision());
    }

    // Fallback: return empty object
    console.warn('[MockClaudeClient] No fixture matched prompt:', promptLower.substring(0, 50));
    return JSON.stringify({});
  }

  // Attach call tracking methods
  mockCallClaude.getCalls = () => [...callLog];
  mockCallClaude.getLastCall = () => callLog[callLog.length - 1] || null;
  mockCallClaude.clearCalls = () => { callLog.length = 0; };

  return mockCallClaude;
}

/**
 * Create a mock PromptBuilder for testing
 *
 * Returns an object that mimics PromptBuilder methods but returns
 * simple test prompts without loading from filesystem.
 *
 * @returns {Object} Mock PromptBuilder instance
 */
function createMockPromptBuilder() {
  const mockTheme = {
    loadTemplate: async () => '<html>{{content}}</html>',
    loadPhasePrompts: async (phase) => ({
      'character-voice': 'Test character voice prompt',
      'evidence-boundaries': 'Test evidence boundaries prompt',
      'narrative-structure': 'Test narrative structure prompt',
      'anti-patterns': 'Test anti-patterns prompt',
      'section-rules': 'Test section rules prompt',
      'editorial-design': 'Test editorial design prompt',
      'formatting': 'Test formatting prompt',
      'writing-principles': 'Test writing principles prompt'
    }),
    validate: async () => ({ valid: true, missing: [] })
  };

  return {
    theme: mockTheme,

    async buildArcAnalysisPrompt(sessionData) {
      return {
        systemPrompt: 'Mock system prompt for arc analysis',
        userPrompt: `Analyze arcs for ${sessionData.roster?.join(', ') || 'unknown roster'}`
      };
    },

    async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, evidenceBundle) {
      return {
        systemPrompt: 'Mock system prompt for outline generation',
        userPrompt: `Generate outline for arcs: ${selectedArcs?.join(', ') || 'none selected'}`
      };
    },

    async buildArticlePrompt(outline, evidenceBundle, template) {
      return {
        systemPrompt: 'Mock system prompt for article generation',
        userPrompt: `Generate article from outline with ${Object.keys(outline).length} sections`
      };
    },

    async buildValidationPrompt(articleHtml, roster) {
      return {
        systemPrompt: 'Mock system prompt for validation',
        userPrompt: `Validate article for roster: ${roster?.join(', ') || 'unknown roster'}`
      };
    },

    async buildRevisionPrompt(articleHtml, voiceSelfCheck) {
      return {
        systemPrompt: 'Mock system prompt for revision',
        userPrompt: `Revise based on: ${voiceSelfCheck}`
      };
    }
  };
}

// Default fixture generators for mock client
function getDefaultEvidenceBundle() {
  return {
    exposed: { tokens: [], paperEvidence: [] },
    buried: { transactions: [], relationships: [] },
    context: { timeline: {}, playerFocus: {}, sessionMetadata: {} },
    curatorNotes: { layerRationale: 'Default test bundle', characterCoverage: {} }
  };
}

function getDefaultArcAnalysis() {
  return {
    narrativeArcs: [
      { name: 'Test Arc', playerEmphasis: 'HIGH', evidenceTokens: [], charactersFeatured: [], summary: 'Test' }
    ],
    characterPlacementOpportunities: {},
    rosterCoverage: { featured: [], mentioned: [], needsPlacement: [] },
    heroImageSuggestion: null
  };
}

function getDefaultOutline() {
  return {
    lede: { hook: 'Test hook', keyTension: 'Test tension' },
    theStory: { arcs: [] },
    followTheMoney: { shellAccounts: [] },
    thePlayers: { exposed: [], buried: [], pullQuotes: [] },
    whatsMissing: { buriedMarkers: [] },
    closing: { systemicAngle: 'Test angle', accusationHandling: 'Test handling' },
    visualComponentCount: { evidenceCards: 0, photos: 0, pullQuotes: 0, buriedMarkers: 0 }
  };
}

function getDefaultContentBundle() {
  return {
    metadata: {
      sessionId: 'test-session',
      theme: 'journalist',
      generatedAt: new Date().toISOString()
    },
    headline: { main: 'Test Headline for Validation' },
    sections: [{ id: 'test', type: 'narrative', content: [{ type: 'paragraph', text: 'Test content' }] }]
  };
}

function getDefaultValidationResults() {
  return {
    passed: true,
    issues: [],
    voice_score: 4,
    voice_notes: 'Test validation passed',
    roster_coverage: { featured: [], mentioned: [], missing: [] },
    systemic_critique_present: true,
    blake_handled_correctly: true
  };
}

function getDefaultRevision() {
  return {
    contentBundle: getDefaultContentBundle(),
    fixes_applied: ['Test fix applied']
  };
}

module.exports = {
  // Node functions
  curateEvidenceBundle,
  analyzeNarrativeArcs,
  generateOutline,
  generateContentBundle,
  validateContentBundle,
  validateArticle,
  reviseContentBundle,

  // Testing utilities
  createMockClaudeClient,
  createMockPromptBuilder,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getClaudeClient,
    getPromptBuilder,
    getSchemaValidator,
    getDefaultEvidenceBundle,
    getDefaultArcAnalysis,
    getDefaultOutline,
    getDefaultContentBundle,
    getDefaultValidationResults,
    getDefaultRevision
  }
};
