/**
 * How the harness opens its run, and whether it approves a stop the thread is already
 * paused at without a /resume (phase 3, task 3.11; the phase gate's replay finding).
 *
 * POST /api/session/:id/resume re-invokes the graph from START. A stop the automated
 * budget escalated keeps a not-ready verdict, and the judge skips only on a ready one
 * (evaluator-nodes.js, evaluatePhase), so the replay re-runs that judge, a paid Opus
 * call, before it pauses at the same stop again: at the gate, two harness approvals
 * re-paid an evaluation each. When the thread is already paused at the stop --approve
 * names, as GET /api/session/:id/checkpoint reports it, the harness approves from that
 * read and posts no /resume. The console never posts /resume to a paused thread either.
 *
 * POST /api/session/:id/start with force, which the harness sends when it runs without
 * --resume, clears the thread and starts the session over (fix round 1). --approve
 * names a stop of a thread that exists, and the approve commands the harness prints
 * carry no --resume, so with --approve the harness never starts over: it approves the
 * paused stop, resumes when --resume asks for it, and otherwise says where the thread
 * is and stops.
 *
 * Pure: the caller makes the GET.
 */

/**
 * Where GET /api/session/:id/checkpoint says the thread is.
 *
 * @param {{status: number, data?: Object, error?: string}|undefined} checkpointRead -
 *   what the GET returned, as the harness's apiGet gives it
 * @returns {{checkpoint: Object|null, data: Object|null, where: string}} the checkpoint
 *   the thread is paused at (null when it is paused at none), the read's body, and
 *   where the thread is, in words
 */
function threadState(checkpointRead) {
  const status = checkpointRead ? checkpointRead.status : undefined;
  if (status === 404) return { checkpoint: null, data: null, where: 'the session has no thread' };
  if (status !== 200) {
    const error = checkpointRead && checkpointRead.error ? `: ${checkpointRead.error}` : '';
    return { checkpoint: null, data: null, where: `GET /checkpoint failed (${status || 'no answer'}${error})` };
  }
  const data = checkpointRead.data || {};
  // A thread a run holds is not paused, whatever its last pause was: the approval would
  // 409, and /resume reports the lock as it always has.
  if (data.inProgress === true) return { checkpoint: null, data, where: 'a run holds the thread' };
  if (data.interrupted !== true) return { checkpoint: null, data, where: `the thread is not paused (phase: ${data.currentPhase})` };
  const checkpoint = data.checkpoint;
  if (!checkpoint || typeof checkpoint !== 'object' || typeof checkpoint.type !== 'string' || !checkpoint.type) {
    return { checkpoint: null, data, where: 'the thread is paused with no checkpoint payload' };
  }
  return { checkpoint, data, where: `the thread is paused at ${checkpoint.type}` };
}

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
 *   thread is not paused at that stop
 */
function pausedStopToApprove(approveType, checkpointRead, { stateOverrides = false } = {}) {
  if (typeof approveType !== 'string' || !approveType || stateOverrides) return null;
  const { checkpoint, data } = threadState(checkpointRead);
  if (!checkpoint || checkpoint.type !== approveType) return null;
  return { sessionId: data.sessionId, interrupted: true, checkpoint, currentPhase: data.currentPhase };
}

/**
 * How the harness opens its run (fix round 1).
 *
 * @param {Object} request
 * @param {string|null} request.approveType - the stop --approve names
 * @param {boolean} request.startsOver - true when the harness would otherwise POST
 *   /start with force (it ran without --resume)
 * @param {{status: number, data?: Object, error?: string}|undefined} request.checkpointRead -
 *   GET /api/session/:id/checkpoint's answer, which the harness reads whenever
 *   --approve names a stop
 * @param {boolean} [request.stateOverrides] - true when --override gave state overrides,
 *   which only /resume applies
 * @returns {{kind: 'approve', currentData: Object}|{kind: 'start'}|{kind: 'resume'}|{kind: 'stop', reason: string}}
 *   approve the paused stop from the read (currentData is pausedStopToApprove's), POST
 *   /start, POST /resume, or print the reason and stop
 */
function openingRequest({ approveType, startsOver, checkpointRead, stateOverrides = false }) {
  const pausedStop = pausedStopToApprove(approveType, checkpointRead, { stateOverrides });
  if (pausedStop) return { kind: 'approve', currentData: pausedStop };
  if (!startsOver) return { kind: 'resume' };
  if (typeof approveType !== 'string' || !approveType) return { kind: 'start' };
  const where = stateOverrides
    ? '--override gives state overrides, which only /resume applies'
    : threadState(checkpointRead).where;
  return {
    kind: 'stop',
    reason: `--approve ${approveType}: ${where}. Without --resume the harness would start the session over, so it stops here.`
  };
}

module.exports = { pausedStopToApprove, openingRequest };
