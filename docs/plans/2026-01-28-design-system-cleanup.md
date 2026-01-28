# Design System Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate inline styles in feb2025.html by creating semantic CSS classes, ensuring visual consistency and DRY principles.

**Architecture:** Extract inline styles into reusable CSS classes in base.css and layout.css. Remove deprecated CSS that won't be needed once feb2025.html replaces index.html. All section headers unified to single visual treatment.

**Tech Stack:** HTML5, CSS3, no build tools

**Context:** feb2025.html is the staging file that will replace index.html as the main landing page.

---

## Task 1: Add Section Typography Classes to base.css

**Files:**
- Modify: `css/base.css:78` (after `.hook` styles)

**Step 1: Add new CSS classes**

Add the following after line 78 (after the `.hook` block):

```css
/* ═══════════════════════════════════════════════════════ */
/* Section Typography                                       */
/* ═══════════════════════════════════════════════════════ */

/* Unified section header - all major section titles */
.section-header {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3rem;
    text-align: center;
    color: #cc0000;
    margin-bottom: 2rem;
    text-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
    letter-spacing: 0.05em;
}

/* Section intro - subtitle text below headers */
.section-intro {
    text-align: center;
    font-size: 1.3rem;
    color: rgba(255, 255, 255, 0.8);
    margin-bottom: 3rem;
}

/* Section prompt - small italic callout (e.g., "Still have questions?") */
.section-prompt {
    font-size: 1.2rem;
    color: #cc0000;
    margin-bottom: 0.5rem;
    font-style: italic;
    text-align: center;
}

/* Short dramatic narrative lines (trailer-style) */
.story-beat {
    font-size: 1.5rem;
    color: rgba(255, 255, 255, 0.9);
    max-width: 800px;
    margin: 0 auto 1rem;
    text-align: center;
}

/* Final story beat variant - dimmer, smaller for transitions */
.story-beat--fade {
    font-size: 1.2rem;
    color: rgba(255, 255, 255, 0.7);
    max-width: 600px;
}

/* Choice separator ("or" between options) */
.choice-separator {
    text-align: center;
    display: block;
    font-size: 1.5rem;
    color: rgba(204, 0, 0, 0.7);
    font-style: italic;
}

/* Thematic case badge */
.case-badge {
    color: rgba(204, 0, 0, 0.7);
    font-weight: 700;
    letter-spacing: 0.15em;
    margin-right: 1rem;
}

/* CTA wrapper - centers call-to-action elements */
.cta-wrapper {
    text-align: center;
    margin-top: 3rem;
}

/* CTA prompt - text before a call-to-action button */
.cta-prompt {
    font-size: 1.3rem;
    color: rgba(204, 0, 0, 0.9);
    font-weight: 600;
    margin-bottom: 1rem;
}

/* In-content CTA link (purple accent) */
.cta-inline {
    color: rgba(139, 0, 255, 0.9);
    text-decoration: none;
    font-size: 1.2rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    transition: color 0.3s ease, text-shadow 0.3s ease;
}

.cta-inline:hover {
    color: rgba(139, 0, 255, 1);
    text-shadow: 0 0 10px rgba(139, 0, 255, 0.5);
}

/* Inline link within body text (red accent) */
.link-inline {
    color: rgba(204, 0, 0, 0.9);
    text-decoration: underline;
}

.link-inline:hover {
    color: #cc0000;
}
```

**Step 2: Verify syntax**

Open `css/base.css` in browser dev tools or run a CSS linter to verify no syntax errors.

**Step 3: Commit**

```bash
git add css/base.css
git commit -m "feat(css): add section typography classes for design system cleanup"
```

---

## Task 2: Add Footer Credit Class to layout.css

**Files:**
- Modify: `css/layout.css:241` (after `.location-detail`)

**Step 1: Add footer credit class**

Add after line 241 (after `.location-detail` block):

```css
.footer-credit {
    color: rgba(255, 255, 255, 0.5);
    font-size: 0.9rem;
    margin-top: 2rem;
}
```

**Step 2: Commit**

```bash
git add css/layout.css
git commit -m "feat(css): add footer-credit class"
```

---

## Task 3: Update Section Headers in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 88, 128, 160, 212, 256, 294

**Step 1: Update "What Happened Last Night" header (line 88)**

Change:
```html
<h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; margin-bottom: 1rem; text-shadow: 0 0 30px rgba(139, 0, 255, 0.8);">What Happened Last Night</h2>
```

To:
```html
<h2 class="section-header">What Happened Last Night</h2>
```

**Step 2: Update "Fragmented Memories" header (line 128)**

Change:
```html
<h2>Fragmented Memories</h2>
```

To:
```html
<h2 class="section-header">Fragmented Memories</h2>
```

**Step 3: Update "What exactly is" header (line 160)**

Change:
```html
<h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3.5rem; text-align: center; margin-bottom: 3rem; color: #cc0000; text-shadow: 0 0 30px rgba(204, 0, 0, 0.6); letter-spacing: 0.05em;">What exactly is 'About Last Night...'?</h2>
```

To:
```html
<h2 class="section-header">What exactly is 'About Last Night...'?</h2>
```

**Step 4: Update "Who We Are" header (line 212)**

Change:
```html
<h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; text-align: center; color: #cc0000; margin-bottom: 3rem;">Who We Are</h2>
```

To:
```html
<h2 class="section-header">Who We Are</h2>
```

**Step 5: Update "Our Philosophy" header (line 256)**

Change:
```html
<h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3.5rem; text-align: center; margin-bottom: 3rem; color: #cc0000; text-shadow: 0 0 30px rgba(204, 0, 0, 0.6); letter-spacing: 0.05em;"> Our Philosophy & Why We Made This</h2>
```

To:
```html
<h2 class="section-header">Our Philosophy & Why We Made This</h2>
```

**Step 6: Update "Before You Enter" header (line 294)**

Change:
```html
<h2 style="font-family: 'Bebas Neue', sans-serif; font-size: 3rem; text-align: center; color: #cc0000; margin-bottom: 1rem;">Before You Enter: Essential Intel</h2>
```

To:
```html
<h2 class="section-header">Before You Enter: Essential Intel</h2>
```

**Step 7: Verify in browser**

Open `feb2025.html` locally. All 6 section headers should now have:
- Red color (#cc0000)
- Red glow effect
- 3rem font size
- Centered text

**Step 8: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): replace inline h2 styles with .section-header class"
```

---

## Task 4: Update Story Beats in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 89-109

**Step 1: Replace story beat paragraphs**

Change lines 89-109 from:
```html
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    Marcus Blackwood's underground party.
</p>
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    NeurAI's CEO playing host to Silicon Valley's rising stars.
</p>
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    The warehouse. The music. The deals made.
</p>
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    <span class="corrupt">Marcus is dead.</span>
</p>
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    Some friends are missing.
</p>
<p style="font-size: 1.5rem; color: rgba(255, 255, 255, 0.9); max-width: 800px; margin: 0 auto 1rem;">
    Your memories were taken.
</p>
<p style="font-size: 1.2rem; color: rgba(255, 255, 255, 0.7); max-width: 600px; margin: 0 auto;">
    And those memories are now up for sale.
</p>
```

To:
```html
<p class="story-beat">Marcus Blackwood's underground party.</p>
<p class="story-beat">NeurAI's CEO playing host to Silicon Valley's rising stars.</p>
<p class="story-beat">The warehouse. The music. The deals made.</p>
<p class="story-beat"><span class="corrupt">Marcus is dead.</span></p>
<p class="story-beat">Some friends are missing.</p>
<p class="story-beat">Your memories were taken.</p>
<p class="story-beat story-beat--fade">And those memories are now up for sale.</p>
```

**Step 2: Verify in browser**

The "What Happened Last Night" section should display:
- 6 centered lines at 1.5rem, white with 0.9 opacity
- Final line at 1.2rem, dimmer (0.7 opacity)

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): replace inline paragraph styles with .story-beat classes"
```

---

## Task 5: Update Misc Inline Elements in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 67, 142, 274, 295

**Step 1: Update case badge (line 67)**

Change:
```html
<span style="color: rgba(204, 0, 0, 0.7); font-weight: 700; letter-spacing: 0.15em; margin-right: 1rem;">CASE #ALN-2026</span>
```

To:
```html
<span class="case-badge">CASE #ALN-2026</span>
```

**Step 2: Update choice separator (line 142)**

Change:
```html
<span style="text-align: center; display: block; font-size: 1.5rem; color: rgba(204, 0, 0, 0.7); font-style: italic;">or</span>
```

To:
```html
<span class="choice-separator">or</span>
```

**Step 3: Update section prompt (line 274)**

Change:
```html
<h2 style="font-size: 1.2rem; color: #cc0000; margin-bottom: 0.5rem; font-style: italic;">Still have questions?</h2>
```

To:
```html
<p class="section-prompt">Still have questions?</p>
```

Note: Changed from `<h2>` to `<p>` because this is not a section header — it's a prompt/callout.

**Step 4: Update section intro (lines 295-296)**

Change:
```html
<p style="text-align: center; font-size: 1.3rem; color: rgba(255, 255, 255, 0.8); margin-bottom: 3rem;">
    Real answers to real questions.
</p>
```

To:
```html
<p class="section-intro">Real answers to real questions.</p>
```

**Step 5: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): replace misc inline styles with semantic classes"
```

---

## Task 6: Update CTA Wrappers and Links in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 178-180, 273, 302, 392-394

**Step 1: Update "Learn more" link (lines 178-180)**

Change:
```html
<div style="text-align: center; margin-top: 3rem;">
    <a href="how-to-play.html" style="color: rgba(139, 0, 255, 0.9); text-decoration: none; font-size: 1.2rem; font-weight: 600; letter-spacing: 0.05em; transition: color 0.3s ease, text-shadow 0.3s ease;" onmouseover="this.style.color='rgba(139, 0, 255, 1)'; this.style.textShadow='0 0 10px rgba(139, 0, 255, 0.5)';" onmouseout="this.style.color='rgba(139, 0, 255, 0.9)'; this.style.textShadow='none';">Learn more about how the game is played →</a>
</div>
```

To:
```html
<div class="cta-wrapper">
    <a href="how-to-play.html" class="cta-inline">Learn more about how the game is played →</a>
</div>
```

**Step 2: Update CTA wrapper near "Still have questions?" (line 273)**

Change:
```html
<div style="text-align: center; margin-top: 3rem;">
```

To:
```html
<div class="cta-wrapper">
```

**Step 3: Update FAQ inline link (line 302)**

Change:
```html
<a href="#what-exactly-is-about-last-night" style="color: rgba(204, 0, 0, 0.9); text-decoration: underline;">Read the full breakdown above.</a>
```

To:
```html
<a href="#what-exactly-is-about-last-night" class="link-inline">Read the full breakdown above.</a>
```

**Step 4: Update FAQ bottom CTA section (lines 392-394)**

Change:
```html
<div style="text-align: center; margin-top: 3rem;">
    <p style="font-size: 1.3rem; color: rgba(204, 0, 0, 0.9); font-weight: 600;">No more questions. Time to remember.</p>
    <a href="#submit-evidence" class="cta-primary" style="margin-top: 1rem;">Begin Memory Recovery</a>
</div>
```

To:
```html
<div class="cta-wrapper">
    <p class="cta-prompt">No more questions. Time to remember.</p>
    <a href="#submit-evidence" class="cta-primary">Begin Memory Recovery</a>
</div>
```

**Step 5: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): replace CTA wrapper and link inline styles with classes"
```

---

## Task 7: Update Ticketing Section in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 421-425

**Step 1: Update ticketing prompt (line 421)**

Change:
```html
<p style="text-align: center; font-size: 1.3rem; color: rgba(204, 0, 0, 0.9); margin-bottom: 1rem; font-weight: 600;">
    Select your entry point into the investigation.
</p>
```

To:
```html
<p class="cta-prompt">Select your entry point into the investigation.</p>
```

**Step 2: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): update ticketing section prompt styling"
```

---

## Task 8: Update Footer in feb2025.html

**Files:**
- Modify: `feb2025.html` line 445

**Step 1: Update production credit**

Change:
```html
<p style="color: rgba(255, 255, 255, 0.5); font-size: 0.9rem; margin-top: 2rem;">
    A Patchwork Adventures × StoryPunk Production
</p>
```

To:
```html
<p class="footer-credit">A Patchwork Adventures × StoryPunk Production</p>
```

**Step 2: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): update footer credit styling"
```

---

## Task 9: Clean Up Explanation Section Markup in feb2025.html

**Files:**
- Modify: `feb2025.html` lines 158-176, 254-271

**Step 1: Clean up "What exactly is" section (lines 158-176)**

Remove inline styles that duplicate existing CSS:

Line 158 - Keep background inline (unique per section):
```html
<section id="what-exactly-is-about-last-night" class="explanation-section fade-in-section" style="background: linear-gradient(rgba(0,0,0,0.80), rgba(0,0,0,0.80)), url('images/ALN-noirdrugwall.jpg') center/cover fixed;">
```

Line 159 - Remove inline style (already in CSS):
```html
<div class="content-container">
```

Line 162 - Remove wrapper div entirely, CSS handles `<p>` styling:

Change:
```html
<div style="font-size: 1.2rem; line-height: 1.9; color: rgba(255, 255, 255, 0.88);">
    <p style="margin-bottom: 1.8rem;">Think escape room...</p>
    ...
</div>
```

To:
```html
<p>Think escape room meets murder mystery — but you're not solving for the "right" answer.</p>
<p>Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.</p>
<p>But here's the thing: you get to <em>CHOOSE</em> whether or not you share what you've found.</p>
<p>Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth — it is whatever your group decides.</p>
<p>This isn't Mafia. There's no hidden killer to catch, no bluffing about who you are. You all start not really knowing who you are. And as you discover more about yourself and others, you get to negotiate what everyone will <em>say</em> happened. Think more Diplomacy rather than Werewolf.</p>
<p>You don't need to be an actor — there's no audience watching. You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.</p>
<p>You just need to decide: what kind of story do you want to tell tonight?</p>
```

Note: The `<em>` tags no longer need inline styles — `.explanation-section em` in layout.css handles them.

**Step 2: Clean up "Why We Made This" section (lines 254-271)**

Same pattern — remove wrapper div and inline margin styles:

Line 254 - Keep background inline:
```html
<section id="why-we-made-this" class="explanation-section fade-in-section" style="background: linear-gradient(rgba(15, 15, 15, 0.92), rgba(15, 15, 15, 0.94)), url('images/ALN-noirdrugwall.jpg') center/cover fixed; padding: 5rem 2rem;">
```

Line 255 - Remove inline style:
```html
<div class="content-container">
```

Lines 258-271 - Remove wrapper div and inline margin styles, keep just `<p>` tags.

**Step 3: Verify in browser**

Both explanation sections should maintain:
- Proper paragraph spacing
- Red italic emphasis text
- Bullet point markers (▸) before paragraphs

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "refactor(html): clean up explanation section redundant markup"
```

---

## Task 10: Remove Deprecated CSS from layout.css

**Files:**
- Modify: `css/layout.css`

**Step 1: Remove deprecated h2 selectors**

Delete lines 93-100 (`.narrative-content h2`):
```css
.narrative-content h2 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 4rem;
    margin-bottom: 3rem;
    text-align: center;
    color: #cc0000;
    text-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
}
```

Delete lines 130-136 (`.warehouse-text h2`):
```css
.warehouse-text h2 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3rem;
    color: #fff;
    margin-bottom: 1rem;
    text-shadow: 0 0 30px rgba(139, 0, 255, 0.8);
}
```

Delete lines 213-219 (`.form-container h2`):
```css
.form-container h2 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3rem;
    color: #cc0000;
    margin-bottom: 1rem;
    text-shadow: 0 0 20px rgba(204, 0, 0, 0.5);
}
```

Delete lines 493-502 (`.explanation-section h2`):
```css
.explanation-section h2 {
    font-family: 'Bebas Neue', sans-serif;
    font-size: 3.5rem;
    text-align: center;
    margin-bottom: 3rem;
    color: #cc0000;
    text-shadow: 0 0 30px rgba(204, 0, 0, 0.6);
    letter-spacing: 0.05em;
    text-transform: uppercase;
}
```

**Step 2: Remove deprecated section styles (only used by old index.html)**

Delete `.warehouse-scene`, `.warehouse-overlay`, `.warehouse-text` (lines 102-136)

Delete `.evidence-room`, `.evidence-grid` (lines 138-153)

Delete `.how-it-works`, `.process-grid`, `.experience-stats`, `.stat`, `.stat-number`, `.stat-label` (lines 301-345)

**Step 3: Verify no CSS errors**

Open browser dev tools, check for CSS parsing errors.

**Step 4: Commit**

```bash
git add css/layout.css
git commit -m "refactor(css): remove deprecated section h2 and unused section styles"
```

---

## Task 11: Remove Deprecated CSS from components.css

**Files:**
- Modify: `css/components.css`

**Step 1: Remove deprecated component styles (only used by old index.html)**

Delete `.evidence-item` and related styles (lines 118-166)

Delete `.process-step`, `.step-number` and related styles (lines 214-249)

**Step 2: Update .no-js styles in base.css if needed**

Check if `.no-js .process-content` and `.no-js .evidence-content` references need removal (lines 81-88 in base.css).

**Step 3: Commit**

```bash
git add css/components.css css/base.css
git commit -m "refactor(css): remove deprecated component styles"
```

---

## Task 12: Final Verification

**Step 1: Visual regression check**

Open `feb2025.html` in browser and verify:
- [ ] All 6 section headers have consistent red glow styling
- [ ] Story beats in "What Happened" section display correctly
- [ ] Explanation section paragraphs have proper spacing and bullet markers
- [ ] "or" choice separator is styled correctly
- [ ] Case badge in booking bar displays correctly
- [ ] All CTA links work and have hover effects
- [ ] Footer credit displays correctly
- [ ] No visual regressions from original design

**Step 2: Check for remaining inline styles**

Run:
```bash
grep -n "style=" feb2025.html
```

Expected remaining inline styles (intentional):
- Line 158: Section background (unique)
- Line 254: Section background (unique)
- Line 430: Widget container (unique)

**Step 3: Mobile responsiveness**

Test at 768px and 375px widths. Verify:
- Section headers scale appropriately
- Story beats remain readable
- No horizontal overflow

**Step 4: Lighthouse audit**

Run Lighthouse performance audit. Targets:
- FCP < 1.5s
- LCP < 2.5s
- CLS < 0.1

**Step 5: Final commit**

```bash
git add -A
git commit -m "docs: complete design system cleanup - visual consistency achieved"
```

---

## Summary of Changes

### New CSS Classes Added (base.css)
- `.section-header` - unified section titles
- `.section-intro` - subtitle text below headers
- `.section-prompt` - small italic callouts
- `.story-beat` - dramatic narrative lines
- `.story-beat--fade` - dimmer variant
- `.choice-separator` - "or" between options
- `.case-badge` - thematic badges
- `.cta-wrapper` - centers CTA elements
- `.cta-prompt` - text before CTA buttons
- `.cta-inline` - purple accent links
- `.link-inline` - red inline links

### New CSS Classes Added (layout.css)
- `.footer-credit` - production credit styling

### CSS Removed (layout.css)
- `.narrative-content h2`
- `.warehouse-text h2`
- `.form-container h2`
- `.explanation-section h2`
- `.warehouse-scene`, `.warehouse-overlay`, `.warehouse-text`
- `.evidence-room`, `.evidence-grid`
- `.how-it-works`, `.process-grid`
- `.experience-stats`, `.stat`, `.stat-number`, `.stat-label`

### CSS Removed (components.css)
- `.evidence-item` and related
- `.process-step`, `.step-number` and related

### HTML Changes (feb2025.html)
- 6 section headers → `.section-header`
- 7 story paragraphs → `.story-beat` / `.story-beat--fade`
- 1 case badge → `.case-badge`
- 1 choice separator → `.choice-separator`
- 1 section prompt → `.section-prompt`
- 1 section intro → `.section-intro`
- 3 CTA wrappers → `.cta-wrapper`
- 2 CTA prompts → `.cta-prompt`
- 1 CTA link → `.cta-inline`
- 1 inline link → `.link-inline`
- 1 footer credit → `.footer-credit`
- ~14 redundant inline styles removed from explanation sections
