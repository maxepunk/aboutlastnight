# Email Sending with Python - Technical Fundamentals

## 1. How Email Sending Works

### The Email Journey
```
Your Script → SMTP Server → Recipient's Mail Server → Recipient's Inbox
   (Python)    (Gmail/etc)      (Their provider)        (They see it)
```

### Key Protocols

**SMTP (Simple Mail Transfer Protocol)**
- The "postal service" of the internet for sending email
- Your script connects to an SMTP server (like Gmail's smtp.gmail.com)
- Port 587: Standard for TLS-encrypted connections (what we use)
- Port 465: Alternative SSL port
- Port 25: Unencrypted (avoid this)

**TLS/SSL**
- Encryption that protects your password and email content in transit
- `server.starttls()` upgrades the connection to encrypted

### The Authentication Flow

```python
# 1. Connect to SMTP server
with smtplib.SMTP('smtp.gmail.com', 587) as server:
    
    # 2. Say "hello" and upgrade to encrypted connection
    server.starttls()
    
    # 3. Authenticate (prove you're allowed to send)
    server.login('your-email@gmail.com', 'your-app-password')
    
    # 4. Send the message
    server.send_message(msg)
    
# 5. Connection closes automatically (the 'with' statement)
```

### Why App Passwords?

Modern email providers (Gmail, Outlook) require "App Passwords" instead of your regular password:

**Security Reasons:**
- Your real password isn't stored in scripts
- You can revoke app passwords without changing your main password
- Each app gets its own password (better tracking)

**How to Get One (Gmail):**
1. Go to Google Account settings
2. Security → 2-Step Verification (must be enabled)
3. App passwords → Generate new
4. Select "Mail" and "Other (Custom name)"
5. Copy the 16-character password

**How to Get One (Outlook/Microsoft):**
1. Go to account.microsoft.com
2. Security → Advanced security options
3. App passwords → Create new
4. Copy and use in script

### The Email Message Structure

An email has two main parts:

**Headers** (metadata about the email)
```python
msg['From'] = 'Max <max@storypunk.com>'
msg['To'] = 'recipient@example.com'
msg['Subject'] = 'Thank you for playing'
msg['Reply-To'] = 'info@storypunk.com'  # Where replies go
```

**Body** (the actual content)
```python
# Can have multiple parts:
# 1. Plain text version (fallback for old email clients)
# 2. HTML version (pretty formatting)
# 3. Attachments (optional)
```

### MIME (Multipurpose Internet Mail Extensions)

MIME allows emails to contain multiple content types:

```python
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# Create container
msg = MIMEMultipart('alternative')  # 'alternative' = try HTML, fallback to text

# Add plain text version
text_part = MIMEText("Plain text content", 'plain')
msg.attach(text_part)

# Add HTML version
html_part = MIMEText("<h1>HTML content</h1>", 'html')
msg.attach(html_part)

# Email clients will show HTML if they can, otherwise plain text
```

### Character Encoding

Emails use UTF-8 to support international characters:
```python
# This handles emoji, accented characters, etc.
html_content = "<p>Thanks for playing! 🎭</p>"
part = MIMEText(html_content, 'html', 'utf-8')
```

## 2. From and Reply-To Configuration

### The From Header

**Format Options:**
```python
# Option 1: Just email
msg['From'] = 'max@storypunk.com'
# Shows as: max@storypunk.com

# Option 2: Name + email (recommended)
msg['From'] = 'Max & Shuai <max@storypunk.com>'
# Shows as: Max & Shuai

# Option 3: Using formataddr for special characters
from email.utils import formataddr
msg['From'] = formataddr(('StoryPunk™ Team', 'max@storypunk.com'))
```

**Important:** The From address must match (or be authorized by) your SMTP login email.

### Authentication vs Display

```python
# What you LOG IN with (authentication)
server.login('max@storypunk.com', 'app-password')

# What RECIPIENTS SEE (display)
msg['From'] = 'Max & Shuai - StoryPunk <max@storypunk.com>'

# These must be related! You can't login with Gmail and send "from" Microsoft.
```

### The Reply-To Header

This controls where replies go (can be different from From):

```python
msg['From'] = 'Max & Shuai <max@storypunk.com>'
msg['Reply-To'] = 'info@storypunk.com'

# Now when someone hits "Reply", it goes to info@storypunk.com
# Useful for shared inboxes or different handling addresses
```

**Use Cases:**
- `From`: Personal touch ("Max & Shuai")
- `Reply-To`: Shared inbox ("info@storypunk.com")
- Or: Support requests ("support@storypunk.com")

### Multiple Reply-To Addresses

```python
# Comma-separated list
msg['Reply-To'] = 'max@storypunk.com, shuai@storypunk.com'

# When recipient replies, their email client might ask which one
# or send to all (client-dependent behavior)
```

## 3. SMTP Provider Options

### Gmail
```python
SMTP_SERVER = 'smtp.gmail.com'
SMTP_PORT = 587
# Requires: App password from Google Account settings
# Limit: 500 emails/day for free accounts
# Limit: 2000 emails/day for Google Workspace
```

### Outlook/Microsoft 365
```python
SMTP_SERVER = 'smtp.office365.com'
SMTP_PORT = 587
# Requires: App password from Microsoft account
# Limit: 300 emails/day for free Outlook
# Limit: 10,000 emails/day for Microsoft 365
```

### SendGrid (Recommended for bulk)
```python
SMTP_SERVER = 'smtp.sendgrid.net'
SMTP_PORT = 587
SENDER_EMAIL = 'apikey'  # Literally the word "apikey"
SENDER_PASSWORD = 'your-sendgrid-api-key'
# Free tier: 100 emails/day
# Paid: Much higher limits + better deliverability
# Better for transactional emails
```

### Mailgun
```python
SMTP_SERVER = 'smtp.mailgun.org'
SMTP_PORT = 587
# Similar to SendGrid
# Good deliverability
# Pay-as-you-go pricing
```

## 4. Common Issues & Solutions

### "Authentication Failed"
- Wrong email/password
- Not using app password
- 2FA not enabled (required for app passwords)
- SMTP settings incorrect for provider

### "Connection Refused"
- Wrong port number
- Firewall blocking SMTP
- VPN interfering

### Emails Go to Spam
- No SPF/DKIM records (DNS settings)
- Sending too many emails too fast
- Poor sender reputation
- Use a transactional email service (SendGrid, etc.)

### Rate Limiting
- Gmail: Wait between sends (add `time.sleep(1)`)
- Use a paid service for bulk sending
- Batch across multiple days

## 5. Best Practices

### For Small Volume (< 50/day)
```python
# Use Gmail with app password
# Simple, reliable, free
# Good deliverability for personal emails
```

### For Medium Volume (50-500/day)
```python
# Use Google Workspace ($6/month)
# or SendGrid free tier
# Better limits and reliability
```

### For High Volume (500+/day)
```python
# Use SendGrid, Mailgun, or AWS SES
# Pay for what you send
# Professional deliverability
# Bounce handling
# Analytics
```

### Always Include
1. Plain text version (accessibility + spam filters)
2. Unsubscribe link (if sending marketing emails)
3. Physical address (required by CAN-SPAM for commercial email)
4. Clear subject lines
5. Rate limiting between sends

### Testing Checklist
- [ ] Send test to yourself
- [ ] Check spam folder
- [ ] Test on mobile
- [ ] Test plain text rendering (disable images)
- [ ] Verify all links work
- [ ] Check different email clients (Gmail, Outlook, Apple Mail)

## 6. Debugging

```python
# Enable debug output
import smtplib
smtplib.set_debuglevel(1)  # Shows all SMTP commands

# Or use logging
import logging
logging.basicConfig(level=logging.DEBUG)
```

This shows exactly what's happening in the SMTP conversation.
