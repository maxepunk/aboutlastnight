# Research: Playtest Multi-Date Refactor

**Phase 0 Research Output** | **Date**: 2025-10-18

## Research Questions

Based on Technical Context and feature requirements, the following areas required investigation:

1. **Comment Marker Pattern** - What exact pattern was used in index.html refactor?
2. **Radio Button Accessibility** - Best practices for WCAG AA compliant date selection
3. **Multi-Date Spot Counter** - UI/UX patterns for switching between date-specific capacity displays
4. **Google Sheets Schema Extension** - Backend data model for storing date selection
5. **Form Validation** - Client-side validation patterns for required radio button selection

---

## R1: Comment Marker Pattern from index.html

**Research Method**: Direct code inspection of index.html refactor

**Findings**:

index.html uses this exact pattern:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: SECTION NAME                          -->
<!-- SAFE TO EDIT: Description of what can be changed        -->
<!-- FIND WITH: Search terms for Ctrl+F navigation           -->
<!-- ═══════════════════════════════════════════════════════ -->
[Content here]
<!-- END CONTENT SECTION: SECTION NAME -->
```

**Key Characteristics**:
- Box-drawing characters (`═`) create distinctive visual boundary
- ALL CAPS for section names and labels
- Three-line header: EDITABLE CONTENT, SAFE TO EDIT, FIND WITH
- End marker references section name
- Located at [index.html:25-45](../../../index.html#L25-L45) (hero section example)

**Decision**: Use **identical pattern** for playtest.html

**Rationale**: Pattern is proven and documented in CONTENT_GUIDE.md. Content editors already trained on this format.

**Alternatives Considered**:
- HTML comments with simple dashes → Rejected: Less visually distinctive
- Data attributes on elements → Rejected: Requires understanding HTML structure
- External JSON with IDs → Rejected: Violates content-first architecture principle

---

## R2: Radio Button Accessibility (WCAG AA)

**Research Method**: WCAG 2.1 AA guidelines review + existing form patterns in project

**Findings**:

**Required for WCAG AA Compliance**:
1. Each radio button must have associated `<label>` element
2. Group related radio buttons in `<fieldset>` with `<legend>`
3. Minimum 44x44px touch target (constitution requirement)
4. Keyboard navigation support (native to `<input type="radio">`)
5. Error messages for validation must use ARIA attributes

**HTML Structure Pattern**:
```html
<fieldset>
  <legend>Select Playtest Date</legend>
  <label>
    <input type="radio" name="playtestDate" value="2025-09-21-16:00" required>
    <span>September 21 at 4:00 PM</span>
  </label>
  <!-- Repeat for each date -->
</fieldset>
```

**Decision**: Use fieldset/legend pattern with label-wrapped radio buttons

**Rationale**:
- Native HTML provides keyboard navigation automatically
- Screen readers announce fieldset legend for context
- Constitution V requires WCAG AA compliance
- Simplest implementation (no ARIA complexity needed)

**Alternatives Considered**:
- Custom div-based radio buttons → Rejected: Requires extensive ARIA, more complex
- Select dropdown → Rejected: Less visual prominence, harder to show capacity per option

---

## R3: Multi-Date Spot Counter UI/UX

**Research Method**: Analysis of current playtest.html spot counter + user flow requirements

**Current Implementation**:
- Single spot counter loads data once on page load
- Updates after form submission
- Visual states: minimum progress, warning-low, warning-critical, full

**New Requirement**:
- Show capacity for **selected** date
- Switch instantly when user changes date selection
- Load all date capacities on page load (spec requirement: "no fetch-on-select")

**Decision**: Pre-load all date data, switch display on radio button change

**Implementation Pattern**:
```javascript
// Data structure
const dateCapacity = {
  '2025-09-21-16:00': { taken: 18, total: 20, hasMinimum: true },
  '2025-10-26-15:00': { taken: 5, total: 20, hasMinimum: true },
  '2025-11-04-18:30': { taken: 2, total: 20, hasMinimum: false }
};

// Event listener on radio button change
document.querySelectorAll('input[name="playtestDate"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    updateSpotCounter(e.target.value);
  });
});
```

**Rationale**:
- Instant feedback (no loading spinner)
- Single backend call on page load
- Reuses existing spot counter visual design
- Spec explicitly requires this approach (FR-005)

**Alternatives Considered**:
- Show all three counters simultaneously → Rejected: Cluttered UI, visually confusing
- Fetch capacity on radio change → Rejected: Spec forbids, adds latency
- Hide counter until selection → Rejected: Less informative, hides urgency

---

## R4: Google Sheets Schema Extension

**Research Method**: Analysis of PLAYTEST_GOOGLE_SCRIPT.js structure

**Current Schema** (PLAYTEST_GOOGLE_SCRIPT.js:11-12):
```
Name | Email | Timestamp | Spot Number | Status | Photo Consent | Consent Timestamp
```

**Required Extension**:
Add "Selected Date" column to store user's chosen playtest date.

**Decision**: Insert "Selected Date" as column 8 (after Consent Timestamp)

**Updated Schema**:
```
Name | Email | Timestamp | Spot Number | Status | Photo Consent | Consent Timestamp | Selected Date
```

**Data Format Decision**: ISO 8601 datetime string `YYYY-MM-DD HH:MM` (e.g., "2025-09-21 16:00")

**Rationale**:
- Sortable and filterable in Google Sheets
- Matches radio button value format
- Human-readable for organizers
- Unambiguous (includes date and time)

**Backend Logic Changes**:
1. `doPost()` must receive `formData.playtestDate`
2. Store in new column: `sheet.appendRow([..., formData.playtestDate])`
3. `doGet()` must return capacity per date (not global capacity)
4. Requires filtering rows by Selected Date column to calculate per-date capacity

**Deployment Sequence** (from spec Assumptions):
1. **FIRST**: Update Google Sheets to add "Selected Date" column header
2. **SECOND**: Deploy updated PLAYTEST_GOOGLE_SCRIPT.js with date logic
3. **THIRD**: Deploy updated playtest.html with date selection UI

**Alternatives Considered**:
- Separate sheet per date → Rejected: Complicates reporting, waitlist management
- Store as Unix timestamp → Rejected: Not human-readable for organizers
- Store as text "Sept 21 4pm" → Rejected: Not sortable, ambiguous

---

## R5: Form Validation for Required Radio Selection

**Research Method**: HTML5 validation capabilities + JavaScript validation patterns

**Findings**:

**HTML5 Native Validation**:
- Adding `required` attribute to **one** radio button in a group validates the entire group
- Browser shows validation message if form submitted with no selection
- Works without JavaScript

**JavaScript Enhancement**:
- Prevent form submission with custom error message
- Show error near radio buttons (better UX than browser default)
- Add ARIA attributes for accessibility

**Decision**: Use HTML5 `required` + JavaScript custom validation message

**Implementation Pattern**:
```javascript
form.addEventListener('submit', (e) => {
  const selectedDate = document.querySelector('input[name="playtestDate"]:checked');

  if (!selectedDate) {
    e.preventDefault();
    showError('Please select a playtest date before submitting');
    // Add aria-invalid to fieldset
    document.querySelector('fieldset').setAttribute('aria-invalid', 'true');
    return;
  }

  // Proceed with submission
});
```

**Rationale**:
- Progressive enhancement (works without JS via HTML5)
- Custom error message matches noir theme
- Meets FR-004 and FR-012 requirements
- ARIA attributes for accessibility (Constitution V)

**Alternatives Considered**:
- Pure HTML5 validation → Rejected: Error styling doesn't match theme
- Disable submit button until selection → Rejected: Less discoverable error state
- Server-side validation only → Rejected: Spec requires client-side (FR-004)

---

---

## R6: Existing CSS Patterns and Reusability

**Research Method**: Analysis of extracted CSS files from index.html refactor

**Findings**:

**Available CSS Files**:
- `base.css` (1.9KB) - Reset, typography, Google Fonts import, scrollbar styling
- `layout.css` (9.2KB) - Grid systems, sections, responsive breakpoints
- `components.css` (14KB) - Buttons, forms, accordions, scanlines, recovery prompts
- `animations.css` (3.0KB) - Keyframes, scroll effects, parallax

**Reusable Components for Playtest Page**:

1. **Form Elements** (components.css:275-296):
   - `.form-group` - Form field wrapper with spacing
   - `.form-input` - Text/email input styling with red border/focus
   - Already matches playtest noir theme

2. **Buttons** (components.css:360-395):
   - `.recover-button` - Red border button with hover fill animation
   - Identical pattern to current playtest submit button
   - Can reuse directly

3. **Scanline Effects** (components.css:578-623):
   - `.scanline` and `.scanline-secondary` - Animated red scanlines
   - Already present in playtest.html
   - Can extract to shared CSS

4. **Typography** (base.css:36-78):
   - `h1` with Bebas Neue + red glow
   - `.tagline`, `.hook` styles
   - Exact same font stack as playtest

5. **Base Styles** (base.css:8-21):
   - CSS reset, box-sizing
   - Body background, font-family
   - Custom red scrollbar
   - Identical across both pages

**Decision**: Create `playtest.css` that imports/extends shared styles

**Structure**:
```css
/* playtest.css will contain ONLY playtest-specific styles: */
- Spot counter styling (warning states, animations)
- Game info section styling
- Event details grid
- Radio button custom styling
- Photo consent checkbox styling
```

**Shared Styles to Reuse**:
- Forms (`form-group`, `form-input`, button patterns)
- Scanlines (already in components.css)
- Base typography and reset
- Noir theme variables

**Rationale**:
- Reduces duplication (DRY principle)
- Maintains visual consistency between index.html and playtest.html
- Smaller file sizes (better performance)
- Easier maintenance (change once, affect both pages)

**Alternatives Considered**:
- Duplicate all styles in playtest.css → Rejected: Violates DRY, maintenance nightmare
- Inline all CSS in playtest.html → Rejected: Contradicts index.html refactor pattern
- Create completely new theme → Rejected: Breaks visual consistency

---

## R7: Backend Date Configuration Strategy

**Research Method**: Analysis of content-first architecture requirements and maintenance burden

**Problem Statement**:
Initial design had playtest dates hardcoded in 3 locations in Google Apps Script:
1. `doPost()` validation array
2. `formatDateForEmail()` mapping object
3. `getAllCapacities()` valid dates array

This violated the content-first principle: content editors would need a developer to update backend code and redeploy when adding/changing dates.

**Research Question**: Can the backend be made date-agnostic, treating the frontend HTML as the source of truth?

**Findings**:

**YES - Backend can dynamically discover dates from data instead of hardcoding**

**Solution Design**:
1. **Frontend (playtest.html) = Source of Truth**
   - Radio buttons define available dates
   - Date values in ISO format (e.g., "2025-09-21 16:00")
   - Display labels are human-readable text

2. **Backend (Google Apps Script) = Date-Agnostic Processor**
   - Accepts ANY non-empty date string from form submission
   - Stores date value in Google Sheets column H
   - Discovers unique dates by scanning column H (existing signups)
   - Dynamically formats dates for emails by parsing ISO format

3. **Workflow for Adding/Modifying Dates**:
   - Content editor updates radio buttons in playtest.html
   - Commits and deploys to GitHub Pages
   - **No backend changes required**
   - First signup for new date seeds it into database
   - Capacity API automatically includes new date

**Implementation Details**:

```javascript
// Before (hardcoded - REJECTED):
const validDates = ["2025-09-21 16:00", "2025-10-26 15:00", ...];
if (!validDates.includes(selectedDate)) { throw error; }

// After (data-driven - APPROVED):
if (!selectedDate || selectedDate.trim() === '') { throw error; }
// Accept any non-empty string!
```

```javascript
// Before (hardcoded mapping - REJECTED):
const dateMap = {
  "2025-09-21 16:00": "September 21 at 4:00 PM",
  ...
};

// After (dynamic parsing - APPROVED):
function formatDateForEmail(isoDate) {
  // Parse "2025-09-21 16:00" and format dynamically
  // Returns: "September 21 at 4:00 PM"
}
```

```javascript
// Before (hardcoded list - REJECTED):
const validDates = [
  { value: "2025-09-21 16:00", display: "..." },
  ...
];

// After (discovery from sheet - APPROVED):
function getAllCapacities() {
  const uniqueDates = new Set();
  // Scan column H for all unique date values
  // Calculate capacity for each discovered date
}
```

**Edge Case: Empty Sheet**
- If no signups exist yet, `getAllCapacities()` returns empty array
- Frontend must handle this gracefully (show static "Loading..." or default to first radio option)
- After first signup for each date, capacity data becomes available

**Decision**: **Use data-driven backend with frontend as source of truth**

**Rationale**:
- **Content-first**: Content editors update HTML only, never touch backend
- **Zero maintenance**: No backend redeployment when dates change
- **Scalable**: Works with 3 dates or 30 dates
- **Self-documenting**: Radio buttons in HTML show exactly what's available
- **Fail-safe**: Worst case (parse error) falls back to displaying raw ISO date string

**Alternatives Considered**:
- **Option A: Hardcode dates in backend** → REJECTED: Violates content-first, requires developer intervention
- **Option B: Single configuration constant** → REJECTED: Still requires backend redeployment
- **Option C: External config file (JSON)** → REJECTED: Adds complexity, not needed for 3-5 dates
- **Option D: Data-driven from frontend** → **SELECTED**: Perfect alignment with content-first architecture

**Impact on Implementation**:
- Backend code is simpler (no hardcoded arrays)
- Content editors empowered to manage dates independently
- Reduces deployment coordination (frontend-only changes)
- Eliminates risk of frontend/backend date mismatch

**Testing Considerations**:
- Test empty sheet scenario (no signups yet)
- Test date parsing with various ISO formats
- Test dynamic discovery with mixed dates in database
- Verify email formatting works for any valid ISO date

---

## R8: Existing JavaScript Utilities and Patterns

**Research Method**: Analysis of extracted JS files from index.html refactor

**Findings**:

**Available JS Files**:
- `utils.js` (7.5KB) - Device detection, UTM tracking, localStorage checks, date/time utilities
- `forms.js` (13KB) - FormRecovery API, RetryManager, form submission with exponential backoff
- `interactions.js` (16KB) - Accordions, sticky header, scroll effects

**Reusable Utilities for Playtest**:

1. **FormRecovery API** (forms.js:17-89):
   - localStorage save/load/clear with 7-day TTL
   - Already supports arbitrary form fields
   - Can reuse for playtest form recovery
   - Currently saves email, fullName, photoConsent
   - **Extension needed**: Add `playtestDate` to recovery fields

2. **RetryManager** (forms.js:95-182):
   - Exponential backoff with jitter
   - Network error retry logic
   - **Can reuse exactly as-is for playtest submissions**

3. **UTM Tracking** (utils.js:36-84):
   - `populateHiddenTrackingFields()` - Auto-fills utm_source, referrer, device_type
   - Currently used in index.html form
   - **Should add to playtest form** for marketing attribution

4. **Device Detection** (utils.js:16-26):
   - `isMobileDevice()`, `getDeviceType()`
   - Useful for analytics
   - Already available globally via `window.ALNUtils`

5. **localStorage Utilities** (utils.js:115-124):
   - `isLocalStorageAvailable()` - Feature detection
   - Used by FormRecovery
   - Already abstracted and reusable

**Decision**: Extend `forms.js` with playtest-specific submission logic

**Implementation Plan**:
```javascript
// forms.js additions:
1. Add PLAYTEST_GOOGLE_SCRIPT_URL constant
2. Create handlePlaytestFormSubmit(e) function
   - Similar to handleFormSubmit but includes date selection
   - Save playtestDate to FormRecovery
   - Validate date selection before submission
3. Extend checkForRecoveryData() to restore radio button selection
```

**New File Needed**: `playtest-interactions.js`
```javascript
// Playtest-specific behavior:
1. Spot counter updates (updateSpotCounter)
2. Date selection change listener
3. Fetch initial capacity data (fetchSpotCount)
4. Real-time spot counter refresh (30-second interval)
```

**Rationale**:
- Reuse proven retry/recovery infrastructure
- Consistent error handling across both forms
- Smaller code footprint (no duplication)
- UTM tracking provides marketing attribution data

**Alternatives Considered**:
- Duplicate forms.js logic in inline script → Rejected: 13KB of duplicated code
- Create entirely separate playtest-forms.js → Rejected: Most code would be identical
- No form recovery for playtest → Rejected: Users expect feature parity

---

## Summary of Decisions

| Research Area | Decision | Rationale |
|--------------|----------|-----------|
| Comment Markers | Use exact index.html pattern with `═══` borders | Proven pattern, editor training exists |
| Radio Buttons | Fieldset/legend with label-wrapped inputs | WCAG AA compliant, native keyboard support |
| Spot Counter | Pre-load all dates, switch on radio change | Instant feedback, spec requirement |
| Backend Schema | Add "Selected Date" column with ISO format | Sortable, unambiguous, human-readable |
| Form Validation | HTML5 required + JS custom messages | Progressive enhancement + themed errors |
| **Backend Date Config** | **Data-driven from frontend (no hardcoded dates)** | **Content-first architecture, zero backend maintenance** |
| **CSS Architecture** | **Reuse base/components/animations, create playtest.css for unique styles** | **DRY principle, consistency, performance** |
| **JS Architecture** | **Extend forms.js, create playtest-interactions.js** | **Reuse retry/recovery, minimize duplication** |

**All research complete. No blockers identified. Ready for Phase 1.**
