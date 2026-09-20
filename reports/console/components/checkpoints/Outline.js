/**
 * Outline Checkpoint Component
 * Displays article outline with structured sections.
 * Journalist: LEDE, THE STORY, FOLLOW THE MONEY, THE PLAYERS, WHAT'S MISSING, CLOSING
 * Detective: EXECUTIVE SUMMARY, EVIDENCE LOCKER, MEMORY ANALYSIS, SUSPECT NETWORK,
 *            OUTSTANDING QUESTIONS, FINAL ASSESSMENT
 * Supports approve, edit-and-approve, and send back for a rework. One note box is
 * always on screen and is sent with whichever action the director takes (brief 1.1).
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, safeStringify, editBtn, EvalBar } = window.Console.utils;
const { RevisionDiff } = window.Console;
const EditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;

// R4 F1 / R5 F5: every container that holds a pencil must carry
// `article-block--editable` — it supplies the `position: relative` the
// absolutely-positioned button needs AND is the hook the reveal rules key on.
// Outline.js emitted it at zero of its 13 call sites, so the whole rich editor
// (outline-edit-logic.js, its unit tests and the client-side validateOutlineShape
// gate) was unreachable from the UI.
//
// `--editable-always` is the OPT-IN always-visible state (review fix 1): these
// hosts carry a short ALL-CAPS <h4> at the top-LEFT, so the button's top-right
// corner is empty and the affordance can be discoverable without hover. The
// ARTICLE gate must NOT use it — its hosts are full-width per-block containers
// whose own first line runs under the button. Pinned by
// __tests__/unit/console-editable-pencils.test.js.
const ALWAYS = 'article-block--editable article-block--editable-always';
const EDITABLE = 'outline-section ' + ALWAYS;

// ═══════════════════════════════════════════════════════
// Shared edit widgets (pure-presentational; call EditLogic primitives)
// ═══════════════════════════════════════════════════════

function actionsRow(onSave, onCancel) {
  return React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
    React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: onSave }, 'Save'),
    React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
  );
}

function TextField(props) {
  const label = props.label;
  const value = props.value || '';
  const onChange = props.onChange;
  const multiline = props.multiline;
  const placeholder = props.placeholder || '';
  return React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    React.createElement(multiline ? 'textarea' : 'input', {
      className: 'input',
      value: value,
      placeholder: placeholder,
      rows: multiline ? 3 : undefined,
      onChange: function (e) { onChange(e.target.value); }
    })
  );
}

function EnumSelect(props) {
  const label = props.label;
  const value = props.value;
  const options = props.options || [];
  const onChange = props.onChange;
  const includeBlank = props.includeBlank;
  const opts = (includeBlank ? [''] : []).concat(options);
  return React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    React.createElement('select', {
      className: 'input',
      value: value == null ? '' : value,
      onChange: function (e) { onChange(e.target.value); }
    }, opts.map(function (opt, i) {
      return React.createElement('option', { key: i, value: opt }, opt === '' ? '(none)' : opt);
    }))
  );
}

function StringListEditor(props) {
  const label = props.label;
  const items = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  const placeholder = props.placeholder || '';
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    items.map(function (item, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', {
          className: 'input flex-1',
          value: item || '',
          placeholder: placeholder,
          onChange: function (e) {
            const next = items.slice();
            next[idx] = e.target.value;
            onChange(next);
          }
        }),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove item',
          onClick: function () { onChange(EditLogic.removeRow(items, idx)); }
        }, '×')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(items, '')); }
    }, '+ Add')
  );
}

function ObjectListEditor(props) {
  const label = props.label;
  const rows = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  const renderRow = props.renderRow; // (row, idx, setField) => ReactElement
  const makeRow = props.makeRow;     // () => object
  function setField(idx, field, val) { onChange(EditLogic.setRowField(rows, idx, field, val)); }
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    rows.map(function (row, idx) {
      return React.createElement('div', { key: idx, className: 'article-block--editing mb-sm' },
        renderRow(row, idx, setField),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove row',
          onClick: function () { onChange(EditLogic.removeRow(rows, idx)); }
        }, '× Remove')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(rows, makeRow())); }
    }, '+ Add')
  );
}

// ═════════════════════════════════════════════════════
// View-mode content (R4 F1 companion: FOLLOW THE MONEY, THE PLAYERS and
// WHAT'S MISSING rendered ONLY item counts, so with the pencils invisible the
// director was approving half an outline they could not read)
// ═════════════════════════════════════════════════════

/**
 * `arcName → <angle>` per row. `angleField` is the per-section field name in
 * outline.schema.json: financialAngle / characterAngle / openQuestion.
 */
function arcConnectionList(connections, angleField) {
  const rows = Array.isArray(connections) ? connections : [];
  if (rows.length === 0) return null;
  return React.createElement('ul', { className: 'outline-section__list' },
    rows.map(function (row, i) {
      const angle = row && row[angleField];
      return React.createElement('li', { key: 'ac-' + i, className: 'text-sm' },
        React.createElement('strong', null, (row && row.arcName) || 'Arc ' + (i + 1)),
        React.createElement('span', { className: 'text-muted' }, ' → '),
        React.createElement('span', { className: 'text-secondary' },
          typeof angle === 'string' ? angle : (angle == null ? '(not set)' : safeStringify(angle))
        )
      );
    })
  );
}

/** characterHighlights is an object map of name -> highlight. */
function characterHighlightList(highlights) {
  const rows = EditLogic.mapToRows(highlights);
  if (rows.length === 0) return null;
  return React.createElement('ul', { className: 'outline-section__list' },
    rows.map(function (row, i) {
      return React.createElement('li', { key: 'ch-' + i, className: 'text-sm' },
        React.createElement('strong', null, row.key),
        React.createElement('span', { className: 'text-muted' }, ' → '),
        React.createElement('span', { className: 'text-secondary' }, row.value)
      );
    })
  );
}

/**
 * `filename after paragraph N, purpose` (review fix 3).
 *
 * `photoPlacement` is `{filename, afterParagraph, purpose}`; both call sites used
 * to hand the object to safeStringify, so the outline gate printed raw JSON at
 * the one place the director decides whether a photo is in the right place.
 */
function photoPlacementLine(placement) {
  if (!placement) return null;
  if (typeof placement === 'string') return placement;
  if (typeof placement !== 'object') return null;
  const filename = typeof placement.filename === 'string' ? placement.filename : '';
  if (!filename) return null;
  let line = filename;
  if (placement.afterParagraph != null) line += ' after paragraph ' + placement.afterParagraph;
  if (placement.purpose) line += ', ' + placement.purpose;
  return line;
}

/** A labelled row of name badges (exposed / buried / buried items). */
function nameRow(label, names, color) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (list.length === 0) return null;
  return React.createElement('div', { className: 'flex gap-sm items-center mt-sm' },
    React.createElement('span', { className: 'text-xs text-muted' }, label + ': '),
    React.createElement('div', { className: 'tag-list' },
      list.map(function (name, i) {
        return React.createElement(Badge, { key: label + '-' + i, label: String(name), color: color });
      })
    )
  );
}

/**
 * Say "empty" out loud. A section the generator left blank must not look
 * identical to one this screen simply failed to render — that ambiguity is what
 * the count-only renderers created.
 */
function emptyNote() {
  for (let i = 0; i < arguments.length; i += 1) {
    const value = arguments[i];
    if (Array.isArray(value) ? value.length > 0 : !!value) return null;
  }
  return React.createElement('p', { className: 'text-xs text-muted' },
    'This section is empty in the generated outline.'
  );
}

function KeyValueEditor(props) {
  const label = props.label;
  const rows = Array.isArray(props.value) ? props.value : [];
  const onChange = props.onChange;
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' },
    label && React.createElement('span', { className: 'text-xs text-muted' }, label),
    rows.map(function (row, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', {
          className: 'input flex-1',
          value: row.key || '',
          placeholder: 'name',
          'aria-label': 'Key',
          onChange: function (e) { onChange(EditLogic.setRowField(rows, idx, 'key', e.target.value)); }
        }),
        React.createElement('input', {
          className: 'input flex-1',
          value: row.value || '',
          placeholder: 'highlight',
          'aria-label': 'Value',
          onChange: function (e) { onChange(EditLogic.setRowField(rows, idx, 'value', e.target.value)); }
        }),
        React.createElement('button', {
          className: 'btn btn-sm btn-ghost',
          'aria-label': 'Remove pair',
          onClick: function () { onChange(EditLogic.removeRow(rows, idx)); }
        }, '×')
      );
    }),
    React.createElement('button', {
      className: 'btn btn-sm btn-ghost mb-sm',
      onClick: function () { onChange(EditLogic.addRow(rows, { key: '', value: '' })); }
    }, '+ Add')
  );
}

// ═══════════════════════════════════════════════════════
// Editor components at module scope
// ═══════════════════════════════════════════════════════

/**
 * Thesis editor (spec 2026-09-19 §6.1): the three LEDE fields the director rewrites
 * most, with their own pencil. Saves through the LEDE path via EditLogic.buildThesisPayload.
 */
function ThesisEditor({ lede, onSave, onCancel }) {
  const [form, setForm] = React.useState(EditLogic.initThesis(lede));
  function set(key) {
    return function (value) { setForm(function (prev) { return Object.assign({}, prev, { [key]: value }); }); };
  }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Hook', value: form.hook, onChange: set('hook'), multiline: true }),
    React.createElement(TextField, { label: 'Key tension', value: form.keyTension, onChange: set('keyTension'), multiline: true }),
    React.createElement(TextField, { label: 'Primary arc', value: form.primaryArc, onChange: set('primaryArc') }),
    actionsRow(function () { onSave(EditLogic.buildThesisPayload(form, lede)); }, onCancel)
  );
}

function LedeEditor({ lede, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initLede(lede); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildLedePayload(state, lede)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Hook', value: state.hook, multiline: true, onChange: function (v) { set('hook', v); } }),
    React.createElement(TextField, { label: 'Key Tension', value: state.keyTension, multiline: true, onChange: function (v) { set('keyTension', v); } }),
    React.createElement(TextField, { label: 'Primary Arc', value: state.primaryArc, onChange: function (v) { set('primaryArc', v); } }),
    React.createElement(StringListEditor, { label: 'Selected Evidence (optional)', value: state.selectedEvidence, placeholder: 'token id', onChange: function (v) { set('selectedEvidence', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function ArcOutlineEditor({ arc, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initArc(arc); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildArcPayload(state, arc)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Arc Name', value: state.name, onChange: function (v) { set('name', v); } }),
    React.createElement(TextField, { label: 'Paragraph Count', value: state.paragraphCount, onChange: function (v) { set('paragraphCount', v); } }),
    React.createElement('p', { className: 'text-xs text-muted' }, 'Evidence cards and photo placement are preserved automatically and not editable here.'),
    actionsRow(handleSave, onCancel)
  );
}

function ArcInterweavingEditor({ interweaving, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initArcInterweaving(interweaving); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildArcInterweavingPayload(state, interweaving)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Interleaving Plan', value: state.interleavingPlan, multiline: true, onChange: function (v) { set('interleavingPlan', v); } }),
    React.createElement(TextField, { label: 'Convergence Point', value: state.convergencePoint, multiline: true, onChange: function (v) { set('convergencePoint', v); } }),
    React.createElement('p', { className: 'text-xs text-muted' }, 'Callback opportunities are preserved automatically and not editable here.'),
    actionsRow(handleSave, onCancel)
  );
}

function FollowTheMoneyEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initFollowTheMoney(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildFollowTheMoneyPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', financialAngle: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Financial Angle', value: row.financialAngle, multiline: true, onChange: function (v) { setField(idx, 'financialAngle', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(ObjectListEditor, {
      label: 'Shell Accounts (optional)',
      value: state.shellAccounts,
      makeRow: function () { return { name: '', total: '', inference: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Name', value: row.name, onChange: function (v) { setField(idx, 'name', v); } }),
          React.createElement(TextField, { label: 'Total (number or text e.g. $1.2M)', value: row.total == null ? '' : String(row.total), onChange: function (v) { setField(idx, 'total', v); } }),
          React.createElement(TextField, { label: 'Inference', value: row.inference, multiline: true, onChange: function (v) { setField(idx, 'inference', v); } }),
          React.createElement(TextField, { label: 'Related Arc (optional)', value: row.relatedArc || '', onChange: function (v) { setField(idx, 'relatedArc', v); } })
        );
      },
      onChange: function (v) { setList('shellAccounts', v); }
    }),
    actionsRow(handleSave, onCancel)
  );
}

function ThePlayersEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initThePlayers(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildThePlayersPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', characterAngle: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Character Angle', value: row.characterAngle, multiline: true, onChange: function (v) { setField(idx, 'characterAngle', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(StringListEditor, { label: 'Exposed (optional)', value: state.exposed, placeholder: 'character name', onChange: function (v) { setList('exposed', v); } }),
    React.createElement(StringListEditor, { label: 'Buried (optional)', value: state.buried, placeholder: 'topic', onChange: function (v) { setList('buried', v); } }),
    React.createElement(KeyValueEditor, { label: 'Character Highlights (optional, name → note)', value: state.characterHighlights, onChange: function (v) { setList('characterHighlights', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function WhatsMissingEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initWhatsMissing(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildWhatsMissingPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Connections (required)',
      value: state.arcConnections,
      makeRow: function () { return { arcName: '', openQuestion: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Open Question', value: row.openQuestion, multiline: true, onChange: function (v) { setField(idx, 'openQuestion', v); } })
        );
      },
      onChange: function (v) { setList('arcConnections', v); }
    }),
    React.createElement(StringListEditor, { label: 'Known Unknowns (optional)', value: state.knownUnknowns, onChange: function (v) { setList('knownUnknowns', v); } }),
    React.createElement(TextField, { label: 'Narrative Purpose (optional)', value: state.narrativePurpose, multiline: true, onChange: function (v) { setList('narrativePurpose', v); } }),
    React.createElement(StringListEditor, { label: 'Buried Items (optional)', value: state.buriedItems, placeholder: 'token id', onChange: function (v) { setList('buriedItems', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function ClosingEditor({ closing, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initClosing(closing); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildClosingPayload(state, closing)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Arc Resolutions (required)',
      value: state.arcResolutions,
      makeRow: function () { return { arcName: '', resolution: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Arc Name', value: row.arcName, onChange: function (v) { setField(idx, 'arcName', v); } }),
          React.createElement(TextField, { label: 'Resolution', value: row.resolution, multiline: true, onChange: function (v) { setField(idx, 'resolution', v); } })
        );
      },
      onChange: function (v) { setList('arcResolutions', v); }
    }),
    React.createElement(TextField, { label: 'Systemic Angle (optional)', value: state.systemicAngle, multiline: true, onChange: function (v) { setList('systemicAngle', v); } }),
    React.createElement(TextField, { label: 'Final Line (optional)', value: state.finalLine, onChange: function (v) { setList('finalLine', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

// ═══════════════════════════════════════════════════════
// Detective editor components at module scope
// ═══════════════════════════════════════════════════════

function ExecutiveSummaryEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initExecutiveSummary(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildExecutiveSummaryPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Hook', value: state.hook, multiline: true, onChange: function (v) { set('hook', v); } }),
    React.createElement(TextField, { label: 'Case Overview', value: state.caseOverview, multiline: true, onChange: function (v) { set('caseOverview', v); } }),
    React.createElement(StringListEditor, { label: 'Primary Findings (required)', value: state.primaryFindings, onChange: function (v) { set('primaryFindings', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function EvidenceLockerEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initEvidenceLocker(section); });
  function setGroups(val) { setState(Object.assign({}, state, { evidenceGroups: val })); }
  function handleSave() { onSave(EditLogic.buildEvidenceLockerPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Evidence Groups (required)',
      value: state.evidenceGroups,
      makeRow: function () { return { theme: '', evidenceIds: [], synthesis: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Theme', value: row.theme, onChange: function (v) { setField(idx, 'theme', v); } }),
          React.createElement(StringListEditor, { label: 'Evidence IDs', value: Array.isArray(row.evidenceIds) ? row.evidenceIds : [], placeholder: 'token id', onChange: function (v) { setField(idx, 'evidenceIds', v); } }),
          React.createElement(TextField, { label: 'Synthesis', value: row.synthesis, multiline: true, onChange: function (v) { setField(idx, 'synthesis', v); } })
        );
      },
      onChange: setGroups
    }),
    actionsRow(handleSave, onCancel)
  );
}

function MemoryAnalysisEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initMemoryAnalysis(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildMemoryAnalysisPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Focus', value: state.focus, multiline: true, onChange: function (v) { set('focus', v); } }),
    React.createElement(StringListEditor, { label: 'Key Patterns (optional)', value: state.keyPatterns, onChange: function (v) { set('keyPatterns', v); } }),
    React.createElement(TextField, { label: 'Significance', value: state.significance, multiline: true, onChange: function (v) { set('significance', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function SuspectNetworkEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initSuspectNetwork(section); });
  function setList(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildSuspectNetworkPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(ObjectListEditor, {
      label: 'Assessments (required)',
      value: state.assessments,
      makeRow: function () { return { name: '', role: '', suspicionLevel: 'low' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(TextField, { label: 'Name', value: row.name, onChange: function (v) { setField(idx, 'name', v); } }),
          React.createElement(TextField, { label: 'Role', value: row.role, onChange: function (v) { setField(idx, 'role', v); } }),
          React.createElement(EnumSelect, { label: 'Suspicion Level (optional)', value: row.suspicionLevel, options: ['high', 'moderate', 'low'], includeBlank: true, onChange: function (v) { setField(idx, 'suspicionLevel', v); } })
        );
      },
      onChange: function (v) { setList('assessments', v); }
    }),
    React.createElement(ObjectListEditor, {
      label: 'Key Relationships (optional)',
      value: state.keyRelationships,
      makeRow: function () { return { characters: [], nature: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(StringListEditor, { label: 'Characters', value: Array.isArray(row.characters) ? row.characters : [], placeholder: 'character name', onChange: function (v) { setField(idx, 'characters', v); } }),
          React.createElement(TextField, { label: 'Nature', value: row.nature, multiline: true, onChange: function (v) { setField(idx, 'nature', v); } })
        );
      },
      onChange: function (v) { setList('keyRelationships', v); }
    }),
    actionsRow(handleSave, onCancel)
  );
}

function OutstandingQuestionsEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initOutstandingQuestions(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildOutstandingQuestionsPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(StringListEditor, { label: 'Questions (required)', value: state.questions, onChange: function (v) { set('questions', v); } }),
    React.createElement(TextField, { label: 'Investigative Gaps (optional)', value: state.investigativeGaps, multiline: true, onChange: function (v) { set('investigativeGaps', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function FinalAssessmentEditor({ section, onSave, onCancel }) {
  const [state, setState] = React.useState(function () { return EditLogic.initFinalAssessment(section); });
  function set(field, val) { setState(Object.assign({}, state, { [field]: val })); }
  function handleSave() { onSave(EditLogic.buildFinalAssessmentPayload(state, section)); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Verdict', value: state.verdict, multiline: true, onChange: function (v) { set('verdict', v); } }),
    React.createElement(TextField, { label: 'Closing Line', value: state.closingLine, onChange: function (v) { set('closingLine', v); } }),
    React.createElement(TextField, { label: 'Accusation Handling (optional)', value: state.accusationHandling, multiline: true, onChange: function (v) { set('accusationHandling', v); } }),
    actionsRow(handleSave, onCancel)
  );
}

function Outline({ data, onApprove, onReject, dispatch, revisionCache, theme, pendingEdits, pendingNote }) {
  const outline = (data && data.outline) || {};
  // H6: the outline gate rendered no evaluation at all, because
  // `data.evaluationHistory` is an append-only ARRAY mixing all three phases and
  // the old renderEvalBar read `.overallScore` (and `advisoryNotes`, not a field)
  // off it. Task 3 sends `lastEvaluation` pre-selected for 'outline';
  // lastEvaluationFrom keeps the array fallback for an older payload.
  const evaluation = ViewLogic.evaluationView(ViewLogic.lastEvaluationFrom(data, 'outline'));
  const previousOutline = (revisionCache && revisionCache.outline) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  // Detect theme from outline data if not passed via props
  const isDetective = theme === 'detective' || (!theme && outline.executiveSummary != null);

  // Edit state - mirrors Article.js
  const [editedOutline, setEditedOutline] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  // The stop's ONE note box (phase 1, brief 1.1). It is on screen in the view mode
  // and goes with whatever the director presses: with Approve it becomes a standing
  // note for every later writer, with Send back it is the rework's HUMAN FEEDBACK
  // and then stands. The name stays `feedbackText` — it is still what the server
  // reads as feedback on a send back.
  const [feedbackText, setFeedbackText] = React.useState('');
  // Send back takes two clicks (review fix round 1): this flag says the first one
  // happened. ViewLogic.sendBackButton decides what that means on screen.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);
  const [editError, setEditError] = React.useState('');

  // Reset state when data changes
  const dataKey = EditLogic.computeResetKey(outline, revisionCount);
  React.useEffect(function () {
    setEditedOutline(null);
    setEditingBlock(null);
    setHasEdits(false);
    setMode('view');
    setJsonText('');
    setJsonError('');
    setFeedbackText('');
    setSendBackArmed(false);
    setEditError('');
  }, [dataKey]);

  // Restore pending edits from cache
  React.useEffect(function () {
    if (pendingEdits && !editedOutline) {
      setEditedOutline(pendingEdits);
      setHasEdits(true);
    }
  }, [pendingEdits]);

  // Restore the note the same way, from its sibling slot: a processing error that
  // remounts this screen must not cost the director the sentence they just typed.
  React.useEffect(function () {
    if (typeof pendingNote === 'string' && pendingNote && !feedbackText) {
      setFeedbackText(pendingNote);
    }
  }, [pendingNote]);

  function getCurrentOutline() { return editedOutline || outline; }

  function ensureEditedOutline() {
    setEditError('');
    if (editedOutline) return editedOutline;
    const clone = JSON.parse(safeStringify(outline));
    setEditedOutline(clone);
    return clone;
  }

  function isEditing(type, key) {
    if (!editingBlock) return false;
    return editingBlock.type === type && editingBlock.key === key;
  }

  function cancelEdit() { setEditingBlock(null); }

  function saveSectionEdit(sectionKey, updatedSection) {
    const next = ensureEditedOutline();
    const clone = JSON.parse(safeStringify(next));
    clone[sectionKey] = updatedSection;
    setEditedOutline(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveTheStoryArc(arcIdx, updatedArc) {
    const next = ensureEditedOutline();
    setEditedOutline(EditLogic.mergeArc(next, arcIdx, updatedArc));
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveInterweaving(updatedInterweaving) {
    const next = ensureEditedOutline();
    setEditedOutline(EditLogic.mergeArcInterweaving(next, updatedInterweaving));
    setHasEdits(true);
    setEditingBlock(null);
  }

  function handleModeChange(newMode) {
    setSendBackArmed(false);
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'json') {
      setJsonText(safeStringify(getCurrentOutline(), 2));
      setJsonError('');
    }
  }

  /**
   * The ONE validation gate for pending hand edits (review fix 1, finding 2):
   * approve and reject validate identically, so they share one implementation and
   * cannot drift apart. Shaped like Article.js's gateEdits. On success it clears
   * the inline error; on failure it shows it and the caller sends nothing.
   *
   * `verb` names what the click would have done, so the reject path does not read
   * "Cannot approve" (review round 2, M13).
   */
  function gateEdits(candidate, setError, verb) {
    const themeForValidation = isDetective ? 'detective' : 'journalist';
    const result = EditLogic.validateOutlineShape(candidate, themeForValidation);
    if (result.valid) {
      setError('');
      return true;
    }
    setError('Cannot ' + (verb || 'approve') + ', edited outline is invalid: ' +
      result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
    return false;
  }

  function handleApprove() {
    setSendBackArmed(false);
    const note = feedbackText.trim();
    if (hasEdits && editedOutline) {
      if (!gateEdits(editedOutline, setEditError)) return;
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline, note: note });
      onApprove(ViewLogic.outlineReviewPayload(editedOutline, note, 'approve'));
    } else {
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', note: note });
      onApprove(ViewLogic.outlineReviewPayload(null, note, 'approve'));
    }
  }

  function handleJsonApprove() {
    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
      return;
    }
    const themeForValidation = isDetective ? 'detective' : 'journalist';
    const result = EditLogic.validateOutlineShape(parsed, themeForValidation);
    if (!result.valid) {
      setJsonError('Outline is invalid: ' +
        result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
      return;
    }
    setJsonError('');
    const note = feedbackText.trim();
    if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: parsed, note: note });
    onApprove(ViewLogic.outlineReviewPayload(parsed, note, 'approve'));
  }

  /**
   * The brake on the send back (review fix round 1). One box now serves both
   * actions, so Send back sits next to a note the director also fills in for an
   * approve; a mis-click costs a round and, at the article stop, about nine minutes
   * of Opus. The first click arms the button, the second sends. Editing the note,
   * pressing anything else in the action row, or a reset of the screen disarms it.
   */
  function handleSendBackClick() {
    if (!feedbackText.trim()) return;
    if (!sendBackArmed) {
      setSendBackArmed(true);
      return;
    }
    handleReject();
  }

  function handleReject() {
    const note = feedbackText.trim();
    if (!note) return;
    // Spec 2026-09-19 §4.6: hand edits travel with the note. Validated through the
    // SAME gate approve uses; an invalid edit is shown, not sent. The EDITED outline
    // is cached as the revision's previous version so the diff view compares the
    // rework against what the director actually sent.
    if (hasEdits && editedOutline) {
      if (!gateEdits(editedOutline, setEditError, 'send')) return;
      if (dispatch) {
        dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline, note: note });
        dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: editedOutline });
      }
      onReject(ViewLogic.outlineReviewPayload(editedOutline, note, 'send-back'));
      return;
    }
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', note: note });
      dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: outline });
    }
    onReject(ViewLogic.outlineReviewPayload(null, note, 'send-back'));
  }

  // ═══════════════════════════════════════════════════════
  // Journalist section renderers
  // ═══════════════════════════════════════════════════════

  // Thesis panel (spec 2026-09-19 §6.1). Journalist only. Its editing key is 'thesis',
  // never 'lede', so opening it does not flip the LEDE section into edit mode; its
  // original is the CURRENT lede (edited when edits are pending) so a thesis save after
  // a LEDE edit keeps that edit's evidence selection.
  function renderThesis(lede) {
    if (isDetective || !lede) return null;
    const editing = isEditing('section', 'thesis');
    const field = function (label, value) {
      return React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, label + ': '),
        typeof value === 'string' && value.trim() ? value : React.createElement('span', { className: 'text-muted' }, '(empty)')
      );
    };
    if (editing) {
      return React.createElement('div', { key: 'thesis', className: 'outline-section outline-section--editing outline-thesis' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THESIS'),
        React.createElement(ThesisEditor, { lede: lede, onSave: function (updated) { saveSectionEdit('lede', updated); }, onCancel: cancelEdit })
      );
    }
    return React.createElement('div', { key: 'thesis', className: EDITABLE + ' outline-thesis' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THESIS'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'thesis' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        field('Hook', lede.hook),
        field('Key tension', lede.keyTension),
        field('Primary arc', lede.primaryArc),
        React.createElement('p', { className: 'text-xs text-muted' }, 'Shown again at the article gate. The headline must serve this.')
      )
    );
  }

  function renderLede(lede) {
    if (!lede) return null;
    const editing = isEditing('section', 'lede');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
        React.createElement(LedeEditor, { lede: lede, onSave: function (updated) { saveSectionEdit('lede', updated); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'lede' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        lede.hook && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Hook: '),
          typeof lede.hook === 'string' ? lede.hook : safeStringify(lede.hook)
        ),
        lede.keyTension && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Key Tension: '),
          typeof lede.keyTension === 'string' ? lede.keyTension : safeStringify(lede.keyTension)
        ),
        lede.selectedEvidence && React.createElement('p', { className: 'text-xs text-muted' },
          'Evidence: ' + (Array.isArray(lede.selectedEvidence) ? lede.selectedEvidence.join(', ') : lede.selectedEvidence)
        )
      )
    );
  }

  function renderTheStory(theStory) {
    if (!theStory) return null;
    const arcs = theStory.arcs || [];
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'THE STORY'),
      React.createElement('div', { className: 'outline-section__content' },
        arcs.map(function (arc, i) {
          if (isEditing('theStoryArc', i)) {
            return React.createElement('div', { key: i, className: 'outline-section__arc outline-section__arc--editing mb-sm' },
              React.createElement(ArcOutlineEditor, {
                arc: arc,
                onSave: function (updated) { saveTheStoryArc(i, updated); },
                onCancel: cancelEdit
              })
            );
          }
          return React.createElement('div', { key: (arc.name || 'arc') + '-' + i, className: 'outline-section__arc ' + ALWAYS + ' mb-sm' },
            React.createElement('div', { className: 'flex items-center gap-sm' },
              React.createElement('p', { className: 'text-sm flex-1' },
                React.createElement('strong', null, arc.name || 'Arc ' + (i + 1)),
                arc.paragraphCount != null && React.createElement('span', { className: 'text-xs text-muted' }, ' (' + arc.paragraphCount + ' paragraphs)')
              ),
              editBtn(function () { setEditingBlock({ type: 'theStoryArc', key: i }); })
            ),
            arc.evidenceCards && React.createElement('div', { className: 'tag-list mt-sm' },
              (Array.isArray(arc.evidenceCards) ? arc.evidenceCards : [arc.evidenceCards]).map(function (card, j) {
                return React.createElement(Badge, { key: 'ec-' + j, label: typeof card === 'string' ? card : (card.id || card.title || 'Card ' + (j + 1)), color: 'var(--accent-amber)' });
              })
            ),
            photoPlacementLine(arc.photoPlacement) && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
              'Photo: ' + photoPlacementLine(arc.photoPlacement)
            )
          );
        }),
        // Arc interweaving - edit affordance
        isEditing('theStoryInterweaving', 'interweaving')
          ? React.createElement(ArcInterweavingEditor, {
              interweaving: theStory.arcInterweaving,
              onSave: function (u) { saveInterweaving(u); },
              onCancel: cancelEdit
            })
          : React.createElement('div', { className: 'flex items-center gap-sm mt-sm ' + ALWAYS },
              React.createElement('div', { className: 'outline-section__content flex-1' },
                React.createElement('p', { className: 'text-xs text-muted' }, 'Interleaving Plan:'),
                React.createElement('p', null, (theStory.arcInterweaving && theStory.arcInterweaving.interleavingPlan) || ''),
                React.createElement('p', { className: 'text-xs text-muted' }, 'Convergence Point:'),
                React.createElement('p', null, (theStory.arcInterweaving && theStory.arcInterweaving.convergencePoint) || '')
              ),
              editBtn(function () { setEditingBlock({ type: 'theStoryInterweaving', key: 'interweaving' }); })
            )
      )
    );
  }

  function renderFollowTheMoney(section) {
    if (!section) return null;
    const editing = isEditing('section', 'followTheMoney');
    return React.createElement('div', { key: 'followTheMoney', className: EDITABLE + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'FOLLOW THE MONEY'),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'followTheMoney' }); })
      ),
      editing
        ? React.createElement(FollowTheMoneyEditor, { section: section, onSave: function (u) { saveSectionEdit('followTheMoney', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            arcConnectionList(section.arcConnections, 'financialAngle'),
            (section.shellAccounts || []).length > 0 && React.createElement('ul', { className: 'outline-section__list' },
              section.shellAccounts.map(function (account, i) {
                return React.createElement('li', { key: 'sa-' + i, className: 'text-sm' },
                  React.createElement('strong', null, account.name || '(unnamed account)'),
                  account.total != null && account.total !== '' && React.createElement('span', { className: 'text-secondary' }, ' · ' + account.total),
                  account.relatedArc && React.createElement('span', { className: 'text-xs text-muted' }, ' · ' + account.relatedArc),
                  account.inference && React.createElement('p', { className: 'text-sm text-secondary' }, account.inference)
                );
              })
            ),
            photoPlacementLine(section.photoPlacement) && React.createElement('p', { className: 'text-xs text-muted' },
              'Photo: ' + photoPlacementLine(section.photoPlacement)
            ),
            emptyNote(section.arcConnections, section.shellAccounts)
          )
    );
  }

  function renderThePlayers(section) {
    if (!section) return null;
    const editing = isEditing('section', 'thePlayers');
    return React.createElement('div', { key: 'thePlayers', className: EDITABLE + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THE PLAYERS'),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'thePlayers' }); })
      ),
      editing
        ? React.createElement(ThePlayersEditor, { section: section, onSave: function (u) { saveSectionEdit('thePlayers', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            arcConnectionList(section.arcConnections, 'characterAngle'),
            characterHighlightList(section.characterHighlights),
            nameRow('Exposed', section.exposed, 'var(--layer-exposed)'),
            nameRow('Buried', section.buried, 'var(--layer-buried)'),
            emptyNote(section.arcConnections, section.exposed, section.buried,
              EditLogic.mapToRows(section.characterHighlights))
          )
    );
  }

  function renderWhatsMissing(section) {
    if (!section) return null;
    const editing = isEditing('section', 'whatsMissing');
    return React.createElement('div', { key: 'whatsMissing', className: EDITABLE + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, "WHAT'S MISSING"),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'whatsMissing' }); })
      ),
      editing
        ? React.createElement(WhatsMissingEditor, { section: section, onSave: function (u) { saveSectionEdit('whatsMissing', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            arcConnectionList(section.arcConnections, 'openQuestion'),
            (section.knownUnknowns || []).length > 0 && React.createElement('ul', { className: 'outline-section__list' },
              section.knownUnknowns.map(function (q, i) {
                return React.createElement('li', { key: 'ku-' + i, className: 'text-sm' }, q);
              })
            ),
            section.narrativePurpose && React.createElement('p', { className: 'text-sm text-secondary' },
              React.createElement('strong', null, 'Narrative purpose: '),
              section.narrativePurpose
            ),
            nameRow('Buried items', section.buriedItems, 'var(--layer-buried)'),
            emptyNote(section.arcConnections, section.knownUnknowns, section.buriedItems)
          )
    );
  }

  function renderClosing(closing) {
    if (!closing) return null;
    const editing = isEditing('section', 'closing');
    // `arcResolutions` is [{arcName, resolution}] (outline.schema.json); `theme`
    // is the older free-text form. safeStringify printed the array as raw JSON.
    const resolutionRows = Array.isArray(closing.arcResolutions) ? closing.arcResolutions : null;
    const resolutionText = !resolutionRows && typeof closing.theme === 'string' ? closing.theme : '';

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        React.createElement(ClosingEditor, { closing: closing, onSave: function (u) { saveSectionEdit('closing', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'closing' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        resolutionRows && resolutionRows.length > 0 && React.createElement('div', { className: 'mb-sm' },
          React.createElement('p', { className: 'text-sm' },
            React.createElement('strong', null, 'Resolutions')
          ),
          arcConnectionList(resolutionRows, 'resolution')
        ),
        resolutionText && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Resolutions: '),
          resolutionText
        ),
        closing.systemicAngle && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Systemic Angle: '),
          typeof closing.systemicAngle === 'string' ? closing.systemicAngle : safeStringify(closing.systemicAngle)
        ),
        closing.finalLine && React.createElement('p', { className: 'text-sm text-secondary text-italic' },
          typeof closing.finalLine === 'string' ? closing.finalLine : safeStringify(closing.finalLine)
        )
      )
    );
  }

  // ═══════════════════════════════════════════════════════
  // Detective section renderers
  // ═══════════════════════════════════════════════════════

  function renderExecutiveSummary(section) {
    if (!section) return null;
    const editing = isEditing('section', 'executiveSummary');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'EXECUTIVE SUMMARY'),
        React.createElement(ExecutiveSummaryEditor, { section: section, onSave: function (u) { saveSectionEdit('executiveSummary', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'EXECUTIVE SUMMARY'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'executiveSummary' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        section.hook && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Hook: '),
          typeof section.hook === 'string' ? section.hook : safeStringify(section.hook)
        ),
        section.caseOverview && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Case Overview: '),
          typeof section.caseOverview === 'string' ? section.caseOverview : safeStringify(section.caseOverview)
        ),
        section.primaryFindings && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          (Array.isArray(section.primaryFindings) ? section.primaryFindings : [section.primaryFindings]).map(function (finding, i) {
            return React.createElement('li', { key: 'finding-' + i },
              typeof finding === 'string' ? finding : safeStringify(finding)
            );
          })
        )
      )
    );
  }

  function renderEvidenceLocker(section) {
    if (!section) return null;
    const editing = isEditing('section', 'evidenceLocker');
    const groups = section.evidenceGroups || [];

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE LOCKER'),
        React.createElement(EvidenceLockerEditor, { section: section, onSave: function (u) { saveSectionEdit('evidenceLocker', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE LOCKER'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'evidenceLocker' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        groups.map(function (group, i) {
          return React.createElement('div', {
            key: 'eg-' + i,
            className: 'outline-section__arc mb-sm'
          },
            React.createElement('p', { className: 'text-sm' },
              React.createElement('strong', null, group.theme || 'Evidence Group ' + (i + 1))
            ),
            group.synthesis && React.createElement('p', { className: 'text-xs text-secondary mb-sm' },
              typeof group.synthesis === 'string' ? group.synthesis : safeStringify(group.synthesis)
            ),
            group.evidenceIds && React.createElement('div', { className: 'tag-list mt-sm' },
              (Array.isArray(group.evidenceIds) ? group.evidenceIds : [group.evidenceIds]).map(function (id, j) {
                return React.createElement(Badge, {
                  key: 'eid-' + j,
                  label: typeof id === 'string' ? id : safeStringify(id),
                  color: 'var(--accent-amber)'
                });
              })
            )
          );
        })
      )
    );
  }

  function renderMemoryAnalysis(section) {
    if (!section) return null;
    const editing = isEditing('section', 'memoryAnalysis');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'MEMORY ANALYSIS'),
        React.createElement(MemoryAnalysisEditor, { section: section, onSave: function (u) { saveSectionEdit('memoryAnalysis', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'MEMORY ANALYSIS'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'memoryAnalysis' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        section.focus && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Focus: '),
          typeof section.focus === 'string' ? section.focus : safeStringify(section.focus)
        ),
        section.keyPatterns && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          (Array.isArray(section.keyPatterns) ? section.keyPatterns : [section.keyPatterns]).map(function (pattern, i) {
            return React.createElement('li', { key: 'mp-' + i },
              typeof pattern === 'string' ? pattern : safeStringify(pattern)
            );
          })
        ),
        section.significance && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
          React.createElement('strong', null, 'Significance: '),
          typeof section.significance === 'string' ? section.significance : safeStringify(section.significance)
        )
      )
    );
  }

  function renderSuspectNetwork(section) {
    if (!section) return null;
    const editing = isEditing('section', 'suspectNetwork');
    const relationships = section.keyRelationships || [];
    const assessments = section.assessments || [];

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'SUSPECT NETWORK'),
        React.createElement(SuspectNetworkEditor, { section: section, onSave: function (u) { saveSectionEdit('suspectNetwork', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'SUSPECT NETWORK'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'suspectNetwork' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        relationships.length > 0 && React.createElement('div', { className: 'mb-sm' },
          React.createElement('strong', { className: 'text-sm' }, 'Key Relationships:'),
          React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
            relationships.map(function (rel, i) {
              const chars = Array.isArray(rel.characters) ? rel.characters.join(' \u2194 ') : safeStringify(rel.characters);
              return React.createElement('li', { key: 'rel-' + i },
                chars + (rel.nature ? ' \u2014 ' + rel.nature : '')
              );
            })
          )
        ),
        assessments.length > 0 && React.createElement('div', null,
          React.createElement('strong', { className: 'text-sm' }, 'Suspect Assessments:'),
          React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
            assessments.map(function (a, i) {
              return React.createElement('li', { key: 'assess-' + i },
                React.createElement('strong', null, a.name || 'Unknown'),
                ' \u2014 ' + (a.role || 'Role unknown'),
                a.suspicionLevel && React.createElement(Badge, {
                  label: a.suspicionLevel,
                  color: a.suspicionLevel === 'high' ? 'var(--accent-red)' :
                         a.suspicionLevel === 'moderate' ? 'var(--accent-amber)' :
                         'var(--accent-teal)'
                })
              );
            })
          )
        )
      )
    );
  }

  function renderOutstandingQuestions(section) {
    if (!section) return null;
    const editing = isEditing('section', 'outstandingQuestions');
    const questions = section.questions || [];

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'OUTSTANDING QUESTIONS'),
        React.createElement(OutstandingQuestionsEditor, { section: section, onSave: function (u) { saveSectionEdit('outstandingQuestions', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'OUTSTANDING QUESTIONS'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'outstandingQuestions' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        questions.length > 0 && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          questions.map(function (q, i) {
            return React.createElement('li', { key: 'oq-' + i },
              typeof q === 'string' ? q : safeStringify(q)
            );
          })
        ),
        section.investigativeGaps && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
          React.createElement('strong', null, 'Investigative Gaps: '),
          typeof section.investigativeGaps === 'string' ? section.investigativeGaps : safeStringify(section.investigativeGaps)
        )
      )
    );
  }

  function renderFinalAssessment(section) {
    if (!section) return null;
    const editing = isEditing('section', 'finalAssessment');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'FINAL ASSESSMENT'),
        React.createElement(FinalAssessmentEditor, { section: section, onSave: function (u) { saveSectionEdit('finalAssessment', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: EDITABLE },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'FINAL ASSESSMENT'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'finalAssessment' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        section.accusationHandling && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Accusation: '),
          typeof section.accusationHandling === 'string' ? section.accusationHandling : safeStringify(section.accusationHandling)
        ),
        section.verdict && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Verdict: '),
          typeof section.verdict === 'string' ? section.verdict : safeStringify(section.verdict)
        ),
        section.closingLine && React.createElement('p', { className: 'text-sm text-secondary text-italic' },
          typeof section.closingLine === 'string' ? section.closingLine : safeStringify(section.closingLine)
        )
      )
    );
  }



  // ═══════════════════════════════════════════════════════
  // Render outline sections based on theme
  // ═══════════════════════════════════════════════════════

  function renderOutlineSections() {
    const current = getCurrentOutline();
    if (isDetective) {
      return [
        renderExecutiveSummary(current.executiveSummary),
        renderEvidenceLocker(current.evidenceLocker),
        renderMemoryAnalysis(current.memoryAnalysis),
        renderSuspectNetwork(current.suspectNetwork),
        renderOutstandingQuestions(current.outstandingQuestions),
        renderFinalAssessment(current.finalAssessment)
      ];
    }
    // Journalist (default)
    return [
      renderThesis(current.lede),
      renderLede(current.lede),
      renderTheStory(current.theStory),
      renderFollowTheMoney(current.followTheMoney),
      renderThePlayers(current.thePlayers),
      renderWhatsMissing(current.whatsMissing),
      renderClosing(current.closing)
    ];
  }

  const sendBack = ViewLogic.sendBackButton(sendBackArmed, feedbackText, 'outline');

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousOutline,
      current: outline,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: 0,
      maxHumanRevisions: 0,
      handEditReport: (data && data.handEditReport) || null,
      gateNotes: (data && data.directorGateNotes) || []
    }),

    // Evaluation bar (what Opus said about THIS outline)
    React.createElement(EvalBar, { view: evaluation }),

    // Outline sections (theme-aware)
    ...renderOutlineSections(),

    // Inline validation error (shown when approve is blocked)
    editError && React.createElement('p', { className: 'validation-error', role: 'alert' }, editError),

    // The stop's ONE note box (phase 1, brief 1.1), always on screen and above the
    // actions, because it is sent with whichever action the director takes. It used
    // to live behind the Reject button, which is why a note the director had ready
    // at an approve could only reach the writer through a paid rework.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'outline-note' },
        'Note to the writer, sent with whichever button you press'),
      React.createElement('p', { className: 'text-xs text-muted' },
        'With Approve it stands for every later writer. With Send back it drives the rework, and then stands. Send back needs one.'),
      hasEdits && React.createElement('p', { className: 'text-xs text-muted', role: 'status' },
        'Your hand edits are sent with this note. The writer is told to keep them.'),
      React.createElement('textarea', {
        id: 'outline-note',
        className: 'input feedback-area',
        value: feedbackText,
        onChange: function (e) { setFeedbackText(e.target.value); setSendBackArmed(false); },
        rows: 4,
        placeholder: 'What should the writer do differently, or keep?',
        'aria-label': 'Note to the writer, sent with approve or send back'
      })
    ),

    // Action mode buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        'aria-label': 'Approve the outline, sending the note with it'
      }, 'Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'json' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('json'); },
        'aria-label': 'Edit outline before approving'
      }, 'Edit & Approve'),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        onClick: handleSendBackClick,
        disabled: sendBack.disabled,
        'aria-label': sendBack.ariaLabel
      }, sendBack.label)
    ),

    // JSON edit mode
    mode === 'json' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Edit Outline JSON'),
      React.createElement('textarea', {
        className: 'input input-mono edit-area',
        value: jsonText,
        onChange: function (e) { setJsonText(e.target.value); setJsonError(''); },
        rows: 20,
        'aria-label': 'Edit outline JSON'
      }),
      jsonError && React.createElement('p', { className: 'validation-error' }, jsonError),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleJsonApprove,
        'aria-label': 'Save edits and approve'
      }, 'Save & Approve')
    )
  );
}

window.Console.checkpoints.Outline = Outline;
