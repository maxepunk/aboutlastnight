/**
 * SessionStart Component
 * Session ID input (4-digit MMDD), Start Fresh and Resume buttons.
 * Exports to window.Console.SessionStart
 */

window.Console = window.Console || {};

const { api: sessionApi } = window.Console;
const { ACTIONS: SESSION_ACTIONS } = window.Console;

function SessionStart({ dispatch }) {
  const [sessionId, setSessionId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const isValid = /^\d{4}$/.test(sessionId);

  /**
   * Handle Start Fresh — calls api.startSession
   * On checkpoint response: dispatches SET_SESSION then CHECKPOINT_RECEIVED
   */
  const handleStart = async () => {
    if (!isValid) return;
    setLoading(true);
    setStatus('Starting fresh session...');

    try {
      const result = await sessionApi.startSession(sessionId, {
        photosPath: 'data/' + sessionId + '/photos'
      });

      if (result.error) {
        setStatus('Error: ' + result.error);
        setLoading(false);
        return;
      }

      dispatch({ type: SESSION_ACTIONS.SET_SESSION, sessionId });

      if (result.interrupted && result.checkpoint) {
        dispatch({
          type: SESSION_ACTIONS.CHECKPOINT_RECEIVED,
          checkpointType: result.checkpoint.type,
          data: result.checkpoint,
          phase: result.currentPhase
        });
      }
    } catch (err) {
      setStatus('Connection failed. Is the server running?');
      setLoading(false);
    }
  };

  /**
   * Handle Resume — calls api.getCheckpoint, then dispatches accordingly
   * If interrupted: SET_SESSION + CHECKPOINT_RECEIVED
   * If not interrupted: calls api.resume
   */
  const handleResume = async () => {
    if (!isValid) return;
    setLoading(true);
    setStatus('Checking session state...');

    try {
      const checkpoint = await sessionApi.getCheckpoint(sessionId);

      // Session not found
      if (checkpoint.error || (!checkpoint.interrupted && !checkpoint.currentPhase)) {
        setStatus('No existing session found. Use "Start Fresh" instead.');
        setLoading(false);
        return;
      }

      dispatch({ type: SESSION_ACTIONS.SET_SESSION, sessionId });

      if (checkpoint.interrupted && checkpoint.checkpoint) {
        // Session is at a checkpoint — load it
        dispatch({
          type: SESSION_ACTIONS.CHECKPOINT_RECEIVED,
          checkpointType: checkpoint.checkpointType || checkpoint.checkpoint.type,
          data: checkpoint.checkpoint,
          phase: checkpoint.currentPhase
        });
      } else {
        // Not at a checkpoint — resume the workflow
        setStatus('Resuming workflow...');
        const result = await sessionApi.resume(sessionId);

        if (result.interrupted && result.checkpoint) {
          dispatch({
            type: SESSION_ACTIONS.CHECKPOINT_RECEIVED,
            checkpointType: result.checkpoint.type,
            data: result.checkpoint,
            phase: result.currentPhase
          });
        } else if (result.currentPhase === 'complete') {
          dispatch({
            type: SESSION_ACTIONS.WORKFLOW_COMPLETE,
            result
          });
        } else {
          setStatus('Session at phase: ' + (result.currentPhase || 'unknown'));
          setLoading(false);
        }
      }
    } catch (err) {
      setStatus('Connection failed. Is the server running?');
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && isValid && !loading) {
      handleResume();
    }
  };

  return React.createElement('div', { className: 'session-start fade-in' },
    React.createElement('h2', { className: 'session-start__title' }, 'Session'),
    React.createElement('p', { className: 'session-start__subtitle' },
      'Enter a 4-digit session ID (MMDD format) to start or resume a workflow.'
    ),
    React.createElement('div', { className: 'session-start__input-group' },
      React.createElement('label', { htmlFor: 'session-id' }, 'Session ID'),
      React.createElement('input', {
        id: 'session-id',
        type: 'text',
        className: 'input input-mono',
        placeholder: '1221',
        value: sessionId,
        onChange: (e) => {
          const val = e.target.value.replace(/\D/g, '').slice(0, 4);
          setSessionId(val);
          setStatus('');
        },
        onKeyDown: handleKeyDown,
        maxLength: 4,
        autoFocus: true,
        disabled: loading,
        style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.3em' }
      })
    ),
    React.createElement('div', { className: 'session-start__actions' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleStart,
        disabled: !isValid || loading
      }, 'Start Fresh'),
      React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: handleResume,
        disabled: !isValid || loading
      }, 'Resume')
    ),
    status && React.createElement('p', { className: 'session-start__status' }, status)
  );
}

window.Console.SessionStart = SessionStart;
