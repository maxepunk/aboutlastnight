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
