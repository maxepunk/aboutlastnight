# Press Page Update: New Release + Second Extension

**Date:** 2026-04-06
**Status:** Approved
**Scope:** `press.html` only

## Context

`press.html` has been stale since the March 2026 extension (it still references the original `February 26 - April 5, 2026` closing). The show has since been extended a second time, now running through **May 31, 2026** with a revised weekly schedule (**Fridays & Saturdays 8pm, Sundays 7pm**).

In parallel, a new press release has been authored with a fundamentally different framing than the one currently on the page. The old release (headline: *"Award-Winning Bay Area Designers Return with 'Playable Crime Thriller'"*) was a traditional announcement built around the creator team and the December 2025 initial run. The new release (headline: *"Who Gets to Decide What Happened?"*) leads with a philosophical hook about AI, data commodification, and the post-game AI-assembled report, and is better suited to the show's current identity and the press coverage it has received.

This update replaces the old press release entirely with the new one, reconciles all remaining stale dates, aligns the "About the Production" boilerplate with the new release's framing, and refreshes photo credit year-range strings.

## Non-Goals / Out of Scope

- **No structural/layout changes** to press.html. Same sections in the same order, same CSS classes, same comment markers.
- **No new sections.** (Considered: adding a press quotes sidebar pulling from the SF Chronicle and Tri-City Voice reviews that are already on index.html. Deferred — not in scope for this update.)
- **No CSS changes.** Every element maps to existing classes (`.release-date`, `.release-contact-top`, `.release-headline`, `.release-subhead`, `h4`, `.release-details`, `.release-end`).
- **No photo additions or removals.** Only the credit line text is touched.
- **No changes to index.html, playtest.html, feedback.html, or how-to-play.html.**
- **No archival of the old release.** User confirmed full replacement; the old release text is lost from the page (git history preserves it).

## Changes Overview

### 1. Key Facts Grid — Run Dates

**File:** `press.html` (line ~66)

**Current:**
```html
<div class="fact-item">
    <span class="fact-label">Run Dates</span>
    <span class="fact-value">February 26 - April 5, 2026</span>
</div>
```

**Updated:**
```html
<div class="fact-item">
    <span class="fact-label">Run Dates</span>
    <span class="fact-value">February 26 - May 31, 2026</span>
</div>
```

All other fact items (Production, Tagline, Location, Runtime, Capacity, Price, Website) remain unchanged.

### 2. Photo Gallery — Credit Lines

**File:** `press.html` (12 occurrences across `.press-photo` blocks, lines ~117 through ~230)

**Current (repeated 12×):**
```
About Last Night... | StoryPunk x Patchwork Adventures | Feb-Apr 2026
```

**Updated (repeated 12×):**
```
About Last Night... | StoryPunk x Patchwork Adventures | Feb-May 2026
```

Mechanical find-and-replace. No other changes to the photo gallery (same 12 photos, same alt text, same captions, same download links).

### 3. Press Release — Full Replacement

**File:** `press.html` (the entire `<article class="release-content">` block inside `<section class="press-release">`, lines ~252 through ~325)

The old release article contents are fully replaced. The new article uses existing CSS classes with a clean 1:1 mapping:

| Element | Class / Tag |
|---|---|
| "FOR IMMEDIATE RELEASE" | `<p class="release-date">` |
| Contact block | `<p class="release-contact-top">` |
| "Who Gets to Decide What Happened?" | `<h3 class="release-headline">` |
| "A Fremont thriller where..." (subhead) | `<p class="release-subhead">` |
| Section headings ("Silicon Valley is at an inflection point", etc.) | `<h4>` |
| Production Details block | `<p class="release-details">` |
| "###" end marker | `<p class="release-end">` |

**Edits applied to the source release text (from user's message) before it lands in HTML:**

1. **Dateline added.** Opening paragraph under the first h4 begins with `<strong>FREMONT, CA (April 2026)</strong> &mdash;` per traditional press release convention. (User approved adding this — the source text did not include a dateline.)

2. **"Immie" → "IMMY"** (one occurrence, in the opening paragraph about the creators). This resolves an internal inconsistency with the creator bio section further down in the same release, which already says "2024 IMMY Award." (User approved silent correction.)

3. **"through April" → "through May"** (one occurrence, in the body paragraph that names the creators and the venue).

4. **Production Details dates line:** `February 26 – end of April 2026` → `February 26 – May 31, 2026`.

5. **Production Details schedule line:** `Thursday–Sunday, multiple time slots` → `Fridays & Saturdays at 8pm, Sundays at 7pm`.

6. **Section heading normalization.** The source release used ALL-CAPS for "PRODUCTION DETAILS", "ABOUT THE CREATORS", and "PRESS RESOURCES" but Title Case for earlier headings. Normalize all h4s to Title Case so they render consistently against the existing `h4` styling: "Production Details", "About the Creators", "Press Resources".

**No other edits to the release body.** Creator bios, all quoted passages from Koknar, the "$1.71 million in evidence suppressed" anecdote, the post-game report discussion, and the closing reflection all pass through as-written.

#### Full text of the updated release (reference)

> **FOR IMMEDIATE RELEASE**
>
> **Contact:**
> Bora "Max" Koknar
> aboutlastnightgame@gmail.com
> Website: aboutlastnightgame.com
>
> **Who Gets to Decide What Happened?**
> *A Fremont thriller where your memories have been stolen, turned into currency — and every choice about what to do with someone's most private data is yours to make*
>
> **Silicon Valley is at an inflection point**
>
> **FREMONT, CA (April 2026)** — Artificial Intelligence has grown leaps and bounds in the past three years. The commodification of personal data and your memories is no longer theoretical. Tech startups are probing fearlessly into every aspect of being human with the question of "could we do it?" leading their inquiries rather than the more important "should we be doing this?"
>
> **A game. A commentary on the Silicon Valley Dystopia.**
>
> *About Last Night...* is a two-hour immersive game for 5-20 players. You're a Silicon Valley insider — someone who has built, funded, or profited from a tech CEO's data empire. He's dead. Your memories of the previous night have been extracted and turned into commodities. Turns out that Marcus and his startup have been asking questions and testing things that are…unethical. Every memory you recover belongs to someone — it's their private truth, their secret, their vulnerability. And what you choose to do with it is between you and whatever version of yourself shows up in that room. The group needs to construct an official story. But in a room where everyone has something to hide, the truth is whatever survives the negotiation. Created by IMMY and Golden Lock Award winner Shuai Chen (Patchwork Adventures), Bora "Max" Koknar (StoryPunk), and Casey Selden, the production extends at Off the Couch Games in Fremont through May after earning an SF Chronicle Datebook Pick.
>
> **What Happens When You Let People Decide**
>
> The game has no fixed ending. What it has is a system: recovered memories that can be exposed to the group, buried through a black market broker for personal gain, or returned to the person they belong to. Puzzles gate what evidence surfaces at all. Different players crack different locks, follow different threads, and some crucial truths may never emerge because no one solved the puzzle protecting them. Time runs out. The group has to agree on an official story built from whatever evidence survived a two-hour collision of individual choices, competing agendas, and the fundamental problem of trust in a room full of people who know things they can't prove.
>
> Players have to choose between preserving someone's privacy and bolstering their own knowledge, power, and finances. The moral questions aren't abstract. They're tactile, social, and visible to everyone in the room. Players physically carry each memory token to the black market broker, to the investigative reporter, or back to its owner.
>
> What emerges from this system has been different every time. Some groups self-organize into coordinated investigations, pooling evidence and building a shared narrative. Others fragment into competing agendas until the room has to pull together something everyone can live with despite their different agendas. In one session, two camps formed and genuinely debated — one pushing for the obvious suspect, the other insisting on the people with the most institutional power to suppress the truth. The room fought. Power lost. In another, the group presented a united front while individuals quietly cut deals with the black market broker. Ten people said they were working together. The equivalent of $1.71 million in evidence was suppressed to make sure the most comfortable story was the only one left to tell.
>
> Same evidence. Same choices available. One room fought for accountability. Another purchased consensus.
>
> "We're not here to answer these questions for anyone. We don't know the answers. But we're making work in Silicon Valley, and we can see the window closing. If people don't engage with these questions now, the decisions get made by the people with the most money and the most to gain. That's the urgency." says Koknar, the narrative designer of the piece.
>
> **The Design and the Contradiction**
>
> And here's the wrinkle. Building the systems behind this: the scanners, the room automation, the game server, would have been out of reach for a three-person indie team a few years ago. What changed is the same thing the game is questioning. Generative AI coding tools enable the team to design and build bespoke hardware and software that would have otherwise required a significantly larger team and budget. The tools the game critiques are the tools that made the game possible.
>
> That tension reaches its sharpest expression in the post-game report. After every session, a unique article is generated in the voice of the investigative reporter players interacted with throughout their session — assembled from the specific evidence each group exposed and buried, the alliances they formed, the story they constructed. Every piece of source material the system draws from was written by people: the memory tokens, the evidence documents, the scripts that define the NPC characters' voices. A human game master writes up a report after each session with observations about player behavior and choices throughout the game session. Then, the system built from deterministic code and generative AI assembles those human-authored elements into a coherent narrative. Without this system, each report would take a day or more of writing — not feasible for a small team running multiple sessions a week. And the report is where the game's larger questions connect to each group's specific choices. It's the final act — the moment where the fiction reflects back what the room actually did.
>
> The creators are open about the contradiction. They're using tools built on the extractive logic the game critiques to realize an artistic vision that couldn't exist without those very tools. They aren't offering a resolution. They're working inside the tension, deliberately, as artists exercising agency over the technology that is being monetized with a mandate to make artists unnecessary.
>
> "The binary, embrace everything or reject everything, is a trap," says Koknar. "The game asks players to make choices with no clean answers. We're making the same kind of choices every day building it."
>
> Every session ends the same way. The group constructs their official story. The room clears. And then the report arrives, a complete, coherent, 'authoritative' account of what happened, curated and assembled from fragments no single player experienced in full. You read it and you recognize the broad strokes. But you also know what it missed. You know what you buried. You know the private truth you returned to someone without reading. You see the gaps where you know someone else buried a truth you were chasing. The distance between what you lived and what the story says is the distance most people can't see in their daily lives but feel permeating their entire world. The disconnect between what you know to be true from your own experience and the reality being constructed around you through feeds and algorithms and official accounts by systems most of us never asked for and don't fully understand.
>
> *About Last Night...* doesn't close that gap. It tries to make it tangible. For two hours, you're inside the machine — making choices, burying evidence, negotiating truth. Then you read what the machine made from your choices, and that disconnect between what you lived and what got delivered as the accepted truth becomes something you are more easily able to talk about.
>
> **Production Details**
>
> **Title:** About Last Night...
> **Venue:** Off the Couch Games, 555 Mowry Ave, Fremont, CA 94536
> **Dates:** February 26 – May 31, 2026
> **Schedule:** Fridays & Saturdays at 8pm, Sundays at 7pm
> **Duration:** 2 hours
> **Capacity:** 5–20 players per performance
> Recommended 16+. Accessibility and content information at aboutlastnightgame.com.
> **Tickets:** $75/person (need-based discounts available)
> **Info:** aboutlastnightgame.com
> **Press Contact:** aboutlastnightgame@gmail.com
>
> **About the Creators**
>
> **Shuai Chen** is founder of Patchwork Adventures. Her *Order of the Golden Scribe: Initiation Tea* won the 2023 Golden Lock Award, No Proscenium's Best Immersive Experience Award, and the 2024 IMMY Award for Outstanding Immersive Work. She represented Team USA at the Escape Room World Championships. Her background in neurobiology (MIT, Stanford) informs experiences where memory, perception, and reality blur.
>
> **Bora "Max" Koknar** is founder of StoryPunk, a creative studio specializing in immersive storytelling. He received the 2022 CALI Catalyst Award for equity-centered practice. His work includes *The Super Secret Society: A Playable Play* (featured by SF Chronicle) and *Shoggoths on the Veldt* ("Whatever it is, 'Shoggoths' is must-see theater" — Mercury News). During the pandemic, he produced over 450 digital events employing 200+ artists. He previously served as Co-Artistic Director at Dragon Productions Theatre Company (2019-2021) and Associate Artistic Director at Epic Immersive (2015-2019).
>
> **Casey Selden** has guided 10,000+ guests through immersive experiences in the Bay Area, from renegade museum tours to a film noir team-building game built on black market deals and murder. One of Odd Salon's most frequent speakers, she has researched and performed 20+ original lectures on history and science.
>
> **Off the Couch Games** is Fremont's premier escape room venue, partnering to host this fusion of escape room mechanics and immersive theater.
>
> **Press Resources**
>
> High-resolution photos available at: aboutlastnightgame.com/press
> Press tickets available upon request
> Interviews available with all three creators
>
> ###

### 4. About the Production — Boilerplate Replacement

**File:** `press.html` (lines ~344-346, the two `<p>` elements inside `.about-content`)

**Current:**
```html
<p><strong>About Last Night...</strong> is a 90-minute immersive crime thriller combining escape room puzzles, roleplay, social deduction, and strategic trading mechanics. Set in a near-future Silicon Valley where memories can be extracted and traded, players embody party-goers who wake up in a warehouse after a party with fragmented memories and a missing host.</p>

<p>Players discover their memories have been locked up in physical objects that can be found, solved, stolen, or sold. The memory trading system forces difficult choices about trust and value. Do you return someone's memories out of loyalty? Trade them to the highest bidder? Or use them as leverage to forge new alliances?</p>
```

**Updated:**
```html
<p><strong>About Last Night...</strong> is a two-hour immersive crime thriller for 5-20 players in Fremont, CA, set in a near-future Silicon Valley where memories can be extracted and traded. You're an insider who built, funded, or profited from a tech CEO's data empire. He's dead. Your memories of the previous night have been turned into commodities — and what you choose to do with each one is between you and whatever version of yourself shows up in that room.</p>

<p>The game has no fixed ending. Puzzles gate what evidence surfaces; recovered memories can be exposed to the group, buried through a black market broker for personal gain, or returned to their owner. Players physically carry each memory token — to the broker, the reporter, or back to the person it belongs to. At the end, the group constructs an "official story" from whatever survived a two-hour collision of competing agendas. Then the post-game report arrives: an account assembled from fragments no single player experienced in full, making the distance between what you lived and what the story says into something you can finally point at.</p>
```

**Rationale:**
- Runtime corrected `90-minute` → `two-hour` (consistent with rest of site and new press release).
- Leads with premise ("you're an insider...") instead of a mechanics summary.
- Replaces the trust/value question cluster with the three-way memory choice (expose / bury via broker / return), which is the central framing of the new release.
- Adds the post-game report as the closing beat — a beat the old boilerplate ignored entirely and which is now a significant part of how the show is being described.
- Keeps the essential press-grab facts in the opening sentence (two-hour, 5-20 players, Fremont, near-future Silicon Valley, crime thriller).

## Validation Plan

1. **HTML validation.** Pre-commit `tidy` hook runs automatically on commit. Since all edits are text-only within existing tag structures, expected to pass on first attempt.
2. **Stragglers sweep.** After edits, grep `press.html` for `April 5`, `Apr 5`, `end of April`, `90-minute`, `Feb-Apr`. Expect zero matches.
3. **Visual spot-check.** Load `press.html` locally and verify:
   - Key Facts grid shows `February 26 - May 31, 2026`
   - Press Release section renders: headline, subhead, all h4 sections, production details block, three bios, resources, `###` end marker
   - About the Production section renders with two new paragraphs
   - Photo gallery still shows 12 photos with updated `Feb-May 2026` credit lines
4. **Quote integrity check.** Verify that the em dashes, smart quotes, and curly apostrophes in the new release text render correctly (no mojibake). Use HTML entities (`&mdash;`, `&amp;`) where the existing file convention uses them; pass UTF-8 characters through otherwise.
5. **Cross-link integrity.** Confirm `href="index.html"` back-link still works, email `mailto:` links still work, and `https://aboutlastnightgame.com` links in the release body remain as bare text or links per current press.html convention (currently a mix — the existing release has `<a href>` for the website inside production details; match that pattern).
6. **Comment markers intact.** All six `EDITABLE CONTENT:` comment markers remain in place and correctly bracket their sections so non-technical content editors can still Ctrl+F to find them.

## Implementation Order (Suggested)

1. Key Facts grid Run Dates line (1 edit)
2. Photo gallery credit lines (12 edits — `replace_all`)
3. About the Production boilerplate (1 block replacement)
4. Press Release `<article>` block (1 large replacement — the bulk of the work)
5. Run tidy validation locally if possible, then commit

Steps 1-3 are low-risk and reversible. Step 4 is the substantive change and should be done last so that if something goes wrong with the release text, the rest of the page is already in a good state.

## Memory Update (Post-Implementation)

After this update lands, update `project_show_extension_march2026.md` memory to remove the "press.html is stale" flag, since it will no longer be true.
