# Implementation Tasks: Content-First Codebase Refactor

**Feature**: Content-First Codebase Refactor
**Branch**: `001-content-first-refactor`
**Status**: Ready for implementation
**Date**: 2025-01-19

**Acronyms**: GAS = Google Apps Script (backend for form submissions)

---

## Overview

This document provides a complete task breakdown for refactoring the About Last Night landing page to optimize for content-first updates while maintaining zero dependencies and form reliability.

### User Stories (from spec.md)

- **User Story 1 (P1)**: Content Editor Makes Text Updates - *Most frequent operation, blocks marketing*
- **User Story 2 (P2)**: Developer Refactors Code Structure - *Reduces technical debt*
- **User Story 3 (P3)**: Developer Adds New Interactive Feature - *Enhances UX without breaking content workflow*

### Implementation Strategy

**MVP Scope**: User Story 1 only (Content editor text updates)
- Provides immediate value to content team
- Establishes foundation for remaining stories
- Can be deployed independently

**Incremental Delivery**:
1. Phase 1-3 (Setup + Foundational + US1) = **MVP** - Deploy and validate with content team
2. Phase 4 (US2) = Enhanced developer experience
3. Phase 5 (US3) = Demonstrates pattern for future features

---

## Phase 1: Setup (Project Initialization)

**Goal**: Prepare development environment and install required tools

**Parallel Opportunities**: All setup tasks can run in parallel (different systems/configs)

### Tasks

- [X] T000 [P] Measure current performance baseline: Run Lighthouse on live aboutlastnightgame.com, record FCP, LCP, TTI scores, save JSON report and screenshots to specs/001-content-first-refactor/baseline-performance/ for post-refactor comparison (target: no degradation per SC-004)
- [X] T001 [P] Install HTML Tidy validation tool via `sudo apt-get install tidy`
- [X] T002 [P] Verify tidy installation with `tidy --version`, confirm HTML5 support
- [X] T003 [P] Create backup branch of current codebase with `git checkout -b pre-refactor-backup`
- [X] T004 [P] Document current file structure in CURRENT_STRUCTURE.md: Run `wc -l index.html playtest.html` for exact line counts, document line number ranges for each content section (hero ~100-200, pricing ~300-400, FAQ ~400-600, creators ~600-800, footer ~800-900) for migration guide baseline
- [X] T005 [P] Audit index.html and identify all Content Blocks (hero, pricing, dates, FAQ, creators)
- [X] T005.1 [P] Create feature inventory in specs/001-content-first-refactor/FEATURE_INVENTORY.md: Document all interactive features (accordions, sticky header, parallax scrolling, form submission with tracking IDs, form validation, responsive breakpoints, animations, email confirmation) with test checklist for SC-008 verification
- [X] T006 [P] Create directory structure: css/, js/, docs/, .githooks/

**Completion Criteria**: All tools installed, directories created, current state documented

---

## Phase 2: Foundational (Blocking Prerequisites)

**Goal**: Implement validation and documentation infrastructure that ALL user stories depend on

**Dependencies**: Must complete Phase 1 before starting Phase 2

### Tasks

- [X] T007 Create .githooks/pre-commit script implementing HTML validation per contracts/html-validation-hook.yaml
- [X] T008 Configure git to use .githooks with `git config core.hooksPath .githooks`
- [X] T009 Make pre-commit hook executable with `chmod +x .githooks/pre-commit`
- [X] T010 Test pre-commit hook initial installation: Attempt commit with intentionally broken HTML (unclosed <div> tag), verify hook blocks commit and shows clear error message with line number and description
- [X] T011 Test pre-commit hook positive case: Commit valid HTML change, verify hook allows commit to proceed without error (confirms hook doesn't block legitimate content updates)
- [X] T012 Create docs/CONTENT_GUIDE.md template with placeholder sections for each content type
- [X] T012.1 Verify form field names in index.html and playtest.html match Google Apps Script backend expectations by reading FORM_HANDLER_GOOGLE_SCRIPT.js and PLAYTEST_GOOGLE_SCRIPT.js doPost() parameter mappings (e.g., e.parameter.email, e.parameter.name)
- [X] T012.2 Test comment marker rendering in VS Code: Add example markers using box-drawing characters (═, ║, ╔, ╗, ╚, ╝) to index.html, verify they render correctly, document in CONTENT_GUIDE.md that UTF-8 encoding required (already default for HTML5)

**Independent Test**: Attempt to commit malformed HTML (unclosed tag) → hook blocks commit with clear error showing line number

**Completion Criteria**: Git hook validates HTML, blocks bad commits, documentation template exists, form field synchronization verified with GAS backend scripts (T012.1)

---

## Phase 3: User Story 1 - Content Editor Makes Text Updates (P1)

**User Story**: A non-technical content editor needs to update event details (dates, pricing, location) and marketing copy without technical assistance.

**Goal**: Make content searchable, editable, and safe to modify with clear guidance

**Dependencies**: Requires Phase 2 (git hook must catch errors content editors make)

**Independent Test**: Content editor can find and update the tagline "Some memories are worth killing for" to "Every memory has a price" within 2 minutes, preview the change locally, and confirm the update appears on the live site after push.

### 3.1 Add Comment Markers to Existing Content

- [X] T013 [US1] Add distinctive comment markers to hero section in index.html (lines ~100-200)
- [X] T014 [US1] Add comment markers to pricing/dates section in index.html (lines ~300-400)
- [X] T015 [US1] Add comment markers to FAQ section in index.html (lines ~400-600)
- [X] T016 [US1] Add comment markers to creator profiles section in index.html (lines ~600-800)
- [X] T017 [US1] Add comment markers to footer/contact section in index.html (lines ~800-900)

**Comment Marker Patterns** (per entity types from spec.md):

**1. Content Block Pattern** (simple text editable):
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: [SECTION NAME]                        -->
<!-- SAFE TO EDIT: All text within this section              -->
<!-- FIND WITH: Search for "[SECTION NAME]"                  -->
<!-- ═══════════════════════════════════════════════════════ -->
```

**2. Structural Component Pattern** (repeatable templates like FAQs, creator cards):
```html
<!-- ╔═══════════════════════════════════════════════════════╗ -->
<!-- ║ STRUCTURAL COMPONENT: [COMPONENT NAME]                 ║ -->
<!-- ║ SAFE TO EDIT: Text content only (not HTML structure)   ║ -->
<!-- ║ TO ADD NEW: Copy entire block between these markers    ║ -->
<!-- ║ DO NOT EDIT: IDs, classes, or HTML tags                ║ -->
<!-- ╚═══════════════════════════════════════════════════════╝ -->
```

**3. Interactive Behavior Marker** (do not edit):
```html
<!-- ⚠ DO NOT EDIT BELOW: JavaScript dependencies (IDs, classes, data attributes) ⚠ -->
```

**Marker Placement Rules**:
1. **Content Block markers**: Place BEFORE opening tag of section (e.g., before `<section class="hero">`)
2. **Structural Component markers**: Wrap ENTIRE repeatable unit (from opening tag to closing tag of one FAQ item, one creator card, etc.)
3. **Interactive Behavior markers**: Place BEFORE any `<script>` tag or element with `id=` that JavaScript references
4. **Nesting**: Content Blocks can contain Structural Components; markers must not overlap
5. **Indentation**: Markers should match indentation of the HTML they annotate

### 3.2 Document Content Locations

- [X] T018 [US1] Document hero section location in docs/CONTENT_GUIDE.md (tagline, event title)
- [X] T019 [US1] Document pricing/dates location in docs/CONTENT_GUIDE.md (ticket price, event dates)
- [X] T020 [US1] Document FAQ section location in docs/CONTENT_GUIDE.md (how to add/edit questions)
- [X] T021 [US1] Document creator profiles location in docs/CONTENT_GUIDE.md (names, roles, bios)
- [X] T022 [US1] Document footer location in docs/CONTENT_GUIDE.md (contact info, social links)

### 3.3 Create Migration Guide

- [X] T023 [US1] Create docs/MIGRATION_GUIDE.md with current→new location mappings (created DURING refactor as tasks complete, updated continuously through Phase 3-5, not retroactively) - reference CURRENT_STRUCTURE.md baseline from T004
- [X] T024 [US1] Add visual examples to MIGRATION_GUIDE.md showing before/after of finding content

### 3.4 Validation

- [X] T025 [US1] Run US1 independent test: Update tagline via search, preview locally (file:// protocol)
- [X] T026 [US1] Verify US1 acceptance scenario 1: Search for "$75" finds exactly one location with clear context
- [X] T027 [US1] Verify US1 acceptance scenario 2: Update FAQ text, save, preview shows change without build commands
- [X] T028 [US1] Verify US1 acceptance scenario 3: Copy FAQ block, modify text, new question appears with accordion functionality
- [X] T029 [US1] Push changes to feature branch, verify deployment to GitHub Pages works
- [X] T030 [US1] Verify forms still submit successfully to Google Sheets after comment markers added

**Completion Criteria**:
- ✅ All content sections have comment markers
- ✅ CONTENT_GUIDE.md complete with search terms for each content type
- ✅ Content editor can find any text within 2 minutes
- ✅ Content editor can add FAQ question in under 5 minutes
- ✅ Forms still work (SC-003)

**Parallel Execution Example for US1**:
```bash
# Can run in parallel (different file sections):
T013 (hero markers) || T014 (pricing markers) || T015 (FAQ markers)

# Can run in parallel (different sections of docs):
T018 (document hero) || T019 (document pricing) || T020 (document FAQ)

# Must run sequentially (validation depends on implementation):
T013-T022 → T025-T030
```

---

## Phase 4: User Story 2 - Developer Refactors Code Structure (P2)

**User Story**: A developer needs to reorganize code (e.g., extract CSS to separate files, componentize sections) to improve maintainability without breaking existing content or form submissions.

**Goal**: Separate concerns (CSS, JS) while maintaining content searchability and form functionality

**Dependencies**: Requires Phase 3 (comment markers must exist so content remains findable after refactor)

**Independent Test**: Developer can extract all CSS from index.html into a separate stylesheet, verify forms still submit successfully, and confirm content editor can still find and update text in the same locations.

### 4.1 Extract CSS

- [X] T031 [P] [US2] Create css/base.css and extract CSS variables, resets, typography from index.html
- [X] T032 [P] [US2] Create css/layout.css and extract grid, sections, responsive styles from index.html
- [X] T033 [P] [US2] Create css/components.css and extract reusable component styles (cards, buttons, accordions) from index.html
- [X] T034 [P] [US2] Create css/animations.css and extract parallax, transitions, motion styles from index.html
- [X] T035 [US2] Add <link> tags to index.html head for all CSS files (base, layout, components, animations)
- [X] T036 [US2] Remove original <style> block from index.html
- [X] T037 [US2] Test visual appearance: Open index.html in browser, verify identical rendering
- [X] T037.1 [US2] Test accessibility after CSS extraction: Verify keyboard navigation still works (Tab key moves focus), screen reader announces sections correctly, touch targets remain 44x44px minimum, color contrast ratios maintained
- [X] T038 [US2] Test responsive behavior: Resize browser window, verify breakpoints work

### 4.2 Extract JavaScript

- [X] T039 [P] [US2] Create js/interactions.js and extract accordion, sticky header, scroll effects from index.html
- [X] T040 [P] [US2] Create js/utils.js and extract helper functions, analytics, tracking from index.html
- [X] T041 [US2] Add <script src="js/interactions.js"></script> to index.html before </body>
- [X] T042 [US2] Add <script src="js/utils.js"></script> to index.html before </body>
- [X] T043 [US2] Remove original <script> blocks from index.html (keep form submission for now - Phase 5)
- [X] T044 [US2] Test interactive behaviors: Click accordions, scroll page, verify sticky header works
- [X] T044.1 [US2] Test accessibility after JS extraction: Verify accordions keyboard accessible (Enter/Space to toggle, Tab to navigate), forms keyboard submittable (Enter to submit), no JavaScript-only interactions without fallback

### 4.3 Update Documentation

- [X] T045 [US2] Update docs/MIGRATION_GUIDE.md with CSS file locations (which styles are where)
- [X] T046 [US2] Update docs/MIGRATION_GUIDE.md with JS file locations (which behaviors are where)
- [X] T047 [US2] Update docs/CONTENT_GUIDE.md to note that content is still in index.html (searchable)

### 4.4 Validation

- [X] T048 [US2] Run US2 independent test: Extract CSS, verify forms submit, verify content findable
- [X] T049 [US2] Verify US2 acceptance scenario 1: CSS in external file, visual elements render identically, JS doesn't break
- [X] T050 [US2] Verify US2 acceptance scenario 2: JS in modules, form submission to GAS works, tracking IDs generate correctly
- [X] T051 [US2] Verify US2 acceptance scenario 3: Content editor updates text via search, finds content in same locations
- [ ] T052 [US2] Test on GitHub Pages deployment (not localhost): Forms must use real GAS endpoint
- [ ] T053 [US2] Verify forms submit to Google Sheets and confirmation emails sent
- [ ] T054 [US2] Run performance test: Lighthouse, verify FCP < 1.5s on 3G (SC-004)
- [ ] T055 [US2] Run accessibility test: Keyboard navigation, screen reader, verify WCAG AA (SC-005)

**Completion Criteria**:
- ✅ CSS extracted to 4 files (base, layout, components, animations)
- ✅ JS extracted to 2 files (interactions, utils)
- ✅ Visual appearance identical (SC-008)
- ✅ Forms still submit successfully (SC-003)
- ✅ Content editor can still find text (SC-001)
- ✅ Performance maintained (SC-004)
- ✅ Accessibility maintained (SC-005)

**Parallel Execution Example for US2**:
```bash
# CSS extraction can run in parallel (different categories):
T031 (base.css) || T032 (layout.css) || T033 (components.css) || T034 (animations.css)

# JS extraction can run in parallel (different categories):
T039 (interactions.js) || T040 (utils.js)

# Validation must run sequentially (each test depends on previous passing):
T037 → T038 → T044 → T048-T055
```

---

## Phase 5: User Story 3 - Developer Adds New Interactive Feature (P3)

**User Story**: A developer needs to add a new interactive component (e.g., countdown timer, image carousel) while maintaining the zero-dependency architecture and content-first principles.

**Goal**: Demonstrate pattern for adding features that don't compromise content editability

**Dependencies**: Requires Phase 4 (JS must be modular to add new features cleanly)

**Independent Test**: Developer can add an event countdown timer that updates daily, verify it works without external libraries, and confirm content editor can update the target date without understanding JavaScript.

### 5.1 Implement localStorage Form Recovery

- [X] T056 [P] [US3] Create js/forms.js implementing FormRecovery object per contracts/localstorage-recovery-api.yaml
- [X] T057 [P] [US3] Implement FormRecovery.save() method with 7-day TTL and error handling
- [X] T058 [P] [US3] Implement FormRecovery.load() method with expiry checking
- [X] T059 [P] [US3] Implement FormRecovery.clear() method
- [X] T060 [P] [US3] Implement FormRecovery.getAge() method for recovery prompt
- [X] T061 [US3] Integrate FormRecovery with form submission in js/forms.js (save on error, clear on success)
- [X] T062 [US3] Implement exponential backoff retry mechanism (3 attempts, 200ms/400ms/800ms delays)
- [X] T063 [US3] Add recovery prompt UI to index.html (shows on page load if data exists)
- [X] T064 [US3] Add "Restore Data" and "Dismiss" buttons to recovery prompt
- [X] T065 [US3] Wire up recovery prompt buttons to FormRecovery.load() and FormRecovery.clear()

### 5.2 Update Form Submission Logic

- [X] T066 [US3] Extract form submission code from index.html to js/forms.js
- [X] T067 [US3] Add <script src="js/forms.js"></script> to index.html
- [X] T068 [US3] Remove original form submission <script> from index.html
- [ ] T069 [US3] Test form submission success path: Submit form → verify clears localStorage
- [ ] T070 [US3] Test form submission failure path: Disconnect internet → verify saves to localStorage

### 5.3 Test localStorage Edge Cases

- [ ] T071 [P] [US3] Test Safari private mode: Verify QuotaExceededError handled gracefully (save() returns false)
- [ ] T072 [P] [US3] Test Chrome incognito: Verify localStorage works but clears on session end (acceptable)
- [ ] T073 [P] [US3] Test data expiry: Mock timestamp 8 days old, verify load() returns null and clears data
- [ ] T074 [P] [US3] Test recovery prompt: Save data → reload page → verify prompt shows with age in minutes
- [ ] T075 [P] [US3] Test restore flow: Click "Restore Data" → verify form fields populate correctly

### 5.4 Demonstrate Content-First Pattern for New Features

- [X] T076 [US3] Add HTML data attribute to hero section: `<div data-event-date="2025-10-04">` for future countdown timer
- [X] T077 [US3] Document in docs/CONTENT_GUIDE.md: "To update countdown date, search for 'data-event-date' and change value"
- [X] T078 [US3] Add comment marker above data attribute: `<!-- DATE CONFIG: Update event date for countdown timer -->`

### 5.5 Validation

- [ ] T079 [US3] Run US3 independent test: Verify localStorage recovery works, content editor can update date via search
- [X] T080 [US3] Verify US3 acceptance scenario 1: Feature works without npm packages or build steps (zero dependencies maintained)
- [X] T081 [US3] Verify US3 acceptance scenario 2: Content editor can update data-event-date via text search
- [X] T082 [US3] Verify US3 acceptance scenario 3: Content editor copy changes don't break feature (clear boundaries)
- [ ] T083 [US3] Test form recovery on GitHub Pages: Simulate GAS downtime, verify data persists (SC-010)
- [X] T084 [US3] Verify no external dependencies added: Check no package.json created (SC-007)

**Completion Criteria**:
- ✅ localStorage form recovery implemented and tested
- ✅ Form data survives backend failures (SC-010)
- ✅ Zero dependencies maintained (SC-007)
- ✅ Content editor can update feature config without JS knowledge (SC-001)
- ✅ Clear boundaries between content and code (FR-008)

**Parallel Execution Example for US3**:
```bash
# FormRecovery methods can be implemented in parallel:
T057 (save) || T058 (load) || T059 (clear) || T060 (getAge)

# Edge case tests can run in parallel (different browsers):
T071 (Safari private) || T072 (Chrome incognito) || T073 (expiry) || T074 (prompt) || T075 (restore)

# Must run sequentially (integration depends on implementation):
T056-T060 → T061-T065 → T066-T070 → T071-T075 → T079-T084
```

---

## Phase 6: Polish & Cross-Cutting Concerns

**Goal**: Final validation, documentation, and deployment readiness

**Dependencies**: Requires Phase 3-5 complete

### 6.1 Final Documentation

- [X] T085 [P] Review docs/CONTENT_GUIDE.md for completeness: All content types documented with search terms
- [X] T086 [P] Review docs/MIGRATION_GUIDE.md for accuracy: All old→new mappings correct
- [X] T087 [P] Add troubleshooting section to CONTENT_GUIDE.md: Common errors and solutions
- [X] T088 [P] Add FAQ to CONTENT_GUIDE.md: "What can I edit?", "How do I preview?", "What if validation fails?"

### 6.2 Final Validation

- [X] T089 Verify SC-001: Content editor can locate and update any text within 2 minutes
- [X] T090 Verify SC-002: Content editor can add FAQ question in under 5 minutes
- [ ] T091 Verify SC-003: Forms submit successfully to Google Sheets after all refactoring
- [ ] T092 Verify SC-004: Page load FCP < 1.5s on 3G (run Lighthouse)
- [ ] T093 Verify SC-005: WCAG AA compliance, keyboard nav, screen reader compatibility
- [ ] T093.1 Verify keyboard navigation specifics: Tab through all form fields and interactive elements in logical order, Enter key submits forms, Space/Enter toggles accordions, Esc closes expanded accordions (if implemented), focus indicators visible (blue outline or custom), no keyboard traps, can reach all content without mouse
- [X] T094 Verify SC-006: Documentation exists for all content types with migration guide
- [X] T095 Verify SC-007: Zero external dependencies via comprehensive check: (1) confirm no package.json/package-lock.json/requirements.txt exists, (2) grep all HTML/CSS/JS files for CDN imports (allow ONLY fonts.googleapis.com/fonts.gstatic.com), (3) grep for framework keywords (React, Vue, jQuery, Angular, lodash, axios), (4) verify no build step in .github/workflows or deployment process
- [ ] T096 Verify SC-008: All features function identically per FEATURE_INVENTORY.md checklist (visual regression, animations, responsive breakpoints, accordions, sticky header, parallax, forms, tracking IDs, validation)
- [X] T097 Verify SC-009: Git hook catches 100% of malformed HTML - final comprehensive validation across multiple error types: unclosed tags (<div> without </div>), invalid nesting (<p><div></div></p>), missing required attributes (<img> without alt), broken entities (&nbsp without semicolon), duplicate IDs - beyond initial T010/T011 smoke tests
- [ ] T098 Verify SC-010: Form data survives backend failures (test localStorage recovery)

### 6.3 Deployment Preparation

- [ ] T099 Test complete workflow on feature branch: Content update → git commit → hook validates → push → GitHub Pages deploy
- [ ] T100 Verify deployment to GitHub Pages works (aboutlastnightgame.com updates within 1-2 minutes)
- [ ] T101 Test forms on live GitHub Pages deployment (not localhost - must hit real GAS endpoints)
- [X] T102 Create deployment checklist in docs/DEPLOYMENT.md: Pre-deploy, deploy, post-deploy validation steps
- [X] T103 Document rollback procedure in docs/DEPLOYMENT.md: How to revert to pre-refactor backup branch

### 6.4 Handoff to Content Team

- [X] T104 [P] Create content editor onboarding guide in docs/QUICKSTART_CONTENT_EDITORS.md
- [ ] T105 [P] Record video walkthrough: How to find and update each content type (optional but recommended)
- [ ] T106 [P] Schedule knowledge transfer session with content team
- [ ] T107 [P] Collect feedback from content team after first update cycle

**Completion Criteria**:
- ✅ All 10 success criteria (SC-001 through SC-010) verified
- ✅ Complete documentation for content editors and developers
- ✅ Deployment tested and validated
- ✅ Content team trained and ready to use new workflow

---

## Task Summary

| Phase | Task Count | Parallel Opportunities | Completion Criteria |
|-------|-----------|----------------------|---------------------|
| Phase 1: Setup | 6 | 6 tasks (all parallel) | Tools installed, directories created |
| Phase 2: Foundational | 6 | 0 (sequential git hook setup) | HTML validation blocks bad commits |
| Phase 3: US1 (P1) | 18 | 12 tasks (markers + docs) | Content searchable, editable, safe |
| Phase 4: US2 (P2) | 25 | 6 tasks (CSS + JS extraction) | Code separated, forms work, perf maintained |
| Phase 5: US3 (P3) | 29 | 10 tasks (recovery methods + tests) | localStorage recovery works, zero-dep |
| Phase 6: Polish | 23 | 7 tasks (docs + handoff) | All SCs verified, team trained |
| **TOTAL** | **107** | **41** (38% parallelizable) | Production ready |

---

## Dependencies & Execution Order

```
┌─────────────┐
│   Phase 1   │ Setup (all parallel)
│   (T001-006)│
└──────┬──────┘
       ↓
┌─────────────┐
│   Phase 2   │ Foundational (sequential git hook)
│   (T007-012)│
└──────┬──────┘
       ↓
┌─────────────┐
│   Phase 3   │ US1: Content Editor Updates (P1) ← MVP DEPLOYMENT POINT
│   (T013-030)│ Independent Test: Update tagline in 2 mins
└──────┬──────┘
       ↓
┌─────────────┐
│   Phase 4   │ US2: Developer Refactors (P2)
│   (T031-055)│ Independent Test: Extract CSS, forms still work
└──────┬──────┘
       ↓
┌─────────────┐
│   Phase 5   │ US3: New Interactive Feature (P3)
│   (T056-084)│ Independent Test: localStorage recovery works
└──────┬──────┘
       ↓
┌─────────────┐
│   Phase 6   │ Polish & Deployment
│   (T085-107)│ Verify all 10 success criteria
└─────────────┘
```

**MVP Scope** = Phase 1 + Phase 2 + Phase 3 (Tasks T001-T030)
- Delivers immediate value to content team
- Can be deployed and validated independently
- Remaining phases enhance developer experience and add resilience

---

## Parallel Execution Opportunities

### High Parallelism Phases

**Phase 1 (Setup)**: 100% parallel - all 6 tasks independent
```bash
T001 (install tidy) || T002 (verify tidy) || T003 (backup) || T004 (document) || T005 (audit) || T006 (mkdir)
```

**Phase 3 (US1 - Comment Markers)**: 5 sections can be marked in parallel
```bash
T013 (hero) || T014 (pricing) || T015 (FAQ) || T016 (creators) || T017 (footer)
T018 (doc hero) || T019 (doc pricing) || T020 (doc FAQ) || T021 (doc creators) || T022 (doc footer)
```

**Phase 4 (US2 - CSS Extraction)**: 4 CSS files can be created in parallel
```bash
T031 (base.css) || T032 (layout.css) || T033 (components.css) || T034 (animations.css)
T039 (interactions.js) || T040 (utils.js)
```

**Phase 5 (US3 - localStorage)**: Methods and tests can run in parallel
```bash
T057 (save) || T058 (load) || T059 (clear) || T060 (getAge)
T071 (Safari test) || T072 (Chrome test) || T073 (expiry test) || T074 (prompt test)
```

### Sequential Bottlenecks

- **Phase 2**: Git hook must be created → configured → tested sequentially
- **Validation tasks**: Must run after implementation complete (end of each phase)
- **Integration tasks**: Must run after component tasks complete (T061 after T056-060)

---

## Testing Strategy

### Manual Testing (per zero-dependency constraint)

**No automated test suite** - Small codebase + zero-dependency constraint makes manual testing sufficient

**Test Checklist** (per Phase):
- US1: Content editor workflow test (2-minute update test)
- US2: Visual regression + form submission + performance
- US3: localStorage recovery + edge cases (private mode, expiry)
- Polish: All 10 success criteria verification

### Test Environments

1. **Local**: file:// protocol for content preview (US1, US2)
2. **GitHub Pages**: Real GAS endpoints for form testing (US2, US3, Polish)
3. **Multiple Browsers**: Chrome, Firefox, Safari (especially Safari private mode for US3)

---

## Risk Mitigation

| Risk | Mitigation | Task |
|------|-----------|------|
| Forms break during refactor | Test after every CSS/JS extraction | T037, T044, T048, T052, T091 |
| Content becomes unsearchable | Keep content in HTML, not JS/JSON | T013-017, T051 |
| HTML validation blocks legitimate commits | Test with valid HTML first | T011 |
| localStorage unavailable (private mode) | Graceful degradation (try-catch) | T057, T071 |
| Performance degrades after refactor | Run Lighthouse after US2 | T054, T092 |
| Content editor breaks new feature | Clear comment boundaries + docs | T076-078, T082 |

---

## Success Metrics (from spec.md)

| ID | Metric | Target | Verification Task |
|----|--------|--------|-------------------|
| SC-001 | Content update time | < 2 minutes | T089 |
| SC-002 | Add FAQ time | < 5 minutes | T090 |
| SC-003 | Form functionality | 100% working | T091 |
| SC-004 | Page load FCP | < 1.5s on 3G | T092 |
| SC-005 | Accessibility | WCAG AA pass | T093 |
| SC-006 | Documentation | Complete + migration guide | T094 |
| SC-007 | Dependencies | Zero (no package.json) | T095 |
| SC-008 | Feature parity | All features identical | T096 |
| SC-009 | HTML validation | 100% catch rate | T097 |
| SC-010 | Form recovery | Data survives failures | T098 |

---

## Notes

- **No tests requested**: Feature spec assumes manual testing (no TDD approach specified)
- **Zero dependencies** maintained throughout all phases
- **Content-first** principle guides every decision (searchability > abstraction)
- **Forms are sacred**: Test after every structural change (T030, T048, T052, T091, T101)
- **MVP = Phase 1-3**: Can deploy after T030 for content team validation

---

**Last Updated**: 2025-01-19
**Next Step**: Begin Phase 1 (Setup) - Install tidy and create directory structure
**Estimated Total Effort**: 4-6 days for MVP (Phase 1-3) assuming 2-person team with parallelization, 12-16 days for complete implementation (107+ tasks with testing/validation overhead). Single developer timeline: 6-9 days MVP, 18-24 days complete. Estimate assumes ~8-10 productive tasks/day accounting for context switching and thorough testing.
