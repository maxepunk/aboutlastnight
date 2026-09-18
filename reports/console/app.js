/**
 * Root App Component
 * Auth gate, session management, checkpoint routing.
 * Mounts via ReactDOM.createRoot.
 * Exports to window.Console.App
 */

window.Console = window.Console || {};

const { api: appApi } = window.Console;
const { useAppState, ACTIONS: APP_ACTIONS, LoginOverlay, SessionStart } = window.Console;
const { ProgressStream, PipelineProgress, CheckpointShell } = window.Console;
const { RollbackPanel, CompletionView } = window.Console;
const { CHECKPOINT_LABELS } = window.Console.utils;
// H10 message derivation (pure, node-tested in __tests__/unit/llm-stream-logic.test.js).
const { formatLlmErrorMessage, formatFailureMessage } = window.Console.llmStreamLogic;
// Attach watchdog decision + report links (pure, node-tested in
// console/__tests__/session-start-logic.test.js).
const { decideAttachFallback, buildReportLinks } = window.Console.sessionStartLogic;

// How long an attached stream may say nothing before the watchdog re-reads
// /checkpoint, and how often it looks. The server's heartbeat is an SSE COMMENT
// (`: heartbeat`), which EventSource never delivers to onmessage, so a silent run
// really is silent here — the idle window is not defeated by keepalives.
const ATTACH_IDLE_MS = 20000;
const ATTACH_POLL_MS = 5000;

// Checkpoint type -> specific component mapping (Batch 3B.3 + 3B.4 + 3B.5 + 3B.6)
const CHECKPOINT_COMPONENTS = {
  'input-review': window.Console.checkpoints && window.Console.checkpoints.InputReview,
  'paper-evidence-selection': window.Console.checkpoints && window.Console.checkpoints.PaperEvidence,
  'pre-curation': window.Console.checkpoints && window.Console.checkpoints.PreCuration,
  'await-roster': window.Console.checkpoints && window.Console.checkpoints.AwaitRoster,
  'character-ids': window.Console.checkpoints && window.Console.checkpoints.CharacterIds,
  'await-full-context': window.Console.checkpoints && window.Console.checkpoints.AwaitFullContext,
  'evidence-and-photos': window.Console.checkpoints && window.Console.checkpoints.EvidenceBundle,
  'arc-selection': window.Console.checkpoints && window.Console.checkpoints.ArcSelection,
  'outline': window.Console.checkpoints && window.Console.checkpoints.Outline,
  'article': window.Console.checkpoints && window.Console.checkpoints.Article
};

/**
 * Build the SSE onProgress handler shared by approve/resume/rollback (all three drive
 * the same non-blocking, SSE-delivered contract). Closes over dispatch + the EventSource
 * ref so the completion branches can close the stream.
 */
function makeSseHandler(dispatch, sseRef, activityRef) {
  // H9: a mid-run drop is non-terminal now (api.js leaves the stream open so
  // EventSource reconnects), so the log has to say both halves out loud or the
  // director cannot tell a stall from a reconnect. One handler per run, so this
  // latch is per-run.
  let dropped = false;

  return (event) => {
    // Review fix 2: the attach watchdog's liveness signal. Stamped for every real
    // event so a run that is genuinely streaming is never second-guessed.
    if (activityRef && event.type !== 'heartbeat') activityRef.current = Date.now();

    switch (event.type) {
      case 'connected':
        dispatch({ type: APP_ACTIONS.SSE_CONNECTED });
        if (dropped) {
          dropped = false;
          dispatch({ type: APP_ACTIONS.SSE_PROGRESS, message: 'Reconnected' });
        }
        break;
      case 'reconnecting':
        // Once per outage, not once per retry: the browser re-attempts every ~3 s,
        // so an unlatched line would bury the run's real progress in a long drop.
        if (!dropped) {
          dropped = true;
          dispatch({
            type: APP_ACTIONS.SSE_PROGRESS,
            message: event.data.message || 'Connection interrupted, reconnecting…'
          });
        }
        break;
      case 'progress':
        dispatch({
          type: APP_ACTIONS.SSE_PROGRESS,
          message: event.data.message || event.data.context || JSON.stringify(event.data)
        });
        break;
      case 'llm_start':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_START,
          label: event.data.label || event.data.context || 'Processing',
          model: event.data.model || 'unknown',
          prompt: event.data.prompt || null,
          systemPrompt: event.data.systemPrompt || null
        });
        break;
      case 'llm_delta':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_DELTA,
          phase: event.data.phase || 'writing',
          deltaText: event.data.deltaText || '',
          tokenCount: event.data.tokenCount,
          ttftMs: event.data.ttftMs
        });
        break;
      case 'llm_complete':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_COMPLETE,
          response: event.data.response || null,
          elapsed: event.data.elapsed || null
        });
        break;
      case 'llm_error':
        // client.js emits this on TWO paths: structured-output extraction failed
        // (SDK#277), and a terminal SDK result error (expired token, 429, 5xx).
        // Either way the LLM call is over, so clear the spinner like llm_complete
        // and log the message. H10: the label used to be hardcoded "Extraction
        // failed"; it is derived from errorName now.
        dispatch({
          type: APP_ACTIONS.SSE_LLM_COMPLETE,
          response: null,
          elapsed: event.data.elapsed || null
        });
        dispatch({
          type: APP_ACTIONS.SSE_PROGRESS,
          message: formatLlmErrorMessage(event.data)
        });
        break;
      case 'complete':
        eventSourceClose(sseRef);
        dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
        {
          const result = event.data;
          if (result.interrupted && result.checkpoint) {
            dispatch({
              type: APP_ACTIONS.CHECKPOINT_RECEIVED,
              checkpointType: result.checkpoint.type,
              data: result.checkpoint,
              phase: result.currentPhase
            });
          } else if (result.currentPhase === 'complete') {
            dispatch({ type: APP_ACTIONS.WORKFLOW_COMPLETE, result });
          } else if (result.currentPhase === 'error') {
            // Unreachable on the runner path: the server stamps a non-interrupted error as
            // SSE type:'failed' (progress-emitter outcomeEventType), so it hits the 'failed'
            // branch (inline failure card) below, not here. Kept for parity with the legacy
            // inline approve handler / any future non-runner emit.
            dispatch({
              type: APP_ACTIONS.SET_ERROR,
              message: (result.error || 'Workflow error') +
                (result.details ? ' ' + result.details : '') +
                ' You can edit and retry, or use rollback.'
            });
          }
        }
        break;
      case 'failed':
        // P4 SSE-1 emits type:'failed' for an error outcome. Reconciled failure
        // UX (M4): close the stream, clear `processing` (SSE_COMPLETE), and drive
        // the INLINE failure card (Retry=/resume, Roll back) via SSE_LLM_FAILURE —
        // NOT a SET_ERROR banner. ProgressStream stays mounted while
        // llmActivity.phase==='failed', so the card renders with processing=false.
        eventSourceClose(sseRef);
        dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
        dispatch({
          type: APP_ACTIONS.SSE_LLM_FAILURE,
          // H10: lead with `details` (the thrown cause the runner puts there), not
          // the runner's generic 'Internal server error' headline, and read the LAST
          // entry of the append-only `errors` channel.
          error: formatFailureMessage(event.data)
        });
        break;
      case 'error':
        eventSourceClose(sseRef);
        dispatch({
          type: APP_ACTIONS.SSE_ERROR,
          message: event.data.message || 'Connection lost'
        });
        break;
    }
  };
}

/** Close + clear the tracked EventSource (idempotent). */
function eventSourceClose(sseRef) {
  if (sseRef.current) {
    sseRef.current.close();
    sseRef.current = null;
  }
}

/**
 * The ONLY writer of sseRef.current besides eventSourceClose: closes whatever the
 * ref held before taking the new stream.
 *
 * Every approve/resume/rollback used to assign the ref directly, and only the
 * terminal SSE branches ever closed it — so a 400/404/409, or a 'complete' that
 * arrived during the await, left the previous EventSource open and untracked.
 * Each leak duplicates every later dispatch, and about six of them exhaust an
 * HTTP/1.1 tab's connections and stall the console.
 */
function assignSse(sseRef, eventSource) {
  if (sseRef.current && sseRef.current !== eventSource) sseRef.current.close();
  sseRef.current = eventSource;
}

/**
 * Handle a non-blocking POST that came back with an error body.
 *
 * A 409 from the session lock means a run we are not attached to is already going
 * (H8) — the director refreshed, or two tabs are open. Attaching to its stream is
 * the useful answer; a banner on the session form, with progress hidden, was not.
 * The OTHER 409 is Task 1's B9 refusal: it names currentPhase 'complete' and is a
 * real error — that thread must not be resumed.
 */
function handlePostFailure(dispatch, sseRef, sessionId, response) {
  if (response.status === 409 && response.currentPhase !== 'complete') {
    // streamingAttach closes the current stream before opening its own.
    dispatch({ type: APP_ACTIONS.ATTACH_REQUESTED, sessionId });
    return;
  }
  eventSourceClose(sseRef);
  dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
}

function App() {
  const [state, dispatch] = useAppState();
  const [rollbackTarget, setRollbackTarget] = React.useState(null);
  const sseRef = React.useRef(null);
  // Review fix 2 (attach watchdog): the session whose stream we are merely riding,
  // when the last real SSE event arrived, and whether the "still running" line has
  // already been logged for the current silence.
  const [attachedSession, setAttachedSession] = React.useState(null);
  const sseActivityRef = React.useRef(0);
  const attachWaitLoggedRef = React.useRef(false);

  // Cleanup EventSource on unmount
  React.useEffect(() => {
    return () => eventSourceClose(sseRef);
  }, []);

  // Check auth on mount
  React.useEffect(() => {
    appApi.checkAuth().then((result) => {
      if (result.authenticated) {
        dispatch({ type: APP_ACTIONS.LOGIN_SUCCESS });
      }
    }).catch(() => {
      // Server not available — stay on login
    });
  }, []);

  // Reconnect-resume hand-off: SessionStart dispatched RESUME_REQUESTED (it can't own the
  // EventSource because it unmounts once sessionId is set). Drive the streaming resume here,
  // then clear the flag so it fires exactly once.
  React.useEffect(() => {
    if (state.pendingResume && state.pendingResume.sessionId) {
      const sid = state.pendingResume.sessionId;
      dispatch({ type: APP_ACTIONS.RESUME_CLEAR_PENDING });
      streamingResume(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingResume]);

  // H8 attach hand-off: SessionStart found a run already in flight, or a POST came
  // back 409 against the session lock. Same one-shot pattern as pendingResume.
  React.useEffect(() => {
    if (state.pendingAttach && state.pendingAttach.sessionId) {
      const sid = state.pendingAttach.sessionId;
      dispatch({ type: APP_ACTIONS.ATTACH_CLEAR_PENDING });
      streamingAttach(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingAttach]);

  /**
   * Handle logout
   */
  const handleLogout = async () => {
    try {
      await appApi.logout();
    } catch (err) {
      // Logout failed — clear local state anyway
    }
    dispatch({ type: APP_ACTIONS.LOGOUT });
  };

  /**
   * Handle approval flow with SSE-before-POST pattern
   * Used by checkpoint components when they call onApprove
   */
  const handleApprove = async (payload) => {
    if (!state.sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    eventSourceClose(sseRef);
    // This call owns the stream now; release the attach watchdog.
    setAttachedSession(null);
    try {
      const { response, eventSource } = await appApi.approve(
        state.sessionId, payload, makeSseHandler(dispatch, sseRef, sseActivityRef)
      );
      assignSse(sseRef, eventSource);
      if (response.error) {
        handlePostFailure(dispatch, sseRef, state.sessionId, response);
      }
    } catch (err) {
      dispatch({
        type: APP_ACTIONS.SSE_ERROR,
        message: 'Failed to connect: ' + (err.message || 'Unknown error')
      });
    }
  };

  /**
   * Streaming resume (non-blocking /resume). Used by the [Retry] button and the
   * reconnect-resume hand-off. Same SSE contract as approve.
   */
  const streamingResume = async (sessionId) => {
    if (!sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    eventSourceClose(sseRef);
    // This call owns the stream now; release the attach watchdog.
    setAttachedSession(null);
    try {
      const { response, eventSource } = await appApi.resume(sessionId, makeSseHandler(dispatch, sseRef, sseActivityRef));
      assignSse(sseRef, eventSource);
      if (response.error) {
        handlePostFailure(dispatch, sseRef, sessionId, response);
      }
    } catch (err) {
      dispatch({ type: APP_ACTIONS.SSE_ERROR, message: 'Resume failed: ' + (err.message || 'Unknown error') });
    }
  };

  /**
   * Attach to a run already in flight (H8): open its progress stream, post nothing.
   * The only path that reaches a run the console did not itself start — after a
   * refresh, a laptop sleep, or a tunnel drop during a long model call.
   */
  const streamingAttach = async (sessionId) => {
    if (!sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    eventSourceClose(sseRef);
    try {
      const { eventSource } = await appApi.attach(sessionId, makeSseHandler(dispatch, sseRef, sseActivityRef));
      assignSse(sseRef, eventSource);
      dispatch({
        type: APP_ACTIONS.SSE_PROGRESS,
        message: 'Attached to the run already in progress for this session. Waiting for its next checkpoint…'
      });
      // Arm the watchdog: this stream may never speak (see decideAttachFallback).
      attachWaitLoggedRef.current = false;
      setAttachedSession(sessionId);
    } catch (err) {
      dispatch({
        type: APP_ACTIONS.SSE_ERROR,
        message: 'Could not attach to the run in progress: ' + (err.message || 'Unknown error')
      });
    }
  };

  /**
   * Review fix 2: the attached stream has said nothing for ATTACH_IDLE_MS. Ask
   * /checkpoint what actually happened and act on it, so a run that ended while
   * nobody was listening cannot leave the console spinning forever with no exit but
   * a page reload. The decision itself is pure (decideAttachFallback).
   */
  const attachWatchdog = async (sessionId) => {
    if (Date.now() - sseActivityRef.current < ATTACH_IDLE_MS) {
      // Still streaming: re-arm the one-line notice for the next silence.
      attachWaitLoggedRef.current = false;
      return;
    }

    let resp;
    try {
      resp = await appApi.getCheckpoint(sessionId);
    } catch (err) {
      // The console is unreachable, not the run. Try again on the next tick rather
      // than tearing down a stream that may still deliver.
      return;
    }

    switch (decideAttachFallback(resp)) {
      case 'load-checkpoint':
        eventSourceClose(sseRef);
        setAttachedSession(null);
        dispatch({ type: APP_ACTIONS.SET_THEME, theme: resp.theme || 'journalist' });
        dispatch({
          type: APP_ACTIONS.CHECKPOINT_RECEIVED,
          checkpointType: resp.checkpointType || resp.checkpoint.type,
          data: resp.checkpoint,
          phase: resp.currentPhase
        });
        return;

      case 'complete': {
        eventSourceClose(sseRef);
        setAttachedSession(null);
        dispatch({ type: APP_ACTIONS.SET_THEME, theme: resp.theme || 'journalist' });
        // No SSE completion payload to forward, so rebuild what CompletionView needs
        // from the persisted outcome. Last link = the file the run actually wrote
        // when that differs from the conventional path (see buildReportLinks).
        const links = buildReportLinks(sessionId, resp.lastOutcome);
        dispatch({
          type: APP_ACTIONS.WORKFLOW_COMPLETE,
          result: {
            ...(resp.lastOutcome || {}),
            sessionId,
            currentPhase: 'complete',
            htmlUrl: links[links.length - 1] || null
          }
        });
        return;
      }

      case 'keep-waiting':
        if (!attachWaitLoggedRef.current) {
          attachWaitLoggedRef.current = true;
          dispatch({
            type: APP_ACTIONS.SSE_PROGRESS,
            message: 'No progress events for 20s, but the session is still running. Holding the stream open.'
          });
        }
        return;

      case 'stranded':
      default:
        eventSourceClose(sseRef);
        setAttachedSession(null);
        dispatch({
          type: APP_ACTIONS.SSE_ERROR,
          message: 'The run is no longer in progress and left no checkpoint; use Resume or Roll back.'
        });
        return;
    }
  };

  // Runs only while we are riding someone else's stream AND still processing. Every
  // terminal SSE branch clears `processing` (SSE_COMPLETE / WORKFLOW_COMPLETE /
  // SSE_ERROR), so the interval tears itself down the moment the run reports in —
  // it can never fire after a checkpoint has been delivered.
  React.useEffect(() => {
    // The sessionId match is structural, not defensive: attachedSession is App-local
    // state that outlives RESET_SESSION/LOGOUT, so without it a stale attach could
    // poll the previous session and dispatch ITS checkpoint into the current one.
    if (!attachedSession || attachedSession !== state.sessionId || !state.processing) {
      return undefined;
    }
    const timerId = setInterval(() => { attachWatchdog(attachedSession); }, ATTACH_POLL_MS);
    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachedSession, state.sessionId, state.processing]);

  /**
   * Streaming rollback (non-blocking /rollback). Same SSE contract as approve.
   */
  const streamingRollback = async (target, overrides) => {
    if (!state.sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    eventSourceClose(sseRef);
    // This call owns the stream now; release the attach watchdog.
    setAttachedSession(null);
    try {
      const { response, eventSource } = await appApi.rollback(
        state.sessionId, target, overrides, makeSseHandler(dispatch, sseRef, sseActivityRef)
      );
      assignSse(sseRef, eventSource);
      if (response.error) {
        handlePostFailure(dispatch, sseRef, state.sessionId, response);
      }
    } catch (err) {
      dispatch({ type: APP_ACTIONS.SET_ERROR, message: 'Rollback failed: ' + (err.message || 'Unknown error') });
    }
  };

  /**
   * Handle reject (for outline/article checkpoints in Batch 3B.6)
   * Same SSE-before-POST flow as approve — the payload shape determines
   * whether the server treats it as approval or rejection.
   */
  const handleReject = async (payload) => {
    return handleApprove(payload);
  };

  /**
   * Handle rollback confirmation from RollbackPanel modal
   * Delegates to streamingRollback for live SSE progress.
   */
  const handleRollbackConfirm = async (target, overrides) => {
    setRollbackTarget(null);
    await streamingRollback(target, overrides);
  };

  // ── Render ──

  // Not authenticated: show login overlay
  if (!state.authenticated) {
    return React.createElement(LoginOverlay, { dispatch });
  }

  // Build main content
  let content;

  if (!state.sessionId) {
    // No session: show session start
    content = React.createElement(SessionStart, { dispatch, theme: state.theme });
  } else if (state.processing || (state.llmActivity && state.llmActivity.phase === 'failed')) {
    // Processing (or a terminal failure card): macro stepper ABOVE the live feed.
    content = React.createElement(React.Fragment, null,
      // Keep the macro stepper anchored on the operator's current phase.
      state.checkpointType && React.createElement(PipelineProgress, {
        currentCheckpoint: state.checkpointType,
        onRollback: (target) => setRollbackTarget(target)
      }),
      React.createElement(ProgressStream, {
        processing: state.processing,
        llmActivity: state.llmActivity,
        lastLlmActivity: state.lastLlmActivity,
        eventLog: state.eventLog,
        // [Retry] = re-run the failed node via streaming resume.
        onRetry: () => streamingResume(state.sessionId),
        // [Roll back] = open the existing rollback modal at the current checkpoint.
        onRollback: () => setRollbackTarget(state.checkpointType)
      })
    );
  } else if (state.completedResult) {
    // Complete: show CompletionView
    content = React.createElement(CompletionView, {
      result: { ...state.completedResult, sessionId: state.sessionId },
      onNewSession: () => dispatch({ type: APP_ACTIONS.RESET_SESSION })
    });
  } else if (state.checkpointType) {
    // At checkpoint: render PipelineProgress + CheckpointShell with generic content
    // (Checkpoint-specific components added in Batches 3B.3-3B.6)
    content = React.createElement(React.Fragment, null,
      // Pipeline progress stepper
      React.createElement(PipelineProgress, {
        currentCheckpoint: state.checkpointType,
        onRollback: (target) => setRollbackTarget(target)
      }),

      // Checkpoint shell wrapping checkpoint-specific or generic content
      React.createElement(CheckpointShell, {
        type: state.checkpointType,
        phase: state.phase,
        data: state.checkpointData
      },
        // Render specific component if available, otherwise generic fallback
        CHECKPOINT_COMPONENTS[state.checkpointType]
          ? React.createElement(CHECKPOINT_COMPONENTS[state.checkpointType], {
              data: state.checkpointData,
              sessionId: state.sessionId,
              theme: state.theme,
              onApprove: handleApprove,
              onReject: handleReject,
              dispatch: dispatch,
              revisionCache: state.revisionCache,
              // pendingEdits is keyed by checkpointType (matches CHECKPOINT_COMPONENTS map keys above).
              // New checkpoints adding edit support must dispatch SAVE_PENDING_EDITS with
              // checkpoint: '<exact CHECKPOINT_COMPONENTS key>' (e.g., 'arc-selection', not 'arcs').
              pendingEdits: state.pendingEdits[state.checkpointType]
            })
          : React.createElement(React.Fragment, null,
              // Generic checkpoint content (replaced by specific components in later batches)
              React.createElement('p', { className: 'text-muted mb-lg text-sm' },
                'Checkpoint component not yet available. You can approve with the button below.'
              ),
              React.createElement('div', { className: 'flex gap-md' },
                React.createElement('button', {
                  className: 'btn btn-primary',
                  onClick: () => {
                    // Payloads for each checkpoint type. Data-input checkpoints
                    // (await-roster, character-ids, await-full-context) use custom
                    // UI with specific payloads — added in Batch 3B.4.
                    const payloads = {
                      'input-review': { inputReview: true },
                      'paper-evidence-selection': { selectedPaperEvidence: state.checkpointData.paperEvidence || [] },
                      'pre-curation': { preCuration: true },
                      'evidence-and-photos': { evidenceBundle: true },
                      'arc-selection': { selectedArcs: (state.checkpointData.narrativeArcs || []).map(a => a.id || a.title) },
                      'outline': { outline: true },
                      'article': { article: true }
                    };
                    const payload = payloads[state.checkpointType] || { approved: true };
                    handleApprove(payload);
                  }
                }, 'Approve')
              )
            )
      )
    );
  } else {
    // Fallback: show session start
    content = React.createElement(SessionStart, { dispatch, theme: state.theme });
  }

  return React.createElement(React.Fragment, null,
    // Header (only when session is active)
    state.sessionId && React.createElement('header', { className: 'console-header' },
      React.createElement('div', { className: 'flex items-center' },
        React.createElement('span', { className: 'console-header__title' }, 'ALN Console'),
        React.createElement('span', { className: 'console-header__session' },
          'Session: ' + state.sessionId
        ),
        state.theme === 'detective' && React.createElement('span', {
          className: 'badge badge--warning ml-sm'
        }, 'Detective')
      ),
      React.createElement('div', { className: 'console-header__actions' },
        state.phase && React.createElement('span', {
          className: 'text-muted console-header__phase-label'
        }, 'Phase: ' + state.phase),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: handleLogout
        }, 'Logout')
      )
    ),

    // Error banner (fixed position)
    state.error && React.createElement('div', { className: 'error-banner' },
      React.createElement('span', { className: 'error-banner__message' }, state.error),
      React.createElement('button', {
        className: 'error-banner__dismiss',
        onClick: () => dispatch({ type: APP_ACTIONS.CLEAR_ERROR }),
        'aria-label': 'Dismiss error'
      }, '\u2715')
    ),

    // Rollback confirmation modal
    rollbackTarget && React.createElement(RollbackPanel, {
      targetCheckpoint: rollbackTarget,
      onConfirm: handleRollbackConfirm,
      onCancel: () => setRollbackTarget(null)
    }),

    // Main content
    React.createElement('main', { className: 'console-main' }, content)
  );
}

// Mount application
const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(React.createElement(App));
}

window.Console.App = App;
