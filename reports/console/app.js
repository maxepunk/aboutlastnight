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
function makeSseHandler(dispatch, sseRef) {
  return (event) => {
    switch (event.type) {
      case 'connected':
        dispatch({ type: APP_ACTIONS.SSE_CONNECTED });
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
        dispatch({
          type: APP_ACTIONS.SSE_LLM_COMPLETE,
          response: null,
          elapsed: event.data.elapsed || null
        });
        dispatch({
          type: APP_ACTIONS.SSE_PROGRESS,
          message: `Extraction failed: ${event.data.error || 'unknown'} (channel=text_fallback, stop=${event.data.diagnostics?.stopReason || '?'}, structuredOutputPresent=${event.data.diagnostics?.structuredOutputPresent})`
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
        eventSourceClose(sseRef);
        dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
        dispatch({
          type: APP_ACTIONS.SSE_LLM_FAILURE,
          error: (event.data.error
            || (event.data.errors && event.data.errors[0] && event.data.errors[0].message)
            || 'Workflow failed') +
            (event.data.details ? ' — ' + event.data.details : '')
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

function App() {
  const [state, dispatch] = useAppState();
  const [rollbackTarget, setRollbackTarget] = React.useState(null);
  const sseRef = React.useRef(null);

  // Cleanup EventSource on unmount
  React.useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
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
    try {
      const { response, eventSource } = await appApi.approve(
        state.sessionId, payload, makeSseHandler(dispatch, sseRef)
      );
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
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
    try {
      const { response, eventSource } = await appApi.resume(sessionId, makeSseHandler(dispatch, sseRef));
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
      }
    } catch (err) {
      dispatch({ type: APP_ACTIONS.SSE_ERROR, message: 'Resume failed: ' + (err.message || 'Unknown error') });
    }
  };

  /**
   * Streaming rollback (non-blocking /rollback). Same SSE contract as approve.
   */
  const streamingRollback = async (target, overrides) => {
    if (!state.sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    try {
      const { response, eventSource } = await appApi.rollback(
        state.sessionId, target, overrides, makeSseHandler(dispatch, sseRef)
      );
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
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
