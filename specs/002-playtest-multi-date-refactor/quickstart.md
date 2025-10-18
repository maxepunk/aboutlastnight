# Quickstart: Playtest Multi-Date Implementation

**For Developers** | **Phase 1 Design Output** | **Date**: 2025-10-18

## Overview

This quickstart guide walks you through implementing the playtest multi-date refactor from design to deployment. Follow these steps sequentially to extend playtest.html with multiple date selection while maintaining the content-first architecture.

---

## Prerequisites

✅ **Must be completed before starting**:

1. **Backend Schema Update** (CRITICAL - do this FIRST):
   ```
   1. Open Google Sheets: "Playtest Signups"
   2. Add column H header: "Selected Date"
   3. Backfill existing rows (if any) with: "2025-09-21 16:00"
   ```

2. **Local Development Setup**:
   ```bash
   cd /path/to/aboutlastnightgame
   git checkout 002-playtest-multi-date-refactor
   git pull origin 002-playtest-multi-date-refactor
   ```

3. **Review Design Artifacts**:
   - [x] Read [data-model.md](data-model.md) - Understand entities and relationships
   - [x] Read [research.md](research.md) - Understand technical decisions
   - [x] Review [contracts/playtest-api-contract.yaml](contracts/playtest-api-contract.yaml) - API schema

---

## Implementation Steps

### Step 1: Update Google Apps Script Backend (30 min)

**File**: `PLAYTEST_GOOGLE_SCRIPT.js`

**Changes Required**:

1. **Update `doPost()` to handle date selection**:
   ```javascript
   // After line 20 (Parse form data)
   const selectedDate = formData.playtestDate || '';

   // Validate date selection
   const validDates = ["2025-09-21 16:00", "2025-10-26 15:00", "2025-11-04 18:30"];
   if (!validDates.includes(selectedDate)) {
     throw new Error('Invalid playtest date selected');
   }

   // After line 24 (Get current row count)
   // CHANGE: Filter signups by selected date instead of global count
   const allData = sheet.getDataRange().getValues();
   const signupsForDate = allData.filter((row, index) =>
     index > 0 && row[7] === selectedDate  // Column H (index 7) is Selected Date
   );
   const spotsTaken = signupsForDate.length;
   const actualSpotNumber = spotsTaken + 1;

   // After line 37 (Append data to sheet)
   // ADD: Selected Date as column H
   sheet.appendRow([
     formData.name || '',
     formData.email || '',
     timestamp,
     actualSpotNumber,
     status,
     formData.photoConsent || 'No',
     timestamp,
     selectedDate  // NEW: Column H
   ]);
   ```

2. **Update email confirmation to include selected date**:
   ```javascript
   // Update confirmation email subject and body (around line 50-70)
   const dateDisplay = formatDateForEmail(selectedDate);  // Helper function

   const subject = status === 'Confirmed'
     ? `✓ About Last Night Playtest - ${dateDisplay} - Spot ${actualSpotNumber} Confirmed`
     : `⏳ About Last Night Playtest - ${dateDisplay} - Waitlist Position ${actualSpotNumber - spotsTotal}`;

   // In htmlBody, replace hardcoded "Sunday, September 21" with dynamic date
   <p style="margin: 5px 0;"><strong>Date:</strong> ${dateDisplay}</p>
   ```

3. **Update `doGet()` to return all dates' capacities**:
   ```javascript
   function doGet(e) {
     try {
       const sheet = SpreadsheetApp.getActiveSheet();
       const allData = sheet.getDataRange().getValues();

       const validDates = [
         { value: "2025-09-21 16:00", display: "September 21 at 4:00 PM" },
         { value: "2025-10-26 15:00", display: "October 26 at 3:00 PM" },
         { value: "2025-11-04 18:30", display: "November 4 at 6:30 PM" }
       ];

       const capacities = validDates.map(dateInfo => {
         const signupsForDate = allData.filter((row, index) =>
           index > 0 && row[7] === dateInfo.value
         );
         const spotsTaken = signupsForDate.length;
         const spotsRemaining = Math.max(0, 20 - spotsTaken);

         return {
           date: dateInfo.value,
           displayText: dateInfo.display,
           spots_total: 20,
           spots_taken: spotsTaken,
           spots_remaining: spotsRemaining,
           minimum_players: 5,
           has_minimum: spotsTaken >= 5,
           is_full: spotsRemaining === 0
         };
       });

       return ContentService
         .createTextOutput(JSON.stringify({ dates: capacities }))
         .setMimeType(ContentService.MimeType.JSON);
     } catch(error) {
       return ContentService
         .createTextOutput(JSON.stringify({
           result: 'error',
           error: error.toString()
         }))
         .setMimeType(ContentService.MimeType.JSON);
     }
   }
   ```

4. **Deploy updated script**:
   - Deploy → Manage deployments → Edit → New version
   - **CRITICAL**: Note if URL changes (update playtest.html if it does)

**Verification**:
```bash
# Test GET endpoint
curl https://script.google.com/macros/s/{YOUR_DEPLOYMENT_ID}/exec

# Should return JSON with dates array
```

---

### Step 2: Create Playtest-Specific CSS File (20 min)

**File**: `css/playtest.css` (NEW)

**Extract from inline styles** in current playtest.html:

```css
/* Spot counter styles (lines 118-182 of current playtest.html) */
.spot-counter { /* ... */ }
.spots-remaining { /* ... */ }
.spots-text { /* ... */ }
.spot-counter.warning-low { /* ... */ }
.spot-counter.warning-critical { /* ... */ }
.spot-counter.full { /* ... */ }

/* Game info section (lines 185-249) */
.game-info { /* ... */ }
.game-description { /* ... */ }

/* Event details grid (lines 209-235) */
.event-details { /* ... */ }
.detail-item { /* ... */ }
.detail-label { /* ... */ }
.detail-value { /* ... */ }

/* Radio button custom styling (NEW) */
.date-selection-fieldset {
  border: 2px solid rgba(204, 0, 0, 0.3);
  padding: 2rem;
  margin-bottom: 2rem;
  background: rgba(10, 10, 10, 0.9);
}

.date-selection-legend {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.5rem;
  color: #cc0000;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 0 1rem;
}

.date-option {
  display: flex;
  align-items: center;
  padding: 1.2rem;
  margin-bottom: 1rem;
  background: rgba(0, 0, 0, 0.7);
  border: 2px solid transparent;
  transition: all 0.3s;
  cursor: pointer;
  min-height: 44px;  /* WCAG AA touch target */
}

.date-option:hover {
  background: rgba(30, 0, 0, 0.9);
  border-color: rgba(204, 0, 0, 0.5);
}

.date-option input[type="radio"] {
  width: 20px;
  height: 20px;
  margin-right: 1rem;
  cursor: pointer;
  accent-color: #cc0000;
}

.date-option input[type="radio"]:checked + .date-label {
  color: #cc0000;
  font-weight: 700;
}

.date-label {
  flex: 1;
  font-size: 1.1rem;
  color: rgba(255, 255, 255, 0.9);
  transition: all 0.3s;
}

.date-capacity {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 1.2rem;
  color: rgba(204, 0, 0, 0.8);
  min-width: 120px;
  text-align: right;
}

/* Photo consent checkbox (lines 387-427) */
input[type="checkbox"]#photoConsent { /* ... */ }

/* Responsive adjustments */
@media (max-width: 768px) {
  .date-option {
    flex-direction: column;
    align-items: flex-start;
  }

  .date-capacity {
    margin-top: 0.5rem;
    text-align: left;
  }
}
```

**Reference**: See existing playtest.html lines 15-442 for styles to extract

---

### Step 3: Create Playtest Interactions JavaScript (30 min)

**File**: `js/playtest-interactions.js` (NEW)

```javascript
/**
 * playtest-interactions.js - Playtest-specific UI behavior
 *
 * Contains: Spot counter updates, date selection, capacity fetching
 * Dependencies: utils.js (for date formatting, feature detection)
 */

const PLAYTEST_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';

// Date capacity storage
let dateCapacities = {};

// ═══════════════════════════════════════════════════════
// SPOT COUNTER UPDATES
// ═══════════════════════════════════════════════════════

/**
 * Update spot counter display for selected date
 * @param {string} selectedDate - ISO date string of selected playtest
 */
function updateSpotCounter(selectedDate) {
  const data = dateCapacities[selectedDate];
  if (!data) return;

  const counter = document.getElementById('spotCounter');
  const spotsNumber = document.getElementById('spotsNumber');
  const spotsText = document.getElementById('spotsText');

  // Remove all state classes
  counter.classList.remove('warning-low', 'warning-critical', 'full');

  if (!data.has_minimum) {
    // Show minimum players progress
    spotsNumber.textContent = `${data.spots_taken}/${data.minimum_players}`;
    spotsText.textContent = 'MINIMUM PLAYERS REQUIRED';

    if (data.spots_taken >= 3) {
      counter.classList.add('warning-low');
    }
  } else {
    // Show spots remaining
    spotsNumber.textContent = data.spots_remaining;
    spotsText.textContent = 'SPOTS REMAINING';

    if (data.spots_remaining === 0) {
      counter.classList.add('full');
    } else if (data.spots_remaining <= 3) {
      counter.classList.add('warning-critical');
    } else if (data.spots_remaining <= 5) {
      counter.classList.add('warning-low');
    }
  }
}

// ═══════════════════════════════════════════════════════
// CAPACITY FETCHING
// ═══════════════════════════════════════════════════════

/**
 * Fetch capacity data for all dates from backend
 */
async function fetchAllCapacities() {
  try {
    const response = await fetch(PLAYTEST_GOOGLE_SCRIPT_URL);
    const data = await response.json();

    // Store capacities by date value
    data.dates.forEach(dateInfo => {
      dateCapacities[dateInfo.date] = dateInfo;

      // Update capacity display next to radio button
      const capacityElement = document.getElementById(`capacity-${dateInfo.date}`);
      if (capacityElement) {
        capacityElement.textContent = dateInfo.spots_remaining > 0
          ? `${dateInfo.spots_remaining} spots left`
          : 'Full - Waitlist available';
      }
    });

    // Update spot counter for currently selected date
    const selectedRadio = document.querySelector('input[name="playtestDate"]:checked');
    if (selectedRadio) {
      updateSpotCounter(selectedRadio.value);
    } else {
      // Default to first date if none selected
      const firstDate = data.dates[0];
      if (firstDate) {
        updateSpotCounter(firstDate.date);
      }
    }

  } catch (error) {
    console.warn('Failed to fetch capacity data:', error);
    // Graceful degradation - show static UI without capacity
  }
}

// ═══════════════════════════════════════════════════════
// DATE SELECTION HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Handle date radio button change
 */
function handleDateSelection() {
  document.querySelectorAll('input[name="playtestDate"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      updateSpotCounter(e.target.value);
    });
  });
}

// ═══════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  // Fetch initial capacity data
  fetchAllCapacities();

  // Setup date selection listeners
  handleDateSelection();

  // Refresh capacity every 30 seconds
  setInterval(fetchAllCapacities, 30000);
});
```

---

### Step 4: Extend forms.js for Playtest Submission (20 min)

**File**: `js/forms.js` (EXTEND existing)

**Add after line 11** (after GOOGLE_SCRIPT_URL constant):

```javascript
// Playtest form endpoint
const PLAYTEST_GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
```

**Add new function after line 262** (after handleFormSubmit):

```javascript
// ═══════════════════════════════════════════════════════
// PLAYTEST FORM SUBMISSION HANDLER
// ═══════════════════════════════════════════════════════

/**
 * Handle playtest form submission with date validation
 * @param {Event} e - Form submit event
 */
async function handlePlaytestFormSubmit(e) {
  e.preventDefault();

  const form = e.target;
  const button = form.querySelector('.submit-button');
  const originalText = button.textContent;
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');

  // Validate date selection
  const selectedDate = document.querySelector('input[name="playtestDate"]:checked');
  if (!selectedDate) {
    errorMessage.textContent = '⚠ Please select a playtest date before submitting';
    errorMessage.classList.add('show');
    setTimeout(() => errorMessage.classList.remove('show'), 3000);
    return;
  }

  // Collect form data
  const formData = new FormData(form);
  const dataObject = {};
  for (let [key, value] of formData.entries()) {
    dataObject[key] = value;
  }

  // Visual feedback
  button.textContent = 'PROCESSING...';
  button.disabled = true;

  try {
    // Submit with retry mechanism
    const response = await RetryManager.fetchWithRetry(PLAYTEST_GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams(formData)
    });

    const result = await response.json();

    if (result.result === 'success') {
      FormRecovery.clear();

      // Update success message based on status
      const successMsg = result.status === 'Confirmed'
        ? `✓ SPOT ${result.spot_number} CONFIRMED • CHECK YOUR EMAIL`
        : `⏳ WAITLIST POSITION ${result.waitlist_position} • CHECK YOUR EMAIL`;

      successMessage.textContent = successMsg;
      successMessage.classList.add('show');
      form.reset();

      // Refresh capacity display
      if (window.fetchAllCapacities) {
        window.fetchAllCapacities();
      }

      setTimeout(() => {
        button.textContent = originalText;
        button.disabled = false;
        successMessage.classList.remove('show');
      }, 5000);
    } else {
      throw new Error(result.error || 'Submission failed');
    }

  } catch (error) {
    console.error('Playtest form submission failed:', error);

    FormRecovery.save(dataObject);

    errorMessage.textContent = 'ERROR • DATA SAVED • TRY AGAIN';
    errorMessage.classList.add('show');
    button.textContent = originalText;
    button.disabled = false;

    setTimeout(() => errorMessage.classList.remove('show'), 3000);
  }
}
```

**Update initialization** (around line 334):

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Check for recovery data on page load
  checkForRecoveryData();

  // Attach form submit handlers
  const interestForm = document.getElementById('interestForm');
  if (interestForm) {
    interestForm.addEventListener('submit', handleFormSubmit);
  }

  // NEW: Attach playtest form handler
  const playtestForm = document.getElementById('playtestForm');
  if (playtestForm) {
    playtestForm.addEventListener('submit', handlePlaytestFormSubmit);
  }
});
```

---

### Step 5: Refactor playtest.html (45 min)

**File**: `playtest.html`

**Major Changes**:

1. **Replace inline `<style>` with external CSS** (remove lines 15-442):
   ```html
   <head>
     <!-- ... existing meta tags ... -->
     <link rel="stylesheet" href="css/base.css">
     <link rel="stylesheet" href="css/components.css">
     <link rel="stylesheet" href="css/animations.css">
     <link rel="stylesheet" href="css/playtest.css">
   </head>
   ```

2. **Add comment markers** following index.html pattern:
   ```html
   <!-- ═══════════════════════════════════════════════════════ -->
   <!-- EDITABLE CONTENT: PLAYTEST DESCRIPTION                  -->
   <!-- SAFE TO EDIT: Event description, session details        -->
   <!-- FIND WITH: Search for "PLAYTEST DESCRIPTION" or "90"    -->
   <!-- ═══════════════════════════════════════════════════════ -->
   <section class="game-info">
     <h2>The Experience</h2>
     <p class="game-description">
       You remember the party. Sort of. Now you're in a room with other guests...
     </p>
     <!-- ... -->
   </section>
   <!-- END CONTENT SECTION: PLAYTEST DESCRIPTION -->
   ```

3. **Replace hardcoded date with radio button group**:
   ```html
   <!-- ═══════════════════════════════════════════════════════ -->
   <!-- EDITABLE CONTENT: PLAYTEST DATES                        -->
   <!-- SAFE TO EDIT: Date labels, times, add/remove dates      -->
   <!-- FIND WITH: Search for "PLAYTEST DATES" or "September"   -->
   <!-- ═══════════════════════════════════════════════════════ -->
   <fieldset class="date-selection-fieldset">
     <legend class="date-selection-legend">Select Your Session</legend>

     <label class="date-option">
       <input type="radio" name="playtestDate" value="2025-09-21 16:00" required>
       <span class="date-label">September 21 at 4:00 PM</span>
       <span class="date-capacity" id="capacity-2025-09-21 16:00">Loading...</span>
     </label>

     <label class="date-option">
       <input type="radio" name="playtestDate" value="2025-10-26 15:00" required>
       <span class="date-label">October 26 at 3:00 PM</span>
       <span class="date-capacity" id="capacity-2025-10-26 15:00">Loading...</span>
     </label>

     <label class="date-option">
       <input type="radio" name="playtestDate" value="2025-11-04 18:30" required>
       <span class="date-label">November 4 at 6:30 PM</span>
       <span class="date-capacity" id="capacity-2025-11-04 18:30">Loading...</span>
     </label>
   </fieldset>
   <!-- END CONTENT SECTION: PLAYTEST DATES -->
   ```

4. **Replace inline `<script>` with external JS** (remove lines 566-720):
   ```html
   <!-- ⚠ DO NOT EDIT BELOW: JavaScript dependencies ⚠ -->
   <script src="js/utils.js"></script>
   <script src="js/forms.js"></script>
   <script src="js/playtest-interactions.js"></script>
   </body>
   </html>
   ```

5. **Update event details section** to be editable via comment markers:
   ```html
   <!-- ═══════════════════════════════════════════════════════ -->
   <!-- EDITABLE CONTENT: EVENT DETAILS                         -->
   <!-- SAFE TO EDIT: Duration, player count, location          -->
   <!-- FIND WITH: Search for "EVENT DETAILS" or "2-2.5 HRS"    -->
   <!-- ═══════════════════════════════════════════════════════ -->
   <div class="event-details">
     <div class="detail-item">
       <div class="detail-label">Duration</div>
       <div class="detail-value">2-2.5 HRS</div>
     </div>
     <!-- ... -->
   </div>
   <!-- END CONTENT SECTION: EVENT DETAILS -->
   ```

**See**: [Comment marker pattern example from index.html](../../../index.html#L25-L45)

---

### Step 6: Test Locally (15 min)

**Local Server**:
```bash
python3 -m http.server
# Visit http://localhost:8000/playtest.html
```

**Checklist**:
- [ ] All three radio buttons render correctly
- [ ] Clicking radio button updates spot counter
- [ ] Comment markers visible in HTML source
- [ ] CSS loads from external files (check Network tab)
- [ ] JS loads from external files
- [ ] Form validation blocks submission without date selection
- [ ] HTML validation passes: `tidy -q -e playtest.html`

**Note**: Forms won't submit locally - requires GitHub Pages deployment to test backend.

---

### Step 7: Deploy to GitHub Pages (10 min)

**Deployment Sequence** (CRITICAL ORDER):

1. ✅ **Backend already updated** (Step 1)
2. **Commit frontend changes**:
   ```bash
   git add css/playtest.css
   git add js/playtest-interactions.js
   git add js/forms.js
   git add playtest.html
   git commit -m "feat: add multi-date selection to playtest signup

   - Extract CSS to playtest.css following index.html pattern
   - Add date selection radio buttons with accessibility
   - Implement per-date capacity tracking
   - Add comment markers for content editor workflow
   - Extend forms.js with playtest submission handler"

   git push origin 002-playtest-multi-date-refactor
   ```

3. **Wait 2-3 minutes** for GitHub Pages deployment

4. **Test live form**:
   - Visit https://aboutlastnightgame.com/playtest.html
   - Force refresh: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac)
   - Submit test signup
   - Verify email confirmation received
   - Check Google Sheets for "Selected Date" column populated

---

## Post-Deployment Validation

### Functional Testing

- [ ] All three dates load with correct capacity
- [ ] Selecting date updates spot counter instantly
- [ ] Form submission includes selected date
- [ ] Confirmation email shows correct date
- [ ] Google Sheets row has Selected Date in column H
- [ ] Waitlist works when date is full
- [ ] Form recovery restores selected date

### Performance Testing

```bash
# Lighthouse audit
lighthouse https://aboutlastnightgame.com/playtest.html --only-categories=performance,accessibility

# Target metrics (must meet):
# - FCP < 1.5s
# - LCP < 2.5s
# - CLS < 0.1
# - Accessibility score > 90
```

### Accessibility Testing

- [ ] Keyboard navigation: Tab through radio buttons
- [ ] Screen reader: Radio group announced correctly
- [ ] Focus indicators visible on all interactive elements
- [ ] Error messages announced by screen reader
- [ ] Touch targets >= 44x44px

### Content Editor Workflow Testing

- [ ] Search "PLAYTEST DATES" finds date section
- [ ] Edit date label text (e.g., change time)
- [ ] HTML validation passes after content edit
- [ ] Changes deploy successfully

---

## Rollback Procedure

If issues arise post-deployment:

```bash
# Option 1: Revert last commit
git revert HEAD
git push origin 002-playtest-multi-date-refactor

# Option 2: Restore from pre-refactor state
git checkout main -- playtest.html
git commit -m "rollback: restore playtest.html to pre-refactor state"
git push origin 002-playtest-multi-date-refactor
```

**Backend Rollback**: Not recommended (would lose Selected Date data)

---

## Troubleshooting

### Forms not submitting
- Check Google Apps Script deployment URL matches `playtest-interactions.js` and `forms.js`
- Verify backend script deployed as "Web App" with "Anyone" access
- Check browser console for CORS errors

### Spot counter not updating
- Verify `fetchAllCapacities()` returning data (check Network tab)
- Check `dateCapacities` object in console: `console.log(dateCapacities)`
- Ensure radio button values match backend date strings exactly

### HTML validation errors
- Run `tidy -q -e playtest.html` locally first
- Common issues: unclosed tags, missing `alt` on images, invalid nesting
- Pre-commit hook will block invalid HTML

### CSS not loading
- Hard refresh: Ctrl+Shift+R
- Check file paths are relative to repository root
- Verify files deployed to GitHub Pages (check commit)

---

## Next Steps After Implementation

1. **Update Documentation**:
   - Add playtest.html sections to `docs/CONTENT_GUIDE.md`
   - Add playtest examples to `docs/QUICKSTART_CONTENT_EDITORS.md`

2. **Monitor Analytics**:
   - Track conversion rates per date
   - Monitor waitlist signup patterns
   - Analyze device type distribution

3. **Future Enhancements** (post-MVP):
   - Auto-close past dates
   - Email waitlist promotions when spots open
   - Calendar export (.ics) for confirmed signups

---

## Time Estimate

| Step | Estimated Time |
|------|---------------|
| 1. Backend Update | 30 min |
| 2. Create playtest.css | 20 min |
| 3. Create playtest-interactions.js | 30 min |
| 4. Extend forms.js | 20 min |
| 5. Refactor playtest.html | 45 min |
| 6. Local Testing | 15 min |
| 7. Deployment | 10 min |
| **Total** | **~2.5 hours** |

---

## Support & Questions

- **Implementation Questions**: Reference [data-model.md](data-model.md) and [research.md](research.md)
- **API Questions**: See [contracts/playtest-api-contract.yaml](contracts/playtest-api-contract.yaml)
- **Constitution Compliance**: Check [plan.md Constitution Check section](plan.md#constitution-check)
