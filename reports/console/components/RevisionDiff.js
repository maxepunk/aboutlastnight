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

function RevisionDiff({ previous, current, revisionCount, maxRevisions, previousFeedback, humanRevisionCount, maxHumanRevisions }) {
  const hasPrevious = previous !== null && previous !== undefined;

  // R5 F10: the whole component used to bail out on `!previous`, which took the
  // revision banner, the "N remaining" budget, the max-revisions warning AND the
  // director's own last feedback with it - even when the server HAD sent
  // revisionCount, humanRevisionCount, maxRevisions and previousFeedback.
  // `previous` is client-only (revisionCache, written by the reject handlers), so
  // after a refresh or a laptop sleep the director resumed with no idea how many
  // revisions remained (the arc cap is 2) or what they had asked for last time.
  // Server data drives the banner; only the DIFF LISTING needs `previous`.
  const hasRevisionState = revisionCount > 0 || humanRevisionCount > 0 || !!previousFeedback;
  if (!hasPrevious && !hasRevisionState) {
    return null;
  }

  // Show whichever revision type is active
  // Only treat as human revision when both count AND max are explicitly provided
  const isHumanRevision = humanRevisionCount > 0 && maxHumanRevisions > 0;
  const displayCount = isHumanRevision ? humanRevisionCount : revisionCount;
  const displayMax = isHumanRevision ? maxHumanRevisions : maxRevisions;
  const budgetRemaining = displayMax - displayCount;
  const budgetColor = budgetRemaining > 1 ? 'var(--accent-green)' :
                      budgetRemaining === 1 ? 'var(--accent-amber)' :
                      'var(--accent-red)';
  // A cap of 0/undefined means "this gate reported no budget", not "at the cap".
  const atMax = displayMax > 0 && displayCount >= displayMax;
  const showBanner = displayCount > 0 && displayMax > 0;

  return React.createElement('div', { className: 'revision-diff fade-in' },

    // Revision number banner
    showBanner && React.createElement('div', { className: 'revision-diff__banner' },
      React.createElement('span', { className: 'revision-diff__banner-text' },
        (isHumanRevision ? 'Human Revision ' : 'Revision ') + displayCount + ' of ' + displayMax
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

    // Shallow diff listing. Only this part needs the client-cached previous
    // version; everything above comes from the server payload.
    hasPrevious && React.createElement('div', { className: 'revision-diff__changes' },
      React.createElement('span', { className: 'text-xs text-muted mb-sm d-block' },
        'Changes from previous version'
      ),
      shallowDiff(previous, current).map(function (item) {
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
