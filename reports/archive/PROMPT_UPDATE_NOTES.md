# System Prompt Update - Final Assessment Fix

**Date:** 2025-11-22
**Issue:** Final Assessment section rendered as 6 separate styled boxes instead of one unified conclusion

## Changes Made

### 1. Updated System Prompt (detlogv3.html)

**New guidance added:**
- Explicit instruction to use `<hr>` for section breaks (not `---`)
- Reduced use of `<p class="note">` to 1-2 brief asides per section
- **Critical:** New Final Assessment structure template showing proper HTML nesting

**Key instruction:**
```
The entire Final Assessment section, including signature, must be
wrapped in ONE <div class="note">...</div> container,
NOT separate <p class="note"> tags.
```

### 2. Added CSS Styling (detlogv3.html)

**For `<hr>` elements:**
```css
hr {
    border: none;
    border-top: 1px solid rgba(100, 100, 100, 0.3);
    margin: 40px 0;
    opacity: 0.5;
}
```

**For nested paragraphs in `.note` divs:**
```css
.note p {
    margin-bottom: 16px;
}

.note p:last-child {
    margin-bottom: 0;
}
```

This allows proper paragraph spacing WITHIN a `.note` div while preventing the 35px gaps between separate `.note` paragraphs.

## Expected Results

### Before:
```
┌──────────────────────────┐
│ Final Assessment:        │
└──────────────────────────┘
        [35px gap]
┌──────────────────────────┐
│ Marcus Blackwood...      │
└──────────────────────────┘
        [35px gap]
┌──────────────────────────┐
│ But this wasn't...       │
└──────────────────────────┘
```

### After:
```
┌────────────────────────────────────┐
│ Final Assessment:                  │
│                                    │
│ Marcus Blackwood built his empire  │
│ on stolen code...                  │
│                                    │
│ But this wasn't a crime of         │
│ passion...                         │
│                                    │
│ [Signature and case details]       │
└────────────────────────────────────┘
```

## Testing

1. **Restart the server** (changes to detlogv3.html require reload)
2. Generate a new report with "Generate Final Report" button
3. Export the HTML
4. Verify:
   - ✅ Final Assessment is ONE styled box
   - ✅ Paragraphs flow naturally with 16px spacing
   - ✅ No more `---` appearing as literal dashes
   - ✅ Section breaks render as subtle horizontal lines
   - ✅ Signature is at the bottom of the Final Assessment box

## Other Improvements

- Section breaks now render as proper `<hr>` elements (subtle lines)
- Reduced overuse of detective asides (`.note` class)
- Clearer structural template for Claude to follow
- Better preservation of narrative flow in final conclusion

## Rollback

If issues arise, previous version can be restored from git:
```bash
git diff detlogv3.html  # View changes
git checkout HEAD -- detlogv3.html  # Restore previous version
```
