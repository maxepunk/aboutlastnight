# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Landing page for "About Last Night" - a 90-minute immersive crime thriller experience combining escape room puzzles, roleplay, and social deduction.

**Live Site:** aboutlastnightgame.com (GitHub Pages)
**Run Dates:** October 4 - November 9, 2025
**Location:** Off the Couch Games, Fremont, CA

## Technology Stack

- HTML5, CSS3, Vanilla JavaScript (zero external dependencies)
- Google Apps Script for form backend
- GitHub Pages for hosting
- Google Sheets for data storage

## Core Design Principles

### Zero Dependencies
No frameworks, libraries, or build tools. This ensures fast load times and eliminates dependency management.

### Content-First Design
The primary use case is updating copy (event details, pricing, dates). Code organization should optimize for non-technical team members making text changes.

### Progressive Enhancement
Core content and functionality works without JavaScript. Enhanced interactions layer on top.

### Accessibility
- WCAG AA compliance
- Keyboard navigation
- Screen reader support
- Respects `prefers-reduced-motion`

## Common Development Tasks

### Deployment
```bash
git add .
git commit -m "description"
git push origin main
```
GitHub Pages auto-deploys from main branch. Changes live within 1-2 minutes.

### Testing Forms
Form backends are Google Apps Script Web Apps. Local testing requires:
1. Serve files via local server (not file://)
2. Or deploy to GitHub Pages for full testing
3. Check Google Sheets for data validation

### Updating Form Backends
1. Edit `.js` files locally for version control
2. Copy to Google Apps Script editor
3. Deploy new version: Deploy → Manage deployments → Edit → New version
4. Update URL in HTML if deployment creates new endpoint

## Form Integration Architecture

Two separate forms with different backends:
- **Main interest form** (`index.html`) - Collects emails for ticket launch notifications
- **Playtest signup** (`playtest.html`) - Manages limited playtest spots with waitlist

Both use Google Apps Script to:
- Store submissions in Google Sheets
- Send confirmation emails to users
- Send alert emails to organizers
- Generate unique tracking IDs

**Critical:** Form endpoint URLs are production. Breaking them breaks the site.

## Content Management

### Event Details
Key information updated frequently:
- Dates and showtimes
- Pricing
- Availability status
- Location details
- Content warnings

### Marketing Copy
Structured in noir crime thriller theme:
- Memory/investigation metaphors
- Silicon Valley corporate conspiracy narrative
- Character profiles (creators)
- FAQ addressing common concerns

## Performance Considerations

- Images are background images with parallax scrolling
- Scroll listeners use passive events and debouncing (16ms)
- Animations use GPU-accelerated properties (transform, opacity)
- No render-blocking resources

## Browser Support

- Modern browsers (last 2 versions)
- Progressive degradation for older browsers
- Mobile-first responsive design
- Touch targets minimum 44x44px

## Pre-Production Status

This project is in active development before launch:
- **Breaking changes are acceptable** - Refactor boldly when needed
- **Throw errors early** - Fail fast rather than silent fallbacks
- **No backwards compatibility required** - Optimize for best solution, not legacy support

## Important Files

- `FORM_HANDLER_GOOGLE_SCRIPT.js` - Main form backend
- `PLAYTEST_GOOGLE_SCRIPT.js` - Playtest signup backend
- `FORM_IMPLEMENTATION.md` - Form integration options documentation
- `PLAYTEST_SETUP_GUIDE.md` - Playtest system setup instructions
- `MarketingLanguagePressRelease.md` - Copy reference and messaging guide
