/**
 * Outline Checkpoint Component
 * Displays article outline with structured sections.
 * Journalist: LEDE, THE STORY, FOLLOW THE MONEY, THE PLAYERS, WHAT'S MISSING, CLOSING
 * Detective: EXECUTIVE SUMMARY, EVIDENCE LOCKER, MEMORY ANALYSIS, SUSPECT NETWORK,
 *            OUTSTANDING QUESTIONS, FINAL ASSESSMENT
 * Supports approve, edit-and-approve, and reject with revision loop.
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, safeStringify, editBtn } = window.Console.utils;
const { RevisionDiff } = window.Console;
const EditLogic = window.Console.outlineEditLogic;

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

function ObjectEditor(props) {
  const obj = props.value || {};
  const renderFields = props.renderFields; // (obj, setField) => ReactElement
  const onChange = props.onChange;
  function setField(field, val) {
    const next = Object.assign({}, obj);
    next[field] = val;
    onChange(next);
  }
  return React.createElement('div', { className: 'flex flex-col gap-sm mb-sm' }, renderFields(obj, setField));
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
    React.createElement(ObjectListEditor, {
      label: 'Pull Quotes (optional)',
      value: state.pullQuotes,
      makeRow: function () { return { type: 'verbatim', text: '', attribution: '' }; },
      renderRow: function (row, idx, setField) {
        return React.createElement('div', { className: 'flex flex-col gap-sm' },
          React.createElement(EnumSelect, { label: 'Type', value: row.type || 'verbatim', options: ['verbatim', 'insight', 'crystallization'], onChange: function (v) { setField(idx, 'type', v); } }),
          React.createElement(TextField, { label: 'Text', value: row.text, multiline: true, onChange: function (v) { setField(idx, 'text', v); } }),
          React.createElement(TextField, { label: 'Attribution (optional)', value: row.attribution == null ? '' : row.attribution, onChange: function (v) { setField(idx, 'attribution', v); } }),
          React.createElement(TextField, { label: 'Advances Arc (optional)', value: row.advancesArc || '', onChange: function (v) { setField(idx, 'advancesArc', v); } })
        );
      },
      onChange: function (v) { setList('pullQuotes', v); }
    }),
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

function Outline({ data, onApprove, onReject, dispatch, revisionCache, theme, pendingEdits }) {
  const outline = (data && data.outline) || {};
  const evaluationHistory = (data && data.evaluationHistory) || {};
  const previousOutline = (revisionCache && revisionCache.outline) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  // Detect theme from outline data if not passed via props
  const isDetective = theme === 'detective' || (!theme && outline.executiveSummary != null);

  // Edit state — mirrors Article.js
  const [editedOutline, setEditedOutline] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json' | 'reject'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');

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
  }, [dataKey]);

  // Restore pending edits from cache
  React.useEffect(function () {
    if (pendingEdits && !editedOutline) {
      setEditedOutline(pendingEdits);
      setHasEdits(true);
    }
  }, [pendingEdits]);

  function getCurrentOutline() { return editedOutline || outline; }

  function ensureEditedOutline() {
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
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'json') {
      setJsonText(safeStringify(getCurrentOutline(), 2));
      setJsonError('');
    }
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleApprove() {
    if (hasEdits && editedOutline) {
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline });
      onApprove({ outline: true, outlineEdits: editedOutline });
    } else {
      onApprove({ outline: true });
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
    setJsonError('');
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: parsed });
    }
    onApprove({ outline: true, outlineEdits: parsed });
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    // Cache current outline for diff on next revision
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: outline });
    }
    onReject({ outline: false, outlineFeedback: feedbackText.trim() });
  }

  // ═══════════════════════════════════════════════════════
  // Journalist section renderers
  // ═══════════════════════════════════════════════════════

  function renderLede(lede) {
    if (!lede) return null;
    const editing = isEditing('section', 'lede');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
        React.createElement(LedeEditor, { lede: lede, onSave: function (updated) { saveSectionEdit('lede', updated); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: 'outline-section' },
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
          return React.createElement('div', { key: (arc.name || 'arc') + '-' + i, className: 'outline-section__arc mb-sm' },
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
            arc.photoPlacement && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
              'Photo: ' + (typeof arc.photoPlacement === 'string' ? arc.photoPlacement : safeStringify(arc.photoPlacement))
            )
          );
        }),
        // Arc interweaving — edit affordance
        isEditing('theStoryInterweaving', 'interweaving')
          ? React.createElement(ArcInterweavingEditor, {
              interweaving: theStory.arcInterweaving,
              onSave: function (u) { saveInterweaving(u); },
              onCancel: cancelEdit
            })
          : React.createElement('div', { className: 'flex items-center gap-sm mt-sm' },
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
    return React.createElement('div', { key: 'followTheMoney', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'FOLLOW THE MONEY'),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'followTheMoney' }); })
      ),
      editing
        ? React.createElement(FollowTheMoneyEditor, { section: section, onSave: function (u) { saveSectionEdit('followTheMoney', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' arc connection(s), ' + ((section.shellAccounts || []).length) + ' shell account(s)'))
    );
  }

  function renderThePlayers(section) {
    if (!section) return null;
    const editing = isEditing('section', 'thePlayers');
    return React.createElement('div', { key: 'thePlayers', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'THE PLAYERS'),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'thePlayers' }); })
      ),
      editing
        ? React.createElement(ThePlayersEditor, { section: section, onSave: function (u) { saveSectionEdit('thePlayers', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' arc connection(s), ' + ((section.pullQuotes || []).length) + ' pull quote(s)'))
    );
  }

  function renderWhatsMissing(section) {
    if (!section) return null;
    const editing = isEditing('section', 'whatsMissing');
    return React.createElement('div', { key: 'whatsMissing', className: 'outline-section' + (editing ? ' outline-section--editing' : '') },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, "WHAT'S MISSING"),
        !editing && editBtn(function () { setEditingBlock({ type: 'section', key: 'whatsMissing' }); })
      ),
      editing
        ? React.createElement(WhatsMissingEditor, { section: section, onSave: function (u) { saveSectionEdit('whatsMissing', u); }, onCancel: cancelEdit })
        : React.createElement('div', { className: 'outline-section__content' },
            React.createElement('p', { className: 'text-xs text-muted' }, (section.arcConnections || []).length + ' open question(s)'))
    );
  }

  function renderClosing(closing) {
    if (!closing) return null;
    const editing = isEditing('section', 'closing');
    const resolutions = closing.arcResolutions || closing.theme || null;

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        React.createElement(ClosingEditor, { closing: closing, onSave: function (u) { saveSectionEdit('closing', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: 'outline-section' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'closing' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        resolutions && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Resolutions: '),
          typeof resolutions === 'string' ? resolutions : safeStringify(resolutions)
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

    return React.createElement('div', { className: 'outline-section' },
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

    return React.createElement('div', { className: 'outline-section' },
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

    return React.createElement('div', { className: 'outline-section' },
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

    return React.createElement('div', { className: 'outline-section' },
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

    return React.createElement('div', { className: 'outline-section' },
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

    return React.createElement('div', { className: 'outline-section' },
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
  // Evaluation bar (shared)
  // ═══════════════════════════════════════════════════════

  function renderEvalBar() {
    const score = evaluationHistory.overallScore;
    const issues = evaluationHistory.structuralIssues;
    const advisory = evaluationHistory.advisoryNotes;
    if (score == null && issues == null && advisory == null) return null;

    return React.createElement('div', { className: 'eval-bar mb-md' },
      score != null && React.createElement('span', { className: 'eval-bar__score' },
        'Score: ' + score + '/10'
      ),
      issues != null && React.createElement('span', { className: 'eval-bar__issues' },
        issues + ' structural issue' + (issues !== 1 ? 's' : '')
      ),
      advisory != null && React.createElement('span', { className: 'text-xs text-muted' },
        Array.isArray(advisory) ? advisory.length + ' advisory note' + (advisory.length !== 1 ? 's' : '') : advisory
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
      renderLede(current.lede),
      renderTheStory(current.theStory),
      renderFollowTheMoney(current.followTheMoney),
      renderThePlayers(current.thePlayers),
      renderWhatsMissing(current.whatsMissing),
      renderClosing(current.closing)
    ];
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousOutline,
      current: outline,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: 0,
      maxHumanRevisions: 0
    }),

    // Evaluation bar
    renderEvalBar(),

    // Outline sections (theme-aware)
    ...renderOutlineSections(),

    // Action mode buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        'aria-label': 'Approve outline'
      }, 'Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'json' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('json'); },
        'aria-label': 'Edit outline before approving'
      }, 'Edit & Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject outline with feedback'
      }, 'Reject')
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
    ),

    // Reject mode
    mode === 'reject' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Feedback for revision'),
      React.createElement('textarea', {
        className: 'input feedback-area',
        value: feedbackText,
        onChange: function (e) { setFeedbackText(e.target.value); },
        rows: 4,
        placeholder: 'Describe what needs to change...',
        'aria-label': 'Rejection feedback for outline'
      }),
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: handleReject,
        disabled: !feedbackText.trim(),
        'aria-label': 'Submit rejection with feedback'
      }, 'Submit Rejection')
    )
  );
}

window.Console.checkpoints.Outline = Outline;
