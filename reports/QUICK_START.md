# Quick Start Guide

## 🔒 Authentication Required

The console is password-protected.

**Access Code:** `@LN-c0nn3ct`

See `AUTH_SETUP.md` for full authentication documentation.

---

## For Daily Use (After Initial Setup)

### Option 1: Automatic (Easiest) ⭐

**Double-click:** `start-everything.bat`

This opens two windows:
- **Window 1:** Server running on localhost:3001
- **Window 2:** Cloudflare Tunnel

**Your URLs:**
- Local: `http://localhost:3001`
- Remote: `https://console.aboutlastnightgame.com`

**To stop:** Close both windows or press Ctrl+C in each

---

### Option 2: Manual (Two Terminals)

**Terminal 1 - Start Server:**
```bash
cd C:\Users\spide\Documents\claudecode\aboutlastnight\reports
npm start
```

**Terminal 2 - Start Tunnel:**
```bash
cloudflared tunnel run aln-console
```

**Or use the script for just the tunnel:**
```bash
cd C:\Users\spide\Documents\claudecode\aboutlastnight\reports
start-tunnel.bat
```

---

### Option 3: Local Only (No Remote Access)

If you don't need remote access:

```bash
cd C:\Users\spide\Documents\claudecode\aboutlastnight\reports
npm start
```

Visit: `http://localhost:3001`

---

## Using the Console

### Step 1: Login

1. Visit `https://console.aboutlastnightgame.com` (or `http://localhost:3001`)
2. Enter password: `@LN-c0nn3ct`
3. Click "Access Console"

**Session lasts 7 days** - won't need to re-enter password until then

### Step 2: Fetch & Analyze

1. Notion token is already loaded from .env
2. Click **"Fetch & Deep Scan"**
3. Wait ~3 minutes for 150+ items to analyze
4. Progress bar shows real-time status

**What happens:**
- Fetches all items from Notion database
- Analyzes items using Claude Haiku (8-item batches, 4 concurrent)
- Displays console logs: 📊 ✅ ❌ 🔄 🎉

### Step 3-6: Generate Report

(Same as before - see README.md for full workflow)

---

## Sharing with Teammates

### Send URL
```
https://console.aboutlastnightgame.com
```

### Send Password (Separately, via secure channel)
```
@LN-c0nn3ct
```

**First time they visit:**
1. Enter password
2. Click "Access Console"
3. Console loads and works normally

**After first login:**
- Session lasts 7 days
- They won't need to re-enter password
- Can logout using button in header

**They can access from:**
- ✅ Any laptop/desktop
- ✅ Any phone/tablet
- ✅ Anywhere with internet

**Important:**
- Your computer must stay on
- Both server and tunnel must be running
- If you close the terminals → They lose access

---

## Troubleshooting

### "Console not loading" for teammate

**Check:**
1. Both terminals still running?
2. Test yourself: `https://console.aboutlastnightgame.com`
3. Restart both if needed: Double-click `start-everything.bat`

---

### "502 Bad Gateway"

**Problem:** Tunnel is running but server stopped

**Fix:**
1. Check Terminal 1 (server)
2. Restart: `npm start`

---

### Server running but tunnel won't start

**Problem:** Config file issue

**Fix:**
1. Check config file exists: `C:\Users\spide\.cloudflared\config.yml`
2. Verify tunnel name: `cloudflared tunnel list`
3. Should show `aln-console`
4. If not, see `SETUP_CHECKLIST_CLOUDFLARE.md`

---

### "Incorrect password" error

**Problem:** Password doesn't match what's in .env

**Fix:**
1. Check `.env` file:
   ```bash
   type C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.env
   ```
2. Look for `ACCESS_PASSWORD=` line
3. Verify you're typing correct password
4. Restart server after changing .env

---

### Logged in but endpoints return 401 Unauthorized

**Problem:** Session lost or server restarted

**Fix:**
1. Click "Logout" button in header
2. Log in again
3. Should work now

**Why:** Server restarts clear in-memory sessions

---

### Session expires too quickly

**Current:** 7 days

**To extend:** Edit `server.js` line 30:
```javascript
maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days instead of 7
```

Restart server.

---

### "Connection error" when logging in

**Problem:** Server not running or wrong URL

**Check:**
1. Server terminal - is it running?
2. Try localhost first: `http://localhost:3001`
3. If localhost works, tunnel might be down

**Solution:**
- Restart server: `npm start`
- Restart tunnel: `cloudflared tunnel run aln-console`

---

## Commands Reference

```bash
# Start everything (automatic)
start-everything.bat

# Start server only
npm start

# Start tunnel only
cloudflared tunnel run aln-console
# OR
start-tunnel.bat

# Check tunnel status
cloudflared tunnel list
cloudflared tunnel info aln-console

# Check if server responds
curl http://localhost:3001

# Check auth endpoint
curl http://localhost:3001/api/auth/check

# View .env contents
type .env

# Edit .env
notepad .env
```

---

## File Locations

**Server files:**
```
C:\Users\spide\Documents\claudecode\aboutlastnight\reports\
├── server.js         - Express server
├── detlogv3.html     - Frontend (legacy, pending refactor)
├── .env              - Your secrets (NOT in git)
└── start-*.bat       - Startup scripts
```

**Cloudflare config:**
```
C:\Users\spide\.cloudflared\
├── config.yml        - Tunnel configuration
└── f1105ac0-fc4f-4262-827c-e17b4a829fdc.json  - Credentials
```

---

## Security Best Practices

### DO ✅

- Change default password immediately (first time setup)
- Use strong passwords (mix of letters, numbers, symbols)
- Share password via secure channel (Signal, encrypted chat)
- Log out on shared devices
- Restart server periodically (clears old sessions)
- Monitor server logs for failed login attempts

### DON'T ❌

- Share password publicly
- Use same password for multiple services
- Leave logged in on public computers
- Commit .env file to git (already protected)
- Share password in same message as URL

---

## Monitoring Access

### View Login Attempts (Server Logs)

**Successful login:**
```
[2024-11-23T10:30:45.000Z] Successful login from 192.168.1.100
```

**Failed login:**
```
[2024-11-23T10:31:12.000Z] Failed login attempt from 192.168.1.100
```

**Watch logs in real-time:**
Logs appear in the server terminal window as events happen.

**Check for suspicious activity:**
- Multiple failed attempts from same IP
- Login attempts from unknown IPs
- Unusual times (middle of night, etc.)

---

## What's Next?

**After it's working:**
- ✅ Bookmark `https://console.aboutlastnightgame.com`
- ✅ Test from different device
- ✅ Share URL + password with teammate

**Optional improvements:**
- Set tunnel to run as Windows service (auto-start on boot)
- Enable HTTPS-only cookies (requires always using tunnel, not localhost)
- Add rate limiting (prevent brute force attacks)
- See `AUTH_SETUP.md` for security upgrades

---

## Related Documentation

- **CLAUDE.md** - Complete project documentation (primary reference)
- **AUTH_SETUP.md** - Authentication details and security options
- **SETUP_CHECKLIST_CLOUDFLARE.md** - Cloudflare tunnel configuration
- **ENV_SETUP.md** - Environment variables guide

---

**Need help?** Check troubleshooting sections above or see the related documentation files.
