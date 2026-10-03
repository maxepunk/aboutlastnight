/**
 * reviseArcs timeout recovery test
 *
 * A rework that times out keeps the weave it started from instead of losing it, as a
 * free retry. Phase 4 (brief 4.4): the weave stays in its channel (the rework writes
 * none), and the timeout bookkeeping has a channel of its own, `_arcReworkTimeout`.
 */

// Mock LLM module
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));

// Mock observability
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');

const WEAVE = {
  story: 'The room named Vic.', question: 'Why Vic?', headline: 'The Room Named Vic',
  threads: [{ id: 't1', claim: 'The room named Vic.', role: 'main-thread', receipt: 'ledger', verdict: true }],
  connections: [], convergence: 'The vote.', questions: []
};

function makeState(overrides = {}) {
  return {
    weave: JSON.parse(JSON.stringify(WEAVE)),
    arcRevisionCount: 1,
    humanArcRevisionCount: 1,
    _arcFeedback: 'fix burial mechanics',
    _arcReworkTimeout: null,
    validationResults: {},
    playerFocus: { accusation: { accused: ['Test'], charge: 'test' } },
    sessionConfig: { roster: ['Alex'] },
    evidenceBundle: {
      exposed: { tokens: [], paperEvidence: [] },
      buried: { transactions: [], relationships: [] }
    },
    theme: 'journalist',
    ...overrides
  };
}

describe('reviseArcs timeout recovery', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  test('keeps the previous weave on timeout instead of losing it', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(
      new Error('SDK timeout after 300.0s (limit: 300s) - Arc revision 1')
    );
    const state = makeState();

    const result = await reviseArcs(state, { configurable: { sdkClient: mockSdk } });

    // The weave stays as it was: the rework writes none
    expect(result).not.toHaveProperty('weave');
    // Timeout should be free retry — counters decremented
    expect(result.arcRevisionCount).toBeLessThan(state.arcRevisionCount);
    expect(result.humanArcRevisionCount).toBeLessThan(state.humanArcRevisionCount);
    // The timeout is recorded in its own channel, with the consecutive count
    expect(result._arcReworkTimeout).toMatchObject({ consecutive: 1, attempt: 1 });
    // Should preserve human feedback for retry
    expect(result._arcFeedback).toBe('fix burial mechanics');
    // Should NOT be in error state
    expect(result.currentPhase).not.toBe('error');
  });

  test('non-timeout errors keep the weave and end in an error state', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(
      new Error('Connection refused')
    );

    const result = await reviseArcs(makeState({ humanArcRevisionCount: 0, _arcFeedback: null }), { configurable: { sdkClient: mockSdk } });

    expect(result).not.toHaveProperty('weave');
    expect(result.currentPhase).toBe('error');
    expect(result._arcReworkTimeout).toBeNull();
  });

  test('a free timeout retry keeps the fact check\'s mark with the weave it keeps', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('SDK timeout after 300.0s (limit: 300s) - Arc revision 1'));
    const marked = { ...JSON.parse(JSON.stringify(WEAVE)), _factCheck: { at: 't', ready: false, fixes: 0 } };

    const result = await reviseArcs(makeState({ weave: marked, _arcFeedback: null }), { configurable: { sdkClient: mockSdk } });

    // Nothing is written to the weave, so its mark stands and the fix is retried.
    expect(result).not.toHaveProperty('weave');
    expect(result._arcReworkTimeout.consecutive).toBe(1);
  });
});
