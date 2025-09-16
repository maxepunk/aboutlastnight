# Playtest Form 403 Error Fix

## Problem Identified
The playtest form is getting a 403 (Forbidden) error while the main index.html form works fine. Both forms use identical fetch configurations, but different Google Apps Script URLs.

## Current URLs
- **Working (index.html):** `AKfycbzZ7Xep091AvDFGPADN6CzRCHJUgD0-rPEcBFsuDWEtDTNUiFJGQ_cWIlEwX8gZm8Nk2g`
- **Broken (playtest.html):** `AKfycbypIVyTqnposIYclTgLiYv3xxXkQSRXcTH7hXF3lAC6RbKSDNHOckOrE7VhO1MbGMRbQA`

## Solution: Redeploy the Playtest Script

The 403 error occurs when the Google Apps Script deployment is outdated or improperly configured. Even though the settings show "Anyone" access, the deployment needs to be updated.

### Steps to Fix:

1. **Open your Playtest Google Apps Script**
   - Go to your Google Sheet for playtests
   - Click Extensions → Apps Script

2. **Create a NEW Deployment**
   - Click the blue **Deploy** button
   - Select **Manage Deployments**
   - Click **Create Deployment** (the pencil icon)
   - **IMPORTANT:** Select "New deployment" NOT "Edit"

3. **Configure the New Deployment**
   - **Type:** Web app
   - **Description:** Playtest Signup Handler v2
   - **Execute as:** Me (your email)
   - **Who has access:** Anyone ✓ (CRITICAL)
   - Click **Deploy**

4. **Copy the New Web App URL**
   - You'll get a new URL like:
   ```
   https://script.google.com/macros/s/AKfycb[NEW-ID-HERE]/exec
   ```
   - Copy the ENTIRE URL

5. **Update playtest.html**
   - Replace line 497 with your new URL:
   ```javascript
   const GOOGLE_SCRIPT_URL = 'YOUR-NEW-URL-HERE';
   ```

## Why This Happens
Google Apps Script deployments can become "stale" when:
- The script is edited but not redeployed
- Permissions change
- The deployment ID gets invalidated
- Google's security updates affect older deployments

Creating a NEW deployment (not editing the existing one) ensures a fresh, working endpoint.

## Test After Fix
1. Open playtest.html in browser
2. Submit test registration
3. Check browser console - no 403 errors
4. Verify data appears in Google Sheet
5. Check for confirmation email