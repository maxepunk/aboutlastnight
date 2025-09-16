# Playtest Signup Setup Guide

## Step 1: Set Up Your Google Sheet

1. Create a new Google Sheet for playtest signups
2. Add these headers in Row 1:
   - **Column A:** Name
   - **Column B:** Email
   - **Column C:** Timestamp
   - **Column D:** Spot Number
   - **Column E:** Status

## Step 2: Set Up Google Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any existing code
3. Copy all the code from `PLAYTEST_GOOGLE_SCRIPT.js`
4. **IMPORTANT: Replace these values:**
   - Line 93: Replace `YOUR-EMAIL@EXAMPLE.COM` with your email address
   - Line 103: Replace `YOUR-SHEET-URL` with your Google Sheet URL

## Step 3: Deploy as Web App

1. Click **Deploy → New Deployment**
2. Settings:
   - **Type:** Web app
   - **Description:** About Last Night Playtest Signup
   - **Execute as:** Me
   - **Who has access:** Anyone
3. Click **Deploy**
4. Copy the Web app URL (looks like: `https://script.google.com/macros/s/AKfycbx.../exec`)

## Step 4: Update the Playtest HTML

1. Open `playtest.html`
2. Find line ~469:
   ```javascript
   const GOOGLE_SCRIPT_URL = 'YOUR-PLAYTEST-SCRIPT-URL-HERE';
   ```
3. Replace with your Web app URL from Step 3

## Step 5: Test the System

1. Open `playtest.html` in a browser
2. Submit a test registration
3. Verify:
   - Data appears in your Google Sheet
   - You receive a confirmation email
   - Spot counter decreases

## Features Implemented

### For Participants:
- **Spot Counter:** Shows remaining spots with visual warnings
  - Green: Normal (6+ spots)
  - Yellow: Warning (4-5 spots)
  - Red/Pulsing: Critical (1-3 spots)
  - Gray: Full (0 spots)
- **Confirmation Emails:** 
  - Confirmed participants get spot number and details
  - Waitlist participants get their position
- **Real-time Updates:** Form disables when full

### For Organizers:
- **Alert Emails:** You get notified when there are 5, 3, 2, and 1 spots left
- **Automatic Waitlist:** After 20 signups, people go on waitlist
- **Data Tracking:** Each signup gets timestamped and numbered

## Customization Options

### Change Alert Thresholds
In the Google Script, line 93-94, modify the condition:
```javascript
if (spotsTaken === 15 || spotsTaken === 17 || spotsTaken === 19 || spotsTaken === 20)
```

### Change Total Spots
Update these locations:
- Google Script line 13: `const spotsTotal = 20;`
- playtest.html line 471: `let spotsRemaining = 20;`

### Modify Email Templates
Edit the HTML in the Google Script:
- Lines 32-87: Confirmation email
- Lines 89-118: Waitlist email

## Important Notes

1. **Spot Tracking:** Currently uses client-side counting. In production, you might want to:
   - Add a function to check actual sheet count on page load
   - Use the `doGet` function to fetch real spot count

2. **Security:** The current setup is fine for friends & family playtest. For public use:
   - Add rate limiting
   - Add duplicate email checking
   - Add CAPTCHA

3. **Email Limits:** Google has daily email limits:
   - 100 emails/day for consumer accounts
   - 1,500 emails/day for Google Workspace

## Testing Checklist

- [ ] Form submission works
- [ ] Data appears in Google Sheet
- [ ] Confirmation email received
- [ ] Spot counter decrements
- [ ] Form disables at 0 spots
- [ ] Alert emails trigger at thresholds
- [ ] Waitlist functionality works after 20 signups
- [ ] Mobile responsive design works
- [ ] Error handling works (try with script URL not set)