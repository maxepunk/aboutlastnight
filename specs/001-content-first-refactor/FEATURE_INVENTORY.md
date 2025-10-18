# Feature Inventory - Interactive Behaviors & Components

**Feature**: Content-First Codebase Refactor
**Date**: 2025-01-19
**Purpose**: Complete inventory of interactive features for SC-008 verification (all features function identically post-refactor)

---

## Interactive Behaviors (JavaScript-Driven)

### 1. Progressive Disclosure Accordions ✓
**Location**: index.html:587-801 (JavaScript), CSS:1060-1262
**Type**: Interactive Behavior
**Components**:
- Process Steps (How It Works section)
- Evidence Items (inline mini-accordions)
- Creator Profiles (Personnel Files)
- FAQ Items (Questions/Answers)

**Functionality**:
- Click to expand/collapse content
- Keyboard navigation (Enter/Space to toggle, Tab to navigate)
- ARIA attributes (aria-expanded, aria-controls, role=button)
- Only one accordion open at a time per container
- Smooth max-height transitions

**Test Checklist**:
- [ ] Click accordion header → content expands
- [ ] Click again → content collapses
- [ ] Tab to accordion → press Enter/Space → expands
- [ ] Opening one accordion closes others in same section
- [ ] ARIA attributes update correctly
- [ ] Smooth animation (respects prefers-reduced-motion)

---

### 2. Sticky Header (Booking Bar) ✓
**Location**: index.html:748-789, CSS:1104-1122
**Type**: Interactive Behavior
**Element**: `.booking-bar` (#booking-bar)

**Functionality**:
- Scrolls with page initially (position: sticky)
- Becomes fixed when user scrolls past hero section
- Debounced scroll listener (16ms for 60fps)
- Slide-down animation on sticky activation
- Passive event listener for performance

**Test Checklist**:
- [ ] Header scrolls with page at top
- [ ] Header becomes fixed after scrolling past hero
- [ ] Animation plays smoothly when becoming sticky
- [ ] No scroll jank (performance)
- [ ] Works on mobile devices

---

### 3. Parallax Scrolling ✓
**Location**: index.html:445-477, CSS:114-125
**Type**: Visual Effect
**Element**: `.hero-bg-image`

**Functionality**:
- Hero background image moves slower than scroll (0.5x speed)
- Uses requestAnimationFrame for smooth 60fps
- Passive scroll listener
- GPU-accelerated (transform property)
- Respects prefers-reduced-motion preference

**Test Checklist**:
- [ ] Hero background moves at different speed than page
- [ ] Smooth 60fps animation (no jank)
- [ ] Disabled when prefers-reduced-motion is set
- [ ] Background doesn't scroll on fixed sections

---

### 4. Scanline Effect ✓
**Location**: index.html:489-552, CSS:939-1013
**Type**: Visual Effect
**Elements**: `.scanline`, `.scanline-secondary`

**Functionality**:
- Animated red scanline effect across viewport
- Pauses during scrolling for readability
- Reduces opacity during inactivity (10s no mouse movement)
- Fast scan on hero section hover
- Two scanlines for depth effect
- Ghost trail effect

**Test Checklist**:
- [ ] Scanline animates vertically across page
- [ ] Pauses while scrolling
- [ ] Fades when no mouse movement for 10s
- [ ] Speeds up on hero hover
- [ ] Secondary scanline provides depth
- [ ] Respects prefers-reduced-motion

---

### 5. Fade-In on Scroll ✓
**Location**: index.html:554-585, CSS:1036-1045
**Type**: Interactive Behavior
**Class**: `.fade-in-section`

**Functionality**:
- Sections fade in and slide up when scrolled into view
- Uses IntersectionObserver API
- Threshold: 0.1 (10% visible)
- Root margin: -100px bottom (triggers before fully visible)
- Applies to narrative, party-scene, warehouse-scene, how-it-works sections

**Test Checklist**:
- [ ] Sections invisible until scrolled near
- [ ] Fade-in animation triggers at correct threshold
- [ ] No re-triggering after first animation
- [ ] Works on all .fade-in-section elements
- [ ] Respects prefers-reduced-motion

---

### 6. Memory Block Reveal ✓
**Location**: index.html:572-577
**Type**: Interactive Behavior
**Class**: `.memory-block`

**Functionality**:
- Memory blocks slide in from left when scrolled into view
- IntersectionObserver-based
- Staggered appearance for multiple blocks
- Transform: translateX animation

**Test Checklist**:
- [ ] Memory blocks slide in from left
- [ ] Each block animates independently
- [ ] Smooth 0.8s transition
- [ ] Only animates once

---

### 7. Form Submission with Tracking ✓
**Location**: index.html:351-434 (form), CSS:479-529 (styles)
**Form ID**: `#interestForm`
**Endpoint**: Google Apps Script Web App

**Functionality**:
- Email collection for interest list
- Hidden tracking fields (UTM source, referrer, device type)
- Auto-populates device detection and referrer
- POST to Google Apps Script with no-cors mode
- Visual feedback (button text changes)
- Success message display
- Auto-reset after 5 seconds

**Fields**:
- `email` (required, type=email)
- `utm_source` (hidden, from URL params or 'direct')
- `referrer` (hidden, document.referrer)
- `device_type` (hidden, Mobile/Desktop detection)

**Test Checklist**:
- [ ] Form validates email format
- [ ] Hidden fields populate correctly
- [ ] Submission shows "DECRYPTING..." state
- [ ] Success shows "MEMORIES UNLOCKED" + green
- [ ] Data appears in Google Sheets
- [ ] Form resets after 5 seconds
- [ ] Error state works on network failure

---

### 8. Smooth Scrolling for Anchor Links ✓
**Location**: index.html:436-443
**Type**: Interactive Behavior
**Applies to**: All `a[href^="#"]` links

**Functionality**:
- Clicking anchor links scrolls smoothly to target
- Uses scrollIntoView with behavior: 'smooth'
- Block: 'start' alignment

**Test Checklist**:
- [ ] All # links scroll smoothly (not jump)
- [ ] CTA buttons scroll to #submit-evidence
- [ ] Navigation scrolls to correct sections
- [ ] Works on mobile devices

---

### 9. Police Light Hover Effect ✓
**Location**: index.html:479-487, CSS:43-57
**Type**: Visual Effect
**Elements**: `.evidence-item`, `.cta-primary` (on hover)

**Functionality**:
- Red pulsing box-shadow animation
- Triggered on hover
- Keyframe animation (policeLights)
- 1s infinite loop

**Test Checklist**:
- [ ] Evidence items pulse red on hover
- [ ] CTA buttons pulse on hover
- [ ] Animation stops on mouse leave
- [ ] Smooth transition

---

### 10. Title Glitch Effect ✓
**Location**: CSS:59-100, applied to `h1`
**Type**: Visual Effect
**Element**: Hero title "About Last Night..."

**Functionality**:
- Animated text shadow glitch effect
- Multi-color glitch (cyan, magenta, yellow)
- 15s loop with 2s delay
- Only glitches for 200ms every 15s (89-93% of animation)

**Test Checklist**:
- [ ] Title glitches briefly every ~15 seconds
- [ ] Multi-color shadow effect
- [ ] Minimal distraction (brief duration)
- [ ] Respects prefers-reduced-motion

---

## Responsive Breakpoints ✓

**Location**: CSS:896-937
**Breakpoint**: `@media (max-width: 768px)`

**Mobile Adaptations**:
- Booking bar: Flex-direction column, smaller font
- Process grid: Single column
- Experience stats: Reduced gap
- FAQ grid: Single column
- Hero h1: 4rem (from 10rem)
- Section headings: 2.5rem (from 3rem+)
- Hook text: 1.5rem (from 2rem)

**Test Checklist**:
- [ ] Layout stacks vertically on mobile
- [ ] Text scales appropriately
- [ ] Touch targets ≥44x44px
- [ ] No horizontal overflow
- [ ] Booking bar readable on mobile

---

## Accessibility Features ✓

### ARIA Attributes
- Accordion triggers: `aria-expanded`, `aria-controls`, `role=button`
- Accordion content: `role=region`
- Decorative elements: `aria-hidden=true` (scanlines)
- Tab index: `tabindex=0` for keyboard navigation

### Keyboard Navigation
- Tab: Navigate between interactive elements
- Enter/Space: Trigger accordions
- Focus indicators: Blue outline (browser default)

### Motion Preferences
**Location**: CSS:1047-1058, 1251-1262
**Media Query**: `@media (prefers-reduced-motion: reduce)`

**Disabled when motion reduced**:
- Parallax effect
- Scanlines
- Title glitch animation
- All accordion transitions

**Test Checklist**:
- [ ] prefers-reduced-motion disables animations
- [ ] Keyboard navigation works throughout
- [ ] Focus indicators visible
- [ ] Screen reader announces accordion states

---

## Print Styles ✓

**Location**: CSS:1229-1248
**Media Query**: `@media print`

**Print Optimizations**:
- All accordion content expanded
- Accordion indicators hidden
- Booking bar position: static (not sticky)

**Test Checklist**:
- [ ] Print shows all content (no collapsed accordions)
- [ ] No interactive elements visible
- [ ] Layout appropriate for paper

---

## Progressive Enhancement (No-JS Support) ✓

**Location**: CSS:1277-1289
**Class**: `.no-js`

**Fallback Behavior**:
- All accordion content visible by default
- No accordion indicators
- Forms still submit (HTML5 validation only)
- Smooth scrolling disabled

**Test Checklist**:
- [ ] Page readable without JavaScript
- [ ] All content accessible
- [ ] Forms still functional (HTML5 validation)
- [ ] No broken interactions

---

## Performance Optimizations

### GPU Acceleration
- Parallax: `will-change: transform`
- Transform properties for animations (not layout-triggering props)

### Passive Event Listeners
- Scroll events: `{ passive: true }`
- Prevents scroll blocking

### Debouncing
- Sticky header: 16ms debounce (60fps target)
- Scroll animations: requestAnimationFrame

**Test Checklist**:
- [ ] Lighthouse score >90 performance
- [ ] No scroll jank (60fps)
- [ ] First Contentful Paint <1.5s
- [ ] Time to Interactive <3s

---

## Email Confirmation System

**Backend**: FORM_HANDLER_GOOGLE_SCRIPT.js (Google Apps Script)
**Sheets**: Google Sheets database
**Email**: Sends confirmation to user + alert to organizers

**Test Checklist**:
- [ ] User receives confirmation email
- [ ] Organizers receive notification email
- [ ] Tracking ID generated correctly
- [ ] Data appears in Google Sheets with timestamp

---

## Form Field Dependencies (Critical - Must Not Break)

**Main Interest Form** (index.html:310-334):
- Field: `name="email"` (required)
- Field: `name="utm_source"` (hidden)
- Field: `name="referrer"` (hidden)
- Field: `name="device_type"` (hidden)

**Backend Contract** (FORM_HANDLER_GOOGLE_SCRIPT.js):
- Expects: `e.parameter.email`
- Expects: `e.parameter.utm_source`
- Expects: `e.parameter.referrer`
- Expects: `e.parameter.device_type`

**Test Checklist**:
- [ ] Field names match backend expectations
- [ ] Required fields validated
- [ ] Hidden fields populate correctly
- [ ] POST payload correct format

---

## Summary Statistics

| Category | Count | Status |
|----------|-------|--------|
| **Interactive Behaviors** | 10 | ✓ Documented |
| **Visual Effects** | 4 (scanline, glitch, parallax, police lights) | ✓ Documented |
| **Responsive Breakpoints** | 1 (768px) | ✓ Documented |
| **Accessibility Features** | 5 (ARIA, keyboard, motion, print, no-JS) | ✓ Documented |
| **Forms** | 1 (interest signup) | ✓ Documented |
| **Performance Optimizations** | 3 (GPU, passive, debounce) | ✓ Documented |

**Total Interactive Elements**: ~25 testable behaviors

---

**Next Steps for SC-008 Verification**:
1. After each refactor phase, run through this checklist
2. Compare visual appearance before/after (screenshots)
3. Test each interactive behavior manually
4. Verify forms still submit to Google Sheets
5. Check responsive behavior at 768px breakpoint
6. Validate accessibility with keyboard navigation
7. Test prefers-reduced-motion functionality

**Baseline Established**: 2025-01-19
**Last Updated**: 2025-01-19
