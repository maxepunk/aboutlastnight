# Preview Pricing Content Design
**Date:** October 28, 2025
**Status:** Approved
**Purpose:** Implement tiered preview pricing across website content

## Overview

About Last Night is adding preview performances with variable pricing before the main run. This design covers all content updates needed to communicate the three pricing tiers clearly while maintaining brand voice and conversion optimization.

## Pricing Structure

| Dates | Price | Type |
|-------|-------|------|
| Nov 9, 14, 16 | $35/person | Preview Week 1 |
| Nov 21, 22, 23 | $60/person | Preview Week 2 |
| Dec 4 - Dec 28 | $75/person | Full Run |

## Design Principles

1. **Brand Language:** Use "Preview Investigations" (noir-themed, in-world)
2. **Presentation Style:** Clear, neutral information without pressure tactics
3. **Content Consistency:** Match existing website style (simple prose with line breaks)
4. **Booking Bar Strategy:** Two-line layout to accommodate tiered information
5. **Detail Level:** Group preview period in prominent locations, show specific tiers in FAQ

## Content Updates

### 1. Booking Bar (Hero Section)

**File:** `index.html`
**Location:** Lines 61-67 (PRICING AND DATES section)
**Comment Marker:** "EDITABLE CONTENT: PRICING AND DATES"

**Current:**
```html
<span class="min-players">Nov 14- Dec 28</span>
<span style="color: rgba(204, 0, 0, 0.9);">$75/person</span>
```

**New (two-line layout):**
```html
<div class="booking-info">
  <span class="preview-line">Preview Investigations: Nov 9-23 (from $35)</span>
  <span class="main-run-line">Full Run: Dec 4-28 ($75/person)</span>
</div>
```

**Implementation Notes:**
- May require CSS updates for `.booking-info` vertical stacking
- Consider slight font size reduction for two-line layout
- Maintain red color accent on pricing for consistency
- Test mobile responsiveness (sticky header)

---

### 2. FAQ Section - "When and where?"

**File:** `index.html`
**Location:** Lines 301-306
**Comment Marker:** "STRUCTURAL COMPONENT: FAQ SECTION"

**Current:**
```html
<p class="faq-answer">Off the Couch Games in Fremont, CA<br>
555 Mowry Avenue. Fremont, CA 94536<br>
Novermber 14 - December 28<br>
Thursday-Sunday performances, multiple time slots<br>
```

**New:**
```html
<p class="faq-answer">Off the Couch Games in Fremont, CA<br>
555 Mowry Avenue, Fremont, CA 94536<br>
Preview Investigations: November 9, 14, 16, 21, 22, 23<br>
Full Run: December 4 - December 28<br>
Thursday-Sunday performances, multiple time slots<br>
```

**Changes:**
- Fixed typo: "Novermber" → "November" (abbreviated in current, full name in new)
- Lists all specific preview dates for booking clarity
- Clear separation between preview and full run periods

---

### 3. FAQ Section - "How much does it cost?"

**File:** `index.html`
**Location:** Lines 295-296
**Comment Marker:** "STRUCTURAL COMPONENT: FAQ SECTION"

**Current:**
```html
<p class="faq-answer">$75 per person for the full investigation. Contact us for corporate packages</p>
```

**New:**
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

**Rationale:**
- Lead with simple overview (preview vs full run)
- Detailed tier breakdown for booking decisions
- Bullet format matches existing scannable style
- Preserves corporate packages note

---

### 4. Meta Description (SEO)

**File:** `index.html`
**Location:** Line 7

**Current:**
```html
<meta name="description" content="Some memories are worth killing for. A 90-120 minute immersive crime thriller in Silicon Valley. Novermber 14-December 28, 2025.">
```

**New:**
```html
<meta name="description" content="Some memories are worth killing for. A 2 hour immersive crime thriller in Silicon Valley. Preview performances November 9-23, full run December 4-28, 2025.">
```

**Changes:**
- Fixed typo: "Novermber"
- Updated duration: "90-120 minute" → "2 hour" (cleaner, consistent with 2-hour standard)
- Includes preview dates for search visibility
- 158 characters (within 155-160 optimal range)

---

### 5. Confirmation Email

**File:** `FORM_HANDLER_GOOGLE_SCRIPT.js`
**Location:** Lines 50 and 56

**Current:**
```javascript
Investigation Ongoing: <strong style="color: #cc0000;">NOV 14 - DEC 28:</strong>
...
<strong>Price:</strong> $75 per investigator
```

**New:**
```javascript
Investigation Ongoing: <strong style="color: #cc0000;">NOV 9 - DEC 28:</strong>
Preview performances November 9-23, full run opens December 4.
...
<strong>Preview Pricing:</strong> $35-60 per person (Nov 9-23)<br>
<strong>Full Run:</strong> $75 per person (Dec 4 onwards)<br>
<br>
<strong>Preview tiers:</strong><br>
• November 9, 14, 16: $35/person<br>
• November 21, 22, 23: $60/person
```

**Implementation Notes:**
- Update date range to start November 9
- Add descriptive line after main date range
- Replace single price with tiered structure
- Maintain noir email styling (red accent on key info)
- Match FAQ format for consistency

---

## Implementation Checklist

- [ ] Update booking bar HTML (index.html:61-67)
- [ ] Add/update booking bar CSS for two-line layout
- [ ] Update "When and where?" FAQ (index.html:301-306)
- [ ] Update "How much does it cost?" FAQ (index.html:295-296)
- [ ] Update meta description (index.html:7)
- [ ] Update confirmation email dates (FORM_HANDLER_GOOGLE_SCRIPT.js:50)
- [ ] Update confirmation email pricing (FORM_HANDLER_GOOGLE_SCRIPT.js:56)
- [ ] Test mobile responsiveness of booking bar
- [ ] Test email rendering in common clients
- [ ] Update CLAUDE.md run dates (line 10)
- [ ] Update docs/CONTENT_GUIDE.md with new pricing locations

---

## Out of Scope

**Not updated in this design:**
- Off the Couch booking widget (updated independently by venue)
- Playtest system (separate from main show pricing)
- Marketing materials (MarketingLanguagePressRelease.md - to be updated separately if needed)

---

## Testing Considerations

1. **Visual regression:** Booking bar layout at all breakpoints
2. **Content accuracy:** All dates and prices match across locations
3. **Email rendering:** HTML email displays correctly in Gmail, Outlook, Apple Mail
4. **SEO validation:** Meta description renders correctly in search results
5. **Accessibility:** Screen reader testing for two-line booking bar

---

## Success Criteria

- Users can quickly identify preview vs full run dates and pricing
- Preview dates create awareness without overwhelming the booking bar
- FAQ provides complete information for booking decisions
- Email recipients understand full pricing structure
- Content maintains brand voice ("Preview Investigations")
- Mobile experience remains clean and readable
