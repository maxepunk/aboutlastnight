# Before phase 4: three fixes

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development to implement this plan task by task. Each brief below is one task. Briefs carry no code (the director's standing ruling): an implementer reads the code and writes their own, test first.

**Goal.** Three fixes the director approved on 2026-10-02 go in before phase 4:
- the director's edits are final;
- photos are resized when the article is published;
- the printed article never shows two photos in a row.

**Spec.** `docs/superpowers/specs/2026-10-02-story-meeting-and-map.md`, sections 7 and 9, is the authority; where this plan and the spec differ, the spec wins. The vocabulary is `CONTEXT.md`'s.

**Why now.** Session 0926262, the first on phase 3 (spec section 2):
- The director edited ten paragraphs at the article stop, wrote that the copy should no longer be changed, and sent the article back only to move three photos that sat in a row. After that send-back the article judge made two of the director's edits must-fix, and the automatic rework changed both.
- The publish step put out 87.8 MB of photos, which had to be cut to 2.2 MB by hand.

Each fix spares the director a return or a hand fix in the next session, and none waits on phase 4's design.

**Tech stack.** Node 24, LangGraph JS, Claude Agent SDK 0.3.282 (Opus 5.5, Sonnet 5, Haiku 4.5), Express, a React-via-CDN console, Jest, `sharp` 0.34.5 (installed, Windows binary present).

## Global constraints

**Authority.** The spec decides. A conflict it does not settle goes to the integrator, who rules and records the ruling in the ledger.

**Model-facing text.** Load the `mattpocock-skills:writing-for-agents` skill before writing any text a model reads: a judge instruction, a rework instruction, a schema description, a label. State the target positively, each rule once with its reason. No em-dashes. Nova is never gendered. Use the vocabulary of `CONTEXT.md`: the director, an edit, a send-back, a rework, an automatic pass, the record.

**The director's words are never changed.** Notes, corrections, edits, accusation, epilogue and photo descriptions reach every call as written.

**No other changes.** No model, effort or pin changes. No npm install, update or ci: `sharp` is already installed. If a step seems to need a package, stop and report it.

**One source of truth.**
- A rule two places apply is one function, or one constant, both call.
- The console keeps its own copy of a server constant only where it cannot import it, and a test holds the two equal, as `REVISION_DIFF_IGNORED_KEYS` does.

**State channels.** This plan adds none. A new channel would need its Annotation in `lib/workflow/state.js`, a default in `getDefaultState` with the count in `__tests__/unit/workflow/state.test.js`, and a place in the `ROLLBACK_CLEARS` lists or `ROLLBACK_CLEARS_EXEMPT`.

**Console.** Logic that decides a payload, a label or a count goes into a dual-export pure module with node tests (`console/checkpoint-view-logic.js`). Components stay thin. There is no DOM harness, so the integrator's click-through covers the wiring.

**The detective theme is parked** (rule-set spec D13). The detective's prompts and criteria do not change for craft. A rule about the director's authority, or about layout, is theme-neutral and applies to both themes. Each slice names every hunk it causes in a detective render.

**Tests.**
- No live model calls. Jest maps the SDK to `__tests__/mocks/anthropic-sdk.mock.js`.
- Run the full suite before every commit and guard its exit code.
- Changes orphan tests across `__tests__/unit/workflow`, `lib/__tests__` and `__tests__/integration`, so the full suite is the check.
- No test reads `data/`: the repo is public. A test built from a real session's shape uses synthetic data in that shape.

**Docs.** When a slice changes behaviour that `reports/CLAUDE.md` or `docs/PIPELINE_DEEP_DIVE.md` documents, the same slice updates that text.

**Repo and data.**
- Never commit anything under `data/`, `outputs/report-0919269.html`, `outputs/sessionphotos/0919269/` or `.claude/launch.json`.
- Never read `.env`.
- The production database `data/checkpoints.sqlite` and the director's server on port 3001 are never touched. A render or a live check runs on a copy the integrator makes.

**Commits.** Messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bypass the pre-commit hook. Never `git stash`. The push to `origin` is the director's.

**Subagents.** Every seat runs on the session's model, Opus 5.5, with `model` left unpinned.

## What this changes for the director

- **Your edits stay yours.**
  - A judge that disagrees with a line you wrote, or with a cut you made, lists it for you as a concern. It never sends it back for a rework.
  - An automatic rework never changes your lines.
  - Your edits stand until you approve, across every send-back at that stop.
  - When a send-back's structural change means one of your edits no longer fits, the stop lists that edit, what it became and why.
- **Published pages load fast.** Each photo is published at web size, upright, with no camera metadata. Only the photos the article prints are published.
- **Photos never stack.** The printed article never shows two photos in a row, and a send-back to fix that is no longer needed.

## Tasks

| # | Task | Layers | Owns |
|---|---|---|---|
| F1 | The director's edits are final | plumbing, prompt, screen | `lib/hand-edit-diff.js`; the send-back arms of `buildResumePayload` and `handEditReport` in `getCheckpointData` (`server.js`); the `<HAND_EDITS>` block and the `buildRevisionContext` lines that render it (`lib/workflow/nodes/node-helpers.js`); `reviseOutline` and `reviseContentBundle` (`lib/workflow/nodes/ai-nodes.js`); the outline and article judges' prompts, the verdict guard and `buildFactCheckArgs` (`lib/workflow/nodes/evaluator-nodes.js`); `lib/content-bundle-fact-check.js`; the judge argument lists in `scripts/lib/render-calls.js`; `steeringView` and `evaluationView` in `console/checkpoint-view-logic.js`; `console/components/RevisionDiff.js` and `EvalBar` in `console/utils.js`; their tests |
| F2 | Photos resized at publish | plumbing | `lib/workflow/nodes/template-nodes.js`; a new module for publishing photos; their tests |
| F3 | Never two photos in a row | plumbing | `lib/template-assembler.js`; a new module for spacing photos; their tests |

- One wave: F1, F2 and F3 run in parallel, each in its own worktree, from the branch `fix/before-phase-4`.
- The integrator merges F3, then F2, then F1, rebasing each onto the last.
- `reports/CLAUDE.md` is shared: each slice edits only the paragraphs that describe its own behaviour, and the integrator merges them.

## Gates

1. **The suite**, at the branch head, exit 0.
2. **The prompt renders.**
   - Render 092026, 092626 and 0926262, both themes, with `scripts/render-prompts.js` on a copy of the checkpoint database, and compare against renders from `main`.
   - The stored threads hold no standing edits, so every render matches `main` apart from a hunk a slice names.
   - Render the outline and article judges and reworkers once more from a state with planted edits, and read the new sections.
3. **Function checks, no model calls.**
   - F2: publish 0926262's printed photos from a scratch copy of its photo folder into a scratch output. Expect eleven files, about 2.2 MB in all, each upright and no more than 1600 px on the long edge.
   - F3: assemble 0926262's first draft from its call log through the assembler, and confirm no two photos are adjacent.
4. **One live judge call.**
   - Cut a fixture thread from a copy of the database: 0926262 at the checkpoint after the director's article send-back was reworked, before the article evaluation.
   - Resume it on a throwaway port.
   - It passes when the judge's two findings about the director's edits arrive as concerns, not must-fix, no automatic rework runs, and the article stop loads showing them.
   - One Opus call, about five minutes.
5. **The click-through**, on fixtures with planted reports: the list of changed edits with their reasons, and the concerns about the director's edits, at the outline and article stops.
6. **The final review**, on Opus 5.5.

The branch then merges to local `main`. It is pushed when the director asks.

---

## Brief F1: the director's edits are final

**Intent.** An edit is the final word on its text (`CONTEXT.md`). Spec section 7 states the rule:
- An automatic pass never changes a line the director wrote.
- A judge that disagrees with one lists it for the director, beside the line. It never makes it a must-fix.
- A send-back may change one of the director's edits only where the structural change the note asks for means the edit no longer fits. The stop then lists each edit that changed, and why.

On 0926262 the article judge, after the director's send-back, flagged two of the director's edits:
- the rewritten closing stated Alex's motive as fact (T1);
- the cut paragraph of open questions left one debated theory unreported (T2).

The automatic rework then changed both. Today:
- **The judges never see which text is the director's.** Nothing in `evaluator-nodes.js` reads `_outlineHandEdits` or `_articleHandEdits`.
- **The rework's block is wrong on an automatic pass.** `<HAND_EDITS>` (`buildRevisionContext`, `node-helpers.js`) asks the rework to keep the edits "unless the director's feedback above asks to change them". It also says "the evaluator's notes above were written before these edits". On an automatic pass there is no feedback above, and the judge has read the edits. So a keep request sits beside a must-fix order, and the order wins.
- **The code checks can fire on the director's text.** In `lib/content-bundle-fact-check.js`, an edited card fails card fidelity, a cut that removes a player's only mention fails roster coverage, and either sends the article to an automatic rework.
- **Each send-back resets the record of edits.** `buildResumePayload` nulls `_xHandEdits` and keeps only that send-back's diff. This is C3 of the steering spec of 2026-09-19, made against stale paths. So an earlier round's edits lose their protection at the next send-back.
- **The stop gives no reason.** It says only which scopes changed, and only for the last pass.

**Plumbing.**

1. **The director's edits stand at their stop** (`lib/hand-edit-diff.js`; the send-back arms in `server.js`).
   - The edits stand across every send-back at that stop. The approve branch, a rollback and a fresh start clear them, as today.
   - At each send-back, the new diff joins the edits still standing from earlier rounds.
   - An earlier edit still stands while the version the stop showed carries its text, and a cut stands while the text it removed stays absent. The survival check meets C3's concern about stale paths, so this replaces C3's reset.
   - An edit a rework changed, which the director then saw at the stop and left as it was, no longer stands.
   - Each edit carries an id that is stable within its stop (E1, E2, …). It keeps that id as it carries forward, and a new edit takes the next number.
   - Approve-with-edits is unchanged: no rework follows it.
2. **The judges see the director's edits** (the outline and article judges in `lib/workflow/nodes/evaluator-nodes.js`, both themes).
   - The judge's user prompt lists the standing edits by id. Each line carries the section and the director's text, or for a cut the text the director removed, labelled as the director's text, which is record.
   - The judge scores the writer's text. A disagreement with one of the director's edits goes in `advisoryWarnings`, opening with one fixed prefix and the edit's id, such as `Director's edit E3:`, then the rule id.
   - It never goes in `structuralIssues` and never lowers a criterion's score.
   - The prefix is one constant, shared by the prompt, the guard below, the fact check and the console.
   - `scripts/lib/render-calls.js` repeats every argument the judge builders now receive (`__tests__/unit/scripts/render-calls.test.js` pins it).
3. **A code guard on the verdict** (`createEvaluator`, after the judge returns and before readiness is decided).
   - A structural issue that quotes text from a standing edit, or from the text a cut removed, moves to `advisoryWarnings` under the prefix, with that edit's id.
     - The quote is matched with `lib/grounding.js` (`isVerbatimIn`; the quoted passages in an issue).
     - An issue quoting writer text stays structural.
   - A truth criterion holds the output only while an issue under its rule ids is still structural, or while its own notes quote writer text.
   - When every structural issue has moved and no truth criterion still holds, the output is ready.
4. **The fact check respects the director's edits** (`lib/content-bundle-fact-check.js`, through `buildFactCheckArgs`).
   - A structural hit located in the director's text, or caused by the director's cut, becomes an advisory under the same prefix:
     - an inline card whose block is one of the director's edits;
     - a reporter-mode phrase inside a block the director wrote;
     - a photo reference in a block the director placed;
     - a roster player whose only mention the director cut.
   - Every other hit keeps its status.
   - Existing message prefixes stay exactly as they are, because the console groups by them.
5. **The rework** (the `<HAND_EDITS>` block in `buildRevisionContext`; `reviseOutline` and `reviseContentBundle` in `ai-nodes.js`).
   - The block lists the standing edits by id and section, each with the director's text, in one of two wordings:
     - **On an automatic pass:** each edit stays exactly as written, because an automatic pass fixes the writer's text and the director's lines are final.
     - **On a send-back:** each edit stays exactly as written, unless the structural change the director's note asks for means it no longer fits. For each edit the rework changes or removes, it returns the edit's id and one sentence on why.
   - The sentence about the evaluator's notes predating the edits goes, because the judge now reads the edits.
   - The rework call's structured output gains that list of changed edits and reasons.
     - It comes through a schema built in code from the stored schema.
     - The node takes the list out before it stores the output, so no later prompt, check, console view, template or approved bundle meets it.
     - `lib/schemas/*.json` do not change.
6. **The report** (`_outlineHandEditReport`, `_articleHandEditReport`; `handEditReport` in `getCheckpointData`).
   - It accumulates over the round's passes instead of each pass overwriting the last.
   - For each standing edit a pass changed, it records:
     - the edit's id and section;
     - the director's text;
     - what the text became, or that it is gone;
     - which pass changed it: the director's send-back, or automatic pass N;
     - the rework's reason, or that none was given.
   - The survival check covers cuts as well: a cut whose text came back counts as changed.
   - A change made by an automatic pass is marked. It should never happen, and when it does the director needs to see it.
   - Shape the report as the console needs it, and document the shape in `reports/CLAUDE.md`.

**Screen.** At the outline and article stops:
- **The edits a rework changed**, one line each: the section, the director's text and what it became, and the reason. A change by an automatic pass is flagged. This goes through `steeringView` into `RevisionDiff`.
- **The judges' concerns about the director's edits**, under their own heading. They sit apart from the must-fix items and the other advisories, and never count as unresolved on the approve button. This goes through `evaluationView` into `EvalBar`, and through the article stop's fact-check groups for the fact check's concerns.

Marks beside the paragraph come with phase 4's desk. Here the list names the section and quotes the line.

**Invariants.**
- An automatic pass is never handed a must-fix item located in the director's text.
- The director's text reaches the judges and the reworks exactly as written.
- The list of changed edits never reaches a stored output, a template, a check, or a writer's or judge's prompt after the rework that wrote it.
- Every existing message prefix, criterion and routing rule is unchanged outside the cases above.

**Tests.** Each fails before the change and passes after.
- **Standing edits:**
  - an earlier round's edit stands after a send-back without edits when its text survives, and drops when the shown version changed it;
  - a cut stands while its text stays absent;
  - ids are stable across rounds;
  - approve and rollback clear the edits.
- **The judge prompt** lists the standing edits with ids and section, and carries no such section when there are none.
- **The guard:**
  - a structural issue quoting the director's text moves to advisories under the prefix;
  - an issue quoting writer text stays structural;
  - a truth criterion whose issues all moved does not hold;
  - the output is ready when every issue moved.
- **The fact check:** each of the four located cases becomes an advisory, while the same defect in writer text stays structural.
- **The rework block:** both wordings, with ids. The list of changed edits is absent from the stored output.
- **The report:**
  - it accumulates across a send-back's rework and an automatic pass, with the pass and the reason;
  - an automatic pass's change is flagged;
  - a cut that came back counts as changed.
- **0926262's shape, synthetic:**
  - the director's closing states a motive, and the director cut a paragraph holding a debated theory;
  - a mocked judge flags both as structural after the send-back's rework;
  - the verdict is ready, the findings are concerns, and the graph routes to the stop with no automatic rework.
- **The console:** view models for both lists, with and without entries. Each server constant the console copies is held equal by a test.

**Verification.** No model calls. From a state with planted edits, render the outline and article judges and reworkers through `scripts/lib/render-calls.js`. Read each new section and record it in your return. The live judge call is the integrator's, at gate 4.

**Done.** Every test above passes and the full suite is green.

**Out of scope.**
- Marks beside a paragraph (phase 4's desk).
- The story meeting and the map, where the same rule will hold (phase 4).
- The arc stop: it has no edits.
- Restoring by code an edit an automatic pass changed (ruling below).

---

## Brief F2: photos resized at publish

**Intent.** The published page should load quickly for the players reading it, often on a phone. Today `assembleHtml` (`lib/workflow/nodes/template-nodes.js`) copies every top-level file of `data/<id>/photos` to `outputs/sessionphotos/<id>/` at full size (`copySessionPhotos`). It also publishes, into a public repository, files the article never prints: a photo the director excluded, or a whiteboard photo when it sits in that folder.

0926262's eleven photos came to 87.8 MB, and were cut to 2.2 MB by hand (commit `715c86e`): 1600 px on the long edge, JPEG quality 85, sRGB, all metadata removed, filenames unchanged.

**Plumbing.**
- **A module for publishing photos** (new, beside `template-nodes.js` or in `lib/`):
  - **The printed photos.** The list of photos the page prints, read from the bundle: the hero on the journalist page (the detective layout prints none) and every photo block in the sections, each filename once.
  - **Publishing each one.**
    - Read it from `data/<id>/photos/<filename>` and write it to `outputs/sessionphotos/<id>/<filename>` under the same name.
    - Turn it upright from its EXIF orientation first: stripping the metadata without rotating would turn a portrait photo on its side.
    - Then fit it to at most 1600 px on the long edge, never enlarged, in sRGB, with no metadata.
    - A JPEG is written at quality 85. Any other format is re-encoded in its own format, so the name still matches the content.
  - **A missing photo.** A printed photo missing from the folder throws, naming the file and the folder. The page would otherwise show a broken image, and the fact check has already checked every reference.
- **`assembleHtml`** publishes the printed photos in place of copying the folder. `photosCopied` stays, as the count published.
- **Files already in the published folder** are left as they are.

**Invariants.**
- Filenames are unchanged: the HTML names them verbatim, spaces and brackets included.
- The HTML is unchanged.
- Nothing is written outside `outputs/sessionphotos/<id>/`, and the source folder is never changed.
- A photo the page does not print is not published.

**Tests.** Each fails before the change and passes after. Make the images in the test with `sharp`; no file comes from `data/`.
- A large landscape photo comes out at 1600 px on its long edge.
- A portrait photo stored sideways with EXIF orientation 6 comes out upright.
- No output carries EXIF or an ICC profile, and each is sRGB.
- A small photo is not enlarged.
- A PNG stays a PNG.
- Only printed photos are written: an unprinted file and the whiteboard are not.
- The hero is published for the journalist theme only.
- A missing printed photo throws, naming it.

`lib/__tests__/assemble-html-photo-copy.test.js` (its 5-byte files cannot be decoded) and `__tests__/unit/workflow/assemble-html-backstop.test.js` move to the new contract.

**Verification.** No writes under the repository's `outputs/`.
- Copy 0926262's photo folder (`data/0926262/photos`) and its approved bundle (`data/0926262/output/content-bundle.approved.json`) into a scratch folder.
- Publish into a scratch output.
- Record the file count, the total size, each file's dimensions, and that each is upright.

**Done.** Every test above passes, the full suite is green, and the verification is recorded.

**Out of scope.**
- The photo analysis's own resize, which feeds Haiku, not the page (phase 9).
- The standalone skill's publish step, which is a manual copy that phase 4 rewrites with the skill path.
- The emailer.

---

## Brief F3: never two photos in a row

**Intent.** Three photos in a row, across THE PLAYERS and WHAT'S MISSING, were the director's only reason for sending 0926262's article back. That send-back set off the judge pass that rewrote the director's edits. Spec section 9: assembly moves the second photo below the next paragraph.

**Plumbing.**
- **One pure function**, in a new module, that spaces the photos of a bundle's sections.
  - `TemplateAssembler.buildContext` (`lib/template-assembler.js`) calls it before it maps the sections, for both themes.
  - So the publish step, the article stop's preview and `scripts/assemble-article.js` all print the spaced order.
- **The rule.**
  - Read the article's blocks in order across sections. A section heading separates nothing.
  - A photo never directly follows another photo. On the journalist page the hero counts as a photo just above the first block.
  - A photo that would follow a photo waits. The waiting photos are placed in their order, one directly after each later paragraph block.
  - A photo still waiting at the end of the article goes directly after the last paragraph that has no photo after it.
  - Only photo blocks move, and they keep their order among themselves. A placed photo belongs to the section of the paragraph it follows.
- **What is stored stays as written.** The stored bundle, the approved bundle and the console's editors keep the writer's order. The spacing happens only in what prints.

**The test case,** in 0926262's draft shape with the hero printed:
- **Input:** `[the-players] P PH1 P P PH2 PH3 [whats-missing] PH4 P [closing] P quote PH5 P P P`.
- **Output:** `[the-players] P PH1 P P PH2 [whats-missing] P PH3 [closing] P PH4 quote PH5 P P P`.

**Invariants.**
- No block other than a photo moves.
- No photo is dropped or duplicated.
- No input object is mutated.
- A bundle with no adjacent photos prints exactly as before, so spacing is idempotent.

**Tests.** Each fails before the change and passes after.
- The test case above.
- A photo first in the lede, under the hero.
- A run with no paragraph after it.
- The detective theme, which has no hero.
- A bundle with no photos, and one already spaced, both unchanged.
- No input mutated.
- A context-level test through `buildContext`.

**Verification.** Assemble 0926262's first draft through the assembler: `data/0926262/llm-log/20261002-170931-generateContent-0cf5ac7d.json`, the bundle in `response.full`. Record that no two photos are adjacent, and which photos moved.

**Done.** Every test above passes, the full suite is green, and the verification is recorded.

**Out of scope.**
- Moving blocks at the director's desk (phase 4).
- Captions (phase 9).

---

## Rulings (the integrator's, 2026-10-02)

- **The director's edits stand across the stop's rounds.**
  - Why: the spec's rule has no round limit, and C3's reset was a guard against stale paths, which the survival check also meets.
  - Cost if wrong: an edit the director meant to abandon stands until the director approves.
- **Concerns travel in `advisoryWarnings` under one prefix,** not a new field in the evaluation schema.
  - Why: the advisory list already reaches the stop, the history and the trace, and the console already groups the fact check's advisories by prefix.
  - Cost if wrong: a concern the judge writes without the prefix shows among the other advisories, where the director still reads it.
- **No code restores an edit an automatic pass changed.**
  - Why: the guard removes the reason a pass would touch one, R23 keeps everything else word for word (97 to 100% on 0926262), and the stop flags any change. Restoring by code means splicing blocks by fingerprint, which is phase 11's.
  - Cost if wrong: an automatic pass that rewrites a neighbouring line could alter an edit. The stop flags it, and the director restores it.
- **The list of changed edits lives only in the rework call,** and the node removes it.
  - Why: nothing downstream has to strip it, and the stored schemas stay as they are.
  - Cost if wrong: none to the article; the reasons reach the stop through the report.
- **The rule on edits is theme-neutral.** It is about the director's authority, not writing craft, so the parked detective follows it, named as a detective hunk.
  - Cost if wrong: one detective hunk to revert.
- **Only printed photos are published.**
  - Why: an excluded photo or the whiteboard has no place in a public folder, and the page never names it.
  - Cost if wrong: a later hand edit of the published page that adds a photo needs that photo copied by hand, as the refinement notes already say.
- **Spacing happens at assembly, not in the stored bundle.**
  - Why: every printing path gets it, and it is the one place the printed order is decided.
  - Cost if wrong: the console's editor order differs from the preview's in the rare case of adjacent photos.
