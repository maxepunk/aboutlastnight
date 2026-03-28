# Show Extension + Press Coverage Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the About Last Night website to reflect the show extension (through Apr 25), incorporate SF Chronicle and Tri-City Voice press coverage as social proof, and enhance private booking visibility.

**Architecture:** Two files modified — `css/components.css` (append new rules) and `index.html` (content edits throughout). No new files. No JS changes. No build process. Changes validated by `tidy` pre-commit hook and visual inspection.

**Tech Stack:** Vanilla HTML5, CSS3. Zero dependencies. GitHub Pages auto-deploys from main.

**Spec:** `docs/superpowers/specs/2026-03-19-extension-press-coverage-update-design.md`

---

## Chunk 1: CSS Foundation

All new CSS classes must exist before the HTML references them.

### Task 1: Add `.press-badge` class

**Files:**
- Modify: `css/components.css:658` (append after final line)

- [ ] **Step 1: Append `.press-badge` CSS after line 659**

```css

/* ═══════════════════════════════════════════════════════ */
/* Press Badge (Hero)                                       */
/* ═══════════════════════════════════════════════════════ */

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

- [ ] **Step 2: Verify no CSS syntax errors**

Run: Open `css/components.css` and confirm it parses cleanly (no red squiggles in editor, or open any HTML page in browser and check DevTools console for CSS errors).

### Task 2: Add `.testimonial-attribution` base class

**Files:**
- Modify: `css/components.css` (append after Task 1's addition)

- [ ] **Step 1: Append attribution CSS**

```css

/* ═══════════════════════════════════════════════════════ */
/* Testimonial Attribution                                  */
/* ═══════════════════════════════════════════════════════ */

.testimonial-attribution {
    display: block;
    margin-top: 1rem;
    font-style: normal;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.5);
}
```

### Task 3: Add `.testimonial--press` modifier and its children

**Files:**
- Modify: `css/components.css` (append after Task 2's addition)

- [ ] **Step 1: Append press testimonial modifier CSS**

```css

/* ═══════════════════════════════════════════════════════ */
/* Press Testimonial Modifier                               */
/* ═══════════════════════════════════════════════════════ */

.testimonial--press {
    border-left-color: rgba(255, 200, 0, 0.7);
}

.testimonial--press p::before,
.testimonial--press p::after {
    color: rgba(255, 200, 0, 0.6);
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

### Task 4: Add `.mobile-break` utility

**Files:**
- Modify: `css/components.css` (append after Task 3's addition)

- [ ] **Step 1: Append mobile break utility CSS**

```css

/* ═══════════════════════════════════════════════════════ */
/* Mobile Utilities                                         */
/* ═══════════════════════════════════════════════════════ */

.mobile-break {
    display: none;
}

@media (max-width: 768px) {
    .mobile-break {
        display: block;
    }
}
```

### Task 5: Verify and commit all CSS

- [ ] **Step 1: Open `index.html` in browser**

Open in Chrome. Open DevTools → Console. Confirm no CSS parse errors logged.

- [ ] **Step 2: Verify CSS file line count**

Run: `wc -l css/components.css`
Expected: ~730 lines (was 659, added ~70 lines of new rules).

- [ ] **Step 3: Commit**

```bash
git add css/components.css
git commit -m "feat: add CSS for press badge, press testimonials, attribution, and mobile utility"
```

---

## Chunk 2: Hero Badge + Meta Description

### Task 6: Add Datebook Pick badge to hero

**Files:**
- Modify: `index.html:50` (after `.awards-badge` line)

- [ ] **Step 1: Insert press badge element**

In `index.html`, find line 50:
```html
            <p class="awards-badge">From Award Winning Puzzle, Game, and Immersive Theater designers</p>
```

Insert immediately after it (before the `<p class="hook">` on line 51):
```html
            <p class="press-badge">SF Chronicle Datebook Pick</p>
```

- [ ] **Step 2: Open in browser and verify hero**

Confirm:
- "FROM AWARD WINNING..." text unchanged above
- "SF CHRONICLE DATEBOOK PICK" appears below it in gold uppercase
- Thin gold separator line visible between the two
- Hook text "Some memories are worth killing for" still appears below
- No visual crowding on both desktop and mobile (375px)

### Task 7: Update meta description date

**Files:**
- Modify: `index.html:7`

- [ ] **Step 1: Change date in meta description**

Find line 7:
```html
    <meta name="description" content="Some memories are worth killing for. A limited-run immersive crime thriller pop-up in Fremont, CA. February 26 - April 5, 2026.">
```

Change `April 5` to `April 25`:
```html
    <meta name="description" content="Some memories are worth killing for. A limited-run immersive crime thriller pop-up in Fremont, CA. February 26 - April 25, 2026.">
```

- [ ] **Step 2: Verify with view-source**

Right-click page → View Page Source. Confirm line 7 reads `April 25, 2026`.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add SF Chronicle Datebook Pick badge to hero, update meta date"
```

---

## Chunk 3: Booking Bar Update

### Task 8: Update booking bar status text

**Files:**
- Modify: `index.html:68` (`.preview-dates` span)

- [ ] **Step 1: Replace status text**

Find line 68:
```html
                <span class="preview-dates">STATUS: BACK DUE TO POPULAR DEMAND • BOOKING NOW</span>
```

Replace entire line with:
```html
                <span class="preview-dates">STATUS: EXTENDED BY POPULAR DEMAND • LIMITED PUBLIC BOOKINGS AVAILABLE •<br class="mobile-break"> <a href="mailto:aboutlastnightgame@gmail.com" style="color: inherit; text-decoration: underline;">CONTACT US FOR A PRIVATE BOOKING</a></span>
```

- [ ] **Step 2: Verify status text renders on desktop**

Open in browser at full width. Confirm:
- "EXTENDED BY POPULAR DEMAND" visible
- "LIMITED PUBLIC BOOKINGS AVAILABLE" visible
- "CONTACT US FOR A PRIVATE BOOKING" visible and underlined
- Clicking "CONTACT US..." opens mailto to `aboutlastnightgame@gmail.com`

- [ ] **Step 3: Verify mobile breakpoint**

Open Chrome DevTools → responsive mode → 375px width. Confirm:
- Text wraps at the `<br class="mobile-break">` after the trailing `•`
- "CONTACT US FOR A PRIVATE BOOKING" starts on its own line (no leading bullet)

### Task 9: Update booking bar dates

**Files:**
- Modify: `index.html:70` (`.main-run-line` span)

- [ ] **Step 1: Change date in run line**

Find line 70:
```html
                <span class="main-run-line">Feb 26 - Apr 5, 2026 • $75/person</span>
```

Replace with:
```html
                <span class="main-run-line">Feb 26 - Apr 25, 2026 • $75/person</span>
```

- [ ] **Step 2: Verify booking bar shows new date**

Confirm booking bar reads "Feb 26 - Apr 25, 2026 • $75/person".

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: update booking bar for extension - new status, dates, private booking CTA"
```

---

## Chunk 4: Press Quote Position A (After "What Happened")

### Task 10: Replace testimonial #1 with TCV "Solving a murder" press quote

**Files:**
- Modify: `index.html:101-104`

- [ ] **Step 1: Replace testimonial #1 block**

Find lines 101-104:
```html
    <!-- Testimonial #4 -->
    <div class="testimonial">
        <p>Overall it was a lot of fun, and I'm eager to play again at some point to get deeper into the experience.</p>
    </div>
```

Replace with:
```html
    <!-- Press Quote: Tri-City Voice -->
    <div class="testimonial testimonial--press">
        <p>Solving a murder was never this fun.</p>
        <cite class="testimonial-attribution">
            <span class="testimonial-source">Tri-City Voice</span>
            <span class="testimonial-author">Stephanie Uchida</span>
        </cite>
    </div>
```

**IMPORTANT:** Save the old text "Overall it was a lot of fun, and I'm eager to play again at some point to get deeper into the experience." — it will be re-inserted at position D in Task 14.

- [ ] **Step 2: Verify position A renders**

Open in browser, scroll to just after "What Happened Last Night" section. Confirm:
- Gold left border (not red)
- Gold quotation marks (not red)
- Quote text: "Solving a murder was never this fun."
- Attribution reads: `TRI-CITY VOICE — Stephanie Uchida`
- Attribution line is gold publication + white author name

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: position A - TCV 'Solving a murder' press quote after What Happened"
```

---

## Chunk 5: Press Quote Position B (After Fragmented Memories)

### Task 11: Insert SF Chronicle press quote after Fragmented Memories

**Files:**
- Modify: `index.html` (after line 137 — the `<!-- END CONTENT SECTION: FRAGMENTED MEMORIES -->` comment)

- [ ] **Step 1: Insert new press quote block**

Find line 137:
```html
    <!-- END CONTENT SECTION: FRAGMENTED MEMORIES -->
```

Insert immediately after it (before the `<!-- ═══` comment marker for "WHAT EXACTLY IS THIS" which starts at line 139):
```html

    <!-- Press Quote: San Francisco Chronicle -->
    <div class="testimonial testimonial--press">
        <p>The experience isn't just a whodunnit but what economists might liken to a prisoner's dilemma.</p>
        <cite class="testimonial-attribution">
            <span class="testimonial-source">San Francisco Chronicle</span>
            <span class="testimonial-author">Lily Janiak</span>
        </cite>
    </div>

```

- [ ] **Step 2: Verify position B renders**

Open in browser, scroll past Fragmented Memories. Confirm:
- Gold-bordered Chronicle quote appears between Fragmented Memories and "What Exactly Is This"
- Not back-to-back with position A (full Fragmented Memories section separates them)
- Attribution reads: `SAN FRANCISCO CHRONICLE — Lily Janiak`

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: position B - SF Chronicle press quote after Fragmented Memories"
```

---

## Chunk 6: Player Testimonial Positions C & D

### Task 12: Position C — Add attribution to testimonial #2

**Files:**
- Modify: `index.html:170-173` (testimonial after "What Exactly Is This")

Note: Line numbers may have shifted by ~8 lines due to the insertion in Task 11. The target is the testimonial that reads "The setup is unique and interesting...".

- [ ] **Step 1: Add attribution to testimonial #2**

Find:
```html
    <!-- Testimonial #1 -->
    <div class="testimonial">
        <p>The setup is unique and interesting, and I really like the depth of story (even if we didn't find all of it) and the way the bits of story we did find weaved into our own narrative.</p>
    </div>
```

Replace with:
```html
    <!-- Testimonial: Player Feedback -->
    <div class="testimonial">
        <p>The setup is unique and interesting, and I really like the depth of story (even if we didn't find all of it) and the way the bits of story we did find weaved into our own narrative.</p>
        <cite class="testimonial-attribution">— Player Feedback</cite>
    </div>
```

- [ ] **Step 2: Verify position C**

Scroll to after "What Exactly Is This". Confirm:
- Red left border (not gold — this is a player testimonial)
- Red quotation marks
- Attribution "— Player Feedback" visible in dim white below the quote

### Task 13: Position D — Insert moved testimonial #1 between Creators and Philosophy

**Files:**
- Modify: `index.html` (after `<!-- END CONTENT SECTION: CREATOR PROFILES -->` comment, currently at line 228 but shifted due to prior insertions)

- [ ] **Step 1: Insert player testimonial #1 after Creator Profiles section**

Find:
```html
    <!-- END CONTENT SECTION: CREATOR PROFILES -->
```

Insert immediately after it (before the `<!-- ═══` comment marker for "WHY WE MADE THIS"):
```html

    <!-- Testimonial: Player Feedback (moved from after What Happened) -->
    <div class="testimonial">
        <p>Overall it was a lot of fun, and I'm eager to play again at some point to get deeper into the experience.</p>
        <cite class="testimonial-attribution">— Player Feedback</cite>
    </div>

```

- [ ] **Step 2: Verify position D**

Scroll to after Creator Profiles / before Our Philosophy. Confirm:
- Red left border, red quote marks (player testimonial)
- Text matches the original testimonial #1
- "— Player Feedback" attribution visible
- Full Creator Profiles section separates it from position C above
- Full Our Philosophy section separates it from position E below

- [ ] **Step 3: Commit positions C and D**

```bash
git add index.html
git commit -m "feat: positions C & D - player testimonial attribution and moved testimonial"
```

---

## Chunk 7: Press Quote Position E + Testimonial F

### Task 14: Position E — Replace testimonial #3 with TCV "recover memories" press quote

**Files:**
- Modify: `index.html` (the testimonial after "Our Philosophy" / "WHY WE MADE THIS" section)

The target is the block that currently reads "I really enjoyed finding my memories and role playing the character." — originally at lines 259-263 but shifted due to prior insertions.

- [ ] **Step 1: Replace testimonial #3**

Find:
```html
	   <!-- Testimonial #2 -->

	<div class="testimonial">
        <p>I really enjoyed finding my memories and role playing the character.</p>
    </div>
```

Replace with:
```html
    <!-- Press Quote: Tri-City Voice -->
    <div class="testimonial testimonial--press">
        <p>A way to not only recover memories, but to create some.</p>
        <cite class="testimonial-attribution">
            <span class="testimonial-source">Tri-City Voice</span>
            <span class="testimonial-author">Stephanie Uchida</span>
        </cite>
    </div>
```

- [ ] **Step 2: Verify position E**

Scroll to after Our Philosophy. Confirm:
- Gold left border, gold quote marks (press testimonial)
- Text: "A way to not only recover memories, but to create some."
- Attribution: `TRI-CITY VOICE — Stephanie Uchida`

### Task 15: Position F — Add attribution to testimonial #4

**Files:**
- Modify: `index.html` (the testimonial before the booking widget, originally at lines 384-388)

The target is the block that reads "My group and I were amazed by the amount of work..."

- [ ] **Step 1: Add attribution to testimonial #4**

Find:
```html
	    <!-- Testimonial #3 (Early Placement) -->
    <div class="testimonial">
        <p>My group and I were amazed by the amount of work that went into creating the room and all of its moving parts—we're still talking about it!</p>
    </div>
```

Replace with:
```html
    <!-- Testimonial: Player Feedback -->
    <div class="testimonial">
        <p>My group and I were amazed by the amount of work that went into creating the room and all of its moving parts—we're still talking about it!</p>
        <cite class="testimonial-attribution">— Player Feedback</cite>
    </div>
```

- [ ] **Step 2: Verify all 6 positions in sequence**

Scroll through the entire page top to bottom. Verify this exact sequence with no back-to-back quotes:

| # | After Section | Type | Border | Quote snippet | Attribution |
|---|---------------|------|--------|--------------|-------------|
| A | What Happened | PRESS | Gold | "Solving a murder..." | TRI-CITY VOICE — Stephanie Uchida |
| B | Fragmented Memories | PRESS | Gold | "prisoner's dilemma..." | SAN FRANCISCO CHRONICLE — Lily Janiak |
| C | What Exactly Is This | PLAYER | Red | "The setup is unique..." | — Player Feedback |
| D | Creator Profiles | PLAYER | Red | "Overall it was a lot of fun..." | — Player Feedback |
| E | Our Philosophy | PRESS | Gold | "recover memories..." | TRI-CITY VOICE — Stephanie Uchida |
| F | Before Booking Widget | PLAYER | Red | "My group and I were amazed..." | — Player Feedback |

- [ ] **Step 3: Commit positions E and F**

```bash
git add index.html
git commit -m "feat: positions E & F - TCV closing press quote, final player attribution"
```

---

## Chunk 8: FAQ Updates

### Task 16: Update "How do I book?" FAQ answer

**Files:**
- Modify: `index.html` (FAQ section — the "How do I book?" faq-item)

- [ ] **Step 1: Add private booking line to "How do I book?"**

Find:
```html
                    <p class="faq-answer"><a href="#submit-evidence" class="link-inline">Scroll down </a> to select your entry point into the investigation. Then select the date and time you'd like to book.</p>
```

Replace with:
```html
                    <p class="faq-answer"><a href="#submit-evidence" class="link-inline">Scroll down </a> to select your entry point into the investigation. Then select the date and time you'd like to book.<br><br>For private games, corporate events, or custom scheduling, email <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">aboutlastnightgame@gmail.com</a> with your preferred date/time and group size (5-20 players).</p>
```

- [ ] **Step 2: Verify the FAQ answer**

Scroll to FAQ → "How do I book?" Confirm the private booking line appears as a second paragraph within the answer, with the email as a clickable link.

### Task 17: Update "When and where is it?" FAQ answer

**Files:**
- Modify: `index.html` (FAQ section — the "When and where" faq-item)

- [ ] **Step 1: Update date**

Find:
```html
                    Feb 26 - Apr 5, 2026<br>
```

Replace with:
```html
                    Feb 26 - Apr 25, 2026<br>
```

- [ ] **Step 2: Update schedule**

Find:
```html
                    Thursday-Sunday performances, multiple time slots<br>
```

Replace with:
```html
                    Thu-Sun through Apr 5 | Fri &amp; Sat only, Apr 11-25<br>
```

- [ ] **Step 3: Update contact line**

Find:
```html
                    Contact us for weekday bookings at <a href="mailto:hello@patchworkadventures.com">hello@patchworkadventures.com</a>
```

Replace with:
```html
                    Contact us for private games and weekday bookings at <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">aboutlastnightgame@gmail.com</a> — include your preferred date/time and group size (5-20 players)
```

- [ ] **Step 4: Verify "When and where" answer**

Scroll to FAQ → "When and where is it?" Confirm:
- Date reads "Feb 26 - Apr 25, 2026"
- Schedule reads "Thu-Sun through Apr 5 | Fri & Sat only, Apr 11-25"
- Contact line mentions "private games and weekday bookings" with email `aboutlastnightgame@gmail.com`
- Email is a clickable `mailto:` link

- [ ] **Step 5: Audit "Will I be paired with strangers?" FAQ**

Find the FAQ answer (search for "Will I be paired with strangers?"). The current text mentions private sessions ("If you prefer a private session, book any empty time slot. There's an option to block out the rest of the player slots for a small fee.") but contains no email address. Per the spec, update the contact reference if it differs — since none exists, no email change is needed. However, the "small fee" and "book any empty time slot" language may be stale now that private bookings are handled via email. Update the private session sentence:

Find:
```html
If you prefer a private session, book any empty time slot. There's an option to block out the rest of the player slots for a small fee.</p>
```

Replace with:
```html
If you prefer a private session, <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">contact us</a> to arrange a dedicated time slot for your group.</p>
```

- [ ] **Step 6: Commit FAQ changes**

```bash
git add index.html
git commit -m "feat: update FAQ for extension dates, schedule split, and private booking CTAs"
```

---

## Chunk 9: Private Booking Widget Note + Final Verification

### Task 18: Add private booking note near booking widget

**Files:**
- Modify: `index.html` (ticketing widget section — after the LOCATION system note)

- [ ] **Step 1: Insert private booking note**

Find:
```html
            <p class="system-note" style="margin-top: 0.5rem;">
                <strong>LOCATION:</strong> Off the Couch Games ·
                <a href="https://maps.google.com/?q=555+Mowry+Ave+Fremont+CA+94536" class="link-inline" target="_blank" rel="noopener">
                    555 Mowry Ave, Fremont, CA 94536
                </a>
            </p>
```

Insert immediately after this `</p>` closing tag:
```html

            <p class="system-note" style="margin-top: 0.5rem;">
                <strong>PRIVATE BOOKINGS:</strong> Want a private experience or custom date?
                Email us at <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">aboutlastnightgame@gmail.com</a>
                with your preferred date/time and group size (5-20 players).
            </p>
```

- [ ] **Step 2: Verify private booking note**

Scroll to the booking widget section. Confirm:
- "PRIVATE BOOKINGS:" label visible in bold
- Email link works (opens mailto)
- Note appears between the location line and the booking iframe
- Styled consistently with the existing LOCATION system note

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add private booking note near booking widget"
```

### Task 19: Run tidy HTML validation

- [ ] **Step 1: Run tidy on index.html**

```bash
tidy -q -e index.html
```

Review output. Fix any errors (not warnings). Common OK warnings:
- `<video>` proprietary attributes (`playsinline`) — OK
- `data-event-date` custom attribute — OK
- Missing `</source>` — OK (void element)

- [ ] **Step 2: If errors found, fix and re-run tidy**

Make targeted fixes. Re-run `tidy -q -e index.html`. Repeat until clean.

### Task 20: Full visual walkthrough

- [ ] **Step 1: Desktop verification**

Open `index.html` in Chrome at full width. Verify each item:

1. Hero badge: "SF CHRONICLE DATEBOOK PICK" in gold below awards line
2. Booking bar: "EXTENDED BY POPULAR DEMAND • LIMITED PUBLIC BOOKINGS AVAILABLE • CONTACT US FOR A PRIVATE BOOKING"
3. Booking bar dates: "Feb 26 - Apr 25, 2026"
4. Position A: Gold TCV quote after What Happened
5. Position B: Gold Chronicle quote after Fragmented Memories
6. Position C: Red player quote with attribution after What Exactly Is This
7. Position D: Red player quote with attribution after Creators
8. Position E: Gold TCV quote after Philosophy
9. Position F: Red player quote with attribution before booking widget
10. FAQ "How do I book?": private booking line with email
11. FAQ "When and where?": Apr 25 date, schedule split, private booking contact
12. Private booking note above booking widget
13. All mailto links open to `aboutlastnightgame@gmail.com`
14. Meta description: Right-click → View Page Source → line 7 reads "April 25, 2026"

- [ ] **Step 2: Mobile verification**

Chrome DevTools → Responsive → 375px width:

1. Booking bar text wraps at mobile break point
2. Press badge readable and not overlapping
3. All testimonials display cleanly (no attribution overflow)
4. FAQ content wraps properly (long private booking line)

- [ ] **Step 3: Run Lighthouse performance audit**

Chrome DevTools → Lighthouse tab → Performance audit → Generate report. Verify:
- First Contentful Paint (FCP) < 1.5s
- Largest Contentful Paint (LCP) < 2.5s
- Cumulative Layout Shift (CLS) < 0.1

Note: Running on `file://` may not reflect production CDN performance. Primary concern is that no new layout shift was introduced by the testimonial changes.

- [ ] **Step 4: Final commit if fixes were needed**

Only if Steps 1-2 revealed issues:
```bash
git add index.html css/components.css
git commit -m "fix: address validation and responsive issues from visual review"
```

- [ ] **Step 5: Verify git log shows clean commit history**

```bash
git log --oneline -10
```

Expected: 7-8 clean commits (CSS foundation, hero+meta, booking bar, then one per quote chunk, FAQ, widget note, plus optional fix commit).
