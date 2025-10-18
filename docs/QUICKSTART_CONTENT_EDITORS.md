# Content Editor Quick Start Guide

**About Last Night - 5-Minute Onboarding**

Welcome! This guide will get you editing content on the About Last Night landing page in under 5 minutes.

---

## What You'll Learn

- How to find and update content
- How to preview your changes
- How to publish to the live site
- What's safe to edit (and what's not)

---

## The 3 Most Common Tasks

### 1. Update Pricing or Dates

**When**: Ticket prices change or event dates shift

**How**:
1. Open `index.html` in your code editor (VS Code, Sublime, etc.)
2. Press **Ctrl+F** (or Cmd+F on Mac)
3. Search for the text you want to update (e.g., "$75" or "October 4")
4. Change the text
5. Save the file

**Example**:
```html
<!-- Before -->
<span>$75/person</span>

<!-- After -->
<span>$85/person</span>
```

**Time**: ~30 seconds

---

### 2. Update Event Tagline or Description

**When**: Marketing copy changes

**How**:
1. Open `index.html`
2. Search for "HERO SECTION" or the current tagline
3. Find the section marked with `<!-- EDITABLE CONTENT: HERO SECTION -->`
4. Edit the text between the `<p>` tags
5. Save

**Example**:
```html
<!-- Before -->
<p class="hook">Some memories are worth killing for.</p>

<!-- After -->
<p class="hook">Every memory has a price.</p>
```

**Time**: ~1 minute

---

### 3. Add a New FAQ Question

**When**: New questions come up frequently

**How**:
1. Open `index.html`
2. Search for "FAQ SECTION"
3. Find the last FAQ question
4. Copy the entire block from `<div class="faq-item">` to `</div>`
5. Paste it below the last FAQ
6. Change the question and answer text
7. Save

**Example**:
```html
<div class="faq-item">
    <h3 class="faq-question">Your new question here?</h3>
    <p class="faq-answer">Your answer here.</p>
</div>
```

**Time**: ~2-3 minutes

---

## The Edit-Preview-Publish Workflow

### Step 1: Edit

Open `index.html` in your code editor and make changes to text content.

**✅ Safe to edit:**
- Text between tags: `<p>Your text here</p>`
- Dates, prices, names, descriptions

**❌ Don't touch:**
- HTML tags themselves: `<div>`, `<section>`, `<p>`
- Anything starting with `class=` or `id=`
- JavaScript code (usually at the bottom of the file)

### Step 2: Preview Locally

1. Save `index.html`
2. Right-click the file in your file explorer
3. Choose "Open with" → Your web browser
4. Check if your changes look correct

**Note**: Forms won't work in local preview. That's normal.

### Step 3: Publish to Live Site

```bash
# Save your work
git add index.html

# Create a commit with a descriptive message
git commit -m "Update ticket pricing to $85"

# Push to GitHub (this deploys to the live site)
git push origin main
```

### Step 4: Verify on Live Site

1. Wait 1-2 minutes
2. Go to https://aboutlastnightgame.com
3. Force refresh: **Ctrl+Shift+R** (or Cmd+Shift+R on Mac)
4. Check your changes appear correctly

---

## Comment Markers: Your Guide Posts

Content is organized with big comment blocks that look like this:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: PRICING AND DATES                     -->
<!-- SAFE TO EDIT: Dates, pricing, status messages          -->
<!-- FIND WITH: Search for "PRICING AND DATES" or "$75"      -->
<!-- ═══════════════════════════════════════════════════════ -->
```

**How to use them:**
- Search for the ALL CAPS section name (e.g., "PRICING AND DATES")
- Everything below that marker until the next marker is that section
- The "FIND WITH" line suggests search terms to find specific content

---

## What If I Break Something?

### Don't Panic!

The system has safety features:

1. **HTML Validation**: When you commit, an automatic check runs
   - ✅ If HTML is valid: Commit succeeds
   - ❌ If there's an error: You'll see a message with the line number
   - Just fix that line and try again

2. **Git History**: Every change is saved
   - You can always undo changes
   - Previous versions are never lost

3. **Developer Help**: If stuck, ask a developer
   - They can fix issues quickly
   - No change is permanent or unfixable

---

## Quick Reference Card

| Task | Search For | What to Change |
|------|-----------|----------------|
| Update price | "$75" or "PRICING" | Text between `<span>` tags |
| Update dates | "October 4" or "DATES" | Text with dates |
| Update tagline | "HERO SECTION" or current tagline | Text between `<p class="hook">` tags |
| Add FAQ | "FAQ SECTION" | Copy existing FAQ block, change text |
| Update creator bio | "CREATOR PROFILES" or creator name | Text in bio paragraphs |

---

## Common Questions

### "I can't find the text I want to update"

1. Make sure you're searching in `index.html` (not other files)
2. Try searching for just part of the text
3. Look for comment markers in ALL CAPS
4. Ask a developer if still stuck

### "My changes don't show on the live site"

1. Wait 1-2 minutes (deployment takes time)
2. Force refresh: Ctrl+Shift+R (or Cmd+Shift+R)
3. Try opening in incognito/private browsing mode
4. Check you pushed to the correct branch

### "The commit was blocked with an error"

1. Read the error message - it shows the line number
2. Go to that line in index.html
3. Common issue: missing closing tag (like `</div>`)
4. Fix the error and try committing again

### "What if I accidentally delete something important?"

Use git to undo:
```bash
# Undo changes before you've committed
git checkout index.html

# Undo the last commit
git revert HEAD
```

Or ask a developer to help restore it.

---

## Your First Edit (Practice)

Try this safe practice edit:

1. **Find**: Search for "FOOTER" in index.html
2. **Edit**: Find the line with production credits
3. **Change**: Add "(TEST)" to the end
4. **Save**: Save the file
5. **Preview**: Open in browser locally
6. **Commit**: Run `git add index.html` then `git commit -m "Test edit"`
7. **Check**: See if the commit succeeded (HTML validation ran)
8. **Undo**: Run `git revert HEAD` to undo the test change

**Congratulations!** You just completed the full workflow.

---

## Getting Help

### For Content Questions
- Ask the marketing team lead
- Reference: `MarketingLanguagePressRelease.md` for approved copy

### For Technical Issues
- **First**: Check `docs/CONTENT_GUIDE.md` (more detailed than this guide)
- **Then**: Ask a developer
- **Emergency**: Contact development team lead

### Useful Documentation
- **CONTENT_GUIDE.md**: Full guide with all content locations and troubleshooting
- **MIGRATION_GUIDE.md**: Where content moved during the refactor
- **DEPLOYMENT.md**: How deployment works (for developers)

---

## Tips for Success

### ✅ DO
- Use Ctrl+F to find content before editing
- Only change text between HTML tags
- Write clear commit messages ("Update pricing to $85" not "changes")
- Preview locally before pushing
- Ask for help when unsure

### ❌ DON'T
- Edit HTML tags, classes, or IDs (unless you know what you're doing)
- Delete comment markers (the big `<!-- ... -->` blocks)
- Skip HTML validation (don't use `git commit --no-verify`)
- Edit JavaScript code
- Panic if something breaks (it can be fixed!)

---

## Playtest Page Updates

### Update Playtest Event Details

**When**: Playtest date, time, or location changes

**How**:
1. Open `playtest.html` in your code editor
2. Press **Ctrl+F** (or Cmd+F on Mac)
3. Search for "EVENT DETAILS"
4. Find the detail values you need to change
5. Update the text (e.g., "Sept 21" → "Oct 5")
6. Save the file

**Example**:
```html
<!-- Before -->
<div class="detail-value">Sept 21</div>

<!-- After -->
<div class="detail-value">Oct 5</div>
```

**Time**: ~30 seconds

---

### Update Playtest Description

**When**: Event description or game details change

**How**:
1. Open `playtest.html`
2. Search for "PLAYTEST DESCRIPTION" or "90-minute"
3. Find the section marked with `<!-- EDITABLE CONTENT: PLAYTEST DESCRIPTION -->`
4. Edit the text within `<p class="game-description">` tags
5. Save

**Example**:
```html
<!-- Before -->
<p class="game-description">
    <strong>About Last Night</strong> is a 90-minute immersive crime thriller...
</p>

<!-- After -->
<p class="game-description">
    <strong>About Last Night</strong> is a 2-hour immersive crime thriller...
</p>
```

**Time**: ~1 minute

---

### Update Surveillance Protocol Consent

**When**: Photo/video consent policy changes

**How**:
1. Open `playtest.html`
2. Search for "SURVEILLANCE PROTOCOL"
3. Find the consent text and list items
4. Update the text as needed
5. Save

**Example**:
```html
<!-- Before -->
<li>Evidence photos during gameplay</li>

<!-- After -->
<li>Photos and video during gameplay</li>
```

**Time**: ~1 minute

---

## Next Steps

Now that you've read this guide:

1. **Try it yourself**: Make a small test edit (like the footer practice above)
2. **Bookmark this file**: You'll reference it often at first
3. **Read CONTENT_GUIDE.md**: More detailed documentation
4. **Ask questions**: Better to ask than guess!

---

**Welcome to the content team!** 🎉

You now have everything you need to update the About Last Night landing page. The more you practice, the faster you'll get.

Remember: The goal is < 2 minutes to update any piece of content. You'll hit that speed within a week.

---

**Last Updated**: 2025-01-19
**For**: About Last Night Landing Page
**Contact**: Development team for technical questions, marketing team for content questions
