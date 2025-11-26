# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Landing page for "About Last Night" - a 90-120 minute immersive crime thriller experience combining escape room puzzles, roleplay, and social deduction.

**Live Site:** aboutlastnightgame.com (GitHub Pages)
**Run Dates:** Preview Performances November 9-23, Full Run December 4-28, 2025
**Location:** Off the Couch Games, Fremont, CA

## Technology Stack

**Zero Dependencies Architecture**
- HTML5, CSS3, Vanilla JavaScript (no frameworks, no libraries, no build tools)
- Google Apps Script for form backend
- GitHub Pages for hosting (auto-deploys from main branch)
- Google Sheets for data storage
- Only allowed external CDN: Google Fonts

**No Build Process**
- Direct HTML, CSS, JS in repository
- No package.json, node_modules, webpack, or transpilers
- Changes deploy automatically via git push

## Core Design Principles

### Content-First Architecture (CRITICAL)
The **primary use case is updating copy** (event details, pricing, dates). Everything is optimized for non-technical team members making text changes without understanding code.

**Key architectural decision:** Content stays in `index.html` with distinctive comment markers (not extracted to JSON/partials) to preserve Ctrl+F searchability and avoid requiring editors to understand templating or data binding.

**Comment Marker Pattern:**
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: SECTION NAME                          -->
<!-- SAFE TO EDIT: What can be changed                       -->
<!-- FIND WITH: Search terms to locate this content          -->
<!-- ═══════════════════════════════════════════════════════ -->
```

Content editors search for ALL CAPS section names or specific text. Everything between markers is that section's content.

### File Organization Philosophy
```
HTML (index.html) = All content + structure (editable by non-technical users)
CSS (css/*.css)   = All visual styling (modular, maintainable by developers)
JS (js/*.js)      = All behavior (organized by concern)
```

**CSS Organization (css/ directory):**
- `base.css` - Reset, typography, CSS variables, global styling
- `layout.css` - Grid system, sections, responsive breakpoints
- `components.css` - FAQ items, buttons, cards, form styling
- `animations.css` - Keyframes, scroll effects, parallax backgrounds

**JavaScript Organization (js/ directory):**
- `utils.js` (~7.5KB) - Device detection, UTM parameter tracking, hidden field population
- `forms.js` (~12.8KB) - Form submission, localStorage recovery, retry logic with exponential backoff
- `interactions.js` (~16.1KB) - Accordions, sticky header, scroll effects, analytics (for index.html)
- `playtest-interactions.js` (~12KB) - Playtest-specific: spot counter, date selection, capacity fetching (for playtest.html)
- `feedback-interactions.js` (~3KB) - Feedback form: URL parameter parsing, form submission (for feedback.html)

### Progressive Enhancement
- Core content works without JavaScript
- Enhanced interactions layer on top (accordions, sticky header, parallax, form recovery)
- Accessibility preserved: WCAG AA compliance, keyboard navigation, screen reader support

## Common Development Tasks

### Deployment
```bash
git add .
git commit -m "description"
git push origin main
```
GitHub Pages auto-deploys from main branch. Changes live within 1-2 minutes.

**Pre-commit hook:** Automatically validates HTML structure using `tidy`. Blocks commits with validation errors and shows line numbers. Never use `git commit --no-verify` for deployment.

### Testing Locally
```bash
# Preview HTML directly (forms won't work)
open index.html  # macOS
xdg-open index.html  # Linux

# Test forms (requires local server)
python3 -m http.server
# Then visit http://localhost:8000
```

**Full testing requires deployment** - Push to GitHub Pages to test live forms against Google Apps Script backend.

### Post-Deployment Validation
1. Wait 2-3 minutes for GitHub Pages deployment
2. Force refresh browser: **Ctrl+Shift+R** (Cmd+Shift+R on macOS)
3. Check form submission works (verify in Google Sheets)
4. Run Lighthouse audit: FCP < 1.5s, LCP < 2.5s, CLS < 0.1
5. Test keyboard navigation

### Rollback Procedures
```bash
# Option 1: Revert (recommended - preserves history)
git revert -m 1 HEAD
git push origin main

# Option 2: Hard reset (emergency only - rewrites history)
git reset --hard <commit-hash>
git push --force origin main

# Option 3: Restore from backup branch
git checkout pre-refactor-backup
```

### Updating Form Backends
1. Edit `FORM_HANDLER_GOOGLE_SCRIPT.js`, `PLAYTEST_GOOGLE_SCRIPT.js`, or `FEEDBACK_GOOGLE_SCRIPT.js` locally
2. Copy to Google Apps Script editor
3. Deploy new version: Deploy → Manage deployments → Edit → New version
4. **Critical:** Update endpoint URL in corresponding JS file if deployment creates new endpoint:
   - Main form: `js/forms.js`
   - Playtest: `js/playtest-interactions.js`
   - Feedback: `js/feedback-interactions.js`

### Installing Git Hooks
Pre-commit hook validates HTML before allowing commits:
```bash
# Copy hook from .githooks to .git/hooks
cp .githooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Or configure git to use .githooks directory
git config core.hooksPath .githooks
```

Requires `tidy` for HTML validation:
```bash
# Ubuntu/Debian/WSL
sudo apt-get install tidy

# macOS
brew install tidy-html5
```

## Architecture Patterns

### Form Resilience System
**FormRecovery API** (`js/forms.js`):
- Saves form data to localStorage with 7-day TTL
- Auto-recovers on network failure
- User-prompted restoration on page reload

**RetryManager** (`js/forms.js`):
- Exponential backoff for failed submissions
- User-friendly error messages
- Network failure handling

### Data Flow: Form Submission
1. User fills form in `index.html`
2. `forms.js` captures submission
3. Saves to localStorage (for recovery)
4. Submits to Google Apps Script endpoint
5. Script stores in Google Sheets + sends confirmation email
6. Success message displayed or error shown with retry option

### Performance Architecture
- **Passive scroll listeners:** Non-blocking scroll tracking with 16ms debouncing
- **GPU acceleration:** CSS transforms/opacity for parallax and animations
- **Minimal DOM manipulation:** Progressive enhancement approach
- **No render-blocking resources:** Background images with parallax scrolling

## Form Integration Architecture

**Three separate forms with different backends:**

1. **Main Interest Form** (`index.html`)
   - Collects email for ticket launch notifications
   - Backend: `FORM_HANDLER_GOOGLE_SCRIPT.js`
   - Endpoint: Hardcoded in `js/forms.js`
   - Generates unique tracking ID (memory ID)

2. **Playtest Signup** (`playtest.html`)
   - Manages limited playtest spots with waitlist
   - Backend: `PLAYTEST_GOOGLE_SCRIPT.js`
   - Separate Google Apps Script deployment
   - Frontend: `js/playtest-interactions.js` (spot counter, date selection, capacity fetching)
   - **Date-agnostic architecture:** Backend dynamically discovers dates from database; content editors add/remove dates by editing HTML radio buttons only (no backend redeployment needed)

3. **Post-Show Feedback** (`feedback.html`)
   - Collects feedback after attendees experience the show
   - Backend: `FEEDBACK_GOOGLE_SCRIPT.js`
   - Frontend: `js/feedback-interactions.js` (URL param handling, form submission)
   - **URL parameter integration:** `?date=MMDD` pre-selects session date (e.g., `?date=1123`)
   - Links from post-show email with session-specific date parameter
   - Optional email capture for future updates mailing list

**Backend responsibilities** (Google Apps Script):
- Store submissions in Google Sheets
- Generate unique tracking IDs
- Send HTML-formatted confirmation emails (noir theme styling)
- Send alert emails to organizers

**Critical:** Form endpoint URLs are production. Breaking them breaks the live site.

### Playtest Multi-Date System Architecture

The playtest system supports multiple date options with independent capacity tracking:

**Frontend (playtest.html):**
- Radio buttons define available dates (format: `value="YYYY-MM-DD HH:MM"`)
- Spot counter displays capacity for currently selected date
- All date capacities loaded on page load (no fetch-on-select)
- Automatically disables past dates and auto-selects next available date
- User selection preserved across automatic 30-second capacity refreshes

**Backend (PLAYTEST_GOOGLE_SCRIPT.js):**
- **Date-agnostic design:** Accepts any date string from form submission
- Dynamically discovers dates from Google Sheets data (no hardcoded date list)
- GET request returns capacity data for all dates found in database
- Each date tracks capacity independently (20 spots, 5 minimum players)
- Waitlist positions assigned per-date when capacity reached

**Adding/Removing Playtest Dates:**
1. Edit radio buttons in `playtest.html` (search for "PLAYTEST DATES" marker)
2. Duplicate existing radio button block, update date/time/value
3. No backend redeployment required - backend discovers new dates automatically
4. Capacity system auto-initializes new dates (20 spots, 0 taken)

## Pre-Production Status

This project is in active development before launch:
- **Breaking changes are acceptable** - Refactor boldly when needed
- **Throw errors early** - Fail fast rather than silent fallbacks
- **No backwards compatibility required** - Optimize for best solution, not legacy support

## Important Files and Documentation

### Core Code Files
- `index.html` - Main landing page (all content)
- `playtest.html` - Playtest signup form
- `feedback.html` - Post-show feedback form
- `css/` - Modular stylesheets (base, layout, components, animations, playtest, feedback)
- `js/` - Modular JavaScript (utils, forms, interactions, playtest-interactions, feedback-interactions)
- `FORM_HANDLER_GOOGLE_SCRIPT.js` - Main form backend
- `PLAYTEST_GOOGLE_SCRIPT.js` - Playtest form backend
- `FEEDBACK_GOOGLE_SCRIPT.js` - Feedback form backend

### Documentation for Developers
- `docs/DEPLOYMENT.md` - Full deployment and rollback procedures
- `docs/MIGRATION_GUIDE.md` - Maps old→new file locations (post-refactor)
- `docs/COMMENT_MARKERS_TEST.md` - Test coverage for content markers
- `FORM_IMPLEMENTATION.md` - Form integration architecture and alternatives
- `PLAYTEST_SETUP_GUIDE.md` - Playtest system setup instructions
- `FEEDBACK_SETUP_GUIDE.md` - Feedback form setup instructions

### Documentation for Content Editors
- `docs/QUICKSTART_CONTENT_EDITORS.md` - 5-minute onboarding for non-technical users
- `docs/CONTENT_GUIDE.md` - Detailed content location reference and troubleshooting
- `MarketingLanguagePressRelease.md` - Approved marketing copy and messaging

### Feature Development (SpecKit Workflow)
This project uses SpecKit for structured feature development:
- `.specify/` - SpecKit configuration and scripts
- `specs/<feature-number>-<name>/` - Feature specifications with spec.md, plan.md, tasks.md
- `.claude/commands/` - Slash commands for SpecKit workflow (`/speckit.specify`, `/speckit.plan`, `/speckit.tasks`, `/speckit.implement`)
- `.specify/memory/constitution.md` - Project principles enforced during planning

## What Developers Need to Know

**Working effectively on this project:**

1. **Content is sacred** - Never move or restructure content without updating docs
2. **Comment markers are navigation** - They tell content editors where to find things
3. **Zero-dependency principle** - No npm packages, no frameworks, no build tools
4. **Git hooks are protective** - HTML validation runs pre-commit; never bypass
5. **Form endpoints are critical** - Test thoroughly, don't change URLs lightly
6. **Documentation is code** - Update guides when file structure changes
7. **Content editors are users** - Design for their experience, not developer convenience
8. **Time target:** < 2 minutes for content editor to update any piece of content
9. **Date management is content-first** - Playtest dates are added/removed in HTML only; backend discovers dates dynamically (no backend code changes needed)

## Critical Architectural Decisions

### Why Comment Markers Instead of Data Files?
Content editors use Ctrl+F to find text. Extracting content to JSON/data files would require:
- Understanding file relationships and data binding
- Running build processes to see changes
- Technical knowledge to map data → display location

Comment markers preserve "what you see is what you edit" while enabling direct file editing.

### Why Date-Agnostic Backend for Playtests?
Playtest dates change frequently during scheduling. Hardcoding dates in backend would require:
- Google Apps Script redeployment for every date change
- Developer involvement for content updates
- Potential for frontend/backend date mismatches

Date-agnostic design makes date management a pure content task (edit HTML radio buttons only).

## Google Apps Script Gotchas and Solutions

### POST Request Redirect Behavior
**Issue:** Google Apps Script Web Apps always return 302 redirects for POST requests. This is NORMAL behavior.
- Browsers automatically follow redirects → Forms work fine
- curl requires `-L` flag → Testing requires `curl -L`
- Content served from `script.googleusercontent.com`, not `script.google.com`

**Don't confuse curl failures with actual bugs** - If data appears in spreadsheet and emails send, the backend is working correctly.

### Google Sheets Auto-Converts Dates
**Critical Issue:** Google Sheets automatically converts text like "2025-10-26 15:00" to Date objects when stored in cells.

**Problem:**
- Frontend sends: `"2025-10-26 15:00"` (string)
- Sheets stores as: `Sun Oct 26 2025 08:00:00 GMT...` (Date object)
- String comparisons fail when counting signups

**Solution (MUST USE):**
```javascript
// In PLAYTEST_GOOGLE_SCRIPT.js doPost()
const rowData = [[name, email, timestamp, spotNum, status, consent, timestamp, selectedDate]];
sheet.getRange(nextRow, 1, 1, 8).setValues(rowData);
sheet.getRange(nextRow, 8).setNumberFormat('@');  // Force column H to plain text
```

**Key Points:**
- Always use `setNumberFormat('@')` on date columns after writing
- Use `setValues()` instead of `appendRow()` to enable post-write formatting
- Column H (index 8) must store dates as plain text strings for comparison logic

### Variable Scope in Google Apps Script
**Common Error:** `ReferenceError: [variable] is not defined`

**Cause:** JavaScript `const` and `let` are block-scoped. Variables declared inside `if` blocks are not accessible outside.

**Example of Bug:**
```javascript
if (formData.email) {
  const dateDisplay = formatDateForEmail(selectedDate);  // Scoped to if block
  // ... send user email
}
// dateDisplay NOT available here - organizer email will fail
```

**Solution:** Declare shared variables before conditional blocks.

### Testing Google Apps Script Locally
**You cannot test Google Apps Script locally.** The backend must be deployed to test:
1. Edit `.js` file locally
2. Copy entire file to Google Apps Script editor
3. Save in editor
4. Deploy → Manage deployments → Edit → New version
5. Test via GitHub Pages deployment (not localhost)

**Testing Checklist:**
- ✅ Data writes to Google Sheets
- ✅ User receives confirmation email
- ✅ Organizer receives notification email
- ✅ Frontend shows success message (not error)
- ✅ Spot counter updates immediately
- ✅ Capacity badges update correctly

## Common Debugging Patterns

### "Error on submit but data in spreadsheet"
**Diagnosis:** Backend succeeded but threw error after data write
**Check:**
1. Variable scope issues (using variables outside their scope)
2. Email sending failures (malformed addresses, quota exceeded)
3. Secondary operations failing after primary write

### "Spot counter shows wrong count"
**Diagnosis:** Date string comparison failing
**Check:**
1. Google Sheets column format (must be plain text, not date)
2. String normalization in comparison logic (`trim()` both sides)
3. Date format consistency (frontend and backend use same format)

### "Recovery prompt after successful submission"
**Diagnosis:** localStorage not cleared on success
**Check:**
1. `FormRecovery.clear()` called after confirmed success
2. Success detection happens before localStorage operations
3. No errors thrown between submission and clear

## Performance Standards

**Lighthouse Targets:**
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
- Time to Interactive: < 3s

**Validation:**
Run after every significant change:
```bash
# In Chrome DevTools
Lighthouse → Performance audit → Generate report
```

**Common Performance Pitfalls:**
- Render-blocking CSS/JS (avoid inline styles for critical content)
- Layout-thrashing animations (use `transform`/`opacity` only)
- Non-passive scroll listeners (always use `{passive: true}`)
- Unoptimized images (use appropriate formats and sizes)
