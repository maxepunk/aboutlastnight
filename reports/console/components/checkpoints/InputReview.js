/**
 * InputReview Checkpoint Component
 * Displays parsed session input for approval: session info, roster,
 * accusation, player focus, and director observations.
 * Exports to window.Console.checkpoints.InputReview
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, safeStringify } = window.Console.utils;

function CharacterMentionsSection({ mentions, roster }) {
  const [selected, setSelected] = React.useState(null);
  React.useEffect(() => { setSelected(null); }, [mentions]);
  const rosterNames = roster.length > 0 ? roster : Object.keys(mentions);
  const entries = rosterNames.map(name => ({
    name,
    count: (mentions[name] || []).length,
    items: mentions[name] || []
  }));

  return React.createElement('div', { className: 'checkpoint-section' },
    React.createElement('h4', { className: 'checkpoint-section__title' }, 'Character Mentions'),
    React.createElement('div', { className: 'tag-list' },
      entries.map(e =>
        React.createElement('button', {
          key: e.name,
          type: 'button',
          className: 'char-mention-tag' + (e.count === 0 ? ' is-empty' : '') + (selected === e.name ? ' is-selected' : ''),
          onClick: () => setSelected(selected === e.name ? null : e.name),
          'aria-pressed': selected === e.name
        }, e.name + ' \u00B7 ' + e.count)
      )
    ),
    selected && React.createElement('div', { className: 'char-mention-detail' },
      (mentions[selected] || []).length === 0
        ? React.createElement('p', { className: 'text-sm text-muted' }, 'No mentions.')
        : (mentions[selected] || []).map((m, i) =>
            React.createElement('div', { key: i, className: 'char-mention-excerpt' },
              React.createElement('p', { className: 'text-sm' }, m.excerpt),
              React.createElement('div', { className: 'char-mention-meta' },
                m.timeAnchor && React.createElement(Badge, { label: m.timeAnchor, color: 'var(--accent-cyan)' }),
                m.kind && React.createElement(Badge, { label: m.kind, color: 'var(--accent-amber)' }),
                (m.linkedCharacters || []).map(c =>
                  React.createElement(Badge, { key: c, label: 'w/ ' + c, color: 'var(--accent-green)' })
                )
              )
            )
          )
    )
  );
}

function InputReview({ data, onApprove, theme }) {
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
        sessionConfig.journalistFirstName && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Journalist: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.journalistFirstName)
        ),
        theme === 'journalist' && sessionConfig.reportingMode && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Reporting Mode: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.reportingMode)
        ),
        theme === 'journalist' && sessionConfig.guestReporter && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Guest Reporter: '),
          React.createElement('span', { className: 'text-secondary' },
            sessionConfig.guestReporter.name + ' | ' + (sessionConfig.guestReporter.role || 'Guest Reporter')
          )
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

    // Director Notes (raw prose - source of truth)
    directorNotes.rawProse && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement(window.Console.utils.CollapsibleSection, {
        title: 'Director Notes (' + directorNotes.rawProse.length + ' chars)',
        defaultOpen: true
      },
        React.createElement('pre', { className: 'director-prose' }, directorNotes.rawProse)
      )
    ),

    // Character Mentions (click tag to expand per-character excerpts)
    directorNotes.characterMentions && Object.keys(directorNotes.characterMentions).length > 0 &&
      React.createElement(CharacterMentionsSection, {
        mentions: directorNotes.characterMentions,
        roster: roster
      }),

    // Quote Bank
    directorNotes.quotes && directorNotes.quotes.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement(window.Console.utils.CollapsibleSection, {
          title: 'Quote Bank (' + directorNotes.quotes.length + ')',
          defaultOpen: false
        },
          React.createElement('ul', { className: 'quote-list' },
            directorNotes.quotes.map((q, i) =>
              React.createElement('li', { key: i, className: 'quote-row' + (q.confidence === 'low' ? ' is-low-confidence' : '') },
                React.createElement('span', { className: 'quote-speaker' },
                  q.speaker,
                  q.addressee && React.createElement('span', { className: 'text-muted' }, ' \u2192 ' + q.addressee),
                  ': '
                ),
                React.createElement('span', { className: 'quote-text' }, '"' + q.text + '"'),
                React.createElement(Badge, {
                  label: q.confidence,
                  color: q.confidence === 'high' ? 'var(--accent-green)' : 'var(--accent-amber)'
                }),
                q.context && React.createElement('details', { className: 'quote-context' },
                  React.createElement('summary', null, 'context'),
                  React.createElement('p', { className: 'text-sm text-muted' }, q.context)
                )
              )
            )
          )
        )
      ),

    // Transaction Cross-References
    directorNotes.transactionReferences && directorNotes.transactionReferences.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement(window.Console.utils.CollapsibleSection, {
          title: 'Transaction Cross-References (' + directorNotes.transactionReferences.length + ')',
          defaultOpen: false
        },
          React.createElement('div', { className: 'tx-ref-list' },
            directorNotes.transactionReferences.map((t, i) =>
              React.createElement('div', { key: i, className: 'tx-ref-row' },
                React.createElement('div', { className: 'tx-ref-excerpt' },
                  React.createElement('p', { className: 'text-sm' }, '"' + t.excerpt + '"'),
                  React.createElement(Badge, {
                    label: t.confidence,
                    color: t.confidence === 'high' ? 'var(--accent-green)'
                         : t.confidence === 'medium' ? 'var(--accent-amber)' : 'var(--accent-red)'
                  })
                ),
                React.createElement('div', { className: 'tx-ref-links' },
                  (t.linkedTransactions || []).length === 0
                    ? React.createElement('span', { className: 'text-sm text-muted' }, '(no link)')
                    : t.linkedTransactions.map((tx, j) =>
                        React.createElement('div', { key: j, className: 'tx-ref-row__tx text-sm' },
                          React.createElement('span', { className: 'text-muted' }, tx.timestamp + ' \u00B7 '),
                          React.createElement('span', null, tx.tokenId + ' (' + tx.tokenOwner + ') '),
                          React.createElement('span', { className: 'text-secondary' }, tx.amount + ' \u2192 ' + tx.sellingTeam)
                        )
                      ),
                  t.linkReasoning && React.createElement('details', { className: 'tx-ref-reason' },
                    React.createElement('summary', null, 'Why this link?'),
                    React.createElement('p', { className: 'text-sm text-muted' }, t.linkReasoning)
                  )
                )
              )
            )
          )
        )
      ),

    // Post-Investigation Developments
    directorNotes.postInvestigationDevelopments && directorNotes.postInvestigationDevelopments.length > 0 &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement(window.Console.utils.CollapsibleSection, {
          title: 'Post-Investigation Developments (' + directorNotes.postInvestigationDevelopments.length + ')',
          defaultOpen: false
        },
          React.createElement('div', { className: 'news-card-list' },
            directorNotes.postInvestigationDevelopments.map((d, i) =>
              React.createElement('div', { key: i, className: 'news-card' },
                React.createElement('h5', { className: 'news-card__headline' }, d.headline),
                d.detail && React.createElement('p', { className: 'news-card__detail text-sm' }, d.detail),
                (d.subjects || []).length > 0 && React.createElement('div', { className: 'news-card__subjects' },
                  d.subjects.map(s => React.createElement(Badge, { key: s, label: s, color: 'var(--accent-cyan)' }))
                ),
                d.bearingOnNarrative && React.createElement('p', { className: 'news-card__bearing text-sm text-muted' }, d.bearingOnNarrative)
              )
            )
          )
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

    // Entity Notes (NPCs + flagged shell accounts)
    directorNotes.entityNotes && (
      (directorNotes.entityNotes.npcsReferenced || []).length > 0 ||
      (directorNotes.entityNotes.shellAccountsReferenced || []).length > 0
    ) &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement(window.Console.utils.CollapsibleSection, {
          title: 'Entity Notes',
          defaultOpen: false
        },
          (directorNotes.entityNotes.npcsReferenced || []).length > 0 && React.createElement('div', { className: 'mb-sm' },
            React.createElement('span', { className: 'text-sm text-muted' }, 'NPCs referenced: '),
            React.createElement('div', { className: 'tag-list mt-sm' },
              directorNotes.entityNotes.npcsReferenced.map(n =>
                React.createElement(Badge, { key: n, label: n, color: 'var(--accent-amber)' })
              )
            )
          ),
          (directorNotes.entityNotes.shellAccountsReferenced || []).length > 0 && React.createElement('div', null,
            React.createElement('span', { className: 'text-sm text-muted' }, 'Shell accounts flagged: '),
            React.createElement('ul', { className: 'entity-shell-list' },
              directorNotes.entityNotes.shellAccountsReferenced.map((s, i) =>
                React.createElement('li', { key: i, className: 'text-sm' },
                  React.createElement('strong', null, s.account),
                  s.directorSuspicion && React.createElement('span', { className: 'text-muted' }, ' \u2014 ' + s.directorSuspicion)
                )
              )
            )
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
