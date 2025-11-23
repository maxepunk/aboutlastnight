# ALN Director Console - Claude Edition

AI-powered case report generator for "About Last Night" using **Claude Code CLI** (Console MAX).

## What This Does

Generates detective-style case reports by:
1. Fetching inventory items from Notion database
2. Using Claude Haiku 4.5 to analyze and summarize items
3. Using Claude Sonnet/Opus to write final narrative reports
4. Exports styled HTML case files

## Requirements

- **Node.js** (v16 or higher) - [Download here](https://nodejs.org/)
- **Claude Code CLI** installed and authenticated
  - Test by running: `claude --version`
  - If not installed, follow [Claude Code setup guide](https://code.claude.com/docs/en/setup.md)
- **Notion Integration Token** (optional, if using Notion database)

## First-Time Setup

### 1. Install Dependencies

```bash
cd reports
npm install
```

This installs just one dependency: `express` (the web server).

### 2. Verify Claude CLI

Make sure Claude CLI is working:

```bash
claude -p "Hello, what's your name?" --model claude-haiku-4-5
```

If this fails, you need to authenticate Claude Code first:
```bash
claude /login
```

### 3. Start the Server

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

### 4. Open in Browser

Visit: **http://localhost:3000**

## Usage

### Step 1: Configure
- Enter Notion token (if using Notion database)
- Choose report model: Sonnet 4.5 (balanced) or Opus 4 (highest quality)
- Click "Fetch & Deep Scan" to load and analyze items

### Step 2: Select Baseline
- Choose items that are always in the room (static props)

### Step 3: Select Session Items
- Choose items found during this specific game run
- Switch between Memory Tokens and Static items tabs

### Step 4: Add Context
- Fill in case metadata (case ID, location, status)
- Add detective voice samples for tone matching
- Add game logs and notes
- Click "Generate Final Report"

### Step 5: Export
- Review the generated report
- Copy text or download styled HTML

## Sharing with Teammates

Your teammates can access the tool while your server is running. Choose one method:

### Option A: Local Network (Same Building/WiFi)

1. Find your local IP address:
   - **Windows**: `ipconfig` (look for "IPv4 Address")
   - **Mac**: `ifconfig` (look for "inet" under en0)

2. Share the URL with teammates:
   ```
   http://192.168.1.XXX:3000
   ```
   (Replace XXX with your IP)

3. They open that URL in their browser - that's it!

### Option B: CloudFlare Tunnel (Free, Internet Access)

For remote teammates or external access:

**Quick Start (Temporary URL):**

1. Install cloudflared (one-time):
   ```bash
   # Windows
   winget install cloudflare.cloudflared

   # Mac
   brew install cloudflared
   ```

2. Start the tunnel (in a new terminal):
   ```bash
   cloudflared tunnel --url localhost:3000
   ```

3. You'll get a public URL like:
   ```
   https://random-name.trycloudflare.com
   ```

4. Share that URL - works from anywhere!

**Note:** URL changes each time you restart. Your server must stay running.

**📚 Detailed Guides:**
- **[Quick Tunnel Setup Guide](REMOTE_ACCESS_QUICK_TUNNEL.md)** - Full walkthrough with troubleshooting (5 min setup)
- **[Configured Tunnel Guide](REMOTE_ACCESS_CONFIGURED_TUNNEL.md)** - Persistent URL, auto-start, access control (15 min setup)

### Option C: ngrok (Traffic Inspection + Auth)

For development with built-in traffic debugging:

**Quick Start:**

1. Sign up at [ngrok.com](https://ngrok.com) (free tier available)
2. Install and authenticate ngrok
3. Run:
   ```bash
   ngrok http 3000
   ```
4. Get your URL (free tier = temporary, $8/month = persistent)

**Bonus:** Traffic inspector at `http://localhost:4040` shows all requests/responses!

**📚 Detailed Guide:**
- **[ngrok Setup Guide](REMOTE_ACCESS_NGROK.md)** - Traffic inspection, authentication, free vs paid tiers (5 min setup)

## Models Used

- **Analysis**: Claude Haiku 4.5 (fast, efficient for batch processing)
- **Reports**: User choice of:
  - Claude Sonnet 4.5 (balanced quality/speed)
  - Claude Opus 4 (highest quality, slower)

## Troubleshooting

### "Claude CLI not available"

**Problem**: Server can't find `claude` command.

**Solution**:
1. Verify Claude is in PATH: `claude --version`
2. If not found, reinstall Claude Code
3. Restart terminal after installation

### "Authentication failed"

**Problem**: Claude CLI not logged in.

**Solution**:
```bash
claude /login
```
Follow the browser authentication flow.

### "Analysis failed"

**Problem**: Prompt too large or model timeout.

**Solution**:
- Reduce batch size in server.js (line 547: change `BATCH_SIZE = 15` to lower number)
- Try "Only Fetch Data" button to skip analysis

### Port 3000 already in use

**Problem**: Another app is using port 3000.

**Solution**:
Edit `server.js` line 11:
```javascript
const PORT = 3001;  // Or any other port
```

Then visit `http://localhost:3001`

## File Structure

```
reports/
├── server.js          # Backend (Claude CLI wrapper)
├── detlogv3.html      # Frontend (React UI)
├── package.json       # Dependencies
├── README.md          # This file
└── node_modules/      # (created by npm install)
```

## Architecture Notes

### stdin vs Command-Line Arguments

**Important:** The server passes prompts to Claude CLI via **stdin** (standard input), not command-line arguments.

```javascript
// ✅ Current implementation (stdin)
spawn('claude', ['-p', '--model', 'haiku'])
  .stdin.write(prompt)

// ❌ Old approach (fails with large prompts)
exec(`claude -p "${prompt}"`)  // Windows CLI length limit: ~8191 chars
```

**Why stdin?**
- Windows command line has hard length limits (~8KB)
- Inventory items with long descriptions exceed this limit
- stdin has no such limitation (can handle MB of data)
- Industry standard for passing large data to CLI tools

If you encounter issues, verify Claude CLI supports stdin:
```bash
echo "Hello Claude" | claude -p --model claude-haiku-4-5
```

## Development Notes

### Adding New Models

Edit `detlogv3.html` line 108:
```javascript
const MODELS = [
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5 (Fast)', type: 'haiku' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', type: 'report' },
    { id: 'claude-opus-4', name: 'Claude Opus 4', type: 'report' }
];
```

### Adjusting Timeouts

If reports are timing out, edit `server.js` line 37:
```javascript
timeout: 180000  // 3 minutes instead of 2
```

### Security Note

This tool runs on your local machine and uses YOUR Claude Console MAX credentials. Teammates access your server, which makes API calls on their behalf using your account.

**Do not expose this server to the public internet without additional authentication.**

## Credits

Built for "About Last Night" by Off the Couch Games.
Powered by Claude (Anthropic) via Claude Code CLI.
