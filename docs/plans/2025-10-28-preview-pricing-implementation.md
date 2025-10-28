# Preview Pricing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update website content to reflect three-tier preview pricing structure for November performances.

**Architecture:** Content-first updates to HTML files and Google Apps Script email templates. No new features or backend logic changes. Maintains existing comment marker structure for content editor navigation.

**Tech Stack:** HTML5, Google Apps Script (backend email templates)

**Design Document:** `docs/plans/2025-10-28-preview-pricing-content-design.md`

---

## Pricing Structure Reference

| Dates | Price | Type |
|-------|-------|------|
| Nov 9, 14, 16 | $35/person | Preview Week 1 |
| Nov 21, 22, 23 | $60/person | Preview Week 2 |
| Dec 4 - Dec 28 | $75/person | Full Run |

---

## Task 1: Update Booking Bar (Hero Section)

**Files:**
- Modify: `index.html:53-67` (PRICING AND DATES section)

**Step 1: Read current booking bar structure**

Read lines 53-67 of index.html to verify current structure and understand existing layout.

**Step 2: Replace booking bar content**

Replace the content inside `.booking-dates` div (lines 56-63) with new two-line structure:

**Old content (lines 56-63):**
```html
<span style="color: rgba(204, 0, 0, 0.7); font-weight: 700; letter-spacing: 0.15em; margin-right: 1rem;">CASE #ALN-2025</span>
<span class="preview-dates">STATUS: ACCEPTING INVESTIGATORS</span>
<span class="divider">•</span>
<!-- <span class="main-dates">Oct 4-12 Preview</span>
<span class="divider">•</span> -->
<span class="min-players">Nov 14- Dec 28</span>
<span class="divider">•</span>
<span style="color: rgba(204, 0, 0, 0.9);">$75/person</span>
```

**New content:**
```html
<span style="color: rgba(204, 0, 0, 0.7); font-weight: 700; letter-spacing: 0.15em; margin-right: 1rem;">CASE #ALN-2025</span>
<span class="preview-dates">STATUS: ACCEPTING INVESTIGATORS</span>
<span class="divider">•</span>
<span class="preview-line">Preview Investigations: Nov 9-23 (from $35)</span>
<span class="divider">•</span>
<span class="main-run-line">Full Run: Dec 4-28 ($75/person)</span>
```

**Step 3: Verify comment markers intact**

Check that the comment markers before (lines 47-51) and after (line 68) the booking bar remain unchanged:
- `<!-- EDITABLE CONTENT: PRICING AND DATES -->`
- `<!-- END CONTENT SECTION: PRICING AND DATES -->`

**Step 4: Test booking bar display locally**

```bash
# Start local server
python3 -m http.server 8000

# Open in browser
# Visit: http://localhost:8000/index.html
```

**Visual checks:**
- Booking bar displays two price lines
- Text is readable (not cramped)
- Preview and Full Run are distinguishable
- Sticky behavior still works on scroll

**Step 5: Test mobile responsive layout**

In browser DevTools:
- Switch to mobile view (iPhone 12, 390px width)
- Verify booking bar text wraps appropriately
- Check that both price lines are visible
- Verify CTA button remains accessible

**Step 6: Commit booking bar changes**

```bash
git add index.html
git commit -m "feat: update booking bar with preview pricing tiers

- Add two-line pricing layout for preview vs full run
- Preview investigations: Nov 9-23 (from $35)
- Full run: Dec 4-28 ($75/person)
- Maintains existing sticky header behavior

Ref: docs/plans/2025-10-28-preview-pricing-content-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: Update FAQ - "When and where?"

**Files:**
- Modify: `index.html:301-306` (FAQ section)

**Step 1: Locate FAQ item**

Search for "When and where?" in index.html to locate the FAQ item (should be around line 301).

**Step 2: Update FAQ answer content**

Replace the `<p class="faq-answer">` content:

**Old content (lines 302-306):**
```html
<p class="faq-answer">Off the Couch Games in Fremont, CA<br>
555 Mowry Avenue. Fremont, CA 94536<br>
Novermber 14 - December 28<br>
Thursday-Sunday performances, multiple time slots<br>
```

**New content:**
```html
<p class="faq-answer">Off the Couch Games in Fremont, CA<br>
555 Mowry Avenue, Fremont, CA 94536<br>
Preview Investigations: November 9, 14, 16, 21, 22, 23<br>
Full Run: December 4 - December 28<br>
Thursday-Sunday performances, multiple time slots<br>
```

**Changes made:**
- Fixed typo: "Novermber" → "November" (and used full month name)
- Added comma after "Mowry Avenue" (grammar fix)
- Listed specific preview dates
- Separated preview from full run

**Step 3: Verify in browser**

```bash
# If server not running:
python3 -m http.server 8000
```

Navigate to FAQ section and verify:
- Preview dates are clearly listed
- Full run dates are distinct
- No typos in month names
- Line breaks render correctly

**Step 4: Commit FAQ date updates**

```bash
git add index.html
git commit -m "fix: update FAQ dates for preview performances

When and where? section:
- Fix typo: Novermber → November
- Add preview dates: Nov 9, 14, 16, 21, 22, 23
- Separate preview from full run (Dec 4-28)
- Add comma after Mowry Avenue

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: Update FAQ - "How much does it cost?"

**Files:**
- Modify: `index.html:295-296` (FAQ section)

**Step 1: Locate pricing FAQ item**

Search for "How much does it cost?" in index.html (should be around line 295).

**Step 2: Update FAQ answer with tiered pricing**

Replace the `<p class="faq-answer">` content:

**Old content (line 296):**
```html
<p class="faq-answer">$75 per person for the full investigation. Contact us for corporate packages</p>
```

**New content:**
```html
<p class="faq-answer">Preview Investigations (November 9-23): $35-60 per person<br>
Full Run (December 4 onwards): $75 per person<br>
<br>
Preview pricing:<br>
• November 9, 14, 16: $35/person<br>
• November 21, 22, 23: $60/person<br>
<br>
Contact us for corporate packages</p>
```

**Step 3: Verify FAQ rendering**

In browser at http://localhost:8000/index.html:
- Navigate to FAQ section
- Verify pricing tiers display clearly
- Check bullet points render correctly (• character)
- Confirm line breaks create proper spacing
- Verify corporate packages note preserved

**Step 4: Test FAQ accordion behavior**

Click on "How much does it cost?" question:
- Accordion should expand/collapse smoothly
- Content should be fully visible when expanded
- No text overflow or truncation

**Step 5: Commit pricing FAQ updates**

```bash
git add index.html
git commit -m "feat: add tiered preview pricing to FAQ

How much does it cost? section:
- Add preview pricing tiers: $35-60 (Nov 9-23)
- Full run pricing: $75 (Dec 4 onwards)
- Detailed breakdown by specific dates
- Preserve corporate packages note

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: Update Meta Description (SEO)

**Files:**
- Modify: `index.html:7` (HTML head)

**Step 1: Locate meta description tag**

Read line 7 of index.html to view current meta description.

**Step 2: Update meta description content**

Replace the entire `<meta name="description">` tag:

**Old content (line 7):**
```html
<meta name="description" content="Some memories are worth killing for. A 90-120 minute immersive crime thriller in Silicon Valley. Novermber 14-December 28, 2025.">
```

**New content:**
```html
<meta name="description" content="Some memories are worth killing for. A 2 hour immersive crime thriller in Silicon Valley. Preview performances November 9-23, full run December 4-28, 2025.">
```

**Changes made:**
- Fixed typo: "Novermber" → "November"
- Updated duration: "90-120 minute" → "2 hour" (cleaner, more specific)
- Added preview dates for search visibility
- Character count: 158 (within 155-160 optimal range)

**Step 3: Verify meta description**

View page source in browser:
- Right-click → View Page Source
- Find `<meta name="description">`
- Verify new content is correct
- Check for any HTML encoding issues

**Step 4: Test SEO preview**

Use a meta tag checker tool or inspect in browser DevTools:
```
# In browser console:
document.querySelector('meta[name="description"]').content
```

Should output the new description text.

**Step 5: Commit meta description update**

```bash
git add index.html
git commit -m "fix: update meta description with preview dates

- Fix typo: Novermber → November
- Update duration: 2 hour (was 90-120 minute)
- Add preview performances: Nov 9-23
- Full run: Dec 4-28
- Character count: 158 (SEO-optimized)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Update Confirmation Email Backend

**Files:**
- Modify: `FORM_HANDLER_GOOGLE_SCRIPT.js:50` (date range)
- Modify: `FORM_HANDLER_GOOGLE_SCRIPT.js:56` (pricing)

**Context:** This file is deployed to Google Apps Script. Changes must be:
1. Made locally first
2. Copied to Google Apps Script editor
3. Deployed as new version
4. No endpoint URL change needed (same deployment)

**Step 1: Read current email template**

Read lines 40-70 of FORM_HANDLER_GOOGLE_SCRIPT.js to understand email structure.

**Step 2: Update email date range (line 50)**

Locate the line with "Investigation Ongoing" and date range.

**Old content (line 50):**
```javascript
Investigation Ongoing: <strong style="color: #cc0000;">NOV 14 - DEC 28:</strong>
```

**New content (around line 50):**
```javascript
Investigation Ongoing: <strong style="color: #cc0000;">NOV 9 - DEC 28</strong><br>
Preview performances November 9-23, full run opens December 4.
```

**Step 3: Update email pricing section (line 56)**

Locate the pricing line in the email template.

**Old content (line 56):**
```javascript
<strong>Price:</strong> $75 per investigator
```

**New content (around line 56):**
```javascript
<strong>Preview Pricing:</strong> $35-60 per person (Nov 9-23)<br>
<strong>Full Run:</strong> $75 per person (Dec 4 onwards)<br>
<br>
<strong>Preview tiers:</strong><br>
• November 9, 14, 16: $35/person<br>
• November 21, 22, 23: $60/person
```

**Step 4: Verify HTML email formatting**

Check that:
- All `<br>` tags are properly placed
- `<strong>` tags are closed
- Bullet character (•) is present
- No stray quotes or JavaScript syntax errors
- Indentation matches rest of file

**Step 5: Test email template locally (validation only)**

```bash
# Basic syntax check (JavaScript parsing)
node -c FORM_HANDLER_GOOGLE_SCRIPT.js
```

Expected: No syntax errors

**Step 6: Commit local changes**

```bash
git add FORM_HANDLER_GOOGLE_SCRIPT.js
git commit -m "feat: update confirmation email with preview pricing

- Update date range: Nov 9 - Dec 28
- Add preview period description
- Replace single $75 price with tiered structure
- List all three price tiers for clarity

Note: Requires redeployment to Google Apps Script.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

**Step 7: Deploy to Google Apps Script**

**Manual deployment steps (cannot be automated):**

1. Open Google Apps Script editor:
   - Visit: https://script.google.com/
   - Open your "About Last Night - Form Handler" project

2. Copy updated code:
   ```bash
   cat FORM_HANDLER_GOOGLE_SCRIPT.js
   # Copy the entire output
   ```

3. Paste into Google Apps Script editor

4. Save: Click "Save project" icon or Ctrl+S

5. Deploy new version:
   - Click "Deploy" → "Manage deployments"
   - Click ✏️ (edit) on existing deployment
   - Click "New version"
   - Add description: "Preview pricing update - Nov 2025"
   - Click "Deploy"

6. Verify deployment:
   - Endpoint URL should remain the same
   - Note the new version number

**Step 8: Test email delivery**

Option A: Test via playtest form (if safe):
- Fill out form with test email
- Check that confirmation email arrives
- Verify preview pricing displays correctly
- Verify HTML formatting renders properly

Option B: Use Google Apps Script test function:
- In Apps Script editor, run `testEmail()` function (if exists)
- Or send test email to yourself manually

**Email rendering checks:**
- Gmail: Check desktop and mobile app
- Outlook: Check web version
- Apple Mail: If accessible
- Verify bullet points render (•)
- Verify line breaks appear correctly
- Verify bold text shows up

---

## Task 6: Update Documentation

**Files:**
- Modify: `CLAUDE.md:10` (project overview)
- Modify: `docs/CONTENT_GUIDE.md:47-64` (content editor instructions)

**Step 1: Update CLAUDE.md run dates**

**Old content (line 10):**
```markdown
**Run Dates:** November 14 - December 28, 2025
```

**New content:**
```markdown
**Run Dates:** Preview Performances November 9-23, Full Run December 4-28, 2025
```

**Step 2: Update CONTENT_GUIDE.md pricing examples**

Search for references to "$75" or "November 14" in docs/CONTENT_GUIDE.md.

Update any examples that reference:
- Old start date (Nov 14)
- Single pricing ($75)

Add note about preview pricing tiers in the "Pricing and Dates Section" (around lines 47-64).

**Example addition:**
```markdown
### Preview Pricing (November 2025)

The show has three pricing tiers:
- Preview Week 1 (Nov 9, 14, 16): $35/person
- Preview Week 2 (Nov 21, 22, 23): $60/person
- Full Run (Dec 4-28): $75/person

Search for "PRICING AND DATES" to find the booking bar.
Search for "How much does it cost?" to find FAQ pricing.
```

**Step 3: Commit documentation updates**

```bash
git add CLAUDE.md docs/CONTENT_GUIDE.md
git commit -m "docs: update run dates and pricing in documentation

- CLAUDE.md: Update run dates to include preview period
- CONTENT_GUIDE.md: Add preview pricing tier reference
- Helps future content editors understand pricing structure

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: Visual Regression Testing

**Manual testing checklist** (no automated tests needed)

**Desktop testing (1920x1080):**

- [ ] Booking bar displays two price lines clearly
- [ ] Preview and full run prices are distinguishable
- [ ] Sticky header works on scroll
- [ ] FAQ section shows all pricing tiers
- [ ] All dates display with full month names
- [ ] No typos in "November" or "December"
- [ ] Bullet points (•) render in FAQ
- [ ] Line breaks in FAQ create proper spacing

**Tablet testing (768px - iPad):**

- [ ] Booking bar remains readable
- [ ] CTA button still visible
- [ ] FAQ accordions work smoothly
- [ ] Pricing tiers don't overflow

**Mobile testing (390px - iPhone 12):**

- [ ] Booking bar text wraps appropriately
- [ ] Both price lines visible without horizontal scroll
- [ ] FAQ content readable when expanded
- [ ] No text truncation
- [ ] Touch targets for FAQ accordions are adequate (44px+)

**Cross-browser testing:**

- [ ] Chrome: All elements display correctly
- [ ] Firefox: Check bullet point rendering
- [ ] Safari: Test on macOS or iOS if available
- [ ] Edge: Verify sticky header behavior

**Email testing (if deployed):**

- [ ] Gmail desktop: Preview pricing displays correctly
- [ ] Gmail mobile app: HTML renders properly
- [ ] Outlook web: Check bullet points and line breaks
- [ ] Apple Mail (if available): Verify formatting

**SEO validation:**

```bash
# View meta description
curl -s http://localhost:8000/index.html | grep -A 1 'meta name="description"'
```

Expected output includes:
- "2 hour immersive crime thriller"
- "Preview performances November 9-23"
- "December 4-28, 2025"
- No typo "Novermber"

---

## Task 8: Pre-Deployment Validation

**Files to check before pushing to GitHub Pages:**

**Step 1: Run HTML validation**

```bash
# Pre-commit hook will run this automatically, but test manually:
tidy -q -e index.html
```

Expected: No errors (warnings are acceptable)

**Step 2: Verify all commits made**

```bash
git log --oneline -7
```

Expected commits:
1. feat: update booking bar with preview pricing tiers
2. fix: update FAQ dates for preview performances
3. feat: add tiered preview pricing to FAQ
4. fix: update meta description with preview dates
5. feat: update confirmation email with preview pricing
6. docs: update run dates and pricing in documentation
7. docs: add preview pricing content design

**Step 3: Check git status**

```bash
git status
```

Expected: Working directory clean (no uncommitted changes)

**Step 4: Review diff summary**

```bash
git diff HEAD~7 --stat
```

Expected changes:
- `index.html` (multiple sections)
- `FORM_HANDLER_GOOGLE_SCRIPT.js` (email template)
- `CLAUDE.md` (run dates)
- `docs/CONTENT_GUIDE.md` (pricing examples)
- `docs/plans/2025-10-28-preview-pricing-content-design.md` (new file)
- `docs/plans/2025-10-28-preview-pricing-implementation.md` (new file)

**Step 5: Final local test**

```bash
# Start fresh server
python3 -m http.server 8000
```

Manually verify in browser:
- http://localhost:8000/index.html
- Booking bar shows preview pricing
- FAQ shows all tiers
- No JavaScript console errors
- All images load

**Step 6: Create checkpoint commit (optional)**

If all validation passes and you want a rollback point:

```bash
git tag preview-pricing-checkpoint
git push origin preview-pricing-checkpoint
```

---

## Task 9: Deploy to Production (GitHub Pages)

**Pre-deployment checklist:**

- [ ] All 6 implementation commits made
- [ ] HTML validation passes (tidy)
- [ ] Local testing complete (desktop, mobile)
- [ ] Google Apps Script deployed (email backend)
- [ ] Documentation updated
- [ ] No uncommitted changes (`git status` clean)

**Step 1: Push to GitHub**

```bash
# Push to main branch (triggers GitHub Pages deployment)
git push origin main
```

**Step 2: Monitor GitHub Pages deployment**

Visit: https://github.com/[your-username]/aboutlastnightgame/actions

- Check that GitHub Actions workflow starts
- Wait for "pages build and deployment" to complete (typically 1-2 minutes)
- Verify green checkmark ✓

**Step 3: Wait for deployment to propagate**

GitHub Pages deployment typically takes 2-3 minutes after the Actions workflow completes.

```bash
# Wait 2-3 minutes, then check:
date
```

**Step 4: Verify live site**

Visit: https://aboutlastnightgame.com

**Force refresh (bypass cache):**
- Chrome/Edge: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
- Firefox: Ctrl+F5 (Windows) or Cmd+Shift+R (Mac)
- Safari: Cmd+Option+R (Mac)

**Verify all changes:**
- [ ] Booking bar shows preview pricing (two lines)
- [ ] FAQ "When and where?" shows preview dates
- [ ] FAQ "How much does it cost?" shows tiers
- [ ] Meta description updated (view page source)
- [ ] No 404 errors
- [ ] No JavaScript console errors
- [ ] Images load correctly

**Step 5: Test live email delivery (if safe)**

If form submission is safe to test:
1. Submit interest form with test email
2. Wait 1-2 minutes for confirmation email
3. Check inbox for confirmation
4. Verify preview pricing appears in email
5. Verify HTML formatting correct

**If email testing not safe:**
- Skip to Task 10 (post-deployment validation)
- Email testing can be done later when a real user submits

**Step 6: Check mobile live site**

Test on real mobile device if possible:
- Visit aboutlastnightgame.com on phone
- Verify booking bar readable
- Check FAQ displays correctly
- Test that sticky header works on scroll

---

## Task 10: Post-Deployment Validation

**Run Lighthouse audit** (performance validation)

In Chrome DevTools:
1. Open aboutlastnightgame.com
2. F12 → Lighthouse tab
3. Select "Performance" only
4. Click "Analyze page load"

**Targets from CLAUDE.md:**
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Cumulative Layout Shift: < 0.1
- Time to Interactive: < 3s

**If any target missed:**
- Check if booking bar changes caused layout shift
- Investigate if new content increased page weight
- Consider CSS optimization if needed

**Step 1: Accessibility check**

Test keyboard navigation:
- Tab through page elements
- Verify FAQ accordions work with Enter key
- Check that booking bar CTA is focusable
- Ensure skip links (if present) work

**Step 2: Search engine preview**

Use Google Rich Results Test:
- Visit: https://search.google.com/test/rich-results
- Enter: aboutlastnightgame.com
- Verify meta description appears correctly

Or use browser extension (SEO Meta in 1 Click, etc.)

**Step 3: Create rollback documentation**

Document current commit for easy rollback if needed:

```bash
# Get current commit hash
git rev-parse HEAD

# Add to rollback notes
echo "Preview pricing deployed: $(git rev-parse HEAD)" >> docs/DEPLOYMENT_LOG.md
echo "Date: $(date)" >> docs/DEPLOYMENT_LOG.md
echo "Changes: Booking bar, FAQ, meta description, confirmation email" >> docs/DEPLOYMENT_LOG.md
```

**Step 4: Monitor for issues**

For the next 24-48 hours:
- Check Google Analytics (if set up) for bounce rate changes
- Monitor form submissions (Google Sheets)
- Check email delivery success rate
- Watch for any user-reported issues

**Step 5: Update stakeholders (if applicable)**

Notify team/stakeholders:
- Preview pricing is now live
- All three tiers displayed on website
- Confirmation emails updated
- Provide link to live site

---

## Rollback Procedures (If Needed)

**If critical issue found after deployment:**

**Option 1: Quick revert (recommended)**

```bash
# Revert the most recent preview pricing commits
git revert HEAD~6..HEAD

# Push revert commits
git push origin main
```

Wait 2-3 minutes for GitHub Pages to redeploy.

**Option 2: Hard reset (emergency only)**

```bash
# Find commit hash before preview pricing changes
git log --oneline

# Reset to that commit
git reset --hard <commit-hash-before-changes>

# Force push (DANGER: rewrites history)
git push --force origin main
```

**Option 3: Restore from tag**

If checkpoint tag was created:

```bash
git checkout preview-pricing-checkpoint
git push origin main
```

**After rollback:**
1. Notify stakeholders
2. Investigate issue
3. Fix in separate branch
4. Re-test thoroughly
5. Re-deploy when ready

---

## Success Criteria

Implementation is complete when:

- ✅ Booking bar displays two-line preview pricing
- ✅ FAQ section shows all three pricing tiers
- ✅ Meta description includes preview dates
- ✅ Confirmation email template updated (deployed to Google Apps Script)
- ✅ Documentation updated (CLAUDE.md, CONTENT_GUIDE.md)
- ✅ All commits pushed to main branch
- ✅ GitHub Pages deployment successful
- ✅ Live site displays changes correctly
- ✅ Mobile responsive layout works
- ✅ No HTML validation errors
- ✅ No JavaScript console errors
- ✅ Lighthouse performance targets met

---

## Files Modified Summary

| File | Lines Changed | Type |
|------|---------------|------|
| `index.html` | 7, 56-63, 296, 302-306 | Content |
| `FORM_HANDLER_GOOGLE_SCRIPT.js` | 50, 56 | Email template |
| `CLAUDE.md` | 10 | Documentation |
| `docs/CONTENT_GUIDE.md` | 47-64 | Documentation |
| `docs/plans/2025-10-28-preview-pricing-content-design.md` | New file | Design doc |
| `docs/plans/2025-10-28-preview-pricing-implementation.md` | New file | Implementation plan |

**Total estimated time:** 60-90 minutes (including testing and deployment)

**Critical path items:**
1. HTML content updates (Tasks 1-4): 30 minutes
2. Google Apps Script deployment (Task 5): 15 minutes
3. Testing and validation (Tasks 7-8): 20 minutes
4. Deployment and monitoring (Tasks 9-10): 15 minutes

---

## Notes for Engineer

**Important gotchas:**

1. **Google Apps Script deployment:** Cannot be automated. You must manually copy code to Apps Script editor and deploy. Endpoint URL does NOT change.

2. **GitHub Pages cache:** Always force-refresh (Ctrl+Shift+R) after deployment. Otherwise you'll see stale content for 5-10 minutes.

3. **Comment markers:** Do NOT remove or modify comment markers like `<!-- EDITABLE CONTENT: -->`. Content editors rely on these for navigation.

4. **Bullet character (•):** Copy-paste this character exactly. Do not substitute with asterisks or hyphens.

5. **No CSS changes needed:** Existing `.booking-dates` class already handles multi-line layout. No new CSS required.

6. **Email HTML:** Be careful with quotes inside JavaScript strings. Use `<br>` not `<br/>` for consistency with existing code.

7. **Testing limitations:** No automated tests for content changes. Rely on visual regression testing and HTML validation.

8. **Rollback safety:** All changes are content-only. Rollback is safe and won't break functionality.

**Testing shortcuts:**

- Use `tidy` for HTML validation (pre-commit hook runs this automatically)
- Test email rendering at https://www.mail-tester.com/ if needed
- Use browser DevTools mobile emulation (faster than real device testing)

**Reference documents:**

- Design rationale: `docs/plans/2025-10-28-preview-pricing-content-design.md`
- Content editor guide: `docs/CONTENT_GUIDE.md`
- Deployment procedures: `docs/DEPLOYMENT.md`
- Project architecture: `CLAUDE.md`
