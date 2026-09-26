/**
 * reviseArcs timeout recovery test
 *
 * Verifies that timeout preserves previous arcs instead of returning [].
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

describe('reviseArcs timeout recovery', () => {
  test('preserves previous arcs on timeout instead of returning empty', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(
      new Error('SDK timeout after 300.0s (limit: 300s) - Arc revision 1')
    );

    const previousArcs = [{ id: 'arc-1', title: 'Test Arc', arcSource: 'accusation' }];
    const state = {
      _previousArcs: previousArcs,
      arcRevisionCount: 1,
      humanArcRevisionCount: 1,
      _arcFeedback: 'fix burial mechanics',
      _arcAnalysisCache: null,
      validationResults: {},
      playerFocus: { accusation: { accused: ['Test'], charge: 'test' } },
      sessionConfig: { roster: ['Alex'] },
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [], relationships: [] }
      },
      theme: 'journalist'
    };
    const config = { configurable: { sdkClient: mockSdk } };

    const result = await reviseArcs(state, config);

    // Timeout should preserve previous arcs
    expect(result.narrativeArcs).toEqual(previousArcs);
    expect(result.narrativeArcs.length).toBe(1);
    // Timeout should be free retry — counters decremented
    expect(result.arcRevisionCount).toBeLessThan(state.arcRevisionCount);
    expect(result.humanArcRevisionCount).toBeLessThan(state.humanArcRevisionCount);
    // Should mark as timeout with consecutive count
    expect(result._arcAnalysisCache._revisionTimedOut).toBe(true);
    expect(result._arcAnalysisCache._consecutiveTimeouts).toBe(1);
    // Should preserve human feedback for retry
    expect(result._arcFeedback).toBe('fix burial mechanics');
    // Should NOT be in error state
    expect(result.currentPhase).not.toBe('error');
  });

  test('non-timeout errors still return empty arcs and error state', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(
      new Error('Connection refused')
    );

    const previousArcs = [{ id: 'arc-1', title: 'Test Arc' }];
    const state = {
      _previousArcs: previousArcs,
      arcRevisionCount: 1,
      humanArcRevisionCount: 0,
      _arcFeedback: null,
      _arcAnalysisCache: null,
      validationResults: {},
      playerFocus: { accusation: {} },
      sessionConfig: { roster: [] },
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [], relationships: [] }
      },
      theme: 'journalist'
    };
    const config = { configurable: { sdkClient: mockSdk } };

    const result = await reviseArcs(state, config);

    // Non-timeout errors: existing behavior
    expect(result.narrativeArcs).toEqual([]);
    expect(result.currentPhase).toBe('error');
  });
});

/**
 * The arc rework keeps the interweaving plan (phase 2, brief 2.2).
 *
 * The success return replaced _arcAnalysisCache with a cache that had no
 * interweavingPlan, so after any arc rework the outline writer's <arc-analysis>
 * lost the plan. The rework is asked for one and the plan it returns is stored.
 */
describe('reviseArcs keeps the interweaving plan', () => {
  const PREVIOUS_PLAN = { suggestedOrder: ['arc-1'], convergencePoint: 'the vote', keyCallbacks: [] };

  function makeState(overrides = {}) {
    return {
      _previousArcs: [{ id: 'arc-1', title: 'The vote', arcSource: 'accusation' }],
      arcRevisionCount: 1,
      humanArcRevisionCount: 1,
      _arcFeedback: 'Put the vote first.',
      _arcAnalysisCache: { interweavingPlan: PREVIOUS_PLAN, synthesisNotes: 'old' },
      validationResults: {},
      playerFocus: { accusation: { accused: ['Vic'], charge: 'Murder' } },
      sessionConfig: { roster: ['Alex'] },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
      theme: 'journalist',
      ...overrides
    };
  }

  test('stores the plan the rework returns', async () => {
    const revisedPlan = { suggestedOrder: ['arc-2', 'arc-1'], convergencePoint: 'the ledger', keyCallbacks: [{ plantIn: 'arc-2', payoffIn: 'arc-1', detail: 'the 9:40 sale' }] };
    const mockSdk = jest.fn().mockResolvedValue({
      narrativeArcs: [{ id: 'arc-1', title: 'The vote', arcSource: 'accusation' }, { id: 'arc-2', title: 'The ledger', arcSource: 'discovered' }],
      synthesisNotes: 'new',
      interweavingPlan: revisedPlan
    });

    const result = await reviseArcs(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result._arcAnalysisCache.interweavingPlan).toEqual(revisedPlan);
    expect(result._arcAnalysisCache).not.toHaveProperty('interweavingFromPreviousRound');
    // It was asked for the plan, with the previous one in front of it.
    const prompt = mockSdk.mock.calls[0][0].prompt;
    expect(prompt).toContain('### PREVIOUS INTERWEAVING PLAN');
    expect(prompt).toContain('"convergencePoint": "the vote"');
  });

  test('keeps the previous plan, and says so, when the rework returns none', async () => {
    const mockSdk = jest.fn().mockResolvedValue({
      narrativeArcs: [{ id: 'arc-1', title: 'The vote', arcSource: 'accusation' }],
      synthesisNotes: 'new'
    });

    const result = await reviseArcs(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result._arcAnalysisCache.interweavingPlan).toEqual(PREVIOUS_PLAN);
    expect(result._arcAnalysisCache.interweavingFromPreviousRound).toBe(true);
  });

  test('a free timeout retry keeps the plan with the arcs it keeps', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('SDK timeout after 300.0s (limit: 300s) - Arc revision 1'));

    const result = await reviseArcs(makeState(), { configurable: { sdkClient: mockSdk } });

    expect(result._arcAnalysisCache._revisionTimedOut).toBe(true);
    expect(result._arcAnalysisCache.interweavingPlan).toEqual(PREVIOUS_PLAN);
  });
});
