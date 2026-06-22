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

    // SRP guarantee: curateEvidenceBundle runs the REAL curation path and returns a
    // bundle WITHOUT calling interrupt() (which would throw GraphInterrupt).
    //
    // N3 fail-loud (P3.4) removed the empty-items fast-path this test used as a
    // shortcut, so we now exercise a POPULATED preprocessedEvidence fixture with an
    // injected mock sdkClient (matching the working populated-curation test in
    // __tests__/unit/workflow/ai-nodes.test.js 'calls SDK ... batched curation').
    const mockPreprocessedEvidence = require('../../__tests__/fixtures/mock-responses/preprocessed-evidence.json');
    const mockEvidenceBundle = require('../../__tests__/fixtures/mock-responses/evidence-bundle.json');
    const { createMockSdkClient } = require('../../__tests__/mocks/llm-client.mock');

    const state = {
      preprocessedEvidence: mockPreprocessedEvidence,
      sessionId: 'test-session'
    };

    const config = {
      configurable: {
        sdkClient: createMockSdkClient({ evidenceBundle: mockEvidenceBundle })
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
