# Phase 4: the story meeting and the map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling): an implementer reads the code and writes their own, test first.

**Goal.** The director settles the story before anything is planned, steers the plan in minutes, and finishes the article at their own desk. Each decision stop shows a decision, not a document, and what the director leaves at a stop is exactly what the next writer works from.

**Spec.** `docs/superpowers/specs/2026-10-02-story-meeting-and-map.md` is the authority; its section 15 lists where the design meets the code. The rule text is `rule-text-read-3.md` in this phase's workspace (`.superpowers/sdd/2026-10-02-phase-4-story-meeting-and-map/`), which the director approved on 2026-10-03; its section D is the code text this plan builds. The vocabulary is `CONTEXT.md`'s: story meeting, weave, main thread, connection, reweave, story map, beat, photo description.

**Builds on.**
- The fixes before phase 4 (`docs/superpowers/plans/2026-10-02-before-phase-4-fixes.md`), merged to local `main` (`cb643c8`):
  - the director's edits are final: standing edits at a stop, the judges' concerns, the restore after an automatic pass, moves and removed text;
  - photos published at web size;
  - photos spaced at assembly, with one rule for whether a page prints a hero.
- The standalone path's branch, `sdd/p3-standalone`, rebased onto that `main` and merged to local `main` on 2026-10-03 (`7d4195b`), after the director answered its three calls (R13).

The phase branch, `feat/phase-4-story-meeting-and-map`, is cut from `7d4195b`.

**Architecture.**
- **The arc stage writes one weave** into a new channel, `weave`.
  - The interweaving call and the long write-ups go.
  - Code checks the weave. One fact check scores the truth criteria, and one automatic fix runs if it finds a breach.
  - Then the meeting opens.
- **The meeting** returns the weave as the director left it: edits, roles, added threads, struck connections and answers. The director approves it, asks for a reweave, or sends it back. Going back to the meeting reopens it as the director left it.
- **The map writer replaces the outline writer.**
  - It reads the settled weave first, as its task, and writes the map into the `outline` channel.
  - The map holds the six slots with jobs, beats and photos, the top photo, the dropped slots and what was left out.
  - Code checks the map, with one automatic rework; no judge reads it.
  - Going back to the map reopens it as the director left it.
- **The article writer** reads the settled weave, then the map, then what it reads today.
  - Code stamps the headline, the deck and the top photo from the map.
  - The article judge keeps only the truth criteria.
  - The fact check's findings say where they are.
- **The article stop is the desk.** Every editor is visible, with move, delete and insert. The preview is the page as the director has it, and the marks sit beside their paragraphs.
- **Photos.** A leave-out box at the photos stop. A photo the director deletes at the desk joins the same list.
- **The director's edits are final at every stop.** An automatic pass never changes a line the director wrote and never brings back what they struck. A judge or a check that disagrees lists a concern beside the line.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides; the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger with its cost if wrong.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt, a task line, a schema description, a label, a judge's question.
- State each target positively, and each rule once, with its reason. A task line names the rule items it applies ("as C16 (`<craft-story>`) sets them out") and never restates them.
- No em-dashes. Nova is never gendered.
- The rule files carry the approved read word for word.

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written. Only code marks what changed.

**The director's edits are final, at the meeting, on the map and at the desk** (spec section 7; R11).
- An automatic pass or a reweave never changes a line the director wrote. Code restores any field such a pass changed, field by field, and the report records each restore.
- An automatic pass or a reweave never brings back what the director struck. Code strikes again anything that came back under its id, records it, and flags only what it cannot match.
- A judge's finding or a code check's failure located in the director's text is a concern, listed beside the line, never a must-fix and never a rework's trigger.
- A send-back may change one of the director's edits only where its structural change means the edit no longer fits. The stop then lists each edit that changed, and why.
- The fixes before phase 4 built this for the article stop; the meeting and the map reuse the same machinery.

**Themes** (R1; the director, 2026-10-03: the detective theme is the reminder that different themes can be built for different games).
- The new stages are built so that a future theme is new files rather than new code. The weave and the map are generic shapes: a story, threads, connections, questions; slots, beats, photos.
- Everything a theme decides lives in that theme's files: its rule set, its mode blocks and identity line, its map slots with their order and default headings, its schemas and its templates.
- Code reads the theme from state, and never names the journalist's slots, Nova or NovaNews outside the theme's files.
- Only the journalist runs; the detective is parked at start (R1).

**No other changes.**
- No model, effort or pin changes.
- No npm install, update or ci. If a step seems to need a package, stop and report it.

**One source of truth.**
- A rule two places apply is one function or one constant, which both call.
- The console keeps a copy of a server constant only where it cannot import it, and a test holds the two equal.

**State channels.** A new or removed channel needs:
- its Annotation in `lib/workflow/state.js`;
- its default in `getDefaultState`, with the channel count in `__tests__/unit/workflow/state.test.js`;
- its place in the `ROLLBACK_CLEARS` lists or in `ROLLBACK_CLEARS_EXEMPT`;
- an entry in `APPEND_REDUCER_FIELDS` (`lib/api-helpers.js`) if it appends.

`FRESH_START_CLEARS` is derived from the channel set. The completeness pins are in `lib/__tests__/rollback-clears-completeness.test.js`.

**Stop types keep their names** (R3). `arc-selection`, `outline` and `article` stay the stop types. The console's labels become "Story meeting", "Map" and "Article".

**Replays.** A replay never re-runs a paid call on output already judged or acted on. Every new skip condition gets a test that replays from START.

**Console.**
- Logic that decides a payload, a label, a mark or a count goes into a dual-export pure module with node tests. Components stay thin.
- A new module loads before its consumers (`console/index.html`, pinned by `__tests__/unit/console-checkpoint-order.test.js`).
- Each decision stop is built to be read in minutes (spec section 3).
- A screen slice's payload builders are tested by feeding their output through `buildResumePayload` on a state in the new shape.
- There is no DOM harness, so the integrator's click-through covers the wiring.

**Tests.**
- No live model calls; the SDK maps to its mock. Each brief's Verification runs with no model call, usually as a graph run with the mock SDK, seeded at the stop. The live forms are the gate's.
- Every commit passes the full suite, with the exit code guarded. Test counts may fall only by the tests a brief retires, and the return names each one.
- **Delete-last.** A slice that rebuilds a stage owns that stage's tests: the graph tests that seed it, the console's copies of a shape it changes, and its part of the shared fixtures (`lib/__tests__/fixtures/rework-state.js`, `render-writers.js`, `__tests__/mocks/`, `__tests__/fixtures/mock-responses/`). It plants its new channel in the full-pipeline fixtures, and deletes each old symbol only together with its last reader. So no commit on the chain fails.
- Tests that pin today's text or shape break by design. The slice that changes them updates them, with the reason, and updates any pinned hash it moves.
- Run the broad sweep after any fail-loud change.
- No test reads `data/`. A test in a real session's shape uses invented text, because the repo is public.

**What the integrator owns.** The integrator owns three things:
- recomposing `lib/__tests__/writer-prompts-pinned.test.js` where two slices of one run moved the same pin;
- recomposing the channel count in `__tests__/unit/workflow/state.test.js` where two slices of one run changed it;
- the removed-phrase list in `lib/__tests__/fixtures/removed-phrases.js`.

**Docs.**
- `reports/CLAUDE.md` and `docs/PIPELINE_DEEP_DIVE.md` are shared by section. Each slice updates the text that describes the behaviour it changes, and the run's interfaces file names the sections.
- Slice 4.12 makes the last pass.

**Repo and data.**
- Never commit anything under `data/`, `.claude/launch.json`, `outputs/report-0919269.html` or `outputs/sessionphotos/0919269/`.
- Never read `.env`.
- Never touch the production database or the director's server on port 3001. Renders and live runs use a copy the integrator makes, through `CHECKPOINT_DB_PATH`, on a throwaway port.

**Commits.**
- Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never bypass the pre-commit hook. Never `git stash`.
- The push is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

**Surveys.** Four read-only surveys of `main` at `94768e3` map the integration points with file and line: `arc-stage.md`, `outline-stage.md`, `article-stage.md` and `cross-cutting.md`. They are in this phase's workspace under `surveys/`, with the plan review's findings under `plan-review/`. A worktree does not carry them, so read them by the workspace path. Line numbers locate; the code decides, and the fixes before phase 4 have moved some lines since.

## Review focus

These are inputs a person will meet that the spec implies but no ordinary test exercises, the most likely first. Each names the slice whose tests pin it.

1. **A thread from before phase 4,** paused at any stop from the arc stop on (photos and character-IDs included), or complete. It is told to roll back to the story meeting, and nothing replays on mixed shapes (4.11).
2. **A meeting approved with changes:**
   - a role changed;
   - a left-out thread brought in;
   - a thread the director added, with no receipt;
   - a connection struck;
   - a connection asked for in the note;
   - a new main thread.

   The map writer fits each change in and marks it, and each mark names its source (4.5, 4.6).
3. **A reweave with no note, and a send-back,** at the meeting.
   - The reweave fits the changes in and keeps every untouched line, and code marks what changed.
   - The send-back rethinks the weave.
   - Each opens a new round, runs the checks and the fact check again, and keeps every answer (4.5).
4. **The director's lines at the meeting and on the map.** A fact check or a code check that disagrees with one lists a concern beside it. An automatic pass leaves every line as the director wrote it, and leaves struck items struck (4.5, 4.6).
5. **Going back to the meeting or the map.** Each reopens as the director left it, with no model call. After going back to the meeting and approving again, the new article is fact-checked (4.5, 4.6).
6. **A player the director leaves off the map,** by an unanswered question or a strike. The map check and the article's roster check treat it as the director's decision (4.6, 4.7).
7. **A debated theory the director strikes from the map.** It stays out of the article, and neither the writer nor the judge brings it back (4.7).
8. **The desk.**
   - Move a photo across sections, delete a card, delete a photo, insert a paragraph, leave a block empty.
   - The empty block is caught before approve and before send-back.
   - The preview shows the edited page as it will print, spacing included.
   - Approve publishes exactly that.
   - After a send-back, the deleted photo stays out (4.2, 4.3, 4.10).
9. **A photo left out** with the box. It appears nowhere: not on the map, the page or the published folder. Unticked after a rollback to the character-IDs stop, it comes back (4.2).

## What this phase changes for the director

| Stop | Today | After |
|---|---|---|
| Arc stop | Five arc write-ups, about 4,300 words; checkboxes; one note box | **The story meeting**, about 400 words: the verdict; the story, its question and a working headline; your words it rests on; every thread with its role and receipt; the connections and the convergence; the questions with answer boxes. You edit the words, change roles, add a thread, strike a connection and answer each question. Then you approve, reweave or send back |
| Outline stop | A JSON plan of about 6,000 words that scripts the article | **The map**, about 450 words: headline, deck and top photo; the settled story; each section's job, beats and photos; the dropped sections; who appears where; the cards and the expected length; what was left out. You edit any line, move or strike a beat, add a beat, move a photo, and bring something back from left out |
| Article stop | Block editors beside a preview of the writer's draft, a score and writing notes | **Your desk**: every editor visible; move, delete and insert blocks; a preview of the page as you have it; flags as marks beside their paragraph; no score and no writing notes. What the automatic passes did is folded below |
| Photos stop | Exclusions only if the parse reads one in your text | A "leave this photo out" box on each photo |

What goes:
- the interweaving call and its plan;
- the long write-up for each thread;
- the every-player rule at the arc stage;
- the outline's scripted prose and the outline judge;
- the judges' writing notes and scores at every stop;
- the writers' questions after the meeting;
- the arc stage's second and third judge passes.

## Slices and how they run

**The chain.** The weave, the meeting's plumbing, the map and the article change one chain of data: each stage writes what the next reads. They are built one after another, 4.4 to 4.7, each merged into the phase branch before the next starts (R10). The other slices are built beside them.

| # | Slice | Layers | Starts after |
|---|---|---|---|
| 4.1 | The rule files | prompt | the director approves the read |
| 4.2 | The leave-out box | screen, plumbing | the phase branch is cut |
| 4.3 | The desk's hands | screen, plumbing | the phase branch is cut |
| 4.4 | The weave | prompt, plumbing | the director answers R1 and approves the read |
| 4.5 | The meeting's plumbing | plumbing, prompt | 4.4 merges |
| 4.6 | The map | prompt, plumbing | 4.5 merges |
| 4.7 | The article | prompt, plumbing | 4.6 merges |
| 4.8 | The meeting on screen | screen | 4.5 merges |
| 4.9 | The map on screen | screen | 4.6 merges |
| 4.10 | The desk's marks | screen | 4.3 and 4.7 merge |
| 4.11 | Old threads and the render markers | plumbing, screen | 4.7 and 4.9 merge |
| 4.12 | The harness, the stops log, docs and the standalone path | plumbing, docs | 4.10 and 4.11 merge |

**Runs.** Each run is one workflow, with the suite criterion above.

| Run | Slices |
|---|---|
| 1 | 4.2 and 4.3; 4.1 if the read is approved; 4.4 if R1 is answered and the read approved |
| 2 | 4.5 (and 4.4, 4.1 if they waited) |
| 3 | 4.6 and 4.8 |
| 4 | 4.7 and 4.9 |
| 5 | 4.10 and 4.11 |
| 6 | 4.12 |

- A chain slice merges into the phase branch as soon as its review passes, so the next chain slice can start, even when that falls inside a run. The other slices merge at the end of their run, in the table's order. The integrator runs the full suite after every merge.
- Before each run, the integrator writes that run's interfaces file. It holds:
  - the names earlier slices chose for shapes, channels, payload keys and functions;
  - who owns which lines of a shared file;
  - the docs sections each slice updates.
- The phase merges to `main` once, after the gate.

**Who owns which file.** A slice edits only what its row and its run's interfaces file give it. When it needs another change, it names the change in its return, and the integrator places it. The chain's slices never run beside each other, so each owns whatever its brief names.

| Slice | Owns |
|---|---|
| 4.1 | `.claude/skills/journalist-report/references/rules/*.md`; its sentence pins in `lib/__tests__/rule-set.test.js` |
| 4.2 | `console/components/checkpoints/CharacterIds.js`; `characterIdCards` and `characterIdsPayload` (`console/checkpoint-view-logic.js`); the character-IDs arm of `buildResumePayload` and the `character-ids` payload of `getCheckpointData`; `checkpointCharacterIds`' capture; `parseCharacterIds` and `finalizePhotoAnalyses`; the leave-out channel and the function that adds to it |
| 4.3 | A new dual-export desk module and its tag in `console/index.html`; `console/components/checkpoints/Article.js`; the article arms of `buildResumePayload`; the preview endpoint; `validateBundleShape`; the desk's CSS and the pencil pins; `diffBundle` |
| 4.4 | The arc schemas and prompts in `lib/sdk-client/subagents.js`; `lib/workflow/nodes/arc-specialist-nodes.js`; the arc judge (`evaluator-nodes.js`), its truth questions, and the scoring rules a truth-only judge reads; the arc routing (`graph.js`); the `weave` channel, the timeout bookkeeping's channel, `specialistAnalyses` and `REVISION_CAPS.ARCS`; `RULE_SET_CALLS` entries `arc`, `interweaving` and `judge-arc`; `lib/writer-questions.js` (the weave's questions) and the kind labels' copy; the arc writer's, the arc rework's, the fact check's and the interweaving renders (`scripts/render-prompts.js`, `scripts/lib/render-calls.js`); the `/start` refusal of the detective |
| 4.5 | `checkpointArcSelection` and the character-IDs guard; `routeAfterArcCheckpoint`; the arc rounds in `incrementArcRevision`; `buildRevisionContext`'s round selection (`node-helpers.js`); the arc-selection arms of `buildResumePayload` and `getCheckpointData`; the evaluator's arc approval skip; `lib/writer-questions.js` (the answers); a weave diff in `lib/hand-edit-diff.js`; the settled-weave renderer; `ROLLBACK_CLEARS['arc-selection']`, `ROLLBACK_COUNTER_RESETS['arc-selection']`, `PHASES_INVALIDATED_BY`, `buildEvaluationInvalidationStubs`, `pruneGateNotes` and a table of its own for it, the rollback handler's prune check and their pins; `/api/session/:id/arcs`; the reweave's and the send-back's renders |
| 4.6 | `lib/schemas/outline.schema.json`; the map writer and its rework (`buildOutline*`, `outlineWriterInputs`, `generateOutline`, `reviseOutline`, `checkpointOutline`); `heroImage` from the map's top photo; the packages, whole (R5); the map's check node, routing, `CODE_CHECKS` entry and trace trigger; the outline judge's removal; `REVISION_CAPS.OUTLINE`; `RULE_SET_CALLS` entries `outline` and `judge-outline`; `diffOutline` and the map's baseline channel; the outline arms of `buildResumePayload` and `getCheckpointData`; `ROLLBACK_CLEARS['outline']`, `ROLLBACK_COUNTER_RESETS['outline']`, `PHASES_INVALIDATED_BY['outline']` and their pins; the console's outline shape validator, its kinds copy and the shared Everyone function (`console/outline-edit-logic.js`); R4's channels and their last readers; the content-bundle probe; the outline generator agent's rule list; the theme config's map slots |
| 4.7 | The article writer and its rework; `generateContentBundle`'s stamp; the article judge and its truth questions; `RULE_SET_CALLS` entry `judge-article`; `lib/content-bundle-fact-check.js` and `buildFactCheckArgs`; `outlineThesisOf`; the article payload of `getCheckpointData`; the article arms' hand-off of a deleted photo to the leave-out list; `content-bundle.schema.json` and the detective's frozen copy; `_outlineGuidance`'s last readers |
| 4.8 | `ArcSelection.js`; the meeting's view models and payload builders, its questions view among them; the stop labels (`console/utils.js`); `CHECKPOINT_RECEIVED`'s handling of the meeting's slot; every console string that names the arc stop or its cost; `app.js`'s fallback payload for the meeting; the console's line on the parked detective; the meeting's CSS |
| 4.9 | `Outline.js`; `console/outline-edit-logic.js`'s editors; the map's view models and payload builders (`outlineReviewPayload`, `steeringView` and `scopeLabel` as the map uses them); `app.js`'s fallback payload for the map; the map's CSS |
| 4.10 | `Article.js`'s marks and folds; `factCheckSummary`, `evaluationView`, `approveLabel` and `traceView`; `EvalBar`, `TracePanel` and `WriterQuestionsPanel`; the desk's echo of the settled story; the marks' CSS |
| 4.11 | The old-thread guard (server and console); `scripts/render-prompts.js`' markers and options |
| 4.12 | `scripts/e2e-walkthrough.js`, whole; `writerQuestionsView`'s last reader; the stops log; the last docs pass, `docs/runbook/first-run-sheet.md` and the rule-set spec's pointer; the standalone path (R13) |

## Gates

1. **The suite**, at the phase branch's head: exit 0, nothing skipped.
2. **The prompt checks,** with no model calls.
   - The arc writer is rendered from 092026, 092626 and 0926262, on a copy of the database.
   - Every later call is rendered from the same threads with the fixed weave and map that `scripts/render-prompts.js` plants when a thread holds none, then again from the gate 3 thread.
   - For every call:
     - it builds, and reads exactly the rule files spec section 11 gives it;
     - no retired wording and no em-dash appear in any instruction text;
     - `<DIRECTOR_GUIDANCE>` is last where a writer has one;
     - its size is recorded.
   - The record view and the director's words are compared with `main` at the renderer level. The integrator runs one scratch script, in a checkout of `main` and in one of the branch, that prints the record view and the director-words and notes renderers from each thread's state. The two outputs are byte-identical.
3. **One live run** on a copy of 0926262's thread, with the session's photo folder copied into the gate tree.
   1. Roll back to the story meeting. The weave is written fresh, and its fact check runs.
   2. At the meeting, ask for one reweave. Then approve, with a role changed, a thread added, a connection struck and each question answered.
   3. At the map, go back to the meeting, then approve again.
   4. Roll back to the character-IDs stop, tick one leave-out box, and approve.
   5. On the map, edit a beat, strike a beat and move a photo, then approve. The article writer's prompt in the call log carries the map as left.
   6. At the desk, edit, move and delete blocks, one photo among them, then send back once. The deleted photo stays out of the rework.
   7. Approve, and publish.

   It passes when:
   - every call completes on its pinned model with valid output;
   - every stop loads, and every prompt carries its rule files;
   - the director's edits come through every automatic pass unchanged;
   - going back to the meeting costs no call, and the article after it is fact-checked;
   - the left-out photo is nowhere;
   - the page publishes;
   - `weave.approved.json`, `map.approved.json` and the stops log are written, and spec section 13's four measures can be read from them.

   Durations and the map's word count are recorded beside the phase 3 gate's.
4. **The click-through** of the meeting, the map, the desk, the photos stop and an old thread, on fixture threads cut from the run. Planted cases cover what the run did not produce:
   - a map check's rework, and a map check still failing;
   - a struck theory, and an unanswered player question;
   - a meeting after a send-back, with the edits it changed;
   - a meeting with a code check still failing;
   - an article issue escalated at the cap;
   - a concern beside a director's edit;
   - a finding whose excerpt the director cut;
   - an old thread paused at the photos stop.
5. **The final whole-phase review,** on Opus 5.5.

The gate proves the pipeline works. Whether the article improved is shown by the director's next session, read with spec section 13's measures.

---

## Brief 4.1: the rule files

**Intent.** The rule files name each stage's job, and phase 4 moves the jobs. This slice writes the approved rule text into the files, so every writer reads the new jobs.

**Prompt.**
- Replace C1, C2, C4, C7, C8, C15 and C16 with the approved text, word for word, from section A of `rule-text-read-3.md` (approved 2026-10-03). C4 carries the director's change of 2026-10-03: the article runs to about 1,500 words at most, and the article writer aims at the map's expected length, so a thin session makes a shorter article, never a padded one.
- Replace the changed lines of T1, T2, T5 and T9 with section B's text.
- Item headings keep their ids. C8's and C15's titles change as the read gives them.

**Plumbing.** Report the retired wording that names the old jobs, such as "The outline names the thesis" and "the interweaving call". The integrator adds each phrase to the removed-phrase list once no code text still carries it.

**Tests.** The rule-set lint holds:
- each item once;
- every pointer names an item the set states;
- no em-dash and no gendered Nova;
- nothing on the removed list.

A test pins one sentence from each changed item.

**Verification.** Render the arc writer, the outline writer and the article writer from 0926262 on the integrator's copy, and read each changed item in place.

**Done.** The files carry the approved text, and the lint passes.

**Out of scope.** Wiring calls to new lists: 4.4, 4.6 and 4.7 do that.

---

## Brief 4.2: the leave-out box

**Intent.** Today a photo is left out only if the character-ID parse reads an exclusion in the director's free text (spec section 8). The director should tick a box on the photo instead, and the box should decide.

**Plumbing.**
- The character-IDs stop sends each photo's leave-out choice beside its description. A new channel keeps the ticked filenames.
- One exported function adds filenames to the list. It also sets `exclude: true` in each one's mapping, creating the mapping when the photo has none, so the exclusion holds however long after the parse it is added. 4.7 calls it for a photo the director deletes at the desk.
- **The mapping decides.** The character-ID parse writes an explicit `exclude` into the mapping of every photo the stop showed, after it builds the mappings and before `finalizePhotoAnalyses` reads them:
  - true when the box is ticked or the photo is on the list;
  - otherwise the parse's own value;
  - otherwise false.

  `isPhotoExcluded` reads the mapping first, so a stale `photoAnalyses[].excluded` mark never decides for a photo the director saw. `isPhotoExcluded` already governs the writers' photo lists, the hero, the fact check and publish.
- The choice survives today's traps (`surveys/outline-stage.md` answer 6):
  - the parse skipping, or replacing the mappings wholesale;
  - a structured update skipping the stop's description file;
  - a payload with no current choices.
- A rollback that clears `characterIdMappings` clears the channel too.
- `getCheckpointData` sends the current choices, so the boxes show them on a remount.

**Screen.** One "leave this photo out" box on each photo card. A ticked choice survives a remount.

**Invariants.**
- An excluded photo appears in no writer's list, as no hero, and on no page.
- A photo with the box clear follows the director's text, as today.

**Tests.**
- The payload, through `buildResumePayload`.
- The explicit mark in each of the parse's paths.
- A box unticked after a rollback to the character-IDs stop, with a stale analysis mark.
- The exported function, on a photo with a mapping and on one without.
- The clears.
- The view model.

**Verification.** On a graph run with the mock SDK, seeded at the character-IDs stop, approve with one box ticked. The photo is gone from the outline writer's photo list, as the hero and from the article writer's PHOTOS.

**Done.** The tests pass, and the integrator's click-through shows the box.

**Out of scope.** Captions (phase 9).

---

## Brief 4.3: the desk's hands

**Intent.** The article stop is the director's desk (spec 6.3). The director:
- sees every editor;
- edits any text in place, the headline, the deck, the captions and the section headings included;
- moves, deletes or inserts any block, and an empty block is caught before they approve or send back;
- sees the page as they have it;
- publishes exactly what is on the desk.

Today the pencils show only on hover, there is no move, delete or insert, and the preview shows the writer's draft (`surveys/article-stage.md`, answers 3 and 4).

**Plumbing.**
- **A dual-export desk module** of pure block operations, loaded before `Article.js` (a tag in `console/index.html`). It returns new bundles and error lists, and never mutates. Its operations:
  - insert a paragraph or a quote;
  - move any block within a section or across sections;
  - delete any block;
  - find empty blocks, whitespace-only text included;
  - check the headline and deck limits the schema sets;
  - report, for each section, the blocks inserted, deleted, moved or edited since the stop opened. 4.10's marks anchor on this report.
- **A preview endpoint** renders a bundle the console sends through the publishing `TemplateAssembler`, photo spacing included, with the same script strip and `<base href>` as `htmlPreview`.
- **The checks on every approve and every send-back,** edited or not: the empty blocks and the headline and deck limits. `validateBundleShape` stays never stricter than the schema.
- **The desk shows what prints.**
  - The editors for fields the page never prints go: pull quotes, the top-level photos, and the writer's tracker whenever the ledger's tracker prints in its place.
  - The word count reads the bundle as edited.
- **The byline edit** keeps `guestReporter`; today `saveBylineEdit` drops it.
- **The director's moves and deletes are standing edits.** `diffBundle` records a move within a section as a move, as the fixes record a move across sections.

**Screen.**
- Every editor visible, in a gutter or rail so no control covers prose. The pencil pins in `__tests__/unit/console-editable-pencils.test.js` change, with the reason.
- Move, delete and insert controls on each block. A move resets the open editor, because blocks are addressed by index.
- An editor for each section heading.
- The preview of the edited page.

**Invariants.**
- Approve sends exactly the bundle on the desk.
- The server's schema gate stays the last word on shape.

**Tests.**
- Each operation, pure, on bundles in both themes' shapes.
- The checks on an untouched draft.
- The endpoint rendering an edited bundle with spacing.
- The byline edit.
- A move within a section recorded as a move.
- The change report after each operation.
- The approve payload through `buildResumePayload`.
- The gate's call counts in `__tests__/unit/console-edit-gates.test.js`.

**Verification.** In node, with no browser:
- build the desk's approve payload from a fixture bundle with a photo moved across sections, a card deleted and a paragraph inserted and left empty;
- the check names the empty block;
- once it is filled, the endpoint's render shows the rest as it will print.

**Done.** The tests pass, and the integrator's click-through shows the desk.

**Out of scope.**
- The marks beside paragraphs, the folded trace and the evaluation bar (4.10).
- Editing on the rendered page (phase 12).

---

## Brief 4.4: the weave

**Intent.** On 0926262:
- the director's notes ended with their read of the session, and the arc writer filed it as a caveat;
- the interweaving call wrote links the arc cards hid;
- five arcs of 1,300 to 2,100 words each made a 4,300-word stop;
- the arc judge ran three times.

The arc writer should write one weave of about 400 words that starts from the director's read. Code checks it, and one fact check fixes errors of fact, once (spec sections 4.1, 4.2, 4.5 and 10).

**Plumbing.**
- **The weave's shape** replaces `CORE_ARC_SCHEMA` (the writer) and `PLAYER_FOCUS_GUIDED_SCHEMA` (the rework). It holds, in the vocabulary of `CONTEXT.md`:
  - the story, in one to three sentences;
  - the question it carries;
  - a working headline;
  - "from your notes": the director's words quoted exactly, present only when the story starts from the director's read;
  - the threads, each with an id, its claim, its role and its strongest receipt. The roles are main thread, grounds it, complicates it, mirrors it, carries it forward, and left out with a one-line reason. A receipt is a document id from the record, or the ledger. The schema lets a thread omit its receipt or its reason, so a thread the director adds stays valid; the code checks require them on the writer's threads;
  - the connections, each with an id, its kind (a shared person, a moment, a document, a line), the two threads it joins, and what it is;
  - the convergence;
  - optionally, a stronger main thread: the thread and its reason, in one line;
  - the questions, each with an id, its kind, what it is about, the question, and what its answer changes. The kinds are C15's three cases: a player, a pronoun, and a figure that looks wrong, in the ledger or as said in the room.
- **The questions.**
  - The weave's questions get their own schema property and normaliser in `lib/writer-questions.js`.
  - The old property stays for the outline and bundle schemas until 4.6 and 4.7 drop the field.
  - The console's kind labels follow the new kinds, with their test.
- **The channels.**
  - `weave` holds the weave, and the full-pipeline fixtures plant it.
  - The arc rework's timeout bookkeeping gets a channel of its own; today it lives in `_arcAnalysisCache`.
  - The dead `specialistAnalyses` goes, from the state and from every rollback list.
  - The old arc channels stay until their last readers go (4.6, delete-last). The arc analysis stops writing them.
- **The interweaving call goes:**
  - `enrichWithInterweaving` and `mergeArcsWithInterweaving`;
  - `INTERWEAVING_PRINCIPLES` and the other `INTERWEAVING_*` constants;
  - `RULE_SET_CALLS['interweaving']`;
  - its render and its tests.

  `hasInterweavingPlan` stays for the outline judge, which 4.6 removes. `surveys/arc-stage.md` answer 2 lists every place.
- **The arc writer** writes the weave in one call, from what it reads today (spec 4.1).
  - Its output format and task describe the weave, and the task points at C1, C15 and C16 for the story, the questions and the threads.
  - The lens work stays in its reasoning.
  - The every-player lines go from its system prompt and from the ROSTER PCs line.
  - Its rule files stay as `RULE_SET_CALLS['arc']` gives them.
- **The code checks** replace the journalist side of `validateArcStructure`. Each failure is one line that names the defect and its fix:
  - each writer's thread has a receipt, and every receipt given names a document in the record, or the ledger;
  - the room's verdict is one of the threads;
  - every connection joins two threads the weave holds;
  - each writer's left-out thread has its reason;
  - "from your notes" appears word for word in the director's notes or corrections (`lib/grounding.js`);
  - the writer's words in the fields the meeting prints come to no more than a bound stated once as a constant: 500 words for "about 400".

  Roster coverage leaves this stage. The checks write `validationResults` on every outcome, stamped for the weave they checked. A failed check sends the weave back for one automatic rework, which reads the check's lines under their own `CODE_CHECKS` label.
- **The fact check.** The arc judge scores only the truth criteria, for the weave.
  - Its weighted criteria, its craft files (`RULE_SET_CALLS['judge-arc']` becomes core only) and its craft-findings section go.
  - Its truth questions are worded for the weave: the verdict told as the room's official story, with the debated theories left to the map (T2 as rewritten). A breach names the thread it is in. Each wording is pinned.
  - The scoring rules a truth-only judge reads are stated for it: no weighted average and no advisory criteria, with `overallScore` computed from the truth criteria. 4.7 moves the article judge onto the same rules.
  - When it finds a breach, one automatic fix runs. The code checks run again on the fix, and the stop opens without a second judge call.
  - A code check still failing when the stop opens is kept for the meeting to show.
- **Replays.** The fact check marks the weave it judged and skips a marked weave. The fix keeps the mark, and a director's round (4.5) clears it. Neither the checks' rework nor the fact check runs again on a weave already judged.
- **The budget** (R6). Each round allows one check rework and one fact-check fix, counted apart.
- **The automatic passes** run through `reviseArcs` with the weave's schema. They keep everything their findings do not name, word for word (R23). The free timeout retry keeps working through its new channel.
- **The detective** (R1).
  - `/start` refuses the detective theme with a message.
  - The arc stage's detective branches go, with the code and the tests only they used.
- **Renders.** `scripts/render-prompts.js` renders the arc writer, the arc rework's automatic pass (`arc-revision.txt`) and the fact check, and drops the interweaving render and its marker. When a thread holds no weave, it plants a fixed one written for the tool, as it plants `FIXED_NOTES`: invented text with an edit, an answer, a struck connection and a new main thread. `scripts/lib/render-calls.js` follows the fact check's arguments.
- **Citations.** Comments that cite the rule-set spec's section 8 for who reads what, where this slice changes `RULE_SET_CALLS`, cite this phase's spec, section 11.
- **The meeting itself is 4.5's.** Until it lands, the old arc stop shows nothing useful; nothing runs live between runs.

**Prompt.** The arc writer's output format and task, the fact check's questions and prompt, and the automatic rework's task, through `buildRevisionContext` as today.

**Invariants.**
- The arc writer still reads the record, the morning timeline, the director's notes and corrections, the accusation word for word, the whiteboard reading, the roster with pronouns and the rule set.
- No buried memory's id, owner or text reaches the weave (`lib/__tests__/buried-memory-sentinel.test.js`).
- `<DIRECTOR_GUIDANCE>` stays last.

**Tests.**
- The schema and each field, on a weave in 0926262's shape with invented text.
- Each code check, firing and silent.
- The routing: one check rework, one fact-check fix, then the stop, with no second judge call.
- The replay skips.
- The interweaving call's absence.
- The rule-set lists.
- The questions' property and kinds.
- An automatic pass keeping untouched text.
- The timeout bookkeeping.
- The `/start` refusal.

`surveys/arc-stage.md` answer 9 lists the existing tests these move.

**Verification.** Render the arc writer and the fact check from 092026 and 0926262. Record each section and the sizes.

**Done.** The full suite passes, and the renders read as stated.

**Out of scope.**
- The stop's payloads, the director's rounds and the screen (4.5, 4.8).
- The map (4.6).

---

## Brief 4.5: the meeting's plumbing

**Intent.** The arc stop becomes the story meeting (spec 4.3, 4.4). It carries:
- the weave;
- the verdict, printed by code from the parse;
- the questions with their answer boxes.

The director:
- edits the story, the question, the headline and the convergence;
- changes a thread's role, adds a thread, strikes a connection;
- answers each question, and leaves a note;
- then approves, reweaves or sends back.

What the director leaves is exactly what the map writer reads, and it stays final through every automatic pass.

**Plumbing.**
- **The director-side schema.** One schema for the weave as the director leaves it, derived in code from the writer's.
  - It allows answers.
  - It lets a thread the director added or re-roled have no receipt and no reason.
  - The payload gate and the console's validator use it. It is never sent to the SDK.
- **The payloads** (`buildResumePayload`). Each is validated against the director-side schema, and a malformed one is refused with its reason.
  - **Approve** carries the weave as the director left it, and an optional note. It sets the meeting's approval, which the evaluator's arc skip reads in place of `selectedArcs`.
  - **Reweave** carries the weave as left, and an optional note.
  - **Send back** carries a note, and the weave as left if the director edited it.
- **Rounds.**
  - A reweave or a send-back is a director's round, marked explicitly. The mark selects the scope in `buildRevisionContext`, the system prompt in `reviseArcs` and the questions' carry. None of the three reads the note's presence.
  - A director's round spends no automated budget, and opens a new one.
  - Its rework never reads findings from before the round.
- **Answers.**
  - Code keeps every answered question whole, apart from the model's output: its id, kind, what it is about, the question, what its answer changes, and the director's answer.
  - After every rework, whatever the rework returns, code puts each answer back on its question, and adds back any answered question the rework left out. No answer is ever read from a rework's returned questions.
  - Every rework keeps each question the director has not answered (C15).
  - The fact check after a director's round reads the answers as the director's words (T1), in the reads of its truth questions.
- **The meeting's edits.**
  - Code keeps the writer's last weave in its own channel. At every approve, reweave and send-back, it diffs the director's version against that baseline.
  - The diff and its baseline survive the photo, map and article rollbacks and R9's rollback to the meeting. The brief's tests name their clear points.
  - The edits stand, through the fixes' machinery: ids, survival through a rework, the restore after an automatic pass, a struck connection struck again by id, and the list of edits a send-back changed, with its reasons.
- **The guard** (R11). The fact check after a director's round reads the director's standing edits. A finding located in the director's text is a concern.
  - The code checks read only the writer's text: a thread the director added, their typed words, and the length they add are never a check's failure. A receipt the director typed that names no document is a concern.
  - Concerns go in the payload, beside their line.
- **A reweave.**
  - Code stores the director's version before the rework, so a rework that times out keeps it, and the payload says the reweave did not run.
  - `reviseArcs` fits the director's changes in and keeps every line they did not touch, under a reweave's own `WHAT THIS REWORK DOES`.
  - Code holds the reweave's output to the director's edits as it holds an automatic pass: it restores their lines and strikes again what they struck.
  - Code marks what the writer changed, from the director's version against the rework's.
  - The checks and the fact check run again within the new round, and the meeting reopens.
- **A send-back.** The rework rethinks the weave as the note asks (TH7). The checks and the fact check run again, and the meeting reopens.
- **The route** after the stop has three outcomes: approve goes to the photos, while reweave and send back go to the rework.
- **The settled weave.** One renderer prints the weave as the director left it, for every later writer:
  - the edits, the roles and the added threads;
  - every question, with its answer word for word or marked as unanswered, and what its answer changes;
  - each change the director made at the meeting, marked, by the diff's ids.

  Struck connections are gone from it. 4.6 and 4.7 call it.
- **The payload** `getCheckpointData` sends at `arc-selection`:
  - the weave and `evidenceIndex`;
  - the verdict, through the inputs `verdictView` and `votesView` read;
  - the questions with any answers;
  - a code check still failing;
  - the concerns;
  - the marks after a round;
  - the edits a send-back changed;
  - the standing notes and the round counters;
  - a reweave that did not run.
- **The approval note** joins `directorGateNotes` as an approval note. `_outlineGuidance` is no longer written.
- **The saved version.** The approved weave is written to `data/<id>/analysis/weave.approved.json`.
- **The character-IDs guard** reads the weave, and its message names the story meeting.
- **`/api/session/:id/arcs`** serves the weave.
- **Going back to the meeting** (R9). A rollback to `arc-selection` keeps:
  - the weave as the director last left it, with its fact-check mark, its answers, and the diff and its baseline;
  - the meeting's notes;
  - the photo stops' choices.

  It clears the approval, the map, the article and `evaluationHistory`, and prunes the map's and the article's rejection notes as the later rollback points do. The meeting reopens with no model call, and the article written after it is fact-checked. The touch points are:
  - `ROLLBACK_CLEARS['arc-selection']` and `ROLLBACK_COUNTER_RESETS['arc-selection']`;
  - the note pruning, which gets a table of its own: the stops each rollback invalidates, apart from `PHASES_INVALIDATED_BY`'s evaluation stubs. Today the rollback handler prunes only where it writes stubs, and the stubs replace the history's clear. So the meeting's point prunes the notes and writes no stubs;
  - `PHASES_INVALIDATED_BY`, `buildEvaluationInvalidationStubs`, `pruneGateNotes` and the rollback handler's prune check;
  - the completeness pins, including `SKIP_FIELDS['arc-selection']`.
- **Until 4.6.** The packages node still reads `selectedArcs`, which nothing writes after this slice. Graph tests that run past the meeting seed it, as `workflow.test.js` does today.
- **Renders.** `scripts/render-prompts.js` renders the reweave and the send-back, beside the automatic pass 4.4 renders.

**Prompt.** The reweave's and the send-back's instructions, through the revision context's `WHAT THIS REWORK DOES`, stated once (TH7, R23).

**Invariants.**
- An automatic pass or a reweave never changes a line the director wrote at the meeting, and never brings back a connection they struck.
- A replay never re-runs a call on a weave already judged.

**Tests.**
- Each payload through the director-side schema.
- The route's three outcomes.
- Round marking: a reweave with no note gets the reweave's scope.
- Answers kept through a reweave, and through a send-back whose rework returns no questions at all.
- A reweave that paraphrases a director's line, or brings back a struck connection: restored and struck again.
- The fact check reading an answer after a round.
- The renderer, with answered and unanswered questions of each kind.
- The diff past approve and through the rollbacks.
- The guard and the concerns.
- The restore and the re-strike.
- The marks.
- A reweave that times out.
- Going back to the meeting: no call; the notes and the edits kept; the next article fact-checked.
- An old-shape thread rolled back to the meeting: a fresh weave and its fact check.
- The character-IDs guard on that path.

**Verification.** On a graph run with the mock SDK, seeded at the meeting:
- change a role, add a thread with no receipt, strike a connection and answer a question;
- ask for a reweave with no note. The meeting reopens with the changes marked, the answers kept and the director's lines intact;
- approve. The settled weave renders with every change.

**Done.** The full suite passes.

**Out of scope.**
- The screen (4.8).
- The map (4.6).

---

## Brief 4.6: the map

**Intent.** The outline was a script four times the article's length, and 38% of the draft's five-word phrases came from it (spec section 2). The map lays the settled weave across the sections in about 450 words:
- the beats name their material;
- the article writer writes the prose;
- the length follows from what the map holds (spec 5.1, 5.2 and 5.4).

**Plumbing.**
- **The map's shape** replaces the fields inside `outline.schema.json`'s six slots. It holds:
  - the headline and the deck, with the content bundle's limits taken from one shared constant;
  - the top photo, which the article prints as its hero;
  - the gap note: one line, plus the players it raises, present only when the record cannot carry part of the story, a player cannot be placed, or a link the weave lacks was seen;
  - for each slot it uses: a heading, its job in one sentence, its beats and its photos;
  - each beat, with:
    - an id and its kind (scene, receipt, line, figure);
    - its material named: the document id, the speaker and the line, or the ledger entry;
    - the roster players it shows;
    - its card's document id, when it is a card;
    - the connection that lands in it, if any;
  - each photo with its filename, beside a beat when it belongs with one, or by itself in the section where its people appear (spec section 8, C2);
  - the dropped slots, each with its reason;
  - left out: the material considered and not used, each item in the beat's shape, so one brought back is whole;
  - the expected length, labelled as the writer's estimate;
  - when the director changed the weave at the meeting, what the map changed to fit it. Each entry names its source: a meeting edit's id, or the director's meeting note.

  The writers' questions leave the outline's schema. The console's outline shape validator, its root keys and its kinds copy follow the schema, with their tests.
- **The slots are the theme's.** The map's slots, their order and their default headings come from the theme's config (`lib/theme-config.js`; the journalist's six), and the stop's payload carries them for the screen, so a future theme supplies its own slots without new code (the global constraint "Themes").
- **The director-side map schema,** derived in code from the writer's, allows beats the director added or brought back. The payload gate and the console's validator use it.
- **The map writer** (`generateOutline`) reads the settled weave first, as its task, through 4.5's renderer.
  - Then it reads what the outline writer reads today: the record and the morning timeline, the director's notes and accusation, the photos with the director's descriptions, the roster with pronouns, and its rule files.
  - Code's hero pick (`selectHeroImage`) is offered as the top photo's starting point.
  - `RULE_SET_CALLS['outline']` loses `craft-questions`. The `<SHOULD_CONSIDER>` from the arc stage goes.
- **The top photo is the hero.** Code writes `heroImage` from the map's top photo when the map writer returns, and again at the map's approve and send-back. So the article writer's PHOTOS, the judge's photo check and the stamp (4.7) all name the photo the page prints.
- **The packages go, whole** (R5):
  - `buildArcEvidencePackages`, its node and its channel;
  - the outline's and the article writer's package sections, and `articleWriterInputs`' package element;
  - the fact check's source-map argument: the card check's source texts come from the record alone, and a test shows every card source the packages supplied is still found;
  - the content-bundle probe's packages and its test.
- **R4's channels go with their last readers here:**
  - `narrativeArcs`, `selectedArcs` and `_arcAnalysisCache`;
  - `hasInterweavingPlan`, with the outline judge;
  - the readers outside the nodes: `server.js`'s counts, `lib/observability/state-snapshot.js` and the full-pipeline fixtures.
- **The map's code checks** run after the map writer and after each rework:
  - every roster player appears in a beat, or is among the gap note's players;
  - every kept photo is placed once. The kept set is the top photo plus `buildAvailablePhotos` with that photo as its hero, decided by `isPhotoExcluded`;
  - each card names a document in the record, and the cards number three to five;
  - every connection in the settled weave lands in a beat;
  - each entry in the map's changes to the weave names a meeting edit's id or the meeting note, and there are none when the director changed nothing and left no note.

  The checks and their reworks:
  - Each failure is one line that names the defect and its fix, with its own lists (the missing players, the unplaced photos, the valid ids).
  - A failure the director caused is a concern, never a rework: a strike, a move, an edit, a beat they added or brought back, or a photo they moved.
  - The checks write `validationResults` on every outcome, and mark the map they checked. A failed check sends the map back for one automatic rework under its own `CODE_CHECKS` label, and the trace marks the pass as `check`.
  - A check still failing after that rework opens the stop with its line shown. On a replay, the checks' rework never runs again on a marked map.
- **Everyone, the card count and the photo count** are built by one function from the beats' players. It lives in `console/outline-edit-logic.js`, which the console already loads and the server already requires, and the console uses it on the map as edited (4.9).
- **The outline judge leaves the graph:**
  - `evaluateOutline` and `routeOutlineEvaluation`;
  - its criteria and renders, and `RULE_SET_CALLS['judge-outline']`;
  - the article writer's `<SHOULD_CONSIDER>` from it;
  - the outline's evaluation stubs (spec 15). The note pruning keeps reading its own table, which 4.5 separated from the stubs.

  `REVISION_CAPS.OUTLINE` becomes one. `surveys/outline-stage.md` answer 2 lists every place, including `RESOURCE_ENDPOINTS`.
- **The stop** (`buildResumePayload`, `getCheckpointData`).
  - Approve and send-back carry the map as the director left it, validated against the director-side schema.
  - The payload carries the map, the settled story, Everyone and the counts, a check still failing, the concerns, the edits a send-back changed, the trace, the standing notes and the round counters.
  - The server's call to `dropRetiredOutlineFields` goes.
- **The director's edits on the map** stand, through the fixes' machinery, as the meeting's do (4.5):
  - code keeps the writer's last map in its own channel, and diffs the director's version against it at every approve and send-back;
  - `diffOutline` follows the map's shape;
  - the standing edits are the director's edited lines, the beats they moved, struck or added, the photos they moved, and the top photo they chose;
  - the diff and its baseline survive past approve, through the article rollback and R9's rollback to the map;
  - an automatic rework's changes to the director's fields are restored, and a struck beat that comes back is struck again by id, each recorded.
- **Going back to the map** (R9). A rollback to `outline` keeps the map as the director last left it, with its check mark, its standing edits and their baseline, and clears the approval and the article. The map reopens with no model call. The touch points are `ROLLBACK_CLEARS['outline']`, `ROLLBACK_COUNTER_RESETS['outline']`, `PHASES_INVALIDATED_BY['outline']` and their completeness pins.
- **The approved map** is saved as `data/<id>/analysis/map.approved.json` by `checkpointOutline`.
- **The detective** (R1). The outline stage's detective branches go.
- **Renders.** `scripts/render-prompts.js` renders the map writer and its rework, planting a fixed map written for the tool when a thread holds none (invented text, with a struck beat and a moved photo). `judge-outline.txt` goes.
- **Odds and ends.**
  - The outline generator agent's rule list follows `RULE_SET_CALLS['outline']`.
  - Comments that cite the rule-set spec's section 8 for who reads what cite this phase's spec, section 11.

**Prompt.** The map writer's task:
- lay the settled weave across the sections, in about 450 words;
- fit in each change the director made at the meeting, including a connection their note asks for, and mark it with its source;
- name each beat's material, and write no prose (C2);
- place each photo beside its beat, or with its people (C2);
- choose the top photo;
- list what is left out (C8);
- put a gap in the line at the top (C7, C16).

It points at those items and never restates them.

**Invariants.**
- No buried memory reaches the map.
- `<DIRECTOR_GUIDANCE>` stays last.

**Tests.**
- The schemas, the writer's and the director-side.
- Each check, firing and silent, including a gap-note player, a photo outside the story, and a failure the director caused.
- The routing: one check rework; a still-failing check at the stop; the replay skip.
- The outline judge's absence.
- Everyone and the counts.
- The packages' absence, with the card sources intact.
- The payloads through `buildResumePayload`.
- The top photo written to `heroImage`, at the writer's return and at a director's approve.
- The standing edits past approve, the restore and the re-strike.
- Going back to the map with no call, including a map whose check still failed when it first opened.
- The saved file.
- The console validator's parity with the schema.

`surveys/outline-stage.md` answer 8 lists the existing tests these move.

**Verification.** Render the map writer from 0926262 with the planted weave, and read its task and its inputs.

**Done.** The full suite passes.

**Out of scope.**
- The map's screen (4.9).
- The article (4.7).

---

## Brief 4.7: the article

**Intent.** The article writer writes all the prose from the beats. It uses every beat and adds none (spec 6.1). The article judge fixes errors of fact and never touches the director's lines (spec 6.2).

**Plumbing.**
- **The article writer and its reworker** read the settled weave first (4.5's renderer), then the map as the director left it, where they read the outline today, then what they read today.
  - `_outlineGuidance` goes with these, its last readers.
  - `<SHOULD_CONSIDER>` is gone from both.
- **The stamp** (R7). Code stamps the map's headline, deck and top photo into the first draft. Where the director wrote or chose one of them on the map, the stamp records it as the director's line at the article stop, so the fixes' guard treats it as the director's. The director edits them at the desk.
- **A photo the director deletes at the desk** joins the leave-out list, through 4.2's function, in the article arms of `buildResumePayload` at the approve or send-back that carries the delete. After a send-back it stays out of PHOTOS, the judge's photo check and publish.
- **The article judge** keeps only the truth criteria.
  - Its weighted criteria and craft files go, and `RULE_SET_CALLS['judge-article']` becomes core only.
  - Its craft-findings section, writing notes and frame go: no "immutable `selectedArcs`" and no "compelling gift". It reads 4.4's scoring rules for a truth-only judge.
  - Its truth questions follow section B, each pinned:
    - `verdictTruth`: every debated theory the map as the director left it carries, and none it struck;
    - `playersTruth`: the roster's pronoun, or the one the director's words give, or else the player's name;
    - `moneyTruth`: an entry raised at the meeting prints as the director's answer says, and with no answer it stays out of print (T5);
    - the answers from the meeting join the `reads` of `evidenceTruth`, `moneyTruth`, `playersTruth` and `verdictTruth` (T1).
  - It reads the settled weave and the map as the director left it.
  - `overallScore` stays in the output contract; 4.10 drops its display.
- **The fact check:**
  - It returns each finding with where it is: its kind, the section id and paragraph ordinal, or the card's id or the photo's filename, plus an excerpt and its message. The desk's marks (4.10) anchor on these; `surveys/article-stage.md` answer 5 describes today's segments.
  - Its roster check covers the players the map as the director left it places. A roster player the approved map does not place is the director's decision.
  - Its director text includes the answers from the meeting (T1).
- **The settled story** replaces `outlineThesis` in the article stop's payload.
- **The writers' questions** leave the content bundle's schema, the detective's frozen copy and the article stop's payload.
- **The content-bundle probe** builds the article call from a fixed weave and map through `articleWriterInputs`.
- **The detective** (R1). The article stage's detective branches for the old stages go.
- **Renders.** `scripts/render-prompts.js` renders the article writer, its rework and the judge from the planted weave and map. `scripts/lib/render-calls.js` follows the judge's arguments.
- **Citations.** Comments that cite the rule-set spec's section 8 for who reads what, where this slice changes `RULE_SET_CALLS`, cite this phase's spec, section 11.

**Prompt.** The article writer's task:
- the settled weave first, then the map as the director left it;
- every beat on the map and no others;
- the map's headings, and each photo where the map places it;
- the words, the order of the beats within a section, the transitions and each scene's detail are the writer's (C16).

The judge's prompt keeps the truth criteria and the director's edits section.

**Invariants.**
- No buried memory reaches the article's prompts.
- The fact check's code checks keep their status and prefixes.

**Tests.**
- The prompts' sections.
- The stamp, with a headline the director wrote on the map held as theirs.
- A photo deleted at the desk, then a send-back: the photo stays out.
- The judge's criteria and questions, `moneyTruth` with an answered and an unanswered figure among them.
- A struck theory staying out, through the judge.
- The findings' locations.
- The roster check against a map that leaves a player out.
- The settled story at the stop.
- The questions' absence.
- The probe.
- The full-pipeline graph tests end to end with mocks.

**Verification.** Render the article writer, its reworker and the judge from 0926262 with the planted weave and map. Record the sections and sizes.

**Done.** The full suite passes.

**Out of scope.** The desk's display of findings (4.10).

---

## Brief 4.8: the meeting on screen

**Intent.** The meeting is read and settled in minutes (spec 4.3, 4.4). The page shows about 400 words, in this order:
1. the verdict;
2. the story, the question and the working headline;
3. "from your notes";
4. the threads with roles and receipts;
5. the connections and where they converge;
6. the optional stronger main thread;
7. the questions, each with its answer box.

Beside these, the page carries:
- one line beside the story when the weave has no "from your notes": the director's notes end without a read of the session, so this story is the writer's proposal (the director, 2026-10-03, on thin notes);
- a concern beside the line it is about;
- the marks after a round;
- a code check still failing, in one line;
- the edits a send-back changed, with their reasons;
- one line when a reweave did not run;
- the note box, with the standing notes folded under it;
- the three buttons.

**Screen.**
- `ArcSelection.js` becomes the meeting:
  - the story, the question, the headline and the convergence editable in place;
  - a role picker on each thread;
  - an "add a thread" line, with a role;
  - a strike control on each connection;
  - an answer box on each question.
- Each receipt shows its document's name through `evidenceIndex`.
- The arc cards, the 3-to-5 selection, the evaluation bar and the questions panel go.
- The buttons are "Approve", "Reweave" and "Send back", and the stop's label is "Story meeting".
- Pending edits and answers survive a remount of the same weave version, and clear when a new version arrives, keyed the way `computeResetKey` keys the outline. The change is scoped to the meeting's slot in `CHECKPOINT_RECEIVED`.
- Every console string that names the arc stop or its cost says "story meeting" and R9's cost: `Photos.js`, `RollbackPanel.js`, `InputReview.js`, `AwaitRoster.js`, `EvidenceBundle.js` and `SessionStart.js`.
- `app.js`'s fallback payload for the meeting follows 4.5's.
- The questions show through the meeting's own questions view, with their answer boxes; the shared questions panel is not used here.
- The theme choice at session start says the detective is parked (R1).

**Plumbing.** The meeting's view models and payload builders, in `console/checkpoint-view-logic.js`, against 4.5's payloads and its director-side schema.

**Invariants.** The payloads the screen sends are exactly 4.5's, and what the director typed is sent as typed.

**Tests.**
- The view models.
- Each payload builder, through `buildResumePayload`.
- The pending edits across a remount and a new version.
- The load order and the labels.

**Verification.** In node, against fixture payloads at the meeting:
- before any round;
- after a reweave, a send-back, and a reweave that did not run;
- with a failing check and with a concern.

**Done.** The tests pass, and the integrator's click-through shows the meeting.

**Out of scope.** The harness (4.12).

---

## Brief 4.9: the map on screen

**Intent.** The director reads the map in minutes and edits any line: a job, a beat, the headline, the deck (spec 5.3). They:
- move a beat to another section, strike a beat (a struck beat joins left out), or add one with its players;
- move a photo, including to the top;
- bring anything back from left out into a section they pick;
- leave a note, then approve or send back.

To change the story itself, they go back to the meeting.

**Screen.** `Outline.js` becomes the map:
- the settled story at the top, read-only, with a way back to the meeting through the existing rollback;
- the gap note, a check still failing, and each concern beside its line;
- the edits a send-back changed, with their reasons;
- the headline, the deck and the top photo;
- the sections in the theme's slot order, which the payload carries, with their jobs, beats and photos:
  - each line editable;
  - move and strike controls on each beat, and move controls on each photo;
  - an "add a beat" line with its players;
- the dropped sections with their reasons;
- Everyone, the cards, the photos and the expected length. Everyone and the counts are rebuilt from the map as edited, through 4.6's shared function;
- left out, folded, each item with "bring back to" a section;
- the map's changes to the weave, each with its source;
- the note box with the standing notes folded under it;
- the trace of an automatic rework, folded below.

The writers' questions panel goes from the map.

**Plumbing.**
- `console/outline-edit-logic.js`'s editors follow the map's shape: init, build and merge.
- The map's view models and payload builders live in `console/checkpoint-view-logic.js`.
- `app.js`'s fallback payload for the map follows 4.6's.

**Invariants.** What the director leaves on the map is exactly what the article writer reads.

**Tests.**
- The edit logic, pure: move, strike, add, bring back, edit, the top photo.
- Everyone rebuilt after a strike.
- The payload builders, through `buildResumePayload`.

**Verification.** In node, against a fixture map payload: strike a beat, bring one back from left out, add a beat, move a photo to the top, and build the approve payload. The server accepts it, and the map it stores carries every change.

**Done.** The tests pass, and the integrator's click-through shows the map.

**Out of scope.** The article (4.7).

---

## Brief 4.10: the desk's marks

**Intent.** Nothing sits in front of the article (spec 6.3). A fact the judge could not fix and a code check's flag are marked beside their paragraph. There is no score and no note on the writing. What the automatic passes did stays folded below the article.

**Screen.**
- **Marks beside paragraphs, cards and photos,** anchored on 4.7's locations.
  - A finding anchors on its section and ordinal while no block at or before it in that section was inserted, deleted, moved or edited, as 4.3's change report says. Otherwise it anchors on its excerpt.
  - A finding whose excerpt the director's edit removed folds below as possibly resolved.
- **A judge's issue left unresolved at the cap** is anchored by the sentence it quotes.
- **The director's edits.** A concern about one of them is marked beside the edit, as is an edit a send-back changed, with its reason.
- **A finding with no block,** such as a roster gap, sits in one line beside the approve button, where its count is. A length finding anchors on its section's heading.
- **At the article stop:**
  - the evaluation bar's score and writing notes go;
  - RevisionDiff's banner and lists, the fact-check list and the trace fold below the article, and `traceView` drops scores there;
  - the writers' questions panel goes, and with it `WriterQuestionsPanel`, whose last use this is;
  - the echo above the headline shows the settled story and its question.
- **The approve button's count** stays structural only.
- **The harness** is 4.12's. The run-6 interfaces file carries these view models' names and signatures.

**Plumbing.** The view models in `console/checkpoint-view-logic.js`.

**Invariants.** The desk shows the article as it will print.

**Tests.** The view models:
- a finding on a paragraph, a card and a photo;
- a block moved above a finding, and an edited block anchored by excerpt;
- a removed excerpt;
- a concern and a changed edit beside the director's edit;
- a finding with no block;
- no score at the article stop.

**Verification.** In node, against a fixture article payload with planted findings, each mark's anchor resolves to its block.

**Done.** The tests pass, and the integrator's click-through shows the marks.

**Out of scope.** Editing on the rendered page (phase 12).

---

## Brief 4.11: old threads and the render markers

**Intent.** The new code never replays a thread built on the old shapes, and the director is told what to do with one. The render tool checks every new call.

**Plumbing.**
- **Old threads** (R2).
  - A thread with no weave whose stop is at or past the arc stop in `CHECKPOINT_ORDER` is detected. That covers a thread paused at the arc stop, the photos stop, the character-IDs stop, the outline or the article, and a complete one.
  - `/approve`, `/resume` and every `/rollback` except one to the story meeting or earlier answer 409 with the message "This session was started before the story meeting. Roll back to the story meeting to continue."
  - `GET /checkpoint` carries an old-shape flag, and the console shows the message, with that rollback, before any stop component renders.
- **`scripts/render-prompts.js`.**
  - `REQUIRED_MARKERS` follows the new calls, with a weave marker in the map and article renders.
  - `--compare` is retired for phase 4's renders, and `--sections` serves.

**Tests.**
- The guard on each stop and each request.
- The `GET /checkpoint` flag.
- The renders' markers.

**Verification.**
- With the mock SDK, an old-shape thread paused at the photos stop is refused on approve, and a rollback to the meeting proceeds.
- The renders build from the three stored threads.

**Done.** The tests pass.

**Out of scope.** The harness (4.12).

---

## Brief 4.12: the harness, the stops log, docs and the standalone path

**Intent.** The harness drives the new stops for the gate. The next session's readout has what spec section 13 counts. The docs describe the code as it is, and the standalone skill follows the stages.

**Plumbing.**
- **`scripts/e2e-walkthrough.js`,** whole.
  - Step mode prints the meeting, the map and the desk, through their view models (the run-6 interfaces file names 4.10's).
  - The approval payloads follow 4.5 and 4.6.
  - The stale field reads, the auto profiles, the local caps and the printed score go (`surveys/arc-stage.md` answer 8; `surveys/cross-cutting.md` answer 5).
  - `writerQuestionsView` goes with this, its last reader; the meeting's questions print through the meeting's own view.
- **The stops log** (R8). `data/<id>/stops.jsonl` gets a line:
  - each time a run pauses at a new stop or a new round of one, with the stop, the round and the words the stop shows, counted over what that stop's view models render (the server requires the dual-export modules);
  - for each director action (approve, reweave or send back), with its stop and round.

  Times are kept only to order the lines and join the call log.
- **The standalone path** (R13) follows the stages:
  - the arc analyzer writes the weave;
  - the outline generator writes the map;
  - the article generator reads both;
  - the agents' rule lists follow `RULE_SET_CALLS`.
- **Docs.**
  - The last pass over `reports/CLAUDE.md` and `docs/PIPELINE_DEEP_DIVE.md`, in the sections `surveys/cross-cutting.md` answer 6 lists.
  - CLAUDE.md's "Adding a new theme" is rewritten for the new stages: the files a theme supplies (its rule set, mode blocks, identity line, map slots, schemas, templates and config) and nothing else.
  - `docs/runbook/first-run-sheet.md` describes the new stops.
  - The rule-set spec gets a pointer to this phase's section 11.

**Tests.**
- The harness's payloads and step-mode prints.
- The stops log: new pauses only, and the word counts at each stop.
- The skill path's lint: `__tests__/unit/journalist-skill-path.test.js` and `lib/__tests__/retired-craft-files.test.js`.

**Verification.** With the mock SDK, a graph run through the meeting, the map and the desk writes one stops line per pause and per action, and the harness's step mode prints each stop.

**Done.** The tests pass, and the docs match the code.

**Out of scope.**
- Rebuilding the detective.
- The standalone path's deferred items (R13).

---

## Rulings (the integrator's, 2026-10-02, revised after the plan review)

- **R1. The detective theme is parked at start.** Confirmed by the director, 2026-10-03: the detective theme mostly exists as a reminder that the design should let different themes be built for different games in the future.
  - `/start` refuses it with a message (4.4), and the console says it is parked (4.8).
  - Its skill folder, templates and theme config stay as they are, as the worked example of a second theme.
  - Where a function this phase rebuilds has a detective branch for the old stages, the branch goes with the old stages, with the code and tests only it used. Each removal notes R1.
  - The theme system stays the seam a future theme plugs into (the global constraint "Themes").
  - Why: the detective has never run live, and its files contradict themselves (the roadmap's parked list). Keeping it on the old stages would carry two structures through one graph. After this phase, a detective session first needs its own files for the meeting, the map and the article.
  - Cost if wrong: the detective's files are written for the new stages when a detective session is planned, as the parked list expects.
- **R2. Old threads are not carried across.**
  - The phase merges when no session is mid-flight. The integrator checks that the production database is idle, and asks the director first if any thread is paused at or past the arc stop.
  - After the merge, an old-shape thread is told to roll back to the story meeting. That keeps the parse, the curation and the photos, and writes the weave fresh, about 15 minutes with its fact check.
  - Why: finishing on the old path needs an old server beside the new one, and a thread replayed on mixed shapes can spend paid calls the director never asked for.
  - Cost if wrong: one session's weave paid for again.
- **R3. Stop types keep their names;** the labels change.
  - Why: a rename strands paused threads and touches every rollback table.
  - Cost: none.
- **R4. The weave has its own channel.** The channels only the old arc stage used go, each with its last reader:
  - `narrativeArcs`, `selectedArcs`, `_arcAnalysisCache` and `arcEvidencePackages` in 4.6;
  - `_outlineGuidance` in 4.7;
  - the dead `specialistAnalyses` in 4.4.

  This follows R1; if the detective stays on the old stages, those channels stay for it.
- **R5. The arc packages go, whole, in 4.6.**
  - Why: the map writer reads the record whole, and the beats name the material. The packages repeat the record in cuts per arc, with the phase 2 risk of a cut that hides a document.
  - Cost if wrong: one record section to restore.
- **R6. The automated budget, per round.** A reweave or a send-back opens a new round.
  - At the meeting: one rework after a failed code check, and one fix after the fact check, with no second judge pass.
  - On the map: one rework after a failed check.
  - At the article: two, as today.
  - The director's rounds never spend it, and a replay never re-runs a pass on output already judged.
- **R7. The headline, the deck and the top photo come from the map.** Code stamps them into the first draft, and the director edits them at the desk.
  - Why: the map is where they are settled, and a stamp keeps the draft from drifting.
  - Cost if wrong: a better headline from the writer is lost unless the director types it.
- **R8. The saved versions.** `weave.approved.json` and `map.approved.json` beside `content-bundle.approved.json`, and the stops log, are what spec section 13 says the readout reads. The readout never reports the director's time at a stop (spec, Decisions).
  - Today, stop openings and returns live only in the checkpoint database (`surveys/cross-cutting.md` answer 8).
  - Cost: none.
- **R9. Going back to a decision stop reopens it as the director left it,** with no model call.
  - That holds for the meeting and for the map.
  - To have the weave or the map rewritten, the director sends it back.
  - A rollback to the article writes it again from the map as left, as today; the desk as a rollback target is phase 13's.
  - Why: the spec sends the director back to the meeting to change the story (5.3). Rewriting the weave or the map there would cost minutes of model time and the director's own edits.
  - Cost if wrong: a director who wanted a fresh weave or map clicks Send back once.
- **R10. The chain is built in sequence, each slice merged as soon as its review passes, before the next starts, and every commit passes the full suite.** Each chain slice owns the tests of the stage it rebuilds and deletes each old symbol with its last reader.
  - Why: each stage writes what the next reads. Building in order lets each slice read the real code of the one before, and delete-last keeps every commit green with no adapter.
  - Cost: the chain's four slices run one after another.
- **R11. The director's edits are final at every stop** (spec section 7). The meeting and the map reuse the fixes' machinery: the standing edits, the restore, the re-strike by id, the concerns beside the line, and the list of edits a send-back changed.
  - A reweave is held to the director's edits as an automatic pass is (spec 4.4: the director's words are final, and a reweave keeps what they did not touch). Only a send-back may change an edit, and the stop says which and why.
  - Code strikes again a struck connection or beat that comes back under its id, because ids make the match exact. Prose that comes back at the desk is still flagged, as the fixes rule.
  - Cost if wrong: none to the director's text.
- **R12. Each decision stop has a director-side schema,** derived in code from the writer's and never sent to the SDK. Answers are kept by code, apart from any model's output.
  - Why: the director's weave and map hold what no writer writes, such as answers and a beat they added. A writer's schema built for the model would refuse them, and loosening it would let a model write the director's answers.
  - Cost: one derived schema per stop.
- **R13. The standalone branch merged first.** The director answered its three calls on 2026-10-03: keep the arc step, keep the slimmer `schemas.md`, delete `voice-samples.md`. It was rebased onto `main`'s fixes and merged to local `main` (`7d4195b`), and the phase branch is cut from it. 4.6 and 4.12 edit files it rewrote. 4.12 takes the standalone path only as far as the stages and the rule lists.
  - The branch's deferred items go to the director as a decision of their own:
    - whiteboard name matching;
    - a folder for the standalone's inputs;
    - the ledger and the clock in code;
    - the agents' models, which would be a model change.
  - Cost if wrong: the standalone path lags the pipeline by those items.
