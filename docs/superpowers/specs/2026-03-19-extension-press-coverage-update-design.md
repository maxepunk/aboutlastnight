# Website Update: Show Extension + Press Coverage

**Date:** 2026-03-19
**Status:** Approved
**Scope:** index.html, CSS; press.html deferred

## Context

About Last Night has been extended from April 5 to April 25, 2026, with a modified schedule (Fri/Sat only for the extension period Apr 11-25). The show received two pieces of press coverage:

1. **San Francisco Chronicle Datebook Pick** by Lily Janiak (March 5, 2026) — "New escape room combines tech CEO's party and a murder mystery"
2. **Tri-City Voice Review** by Stephanie Uchida (March 17, 2026) — "Interactive play comes to Fremont escape room" (subhead: "Solving a murder was never this fun")

This update incorporates the extension dates, press coverage as social proof, enhanced private booking visibility, and attribution for all testimonials.

## Changes Overview

### 1. Hero Section — Datebook Pick Badge

**File:** `index.html` (line ~50, `.awards-badge` area)

Add "SF Chronicle Datebook Pick" as a second line below the existing awards badge. Treatment should be subtle but clear — distinct from the existing "From Award Winning..." line.

**Current:**
```html
<p class="awards-badge">From Award Winning Puzzle, Game, and Immersive Theater designers</p>
```

**Updated:**
```html
<p class="awards-badge">From Award Winning Puzzle, Game, and Immersive Theater designers</p>
<p class="press-badge">SF Chronicle Datebook Pick</p>
```

**CSS (new `.press-badge` class in `css/components.css`):**
```css
.press-badge {
    font-size: 0.9rem;
    color: rgba(255, 200, 0, 0.9);
    text-transform: uppercase;
    letter-spacing: 0.15em;
    margin-bottom: 1.5rem;
    font-weight: 400;
    border-top: 1px solid rgba(255, 200, 0, 0.3);
    padding-top: 0.5rem;
    margin-top: 0.5rem;
}
```

Slightly smaller than `.awards-badge` (0.9rem vs 1rem), with a thin gold separator line above to create visual distinction. Same gold color family. Semantic: `<p>` is fine for this; no special ARIA needed since the text content is self-descriptive.

### 2. Booking Bar — Updated Status Line

**File:** `index.html` (lines 64-74)

**Current:**
```
CASE #ALN-2026
STATUS: BACK DUE TO POPULAR DEMAND • BOOKING NOW
Feb 26 - Apr 5, 2026 • $75/person
```

**Updated:**
```
CASE #ALN-2026
STATUS: EXTENDED BY POPULAR DEMAND • LIMITED PUBLIC BOOKINGS AVAILABLE • CONTACT US FOR A PRIVATE BOOKING
Feb 26 - Apr 25, 2026 • $75/person
```

"CONTACT US FOR A PRIVATE BOOKING" links to `mailto:aboutlastnightgame@gmail.com`.

**Mobile consideration:** The status line is ~3x longer than the current one. On mobile (where `.booking-dates` drops to `0.7rem`), this will wrap significantly. Solution: break the status into two lines on mobile using a `<br class="mobile-break">` with CSS:
```css
.mobile-break { display: none; }
@media (max-width: 768px) {
    .mobile-break { display: block; }
}
```
Split after "BOOKING NOW" so the private booking CTA wraps to its own line on small screens.

### 3. Press Quotes — New `.testimonial--press` Treatment

**Files:** `index.html`, `css/components.css`

Three press quotes on the page using a modifier class `.testimonial--press`:

| Visual Property | Player (`.testimonial`) | Press (`.testimonial--press`) |
|---|---|---|
| Left border | `3px solid rgba(204, 0, 0, 0.5)` (red) | `3px solid rgba(255, 200, 0, 0.7)` (gold) |
| `::before` / `::after` quote marks | `rgba(204, 0, 0, 0.6)` (red) | `rgba(255, 200, 0, 0.6)` (gold) |
| Attribution | `— Player Feedback` (dim white) | Publication in gold, author in white |
| Background | `rgba(0, 0, 0, 0.3)` | Same |

**CSS for `.testimonial--press` modifier (in `css/components.css`):**
```css
.testimonial--press {
    border-left-color: rgba(255, 200, 0, 0.7);
}
.testimonial--press p::before,
.testimonial--press p::after {
    color: rgba(255, 200, 0, 0.6);
}
```

**CSS for attribution (both press and player, in `css/components.css`):**
```css
.testimonial-attribution {
    display: block;
    margin-top: 1rem;
    font-style: normal;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.5);
}
.testimonial--press .testimonial-source {
    color: rgba(255, 200, 0, 0.9);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 0.8rem;
}
.testimonial--press .testimonial-author {
    color: rgba(255, 255, 255, 0.7);
    margin-left: 0.5rem;
}
.testimonial--press .testimonial-author::before {
    content: '— ';
}
```

Source and author display on the **same line**: `SAN FRANCISCO CHRONICLE — Lily Janiak`

**HTML structure for press quotes:**
```html
<div class="testimonial testimonial--press">
    <p>Quote text here.</p>
    <cite class="testimonial-attribution">
        <span class="testimonial-source">San Francisco Chronicle</span>
        <span class="testimonial-author">Lily Janiak</span>
    </cite>
</div>
```

**HTML structure for player testimonials:**
```html
<div class="testimonial">
    <p>Quote text here.</p>
    <cite class="testimonial-attribution">— Player Feedback</cite>
</div>
```

### 4. Quote Placement — Full Page Flow

**Explicit mapping from current HTML to new positions:**

| Position | Type | Quote Text | Source | Current Location |
|----------|------|-----------|--------|-----------------|
| A | PRESS | "Solving a murder was never this fun" | Stephanie Uchida, Tri-City Voice | NEW (replaces player #1 at its location) |
| B | PRESS | "The experience isn't just a whodunnit but what economists might liken to a prisoner's dilemma." | Lily Janiak, San Francisco Chronicle | NEW (added between Fragmented Memories and What Exactly Is This) |
| C | PLAYER | "The setup is unique and interesting, and I really like the depth of story..." | Player Feedback | STAYS at current line 170-173 (existing testimonial #2) |
| D | PLAYER | "Overall it was a lot of fun, and I'm eager to play again..." | Player Feedback | MOVED from line 101-104 to between Creators and Philosophy |
| E | PRESS | "A way to not only recover memories, but to create some." | Stephanie Uchida, Tri-City Voice | REPLACES existing testimonial #3 at line 259-263 |
| F | PLAYER | "My group and I were amazed by the amount of work..." | Player Feedback | STAYS at current line 384-388 (existing testimonial #4) |

**Testimonial #1** ("Overall it was a lot of fun...") is NOT deleted — it moves from position A to position D (between Creator Profiles and Our Philosophy).

**Testimonial #3** ("I really enjoyed finding my memories and role playing the character.") is the ONLY testimonial removed, replaced by the TCV "recover memories" press quote.

```
Hero (★ Datebook Pick badge)
 ↓
Booking Bar (extended dates + private booking CTA)
 ↓
What Happened Last Night
 ↓
A: ★ PRESS — "Solving a murder was never this fun"
     — Stephanie Uchida, Tri-City Voice
 ↓
Fragmented Memories
 ↓
B: ★ PRESS — "The experience isn't just a whodunnit but what
     economists might liken to a prisoner's dilemma."
     — Lily Janiak, San Francisco Chronicle
 ↓
What Exactly Is This
 ↓
C: PLAYER — "The setup is unique and interesting..."
     — Player Feedback  [existing #2, stays in place]
 ↓
Creator Profiles
 ↓
D: PLAYER — "Overall it was a lot of fun..."
     — Player Feedback  [existing #1, moved here from after What Happened]
 ↓
Our Philosophy
 ↓
E: ★ PRESS — "A way to not only recover memories, but to create some."
     — Stephanie Uchida, Tri-City Voice  [replaces existing #3]
 ↓
FAQ
 ↓
F: PLAYER — "My group and I were amazed..."
     — Player Feedback  [existing #4, stays in place]
 ↓
Booking Widget
```

**Summary:** 3 press quotes (A, B, E) + 3 player testimonials (C, D, F). No quotes back-to-back. Each separated by a full content section.

### 5. FAQ Updates

**File:** `index.html` (FAQ section, lines 275-380)

**Canonical contact email for all private booking references:** `aboutlastnightgame@gmail.com`

#### "When and where is it?" answer (line 311-320):
**Current:**
```
Feb 26 - Apr 5, 2026
Thursday-Sunday performances, multiple time slots
Contact us for weekday bookings at hello@patchworkadventures.com
```

**Updated:**
```
Feb 26 - Apr 25, 2026
Thu-Sun through Apr 5 | Fri & Sat only, Apr 11-25
Contact us for private games and weekday bookings at aboutlastnightgame@gmail.com — include your preferred date/time and group size (5-20 players)
```

Note: The existing "weekday bookings" line is updated to also mention "private games" and uses the canonical email.

#### "How do I book?" answer (line 286-288):
**Add line:**
```
For private games, corporate events, or custom scheduling, email aboutlastnightgame@gmail.com with your preferred date/time and group size (5-20 players)
```

#### "Will I be paired with strangers?" answer (line 302-305):
Keep existing private session mention. Update contact reference to `aboutlastnightgame@gmail.com` if it differs.

### 6. Private Booking — Booking Widget Area

**File:** `index.html` (lines 397-421)

Add a `.system-note` below the existing location note (line 409-414) and above the widget:
```html
<p class="system-note" style="margin-top: 0.5rem;">
    <strong>PRIVATE BOOKINGS:</strong> Want a private experience or custom date?
    Email us at <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">aboutlastnightgame@gmail.com</a>
    with your preferred date/time and group size (5-20 players).
</p>
```

### 7. Meta Description Update

**File:** `index.html` (line 7)

**Current:** `February 26 - April 5, 2026`
**Updated:** `February 26 - April 25, 2026`

### 8. Player Testimonial Attribution

**File:** `index.html` (all 3 remaining player testimonials at positions C, D, F)

Add `<cite>` element after each `<p>`:
```html
<cite class="testimonial-attribution">— Player Feedback</cite>
```

## Out of Scope

- **press.html** — Deferred until new press release is ready. **Known issue:** press.html will show "February 26 - April 5, 2026" dates after this update goes live, which contradicts index.html. This is an accepted temporary inconsistency; the press page will be updated in its own pass when the new press release is finalized.
- **how-to-play.html** — No date references to update.
- **playtest.html / feedback.html** — Not affected.
- **Google Apps Script backends** — No changes needed.

## Files Modified

| File | Changes |
|------|---------|
| `index.html` | Hero badge, booking bar (text + dates), 3 press quotes (new HTML), testimonial #1 moved, testimonial #3 replaced, all testimonials get attribution, FAQ updates (dates, schedule, private booking), meta description, private booking note near widget |
| `css/components.css` | New `.testimonial--press` modifier (border + quote marks), `.press-badge` class, `.testimonial-attribution` + `.testimonial-source` + `.testimonial-author` styling, `.mobile-break` utility |

## Verification

1. Open `index.html` locally — confirm all 6 quote positions render correctly with no back-to-back quotes
2. Confirm press quotes have gold border and gold quote marks; player testimonials have red
3. Confirm attribution text displays correctly: `PUBLICATION — Author` for press, `— Player Feedback` for players
4. Confirm Datebook Pick badge is visible in hero with separator line, not crowding the awards line
5. Confirm booking bar shows "EXTENDED BY POPULAR DEMAND" status with updated dates
6. Confirm "CONTACT US FOR A PRIVATE BOOKING" links to mailto
7. Confirm FAQ "When and where" shows new dates, schedule split, and canonical email
8. Confirm FAQ "How do I book" includes private booking contact line
9. Confirm private booking note appears near booking widget
10. Confirm meta description has "April 25, 2026"
11. Run `tidy` validation (pre-commit hook) to ensure HTML is valid
12. Test mobile: booking bar text wrapping, testimonial attribution layout, press badge sizing
13. Run Lighthouse audit: FCP < 1.5s, LCP < 2.5s, CLS < 0.1
