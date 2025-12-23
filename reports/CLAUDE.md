# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ALN Director Console** - AI-powered case report generator for "About Last Night" using Claude Code CLI (Console MAX).

Generates detective-style case reports by:
1. Fetching inventory items from Notion database
2. Using Claude Haiku to analyze and summarize items (concurrent batching)
3. Using Claude Sonnet/Opus to write final narrative reports
4. Exporting styled HTML case files

**Production URL:** `https://console.aboutlastnightgame.com` (via Cloudflare Tunnel)

## Technology Stack

- **Node.js/Express** - Backend server (`server.js`)
- **Claude Code CLI** - AI operations via `claude` command
- **Notion API** - Inventory database
- **Cloudflare Tunnel** - Remote access
- **React** (inline in HTML) - Frontend UI (`detlogv3.html`)

**Dependencies:** express, dotenv, express-session (only 3 packages)

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

### Verifying Claude CLI

```bash
claude -p "Hello" --model haiku
# If fails, run: claude /login
```

## Architecture

### Core Components

```
server.js         - Express server, Claude CLI wrapper, API endpoints
detlogv3.html     - React frontend (single-page app)
.env              - Environment variables (NOT in git)
```

### API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | No | Password authentication |
| `/api/auth/check` | GET | No | Session status |
| `/api/auth/logout` | POST | No | End session |
| `/api/analyze` | POST | Yes | Batch item analysis (Haiku) |
| `/api/generate` | POST | Yes | Report generation (Sonnet/Opus) |
| `/api/config` | GET | Yes | Serve Notion token |
| `/api/health` | GET | No | Server status |

### Concurrent Batching Architecture

**Problem Solved:** Cloudflare 100-second timeout on large-scale analysis

**Solution:**
- 150+ items split into 8-item batches
- 4 batches processed concurrently
- Isolated temp directories prevent `.claude.json` conflicts
- Total time: ~3 minutes (vs 12+ minutes sequential)

**Key Parameters:**
```javascript
// server.js line 351
const MAX_BATCH_SIZE = 10;

// detlogv3.html lines 1361-1362
const BATCH_SIZE = 8;
const CONCURRENCY = 4;
```

### Claude CLI Integration

**Critical:** Prompts sent via stdin (not command-line args) to avoid Windows CLI length limits (~8KB).

```javascript
// server.js callClaude()
const claude = spawn('claude', args, { cwd: workDir });
claude.stdin.write(prompt);
claude.stdin.end();
```

**Model-specific timeouts:**
- Opus: 10 minutes
- Sonnet: 5 minutes
- Haiku: 2 minutes

## Key Files

| File | Purpose |
|------|---------|
| `server.js` | Backend - Claude CLI wrapper, all API endpoints |
| `detlogv3.html` | Frontend - React UI, batch orchestration |
| `.env` | Secrets (NOTION_TOKEN, ACCESS_PASSWORD, SESSION_SECRET) |
| `start-everything.bat` | Launch server + tunnel together |

## Troubleshooting

### "Claude CLI not available"
```bash
claude --version  # Verify installation
claude /login     # Re-authenticate if needed
```

### Port 3001 in use
Edit `server.js` line 16: `const PORT = 3002;`

### Timeout during analysis
1. Reduce batch size: `BATCH_SIZE = 5` in detlogv3.html
2. Reduce concurrency: `CONCURRENCY = 3` in detlogv3.html

### Token not loading
```bash
curl http://localhost:3001/api/config  # Should return Notion token
# Check .env has NOTION_TOKEN set
# Restart server after .env changes
```

## Performance Tuning

| Parameter | Location | Current | Effect |
|-----------|----------|---------|--------|
| Batch size | detlogv3.html:1361 | 8 | Items per API call |
| Concurrency | detlogv3.html:1362 | 4 | Parallel batches |
| Server batch limit | server.js:351 | 10 | Max items/request |

**Trade-offs:**
- Larger batch = faster total time, higher timeout risk
- More concurrency = faster total time, higher server load

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
