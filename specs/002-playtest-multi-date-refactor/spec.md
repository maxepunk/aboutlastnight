# Feature Specification: Playtest Page Multi-Date Refactor

**Feature Branch**: `002-playtest-multi-date-refactor`
**Created**: 2025-10-18
**Status**: Draft
**Input**: User description: "we just finished our previous sprint to refactor index.html. Now we want to take the playtest sign up page through a similar process to make it easier to make content updates, and also to accomodate choice between multiple playtest dates. In addition to the currently hardcoded playtest date, we want to add October 26 at 3pm and Nov 4 at 6:30pm as additional playtest dates (using the same google sheet as the backend--we can update the spreadsheet schema)"

## Clarifications

### Session 2025-10-18

- Q: What UI mechanism should be used for date selection? → A: Radio buttons with descriptive labels for each date
- Q: What happens when a user doesn't select a date before submitting the form? → A: Client-side validation blocks submission with error message
- Q: How does the spot counter update when switching between date options? → A: Load all date capacities on page load; switch instantly using pre-loaded data
- Q: What happens when all dates are full - is the entire form disabled or can users still join waitlists? → A: Keep form enabled; users can still join waitlist for any date
- Q: What if the Google Sheets backend schema doesn't yet have the date selection column? → A: Backend schema must be updated before frontend deployment (deployment prerequisite)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Content Editor Updates Playtest Information (Priority: P1)

Content editors need to update playtest details (dates, times, locations, descriptions) quickly and confidently without understanding HTML structure or risking breaking the live site.

**Why this priority**: Content updates are the most frequent operation. Making this easy and safe is the primary value proposition of the refactor, mirroring the successful index.html refactor.

**Independent Test**: Can be fully tested by a non-technical user performing a content update (e.g., changing event description or location) in under 2 minutes using only Ctrl+F search, and deploying without validation errors.

**Acceptance Scenarios**:

1. **Given** a content editor needs to update the playtest description, **When** they search for "PLAYTEST DESCRIPTION" in playtest.html, **Then** they find the content within 10 seconds with clear comment marker boundaries showing what is safe to edit
2. **Given** a content editor needs to change the location address, **When** they search for "LOCATION" and edit the address text, **Then** the change deploys successfully without HTML validation errors
3. **Given** a content editor wants to update the surveillance protocol consent language, **When** they search for "SURVEILLANCE PROTOCOL" and modify the text, **Then** the form functionality remains intact and the updated text appears correctly
4. **Given** a content editor needs to add a new playtest date (Dec 1 at 7pm), **When** they search for "PLAYTEST DATES", duplicate the Oct 26 radio button block, update date/time/value attributes, and commit, **Then** the pre-commit hook passes validation and the new date appears on the deployed site within 2 minutes

---

### User Story 2 - User Selects Preferred Playtest Date (Priority: P1)

Users visiting the playtest signup page need to see all available playtest dates and select their preferred session from multiple date/time options.

**Why this priority**: This is the core new functionality enabling multiple playtest sessions. Without this, users cannot sign up for specific dates.

**Independent Test**: Can be fully tested by a user visiting the playtest page, viewing all available dates (September 21 at 4:00 PM, October 26 at 3:00 PM, November 4 at 6:30 PM), selecting one, and successfully submitting the form with their date selection recorded.

**Acceptance Scenarios**:

1. **Given** a user loads the playtest signup page, **When** the page renders, **Then** all three playtest date options (September 21 at 4:00 PM, October 26 at 3:00 PM, November 4 at 6:30 PM) are visible with clear date/time information
2. **Given** a user views the date selection interface, **When** they select a preferred date, **Then** the selection is visually confirmed and ready for submission
3. **Given** a user has selected a date and filled out the form, **When** they submit, **Then** their chosen date is included in the submission data sent to the backend
4. **Given** a specific playtest date is full, **When** a user views that date option, **Then** it is visually marked as full but remains selectable for waitlist signup (radio button enabled)

---

### User Story 3 - Organizer Manages Per-Date Capacity (Priority: P2)

Organizers need to track signups independently for each playtest date, with separate capacity limits and waitlist management for each session.

**Why this priority**: Essential for operations but can be tested after basic date selection works. Each playtest session has independent capacity constraints.

**Independent Test**: Can be tested by verifying the backend correctly stores date-specific signups, tracks capacity per date (20 spots each), and assigns waitlist positions separately for each date when capacity is reached.

**Acceptance Scenarios**:

1. **Given** the September 21 playtest reaches 20 confirmed signups, **When** a new user selects September 21 and submits, **Then** they are placed on the September 21 waitlist without affecting capacity for October 26 or November 4 sessions
2. **Given** each playtest date has independent capacity tracking, **When** the page loads, **Then** the displayed spot counter shows accurate remaining spots for the selected date
3. **Given** a user is on the waitlist for October 26, **When** a confirmed attendee cancels for October 26, **Then** the first waitlist person for October 26 can be promoted independently of other dates

---

### User Story 4 - User Receives Date-Specific Confirmation (Priority: P3)

Users who sign up for a playtest receive confirmation emails with details specific to their selected date (correct date, time, and any date-specific instructions).

**Why this priority**: Important for user experience but depends on date selection and submission working first. Can be implemented after core functionality is complete.

**Independent Test**: Can be tested by submitting signups for different dates and verifying each confirmation email contains the correct date, time, and session-specific details.

**Acceptance Scenarios**:

1. **Given** a user successfully signs up for the October 26 at 3:00 PM session, **When** the confirmation email is sent, **Then** it displays "October 26 at 3:00 PM" (not other dates)
2. **Given** a user is placed on the waitlist for November 4, **When** the confirmation email is sent, **Then** it clearly states their waitlist position for the November 4 at 6:30 PM session specifically
3. **Given** different playtest dates may have different instructions, **When** a user receives confirmation, **Then** any date-specific instructions (if configured) are included

---

### Edge Cases

- **No date selected on submission**: Client-side validation blocks form submission and displays user-friendly error message prompting date selection before submission is allowed
- **Spot counter when switching dates**: System loads all date capacities on page load; spot counter switches instantly using pre-loaded data when user selects different radio button (no additional backend calls during date switching)
- **All dates at capacity**: Form remains enabled; users can still select any date and join the waitlist for that specific date (form does not disable when all dates are full)
- **Backend schema compatibility**: Google Sheets backend schema MUST be updated with date selection column before frontend deployment (deployment prerequisite to prevent data loss)
- **Concurrent submissions for last spot**: Google Sheets append operations are atomic at the row level. When multiple users submit for the final spot simultaneously, Google Apps Script processes requests sequentially. The first request acquires spot #20 (Confirmed), subsequent requests receive spot #21+ (Waitlist). No optimistic locking implemented—accepted race condition with graceful waitlist fallback.
- **Backend unavailable / capacity fetch failure**: When GET request for capacity data fails (network error, quota exceeded, script timeout), spot counter displays "Capacity unavailable" message with cached/stale data if available, or hides counter entirely. Form submission remains enabled—backend validation is authoritative. User sees generic "Please try again" error message if POST submission also fails, with localStorage recovery preserving form data.
- **Timezone display policy**: All times displayed in Pacific Time (PT) without timezone detection or conversion. This is a known limitation—international users must manually convert times. Future enhancement could add timezone detection, but MVP ships with PT-only display to avoid complexity. Assumption: 95%+ of target audience is Pacific timezone (SF Bay Area locals).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display all available playtest dates (September 21 at 4:00 PM, October 26 at 3:00 PM, November 4 at 6:30 PM) with clear visual presentation
- **FR-002**: Users MUST be able to select exactly one preferred playtest date before submission using radio button inputs with descriptive labels
- **FR-003**: System MUST include the selected date in the form submission data sent to the backend
- **FR-004**: System MUST prevent form submission if no date is selected using client-side validation that displays an error message and blocks submission
- **FR-005**: System MUST display remaining capacity independently for each playtest date by loading all date capacities on page load and switching spot counter instantly when user changes date selection (no fetch-on-select)
- **FR-006**: Content editors MUST be able to find and update playtest event details in under 2 minutes using search-based workflow
- **FR-007**: Playtest page MUST include comment markers following the same pattern established in index.html refactor (distinctive box-drawing borders with EDITABLE CONTENT or STRUCTURAL COMPONENT labels). Pattern example:
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: PLAYTEST DESCRIPTION                  -->
<!-- SAFE TO EDIT: Event description paragraph text          -->
<!-- FIND WITH: Search "PLAYTEST DESCRIPTION"                -->
<!-- ═══════════════════════════════════════════════════════ -->
<p>Join us for an exclusive playtest...</p>
<!-- END CONTENT SECTION: PLAYTEST DESCRIPTION ============= -->
```
Reference: See index.html lines 250-350 for full pattern implementation.
- **FR-008**: System MUST maintain all existing playtest functionality (spot counter, photo consent, waitlist logic, form recovery)
- **FR-009**: Backend MUST store date selection with each signup record
- **FR-010**: System MUST send confirmation emails containing the user's selected date and time
- **FR-011**: Confirmation email MUST differentiate between confirmed spots and waitlist positions per date
- **FR-012**: System MUST gracefully handle missing date selection with user-friendly error message
- **FR-013**: System MUST maintain visual consistency with the noir crime thriller aesthetic of the existing playtest page
- **FR-014**: Content editors MUST be able to add or remove playtest dates without developer assistance by duplicating or removing radio button input blocks within clearly marked comment boundaries. Measurable: Content editor can duplicate an existing radio button block (lines marked by `<!-- PLAYTEST DATES -->` comment), update the date/time values, commit, and deploy in under 5 minutes without HTML validation errors.

### Key Entities *(include if feature involves data)*

- **Playtest Date**: Represents a specific playtest session with date, time, capacity limit, current signups, and waitlist queue
- **Signup Record**: Links a user (name, email, photo consent) to a specific playtest date with status (confirmed/waitlist) and position number
- **Comment Marker**: Visual boundary in HTML identifying editable content sections with search terms for content editors
- **Spot Counter State**: Tracks remaining spots, current signups, minimum player threshold, and waitlist status for a specific playtest date; all date capacities loaded on page initialization and cached client-side for instant switching

### Assumptions

- **Backend Schema Update**: Google Sheets backend MUST be updated to include a new "Selected Date" column BEFORE frontend deployment (deployment prerequisite)
- **Single Backend**: All three playtest dates will use the same Google Sheets backend with date selection stored as a field (not separate sheets per date)
- **Comment Marker Pattern**: The comment marker pattern from index.html refactor (box-drawing characters with EDITABLE CONTENT labels) is already established and will be reused
- **HTML Validation**: Pre-commit HTML validation hook is already configured and working from the index.html refactor
- **Zero-Dependency Architecture**: Solution maintains zero build dependencies (no npm, no frameworks) consistent with project architecture
- **Pacific Time Display**: All times displayed are Pacific Time without timezone conversion for users in other timezones
- **Capacity Limit**: Each playtest session has 20-spot capacity with waitlist enabled when capacity is reached
- **Photo Consent Optional**: Photo consent checkbox remains optional (not required for signup) as in current implementation
- **Existing Forms Infrastructure**: Form submission infrastructure (Google Apps Script endpoint, retry logic, localStorage recovery) already exists and will be extended

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Content editors can locate and update any playtest content section in under 2 minutes using Ctrl+F search (measured from "I need to update X" to finding the correct section)
- **SC-002**: 100% of playtest date signups are associated with a specific date selection (no null/missing date values in backend)
- **SC-003**: Users can complete the entire signup flow (view dates, select date, fill form, submit) in under 3 minutes on first visit
- **SC-004**: System prevents 100% of form submissions without date selection (validation error shown before submission)
- **SC-005**: Confirmation emails display correct date information for 100% of signups (no date mismatch between selection and confirmation)
- **SC-006**: Per-date capacity tracking operates independently (filling Sept 21 does not affect Oct 26 or Nov 4 capacity)
- **SC-007**: Page maintains existing performance metrics (First Contentful Paint < 1.5s, Largest Contentful Paint < 2.5s, Cumulative Layout Shift < 0.1)
- **SC-008**: Zero HTML validation errors on commit (pre-commit hook passes 100% of the time for valid content updates)
- **SC-009**: Comment markers enable non-technical users to make content updates without breaking functionality (95%+ success rate for content editor updates)
- **SC-010**: Visual consistency maintained with existing noir aesthetic (no visual regressions from current playtest.html design)

