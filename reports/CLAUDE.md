# CLAUDE.md

This file guides agents working in `reports/`. It is a map: what the pipeline is, the rules every change keeps, and which file in `docs/architecture/` holds the full account of each part. Before you change a part, read its file there.

## Project Overview

**ALN Director Console** - AI-powered investigative article generator for "About Last Night" using Claude Agent SDK with LangGraph workflow.

Generates journalist-style investigative articles by:
1. Fetching memory tokens and paper evidence from Notion database
2. Curating evidence bundle using three-layer model (exposed/buried/context)
3. Writing the weave, two or three angles the article could take over one set of threads, which the director settles at the story meeting
4. Laying the settled angle across the article's sections as the story map, which the director settles, then writing the article from both, which the director finishes at the desk, and publishing the HTML report

**Production URL:** `https://console.aboutlastnightgame.com` (via Cloudflare Tunnel)

**Deep Dive:** For business context, game mechanics, phase-by-phase breakdown, and detailed debugging scenarios, see `docs/PIPELINE_DEEP_DIVE.md`. The project's vocabulary is `CONTEXT.md`. The plan of record is `docs/superpowers/plans/2026-09-22-roadmap.md`, with each phase's spec under `docs/superpowers/specs/`.

## Common Commands

```bash
npm start              # Start server on localhost:3001 (npm run dev is the same)
npm test               # Run all Jest tests
npx jest lib/__tests__/theme-loader.test.js   # One test file

# SDK probes: LIVE model calls (see docs/architecture/sdk.md)
node scripts/probe-sdk-isolation.js            # one call per alias; --model opus for one alias or a comma list
node scripts/check-model-freshness.js          # every MODEL_IDS entry resolves and serves as pinned
PROBE_SESSION_ID=092026 node scripts/probe-content-bundle-channel.js   # exit 1 on text_fallback

# E2E harness (the primary testing tool). Without --resume, --approve or --rollback, --session starts the session over.
node scripts/e2e-walkthrough.js --session 1225 --resume --step                  # print the stop the thread reaches, as the console shows it
node scripts/e2e-walkthrough.js --session 1225 --approve input-review --step    # approve the stop the thread is paused at, with no replay
node scripts/e2e-walkthrough.js --help                                          # every option

start-everything.bat                 # Windows: server + Cloudflare tunnel
npx @langchain/langgraph-cli dev     # LangSmith Studio
```

`docs/architecture/commands.md` keeps every command and harness option with what each does: the meeting's, the map's and the desk's actions and notes, `--approve-file`, `--angle`, the photo descriptions and the leave-out boxes, and the refusals that exit 2.

## The pipeline

```
Phase 0: Input Parsing (conditional) → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: The Weave and the Story Meeting
→ Phase 3: The Map (outline) → Phase 4: Article → Phase 5: Assembly
```

`lib/workflow/graph.js` holds the 44 nodes. The run pauses at 11 stops (`interrupt()`), in this order:

| Stop | What the director does there |
|---|---|
| `paper-evidence-selection` | Marks the paper documents the players unlocked |
| `await-roster` | Gives the roster: names and pronouns |
| `await-full-context` | Gives the accusation, the session report and the notes |
| `input-review` | Checks the parse; approves it, or sends corrections and the parse runs again |
| `pre-curation` | Reviews the preprocessed evidence (phase 3b removes this stop) |
| `evidence-and-photos` | Approves the curated evidence bundle (phase 3b removes this stop) |
| `arc-selection` | The story meeting: picks an angle, edits it, answers its questions; approves, reweaves or sends back |
| `photos` | Gives the photo folder; skipped when it was given at the start |
| `character-ids` | Names who is in each photo, describes it, and leaves photos out |
| `outline` | The map: arranges the story's moves and photos on a corkboard; approves or sends back |
| `article` | The desk: finishes the article as it will print; approve publishes exactly what is on the desk |

## Where each part is described

Each file below holds the full account of its part, moved verbatim from this file on 2026-10-11.

| Part | What its file covers | File in `docs/architecture/` |
|---|---|---|
| The stops | Each stop's purpose, the payload keys the server adds (`getCheckpointData`), the approval payloads (`buildResumePayload`), the director's notes at the stops, the input review's corrections, rolling back a finished session | `stops.md` |
| The director's edits | The edits are final: the diff (`lib/hand-edit-diff.js`), the standing edits, how every rework, judge and check reads them, the restore after an automatic pass (`settleEdits`), the round's report | `director-edits.md` |
| The story meeting | The weave (`lib/weave.js`) and its writer, the weave checks and the fact check, the meeting's payloads and rounds (`lib/meeting.js`), the questions and answers, the settled weave, the page (`ArcSelection.js`) | `story-meeting.md` |
| The map | The map's shape, writer, checks and edits (`lib/map.js`), the stop's payloads, the corkboard page (`Outline.js`) | `map.md` |
| The article | The article writer, the stamp from the map, the programmatic fact check (`lib/content-bundle-fact-check.js`), the card check | `article.md` |
| The judges | The two truth-only judges: the rule set they read, the truth criteria, what each sees, the notes at the stops (`evaluator-nodes.js`) | `judges.md` |
| The director's words | The session config inputs, the accusation, the input-review corrections, the photo descriptions, the exposures, the ledger's clock shift, the whiteboard, the notes enricher | `director-words.md` |
| Reworks | The automatic budget per round, a rework that fails, what each reworker reads, the rework rules, the trace of automatic passes | `reworks.md` |
| The Agent SDK | The wrapper (`lib/llm/client.js`): structured output and the `format` keyword, isolation, tool gating, call limits, effort and thinking, model pins, the SDK version, no fallback, refusals | `sdk.md` |
| Themes, prompts and the record | The theme system, the rule set, prompt assembly, the record view every writer and judge reads (`lib/prompt-renderers/record-view.js`) | `prompts.md` |
| The console | Its files, the rules every stop's component follows, the payload keys the stops read, the map's and the desk's editors | `console.md` |
| Old threads | Threads from before the story meeting or on an earlier shape (`lib/old-thread.js`) | `old-threads.md` |
| State and the API | The state reducers and the session REST API | `api.md` |
| Templates and publishing | The templates, photo spacing, what publishing writes | `publishing.md` |
| Key files | The main files, each with a line on what it holds | `key-files.md` |
| Observability | LangSmith tracing, SSE progress events, LangSmith Studio | `observability.md` |
| Session data on disk | What each folder of `data/<id>/` holds, the call log and the stops log | `data.md` |
| The standalone skill | `.claude/skills/journalist-report/`: article generation through Claude Code without the server | `skill.md` |
| Refining published reports | The two-pass fact-check and copy-edit workflow | `refining.md` |
| Commands | Every command and harness option, with what each does | `commands.md` |

The rules the writers and judges read are model-facing Markdown in `.claude/skills/journalist-report/references/rules/` (`world.md`, `truth-rules.md`, the eight `craft-*.md` files and the two mode files).

## Rules every change keeps

- **The director's edits are final.** An automatic pass never changes a line the director wrote: code puts back what a pass changed (`settleEdits`), and a judge's finding located in the director's text is a concern, never a rework. Only a send-back's rework may change an edit, and it says why. (`director-edits.md`)
- **One rule, one function.** A reading many parts share lives in one function that every reader calls, such as `photoKey`, `isPhotoExcluded`, `settledAngleOf`, `stopRoundOf`, `recordDocumentOf` and `DIRECTOR_WORDS_SOURCES`. Where the console keeps its own copy of a server rule, a test holds the two equal. Extend the one function; never write a second reading.
- **A stop's gate and the console decide alike.** Each stop's payload gate on the server and the console's validator for it reach the same decisions, held by corpus tests. Change both together. (`story-meeting.md`, `map.md`, `console.md`)
- **The record is one section.** Every writer and judge reads the evidence through the record view. A buried memory appears only as a sale; a character sheet never appears. (`prompts.md`)
- **Prompts are pinned.** `lib/__tests__/writer-prompts-pinned.test.js` pins each writer's render by hash; a deliberate change re-pins it there with its reason. `scripts/render-prompts.js` renders every call's prompt with no model call. `scripts/lib/render-calls.js` repeats the judges' argument lists, so a change to what `createEvaluator` passes goes into it in the same commit. `lib/__tests__/rule-set.test.js` lints the rule files. (`prompts.md`, `reworks.md`)
- **Every SDK call declares its tools.** `tools` or `disableTools`; `allowedTools` restricts nothing. Never send a schema with a `format` keyword to the SDK. Keep the isolation options in `lib/llm/client.js`. No call is served by another model, and a declined request is never retried. (`sdk.md`)
- **The console has no DOM test harness.** Logic goes in dual-export modules tested in node. Read checkpoint payload keys through `console/checkpoint-view-logic.js`. `onRollback` is the only way a stop opens the rollback panel. A control that would drop text the director typed waits for it (`console/unsaved-input-logic.js`). (`console.md`)
- **Rollbacks clear what they invalidate.** Each rollback point clears every later stop's skip field (`ROLLBACK_CLEARS` in `lib/workflow/state.js`); a fresh start is its own list (`FRESH_START_CLEARS`). (`api.md`)
- **Live runs never touch production.** Never open `data/checkpoints.sqlite` or the server on port 3001. A live gate runs on a copy through `CHECKPOINT_DB_PATH` and another `PORT`.
- **A refactor's test sweep is the whole suite.** Tests live in `lib/__tests__`, `__tests__/unit`, `__tests__/integration`, `console/__tests__` and beside some modules; run `npm test`, not one folder.

## Environment Setup

```bash
cp .env.example .env
# Required:
#   NOTION_TOKEN=ntn_...
#   ACCESS_PASSWORD=your-password
#   SESSION_SECRET=<generate with crypto.randomBytes(32).toString('hex')>
# Optional:
#   CHECKPOINT_DB_PATH   # default data/checkpoints.sqlite; any live gate runs on a COPY through this
#   LLM_CALL_LOG_DIR     # default data/; root of the per-session llm-log/ folders
#   PORT                 # default 3001; throwaway servers use another port
```

`PORT` is validated at startup by `resolvePort` in `server.js`: unset or empty → 3001; a positive integer → that port; anything else (`abc`, `0`, `+3011`) throws, so a mistyped value can never fall back onto the director's 3001.

## Testing

**Framework:** Jest with SDK mocks at `__tests__/mocks/`
**Coverage:** 80% lines/functions/statements, 70% branches
**Mocks:** anthropic-sdk.mock.js, llm-client.mock.js, checkpoint-helpers.mock.js

See test files for mock usage examples.

Jest's `setupFiles` entry `__tests__/setup/checkpoint-db-path.js` points `CHECKPOINT_DB_PATH` at a temp file for every worker, so no suite ever opens the production `data/checkpoints.sqlite`; a test that needs its own database sets the variable itself before requiring `server.js` (see `__tests__/unit/checkpoint-db-path.test.js`).

**Console has NO DOM/React test harness** (node test env only — no jsdom/testing-library/babel-jest, by design). Test console logic by extracting it into a **dual-export** module (`window.Console.X` for the browser + an `if (typeof module !== 'undefined' && module.exports)` node guard) and unit-testing the pure functions in node-env — see `checkpoint-view-logic.test.js`, `outline-edit-logic.test.js` and `server-build-resume-payload.test.js` (which `require('../../server.js')`; `server.js` is guarded by `require.main === module` so requiring it doesn't start the server). Three components run under a stand-in React whose `createElement` builds a tree of elements. `InputReview.js` (`lib/__tests__/fixtures/component-source.js` `loadInputReview`, whose hooks hold their first value) is read for what it renders. `ArcSelection.js` (`__tests__/unit/console-meeting-screen.test.js`) is read for what it renders from each view-model field, and the test calls the meeting's real handlers (an angle's card, a flip, a pitch line, a thread's name and line, the add line, an answer) and checks the action each dispatches, so the meeting's wiring of those controls is tested; its stand-in keeps the hooks' state across renders (`mountMeeting`), so a pick or an add is followed into the page it leaves. `Outline.js` (`__tests__/unit/console-map-screen.test.js` `mountMap`, piece 4, brief 4D) is read the same way, its hooks kept across renders, with a spy on each of the moves' `EditLogic` ops: the test selects cards, moves in the tray and photos, opens the summaries, picks a thread, presses each control on a selected card, calls each drop handler with a stand-in `dataTransfer` and checks that each reaches its op once, holds a click while an editor is open, and runs an editor node with hooks of its own (`child`), so the map's editors are followed from open to save. The input review's stand-in renders once, so no test covers that component's own state across renders, nor the desk's or any other component's. Verify those components' wiring (which control opens which editor, save routing, error rendering), and the map's drag and drop in a real browser, with a manual click-through.

## Troubleshooting

**SDK not available:** `claude /login` then `npm ci --os=win32 --cpu=x64`. "Claude Code native binary not found" means the optional platform package (`@anthropic-ai/claude-agent-sdk-win32-x64`) is missing: reinstall on the machine that runs the server with `npm ci --os=win32 --cpu=x64`, not from WSL. The director's `~/.npmrc` sets `os=linux`, and a plain install fetches Linux builds with no `sharp` binary and no CLI binary.
**Workflow errors:** Check logs for missing input files, expired Notion token, or SDK timeouts
**Resume behavior:** State persists via `MemorySaver` checkpointer
**Photos directory not found after arc selection with a start-time path:** the failure card now offers a rollback to `photos` (free); the API form is `POST /rollback {rollbackTo:'photos'}` / harness `--session <id> --resume --rollback photos`; do not roll back to `arc-selection`: it reopens the story meeting with no model call (R9) but keeps the path, so the same failure comes back after the meeting's approve.

See `PIPELINE_DEEP_DIVE.md#common-debugging-scenarios` for detailed debugging guides.

## Emailer

**Send follow-up emails:** from `emailer/`, run `python send_followup_emails_smart.py` (interactive prompts; session date is entered as MMDDYY)
**Setup:** See `emailer/SETUP_GUIDE.md`

## Top-Level Directory Map

| Path | Purpose |
|------|---------|
| `data/{session-id}/` | Per-session pipeline state (inputs/fetched/analysis/summaries/output) — one folder per `--session` ID |
| `outputs/` | Published reports (`report-MMDDYY.html`) and refinement working files (`-refsheet`, `-findings`, `-editplan`, `-draft`, `-copyedit`) — see `docs/architecture/refining.md` |
| `assets/images/{MMDDYY}/` | Per-session photos used in published reports (`notion/`, `photos/`, `whiteboard.jpg`) |
| `sessionphotos/{MMDDYY}/` | Raw session photo dumps before curation into `assets/images/` |
| `archive/` | Retired prompts, deprecated reports, and superseded remote-access docs — read-only history |
| `lib/`, `console/`, `templates/`, `scripts/`, `__tests__/` | See the map above and `docs/architecture/key-files.md` |
| `report*.html` (root) | Loose published reports kept at root for direct browser access; new reports go in `outputs/` |
