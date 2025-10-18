<!--
Sync Impact Report:
- Version: NEW → 1.0.0
- Type: MINOR (initial constitution creation)
- Modified principles: N/A (new document)
- Added sections: All sections (initial creation)
- Removed sections: None

Template Status:
✅ plan-template.md - Constitution Check section ready for validation
✅ spec-template.md - Requirements alignment verified
✅ tasks-template.md - Task categorization aligned with principles
⚠️  No command templates found - skipped validation

Follow-up TODOs: None
-->

# About Last Night Landing Page Constitution

## Core Principles

### I. Zero Dependencies

**Rule**: The site MUST NOT use external frameworks, libraries, build tools, or package managers.

**Rationale**: This is a marketing landing page requiring frequent content updates by non-technical team members. External dependencies add:
- Deployment complexity
- Breaking changes requiring technical intervention
- Update cycles that block content changes
- Security vulnerabilities requiring patching

**Enforcement**:
- No `package.json`, `requirements.txt`, or equivalent dependency manifests
- No framework imports (React, Vue, jQuery, etc.)
- Vanilla HTML5, CSS3, and ES6+ JavaScript only
- Google Fonts via CDN is the sole acceptable external resource

### II. Content-First Architecture

**Rule**: Code organization MUST optimize for non-technical content updates above all other concerns.

**Rationale**: The primary workflow is updating event details, pricing, dates, and marketing copy. Technical team members are not always available, so content editors must be able to:
- Find text by searching the file
- Make changes without understanding code structure
- Preview changes without running build processes

**Enforcement**:
- Text content MUST be in plain HTML, not JavaScript variables or data files
- File structure changes MUST be justified by making content updates easier
- Refactoring proposals MUST demonstrate improved content update workflow

### III. Form Reliability (NON-NEGOTIABLE)

**Rule**: Form submission endpoints MUST remain functional. Breaking forms breaks the business.

**Rationale**: Forms are the primary conversion mechanism. Lost submissions = lost revenue. The forms:
- Collect email signups for ticket launch notifications
- Manage playtest signups with limited capacity
- Generate confirmation emails and tracking

**Enforcement**:
- Google Apps Script endpoint URLs are production infrastructure
- Changes to form fields MUST be synchronized with backend scripts
- Form submission MUST be tested on GitHub Pages before merging
- Backend script changes MUST be deployed before frontend changes

### IV. Progressive Enhancement

**Rule**: Core content and call-to-action MUST function without JavaScript.

**Rationale**: Users with JavaScript disabled, screen readers, and search engines must access content. The site serves marketing/SEO purposes.

**Enforcement**:
- Primary content visible without JavaScript execution
- Forms degrade gracefully (HTML5 validation still works)
- Navigation functional via standard HTML anchors
- JavaScript enhances but never gates core functionality

### V. Accessibility Compliance

**Rule**: Site MUST maintain WCAG AA compliance for all interactive elements.

**Rationale**: Legal requirement and brand values. The experience being promoted is inclusive; the marketing must be too.

**Enforcement**:
- Keyboard navigation for all interactive elements
- ARIA attributes for dynamic content
- Minimum 44x44px touch targets
- Color contrast ratios meet WCAG AA standards
- `prefers-reduced-motion` respected for animations

### VI. Pre-Production Flexibility

**Rule**: Breaking changes are ACCEPTABLE. Optimize for best solution, not backwards compatibility.

**Rationale**: Site is in active development before October 4 launch. Technical debt should be eliminated now while it's cheap.

**Enforcement**:
- Refactor boldly when architecture improves content workflow
- Throw errors early rather than silent fallbacks
- No legacy browser support unless analytics show usage
- Performance over backwards compatibility

## Performance Standards

### Load Time Requirements

- **First Contentful Paint**: < 1.5 seconds on 3G
- **Time to Interactive**: < 3 seconds on 3G
- **Largest Contentful Paint**: < 2.5 seconds

**Justification**: Mobile-first marketing site. Users on slow connections are target audience (traveling to event).

### Implementation Rules

- Images MUST use appropriate formats (WebP with JPEG fallback)
- CSS animations MUST use GPU-accelerated properties only (`transform`, `opacity`)
- Scroll listeners MUST use passive event listeners with debouncing (16ms)
- No render-blocking resources in critical rendering path

## Deployment & Quality Gates

### Deployment Process

1. **Local changes** committed to feature branch
2. **Push to GitHub** triggers auto-deployment via GitHub Pages
3. **Live in 1-2 minutes** on aboutlastnightgame.com

### Pre-Merge Checklist

- [ ] Forms tested on GitHub Pages deployment (not localhost)
- [ ] Content changes validated by non-technical reviewer
- [ ] Mobile responsiveness verified (320px minimum width)
- [ ] Accessibility tested (keyboard navigation, screen reader)
- [ ] Performance budget maintained (Lighthouse score > 90)

### Form Backend Synchronization

**Critical Sequence**:
1. Edit `.js` files locally (version control)
2. Deploy to Google Apps Script (Deploy → New Version)
3. Update HTML form endpoint URLs if needed
4. Test on GitHub Pages before announcing

## Governance

### Amendment Procedure

1. Propose change with rationale (why current principle fails)
2. Document impact on existing code and templates
3. Update dependent templates (plan, spec, tasks)
4. Increment version per semantic versioning rules
5. Commit with message: `docs: amend constitution to vX.Y.Z (summary)`

### Versioning Policy

- **MAJOR**: Remove or redefine a core principle (e.g., allow dependencies)
- **MINOR**: Add new principle or expand existing guidance
- **PATCH**: Clarify wording, fix typos, refine non-semantic details

### Compliance Review

- All feature work MUST reference constitution compliance in plan.md
- Violations MUST be justified in "Complexity Tracking" section
- Constitution supersedes all other practices and prior decisions

**Version**: 1.0.0 | **Ratified**: 2025-01-19 | **Last Amended**: 2025-01-19
