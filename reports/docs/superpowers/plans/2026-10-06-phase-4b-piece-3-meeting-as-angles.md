# Phase 4b, piece 3: the story meeting as pitched angles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** The director settles the story by picking one of two or three pitched angles, adjusting it, and sending it on, on a memo page of at most 450 words, with no roles, no lanes and no ids.

**Spec.** `docs/superpowers/specs/2026-10-06-meeting-as-angles.md` (commit `8d491506`) is the authority, with its worked example from session 100326. The rule text is `rule-text-read.md` in this piece's workspace (`.superpowers/sdd/2026-10-06-phase-4b-meeting/`), approved by the director on 2026-10-06 with no changes. The code footprint is `surveys/piece-3-footprint.md` there, with file and line at `c253833d`. The integrator's rulings are the spec's section 17, restated under "Rulings" below. The mock-ups are on the design canvas, https://claude.ai/artifact/73MDbGHvEWUYRHDnVBcGaZ, board "Story meeting: angles (100326)". The vocabulary is `CONTEXT.md`'s; this piece adds angle and retires main thread and role.

**Builds on.** Piece 1, merged and pushed: `main` at `c253833d` (the director's publish of 100326), then the spec `8d491506` and this plan. The phase branch, `feat/phase-4b-meeting-angles`, is cut from this plan's commit.

**Architecture.**
- **The weave** keeps its stage, checks, fact check and stop. It becomes `{angles, fromYourNotes?, threads, connections, questions}`, with the director's pick, `picked`, on it. An angle is `{id, headline, gist, story, question, lands, ends, threads}`. A thread loses its role and reason.
- **One reading of the settled story.** A helper in `lib/weave.js` returns the picked angle with its threads in order, the threads left out and the connections between its threads. Every reader after the meeting goes through it.
- **The director's edits** gain the angle: each pitch field is an edit, found by the angle's id, and a thread flipped into or out of an angle is an edit of its own kind. The connection strike goes.
- **A Reweave** works on the open angle. Code puts back everything outside it afterwards.
- **The meeting's page** is a memo: the angles side by side, the open angle's pitch, its threads in or out, the questions beside what they change, where the threads meet.
- **The map, the article and the judges** change only through the settled reading.
- **A thread on piece 1's shapes** gets the old-thread message and a rollback to the meeting, where the angles are written fresh.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides; the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace) with its cost if wrong.

**Story terms** (piece 1, unchanged). The writer's lines hold no quotation from the record, no figure, no clock time and no document id. Each angle's `gist`, `story`, `question`, `lands` and `ends`, each thread's name and line, and each connection's line are checked. Exempt: each angle's `headline`, the article's own printed line; the questions, whose figure kind needs the figure; "from your notes"; the verdict line; the director's own lines.

**The bound** (spec 5 and 9.1). The meeting's page at most 450 words as it prints, with any angle open. Each angle's page is counted as it opens, by `lib/stop-pages.js` `wordsShown`, the count the stops log records, under `lib/word-count.js` `pageLengthOf` with bound 450 and floor 350. The bound holds the writer's output and each rework's, never the director's version.

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written.

**The director's edits are final** (phase 4 spec section 7, as built). The evidence is never the director's edit. A check failure in a director's line is a concern beside it, never a rework.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt, a task line, a schema description, a label, a check's line.
- State each target positively, each rule once, with its reason. A task line names the rule items it applies and never restates them.
- No em-dashes. Nova is never gendered. The rule files carry the approved read word for word.

**Themes.** The shapes stay generic. Code never names the journalist's slots, Nova or NovaNews outside the theme's files. Only the journalist runs; the detective stays parked.

**No other changes.** No model, effort or pin changes. No npm install, update or ci; if a step seems to need a package, stop and report it.

**One source of truth.**
- A rule two places apply is one function or one constant, which both call. The picked angle is read through one helper.
- The console keeps a copy of a server constant only where it cannot import it, and a test holds the two equal.

**State channels.** No new channel. The pick lives on the weave (R1).

**Stop types keep their names.** `arc-selection` stays the stop type; its label stays "Story meeting".

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The fact check's mark keeps working on the new shape, with a replay test.

**Console.**
- Logic that decides a line, a label, a fold, a count or a payload goes into the dual-export pure modules, with node tests. Components stay thin.
- There is no DOM harness, so the integrator's click-through covers the wiring.

**Tests.**
- No live model calls; Jest maps the SDK to its mock. Each brief's Verification runs with no model call.
- Every commit passes the full suite, exit code guarded. Counts fall only by the tests a brief retires, and the return names each one.
- **Delete-last.** A slice that changes a shape owns that shape's tests: the console's copies, the graph tests that seed it, and its part of the shared fixtures (`lib/__tests__/fixtures/rework-state.js`, `__tests__/mocks/llm-client.mock.js`, `__tests__/fixtures/mock-responses/weave.json`, `scripts/lib/fixed-weave.js`). It deletes each old field only together with its last reader.
- Tests that pin today's text or shape break by design. The slice that changes them updates them, with the reason, and updates any pinned hash it moves (`lib/__tests__/writer-prompts-pinned.test.js`).
- No test reads `data/`. A test in a real session's shape uses invented text, because the repo is public.

**What the integrator owns.** Recomposing a pinned hash two slices of one run moved; the removed-phrase list in `lib/__tests__/fixtures/removed-phrases.js`; the roadmap.

**Docs.** `reports/CLAUDE.md`, `CONTEXT.md` and `docs/PIPELINE_DEEP_DIVE.md` are shared by section. Each code slice updates the `CLAUDE.md` sections that describe what it changes, as its run's interfaces file names. Slice 3F updates `CONTEXT.md`, the deep dive and the runbook, and the integrator's docs grep is a gate.

**Repo and data.**
- Never commit anything under `data/`, `.claude/launch.json`, `outputs/report-0919269.html` or `outputs/sessionphotos/0919269/`, and never write under `outputs/` outside the gate's tree. Never read `.env`.
- The main checkout `C:/Users/spide/Documents/claudecode/aboutlastnight` is the director's. Never start, stop or call their server on port 3001. Never open, read or copy `reports/data/checkpoints.sqlite`. Renders use the integrator's database copy through `CHECKPOINT_DB_PATH`, on a throwaway port.

**Commits.** Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bypass the pre-commit hook. Never `git stash`. The push is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

## Rulings

The spec's section 17, restated so each brief can point at one.

- **R1. The pick is on the weave.** `picked`, an angle's id, written by the meeting's gate and owned by code as `answer` is: stripped from a writer's or a rework's output and put back after every rework while its angle survives by id. It stays out of the diff's fields and the printed fields. With none, the first angle is open. After a send-back that drops the picked angle, the first angle is open.
- **R2. A flip is its own edit.** A thread flipped into or out of an angle is one edit, carried while the angle's list holds (or lacks) that thread, and restored by adding or removing that thread alone. A thread the director added is one edit, the thread and its place in the angle together. A whole-list edit is not used: it loses each flip's author at the next look and undoes a pass's own threads and order (survey Q2).
- **R3. The Reweave's hold is the Reweave's alone.** After a Reweave's rework, code puts back by id, from the version it started from, every other angle, every thread outside the open angle, and every connection that does not join two of its threads, and records each put-back in the round's report. The round's check rework and fact-check fix are automatic passes, which change only what their findings name, in any angle.
- **R4. One question per subject is the writer's rule** (C15). Code holds each question to 40 words across its `about`, `question` and `changes`, and holds its `thread` to a thread the weave holds. No code rule tells two questions on one subject from two honest questions on two ledger entries without false failures (survey Q5).
- **R5. The length is counted per angle.** `MEETING_WORD_BOUND` 450, `MEETING_WORD_FLOOR` 350. Each angle's page is counted open, on the same writer's share, with its own overhead. The check fails when any angle's writer words pass that angle's allowance. The writer's task asks for about 325 words of its own.
- **R6. A weave with no `angles` is old.** `oldThreadOf` flags it wherever it sits, as piece 1 flags phase 4's shapes, under one message that names neither shape.
- **R7. The connection strike goes from the weave.** Its machinery goes with it (survey Q2's list). The map's struck beats keep `isStrike` and the report's `struck`.
- **R8. The verdict's thread is in every angle.** The page locks it in the open angle. The gate refuses a director's version whose picked angle lacks it, naming the thread.
- **R9. Only the picked angle's changes go.** The gate stores every other angle as the meeting showed it, by id, so a change the director made to an angle they did not send is not kept and makes no edit. A change to a thread's name or line is the thread's, and shows in every angle that uses it.
- **R10. A question whose thread the weave no longer holds sits by the pitch.** Code drops the stale `thread` after every rework, answered or not, and keeps the answer.
- **R11. "From your notes" travels with the first angle.** The settled weave prints it only when the picked angle is the first, the one that rests on the director's read.

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, the most likely first. Each names the slice whose tests pin it.

1. **The director flips a thread in at one look and another at the next.** Both flips stand as the director's after the second round: the first is still marked theirs, the map writer is still told it may name either in the gap note, and a pass that drops either has it put back (3C).
2. **A Reweave rewords a thread the open angle shares with another angle.** The new words show in both. Every other angle's pitch, and every thread and connection outside the open angle, comes back as it was, each put-back in the report (3C).
3. **The director picks angle 2 and approves with no change.** No edit is recorded and no Reweave is offered. The settled weave is angle 2's, without "from your notes", and the map's page shows angle 2's story and question (3B, 3C).
4. **An answered question beside a thread that a rework drops or renumbers.** The question moves to the pitch with its answer, and the settled weave prints the answer (3B).
5. **A director's version whose picked angle lacks the verdict's thread,** sent from the harness's `--approve-file` past the console's lock. The gate refuses it, naming the thread (3B; 3E's harness test sends it).

## What this piece changes for the director

| Stop | Today (100326) | After |
|---|---|---|
| Story meeting | 413 words. One story, with threads in roles (main thread, grounds it, complicates it, mirrors it, carries it forward), left-out threads with reasons, a strike on each connection, the convergence, and two questions on one subject | At most 450 words. Two or three angles side by side, the open one as its pitch (headline, story, question, why it lands, where it ends up), its threads in or out by plain names, the questions beside what they change, the connections between the threads in. Pick, rewrite in place, flip, add, answer; Approve, Reweave or Send back |
| Map | The settled weave's story and question at the top | The same page, with the story and question of the angle the director sent |
| Article | Unchanged | Unchanged |

## Slices and how they run

**How the work is split.** The weave's shape is one slice (3B): its schemas, writer, checks, settled reading, view model and fixtures, with about 470 tests, change in the same commits for the suite to stay green, as piece 1's 1B did. The view model goes with the shape, because the length check counts the page the view model builds. The director's edits on the new shape are a second large slice (3C): they read the shape but change no field of it, and they are the riskiest part, so they get a seat of their own. The rule text, the page's component, the old-shape guard, and the skill and docs run beside them.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| 3A | The rule files | prompt | small | the phase branch is cut |
| 3B | The weave as angles | prompt, plumbing, the meeting's view model | large | the phase branch is cut |
| 3C | The director's edits on angles, and the Reweave | plumbing, prompt | large | 3B merges |
| 3D | The meeting's page | screen | medium | 3B merges |
| 3E | Sessions on piece 1's shapes, and the harness | plumbing, scripts | small | 3B merges |
| 3F | The standalone skill and the docs | docs | small | 3B merges |

**Runs.** Each run is one workflow.

| Run | Slices | Long pole |
|---|---|---|
| 1 | 3A, 3B | 3B |
| 2 | 3C, 3D, 3E, 3F | 3C |

- The integrator merges a run's slices into the phase branch in the table's order, rebasing each onto the last with the full suite at every commit, then cuts the next run's worktrees from the new head.
- Before each run the integrator writes that run's interfaces file: the names earlier slices chose, who owns which functions of a shared file, the `CLAUDE.md` sections each slice updates, and the pinned hashes each slice may move.
- After run 1 the director's changes to an angle's pitch and its flips are not yet edits (survey Q2): the suite stays green, and nothing merges to `main` until 3C has.
- The piece merges to `main` once, after the gates, when no session is paused at the meeting or a later stop (spec section 13). The integrator asks the director before merging.

**Why not split further.**
- Splitting the shape between two subagents would have both edit the same functions and tests, and the suite would fail between their commits.
- The view model and its operations (pick, flip, a pitch field, a thread's field, add a thread, answer) build what the director-side schema validates, and the length check pages it, so they are 3B's. The page slice keeps only the component.
- The Reweave's hold reads the flips and the share, which are 3C's, so it is 3C's.

**Who owns which file.**

| Slice | Owns |
|---|---|
| 3A | `craft-story.md` (C1, C16) and `craft-questions.md` (C15); their sentence pins in `lib/__tests__/rule-set.test.js` |
| 3B | `WEAVE_SCHEMA`, `WEAVE_SYSTEM_PROMPT` (`lib/sdk-client/subagents.js`); `lib/weave.js` (all but `shareOf`'s edit buckets and the strike functions); the weave writer's format, task and questions line and the check node with `meetingPageWords` (`arc-specialist-nodes.js`); the `arc` identity line (`lib/theme-config.js`); the fact check's opening and `TRUTH_FINDING_QUOTE.arcs` (`evaluator-nodes.js`); `lib/prompt-renderers/settled-weave.js`; `lib/writer-questions.js` (`thread`); `settledStoryOf` (`lib/map.js`); `settledWeaveThreadsOf` and `mapCheckInputsOf` (`map-nodes.js`); `mapTask`'s line on a thread brought into the story (`lib/prompt-builder.js`); in `lib/meeting.js`, `DIRECTOR_WEAVE_SCHEMA`, `ID_COLLECTIONS`, `directorWeaveProblems`, `meetingResume`'s storing of the director's version (R8, R9) and `meetingCheckpointData`; the meeting's view logic in `console/checkpoint-view-logic.js` (`DIRECTOR_WEAVE_SHAPE` but `struck`, `meetingView` and its operations, `meetingPayload`, `meetingWeaveProblems`, the pending slot's draft, the thin-notes line); the meeting's lines and headings in `lib/stop-pages.js`; the weave fixtures, `scripts/lib/fixed-weave.js`, and `references/schemas.md`'s weave section with `__tests__/unit/journalist-skill-path.test.js`; every pinned hash the settled weave or the weave fixtures move |
| 3C | `lib/hand-edit-diff.js`'s weave functions; `shareOf`'s edit buckets, `writersShareOf` and the strike functions in `lib/weave.js`; in `lib/meeting.js`, `meetingDirectorsThreads`, `meetingChangePlace`, `MEETING_FIELD_PLACES`, `THREAD_FIELD_PLACES`, `EMPTY_REWEAVE`'s reading, and `DIRECTOR_WEAVE_SCHEMA`'s `struck`; the rework's Reweave path in `arc-specialist-nodes.js` (`ARC_REWORK_CLAUSES`, `arcReworkCall`, `weaveFromRework`, `reviseArcs`, `ARC_REWORK_STRUCK_IDS`, `withoutStrikes`); `WEAVE_EDITS_FINAL`, `handEditsRule` and `reweaveScope` in `node-helpers.js`; in the console, `meetingWeaveChanges`, `reweaveHasSomething`, the meeting's change and mark words (`changedEditLine`'s places, `markLine`, `takenOutWords`, `markOfEntry`), `WEAVE_TEXT_FIELDS`, `ELEMENT_WORDS`, `setConnectionStruck` and `DIRECTOR_WEAVE_SHAPE`'s `struck`; the reweave render in `scripts/render-prompts.js` |
| 3D | `ArcSelection.js`; the meeting's CSS; the meeting's rows of `console/unsaved-input-logic.js`; `__tests__/unit/console-meeting-screen.test.js` |
| 3E | `lib/old-thread.js`; `lib/__tests__/fixtures/old-shapes.js`; the planting rule in `scripts/render-prompts.js`; the harness's `--angle` option (`scripts/lib/stop-payloads.js`, `scripts/e2e-walkthrough.js`) |
| 3F | `SKILL.md`, the rest of `references/schemas.md`, and the agents `journalist-arc-analyzer.md`, `journalist-outline-generator.md`, `journalist-article-generator.md` and `journalist-article-validator.md`; `CONTEXT.md`; `docs/PIPELINE_DEEP_DIVE.md`; `docs/runbook/first-run-sheet.md` |

Each slice updates the sections of `CLAUDE.md` that describe what it changes, as its run's interfaces file names them.

## Gates

None makes a live model call. The director's next new session is the live test.

1. **The suite**, at the phase branch's head: exit 0, nothing skipped.
2. **The prompt checks,** on the integrator's database copy.
   - Render the weave writer, its automatic rework, its Reweave rework (with a planted pick, a flip and a pitch edit), the meeting's fact check, the map writer, the article writer and the article judge, from 092026, 092626 and 0926262. The copy's threads hold no weave, so the renderer plants the fixed one.
   - For every call: it builds; it reads exactly the rule files phase 4 spec section 11 gives it; no retired wording (main thread, the role labels, the stronger main thread, a struck connection) and no em-dash in any instruction text; `<DIRECTOR_GUIDANCE>` last where a writer has one; its size recorded beside piece 1's.
   - The settled weave in the map writer's render is the picked angle alone: its pitch, its threads in order with their evidence, the threads left out by name, the connections between its threads.
   - The record view and the director-words renderers print byte-identical text on `main` and on the branch (the integrator's renderer-level script).
3. **The click-through,** on fixture threads cut from the database copy with the fixed weave planted, through the mock server. The meeting is read against the spec's worked example: the memo's order, the count by `wordsShown` with each angle open, no roles and no ids. Planted cases:
   - picking an angle, rewriting its headline, flipping a thread in and one out, adding a thread, answering a question, and the payload each button sends;
   - the verdict's thread locked;
   - a question beside a thread, and one by the pitch;
   - a check still failing, shown beside its line;
   - Reweave offered only with a change or a note;
   - a thread paused at the map on piece 1's shapes, with its message and its rollback;
   - the map's page showing the sent angle's story.
4. **The docs grep.** No description of the roles, the main thread, the stronger main thread, the connection strike, or a meeting of 300 words survives in `CLAUDE.md`, the docs, the skill or the prompts, beyond the other meanings the survey's "Dismissed hits" lists (the map's struck beats, ARIA roles, a character's role).
5. **The final whole-piece review,** on Opus 5.5.

The gates prove the pipeline works. Whether the meeting works for the director is shown by their next new session, read with spec section 15's measures.

---

## Brief 3A: the rule files

**Intent.** The writers learn the angles from the rules they read. This slice writes the approved text into the rule files.

**Prompt.**
- `craft-story.md`: C1 and C16 as `rule-text-read.md` gives them, word for word.
- `craft-questions.md`: C15 as it gives it, word for word.
- The glossary is 3F's.

**Plumbing.** Report the retired wording: "main thread", "grounds it", "complicates it", "mirrors it", "carries it forward", "stronger main thread", "left out, with one line on why". The integrator adds each phrase to the removed-phrase list once no code text still carries it (3B and 3C remove the code's copies).

**Tests.** The rule-set lint holds: each item once; every pointer names an item the set states; no em-dash; no gendered Nova; nothing on the removed list. A test pins one sentence from each changed item. The pinned writer renders read the fixture stubs, so no hash moves.

**Verification.** Render the weave writer from 0926262 on the integrator's copy and read C1, C16 and C15 in place.

**Done.** The files carry the approved text, and the lint passes.

**Out of scope.** The prompts' own task lines and formats (3B, 3C).

---

## Brief 3B: the weave as angles

**Intent.** On 100326 the meeting showed one story, its threads in roles, a strike on each connection and two questions on one subject (spec section 2). The weave writer should pitch two or three angles over one shared set of threads, with plain thread names and one short question per subject, on a page of at most 450 words with any angle open (spec 3 to 5, 9). The meeting's view model gives the memo its lines (spec 5); 3D renders them.

**Plumbing.**
- **The shape** (`WEAVE_SCHEMA`; spec 17):
  - an angle is `{id, headline, gist, story, question, lands, ends, threads}`, `threads` the ids in the angle's order;
  - a thread is `{id, name, line, verdict?, evidence}`;
  - a question gains an optional `thread`, read beside `answer` in `weaveQuestionsOf`, never among the required fields;
  - the weave is `{angles, fromYourNotes?, threads, connections, questions}`, and the top-level `story`, `question`, `headline`, `convergence` and `strongerMainThread` go, with `role`, `reason`, `WEAVE_ROLES`, `MAIN_THREAD_ROLE` and `LEFT_OUT_ROLE`.
  - `DIRECTOR_WEAVE_SCHEMA` follows by derivation, with `picked` (R1) and `answer`; a thread the director adds needs only `id`, `name` and `line`. `struck` stays until 3C removes it with its machinery. `ID_COLLECTIONS` gains `angles`. The console's `DIRECTOR_WEAVE_SHAPE` follows, held equal by its test.
- **The pick** (R1). Code strips `picked` from a writer's and a rework's output, and puts the previous pick back after every rework while its angle survives by id.
- **The gate** (`directorWeaveProblems`, `meetingResume`): refuses a director's version whose picked angle lacks the verdict's thread, naming it (R8); stores every angle but the picked one as the meeting showed it, by id (R9).
- **The writer** (`weaveOutputFormat`, `WEAVE_TASK`, `weaveQuestionsFormatLine`, `WEAVE_SYSTEM_PROMPT`, the `arc` identity line):
  - The output format's placeholders give the new shape.
  - The task asks for two or three angles, the first from the director's read when the notes end with one (C1); one shared set of threads named for what happened, the verdict's in every angle (C16); one short question per subject, beside the thread its answer changes or by the pitch (C15); and the page within its bound, about 325 words of the writer's own (R5). It points at the items and restates none.
- **The checks** (`weaveFindings`, `validateArcStructure`; spec 9.1):
  - Two or three angles; each with every field, an id of its own, and thread ids the weave holds, the verdict's among them.
  - Story terms on each angle's lines, each thread's name and line, each connection's line.
  - Every thread the writer wrote has at least one piece that supports it, and every piece passes the evidence check.
  - A question's three fields within 40 words together, and its `thread` one the weave holds (R4).
  - The length per angle (R5): `meetingPageWords` counts the page once per angle, open in turn, on the writer's share, each with its overhead from `weaveWritersTextBlank`. The check names the angle and its longest lines. `_arcValidation.words` keeps the worst angle's count with its id.
  - The role, left-out reason, convergence and stronger main thread checks go. The strike's checks stay until 3C.
- **The fact check.** `buildEvaluationUserPrompt('arcs')` opens by naming the angles and the threads they draw on; `TRUTH_FINDING_QUOTE.arcs` names an angle's line. It judges every angle.
- **The settled reading** (spec 8; survey Q1):
  - One helper in `lib/weave.js` returns the picked angle (by `picked`, else the first), its threads in its order (the director's added threads after the writer's), the threads left out, and the connections between its threads. `storyConnections` reads it.
  - `renderSettledWeave` prints the angle's headline, story, question, why it lands and where it ends up; "from your notes" only when the picked angle is the first (R11); its threads with their evidence; the threads left out by name; the connections between its threads; each question with the thread it sits beside by name and the director's answer; the meeting-change marks (M3) as now.
  - `settledStoryOf`, `settledWeaveThreadsOf`, `mapCheckInputsOf` and `meetingDirectorsThreads` (its added threads; the flips are 3C's) read the helper.
  - `mapTask` (`lib/prompt-builder.js`) keeps its structure. A thread it calls brought into the story is now one flipped into the angle; its wording follows where it names a role.
- **The questions** (R10). After every rework, code drops a `thread` the weave no longer holds, answered or not.
- **Fixtures.** `rework-state.js`'s weave, the mock client's weave, `mock-responses/weave.json`, and `scripts/lib/fixed-weave.js` in the new shape: three angles, the verdict's thread in each, a thread no angle uses, a question beside a thread and one by the pitch; the fixed weave's planted check failure stays. `references/schemas.md`'s weave section and `journalist-skill-path.test.js` follow the schema.

**The meeting's view model** (spec 5 and 6; the component is 3D's).
- `meetingView` gives, in order: the verdict and "from your notes", or the thin-notes line when the notes end without the director's read; the angles, each its headline and `gist`, the open one marked open; the open angle's pitch; its threads in the story, in order, each its name and line with its fold, and the questions beside each; the threads left out by name, each opening in place to its line; the add line; the connections between the threads in, each its line; the questions by the pitch with the pitch.
- Its operations: pick an angle; set a pitch field of the open angle; set a thread's name or line; flip a thread into the open angle (after the angle's own) or out of it, the verdict's thread locked; add a thread `{id, name, line}` under the next free id, in the open angle; answer a question.
- `meetingPayload` sends the director's version with its pick. `meetingWeaveProblems` holds the gate's decisions on one corpus, R8 among them.
- No line or label the view gives carries an id. Each element's `label` and `labels` follow piece 1's convention.
- `lib/stop-pages.js` prints these lines, folds marked folded, so `wordsShown` counts the page as it opens; `PAGE_HEADINGS` follow.

**Prompt.** The weave writer's output format, task and questions line; the system prompt and the `arc` identity line; the fact check's opening and finding quote; the settled weave the map writer, the article writer and the article judge read.

**Invariants.**
- The weave writer still reads everything it reads today.
- No buried memory's id, owner or text reaches the weave or a piece.
- `<DIRECTOR_GUIDANCE>` stays last.
- The fact check's mark still skips a judged weave on a replay.
- The answers behave as today.

**Tests.**
- The shape, each field and the director-side schema, on a weave in 100326's shape with invented text.
- Each check: one angle, four angles, an angle naming a thread the weave lacks, an angle without the verdict's thread, a question of 79 words, a question beside a missing thread, story terms in an angle's `ends`.
- The length per angle: the longest angle's page fails alone; a page the director lengthened is never refused.
- The pick: stripped from output, kept through a rework, the first angle when its angle is dropped.
- The gate: R8's refusal (Review focus 5); R9's storing of the other angles as shown.
- The settled reading: angle 2 picked, with no "from your notes" (Review focus 3); its threads in order with the director's added thread after; the connections between its threads only.
- A question whose thread a rework drops moves to the pitch with its answer (Review focus 4).
- The view's order, its operations, the verdict's lock, the stop page's lines and count.
- The survey's section 8 lists the tests this moves. Each pinned hash this moves is updated with the reason.

**Verification.** Render the weave writer, its automatic rework, the fact check, the map writer and the article writer from 092026 and 0926262 on the integrator's copy, where `scripts/render-prompts.js` plants the fixed weave. Record each section and the sizes. Build the meeting's page from the fixed weave with `lib/stop-pages.js` and count it with each angle open.

**Done.** The full suite passes. The renders read as stated. The meeting's view model gives the memo.

**Out of scope.** The director's edits on angles, the Reweave's scope and the strike's removal (3C); the component (3D); old sessions and the harness (3E); the skill's other files and the docs (3F); the change review (piece 2); the map's page (piece 4).

---

## Brief 3C: the director's edits on angles, and the Reweave

**Intent.** After 3B, the director's changes to an angle's pitch and its threads are not edits: nothing marks them, nothing holds them through a pass, and Reweave stays off for them (survey Q2). This slice makes each one an edit, scopes a Reweave to the open angle and holds everything outside it, and takes the strike out (spec 6, 7; R2, R3, R7).

**Plumbing.**
- **The edits** (`lib/hand-edit-diff.js`):
  - `weaveEditsBetween` reads the angles, `ELEMENT_KEYS` and `WEAVE_ELEMENTS` register them, and each field of an angle's pitch is one edit, found by the angle's id.
  - A flip is one edit of a new kind (R2), carried, restored, reported, marked, given its meeting id (M3), and listed in `<HAND_EDITS>` by the thread's name and the angle. The sidebar's move-within (`between`) is the nearest precedent.
  - A thread the director added is one edit with its place in the angle (R2).
  - `standingAtMeeting` and `withShownEdits` read the new kinds across looks: each flip keeps its author at the next look (Review focus 1).
  - The pick is no edit; `reweaveHasSomething` and `EMPTY_REWEAVE` read a pick alone, or answers alone, as nothing to fit in.
- **The director's share** (`shareOf`, `weaveDirectorsShare`, `writersShareOf`): the director's pitch lines and the threads they flipped in are theirs, never held to the writer's rules nor counted toward the writer's words, and the settled weave marks them.
- **The words.** `meetingDirectorsThreads` reads the flips in; `meetingChangePlace`, `MEETING_FIELD_PLACES`, `THREAD_FIELD_PLACES`, `editWhere` and `weaveReportText` name an angle's line and a flipped thread by their words, never ids. The console's change and mark words follow (`changedEditLine`'s places, `markLine`, `takenOutWords`, `markOfEntry`), and `meetingWeaveChanges`, `WEAVE_TEXT_FIELDS` and `ELEMENT_WORDS` stay held equal to the server's.
- **The Reweave** (R3; spec 7):
  - `reweaveScope`, `ARC_REWORK_CLAUSES.reweave`, `WEAVE_EDITS_FINAL`, `handEditsRule` and `WEAVE_EDIT_LINES_GUIDE` say the rework fits the director's changes into the open angle, names it, and keeps every other angle as written.
  - After the rework, code puts back by id every other angle, every thread outside the open angle and every connection not between two of its threads, from the version it started from, and records each put-back.
  - After a send-back, the pick stays when its angle survives by id (R1).
- **The strike goes** (R7): the survey's Q2 list, `withStruckConnections`, `isSameConnection`, `freshConnectionId`, `ARC_REWORK_STRUCK_IDS`, `withoutStrikes`, `DIRECTOR_WEAVE_SCHEMA`'s `struck`, and the console's `setConnectionStruck` and `struck`, each with its tests. The map's `isStrike` and the report's `struck` stay.
- **The render.** `scripts/render-prompts.js` renders the Reweave's rework from the fixed weave with a planted pick, a flip and a pitch edit.

**Prompt.** The Reweave's scope, clause and edit lines; `<HAND_EDITS>` for the new kinds.

**Invariants.**
- An automatic pass still changes only what its findings name, and code puts back every standing edit it changed.
- A send-back's rework still may change an edit, saying why, and is not restored.
- The meeting's marks, its concerns and the map's meeting changes read as today for every kind piece 1 had.

**Tests.**
- A pitch field edit at one look stands at the next and is restored after a pass that changed it.
- Two flips at two looks: both stand as the director's; a pass that drops one has it put back alone, leaving the pass's own order and threads (Review focus 1).
- A thread the director added: one edit, restored with its place.
- A Reweave that rewords a shared thread, rewrites another angle's pitch, drops a thread another angle names and adds a connection outside the open angle: the shared rewording stands; the rest is put back and reported (Review focus 2).
- A pick alone and answers alone: no edit, no Reweave (Review focus 3).
- The words: no id in any line the meeting or the map's page prints for the new kinds.
- The console's diff held equal to the server's on one corpus with the new kinds.
- The strike's tests retire, each named in the return.

**Verification.** Render the Reweave's rework and the automatic rework from the fixed weave on the integrator's copy, and read `<HAND_EDITS>` and the scope in place.

**Done.** The full suite passes. The renders read as stated.

**Out of scope.** The component (3D); old sessions (3E); the change review (piece 2).

---

## Brief 3D: the meeting's page

**Intent.** The meeting's page shows 3B's view model as a memo: the angles side by side, the open one's pitch, its threads in or out, the questions beside what they change, where the threads meet, and the note box with three buttons (spec 5 and 6; the mock-up "Story meeting: angles (100326)").

**Screen.**
- `ArcSelection.js` renders `meetingView`'s fields in its order, and wires its operations: the angle cards pick; each pitch line and each thread's name and line edit in place; each thread's control flips it in or out, the verdict's locked with its line; the left-out threads open in place; the add line adds a thread to the open angle; each question's box answers it beside its thread or the pitch.
- No role picker, no strike, no convergence or stronger main thread section.
- The buttons, the held lines and the two-click send-back as today. `unsaved-input-logic.js` keeps the add line's hold.
- The CSS follows the mock-up in the console's look; the role, left-out and struck classes go.

**Tests.** `__tests__/unit/console-meeting-screen.test.js` holds the component to the view model's fields and runs the pick, a flip, a pitch edit, an add and an answer, checking each action it dispatches. `__tests__/unit/console-stop-pages.test.js` holds the headings.

**Verification.** The integrator's click-through covers the wiring. The return lists each element of the page and the view-model field it renders.

**Done.** The full suite passes, and the page renders 3B's view model.

**Out of scope.** The map's page (piece 4).

---

## Brief 3E: sessions on piece 1's shapes, and the harness

**Intent.** A session paused on piece 1's shapes must not replay on mixed shapes (spec 13; R6). The harness must be able to pick an angle.

**Plumbing.**
- `isOldShapeWeave` flags a weave with no `angles`, which covers piece 1's shape and phase 4's; `OLD_SHAPES_MESSAGE` names neither. `oldThreadRollbackState` clears the weave, and with it the pick.
- `lib/__tests__/fixtures/old-shapes.js` gains piece 1's shape, invented text.
- `scripts/render-prompts.js` plants the fixed weave over piece 1's shape and logs why.
- The harness: `--angle <n>` with `--approve arc-selection` sets the pick and sends the meeting's payload through `scripts/lib/stop-payloads.js`; the help and `STOP_ACTIONS` follow. A test sends Review focus 5's version through `--approve-file` and reads the gate's refusal.

**Tests.** `lib/__tests__/old-thread.test.js` and `__tests__/integration/old-thread-graph.test.js` gain piece 1's shape: refused at the meeting, at the map and complete; rolled back to the meeting, where the angles are written fresh. The harness's option and its refusal.

**Verification.** Run the harness's step mode against a fixture thread on the mock server, with `--angle 2`.

**Done.** The full suite passes.

**Out of scope.** Any reading of piece 1's weave as one angle.

---

## Brief 3F: the standalone skill and the docs

**Intent.** The skill and the docs say what the pipeline now does.

**Docs.**
- `SKILL.md`: the story meeting in chat, where the director picks an angle, rewrites it, flips threads, adds one and answers; the three actions.
- `references/schemas.md` beyond 3B's weave section, and the four agents: the arc analyzer pitches angles; the outline generator, the article generator and the article validator read the settled angle.
- `CONTEXT.md`: the glossary entries as `rule-text-read.md` gives them, word for word.
- `docs/PIPELINE_DEEP_DIVE.md` and `docs/runbook/first-run-sheet.md`: the meeting as angles.

**Tests.** `journalist-skill-path.test.js` and `retired-craft-files.test.js` hold.

**Verification.** The integrator's docs grep.

**Done.** The full suite passes, and the grep finds nothing retired.

**Out of scope.** `CLAUDE.md`'s code sections (each code slice's); the roadmap (the integrator's).
