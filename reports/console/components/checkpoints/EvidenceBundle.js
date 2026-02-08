/**
 * EvidenceBundle Checkpoint Component
 * Displays three-layer curated evidence (exposed/buried/context),
 * curator notes, excluded items with rescue checkboxes, and curation summary.
 * Exports to window.Console.checkpoints.EvidenceBundle
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, truncate } = window.Console.utils;

function EvidenceBundle({ data, onApprove }) {
  const bundle = (data && data.evidenceBundle) || {};
  const exposed = bundle.exposed || {};
  const buried = bundle.buried || {};
  const context = bundle.context || {};
  const curatorNotes = bundle.curatorNotes || {};
  const curationReport = bundle.curationReport || {};
  const excluded = (curationReport.excluded) || [];
  const curationSummary = curationReport.curationSummary || {};

  const tokens = exposed.tokens || [];
  const paperEvidence = exposed.paperEvidence || [];
  const transactions = buried.transactions || [];
  const relationships = buried.relationships || [];
  const characterProfiles = context.characterProfiles || {};
  const timeline = context.timeline || {};

  // Rescue state: Set of excluded item names user wants to rescue
  const [rescuedItems, setRescuedItems] = React.useState(new Set());

  // Expand/collapse states for token and paper lists beyond preview
  const [showAllTokens, setShowAllTokens] = React.useState(false);
  const [showAllPaper, setShowAllPaper] = React.useState(false);
  const [showAllTransactions, setShowAllTransactions] = React.useState(false);

  // Reset state when data changes (e.g., after rollback)
  React.useEffect(function () {
    setRescuedItems(new Set());
    setShowAllTokens(false);
    setShowAllPaper(false);
    setShowAllTransactions(false);
  }, [tokens.length, paperEvidence.length, excluded.length]);

  function toggleRescue(name) {
    setRescuedItems(function (prev) {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function handleApprove() {
    if (rescuedItems.size > 0) {
      onApprove({ evidenceBundle: true, rescuedItems: Array.from(rescuedItems) });
    } else {
      onApprove({ evidenceBundle: true });
    }
  }

  // Counts for summary stats
  const profileCount = Object.keys(characterProfiles).length;
  const timelineCount = Object.keys(timeline).length;
  const rescuableCount = excluded.filter(function (it) { return it.rescuable === true; }).length;

  // Empty state
  if (tokens.length === 0 && paperEvidence.length === 0 && transactions.length === 0 && excluded.length === 0) {
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      React.createElement('p', { className: 'text-muted text-sm' }, 'No evidence available in the bundle.'),
      React.createElement('div', { className: 'flex gap-md mt-md' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: function () { onApprove({ evidenceBundle: true }); }
        }, 'Continue')
      )
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // ── Summary Stats ──
    React.createElement('div', { className: 'summary-stats' },
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--exposed' }, tokens.length),
        React.createElement('span', { className: 'summary-stat__label' }, 'Tokens')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--paper' }, paperEvidence.length),
        React.createElement('span', { className: 'summary-stat__label' }, 'Paper')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--buried' }, transactions.length),
        React.createElement('span', { className: 'summary-stat__label' }, 'Transactions')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--tokens' }, profileCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Profiles')
      )
    ),

    // ── Exposed Layer ──
    React.createElement('div', { className: 'evidence-layer evidence-layer--exposed' },
      React.createElement('h4', { className: 'evidence-layer__title' },
        'Exposed Layer',
        React.createElement(Badge, { label: (tokens.length + paperEvidence.length) + ' items', color: 'var(--layer-exposed)' })
      ),

      // Tokens
      tokens.length > 0 && React.createElement('div', { className: 'mb-md' },
        React.createElement('p', { className: 'text-xs text-secondary mb-sm' }, 'Memory Tokens (' + tokens.length + ')'),
        React.createElement('div', { className: 'flex flex-col gap-sm' },
          (showAllTokens ? tokens : tokens.slice(0, 5)).map(function (token, i) {
            const id = token.id || token.tokenId || 'token-' + i;
            const owner = token.owner || token.ownerLogline || '';
            const summary = token.summary || token.content || '';
            return React.createElement('div', { key: id + '-' + i, className: 'evidence-item' },
              React.createElement('div', { className: 'evidence-item__header' },
                React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
                React.createElement('span', { className: 'evidence-item__name' }, id)
              ),
              owner && React.createElement('div', { className: 'evidence-item__meta' },
                React.createElement('span', { className: 'text-xs text-muted' }, 'Owner: ' + owner)
              ),
              summary && React.createElement('div', { className: 'evidence-item__desc' },
                React.createElement('span', { className: 'text-sm text-secondary' }, truncate(summary, 70))
              )
            );
          })
        ),
        tokens.length > 5 && React.createElement('button', {
          className: 'btn btn-ghost btn-sm mt-sm',
          onClick: function () { setShowAllTokens(function (prev) { return !prev; }); }
        }, showAllTokens ? 'Show fewer' : 'Show all ' + tokens.length + ' tokens')
      ),

      // Paper evidence
      paperEvidence.length > 0 && React.createElement('div', null,
        React.createElement('p', { className: 'text-xs text-secondary mb-sm' }, 'Paper Evidence (' + paperEvidence.length + ')'),
        React.createElement('div', { className: 'flex flex-col gap-sm' },
          (showAllPaper ? paperEvidence : paperEvidence.slice(0, 5)).map(function (item, i) {
            const title = item.title || item.name || 'Untitled';
            const category = item.category || item.type || '';
            const desc = item.description || '';
            return React.createElement('div', { key: title + '-' + i, className: 'evidence-item' },
              React.createElement('div', { className: 'evidence-item__header' },
                React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
                React.createElement('span', { className: 'evidence-item__name' }, title),
                category && React.createElement(Badge, { label: category, color: 'var(--accent-amber)' })
              ),
              desc && React.createElement('div', { className: 'evidence-item__desc' },
                React.createElement('span', { className: 'text-sm text-secondary' }, truncate(desc, 60))
              )
            );
          })
        ),
        paperEvidence.length > 5 && React.createElement('button', {
          className: 'btn btn-ghost btn-sm mt-sm',
          onClick: function () { setShowAllPaper(function (prev) { return !prev; }); }
        }, showAllPaper ? 'Show fewer' : 'Show all ' + paperEvidence.length + ' items')
      )
    ),

    // ── Buried Layer ──
    React.createElement('div', { className: 'evidence-layer evidence-layer--buried' },
      React.createElement('h4', { className: 'evidence-layer__title' },
        'Buried Layer',
        React.createElement(Badge, { label: (transactions.length + relationships.length) + ' items', color: 'var(--layer-buried)' })
      ),

      // Transactions
      transactions.length > 0 && React.createElement('div', { className: 'mb-md' },
        React.createElement('p', { className: 'text-xs text-secondary mb-sm' }, 'Transactions (' + transactions.length + ')'),
        React.createElement('div', { className: 'flex flex-col gap-sm' },
          (showAllTransactions ? transactions : transactions.slice(0, 3)).map(function (tx, i) {
            const amount = tx.amount || tx.value || '';
            const account = tx.account || tx.shellAccount || '';
            const time = tx.time || tx.timestamp || '';
            return React.createElement('div', { key: 'tx-' + i, className: 'evidence-item' },
              React.createElement('div', { className: 'evidence-item__header' },
                React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
                amount && React.createElement(Badge, { label: String(amount), color: 'var(--accent-red)' })
              ),
              React.createElement('div', { className: 'evidence-item__meta' },
                account && React.createElement('span', { className: 'text-xs text-muted' }, 'Account: ' + account),
                time && React.createElement('span', { className: 'text-xs text-muted' }, 'Time: ' + time)
              )
            );
          })
        ),
        transactions.length > 3 && React.createElement('button', {
          className: 'btn btn-ghost btn-sm mt-sm',
          onClick: function () { setShowAllTransactions(function (prev) { return !prev; }); }
        }, showAllTransactions ? 'Show fewer' : 'Show all ' + transactions.length + ' transactions')
      ),

      // Relationships count
      React.createElement('p', { className: 'text-xs text-muted' },
        'Relationships: ' + relationships.length + ' entries'
      )
    ),

    // ── Context Layer ──
    React.createElement('div', { className: 'evidence-layer evidence-layer--context' },
      React.createElement('h4', { className: 'evidence-layer__title' },
        'Context Layer',
        React.createElement(Badge, { label: 'reference', color: 'var(--layer-context)' })
      ),
      React.createElement('div', { className: 'evidence-item__meta' },
        React.createElement('span', { className: 'text-sm text-secondary' },
          'Character Profiles: ' + profileCount
        ),
        React.createElement('span', { className: 'text-sm text-secondary' },
          'Timeline Entries: ' + timelineCount
        )
      )
    ),

    // ── Curator Notes ──
    (curatorNotes.dispositionSummary || curatorNotes.curationRationale) &&
      React.createElement('div', { className: 'checkpoint-section' },
        React.createElement('h4', { className: 'checkpoint-section__title' }, 'Curator Notes'),
        curatorNotes.dispositionSummary && React.createElement('div', { className: 'mb-sm' },
          React.createElement('p', { className: 'text-xs text-muted' }, 'Disposition Summary'),
          React.createElement('p', { className: 'text-sm text-secondary' }, curatorNotes.dispositionSummary)
        ),
        curatorNotes.curationRationale && React.createElement('div', { className: 'mb-sm' },
          React.createElement('p', { className: 'text-xs text-muted' }, 'Rationale'),
          React.createElement('p', { className: 'text-sm text-secondary' }, curatorNotes.curationRationale)
        ),
        curatorNotes.layerRationale && React.createElement('div', { className: 'mb-sm' },
          React.createElement('p', { className: 'text-xs text-muted' }, 'Layer Rationale'),
          React.createElement('p', { className: 'text-sm text-secondary' }, curatorNotes.layerRationale)
        ),
        curatorNotes.characterCoverage && React.createElement('div', null,
          React.createElement('p', { className: 'text-xs text-muted' }, 'Character Coverage'),
          React.createElement('p', { className: 'text-sm text-secondary' }, curatorNotes.characterCoverage)
        )
      ),

    // ── Excluded Items (with rescue) ──
    excluded.length > 0 && React.createElement('div', { className: 'evidence-layer evidence-layer--excluded' },
      React.createElement('h4', { className: 'evidence-layer__title' },
        'Excluded Items',
        React.createElement(Badge, {
          label: excluded.length + ' excluded' + (rescuableCount > 0 ? ', ' + rescuableCount + ' rescuable' : ''),
          color: 'var(--layer-excluded)'
        })
      ),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        excluded.map(function (item, i) {
          const name = item.name || 'Item ' + (i + 1);
          const reasons = item.reasons || (item.reason ? [item.reason] : []);
          const isRescuable = item.rescuable === true;
          const isRescued = rescuedItems.has(name);

          return React.createElement('div', {
            key: name + '-' + i,
            className: 'evidence-item' + (isRescued ? ' evidence-item--selected' : '')
          },
            React.createElement('div', { className: 'evidence-item__header' },
              isRescuable && React.createElement('label', { className: 'checkbox-item' },
                React.createElement('input', {
                  type: 'checkbox',
                  className: 'checkbox-item__checkbox',
                  checked: isRescued,
                  onChange: function () { toggleRescue(name); },
                  'aria-label': 'Rescue ' + name
                })
              ),
              React.createElement('span', { className: 'evidence-item__name' }, name),
              React.createElement('div', { className: 'tag-list' },
                isRescuable
                  ? React.createElement(Badge, { label: 'rescuable', color: 'var(--accent-green)' })
                  : React.createElement(Badge, { label: 'excluded', color: 'var(--accent-red)' }),
                item.score != null && React.createElement(Badge, {
                  label: 'score: ' + item.score,
                  color: 'var(--accent-amber)'
                })
              )
            ),
            reasons.length > 0 && React.createElement('div', { className: 'evidence-item__meta' },
              reasons.map(function (reason, j) {
                return React.createElement('span', {
                  key: 'reason-' + i + '-' + j,
                  className: 'text-xs text-muted'
                }, reason);
              })
            )
          );
        })
      )
    ),

    // ── Curation Summary ──
    (curationSummary.totalCurated != null || curationSummary.rosterPlayers) &&
      React.createElement(CollapsibleSection, {
        title: 'Curation Summary',
        defaultOpen: false
      },
        React.createElement('div', { className: 'summary-stats' },
          curationSummary.rosterPlayers != null && React.createElement('div', { className: 'summary-stat' },
            React.createElement('span', { className: 'summary-stat__value' }, curationSummary.rosterPlayers),
            React.createElement('span', { className: 'summary-stat__label' }, 'Roster Players')
          ),
          curationSummary.suspects != null && React.createElement('div', { className: 'summary-stat' },
            React.createElement('span', { className: 'summary-stat__value' }, curationSummary.suspects),
            React.createElement('span', { className: 'summary-stat__label' }, 'Suspects')
          ),
          curationSummary.totalCurated != null && React.createElement('div', { className: 'summary-stat' },
            React.createElement('span', { className: 'summary-stat__value summary-stat__value--exposed' }, curationSummary.totalCurated),
            React.createElement('span', { className: 'summary-stat__label' }, 'Curated')
          ),
          curationSummary.totalExcluded != null && React.createElement('div', { className: 'summary-stat' },
            React.createElement('span', { className: 'summary-stat__value summary-stat__value--buried' }, curationSummary.totalExcluded),
            React.createElement('span', { className: 'summary-stat__label' }, 'Excluded')
          ),
          curationSummary.humanRescued != null && React.createElement('div', { className: 'summary-stat' },
            React.createElement('span', { className: 'summary-stat__value' }, curationSummary.humanRescued),
            React.createElement('span', { className: 'summary-stat__label' }, 'Rescued')
          )
        )
      ),

    // ── Action Buttons ──
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleApprove
      }, rescuedItems.size > 0
        ? 'Approve + Rescue Selected (' + rescuedItems.size + ')'
        : 'Approve'
      )
    )
  );
}

window.Console.checkpoints.EvidenceBundle = EvidenceBundle;
