# Smart Email Sender - Setup Guide

Sends personalized "thank you for playing" follow-up emails to a session's players:
the unique NovaNews case-file link, the feedback form, a return-visit promo code, and
(optionally) a personal note and resized session photos.

**Script:** `send_followup_emails_smart.py` · **Sends from:** `about.last.night.game@gmail.com`

---

## One-Time Setup

### Step 1: Get a Gmail App Password

The account `about.last.night.game@gmail.com` needs an **app password** (a 16-character
password just for this script — not the account's normal login password). App passwords
require **2-Step Verification** to be enabled on the account.

1. Sign in to **about.last.night.game@gmail.com**.
2. Go to **https://myaccount.google.com/apppasswords** (if it says the page isn't
   available, 2-Step Verification isn't on yet — enable it under Security first).
3. If an old app password is listed (e.g. "About Last Night Sender"), **delete it** with
   the trash icon — that instantly revokes it. (Do this any time a password may have
   leaked.)
4. Under **App name**, type something like `ALN Emailer`, then click **Create**.
   *(Google's current UI only asks for a name. Older guides mention "select Mail / select
   device" dropdowns — those are gone.)*
5. Google shows a 16-character password once, in four groups of four
   (e.g. `abcd efgh ijkl mnop`). **Copy it now** — you can't see it again.

### Step 2: Give the Password to the Script (never hardcode it)

**The app password is never stored in the script — this repo is public.** At startup the
script looks for it in this order: a local **`.env`** file, then the `ALN_GMAIL_APP_PASSWORD`
environment variable, and if neither is set it just prompts you (`Gmail app password:`) each
run.

**Recommended — a local `.env` file.** This keeps the secret in one gitignored file that only
this script reads, instead of setting it machine-wide. From the emailer folder:

```
cd C:\Users\spide\Documents\claudecode\aboutlastnight\reports\emailer
copy .env.example .env
```

Open `.env` in a text editor and set the value to your 16-character app password (spaces
removed):

```
ALN_GMAIL_APP_PASSWORD=your16charpassword
```

That's it — the script loads `.env` automatically. It's gitignored (`.gitignore` line 20) and
must **never** be committed. (`.env.example` is the safe, committed template.)

**Alternatives:**
- **Machine-wide (Windows `setx`)** — persists in the registry and is exposed to *every*
  process you run, so a scoped `.env` is usually better. If you want it anyway:
  `setx ALN_GMAIL_APP_PASSWORD "your16charpassword"`, then open a **new** terminal. A variable
  set this way overrides `.env`.
- **One session only** (PowerShell, in the window you'll run the script from):
  `$env:ALN_GMAIL_APP_PASSWORD = "your16charpassword"`
- **Just type it** at the `Gmail app password:` prompt each run — nothing is stored anywhere.

### Step 3 (optional): Install Pillow for Photo Attachments

Only needed if you want to attach session photos. Without it, the script still runs and just
skips the photo step.

```
pip install Pillow
```

### Sender settings (already configured — change only if needed)

These are set near the top of `send_followup_emails_smart.py` and normally need no edits:

```python
SENDER_EMAIL   = "about.last.night.game@gmail.com"   # the account the app password belongs to
REPLY_TO_EMAIL = "about.last.night@gmail.com"        # where replies land
SENDER_NAME    = "Max & Shuai"                        # display name on the From line
```

---

## Running It

```
cd C:\Users\spide\Documents\claudecode\aboutlastnight\reports\emailer
python send_followup_emails_smart.py
```

**Run it from the `emailer` folder** — it loads `about_last_night_followup_template.html` by
relative path and writes the record CSV into the current directory. (Running it as
`python emailer/send_followup_emails_smart.py` from elsewhere will fail to find the template.)

The script is fully interactive — it has **no command-line flags**. It walks you through:

1. **Session date** — `MMDDYY` format (6 digits), e.g. `122725` for Dec 27, 2025.
   *(Not MMDD. Year must be 25–30.)*
2. **Session number** — `1`, `2`, or `3` for that day. This sets the report ID used in the
   case-file link:
   - 1st session → report ID = the date (e.g. `122725` → `report-122725.html`)
   - 2nd/3rd → date + the number (e.g. `1227252`, `1227253`)
3. **Paste booking data** — the name/email list, then press **Enter twice**.
4. **Session note (optional)** — a personal note appended after the signoff. Paste it and
   press Enter twice, or press Enter once immediately to skip.
5. **Session photos (optional)** — paste a folder path (Explorer "Copy as path" works, quotes
   are stripped) to attach photos, or press Enter to skip. Images are auto-resized (max
   1600px, JPEG) and it warns if the total exceeds 20 MB (Gmail's hard limit is 25 MB).
6. **Preview** — shows the full email body (using the first recipient), the recipient list,
   and any photo attachments.
7. **"Does this look correct?"** — type `yes` to continue.
8. A **dry run** prints who it *would* send to (no emails sent yet).
9. **"Send for real?"** — type `yes` to actually send. It authenticates and sends, pausing
   ~1 second between emails.

A record is saved to `recipients_<date>_<reportid>.csv` in the emailer folder.

### Booking data format

Alternating lines of name then email:

```
Aisha Krieger
aishakrieger@gmail.com
Maya Kaczorowski
maya.kacz@gmail.com
```

The script capitalizes names, lowercases emails, warns on malformed addresses, and requires
an even number of lines (each name paired with an email).

### What gets sent

- **Subject:** "Thank you for playing About Last Night"
- **From:** Max & Shuai `<about.last.night.game@gmail.com>` · **Reply-To:** `about.last.night@gmail.com`
- **Case file link:** `https://aboutlastnightgame.com/reports/outputs/report-<reportid>.html`
- **Feedback link:** `https://aboutlastnightgame.com/feedback.html?date=<MMDD>`
- **Return promo code:** `ALNReturnVisit` (33% off)

---

## Troubleshooting

### It's asking me for the app password every time
No `.env` file was found and `ALN_GMAIL_APP_PASSWORD` isn't set. Create `emailer/.env` from
`.env.example` (recommended), or set the env var — see Step 2. If you used `setx`, open a
**fresh** terminal; it doesn't affect already-open ones.

### "Authentication failed" (SMTPAuthenticationError)
1. Confirm `ALN_GMAIL_APP_PASSWORD` holds the **app password**, not the account's normal
   password (`$env:ALN_GMAIL_APP_PASSWORD` to check).
2. Confirm 2-Step Verification is still on for the account (app passwords stop working if it's
   turned off).
3. If the password may have leaked, **revoke and regenerate** it (Step 1) and re-set the env
   var.

### "Template file not found"
You're not in the `emailer` folder. `cd` into it first (see Running It).

### "Connection Refused"
Some networks/VPNs block SMTP. Check `SMTP_SERVER`/`SMTP_PORT` (`smtp.gmail.com:587`), or try
from a different network.

### Emails go to spam
Send a test to yourself first, and test a small batch (2–3) before a full send.

### Rate limits
Gmail personal accounts allow ~500 emails/day, which is far above a normal session (~8–20
recipients). For unusually large sends, raise `DELAY_BETWEEN_EMAILS` in the script.

---

## Security Notes

- **Never** put the app password into the script, this guide, `.env.example`, or any
  committed file — the repo is public. It belongs only in a gitignored `.env` or an
  environment variable.
- The app password is scoped to `about.last.night.game@gmail.com` and does nothing without
  2-Step Verification enabled. Revoke it any time it may have been exposed.
- The account's **2FA backup codes** are equally sensitive. Keep the
  `Backup-codes-*.txt` file **out of the repo** (it's gitignored, but don't rely on that),
  and regenerate the codes if they were ever exposed.

## Pre-send Checklist

- [ ] `emailer/.env` created (or `ALN_GMAIL_APP_PASSWORD` set, or ready to paste at the prompt)
- [ ] Report is published and live at the case-file URL for this session
- [ ] Running from the `emailer` folder
- [ ] Correct `MMDDYY` date and session number
- [ ] Preview body + recipient list look right
- [ ] Dry run looks right before typing `yes` to send
