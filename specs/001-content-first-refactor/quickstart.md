# Quickstart: Content-First Codebase Refactor

**Feature**: Content-First Codebase Refactor
**Branch**: `001-content-first-refactor`
**Date**: 2025-01-19

## Overview

This guide helps developers quickly understand and start working on the content-first refactoring project. Read this first, then dive into detailed docs as needed.

---

## 5-Minute Summary

**What**: Refactor monolithic `index.html` into organized, maintainable structure optimized for non-technical content updates

**Why**: Content editors struggle to find and update text in current 1000-line HTML file, blocking marketing velocity

**How**: Separate CSS/JS, add clear comment markers, implement HTML validation git hooks, add localStorage form recovery

**Key Constraints**:
- ✅ Zero dependencies (no npm, no frameworks, no build tools)
- ✅ Forms MUST NOT break (production Google Apps Script endpoints)
- ✅ Content MUST remain searchable (Ctrl+F finds all text)
- ✅ GitHub Pages deployment (git push deploys in 1-2 minutes)

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [spec.md](./spec.md) | Full feature specification with requirements and user stories |
| [plan.md](./plan.md) | This implementation plan (constitution check, project structure) |
| [research.md](./research.md) | Research findings for HTML validation, file organization, localStorage |
| [data-model.md](./data-model.md) | Entity definitions and relationships |
| [contracts/](./contracts/) | API contracts for forms, localStorage, git hooks |
| [tasks.md](./tasks.md) | Task breakdown for implementation (**not yet created - run /speckit.tasks**) |

---

## Getting Started

### Prerequisites

```bash
# Install HTML validation tool
sudo apt-get install tidy

# Verify installation
tidy --version
# Should show: HTML Tidy for Linux version 5.x.x

# Clone and switch to feature branch
git checkout 001-content-first-refactor
```

### Project Structure

```
aboutlastnightgame/
├── index.html              # Current: ~1000 lines monolithic
│                          # Target: ~400 lines with clear sections
├── playtest.html          # Playtest signup (separate form)
│
├── specs/
│   └── 001-content-first-refactor/
│       ├── spec.md        # Feature specification
│       ├── plan.md        # This implementation plan
│       ├── research.md    # Technical research findings
│       ├── data-model.md  # Entity definitions
│       ├── quickstart.md  # This file
│       └── contracts/     # API contracts
│
└── (to be created during refactor)
    ├── css/
    │   ├── base.css       # Variables, resets, typography
    │   ├── layout.css     # Grid, sections, responsive
    │   ├── components.css # Reusable patterns
    │   └── animations.css # Parallax, transitions
    ├── js/
    │   ├── forms.js       # Form submission + localStorage
    │   ├── interactions.js # Accordions, sticky header
    │   └── utils.js       # Helpers, analytics
    ├── docs/
    │   ├── CONTENT_GUIDE.md     # For content editors
    │   └── MIGRATION_GUIDE.md   # Old → new locations
    └── .githooks/
        └── pre-commit     # HTML validation hook
```

---

## Key Decisions (from Research)

### 1. HTML Validation: HTML Tidy

**Decision**: Use HTML Tidy git hook to catch malformed HTML before commit

**Why**: Zero-dependency C binary, fast, clear error messages

**Installation**:
```bash
sudo apt-get install tidy

# Test validation
tidy -q -e index.html
```

**See**: [research.md](./research.md#1-html-validation-tooling)

### 2. File Organization: Comment-Marked Sections

**Decision**: Keep content in HTML with clear comment markers, NOT separate JSON/templates

**Why**: Preserves searchability (Ctrl+F), no build tools, WYSIWYG editing

**Example**:
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: PRICING AND DATES                     -->
<!-- SAFE TO EDIT: Update pricing, dates, and availability   -->
<!-- FIND WITH: Search for "PRICING AND DATES"               -->
<!-- ═══════════════════════════════════════════════════════ -->
<section class="pricing">
  <!-- PRICE: Main ticket price -->
  <p class="price">$75/person</p>
</section>
<!-- END CONTENT SECTION: PRICING AND DATES -->
```

**See**: [research.md](./research.md#2-file-organization-pattern)

### 3. Form Recovery: Save on Error + Exponential Backoff

**Decision**: localStorage recovery after submission failures, 7-day TTL, 3 retries with backoff

**Why**: Simple (save only when needed), resilient (survives backend downtime), low security risk

**API**: See [contracts/localstorage-recovery-api.yaml](./contracts/localstorage-recovery-api.yaml)

**See**: [research.md](./research.md#3-localstorage-form-recovery)

---

## Core Workflows

### Content Editor Updates Pricing

```
1. Open index.html in VS Code
2. Ctrl+F "PRICING"
3. Find comment marker: <!-- EDITABLE CONTENT: PRICING -->
4. Edit text: $75 → $85
5. Save file
6. git add index.html
7. git commit -m "Update pricing to $85"
   → Pre-commit hook validates HTML
   → If valid: commit succeeds
   → If invalid: fix error and retry
8. git push origin 001-content-first-refactor
9. GitHub Pages auto-deploys in 1-2 minutes
```

### Developer Extracts CSS

```
1. Create css/base.css
2. Copy <style> block from index.html
3. Organize into logical sections:
   - CSS variables
   - Resets
   - Typography
   - Utility classes
4. Link in index.html: <link rel="stylesheet" href="css/base.css">
5. Delete old <style> block
6. Test locally: open index.html in browser
7. Verify visual appearance unchanged
8. Test forms: submit to Google Sheets
9. Commit with clear message
10. Push and verify on GitHub Pages
```

### Developer Adds localStorage Recovery

```
1. Read contract: contracts/localstorage-recovery-api.yaml
2. Implement FormRecovery object in js/forms.js
3. Test edge cases:
   - Save valid data
   - Load after reload
   - Expiry after 7 days
   - QuotaExceededError handling
4. Integrate with form submission:
   - Save on error
   - Clear on success
5. Add recovery prompt UI
6. Test on GitHub Pages (not localhost - forms need real endpoint)
7. Verify data persists through backend failures
```

---

## Testing Strategy

### Before Every Commit

```bash
# Validate HTML manually
tidy -q -e index.html

# Expected output for valid HTML:
# (no output = success)

# Expected output for invalid HTML:
# line 42 column 15 - Warning: missing </div>
```

### Before Every Push

- [ ] Open index.html in browser (file:// protocol)
- [ ] Visual check: all sections render correctly
- [ ] Click all interactive elements (accordions, buttons)
- [ ] Scroll page (parallax, sticky header work)

### Before Merging to Main

- [ ] Deploy to GitHub Pages (push to feature branch)
- [ ] Test forms submit successfully to Google Sheets
- [ ] Check Google Sheets: new row appears
- [ ] Check email: confirmation received
- [ ] Test on mobile browser
- [ ] Test keyboard navigation (Tab, Enter, Space)
- [ ] Check localStorage recovery:
  - Submit form with backend down (disconnect internet)
  - Verify data saved
  - Reload page
  - Verify recovery prompt appears
  - Restore data and resubmit

---

## Critical Constraints

### ❌ DO NOT BREAK FORMS

**Forms are production infrastructure. Lost submissions = lost revenue.**

**Current endpoints**:
- Main interest form: https://script.google.com/macros/s/.../exec
- Playtest signup: https://script.google.com/macros/s/.../exec

**If you change form fields**:
1. ✅ Update backend Google Apps Script FIRST
2. ✅ Deploy new version to GAS
3. ✅ Test backend independently (curl)
4. ✅ Then update frontend HTML
5. ✅ Test on GitHub Pages deployment
6. ✅ Verify data in Google Sheets
7. ✅ Only then merge to main

**See**: [contracts/google-apps-script-form-submission.yaml](./contracts/google-apps-script-form-submission.yaml)

### ✅ PRESERVE Content Searchability

**Content editors must be able to find text via Ctrl+F.**

**Good**:
```html
<p>October 4 - November 9, 2025</p>
<!-- Text is in HTML, searchable -->
```

**Bad**:
```javascript
const dates = {start: "2025-10-04", end: "2025-11-09"};
// Text is in JavaScript, not searchable by content editors
```

### ✅ MAINTAIN Zero Dependencies

**No npm, no build tools, no frameworks.**

**Allowed**:
- HTML5, CSS3, ES6+ JavaScript
- Google Fonts CDN
- Google Apps Script (existing)

**Forbidden**:
- React, Vue, jQuery, any framework
- npm packages (even build-only)
- Sass, Less, PostCSS (no preprocessors)
- Webpack, Vite, Parcel (no bundlers)

---

## Common Tasks

### Add a new FAQ question

```html
<!-- Find existing FAQ section -->
<div class="faq-accordion">
  <button class="faq-question">Existing question?</button>
  <div class="faq-answer">Existing answer</div>
</div>

<!-- Copy structure, change text -->
<div class="faq-accordion">
  <button class="faq-question">New question?</button>
  <div class="faq-answer">New answer</div>
</div>
```

### Update event dates

```
1. Ctrl+F "event-dates" or "October 4"
2. Find all instances (hero, details, footer)
3. Update each instance
4. Commit with message: "Update event dates to [new dates]"
```

### Add HTML validation git hook

```bash
# Create .githooks directory
mkdir -p .githooks

# Create pre-commit hook (see contracts/html-validation-hook.yaml for script)
cat > .githooks/pre-commit << 'EOF'
#!/bin/bash
# [paste hook script from contract]
EOF

# Make executable
chmod +x .githooks/pre-commit

# Configure git to use .githooks
git config core.hooksPath .githooks

# Test hook
git add index.html
git commit -m "Test commit"
# Should run validation automatically
```

---

## Troubleshooting

### HTML validation fails with "missing </div>"

**Problem**: Unclosed tag in HTML

**Solution**:
```bash
# Find the line number in error message
# line 42 column 15 - Warning: missing </div>

# Open index.html, go to line 42
# Add the missing closing tag
# Retry commit
```

### Form submission returns 400 error

**Problem**: Backend validation failed (field mismatch)

**Solution**:
1. Check contract: contracts/google-apps-script-form-submission.yaml
2. Verify frontend field names match backend expectations
3. Check browser console for actual error message
4. Verify required fields are present

### localStorage not working in Safari

**Problem**: Safari private mode has 0 bytes quota

**Solution**:
This is expected - the FormRecovery.save() method returns false and fails gracefully. User can still submit form, just won't have recovery if it fails.

### Changes not appearing on live site

**Problem**: GitHub Pages cache

**Solution**:
```bash
# Force refresh in browser
# Ctrl+Shift+R (Linux/Windows)
# Cmd+Shift+R (Mac)

# Or check GitHub Pages deployment status
# GitHub repo → Settings → Pages
# Should show "Your site is live at..."

# Wait 1-2 minutes for deployment
```

---

## Next Steps

1. **Read the full spec**: [spec.md](./spec.md) - Understand all requirements and user stories
2. **Review constitution**: [../../.specify/memory/constitution.md](../../.specify/memory/constitution.md) - Core principles
3. **Study research findings**: [research.md](./research.md) - Detailed technical decisions
4. **Generate task list**: Run `/speckit.tasks` to break down implementation
5. **Start implementing**: Follow task list in dependency order

---

## Success Criteria

**You'll know this refactor is successful when**:

✅ Content editor can find and update pricing in < 2 minutes
✅ Content editor can add new FAQ question in < 5 minutes without help
✅ Forms still submit successfully after refactor (test in Google Sheets)
✅ Page load performance stays under 1.5s FCP on 3G
✅ All accessibility checks pass (WCAG AA, keyboard nav, screen reader)
✅ Git hook catches 100% of malformed HTML before commit
✅ Form data survives backend failures (localStorage recovery works)
✅ No external dependencies added (no package.json created)

---

## Questions?

- **Form integration**: See [FORM_IMPLEMENTATION.md](../../FORM_IMPLEMENTATION.md)
- **Playtest setup**: See [PLAYTEST_SETUP_GUIDE.md](../../PLAYTEST_SETUP_GUIDE.md)
- **Marketing copy**: See [MarketingLanguagePressRelease.md](../../MarketingLanguagePressRelease.md)
- **Project overview**: See [CLAUDE.md](../../CLAUDE.md)

---

**Last Updated**: 2025-01-19
**Status**: Planning complete, ready for implementation
**Next Phase**: Run `/speckit.tasks` to generate task breakdown
