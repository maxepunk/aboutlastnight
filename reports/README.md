# ALN Director Console - Claude Edition

AI-powered case report generator for "About Last Night" using **Claude Code CLI** (Console MAX).

## What This Does

Generates detective-style case reports by:
1. Fetching inventory items from Notion database
2. Using Claude Haiku 4.5 to analyze and summarize items (concurrent batching for speed)
3. Using Claude Sonnet/Opus to write final narrative reports
4. Exports styled HTML case files

## Current Status

✅ **Production Ready** - Authentication enabled, concurrent processing, Cloudflare tunnel configured
- Public URL: `https://console.aboutlastnightgame.com`
- Password protected (7-day sessions)
- Processes 150+ items in ~3 minutes
- Auto-loads configuration from environment variables

## Requirements

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Claude Code CLI** installed and authenticated
  - Test by running: `claude --version`
  - If not installed, follow [Claude Code setup guide](https://code.claude.com/docs/en/setup.md)
- **Cloudflared** (for remote access) - Already configured for this project
- **Notion Integration Token** (stored in .env)

## First-Time Setup

### 1. Install Dependencies

```bash
cd reports
npm install
```

This installs 3 dependencies:
- `express` - Web server
- `dotenv` - Environment variable management
- `express-session` - Authentication sessions

### 2. Configure Environment Variables

Copy the example file:
```bash
cp .env.example .env
```

Edit `.env` and add your values:
```bash
NOTION_TOKEN=ntn_...your-token-here...
ACCESS_PASSWORD=@LN-c0nn3ct
SESSION_SECRET=...generate-random-string...
```

**Generate a session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**IMPORTANT:** The `.env` file is git-ignored and contains secrets. Never commit it.

### 3. Verify Claude CLI

Make sure Claude CLI is working:

```bash
claude -p "Hello, what's your name?" --model haiku
```

If this fails, you need to authenticate Claude Code first:
```bash
claude /login
```

### 4. Start the Server

```bash
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════════════╗
║         ALN Director Console - Server Running            ║
║  Local Access:    http://localhost:3000                  ║
╚═══════════════════════════════════════════════════════════╝
```

### 5. Access the Console

**Locally:** Visit `http://localhost:3000`

**Remotely:** Visit `https://console.aboutlastnightgame.com` (requires tunnel running - see below)

**First-time login:**
1. Enter password: `@LN-c0nn3ct`
2. Click "Access Console"
3. Session lasts 7 days

## Daily Usage

### Option 1: Local Only (No Remote Access)

Just run:
```bash
cd reports
npm start
```

Visit: `http://localhost:3000`

### Option 2: With Remote Access (Cloudflare Tunnel)

**Easiest way** - Double-click:
```
reports/start-everything.bat
```

This opens 2 windows:
- **Window 1:** Server running on localhost:3000
- **Window 2:** Cloudflare Tunnel

Your console is now available at: `https://console.aboutlastnightgame.com`

**Manual way** - Run in 2 separate terminals:

Terminal 1:
```bash
cd reports
npm start
```

Terminal 2:
```bash
cloudflared tunnel run aln-console
```

**To stop:** Press Ctrl+C in both terminals (or close the windows)

## Using the Console

### Step 1: Login
- Enter password: `@LN-c0nn3ct`
- Click "Access Console"

### Step 2: Fetch & Analyze
- Notion token is pre-loaded from .env
- Click "Fetch & Deep Scan" to load and analyze all items
- **Wait time:** ~3 minutes for 150+ items
- Progress bar shows real-time status

### Step 3: Select Baseline
- Choose items that are always in the room (static props)

### Step 4: Select Session Items
- Choose items found during this specific game run
- Switch between Memory Tokens and Static items tabs

### Step 5: Add Context
- Fill in case metadata (case ID, location, status)
- Add detective voice samples for tone matching
- Add game logs and notes
- Select report model (Sonnet or Opus)
- Click "Generate Final Report"

### Step 6: Export
- Review the generated report
- Click "Edit Report" to make changes
- Copy text or download styled HTML

## Sharing with Teammates

### Current Setup (Production)

**URL:** `https://console.aboutlastnightgame.com`

**Requirements:**
1. Your computer must be running both:
   - Server: `npm start` in reports/
   - Tunnel: `cloudflared tunnel run aln-console`
2. Or just run: `start-everything.bat`

**To share access:**
1. Send URL: `https://console.aboutlastnightgame.com`
2. Send password (separately, via secure channel): `@LN-c0nn3ct`
3. Teammates can access from anywhere with internet

**Security notes:**
- Password protected (session-based auth)
- Uses YOUR Claude API quota
- Only share with trusted team members
- Sessions last 7 days, then require re-login

## Architecture

### Concurrent Batching System

**Performance:** 150 items analyzed in ~3 minutes

**How it works:**
- Items split into 8-item batches
- 4 batches processed concurrently
- Isolated working directories prevent conflicts
- Graceful error handling with automatic retry

**Example:** 150 items
- 150 ÷ 8 = 19 batches
- 19 ÷ 4 concurrent = 5 rounds
- 5 rounds × 40s per round = ~3 minutes

See `CONCURRENT_BATCHING.md` for technical details.

### Models Used

- **Analysis**: Claude Haiku 4.5 (fast, efficient for batch processing)
- **Reports**: User choice of:
  - Claude Sonnet 4.5 (balanced quality/speed)
  - Claude Opus 4 (highest quality, slower)

### Authentication

- **Session-based** (7-day cookies)
- **In-memory storage** (sessions lost on server restart)
- **Protected endpoints:** All API calls except auth endpoints
- **Logout:** Button in header

See `AUTH_SETUP.md` for details and security options.

## Troubleshooting

### "Incorrect password" or can't login

**Solution:**
1. Check `.env` file has correct `ACCESS_PASSWORD`
2. Restart server after changing .env
3. Try clearing browser cookies

### "Claude CLI not available"

**Problem:** Server can't find `claude` command.

**Solution:**
1. Verify Claude is in PATH: `claude --version`
2. If not found, reinstall Claude Code
3. Restart terminal after installation

### "Authentication failed" (Claude CLI)

**Problem:** Claude CLI not logged in.

**Solution:**
```bash
claude /login
```
Follow the browser authentication flow.

### "Timeout" or "524 error" during analysis

**Problem:** This should no longer happen with concurrent batching.

**If it does:**
1. Check server logs for specific errors
2. Reduce batch size in server.js line 304 (change `MAX_BATCH_SIZE = 10` to `8`)
3. Reduce concurrency in detlogv3.html line 1268 (change `CONCURRENCY = 4` to `3`)

### Port 3000 already in use

**Problem:** Another app is using port 3000.

**Solution:**
Edit `server.js` line 16:
```javascript
const PORT = 3001;  // Or any other port
```

Then visit `http://localhost:3001`

### Cloudflare tunnel not connecting

**Problem:** Tunnel shows "failed to connect to origin"

**Solution:**
1. Make sure server is running first: `npm start`
2. Check it responds: `curl http://localhost:3000`
3. Then start tunnel: `cloudflared tunnel run aln-console`

**Problem:** "tunnel not found"

**Solution:**
```bash
cloudflared tunnel list
```
Should show `aln-console`. If not, see `SETUP_CHECKLIST_CLOUDFLARE.md`.

### Notion token not loading

**Problem:** Token field is empty on page load.

**Solution:**
1. Check `.env` file has `NOTION_TOKEN=ntn_...`
2. Restart server
3. Check `/api/config` endpoint: `curl http://localhost:3000/api/config`

## File Structure

```
reports/
├── server.js                        # Backend (Claude CLI wrapper, API endpoints)
├── detlogv3.html                    # Frontend (React UI)
├── package.json                     # Dependencies
├── .env                             # Environment variables (NOT in git)
├── .env.example                     # Template for .env
├── start-everything.bat             # Windows startup script
├── start-tunnel.bat                 # Tunnel-only startup script
├── cloudflared-config-template.yml  # Reference for Cloudflare config
│
├── README.md                        # This file
├── QUICK_START.md                   # Daily workflow guide
├── AUTH_SETUP.md                    # Authentication documentation
├── ENV_SETUP.md                     # Environment variables guide
├── CONCURRENT_BATCHING.md           # Technical architecture details
├── SETUP_CHECKLIST_CLOUDFLARE.md    # Cloudflare tunnel setup
│
└── archive/                         # Old documentation
    ├── REMOTE_ACCESS_*.md
    └── PROMPT_UPDATE_NOTES.md
```

## Development Notes

### stdin vs Command-Line Arguments

**Important:** The server passes prompts to Claude CLI via **stdin** (standard input), not command-line arguments.

```javascript
// ✅ Current implementation (stdin)
const claude = spawn('claude', ['-p', '--model', 'haiku']);
claude.stdin.write(prompt);

// ❌ Old approach (fails with large prompts)
exec(`claude -p "${prompt}"`)  // Windows CLI length limit: ~8191 chars
```

**Why stdin?**
- Windows command line has hard length limits (~8KB)
- Inventory items with long descriptions exceed this limit
- stdin has no such limitation (can handle MB of data)
- Industry standard for passing large data to CLI tools

### Isolated Working Directories

Each Claude CLI call runs in its own temporary directory to prevent concurrent processes from conflicting over `.claude.json` files.

```javascript
const workDir = path.join(os.tmpdir(), `claude-batch-${Date.now()}-${Math.random().toString(36).substring(7)}`);
```

### Adding New Models

Edit `detlogv3.html` model definitions (search for `MODELS`).

### Security Improvements

**Current setup:** Suitable for small trusted team

**For higher security:**
- Enable HTTPS-only cookies (server.js line 29: `secure: true`)
- Add bcrypt password hashing (see AUTH_SETUP.md)
- Add rate limiting (see AUTH_SETUP.md)
- Use Cloudflare Access for SSO

### Adjusting Performance

**Batch size** (server.js line 307):
```javascript
const MAX_BATCH_SIZE = 10;  // Smaller = safer, slower
```

**Concurrency** (detlogv3.html line 1268):
```javascript
const CONCURRENCY = 4;  // Higher = faster, more load
```

**Timeouts** (server.js lines 104-106):
```javascript
const timeoutMs = model === 'opus' ? 600000 :      // 10 minutes
                 model === 'sonnet' ? 300000 :     // 5 minutes
                 120000;                            // 2 minutes (haiku)
```

## Credits

Built for "About Last Night" by Off the Couch Games.
Powered by Claude (Anthropic) via Claude Code CLI.
