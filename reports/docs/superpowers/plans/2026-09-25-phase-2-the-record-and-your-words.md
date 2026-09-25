# Phase 2: the record and your words reach every call

Design sources: `docs/superpowers/specs/2026-09-24-information-architecture.md` (the map, the root causes and the decisions of 2026-09-25), the roadmap's phase 2 section, and `CONTEXT.md` for the vocabulary. Every line reference below comes from the surveys taken at `main` `b3d1a1a` on 2026-09-24, kept locally in `.superpowers/sdd/2026-09-24-phase-2/surveys/` (`rework-inputs.md`, `passes-and-stops.md`, `cards-and-fact-check.md`, `sdk-and-model.md`) and `.superpowers/analysis/2026-09-24-information-architecture/surveys/` (`upstream-and-director-inputs.md`, `judges-and-craft.md`). Re-read the code before editing: the numbers say where to look, not what to type.

## What this phase changes for the director

The pipeline's Opus calls run on Opus 5.5. Every call that decides, writes, reworks or judges the story sees the whole record: every usable document in full, each labelled the same way with its id, kind, name, owner and layer, and buried memories as transactions only. The director's own words travel beside their parse instead of being replaced by it. That covers the full accusation, each photo description word for word, the input-review corrections, the session report's exposure column, and standing notes at the arc stop. A rework sees everything its writer saw. A judge sees what it judges, and its score is labelled uncalibrated. The card check reads only printed text and no longer sends a reworker to delete a correct card. A remote article shows the reporter's absence through attribution instead of announcing it. At the outline and article stops a panel shows each automatic pass: why it ran and what it changed.

## Slices, in build order

| # | Slice | Layers | Depends on |
|---|---|---|---|
| 2.0 | The SDK and Opus 5.5 | plumbing, docs | none |
| 2.1 | One record view | prompt, plumbing | 2.0 merged |
| 2.2 | Your words as record | screen, plumbing, prompt | 2.0 merged |
| 2.3 | Reworkers see what their writers saw | prompt, plumbing | 2.1, 2.2 |
| 2.4 | Judges that see what they judge | prompt, screen | 2.1, 2.2 |
| 2.5 | Checks and cards | plumbing, prompt, screen | 2.0 merged |
| 2.6 | The reporting-mode lines | prompt, plumbing | 2.0 merged |
| 2.7 | The trace | plumbing, screen | 2.0 merged |

- **Landing.** 2.0 is one task. It merges to `main` alone, after its own gate.
- **Wave 1** runs five tasks in parallel from the phase branch cut after 2.0 merges: 2.1, 2.2, 2.5, 2.6 and 2.7. 2.1, 2.2, 2.5 and 2.6 all touch `lib/prompt-builder.js`, in different sections. Expect small rebase conflicts, and integrate them in the order 2.1, 2.2, 2.6, 2.5, 2.7.
- **Wave 2** runs two tasks in parallel, cut after wave 1 lands: 2.3 and 2.4.
- 2.1 to 2.7 merge to `main` together after the phase gate.

## Shared rules for every slice

- **Vocabulary.** Use `CONTEXT.md`'s terms in code comments, new payload keys and screen copy: stop, round, note, edit, send back, rework, check, evaluation, writer, record, evidence card, evidence reference, trace, automated budget. Existing identifiers keep their names.
- **Prompt changes.** Only the changes a brief names. No craft file under `.claude/skills/*/references/prompts/` changes unless a brief names the line. Every other rule conflict waits for phase 3's rulings. The integrator reads a plain diff of `scripts/render-prompts.js` output against a baseline rendered from `main` after 2.0 merges. Every hunk must be one a brief names, and the reviewer reads the diff too.
- **One source of truth.** A section that two prompts share is built by one function that both call, never copied. This is how "a reworker sees what its writer saw" and "a judge sees what it judges" stay true after later edits.
- **State channels.** A new channel needs:
  - its Annotation in `lib/workflow/state.js` (LangGraph drops undeclared keys; post-mortem at `server.js:332–334`);
  - a `getDefaultState` default, and the exact set and the count (76) in `__tests__/unit/workflow/state.test.js` (199–309, 460–464);
  - membership in the `ROLLBACK_CLEARS` lists (`state.js:1094–1313`, 11 points) or in `ROLLBACK_CLEARS_EXEMPT`;
  - for an append reducer, `APPEND_REDUCER_FIELDS` (`lib/api-helpers.js:28`) and the three test sets named in `passes-and-stops.md` Step 4.

  Add a channel only where a brief says so.
- **Console.** Logic that decides a payload, a label or a count goes into a dual-export pure module (`console/checkpoint-view-logic.js` or a sibling) with node-env tests. Components stay thin. A new module destructured at load time must load before its consumers (`console/index.html:19–59`; pinned by `__tests__/unit/console-checkpoint-order.test.js`). There is no DOM harness, so the gate's click-through covers the wiring.
- **Tests.** No live model calls: Jest maps the SDK to `__tests__/mocks/anthropic-sdk.mock.js` (`jest.config.js:8–10`). Run the full suite before every commit and guard the exit code; a grep on the output masks a failure. Fail-loud changes orphan tests across `__tests__/unit/workflow`, `lib/__tests__` and `__tests__/integration`, so always run the broad sweep.
- **Docs.** When a slice changes behaviour that `reports/CLAUDE.md` documents (payload keys, the fact check, reporting mode, model pins), the same task updates that text.
- **Repo and data.** The repo is public. Nothing under `data/` is committed, and neither are `outputs/report-0919269.html`, `outputs/sessionphotos/0919269/` or `.claude/launch.json`. Never read `.env`. The production database `data/checkpoints.sqlite` is never opened by a test or a gate. Every live pass runs on a copy through `CHECKPOINT_DB_PATH`, on a throwaway port, with a throwaway password and `LLM_CALL_LOG_DIR` in scratch space.
- **Commits.** Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never bypass the pre-commit hook. The push to `origin` is the director's.

## Gates

**The 2.0 gate** (the integrator runs it before 2.0 merges):
1. The full suite, broad sweep, exit 0.
2. The probe scripts from brief 2.0, run live on the new SDK:
   - every pipeline-shaped call reports 0 or 1 tools at `init`;
   - no memory paths load;
   - thinking streams readable text;
   - the content-bundle call's structured output arrives through the SDK channel and not the text fallback. The probe fails on the fallback.
3. A live run on a copy of the 092026 thread, rolled back to input review and auto-approved through to the article on today's prompts. It makes every kind of call: Haiku, Sonnet and Opus; text, structured and image. For every call, read the served model from the result's `modelUsage` and record the call's duration next to its 092026 duration (`sdk-and-model.md` Step 4). An Opus call served by any model other than `claude-opus-5-5` fails the gate.

**The phase gate** (after wave 2, once):
1. The full suite, broad sweep, exit 0.
2. The plain prompt diff against the baseline rendered after 2.0: every hunk is named by a brief.
3. A live run on a copy of the 092026 thread, rolled back to **input review**. It starts there, not at arc selection, because 2.1 changes preprocessing and 2.2 changes the parse; neither runs again on a rollback to arc selection. Read the call log at every step.
   - **Input review.** Send back with one correction, using the 092026 quote-speaker correction. The next parse's records hold it, and so do the later writers' prompts, beside the uncorrected notes.
   - **Pre-curation.** The Haiku summaries read as summaries of the memories' text, not their names.
   - **Arc stop.** The `generateCoreArcs` and `enrichWithInterweaving` prompts hold the record view: every usable document, full text, labelled. They also hold the full accusation. Send back with a note. The `reviseArcs` prompt holds the record view, the writer's other sections and the note. The reworked arcs keep an interweaving plan. Approve with guidance.
   - **Photos and character IDs.** Enter the director's 092026 descriptions (take them from the copy before rolling back). The `generateOutline` prompt holds each description word for word.
   - **Outline stop.** The outline judge's prompt holds the record view, every photo and the real interweaving plan. Send back with a note and one hand edit. The `reviseOutline` prompt holds the writer's sections, the record view, the note and the edit. Approve with a note.
   - **Article stop.** The `generateContent` prompt holds the record view once, with no five-per-arc cap, plus the full accusation and the photo descriptions. The article judge's prompt holds the record view, the roster with pronouns, the notes and the fact check's result. The score is labelled uncalibrated. If an automatic pass ran, the trace panel shows it; in either case the trace is also checked from a fixture in step 4. Send back with a note. The `reviseContent` prompt holds the writer's sections and the record view.
   - **Throughout.** No inline card is removed for want of its source. A remote article states the reporter's absence at most once.
4. A click-through of every changed screen: the input review, the arc stop note after a reload, the character-IDs stop, the outline and article stops (the uncalibrated label, the trace panel with a fixture thread if no live pass occurred, the sidebar entry editor).
5. The final whole-phase review, on Opus 5.5.

---

## Brief 2.0: the SDK and Opus 5.5

**Intent.** The pipeline's Opus calls run on Opus 5.5. Today they run on Opus 4.8 because `lib/llm/client.js:72–76` pins `claude-opus-4-8`. A probe on 2026-09-24 showed the installed Agent SDK cannot reach 5.5: the API answered "Claude Code 2.1.119 does not support this model; version 2.1.280 or newer is required". This slice upgrades the SDK across the 0.2 to 0.3 bump, which touches every call, and changes the pin. It lands alone so a later failure can be told apart from the prompt changes.

**Plumbing.**
- **Packages.** `@anthropic-ai/claude-agent-sdk` goes from `^0.2.119` to the 0.3 line at 0.3.282 or later, whose bundled CLI is 2.1.280 or later. The 0.3 line moved `@anthropic-ai/sdk` (at least 0.93.0; 0.81.0 is installed; no pipeline code imports it) and `@modelcontextprotocol/sdk` (^1.29.0, satisfied) to peer dependencies at 0.3.143. `package.json` and `package-lock.json` change. The 0.3 entry is still the ESM-only `sdk.mjs` that `client.js:18` already loads with `require()` on Node 24. Confirm that with the first `require` in the worktree.
- **The pin.** `MODEL_IDS.opus` becomes `claude-opus-5-5`. `EFFORT_LEVELS` stays (`xhigh`; the director-notes enricher keeps `medium` at `lib/director-enricher.js:293`). Opus 5.5 defaults to `medium`, and every Opus call already sends its effort explicitly.
- **Declined requests.** Since 0.3.162 a refusal carries `stop_reason: "refusal"` and `stop_details` (with a category) on the assistant message. The wrapper reads neither (`client.js:402–428`), so today a refused schema call fails as a schema mismatch and a refused text call returns the refusal as content.
  - The wrapper recognises a refusal and throws an error that names it and its category.
  - `lib/llm/retry.js` classifies it as permanent.
  - The name survives the four nodes that re-wrap errors into plain `Error`s (`arc-specialist-nodes.js:914`, `character-data-nodes.js:129`, `input-nodes.js:680`, `photo-nodes.js:506`). It also survives the paths that swallow errors into state (the evaluators at `evaluator-nodes.js:1225–1249`, `reviseArcs`, interweaving, the enricher), so the failure the director sees says "declined" with its category. Keep the original error as the cause, or carry a marker the classifier reads. The exact shape of a refusal in the 0.3 stream is unconfirmed: write the recognition from the 0.3.282 `sdk.d.ts` in the worktree and pin it with a mock-driven test.
- **What the gate reads.** The `init` forward (`client.js:485–492`) adds `memory_paths` and `effort`. `llm_complete` carries the served model from the result's `modelUsage`, so the call log can say which model actually answered. Changelog 0.3.174 added silent fallbacks, and today the log records only the alias.
- **Probes.** A new script (`scripts/probe-sdk-isolation.js` or similar) makes one pipeline-shaped call per model through `sdkQueryImpl`. It exits non-zero when:
  - `init` reports more than one tool;
  - any memory path loads;
  - no readable thinking text streams for Opus and Sonnet;
  - the served model is not the pinned id.

  `scripts/probe-content-bundle-channel.js` exits non-zero on `text_fallback`. `scripts/check-model-freshness.js` passes the same isolation options the wrapper does.
- **Small hygiene.** The server-start health call (`client.js:787–799`) passes `disableTools: true`. Under 0.3 the default tool set of an ungated call changed.

**Docs.** `reports/CLAUDE.md`:
- the model pins and roles (235–238: Opus runs arcs, outline, article, the three judges and the enricher; Sonnet runs the session-report and whiteboard parses, character IDs and paper scoring);
- the budget ceilings (231 says $5/$2/$0.50; the code has $100/$50/$10, and they only stop a runaway call because the pipeline runs on a subscription);
- the SDK version notes and the refusal behaviour.

In `client.js`, the comments at 228 and 231 that name 0.2.x.

**Invariants.**
- The npm change needs the director's go-ahead before it runs.
- The worktree gets its own `node_modules`, installed there, not a junction to the main checkout: the director's server on port 3001 runs from the main checkout's packages.
- The main checkout's packages change only at merge. The director stops the 3001 server first, the integrator runs `npm ci` in the main checkout, and the director restarts the server.
- The isolation options stay exactly as they are (`mcpServers: {}`, `strictMcpConfig: true`, `settingSources: []`, the env with `CLAUDE_CODE_DISABLE_AUTO_MEMORY`), pinned by `sdk-mcp-isolation.test.js` and `sdk-memory-isolation.test.js`.
- Every call keeps adaptive thinking with `display: 'summarized'`. Opus 5.5 cannot run without thinking, and the idle timer depends on streamed thinking text.

**Tests.**
- `lib/__tests__/context-window-beta.test.js:32–40` moves with the pin.
- `client-contract.test.js` gains the refusal cases: schema call, text call, and each re-wrap path by mock.
- `retry.test.js` gains the permanent classification.
- `client-progress-forward.test.js` gains the new `init` fields and the served model.

**Verification.** The 2.0 gate. On the first Opus call, check whether the `context-1m-2025-08-07` beta header is accepted, ignored or rejected; 5.5 has a 1M window natively. If it is rejected, send it only where the model needs it and record the ruling.

**Done.** The probes pass. On the 092026 copy every Opus call is served by `claude-opus-5-5`, every structured call arrives through the SDK channel, and every call's duration is recorded next to 092026's.

**Out of scope.** Any prompt change. Effort tuning beyond recording durations: lower an effort only if the gate shows a call running far longer than on 092026 with no gain the director can see, and only as a ruling in this document.

---

## Brief 2.1: one record view

**Intent.** Every call that decides, writes, reworks or judges the story sees the same record: every usable document in full, each labelled the same way. Buried memories appear as transactions only. Today the fidelity runs backwards:
- The Haiku preprocessor summarises each memory from its name.
- The arc writer reads those name-summaries and the first 200 characters of each paper document.
- The outline writer reads full text for at most five documents per arc. On 092026, 12 of the 37 documents the article writer used never reached it.
- Only the article writer reads the record whole.

The whole usable record of 092026 is about 68,000 characters, less than half the instructions the article writer already carries. This slice builds the view and puts it in the writers. The reworkers get it through 2.3, and the judges through 2.4.

**Prompt.**
- **One renderer.** A pure renderer, a new module under `lib/prompt-renderers/` beside `director-notes-renderer.js`, turns the evidence bundle into the record view. Each exposed document sits in its own tag, and the tag carries:
  - the id (`id`, else `tokenId`, else `notionId`: the same id the fact check keys on, `content-bundle-fact-check.js:291–315`);
  - the kind: memory, or the paper document's `basicType`;
  - the name;
  - the owner, from the record's own `owners[]` in `rawData`. The bundle's `owner` comes from the preprocessor's `ownerLogline`, is null on about half the tokens, and gave the paternity test the wrong owner on 092026;
  - the layer (`exposed`).

  The full text is the tag's body. Buried memories are listed separately as transactions: account, amount and time, with no id, owner or text. This follows the long-context practice of labelling each document with its source and metadata (`information-architecture.md` §4).
- **Placement.** Each prompt carries the view once, in its data part, before the rules. Per-arc sections (the outline's `<arc-evidence>`, the article's `ARC EVIDENCE PACKAGES`) list each arc's documents by id and keep the quotable excerpts, but stop repeating document text.
- **Where it goes in this slice:**
  - the arc writer's SECTION 3 (`buildCoreArcPrompt` 236–446; exposed items from `extractEvidenceSummary` 1213–1258). The buried transactions stay as they are;
  - the interweaving call (`buildInterweavingPrompt` 459–537);
  - the outline writer (`buildOutlinePrompt` 510–886), with the five-per-arc cap at 763 (detective 585) removed;
  - the article writer (`buildArticlePrompt` 907–1368; the package section at 926–945).

  The detective branches get the same view.
- **Instruction lines** that point writers at `arcEvidencePackages ... fullContent` (1163, 1184, 1263, 772–773) point at the documents in the record view instead. Keep the rest of those instructions: card-text changes belong to 2.5.

**Plumbing.**
- **Preprocessing.** The preprocessor reads each memory's full text. Its batch input (`evidence-preprocessor.js:318–335`) sends `rawData.description || text`, which memories do not have, so it sends the `fullDescription`. Its summaries stay summaries: they feed the pre-curation stop and curation's scoring context and nothing else. They no longer stand in for a document in any writer's prompt.
- **Character extraction** (`character-data-nodes.js:45–131`) reads the director's selected paper documents (`selectedPaperEvidence`, as the preprocessor does at 100), not every fetched item. Its 30-token and 200-character caps (66–75) give way to the record view.
- **Labels on derived material.** Anything a machine produced carries a label that says so, wherever it reaches a writer or judge. That covers character context ("use for factual accuracy", `prompt-builder.js:69–85`, `arc-specialist-nodes.js:316–330`), contradiction notes ("verified to respect evidence boundaries", `prompt-builder.js:1085–1091`, `arc-specialist-nodes.js:420–429`), and Haiku photo descriptions ("ground truth", `evaluator-nodes.js:514`). Each gets a plain label saying who made it and that the record decides.
- **Rescued items.** A rescued paper item has no `id` and no `fullContent` (`processRescuedItems` 557–566). It enters the view with its Notion id and its description as text.

**Invariants.**
- `<DIRECTOR_GUIDANCE>` stays the last section of the outline and article prompts.
- Buried memories never carry an id, an owner or text in any prompt.
- The fact check's source map and the view use the same id rule, so a card's `tokenId` names a document the writer can see.
- A document the arc check removed from an arc still appears in the view: the view is the record, and arcs refer to it.

**Tests.**
- A new unit test file for the renderer: tag shape, owners from `rawData`, the buried list, rescued items, an empty bundle.
- `lib/__tests__/prompt-builder.test.js` and `arc-specialist-prompts.test.js`: the view appears once per prompt, with no five-per-arc cap.
- `lib/__tests__/evidence-preprocessor-buried.test.js` and its neighbours: the full text goes to Haiku for exposed memories, and nothing more than today goes for buried ones.
- `lib/__tests__/character-data-extraction.test.js`: reads the selection.

**Verification.** The prompt diff shows the view replacing the per-arc document text in the outline and article prompts and SECTION 3's exposed items in the arc prompt, and nothing else. In the phase gate, the four writers' records each hold every usable document in full.

**Done.** A document on 092026 that the outline writer never saw (for example `mar004`) appears in full in the `generateOutline` record.

**Out of scope.** The reworkers (2.3), the judges (2.4), card text (2.5, phase 5), anything that turns summaries into claims (phase 8).

---

## Brief 2.2: your words as record

**Intent.** What the director writes travels beside its parse and is never replaced by it. Today:
- The accusation is 2,899 characters at intake. The outline and article writers see `ACCUSATION: Marcus`, with no charge, for an overdose verdict.
- The photo descriptions stop at the photo parser.
- Input-review corrections reach only the parse. The uncorrected sentence stays in the notes every writer reads.
- The session report's "Exposed By" column is dropped at the parse, which the director calls a loss.
- Standing notes never reach the arc prompts, so a second send-back at the arc stop loses the first note.
- An arc rework drops the interweaving plan.

**Plumbing and prompt, by input.**
- **Accusation.**
  - The raw text (`state.accusation`) is stored with the parse, including on disk beside `inputs/session-config.json`. It reaches the arc writer, the outline writer and the article writer as the director's words, beside the parsed accused and charge.
  - The outline and article `SESSION_FACTS` (`prompt-builder.js:816`, 1204; built at `ai-nodes.js:936–943`, 1260–1267) carry the charge too.
  - A verdict with no culprit gets its own shape in the parse schema (`SESSION_CONFIG_SCHEMA`, `input-nodes.js:65–106`): the verdict and its kind, with `accused` allowed to be empty. No downstream line prints the victim as the accused. Kinds include an accident, an overdose and self-harm.
  - The arc check's accusation-arc rule (`validateArcStructure` 1615–1621) accepts an arc about that verdict. So does the enricher's accusation block (`director-enricher.js:157–164`), which also stops dropping `notes`.
- **Photo descriptions.**
  - The character-IDs stop sends each photo's description as its own field, keyed by filename, beside the raw text it builds today (`console/components/checkpoints/CharacterIds.js:74–94`). The server stores it in state (a new channel) and in the session folder.
  - The outline writer's `<available-photos>` (742–755) and the article writer's arc photos (927–945) render each description word for word, with the filename and the identified names. The outline writer's list stops using Haiku's pre-identification description.
  - Pairing is by filename everywhere, not by array index; `CharacterIds.js` pairs by index today.
- **Corrections.**
  - Input-review corrections (`_inputCorrections`, cleared at `input-nodes.js:771–775`) are kept for the session in a new channel: the director's text, in order.
  - Wherever the director's notes are rendered (`director-notes-renderer.js`, used by the arc, outline and article writers), the corrections follow them under a label saying they are the director's and override the notes where they differ. The notes themselves are never rewritten.
  - The whiteboard parse gets the corrections block too (`image-prompt-builder.js:38–65`).
- **The session report.** Parse step 2 (`SESSION_REPORT_SCHEMA`, `input-nodes.js:111–178`) keeps, for each exposed memory:
  - who exposed it (the "Exposed By" team);
  - the exposure time;
  - its owner.

  They go to state and to `inputs/orchestrator-parsed.json`, and the input-review stop shows them. **Until phase 3 rules on naming exposers, they do not enter any writer's prompt.** Three instructions about naming exposers conflict today (`judges-and-craft.md` C4), and data a writer cannot yet use correctly is better held than half-governed.
- **Whiteboard.** `playerFocus.whiteboardContext` reaches the outline and article writers as well as the arc writer, under the same label.
- **Notes at the arc stop.**
  - The arc writer and arc reworker render standing notes, through `filterGateNotes` with the gate `arc-selection`, the same way the outline and article prompts do (`prompt-builder.js:117–127`, 209–220). The arc prompts are built in `arc-specialist-nodes.js`, outside `PromptBuilder`, so share the function rather than copying it.
  - The arc stop's note survives a page reload, as the outline and article notes already do. This is a known gap from phase 1.
- **The interweaving plan.** `reviseArcs` asks for the plan and keeps it. Its schema (`PLAYER_FOCUS_GUIDED_SCHEMA`) already allows `interweavingPlan` and per-arc `interweaving`. Its success return (1007–1022) stores the plan in `_arcAnalysisCache` instead of dropping it.

**Screen.**
- The input review shows each exposed memory's exposer, time and owner.
- The character-IDs stop sends the per-photo map. Its visible behaviour is unchanged.
- The arc stop keeps its note across a reload.

**Invariants.**
- The director's text is never paraphrased where it is rendered as the director's.
- `rawProse` stays the caller's string (`director-enricher.js:326–328`).
- Every new state channel follows the shared rules. The photo descriptions and the corrections are cleared at the same rollback points as the parse and the character IDs they belong to.

**Tests.**
- The parse schema tests for the no-culprit shape.
- `director-enricher.test.js` for the accusation notes.
- `lib/__tests__/prompt-builder.test.js` for the accusation, corrections, photo descriptions and whiteboard in the outline and article prompts.
- `arc-specialist-prompts.test.js` for standing notes and corrections.
- `server-build-resume-payload.test.js` for the per-photo map.
- The `reviseArcs` tests for the kept plan.
- `console/__tests__` for any new pure view logic.

**Verification.** The prompt diff shows the new sections. In the phase gate, the writers' records hold the full accusation, the correction beside the notes, and each photo description word for word, and the reworked arcs carry a plan.

**Done.** On the 092026 copy, the `generateContent` record holds the charge "accidental overdose" with no accused, and photo 7's description as the director typed it.

**Out of scope.** Exposers reaching writers (after phase 3). Caption checks, exclude and the removal of the Haiku rewrite (phase 9). Direct edits of the parse (phase 13).

---

## Brief 2.3: reworkers see what their writers saw

**Intent.** A rework runs with everything its writer had, plus the previous version, the findings and the director's notes and edits.
- **Today's article reworker** has no document text, outline, roster, pronouns, money figures, observations or most craft rules. On 092026 it deleted four correct cards.
- **Today's outline reworker** has the selected arc ids and three evidence counts.
- **Today's arc reworker** lacks the whiteboard, the investigation focus, character context, the generation rules, the boundaries, temporal awareness, the tensions and the three-lens requirement.

`rework-inputs.md` Step 2 lists every missing section per stop.

**Prompt.**
- **By construction.** Each stop's reworker is built from the same section builders as its writer, then the revision block (the revision context from `buildRevisionContext`, the previous version, `<HAND_EDITS>`) and `<DIRECTOR_GUIDANCE>` last. Build it by construction, not by copying sections, so later changes to a writer reach its reworker automatically.
  - **Arc stop.** `buildArcRevisionPrompt` (1138–1200) and `getArcRevisionSystemPrompt` (1088–1128) gain the writer's system content and user sections from `buildCoreArcPrompt`, including the record view from 2.1 and the notes and corrections from 2.2.
  - **Outline stop.** `buildOutlineRevisionPrompt` (`ai-nodes.js:1168–1210`) and `getOutlineRevisionSystemPrompt` (1129–1156) gain the outline writer's system prompt (section rules, editorial design) and its whole user prompt. Two inputs the writer computes inline and never stores, `availablePhotos` (`ai-nodes.js:901–919`) and `sessionFacts` (936–943), are recomputed from state by a shared function.
  - **Article stop.** `buildArticleRevisionPrompt` (1634–1674) and `getArticleRevisionSystemPrompt` (1595–1623) gain the article writer's system prompt (roster with pronouns, hard constraints, evidence boundaries) and its whole user prompt. That includes the approved outline and the record view, and replaces the smaller `<RULES>` set with the writer's.
- **The banner.** A send-back rework's banner reads as the director's round, not "automated pass 0" (`node-helpers.js:1002`).
- **Fixed text stays for now.** The fixed "preserve, do not regenerate" lines in the revision rules (`node-helpers.js:1013–1019`, `ai-nodes.js:1133`, 1153, 1606, `arc-specialist-nodes.js:1108`) stay until phase 3 rules on them (`objectives.md` X28). Only the banner changes here.

**Invariants.** The revision context, the previous version, the hand edits, the kept/changed report and the note filtering behave exactly as phase 1 left them. `<DIRECTOR_GUIDANCE>` stays last.

**Tests.** `node-helpers-revision-context.test.js` for the banner. New tests assert that each reworker's prompt contains every writer section, by comparing section markers produced by the shared builders. `revise-hand-edits.test.js` and `increment-revision.test.js` stay green.

**Verification.** In the prompt diff, the three revision prompts grow by the writers' sections and change nothing else. In the phase gate, the `reviseArcs`, `reviseOutline` and `reviseContent` records each hold the record view and their writer's sections.

**Done.** On the 092026 copy, the `reviseContent` record holds the full text of every card's document.

**Out of scope.** Rework scope (phase 11). The preserve wording (phase 3).

---

## Brief 2.4: judges that see what they judge

**Intent.** The model judges see what they judge. Their scores are shown as uncalibrated until they are calibrated against the director's verdicts in phase 7. Today:
- The outline and article judges see no documents.
- The article judge is asked "are all roster members mentioned?" without a roster, and never sees the fact check's result.
- The outline judge sees 5 of 9 photos and a null interweaving plan.
- All eight model evaluations in 091826 and 092026 passed with no structural issues, including one that cited "I was not in that room" as good voice.

**Prompt.** In `evaluator-nodes.js#buildEvaluationUserPrompt` (652–818):
- **Arc judge** (654–744): the record view replaces the name-summaries and 100-character excerpts (664–669).
- **Outline judge** (746–795):
  - the record view;
  - every photo, with the director's description from 2.2, instead of `analyses.slice(0,5)` (769–770);
  - the real interweaving plan from `_arcAnalysisCache.interweavingPlan`. Today it reads two fields that do not exist (756).
- **Article judge** (797–818):
  - the record view;
  - the roster with pronouns, the same section the article writer gets;
  - the director's notes and corrections, and the full accusation;
  - the fact check's result for the bundle under review (`_articleFactCheck`, or the result computed at 1013–1022).

**Screen.** `EvalBar` (`console/utils.js:123–162`), through `evaluationView` (`console/checkpoint-view-logic.js:103–123`), labels the score as uncalibrated at all three stops, in one plain phrase. The label comes from the pure module, not the component.

**Invariants.**
- The criteria, their structural or advisory status and the routing do not change.
- The fact check still runs before the Opus call and still short-circuits under the automated budget.

**Tests.** `__tests__/unit/workflow/evaluator-nodes.test.js` asserts each judge's new inputs. `console/__tests__/checkpoint-view-logic.test.js` covers the label.

**Verification.** The prompt diff where the harness renders judges. In the phase gate, the three `evaluate-*` records hold what this brief lists.

**Done.** On the 092026 copy, the `evaluate-article` record holds the roster and the fact check's result. The outline judge names no photo as "without analysis".

**Out of scope.** Calibration, a rubric from the director's reasons, and the claim check (phase 7).

---

## Brief 2.5: checks and cards

**Intent.** The card check reads only what prints, and it never sends a reworker to delete a correct card. On 092026:
- six of the seven flagged cards were sidebar entries, whose text never prints;
- a quote-mark fault failed two correct excerpts;
- one card was reported twice;
- the fix line offered "or drop the card", which the reworker, unable to see the documents, took.

The article stop's sidebar editor also shows and edits the text that never prints, and has no field for the summary that does.

**Prompt.**
- The writer is no longer asked for document text in sidebar entries: `prompt-builder.js:1250`, and the "dual fields" lines 1261–1269 so they describe the inline card only. A sidebar entry is a headline and a summary.
- The schema keeps `evidenceCards[].content` optional, so older bundles validate. Its description (`content-bundle.schema.json:237`) says it does not print. The schema descriptions reach both themes' prompts, so keep the wording theme-neutral.

**Plumbing** (`lib/content-bundle-fact-check.js`).
- **Card fidelity** (428–467) checks inline `evidence-card` blocks only. Sidebar entries are still checked for an unknown document id, because a made-up id prints a headline and summary about nothing.
- **Roster coverage** (`visibleText` 331–358) counts only text that prints: not sidebar `content` or `owner`, not the top-level `photos`, not pull quotes, not hero characters. `judges-and-craft.md` Step 3 has the full printed list per theme.
- **The quote-mark faults** (`isVerbatim` 96–110; `normalize` 37–46):
  - a fragment's leading or trailing quotation mark is removed before matching;
  - single and double quotes fold together.

  `ale003`, `mor003` and `95e749b7` on 092026 are the regression cases.
- **One report per defect.** A document's defect is reported once, whether it appears inline and in the sidebar or twice inline. `cardFidelity` items gain a location (inline or sidebar, and the section), so the console's counts, which come from the strings, and its lists, which come from `cardFidelity`, agree.
- **Fix lines.** The not-verbatim fix line points at the document in the record view by id and says to copy its sentences exactly. It no longer offers dropping the card. The unknown-source and leaked-example lines may still offer removal, because those cards have no real source. Every message keeps its prefix, because the console groups by prefix (`checkpoint-view-logic.js:369–378`; `reports/CLAUDE.md`).

**Screen.** The article stop's sidebar entry view and editor (`Article.js#renderSidebarEvidenceCard` 1174–1215, `SidebarEvidenceCardEditor` 373–445) show and edit the summary, which prints, and no longer the content, which does not.

**Invariants.** "Every judgement call errs toward not flagging" (`reports/CLAUDE.md`, fact-check section). The advisory-only list (`FACT_CHECK_ADVISORY_ONLY`) does not grow or shrink here.

**Tests.** About thirteen tests exercise the card check through a sidebar entry and move to inline cards: `content-bundle-fact-check.test.js` (the list in `cards-and-fact-check.md` Step 3) and `evaluator-nodes.test.js:1096–1180`. There are also the three 092026 regression cases, a dedup case, the printed-text roster cases, and the console test for the counts.

**Verification.** Re-run the 092026 writer's bundle through the check in node, as the survey did. It reports only the retyped paternity-test card, once. In the phase gate, no automatic pass removes a correct card.

**Done.** That node run, and the sidebar editor in the click-through.

**Out of scope.** Server-filled card text and citations (phase 5). Other never-printing fields such as pull quotes and top-level photos, which phase 3 rules on: stop asking for them, or print them.

---

## Brief 2.6: the reporting-mode lines

**Intent.** A remote article shows the reporter's absence through attribution, and states it at most once. On 092026 the article announced it five times: "I was not there.", "I was not in that room.", "This is the story they told me." and two more. The judge praised it. The mode block is the only place that says where the reporter was. About twenty other lines in the prompts pull against it.

**Prompt.**
- **The remote block** (`prompt-builder.js:248`) tells the writer to show where each fact came from, through attribution, and to state the absence at most once. It stays one line, because the position test at `prompt-reporting-mode-neutral.test.js:196–201` finds it by line. The on-site block (247) stays as it is.
- **These lines change to defer to the block, and nothing else in these files changes:**
  - `prompt-builder.js` 1074, 1077–1078, 1106, 1112, 1183, 418–419, and the arc categories line `arc-specialist-nodes.js:191` ("Nova observed them").
  - The craft files, every line named in `judges-and-craft.md` K2 and `cards-and-fact-check.md` Step 4:
    - `writing-principles.md:7`, 25–29
    - `evidence-boundaries.md:134`
    - `anti-patterns.md:280`, 315
    - `character-voice.md:36`, 66
    - `narrative-structure.md:270`
    - `section-rules.md:100`, 513
    - `photo-enrichment.md:36`, 48
- **The judges and checks say the same:**
  - The article judge's `reporterMode` criterion (`evaluator-nodes.js:244–250`) and its `modeRule` (800–809). Stating the absence more than once is a defect, not a sign of voice.
  - The fact check's remote message (`content-bundle-fact-check.js:551–553`).
  - A new advisory in the fact check counts absence statements in the narrator's text, remote only, and flags more than one.

**Invariants.** The mode block stays the single statement of where the reporter was, in the same eight system prompts. `prompt-reporting-mode-neutral.test.js` stays green, and its `ON_SITE_PERSONA` list grows with any presence phrase removed here.

**Tests.** `prompt-reporting-mode-neutral.test.js` for the new block wording and the removed presence lines. `content-bundle-fact-check.test.js` for the absence advisory. `evaluator-nodes.test.js` for the criterion text.

**Verification.** The prompt diff shows exactly the named lines. In the phase gate, the remote article on the 092026 copy states the absence at most once.

**Done.** That article.

**Out of scope.** Every other craft conflict (phase 3).

---

## Brief 2.7: the trace

**Intent.** Before reading, the director sees what the automatic passes did at the outline and article stops: each pass, why it ran and what it changed. Today nothing from before an automatic pass reaches a stop:
- Each `_previous*` channel is written by the increment and cleared on every exit of the reworker, before the stop opens (`passes-and-stops.md` Step 2).
- An evaluation's reasons (`criteriaScores`, `revisionGuidance`) live only in `validationResults`, which the next evaluation overwrites.

**Plumbing.**
- **Two new state channels**, one for the outline stop and one for the article stop. Each holds the automatic passes of the current round, in order. A pass entry records:
  - its number;
  - its trigger: the check or the evaluation;
  - its findings: the structural issues, advisories, criteria scores and revision guidance from `validationResults`, copied before they are overwritten;
  - the version before the pass;
  - when it ran.
- **When entries are written.** The increment nodes (`graph.js:366–389`, 398–422) are the only nodes that see both the version before the pass and its trigger, so they write the entry on an automatic pass only.
- **When the channels clear.** On a send-back, in the reject arms of `buildResumePayload` (`server.js:586–609`, 630–648), where the hand-edit fields reset. At every rollback point that clears that side's hand-edit fields: the outline channel is in 10 lists, all but `article`; the article channel is in all 11.
- **The stop payload.** `getCheckpointData` sends each stop's passes under a new key that is not an interrupt payload name. Each pass carries the diff of its before-version against the next version: `diffOutline` / `diffBundle` from `lib/hand-edit-diff.js`, computed by the server when it builds the payload.
- **Storage.** Two passes at most per round. Record the size one pass adds to a saved checkpoint in the gate notes.

**Screen.** A read-only panel at the outline and article stops, after `RevisionDiff` and `EvalBar` (`Outline.js:1269–1281`, `Article.js:1399–1414`). It lists each automatic pass: the trigger in words, the must-fix findings, then the should-consider ones, and what changed by scope, using `scopeLabel`. The view logic goes in `checkpoint-view-logic.js`.

**Also.**
- The e2e harness renders the passes.
- The harness stops reading `evaluationHistory` as an object and reading an `escalated` field the server never sends (`scripts/e2e-walkthrough.js:2634–2635`, 2833–2834).

**Invariants.**
- A send-back rework is not an automatic pass and gets no entry.
- The panel shows only the current round.
- Nothing about routing, counters or the automated budget changes.

**Tests.**
- `state.test.js`: exact set and count.
- `rollback-clears-completeness.test.js`, plus a parity test like the hand-edit one: each channel is cleared exactly where its side's feedback is.
- `increment-revision.test.js`: an entry on automatic passes only.
- `server-build-resume-payload.test.js`: cleared on send-back.
- `get-checkpoint-data.test.js`: the key and the diffs.
- `checkpoint-view-logic.test.js`: the panel model.

**Verification.** A unit-level run through an automatic pass with the mocked SDK. In the phase gate, the panel on any live pass, and on a fixture thread in the click-through.

**Done.** The panel at the article stop names the trigger and the findings of an automatic pass and lists what it changed.

**Out of scope.** The arc stop's trace, including the arc check's own rewrites of the arcs. Comments and undo on the trace (phase 10).

---

## Rulings (the integrator's, 2026-09-25)

- **The gate starts at input review, not arc selection** (the director agreed arc selection on 2026-09-25, before this document). 2.1 changes preprocessing and 2.2 changes the parse, and neither reruns on a rollback to arc selection. Cost if wrong: about an extra half hour of calls in the gate.
- **Exposers are held out of writers' prompts until phase 3.** The "Exposed By" column is kept in state, on disk and at the input review (the director called its drop a loss). Three instructions about naming exposers conflict in the same prompt today, and phase 3's rulings decide them. Cost if wrong: the writers go without the column for one more phase.
- **A reworker is its writer's prompt plus a revision block, built by the same functions.** No section is copied. Cost if wrong: longer rework prompts, about the size of the writer's plus the previous version.
- **Two trace channels, one per stop.** A rollback to the article stop keeps the outline's trace, as it keeps the outline's hand edits. Cost if wrong: one more channel.
- **Corrections are rendered beside the notes; the notes are never rewritten.** The director's words stay the director's, and so does the correction. Cost if wrong: the writer reads both and must apply the override.
