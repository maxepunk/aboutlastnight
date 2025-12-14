# Smart Email Sender - Setup Guide

## Quick Start (5 minutes)

### Step 1: Get Your App Password

**For Gmail:**
1. Go to your Google Account: https://myaccount.google.com/
2. Click "Security" in the left sidebar
3. Enable "2-Step Verification" (if not already enabled)
4. Scroll to "App passwords" (appears after 2FA is enabled)
5. Click "App passwords"
6. Select app: "Mail"
7. Select device: "Other" → Name it "About Last Night Sender"
8. Click "Generate"
9. Copy the 16-character password (example: `abcd efgh ijkl mnop`)
10. Save this - you'll paste it into the script

**For Outlook/Microsoft:**
1. Go to: https://account.microsoft.com/security
2. Click "Advanced security options"
3. Scroll to "App passwords"
4. Click "Create a new app password"
5. Copy the password
6. Save this - you'll paste it into the script
rsdx hdmi vqvp lgvk

### Step 2: Configure the Script

Open `send_followup_emails_smart.py` in a text editor and update these lines:

```python
# Line ~20-24: Update these three values
SENDER_EMAIL = "max@storypunk.com"        # Your actual email
SENDER_PASSWORD = "abcd efgh ijkl mnop"   # Your 16-char app password
REPLY_TO_EMAIL = "info@storypunk.com"     # Where replies should go
```

**Options for REPLY_TO_EMAIL:**
- Same as SENDER_EMAIL: Replies come back to you
- Different email: Replies go to a shared inbox or different address
- Multiple addresses: `"max@storypunk.com, shuai@patchworkadventures.com"`

### Step 3: Run the Script

```bash
# Make sure you're in the directory with the files
cd /path/to/email-files

# Run the script
python3 send_followup_emails_smart.py
```

### Step 4: Follow the Prompts

The script will walk you through:

1. **Enter session date** (MMDD format)
   ```
   Enter session date (MMDD format, e.g., 1204 for Dec 4): 1204
   ```

2. **Select session number** (if multiple that day)
   ```
   Is this the first session of the day?
     1 = First session (report ID: 1204)
     2 = Second session (report ID: 12042)
     3 = Third session (report ID: 12043)
   Enter session number [1]: 1
   ```

3. **Paste your booking data**
   ```
   Paste data below, then press Enter twice:
   [Paste your list here]
   [Press Enter twice when done]
   ```

4. **Review and confirm**
   - Script shows you a preview
   - Does a dry run (no actual sends)
   - Asks for final confirmation
   - Sends the emails!

## Your Booking Data Format

The script handles this format automatically:
```
Aisha Krieger
aishakrieger@gmail.com
Maya Kaczorowski
maya.kacz@gmail.com
Brandon Weeks
me@brandonweeks.com
```

**It automatically:**
- Parses alternating name/email lines
- Capitalizes names properly ("brian benson" → "Brian Benson")
- Normalizes emails to lowercase
- Validates email format
- Handles any spacing inconsistencies

## Advanced Configuration

### Change Email Provider

**Gmail (default):**
```python
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
```

**Outlook/Microsoft 365:**
```python
SMTP_SERVER = "smtp.office365.com"
SMTP_PORT = 587
```

**SendGrid (for high volume):**
```python
SMTP_SERVER = "smtp.sendgrid.net"
SMTP_PORT = 587
SENDER_EMAIL = "apikey"  # Literally "apikey"
SENDER_PASSWORD = "your-sendgrid-api-key"
```

### Adjust Sending Speed

```python
DELAY_BETWEEN_EMAILS = 1  # seconds

# Slower (safer for large batches):
DELAY_BETWEEN_EMAILS = 2

# Faster (if your provider allows):
DELAY_BETWEEN_EMAILS = 0.5
```

### Save Records

```python
SAVE_CSV = True  # Saves to recipients_MMDD_reportid.csv

# Output example:
# recipients_1204_1204.csv
# recipients_1204_12042.csv (second session)
```

## Troubleshooting

### "Authentication Failed"
**Problem:** Wrong email or password
**Solution:**
1. Double-check SENDER_EMAIL matches your account
2. Verify you're using the App Password, not your regular password
3. Make sure 2FA is enabled (required for App Passwords)

### "Connection Refused"
**Problem:** SMTP settings incorrect or firewall blocking
**Solution:**
1. Verify SMTP_SERVER and SMTP_PORT for your provider
2. Check if your network/VPN blocks SMTP
3. Try port 465 instead of 587 (some networks)

### Emails Go to Spam
**Problem:** Email authentication or reputation issues
**Solutions:**
1. Send test to yourself first - check spam folder
2. For high volume, use SendGrid/Mailgun instead of Gmail
3. Set up SPF/DKIM records for your domain (advanced)

### "Invalid Email" Warnings
**Problem:** Booking system has malformed email
**Solution:**
1. Script will warn you but continue
2. Review the preview - manually fix in the list
3. Or edit the CSV file that's saved

### Rate Limiting
**Problem:** Sending too many too fast
**Gmail limits:**
- Personal: 500/day
- Workspace: 2000/day

**Solutions:**
1. Increase DELAY_BETWEEN_EMAILS
2. Batch across multiple days
3. Use SendGrid for higher limits

## Testing Checklist

Before sending to real customers:

- [ ] Send test email to yourself
- [ ] Verify links work (case file, feedback form)
- [ ] Check mobile display (forward to your phone)
- [ ] Verify reply goes to correct address
- [ ] Check spam folder
- [ ] Test with a small batch (2-3 emails) first

## Daily Workflow

Your typical send process:

1. Get booking confirmation email/dashboard export
2. Copy the name/email list
3. Run script: `python3 send_followup_emails_smart.py`
4. Enter session date (e.g., `1204`)
5. Paste booking data
6. Review preview
7. Confirm and send
8. Check saved CSV for records

**Time:** ~2 minutes per session

## Files Generated

The script creates:
- `recipients_MMDD_reportid.csv` - Record of who was sent what
- Console output - Success/failure log (you can copy/paste for records)

## Email Sending Limits

**Gmail Personal:** 500 emails/day
**Gmail Workspace:** 2,000 emails/day
**Outlook Personal:** 300 emails/day
**Microsoft 365:** 10,000 emails/day
**SendGrid Free:** 100 emails/day
**SendGrid Paid:** 40,000+ emails/month

**Your needs:** Assuming 8-10 people/session × 2 sessions/day = ~20 emails/day
→ Gmail is perfectly fine!

## Need Help?

Common issues and solutions are in the Troubleshooting section above.

The script includes detailed error messages that will guide you to the solution.
