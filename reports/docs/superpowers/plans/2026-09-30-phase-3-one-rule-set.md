# Phase 3: one rule set Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each slice below is one task. This project's briefs carry no code (the director's standing ruling): an implementer reads the code and writes their own, test first.

**Goal:** Every writer and judge reads one rule set, the truth rules and craft guidance of the rule-set spec, stated once each with a reason. Code takes over what code can guarantee, and the quota rules, templates and leaking examples leave the prompts.

**Architecture:**
- **The rule files.** The rule set is a small set of model-facing Markdown files in the journalist skill. One synchronous loader decides which files each call reads: the arc writer, the interweaving call, the outline and article writers, their reworkers and the three judges. The inline prompt text in code shrinks to what the rule files do not say.
- **Code-made truths.** Upstream, code takes on the session's facts:
  - one morning timeline, built from the evidence log and the ledger, on one session clock;
  - the ledger's bonus and transfer rows, and each account's total and sale count;
  - the epilogue, printed as written;
  - a quote bank that does not guess speakers and keeps the director's corrections;
  - a whiteboard parse labelled as context;
  - no code-made note that reads an account's name as its holder.
- **Judges.** A truth-rule breach is must-fix: the draft goes back automatically. Craft findings stay should-consider, and the existing must-fix checks keep their status.
- **Writers' questions.** A writer can raise questions to the director; they show at the stop and survive reworks until answered.

**Tech Stack:** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest.

**Spec:** `docs/superpowers/specs/2026-09-30-rule-set.md`. It is the authority. Its section and rule ids (T1 to T15, C1 to C16, sections 2, 3a, 6, 7, 8, and the appendix's R1 to R10) are cited below. The rulings sheet `docs/superpowers/specs/2026-09-25-rule-rulings.md` is history; its status note says what changed. The vocabulary is `CONTEXT.md`'s.

## Global Constraints

**Authority.** The spec decides. Where the code, a prompt or the rulings sheet disagrees with it, the spec wins. A conflict the spec does not settle goes to the integrator, who rules and records it.

**Line references.** The coverage pass at `main` `907c157` maps every rule the prompts state. It is kept locally, outside the repo, in `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.superpowers\analysis\2026-09-27-phase-3-prep\`. A worktree does not carry this folder, so read it by that path. The files:
- `coverage-journalist-craft-1.md` and `coverage-journalist-craft-2.md`: the craft files;
- `coverage-inline-writers.md`: the inline text of the outline and article writers;
- `coverage-arcs-and-reworkers.md`: the arc calls and the reworkers;
- `coverage-judges.md`: the judges and checks;
- `coverage-upstream.md`: the calls before the arc stop;
- `coverage-photos-detective.md`: the image calls and the detective theme;
- `evidence-path.md`: the evidence path, for phase 3b.

The plan review's findings, with exact code locations, are in `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.superpowers\analysis\2026-09-30-phase-3-plan-review\` (`findings-code.md`, `findings-gate.md`, `findings-coverage.md`, `findings-intent.md`, and `triage.md`, which says which were taken). Each row's tag in the coverage files says which spec rule it falls under. Re-read the code before editing: the numbers say where to look, not what to type, and where a number and the code disagree, the code wins.

**Model-facing text.** Load the `mattpocock-skills:writing-for-agents` skill before writing any text a model reads. Rules are stated positively, with any prohibition paired to its target. Each rule appears once and carries its reason. The world's terms are the leading words: the party, the investigation, the Evidence Board, the ledger, an account, NeurAI's board, the group statement, the epilogue, Nova. Write "the Evidence Board" and "NeurAI's board" in full, never "the board". Examples use placeholders and canonical character names, and teach shape, not content. Model-facing text has no em-dashes and never genders Nova.

**The director's words are never changed.** The notes, corrections, accusation, epilogue, photo descriptions and the record's documents reach every call as written. A phrase check or lint scans the pipeline's own instruction text (the rule files, inline prompt text, schema descriptions and labels) and skips the director's words and `<RECORD>`. The director's 092026 notes say "the murder investigation" and "the black market", and 092626's verdict is murder: none of that is a defect.

**No other changes.** No model, effort or pin changes, and no npm install. The SDK and packages stay as they are. If a step seems to need a package, stop and ask; the install command is `npm ci --os=win32 --cpu=x64`, and it runs only with the director's go-ahead.

**One source of truth.**
- A section that two prompts share is built by one function that both call.
- A reworker carries its writer's rules through the writer's own builders, as since phase 2.
- A judge reads the rules from the same loader the writers use.
- Every logged time any prompt prints goes through the one session clock (3.5).

**Shared test files belong to the integrator.**
- `lib/__tests__/writer-prompts-pinned.test.js`, `lib/__tests__/fixtures/render-writers.js`, `lib/__tests__/fixtures/removed-phrases.js` and the stub rule files under `lib/__tests__/fixtures/rules/` are the integrator's after 3.1 creates the last two.
- A slice that changes a pinned render reports the before and after text of the fixture renders and the new hashes in its report; it does not merge its pins against another slice's. After each merge the integrator regenerates the pins, reads the composed text diff, and pins it.
- A slice that adds a removed phrase reports it; the integrator adds it to the fixture.
- Any other test file two slices of one wave both edit is merged by the integrator, who runs the full suite after each merge.

**The detective theme is parked** (spec D13). Detective prompts do not change. Every shared path branches on the theme: the rule set, the mode block and the new judge criteria are journalist-only, and the detective keeps today's text, files and `PHASE_REQUIREMENTS` entries. A hunk that changes a detective render anyway is named in the slice's report and shows in the gate's detective diff.

**State channels.** A new channel needs:
- its Annotation in `lib/workflow/state.js`;
- a default in `getDefaultState`, with the exact set and the count (80 today) updated in `__tests__/unit/workflow/state.test.js`;
- membership in the `ROLLBACK_CLEARS` lists or in `ROLLBACK_CLEARS_EXEMPT`.

This plan adds none: the adjustments ride on `sessionConfig`, beside `sessionConfig.exposures`, and the questions ride inside the outputs.

**Console.**
- Logic that decides a payload, a label or a count goes into a dual-export pure module with node-env tests, and components stay thin.
- A new module must load before its consumers (`console/index.html`; pinned by `__tests__/unit/console-checkpoint-order.test.js`).
- Every new display is built to be skimmed (spec D8): what needs the director first, detail folded away.
- There is no DOM harness, so the gate's click-through covers the wiring.

**Tests.**
- No live model calls; Jest maps the SDK to `__tests__/mocks/anthropic-sdk.mock.js`.
- Run the full suite before every commit and guard the exit code.
- Fail-loud changes orphan tests across `__tests__/unit/workflow`, `lib/__tests__` and `__tests__/integration`, so always run the broad sweep.
- Tests that pin today's text break by design and are updated by the slice that changes the text, with the reason in the test. Known: `prompt-reporting-mode-neutral.test.js` (the retired tags, the one-line remote block, the exact on-site string, "first-person participatory", the arc categories line); `prompt-builder.test.js` (the retired file names, "investigation this morning", "Players drew these during investigation"); `arc-specialist-prompts.test.js` (the whiteboard label); the seven files that assert `<buried-transactions>`; `reworker-writer-parity.test.js` (the retired tags).
- No test reads `data/`: the repo is public. A test built from a real session's shape uses synthetic rows in that shape.

**Docs.** When a slice changes behaviour that `reports/CLAUDE.md` or `docs/PIPELINE_DEEP_DIVE.md` documents, the same task updates that text.

**Repo and data.**
- The repo is public. Nothing under `data/` is committed, and neither are `outputs/report-0919269.html`, `outputs/sessionphotos/0919269/` or `.claude/launch.json`.
- Never read `.env`.
- The production database `data/checkpoints.sqlite` is never opened, read or copied by an agent. A live pass or a render runs on a copy the integrator makes, through `CHECKPOINT_DB_PATH`, on a throwaway port, with a throwaway password and `LLM_CALL_LOG_DIR` in scratch space.

**Commits.**
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never bypass the pre-commit hook.
- Never `git stash` across worktrees.
- The push to `origin` is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

## Review Focus

The inputs a person will meet that the spec implies but no ordinary test exercises, most likely first. Each line names the slice whose tests pin it.

1. **A thread started before phase 3.** 092626 was still being worked on 2026-10-01. A thread whose parse has no `exposures`, no `adjustments` and no verdict kind renders every prompt without error: the timeline shows its sales, the account totals stay the session report's, and the input review says the rows were not parsed. Pinned in 3.5, from a synthetic old-shape state.
2. **The clock's edges.** A first sale at 4:59 PM keeps the times; one at 5:00 PM swaps PM for AM. A game master's setup row at 4:50 PM before a first sale at 5:10 PM does not decide the clock. 12:05 PM sorts after 11:55 AM; an evening session crossing midnight puts 12:15 AM after 11:50 PM. An exposure and a sale in the same minute keep no invented order (092626 has seven sales and an exposure at 2:25 PM). Pinned in 3.5.
3. **A buried memory through the new timeline.** No buried memory's id, owner or text reaches any prompt through the timeline, including when the model-filled exposure list names a memory that was buried. Pinned in 3.5 by extending `lib/__tests__/buried-memory-sentinel.test.js`, planting the buried memory in `sessionConfig.exposures` too.
4. **Unusual verdicts through the real path.** A split final vote (with a tie, and with no adopted option), an institution verdict and a no-culprit verdict reach `SESSION_FACTS` and the arc writer's accusation block through `buildSessionFacts` and `synthesizePlayerFocus`, not only through the renderers. Pinned in 3.5.
5. **A session whose notes carry no epilogue.** The article and outline prompts carry no post-investigation section, and the rule text says the writer adds no follow-up. Pinned in 3.2.

---

## What this phase changes for the director

The writers and judges stop reading eleven files and six blocks of inline code that contradict each other in 62 places. They read one rule set:
- the world as the game runs it;
- fifteen truth rules that keep the article true to the record;
- sixteen craft items, taken only from the director's own words and edits.

**What stays, said better:** the six sections, each an essential part of one narrative; the arcs, examined through the money, behaviour and victimization; the convergence, as the culmination near the end where the thesis lands.

**Gone from the prompts:**
- the fixed section contract and every-arc-in-every-section, the convergence spent mid-STORY, the lede and closing formulas, the visual count;
- the murder framing, "the Black Market", "the Detective" and Blake's fixed beat;
- the fixed "preserve, do not regenerate" lines in reworks;
- example prose that has leaked into articles as fake cards and repeated phrases.

**What code now does:**
- shows every logged time on the morning clock;
- keeps the first-burial bonus and transfers, with each account's total matching the session report;
- prints the epilogue as the director wrote it;
- leaves a quote's speaker unknown rather than guessing, and keeps the director's corrections;
- labels the whiteboard parse as context;
- stops telling the writers that an account named after a character is that character's;
- never genders Nova.

**For the judges:** they read the same rules. A truth-rule breach sends the draft back automatically, with the sentence and the record it contradicts. New code checks flag em-dashes, production words, a gendered Nova or Blake, an overlong article and a wrong head count, as advisories.

**For the writers:** when the record says nothing about a player, a pronoun is missing or a ledger line looks wrong, the writer asks, the question shows at the stop, and a rework keeps it until it is answered.

## Slices, in build order

| # | Slice | Layers | Depends on | Wave |
|---|---|---|---|---|
| 3.1 | The rule files | prompt, plumbing | none | 1 |
| 3.5 | The session report and the board | plumbing, prompt, screen | none | 1 |
| 3.6 | The director's notes, unguessed | plumbing, prompt | none | 1 |
| 3.2 | The outline and article writers | prompt, plumbing, screen | 3.1, 3.5, 3.6 | 2 |
| 3.3 | The arc calls and the rework rules | prompt, plumbing | 3.1, 3.5 | 2 |
| 3.4 | The judges and the checks | prompt, plumbing, screen | 3.1, 3.5 | 2 |
| 3.7 | The writers' questions | plumbing, screen, prompt | 3.2, 3.3, 3.4 | 3 |

- **Before wave 1,** the integrator prepares the gate's tools (Gates, below).
- **Wave 1** runs 3.1, 3.5 and 3.6 in parallel from a phase branch cut from `main` at `a65b944` or later.
- **The rule-text read** (Gates) comes after wave 1 lands and before wave 2 starts.
- **Wave 2** runs 3.2, 3.3 and 3.4 in parallel, cut after the read.
- **Wave 3** runs 3.7 alone.
- Integrate in the order 3.1, 3.5, 3.6, then 3.2, 3.3, 3.4, then 3.7. 3.2 goes before 3.4 because 3.4's Nova and Marcus checks read the canon lines 3.2 rewrites. The whole phase merges to `main` together after the phase gate.

**Who owns which file.** A slice edits only its own files, so parallel slices do not collide. A slice that needs a change in another slice's file names it in its report, and the integrator places it. Exceptions are listed under each slice and are function-scoped. Three wave-1 exceptions share a file with another wave-1 slice, in different functions, and the integrator merges them in the integrate order: 3.1 and 3.5 in `prompt-builder.js` (the mode block; the record-view calls) and in `arc-specialist-nodes.js` (the mode-block calls; the interweaving prompt's signature), and 3.5 and 3.6 in `director-notes-renderer.js` (`linkedTransactionLine`; the rest).

| Slice | Owns |
|---|---|
| 3.1 | New `.claude/skills/journalist-report/references/rules/*.md`; new `lib/rule-set.js`; the stub rule files and the removed-phrase fixture it creates; the `REPORTING_MODE_BLOCKS` text and `buildReportingModeBlock` |
| 3.5 | `lib/workflow/nodes/input-nodes.js`; `lib/accusation-verdict.js`; `lib/prompt-renderers/record-view.js`; new `lib/prompt-renderers/session-clock.js`; `lib/prompt-renderers/director-words-renderer.js`; the whiteboard parts of `lib/image-prompt-builder.js` and `.claude/skills/journalist-report/references/prompts/whiteboard-analysis.md`; `synthesizePlayerFocus` in `lib/workflow/nodes/node-helpers.js` (whole); `buildSessionFacts` in `lib/workflow/nodes/ai-nodes.js`; the input-review views in `console/checkpoint-view-logic.js` (`verdictView`, `accusationView`, `whiteboardView`, `exposuresView`) and `console/input-review-logic.js`; the input review in `console/components/checkpoints/InputReview.js` and in `server.js`'s `getCheckpointData` |
| 3.6 | `lib/director-enricher.js`; `lib/prompt-renderers/director-notes-renderer.js` (except `linkedTransactionLine`); `lib/prompt-renderers/derived-labels.js`; `lib/workflow/nodes/character-data-nodes.js`; `lib/workflow/nodes/contradiction-nodes.js` |
| 3.2 | `lib/prompt-builder.js` (except the mode-block text and builder); `lib/schemas/content-bundle.schema.json`; `lib/schemas/outline.schema.json`; `lib/theme-config.js`; `lib/theme-loader.js` (`PHASE_REQUIREMENTS` and the old-file lists); `lib/template-assembler.js` (the tracker condition only); `console/outline-edit-logic.js` and the outline editors in `console/components/checkpoints/Outline.js`; the sidebar editor in `console/components/checkpoints/Article.js`; `lib/workflow/reference-loader.js`; the eight retired craft files; `.claude/skills/journalist-report/SKILL.md` and `.claude/agents/*` references; `scripts/render-prompts.js` after the integrator's extension |
| 3.3 | `lib/sdk-client/subagents.js`; `lib/workflow/nodes/arc-specialist-nodes.js`; `lib/workflow/nodes/ai-nodes.js` (except `buildSessionFacts`); `lib/workflow/nodes/node-helpers.js` (except `synthesizePlayerFocus`); the `validateFinancialData` call in `lib/workflow/nodes/template-nodes.js` |
| 3.4 | `lib/workflow/nodes/evaluator-nodes.js`; `lib/content-bundle-fact-check.js`; `console/checkpoint-view-logic.js` (the fact check's message groups and the evaluation view) |
| 3.7 | One field each in the writers' output schemas (both arc schemas in `subagents.js`, `outline.schema.json`, `content-bundle.schema.json`); the arc merge and the arc cache in `arc-specialist-nodes.js`; the arc writer's roster lines and fix line; the arc judge's `rosterCoverage` in `evaluator-nodes.js`; `validateArcStructure`'s roster coverage; the strip of the field from `outlineWriterInputs`, APPROVED OUTLINE and the judges' JSON; `JOURNALIST_ROOT_KEYS` in `outline-edit-logic.js`; `lib/hand-edit-diff.js`; `server.js` payload keys; the arc, outline and article stop components; a shared panel in `console/utils.js` and its model in `checkpoint-view-logic.js`; `scripts/e2e-walkthrough.js` |

**The rulings sheet's mechanical fixes** (M1 to M30) are made by whichever slice owns the file each fix's footprint is in. Exceptions:
- Phase 2 made M14 to M19, and M23's standing-notes half; 3.3 makes M23's rule-set half.
- M6, M13 and M22, and the detective halves of M20 and M21, are detective work, and stay parked.
- M4 and M28 are photo enrichment, and belong to phase 9.
- M9 is superseded: the section table it relies on goes (spec section 7).
- M26 spans 3.2 (`theme-config.js` states the victim's role once) and 3.4 (the judge reads that line).

Each slice's report lists the M items it made.

## Gates

**Before wave 1, the integrator prepares the gate's tools:**
- extends `scripts/render-prompts.js` to render the interweaving call and the three judges as well as the six writer renders (the article judge with the fact check run on the stored bundle), awaiting every builder, with a `--theme` override, and failing when a written file lacks its required section marker;
- renders baselines from `main` on copies of 092026 and 092626, for both themes;
- writes the slices' shared fixture plan: which slice creates which stub (3.1: the rule-file stubs and the removed-phrase fixture).

**The rule-text read** (after wave 1 lands, before wave 2): the director reads the rule files 3.1 wrote, model-facing text in the fiction's own words, with the per-call map beside them. They are short by design. Two items are put to the director by name: the C10 example question taken from the director's 071826 edit, and the wording of C2 and C16. The director's changes go in before anything is wired to them. Cost: one sitting. A mistake in the rules would otherwise reach every writer and judge.

**The phase gate** (after wave 3, once) proves the pipeline still works. It does not judge the article: the test of the rules is the director's next new session.
1. **The suite.** The full suite, broad sweep, exit 0.
2. **The prompt checks,** on renders of 092026 and 092626 from copies of the checkpoint database, with no model calls:
   - **Every call builds:** the six writer renders, the interweaving call and the three judges, for the journalist theme, and the detective writers.
   - **Sections.** Each journalist call carries the rule files the spec section 8 map gives it, once, and no retired craft file.
   - **Unchanged parts stay unchanged.** Against the `main` baselines, every journalist section no slice names is byte-identical: the documents of `<RECORD>`, `<DIRECTOR_NOTES>`, `<DIRECTOR_CORRECTIONS>`, `<DIRECTOR_ACCUSATION>`, `<available-photos>`, `<arc-evidence>`, `<HAND_EDITS>` and the standing notes. `<DIRECTOR_GUIDANCE>` is last and there is one `<RECORD>`. Each slice's report lists the sections it changes.
   - **The detective.** The detective renders against their baselines; every hunk is one a slice report names.
   - **Removed phrases.** The fixture's list is absent from the instruction text of every render.
   - **The clock.** 092626's logged times show as logged; 092026's show AM in place of PM, in the timeline and in the transaction links.
   - **Sizes** are recorded beside the baselines.
3. **One run end to end,** on a copy of the 092026 thread:
   - rolled back to input review and sent back with one correction, the director's own 092026 quote correction (the line was Blake's, not Vic's), so the new parse, enricher, curation and character extraction all run;
   - the arc guidance and the notes the director gave, saved from the copy before the rollback clears them, are replayed;
   - one send-back at each of the arc, outline and article stops, so every rework path runs;
   - one whiteboard parse on a past session's photo and roster, through the rewritten image prompt.

   It passes when every call completes on its pinned model with valid structured output, with no error or timeout; every stop loads; the call log's prompts carry their rule files; no buried memory's id appears in any logged prompt; and the run reaches the published page. Durations are recorded beside the phase 2 gate's (2,668 s for the first-pass Opus set), and a call that runs much longer is a candidate for the per-call effort rule of 2026-09-26.
4. **The click-through,** on fixture threads cut from the gate's own checkpoints, with no model calls. Cases the run did not produce are planted by editing a fixture copy's latest checkpoint: questions in each output, a truth finding in the last evaluation, one message for each new advisory prefix, a split vote and an institution verdict. A copy of 092626 rolled back to input review shows the daytime clock line. It covers:
   - the input review's clock line, adjustments and verdict display;
   - the writers' questions panel at the arc, outline and article stops;
   - the evaluation bar with truth findings among the must-fix;
   - the fact check's new advisory groups;
   - an outline edit with a section left out, and a sidebar card edit, both accepted.

   The fixture cutter is committed under `scripts/`.
5. **The final whole-phase review,** on Opus 5.5.

---

## Brief 3.1: the rule files

**Intent.** Today a writer reads up to eight craft files (110,707 characters for the journalist theme) plus inline rules in six places. The two disagree in 62 places, and the examples teach facts no session has. The arc calls read none of the files. This slice writes the rule set as model-facing files from the spec, and gives the code one loader that hands each call the files it needs. It wires nothing into the calls except the mode block; wave 2 does the rest.

**Prompt.**
- **The files,** under `.claude/skills/journalist-report/references/rules/`. Each carries its rule ids in its headings (T1, C4) so the lint can count them.
  - `world.md`: opens with the purpose sentence of spec section 1, without the length (C4 holds it). Then spec section 2, and what a writer needs from 3a: each memory's fate and what the article can do with it; the timeline, and that the writer places the director's notes on it by order and landmarks, as Nova's reading; that a buried memory reaches the writer only as its ledger line;
  - `truth-rules.md`: T1 to T15, each with its reason. T8's mode-independent part sits here: Nova never votes, accuses or exposes, is never one of the room, and what Nova's "we" may mean;
  - `craft-thesis.md`: C1, C3;
  - `craft-sections.md`: C2;
  - `craft-arcs.md`: C16;
  - `craft-room.md`: C6 to C8;
  - `craft-tracing.md`: C10, C11;
  - `craft-telling.md`: C4, C5, C14;
  - `craft-cards.md`: C9;
  - `craft-voice.md`: C12;
  - `craft-judgement.md`: C13;
  - `craft-questions.md`: C15;
  - `mode-on-site.md` and `mode-remote.md`: T8's mode part, written as the reporting-mode block for each mode. Each states Nova's position as the uninterested third party Fremont PD required and what Nova could witness in that mode. In both, exposed memories are turned in to Nova directly, anonymous unless the evidence log names someone. Remote, the room's events, lines, deliberation and verdict reached Nova from people in the room: Nova shows this by attribution and states the absence at most once.
- **How to write them.**
  - Each rule as the spec states it, in the fiction's words, with its reason in one or two sentences.
  - Leave out the spec's source citations and "checked by" lines; they are for implementers.
  - Examples teach shape with placeholders (`<account>`, `<character>`) and canonical names. They carry no real-looking account name, sum, earlier session or invented quote, and no fixed pronoun for a canonical character. C10's example question comes from the director's own edit; it stays as written unless the director changes it at the rule-text read.
  - Model no phrase that could become a tic.
  - The files make no assumptions about the article's format, so a detective case file could read them later; Nova stays Nova.
  - Nova is never gendered.
  - The whole set should come to less than half the size of the eight files it replaces. Record the size.

**Plumbing.**
- **The loader,** a new `lib/rule-set.js`, synchronous (it reads with `readFileSync` and caches), so every builder that calls it stays synchronous.
  - The map, from spec section 8:
    - `arc`: thesis, arcs, room, tracing, judgement, questions;
    - `interweaving`: thesis, arcs, room, tracing, judgement;
    - `outline`: every craft file except voice;
    - `article`: every craft file;
    - `judge-arc`, `judge-outline`, `judge-article`: their writer's list.
  - A reworker passes its writer's call.
  - It throws naming any missing or empty file, as `requirePhasePrompts` (`lib/prompt-builder.js:1687`) does.
  - It reads the journalist skill's folder by default; tests pass a root, so the pinned renders read stub files and do not move on every rule-text edit.
- **The mode block.** `buildReportingModeBlock(sessionConfig, theme)` reads the mode file for the journalist theme and keeps today's strings for the detective. Its callers pass the theme: `PromptBuilder` (`this.themeName`) and the arc composers' `withReportingModeBlock` (an exception to 3.3's ownership of `arc-specialist-nodes.js`, one argument at each call). The block's position and callers are otherwise unchanged.
- **The removed-phrase fixture,** `lib/__tests__/fixtures/removed-phrases.js`, and the stub rule files under `lib/__tests__/fixtures/rules/`, which the integrator owns from then on. The list starts with spec section 7's phrases, the murder framing exactly as the spec names it ("the murder victim", "hint at the murder", "the murder revelation", "who killed Marcus"), "exposures reached you as tips", and the gendered-Nova pattern (Nova and a gendered pronoun in one clause).
- **The render fixture** (`lib/__tests__/fixtures/render-writers.js`) passes the stub root.

**Interfaces (produced for wave 2).** Fixed by this plan, so 3.2, 3.3 and 3.4 can call them in parallel:
- `loadRuleSet(call, { root })` from `lib/rule-set.js`, where `call` is one of `'arc'`, `'interweaving'`, `'outline'`, `'article'`, `'judge-arc'`, `'judge-outline'` or `'judge-article'`. It returns `{ core, craft }`: `core` is the world then the truth rules, and `craft` is the call's craft files in the map's order. Each file comes back wrapped in one tag named after it (`<world>`, `<truth-rules>`, `<craft-arcs>`), and callers insert the strings unchanged. Journalist only: a detective caller keeps today's text.
- `loadModeBlock(mode, { root })`, where `mode` is `'on-site'` or `'remote'`, returns the block's text.
- `lib/__tests__/fixtures/removed-phrases.js` exports the list as an array of strings and patterns, and a helper that strips the director's words and `<RECORD>` from a render before scanning.

**Invariants.**
- No call's prompt changes in this slice except through the mode-block text, journalist only.
- The mode block still appears once in each of the eight system prompts that carry it today (`lib/__tests__/prompt-reporting-mode-neutral.test.js`).
- Detective prompts are unchanged.

**Tests.**
- The loader: the map per call against spec section 8; every listed file exists and is non-empty; the throw on a missing file; the mode block per mode; the stub root.
- A lint over the rule files:
  - each of T1 to T15 and C1 to C16 appears exactly once across the files, T8 counted once across `truth-rules.md` and the two mode files;
  - no em-dash;
  - no gendered pronoun for Nova;
  - no phrase on the removed list;
  - none of the real account names that the coverage files list from the old examples.
- `buildReportingModeBlock`: the journalist reads the files; the detective's strings are unchanged.
- `prompt-reporting-mode-neutral.test.js` updated for the new mode text, with the reason recorded; the pinned renders reported to the integrator.

**Verification.** Renders of 092026 and 092626 show the new mode blocks in place of the old ones in the journalist prompts, and no other change; the detective renders are unchanged. The integrator reads every rule file against the spec, rule by rule.

**Done.** The rule files exist, the loader hands each call its list, and the director has read the rule text (Gates).

**Out of scope.** Wiring the files into the calls (3.2, 3.3, 3.4), removing inline text (the same), deleting the old craft files (3.2), and the image-call files (whiteboard: 3.5; photos: phase 9).

---

## Brief 3.5: the session report and the board

**Intent.** The writers should get the session's facts from code, complete and on one clock. Today:
- the session-report parse drops every adjustment row, so neither the first-burial bonus nor any transfer reaches a writer, and an account funded only by transfer disappears;
- a model counts each account's sales;
- ledger times reach the writers on the real clock;
- the exposure times never meet the sales;
- the verdict has no shape for a split vote or an institution, and the copies the prompts read drop anything beyond the accused and the charge;
- the whiteboard parse turns an absent suspect into a player at the table, and reaches the writers as "Players drew these".

Sources: `coverage-upstream.md` (#3, #6, #7, #8, #20, #23, #28, #77, #81, #82, and its STALE rows except the preprocessor's, which belong to phase 3b), `coverage-photos-detective.md` (W4 to W18), `coverage-inline-writers.md` (R131), and the plan review's K1, K2, K3, K13, G4, G11, G12, I15, I18.

**What the session report holds.** The adjustment rows are the game master's double-entry bookkeeping. 092026's read, in this shape:
- a setup row at 6:02 PM, "Holding Account (GM_Station_1) | First Burial Bonus | +$50,000", an hour and a half before the first exposure;
- the payment, at the first sale, "First burial bonus (GM_Station_1) | <account> | +50,000";
- its reversal a minute later, "To<account>(GMStation1) | FirstBurialBonus | -50,000".

The session report's Final Standings count the bonus in that account's total ($925,000 against $875,000 of sales on 092026) and list "First Burial Bonus: 0" as an account. 092626 has the same shape. Neither session has a transfer between players. Tests use synthetic rows in this shape, never `data/`.

**Plumbing.**
- **The ledger.**
  - The session-report parse (`input-nodes.js`, the step that reads the Scoring Timeline; the skip at :590) keeps the adjustment rows, and code classifies them into `sessionConfig.adjustments`, stamped beside `sessionConfig.exposures`: the bonus as one event paid to the account that received it, a transfer as a row between two players' accounts, and the setup and reversal rows dropped as bookkeeping. Their Detail labels ("GM_Station_1") never print.
  - Code computes each account's total (sales, plus the bonus and transfers it received, less transfers it sent) and sale count, and checks the totals against the parsed Final Standings. A mismatch shows at the input review. The model's counts go.
  - A parse with no adjustment rows keeps the Final Standings totals and says so at the input review.
- **The session clock,** a new `lib/prompt-renderers/session-clock.js`: one decision per session, from the first exposure or sale (never a setup row). At 5:00 PM or later every logged time shows AM in place of PM, same hour and minute; otherwise times show as logged. It sorts noon and midnight correctly. Every logged time a prompt prints goes through it: the timeline and the transaction links (`linkedTransactionLine` in `director-notes-renderer.js`, an exception to 3.6's ownership, with the change that brings the clock to it).
- **The morning timeline.** One pure function builds it from:
  - the sales (the bundle's buried transactions: account, amount and time);
  - the evidence log (`sessionConfig.exposures`: time, the memory's id and the name on the turn-in), only for memories the bundle holds as exposed;
  - the adjustments.

  Events go in time order. Events in the same minute keep each table's row order, sales before exposures, flagged as the same minute.
- **The verdict.**
  - Parse step 1's accusation keeps every option that drew votes in a split final vote, with its count, and marks the one the statement adopted (or none).
  - A verdict that blames an institution or an unnamed person is a culprit verdict naming no character, with the room's words as the charge. `normalizeAccusation` (`lib/accusation-verdict.js`) allows it.
  - `buildSessionFacts` (`ai-nodes.js`) and `synthesizePlayerFocus` (`node-helpers.js`) carry the votes through, so `SESSION_FACTS` and the arc writer's block can print them.
  - The session-config parse's label "MURDER ACCUSATION" (`input-nodes.js:505`) becomes the group statement.
- **`synthesizePlayerFocus`** is this slice's whole: the votes, the whiteboard synthesis (it reads regions instead of picking the first group whose model-written label contains "suspect"), and the default investigation focus, which stops being "Who killed Marcus Blackwood?" (:365).
- **The roster** is stamped in code from the roster stop, as `rosterPronouns` and `reportingMode` already are (`input-nodes.js:541–557`), and is never rewritten by the parse.
- **The parse's correction block** (`buildParseCorrectionsBlock`, `director-words-renderer.js:174–179`) stops promising that a correction changes the fields code sets: the roster, roster pronouns, reporting mode, reporter name (D15). `reports/CLAUDE.md`'s line that a mis-parsed roster "is fixed with a note" is corrected.
- **The exposures schema's wording** (`input-nodes.js:156`, :580) describes an exposure as turning a memory in to Nova, with the name on the turn-in as an honest attribution (T6), never a sale.
- **The whiteboard parse.**
  - It matches handwritten names against the canonical characters and the NPCs, not only the roster, and keeps the literal text when unsure (`image-prompt-builder.js:52–57`; `whiteboard-analysis.md`:15–36). `whiteboard-analysis.md`'s "a murder mystery investigation game" (:3) goes.
  - It keeps each region of the board with the players' own label, and adds no labels of its own (`input-nodes.js:218–250`).
  - Writers see the whiteboard labelled as a machine's reading of the photo, given as context for how the room reasoned, never as a source (`renderWhiteboardConnections`, `director-words-renderer.js:213–222`).

**Prompt.**
- **Where the timeline goes.** It replaces the buried-transactions list inside the record view (`renderBuriedTransactions`, `record-view.js:198`; the line formatter `buriedTransactionFields`, :164). Every call that carries the whole record view gets it with no new placement:
  - sales show account, amount and time;
  - exposures show the memory's document id and the name on the turn-in, "anonymous" or "named: <name>";
  - adjustments show what they are: the bonus paid to an account, or a transfer between two accounts.
- **The callers pass the session.** `renderRecordView` takes the session config at the calls that print the timeline today: `prompt-builder.js` :649 and :1085 (from `this.sessionConfig`), the interweaving prompt (`arc-specialist-nodes.js` :480, :513, :642) and the outline and article judges (`evaluator-nodes.js` :974, :1020). These one-line edits are exceptions to 3.2's, 3.3's and 3.4's ownership.
- **`renderSessionFactsVerdict` and `renderArcAccusation`** print the split vote and the institution verdict.

**Screen.** The input review shows:
- which clock rule applied ("evening session: logged times shown as morning");
- the split vote, when there is one;
- the adjustments beside the sales, and a totals mismatch or "adjustments not parsed" when either applies.

The display logic goes into the input-review views in `console/checkpoint-view-logic.js` and `console/input-review-logic.js`.

**Interfaces (produced for wave 2).**
- `sessionConfig.adjustments`: `[{ time, kind: 'bonus' | 'transfer', amount, toAccount, fromAccount }]`, `fromAccount` only on a transfer.
- `state.shellAccounts` keeps its shape `{ name, total, tokenCount, rank }`: `total` as above, `tokenCount` the sales; an account funded only by transfer is kept. Its readers (`prompt-builder.js:516–540`, `contradiction-nodes.js`, `template-assembler.js`, `node-helpers.js`) need no change of key.
- `session-clock.js` exports the session's clock decision and the function that prints one logged time by it.
- A pure `buildMorningTimeline` (in `record-view.js`).
- `renderRecordView(bundle, { buried = true, sessionConfig })` prints the timeline in place of the buried transactions. `{ buried: false }` keeps its name and meaning, the view without its timeline; the arc writer and the arc judge use it until 3.3 and 3.4 move them to the timeline.
- `sessionConfig.accusation.votes`: `[{ option, count, adopted }]`, present only for a split final vote.

**Invariants.**
- No buried memory's id, owner or text enters the timeline. The sales stay account, amount and time.
- The director's notes are never changed: code puts no clock on them.
- The record view stays the only place the timeline is rendered.

**Tests.**
- The clock: 4:59 PM, 5:00 PM, a setup row before 5 PM, noon, an evening session crossing midnight, a daytime session.
- Same-minute events across the two tables.
- The adjustment classification from synthetic rows in 092026's shape, and a transfer between players.
- Totals reconciled with the Final Standings, a mismatch, and no adjustment rows.
- An old-shape thread with no exposures, no adjustments and no verdict kind (Review Focus 1).
- The split vote (with a tie, with none adopted), the institution verdict and the no-culprit verdict through `buildSessionFacts` and `synthesizePlayerFocus` into both renderers (Review Focus 4).
- The whiteboard: a name that is not on the roster stays literal; regions survive; the label.
- `buried-memory-sentinel.test.js` extended to the timeline and to a buried memory named in `sessionConfig.exposures` (Review Focus 3).
- The transaction links on the session clock.
- `record-view` and the `<buried-transactions>` tests updated.

**Verification.** Renders of 092026 (evening) and 092626 (daytime) from their stored threads show the timeline in the record view on the right clock: 092026's sales, and 092626's sales and eight exposures. The stored threads predate the adjustments, so their timelines carry no bonus, and the input review says so.

**Done.** The timeline renders on both stored threads with no error, on the right clock, and every listed test passes.

**Out of scope.**
- The arc writer's and the arc judge's own buried lists (3.3, 3.4).
- The epilogue and the quote bank (3.6).
- The evidence path (phase 3b).
- Photos (phase 9).

---

## Brief 3.6: the director's notes, unguessed

**Intent.** The director's words should reach the writers as written, and the machine's readings of them should be labelled as readings. Today:
- the notes step forces a speaker onto every quote, and its quote bank tells writers to "prefer these";
- it prints its own headline, subject list and "why this matters" ahead of the director's epilogue sentence, with no label;
- character extraction must give every character a role, and may list relationships that are only "strongly implied";
- the Valet tension claims "multiple characters" from a single sentence;
- a code-made note tells the writers that an account named after a character is that character's: "<character> used their own name for a burial account… a deliberate choice to be identifiable". 26 sessions on disk have such an account (071826's Remi, Alex and Vic among them), so this reaches the writers in most sessions, against T4.

Sources: `coverage-upstream.md` (#37, #39, #40, #42, #67, #69 to #75), `coverage-inline-writers.md` (R55, R56), and the plan review's V4, K11, I8, G5.

**Plumbing.**
- **The notes step** (`lib/director-enricher.js`; schema :95–116, prompt :130–137).
  - A quote's speaker may be unknown. Its speaker and wording come from the notes as corrected at the input review: on 092026 the notes say "Vic to Ashe", the director corrected it to Blake, and today's quote bank gets that right. Its context is the director's own words around it, and names the correction where one applied.
  - Each post-investigation item's text is the director's sentence, a verbatim substring of the notes.
  - The enricher's own headline and "why this matters" go. Its subject list stays for indexing only, and never prints as a claim.
  - The "same sentence" against "adjacent" wording is made one (M5).
- **Character extraction** (`character-data-nodes.js`):
  - no field is required that the record may not give, a role included;
  - a relationship is listed only where a document states it;
  - a group's members only where a document names them;
  - Blake is described by the canon line (D7), not as "the Black Market operator" (:82).
- **The tensions** (`contradiction-nodes.js`):
  - The named-account and transparency tensions (:36–67) go, or say only what the ledger shows ("an account named <character> took <amount>"), with no claim about who holds it.
  - The Valet tension (:72–82) prints the director's own sentences that it already carries, not a generic claim.

**Prompt.**
- **The quote bank** (`director-notes-renderer.js:63–70`) drops "prefer these". It prints each quote with its speaker, or "speaker not recorded", and the director's surrounding words. Its separator is not an em-dash, so a writer copying the format copies none. Its derived label stays.
- **The epilogue block** (:86–93) is renamed `<EPILOGUE>` (CONTEXT.md avoids "post-investigation news") and prints the director's sentences as written. The header that tells the writer how to use it lives in `lib/prompt-builder.js`'s `_buildInvestigationObservations` (3.2), which refers to the new tag.
- **The transaction links** keep the enricher's reading labelled as a reading: a link joins a director's observation to a sale, and the label says so.
- **`derived-labels.js`** labels the remaining machine-made material: the character context, the narrative tensions and the enricher's indexes. Each label says who made it and that the record decides.

**Invariants.**
- The director's notes and corrections are never rewritten.
- The buried-memory rule holds: the enricher still links observations to sales only by opaque row keys.

**Tests.** `director-enricher.test.js`, `director-notes-renderer.test.js` and the character-data and contradiction tests cover:
- an unknown speaker;
- a corrected speaker and wording kept;
- a verbatim context and a verbatim epilogue item;
- no "prefer these";
- no required role;
- an implied relationship not listed;
- an account named after a roster character producing no claim about its holder;
- the Valet tension printing the director's sentence;
- the stored shape: an old item with a headline renders as the director's sentence alone.

**Verification.** Renders of 092026 and 092626 from their stored threads show the epilogue as the director's sentences under `<EPILOGUE>`, with no enricher headline; 092626's "unavailable for comment" and its intercepted communication come through verbatim. The stored quote bank was made by the old enricher, so the new enricher runs only in the gate's re-parse.

**Done.** The renders above, and every listed test passes.

**Out of scope.** The notes block's header and epilogue phrasing in `prompt-builder.js` (3.2), the whiteboard (3.5), and the session clock on the transaction links (3.5).

---

## Brief 3.2: the outline and article writers

**Intent.** The outline and article writers, and their reworkers, should read the rule set and nothing that contradicts it. Today their inline text in `lib/prompt-builder.js`, the schema descriptions and the canon lines:
- restate, and often reverse, the rules;
- tell the writer Blake keeps the buried memories, that memories go to "the Detective", and that the Valet cannot act in the room;
- call Marcus "the murder victim";
- ask for fields that never print.

The outline form also requires all six sections, every arc connected into three of them, and a convergence point, so a writer cannot leave out a section whose job is done elsewhere (TH4). The eight craft files carry the rest, including the convergence placed mid-STORY with a "resolution cascade" after it, and every arc in every later section: the guidance that front-loads THE STORY and turns the later sections into checklists (C2, C16). Sources: `coverage-inline-writers.md` (all CONTRADICTS, STALE and RULED-differs rows), `coverage-journalist-craft-1.md` and `coverage-journalist-craft-2.md` (every row: the files are retired), and the plan review's I3, I11, K4, K5, K10, V2, V8.

**Prompt.**
- **Wiring.** `buildOutlineSystemPrompt` (:600) and `buildArticleSystemPrompt` (:1033), with their user sections, read the rule set through `loadRuleSet('outline')` and `loadRuleSet('article')`, placed by the placement ruling. The outline writer gets the world, the truth rules and every craft file except voice; the article writer every craft file; both the mode block as today. The reworkers get them through the same builders. The detective branch keeps today's text.
- **No em-dash** remains in `prompt-builder.js`'s own model-facing text (R171).
- **Removal.** Inline text that the rule set now states goes, and so does inline text that contradicts it. That includes:
  - "HOW THE BLACK MARKET WORKS" and "Blake now possesses all buried memories" (:525–531);
  - "memories were exposed to the Detective" (:1248);
  - strong arcs stated as conclusions (:793–795; C10, D16f);
  - "participatory and implicated" and the Nova-stake lines in `voiceQuestion` and `revisionVoice`, and the self-check (:368–371, :1457–1468; C12);
  - the temporal context key (:1214–1221; M11);
  - "the reader must not see where an arc ends" (:1272–1273);
  - every fixed section question, the lede formula, the closing formula, the visual count, the convergence placed mid-STORY and every-arc-in-every-section (spec section 7). The convergence itself, the lenses and the intercutting stay, as C2 and C16 state them.
- **The agency rule** (:922–923, :1348–1353) is rewritten, not deleted: only the roster's players were at the investigation; other characters appear only through memories; Blake acts in the room; Nova is not one of the players.
- **The notes block.**
  - `_buildInvestigationObservations` stops dating every line to "this morning".
  - Its epilogue phrasing ("It has just been announced…", :466) gives way to T7: all follow-up is Nova's own reporting, and a channel the director names is Nova's source. It refers to 3.6's `<EPILOGUE>`.
  - With no epilogue, no post-investigation section appears.
- **`FINANCIAL_SUMMARY`** counts sales, not "tokens", from 3.5's code-computed figures. "Use exactly N" counts the roster, which includes a guest reporter who plays a character (T10).
- **The article rework's framing** (:338, "revising your investigative article to fix voice issues you identified") gives way to TH7: the first line names the task the revision context gives it (with 3.3, which owns the rework rules).
- **The quotable excerpts' label** stops pointing at pull quotes, which do not print.
- **Schema descriptions** decide shape only: names, types, required fields. The rules decide content. These go: the descriptions that carry content rules (`content-bundle.schema.json`:5, :130, :181, :280; the outline's lede "central mystery", `keyTension`, `closing.systemicAngle`), the implementation notes (M24), the journalist "if anything above contradicts the schema, the schema wins" line (:1492; :1193 is the detective's and stays), and the outline's JSON shape restated in the prompt (M27).
- **Canon** (`lib/theme-config.js:31–35`):
  - Marcus is "the man whose death the room investigates", stated once here, and the judges read this line (M26).
  - Nova has no pronoun field.
  - Blake's line carries the canon from D7.

**Plumbing.**
- **The outline form** (`outline.schema.json`), as TH4 already ruled:
  - the six keys stay as slots, and a slot may be left out or left empty;
  - a section's arc connections list the arcs it carries, not every arc;
  - `convergencePoint` stays, described as the culmination where the threads meet and the thesis lands (C16), without "the murder";
  - the shell-account `inference` stops being required;
  - `thePlayers.buried` and `whatsMissing.buriedItems` go (BU3).

  `validateJournalistOutlineShape` in `console/outline-edit-logic.js`, the server's edited-outline gate and the outline editors follow it, never stricter than the schema.
- **Fields that never print** stay in the content-bundle schema as optional and are no longer asked for: the top-level `photos` array, `pullQuotes`, the sidebar `owner` and `voice_self_check`, and any other field the template does not print (HY1). They are not removed: the article stop's sidebar editor always writes `owner`, and the parked detective prompt still asks for `photos` and `voice_self_check`. The sidebar editor stops seeding `owner`.
- **The money tracker** prints whenever the ledger has an account with a positive total (`hasFinancialTracker`, `template-assembler.js:325–327`; M2). Today it prints only when the writer filled its entries, which the assembler then replaces from the ledger anyway. The writer's entries can then stop being asked for.
- **The roster block.** `generateRosterSection` (:34) never genders Nova, gives Marcus he/him, invents nothing for Blake, and prints "pronoun not given" for a roster character with no captured pronoun (T9). The pronoun set at the roster stop is the director's choice, they/them included (R3).
- **Retiring the old files.** Once no journalist call loads them, eight journalist craft files are deleted: `writing-principles`, `anti-patterns`, `character-voice`, `evidence-boundaries`, `narrative-structure`, `section-rules`, `editorial-design` and `formatting`. Git keeps their history. Alongside them:
  - `PHASE_REQUIREMENTS` (`theme-loader.js`) is keyed by theme: the journalist entries retire, the detective's stay;
  - `requirePhasePrompts` checks the rule set for the journalist (through the loader's throw) and the old files for the detective, so the reworkers' calls in `ai-nodes.js` (:1367, :1869) keep working unchanged;
  - `.claude/skills/journalist-report/SKILL.md` and the `.claude/agents/` definitions point at the rule files;
  - `scripts/render-prompts.js` keeps working.
- **Dead code with its own rules goes:** `reference-loader.js`, `buildValidationPrompt`, `buildRevisionPrompt`, and the dead `validateArticle` in `ai-nodes.js` (:1589, its export at :2005, and the two mocks of the deleted builders in `createMockPromptBuilder`) (M25). These lines of `ai-nodes.js` are the exception to 3.3's ownership.
- **M20 and M21,** journalist halves; the detective halves stay parked.

**Invariants.**
- `<DIRECTOR_GUIDANCE>` stays the last section of the outline and article prompts.
- One `<RECORD>` per prompt.
- The reworkers open with their writer's sections (`lib/__tests__/reworker-writer-parity.test.js`).
- Detective renders are unchanged.

**Tests.**
- The pinned renders reported to the integrator with before and after text.
- `prompt-builder.test.js` covers: the rule sections present; the removed phrases absent from the instruction text; no post-investigation section without an epilogue (Review Focus 5); the roster block, "pronoun not given" included; the rewritten agency rule.
- A lint over every rendered journalist prompt for a gendered Nova.
- A test that no journalist code path loads a retired file, and that the detective's `PHASE_REQUIREMENTS` still resolve.
- The outline schema: a slot left out, a section listing some arcs, accepted; `validateJournalistOutlineShape` never stricter than the schema.
- The content-bundle schema: a sidebar entry with `owner` accepted; the never-printed fields optional.
- The tracker prints from the ledger with no writer entries.
- `prompt-reporting-mode-neutral.test.js` kept green.

**Verification.** Renders of 092026 and 092626:
- the outline and article prompts carry the rule set once;
- no removed phrase appears in their instruction text;
- no retired file is loaded;
- the detective renders are unchanged;
- the sizes are recorded.

**Done.** The renders above, and every listed test passes.

**Out of scope.** The arc calls (3.3), the judges (3.4), the writers' questions field (3.7), card text from the record (phase 5) and photo captions (phase 9).

---

## Brief 3.3: the arc calls and the rework rules

**Intent.** The arc writer and the interweaving call decide the story, yet today they read no rule file. Their inline text:
- tells the arc writer to name who exposed each memory, with no turn-in log to go on;
- invites tying accounts to people by name;
- converges every arc on "the murder revelation";
- describes burial as a drug effect;
- calls the director's notes "GROUND TRUTH" with no evidence line.

The three lenses and the convergence are the narrative machinery the outline and article build on, and they stay, stated as C16 states them. The reworkers carry fixed "preserve, do not regenerate" lines that turned the director's "rethink from scratch" into a relabel, and they treat every advisory score as a defect. Sources: `coverage-arcs-and-reworkers.md` (every row), `coverage-judges.md` (V4, V5, and the rows on the arc check), and the plan review's I20, K16.

**Prompt.**
- **Wiring.** `CORE_ARC_SYSTEM_PROMPT` and `INTERWEAVING_SYSTEM_PROMPT` (`subagents.js:145`, :255; composed by `coreArcSystemPrompt`, `arc-specialist-nodes.js:103`) and the arc reworker read the rule set through `loadRuleSet('arc')` and `loadRuleSet('interweaving')`, placed by the placement ruling. They get the world, the truth rules, the mode block and their craft files. A detective session keeps today's text.
- **What stays, restated.**
  - The three-lens analysis (`subagents.js:151`, :167–169; `arc-specialist-nodes.js` section 5, :447): every arc examined through the money, behaviour and victimization, noting where each supports the arc and where it cuts against it, because the lenses give each section its own material (C16).
  - The interweaving principles (bridges, callback seeds, bridge types) and the convergence (`subagents.js:278–280`): the threads converge at the culmination where the thesis lands, near the end, not on "the central event (murder/accusation)".
  - The arcs are ordered by how they bear on the room's verdict (TH2).
- **Removal.** Inline text the rule set states or contradicts goes. That includes:
  - "name who exposed each memory" and the RIGHT example naming an exposer (`arc-specialist-nodes.js:398`, :427, :431–434; T6);
  - "account naming that suggests involvement", the operator lens, and tensions matched by account name (:438–461; T4);
  - the murder wording: "the murder revelation" and the convergence on "murder/accusation" (`arc-specialist-nodes.js:531`, :550, :556; `subagents.js:81`, :104, :327, :345), "Events from the murder night" (:422);
  - burial as a drug effect (`subagents.js:147–148`; M7).
- **The "ground truth" lines** (`arc-specialist-nodes.js:317–318`) are rewritten to T1's evidence line: the director's notes are record for what happened and was said in the room; backstory in them is Nova's reading; the notes are never changed.
- **The arc writer's buried list** (`extractEvidenceSummary`) gives way to 3.5's timeline: the arc writer drops `{ buried: false }` and its own list, and passes the session config.
- **The rework rules** (`ARC_REVISION_RULES`, `arc-specialist-nodes.js:1136`; `OUTLINE_REVISION_RULES` and `articleRevisionRules` in `ai-nodes.js`; `buildRevisionContext` in `node-helpers.js`):
  - no fixed "preserve" or "do not regenerate" text, and the director's note governs how much a rework keeps (TH7);
  - a rework's first line names the task its revision context gives it (with 3.2's framing string);
  - criteria an evaluation scored low but which are advisory reach the reworker as suggestions, never as "needs improvement" or "WHAT TO FIX" (`node-helpers.js:950–953`; `ai-nodes.js:1798–1809`);
  - the reworker is told the scores are uncalibrated.

**Plumbing.**
- **The arc check** (`validateArcStructure`). An arc with a missing or invalid source label is sent back for a label, not relabelled "discovered" (V5). The role-contradiction note goes (V4). Roster coverage is 3.7's.
- **`validateFinancialData`** (`node-helpers.js` around :1131) reads fields the schema has, or goes with its caller in `template-nodes.js:134–135` (M29).
- **M23's rule-set half:** the arc reworker carries the rule set through its writer's builders.

**Invariants.**
- The arc reworker opens with its writer's sections (`reworker-writer-parity.test.js`).
- The interweaving plan is kept on a rework, as since phase 2.
- `<DIRECTOR_GUIDANCE>` stays last.

**Tests.**
- `arc-specialist-prompts.test.js` covers: the rule sections; the lenses and the convergence present in C16's terms; the removed phrases absent from the instruction text; the rewritten "ground truth" lines.
- The revision-rules tests cover no fixed preserve text, the first line, and advisory criteria as suggestions.
- The arc check covers a missing source label sent back.
- The pinned arc renders reported to the integrator.

**Verification.** Renders of 092026's arc writer, interweaving call and arc rework: the rule set is present, the timeline replaces the buried list, none of the removed lines is present, and the detective arc render is unchanged.

**Done.** The renders above, and every listed test passes.

**Out of scope.** The judges (3.4), roster coverage and the writers' questions (3.7), and the curation scoring prompt (phase 3b removes it).

---

## Brief 3.4: the judges and the checks

**Intent.** The judges should read the same rules as the writers and judge against them. A truth-rule breach is a definite error with the draft, so it goes back automatically: flagging it to the director would only hand the director the same fix (R2). Today:
- no judge has any evidence-boundary criterion;
- the article judge's remote rule sends every exposure through a tipster, which pushes the article to name or invent exposers;
- the arc judge treats the director's notes as "ground truth, never question them";
- the judges call Marcus "the murder victim" and still ask for "we";
- the outline and article checks that the threads run through the sections are worded as every arc in every section.

Sources: `coverage-judges.md` (every row, and section 7's list of rules no criterion scores), and the plan review's I4, I12, K17.

**Prompt.**
- **Wiring.** `buildEvaluationSystemPrompt` (`evaluator-nodes.js:398`) gives each journalist judge the world, the truth rules and the mode block through `loadRuleSet('judge-arc' | 'judge-outline' | 'judge-article')` and `loadModeBlock`, placed by the placement ruling. Since phase 2 the judges carried no mode block; now they read the same one as the writers. Each judge's craft files, its writer's list, go in as the reference for craft findings. The detective's judges are unchanged.
- **Must-fix criteria for the truth rules.** One structural criterion per group, each naming its rules, scored on the record the judge already sees. A failure names the sentence and the record it contradicts, so the rework fixes that sentence:
  - evidence: what is stated, reported or presented as a reading (T1), buried memories (T3), accounts (T4), exposers (T6);
  - money: its direction and the figures (T5);
  - the verdict as the room's story (T2);
  - the stages and the epilogue (T7);
  - Nova's position (T8);
  - players: their pronouns (T9) and commentary on characters, not players (T11);
  - words: quotes word for word, in the right mouth (T12);
  - photos and the whiteboard (T13);
  - the fiction's words (T14).
- **The existing criteria keep their status** (structural stays structural, advisory stays advisory), each reworded to name the rule or craft item it scores:
  - `voiceConsistency`: no "participatory", and "we" as T8 allows it (:241, :623);
  - `antiPatterns`: T14 and C4;
  - `reporterMode`: T8, with the remote rule saying exposures reach Nova by turn-in and the room's events by attribution, not that every exposure is a tip (:261, :1006);
  - `arcSectionFlow` and `arcThreading` (outline :172–176; article :274–280): C2, every section an essential part of the narrative, carrying the threads forward from its own angle, nothing front-loaded into THE STORY, not every arc in every section;
  - `visualDistributionPlan`: photos spread through the article, with no count;
  - `requiredSections` (journalist outline, :167–171): "each printed section earns its place" (TH4);
  - `convergence`: C16, the threads converge at a culmination near the end where the thesis lands;
  - `sectionBalance` and `wordBudget`: "about 1,500 words" (F2);
  - `visualMomentum`: cards and photos, not pull quotes;
  - `coherence` (:92–96): faults only incompatible facts, never arcs that pull against the verdict (C3).
- **Lines that contradict the rules are rewritten:** "ground truth - never question them" (:425) becomes T1's evidence line, as in 3.3; "the murder victim" and "the murder" (:366, :996) read 3.2's canon line.
- **M9** is superseded and not made.

**Plumbing.**
- **The fact check's fix lines** (`content-bundle-fact-check.js`):
  - the remote fix line no longer says each exposure arrived as a tip (:751–755);
  - the vote fix line no longer sends the reworker to name the person who acted (:740–743);
  - no fix line carries an em-dash.
- **Roster coverage in the fact check stays structural and unchanged.** By the article stage the director has answered the arc writer's questions, and a note is record.
- **New code checks.** Each is added to `FACT_CHECK_ADVISORY_ONLY` (:162), with its own message prefix and a group in `console/checkpoint-view-logic.js`. Each reads the narrator's text with quoted spans stripped, never card text or quote blocks:
  - em-dashes;
  - production words (T14), so a quoted memory's "token" is never flagged;
  - a gendered pronoun for Nova (T9);
  - a gendered pronoun for Blake that neither the director's notes nor the roster give, and Marcus's pronoun (extending the NPC check, which today scans only NPCs with a declared pronoun);
  - the narrator's prose (headline, deck and paragraphs) above 1,800 words (C4, R4);
  - a statement of how many people were in the room that disagrees with the roster (T10); vote counts and account counts are not head counts.

  Each says what it found and where. Promotion to structural waits for a live session that shows it right.
- **Fields never printed.** The judges and the fact check no longer read a field the template does not print. That includes `voice_self_check`, which the article judge scored roster coverage from (HY1, with 3.2).
- **The arc judge's own buried list** gives way to 3.5's timeline.

**Screen.** The evaluation bar lists the truth findings among the must-fix, each labelled with its rule. The fact check's new advisories appear in their groups, never on the approve button's count.

**Invariants.**
- The fact check runs before the Opus judge and still short-circuits it on a structural failure under the automated budget.
- No new code check is structural.
- Message prefixes stay stable, because the console groups by them.
- The detective's criteria are unchanged.

**Tests.**
- `evaluator-nodes` tests cover: the rule sections in each journalist judge; each truth criterion structural and naming its rules; every existing criterion's status unchanged; the reworded criteria's text; the detective criteria unchanged.
- Fact-check tests cover each new check, firing and staying silent: a quoted memory containing "token", an em-dash inside a quote or a card, a quoted player line, "six votes", "eight accounts", a Blake pronoun the notes give, a guest reporter on and off the roster.
- `checkpoint-view-logic` tests cover the new groups and the button count.

**Verification.** Renders of the three 092026 judge prompts (the integrator's extended script): the rule set is present, every criterion names its rule, and none of the removed lines appears in the instruction text.

**Done.** The renders above, and every listed test passes.

**Out of scope.** Calibrating the judges and the claim check (phase 7); the arc check (3.3, 3.7); the arc judge's roster coverage (3.7).

---

## Brief 3.7: the writers' questions

**Intent.** When the record holds nothing about a player, a roster pronoun is missing, or a ledger line looks wrong, the writer asks the director instead of guessing or inventing (C15). Today the arc check, the arc judge and the arc writer's own instructions all require every roster member placed, which pushes the writer to invent a place for a player the record says nothing about. Once the director answers at the arc stop, the answer is record for the writers after it. Sources: the plan review's I1, I9, V3, V9, K6, K7, G9.

**Plumbing.**
- **One optional field, `writerQuestions`,** on each writer's output. It holds a short list, each naming what it is about (a player, a pronoun, a ledger line) and the question. It never prints in the article; the director reads it at the stop, the one exception to HY1.
  - **The arcs:** both arc schemas (`CORE_ARC_SCHEMA` for the writer, `PLAYER_FOCUS_GUIDED_SCHEMA` for the reworker), the arc writer's OUTPUT FORMAT block (`arc-specialist-nodes.js:270–300`), `mergeArcsWithInterweaving`, and the arc cache, where it is stored as `_arcAnalysisCache.writerQuestions`. The interweaving call has no field (spec section 8).
  - **The outline** (`outline.schema.json`) and **the article** (`content-bundle.schema.json`), at the top level. `JOURNALIST_ROOT_KEYS` and `validateJournalistOutlineShape` allow it.
  - It is kept out of later prompts: `outlineWriterInputs`, the article writer's APPROVED OUTLINE and the judges' JSON strip it.
  - The hand-edit diff and the trace (`lib/hand-edit-diff.js`) ignore it.
- **Questions survive reworks** (R5). A rework, automatic or the director's, carries forward every question its revision context did not answer, and adds its own. The questions clear with their output on a rollback.
- **`getCheckpointData`** sends the current output's questions at the arc, outline and article stops as `writerQuestions`. The payload is documented in `reports/CLAUDE.md`.
- **Roster coverage at the arc stage** counts a roster member as covered when an arc places them through the record, or when a question names them; a question naming "Sarah Blackwood" covers "Sarah". This applies to `validateArcStructure`, the arc judge's `rosterCoverage` (`evaluator-nodes.js:73–77`), the arc writer's roster lines (`subagents.js:194`; `arc-specialist-nodes.js:218`, :331) and the fix line (`arc-specialist-nodes.js:1443–1445`). The article fact check's roster coverage is unchanged.
- **The harness** (`scripts/e2e-walkthrough.js`) prints the questions in step mode.

**Screen.** One shared panel (`console/utils.js`), rendered above the output at the three stops when there are questions. It shows one line per question, with what it is about first, and folds away. The director answers with the stop's existing note box, so no reply mechanism is added. The panel's logic goes into `console/checkpoint-view-logic.js`.

**Prompt.** The writers already read C15 (3.1). The schema description for the field states its shape only.

**Invariants.**
- An empty list shows no panel.
- The field never reaches the template, the fact check's printed text, or a later writer's prompt.

**Tests.**
- Schema tests for the optional field in all four schemas.
- The merge and the cache keep the arc questions; a rework carries forward an unanswered question and drops an answered one.
- The strip from `outlineWriterInputs`, APPROVED OUTLINE and the judges' JSON.
- `getCheckpointData` sends `writerQuestions` at the three stops.
- The arc check, the arc judge's criterion and the fix line count a questioned player as covered, by first name or full name.
- `checkpoint-view-logic` covers the panel model, empty and full.
- `validateJournalistOutlineShape` accepts the field.

**Verification.** A fixture thread with planted questions in each output shows them at each stop in the click-through, and they survive a send-back.

**Done.** The verification above, and every listed test passes.

**Out of scope.** Replies threaded per note (phase 10), and questions at the input review.

---

## Rulings (the integrator's, 2026-09-30, revised 2026-10-01 after the plan review)

- **Placement of the rules in each prompt.**
  - The world, the truth rules and the mode block go in each call's system prompt. They are the stable frame, the same across a session, read first.
  - The craft files go in the user prompt, after the data and before `<DIRECTOR_GUIDANCE>`, following the existing rules-last pattern.
  - Judges get their craft reference in the user prompt, after the material they judge.

  One placement for every call, fixed here so 3.2, 3.3 and 3.4 agree. Cost if wrong: moving one block per builder.
- **The rule files live in the journalist skill** (`references/rules/`), with a synchronous loader in `lib/rule-set.js`. They move to a shared folder when the detective returns. Cost if wrong: one move later.
- **The files split to match spec section 8 exactly,** so each call reads its craft items and nothing else. Cost if wrong: a file merge.
- **The director reads the rule text before it is wired.** It is the core deliverable, and a mistake there reaches every call. Cost: one sitting between waves.
- **A truth-rule breach is must-fix** (the director's R2). Existing judge criteria keep their status. New code checks start advisory, as `npcPronouns` and `repeatedAbsence` did, and are promoted after a live session shows them right. Cost if wrong: a wrong truth finding costs one automatic rework, which the trace shows the director.
- **The length check flags the narrator's prose above 1,800 words** (the director's R4): the headline, deck and paragraphs, which is `narratorText`. Cost if wrong: a flag the director ignores.
- **The timeline lives inside the record view,** built at render time from the bundle's sales and the session config's exposures and adjustments, so old threads render with what they have. Cost if wrong: the record view grows by the exposures and adjustments, a few hundred characters per session.
- **The session clock is decided on the first exposure or sale,** never on the game master's setup row, which can fall before 5 PM in an evening session. Cost if wrong: one rule to move.
- **The eight retired journalist craft files are deleted, not archived;** the detective's stay. Git keeps them. Keeping them on disk invites a loader or a person to read them again. Cost if wrong: a `git show` to recover one.
- **Never-printed fields become optional and unasked, not removed,** because the console's sidebar editor and the parked detective prompt still write them. Cost if wrong: dead fields in the schema until phase 5.
- **The writers' questions live inside each output and survive reworks until answered** (the director's R5). No new channel. Cost if wrong: an answered question lingers one round.
- **The shared test files belong to the integrator.** Parallel slices otherwise collide on every pinned hash. Cost: the integrator's time at each merge.
- **The gate proves the pipeline works, not that the article improved** (the director's ruling of 2026-10-01). The test of the rules is the director's next new session. The end-to-end run uses a copy of 092026 because it is an evening session with a guest reporter, an epilogue and the director's own correction to replay. Cost if wrong: about an hour and a half of model calls.
- **Three waves.** 3.7 needs the writers' schemas, the arc check and the arc judge that 3.2, 3.3 and 3.4 own, so it runs alone after them. Cost if wrong: about a day of wall time.

---

## Completing phase 3 (2026-10-02): the craft rebuilt around the form

**Why.** The gate's live run worked: every call completed, every stop loaded, and the article had none of the old factual errors. The director then read the article beside the published 092026 and edited it. The edits showed the rule set pushing the writers toward defensibility. There were disclaimers that explained the game, a source tag on almost every sentence, details placed where they made no sense, a buyer stated as fact, and a thesis held back until the closing. The judges' fixes pushed the same way, and the outline scripted it all. The director approved an account of the article's form and the rule text rewritten from it (spec round 7, R11 to R24). The craft is now the engine and the truth rules the floor. The guidance is tested in the director's next session and refined in phase 4 (R20).

**The rule text** is the director-approved read (`.superpowers/sdd/2026-09-30-phase-3-one-rule-set/rule-text-read-2.md`, kept locally), and spec sections 2, 4, 5 and 8 state it. The craft files become eight: craft-story, craft-form, craft-material, craft-voice, craft-judgement, craft-telling, craft-cards and craft-questions. The truth floor changes T1 to T5, T7, T8, T14, the world file and the remote-mode block.

**Four slices, built in parallel and each reviewed, then the docs:**
- **3.8 The rule files.**
  - Writes the rule files from the read.
  - Retires craft-thesis, craft-sections, craft-arcs, craft-room and craft-tracing.
  - Sets `RULE_SET_CALLS` to spec section 8.
  - Updates the loader's tests and stub fixtures.
  - Adds the retired wording to the removed-phrase fixture.
  - Owns `references/rules/`, `lib/rule-set.js` and their tests.
- **3.9 The judges and the money line.**
  - The money judge asks whether money runs from the buyer, and the money summary names the buyer.
  - The structural criteria lose the craft clauses the final review found: antiPatterns names only the em-dash house rule and T14's production words.
  - The outline judge's convergence criterion follows C16.
  - The plant-and-payoff criterion rewards a plant only when its payoff moves the throughline.
  - The article judge loses the old card-count line.
  - The judge step skips a phase whose latest verdict escalated to the director.
  - The outline places every photo the director has not excluded. The article writer and judge get every photo the outline placed.
  - Owns `evaluator-nodes.js`, and in `prompt-builder.js` the money summary and the article writer's photo list.
- **3.10 The reworks and the writers' inputs.**
  - An automatic rework is given the must-fix items as its task, and acts on a suggestion only where it touches a line it is already fixing; a passing criterion's note is never presented as must-fix (R23).
  - The interweaving principles become one text, which the arc reworker also gets for the fields it returns.
  - Prompt text and schema descriptions that name `<craft-arcs>` follow the new file names.
  - The arc notes label stops calling backstory "Nova's reading".
  - On an automatic pass, the rework's questions replace earlier questions of the same kind and subject.
  - The arc writer, the interweaving call and the outline writer get the roster with pronouns, through the section the article writer uses.
  - Owns `node-helpers.js`, `arc-specialist-nodes.js`, `subagents.js`, `writer-questions.js`, the rework rules, and in `prompt-builder.js` the outline writer's roster.
- **3.11 Session data, the console and the harness.**
  - A first-burial bonus in 061226's row shape is read as the bonus, and a transfer source with no sale and no standings row is reported, never invented as an account.
  - A director's correction that matches a quote's words overrides the speaker even when the enricher attached none.
  - A stored quote's speaker prints only when a checked line names them.
  - The questions panel's hint suits each stop: at the article stop, answers go with a send-back.
  - The harness approves a stop the thread is already paused at without a `/resume`.
  - Owns `session-ledger.js`, `director-enricher.js`, `director-notes-renderer.js`, `console/checkpoint-view-logic.js` and `scripts/e2e-walkthrough.js`.
- **3.12 Docs,** after the slices land: `CLAUDE.md` and the deep dive describe the code as it now is.

The integrator owns the pinned renders and merges in the order 3.8, 3.11, 3.9, 3.10.

**Deferred, after phase 3:**
- code checks at the arc stage for quotes and the Blake and Marcus pronouns (R24);
- tension sentences stored on old threads;
- the input review of a thread parsed before phase 3;
- the render tool rendering an automatic rework.

**The gate** proves function, as before:
1. The suite.
2. The prompt checks:
   - each call reads its section 8 files, once;
   - the retired wording is absent from every instruction text;
   - the detective is unchanged apart from the named hunks;
   - sizes are recorded.
3. One live run on a copy of 092026, from arc selection with the director's guidance to the published page, with one send-back at the article stop. It passes when:
   - every call completes on its pinned model with valid output;
   - every stop loads;
   - every prompt carries its files.
   For each automatic pass, the share of sentences it kept is recorded.
4. The questions panel's hint at the article stop, on a fixture.
5. A final review of this pass, on Opus 5.5.
