# Journalist Name & Session ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the journalist name field (`journalistName` → `journalistFirstName`), add a UI input for it on SessionStart, and relax session ID validation to accept alphanumeric + hyphens.

**Architecture:** Three layers of changes — frontend (SessionStart UI + InputReview display), backend (input-nodes.js field unification), and docs/tests. SessionStart becomes the single source of truth for the journalist name; AI extraction from director notes is removed.

**Tech Stack:** React 18 (CDN/Babel), Node.js, Jest

**Spec:** `docs/superpowers/specs/2026-03-29-journalist-name-and-session-id-design.md`

---

### Task 1: Relax Session ID Validation in SessionStart

**Files:**
- Modify: `console/components/SessionStart.js:29,172,205-221`

- [ ] **Step 1: Update validation regex**

In `console/components/SessionStart.js`, change line 29 from:

```javascript
const isValid = /^\d{4}$/.test(sessionId);
```

to:

```javascript
const isValid = /^[a-zA-Z0-9-]{1,30}$/.test(sessionId);
```

- [ ] **Step 2: Remove digit-only input stripping**

Change the `onChange` handler (lines 211-214) from:

```javascript
onChange: (e) => {
  const val = e.target.value.replace(/\D/g, '').slice(0, 4);
  setSessionId(val);
  setStatus('');
},
```

to:

```javascript
onChange: (e) => {
  const val = e.target.value.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 30);
  setSessionId(val);
  setStatus('');
},
```

- [ ] **Step 3: Remove maxLength and oversized styling**

Change the input element props (lines 217-220) from:

```javascript
maxLength: 4,
autoFocus: true,
disabled: loading,
style: { textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.3em' }
```

to:

```javascript
maxLength: 30,
autoFocus: true,
disabled: loading
```

- [ ] **Step 4: Update file header comment**

Change line 3 from:

```javascript
 * Session ID input (4-digit MMDD), photos path, optional whiteboard path.
```

to:

```javascript
 * Session ID input (alphanumeric + hyphens), photos path, optional whiteboard path.
```

- [ ] **Step 5: Update subtitle copy**

Change line 172 from:

```javascript
'Enter a 4-digit session ID (MMDD format) to start or resume a workflow.'
```

to:

```javascript
'Enter a session ID (e.g. 1221, march-15-matinee) to start or resume a workflow.'
```

- [ ] **Step 6: Update api.js JSDoc comment**

In `console/api.js`, change line 51 from:

```javascript
 * @param {string} sessionId - MMDD format
```

to:

```javascript
 * @param {string} sessionId - Alphanumeric + hyphens, 1-30 chars
```

- [ ] **Step 7: Test manually**

Open `http://localhost:3001/console`. Verify:
- Can type `1221` (still works)
- Can type `march-15-matinee` (new format)
- Cannot type spaces or special chars (stripped)
- Start/Resume buttons enable when input is valid
- Default photos path updates: `data/march-15-matinee/photos`

- [ ] **Step 8: Commit**

```bash
git add console/components/SessionStart.js console/api.js
git commit -m "feat: relax session ID to accept alphanumeric + hyphens (1-30 chars)"
```

---

### Task 2: Add Reporter Name Field to SessionStart

**Files:**
- Modify: `console/components/SessionStart.js:17-21,35-43,169-222`

- [ ] **Step 1: Add reporterName state**

After line 21 (`const [loading, setLoading] = React.useState(false);`), add:

```javascript
const [reporterName, setReporterName] = React.useState('');
```

- [ ] **Step 2: Pass journalistFirstName through buildRawInput**

In `buildRawInput()` (lines 35-43), add the journalist name to the raw input object. Change:

```javascript
function buildRawInput() {
    const raw = {
      photosPath: photosPath.trim() || defaultPhotosPath
    };
    if (whiteboardPath.trim()) {
      raw.whiteboardPhotoPath = whiteboardPath.trim();
    }
    return raw;
  }
```

to:

```javascript
function buildRawInput() {
    const raw = {
      photosPath: photosPath.trim() || defaultPhotosPath
    };
    if (whiteboardPath.trim()) {
      raw.whiteboardPhotoPath = whiteboardPath.trim();
    }
    if (theme === 'journalist') {
      raw.journalistFirstName = reporterName.trim() || 'Cassandra';
    }
    return raw;
  }
```

- [ ] **Step 3: Add the reporter name input field (conditional on journalist theme)**

In the return JSX, insert a new input group between the Session ID group and the Photos Path group. After the session ID `</div>` (line 222, after the closing of the `session-start__input-group` div) and before the Photos Path comment (line 224), add:

```javascript
// Reporter First Name (journalist theme only)
theme === 'journalist' && React.createElement('div', { className: 'session-start__input-group mt-md' },
  React.createElement('label', { htmlFor: 'reporter-name' }, 'Reporter First Name'),
  React.createElement('input', {
    id: 'reporter-name',
    type: 'text',
    className: 'input',
    placeholder: 'Cassandra',
    value: reporterName,
    onChange: (e) => setReporterName(e.target.value),
    disabled: loading,
    'aria-label': 'First name of the journalist character for this session'
  }),
  React.createElement('p', { className: 'text-muted text-xs mt-xs' },
    'Leave blank for default (Cassandra Nova)'
  )
),
```

- [ ] **Step 4: Test manually**

Open `http://localhost:3001/console`. Verify:
- Reporter name field appears when "NovaNews Article" theme is selected
- Reporter name field disappears when "Detective Case Report" is selected
- Typing "Athena" and starting a session sends `journalistFirstName: "Athena"` in the request body (check Network tab)
- Leaving blank sends `journalistFirstName: "Cassandra"`

- [ ] **Step 5: Commit**

```bash
git add console/components/SessionStart.js
git commit -m "feat: add reporter first name input to SessionStart (journalist theme only)"
```

---

### Task 3: Unify Backend Field — Replace journalistName with journalistFirstName

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:211-214,369-376,440-442,519-521`
- Test: `lib/__tests__/input-nodes-schema.test.js`

- [ ] **Step 1: Update tests first — remove schema test for journalistFirstName extraction**

In `lib/__tests__/input-nodes-schema.test.js`, delete lines 11-14 (the `journalistFirstName` schema test):

```javascript
  it('should include journalistFirstName property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.journalistFirstName.type).toBe('string');
  });
```

- [ ] **Step 2: Update merge tests — remove journalistName references**

In the same file, update the `mergeDirectorOverrides` tests. Replace the entire `describe('mergeDirectorOverrides', ...)` block (lines 35-95) with:

```javascript
describe('mergeDirectorOverrides', () => {
  const { mergeDirectorOverrides } = _testing;

  it('should merge reportingMode from director notes into sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Cassandra' };
    const directorNotes = {
      observations: { behaviorPatterns: [] },
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('remote');
    expect(merged.journalistFirstName).toBe('Cassandra');
    expect(merged.guestReporter).toEqual({ name: 'Ashe Motoko', role: 'Guest Reporter' });
  });

  it('should default reportingMode to on-site when not specified', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('on-site');
  });

  it('should preserve journalistFirstName from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Athena' };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.journalistFirstName).toBe('Athena');
  });

  it('should default guestReporter to null when not specified', () => {
    const sessionConfig = { roster: ['Alex'] };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.guestReporter).toBeNull();
  });

  it('should handle null directorNotes gracefully', () => {
    const result = mergeDirectorOverrides({ roster: ['Alex'] }, null);
    expect(result.reportingMode).toBe('on-site');
    expect(result.journalistFirstName).toBeUndefined();
    expect(result.guestReporter).toBeNull();
  });

  it('should preserve existing sessionConfig fields', () => {
    const sessionConfig = { roster: ['Alex', 'Sam'], sessionId: '0307', journalistFirstName: 'Cassandra' };
    const directorNotes = { observations: { behaviorPatterns: [] }, reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.roster).toEqual(['Alex', 'Sam']);
    expect(merged.sessionId).toBe('0307');
    expect(merged.reportingMode).toBe('remote');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`

Expected: Multiple failures — tests expect the new behavior but code still has old logic.

- [ ] **Step 4: Remove journalistFirstName from DIRECTOR_NOTES_SCHEMA**

In `lib/workflow/nodes/input-nodes.js`, delete lines 211-214:

```javascript
    journalistFirstName: {
      type: 'string',
      description: 'First name of the journalist NPC for this session, if explicitly mentioned.'
    },
```

- [ ] **Step 5: Simplify mergeDirectorOverrides**

Change lines 369-376 from:

```javascript
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return {
    ...sessionConfig,
    reportingMode: directorNotes?.reportingMode ?? 'on-site',
    journalistFirstName: directorNotes?.journalistFirstName ?? sessionConfig?.journalistName ?? 'Cassandra',
    guestReporter: directorNotes?.guestReporter || null
  };
}
```

to:

```javascript
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return {
    ...sessionConfig,
    reportingMode: directorNotes?.reportingMode ?? 'on-site',
    guestReporter: directorNotes?.guestReporter || null
  };
}
```

The `journalistFirstName` field is now passed through via `...sessionConfig` — set during Step 1 parsing, no override needed.

- [ ] **Step 6: Replace journalistName with journalistFirstName in Step 1 parsing**

Change line 442 from:

```javascript
    result.journalistName = 'Cassandra'; // Default journalist NPC name
```

to:

```javascript
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
```

- [ ] **Step 7: Remove journalistFirstName extraction instruction from Step 3 prompt**

In the director notes prompt (lines 519-521), change:

```
4. reportingMode: Was the journalist physically present ("on-site") or receiving tips remotely ("remote")? Look for phrases like "not on site", "received tips remotely", "was present at the scene", etc. If unclear, omit this field.
5. journalistFirstName: The journalist's first name if explicitly mentioned. If not mentioned, omit this field.
6. guestReporter: If any player or character is credited as a guest reporter, co-reporter, or contributor, extract their name and role. Only include if explicitly stated.
```

to:

```
4. reportingMode: Was the journalist physically present ("on-site") or receiving tips remotely ("remote")? Look for phrases like "not on site", "received tips remotely", "was present at the scene", etc. If unclear, omit this field.
5. guestReporter: If any player or character is credited as a guest reporter, co-reporter, or contributor, extract their name and role. Only include if explicitly stated.
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`

Expected: All tests pass.

- [ ] **Step 9: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "refactor: unify journalistName → journalistFirstName, remove AI extraction"
```

---

### Task 4: Fix UI Display and E2E References

**Files:**
- Modify: `console/components/checkpoints/InputReview.js:39-41`
- Modify: `scripts/e2e-walkthrough.js:1645`

- [ ] **Step 1: Fix InputReview display**

In `console/components/checkpoints/InputReview.js`, change lines 39-41 from:

```javascript
        sessionConfig.journalistName && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Journalist: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.journalistName)
        ),
```

to:

```javascript
        sessionConfig.journalistFirstName && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Journalist: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.journalistFirstName)
        ),
```

- [ ] **Step 2: Fix e2e-walkthrough display**

In `scripts/e2e-walkthrough.js`, change line 1645 from:

```javascript
  displayField('Journalist', sessionConfig.journalistName, { indent: 2 });
```

to:

```javascript
  displayField('Journalist', sessionConfig.journalistFirstName, { indent: 2 });
```

- [ ] **Step 3: Commit**

```bash
git add console/components/checkpoints/InputReview.js scripts/e2e-walkthrough.js
git commit -m "fix: display journalistFirstName in InputReview and e2e walkthrough"
```

---

### Task 5: Update Documentation

**Files:**
- Modify: `docs/PIPELINE_DEEP_DIVE.md:256`
- Modify: `.claude/skills/journalist-report/references/schemas.md:216`
- Modify: `.claude/agents/journalist-evidence-curator.md:106`

- [ ] **Step 1: Update PIPELINE_DEEP_DIVE.md**

Change line 256 from:

```markdown
- `sessionConfig`: { roster, accusation, journalistName, photosPath }
```

to:

```markdown
- `sessionConfig`: { roster, accusation, journalistFirstName, photosPath }
```

- [ ] **Step 2: Update schemas.md**

In `.claude/skills/journalist-report/references/schemas.md`, change line 216 from:

```json
    "journalistName": "Cassandra",
```

to:

```json
    "journalistFirstName": "Cassandra",
```

- [ ] **Step 3: Update journalist-evidence-curator.md**

In `.claude/agents/journalist-evidence-curator.md`, change line 106 from:

```json
    "journalistName": "Cassandra",
```

to:

```json
    "journalistFirstName": "Cassandra",
```

- [ ] **Step 4: Commit**

```bash
git add docs/PIPELINE_DEEP_DIVE.md .claude/skills/journalist-report/references/schemas.md .claude/agents/journalist-evidence-curator.md
git commit -m "docs: update journalistName → journalistFirstName in pipeline docs and schemas"
```

---

### Task 6: End-to-End Verification

- [ ] **Step 1: Run full test suite**

Run: `npx jest --verbose`

Expected: All tests pass. No remaining references to `journalistName` in test expectations.

- [ ] **Step 2: Grep for stale references**

Run: `grep -rn "journalistName" --include="*.js" --include="*.md" lib/ console/ scripts/ server.js`

Verify: No remaining `journalistName` references in production code. Matches in `docs/superpowers/plans/` and `docs/superpowers/specs/` are expected (historical design docs).

- [ ] **Step 3: Manual integration test**

Start server (`npm start`), open console, and run through:
1. Select journalist theme
2. Enter session ID: `test-reporter-name`
3. Enter reporter name: `Athena`
4. Start fresh session
5. Verify at `input-review` checkpoint: shows "Journalist: Athena"
6. Check `data/test-reporter-name/inputs/session-config.json` contains `"journalistFirstName": "Athena"`

- [ ] **Step 4: Test default behavior**

Repeat step 3 but leave reporter name blank. Verify:
- `input-review` shows "Journalist: Cassandra"
- `session-config.json` contains `"journalistFirstName": "Cassandra"`

- [ ] **Step 5: Test detective theme**

Select detective theme. Verify:
- Reporter name field is not visible
- Session starts without `journalistFirstName` in rawSessionInput
