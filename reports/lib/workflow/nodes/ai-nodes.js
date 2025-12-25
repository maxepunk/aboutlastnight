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
const { SchemaValidator } = require('../../schema-validator');
const { createPromptBuilder } = require('../../prompt-builder');
const { safeParseJson, getSdkClient } = require('./node-helpers');
// Import consolidated mock from test mocks (avoids duplication)
const { createMockSdkClient, createMockClaudeClient } = require('../../../__tests__/mocks/sdk-client.mock');

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
 * Curate evidence bundle from PREPROCESSED evidence summaries
 *
 * Uses Claude to ORGANIZE (not summarize) preprocessed evidence into three layers:
 * - exposed: Evidence players actively discovered (critical/supporting, narrativeRelevance: true)
 * - buried: Evidence that requires inference (supporting/contextual)
 * - context: Timeline and metadata (background/contextual)
 *
 * COMMIT 8.5 UPDATE: Now uses state.preprocessedEvidence instead of raw tokens.
 * The preprocessing phase (1.7) batch-summarizes evidence using Haiku.
 * This allows processing 100+ items without timeout.
 *
 * @param {Object} state - Current state with preprocessedEvidence, playerFocus
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

  const sdk = getSdkClient(config);

  // Use preprocessed evidence (Commit 8.5)
  const preprocessed = state.preprocessedEvidence || {
    items: [],
    playerFocus: state.playerFocus || {}
  };

  // If no preprocessed items, create empty evidence bundle
  if (!preprocessed.items || preprocessed.items.length === 0) {
    console.log('[curateEvidenceBundle] No preprocessed evidence - creating empty bundle');
    return {
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [], relationships: [] },
        context: {
          timeline: {},
          playerFocus: state.playerFocus || {},
          sessionMetadata: { sessionId: state.sessionId }
        },
        curatorNotes: {
          layerRationale: 'No evidence to curate',
          characterCoverage: {}
        }
      },
      currentPhase: PHASES.CURATE_EVIDENCE,
      awaitingApproval: true,
      approvalType: APPROVAL_TYPES.EVIDENCE_BUNDLE
    };
  }

  // Build curation prompt using preprocessed summaries
  const systemPrompt = `You are curating PREPROCESSED evidence for a NovaNews investigative article.

═══════════════════════════════════════════════════════════════════
CRITICAL: EVIDENCE BOUNDARY RULES (MUST FOLLOW)
═══════════════════════════════════════════════════════════════════

Each evidence item has a "disposition" field that determines which layer it belongs to:

disposition: 'exposed' → EXPOSED LAYER
- These were submitted to the Detective/Reporter (public record)
- You CAN include: content, owner (whose POV), characterRefs, narrativeTimeline
- You CANNOT include: who brought it (operator) - reporter protects sources

disposition: 'buried' → BURIED LAYER
- These were sold to Black Market (private, promised discretion)
- You CAN include: transaction time, shell account, dollar amount
- You CANNOT include: owner, content, narrative timeline, characterRefs
- Operator can be INFERRED from session timing + director observations

TIMELINE DISTINCTION:
- NARRATIVE TIMELINE = when events in memory occurred (Feb 2025, 2009, etc.)
- SESSION TIMELINE = when tokens were sold during game night (11:21 PM, etc.)
For buried items, only SESSION TIMELINE (transaction time) is accessible.

WRONG (buried token in output):
  { "id": "ALR002", "summary": "Alex's memory shows...", "characterRefs": ["Alex"] }
  WHY WRONG: Cannot reference owner or content for buried tokens

CORRECT (buried token in output):
  { "id": "ALR002", "summary": "Transaction of $75K to Gorlan at 11:21 PM" }
  WHY CORRECT: Only transaction data, no owner/content attribution

═══════════════════════════════════════════════════════════════════

Your job is to ORGANIZE evidence into three layers based on disposition:
1. EXPOSED: Items with disposition='exposed' - full content accessible
2. BURIED: Items with disposition='buried' - transaction data only
3. CONTEXT: Timeline synthesis, metadata, player focus summary

Weight evidence based on player focus. DO NOT re-summarize exposed items.
For buried items, REPLACE any content/owner summaries with transaction-only data.`;

  const userPrompt = `Organize this preprocessed evidence based on disposition and player focus.

PLAYER FOCUS:
${JSON.stringify(preprocessed.playerFocus || state.playerFocus || {}, null, 2)}

PREPROCESSED EVIDENCE (${preprocessed.items.length} items):
${JSON.stringify(preprocessed.items, null, 2)}

IMPORTANT: Check each item's "disposition" field to determine placement:
- disposition: 'exposed' → exposed layer (full data)
- disposition: 'buried' → buried layer (transaction data ONLY - strip owner/content)
- disposition: 'unknown' → use significance to place appropriately

Return JSON with structure:
{
  "exposed": {
    "tokens": [{ "id": "...", "summary": "...", "significance": "...", "characterRefs": [...], ... }],
    "paperEvidence": [{ "id": "...", "summary": "...", "significance": "...", ... }]
  },
  "buried": {
    "transactions": [{ "id": "...", "sessionTransactionTime": "...", "shellAccount": "...", "amount": ..., "summary": "Transaction only - no content" }],
    "relationships": []
  },
  "context": {
    "narrativeTimeline": { "yearOrPeriod": "event description (from exposed only)" },
    "sessionTimeline": { "time": "transaction description (from buried)" },
    "playerFocus": { ... },
    "sessionMetadata": { ... }
  },
  "curatorNotes": {
    "layerRationale": "explanation of curation decisions",
    "characterCoverage": { "characterName": "coverage level", ... },
    "boundaryViolationCheck": "confirm no buried content/owner leaked to output"
  }
}`;

  // Use longer timeout for large evidence sets (101 items takes ~3-4 minutes)
  const evidenceBundle = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'haiku',
    timeoutMs: 5 * 60 * 1000, // 5 minutes for large evidence sets
    label: `Curating ${preprocessed.items.length} evidence items`,
    jsonSchema: {
      type: 'object',
      properties: {
        exposed: { type: 'object' },
        buried: { type: 'object' },
        context: { type: 'object' },
        curatorNotes: { type: 'object' }
      },
      required: ['exposed', 'buried', 'context']
    }
  });

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

  const sdk = getSdkClient(config);
  const promptBuilder = getPromptBuilder(config);

  // Build session data for prompt builder
  const sessionData = {
    roster: state.sessionConfig?.roster?.map(p => p.name) || [],
    accusation: state.sessionConfig?.accusation?.accused?.join(' and ') || 'Unknown',
    directorNotes: state.directorNotes || {},
    evidenceBundle: state.evidenceBundle || {}
  };

  const { systemPrompt, userPrompt } = await promptBuilder.buildArcAnalysisPrompt(sessionData);

  const arcAnalysis = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        narrativeArcs: { type: 'array' },
        characterPlacementOpportunities: { type: 'object' },
        rosterCoverage: { type: 'object' },
        heroImageSuggestion: {}
      },
      required: ['narrativeArcs']
    }
  });

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

  const sdk = getSdkClient(config);
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

  const outline = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        lede: { type: 'object' },
        theStory: { type: 'object' },
        followTheMoney: { type: 'object' },
        thePlayers: { type: 'object' },
        whatsMissing: { type: 'object' },
        closing: { type: 'object' },
        visualComponentCount: { type: 'object' }
      },
      required: ['lede', 'theStory']
    }
  });

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

  const sdk = getSdkClient(config);
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

  // SDK returns parsed object directly when jsonSchema is provided
  const generatedContent = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'opus',
    jsonSchema: contentBundleSchema
  });

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
  const sdk = getSdkClient(config);
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

  const validationResults = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'haiku',
    jsonSchema: {
      type: 'object',
      properties: {
        passed: { type: 'boolean' },
        issues: { type: 'array' },
        voice_score: { type: 'number' },
        voice_notes: { type: 'string' },
        roster_coverage: { type: 'object' },
        systemic_critique_present: { type: 'boolean' },
        blake_handled_correctly: { type: 'boolean' }
      },
      required: ['passed', 'issues']
    }
  });

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
  const sdk = getSdkClient(config);
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

  const revised = await sdk({
    prompt: userPrompt,
    systemPrompt,
    model: 'sonnet',
    jsonSchema: {
      type: 'object',
      properties: {
        contentBundle: { type: 'object' },
        html: { type: 'string' },
        fixes_applied: { type: 'array' }
      }
    }
  });

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

// createMockSdkClient and createMockClaudeClient are imported from
// __tests__/mocks/sdk-client.mock.js at the top of this file.
// This consolidation removes ~150 lines of duplicate mock logic.

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
  createMockSdkClient,
  createMockClaudeClient,  // Backward compatibility alias
  createMockPromptBuilder,

  // Internal functions for testing
  _testing: {
    safeParseJson,
    getSdkClient,
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
