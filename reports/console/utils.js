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
  const style = {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '10px',
    fontSize: '11px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 600,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: '#fff',
    backgroundColor: color || 'var(--accent-amber)'
  };
  return React.createElement('span', { style }, label);
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
 * Collapsible JSON viewer
 * @param {{data: any, label?: string}} props
 */
function JsonViewer({ data, label }) {
  return React.createElement(CollapsibleSection, {
    title: label || 'JSON Data',
    defaultOpen: false
  },
    React.createElement('pre', { className: 'json-viewer' },
      JSON.stringify(data, null, 2)
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

const CHECKPOINT_ORDER = [
  'input-review', 'paper-evidence-selection', 'await-roster', 'character-ids',
  'await-full-context', 'pre-curation', 'evidence-and-photos', 'arc-selection',
  'outline', 'article'
];

const CHECKPOINT_LABELS = {
  'input-review': 'Input Review',
  'paper-evidence-selection': 'Paper Evidence',
  'await-roster': 'Roster',
  'character-ids': 'Character IDs',
  'await-full-context': 'Full Context',
  'pre-curation': 'Pre-Curation',
  'evidence-and-photos': 'Evidence Bundle',
  'arc-selection': 'Arc Selection',
  'outline': 'Outline',
  'article': 'Article'
};

window.Console.utils = {
  truncate,
  Badge,
  CollapsibleSection,
  JsonViewer,
  formatElapsed,
  CHECKPOINT_ORDER,
  CHECKPOINT_LABELS
};
