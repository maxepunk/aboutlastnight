/**
 * PaperEvidence Checkpoint Component
 * Displays paper evidence items with select-all and individual checkboxes.
 * Submits selected evidence items for curation.
 * Exports to window.Console.checkpoints.PaperEvidence
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;

function PaperEvidence({ data, onApprove }) {
  const items = (data && data.paperEvidence) || [];

  // Initialize all items as selected
  const [selectedItems, setSelectedItems] = React.useState(function () {
    const initial = new Set();
    items.forEach(function (_, i) { initial.add(i); });
    return initial;
  });

  // Track which descriptions are expanded
  const [expandedDescs, setExpandedDescs] = React.useState(new Set());

  // Reset selection when items change (e.g., after rollback and re-arrival)
  React.useEffect(function () {
    const all = new Set();
    items.forEach(function (_, i) { all.add(i); });
    setSelectedItems(all);
    setExpandedDescs(new Set());
  }, [items.length]);

  const allSelected = items.length > 0 && selectedItems.size === items.length;
  const noneSelected = selectedItems.size === 0;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedItems(new Set());
    } else {
      const all = new Set();
      items.forEach(function (_, i) { all.add(i); });
      setSelectedItems(all);
    }
  }

  function toggleItem(index) {
    setSelectedItems(function (prev) {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function toggleDescription(index) {
    setExpandedDescs(function (prev) {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }

  function handleSubmit() {
    const selected = items.filter(function (_, i) { return selectedItems.has(i); });
    onApprove({ selectedPaperEvidence: selected });
  }

  if (items.length === 0) {
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      React.createElement('p', { className: 'text-muted text-sm' }, 'No paper evidence available.'),
      React.createElement('div', { className: 'flex gap-md mt-md' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: function () { onApprove({ selectedPaperEvidence: [] }); }
        }, 'Continue Without Evidence')
      )
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Select all row
    React.createElement('label', { className: 'select-all' },
      React.createElement('input', {
        type: 'checkbox',
        className: 'checkbox-item__checkbox',
        checked: allSelected,
        onChange: toggleSelectAll
      }),
      React.createElement('span', { className: 'text-sm' },
        'Select All (' + selectedItems.size + ' of ' + items.length + ')'
      )
    ),

    // Evidence items list
    React.createElement('div', { className: 'flex flex-col gap-sm' },
      items.map(function (item, i) {
        const name = item.name || item.title || 'Untitled';
        const desc = item.description || '';
        const isExpanded = expandedDescs.has(i);
        const displayDesc = isExpanded ? desc : truncate(desc, 80);
        const attachmentCount = (item.attachments && item.attachments.length) || 0;

        return React.createElement('div', {
          key: (item.name || item.title || '') + '-' + i,
          className: 'evidence-item' + (selectedItems.has(i) ? ' evidence-item--selected' : '')
        },
          React.createElement('div', { className: 'evidence-item__header' },
            React.createElement('label', { className: 'checkbox-item' },
              React.createElement('input', {
                type: 'checkbox',
                className: 'checkbox-item__checkbox',
                checked: selectedItems.has(i),
                onChange: function () { toggleItem(i); }
              }),
              React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1))
            ),
            React.createElement('span', { className: 'evidence-item__name' }, name),
            React.createElement('div', { className: 'tag-list' },
              item.type && React.createElement(Badge, { label: item.type, color: 'var(--accent-amber)' }),
              item.category && React.createElement(Badge, { label: item.category, color: 'var(--accent-cyan)' })
            )
          ),

          // Description
          desc && React.createElement('div', { className: 'evidence-item__desc' },
            React.createElement('span', { className: 'text-sm text-secondary' }, displayDesc),
            desc.length > 80 && React.createElement('button', {
              className: 'btn btn-ghost btn-sm',
              onClick: function () { toggleDescription(i); }
            }, isExpanded ? 'Show less' : 'Show more')
          ),

          // Meta info
          React.createElement('div', { className: 'evidence-item__meta' },
            item.owner && React.createElement('span', { className: 'text-xs text-muted' }, 'Owner: ' + item.owner),
            item.dateFound && React.createElement('span', { className: 'text-xs text-muted' }, 'Found: ' + item.dateFound),
            attachmentCount > 0 && React.createElement('span', { className: 'text-xs text-muted' },
              attachmentCount + ' attachment' + (attachmentCount > 1 ? 's' : '')
            )
          )
        );
      })
    ),

    // Submit button
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        disabled: noneSelected,
        onClick: handleSubmit
      }, 'Approve Selection (' + selectedItems.size + ')')
    )
  );
}

window.Console.checkpoints.PaperEvidence = PaperEvidence;
