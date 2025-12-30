/**
 * Preprocess Nodes - Evidence preprocessing for report generation workflow
 *
 * Handles the evidence preprocessing phase (1.7) of the pipeline:
 * - preprocessEvidence: Batch-summarize memory tokens and paper evidence
 *
 * Added in Commit 8.5 to address scalability gap discovered during manual validation.
 * The original curateEvidenceBundle timed out with 100+ tokens because it tried
 * to process all evidence in a single Claude call.
 *
 * Solution: Batch-process evidence with Haiku (8 items × 4 concurrent) before
 * theme-specific curation, producing a universal preprocessed format.
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants for currentPhase values
 * - Support skip logic for resume
 *
 * See ARCHITECTURE_DECISIONS.md 8.5.1-8.5.5 for design rationale.
 */

const { PHASES } = require('../state');
const {
  createEvidencePreprocessor,
  createMockPreprocessor,
  _testing: { createEmptyResult }
} = require('../../evidence-preprocessor');
const { sdkQuery } = require('../../llm');
const { traceNode } = require('../../observability');

/**
 * Get EvidencePreprocessor from config or create default instance
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.preprocessor
 * @returns {Object} EvidencePreprocessor instance
 */
function getPreprocessor(config) {
  if (config?.configurable?.preprocessor) {
    return config.configurable.preprocessor;
  }

  // Use mock in testing environment
  if (config?.configurable?.useMockPreprocessor) {
    return createMockPreprocessor(config.configurable.mockPreprocessorData || {});
  }

  // Create real preprocessor with SDK client
  const sdk = config?.configurable?.sdkClient || sdkQuery;
  return createEvidencePreprocessor({ sdkClient: sdk });
}

/**
 * Preprocess evidence items for curation (pure data processing, no checkpoint)
 *
 * Batch-processes memory tokens and paper evidence using Haiku for fast
 * summarization. Produces a universal preprocessed format that all themes
 * can use for their specific curation logic.
 *
 * Checkpoint is handled by dedicated checkpointPreCuration node.
 *
 * Batch parameters:
 * - 8 items per batch
 * - 4 concurrent batches
 * - ~3 minutes for 150+ items
 *
 * @param {Object} state - Current state with memoryTokens, paperEvidence, playerFocus
 * @param {Object} config - Graph config with optional configurable.preprocessor
 * @returns {Object} Partial state update with preprocessedEvidence, currentPhase
 */
async function preprocessEvidence(state, config) {
  // Skip if already preprocessed (resume case)
  if (state.preprocessedEvidence) {
    console.log('[preprocessEvidence] Skipping - preprocessedEvidence already exists');
    return {
      currentPhase: PHASES.PREPROCESS_EVIDENCE
    };
  }

  // Use selectedPaperEvidence if user has made a selection, otherwise fall back to all paperEvidence
  const effectivePaperEvidence = state.selectedPaperEvidence || state.paperEvidence || [];

  // Skip if no evidence to preprocess
  const hasTokens = state.memoryTokens && state.memoryTokens.length > 0;
  const hasEvidence = effectivePaperEvidence.length > 0;

  if (!hasTokens && !hasEvidence) {
    console.log('[preprocessEvidence] Skipping - no evidence to preprocess');
    return {
      preprocessedEvidence: createEmptyResult(state.sessionId, Date.now()),
      currentPhase: PHASES.PREPROCESS_EVIDENCE
    };
  }

  const preprocessor = getPreprocessor(config);

  try {
    console.log(`[preprocessEvidence] Processing ${state.memoryTokens?.length || 0} tokens and ${effectivePaperEvidence.length} evidence items${state.selectedPaperEvidence ? ' (user-selected subset)' : ''}`);

    const preprocessedEvidence = await preprocessor.process({
      memoryTokens: state.memoryTokens || [],
      paperEvidence: effectivePaperEvidence,
      playerFocus: state.playerFocus || {},
      sessionId: state.sessionId
    });

    console.log(`[preprocessEvidence] Complete: ${preprocessedEvidence.items.length} items preprocessed in ${preprocessedEvidence.stats.processingTimeMs}ms`);

    return {
      preprocessedEvidence,
      currentPhase: PHASES.PREPROCESS_EVIDENCE
    };

  } catch (error) {
    console.error('[preprocessEvidence] Error:', error.message);

    return {
      preprocessedEvidence: createEmptyResult(state.sessionId, Date.now()),
      errors: [{
        phase: PHASES.PREPROCESS_EVIDENCE,
        type: 'preprocessing-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

module.exports = {
  // Main node function (wrapped with LangSmith tracing)
  preprocessEvidence: traceNode(preprocessEvidence, 'preprocessEvidence', {
    stateFields: ['memoryTokens', 'paperEvidence']
  }),

  // Mock factory for testing
  createMockPreprocessor,

  // Export for testing
  _testing: {
    getPreprocessor
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Preprocess Nodes Self-Test\n');

  // Test with mock preprocessor
  const mockConfig = {
    configurable: {
      useMockPreprocessor: true,
      mockPreprocessorData: {
        summaryPrefix: 'Self-test'
      }
    }
  };

  const mockState = {
    sessionId: 'self-test-session',
    memoryTokens: [
      { id: 'token-1', type: 'Memory Token Video' },
      { id: 'token-2', type: 'Memory Token Image' }
    ],
    paperEvidence: [
      { id: 'evidence-1', type: 'Prop' }
    ],
    playerFocus: {
      primaryInvestigation: 'Self-test investigation'
    }
  };

  console.log('Testing preprocessEvidence with mock...');
  preprocessEvidence(mockState, mockConfig).then(result => {
    console.log('Result currentPhase:', result.currentPhase);
    console.log('Items preprocessed:', result.preprocessedEvidence?.items?.length || 0);
    console.log('First item summary:', result.preprocessedEvidence?.items?.[0]?.summary);
    console.log('Stats:', JSON.stringify(result.preprocessedEvidence?.stats, null, 2));
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });

  // Test skip logic
  console.log('\nTesting skip logic...');
  const alreadyProcessedState = {
    ...mockState,
    preprocessedEvidence: { items: [{ id: 'existing' }] }
  };

  preprocessEvidence(alreadyProcessedState, mockConfig).then(result => {
    console.log('Skip logic result - currentPhase:', result.currentPhase);
    console.log('Skip logic result - preprocessedEvidence modified:', result.preprocessedEvidence !== undefined);
  });
}
