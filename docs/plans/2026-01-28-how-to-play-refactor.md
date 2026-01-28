# How-to-Play Design System Refactor

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor how-to-play.html to use existing design system classes, eliminating ~295 lines of inline CSS and all inline styles.

**Architecture:** Replace custom classes with existing patterns from base.css, layout.css, and components.css. The page structure maps directly to patterns already used in feb2025.html. Decision cards will use the existing `.faq-item` accordion pattern.

**Tech Stack:** HTML, existing CSS design system (no new CSS files or classes needed)

---

## Pre-Implementation Checklist

- [ ] Verify how-to-play.html currently works in browser (baseline)
- [ ] Note current visual appearance for comparison after refactor

---

## Task 1: Remove Inline Style Block - Hero Section

**Files:**
- Modify: `how-to-play.html:28-323` (remove entire `<style>` block)
- Modify: `how-to-play.html:330-342` (refactor hero section)

**Step 1: Replace custom hero with design system hero**

Change lines 330-342 from:
```html
<!-- Back Link -->
<a href="feb2025.html" class="back-link">← Back to Main Site</a>

<!-- Hero Section -->
<section class="how-to-play-hero">
    <div class="how-to-play-hero-content">
        <div class="corrupted-header">
            <span class="glitch">CASE FILE: GAMEPLAY PROTOCOL</span>
        </div>
        <h1 style="font-family: 'Bebas Neue', sans-serif; font-size: 4rem; color: #cc0000; margin: 2rem 0 1rem 0; text-shadow: 0 0 40px rgba(204, 0, 0, 0.6);">How to Play About Last Night</h1>
        <p style="font-size: 1.3rem; color: rgba(255, 255, 255, 0.7); letter-spacing: 0.05em;">Everything you need to know before entering the investigation</p>
    </div>
</section>
```

To:
```html
<!-- Hero Section -->
<section class="hero" style="min-height: 50vh; background: linear-gradient(rgba(0,0,0,0.9), rgba(0,0,0,0.95)), url('images/ALN-noirdrugwall.jpg') center/cover fixed;">
    <div class="hero-overlay"></div>
    <div class="hero-content">
        <a href="feb2025.html" class="cta-inline" style="position: absolute; top: 2rem; left: 2rem;">← Back to Main Site</a>
        <div class="corrupted-header">
            <span class="glitch">CASE FILE: GAMEPLAY PROTOCOL</span>
        </div>
        <h1>How to Play</h1>
        <p class="tagline">Everything you need to know before entering the investigation</p>
    </div>
</section>
```

**Step 2: Verify hero renders correctly**

Open in browser, check:
- Back link visible and clickable
- Title styled with red glow
- Tagline styled appropriately
- Background image visible through overlay

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): use design system hero pattern"
```

---

## Task 2: Refactor "Meet Your Character" Section

**Files:**
- Modify: `how-to-play.html` (Section 1: Your Character)

**Step 1: Replace custom section with explanation-section pattern**

Change from:
```html
<!-- Section 1: Your Character -->
<section class="gameplay-section with-bg character-bg">
    <div class="gameplay-content">
        <h2 class="section-heading">Meet Your Character</h2>

        <p style="font-size: 1.2rem; line-height: 1.8; color: rgba(255, 255, 255, 0.85); margin-bottom: 1.5rem;">
            You'll receive a character sheet — your name, some memory fragments you still recall, maybe the name of someone you remember knowing. You don't know everything about who you are yet. Neither does anyone else.
        </p>

        <p style="font-size: 1.2rem; line-height: 1.8; color: rgba(255, 255, 255, 0.85);">
            This is your starting point. What you learn from here is up to you.
        </p>
    </div>
</section>
```

To:
```html
<!-- Section 1: Your Character -->
<section class="explanation-section fade-in-section" style="background: linear-gradient(rgba(10, 10, 10, 0.88), rgba(10, 10, 10, 0.92)), url('images/ALN-marcusisdead.jpg') center/cover fixed;">
    <div class="content-container">
        <h2 class="section-header">Meet Your Character</h2>

        <p>You'll receive a character sheet — your name, some memory fragments you still recall, maybe the name of someone you remember knowing. You don't know everything about who you are yet. Neither does anyone else.</p>

        <p>This is your starting point. What you learn from here is up to you.</p>
    </div>
</section>
```

**Step 2: Verify section renders correctly**

Check:
- Section header is red with glow
- Paragraphs have arrow bullets (from .explanation-section p::before)
- First paragraph has left border accent
- Fade-in animation works on scroll

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): character section uses explanation-section"
```

---

## Task 3: Refactor "The Game" Section - Flow Steps

**Files:**
- Modify: `how-to-play.html` (Section 2: The Game - flow steps only)

**Step 1: Replace flow steps with explanation-section paragraphs**

The `.flow-step` pattern with h3 headers should become regular paragraphs with strong emphasis. Change from custom markup to:

```html
<!-- Section 2: The Game -->
<section class="explanation-section fade-in-section" style="background: linear-gradient(rgba(15, 15, 15, 0.90), rgba(15, 15, 15, 0.93)), url('images/ALN-puzzlingtogether.jpg') center/cover fixed;">
    <div class="content-container">
        <h2 class="section-header">The Game</h2>

        <p><strong>Unlock Memories</strong> — Marcus' 'lockdown protocol' has left evidence and extracted memories locked up all around the warehouse. Puzzle through how to get past the locks.</p>

        <p><strong>Scan Their Contents</strong> — Read the contents of the extracted memories using one of Marcus' memory display scanner prototypes.</p>

        <p><strong>Decide Their Fate</strong> — Memory tokens are your currency. Once you know the contents of one, you get to decide what to do:</p>
```

**Step 2: Verify flow steps render correctly**

Check:
- Strong text is uppercase and bright (from .explanation-section strong)
- Paragraphs have consistent styling
- Em-dashes separate title from description

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): flow steps use explanation-section paragraphs"
```

---

## Task 4: Refactor Decision Cards to FAQ Items

**Files:**
- Modify: `how-to-play.html` (decision cards section)

**Step 1: Replace decision-cards with faq-grid pattern**

The three decision cards (EXPOSE, BURY, TRADE) should become `.faq-item` elements. Change from custom cards to:

```html
        <div class="faq-grid" style="margin: 2rem 0;">
            <div class="faq-item">
                <h3 class="faq-question">EXPOSE</h3>
                <div class="faq-answer">
                    <p>Turn the memory in as evidence. Everyone will see what happened.</p>
                    <p><strong>Evidence types:</strong></p>
                    <p>• <strong>Anonymous tip:</strong> Nobody needs to know you were the one to expose this memory</p>
                    <p>• <strong>Take credit:</strong> The public will know you were the source for this piece of evidence</p>
                </div>
            </div>

            <div class="faq-item">
                <h3 class="faq-question">BURY</h3>
                <div class="faq-answer">
                    <p>Sell the memory for profit. The contents will be secret forever. $$ will be wired to your account.</p>
                    <p><strong>Shell account:</strong></p>
                    <p>• ANONYMOUS offshore account</p>
                    <p>• You CHOOSE the ACCOUNT NAME</p>
                    <p>• Shell accounts MAY be SHARED by MULTIPLE individuals</p>
                    <p>• LIMITED availability</p>
                    <p><strong>Personal account:</strong></p>
                    <p>• YOUR personal account</p>
                    <p>• Transactions CAN be TRACED BACK to you</p>
                    <p>• The CONTENTS of your sale remains SECRET</p>
                    <p>• May NOT be shared</p>
                </div>
            </div>

            <div class="faq-item">
                <h3 class="faq-question">TRADE</h3>
                <div class="faq-answer">
                    <p>Leverage the memory to get something you need out of another player OR return it to its rightful owner.</p>
                </div>
            </div>
        </div>
```

**Step 2: Remove the custom toggleCard JavaScript**

Delete lines 519-548 (the toggleCard function and analytics tracking). The existing accordion JS in interactions.js will handle the expand/collapse.

**Step 3: Verify cards work as accordions**

Check:
- Cards have red left border accent
- Click expands/collapses content
- Hover effect works
- Only one card expanded at a time (accordion behavior)

**Step 4: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): decision cards use faq-item accordion"
```

---

## Task 5: Refactor Callout Box to Memory Block

**Files:**
- Modify: `how-to-play.html` (callout box)

**Step 1: Replace callout-box with memory-block**

Change from:
```html
<div class="callout-box">
    <strong>Memory Token Valuation</strong>
    <p>Payment for each token varies based on its value to NeurAI. NeurAI prefers <strong>Technical > Business > Personal</strong> memories. Some memory-sets award <strong>2-5x bonus payments</strong> for EACH MEMORY if sold as a set.</p>
</div>
```

To:
```html
<div class="memory-block">
    Payment for each token varies based on its value to NeurAI. NeurAI prefers <span class="corrupt">Technical > Business > Personal</span> memories. Some memory-sets award <span class="corrupt">2-5x bonus payments</span> for EACH MEMORY if sold as a set.
</div>
```

**Step 2: Verify callout renders correctly**

Check:
- Has "MEMORY FRAGMENT" label
- Red left border
- Hover effect (translateX)
- Corrupt spans are red and uppercase

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): callout uses memory-block pattern"
```

---

## Task 6: Refactor Remaining Game Section Content

**Files:**
- Modify: `how-to-play.html` (remaining paragraphs in The Game section)

**Step 1: Convert remaining inline-styled paragraphs**

All paragraphs with `style="font-size: 1.2rem; line-height: 1.8; ..."` become plain `<p>` tags. The `.explanation-section p` styling handles everything.

The "Negotiate" subsection becomes a strong-prefixed paragraph:

```html
        <p><strong>Negotiate</strong> — What's the story YOU want the world to find out About Last Night?</p>

        <p>Want Justice? Profit? Secrecy? The choice is yours–but the group must get their story straight before the cops arrive.</p>

        <p>Well, that and the incentives offered by NPCs: Expose your alibi to the public, embarrassing as it may be, and you're off the hook. Bury the right secrets, and you may become the next face of NeurAI...</p>

        <p><em>The clock is always running.</em></p>
    </div>
</section>
```

**Step 2: Verify content renders correctly**

Check:
- All paragraphs consistently styled
- Em text (italic) renders in red (from .explanation-section em)
- Strong text is uppercase

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): game section paragraphs use design system"
```

---

## Task 7: Refactor "The Morning After" Section

**Files:**
- Modify: `how-to-play.html` (Section 3: The Morning After)

**Step 1: Replace with explanation-section pattern**

```html
<div class="section-divider"></div>

<!-- Section 3: The Morning After -->
<section class="explanation-section fade-in-section" style="background: linear-gradient(rgba(10, 10, 10, 0.92), rgba(10, 10, 10, 0.95)), url('images/ALN-noirdrugwall.jpg') center/cover fixed;">
    <div class="content-container">
        <h2 class="section-header">The Morning After</h2>

        <p>You leave, hopefully before the cops bust your unofficial investigation and take you in for questioning... But the story doesn't end.</p>

        <p>After the game, you'll receive a personalized Nova News report showing how your choices shaped the official story. You'll also catch narrative pieces you may have missed during your session.</p>
    </div>
</section>
```

**Step 2: Verify section renders correctly**

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): morning after uses explanation-section"
```

---

## Task 8: Refactor Closing Section to Footer

**Files:**
- Modify: `how-to-play.html` (closing section)

**Step 1: Replace closing-section with footer pattern**

Change from custom closing section to:
```html
<div class="section-divider"></div>

<!-- Footer -->
<footer class="footer">
    <a href="feb2025.html" class="cta-primary">← Back to Main Site</a>
    <p class="location-detail" style="margin-top: 2rem;"><strong>Got more questions?</strong></p>
    <p class="location-detail">Email us at <a href="mailto:aboutlastnightgame@gmail.com" class="link-inline">aboutlastnightgame@gmail.com</a></p>
</footer>
```

**Step 2: Verify footer renders correctly**

Check:
- CTA button has hover animation
- Email link is styled correctly
- Footer has border-top and dark background

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): closing section uses footer pattern"
```

---

## Task 9: Remove Inline Style Block and Clean Up

**Files:**
- Modify: `how-to-play.html` (lines 28-323)

**Step 1: Delete the entire inline `<style>` block**

Remove everything from line 28 (`<style>`) through line 323 (`</style>`).

**Step 2: Verify page still renders correctly**

Full visual check:
- Hero section with back link
- All three content sections
- Decision card accordions work
- Memory block callout
- Footer with CTA and contact

**Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): remove all inline CSS"
```

---

## Task 10: Final Validation and Mobile Testing

**Files:**
- Modify: `how-to-play.html` (if fixes needed)

**Step 1: Desktop browser validation**

Open in browser at full width. Verify:
- [ ] Hero displays correctly with overlay
- [ ] All section headers are red with glow
- [ ] Paragraphs have arrow bullets
- [ ] First paragraph in each section has border accent
- [ ] Decision cards expand/collapse
- [ ] Memory block has hover effect
- [ ] Footer CTA has hover animation
- [ ] Fade-in animations trigger on scroll

**Step 2: Mobile browser validation (or DevTools responsive mode)**

Test at 375px width. Verify:
- [ ] All content readable
- [ ] Touch targets adequate (44px+ from design system)
- [ ] No horizontal overflow
- [ ] Back link accessible

**Step 3: Compare with feb2025.html**

Open both pages side by side. Verify:
- [ ] Typography consistent
- [ ] Colors consistent
- [ ] Hover effects consistent
- [ ] Overall aesthetic matches

**Step 4: Final commit**

```bash
git add how-to-play.html
git commit -m "refactor(how-to-play): complete design system migration"
```

---

## Summary

**Before:** ~550 lines with 295 lines of inline CSS
**After:** ~150 lines using existing design system classes

**Classes used from design system:**
- `.hero`, `.hero-overlay`, `.hero-content` (layout.css)
- `.explanation-section`, `.content-container` (layout.css)
- `.section-header` (base.css)
- `.faq-grid`, `.faq-item`, `.faq-question`, `.faq-answer` (components.css)
- `.memory-block`, `.corrupt` (components.css)
- `.footer`, `.location-detail` (layout.css)
- `.cta-primary`, `.cta-inline`, `.link-inline` (components.css, base.css)
- `.fade-in-section`, `.section-divider` (layout.css)
- `.corrupted-header`, `.glitch` (components.css)
- `.tagline` (base.css)

**New classes added:** None
**New CSS files added:** None
