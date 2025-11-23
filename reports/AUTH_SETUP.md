# Authentication Setup Guide

## Overview

The ALN Director Console now requires password authentication to access. This protects your server from unauthorized access when sharing via Cloudflare Tunnel or other remote access methods.

**Current password:** `@LN-c0nn3ct`

---

## What Changed

### Security Features Added

1. **Session-Based Authentication**
   - Password required to access console
   - Session cookie lasts 7 days
   - Logout button in header

2. **Protected Endpoints**
   - `/api/analyze` - Requires authentication
   - `/api/generate` - Requires authentication
   - `/api/config` - Requires authentication

3. **Public Endpoints** (no auth required)
   - `/api/auth/login` - Login endpoint
   - `/api/auth/check` - Check auth status
   - `/api/auth/logout` - Logout endpoint
   - `/` - Frontend HTML (shows password prompt if not authenticated)

---

## User Experience

### First Visit

1. Visit `https://console.aboutlastnightgame.com`
2. See password prompt overlay
3. Enter password: `@LN-c0nn3ct`
4. Click "Access Console"
5. Password prompt disappears → Console loads

### Logged In

- Session lasts 7 days
- Can close browser and return without re-entering password
- Logout button in top-right corner

### After Logout

- Click "Logout" button
- Returns to password prompt
- Must re-enter password to access

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

**Best practices:**
- Send URL via one channel (email, Slack, etc.)
- Send password via different channel (Signal, encrypted chat, in person)
- Change password periodically (instructions below)

---

## Changing the Password

### Method 1: Edit .env File (Easiest)

1. Open `.env` file:
   ```bash
   notepad C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.env
   ```

2. Change the `ACCESS_PASSWORD` line:
   ```
   ACCESS_PASSWORD=your-new-password-here
   ```

3. Save file

4. Restart server:
   ```bash
   # Stop server (Ctrl+C in terminal)
   # Restart
   npm start
   ```

### Method 2: Environment Variable (Temporary)

```bash
# Windows
set ACCESS_PASSWORD=temporary-password
npm start

# Mac/Linux
export ACCESS_PASSWORD=temporary-password
npm start
```

**Note:** This only lasts for current terminal session.

---

## Technical Details

### Session Management

**Cookie configuration:**
- Name: `connect.sid`
- httpOnly: `true` (prevents JavaScript access)
- secure: `false` (set to `true` if using HTTPS only)
- maxAge: 7 days

**Storage:**
- Sessions stored in memory (not persistent across server restarts)
- Restarting server logs out all users
- Users need to re-enter password after server restart

### Password Comparison

- Direct string comparison (plaintext)
- Password stored in `.env` file server-side
- Not sent or stored in browser (only session cookie)

**Security level:** Suitable for small team, trusted network
**Not suitable for:** Public internet without HTTPS, sensitive data

---

## Upgrading Security (Optional)

### 1. Enable HTTPS Only Cookies

**Edit `server.js` line 27:**
```javascript
cookie: {
    httpOnly: true,
    secure: true,  // Change to true
    maxAge: 7 * 24 * 60 * 60 * 1000
}
```

**Requires:** HTTPS connection (Cloudflare Tunnel provides this automatically)

### 2. Add Password Hashing

**Currently:** Passwords compared as plaintext
**Upgrade:** Use bcrypt for hashed password comparison

**Install bcrypt:**
```bash
npm install bcrypt
```

**Edit login endpoint** in `server.js`:
```javascript
const bcrypt = require('bcrypt');

// Hash password once (run in terminal):
// node -e "const bcrypt = require('bcrypt'); bcrypt.hash('@LN-c0nn3ct', 10, (err, hash) => console.log(hash));"
// Put result in .env as ACCESS_PASSWORD_HASH

app.post('/api/auth/login', async (req, res) => {
    const { password } = req.body;
    const passwordHash = process.env.ACCESS_PASSWORD_HASH;

    const match = await bcrypt.compare(password, passwordHash);
    if (match) {
        req.session.authenticated = true;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Incorrect password' });
    }
});
```

### 3. Add Rate Limiting

Prevent brute-force password guessing:

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many login attempts, please try again later'
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
    // ... login logic
});
```

---

## Troubleshooting

### "Incorrect password" error

**Problem:** Password doesn't match what's in .env

**Check:**
```bash
# View current password
type C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.env
```

Look for `ACCESS_PASSWORD=` line

**Solution:**
1. Verify you're typing correct password
2. Check for extra spaces in .env file
3. Restart server after changing .env

---

### Logged in but endpoints return 401 Unauthorized

**Problem:** Session lost or server restarted

**Solution:**
1. Click "Logout" button
2. Log in again
3. Should work now

**Why:** Server restarts clear in-memory sessions

---

### Session expires too quickly

**Problem:** Cookie maxAge too short

**Solution:**

Edit `server.js` line 28:
```javascript
maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days instead of 7
```

Restart server.

---

### Password field not showing

**Problem:** Frontend not loading auth check

**Check browser console** (F12 → Console tab):
- Look for errors
- Try hard refresh: Ctrl+Shift+R

**Solution:**
1. Restart server
2. Clear browser cache
3. Try different browser

---

### "Connection error" when logging in

**Problem:** Server not running or wrong URL

**Check:**
1. Server terminal - is it running?
2. Try localhost first: `http://localhost:3000`
3. If localhost works, tunnel might be down

**Solution:**
- Restart server: `npm start`
- Restart tunnel: `cloudflared tunnel run aln-console`

---

## Security Best Practices

### DO ✅

- Change default password immediately
- Use strong passwords (mix of letters, numbers, symbols)
- Share password via secure channel (encrypted chat)
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

Successful login:
```
[2024-11-23T10:30:45.000Z] Successful login from 192.168.1.100
```

Failed login:
```
[2024-11-23T10:31:12.000Z] Failed login attempt from 192.168.1.100
```

**Watch logs in real-time:**
```bash
# In server terminal window
# Logs appear as events happen
```

**Check for suspicious activity:**
- Multiple failed attempts from same IP
- Login attempts from unknown IPs
- Unusual times (middle of night, etc.)

---

## Disabling Authentication (Not Recommended)

If you want to remove password protection (not recommended for public access):

1. **Remove requireAuth middleware** from endpoints in `server.js`:
   ```javascript
   // Change this:
   app.post('/api/analyze', requireAuth, async (req, res) => {

   // To this:
   app.post('/api/analyze', async (req, res) => {
   ```

2. **Remove auth check** in frontend `detlogv3.html`:
   - Delete lines 948-961 (auth check useEffect)
   - Delete lines 1782-1846 (password prompt UI)

3. **Restart server**

**Warning:** Anyone with URL can access console and use your Claude API quota.

---

## Environment Variables Reference

**Current `.env` configuration:**

```bash
# Notion Integration Token
NOTION_TOKEN=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

# Access Password
ACCESS_PASSWORD=@LN-c0nn3ct

# Session Secret (for cookie encryption)
SESSION_SECRET=a7f3e9c2b8d4a1f6e5c9b3d7a2f8e1c4b9d6a3f7e2c8b5d1a4f9e6c2b8d3a7f1
```

**To generate new session secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy output to `SESSION_SECRET` in `.env`

---

## Files Modified

**Backend:**
- `reports/server.js` - Added session middleware, auth endpoints, requireAuth middleware
- `reports/package.json` - Added express-session dependency
- `reports/.env` - Added ACCESS_PASSWORD and SESSION_SECRET

**Frontend:**
- `reports/detlogv3.html` - Added password overlay, auth state, login/logout handlers

**Documentation:**
- `reports/.env.example` - Template with new variables
- `reports/AUTH_SETUP.md` - This file

---

## Next Steps

After authentication is working:

1. ✅ Test login with correct password
2. ✅ Test failed login with wrong password
3. ✅ Test logout button
4. ✅ Share URL + password with teammate
5. ✅ Verify teammate can access
6. ⬜ Optional: Enable HTTPS-only cookies
7. ⬜ Optional: Add password hashing
8. ⬜ Optional: Add rate limiting

---

## Support

**If you encounter issues:**
1. Check this guide's troubleshooting section
2. Check server terminal for error messages
3. Check browser console (F12) for errors
4. Try restarting server and tunnel
5. Verify .env file has correct values

**Quick test commands:**
```bash
# Test auth check endpoint
curl http://localhost:3000/api/auth/check

# Test login endpoint
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"password\":\"@LN-c0nn3ct\"}"
```

---

**Password:** `@LN-c0nn3ct` (don't forget to share securely!)
