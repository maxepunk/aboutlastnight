# Journalist Name Field Unification & Session ID Relaxation

**Date:** 2026-03-29
**Status:** Design approved, pending implementation

## Problem

The journalist/reporter name has two field names (`journalistName` and `journalistFirstName`) flowing through the pipeline with an unclear merge chain. The UI displays the wrong one, there's no explicit input mechanism, and session IDs are unnecessarily restricted to 4-digit MMDD format.

### Specific Issues

1. **Naming inconsistency:** `journalistName` (set in Step 1, always "Cassandra") vs `journalistFirstName` (merged in `mergeDirectorOverrides`, actually used downstream).
2. **UI displays wrong field:** `InputReview.js` shows `sessionConfig.journalistName` (always "Cassandra"), not the resolved `journalistFirstName`.
3. **No explicit input:** The only way to set a non-Cassandra name is via AI extraction from freetext director notes — fragile and invisible.
4. **Session ID over-constrained:** Frontend enforces exactly 4 digits (`/^\d{4}$/`), but the server and data directory system work with any string.

## Approach

**Unified field rename** — kill `journalistName` entirely, canonicalize on `journalistFirstName` everywhere. Add an explicit UI input on SessionStart. Relax session ID validation.

## Design

### 1. SessionStart UI Changes

**Session ID relaxation:**
- Remove digit-only stripping (`replace(/\D/g, '')`) and 4-char cap (`.slice(0, 4)`)
- New validation regex: `/^[a-zA-Z0-9-]{1,30}$/` (alphanumeric + hyphens, 1-30 chars)
- Remove `maxLength: 4` HTML attribute
- Keep placeholder `'1221'` (still valid, just not the only format)
- Update subtitle to: *"Enter a session ID (e.g. 1221, march-15-matinee)"*
- Default photos path derivation (`'data/' + sessionId + '/photos'`) unchanged

**Journalist name field (conditional):**
- New state: `const [reporterName, setReporterName] = React.useState('')`
- Text input rendered below session ID, above photos path
- Label: "Reporter First Name", placeholder: "Cassandra"
- Only rendered when `theme === 'journalist'`
- Passed into `rawSessionInput` via `buildRawInput()`: `raw.journalistFirstName = reporterName.trim() || 'Cassandra'`
- No validation beyond trimming — any non-empty string is valid, blank defaults to "Cassandra"

**Session ID input styling:**
- Remove oversized monospace styling (`fontSize: '1.5rem'`, `letterSpacing: '0.3em'`, `textAlign: 'center'`) — designed for 4-digit codes, looks wrong with longer IDs
- Use standard input styling consistent with the reporter name field

### 2. Field Unification (Backend)

**`input-nodes.js` changes:**

| Location | Change |
|----------|--------|
| Line 442 (`result.journalistName = 'Cassandra'`) | Remove — value now comes from `rawSessionInput.journalistFirstName` |
| Step 1 parsing result | Add: `result.journalistFirstName = rawInput.journalistFirstName \|\| 'Cassandra'` |
| Lines 211-214 (`DIRECTOR_NOTES_SCHEMA`) | Remove `journalistFirstName` property — AI no longer extracts it |
| Line 520 (extraction instruction) | Remove instruction telling Claude to extract journalist name from notes |
| Line 373 (`mergeDirectorOverrides`) | Simplify to `journalistFirstName: sessionConfig.journalistFirstName` — no director notes override, no fallback chain |

**Single source of truth:** SessionStart provides the value. `mergeDirectorOverrides` preserves it. No AI extraction, no layered fallbacks.

**No changes needed in:**
- `prompt-builder.js` — already reads `sessionConfig.journalistFirstName`
- `lib/theme-config.js` — doesn't reference either field
- Template `.hbs` files — use Handlebars context
- Prompt `.md` files — use `{{JOURNALIST_FIRST_NAME}}` template variable

### 3. UI Display Fixes & E2E

**InputReview.js (lines 39-41):**
- Change `sessionConfig.journalistName` to `sessionConfig.journalistFirstName`

**e2e-walkthrough.js (line 1645):**
- Change `sessionConfig.journalistName` to `sessionConfig.journalistFirstName`

### 4. Test Updates

**`input-nodes-schema.test.js`:**
- Update tests referencing `journalistName` in sessionConfig to use `journalistFirstName`
- Remove tests for director-notes-extraction fallback chain (no longer exists)
- Keep tests verifying default is `'Cassandra'` when field is blank/missing

**`prompt-builder.test.js`:**
- No changes — already uses `journalistFirstName`

### 5. Documentation Updates

| File | Change |
|------|--------|
| `docs/PIPELINE_DEEP_DIVE.md` (line 256) | `journalistName` → `journalistFirstName` in sessionConfig shape |
| `.claude/skills/journalist-report/references/schemas.md` (line 216) | `"journalistName"` → `"journalistFirstName"` |
| `.claude/agents/journalist-evidence-curator.md` (line 106) | Same rename |
| `CLAUDE.md` | Update if it references the field name |

## Data Flow (After)

```
SessionStart UI
  journalistFirstName input (or blank → "Cassandra")
       ↓
  buildRawInput() → rawSessionInput.journalistFirstName
       ↓
parseRawInput Step 1
  result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra'
       ↓
mergeDirectorOverrides
  passes through sessionConfig.journalistFirstName (no override)
       ↓
PromptBuilder
  JOURNALIST_FIRST_NAME variable resolved
       ↓
Byline: "{journalistFirstName} Nova | NovaNews"
       ↓
Template → Final HTML
```

## Resume Behavior

When resuming an existing session, SessionStart does not re-run input parsing. The `journalistFirstName` is already persisted in the checkpointed state from the original start. No special handling needed — the value lives in the saved sessionConfig.

## Out of Scope

- Changing "Nova" (last name / NPC identity) — hardcoded, not configurable
- Detective theme narrator name — always "Det. Anondono"
- `guestReporter` field — unrelated, unchanged
- `reportingMode` field — unrelated, unchanged
