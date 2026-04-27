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

/**
 * Module-scope text edit form component
 * Stable function reference preserves React reconciliation across parent re-renders
 */
function TextEditForm(props) {
  const { value, multiline, onSave, onCancel, placeholder, rows } = props;
  const [text, setText] = React.useState(value || '');
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(multiline ? 'textarea' : 'input', {
      className: 'input',
      value: text,
      onChange: function (e) { setText(e.target.value); },
      rows: rows || (multiline ? 4 : undefined),
      placeholder: placeholder || '',
      autoFocus: true
    }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: function () { onSave(text); } }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

/**
 * Render inline text/textarea edit form
 * Thin factory wrapper for backward-compatible API
 * @param {{value: string, multiline?: boolean, onSave: function, onCancel: function, placeholder?: string, rows?: number}} props
 * @returns {React.ReactElement}
 */
function renderTextEditForm(props) {
  return React.createElement(TextEditForm, props);
}

/**
 * Module-scope list edit form component
 * Tracks items with stable internal IDs to preserve input focus during removal
 * Stable function reference preserves React reconciliation across parent re-renders
 */
function ListEditForm(props) {
  const { items, onSave, onCancel, placeholder } = props;

  // Generate stable IDs once per list item to prevent focus loss on removal
  const [list, setList] = React.useState(function () {
    return (Array.isArray(items) ? items : []).map(function (v, i) {
      return { id: 'lif-' + Date.now() + '-' + i + '-' + Math.random().toString(36).slice(2, 8), value: v };
    });
  });

  function update(idx, val) {
    const copy = list.slice();
    copy[idx] = Object.assign({}, copy[idx], { value: val });
    setList(copy);
  }

  function remove(idx) {
    setList(list.filter(function (_, i) { return i !== idx; }));
  }

  function add() {
    setList(list.concat([{
      id: 'lif-' + Date.now() + '-new-' + Math.random().toString(36).slice(2, 8),
      value: ''
    }]));
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    list.map(function (item, idx) {
      return React.createElement('div', { key: item.id, className: 'flex gap-sm mb-sm' },
        React.createElement('input', {
          className: 'input flex-1',
          value: item.value,
          onChange: function (e) { update(idx, e.target.value); },
          placeholder: placeholder || ''
        }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { remove(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: add }, '+ Add'),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm' },
      React.createElement('button', {
        className: 'btn btn-sm btn-primary',
        onClick: function () {
          // Strip ids before returning — callers expect string[]
          onSave(list.map(function (it) { return it.value; }).filter(function (s) { return s && s.trim(); }));
        }
      }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

/**
 * Render inline list item edit form
 * Thin factory wrapper for backward-compatible API
 * @param {{items: string[], onSave: function, onCancel: function, placeholder?: string}} props
 * @returns {React.ReactElement}
 */
function renderListEditForm(props) {
  return React.createElement(ListEditForm, props);
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
  safeStringify,
  Badge,
  CollapsibleSection,
  JsonViewer,
  formatElapsed,
  editBtn,
  TextEditForm,
  renderTextEditForm,
  ListEditForm,
  renderListEditForm,
  CHECKPOINT_ORDER,
  CHECKPOINT_LABELS
};
