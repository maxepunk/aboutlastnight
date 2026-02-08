/**
 * AwaitFullContext Checkpoint Component
 * Collects accusation, session report, and director notes.
 * Displays what has already been provided (roster, whiteboard).
 * Exports to window.Console.checkpoints.AwaitFullContext
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge } = window.Console.utils;

function AwaitFullContext({ data, onApprove }) {
  const roster = (data && data.roster) || [];
  const whiteboardAnalysis = (data && data.whiteboardAnalysis) || null;

  const [accusation, setAccusation] = React.useState('');
  const [sessionReport, setSessionReport] = React.useState('');
  const [directorNotes, setDirectorNotes] = React.useState('');

  const isValid = accusation.trim() !== '' &&
    sessionReport.trim() !== '' &&
    directorNotes.trim() !== '';

  function handleSubmit() {
    if (!isValid) return;
    onApprove({
      fullContext: {
        accusation: accusation.trim(),
        sessionReport: sessionReport.trim(),
        directorNotes: directorNotes.trim()
      }
    });
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

    // Accusation input
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label' },
        'Accusation',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('input', {
        className: 'input',
        type: 'text',
        value: accusation,
        onChange: function (e) { setAccusation(e.target.value); },
        placeholder: 'e.g., Players accused Marcus of embezzlement'
      })
    ),

    // Session Report textarea
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label' },
        'Session Report',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('textarea', {
        className: 'input',
        rows: 6,
        value: sessionReport,
        onChange: function (e) { setSessionReport(e.target.value); },
        placeholder: 'Describe the key events, player decisions, and investigation flow during the session...'
      })
    ),

    // Director Notes textarea
    React.createElement('div', { className: 'form-group' },
      React.createElement('label', { className: 'form-group__label' },
        'Director Notes',
        React.createElement('span', { className: 'form-group__required' }, ' *')
      ),
      React.createElement('textarea', {
        className: 'input',
        rows: 6,
        value: directorNotes,
        onChange: function (e) { setDirectorNotes(e.target.value); },
        placeholder: 'Your observations about player dynamics, notable moments, investigation approach...'
      })
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
