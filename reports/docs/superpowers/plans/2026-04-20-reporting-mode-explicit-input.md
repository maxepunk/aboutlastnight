# Reporting Mode & Guest Reporter — Explicit Input Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Haiku extraction of `reportingMode` and `guestReporter` with explicit SessionStart UI inputs, mirroring the 2026-03-29 `journalistFirstName` fix pattern.

**Architecture:** Three layers. (1) Backend (`input-nodes.js`) — strip extraction from `DIRECTOR_NOTES_SCHEMA` + Step 3 prompt, stamp fields onto `sessionConfig` in Step 1 from `rawInput`, reduce `mergeDirectorOverrides` to a passthrough. (2) Frontend (`SessionStart.js`) — add reporting-mode radio (required, defaults on-site) and optional guest-reporter collapsible. (3) Display (`InputReview.js`) — add two read-only rows for verification before `arc-analysis` runs.

**Tech Stack:** Node.js + Jest (backend), React 18 via CDN/Babel (frontend — no unit tests for components per codebase conventions).

**Spec:** `docs/superpowers/specs/2026-04-20-reporting-mode-explicit-input-design.md`

---

## File Structure

**Backend (tested):**
- Modify: `lib/workflow/nodes/input-nodes.js` — schema + Step 1 + Step 3 prompt + `mergeDirectorOverrides`
- Modify: `lib/__tests__/input-nodes-schema.test.js` — delete extraction tests, add passthrough tests

**Frontend (manual test):**
- Modify: `console/components/SessionStart.js` — state, JSX, `buildRawInput()`
- Modify: `console/components/checkpoints/InputReview.js` — two display rows

---

### Task 1: Backend — Strip AI extraction, stamp from rawInput (TDD)

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js` (lines 206-219, 365-371, 437, 514-515)
- Modify: `lib/__tests__/input-nodes-schema.test.js` (full rewrite)

- [ ] **Step 1: Rewrite the test file to assert new behavior**

Replace the entire contents of `lib/__tests__/input-nodes-schema.test.js` with:

```javascript
const { _testing } = require('../workflow/nodes/input-nodes');
const { DIRECTOR_NOTES_SCHEMA } = _testing;

describe('DIRECTOR_NOTES_SCHEMA — reverted to observations-only', () => {
  it('should NOT include reportingMode (now sourced from rawInput)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.reportingMode).toBeUndefined();
  });

  it('should NOT include guestReporter (now sourced from rawInput)', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.guestReporter).toBeUndefined();
  });

  it('should still include observations property', () => {
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations).toBeDefined();
    expect(DIRECTOR_NOTES_SCHEMA.properties.observations.type).toBe('object');
  });

  it('should still require observations', () => {
    expect(DIRECTOR_NOTES_SCHEMA.required).toEqual(['observations']);
  });
});

describe('mergeDirectorOverrides — passthrough behavior', () => {
  const { mergeDirectorOverrides } = _testing;

  it('should return sessionConfig unchanged when directorNotes is present', () => {
    const sessionConfig = {
      roster: ['Alex'],
      journalistFirstName: 'Cassandra',
      reportingMode: 'remote',
      guestReporter: { name: 'Ashe Motoko', role: 'Guest Reporter' }
    };
    const directorNotes = { observations: { behaviorPatterns: [] } };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged).toEqual(sessionConfig);
  });

  it('should preserve reportingMode from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.reportingMode).toBe('remote');
  });

  it('should preserve guestReporter from sessionConfig', () => {
    const guest = { name: 'Ashe Motoko', role: 'Guest Reporter' };
    const sessionConfig = { roster: ['Alex'], guestReporter: guest };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.guestReporter).toEqual(guest);
  });

  it('should NOT pull reportingMode from directorNotes (extraction removed)', () => {
    const sessionConfig = { roster: ['Alex'], reportingMode: 'on-site' };
    const directorNotes = { observations: {}, reportingMode: 'remote' };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.reportingMode).toBe('on-site');
  });

  it('should NOT pull guestReporter from directorNotes (extraction removed)', () => {
    const sessionConfig = { roster: ['Alex'], guestReporter: null };
    const directorNotes = {
      observations: {},
      guestReporter: { name: 'Fake', role: 'X' }
    };
    const merged = mergeDirectorOverrides(sessionConfig, directorNotes);
    expect(merged.guestReporter).toBeNull();
  });

  it('should handle null directorNotes without adding default fields', () => {
    const sessionConfig = { roster: ['Alex'] };
    const merged = mergeDirectorOverrides(sessionConfig, null);
    expect(merged).toEqual(sessionConfig);
  });

  it('should preserve journalistFirstName from sessionConfig', () => {
    const sessionConfig = { roster: ['Alex'], journalistFirstName: 'Athena' };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.journalistFirstName).toBe('Athena');
  });

  it('should preserve arbitrary existing sessionConfig fields', () => {
    const sessionConfig = {
      roster: ['Alex', 'Sam'],
      sessionId: '0307',
      journalistFirstName: 'Cassandra',
      reportingMode: 'on-site',
      guestReporter: null
    };
    const merged = mergeDirectorOverrides(sessionConfig, { observations: {} });
    expect(merged.roster).toEqual(['Alex', 'Sam']);
    expect(merged.sessionId).toBe('0307');
    expect(merged.reportingMode).toBe('on-site');
  });
});

describe('shellAccounts state propagation', () => {
  it('shellAccounts should NOT be in mergeDirectorOverrides output (separate data path)', () => {
    const { mergeDirectorOverrides } = _testing;
    const merged = mergeDirectorOverrides({ roster: ['Alex'] }, { observations: {} });
    expect(merged.shellAccounts).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`

Expected: Multiple failures. The `DIRECTOR_NOTES_SCHEMA` tests should fail because `reportingMode` and `guestReporter` properties still exist on the schema. The `mergeDirectorOverrides` tests should fail because the current function overwrites those fields with directorNotes values / defaults instead of passing through.

- [ ] **Step 3: Delete `reportingMode` and `guestReporter` from `DIRECTOR_NOTES_SCHEMA`**

In `lib/workflow/nodes/input-nodes.js`, delete lines 206-219 (inclusive — the `reportingMode` property block and the `guestReporter` property block):

```javascript
    reportingMode: {
      type: 'string',
      enum: ['on-site', 'remote'],
      description: 'Whether the journalist was physically present (on-site) or receiving tips remotely (remote). Infer from director notes.'
    },
    guestReporter: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        role: { type: 'string' }
      },
      required: ['name'],
      description: 'If a player or NPC is credited as guest/co-reporter, extract their name and role here.'
    }
```

The preceding `notableMoments` property block now needs a trailing comma removed (it was followed by `reportingMode:`). After deletion, the `observations.properties.notableMoments` block should be the last property in `observations.properties`, and the outer `properties` object should close after `observations`.

Confirm the structure is:

```javascript
const DIRECTOR_NOTES_SCHEMA = {
  type: 'object',
  required: ['observations'],
  properties: {
    observations: {
      type: 'object',
      properties: {
        behaviorPatterns: { /* ... */ },
        suspiciousCorrelations: { /* ... */ },
        notableMoments: { /* ... */ }
      }
    }
  }
};
```

- [ ] **Step 4: Simplify `mergeDirectorOverrides` to a passthrough**

In `lib/workflow/nodes/input-nodes.js`, replace the function body (lines 365-371) with:

```javascript
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return { ...sessionConfig };
}
```

The `directorNotes` parameter is kept for signature stability (callers still pass it). No-op on null/undefined directorNotes — returns a shallow copy of sessionConfig either way.

- [ ] **Step 5: Stamp `reportingMode` and `guestReporter` onto Step 1 result**

In `lib/workflow/nodes/input-nodes.js`, find the existing line:

```javascript
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
```

(Currently at line 437.) Add two lines immediately after it:

```javascript
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
    result.reportingMode = rawInput.reportingMode || 'on-site';
    result.guestReporter = rawInput.guestReporter || null;
```

- [ ] **Step 6: Remove extraction instructions from Step 3 prompt**

In `lib/workflow/nodes/input-nodes.js`, find the Step 3 directorNotesPrompt (around line 505-517). Delete bullets 4 and 5:

```
4. reportingMode: Was the journalist physically present ("on-site") or receiving tips remotely ("remote")? Look for phrases like "not on site", "received tips remotely", "was present at the scene", etc. If unclear, omit this field.
5. guestReporter: If any player or character is credited as a guest reporter, co-reporter, or contributor, extract their name and role. Only include if explicitly stated.
```

After deletion the numbered list should end at bullet 3 (`notableMoments`):

```
Categories:
1. behaviorPatterns: Observable behaviors (who talked to whom, what they did)
2. suspiciousCorrelations: Suspected connections, possible pseudonyms, theories
3. notableMoments: Key moments or events worth highlighting

Return structured JSON matching the schema.
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest lib/__tests__/input-nodes-schema.test.js -v`

Expected: All tests pass.

- [ ] **Step 8: Run full test suite to catch unintended breakage**

Run: `npx jest`

Expected: All tests pass. If any `prompt-builder.test.js` or other tests fail because they pass `reportingMode` via `directorNotes` instead of `sessionConfig`, fix by moving the field to `sessionConfig` in that test. (None are expected to fail based on inspection of `prompt-builder.test.js` — its guestReporter tests already use sessionConfig.)

- [ ] **Step 9: Commit**

```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-schema.test.js
git commit -m "refactor(input): reportingMode and guestReporter now flow from rawInput, not director-notes extraction"
```

---

### Task 2: SessionStart — Reporting Mode Radio

**Files:**
- Modify: `console/components/SessionStart.js:22,36-47,227-243`

- [ ] **Step 1: Add `reportingMode` state**

In `console/components/SessionStart.js`, after line 22 (the existing `const [reporterName, setReporterName] = React.useState('');`), add:

```javascript
  const [reportingMode, setReportingMode] = React.useState('on-site');
```

- [ ] **Step 2: Pass `reportingMode` through `buildRawInput`**

In `buildRawInput()`, extend the journalist-theme block. Change:

```javascript
    if (theme === 'journalist') {
      raw.journalistFirstName = reporterName.trim() || 'Cassandra';
    }
```

to:

```javascript
    if (theme === 'journalist') {
      raw.journalistFirstName = reporterName.trim() || 'Cassandra';
      raw.reportingMode = reportingMode;
    }
```

- [ ] **Step 3: Add the radio group JSX**

Find the Reporter First Name input group in the JSX (lines 227-243, starts with `// Reporter First Name (journalist theme only)`). Immediately after its closing `)` (the closing of the outer `React.createElement('div', ...)` for reporter-name), insert a new sibling block:

```javascript
    // Reporting Mode (journalist theme only)
    theme === 'journalist' && React.createElement('div', { className: 'session-start__input-group mt-md' },
      React.createElement('label', { className: 'form-label' }, 'Reporting Mode'),
      React.createElement('div', { className: 'flex gap-md mt-xs', role: 'radiogroup', 'aria-label': 'Whether Nova was physically present at the investigation' },
        React.createElement('label', { className: 'flex gap-sm items-center text-sm' },
          React.createElement('input', {
            type: 'radio',
            name: 'reporting-mode',
            value: 'on-site',
            checked: reportingMode === 'on-site',
            onChange: () => setReportingMode('on-site'),
            disabled: loading
          }),
          React.createElement('span', null, 'On-site')
        ),
        React.createElement('label', { className: 'flex gap-sm items-center text-sm' },
          React.createElement('input', {
            type: 'radio',
            name: 'reporting-mode',
            value: 'remote',
            checked: reportingMode === 'remote',
            onChange: () => setReportingMode('remote'),
            disabled: loading
          }),
          React.createElement('span', null, 'Remote')
        )
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'On-site: Nova physically present at investigation. Remote: receiving tips remotely.'
      )
    ),
```

Insert order: Reporter First Name → **Reporting Mode** → (Task 3 will add Guest Reporter here) → Photos Path.

- [ ] **Step 4: Test manually**

1. Start the server: `npm start`
2. Open `http://localhost:3001/console`
3. Verify the Reporting Mode radio group appears when "NovaNews Article" is selected, disappears for "Detective Case Report"
4. Select "Remote", open DevTools Network tab, click "Start Fresh" on a throwaway session ID (e.g. `test-remote-1`). Verify the POST body to `/api/session/test-remote-1/start` contains `"reportingMode": "remote"` in `rawSessionInput`
5. Cancel / close before providing other inputs. Repeat with "On-site" selected — verify `"reportingMode": "on-site"`

- [ ] **Step 5: Commit**

```bash
git add console/components/SessionStart.js
git commit -m "feat(console): add reporting-mode radio to SessionStart (journalist theme)"
```

---

### Task 3: SessionStart — Optional Guest Reporter

**Files:**
- Modify: `console/components/SessionStart.js` (state block + JSX insertion after Reporting Mode group)

- [ ] **Step 1: Add `guestReporterName` and `guestReporterRole` state**

After the `reportingMode` state line from Task 2, add:

```javascript
  const [guestReporterName, setGuestReporterName] = React.useState('');
  const [guestReporterRole, setGuestReporterRole] = React.useState('');
```

- [ ] **Step 2: Extend `buildRawInput` to include guest reporter**

In `buildRawInput()`, extend the journalist-theme block. The block now looks like:

```javascript
    if (theme === 'journalist') {
      raw.journalistFirstName = reporterName.trim() || 'Cassandra';
      raw.reportingMode = reportingMode;
      if (guestReporterName.trim()) {
        raw.guestReporter = {
          name: guestReporterName.trim(),
          role: guestReporterRole.trim() || 'Guest Reporter'
        };
      }
    }
```

When the name field is blank, `raw.guestReporter` is not set at all (undefined). The backend defaults it to `null` (Task 1, Step 5). When set, role defaults to `"Guest Reporter"` on blank submit.

- [ ] **Step 3: Add the Guest Reporter collapsible JSX**

Immediately after the Reporting Mode radio group block (inserted in Task 2 Step 3), add:

```javascript
    // Guest Reporter (journalist theme only, optional, collapsed by default)
    theme === 'journalist' && React.createElement('div', { className: 'mt-sm' },
      React.createElement(CollapsibleSection, {
        title: 'Guest Reporter (Optional)',
        defaultOpen: false
      },
        React.createElement('div', { className: 'session-start__input-group' },
          React.createElement('label', { htmlFor: 'guest-reporter-name' }, 'Name'),
          React.createElement('input', {
            id: 'guest-reporter-name',
            type: 'text',
            className: 'input',
            placeholder: 'e.g. Ashe Motoko',
            value: guestReporterName,
            onChange: (e) => setGuestReporterName(e.target.value),
            disabled: loading,
            'aria-label': 'Name of the player or character credited as guest reporter'
          })
        ),
        React.createElement('div', { className: 'session-start__input-group mt-sm' },
          React.createElement('label', { htmlFor: 'guest-reporter-role' }, 'Role'),
          React.createElement('input', {
            id: 'guest-reporter-role',
            type: 'text',
            className: 'input',
            placeholder: 'Guest Reporter',
            value: guestReporterRole,
            onChange: (e) => setGuestReporterRole(e.target.value),
            disabled: loading,
            'aria-label': 'Role or title of the guest reporter'
          }),
          React.createElement('p', { className: 'text-muted text-xs mt-xs' },
            'Leave Name blank to omit. Role defaults to "Guest Reporter" if blank.'
          )
        )
      )
    ),
```

`CollapsibleSection` is already destructured at the top of the file — no new imports needed.

- [ ] **Step 4: Test manually**

1. Reload `http://localhost:3001/console`
2. Verify "Guest Reporter (Optional)" collapsible appears below the Reporting Mode radio group on the journalist theme, and is absent on the detective theme
3. Default collapsed. Click to expand — Name and Role fields appear
4. With fields left blank, click "Start Fresh" on throwaway session `test-guest-1`. DevTools Network: verify POST body has NO `guestReporter` key in `rawSessionInput`
5. Enter Name="Ashe Motoko", leave Role blank. Start throwaway session. Verify POST body contains `"guestReporter": { "name": "Ashe Motoko", "role": "Guest Reporter" }`
6. Enter Name="Ashe Motoko", Role="Co-Reporter". Verify POST body contains `"guestReporter": { "name": "Ashe Motoko", "role": "Co-Reporter" }`

- [ ] **Step 5: Commit**

```bash
git add console/components/SessionStart.js
git commit -m "feat(console): add optional guest-reporter collapsible to SessionStart"
```

---

### Task 4: InputReview — Read-only Display Rows

**Files:**
- Modify: `console/components/checkpoints/InputReview.js:39-42`

- [ ] **Step 1: Add reporting-mode and guest-reporter display rows**

In `console/components/checkpoints/InputReview.js`, find the existing journalist display line (lines 39-42):

```javascript
        sessionConfig.journalistFirstName && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Journalist: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.journalistFirstName)
        ),
```

Immediately after the closing `),`, add two new sibling spans:

```javascript
        sessionConfig.reportingMode && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Reporting Mode: '),
          React.createElement('span', { className: 'text-secondary' }, sessionConfig.reportingMode)
        ),
        sessionConfig.guestReporter && React.createElement('span', { className: 'text-sm' },
          React.createElement('span', { className: 'text-muted' }, 'Guest Reporter: '),
          React.createElement('span', { className: 'text-secondary' },
            sessionConfig.guestReporter.name + ' | ' + (sessionConfig.guestReporter.role || 'Guest Reporter')
          )
        ),
```

Both rows guard on their field: `reportingMode` will always be truthy (defaults to `'on-site'` per Task 1 Step 5), but keeping the guard matches the existing pattern. `guestReporter` is `null` when absent, so the row is skipped.

- [ ] **Step 2: Test manually**

1. With the server running, start a fresh journalist-theme session with Reporting Mode = "Remote" and Guest Reporter Name = "Ashe Motoko", Role = "Co-Reporter"
2. Provide all required inputs so the pipeline reaches the `input-review` checkpoint
3. Verify the Session Info section displays:
   - `Session ID: <id>`
   - `Journalist: Cassandra`
   - `Reporting Mode: remote`
   - `Guest Reporter: Ashe Motoko | Co-Reporter`
4. Start another session with Reporting Mode = "On-site" and no guest reporter. At `input-review`:
   - `Reporting Mode: on-site` appears
   - Guest Reporter row does NOT appear

- [ ] **Step 3: Commit**

```bash
git add console/components/checkpoints/InputReview.js
git commit -m "feat(console): display reportingMode and guestReporter on InputReview checkpoint"
```

---

### Task 5: End-to-End Verification

- [ ] **Step 1: Grep for any lingering extraction references**

Run: `grep -rn "reportingMode\|guestReporter" lib/workflow/nodes/input-nodes.js`

Expected output should show these remaining references (and no others in this file):
- `result.reportingMode = rawInput.reportingMode || 'on-site';` (Step 1 stamping)
- `result.guestReporter = rawInput.guestReporter || null;` (Step 1 stamping)

Should NOT show:
- The deleted schema properties
- The deleted Step 3 prompt bullets
- Any references inside `mergeDirectorOverrides`

- [ ] **Step 2: Grep prompt-builder to confirm consumers unchanged**

Run: `grep -n "reportingMode\|guestReporter" lib/prompt-builder.js`

Expected: Existing references at `:187, :190, :839, :844, :1043-1045, :1235-1236` still read from `this.sessionConfig.*`. No code changes to this file in the plan.

- [ ] **Step 3: Run the full Jest suite**

Run: `npx jest`

Expected: All tests pass.

- [ ] **Step 4: Manual integration test — remote mode flow**

1. Start server: `npm start`
2. At `http://localhost:3001/console`:
   - Theme: NovaNews Article
   - Session ID: `test-remote-e2e`
   - Reporter First Name: blank (defaults to Cassandra)
   - Reporting Mode: **Remote**
   - Guest Reporter: expand, Name = `Ashe Motoko`, Role = blank
3. Provide photos path and all required inputs through the pipeline
4. At `input-review` checkpoint, verify display:
   - Reporting Mode: remote
   - Guest Reporter: Ashe Motoko | Guest Reporter
5. Inspect `data/test-remote-e2e/inputs/session-config.json` — confirm:
   ```json
   {
     "journalistFirstName": "Cassandra",
     "reportingMode": "remote",
     "guestReporter": { "name": "Ashe Motoko", "role": "Guest Reporter" },
     ...
   }
   ```
6. Approve input-review and continue to arc-analysis. Inspect the arc-analysis prompt (via LangSmith trace or server logs) — confirm:
   - `REPORTING MODE: remote` appears in the user prompt
   - `Nova received tips remotely` appears in the observations annotation

- [ ] **Step 5: Manual integration test — default on-site flow**

1. Start a second fresh session: `test-onsite-e2e`
2. Theme: NovaNews Article. Reporting Mode: **On-site** (default, no change needed). Guest Reporter: leave collapsed.
3. Run through to `input-review`. Verify:
   - Reporting Mode: on-site
   - Guest Reporter row does NOT appear
4. Inspect `data/test-onsite-e2e/inputs/session-config.json`:
   ```json
   {
     "journalistFirstName": "Cassandra",
     "reportingMode": "on-site",
     "guestReporter": null,
     ...
   }
   ```
5. Continue to article generation. Verify the generated article uses on-site participatory language ("I was in that room", "I watched...") rather than remote language ("The tip came through...").

- [ ] **Step 6: Manual integration test — detective theme unaffected**

1. Start a third session: `test-detective-e2e`
2. Theme: Detective Case Report
3. Verify on SessionStart:
   - Reporter First Name field: NOT visible
   - Reporting Mode radio: NOT visible
   - Guest Reporter collapsible: NOT visible
4. Start the session. In DevTools Network, confirm the POST body's `rawSessionInput` does NOT contain `reportingMode`, `guestReporter`, or `journalistFirstName` keys.
5. Pipeline runs normally with detective-theme defaults.
