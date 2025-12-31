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

### LangGraph Workflow (6 Phases, 40 Nodes)

```
Phase 0: Input Parsing (conditional) → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: Arc Analysis (player-focus-guided) → Phase 2.4: Evidence Packaging
→ Phase 3: Outline → Phase 4: Article → Phase 5: Assembly
```

*See lib/workflow/graph.js for complete node list*

**Human Checkpoints (10 total - workflow pauses for approval via native `interrupt()`):**

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

**Revision Loops:** Arcs (max 2), Outline (max 3), Article (max 3)

### Key Files

```
server.js                           # Express server + /api/generate endpoint
lib/llm/
├── index.js                        # Public API: traced sdkQuery, createProgressLogger
└── client.js                       # Raw SDK wrapper with timeouts, progress hooks
lib/observability/
├── index.js                        # Public exports: traceNode, progressEmitter
├── config.js                       # isTracingEnabled(), getProject()
├── constants.js                    # SDK_MESSAGE_TYPES, SSE_EVENT_TYPES
├── state-snapshot.js               # extractStateSnapshot for traces
├── node-tracer.js                  # traceNode() wrapper
├── llm-tracer.js                   # createTracedSdkQuery() with full visibility
├── progress-emitter.js             # SSE progress streaming via EventEmitter
├── progress-bridge.js              # Unified progress/tracing (llm_start/llm_complete)
└── message-formatter.js            # DRY formatting for console + SSE
lib/theme-config.js                 # Theme settings, NPC definitions, validation rules (8.17)
lib/prompt-builder.js               # Prompt assembly for each phase
lib/workflow/
├── graph.js                        # LangGraph StateGraph (37 nodes, edges)
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
    ├── ai-nodes.js                 # Claude content generation
    ├── validation-nodes.js         # Programmatic validation (8.20)
    └── template-nodes.js           # HTML assembly
lib/schemas/
├── content-bundle.schema.json      # Final article content structure
├── preprocessed-evidence.schema.json # Batch-summarized evidence items
└── outline.schema.json             # Article outline validation (8.25)
```

### Template System

```
templates/journalist/
├── layouts/article.hbs         # Main article layout
└── partials/
    ├── header.hbs, navigation.hbs
    ├── content-blocks/         # paragraph, quote, list, evidence-reference
    └── sidebar/                # financial-tracker, evidence-card, pull-quote
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
  timeoutMs: 300000,  // Optional, defaults by model
  onProgress: (msg) => console.log(msg.type, msg.elapsed),  // Optional streaming
  allowedTools: ['Read'],  // Optional, for images
  label: 'Evidence analysis'  // For timeout error messages
});
```

**Model Timeouts:** Haiku 2min, Sonnet 5min, Opus 10min

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

### Prompt Architecture

**Prompt Loading (ThemeLoader):**
- Prompts stored in `.claude/skills/journalist-report/references/prompts/`
- 11 markdown files define rules (not templates)
- Cached at startup, loaded per-phase via `lib/theme-loader.js`

**Prompt Assembly (PromptBuilder):**
- `lib/prompt-builder.js` assembles complete prompts
- Uses **XML tag format** for prompt sections (Commit ba3f534)
- `labelPromptSection()` wraps content in `<tag>content</tag>` format
- Token savings: ~560 tokens per article generation
- Cross-references: "See `<arc-flow>` Section 3" format
- Methods: `buildArcAnalysisPrompt()`, `buildOutlinePrompt()`, `buildArticlePrompt()`

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
| State Management | N/A | 51 state fields with reducers |
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

LangSmith Studio is a web-based IDE for visualizing and debugging LangGraph agents. It connects to a local Agent Server.

**Quick Start:**
```bash
# Start the Agent Server (auto-opens Studio in browser)
npx @langchain/langgraph-cli dev

# With tunnel for Safari or remote access
npx @langchain/langgraph-cli dev --tunnel
```

**What happens:**
1. Agent Server starts on `http://localhost:2024`
2. Browser opens to `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2024`
3. Studio connects to your local graph for visualization and debugging

**Configuration:** `langgraph.json` in project root defines the graph as `./lib/studio/entry.js:graph` (file:export format).

**Requirements:**
- LangSmith account (free at smith.langchain.com)
- `LANGSMITH_API_KEY` in `.env`
- All dependencies installed (`npm install`)

**Studio Features:**
- Graph topology visualization (all 37 nodes)
- Interactive execution with state inspection
- Time-travel debugging through checkpoints
- Thread and assistant management
- Prompt iteration tools

**Note:** Safari blocks localhost connections. Use `--tunnel` flag to create a secure Cloudflare tunnel instead.

## State Management

**Reducers in `lib/workflow/state.js`:**
- `replaceReducer` - Standard replace (most fields)
- `appendReducer` - Array accumulation (errors)
- `appendSingleReducer` - Add single item (evaluationHistory)
- `mergeReducer` - Shallow merge objects

**Rollback System:** API accepts `rollbackTo` parameter to clear state from checkpoint forward and regenerate.

## API Reference

### Main Generation Endpoint

**POST /api/generate** (protected)
```json
{
  "sessionId": "1221",
  "theme": "journalist",
  "rawSessionInput": { "roster": "...", "accusation": "...", ... },
  "rollbackTo": "arc-selection",  // Optional: regenerate from checkpoint
  "stateOverrides": { "playerFocus": {...} },  // Optional: inject state
  "approvals": {
    "selectedArcs": ["arc-id-1", "arc-id-2"],
    "outline": true
  }
}
```

### Session State REST Endpoints (Commit 8.9.7+)

These endpoints enable step-by-step pipeline control:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/session/:id/start` | POST | Start new session with raw input |
| `/api/session/:id/approve` | POST | Submit approval for current checkpoint |
| `/api/session/:id/rollback` | POST | Roll back to specific checkpoint |
| `/api/session/:id/state` | GET | Get current session state |
| `/api/session/:id/state/:field` | GET | Get specific state field |
| `/api/session/:id/checkpoint` | GET | Get current checkpoint info |

**Example: Step-by-step API flow**
```bash
# 1. Start session
curl -X POST /api/session/1225/start -d '{"theme":"journalist","rawSessionInput":{...}}'

# 2. Check current checkpoint
curl /api/session/1225/checkpoint
# Returns: {"interrupted":true,"checkpoint":{"type":"input-review"},"currentPhase":"0.2"}

# 3. Approve checkpoint
curl -X POST /api/session/1225/approve -d '{"inputReview":true}'

# 4. Rollback if needed
curl -X POST /api/session/1225/rollback -d '{"rollbackTo":"arc-selection"}'
```

## Environment Setup

```bash
cp .env.example .env
# Required:
#   NOTION_TOKEN=ntn_...
#   ACCESS_PASSWORD=your-password
#   SESSION_SECRET=<generate with crypto.randomBytes(32).toString('hex')>
```

## Testing

Jest with SDK mocks at `__tests__/mocks/`. Coverage thresholds: 80% lines/functions/statements, 70% branches.

**Mock Files:**
- `anthropic-sdk.mock.js` - External SDK mock for Jest module mapper
- `llm-client.mock.js` - LLM client factory mock for node testing
- `checkpoint-helpers.mock.js` - Prevents `interrupt()` from throwing in unit tests

```javascript
// Mock checkpoint helpers in unit tests to prevent GraphInterrupt
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

// Use LLM client mock for SDK calls
const { createMockSdkClient } = require('../../mocks/llm-client.mock');
```

## Troubleshooting

**"Claude Agent SDK not available"**
```bash
claude /login     # Re-authenticate
npm install       # Ensure SDK installed
```

**Workflow errors:** Check phase-specific logs. Common issues:
- Missing `data/{sessionId}/inputs/` files
- Notion API token expired
- SDK timeout (increase via `timeoutMs`)

**Resume behavior:** Graph uses `MemorySaver` checkpointer. State persists in memory across API calls via shared checkpointer instance.

## Emailer

```bash
# Send follow-up emails to attendees
python emailer/send_followup_emails_smart.py --date MMDD --test
python emailer/send_followup_emails_smart.py --date 1218 --send
```

See `emailer/SETUP_GUIDE.md` for Gmail app password configuration.

## Journalist Skill (Direct Claude Code Usage)

The `/journalist-report` skill in `.claude/skills/journalist-report/` enables article generation directly through Claude Code without the server.

**Custom Subagents** (defined in `.claude/agents/`):

| Agent | Model | Purpose |
|-------|-------|---------|
| `journalist-image-analyzer` | Sonnet | Visual analysis of session photos & Notion documents |
| `journalist-evidence-curator` | Sonnet | Build three-layer evidence bundle from raw data |
| `journalist-arc-analyzer` | Opus | Director observations drive arc selection |
| `journalist-outline-generator` | Sonnet | Create outline with evidence/photo placements |
| `journalist-article-generator` | Opus | Generate final HTML with Nova's voice |
| `journalist-article-validator` | Sonnet | Anti-pattern detection, voice scoring |

**Note:** The following specialist agents exist for direct skill use but are NOT invoked by the server workflow (Commit 8.15 moved to single SDK call):
- `journalist-financial-specialist` - Transaction patterns, account analysis
- `journalist-behavioral-specialist` - Character dynamics, zero-footprint analysis
- `journalist-victimization-specialist` - Targeting patterns, operator/victim analysis

**Key Reference Files:**
- `references/prompts/writing-principles.md` - Nova's voice and style
- `references/prompts/anti-patterns.md` - What to avoid (em-dashes, game mechanics)
- `references/prompts/evidence-boundaries.md` - Three-layer privacy model
- `references/schemas.md` - JSON structures for intermediate outputs

## Session Data Directory Structure

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `inputs/` | User-provided and AI-parsed inputs | session-config.json, director-notes.json, character-ids.json |
| `fetched/` | Raw data from external sources | tokens.json, paper-evidence.json |
| `analysis/` | AI-generated intermediate outputs | evidence-bundle.json, arc-analysis.json, article-outline.json |
| `summaries/` | Checkpoint-friendly summaries | evidence-summary.json, arc-summary.json, outline-summary.json |
| `output/` | Final deliverables | article.html, article-metadata.json |

For complete directory structure and file descriptions, see `PIPELINE_DEEP_DIVE.md#session-data-directory-structure`.
