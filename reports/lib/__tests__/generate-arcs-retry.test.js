/**
 * Core arc generation — single-attempt + fail-loud (TRC-2 / N7)
 *
 * The in-node MAX_GENERATION_ATTEMPTS retry loop was REMOVED (TRC-2 de-layering):
 * analyzeArcsPlayerFocusGuided now makes a SINGLE Core arc generation call, and any
 * failure (timeout or not) propagates to the node's outer catch, which THROWS rather
 * than returning narrativeArcs: []. The graph-level retryPolicy is the sole retrier.
 *
 * These tests verify the single-attempt success path (no retry) and that every failure
 * mode throws (no [] arcs masking an outage).
 */

// Mock LLM module
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn(),
  isSdkTimeoutError: (err) => Boolean(err && typeof err.message === 'string' && /SDK timeout after/.test(err.message))
}));

// Mock observability
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { analyzeArcsPlayerFocusGuided } = require('../workflow/nodes/arc-specialist-nodes');

const makeState = () => ({
  narrativeArcs: [],
  evidenceBundle: {
    exposed: { tokens: [{ id: 't1', summary: 'test', fullDescription: 'test desc' }], paperEvidence: [] },
    buried: { transactions: [], relationships: [] }
  },
  playerFocus: { accusation: { accused: ['Alex'], charge: 'embezzlement' }, whiteboardContext: {} },
  sessionConfig: { roster: ['Alex', 'Sarah'] },
  directorNotes: { observations: { behaviorPatterns: ['test'], suspiciousCorrelations: [], notableMoments: [] } },
  theme: 'journalist'
});

describe('core arc generation — single attempt + fail-loud', () => {
  test('succeeds in a single attempt (no in-node retry)', async () => {
    const mockSdk = jest.fn()
      .mockResolvedValueOnce({
        narrativeArcs: [{ id: 'arc-1', title: 'Test', arcSource: 'accusation', keyEvidence: ['t1'], characterPlacements: {}, analysisNotes: {} }],
        synthesisNotes: 'test'
      })
      .mockResolvedValueOnce(null); // Call 2: interweaving (graceful degradation — null is fine)

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.narrativeArcs.length).toBe(1);
    expect(result._arcAnalysisCache.timing.retries).toBe(0);
    expect(mockSdk).toHaveBeenCalledTimes(2); // 1 Call 1 success + 1 Call 2 interweaving — no retry
  });

  test('throws on timeout (single attempt — retryPolicy is the sole retrier)', async () => {
    const timeoutError = new Error('SDK timeout after 600.0s (limit: 600s) - Core arc generation (Call 1)');
    const mockSdk = jest.fn().mockRejectedValue(timeoutError);

    await expect(
      analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } })
    ).rejects.toThrow(/arc analysis failed \(timeout\)/i);

    expect(mockSdk).toHaveBeenCalledTimes(1); // single attempt, no in-node retry
  });

  test('throws on non-timeout error', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } })
    ).rejects.toThrow(/arc analysis failed/i);

    expect(mockSdk).toHaveBeenCalledTimes(1);
  });

  test('throws when SDK returns valid JSON but 0 arcs', async () => {
    // generateCoreArcs returns 0 arcs → "Call 1 returned no arcs" → outer catch throws
    const mockSdk = jest.fn().mockResolvedValueOnce({ narrativeArcs: [], synthesisNotes: 'empty' });

    await expect(
      analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } })
    ).rejects.toThrow(/arc analysis failed/i);

    expect(mockSdk).toHaveBeenCalledTimes(1); // No retry — "no arcs" still single attempt
  });
});
