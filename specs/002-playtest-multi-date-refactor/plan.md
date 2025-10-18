# Implementation Plan: Playtest Multi-Date Refactor

**Branch**: `002-playtest-multi-date-refactor` | **Date**: 2025-10-18 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/002-playtest-multi-date-refactor/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Refactor `playtest.html` to support multiple playtest date selections while applying the same content-first architecture principles used in the recent `index.html` refactor. Users can select from three playtest dates (September 21 at 4:00 PM, October 26 at 3:00 PM, November 4 at 6:30 PM) via radio buttons, with independent capacity tracking per date. Content editors can update playtest information using comment markers and search-based workflows. Backend Google Sheets schema extended to store date selection with each signup.

## Technical Context

**Language/Version**: HTML5, CSS3, ES6+ JavaScript (Vanilla - no transpilation)
**Primary Dependencies**: None (zero-dependency architecture - only Google Fonts CDN permitted)
**Storage**: Google Sheets via Google Apps Script REST API
**Testing**: Manual testing on GitHub Pages deployment, HTML validation via tidy pre-commit hook
**Target Platform**: Modern web browsers (Chrome, Firefox, Safari, Edge - no legacy support required)
**Project Type**: Single-page web application (static HTML/CSS/JS)
**Performance Goals**: FCP < 1.5s, LCP < 2.5s, TTI < 3s on 3G, CLS < 0.1
**Constraints**: Zero build process, content must remain in HTML (not JSON/JS), form endpoint URLs are production infrastructure
**Scale/Scope**: 3 playtest dates with 20 spots each (60 total spots), expected ~100 signups including waitlist

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### Core Principle Compliance

**I. Zero Dependencies** ✅ PASS
- Implementation uses only HTML5, CSS3, Vanilla JavaScript
- No npm packages, no build tools, no frameworks
- Maintains Google Fonts CDN as sole external resource
- Comment: Fully compliant

**II. Content-First Architecture** ✅ PASS
- Refactor explicitly applies proven comment marker pattern from `index.html` refactor
- Playtest date information (date/time/location) remains in HTML with distinctive markers
- Success criterion SC-001 requires < 2 minute content updates via Ctrl+F search
- FR-007 mandates box-drawing comment markers matching `index.html` pattern
- Comment: This refactor's **primary purpose** is content-first architecture

**III. Form Reliability (NON-NEGOTIABLE)** ✅ PASS with PREREQUISITE
- Backend schema update is documented as deployment prerequisite (Assumption in spec)
- Form endpoint URL remains unchanged (extending existing backend, not replacing)
- Client-side validation prevents submission without date selection (FR-004)
- Existing retry/recovery infrastructure maintained (FR-008)
- **PREREQUISITE**: Google Sheets "Selected Date" column MUST exist before frontend deployment
- Comment: Pass conditional on backend-first deployment sequence

**IV. Progressive Enhancement** ✅ PASS
- Core content (event details, dates) visible without JavaScript
- JavaScript enhances with spot counter and date selection validation
- Form degrades to basic HTML5 validation if JS disabled
- Radio buttons functional without JavaScript
- Comment: Fully compliant

**V. Accessibility Compliance** ✅ PASS
- Radio buttons meet WCAG AA requirements (native HTML inputs)
- Labels properly associated with form controls
- Keyboard navigation supported by native HTML elements
- Error messages will use ARIA attributes for validation feedback
- Comment: Compliant with standard HTML form accessibility

**VI. Pre-Production Flexibility** ✅ PASS
- Breaking changes acceptable during refactor
- October 4 launch allows for bold refactoring now
- No backwards compatibility concerns
- Comment: Full flexibility maintained

### Performance Standards Compliance

**Load Time Requirements** ✅ PASS
- No additional assets added (radio buttons are CSS-styled HTML)
- Inline CSS maintains single-file architecture
- No new external resources
- SC-007 mandates maintaining existing performance metrics
- Comment: Performance budget maintained

### Gate Decision

**STATUS**: ✅ **PASS** - Proceed to Phase 0 Research

**Conditions**:
1. Backend schema update MUST precede frontend deployment
2. Performance metrics MUST be validated post-implementation
3. Comment markers MUST follow exact pattern from `index.html` refactor

**No violations requiring Complexity Tracking justification.**

## Project Structure

### Documentation (this feature)

```
specs/002-playtest-multi-date-refactor/
├── spec.md              # Feature specification (already exists)
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   └── playtest-api-contract.yaml
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

**Following index.html Refactor Pattern** - Content in HTML, behavior/styling extracted:

```
aboutlastnightgame/
├── playtest.html                    # REFACTOR: Extract CSS/JS, add comment markers, keep content
├── PLAYTEST_GOOGLE_SCRIPT.js        # EXTEND: Add date field handling
│
├── css/                             # EXTRACT CSS FROM playtest.html
│   ├── base.css                     # (shared - already exists)
│   ├── layout.css                   # (shared - already exists)
│   ├── components.css               # (shared - already exists)
│   ├── animations.css               # (shared - already exists)
│   └── playtest.css                 # NEW: Playtest-specific styles
│
├── js/                              # EXTRACT JS FROM playtest.html
│   ├── utils.js                     # (shared - already exists)
│   ├── forms.js                     # EXTEND: Add playtest multi-date logic
│   └── playtest-interactions.js     # NEW: Playtest-specific behavior (spot counter, date switching)
│
├── docs/
│   ├── CONTENT_GUIDE.md            # UPDATE: Add playtest.html sections
│   └── QUICKSTART_CONTENT_EDITORS.md # UPDATE: Add playtest examples
│
└── .git/hooks/
    └── pre-commit                   # HTML validation (already configured)
```

**Structure Decision**:

Following the **proven index.html refactor pattern**:

1. **HTML** (`playtest.html`) = Content + Structure only
   - Add distinctive comment markers (box-drawing pattern)
   - Keep all editable content (dates, descriptions, location)
   - Remove inline `<style>` and `<script>` tags
   - Reference external CSS/JS files

2. **CSS** (modular files in `css/`)
   - Reuse existing shared styles (`base.css`, `layout.css`, `components.css`, `animations.css`)
   - Create `playtest.css` for playtest-specific styles (noir theme, spot counter, form styling)

3. **JavaScript** (modular files in `js/`)
   - Reuse `utils.js` for device detection, UTM tracking
   - Extend `forms.js` for multi-date submission logic
   - Create `playtest-interactions.js` for spot counter and date selection behavior

**Rationale**: This pattern (established in index.html refactor) separates content from code, making it safe for non-technical editors to update event details without touching CSS/JS.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

**N/A** - No constitutional violations. All gates passed.

---

## Phase 1 Re-Evaluation

**Date**: 2025-10-18 | **Status**: Phase 1 Design Complete

### Design Artifacts Generated

✅ **research.md** - Technical research complete (7 research areas)
✅ **data-model.md** - Entities, relationships, validation rules defined
✅ **contracts/playtest-api-contract.yaml** - OpenAPI 3.0 contract for Google Apps Script API
✅ **quickstart.md** - Developer implementation guide with step-by-step instructions

### Constitution Re-Check

**All principles REAFFIRMED** after Phase 1 design:

**I. Zero Dependencies** ✅
- Design confirms no new dependencies introduced
- CSS extraction reuses existing shared files (base.css, components.css, etc.)
- JavaScript extends existing modules (forms.js, utils.js)
- No build tools, frameworks, or npm packages in design

**II. Content-First Architecture** ✅
- Comment marker pattern documented in research.md (R1)
- HTML structure keeps all editable content with distinctive `═══` borders
- Radio button labels are plain text in HTML (not JavaScript variables)
- quickstart.md demonstrates content editor workflow

**III. Form Reliability** ✅
- API contract defines robust request/response schema
- Retry logic reuses proven RetryManager from forms.js
- Backend deployment sequence enforced in quickstart (backend FIRST, then frontend)
- Data model ensures backward compatibility (existing Sept 21 signups preserved)

**IV. Progressive Enhancement** ✅
- Radio buttons use native HTML `<fieldset>` and `<legend>` (research.md R2)
- HTML5 `required` attribute works without JavaScript
- Spot counter gracefully degrades if capacity fetch fails
- Form submission uses HTML5 validation as fallback

**V. Accessibility Compliance** ✅
- WCAG AA compliance verified in research.md (R2)
- Fieldset/legend pattern provides screen reader context
- Touch targets meet 44x44px requirement (documented in playtest.css)
- ARIA attributes planned for validation errors

**VI. Pre-Production Flexibility** ✅
- Design allows breaking changes (schema migration, CSS extraction)
- No legacy browser support constraints
- Optimized for best solution, not backwards compatibility

### Performance Impact Assessment

**Estimated Performance Delta**:
- **CSS**: +2KB (playtest.css), reuse 28KB existing shared CSS → Net: +2KB
- **JavaScript**: +5KB (playtest-interactions.js), extend existing forms.js → Net: +5KB
- **HTML**: -3KB (remove inline styles/scripts), +1KB (radio buttons) → Net: -2KB
- **Network Requests**: Same (4 CSS files, 3 JS files - no change from index.html pattern)

**Performance Budget**: ✅ WITHIN LIMITS
- Total page weight estimate: 38KB (down from 43KB inline version)
- FCP, LCP, CLS targets achievable (no render-blocking changes)
- Passive scroll listeners already established in interactions.js

### Risk Assessment

**LOW RISK** - Design phase identified and mitigated all major risks:

1. ✅ **Backend Schema Risk** - Mitigated via deployment prerequisite in quickstart.md
2. ✅ **Form Endpoint Risk** - URL remains unchanged, extends existing endpoint
3. ✅ **Data Migration Risk** - Backfill strategy defined in data-model.md
4. ✅ **Performance Risk** - Net reduction in page weight, no new blocking resources
5. ✅ **Accessibility Risk** - Native HTML patterns minimize ARIA complexity
6. ✅ **Content Editor Risk** - Pattern proven in index.html refactor

### Gate Decision: Phase 1 → Phase 2

**STATUS**: ✅ **APPROVED** - Proceed to Phase 2 (Task Generation)

**Readiness Criteria**:
- [x] All design artifacts complete
- [x] Constitution compliance reaffirmed
- [x] Performance budget validated
- [x] Risks identified and mitigated
- [x] Implementation path clear (quickstart.md)
- [x] API contract defined (contracts/)
- [x] Data model documented

**Next Command**: `/speckit.tasks` to generate dependency-ordered implementation tasks

---

## Architecture Enhancement Note (Added During Implementation)

**Date**: 2025-10-18 | **Phase**: Implementation (Phase 2)

### Content-First Architecture: Backend Date-Agnostic Design

During implementation of Phase 2 (Backend), a critical architecture improvement was identified and implemented:

**Original Design** (from quickstart.md):
- Playtest dates hardcoded in 3 locations in Google Apps Script
- Adding/modifying dates required backend code changes AND redeployment
- Violated content-first principle (developers needed for content updates)

**Enhanced Design** (implemented):
- **Backend is date-agnostic** - no hardcoded date lists
- **Frontend (playtest.html) is source of truth** - radio buttons define available dates
- Backend validates date field is non-empty, then stores whatever value is sent
- Backend dynamically discovers dates from database (column H) for capacity API
- Date formatting for emails uses ISO date parsing (works with any valid date)

**Benefits**:
✓ Content editors can add/remove dates by editing HTML only
✓ Zero backend redeployment needed when dates change
✓ Eliminates risk of frontend/backend date mismatch
✓ Simpler backend code (no hardcoded arrays)
✓ Scales naturally (works with 3 dates or 30 dates)

**Implementation Files**:
- `PLAYTEST_GOOGLE_SCRIPT.js` - Refactored to be data-driven
- Documentation: [research.md R7](research.md#r7-backend-date-configuration-strategy)
- Data model: [data-model.md Query Patterns](data-model.md#backend-schema-google-sheets)

**Edge Case Handling**:
- Empty sheet (no signups yet): `getAllCapacities()` returns empty array
- Frontend handles gracefully with fallback to static display
- First signup for new date seeds it into database
- Date parse errors fall back to displaying raw ISO string

This enhancement **strengthens Constitution II compliance** (Content-First Architecture) and reduces long-term maintenance burden.

---

*End of Planning Phase - Ready for Task Generation*

