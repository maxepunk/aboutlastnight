/**
 * InputReview Checkpoint Component
 * Displays parsed session input for approval: session info, roster,
 * accusation (accused + charge + the full notes, and the verdict kind: a verdict
 * with no culprit is shown as that, not as a missing parse), each exposed memory's
 * exposer, time and owner (phase 2, brief 2.2), the ledger (phase 3, brief 3.5:
 * the clock rule, the adjustments beside each account, a totals mismatch or
 * "adjustments not parsed"), the split vote, player focus, director observations,
 * the whiteboard analysis, and what the director-notes enricher actually indexed.
 * Approve, or reject with written corrections that re-parse.
 * Exports to window.Console.checkpoints.InputReview
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, safeStringify } = window.Console.utils;
const { resolveRosterPronoun, ledgerView, quoteView, epilogueItemView, enrichmentWarningLines } = window.Console.inputReviewLogic;
const { validateRosterEntry } = window.Console.awaitRosterLogic;
const ViewLogic = window.Console.checkpointViewLogic;

/**
 * What the director-notes enricher indexed (CODE-REVIEW H25 / B2).
 *
 * An enrichment that came back empty looked identical to a session whose notes
 * had nothing in them: `_enrichmentFallback` was carried in directorNotes and
 * read by nobody, so a silent enricher failure - which costs the article its
 * entire quote bank - reached the gate invisible. Task 3 summarises it as
 * `data.enrichment`.
 */
function EnrichmentPanel({ enrichment }) {
  if (!enrichment) return null;
  const fallback = enrichment.fallback || null;
  const warnings = enrichment.warnings || null;

  return React.createElement('div', { className: 'checkpoint-section' },
    React.createElement('h4', { className: 'checkpoint-section__title' }, 'Director-Notes Enrichment'),
    React.createElement('p', { className: 'text-sm text-secondary' },
      'Quotes indexed: ' + (enrichment.quotes || 0) +
      ' \u00B7 Character mentions: ' + (enrichment.characterMentions || 0) +
      ' \u00B7 Transaction links: ' + (enrichment.transactionReferences || 0)
    ),
    fallback && React.createElement('p', { className: 'validation-error', role: 'alert' },
      'Director-notes enrichment failed (' + (fallback.reason || 'no reason recorded') + '). ' +
      'The article will have no quote bank. Reject with corrections to retry.'
    ),
    warnings && warnings.droppedQuotes > 0 && React.createElement('p', { className: 'enrichment__warning' },
      warnings.droppedQuotes + ' quote' + (warnings.droppedQuotes === 1 ? '' : 's') +
      ' dropped: not found verbatim in the prose. Anything a player actually said ' +
      'has to be in the notes word for word to reach the article.'
    ),
    // Task 3.5 fix batch, item 9: what the enricher (task 3.6) left out of the quote
    // bank and the epilogue because the notes do not carry it word for word.
    enrichmentWarningLines(warnings).map(function (line, i) {
      return React.createElement('p', { key: 'ew-' + i, className: 'enrichment__warning' }, line);
    })
  );
}

/**
 * The ledger (phase 3, brief 3.5), built to be skimmed: the clock rule and anything
 * that needs the director first, the accounts and adjustments folded away.
 */
function LedgerPanel({ ledger }) {
  const view = ledgerView(ledger);
  return React.createElement('div', { className: 'checkpoint-section' },
    React.createElement('h4', { className: 'checkpoint-section__title' }, 'Ledger'),
    React.createElement('p', { className: 'text-sm text-secondary' }, view.clockLine),
    view.warnings.map(function (w, i) {
      return React.createElement('p', { key: 'lw-' + i, className: 'enrichment__warning', role: 'alert' }, w);
    }),
    (view.accounts.length > 0 || view.adjustments.length > 0) &&
      React.createElement(window.Console.utils.CollapsibleSection, {
        title: 'Accounts (' + view.accounts.length + ') and adjustments (' + view.adjustments.length + ')',
        defaultOpen: false
      },
        React.createElement('table', { className: 'exposure-table text-sm' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Account'),
              React.createElement('th', null, 'Total'),
              React.createElement('th', null, 'Sales')
            )
          ),
          React.createElement('tbody', null,
            view.accounts.map(function (a, i) {
              return React.createElement('tr', { key: a.name + '-' + i },
                React.createElement('td', null, a.name),
                React.createElement('td', null, a.total),
                React.createElement('td', null, a.sales)
              );
            })
          )
        ),
        view.adjustments.length > 0 && React.createElement('ul', { className: 'checkpoint-section__list' },
          view.adjustments.map(function (line, i) {
            return React.createElement('li', { key: 'adj-' + i, className: 'text-sm' }, line);
          })
        )
      )
  );
}

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

function InputReview({ data, onApprove, onReject, theme }) {
  // `data.parsedInput` is gone: `_parsedInput` was never an Annotation channel,
  // so LangGraph dropped every write and the "Parsed at / processing time" line
  // was dead on both delivery paths. Task 3 removed the key and the writes.
  const sessionConfig = (data && data.sessionConfig) || {};
  const directorNotes = (data && data.directorNotes) || {};
  const playerFocus = (data && data.playerFocus) || {};
  // H25: the block used to read accusation.reasoning + .confidence, neither of
  // which the parse emits, so the ONE thing this checkpoint exists to verify
  // rendered as "Accused: Vic" with the charge and the 400-character notes
  // (votes, motive, alternative theories) never shown.
  const accusation = ViewLogic.accusationView(sessionConfig.accusation);
  // Brief 2.2: an overdose, an accident or self-harm names no culprit, so an empty
  // accused is the parse being right, not the parse missing it.
  const verdict = ViewLogic.verdictView(sessionConfig.accusation);
  // Brief 3.5: a split final vote, every option with its count.
  const votes = ViewLogic.votesView(sessionConfig.accusation);
  // Brief 2.2: the Detective Evidence Log's exposer / time / owner, kept by the parse.
  const exposures = ViewLogic.exposuresView(sessionConfig.exposures, sessionConfig.exposedTokenCount);
  // The panel used to read connectionsMade / questionsRaised / votingResults;
  // WHITEBOARD_SCHEMA emits names/regions/connections/notes/structureType/
  // ambiguities (regions since brief 3.5), so the whole panel was permanently absent.
  const whiteboard = ViewLogic.whiteboardView(directorNotes.whiteboard);
  const roster = sessionConfig.roster || [];
  const rosterPronouns = sessionConfig.rosterPronouns || {};
  const canonicalCharacters = (data && data.canonicalCharacters) || {};
  const hasCanon = Object.keys(canonicalCharacters).length > 0;
  // Baseline §6(a): how much director prose the pipeline actually holds.
  const notesReceipt = ViewLogic.wordTail(directorNotes.rawProse);

  // B2: reject-with-corrections. The checkpoint was approve-only, so a wrong
  // roster, accusation or journalist name could only be fixed by a rollback and
  // a full re-collection. The corrections go back through interrupt() as
  // _inputCorrections and parseRawInput appends them to every parse prompt.
  const [mode, setMode] = React.useState('view');
  const [corrections, setCorrections] = React.useState('');
  React.useEffect(function () { setMode('view'); setCorrections(''); }, [data]);

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
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.sessionId || 'N/A')
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
        React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Theme: '),
          React.createElement('span', { className: 'text-secondary' }, theme || 'journalist')
        )
      )
    ),

    // Roster
    roster.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Roster'),
      React.createElement('div', { className: 'tag-list' },
        roster.map(function (name) {
          const pronouns = resolveRosterPronoun(name, rosterPronouns);
          const isUnknown = hasCanon && !validateRosterEntry(name, canonicalCharacters).matched;
          return React.createElement('span', {
            key: name,
            className: 'flex gap-sm items-center',
            title: isUnknown ? 'No character match — pronouns may default to they/them in the article.' : undefined
          },
            React.createElement(Badge, { label: name + ' (' + pronouns + ')', color: 'var(--accent-cyan)' }),
            isUnknown && React.createElement(Badge, { label: '⚠ no character match', color: 'var(--accent-amber)' })
          );
        })
      )
    ),

    // Accusation. Rendered even when nothing parsed: a missing accusation is
    // the loudest thing this screen can tell the director, and hiding the block
    // on `!accused` is what made it silent.
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Accusation'),
      accusation.accused
        ? React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
            React.createElement('span', { className: 'text-sm text-muted' }, 'Accused: '),
            React.createElement('span', { className: 'text-sm' }, accusation.accused)
          )
        : verdict.noCulprit
          ? React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
              React.createElement('span', { className: 'text-sm text-muted' }, 'Accused: '),
              React.createElement('span', { className: 'text-sm' }, 'no one (the room named no culprit)')
            )
          : verdict.blamesNoCharacter
            // Brief 3.5: an institution or an unnamed person, in the room's words in the charge.
            ? React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
                React.createElement('span', { className: 'text-sm text-muted' }, 'Accused: '),
                React.createElement('span', { className: 'text-sm' }, 'no character (the charge names who the room blamed)')
              )
            : React.createElement('p', { className: 'validation-error', role: 'alert' },
                'Accusation: not parsed. Reject with corrections naming who the room ' +
                'accused and of what, or the article has no verdict to write against.'
              ),
      verdict.label && React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Verdict: '),
        React.createElement('span', { className: 'text-sm' }, verdict.label)
      ),
      accusation.charge && React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Charge: '),
        React.createElement('span', { className: 'text-sm' }, accusation.charge)
      ),
      votes.split && React.createElement('div', { className: 'flex gap-sm items-center mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Final vote (split): '),
        React.createElement('span', { className: 'text-sm' }, votes.line)
      ),
      accusation.notes && React.createElement('p', { className: 'text-sm text-secondary accusation__notes' },
        accusation.notes
      )
    ),

    // The ledger (brief 3.5): the clock rule, then anything wrong with the account
    // totals, then the accounts and adjustments folded away.
    React.createElement(LedgerPanel, { ledger: data && data.ledger }),

    // Brief 3.5: no exposed memory parsed makes every memory count as buried, so it is
    // said in red rather than left as a missing section. It reads the exposed-memory
    // list disposition reads; an empty per-row log is its own, quieter line.
    exposures.noneExposed && React.createElement('p', { className: 'validation-error', role: 'alert' },
      'Exposed memories: none parsed from the session report, so every memory will count ' +
      'as buried. Reject with corrections if the evidence log had rows.'
    ),
    exposures.logEmpty && React.createElement('p', { className: 'enrichment__warning', role: 'alert' },
      'Evidence log: no exposure times or turn-in names parsed, so the writers’ morning ' +
      'timeline shows no exposures. Reject with corrections if the evidence log had rows.'
    ),

    // Exposed memories (brief 2.2): who turned each one in, when, and whose it is,
    // as the parse kept them from the session report. Since brief 3.5 the writers
    // see each one's time and the name on its turn-in on the morning timeline.
    exposures.count > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement(window.Console.utils.CollapsibleSection, {
        title: 'Exposed Memories (' + exposures.count + ')',
        defaultOpen: false
      },
        React.createElement('table', { className: 'exposure-table text-sm' },
          React.createElement('thead', null,
            React.createElement('tr', null,
              React.createElement('th', null, 'Memory'),
              React.createElement('th', null, 'Exposed by'),
              React.createElement('th', null, 'Time'),
              React.createElement('th', null, 'Owner')
            )
          ),
          React.createElement('tbody', null,
            exposures.rows.map(function (row, i) {
              return React.createElement('tr', { key: row.tokenId + '-' + i },
                React.createElement('td', null, row.tokenId),
                React.createElement('td', null, row.exposer || '\u2014'),
                React.createElement('td', null, row.time || '\u2014'),
                React.createElement('td', null, row.owner || '\u2014')
              );
            })
          )
        )
      )
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

    // Director Notes (raw prose - source of truth).
    //
    // Baseline §6(a): 062726's notes reached the pipeline TWO PARAGRAPHS SHORT.
    // The receipt line states the word count and how the text ends, so the
    // director can confirm the pipeline got the whole thing before approving -
    // the only point after submission where a truncated paste is still cheap.
    directorNotes.rawProse && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('p', { className: 'paste-receipt' },
        'Director notes received: ' + notesReceipt.words + ' word' +
        (notesReceipt.words === 1 ? '' : 's') + ', ends with \u201C' +
        (notesReceipt.truncated ? '\u2026' : '') + notesReceipt.tail + '\u201D'
      ),
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
            // Item 9: a quote with no speaker says so, and the director's correction
            // shows beside the quote it applied to (quoteView).
            directorNotes.quotes.map(quoteView).map((q, i) =>
              React.createElement('li', { key: i, className: 'quote-row' + (q.confidence === 'low' ? ' is-low-confidence' : '') },
                React.createElement('span', { className: 'quote-speaker' + (q.speakerRecorded ? '' : ' text-muted') },
                  q.speaker,
                  q.addressee && React.createElement('span', { className: 'text-muted' }, ' \u2192 ' + q.addressee),
                  ': '
                ),
                React.createElement('span', { className: 'quote-text' }, '"' + q.text + '"'),
                q.confidence && React.createElement(Badge, {
                  label: q.confidence,
                  color: q.confidence === 'high' ? 'var(--accent-green)' : 'var(--accent-amber)'
                }),
                q.correction && React.createElement('p', { className: 'text-sm text-secondary quote-correction' },
                  'The director’s correction: ' + q.correction
                ),
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
                          // Links carry no memory id since the phase 2 final fix wave;
                          // a thread enriched before it still shows the id it stored.
                          tx.tokenId && React.createElement('span', null, tx.tokenId + (tx.tokenOwner ? ' (' + tx.tokenOwner + ')' : '') + ' '),
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
            // Item 9: the headline only where a stored item has one; the director's
            // sentence always (epilogueItemView).
            directorNotes.postInvestigationDevelopments.map(epilogueItemView).map((d, i) =>
              React.createElement('div', { key: i, className: 'news-card' },
                d.headline && React.createElement('h5', { className: 'news-card__headline' }, d.headline),
                React.createElement('p', { className: 'news-card__detail text-sm' }, d.detail),
                d.subjects.length > 0 && React.createElement('div', { className: 'news-card__subjects' },
                  d.subjects.map(s => React.createElement(Badge, { key: s, label: s, color: 'var(--accent-cyan)' }))
                ),
                d.bearing && React.createElement('p', { className: 'news-card__bearing text-sm text-muted' }, d.bearing)
              )
            )
          )
        )
      ),

    // Whiteboard. `ambiguities` comes FIRST and in amber: it is the parser's own
    // list of what it could not read off the photo, which is exactly the thing
    // the director can correct and nothing downstream can.
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Whiteboard'),

      whiteboard.ambiguities.length > 0 && React.createElement('div', { className: 'mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Ambiguities the parser flagged:'),
        React.createElement('ul', { className: 'checkpoint-section__list whiteboard__ambiguities' },
          whiteboard.ambiguities.map(function (item, i) {
            return React.createElement('li', { key: 'amb-' + i, className: 'text-sm' },
              typeof item === 'string' ? item : safeStringify(item)
            );
          })
        )
      ),

      whiteboard.names.length > 0 && React.createElement('div', { className: 'mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Names on the board: '),
        React.createElement('div', { className: 'tag-list mt-sm' },
          whiteboard.names.map(function (name, i) {
            return React.createElement(Badge, {
              key: 'wbn-' + i,
              label: typeof name === 'string' ? name : safeStringify(name),
              color: 'var(--accent-cyan)'
            });
          })
        )
      ),

      // Brief 3.5: each region under the heading the players wrote, or none.
      whiteboard.regions.length > 0 && React.createElement('div', { className: 'mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Regions (under the players’ own headings):'),
        React.createElement('ul', { className: 'checkpoint-section__list' },
          whiteboard.regions.map(function (region, i) {
            return React.createElement('li', { key: 'wbg-' + i, className: 'text-sm' },
              React.createElement('strong', null, region.label ? '“' + region.label + '”' : 'no heading'),
              region.location && React.createElement('span', { className: 'text-muted' }, ' (' + region.location + ')'),
              React.createElement('span', { className: 'text-secondary' },
                ': ' + region.entries.map(function (e) { return typeof e === 'string' ? e : safeStringify(e); }).join(', ')
              )
            );
          })
        )
      ),

      whiteboard.connections.length > 0 && React.createElement('div', { className: 'mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Connections drawn:'),
        React.createElement('ul', { className: 'checkpoint-section__list' },
          whiteboard.connections.map(function (conn, i) {
            return React.createElement('li', { key: 'wbc-' + i, className: 'text-sm' },
              (conn && conn.from) || '?',
              React.createElement('span', { className: 'text-muted' }, ' \u2192 '),
              (conn && conn.to) || '?',
              conn && conn.label && React.createElement('span', { className: 'text-muted' }, ' (' + conn.label + ')')
            );
          })
        )
      ),

      whiteboard.notes.length > 0 && React.createElement('div', { className: 'mb-sm' },
        React.createElement('span', { className: 'text-sm text-muted' }, 'Notes:'),
        React.createElement('ul', { className: 'checkpoint-section__list' },
          whiteboard.notes.map(function (note, i) {
            return React.createElement('li', { key: 'wbt-' + i, className: 'text-sm' },
              typeof note === 'string' ? note : safeStringify(note)
            );
          })
        )
      ),

      whiteboard.structureType && React.createElement('p', { className: 'text-xs text-muted' },
        'Structure: ' + whiteboard.structureType
      ),

      whiteboard.ambiguities.length === 0 && whiteboard.names.length === 0 &&
        whiteboard.regions.length === 0 && whiteboard.connections.length === 0 &&
        whiteboard.notes.length === 0 &&
        React.createElement('p', { className: 'enrichment__warning' },
          'No whiteboard analysis reached this checkpoint. The players\u2019 own ' +
          'conclusions drive arc selection, so the arcs will be built from the ' +
          'accusation and the director notes alone.'
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

    // What the enricher indexed (H25)
    React.createElement(EnrichmentPanel, { enrichment: data && data.enrichment }),

    // Approve / Reject
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn btn btn-primary',
        onClick: function () { onApprove({ inputReview: true }); },
        'aria-label': 'Approve the parsed input'
      }, 'Approve Input'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { setMode(mode === 'reject' ? 'view' : 'reject'); },
        'aria-label': 'Reject the parse and send corrections'
      }, 'Reject with Corrections')
    ),

    // Reject mode: corrections go back through the parse, not a rollback.
    mode === 'reject' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'input-corrections' },
        'Corrections (who said what, accusation details, the session report, the whiteboard)'
      ),
      React.createElement('textarea', {
        id: 'input-corrections',
        className: 'input feedback-area',
        value: corrections,
        onChange: function (e) { setCorrections(e.target.value); },
        rows: 6,
        placeholder: 'e.g. Blake said "he was a dead man", not Casper. The final vote ' +
          'was Remi 7, Vic 4, and the statement named Remi.',
        'aria-label': 'Corrections to the parsed input'
      }),
      React.createElement('p', { className: 'text-xs text-muted' },
        'This re-runs the input parse with your corrections appended to every ' +
        'parse prompt. It does not roll anything back. The roster, pronouns, ' +
        'reporting mode and reporter name come from where you entered them, and a ' +
        'correction here leaves them as they are.'
      ),
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function () {
          if (!corrections.trim()) return;
          (onReject || onApprove)({ inputReview: false, inputFeedback: corrections.trim() });
        },
        disabled: !corrections.trim(),
        'aria-label': 'Submit corrections and re-parse'
      }, 'Submit Corrections')
    )
  );
}

window.Console.checkpoints.InputReview = InputReview;
