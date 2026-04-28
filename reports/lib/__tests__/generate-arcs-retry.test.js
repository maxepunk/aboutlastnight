/**
 * generateCoreArcs retry-at-source test
 *
 * Verifies that analyzeArcsPlayerFocusGuided retries on timeout errors
 * (up to 3 attempts) but fails immediately on non-timeout errors.
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

describe('generateCoreArcs retry-at-source', () => {
  test('retries on first timeout, succeeds on second attempt', async () => {
    const mockSdk = jest.fn()
      .mockRejectedValueOnce(new Error('SDK timeout after 600.0s (limit: 600s) - Core arc generation (Call 1)'))
      .mockResolvedValueOnce({
        narrativeArcs: [{ id: 'arc-1', title: 'Test', arcSource: 'accusation', keyEvidence: ['t1'], characterPlacements: {}, analysisNotes: {} }],
        synthesisNotes: 'test'
      })
      .mockResolvedValueOnce(null); // Call 2: interweaving (graceful degradation — null is fine)

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.narrativeArcs.length).toBe(1);
    expect(result._arcAnalysisCache.timing.retries).toBe(1);
    expect(result._arcAnalysisCache._generationTimedOut).toBeUndefined();
    expect(mockSdk).toHaveBeenCalledTimes(3); // 1 timeout + 1 Call 1 success + 1 Call 2 interweaving
  });

  test('all 3 attempts fail with timeout', async () => {
    const timeoutError = new Error('SDK timeout after 600.0s (limit: 600s) - Core arc generation (Call 1)');
    const mockSdk = jest.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError)
      .mockRejectedValueOnce(timeoutError);

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.narrativeArcs).toEqual([]);
    expect(result._arcAnalysisCache._generationTimedOut).toBe(true);
    expect(mockSdk).toHaveBeenCalledTimes(3);
  });

  test('does NOT retry on non-timeout error', async () => {
    const mockSdk = jest.fn()
      .mockRejectedValueOnce(new Error('Connection refused'));

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.narrativeArcs).toEqual([]);
    expect(result._arcAnalysisCache._generationTimedOut).toBe(false);
    expect(mockSdk).toHaveBeenCalledTimes(1);
  });

  test('does NOT retry when SDK returns valid JSON but 0 arcs', async () => {
    // generateCoreArcs throws "Call 1 returned no arcs" which is not a timeout
    const mockSdk = jest.fn()
      .mockResolvedValueOnce({ narrativeArcs: [], synthesisNotes: 'empty' });

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.narrativeArcs).toEqual([]);
    expect(result._arcAnalysisCache._generationTimedOut).toBe(false);
    expect(mockSdk).toHaveBeenCalledTimes(1); // No retry — "no arcs" is not a timeout
  });
});
