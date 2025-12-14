#!/usr/bin/env python3
"""
About Last Night - Smart Email Sender
Handles booking system paste format and sends personalized follow-up emails
"""

import smtplib
import csv
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr
from pathlib import Path
from typing import List, Dict, Tuple
import time

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
CASE_FILE_BASE = "https://aboutlastnightgame.com/reports/"
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
        session_date = input("\nEnter session date (MMDD format, e.g., 1204 for Dec 4): ").strip()
        
        # Validate format
        if not re.match(r'^\d{4}$', session_date):
            print("  ❌ Please use MMDD format (4 digits)")
            continue
        
        # Validate month
        month = int(session_date[:2])
        if month < 1 or month > 12:
            print("  ❌ Invalid month (must be 01-12)")
            continue
        
        # Validate day
        day = int(session_date[2:])
        if day < 1 or day > 31:
            print("  ❌ Invalid day (must be 01-31)")
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

def load_template() -> str:
    """Load the HTML email template"""
    if not Path(TEMPLATE_FILE).exists():
        raise FileNotFoundError(f"Template file not found: {TEMPLATE_FILE}")
    
    with open(TEMPLATE_FILE, 'r', encoding='utf-8') as f:
        return f.read()

def personalize_email(template: str, recipient: Dict, session_date: str, report_id: str) -> str:
    """Replace placeholders with recipient-specific data"""
    email = template
    email = email.replace("{{PLAYER_NAME}}", recipient['name'].split()[0])  # First name only
    email = email.replace("{{CASE_FILE_URL}}", f"{CASE_FILE_BASE}report{report_id}.html")
    email = email.replace("{{FEEDBACK_FORM_URL}}", f"{FEEDBACK_BASE}?date={session_date}")
    return email

def create_email_message(recipient: Dict, html_content: str) -> MIMEMultipart:
    """Create the email message with headers and content"""
    
    # Create message container
    msg = MIMEMultipart('alternative')
    
    # Set headers
    msg['From'] = formataddr((SENDER_NAME, SENDER_EMAIL))
    msg['To'] = recipient['email']
    msg['Reply-To'] = REPLY_TO_EMAIL
    msg['Subject'] = "Thank you for playing About Last Night"
    
    # Create plain text version (fallback)
    text_content = f"""
Hey {recipient['name'].split()[0]},

First of all, thank you.

I hope it gave you something worth remembering.

And speaking of memories — Detective Anondono's case file is ready.

Visit aboutlastnightgame.com to view your personalized case file and leave feedback.

If you want to share anything from the night — photos, theories, hot takes — we'd love to see it. 
Tag @storypunkstudio on Instagram or StoryPunk on Facebook.

We'd love to have you come back and play again and bring your crew through. 
Use promo code EarlyAccessWelcomeBack for a 33% discount.

Thanks again for being part of this.

Max & Shuai
StoryPunk / Patchwork Adventures
    """
    
    # Attach both versions
    part1 = MIMEText(text_content.strip(), 'plain', 'utf-8')
    part2 = MIMEText(html_content, 'html', 'utf-8')
    msg.attach(part1)
    msg.attach(part2)
    
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

def preview_recipients(recipients: List[Dict], session_date: str, report_id: str):
    """Show preview of what will be sent"""
    print("\n" + "="*60)
    print("PREVIEW")
    print("="*60)
    print(f"\nSession Date: {session_date}")
    print(f"Report ID: {report_id}")
    print(f"Recipients: {len(recipients)}")
    print("\nRecipient List:")
    print("-" * 60)
    for i, recipient in enumerate(recipients, 1):
        print(f"{i:2}. {recipient['name']:<30} {recipient['email']}")
    print("-" * 60)

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
    
    # Step 3: Preview
    preview_recipients(recipients, session_date, report_id)
    
    # Step 4: Confirm before proceeding
    print("\n" + "="*60)
    response = input("\nDoes this look correct? (yes/no): ").strip().lower()
    if response != 'yes':
        print("Cancelled.")
        return
    
    # Step 5: Save CSV if enabled
    if SAVE_CSV:
        csv_filename = f"recipients_{session_date}_{report_id}.csv"
        save_to_csv(recipients, session_date, report_id, csv_filename)
    
    # Step 6: Load template
    print("\n" + "="*60)
    print("PREPARING EMAILS")
    print("="*60)
    template = load_template()
    print("✓ Template loaded")
    
    # Step 7: Dry run
    print("\n=== DRY RUN (no emails will be sent) ===")
    for recipient in recipients:
        personalized = personalize_email(template, recipient, session_date, report_id)
        msg = create_email_message(recipient, personalized)
        send_email(recipient, msg, None, dry_run=True)
    
    # Step 8: Confirm real send
    print("\n" + "="*60)
    print(f"\nReady to send {len(recipients)} emails")
    print(f"From: {SENDER_NAME} <{SENDER_EMAIL}>")
    print(f"Reply-To: {REPLY_TO_EMAIL}")
    print(f"SMTP: {SMTP_SERVER}:{SMTP_PORT}")
    response = input("\nSend for real? (yes/no): ").strip().lower()
    
    if response != 'yes':
        print("Cancelled.")
        return
    
    # Step 9: Real send
    print("\n=== SENDING EMAILS ===")
    success_count = 0
    
    try:
        # Connect to SMTP server once for all emails (more efficient)
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.set_debuglevel(0)  # Set to 1 for debugging
            server.starttls()
            print("Authenticating...")
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            print("✓ Connected to SMTP server\n")
            
            # Send each email
            for i, recipient in enumerate(recipients, 1):
                print(f"[{i}/{len(recipients)}]", end=" ")
                personalized = personalize_email(template, recipient, session_date, report_id)
                msg = create_email_message(recipient, personalized)
                
                if send_email(recipient, msg, server, dry_run=False):
                    success_count += 1
                
                # Rate limiting (except for last email)
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
