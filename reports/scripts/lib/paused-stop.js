/**
 * How the harness opens its run, and whether it approves a stop the thread is already
 * paused at without a /resume (phase 3, task 3.11; the phase gate's replay finding).
 *
 * POST /api/session/:id/resume re-invokes the graph from START and replays the thread to
 * the stop it is paused at. At the gate the replay re-ran the judge of a stop the
 * automated budget had escalated, a paid Opus call, because the judge skipped only on a
 * ready verdict; since 3.9 it skips an escalated one too (evaluator-nodes.js,
 * evaluatePhase). When the thread is already paused at the stop --approve names, as GET
 * /api/session/:id/checkpoint reports it, the harness approves from that read and posts
 * no /resume, which saves the replay. The console never posts /resume to a paused thread
 * either.
 *
 * POST /api/session/:id/start with force clears the thread and starts the session over
 * (fix round 1). The harness sends it only for a run on its own input that names no
 * existing thread, without --resume and without --rollback (startsSessionOver). A
 * rollback names an existing thread, so after it the harness continues that thread as
 * --resume would (task 4c-fix): a /start after it wiped the thread the rollback had just
 * rerun. --approve names a stop of a thread that exists, and the approve commands the
 * harness prints carry no --resume, so with --approve the harness never starts over: it
 * approves the paused stop, resumes when --resume or a rollback continues the thread,
 * and otherwise says where the thread is and stops.
 *
 * Final review (data-harness-docs[2]): --override names state overrides for a thread
 * that exists, which only a run that continues it applies, so an --override run without
 * --resume or --rollback stops with that warning instead of starting the session over.
 * The step-mode mismatch prints commands that keep the thread (keepThreadCommands).
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
 * Whether the harness starts the session over, with POST /start and force, which clears
 * the thread (task 4c-fix). Only a run on its own input that names no existing thread
 * does: one without --resume and without --rollback. A rollback names an existing thread
 * and reruns it from the stop it names, so after it the harness continues that thread as
 * --resume would.
 *
 * @param {Object} run
 * @param {Object} [run.rawSessionInput] - the run's own input: --input's file, the
 *   prompts, or --session's files; none with --resume
 * @param {boolean} [run.resume] - --resume
 * @param {string|null} [run.rollbackTo] - the stop --rollback names
 * @returns {boolean}
 */
function startsSessionOver({ rawSessionInput, resume = false, rollbackTo = null } = {}) {
  return Boolean(rawSessionInput) && !resume && !rollbackTo;
}

/**
 * The commands the step-mode mismatch prints (final review, data-harness-docs[2]): the
 * run's --approve names a stop other than the one the thread is paused at. Only a run
 * with --resume or --rollback reaches that branch, one that means to keep the thread, so
 * each command keeps it: the first views the paused stop through /resume, the second
 * approves it from GET /checkpoint (openingRequest). Neither repeats --rollback, which
 * would run the rollback again, and neither lacks both --resume and --approve, which
 * would POST /start with force and clear the thread.
 *
 * @param {string} sessionId
 * @param {string} pausedAt - the stop the thread is paused at
 * @returns {Array<{label: string, command: string}>}
 */
function keepThreadCommands(sessionId, pausedAt) {
  return [
    { label: 'To view the stop the thread is paused at, run:', command: `node scripts/e2e-walkthrough.js --session ${sessionId} --resume --step` },
    { label: 'To approve it, run:', command: `node scripts/e2e-walkthrough.js --session ${sessionId} --approve ${pausedAt} --step` }
  ];
}

/**
 * How the harness opens its run (fix round 1).
 *
 * @param {Object} request
 * @param {string|null} request.approveType - the stop --approve names
 * @param {boolean} request.startsOver - true when the harness would otherwise POST
 *   /start with force (startsSessionOver)
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
  if (typeof approveType !== 'string' || !approveType) {
    if (!stateOverrides) return { kind: 'start' };
    return {
      kind: 'stop',
      reason: '--override applies only with --rollback or --resume. Without either the harness would start the session over, so it stops here.'
    };
  }
  const where = stateOverrides
    ? '--override gives state overrides, which only /resume applies'
    : threadState(checkpointRead).where;
  return {
    kind: 'stop',
    reason: `--approve ${approveType}: ${where}. Without --resume the harness would start the session over, so it stops here.`
  };
}

module.exports = { pausedStopToApprove, openingRequest, startsSessionOver, keepThreadCommands };
