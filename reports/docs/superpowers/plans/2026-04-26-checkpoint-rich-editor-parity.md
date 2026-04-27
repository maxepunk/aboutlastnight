# Checkpoint Rich-Editor Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Outline and ArcSelection checkpoints to UX parity with Article — per-field/per-section inline editors with pencil-icon affordances, replacing Outline's raw JSON textarea and ArcSelection's no-edit gap.

**Architecture:** Two independent phases that ship separately. Phase 1 (Outline) requires no server changes — `outlineEdits` already lands in `state.outline` via `buildResumePayload` at server.js:202. Phase 2 (Arcs) needs new server-side wiring for an `arcEdits` field that maps to `state.narrativeArcs`. Both UIs follow Article.js's proven pattern: `editedBundle` working-copy state + `editingBlock` discriminated union + `hasEdits` dirty flag + lazy-clone via `ensureEditedBundle()` + `pendingEdits` recovery on processing-error remount.

**Tech Stack:** React 18 via Babel-standalone CDN (zero build); `window.Console.checkpoints.*` namespacing; existing CSS classes `.article-block__edit-form`, `.article-block__edit-btn` reused; Jest for server-side `buildResumePayload` coverage; manual UI verification (no UI test harness exists in repo and adding one would conflict with the zero-deps architecture).

---

## Shared Design (read once, applies to both phases)

**The Article.js editing pattern, distilled** (`console/components/checkpoints/Article.js:610-752`):

```javascript
// State
const [editedBundle, setEditedBundle] = React.useState(null);
const [editingBlock, setEditingBlock] = React.useState(null);  // discriminated union
const [hasEdits, setHasEdits] = React.useState(false);

// Reset on data change
const dataKey = safeStringify(originalData).slice(0, 100);
React.useEffect(() => {
  setEditedBundle(null);
  setEditingBlock(null);
  setHasEdits(false);
  // ... reset other modes too
}, [dataKey]);

// Restore from pendingEdits on error-remount (preserves user work)
React.useEffect(() => {
  if (pendingEdits && !editedBundle) {
    setEditedBundle(pendingEdits);
    setHasEdits(true);
  }
}, [pendingEdits]);

// Lazy-clone helper — never mutate original
function ensureEditedBundle() {
  if (editedBundle) return editedBundle;
  const clone = JSON.parse(safeStringify(originalData));
  setEditedBundle(clone);
  return clone;
}

// Discriminator helpers
function startSectionEdit(sectionKey) { setEditingBlock({ type: 'section', key: sectionKey }); }
function isEditing(type, key) {
  if (!editingBlock) return false;
  return editingBlock.type === type && editingBlock.key === key;
}
function cancelEdit() { setEditingBlock(null); }

// Save by deep-cloning, mutating clone, replacing state
function saveSectionEdit(sectionKey, updatedSection) {
  const bundle = ensureEditedBundle();
  const clone = JSON.parse(safeStringify(bundle));
  clone[sectionKey] = updatedSection;
  setEditedBundle(clone);
  setHasEdits(true);
  setEditingBlock(null);
}

// Approve sends edits if dirty
function handleApprove() {
  if (hasEdits && editedBundle) {
    if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', edits: editedBundle });
    onApprove({ outline: true, outlineEdits: editedBundle });  // or arcEdits
  } else {
    onApprove({ outline: true });
  }
}
```

**The pencil-icon button helper** (already defined in Article.js:810-816, will be lifted to shared utility):

```javascript
function editBtn(onClick) {
  return React.createElement('button', {
    className: 'article-block__edit-btn',
    onClick: function (e) { e.stopPropagation(); onClick(); },
    'aria-label': 'Edit',
    title: 'Edit'
  }, '✎');  // ✎ pencil
}
```

**An inline edit-form pattern** (one `<textarea>` or `<input>` per editable field, with Save/Cancel):

```javascript
function renderTextEditForm(value, onSave, multiline) {
  const [text, setText] = React.useState(value || '');
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(multiline ? 'textarea' : 'input', {
      className: 'input',
      value: text,
      onChange: e => setText(e.target.value),
      rows: multiline ? 4 : undefined,
      autoFocus: true
    }),
    React.createElement('div', { className: 'edit-form__actions' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: () => onSave(text) }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: cancelEdit }, 'Cancel')
    )
  );
}
```

**Lift `editBtn` to a shared util** so all three checkpoints use it (instead of redefining in each):

- File: `console/utils.js`
- Add to `window.Console.utils.editBtn`
- Article.js, Outline.js, ArcSelection.js all import via destructuring

**Reset-on-data-change discipline:** the `dataKey` effect must reset *every* edit-related state field. A common bug is forgetting one (e.g., `jsonError`), which leaks into the next session.

**Pendingedits dispatch:** the `SAVE_PENDING_EDITS` action already exists in `state.js` for Article — Outline and ArcSelection must use **different keys** in `state.pendingEdits` to avoid collision. Suggest reducer change: `pendingEdits` becomes `{ article: ..., outline: ..., arcs: ... }` keyed by checkpoint type. Plan covers this in Phase 1, Task 1.

**No UI test harness exists.** All UI changes verified manually with the manual test plan at the end of each phase. Server-side changes (Phase 2's `arcEdits` plumbing) get TDD via `__tests__/integration/api.test.js` and a new `buildResumePayload` unit test.

---

## Phase 1: Outline Rich Editor

**Scope:** Replace the JSON textarea in Outline.js with per-section inline editors. Cover both journalist (LEDE, THE STORY, FOLLOW THE MONEY, THE PLAYERS, WHAT'S MISSING, CLOSING, PULL QUOTES) and detective (EXECUTIVE SUMMARY, EVIDENCE LOCKER, MEMORY ANALYSIS, SUSPECT NETWORK, OUTSTANDING QUESTIONS, FINAL ASSESSMENT) layouts. Server side already accepts `outlineEdits` (server.js:202–204) — no changes needed.

**Outline data shape (journalist)** — confirmed against `console/components/checkpoints/Outline.js:85-218`:

```typescript
{
  lede: { hook: string, keyTension: string, selectedEvidence: string[] },
  theStory: {
    arcs: Array<{ name, paragraphCount, keyPoints: string[], evidenceCards: Array<string|{id,title}>, photoPlacement: string }>,
    arcInterweaving: string
  },
  followTheMoney: { focus|arcConnections: string, shellAccounts: string[], characterHighlights: string, buriedItems: string[] },
  thePlayers:     { focus|arcConnections, shellAccounts, characterHighlights, buriedItems },
  whatsMissing:   { focus|arcConnections, shellAccounts, characterHighlights, buriedItems },
  closing: { arcResolutions|theme: string, systemicAngle: string, finalLine: string },
  pullQuotes: Array<{ text: string, attribution: string, placement: string }>
}
```

**Outline data shape (detective)** — confirmed against `Outline.js:224-396`:

```typescript
{
  executiveSummary: { hook, caseOverview, primaryFindings: string[] },
  evidenceLocker: { evidenceGroups: Array<{ theme, synthesis, evidenceIds: string[] }> },
  memoryAnalysis: { focus, keyPatterns: string[], significance },
  suspectNetwork: {
    keyRelationships: Array<{ characters: string[], nature: string }>,
    assessments: Array<{ name, role, suspicionLevel: 'low'|'moderate'|'high' }>
  },
  outstandingQuestions: { questions: string[], investigativeGaps: string },
  finalAssessment: { accusationHandling, verdict, closingLine }
}
```

**File responsibilities for Phase 1:**

- `console/utils.js` — add shared `editBtn` and `renderTextEditForm` helpers; bump exports
- `console/state.js` — namespace `pendingEdits` by checkpoint type (object vs single field)
- `console/app.js` — pass `pendingEdits.outline` into `<Outline>` props (currently passes `pendingEdits` only to Article)
- `console/components/checkpoints/Outline.js` — full rewrite of mode/state/render path; sectional inline editors replace JSON textarea
- `console/console.css` — add `.outline-section--editing`, `.outline-section__edit-row` if not already covered by Article's classes (most can reuse)
- `__tests__/integration/api.test.js` — add coverage for `outlineEdits` payload (currently uncovered)

---

### Task 1.1: Namespace `pendingEdits` by checkpoint type

**Why first:** Article currently uses `state.pendingEdits` as a single field. If we add Outline + Arcs without namespacing, edits would collide on remount. This refactor is small but must happen before any new edit UI consumes `pendingEdits`.

**Files:**
- Modify: `console/state.js` — find `SAVE_PENDING_EDITS` reducer
- Modify: `console/app.js` — find `<Article>` render site; update prop passed
- Modify: `console/components/checkpoints/Article.js:636-640` — read from `pendingEdits.article` instead of `pendingEdits`

- [ ] **Step 1: Read current `pendingEdits` usage**

```bash
grep -n "pendingEdits\|SAVE_PENDING_EDITS" console/state.js console/app.js console/components/checkpoints/Article.js
```
Note every reader/writer site.

- [ ] **Step 2: Update reducer in `console/state.js`**

Find the `SAVE_PENDING_EDITS` action handler. Change shape:

```javascript
// Before
case 'SAVE_PENDING_EDITS':
  return { ...state, pendingEdits: action.edits };

// After
case 'SAVE_PENDING_EDITS':
  return {
    ...state,
    pendingEdits: {
      ...state.pendingEdits,
      [action.checkpoint]: action.edits
    }
  };
```

And update `initialState.pendingEdits` from `null` to `{}`.

Add a corresponding `RESET_PENDING_EDITS` (or extend `RESET_SESSION`) that clears the whole `pendingEdits` object.

- [ ] **Step 3: Update Article.js to use namespaced key**

In `Article.js`, find the dispatch site at line ~760:

```javascript
// Before
dispatch({ type: 'SAVE_PENDING_EDITS', edits: editedBundle });

// After
dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: editedBundle });
```

And update the prop read at lines 636-640:

```javascript
// Before
React.useEffect(function () {
  if (pendingEdits && !editedBundle) {
    setEditedBundle(pendingEdits);
    setHasEdits(true);
  }
}, [pendingEdits]);

// After (same logic — caller now passes the per-checkpoint slice)
// No change needed if caller passes pendingEdits.article via prop.
```

- [ ] **Step 4: Update `app.js` to pass per-checkpoint slice**

Find where `<Article>` is rendered (likely in the checkpoint dispatch switch). Change:

```javascript
// Before
React.createElement(Article, { ..., pendingEdits: state.pendingEdits })

// After
React.createElement(Article, { ..., pendingEdits: state.pendingEdits?.article })
```

- [ ] **Step 5: Manual verification**

```bash
node server.js
```

Open `http://localhost:3001/console`, run a session through to Article checkpoint. Edit a paragraph. Reject in such a way that triggers a processing error (or simulate by closing the browser and reopening). Confirm edits persist on remount.

- [ ] **Step 6: Commit**

```bash
git add console/state.js console/app.js console/components/checkpoints/Article.js
git commit -m "refactor(console): namespace pendingEdits by checkpoint type"
```

---

### Task 1.2: Lift `editBtn` and `renderTextEditForm` to `console/utils.js`

**Files:**
- Modify: `console/utils.js`
- Modify: `console/components/checkpoints/Article.js:810-816` (remove local `editBtn`)
- Modify: `console/index.html` script load order (verify utils.js loads before checkpoints)

- [ ] **Step 1: Read current utils.js shape**

```bash
sed -n '1,40p' console/utils.js
```
Note the export/registration pattern (`window.Console.utils.X = X`).

- [ ] **Step 2: Add `editBtn` and `renderTextEditForm` to utils.js**

Append to `console/utils.js` (before the `window.Console.utils = { ... }` registration block):

```javascript
function editBtn(onClick) {
  return React.createElement('button', {
    className: 'article-block__edit-btn',
    onClick: function (e) { e.stopPropagation(); onClick(); },
    'aria-label': 'Edit',
    title: 'Edit'
  }, '✎');
}

function renderTextEditForm({ value, multiline, onSave, onCancel, placeholder, rows }) {
  function FormImpl() {
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
  return React.createElement(FormImpl);
}

function renderListEditForm({ items, onSave, onCancel, placeholder }) {
  function FormImpl() {
    const [list, setList] = React.useState(Array.isArray(items) ? items.slice() : []);
    function update(idx, val) { const copy = list.slice(); copy[idx] = val; setList(copy); }
    function remove(idx) { setList(list.filter(function (_, i) { return i !== idx; })); }
    function add() { setList(list.concat([''])); }
    return React.createElement('div', { className: 'article-block__edit-form' },
      list.map(function (item, idx) {
        return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
          React.createElement('input', {
            className: 'input flex-1',
            value: item,
            onChange: function (e) { update(idx, e.target.value); },
            placeholder: placeholder || ''
          }),
          React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { remove(idx); } }, '×')
        );
      }),
      React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: add }, '+ Add'),
      React.createElement('div', { className: 'edit-form__actions flex gap-sm' },
        React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: function () { onSave(list.filter(function (s) { return s && s.trim(); })); } }, 'Save'),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
      )
    );
  }
  return React.createElement(FormImpl);
}
```

Update the registration:

```javascript
window.Console.utils = {
  // ...existing exports...
  editBtn,
  renderTextEditForm,
  renderListEditForm
};
```

- [ ] **Step 3: Remove local `editBtn` from Article.js, use shared**

Find Article.js:810-816 (the `function editBtn(onClick) { ... }` definition). Delete it. Add to the destructuring at the top of the file:

```javascript
const { Badge, CollapsibleSection, safeStringify, editBtn } = window.Console.utils;
```

- [ ] **Step 4: Verify Article still works**

```bash
node server.js
```

Run a session to Article checkpoint, click a pencil icon, confirm the inline edit form opens.

- [ ] **Step 5: Commit**

```bash
git add console/utils.js console/components/checkpoints/Article.js
git commit -m "refactor(console): lift editBtn and form helpers to shared utils"
```

---

### Task 1.3: Add scaffolding for Outline edit state

**Files:**
- Modify: `console/components/checkpoints/Outline.js`

This task lays down the state machinery without yet wiring per-section editors. The existing JSON textarea path stays as a fallback (`mode === 'json'`); we add a new `mode === 'view'` (default) where pencil icons appear next to renderable sections.

- [ ] **Step 1: Update component signature and state**

Replace the top of `Outline.js` (lines 17-41):

```javascript
function Outline({ data, onApprove, onReject, dispatch, revisionCache, theme, pendingEdits }) {
  const outline = (data && data.outline) || {};
  const evaluationHistory = (data && data.evaluationHistory) || {};
  const previousOutline = (revisionCache && revisionCache.outline) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  const isDetective = theme === 'detective' || (!theme && outline.executiveSummary != null);

  // Edit state — mirrors Article.js
  const [editedOutline, setEditedOutline] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json' | 'reject'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');

  const dataKey = safeStringify(outline).slice(0, 100);
  React.useEffect(function () {
    setEditedOutline(null);
    setEditingBlock(null);
    setHasEdits(false);
    setMode('view');
    setJsonText('');
    setJsonError('');
    setFeedbackText('');
  }, [dataKey]);

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

  function handleApprove() {
    if (hasEdits && editedOutline) {
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline });
      onApprove({ outline: true, outlineEdits: editedOutline });
    } else {
      onApprove({ outline: true });
    }
  }

  function handleJsonApprove() {
    try {
      const parsed = JSON.parse(jsonText);
      setJsonError('');
      onApprove({ outline: true, outlineEdits: parsed });
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
    }
  }

  function handleModeChange(newMode) {
    if (newMode === mode) { setMode('view'); return; }
    setMode(newMode);
    if (newMode === 'json') { setJsonText(safeStringify(getCurrentOutline(), 2)); setJsonError(''); }
    if (newMode === 'reject') { setFeedbackText(''); }
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    if (dispatch) dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: outline });
    onReject({ outline: false, outlineFeedback: feedbackText.trim() });
  }
```

Add `editBtn`, `renderTextEditForm`, `renderListEditForm` to the destructured imports at the top of the file:

```javascript
const { Badge, CollapsibleSection, safeStringify, editBtn, renderTextEditForm, renderListEditForm } = window.Console.utils;
```

- [ ] **Step 2: Manual verification — non-edit paths still work**

```bash
node server.js
```

Open console, run a session to Outline checkpoint. Confirm:
- Default `view` renders the existing read-only sections (no pencils yet — those come in Task 1.4)
- "Edit (JSON)" toggle opens the textarea — same as before
- "Reject" toggle works and submits feedback
- Approve sends `{ outline: true }` (no edits yet)

- [ ] **Step 3: Commit**

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): scaffold Outline edit state for per-section inline editors"
```

---

### Task 1.4: Wire LEDE inline editor (journalist)

**Files:**
- Modify: `console/components/checkpoints/Outline.js` — replace `renderLede` (lines 85-103)

This task adds the first per-section editor. Pattern repeats for the remaining sections in subsequent tasks.

- [ ] **Step 1: Rewrite `renderLede` to support edit mode**

Replace the current `renderLede` function:

```javascript
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
```

- [ ] **Step 2: Add `LedeEditor` component**

After all the render functions, before the final return:

```javascript
function LedeEditor({ lede, onSave, onCancel }) {
  const [hook, setHook] = React.useState(lede.hook || '');
  const [keyTension, setKeyTension] = React.useState(lede.keyTension || '');
  const [evidence, setEvidence] = React.useState(Array.isArray(lede.selectedEvidence) ? lede.selectedEvidence.join(', ') : (lede.selectedEvidence || ''));

  function handleSave() {
    onSave({
      hook: hook,
      keyTension: keyTension,
      selectedEvidence: evidence.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    });
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Hook'),
    React.createElement('textarea', { className: 'input', value: hook, onChange: function (e) { setHook(e.target.value); }, rows: 2, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Key Tension'),
    React.createElement('textarea', { className: 'input', value: keyTension, onChange: function (e) { setKeyTension(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Selected Evidence (comma-separated IDs)'),
    React.createElement('input', { className: 'input', value: evidence, onChange: function (e) { setEvidence(e.target.value); } }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}
```

Register it: at the bottom of the file, before `window.Console.checkpoints.Outline = Outline;`, add nothing (it's a closure helper).

- [ ] **Step 3: Manual verification**

```bash
node server.js
```

Run to Outline checkpoint (journalist). Click pencil next to LEDE. Edit the hook and key tension. Save. Verify the rendered LEDE updates. Approve. Inspect the network tab: the POST to `/api/session/.../approve` body should include `outlineEdits.lede` matching your edits.

- [ ] **Step 4: Commit**

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): inline editor for Outline LEDE section"
```

---

### Task 1.5: Wire THE STORY editor (journalist arcs)

**Files:** `console/components/checkpoints/Outline.js` — replace `renderTheStory` (lines 105-149)

The Story section is more complex: it's a list of arcs, each with name, paragraphCount, keyPoints (string list), evidenceCards (badge list), photoPlacement, plus an `arcInterweaving` summary.

- [ ] **Step 1: Rewrite `renderTheStory` with edit affordance per arc**

Replace `renderTheStory`. Add a per-arc pencil that opens an `ArcOutlineEditor` for that arc, and a section-level pencil that edits `arcInterweaving`. Use `editingBlock = { type: 'theStoryArc', key: arcIdx }` and `{ type: 'theStoryInterweaving', key: 'interweaving' }`.

```javascript
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
          arc.keyPoints && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
            (Array.isArray(arc.keyPoints) ? arc.keyPoints : [arc.keyPoints]).map(function (point, j) {
              return React.createElement('li', { key: 'kp-' + j }, typeof point === 'string' ? point : safeStringify(point));
            })
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
        ? renderTextEditForm({
            value: typeof theStory.arcInterweaving === 'string' ? theStory.arcInterweaving : safeStringify(theStory.arcInterweaving || ''),
            multiline: true,
            rows: 3,
            onSave: function (val) { saveInterweaving(val); },
            onCancel: cancelEdit
          })
        : (theStory.arcInterweaving && React.createElement('div', { className: 'flex items-center gap-sm mt-sm' },
            React.createElement('p', { className: 'text-xs text-muted flex-1' },
              React.createElement('strong', null, 'Arc Interweaving: '),
              typeof theStory.arcInterweaving === 'string' ? theStory.arcInterweaving : safeStringify(theStory.arcInterweaving)
            ),
            editBtn(function () { setEditingBlock({ type: 'theStoryInterweaving', key: 'interweaving' }); })
          ))
    )
  );
}
```

- [ ] **Step 2: Add `saveTheStoryArc` and `saveInterweaving` helpers**

Inside the `Outline` component body, add:

```javascript
function saveTheStoryArc(arcIdx, updatedArc) {
  const next = ensureEditedOutline();
  const clone = JSON.parse(safeStringify(next));
  if (!clone.theStory) clone.theStory = { arcs: [], arcInterweaving: '' };
  if (!Array.isArray(clone.theStory.arcs)) clone.theStory.arcs = [];
  clone.theStory.arcs[arcIdx] = updatedArc;
  setEditedOutline(clone);
  setHasEdits(true);
  setEditingBlock(null);
}

function saveInterweaving(updatedText) {
  const next = ensureEditedOutline();
  const clone = JSON.parse(safeStringify(next));
  if (!clone.theStory) clone.theStory = { arcs: [], arcInterweaving: '' };
  clone.theStory.arcInterweaving = updatedText;
  setEditedOutline(clone);
  setHasEdits(true);
  setEditingBlock(null);
}
```

- [ ] **Step 3: Add `ArcOutlineEditor` component**

After `LedeEditor`:

```javascript
function ArcOutlineEditor({ arc, onSave, onCancel }) {
  const [name, setName] = React.useState(arc.name || '');
  const [paragraphCount, setParagraphCount] = React.useState(arc.paragraphCount != null ? String(arc.paragraphCount) : '');
  const [keyPoints, setKeyPoints] = React.useState(Array.isArray(arc.keyPoints) ? arc.keyPoints.slice() : (arc.keyPoints ? [arc.keyPoints] : []));
  const [photoPlacement, setPhotoPlacement] = React.useState(typeof arc.photoPlacement === 'string' ? arc.photoPlacement : (arc.photoPlacement ? safeStringify(arc.photoPlacement) : ''));

  function updateKeyPoint(idx, val) { const c = keyPoints.slice(); c[idx] = val; setKeyPoints(c); }
  function removeKeyPoint(idx) { setKeyPoints(keyPoints.filter(function (_, i) { return i !== idx; })); }
  function addKeyPoint() { setKeyPoints(keyPoints.concat([''])); }

  function handleSave() {
    const updated = Object.assign({}, arc, {
      name: name,
      keyPoints: keyPoints.filter(function (s) { return s && s.trim(); }),
      photoPlacement: photoPlacement
    });
    if (paragraphCount !== '') {
      const n = parseInt(paragraphCount, 10);
      if (!isNaN(n)) updated.paragraphCount = n;
    }
    onSave(updated);
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Name'),
    React.createElement('input', { className: 'input', value: name, onChange: function (e) { setName(e.target.value); }, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Paragraph Count'),
    React.createElement('input', { className: 'input', type: 'number', value: paragraphCount, onChange: function (e) { setParagraphCount(e.target.value); } }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Key Points'),
    keyPoints.map(function (kp, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: kp, onChange: function (e) { updateKeyPoint(idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeKeyPoint(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: addKeyPoint }, '+ Add point'),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Photo Placement'),
    React.createElement('input', { className: 'input', value: photoPlacement, onChange: function (e) { setPhotoPlacement(e.target.value); } }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );

  // Note: evidenceCards intentionally not editable — IDs come from evidence bundle.
  // If a user wants to change which evidence an arc cites, they should reject and re-run.
}
```

- [ ] **Step 4: Manual verification**

```bash
node server.js
```

Run to Outline checkpoint (journalist). Edit one arc's name and key points. Save. Edit `arcInterweaving`. Save. Approve. Confirm the POST body's `outlineEdits.theStory` has both changes.

- [ ] **Step 5: Commit**

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): inline editor for Outline THE STORY (per-arc + interweaving)"
```

---

### Task 1.6: Wire FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING editors (journalist)

These three sections share the exact same shape (`focus`/`arcConnections` + `shellAccounts[]` + `characterHighlights` + `buriedItems[]`). One editor component, three render sites.

**Files:** `console/components/checkpoints/Outline.js` — modify `renderNamedSection` (lines 151-175)

- [ ] **Step 1: Refactor `renderNamedSection` to take a sectionKey for editing**

```javascript
function renderNamedSection(title, section, sectionKey) {
  if (!section) return null;
  const editing = isEditing('namedSection', sectionKey);
  const focus = section.arcConnections || section.focus || null;

  if (editing) {
    return React.createElement('div', { className: 'outline-section outline-section--editing' },
      React.createElement('h4', { className: 'outline-section__title' }, title),
      React.createElement(NamedSectionEditor, {
        section: section,
        onSave: function (updated) { saveSectionEdit(sectionKey, updated); },
        onCancel: cancelEdit
      })
    );
  }

  return React.createElement('div', { className: 'outline-section' },
    React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
      React.createElement('h4', { className: 'outline-section__title' }, title),
      editBtn(function () { setEditingBlock({ type: 'namedSection', key: sectionKey }); })
    ),
    React.createElement('div', { className: 'outline-section__content' },
      focus && React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, 'Focus: '),
        typeof focus === 'string' ? focus : safeStringify(focus)
      ),
      section.shellAccounts && React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, 'Shell Accounts: '),
        Array.isArray(section.shellAccounts) ? section.shellAccounts.join(', ') : section.shellAccounts
      ),
      section.characterHighlights && React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, 'Character Highlights: '),
        typeof section.characterHighlights === 'string' ? section.characterHighlights : safeStringify(section.characterHighlights)
      ),
      section.buriedItems && React.createElement('p', { className: 'text-sm mb-sm' },
        React.createElement('strong', null, 'Buried Items: '),
        Array.isArray(section.buriedItems) ? section.buriedItems.join(', ') : section.buriedItems
      )
    )
  );
}
```

- [ ] **Step 2: Update the call sites for these three sections**

Find in the journalist render path (search for `renderNamedSection(`):

```javascript
// Before
renderNamedSection('FOLLOW THE MONEY', outline.followTheMoney),
renderNamedSection('THE PLAYERS', outline.thePlayers),
renderNamedSection("WHAT'S MISSING", outline.whatsMissing),

// After (pass sectionKey)
renderNamedSection('FOLLOW THE MONEY', getCurrentOutline().followTheMoney, 'followTheMoney'),
renderNamedSection('THE PLAYERS', getCurrentOutline().thePlayers, 'thePlayers'),
renderNamedSection("WHAT'S MISSING", getCurrentOutline().whatsMissing, 'whatsMissing'),
```

Note: switch all section reads to `getCurrentOutline()` so edits show immediately. Do this for every section in the file (lede, theStory, namedSection×3, closing, pullQuotes for journalist; all 6 detective sections).

- [ ] **Step 3: Add `NamedSectionEditor`**

After `ArcOutlineEditor`:

```javascript
function NamedSectionEditor({ section, onSave, onCancel }) {
  const [focus, setFocus] = React.useState(typeof section.arcConnections === 'string' ? section.arcConnections : (typeof section.focus === 'string' ? section.focus : ''));
  const [shellAccounts, setShellAccounts] = React.useState(Array.isArray(section.shellAccounts) ? section.shellAccounts.slice() : (section.shellAccounts ? [section.shellAccounts] : []));
  const [characterHighlights, setCharacterHighlights] = React.useState(typeof section.characterHighlights === 'string' ? section.characterHighlights : '');
  const [buriedItems, setBuriedItems] = React.useState(Array.isArray(section.buriedItems) ? section.buriedItems.slice() : (section.buriedItems ? [section.buriedItems] : []));

  function updateList(setter, list, idx, val) { const c = list.slice(); c[idx] = val; setter(c); }
  function removeFromList(setter, list, idx) { setter(list.filter(function (_, i) { return i !== idx; })); }
  function addToList(setter, list) { setter(list.concat([''])); }

  function handleSave() {
    const updated = Object.assign({}, section, {
      // Preserve original key (focus vs arcConnections) — write to whichever was present
      [section.arcConnections != null ? 'arcConnections' : 'focus']: focus,
      shellAccounts: shellAccounts.filter(function (s) { return s && s.trim(); }),
      characterHighlights: characterHighlights,
      buriedItems: buriedItems.filter(function (s) { return s && s.trim(); })
    });
    onSave(updated);
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Focus'),
    React.createElement('textarea', { className: 'input', value: focus, onChange: function (e) { setFocus(e.target.value); }, rows: 3, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Shell Accounts'),
    shellAccounts.map(function (s, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: s, onChange: function (e) { updateList(setShellAccounts, shellAccounts, idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeFromList(setShellAccounts, shellAccounts, idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: function () { addToList(setShellAccounts, shellAccounts); } }, '+ Add'),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Character Highlights'),
    React.createElement('textarea', { className: 'input', value: characterHighlights, onChange: function (e) { setCharacterHighlights(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Buried Items'),
    buriedItems.map(function (s, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: s, onChange: function (e) { updateList(setBuriedItems, buriedItems, idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeFromList(setBuriedItems, buriedItems, idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: function () { addToList(setBuriedItems, buriedItems); } }, '+ Add'),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}
```

- [ ] **Step 4: Manual verification**

Run server, open Outline (journalist). Edit each of FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING. Save each. Approve. Confirm `outlineEdits` has all three sections updated.

- [ ] **Step 5: Commit**

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): inline editor for Outline named-sections (money/players/missing)"
```

---

### Task 1.7: Wire CLOSING and PULL QUOTES editors (journalist)

**Files:** `console/components/checkpoints/Outline.js` — modify `renderClosing` (177-196), `renderPullQuotes` (198-218)

- [ ] **Step 1: Rewrite `renderClosing` with edit affordance**

```javascript
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
      resolutions && React.createElement('p', { className: 'text-sm mb-sm' }, React.createElement('strong', null, 'Resolutions: '), typeof resolutions === 'string' ? resolutions : safeStringify(resolutions)),
      closing.systemicAngle && React.createElement('p', { className: 'text-sm mb-sm' }, React.createElement('strong', null, 'Systemic Angle: '), typeof closing.systemicAngle === 'string' ? closing.systemicAngle : safeStringify(closing.systemicAngle)),
      closing.finalLine && React.createElement('p', { className: 'text-sm text-secondary text-italic' }, typeof closing.finalLine === 'string' ? closing.finalLine : safeStringify(closing.finalLine))
    )
  );
}

function ClosingEditor({ closing, onSave, onCancel }) {
  const resolutionsKey = closing.arcResolutions != null ? 'arcResolutions' : 'theme';
  const [resolutions, setResolutions] = React.useState(typeof closing[resolutionsKey] === 'string' ? closing[resolutionsKey] : '');
  const [systemicAngle, setSystemicAngle] = React.useState(typeof closing.systemicAngle === 'string' ? closing.systemicAngle : '');
  const [finalLine, setFinalLine] = React.useState(typeof closing.finalLine === 'string' ? closing.finalLine : '');

  function handleSave() {
    onSave(Object.assign({}, closing, {
      [resolutionsKey]: resolutions,
      systemicAngle: systemicAngle,
      finalLine: finalLine
    }));
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, resolutionsKey === 'arcResolutions' ? 'Arc Resolutions' : 'Theme'),
    React.createElement('textarea', { className: 'input', value: resolutions, onChange: function (e) { setResolutions(e.target.value); }, rows: 3, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Systemic Angle'),
    React.createElement('textarea', { className: 'input', value: systemicAngle, onChange: function (e) { setSystemicAngle(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Final Line'),
    React.createElement('textarea', { className: 'input', value: finalLine, onChange: function (e) { setFinalLine(e.target.value); }, rows: 2 }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}
```

- [ ] **Step 2: Rewrite `renderPullQuotes` with per-quote editing**

```javascript
function renderPullQuotes(pullQuotes) {
  if (!pullQuotes || pullQuotes.length === 0) return null;
  return React.createElement('div', { className: 'outline-section' },
    React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
      React.createElement('h4', { className: 'outline-section__title' }, 'PULL QUOTES'),
      editBtn(function () { setEditingBlock({ type: 'pullQuotesAll', key: 'all' }); })
    ),
    React.createElement('div', { className: 'outline-section__content' },
      isEditing('pullQuotesAll', 'all')
        ? React.createElement(PullQuotesEditor, { pullQuotes: pullQuotes, onSave: function (u) { saveSectionEdit('pullQuotes', u); }, onCancel: cancelEdit })
        : pullQuotes.map(function (pq, i) {
            return React.createElement('div', { key: 'pq-' + i, className: 'pull-quote' },
              React.createElement('p', { className: 'pull-quote__text' }, '“' + (pq.text || '') + '”'),
              (pq.attribution || pq.placement) && React.createElement('div', { className: 'pull-quote__attribution' },
                pq.attribution && React.createElement('span', null, '— ' + pq.attribution),
                pq.placement && React.createElement('span', { className: 'text-xs text-muted' }, ' [' + pq.placement + ']')
              )
            );
          })
    )
  );
}

function PullQuotesEditor({ pullQuotes, onSave, onCancel }) {
  const [quotes, setQuotes] = React.useState(JSON.parse(safeStringify(pullQuotes)));
  function update(idx, field, val) {
    const c = JSON.parse(safeStringify(quotes));
    c[idx][field] = val;
    setQuotes(c);
  }
  function remove(idx) { setQuotes(quotes.filter(function (_, i) { return i !== idx; })); }
  function add() { setQuotes(quotes.concat([{ text: '', attribution: '', placement: '' }])); }
  return React.createElement('div', { className: 'article-block__edit-form' },
    quotes.map(function (q, idx) {
      return React.createElement('div', { key: idx, className: 'mb-md' },
        React.createElement('label', { className: 'text-xs text-muted' }, 'Quote ' + (idx + 1)),
        React.createElement('textarea', { className: 'input', value: q.text || '', onChange: function (e) { update(idx, 'text', e.target.value); }, rows: 2 }),
        React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Attribution'),
        React.createElement('input', { className: 'input', value: q.attribution || '', onChange: function (e) { update(idx, 'attribution', e.target.value); } }),
        React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Placement'),
        React.createElement('input', { className: 'input', value: q.placement || '', onChange: function (e) { update(idx, 'placement', e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost mt-sm', onClick: function () { remove(idx); } }, 'Remove')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: add }, '+ Add Quote'),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: function () { onSave(quotes); } }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}
```

- [ ] **Step 3: Manual verification + commit**

Run server. Edit closing fields. Edit pull quotes (add one, remove one, modify text). Approve. Confirm payload.

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): inline editors for Outline CLOSING and PULL QUOTES"
```

---

### Task 1.8: Wire detective-theme section editors

The detective theme has six sections. Three are simple field updates (`executiveSummary`, `memoryAnalysis`, `finalAssessment`); three are list-of-objects (`evidenceLocker.evidenceGroups`, `suspectNetwork.keyRelationships`+`assessments`, `outstandingQuestions.questions`). Apply the same pattern.

**Files:** `console/components/checkpoints/Outline.js` — modify `renderExecutiveSummary` (224-246), `renderEvidenceLocker` (248-278), `renderMemoryAnalysis` (280-301), `renderSuspectNetwork` (305-342), `renderOutstandingQuestions` (344-362), `renderFinalAssessment` (364-381)

- [ ] **Step 1: Add detective editors**

Mirror the pattern from journalist sections. Add these closure components after `PullQuotesEditor`:

- `ExecutiveSummaryEditor` — `hook` (textarea), `caseOverview` (textarea), `primaryFindings` (string list)
- `EvidenceLockerEditor` — `evidenceGroups` array of `{theme, synthesis, evidenceIds[]}`
- `MemoryAnalysisEditor` — `focus` (textarea), `keyPatterns` (string list), `significance` (textarea)
- `SuspectNetworkEditor` — `keyRelationships` array of `{characters[], nature}`, `assessments` array of `{name, role, suspicionLevel}`
- `OutstandingQuestionsEditor` — `questions` (string list), `investigativeGaps` (textarea)
- `FinalAssessmentEditor` — `accusationHandling` (textarea), `verdict` (textarea), `closingLine` (textarea)

Use the same Save/Cancel + autoFocus pattern. For lists of objects (relationships, assessments, evidenceGroups), use the inline add/remove pattern from `PullQuotesEditor`.

For each render function, add the edit affordance per the journalist pattern: header row with title + pencil, swap to editor when `isEditing('section', sectionKey)`. Use sectionKeys: `executiveSummary`, `evidenceLocker`, `memoryAnalysis`, `suspectNetwork`, `outstandingQuestions`, `finalAssessment`.

For `suspectNetwork` specifically, edits to `keyRelationships[i].suspicionLevel` should remain a select with options `'low' | 'moderate' | 'high'` (since the badge color depends on it). Use `<select>`:

```javascript
React.createElement('select', { className: 'input', value: a.suspicionLevel || 'low', onChange: function (e) { update(idx, 'suspicionLevel', e.target.value); } },
  React.createElement('option', { value: 'low' }, 'low'),
  React.createElement('option', { value: 'moderate' }, 'moderate'),
  React.createElement('option', { value: 'high' }, 'high')
)
```

(Detailed code per editor would 3x the size of this plan; the journalist examples in Tasks 1.4-1.7 give complete templates. The implementer follows them.)

- [ ] **Step 2: Update detective render call sites to use `getCurrentOutline()`**

Just like the journalist branch, pull the source-of-truth from `getCurrentOutline()`:

```javascript
// In the detective branch of the main render
renderExecutiveSummary(getCurrentOutline().executiveSummary)
renderEvidenceLocker(getCurrentOutline().evidenceLocker)
// ... etc
```

- [ ] **Step 3: Manual verification**

Run a session through with `theme: 'detective'`. Edit each detective section. Approve. Confirm payload.

- [ ] **Step 4: Commit**

```bash
git add console/components/checkpoints/Outline.js
git commit -m "feat(console): inline editors for Outline detective-theme sections"
```

---

### Task 1.9: Add `outlineEdits` test coverage in api.test.js

**Files:**
- Modify: `__tests__/integration/api.test.js`

The integration test suite covers the approve endpoint but doesn't currently exercise the `outlineEdits` path. Add a focused test that proves the payload makes it into `stateUpdates.outline`.

- [ ] **Step 1: Read current api.test.js structure**

```bash
head -80 __tests__/integration/api.test.js
```

Find the existing approval test pattern.

- [ ] **Step 2: Add a `buildResumePayload` direct unit test**

Add a new test file `__tests__/unit/server-build-resume-payload.test.js`:

```javascript
const { buildResumePayload } = require('../../server.js'); // Note: needs to be exported

describe('buildResumePayload — outlineEdits', () => {
  it('routes outlineEdits into stateUpdates.outline when outline:true', () => {
    const result = buildResumePayload({
      outline: true,
      outlineEdits: { lede: { hook: 'edited hook' } }
    });
    expect(result.error).toBeNull();
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toEqual({ lede: { hook: 'edited hook' } });
  });

  it('does not include outlineEdits when outline:false (rejection)', () => {
    const result = buildResumePayload({
      outline: false,
      outlineFeedback: 'needs more detail',
      outlineEdits: { lede: { hook: 'should not be applied' } }
    });
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.outline).toBeUndefined();
    expect(result.stateUpdates._outlineFeedback).toBe('needs more detail');
  });

  it('approves without edits when outlineEdits is omitted', () => {
    const result = buildResumePayload({ outline: true });
    expect(result.resume.approved).toBe(true);
    expect(result.stateUpdates.outline).toBeUndefined();
  });
});
```

If `buildResumePayload` isn't exported from server.js, export it: at the bottom of server.js, add:

```javascript
module.exports = { app, buildResumePayload };  // adjust to existing exports
```

- [ ] **Step 3: Run test**

```bash
npx jest __tests__/unit/server-build-resume-payload.test.js -v
```

Expected: 3 tests pass.

- [ ] **Step 4: Run full suite**

```bash
npm test
```

Expected: previous test count + 3, all passing.

- [ ] **Step 5: Commit**

```bash
git add __tests__/unit/server-build-resume-payload.test.js server.js
git commit -m "test(server): cover buildResumePayload outlineEdits routing"
```

---

### Task 1.10: Remove the JSON-textarea fallback (optional polish)

Once per-section editors cover everything, the `mode === 'json'` path is redundant. Can be kept as an escape hatch or removed for surface-area reduction. Recommend keep — it's harmless and useful for power users.

If keeping: no action.

If removing:

- [ ] **Step 1: Remove `'json'` from the mode union, the toggle button, and the `handleJsonApprove` function**
- [ ] **Step 2: Manual verify Outline still has Approve / Reject toggles**
- [ ] **Step 3: Commit `chore(console): remove redundant JSON-edit mode from Outline`**

---

### Phase 1 Manual Test Plan

1. Run `npm start`. Open `http://localhost:3001/console`.
2. Run a session through to the Outline checkpoint with `theme: 'journalist'`. Confirm:
   - LEDE pencil opens inline editor; edits persist after Save and reflect in the rendered LEDE
   - THE STORY: per-arc pencils work; arc interweaving pencil works
   - FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING editors work and persist
   - CLOSING editor works; PULL QUOTES editor lets you add/remove/edit quotes
   - Approve sends `outlineEdits` with all your changes; check the network tab
   - Server log shows `[checkpointOutline] Approved by human` and downstream nodes use the edited outline
3. Restart, run a `theme: 'detective'` session. Confirm all 6 detective section editors work.
4. Trigger a processing error mid-Article (force a timeout) to confirm `pendingEdits.outline` persists across remount. (Hard to reproduce; alternative: confirm `state.pendingEdits.outline` is set in the React DevTools state after Save.)

---

## Phase 2: Arc Rich Editor

**Scope:** Add edit-then-approve to ArcSelection. Currently it only supports select/reject. Editable arc fields: `title`, `hook`, `keyMoments`, `characterPlacements` (object of name→role), `thematicLinks`. Out of scope: editing the `evidence` array (volatile, IDs come from evidence bundle), `evaluationHistory` (system-owned), `arcSource` (system metadata).

**Server side:** New plumbing required. `buildResumePayload` currently has no path for arc edits. Add `arcEdits` handling that maps to `state.narrativeArcs`. Selection (`selectedArcs`) and edits (`arcEdits`) travel together in the same approve payload.

**Decision points already locked:**
1. **Edit affects all arcs, not just selected ones.** The server replaces `state.narrativeArcs` wholesale. The selectedArcs filter is applied downstream. This avoids the awkward "I deselected arc X, but my edits to it should still apply if I re-select".
2. **No new arc creation.** Users can edit existing arcs but can't compose new ones from scratch. The arc generator owns arc creation.
3. **No `arcEdits` without `selectedArcs`.** A user editing arcs must also confirm a selection (since the next phase needs a selection regardless).

**Files for Phase 2:**

- `server.js` — extend `buildResumePayload` with `arcEdits` path
- `__tests__/unit/server-build-resume-payload.test.js` — add coverage for arcEdits routing
- `console/components/checkpoints/ArcSelection.js` — add edit state + per-arc edit affordance
- `console/state.js` — already has `pendingEdits` namespacing from Phase 1, no change

---

### Task 2.1: Server-side — wire `arcEdits` into `buildResumePayload`

**Files:**
- Modify: `server.js:184-196` (the `selectedArcs` block)
- Modify: `__tests__/unit/server-build-resume-payload.test.js` (created in Task 1.9)

- [ ] **Step 1: Write failing tests**

Add to `__tests__/unit/server-build-resume-payload.test.js`:

```javascript
describe('buildResumePayload — arcEdits', () => {
  it('routes arcEdits into stateUpdates.narrativeArcs alongside selectedArcs', () => {
    const editedArcs = [
      { id: 'arc-1', title: 'Edited Title', hook: 'New hook', keyMoments: [], evidence: [], characterPlacements: {}, thematicLinks: [] },
      { id: 'arc-2', title: 'Another', hook: '...', keyMoments: [], evidence: [], characterPlacements: {}, thematicLinks: [] }
    ];
    const result = buildResumePayload({
      selectedArcs: ['arc-1', 'arc-2'],
      arcEdits: editedArcs
    });
    expect(result.error).toBeNull();
    expect(result.stateUpdates.selectedArcs).toEqual(['arc-1', 'arc-2']);
    expect(result.stateUpdates.narrativeArcs).toEqual(editedArcs);
    expect(result.resume.selectedArcs).toEqual(['arc-1', 'arc-2']);
  });

  it('rejects arcEdits without selectedArcs as invalid', () => {
    const result = buildResumePayload({
      arcEdits: [{ id: 'arc-1', title: 'edited' }]
    });
    expect(result.error).toMatch(/selectedArcs/i);
  });

  it('does not apply arcEdits on rejection', () => {
    const result = buildResumePayload({
      selectedArcs: false,
      arcFeedback: 'rework them all',
      arcEdits: [{ id: 'arc-1', title: 'should not apply' }]
    });
    expect(result.resume.approved).toBe(false);
    expect(result.stateUpdates.narrativeArcs).toBeUndefined();
  });

  it('rejects malformed arcEdits (not array)', () => {
    const result = buildResumePayload({
      selectedArcs: ['arc-1'],
      arcEdits: { 'arc-1': { title: 'edited' } }
    });
    expect(result.error).toMatch(/arcEdits/i);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx jest __tests__/unit/server-build-resume-payload.test.js -v
```

Expected: 4 new tests fail (`arcEdits` not handled).

- [ ] **Step 3: Modify `buildResumePayload` in server.js**

Find the `selectedArcs` block (server.js:184-196) and update:

```javascript
// Arc selection: approve with selection (optionally with edits), or reject-with-feedback
if (Array.isArray(approvals.selectedArcs) && approvals.selectedArcs.length > 0) {
    validApprovalDetected = true;
    stateUpdates.selectedArcs = approvals.selectedArcs;
    resume.selectedArcs = approvals.selectedArcs;

    // Optional: apply arc edits to state.narrativeArcs alongside selection
    if (approvals.arcEdits !== undefined) {
        if (!Array.isArray(approvals.arcEdits)) {
            error = 'arcEdits must be an array of arc objects';
        } else {
            stateUpdates.narrativeArcs = approvals.arcEdits;
        }
    }
} else if (approvals.selectedArcs === false && typeof approvals.arcFeedback === 'string' && approvals.arcFeedback.trim()) {
    validApprovalDetected = true;
    resume.approved = false;
    resume.feedback = approvals.arcFeedback.trim();
    stateUpdates._arcFeedback = approvals.arcFeedback.trim();
    // arcEdits silently dropped on rejection — feedback path doesn't preserve edits
} else if (approvals.selectedArcs && !Array.isArray(approvals.selectedArcs)) {
    error = 'selectedArcs must be an array or false (for rejection)';
} else if (approvals.arcEdits !== undefined && !Array.isArray(approvals.selectedArcs)) {
    // arcEdits provided without a valid selectedArcs array
    error = 'arcEdits requires a non-empty selectedArcs array';
}
```

- [ ] **Step 4: Run tests, expect all 4 to pass**

```bash
npx jest __tests__/unit/server-build-resume-payload.test.js -v
```

- [ ] **Step 5: Run full suite**

```bash
npm test
```

- [ ] **Step 6: Commit**

```bash
git add server.js __tests__/unit/server-build-resume-payload.test.js
git commit -m "feat(server): accept arcEdits in approve payload, route to state.narrativeArcs"
```

---

### Task 2.2: ArcSelection — add edit state scaffolding

**Files:** `console/components/checkpoints/ArcSelection.js`

- [ ] **Step 1: Update component signature and add state**

Replace the top of `ArcSelection.js` (lines 14-52):

```javascript
const { Badge, truncate, safeStringify, editBtn } = window.Console.utils;
const { RevisionDiff } = window.Console;

function ArcSelection({ data, onApprove, onReject, dispatch, revisionCache, pendingEdits }) {
  const arcs = (data && data.narrativeArcs) || [];
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 2;
  const previousArcs = (revisionCache && revisionCache.arcs) || null;

  // Selection state (existing)
  const [selectedArcs, setSelectedArcs] = React.useState(function () {
    var initial = new Set();
    arcs.forEach(function (arc) { initial.add(arc.id || arc.title); });
    return initial;
  });
  const [expandedCards, setExpandedCards] = React.useState(new Set());
  const [mode, setMode] = React.useState('view');
  const [feedbackText, setFeedbackText] = React.useState('');

  // Edit state (new)
  const [editedArcs, setEditedArcs] = React.useState(null);  // null until first edit
  const [editingArcId, setEditingArcId] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);

  // Reset on data change — include new edit fields
  const arcIdKey = arcs.map(function (arc) { return arc.id || arc.title; }).join(',');
  React.useEffect(function () {
    var all = new Set();
    arcs.forEach(function (arc) { all.add(arc.id || arc.title); });
    setSelectedArcs(all);
    setExpandedCards(new Set());
    setMode('view');
    setFeedbackText('');
    setEditedArcs(null);
    setEditingArcId(null);
    setHasEdits(false);
  }, [arcIdKey]);

  // Restore from pendingEdits on remount
  React.useEffect(function () {
    if (pendingEdits && !editedArcs) {
      setEditedArcs(pendingEdits);
      setHasEdits(true);
    }
  }, [pendingEdits]);

  function getCurrentArcs() { return editedArcs || arcs; }
  function ensureEditedArcs() {
    if (editedArcs) return editedArcs;
    const clone = JSON.parse(safeStringify(arcs));
    setEditedArcs(clone);
    return clone;
  }

  function startArcEdit(arcId) { setEditingArcId(arcId); }
  function cancelArcEdit() { setEditingArcId(null); }
  function saveArcEdit(arcId, updatedArc) {
    const next = ensureEditedArcs();
    const clone = JSON.parse(safeStringify(next));
    const idx = clone.findIndex(function (a) { return (a.id || a.title) === arcId; });
    if (idx >= 0) clone[idx] = Object.assign({}, clone[idx], updatedArc);
    setEditedArcs(clone);
    setHasEdits(true);
    setEditingArcId(null);
  }

  // Update handleSubmit to send arcEdits if dirty
  function handleSubmit() {
    const payload = { selectedArcs: Array.from(selectedArcs) };
    if (hasEdits && editedArcs) {
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'arcs', edits: editedArcs });
      payload.arcEdits = editedArcs;
    }
    onApprove(payload);
  }
```

Keep the rest of the file unchanged for now (the per-arc rendering still uses `arcs` directly). Task 2.3 wires the edit affordance into the render path.

- [ ] **Step 2: Manual verification**

Run server. ArcSelection loads. Confirm select/deselect still works. Approve sends `{ selectedArcs: [...] }` with no `arcEdits` (since `hasEdits` is false).

- [ ] **Step 3: Commit**

```bash
git add console/components/checkpoints/ArcSelection.js
git commit -m "feat(console): scaffold ArcSelection edit state"
```

---

### Task 2.3: ArcSelection — per-arc edit affordance

**Files:** `console/components/checkpoints/ArcSelection.js`

- [ ] **Step 1: Add `ArcEditor` component**

Before `window.Console.checkpoints.ArcSelection = ArcSelection;` at the bottom:

```javascript
function ArcEditor({ arc, onSave, onCancel }) {
  const [title, setTitle] = React.useState(arc.title || '');
  const [hook, setHook] = React.useState(arc.hook || '');
  const [keyMoments, setKeyMoments] = React.useState(
    Array.isArray(arc.keyMoments)
      ? arc.keyMoments.map(function (m) { return typeof m === 'string' ? m : (m.description || ''); })
      : []
  );
  const [thematicLinks, setThematicLinks] = React.useState(Array.isArray(arc.thematicLinks) ? arc.thematicLinks.slice() : []);
  // characterPlacements is object {name: role}
  const [placements, setPlacements] = React.useState(
    Object.entries(arc.characterPlacements || {}).map(function (e) { return { name: e[0], role: e[1] }; })
  );

  function updateKeyMoment(idx, val) { const c = keyMoments.slice(); c[idx] = val; setKeyMoments(c); }
  function removeKeyMoment(idx) { setKeyMoments(keyMoments.filter(function (_, i) { return i !== idx; })); }
  function addKeyMoment() { setKeyMoments(keyMoments.concat([''])); }

  function updateThematic(idx, val) { const c = thematicLinks.slice(); c[idx] = val; setThematicLinks(c); }
  function removeThematic(idx) { setThematicLinks(thematicLinks.filter(function (_, i) { return i !== idx; })); }
  function addThematic() { setThematicLinks(thematicLinks.concat([''])); }

  function updatePlacement(idx, field, val) {
    const c = placements.slice();
    c[idx] = Object.assign({}, c[idx], { [field]: val });
    setPlacements(c);
  }
  function removePlacement(idx) { setPlacements(placements.filter(function (_, i) { return i !== idx; })); }
  function addPlacement() { setPlacements(placements.concat([{ name: '', role: '' }])); }

  function handleSave() {
    const placementObj = {};
    placements.forEach(function (p) {
      if (p.name && p.name.trim()) placementObj[p.name.trim()] = p.role || '';
    });
    onSave({
      title: title,
      hook: hook,
      keyMoments: keyMoments.filter(function (s) { return s && s.trim(); }),
      thematicLinks: thematicLinks.filter(function (s) { return s && s.trim(); }),
      characterPlacements: placementObj
    });
  }

  return React.createElement('div', { className: 'article-block__edit-form arc-card__editor' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Title'),
    React.createElement('input', { className: 'input', value: title, onChange: function (e) { setTitle(e.target.value); }, autoFocus: true }),

    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Hook'),
    React.createElement('textarea', { className: 'input', value: hook, onChange: function (e) { setHook(e.target.value); }, rows: 3 }),

    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Key Moments'),
    keyMoments.map(function (m, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: m, onChange: function (e) { updateKeyMoment(idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeKeyMoment(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: addKeyMoment }, '+ Add moment'),

    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Themes'),
    thematicLinks.map(function (t, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: t, onChange: function (e) { updateThematic(idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeThematic(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: addThematic }, '+ Add theme'),

    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Character Placements'),
    placements.map(function (p, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input', placeholder: 'Name', value: p.name, onChange: function (e) { updatePlacement(idx, 'name', e.target.value); }, style: { flex: 1 } }),
        React.createElement('input', { className: 'input', placeholder: 'Role', value: p.role, onChange: function (e) { updatePlacement(idx, 'role', e.target.value); }, style: { flex: 1 } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removePlacement(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: addPlacement }, '+ Add character'),

    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}
```

- [ ] **Step 2: Wire the edit affordance into the arc-card render**

Find `arcs.map(function (arc) {` in the main render (around line 166). Change to use `getCurrentArcs()` and add an edit button + branch:

```javascript
getCurrentArcs().map(function (arc) {
  var arcId = arc.id || arc.title;
  // ... existing variables ...

  // EDITING branch
  if (editingArcId === arcId) {
    return React.createElement('div', {
      key: arcId + '-edit',
      className: 'arc-card arc-card--editing'
    },
      React.createElement(ArcEditor, {
        arc: arc,
        onSave: function (updates) { saveArcEdit(arcId, updates); },
        onCancel: cancelArcEdit
      })
    );
  }

  // ... existing rendering ...
  // In the header row (around line 201), add the edit button next to the strength badge:
  React.createElement('div', { className: 'arc-card__header' },
    React.createElement('label', { className: 'checkbox-item' }, /* existing checkbox */),
    React.createElement('span', { className: 'arc-card__title' }, arc.title || arcId),
    React.createElement(Badge, { /* existing strength badge */ }),
    editBtn(function () { startArcEdit(arcId); })
  )
```

- [ ] **Step 3: Add CSS hint (optional but improves UX)**

Append to `console/console.css`:

```css
.arc-card--editing {
  border-color: var(--accent-cyan);
  background: rgba(0, 0, 0, 0.4);
}

.arc-card__editor {
  width: 100%;
}
```

- [ ] **Step 4: Update `app.js` to pass `pendingEdits.arcs`**

Find the ArcSelection render site:

```javascript
React.createElement(ArcSelection, { ..., pendingEdits: state.pendingEdits?.arcs })
```

- [ ] **Step 5: Manual verification**

Run server. ArcSelection checkpoint:
- Click pencil on an arc; editor opens
- Edit title, hook, add a key moment, add a theme, add a character placement
- Save; the arc card shows updated values
- Approve; network tab shows `arcEdits` in the body, with the edited arc and untouched arcs
- Confirm `state.narrativeArcs` is replaced server-side (check server logs / next-phase output)

- [ ] **Step 6: Commit**

```bash
git add console/components/checkpoints/ArcSelection.js console/console.css console/app.js
git commit -m "feat(console): inline editor for ArcSelection (title, hook, moments, themes, placements)"
```

---

### Task 2.4: Update server.js's resume-time check for arc selection

**Files:** `lib/workflow/nodes/checkpoint-nodes.js:317-352`

The existing `checkpointArcSelection` only handles `selectedArcs`. With Phase 2.1 in place, edits are applied via `Command({ update })` *before* the checkpoint resumes — so `state.narrativeArcs` is already updated. The checkpoint node doesn't need to know about edits. Verify this.

- [ ] **Step 1: Read `checkpointArcSelection` and confirm**

```bash
sed -n '317,352p' lib/workflow/nodes/checkpoint-nodes.js
```

Confirm: the node returns `{ selectedArcs: resumeValue.selectedArcs, currentPhase: PHASES.ARC_SELECTION }`. It does not need to handle `narrativeArcs` updates — those land via `Command.update` from `buildResumePayload.stateUpdates`.

- [ ] **Step 2: Add a comment for future readers**

Update the JSDoc above `checkpointArcSelection`:

```javascript
/**
 * Arc Selection Checkpoint
 *
 * Pauses for user to select which narrative arcs to include in the article.
 * Requires: state.narrativeArcs (from evaluateArcs with ready=true)
 *
 * Note: Arc edits (modifying title/hook/etc.) arrive via Command({update: {narrativeArcs: ...}})
 * applied by buildResumePayload before this checkpoint resumes — see server.js:184.
 * This node only consumes the selection from resumeValue.
 *
 * @param {Object} state - Current state with narrativeArcs
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with selectedArcs
 */
```

- [ ] **Step 3: Commit**

```bash
git add lib/workflow/nodes/checkpoint-nodes.js
git commit -m "docs: clarify arc edit dataflow in checkpointArcSelection"
```

---

### Phase 2 Manual Test Plan

1. Run a session through to ArcSelection.
2. Click pencil on Arc 1. Editor opens with all fields prefilled.
3. Modify title → "Edited Arc".
4. Modify hook.
5. Add a key moment ("Test moment 1"); remove an existing moment.
6. Add a theme ("test-theme").
7. Add a character placement ("Tester" → "antagonist").
8. Save. Card re-renders with new title/hook/moments/themes/character.
9. Without editing other arcs, approve the selection.
10. Network tab: `POST /api/session/.../approve` body has both `selectedArcs: [...]` and `arcEdits: [...]` where `arcEdits[0]` matches your edits and `arcEdits[1+]` are unchanged.
11. Server log: `[checkpointArcSelection] Approved with N arcs selected`.
12. Continue pipeline. Confirm the next phase (outline generation) consumes the *edited* arc — title and hook appear in the generated outline.
13. **Negative path**: in DevTools, send approve with `arcEdits` but without `selectedArcs`. Confirm 400 error: `arcEdits requires a non-empty selectedArcs array`.
14. **Pendingedits path** (best effort): edit arc, kill the workflow mid-process by stopping the server. Restart, resume session. Confirm `state.pendingEdits.arcs` repopulates the editor on the resumed checkpoint render.

---

## Self-Review

**Spec coverage:**
- Outline rich editor: covered by Tasks 1.1–1.10. All 7 journalist sections + all 6 detective sections have inline editors. Server side already wired (no task needed). ✓
- Arc rich editor: covered by Tasks 2.1–2.4. Server side gets new `arcEdits` plumbing with TDD (2.1). UI gets per-arc editor with title/hook/moments/themes/placements (2.3). Checkpoint node verified unchanged with documentation update (2.4). ✓
- `pendingEdits` namespacing for collision-free recovery across all three checkpoints: Task 1.1. ✓
- Shared utility extraction (`editBtn`, form helpers): Task 1.2. ✓
- Server-side test coverage: Task 1.9 (outlineEdits), Task 2.1 (arcEdits). ✓

**Placeholder scan:** Task 1.8 references "the journalist examples in Tasks 1.4-1.7 give complete templates" rather than reproducing all six detective editors. Justified by repetition — each detective editor follows the exact same shape as `LedeEditor`/`ClosingEditor` with different field names. The shapes are documented at the top of Phase 1. Implementer reproduces the pattern with the data-shape map provided. If this proves insufficient, expand Task 1.8 into 6 sub-tasks (one per detective section) — the templates from 1.4–1.7 cover every UI pattern needed.

**Type consistency:**
- `editingBlock` discriminated union: `{ type: 'section', key: string }` (most cases), `{ type: 'theStoryArc', key: number }`, `{ type: 'theStoryInterweaving', key: 'interweaving' }`, `{ type: 'pullQuotesAll', key: 'all' }`, `{ type: 'namedSection', key: string }` for Outline. For ArcSelection: `editingArcId: string | null` (simpler scalar — no need for discriminated union since only one editor type per checkpoint). Consistent within each component.
- `pendingEdits` shape: `{ article?: ContentBundle, outline?: Outline, arcs?: NarrativeArc[] }` after Task 1.1. All three checkpoint components read `pendingEdits.<key>` via the parent prop pass.
- `saveSectionEdit(sectionKey, updatedSection)` (Outline) replaces a top-level outline key. `saveTheStoryArc(arcIdx, updatedArc)` and `saveInterweaving(text)` are nested helpers. `saveArcEdit(arcId, updates)` (ArcSelection) finds-by-id and merges.
- `onApprove` payload shapes:
  - Article: `{ article: true, articleEdits?: ContentBundle }`
  - Outline: `{ outline: true, outlineEdits?: Outline }`
  - ArcSelection: `{ selectedArcs: string[], arcEdits?: NarrativeArc[] }` (note: arcs differ — selection is required, edits are optional rider)

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-26-checkpoint-rich-editor-parity.md`.

**Two execution options:**

1. **Subagent-Driven (recommended for this plan).** I dispatch a fresh subagent per task, review the diff and run tests between tasks, and you approve before each subsequent dispatch. Best fit here because the plan spans many tasks (12+) and benefits from explicit review checkpoints between subsystems.

2. **Inline Execution.** I work tasks sequentially in this session. Faster end-to-end but harder to course-correct mid-flight.

Which approach? My recommendation is to ship Phase 1 (Outline) and Phase 2 (Arcs) as separate execution sessions — they're independently shippable and the diff for Outline alone is sizeable.
