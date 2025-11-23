# Remote Access Setup Guide: Quick Tunnels

**For:** Accessing your Claude Code CLI server from multiple devices (laptop, desktop, etc.)
**Time to set up:** ~5 minutes
**Cost:** Free forever
**Best for:** Personal multi-device access, occasional sharing, testing

---

## What This Does

Cloudflare Quick Tunnels create a temporary public URL that routes to your local server. Anyone with the URL can access your server from anywhere on the internet.

**Example:**
- Your server runs locally: `http://localhost:3000`
- Tunnel creates: `https://randomly-generated-name.trycloudflare.com`
- Access from anywhere: laptop, desktop, phone, etc.

**Important:** The URL changes every time you restart the tunnel. This is normal for quick tunnels.

---

## Prerequisites

Before you begin, make sure you have:
- [ ] Node.js installed
- [ ] Your server working locally (`npm start` in reports/ directory)
- [ ] Ability to run terminal commands
- [ ] No firewall blocking your terminal from making outbound connections

---

## Step 1: Install cloudflared

Install Cloudflare's tunnel client (one-time setup):

### Windows

**Option A: Using winget (recommended)**
```bash
winget install cloudflare.cloudflared
```

**Option B: Manual download**
1. Download from: https://github.com/cloudflare/cloudflared/releases
2. Get `cloudflared-windows-amd64.exe`
3. Rename to `cloudflared.exe`
4. Move to a folder in your PATH (e.g., `C:\Windows\System32`)

### Mac

```bash
brew install cloudflared
```

### Linux (Ubuntu/Debian)

```bash
# Download the latest release
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb

# Install
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Verify Installation

After installing, verify it works:
```bash
cloudflared --version
```

You should see output like: `cloudflared version 2024.x.x`

---

## Step 2: Start Your Server

In your first terminal window:

```bash
cd reports
npm start
```

You should see:
```
╔═══════════════════════════════════════════════════════════╗
║         ALN Director Console - Server Running            ║
║  Local Access:    http://localhost:3000                  ║
╚═══════════════════════════════════════════════════════════╝
```

**Keep this terminal running.** Your server must stay on for remote access to work.

---

## Step 3: Start the Tunnel

**Open a second terminal window** and run:

```bash
cloudflared tunnel --url localhost:3000
```

You'll see output like this:

```
2024-11-22T10:30:45Z INF Thank you for trying Cloudflare Tunnel. Doing so, without a Cloudflare account, is a quick way to experiment and try it out. However, be aware that these account-less Tunnels have no uptime guarantee. If you intend to use Tunnels in production you should use a pre-created named tunnel by following: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps
2024-11-22T10:30:45Z INF Requesting new quick Tunnel on trycloudflare.com...
2024-11-22T10:30:46Z INF +--------------------------------------------------------------------------------------------+
2024-11-22T10:30:46Z INF |  Your quick Tunnel has been created! Visit it at (it may take some time to be reachable):  |
2024-11-22T10:30:46Z INF |  https://randomly-generated-words.trycloudflare.com                                        |
2024-11-22T10:30:46Z INF +--------------------------------------------------------------------------------------------+
```

**Copy the URL** (the `https://randomly-generated-words.trycloudflare.com` part)

**Keep this terminal running too.** If you close it, the tunnel stops.

---

## Step 4: Test Remote Access

### From Your Other Device

1. Open a browser on your laptop/desktop/phone
2. Paste the tunnel URL
3. You should see the ALN Director Console interface

### What You Can Do

Everything that works locally works remotely:
- ✅ Fetch Notion data
- ✅ Analyze items
- ✅ Generate reports
- ✅ Download HTML exports

**Note:** All API calls use YOUR Claude credentials from the server machine.

---

## Daily Workflow

Every time you want to use remote access:

1. **Terminal 1:** Start the server
   ```bash
   cd reports
   npm start
   ```

2. **Terminal 2:** Start the tunnel
   ```bash
   cloudflared tunnel --url localhost:3000
   ```

3. **Copy the URL** from Terminal 2 and use it on your other devices

4. **When done:** Press Ctrl+C in both terminals to stop

---

## Important Notes

### The URL Changes Each Time

This is normal for quick tunnels. Every time you run `cloudflared tunnel`, you get a new URL.

**Why?** Quick tunnels are designed for temporary, ad-hoc access. For persistent URLs, see `REMOTE_ACCESS_CONFIGURED_TUNNEL.md`.

### Your Server Must Stay Running

If you:
- Close Terminal 1 (server) → Remote access stops working
- Close Terminal 2 (tunnel) → Remote access stops working
- Restart your computer → You need to start both again

### Network Requirements

**Outbound connections only:** Cloudflare Tunnel makes an outbound connection to Cloudflare's network. You don't need to:
- Open firewall ports
- Configure port forwarding
- Have a static IP address
- Configure your router

**This works anywhere:** Coffee shop WiFi, corporate networks, mobile hotspot, etc.

---

## Security Considerations

### Current State: No Authentication

Your `server.js` has **no authentication**. Anyone with the tunnel URL can:
- Use your server
- Generate reports using YOUR Claude API quota
- Access any data you load

### Security Through Obscurity

The URL is randomly generated and effectively unguessable:
- Example: `https://randomly-generated-words.trycloudflare.com`
- Very hard to find by chance
- Changes every restart

**Good enough for:** Personal use, trusted teammates
**Not good for:** Public sharing, long-term production use

### Best Practices

1. **Don't share the URL publicly**
   - Don't post on social media
   - Don't commit to GitHub
   - Only share with people you trust

2. **Use incognito/private browsing on shared devices**
   - Prevents URLs staying in browser history

3. **Restart the tunnel when done**
   - Ctrl+C to stop → Old URL stops working
   - Next time you get a fresh URL

4. **Consider adding authentication**
   - See "Adding Basic Authentication" section below

### Adding Basic Authentication (Optional)

If you want password protection, you can add basic authentication to `server.js`.

**Edit server.js** and add this after line 10 (after `const PORT = 3000;`):

```javascript
// Simple API key authentication
const API_KEY = process.env.API_KEY || 'change-this-secret-key';

app.use((req, res, next) => {
  // Skip auth for static files
  if (req.path === '/' || req.path.endsWith('.html')) {
    return next();
  }

  // Check API key for API endpoints
  const providedKey = req.headers['x-api-key'];
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }

  next();
});
```

**Set the API key** before starting the server:

```bash
# Windows
set API_KEY=your-secret-key-here
npm start

# Mac/Linux
export API_KEY=your-secret-key-here
npm start
```

**In the frontend (detlogv3.html)**, add the key to API requests. This requires modifying the fetch calls to include:

```javascript
headers: {
  'Content-Type': 'application/json',
  'X-API-Key': 'your-secret-key-here'
}
```

**Note:** This protects the API but not the HTML page itself. For full protection, consider using Cloudflare Access with configured tunnels.

---

## Troubleshooting

### "cloudflared: command not found"

**Problem:** cloudflared not installed or not in PATH

**Solution:**
1. Verify installation: `where cloudflared` (Windows) or `which cloudflared` (Mac/Linux)
2. If not found, reinstall following Step 1
3. Restart terminal after installing
4. On Windows, you may need to add installation directory to PATH

### "Cannot connect to server"

**Problem:** Tunnel is running but can't reach your local server

**Solution:**
1. Verify server is running: visit `http://localhost:3000` in browser on server machine
2. Check server terminal for errors
3. Make sure port 3000 isn't blocked by local firewall
4. Try restarting both server and tunnel

### "502 Bad Gateway" on tunnel URL

**Problem:** Tunnel is running but server is not

**Solution:**
1. Check that server is running in Terminal 1
2. Restart the server: Ctrl+C, then `npm start` again
3. Wait 10-20 seconds for tunnel to reconnect

### Tunnel URL loads but shows errors

**Problem:** Server is running but has application errors

**Solution:**
1. Check server terminal (Terminal 1) for error messages
2. Verify Claude CLI is working: `claude --version`
3. Check Claude authentication: `claude /login` if needed
4. Try accessing locally first: `http://localhost:3000`

### Corporate firewall blocks cloudflared

**Problem:** Company network blocks outbound tunnel connections

**Solution:**
1. Try on different network (mobile hotspot, home internet)
2. Ask IT to whitelist Cloudflare Tunnel domains
3. OR use SSH tunnel instead (requires SSH server access)

### Tunnel is slow/timing out

**Problem:** Cloudflare's edge network routing is inefficient for your location

**Solution:**
1. This is a limitation of free quick tunnels
2. Try restarting tunnel for different routing
3. Consider configured tunnels for better performance
4. OR use direct local network access if on same WiFi

---

## When to Upgrade to Configured Tunnels

Consider switching to configured tunnels if:

- **The changing URL is annoying** → Configured tunnels have persistent URLs
- **You use this daily** → Better reliability and performance
- **You want to run as a background service** → Auto-start on boot
- **You want better access controls** → Can add authentication, IP restrictions
- **You have a custom domain** → Can use `claude.yourdomain.com`

See `REMOTE_ACCESS_CONFIGURED_TUNNEL.md` for setup instructions.

---

## Quick Reference Card

**Start everything:**
```bash
# Terminal 1
cd reports && npm start

# Terminal 2
cloudflared tunnel --url localhost:3000
```

**Stop everything:**
```bash
# In both terminals
Ctrl+C
```

**Get the URL:**
Look for `https://randomly-generated-words.trycloudflare.com` in Terminal 2 output

**Test locally first:**
Always verify `http://localhost:3000` works before troubleshooting tunnel

---

## Need Help?

- **Cloudflare Tunnel Docs:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Server Issues:** Check `reports/README.md` troubleshooting section
- **Claude CLI Issues:** Run `claude --help` or visit https://code.claude.com/docs/

---

**Next:** Want a persistent URL that doesn't change? See `REMOTE_ACCESS_CONFIGURED_TUNNEL.md`
