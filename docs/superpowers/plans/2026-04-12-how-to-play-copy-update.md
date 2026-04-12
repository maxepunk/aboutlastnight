# How to Play Page Copy Update — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update how-to-play.html copy to reflect current game mechanics while preserving atmospheric marketing voice.

**Architecture:** Single-file HTML copy edit. No new files, no CSS/JS changes. All edits are to `how-to-play.html` content within existing section structure, plus one new section insertion.

**Tech Stack:** HTML5 (static, no build process)

**Spec:** `docs/superpowers/specs/2026-04-12-how-to-play-copy-update-design.md`

---

### Task 1: Update "Meet Your Character" Copy

**Files:**
- Modify: `how-to-play.html:53-57`

- [ ] **Step 1: Update character sheet description**

Replace the current paragraph:

```html
<p>You'll receive a character sheet — your name, some memory fragments you still recall, maybe the name of someone you remember knowing. You don't know everything about who you are yet. Neither does anyone else.</p>
```

With:

```html
<p>You'll receive a character sheet — your identity, your relationships, and your personal stakes. You don't know everything about who you are yet. Neither does anyone else.</p>
```

The second paragraph ("This is your starting point. What you learn from here is up to you.") stays unchanged.

- [ ] **Step 2: Verify in browser**

Open `how-to-play.html` in browser, confirm "Meet Your Character" section reads correctly and scroll-reveal animation still fires.

- [ ] **Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): update character sheet description to match current game design"
```

---

### Task 2: Update Gameplay Steps Copy

**Files:**
- Modify: `how-to-play.html:68-72`

- [ ] **Step 1: Update the three game-step paragraphs**

Replace:

```html
<p class="game-step"><strong>Unlock Memories</strong> — Marcus' 'lockdown protocol' has left evidence locked up around the warehouse. Puzzle out how to get past the locks.</p>

<p class="game-step"><strong>Scan Their Contents</strong> — Read the contents of the extracted memories using one of Marcus' memory display scanner prototypes.</p>

<p class="game-step"><strong>Decide Their Fate</strong> — Memory tokens are your currency. Once you know their contents, you get to decide what to do:</p>
```

With:

```html
<p class="game-step"><strong>Unlock</strong> — Marcus's lockdown protocol has left extracted memories and evidence scattered throughout the warehouse, secured behind locks and puzzles. Work through his security measures to access memory tokens.</p>

<p class="game-step"><strong>Scan</strong> — Read token contents using one of Marcus's memory display scanner prototypes.</p>

<p class="game-step"><strong>Decide</strong> — After scanning a token to read its contents, choose what happens to each memory you recover:</p>
```

- [ ] **Step 2: Verify in browser**

Confirm the three steps display correctly with the `game-step` styling intact.

- [ ] **Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): tighten gameplay step descriptions to match current mechanics"
```

---

### Task 3: Replace Action Cards (NEGOTIATE removed, reorder to TRADE/EXPOSE/BURY)

**Files:**
- Modify: `how-to-play.html:74-101`

- [ ] **Step 1: Replace the four-card faq-grid with three cards in new order**

Replace the entire `faq-grid` div (from `<div class="faq-grid"` through its closing `</div>` on line 101):

```html
        <div class="faq-grid" style="margin: 2rem 0;">
            <div class="faq-item">
                <h3 class="faq-question">TRADE</h3>
                <div class="faq-answer">
                    <p>Negotiate directly with other players. Give, swap, leverage, or return a memory to its rightful owner.</p>
                </div>
            </div>

            <div class="faq-item">
                <h3 class="faq-question">EXPOSE</h3>
                <div class="faq-answer">
                    <p>Turn the memory in as evidence. Its summary is posted to the Evidence Board for all to see. Exposed memories can be cited in the group's final statement.</p>
                </div>
            </div>

            <div class="faq-item">
                <h3 class="faq-question">BURY</h3>
                <div class="faq-answer">
                    <p>Sell the memory to be permanently erased. Its contents are gone forever — no one can reference them again. Payment is deposited to the account of your choosing:</p>
                    <p><em>Shell account</em> — a name you choose. Anonymous. Can be shared by multiple individuals.<br>
                    <em>Personal account</em> — your name. Traceable to you.</p>
                    <p>The more sensitive the information, the more valuable it is to NeurAI's board of directors to have it disappeared.</p>
                </div>
            </div>
        </div>
```

- [ ] **Step 2: Verify in browser**

Confirm three cards display in correct order (TRADE, EXPOSE, BURY). Verify the BURY card's multi-paragraph content renders cleanly within the faq-item styling. Check that the old NEGOTIATE card is gone.

- [ ] **Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): reorder action cards to TRADE/EXPOSE/BURY, remove NEGOTIATE"
```

---

### Task 4: Update Connective Copy (remove redundant line, keep atmosphere)

**Files:**
- Modify: `how-to-play.html:105-113` (line numbers approximate after Task 3 edits)

- [ ] **Step 1: Remove the "Want Justice?" line**

Find and remove this line:

```html
            <p>Want Justice? Profit? Secrecy? The choice is yours–but the group must get their story straight before the cops arrive.</p>
```

This is now redundant with the Group Statement section added in Task 5. All other connective copy stays:
- "That's the loop. But you're not alone in it."
- "Others are unlocking memories too..."
- "What is found, what is shared, what is hidden... all of that is the game."
- "The clock is always running."

- [ ] **Step 2: Verify in browser**

Confirm the connective copy flows naturally from the action cards into "The clock is always running" without the removed line.

- [ ] **Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): remove 'Want Justice?' line, now covered by Group Statement section"
```

---

### Task 5: Add "The Group Statement" Section

**Files:**
- Modify: `how-to-play.html` — insert new section between "The Game" section's closing `</section>` and the "The Morning After" section-divider.

- [ ] **Step 1: Insert new section**

After the closing `</section>` of "The Game" section and its `<div class="section-divider"></div>`, insert:

```html
    <div class="section-divider"></div>

    <!-- Section 3: The Group Statement -->
    <section class="explanation-section fade-in-section" style="background: linear-gradient(rgba(10, 10, 10, 0.90), rgba(10, 10, 10, 0.93)), url('images/ALN-marcusisdead.jpg') center/cover fixed;">
        <div class="content-container">
            <h2 class="section-header">The Group Statement</h2>

            <p>Two displays are updated throughout the night and visible to all:</p>

            <p><strong>Evidence Board</strong> — summaries of every exposed memory.<br>
            <strong>Account Ledger</strong> — all account names and their current balances.</p>

            <p>When the recovery window closes, transactions end. <span class="corrupt">The police are on their way.</span> The group must agree on one witness statement before they break through.</p>

            <p>Only memories on the Evidence Board can be cited as evidence. Buried memories are gone. Not every exposed memory needs to appear in the statement — the group decides which evidence to cite, and which to leave out.</p>

            <p>Your character has personal reasons for wanting certain memories exposed or buried. But the witness statement is collective — the version of events everyone agrees to stand behind.</p>

            <p><span class="corrupt">Find a story you can all live with before time runs out.</span></p>
        </div>
    </section>
```

Note: This uses `ALN-marcusisdead.jpg` as the background (different from the adjacent sections to maintain visual variety). The existing "The Morning After" section (now Section 4) keeps its `ALN-noirdrugwall.jpg` background.

- [ ] **Step 2: Verify section numbering in comments**

Update the HTML comments for the sections that follow. "The Morning After" should now be `<!-- Section 4: The Morning After -->` (was Section 3).

- [ ] **Step 3: Verify in browser**

Confirm:
- New section appears between "The Game" and "The Morning After"
- Scroll-reveal animation fires on scroll
- Background image renders with parallax
- `corrupt` span styling applies to "The police are on their way" and the closing line
- Section dividers appear correctly above and below

- [ ] **Step 4: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): add Group Statement section with endgame mechanics"
```

---

### Task 6: Update "The Morning After" Copy

**Files:**
- Modify: `how-to-play.html` — the final content section (now Section 4 after Task 5 insertion)

- [ ] **Step 1: Update the section copy**

Replace the current two paragraphs:

```html
            <p>You leave, hopefully before the cops bust your unofficial investigation and take you in for questioning... But the story doesn't end.</p>

            <p>After the game, you'll receive a personalized Nova News report showing how your choices shaped the official story. You'll also catch narrative pieces you may have missed during your session.</p>
```

With:

```html
            <p>You leave, hopefully before the cops bust your unofficial investigation and take you in for questioning... But the story doesn't end.</p>

            <p>After the game, you'll receive a personalized investigative report on the <em>Nova News</em> blog — showing how your choices shaped the official story. You'll catch pieces of the narrative you may have missed during your session. The link will be emailed to you after the game.</p>
```

- [ ] **Step 2: Verify in browser**

Confirm the updated copy reads naturally and "Nova News" is italicized.

- [ ] **Step 3: Commit**

```bash
git add how-to-play.html
git commit -m "copy(how-to-play): update Morning After with Nova News blog details"
```

---

### Task 7: Final Review

- [ ] **Step 1: Full page read-through in browser**

Open `how-to-play.html` and scroll through the entire page. Verify:
- All five content sections flow naturally (Character → Game → Group Statement → Morning After)
- Scroll-reveal animations fire for each section
- Background images are visually distinct between adjacent sections
- No orphaned references to NEGOTIATE
- Action cards display as three cards (TRADE, EXPOSE, BURY)
- Atmospheric copy preserved throughout
- Footer unchanged

- [ ] **Step 2: Mobile check**

Resize browser to mobile width (~375px). Verify:
- All sections stack correctly
- Action cards are readable
- New Group Statement section doesn't break layout
- Text is legible, no overflow

- [ ] **Step 3: Final commit (if any cleanup needed)**

If any spacing/whitespace cleanup is needed from the edits, commit it:

```bash
git add how-to-play.html
git commit -m "chore(how-to-play): clean up whitespace after copy update"
```
