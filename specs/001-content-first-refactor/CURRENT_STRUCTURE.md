# Current File Structure - Content-First Refactor Baseline

**Date**: 2025-01-19
**Purpose**: Baseline documentation of current file structure and content locations for migration guide

---

## File Line Counts

```bash
$ wc -l index.html playtest.html
  2100 index.html
   721 playtest.html
  2821 total
```

---

## index.html Content Sections

### Lines 1-1296: Document Head & Inline Styles
- **Content**: HTML head, meta tags, inline CSS (all styles)
- **Size**: ~1296 lines
- **Type**: Structure + Styles
- **Editor Access**: Developer only

### Lines 1297-1328: Hero Section
- **Content**: Main hero banner with tagline "Some memories are worth killing for"
- **Size**: ~32 lines
- **Type**: Content Block (hero-tagline, event-title, CTA button)
- **Editor Access**: Content editor (frequent updates)

### Lines 1329-1357: Narrative Section
- **Content**: Story introduction and narrative hook
- **Size**: ~29 lines
- **Type**: Content Block (marketing copy)
- **Editor Access**: Content editor (seasonal updates)

### Lines 1358-1376: Party Scene Section
- **Content**: Setting description (Halloween rave scenario)
- **Size**: ~19 lines
- **Type**: Content Block (marketing copy)
- **Editor Access**: Content editor (rarely edited)

### Lines 1377-1391: Investigation Section
- **Content**: Gameplay mechanics introduction
- **Size**: ~15 lines
- **Type**: Content Block (marketing copy)
- **Editor Access**: Content editor (rarely edited)

### Lines 1392-1469: How It Works Section
- **Content**: Gameplay details, mechanics explanation
- **Size**: ~78 lines
- **Type**: Content Block (marketing copy)
- **Editor Access**: Content editor (seasonal updates)

### Lines 1470-1507: Creators Section
- **Content**: Creator profiles (names, roles, bios)
- **Size**: ~38 lines
- **Type**: Structural Component (2 creator-profile instances)
- **Editor Access**: Content editor (rarely edited)

### Lines 1508-1637: FAQ Section
- **Content**: FAQ accordion items (questions and answers)
- **Size**: ~130 lines
- **Type**: Structural Component (multiple faq-item instances)
- **Editor Access**: Content editor (frequent updates)

### Lines 1638-2099: Footer & Scripts
- **Content**: Footer navigation, forms, inline JavaScript
- **Size**: ~462 lines
- **Type**: Structure + Content + Behavior
- **Editor Access**: Mixed (contact info: content editor, scripts: developer)

---

## playtest.html Content Sections

### Full Structure
- **Total Lines**: 721
- **Content**: Dedicated playtest signup page with form
- **Type**: Full page (head, body, form, scripts)
- **Editor Access**: Mixed (form content: content editor, scripts: developer)

---

## Key Content Blocks Identified (for T005 audit)

### High-Frequency Edits (Weekly/Seasonal)
1. **Hero Tagline** (index.html:~1301-1310)
2. **Event Dates** (index.html:~1320-1325)
3. **Pricing** (index.html:~1450-1460, estimate - need to verify)
4. **FAQ Items** (index.html:1517-1637)

### Medium-Frequency Edits (Seasonal)
1. **Narrative Copy** (index.html:1329-1357)
2. **How It Works Details** (index.html:1392-1469)
3. **Creator Bios** (index.html:1470-1507)

### Low-Frequency Edits (Rarely)
1. **Party Scene Description** (index.html:1358-1376)
2. **Investigation Section** (index.html:1377-1391)
3. **Footer Contact Info** (index.html:1638-1700, estimate)

---

## Form Endpoints (Critical - Must Not Break)

**Main Interest Form**:
- Location: index.html (footer section, ~lines 1700-1800)
- Endpoint: Google Apps Script Web App URL
- Fields: email, name (TBD - need to verify in T012.1)

**Playtest Signup Form**:
- Location: playtest.html
- Endpoint: Google Apps Script Web App URL
- Fields: email, fullName, photoConsent (per data-model.md)

---

## Interactive Behaviors (JavaScript Dependencies)

### Accordions
- FAQ items with expand/collapse functionality
- Class dependencies: `.faq-question`, `.faq-answer`
- Event listeners: click handlers

### Forms
- Submission handlers with tracking IDs
- Google Apps Script integration
- Client-side validation

### Visual Effects
- Parallax scrolling
- Sticky header
- Fade-in animations on scroll
- Responsive breakpoints

---

## Migration Strategy Notes

**After Refactor Target**:
- Content remains in index.html with comment markers
- CSS extracted to 4 files: base.css (~200 lines), layout.css (~150 lines), components.css (~200 lines), animations.css (~100 lines)
- JavaScript extracted to 3 files: interactions.js (~100 lines), forms.js (~150 lines), utils.js (~100 lines)
- Expected index.html post-refactor: ~800-1000 lines (removing ~1200 lines of CSS + ~400 lines of JS)

**Content Line Number Changes**:
- Hero section: 1297 → ~100-200 (after removing head styles)
- FAQ section: 1508 → ~400-600 (approximate)
- Creators: 1470 → ~350-450 (approximate)
- Footer/Forms: 1638 → ~600-800 (approximate)

---

**Baseline Established**: 2025-01-19
**Next Step**: T005 - Audit index.html to identify all Content Blocks
