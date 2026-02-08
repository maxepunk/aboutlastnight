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
const { CHECKPOINT_LABELS } = window.Console.utils;

// Checkpoint type -> specific component mapping (Batch 3B.3)
const CHECKPOINT_COMPONENTS = {
  'input-review': window.Console.checkpoints && window.Console.checkpoints.InputReview,
  'paper-evidence-selection': window.Console.checkpoints && window.Console.checkpoints.PaperEvidence,
  'pre-curation': window.Console.checkpoints && window.Console.checkpoints.PreCuration
};

function App() {
  const [state, dispatch] = useAppState();
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
        state.sessionId,
        payload,
        (event) => {
          // Dispatch SSE events to state machine
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
            case 'llm_complete':
              dispatch({
                type: APP_ACTIONS.SSE_LLM_COMPLETE,
                response: event.data.response || null,
                elapsed: event.data.elapsed || null
              });
              break;
            case 'complete':
              // Close SSE connection
              eventSource.close();
              sseRef.current = null;
              dispatch({ type: APP_ACTIONS.SSE_COMPLETE });

              // Parse the completion result
              const result = event.data;
              if (result.interrupted && result.checkpoint) {
                dispatch({
                  type: APP_ACTIONS.CHECKPOINT_RECEIVED,
                  checkpointType: result.checkpoint.type,
                  data: result.checkpoint,
                  phase: result.currentPhase
                });
              } else if (result.currentPhase === 'complete') {
                dispatch({
                  type: APP_ACTIONS.WORKFLOW_COMPLETE,
                  result
                });
              } else if (result.currentPhase === 'error') {
                dispatch({
                  type: APP_ACTIONS.SET_ERROR,
                  message: result.error || 'Workflow error'
                });
              }
              break;
            case 'error':
              eventSource.close();
              sseRef.current = null;
              dispatch({
                type: APP_ACTIONS.SSE_ERROR,
                message: event.data.message || 'Connection lost'
              });
              break;
          }
        }
      );

      // Track EventSource for cleanup on unmount.
      // EventSource.close() is idempotent, so double-close on unmount is safe.
      sseRef.current = eventSource;

      // Check for immediate POST errors
      if (response.error) {
        dispatch({
          type: APP_ACTIONS.SET_ERROR,
          message: response.error
        });
      }
    } catch (err) {
      dispatch({
        type: APP_ACTIONS.SSE_ERROR,
        message: 'Failed to connect: ' + (err.message || 'Unknown error')
      });
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

  // ── Render ──

  // Not authenticated: show login overlay
  if (!state.authenticated) {
    return React.createElement(LoginOverlay, { dispatch });
  }

  // Build main content
  let content;

  if (!state.sessionId) {
    // No session: show session start
    content = React.createElement(SessionStart, { dispatch });
  } else if (state.processing) {
    // Processing: show ProgressStream with real-time SSE data
    content = React.createElement(ProgressStream, {
      processing: state.processing,
      llmActivity: state.llmActivity,
      lastLlmActivity: state.lastLlmActivity,
      progressMessages: state.progressMessages
    });
  } else if (state.completedResult) {
    // Complete: show placeholder (CompletionView added in Batch 3B.7)
    content = React.createElement('div', { className: 'glass-panel fade-in text-center p-xl' },
      React.createElement('h2', { className: 'text-accent-green mb-md' }, 'Workflow Complete'),
      React.createElement('p', { className: 'text-secondary' }, 'Session ' + state.sessionId + ' finished successfully.'),
      state.completedResult.outputPath &&
        React.createElement('p', { className: 'text-muted mt-sm' },
          'Output: ' + state.completedResult.outputPath
        ),
      React.createElement('button', {
        className: 'btn btn-secondary mt-lg',
        onClick: () => dispatch({ type: APP_ACTIONS.LOGOUT })
      }, 'New Session')
    );
  } else if (state.checkpointType) {
    // At checkpoint: render PipelineProgress + CheckpointShell with generic content
    // (Checkpoint-specific components added in Batches 3B.3-3B.6)
    const handleRollback = async (rollbackTo) => {
      if (!state.sessionId) return;
      dispatch({ type: APP_ACTIONS.PROCESSING_START });
      try {
        const result = await appApi.rollback(state.sessionId, rollbackTo);
        if (result.error) {
          dispatch({ type: APP_ACTIONS.SET_ERROR, message: result.error });
        } else if (result.interrupted && result.checkpoint) {
          dispatch({
            type: APP_ACTIONS.CHECKPOINT_RECEIVED,
            checkpointType: result.checkpoint.type,
            data: result.checkpoint,
            phase: result.currentPhase
          });
        }
      } catch (err) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: 'Rollback failed: ' + (err.message || 'Unknown error') });
      }
    };

    content = React.createElement(React.Fragment, null,
      // Pipeline progress stepper
      // TODO(3B.7): Pass completedCheckpoints from server state for accuracy after rollback
      React.createElement(PipelineProgress, {
        currentCheckpoint: state.checkpointType,
        onRollback: handleRollback
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
              onApprove: handleApprove,
              onReject: handleReject
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
    content = React.createElement(SessionStart, { dispatch });
  }

  return React.createElement(React.Fragment, null,
    // Header (only when session is active)
    state.sessionId && React.createElement('header', { className: 'console-header' },
      React.createElement('div', { className: 'flex items-center' },
        React.createElement('span', { className: 'console-header__title' }, 'ALN Console'),
        React.createElement('span', { className: 'console-header__session' },
          'Session: ' + state.sessionId
        )
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

    // Error banner
    state.error && React.createElement('div', { className: 'error-banner' },
      React.createElement('span', { className: 'error-banner__message' }, state.error),
      React.createElement('button', {
        className: 'error-banner__dismiss',
        onClick: () => dispatch({ type: APP_ACTIONS.CLEAR_ERROR })
      }, '\u2715')
    ),

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
