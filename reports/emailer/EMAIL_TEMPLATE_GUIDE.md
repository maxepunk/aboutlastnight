# About Last Night - Email Template Guide

## Quick Start

This template has three placeholders you need to replace before sending:

1. **{{PLAYER_NAME}}** - Replace with the recipient's first name
2. **{{CASE_FILE_URL}}** - Replace with the specific case file URL for their session
3. **{{FEEDBACK_FORM_URL}}** - Replace with the feedback form URL (can include session date parameter)

## How to Use This Template

### Option 1: Manual Email (Gmail, Outlook, etc.)

**Best for: Individual or small batch sends**

1. Open `about_last_night_followup_template.html` in a text editor
2. Do a Find & Replace for each placeholder:
   - Find: `{{PLAYER_NAME}}` Replace with: `Sarah`
   - Find: `{{CASE_FILE_URL}}` Replace with: `https://aboutlastnightgame.com/reports/report1204.html`
   - Find: `{{FEEDBACK_FORM_URL}}` Replace with: `https://aboutlastnightgame.com/feedback.html?date=1204`
3. Open the edited file in a web browser
4. Select all (Ctrl+A / Cmd+A) and copy
5. In Gmail/Outlook, compose new email and paste
6. The formatting should be preserved!

### Option 2: Mailchimp / Email Service

**Best for: Batch sends to multiple people**

1. In Mailchimp, create a new campaign
2. Choose "Code your own" template
3. Paste the entire HTML
4. Use Mailchimp's merge tags instead:
   - Replace `{{PLAYER_NAME}}` with `*|FNAME|*`
   - Replace `{{CASE_FILE_URL}}` with `*|CASE_FILE_URL|*`
   - Replace `{{FEEDBACK_FORM_URL}}` with `*|FEEDBACK_URL|*`
5. Upload your recipient list with these custom fields

### Option 3: Python Script (Automated)

**Best for: Automated sends with personalized data**

I can create a Python script that:
- Reads recipient data from a CSV
- Generates personalized emails
- Sends via SMTP or email service API

Let me know if you want this option!

## Testing Your Email

1. **Browser Preview**: Open the HTML file directly in a browser to see how it looks
2. **Test Send**: Always send a test to yourself first
3. **Check on Mobile**: Forward the test to your phone to verify mobile display

## Customization Tips

### Change Colors
- Header background: `#740707` (dark red)
- Button background: `#8C0407` (burgundy red)  
- Body background: `#1F1F1F` (dark gray)
- Main background: `#000000` (black)

### Add More Content
Add new sections following this pattern:
```html
<tr>
    <td style="padding: 16px 40px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
                <td style="color:#ffffff; font-size:16px; line-height:1.5; font-family:Arial, sans-serif">
                    Your new content here
                </td>
            </tr>
        </table>
    </td>
</tr>
```

## Common Issues

**Problem**: Email looks plain/unstyled
**Solution**: Your email client might strip styles. Try copying from browser instead of text editor.

**Problem**: Images don't load
**Solution**: Make sure you're using the full URLs (starting with https://)

**Problem**: Buttons don't work
**Solution**: Check that your URLs include `https://` at the beginning

## Need Help?

Let me know if you need:
- A batch sending script
- Different placeholder fields
- Modified layout/design
- Integration with your email service
