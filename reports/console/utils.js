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
 * The Opus evaluation for one gate (R5 F4 / CODE-REVIEW H6).
 *
 * Shared by arc-selection, outline and article: all three used to own a private
 * `renderEvalBar` that read `.overallScore` off the evaluationHistory ARRAY (and
 * `advisoryNotes`, which is not a field), so the evaluator's verdict — the whole
 * point of the evaluate/revise loop — rendered on no screen in any session.
 *
 * Takes an already-computed view so utils.js keeps no dependency on
 * checkpoint-view-logic.js (which loads after it): callers pass
 * `checkpointViewLogic.evaluationView(checkpointViewLogic.lastEvaluationFrom(data, phase))`.
 *
 * The structural issues are listed, not just counted: showing "3 structural
 * issues" without the sentences would repeat the original failure, since each
 * string is the self-contained instruction the reviser would have been given.
 *
 * Under the score line sits the view's `calibration` phrase (phase 2, brief 2.4):
 * the score is the model's own, not yet checked against the director's
 * decisions. The wording comes from checkpoint-view-logic.js, not from here.
 *
 * @param {{view: object|null}} props
 */
function EvalBar({ view }) {
  if (!view) return null;

  const parts = [];
  if (view.score !== null) parts.push('Score ' + view.score);
  parts.push('structural: ' + (view.passed ? 'passed' : 'failed'));
  parts.push(view.structuralIssues.length + ' structural issue' +
    (view.structuralIssues.length === 1 ? '' : 's'));
  if (view.confidence) parts.push('confidence: ' + view.confidence);
  // Only on a real revision: "after revision 0" on a first pass is noise.
  if (view.revisionNumber > 0) parts.push('after revision ' + view.revisionNumber);
  if (view.source) parts.push('source: ' + view.source);

  return React.createElement('div', { className: 'eval-bar mb-md flex-col items-start' },
    React.createElement('span', {
      className: view.passed ? 'eval-bar__score' : 'eval-bar__issues'
    }, parts.join(' · ')),

    view.calibration && React.createElement('p', { className: 'text-xs text-muted' }, view.calibration),

    view.escalationReason && React.createElement('p', {
      className: 'eval-bar__escalation validation-error',
      role: 'alert'
    }, 'Escalated to you: ' + view.escalationReason),

    view.structuralIssues.length > 0 && React.createElement('ul', { className: 'eval-bar__list eval-bar__list--structural' },
      view.structuralIssues.map((issue, i) =>
        React.createElement('li', { key: 'si-' + i }, issue)
      )
    ),

    view.advisoryWarnings.length > 0 && React.createElement('ul', { className: 'eval-bar__list eval-bar__list--advisory' },
      view.advisoryWarnings.map((warning, i) =>
        React.createElement('li', { key: 'aw-' + i }, warning)
      )
    ),

    view.revisionGuidance && React.createElement('p', { className: 'text-xs text-muted' },
      'Revision guidance: ' + view.revisionGuidance
    )
  );
}

/**
 * The trace (phase 2, brief 2.7): the automatic reworks that ran this round before
 * the director reached the outline or article stop. Each pass: why it ran, what it
 * had to fix, what it was told to consider, and what it changed. Read-only.
 *
 * Takes an already-computed view, like EvalBar: callers pass
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
        pass.guidance && React.createElement('p', { className: 'text-xs text-muted' }, pass.guidance),
        pass.criteria.length > 0 && React.createElement(CollapsibleSection, { title: pass.criteriaLabel },
          React.createElement('ul', { className: 'trace__list' },
            pass.criteria.map((c) => React.createElement('li', { key: c.key }, c.text))
          )
        )
      )
    )
  );
}

/**
 * The writer's questions for the director (phase 3, brief 3.7; spec C15, D8), above
 * the output at the arc, outline and article stops: one line per question, its kind
 * (fix 3.7b) and what it is about first, folded away on a click, then the stop's hint for
 * answering them in the note box (task 3.11). Nothing renders when the writer raised none.
 *
 * Takes an already-computed view, like EvalBar: callers pass
 * `checkpointViewLogic.writerQuestionsView(data.writerQuestions, '<their stop>')`.
 *
 * @param {{view: object|null}} props
 */
function WriterQuestionsPanel({ view }) {
  if (!view || !view.any) return null;
  return React.createElement('section', { className: 'writer-questions mb-md', 'aria-label': 'Questions from the writer' },
    React.createElement(CollapsibleSection, { title: view.title, defaultOpen: true },
      React.createElement('ul', { className: 'writer-questions__list' },
        view.items.map((item) => React.createElement('li', { key: item.key, className: 'writer-questions__item' },
          item.kindLabel && React.createElement('span', { className: 'writer-questions__kind' }, item.kindLabel),
          React.createElement('strong', { className: 'writer-questions__about' }, item.about),
          ': ',
          item.question
        ))
      ),
      React.createElement('p', { className: 'text-xs text-muted' }, view.hint)
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

const CHECKPOINT_LABELS = {
  'paper-evidence-selection': 'Paper Evidence',
  'await-roster': 'Roster',
  'await-full-context': 'Full Context',
  'input-review': 'Input Review',
  'pre-curation': 'Pre-Curation',
  'evidence-and-photos': 'Evidence Bundle',
  'arc-selection': 'Arc Selection',
  'photos': 'Photos (optional)',
  'character-ids': 'Character IDs',
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
  EvalBar,
  TracePanel,
  WriterQuestionsPanel,
  editBtn,
  CHECKPOINT_ORDER,
  CHECKPOINT_LABELS
};
