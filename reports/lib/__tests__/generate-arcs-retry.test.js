/**
 * The arc writer's one call: single attempt + fail-loud (TRC-2 / N7)
 *
 * The in-node MAX_GENERATION_ATTEMPTS retry loop was REMOVED (TRC-2 de-layering):
 * analyzeArcsPlayerFocusGuided makes a SINGLE call, and any failure (timeout or not)
 * propagates to the node's outer catch, which THROWS rather than storing an empty
 * output. The graph-level retryPolicy is the sole retrier.
 *
 * Phase 4 (brief 4.4): the call writes the weave, in one call with no interweaving call
 * after it.
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

const WEAVE = {
  story: 'The room named Alex.', question: 'Why Alex?', headline: 'The Room Named Alex',
  threads: [{ id: 't1', name: 'The verdict', line: 'The room named Alex for the embezzlement.', role: 'main-thread', verdict: true, evidence: [{ sources: ['ledger'], shows: 'A sale on the ledger.', stance: 'supports' }] }],
  connections: [], convergence: 'The money and the vote meet.', questions: []
};

const makeState = () => ({
  weave: null,
  evidenceBundle: {
    exposed: { tokens: [{ id: 't1', summary: 'test', fullDescription: 'test desc' }], paperEvidence: [] },
    buried: { transactions: [], relationships: [] }
  },
  playerFocus: { accusation: { accused: ['Alex'], charge: 'embezzlement' }, whiteboardContext: {} },
  sessionConfig: { roster: ['Alex', 'Sarah'] },
  directorNotes: { observations: { behaviorPatterns: ['test'], suspiciousCorrelations: [], notableMoments: [] } },
  theme: 'journalist'
});

describe('the arc writer — single attempt + fail-loud', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  test('succeeds in a single attempt (no in-node retry, no second call)', async () => {
    const mockSdk = jest.fn().mockResolvedValueOnce(JSON.parse(JSON.stringify(WEAVE)));

    const result = await analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result.weave.threads.length).toBe(1);
    expect(mockSdk).toHaveBeenCalledTimes(1);
  });

  test('throws on timeout (single attempt — retryPolicy is the sole retrier)', async () => {
    const timeoutError = new Error('SDK timeout after 600.0s (limit: 600s) - The weave');
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

  test('throws when the SDK returns valid JSON with no threads', async () => {
    const mockSdk = jest.fn().mockResolvedValueOnce({ ...WEAVE, threads: [] });

    await expect(
      analyzeArcsPlayerFocusGuided(makeState(), { configurable: { sdkClient: mockSdk } })
    ).rejects.toThrow(/arc analysis failed.*no threads/i);

    expect(mockSdk).toHaveBeenCalledTimes(1); // No retry — "no threads" still single attempt
  });
});
