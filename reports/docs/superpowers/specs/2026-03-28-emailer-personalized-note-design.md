# Emailer Personalized Note Feature

## Summary

Add an optional per-session note to the follow-up email. The note appears after the signoff, is entered interactively during the send flow, and is inserted verbatim (no automatic prefix). The preview step is also upgraded to show the full plain text email body.

## Changes

### 1. Interactive prompt (`send_followup_emails_smart.py`)

New step after preview confirmation (between current Steps 4 and 5):

```
Add a note to the end of this email? (leave blank to skip)
Paste your note below, then press Enter twice:
------------------------------------------------------------
```

- Multi-line input: collect lines until empty line after content. Unlike `get_booking_data()`, internal blank lines are **preserved** (notes may have paragraph breaks).
- Empty input (immediate Enter) = no note added.
- Returns the note as a raw string, no prefix or formatting applied.

New function: `get_session_note() -> str`

### 2. HTML template (`about_last_night_followup_template.html`)

New table row after the signoff block (after line 182, before the closing `</table>` tags). Wrapped in a conditional comment-style pattern — but since this is a simple placeholder replacement, the approach is:

- Add a `{{PS_NOTE_BLOCK}}` placeholder in the template.
- In `personalize_email()`, replace `{{PS_NOTE_BLOCK}}` with either the rendered HTML block (if note is provided) or empty string (if not).

The HTML block when rendered:

```html
<tr>
    <td style="padding: 16px 40px;">
        <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
                <td style="color:#ffffff; font-size:16px; line-height:1.5; font-family:Arial, sans-serif">
                    {note text here}
                </td>
            </tr>
        </table>
    </td>
</tr>
```

Same styling as all other body text blocks in the template.

**Text processing:**
- Newlines in the note are converted to `<br>` tags for the HTML version (so multi-line notes render correctly).
- Special characters (`&`, `<`, `>`) are HTML-escaped via `html.escape()` before insertion.
- The plain text version uses the raw note text as-is.

### 3. Plain text version (`create_email_message()`)

If a note is provided, append it after the signoff:

```
Max, Shuai & Casey
StoryPunk / Patchwork Adventures

{note text here}
```

The `create_email_message()` function gains a `session_note: str = ""` parameter.

### 4. `personalize_email()` signature change

Gains a `session_note: str = ""` parameter. When non-empty, generates the HTML block and replaces `{{PS_NOTE_BLOCK}}`. When empty, replaces `{{PS_NOTE_BLOCK}}` with empty string.

### 5. Preview upgrade

`preview_recipients()` currently shows a table of recipient names/emails. Change it to also render the full plain text email body using the first recipient as an example, so the operator can see exactly what will be sent (including the note if provided).

```
PREVIEW
============================================================
Session Date: 032826
Report ID: 032826
Recipients: 8

Full email body (using first recipient as example):
------------------------------------------------------------
Hey Max,

First of all, thank you.
...
{full plain text body including note if present}
------------------------------------------------------------

Recipient List:
------------------------------------------------------------
 1. Max Koknar                     max@example.com
 2. ...
------------------------------------------------------------
```

### Data flow

```
main()
  → get_session_info()        # existing
  → get_booking_data()        # existing
  → get_session_note()        # NEW — prompt for optional note
  → preview_recipients(... session_note, template)  # upgraded: full email body preview
  → confirm                   # existing
  → save CSV                  # existing, unchanged
  → load template             # already loaded for preview
  → dry run loop              # existing — calls updated personalize_email() and create_email_message()
  → confirm real send         # existing
  → real send loop            # existing — calls updated personalize_email() and create_email_message()
```

**Note:** `session_note` is threaded through all call sites: `preview_recipients()`, the dry run loop, and the real send loop. The template is loaded before the preview so it can render the example email body.

**Note:** `preview_recipients()` gains parameters `session_note` and `template`. It calls `personalize_email()` internally on the first recipient to generate the example plain text body.

## Files modified

| File | Change |
|------|--------|
| `send_followup_emails_smart.py` | Add `get_session_note()`, update `personalize_email()` and `create_email_message()` signatures, upgrade `preview_recipients()` |
| `about_last_night_followup_template.html` | Add `{{PS_NOTE_BLOCK}}` placeholder after signoff |

## Not changed

- CSV format — the note is per-session, not per-recipient, so no need to store it per row.
- No new files, no new dependencies.
- No CLI flags — interactive only, matching existing script style.
