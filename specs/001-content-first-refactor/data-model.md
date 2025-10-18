# Data Model: Content-First Codebase Refactor

**Feature**: Content-First Codebase Refactor
**Branch**: `001-content-first-refactor`
**Date**: 2025-01-19

## Overview

This refactoring project primarily reorganizes existing code rather than introducing new data entities. The data model captures the key entities that exist implicitly in the current codebase and will be made explicit through the refactoring.

---

## Entities

### 1. Content Block

**Definition**: Any editable text content displayed to users.

**Attributes**:
- `type` (string): Type of content (hero, pricing, faq, creator-bio, event-details)
- `location` (string): File path and line number (e.g., "index.html:542")
- `text` (string): The actual content text
- `lastModified` (timestamp): When content was last updated (from git history)
- `editFrequency` (enum): how-often, weekly, seasonal, rarely

**Relationships**:
- Contained within Structural Component (optional)
- Referenced in Content Guide documentation

**Validation Rules**:
- Text must not be empty
- HTML tags must be properly closed (validated by tidy)
- No executable JavaScript in content blocks

**Example Instances**:
```yaml
- type: hero-tagline
  location: index.html:120
  text: "Some memories are worth killing for"
  editFrequency: seasonal

- type: pricing
  location: index.html:542
  text: "$75 per person"
  editFrequency: seasonal

- type: event-dates
  location: index.html:380
  text: "October 4 - November 9, 2025"
  editFrequency: weekly
```

---

### 2. Structural Component

**Definition**: Repeated UI patterns with consistent structure but editable content.

**Attributes**:
- `componentType` (enum): faq-item, accordion-section, creator-profile, evidence-card
- `templateStructure` (string): HTML structure with placeholder comments
- `instances` (array): List of actual instances of this component
- `contentBlocks` (array): Content Blocks contained within this component

**Relationships**:
- Contains multiple Content Blocks
- Has CSS class dependencies
- Has JavaScript behavior dependencies

**Validation Rules**:
- All instances must follow same structure (same tags, same classes)
- Content Blocks within instances can vary
- Must maintain accessibility attributes (ARIA, keyboard nav)

**Example Instances**:
```yaml
faq-item:
  templateStructure: |
    <div class="faq-accordion">
      <button class="faq-question" aria-expanded="false">
        <!-- CONTENT: Question text -->
      </button>
      <div class="faq-answer" hidden>
        <!-- CONTENT: Answer text -->
      </div>
    </div>
  instances: 12
  contentBlocks: [question, answer]
  cssClasses: [faq-accordion, faq-question, faq-answer]
  jsEvents: [click on button, toggle aria-expanded, toggle hidden]

creator-profile:
  templateStructure: |
    <div class="creator-card">
      <h3><!-- CONTENT: Creator name --></h3>
      <p class="role"><!-- CONTENT: Role --></p>
      <p class="bio"><!-- CONTENT: Bio text --></p>
    </div>
  instances: 2
  contentBlocks: [name, role, bio]
```

---

### 3. Form Configuration

**Definition**: Form field definitions and backend integration parameters.

**Attributes**:
- `formId` (string): Unique identifier (main-interest-form, playtest-signup-form)
- `endpoint` (URL): Google Apps Script Web App URL
- `fields` (array): Form field definitions
- `validation` (object): Client-side validation rules
- `recovery` (object): localStorage recovery configuration

**Field Schema**:
```yaml
fields:
  - name: email
    type: email
    required: true
    placeholder: "your@email.com"
    validation: HTML5 email pattern
    maxLength: 254

  - name: fullName
    type: text
    required: true
    placeholder: "Your Name"
    maxLength: 100

  - name: photoConsent
    type: checkbox
    required: false
    label: "I consent to event photography"
    default: false
```

**Recovery Configuration**:
```yaml
recovery:
  storageKey: aln_form_recovery
  ttl: 604800000  # 7 days in milliseconds
  saveOnError: true
  autoSave: false  # Future enhancement
  autoSaveInterval: 3000  # ms, if autoSave enabled
```

**Validation Rules**:
- Endpoint URL must match deployed Google Apps Script
- Field names must match backend script expectations
- Required fields must have HTML `required` attribute
- Email fields must have `type="email"`

**State Transitions**:
```
[INITIAL] → (user fills form) → [FILLED]
[FILLED] → (submit click) → [SUBMITTING]
[SUBMITTING] → (success) → [SUCCESS] → (clear localStorage)
[SUBMITTING] → (error, retry) → [RETRYING]
[RETRYING] → (3 attempts) → [FAILED] → (save to localStorage)
[FAILED] → (page reload) → [RECOVERABLE] → (show recovery prompt)
[RECOVERABLE] → (restore) → [FILLED]
```

**Example Instances**:
```yaml
main-interest-form:
  formId: interest-form
  endpoint: https://script.google.com/macros/s/.../exec
  fields:
    - name: email
      type: email
      required: true
  recovery:
    storageKey: aln_interest_form
    ttl: 604800000

playtest-signup-form:
  formId: playtest-form
  endpoint: https://script.google.com/macros/s/.../exec
  fields:
    - name: email
      type: email
      required: true
    - name: fullName
      type: text
      required: true
    - name: photoConsent
      type: checkbox
      required: false
  recovery:
    storageKey: aln_playtest_form
    ttl: 604800000
```

---

### 4. Interactive Behavior

**Definition**: JavaScript-driven features that enhance static content.

**Attributes**:
- `behaviorType` (enum): accordion, sticky-header, form-submission, parallax, scroll-effects
- `triggers` (array): User actions that activate behavior
- `domTargets` (array): CSS selectors for affected elements
- `dependencies` (array): Other behaviors this depends on
- `gracefulDegradation` (string): What happens without JavaScript

**Validation Rules**:
- Must not modify Content Blocks (read-only access to text)
- Must respect `prefers-reduced-motion` for animations
- Must maintain WCAG AA compliance
- DOM targets must exist or fail silently

**Example Instances**:
```yaml
accordion:
  behaviorType: accordion
  triggers: [click on .faq-question button]
  domTargets: [.faq-question, .faq-answer]
  dependencies: []
  gracefulDegradation: All answers visible by default
  accessibility:
    - aria-expanded toggled on click
    - keyboard navigation (Enter/Space)
    - focus management

form-submission:
  behaviorType: form-submission
  triggers: [submit event on form]
  domTargets: [form, .submit-button, .status-message]
  dependencies: [localStorage-recovery]
  gracefulDegradation: Standard HTML form submission
  errorHandling:
    - network failure → retry with backoff
    - server error → save to localStorage
    - validation error → show inline messages

sticky-header:
  behaviorType: sticky-header
  triggers: [scroll event]
  domTargets: [header.main-header]
  dependencies: []
  gracefulDegradation: Header remains at top (non-sticky)
  performance:
    - passive scroll listener
    - debounce 16ms
    - GPU-accelerated transform
```

---

### 5. File Structure Metadata

**Definition**: Organizational metadata about file locations and content types.

**Attributes**:
- `filePath` (string): Relative path from repo root
- `fileType` (enum): html, css, javascript, documentation, configuration
- `purpose` (string): Human-readable description of file's role
- `contentTypes` (array): Types of Content Blocks in this file
- `maintainer` (enum): developer, content-editor, both

**Relationships**:
- Contains Content Blocks
- Contains Structural Components
- Referenced in migration guide

**Example Instances**:
```yaml
index.html:
  filePath: /index.html
  fileType: html
  purpose: Main landing page with all content and structure
  contentTypes: [hero, pricing, dates, faq, creators, event-details]
  maintainer: both
  size: ~1000 lines (current), ~400 lines (after refactor)

css/components.css:
  filePath: /css/components.css
  fileType: css
  purpose: Reusable component styles (cards, accordions, buttons)
  contentTypes: []
  maintainer: developer
  size: ~200 lines (estimated)

js/forms.js:
  filePath: /js/forms.js
  fileType: javascript
  purpose: Form submission, validation, localStorage recovery
  contentTypes: []
  maintainer: developer
  size: ~150 lines (estimated)

docs/CONTENT_GUIDE.md:
  filePath: /docs/CONTENT_GUIDE.md
  fileType: documentation
  purpose: Guide for content editors on where to find and update content
  contentTypes: all
  maintainer: content-editor
  size: ~50 lines (estimated)
```

---

## Relationships Diagram

```
┌─────────────────┐
│ Content Block   │ (text content)
└────────┬────────┘
         │ contained in
         ↓
┌─────────────────────┐
│ Structural Component│ (repeated patterns)
└────────┬────────────┘
         │ has CSS classes
         │ has JS behaviors
         ↓
┌──────────────────────┐
│ Interactive Behavior │ (JS enhancements)
└──────────────────────┘

┌─────────────────┐
│ Form Config     │ (field definitions)
└────────┬────────┘
         │ uses
         ↓
┌──────────────────────┐
│ Interactive Behavior │ (form submission)
└──────────────────────┘

All entities are organized within:
┌──────────────────────────┐
│ File Structure Metadata  │ (file organization)
└──────────────────────────┘
```

---

## Data Flow

### Content Update Workflow

```
1. Content Editor identifies change needed
   ↓
2. Searches for text in files (CONTENT_GUIDE.md)
   ↓
3. Locates Content Block via comment markers
   ↓
4. Edits text within safe zone
   ↓
5. Saves file
   ↓
6. Git commit (triggers pre-commit hook)
   ↓
7. HTML Tidy validates structure
   ↓
8. Push to GitHub (auto-deploy to GitHub Pages)
   ↓
9. Content live in 1-2 minutes
```

### Form Submission Workflow

```
1. User fills Form Configuration fields
   ↓
2. Client-side validation (HTML5 + custom)
   ↓
3. Submit → Form Submission Behavior (Interactive Behavior)
   ↓
4. POST to Google Apps Script endpoint
   ↓
5a. SUCCESS → Clear localStorage → Show confirmation
   ↓
5b. FAILURE → Retry with exponential backoff (3 attempts)
   ↓
6. If all retries fail → Save to localStorage
   ↓
7. User reloads page → Recovery prompt shown
   ↓
8. User restores data → Return to step 1
```

---

## Migration Mapping

### Current Monolithic Structure → Refactored Structure

| Current Location | Refactored Location | Content Type |
|------------------|---------------------|--------------|
| index.html:1-100 | index.html:1-50 + css/base.css | Head, meta, styles |
| index.html:101-200 | index.html:51-100 | Hero section content |
| index.html:201-400 | index.html:101-150 | About/details content |
| index.html:401-600 | index.html:151-200 | FAQ section content |
| index.html:601-800 | index.html:201-250 | Creator profiles content |
| index.html:801-900 | index.html:251-300 | Footer, forms content |
| index.html:901-1000 | js/forms.js + js/interactions.js | JavaScript behaviors |
| Inline styles | css/base.css + css/layout.css + css/components.css | Separated styles |

---

## Validation Requirements Summary

### Pre-Commit Validation (Git Hook)
- ✅ HTML structure valid (tidy)
- ✅ All tags properly closed
- ✅ Required attributes present (alt text, aria labels)

### Runtime Validation (Browser)
- ✅ Form fields match validation rules
- ✅ localStorage available and not quota-exceeded
- ✅ Required DOM targets exist for Interactive Behaviors
- ✅ External resources load (Google Fonts, Google Apps Script)

### Deployment Validation (Manual Checklist)
- ✅ Forms submit successfully to Google Sheets
- ✅ Confirmation emails sent
- ✅ Accessibility features intact (keyboard nav, screen readers)
- ✅ Performance budget met (FCP < 1.5s)
- ✅ Mobile responsiveness maintained

---

## Notes

**Why This Data Model Matters**: While this is a refactoring project (not new features), explicitly defining these entities ensures:

1. Content Blocks are clearly identified and protected during refactoring
2. Structural Components maintain consistency when duplicated
3. Form Configurations stay synchronized with backend scripts
4. Interactive Behaviors don't accidentally break content editing workflows
5. File Structure Metadata enables comprehensive migration documentation

The data model serves as a contract between the current state and the refactored state, ensuring nothing is lost in translation.
