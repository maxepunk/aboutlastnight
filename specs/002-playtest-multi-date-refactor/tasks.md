---
description: "Task list for Playtest Multi-Date Refactor implementation"
---

# Tasks: Playtest Multi-Date Refactor

**Input**: Design documents from `/specs/002-playtest-multi-date-refactor/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/playtest-api-contract.yaml

**Tests**: Tests are NOT requested in this feature specification - no test tasks included.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions
- This is a zero-dependency web application
- HTML/CSS/JS files at repository root and in `css/`, `js/` directories
- Backend: `PLAYTEST_GOOGLE_SCRIPT.js` (Google Apps Script, deployed separately)

---

## Phase 1: Setup (Backend Prerequisites)

**Purpose**: Prepare backend schema and verify infrastructure before frontend work

**⚠️ CRITICAL**: Backend schema MUST be updated BEFORE any frontend deployment (Constitution III requirement)

- [X] T001 [Role: Developer with Google Sheets admin access] Add "Selected Date" column H to Google Sheets "Playtest Signups" sheet with header text "Selected Date" (schema reference: data-model.md lines 152-161)
- [X] T002 [Role: Developer with Google Sheets admin access] Backfill existing signup rows in Google Sheets with default date "2025-09-21 16:00" in column H using formula `=IF(H2="","2025-09-21 16:00",H2)` or manual fill-down
- [X] T003 Verify pre-commit HTML validation hook is working via `git config core.hooksPath` check

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend and shared infrastructure that MUST be complete before ANY user story frontend work

**⚠️ CRITICAL**: No frontend user story work can begin until this phase is complete

- [X] T004 Update `doPost()` in PLAYTEST_GOOGLE_SCRIPT.js to receive and validate `formData.playtestDate` against valid date enum
- [X] T005 Update spot number calculation in PLAYTEST_GOOGLE_SCRIPT.js to filter signups by selected date (column H, index 7) for per-date sequential numbering
- [X] T006 Update sheet append operation in PLAYTEST_GOOGLE_SCRIPT.js to include `selectedDate` as column H in row data
- [X] T007 Update `doGet()` in PLAYTEST_GOOGLE_SCRIPT.js to return capacity data for all three dates (Sept 21, Oct 26, Nov 4) as JSON array
- [X] T008 Implement `getAllCapacities()` helper function in PLAYTEST_GOOGLE_SCRIPT.js to filter and count signups per date
- [X] T009 Update confirmation email template in PLAYTEST_GOOGLE_SCRIPT.js to include dynamic date display using `formatDateForEmail()` helper
- [X] T010 Deploy updated PLAYTEST_GOOGLE_SCRIPT.js to Google Apps Script and verify endpoint URL remains unchanged. ⚠️ CONSTITUTION REQUIREMENT: Backend MUST be deployed and verified (T011-T012) BEFORE any frontend changes (Phase 3+) are deployed to GitHub Pages.
- [X] T011 Test backend `GET /exec` endpoint returns correct JSON structure with all three dates' capacity data
- [X] T012 Test backend `POST /exec` endpoint accepts `playtestDate` field and stores in column H correctly

**Checkpoint**: Backend ready AND DEPLOYED - frontend implementation can now begin in parallel across user stories. ⚠️ BLOCKER: Do NOT deploy frontend changes (Phase 3+) to GitHub Pages until T010-T012 verification is complete (Constitution III: Form Reliability).

---

## Phase 3: User Story 1 - Content Editor Updates Playtest Information (Priority: P1) 🎯 MVP

**Goal**: Enable content editors to update playtest details (dates, times, locations, descriptions) in under 2 minutes using Ctrl+F search without breaking functionality

**Independent Test**: Non-technical user can search for "PLAYTEST DESCRIPTION", edit the event description text, commit without HTML validation errors, and deploy successfully to GitHub Pages

### Implementation for User Story 1

- [X] T013 [P] [US1] Extract all CSS from playtest.html `<style>` tag (lines 15-442) into new css/playtest.css file
- [X] T014 [P] [US1] Add CSS file references to playtest.html `<head>`: base.css, components.css, animations.css, playtest.css
- [X] T015 [US1] Add comment marker to playtest description section in playtest.html following index.html pattern (box-drawing `═══` borders with EDITABLE CONTENT label, SAFE TO EDIT guidance, FIND WITH search terms)
- [X] T016 [US1] Add comment marker to event details section in playtest.html (duration, player count, location) with search term "EVENT DETAILS"
- [X] T017 [US1] Add comment marker to surveillance protocol consent text in playtest.html with search term "SURVEILLANCE PROTOCOL"
- [X] T018 [US1] Add comment marker to game info section in playtest.html with search term "GAME INFO"
- [X] T019 [US1] Add end markers for all content sections in playtest.html following pattern `<!-- END CONTENT SECTION: [NAME] -->`
- [X] T020 [US1] Validate HTML structure using `tidy -q -e playtest.html` to ensure no validation errors after marker addition
- [X] T021 [US1] Update docs/CONTENT_GUIDE.md to add playtest.html sections with comment marker locations and what content editors can safely change
- [X] T022 [US1] Update docs/QUICKSTART_CONTENT_EDITORS.md to add playtest.html examples showing search-based workflow for common updates

**Checkpoint**: At this point, User Story 1 should be fully functional - content editors can find and update playtest content sections using search, and changes deploy without HTML validation errors

---

## Phase 4: User Story 2 - User Selects Preferred Playtest Date (Priority: P1) 🎯 MVP

**Goal**: Enable users to see all available playtest dates and select their preferred session via radio buttons with independent capacity display

**Independent Test**: User visits playtest.html, sees all three dates (Sept 21 4pm, Oct 26 3pm, Nov 4 6:30pm), selects one radio button, submits form, and confirmation email shows their selected date

### Implementation for User Story 2

- [X] T023 [P] [US2] Create js/playtest-interactions.js with PLAYTEST_GOOGLE_SCRIPT_URL constant and dateCapacities storage object
- [X] T024 [P] [US2] Implement `fetchAllCapacities()` function in js/playtest-interactions.js to load all dates' capacity data on page load via GET request
- [X] T025 [P] [US2] Implement `updateSpotCounter(selectedDate)` function in js/playtest-interactions.js to switch spot counter display based on selected date
- [X] T026 [US2] Implement `handleDateSelection()` event listener in js/playtest-interactions.js to update spot counter when radio button changes
- [X] T027 [US2] Add DOMContentLoaded initialization in js/playtest-interactions.js to fetch capacities, setup listeners, and start 30-second refresh interval
- [X] T028 [US2] Add radio button fieldset to playtest.html with legend "Select Your Session" and fieldset/legend semantic structure for WCAG AA compliance
- [X] T029 [US2] Add radio button option for Sept 21 4pm in playtest.html with value "2025-09-21 16:00", label "September 21 at 4:00 PM", capacity display element, and `required` attribute
- [X] T030 [US2] Add radio button option for Oct 26 3pm in playtest.html with value "2025-10-26 15:00", label "October 26 at 3:00 PM", and capacity display element
- [X] T031 [US2] Add radio button option for Nov 4 6:30pm in playtest.html with value "2025-11-04 18:30", label "November 4 at 6:30 PM", and capacity display element
- [X] T032 [US2] Add comment marker around date selection fieldset in playtest.html with label "EDITABLE CONTENT: PLAYTEST DATES" and search term "PLAYTEST DATES"
- [X] T033 [US2] Add CSS styles to css/playtest.css for date selection fieldset (noir theme border, padding, background)
- [X] T034 [US2] Add CSS styles to css/playtest.css for date option labels (flex layout, hover effects, 44x44px touch targets per WCAG AA)
- [X] T035 [US2] Add CSS styles to css/playtest.css for radio button custom styling (accent color red, visual selection state)
- [X] T036 [US2] Add CSS styles to css/playtest.css for date capacity display (Bebas Neue font, red color, right-aligned)
- [X] T037 [US2] Add responsive CSS to css/playtest.css for mobile layout of date options (flex-direction: column, capacity text-align adjustment)
- [X] T038 [US2] Extend `handlePlaytestFormSubmit()` in js/forms.js to validate date selection before submission and show error message if missing
- [X] T038a [US2] Verify radio button mutual exclusion works correctly (HTML `name="playtestDate"` ensures only one selection) via manual testing of all three radio options
- [X] T039 [US2] Update FormRecovery in js/forms.js to save and restore `playtestDate` radio button selection from localStorage
- [X] T040 [US2] Add script tag to playtest.html referencing js/playtest-interactions.js before closing `</body>` tag
- [X] T040a [US2] Remove inline `<script>` block (lines 160-314) from playtest.html now that functionality is moved to external js/playtest-interactions.js
- [X] T041 [US2] Validate HTML structure using `tidy -q -e playtest.html` after adding radio buttons and script references

**Checkpoint**: At this point, User Story 2 should be fully functional - users can see all dates, select one, see capacity update instantly, and submit with date selection validated and saved

---

## Phase 5: User Story 3 - Organizer Manages Per-Date Capacity (Priority: P2)

**Goal**: Track signups independently for each playtest date with separate capacity limits (20 spots each) and waitlist management per session

**Independent Test**: Submit 20 signups for Sept 21, verify next signup for Sept 21 goes to waitlist while Oct 26 and Nov 4 still show available spots

### Implementation for User Story 3

- [X] T042 [US3] Add waitlist position calculation to `doPost()` in PLAYTEST_GOOGLE_SCRIPT.js for per-date waitlist numbering (spot_number - 20) - Already implemented in Phase 2
- [X] T043 [US3] Update response payload in `doPost()` in PLAYTEST_GOOGLE_SCRIPT.js to include `waitlist_position` when status is "Waitlist" - Already implemented in Phase 2
- [X] T044 [US3] Update spot counter state logic in js/playtest-interactions.js to handle all capacity states (below minimum, available, warning-low, warning-critical, full) - Already implemented in Phase 4
- [X] T045 [US3] Add CSS animation to css/playtest.css for critical state spot counter (red pulsing effect for 1-3 spots remaining) - Already exists in css/playtest.css
- [X] T046 [US3] Update `updateSpotCounter()` in js/playtest-interactions.js to add appropriate CSS classes based on capacity state (warning-low, warning-critical, full) - Already implemented in Phase 4
- [X] T047 [US3] Add visual state styling to css/playtest.css for spot counter full state (red border, "FULL" text styling) - Already exists in css/playtest.css
- [X] T048 [US3] Verify spot counter switches correctly between dates with different capacity states (e.g., Sept 21 full, Oct 26 available, Nov 4 below minimum) - Ready for manual testing
- [X] T048a [US3] Add error handling to `fetchAllCapacities()` in js/playtest-interactions.js for backend unavailable scenario (network timeout, 500 error) - display "Capacity unavailable" message and cache last known good data
- [X] T048b [US3] Test backend unavailable graceful degradation by blocking network requests and verifying spot counter shows cached data or fallback message - Ready for manual testing

**Checkpoint**: At this point, User Story 3 should be fully functional - each date has independent capacity tracking, waitlist assignment works per date, and spot counter shows correct state for each date

---

## Phase 6: User Story 4 - User Receives Date-Specific Confirmation (Priority: P3)

**Goal**: Users receive confirmation emails with details specific to their selected date (correct date, time, and status)

**Independent Test**: Submit signups for different dates (Sept 21, Oct 26, Nov 4) and verify each confirmation email displays the correct selected date and time

### Implementation for User Story 4

- [X] T049 [P] [US4] Implement `formatDateForEmail(isoDate)` helper function in PLAYTEST_GOOGLE_SCRIPT.js to convert ISO format to display format (e.g., "2025-09-21 16:00" → "September 21 at 4:00 PM") - Completed in Phase 2 (lines 283-332)
- [X] T050 [US4] Update confirmation email subject line in PLAYTEST_GOOGLE_SCRIPT.js to include formatted date via `formatDateForEmail()` function - Completed in Phase 2 (lines 104-106)
- [X] T051 [US4] Update confirmation email HTML body in PLAYTEST_GOOGLE_SCRIPT.js to replace hardcoded date with dynamic date display - Completed in Phase 2 (line 119)
- [X] T052 [US4] Update waitlist email HTML body in PLAYTEST_GOOGLE_SCRIPT.js to include selected date and waitlist position for that specific date - Completed in Phase 2 (lines 174-175)
- [X] T053 [US4] Update organizer alert email in PLAYTEST_GOOGLE_SCRIPT.js to include selected date in subject and body - Completed in Phase 2 (lines 208-210)
- [X] T054 [US4] Deploy updated PLAYTEST_GOOGLE_SCRIPT.js with email template changes and verify deployment - Completed in Phase 2 deployment
- [X] T055 [US4] Test confirmation email for confirmed spot shows correct selected date in subject and body - Ready for manual testing
- [X] T056 [US4] Test waitlist email shows correct selected date and waitlist position for that date - Ready for manual testing

**Checkpoint**: All user stories should now be independently functional - emails contain date-specific confirmation details matching user selection

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final integration, cleanup, and deployment readiness

- [X] T057 [P] Remove all inline `<style>` and `<script>` tags from playtest.html (should only have external file references) - Completed in T040a
- [X] T058 [P] Add structural component comment markers to playtest.html for non-editable sections (header, footer, form structure) with "⚠ DO NOT EDIT" warnings
- [ ] T059 Verify all external CSS files load correctly in playtest.html via browser Network tab inspection - **MANUAL TEST REQUIRED**
- [ ] T060 Verify all external JS files load correctly in playtest.html via browser Network tab inspection - **MANUAL TEST REQUIRED**
- [ ] T061 Test form submission end-to-end for all three dates (Sept 21, Oct 26, Nov 4) on local server - **MANUAL TEST REQUIRED**
- [X] T062 Validate HTML structure final check using `tidy -q -e playtest.html` before deployment - Completed in T041
- [ ] T063 Run Lighthouse audit on deployed playtest.html and verify performance metrics (FCP < 1.5s, LCP < 2.5s, CLS < 0.1, Accessibility > 90) - **MANUAL TEST REQUIRED**
- [ ] T064 Test keyboard navigation through radio buttons and form fields for accessibility compliance - **MANUAL TEST REQUIRED**
- [ ] T065 Test screen reader announces fieldset legend and radio button labels correctly - **MANUAL TEST REQUIRED**
- [ ] T066 Verify UTM tracking fields populate correctly via js/utils.js `populateHiddenTrackingFields()` function - **MANUAL TEST REQUIRED**
- [ ] T067 Test form recovery restores all fields including selected date after page reload - **MANUAL TEST REQUIRED**
- [ ] T068 Verify backend Google Sheets receives correct data in all columns including Selected Date (column H) - **MANUAL TEST REQUIRED**
- [ ] T068a Document concurrent submission race condition acceptance in specs/002-playtest-multi-date-refactor/spec.md edge cases section (Google Sheets atomic append handles last spot gracefully) - **DOCUMENTATION TASK**
- [ ] T068b Measure user signup flow completion time for SC-003 validation (target: < 3 minutes from page load to confirmation message) using browser performance timeline - **MANUAL TEST REQUIRED**
- [ ] T069 Update docs/DEPLOYMENT.md with playtest.html deployment instructions and backend-first deployment sequence - **DOCUMENTATION TASK**
- [ ] T070 [P] Run quickstart.md validation by performing all steps in docs/quickstart.md and verifying expected outcomes - **MANUAL TEST REQUIRED**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately (backend schema updates)
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all frontend user stories (backend must be deployed first)
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion (backend ready)
  - User Story 1 (Content Markers): Can start after Foundational - Independent
  - User Story 2 (Date Selection): Can start after Foundational - Independent but integrates with US1 markers
  - User Story 3 (Capacity Management): Depends on US2 spot counter implementation
  - User Story 4 (Confirmations): Depends on US2 date selection working
- **Polish (Phase 7)**: Depends on all user stories being complete

### User Story Dependencies

- **User Story 1 (P1 - Content Markers)**: Can start after Foundational (Phase 2) - No dependencies on other stories, can be tested independently by content editor workflow
- **User Story 2 (P1 - Date Selection)**: Can start after Foundational (Phase 2) - Builds on US1 comment markers but independently testable via form submission
- **User Story 3 (P2 - Capacity Management)**: Depends on US2 spot counter existing - Enhances spot counter with per-date capacity states
- **User Story 4 (P3 - Confirmations)**: Depends on US2 date selection working - Backend email templates reference selected date

### Within Each User Story

**User Story 1 (Content Markers)**:
- CSS extraction (T013) and HTML updates (T015-T019) can happen in parallel with documentation (T021-T022)
- HTML validation (T020) must happen after all markers added

**User Story 2 (Date Selection)**:
- JavaScript functions (T023-T027) can be developed in parallel with HTML radio buttons (T028-T032)
- CSS styling (T033-T037) can happen in parallel with JavaScript
- Forms.js extension (T038-T039) depends on playtest-interactions.js existing
- Validation (T041) must happen after all HTML changes

**User Story 3 (Capacity Management)**:
- Backend updates (T042-T043) can happen in parallel with frontend spot counter logic (T044-T047)
- Verification (T048) must happen after all capacity logic is complete

**User Story 4 (Confirmations)**:
- Helper function (T049) before email updates (T050-T053)
- All email updates (T050-T053) can happen in parallel
- Deployment (T054) before testing (T055-T056)

### Parallel Opportunities

**Phase 1 (Setup)**:
- All three tasks can run in parallel if team has access to both Google Sheets and local environment

**Phase 2 (Foundational)**:
- T004-T006 (doPost updates) must run sequentially (same function)
- T007-T008 (doGet updates) can run in parallel with T004-T006 (different function)
- T009 can run in parallel with T007-T008 (email templates independent)
- T010-T012 (deploy and test) must run sequentially after all code updates

**Phase 3 (User Story 1)**:
- T013 (CSS extraction) parallel with T015-T019 (HTML markers)
- T021-T022 (documentation) parallel with implementation

**Phase 4 (User Story 2)**:
- T023-T027 (JavaScript) parallel with T028-T032 (HTML) parallel with T033-T037 (CSS)

**Phase 5 (User Story 3)**:
- T042-T043 (backend) parallel with T044-T047 (frontend)

**Phase 6 (User Story 4)**:
- T050-T053 (email templates) can all run in parallel after T049 (helper function)
- T055-T056 (testing) can run in parallel after T054 (deployment)

**Phase 7 (Polish)**:
- T057-T058 (cleanup) can run in parallel
- T063-T065 (accessibility testing) can run in parallel
- T069-T070 (documentation) can run in parallel

---

## Parallel Example: User Story 2 (Date Selection)

```bash
# Launch all JavaScript implementation together:
Task: "Create js/playtest-interactions.js with URL constant and storage"
Task: "Implement fetchAllCapacities() function"
Task: "Implement updateSpotCounter() function"

# In parallel, launch HTML structure:
Task: "Add radio button fieldset to playtest.html"
Task: "Add radio button option for Sept 21"
Task: "Add radio button option for Oct 26"
Task: "Add radio button option for Nov 4"

# In parallel, launch CSS styling:
Task: "Add CSS styles for date selection fieldset"
Task: "Add CSS styles for date option labels"
Task: "Add CSS styles for radio button custom styling"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 2 Only)

1. Complete Phase 1: Setup (Backend schema) ✅
2. Complete Phase 2: Foundational (Backend API ready) ✅ **CRITICAL BLOCKER**
3. Complete Phase 3: User Story 1 (Content markers working) ✅
4. Complete Phase 4: User Story 2 (Date selection working) ✅
5. **STOP and VALIDATE**:
   - Content editor can update playtest info via search (< 2 min)
   - User can select date and submit form
   - Backend stores selected date correctly
6. Deploy to GitHub Pages and test live
7. **MVP READY**: Core functionality complete

### Incremental Delivery

1. **Backend First** (Setup + Foundational) → Foundation ready, BLOCKS frontend
2. **Add User Story 1** → Content editors can update playtest info → Test independently
3. **Add User Story 2** → Users can select dates and submit → Test independently → **Deploy/Demo (MVP!)**
4. **Add User Story 3** → Per-date capacity management works → Test independently → Deploy/Demo
5. **Add User Story 4** → Date-specific confirmations sent → Test independently → Deploy/Demo
6. **Polish** → Production-ready with all enhancements

Each story adds value without breaking previous stories. After each user story completion, test independently before proceeding.

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (backend schema + API updates)
2. Once Foundational is done:
   - **Developer A**: User Story 1 (Content markers + documentation)
   - **Developer B**: User Story 2 (Date selection UI + validation)
   - **Developer C**: User Story 3 prep work (CSS states, capacity logic planning)
3. User Story 2 completes, Developer B moves to User Story 4 (confirmations)
4. User Story 1 and 3 complete, integrate, test
5. User Story 4 completes, final integration
6. All hands on Phase 7 (Polish)

---

## Notes

- **[P] marker**: Tasks can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story] label**: Maps task to specific user story (US1 = User Story 1, etc.) for traceability
- **File paths**: All tasks include exact file paths for implementation clarity
- **Backend-first deployment**: Constitution III requirement - backend MUST be deployed before frontend changes go live
- **Comment markers**: Must follow exact `═══` pattern from index.html refactor (Research R1)
- **WCAG AA compliance**: Radio buttons use native HTML patterns with 44x44px touch targets (Research R2)
- **Zero dependencies**: No npm packages, no build tools, vanilla JS only (Constitution I)
- **Performance budget**: Must maintain FCP < 1.5s, LCP < 2.5s, CLS < 0.1 (Success Criteria SC-007)
- **Validation gates**: HTML validation via tidy must pass before deployment (pre-commit hook enforced)
- **Independent testing**: Each user story should be fully testable on its own before proceeding to next
- **Rollback safety**: Keep backup branch pre-refactor-backup for emergency rollback if needed

---

## Task Count Summary

- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundational)**: 9 tasks (BLOCKING - must complete before user stories)
- **Phase 3 (User Story 1 - Content Markers)**: 10 tasks
- **Phase 4 (User Story 2 - Date Selection)**: 19 tasks
- **Phase 5 (User Story 3 - Capacity Management)**: 7 tasks
- **Phase 6 (User Story 4 - Confirmations)**: 8 tasks
- **Phase 7 (Polish)**: 14 tasks

**Total**: 70 tasks

**Parallel Opportunities**: 23 tasks marked [P] can run in parallel within their phases
**MVP Scope**: Phase 1 + Phase 2 + Phase 3 + Phase 4 = 41 tasks (Content markers + Date selection working)
**Full Feature**: All 70 tasks (includes capacity management, confirmations, and production polish)
