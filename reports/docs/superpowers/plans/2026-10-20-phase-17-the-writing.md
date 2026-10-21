# Phase 17: the writing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling, the roadmap's "How a phase runs"): an implementer reads the code and writes their own, test first.

**Goal.** The article writer's unsteered draft reads as one cohesive story in Nova's voice. To get there, the voice is described as Coffeezilla's way of working a case. The headline, the deck and the section headings are written in it where they are born, and the article writer's job is framed as writing the article from the map as its plan. The judges ask what T1 and T14 are for, each guest reporter is held apart, and the standalone skill follows.

**Spec.**
- The authority is `docs/superpowers/specs/2026-10-18-the-writing-design.md` (commit `e20533cb`, with the identity line and the map's order brought in line with the read in this plan's commit).
- The rule text is `rule-text-read.md` in the phase's workspace (`.superpowers/sdd/2026-10-18-phase-17/`, at the repository root). The director approved it on 2026-10-20, with the note that being in the room doesn't mean a player saw everything. Its addendum (items a to g), written after the surveys, goes to the director with this plan.
- The code footprint is `surveys/text-footprint.md` and `surveys/guests-and-skill-footprint.md` in the same workspace, with file and line at `e20533cb`. `surveys/reweave-pages.md` is the measurement of design section 7.
- The vocabulary is `CONTEXT.md`'s, as slice A amends it.

**Builds on.** Local `main` at `e20533cb`. The phase branch, `feat/phase-17`, is cut from this plan's commit. `main` is ahead of origin, and the push is the director's.

**Architecture.**
- **The rule files** describe the voice (C12) instead of naming six writers. C4 asks every sentence to say something, C16 frames the article writer's part as writing the article, and T1 and T14 say how an opinion and a game rule are handled without a form to fill.
- **The writers' instructions.** The arc writer and the map writer read C12, for the lines that print. Every writer reads its craft files in one order, with telling and voice last. The article writer's task opens on one cohesive story, and the map writer's task names the deck and the headings as its only prose.
- **The judges' two questions** (`evidenceTruth`, `fictionTruth`) ask whether a line states as fact what the record cannot back, and whether a rule of the game is stated. They no longer ask for a mark.
- **The guest reporters** become a list read through one function, from the parse's stamp to every reader. An older thread's single comma-joined value is read apart.
- **The skill** follows the pipeline, last.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.296 (Opus 5.5, Sonnet 5.5, Haiku 5.5), Express, a React-via-CDN console, Jest.

## Global constraints

**Authority.** The spec decides, and the plan argues from it. A conflict neither settles goes to the integrator, who rules and records the ruling in the ledger (`progress.md` in the workspace), with its cost if wrong.

**The rule text** goes into the rule files, the code-built lines and the schema word for word, as `rule-text-read.md` and its addendum give it. The read's notes to the director (session names, quotes, the "Why the change" lines) stay out of every file a model reads. No example passage from any session enters a prompt (design, "What the director decided").

**The director's words are never changed.** Notes, corrections, edits, answers, the accusation, the epilogue and photo descriptions reach every call as written.

**The director's edits are final** (phase 4 spec, section 7, as built). No change here touches `lib/hand-edit-diff.js` or `settleEdits`.

**Story terms** (piece 1, unchanged). The planning lines hold no quotation from the record, no figure, no clock time and no document id. The story-terms check keeps its scope: an angle's headline (`lib/weave.js:828-829`) and the map's headline, deck and headings (`lib/map.js:1034-1035`) stay exempt, and every other line stays scanned.

**Model-facing text.**
- Load `mattpocock-skills:writing-for-agents` before writing any text a model reads: a prompt line, a schema description, a judge's question, an agent file.
- State each target positively and each rule once. A code-built line names the rule item it applies and never restates it.
- No em-dashes. Nova is never gendered.
- The skill's files (SKILL.md, `references/schemas.md`, the agents) carry no "receipt" or "material" (`__tests__/unit/journalist-skill-path.test.js:251-261`). The rule files may.

**Themes.** No code names Nova (theme-config's R4 comment). Text that names Nova comes from `lib/theme-config.js`: the identity lines, and the writer entry's `name` for the guest reporter's line. Only the journalist runs; the detective stays parked.

**Modes and guests.**
- World.md and the truth rules render byte-identical in both modes (`lib/__tests__/prompt-builder.test.js` :385-391).
- A session with no guest reporter prints nothing new. A session with one prints as today except the guest reporter's line, which takes the read's §14 wording.

**No other changes.**
- No model, effort or pin change. No npm install, update or ci; if a step seems to need a package, stop and report it.
- No new check, judge criterion or score on the writing: the judges stay truth-only.
- The story meeting's page is unchanged; design section 7 is measured only (`surveys/reweave-pages.md`).
- No stop's page changes beyond the start form's help line and the input review's session panel (D).

**One source of truth.**
- `RULE_SET_CALLS` is the one list of each call's craft files. The skill's agents follow it, held by `lib/__tests__/retired-craft-files.test.js`.
- `guestReportersOf` is the one reading of the guest reporters. The console keeps its copy only because it cannot import `lib/`, and a test holds the two equal.

**Replays.** A replay never re-runs a paid call on output already judged or acted on. The rule files and prompts are read at call time, so a thread picks up this phase at its next writer or judge call.

**Console.** Logic that decides a line goes into the dual-export pure modules (`console/input-review-logic.js`), with node tests. Components stay thin.

**Tests.**
- No live model calls; Jest maps the SDK to its mock. Each brief's Verification runs with no model call.
- Every commit passes the full suite, exit code guarded. Counts fall only by the tests a brief retires, and the brief's return names each one.
- Tests that pin today's text break by design. The slice that changes the text updates them with the reason, and re-pins any hash it moves (`lib/__tests__/writer-prompts-pinned.test.js`, each with its reason and length delta in the header comment).
- No test reads `data/`. A test in a real session's shape uses invented names and text, because the repo is public.

**What the integrator owns.** The removed-phrase list (`lib/__tests__/fixtures/removed-phrases.js`, R7); recomposing a hash two slices moved; the workspace's `global-constraints.md`, `progress.md` and each run's interfaces file; the roadmap; the gates.

**Docs.** Each slice updates the lines of `docs/architecture/*.md` that describe what it changes, as "Who owns which file" lists them. Slice A writes `CONTEXT.md`'s entries. Slice E updates the skill, `docs/PIPELINE_DEEP_DIVE.md` and the runbook. The docs grep is a gate.

## Rulings

- **R1. The rule files.** The read's changes 1 to 10 and addendum items b, c and d, word for word:
  - craft-voice.md, whole (§1, with addendum b in its last paragraph);
  - craft-form.md: C5's new first sentence (§2), C2's two phrases (§5) and its Why's clause (c);
  - craft-telling.md: C4's heading, body and Why (§3);
  - craft-story.md: C16's article writer part, its "says it once" line and its Why sentence (§4), and line 19's clause (d);
  - truth-rules.md: T1 and its Why (§6), and T14's sentence (§7);
  - craft-material.md: C11 (§8);
  - world.md: the guest reporter's bullet (§9);
  - mode-remote.md (§10).
- **R2. The craft lists** (read §17, addendum g), in `lib/rule-set.js`:
  - `ARC_CRAFT`: story, form, material, judgement, questions, voice;
  - `OUTLINE_CRAFT`: story, form, material, judgement, cards, telling, voice;
  - `ARTICLE_CRAFT`: story, form, material, judgement, cards, questions, telling, voice.

  The comments at `rule-set.js:12-18, :41-58` say the new order and cite this phase's spec. The phase 4 spec's section 11 table stays as history, and comments and tests stop naming it as the lists' source. The three agents' rule lists change in the same commit, because `retired-craft-files.test.js:124-128` derives its expectation from `RULE_SET_CALLS`.
- **R3. The code-built lines**, word for word:
  - `ARTICLE_TASK`'s opening and last line (§11). The lines between are unchanged.
  - `mapTask`'s opening (§12, as addendum a words it).
  - `STORY_MAP_LABEL`'s "can be told from" (§13).
  - `identities.article` (§16).
  - `lib/schemas/outline.schema.json`'s description (`:5`) and the evidence field's description (`:76`, `:137`) (addendum e).

  The comments that describe the tasks (`prompt-builder.js:515-518, :535-544`) follow.
- **R4. The judges' questions** (§15), in `TRUTH_GROUPS` (`lib/workflow/nodes/evaluator-nodes.js`):
  - `evidenceTruth`'s T1 clause (`:227`, one template both judges ask);
  - `fictionTruth` (`:346`, the article judge only).

  The comment at `:216-218` and the comments in the tests that restate it follow.
- **R5. Each guest reporter apart.**
  - **The one function.** `guestReportersOf(sessionConfig) → Array<{name, firstName, role}>` lives in `lib/prompt-renderers/session-authors.js` and replaces `guestReporterOf`. It reads `sessionConfig.guestReporters` when that is an array of `{name, role}`. Otherwise it reads the older `sessionConfig.guestReporter` object:
    - the name is split on commas, each piece trimmed with inner whitespace collapsed, and blank pieces dropped;
    - the role is split on commas and paired by position when the counts match. Otherwise each reporter takes the role whole, trimmed.

    A missing or blank name gives `[]`. Each entry's `firstName` is the first word of its name.
  - **The stamp.** The parse (`input-nodes.js:631`) stamps `sessionConfig.guestReporters` as `[{name, role}]`, read from `rawSessionInput.guestReporter` through the function, and no longer stamps `guestReporter`. The file on disk carries the list. The rehydration from disk (`fetch-nodes.js:213-239`) needs no change, since the function reads either shape.
  - **The start form** keeps its two fields. Its help line becomes: "Leave Name blank to omit. Separate two reporters with a comma, and give their roles in the same order. Role defaults to "Guest Reporter" if blank."
  - **Every reader reads the function:** the line, the mark, `SESSION_FACTS`, the weave writer's section, both judges, the timeline and the evidence check (survey R1 to R9). So do the five that bypass it today:
    - the byline instruction (`prompt-builder.js:1010-1012`);
    - the fact check's head count (`content-bundle-fact-check.js:1786-1799`, which drops its own first-name split);
    - the input review's session panel (`InputReview.js:212-216`, through the console copy);
    - the harness print (`scripts/lib/stop-print.js:60-62`);
    - the log line (`input-nodes.js:824-826`).
  - **The line.** `guestReporterLine(sessionConfig, theme)` names the article's writer from the theme's writer entry (`name`) and gives null with no guest reporter or no writer entry.
    - One reporter: "The guest reporter: Ashe Motoko (Guest Reporter) shares this article's byline. Each memory turned in under the name Ashe Motoko or Ashe is reporting Ashe Motoko filed to Nova for this article."
    - Two or more: "The guest reporters: Ashe Motoko (Guest Reporter) and Taylor Chase (Contributing Reporter) share this article's byline.", then one such sentence per reporter. Three names join as "A, B and C".
    - A reporter with no role prints no parentheses. A reporter whose name is one word gives "under the name Ashe".
  - **The mark** (`guestTurnInName`) keeps its form.
    - A turn-in matching any reporter's full name, in any case, is "Taylor Chase (the guest reporter)".
    - A first-name match is "Taylor (the guest reporter, Taylor Chase)" only when exactly one reporter has that first name. Otherwise the name prints as written.
  - **The byline instruction** (addendum f) gives `byline.guestReporter` as each credit, "Name | Role" or "Name" with no role, joined with " || ". The schema, `header.hbs`, the desk and the diff are unchanged.
  - **The console copy:** `console/input-review-logic.js` `guestReportersOf`, dual-export, held equal to the server's by a test over R5's cases. The session panel prints each reporter as "Name | Role", one to a line, with "Guest Reporter" for a blank role, as today.
- **R6. Pinned hashes.**
  - B moves all three:
    - arcs: 12272 → 12319, the voice stub;
    - outline: 25093 → about 25365 plus the schema's delta (the voice stub, mapTask, the swap, the schema);
    - article: 36054 → about 36324 (the reorder, the task, the label, the identity line).
  - A, C, D and E move none. The renders read stub rule files, the fixture has no guest reporter, and the judges are not pinned.
- **R7. Retired wording.** The integrator adds each phrase below to `removed-phrases.js` once no file a model reads carries it (a grep of the rule files, `lib/`, the schemas and the skill first):
  - "marks as Nova's, worded fresh each time"
  - "an opinion marked as Nova's"
  - "every sharp line makes a claim"
  - "says it once and says it sharply"
  - "It writes no prose"
  - "the map writes no prose"
  - "The voice draws on"
  - "Hunter S. Thompson"
  - "the move is told from"
  - "never read the voice guidance"
  - "and never states the rule"
  - "reasoning inside the world wherever a rule matters"
  - "is their reporting for this article"
  - "Write the map as C16"
  - "each written from the pieces of its"

  "Reasons inside the world" stays off the list: C12 keeps it, for where the record stops.
- **R8. Older threads.**
  - No session is refused or rolled back.
  - A thread started before this phase reads its guest reporter apart through the function. On 101126 that gives Ashe Motoko as Guest Reporter and Taylor Chase as Contributing Reporter, from all three places the old value sits.
  - The evidence check reads the marked timeline lines (`lib/evidence.js:325-332`), so a reporter newly marked changes what a quotation of that line must match. None of the stored weaves or maps quotes a mark. A rework on an older thread that quoted one is a rare combination for the ledger.

## Review focus

Inputs a person will meet that the spec implies but no ordinary test exercises, most likely first. Each names the slice whose tests pin it.

1. **A session with no guest reporter,** as most sessions are. In that case nothing new prints in any prompt, the byline, the session panel, the harness print or the head count (D).
2. **One guest reporter who plays a roster character,** as every guest so far has. The line takes §14's wording. The mark, the byline and the session panel print as today, and the head count counts them among the players. No test today covers a guest on the roster (D).
3. **An older thread holding the comma-joined value,** and a single reporter whose role holds a comma. The first reads as two reporters with roles by position; the second as one reporter with the role whole (D).
4. **A turn-in under a first name two reporters share.** It prints unmarked, and each reporter's full name still marks (D).
5. **Every rework reads what its writer reads.** The arc rework's three ways (the automatic pass, the reweave, the send-back), the map rework's two and the article rework read `<craft-voice>` once as a tag, in R2's order, with telling and voice last before `<DIRECTOR_GUIDANCE>` (B).

## What this phase changes for the director

| Where | Today (101126) | After |
|---|---|---|
| Story meeting | Each angle's headline written by a writer that reads no voice | The headline in Nova's voice; the pitch, threads and connections in plain story terms as today |
| Map | The deck and headings written by a writer told it "writes no prose" ("... Nova asks who gains.") | The deck and headings in the voice, under the meeting's headline word for word; the moves as today |
| Desk | You rewrite lines that only sound sharp, opinion tags, evidence printed because it was there, rule lines, the copied remote sentence, and the guest reporters' turn-ins | The draft reads as one story in Nova's voice, so your desk work is the angle, the room's facts and the ending |
| Start form and input review | Two guest reporters in one field read as one person, and Taylor's turn-ins are unmarked | Each reporter read apart and shown apart, each one's turn-ins marked, each one credited on the byline |

## Slices and how they run

**How the work is split.** The rule files, the code-built lines, the judges' questions and the guest reporters touch different modules, so they run as four slices in one run. The skill's text and the docs follow in a second run, once the pipeline's text is in. Four places are shared, each by function:
- `lib/__tests__/rule-set.test.js`: A's sentence pins (`:461, :462, :494, :505, :515, :516, :518`) and B's list tests (`:63-88`, `:182-187`);
- `lib/prompt-builder.js`: B's `ARTICLE_TASK`, `mapTask` and `STORY_MAP_LABEL`, and D's byline instruction (`:1010-1012`);
- `lib/__tests__/prompt-builder.test.js`: B's `:969-979` and `:1366-1375`, and D's `:398-436`;
- `lib/workflow/nodes/evaluator-nodes.js`: C's `TRUTH_GROUPS`, and D's guest reporter input to the fact check (`:866`) if its shape changes.

| # | Slice | Layers | Size | Starts after |
|---|---|---|---|---|
| A | The rule files and the glossary | prompt | small | the phase branch is cut |
| B | What the writers are told and read | prompt | medium | the phase branch is cut |
| C | The judges' two questions | prompt | small | the phase branch is cut |
| D | Each guest reporter apart | plumbing, prompt, screen | medium | the phase branch is cut |
| E | The standalone skill and the docs | docs | medium | run 1 merges |

**Runs.** Each run is one workflow.

| Run | Slices | Long pole |
|---|---|---|
| 1 | A, B, C, D | D |
| 2 | E | E |

- The integrator merges a run's slices into the phase branch in the table's order. Each is rebased onto the last, with the full suite at every commit. Run 2's worktree is cut from the new head.
- Before each run the integrator writes that run's interfaces file: the names the slices share (`guestReportersOf`, R2's lists), who owns which functions of a shared file, the docs lines each slice updates, and the hashes each slice may move.
- The phase merges to `main` once, after the gates. The integrator asks the director before merging, and merges only when no session is paused at the input review or a later stop.

**Seats.** Each slice is one seat in one worktree. After it comes a spec reviewer, then a verifier for each blocking finding before any fixer, and at most two fix rounds. D also gets an adversarial reviewer who demonstrates each failure. A rare combination a reviewer finds in code no session has reached goes to the ledger.

| Slice | Effort |
|---|---|
| A | medium |
| B | high |
| C | medium |
| D | high |
| E | medium |

**Who owns which file.**

| Slice | Owns |
|---|---|
| A | The eight rule files R1 names; `CONTEXT.md` `:32`, `:96`, `:104`, `:160`; the rule files' sentence pins (`rule-set.test.js` :461, :462, :494, :505, :515, :516, :518; `article-writer-map.test.js:568`; `prompt-reporting-mode-neutral.test.js:415`); `docs/architecture/prompts.md:13` |
| B | `lib/rule-set.js` (the lists and their comments); `ARTICLE_TASK`, `mapTask`, `STORY_MAP_LABEL` and their comments in `lib/prompt-builder.js`; `identities.article` in `lib/theme-config.js`; `lib/schemas/outline.schema.json` `:5, :76, :137`; the rule lists in `.claude/agents/journalist-arc-analyzer.md`, `journalist-outline-generator.md`, `journalist-article-generator.md` (the fenced lists only); their tests (`article-writer-map.test.js` :58-62, :80, :526; `prompt-builder.test.js` :969-979, :1366-1375; `writers-rule-set.test.js:171-176`; `weave-stage.test.js:162-171`; `rule-set.test.js` :63-88, :182-187; `reworker-writer-parity.test.js:214`); the three pinned hashes; `docs/architecture/prompts.md:40`, `map.md:9, :11`, `article.md:9, :10` |
| C | The question texts in `TRUTH_GROUPS` and the comment at `evaluator-nodes.js:216-218`; their pins (`article-judge.test.js` :131-146, `weave-stage.test.js` :471-484, `evaluator-nodes.test.js` :2161-2171); `docs/architecture/judges.md:7` |
| D | `lib/prompt-renderers/session-authors.js` (the function, the line, the mark); the parse's stamp and log line in `input-nodes.js`; each caller of `guestReporterLine`; the byline instruction in `prompt-builder.js`; the head count in `content-bundle-fact-check.js` and its input in `evaluator-nodes.js`; `scripts/lib/stop-print.js`; `console/input-review-logic.js` `guestReportersOf`; `InputReview.js`'s session panel; `SessionStart.js`'s help line; their tests (`session-authors.test.js`, `input-nodes-schema.test.js`, `prompt-builder.test.js` :398-436, `content-bundle-fact-check.test.js` :1458-1471 and :2317-2325, `e2e-stops-step-mode.test.js` :262-333, a new console test); `docs/architecture/director-words.md:10`, `judges.md:10-11`, `key-files.md:62`, `console.md:107, :113` |
| E | The skill: `SKILL.md`, `references/schemas.md`, the agents' text outside their rule lists; `__tests__/unit/journalist-skill-path.test.js`; `docs/PIPELINE_DEEP_DIVE.md`; `docs/runbook/first-run-sheet.md:79` |

## Gates

None makes a live model call. The director's next new session is the live test.

1. **The suite,** at the phase branch's head: exit 0, nothing skipped.
2. **The rule-set lint and the retired wording.** `lib/__tests__/rule-set.test.js` passes, with the twelve rule files under the 50,002-character cap (about 43,400 expected). R7's phrases are on the list, and no file a model reads carries one.
3. **The prompt renders,** with `scripts/render-prompts.js`, from the stored threads of 100926, 101026 and 101126. The render reads a copy of the database, and the integrator makes that copy only with the director's go-ahead, when no session is running. Without it, a scratch script renders every writer, rework and judge from the test fixtures with the real rule files, with a planted two-reporter config. Each render is checked for:
   - every writer and rework reads exactly R2's files, in order, with telling and voice last before `<DIRECTOR_GUIDANCE>`, and `<craft-voice>` once as a tag;
   - the judges read no craft file;
   - the new task lines, the label, the identity line, the schema's description and both judges' questions are in place;
   - 101126's guest lines read two reporters, with each one's turn-ins marked, and the byline instruction credits each;
   - no retired wording (R7) and no em-dash in instruction text;
   - each call's size, recorded beside phase 15's.
4. **The click-through,** through the mock server on a fixture thread with two invented reporters: the start form's help line, and the input review's session panel with each reporter on its own line. The harness's print of the same stop.
5. **The docs grep.** None of the following survives in `CLAUDE.md`, the docs, the skill or the prompts:
   - the six names as Nova's voice;
   - "writes no prose" or "with no prose" for the map;
   - an opinion "marked as Nova's" or "worded fresh";
   - "every sharp line";
   - the article writer writing "the map" or citing "the evidence it carries" as its job;
   - the map writer reading no voice;
   - one guest reporter as the only shape.
6. **The final whole-phase review,** on Opus 5.5.

The gates prove the pipeline works. The director's next new session shows whether the writing does.
- **The readout** reads the writer's last draft beside the approved article as two whole articles, against the design's seven-point standard and its anti-goals:
  - a Coffeezilla impression;
  - a new form, such as every paragraph ending on a thesis line or the same hedge in every section;
  - the voice leaking into a planning line;
  - a voiced deck crowding the map's page.
- **Phase 15's standing step:** read the desk edits for what they do in the fiction, and put the reasons to the director before any rule text.

---

## Brief A: the rule files and the glossary

**Intent.** The writers read Nova's voice as a description of Coffeezilla's way of working a case, in place of six names. They also read the article as one story told sentence by sentence, the headline and the deck as the copy everything builds on, the evidence as something to draw on, and the truth floor worded for what it is for (design 1, 2, 4, 5).

**Prompt.**
- R1, word for word, from `rule-text-read.md` and its addendum.
- `CONTEXT.md`:
  - `:32`: "an opinion Nova marks as Nova's" becomes "an opinion said plainly as Nova's own".
  - `:96`: "A journalist working the room who shares Nova's byline for what they contributed, named when the session starts. Each memory they turned in under their name is reporting they filed to Nova for the article. A session may have more than one, each held apart; many have none."
  - `:104`: "from its evidence, and adds none." becomes "drawing on its evidence for what the beat needs, and adds none."
  - `:160`: "to the article writer, which cites it." becomes "to the article writer, which draws on it and cites what it prints."
- `docs/architecture/prompts.md:13`: "C12's working reporter with a stake" becomes "C12: Nova works the case in front of the reader".

**Invariants.**
- What T1 to T15 require of a claim is unchanged.
- World.md and the truth rules render byte-identical in both modes.
- mode-remote.md gains no pointer (`rule-set.test.js:208` holds `['T8']`).
- C12 keeps "reasons inside the world (T14)" for where the record stops.

**Tests.** The rule-set lint holds:
- each item stated once;
- every pointer names an item the set states;
- no em-dash, no gendered Nova, nothing on the removed list;
- the files under the cap.

Update each sentence pin Who-owns names, each with its reason. The pinned writer renders read the stubs, so no hash moves.

**Verification.** Print `loadRuleSet('arc')`, `loadRuleSet('outline')` and `loadRuleSet('article')` with the real files on the slice's tree, and read each changed item in place against the read.

**Done.** The files carry the approved text, the lint passes, and both modes render world.md and the truth rules alike.

**Out of scope.** The lists and the code-built lines (B). The judges' questions (C). The guest reporter's line (D).

---

## Brief B: what the writers are told and read

**Intent.** Today the headline and the deck are written by the two calls that read no voice. The article writer is told to "write the map", and four lines tell it the evidence under a move is what it uses (design 3, 4). After this slice:
- the arc writer and the map writer read C12 for the lines that print;
- the map writer's task names the deck and the headings as its only prose, under the meeting's headline word for word;
- the article writer's task opens on one cohesive story built on the headline and the deck, with the map as its plan;
- every writer reads its craft files in R2's order.

**Prompt.** R2 and R3, word for word. The three agents' fenced rule lists follow R2 in the same commit, naming each file with its `references/rules/` prefix, as today.

**Invariants.**
- `ARTICLE_TASK`'s kept lines stay word for word (pinned at `article-writer-map.test.js` :265, :290, :292, :360, :364, :516).
- The story-terms check's scope is unchanged, and no check reads the headline, the deck or a heading beyond today's.
- The judges' lists stay `[]`.
- Every text naming Nova comes from the theme's file (`theme-rules.test.js`).
- No code picks a craft file by position: each placement takes the craft block whole.

**Tests.**
- Update the pins Who-owns names, each with its reason:
  - `taskLines()` and the order marker anchor on the new first sentence;
  - the label says "can be told from";
  - the map writer's task carries addendum a's sentence;
  - the map writer's renders carry `<craft-voice>`;
  - the arc list is R2's;
  - `SPEC_SECTION_11` becomes "arc excludes C4 and C9; outline excludes C15", with its comment citing this phase;
  - `BRIEF_MAP` holds R2's lists;
  - the outline call now throws on a missing craft-voice.md, as the article call does;
  - the parity test counts the line-anchored tag.
- New:
  - each writer and each of its reworks (the arc rework's three ways, the map rework's two, the article rework) renders its craft blocks in R2's order, the last two telling and voice before `<DIRECTOR_GUIDANCE>`, with `<craft-voice>` once as a line-anchored tag;
  - the identity line, exactly;
  - the schema's description and the evidence field's, exactly.
- Re-pin the three hashes (R6) with their reasons and length deltas.

**Verification.** A scratch script renders each writer and rework from the pinned fixtures with the real rule files. Read the order, the new lines in place, and that the meeting's headline reaches the map writer beside addendum a's sentence.

**Done.** Each writer reads R2's files in R2's order. The tasks, the label, the identity line and the schema say what the read says, and the skill's lists match.

**Out of scope.** The rule files' wording (A). The judges (C). The skill's task text (E). A code stamp of the angle's headline onto the map.

---

## Brief C: the judges' two questions

**Intent.** On 101126 the article judge cited "My read, and I'll own it" in both rounds as an opinion properly marked. Left as it is, the judge rewards the tag and could score a plainly said opinion below 0.8, a must-fix whose rework would put a tag back (design 5). After this slice, a line states as fact what the record cannot back or it does not, whatever tag it carries, and a stated rule of the game is caught.

**Prompt.** R4, word for word, in the one `evidenceTruth` template (both judges) and in `fictionTruth`.

**Invariants.**
- Each group's `about`, `reads` and `rules` are unchanged.
- The threshold, the fact check and the criteria count are unchanged.
- No question asks about anything its judge's prompts do not hold.

**Tests.** Update the word-for-word pins of both questions in both judges, with the reason. One test holds that no question carries "marked as Nova's" or "reasoning inside the world wherever".

**Verification.** Print `getPhaseCriteria('arcs')` and `getPhaseCriteria('article')` and read each question beside T1 and T14 as A words them.

**Done.** Both judges ask what T1 and T14 are for, and nothing asks for a mark.

**Out of scope.** T1's and T14's own wording (A). New checks.

---

## Brief D: each guest reporter apart

**Intent.** On 101126 the start form's one field held "Ashe Motoko, Taylor Chase", and code read it as one person (design 6). Ashe's turn-ins were marked with both names, Taylor's were never marked, and the byline printed both names and both roles run together. After this slice each reporter is read apart, from the parse to every reader, and an older thread's value is read the same way.

**Plumbing.** R5's function, stamp and readers. The bypassing readers read the function. The head count drops its own first-name split.

**Prompt.**
- R5's line, with Nova's name from the theme's writer entry, at every place it prints today.
- R5's mark.
- The byline instruction, as addendum f.

**Screen.**
- The start form's help line.
- The input review's session panel, each reporter on its own line, through `console/input-review-logic.js` `guestReportersOf`.
- `stop-print.js`, alike.

**Invariants.**
- With no guest reporter, every prompt, panel and print is byte-identical to today's.
- With one, only the line's wording changes.
- The byline's schema, template, desk and diff are unchanged.
- An input-review correction still cannot change the guest reporters; only a fresh start can, as today.

**Tests** (invented names):
- `guestReportersOf`:
  - none (a null config, `{}`, a null value, a blank name) gives `[]`;
  - the list shape;
  - the older object with one name;
  - the older object with two names and two roles, paired by position;
  - two names and one role, which both take;
  - one name whose role holds a comma, kept whole;
  - whitespace collapsed and blank pieces dropped.
- With none, `SESSION_FACTS`, the weave writer's section, both judges, the timeline, the byline instruction, the session panel and the harness print carry nothing new. Keep today's "no guest reporter" assertions.
- The parse stamps `guestReporters` and no `guestReporter`.
- `guestReporterLine`: one reporter, two reporters, a one-word name and a reporter with no role, each exactly; null with none.
- `guestTurnInName`:
  - each reporter's full and first name;
  - a guest on the roster, marked: the normal case;
  - a first name two reporters share, unmarked, while the full names mark.
- The timeline marks each reporter's turn-ins.
- The byline instruction: none, one (as today) and two.
- The head count with two reporters, one on the roster and one off.
- The harness print with two reporters.
- The console copy equals the server's over every case above.
- Update the existing pins Who-owns names, each with its reason.

**Verification.** Copy `data/101126/inputs/session-config.json` to scratch and run the function, the line, the mark on "Ashe" and "Taylor", and the byline instruction on the copy. Read each.

**Done.** Every reader reads each guest reporter apart, an older thread reads alike, and a session with none or one is as today but for §14's wording.

**Out of scope.**
- A start form with a row per reporter.
- A guest who plays no character but shares a roster player's first name (today's behaviour, for the ledger).
- The skill (E).

---

## Brief E: the standalone skill and the docs

**Intent.** The skill reads the same rule files as the pipeline, so its agents' text has to frame the job as the pipeline now does. The docs have to say what the pipeline does (design 8). Run after run 1 merges.

**Docs.**
- **The skill.**
  - The article generator's Job is framed as `ARTICLE_TASK` now frames it: one cohesive story that argues the settled angle's thesis, built on the headline and the deck, with the map as its plan. Each beat draws on its `evidence` for what the beat needs, and the prose is as C4 and C12 set out. It keeps the lines on cards, order and length.
  - The outline generator's "with no prose" becomes addendum a's sense: the deck and the headings are its only prose, under the settled angle's headline word for word.
  - SKILL.md step 1, `references/schemas.md` (`:34`, `:97`) and every agent's Input line hold the guest reporters as a list, each "when there is one" phrase following.
  - The article generator's byline credits each reporter as addendum f does.
  - The skill names rule files bare in its text, so `retired-craft-files.test.js` counts only the fenced lists. It carries no "receipt" or "material".
  - Update `journalist-skill-path.test.js` `:247`, `:447-452` and `:461-463` with the reason.
- **`docs/PIPELINE_DEEP_DIVE.md`:** `:211-214`, `:343`, `:360`, `:437`, `:456`, `:458`, `:882`, `:884` and `:889`.
- **`docs/runbook/first-run-sheet.md:79`.**

**Done.** The skill and the docs say what the pipeline does, and the docs grep (gate 5) finds nothing.

**Out of scope.** `docs/architecture/*.md` (each code slice) and `CONTEXT.md` (A).
