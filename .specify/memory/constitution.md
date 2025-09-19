<!-- Sync Impact Report 
Version change: 0.0.0 → 1.0.0 (Initial ratification with 7 core principles)
Added sections: All sections newly defined from template
Templates requiring updates: 
  ✅ plan-template.md (alignment pending)
  ✅ spec-template.md (alignment pending)
  ✅ tasks-template.md (alignment pending)
Follow-up TODOs: None
-->

# About Last Night Landing Page Constitution

## Core Principles

### I. Atmospheric Integrity
Every page element must reinforce the noir crime thriller aesthetic. The dark theme with red accent color (#cc0000) is mandatory. Visual effects (scanlines, glitch animations, police lights) must be subtle and purposeful. Typography must use Bebas Neue for headings and Barlow for body text. This creates the immersive atmosphere essential to the experience.

### II. Zero-Dependency Architecture
No external JavaScript frameworks, build tools, or runtime dependencies allowed. Pure HTML, CSS, and vanilla JavaScript only. Google Fonts are the sole permitted external resource. This ensures maximum performance, security, and maintainability while eliminating dependency vulnerabilities.

### III. Google Apps Script Backend
All form submissions MUST route through Google Apps Script to Google Sheets. Scripts must handle both GET (status checks) and POST (submissions) requests. Email confirmations are mandatory for all submissions. This provides serverless data collection with built-in authentication and zero hosting costs.

### IV. Privacy-First Data Collection
Photo consent must be explicitly optional with clear opt-in/opt-out mechanisms. Consent choices must be timestamped and stored separately. Surveillance/documentation language must clearly explain usage. Users must have the ability to decline without losing access to the experience.

### V. Progressive Enhancement
Core functionality must work without JavaScript enabled. Forms must have proper HTML5 validation. JavaScript adds enhancements (live counters, animations) but is never required. All interactive elements must have keyboard-accessible alternatives.

### VI. Mobile-Responsive Design
Every page must be fully functional on mobile devices (320px minimum width). Touch targets must be at least 44x44 pixels. Text must remain readable without horizontal scrolling. Grid layouts must collapse to single column on small screens.

### VII. Accessibility Standards
Support prefers-reduced-motion to disable animations. All images must have descriptive alt text. ARIA labels required for decorative elements. Contrast ratios must meet WCAG AA standards (4.5:1 for normal text). Focus states must be clearly visible.

## Performance Requirements

- Page load time under 3 seconds on 3G connections
- Total page weight under 2MB including images
- Images must be optimized (WebP preferred, JPEG/PNG fallback)
- CSS animations must use GPU-accelerated properties (transform, opacity)
- No blocking JavaScript in document head

## Communication Protocols

### Email Standards
- Confirmation emails sent immediately upon form submission
- HTML emails must include plain text fallback
- Subject lines must clearly indicate action taken
- Memory IDs or spot numbers must be prominently displayed
- Include event details, dates, location in every communication

### Status Updates
- Spot counters update on page load and every 30 seconds
- Visual indicators for capacity states (available, low, critical, full)
- Waitlist positions clearly communicated
- Real-time feedback during form submission

## Governance

The Constitution supersedes all implementation decisions. Any changes to core principles require:
1. Documentation of the proposed change and rationale
2. Impact assessment on existing pages
3. Migration plan for affected components
4. Version bump following semantic versioning

All code changes must verify compliance with these principles. Complexity beyond these requirements must be explicitly justified. Use this constitution as the primary reference for all architectural decisions.

**Version**: 1.0.0 | **Ratified**: 2025-01-19 | **Last Amended**: 2025-01-19