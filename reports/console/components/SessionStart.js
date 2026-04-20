/**
 * SessionStart Component
 * Session ID input (alphanumeric + hyphens), photos path, optional whiteboard path.
 * Browse buttons open FileBrowser modal for server-side path selection.
 * Start Fresh and Resume buttons.
 * Exports to window.Console.SessionStart
 */

window.Console = window.Console || {};

const { api: sessionApi } = window.Console;
const { ACTIONS: SESSION_ACTIONS } = window.Console;
const { CollapsibleSection } = window.Console.utils;
const { FileBrowser } = window.Console;

function SessionStart({ dispatch, theme }) {
  const [sessionId, setSessionId] = React.useState('');
  const [photosPath, setPhotosPath] = React.useState('');
  const [whiteboardPath, setWhiteboardPath] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [reporterName, setReporterName] = React.useState('');
  const [reportingMode, setReportingMode] = React.useState('on-site');
  const [guestReporterName, setGuestReporterName] = React.useState('');
  const [guestReporterRole, setGuestReporterRole] = React.useState('');

  // FileBrowser modal state
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [browseMode, setBrowseMode] = React.useState('directory');
  const [browseInitialPath, setBrowseInitialPath] = React.useState('');
  const [browseTarget, setBrowseTarget] = React.useState(null); // 'photos' | 'whiteboard'

  const isValid = /^[a-zA-Z0-9-]{1,30}$/.test(sessionId);
  const defaultPhotosPath = sessionId ? 'data/' + sessionId + '/photos' : '';

  /**
   * Build rawSessionInput from form fields
   */
  function buildRawInput() {
    const raw = {
      photosPath: photosPath.trim() || defaultPhotosPath
    };
    if (whiteboardPath.trim()) {
      raw.whiteboardPhotoPath = whiteboardPath.trim();
    }
    if (theme === 'journalist') {
      raw.journalistFirstName = reporterName.trim() || 'Cassandra';
      raw.reportingMode = reportingMode;
      if (guestReporterName.trim()) {
        raw.guestReporter = {
          name: guestReporterName.trim(),
          role: guestReporterRole.trim() || 'Guest Reporter'
        };
      }
    }
    return raw;
  }

  /**
   * Open file browser for a given target field
   */
  const openBrowser = (target, mode) => {
    setBrowseTarget(target);
    setBrowseMode(mode);
    // Use current value as initial path, or fall back to default
    if (target === 'photos') {
      setBrowseInitialPath(photosPath.trim() || defaultPhotosPath || '');
    } else {
      setBrowseInitialPath(whiteboardPath.trim() || '');
    }
    setBrowseOpen(true);
  };

  const handleBrowseSelect = (selectedPath) => {
    if (browseTarget === 'photos') {
      setPhotosPath(selectedPath);
    } else if (browseTarget === 'whiteboard') {
      setWhiteboardPath(selectedPath);
    }
    setBrowseOpen(false);
  };

  /**
   * Handle Start Fresh — calls api.startSession
   * On checkpoint response: dispatches SET_SESSION then CHECKPOINT_RECEIVED
   */
  const handleStart = async () => {
    if (!isValid) return;
    setLoading(true);
    setStatus('Starting fresh session...');

    try {
      const result = await sessionApi.startSession(sessionId, buildRawInput(), theme);

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
      setLoading(false);
      setStatus('');
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
      'Enter a session ID (e.g. 1221, march-15-matinee) to start or resume a workflow.'
    ),

    // Theme selector
    React.createElement('div', { className: 'theme-selector' },
      React.createElement('label', { className: 'form-label' }, 'Report Theme'),
      React.createElement('div', { className: 'theme-toggle' },
        React.createElement('button', {
          className: 'theme-option' + (theme === 'journalist' ? ' active' : ''),
          onClick: () => dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: 'journalist' }),
          disabled: loading,
          type: 'button',
          'aria-pressed': theme === 'journalist'
        },
          React.createElement('span', { className: 'theme-option__name' }, 'NovaNews Article'),
          React.createElement('span', { className: 'theme-option__desc' }, 'First-person investigative journalism (~3000 words)')
        ),
        React.createElement('button', {
          className: 'theme-option' + (theme === 'detective' ? ' active' : ''),
          onClick: () => dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: 'detective' }),
          disabled: loading,
          type: 'button',
          'aria-pressed': theme === 'detective'
        },
          React.createElement('span', { className: 'theme-option__name' }, 'Detective Case Report'),
          React.createElement('span', { className: 'theme-option__desc' }, 'Official case file by Det. Anondono (~750 words)')
        )
      )
    ),

    // Session ID
    React.createElement('div', { className: 'session-start__input-group' },
      React.createElement('label', { htmlFor: 'session-id' }, 'Session ID'),
      React.createElement('input', {
        id: 'session-id',
        type: 'text',
        className: 'input input-mono',
        placeholder: '1221',
        value: sessionId,
        onChange: (e) => {
          const val = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 30);
          setSessionId(val);
          setStatus('');
        },
        onKeyDown: handleKeyDown,
        maxLength: 30,
        autoFocus: true,
        disabled: loading
      })
    ),

    // Reporter First Name (journalist theme only)
    theme === 'journalist' && React.createElement('div', { className: 'session-start__input-group mt-md' },
      React.createElement('label', { htmlFor: 'reporter-name' }, 'Reporter First Name'),
      React.createElement('input', {
        id: 'reporter-name',
        type: 'text',
        className: 'input',
        placeholder: 'Cassandra',
        value: reporterName,
        onChange: (e) => setReporterName(e.target.value),
        disabled: loading,
        'aria-label': 'First name of the journalist character for this session'
      }),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'Leave blank for default (Cassandra Nova)'
      )
    ),

    // Reporting Mode (journalist theme only)
    theme === 'journalist' && React.createElement('div', { className: 'session-start__input-group mt-md' },
      React.createElement('label', null, 'Reporting Mode'),
      React.createElement('div', { className: 'flex gap-md mt-xs', role: 'radiogroup', 'aria-label': 'Whether Nova was physically present at the investigation' },
        React.createElement('label', { className: 'flex gap-sm items-center text-sm' },
          React.createElement('input', {
            type: 'radio',
            name: 'reporting-mode',
            value: 'on-site',
            checked: reportingMode === 'on-site',
            onChange: () => setReportingMode('on-site'),
            disabled: loading
          }),
          React.createElement('span', null, 'On-site')
        ),
        React.createElement('label', { className: 'flex gap-sm items-center text-sm' },
          React.createElement('input', {
            type: 'radio',
            name: 'reporting-mode',
            value: 'remote',
            checked: reportingMode === 'remote',
            onChange: () => setReportingMode('remote'),
            disabled: loading
          }),
          React.createElement('span', null, 'Remote')
        )
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'On-site: Nova physically present at investigation. Remote: receiving tips remotely.'
      )
    ),

    // Guest Reporter (journalist theme only, optional, collapsed by default)
    theme === 'journalist' && React.createElement('div', { className: 'mt-sm' },
      React.createElement(CollapsibleSection, {
        title: 'Guest Reporter (Optional)',
        defaultOpen: false
      },
        React.createElement('div', { className: 'session-start__input-group' },
          React.createElement('label', { htmlFor: 'guest-reporter-name' }, 'Name'),
          React.createElement('input', {
            id: 'guest-reporter-name',
            type: 'text',
            className: 'input',
            placeholder: 'e.g. Ashe Motoko',
            value: guestReporterName,
            onChange: (e) => setGuestReporterName(e.target.value),
            disabled: loading,
            'aria-label': 'Name of the player or character credited as guest reporter'
          })
        ),
        React.createElement('div', { className: 'session-start__input-group mt-sm' },
          React.createElement('label', { htmlFor: 'guest-reporter-role' }, 'Role'),
          React.createElement('input', {
            id: 'guest-reporter-role',
            type: 'text',
            className: 'input',
            placeholder: 'Guest Reporter',
            value: guestReporterRole,
            onChange: (e) => setGuestReporterRole(e.target.value),
            disabled: loading,
            'aria-label': 'Role or title of the guest reporter'
          }),
          React.createElement('p', { className: 'text-muted text-xs mt-xs' },
            'Leave Name blank to omit. Role defaults to "Guest Reporter" if blank.'
          )
        )
      )
    ),

    // Photos Path (with Browse button)
    React.createElement('div', { className: 'session-start__input-group mt-md' },
      React.createElement('label', { htmlFor: 'photos-path' }, 'Photos Path'),
      React.createElement('div', { className: 'file-browser__input-row' },
        React.createElement('input', {
          id: 'photos-path',
          type: 'text',
          className: 'input input-mono text-sm',
          placeholder: defaultPhotosPath || 'data/{sessionId}/photos',
          value: photosPath,
          onChange: (e) => setPhotosPath(e.target.value),
          disabled: loading,
          'aria-label': 'Directory containing session photos'
        }),
        React.createElement('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => openBrowser('photos', 'directory'),
          disabled: loading,
          type: 'button',
          'aria-label': 'Browse for photos directory'
        }, 'Browse')
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        defaultPhotosPath
          ? 'Default: ' + defaultPhotosPath
          : 'Enter session ID to see default path'
      )
    ),

    // Whiteboard Photo Path (optional, collapsed, with Browse button)
    React.createElement('div', { className: 'mt-sm' },
      React.createElement(CollapsibleSection, {
        title: 'Whiteboard Photo (Optional)',
        defaultOpen: false
      },
        React.createElement('div', { className: 'session-start__input-group' },
          React.createElement('div', { className: 'file-browser__input-row' },
            React.createElement('input', {
              id: 'whiteboard-path',
              type: 'text',
              className: 'input input-mono text-sm',
              placeholder: 'path/to/whiteboard.jpg',
              value: whiteboardPath,
              onChange: (e) => setWhiteboardPath(e.target.value),
              disabled: loading,
              'aria-label': 'Path to whiteboard photo if not in photos directory'
            }),
            React.createElement('button', {
              className: 'btn btn-secondary btn-sm',
              onClick: () => openBrowser('whiteboard', 'file'),
              disabled: loading,
              type: 'button',
              'aria-label': 'Browse for whiteboard photo'
            }, 'Browse')
          ),
          React.createElement('p', { className: 'text-muted text-xs mt-xs' },
            'Only needed if the whiteboard photo is outside the photos directory. ' +
            'The pipeline auto-detects whiteboard images by filename.'
          )
        )
      )
    ),

    // Actions
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

    status && React.createElement('p', { className: 'session-start__status' }, status),

    // FileBrowser modal
    React.createElement(FileBrowser, {
      open: browseOpen,
      mode: browseMode,
      initialPath: browseInitialPath,
      onSelect: handleBrowseSelect,
      onCancel: () => setBrowseOpen(false)
    })
  );
}

window.Console.SessionStart = SessionStart;
