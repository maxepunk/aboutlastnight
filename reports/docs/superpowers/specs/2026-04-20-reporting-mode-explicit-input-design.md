# Reporting Mode & Guest Reporter — Explicit Input

**Date:** 2026-04-20
**Status:** Design approved, pending implementation

## Problem

Two journalist-theme session fields — `reportingMode` (on-site/remote) and `guestReporter` — are populated only via Haiku extraction from freetext director notes (`DIRECTOR_NOTES_SCHEMA` in `lib/workflow/nodes/input-nodes.js:206-219`, prompt at `:514-515`). If the director doesn't write phrases like *"not on site"* or *"received tips remotely"* in their notes, the pipeline silently defaults to `on-site` and `null` respectively.

The article generator then writes with first-person physical-presence language ("I was in that room," "I watched Marcus…") regardless of whether Nova was actually on-site. There is no UI input and no checkpoint surface to verify or override the parsed value before `arc-analysis` runs.

This is the exact "fragile and invisible" failure mode the 2026-03-29 journalist-name spec called out and fixed for `journalistFirstName`. The same fix pattern applies.

## Approach

**Single source of truth from SessionStart.** Add explicit UI controls on the session-start screen for `reportingMode` (required, radio) and `guestReporter` (optional, expand-to-reveal). Rip out AI extraction entirely. Leave `mergeDirectorOverrides` as a passthrough. Surface the resolved values read-only on the `input-review` checkpoint to close the confirmation loop.

## Design

### 1. SessionStart UI Changes

Three new controls rendered only when `theme === 'journalist'`, grouped below the existing Reporter Name field.

**Reporting Mode** (radio group, required, defaults to `on-site`):
- `( ) On-site` — Nova was physically at the investigation
- `( ) Remote` — Nova received tips remotely

**Guest Reporter** (optional, collapsed by default):
- Small "+ Add guest reporter" link/button that expands two text inputs
- Name field — placeholder `"e.g. Ashe Motoko"`
- Role field — placeholder `"Guest Reporter"`, defaults to `"Guest Reporter"` on blank submit

**State additions:**
```js
const [reportingMode, setReportingMode] = React.useState('on-site');
const [guestReporterName, setGuestReporterName] = React.useState('');
const [guestReporterRole, setGuestReporterRole] = React.useState('');
const [showGuestReporter, setShowGuestReporter] = React.useState(false);
```

**`buildRawInput()` extensions (journalist theme only):**
```js
raw.reportingMode = reportingMode;
if (guestReporterName.trim()) {
  raw.guestReporter = {
    name: guestReporterName.trim(),
    role: guestReporterRole.trim() || 'Guest Reporter'
  };
}
```

Rationale for collapsed guest-reporter UI: in the vast majority of sessions the field is null; rendering empty name/role inputs by default adds visual noise. The expand-on-click pattern keeps the happy path clean without hiding the feature.

### 2. Backend Changes — `lib/workflow/nodes/input-nodes.js`

Four surgical edits, mirroring the 2026-03-29 journalist-name pattern.

**Edit A — Step 1 parsing (around line 437):**

Stamp the fields onto sessionConfig from `rawInput`, alongside the existing `journalistFirstName` line:

```js
result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
result.reportingMode = rawInput.reportingMode || 'on-site';
result.guestReporter = rawInput.guestReporter || null;
```

**Edit B — `DIRECTOR_NOTES_SCHEMA` (lines 206-219):**

Delete the `reportingMode` and `guestReporter` properties. Schema reverts to pure observations (`behaviorPatterns`, `suspiciousCorrelations`, `notableMoments`).

**Edit C — Step 3 prompt (lines 514-515):**

Delete the two extraction-instruction bullets (`4. reportingMode:` and `5. guestReporter:`). Haiku no longer guesses at these from freetext.

**Edit D — `mergeDirectorOverrides` (lines 365-371):**

Simplify to a passthrough:

```js
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return { ...sessionConfig };
}
```

Function is kept (not deleted) as a named extension point for minimal blast radius. Can be inlined later if no override logic returns.

### 3. InputReview Display (`console/components/checkpoints/InputReview.js`)

Add two read-only rows in the header block where `journalistFirstName` already displays:

```
Journalist: Cassandra
Reporting Mode: on-site
Guest Reporter: Ashe Motoko | Guest Reporter   ← only rendered when non-null
```

Pure display, no edit affordance. Read from `sessionConfig.reportingMode` and `sessionConfig.guestReporter`.

### 4. Data Flow (After)

```
SessionStart UI
  reportingMode radio (on-site | remote)
  guestReporter optional inputs (name + role)
       ↓
  buildRawInput() → rawSessionInput.{reportingMode, guestReporter}
       ↓
parseRawInput Step 1
  result.reportingMode = rawInput.reportingMode || 'on-site'
  result.guestReporter = rawInput.guestReporter || null
       ↓
mergeDirectorOverrides (passthrough)
       ↓
sessionConfig → PromptBuilder
       ↓
Arc analysis, article generation, byline — unchanged consumers
```

### 5. Tests (`lib/__tests__/input-nodes-schema.test.js`)

**Delete:**
- Any schema test asserting `DIRECTOR_NOTES_SCHEMA.properties.reportingMode` or `.guestReporter` exists
- `mergeDirectorOverrides` tests that exercise reportingMode/guestReporter extraction from director notes

**Add:**
- `mergeDirectorOverrides` returns sessionConfig unchanged (passthrough — structural equality with the input sessionConfig, no added keys)
- Step 1 parsing path stamps `reportingMode` and `guestReporter` from `rawInput`
- Step 1 defaults: `reportingMode` → `'on-site'` when rawInput omits it; `guestReporter` → `null` when rawInput omits it

No changes to `prompt-builder.test.js` — its guestReporter byline tests already pass the field via sessionConfig and remain correct.

### 6. Documentation Updates

- `docs/PIPELINE_DEEP_DIVE.md` — if it documents `reportingMode` / `guestReporter` as AI-extracted, update to "explicit SessionStart input"
- `reports/CLAUDE.md` — update `sessionConfig` field description if it enumerates extraction sources
- `.claude/skills/journalist-report/references/prompts/character-voice.md` — **no changes**; the `{{REPORTING_MODE}}` variable still resolves identically, just sourced from explicit input

## Consumers Left Untouched

- `lib/prompt-builder.js` — already reads `this.sessionConfig.reportingMode` and `this.sessionConfig.guestReporter` correctly (arc analysis header at `:187,:190`, temporal discipline at `:839,:844`, byline at `:1043-1045`, `{{REPORTING_MODE}}` resolver at `:1235-1236`)
- `lib/theme-config.js` — doesn't reference either field
- Template `.hbs` files — use Handlebars context
- Prompt `.md` files — use template variables

## Resume Behavior

Resuming a session does not re-run `parseRawInput`. Any in-progress session already has `reportingMode` and `guestReporter` stamped onto its persisted `sessionConfig` by the old code path (Haiku extraction + `mergeDirectorOverrides` default layering). After the fix, those values remain on state and flow unchanged into downstream prompts. No migration needed.

## Out of Scope

- Renaming `Nova` (hardcoded NPC surname)
- Detective theme narrator (`Det. Anondono`, hardcoded)
- Edit affordance on `input-review` (display only)
- Separate override mechanism at `input-review` (Option C from brainstorming — rejected for scope)
- Relaxing `reportingMode` to more than two values (binary by design)
