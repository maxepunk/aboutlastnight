/**
 * SessionStart Component
 * Session ID input (the session date, MMDDYY + optional session digit — see
 * session-start-logic.js), photos path, optional whiteboard path.
 * Browse buttons open FileBrowser modal for server-side path selection.
 * Start Fresh, and a Resume that classifies the session before it spends anything.
 * Exports to window.Console.SessionStart
 */

window.Console = window.Console || {};

const { api: sessionApi } = window.Console;
const { ACTIONS: SESSION_ACTIONS } = window.Console;
const { CollapsibleSection } = window.Console.utils;
const { FileBrowser } = window.Console;
// Pure, node-tested (console/__tests__/session-start-logic.test.js). This component
// is a thin consumer: it does not decide what a valid ID is or what a session state
// means, it only renders the answer.
const { isValidSessionId, classifyCheckpointResponse, startFreshDecision, completedResultFrom } =
  window.Console.sessionStartLogic;

function SessionStart({ dispatch, theme }) {
  const [sessionId, setSessionId] = React.useState('');
  const [photosPath, setPhotosPath] = React.useState('');
  const [whiteboardPath, setWhiteboardPath] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  // C1: `{ phase }` while the director is being asked whether to discard an
  // existing session's state; null the rest of the time.
  const [pendingStart, setPendingStart] = React.useState(null);
  // Mirrors the server's ALLOW_NONSTANDARD_SESSION_ID so this screen accepts exactly
  // what POST /start accepts. Defaults to the strict contract until /api/config answers.
  const [allowNonstandardId, setAllowNonstandardId] = React.useState(false);
  const [reporterName, setReporterName] = React.useState('');
  const [reportingMode, setReportingMode] = React.useState('on-site');
  const [guestReporterName, setGuestReporterName] = React.useState('');
  const [guestReporterRole, setGuestReporterRole] = React.useState('');

  // FileBrowser modal state
  const [browseOpen, setBrowseOpen] = React.useState(false);
  const [browseMode, setBrowseMode] = React.useState('directory');
  const [browseInitialPath, setBrowseInitialPath] = React.useState('');
  const [browseTarget, setBrowseTarget] = React.useState(null); // 'photos' | 'whiteboard'

  React.useEffect(() => {
    sessionApi.getConfig()
      .then((cfg) => setAllowNonstandardId(cfg && cfg.allowNonstandardSessionId === true))
      .catch(() => { /* Unreachable config: hold the strict contract. */ });
  }, []);

  // B9 companion: the session ID is the session DATE (MMDDYY, plus one digit for a
  // second session that day), not a label. The follow-up emailer builds every
  // player's report link from it and data/<id>/ + outputs/report-<id>.html are named
  // after it, so a typed "1221" or "march-15" splits one session's artifacts across
  // directories — which already happened to 071126. POST /start rejects those now;
  // this keeps the button from promising otherwise.
  const isValid = isValidSessionId(sessionId, allowNonstandardId);
  const defaultPhotosPath = sessionId ? 'data/' + sessionId + '/photos' : '';

  /** Clear whatever the last attempt left on screen. */
  function resetStatus() {
    setStatus('');
    setPendingStart(null);
  }

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
   * POST /start. `force` discards an existing thread's state on purpose (C1).
   * On checkpoint response: dispatches SET_SESSION then CHECKPOINT_RECEIVED
   */
  const postStart = async (force) => {
    setLoading(true);
    setPendingStart(null);
    setStatus(force ? 'Starting over, discarding the old state...' : 'Starting fresh session...');

    try {
      const result = await sessionApi.startSession(sessionId, buildRawInput(), theme, force);

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
   * Handle Start Fresh — read GET /checkpoint first, and never discard a session's
   * state without being asked to (C1).
   *
   * This button POSTed /start unconditionally, and /start seeded its state from
   * buildRollbackState('input-review'): a list that preserves everything upstream
   * of the parse, plus the photo channels. So starting over on the same session
   * date — the most likely thing to do after a mistake — silently kept the old
   * photo list, the old roster and the old parse, paused once at input-review
   * showing them, and never read the newly typed photosPath. The route refuses an
   * existing thread now; asking here is what makes the refusal a choice instead of
   * an error message.
   */
  const handleStart = async () => {
    if (!isValid) return;
    setLoading(true);
    resetStatus();
    setStatus('Checking session state...');

    let checkpoint;
    try {
      checkpoint = await sessionApi.getCheckpoint(sessionId);
    } catch (err) {
      setStatus('Connection failed. Is the server running?');
      setLoading(false);
      return;
    }

    switch (startFreshDecision(checkpoint)) {
      case 'not-allowed':
        // H8: a run holds the session lock. /start would 409 on it, and re-seeding
        // state under a running graph is not something to offer a button for.
        setStatus('A run is already in progress for this session. Use Resume to attach to it.');
        setLoading(false);
        return;

      case 'confirm':
        setPendingStart({ phase: checkpoint.currentPhase || 'an earlier step' });
        setStatus('');
        setLoading(false);
        return;

      case 'go':
      default:
        await postStart(false);
        return;
    }
  };

  /**
   * Handle Resume — read GET /checkpoint, classify it, take exactly one action.
   *
   * The old guard only rejected a thread with NO currentPhase, so a COMPLETE
   * session passed straight through to /resume and re-invoked the graph from START
   * (B9): every checkpoint's skip condition already satisfied, so it never paused —
   * Notion re-fetch, Haiku vision on every photo, Opus arcs, outline, article, and
   * an overwritten published report, unattended, from one click on a button that
   * does not sound destructive. The five branches below are the five things a
   * session can be; only two of them may start work.
   */
  const handleResume = async () => {
    if (!isValid) return;
    setLoading(true);
    resetStatus();
    setStatus('Checking session state...');

    try {
      const checkpoint = await sessionApi.getCheckpoint(sessionId);

      switch (classifyCheckpointResponse(checkpoint)) {
        case 'not-found':
          setStatus('No existing session found. Use "Start Fresh" instead.');
          setLoading(false);
          return;

        case 'at-checkpoint':
          // H2: SET_THEME FIRST. The theme decides which template, which checkpoint
          // editors, and which section shapes render; dispatched after
          // CHECKPOINT_RECEIVED (or not at all) a resumed detective thread rendered
          // an empty journalist Outline card with live Approve buttons.
          dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: checkpoint.theme || 'journalist' });
          dispatch({ type: SESSION_ACTIONS.SET_SESSION, sessionId });
          dispatch({
            type: SESSION_ACTIONS.CHECKPOINT_RECEIVED,
            checkpointType: checkpoint.checkpointType || checkpoint.checkpoint.type,
            data: checkpoint.checkpoint,
            phase: checkpoint.currentPhase
          });
          return;

        case 'in-progress':
          // H8: a run is holding the session lock — the director refreshed, slept the
          // laptop, or lost the tunnel mid-call. POSTing anything here 409s; attach to
          // the running stream instead. App owns the EventSource (this component
          // unmounts as soon as sessionId is set).
          dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: checkpoint.theme || 'journalist' });
          dispatch({ type: SESSION_ACTIONS.ATTACH_REQUESTED, sessionId });
          return;

        case 'complete':
          // B9: do NOT resume — re-invoking a complete thread re-runs the whole
          // paid pipeline unattended and overwrites the session's own files.
          //
          // Task 2 review finding 3: load the COMPLETION instead. A complete
          // thread has no checkpoint, so until now neither rollback opener could
          // be reached for it, and re-running the article or outline of a
          // finished session with a note is a real need (the baseline shows
          // sessions republished after edits). SESSION_COMPLETE_LOADED puts the
          // completion view up with the stepper above it, which is how the
          // existing RollbackPanel flow becomes reachable. Nothing is POSTed
          // here, and nothing is POSTed until the director confirms a rollback.
          //
          // This screen sets NO status and NO link list: `SET_SESSION` unmounts
          // it immediately, so anything rendered here would never be seen.
          // `CompletionView` carries the report link, and completedResultFrom
          // derives it with buildReportLinks — including the B1 case where the
          // run published under a different id (071126 -> report-0711.html).
          //
          // H2: theme first, as in the at-checkpoint branch — a rollback from
          // here renders checkpoint editors that are theme-specific.
          dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: checkpoint.theme || 'journalist' });
          dispatch({ type: SESSION_ACTIONS.SET_SESSION, sessionId });
          dispatch({
            type: SESSION_ACTIONS.SESSION_COMPLETE_LOADED,
            // Never null here: `isValid` guarantees a non-empty sessionId, which
            // is all completedResultFrom needs (pinned by its unit tests).
            result: completedResultFrom(checkpoint, sessionId)
          });
          return;

        case 'resumable':
        default:
          // Stopped mid-pipeline and nothing is running: resuming re-enters at the
          // saved state. /resume is non-blocking (returns {status:'processing'} and
          // streams the result via SSE) and this component unmounts once sessionId is
          // set, so App drives it off the pendingResume flag.
          dispatch({ type: SESSION_ACTIONS.SET_THEME, theme: checkpoint.theme || 'journalist' });
          dispatch({ type: SESSION_ACTIONS.RESUME_REQUESTED, sessionId });
          return;
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
      'Session ID is the session date as MMDDYY (e.g. 091826). Second session the same day: ' +
      'add a digit (0918262). The follow-up email links to /outputs/report-<id>.html.'
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
        placeholder: '091826',
        value: sessionId,
        onChange: (e) => {
          const val = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 30);
          setSessionId(val);
          resetStatus();
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
    theme === 'journalist' && React.createElement('div', { className: 'mt-md' },
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

    // C1: the Start Fresh confirmation. Inline rather than a modal because the
    // director may want to change the session ID or the photos path instead, and
    // both inputs are still on screen behind it.
    pendingStart && React.createElement('div', {
      className: 'session-start__confirm',
      role: 'alertdialog',
      'aria-label': 'Confirm starting over'
    },
      React.createElement('p', null,
        'Session ' + sessionId + ' already has state at ' + pendingStart.phase +
        '. Start over and discard it?'
      ),
      React.createElement('p', { className: 'text-xs mt-xs' },
        'Everything that run produced is discarded and the pipeline re-runs from the top, ' +
        'including the paid model calls. Resume picks it up where it stopped instead.'
      ),
      React.createElement('div', { className: 'session-start__confirm-actions mt-sm' },
        React.createElement('button', {
          className: 'btn btn-danger btn-sm',
          onClick: () => postStart(true),
          disabled: loading,
          type: 'button'
        }, 'Start over, discard it'),
        React.createElement('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => setPendingStart(null),
          disabled: loading,
          type: 'button'
        }, 'Cancel')
      )
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
