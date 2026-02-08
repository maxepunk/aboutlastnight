/**
 * Root App Component
 * Auth gate, session management, checkpoint routing.
 * Mounts via ReactDOM.createRoot.
 * Exports to window.Console.App
 */

window.Console = window.Console || {};

const { api: appApi } = window.Console;
const { useAppState, ACTIONS: APP_ACTIONS, LoginOverlay, SessionStart } = window.Console;
const { CHECKPOINT_LABELS } = window.Console.utils;

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
                model: event.data.model || 'unknown'
              });
              break;
            case 'llm_complete':
              dispatch({ type: APP_ACTIONS.SSE_LLM_COMPLETE });
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

      // Track EventSource for cleanup on unmount
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
   * Handle reject (for outline/article checkpoints)
   * Same flow as approve but with different payload
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
    // Processing: show placeholder (ProgressStream added in Batch 3B.2)
    content = React.createElement('div', { className: 'glass-panel fade-in', style: { textAlign: 'center', padding: '60px 24px' } },
      React.createElement('div', { className: 'pulse', style: { fontSize: '2rem', marginBottom: '16px' } }, '\u29D7'),
      React.createElement('h3', { style: { color: 'var(--accent-amber)', marginBottom: '8px' } }, 'Processing'),
      React.createElement('p', { className: 'text-secondary' }, 'Workflow is running...'),
      state.progressMessages.length > 0 &&
        React.createElement('p', { className: 'text-muted', style: { marginTop: '16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' } },
          state.progressMessages[state.progressMessages.length - 1]
        )
    );
  } else if (state.completedResult) {
    // Complete: show placeholder (CompletionView added in Batch 3B.7)
    content = React.createElement('div', { className: 'glass-panel fade-in', style: { textAlign: 'center', padding: '60px 24px' } },
      React.createElement('h2', { style: { color: 'var(--accent-green)', marginBottom: '16px' } }, 'Workflow Complete'),
      React.createElement('p', { className: 'text-secondary' }, 'Session ' + state.sessionId + ' finished successfully.'),
      state.completedResult.outputPath &&
        React.createElement('p', { className: 'text-muted', style: { marginTop: '8px' } },
          'Output: ' + state.completedResult.outputPath
        ),
      React.createElement('button', {
        className: 'btn btn-secondary',
        style: { marginTop: '24px' },
        onClick: () => dispatch({ type: APP_ACTIONS.LOGOUT })
      }, 'New Session')
    );
  } else if (state.checkpointType) {
    // At checkpoint: show placeholder (checkpoint components added in Batches 3B.3-3B.6)
    const label = CHECKPOINT_LABELS[state.checkpointType] || state.checkpointType;
    content = React.createElement('div', { className: 'glass-panel fade-in' },
      React.createElement('h3', { style: { color: 'var(--accent-amber)', marginBottom: '12px' } },
        'Checkpoint: ' + label
      ),
      React.createElement('p', { className: 'text-secondary', style: { marginBottom: '16px' } },
        'Phase: ' + (state.phase || 'unknown')
      ),
      React.createElement('p', { className: 'text-muted', style: { marginBottom: '24px', fontSize: '0.85rem' } },
        'Checkpoint components will be added in subsequent batches. For now, you can approve with the button below.'
      ),
      // Generic approve button (replaced by specific checkpoint components later)
      React.createElement('div', { style: { display: 'flex', gap: '12px' } },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: () => {
            // Build a generic approval payload based on checkpoint type
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
      ),
      // Raw JSON viewer for debugging
      React.createElement('details', { style: { marginTop: '24px' } },
        React.createElement('summary', {
          style: { cursor: 'pointer', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }
        }, 'View Raw Checkpoint Data'),
        React.createElement('pre', {
          style: { marginTop: '8px', fontSize: '0.75rem', maxHeight: '400px', overflow: 'auto' }
        }, JSON.stringify(state.checkpointData, null, 2))
      )
    );
  } else {
    // Fallback: show session start
    content = React.createElement(SessionStart, { dispatch });
  }

  return React.createElement(React.Fragment, null,
    // Header (only when session is active)
    state.sessionId && React.createElement('header', { className: 'console-header' },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center' } },
        React.createElement('span', { className: 'console-header__title' }, 'ALN Console'),
        React.createElement('span', { className: 'console-header__session' },
          'Session: ' + state.sessionId
        )
      ),
      React.createElement('div', { className: 'console-header__actions' },
        state.phase && React.createElement('span', {
          className: 'text-muted',
          style: { fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }
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
