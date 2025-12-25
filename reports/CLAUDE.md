# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ALN Director Console** - AI-powered investigative article generator for "About Last Night" using Claude Agent SDK with LangGraph workflow.

Generates journalist-style investigative articles by:
1. Fetching memory tokens and paper evidence from Notion database
2. Curating evidence bundle using three-layer model (exposed/buried/context)
3. Analyzing narrative arcs via parallel specialist subagents
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

# Remote access
start-everything.bat   # Windows: Start server + Cloudflare tunnel
cloudflared tunnel run aln-console  # Manual tunnel start
```

## Architecture

### LangGraph Workflow (6 Phases, 23 Nodes)

```
Phase 0: Input Parsing → Phase 1: Data Acquisition → Phase 1.6-1.8: Processing
→ Phase 2: Arc Analysis → Phase 3: Outline → Phase 4: Article → Phase 5: Assembly
```

**Human Checkpoints (workflow pauses for approval):**
- `input-review` - Review parsed session input
- `paper-evidence-selection` - Select which evidence was unlocked during gameplay
- `character-ids` - Map characters to photos based on Haiku's descriptions
- `evidence-and-photos` - Approve curated evidence bundle
- `arc-selection` - Select which narrative arcs to develop
- `outline` - Approve article structure
- `article` - Final article approval before assembly

**Revision Loops:** Arcs (max 2), Outline (max 3), Article (max 3)

### Key Files

```
server.js                           # Express server + /api/generate endpoint
lib/sdk-client.js                   # Claude Agent SDK wrapper with timeouts
lib/workflow/
├── graph.js                        # LangGraph StateGraph (23 nodes, edges)
├── state.js                        # State annotations, phases, reducers
├── generation-supervisor.js        # Orchestrator for arc analysis
└── nodes/
    ├── index.js                    # Node barrel export
    ├── input-nodes.js              # Raw input parsing
    ├── fetch-nodes.js              # Notion/filesystem data loading
    ├── photo-nodes.js              # Haiku vision analysis
    ├── preprocess-nodes.js         # Batch evidence summarization
    ├── arc-specialist-nodes.js     # Orchestrated subagent analysis
    ├── evaluator-nodes.js          # Quality evaluation per phase
    ├── ai-nodes.js                 # Claude content generation
    └── template-nodes.js           # HTML assembly
```

### Session Data Structure

```
data/{sessionId}/inputs/
├── session-config.json         # Roster, accusation, game metadata
├── director-notes.json         # Observations, whiteboard data
├── selected-paper-evidence.json # User-selected evidence items
├── character-ids.json          # Photo-to-character mappings
└── orchestrator-parsed.json    # AI-parsed input (cache)
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

### Subagent Architecture (Arc Analysis)

The orchestrator coordinates three specialist subagents via Claude Code Task tool:
- `journalist-financial-specialist` - Transaction patterns, account analysis
- `journalist-behavioral-specialist` - Character dynamics, director observations
- `journalist-victimization-specialist` - Memory burial targeting patterns

Subagents are invoked in parallel and their findings synthesized into narrative arcs.

## State Management

**Reducers in `lib/workflow/state.js`:**
- `replaceReducer` - Standard replace (most fields)
- `appendReducer` - Array accumulation (errors)
- `appendSingleReducer` - Add single item (evaluationHistory)
- `mergeReducer` - Shallow merge objects

**Rollback System:** API accepts `rollbackTo` parameter to clear state from checkpoint forward and regenerate.

## API Reference

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
