/**
 * Arc Specialist Nodes Fail-Loud Tests (N7)
 *
 * Covers analyzeArcsPlayerFocusGuided's total-failure behavior:
 * - When the Core arc generation SDK call fails, the node must THROW rather than
 *   return narrativeArcs: [] + currentPhase: ARC_SYNTHESIS. Returning [] arcs makes an
 *   outage indistinguishable from "genuinely no arcs" at the empty arc-selection screen,
 *   and force-forward can carry [] into the article.
 * - Throwing leaves the clean pre-node checkpoint snapshot for operator /resume, and lets
 *   the graph-level retryPolicy retry transient failures (it is the SOLE retrier now that
 *   the in-node MAX_GENERATION_ATTEMPTS loop was removed — TRC-2 de-layering).
 *
 * Mock pattern matches the working generate-arcs-retry.test.js: mock ../llm (so the node's
 * isSdkTimeoutError import resolves) and ../observability (full no-op shape). The SDK is
 * injected via config.configurable.sdkClient so a rejected call drives generateCoreArcs's
 * own catch → the surviving outer catch → the new throw.
 */

// Mock LLM module (provides isSdkTimeoutError used by the surviving catch)
jest.mock('../../../lib/llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn(),
  isSdkTimeoutError: (err) => Boolean(err && typeof err.message === 'string' && /SDK timeout after/.test(err.message))
}));

// Mock observability (full no-op shape — matches working arc tests)
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { analyzeArcsPlayerFocusGuided: analyzeArcs } = require('../../../lib/workflow/nodes/arc-specialist-nodes');

describe('analyzeArcs fail-loud (N7)', () => {
  test('throws on SDK failure instead of returning [] arcs', async () => {
    const mockSdk = jest.fn().mockRejectedValue(new Error('overloaded_error'));
    const state = {
      narrativeArcs: null,
      evidenceBundle: {
        exposed: { tokens: [{ id: 't1', summary: 'test', fullDescription: 'test desc' }], paperEvidence: [] },
        buried: { transactions: [], relationships: [] }
      },
      playerFocus: { accusation: { accused: ['Alex'], charge: 'embezzlement' }, whiteboardContext: {} },
      sessionConfig: { roster: ['Alex'] },
      canonicalCharacters: {},
      sessionId: 'TEST'
    };

    await expect(analyzeArcs(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/arc|overloaded/i);

    // Confirm the SDK was actually exercised (the throw came from the real failure path,
    // not a silent early-return/skip before the SDK call).
    expect(mockSdk).toHaveBeenCalled();
  });
});
