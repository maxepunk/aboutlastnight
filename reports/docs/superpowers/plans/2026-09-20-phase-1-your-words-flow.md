# Phase 1: your words flow

Design source: the grill of 2026-09-20 (`CONTEXT.md` for the vocabulary; `.superpowers/grill/2026-09-20/` for the readout, the gate inventory and the surveys). Every line reference below is from the surveys taken at `main` `4ba3bbd` on 2026-09-20; re-read the code before editing, the numbers are where to look, not what to type.

## What this phase changes for the director

At the arc, outline and article stops, a note box is always on screen and is sent with whatever the director presses. A note sent with approve stands for every later writer. A note sent with send back drives the rework and then stands. The arc stop's cards name their evidence. The rework prompt carries the current evaluation state instead of a stale failure, and the previous stage's advisory findings reach the next writer as should-consider notes. The console shows "Round N" with no maximum; the machine's own reworks are capped at two per round of the director's; the arc stop never forces forward. The arc and outline writers know the reporting mode and see the director's raw notes.

No new steering control is invented here. Everything in this phase makes words the director already writes, or facts the session already holds, reach the prompt they belong in.

## Slices, in build order

| # | Slice | Layers | Depends on |
|---|---|---|---|
| 1.5 | Facts the arc and outline prompts were missing | prompt | none |
| 1.6 | Two small defects | plumbing | none |
| 1.3 | The rework prompt tells the truth | plumbing, prompt | none |
| 1.4 | Rounds | plumbing, screen | 1.3 (same evaluator function) |
| 1.1 | Notes with any action at the outline and article stops | screen, plumbing, prompt | none |
| 1.2 | The arc stop: visible note, evidence by name, plain claims | screen, plumbing, prompt | 1.1 (note kinds) |

1.5 and 1.6 are one task. 1.3 and 1.4 are two tasks, sequential. 1.1 and 1.2 are two tasks, sequential. Five tasks.

## Shared rules for every slice

- Vocabulary from `CONTEXT.md`: stop, round, note, edit, send back, rework, check, evaluation, review, writer, record, automated budget. Use these words in code comments, payload keys where new ones are introduced, and screen copy.
- A new state channel costs eleven `ROLLBACK_CLEARS` lists (`lib/workflow/state.js:1054-1273`), `ROLLBACK_CLEARS_EXEMPT` or a list membership (`rollback-clears-completeness.test.js`), and the exact-set assertion on `getDefaultState()` (`__tests__/unit/workflow/state.test.js:227-306`). Add a channel only where the brief says so.
- LangGraph drops writes to undeclared keys silently (`server.js:418-424` records the `_inputEdits` post-mortem). Every new key the server writes must be an Annotation.
- Console logic that decides a payload or a label goes into a dual-export pure module (`console/checkpoint-view-logic.js` or a sibling) with node-env tests. React components stay thin. There is no DOM harness; the two source-text tests (`console-edit-gates.test.js`, `console-editable-pencils.test.js`) pin counts of specific call strings and must stay green.
- Prompt changes are read through `scripts/render-prompts.js --compare` against a baseline rendered from `main` before the phase; the integrator reads the diff, the reviewer reads it too.
- Commits end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nothing under `data/` is ever committed. The production database `data/checkpoints.sqlite` is never opened by a test or a gate; every live pass runs on a copy through `CHECKPOINT_DB_PATH` on a throwaway port with a throwaway password.

## Phase gate (the integrator runs it, once, after all five tasks)

1. Full suite, broad sweep, exit 0.
2. `render-prompts.js --compare` between the main baseline and the phase head: the only differences are the ones the briefs below name.
3. Live pass on a copy of the 091826 thread, in this order, reading the call log after each step:
   - Roll the copy back to `arc-selection`. Arc analysis reruns (about 8 minutes of Opus). At the arc stop: cards name their evidence; the note box is visible without a click; type a note and send back; the next round shows the note under standing notes and pre-filled in the box. Approve with guidance.
   - At the outline stop: the `generateOutline` record's system prompt holds the reporting-mode block; its user prompt holds the director's raw notes; the arc evaluation's advisories appear under a should-consider heading. Type a note beside Approve and approve.
   - `generateContent` runs (about 14 minutes). Its prompt holds the approval note inside `<DIRECTOR_GUIDANCE>` labelled `[outline, approval 1]`, and the outline evaluation's advisories under should-consider.
   - At the article stop: the banner reads "Round 1"; no "final version" line. Type a note and send back.
   - `reviseContent` runs (about 9 minutes). Its prompt reads "Ready: YES", lists no stale card defects, carries the note as HUMAN FEEDBACK, and the standing notes list holds the outline approval note but not this note. The article stop returns as "Round 2".
   - Send back once more with a note. "Round 3" arrives. No banner.
4. Merge each task's branch only after its own review is clean and the suite is green on it; the phase merges to `main` after step 3.

---

## Brief 1.5: facts the arc and outline prompts were missing

**Intent.** The arc writer and the outline writer are told the reporting mode, and the outline writer sees the director's raw notes. Today only the article writer gets either. The result last session was "I watched" in the arc summaries and six presence claims in an outline for a remote session, and an outline planner that never read the director's observations.

**Prompt.**
- The reporting-mode block exists once, for the article system prompt, via `PromptBuilder._buildReportingModeBlock` and `REPORTING_MODE_BLOCKS` in `lib/prompt-builder.js`. The arc prompts are built outside `PromptBuilder` in `lib/workflow/nodes/arc-specialist-nodes.js` (`buildCoreArcPrompt` 215-430, `buildInterweavingPrompt` about 430-511). Put the block into both arc system prompts and into the outline system prompt (`buildOutlinePrompt` 363-722; the system prompt is assembled at 370-372) and into the outline revision system prompt (`ai-nodes.js` `buildOutlineRevisionSystemPrompt` 1078-1093), in the same position the article uses: right after the identity line. One source of truth for the text; export what is needed rather than copying it.
- The director's raw notes reach the article prompt as `<INVESTIGATION_OBSERVATIONS>` at `prompt-builder.js:920-929` (raw prose, quotes, transaction references, post-investigation developments). Give the outline prompt the same section, placed with the data context and before the arc metadata, never last: `<DIRECTOR_GUIDANCE>` stays the final section (rationale at 715-718). `generateOutline` (`ai-nodes.js:813-941`, the call at 913-923) must pass `state.directorNotes` through if it does not already.

**Plumbing.** None beyond passing `directorNotes` into the outline builder's options.

**Invariants.** The block's wording stays identical across the four prompts. `<DIRECTOR_GUIDANCE>` remains the last section of the outline and article prompts. The prompt files under `.claude/skills/journalist-report/references/prompts/` stay mode-neutral (pinned by `lib/__tests__/prompt-reporting-mode-neutral.test.js`, 10 cases).

**Tests.** Extend `prompt-reporting-mode-neutral.test.js` to assert the block in the arc and outline system prompts. `lib/__tests__/prompt-builder.test.js` (101 cases) gains the observations section for the outline. `lib/__tests__/arc-specialist-prompts.test.js` (3 cases) gains an assertion on the block.

**Verification.** `render-prompts.js --compare` shows the block and the observations section in `outline-generation.txt` and the block in `outline-revision.txt`, and nothing else changed in those files. The arc prompt is verified live in the phase gate's first step.

**Done.** The call log's `generateOutline` record for the copy holds the mode block in its system prompt and the director's raw notes in its user prompt.

**Out of scope.** The evaluator prompts; the story map; the claim check.

---

## Brief 1.6: two small defects

**Intent.** (a) The bundle the director approves at the article stop is written to the session folder, so the writer's last version and the director's approved version can be compared after a run without reading the published HTML back. (b) The photo list the outline writer sees is joined by filename, not by array position, so a filtered hero or whiteboard image no longer shifts every later description onto the wrong photo.

**Plumbing.**
- (a) `checkpointArticle` in `lib/workflow/nodes/checkpoint-nodes.js` (616-634; the approve branch clears the hand-edit fields at 633-634) writes `data/<sessionId>/output/content-bundle.approved.json`. Take the path handling and the session-id sourcing from `parseRawInput`'s disk write (`lib/workflow/nodes/input-nodes.js:705-746`), which never trusts a model for the id. On the API path the interrupted node re-executes with the update already applied (the F25 note in the same file), so the write belongs in the node's approve branch; confirm it runs on `/approve`.
- (b) `availablePhotos` in `lib/workflow/nodes/ai-nodes.js:874-887` reads `state.photoAnalyses.analyses[i]` after the hero and whiteboard filters at 875-876. Join analyses to photos by basename, the way the console's `photoUrl` matches, and drop the index.

**Invariants.** The approved-bundle write must not throw the checkpoint: a failed write logs and continues. `ROLLBACK_CLEARS['article']` already clears `outputPath`; the new file is a side effect, not state.

**Tests.** `__tests__/unit/workflow/checkpoint-nodes.test.js` (9 cases) gains one case with a temp session folder. A unit test beside `lib/__tests__/evidence-content-preservation.test.js` shows that with the first photo filtered as hero, each remaining description still sits on its own filename.

**Verification.** The phase gate's article approval leaves the file in the copy's session folder.

**Done.** The file exists after an approval, and the outline prompt's photo list pairs each description with the right filename when a hero is set.

**Out of scope.** Photo descriptions reaching the writer, exclude, captions (a later phase).

---

## Brief 1.3: the rework prompt tells the truth

**Intent.** When the director sends an article or outline back, the writer's rework prompt describes the current evaluation state. Last session every rework prompt said "Ready: NO (must address issues)" and listed four evidence-card defects fixed an hour earlier, because a passing evaluation leaves the previous failure in the channel the reviser reads and the reviser reads a field nobody writes. Separately, advisory findings are either mixed into the must-fix list unlabelled or dropped, so the outline evaluation's two warnings about frontloading never reached the article writer. After this slice: must-fix and should-consider are separate lists, a passing evaluation writes its result, and the previous stage's should-consider findings reach the next writer.

**Plumbing.**
- `evaluatePhase` in `lib/workflow/nodes/evaluator-nodes.js` writes `validationResults` only on failure (fact-check branch 1032-1058, fail-under-cap 1167-1195). The pass branch (1121-1131) and the at-cap branch (1134-1165) must also write it: `{phase, passed, structuralIssues, advisoryWarnings, criteriaScores, confidence, revisionGuidance}`, with `passed:true` on a pass. The fact-check branch's thin block (no `criteriaScores`, no `confidence`) is fine; the builder tolerates absence.
- `buildRevisionContext` in `lib/workflow/nodes/node-helpers.js` (827-1017) reads `validationResults.ready` at 873, a field no branch writes. Read `passed`. Print `ISSUES TO ADDRESS` from `structuralIssues` only and a new `SHOULD CONSIDER` list from `advisoryWarnings` (today 859-866 concatenates both). When `passed` is true and the rework is human-driven, the summary says so in one line: the evaluation passed, the human's note is the reason for this rework.
- The `CRITICAL REVISION INSTRUCTIONS` block (962-983) carries item 3, "if a criterion is scoring well (>=80%), do NOT change anything related to it". With every criterion above 0.8 last session it told the writer to change nothing, which is how "rethink from scratch" became a relabel. Remove item 3. Items 1, 2, 4, 5 stay for now; a later slice derives them from the send-back scope.
- Carry advisories forward to generation. `generateContentBundle` (`ai-nodes.js:1166-1240`, builder call 1222-1232) passes the outline pass's `advisoryWarnings` into `buildArticlePrompt` when `validationResults.phase === 'outline'`; `generateOutline` (813-941) does the same with the arc pass's warnings when `validationResults.phase === 'arcs'`. The phase stamp is the guard: a block stamped for another phase is ignored, as the builder already does at 853-854.

**Prompt.** `buildArticlePrompt` and `buildOutlinePrompt` gain a `<SHOULD_CONSIDER>` section placed immediately before `<DIRECTOR_GUIDANCE>`, with a two-line preamble: these came from the evaluation of the previous stage; apply them where they serve the piece; they are not requirements. The revision prompts' `SHOULD CONSIDER` list uses the same preamble.

**Invariants.** `<DIRECTOR_GUIDANCE>` stays last. `validationResults` keeps its `phase` stamp on every write. The fact-check branch keeps short-circuiting the Opus call under the cap. Nothing in this slice changes routing.

**Tests.** `__tests__/unit/workflow/evaluator-nodes.test.js` (18 article cases) gains assertions that the pass and at-cap branches write `validationResults`. `lib/__tests__/node-helpers-revision-context.test.js` (16 cases) changes with the builder: the Ready line, the split lists, the removed item 3. `lib/__tests__/prompt-builder.test.js` gains the new section for both prompts. `__tests__/unit/workflow/ai-nodes.test.js` gains the pass-through of advisories.

**Verification.** `render-prompts.js --compare` shows the new section and the changed instruction block and nothing else in the revision prompts. In the phase gate, the `reviseContent` record after the human send-back reads "Ready: YES" with no card defects, and the `generateContent` record holds the outline's advisories under should-consider.

**Done.** Those two call-log records.

**Out of scope.** The evaluation rubric; advisories as candidate notes the director accepts; the preserve instruction derived from scope.

---

## Brief 1.4: rounds

**Intent.** The director can send back as many times as needed. The console shows "Round N" with no maximum. The machine's own reworks, from a failed check or a failed evaluation, are capped at two per round of the director's. The arc stop stops forcing forward after four rejections. Last session one counter served both the machine and the director, the director's two send-backs exhausted the machine's budget, and the console printed a false "Maximum revisions reached, this is the final version" line that ended the director's rounds.

**Plumbing.**
- The existing `outlineRevisionCount` and `articleRevisionCount` become the automated counters, reset to zero at the start of each director round. Two new channels, `humanOutlineRevisionCount` and `humanArticleRevisionCount`, count the director's rounds, mirroring `humanArcRevisionCount` (`lib/workflow/state.js:582`). Add both to `ROLLBACK_CLEARS_EXEMPT` beside the other counters (1047) and to `ROLLBACK_COUNTER_RESETS` (1314-1328) at the points that reset the automated counters, and to the exact-set test.
- `incrementOutlineRevision` (`lib/workflow/graph.js:343-357`) and `incrementArticleRevision` (364-379) learn which kind of pass they are the way `incrementArcRevision` does at 308: the feedback slot (`_outlineFeedback`, `_articleFeedback`) is present at increment time on the human pass and already consumed by the reviser on the automated pass that follows (`ai-nodes.js:1507`, `1525`). On a human pass: bump the human counter, reset the automated counter, stamp `source:'human'` on the history stub (the arc stub does this at 332). On an automated pass: bump the automated counter, stamp `source:'evaluator'` or `'fact-check'`. `routeOutlineEvaluation` and `routeArticleEvaluation` (131-168) keep reading the automated counter against `REVISION_CAPS`.
- `REVISION_CAPS.OUTLINE` and `REVISION_CAPS.ARTICLE` (`state.js:983-988`) become 2, meaning automated reworks per director round. `REVISION_CAPS.HUMAN_ARCS` is removed; `routeAfterArcCheckpoint` (201-208) returns `'revise'` whenever there is no selection; the guard at `ai-nodes.js:682-688` throws on an empty selection with no exception, since the force-forward was its only legitimate empty case. The timeout decrement at `arc-specialist-nodes.js:1017-1018` stays; a timed-out rework is a free retry.
- `getCheckpointData` (`server.js:259-331`) adds `humanRevisionCount` for the outline (300-301) and article (316-317) payloads. `revisionCount` now means automated passes in the current round; `maxRevisions` means the automated cap.

**Screen.** `console/components/RevisionDiff.js` (76-126): remove `atMax` (107) and its banner (124-126). The banner reads "Round N" from `humanRevisionCount + 1`, and beneath it "Automated passes this round: k of 2" from `revisionCount` and `maxRevisions`. The `isHumanRevision` special case for arcs (99-101) goes; every stop shows rounds the same way. `Article.js` (687-688, 1358-1359) and `Outline.js` (549-550, 1228-1229) pass the new key through; `ArcSelection.js` drops `maxHumanRevisions`. The banner text comes from a new pure function in `console/checkpoint-view-logic.js` so it is unit-tested.

**Invariants.** `arcRevisionCount` and `humanArcRevisionCount` keep their current semantics. The evaluator's skip logic 2 (`evaluator-nodes.js:952-960`) still sees a `ready:false` stub after every increment. The counters stay in `ROLLBACK_CLEARS_EXEMPT`. `revisionNumber` in `_revisionHistory` and the "Attempt N" header may read 0 after a reset; that is acceptable and should be labelled as the automated pass number.

**Tests.** `lib/__tests__/increment-revision.test.js` (22 relevant; the force-forward pins at 94-102 become "never forces forward"), `__tests__/unit/workflow/evaluator-nodes.test.js` (23), `__tests__/unit/workflow/state.test.js` (15, plus the exact set and 639-640), `__tests__/integration/workflow.test.js` (13), `__tests__/unit/workflow/revise-hand-edits.test.js` (11), `__tests__/unit/workflow/graph-routing.test.js` (5), `__tests__/unit/workflow/checkpoint-nodes.test.js:99-104`, `lib/__tests__/evidence-content-preservation.test.js:291-293`, `__tests__/unit/get-checkpoint-data.test.js`, `lib/__tests__/api-helpers.test.js` (counter resets), `lib/__tests__/rollback-clears-completeness.test.js`. New: the banner function's cases in `console/__tests__/checkpoint-view-logic.test.js`.

**Verification.** Phase gate steps at the article stop: "Round 1", "Round 2", "Round 3", never a final-version line; the call log shows an `evaluate-article` after each rework. The cap behaviour (two automated passes then hand-over) is covered by tests; provoking it live would need a deliberately broken bundle.

**Done.** A third send-back at the article stop on the copy produces "Round 3" and a rework.

**Out of scope.** The trace of automated findings at the stop (a later phase); the claim check.

---

## Brief 1.1: notes with any action at the outline and article stops

**Intent.** At the outline and article stops one note box is always on screen. Whatever the director presses, the note goes with it. With approve, it becomes a standing note for every later writer, labelled as an approval note. With send back, it is the rework's HUMAN FEEDBACK and then stands, as rejection notes do today. Last session the director's structural note existed at 20:35 with nowhere to go but the reject box, and reached the writer 52 minutes later at the cost of a paid rework.

**Screen.**
- `Outline.js`: the only text input today is the reject panel's textarea (1288-1295) behind `mode === 'reject'` (556-563, 626-639); the action row is at 1247-1263. Replace the reject panel's textarea with one note box in the view mode, above the action row, labelled so the director knows it is sent with any action. Approve sends it when non-blank. Send back requires it non-blank and uses it as the feedback. The JSON mode's Save & Approve (672-690) sends it too. `handleApprove` (662-670), `handleJsonApprove` (672-690) and `handleReject` (692-711) read it.
- `Article.js`: same shape. The action row is at 1491-1511, the reject panel at 1532-1550, the handlers at 876-888, 890-903, 920-939.
- Keep the note in `pendingEdits` alongside the edits (the `SAVE_PENDING_EDITS` dispatch both handlers already make) so a page reset while a rework runs does not lose it.
- The payload assembly for approve and send back at both stops moves into pure functions in `console/checkpoint-view-logic.js` (one per stop, taking the edited object, the note and the action) so the keys are unit-tested.

**Plumbing.**
- `appendGateNote` (`server.js:379-385`) hardcodes `kind:'rejection'` and counts `round` per gate. Give it a kind argument and count rounds per gate and kind, so `[outline, approval 1]` and `[outline, rejection 1]` can coexist.
- The outline approve arm (491-499) and the article approve arm (526-537) accept `outlineNote` / `articleNote`, non-blank string, and append a note of kind `approval`. The reject arms (500-523, 538-556) keep appending kind `rejection`. Blank notes append nothing.
- `filterGateNotes` (`lib/prompt-builder.js:126-131`) drops any note whose text equals the current feedback, by text alone. With approval notes in the channel, a sentence used twice would vanish from the reviser's prompt. Narrow it: drop only a note of kind `rejection`, for the gate being reworked, whose text equals the feedback. The callers (`ai-nodes.js:1016`, `1470`) pass the gate.
- The `directorGateNotes` docblock (`state.js:769-777`) records the new kind. No new channel.

**Prompt.** `formatGateNotes` (`lib/prompt-builder.js:111-119`) already renders `[gate, kind round]`. Its preamble says every note was already applied at its own gate, which is false for an approval note. Reword: standing notes from the director, in order; a rejection note was applied by the rework at its own stop; an approval note is forward guidance; keep honouring each in what you write now.

**Invariants.** The guidance-only rendering of `<DIRECTOR_GUIDANCE>` stays byte-identical (`prompt-builder-director-guidance.test.js:209`). `console-edit-gates.test.js` pins `EditLogic.validateOutlineShape(` at exactly 2 occurrences in `Outline.js`, `ArticleEditLogic.validateBundleShape(` at exactly 1 in `Article.js`, and `if (!gateEdits(editedBundle, setEditError` at exactly 2; a note needs no validation, so add no validator calls. `console-editable-pencils.test.js` pins 13 editable hosts and 13 `editBtn(` calls in `Article.js`; the note box is not a host.

**Tests.** `__tests__/unit/server-build-resume-payload.test.js`: 649-655 ("approvals append nothing") becomes two cases, approve without a note appends nothing and approve with a note appends kind `approval`; 630-647 assert the kind per arm; add the round-per-kind case. `lib/__tests__/prompt-builder-director-guidance.test.js`: 215 and 227 move to the new preamble; add the narrowed `filterGateNotes` case. `console/__tests__/checkpoint-view-logic.test.js`: the two payload functions.

**Verification.** Phase gate: the approval note typed at the outline stop appears in the `generateContent` prompt inside `<DIRECTOR_GUIDANCE>` as `[outline, approval 1]`; after the article send-back, the `reviseContent` prompt carries that note in the standing list and the send-back note only as HUMAN FEEDBACK.

**Done.** Those two call-log records.

**Out of scope.** Anchored notes, replies, closing notes; the arc stop (1.2); the rendered surface.

---

## Brief 1.2: the arc stop, readable and with a visible note

**Intent.** At the arc stop the director can read what each arc rests on, because the cards name their documents instead of showing ids; the note box is visible without a click; a note written before a send-back survives into the next round; and the arc summaries read as plain claims instead of the reporter's prose. Last session the director wrote "there's just a reject button that doesn't allow me to give any feedback" because the note box was behind the button, and judged arcs by ids like `85620c6f-befd-4799-a877-8fc25c040d8e`.

**Screen.**
- `ArcSelection.js`: the guidance box (319-334) is the note box. The reject panel (352-368) and its `mode` toggle (87-96) go. Approve sends the box as `outlineGuidance` (79-85, unchanged). Send back sends it as `arcFeedback` (98-105) and requires it non-blank. The next round pre-fills the box from the latest arc-stop note of kind `rejection` in `data.directorGateNotes`, so the director can adjust it and send it forward as guidance on approve.
- The cards render evidence by name. `arcCardModel` in `console/checkpoint-view-logic.js` (130-189; `evidenceLabel` is the hook) takes the new `evidenceIndex` from the payload and renders name and owner, with the document's first line on expand.

**Plumbing.**
- `getCheckpointData` (`server.js:283-293`, the arc-selection case) adds `evidenceIndex`: a map from evidence id to `{name, owner, type, firstLine}` built from `state.evidenceBundle.exposed.tokens` and `.paperEvidence`. Resolve ids the way the fact check does (`lib/content-bundle-fact-check.js:291-317`, `buildSourceMap`: `id`, then `tokenId`, then `notionId`, then `name`) so the console and the check agree on what an id means. Owner comes from the resolved `owner` / `ownerLogline` / `owners[0]` on the bundle item, never from relation ids.
- No new channel. `_outlineGuidance` keeps its lifecycle; a note sent with send back is a standing rejection note (kind `rejection`, gate `arc-selection`), which already reaches every later writer.

**Prompt.** `buildCoreArcPrompt` (`arc-specialist-nodes.js:215-430`): the `summary` field's instruction becomes one to three plain sentences stating what the thread claims happened, third person, no reporter persona, no presence claims. The interweaving prompt receives the compact arc including the summary (444-450) and needs no change. The evidence ids in `keyEvidence` stay ids; the console resolves them.

**Invariants.** The arc `required` list in `lib/sdk-client/subagents.js:86-89` and `240-241` is unchanged. `validateArcStructure` keeps filtering. `defaultArcSelection` (`checkpoint-view-logic.js:249`) keeps pre-selecting on `evidenceStrength === 'strong'`. The `server-build-resume-payload.test.js:302` case, guidance is not recorded on an arc rejection, stays true: on send back the box is sent as `arcFeedback`, not as guidance.

**Tests.** `__tests__/unit/get-checkpoint-data.test.js` (18) gains the `evidenceIndex` case. `console/__tests__/checkpoint-view-logic.test.js` (8 arc cases) covers the resolved labels and the pre-fill selection. `lib/__tests__/arc-specialist-prompts.test.js` (3) asserts the summary instruction. `server-build-resume-payload.test.js` arc arms unchanged.

**Verification.** Phase gate, first step: on the copy at the arc stop, cards show document names and owners; a send-back with a note returns a round whose box is pre-filled and whose standing notes list holds the note; the `generateCoreArcs` record's summaries contain no first-person presence claims.

**Done.** The arc stop on the copy shows names, not ids, and a note survives a send-back.

**Out of scope.** The thesis settled at the arc stop; per-arc anchored notes; editing an arc's text; adding an arc.

---

## Rulings after wave 1 (the integrator's, 2026-09-20)

These amend the briefs above. Wave 2 (briefs 1.4 and 1.2) reads them as part of the brief.

- **The note box is on screen in every mode**, JSON mode included, because the JSON panel's Save & Approve sends it. Brief 1.1's "view mode" wording is corrected. Brief 1.2's arc stop keeps the same shape: one box, always visible.
- **Send back is a two-click action** at every stop: the first click arms the button and names the cost ("Confirm send back, starts a rework"), the second sends; editing the note, pressing another action, or a page reset disarms it. The arming label comes from the pure function `sendBackButton` in `console/checkpoint-view-logic.js`; brief 1.2 reuses it at the arc stop.
- **Screen copy says "note", never "guidance"** (CONTEXT.md). The prompt-side `<DIRECTOR_GUIDANCE>` tag and the arc stop's `outlineGuidance` payload key keep their existing names.
- **The ">=80% preserve" rule is gone from every rework prompt**: the CRITICAL block in `buildRevisionContext`, the outline and arc rework system prompts, the article rework system prompt ("High-scoring criteria (0.8+) should be left unchanged" and "Voice elements that score well"), and the "(high-scoring criteria)" parenthetical in the three YOUR TASK lists. Pinned by `lib/__tests__/revision-prompts-craft-rules.test.js`.
- **The reporting-mode block is in seven system prompts**: article, outline, outline rework, the two arc calls, and both branches of the arc rework. The render harness renders none of the arc prompts; they are verified live.
- **`filterGateNotes(gateNotes, currentFeedback, gate)` requires the gate** and throws without it. `reviewPayload` throws on an unknown action and returns null on a blank send-back.
- **At the cap, a failing fact check outranks a passing evaluation**: `validationResults.passed` is false whenever the fact check holds structural issues.
- **Phase gate, render diff expectations** (plain diff against the baseline rendered from main): `outline-generation.txt` differs in the mode block, the `<INVESTIGATION_OBSERVATIONS>` section, the `<SHOULD_CONSIDER>` section before `<DIRECTOR_GUIDANCE>`, and the re-paired photo list; `outline-revision.txt` in the mode block, the system prompt's renumbered rules, the SHOULD CONSIDER list and the Ready line; `article-generation.txt` in the `<SHOULD_CONSIDER>` section only; `article-revision.txt` in the system prompt's rules, the SHOULD CONSIDER list, the Ready line and the standing-notes preamble. Anything else fails the gate.

## Rulings after wave 2 (the integrator's, 2026-09-20)

- **The automated budget is per round at every stop, the arc stop included**: a director send-back resets the automated counter at the arc stop as it does at the outline and article stops, so "Automated passes this round" is true everywhere.
- **A rollback to the article stop restarts the round numbering**: the rebuilt article is a fresh Round 1. Accepted as implemented.
- **Brief 1.2 covers SECTION 4.5 of the core arc prompt**: the investigation timeline's language markers are third-person and mode-neutral, and the rules for arc summaries name who did what without a presence claim. The party / investigation / post-investigation distinction stays.
- **The client shows no budget when the payload carries none** (the `|| 3` and `|| 2` fallbacks are gone); the reset keys at the outline and article stops carry both counters.
- **The arc stop's note is not kept across a page remount**, unlike the outline and article notes. Known difference, left for the review phase, where the note channel is reworked.
- **Render diff expectations gain** the `REVISION CONTEXT: <PHASE> (automated pass N)` header line in both revision prompts, and the article-generation prompt also differs in the reworded standing-notes preamble. The arc prompts are not rendered by the harness; SECTION 4.5 and the arc summary instruction are verified live.
