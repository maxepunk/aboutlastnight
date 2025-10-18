# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Landing page for "About Last Night" - a 90-120 minute immersive crime thriller experience combining escape room puzzles, roleplay, and social deduction.

**Live Site:** aboutlastnightgame.com (GitHub Pages)
**Run Dates:** November 14 - December 28, 2025
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
- `interactions.js` (~16.1KB) - Accordions, sticky header, scroll effects, analytics

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
1. Edit `FORM_HANDLER_GOOGLE_SCRIPT.js` or `PLAYTEST_GOOGLE_SCRIPT.js` locally
2. Copy to Google Apps Script editor
3. Deploy new version: Deploy → Manage deployments → Edit → New version
4. **Critical:** Update endpoint URL in `js/forms.js` if deployment creates new endpoint

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

**Two separate forms with different backends:**

1. **Main Interest Form** (`index.html`)
   - Collects email for ticket launch notifications
   - Backend: `FORM_HANDLER_GOOGLE_SCRIPT.js`
   - Endpoint: Hardcoded in `js/forms.js`
   - Generates unique tracking ID (memory ID)

2. **Playtest Signup** (`playtest.html`)
   - Manages limited playtest spots with waitlist
   - Backend: `PLAYTEST_GOOGLE_SCRIPT.js`
   - Separate Google Apps Script deployment

**Backend responsibilities** (Google Apps Script):
- Store submissions in Google Sheets
- Generate unique tracking IDs
- Send HTML-formatted confirmation emails (noir theme styling)
- Send alert emails to organizers

**Critical:** Form endpoint URLs are production. Breaking them breaks the live site.

## Pre-Production Status

This project is in active development before launch:
- **Breaking changes are acceptable** - Refactor boldly when needed
- **Throw errors early** - Fail fast rather than silent fallbacks
- **No backwards compatibility required** - Optimize for best solution, not legacy support

## Important Files and Documentation

### Core Code Files
- `index.html` - Main landing page (all content)
- `playtest.html` - Playtest signup form
- `css/` - Modular stylesheets (base, layout, components, animations)
- `js/` - Modular JavaScript (utils, forms, interactions)
- `FORM_HANDLER_GOOGLE_SCRIPT.js` - Main form backend
- `PLAYTEST_GOOGLE_SCRIPT.js` - Playtest form backend

### Documentation for Developers
- `docs/DEPLOYMENT.md` - Full deployment and rollback procedures
- `docs/MIGRATION_GUIDE.md` - Maps old→new file locations (post-refactor)
- `docs/COMMENT_MARKERS_TEST.md` - Test coverage for content markers
- `FORM_IMPLEMENTATION.md` - Form integration architecture and alternatives
- `PLAYTEST_SETUP_GUIDE.md` - Playtest system setup instructions

### Documentation for Content Editors
- `docs/QUICKSTART_CONTENT_EDITORS.md` - 5-minute onboarding for non-technical users
- `docs/CONTENT_GUIDE.md` - Detailed content location reference and troubleshooting
- `MarketingLanguagePressRelease.md` - Approved marketing copy and messaging

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
