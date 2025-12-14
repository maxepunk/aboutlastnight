# Email Sending Workflow - Visual Guide

## The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    YOUR BOOKING SYSTEM                          │
│  Aisha Krieger                                                  │
│  aishakrieger@gmail.com                                         │
│  Maya Kaczorowski                                               │
│  maya.kacz@gmail.com                                            │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Copy/Paste
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              SMART EMAIL SENDER SCRIPT                          │
│  1. Parse names & emails                                        │
│  2. Get session date (1204)                                     │
│  3. Generate report ID (1204, 12042, etc.)                      │
│  4. Load HTML template                                          │
│  5. Personalize each email                                      │
└─────────────────────────────┬───────────────────────────────────┘
                              │ SMTP Connection
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  GMAIL SMTP SERVER                              │
│  smtp.gmail.com:587                                             │
│  - Authenticates with app password                              │
│  - Encrypts connection (TLS)                                    │
│  - Sends to recipients                                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Email Delivery
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              RECIPIENTS' INBOXES                                │
│  ✓ Personalized case file link                                 │
│  ✓ Session-specific feedback form                              │
│  ✓ Reply-To configured                                         │
└─────────────────────────────────────────────────────────────────┘
```

## Configuration Points

```
┌──────────────────────────┐
│ YOUR CONFIGURATION       │
├──────────────────────────┤
│ SENDER_EMAIL            │──→ Your StoryPunk email
│ SENDER_PASSWORD         │──→ App password (16 chars)
│ REPLY_TO_EMAIL          │──→ Where replies go
│ SENDER_NAME             │──→ "Max & Shuai"
└──────────────────────────┘
              ↓
┌──────────────────────────┐
│ What Recipients See:     │
├──────────────────────────┤
│ From: Max & Shuai        │
│       <max@...>          │
│                          │
│ Reply goes to:           │
│       info@...           │
└──────────────────────────┘
```

## Authentication Flow

```
┌────────────┐
│ Your Script│
└─────┬──────┘
      │ 1. Connect to smtp.gmail.com:587
      ↓
┌─────────────────┐
│   Gmail Server  │
└─────┬───────────┘
      │ 2. "STARTTLS" - Upgrade to encrypted
      ↓
┌─────────────────┐
│  TLS Encrypted  │
│    Connection   │
└─────┬───────────┘
      │ 3. "AUTH LOGIN" + credentials
      ↓
┌─────────────────┐
│  Gmail Server   │
│  ✓ Authenticated│
└─────┬───────────┘
      │ 4. Send emails
      ↓
┌─────────────────┐
│  Recipients     │
└─────────────────┘
```

## Data Transformation

```
INPUT (Booking System):
┌───────────────────────┐
│ Aisha Krieger         │
│ aishakrieger@gmail.com│
│ brian benson          │
│ bensonbj@gmail.com    │
└───────────────────────┘
         ↓ Parse & Normalize
OUTPUT (Script):
┌───────────────────────────────────────┐
│ Name: "Aisha Krieger"                 │
│ Email: "aishakrieger@gmail.com"       │
│ Session: "1204"                       │
│ Report: "1204"                        │
│ Case File: "...reports/report1204..."│
│ Feedback: "...feedback?date=1204"     │
├───────────────────────────────────────┤
│ Name: "Brian Benson"                  │← Capitalized!
│ Email: "bensonbj@gmail.com"          │← Lowercase!
│ Session: "1204"                       │
│ Report: "1204"                        │
│ Case File: "...reports/report1204..."│
│ Feedback: "...feedback?date=1204"     │
└───────────────────────────────────────┘
```

## Multiple Sessions Per Day

```
Session 1 (2:00 PM)
├─ Session Date: 1204
├─ Report ID: 1204
└─ File: recipients_1204_1204.csv

Session 2 (7:00 PM)
├─ Session Date: 1204
├─ Report ID: 12042  ← Note the '2'
└─ File: recipients_1204_12042.csv

Session 3 (9:00 PM)
├─ Session Date: 1204
├─ Report ID: 12043  ← Note the '3'
└─ File: recipients_1204_12043.csv
```

## Email Structure (MIME)

```
┌─────────────────────────────────────────┐
│ Email Headers                           │
├─────────────────────────────────────────┤
│ From: Max & Shuai <max@storypunk.com>  │
│ To: aishakrieger@gmail.com              │
│ Reply-To: info@storypunk.com            │
│ Subject: Thank you for playing...       │
│ Content-Type: multipart/alternative     │
└───────────┬─────────────────────────────┘
            │
            ├─→ Part 1: Plain Text
            │   └─ "Hey Aisha, First of all..."
            │
            └─→ Part 2: HTML
                └─ "<html><body>..."
                   └─ Beautiful formatting
                   └─ Styled buttons
                   └─ Brand colors
```

## Rate Limiting Strategy

```
Gmail Free Account (500/day)

Your typical day:
┌────────────────────────────────┐
│ 2:00 PM Session - 8 players   │──→ 8 emails
│ 7:00 PM Session - 10 players  │──→ 10 emails
└────────────────────────────────┘
Total: 18 emails/day
Status: ✓ Well within limits!

Script includes 1-second delay:
Email 1 → wait 1s → Email 2 → wait 1s → Email 3
(Keeps Gmail happy)
```

## Error Handling

```
┌─────────────────────┐
│ Email Send Attempt  │
└──────────┬──────────┘
           │
           ├─→ Success? → Log ✓ → Continue
           │
           └─→ Failure? → Log ✗ → Continue anyway
                         (Don't stop whole batch)
```

## File Organization

```
your-project/
├── about_last_night_followup_template.html  ← The email template
├── send_followup_emails_smart.py            ← The script
├── SETUP_GUIDE.md                           ← Setup instructions
├── EMAIL_FUNDAMENTALS.md                    ← Deep dive
│
└── Generated files:
    ├── recipients_1204_1204.csv             ← Dec 4, session 1
    ├── recipients_1204_12042.csv            ← Dec 4, session 2
    └── recipients_1205_1205.csv             ← Dec 5, session 1
```

## Security Flow

```
┌──────────────────────┐
│ App Password         │ ← Not your real password!
│ (16 random chars)    │ ← Can be revoked anytime
└──────────┬───────────┘
           │ Stored in script
           ↓
┌──────────────────────┐
│ TLS Encrypted        │ ← Encrypted in transit
│ Connection           │
└──────────┬───────────┘
           │ SMTP AUTH
           ↓
┌──────────────────────┐
│ Gmail Verifies       │ ← Server checks credentials
└──────────┬───────────┘
           │ Authorized ✓
           ↓
┌──────────────────────┐
│ Can Send Email       │
└──────────────────────┘
```

## Quick Reference: From vs Reply-To

```
Configuration:
┌───────────────────────────────────┐
│ SENDER_EMAIL = "max@storypunk.com"│
│ REPLY_TO = "info@storypunk.com"   │
└───────────────────────────────────┘

Recipient sees:
┌───────────────────────────────────┐
│ From: Max & Shuai                 │
│       max@storypunk.com           │
└───────────────────────────────────┘

Recipient clicks Reply:
┌───────────────────────────────────┐
│ To: info@storypunk.com           │← Goes here!
└───────────────────────────────────┘

Why? Shared inbox for customer service!
```

## Testing Strategy

```
┌──────────────────────┐
│ 1. Dry Run Mode      │─→ Shows what WOULD happen
└──────────┬───────────┘  (No actual sends)
           │
           ↓ Looks good?
┌──────────────────────┐
│ 2. Send to Yourself  │─→ Test one real email
└──────────┬───────────┘
           │
           ↓ Check formatting?
┌──────────────────────┐
│ 3. Small Test Batch  │─→ 2-3 emails to test accounts
└──────────┬───────────┘
           │
           ↓ All good?
┌──────────────────────┐
│ 4. Production Send   │─→ Send to real customers
└──────────────────────┘
```
