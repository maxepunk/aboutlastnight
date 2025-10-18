# Content Editor Guide

**About Last Night - Landing Page Content Updates**

This guide helps non-technical content editors find and update text content on the About Last Night landing page.

---

## Quick Start

### How to Update Content

1. **Find the content**: Use Ctrl+F (or Cmd+F on Mac) to search for the text you want to update in `index.html`
2. **Look for comment markers**: Content is marked with clear comment boundaries like:
   ```html
   <!-- EDITABLE CONTENT: SECTION NAME -->
   ```
3. **Edit only the text**: Change the text between HTML tags, don't modify the tags themselves
4. **Save the file**: Save your changes in your code editor
5. **Preview locally**: Open `index.html` in your browser to see changes
6. **Commit and push**: Use git to commit your changes and push to GitHub Pages

---

## Content Locations

### Hero Section (Tagline, Event Title)

**What**: Main headline and tagline at top of page

**Search for**: "HERO" or "Some memories are worth killing for"

**Location**: `index.html` - look for comment marker `<!-- EDITABLE CONTENT: HERO -->`

**Safe to edit**:
- Event tagline
- Event title
- Hero description text

**Do NOT edit**:
- HTML tags (`<h1>`, `<p>`, `<section>`, etc.)
- CSS classes (`class="hero"`)
- IDs (`id="hero-section"`)

---

### Pricing and Dates

**What**: Ticket pricing, event dates, showtimes

**Search for**: "PRICING" or "$75" or "October 4"

**Location**: `index.html` - look for comment marker `<!-- EDITABLE CONTENT: PRICING AND DATES -->`

**Safe to edit**:
- Ticket price
- Event dates (preview, regular run)
- Showtimes
- Availability status

**Do NOT edit**:
- HTML structure
- CSS classes

---

### FAQ Section

**What**: Frequently asked questions and answers

**Search for**: "FAQ" or the specific question text

**Location**: `index.html` - look for comment marker `<!-- STRUCTURAL COMPONENT: FAQ ITEMS -->`

**How to update existing FAQ**:
1. Find the question text
2. Edit the text inside `<button class="faq-question">` tags
3. Edit the answer inside `<div class="faq-answer">` tags

**How to add new FAQ question**:
1. Find an existing FAQ item
2. Copy the entire block from opening `<div class="faq-accordion">` to closing `</div>`
3. Paste it below the last FAQ
4. Change the question and answer text
5. Save - the accordion behavior will work automatically

**Example FAQ structure**:
```html
<div class="faq-accordion">
  <button class="faq-question" aria-expanded="false">
    Your question here?
  </button>
  <div class="faq-answer" hidden>
    <p>Your answer here</p>
  </div>
</div>
```

---

### Creator Profiles

**What**: Creator names, roles, and bios

**Search for**: "CREATORS" or creator name

**Location**: `index.html` - look for comment marker `<!-- STRUCTURAL COMPONENT: CREATOR PROFILES -->`

**Safe to edit**:
- Creator names
- Role descriptions
- Bio text

**Do NOT edit**:
- HTML structure
- Image paths

---

### Footer and Contact Info

**What**: Contact information, social links, legal text

**Search for**: "FOOTER" or "contact"

**Location**: `index.html` - look for comment marker `<!-- EDITABLE CONTENT: FOOTER -->`

**Safe to edit**:
- Email address
- Social media links
- Copyright text
- Legal disclaimers

---

### Event Configuration (Data Attributes)

**What**: Configuration values for dynamic features like countdown timers

**Search for**: "data-event-date" or "DATE CONFIG"

**Location**: `index.html` - look for comment marker `<!-- DATE CONFIG: Update event date... -->`

**How to update event start date**:
1. Search for "data-event-date" in index.html
2. Find the line: `<section class="hero" data-event-date="2025-10-04">`
3. Change the date value to your new event start date in YYYY-MM-DD format
4. Example: `data-event-date="2025-11-15"` for November 15, 2025

**Safe to edit**:
- The date value within the quotes
- Format must be YYYY-MM-DD (year-month-day with leading zeros)

**Do NOT edit**:
- The attribute name `data-event-date`
- The HTML structure around it
- Remove the quotes

**Note**: This date can be used by future features (like countdown timers) without requiring you to update JavaScript code. You only need to change this one value.

---

## HTML Validation

### What Happens When You Commit

When you run `git commit`, an automatic validation check runs to catch HTML errors:

✅ **If HTML is valid**: Commit succeeds normally

❌ **If HTML has errors**: Commit is blocked with error message showing:
- Line number where error occurred
- Description of the error
- How to fix it

### Common Validation Errors

**Unclosed tag**:
```
Error: line 42 - Warning: missing </div>
```
**Fix**: Add the missing closing tag at line 42

**Invalid nesting**:
```
Error: line 103 - <section> tag not closed
```
**Fix**: Close the `<section>` tag before the next section starts

**How to skip validation** (only if absolutely necessary):
```bash
git commit --no-verify
```
⚠️ **Warning**: Only skip validation if you're certain the HTML is correct. Invalid HTML can break the live site.

---

## Preview Changes

### Local Preview (Before Pushing)

1. Save your changes in `index.html`
2. Open the file in your web browser:
   - Right-click `index.html` in your file explorer
   - Select "Open with..." → Choose your browser (Chrome, Firefox, etc.)
3. Check your changes visually
4. **Note**: Forms won't work in local preview (use GitHub Pages for testing forms)

### Live Preview (After Pushing)

1. Commit your changes: `git commit -m "Update pricing"`
2. Push to GitHub: `git push origin 001-content-first-refactor`
3. Wait 1-2 minutes for GitHub Pages to deploy
4. Visit: https://aboutlastnightgame.com
5. Force refresh (Ctrl+Shift+R or Cmd+Shift+R) to clear cache

---

## Git Workflow

### Simple Update Workflow

```bash
# 1. Edit index.html in your editor

# 2. Check what changed
git status
git diff index.html

# 3. Stage your changes
git add index.html

# 4. Commit with descriptive message
git commit -m "Update ticket pricing to $85"
# → HTML validation runs automatically

# 5. Push to GitHub
git push origin 001-content-first-refactor
```

### If Validation Fails

```bash
# See the error message (shows line number)
# Open index.html, go to that line number
# Fix the error (usually a missing closing tag)
# Try committing again
git commit -m "Update ticket pricing to $85"
```

---

## Troubleshooting

### "I can't find the text I want to update"

1. Make sure you're searching in `index.html` (not other files)
2. Try searching for a partial phrase
3. Look for comment markers with all caps: `<!-- EDITABLE CONTENT: ... -->`
4. If still stuck, ask a developer

### "My changes don't appear on the live site"

1. Wait 1-2 minutes (GitHub Pages deployment takes time)
2. Force refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
3. Check you pushed to the correct branch
4. Verify commit appears on GitHub

### "HTML validation is blocking my commit"

1. Read the error message carefully - it shows the line number
2. Open `index.html` and go to that line
3. Common issues:
   - Missing closing tag (`</div>`, `</p>`, etc.)
   - Typo in tag name (`<sectoin>` instead of `<section>`)
   - Accidentally deleted a closing bracket (`>`)
4. Fix the error and retry commit
5. If error message is unclear, ask a developer

### "I accidentally broke something"

1. Don't panic! Git keeps history
2. Undo uncommitted changes: `git checkout index.html`
3. Undo last commit: `git revert HEAD`
4. Ask a developer for help if needed

---

## Best Practices

### ✅ DO

- Search for content using Ctrl+F before editing
- Edit only text content between HTML tags
- Use descriptive commit messages
- Preview changes locally before pushing
- Test on live site after pushing

### ❌ DON'T

- Edit HTML tags, classes, or IDs (unless you know what you're doing)
- Delete comment markers
- Modify JavaScript code
- Skip HTML validation (use `--no-verify`) unless absolutely necessary
- Edit files other than `index.html` for content updates

---

## Playtest Page Content (`playtest.html`)

### Playtest Description

**What**: Event description, game details, playtest expectations

**Search for**: "PLAYTEST DESCRIPTION" or "90"

**Location**: `playtest.html` - look for comment marker `<!-- EDITABLE CONTENT: PLAYTEST DESCRIPTION -->`

**Safe to edit**:
- Event description paragraphs
- Game overview text
- Playtest session notes
- Duration information (2-2.5 hours text)

**Do NOT edit**:
- HTML tags (`<section>`, `<p>`, `<strong>`)
- CSS classes

---

### Event Details (Playtest Page)

**What**: Date, time, duration, player count, location

**Search for**: "EVENT DETAILS" or "2-2.5 HRS"

**Location**: `playtest.html` - look for comment marker `<!-- EDITABLE CONTENT: EVENT DETAILS -->`

**Safe to edit**:
- Date value ("Sept 21")
- Time value ("4:00 PM")
- Duration value ("2-2.5 HRS")
- Player count ("20 MAX")
- Location name ("OFF THE COUCH GAMES")
- Address ("555 Mowry Ave, Fremont, CA 94536")

**Do NOT edit**:
- HTML structure (`<div>`, `<div class="detail-item">`)
- CSS classes or styling

**Note**: When multiple playtest dates are available, you may need to update the radio button section instead (see Multi-Date Selection below).

---

### Surveillance Protocol

**What**: Photo consent checkbox text and explanation

**Search for**: "SURVEILLANCE PROTOCOL"

**Location**: `playtest.html` - look for comment marker `<!-- EDITABLE CONTENT: SURVEILLANCE PROTOCOL -->`

**Safe to edit**:
- Consent heading text
- Description text ("The investigation will be documented...")
- List items (evidence photos, promotional materials, etc.)
- Disclaimer text ("Need to stay in the shadows...")

**Do NOT edit**:
- Checkbox input element
- Label association (`for="photoConsent"`)
- List structure (`<ul>`, `<li>` tags)

---

## Getting Help

- **Content questions**: Ask the marketing team
- **Technical issues**: Ask a developer
- **Git help**: See repository README or ask a developer
- **Form issues**: Contact the backend administrator (forms connect to Google Apps Script)

---

## Frequently Asked Questions (FAQ)

### What can I edit?

You can edit any text content within sections marked with `<!-- EDITABLE CONTENT: ... -->` or `<!-- STRUCTURAL COMPONENT: ... -->` comment markers. This includes:

- Event taglines and descriptions
- Pricing and dates
- FAQ questions and answers
- Creator profiles (names, roles, bios)
- Footer information and contact details
- Event configuration values (like `data-event-date`)

**Do NOT edit**:
- HTML tags (`<div>`, `<section>`, `<p>`, etc.)
- CSS classes (anything starting with `class=`)
- JavaScript code
- IDs (anything starting with `id=`)
- File paths or URLs in `src=` or `href=` attributes

### How do I preview my changes?

**Quick local preview** (for visual changes):
1. Save `index.html`
2. Right-click the file → Open with → Your browser
3. Check your changes
4. **Note**: Forms won't work locally

**Full preview on live site** (after deployment):
1. Commit and push your changes
2. Wait 1-2 minutes for GitHub Pages to deploy
3. Visit https://aboutlastnightgame.com
4. Force refresh (Ctrl+Shift+R or Cmd+Shift+R)

### What if HTML validation fails?

When you try to commit and validation fails:

1. **Read the error message** - It shows the exact line number with the problem
2. **Go to that line** in index.html
3. **Common fixes**:
   - Add missing closing tag (`</div>`, `</p>`, `</section>`)
   - Fix typo in tag name
   - Add missing `>`  or `<`
4. **Try committing again** after fixing

**Example**:
```
Error: line 142 - Warning: missing </div>
```
→ Go to line 142, find the `<div>` tag, add `</div>` where it belongs

### Can I break the site by editing content?

The HTML validation hook protects you from most errors. As long as you:
- Only edit text between tags (not the tags themselves)
- Don't delete comment markers
- Let the validation run (don't use `--no-verify`)

...you're very unlikely to break anything. If something does go wrong, git keeps all history so changes can be reverted.

### What if I need to update something not listed in this guide?

Ask a developer! They can either:
- Show you where to find it
- Add it to this guide for future reference
- Make the update for you if it requires code changes

---

**Last Updated**: 2025-01-19
**For**: About Last Night Landing Page
**Branch**: 001-content-first-refactor
