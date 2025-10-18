# Implementation Plan: Content-First Codebase Refactor

**Branch**: `001-content-first-refactor` | **Date**: 2025-01-19 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-content-first-refactor/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Refactor the About Last Night landing page codebase to optimize for content-first updates while maintaining zero dependencies, form reliability, and performance standards. The current monolithic HTML structure makes it difficult for non-technical content editors to update event details, pricing, and marketing copy. This refactor will separate concerns (content, styling, behavior) into discoverable files, implement validation to catch errors before deployment, add form failure resilience with localStorage recovery, and provide clear documentation with migration guides mapping old-to-new content locations.

## Technical Context

**Language/Version**: HTML5, CSS3, ES6+ JavaScript (modern browsers, last 2 versions)
**Primary Dependencies**: None (zero-dependency architecture) - Google Fonts via CDN only
**Storage**: Google Sheets (via Google Apps Script endpoints for form submissions)
**Testing**: Manual testing + NEEDS CLARIFICATION (HTML validation tooling for git hooks)
**Target Platform**: Static website hosted on GitHub Pages (aboutlastnightgame.com)
**Project Type**: Static web landing page (single-page application without frameworks)
**Performance Goals**: First Contentful Paint < 1.5s on 3G, Time to Interactive < 3s, LCP < 2.5s
**Constraints**: Zero build step (git push deploys directly), no npm/package managers, WCAG AA compliance
**Scale/Scope**: Single marketing landing page, 2 forms (interest signup + playtest), ~1000 lines current codebase

**Key Clarifications Needed**:
- HTML validation tooling: What lightweight validator can run in git hooks without npm dependencies? (NEEDS CLARIFICATION)
- File organization pattern: Separate files vs. template includes vs. web components? (NEEDS CLARIFICATION)
- localStorage implementation: Best practices for form data recovery patterns? (NEEDS CLARIFICATION)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Zero Dependencies ✅ PASS
- **Requirement**: No external frameworks, libraries, build tools, or package managers
- **This Feature**: Maintains zero-dependency architecture (HTML/CSS/JS only)
- **Risk**: HTML validation tooling may require external tool, but can use standalone binaries or Python standard library
- **Status**: COMPLIANT

### II. Content-First Architecture ✅ PASS
- **Requirement**: Code organization optimizes for non-technical content updates
- **This Feature**: Primary goal is making content updates easier via file separation and documentation
- **Risk**: Over-abstraction could make content harder to find
- **Mitigation**: Documentation must map content locations, searchability remains priority
- **Status**: COMPLIANT (aligned with core principle)

### III. Form Reliability (NON-NEGOTIABLE) ✅ PASS
- **Requirement**: Form submission endpoints must remain functional
- **This Feature**: Explicitly preserves form functionality (FR-003) and adds resilience (FR-014)
- **Testing Plan**: Test submissions to Google Sheets after each refactor step
- **Status**: COMPLIANT

### IV. Progressive Enhancement ✅ PASS
- **Requirement**: Core content and CTA must function without JavaScript
- **This Feature**: Refactoring maintains HTML structure, preserves no-JS functionality
- **Status**: COMPLIANT (FR-010 preserves accessibility)

### V. Accessibility Compliance ✅ PASS
- **Requirement**: Maintain WCAG AA compliance
- **This Feature**: FR-010 explicitly requires preserving accessibility features
- **Testing**: Manual keyboard navigation and screen reader testing post-refactor
- **Status**: COMPLIANT

### VI. Pre-Production Flexibility ✅ PASS
- **Requirement**: Breaking changes acceptable, optimize for best solution
- **This Feature**: Refactoring is breaking change to file structure, justified by maintainability
- **Migration**: Documentation includes old-to-new location mappings (FR-012)
- **Status**: COMPLIANT

**GATE RESULT**: ✅ ALL CHECKS PASS - Proceed to Phase 0 Research

---

## Constitution Check: Post-Design Re-evaluation

*Re-evaluated after Phase 1 design (research, data model, contracts)*

### I. Zero Dependencies ✅ STILL COMPLIANT
- **Design Decision**: HTML Tidy (system package), no npm/build tools
- **Validation**: All tools are system-level binaries or vanilla JavaScript
- **Risk**: None identified during design phase
- **Status**: COMPLIANT

### II. Content-First Architecture ✅ STILL COMPLIANT
- **Design Decision**: Comment-marked HTML sections, not separate templates/JSON
- **Validation**: Content remains searchable via Ctrl+F, WYSIWYG editing preserved
- **Enhancement**: Clear comment markers guide content editors to safe zones
- **Status**: COMPLIANT (design reinforces principle)

### III. Form Reliability ✅ STILL COMPLIANT
- **Design Decision**: Preserve exact form field names, add resilience via localStorage
- **Validation**: Contract documents existing API, deployment sequence defined
- **Enhancement**: localStorage recovery improves reliability (doesn't break existing)
- **Status**: COMPLIANT

### IV. Progressive Enhancement ✅ STILL COMPLIANT
- **Design Decision**: localStorage recovery is optional enhancement
- **Validation**: Core content remains in HTML, forms work without JavaScript
- **Status**: COMPLIANT

### V. Accessibility Compliance ✅ STILL COMPLIANT
- **Design Decision**: Structural refactor preserves ARIA attributes and keyboard nav
- **Validation**: Data model explicitly tracks accessibility requirements
- **Testing**: Manual accessibility testing required post-refactor
- **Status**: COMPLIANT

### VI. Pre-Production Flexibility ✅ STILL COMPLIANT
- **Design Decision**: File structure changes are breaking, justified by maintainability
- **Mitigation**: Migration guide maps old → new locations
- **Status**: COMPLIANT

**POST-DESIGN GATE RESULT**: ✅ ALL CHECKS STILL PASS - Design phase complete, ready for task generation

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
# Current structure (before refactor)
index.html                    # Monolithic landing page (~1000 lines)
playtest.html                 # Playtest signup page
FORM_HANDLER_GOOGLE_SCRIPT.js # Main form backend (not in repo, in GAS)
PLAYTEST_GOOGLE_SCRIPT.js     # Playtest backend (not in repo, in GAS)

# Proposed structure (after refactor - NEEDS RESEARCH)
index.html                    # Main shell, links to assets
css/
├── base.css                  # Variables, resets, typography
├── layout.css                # Grid, sections, responsive
├── components.css            # Reusable patterns (cards, accordions)
└── animations.css            # Parallax, transitions, motion

js/
├── forms.js                  # Form submission + localStorage recovery
├── interactions.js           # Accordions, sticky header, scroll effects
└── utils.js                  # Helpers, analytics, tracking

# Content remains in index.html with comment markers for searchability
# Only CSS and JavaScript are extracted to separate files

docs/
├── CONTENT_GUIDE.md          # Where to find/update each content type
└── MIGRATION_GUIDE.md        # Old locations → new locations mapping

.githooks/                    # NEEDS RESEARCH: Validation tooling
└── pre-commit                # HTML validation, link checking
```

**Structure Decision**: Content will remain in index.html with distinctive comment markers to maintain searchability via Ctrl+F. Only CSS and JavaScript will be extracted to separate files. This decision prioritizes Content-First Architecture (Constitution Principle II) over maximum code organization.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

No violations detected. All constitutional principles are satisfied by this feature.

