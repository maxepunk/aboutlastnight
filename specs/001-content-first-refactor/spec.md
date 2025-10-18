# Feature Specification: Content-First Codebase Refactor

**Feature Branch**: `001-content-first-refactor`
**Created**: 2025-01-19
**Status**: Draft
**Input**: User description: "Our current codebase is difficult to work on, both in terms of technical and content updates, and I would like to refactor it to be more maintainable and make content updates more streamlined."

## Clarifications

### Session 2025-01-19

- Q: What happens when content editor accidentally breaks HTML structure (unclosed tag, malformed markup)? → A: Validation at commit/PR time via git hook or linter that blocks push; editor gets feedback before deploy
- Q: How does the system handle form submission failures (Google Apps Script downtime, network errors)? → A: Error message with retry + localStorage recovery - data preserved, user can retry immediately or later
- Q: What happens if CSS/JS file structure changes and content editor's mental model of "where to find things" becomes invalid? → A: Update documentation with migration guide
- Q: What does "zero dependency" mean for validation tooling (git hooks)? → A: System-level binaries (tidy, python standard library) are acceptable; npm packages, build tools, and package managers are not. The principle prevents framework/library churn that requires technical intervention for content updates, not all external programs.
- Q: Should content be extracted to separate files (HTML partials, JSON) or kept in index.html with comment markers? → A: Keep content in index.html with distinctive comment markers. Extracting to partials/JSON would break Ctrl+F searchability and require content editors to understand file includes or data binding. CSS and JavaScript will be extracted to separate files (concerns separation), but editable text content remains in HTML for maximum accessibility to non-technical editors.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Content Editor Makes Text Updates (Priority: P1)

A non-technical content editor needs to update event details (dates, pricing, location) and marketing copy without technical assistance.

**Why this priority**: Content updates are the most frequent operation (weekly during campaign). Blocking on technical availability slows marketing response time and costs money.

**Independent Test**: Content editor can find and update the tagline "Some memories are worth killing for" to "Every memory has a price" within 2 minutes, preview the change locally, and confirm the update appears on the live site after push.

**Acceptance Scenarios**:

1. **Given** content editor needs to update ticket pricing from $75 to $85, **When** they search for "$75", **Then** they find exactly one location with clear context (not buried in JavaScript or CSS)
2. **Given** content editor updates FAQ question text, **When** they save and preview, **Then** the change is visible without running build commands or restarting services
3. **Given** content editor needs to add a new FAQ question, **When** they copy an existing FAQ block and modify it, **Then** the new question appears correctly formatted with accordion functionality intact

---

### User Story 2 - Developer Refactors Code Structure (Priority: P2)

A developer needs to reorganize code (e.g., extract CSS to separate files, componentize sections) to improve maintainability without breaking existing content or form submissions.

**Why this priority**: Technical debt makes future feature work slower. Refactoring enables faster velocity for future content and features, but shouldn't block current content updates.

**Independent Test**: Developer can extract all CSS from index.html into a separate stylesheet, verify forms still submit successfully, and confirm content editor can still find and update text in the same locations.

**Acceptance Scenarios**:

1. **Given** developer wants to extract inline CSS to external file, **When** they create styles.css and link it, **Then** all visual elements render identically and no JavaScript breaks
2. **Given** developer wants to split JavaScript into modules, **When** they refactor, **Then** form submission to Google Apps Script still functions and tracking IDs generate correctly
3. **Given** developer creates component templates for repeated sections (FAQ items, creator profiles), **When** content editor updates text, **Then** they can still find content via simple text search without understanding template syntax

---

### User Story 3 - Developer Adds New Interactive Feature (Priority: P3)

A developer needs to add a new interactive component (e.g., countdown timer, image carousel) while maintaining the zero-dependency architecture and content-first principles.

**Why this priority**: New features enhance user experience but are less frequent than content updates. Must not compromise core principle of easy content editing.

**Independent Test**: Developer can add an event countdown timer that updates daily, verify it works without external libraries, and confirm content editor can update the target date without understanding JavaScript.

**Acceptance Scenarios**:

1. **Given** developer adds countdown timer, **When** they implement using vanilla JavaScript, **Then** the feature works across all target browsers without adding npm packages or build steps
2. **Given** timer needs date configuration, **When** developer uses HTML data attribute, **Then** content editor can update `data-event-date="2025-10-04"` via text search
3. **Given** new feature added, **When** content editor makes unrelated copy changes, **Then** they don't accidentally break the new feature due to unclear boundaries

---

### Edge Cases

- **Broken HTML markup**: See FR-013 for complete validation strategy (git hook blocks malformed commits with immediate error feedback showing line numbers)
- **Form submission failures**: See FR-014 for complete resilience strategy (localStorage recovery with retry functionality and 7-day TTL)
- **File structure changes**: When refactoring changes file organization, documentation MUST be updated with migration guide showing old locations mapped to new locations (e.g., "Pricing used to be in index.html line 542, now in content/pricing.html line 12"). Content editors reference this guide to update their mental model of the codebase.
- **Auto-generated IDs/classes**: JavaScript-dependent IDs (e.g., accordion triggers, form field IDs) will be marked with comment warnings: `<!-- DO NOT EDIT: ID required for form submission -->`. Comment markers for editable content will explicitly state "SAFE TO EDIT: [what can be changed]" to create clear boundaries. Git hook validation cannot catch ID changes (semantic not structural), so documentation and clear comments are the primary defense. If content editor breaks JavaScript by modifying an ID, local preview will fail immediately (accordion stops working, form doesn't submit), providing feedback before pushing to production.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Codebase MUST allow non-technical users to update text content by searching for the text and editing it directly
- **FR-002**: File organization MUST make it obvious where content lives vs. where code logic lives
- **FR-003**: Any refactoring MUST maintain form submission functionality to Google Apps Script endpoints without requiring endpoint URL changes
- **FR-004**: Changes to code structure MUST NOT break existing content editor workflows (finding and updating text)
- **FR-005**: Codebase MUST remain deployable via simple git push (GitHub Pages auto-deploy) with no build step
- **FR-006**: Refactoring MUST preserve zero-dependency principle (no npm packages, no frameworks, no build tools)
- **FR-007**: Code organization MUST separate concerns (content vs. styling vs. behavior) while keeping files discoverable
- **FR-008**: Repeated content patterns (FAQ items, creator profiles, evidence cards) MUST be duplicatable by content editor with zero coding experience in under 5 minutes by copying an existing block and modifying text (verified by SC-002 acceptance test)
- **FR-009**: Form fields and validation MUST remain synchronized between HTML forms and Google Apps Script backends
- **FR-010**: All accessibility features (keyboard navigation, ARIA attributes, touch targets) MUST be preserved through refactoring
- **FR-011**: Performance characteristics (load time, animation smoothness, scroll performance) MUST not degrade
- **FR-012**: Documentation MUST exist explaining to content editors where to find and how to update each type of content, and MUST include migration guide when file structure changes showing old-to-new location mappings
- **FR-013**: Git hooks or pre-commit validation MUST check HTML structure validity and block commits containing malformed markup, providing clear error messages to content editors
- **FR-014**: Form submission failures MUST display user-friendly error messages with retry functionality, and form data MUST be preserved in localStorage to prevent data loss during transient backend failures

### Key Entities

- **Content Block**: Any editable text content including headings, paragraphs, button labels, form placeholders, and metadata (title tags, descriptions)
- **Structural Component**: Repeated UI patterns like FAQ items, accordion sections, creator profile cards, evidence items - need consistent structure for functionality but editable content
- **Form Configuration**: Form field definitions, validation rules, endpoint URLs, and tracking parameters that must stay synchronized with backend scripts
- **Interactive Behavior**: JavaScript-driven features like accordions, sticky headers, form submission, parallax effects - code that content editors should not need to modify

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Content editor can locate and update any piece of visible text within 2 minutes using text search
- **SC-002**: Content editor can add a new FAQ question by copying an existing example in under 5 minutes without technical assistance
- **SC-003**: Developer refactoring does not break form submissions (verified by test submission to Google Sheets after each refactor)
- **SC-004**: Page load performance remains under 1.5 seconds First Contentful Paint on 3G (current baseline)
- **SC-005**: Codebase passes all accessibility checks (WCAG AA compliance, keyboard navigation, screen reader compatibility) after refactoring
- **SC-006**: Content update documentation exists covering all content types (event details, pricing, dates, copy, FAQ, creator bios) and includes migration guide mapping old file locations to new locations after refactoring
- **SC-007**: Zero external dependencies maintained (verified by absence of package.json, node_modules, or import statements referencing CDNs except Google Fonts)
- **SC-008**: All existing features function identically after refactor (visual regression testing, form submission, animations, responsive behavior)
- **SC-009**: Git validation catches 100% of malformed HTML before it reaches production (verified by attempting to commit intentionally broken markup)
- **SC-010**: Form data survives backend failures and network errors (verified by simulating Google Apps Script downtime and confirming data recovery from localStorage after retry)

### Assumptions

- **File Structure Decision**: Content will remain in index.html with comment markers (keeps text searchable via Ctrl+F). CSS and JavaScript will be separated into multiple files organized by concern (base/layout/components/animations for CSS, interactions/forms/utils for JavaScript) - all human-readable vanilla code without build step.
- **Content Editor Tools**: Content editors will use VS Code or similar text editor with search capability, will preview via local file:// protocol or GitHub Pages deployment
- **Refactoring Scope**: Focus on reorganizing existing code for clarity, not adding new build tooling or changing deployment process
- **Testing Approach**: Manual testing sufficient (no automated test suite required given small codebase size and zero-dependency constraint)
- **Timeline**: Refactoring happens before October 4 launch, allowing time for content team to adapt to new structure
- **Content Types**: Primary content requiring frequent updates: event dates/times, pricing, availability status, FAQ answers, creator bios, marketing headlines
- **Current Performance Baseline**: (To be measured in T000 before refactor begins) - Expected ~1.2-1.5s FCP, ~2.0-2.5s LCP, ~2.5-3.0s TTI on 3G based on single-file HTML structure. Refactor MUST maintain or improve these metrics per SC-004.
