# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ALN Director Console** - AI-powered case report generator for "About Last Night" using Claude Agent SDK with LangGraph workflow.

Generates detective/journalist-style case reports by:
1. Fetching inventory items and evidence from Notion database
2. Curating evidence bundle (memory tokens + paper evidence)
3. Analyzing narrative arcs based on player focus
4. Generating article outline and final HTML report

**Production URL:** `https://console.aboutlastnightgame.com` (via Cloudflare Tunnel)

## Technology Stack

- **Node.js/Express** - Backend server (`server.js`)
- **Claude Agent SDK** - AI operations via `@anthropic-ai/claude-agent-sdk`
- **LangGraph** - Workflow orchestration via `@langchain/langgraph`
- **Notion API** - Inventory database
- **Cloudflare Tunnel** - Remote access
- **React** (inline in HTML) - Frontend UI (`detlogv3.html`)

**Key Dependencies:** express, dotenv, express-session, @anthropic-ai/claude-agent-sdk, @langchain/langgraph

## Common Development Tasks

### Starting the Server

```bash
cd reports
npm install  # First time only
npm start
```

Server runs at `http://localhost:3001`

### Starting with Remote Access (Cloudflare Tunnel)

```bash
# Windows - double-click:
start-everything.bat

# Or manually in two terminals:
npm start                           # Terminal 1
cloudflared tunnel run aln-console  # Terminal 2
```

Remote access at: `https://console.aboutlastnightgame.com`

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your values:
# NOTION_TOKEN=ntn_...
# ACCESS_PASSWORD=your-password
# SESSION_SECRET=random-32-char-string
```

Generate session secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Verifying Claude Agent SDK

The server performs a health check at startup. If it fails:
1. Ensure Claude Code is authenticated: `claude /login`
2. Check network connectivity
3. Run `npm install` to ensure SDK is installed

## Architecture

### Core Components

```
server.js           - Express server, LangGraph workflow orchestration
lib/sdk-client.js   - Claude Agent SDK wrapper
lib/workflow/       - LangGraph nodes and state management
detlogv3.html       - React frontend (single-page app)
.env                - Environment variables (NOT in git)
```

### API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | No | Password authentication |
| `/api/auth/check` | GET | No | Session status |
| `/api/auth/logout` | POST | No | End session |
| `/api/generate` | POST | Yes | LangGraph workflow orchestration |
| `/api/config` | GET | Yes | Serve Notion token |
| `/api/health` | GET | No | Server status |

### LangGraph Workflow Architecture

The report generation uses a multi-phase LangGraph workflow with human-in-the-loop checkpoints:

**Phases:**
1. **Fetch** - Load director notes, memory tokens, paper evidence, session photos
2. **Curate** - Build evidence bundle with three-layer model
3. **Analyze** - Generate narrative arcs from player focus (parallel specialists)
4. **Outline** - Create article structure from selected arcs
5. **Generate** - Write final HTML report
6. **Validate** - Check article against quality requirements

**Checkpoints (Human Approval):**
- Evidence bundle approval
- Arc selection (user picks which arcs to include)
- Outline approval

**Key Files:**
```
lib/workflow/
├── state.js              - State annotations, phases, approval types
├── graph.js              - LangGraph StateGraph definition
├── generation-supervisor.js - Parallel arc generation
└── nodes/
    ├── fetch-nodes.js    - Data loading from Notion/filesystem
    ├── ai-nodes.js       - Claude SDK calls for content generation
    ├── arc-specialist-nodes.js - Parallel arc analysis
    └── evaluator-nodes.js - Quality validation
```

### Claude Agent SDK Integration

All AI operations use the Claude Agent SDK via `lib/sdk-client.js`:

```javascript
const { query } = require('@anthropic-ai/claude-agent-sdk');

async function sdkQuery({ prompt, systemPrompt, model, jsonSchema }) {
  for await (const msg of query({ prompt, options })) {
    if (msg.type === 'result' && msg.subtype === 'success') {
      return jsonSchema ? msg.structured_output : msg.result;
    }
  }
}
```

**Features:**
- Direct SDK calls (no subprocess spawning)
- Native structured output (no JSON extraction)
- Built-in retry and error handling
- Uses Claude Code authentication

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Backend - Express server, LangGraph orchestration |
| `lib/sdk-client.js` | Claude Agent SDK wrapper |
| `lib/workflow/graph.js` | LangGraph StateGraph definition |
| `lib/workflow/nodes/` | Node implementations for each phase |
| `detlogv3.html` | Frontend - React UI |
| `.env` | Secrets (NOTION_TOKEN, ACCESS_PASSWORD, SESSION_SECRET) |
| `start-everything.bat` | Launch server + tunnel together |

## Troubleshooting

### "Claude Agent SDK not available"
```bash
claude /login     # Ensure Claude Code is authenticated
npm install       # Reinstall dependencies
```

### Port 3001 in use
Edit `server.js` line 22: `const PORT = 3002;`

### Token not loading
```bash
curl http://localhost:3001/api/config  # Should return Notion token
# Check .env has NOTION_TOKEN set
# Restart server after .env changes
```

### Workflow errors
Check server console for phase-specific error messages. Common issues:
- Missing session data files in `data/{sessionId}/inputs/`
- Notion API connectivity (verify NOTION_TOKEN)
- SDK authentication (run `claude /login`)

## Emailer Subdirectory

The `emailer/` directory contains a Python-based follow-up email system:

```bash
# Send follow-up emails to attendees
python emailer/send_followup_emails_smart.py --date MMDD --test
python emailer/send_followup_emails_smart.py --date 1218 --send  # Actually send
```

**Key files:**
- `send_followup_emails_smart.py` - Email sender script (requires Gmail app password)
- `about_last_night_followup_template.html` - HTML email template
- `recipients_MMDD_MMDD.csv` - Recipient lists per show date

See `emailer/SETUP_GUIDE.md` for Gmail configuration.

## Related Documentation

- `README.md` - Full setup and usage guide
- `QUICK_START.md` - Daily workflow
- `AUTH_SETUP.md` - Authentication details
- `CONCURRENT_BATCHING.md` - Technical architecture deep-dive
- `ENV_SETUP.md` - Environment variable configuration
- `SETUP_CHECKLIST_CLOUDFLARE.md` - Tunnel setup
