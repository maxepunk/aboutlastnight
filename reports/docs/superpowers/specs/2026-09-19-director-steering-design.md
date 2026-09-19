# Director steering before the first fall-run session — design

Date: 2026-09-19. Branch: `feat/director-steering` off `main` (`f5f5c46`).
Status: approved in conversation section by section; adversarially reviewed (Fable,
"Run with amendments", C3/I11/M11, `.superpowers/sdd/2026-09-19-director-steering/
spec-review.md`); every amendment applied below (marked `[Cn]`/`[In]`/`[Mn]`).

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
3. Director gate notes: every rejection note the director writes at a gate is kept and
   shown to every later writer and reviser.
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
  (LangGraph drops undeclared keys silently). `getDefaultState()` is hand-written and
  its key count is pinned by `__tests__/unit/workflow/state.test.js` (69 today). `[I2]`
- Every rollback point must clear every downstream skip field;
  `lib/__tests__/rollback-clears-completeness.test.js` is kept honest.
- Repo is public. Nothing session-specific is committed. `reports/data/` is gitignored
  by the parent `.gitignore` (line 54); `outputs/report-0919269.html` and
  `outputs/sessionphotos/0919269/` stay uncommitted.
- Never read `.env`; test servers use a throwaway `ACCESS_PASSWORD` via env.
- Console has no DOM harness: logic goes in dual-export pure modules and is tested in
  node; React wiring is verified by a live click-through.
- **The production database is never touched by a test.** `data/checkpoints.sqlite`
  holds the real `0919269` thread whose report is due. Every live exercise runs
  against a copy (§7.4). `[C2]`
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The push to `origin` is the user's.

## 3. Component 1 — per-call LLM log

### 3.1 Call identity

`lib/llm/client.js` `sdkQuery` generates `callId = crypto.randomUUID()` once per call.
There are SIX `onProgress(` emission sites (`client.js:339, 376, 432, 545, 586, 596`);
rather than touching each, `sdkQuery` defines one local
`const emit = (m) => onProgress && onProgress({ callId, ...m })` at the top and every
site calls `emit`. `[M3]` Downstream readers use named fields only (verified), so the new
field is inert for the tracer, the bridge and every test. The bridge's delta coalescing
key stays `(sessionId, context)` — changing it is a follow-up.

### 3.2 Writer

New module `lib/observability/llm-call-log.js`:

```
recordLlmEvent(sessionId, context, msg)   // msg: the onProgress message
setLogRoot(dir)                           // test/injection hook; default <repo>/data
resolveLogDir(sessionId)                  // <root>/<sessionId>/llm-log
```

Hooked from `lib/observability/progress-bridge.js#createProgressFromTrace` BEFORE the
`isProgressEnabled()` early return, so `SDK_PROGRESS=false` silences the console/SSE
stream but never the log. `[M4]` Only when `sessionId` is set (console-only loggers
write nothing). **Disabled when `process.env.JEST_WORKER_ID` is set** unless a test
calls `setLogRoot(tmpDir)` explicitly, so the bridge's existing tests (which use
`SESSION = 'test-delta-session'`) never write into `data/`. `[I4]` `LLM_CALL_LOG_DIR`
env overrides the root at runtime.

Per call, one file `<logDir>/<yyyymmdd-HHMMSS>-<context>-<callId8>.json`, timestamp UTC
from `startedAt`, `context` sanitised with `[^A-Za-z0-9_-]` → `_`:

- on `llm_start`: `{ callId, context, label, model, startedAt, prompt: { system, user,
  schema } }` — written immediately so a crash mid-call still leaves the prompt.
- on `llm_complete`: the same file rewritten with `completedAt, elapsed, response:
  { full, length, structured }, diagnostics` (channel, stopReason, durationApiMs,
  numTurns, usage, apiErrorStatus, terminalReason, structuredOutputPresent,
  resultTextLength).
- on `llm_error`: same, with `error: { message, errorName, diagnostics }`.
- Every completion/error also appends (`fs.appendFileSync`; single process, the event
  loop serialises concurrent completions) one line to `<logDir>/index.jsonl`:
  `{ ts, callId, context, model, elapsed, channel, usage, file, outcome }`.

The in-flight map is keyed by `callId`; an `llm_complete` with no start record still
writes a file (with `startedAt: null`) rather than being dropped.

### 3.3 Failure behaviour

The writer never throws into the pipeline: every fs call is wrapped; the first failure
per process logs one `console.warn` with the path and error code; later failures are
silent. `mkdir -p` on first write. Size: the article prompt is ~250 KB; ~40 calls per
session; ~5 MB per session (estimate). No rotation. `lib/static-guard.js` already denies
`/data/` over HTTP, so the folder is not served.

### 3.4 Tests

`lib/__tests__/llm-call-log.test.js` (temp dir via `setLogRoot`): start writes the
prompt file; completion rewrites it and appends the index line; two calls with the same
context and different callIds get two files; a completion without a start still writes;
an `EPERM`/`ENOENT` from a stubbed `fs` is swallowed and warned once; the module is a
no-op under `JEST_WORKER_ID` without `setLogRoot`.
`lib/llm/__tests__/client-contract.test.js` (extend): every progress message of one
call carries the same non-empty `callId`; two calls get different ids.

## 4. Component 2 — reject with hand edits, and the hand-edit report

### 4.1 Contract

Approval payloads (`buildResumePayload(approvals, currentState, theme, checkpointType)`,
`server.js:343`; `/approve` passes the full graph state):

| Gate | Today | After |
|---|---|---|
| outline | `{outline:false, outlineFeedback}` | `{outline:false, outlineFeedback, outlineEdits?}` |
| article | `{article:false, articleFeedback}` | `{article:false, articleFeedback, articleEdits?}` |

`outlineEdits` / `articleEdits` are the SAME keys and the SAME full edited objects the
approve path already accepts. The server trusts the payload, never a client flag. When
present on a reject:

1. Validate with the same schema gate the approve branch uses (`outline` /
   `detective-outline` / `content-bundle`). Invalid → the same `error` return shape,
   nothing written, the graph does not resume.
2. Valid → `stateUpdates.outline = outlineEdits` (resp. `contentBundle`), exactly as
   approve does, AND `stateUpdates._outlineHandEdits = diffOutline(currentState.outline,
   outlineEdits)` (resp. `_articleHandEdits = diffBundle(currentState.contentBundle,
   articleEdits)`), written as `null` when `isEmpty(diff)` (identical edits, or no
   current outline in state). `[M9]`
3. On EVERY reject at that gate, with or without edits: `stateUpdates._outlineHandEdits`
   is set (new diff or `null`) and `stateUpdates._outlineHandEditReport = null`, so a
   second reject after a rework never carries the previous round's diff or report.
   `[C3]` Same for the article fields.

The feedback handling is unchanged. Reject-with-edits applies to BOTH themes; only the
thesis panel (§6) is journalist-only.

Graph: no new node. The server applies `stateUpdates` via
`graph.invoke(new Command({ resume, update }))` (`server.js:1225`); LangGraph applies
the update before the resumed task runs (verified against `pregel/loop.js` and the
probe `data/review-2026-09-18/r1-command-update-probe.js`). `incrementOutlineRevision`
(`lib/workflow/graph.js:343`) then copies `state.outline` into `_previousOutline`, so
the reviser starts from the edited version. Same for the article via
`incrementArticleRevision`.

### 4.2 Diff module

New pure module `lib/hand-edit-diff.js`, no dependencies:

```
diffOutline(before, after)  -> { kind:'outline', sections:[{ key, changes:[{ path, before, after }] }] }
diffBundle(before, after)   -> { kind:'bundle',  scopes:[{ key, changes:[{ path, before, after }] }] }
isEmpty(diff)               -> boolean
formatHandEditsBlock(diff)  -> string   // '' when empty
changedScopes(diff, revised) -> string[] // scope keys whose `after` no longer matches `revised` at that path
```

- Outline: sections are the top-level keys of the outline object (journalist: lede,
  theStory, followTheMoney, thePlayers, whatsMissing, closing; detective:
  executiveSummary, evidenceLocker, memoryAnalysis, suspectNetwork,
  outstandingQuestions, finalAssessment). Within a section, one level of fields; a
  nested value (array or object) is compared as canonical JSON (sorted keys) and
  reported as one change at that field path.
- Bundle: scopes are `headline`, `byline`, `section:<id>` (matched by `id`; a section
  present on one side only is one change `added`/`removed`), `pullQuotes`,
  `evidenceCards`, `financialTracker`, `photos`, `heroImage`. Collections are matched
  per item — by `id` where the schema has one (`sections`, `evidenceCards`), by index
  otherwise — and each item is reported as its own change. `[I7]` Within a section,
  `heading` is a field and `content` blocks are matched by `type` + the normalised first
  40 characters of the block's text (paragraph/quote text, list items joined, caption,
  card headline), index as fallback; unmatched blocks are one `added`/`removed` change
  each. `[I8]` `metadata`, `voice_self_check` and `_revisionHistory` are ignored.
- `formatHandEditsBlock`: one line per change,
  `path: was "<before, trimmed to 300 chars>" -> now "<after, trimmed to 1,500 chars>"`;
  the full `after` is already in the previous-output section. Whole block capped at
  12,000 characters with a trailing `(… N more changes not shown)` line. `[I7]` Values
  are strings after canonicalisation; no HTML escaping (prompts are plain text).
- `changedScopes(diff, revised)`: for each change in the diff, read `revised` at
  `change.path`, canonicalise (sorted-key JSON; strings trimmed), compare with
  `change.after`; a scope is "changed" if any of its changes differ. Works on any
  reviser pass in the round, not only the first. `[C3]`
- Total: any non-object input yields an empty diff; never throws.

### 4.3 Reviser prompt block

`buildRevisionContext` (`lib/workflow/nodes/node-helpers.js:825`) takes a new option
`handEdits` (the diff or null) and, when non-empty, inserts into `contextSection`
IMMEDIATELY AFTER the HUMAN FEEDBACK paragraph and BEFORE "CRITICAL REVISION
INSTRUCTIONS", so instruction 1 ("PRESERVE") covers the edits and "feedback above" is
literally true: `[M1]`

```
<HAND_EDITS>
The director changed these parts by hand before sending this back. They are already
in the previous version below. Keep them exactly as they are unless the director's
feedback above asks to change them. The evaluator's notes above were written before
these edits.

<formatHandEditsBlock output>
</HAND_EDITS>
```

`reviseOutline` passes `handEdits: state._outlineHandEdits || null`. **The revisers do
NOT clear `_outlineHandEdits` / `_articleHandEdits`.** `[C3]` An evaluator-driven second
pass in the same round (`routeOutlineEvaluation` → `incrementOutlineRevision` →
`reviseOutline`, cap 3) must still see the block. The diff is cleared by
`checkpointOutline` / `checkpointArticle` on the APPROVE branch and overwritten by the
server on every reject (§4.1 step 3).

### 4.4 Verify (option C)

After every successful revision pass, the reviser computes
`changedScopes(handEdits, revisedOutput)` and returns
`_outlineHandEditReport = { checked: [...all scope keys in the diff], changed: [...] }`
(resp. `_articleHandEditReport`), overwriting the previous pass's report. When
`handEdits` is null the report is `null`. `[C3]`

`getCheckpointData` adds `handEditReport` to the `outline` and `article` payloads.
`checkpointOutline` / `checkpointArticle` return `_outlineHandEdits: null,
_outlineHandEditReport: null` (resp. article) on the approve branch so neither survives
the gate. The console (`RevisionDiff`) renders:

- `changed.length > 0`: one advisory line, "The rework changed sections you edited by
  hand: LEDE, CLOSING." (scope keys mapped to the gate's display labels; unknown keys
  raw).
- `changed.length === 0 && checked.length > 0`: one muted line, "Rework kept all N hand
  edits."
- report `null`: nothing.

Nothing blocks.

### 4.5 State

New channels in `lib/workflow/state.js`, all replace-reducer, default `null`:
`_outlineHandEdits`, `_articleHandEdits`, `_outlineHandEditReport`,
`_articleHandEditReport`. Added to every `ROLLBACK_CLEARS` list that clears
`_outlineFeedback` (resp. `_articleFeedback`) and to `getDefaultState()`. Fresh start
is derived from the annotation spec, so nothing to add there; `clearedValueFor` yields
`null` for them, which is their default. `[M6]` The completeness test is extended to
assert the pairing (wherever `_outlineFeedback` is cleared, `_outlineHandEdits` and its
report are too). The `state.test.js` count pin moves from 69 to 74 (these four plus
`directorGateNotes`), with its three companion comments. `[I2]`

### 4.6 Console

`Outline.js` `handleReject`: when `hasEdits && editedOutline`, validate with
`EditLogic.validateOutlineShape` (as approve does; on failure show the same
`.validation-error` and do not send), dispatch `SAVE_PENDING_EDITS` (kept: it only
matters on the error path where the component stays mounted; `CHECKPOINT_RECEIVED`
clears it before the next gate), cache the EDITED outline as the revision's previous
version (`CACHE_REVISION` data = `editedOutline`), and send `{ outline:false,
outlineFeedback, outlineEdits: editedOutline }`. Without edits: unchanged. In reject
mode with edits pending, one line above the feedback box: "Your hand edits will be sent
with this note." `[M10]` `Article.js` mirrors with `validateBundleShape`, `editedBundle`,
`articleEdits`.

`RevisionDiff` takes a new prop `handEditReport` and renders the lines in §4.4 under the
previous-feedback block. Its early return (`!hasPrevious && !hasRevisionState`) is
widened so that a non-null report or a non-empty notes list (§5.5) also renders. `[I6]`

### 4.7 Tests

- `lib/__tests__/hand-edit-diff.test.js`: outline field change, nested change reported
  once, detective sections, bundle headline/byline/section-by-id/added-removed
  section/block matching by type+prefix with an inserted paragraph/per-item collections,
  ignored keys, malformed input → empty, `formatHandEditsBlock` trimming (300/1,500) and
  cap, `changedScopes` for kept / reverted / partially-kept edits and for a second pass.
- `__tests__/unit/server-build-resume-payload.test.js` (extend): reject+valid edits
  writes `outline`, `_outlineHandEdits` and `_outlineHandEditReport: null`;
  reject+identical edits writes `outline` and `_outlineHandEdits: null`; reject+invalid
  edits returns the schema error and writes none of them; reject without edits sets the
  two fields to `null`; same for article.
- `__tests__/unit/workflow/` revise tests (extend or add): the `<HAND_EDITS>` block is
  present only when a diff exists and sits between HUMAN FEEDBACK and CRITICAL REVISION
  INSTRUCTIONS; the reviser does NOT null the diff; the report names exactly the
  reverted scopes and is rewritten on a second pass; the checkpoint approve branch nulls
  diff and report.
- `lib/__tests__/rollback-clears-completeness.test.js`: the pairing assertion.
- `__tests__/unit/workflow/state.test.js`: the count pin.
- Console: no automated wiring test (see §7.2).

## 5. Component 3 — director gate notes

### 5.1 State

New channel `directorGateNotes` in `lib/workflow/state.js`, **replace** reducer, default
`[]`. `[C1]` (An append channel cannot be pruned: `appendSingleReducer` appends any
non-empty array and rollback applies state through a plain `graph.invoke(initialState)`,
one write per key.) Entry shape:
`{ gate: 'arc-selection'|'outline'|'article', kind: 'rejection', round, text, at }`,
`round` = number of SURVIVING entries for that gate + 1 (so it restarts after a pruning
rollback, matching `ROLLBACK_COUNTER_RESETS`) `[M11]`, `at` an ISO timestamp. Not added
to `APPEND_REDUCER_FIELDS`; readers use `state.directorGateNotes || []`. Added to
`getDefaultState()`.

The name avoids `directorNotes`, which holds the director's session observations.

### 5.2 Writes (server, `buildResumePayload`)

Rejection notes only. The arc-selection GUIDANCE is not recorded as a note: it already
persists in `_outlineGuidance`, reaches every writer and reviser, and is cleared by the
same rollback points; recording it twice would duplicate it in the prompt and falsify
the byte-identical test in §5.6. `[I1]`

| Director action | Entry appended |
|---|---|
| arc-selection reject (`arcFeedback`) | `{gate:'arc-selection', kind:'rejection', round, text, at}` |
| outline reject (`outlineFeedback`) | `{gate:'outline', kind:'rejection', round, text, at}` |
| article reject (`articleFeedback`) | `{gate:'article', kind:'rejection', round, text, at}` |

The builder has `currentState`, so it writes the full array itself:
`stateUpdates.directorGateNotes = [...(currentState.directorGateNotes || []), entry]`.
The per-session lock rules out a concurrent writer. The existing per-gate slots
(`_arcFeedback`, `_outlineFeedback`, `_articleFeedback`) keep their current behaviour as
"what to do now".

### 5.3 Reads (prompts)

`buildDirectorGuidanceSection(directorGuidance, gateNotes = [])` in
`lib/prompt-builder.js` gains a second paragraph inside the SAME `<DIRECTOR_GUIDANCE>`
section, after the existing text, when `gateNotes` is non-empty:

```
Standing notes the director gave at earlier gates, in order. Each was already applied
at its own gate; keep honoring it in what you write now.
- [arc-selection, rejection 1] <text>
- [outline, rejection 1] <text>
```

With guidance and no notes the output is byte-identical to today's. With notes and no
guidance the section carries only the second paragraph. `PromptBuilder` methods read a
sibling option `options.gateNotes` (`_buildDirectorGuidance(options.directorGuidance,
options.gateNotes || [])`); `options.directorGuidance` stays a string. `[M2]` The two
revisers, which call `buildDirectorGuidanceSection(state._outlineGuidance)` directly,
pass the filtered list as the second argument.

| Consumer | `gateNotes` passed |
|---|---|
| `generateOutline` | all entries (only arc-selection rejections can exist) |
| `reviseOutline` | all entries except any whose `text` equals the current `state._outlineFeedback` (already present as HUMAN FEEDBACK); on an evaluator-driven pass that slot is null, so nothing is excluded `[I10]` |
| `generateContentBundle` | all entries |
| `reviseContentBundle` | all entries except any whose `text` equals the current `state._articleFeedback` `[I10]` |

### 5.4 Rollback

`PHASES_INVALIDATED_BY` is hoisted from its function-local scope in
`buildEvaluationInvalidationStubs` to module scope and exported from
`lib/api-helpers.js` (`photos`/`character-ids`/`outline` → `['outline','article']`,
`article` → `['article']`). `[M7]`

- Rollback to `arc-selection` or any upstream point: `directorGateNotes` is listed in
  those `ROLLBACK_CLEARS` lists; `clearedValueFor` writes `null`, readers use `|| []`.
- Rollback to `outline`, `article`, `photos`, `character-ids`: a new pure exported
  helper `pruneGateNotes(notes, rollbackTo)` in `lib/api-helpers.js` drops entries whose
  `gate` is in `PHASES_INVALIDATED_BY[rollbackTo]` and returns the survivors; the
  rollback handler in `server.js` (beside the `_previousFullContext` stash,
  `~server.js:1296-1310`) sets `initialState.directorGateNotes =
  pruneGateNotes(session.state.directorGateNotes, rollbackTo)`. Arc-selection notes
  always survive those four points. `[C1]` Fresh start derives from the spec (nothing
  to add).

### 5.5 Console

`getCheckpointData` adds `directorGateNotes` (the full array) to the `arc-selection`,
`outline` and `article` payloads. `RevisionDiff` takes a `gateNotes` prop and renders
them as a compact list titled "Standing notes the writer will see", each as
`[gate, rejection N] text`. Empty → nothing rendered. Note that `previousFeedback` is
`null` at the outline/article gates today (the revisers null the slot before the gate
reads it), so this list is the director's only visible record of their own notes; the
list does not assume the feedback block renders beside it. `[M8]` At the arc-selection
gate only previous arc rejections can appear.

### 5.6 Tests

- `lib/__tests__/prompt-builder-director-guidance.test.js` (extend): guidance-only
  output byte-identical to today's; notes-only; both; ordering and labels; the sibling
  option on both builders.
- `__tests__/unit/server-build-resume-payload.test.js`: each of the three rejections
  appends exactly one entry with the right gate/kind/round onto the existing array; an
  approve appends nothing; arc guidance does not create an entry.
- `__tests__/unit/workflow/` generate/revise tests: the filtered list reaches the
  prompt; a note equal to the current feedback is excluded; nothing excluded when the
  slot is null; the outline generator prompt is unchanged when only arc guidance exists.
- `lib/__tests__/api-helpers.test.js` and `lib/__tests__/rollback-invalidates-
  evaluation.test.js` (extend): `pruneGateNotes` per point; whole-clear at
  arc-selection; `PHASES_INVALIDATED_BY` exported with the four keys. `[M5]`
- The existing ordering tests (`revision-prompts-craft-rules.test.js`,
  `node-helpers-revision-context.test.js`) are `toContain`/ordering checks and stay green
  by construction; they are run, not edited.

## 6. Component 4 — thesis surface

### 6.1 Outline gate (journalist only)

A `ThesisPanel` rendered first in `Outline.js`, above the section renderers, showing
`lede.hook`, `lede.keyTension`, `lede.primaryArc` from `getCurrentOutline().lede` (the
edited outline when edits are pending, else `data.outline`). The host uses the shared
`className: EDITABLE` constant (`article-block--editable article-block--editable-always`)
and exactly one `editBtn(` call; `__tests__/unit/console-editable-pencils.test.js`
bumps its pins from 11/13 to 12/14 and its title. `[I3]` The pencil registers
`editingBlock = { type: 'section', key: 'thesis' }` (NOT `'lede'`, which would flip the
LEDE section into edit mode) and opens `ThesisEditor`, three `TextField`s, Save/Cancel
via the existing `actionsRow`. Save calls
`saveSectionEdit('lede', EditLogic.buildThesisPayload(state, originalLede))` with
`originalLede = getCurrentOutline().lede`, so a thesis save after a LEDE edit keeps that
edit's `selectedEvidence`. `[I5]`

`console/outline-edit-logic.js` gains `initThesis(lede)` → `{hook, keyTension,
primaryArc}` and `buildThesisPayload(state, originalLede)`, which delegates to
`buildLedePayload({ ...initLede(originalLede), ...state }, originalLede)` so the LEDE
builder remains the single writer of that section. The detective theme renders no
panel.

### 6.2 Article gate

`getCheckpointData` adds `outlineThesis: { hook, keyTension, primaryArc } | null` to the
`article` payload from `state.outline?.lede` (null for detective or missing; `outline`
survives to the article gate — verified). `Article.js` renders a read-only `ThesisEcho`
block above the headline/kicker/deck editors.

### 6.3 Tests

- `__tests__/unit/outline-edit-logic.test.js`: `initThesis`, `buildThesisPayload`
  preserves `selectedEvidence` and unknown keys, blank fields kept (validation layer's
  job). `[M5]`
- `__tests__/unit/console-editable-pencils.test.js`: the bumped pins.
- `__tests__/unit/get-checkpoint-data.test.js`: `outlineThesis` present for journalist,
  null for detective; `handEditReport` and `directorGateNotes` present on the two gates.
  `[M5]`

## 7. Verification

### 7.1 Unit

TDD per behaviour above. Full suite before every commit. Fail-loud sweep: grep for any
marker removed.

### 7.2 Console click-through

The console task's reviewer runs a throwaway server (`ALLOW_NONSTANDARD_SESSION_ID`,
throwaway password via env, `CHECKPOINT_DB_PATH` pointed at a scratch file, §7.4,
`window.fetch` stubbed to serve a captured checkpoint payload) and clicks through:
thesis pencil → edit → save → thesis shows edited values and the LEDE section keeps its
evidence; reject with edits → payload carries `outlineEdits` and the note, the cue line
shows; invalid edit blocked with the error; advisory and "kept all" lines render from
stub `handEditReport`s; standing notes render from a stub `directorGateNotes` with and
without revision state; article gate shows the thesis echo. Counts every non-GET
request. The integrator repeats it once.

### 7.3 Prompt regression guard

`scripts/render-prompts.js --session <id> --db <path> --out <dir>` renders the four
prompts (outline generation, outline revision, article generation, article revision)
from a thread's persisted state through the real builders. Transient inputs are faked
deterministically: `_previousOutline`/`_previousContentBundle` from the persisted
`outline`/`contentBundle`, fixed feedback text, `revisionCount` 1, the persisted
`validationResults`, a fixed hand-edit diff and a fixed notes list. Run on `main` and on
the branch against the COPIED `0919269` database; the diff must contain ONLY the
`<HAND_EDITS>` block and the standing-notes paragraph. Any other difference fails the
gate. The review's `data/review-2026-09-18/render-p1.js` and `probe-checkpoints.js` are
the starting point. This is also how "the article prompt carries the standing notes" is
verified — not by a paid run. `[I11]`

### 7.4 Live deploy gate (one paid exercise, on a copy)

`server.js` gains a `CHECKPOINT_DB_PATH` env override (default unchanged) and a `PORT`
override (the port was hardcoded to 3001, so a throwaway server would have collided with
the director's), both pinned by one test that never opens the production file. `[C2]`
Procedure:

1. The director's `main` server is DOWN for the duration (stated, not assumed).
2. Copy `data/checkpoints.sqlite` and `data/0919269/` to a scratch directory; record
   the mtimes of the originals and of `outputs/report-0919269.html`.
3. Start the branch server with `CHECKPOINT_DB_PATH=<copy>`, `PORT=3011`, a throwaway
   password, and `LLM_CALL_LOG_DIR=<scratch>`.
4. Roll the copied `0919269` back to `outline` (pays `generateOutline` + `evaluateOutline`
   on Opus); at the gate edit the thesis by hand; reject with a note (pays
   `reviseOutline` + `evaluateOutline`, up to three pairs if the evaluator loops).
5. Check at the second outline gate: the schema gate passed; the log holds the revision
   call with `<HAND_EDITS>` and the standing note in its prompt; the payload carries
   `handEditReport` and `directorGateNotes`; the console shows the advisory or the
   "kept all" line and the notes list. **Stop here.** `[I11]` Approving on to the article
   gate is optional and costs two more Opus calls.
6. Afterwards: the production `checkpoints.sqlite`, `data/0919269/` and
   `outputs/report-0919269.html` mtimes are unchanged (the check).

Minimum four Opus calls at xhigh. Their durations are recorded in the gate notes for
problem 5; no percentage of the weekly allowance is claimed in advance.

### 7.5 Docs

`reports/CLAUDE.md`: approval-payload paragraph (edits on reject, both fields reset on
every reject), checkpoint payload keys table (`handEditReport`, `directorGateNotes`,
`outlineThesis`), state channels, the log folder under Session Data Directory Structure,
`callId`, `CHECKPOINT_DB_PATH`, `PORT` and `LLM_CALL_LOG_DIR`. Memory file updated after merge.

## 8. Delivery

Branch `feat/director-steering`. Subagent-driven development with a written plan
(TDD steps), tasks partitioned by file ownership, interfaces fixed up front (this spec).
`server.js` is owned by function: T2 owns `buildResumePayload`, the rollback handler's
one pruning line, and the `CHECKPOINT_DB_PATH` line; T3 owns `getCheckpointData`. `[I9]`

| Task | Owns | Wave |
|---|---|---|
| T1 Instrumentation | `lib/llm/client.js`, `lib/observability/llm-call-log.js`, `progress-bridge.js`, `lib/__tests__/llm-call-log.test.js`, `lib/llm/__tests__/client-contract.test.js` | 1 |
| T2 Diff module, state, rollback, resume payload, DB path + port | `lib/hand-edit-diff.js`, `lib/workflow/state.js` (+`getDefaultState`), `lib/api-helpers.js` (`PHASES_INVALIDATED_BY` hoist, `pruneGateNotes`), `server.js#buildResumePayload`, `server.js` rollback pruning line, `server.js` `CHECKPOINT_DB_PATH`, `__tests__/unit/workflow/state.test.js` pin, `server-build-resume-payload.test.js`, `rollback-clears-completeness.test.js`, `api-helpers.test.js`, `rollback-invalidates-evaluation.test.js`, `hand-edit-diff.test.js` | 1 |
| T4a Thesis panel + reject payloads | `console/components/checkpoints/Outline.js`, `Article.js`, `console/outline-edit-logic.js`, `console/console.css`, `__tests__/unit/outline-edit-logic.test.js`, `__tests__/unit/console-editable-pencils.test.js` | 1 |
| T3 Prompt side + checkpoint payload keys | `lib/prompt-builder.js`, `lib/workflow/nodes/node-helpers.js`, `ai-nodes.js`, `checkpoint-nodes.js`, `server.js#getCheckpointData`, `prompt-builder-director-guidance.test.js`, revise/generate tests, `get-checkpoint-data.test.js` | 2 (after T2) |
| T4b Advisory line + standing notes display | `console/components/RevisionDiff.js`; then, shared-after-T4a: `Outline.js`, `Article.js`, `ArcSelection.js`, `console.css` for the prop wiring | 2 (after T3 and T4a) |
| T5 Integration | `scripts/render-prompts.js`, click-through, live gate on the copy, `CLAUDE.md`, run kit | 3 |

Implementers: Opus, high effort. Per task: reviewer on Opus (spec pass + quality pass),
fix rounds, scoped re-review, ledger with rulings. Final whole-branch review: Fable,
then one fix wave. Integrator (the lead): suite, click-through, render-diff, live gate,
docs, merge to local `main`. No subagent starts a server or the suite while the live
gate runs; no process other than the gate's server opens the copied database.

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
per-call console activity; a thesis panel for the detective theme; recording the
arc-selection guidance as a gate note; any prompt restructure or model allocation
change; the console reload observed in the test pane.
