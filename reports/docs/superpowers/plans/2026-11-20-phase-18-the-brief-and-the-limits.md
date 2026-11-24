# Phase 18: the brief and the limits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** The three writers read a brief with reasons in place of the craft rules, the world and the limits worded by Nova's sources, and a short text on their own part. Everything else they read uses the same words and cites no rule by number. The map's line under each section is that section's step in the argument. The judges check the limits and nothing else.

**Spec.**
- The authority is `docs/superpowers/specs/2026-11-20-the-brief-and-the-limits-design.md` (commit `68800793`). The director settled its three open points on 2026-11-20.
- The rule files' text is the eight files in `docs/superpowers/specs/2026-11-20-phase-18-approved-text/`: `brief.md`, `world.md`, `limits.md`, `mode-remote.md`, `mode-on-site.md`, `job-weave.md`, `job-map.md`, `job-article.md`. Each holds exactly what its rule file holds.
- Every other reworded line is in `docs/superpowers/specs/2026-11-20-phase-18-rule-text-read.md` ("the read"), old beside new. The director approved it on 2026-11-20 ("looks fine").
- The code footprint is `surveys/old-text.md` in the phase's workspace (`.superpowers/sdd/2026-11-20-phase-18/`, at the repository root): 155 model-facing lines copied word for word with file and line at `68800793`.
- The vocabulary is `CONTEXT.md`'s, as slice G amends it.

**Builds on.** Local `main` at this plan's commit. The phase branch, `feat/phase-18`, is cut from it. `main` is ahead of origin, and the push is the director's.

**Architecture.**
- **The rule files.** Twelve become eight. `world.md` and `limits.md` are the core every writer and judge reads. One of the two mode files reaches each prompt in a `this-session` tag. `brief.md` and one `job-*.md` are what each writer reads where its craft files are now.
- **The writers' prompts.** Each task block, field description, label and check message takes the read's wording: the limits' words, "plain words" for "story terms", and no rule number.
- **The record** says "memory turned in" and "name given" on its timeline and drops the `layer` label.
- **The map.** A section's `job` is its step, one sentence. The key keeps its name, the page's label changes, and the page's bounds rise by 100 words.
- **The judges** keep T1 to T15 as the codes their findings open with. Their own instructions list the fifteen limits by code and name, and their questions are reworded from the limits.
- **The skill and the docs** follow, last.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.296 (Opus 5.5, Sonnet 5.5, Haiku 5.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides, and the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace), with its cost if wrong.

**The approved text goes in byte for byte.** The eight rule files are copied from the approved-text folder. Every other line takes the read's "After" wording exactly. The read's notes to the director, the spec's appendix B and anything headed "What changed" stay out of every file a model reads. No example passage from any session enters a prompt.

**No one in this phase writes new model-facing prose** except slice G, for the skill's agents. If a line a model reads has to change and the read does not give its wording, stop and report it to the integrator. Slice G loads `mattpocock-skills:writing-for-agents` first.

**The stops keep their shapes.** No field is added, removed or renamed on the weave, the map or the content bundle. `job`, `leftOut`, `gapNote`, `deck` and the beat kind `receipt` keep their names. A stored thread opens and reworks as before.

**The director's edits are final.** No change here touches `lib/hand-edit-diff.js`, `settleEdits`, the hand-edits rules or the reweave's scope in `lib/workflow/nodes/node-helpers.js`.

**The judges stay truth-only,** and how a finding is parsed does not change: `leadingRuleIds`, the console's `LEADING_RULE_IDS`, `criteriaRules` and `guardDirectorEdits` read the same T codes they read today.

**Model-facing text.** No em-dash. Nova is never gendered. No "such as" or "for example" in a rule file. No rule number in anything a writer or a rework reads.

**Themes.** Only the journalist runs. The detective's branches stay as they are. No code names Nova.

**No other changes.** No model, effort or pin change. No npm install, update or ci: if a step seems to need a package, stop and report it. No new check, judge criterion or score on the writing.

**One source of truth.** `RULE_SET_CALLS` is the one list of what each call reads after the core. The skill's agents follow it, held by `lib/__tests__/retired-craft-files.test.js`. The judges' list of limits is one constant, held equal to `limits.md` by a test.

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The rule files are read at server start, so a thread picks up this phase at its first writer or judge call after the restart.

**Console.** Logic that decides a line goes into the dual-export pure modules, with node tests. Components stay thin.

**Tests.**
- No live model calls. Each brief's Verification runs with no model call.
- Every commit passes the full suite (`npm test`), exit code guarded. Counts fall only by the tests a brief retires, and the brief's return names each one.
- Tests that pin today's text break by design. The slice that changes the text updates them with the reason, and re-pins any hash it moves in `lib/__tests__/writer-prompts-pinned.test.js`, with its reason and length delta in the header comment.
- No test reads `data/`. The repo is public, so a test in a real session's shape uses invented names and text.

**Never touched.** The director's server on port 3001. `data/checkpoints.sqlite`, except a copy the director has approved. `.env`. `git stash`. `--no-verify`. Worktrees sit outside the main checkout, with `node_modules` as a junction made in PowerShell.

**What the integrator owns.** The removed-phrase list (`lib/__tests__/fixtures/removed-phrases.js`, R12); recomposing a hash two slices moved; the workspace's `progress.md` and each run's interfaces file; the roadmap; the gates.

**Docs.** Each slice updates the lines of `docs/architecture/*.md` that describe what it changes, as "Who owns which file" lists them. Slice G updates the skill, `docs/PIPELINE_DEEP_DIVE.md`, `CONTEXT.md` and `CLAUDE.md`. The docs grep is a gate.

## Rulings

- **R1. The folder.** `.claude/skills/journalist-report/references/rules/` holds exactly the eight files, each byte-equal to its file in the approved-text folder. `truth-rules.md` and the eight `craft-*.md` files are deleted.
- **R2. The lists.** `CORE_FILES` is `world`, then `limits`. `RULE_SET_CALLS` is `arc: [brief, job-weave]`, `outline: [brief, job-map]`, `article: [brief, job-article]`, `judge-arc: []`, `judge-article: []`. Each file is wrapped in a tag named after it. `loadModeBlock` wraps either mode file in `<this-session>`.
- **R3. The order in a prompt does not change.** A system prompt opens with the identity line, the `this-session` block, `<world>`, `<limits>`. A writer's user prompt holds `<brief>` then its `<job-…>` where its craft files are today, before `<DIRECTOR_GUIDANCE>`. Every rework reads what its writer reads.
- **R4. Each rule file is pinned by hash** in `lib/__tests__/rule-set.test.js`: its sha256, its length and the reason of the last change. The sentence pins there, and every other test that quotes a sentence of a rule file, are retired.
- **R5. The lint on the rule files:** the folder holds the eight and nothing else; each call reads R2's list; no em-dash; no gendered Nova; nothing on the removed list; none of the old examples' accounts, sums or sessions; no "such as" or "for example"; no "the room"; no match for a rule number (`\b[TC]\d{1,2}\b`); the eight together under the 50,002-character cap (40,038 today).
- **R6. "Tips" is the director's word.** The assertion that a mode block never says "tip" (`lib/__tests__/prompt-reporting-mode-neutral.test.js:390-391`) is retired: the director's wording of 2026-11-20 is "tips and messages".
- **R7. Pointers.** Where the read's "After" names a part, it reads `as "<part's name>" in <tag> says` or names the tag alone. No other pointer is added.
- **R8. The judges' codes.** One exported constant lists the fifteen limits in order, each with its code and its name as the read's part 4 gives them. `truthCriteriaSection` prints it once, under its heading. A test reads the bold lead-ins of `limits.md` and holds them equal to the names, in order. T8's entry adds "with the part about this session".
- **R9. The fact check's messages keep the words they open with** ("Reporter-mode violation", "Absence stated", "Pronoun error:", "Gendered pronoun for Nova", "Em-dash in the narrator's prose", "Production word in print:", "Over length:", "Head count:", "Roster coverage gap"), because the desk groups by them. Only what follows changes. The count that triggers "Absence stated" stays more than one.
- **R10. The map.** `MAP_WORD_BOUND` 550, `MAP_WORD_AIM` 400, `MAP_OPEN_WORD_BOUND` 850; `MAP_SYNOPSIS_AIM` stays 250. Any copy the console or the skill holds moves with them. The section editor's label reads "Step: what the reader learns here about the question".
- **R11. The verdict question's reading.** The article judge's verdict criterion reads the verdict, the notes, the answers and the stop notes. It no longer reads the map or the director's edits.
- **R12. The removed list.** The integrator adds the retired wording so it cannot return in a writer's instructions: "in story terms", "the reporting-mode block", "the mode block", "CRAFT GUIDANCE", "the room's verdict", "exposer", and the tags `<truth-rules>` and `<craft-`. The scan for rule numbers is its own test (brief G), since the judges keep theirs.
- **R13. The article writer's printed schema.** The JSON printed inside `<SCHEMA>` omits the properties the instruction tells the writer to leave out: `financialTracker`, `photos`, `pullQuotes`, `voice_self_check`, a sidebar entry's `owner`, `placement` and `content`, and the `characters` of a photo or the hero image. The schema passed to the SDK, the validator and the template read the full schema as before. If one of these properties is in a `required` list, stop and report it.
- **R14. Left as they are:** the identity lines in `lib/theme-config.js`; "in the room" where the room is a place; the accusation's labels; the guest reporter's lines; the time-of-day line; the prompts of calls that write nothing the article prints (sorting the evidence, describing photos, reading the notes, reading the whiteboard photo).
- **R15. The agents' lists move in slice A.** `retired-craft-files.test.js` holds each agent's list of rule files to its call's list, so the four agents' fenced lists change in the commit that changes `RULE_SET_CALLS`. Their other text waits for slice G.
- **R16. Between run 1 and run 2 the code-built lines still point at rules by number.** That is expected inside the phase branch. Slice A leaves those strings and their tests alone, and the integrator adds R12's phrases only once run 2 is merged.
- **R17. The weave's output format echoes three field descriptions in shorter words.** Each takes the read's wording for its field: the question is "The question the article asks near its top and answers at its end", where it ends up is "Where it ends up: Nova's answer to the question, in one line", and a connection's line is "Where the two threads connect, in one plain line".

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, most likely first. Each names the slice whose tests pin it.

1. **A thread from before the merge.** Its stored findings open with T codes and still group and strip at the desk. Its map's short `job` lines open, edit and rework. Its map passes the higher bounds (F, C).
2. **Nova outside and Nova in the warehouse.** Each session's writers, reworks and judges read exactly one `this-session` block, holding the right file's text. The judge's line says "outside the warehouse" or "in the warehouse" to match (A, F).
3. **Every rework reads what its writer reads.** The weave rework's three ways (the automatic pass, the reweave, the send-back), the map rework's two and the article rework each read `<brief>` then their `<job-…>`, once, before the revision block (A).
4. **A verdict that blames nobody.** The accused line and the line after it print the read's wording in the weave writer's prompt and in the session's facts, and the verdict's thread still holds no one as the accused (E).
5. **A guest reporter's memory on the timeline.** It prints "memory turned in", with "name given: Taylor (the guest reporter, Taylor Chase)" (E).

## What this phase changes for the director

| Where | Today (111326) | After |
|---|---|---|
| Story meeting | The page as it is | The same page. Each angle's question is chosen so the ending can do its second job when the session allows |
| Map | Under each section, a topic of five to ten words ("Sets Vic's sham against its insiders' rise"). 78 pieces of evidence under 16 beats | Under each section, its step in one sentence, labelled "Step". About 100 more words on the page. Evidence chosen for what each step needs |
| Desk | A draft that prints rule sentences, the map's lines, most of the evidence and the log's words ("an exposure under her own name") | A draft written from the brief |
| Judge's notes at the desk | A note when a debated theory is not reported. "Nova says so once, early" | No note about theories. The note on Nova's absence says the players know |

## Slices and how they run

**How the work is split.** The rule files and the loader change first, alone, because every other slice's tests read the new files and tags. The three writers' prompts, the record with the shared labels, and the judges then touch different modules and run together. The skill, the docs and the closing scan come last, once the pipeline's text is in.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| A | The rule files and the loader | prompt | large | the phase branch is cut |
| B | The weave writer's prompt | prompt | medium | run 1 merges |
| C | The map writer's prompt and the step | prompt, screen | medium | run 1 merges |
| D | The article writer's prompt | prompt | medium | run 1 merges |
| E | The record and the shared labels | prompt | small | run 1 merges |
| F | The judges | prompt | medium | run 1 merges |
| G | The skill, the docs and the closing scan | docs, tests | medium | run 2 merges |

**Runs.** Each run is one workflow.

| Run | Slices | Long pole |
|---|---|---|
| 1 | A | A |
| 2 | B, C, D, E, F | D |
| 3 | G | G |

- The integrator merges a run's slices into the phase branch in the table's order. Each is rebased onto the last, with the full suite at every commit. The next run's worktrees are cut from the new head.
- Before each run the integrator writes that run's interfaces file: who owns which functions of a shared file, the docs lines each slice updates, and the hashes each slice may move.
- B, C, D and E each move a pinned render, and E moves all three. Each slice re-pins in its own worktree. At integration the integrator renders again and re-pins, keeping each slice's reason.
- The phase merges to `main` once, after the gates. The integrator asks the director before merging, and merges only when no session is paused at the input review or a later stop.

**Seats.** Each slice is one builder in one worktree. After it comes a reviewer who reads the diff against the brief and the read, then a verifier for each blocking finding before any fixer, and at most two fix rounds.

**Each seat's model and effort is chosen for its work** (the director, 2026-11-23: "we should carefully consider what model and effort level each agent should use instead of defaulting to the same model and effort level for each agent", and later that day, on effort: "are you actually thinking about the specific tasks requirements and levels of complexity/nuance vs what the actual models available are good at/weak at and what all effort levels are possible"). This replaces the roadmap's rule that every seat runs on the session's model. The session runs on Fable 5.2, so every seat is pinned or inherits on purpose.

What the choices rest on, from the published guidance for these three models:
- **Five effort levels exist: low, medium, high, xhigh, max.** A level sets how much the model thinks and how many tool calls it makes. The same name means a different amount on each model.
- **Opus 5.5** defaults to medium. The guidance is to start there, test the neighbouring levels, and keep xhigh and max for a measured gain. Its largest measured gains are carrying a change through a large repository until its tests pass, and code review with fewer false alarms, both at medium.
- **Sonnet 5.5** defaults to high. Medium is the recommended start for coding in a repository. At low it sometimes reports a change done without running a check.
- **Fable 5.2** defaults to high, where most of its gain arrives. xhigh raised coding scores slightly for many more tokens. max suits open-ended problems.
- **Price per token does not predict cost per finished task.** With a pass-or-fail signal, the cheaper pattern is to run at the lower level and redo only the failures higher.

So no seat runs at low (exact wording and green tests are the work), and none at xhigh or max (no gain has been measured, and the difficulty here is breadth and exactness, which a reviewer buys better than more thinking). None of this is measured on this codebase. The ledger records time, tokens and fix rounds for each seat so the next phase can choose on evidence.

| Seat | Model | Effort | Why |
|---|---|---|---|
| A, builder | Opus 5.5 | high | Ran before this table was revised. The widest change: every later slice stands on it |
| A, reviewer | Opus 5.5 | high | Ran before this table was revised |
| B, builder | Sonnet 5.5 | medium | Transcription and tests in four files. Medium is Sonnet's recommended start for this |
| B, reviewer | Opus 5.5 | medium | Reads each changed line against the read. Opus's review gains were measured at medium |
| C, builder | Sonnet 5.5 | high | Has to find every copy of three numbers and a label across the server and the console; effort buys more searching |
| C, reviewer | Opus 5.5 | medium | Checks the console's copy of the bounds and that old maps still pass |
| D, builder | Opus 5.5 | high | The one real design decision: the schema the writer is shown against the schema the SDK is given |
| D, reviewer | Fable 5.2 | high | The risk is in how the real SDK takes the schema, which the tests cannot see because they use a stand-in |
| E, builder | Sonnet 5.5 | medium | Label swaps in six files |
| E, reviewer | Opus 5.5 | medium | Reads each changed line against the read |
| F, builder | Opus 5.5 | medium | The wording is given, but each question has parts that vary by judge and must survive |
| F, reviewer | Opus 5.5 | high | The judges decide reworks and guard the director's edits, and a stored finding has to parse as before |
| G, builder | Opus 5.5 | medium | Writes the skill's own text, which a model reads, and broad doc edits |
| G, reviewer | Opus 5.5 | medium | Reads the agent files as an agent meets them, and runs the docs grep |
| Verifier, one for each blocking finding | Sonnet 5.5 | medium | Its whole job is to run a check, so not low |
| Fixer | One step up from the attempt that failed: Sonnet medium to Sonnet high; C to Opus medium; Opus medium to Opus high; D stays Opus high | | The "redo failures higher" pattern |
| Re-review of a fix | Opus 5.5 | medium | A small diff against a short list of findings |
| Prompt readers, one for each prompt (gate 4) | Fable 5.2 | high | Reading 40,000 words of prompt for register, contradiction and what a writer could lift is language judgement with no pass or fail to lean on, and a fresh reader sees what the author of the text does not |
| Final whole-phase review | Fable 5.2 | high | One seat, the last check before a merge that reaches the next live session. High is Fable's default |

No seat is Haiku: its guidance places it at classification, extraction and sub-agent tasks, and the smallest seat here decides whether a finding lives. The integrator checks, with a two-agent probe before run 1, that "opus" and "sonnet" resolve to Opus 5.5 and Sonnet 5.5.

**Who owns which file.**

| Slice | Owns |
|---|---|
| A | `lib/rule-set.js`; the rules folder; `lib/__tests__/fixtures/rules/`; the two tag names in `TRUTH_MATERIAL` (`lib/workflow/nodes/evaluator-nodes.js:142-160`, `modeBlock` and `truthRules`); the fenced rule lists in the four agents (`journalist-arc-analyzer.md`, `journalist-outline-generator.md`, `journalist-article-generator.md`, `journalist-article-validator.md`); every test that names a rule file, a rule tag or a rule heading, or quotes a rule file's sentence: `rule-set.test.js`, `theme-rules.test.js`, `retired-craft-files.test.js`, `writers-read.test.js`, `writers-rule-set.test.js`, `revision-prompts-craft-rules.test.js`, `reworker-writer-parity.test.js`, `prompt-builder-director-guidance.test.js`, `prompt-files-no-leakable-examples.test.js`, and the tag, heading and sentence assertions in `weave-stage.test.js`, `arc-specialist-prompts.test.js`, `article-writer-map.test.js`, `prompt-reporting-mode-neutral.test.js`, `prompt-builder.test.js`, `article-judge.test.js`, `__tests__/unit/workflow/evaluator-nodes.test.js` and `__tests__/unit/journalist-skill-path.test.js`; the three pinned hashes; the comment over `rules` in `lib/theme-config.js`; `docs/architecture/prompts.md` on the rule set |
| B | `lib/workflow/nodes/arc-specialist-nodes.js` (`WEAVE_TASK`, `ARC_NOTES_LABEL`, the output format, the section headings and the lines under them, the character categories); `lib/sdk-client/subagents.js` (`WEAVE_SYSTEM_PROMPT`, the weave's field descriptions); `lib/writer-questions.js`; the weave checks' messages in `lib/weave.js`; their tests; the weave writer's pinned hash; `docs/architecture/story-meeting.md` |
| C | `mapTask` and its constants in `lib/prompt-builder.js`; `lib/map.js` (the bounds, the pages' fixes, the card faults, the findings' messages); `lib/schemas/outline.schema.json`; `MAP_SEND_BACK_HEADLINE` in `lib/workflow/nodes/node-helpers.js`; the section editor's label in the console's `Outline.js`, any other place the page names that line, and any copy of the bounds in `console/checkpoint-view-logic.js`; their tests; the map writer's pinned hash; `docs/architecture/map.md` |
| D | `ARTICLE_TASK`, `STORY_MAP_LABEL`, the generation instruction and the printed schema in `lib/prompt-builder.js`; the journalist's messages in `lib/content-bundle-fact-check.js`; their tests; the article writer's pinned hash; `docs/architecture/article.md` |
| E | `lib/prompt-renderers/record-view.js`; `lib/evidence.js` (`SOURCES_GLOSS`, the piece's `card` description, `STORY_TERMS_FIX`); `lib/prompt-renderers/director-words-renderer.js` (the stop notes' label, the accused line, the no-culprit line, the whiteboard); `lib/prompt-renderers/settled-weave.js` (the verdict's mark, the answers' label); the epilogue line in `lib/prompt-builder.js` `_buildInvestigationObservations`; Marcus's role and `inTheRoom` in `lib/theme-config.js`; their tests; `docs/architecture/director-words.md` and the record view's lines in `prompts.md` |
| F | `lib/workflow/nodes/evaluator-nodes.js` but for A's two tag names (`TRUTH_GROUPS`' questions and what each reads, the list of limits, `truthCriteriaSection`, `TRUTH_ONLY_EVALUATION_RULES`, `judgeSystemPrompt`, the director's-edits lines, the closing questions, the line on where Nova was); their tests; `docs/architecture/judges.md` |
| G | `SKILL.md`, `references/schemas.md` and the agents' text outside their rule lists; `__tests__/unit/journalist-skill-path.test.js`; the new scan test; `docs/PIPELINE_DEEP_DIVE.md`, `CONTEXT.md`, `CLAUDE.md`, `docs/architecture/skill.md` and `key-files.md` |

Three test files are shared by function. `weave-stage.test.js`: B has the writer's part, F the judge's. `prompt-builder.test.js`: C has the map task's lines, D the article's, E the notes' header and the session's facts. `arc-specialist-prompts.test.js`: B has all of it but the label over the notes as the judge prints it, which F checks.

## Gates

None makes a live model call. The director's next new session is the live test.

1. **The suite,** at the phase branch's head: exit 0, nothing skipped.
2. **The rule files.** Each of the eight is byte-equal to its approved file (`diff`), and R5's lint passes.
3. **The prompt renders,** with `scripts/render-prompts.js`. The render of a real session reads a copy of the database, which the integrator makes only with the director's go-ahead and when no session is running. Without it, the render runs on the stored fixture threads. Each render is checked for:
   - every writer and rework opens with the identity line, one `this-session` block, `<world>` and `<limits>`, and reads `<brief>` then its `<job-…>` once, before `<DIRECTOR_GUIDANCE>`;
   - the judges read no brief and no job text, and hold the list of limits and the read's questions;
   - no rule number in any writer's or rework's render;
   - none of the sentences of the spec's appendix B in any render;
   - the timeline's lines read "memory turned in", "name given" and "no name given";
   - each task block, label and message matches the read's "After";
   - each call's size, recorded beside phase 17's.
4. **The prompt read,** after run 2 merges and before run 3. The suite pins strings and cannot say whether a prompt works, the slices' reviewers read diffs, and the read reworded only the lines a search for rule numbers and old words found (the director, 2026-11-23: "are you considering how prompt design might be different from simple coding work in terms of reasoning required for our project?"). So each prompt is read whole, as its model meets it, by a fresh reader on Fable 5.2 at high effort: the weave writer's, the map writer's, the article writer's and the two judges', rendered from a real session with Nova outside and one with Nova in the warehouse. Each reader holds the prompt against the brief, the spec's "What the director decided" and its anti-goals, and the published method for auditing prompts, and reports every line that contradicts the brief or the limits, repeats them, speaks in the old register, could be lifted into an article, or points at something that is gone. A reader changes nothing. The integrator re-judges each finding against the director's words and reads the article writer's prompt top to bottom as well. A finding that needs new wording goes to the director as a short read before it goes in, and the change is built as a fix wave on the phase branch.
5. **The click-through,** through the mock server on a fixture thread: the map's page with a step of 25 words under each section, the section editor's label, and the over-length message at the new bounds.
6. **The docs grep.** Outside `docs/superpowers/` and `archive/`, none of the following survives in `CLAUDE.md`, the docs, the skill or the prompts: `craft-`, `truth-rules`, "T1 to T15", "C1 to C19", "reporting-mode block", "CRAFT GUIDANCE", or "story terms" as wording a writer reads.
7. **The final whole-phase review,** on Fable 5.2 at high effort (see "Seats").

The gates prove the pipeline works. The director's next new session shows whether the writing does. The readout reads the writer's last draft beside the approved article as two whole articles, against the spec's "What to watch" and its anti-goals.

---

## Brief A: the rule files and the loader

**Intent.** Every writer and judge reads the settled text, and nothing else from the rules folder, in the places the old files sat.

**Prompt.**
- R1: copy the eight approved files into the rules folder and delete the nine old ones.
- R2: the lists and the `this-session` tag in `lib/rule-set.js`, with its comments brought up to date.
- The stubs in `lib/__tests__/fixtures/rules/`: one line each for the eight, the old twelve removed.
- `TRUTH_MATERIAL`'s `modeBlock` is `<this-session>` and `truthRules` is `<limits>`.
- R15: each of the four agents' fenced lists names `world.md`, `limits.md`, its call's files and the mode file, in that order.

**Invariants.**
- R3: where each block sits in each prompt does not move.
- `world.md` and `limits.md` render byte-identical with Nova outside and with Nova in the warehouse.
- A missing or empty rule file still fails loud, naming the file and the call.
- R16: the code-built lines that cite a rule number are not touched.

**Tests.**
- Rewrite `lib/__tests__/rule-set.test.js` to R4 and R5. Keep its loader tests (unknown call, missing file, the stand-in root, the theme with no folder) on the new names.
- Move every test "Who owns which file" lists for A to the new files, tags and lists. Retire each assertion that quotes an old rule's heading or sentence, and name each in the return.
- R6: retire the "no tip" assertion.
- Re-pin the three writer renders. The core's second tag, the mode tag and each call's list all changed, so all three move.

**Verification.** With the real files on the slice's tree, print each writer's system prompt and the tail of its user prompt from a fixture state, for one session with Nova outside and one with Nova in the warehouse. Read that each opens and closes as R3 says and holds each of its files once.

**Done.** The folder holds the eight approved files. Every call reads its list. The lint and the hash pins pass. The full suite passes.

**Out of scope.** Any code-built line (B to F). The agents' text outside their lists (G).

---

## Brief B: the weave writer's prompt

**Intent.** The weave writer's task, its field list, its labels and the messages its rework reads say what the brief and its own part say, in the same words.

**Prompt.** From the read, word for word:
- part 2, "The weave writer's task": the four changed sentences of `WEAVE_TASK`;
- part 5a: every row but the sources' gloss, which is E's (the two section headings, the label over the notes and its line, the line that opens the record's section, the roster's line, the role line, the questions' format line);
- part 5b, "The weave": the field descriptions in `subagents.js` and `writer-questions.js`, and R17 for the output format;
- part 5d, first table: the weave checks' four messages (the angle count, the two on the verdict's thread, the long question). The story-terms line is E's constant.

**Invariants.**
- The page's bound, the floor and the question's bound do not change.
- The checks' logic does not change, only what their messages say.
- No field of the weave changes.

**Tests.** Update each test that pins one of these lines, with the reason. The schema-description tests that look for a rule number (`arc-specialist-prompts.test.js:510-516`) now look for its absence. Re-pin the weave writer's render.

**Verification.** Render the weave writer's prompt and its three reworks from a fixture state with the real files. Read each changed line in place against the read.

**Done.** Every line of the weave writer's prompt outside the rule files and the record matches the read, and no rule number is left in it.

**Out of scope.** The record's own words and `SOURCES_GLOSS` (E). The judges' use of the label over the notes (F checks it).

---

## Brief C: the map writer's prompt and the step

**Intent.** The map writer is asked for each section's step and given room for it, and the director reads that line under a label that says what it is.

**Prompt.** From the read, word for word:
- part 2, "The map writer's task": `mapTask` in full, with R10's numbers coming from the constants;
- part 5b, "The map": the three field descriptions in `outline.schema.json`, each in both places the beat's shape appears;
- part 5d, first table: the map checks' messages (the page's fix, the three card faults, the card count, the player on no beat, the photo placed nowhere, the director's thread on no beat) and `MAP_SEND_BACK_HEADLINE`.

**Plumbing.** R10's three bounds in `lib/map.js`, and any copy of them.

**Screen.** The section editor's label reads "Step: what the reader learns here about the question" (R10). Nothing else on the map's page changes.

**Invariants.**
- The key `job` keeps its name everywhere: the schema, the diff, the editor, stored maps.
- The map's checks keep their logic. A map that passed the old bounds passes the new.
- The card counts do not change.

**Tests.** Update each test that pins one of these lines or numbers. Add one for a map whose steps run to 25 words each and passes, one for a map in today's shape with short `job` lines that still opens, edits and passes, and one for the over-length message naming the new bounds. Where the console holds a copy of a bound, a test holds the two equal. Re-pin the map writer's render.

**Verification.** Render the map writer's prompt and its two reworks from a fixture state. Open the map's page on the mock server with a fixture map carrying 25-word steps, and read the label and the tally.

**Done.** The task asks for the step, the schema describes it, the page labels it, and the bounds are R10's.

**Out of scope.** `STORY_MAP_LABEL` and the article writer's reading of `job` (D). `STORY_TERMS_FIX` (E).

---

## Brief D: the article writer's prompt

**Intent.** The article writer's task points at the brief and its own part and repeats neither. The schema it is shown holds only what it writes. The messages its rework reads say what the limits say.

**Prompt.** From the read, word for word:
- part 2, "The article writer's task": the four changed lines of `ARTICLE_TASK`;
- part 5b: the sentence `STORY_MAP_LABEL` gains;
- part 5d, second table: the journalist's messages in `lib/content-bundle-fact-check.js`, under R9.

**Plumbing.** R13: the schema printed in `<SCHEMA>`, and the generation instruction's closing paragraph, which keeps its first sentence and loses the list of fields to leave out.

**Invariants.**
- The schema the SDK is given, the validator and the template are untouched, and a bundle that validated before validates now.
- R9: each message opens as it does today, and no check's logic or threshold changes.
- The detective's branches are untouched.

**Tests.** Update each test that pins one of these lines. Add one that the printed schema holds none of R13's properties and still holds every field the instruction names, and one that the SDK's schema is the full one. Re-pin the article writer's render.

**Verification.** Render the article writer's prompt and its rework from a fixture state. Read the task, the map's label and the printed schema in place. Run the fact check on a fixture bundle that trips each reworded message and read each message.

**Done.** The article writer's prompt outside the rule files and the record matches the read, its printed schema is R13's, and no rule number is left in it or in a message its rework reads.

**Out of scope.** The fact check's logic. The record's own words (E).

---

## Brief E: the record and the shared labels

**Intent.** What every writer and judge reads for the evidence, and the labels over the director's material, use the limits' words.

**Prompt.** From the read, word for word:
- part 3: the record's opening line, the timeline's opening line, the line for a memory turned in with and without a name, and the fallback line. The `layer` label is removed from every document;
- part 5a: what "evidence-log" means as a source (`SOURCES_GLOSS`);
- part 5b: the `card` description on a piece of evidence;
- part 5c: the nine rows that are not the judge's (the epilogue line, the two labels over the director's words, the verdict's mark, the accused line and the line after it, the whiteboard, Marcus's role, Nova in the session's facts);
- part 5d: `STORY_TERMS_FIX`.

**Invariants.**
- The record's contents and order do not change. Only its labels do.
- The label `owner` stays. `sale`, `first-burial bonus` and `transfer` stay.
- R14's lines stay as they are.
- The story-terms check keeps its logic and its internal names.

**Tests.** Update each test that pins one of these lines. Review focus 4 and 5 each get a test here. This slice moves all three pinned renders: re-pin each with its reason.

**Verification.** Render the record from a fixture bundle with a named turn-in, a guest reporter's, an unnamed one, a sale, the bonus and a transfer, and read it against the read's part 3.

**Done.** The record and the labels match the read, and "exposed", "exposure", "buried" and "anonymous" are gone from them.

**Out of scope.** Lines in `arc-specialist-nodes.js` (B). The judges' own instructions (F).

---

## Brief F: the judges

**Intent.** The judges check the limits as the director settled them. Their findings keep the codes that code and stored sessions read.

**Prompt.** From the read, word for word:
- part 4: the list of limits (R8) and each question, for the weave's judge and the article's, with today's variable parts kept (which of the director's words each judge reads);
- part 5c: the article judge's line on where Nova was, which prints "outside the warehouse" or "in the warehouse";
- part 5e: the nine rows of the judges' own instructions.

**Plumbing.** R11: what the verdict criterion reads.

**Invariants.**
- Each criterion's key, its codes and its must-pass standing do not change. T10 and T15 stay in no criterion.
- A finding still opens with its codes and a colon. `leadingRuleIds`, `LEADING_RULE_IDS`, `criteriaRules`, `guardDirectorEdits` and `withoutDirectorsFindings` are untouched.
- `createEvaluator`'s arguments do not change, so `scripts/lib/render-calls.js` does not. If they must, both change in one commit.
- The judges read no brief and no job text.

**Tests.** Update each test that pins a question or a line of the judges' instructions. The test that every criterion's description names a rule or the world (`evaluator-nodes.test.js:1877`) keeps passing on the codes. Add R8's test. Review focus 1 gets a test: a stored finding in today's form still matches its criterion and still strips at the desk.

**Verification.** Render both judges' prompts from a fixture state, once with Nova outside and once with Nova in the warehouse. Read the list of limits and each question in place against the read.

**Done.** Both judges ask the read's questions under the list of limits, the verdict question says nothing of theories, and every stored finding still parses.

**Out of scope.** The fact check's messages (D). The label over the notes (B).

---

## Brief G: the skill, the docs and the closing scan

**Intent.** The standalone skill reads what the pipeline reads, the docs describe what was built, and a test keeps rule numbers and the old words out of every writer's prompt.

**Prompt.**
- The four agents: each agent's own text keeps only what is the skill's alone, which is where its files are and what it writes back. Every pointer to a rule by number goes. Where an agent restates its job, it points at its `job-*.md` instead. The curator and the image analyzer keep reading `world.md`, by its new section names.
- `SKILL.md` and `references/schemas.md`: the rule files' names, no rule numbers, R10's bounds, the step in place of the job's old description, the validator's `rule` field as a limit's code.

**Tests.**
- `__tests__/unit/journalist-skill-path.test.js` moves with the skill's text.
- A new test renders every writer and every rework with the real rule files and holds that no render matches a rule number, an old rule tag, or a phrase R12 names. The judges are outside it.

**Docs.**
- `docs/PIPELINE_DEEP_DIVE.md`, `docs/architecture/skill.md` and `key-files.md`, `CONTEXT.md` (the brief, the limits, a section's step, each writer's part; "exposed" and "buried" as the code's words and "made public" and "sold" as the writers'), and the rules paragraph of `CLAUDE.md`.
- The roadmap: phase 18's row, the order after it (3b, then the change review), phase 17's row corrected to pushed on 2026-10-27, and "How a phase runs" brought in line with this plan's "Seats": each seat's model and effort is chosen for its work.

**Invariants.** The skill keeps its own shapes (`directorChanges`, `stopNotes`). No pipeline code changes here.

**Verification.** Gate 6's grep, run on the slice's tree. Read each agent file top to bottom as the agent meets it.

**Done.** The skill's agents read the eight files by the calls' lists, no doc describes the old rule set as current, and the scan passes.

**Out of scope.** Any pipeline prompt.

---

## Run 2b: what the writers are handed (added 2026-11-24)

The prompt read (gate 4) found that the brief is sound and that the rest of each prompt still pulls the draft the old way: the same quotation reaches the article writer five or six times, the evidence under a beat is handed over as finished quotes, leftover fields set a form, and the reworks and judges still speak in scores. The director's answer on 2026-11-24 was to fix this now, before the skill and the docs. The findings in full are in the phase workspace, `surveys/prompt-read.md`.

The work is three waves on the phase branch, between run 2 and run 3:

- **Run 2b (this section):** things taken away or moved. No sentence a model reads is new.
- **Run 2c:** the new lines, about twenty, once the director has approved each one.
- **Then** run 3 (brief G) and the gates, as planned.

### Rulings for run 2b

- **R18. No new wording.** Run 2b removes and moves. Where a clause is cut from a sentence, the brief gives the sentence that remains, word for word. A line that needs new words waits for run 2c; a seat that finds one returns NEEDS_CONTEXT naming it.
- **R19. The article writer is handed the settled angle without the evidence under its threads.** The map holds the evidence the map writer chose for each beat, so the threads' evidence is the same material a second time, plus pieces the map writer left off. The map writer, the map's rework and the article's judge still read it. One renderer, one option. *If wrong:* the article writer cannot see a piece the map left off; the record still holds its source.
- **R20. The article writer is shown the map without each beat's `kind`, and each left-out beat by its id and title alone.** The stored map, the stamp, the fact check, the judge and the page read the map whole. One function makes the map as shown, and the render script calls it. *If wrong:* a struck beat's material is one step further away, which is the point.
- **R21. The map writer is no longer asked for a beat's `kind`.** It leaves the writer's schema, which is the one schema printed and given to the SDK. A stored map that holds it stays valid at the gate and on the page, so an old thread and a map in flight are untouched, and no reader of it is left. A map printed into a rework's prompt is printed without it, by R20's function.
- **R22. The character digest leaves the article writer's system prompt**, and its rework's. The article writer has the documents themselves, and the digest carries the documents' pronouns, which the roster overrides. The weave writer keeps its own copy this run. *If wrong:* the article writer has one fewer place to read a person's job title; the record's documents give it.
- **R23. One shape for the article writer (replaces R13).** The schema the SDK is given for the article call is the trimmed schema the writer is shown. On a send-back with standing edits both carry the changed-edits field, so the printed copy and the tool always agree. The trim grows to every field the instruction's six items do not name. The previous article a rework reads is shown in the same trimmed shape. Code carries each field the writer is not shown from the previous article into the reworked one. The validator, the template, the desk and the stored bundle keep the full schema. *If wrong:* the article call's structured output breaks in a live session; the director allowed one live probe to prove it (2026-11-24), which the integrator runs after this slice merges.
- **R24. The article writer reads its own part before the brief.** `job-article` says the map already did the work on the steps, so the writer reads the brief knowing which of its work is left. The weave and the map calls keep the brief first: their own texts open on "The brief above", and changing those words is run 2c's. *This narrows what was proposed to the director ("each writer"); the integrator tells them.*
- **R25. The weave writer's prompt.** The block that prints the charge a third time is gone. The money totals the other two writers read are added after the record, and the weave's judge reads them too. The list of the game's own characters shows Blake once.
- **R26. The derived blocks.** The quote bank prints each quoted line once, with its speaker and any correction, without the notes' sentence under it. The transaction links are left out when they pair nothing. The whiteboard is left out of the weave writer's prompt when the board holds nothing. This holds in every prompt that prints them.
- **R27. A rework is shown findings, not scores.** No summary of confidence and readiness, no scores, no criterion names, no second and third copy of a fix. Each finding prints once. On a director's send-back the director's note comes first and the check's suggestions are left out, since the note is the task. The labels over the note keep today's words until run 2c.
- **R28. A judge is listed only the limits it scores.** The other limits stay in the limits' own text. The article's judge reads the director's notes under the label and the line on backstory the weave's judge already reads, and the weave's judge reads the roster block the article's judge already reads.

### Review focus for run 2b

- An old thread: a stored map with `kind` on its beats, a stored article with fields the writer is no longer shown, a stored evaluation with scores and three copies of a fix. Each still opens, reworks and publishes.
- A director's edit at the desk to a field the writer is not shown (a sidebar entry's owner) survives an automatic pass and a send-back.
- A rework whose evaluation failed a criterion and listed no issue still tells the rework what to fix.
- Every prompt a seat changes is rendered for 111326 and 101826 and read in place, top to bottom, as its model meets it.
- The print and the tool: wherever a schema is printed, it is the schema the SDK is given.

### Brief H: what the article writer is handed

**Intent.** The article writer reads each thing once, in the shape it can use, and writes into one shape.

**Layers.**
- `lib/prompt-renderers/settled-weave.js`: an option on the one renderer that leaves out the evidence under the threads (R19). In that form the intro's fourth sentence reads, in full: "The threads in the story come in the order the angle tells them." Every other sentence of the intro stays byte for byte. The article writer and its rework call it that way; every other caller is unchanged.
- `lib/prompt-builder.js`, where `<STORY_MAP>` is printed: the map as shown (R20), one exported function. `scripts/render-prompts.js` and `scripts/lib/render-calls.js` follow.
- `lib/prompt-builder.js`, `buildArticleSystemPrompt`: the roster without the character digest (R22). `rosterWithPronounsSection` already prints that form.
- `lib/prompt-builder.js` and `lib/workflow/nodes/ai-nodes.js`: R23. The trimmed schema is one derivation with one list; the SDK call, the rework call, the printed `<SCHEMA>` and the shown previous article read it. The carry is one pure function, driven by the same list, that matches a sidebar entry by its document id, a photo block and the top photo by filename, and copies a field only where the reworked article lacks it.
- `lib/rule-set.js`: `RULE_SET_CALLS.article` is `job-article` then `brief` (R24).
- Left from run 2: the tags named in `ARTICLE_TASK` take backticks, as `mapTask`'s do; the three lists of fields the writer is not shown are one.

**Tests.** The option on the settled weave, with and without evidence; the map as shown (no `kind`, a left-out beat as id and title, the stored map unchanged); the system prompt holds no digest; the SDK call's schema equals the printed schema on a first write, on an automatic rework and on a send-back with standing edits; the carry on a bundle whose sidebar entry holds a desk-written owner, through an automatic pass and a send-back; a stored bundle with every untrimmed field still validates; the order of the article call's rule files.

**Invariants.** The director's edits are final: nothing here changes what `settleEdits` puts back. The judge reads what it read. No check's logic changes. `config.configurable.contentBundleSchema` still overrides the call's schema in tests.

**Verification.** Render 111326 and 101826. In the article writer's prompt: count the lines of evidence under the weave's threads (none), the quotations under `leftOut` (none), `"kind"` among the beats (none), the digest's heading in the system prompt (absent), and the order of the brief and the writer's part at the end. Compare the printed schema with the call's schema by a script. Read the whole prompt once, top to bottom.

**Done.** The counts above hold on both sessions, the schema is one, the suite is green and `article-journalist` is re-pinned with its reason.

**Out of scope.** The Blake block and the quote bank's label, the block types offered, a section's `type`, the line above the headline: each needs the director.

### Brief I: what the weave writer is handed, and the derived blocks

**Intent.** The weave writer is not told the verdict a third time, has the totals the limits say the record gives, and every prompt carries each quoted line once.

**Layers.**
- `lib/workflow/nodes/arc-specialist-nodes.js`: the heading "Primary Investigation Focus" and its line go (R25). The money totals print after the record, through the builder the map writer's prompt uses, so the block is byte-equal to the map writer's for the same session. `buildCharacterCategoriesBlock` lists the game's own characters without aliases, as `generateRosterSection` does. The whiteboard is left out when the board holds nothing, by the renderer's own option.
- `lib/prompt-renderers/director-notes-renderer.js`: `quoteEntry` prints the line with its speaker and addressee, and the correction when one applies; the "In the notes" line goes (R26). The transaction links are left out when no link pairs a sale.
- `lib/prompt-renderers/record-view.js`: a logged turn-in name that says "anon" prints as "no name given" (the ledger's ruling after run 2).
- The weave's rework: where the rework is told to list changed edits, its printed format shows the field, in the words the call's schema already gives it.
- Left from run 2: the "(C9)" strip in `lib/__tests__/arc-specialist-prompts.test.js`.

**Tests.** The weave prompt holds the charge under the accusation alone; the money block equals the map writer's; Blake once; a quote entry's lines; links with and without a pairing; the turn-in name; the rework's format. The grounding of a quote's speaker (`groundQuote`) is unchanged and its tests stay.

**Invariants.** No label's words change. The record's order and the notes block are untouched. A quote's speaker is decided as today.

**Verification.** Render 111326 and 101826: the weave writer's prompt, the map writer's and the article writer's, and both judges'. Count how many times one quoted line of the notes stands in each prompt, before and after. Read the weave writer's prompt once, top to bottom.

**Done.** The weave prompt holds no third copy of the charge and holds the totals; the quote bank holds each line once in every prompt; the suite is green; the moved pins carry their reasons.

**Out of scope.** What the Blake block and the quote bank are for (their labels), the page arithmetic in the weave task, the capital-letter line on group memberships, the parsed reasoning.

### Brief J: the map writer is not asked for a beat's kind

**Intent.** The retired "a scene, then the evidence" no longer survives as a field the map writer fills.

**Layers.**
- `lib/schemas/outline.schema.json` and `lib/map.js`: `kind` leaves the writer's schema (R21), in a section's beats and in the left-out beats. The director-side schema, the payload gate and `console/outline-edit-logic.js` still accept a stored map that holds it, and the corpus tests that hold the gate and the console equal still pass.
- The map's top-level description in the schema is cut to its first sentence: "The story map: the settled weave laid across the article's sections."
- The map's rework reads the previous map without `kind`, by brief H's function when it has merged; until then, by a local helper the integrator folds into it.
- Left from run 2: the stale bound comments and the test of a stored map.

**Tests.** The writer's schema holds no `kind`; a stored map with `kind` passes the gate and the console's validator; a rework of such a map returns and settles with the director's edits put back.

**Invariants.** A stop's gate and the console decide alike. The map's page is unchanged.

**Verification.** Render the map writer's prompt and the map's rework for 111326 and 101826: no `"kind"` in the schema or the previous map. Open a stored map of the old shape through the gate on the database copy's data, with no model call.

**Done.** The above holds, the suite is green, `outline-journalist` is re-pinned with its reason.

**Out of scope.** The slots' usual order and headings, the connection requirement, the players field's description, the shape of a left-out beat: each needs the director.

### Brief K: what a rework is shown

**Intent.** A rework reads what to change, once, and the director's note first when the director sent it back.

**Layers.** `lib/workflow/nodes/node-helpers.js`, the revision context:
- The evaluation prints as its findings alone (R27): the must-fix lines under today's heading, and the suggestions under theirs on an automatic pass. The summary, the scores line, the criteria's scores and the judge's guidance text no longer print. A code check's lines print as today.
- When an evaluation failed a criterion and lists no must-fix line, the failed criteria's fixes print as the must-fix lines, without a score or a criterion's name.
- A judge's finding prints the limit's name where the stored finding holds its code (from `LIMIT_CODES`). The stored finding and its parsing are untouched.
- On a director's send-back the note's block comes first, then the findings, the director's edits and the scope. The suggestions are left out of a director's round.
- The scope's sentences keep their words. Clauses that name a list no longer printed drop out by their own conditions, and "unless an issue to address needs it changed" prints only when a must-fix line prints.
- Constants no line reads any longer are removed.

**Tests.** An automatic pass after a failed evaluation; one after a code check; a send-back after a passed evaluation; a send-back with open findings; the story meeting's two rounds and the map's, which print as today apart from the above; a stored evaluation of the old shape.

**Invariants.** The director's edits block and its rules are untouched. What the judges are asked for is untouched. Each scope sentence that still prints is byte for byte.

**Verification.** Render every rework for 111326 and 101826 and read each revision context top to bottom. No score, no criterion's name, no "Ready", and each finding once.

**Done.** The above holds and the suite is green.

**Out of scope.** The words of the note's label and the banners (run 2c), what the judge is asked to write as a fix (run 2c), the first-write task a rework also reads.

### Brief L: the judges read what they score

**Intent.** Neither judge is listed a limit it has no question for, and the two read the same notes the same way.

**Layers.** `lib/workflow/nodes/evaluator-nodes.js`:
- Each judge's list of limits holds the codes its own criteria name, in the limits' order (R28). `LIMIT_CODES` and its export stay whole.
- The article's judge reads the director's notes under the label and the backstory line the weave's judge reads, from one constant.
- The weave's judge reads the roster block the article's judge reads, and the money totals the weave writer now reads (R25), each from the function the other judge calls.
- `scripts/lib/render-calls.js` follows in the same commit.
- Left from run 2: the two lines of `docs/architecture/judges.md`.

**Tests.** Each judge's list against its criteria's codes, held by a test that derives both; the notes' label in both judges; the roster and the totals in the weave's judge.

**Invariants.** The questions' words, the pass mark, the output's shape and the parsing of findings are untouched.

**Verification.** Render both judges for 111326 and 101826 and read each top to bottom.

**Done.** The above holds and the suite is green.

**Out of scope.** What a weave is to its judge, what a fix may hold, what doubt means, the settled lines, one statement of the director's words: all run 2c.

### Seats for run 2b

| Slice | Builder | Reviewer | Why |
|---|---|---|---|
| H | Opus 5.5, high | Fable 5.2, high | R23 changes the shape of a live call and adds a carry on the rework path; a mistake reaches a session |
| I | Opus 5.5, medium | Opus 5.5, medium | several renderers, each change small and checked by a render |
| J | Opus 5.5, medium | Opus 5.5, medium | a schema, a gate and the console held equal by corpus tests |
| K | Opus 5.5, high | Opus 5.5, high | one function with many branches, each a different kind of rework |
| L | Opus 5.5, medium | Opus 5.5, medium | lists and blocks moved between two prompts |

The verifier is Sonnet 5.5 at medium, a fixer runs one step above the attempt that failed, and a re-review is Opus 5.5 at medium, as in run 2.

---

## Run 2c: the approved lines (added 2026-11-24)

Run 2b is merged. The director read the new lines on 2026-11-24, corrected the integrator twice, and approved the corrected page. The wording is in `docs/superpowers/specs/2026-11-24-phase-18-run-2c-wording.md`, each line as it is and as approved, and the four changed rule files are in the approved-text folder. This run puts them in.

Two of the director's corrections bind every seat:

- **Judge a change by the whole pipeline.** A line is read by more than the writer it sits in front of: a later writer, a check, a judge, and the director at a stop. Before a line changes, know who else reads it.
- **The spec's non-goals hold.** What a piece of evidence holds is not changed in this phase.

### Rulings for run 2c

- **R29. The wording doc is the read for this run.** Every "Approved" line goes in word for word. Nothing else a model reads changes. A line that cannot be built as written comes back as NEEDS_CONTEXT.
- **R30. R28's shorter lists are withdrawn.** Each judge lists the fifteen limits, as the spec's section 7 says. Run 2b's other changes to the judges stay: the notes' label, the roster block and the money totals.
- **R31. One rule for a beat's kind, in two forms.** The strip of `kind` is its own exported step. The map as the article writer is shown it builds on that step and then cuts each left-out beat to its id and title. The map's rework calls the first form, since it hands back a whole map. Slice J's local helper goes.
- **R32. The line above the headline is untouched** until the director gives its words.
- **R33. The stock headings stay in the theme's config** for whatever else reads them. Only the map writer's prompt stops printing them. Each slot's description lives with the slot in the config, once, and the prompt prints it from there.
- **R34. The two blocks no longer offered** leave the generation instruction and the schema the writer is shown and given. The validator, the template and a stored article keep both. A rework of a stored article that holds one cannot hand it back; no session of the last three holds one, so that is a known rare case.
- **R35. A question's `reads` follows its words.** Where a question now says "the director's words", it reads every block of the director's words that judge's prompt holds.
- **R36. The note's block ends without its NOTE lines.** Whatever found the end of the director's words by them finds it another way, held by a test.
- **R37. The probe.** The integrator runs the one live call the director allowed against the merged run 2b. Its result is in the ledger. No seat makes a live call.

### Review focus for run 2c

- Every approved line compared with the wording doc word for word, in the rendered prompt and not only in the diff.
- Each prompt a seat changes rendered for 111326 and 101826 and read top to bottom, as its model meets it.
- For each changed line: who else reads it. The roster block, the derived labels and the settled angle's intro are printed to several writers and to the judges.
- A theme that prints no pronouns still gets a roster block that reads whole.
- A judge's findings still parse: codes, criteria, the director's-edits guard.

### Brief N: the rule files, and the weave and map writers' lines

**Intent.** The four changed rule files are the approved ones, and the two planning writers' own lines read as approved.

**Layers.**
- The rules folder: `world.md`, `limits.md`, `brief.md` and `job-map.md` copied from the approved-text folder, and their hashes re-pinned in `lib/__tests__/rule-set.test.js`. The stubs the pinned renders use are untouched unless a test forces it.
- `lib/prompt-builder.js`, `<SLOTS>` in the map writer's sections, and `lib/theme-config.js`: the wording doc's part 2 and R33.
- `lib/schemas/outline.schema.json`: a beat's players, part 2, in a section's beats and in the left-out beats.
- `lib/workflow/nodes/arc-specialist-nodes.js`: the task's opening and the connection's evidence, part 4. The label over the sentences about Blake is slice O's constant.

**Tests.** The rules folder byte-equal to the approved folder, by a test or by `diff -r` in the verification; the slot list as approved; the players' description; the weave task's two lines; every test that held the old words moved to the new.

**Invariants.** The bound on the weave's page and its check are unchanged. The map checks are unchanged: the players' line is a description, and the check still reads who is placed from it. The console's map page is unchanged.

**Verification.** Render the weave writer's and the map writer's prompts for 111326 and 101826 and read each top to bottom.

**Done.** The approved lines stand in the renders word for word, the suite is green, the moved pins carry their reasons.

### Brief O: the article writer, and the blocks every prompt shares

**Intent.** The article writer knows what the settled angle's lines are, is not handed the sentences about Blake again, and is offered only the blocks an article uses. The blocks every prompt shares speak in the limits' manner.

**Layers.**
- `lib/prompt-renderers/settled-weave.js`: the wording doc's part 3. The two shared sentences print for every reader of the settled angle; the four for the article print with the form that has no evidence under the threads.
- `lib/prompt-builder.js`: the list of names (part 5), in the one function every writer and judge prints it from; the block of sentences about Blake gone from the article writer and its rework (part 6); the two block types gone from the generation instruction and from the writer's schema (part 6, R34); R31's two forms.
- `lib/workflow/nodes/ai-nodes.js`: the map's rework calls R31's first form.
- `lib/prompt-renderers/derived-labels.js` and `director-notes-renderer.js`: the three labels, the label over the sentences about Blake, and the line over the quoted lines (parts 4 and 5).

**Tests.** Each approved line; the article writer's prompt without the Blake block and the weave writer's with it under the new label; the writer's schema without the two block shapes and the full schema with them; a stored article that holds one still validates; R31's two forms from one rule; a theme with no pronouns.

**Invariants.** The printed schema equals the schema the SDK is given, on all three kinds of call. The carry is unchanged. The judges read the settled angle with its evidence.

**Verification.** Render all eleven prompts for both sessions. Read the article writer's top to bottom. For the shared blocks, read each in every prompt that prints it.

**Done.** The approved lines stand in the renders word for word, the suite is green, the moved pins carry their reasons.

### Brief Q: the judges, the note in a rework, and the whiteboard lines

**Intent.** A judge knows what the director's words are, what a breach is, what its fix may hold, and what it is reading. A rework reads the director's note under its own name.

**Layers.**
- `lib/workflow/nodes/evaluator-nodes.js`: the wording doc's part 7, and R30 and R35. `scripts/lib/render-calls.js` follows in the same commit.
- `lib/workflow/nodes/node-helpers.js`: the note's block, part 8 and R36.
- `lib/content-bundle-fact-check.js`: the two whiteboard lines, part 8.
- Left from run 2b: the tests that build their expected text with the function under test take a literal.

**Tests.** Each approved line; each judge's list holds fifteen; the first question names the fixed facts' code among its codes; a finding that opens with that code is read as that question's; the note's block at each stop; the scan that reads the end of the director's words.

**Invariants.** The pass mark, the output's shape and the parsing of findings are untouched. The scope sentences of a rework are byte for byte.

**Verification.** Render both judges and every rework for both sessions and read each top to bottom.

**Done.** The approved lines stand in the renders word for word and the suite is green.

### Seats for run 2c

| Slice | Builder | Reviewer | Why |
|---|---|---|---|
| N | Opus 5.5, medium | Opus 5.5, medium | copied files and four lines, each checked by a render |
| O | Opus 5.5, high | Fable 5.2, high | the writer's schema again, and blocks that five prompts share |
| Q | Opus 5.5, high | Fable 5.2, high | the judges decide what is reworked; a wrong word changes what passes |

The verifier is Sonnet 5.5 at medium, a fixer is Opus 5.5 at high, and a re-review is Opus 5.5 at medium.

### After run 2c

A second prompt read, by fresh readers on Fable 5.2 at high, of the prompts as built. This time the integrator walks each finding through the whole pipeline before it becomes a proposal. Then run 3 and the gates.

---

## Run 2d: the line above the headline, and the desk's flags (added 2026-11-24)

Two decisions of the director's on 2026-11-24, each a small slice.

### Rulings for run 2d

- **R38. The line above the headline is the theme's, and code prints it.** The director's words for it are "NovaNews Investigates". It lives in the theme's config. The article writer is no longer asked for it: the generation instruction's fourth item loses the field, and the field joins the ones the writer is not shown. A first write is stamped with the theme's line. A rework carries the line the previous article held, as it carries every field the writer is not shown, so a line the director typed at the desk stands and an old thread's line stays until the director changes it. The desk still edits it and the template still prints it.
- **R39. The desk says what a send-back acts on, and a suggestion can be added to the note with one press.** Since run 2b a director's send-back shows the rework the director's note and the must-fix findings, and not the fact check's suggestions. The director's requirement: "if the person running the report pipeline needs to copy paste the fact check suggestions that they want to include in the rework in their note, that needs to be made explicitly clear in how the suggestions are presented to the user", and, shown a mock-up, "yes, build it with the button".

### Brief R: the line above the headline

**Intent.** Every article carries the same line above its headline, and no model writes it.

**Layers.**
- `lib/theme-config.js`: the journalist's line, "NovaNews Investigates".
- `lib/prompt-builder.js`: the generation instruction's fourth item reads `4. "headline": {"main": "...", "deck": "..."}: the headline and the deck as the task above gives them.` The field joins the list of fields the writer is not shown, so the writer's schema, the previous article a rework reads and the carry all follow from the one list.
- `lib/workflow/nodes/ai-nodes.js`: the stamp that puts the map's headline, deck and top photo on a first write also puts the theme's line above the headline.

**Tests.** A first write carries the theme's line whatever the writer returned; a rework keeps the previous article's line; a line the director typed at the desk survives an automatic pass and a send-back; the printed schema equals the call's schema on all three kinds of call; a stored article with a line of its own validates and prints.

**Invariants.** The director's edits are final. The desk's editor for the headline is unchanged. No other field of the headline changes hands.

**Verification.** Render the article writer's prompt and its rework for 111326 and 101826: the word for the field stands nowhere in the instruction or the printed schema.

**Done.** The above holds, the suite is green, `article-journalist` is re-pinned with its reason.

### Brief S: the desk says what a send-back acts on

**Intent.** At the desk the director can tell which marks a send-back acts on, and can ask the writer for a suggestion without copying it by hand.

**What the director sees.**
- Each mark labelled "Fact check, advisory" has a button, "Add to note". Pressing it adds one line to the note box: the mark's words as the desk shows them, then the piece it sits beside, in the words the desk already uses to name a piece. The director can edit the line. While the note holds that line, the button reads "In the note" and does nothing. No other kind of mark has the button.
- Under the note box's existing line, when the desk holds at least one mark labelled "Fact check", "The judge could not fix this" or "Fact check, advisory", this line: `Send back acts on this note, and on the marks labelled "Fact check" or "The judge could not fix this". It leaves a "Fact check, advisory" mark alone: fix that one yourself here, or press its "Add to note" button to ask the writer for it.`
- The desk's line about the director's own edits, which shows when the desk holds an edit, changes. Now: `Your hand edits are sent with this note. The writer is told to keep them.` Built: `Your hand edits are sent with this note. The writer is told to keep them, so a mark on a piece you have edited is not acted on either. Fix it yourself.`

**Layers.**
- The logic in a dual-export module, pure and node-tested: the note line for a mark, the note with that line added, whether the note holds it, and whether the scope line shows.
- `console/components/checkpoints/Article.js`: the button in a mark's row and the line under the note box, as a thin consumer. A press changes the note box as typing does, so it disarms an armed send-back.
- `console/console.css`: the button, in the desk's existing manner.

**What the first builder traced (2026-11-24), which the two lines now say.** A send-back at the desk always carries a note, so it is a director's round: the rework is shown the note, then the must-fix findings, and no suggestion. Every mark labelled "Fact check" or "The judge could not fix this" is among those findings, with one exception. Once the director edits a piece at the desk, the piece is the director's text, and a finding that quotes three or more words of it is withheld from the rework (`withoutDirectorsFindings` in `lib/workflow/nodes/node-helpers.js`): the director's edits are final. The mark stays beside the piece while the quoted words do, or folds under "Possibly resolved by your edits". The second line above covers that case. Nothing in the pipeline changes for it.

**Tests.** The pure functions: a mark beside a paragraph, one beside a card, one beside no piece; a line added once and not twice; an edited note; a desk with no advisory mark shows no line.

**Invariants.** No control drops what the director typed: the button only adds to the note. The marks themselves, their labels, their order and their places are unchanged. The payload the desk sends is unchanged: the note is the note.

**Verification.** The node tests. The wiring is the integrator's click-through, since the console has no DOM harness: say in your return exactly what to click and what should happen.

**Done.** The above holds and the suite is green.

### Seats for run 2d

| Slice | Builder | Reviewer | Why |
|---|---|---|---|
| R | Opus 5.5, medium | Opus 5.5, medium | one field through a derivation run 2b built and tested |
| S | Opus 5.5, medium | Opus 5.5, medium | a small page change with one claim that must be traced before it is printed |

S runs beside run 2c, since it touches only the console. R runs after slice O merges, since both touch the generation instruction and the writer's schema.

---

## Run 2e: four rewordings and the leftovers (added 2026-11-24)

Run 2c's reviewers found four approved lines that were right for one reader and loose for another. The director approved a rewording of each. They are the wording doc's part 9.

### Brief T: the four rewordings

**Intent.** The four lines read true for every reader they are printed to.

**Layers.**
- `lib/prompt-renderers/derived-labels.js`: the label over the paired sales, the last sentence of the label over the summary of the characters, and the first sentence of the label over the sentences about Blake.
- `lib/prompt-builder.js`: the line about played characters in the list of names.
- `lib/prompt-renderers/settled-weave.js`: the sentences for the article writer.
- Left from run 2c: `<SLOTS>` fails loud for a slot with no description; the article builder's unused argument for the sentences about Blake goes, with its call sites; the removed-phrase fixture no longer strips a block no article prompt holds; `docs/architecture/map.md` names the kind strip where it now lives, and `director-words.md` describes the labels as built.

**Tests.** Each approved line word for word; the tests that held the old words moved.

**Invariants.** Nothing else a model reads changes. The theme with no pronouns still drops the whole line about played characters.

**Verification.** Render all eleven prompts for 111326 and 101826 and read each changed line in every prompt that prints it.

**Done.** The approved lines stand in the renders word for word, the suite is green, the moved pins carry their reasons.

Seats: builder Opus 5.5 at medium, reviewer Opus 5.5 at medium.

---

## Run 2f: the lines the director approves on the map are locked (added 2026-11-24)

### What was found

Run 2c's line for the article's judge says the headline, the line under it and each section's heading "were settled" on the map and that the writer "prints them as given", and tells the judge to report a problem in one as a concern. The code did not make that true. The stamp puts the map's headline and the line under it on the first draft and nothing holds them afterwards, and no code holds a heading at all. Only a line the director typed or changed on the map was recorded as the director's at the article stop. Any other one stayed the writer's, so a judge's finding in it sent a rework with two instructions that pull apart (print these lines exactly as the map gives them; fix this line), and the rework could rewrite a line the director had approved. With run 2c's line the judge would file such a finding as a concern, and the verdict keeps only concerns about a director's edit, so it would be dropped.

The director's decision on 2026-11-24: "B, lock them once I approve the map".

### Ruling

- **R40. A line on the approved map is the director's line at the article.** The stamp records the map's headline, the line under it and each section's heading as the director's lines at the article stop, whoever wrote them, and stamps the headings onto the first draft as it stamps the other two. Everything that follows is what the director's lines already get, with no new rule: an automatic pass that changes one has it put back, a judge's finding located in one is a concern shown on the desk and holds no rework, and a send-back whose note asks for a new one may change it and says why. The top photo's rule is unchanged: it is the director's line only where the director chose it on the map. *If wrong:* the stamp's one list.
- **R41. The guard reads a limit's name as its code.** Run 2c's line tells a judge to open a concern "with the edit's id and then the limit it concerns", and a judge may write the limit by name. The guard read only a code or a criterion's name, so such a concern would not cover its criterion and a rework would be sent about the director's own line. The guard reads a name through `LIMIT_CODES`. No word a model reads changes.

Run 2c's line for the article's judge stays as built. With R40 it is true: each of the three kinds of line is listed to the judge among the director's edits, with an id, and the block over that list already says how a concern is written.

### Review focus for run 2f

- The whole path with no line edited on the map: first write, the judge, an automatic pass, the desk, a send-back whose note leaves the headline alone, a send-back whose note asks for a new one.
- The same path where the director edited one of the lines on the map, which must behave exactly as before.
- A thread stamped before this change: its standing edits are as they were, and nothing treats its headline as locked or errors for want of the new records.
- What the desk shows: no new mark when nothing is wrong; a concern beside the line when the judge has one; the edit report after a pass.
- A finding that quotes a heading to name its section is still read as naming the section, as today.

### Brief U: the lock, and the guard's reading of a limit's name

**Intent.** Once the director approves the map, no automatic pass changes its headline, the line under it or a section heading in the article, and a judge's problem with one reaches the director at the desk.

**Layers.**
- `lib/workflow/nodes/ai-nodes.js`, `stampFromMap`: R40. A section's heading is stamped by the section's slot: the map's heading where it has one, and no heading where the map's is empty. A section of the draft with no section of the map behind it is left as the writer wrote it. The stamp's note is rewritten to say what it now does.
- `lib/workflow/nodes/evaluator-nodes.js`: R41, and nothing else of the guard.
- Left from run 2c: one derived assertion that every code a question cites is one of its criterion's codes; the clause of `docs/architecture/judges.md` that still gives the old question.

**Not touched.** `lib/hand-edit-diff.js`, `settleEdits`, the rules over the director's edits in a prompt, the desk's labels. The lock is built by recording the lines where the director's lines are already recorded, and by nothing else.

**Tests.** Through the article stage with the mock writer and judge, on a map whose three kinds of line the director did not edit: the first draft carries the map's headings; the article stop's standing edits hold the headline, the line under it and each heading that is not empty; an automatic pass that rewrites each has it put back; a judge's finding located in the headline or the line under it is a concern in the verdict and holds no rework; a concern the judge writes with a heading's edit id is kept; a send-back whose note asks for a new headline changes it and reports why; one whose note does not leaves it. The same on a map where the director edited the headline: as before. A thread stamped before the change. R41: a concern that names its limit by name covers its criterion, for each limit a criterion scores.

**Invariants.** The director's edits are final. The top photo's rule. The first draft's other stamps (the line above the headline). The judge's prompt holds no new word: it gains only entries in the list of the director's edits.

**Verification.** No stored session was stamped this way, so the renders of 111326 and 101826 will not show it. Build a thread in a scratch script through the real nodes with the mock SDK, and print the article rework's prompt and the judge's: read the list of the director's edits in each. Then say, from the console's code, what the desk shows for such a thread with no finding, and with a concern about the headline.

**Done.** The above holds and the suite is green.

**Seats.** Builder Fable 5.2 at high, reviewer Fable 5.2 at high in a fresh context: this is the code that protects the director's edits.
