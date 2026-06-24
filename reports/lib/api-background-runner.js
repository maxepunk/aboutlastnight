/**
 * api-background-runner — the shared non-blocking graph-invoke runner.
 *
 * Extracted from the /approve handler so the lock (CONC-1) + drain tracking (DUR-2)
 * + outcome record (DEL-1) + SSE emitComplete contract has ONE source of truth. The
 * /resume, /rollback, and /approve handlers all delegate the "run the graph in the
 * background and deliver the result over SSE" boilerplate here.
 *
 * The HANDLER owns: auth, synchronous validation (400/404), the shuttingDown 503
 * guard, building the `invoke`/`getState` thunks and the `buildResponse` callback.
 * THIS runner owns everything from the lock acquire onward: 409 on contention, the
 * immediate {status:'processing'} response, the setImmediate background invoke,
 * getState, buildResponse, outcome record, emitComplete, error path, lock release,
 * and inFlight tracking for graceful drain.
 *
 * @module api-background-runner
 */

const { acquireSessionLock, releaseSessionLock } = require('./session-locks');
const { recordSessionOutcome, buildOutcomeRecord } = require('./session-outcome');
const { progressEmitter } = require('./observability');
const { PHASES } = require('./workflow/state');

/**
 * @param {object} a
 * @param {string}   a.sessionId
 * @param {() => Promise<object>} a.invoke      - wraps graph.invoke(invokeArg, {...config, durability:'sync', recursionLimit})
 * @param {() => Promise<object>} a.getState    - wraps graph.getState(config)
 * @param {(result:object, graphState:object) => object} a.buildResponse - endpoint-specific SSE payload
 * @param {object}   a.res                      - Express response (runner sends 409 or 200-processing)
 * @param {Set}      a.inFlightTasks            - server-owned Set for SIGINT drain (DUR-2)
 * @param {object}   [a.processingExtra]        - extra fields merged into the {status:'processing'} body
 * @param {object}   [a.deps]                   - injectable singletons for tests
 * @returns {{scheduled: boolean, task: Promise|null}}
 */
function runGraphInBackground({
  sessionId, invoke, getState, buildResponse, res,
  inFlightTasks, processingExtra = {}, deps = {}
}) {
  const _acquire = deps.acquireSessionLock || acquireSessionLock;
  const _release = deps.releaseSessionLock || releaseSessionLock;
  const _record = deps.recordSessionOutcome || recordSessionOutcome;
  const _buildOutcome = deps.buildOutcomeRecord || buildOutcomeRecord;
  const _emitComplete = deps.emitComplete || ((id, payload) => progressEmitter.emitComplete(id, payload));

  // CONC-1: refuse a concurrent invoke on this session (lock is sessionId-keyed, so this
  // spans resume/rollback/approve). The loser gets a 409, not a second 'processing'.
  if (!_acquire(sessionId)) {
    res.status(409).json({
      sessionId,
      error: 'An operation is already in progress for this session. Please wait for it to finish.'
    });
    return { scheduled: false, task: null };
  }

  // Everything from here to inFlightTasks.add(task) must release the lock if it throws
  // synchronously — otherwise the background `finally` (the only OTHER release) never runs and
  // the sessionId-keyed lock bricks the session (every later op 409s until restart). This is
  // the old /approve `lockAcquired` guard, now owned by the runner since the lock lives here.
  try {
    // Return immediately; the graph runs in the background and the result arrives via SSE.
    res.json({ sessionId, status: 'processing', ...processingExtra });

    // DUR-2: wrap in a tracked promise so SIGINT can drain it.
    const task = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const result = await invoke();
          const graphState = await getState();
          const response = buildResponse(result, graphState);
          // DEL-1: persist the outcome FIRST so a dropped SSE is recoverable via GET /state.
          _record(sessionId, _buildOutcome(response));
          _emitComplete(sessionId, response);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
          const failedResponse = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Background operation failed. Check server logs.'
          };
          _record(sessionId, _buildOutcome(failedResponse));
          _emitComplete(sessionId, failedResponse);
        } finally {
          _release(sessionId);
          resolve();
        }
      });
    }).finally(() => inFlightTasks.delete(task));
    inFlightTasks.add(task);
    return { scheduled: true, task };
  } catch (err) {
    // res.json (or scheduling) threw before the background task was registered: release the
    // lock so the session isn't permanently locked, then rethrow to the handler's outer catch.
    _release(sessionId);
    throw err;
  }
}

module.exports = { runGraphInBackground };
