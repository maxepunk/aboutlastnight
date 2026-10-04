/**
 * Shared Display Utilities
 * Exports to window.Console.utils
 */

window.Console = window.Console || {};

/**
 * Truncate string with ellipsis
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 80) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen - 1) + '\u2026';
}

/**
 * Small colored pill/tag component
 * @param {{label: string, color: string}} props
 */
function Badge({ label, color }) {
  // Map CSS variable colors to badge modifier classes
  const colorClassMap = {
    'var(--accent-amber)': 'badge--amber',
    'var(--accent-cyan)': 'badge--cyan',
    'var(--accent-green)': 'badge--green',
    'var(--accent-red)': 'badge--red',
    'var(--layer-exposed)': 'badge--green',
    'var(--layer-buried)': 'badge--red',
    'var(--layer-context)': 'badge--cyan',
    'var(--layer-excluded)': 'badge--amber'
  };
  const colorClass = colorClassMap[color] || 'badge--amber';
  return React.createElement('span', { className: 'badge ' + colorClass }, label);
}

/**
 * Click to expand/collapse section
 * @param {{title: string, defaultOpen?: boolean, children: React.ReactNode}} props
 */
function CollapsibleSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = React.useState(defaultOpen);

  return React.createElement('div', { className: 'collapsible-section' },
    React.createElement('button', {
      className: 'collapsible-header',
      onClick: () => setOpen(!open),
      'aria-expanded': open
    },
      React.createElement('span', { className: 'collapsible-arrow' }, open ? '\u25BC' : '\u25B6'),
      ' ',
      title
    ),
    open && React.createElement('div', { className: 'collapsible-body' }, children)
  );
}

/**
 * Safe JSON.stringify with try/catch for circular references or BigInts
 * @param {any} obj
 * @param {number} indent
 * @returns {string}
 */
function safeStringify(obj, indent = 2) {
  try {
    return JSON.stringify(obj, null, indent);
  } catch {
    return String(obj);
  }
}

/**
 * Collapsible JSON viewer
 * @param {{data: any, label?: string}} props
 */
function JsonViewer({ data, label }) {
  return React.createElement(CollapsibleSection, {
    title: label || 'JSON Data',
    defaultOpen: false
  },
    React.createElement('pre', { className: 'json-viewer' },
      safeStringify(data)
    )
  );
}

/**
 * Format elapsed milliseconds to human-readable string
 * @param {number} ms
 * @returns {string} e.g., "1m 23s" or "45s"
 */
function formatElapsed(ms) {
  if (ms == null || ms < 0) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * The trace (phase 2, brief 2.7): the automatic reworks that ran this round before
 * the director reached the map or the article stop, folded below each. Each pass: why it
 * ran, what it had to fix, what it was told to consider, and what it changed, with no
 * score (task 4.10). Read-only.
 *
 * Takes an already-computed view, so utils.js keeps no dependency on
 * checkpoint-view-logic.js (which loads after it): callers pass
 * `checkpointViewLogic.traceView(data.trace, theme)`.
 *
 * @param {{view: object|null}} props
 */
function TracePanel({ view }) {
  if (!view || !view.any) return null;

  const findingList = (group, severity, key) => group.items.length > 0 && React.createElement('div', { key },
    React.createElement('p', { className: 'trace__label trace__label--' + severity }, group.label),
    React.createElement('ul', { className: 'trace__list trace__list--' + severity },
      group.items.map((item, i) => React.createElement('li', { key: key + '-' + i }, item))
    )
  );

  return React.createElement('section', { className: 'trace mb-md', 'aria-label': 'Trace of the automatic reworks' },
    React.createElement('h4', { className: 'trace__title' }, view.title),
    view.passes.map((pass) =>
      React.createElement('div', { key: pass.key, className: 'trace__pass' },
        React.createElement('p', { className: 'trace__heading' }, pass.heading),
        React.createElement('p', { className: 'trace__trigger' }, pass.triggerLabel),
        findingList(pass.mustFix, 'structural', pass.key + '-must'),
        findingList(pass.shouldConsider, 'advisory', pass.key + '-should'),
        pass.noFindings && React.createElement('p', { className: 'text-xs text-muted' },
          'No findings were recorded for this pass.'
        ),
        React.createElement('p', { className: 'trace__changed' }, pass.changed.text),
        pass.guidance && React.createElement('p', { className: 'text-xs text-muted' }, pass.guidance)
      )
    )
  );
}

/**
 * Edit button (pencil icon)
 * @param {function} onClick
 * @returns {React.ReactElement}
 */
function editBtn(onClick) {
  return React.createElement('button', {
    className: 'article-block__edit-btn',
    onClick: function (e) { e.stopPropagation(); onClick(); },
    'aria-label': 'Edit',
    title: 'Edit'
  }, '✎');
}

// H3: the stepper's pipeline order. Single copy lives in session-start-logic.js
// (dual-export, so __tests__/unit/console-checkpoint-order.test.js can check it
// against lib/workflow/graph.js); this file only republishes it. session-start-logic.js
// must load BEFORE utils.js in index.html — the read happens at load time.
const CHECKPOINT_ORDER = window.Console.sessionStartLogic.CHECKPOINT_ORDER;

// R3: the stop types keep their names, and the console calls the arc stop the story
// meeting and the outline stop the map (phase 4, task 4.8).
const CHECKPOINT_LABELS = {
  'paper-evidence-selection': 'Paper Evidence',
  'await-roster': 'Roster',
  'await-full-context': 'Full Context',
  'input-review': 'Input Review',
  'pre-curation': 'Pre-Curation',
  'evidence-and-photos': 'Evidence Bundle',
  'arc-selection': 'Story meeting',
  'photos': 'Photos (optional)',
  'character-ids': 'Character IDs',
  'outline': 'Map',
  'article': 'Article'
};

window.Console.utils = {
  truncate,
  safeStringify,
  Badge,
  CollapsibleSection,
  JsonViewer,
  formatElapsed,
  TracePanel,
  editBtn,
  CHECKPOINT_ORDER,
  CHECKPOINT_LABELS
};
