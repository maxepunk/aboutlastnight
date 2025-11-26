# Feedback Form Setup Guide

This guide walks you through setting up the post-show feedback form system.

## Overview

The feedback system collects post-show responses from attendees:
- Memorable moments
- NPS (Net Promoter Score) rating
- Improvement suggestions
- Optional email opt-in for future updates

**Form URL:** `https://aboutlastnightgame.com/feedback.html?date=MMDD`

The `?date=` parameter pre-selects the session date (e.g., `?date=1123` for November 23).

---

## Setup Steps

### 1. Create Google Sheet

1. Go to [Google Sheets](https://sheets.google.com)
2. Create a new spreadsheet named "ALN Feedback Responses"
3. Add these column headers in row 1:

| A | B | C | D | E | F | G | H | I | J |
|---|---|---|---|---|---|---|---|---|---|
| Timestamp | Session Date | Session Date Full | Memorable Moment | NPS Score | Improvement | Email | Email Consent | User Agent | Referrer |

- **Session Date** = MMDD format (e.g., "1123") — matches report naming
- **Session Date Full** = YYYY-MM-DD format (e.g., "2025-11-23") — human readable

4. Save the spreadsheet

### 2. Deploy Google Apps Script

1. In your Google Sheet, go to **Extensions → Apps Script**
2. Delete any default code in the editor
3. Copy the entire contents of `FEEDBACK_GOOGLE_SCRIPT.js` from this repo
4. Paste into the Apps Script editor
5. **Configure the organizer email** (line 17):
   ```javascript
   const ORGANIZER_EMAIL = 'your-email@example.com';
   ```
6. Click **Save** (Ctrl+S)
7. Click **Deploy → New deployment**
8. Configure:
   - Type: **Web app**
   - Description: "Feedback form handler"
   - Execute as: **Me**
   - Who has access: **Anyone**
9. Click **Deploy**
10. **Copy the Web App URL** - you'll need this for the next step

### 3. Update Frontend Configuration

1. Open `js/feedback-interactions.js`
2. Find the `FEEDBACK_ENDPOINT` constant (around line 20)
3. Replace the placeholder with your Web App URL:
   ```javascript
   const FEEDBACK_ENDPOINT = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
   ```
4. Save and commit the change

## Usage

### Email Integration

In your post-show email, include the feedback link with the date parameter:

```
https://aboutlastnightgame.com/feedback.html?date={{MMDD}}
```

Where `{{MMDD}}` is the show date variable from your email system (e.g., `1123` for November 23).

### Checking Responses

1. Open your Google Sheet to see all submissions
2. Organizer email notifications are sent for each submission (configurable)

### Notification Settings

In `FEEDBACK_GOOGLE_SCRIPT.js`, you can configure:

```javascript
// Receive email for every submission
const SEND_NOTIFICATIONS = true;

// Only receive email for low NPS scores (1-6)
const ONLY_NOTIFY_LOW_SCORES = false;
```

---

## Testing

### Local Development

1. Open `feedback.html` in a browser
2. The form will work but won't submit (endpoint not configured shows simulated success)
3. Test URL parameter: `feedback.html?date=1123`

### Full Testing

1. Deploy to GitHub Pages
2. Visit: `https://aboutlastnightgame.com/feedback.html?date=1123`
3. Submit a test response
4. Verify:
   - Data appears in Google Sheet
   - Organizer notification received (if enabled)
   - Success message displays on form

---

## Troubleshooting

### Form submits but no data in sheet

1. Check Apps Script deployment is "Anyone" access
2. Verify the endpoint URL in `feedback-interactions.js` is correct
3. Check Apps Script execution logs: **Apps Script → Executions**

### URL parameter not pre-filling date

1. Verify the URL parameter is 4 digits (MMDD format, e.g., `1123`)
2. Check browser console for JavaScript errors
3. The date picker expects valid dates — invalid MMDD values will be ignored

### Not receiving notification emails

1. Check `ORGANIZER_EMAIL` is set correctly in Apps Script
2. Verify `SEND_NOTIFICATIONS = true`
3. Check spam folder
4. Check Apps Script execution logs for email errors

---

## File Structure

```
├── feedback.html                    # Form page
├── css/feedback.css                 # Form styles
├── js/feedback-interactions.js      # Frontend logic (URL params, submission)
├── FEEDBACK_GOOGLE_SCRIPT.js        # Backend (copy to Apps Script)
└── FEEDBACK_SETUP_GUIDE.md          # This file
```

---

## Updating the Backend

If you modify `FEEDBACK_GOOGLE_SCRIPT.js`:

1. Copy the updated code
2. Paste into Google Apps Script editor
3. **Deploy → Manage deployments → Edit**
4. Change version to **New version**
5. Click **Deploy**

Note: The URL stays the same when updating an existing deployment.

---

## Analytics & Reporting

### NPS Calculation

Net Promoter Score is calculated as:
- **Promoters (9-10):** Likely to recommend
- **Passives (7-8):** Satisfied but not enthusiastic
- **Detractors (0-6):** Unlikely to recommend

**NPS = % Promoters - % Detractors**

### Data Export

Export feedback data from Google Sheets:
- **File → Download → CSV** for spreadsheet analysis
- Filter by session date to analyze specific shows
- Use NPS Score column for quantitative analysis
