/**
 * RevisionDiff Component
 * Shared component for displaying revision diffs in outline/article checkpoints.
 * Shows revision number banner, previous feedback, shallow object diff,
 * and escalation warning when at max revisions.
 * Exports to window.Console.RevisionDiff
 */

window.Console = window.Console || {};

const { Badge } = window.Console.utils;

/**
 * Compute shallow diff between two objects.
 * Returns array of { key, status, detail } where status is
 * 'added', 'modified', 'removed', or 'unchanged'.
 */
function shallowDiff(previous, current) {
  const prevKeys = Object.keys(previous || {});
  const currKeys = Object.keys(current || {});
  const allKeys = Array.from(new Set([...prevKeys, ...currKeys]));
  allKeys.sort();

  return allKeys.map(function (key) {
    const inPrev = prevKeys.includes(key);
    const inCurr = currKeys.includes(key);

    if (!inPrev && inCurr) {
      return { key, status: 'added', detail: 'new field' };
    }
    if (inPrev && !inCurr) {
      return { key, status: 'removed', detail: 'removed' };
    }

    // Both exist — shallow compare
    const prevVal = previous[key];
    const currVal = current[key];
    const prevType = typeof prevVal;
    const currType = typeof currVal;

    if (prevType !== currType) {
      return { key, status: 'modified', detail: prevType + ' \u2192 ' + currType };
    }

    if (prevType === 'object' && prevVal !== null && currVal !== null) {
      const prevStr = JSON.stringify(prevVal);
      const currStr = JSON.stringify(currVal);
      if (prevStr === currStr) {
        return { key, status: 'unchanged', detail: 'no change' };
      }
      const prevLen = Array.isArray(prevVal) ? prevVal.length : Object.keys(prevVal).length;
      const currLen = Array.isArray(currVal) ? currVal.length : Object.keys(currVal).length;
      if (Array.isArray(prevVal) && Array.isArray(currVal)) {
        return { key, status: 'modified', detail: prevLen + ' \u2192 ' + currLen + ' items' };
      }
      return { key, status: 'modified', detail: 'content changed' };
    }

    if (prevVal === currVal) {
      return { key, status: 'unchanged', detail: 'no change' };
    }

    return { key, status: 'modified', detail: 'value changed' };
  });
}

const STATUS_PREFIX = {
  added: '+ ',
  modified: '~ ',
  removed: '- ',
  unchanged: '= '
};

function RevisionDiff({ previous, current, revisionCount, maxRevisions, previousFeedback }) {
  // Only render if we have a previous version to compare
  if (previous === null || previous === undefined) {
    return null;
  }

  const budgetRemaining = maxRevisions - revisionCount;
  const budgetColor = budgetRemaining > 1 ? 'var(--accent-green)' :
                      budgetRemaining === 1 ? 'var(--accent-amber)' :
                      'var(--accent-red)';
  const atMax = revisionCount >= maxRevisions;

  const diffItems = shallowDiff(previous, current);

  return React.createElement('div', { className: 'revision-diff fade-in' },

    // Revision number banner
    React.createElement('div', { className: 'revision-diff__banner' },
      React.createElement('span', { className: 'revision-diff__banner-text' },
        'Revision ' + revisionCount + ' of ' + maxRevisions
      ),
      React.createElement(Badge, {
        label: budgetRemaining + ' remaining',
        color: budgetColor
      })
    ),

    // Max revision escalation warning
    atMax && React.createElement('div', { className: 'revision-diff__warning' },
      'Maximum revisions reached \u2014 this is the final version.'
    ),

    // Previous feedback callout
    previousFeedback && React.createElement('div', { className: 'revision-diff__feedback' },
      React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Previous Feedback'),
      React.createElement('p', { className: 'revision-diff__feedback-text' }, previousFeedback)
    ),

    // Shallow diff listing
    React.createElement('div', { className: 'revision-diff__changes' },
      React.createElement('span', { className: 'text-xs text-muted mb-sm d-block' },
        'Changes from previous version'
      ),
      diffItems.map(function (item) {
        return React.createElement('div', {
          key: item.key,
          className: 'revision-diff__item revision-diff__item--' + item.status
        },
          React.createElement('span', { className: 'revision-diff__item-prefix' },
            STATUS_PREFIX[item.status]
          ),
          React.createElement('span', { className: 'revision-diff__item-key' }, item.key),
          React.createElement('span', { className: 'revision-diff__item-detail' }, item.detail)
        );
      })
    )
  );
}

window.Console.RevisionDiff = RevisionDiff;
