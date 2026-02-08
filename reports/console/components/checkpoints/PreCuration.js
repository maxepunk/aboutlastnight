/**
 * PreCuration Checkpoint Component
 * Displays preprocessed evidence summary, counts, and item preview.
 * Read-only checkpoint — approve only.
 * Exports to window.Console.checkpoints.PreCuration
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, truncate } = window.Console.utils;

function PreCuration({ data, onApprove }) {
  const summary = (data && data.preCurationSummary) || '';
  const evidence = (data && data.preprocessedEvidence) || {};
  const items = evidence.items || [];

  // Compute stats
  const totalCount = items.length;
  const exposedCount = items.filter(function (it) { return it.disposition === 'exposed'; }).length;
  const buriedCount = items.filter(function (it) { return it.disposition === 'buried'; }).length;
  const tokenCount = items.filter(function (it) { return it.sourceType === 'memory-token'; }).length;
  const paperCount = items.filter(function (it) { return it.sourceType === 'paper-evidence'; }).length;

  const previewItems = items.slice(0, 5);
  const hasMore = items.length > 5;

  function renderEvidenceItem(item, i) {
    const dispositionColor = item.disposition === 'exposed' ? 'var(--layer-exposed)' : 'var(--layer-buried)';
    const sourceColor = item.sourceType === 'memory-token' ? 'var(--accent-cyan)' : 'var(--accent-amber)';

    return React.createElement('div', { key: item.id || i, className: 'evidence-item' },
      React.createElement('div', { className: 'evidence-item__header' },
        React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
        React.createElement('span', { className: 'evidence-item__name' }, item.id || 'Item ' + (i + 1)),
        React.createElement('div', { className: 'tag-list' },
          React.createElement(Badge, { label: item.disposition, color: dispositionColor }),
          React.createElement(Badge, { label: item.sourceType, color: sourceColor })
        )
      ),
      item.summary && React.createElement('div', { className: 'evidence-item__desc' },
        React.createElement('span', { className: 'text-sm text-secondary' }, truncate(item.summary, 120))
      ),
      item.significance && React.createElement('div', { className: 'evidence-item__meta' },
        React.createElement('span', { className: 'text-xs text-muted' }, 'Significance: ' + item.significance)
      )
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Summary stats
    React.createElement('div', { className: 'summary-stats' },
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value' }, totalCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Total')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--exposed' }, exposedCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Exposed')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--buried' }, buriedCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Buried')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--tokens' }, tokenCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Tokens')
      ),
      React.createElement('div', { className: 'summary-stat' },
        React.createElement('span', { className: 'summary-stat__value summary-stat__value--paper' }, paperCount),
        React.createElement('span', { className: 'summary-stat__label' }, 'Paper')
      )
    ),

    // Curation summary text
    summary && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Curation Summary'),
      React.createElement('p', { className: 'text-sm text-secondary' }, summary)
    ),

    // Preview items
    previewItems.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Evidence Preview'),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        previewItems.map(renderEvidenceItem)
      )
    ),

    // Expandable full list
    hasMore && React.createElement(CollapsibleSection, {
      title: 'View All ' + totalCount + ' Items',
      defaultOpen: false
    },
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        items.slice(5).map(function (item, i) {
          return renderEvidenceItem(item, i + 5);
        })
      )
    ),

    // Approve button
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: function () { onApprove({ preCuration: true }); }
      }, 'Approve Pre-Curation')
    )
  );
}

window.Console.checkpoints.PreCuration = PreCuration;
