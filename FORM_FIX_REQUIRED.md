# CRITICAL: Form Not Working - Fix Required

## The Problem
The form is failing with a 405 error because the Google Apps Script URL placeholder was never replaced.

## Current State
```javascript
const GOOGLE_SCRIPT_URL = 'YOUR-WEB-APP-URL-HERE'; // <-- THIS NEEDS YOUR ACTUAL URL
```

## How to Fix

### Step 1: Get Your Google Apps Script URL
1. Go to your Google Apps Script project
2. Click "Deploy" → "Manage deployments"
3. Copy the Web app URL (it should look like):
   ```
   https://script.google.com/macros/s/AKfycbx...long-id.../exec
   ```

### Step 2: Update the Code
Replace line 1371 in index.html:
```javascript
// REPLACE THIS:
const GOOGLE_SCRIPT_URL = 'YOUR-WEB-APP-URL-HERE';

// WITH THIS (using your actual URL):
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR-ACTUAL-DEPLOYMENT-ID/exec';
```

### Step 3: Verify Deployment Settings
Make sure your Google Apps Script deployment has:
- **Execute as:** Me
- **Who has access:** Anyone

### Step 4: Test
1. Open the website
2. Enter an email in the form
3. Submit
4. Check your Google Sheet for the new entry

## Why This Happened
During implementation, we added the form integration but left the placeholder URL. Since the site is now deployed to GitHub Pages at `maxepunk.github.io/aboutlastnight/`, it's trying to POST to a non-existent endpoint, causing the 405 error.

## Alternative: Disable Form Temporarily
If you don't have the Google Apps Script ready yet, you can temporarily disable the form by updating the submission handler to just show a message:

```javascript
// Replace the fetch call with:
console.log('Form submission disabled - Google Script not configured');
button.textContent = 'COMING SOON';
```

---

**This must be fixed before the form will work!**