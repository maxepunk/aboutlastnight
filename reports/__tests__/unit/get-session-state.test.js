process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * getSessionState / shapeSessionState (READ-1 + DEL-1 read side)
 * A state read must report interrupt status and the last persisted outcome.
 */
const { shapeSessionState } = require('../../server.js');

function interruptedGraphState() {
  return {
    values: { currentPhase: 3.25, theme: 'journalist', outline: { lede: {} } },
    config: { configurable: { checkpoint_id: 'ckpt-abc', thread_id: '1221' } },
    createdAt: '2026-06-21T00:00:00.000Z',
    tasks: [{ id: 't1', interrupts: [{ value: { type: 'outline' } }] }]
  };
}

function runningGraphState() {
  return {
    values: { currentPhase: 2.0, theme: 'journalist' },
    config: { configurable: { checkpoint_id: 'ckpt-def', thread_id: '1221' } },
    createdAt: '2026-06-21T00:00:01.000Z',
    tasks: [{ id: 't2', interrupts: [] }]
  };
}

describe('shapeSessionState', () => {
  it('reports interrupted:true and the checkpoint type when an interrupt is pending', () => {
    const out = shapeSessionState(interruptedGraphState(), null);
    expect(out.interrupted).toBe(true);
    expect(out.checkpointType).toBe('outline');
    expect(out.checkpointId).toBe('ckpt-abc');
    expect(out.state.currentPhase).toBe(3.25);
  });

  it('reports interrupted:false when no interrupt is pending', () => {
    const out = shapeSessionState(runningGraphState(), null);
    expect(out.interrupted).toBe(false);
    expect(out.checkpointType).toBeNull();
  });

  it('attaches the persisted outcome when present (so a dropped SSE is recoverable)', () => {
    const outcome = { outcome: 'failed', currentPhase: 'error', error: 'boom', recordedAt: 'x' };
    const out = shapeSessionState(runningGraphState(), outcome);
    expect(out.lastOutcome).toEqual(outcome);
  });

  it('omits lastOutcome (null) when nothing was persisted', () => {
    const out = shapeSessionState(runningGraphState(), null);
    expect(out.lastOutcome).toBeNull();
  });
});
