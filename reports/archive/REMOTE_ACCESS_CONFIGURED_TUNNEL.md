# Remote Access Setup Guide: Configured Tunnels

**For:** Persistent remote access with the same URL every time
**Time to set up:** ~15-20 minutes
**Cost:** Free (Cloudflare account required)
**Best for:** Daily use, team access, production-like stability

---

## What This Does

Configured (Named) Tunnels create a **permanent** connection between your local server and Cloudflare's network with a persistent URL that never changes.

**Differences from Quick Tunnels:**

| Feature | Quick Tunnel | Configured Tunnel |
|---------|--------------|-------------------|
| URL persistence | Changes every restart | Same URL forever |
| Setup complexity | 30 seconds | 15 minutes |
| Account required | No | Yes (free) |
| Background service | No | Yes |
| Custom domain | No | Yes (optional) |
| Access controls | No | Yes (with Cloudflare Zero Trust) |

---

## Prerequisites

Before you begin:
- [ ] cloudflared installed (see Quick Tunnel guide Step 1)
- [ ] Your server working locally
- [ ] Cloudflare account (free) - Sign up at https://dash.cloudflare.com/sign-up
- [ ] (Optional) Domain managed by Cloudflare DNS

---

## Step 1: Authenticate with Cloudflare

This links cloudflared to your Cloudflare account.

```bash
cloudflared tunnel login
```

**What happens:**
1. Browser opens to Cloudflare authorization page
2. Choose which domain/account to use (or select "No domain" if you don't have one)
3. Authorize the connection
4. Certificate file saved to your computer

**Certificate location:**
- Windows: `C:\Users\YourName\.cloudflared\cert.pem`
- Mac/Linux: `~/.cloudflared/cert.pem`

**Important:** Keep this certificate secure. It gives cloudflared permission to create tunnels in your account.

---

## Step 2: Create a Named Tunnel

Create a tunnel with a permanent name:

```bash
cloudflared tunnel create claude-server
```

**Output:**
```
Tunnel credentials written to C:\Users\YourName\.cloudflared\<TUNNEL-ID>.json
Created tunnel claude-server with id <TUNNEL-ID>
```

**What was created:**
- Tunnel ID: Unique identifier (long string of letters/numbers)
- Credentials file: `<TUNNEL-ID>.json` in `.cloudflared/` directory
- Tunnel name: `claude-server` (human-readable alias)

**Save your Tunnel ID** - You'll need it for configuration.

---

## Step 3: Choose Your URL Type

You have two options for your tunnel URL:

### Option A: Use Cloudflare's Free Subdomain (No Domain Required)

**URL format:** `https://claude-server.cfargotunnel.com`

**Pros:**
- ✅ No domain needed
- ✅ Completely free
- ✅ Works immediately

**Cons:**
- ❌ Non-branded URL (includes "cfargotunnel.com")
- ❌ Less professional looking

**Skip to Step 4** if using this option.

### Option B: Use Your Custom Domain

**URL format:** `https://claude.yourdomain.com`

**Requirements:**
- Domain registered (any registrar)
- Domain nameservers pointed to Cloudflare
- Domain added to your Cloudflare account

**Pros:**
- ✅ Professional, branded URL
- ✅ More memorable
- ✅ Can use root domain or subdomain

**Cons:**
- ❌ Requires owning a domain
- ❌ Requires DNS configuration

**Continue to Step 3.1** if using custom domain.

#### Step 3.1: Configure DNS (Custom Domain Only)

Create a DNS record pointing to your tunnel:

```bash
cloudflared tunnel route dns claude-server claude.yourdomain.com
```

Replace:
- `claude-server` → Your tunnel name from Step 2
- `claude.yourdomain.com` → Your desired subdomain

**Output:**
```
Created CNAME record for claude.yourdomain.com which points to <TUNNEL-ID>.cfargotunnel.com
```

**Verify in Cloudflare dashboard:**
1. Go to https://dash.cloudflare.com
2. Select your domain
3. Click "DNS" tab
4. You should see a CNAME record for `claude` pointing to your tunnel

---

## Step 4: Create Configuration File

Create a configuration file that tells cloudflared how to route traffic.

### Create the config file

**Location:**
- Windows: `C:\Users\YourName\.cloudflared\config.yml`
- Mac/Linux: `~/.cloudflared/config.yml`

**Create the file** with this content:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: C:\Users\YourName\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: claude-server.cfargotunnel.com
    service: http://localhost:3000
  - service: http_status:404
```

**Replace:**
- `<TUNNEL-ID>` → The ID from Step 2 (appears in 2 places)
- `C:\Users\YourName\` → Your actual Windows user path (or `/Users/yourname/` on Mac)
- `claude-server.cfargotunnel.com` → Your URL from Step 3 (or custom domain if using Option B)

**Example (with custom domain):**
```yaml
tunnel: a1b2c3d4-e5f6-7890-abcd-ef1234567890
credentials-file: C:\Users\JohnDoe\.cloudflared\a1b2c3d4-e5f6-7890-abcd-ef1234567890.json

ingress:
  - hostname: claude.mydomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**What this does:**
- `tunnel` → Identifies which tunnel to use
- `credentials-file` → Where to find authentication
- `ingress` → Routing rules (hostname → local service)
- Last rule → Catch-all for any other hostnames (returns 404)

---

## Step 5: Test the Tunnel

Start the tunnel using your configuration:

```bash
cloudflared tunnel run claude-server
```

**Output:**
```
2024-11-22T10:30:45Z INF Starting tunnel tunnelID=<TUNNEL-ID>
2024-11-22T10:30:46Z INF Connection registered connIndex=0 ip=198.41.192.227 location=SJC
2024-11-22T10:30:47Z INF Connection registered connIndex=1 ip=198.41.192.227 location=SJC
```

**In another terminal**, start your server:

```bash
cd reports
npm start
```

**Test your URL:**

Open browser and visit:
- Free subdomain: `https://claude-server.cfargotunnel.com`
- Custom domain: `https://claude.yourdomain.com`

You should see the ALN Director Console interface!

**If it works:** Proceed to Step 6 to set up auto-start
**If not:** See Troubleshooting section

---

## Step 6: Run Tunnel as Background Service

Make the tunnel start automatically when your computer boots.

### Windows: Install as Service

```bash
cloudflared service install
```

**What this does:**
- Creates Windows service named "Cloudflare Tunnel"
- Auto-starts on system boot
- Runs in background (no terminal window needed)
- Uses the config file from `%USERPROFILE%\.cloudflared\config.yml`

**Manage the service:**

```bash
# Start the service
cloudflared service start

# Stop the service
cloudflared service stop

# Check status
sc query "Cloudflare Tunnel"
```

**Note:** You still need to manually start your Node.js server (`npm start`). Only the tunnel runs automatically.

### Mac/Linux: Create systemd Service

Create a service file:

```bash
sudo nano /etc/systemd/system/cloudflared.service
```

**Content:**

```ini
[Unit]
Description=Cloudflare Tunnel
After=network.target

[Service]
Type=simple
User=your-username
ExecStart=/usr/local/bin/cloudflared tunnel run claude-server
Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

**Replace `your-username`** with your actual username.

**Enable and start:**

```bash
sudo systemctl enable cloudflared
sudo systemctl start cloudflared
```

**Manage the service:**

```bash
# Check status
sudo systemctl status cloudflared

# Stop
sudo systemctl stop cloudflared

# Restart
sudo systemctl restart cloudflared
```

---

## Step 7: Auto-Start Your Server (Optional)

### Option A: PM2 (Cross-platform)

Use PM2 to manage your Node.js server:

```bash
# Install PM2 globally
npm install -g pm2

# Start server with PM2
cd reports
pm2 start npm --name "aln-console" -- start

# Save PM2 configuration
pm2 save

# Set up auto-start
pm2 startup
```

PM2 will give you a command to run (with sudo/admin). Run that command.

**Manage with PM2:**

```bash
# Status
pm2 status

# Stop
pm2 stop aln-console

# Restart
pm2 restart aln-console

# Logs
pm2 logs aln-console
```

### Option B: Startup Script

Create a batch file (Windows) or shell script (Mac/Linux):

**Windows: `C:\Users\YourName\start-aln-console.bat`**

```batch
@echo off
cd /d C:\Users\YourName\Documents\claudecode\aboutlastnight\reports
start "ALN Console" cmd /k npm start
```

Add to Windows startup folder:
1. Press `Win+R`
2. Type `shell:startup`
3. Create shortcut to `start-aln-console.bat`

**Mac/Linux: Create Launch Agent** (similar to systemd)

---

## Daily Workflow (After Setup)

**With background service:**
1. Your tunnel is always running (auto-started on boot)
2. Start server: `cd reports && npm start`
3. Access via persistent URL from any device
4. Done!

**Without background service:**
1. Terminal 1: `cloudflared tunnel run claude-server`
2. Terminal 2: `cd reports && npm start`
3. Access via persistent URL
4. Both terminals must stay open

---

## Managing Your Tunnel

### List all tunnels

```bash
cloudflared tunnel list
```

### Delete a tunnel

```bash
# Stop tunnel first
cloudflared service stop  # or Ctrl+C if running manually

# Delete tunnel
cloudflared tunnel delete claude-server

# Cleanup DNS (if using custom domain)
# Remove CNAME record from Cloudflare dashboard
```

### Update configuration

1. Edit `~/.cloudflared/config.yml`
2. Restart tunnel:
   ```bash
   cloudflared service stop
   cloudflared service start
   ```

### View tunnel info

```bash
cloudflared tunnel info claude-server
```

---

## Access Control with Cloudflare Zero Trust (Advanced)

Add authentication to protect your tunnel (requires Cloudflare Zero Trust account - free tier available).

### Step 1: Enable Cloudflare Zero Trust

1. Go to https://one.dash.cloudflare.com/
2. Create a team (free)
3. Note your team name (e.g., `myteam`)

### Step 2: Create Access Policy

1. In Zero Trust dashboard: Access → Applications
2. Click "Add an application" → "Self-hosted"
3. Application configuration:
   - Name: ALN Console
   - Subdomain: claude
   - Domain: yourdomain.com
4. Identity providers:
   - Enable "One-time PIN" (email authentication)
   - OR connect Google/GitHub/Microsoft SSO
5. Access policy:
   - Policy name: "ALN Team Only"
   - Action: Allow
   - Include: Emails matching: `yourteam@email.com` OR `*@yourdomain.com`

### Step 3: Update Tunnel Config

Edit `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-ID>
credentials-file: /path/to/<TUNNEL-ID>.json

ingress:
  - hostname: claude.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

**No changes needed!** Access policies apply automatically to tunnels.

**Test:**
1. Visit your tunnel URL
2. You'll see Cloudflare Access login page
3. Enter email address
4. Receive one-time PIN or SSO login
5. After authentication → Access granted to console

---

## Troubleshooting

### "Tunnel credentials file not found"

**Problem:** Config file points to wrong credentials path

**Solution:**
1. Find credentials: `dir %USERPROFILE%\.cloudflared\*.json` (Windows) or `ls ~/.cloudflared/*.json`
2. Update `credentials-file` path in `config.yml`
3. Use absolute paths, not relative

### "No connection to the origin"

**Problem:** Tunnel can't reach local server

**Solution:**
1. Verify server is running: `http://localhost:3000`
2. Check `service:` line in config.yml matches server port
3. Restart both tunnel and server

### "Cannot connect to tunnel"

**Problem:** DNS propagation delay (custom domains only)

**Solution:**
1. Wait 5-10 minutes for DNS changes to propagate
2. Check DNS: `nslookup claude.yourdomain.com`
3. Should resolve to `<TUNNEL-ID>.cfargotunnel.com`
4. Try cfargotunnel.com URL to test tunnel separately from DNS

### "ERR_CONNECTION_TIMED_OUT"

**Problem:** Firewall blocking cloudflared

**Solution:**
1. Allow cloudflared.exe through Windows Firewall
2. Check corporate firewall settings
3. Verify outbound HTTPS (443) not blocked

### Service won't start automatically

**Problem:** Service configuration error

**Windows:**
```bash
# Reinstall service
cloudflared service uninstall
cloudflared service install
```

**Linux:**
```bash
# Check service logs
sudo journalctl -u cloudflared -f
```

### "Multiple connections registered" but site doesn't load

**Problem:** Tunnel connected but DNS not pointing to tunnel

**Solution:**
1. Check CNAME record exists: Cloudflare dashboard → DNS
2. Verify CNAME target: `<TUNNEL-ID>.cfargotunnel.com`
3. Make sure Cloudflare proxy is enabled (orange cloud icon)

---

## Security Considerations

### Default State: No Authentication

Even with configured tunnels, your server.js has no built-in authentication. Anyone with the URL can access.

**Mitigation options:**

1. **Use Cloudflare Access** (recommended) - See "Access Control" section above
2. **Add application-level auth** - Modify server.js to require API key/password
3. **IP allowlisting** - Restrict access to specific IPs (Cloudflare Zero Trust)
4. **Keep URL private** - Don't share publicly, treat as sensitive

### HTTPS by Default

Cloudflare Tunnel provides:
- ✅ Automatic HTTPS/TLS encryption
- ✅ Valid SSL certificate (no browser warnings)
- ✅ No certificate management needed on your end

### Credential Protection

Protect your tunnel credentials:
- Never commit `.cloudflared/*.json` to git
- Set proper file permissions: `chmod 600 ~/.cloudflared/*.json` (Mac/Linux)
- These credentials allow anyone to use your tunnel

### API Quota Protection

Your server uses YOUR Claude API quota. Consider:
- Adding authentication to prevent unauthorized use
- Monitoring API usage in Claude dashboard
- Setting up alerts for unusual activity

---

## Migrating from Quick Tunnels

Already using quick tunnels? Here's how to switch:

1. **Keep quick tunnel working** - Don't delete anything yet
2. **Set up configured tunnel** - Follow Steps 1-5 above
3. **Test side by side** - Both can run simultaneously on different ports
4. **Switch when ready** - Update bookmarks to new persistent URL
5. **Stop using quick tunnel** - Eventually stop running `cloudflared tunnel --url`

**No downtime migration:**
- Run configured tunnel on port 3001 temporarily
- Edit server.js: `const PORT = 3001;`
- Test new URL thoroughly
- Switch back to port 3000 when satisfied

---

## Cost Breakdown

**What's free:**
- ✅ Cloudflare Tunnel (unlimited bandwidth)
- ✅ Cloudflare DNS
- ✅ Cloudflare Zero Trust (free tier: up to 50 users)
- ✅ SSL certificates
- ✅ DDoS protection

**What costs money (all optional):**
- Cloudflare Zero Trust Team/Enterprise tiers (more users, advanced features)
- Domain registration (if you don't have one) - ~$10-15/year
- Nothing else!

**Compared to alternatives:**
- ngrok persistent URL: $8/month
- VPS with reverse proxy: $5-10/month
- Tailscale Teams: $6/user/month

---

## Performance Notes

**Latency:**
- Additional ~20-50ms vs direct connection
- Cloudflare edge network usually very fast
- Depends on location (proximity to Cloudflare data centers)

**Bandwidth:**
- No hard limits on free tier
- Suitable for typical web application use
- Not ideal for large file transfers (upload/download)

**Reliability:**
- Configured tunnels auto-reconnect on network issues
- Much more stable than quick tunnels
- Cloudflare SLA for enterprise customers only

---

## Quick Reference Card

**Start tunnel manually:**
```bash
cloudflared tunnel run claude-server
```

**Start as service:**
```bash
# Windows
cloudflared service start

# Linux
sudo systemctl start cloudflared
```

**Check tunnel status:**
```bash
cloudflared tunnel info claude-server
```

**View service logs:**
```bash
# Windows
Get-EventLog -LogName Application -Source "Cloudflare Tunnel" -Newest 50

# Linux
sudo journalctl -u cloudflared -f
```

**Your persistent URL:**
- Free: `https://claude-server.cfargotunnel.com`
- Custom: `https://claude.yourdomain.com`

---

## Need Help?

- **Cloudflare Tunnel Documentation:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Cloudflare Zero Trust:** https://developers.cloudflare.com/cloudflare-one/
- **Community:** https://community.cloudflare.com/

---

**Want something simpler?** See `REMOTE_ACCESS_QUICK_TUNNEL.md` for temporary URL setup.
