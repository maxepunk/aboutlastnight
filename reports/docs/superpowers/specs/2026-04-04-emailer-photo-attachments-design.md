# Emailer Photo Attachments — Design Spec

## Context

Follow-up emails sent to ALN session attendees currently include a personalized HTML email with links to the NovaNews report and feedback form. Players frequently take group photos during sessions, and we want to attach 1-5 of these session photos to the follow-up email so attendees can download them easily.

**Goal:** Add optional photo attachments to the existing emailer script with automatic resizing to stay within Gmail's 25MB limit.

## Design

### Workflow

The interactive flow gains one new step between session note and preview:

```
1. Session date        (existing)
2. Session number      (existing)
3. Paste booking data  (existing)
4. Session note        (existing)
5. Photo folder        (NEW — optional, Enter to skip)
6. Preview             (existing — now includes photo summary)
7. Confirm & send      (existing)
```

**Photo folder prompt behavior:**
- Asks for a folder path; press Enter to skip (no photos attached)
- Validates folder exists
- Scans for image files: `.jpg`, `.jpeg`, `.png`, `.heic`
- Displays count and estimated total size after resize
- If no image files found in folder, warns and offers to re-enter or skip

### Image Processing

**Library:** Pillow 12.0.0 (already installed)

**Resize rules:**
- Max dimension: 1600px on longest side, preserving aspect ratio
- Output format: JPEG at 85% quality
- HEIC input: converted to JPEG
- PNG input: converted to JPEG (attach as-is if image has transparency/alpha channel)
- Images already under 1600px: re-save at 85% quality for consistent file size
- All processing done in memory via `io.BytesIO` (no temp files on disk)

**Size guardrail:**
- After processing all photos, compute total attachment size
- If total exceeds 20MB, warn the user with per-photo sizes and offer options:
  - Reduce quality to 70% and retry
  - Proceed anyway (may fail at Gmail's 25MB hard limit)
  - Skip photos for this send

### Attachment Naming

Photos renamed to: `aboutlastnight_MMDDYY_01.jpg`, `aboutlastnight_MMDDYY_02.jpg`, etc.

Numbering follows the alphabetical sort order of original filenames. This gives recipients clean, recognizable names in their downloads folder.

### Email MIME Structure

Current structure:
```
MIMEMultipart('alternative')
├── MIMEText (plain)
└── MIMEText (html)
```

New structure (when photos present):
```
MIMEMultipart('mixed')
├── MIMEMultipart('alternative')
│   ├── MIMEText (plain)
│   └── MIMEText (html)
├── MIMEImage (aboutlastnight_MMDDYY_01.jpg)
├── MIMEImage (aboutlastnight_MMDDYY_02.jpg)
└── ...
```

When no photos are provided, the structure remains unchanged (`MIMEMultipart('alternative')`).

Each `MIMEImage` part gets:
- `Content-Disposition: attachment; filename="aboutlastnight_MMDDYY_01.jpg"`
- `Content-Type: image/jpeg`

### Preview Changes

The existing preview step adds a photo summary section:

```
Photos: 3 attachments (4.2 MB total)
  1. aboutlastnight_032826_01.jpg  (1.4 MB)
  2. aboutlastnight_032826_02.jpg  (1.6 MB)
  3. aboutlastnight_032826_03.jpg  (1.2 MB)
```

Or if no photos: `Photos: None`

### Plain Text Fallback

A line is appended to the plain text version when photos are attached:
```
[3 photos from your session are attached to this email]
```

## Files Modified

1. **`emailer/send_followup_emails_smart.py`**
   - New imports: `from PIL import Image`, `from email.mime.image import MIMEImage`, `import io`
   - New function: `get_photo_folder()` — interactive prompt, returns list of image paths or `[]`
   - New function: `process_photos(image_paths, session_date)` — resize via Pillow, returns `[(filename, jpeg_bytes), ...]`
   - Modified: `create_email_message()` — when photos provided, wrap alternative in mixed container, append MIMEImage parts
   - Modified: `preview_recipients()` — display photo summary
   - Modified: `main()` — call `get_photo_folder()` after `get_session_note()`, pass photos through flow

2. **`emailer/about_last_night_followup_template.html`** — No changes (photos are attachments, not inline)

## Verification

1. **Unit test:** Run script with a test folder of 3 photos (mix of jpg, png), verify:
   - Photos are resized (check no dimension exceeds 1600px)
   - Total attachment size is reasonable (~1-3MB per photo)
   - MIME structure is correct (mixed > alternative + images)
2. **Dry run:** Run full script flow with `--photos` pointing to test folder, confirm preview shows photo summary
3. **Send test:** Send to yourself, verify:
   - Email arrives with attachments visible and downloadable
   - Filenames are `aboutlastnight_MMDDYY_NN.jpg`
   - HTML body renders normally (not broken by structure change)
   - Plain text fallback includes photo mention
4. **Skip test:** Run without providing a photo folder, verify email sends identically to current behavior
5. **Size guardrail:** Test with large photos (>5MB each, 5+ photos) to trigger the 20MB warning
