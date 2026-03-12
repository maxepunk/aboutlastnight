/**
 * Tests for evidence curation SRP split
 * Verifies curateEvidenceBundle does NOT call interrupt()
 */

// Mock dependencies
jest.mock('../../lib/llm', () => ({
  sdkQuery: jest.fn()
}));

jest.mock('../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

describe('curateEvidenceBundle SRP', () => {
  test('curateEvidenceBundle returns evidenceBundle without interrupting', async () => {
    // Import after mocks
    const aiNodes = require('../workflow/nodes/ai-nodes');

    // The function should be accessible - check both exports and _testing
    const curateEvidenceBundle = aiNodes.curateEvidenceBundle || aiNodes._testing?.curateEvidenceBundle;

    // With empty preprocessed evidence, it should create an empty bundle and return
    // WITHOUT calling interrupt() (which would throw GraphInterrupt)
    const state = {
      preprocessedEvidence: {
        items: [],
        playerFocus: {}
      },
      sessionId: 'test-session'
    };

    const config = {
      configurable: {
        sdkClient: jest.fn()
      }
    };

    // If this throws GraphInterrupt, the SRP split is incomplete
    const result = await curateEvidenceBundle(state, config);
    expect(result.evidenceBundle).toBeDefined();
    expect(result.evidenceBundle.exposed).toBeDefined();
    expect(result.evidenceBundle.buried).toBeDefined();
  });

  test('curateEvidenceBundle skips when evidenceBundle already exists', async () => {
    const aiNodes = require('../workflow/nodes/ai-nodes');
    const curateEvidenceBundle = aiNodes.curateEvidenceBundle || aiNodes._testing?.curateEvidenceBundle;

    const state = {
      evidenceBundle: { exposed: { tokens: [] }, buried: { transactions: [] } },
      sessionId: 'test-session'
    };

    const result = await curateEvidenceBundle(state, {});
    expect(result.currentPhase).toBeDefined();
    // Should not re-run curation
    expect(result.evidenceBundle).toBeUndefined();
  });
});
