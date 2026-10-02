/**
 * Whether the harness approves a stop the thread is already paused at, without a
 * /resume (phase 3, task 3.11; the phase gate's replay finding).
 *
 * POST /api/session/:id/resume re-invokes the graph from START. A stop the automated
 * budget escalated keeps a not-ready verdict, and the judge skips only on a ready one
 * (evaluator-nodes.js, evaluatePhase), so the replay re-runs that judge, a paid Opus
 * call, before it pauses at the same stop again: at the gate, two harness approvals
 * re-paid an evaluation each. When the thread is already paused at the stop --approve
 * names, as GET /api/session/:id/checkpoint reports it, the harness approves from that
 * read and posts no /resume. The console never posts /resume to a paused thread either.
 *
 * Pure: the caller makes the GET.
 */

/**
 * @param {string|null} approveType - the stop --approve names
 * @param {{status: number, data?: Object}|undefined} checkpointRead - what GET
 *   /api/session/:id/checkpoint returned, as the harness's apiGet gives it
 * @param {Object} [options]
 * @param {boolean} [options.stateOverrides] - true when --override gave state overrides,
 *   which only /resume applies
 * @returns {{sessionId: string, interrupted: true, checkpoint: Object, currentPhase: string}|null}
 *   the paused stop, in the shape a /resume completion carries (the harness's main loop
 *   reads `interrupted`, `checkpoint.type` and `currentPhase` from it), or null when the
 *   harness resumes as before
 */
function pausedStopToApprove(approveType, checkpointRead, { stateOverrides = false } = {}) {
  if (typeof approveType !== 'string' || !approveType || stateOverrides) return null;
  const data = checkpointRead && checkpointRead.status === 200 ? checkpointRead.data : null;
  // A thread a run holds is not paused, whatever its last pause was: the approval would
  // 409, and /resume reports the lock as it always has.
  if (!data || data.interrupted !== true || data.inProgress === true) return null;
  const checkpoint = data.checkpoint;
  if (!checkpoint || typeof checkpoint !== 'object' || checkpoint.type !== approveType) return null;
  return { sessionId: data.sessionId, interrupted: true, checkpoint, currentPhase: data.currentPhase };
}

module.exports = { pausedStopToApprove };
