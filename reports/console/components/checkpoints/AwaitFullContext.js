/**
 * AwaitFullContext Checkpoint Component
 * Collects accusation, session report, and director notes.
 * Displays what has already been provided (roster, whiteboard).
 * Every field shows its word count and how it ends, so a truncated paste is
 * visible before submit (baseline §6(a)), and the three values are debounced
 * into pendingEdits so a processing error cannot lose them.
 * Exports to window.Console.checkpoints.AwaitFullContext
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge } = window.Console.utils;
const ViewLogic = window.Console.checkpointViewLogic;

// How long after the last keystroke the draft is written to pendingEdits.
const DRAFT_DEBOUNCE_MS = 600;

/**
 * `N words - ends with: "..."` under a field.
 *
 * Session 062726's director notes reached the pipeline two paragraphs short and
 * nothing on any screen could have shown it. This is the cheapest possible
 * check: read the last line of your own paste before you submit it.
 */
function PasteReceipt({ label, text }) {
  const view = ViewLogic.wordTail(text);
  if (view.words === 0) return null;
  return React.createElement('p', { className: 'paste-receipt' },
    view.words + ' word' + (view.words === 1 ? '' : 's') +
    ' \u00B7 ends with: \u201C' + (view.truncated ? '\u2026' : '') + view.tail + '\u201D',
    React.createElement('span', { className: 'sr-only' }, ' (' + label + ')')
  );
}

function AwaitFullContext({ data, onApprove, dispatch, pendingEdits }) {
  const roster = (data && data.roster) || [];
  const whiteboardAnalysis = (data && data.whiteboardAnalysis) || null;
  const prev = (data && data.previousFullContext) || null;  // ROLL-4: pre-fill on rollback

  // A saved draft outranks the rollback prefill: it is what the director typed.
  const seed = pendingEdits || prev || {};
  const [accusation, setAccusation] = React.useState(seed.accusation || '');
  const [sessionReport, setSessionReport] = React.useState(seed.sessionReport || '');
  const [directorNotes, setDirectorNotes] = React.useState(seed.directorNotes || '');
  const [whiteboardPath, setWhiteboardPath] = React.useState('');

  // Re-seed when the checkpoint data changes (e.g., a fresh rollback delivers new prefill).
  React.useEffect(function () {
    const draft = pendingEdits || (data && data.previousFullContext) || {};
    setAccusation(draft.accusation || '');
    setSessionReport(draft.sessionReport || '');
    setDirectorNotes(draft.directorNotes || '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Debounce the draft into the reducer. These three fields are the only
  // free-text input the whole pipeline takes and retyping them after a failed
  // POST is the one thing a director cannot be asked to do twice.
  React.useEffect(function () {
    if (!dispatch) return undefined;
    const handle = setTimeout(function () {
      dispatch({
        type: 'SAVE_PENDING_EDITS',
        checkpoint: 'await-full-context',
        edits: {
          accusation: accusation,
          sessionReport: sessionReport,
          directorNotes: directorNotes
        }
      });
    }, DRAFT_DEBOUNCE_MS);
    return function () { clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accusation, sessionReport, directorNotes]);

  const isValid = accusation.trim() !== '' &&
    sessionReport.trim() !== '' &&
    directorNotes.trim() !== '';

  function handleSubmit() {
    if (!isValid) return;
    const payload = {
      fullContext: {
        accusation: accusation.trim(),
        sessionReport: sessionReport.trim(),
        directorNotes: directorNotes.trim()
      }
    };
    // R1: the parse has not run yet, so adding the whiteboard here costs nothing.
    if (whiteboardPath.trim()) {
      payload.whiteboardPhotoPath = whiteboardPath.trim();
    }
    onApprove(payload);
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Status: What's already provided
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Already Provided'),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        // Roster status
        React.createElement('div', { className: 'context-status__item' },
          roster.length > 0
            ? React.createElement('span', { className: 'text-accent-green' }, '\u2713')
            : React.createElement('span', { className: 'text-sm' }, '\u2717'),
          React.createElement('span', { className: 'text-sm' }, 'Roster'),
          roster.length > 0 && React.createElement('div', { className: 'tag-list' },
            roster.map(function (name) {
              return React.createElement(Badge, { key: name, label: name, color: 'var(--accent-cyan)' });
            })
          )
        ),
        // Whiteboard status
        React.createElement('div', { className: 'context-status__item' },
          whiteboardAnalysis
            ? React.createElement('span', { className: 'text-accent-green' }, '\u2713')
            : React.createElement('span', { className: 'text-sm' }, '\u2717'),
          React.createElement('span', { className: 'text-sm' }, 'Whiteboard Analysis'),
          whiteboardAnalysis && React.createElement(Badge, { label: 'Available', color: 'var(--accent-green)' })
        )
      )
    ),

    // What's still needed
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Still Needed'),
      React.createElement('p', { className: 'text-sm text-secondary mb-sm' },
        'Provide the following information to continue the pipeline.'
      )
    ),

    // Accusation input. R5 F19: this was a single-line <input> while the real
    // accusation for 071826 is 2,183 characters of multi-paragraph text.
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'fc-accusation' },
        'Accusation',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('textarea', {
        id: 'fc-accusation',
        className: 'input',
        rows: 4,
        value: accusation,
        onChange: function (e) { setAccusation(e.target.value); },
        placeholder: 'Who the room accused, of what, on how many votes, and what else was considered.'
      }),
      React.createElement(PasteReceipt, { label: 'accusation', text: accusation })
    ),

    // Session Report textarea
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'fc-session-report' },
        'Session Report',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('textarea', {
        id: 'fc-session-report',
        className: 'input',
        rows: 8,
        value: sessionReport,
        onChange: function (e) { setSessionReport(e.target.value); },
        placeholder: 'Describe the key events, player decisions, and investigation flow during the session...'
      }),
      React.createElement(PasteReceipt, { label: 'session report', text: sessionReport })
    ),

    // Director Notes textarea
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'fc-director-notes' },
        'Director Notes',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('textarea', {
        id: 'fc-director-notes',
        className: 'input',
        rows: 10,
        value: directorNotes,
        onChange: function (e) { setDirectorNotes(e.target.value); },
        placeholder: 'Your observations about player dynamics, notable moments, investigation approach...'
      }),
      React.createElement(PasteReceipt, { label: 'director notes', text: directorNotes }),
      React.createElement('p', { className: 'text-xs text-muted' },
        'Check the ending above against your source before submitting. A paste ' +
        'that stops early is silent everywhere downstream, and anything a player ' +
        'said has to appear here word for word to reach the article.'
      )
    ),

    // Whiteboard photo, added late (R1). This is the last gate before parseRawInput.
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'fc-whiteboard' }, 'Whiteboard Photo (optional)'),
      React.createElement('input', {
        id: 'fc-whiteboard',
        type: 'text',
        className: 'input input-mono text-sm',
        placeholder: 'path/to/whiteboard.jpg',
        value: whiteboardPath,
        onChange: (e) => setWhiteboardPath(e.target.value),
        'aria-label': 'Path to the whiteboard photo to read into the parse'
      }),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'Only if you did not give one at session start. This is the last stop before the parse runs, ' +
        'so it is the last free chance to have the whiteboard read.'
      )
      // This sentence is TRUE only because the full-context approval nulls
      // sessionConfig/directorNotes/playerFocus (v2 I3, checkpointAwaitContext).
      // Without that, a rollback to this gate reuses the parse loadDirectorNotes
      // rehydrated from disk and the whiteboard is never read.
    ),

    // Submit button
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        disabled: !isValid,
        onClick: handleSubmit
      }, 'Submit Full Context')
    )
  );
}

window.Console.checkpoints.AwaitFullContext = AwaitFullContext;
