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
