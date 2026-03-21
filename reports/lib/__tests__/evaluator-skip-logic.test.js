/**
 * Evaluator skip logic test
 *
 * Verifies that the evaluation skip logic checks the MOST RECENT
 * phase entry (not the first ready=true ever recorded).
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

describe('evaluateArcs skip logic', () => {
  test('skips when most recent arcs evaluation is ready=true', async () => {
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc' }],
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

  test('does NOT skip when most recent arcs evaluation is ready=false (invalidated)', async () => {
    const mockSdk = createMockSdkClient();
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc', keyEvidence: [], characterPlacements: {}, analysisNotes: {} }],
      evaluationHistory: [
        { phase: 'arcs', ready: true, timestamp: '2026-01-01' },
        { phase: 'arcs', ready: false, reason: 'revision-invalidated', timestamp: '2026-01-02' }
      ],
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
      arcRevisionCount: 0,
      playerFocus: {},
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: mockSdk } };
    // Should NOT skip — most recent is ready=false
    const result = await evaluateArcs(state, config);
    // Should have a new evaluationHistory entry (from actual evaluation)
    expect(result.evaluationHistory).toBeDefined();
    expect(result.evaluationHistory.phase).toBe('arcs');
  });

  test('does not skip when evaluationHistory is empty', async () => {
    const mockSdk = createMockSdkClient();
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc', keyEvidence: [], characterPlacements: {}, analysisNotes: {} }],
      evaluationHistory: [],
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } },
      arcRevisionCount: 0,
      playerFocus: {},
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: mockSdk } };
    const result = await evaluateArcs(state, config);
    // Should proceed to actual evaluation — not skip
    expect(result.evaluationHistory).toBeDefined();
    expect(result.evaluationHistory.phase).toBe('arcs');
  });

  test('skips when only evaluation is ready=true (no invalidation)', async () => {
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc' }],
      evaluationHistory: [
        { phase: 'outline', ready: true, timestamp: '2026-01-01' },
        { phase: 'arcs', ready: true, timestamp: '2026-01-02' }
      ],
      arcRevisionCount: 0
    };
    const config = { configurable: {} };
    const result = await evaluateArcs(state, config);
    // Should skip — most recent arcs entry is ready=true
    expect(result.evaluationHistory).toBeUndefined();
  });
});
