# Environment Variables Setup

## What Changed

Your Notion integration token is now stored in a local `.env` file instead of being manually entered in the browser each time.

### Files Modified

1. **`package.json`** - Added `dotenv` dependency
2. **`server.js`** - Added `/api/config` endpoint reporting whether Notion is configured (token stays server-side, never sent to the client)
3. **`detlogv3.html`** - Legacy standalone debug page; reads `/api/config` but uses its own browser-side token (manual entry / `localStorage`) for direct Notion calls — see "Token Exposure" below

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
2. Server uses the token for all Notion calls; the token never leaves the server
3. Frontend checks `/api/config` only for whether Notion is configured (`{ notionConfigured: boolean }`)
4. No token entry needed in the browser

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
NOTION_TOKEN=ntn_YOUR_NOTION_TOKEN_HERE
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
2. Open browser: `http://localhost:3001`
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

**Current risk level: Low**

- In the **console SPA**, the token NEVER leaves the server — all pipeline Notion access is server-side (`lib/notion-client.js`)
- `/api/config` (auth-protected) returns only `{ notionConfigured: boolean }`, not the token (SEC-3)
- A console client therefore cannot read `NOTION_TOKEN`, even when authenticated
- **Legacy exception:** the standalone debug pages `detlogv2.html` / `detlogv3.html` (served statically from the repo root) use a separate browser-side token model — the operator pastes a token held in `localStorage` and sent directly from the browser to Notion. They are NOT the production console and no longer receive a token from `/api/config`; retire them if the browser-side-token path is unwanted.

**The current handler returns only a non-secret boolean:**

```javascript
// In server.js — /api/config returns no secrets
app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        notionConfigured: Boolean(process.env.NOTION_TOKEN)
    });
});
```

---

## Troubleshooting

### "Token field is empty on load"

**Problem:** Frontend not reaching the backend config endpoint

**Check:**
1. Server is running: `http://localhost:3001/api/config`
   - Should return: `{"notionConfigured":true}`
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

# Check config endpoint works (returns {"notionConfigured":true})
curl http://localhost:3001/api/config

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
