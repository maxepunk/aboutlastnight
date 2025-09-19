# About Last Night Landing Page - Development Guidelines

Auto-generated from feature plans. Last updated: 2025-01-19

## Current Feature: Progressive Disclosure UI Enhancement (001-notes-for-improvement)

### Active Technologies
- HTML5
- CSS3 (inline styles)
- Vanilla JavaScript ES6 (inline scripts)
- No external dependencies (zero-dependency architecture)

## Project Structure
```
/
├── index.html           # Main landing page (being modified)
├── playtest.html        # Playtest signup page
├── images/              # Background images
├── favicon.svg          # Site favicon
└── FORM_HANDLER_GOOGLE_SCRIPT.js  # Google Apps Script (deployed separately)
```

## Current Implementation Focus

### Progressive Disclosure Components
1. **Sticky Header**: Booking bar that sticks on scroll
2. **Accordion Sections**:
   - How You'll Find the Truth (4 process steps)
   - Evidence You'll Uncover (3 items)
   - Creator Profiles (3 profiles)
   - FAQ Section (14 questions)

### Key Implementation Requirements
- All accordions use single-open behavior (only one expanded at a time)
- Custom noir-themed SVG indicators (#cc0000 accent)
- Smooth animations (ease-in-out, 0.3s transitions)
- Full keyboard accessibility (Tab, Enter/Space)
- ARIA attributes for screen readers
- Print stylesheet auto-expands all sections
- Progressive enhancement (works without JavaScript)

## Code Style Guidelines

### CSS
- Use CSS custom properties for theming
- GPU-accelerated animations only (transform, opacity)
- Mobile-first responsive design
- Respect prefers-reduced-motion

### JavaScript
- Vanilla JS only, no frameworks
- Event delegation where possible
- Debounce scroll events (16ms)
- Progressive enhancement approach

### Accessibility
- WCAG AA compliance required
- 44x44px minimum touch targets
- Proper ARIA labels and states
- Keyboard navigation support

## Testing Checklist
- [ ] Test without JavaScript enabled
- [ ] Verify keyboard navigation
- [ ] Check screen reader announcements
- [ ] Test print layout
- [ ] Verify mobile responsiveness (320px min)
- [ ] Performance: 60fps animations
- [ ] Cross-browser testing

## Recent Changes
- 001-notes-for-improvement: Implementing progressive disclosure UI patterns

<!-- MANUAL ADDITIONS START -->
<!-- Add any manual notes or overrides below this line -->
<!-- MANUAL ADDITIONS END -->