/**
 * Evaluator skip logic test
 *
 * Verifies the story meeting's fact check skip: it reads the mark on the weave it
 * judged, never the evaluation history (phase 4, brief 4.4).
 */

const { createMockSdkClient } = require('../../__tests__/mocks/llm-client.mock');

// Mock the llm module before requiring evaluator-nodes
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));

// Mock observability
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { evaluateArcs } = require('../workflow/nodes/evaluator-nodes');

/**
 * Phase 4 (brief 4.4): the story meeting's fact check skips by its mark on the weave it
 * judged, not by the evaluation history: a weave without a mark is judged whatever the
 * history says, and a marked weave is never judged again, whatever its verdict.
 */
describe('evaluateArcs skip logic', () => {
  const WEAVE = {
    story: 'The room named Vic.', question: 'Why Vic?', headline: 'H',
    threads: [{ id: 't1', claim: 'The room named Vic.', role: 'main-thread', receipt: 'ledger', verdict: true }],
    connections: [], convergence: 'C', questions: []
  };
  const judged = (ready) => ({ ...WEAVE, _factCheck: { at: '2026-01-01', ready, fixes: 0 } });
  const session = {
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
    arcRevisionCount: 0,
    playerFocus: {},
    sessionConfig: { roster: [] }
  };

  test('skips a weave the fact check marked ready', async () => {
    const state = {
      weave: judged(true),
      evaluationHistory: [
        { phase: 'arcs', ready: true, timestamp: '2026-01-01' }
      ],
      arcRevisionCount: 0
    };
    const config = { configurable: {} };
    const result = await evaluateArcs(state, config);
    // Should skip — return only currentPhase, no new evaluationHistory entry
    expect(result.evaluationHistory).toBeUndefined();
    expect(result.currentPhase).toBeDefined();
  });

  test('judges a weave with no mark, whatever the history says', async () => {
    const mockSdk = createMockSdkClient();
    const state = {
      ...session,
      weave: WEAVE,
      evaluationHistory: [
        { phase: 'arcs', ready: true, timestamp: '2026-01-01' },
        { phase: 'arcs', ready: false, reason: 'revision-invalidated', timestamp: '2026-01-02' }
      ]
    };
    const config = { configurable: { sdkClient: mockSdk } };
    // Should NOT skip — the weave carries no mark
    const result = await evaluateArcs(state, config);
    // Should have a new evaluationHistory entry (from actual evaluation)
    expect(result.evaluationHistory).toBeDefined();
    expect(result.evaluationHistory.phase).toBe('arcs');
    expect(result.weave._factCheck).toEqual(expect.objectContaining({ fixes: 0 }));
  });

  test('judges a weave with no mark when the history is empty', async () => {
    const mockSdk = createMockSdkClient();
    const state = { ...session, weave: WEAVE, evaluationHistory: [] };
    const config = { configurable: { sdkClient: mockSdk } };
    const result = await evaluateArcs(state, config);
    // Should proceed to actual evaluation — not skip
    expect(result.evaluationHistory).toBeDefined();
    expect(result.evaluationHistory.phase).toBe('arcs');
  });

  test('skips a weave the fact check marked not ready: its one fix runs, with no second judge call', async () => {
    // A weave the fact check judged and found a breach in is not judged again: its one
    // fix runs, and the stop opens with no second judge call (R6).
    const state = {
      weave: judged(false),
      evaluationHistory: [
        { phase: 'outline', ready: true, timestamp: '2026-01-01' },
        { phase: 'arcs', ready: false, timestamp: '2026-01-02' }
      ],
      arcRevisionCount: 0
    };
    const config = { configurable: {} };
    const result = await evaluateArcs(state, config);
    // Should skip — the weave carries the fact check's mark
    expect(result.evaluationHistory).toBeUndefined();
  });
});

// 4.5: the story meeting's own approval (brief 4.5; ruling 1). The fact check's skip reads
// the meeting's approval, `meetingApproved`, through lib/weave.js isMeetingApproved, in
// place of the old arc selection.
describe("4.5: the fact check skips on the meeting's approval", () => {
  const WEAVE = {
    story: 'The room named Vic.', question: 'Why Vic?', headline: 'H',
    threads: [{ id: 't1', claim: 'The room named Vic.', role: 'main-thread', receipt: 'ledger', verdict: true }],
    connections: [], convergence: 'C', questions: []
  };
  const session = {
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
    playerFocus: {},
    sessionConfig: { roster: [] }
  };

  test('an approved meeting is not judged, though its weave carries no mark', async () => {
    const sdk = jest.fn();
    const result = await evaluateArcs({ ...session, weave: WEAVE, meetingApproved: true }, { configurable: { sdkClient: sdk } });
    expect(sdk).not.toHaveBeenCalled();
    expect(result.evaluationHistory).toMatchObject({ phase: 'arcs', ready: true, skippedReason: 'user-already-approved' });
  });

  test('a selection is no approval: the weave is judged', async () => {
    const sdk = createMockSdkClient();
    const result = await evaluateArcs({ ...session, weave: WEAVE, selectedArcs: ['weave'] }, { configurable: { sdkClient: sdk } });
    expect(result.evaluationHistory).toBeDefined();
    expect(result.evaluationHistory.skippedReason).toBeUndefined();
    expect(result.weave._factCheck).toBeDefined();
  });
});
