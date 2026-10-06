# Phase 4b, piece 1: the story level, with the evidence underneath Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** The director gives input only at the level of the story. The story meeting and the map show the story in plain terms, at most 300 and 450 words, and every thread, connection and beat carries its evidence underneath, through every stop, so the article writer cites from it.

**Spec.** `docs/superpowers/specs/2026-10-05-story-level-and-evidence.md` (commit `0f6be747`) is the authority, with its worked examples from session 100226. The rule text is `rule-text-read.md` in this piece's workspace (`.superpowers/sdd/2026-10-05-phase-4b-story-level/`), approved by the director on 2026-10-05 with no changes. The integrator's rulings on the survey's open decisions are `piece-1-decisions.md` in the same workspace, and are restated under "Rulings" below. The code footprint is `surveys/piece-1-footprint.md` there, with file and line at `22082fa1`. The vocabulary is `CONTEXT.md`'s; this piece adds evidence and a piece of evidence, and gives thread and beat the meanings in spec section 3.

**Builds on.** Phase 4, merged and pushed: `main` at `b62d2569` (the director's publish of 100226, on top of the roadmap update `22082fa1` and the spec `0f6be747`). The phase branch, `feat/phase-4b-story-level`, is cut from `b62d2569`.

**Architecture.**
- **The weave** keeps its stages, checks, fact check and meeting. A thread becomes `{id, name, line, role, verdict?, reason?, evidence}` and a connection `{id, joins, line, kind, evidence}`. The writer writes the lines in story terms and attaches the evidence. The code checks add the evidence, the story terms and the page's length. The fact check reads each line against its evidence. The settled weave prints each thread's evidence for the map writer.
- **The map** keeps its stage, checks and stop. A beat becomes a move, `{id, move, players, threads, connection?, card?, kind?, evidence}`, with one piece flagged as a card's document. The map writer gives each beat its evidence from the threads' and from the record. The checks read the card from the flagged piece, require every thread in the story to land in a beat, and bound the page.
- **The article writer** writes each beat from the evidence it carries, and prints inline cards from the flagged pieces.
- **One module, `lib/evidence.js`,** holds what the weave and the map share: a piece's shape, its sources, the evidence check and the story-terms check.
- **The evidence is never the director's edit.** The diffs leave it out, as they leave out a struck connection's flag and the answers.
- **Today's pages** change only as much as they must: the lines in story terms, a "What's behind it" fold, the tags gone, photos by the director's descriptions. Pieces 3 and 4 replace them.
- **A thread on the old shapes** gets the old-thread message and a rollback to the meeting, where the weave is written fresh.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides; the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace) with its cost if wrong.

**Story terms** (spec 4.1, 4.2 and 6.1).
- The writer's lines say what happens in plain words, with people's names, and hold no quotation from the record, no figure, no clock time and no document id.
- The code check flags four things in the writer's lines: a document id the record holds, a quotation in quotation marks, a clock time, and a money figure.
- Exempt from the check: the director's own lines; "from your notes"; the verdict line, which code prints; the working headline; the map's headline, deck and section headings, which the article prints; and the questions, whose figure kind needs the figure (C15; ruling R2 below).

**The bounds** (spec 4.1, 4.2, 6.1). The meeting's page at most 300 words, the map's at most 450 with the map writer aiming for 300. Each is counted as the page prints it when it first opens, by `lib/stop-pages.js` `wordsShown`, the count the stops log records: folded lines are not counted, and a first look has no round's lines. The bound holds the writer's output and each rework's, never the director's version.

**Evidence** (spec 5).
- A piece names its sources, says in a short line what it shows (with the words or figures that matter), and is marked as supporting its line or cutting against it.
- A source is a document in the record by the record view's id rule, the ledger, the evidence log, or the director's notes. A piece that sets two sources side by side names both.
- A quotation inside a piece is word for word in its source (`lib/grounding.js` `isVerbatimIn`).
- No buried memory's id, owner or text appears in a piece (`lib/__tests__/buried-memory-sentinel.test.js` plants one).

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written.

**The director's edits are final** (phase 4 spec section 7, as built). The evidence is never the director's edit (spec 5.3): it stays out of every diff, and a writer that finds new evidence for a director's line has not changed that line. A check failure in a director's line is a concern beside it, never a rework.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt, a task line, a schema description, a label, a check's line.
- State each target positively, each rule once, with its reason. A task line names the rule items it applies and never restates them.
- No em-dashes. Nova is never gendered. The rule files carry the approved read word for word.

**Themes.** The shapes stay generic. Code never names the journalist's slots, Nova or NovaNews outside the theme's files. Only the journalist runs; the detective stays parked.

**No other changes.** No model, effort or pin changes. No npm install, update or ci; if a step seems to need a package, stop and report it.

**One source of truth.**
- A rule two places apply is one function or one constant, which both call. The weave and the map share `lib/evidence.js`.
- The console keeps a copy of a server constant only where it cannot import it, and a test holds the two equal.

**State channels.** No new channel is planned. A slice that adds one follows phase 4's rule: its Annotation, its default with the channel count in `__tests__/unit/workflow/state.test.js`, its place in `ROLLBACK_CLEARS` or `ROLLBACK_CLEARS_EXEMPT`, and `APPEND_REDUCER_FIELDS` if it appends.

**Stop types keep their names.** `arc-selection` and `outline` stay the stop types; the labels stay "Story meeting" and "Map".

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The fact check's mark and the map check's mark keep working on the new shapes, each with a replay test.

**Console.**
- Logic that decides a line, a label, a fold or a count goes into the dual-export pure modules, with node tests. Components stay thin.
- There is no DOM harness, so the integrator's click-through covers the wiring.

**Tests.**
- No live model calls; Jest maps the SDK to its mock. Each brief's Verification runs with no model call.
- Every commit passes the full suite, exit code guarded. Counts fall only by the tests a brief retires, and the return names each one.
- **Delete-last.** A slice that changes a shape owns that shape's tests: the console's copies, the graph tests that seed it, and its part of the shared fixtures (`lib/__tests__/fixtures/rework-state.js`, `__tests__/mocks/llm-client.mock.js`, `__tests__/fixtures/mock-responses/`, `scripts/lib/fixed-weave.js`, `scripts/lib/fixed-map.js`). It deletes each old field only together with its last reader.
- Tests that pin today's text or shape break by design. The slice that changes them updates them, with the reason, and updates any pinned hash it moves (`lib/__tests__/writer-prompts-pinned.test.js`).
- No test reads `data/`. A test in a real session's shape uses invented text, because the repo is public.

**What the integrator owns.** Recomposing a pinned hash two slices of one run moved; recomposing the channel count; the removed-phrase list in `lib/__tests__/fixtures/removed-phrases.js`.

**Docs.** `reports/CLAUDE.md`, `CONTEXT.md` and `docs/PIPELINE_DEEP_DIVE.md` are shared by section. Each code slice updates the `CLAUDE.md` sections that describe what it changes, as its run's interfaces file names. Slice 1H updates `CONTEXT.md`, the deep dive and the runbook, and the integrator's docs grep is a gate.

**Repo and data.**
- Never commit anything under `data/`, `.claude/launch.json`, `outputs/report-0919269.html` or `outputs/sessionphotos/0919269/`, and never write under `outputs/` outside the gate's tree. Never read `.env`.
- The main checkout `C:/Users/spide/Documents/claudecode/aboutlastnight` is the director's. Never start, stop or call their server on port 3001. Never open, read or copy `reports/data/checkpoints.sqlite`. Renders and the live run use the integrator's database copy through `CHECKPOINT_DB_PATH`, on a throwaway port.

**Commits.** Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bypass the pre-commit hook. Never `git stash`. The push is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, the most likely first. Each names the slice whose tests pin it.

1. **A thread the director adds at the meeting, with no evidence.** The checks never fail the writer for it. The meeting shows it, its fold saying the map writer finds its evidence. The settled weave hands it to the map writer, which gives it a beat with evidence, or names it in the gap note in story terms when the record can't carry it (1B, 1D).
2. **A writer's line with possessives, names and numbers in words:** "Marcus's", "Kai's", "ten votes", "five to four", a thread named "Reality is negotiable". The story-terms check flags none of them. It flags a document id the record holds, a quotation in quotation marks, a clock time such as "9:58" or "10:18 AM", and a money figure such as "$450,000" (1B; 1D reuses it).
3. **The director's additions push a page past its bound.** Only the writer's output is held to the bound. The director's version is never refused for its length, and a long line of the director's is never a rework's trigger (1B, 1D).
4. **A session paused at the meeting or a later stop on the old shapes.** It gets the old-thread message and the rollback to the meeting, which writes the weave fresh. Nothing replays on mixed shapes, and a session paused before the meeting carries on unchanged (1G).
5. **A piece whose quotation differs from its source only in its quotation marks, case or spacing,** such as curly against straight marks or a line break. The evidence check reads it as word for word. A piece whose words differ fails, naming the piece and its source (1B; 1D reuses it).

## What this piece changes for the director

| Stop | Today (100226) | After |
|---|---|---|
| Story meeting | 676 words. 11 threads written as claims pinned to one receipt, with quotes, times and document ids; tags such as t1 and c3 | At most 300 words. The story, its question and headline, your words; the threads in the story, each as its role, a short name and one line; the left-out threads by name; only the connections the story turns on; the convergence; the questions. Each line has a "What's behind it" fold with its evidence |
| Map | 1,193 words. 18 beats quoting their material, with document ids | At most 450 words, aiming for 300. Each section's heading and job; its moves as short phrases with their people, "(card)" where one prints; photos by your descriptions; the counts; left out, folded. Each move has a "What's behind it" fold |
| Article | The writer joins up the map's quotations | The writer writes each move from the evidence it carries, and prints the cards the map flagged |

## Slices and how they run

**How the work is split.** Each shape change is one slice. A thread's or a beat's shape is read by its schemas, its checks, its prompts, its diffs, its view models and about 150 to 200 tests, and every one of them has to change in the same commits for the suite to stay green. So the weave's change belongs to one subagent (1B) and the map's to another (1D). Everything that changes no shape moves out of those two slices and runs beside them: the rule text, the two pages' components, the article's reading of the map, the old-shape guard, and the skill and docs. The slices of a run own separate functions, so they merge without touching each other's work.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| 1A | The rule files | prompt | small | the phase branch is cut |
| 1B | The weave | prompt, plumbing, the meeting's view model | large | the phase branch is cut |
| 1C | The meeting's page | screen | small | 1B merges |
| 1D | The map | prompt, plumbing, the map's view model | large | 1B merges |
| 1E | The article reads the evidence | prompt | small | 1D merges |
| 1F | The map's page | screen | small | 1D merges |
| 1G | Sessions on the old shapes | plumbing, screen | small | 1D merges |
| 1H | The standalone skill and the docs | docs | small | 1D merges |

**Runs.** Each run is one workflow. The large slice in each of the first two runs is its long pole, and the small ones run beside it.

| Run | Slices | Long pole |
|---|---|---|
| 1 | 1A, 1B | 1B |
| 2 | 1C, 1D | 1D |
| 3 | 1E, 1F, 1G, 1H | none: four small slices |

- The integrator merges a run's slices into the phase branch in the table's order, rebasing each onto the last with the full suite at every commit, then cuts the next run's worktrees from the new head.
- Before each run the integrator writes that run's interfaces file: the names earlier slices chose, who owns which functions of a shared file, the `CLAUDE.md` sections each slice updates, and the pinned hashes each slice may move.
- The piece merges to `main` once, after the gates, when no session is paused at the meeting or a later stop (spec section 10). The integrator asks the director before merging.

**Why not split further.**
- Splitting a shape change between two subagents would have both edit the same functions and tests, and the suite would fail between their commits.
- The view logic that builds a thread or a beat (`addMeetingThread`, `initBeat`, `buildBeat`, `addBeat`) changes with the shape, because its tests validate what it builds against the new schema. So it is 1B's and 1D's, and the page slices keep only the components.
- The weave's prompts could run beside its shape only by copying the evidence module's constants before the module exists. One slice that builds the module first and the shape on it is simpler and no slower.
- The article's reading needs the map's card function, so it waits for 1D, and it is small enough to wait.

**Who owns which file.**

| Slice | Owns |
|---|---|
| 1A | The four rule files `craft-story.md`, `craft-form.md`, `craft-material.md` and `craft-cards.md`; their sentence pins in `lib/__tests__/rule-set.test.js` |
| 1B | `lib/evidence.js` (new), with `buildSourceMap` moved out of `lib/content-bundle-fact-check.js`; `WEAVE_SCHEMA` (`lib/sdk-client/subagents.js`); `lib/weave.js`; the weave writer, its rework and the check node (`arc-specialist-nodes.js`); the meeting's fact check's opening and breach notes (`evaluator-nodes.js`); `lib/prompt-renderers/settled-weave.js`; the weave's functions in `lib/hand-edit-diff.js`; `lib/meeting.js`; the meeting's view logic in `console/checkpoint-view-logic.js` (`DIRECTOR_WEAVE_SHAPE`, `meetingView`, `meetingWeaveChanges`, `addMeetingThread`, the fold's view and its source labels, `markLine`, `takenOutWords`); the meeting's lines in `lib/stop-pages.js`; the weave fixtures and `scripts/lib/fixed-weave.js`; every pinned hash the settled weave or the weave fixtures move |
| 1C | `ArcSelection.js`; the meeting's CSS; `__tests__/unit/console-meeting-screen.test.js` |
| 1D | `lib/schemas/outline.schema.json`; `lib/map.js`; `lib/workflow/nodes/map-nodes.js`; the map writer and its rework (`mapTask` in `lib/prompt-builder.js`, and `outlineWriterInputs`, `generateOutline` and `reviseOutline` in `ai-nodes.js`); the map's functions in `lib/hand-edit-diff.js`; `console/outline-edit-logic.js` (the gate and its constants, `beatCardOf`, `mapTally`, `initBeat`, `buildBeat`, `addBeat`); the map's view logic in `console/checkpoint-view-logic.js` (`mapView` and its helpers); the map's lines in `lib/stop-pages.js`; `mapCheckpointData`; the map fixtures and `scripts/lib/fixed-map.js`; every pinned hash the map fixtures move |
| 1E | The article writer's `STORY_MAP_LABEL`, the beats line of `ARTICLE_TASK` and the inline card line (`lib/prompt-builder.js`); the article writer's pinned hashes |
| 1F | `Outline.js` (the beat editor's fields and the add line's state among them); `console/unsaved-input-logic.js`'s add line; the map's CSS; `__tests__/unit/console-map-screen.test.js` |
| 1G | `lib/old-thread.js`; the old-thread rollback state; `oldThreadView`; the planting rule in `scripts/render-prompts.js` |
| 1H | `SKILL.md`, `references/schemas.md` and the three agents; `CONTEXT.md`; `docs/PIPELINE_DEEP_DIVE.md`; `docs/runbook/first-run-sheet.md` |

Each slice updates the sections of `CLAUDE.md` that describe what it changes, as its run's interfaces file names them.

## Gates

None makes a live model call. The director's next new session is the live test (the director, 2026-10-05: "don't rerun an old session as the gate").

1. **The suite**, at the phase branch's head: exit 0, nothing skipped.
2. **The prompt checks,** on the integrator's database copy.
   - Render the weave writer, its automatic rework, the meeting's fact check, the map writer and its two reworks, the article writer and the article judge from 092026, 092626 and 0926262, with the fixed weave and map planted (1G's planting rule).
   - For every call: it builds; it reads exactly the rule files phase 4 spec section 11 gives it; no retired wording and no em-dash in any instruction text; `<DIRECTOR_GUIDANCE>` last where a writer has one; its size recorded beside phase 4's.
   - The settled weave in the map writer's render carries each thread's evidence. The article writer's `<STORY_MAP>` carries each beat's evidence and its card flags.
   - The record view and the director-words renderers print byte-identical text on `main` and on the branch (the integrator's renderer-level script, as in phase 4).
3. **The click-through,** on fixture threads cut from the database copy with the fixed weave and map planted. The meeting and the map are read against the spec's worked examples: each page's count by `wordsShown`, the story terms, the folds, the tags gone and the photos by description. Planted cases:
   - a thread the director added, with no evidence;
   - a check still failing, shown beside its line;
   - a piece that cuts against its line;
   - a thread paused at the map on the old shapes, with its message and its rollback.
4. **The docs grep.** No description of a receipt, a claim, a beat's material, 400 or 450 words, or `WEAVE_WORD_BOUND` survives in `CLAUDE.md`, the docs, the skill or the prompts, beyond the other meanings the survey's "Dismissed hits" lists.
5. **The final whole-piece review,** on Opus 5.5.

The gates prove the pipeline works. Whether the article improved is shown by the director's next new session, read with spec section 12's measures.

---

## Brief 1A: the rule files

**Intent.** The writers learn the story level from the rules they read. This slice writes the approved text into the rule files, so every writer reads it.

**Prompt.**
- Replace C16 in `craft-story.md`, word for word, with the approved text from `rule-text-read.md`.
- In `craft-form.md`, replace C2's third paragraph and its why with the approved text; the first two paragraphs stay.
- In `craft-material.md`, replace C8's second sentence with the approved sentence.
- In `craft-cards.md`, add C9's approved sentence after "Every card is clear about what it cites."
- Item headings and ids stay.

**Plumbing.** Report the retired wording: "each named exactly", "each named by its material", "from the documents the map names". The integrator adds each phrase to the removed-phrase list once no code text still carries it (1B and 1D remove the code's copies).

**Tests.** The rule-set lint holds: each item once; every pointer names an item the set states; no em-dash; no gendered Nova; nothing on the removed list. A test pins one sentence from each changed item. The pinned writer renders read the fixture stubs, so no hash moves.

**Verification.** Render the weave writer, the map writer and the article writer from 0926262 on the integrator's copy, and read each changed item in place.

**Done.** The files carry the approved text, and the lint passes.

**Out of scope.** The prompts' own task lines and formats (1B, 1D).

---

## Brief 1B: the weave

**Intent.** On 100226 the meeting showed 676 words: 11 threads, each a claim pinned to one receipt, with quotations, times and document ids (spec section 2). The weave writer should write the story level, at most 300 words as the page prints it, with each thread's and each connection's evidence underneath (spec 4.1, 5, 6, 7). The meeting's view model gives the page its new lines, with the evidence folded (spec 9); 1C renders them.

**Plumbing.**
- **`lib/evidence.js`** (new) holds what the weave and the map share. It is built first, in its own commit:
  - the piece's shape as a schema fragment both schemas embed: `sources` (one or more strings), `shows`, `stance`, and an optional `card` flag that only a beat's piece uses;
  - the sources a piece may name besides a document id, as one constant: the ledger, the evidence log, the director's notes;
  - the stances: supports and cuts against;
  - the evidence check: each source is a record document id or one of those sources; each quotation in `shows` is word for word in its source's text (`lib/grounding.js`); a buried memory is never a source;
  - the story-terms check over a line: a document id the record holds, a quotation in quotation marks, a clock time, a money figure. It reads quotation marks by the article fact check's rule (`QUOTED_SPANS`), so an apostrophe in a name or a possessive is never a quotation;
  - one function from a document id to its texts, read by the evidence check and by the article fact check's card fidelity. Today that is `buildSourceMap`, private to the fact check, which moves here.
- **The weave's shape** (`WEAVE_SCHEMA`; ruling R1):
  - a thread is `{id, name, line, role, verdict?, reason?, evidence}`;
  - a connection is `{id, joins, line, kind, evidence}`. Its `kind` stays underneath, unprinted, and `isSameConnection` still reads it with the ends;
  - `claim`, `receipt` and the connection's `detail` go.
  - The director-side schema (`lib/meeting.js` `DIRECTOR_WEAVE_SCHEMA`) follows. A thread the director adds needs only `id`, `name`, `line` and `role`. The console's copy (`DIRECTOR_WEAVE_SHAPE`) follows, held equal by its test.
- **The writer** (`weaveOutputFormat`, `WEAVE_TASK`, `buildWeaveSections`):
  - The output format's placeholders give the new shape.
  - The task asks for: the page at most 300 words; the lines in story terms, as C16 (`<craft-story>`) sets them out; each thread's and each connection's evidence; only the connections the story turns on; and the left-out threads by name, with their reasons.
  - The Receipts list becomes the list of sources a piece may name: the record's document ids, the ledger, the evidence log and the director's notes.
  - "Named exactly" goes.
- **The checks** (`weaveFindings`, `validateArcStructure`):
  - Each writer's thread in the story (every role but left out) has at least one piece that supports it, and every piece passes the evidence check.
  - Each writer's line passes the story-terms check, with the exemptions in the Global constraints.
  - The length: the node builds the meeting's page as it first opens (the weave, its questions and the verdict, with no round's lines), counts it with `lib/stop-pages.js` `wordsShown`, and passes the count to `weaveFindings`, which fails it above 300 (`MEETING_WORD_BOUND`). `lib/weave.js` does not require `lib/stop-pages.js`. `WEAVE_WORD_BOUND` and `weaveWordCount` go with their last readers.
  - The receipt checks go. The others stay: the verdict thread, the joins, the left-out reasons, ids of their own, "from your notes", the stronger main thread.
  - A failure in the director's share (`weaveDirectorsShare`) is a concern, as today. A thread the director added is never failed for having no evidence.
  - Each failure is one line naming the line it is about, in the director's words for it, and its fix. It carries its place (a thread's or a connection's id, or a weave field), so the meeting shows a check still failing beside that line (spec 6.3). A failure with no place stays at the top of the page, as today.
- **The fact check.** `buildEvaluationUserPrompt('arcs')` opens by naming the evidence under each line, and `BREACH_NOTES.arcs` asks a breach to name the piece of evidence where one is at fault. A finding that quotes a piece is the writer's must-fix (`locateQuotedText` reads only the printed fields).
- **The settled weave** (`renderSettledWeave`): each thread by its role, name and line, with its evidence under it for the map writer (each piece's sources, what it shows and its stance). Each connection by its line and the names of the threads it joins. The receipt line goes; the meeting-change marks (`M3`) stay.
- **The director's edits.**
  - `evidence` stays out of `weaveEditsBetween`, `weaveMarks` and the console's `meetingWeaveChanges` (ruling R6).
  - `WEAVE_PRINTED_FIELDS` takes `name` and `line`, and the connection's `line`.
  - `THREAD_FIELD_PLACES` and `meetingChangePlace` (`lib/meeting.js`) name a thread by its name and quote its line.
  - `strikeLine` and `takenOutWords` print the connection's line.
- **Fixtures.** `rework-state.js`'s weave, the mock client's weave, `mock-responses/weave.json`, and `scripts/lib/fixed-weave.js` in the new shape. The fixed weave's planted failure becomes a piece naming a document the record lacks. Its planting rule is 1G's.

**The meeting's view model** (spec 4.1 and 9; the component is 1C's).
- `meetingView` gives the threads in the story first, the main thread at the top and the others in the order of `WEAVE_ROLES`, then the left-out threads by name, each with its reason folded.
- Each thread's line is its role, its name and its line, with its evidence as a folded list.
- **The fold's view** is one function, which 1D reuses for the map. It lists each piece:
  - its sources by name: a document through `receiptView` and `evidenceIndex`; "The ledger", "The evidence log" and "Your notes" from a console copy of `lib/evidence.js`'s sources, held equal by a test;
  - what it shows;
  - "Cuts against" where it does.

  A thread the director added with no evidence has the line "Nothing yet: the map writer finds the evidence for it."
- Each connection's line comes with the names of the two threads it joins.
- A check still failing sits beside the line its place names.
- No line or label the view gives carries a tag; it names a thread by its name.
- `addMeetingThread` builds `{id, name, line, role}` under the next free id.
- `lib/stop-pages.js` prints these lines with the folds marked folded, so `wordsShown` leaves them out.

**Prompt.** The weave writer's output format, task and sources list; the rework's check lines; the fact check's opening and breach notes; the settled weave the map writer reads.

**Invariants.**
- The weave writer still reads everything it reads today.
- No buried memory's id, owner or text reaches the weave or a piece.
- `<DIRECTOR_GUIDANCE>` stays last.
- The fact check's mark still skips a judged weave on a replay.
- The answers and the struck connections behave as today.

**Tests.**
- The shape, each field and the director-side schema, on a weave in 100226's shape with invented text.
- The evidence check: a source the record lacks; a quotation that differs in words; one that differs only in its marks, case or spacing (Review focus 5); a buried memory as a source.
- The story-terms check fires on an id, a quotation, "9:58", "10:18 AM" and "$450,000". It is silent on "Marcus's", "Kai's", "ten votes", "five to four" and "Reality is negotiable" (Review focus 2).
- The length: a writer's page over 300 fails; a page the director lengthened is never refused (Review focus 3).
- A thread the director added with no evidence: no failure, and the fold's line (Review focus 1).
- The view's order: the main thread first, the left-out threads by name. A check failure with a place sits beside its line; one without stays at the top.
- The settled weave's lines; the edits leaving evidence out; the fold's view; `addMeetingThread`; the stop page's lines and count.
- The survey's section 8 lists the tests this moves. `lib/__tests__/arc-specialist-prompts.test.js` 476-510 moves with C16's wording. Each pinned hash this moves is updated with the reason.

**Verification.** Render the weave writer, its automatic rework, the fact check and the map writer from 092026 and 0926262 on the integrator's copy, with the fixed weave planted by hand in your scratch copy. Record each section and the sizes. Build the meeting's page from the fixed weave with `lib/stop-pages.js` and count it.

**Done.** The full suite passes. The renders read as stated. The meeting's view model gives the story level with its folds.

**Out of scope.** The meeting's component (1C); the map (1D); old sessions and the planting rule (1G); the skill and the docs (1H); the change review (piece 2); the meeting's new page (piece 3).

---

## Brief 1C: the meeting's page

**Intent.** The meeting's page shows 1B's view model as it is: the story level, with the evidence folded and no tags (spec 9).

**Screen.**
- `ArcSelection.js` renders the threads in 1B's order: each as its role, name and line, with a "What's behind it" toggle that opens its fold in place. The left-out threads come by name, each with its reason behind a toggle.
- Each connection shows its line and the names of the threads it joins, with its strike control.
- A check still failing shows under the line it names.
- No tag on the page; every aria-label names a thread by its name.
- The add-a-thread line takes a name, a line and a role, through `addMeetingThread`.
- The fold's CSS. The page's other controls (the role picker, the strike, the answers, the note, the buttons and the hold rule) behave as today.

**Tests.** `__tests__/unit/console-meeting-screen.test.js` holds the component to the view model's fields. A weave the add line builds passes `buildResumePayload` on a state in the new shape.

**Verification.** The integrator's click-through covers the wiring, because there is no DOM harness. The return lists each element of the page and the view-model field it renders.

**Done.** The full suite passes, and the page renders 1B's lines.

**Out of scope.** The meeting's new page (piece 3).

---

## Brief 1D: the map

**Intent.** On 100226 the map showed 1,193 words: 18 beats averaging 31 words, quoting their material, with 26 document ids, and almost every quotation reappeared in the draft (spec section 2). The map writer should write moves in story terms, at most 450 words and aiming for 300, and give each move its evidence (spec 4.2, 5, 6, 7). The map's view model gives the page its new lines (spec 9); 1F renders them.

**Plumbing.**
- **The beat's shape** (`outline.schema.json`, `mapSchemaFor`; ruling R1):
  - a beat is `{id, move, players, threads, connection?, card?, kind?, evidence}`;
  - `card` is a marker, and the card's document is the piece flagged `card`, one per beat that has the marker;
  - `kind` stays as an unprinted hint to the article writer;
  - `material` goes.
  - `leftOut` follows the beat. The director-side schema (`directorMapSchemaFor`) needs only `id` and `move` for a beat the director adds. The console's gate (`validateMapShape` and its constants) follows, held equal by its corpus test.
  - The schema's descriptions are model-facing: load `writing-for-agents` before writing them.
- **The map writer** (`mapTask`):
  - It asks for the page at most 450 words, aiming for 300.
  - It asks for the moves in story terms, as C2 (`<craft-form>`) sets them out, each with its threads, its people and its evidence from the settled weave's threads and the record.
  - It asks for the card's document flagged on a piece (C9, `<craft-cards>`).
  - It asks for a change of the director's that the record cannot carry to be named in the gap note.
  - "Each beat naming its material" goes.
- **The checks** (`mapFindings`, `checkMap`):
  - The card checks read the flagged piece through one function: `beatCardOf` and its readers (`mapTally`'s card count, `card-not-in-record`, `cardCountChanges`, `editsOnCards`). A flagged piece's source is an exposed document in the record, never the ledger, the evidence log or the notes.
  - Every thread in the settled weave's story (every role but left out) lands in at least one beat that names it (ruling R3). Every connection the story keeps still lands.
  - Each writer's beat passes the evidence check (`lib/evidence.js`).
  - Each of the writer's lines on the map passes the story-terms check: a section's job, a beat's move (in a section or in left out), the gap note's line and each weave change. The headline, the deck and the section headings are exempt.
  - A beat the director added is never failed for having no threads or no evidence.
  - Each failure carries its place (a beat's id, a section's slot or a map field), so the map shows a check still failing beside that line (spec 6.3).
  - The length: the node builds the map's page as it first opens, counts it with `wordsShown`, and passes the count to `mapFindings`, which fails it above 450 (`MAP_WORD_BOUND`). The task's aim of 300 is `MAP_WORD_AIM`.
- **The director's edits.**
  - `evidence` stays out of `mapEditsBetween`, so `valueEdits` never recurses into it (ruling R6; survey Q1).
  - `mapParts` and `mapCutReturned` read the move's words.
- **The editors' logic** (`console/outline-edit-logic.js`): `initBeat` and `buildBeat` edit a move's words and its people, and `addBeat` builds `{id, move, players}`. Each keeps a beat's other fields as they are.
- **The payload.** `mapCheckpointData` carries the director's photo descriptions for the page.
- **Fixtures.** `rework-state.js`'s map, the mock client's map, `mock-responses/outline.json`, and `scripts/lib/fixed-map.js` in the new shape. The fixed map's planted failure becomes a card flag on a piece whose source the record lacks. Its planting rule is 1G's.

**The map's view model** (spec 4.2 and 9; the component is 1F's).
- `mapView` gives each beat's line as its move's words, its people, and "(card)" where it has the marker, with its evidence folded through 1B's fold view. A beat the director added with no evidence has the line "Nothing yet: the article writer finds the evidence for it."
- Each photo comes with the director's description from the payload, or its filename when there is none. The "beside" options name beats by their moves.
- A check still failing sits beside the line its place names.
- No line or label carries a tag.
- `lib/stop-pages.js` prints these lines with the folds marked folded.

**Prompt.** The map writer's task, its schema's descriptions, and its rework's check lines.

**Invariants.**
- The map writer still reads the settled weave first, then everything it reads today.
- Everyone, the photos check, the top photo, the dropped sections, left out, the gap note and the weave changes behave as today.
- The map check's mark still skips a checked map on a replay.
- No buried memory reaches a beat or a card.

**Tests.**
- The shape and the director-side schema. The card through the flagged piece, in every reader the survey lists.
- A thread in the story with no beat fails; a left-out thread is never asked for.
- A beat the director added with no threads or evidence: no failure, and the fold's line.
- The story-terms and evidence checks on the map's lines, reusing 1B's functions: a job, a move, the gap note and a weave change are checked; the headline, the deck and a heading are exempt. A failure with a place sits beside its line.
- The length: a writer's page over 450 fails; the director's version is never refused.
- The edits leaving evidence out, with the survey's Q1 case as a regression test: a director's version whose beat's evidence differs makes no edit.
- The editors' logic; photos by description; the stop page's lines and count.
- The survey's section 8 lists the tests this moves. Each pinned hash this moves is updated with the reason.

**Verification.** Render the map writer, its check rework and its send-back rework from 092026 and 0926262 on the integrator's copy, with the fixed weave and map planted by hand in your scratch copy. Record the sizes. Build the map's page from the fixed map and count it.

**Done.** The full suite passes. The renders carry each beat's evidence and card flag. The map's view model gives the story level with its folds and the photos by description.

**Out of scope.** The article's reading (1E); the map's component (1F); old sessions and the planting rule (1G); the skill and the docs (1H); the map's new page (piece 4); the desk (piece 5).

---

## Brief 1E: the article reads the evidence

**Intent.** The article writer should write each beat from the evidence the beat carries, and print the cards the map flagged (spec 5.2 and 7).

**Prompt.**
- `STORY_MAP_LABEL` describes the move, its threads, its people, its evidence and the card flag.
- The beats line of `ARTICLE_TASK` has the writer write each beat from the evidence it carries and cite it, still reading the record for a scene's detail.
- The inline card line names the flagged piece's document, through `beatCardOf`.
- The article judge reads the map's JSON as today.

**Invariants.** The writer still reads the settled weave first, then the map, then everything it reads today. `<DIRECTOR_GUIDANCE>` stays last. The stamp of the headline, the deck and the top photo is unchanged. A move the director added that the record cannot carry is held by the article judge's truth criteria, as any line is, and marked at the desk at the cap (spec 5.3).

**Tests.** `lib/__tests__/article-writer-map.test.js`, `card-instructions.test.js` and `prompt-builder-card-fields.test.js` for the label, the task line and the card line. Each pinned hash this moves is updated with the reason.

**Verification.** Render the article writer and its rework from 0926262 on the integrator's copy, with the fixed weave and map planted by hand in your scratch copy, and read the label, the task line and the card line in place.

**Done.** The full suite passes, and the renders read as stated.

**Out of scope.** Cards copied from the record (phase 5).

---

## Brief 1F: the map's page

**Intent.** The map's page shows 1D's view model as it is: moves in story terms, the evidence folded, photos by the director's descriptions, and no tags (spec 9).

**Screen.**
- `Outline.js` renders each move as its words, its people and "(card)" where it has the marker, with a "What's behind it" toggle that opens its fold in place.
- Each photo shows its description beside its thumbnail. The "beside" picker names moves by their words.
- A check still failing shows under the line it names.
- No tag on the page; every aria-label names a move by its words.
- The beat editor's fields are a move's words and its people (1D's `initBeat` and `buildBeat`).
- The add-a-beat line takes the words and the people. Its state names the words `move`, and `console/unsaved-input-logic.js`'s add line reads it.
- The fold's CSS. Every other control behaves as today.

**Tests.** `__tests__/unit/console-map-screen.test.js` holds the component to the view model's fields; `console/__tests__/unsaved-input-logic.test.js` covers the add line.

**Verification.** The integrator's click-through covers the wiring. The return lists each element of the page and the view-model field it renders.

**Done.** The full suite passes, and the page renders 1D's lines.

**Out of scope.** The map's new page (piece 4).

---

## Brief 1G: sessions on the old shapes

**Intent.** A session paused at the meeting or a later stop when the piece lands holds a weave and a map in phase 4's shapes, which every new gate refuses. The old-thread guard sees only a thread with no weave (survey Q2). It should see the old shapes, send such a session to the meeting, and write the weave fresh there (spec section 10).

**Plumbing.**
- `oldThreadOf` (`lib/old-thread.js`) flags a thread whose weave is in the old shape (a thread with no `line`), or whose map is (a beat, in a section or in left out, with no `move`), wherever it is paused from the meeting on, or complete.
  - The old-shape tests are one function each (`isOldShapeWeave`, `isOldShapeMap`), beside `isWeave`.
  - A thread paused before the meeting, or one holding no weave, behaves as today.
- The flagged thread gets today's 409s on every action but a rollback to the meeting or a point before it.
- Its rollback to the meeting clears the weave, its baseline, the director's weave edits, marks and report, the fact check's and the checks' marks, the map and its channels, and the article, then starts the arc counters over (`oldThreadRollbackState`). The weave writer then runs fresh, and so does everything after it.
- `GET /checkpoint` carries the flag as today.
- `scripts/render-prompts.js` plants the fixed weave and map when a thread's are missing or in the old shape, through the same two functions.

**Screen.** `oldThreadView`'s line for an old-shape thread reads: "This session's story meeting was written before the story level. Roll back to the story meeting to write it again." A thread with no weave keeps today's line.

**Tests.** Unit tests per stop and shape. The real graph, as in `__tests__/integration/old-thread-graph.test.js`: an old-shape thread at the meeting, at the map and complete, each refused, then rolled back to the meeting, where the weave is written fresh in the new shape; a new-shape thread untouched (Review focus 4). The planting rule.

**Verification.** Cut a fixture thread at the map from the integrator's copy into your scratch folder. Run the guard against it through the API on a throwaway port, roll it back to the meeting with the mock SDK, and read the new weave's shape. No live model call.

**Done.** The full suite passes, and an old-shape thread reaches a fresh meeting through one rollback.

**Out of scope.** Converting old weaves and maps; there is no conversion.

---

## Brief 1H: the standalone skill and the docs

**Intent.** The standalone skill follows the pipeline's stages (R13), and the shared docs follow the code.

**Docs.**
- `SKILL.md`: the meeting's and the map's pages as spec 4 describes them, at most 300 and 450 words.
- `references/schemas.md`: the weave's and the map's shapes with the evidence. `__tests__/unit/journalist-skill-path.test.js` still holds its roles and kinds to `lib/weave.js`.
- The arc analyzer's, outline generator's and article generator's agents: their outputs in the new shapes, and the article generator writing each beat from its evidence.
- `CONTEXT.md`: Beat, Arc, Weave, Connection, Convergence and Story map as spec 3 gives them, and a new entry for Evidence.
- `docs/PIPELINE_DEEP_DIVE.md` and `docs/runbook/first-run-sheet.md`: the shapes, the checks and the two pages as they now are.

**Tests.** `journalist-skill-path.test.js` and `lib/__tests__/retired-craft-files.test.js` pass.

**Verification.** A grep for `receipt`, `claim`, `material` and `WEAVE_WORD_BOUND` over the files this slice owns finds only the other meanings the survey's "Dismissed hits" lists.

**Done.** The full suite passes, and the grep is clean.

**Out of scope.** Code, and `CLAUDE.md`, whose sections each code slice updates.

---

## Rulings (the integrator's, 2026-10-05)

From `piece-1-decisions.md`, with the plan's additions. Each is recorded in the ledger with its cost if wrong.

- **R1. The shapes.** A thread `{id, name, line, role, verdict?, reason?, evidence}`; a piece `{sources, shows, stance, card?}`; a connection `{id, joins, line, kind, evidence}`; a beat `{id, move, players, threads, connection?, card?, kind?, evidence}`. The connection's and the beat's kinds stay underneath, unprinted. *If wrong:* a field is renamed in one slice.
- **R2. Two exemptions beyond the spec's list.** The questions are exempt from the story-terms check: C15's figure kind asks about a figure, which the question must state. The map's section headings are exempt with its headline and deck, because the article prints them too. *If wrong:* a question or a heading shows a figure the director didn't need at that stop.
- **R3. A beat names the threads it carries.** The map's check requires every thread in the story to land in a beat, and keeps the check that every connection lands. *If wrong:* a mirrored thread stays off the map until the director brings it in.
- **R4. The card.** A marker on the beat and a flag on one piece, whose source is an exposed document. Every reader of `beat.card` reads the flagged piece. *If wrong:* the card's document moves back onto the beat in one slice.
- **R5. The count.** One count, `wordsShown`, over the page as it first opens, computed by the node and passed to the checks. *If wrong:* a bound fires a few words early or late.
- **R6. The evidence is never the director's edit.** It stays out of every diff and mark. *If wrong:* the director could not pin a piece of evidence, which the spec never asks for.
- **R7. The settled weave prints each thread's evidence** for the map writer, which also reads the record. *If wrong:* the map writer's prompt is longer than it needs to be.
- **R8. Code checks the story terms** on the writer's lines, with the exemptions in the Global constraints. *If wrong:* a rare legitimate line is reworked once.
- **R9. Old shapes** are caught by the old-thread guard and rolled back to the meeting, where the weave is written fresh; there is no conversion. *If wrong:* a session paused at the moment of merge costs one rewrite of its weave.
- **R10. `lib/evidence.js`** holds what the weave and the map share, and `buildSourceMap` moves there from the article fact check. *If wrong:* one function moves again.
