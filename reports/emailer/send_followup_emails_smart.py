#!/usr/bin/env python3
"""
About Last Night - Smart Email Sender
Handles booking system paste format and sends personalized follow-up emails
"""

import smtplib
import csv
import re
import html
import io
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.image import MIMEImage
from email.utils import formataddr
from pathlib import Path
from typing import List, Dict, Tuple
import time
from PIL import Image

# ===== CONFIGURATION =====

# Email Provider Settings
SMTP_SERVER = "smtp.gmail.com"  # Gmail
SMTP_PORT = 587

# Sender Information
SENDER_EMAIL = "about.last.night.game@gmail.com"      # UPDATE: Your email address
SENDER_PASSWORD = "rsdx hdmi vqvp lgvk"    # UPDATE: Your app password
SENDER_NAME = "Max & Shuai"             # Display name
REPLY_TO_EMAIL = "about.last.night@gmail.com"   # UPDATE: Where replies should go (can be same as SENDER_EMAIL)

# URLs
CASE_FILE_BASE = "https://aboutlastnightgame.com/reports/outputs/"
FEEDBACK_BASE = "https://aboutlastnightgame.com/feedback.html"
TEMPLATE_FILE = "about_last_night_followup_template.html"

# Sending Options
DELAY_BETWEEN_EMAILS = 1  # seconds (helps avoid rate limits)
SAVE_CSV = True  # Save parsed data to CSV for records

# ===== HELPER FUNCTIONS =====

def parse_booking_data(raw_text: str) -> List[Dict]:
    """
    Parse booking system paste format into structured data.
    
    Expected format (alternating lines):
    Name
    email@example.com
    Another Name
    anotheremail@example.com
    """
    lines = [line.strip() for line in raw_text.strip().split('\n') if line.strip()]
    
    if len(lines) % 2 != 0:
        raise ValueError(f"Expected even number of lines (name/email pairs), got {len(lines)}")
    
    recipients = []
    for i in range(0, len(lines), 2):
        name = lines[i]
        email = lines[i + 1]
        
        # Basic email validation
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', email):
            print(f"  ⚠️  Warning: '{email}' doesn't look like a valid email")
        
        recipients.append({
            'name': name.title(),  # Capitalize properly (handles "brian benson" -> "Brian Benson")
            'email': email.lower()  # Normalize to lowercase
        })
    
    return recipients

def get_session_info() -> Tuple[str, str]:
    """
    Prompt user for session date and calculate report ID.
    Returns: (session_date, report_id)
    """
    print("\n" + "="*60)
    print("SESSION INFORMATION")
    print("="*60)

    while True:
        session_date = input("\nEnter session date (MMDDYY format, e.g., 122725 for Dec 27, 2025): ").strip()

        # Validate format
        if not re.match(r'^\d{6}$', session_date):
            print("  ❌ Please use MMDDYY format (6 digits)")
            continue

        # Validate month
        month = int(session_date[:2])
        if month < 1 or month > 12:
            print("  ❌ Invalid month (must be 01-12)")
            continue

        # Validate day
        day = int(session_date[2:4])
        if day < 1 or day > 31:
            print("  ❌ Invalid day (must be 01-31)")
            continue

        # Validate year
        year = int(session_date[4:6])
        if year < 25 or year > 30:  # 2025-2030 range
            print("  ❌ Invalid year (must be 25-30 for 2025-2030)")
            continue

        break
    
    # Check if multiple sessions that day
    print("\nIs this the first session of the day?")
    print("  1 = First session (report ID: {})".format(session_date))
    print("  2 = Second session (report ID: {}2)".format(session_date))
    print("  3 = Third session (report ID: {}3)".format(session_date))
    
    while True:
        session_num = input("Enter session number [1]: ").strip() or "1"
        
        if session_num in ['1', '2', '3']:
            break
        print("  ❌ Please enter 1, 2, or 3")
    
    # Calculate report ID
    if session_num == '1':
        report_id = session_date
    else:
        report_id = session_date + session_num
    
    print(f"\n✓ Session date: {session_date}")
    print(f"✓ Report ID: {report_id}")
    
    return session_date, report_id

def get_booking_data() -> List[Dict]:
    """
    Get booking system data via paste.
    Returns list of recipient dictionaries.
    """
    print("\n" + "="*60)
    print("PASTE BOOKING DATA")
    print("="*60)
    print("\nPaste the name/email list from your booking system.")
    print("Format should be alternating lines of:")
    print("  Name")
    print("  email@example.com")
    print("\nPaste data below, then press Enter twice:")
    print("-" * 60)
    
    # Collect multi-line input
    lines = []
    while True:
        line = input()
        if line.strip() == "" and lines:  # Empty line after content
            break
        if line.strip():  # Ignore empty lines in the middle
            lines.append(line)
    
    raw_text = '\n'.join(lines)
    
    try:
        recipients = parse_booking_data(raw_text)
        print(f"\n✓ Parsed {len(recipients)} recipients")
        return recipients
    except ValueError as e:
        print(f"\n❌ Error parsing data: {e}")
        print("Please check your paste format and try again.")
        return []

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

IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.heic'}

def get_photo_folder() -> List[Path]:
    """
    Prompt user for a folder containing session photos.
    Returns sorted list of image Paths, or empty list if skipped.
    """
    print("\n" + "="*60)
    print("SESSION PHOTOS (OPTIONAL)")
    print("="*60)
    print("\nAttach group photos from the session?")
    print("Enter a folder path, or press Enter to skip:")
    print("-" * 60)

    while True:
        folder = input().strip()
        if not folder:
            print("  No photos — skipping.")
            return []

        folder_path = Path(folder)
        if not folder_path.is_dir():
            print(f"  ❌ Not a valid folder: {folder}")
            print("  Try again or press Enter to skip:")
            continue

        images = sorted(
            p for p in folder_path.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        )

        if not images:
            print(f"  ⚠️  No image files found in {folder}")
            print(f"  (Looking for: {', '.join(IMAGE_EXTENSIONS)})")
            print("  Try a different folder or press Enter to skip:")
            continue

        print(f"\n✓ Found {len(images)} photo(s)")
        for img in images:
            size_kb = img.stat().st_size / 1024
            print(f"    {img.name}  ({size_kb:.0f} KB)")
        return images

def process_photos(image_paths: List[Path], session_date: str) -> List[Tuple[str, bytes]]:
    """
    Resize photos and return as named JPEG byte tuples.
    Returns list of (filename, jpeg_bytes).
    """
    MAX_DIMENSION = 1600
    JPEG_QUALITY = 85
    TOTAL_SIZE_WARN = 20 * 1024 * 1024  # 20MB

    results = []
    for idx, img_path in enumerate(image_paths, 1):
        img = Image.open(img_path)

        # Convert RGBA/palette to RGB for JPEG (skip if transparent PNG)
        if img.mode in ('RGBA', 'P'):
            if img.mode == 'RGBA' and img.split()[3].getextrema() != (255, 255):
                # Has actual transparency — attach as PNG instead
                buf = io.BytesIO()
                img.save(buf, format='PNG', optimize=True)
                filename = f"aboutlastnight_{session_date}_{idx:02d}.png"
                results.append((filename, buf.getvalue()))
                continue
            img = img.convert('RGB')

        # Resize if needed
        w, h = img.size
        if max(w, h) > MAX_DIMENSION:
            ratio = MAX_DIMENSION / max(w, h)
            new_size = (int(w * ratio), int(h * ratio))
            img = img.resize(new_size, Image.LANCZOS)

        # Save to JPEG in memory
        buf = io.BytesIO()
        img.save(buf, format='JPEG', quality=JPEG_QUALITY)
        filename = f"aboutlastnight_{session_date}_{idx:02d}.jpg"
        results.append((filename, buf.getvalue()))

    # Size guardrail
    total_size = sum(len(data) for _, data in results)
    if total_size > TOTAL_SIZE_WARN:
        print(f"\n  ⚠️  Total photo size: {total_size / (1024*1024):.1f} MB (exceeds 20 MB)")
        for fname, data in results:
            print(f"    {fname}  ({len(data) / (1024*1024):.1f} MB)")
        print("\n  Options:")
        print("    1 = Reduce quality to 70% and retry")
        print("    2 = Proceed anyway (Gmail limit is 25 MB)")
        print("    3 = Skip photos for this send")

        while True:
            choice = input("  Enter choice [2]: ").strip() or "2"
            if choice == "1":
                # Re-process at lower quality
                results = []
                for idx, img_path in enumerate(image_paths, 1):
                    img = Image.open(img_path)
                    if img.mode in ('RGBA', 'P'):
                        img = img.convert('RGB')
                    w, h = img.size
                    if max(w, h) > MAX_DIMENSION:
                        ratio = MAX_DIMENSION / max(w, h)
                        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
                    buf = io.BytesIO()
                    img.save(buf, format='JPEG', quality=70)
                    filename = f"aboutlastnight_{session_date}_{idx:02d}.jpg"
                    results.append((filename, buf.getvalue()))
                new_total = sum(len(d) for _, d in results)
                print(f"  ✓ Reduced to {new_total / (1024*1024):.1f} MB")
                break
            elif choice == "2":
                break
            elif choice == "3":
                return []
            else:
                print("  Please enter 1, 2, or 3")

    return results

def load_template() -> str:
    """Load the HTML email template"""
    if not Path(TEMPLATE_FILE).exists():
        raise FileNotFoundError(f"Template file not found: {TEMPLATE_FILE}")
    
    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        return f.read()

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

def create_email_message(recipient: Dict, html_content: str, session_note: str = "", photos: List[Tuple[str, bytes]] = None) -> MIMEMultipart:
    """Create the email message with headers and content, optionally with photo attachments"""

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

    if photos:
        text_content = text_content.rstrip() + f"\n\n[{len(photos)} photo(s) from your session are attached to this email]"

    # Build text and HTML parts
    part_plain = MIMEText(text_content.strip(), 'plain', 'utf-8')
    part_html = MIMEText(html_content, 'html', 'utf-8')

    if photos:
        # Mixed container: alternative text/html + image attachments
        msg = MIMEMultipart('mixed')
        alt = MIMEMultipart('alternative')
        alt.attach(part_plain)
        alt.attach(part_html)
        msg.attach(alt)

        for filename, data in photos:
            img_type = 'png' if filename.endswith('.png') else 'jpeg'
            img_part = MIMEImage(data, _subtype=img_type)
            img_part.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(img_part)
    else:
        # No photos — original structure
        msg = MIMEMultipart('alternative')
        msg.attach(part_plain)
        msg.attach(part_html)

    # Set headers
    msg['From'] = formataddr((SENDER_NAME, SENDER_EMAIL))
    msg['To'] = recipient['email']
    msg['Reply-To'] = REPLY_TO_EMAIL
    msg['Subject'] = "Thank you for playing About Last Night"

    return msg

def send_email(recipient: Dict, msg: MIMEMultipart, server, dry_run: bool = True) -> bool:
    """Send the email via provided SMTP server"""
    
    if dry_run:
        print(f"  [DRY RUN] Would send to: {recipient['name']} <{recipient['email']}>")
        return True
    
    try:
        server.send_message(msg)
        print(f"  ✓ Sent to: {recipient['name']} <{recipient['email']}>")
        return True
    except Exception as e:
        print(f"  ✗ Failed to send to {recipient['email']}: {str(e)}")
        return False

def save_to_csv(recipients: List[Dict], session_date: str, report_id: str, filename: str):
    """Save recipient data to CSV for records"""
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=['name', 'email', 'session_date', 'report_id'])
        writer.writeheader()
        for recipient in recipients:
            writer.writerow({
                'name': recipient['name'],
                'email': recipient['email'],
                'session_date': session_date,
                'report_id': report_id
            })
    print(f"  ✓ Saved to: {filename}")

def preview_recipients(recipients: List[Dict], session_date: str, report_id: str, session_note: str = "", photos: List[Tuple[str, bytes]] = None):
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

    if photos:
        total_mb = sum(len(d) for _, d in photos) / (1024 * 1024)
        print(f"\nPhotos: {len(photos)} attachment(s) ({total_mb:.1f} MB total)")
        for fname, data in photos:
            print(f"    {fname}  ({len(data) / (1024*1024):.1f} MB)")
    else:
        print(f"\nPhotos: None")

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

    # Step 4b: Get optional session photos
    photo_paths = get_photo_folder()
    photos = process_photos(photo_paths, session_date) if photo_paths else []

    # Enrich recipients with computed fields for plain text rendering
    feedback_date = session_date[:4]
    for r in recipients:
        r['report_id'] = report_id
        r['feedback_date'] = feedback_date

    # Step 5: Preview (full email body + recipient list + photo summary)
    preview_recipients(recipients, session_date, report_id, session_note, photos)

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
        msg = create_email_message(recipient, personalized, session_note, photos)
        send_email(recipient, msg, None, dry_run=True)

    # Step 9: Confirm real send
    print("\n" + "="*60)
    print(f"\nReady to send {len(recipients)} emails")
    print(f"From: {SENDER_NAME} <{SENDER_EMAIL}>")
    print(f"Reply-To: {REPLY_TO_EMAIL}")
    print(f"SMTP: {SMTP_SERVER}:{SMTP_PORT}")
    if session_note:
        print(f"Session note: YES ({len(session_note)} chars)")
    if photos:
        total_mb = sum(len(d) for _, d in photos) / (1024 * 1024)
        print(f"Photos: {len(photos)} attachment(s) ({total_mb:.1f} MB total)")
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
                msg = create_email_message(recipient, personalized, session_note, photos)

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

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user. Exiting safely.")
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
