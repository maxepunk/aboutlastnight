/**
 * session-locks unit tests (CONC-1)
 * A second /approve on a session whose first /approve is still running must be rejected.
 */
const { acquireSessionLock, releaseSessionLock, isSessionLocked, _resetLocks } = require('../../lib/session-locks');

beforeEach(() => _resetLocks());

describe('per-session in-flight lock', () => {
  it('lets the first acquire succeed', () => {
    expect(acquireSessionLock('1221')).toBe(true);
    expect(isSessionLocked('1221')).toBe(true);
  });

  it('rejects a second acquire while held', () => {
    acquireSessionLock('1221');
    expect(acquireSessionLock('1221')).toBe(false);
  });

  it('allows re-acquire after release', () => {
    acquireSessionLock('1221');
    releaseSessionLock('1221');
    expect(isSessionLocked('1221')).toBe(false);
    expect(acquireSessionLock('1221')).toBe(true);
  });

  it('locks are independent per session', () => {
    acquireSessionLock('1221');
    expect(acquireSessionLock('1225')).toBe(true);
  });

  it('release of an unheld session is a no-op (no throw)', () => {
    expect(() => releaseSessionLock('9999')).not.toThrow();
  });
});
