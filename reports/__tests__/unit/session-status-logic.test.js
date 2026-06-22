/**
 * session-status-logic (UX-1/4/5/6)
 * Setting an error must also stop the spinner (clear `processing`), so an
 * early-400 approve (which emits no SSE complete) cannot hang the UI.
 */
const { applySetError, applyClearError } = require('../../console/session-status-logic');

describe('applySetError', () => {
  it('sets the error message AND clears processing (UX-1: spinner cannot hang)', () => {
    const next = applySetError({ processing: true, error: null }, 'Session is not at a checkpoint');
    expect(next.error).toBe('Session is not at a checkpoint');
    expect(next.processing).toBe(false);
  });

  it('preserves unrelated state fields', () => {
    const next = applySetError({ processing: true, sessionId: '1221', checkpointType: 'outline' }, 'boom');
    expect(next.sessionId).toBe('1221');
    expect(next.checkpointType).toBe('outline');
  });
});

describe('applyClearError', () => {
  it('clears the error and leaves processing untouched', () => {
    const next = applyClearError({ error: 'boom', processing: false });
    expect(next.error).toBeNull();
    expect(next.processing).toBe(false);
  });
});
