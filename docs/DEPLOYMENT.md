# Deployment Guide

**About Last Night - Landing Page Deployment**

This guide covers deploying the refactored About Last Night landing page from the feature branch to production.

---

## Pre-Deployment Checklist

### Code Quality Checks

- [ ] All tasks in tasks.md marked complete (or documented as deferred)
- [ ] HTML validation hook is active and passing
- [ ] No uncommitted changes (`git status` shows clean)
- [ ] All CSS and JS files properly linked in index.html
- [ ] Comment markers in place for all content sections
- [ ] Documentation complete (CONTENT_GUIDE.md, MIGRATION_GUIDE.md)

### Functional Tests (Local)

- [ ] Open index.html in browser (file:// protocol)
- [ ] Visual check: All sections render correctly
- [ ] Responsive design: Resize browser, check mobile breakpoints
- [ ] Interactive elements work: Accordions expand/collapse
- [ ] Scroll effects work: Sticky header, parallax, fade-ins
- [ ] No console errors in browser dev tools

### Dependency Verification

- [ ] No package.json or node_modules directory exists
- [ ] Only allowed CDN: Google Fonts (fonts.googleapis.com, fonts.gstatic.com)
- [ ] No framework imports (React, Vue, jQuery, Angular, etc.)
- [ ] All external JS/CSS files are local (/css/, /js/ directories)

### Documentation Verification

- [ ] CONTENT_GUIDE.md complete with all content types documented
- [ ] MIGRATION_GUIDE.md shows old → new location mappings
- [ ] README.md updated with new structure (if needed)
- [ ] CLAUDE.md reflects new file organization

---

## Deployment Steps

### Step 1: Final Commit on Feature Branch

```bash
# Ensure you're on the feature branch
git checkout 001-content-first-refactor

# Check status
git status

# If changes exist, commit them
git add .
git commit -m "Final pre-deployment cleanup"

# Push to remote
git push origin 001-content-first-refactor
```

### Step 2: Merge to Main

```bash
# Switch to main branch
git checkout main

# Pull latest changes
git pull origin main

# Merge feature branch
git merge 001-content-first-refactor

# Resolve any conflicts if they exist
# Then commit the merge
git commit -m "Merge content-first refactor (001) - Separate CSS/JS, add comment markers, implement localStorage form recovery"
```

### Step 3: Push to Production

```bash
# Push to main (triggers GitHub Pages deployment)
git push origin main
```

### Step 4: Monitor Deployment

1. Go to GitHub repository → Actions tab
2. Watch deployment workflow complete (usually 1-2 minutes)
3. Check for any errors in the workflow

---

## Post-Deployment Validation

### Automated Checks

Wait 2-3 minutes after push, then verify:

- [ ] GitHub Pages deployment succeeded (check Actions tab)
- [ ] Site is accessible at https://aboutlastnightgame.com
- [ ] Force refresh browser (Ctrl+Shift+R / Cmd+Shift+R) to clear cache

### Visual Regression Testing

- [ ] Hero section displays correctly with tagline and CTA buttons
- [ ] Pricing/dates section shows current information
- [ ] FAQ accordions expand and collapse correctly
- [ ] Creator profiles display with names, roles, bios
- [ ] Footer shows correct contact information
- [ ] All images load properly
- [ ] Parallax scrolling effects work smoothly
- [ ] Sticky header appears on scroll

### Responsive Design Testing

- [ ] Desktop view (1920x1080): Layout is centered, images visible
- [ ] Tablet view (768px): Sections stack correctly
- [ ] Mobile view (375px): Touch targets are 44x44px minimum, text readable

### Form Functionality Testing (CRITICAL)

**⚠️ IMPORTANT**: Forms connect to live Google Apps Script endpoints

- [ ] Test main interest form submission:
  1. Enter email address
  2. Click "Initialize Protocol" button
  3. Verify success message appears
  4. Check Google Sheets for new submission
  5. Check email for confirmation message

- [ ] Test form validation:
  1. Try submitting without email
  2. Verify browser shows "required" error
  3. Try invalid email format
  4. Verify browser shows validation error

- [ ] Test localStorage recovery (advanced):
  1. Fill out form
  2. Disconnect internet
  3. Submit form (should fail)
  4. Reload page
  5. Verify recovery prompt appears
  6. Click "Restore Data"
  7. Verify form fields repopulate

### Performance Testing

- [ ] Run Lighthouse audit (Chrome DevTools → Lighthouse)
  - Target: First Contentful Paint (FCP) < 1.5s on 3G
  - Target: Cumulative Layout Shift (CLS) < 0.1
  - Target: Largest Contentful Paint (LCP) < 2.5s

- [ ] Check page load time on slow connection:
  1. Chrome DevTools → Network → Throttle to "Slow 3G"
  2. Hard refresh (Ctrl+Shift+R)
  3. Verify page loads in reasonable time

### Accessibility Testing

- [ ] Keyboard navigation:
  - Tab through all interactive elements
  - Enter key submits forms
  - Space/Enter toggles accordions
  - All focus indicators visible
  - No keyboard traps

- [ ] Screen reader testing (optional but recommended):
  - Use NVDA (Windows) or VoiceOver (Mac)
  - Verify sections announce correctly
  - Verify form labels are read
  - Verify link purposes are clear

### Content Editor Verification

- [ ] Have a content editor test updating pricing:
  1. Search for "$75" in index.html
  2. Update to test value
  3. Commit and push
  4. Verify change appears on live site within 2 minutes
  5. Measure time taken (should be < 2 minutes)

---

## Rollback Procedure

### If Critical Issue Discovered

If forms break, site doesn't load, or major visual bugs appear:

#### Option 1: Quick Revert (Recommended)

```bash
# Revert the merge commit
git revert -m 1 HEAD

# Push immediately
git push origin main
```

This creates a new commit that undoes the merge, preserving history.

#### Option 2: Hard Reset (Use Only If Option 1 Fails)

```bash
# Find the commit hash before the merge
git log --oneline

# Reset to that commit (replace <HASH> with actual hash)
git reset --hard <HASH>

# Force push (⚠️ DANGEROUS - only if necessary)
git push --force origin main
```

**WARNING**: Force push rewrites history. Only use if Option 1 fails.

#### Option 3: Restore from Pre-Refactor Backup Branch

```bash
# The pre-refactor-backup branch was created in T003
git checkout pre-refactor-backup

# Create a new branch from backup
git checkout -b emergency-restore

# Merge to main
git checkout main
git merge emergency-restore

# Push
git push origin main
```

### After Rollback

1. Notify team that site has been rolled back
2. Investigate issue on feature branch
3. Fix the problem
4. Re-test locally and on feature branch deployment
5. Re-attempt deployment when fix is confirmed

---

## Common Deployment Issues

### Issue: "Forms returning 404 errors"

**Cause**: Form endpoint URL might have changed

**Fix**:
1. Check FORM_HANDLER_GOOGLE_SCRIPT.js for correct endpoint
2. Verify index.html form action URL matches
3. Test endpoint directly with curl
4. Redeploy if URL was incorrect

### Issue: "CSS/JS files not loading (404)"

**Cause**: Incorrect file paths or missing files

**Fix**:
1. Check browser console for exact file path errors
2. Verify files exist in repository
3. Check file paths in index.html match actual locations
4. Ensure paths are relative (not absolute)

### Issue: "Site shows old content after deployment"

**Cause**: Browser cache or GitHub Pages cache

**Fix**:
1. Force refresh browser (Ctrl+Shift+R / Cmd+Shift+R)
2. Try incognito/private browsing mode
3. Wait 5-10 minutes for GitHub Pages CDN to update
4. Check deployment actually succeeded in GitHub Actions

### Issue: "HTML validation failing on deploy"

**Cause**: Git hook caught validation error

**Fix**:
1. Read error message (shows line number)
2. Fix HTML error in that line
3. Retry commit
4. Never use `git commit --no-verify` for deployment

---

## Deployment Checklist Summary

**Quick reference for deployment day:**

1. ✅ All pre-deployment checks pass
2. ✅ Merge feature branch to main
3. ✅ Push to main (triggers deployment)
4. ✅ Wait 2-3 minutes
5. ✅ Verify site loads at aboutlastnightgame.com
6. ✅ Test forms submission (check Google Sheets)
7. ✅ Run Lighthouse performance audit
8. ✅ Test keyboard navigation
9. ✅ Have content editor verify content update workflow
10. ✅ If all pass → Deployment complete! 🎉
11. ❌ If any fail → Rollback immediately, investigate on feature branch

---

## Emergency Contacts

- **Forms not working**: Contact Google Apps Script administrator
- **GitHub Pages issues**: Check GitHub Status (https://www.githubstatus.com)
- **DNS/Domain issues**: Contact domain registrar
- **General technical issues**: Contact development team lead

---

**Last Updated**: 2025-01-19
**For**: About Last Night Landing Page
**Branch**: 001-content-first-refactor
