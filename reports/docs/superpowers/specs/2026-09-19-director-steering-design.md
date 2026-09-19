# Director steering before the first fall-run session — design

Date: 2026-09-19. Branch: `feat/director-steering` off `main` (`f5f5c46`).
Status: approved in conversation section by section; adversarial review pending.

## 1. Why

The five measured sessions (baseline, 2026-09-18) show the director making 20–41 hand
edits per report AFTER publication, because the console's intervention points did not
match how the director needs to intervene. Two kinds of intervention exist: change this
text (a hand edit) and "this piece is wrong for these reasons, rework it" (guidance).
The console forces one or the other per round, at whole-phase scope, and forgets the
guidance one phase later.

The first fall-run session ran on 2026-09-18 and its report is due within 48 hours.
The prompt-restructure work (problem 4) must NOT start before that run: the run is the
"before" measurement on current code. But the intervention plumbing can be strengthened
first, because it changes how well the director can steer, not what the prompts say.

This spec covers four changes, all approved:

1. A per-call prompt/response log on disk (instrumentation for the prompt work).
2. Reject with hand edits pending: the edits travel with the note, the reviser starts
   from the edited version, sees what was edited, and the gate reports if it undid one.
3. Director gate notes: every note the director writes at a gate is kept and shown to
   every later writer and reviser.
4. A thesis surface at the outline gate (edit) and the article gate (read).

Decisions taken in conversation (do not reopen):

- Hand edits under rework: **instruct and verify** (option C). No code override.
- Gate notes: **every note, in order, labeled by gate and round** (option B).
- Thesis edit: **its own three-field editor** at the outline gate (option A).

## 2. Constraints

- No `npm install` / `npm update` / `npm ci`. LangGraph 1.0.7 pinned.
- No change to any craft rule, prompt file under `.claude/skills/*/references/prompts/`,
  model pin, or effort level. The only prompt text this spec adds is the two blocks in
  §4.3 and §5.3. §7.3 enforces this with a render-diff.
- No Claude API/SDK calls from tests. Existing mocks in `__tests__/mocks/`.
- Full suite (`npx jest`) before every commit, exit code guarded. Baseline at branch
  point: 138 suites / 2147 tests green.
- Every state field a node returns must be declared in `lib/workflow/state.js`
  (LangGraph drops undeclared keys silently).
- Every rollback point must clear every downstream skip field;
  `lib/__tests__/rollback-clears-completeness.test.js` is kept honest.
- Repo is public. Nothing session-specific is committed. `reports/data/` is gitignored
  by the parent `.gitignore` (line 54); `outputs/report-0919269.html` and
  `outputs/sessionphotos/0919269/` stay uncommitted.
- Never read `.env`; test servers use a throwaway `ACCESS_PASSWORD` via env.
- Console has no DOM harness: logic goes in dual-export pure modules and is tested in
  node; React wiring is verified by a live click-through.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The push to `origin` is the user's.

## 3. Component 1 — per-call LLM log

### 3.1 Call identity

`lib/llm/client.js` `sdkQuery` generates `callId = crypto.randomUUID()` once per call
and includes `callId` on EVERY `onProgress` message it emits (`llm_start`, `llm_delta`,
every forwarded SDK message, `llm_complete`, `llm_error`). Today eight concurrent
`analyzePhotos` calls share the context string, so nothing can pair a start with its
completion. The bridge's delta coalescing key stays `(sessionId, context)` — changing it
is a separate follow-up (the console merges concurrent streams into one activity
anyway).

### 3.2 Writer

New module `lib/observability/llm-call-log.js`:

```
recordLlmEvent(sessionId, context, msg)   // msg: the onProgress message
resolveLogDir(sessionId)                  // <repo>/data/<sessionId>/llm-log
```

Hooked from `lib/observability/progress-bridge.js#createProgressFromTrace` in the three
branches that already handle `llm_start`, `llm_complete` and `llm_error`, before the
SSE emit. Only when `sessionId` is set (console-only loggers write nothing).

Per call, one file `data/<sessionId>/llm-log/<yyyymmdd-HHMMSS>-<context>-<callId8>.json`:

- on `llm_start`: `{ callId, context, label, model, startedAt, prompt: { system, user,
  schema } }` — written immediately so a crash mid-call still leaves the prompt.
- on `llm_complete`: the same file rewritten with `completedAt, elapsed, response:
  { full, length, structured }, diagnostics` (channel, stopReason, durationApiMs,
  numTurns, usage, apiErrorStatus, terminalReason, structuredOutputPresent,
  resultTextLength).
- on `llm_error`: same, with `error: { message, errorName, diagnostics }`.
- Every completion/error also appends one line to `data/<sessionId>/llm-log/index.jsonl`:
  `{ ts, callId, context, model, elapsed, channel, usage, file, outcome }`.

The in-flight map is keyed by `callId`; an `llm_complete` with no start record still
writes a file (with `startedAt: null`) rather than being dropped.

### 3.3 Failure behaviour

The writer never throws into the pipeline: every fs call is wrapped; the first failure
per process logs one `console.warn` with the path and error code; later failures are
silent. `mkdir -p` on first write. Size: the article prompt is ~250 KB; ~40 calls per
session; ~5 MB per session. No rotation.

### 3.4 Tests

`lib/__tests__/llm-call-log.test.js` (temp dir): start writes the prompt file;
completion rewrites it and appends the index line; two calls with the same context and
different callIds get two files; a completion without a start still writes; an
`EPERM`/`ENOENT` from a stubbed `fs` is swallowed and warned once.
`lib/llm/__tests__/client-contract.test.js` (extend): every progress message of one
call carries the same non-empty `callId`; two calls get different ids.

## 4. Component 2 — reject with hand edits, and the hand-edit report

### 4.1 Contract

Approval payloads (`buildResumePayload(approvals, state, theme, checkpointType)`):

| Gate | Today | After |
|---|---|---|
| outline | `{outline:false, outlineFeedback}` | `{outline:false, outlineFeedback, outlineEdits?}` |
| article | `{article:false, articleFeedback}` | `{article:false, articleFeedback, articleEdits?}` |

`outlineEdits` / `articleEdits` are the SAME keys and the SAME full edited objects the
approve path already accepts. When present on a reject:

1. Validate with the same schema gate the approve branch uses (`outline` /
   `detective-outline` / `content-bundle`). Invalid → the same `error` return shape,
   nothing written, the graph does not resume.
2. Valid → `stateUpdates.outline = outlineEdits` (resp. `contentBundle`), exactly as
   approve does, AND `stateUpdates._outlineHandEdits = diffOutline(state.outline,
   outlineEdits)` (resp. `_articleHandEdits = diffBundle(state.contentBundle,
   articleEdits)`). The feedback handling is unchanged.

Graph: no new node. `incrementOutlineRevision` (`lib/workflow/graph.js:343`) already
copies `state.outline` into `_previousOutline`, so the reviser starts from the edited
version. Same for the article via `incrementArticleRevision`.

### 4.2 Diff module

New pure module `lib/hand-edit-diff.js`, no dependencies:

```
diffOutline(before, after)  -> { kind:'outline', sections:[{ key, changes:[{ path, before, after }] }] }
diffBundle(before, after)   -> { kind:'bundle',  scopes:[{ key, changes:[{ path, before, after }] }] }
isEmpty(diff)               -> boolean
formatHandEditsBlock(diff)  -> string   // '' when empty
changedScopes(diff, edited, revised) -> string[]   // scope keys from `diff` whose value in `revised` differs from `edited`
```

- Outline: sections are the top-level keys of the outline object (journalist: lede,
  theStory, followTheMoney, thePlayers, whatsMissing, closing; detective: its five).
  Within a section, one level of fields; a nested value (array or object) is compared as
  canonical JSON and reported as one change at that field path.
- Bundle: scopes are `headline`, `byline`, `section:<id>` (matched by `id`; a section
  present on one side only is one change `added`/`removed`), `pullQuotes`,
  `evidenceCards`, `financialTracker`, `photos`, `heroImage`. Within a section, `heading`
  is a field and `content` blocks are matched by index; a length change is reported as
  one change `content: N blocks -> M blocks` plus per-index text changes up to the
  shorter length. `metadata`, `voice_self_check` and `_revisionHistory` are ignored.
- `formatHandEditsBlock`: one line per change, `path: was "<before, trimmed to 300
  chars>" -> now "<after, exact>"`; whole block capped at 12,000 characters with a
  trailing `(… N more changes not shown)` line. Values are strings after JSON
  canonicalisation; no HTML escaping (prompts are plain text).
- Total: any non-object input yields an empty diff; never throws.

### 4.3 Reviser prompt block

`buildRevisionContext` (`lib/workflow/nodes/node-helpers.js:825`) takes a new option
`handEdits` (the diff or null) and, when non-empty, appends to `contextSection`, AFTER
the human-feedback paragraph and BEFORE the previous-output section:

```
<HAND_EDITS>
The director changed these parts by hand before sending this back. They are already
in the previous version below. Keep them exactly as they are unless the director's
feedback above asks to change them.

<formatHandEditsBlock output>
</HAND_EDITS>
```

`reviseOutline` passes `handEdits: state._outlineHandEdits || null` and returns
`_outlineHandEdits: null` on every exit (success, timeout, error), mirroring
`_outlineFeedback`. `reviseContentBundle` likewise with `_articleHandEdits`.

### 4.4 Verify (option C)

After a successful revision, the reviser computes
`changedScopes(handEdits, previousOutput, revisedOutput)` and returns
`_outlineHandEditReport = { checked: [...all scope keys in the diff], changed: [...] }`
(resp. `_articleHandEditReport`). When there were no hand edits the report is `null`.

`getCheckpointData` adds `handEditReport` to the `outline` and `article` payloads (from
the two state fields). `checkpointOutline` / `checkpointArticle` return the report field
as `null` on the approve branch so it does not survive the gate. The console shows, when
`changed.length > 0`, one advisory line in `RevisionDiff`:
"The rework changed sections you edited by hand: LEDE, CLOSING." (scope keys mapped to
the gate's display labels; unknown keys shown raw). Nothing blocks.

### 4.5 State

New channels in `lib/workflow/state.js`, all replace-reducer, default `null`:
`_outlineHandEdits`, `_articleHandEdits`, `_outlineHandEditReport`,
`_articleHandEditReport`. Added to every `ROLLBACK_CLEARS` list that clears
`_outlineFeedback` (resp. `_articleFeedback`), to `FRESH_START_CLEARS`, and to
`buildFreshStartState`. The completeness test is extended to assert the pairing
(wherever `_outlineFeedback` is cleared, `_outlineHandEdits` and its report are too).

### 4.6 Console

`Outline.js` `handleReject`: when `hasEdits && editedOutline`, validate with
`EditLogic.validateOutlineShape` (as approve does; on failure show the same
`.validation-error` and do not send), dispatch `SAVE_PENDING_EDITS`, cache the EDITED
outline as the revision's previous version (`CACHE_REVISION` data = `editedOutline`), and
send `{ outline:false, outlineFeedback, outlineEdits: editedOutline }`. Without edits:
unchanged. `Article.js` mirrors with `validateBundleShape`, `editedBundle`,
`articleEdits`.

`RevisionDiff` takes a new prop `handEditReport` and renders the advisory line under
the previous-feedback block.

### 4.7 Tests

- `lib/__tests__/hand-edit-diff.test.js`: outline field change, nested change reported
  once, detective sections, bundle headline/byline/section-by-id/added-removed
  section/blocks length change/sidebar collections, ignored keys, malformed input →
  empty, `formatHandEditsBlock` trimming and cap, `changedScopes` for kept / reverted /
  partially-kept edits.
- `__tests__/unit/server-build-resume-payload.test.js` (extend): reject+valid edits
  writes `outline` and `_outlineHandEdits`; reject+invalid edits returns the schema
  error and writes neither; reject without edits unchanged; same three for article.
- `__tests__/unit/workflow/` revise tests (extend or add): the `<HAND_EDITS>` block is
  present only when a diff exists; the report names exactly the reverted scopes; the
  fields are nulled on every exit path.
- `lib/__tests__/rollback-clears-completeness.test.js`: the pairing assertion.
- Console: no automated wiring test (see §7.2).

## 5. Component 3 — director gate notes

### 5.1 State

New channel `directorGateNotes` in `lib/workflow/state.js`, reducer
`appendSingleReducer`, default `[]`. Entry shape:
`{ gate: 'arc-selection'|'outline'|'article', kind: 'guidance'|'rejection', round,
   text, at }` with `round` = number of existing entries for that gate + 1 and `at` an ISO
timestamp. Added to `APPEND_REDUCER_FIELDS` in `lib/api-helpers.js` (rollback clears an
append channel by writing `[]`).

The name avoids `directorNotes`, which holds the director's session observations.

### 5.2 Writes (server, `buildResumePayload`)

| Director action | Entry |
|---|---|
| arc-selection with `outlineGuidance` | `{gate:'arc-selection', kind:'guidance', text}` |
| arc-selection reject (`arcFeedback`) | `{gate:'arc-selection', kind:'rejection', text}` |
| outline reject (`outlineFeedback`) | `{gate:'outline', kind:'rejection', text}` |
| article reject (`articleFeedback`) | `{gate:'article', kind:'rejection', text}` |

`stateUpdates.directorGateNotes = [entry]` (append). The existing per-gate slots
(`_outlineGuidance`, `_arcFeedback`, `_outlineFeedback`, `_articleFeedback`) keep their
current behaviour as "what to do now".

### 5.3 Reads (prompts)

`buildDirectorGuidanceSection(directorGuidance, gateNotes = [])` in
`lib/prompt-builder.js` gains a second paragraph inside the SAME `<DIRECTOR_GUIDANCE>`
section, after the existing text, when `gateNotes` is non-empty:

```
Standing notes the director gave at earlier gates, in order. Each was already applied
at its own gate; keep honoring it in what you write now.
- [arc-selection, guidance 1] <text>
- [outline, rejection 1] <text>
```

When there is no arc guidance but there are notes, the section is emitted with only the
second paragraph. Consumers and what they pass:

| Consumer | `gateNotes` passed |
|---|---|
| `generateOutline` | all entries (only arc-selection ones can exist) |
| `reviseOutline` | all entries EXCEPT the one it is acting on (the last `outline` rejection) |
| `generateContentBundle` | all entries |
| `reviseContentBundle` | all entries EXCEPT the last `article` rejection |

The two revisers already append the guidance section via
`buildDirectorGuidanceSection(state._outlineGuidance)`; they pass the filtered list as
the second argument. The two generators pass it through the existing `directorGuidance`
option object as `gateNotes`.

### 5.4 Rollback

- Rollback to `arc-selection` or any upstream point: the whole field clears (listed in
  those `ROLLBACK_CLEARS` lists, and in `FRESH_START_CLEARS`).
- Rollback to `outline`, `article`, `photos`, `character-ids`: `buildRollbackState`
  prunes entries whose `gate` is in `PHASES_INVALIDATED_BY[point]` (the same table that
  stubs `evaluationHistory`), writing the survivors back as a full replacement (`[]`
  then the survivors, or a single write of the survivor array — implementation detail,
  test pins the result). Arc-selection notes always survive those four points.

### 5.5 Console

`getCheckpointData` adds `directorGateNotes` (the full array) to the `arc-selection`,
`outline` and `article` payloads. `RevisionDiff` takes a `gateNotes` prop and renders
them as a compact list "Standing notes the writer will see" above the feedback box, each
as `[gate, kind round] text`. Empty → nothing rendered.

### 5.6 Tests

- `lib/__tests__/prompt-builder-director-guidance.test.js` (new or extend): section
  unchanged with guidance only (byte-identical to today's output); notes-only; both;
  ordering and labels.
- `__tests__/unit/server-build-resume-payload.test.js`: each of the four actions appends
  one entry with the right gate/kind/round; an approve without guidance appends nothing.
- `__tests__/unit/workflow/` generate/revise tests: the filtered list reaches the
  prompt; the acted-on rejection is excluded; the outline generator prompt is unchanged
  when only arc guidance exists.
- `lib/__tests__/api-helpers-rollback*.test.js` (extend): pruning per point; whole-clear
  at arc-selection; fresh start.

## 6. Component 4 — thesis surface

### 6.1 Outline gate (journalist only)

A `ThesisPanel` rendered first in `Outline.js`, above the section renderers, showing
`lede.hook`, `lede.keyTension`, `lede.primaryArc` from the edited outline when edits are
pending, else from `data.outline`. The host carries `article-block--editable
article-block--editable-always` (outline hosts rule). Its pencil opens `ThesisEditor`,
three `TextField`s, Save/Cancel via the existing `actionsRow`. Save calls
`saveSectionEdit('lede', EditLogic.buildThesisPayload(state, originalLede))`.

`console/outline-edit-logic.js` gains `initThesis(lede)` → `{hook, keyTension,
primaryArc}` and `buildThesisPayload(state, originalLede)` → `deepClone(originalLede)`
with the three fields replaced. `selectedEvidence` and any other LEDE key survive
untouched. The detective theme renders no panel.

### 6.2 Article gate

`getCheckpointData` adds `outlineThesis: { hook, keyTension, primaryArc } | null` to the
`article` payload from `state.outline?.lede` (null for detective or missing). `Article.js`
renders a read-only `ThesisEcho` block above the headline/kicker/deck editors.

### 6.3 Tests

- `console/__tests__/outline-edit-logic.test.js`: `initThesis`, `buildThesisPayload`
  preserves other keys, blank fields kept (validation layer's job).
- `__tests__/unit/console-editable-pencils.test.js`: the thesis host carries both
  classes.
- `__tests__/unit/server-*` checkpoint-data test: `outlineThesis` present for journalist,
  null for detective.

## 7. Verification

### 7.1 Unit

TDD per behaviour above. Full suite before every commit. Fail-loud sweep: grep for any
marker removed.

### 7.2 Console click-through

The console task's reviewer runs a throwaway server (`ALLOW_NONSTANDARD_SESSION_ID`,
throwaway password via env, `window.fetch` stubbed to serve a captured checkpoint
payload) and clicks through: thesis pencil → edit → save → thesis shows edited values;
reject with edits → payload carries `outlineEdits` and the note; invalid edit blocked
with the error; advisory line renders from a stub `handEditReport`; standing notes
render from a stub `directorGateNotes`; article gate shows the thesis echo. Counts every
non-GET request. The integrator repeats it once.

### 7.3 Prompt regression guard

`scripts/render-prompts.js --session <id> --out <dir>` renders the four prompts
(outline generation, outline revision, article generation, article revision) from a
thread's persisted state through the real builders, with a fixed fake hand-edit diff
and fixed gate notes. Run on `main` and on the branch for thread `0919269`; the diff
must contain ONLY the `<HAND_EDITS>` block and the standing-notes paragraph. Any other
difference fails the gate. The review's render scripts in
`data/review-2026-09-18/rendered/` are reused if present.

### 7.4 Live deploy gate (one paid exercise, ~1–2% weekly allowance)

On the branch's own server (throwaway password): roll thread `0919269` back to
`outline`; at the gate edit the thesis by hand; reject with a note. Check: the schema
gate passes; the log folder holds the revision call with the `<HAND_EDITS>` block and
the standing notes in its prompt; the gate returns with `handEditReport` and the
advisory line (or an empty `changed`); `directorGateNotes` shows the note; the article
prompt in the log carries the standing notes. The article reject-with-edits path is
verified by unit tests and the stubbed click-through only.

### 7.5 Docs

`reports/CLAUDE.md`: approval-payload paragraph (edits on reject), checkpoint payload
keys table (`handEditReport`, `directorGateNotes`, `outlineThesis`), state channels,
the log folder under Session Data Directory Structure, and the `callId`. Memory file
updated after merge.

## 8. Delivery

Branch `feat/director-steering`. Subagent-driven development with a written plan
(TDD steps), tasks partitioned by file ownership, interfaces fixed up front (this spec).

| Task | Owns | Wave |
|---|---|---|
| T1 Instrumentation | `lib/llm/client.js`, `lib/observability/llm-call-log.js`, `progress-bridge.js`, their tests | 1 |
| T2 Diff module, state, rollback, resume payload | `lib/hand-edit-diff.js`, `lib/workflow/state.js`, `lib/api-helpers.js`, `server.js#buildResumePayload`, tests | 1 |
| T4a Thesis panel + reject payloads | `console/components/checkpoints/Outline.js`, `Article.js`, `console/outline-edit-logic.js`, `console/console.css`, console tests | 1 |
| T3 Prompt side + checkpoint payload keys | `lib/prompt-builder.js`, `lib/workflow/nodes/node-helpers.js`, `ai-nodes.js`, `checkpoint-nodes.js`, `server.js#getCheckpointData`, tests | 2 (after T2) |
| T4b Advisory line + standing notes display | `console/components/RevisionDiff.js`, gate wiring of the two props | 2 (after T3 fixes the keys) |
| T5 Integration | `scripts/render-prompts.js`, click-through, live gate, `CLAUDE.md`, run kit | 3 |

Implementers: Opus, high effort. Per task: reviewer on Opus (spec pass + quality pass),
fix rounds, scoped re-review, ledger with rulings. Final whole-branch review: Fable,
then one fix wave. Integrator (the lead): suite, click-through, render-diff, live gate,
docs, merge to local `main`. No subagent starts the server or the suite while the live
gate runs.

## 9. Run kit (documents, delivered with T5)

- `docs/runbook/decision-log-template.md`: one entry per gate — saw / wanted / allowed /
  did / why / wait time / flags `wanted-scoped-rework`, `end-edited-for-time`,
  `could-not-predict-downstream`. The filled copy lives in `data/<id>/decision-log.md`.
- `docs/runbook/first-run-sheet.md`: restart from main; photos blank if not curated;
  whiteboard in its field; restart only at a pause; the reload check
  (`document.wasDiscarded`, navigation type); reject once with a note at outline and
  once at article if the clock allows.
- `docs/runbook/pre-registration-2026-09.md`: each baseline failure class with where
  the current pipeline should now catch it (code / prompt / nowhere), to compare with
  the findings.

## 10. Out of scope (grill agenda)

Scoped rework (rework one section, keep the rest, enforced in code); mixed-mode UI
beyond "edits travel with the note"; per-call delta coalescing keyed by `callId` and a
per-call console activity; a thesis panel for the detective theme; any prompt
restructure or model allocation change; the console reload observed in the test pane.
