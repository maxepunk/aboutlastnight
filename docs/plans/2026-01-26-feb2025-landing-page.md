# Feb 2025 Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the Feb 2025 PRD content restructure as feb2025.html for stakeholder review before replacing main landing page.

**Architecture:** Copy index.html to feb2025.html and systematically apply all PRD changes: update CTAs, reorder sections, rewrite copy, add 3 new sections, inject 3 testimonials, update FAQ items, and add Casey Selden bio. Extend existing CSS with testimonial styles.

**Tech Stack:** HTML5, CSS3 (modular stylesheets), Vanilla JavaScript, Google Apps Script form backend

---

## Task 1: Setup - Create feb2025.html Copy

**Files:**
- Create: `feb2025.html` (copy of index.html)
- Reference: `docs/plans/aln-website-prd-feb2025.md`

**Step 1: Copy index.html to feb2025.html**

```bash
cp index.html feb2025.html
```

**Step 2: Update meta description for new dates**

In `feb2025.html` line ~6, change:
```html
<meta name="description" content="Some memories are worth killing for. A limited-run immersive crime thriller pop-up in Fremont, CA. December 4, 2025 - January 1, 2026.">
```

To:
```html
<meta name="description" content="Some memories are worth killing for. A limited-run immersive crime thriller pop-up in Fremont, CA. February 26 - April 5, 2025.">
```

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat: create feb2025.html preview page from index.html copy"
```

---

## Task 2: Update Hero Section CTAs

**Files:**
- Modify: `feb2025.html` (lines ~51-52)

**Step 1: Update primary CTA text**

Change line ~51 from:
```html
<a href="#submit-evidence" class="cta-primary">Initiate Memory Recovery</a>
```

To:
```html
<a href="#submit-evidence" class="cta-primary">Join the Party</a>
```

**Step 2: Update secondary CTA text**

Change line ~52 from:
```html
<a href="#faq" class="cta-primary">Get Answers Now</a>
```

To:
```html
<a href="#faq" class="cta-primary">Got Questions?</a>
```

**Step 3: Verify in browser**

Open `feb2025.html` in browser, check hero buttons display new text.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(hero): update CTAs to 'Join the Party' and 'Got Questions?'"
```

---

## Task 3: Update Urgency Bar (Case Status Bar)

**Files:**
- Modify: `feb2025.html` (lines ~62-73)

**Step 1: Update status text**

Change line ~67 from:
```html
<span class="preview-dates">STATUS: LIMITED ENGAGEMENT • ACCEPTING INVESTIGATORS</span>
```

To:
```html
<span class="preview-dates">STATUS: LIMITED ENGAGEMENT • CASE OPEN • BOOKING NOW</span>
```

**Step 2: Update dates and remove "Run Extended" message**

Change line ~69 from:
```html
<span class="main-run-line">Dec 4, 2025 - Jan 1, 2026 ($75/person) <span style="color: rgba(0, 204, 102, 0.7);">• Run Extended!</span></span>
```

To:
```html
<span class="main-run-line">Feb 26 - Apr 5, 2025 • $75/person</span>
```

**Step 3: Update urgency bar CTA**

Change line ~71 from:
```html
<a href="#submit-evidence" class="booking-cta">Claim Your Identity</a>
```

To:
```html
<a href="#submit-evidence" class="booking-cta">Let's Play!</a>
```

**Step 4: Verify in browser**

Open `feb2025.html`, check urgency bar shows new dates and CTA text.

**Step 5: Commit**

```bash
git add feb2025.html
git commit -m "feat(urgency-bar): update dates to Feb-Apr 2025, change CTA to 'Let's Play!'"
```

---

## Task 4: Find and Read Current Section Structure

**Files:**
- Read: `feb2025.html` (lines ~76-400)

**Step 1: Identify all major sections**

Search for `<section` tags and `<h2>` headings to map current structure:
- Fragmented Memories (line ~77)
- What Happened Last Night (need to find)
- The Investigation Begins (need to find)
- How You'll Find the Truth (need to find)
- The Evidence You'll Uncover (need to find)
- Who Would Create This? (need to find)
- FAQ (need to find)
- Booking Widget (line ~384)

**Step 2: Note line numbers for sections to delete**

Mark for deletion:
- "The Investigation Begins" section (entire section)
- "The Evidence You'll Uncover" section (entire section)

**Step 3: Note line numbers for sections to reorder**

Mark to swap:
- "What Happened Last Night" moves before "Fragmented Memories"

**Step 4: Document findings**

No commit - this is reconnaissance to understand structure before editing.

---

## Task 5: Reorder Sections - Move "What Happened Last Night" Before "Fragmented Memories"

**Files:**
- Modify: `feb2025.html` (narrative sections ~76-150)

**Step 1: Locate "What Happened Last Night" section**

Search for `<h2>What Happened Last Night</h2>` in feb2025.html (likely around line 103-120).

**Step 2: Cut entire "What Happened Last Night" section**

Copy the entire section from opening comment/tag through closing comment/tag.

**Step 3: Paste before "Fragmented Memories" section**

Insert the copied section immediately before the Fragmented Memories section (before line ~77).

**Step 4: Verify structure in browser**

Open feb2025.html, scroll through narrative - "What Happened Last Night" should now appear before "Fragmented Memories".

**Step 5: Commit**

```bash
git add feb2025.html
git commit -m "refactor(sections): move 'What Happened Last Night' before 'Fragmented Memories'"
```

---

## Task 6: Rewrite "What Happened Last Night" Section

**Files:**
- Modify: `feb2025.html` ("What Happened Last Night" section)

**Step 1: Replace section content with new copy**

Find the "What Happened Last Night" section and replace the content inside with:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: WHAT HAPPENED LAST NIGHT              -->
<!-- SAFE TO EDIT: Story setup, party description            -->
<!-- FIND WITH: Search for "WHAT HAPPENED" or "Marcus"       -->
<!-- ═══════════════════════════════════════════════════════ -->
<section id="what-happened" class="narrative fade-in-section">
    <div class="narrative-content">
        <h2>What Happened Last Night</h2>

        <div class="memory-block">
            Marcus Blackwood's underground party.
        </div>

        <div class="memory-block">
            NeurAI's CEO playing host to Silicon Valley's rising stars.
        </div>

        <div class="memory-block">
            The warehouse. The music. The deals made.
        </div>

        <div class="memory-block">
            <span class="corrupt">Marcus is dead.</span>
        </div>

        <div class="memory-block">
            Some friends are missing.
        </div>

        <div class="memory-block">
            Your memories were taken.
        </div>

        <div class="memory-block">
            And those memories are now up for sale.
        </div>
    </div>
</section>
<!-- END CONTENT SECTION: WHAT HAPPENED LAST NIGHT -->
```

**Step 2: Verify styling matches**

Open feb2025.html in browser, check that memory-block divs maintain existing styling.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): rewrite 'What Happened Last Night' with new PRD copy"
```

---

## Task 7: Rewrite "Fragmented Memories" Section

**Files:**
- Modify: `feb2025.html` ("Fragmented Memories" section)

**Step 1: Replace section content with new copy**

Find the "Fragmented Memories" section and replace the content with:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: FRAGMENTED MEMORIES                   -->
<!-- SAFE TO EDIT: Present situation, core mechanic          -->
<!-- FIND WITH: Search for "FRAGMENTED MEMORIES"             -->
<!-- ═══════════════════════════════════════════════════════ -->
<section id="narrative" class="narrative fade-in-section">
    <div class="narrative-content">
        <h2>Fragmented Memories</h2>

        <div class="memory-block">
            Now you're in a room of strangers.
        </div>

        <div class="memory-block">
            You are supposed to remember.
        </div>

        <div class="memory-block">
            They bought you time before the cops show up on the scene.
        </div>

        <div class="memory-block">
            They will take you away.
        </div>

        <div class="memory-block">
            You are a <span class="corrupt">SUSPECT</span> in Marcus' murder.
        </div>

        <div class="memory-block">
            An offer is made.
        </div>

        <div class="memory-block">
            Unlock and <span class="corrupt">BURY</span> those memories, and walk away with the profit.
        </div>

        <div class="memory-block">
            or
        </div>

        <div class="memory-block">
            <span class="corrupt">EXPOSE</span> those secrets as evidence and secure your alibi.
        </div>

        <div class="memory-block">
            The wrinkle is: you all must get your story straight before the time is up and you must run.
        </div>
    </div>
</section>
<!-- END CONTENT SECTION: FRAGMENTED MEMORIES -->
```

**Step 2: Verify in browser**

Check that noir styling (corrupt class, memory-blocks) displays correctly.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): rewrite 'Fragmented Memories' with BURY vs EXPOSE mechanic"
```

---

## Task 8: Add CSS for Testimonial Blocks

**Files:**
- Modify: `css/components.css`

**Step 1: Add testimonial styles to components.css**

Add to end of `css/components.css`:

```css
/* ═══════════════════════════════════════════════════════ */
/* Testimonials                                             */
/* ═══════════════════════════════════════════════════════ */

.testimonial {
    max-width: 800px;
    margin: 4rem auto;
    padding: 2rem 3rem;
    text-align: center;
    position: relative;
    border-left: 3px solid rgba(204, 0, 0, 0.5);
    background: rgba(0, 0, 0, 0.3);
}

.testimonial p {
    font-size: 1.2rem;
    line-height: 1.8;
    font-style: italic;
    color: rgba(255, 255, 255, 0.9);
    margin: 0;
    position: relative;
}

.testimonial p::before {
    content: '"';
    font-size: 3rem;
    color: rgba(204, 0, 0, 0.6);
    position: absolute;
    left: -2rem;
    top: -0.5rem;
    font-family: Georgia, serif;
}

.testimonial p::after {
    content: '"';
    font-size: 3rem;
    color: rgba(204, 0, 0, 0.6);
    position: absolute;
    right: -2rem;
    bottom: -1.5rem;
    font-family: Georgia, serif;
}

/* Responsive */
@media (max-width: 768px) {
    .testimonial {
        padding: 1.5rem 2rem;
        margin: 3rem 1rem;
    }

    .testimonial p {
        font-size: 1.1rem;
    }

    .testimonial p::before,
    .testimonial p::after {
        font-size: 2rem;
    }
}
```

**Step 2: Commit**

```bash
git add css/components.css
git commit -m "feat(css): add testimonial block styles for PRD testimonials"
```

---

## Task 9: Add New Section - "What exactly is 'About Last Night...'?"

**Files:**
- Modify: `feb2025.html` (insert after "Fragmented Memories")

**Step 1: Insert new section after "Fragmented Memories"**

Add immediately after the closing tag of Fragmented Memories section:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: WHAT EXACTLY IS THIS                  -->
<!-- SAFE TO EDIT: Category explanation, differentiation     -->
<!-- FIND WITH: Search for "What exactly" or "escape room"   -->
<!-- ═══════════════════════════════════════════════════════ -->
<section id="what-exactly-is-about-last-night" class="explanation-section fade-in-section" style="background: rgba(15, 15, 15, 0.95); padding: 4rem 2rem;">
    <div class="content-container" style="max-width: 900px; margin: 0 auto;">
        <h2 style="text-align: center; margin-bottom: 2rem; color: rgba(204, 0, 0, 0.9);">What exactly is 'About Last Night...'?</h2>

        <div style="font-size: 1.2rem; line-height: 1.8; color: rgba(255, 255, 255, 0.85);">
            <p>Think escape room meets murder mystery — but you're not solving for the "right" answer.</p>

            <p>Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.</p>

            <p>But here's the wrinkle: you don't have to share what you find.</p>

            <p>Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth — it is whatever your group decides to present when time runs out.</p>

            <p>This isn't Mafia. There's no hidden killer to catch, no bluffing about who you are. You all start not really knowing who you are. And as you discover more about yourself and others, you get to negotiate what everyone will <em>say</em> happened. Think Diplomacy, not Werewolf.</p>

            <p>You don't need to be an actor — there's no audience watching.<br>
            You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.</p>

            <p>You just need to decide: what kind of story you want to walk out of here with?</p>
        </div>
    </div>
</section>
<!-- END CONTENT SECTION: WHAT EXACTLY IS THIS -->
```

**Step 2: Verify in browser**

Check section displays with proper spacing and readability.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add 'What exactly is About Last Night' explanation section"
```

---

## Task 10: Add Testimonial #1

**Files:**
- Modify: `feb2025.html` (insert after "What exactly is..." section)

**Step 1: Insert testimonial block**

Add immediately after the "What exactly is..." section closing tag:

```html
<!-- Testimonial #1 -->
<div class="testimonial">
    <p>The setup is unique and interesting, and I really like the depth of story (even if we didn't find all of it) and the way the bits of story we found weaved into our own narrative.</p>
</div>
```

**Step 2: Verify styling in browser**

Check testimonial displays with quotation marks and proper styling.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add testimonial #1 after explanation section"
```

---

## Task 11: Delete "The Investigation Begins" Section

**Files:**
- Modify: `feb2025.html`

**Step 1: Search for "The Investigation Begins" section**

Find the section with `<h2>The Investigation Begins</h2>`.

**Step 2: Delete entire section**

Remove from opening comment marker through closing comment marker (including the section tag).

**Step 3: Verify in browser**

Scroll through page, confirm section no longer appears.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "refactor(content): remove deprecated 'The Investigation Begins' section"
```

---

## Task 12: Delete "The Evidence You'll Uncover" Section

**Files:**
- Modify: `feb2025.html`

**Step 1: Search for "The Evidence You'll Uncover" section**

Find the section with `<h2>The Evidence You'll Uncover</h2>`.

**Step 2: Delete entire section**

Remove from opening comment marker through closing comment marker.

**Step 3: Verify in browser**

Scroll through page, confirm section no longer appears.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "refactor(content): remove deprecated 'The Evidence You'll Uncover' section"
```

---

## Task 13: Add New Section - "How to Play"

**Files:**
- Modify: `feb2025.html` (insert after Testimonial #1)

**Step 1: Insert "How to Play" section**

Add after Testimonial #1:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: HOW TO PLAY                           -->
<!-- SAFE TO EDIT: Game mechanics, character info, flow      -->
<!-- FIND WITH: Search for "How to Play" or "2 hours"        -->
<!-- ═══════════════════════════════════════════════════════ -->
<section id="how-to-play" class="explanation-section fade-in-section" style="background: rgba(10, 10, 10, 0.98); padding: 4rem 2rem;">
    <div class="content-container" style="max-width: 900px; margin: 0 auto;">
        <h2 style="text-align: center; margin-bottom: 2rem; color: rgba(204, 0, 0, 0.9);">How to Play</h2>

        <div style="font-size: 1.3rem; text-align: center; margin-bottom: 3rem; color: rgba(255, 255, 255, 0.9); font-weight: 600;">
            2 hours. 5-20 players. 40+ puzzles. One story to get straight.
        </div>

        <div style="font-size: 1.2rem; line-height: 1.8; color: rgba(255, 255, 255, 0.85);">
            <h3 style="color: rgba(204, 0, 0, 0.8); margin-top: 2.5rem;">Your Character</h3>

            <p>You'll receive a character sheet — your name, some memory fragments you still recall, maybe the name of someone you remember knowing. You don't know everything about who you are yet. Neither does anyone else.</p>

            <p>This is your starting point. What you learn from here is up to you.</p>

            <h3 style="color: rgba(204, 0, 0, 0.8); margin-top: 2.5rem;">The Game</h3>

            <p>The warehouse that hosted last night's party is full of locked secrets. Puzzles guard memory tokens and physical evidence of what happened last night.</p>

            <p>Solve puzzles. Unlock memory tokens. Scan them to see what happened in that memory.</p>

            <p>Then decide: expose it, bury it, or trade it.</p>

            <p>That's the loop. But you're not alone in it. Others are unlocking memories too — about themselves, about you, about what really happened to Marcus. And the puzzles may need information only they have.</p>

            <p>What is found, what is shared, what is hidden... all of that is the game. Along with incentives offered by NPCs. Expose your alibi to the public, and you're off the hook. Bury the right secrets, and you may become the next face of NeurAI.</p>

            <p>The clock is always running. By the end, your group needs to agree on a story to tell when the cops arrive.</p>

            <h3 style="color: rgba(204, 0, 0, 0.8); margin-top: 2.5rem;">The Morning After</h3>

            <p>You leave, hopefully before the cops bust your unofficial investigation and take you in for questioning... But the story doesn't end.</p>

            <p>After the game you'll receive a final personalized report — an in-world blog post from Nova News, breaking down the story based on the choices your group made. The 'official' story, so to speak, that makes it to the public about your group and characters given the choices you make during your game session.</p>

            <p>Story bits you may have missed during your personal journey through the game arrive in your inbox in the form of an investigative report that is bespoke for each game session.</p>
        </div>
    </div>
</section>
<!-- END CONTENT SECTION: HOW TO PLAY -->
```

**Step 2: Verify in browser**

Check subsections display properly with h3 styling and paragraph spacing.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add 'How to Play' section with three subsections"
```

---

## Task 14: Add Testimonial #2

**Files:**
- Modify: `feb2025.html` (insert after "How to Play" section)

**Step 1: Insert testimonial block**

Add immediately after the "How to Play" section closing tag:

```html
<!-- Testimonial #2 -->
<div class="testimonial">
    <p>I really enjoyed finding my memories and role playing the character.</p>
</div>
```

**Step 2: Verify in browser**

Check testimonial displays correctly.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add testimonial #2 after How to Play section"
```

---

## Task 15: Add New Section - "Why We Made This"

**Files:**
- Modify: `feb2025.html` (insert after Testimonial #2, before "Who We Are")

**Step 1: Find "Who We Are" / "Who Would Create This?" section**

Search for the team bio section (likely has h2 with "Who" in it).

**Step 2: Insert "Why We Made This" section before team bios**

Add immediately before the team bio section:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE CONTENT: WHY WE MADE THIS                      -->
<!-- SAFE TO EDIT: Mission, indie artist voice, philosophy   -->
<!-- FIND WITH: Search for "Why We Made" or "indie artists"  -->
<!-- ═══════════════════════════════════════════════════════ -->
<section id="why-we-made-this" class="explanation-section fade-in-section" style="background: rgba(15, 15, 15, 0.95); padding: 4rem 2rem;">
    <div class="content-container" style="max-width: 900px; margin: 0 auto;">
        <h2 style="text-align: center; margin-bottom: 2rem; color: rgba(204, 0, 0, 0.9);">Why We Made This</h2>

        <div style="font-size: 1.2rem; line-height: 1.8; color: rgba(255, 255, 255, 0.85);">
            <p>We wanted to build something that explores the boundaries of what is possible.</p>

            <p>We wanted to combine our favorite elements from escape rooms, immersive experiences, and tabletop gaming. And most of all, in an age when our personal information and ability to connect are getting increasingly commoditized, we wanted to create a social experience where we can all collectively explore some very-real-sh*t(tm) through the lens of fiction.</p>

            <p>And we wanted to make it accessible to all of our friends, without asking them to be actors, puzzle savants, or social butterflies.</p>

            <p>This project is made by a small team of independent artists trying to create something weird and interesting while paying the performers and facilitators equitably to make it possible to run our weird game in the first place. We're two people who've spent years in escape rooms, immersive theater, and game design, using our personal resources to combine things that 'aren't supposed to go together'.</p>

            <p>It's ambitious. It's DIY. And it is constantly evolving.</p>

            <p>Every run we learn something to make it better.</p>

            <p>If that sounds like your kind of weird, let's tell a story about last night together.</p>
        </div>
    </div>
</section>
<!-- END CONTENT SECTION: WHY WE MADE THIS -->
```

**Step 3: Verify in browser**

Check section displays with proper styling and spacing.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add 'Why We Made This' indie artist voice section"
```

---

## Task 16: Update "Who We Are" Section - Add Casey Selden Bio

**Files:**
- Modify: `feb2025.html` ("Who We Are" / team bio section)

**Step 1: Find the team bio section**

Search for Shuai Chen and Bora "Max" Koknar bios.

**Step 2: Add Casey Selden bio after Max's bio**

Insert after Max's bio and before Off the Couch Games section:

```html
<h3>Casey Selden</h3>
<p style="font-style: italic; color: rgba(204, 0, 0, 0.7); margin-bottom: 1rem;">Experience Designer & Performer | Palace Games, Odd Salon</p>
<p>Selden has guided 10,000+ guests through immersive experiences over a decade—from renegade museum tours designed for skeptics to The Racket, a Film Noir team-building game built on blackmarket deals and devious exchanges. One of Odd Salon's most frequent speakers, they have researched and performed 20+ original lectures on the oddest corners of history and science. For About Last Night..., Selden brings expertise in making strangers comfortable doing uncomfortable things together.</p>
```

**Step 3: Update section heading if needed**

If section heading says "Who Would Create This?" change to "Who We Are".

**Step 4: Verify in browser**

Check all three bios display with consistent formatting.

**Step 5: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add Casey Selden bio to Who We Are section"
```

---

## Task 17: Update FAQ Question #1 - "What exactly is this experience?"

**Files:**
- Modify: `feb2025.html` (FAQ section)

**Step 1: Find FAQ section and first question**

Search for `<h3>What exactly is this experience?</h3>` or similar.

**Step 2: Replace answer with shortened version + link**

Replace the full explanation paragraph with:

```html
<p>Short version: an immersive crime thriller where you play a suspect with missing memories. Solve puzzles, uncover secrets, decide what to bury or expose. <a href="#what-exactly-is-about-last-night" style="color: rgba(204, 0, 0, 0.9); text-decoration: underline;">Read the full breakdown above.</a></p>
```

**Step 3: Verify link works**

Click the link in browser, confirm it scrolls to the "What exactly is..." section.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(faq): shorten 'What exactly is this' with link to full section"
```

---

## Task 18: Update FAQ Question #2 - "How many people do I need?"

**Files:**
- Modify: `feb2025.html` (FAQ section)

**Step 1: Find the "How many people" question**

Search for text about "Minimum 5 players, maximum 20".

**Step 2: Add "sweet spot" paragraph**

Replace existing answer with:

```html
<p>Minimum 5 players, maximum 20.</p>

<p><strong>What's the sweet spot?</strong> The game scales well across the range, but 10-16 players tends to hit the best balance of social complexity and puzzle coverage. Smaller groups (5-8) feel more intimate and collaborative. Larger groups (16-20) get more chaotic negotiation and competing agendas.</p>

<p>Don't have a full group? You'll be paired with others – and trust us, playing with strangers adds to the tension and strategy.</p>
```

**Step 3: Verify in browser**

Check formatting and readability.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(faq): add optimal group size explanation to 'How many people' FAQ"
```

---

## Task 19: Update FAQ Question #3 - "How long does it take?"

**Files:**
- Modify: `feb2025.html` (FAQ section)

**Step 1: Find the duration question**

Search for text about "2 hours" and "on-boarding".

**Step 2: Replace with simplified answer**

Replace existing answer with:

```html
<p>Plan for 2 hours total, including orientation and gameplay.</p>
```

**Step 3: Verify in browser**

Check simplified text displays correctly.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(faq): simplify 'How long does it take' answer to 2 hours total"
```

---

## Task 20: Update FAQ Question #4 - "Too Pricy? (NOTAFLOF)"

**Files:**
- Modify: `feb2025.html` (FAQ section)

**Step 1: Find the NOTAFLOF question**

Search for "NOTAFLOF" or "Too Pricy".

**Step 2: Replace with self-service discount codes**

Replace existing answer with:

```html
<p><strong>NOTAFLOF</strong></p>

<p>We set the ticket price for About Last Night... to reflect the costs of running an experience with actors in the SF Bay Area. However, we hate that puzzle games and immersive experiences are typically only accessible to the privileged. If you're interested in experiencing About Last Night... but the price is too prohibitive for you, please feel free to use one of these promo codes to make the experience accessible to you:</p>

<p><strong>ALNDiscount25</strong>: 25% off tickets<br>
<strong>ALNDiscount50</strong>: 50% off tickets<br>
<strong>ALNDiscount75</strong>: 75% off tickets</p>

<p>(We make all of these discount levels available and trust our players to choose based on their level of need)</p>
```

**Step 3: Verify in browser**

Check discount codes display clearly with proper formatting.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(faq): replace email request with self-service discount codes in NOTAFLOF"
```

---

## Task 21: Update FAQ Question #5 - "When and where?"

**Files:**
- Modify: `feb2025.html` (FAQ section)

**Step 1: Find the location/dates question**

Search for "Off the Couch Games" and "Fremont" in FAQ.

**Step 2: Update dates and remove "Extended" message**

Replace existing answer with:

```html
<p>This is a limited-run pop-up experience.</p>

<p>Off the Couch Games in Fremont, CA<br>
555 Mowry Avenue, Fremont, CA 94536<br>
Feb 26 - Apr 5, 2025<br>
Thursday-Sunday performances, multiple time slots<br>
Contact us for weekday bookings at <a href="mailto:hello@patchworkadventures.com">hello@patchworkadventures.com</a></p>
```

**Step 3: Verify in browser**

Check dates and formatting display correctly.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(faq): update 'When and where' with Feb-Apr 2025 dates"
```

---

## Task 22: Add Testimonial #3 Before Booking Widget

**Files:**
- Modify: `feb2025.html` (insert before booking widget section)

**Step 1: Find booking widget section**

Search for `id="submit-evidence"` or "NEURAI INC."

**Step 2: Insert testimonial before booking section**

Add immediately before the `<section id="submit-evidence"` tag:

```html
<!-- Testimonial #3 -->
<div class="testimonial">
    <p>My group and I were amazed by the amount of work that went into creating the room and all of its moving parts—we're still talking about it!</p>
</div>
```

**Step 3: Verify in browser**

Check testimonial appears right before booking widget.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "feat(content): add testimonial #3 before booking widget"
```

---

## Task 23: Update Booking Widget Text

**Files:**
- Modify: `feb2025.html` (booking widget section lines ~390-395)

**Step 1: Update urgency message**

Find line ~395 with:
```html
<p class="system-note" style="margin-bottom: 3rem;">
    Time slots are limited • Memory corruption is irreversible • Case sessions fill rapidly
</p>
```

Change to:
```html
<p class="system-note" style="margin-bottom: 3rem;">
    Time slots are limited • Authorities have been ALERTED • Case sessions fill rapidly
</p>
```

**Step 2: Verify in browser**

Check updated urgency text displays above the booking iframe.

**Step 3: Commit**

```bash
git add feb2025.html
git commit -m "feat(booking): update urgency message to 'Authorities have been ALERTED'"
```

---

## Task 24: Remove Remaining Old CTAs

**Files:**
- Modify: `feb2025.html` (various sections)

**Step 1: Search for old CTA text**

Search for remaining instances of:
- "Learn What You Did"
- "See How To Solve This"
- "I Need To Remember"
- "Begin Memory Recovery"

**Step 2: Remove or update these CTAs**

- If CTA is in a deleted section, already removed
- If CTA appears elsewhere, remove the button/link or update text to "Join the Party"

**Step 3: Verify in browser**

Scroll through entire page, confirm no old CTA text remains.

**Step 4: Commit**

```bash
git add feb2025.html
git commit -m "refactor(ctas): remove deprecated CTA buttons from old sections"
```

---

## Task 25: Final Review and Testing

**Files:**
- Review: `feb2025.html`
- Review: `css/components.css`

**Step 1: Full page scroll-through**

Open feb2025.html in browser, scroll from top to bottom:
- Hero with new CTAs ✓
- Urgency bar with Feb-Apr dates ✓
- What Happened Last Night (before Fragmented) ✓
- Fragmented Memories (BURY vs EXPOSE) ✓
- What exactly is... ✓
- Testimonial #1 ✓
- How to Play ✓
- Testimonial #2 ✓
- Why We Made This ✓
- Who We Are (3 bios including Casey) ✓
- FAQ (5 updated questions) ✓
- Testimonial #3 ✓
- Booking widget ✓

**Step 2: Check all internal links work**

- Hero "Got Questions?" → scrolls to FAQ ✓
- Hero "Join the Party" → scrolls to booking ✓
- FAQ anchor link → scrolls to "What exactly is..." ✓
- Urgency bar "Let's Play!" → scrolls to booking ✓

**Step 3: Verify responsive design**

Resize browser to mobile width, check:
- Testimonials display properly ✓
- New sections are readable ✓
- No horizontal scroll ✓

**Step 4: Check for PRD completeness**

Review `docs/plans/aln-website-prd-feb2025.md` line by line:
- All P0 items completed ✓
- All P1 items completed ✓
- All section changes applied ✓
- All CTA updates applied ✓
- All FAQ updates applied ✓

**Step 5: Document completion**

No commit - this is validation step.

---

## Task 26: Deployment Preparation

**Files:**
- Verify: `feb2025.html`
- Verify: `css/components.css`

**Step 1: Test form submission still works**

Open feb2025.html, scroll to booking widget, verify iframe loads correctly.

**Step 2: Test analytics still fires**

Check browser console for Google Analytics events on page load.

**Step 3: Check for console errors**

Open browser DevTools console, verify no JavaScript errors.

**Step 4: Final commit if needed**

If any minor fixes applied during testing:
```bash
git add feb2025.html css/components.css
git commit -m "chore: final polish and testing for feb2025 preview page"
```

**Step 5: Push to GitHub Pages**

```bash
git push origin main
```

Wait 1-2 minutes for GitHub Pages deployment.

**Step 6: Verify live site**

Visit https://aboutlastnightgame.com/feb2025.html and verify:
- Page loads correctly
- All sections display
- Testimonials styled properly
- Forms/iframe work
- No broken links

---

## Success Criteria

**Content:**
- ✅ All 13 sections match PRD ordering
- ✅ 3 new sections added with exact copy
- ✅ 2 deprecated sections removed
- ✅ 3 testimonials placed strategically
- ✅ Casey Selden bio included
- ✅ 5 FAQ items updated
- ✅ All CTAs updated to new text

**Technical:**
- ✅ feb2025.html accessible at /feb2025.html
- ✅ Existing CSS extended with testimonial styles
- ✅ All JavaScript functionality preserved
- ✅ Forms/booking widget still functional
- ✅ No console errors
- ✅ Responsive design maintained
- ✅ Comment markers preserved for content editors

**Deployment:**
- ✅ Live on GitHub Pages
- ✅ Shareable preview URL for stakeholders
- ✅ Main index.html untouched (still serving Dec-Jan version)

---

## Post-Implementation: Promotion to Main

**When stakeholders approve feb2025.html:**

```bash
# Backup current index.html
cp index.html index-backup-jan2025.html
git add index-backup-jan2025.html
git commit -m "backup: save Jan 2025 version before replacing with Feb 2025"

# Replace with new version
cp feb2025.html index.html
git add index.html
git commit -m "feat: promote Feb 2025 content to main landing page"
git push origin main
```

Wait 1-2 minutes, then verify https://aboutlastnightgame.com shows new content.
