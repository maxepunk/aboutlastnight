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
```

## Architecture

### LangGraph Workflow (6 Phases, 25+ Nodes)

```
Phase 0: Input Parsing (conditional) → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: Arc Analysis (single SDK call) → Phase 3: Outline → Phase 4: Article → Phase 5: Assembly
```

**Human Checkpoints (7 total - workflow pauses for approval):**

| Checkpoint | Phase | Purpose |
|------------|-------|---------|
| `input-review` | 0.2 | Review AI-parsed session input (roster, accusation, whiteboard) |
| `paper-evidence-selection` | 1.35 | Select which paper evidence was unlocked during gameplay |
| `character-ids` | 1.66 | Map characters to photos based on Haiku's visual descriptions |
| `evidence-and-photos` | 1.8 | Approve curated three-layer evidence bundle |
| `arc-selection` | 2.3 | Select which narrative arcs to develop (3-5 recommended) |
| `outline` | 3.2 | Approve article structure and photo placements |
| `article` | 4.2 | Final article approval before HTML assembly |

**Revision Loops:** Arcs (max 2), Outline (max 3), Article (max 3)

### Key Files

```
server.js                           # Express server + /api/generate endpoint
lib/sdk-client.js                   # Claude Agent SDK wrapper with timeouts
lib/theme-config.js                 # Theme settings, NPC definitions, validation rules (8.17)
lib/prompt-builder.js               # Prompt assembly for each phase
lib/workflow/
├── graph.js                        # LangGraph StateGraph (27 nodes, edges)
├── state.js                        # State annotations, phases, reducers
├── tracing.js                      # LangSmith observability integration
├── generation-supervisor.js        # Deprecated - see arc-specialist-nodes.js (8.15)
└── nodes/
    ├── index.js                    # Node barrel export
    ├── input-nodes.js              # Raw input parsing
    ├── fetch-nodes.js              # Notion/filesystem data loading
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
const { sdkQuery } = require('./lib/sdk-client');

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

### Arc Analysis Architecture (Commit 8.15)

Arc analysis uses a **single comprehensive SDK call** (not parallel subagents):
- Player conclusions (accusation + whiteboard) drive arc identification
- Director observations provide ground truth weighting
- Three-lens analysis (financial/behavioral/victimization) embedded in prompt
- Returns 3-5 narrative arcs with evidence mapping

**Why single-call?** Player focus must guide everything. Parallel specialists couldn't share this context efficiently. See `lib/workflow/nodes/arc-specialist-nodes.js`.

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
- Combines: loaded rules + session context + structural framing
- Methods: `buildArcAnalysisPrompt()`, `buildOutlinePrompt()`, `buildArticlePrompt()`

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
| State Management | N/A | 33+ state fields with reducers |
| Checkpointing | N/A | MemorySaver/SqliteSaver |
| Human Approval | N/A | `awaitingApproval` routing |
| Revision Loops | N/A | Conditional edges with caps |
| Timeouts | AbortController per call | N/A |

**Data Flow:**
```
State → Node extracts context → PromptBuilder assembles prompt
→ sdkQuery() calls Claude → Returns structured output → Node updates state
→ LangGraph routes to next node (or checkpoint)
```

### LangSmith Tracing

Enable observability with environment variables:
```bash
LANGSMITH_TRACING=true
LANGSMITH_API_KEY=lsv2_...
LANGSMITH_PROJECT=aln-director-console
```

**Usage in nodes:**
```javascript
const { traceNode } = require('../tracing');
module.exports = { myNode: traceNode(myNodeImpl, 'myNode') };
```

Traces include: execution timing, state snapshots, SDK call inputs/outputs.

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
# Returns: {"approvalType":"input-review","currentPhase":"0.2"}

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

Jest with SDK mock at `__tests__/mocks/anthropic-sdk.mock.js`. Coverage thresholds: 80% lines/functions/statements, 70% branches.

```javascript
// Nodes export mock factories for testing
const { mocks } = require('./lib/workflow/nodes');
const mockSdk = mocks.createMockSdkClient();
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

```
data/{sessionId}/
├── inputs/                         # User-provided and AI-parsed inputs
│   ├── session-config.json         # Roster, accusation, journalist name
│   ├── director-notes.json         # Observations + whiteboard content
│   ├── selected-paper-evidence.json # Items unlocked this session
│   ├── character-ids.json          # Photo-to-character mappings
│   └── orchestrator-parsed.json    # Parsed raw input (cache)
├── fetched/                        # Raw data from external sources
│   ├── tokens.json                 # Memory tokens from Notion
│   └── paper-evidence.json         # Props/Documents from Notion
├── analysis/                       # AI-generated intermediate outputs
│   ├── image-analyses-combined.json
│   ├── evidence-bundle.json        # Curated three-layer bundle
│   ├── arc-analysis.json           # Narrative arc candidates
│   └── article-outline.json        # Approved structure
├── summaries/                      # Checkpoint-friendly summaries
│   ├── evidence-summary.json
│   ├── arc-summary.json
│   └── outline-summary.json
└── output/                         # Final deliverables
    ├── article.html
    └── article-metadata.json
```
