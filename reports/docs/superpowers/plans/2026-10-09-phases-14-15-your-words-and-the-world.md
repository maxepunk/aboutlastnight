# Phases 14 and 15: your words at every stop, and the article in the world Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** A ruling the director makes at any stop holds for every later stage; ledger rows the session report logged on the wrong clock reach the writers on the right one; and the writers place the article in its world (its authors in the story, only what exists in the world, the game's rules off the page, Nova's theory, the time of day) without the director's help at the desk.

**Spec.**
- The authority is `docs/superpowers/specs/2026-10-09-your-words-and-the-world.md` (commits `7f01b014`, `aeea60a1`).
- The rule text is `rule-text-read.md` in the phases' workspace (`.superpowers/sdd/2026-10-09-phases-14-15/`), approved by the director on 2026-10-09 as written: the rulebook sits in T14, so the article judge treats a rulebook line as must-fix.
- The code footprint is `surveys/phase-14-footprint.md` and `surveys/phase-15-footprint.md` in the same workspace, with file and line at `8efa4d3d`.
- The integrator's rulings are the spec's section 18, restated under "Rulings" below.
- The vocabulary is `CONTEXT.md`'s, as slice A amends it. A note is what the director sends with an action at a stop; "the director's notes" are their session notes.

**Builds on.** Local `main` at the spec commits, after the 100426 publish (`dd07a19a`, which pushed pieces 3 and 4) and the roadmap (`8efa4d3d`). The phase branch, `feat/phases-14-15`, is cut from this plan's commit. `main` is ahead of origin, and the push is the director's.

**Architecture.**
- **The director's words** become one list in one module: the session notes, the input-review corrections, the accusation, the answers at the story meeting, and every note sent at a stop. The judges print the notes at the stops in a block of their own; the evidence check, the fact check and the verdict guard read the whole list.
- **The ledger's clock.** At the parse, adjustment events (the bonus and transfers) logged more than three hours outside the span of the session's sales and exposures move by one whole-hour shift, anchored on the bonus at the first sale. The input review's ledger panel says what moved.
- **What the writers are told about the session** gains Nova's name for the session, the guest reporter when there is one, and one line giving the investigation's time of day. The record's labels stop fixing "the morning". On site, the character-IDs parse and the photo entries know Nova.
- **The record** marks each character sheet and drops its suspected motive and its starting instructions; no card prints a sheet.
- **The rule files** carry the approved text, and the judges' questions and the fact check's messages follow it.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides, and the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace), with its cost if wrong.

**The rule text** goes into the rule files and `CONTEXT.md` word for word, as `rule-text-read.md` gives it. The examples in the read (session names, quotes) stay out of every file a model reads.

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written. A note is read as T1 sets out: what it says happened, or rules about the record, is record; a direction is written as Nova's reading.

**The director's edits are final** (phase 4 spec, section 7, as built). No change here touches the restore machinery in `lib/hand-edit-diff.js`. A rare combination found while building goes in the ledger, not into a fix round (roadmap, build housekeeping).

**Story terms** (piece 1, unchanged). The writers' lines hold no quotation from the record, no figure, no clock time and no document id, as today.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt line, a block label, a schema description, a check's line, a judge's question.
- State each target positively and each rule once, with its reason. A code-built line names the rule item it applies (T1, T7) and never restates it.
- No em-dashes. Nova is never gendered.

**Themes.** Code never names Nova, NovaNews or the journalist's slots outside the theme's files (`lib/__tests__/theme-rules.test.js` scans for it). Text that names Nova comes from `lib/theme-config.js`. Only the journalist runs; the detective stays parked.

**Modes and guests.**
- Nova in a photo, Nova's names in the character-IDs parse and the photo entries' marking apply on site only (`sessionConfig.reportingMode === 'on-site'`). A remote session's photos are handled as today.
- Everything about the guest reporter applies only when `sessionConfig.guestReporter` is set. Many sessions have none; a session with none prints nothing new.
- World.md and the truth rules render byte-identical in both modes (`lib/__tests__/prompt-builder.test.js` :385-391). Mode-specific text lives in the mode blocks or in code-built lines.

**No other changes.** No model, effort or pin changes. No npm install, update or ci. No new state channel: the shift lives on `sessionConfig.adjustments` and `ledgerCheck`, the notes stay in `directorGateNotes`. No new fact-check check beyond the card checks refusing a character sheet (spec 11). If a step seems to need a package, stop and report it.

**One source of truth.**
- The director's words are one list (R1), read by every reader that reads them today.
- A rule two places apply is one function or one constant, which both call: `isCharacterSheet`, the time-of-day line, Nova's session line, the guest reporter's line, the shift.
- The console keeps a copy of a server constant only where it cannot import it, and a test holds the two equal.

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The shift is stamped at the parse, so a replay reads the stamped times.

**Console.** Logic that decides a line goes into the dual-export pure modules (`console/input-review-logic.js`), with node tests. Components stay thin.

**Tests.**
- No live model calls; Jest maps the SDK to its mock. Each brief's Verification runs with no model call.
- Every commit passes the full suite, exit code guarded. Counts fall only by the tests a brief retires, and the brief's return names each one.
- Tests that pin today's text break by design. The slice that changes the text updates them, with the reason, and updates any pinned hash it moves (`lib/__tests__/writer-prompts-pinned.test.js`, each with its reason and length delta in the header comment).
- No test reads `data/`. A test in a real session's shape uses invented text, because the repo is public.

**What the integrator owns.** Recomposing a pinned hash that two slices of one run moved; the removed-phrase list in `lib/__tests__/fixtures/removed-phrases.js` (R12); the roadmap; the gates.

**Docs.**
- `reports/CLAUDE.md` is shared by section. Each code slice updates the sections that describe what it changes, as its run's interfaces file names them.
- Slice A writes `CONTEXT.md`'s entries. Slice G updates the skill, `docs/PIPELINE_DEEP_DIVE.md` and the runbook.
- The integrator's docs grep is a gate.

## Rulings

The spec's section 18, restated so each brief can point at one.

- **R1. One list of the director's words.**
  - A new module, `lib/director-words.js`, owns the list: each source `{key, label, material, texts(state)}`, in this order: the notes, the corrections, the accusation, the answers at the story meeting, the notes at the stops. It exports the list and one function that returns every source's texts.
  - The notes at the stops are read from `directorGateNotes` whole, never through `filterGateNotes`: a judge reads the note a rework acted on too.
  - `evaluator-nodes.js` builds `DIRECTOR_WORDS_SOURCES`, `ARTICLE_DIRECTOR_WORDS`, `DIRECTOR_WORDS_MATERIAL` and `directorWords` from it. `lib/evidence.js` `notesTextsOf` reads it, so a piece of evidence may cite a note at a stop under "notes". `buildFactCheckArgs`' `directorText` and the verdict guard's `recordTexts` follow through `directorWords`.
  - "From your notes" stays as it is: `arc-specialist-nodes.js` `directorWordsOf` keeps the notes and corrections.
- **R2. The judges print the notes at the stops.**
  - Both judges' user prompts (the story meeting's fact check, `case 'arcs'`; the article judge, `case 'article'`) print a block with its own opening and closing tag, `<DIRECTOR_STOP_NOTES>`, beside `<DIRECTOR_ANSWERS>`. `TRUTH_MATERIAL` maps the new material to it.
  - The block opens with one line: these are the director's own words, sent at the stops, each read as T1 sets out. Each note is one entry with its stop's label and the action it went with, then its text word for word.
  - With no notes, the block holds "None." so every question that names it finds it.
  - The meeting's fact check's questions are worded by hand (`phase === 'arcs'` branches); slice F words them, and slice B adds the material to their `reads`.
- **R3. The ledger's shift.**
  - Computed and stamped at the parse (`parseRawInput` → `buildLedger`, `lib/session-ledger.js`), where the sale times are. `buildLedger` takes the exposures' times as well.
  - The span runs from the session's first sale or exposure to its last, in the session clock's order (`lib/prompt-renderers/session-clock.js`, its circular first-event rule).
  - An adjustment event (the bonus, a transfer) is off the clock when it sits more than 180 minutes outside the span. Only classified events are tested and moved; the game master's setup row makes no event. Unclassified rows stay as logged.
  - The shift is a whole number of hours, from -12 to +12, never 0. When the bonus is among the off-clock events, the shift is the one that lands the bonus nearest the first sale. Otherwise it is the shift of the fewest hours that puts every off-clock event inside the span. A shift is used only when every event it moves lands inside the span; otherwise nothing moves and the rows are flagged.
  - Each moved event keeps its logged time beside the shifted one: `{time, loggedTime}`, the shifted time written in the session's own format (`hh:mm AM`). `session-clock.js` gains the helper from minutes back to a logged time.
  - `ledgerCheck` gains `clockShift: {hours, moved, bonus}` when a shift was used, or `offClock: {rows}` when none fit. Neither key is present when no event is off the clock.
  - The input review's ledger panel prints one line, from `ledgerView`: "The session report logged the first-burial bonus and 4 transfers 9 hours off the game's clock. They're shifted back 9 hours to line up with the sales." (the count and the kinds as moved), or "3 ledger rows sit off the game's clock, and no single shift lines them up. They print as the session report logged them."
- **R4. Nova's name for the session.**
  - One line, built from the theme's Nova entry (`lib/theme-config.js`) and `sessionConfig.journalistFirstName` (default `Cassandra`), joins the roster section's Nova line (`prompt-builder.js` `generateRosterSection`, through `rosterWithPronounsSection` and `_rosterSection`), so every writer and judge reads it. Its text, in the theme's file, says Nova signs the article with that name and the director's notes may call Nova by the first name.
  - On site only: the character-IDs parse (`image-prompt-builder.js`, `photo-nodes.js` `parseCharacterIds`) and the enrichment's `ROSTER:` line give Nova's names beside the roster, as the article's writer, so the parse never corrects the name to a player's. The photo entries (`ai-nodes.js` `heroPhotoEntry`, `buildAvailablePhotos`) mark a name equal to Nova's first name, or "Nova", as the article's writer.
  - A name that matches a roster player is the player: the roster decides, and Nova's mark applies only when no roster player matches.
- **R5. The guest reporter, when the session has one.**
  - One line, built from `sessionConfig.guestReporter {name, role}`, says who shares the byline and that a memory turned in under their name is their reporting for this article. It joins `SESSION_FACTS` (`ai-nodes.js` `buildSessionFacts`, `prompt-builder.js` `_sessionFactsSection`) and the weave writer's first section, so the meeting's writer, the map's writer, the article writer and the judges read it.
  - `lib/prompt-renderers/record-view.js` `turnInName` marks a turn-in under the guest reporter's name, matched by full name or first name, case-insensitively: `named: Taylor (the guest reporter, Taylor Chase)`.
  - With no guest reporter, neither prints.
- **R6. Character sheets.**
  - One predicate, `isCharacterSheet(item)`, in `lib/evidence.js`: a paper document whose name ends " Character Sheet", in any case. `basicType` cannot decide.
  - `record-view.js` `renderDocument` prints a sheet with its own kind, `kind="character sheet"`, and a one-line label pointing at T1, and drops the blocks headed SUSPECTED MOTIVE (`▌[FLAGGED] SUSPECTED MOTIVE`) and WHERE TO START, each to the next heading. A sheet without those headings prints whole, marked. Character extraction renders through the same view, so it reads the trimmed sheet.
  - `recordDocumentOf` refuses a sheet as a card's document, so the map's card check and the article's card fidelity fail a card that prints one. A piece of evidence may still cite a sheet.
- **R7. The time of day.**
  - One function builds the line from `sessionClockOf` (its `evening` flag) and the timeline's span: "The investigation ran this morning, from 9:20 to 10:23 AM." or "The investigation ran this afternoon, from 3:50 to 5:18 PM." A session with no sale and no exposure prints none.
  - It prints in `SESSION_FACTS` (the map writer, the article writer, their reworks, the article judge) and, for the calls without `SESSION_FACTS` (the weave writer, its rework, the meeting's fact check), in their first section beside the session roster. The rule text calls it "the session's facts".
- **R8. Neutral labels.** "The morning" leaves every code-built label:
  - the tag `<morning-timeline>` becomes `<investigation-timeline>`, with `TRUTH_MATERIAL.timeline`;
  - `TIMELINE_INTRO` and `renderRecordView`'s introduction;
  - `lib/evidence.js` `SOURCE_MEANINGS` for the ledger and the evidence log ("on the morning timeline");
  - the weave writer's SECTION 2 line (`arc-specialist-nodes.js` :388);
  - `_buildFinancialSummary`'s "That is what the buyer paid out this morning" (`prompt-builder.js` :693).
  
  The judges' questions are slice F's (R9). The session clock's own decision, and the console's `clockLine`, stay.
- **R9. The judges' questions and the fact check follow the rules.**
  - In both judges (`evaluator-nodes.js` `TRUTH_GROUPS`): `novaPositionTruth` (T8: no side in the verdict, the mode block's part), `evidenceTruth` (T1's opinion and the sheets' rule, T4's account names), `moneyTruth` and `stagesTruth` (the time of day), `fictionTruth` (T14: the rulebook as well as production words).
  - The fact check's T8 messages (`content-bundle-fact-check.js` `votesLine` :1540 and the reporter-mode message :1552-1555) follow T8's new wording. The prefix, "Reporter-mode violation:", stays: the console groups by it.
  - `SESSION_FACTS`' "Nova is not one of the players" stays.
- **R10. Pinned writer hashes.** Slice B moves the arcs and article pins (`SOURCES_GLOSS[NOTES]`); slice E moves all three. Slices A, C, D and F move none (the renders use stub rule files; the fixture is remote, has no guest reporter, no adjustments and no sheet). Each re-pin records its reason.
- **R11. Old threads.** No session is refused or rolled back. A session parsed before phase 14 keeps its logged times; a new parse, or the input review's Reject with corrections, lines them up. Everything else reaches a thread at its next call.
- **R12. Retired wording.** Once no code text carries it, the integrator adds each to `removed-phrases.js`:
  - "is never one of the room" (slice F removes the fact check's copy);
  - "for being there and for nothing more";
  - "Nova says so in one plain line";
  - "One honest line about Nova's own motive";
  - "this morning, in the warehouse";
  - "what is still open often belongs in the closing";
  - "is never a reason to suspect its namesake" (slice F removes the judge's copy);
  - "paid out this morning" (slice E);
  - "on the morning clock" (slices E and F).

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, most likely first. Each names the slice whose tests pin it.

1. **A session whose ledger rows are all on the clock**, as every session before 100326. No shift, no `clockShift` or `offClock` key, no line on the input review, and the timeline byte-identical; a transfer two and a half hours after the last sale stays where it was logged (C).
2. **A session with no notes at any stop.** The judges' block holds "None.", and every question that names it finds it; nothing else in either prompt changes (B).
3. **A session with no guest reporter, and a remote one.** No guest line anywhere, the named turn-ins print as today, the character-IDs parse and the photo entries are unchanged (E).
4. **On site, a roster player whose first name is Nova's,** or a photo naming "Cass" with Cass Zhang on the roster. The roster decides: the player is the player, and Nova's mark applies only when no roster player matches (E).
5. **A character sheet stored without its headings** (an older copy, saved as a Prop). It prints whole, marked as a sheet, and a card that prints it still fails the card check (D).

## What these phases change for the director

| Stop | Today (100426) | After |
|---|---|---|
| Input review | The bonus and transfers logged nine hours off the clock print as logged | One line in the ledger panel says they were shifted back nine hours to line up with the sales |
| Story meeting | The writer asks about the off-clock rows; the fact check never reads your notes | No question about rows that were lined up; the fact check reads your notes at the meeting |
| Map | "Cassandra isn't rostered" in the gap note; the writer never hears of the guest reporter | The writers know Nova's name for the session and the guest reporter, when there is one |
| Article | The judge overrides your map ruling twice; you cut character-sheet quotes, rulebook lines and "this morning" at the desk | The judge reads every note you sent; the writers place the article in its world, by the approved rules |

## Slices and how they run

**How the work is split.** Phase 14's three parts and phase 15's code each touch different modules, so they run as separate slices. Two places are shared: `evaluator-nodes.js` (B adds the source and the block, F words the questions, E renames the timeline's material) and `lib/evidence.js` (B reads the list in `notesTextsOf` and the notes' gloss, D adds `isCharacterSheet`, E rewords the ledger's and the log's glosses). The runs keep each shared file to one slice per run, except `lib/evidence.js` in run 1 (B's `notesTextsOf` and notes gloss, D's `isCharacterSheet` and card refusal) and `evaluator-nodes.js` in run 2 (E's `TRUTH_MATERIAL.timeline` and the time-of-day line in the meeting's fact check, F's `TRUTH_GROUPS` questions). There the slices touch separate functions, and the interfaces file names them.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| A | The rule files and the glossary | prompt | small | the phase branch is cut |
| B | Your words at every stop | plumbing, prompt | medium | the phase branch is cut |
| C | The ledger's clock | plumbing, screen | medium | the phase branch is cut |
| D | The character sheets | plumbing, prompt | small | the phase branch is cut |
| E | What the writers are told: the authors and the time of day | prompt, plumbing | large | run 1 merges |
| F | The judges' questions and the fact check's words | prompt | medium | run 1 merges |
| G | The standalone skill and the docs | docs | small | run 1 merges |

**Runs.** Each run is one workflow.

| Run | Slices | Long pole |
|---|---|---|
| 1 | A, B, C, D | C |
| 2 | E, F, G | E |

- The integrator merges a run's slices into the phase branch in the table's order. Each is rebased onto the last, with the full suite at every commit. The next run's worktrees are cut from the new head.
- Before each run the integrator writes that run's interfaces file: the names the earlier slices chose, who owns which functions of a shared file, the `CLAUDE.md` sections each slice updates, and the pinned hashes each slice may move.
- The phases merge to `main` once, after the gates. The integrator asks the director before merging, and merges only when no session is paused at the input review or a later stop.

**Seats.** Each slice is a chain of seats in one worktree. After the seats come a spec reviewer; on B, C and E an adversarial reviewer who demonstrates each failure; a verifier for each blocking finding before any fixer; and at most two fix rounds. A rare combination a reviewer finds in code no session has reached goes to the ledger.

| Slice | Seats | Effort |
|---|---|---|
| A | one | medium |
| B | one | high |
| C | one | high |
| D | one | medium |
| E | two: the authors (R4, R5), then the time of day and the labels (R7, R8) | high |
| F | one | high |
| G | one | medium |

**Who owns which file.**

| Slice | Owns |
|---|---|
| A | The rule files (`world.md`, `truth-rules.md`, `mode-on-site.md`, `mode-remote.md`, `craft-telling.md`, `craft-voice.md`, `craft-material.md`, `craft-judgement.md`, `craft-form.md`, `craft-cards.md`); `CONTEXT.md`'s entries; the rule files' sentence pins in `lib/__tests__/rule-set.test.js`, the mode-block pins in `lib/__tests__/prompt-reporting-mode-neutral.test.js`, and world.md's line in `lib/__tests__/prompt-builder.test.js` (:380) |
| B | `lib/director-words.js` (new); `lib/prompt-renderers/director-words-renderer.js`'s notes block; in `evaluator-nodes.js`, `DIRECTOR_WORDS_SOURCES`, `ARTICLE_DIRECTOR_WORDS`, `DIRECTOR_WORDS_MATERIAL`, `directorWords`, `TRUTH_MATERIAL`'s new entry, the block in both judges' prompts, and the new material in the arcs branches' `reads`; in `lib/evidence.js`, `notesTextsOf` and `SOURCE_MEANINGS`' notes entry; the tests that pin the four sources; the arcs and article pins |
| C | `lib/session-ledger.js`; `session-clock.js`'s new helper; the parse's call in `input-nodes.js`; `ledgerReviewOf`; `console/input-review-logic.js` `ledgerView`; `InputReview.js` `LedgerPanel`; `lib/stop-pages.js` `addLedger`; their tests |
| D | `isCharacterSheet` and `recordDocumentOf`'s card refusal in `lib/evidence.js`; `record-view.js` `renderDocument`; a fixture document in a sheet's shape |
| E | Seat 1: the theme's Nova line in `lib/theme-config.js`; `generateRosterSection`'s Nova line; the character-IDs parse prompt and the enrichment's roster line; the photo entries' marking; the guest reporter's line in `buildSessionFacts` / `_sessionFactsSection` and the weave writer's first section; `turnInName`. Seat 2: the time-of-day function and its places; the tag and `TRUTH_MATERIAL.timeline`; `TIMELINE_INTRO`; `renderRecordView`'s introduction; `SOURCE_MEANINGS`' ledger and log entries; the weave writer's SECTION 2 line; `_buildFinancialSummary`'s line; the tests that assert the tag (about 15 files). All three writer pins |
| F | In `evaluator-nodes.js`, the question texts in `TRUTH_GROUPS` for both branches; in `content-bundle-fact-check.js`, the T8 messages; their pins (`article-judge.test.js` :125-132, `weave-stage.test.js` :437-441, `evaluator-nodes.test.js`'s substrings, `content-bundle-fact-check.test.js` :1517-1529 and :705-721, `console/__tests__/checkpoint-view-logic-desk.test.js` :1020, :1031) |
| G | The skill (`SKILL.md`, `references/schemas.md`, the agents `journalist-image-analyzer.md`, `journalist-evidence-curator.md`, `journalist-arc-analyzer.md`, `journalist-outline-generator.md`, `journalist-article-generator.md`) with `__tests__/unit/journalist-skill-path.test.js`; `docs/PIPELINE_DEEP_DIVE.md`; `docs/runbook/first-run-sheet.md` |

Each code slice updates the sections of `CLAUDE.md` that describe what it changes:
- B: the director's words wherever CLAUDE.md names the four sources, "What the judges see", and the judges' truth criteria passage on the sources;
- C: the input review's `ledger` row, "The director's words as record" on the session report, and `lib/session-ledger.js` in Key Files;
- D: the record view and "Three-Layer Evidence Model"'s documents;
- E: the roster section, the photo entries, `SESSION_FACTS`, the guest reporter, and every "morning timeline" and "morning clock" in CLAUDE.md;
- F: "The judges read the rule set" and "Programmatic article fact-check" where they quote T8 or the questions.

## Gates

None makes a live model call. The director's next new session is the live test.

1. **The suite,** at the phase branch's head: exit 0, nothing skipped.
2. **The prompt checks,** on the integrator's database copy (`scratchpad/p4/db/render.sqlite`, read only), rendering every writer, rework and judge from 092026, 092626 and 0926262 with `scripts/render-prompts.js`. On one render, plant an on-site mode, a guest reporter, a note at the map and a note at the meeting.
   - Every call builds, reads exactly the rule files the phase 4 spec's section 11 gives it, holds no retired wording (R12) and no em-dash in its instruction text, and ends on `<DIRECTOR_GUIDANCE>` where a writer has one. Its size is recorded beside piece 4's.
   - Both judges carry `<DIRECTOR_STOP_NOTES>` with the planted notes, word for word, and "None." where none were planted.
   - Every writer and judge carries Nova's line with the session's first name; the planted guest reporter's line where planted, and none elsewhere; the time-of-day line in its places; `<investigation-timeline>`; no "morning" in a code-built label.
   - The sessions with character sheets print each one marked, without its SUSPECTED MOTIVE and WHERE TO START blocks.
   - The rule files' new text is in place in each call that reads it.
3. **The ledger's shift, on the stored inputs.** A script runs the parse's ledger step on the stored `orchestrator-parsed.json` of 0926262, 092726, 100226, 100326 and 100426 (copied to scratch, read only). Expected: no shift on the first three; back 9 hours on 100326 and 100426, the bonus a minute after the first sale.
4. **The click-through,** through the mock server, on a fixture thread at the input review with 100426-shaped adjustments (invented names): the ledger panel's shift line, and an unfit case's line. The harness's print of the same stop (`lib/stop-pages.js`).
5. **The docs grep.** No description survives, in `CLAUDE.md`, the docs, the skill or the prompts, of: four sources of the director's words; the morning timeline or the morning clock as the only time of day; Nova "never one of the room"; "one plain line" where the record stops; Nova's motive line; an account's name "never a reason to suspect its namesake"; the closing's "what Nova is chasing next" as the rule.
6. **The final whole-phase review,** on Opus 5.5.

The gates prove the pipeline works. The director's next new session shows whether the article does, read with the spec's section 16's measures, and its readout includes the standing step of the spec's section 12: the desk edits read for what they do in the world, with the reasons put to the director before any rule text.

---

## Brief A: the rule files and the glossary

**Intent.** The writers and the judges read the approved rules: the article's authors in the story, only what exists in the world, the game's rules off the page, the account-name rule the director set, opinion and a theory past the room, the closing with no forced form, the time of day, and the director's notes among their words (spec 6 to 10, 13).

**Prompt.**
- Each rule file, item by item, as `rule-text-read.md` gives it, word for word: world.md's paragraphs; T1, T4, T5, T6, T7, T8, T14; both mode blocks; C4, C12, C11, C13, C2, C14 (its new heading included), C9.
- `CONTEXT.md`: the entries Note, Ledger, Nova, and the new Guest reporter, Character sheet and Investigation, as the read gives them.

**Tests.** The rule-set lint holds: each item stated once, every pointer naming an item the set states, no em-dash, no gendered Nova, nothing on the removed list, every "anonymous unless" sentence carrying both of T6's conditions in exactly the three files, the files under their size. Update each sentence pin that the read changes (rule-set.test.js, including the hard-coded C14 string at :815; prompt-reporting-mode-neutral.test.js; prompt-builder.test.js :380), each with its reason. The pinned writer renders read the stubs, so no hash moves.

**Verification.** Render the map writer and the article writer from 0926262 on the integrator's copy, in both modes, and read each changed item in place.

**Done.** The files carry the approved text, the lint passes, and world.md and the truth rules render the same in both modes.

**Out of scope.** Code-built text (E), the judges' questions (F).

---

## Brief B: your words at every stop

**Intent.** On 100426 the director ruled at the map that the transfer times shift nine hours; the article writer used it, and the article judge, which never sees a note, called it a fact error twice (spec 2, 3). After this slice every note the director sends at a stop counts as their words for the judges, the fact check, the evidence check and the verdict guard, as it already does for the writers.

**Plumbing.** R1: `lib/director-words.js` owns the list; every reader of the four sources reads it. The notes come from `directorGateNotes` whole. `arc-specialist-nodes.js` `directorWordsOf` ("from your notes") is unchanged.

**Prompt.**
- R2: the `<DIRECTOR_STOP_NOTES>` block in both judges, with its one opening line pointing at T1, each note with its stop's label and its action, and "None." when there are none. Its renderer lives beside the other director's-words renderers.
- `ARTICLE_DIRECTOR_WORDS` and the materials follow the list, so four article questions name the fifth source; their pins update.
- `SOURCE_MEANINGS`' notes entry says the director's own words include their notes at the stops.

**Invariants.** A writer's prompt is unchanged but for the gloss. A judge's prompt is unchanged but for the block, the materials and the questions' list of sources. `scripts/lib/render-calls.js` passes nothing new while the judges read the notes from state (`render-calls.test.js` holds it).

**Tests.**
- The list: five sources in R1's order; the notes' texts are every note in `directorGateNotes`, a rework's own included.
- Each judge prints the block with the notes word for word, with their stops and actions, and "None." with none; every material a question reads is printed (the fixtures plant a note).
- A piece of evidence citing "notes" may quote a note at a stop.
- The fact check's `directorText` and the guard's record include a note's text.
- Update the tests that pin the four sources (survey 14, 1.6), and the arcs and article pins (R10).

**Verification.** Render both judges from 0926262 with a planted map note and a planted meeting note, and read the block.

**Done.** Every reader of the director's words reads the notes at the stops, and the judges print them.

**Out of scope.** The questions' own wording beyond the list of sources (F). Which notes a rollback keeps.

---

## Brief C: the ledger's clock

**Intent.** On 100326 and 100426 the session report logged the bonus and the transfers nine hours off the game's clock, and the writers asked the director about them, read them wrong, or left them out (spec 4). The fix belongs in the game engine; until then the parse lines the rows up and the input review says so.

**Plumbing.** R3, in full. `buildLedger` takes the exposures' times; the shift is chosen and stamped there; `ledgerCheck` gains `clockShift` or `offClock`; each moved event keeps `loggedTime`. The timeline, the evidence check and the writers read `sessionConfig.adjustments` and need no change.

**Screen.** `ledgerView` returns the shift's line, which `LedgerPanel` and `addLedger` print beside the clock's line.

**Invariants.**
- A session whose events are all inside the span, or within 180 minutes of it, is unchanged in every byte the writers read, and its `ledgerCheck` gains no key.
- The bonus's pairing with its holding-account debit, which reads the same minute, holds after a shift.
- Unclassified rows and the setup row stay as logged.

**Tests.**
- 100426's shape (invented names): back 9 hours, the bonus a minute after the first sale, the transfers inside the span.
- 100326's shape: the bonus alone off the clock, where 8 and 9 hours both fit the span; the bonus decides 9.
- Transfers off the clock with no bonus: the fewest hours.
- No shift fits: nothing moves, `offClock` counts the rows.
- The repo's fixtures with transfers up to two and a half hours after the last sale: unchanged.
- An evening session (times shown as morning) and a daytime one.
- The panel's lines, exactly. Update the three `ledgerCheck` equality assertions in `session-ledger.test.js` with the reason.

**Verification.** Gate 3's script on the five sessions' stored inputs, run by the slice on scratch copies.

**Done.** A new parse lines up off-clock rows and the input review says so; on-clock sessions are unchanged.

**Out of scope.** Re-stamping threads parsed before this phase (R11). Any change to the session clock's AM-for-PM decision.

---

## Brief D: the character sheets

**Intent.** Six of the players' character sheets reach the writers' record in every session, as documents like any other, and the writers quoted their motives and goals as Nova's evidence (spec 7). After this slice the record marks each sheet and drops its suspected motive and its starting instructions, and no card prints one.

**Plumbing.** R6: `isCharacterSheet`; `renderDocument` prints the sheet's kind and label and drops the two blocks; `recordDocumentOf` refuses a sheet as a card's document.

**Prompt.** The sheet's label, one line, points at T1 and says the document is a player's private instructions for their character. It never restates T1.

**Invariants.** Every other document prints byte for byte as today. A piece of evidence may still cite a sheet. Character extraction reads the trimmed sheet through the same view.

**Tests.**
- A sheet in the stored shape (invented text with the real headings): marked, the two blocks gone, the backstory blocks kept.
- A sheet with no headings: marked, printed whole.
- A document whose name holds "Character Sheet" elsewhere than at its end: not a sheet.
- The map's card check and the article's card fidelity fail a card that prints a sheet; the evidence check accepts a piece citing one.

**Verification.** Render the weave writer from 092626 and 0926262 on the integrator's copy and read the sheets in `<RECORD>`.

**Done.** Every writer and judge reads each sheet marked and trimmed, and no card can print one.

**Out of scope.** Labelling the sheets at the paper-evidence stop. A check for a sheet's text in prose.

---

## Brief E: what the writers are told, the authors and the time of day

**Intent.** On 100426 the map writer met "Cassandra" in a photo and raised her as missing from the roster; only the article's byline line knew Nova's first name or the guest reporter. On 100426 the writer also wrote "By 4:22 PM this morning" for an afternoon session, because every label says "the morning" (spec 5, 10). After this slice every writer and judge knows who wrote the article and when the investigation ran.

**Seat 1: the authors.**
- R4: Nova's line in the roster section, from the theme's file and the session's first name. On site only, the character-IDs parse, the enrichment's roster line and the photo entries know Nova; the roster decides a clash.
- R5: the guest reporter's line in `SESSION_FACTS` and the weave writer's first section, and the turn-in marking, only when set.

**Seat 2: the time of day and the labels.**
- R7: the time-of-day function and its places.
- R8: the neutral labels, the tag rename with `TRUTH_MATERIAL.timeline`, and the tests that assert the tag.

**Invariants.**
- A remote session's character-IDs parse and photo entries are unchanged; a session with no guest reporter prints nothing new for it.
- Every text naming Nova comes from the theme's file (`theme-rules.test.js`).
- The session clock's AM-for-PM decision and the printed times are unchanged.

**Tests.**
- Nova's line with the default and with a set first name; on site, a photo naming Nova's first name marked as the article's writer; a roster player with the same first name stays the player; remote, no marking.
- The guest reporter's line and the turn-in marking by full and by first name; with none, nothing.
- The time-of-day line for an evening session (morning, AM times), a daytime one (afternoon, PM times), and none with no sale and no exposure; it prints in each place R7 names.
- No "morning" in a code-built label; the tag renamed everywhere it is asserted.
- Re-pin all three writer renders with the reason (R10).

**Verification.** Render every writer and judge from 0926262 with a planted on-site mode and guest reporter, and from 092026 as it is, and read Nova's line, the guest line, the time-of-day line and the labels.

**Done.** Every writer and judge reads Nova's name, the guest reporter when there is one, and the investigation's time of day, and no label fixes the morning.

**Out of scope.** Showing Nova on the character-IDs stop's roster bar. The hero pick.

---

## Brief F: the judges' questions and the fact check's words

**Intent.** The judges hold the article to the approved rules, and the fact check's messages say what T8 now says (spec 11). The rulebook is must-fix through T14, as the director approved.

**Prompt.** R9: in both branches of `TRUTH_GROUPS`, reword `novaPositionTruth`, `evidenceTruth`, `moneyTruth`, `stagesTruth` and `fictionTruth` to the new rules, each question pointing at its rule items and asking what the judge can check against its prompts; the T8 messages in the fact check. Each question keeps its `reads`, plus B's material.

**Invariants.** The fact check's prefixes and their console groups are unchanged. No question asks about something its judge's prompts do not hold. No new criterion.

**Tests.** Update the word-for-word pins of both judges' questions and the fact check's T8 messages, each with its reason. A test holds that no question still carries a retired wording (R12).

**Verification.** Render both judges from 0926262 and read each question beside the rule it applies.

**Done.** The judges' questions and the fact check's messages say what the rules say.

**Out of scope.** The list of the director's words (B). New checks.

---

## Brief G: the standalone skill and the docs

**Intent.** The skill path and the docs say what the pipeline now does.

**Docs.**
- The skill: the image analyzer's "this morning", the evidence curator's clock line and its paper evidence (character sheets marked, R6), the arc and outline agents' "morning timeline", the article generator's byline with the guest reporter only when set, and `references/schemas.md`'s clock line. `journalist-skill-path.test.js` holds them.
- `docs/PIPELINE_DEEP_DIVE.md`: character sheets, the director's words, the ledger's shift.
- `docs/runbook/first-run-sheet.md`: the input review's shift line.

**Done.** The docs grep (gate 5) finds nothing in the skill or the docs.

**Out of scope.** `CLAUDE.md` (each code slice) and `CONTEXT.md` (A).
