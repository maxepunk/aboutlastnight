/**
 * InputReview Checkpoint Component
 * Displays parsed session input for approval: session info, roster,
 * accusation, player focus, and director observations.
 * Exports to window.Console.checkpoints.InputReview
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, safeStringify } = window.Console.utils;

function InputReview({ data, onApprove }) {
  const parsedInput = (data && data.parsedInput) || {};
  const sessionConfig = (data && data.sessionConfig) || {};
  const directorNotes = (data && data.directorNotes) || {};
  const playerFocus = (data && data.playerFocus) || {};
  const accusation = sessionConfig.accusation || {};
  const whiteboard = directorNotes.whiteboard || {};
  const roster = sessionConfig.roster || [];

  // Confidence badge color mapping
  const confidenceColor = {
    high: 'var(--accent-green)',
    medium: 'var(--accent-amber)',
    low: 'var(--accent-red)'
  };

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Session Info
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Session Info'),
      React.createElement('div', { className: 'flex gap-md flex-col' },
        React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Session ID: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.sessionId || parsedInput.sessionId || 'N/A')
        ),
        sessionConfig.journalistName && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Journalist: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.journalistName)
        ),
        parsedInput.parsedAt && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Parsed at: '),
          React.createElement('span', { className: 'text-secondary' }, parsedInput.parsedAt)
        ),
        parsedInput.processingTimeMs != null && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Processing time: '),
          React.createElement('span', { className: 'text-secondary' }, parsedInput.processingTimeMs + 'ms')
        )
      )
    ),

    // Roster
    roster.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Roster'),
      React.createElement('div', { className: 'tag-list' },
        roster.map(function (name) {
          return React.createElement(Badge, { key: name, label: name, color: 'var(--accent-cyan)' });
        })
      )
    ),

    // Accusation
    accusation.accused && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Accusation'),
      React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Accused: '),
        React.createElement('span', { className: 'text-sm' }, accusation.accused),
        accusation.confidence && React.createElement(Badge, {
          label: accusation.confidence,
          color: confidenceColor[accusation.confidence] || 'var(--accent-amber)'
        })
      ),
      accusation.reasoning && React.createElement('p', { className: 'text-sm text-secondary' }, accusation.reasoning)
    ),

    // Player Focus
    (playerFocus.primaryInvestigation || playerFocus.playerTheory) &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Player Focus'),
        playerFocus.primaryInvestigation && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'Primary Investigation: '),
          React.createElement('span', { className: 'text-sm text-secondary' }, playerFocus.primaryInvestigation)
        ),
        playerFocus.primarySuspects && playerFocus.primarySuspects.length > 0 &&
          React.createElement('div', { className: 'mb-sm' },
            React.createElement('span', { className: 'text-sm text-muted' }, 'Primary Suspects: '),
            React.createElement('span', { className: 'tag-list mt-sm' },
              playerFocus.primarySuspects.map(function (s) {
                return React.createElement(Badge, { key: s, label: s, color: 'var(--accent-amber)' });
              })
            )
          ),
        playerFocus.playerTheory && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'Player Theory: '),
          React.createElement('span', { className: 'text-sm text-secondary' }, playerFocus.playerTheory)
        ),
        playerFocus.confidenceLevel && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'Confidence: '),
          React.createElement(Badge, {
            label: playerFocus.confidenceLevel,
            color: confidenceColor[playerFocus.confidenceLevel] || 'var(--accent-amber)'
          })
        ),
        playerFocus.secondaryThreads && playerFocus.secondaryThreads.length > 0 &&
          React.createElement('div', null,
            React.createElement('span', { className: 'text-sm text-muted' }, 'Secondary Threads: '),
            React.createElement('div', { className: 'tag-list mt-sm' },
              playerFocus.secondaryThreads.map(function (t) {
                return React.createElement(Badge, { key: t, label: t, color: 'var(--accent-cyan)' });
              })
            )
          )
      ),

    // Director Observations
    directorNotes.observations && directorNotes.observations.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Director Observations'),
        React.createElement('ul', { className: 'checkpoint-section__list' },
          directorNotes.observations.map(function (obs, i) {
            return React.createElement('li', { key: obs + '-' + i, className: 'text-sm text-secondary' }, obs);
          })
        )
      ),

    // Whiteboard
    (whiteboard.connectionsMade || whiteboard.questionsRaised || whiteboard.votingResults) &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Whiteboard'),
        whiteboard.connectionsMade && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'Connections Made: '),
          React.createElement('span', { className: 'text-sm text-secondary' },
            typeof whiteboard.connectionsMade === 'string'
              ? whiteboard.connectionsMade
              : safeStringify(whiteboard.connectionsMade)
          )
        ),
        whiteboard.questionsRaised && React.createElement('div', { className: 'mb-sm' },
          React.createElement('span', { className: 'text-sm text-muted' }, 'Questions Raised: '),
          React.createElement('span', { className: 'text-sm text-secondary' },
            typeof whiteboard.questionsRaised === 'string'
              ? whiteboard.questionsRaised
              : safeStringify(whiteboard.questionsRaised)
          )
        ),
        whiteboard.votingResults && React.createElement('div', null,
          React.createElement('span', { className: 'text-sm text-muted' }, 'Voting Results: '),
          React.createElement('span', { className: 'text-sm text-secondary' },
            typeof whiteboard.votingResults === 'string'
              ? whiteboard.votingResults
              : safeStringify(whiteboard.votingResults)
          )
        )
      ),

    // Approve button
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: function () { onApprove({ inputReview: true }); }
      }, 'Approve Input')
    )
  );
}

window.Console.checkpoints.InputReview = InputReview;
