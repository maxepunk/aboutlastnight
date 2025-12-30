# Cloudflare Tunnel - Current Configuration

**Status:** ✅ ALREADY CONFIGURED AND WORKING

**Public URL:** `https://console.aboutlastnightgame.com`
**Tunnel Name:** `aln-console`
**Tunnel ID:** `f1105ac0-fc4f-4262-827c-e17b4a829fdc`

---

## Daily Usage (For You)

You DON'T need to set up anything - just run the console:

### Option 1: Automatic (Easiest)

**Double-click:** `start-everything.bat`

This opens 2 windows:
- Window 1: Server (localhost:3001)
- Window 2: Cloudflare Tunnel

Done! Your console is live at `https://console.aboutlastnightgame.com`

### Option 2: Manual (Two Terminals)

**Terminal 1:**
```bash
cd reports
npm start
```

**Terminal 2:**
```bash
cloudflared tunnel run aln-console
```

---

## Sharing with Teammates

**What to share:**
1. URL: `https://console.aboutlastnightgame.com`
2. Password (via secure channel): `@LN-c0nn3ct`

**What they need to do:**
1. Visit the URL
2. Enter password
3. Start using the console

**What you need to do:**
- Keep both server and tunnel running on your computer
- That's it!

---

## Current Configuration

**Config file location:** `C:\Users\spide\.cloudflared\config.yml`

**Contents:**
```yaml
tunnel: f1105ac0-fc4f-4262-827c-e17b4a829fdc
credentials-file: C:\Users\spide\.cloudflared\f1105ac0-fc4f-4262-827c-e17b4a829fdc.json

ingress:
  - hostname: console.aboutlastnightgame.com
    service: http://localhost:3001
  - service: http_status:404
```

**DNS Configuration:**
- Subdomain: `console.aboutlastnightgame.com`
- Type: CNAME
- Target: `f1105ac0-fc4f-4262-827c-e17b4a829fdc.cfargotunnel.com`

---

## Troubleshooting

### "502 Bad Gateway"

**Problem:** Tunnel is running but server is not

**Solution:**
1. Check Terminal 1 - is `npm start` still running?
2. Test locally: `http://localhost:3001`
3. Restart server if needed

---

### "Can't reach this page" or "ERR_NAME_NOT_RESOLVED"

**Problem:** Tunnel not running

**Solution:**
1. Start tunnel: `cloudflared tunnel run aln-console`
2. Check tunnel status: `cloudflared tunnel info aln-console`

---

### "tunnel not found" error

**Problem:** Cloudflared can't find the tunnel config

**Solution:**
```bash
# Check if tunnel exists
cloudflared tunnel list

# Should show:
# ID: f1105ac0-fc4f-4262-827c-e17b4a829fdc
# NAME: aln-console
```

If it doesn't show up, check config file exists:
```bash
cat C:\Users\spide\.cloudflared\config.yml
```

---

### Need to verify everything is working

**Test checklist:**
```bash
# 1. Check server responds locally
curl http://localhost:3001

# 2. Check tunnel is configured
cloudflared tunnel list

# 3. Check tunnel info
cloudflared tunnel info aln-console

# 4. Check DNS
nslookup console.aboutlastnightgame.com
```

---

## Commands Reference

```bash
# List all your tunnels
cloudflared tunnel list

# Get tunnel details
cloudflared tunnel info aln-console

# Run tunnel (manual)
cloudflared tunnel run aln-console

# Check cloudflared version
cloudflared --version

# View config file
cat C:\Users\spide\.cloudflared\config.yml
```

---

## If You Need to Set Up From Scratch (New Computer)

**This is ONLY if you're setting up on a different computer. Current machine is already configured.**

<details>
<summary>Click to expand full setup instructions</summary>

### Step 1: Install cloudflared

```bash
winget install cloudflare.cloudflared
```

Restart terminal after installation.

### Step 2: Authenticate

```bash
cloudflared tunnel login
```

Browser opens → Log into Cloudflare → Select `aboutlastnightgame.com` → Authorize

### Step 3: Create Tunnel

```bash
cloudflared tunnel create aln-console
```

Save the tunnel ID that appears.

### Step 4: Route DNS

```bash
cloudflared tunnel route dns aln-console console.aboutlastnightgame.com
```

### Step 5: Create Config File

Create `C:\Users\YourUsername\.cloudflared\config.yml`:

```yaml
tunnel: YOUR-TUNNEL-ID-HERE
credentials-file: C:\Users\YourUsername\.cloudflared\YOUR-TUNNEL-ID-HERE.json

ingress:
  - hostname: console.aboutlastnightgame.com
    service: http://localhost:3001
  - service: http_status:404
```

### Step 6: Test

```bash
# Terminal 1
cd reports
npm start

# Terminal 2
cloudflared tunnel run aln-console
```

Visit: `https://console.aboutlastnightgame.com`

</details>

---

## Security Notes

**Current setup:**
- Password protected (7-day sessions)
- Tunnel uses Cloudflare's encrypted connections (HTTPS)
- Only you can run the tunnel (requires your machine + credentials)

**Best practices:**
- Keep tunnel credentials secure (`C:\Users\spide\.cloudflared\*.json`)
- Only share password with trusted teammates
- Change password periodically (see AUTH_SETUP.md)
- Monitor server logs for unusual activity

---

## Auto-Start on Boot (Optional)

Want the tunnel to start automatically when your computer boots?

**Windows:**
1. Press Win+R → type `shell:startup` → Enter
2. Create shortcut to `start-everything.bat`
3. Tunnel + server will start on login

**Or use Windows Service:**
```bash
cloudflared service install
```

See [Cloudflare documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/run-tunnel/as-a-service/) for details.

---

## Current Status Summary

✅ Cloudflared installed
✅ Authenticated with Cloudflare
✅ Tunnel created: `aln-console`
✅ DNS configured: `console.aboutlastnightgame.com`
✅ Config file created
✅ Startup scripts ready (`start-everything.bat`)

**You're ready to go! Just run `start-everything.bat` whenever you want to share access.**
