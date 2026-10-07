# Phase 4b, piece 4: the map as a corkboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** The director sees the article's shape at a glance and arranges it by hand on a corkboard: one column per section, each move a card in the order the article tells them, with a summary folded under its title. The page is at most 450 words as it opens and 750 with every summary open.

**Spec.**
- The authority is `docs/superpowers/specs/2026-10-07-map-as-corkboard.md` (commit `84b01b67`). Its numbers come from session 100326's re-cut mock-up.
- The rule text is `rule-text-read.md` in this piece's workspace (`.superpowers/sdd/2026-10-07-phase-4b-map-page/`), approved by the director on 2026-10-07 with no changes.
- The code footprint is `surveys/piece-4-footprint.md` in the same workspace, with file and line at `c06b354e`.
- The integrator's rulings are the spec's section 17, restated under "Rulings" below. One line of that section, on the folds, is amended in this plan's commit (R8).
- The mock-ups are on the design canvas, https://claude.ai/artifact/73MDbGHvEWUYRHDnVBcGaZ, on two boards: "Map: corkboard columns (100326)" and "Map: a move opened".
- The vocabulary is `CONTEXT.md`'s. A move is a beat. This piece gives a beat its summary, the field `synopsis`.

**Builds on.** Piece 3, merged to local `main` at `b8b71c9d` (roadmap `c06b354e`), then this piece's spec `84b01b67` and this plan. The phase branch, `feat/phase-4b-map-corkboard`, is cut from this plan's commit. `main` is ahead of origin, and the push is the director's.

**Architecture.**
- **The beat** gains `synopsis`: one sentence, in story terms, saying what the article tells at that move. The writer's schema requires it; the director's does not.
- **The order** of a section's beats becomes the map's. The article writer tells them in that order, and the director's order is an edit that code holds through an automatic pass.
- **The map's page model** (`mapView`, `lib/stop-pages.js`) becomes the board's. It gives:
  - the counts;
  - the settled story with the gap note;
  - a legend of the story's threads;
  - the top of the article;
  - the columns of cards, each card with dots for its threads and a folded summary;
  - the Left out tray, the dropped sections and the map's changes to fit the meeting.
- **The length** is counted on two pages: as the page opens, with the summaries folded, and with every summary open.
- **`Outline.js`** renders the board, with a selected card that opens in place and drag and drop beside the buttons. The editors, the moves and the payloads stay in the pure modules.
- **The meeting, the article stop and the judges** do not change, beyond the article writer's reading of the map.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides, and the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace), with its cost if wrong.

**Story terms** (piece 1, unchanged). The writer's lines hold no quotation from the record, no figure, no clock time and no document id. The checks cover each section's job, each beat's move in a section and in left out, each beat's synopsis, the gap note's line and each weave change. Exempt: the headline, the deck, the section headings, and the director's own lines.

**The bounds** (spec 8):
- **The page as it opens:** at most 450 words. The writer's own words aim for 300, and may use `max(300, 450 - overhead)`.
- **The page with every summary open:** at most 750 words. The summaries aim for about 250, and the writer's own words may use `max(550, 750 - overhead)`.
- Both are counted by `lib/stop-pages.js` `wordsShown`, under `lib/word-count.js` `pageLengthOf`.
- The bounds hold the writer's output and each rework's, never the director's version.

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written.

**The director's edits are final** (phase 4 spec, section 7, as built). The evidence is never the director's edit. A check that fails on a director's line is a concern beside it, never a rework.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt, a task line, a schema description, a label, a check's line.
- State each target positively and each rule once, with its reason. A task line names the rule items it applies and never restates them.
- No em-dashes. Nova is never gendered. The rule files carry the approved read word for word.

**Themes.** The shapes stay generic. Code never names the journalist's slots, Nova or NovaNews outside the theme's files. Only the journalist runs; the detective stays parked.

**No other changes.** No model, effort or pin changes. No npm install, update or ci. No library in the console: the drag and drop is the browser's own. If a step seems to need a package, stop and report it.

**One source of truth.**
- A rule two places apply is one function or one constant, which both call.
- Each move on the board is one function in `console/outline-edit-logic.js`, which the drag and the button both call through one handler.
- The console keeps a copy of a server constant only where it cannot import it, and a test holds the two equal.

**State channels.** No new channel. The order and the synopsis live on the map.

**Stop types keep their names.** `outline` stays the stop type, and its label stays "Map".

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The map checks' mark keeps skipping a checked map on a replay.

**Console.**
- Logic that decides a line, a label, a fold, a count, a colour's tone or a payload goes into the dual-export pure modules, with node tests. Components stay thin.
- `Outline.js` runs under the stand-in React (`console-map-screen.test.js` `mountMap`), and its wiring is tested there. The integrator's click-through covers the rest, the drag and drop among it.

**Tests.**
- No live model calls; Jest maps the SDK to its mock. Each brief's Verification runs with no model call.
- Every commit passes the full suite, exit code guarded. Counts fall only by the tests a brief retires, and the brief's return names each one.
- **Delete-last.** A slice that changes a shape owns that shape's tests:
  - the console's copies;
  - the graph tests that seed it;
  - its part of the shared fixtures (`lib/__tests__/fixtures/rework-state.js`, `lib/__tests__/fixtures/story-level-map.js`, `__tests__/mocks/llm-client.mock.js`, `scripts/lib/fixed-map.js`).
- Tests that pin today's text or shape break by design. The slice that changes them updates them, with the reason, and updates any pinned hash it moves (`lib/__tests__/writer-prompts-pinned.test.js`).
- No test reads `data/`. A test in a real session's shape uses invented text, because the repo is public.

**What the integrator owns.** Recomposing a pinned hash that two slices of one run moved; the removed-phrase list in `lib/__tests__/fixtures/removed-phrases.js`; the roadmap.

**Docs.**
- `reports/CLAUDE.md`, `CONTEXT.md` and `docs/PIPELINE_DEEP_DIVE.md` are shared by section.
- Each code slice updates the `CLAUDE.md` sections that describe what it changes, as its run's interfaces file names them.
- Slice 4E updates `CONTEXT.md`, the deep dive and the runbook.
- The integrator's docs grep is a gate.

**Repo and data.**
- Never commit anything under `data/`, `.claude/launch.json`, `outputs/report-0919269.html` or `outputs/sessionphotos/0919269/`. Never write under `outputs/` outside the gate's tree. Never read `.env`.
- The main checkout `C:/Users/spide/Documents/claudecode/aboutlastnight` is the director's. Never start, stop or call their server on port 3001. Never open, read or copy `reports/data/checkpoints.sqlite`.
- Renders use the integrator's database copy through `CHECKPOINT_DB_PATH`, on a throwaway port.

**Commits.** Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bypass the pre-commit hook. Never `git stash`. The push is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

## Rulings

The spec's section 17, restated so each brief can point at one.

- **R1. The summary is the beat's `synopsis`.**
  - `summary` already names the sidebar's printed line and the record's paraphrase, which the card checks refuse to read as a source.
  - `synopsis` sits in both copies of the beat shape in `outline.schema.json`. It is required in the writer's schema and optional in the director's (`directorMapSchemaFor` keeps `required: ['id', 'move']`).
  - A map with no synopses is not an earlier shape. It validates, counts and shows, and `isOldShapeMap` stays as it is.
- **R2. The order of a section's beats is the map's.** The article writer tells them in that order (C2, C16). `ARTICLE_TASK` no longer gives it the order.
- **R3. The director's order is one edit per section.**
  - A section carries an order edit when the director's version either puts a beat at a place other than the section's foot, or holds two of its beats in an order the map they were shown did not.
  - The edit's value is the director's order of the section's beat ids. A beat moved to the foot of another section makes only today's move edit.
  - The edit stands while the beats it names that the section still holds sit in that relative order.
  - After an automatic pass that changed the order, code puts those beats back into it, in the places they hold, and leaves every other beat where the pass put it. The report records the restore.
  - A send-back's rework may change the order, saying why, as with every edit.
  - The report and the page read the edit as the order of that section, with the moves named by their titles.
  - Map beats have ids, so the desk's within-section move (`between`, `inOrder`) is not used.
- **R4. The legend comes from the settled story.**
  - `mapCheckpointData` sends the settled story's threads in its order, each `{id, name, line}`, built from `lib/weave.js` `settledAngleOf`. It also sends the connections between them, each `{id, joins, line}`, and the names of the weave's other threads by id.
  - `mapView` gives each beat's dots, each `{tone, name}`: `tone` is the thread's place in the angle's order, 1 to 8 and repeating, and a thread outside the story has the grey tone.
  - The page never shows an id. `Outline.js` reads the legend only through `mapView`.
- **R5. A writer's beat in a section carries only threads the settled story tells.** This is a new `mapFindings` check. It never fails a beat in the director's share: one they added, or one they brought back from left out.
- **R6. Two pages.**
  - `MAP_WORD_BOUND` (450) and `MAP_WORD_AIM` (300) stand for the page as it opens. `MAP_OPEN_WORD_BOUND` (750) and `MAP_SYNOPSIS_AIM` (250) join them, and the open page's floor is their sum.
  - `stopPage` and `wordsShown` take an option that opens the synopses. `mapPageWords` counts both pages on the writer's share, each with its own overhead.
  - Each page past its allowance is its own `over-length` failure.
  - `_mapCheck.words` keeps both counts.
  - The map's pause line in the stops log gains `wordsOpen`.
- **R7. A photo prints no words on the page.**
  - Its line in `lib/stop-pages.js` is folded: its description, for the harness's print.
  - The console shows the thumbnail. The description goes in the thumbnail's `title`, on selection, and in place of the picture when the picture cannot load.
  - The descriptions leave the page's overhead, so the writer's allowance rises where the photos ran long.
- **R8. Folds on the board.** The spec's section 17 first said the four `CollapsibleSection`s stay; it is amended to this in the plan's commit.
  - The tray is always open, and the evidence shows on the selected card. So `Outline.js` keeps only two `CollapsibleSection`s: the standing notes and the trace.
  - The synopsis toggles, one per card, and the board's toggle are controlled state in `Outline.js`.
  - In `lib/stop-pages.js` the synopses, the thread lines, the evidence and the photo descriptions are folded lines.
  - `console-stop-pages.test.js`'s count of `CollapsibleSection`s moves from four to two, with this reason.
- **R9. Nothing typed is dropped.** While an editor is open or the add line holds text, these wait, each with its held line, as the desk's controls do:
  - selecting something else;
  - every control on the selected card.

  A drag drops no typed text, since an editor is keyed by its line.
- **R10. One handler per move.** A drop and its button call one handler, which calls the `EditLogic` op once (`console-map-screen.test.js` holds each op to one call site). Dropping a photo on a move in another section moves the photo into that section beside the move, in one op.
- **R11. The words.**
  - A synopsis edit reads as the summary of the move, by its title, never by its field name. This applies to `mapEditWhere`, `beatWords` and `mapPathWords`.
  - "(card)" becomes the "Card" mark.
  - The over-length lines say which page ran long.

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, most likely first. Each names the slice whose tests pin it.

1. **The director reorders a column and sends the map back, and the round's check rework reorders it again.** Code puts the director's order back. A beat the rework added keeps its place. The report shows one line, the order of that section (4C).
2. **A map written before piece 4 opens at the map's stop.** It has no synopses. The board shows no arrows, the counts and both page counts hold, the gates take the director's version, and nothing is refused (4B, 4D).
3. **The director has a move's editor open and clicks another card.** The click waits and shows its held line, and the typed words survive (4D).
4. **The director rewrites a summary, and an automatic pass rewrites it.** Code puts the director's sentence back, and the report and the page name it as the summary of the move by its title, never as `synopsis` (4C).
5. **The director brings back from left out a move that carries a thread the angle leaves out.** No check fails. Its dot is grey and names the thread on hover. The map writer's own beat with such a thread in a section does fail, naming the thread by its name (4B).

## What this piece changes for the director

| Stop | Today (100326) | After |
|---|---|---|
| Map | 535 words in one long column: sections one under another, each move's words, people and "(card)", every photo's description, Everyone by section, Left out folded. No threads on the page. The article writer chooses the order within a section | At most 450 words as it opens and 750 with every summary open. A corkboard: a column per section, each move a card (title, people, thread dots, "Card", photo thumbnails, a folded summary), the threads at the top to follow across the board, the tray for Left out. Select a card to edit, move, leave out or see what's behind it; drag cards and photos. The order of the cards is the article's |
| Article | Tells each section's beats in its own order | Tells them in the map's order, each as its summary says |
| Story meeting | Unchanged | Unchanged |

## Slices and how they run

**How the work is split.** The beat's shape, the map's page model and the length check are one slice (4B), as piece 3's 3B was. The length check counts the page the view model builds, and the view model reads the shape, so they change in the same commits for the suite to stay green. The moves with a place (Move up and Move down, a drop in the middle of a column, a photo onto a move in another section) are 4B's too: they build what the director-side schema validates and the page counts.

The director's order as an edit is the riskiest part. It reads the shape but changes no field of it, so it gets its own slice (4C), with the summary edit's words beside it.

The board's component (4D), the rule files (4A), and the skill and docs (4E) run beside the others.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| 4A | The rule files | prompt | small | the phase branch is cut |
| 4B | The move's summary, the board's page model and its length | prompt, plumbing, the map's view model | large | the phase branch is cut |
| 4C | The director's order and summaries as edits | plumbing, prompt | medium | 4B merges |
| 4D | The board | screen | large | 4B merges |
| 4E | The standalone skill and the docs | docs | small | 4B merges |

**Runs.** Each run is one workflow.

| Run | Slices | Long pole |
|---|---|---|
| 1 | 4A, 4B | 4B |
| 2 | 4C, 4D, 4E | 4D |

- The integrator merges a run's slices into the phase branch in the table's order. Each is rebased onto the last, with the full suite at every commit. The next run's worktrees are cut from the new head.
- Before each run the integrator writes that run's interfaces file. It names:
  - the names the earlier slices chose;
  - who owns which functions of a shared file;
  - the `CLAUDE.md` sections each slice updates;
  - the pinned hashes each slice may move.
- After run 1, the director's order is not yet an edit: the suite stays green, and nothing merges to `main` until 4C has.
- The piece merges to `main` once, after the gates, when no session is paused at the map or a later stop. The integrator asks the director before merging.

**Seats.** Each slice is a chain of seats in one worktree. After the seats come:
- a spec reviewer;
- on the large slices and on 4C, an adversarial reviewer who demonstrates each failure;
- a verifier for each blocking finding before any fixer;
- up to three fix rounds.

| Slice | Seats | Effort |
|---|---|---|
| 4A | one | medium |
| 4B | two: the server side (the shape, the writers' lines, the checks but the length, the payload, the fixtures), then the page model (`mapView`, the moves with a place, `lib/stop-pages.js`, the two-page length, the stops log) | high |
| 4C | one | xhigh |
| 4D | two: the board's render and selection, then the drag and drop, the holds and the CSS | high |
| 4E | one | medium |

**Why not split further.**
- Splitting 4B's shape from its page model would leave the length check counting a page that does not exist yet, and the suite would fail between their commits.
- The order edit's restore and report read the diff's pairing of map beats, which 4C owns whole. A second seat there would share every function it touches.

**Who owns which file.**

| Slice | Owns |
|---|---|
| 4A | `craft-form.md` (C2) and `craft-story.md` (C16's article writer's part); their sentence pins in `lib/__tests__/rule-set.test.js` |
| 4B | `lib/schemas/outline.schema.json`. In `lib/map.js`, all but `mapResume`'s reading of the edits: the shape constants and bounds, `mapFindings` and its lines, `mapLengthOf`, `mapWritersTextBlank`, `writersLinesInPrint`, `mapCheckpointData`. In `lib/workflow/nodes/map-nodes.js`, `firstLookData`, `mapPageWords` and `checkMap`. In `lib/prompt-builder.js`, `mapTask`, `STORY_MAP_LABEL` and `ARTICLE_TASK`'s line on order. `lib/stop-pages.js`'s map page and its option. `lib/stops-log.js`'s `wordsOpen`. In `console/checkpoint-view-logic.js`, the map's view (`mapView`, its constants, its labels, the legend and the dots), but not the edit words in `mapEditLineOptions`, `mapChangedEditLines`, `beatWords` and `mapPathWords`. In `console/outline-edit-logic.js`, `BEAT_KEYS`, `validateBeat`, `initBeat`, `buildBeat`, and the moves with a place. The fixtures' synopses, `references/schemas.md`'s beat line with `__tests__/unit/journalist-skill-path.test.js`, and every pinned hash the synopsis or the article task moves |
| 4C | `lib/hand-edit-diff.js`'s map functions (the order edit, `mapParts`, `mapEditWhere`, `mapBeatText`, the restore and the report for the order). `standingOnMap`, as `mapResume` reads it. `MAP_EDIT_LINES_GUIDE` and `MAP_EDITS_FINAL` (`node-helpers.js`). In the console, `mapEditLineOptions`, `mapChangedEditLines`, `beatWords` and `mapPathWords`. `scripts/lib/fixed-map.js`'s planted order and summary edits, and the map's rework renders in `scripts/render-prompts.js` |
| 4D | `console/components/checkpoints/Outline.js`; the map's CSS in `console/console.css`, with the dot tones in the light and dark tokens; the map's rows of `console/unsaved-input-logic.js`; `__tests__/unit/console-map-screen.test.js`, and the map's parts of `console-stop-pages.test.js`, `console-held-actions.test.js` and `console-editable-pencils.test.js` |
| 4E | `SKILL.md`'s map stop, the rest of `references/schemas.md`, and the agents `journalist-outline-generator.md` and `journalist-article-generator.md`; `CONTEXT.md`; `docs/PIPELINE_DEEP_DIVE.md`; `docs/runbook/first-run-sheet.md` |

Each slice updates the sections of `CLAUDE.md` that describe what it changes:
- 4B: The map (the shape, the checks, the length and the stop), the `outline` rows of the payload table, the stops log's row, and Key Files;
- 4C: The director's edits are final, for the map's order edit, and the `handEditReport` row;
- 4D: The map on screen; The map's and the desk's editors; and the Testing section, which today says no stand-in React test runs `Outline.js`.

## Gates

None makes a live model call. The director's next new session is the live test.

1. **The suite,** at the phase branch's head: exit 0, nothing skipped.
2. **The prompt checks,** on the integrator's database copy.
   - Render the map writer, its check rework, its send-back rework (with the planted reorder and summary edit), the article writer and the article judge from 092026, 092626 and 0926262. The renderer plants the fixed map.
   - For every call: it builds; it reads exactly the rule files the phase 4 spec's section 11 gives it; no retired wording and no em-dash in any instruction text; `<DIRECTOR_GUIDANCE>` comes last where a writer has one; and its size is recorded beside piece 3's.
   - The map writer's `<SCHEMA>` carries the synopsis's description. Its task asks for a summary per move, the order as the article tells it, and both pages' aims.
   - The article writer's label names the synopsis, and its task no longer gives it the order.
   - `<HAND_EDITS>` in the send-back rework lists the order edit by the moves' titles and the summary edit by its move.
   - The record view and the director-words renderers print byte-identical text on `main` and on the branch.
3. **The click-through,** through the mock server, on a fixture thread cut from the database copy with a map in 100326's shape planted: the mock-up's 16 moves, five sections and ten photos. The board is read against the mock-up and the spec's sections 4 to 7. Then:
   - **Counts:** the page as it opens and with every summary open, counted by `wordsShown`, against 401 and 708 on the mock-up's text.
   - **Display:** one summary and every summary opened; a thread picked and cleared; a dot and a photo hovered; a photo whose file is missing.
   - **Selected card:** a card selected, its words edited (summary among them), moved up and down, moved to another section, left out and brought back.
   - **Dragging:** a card dragged within its column and into another, and into the tray and back. A photo dragged onto a move in another column, onto a column, and to the top.
   - **Holds:** a click on another card while an editor is open.
   - **Narrow screen:** the columns stack.
   - **Old map:** a map with no synopses.
   - **Sending:** the payload each button sends.
4. **The docs grep.** No description survives, in `CLAUDE.md`, the docs, the skill or the prompts, of:
   - the map's page as one column;
   - the Everyone list on the page;
   - the photos' descriptions printed beside them;
   - "(card)" on the map's page;
   - the article writer's choice of order within a section;
   - the map's single count.
5. **The final whole-piece review,** on Opus 5.5.

The gates prove the pipeline works. The director's next new session shows whether the map works for them, read with the spec's section 15's measures.

---

## Brief 4A: the rule files

**Intent.** The writers learn the summary and the order from the rules they read. This slice writes the approved text into the rule files.

**Prompt.**
- `craft-form.md`: C2's third paragraph and its why, as `rule-text-read.md` gives them, word for word.
- `craft-story.md`: C16's article writer's part, as it gives it, word for word.
- The glossary is 4E's.

**Plumbing.** Report the retired wording: "the order of the beats within each section". The integrator adds it to the removed-phrase list once no code text still carries it (4B removes `ARTICLE_TASK`'s copy).

**Tests.** The rule-set lint holds:
- each item is stated once;
- every pointer names an item the set states;
- no em-dash, no gendered Nova, and nothing on the removed list.

A test pins one sentence from each changed item. The pinned writer renders read the fixture stubs, so no hash moves.

**Verification.** Render the map writer and the article writer from 0926262 on the integrator's copy, and read C2 and C16 in place.

**Done.** The files carry the approved text, and the lint passes.

**Out of scope.** The prompts' own task lines (4B).

---

## Brief 4B: the move's summary, the board's page model and its length

**Intent.** On 100326 the map's page was one long column of 535 words, and the director found it difficult to follow (spec 2). This slice makes four changes (spec 3, 4, 8 to 11):
- The map writer writes a summary for every move, and orders each section's moves as the article will tell them.
- The article writer tells the moves in that order, each as its summary says.
- The map's page model gives the board its lines.
- The page is counted twice, as it opens and with every summary open.

4D renders the page model.

**Plumbing, the server side** (seat 1).
- **The shape** (R1). Add `synopsis` to both copies of the beat in `outline.schema.json`. It is required in the writer's schema and optional in the director's. Its description is model-facing (writing-for-agents): one sentence, in story terms, saying what the article tells at this move, never how it is written (C2).
- **The writer** (`mapTask`). Ask for:
  - a summary for every move, of about 20 words;
  - each section's moves in the order the article will tell them (C2, C6);
  - a page whose own words aim for 300 as it opens, with the summaries about 250 between them.

  The task points at the items and restates none.
- **The article writer.**
  - `STORY_MAP_LABEL` names `"synopsis"` as what the article tells at that beat.
  - `ARTICLE_TASK`'s line on sections no longer gives the writer the order of the beats (R2).
  - The article judge reads the map whole, synopses included, unchanged.
- **The checks** (`mapFindings`):
  - Story terms on each synopsis the writer wrote. The director's line names the move by its title.
  - R5: a writer's beat in a section carries only the story's threads. The line and the message name the thread by its name.
  - The length is seat 2's.
- **The payload** (R4). `mapCheckpointData` sends the legend's threads, the connections and the other threads' names. `firstLookData` follows.
- **Fixtures.** Synopses on every beat of `rework-state.js`'s `MAP`, `story-level-map.js`, the mock client's `getDefaultOutline` and `scripts/lib/fixed-map.js`. `references/schemas.md`'s beat line and `journalist-skill-path.test.js` follow the schema.

**The page model** (seat 2; spec 4 to 7).
- **`mapView`** gains `order`, the spec's section 4 order, which `lib/stop-pages.js` and `Outline.js` both follow. It gives:
  - the round's lines;
  - the counts: everyone placed or who is not, the cards with their range when they leave it, the photos placed of those kept, and the expected length;
  - the settled story with the gap note;
  - the legend: each story thread's name and `tone`, with its line folded;
  - the top of the article;
  - the columns. Each has its slot's label, its heading or that none prints, its job, its cards in order, its photos by themselves, and the mark that an emptied column drops when the map is sent;
  - the tray, the dropped sections and the weave changes.
- **Each card** gives:
  - its title and people;
  - its dots;
  - "Card" when its evidence prints as a card (R11);
  - its photos, each with its description in the photo's own view, never as a page line (R7);
  - its synopsis, or none;
  - its evidence fold, and where its threads meet, by the connection's line;
  - its concerns, failures and changed lines;
  - its controls' labels.

  No line or label carries an id. Each element's `label` and `labels` follow piece 1's convention.
- **The moves with a place** (`console/outline-edit-logic.js`), each one function:
  - a beat to a place in any section, or to its foot;
  - a beat brought back to a place;
  - Move up and Move down within its section, doing nothing at either end;
  - a photo onto a move in any section, landing beside it in that section;
  - a photo to a column by itself, or to the top.

  `BEAT_KEYS`, `validateBeat`, `initBeat` and `buildBeat` take `synopsis`. The add line stays `{id, move, players}`.
- **`lib/stop-pages.js`** prints the board's lines in the view's order. These are folded (R8): the synopses (unless the page is opened with them open), the thread lines, the evidence, and the photos' descriptions (R7). `stopPage` and `wordsShown` take the option that opens the synopses. `PAGE_HEADINGS` and `PAGE_REGIONS` follow the view.
- **The length** (R6). `mapPageWords` counts both pages on the writer's share. `mapWritersTextBlank` blanks `synopsis`. Each page past its allowance fails on its own, and its line says which page ran long: "As the map opens, ..." or "With every summary open, ...". Its message names its longest lines, the synopses among them on the open page, and no longer names the photos' descriptions. `_mapCheck.words` keeps both counts.
- **The stops log.** The map's pause line gains `wordsOpen`. No other stop's line changes.

**Prompt.** The synopsis's schema description; `mapTask`; `STORY_MAP_LABEL`; `ARTICLE_TASK`'s line on sections.

**Invariants.**
- The map writer still reads everything it reads today, and `<DIRECTOR_GUIDANCE>` stays last.
- No buried memory's id, owner or text reaches the map.
- The map checks' mark still skips a checked map on a replay.
- The director's version is never held to either bound.
- A map with no synopses validates, counts and shows (R1).
- The evidence is never the director's edit.

**Tests.**
- **The shape:**
  - the writer's schema requires `synopsis` in both copies, and the director's does not;
  - a map from before piece 4 passes the director's gate and the client's gate, counts on both pages, and is not an old shape (Review focus 2).
- **The checks:**
  - a writer's synopsis that holds a quotation, a time, a figure or a document id fails, and a director's never does;
  - a writer's beat in a section that carries a left-out thread fails, naming the thread; a beat the director brought back never fails (Review focus 5).
- **The length,** on a map in 100326's shape with invented text (16 moves):
  - each page is within its bound;
  - long synopses fail the open page alone, and the message names the longest;
  - long photo descriptions count on neither page;
  - the director's lines never count toward the writer's words.
- **The payload:** the legend's threads are in the angle's order; no id reaches a page line or a label.
- **The view:**
  - the order;
  - the dots' tones by place, and the grey tone for a thread outside the story;
  - the card mark;
  - the synopsis folded;
  - each move with a place, at both ends of a column, and a photo onto a move in another section.
- **The stops log:** `wordsOpen` appears at the map and nowhere else.
- **The article writer's lines.**
- The survey's lists of pinned beat keys and pinned page lines move here, each with its reason. Each pinned hash this slice moves is updated, with the reason.

**Verification.**
- Render the map writer, its check rework and the article writer from 092026 and 0926262 on the integrator's copy, with the fixed map planted. Read the schema's description, `mapTask`, `STORY_MAP_LABEL` and `ARTICLE_TASK` in place.
- Build the map's page from the fixed map with `lib/stop-pages.js`, and count both pages.

**Done.** The full suite passes. The renders read as stated. `mapView` gives the board.

**Out of scope.** The director's order and summaries as edits (4C); the component (4D); the skill's other files and the docs (4E); the change review (piece 2).

---

## Brief 4C: the director's order and summaries as edits

**Intent.** After 4B the director's order within a section is not an edit. The map's diff ignores order within a section, so an automatic pass can undo the order and nothing reports it. A summary edit's lines also name its field. This slice makes the order the director's edit (R3) and gives summary edits their words (R11).

**Plumbing** (`lib/hand-edit-diff.js`'s map functions).
- **The order edit** (R3):
  - read by `mapEditsBetween` against the map the director was shown;
  - carried by `standingOnMap` across looks, where a later reorder of the same section replaces it under its id;
  - put back by `settleEdits` after an automatic pass;
  - recorded by `reportAfterPass`;
  - listed in `<HAND_EDITS>` by the moves' titles in the director's order.

  `MAP_EDIT_LINES_GUIDE` and `MAP_EDITS_FINAL` say the order stays as the director left it.
- **The summary edit.** `mapParts` takes each section beat's `synopsis`, so a sentence the director cut from a summary that comes back is flagged. `mapBeatText`, a whole beat on the report, stays the title and the people.
- **The words** (R11). `mapEditWhere`, the console's `beatWords`, `mapPathWords`, `mapEditLineOptions` and `mapChangedEditLines` name:
  - a summary edit as the summary of the move, by its title;
  - an order edit as the order of the section, by its slot's label.

  Neither ever shows an id or a field name.
- **The render.** `scripts/lib/fixed-map.js` plants a reordered section and a summary edit. `scripts/render-prompts.js` renders the send-back rework and the check rework with them.

**Prompt.** `<HAND_EDITS>` for the order edit and the summary edit; `MAP_EDIT_LINES_GUIDE`; `MAP_EDITS_FINAL`.

**Invariants.**
- An automatic pass still changes only what its findings name, and code puts back every standing edit it changed.
- A send-back's rework may still change an edit, saying why, and is not restored.
- Today's map edits (a strike, a move between sections, an added beat, a photo moved, the top photo, a line rewritten) read, stand and restore as they do now.
- A beat moved to the foot of another section makes no order edit.

**Tests.**
- A reorder at one look stands at the next. An automatic pass that reorders the section has the director's order put back, a beat the pass added keeps its place, and the report holds one line (Review focus 1).
- A card dropped in the middle of another column: the move edit and the target section's order edit, both restored.
- A struck beat that the order named: the order is still carried by the beats that remain.
- A summary rewritten and then rewritten by a pass is put back, and its line names the move by its title (Review focus 4).
- No id and no field name in any line the map's page or the report prints for the new kinds.
- The console's words are held to the server's on one corpus with the new kinds.

**Verification.** Render the send-back rework and the check rework from the fixed map on the integrator's copy, and read `<HAND_EDITS>` in place.

**Done.** The full suite passes. The renders read as stated.

**Out of scope.** The component (4D); the change review (piece 2).

---

## Brief 4D: the board

**Intent.** The map's page shows 4B's page model as a corkboard (spec 4 to 7; the mock-ups "Map: corkboard columns (100326)" and "Map: a move opened").

**Screen** (seat 1: the render and the selection).
- `Outline.js` renders `mapView`'s fields in its `order`:
  - the round's lines;
  - the counts, with the expected length's editor;
  - the settled story with "Back to the story meeting", and the gap note with its editor;
  - the legend, where picking a thread shows its line, outlines the cards that carry it and dims the rest, and Show all clears it;
  - the top of the article, with its editors;
  - the board, with the button that opens or closes every summary, and the columns. Each column has its head and its editor, its cards, its photos by themselves and its add line;
  - the tray;
  - the dropped sections;
  - the weave changes;
  - the note box with the standing notes folded under it, and Approve and Send back as today;
  - the trace, folded.
- **A card** shows the arrow that opens its summary, its title, its people, its dots (each with its thread's name in its `title`), the "Card" mark and its thumbnails. When the picture cannot load, the description shows in its place.
- **Selecting.** A card is focusable, and Enter or a click selects it. A selected card opens in place, with:
  - its summary, its people and its threads by name;
  - its photos with their descriptions;
  - the controls: Edit the words, Move up, Move down, Move to another section, Put a photo beside it, and Leave it out or Take it out;
  - what's behind it.

  Clicking it again, Escape, or selecting something else closes it. A move in the tray opens the same way, with Bring it back and its section. A photo opens with its description and where it can go.
- **The margin.** Each card's concerns, failures and changed lines sit under its title, whether it is selected or not (spec 7).

**Screen** (seat 2: the drag and drop, the holds and the look).
- **Drag and drop** uses the browser's own, with no library:
  - cards move within a column, between columns, into the tray and out of it;
  - photos drop onto a move, onto a column or onto the top.

  Each drop calls the same handler as its button (R10). A drop target shows where the card will land.
- **The holds** (R9). The map's rows of `console/unsaved-input-logic.js` gain the selection and the selected card's controls, each with its held line.
- **The CSS** follows the mock-ups in the console's look:
  - the columns, the cards, the selected state and the drop targets;
  - the dot tones, in the light and dark tokens;
  - on a narrow screen, the columns stack.

  The one-column page's classes go.

**Tests.**
- `__tests__/unit/console-map-screen.test.js` runs `Outline.js` under `mountMap`:
  - the page renders the view's fields in order, with no id anywhere;
  - it selects, opens a summary, opens every summary and picks a thread;
  - it moves a card up, moves it to another section, leaves it out and brings it back, and places a photo, checking that each calls its `EditLogic` op through one handler;
  - it calls each drop handler with a stand-in `dataTransfer`, reaching the same op;
  - a click on another card while an editor is open is held, and the typed words survive (Review focus 3).
- `console-stop-pages.test.js`: the headings and regions, and the two `CollapsibleSection`s (R8).
- `console-held-actions.test.js` and `console-editable-pencils.test.js` follow the board's hosts.

**Verification.** The integrator's click-through covers the wiring and the drag and drop. The return lists each element of the page and the view-model field it renders.

**Done.** The full suite passes, and the page renders 4B's view model as the board.

**Out of scope.** The story meeting's page; the desk (piece 5).

---

## Brief 4E: the standalone skill and the docs

**Intent.** The skill and the docs say what the pipeline now does.

**Docs.**
- `SKILL.md`'s map stop, in chat: each move with its summary, the order as the article's, and both counts.
- `references/schemas.md` beyond 4B's beat line.
- The agents:
  - the outline generator writes the summaries and orders the moves, under both bounds;
  - the article generator tells the moves in the map's order, each as its summary says.
- `CONTEXT.md`: the glossary entries for Beat and Story map, as `rule-text-read.md` gives them, word for word.
- `docs/PIPELINE_DEEP_DIVE.md` and `docs/runbook/first-run-sheet.md`: the map as a corkboard.

**Tests.** `journalist-skill-path.test.js` and `retired-craft-files.test.js` hold.

**Verification.** The integrator's docs grep.

**Done.** The full suite passes, and the grep finds nothing retired.

**Out of scope.** `CLAUDE.md`'s code sections, which belong to each code slice; the roadmap, which is the integrator's.
