# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ALN Director Console** - AI-powered investigative article generator for "About Last Night" using Claude Agent SDK with LangGraph workflow.

Generates journalist-style investigative articles by:
1. Fetching memory tokens and paper evidence from Notion database
2. Curating evidence bundle using three-layer model (exposed/buried/context)
3. Analyzing narrative arcs via single SDK call with player-focus guidance
4. Generating article outline and final HTML report with human-in-the-loop checkpoints

**Production URL:** `https://console.aboutlastnightgame.com` (via Cloudflare Tunnel)

**Deep Dive:** For business context, game mechanics, phase-by-phase breakdown, and detailed debugging scenarios, see `docs/PIPELINE_DEEP_DIVE.md`.

## Common Commands

```bash
# Development
npm start              # Start server on localhost:3001
npm run dev            # Same as npm start

# Testing
npm test               # Run all Jest tests
npm run test:watch     # Watch mode
npm run test:coverage  # Coverage report (targets: 80% lines/functions)

# Run single test file
npx jest lib/__tests__/theme-loader.test.js

# E2E Pipeline Testing (primary testing tool)
node scripts/e2e-walkthrough.js --session 1221           # Resume existing session
node scripts/e2e-walkthrough.js --session 1225 --fresh   # Fresh start
node scripts/e2e-walkthrough.js --session 1225 --auto    # Auto-approve all checkpoints
node scripts/e2e-walkthrough.js --help                   # Full CLI options

# Step-by-step mode (non-interactive, for collaborative debugging)
node scripts/e2e-walkthrough.js --session 1225 --step    # View current checkpoint
node scripts/e2e-walkthrough.js --session 1225 --approve input-review --step

# Remote access
start-everything.bat   # Windows: Start server + Cloudflare tunnel
cloudflared tunnel run aln-console  # Manual tunnel start

# LangSmith Studio (graph visualization + debugging)
npx @langchain/langgraph-cli dev    # Start Agent Server, opens Studio in browser
npx @langchain/langgraph-cli dev --tunnel  # With tunnel (for Safari/remote)
```

## Architecture

### LangGraph Workflow (6 Phases, 43 Nodes)

```
Phase 0: Input Parsing (conditional) → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: Arc Analysis (player-focus-guided) → Phase 2.4: Evidence Packaging
→ Phase 3: Outline → Phase 4: Article → Phase 5: Assembly
```

*See lib/workflow/graph.js for complete node list*

**Human Checkpoints (10 total - workflow pauses for approval via native `interrupt()`):**

For data flow at each checkpoint, see `PIPELINE_DEEP_DIVE.md#phase-by-phase-breakdown`.

| Checkpoint | Phase | Purpose |
|------------|-------|---------|
| `paper-evidence-selection` | 1.35 | Select which paper evidence was unlocked during gameplay |
| `await-roster` | 1.51 | Wait for roster input (incremental input - enables character ID mapping) |
| `character-ids` | 1.66 | Map characters to photos based on Haiku's visual descriptions |
| `await-full-context` | 1.52 | Wait for accusation/sessionReport/directorNotes (incremental input) |
| `input-review` | 0.2 | Review AI-parsed session input (after await-full-context) |
| `pre-curation` | 1.75 | Review preprocessed evidence before curation |
| `evidence-and-photos` | 1.8 | Approve curated three-layer evidence bundle |
| `arc-selection` | 2.35 | Select which narrative arcs to develop (3-5 recommended) |
| `outline` | 3.25 | Approve article structure and photo placements |
| `article` | 4.25 | Final article approval before HTML assembly |

**Session Config Inputs** (captured at session start, NOT extracted from director notes):
- `reportingMode`: `'on-site' | 'remote'` (journalist theme only) — stamped from `rawInput` in `parseRawInput` (input-nodes.js:424).
- `guestReporter`: `{name, ...} | null` — optional reporter identity override; displayed on InputReview checkpoint (gated on journalist theme).

**Revision Loops:** Arcs (max 2), Outline (max 3), Article (max 3). See `PIPELINE_DEEP_DIVE.md#evaluation--revision-architecture` for structural vs advisory criteria.

### Key Files

```
server.js                           # Express server + session REST API
lib/api-helpers.js                  # Shared API helpers (rollback, graph config, error responses)
lib/llm/
├── index.js                        # Public API: traced sdkQuery, createProgressLogger
├── client.js                       # Raw SDK wrapper with timeouts, progress hooks, structured-output contract
└── structured-output-extractor.js  # JSON extraction + ajv validation; recovers from SDK bug #277
lib/observability/
├── index.js                        # Public exports: traceNode, progressEmitter
├── config.js                       # isTracingEnabled(), getProject()
├── constants.js                    # SDK_MESSAGE_TYPES, SSE_EVENT_TYPES
├── state-snapshot.js               # extractStateSnapshot for traces
├── node-tracer.js                  # traceNode() wrapper
├── llm-tracer.js                   # createTracedSdkQuery() with full visibility
├── progress-emitter.js             # SSE progress streaming via EventEmitter
└── progress-bridge.js              # Console + SSE formatting; sole source of progress event icons/strings
lib/cache/
├── index.js                        # Public API for Notion caching
├── cached-notion-client.js         # Cache-aware Notion client wrapper
├── freshness-checker.js            # Cache staleness detection
└── notion-cache-store.js           # Persistent cache storage
lib/notion-client.js                # Raw Notion API client
lib/schema-validator.js             # JSON schema validation helpers
lib/sdk-client/
└── subagents.js                    # Programmatic SDK subagent defs (arc orchestrator, commits 8.8-8.11)
lib/evidence-preprocessor.js        # Evidence batch preprocessing
lib/image-preprocessor.js           # Image analysis preprocessing
lib/image-prompt-builder.js         # Image prompt construction for Haiku
lib/template-assembler.js           # Handlebars template compilation
lib/template-helpers.js             # Handlebars helper registration
lib/theme-config.js                 # Theme settings, NPC definitions, validation rules
lib/prompt-builder.js               # Prompt assembly for each phase
lib/workflow/
├── graph.js                        # LangGraph StateGraph (43 nodes, edges)
├── state.js                        # State annotations, phases, reducers
├── checkpoint-helpers.js           # Native interrupt() helpers (DRY)
├── reference-loader.js             # Load reference files for prompts
└── nodes/
    ├── index.js                    # Node barrel export
    ├── node-helpers.js             # Shared helper functions for nodes
    ├── input-nodes.js              # Raw input parsing
    ├── fetch-nodes.js              # Notion/filesystem data loading
    ├── checkpoint-nodes.js         # Dedicated interrupt() checkpoint nodes
    ├── photo-nodes.js              # Haiku vision analysis
    ├── preprocess-nodes.js         # Batch evidence summarization
    ├── arc-specialist-nodes.js     # Single SDK call arc analysis (8.15)
    ├── evaluator-nodes.js          # Quality evaluation per phase
    ├── ai-nodes.js                 # Claude content generation + programmatic validation
    ├── character-data-nodes.js     # Character extraction and processing
    ├── contradiction-nodes.js      # Contradiction detection and surfacing
    └── template-nodes.js           # HTML assembly
lib/schemas/
├── content-bundle.schema.json      # Final article content structure
├── preprocessed-evidence.schema.json # Batch-summarized evidence items
└── outline.schema.json             # Article outline validation (8.25)
```

### Template System

```
templates/journalist/
├── layouts/article.hbs         # Main article layout (multi-column with sidebar)
└── partials/
    ├── header.hbs, navigation.hbs
    ├── content-blocks/         # paragraph, quote, list, evidence-reference
    └── sidebar/                # financial-tracker, evidence-card, pull-quote

templates/detective/
├── layouts/article.hbs         # Single-column case report layout
└── partials/
    ├── header.hbs              # Case metadata box
    └── content-blocks/         # paragraph, evidence-card, quote, list, photo
```

### Claude Agent SDK Usage

```javascript
const { sdkQuery } = require('./lib/llm');

// Standard call with structured output
const result = await sdkQuery({
  prompt: 'Analyze this evidence...',
  systemPrompt: '...',
  model: 'sonnet',  // 'haiku' | 'sonnet' | 'opus'
  jsonSchema: { type: 'object', properties: {...} },
  // timeoutMs: omitted — inherits the 15-min IDLE/stall default (re-armed on every streamed
  // message, NOT a total-duration cap). Pass a smaller idle window only with data (see Model Call Limits below).
  onProgress: (msg) => console.log(msg.type, msg.elapsed),  // Optional streaming
  allowedTools: ['Read'],  // Optional, for images
  label: 'Evidence analysis',  // For timeout error messages
  loadProjectSettings: false  // Optional: false skips .claude/skills/ autoload (use on utility/normalization calls)
});
```

**Structured Output Contract:** When `jsonSchema` is provided, the call returns a schema-valid object or throws `StructuredOutputExtractionError`. The wrapper sends the schema to the SDK's `structured_output` channel and validates the result; if the SDK channel ever skips (see #277 below), it falls back to extracting JSON from the `result` text and validating it against the schema.

**SDK #277 channel skip — root cause is the `format` keyword (FIXED 2026-06-23, branch `fix/sdk-format-channel-skip`).** [anthropics/claude-agent-sdk-typescript#277](https://github.com/anthropics/claude-agent-sdk-typescript/issues/277) (OPEN, `bug` label): the SDK's constrained-decoding subsystem (triggered by `outputFormat: { type: 'json_schema' }`) can fail silently — returning `subtype: 'success'` with `structured_output: undefined` and `stop_reason: end_turn`, so the model emits JSON as `result` text instead of via the tool channel. We long attributed this to schema *shape* (nested `additionalProperties:false` + `oneOf` + `$ref`), but a single-variable opus probe proved the actual trigger in this SDK build is the JSON-Schema **`format` keyword** (e.g. `format:"date-time"`) — NOT `oneOf`/nesting/`additionalProperties`, all of which keep the channel engaged. `content-bundle.schema.json` carried one `format:"date-time"` on `metadata.generatedAt`; removing it re-engages the channel for content-bundle generation AND revision (both themes), verified live on session 062126. (Note: the claude-api structured-outputs doc lists `format:date-time` as *supported* — this SDK build empirically chokes on it.)

**The fix (two layers, both in place):**
- `format` removed from the two schema files that had it (`content-bundle.schema.json` metadata.generatedAt, `preprocessed-evidence.schema.json` preprocessedAt) — both validated server-stamped timestamps, so zero validation lost.
- **Guardrail** — `lib/llm/client.js#sanitizeSchemaForSdk` strips `format` (only string-valued, so a data property *named* `format` survives) plus `$id`/`$schema` from any schema before it reaches `outputFormat`, memoized per original object and fed to BOTH the SDK channel AND the extractor. So a future `format:` can't silently regress the channel, and the SDK constraint can't disagree with post-hoc validation. The memo + `$id`-strip also avert an ajv `"schema with key or id 'content-bundle' already exists"` collision across generation→revision in one process (the extractor's module-level ajv registers `$id` globally). **Never re-add `format` to a schema passed to the SDK** — the guardrail strips it, but keep the schema files clean.

**Retained as defense-in-depth** (the SDK channel is the normal path now; these are backstops if it ever skips again):
- The embedded `<SCHEMA>` text in `lib/prompt-builder.js#buildArticlePrompt` / `lib/workflow/nodes/ai-nodes.js#buildArticleRevisionPrompt` (gives the model the shape contract directly).
- `lib/llm/structured-output-extractor.js` path 2 — text extraction + ajv validation.
- The `channel` field on `llm_complete`/`llm_error` tells you which path fired (`structured_output` = SDK tool channel, the normal path now; `text_fallback` = channel skipped, we extracted from text — should no longer occur for content-bundle).

**`loadProjectSettings` flag:** Controls filesystem-settings scope:
- `true` (default) → `settingSources: ['project']` — loads project `.claude/skills/` and project `CLAUDE.md` only
- `false` → `settingSources: []` — pure SDK isolation; pass on utility/normalization calls

We never load user-level (`~/.claude/`) or local sources. A probe found those contribute ~86K tokens of irrelevant context (superpowers meta-skill, MEMORY.md, MCP server instructions, two `CLAUDE.md` files) that none of our SDK calls use. This is pure context hygiene — it does NOT prevent the channel skip described above; that's a separate SDK bug.

**Model Call Limits (idle timeout + cost ceiling):** SDK calls use a **15-min IDLE/stall timeout**, not a total-duration cap — the timer is re-armed on every streamed message (including the token-level `includePartialMessages` deltas emitted as `llm_delta`), so a legitimately long call (big prompt + extended thinking) survives as long as it keeps producing; only a genuine stall (no streamed activity for 15 min) aborts. A stall throws `SDK timeout after … idle … with no streamed activity`, which `isSdkTimeoutError` recognizes and `isTransientError` (`lib/llm/retry.js`) classifies **transient** (the node-level `retryPolicy` consumes this to auto-retry transient SDK failures). Cost is bounded separately by a **per-call `maxBudgetUsd` ceiling** (`MODEL_BUDGETS` in `lib/llm/client.js`: opus $5, sonnet $2, haiku $0.5) — a generous backstop, not a tight cap; an overrun throws a labeled **non-transient** `error_max_budget_usd` that is never auto-retried (the budget is per-CALL, so N node-retries can cost up to N× the ceiling). Steady-state latency is still captured per-call via `duration_api_ms` on the `llm_complete` event (`lib/observability/progress-bridge.js`).

**Model Pins** (see `MODEL_IDS` in `lib/llm/client.js`):
- `opus` → `claude-opus-4-8` (arc analysis, article validation)
- `sonnet` → `claude-sonnet-4-6` (default for most content generation nodes)
- `haiku` → `claude-haiku-4-5` (image analysis, evidence preprocessing)

### Arc Analysis Architecture (Commit 8.15+)

Arc analysis uses **player-focus-guided split-call architecture**:
- Player conclusions (accusation + whiteboard) drive arc identification
- Director observations provide ground truth weighting
- Three-lens analysis (financial/behavioral/victimization) embedded in prompt
- Returns 3-5 narrative arcs with evidence mapping
- `disableTools: true` flag prevents unnecessary tool invocations (pure analytical task)

**Architecture Evolution**: See `lib/workflow/nodes/arc-specialist-nodes.js` header for history (8.12 parallel → 8.15 single → 8.28 split).

**Three-Category Character Model** (Commit 4193772):
- **Roster PCs**: Must appear in arcs (coverage validation)
- **NPCs**: Valid but don't count (Marcus, Nova, Blake/Valet)
- **Non-Roster PCs**: Evidence-based mentions only (valid game characters not in session)
- **Canonical Name Preservation**: Accepts both "Sarah" and "Sarah Blackwood" as valid

For details, see `PIPELINE_DEEP_DIVE.md#three-category-character-model`.

**Arc Validation Routing (Commit 8.27):** Before expensive Opus evaluation, `validateArcStructure` performs programmatic checks (roster coverage, accusation arc present, evidence ID validity). Structural failures route directly to revision, skipping evaluation.

**Three-Layer Evidence Model:**
| Layer | Contains | Journalist Can |
|-------|----------|----------------|
| **EXPOSED** | Full memory content, paper evidence | Quote, describe, draw conclusions |
| **BURIED** | Transaction data ONLY (amounts, accounts) | Report patterns, NOT content |
| **DIRECTOR** | Observations + whiteboard | Shape emphasis and focus |

For detailed rules on what Nova can/cannot do with each layer, see `PIPELINE_DEEP_DIVE.md#three-layer-evidence-model`.

### Theme System

The pipeline supports multiple report themes via `state.theme`. Each theme produces a different article style with its own voice, structure, and visual design.

| Theme | Output | Voice | Length | Narrator |
|-------|--------|-------|--------|----------|
| `journalist` | NovaNews investigative article | First-person participatory | 1000-1500 words | Nova |
| `detective` | Detective case file | Third-person investigative | ~750 words | Det. Anondono |

**Theme-aware layers:**
- `lib/theme-config.js` — NPCs, outline rules, article rules, canonical characters per theme
- `lib/theme-loader.js` — Resolves prompt files from `.claude/skills/{theme}-report/references/prompts/`
- `lib/prompt-builder.js` — Builds system prompts with theme-specific voice, constraints, sections
- `templates/{theme}/` — Handlebars templates (layouts, partials, content blocks)
- `.claude/skills/{theme}-report/assets/` — CSS variables, layout, components, JS per theme
- `lib/workflow/nodes/evaluator-nodes.js` — Theme-aware quality criteria and NPC lists

**Adding a new theme (4 steps):**
1. Add config entry to `THEME_CONFIGS` in `lib/theme-config.js` (NPCs, rules, characters)
2. Create prompt files in `.claude/skills/{theme}-report/references/prompts/` (11 markdown files)
3. Create templates in `templates/{theme}/` (layouts + partials) and assets in `.claude/skills/{theme}-report/assets/`
4. Add theme framing to `PromptBuilder` methods in `lib/prompt-builder.js`

### Prompt Architecture

**Prompt Loading (ThemeLoader):**
- Prompts stored in `.claude/skills/{theme}-report/references/prompts/`
- 11 markdown files per theme define rules (not templates)
- Cached at startup, loaded per-phase via `lib/theme-loader.js`

**Prompt Assembly (PromptBuilder):**
- `lib/prompt-builder.js` assembles complete prompts per theme
- Uses **XML tag format** for prompt sections (Commit ba3f534)
- `labelPromptSection()` wraps content in `<tag>content</tag>` format
- Token savings: ~560 tokens per article generation
- Cross-references: "See `<arc-flow>` Section 3" format
- Methods: `buildOutlinePrompt()`, `buildArticlePrompt()`, `buildValidationPrompt()` (arc generation lives in `arc-specialist-nodes.js`, not in PromptBuilder)

For XML format details, see `PIPELINE_DEEP_DIVE.md#xml-tag-format-migration`.

| Phase | Required Prompts |
|-------|-----------------|
| arcAnalysis | character-voice, evidence-boundaries, narrative-structure, anti-patterns |
| outlineGeneration | section-rules, editorial-design, narrative-structure, formatting |
| articleGeneration | All prompts (8 files) |

**Recency Bias Pattern:** Rules placed LAST in user prompt for maximum salience:
```
<DATA_CONTEXT>...</DATA_CONTEXT>
<TEMPLATE>...</TEMPLATE>
<RULES>...</RULES>  ← Most recent = highest weight
```

### SDK vs LangGraph Responsibilities

| Aspect | Claude Agent SDK | LangGraph |
|--------|-----------------|-----------|
| AI Calls | `sdkQuery()` makes all Claude requests | Routes between nodes |
| Structured Output | JSON schemas via `jsonSchema` param | N/A |
| State Management | N/A | 60 state fields with reducers |
| Checkpointing | N/A | MemorySaver/SqliteSaver |
| Human Approval | N/A | Native `interrupt()` pattern |
| Revision Loops | N/A | Conditional edges with caps |
| Timeouts | AbortController per call | N/A |

**Data Flow:**
```
State → Node extracts context → PromptBuilder assembles prompt
→ sdkQuery() calls Claude → Returns structured output → Node updates state
→ LangGraph routes to next node (or checkpoint)
```

**Data Wiring (Commit 6ffeef8):**
- Memory tokens use `fullDescription` field (rich second-person narrative)
- Fallback chain: `fullDescription` → `content` → `description` → `summary`
- `extractFullContent()` helper ensures full quotable content (not summaries)
- Fixed in 3 locations: preprocessor, token routing, arc evidence packages

### LangSmith Tracing

Enable observability with environment variables:
```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=aln-director-console
```

**Usage in nodes:**
```javascript
const { traceNode } = require('../../observability');
module.exports = { myNode: traceNode(myNodeImpl, 'myNode') };
```

Traces include: execution timing, state snapshots, SDK call inputs/outputs.

### SSE Progress Events

The observability layer emits rich SSE events for full LLM visibility:

| Event Type | Description |
|------------|-------------|
| `llm_start` | Emitted when SDK call begins (full prompt, system, schema) |
| `llm_complete` | Emitted when SDK call finishes (full response, elapsed time) |
| `progress` | Standard progress updates during execution |
| `complete` | Workflow finished successfully |
| `error` | Error occurred |

**Full Visibility Pattern:** No truncation of prompts or responses. SSE streams complete content for debugging and tracing.

### LangSmith Studio

Web-based IDE for visualizing and debugging the LangGraph workflow.

**Quick Start:** `npx @langchain/langgraph-cli dev` (opens browser automatically)
**With Tunnel:** `npx @langchain/langgraph-cli dev --tunnel` (for Safari/remote)

**Requirements:** LangSmith account + `LANGSMITH_API_KEY` in `.env`
**Config:** `langgraph.json` defines graph as `./lib/studio/entry.js:graph`

**Features:** Graph visualization (43 nodes), state inspection, time-travel debugging, prompt iteration

## Console Frontend

**Access:** `http://localhost:3001/console` (local) or `https://console.aboutlastnightgame.com/console` (production)

**Stack:** React 18 + Babel standalone via CDN. Zero build process — edit JS/CSS and refresh.

**Architecture:** Single-page app with `useReducer` state machine. Each `.js` file is a `<script type="text/babel">` tag with its own Babel scope. Components register on `window.Console` namespace.

### Console File Structure

```
console/
├── index.html                      # SPA shell, CDN scripts, 22 script tags in load order
├── api.js                          # REST client + SSE-before-POST pattern
├── state.js                        # useReducer: 18 actions, initialState, RESET_SESSION
├── utils.js                        # Badge, CollapsibleSection, JsonViewer, safeStringify, etc.
├── outline-edit-logic.js          # Dual-export PURE module: all Outline-editor init/build/merge/validate/reset logic (browser: window.Console.outlineEditLogic; node: module.exports). Unit-tested in node-env. Must load before Outline.js/Article.js.
├── app.js                          # Root: auth gate, checkpoint routing, rollback flow
├── console.css                     # All styles (~1800 lines, BEM naming, noir theme)
└── components/
    ├── LoginOverlay.js             # Auth overlay
    ├── SessionStart.js             # Session ID + start/resume
    ├── ProgressStream.js           # SSE progress + LLM activity display
    ├── PipelineProgress.js         # 10-step checkpoint stepper
    ├── CheckpointShell.js          # Shared checkpoint wrapper
    ├── RevisionDiff.js             # Shallow diff for revision loops
    ├── RollbackPanel.js            # Rollback confirmation modal
    ├── CompletionView.js           # Success screen with report link
    ├── FileBrowser.js              # Session file browser
    └── checkpoints/
        ├── InputReview.js          # Parsed session input display
        ├── PaperEvidence.js        # Selectable paper evidence list
        ├── PreCuration.js          # Evidence preprocessing summary
        ├── AwaitRoster.js          # Tag-style roster name input
        ├── CharacterIds.js         # Photo gallery + character mapping
        ├── AwaitFullContext.js      # Accusation/report/notes collection
        ├── EvidenceBundle.js       # Three-layer evidence display + rescue
        ├── ArcSelection.js         # Arc card grid with selection
        ├── Outline.js              # Article outline + approve/edit/reject
        └── Article.js              # Content bundle + HTML preview iframe
```

### Modifying Checkpoint Components

Each checkpoint component follows the same pattern:
1. Registers on `window.Console.checkpoints`
2. Receives `{ data, onApprove, onReject, dispatch, revisionCache }` props
3. Renders checkpoint-specific UI from `data`
4. Calls `onApprove(payload)` or `onReject(payload)` with checkpoint-specific payload

**Conventions:** `const` not `var`, direct destructured imports (no aliasing), `safeStringify` instead of `JSON.stringify`, CSS utility classes over inline styles, aria-labels on interactive elements, functional state updaters for Set manipulation, `useEffect` reset on data change.

### Outline Editor Architecture (`Outline.js` + `outline-edit-logic.js`)

The Outline checkpoint's per-section editors (journalist LEDE / THE STORY / FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING / CLOSING, and the 5 detective sections) are **thin wrappers**: each seeds `useState` from `EditLogic.init*(section)`, composes shared module-scope widgets (`TextField`, `EnumSelect`, `StringListEditor`, `ObjectListEditor`, `KeyValueEditor`, `actionsRow`), and on save calls `onSave(EditLogic.build*Payload(state, originalSection))` → `saveSectionEdit('<sectionKey>', payload)`. `EditLogic` = `window.Console.outlineEditLogic` (aliased at module scope in both `Outline.js` and `Article.js`).

- **All save/build/merge/validate logic is PURE and lives in `outline-edit-logic.js`, not in the React components.** Builders `deepClone` the original section, so untouched required/extra keys are preserved and NO stray keys are emitted (every section is `additionalProperties:false`). Builders keep blank rows — pruning/non-empty enforcement is the validation layer's job.
- **Edited outlines are schema-validated before article generation** (the B7 gate): client-side via `EditLogic.validateOutlineShape(outline, theme)` (dependency-free — blocks Approve + renders `.validation-error`) and server-side in `buildResumePayload` (`SchemaValidator` against `outline` / `detective-outline`, rejects invalid edits). Distinct from the generation-time `validateOutlineStructure` removed in 8.23 — this specifically gates HUMAN edits.
- **Reset effect** is keyed on `EditLogic.computeResetKey(data, revisionCount)` (collision-resistant) in both `Outline.js` and `Article.js`. Do NOT revert to a truncated `safeStringify(...).slice(0, N)` — it collides across revisions and leaks stale edits.
- **Wiring debugging:** the section→editor→builder→`saveSectionEdit` key→schema map is documented in `docs/superpowers/plans/2026-05-28-outline-rich-editor-fixes.md` (the implementation plan + bug→task table).
- **Known minor:** the list widgets key rows by array index, so removing a mid-list row can momentarily drop input focus (no data-correctness impact).

## State Management

**Reducers** (`lib/workflow/state.js`): replace (default), append (arrays), appendSingle (single item), merge (objects)
**Rollback**: API accepts `rollbackTo` parameter to regenerate from checkpoint

## API Reference

### Session REST API

**Step-by-step Pipeline Control:**
- `/api/session/:id/start` (POST) - Start new session with raw input
- `/api/session/:id/resume` (POST) - Resume existing workflow (re-invoke at current state)
- `/api/session/:id/approve` (POST) - Submit checkpoint approval
- `/api/session/:id/rollback` (POST) - Roll back to checkpoint
- `/api/session/:id/state` (GET) - Get current state
- `/api/session/:id/state/:field` (GET) - Get single state field
- `/api/session/:id/checkpoint` (GET) - Get checkpoint info
- `/api/session/:id/progress` (GET, SSE) - Stream pipeline progress events

**Utility:**
- `/api/health` (GET) - Health check
- `/api/config` (GET) - Client configuration
- `/api/browse` (GET) - List session data files
- `/api/file` (GET) - Read session data file

See `server.js` for detailed usage and request/response shapes.

## Environment Setup

```bash
cp .env.example .env
# Required:
#   NOTION_TOKEN=ntn_...
#   ACCESS_PASSWORD=your-password
#   SESSION_SECRET=<generate with crypto.randomBytes(32).toString('hex')>
```

## Testing

**Framework:** Jest with SDK mocks at `__tests__/mocks/`
**Coverage:** 80% lines/functions/statements, 70% branches
**Mocks:** anthropic-sdk.mock.js, llm-client.mock.js, checkpoint-helpers.mock.js

See test files for mock usage examples.

**Console has NO DOM/React test harness** (node test env only — no jsdom/testing-library/babel-jest, by design). Test console logic by extracting it into a **dual-export** module (`window.Console.X` for the browser + an `if (typeof module !== 'undefined' && module.exports)` node guard) and unit-testing the pure functions in node-env — see `outline-edit-logic.test.js` and `server-build-resume-payload.test.js` (which `require('../../server.js')`; `server.js` is guarded by `require.main === module` so requiring it doesn't start the server). React component **wiring** (which control opens which editor, save routing, error rendering) has no automated test — verify it with a manual browser click-through.

## Troubleshooting

**SDK not available:** `claude /login` then `npm install`
**Workflow errors:** Check logs for missing input files, expired Notion token, or SDK timeouts
**Resume behavior:** State persists via `MemorySaver` checkpointer

See `PIPELINE_DEEP_DIVE.md#common-debugging-scenarios` for detailed debugging guides.

## Emailer

**Send follow-up emails:** `python emailer/send_followup_emails_smart.py --date MMDD --send`
**Setup:** See `emailer/SETUP_GUIDE.md`

## Journalist Skill (Direct Claude Code Usage)

**Location:** `.claude/skills/journalist-report/`
**Purpose:** Article generation via Claude Code without server

**Custom Subagents:** image-analyzer, evidence-curator, arc-analyzer, outline-generator, article-generator, article-validator
**Reference Files:** writing-principles.md, anti-patterns.md, evidence-boundaries.md, schemas.md

See `.claude/agents/` directory for complete subagent definitions.

**Rendering:** Article generation emits a `ContentBundle` JSON and renders HTML via
`scripts/assemble-article.js`, which uses the shared `TemplateAssembler` (same as
the server pipeline). Output is structurally identical across both paths.

## Session Data Directory Structure

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `inputs/` | User-provided and AI-parsed inputs | session-config.json, director-notes.json, character-ids.json |
| `fetched/` | Raw data from external sources | tokens.json, paper-evidence.json |
| `analysis/` | AI-generated intermediate outputs | evidence-bundle.json, arc-analysis.json, article-outline.json |
| `summaries/` | Checkpoint-friendly summaries | evidence-summary.json, arc-summary.json, outline-summary.json |
| `output/` | Final deliverables | article.html, article-metadata.json |

For complete directory structure and file descriptions, see `PIPELINE_DEEP_DIVE.md#data-directory-structure`.

## Top-Level Directory Map

| Path | Purpose |
|------|---------|
| `data/{session-id}/` | Per-session pipeline state (inputs/fetched/analysis/summaries/output) — one folder per `--session` ID |
| `outputs/` | Published reports (`report-MMDDYY.html`) and refinement working files (`-refsheet`, `-findings`, `-editplan`, `-draft`, `-copyedit`) — see "Refining Generated Reports" below |
| `assets/images/{MMDDYY}/` | Per-session photos used in published reports (`notion/`, `photos/`, `whiteboard.jpg`) |
| `sessionphotos/{MMDDYY}/` | Raw session photo dumps before curation into `assets/images/` |
| `archive/` | Retired prompts, deprecated reports, and superseded remote-access docs — read-only history |
| `lib/`, `console/`, `templates/`, `scripts/`, `__tests__/` | See sections above |
| `report*.html` (root) | Loose published reports kept at root for direct browser access; new reports go in `outputs/` |

## Refining Generated Reports

Pipeline-generated reports contain systematic factual errors that read as plausible. The repo has a structured **two-pass refinement workflow** driven by the user-level `refining-aln-reports` skill (auto-loads when you mention reviewing/editing a session report).

**Working-file convention** (in `outputs/`, all prefixed `report-MMDDYY-`):

| Suffix | Pass | Purpose |
|--------|------|---------|
| `-refsheet.md` | Pre-read | Ground truth built from source data (`data/{id}/`) BEFORE reading the article. Roster, pronouns, accounts, transactions, accusation. |
| `-findings.md` | Pass 1 (fact-check) | Claim-by-claim verification against refsheet. Flags fabrications, evidence-boundary violations, pronoun errors. |
| `-editplan.md` | Pass 1 (fact-check) | Section-by-section rewrite plan addressing findings. |
| `-draft.md` | Pass 1 output | Revised prose (Markdown, not HTML) after applying editplan. |
| `-findings-copyedit.md` | Pass 2 (copy-edit) | Examines the **fact-corrected** article (not the original) for pacing, redundancy, throat-clearing, abstract→specific. |
| `-editplan-copyedit.md` | Pass 2 (copy-edit) | Structural and sentence-level polish plan. |

**Two-pass discipline:** Fact-check and copy-edit are separate cycles. Copy-edit always operates on the fact-corrected article, never the original. Don't pattern-match em-dashes from older reference reports (they predate the no-em-dash rule).

**Final HTML output:** Published as `outputs/report-MMDDYY.html`. The matching `assets/images/MMDDYY/` directory must exist before publishing.

**Editorial intent fetch:** If the pipeline server is running, the refinement skill pulls the director's checkpoint feedback (`_arcFeedback`, `_outlineFeedback`, `_articleFeedback`, `selectedArcs`, `_rescuedItems`) from `/api/session/:id/state/:field` to inform the refsheet.
