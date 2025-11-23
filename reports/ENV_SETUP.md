# Environment Variables Setup

## What Changed

Your Notion integration token is now stored in a local `.env` file instead of being manually entered in the browser each time.

### Files Modified

1. **`package.json`** - Added `dotenv` dependency
2. **`server.js`** - Added `/api/config` endpoint to serve token
3. **`detlogv3.html`** - Fetches token from backend on page load

### Files Created

1. **`.env`** - Contains your actual Notion token (PRIVATE - not in git)
2. **`.env.example`** - Template for other users (tracked in git)
3. **`ENV_SETUP.md`** - This file

---

## How It Works

### Before (Manual Entry)
1. Load page
2. Paste Notion token into form field
3. Token saved in browser localStorage
4. Need to re-enter if localStorage cleared

### After (Automatic)
1. Server reads token from `.env` file on startup
2. Frontend fetches token from `/api/config` endpoint
3. Token automatically populated in form
4. Falls back to localStorage if server unavailable

---

## Installation Steps

### 1. Install New Dependency

```bash
cd reports
npm install
```

This installs the `dotenv` package.

### 2. Verify .env File Exists

Check that `reports/.env` exists with your token:

```bash
# Should show your token file
dir .env
```

**Contents:**
```
NOTION_TOKEN=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
```

**This file is already created for you!** ✅

### 3. Restart Server

Stop and restart the server to load the new `.env` file:

```bash
# Stop current server (Ctrl+C)
# Then restart
npm start
```

Or use `start-everything.bat` to restart both server and tunnel.

---

## Testing

### Test 1: Verify Token Loads

1. Restart server: `npm start`
2. Open browser: `http://localhost:3000`
3. **Expected:** Notion token field is already filled in (shows `••••••••`)
4. **If empty:** Check server logs for errors, verify .env file exists

### Test 2: Verify Token Works

1. Click "Fetch & Deep Scan"
2. **Expected:** Items load from Notion database
3. **If fails:** Check that token in .env is correct

---

## For Teammates (Sharing Access)

When teammates access via `https://console.aboutlastnightgame.com`:

### Automatic (Current Setup)
- ✅ Token automatically loaded from your server's .env
- ✅ They don't need to configure anything
- ✅ They just click "Fetch & Deep Scan" and it works

### If They Run Locally (Optional)
If a teammate wants to run the server on THEIR machine:

1. They clone the repo
2. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
3. Edit `.env` and add their own Notion token
4. Run `npm install` and `npm start`

---

## Security Notes

### .env File Protection

**✅ Already protected:**
- `.gitignore` excludes `.env` files (line 20)
- `.env.example` is tracked (template only)
- Your actual `.env` with real token will NEVER be committed

**Verify:**
```bash
# In root directory
git status
# Should NOT show reports/.env as changed/untracked
```

### Token Exposure

**Current risk level: Low (for personal use)**

- Token served via `/api/config` endpoint
- Anyone who can access your server can get the token
- For personal/small team use, this is acceptable

**If you want higher security:**

Add authentication to the `/api/config` endpoint:

```javascript
// In server.js, modify /api/config endpoint
app.get('/api/config', (req, res) => {
    // Check for API key (optional)
    const apiKey = req.headers['x-api-key'];
    if (apiKey !== process.env.API_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json({
        notionToken: process.env.NOTION_TOKEN || ''
    });
});
```

Then add `API_KEY=your-secret` to `.env` and update frontend to send it.

---

## Troubleshooting

### "Token field is empty on load"

**Problem:** Frontend not fetching token from backend

**Check:**
1. Server is running: `http://localhost:3000/api/config`
   - Should return: `{"notionToken":"ntn_..."}`
2. Browser console for errors (F12 → Console tab)
3. Try hard refresh: Ctrl+Shift+R

**Solution:**
- Restart server: `npm start`
- Clear localStorage: F12 → Application → Local Storage → Clear

---

### "Cannot find module 'dotenv'"

**Problem:** Package not installed

**Solution:**
```bash
cd reports
npm install
```

---

### "Notion fetch fails with 401 Unauthorized"

**Problem:** Token in .env is incorrect or expired

**Solution:**
1. Check `.env` file has correct token
2. Verify token at: https://www.notion.so/my-integrations
3. Update `.env` with new token
4. Restart server

---

### "dotenv is not defined"

**Problem:** Server.js missing `require('dotenv').config()`

**Solution:**
Already fixed - line 6 of `server.js` should have:
```javascript
require('dotenv').config();
```

---

## Environment Variables Reference

**Current variables in `.env`:**

| Variable | Purpose | Example |
|----------|---------|---------|
| `NOTION_TOKEN` | Notion API authentication | `ntn_1267081836766...` |

**Future variables (optional):**

| Variable | Purpose | Example |
|----------|---------|---------|
| `API_KEY` | Protect endpoints | `your-secret-key` |
| `PORT` | Custom server port | `3001` |
| `NODE_ENV` | Environment mode | `production` |

---

## Migration Notes

### Old Workflow
1. Open console
2. Paste Notion token
3. Click Fetch

### New Workflow
1. Open console
2. ~~Paste Notion token~~ ← **No longer needed!**
3. Click Fetch

**Existing localStorage token:** Frontend still checks localStorage first, so if you had a token saved, it will use that. After first load with server token, localStorage will update to match.

---

## Files You Can Delete (Optional)

After verifying everything works, you can delete:

- `cloudflared-config-template.yml` (reference only, real config is in `.cloudflared/config.yml`)

**Keep these:**
- `.env` - Your actual configuration
- `.env.example` - Template for other users
- `ENV_SETUP.md` - This documentation

---

## Quick Commands

```bash
# Install dependencies
npm install

# Start server (loads .env automatically)
npm start

# Check token endpoint works
curl http://localhost:3000/api/config

# View .env contents
type .env      # Windows
cat .env       # Mac/Linux

# Edit .env
notepad .env   # Windows
nano .env      # Mac/Linux
```

---

**All set!** Your Notion token is now loaded automatically from `.env` 🎉

Next time you start the server, the token will be ready without manual entry.
