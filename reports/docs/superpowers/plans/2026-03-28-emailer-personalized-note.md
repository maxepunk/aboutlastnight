# Emailer Personalized Note — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional per-session note that appears after the email signoff, entered interactively, and upgrade the preview to show the full plain text email body.

**Architecture:** Two files change. The HTML template gets a `{{PS_NOTE_BLOCK}}` placeholder after the signoff. The Python script gets a new `get_session_note()` function, updated `personalize_email()` and `create_email_message()` signatures to thread the note through, and an upgraded `preview_recipients()` that renders the full plain text body.

**Tech Stack:** Python 3, HTML email template (XHTML table-based layout)

**Spec:** `reports/docs/superpowers/specs/2026-03-28-emailer-personalized-note-design.md`

---

### Task 1: Add `{{PS_NOTE_BLOCK}}` placeholder to HTML template

**Files:**
- Modify: `reports/emailer/about_last_night_followup_template.html:182`

- [ ] **Step 1: Add placeholder after signoff block**

In `about_last_night_followup_template.html`, insert `{{PS_NOTE_BLOCK}}` as a new `<tr>` comment + placeholder between line 182 (`</tr>` closing the promo/signoff block) and line 183 (`</table>` closing the inner content table):

```html
      <!-- Session note (replaced by script, removed if empty) -->
      {{PS_NOTE_BLOCK}}
```

The placeholder sits between the closing `</tr>` of the promo code block and the `</table>` tag on what is currently line 183.

- [ ] **Step 2: Verify template still renders**

Open `about_last_night_followup_template.html` in a browser. The `{{PS_NOTE_BLOCK}}` text will be visible as raw text — that's expected. Confirm the rest of the email layout is unchanged.

- [ ] **Step 3: Commit**

```bash
git add reports/emailer/about_last_night_followup_template.html
git commit -m "feat(emailer): add PS_NOTE_BLOCK placeholder to email template"
```

---

### Task 2: Add `import html` and `get_session_note()` function

**Files:**
- Modify: `reports/emailer/send_followup_emails_smart.py:1-15` (imports)
- Modify: `reports/emailer/send_followup_emails_smart.py:166` (new function after `get_booking_data`)

- [ ] **Step 1: Add `import html` to imports**

Add `import html` after the existing `import re` on line 9:

```python
import re
import html
```

- [ ] **Step 2: Add `get_session_note()` function**

Insert after `get_booking_data()` (after line 165), before `load_template()`:

```python
def get_session_note() -> str:
    """
    Prompt user for an optional note to append after the signoff.
    Returns the note text, or empty string if skipped.
    """
    print("\n" + "="*60)
    print("SESSION NOTE (OPTIONAL)")
    print("="*60)
    print("\nAdd a note to the end of this email? (leave blank to skip)")
    print("Paste your note below, then press Enter twice:")
    print("-" * 60)

    lines = []
    empty_count = 0
    while True:
        line = input()
        if line.strip() == "":
            if not lines:
                # Immediate empty line = skip
                return ""
            empty_count += 1
            if empty_count >= 2:
                # Two consecutive blank lines = done
                break
        else:
            # If we had a single pending blank line, preserve it (paragraph break)
            for _ in range(empty_count):
                lines.append("")
            empty_count = 0
            lines.append(line)

    note = '\n'.join(lines).strip()
    if note:
        print(f"\n✓ Note added ({len(note)} chars)")
    return note
```

Two consecutive blank lines terminate input. A single blank line is preserved as a paragraph break. This matches the "press Enter twice" prompt text.

- [ ] **Step 3: Verify syntax**

```bash
python -c "import ast; ast.parse(open('reports/emailer/send_followup_emails_smart.py').read()); print('OK')"
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add reports/emailer/send_followup_emails_smart.py
git commit -m "feat(emailer): add get_session_note() for optional post-signoff note"
```

---

### Task 3: Update `personalize_email()` to handle note

**Files:**
- Modify: `reports/emailer/send_followup_emails_smart.py` — `personalize_email()` function (lines 175-183)

- [ ] **Step 1: Update function signature and body**

Replace the existing `personalize_email()` function with:

```python
def personalize_email(template: str, recipient: Dict, session_date: str, report_id: str, session_note: str = "") -> str:
    """Replace placeholders with recipient-specific data"""
    email = template
    email = email.replace("{{PLAYER_NAME}}", recipient['name'].split()[0])  # First name only
    email = email.replace("{{CASE_FILE_URL}}", f"{CASE_FILE_BASE}report-{report_id}.html")
    # Extract MMDD from MMDDYY for feedback form (first 4 digits)
    feedback_date = session_date[:4]
    email = email.replace("{{FEEDBACK_FORM_URL}}", f"{FEEDBACK_BASE}?date={feedback_date}")

    # Session note block — render HTML or remove placeholder
    if session_note:
        escaped_note = html.escape(session_note).replace('\n', '<br>')
        note_html = (
            '      <tr>\n'
            '          <td style="padding: 16px 40px;">\n'
            '              <table width="100%" border="0" cellspacing="0" cellpadding="0">\n'
            '                  <tr>\n'
            '                      <td style="color:#ffffff; font-size:16px; line-height:1.5; font-family:Arial, sans-serif">\n'
            f'                          {escaped_note}\n'
            '                      </td>\n'
            '                  </tr>\n'
            '              </table>\n'
            '          </td>\n'
            '      </tr>'
        )
        email = email.replace("{{PS_NOTE_BLOCK}}", note_html)
    else:
        email = email.replace("{{PS_NOTE_BLOCK}}", "")

    return email
```

Key details:
- `html.escape()` handles `&`, `<`, `>` characters safely
- `.replace('\n', '<br>')` converts newlines for HTML rendering
- Empty note removes the placeholder entirely (no empty `<tr>`)
- HTML block matches the styling pattern of every other content row in the template

- [ ] **Step 2: Verify syntax**

```bash
python -c "import ast; ast.parse(open('reports/emailer/send_followup_emails_smart.py').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add reports/emailer/send_followup_emails_smart.py
git commit -m "feat(emailer): personalize_email() handles session note placeholder"
```

---

### Task 4: Update `create_email_message()` to append note to plain text

**Files:**
- Modify: `reports/emailer/send_followup_emails_smart.py` — `create_email_message()` function (lines 185-227)

- [ ] **Step 1: Update function signature, replace plain text body, and append note**

Replace the entire `create_email_message()` function. The plain text body is updated to match the HTML template content (previously it was a shorter, abbreviated version). This ensures the preview in `preview_recipients()` and the actual plain text fallback are identical.

```python
def create_email_message(recipient: Dict, html_content: str, session_note: str = "") -> MIMEMultipart:
    """Create the email message with headers and content"""

    # Create message container
    msg = MIMEMultipart('alternative')

    # Set headers
    msg['From'] = formataddr((SENDER_NAME, SENDER_EMAIL))
    msg['To'] = recipient['email']
    msg['Reply-To'] = REPLY_TO_EMAIL
    msg['Subject'] = "Thank you for playing About Last Night"

    first_name = recipient['name'].split()[0]

    # Plain text version (fallback)
    # NOTE: This text must match preview_recipients() and the HTML template content.
    # If you update the email copy, update all three locations.
    text_content = f"""Hey {first_name},

First of all, thank you.

About Last Night... is a weird, ambitious thing that we've been building for over a year and a half. It's a pop-up. It's experimental. It only exists because people like you decide to show up and trust us with your precious free time. So thank you for taking a chance on a new and unusual experience. I hope it gave you something worth remembering.

And speaking of memories — there's a new NovaNews article that's just dropped, covering your investigation:

  >> {CASE_FILE_BASE}report-{recipient.get('report_id', '')}.html

This investigative article is unique to YOUR game-session. Its contents are all based on what you chose to expose publicly, and the things you chose to bury for profit. You might see threads you recognize, or pieces that fill in parts of the story that you didn't get to. It is a version of the story that could not exist without your choices and participation.

We're a small, independent show and reviews genuinely make a difference for us. If you had a good time, leaving a review on Morty would be amazing. And if you want to share photos, theories, or hot takes from the night, tag @storypunkstudio on Instagram or StoryPunk on Facebook — we love seeing your posts.

And if you've got thoughts on the experience (what worked, what didn't, how you might describe the game to a friend), it would mean the WORLD to us to have your feedback as we continue to evolve and grow our game. Use the link below or just reply to this email with your thoughts:

  >> {FEEDBACK_BASE}?date={recipient.get('feedback_date', '')}

Finally About Last Night is constantly growing and evolving and if you return, your experience of the game may be a completely new one. So we invite you to come back and play again, and bring your crew through. Here's a promo code for a 33% discount: EarlyAccessWelcomeBack — consider it a thank you for being part of the story of this experience.

Thanks again for being part of this.

Max, Shuai & Casey
StoryPunk / Patchwork Adventures"""

    if session_note:
        text_content = text_content.rstrip() + "\n\n" + session_note

    # Attach both versions
    part1 = MIMEText(text_content.strip(), 'plain', 'utf-8')
    part2 = MIMEText(html_content, 'html', 'utf-8')
    msg.attach(part1)
    msg.attach(part2)

    return msg
```

**Important:** The plain text needs the report URL and feedback URL. Since `create_email_message()` doesn't currently receive `session_date` or `report_id`, the simplest approach is to add these to the recipient dict during the send loop. Add `report_id` and `feedback_date` keys to each recipient dict before the dry run and real send loops in `main()`:

```python
# Enrich recipients with computed URLs for plain text rendering
feedback_date = session_date[:4]
for r in recipients:
    r['report_id'] = report_id
    r['feedback_date'] = feedback_date
```

This enrichment should happen once in `main()`, before the dry run loop (Task 6 will include this).

- [ ] **Step 2: Verify syntax**

```bash
python -c "import ast; ast.parse(open('reports/emailer/send_followup_emails_smart.py').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add reports/emailer/send_followup_emails_smart.py
git commit -m "feat(emailer): create_email_message() appends session note to plain text"
```

---

### Task 5: Upgrade `preview_recipients()` to show full email body

**Files:**
- Modify: `reports/emailer/send_followup_emails_smart.py` — `preview_recipients()` function (lines 258-270)

- [ ] **Step 1: Update function to render full plain text preview**

Replace the existing `preview_recipients()` with:

```python
def preview_recipients(recipients: List[Dict], session_date: str, report_id: str, session_note: str = ""):
    """Show preview of what will be sent, including full email body"""
    print("\n" + "="*60)
    print("PREVIEW")
    print("="*60)
    print(f"\nSession Date: {session_date}")
    print(f"Report ID: {report_id}")
    print(f"Recipients: {len(recipients)}")

    # Show full plain text body using first recipient as example
    # NOTE: This text must match create_email_message() and the HTML template content.
    # If you update the email copy, update all three locations.
    first = recipients[0]
    first_name = first['name'].split()[0]
    feedback_date = session_date[:4]

    text_body = f"""Hey {first_name},

First of all, thank you.

About Last Night... is a weird, ambitious thing that we've been building for over a year and a half. It's a pop-up. It's experimental. It only exists because people like you decide to show up and trust us with your precious free time. So thank you for taking a chance on a new and unusual experience. I hope it gave you something worth remembering.

And speaking of memories — there's a new NovaNews article that's just dropped, covering your investigation:

  >> {CASE_FILE_BASE}report-{report_id}.html

This investigative article is unique to YOUR game-session. Its contents are all based on what you chose to expose publicly, and the things you chose to bury for profit. You might see threads you recognize, or pieces that fill in parts of the story that you didn't get to. It is a version of the story that could not exist without your choices and participation.

We're a small, independent show and reviews genuinely make a difference for us. If you had a good time, leaving a review on Morty would be amazing. And if you want to share photos, theories, or hot takes from the night, tag @storypunkstudio on Instagram or StoryPunk on Facebook — we love seeing your posts.

And if you've got thoughts on the experience (what worked, what didn't, how you might describe the game to a friend), it would mean the WORLD to us to have your feedback as we continue to evolve and grow our game. Use the link below or just reply to this email with your thoughts:

  >> {FEEDBACK_BASE}?date={feedback_date}

Finally About Last Night is constantly growing and evolving and if you return, your experience of the game may be a completely new one. So we invite you to come back and play again, and bring your crew through. Here's a promo code for a 33% discount: EarlyAccessWelcomeBack — consider it a thank you for being part of the story of this experience.

Thanks again for being part of this.

Max, Shuai & Casey
StoryPunk / Patchwork Adventures"""

    if session_note:
        text_body += "\n\n" + session_note

    print(f"\nFull email body (using {first['name']} as example):")
    print("-" * 60)
    print(text_body)
    print("-" * 60)

    print(f"\nRecipient List:")
    print("-" * 60)
    for i, recipient in enumerate(recipients, 1):
        print(f"{i:2}. {recipient['name']:<30} {recipient['email']}")
    print("-" * 60)
```

**Why a hardcoded plain text body instead of parsing the template?** The HTML template is table-based XHTML — stripping tags would produce garbage. This preview body matches `create_email_message()` exactly (both updated in this plan to reflect the full HTML template content). If the email copy changes, update all three locations: the HTML template, `create_email_message()`, and `preview_recipients()`. Cross-reference comments are included in both functions.

- [ ] **Step 2: Verify syntax**

```bash
python -c "import ast; ast.parse(open('reports/emailer/send_followup_emails_smart.py').read()); print('OK')"
```

- [ ] **Step 3: Commit**

```bash
git add reports/emailer/send_followup_emails_smart.py
git commit -m "feat(emailer): preview shows full plain text email body"
```

---

### Task 6: Wire everything together in `main()`

**Files:**
- Modify: `reports/emailer/send_followup_emails_smart.py` — `main()` function (lines 272-370)

- [ ] **Step 1: Move template loading before preview, add note prompt, thread session_note**

The current `main()` flow is: session_info → booking_data → preview → confirm → CSV → load template → dry run → confirm send → real send.

New flow: session_info → booking_data → **load template** → **get note** → **preview (with note)** → confirm → CSV → dry run **(with note)** → confirm send → real send **(with note)**.

Replace the `main()` function body (from "Step 1: Get session info" through end of the try/except block) with:

```python
def main():
    """Main execution"""
    print("\n" + "="*60)
    print("ABOUT LAST NIGHT - EMAIL SENDER")
    print("="*60)

    # Check template exists
    if not Path(TEMPLATE_FILE).exists():
        print(f"\n❌ Template file not found: {TEMPLATE_FILE}")
        print("Make sure 'about_last_night_followup_template.html' is in the same directory.")
        return

    # Step 1: Get session info
    session_date, report_id = get_session_info()

    # Step 2: Get and parse booking data
    recipients = get_booking_data()
    if not recipients:
        return

    # Step 3: Load template (needed for preview and sending)
    template = load_template()
    print("✓ Template loaded")

    # Step 4: Get optional session note
    session_note = get_session_note()

    # Enrich recipients with computed fields for plain text rendering
    feedback_date = session_date[:4]
    for r in recipients:
        r['report_id'] = report_id
        r['feedback_date'] = feedback_date

    # Step 5: Preview (full email body + recipient list)
    preview_recipients(recipients, session_date, report_id, session_note)

    # Step 6: Confirm before proceeding
    print("\n" + "="*60)
    response = input("\nDoes this look correct? (yes/no): ").strip().lower()
    if response != 'yes':
        print("Cancelled.")
        return

    # Step 7: Save CSV if enabled
    if SAVE_CSV:
        csv_filename = f"recipients_{session_date}_{report_id}.csv"
        save_to_csv(recipients, session_date, report_id, csv_filename)

    # Step 8: Dry run
    print("\n" + "="*60)
    print("PREPARING EMAILS")
    print("="*60)
    print("\n=== DRY RUN (no emails will be sent) ===")
    for recipient in recipients:
        personalized = personalize_email(template, recipient, session_date, report_id, session_note)
        msg = create_email_message(recipient, personalized, session_note)
        send_email(recipient, msg, None, dry_run=True)

    # Step 9: Confirm real send
    print("\n" + "="*60)
    print(f"\nReady to send {len(recipients)} emails")
    print(f"From: {SENDER_NAME} <{SENDER_EMAIL}>")
    print(f"Reply-To: {REPLY_TO_EMAIL}")
    print(f"SMTP: {SMTP_SERVER}:{SMTP_PORT}")
    if session_note:
        print(f"Session note: YES ({len(session_note)} chars)")
    response = input("\nSend for real? (yes/no): ").strip().lower()

    if response != 'yes':
        print("Cancelled.")
        return

    # Step 10: Real send
    print("\n=== SENDING EMAILS ===")
    success_count = 0

    try:
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.set_debuglevel(0)
            server.starttls()
            print("Authenticating...")
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            print("✓ Connected to SMTP server\n")

            for i, recipient in enumerate(recipients, 1):
                print(f"[{i}/{len(recipients)}]", end=" ")
                personalized = personalize_email(template, recipient, session_date, report_id, session_note)
                msg = create_email_message(recipient, personalized, session_note)

                if send_email(recipient, msg, server, dry_run=False):
                    success_count += 1

                if i < len(recipients):
                    time.sleep(DELAY_BETWEEN_EMAILS)

        print(f"\n✓ Successfully sent {success_count}/{len(recipients)} emails")

    except smtplib.SMTPAuthenticationError:
        print("\n❌ Authentication failed!")
        print("Check your email and app password settings.")
        print("\nFor Gmail:")
        print("1. Enable 2-Factor Authentication")
        print("2. Generate App Password at: https://myaccount.google.com/apppasswords")
        print("3. Update SENDER_PASSWORD in the script")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        print(f"Successfully sent {success_count}/{len(recipients)} before error")
```

Key changes from existing `main()`:
- Template loads early (before preview) so preview can reference URLs
- `get_session_note()` called after booking data, before preview
- `session_note` passed to `preview_recipients()`, both `personalize_email()` calls, and both `create_email_message()` calls
- Pre-send confirmation shows "Session note: YES (N chars)" when a note is present

- [ ] **Step 2: Verify syntax**

```bash
python -c "import ast; ast.parse(open('reports/emailer/send_followup_emails_smart.py').read()); print('OK')"
```

- [ ] **Step 3: Manual smoke test**

Run the script interactively to verify the full flow:

```bash
cd reports/emailer
python send_followup_emails_smart.py
```

Test two scenarios:
1. **With note:** Enter a session date, paste test booking data, type a multi-line note, verify it appears in the preview, cancel before sending
2. **Without note:** Same flow but press Enter immediately at the note prompt, verify no note in preview

- [ ] **Step 4: Commit**

```bash
git add reports/emailer/send_followup_emails_smart.py
git commit -m "feat(emailer): wire session note through main() flow"
```
