/**
 * session-locks — per-session in-flight guard for the approve endpoint (CONC-1).
 *
 * Two /approve requests can both pass isGraphInterrupted() before either
 * setImmediate resume runs, interleaving resumes on one thread/checkpointer.
 * This Set-based lock makes the second acquire fail-fast so the handler can
 * 409 it. Single-process server → an in-memory Set is sufficient and atomic
 * (Node is single-threaded; acquire is a synchronous check-then-set).
 *
 * @module session-locks
 */

const _held = new Set();

/** @returns {boolean} true if the lock was acquired; false if already held. */
function acquireSessionLock(sessionId) {
  if (_held.has(sessionId)) return false;
  _held.add(sessionId);
  return true;
}

function releaseSessionLock(sessionId) {
  _held.delete(sessionId);
}

function isSessionLocked(sessionId) {
  return _held.has(sessionId);
}

/** Test-only. */
function _resetLocks() {
  _held.clear();
}

module.exports = { acquireSessionLock, releaseSessionLock, isSessionLocked, _resetLocks };
