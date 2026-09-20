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

### LangGraph Workflow (6 Phases, 45 Nodes)

```
Phase 0: Input Parsing (conditional) → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: Arc Analysis (player-focus-guided) → Phase 2.4: Evidence Packaging
→ Phase 3: Outline → Phase 4: Article → Phase 5: Assembly
```

*See lib/workflow/graph.js for complete node list*

**Human Checkpoints (11 total - workflow pauses for approval via native `interrupt()`; `photos` is conditional):**

For data flow at each checkpoint, see `PIPELINE_DEEP_DIVE.md#phase-by-phase-breakdown`.

| Checkpoint | Phase | Purpose |
|------------|-------|---------|
| `paper-evidence-selection` | 1.35 | Select which paper evidence was unlocked during gameplay |
| `await-roster` | 1.51 | Wait for roster input (names + pronouns). Photos are not needed yet. |
| `await-full-context` | 1.52 | Wait for accusation/sessionReport/directorNotes (incremental input) |
| `input-review` | 0.2 | Review AI-parsed session input. Dedicated node `checkpointInputReview`, reached as `parseRawInput → checkpointInputReview` (so an approve does not re-pay the parse), gating on the `inputReviewApproved` channel |
| `pre-curation` | 1.75 | Review preprocessed evidence before curation |
| `evidence-and-photos` | 1.8 | Approve curated three-layer evidence bundle |
| `arc-selection` | 2.35 | Select which narrative arcs to develop (3-5 recommended) |
| `photos` | 2.36 | Collect the session photo folder. CONDITIONAL: skipped when `photosPath` was given at /start. The photo chain runs here, after arc analysis, so a session can be parsed, curated and arc-analysed while the photos are still being curated. |
| `character-ids` | 1.66 | Map characters to photos based on Haiku's visual descriptions. Runs INSIDE the photo branch, after arc selection (its 1.66 phase number is historical). |
| `outline` | 3.25 | Approve article structure and photo placements |
| `article` | 4.25 | Final article approval before HTML assembly |

The photo branch keeps its original phase NUMBERS, so the badge CheckpointShell renders runs backwards there: Arc Selection 2.35, Photos 2.36, Character IDs 1.66. The numbers are historical labels, not an order (see the plan's ruling R3).

**Threads started before the photo branch existed pause once at `photos`** (R9), pre-filled with the path they were started with and answered in one click: the branch then skips on the `sessionPhotos`/`preprocessStats`/`photoAnalyses` they already carry, so nothing is re-paid. This applies to a COMPLETE old session too — any rollback replays from START, so a rollback to `outline` or `article` on a finished pre-branch thread also stops at `photos` on the way through.

**Checkpoint payload keys** (added by `getCheckpointData` in `server.js`; the console consumes these names):

| Checkpoint | Keys beyond the interrupt payload |
|---|---|
| `input-review` | `enrichment: {quotes, characterMentions, transactionReferences, fallback, warnings}` — counts from the director-notes enricher, so an empty enrichment is distinguishable from empty notes |
| `arc-selection` / `outline` / `article` | `lastEvaluation` — the most recent evaluation **for that phase** (`evaluationHistory` is append-only and mixes phases, so its last entry is routinely another phase's verdict). Raw `evaluationHistory` is kept alongside it |
| `article` | `htmlPreview` (the pending bundle rendered through the publishing `TemplateAssembler`, with `<base href="/">` injected; `null` on any render failure), `sessionPhotos`, `factCheck` (see below) |

**Approval payloads** (`buildResumePayload`): `{inputReview: true}` approves the parse; `{inputReview: false, inputFeedback}` rejects it with prose corrections, which `checkpointInputReview` stores as `_inputCorrections` and `routeAfterInputReview` routes back to `parseRawInput` (appended to the Step-1/Step-2/enrichment prompts, then cleared). `{selectedArcs, outlineGuidance?}` carries the director's emphasis into the outline AND article prompts as their final `<DIRECTOR_GUIDANCE>` section. A rejection may carry the director's edited object — `{outline:false, outlineFeedback, outlineEdits?}` / `{article:false, articleFeedback, articleEdits?}` (spec `docs/superpowers/specs/2026-09-19-director-steering-design.md`). It is validated exactly like an approval, becomes the version the reviser starts from (`incrementOutlineRevision` copies it into `_previousOutline`), and its diff (`lib/hand-edit-diff.js`) is written to `_outlineHandEdits`/`_articleHandEdits`, which the reviser renders as a `<HAND_EDITS>` block between HUMAN FEEDBACK and the revision instructions. After EVERY reviser pass the report `_outlineHandEditReport`/`_articleHandEditReport` (`{checked, changed}`) is rewritten; `changed` means the rework no longer contains the director's edited value anywhere in the addressed collection (a PRESENCE check, so a relocated block still counts as kept). The revisers never clear the diff (an evaluator-driven second pass must still see it), the checkpoint clears both on approve, and the server resets both on every reject. Every rejection note is appended to `directorGateNotes` (a REPLACE channel the server appends to by writing the full array; `pruneGateNotes` drops the invalidated gates' notes on a rollback to `photos`/`character-ids`/`outline`/`article`, and points at or above `arc-selection` clear it) and rendered as standing notes inside `<DIRECTOR_GUIDANCE>` for every later writer and reviser. Arc-selection GUIDANCE is not a note; it already persists in `_outlineGuidance`.

**Programmatic article fact-check** (`lib/content-bundle-fact-check.js`): `evaluateArticle` runs `factCheckContentBundle` BEFORE the Opus evaluation, mirroring how `validateArcStructure` gates `evaluateArcs`. Pure string checks, no LLM: evidence-card fidelity (every substantial sentence of a card's `content` must appear in its source's `fullContent`/`content`/`description`/`text` — never its `summary`, which is the paraphrase a fabrication imitates), unknown card sources, leaked prompt-example strings, roster coverage, photo references, reporter mode, and NPC pronouns. A structural failure under `REVISION_CAPS.ARTICLE` short-circuits the Opus call and routes straight to `reviseContentBundle` with one actionable line per defect; at the cap Opus runs and escalates to the human with the fact-check attached. The result lives in `_articleFactCheck` and reaches the article checkpoint as `factCheck`. **Every judgement call in the module errs toward NOT flagging** — a false structural failure costs a paid Opus revision. Two consequences of that rule (I2): the **reporter-mode scan reads NARRATOR text only** (`narratorText` — paragraph blocks plus headline/kicker/deck; NOT `visibleText`, whose generosity is for roster coverage), because a correctly attributed player quote saying “I voted” is the article doing its job; and the two uncalibrated checks named in **`FACT_CHECK_ADVISORY_ONLY = ['npcPronouns', 'leakedExample']`** push to `advisoryWarnings` only, never to `structuralIssues`. Card fidelity, unknown sources, roster coverage, photo references and narrator-scoped reporter mode stay structural. To promote an advisory check after a live session supports it, drop its name from that list and push its message to `structuralIssues` at the marked call site — but do NOT reword the message: `console/checkpoint-view-logic.js` groups by message prefix.

**Session Config Inputs** (captured at session start, NOT extracted from director notes):
- `reportingMode`: `'on-site' | 'remote'` — stamped from `rawInput` in `parseRawInput` (Step 1). It REPLACES the reporter persona: `PromptBuilder._buildReportingModeBlock` puts one `REPORTING_MODE_BLOCKS` entry in the article SYSTEM prompt right after the identity line. It used to arrive as a late override in `character-voice.md` and lost to the on-site persona stated earlier in the same file, so both remote sessions of the last five shipped as on-site. The evaluator has a structural `reporterMode` criterion (journalist only) and the fact-check scans the narrator's own prose for presence/vote claims. The prompt files are mode-neutral about where the reporter was: `character-voice.md` carries ONE short POV section that names `{{REPORTING_MODE}}` and defers to the system prompt's mode block, and the on-site persona sentences (“surveilling the party”, “the reporter was THERE”, “two hours in that room”, the participatory phrase list, the 3AM override example) are gone from character-voice.md, section-rules.md, writing-principles.md and anti-patterns.md, as are the `voiceQuestion` / `revisionVoice` presence claims in `lib/prompt-builder.js`. Pinned by `lib/__tests__/prompt-reporting-mode-neutral.test.js`.
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
lib/notion/                         # Unified Notion data-layer core (single source of truth)
├── databases.js                    # DB IDs, query filters, RELATION_REGISTRY + ENTITY_RELATIONS
├── parse.js                        # Pure page→element parsers (emit relation IDs, not names; no Container)
└── relations.js                    # Pure registry-driven applyRelationNames join (non-mutating)
lib/cache/
├── index.js                        # Public API for Notion caching
├── cached-notion-client.js         # Cache decorator: stores relation IDs + freshness-checked name table; read-time owner join
├── freshness-checker.js            # Cache staleness detection
└── notion-cache-store.js           # Persistent cache storage (SCHEMA_VERSION bump clears stale-shape blobs)
lib/notion-client.js                # Raw (uncached) Notion API client — consumes lib/notion/ core
lib/schema-validator.js             # JSON schema validation helpers
lib/sdk-client/
└── subagents.js                    # Programmatic SDK subagent defs (arc orchestrator, commits 8.8-8.11)
lib/content-bundle-fact-check.js    # Pure programmatic article fact-check (pre-Opus gate)
lib/evidence-preprocessor.js        # Evidence batch preprocessing
lib/image-preprocessor.js           # Image analysis preprocessing
lib/image-prompt-builder.js         # Image prompt construction for Haiku
lib/template-assembler.js           # Handlebars template compilation
lib/template-helpers.js             # Handlebars helper registration
lib/theme-config.js                 # Theme settings, NPC definitions, validation rules
lib/prompt-builder.js               # Prompt assembly for each phase
lib/workflow/
├── graph.js                        # LangGraph StateGraph (45 nodes, edges)
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

**Notion data layer (unified):** `lib/notion/` is the single source of truth — `databases.js` (DB IDs, query filters, the `RELATION_REGISTRY` + `ENTITY_RELATIONS`), `parse.js` (pure page→element parsers, emit relation IDs not names), `relations.js` (pure registry-driven `applyRelationNames` join). `NotionClient` (uncached) and `CachedNotionClient` (server-only decorator) both consume it; the standalone `journalist-report` skill scripts are thin wrappers over the uncached `NotionClient`. Resolved relation names are produced by a **read-time join**: the cache stores element relation IDs + a separately freshness-checked name table per target DB (`character` ← Characters DB), so renaming a related page (e.g. a character) is reflected on the next fetch without a manual cache clear. Add a resolved relation by adding one `RELATION_REGISTRY` entry + listing it in `ENTITY_RELATIONS`. (`Container` is intentionally not resolved — it exists in-game but is irrelevant to reports.)

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
  // every message carries `callId` (one UUID per call)
  tools: ['Read'],  // Optional: RESTRICTS the tool set (omit + no disableTools = full set incl. Bash/Write)
  allowedTools: ['Read'],  // Optional: permission auto-allow only; NOT a restriction
  label: 'Evidence analysis',  // For timeout error messages
  loadProjectSettings: true  // Optional: default false; true loads project .claude/skills/ + project CLAUDE.md
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
- `false` (**default**, flipped 2026-09-18 for H22) → `settingSources: []` — pure SDK isolation
- `true` → `settingSources: ['project']` — loads project `.claude/skills/` and project `CLAUDE.md` only

We never load user-level (`~/.claude/`) or local sources. A probe found those contribute ~86K tokens of irrelevant context (superpowers meta-skill, MEMORY.md, MCP server instructions, two `CLAUDE.md` files) that none of our SDK calls use. **Project scope is not free either (H22):** this `CLAUDE.md` (~9.4K tokens), `.claude/settings.json` `enabledPlugins`, skill frontmatter and the nine agent descriptions come to ~15.5K tokens per call and ~75K per session, and nothing in the pipeline reads any of it (`ThemeLoader` loads its prompt files with `fs`). Hence the default is OFF; a call that genuinely wants the project skill asks for it. This is pure context hygiene — it does NOT prevent the channel skip described above; that's a separate SDK bug.

**Tool gating (H21):** `allowedTools` is a permission AUTO-ALLOW list in this SDK, not a restriction (installed `sdk.d.ts`: "to restrict which tools are available, use the `tools` option"), and it is a no-op under `permissionMode: 'bypassPermissions'`. A call with neither `tools` nor `disableTools` runs with the full set, **Bash/Write/Edit included**. Every pipeline call now declares one: `disableTools: true` for pure text/structured output, `tools: ['Read']` for the two image calls. **MCP servers are gated separately:** `settingSources: []` does not stop the SDK loading the user's `~/.claude.json` MCP servers (the claude.ai connectors — a `tools: []` call still reported 103 `mcp__` tools, Gmail included, at `init`), so `client.js` always passes `mcpServers: {}` + `strictMcpConfig: true`; `init` on a pipeline call must report the declared count (0 or 1), pinned by `lib/__tests__/sdk-mcp-isolation.test.js`. **Auto-memory is gated the same way:** the subprocess loads the operator's `~/.claude/projects/<cwd>/memory/` regardless of `settingSources` (a probe showed the model reading MEMORY.md's 33 entries), so `client.js` passes `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` through `options.env`; `init.memory_paths` must be absent (`lib/__tests__/sdk-memory-isolation.test.js`).

**Model Call Limits (idle timeout + cost ceiling):** SDK calls use a **15-min IDLE/stall timeout**, not a total-duration cap — the timer is re-armed on every streamed message (including the token-level `includePartialMessages` deltas emitted as `llm_delta`), so a legitimately long call (big prompt + extended thinking) survives as long as it keeps producing; only a genuine stall (no streamed activity for 15 min) aborts. A stall throws `SDK timeout after … idle … with no streamed activity`, which `isSdkTimeoutError` recognizes and `isTransientError` (`lib/llm/retry.js`) classifies **transient** (the node-level `retryPolicy` consumes this to auto-retry transient SDK failures). Cost is bounded separately by a **per-call `maxBudgetUsd` ceiling** (`MODEL_BUDGETS` in `lib/llm/client.js`: opus $5, sonnet $2, haiku $0.5) — a generous backstop, not a tight cap; an overrun throws a labeled **non-transient** `error_max_budget_usd` that is never auto-retried (the budget is per-CALL, so N node-retries can cost up to N× the ceiling). Steady-state latency is still captured per-call via `duration_api_ms` on the `llm_complete` event (`lib/observability/progress-bridge.js`).

**Effort and thinking (operator gate 2026-09-19):** `EFFORT_LEVELS` sets `xhigh` for opus and sonnet. On Opus 4.8 that is a cliff for extraction-shaped prompts: the director-notes enrichment ended its first turn after thinking alone (~320s, no output), the SDK's structured-output enforcement re-requested, and the call cycled for 20 minutes without completing while re-arming the idle timer (it looked like a stall). `lib/director-enricher.js` therefore passes `effort: 'medium'` (165s; `high` 375s; both complete). The client also sets `thinking: { type: 'adaptive', display: 'summarized' }` for opus/sonnet — the SDK default display on Opus 4.8 / Sonnet 5 is "omitted", which streams thinking as EMPTY blocks, so a long think is a silent stream and the console's THINKING stage shows nothing. Arc analysis (286s) and outline/article generation completed at xhigh in the same run; if one of them ever shows the empty-thinking → `status: requesting` cycle, lower its effort per call.

**Model Pins** (see `MODEL_IDS` in `lib/llm/client.js`):
- `opus` → `claude-opus-4-8` (arc analysis, article validation)
- `sonnet` → `claude-sonnet-5` (default for most content generation nodes)
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
| revision | character-voice, evidence-boundaries, anti-patterns (appended LAST as `<RULES>` to all three revision prompts — they previously carried no craft rules at all) |
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
| State Management | N/A | 67 state fields with reducers |
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

**Features:** Graph visualization (45 nodes), state inspection, time-travel debugging, prompt iteration

## Console Frontend

**Access:** `http://localhost:3001/console` (local) or `https://console.aboutlastnightgame.com/console` (production)

**Stack:** React 18 + Babel standalone via CDN. Zero build process — edit JS/CSS and refresh.

**Architecture:** Single-page app with `useReducer` state machine. Each `.js` file is a `<script type="text/babel">` tag with its own Babel scope. Components register on `window.Console` namespace.

### Console File Structure

```
console/
├── index.html                      # SPA shell, CDN scripts, 30 script tags in load order
├── api.js                          # REST client + SSE-before-POST pattern, plus attach() (SSE-only, no POST)
├── state.js                        # useReducer: 25 actions, initialState, RESET_SESSION
├── utils.js                        # Badge, CollapsibleSection, JsonViewer, safeStringify, etc. (republishes CHECKPOINT_ORDER)
├── session-start-logic.js         # Dual-export PURE module: isValidSessionId (MMDDYY contract, mirrors server.js), classifyCheckpointResponse (not-found | at-checkpoint | in-progress | complete | resumable), startFreshDecision (go | confirm | not-allowed — C1), decideAttachFallback, shouldApplyAttachPoll (I4: the attach poll may not act on a stale answer — app.js mirrors state.processing + attachedSession into refs because the SSE handler runs during the await, and a duplicate CHECKPOINT_RECEIVED resets pendingEdits), buildReportLinks, completedResultFrom, CHECKPOINT_ORDER. Must load before utils.js AND components/SessionStart.js.
├── session-status-logic.js        # Dual-export PURE module: SET_ERROR / CLEAR_ERROR reducer fragments. Must load before state.js.
├── llm-stream-logic.js            # Dual-export PURE module: llmActivity lifecycle, eventLog append, failure/llm_error message derivation. Must load before state.js and app.js.
├── input-review-logic.js          # Dual-export PURE module for the InputReview checkpoint.
├── await-roster-logic.js          # Dual-export PURE module: roster entry validation against canonicalCharacters.
├── checkpoint-view-logic.js       # Dual-export PURE module: the read side of the four intervention gates — lastEvaluationFrom + evaluationView (the Opus verdict), arcCardModel + defaultArcSelection + arcSelectionNote, accusationView, whiteboardView, factCheckSummary, wordTail, steeringView. Must load before InputReview / AwaitFullContext / ArcSelection / Outline / Article.
├── outline-edit-logic.js          # Dual-export PURE module: all Outline-editor init/build/merge/validate/reset logic, incl. initThesis/buildThesisPayload (browser: window.Console.outlineEditLogic; node: module.exports). Unit-tested in node-env. Must load before Outline.js/Article.js.
├── app.js                          # Root: auth gate, checkpoint routing, rollback flow, attach-to-in-flight-run
├── console.css                     # All styles (~1800 lines, BEM naming, noir theme)
└── components/
    ├── LoginOverlay.js             # Auth overlay
    ├── SessionStart.js             # Session ID + Start Fresh; Resume classifies the session first (never resumes a complete thread; attaches to an in-flight one)
    ├── ProgressStream.js           # SSE progress + LLM activity display
    ├── PipelineProgress.js         # 10-step checkpoint stepper (pass completedCheckpoints: CHECKPOINT_ORDER to make every step a rollback target)
    ├── CheckpointShell.js          # Shared checkpoint wrapper
    ├── RevisionDiff.js             # Revision banner + budget + previous feedback (from the server payload) and, when a previous version is cached client-side, the shallow diff, + hand-edit advisory and standing notes (`steeringView`). MUST load before ArcSelection/Outline/Article — all three destructure it at load time.
    ├── RollbackPanel.js            # Rollback confirmation modal
    ├── CompletionView.js           # Success screen with report link
    ├── FileBrowser.js              # Session file browser
    └── checkpoints/
        ├── InputReview.js          # Parsed session input: accusation (accused/charge/notes), whiteboard, enrichment counts, approve or reject-with-corrections
        ├── PaperEvidence.js        # Selectable paper evidence list
        ├── PreCuration.js          # Evidence preprocessing summary
        ├── AwaitRoster.js          # Tag-style roster name input
        ├── CharacterIds.js         # Photo gallery + character mapping
        ├── AwaitFullContext.js      # Accusation/report/notes collection
        ├── EvidenceBundle.js       # Three-layer evidence display + rescue
        ├── ArcSelection.js         # Arc card grid with selection + outline guidance
        ├── Outline.js              # Article outline + approve/edit/reject
        └── Article.js              # Content bundle + HTML preview iframe
```

### Modifying Checkpoint Components

Each checkpoint component follows the same pattern:
1. Registers on `window.Console.checkpoints`
2. Receives `{ data, sessionId, theme, onApprove, onReject, onRollback, dispatch, revisionCache, pendingEdits }` props
3. Renders checkpoint-specific UI from `data`
4. Calls `onApprove(payload)` / `onReject(payload)` with the checkpoint-specific payload, or `onRollback(checkpointType)` to open the rollback modal

**Conventions:** `const` not `var`, direct destructured imports (no aliasing), `safeStringify` instead of `JSON.stringify`, CSS utility classes over inline styles, aria-labels on interactive elements, functional state updaters for Set manipulation, `useEffect` reset on data change.

Each of `Outline.js` and `Article.js` validates a pending hand edit through ONE local `gateEdits` helper that both the approve and the reject path call (pinned by `__tests__/unit/console-edit-gates.test.js`); a new path that sends edits goes through it too.

**`onRollback` is the only way a checkpoint may open the rollback modal.** It is the same `setRollbackTarget` callback the stepper uses, so Confirm goes through the existing streaming rollback. A component must NOT dispatch its own rollback action — ArcSelection's zero-arc dead end dispatched `SHOW_ROLLBACK`, which no reducer handles, so the only offered recovery logged `[state] Unknown action` and did nothing.

### Checkpoint payload keys the gates read

The server sends these on BOTH delivery paths (`GET /checkpoint` and the SSE `complete` of approve/resume/rollback both merge `getCheckpointData(state)` under the `interrupt()` value via `buildCompleteCheckpointData`). Read them through `checkpoint-view-logic.js`, not inline: every one of them replaced a field name that did not exist.

| Key | On | Read by |
|---|---|---|
| `lastEvaluation` | arc-selection, outline, article | `lastEvaluationFrom(data, phase)` → `evaluationView` → the shared `utils.js` `EvalBar`. The last `evaluationHistory` entry FOR THAT PHASE; `evaluationHistory` is an append-only array mixing all three phases, and reading `.overallScore` off the array is why no gate ever rendered a verdict. The score is 0–1, `structuralPassed` is only on the fact-check-sourced entry (fall back to `ready`), and `advisoryWarnings` is the field (not `advisoryNotes`). |
| `factCheck` | article | `factCheckSummary(factCheck)` → the defect list above the article body, and `approveLabel(summary, hasEdits)` → the button copy. The count is **structural only** (`Approve anyway (4 unresolved, 1 advisory)`); advisory warnings are suggestions, not blockers, so they are reported alongside and never put "anyway" on the button. `{structuralIssues, advisoryWarnings, cardFidelity[], rosterCoverage.missing[], photoReferences.invalid[], reporterMode.violations[]}` from `lib/content-bundle-fact-check.js`. |
| `htmlPreview` | article | The preview iframe's `srcDoc`, after a client-side `<script>` strip. Rendered from the PENDING bundle with the publishing `TemplateAssembler` and already carrying `<base href="/">`, so it exists on the first pass — `assembledHtml` does not (it is written two nodes later). |
| `sessionPhotos` | article, character-ids | `photoUrl(filename)` matches on basename and serves `/api/file?path=<abs>`. `/sessionphotos/<id>/<file>` only exists after `assembleHtml` copies the photos, i.e. after the gate. |
| `enrichment` | input-review | The enrichment panel: `{quotes, characterMentions, transactionReferences, fallback:{reason}|null, warnings:{droppedQuotes}}`. A `fallback` means the article will have NO quote bank and must be surfaced in red. |
| `previousFeedback`, `revisionCount`, `humanRevisionCount`, `maxRevisions` | arc-selection, outline, article | `RevisionDiff`, which renders the banner/budget/feedback from these alone; only the diff listing needs the client-side `revisionCache`. |
| `handEditReport` | outline, article | `{checked, changed}` from `_outlineHandEditReport`/`_articleHandEditReport`: which of the director's hand-edited scopes the rework kept or changed; read through `checkpoint-view-logic.js#steeringView` into `RevisionDiff`; `null` when the reject carried no edits. |
| `directorGateNotes` | arc-selection, outline, article | Every rejection note so far, `{gate, kind, round, text, at}`; rendered as "Standing notes the writer will see". |
| `outlineThesis` | article | `{hook, keyTension, primaryArc}` from the approved outline's LEDE (journalist only; `null` for detective) for the read-only echo above the headline. |

`parsedInput` is **gone** — `_parsedInput` was never an Annotation channel, so LangGraph dropped every write. Do not re-add a read of it.

### Input-review reject flow (re-parse, not rollback)

`InputReview` is not approve-only. Approve sends `{ inputReview: true }`; Reject with Corrections sends `{ inputReview: false, inputFeedback: '<prose>' }`. `buildResumePayload` turns that into `{approved: false, feedback}`, and `checkpointInputReview` stores it as `_inputCorrections`, nulls `sessionConfig`/`directorNotes`/`playerFocus` so `parseRawInput` re-runs, and routes the graph back — `parseRawInput` appends the corrections to every parse prompt. A mis-parsed roster, accusation or journalist name is therefore fixed with a note, not with a rollback and a full re-collection. There is no `inputEdits` path (the key wrote a state channel nothing declared or read).

### Rolling back a COMPLETE session

A finished thread has no checkpoint (`GET /checkpoint` returns `checkpoint: null`), so neither rollback opener could be reached for it. `SessionStart`'s `'complete'` branch therefore loads the completion instead of resuming (resuming re-runs the whole paid pipeline): `SET_THEME` → `SET_SESSION` → `SESSION_COMPLETE_LOADED`, whose payload comes from `sessionStartLogic.completedResultFrom(checkpointResponse)`. That action sets `completedResult` plus `completedStepper`, and `app.js` renders `PipelineProgress` with `completedCheckpoints: CHECKPOINT_ORDER` above `CompletionView`, so every step is a rollback target and the existing `RollbackPanel` flow applies. Nothing is POSTed until Confirm. `CHECKPOINT_RECEIVED` clears `completedResult`/`completedStepper`, because App renders the completion branch BEFORE the checkpoint branch and a stale completion would hide the checkpoint the rollback just produced.

### Outline Editor Architecture (`Outline.js` + `outline-edit-logic.js`)

The Outline checkpoint's per-section editors (journalist LEDE / THE STORY / FOLLOW THE MONEY / THE PLAYERS / WHAT'S MISSING / CLOSING, and the 5 detective sections) are **thin wrappers**: each seeds `useState` from `EditLogic.init*(section)`, composes shared module-scope widgets (`TextField`, `EnumSelect`, `StringListEditor`, `ObjectListEditor`, `KeyValueEditor`, `actionsRow`), and on save calls `onSave(EditLogic.build*Payload(state, originalSection))` → `saveSectionEdit('<sectionKey>', payload)`. `EditLogic` = `window.Console.outlineEditLogic` (aliased at module scope in both `Outline.js` and `Article.js`).

- **All save/build/merge/validate logic is PURE and lives in `outline-edit-logic.js`, not in the React components.** Builders `deepClone` the original section, so untouched required/extra keys are preserved and NO stray keys are emitted (every section is `additionalProperties:false`). Builders keep blank rows — pruning/non-empty enforcement is the validation layer's job.
- **Edited outlines are schema-validated before article generation** (the B7 gate): client-side via `EditLogic.validateOutlineShape(outline, theme)` (dependency-free — blocks Approve + renders `.validation-error`) and server-side in `buildResumePayload` (`SchemaValidator` against `outline` / `detective-outline`, rejects invalid edits). Distinct from the generation-time `validateOutlineStructure` removed in 8.23 — this specifically gates HUMAN edits.
- **Edited ARTICLES have the same two gates:** `EditLogic.validateBundleShape(bundle)` client-side (blocks Approve from both the inline editors and the JSON editor) and the `content-bundle` schema server-side. `validateBundleShape` is deliberately never STRICTER than `content-bundle.schema.json` — `heading` stays optional, `metadata.generatedAt` is not required — because a false block on a bundle the server would accept is a dead end the director cannot clear. A test pins that direction.
- **Every container that holds a pencil must carry `article-block--editable`**, and the pencil has **two reveal modes** (pinned by `__tests__/unit/console-editable-pencils.test.js`):
  - `article-block--editable` alone → hidden until `:hover` / `:focus-within`. This is what the **article** gate uses: its 13 hosts are full-width per-block containers (paragraph, quote, list, evidence card, photo, pull quote, financial row, one-line byline) whose own first line reaches the top-right corner, and an always-on button landed on the prose at 19 of 54 rendered blocks.
  - `+ article-block--editable-always` → rendered at low opacity, full opacity on hover/focus. **Outline hosts only** (a short ALL-CAPS `<h4>` sits at the top-left, so the corner is free) plus a `padding-right` gutter. `Outline.js` routes all 13 of its hosts through its `ALWAYS` constant. Never put it on an Article host.

  `Outline.js` emitted neither class at any of its 13 call sites originally, so the whole editor layer was `display: none` forever. The always-visible rule is a **descendant** selector: across the three opt-in host shapes the button sits at three different depths, so a child selector silently misses two of them.
- **Reset effect** is keyed on `EditLogic.computeResetKey(data, revisionCount)` (collision-resistant) in both `Outline.js` and `Article.js`. Do NOT revert to a truncated `safeStringify(...).slice(0, N)` — it collides across revisions and leaks stale edits.
- **Wiring debugging:** the section→editor→builder→`saveSectionEdit` key→schema map is documented in `docs/superpowers/plans/2026-05-28-outline-rich-editor-fixes.md` (the implementation plan + bug→task table).
- **Known minor:** the list widgets key rows by array index, so removing a mid-list row can momentarily drop input focus (no data-correctness impact).

## State Management

**Reducers** (`lib/workflow/state.js`): replace (default), append (arrays), appendSingle (single item), merge (objects)
**Rollback**: API accepts `rollbackTo` parameter to regenerate from checkpoint

## API Reference

### Session REST API

**Step-by-step Pipeline Control:**
- `/api/session/:id/start` (POST) - Start new session with raw input. **The session ID must be the session date as MMDDYY** (`091826`), optionally with one extra digit for a second session the same day (`0918262`); anything else is a 400 (B1: the emailer builds each player's report link from this id, and `data/<id>/` + `outputs/report-<id>.html` are named after it). `ALLOW_NONSTANDARD_SESSION_ID=true` in the server's env opts out for throwaway harness runs. **A session id whose thread already exists returns 409** `{currentPhase}` unless the body carries `{force:true}` (C1). A forced start seeds `buildFreshStartState()` (`lib/api-helpers.js`), which clears EVERY state channel except `theme`, `sessionId` and the new `rawSessionInput` — including the photo channels (`sessionPhotos`, `preprocessStats`, `photoAnalyses`), the raw full-context inputs and the parse. Fresh start is its OWN list (`FRESH_START_CLEARS` in `lib/workflow/state.js`), never a rollback target: `buildRollbackState('input-review')` deliberately preserves everything upstream of the parse, so seeding a start from it kept the old photos, roster and parse and paused once on them.
- `/api/session/:id/resume` (POST) - Resume existing workflow (re-invoke at current state). NON-BLOCKING: returns `{status:'processing'}` immediately, runs the graph in the background, and delivers the result via the `/progress` SSE `complete` event (same contract as `/approve`). Clients MUST use SSE-before-POST. (A long re-invoke would otherwise exceed undici's 5-min `headersTimeout` / Cloudflare's ~100s edge timeout on a held-open POST.) **A COMPLETE thread returns 409** `{currentPhase:'complete'}` unless the body carries `{force:true}` — re-invoking a finished thread replays it from START, and every skip condition is already satisfied, so the whole paid pipeline re-runs unattended and overwrites the session's inputs and published report (B9).
- `/api/session/:id/approve` (POST) - Submit checkpoint approval
- `/api/session/:id/rollback` (POST) - Roll back to checkpoint. NON-BLOCKING (same contract as resume/approve); the SSE completion payload carries `rolledBackTo` + `fieldsCleared`. **A rollback also invalidates the evaluations it makes stale** (I1): `buildRollbackState` appends `{phase, ready:false, reason:'rollback-invalidated', source:'rollback'}` for `article` (and for both `outline` and `article` when rolling back to `outline`, `photos` or `character-ids` — the two photo-branch points preserve the arc verdict but regenerate both later phases; see `PHASES_INVALIDATED_BY` in `lib/api-helpers.js`), because those four points preserve `evaluationHistory` and `evaluatePhase`'s skip logic returns early on a `ready:true` most-recent entry — so without the stub the regenerated article skipped both the Opus evaluation and the programmatic fact-check and the gate opened on the PREVIOUS article's verdict. `arc-selection` and everything upstream clear the history outright, so they need no stub.
- `/api/session/:id/state` (GET) - Get current state
- `/api/session/:id/state/:field` (GET) - Get single state field
- `/api/session/:id/checkpoint` (GET) - Get checkpoint info: `{sessionId, currentPhase, interrupted, checkpointType, checkpoint, theme, inProgress, lastOutcome}`. `checkpoint` is the SAME merged payload the SSE/approve path delivers (`buildCompleteCheckpointData`, so state extras like `sessionPhotos` are included), or null when not interrupted. `inProgress` is `isSessionLocked(id)` and `lastOutcome` the persisted outcome, so a client can reattach to a run instead of blind-POSTing into a 409 (H1, H2, H8).
- `/api/session/:id/progress` (GET, SSE) - Stream pipeline progress events

**Utility:**
- `/api/health` (GET) - Health check
- `/api/config` (GET) - Client configuration: `{notionConfigured, allowNonstandardSessionId}`. The console validates the session ID against the same MMDDYY contract `/start` enforces, so it needs the `ALLOW_NONSTANDARD_SESSION_ID` opt-out.
- `/api/browse` (GET) - List session data files
- `/api/file` (GET) - Read session data file

See `server.js` for detailed usage and request/response shapes.

**Non-blocking endpoints** (`/start` excepted — it interrupts in seconds): `/approve`, `/resume`, `/rollback` all run their `graph.invoke` in the background via `lib/api-background-runner.js#runGraphInBackground` (one source of truth for the CONC-1 lock + DUR-2 drain + DEL-1 outcome + SSE `emitComplete`). The sessionId-keyed lock gives mutual exclusion across all three; a concurrent second call gets a 409.

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

**Console has NO DOM/React test harness** (node test env only — no jsdom/testing-library/babel-jest, by design). Test console logic by extracting it into a **dual-export** module (`window.Console.X` for the browser + an `if (typeof module !== 'undefined' && module.exports)` node guard) and unit-testing the pure functions in node-env — see `checkpoint-view-logic.test.js`, `outline-edit-logic.test.js` and `server-build-resume-payload.test.js` (which `require('../../server.js')`; `server.js` is guarded by `require.main === module` so requiring it doesn't start the server). React component **wiring** (which control opens which editor, save routing, error rendering) has no automated test — verify it with a manual browser click-through.

## Troubleshooting

**SDK not available:** `claude /login` then `npm install`
**Workflow errors:** Check logs for missing input files, expired Notion token, or SDK timeouts
**Resume behavior:** State persists via `MemorySaver` checkpointer
**Photos directory not found after arc selection with a start-time path:** the failure card now offers a rollback to `photos` (free); the API form is `POST /rollback {rollbackTo:'photos'}` / harness `--rollback photos`; do not roll back to `arc-selection` (it re-pays the arc analysis and keeps the path).

See `PIPELINE_DEEP_DIVE.md#common-debugging-scenarios` for detailed debugging guides.

## Emailer

**Send follow-up emails:** from `emailer/`, run `python send_followup_emails_smart.py` (interactive prompts; session date is entered as MMDDYY)
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
| `llm-log/` | Per-call prompt/response log (`lib/observability/llm-call-log.js`), written on `llm_start` and rewritten on completion; disabled under Jest unless a test opts in | `<yyyymmdd-HHMMSS>-<context>-<callId8>.json` per call, index.jsonl |

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
