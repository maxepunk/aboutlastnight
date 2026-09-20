/**
 * RevisionDiff Component
 * Shared component for displaying revision diffs in outline/article checkpoints.
 * Shows revision number banner, previous feedback, shallow object diff,
 * and escalation warning when at max revisions.
 * Exports to window.Console.RevisionDiff
 */

window.Console = window.Console || {};

const { Badge } = window.Console.utils;

const ViewLogic = window.Console.checkpointViewLogic;

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

function RevisionDiff({ previous, current, revisionCount, maxRevisions, previousFeedback, humanRevisionCount, handEditReport, gateNotes }) {
  const hasPrevious = previous !== null && previous !== undefined;

  // Spec 2026-09-19 §4.4/§5.5: the hand-edit report and the standing notes render
  // here too, and they must render on a gate with no revision state (the first
  // outline gate after an arc rejection has notes and nothing else).
  const steering = ViewLogic.steeringView(handEditReport, gateNotes);

  // R5 F10: the whole component used to bail out on `!previous`, which took the
  // revision banner, the "N remaining" budget, the max-revisions warning AND the
  // director's own last feedback with it - even when the server HAD sent
  // revisionCount, humanRevisionCount, maxRevisions and previousFeedback.
  // `previous` is client-only (revisionCache, written by the reject handlers), so
  // after a refresh or a laptop sleep the director resumed with no idea how many
  // revisions remained (the arc cap is 2) or what they had asked for last time.
  // Server data drives the banner; only the DIFF LISTING needs `previous`.
  const hasRevisionState = revisionCount > 0 || humanRevisionCount > 0 || !!previousFeedback || steering.any;
  if (!hasPrevious && !hasRevisionState) {
    return null;
  }

  // Brief 1.4: every stop shows rounds the same way. The counters mean different
  // things — humanRevisionCount is the director's rounds, revisionCount the
  // machine's own passes inside the current one — and the strings are decided in
  // the pure module. There is no "final version" line any more: the director's
  // rounds are not capped, and the one the console printed after two send-backs
  // was false as well as final-sounding.
  const rounds = ViewLogic.roundsBanner(humanRevisionCount, revisionCount, maxRevisions);

  return React.createElement('div', { className: 'revision-diff fade-in' },

    // Round banner: which look this is, and what the machine has spent inside it
    rounds.show && React.createElement('div', { className: 'revision-diff__banner' },
      React.createElement('div', null,
        React.createElement('span', { className: 'revision-diff__banner-text' }, rounds.roundLabel),
        React.createElement('div', { className: 'text-xs text-muted' }, rounds.automatedLabel)
      ),
      React.createElement(Badge, {
        label: rounds.remainingLabel,
        color: rounds.remainingColor
      })
    ),

    // Previous feedback callout
    previousFeedback && React.createElement('div', { className: 'revision-diff__feedback' },
      React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Previous Feedback'),
      React.createElement('p', { className: 'revision-diff__feedback-text' }, previousFeedback)
    ),

    // Hand-edit report: what the rework did to the director's own edits (§4.4).
    // Muted amber, NOT `.revision-diff__warning`: nothing here blocks anything, and
    // the red "Maximum revisions reached" treatment read as a failure (M15).
    // The amber lives on the `--changed` modifier so the muted "kept" line below,
    // which shares the base class, stays a plain line of text.
    steering.changedLabels.length > 0 && React.createElement('div', {
      className: 'revision-diff__hand-edits revision-diff__hand-edits--changed', role: 'status'
    }, 'The rework changed sections you edited by hand: ' + steering.changedLabels.join(', ') + '.'),
    steering.keptCount > 0 && React.createElement('div', {
      className: 'text-xs text-muted revision-diff__hand-edits revision-diff__hand-edits--kept', role: 'status'
    }, 'Rework kept all ' + steering.keptCount + ' hand edit' + (steering.keptCount === 1 ? '' : 's') + '.'),

    // Standing notes the writer will see (§5.5)
    steering.notes.length > 0 && React.createElement('div', { className: 'revision-diff__feedback revision-diff__notes' },
      React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Standing notes the writer will see'),
      React.createElement('ul', { className: 'revision-diff__notes-list' },
        steering.notes.map(function (n, i) {
          return React.createElement('li', { key: i, className: 'revision-diff__feedback-text' },
            React.createElement('span', { className: 'text-muted' }, n.label + ' '), n.text);
        })
      )
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
