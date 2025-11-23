# Remote Access Setup Guide: ngrok

**For:** Quick setup with built-in traffic inspection and authentication
**Time to set up:** ~5 minutes
**Cost:** Free (with limitations) or $8-20/month for persistent URLs
**Best for:** Active development, debugging, built-in authentication needs

---

## What This Does

ngrok creates a secure tunnel from a public URL to your local server, similar to Cloudflare Tunnel, but with additional developer-focused features.

**Key Difference from Cloudflare:**
- **Traffic Inspector:** Web UI showing every request/response in real-time
- **Built-in Authentication:** Add password protection with one command
- **Request Replay:** Resend requests for debugging
- **Free tier limitations:** 2-hour session limit, interstitial warning page

**Example:**
- Your server runs locally: `http://localhost:3000`
- ngrok creates: `https://abc123.ngrok-free.app`
- Inspector at: `http://localhost:4040`

---

## ngrok Tiers Comparison

| Feature | Free | Personal ($8/mo) | Pro ($20/mo) |
|---------|------|------------------|--------------|
| **Persistent URL** | ❌ Random | ✅ 3 domains | ✅ 10 domains |
| **Session limit** | 2 hours | ✅ Unlimited | ✅ Unlimited |
| **Warning page** | ⚠️ Yes | ✅ None | ✅ None |
| **Traffic inspection** | ✅ | ✅ | ✅ |
| **Basic auth** | ✅ | ✅ | ✅ |
| **OAuth (Google/GitHub)** | ❌ | ❌ | ✅ |
| **Custom domain** | ❌ | ❌ | ✅ |
| **Concurrent tunnels** | 1 | 3 | 10 |
| **IP restrictions** | ❌ | ❌ | ✅ |

**Annual discount:** 50% off (Personal = $96/year, Pro = $240/year)

---

## Prerequisites

- [ ] Node.js installed
- [ ] Your server working locally (`npm start` in reports/ directory)
- [ ] Email address for ngrok account (free)
- [ ] Credit card (only if using paid tier)

---

## Part 1: Free Tier Setup

### Step 1: Install ngrok

**Windows (winget):**
```bash
winget install ngrok
```

**Windows (manual download):**
1. Visit https://ngrok.com/download
2. Download Windows ZIP file
3. Extract `ngrok.exe` to a folder (e.g., `C:\ngrok\`)
4. Add folder to PATH:
   - Search "Environment Variables" in Windows
   - Edit "Path" variable
   - Add `C:\ngrok\`
   - Restart terminal

**Mac:**
```bash
brew install ngrok/ngrok/ngrok
```

**Linux:**
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | \
  sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && \
  echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | \
  sudo tee /etc/apt/sources.list.d/ngrok.list && \
  sudo apt update && sudo apt install ngrok
```

**Verify installation:**
```bash
ngrok version
```

Should output: `ngrok version 3.x.x`

---

### Step 2: Create ngrok Account

1. Go to https://dashboard.ngrok.com/signup
2. Sign up with email or GitHub/Google
3. Verify your email address
4. You'll be redirected to the dashboard

**Important:** Even the free tier requires an account (unlike Cloudflare quick tunnels).

---

### Step 3: Add Auth Token

After signing up, you'll see your auth token on the dashboard.

**Add token to ngrok:**
```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

**What this does:**
- Saves token to `~/.ngrok2/ngrok.yml` (config file)
- Links ngrok on your machine to your account
- Required even for free tier

**Verify:**
```bash
ngrok config check
```

Should show: `Valid configuration file at ...`

---

### Step 4: Start Your Server

In your first terminal:

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

**Keep this terminal running.**

---

### Step 5: Start ngrok Tunnel

**Open a second terminal** and run:

```bash
ngrok http 3000
```

**Output:**
```
ngrok

Build better APIs with ngrok. Early access: ngrok.com/early-access

Session Status                online
Account                       your@email.com (Plan: Free)
Version                       3.5.0
Region                        United States (us)
Latency                       25ms
Web Interface                 http://127.0.0.1:4040
Forwarding                    https://abc123-def456.ngrok-free.app -> http://localhost:3000

Connections                   ttl     opn     rt1     rt5     p50     p90
                              0       0       0.00    0.00    0.00    0.00
```

**Copy the Forwarding URL** (the `https://abc123-def456.ngrok-free.app` part)

**Keep this terminal running.**

---

### Step 6: Test Remote Access

**Visit the URL:**
1. Paste URL in browser on any device
2. You'll see an **interstitial warning page**:
   ```
   You are about to visit abc123-def456.ngrok-free.app
   which is being served by localhost:3000

   [Visit Site]  [Report Abuse]
   ```
3. Click **"Visit Site"**
4. You should see the ALN Director Console

**This warning page appears on all free tier tunnels.** It's ngrok's anti-abuse measure.

---

### Step 7: Use the Traffic Inspector (Best Feature!)

**Open in browser on the server machine:**
```
http://localhost:4040
```

**What you'll see:**
- Every HTTP request/response in real-time
- Request headers, body, query parameters
- Response status, headers, body
- Response times
- Ability to replay requests

**Why this is amazing:**
- Debug API calls without adding console.log
- See exactly what remote devices are sending
- Test different request variations by replaying
- Monitor performance and response times

**Example use cases:**
- "Why is the form submission failing from my phone?"
  → Check inspector to see exact request payload
- "Is the Claude API call timing out?"
  → See response times in inspector
- "Did the Notion token get sent correctly?"
  → Check request headers in inspector

---

## Free Tier Limitations

### 1. Two-Hour Session Limit

After 2 hours, the tunnel disconnects automatically.

**Workaround:**
- Restart ngrok (will get new URL)
- OR upgrade to Personal tier ($8/mo)

**Check remaining time:**
Look at `Session Status` output when starting ngrok.

### 2. Random URL Changes

Every time you restart ngrok, you get a new random URL.

**Workaround:**
- Bookmark on each device each session
- OR upgrade to Personal tier for reserved domains

### 3. Interstitial Warning Page

All visitors see the "Visit Site" warning before accessing.

**Workaround:**
- Inform users to click "Visit Site"
- OR upgrade to Personal tier (no warning page)

### 4. One Tunnel at a Time

Can only run one tunnel simultaneously.

**Workaround:**
- Stop current tunnel before starting another
- OR upgrade to Personal tier (3 concurrent tunnels)

---

## Part 2: Paid Tier Features

### Upgrading to Personal ($8/month)

**What you get:**
- ✅ 3 reserved domains (persistent URLs)
- ✅ No session time limits
- ✅ No interstitial warning page
- ✅ 3 concurrent tunnels
- ✅ Traffic inspection (same as free)

**To upgrade:**
1. Visit https://dashboard.ngrok.com/billing/plan
2. Select "Personal" plan
3. Enter payment information
4. Confirm

---

### Reserved Domains (Persistent URLs)

**Create a reserved domain:**

1. Go to https://dashboard.ngrok.com/cloud-edge/domains
2. Click "New Domain"
3. Choose:
   - **Random domain:** `your-random-name.ngrok-free.app` (free)
   - **Custom subdomain:** `your-choice.ngrok-free.app` (if available)
4. Click "Create"

**Use reserved domain:**
```bash
ngrok http 3000 --domain=your-choice.ngrok-free.app
```

**Result:** Same URL every time! Bookmark it on all devices.

---

### Custom Domains (Pro Tier Only - $20/month)

Use your own domain like `claude.yourdomain.com`.

**Requirements:**
- Pro plan ($20/month)
- Domain you own
- DNS access

**Setup:**

1. **In ngrok dashboard:**
   - Go to Cloud Edge → Domains
   - Click "New Domain"
   - Enter `claude.yourdomain.com`
   - Save

2. **In your DNS provider:**
   - Add CNAME record:
     - Name: `claude`
     - Value: (from ngrok dashboard, something like `abc123.ngrok.io`)
     - TTL: 300

3. **Start tunnel:**
   ```bash
   ngrok http 3000 --domain=claude.yourdomain.com
   ```

**Wait 5-10 minutes for DNS propagation.**

---

## Part 3: Authentication

### Basic Authentication (All Tiers)

Add username/password protection:

```bash
ngrok http 3000 --basic-auth="username:password"
```

**What users see:**
- Browser shows login prompt
- Must enter username and password
- Only then can access your server

**Multiple users:**
```bash
ngrok http 3000 --basic-auth="admin:secret123" --basic-auth="user:pass456"
```

**Use case:** Share tunnel with trusted teammates, prevent unauthorized access.

---

### OAuth (Pro Tier Only)

Add Google/GitHub/Microsoft login:

```bash
# Google OAuth
ngrok http 3000 --oauth=google --oauth-allow-email=you@gmail.com

# GitHub OAuth
ngrok http 3000 --oauth=github --oauth-allow-email=you@github.com

# Allow entire domain
ngrok http 3000 --oauth=google --oauth-allow-domain=yourcompany.com
```

**What users see:**
- "Sign in with Google/GitHub" button
- OAuth authorization flow
- Only allowed emails can access

**Use case:** Team access with SSO, more professional than basic auth.

---

## Part 4: Configuration File

Instead of typing commands every time, save configuration to file.

**Config file location:**
- Windows: `C:\Users\YourName\.ngrok2\ngrok.yml`
- Mac/Linux: `~/.ngrok2/ngrok.yml`

**Example config:**

```yaml
version: "2"
authtoken: YOUR_AUTH_TOKEN_HERE

tunnels:
  aln-console:
    proto: http
    addr: 3000
    # For free tier (random URL)
    basic_auth:
      - "admin:secretpassword"

  aln-console-persistent:
    proto: http
    addr: 3000
    # For paid tier (reserved domain)
    domain: your-choice.ngrok-free.app
    basic_auth:
      - "admin:secretpassword"
```

**Start using config:**

```bash
# Free tier
ngrok start aln-console

# Paid tier
ngrok start aln-console-persistent
```

**Benefits:**
- No need to remember command flags
- Consistent settings every time
- Easy to switch between configurations

---

## Daily Workflow

### Free Tier

**Every time you want remote access:**

1. **Terminal 1:** Start server
   ```bash
   cd reports
   npm start
   ```

2. **Terminal 2:** Start ngrok
   ```bash
   ngrok http 3000
   ```

3. **Copy the URL** from Terminal 2 output

4. **Open traffic inspector** (optional but useful)
   ```
   http://localhost:4040
   ```

5. **Share URL** with your other devices

6. **After 2 hours:** Restart ngrok, get new URL

**Stop everything:**
```bash
# Ctrl+C in both terminals
```

---

### Paid Tier (Persistent URL)

**First time:**
1. Create reserved domain in dashboard
2. Add to config file

**Every time:**

1. **Terminal 1:** Start server
   ```bash
   cd reports
   npm start
   ```

2. **Terminal 2:** Start ngrok with reserved domain
   ```bash
   ngrok http 3000 --domain=your-choice.ngrok-free.app
   ```

3. **Access from anywhere** using same URL (bookmark it!)

4. **No time limit** - keep running as long as needed

---

## Part 5: Advanced Features

### Traffic Inspection Deep Dive

**Web Interface (http://localhost:4040):**

**Request List:**
- Every request shows: method, path, status, time
- Click any request to see details
- Filter by status code, path, method

**Request Details:**
- Headers (all of them)
- Query parameters
- Request body (JSON, form data, etc.)
- Response headers
- Response body
- Timing information

**Replay Requests:**
1. Click request in list
2. Click "Replay" button
3. Optionally modify headers/body
4. Send again
5. Compare old vs new response

**Use cases:**
- Test form submissions with different data
- Debug authentication issues
- Monitor API call performance
- Capture problematic requests for bug reports

---

### Request Modification (Pro Tier)

**Add custom headers:**
```bash
ngrok http 3000 --request-header-add="X-Custom: value"
```

**Remove headers:**
```bash
ngrok http 3000 --request-header-remove="X-Unwanted"
```

**Use case:** Add authentication headers, remove sensitive headers, test different header combinations.

---

### IP Restrictions (Pro Tier)

**Allow only specific IPs:**
```bash
ngrok http 3000 --cidr-allow="1.2.3.4/32"
```

**Block specific IPs:**
```bash
ngrok http 3000 --cidr-deny="5.6.7.8/32"
```

**Use case:** Restrict access to office network, block malicious IPs.

---

### Multiple Tunnels (Personal/Pro Tiers)

Run tunnels to different services simultaneously.

**Example config:**

```yaml
tunnels:
  server:
    proto: http
    addr: 3000
  api:
    proto: http
    addr: 8080
  db:
    proto: tcp
    addr: 5432
```

**Start all:**
```bash
ngrok start --all
```

**Or start specific ones:**
```bash
ngrok start server api
```

---

## Troubleshooting

### "ERR_NGROK_108: Account not found"

**Problem:** Auth token not configured or invalid

**Solution:**
1. Go to https://dashboard.ngrok.com/get-started/your-authtoken
2. Copy your auth token
3. Run: `ngrok config add-authtoken YOUR_TOKEN`
4. Verify: `ngrok config check`

---

### "ERR_NGROK_324: Tunnel not found"

**Problem:** Trying to use reserved domain without paid account

**Solution:**
- Remove `--domain` flag (use random URL)
- OR upgrade to Personal/Pro tier

---

### "429 Too Many Requests" or "ERR_NGROK_326"

**Problem:** Exceeded free tier rate limits

**Solution:**
- Wait a few minutes
- Restart ngrok
- OR upgrade to paid tier (higher limits)

---

### Tunnel works but inspector (localhost:4040) doesn't load

**Problem:** Port 4040 already in use

**Solution:**

1. **Check what's using port 4040:**
   ```bash
   # Windows
   netstat -ano | findstr :4040

   # Mac/Linux
   lsof -i :4040
   ```

2. **Kill the process or change inspector port:**
   ```bash
   ngrok http 3000 --web-addr=localhost:4041
   ```

3. **Visit new inspector URL:**
   ```
   http://localhost:4041
   ```

---

### "Session limit exceeded" after 2 hours

**Problem:** Free tier limitation

**Solution:**
- Restart ngrok (get new URL, restart 2-hour timer)
- OR upgrade to Personal tier ($8/mo, no limits)

**Workaround for multiple sessions:**
```bash
# Add to a script/batch file
while true; do
  ngrok http 3000
  sleep 1
done
```

This auto-restarts after each 2-hour session (URL changes though).

---

### Interstitial page appears even on paid tier

**Problem:** Using free-tier URL format

**Solution:**
- Make sure you're using reserved domain
- Check dashboard: billing status active?
- Restart ngrok with `--domain` flag

---

### "Invalid Host header" error from server

**Problem:** Your server rejects ngrok's Host header

**Solution:**

**If using Webpack dev server or similar:**
```bash
ngrok http 3000 --host-header=rewrite
```

**Or configure your server to accept ngrok hosts.**

---

### Tunnel is very slow

**Problem:** Routing inefficiency or ngrok throttling

**Solution:**

1. **Check region:**
   ```bash
   ngrok http 3000 --region=us
   # Options: us, eu, ap, au, sa, jp, in
   ```

2. **Test latency:**
   - Look at "Latency" in ngrok output
   - Should be < 100ms
   - If > 200ms, try different region

3. **Check if being throttled:**
   - Free tier may throttle heavy usage
   - Upgrade to paid tier

---

### Certificate errors or HTTPS issues

**Problem:** Local server uses HTTPS incorrectly

**Solution:**

ngrok handles HTTPS automatically. Your local server should use HTTP:
- ✅ Server runs on `http://localhost:3000`
- ✅ ngrok creates `https://abc123.ngrok-free.app`
- ❌ Don't run server with self-signed HTTPS cert

If you must tunnel HTTPS:
```bash
ngrok http https://localhost:3000
```

---

## Security Considerations

### Your Server Has No Auth

Even with ngrok running, your `server.js` has no authentication. Anyone with the URL can access.

**Mitigation:**
1. **Use ngrok basic auth** (easiest):
   ```bash
   ngrok http 3000 --basic-auth="user:pass"
   ```

2. **Keep URL private:**
   - Don't share publicly
   - Free tier URLs are random/hard to guess
   - Still treat as sensitive

3. **Add server-side auth:**
   - Modify `server.js` to check API keys
   - See Quick Tunnel guide for example

---

### Traffic Inspection Privacy

**Your traffic is visible in the inspector at localhost:4040.**

**Important:**
- Anyone with access to the server machine can see all requests/responses
- This includes sensitive data (passwords, API keys, etc.)
- Don't leave inspector open on shared computers

**ngrok does NOT store your traffic** (they claim). Inspector is local-only.

---

### ngrok Terms of Service

Free tier prohibits:
- ❌ Production use
- ❌ Long-term hosting
- ❌ High-traffic applications
- ❌ Commercial services

**Use cases explicitly allowed:**
- ✅ Development
- ✅ Testing
- ✅ Demos
- ✅ Personal projects

For production use, upgrade to paid tier.

---

## Comparison: When to Use ngrok vs Cloudflare

### Use ngrok if:
- ✅ You need traffic inspection (debugging is crucial)
- ✅ You want one-command authentication
- ✅ 2-hour sessions are acceptable (free tier)
- ✅ You're willing to pay $8/mo for persistent URL
- ✅ You value developer experience over cost

### Use Cloudflare if:
- ✅ You want free persistent URLs
- ✅ You don't need traffic inspection
- ✅ No session time limits required (free tier)
- ✅ You already use Cloudflare services
- ✅ You want zero-cost long-term solution

### My recommendation:
1. **Try ngrok free first** - see if traffic inspector is valuable
2. **If inspection is crucial** - pay for ngrok Personal ($8/mo)
3. **If inspection isn't needed** - switch to Cloudflare configured tunnel (free)

---

## Quick Reference Card

### Free Tier Commands

```bash
# Start tunnel (random URL)
ngrok http 3000

# With basic auth
ngrok http 3000 --basic-auth="user:pass"

# Specific region
ngrok http 3000 --region=us

# View traffic inspector
http://localhost:4040
```

### Paid Tier Commands

```bash
# Reserved domain
ngrok http 3000 --domain=your-app.ngrok-free.app

# Custom domain (Pro)
ngrok http 3000 --domain=claude.yourdomain.com

# Multiple features
ngrok http 3000 \
  --domain=your-app.ngrok-free.app \
  --basic-auth="admin:secret" \
  --region=us
```

### Useful Dashboard URLs

- Auth token: https://dashboard.ngrok.com/get-started/your-authtoken
- Reserved domains: https://dashboard.ngrok.com/cloud-edge/domains
- Billing: https://dashboard.ngrok.com/billing/plan
- Usage stats: https://dashboard.ngrok.com/usage/bandwidth

---

## Cost Analysis

**Free Tier:**
- Cost: $0/month
- Good for: Testing, short sessions, occasional use
- Limitations: 2-hour limit, random URLs, warning page

**Personal Tier ($8/month or $96/year):**
- Cost: $8/month (50% off if annual)
- Break-even vs other options: Cheapest persistent URL with traffic inspection
- Good for: Daily use, multiple devices, serious development

**Pro Tier ($20/month or $240/year):**
- Cost: $20/month (50% off if annual)
- Break-even: Compare to Cloudflare Zero Trust ($7/user/mo) + domain costs
- Good for: Team access, custom branding, advanced features

**vs Cloudflare:**
- Cloudflare configured tunnel: Free persistent URL
- ngrok advantage: Traffic inspection
- **Cost difference: $96/year for inspection feature**

---

## Migration Between Services

### From Cloudflare to ngrok

1. Keep Cloudflare tunnel running
2. Start ngrok on different port: `ngrok http 3001`
3. Change server to port 3001: `const PORT = 3001;`
4. Test ngrok URL thoroughly
5. Stop Cloudflare tunnel when satisfied
6. Switch server back to port 3000

### From ngrok to Cloudflare

1. Set up Cloudflare tunnel (see other guide)
2. Test both URLs work simultaneously
3. Update bookmarks to Cloudflare URL
4. Cancel ngrok subscription if on paid tier
5. Uninstall ngrok if desired

**No downtime needed for either direction.**

---

## Need Help?

- **ngrok Documentation:** https://ngrok.com/docs
- **Dashboard/Account:** https://dashboard.ngrok.com
- **Support:** https://ngrok.com/support (email support for paid tiers)
- **Community:** https://github.com/inconshreveable/ngrok/discussions

---

**Want persistent URL for free?** See `REMOTE_ACCESS_CONFIGURED_TUNNEL.md` (Cloudflare option)
**Want super quick temporary access?** See `REMOTE_ACCESS_QUICK_TUNNEL.md` (Cloudflare quick tunnels)
