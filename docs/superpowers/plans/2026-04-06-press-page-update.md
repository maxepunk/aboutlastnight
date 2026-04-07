# Press Page Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update `press.html` to reflect the May 31, 2026 closing date and replace the old press release with the new philosophical-framing release, per the design spec at `docs/superpowers/specs/2026-04-06-press-page-update-design.md`.

**Architecture:** Four sequential text edits to a single static HTML file, followed by validation and a single commit. No code, no tests, no new dependencies. All content maps to existing CSS classes — no CSS changes. The pre-commit `tidy` hook provides HTML validation automatically at commit time.

**Tech Stack:** Static HTML5. No build tools. Git pre-commit hook runs `tidy` for HTML validation.

## Context for the Implementing Engineer

If you are reading this without having been in the brainstorming session, here is what you need to know:

- **The site** is the landing site for "About Last Night...", a limited-run immersive crime thriller in Fremont, CA. `press.html` is the press/media page with a fact sheet, photo gallery, full press release, production boilerplate, and press contact card.
- **The show has been extended twice.** Original run was through April 5, 2026. First extension pushed closing to April 25. Second extension (this update) pushes closing to May 31, 2026. Current schedule is Fridays & Saturdays at 8pm, Sundays at 7pm.
- **The press release is being replaced entirely.** The old release was a traditional "designers return with X" announcement. The new release has a completely different framing around AI ethics, data commodification, and the post-game AI-assembled report. User authored the new release and pasted it during brainstorming; design spec transcribes it with four edits baked in (dateline added, "Immie" → "IMMY", "through April" → "through May", production details date + schedule updated) plus h4 case normalization.
- **`press.html` was missed during the first extension**, so it still has pre-extension dates throughout. This update fixes everything in one pass.
- **Don't touch** index.html, playtest.html, feedback.html, how-to-play.html, or any CSS. Those are all either already updated or out of scope.
- **The pre-commit hook runs `tidy`** to validate HTML. If it fails on commit, do NOT use `--no-verify`. Read the error, fix the issue (likely an unbalanced tag or a malformed entity), re-stage, re-commit.

## File Structure

Only one file is modified. No files are created. No files are deleted.

| File | What it does | What changes |
|---|---|---|
| `press.html` | Press/media page with fact sheet, photos, release, boilerplate, contact | Four text edits: Key Facts run dates, 12 photo credit lines, About the Production boilerplate (2 paragraphs), Press Release `<article>` block (entire contents replaced) |

---

## Task 1: Update Key Facts Grid Run Dates

**Files:**
- Modify: `press.html:66`

**What this does:** Changes the "Run Dates" value in the Quick Reference fact sheet from the stale `February 26 - April 5, 2026` to the current `February 26 - May 31, 2026`.

- [ ] **Step 1: Read press.html**

Use the Read tool on `press.html` to load the file into context. This is a prerequisite for using Edit.

- [ ] **Step 2: Verify the stale string exists exactly once**

Run:
```bash
grep -c "February 26 - April 5, 2026" press.html
```
Expected output: `1`

If output is `0`, the edit has already been applied — skip to Task 2. If output is `>1`, stop and investigate — the design spec assumes this string is unique on this line.

- [ ] **Step 3: Apply the edit**

Use the Edit tool on `press.html`:

**old_string:**
```
                    <span class="fact-value">February 26 - April 5, 2026</span>
```

**new_string:**
```
                    <span class="fact-value">February 26 - May 31, 2026</span>
```

Note: leading whitespace is exactly 20 spaces. Match it exactly.

- [ ] **Step 4: Verify the edit landed**

Run:
```bash
grep -c "February 26 - May 31, 2026" press.html
```
Expected output: `1`

Run:
```bash
grep -c "February 26 - April 5, 2026" press.html
```
Expected output: `0`

Do NOT commit yet. All four tasks commit together at the end.

---

## Task 2: Update Photo Gallery Credit Lines

**Files:**
- Modify: `press.html` (12 occurrences across photo credit blocks, roughly lines 117-230)

**What this does:** Mechanically rewrites the year range on the 12 photo credit lines from `Feb-Apr 2026` to `Feb-May 2026`. No other changes to the photo gallery — same photos, same captions, same alt text, same download links.

- [ ] **Step 1: Verify the old string appears exactly 12 times**

Run:
```bash
grep -c "About Last Night... | StoryPunk x Patchwork Adventures | Feb-Apr 2026" press.html
```
Expected output: `12`

If the output is not `12`, stop and investigate before continuing.

- [ ] **Step 2: Apply the edit with replace_all**

Use the Edit tool on `press.html` with `replace_all: true`:

**old_string:**
```
About Last Night... | StoryPunk x Patchwork Adventures | Feb-Apr 2026
```

**new_string:**
```
About Last Night... | StoryPunk x Patchwork Adventures | Feb-May 2026
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -c "About Last Night... | StoryPunk x Patchwork Adventures | Feb-May 2026" press.html
```
Expected output: `12`

Run:
```bash
grep -c "About Last Night... | StoryPunk x Patchwork Adventures | Feb-Apr 2026" press.html
```
Expected output: `0`

---

## Task 3: Replace About the Production Boilerplate

**Files:**
- Modify: `press.html:344-346`

**What this does:** Replaces the two-paragraph "About the Production" boilerplate with a rewrite that aligns tonally with the new press release. The rewrite corrects the runtime from `90-minute` to `two-hour` (consistent with rest of site and new release), leads with the premise instead of mechanics, uses the three-way memory choice framing (expose/bury/return), and adds the post-game report as the closing beat.

- [ ] **Step 1: Verify the old block exists**

Run:
```bash
grep -c "is a 90-minute immersive crime thriller" press.html
```
Expected output: `1`

- [ ] **Step 2: Apply the edit**

Use the Edit tool on `press.html`. This replaces both `<p>` elements inside `.about-content` in a single Edit call.

**old_string:**
```
                <p><strong>About Last Night...</strong> is a 90-minute immersive crime thriller combining escape room puzzles, roleplay, social deduction, and strategic trading mechanics. Set in a near-future Silicon Valley where memories can be extracted and traded, players embody party-goers who wake up in a warehouse after a party with fragmented memories and a missing host.</p>

                <p>Players discover their memories have been locked up in physical objects that can be found, solved, stolen, or sold. The memory trading system forces difficult choices about trust and value. Do you return someone's memories out of loyalty? Trade them to the highest bidder? Or use them as leverage to forge new alliances?</p>
```

**new_string:**
```
                <p><strong>About Last Night...</strong> is a two-hour immersive crime thriller for 5-20 players in Fremont, CA, set in a near-future Silicon Valley where memories can be extracted and traded. You're an insider who built, funded, or profited from a tech CEO's data empire. He's dead. Your memories of the previous night have been turned into commodities &mdash; and what you choose to do with each one is between you and whatever version of yourself shows up in that room.</p>

                <p>The game has no fixed ending. Puzzles gate what evidence surfaces; recovered memories can be exposed to the group, buried through a black market broker for personal gain, or returned to their owner. Players physically carry each memory token &mdash; to the broker, the reporter, or back to the person it belongs to. At the end, the group constructs an "official story" from whatever survived a two-hour collision of competing agendas. Then the post-game report arrives: an account assembled from fragments no single player experienced in full, making the distance between what you lived and what the story says into something you can finally point at.</p>
```

Indentation is exactly 16 spaces on each `<p>` line. Match it exactly. Em dashes are encoded as `&mdash;` to match existing file convention. Apostrophes and quotation marks are straight ASCII, also matching existing file convention.

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -c "two-hour immersive crime thriller for 5-20 players in Fremont" press.html
```
Expected output: `1`

Run:
```bash
grep -c "is a 90-minute immersive crime thriller" press.html
```
Expected output: `0`

---

## Task 4: Replace Press Release Article Block

**Files:**
- Modify: `press.html:252-325` (the entire `<article class="release-content">...</article>` block)

**What this does:** Replaces the old press release in its entirety with the new release, with the four source edits from the spec already baked in:
1. Dateline `FREMONT, CA (April 2026) —` added before the first body paragraph
2. `"Immie"` corrected to `"IMMY"` in the opening paragraph
3. `"through April"` updated to `"through May"` in the body
4. Production Details dates + schedule lines updated to current values
5. ALL-CAPS h4s ("PRODUCTION DETAILS", "ABOUT THE CREATORS", "PRESS RESOURCES") normalized to Title Case

This is the largest edit in the plan. The new article content uses the same CSS classes as the old (`.release-date`, `.release-contact-top`, `.release-headline`, `.release-subhead`, `<h4>`, `.release-details`, `.release-end`), so no CSS updates are needed.

- [ ] **Step 1: Verify the old article block is present**

Run:
```bash
grep -c "Award-Winning Bay Area Designers Return" press.html
```
Expected output: `1`

Run:
```bash
grep -c "Who Gets to Decide What Happened" press.html
```
Expected output: `0`

- [ ] **Step 2: Apply the edit**

Use the Edit tool on `press.html`.

**old_string** (the entire current article block — 74 lines, must match exactly including whitespace):

```
            <article class="release-content">
                <p class="release-date">FOR IMMEDIATE RELEASE</p>
                <p class="release-contact-top"><strong>Contact:</strong><br>
                Bora "Max" Koknar<br>
                <a href="mailto:aboutlastnightgame@gmail.com">aboutlastnightgame@gmail.com</a><br>
                Website: <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a></p>

                <h3 class="release-headline">Award-Winning Bay Area Designers Return with "Playable Crime Thriller"</h3>
                <p class="release-subhead">After a successful initial run, <em>About Last Night...</em> reopens with an expanded narrative, additional puzzles and a new creative team member.</p>

                <p><strong>FREMONT, CA (February 2026)</strong> &mdash; What kind of story do you want to tell tonight?</p>

                <p>That question sits at the center of <em>About Last Night...</em>&mdash;part escape room, part immersive theater, part social strategy game. The two-hour production opens February 26 at Off the Couch Games in Fremont for a limited run through April 5. Tickets are $75; need-based discounts available at <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a>.</p>

                <p>Created by Golden Lock and IMMY Award winner Shuai Chen (Patchwork Adventures), CALI Catalyst Award recipient Bora "Max" Koknar (StoryPunk), and experience designer Casey Selden (Palace Games, Odd Salon, We Players), the production asks 5-20 participants to piece together what happened at a tech CEO's underground party, and decide which truths, if any, to make public.</p>

                <h4>The Setup</h4>
                <p>Marcus Blackwood, Silicon Valley VC darling CEO of NeurAI and host of last night's illegal underground rave, is dead.</p>

                <p>You, as a participant, wake up the next morning, heads pounding and missing a significant chunk of your memories. That's because minutes before his death, Marcus used NeurAI's proprietary technology to steal your memories and store them into tokens (which are locked away behind puzzles). These stolen memories could contain a participant's alibi for Marcus' death, evidence of another participant's wrongdoing, or trade secrets that can be sold for profit, and perhaps all three.</p>

                <p>Participants must decide, as individuals or small teams, which Non-Player Character to align with: a true crime reporter who wants to expose the truth, or a corporate toady offering cash for Marcus' dirt (both personal and professional). Participants must also decide, collectively, which version of the story they will reveal to law enforcement when the police inevitably arrive. But, as they say, one person's alibi is another person's conviction...</p>

                <h4>The Design Philosophy</h4>
                <p>"We wanted to build something accessible" says Koknar, whose previous work includes <em>The Super Secret Society: A Playable Play</em> (2023), that explores complex and timely themes like generative AI, culture, and the dangers of implicitly trusting charismatic leaders during times of crisis. "You don't need to be an actor, a puzzle expert, or a social butterfly. Our goal for the game is to let you shine based on whatever strengths you bring."</p>

                <p>The production draws from escape room puzzle design, Chinese jubensha-inspired roleplay, and economic trading systems. Puzzles unlock narrative. Narrative drives the puzzling. Negotiation determines which version of events becomes "the truth."</p>

                <p>"We want both tracks — puzzle-solving and story — to have real payoffs, not just one supporting the other." notes Chen, whose company specializes in unique puzzle-based experiences.</p>

                <p>Casey Selden, who designs experiences that disrupt traditional narratives, joins the creative team for the February run, contributing as lead writer and environment designer. "My job is making strangers comfortable doing uncomfortable things together," she says. "This game lives in that space."</p>

                <h4>The Themes</h4>
                <p>Set in near-future Silicon Valley, the production explores data commodification through gameplay. Memories become currency. The truth becomes malleable. The value of personal information becomes dictated by 'the market'.</p>

                <p>"In an age when our ability to connect is increasingly commoditized, we wanted to create a space to explore that through fiction," says Koknar, "and make the metaphor playable."</p>

                <h4>The Return</h4>
                <p>The limited December 2025 run sold out over a third of its performances. Player feedback validated the genre mash-up, while highlighting opportunities for growth.</p>

                <p>The creative team is using the downtime between runs to expand character arcs, double the story content, add environmental Easter eggs to discover, streamline the social strategy elements and redesign the endgame sequence.</p>

                <p>The production's blend of digital and analog storytelling allows faster iteration than typical immersive theater or escape room experiences. "Every run teaches us something," says Koknar. "This is ambitious, it's DIY, and it's constantly evolving. That's the point."</p>

                <h4>Production Details</h4>
                <p class="release-details">
                <strong>Title:</strong> About Last Night...<br>
                <strong>Venue:</strong> Off the Couch Games, 555 Mowry Ave, Fremont, CA 94536<br>
                <strong>Dates:</strong> February 26 – April 5, 2026<br>
                <strong>Schedule:</strong> Thursdays &amp; Sundays (7pm), Fridays &amp; Saturdays (8pm)<br>
                <strong>Duration:</strong> ~2 hours<br>
                <strong>Capacity:</strong> 5–20 players per performance<br>
                Recommended 16+. Accessibility and content information at <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a>.<br>
                <strong>Tickets:</strong> $75/person (need-based discounts available)<br>
                <strong>Info:</strong> <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a><br>
                <strong>Press Contact:</strong> <a href="mailto:aboutlastnightgame@gmail.com">aboutlastnightgame@gmail.com</a>
                </p>

                <h4>About the Creators</h4>
                <p><strong>Shuai Chen</strong> is founder of Patchwork Adventures. Her <em>Order of the Golden Scribe: Initiation Tea</em> won the 2023 Golden Lock Award, No Proscenium's Best Immersive Experience Award, and the 2024 IMMY Award for Outstanding Immersive Work. She represented Team USA at the Escape Room World Championships. Her background in neurobiology (MIT, Stanford) informs experiences where memory, perception, and reality blur.</p>

                <p><strong>Bora "Max" Koknar</strong> is founder of StoryPunk, a creative studio specializing in immersive storytelling. He received the 2022 CALI Catalyst Award for equity-centered practice. His work includes <em>The Super Secret Society: A Playable Play</em> and <em>Shoggoths on the Veldt</em>. During the pandemic, he produced over 450 digital events employing 200+ artists. He previously served as Co-Artistic Director at Dragon Productions Theatre Company (2019-2021) and Associate Artistic Director at Epic Immersive (2015-2019).</p>

                <p><strong>Casey Selden</strong> has guided 10,000+ guests through immersive experiences over a decade, from renegade museum tours to <em>The Racket</em>, a film noir team-building game built on black market deals and murder. One of Odd Salon's most frequent speakers, she has researched and performed 20+ original lectures on history and science.</p>

                <p><strong>Off the Couch Games</strong> is Fremont's premier escape room venue, partnering to host this fusion of escape room mechanics and immersive theater.</p>

                <h4>Press Resources</h4>
                <p>High-resolution photos available at: <a href="https://aboutlastnightgame.com/press">aboutlastnightgame.com/press</a><br>
                Press tickets available upon request<br>
                Interviews scheduled upon request</p>

                <p class="release-end">###</p>
            </article>
```

**new_string** (the new article content — copy exactly, preserving all whitespace and HTML entities):

```
            <article class="release-content">
                <p class="release-date">FOR IMMEDIATE RELEASE</p>
                <p class="release-contact-top"><strong>Contact:</strong><br>
                Bora "Max" Koknar<br>
                <a href="mailto:aboutlastnightgame@gmail.com">aboutlastnightgame@gmail.com</a><br>
                Website: <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a></p>

                <h3 class="release-headline">Who Gets to Decide What Happened?</h3>
                <p class="release-subhead">A Fremont thriller where your memories have been stolen, turned into currency &mdash; and every choice about what to do with someone's most private data is yours to make</p>

                <h4>Silicon Valley is at an inflection point</h4>
                <p><strong>FREMONT, CA (April 2026)</strong> &mdash; Artificial Intelligence has grown leaps and bounds in the past three years. The commodification of personal data and your memories is no longer theoretical. Tech startups are probing fearlessly into every aspect of being human with the question of "could we do it?" leading their inquiries rather than the more important "should we be doing this?"</p>

                <h4>A game. A commentary on the Silicon Valley Dystopia.</h4>
                <p><em>About Last Night...</em> is a two-hour immersive game for 5-20 players. You're a Silicon Valley insider &mdash; someone who has built, funded, or profited from a tech CEO's data empire. He's dead. Your memories of the previous night have been extracted and turned into commodities. Turns out that Marcus and his startup have been asking questions and testing things that are...unethical. Every memory you recover belongs to someone &mdash; it's their private truth, their secret, their vulnerability. And what you choose to do with it is between you and whatever version of yourself shows up in that room. The group needs to construct an official story. But in a room where everyone has something to hide, the truth is whatever survives the negotiation. Created by IMMY and Golden Lock Award winner Shuai Chen (Patchwork Adventures), Bora "Max" Koknar (StoryPunk), and Casey Selden, the production extends at Off the Couch Games in Fremont through May after earning an SF Chronicle Datebook Pick.</p>

                <h4>What Happens When You Let People Decide</h4>
                <p>The game has no fixed ending. What it has is a system: recovered memories that can be exposed to the group, buried through a black market broker for personal gain, or returned to the person they belong to. Puzzles gate what evidence surfaces at all. Different players crack different locks, follow different threads, and some crucial truths may never emerge because no one solved the puzzle protecting them. Time runs out. The group has to agree on an official story built from whatever evidence survived a two-hour collision of individual choices, competing agendas, and the fundamental problem of trust in a room full of people who know things they can't prove.</p>

                <p>Players have to choose between preserving someone's privacy and bolstering their own knowledge, power, and finances. The moral questions aren't abstract. They're tactile, social, and visible to everyone in the room. Players physically carry each memory token to the black market broker, to the investigative reporter, or back to its owner.</p>

                <p>What emerges from this system has been different every time. Some groups self-organize into coordinated investigations, pooling evidence and building a shared narrative. Others fragment into competing agendas until the room has to pull together something everyone can live with despite their different agendas. In one session, two camps formed and genuinely debated &mdash; one pushing for the obvious suspect, the other insisting on the people with the most institutional power to suppress the truth. The room fought. Power lost. In another, the group presented a united front while individuals quietly cut deals with the black market broker. Ten people said they were working together. The equivalent of $1.71 million in evidence was suppressed to make sure the most comfortable story was the only one left to tell.</p>

                <p>Same evidence. Same choices available. One room fought for accountability. Another purchased consensus.</p>

                <p>"We're not here to answer these questions for anyone. We don't know the answers. But we're making work in Silicon Valley, and we can see the window closing. If people don't engage with these questions now, the decisions get made by the people with the most money and the most to gain. That's the urgency." says Koknar, the narrative designer of the piece.</p>

                <h4>The Design and the Contradiction</h4>
                <p>And here's the wrinkle. Building the systems behind this: the scanners, the room automation, the game server, would have been out of reach for a three-person indie team a few years ago. What changed is the same thing the game is questioning. Generative AI coding tools enable the team to design and build bespoke hardware and software that would have otherwise required a significantly larger team and budget. The tools the game critiques are the tools that made the game possible.</p>

                <p>That tension reaches its sharpest expression in the post-game report. After every session, a unique article is generated in the voice of the investigative reporter players interacted with throughout their session &mdash; assembled from the specific evidence each group exposed and buried, the alliances they formed, the story they constructed. Every piece of source material the system draws from was written by people: the memory tokens, the evidence documents, the scripts that define the NPC characters' voices. A human game master writes up a report after each session with observations about player behavior and choices throughout the game session. Then, the system built from deterministic code and generative AI assembles those human-authored elements into a coherent narrative. Without this system, each report would take a day or more of writing &mdash; not feasible for a small team running multiple sessions a week. And the report is where the game's larger questions connect to each group's specific choices. It's the final act &mdash; the moment where the fiction reflects back what the room actually did.</p>

                <p>The creators are open about the contradiction. They're using tools built on the extractive logic the game critiques to realize an artistic vision that couldn't exist without those very tools. They aren't offering a resolution. They're working inside the tension, deliberately, as artists exercising agency over the technology that is being monetized with a mandate to make artists unnecessary.</p>

                <p>"The binary, embrace everything or reject everything, is a trap," says Koknar. "The game asks players to make choices with no clean answers. We're making the same kind of choices every day building it."</p>

                <p>Every session ends the same way. The group constructs their official story. The room clears. And then the report arrives, a complete, coherent, 'authoritative' account of what happened, curated and assembled from fragments no single player experienced in full. You read it and you recognize the broad strokes. But you also know what it missed. You know what you buried. You know the private truth you returned to someone without reading. You see the gaps where you know someone else buried a truth you were chasing. The distance between what you lived and what the story says is the distance most people can't see in their daily lives but feel permeating their entire world. The disconnect between what you know to be true from your own experience and the reality being constructed around you through feeds and algorithms and official accounts by systems most of us never asked for and don't fully understand.</p>

                <p><em>About Last Night...</em> doesn't close that gap. It tries to make it tangible. For two hours, you're inside the machine &mdash; making choices, burying evidence, negotiating truth. Then you read what the machine made from your choices, and that disconnect between what you lived and what got delivered as the accepted truth becomes something you are more easily able to talk about.</p>

                <h4>Production Details</h4>
                <p class="release-details">
                <strong>Title:</strong> About Last Night...<br>
                <strong>Venue:</strong> Off the Couch Games, 555 Mowry Ave, Fremont, CA 94536<br>
                <strong>Dates:</strong> February 26 – May 31, 2026<br>
                <strong>Schedule:</strong> Fridays &amp; Saturdays at 8pm, Sundays at 7pm<br>
                <strong>Duration:</strong> 2 hours<br>
                <strong>Capacity:</strong> 5–20 players per performance<br>
                Recommended 16+. Accessibility and content information at <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a>.<br>
                <strong>Tickets:</strong> $75/person (need-based discounts available)<br>
                <strong>Info:</strong> <a href="https://aboutlastnightgame.com">aboutlastnightgame.com</a><br>
                <strong>Press Contact:</strong> <a href="mailto:aboutlastnightgame@gmail.com">aboutlastnightgame@gmail.com</a>
                </p>

                <h4>About the Creators</h4>
                <p><strong>Shuai Chen</strong> is founder of Patchwork Adventures. Her <em>Order of the Golden Scribe: Initiation Tea</em> won the 2023 Golden Lock Award, No Proscenium's Best Immersive Experience Award, and the 2024 IMMY Award for Outstanding Immersive Work. She represented Team USA at the Escape Room World Championships. Her background in neurobiology (MIT, Stanford) informs experiences where memory, perception, and reality blur.</p>

                <p><strong>Bora "Max" Koknar</strong> is founder of StoryPunk, a creative studio specializing in immersive storytelling. He received the 2022 CALI Catalyst Award for equity-centered practice. His work includes <em>The Super Secret Society: A Playable Play</em> (featured by SF Chronicle) and <em>Shoggoths on the Veldt</em> ("Whatever it is, 'Shoggoths' is must-see theater" &mdash; Mercury News). During the pandemic, he produced over 450 digital events employing 200+ artists. He previously served as Co-Artistic Director at Dragon Productions Theatre Company (2019-2021) and Associate Artistic Director at Epic Immersive (2015-2019).</p>

                <p><strong>Casey Selden</strong> has guided 10,000+ guests through immersive experiences in the Bay Area, from renegade museum tours to a film noir team-building game built on black market deals and murder. One of Odd Salon's most frequent speakers, she has researched and performed 20+ original lectures on history and science.</p>

                <p><strong>Off the Couch Games</strong> is Fremont's premier escape room venue, partnering to host this fusion of escape room mechanics and immersive theater.</p>

                <h4>Press Resources</h4>
                <p>High-resolution photos available at: <a href="https://aboutlastnightgame.com/press">aboutlastnightgame.com/press</a><br>
                Press tickets available upon request<br>
                Interviews available with all three creators</p>

                <p class="release-end">###</p>
            </article>
```

**Notes on encoding choices** (match existing file convention):
- Em dashes: `&mdash;` with a space on each side
- En dashes: literal `–` character (matches existing `.release-details` block)
- Ampersands in "Fridays & Saturdays": `&amp;`
- Apostrophes and quotes: straight ASCII (`'` and `"`)
- Ellipses within text ("testing things that are...unethical"): three literal ASCII dots
- Indentation: article tag at 12 spaces, inner elements at 16 spaces (unchanged from existing file)

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -c "Who Gets to Decide What Happened?" press.html
```
Expected output: `1`

Run:
```bash
grep -c "Award-Winning Bay Area Designers Return" press.html
```
Expected output: `0`

Run:
```bash
grep -c "FREMONT, CA (April 2026)" press.html
```
Expected output: `1`

Run:
```bash
grep -c "IMMY and Golden Lock Award winner Shuai Chen" press.html
```
Expected output: `1`

Run:
```bash
grep -c "Immie" press.html
```
Expected output: `0`

---

## Task 5: Stragglers Sweep and Commit

**Files:**
- Read-only: `press.html`
- Git: stage and commit

**What this does:** Runs a final sweep to catch any stale strings that might have been missed, then creates a single commit for all four edits.

- [ ] **Step 1: Stragglers sweep — check for old content**

Run each of these. Every one should output `0`:

```bash
grep -c "April 5, 2026" press.html
grep -c "end of April" press.html
grep -c "Thursday–Sunday" press.html
grep -c "90-minute" press.html
grep -c "Feb-Apr 2026" press.html
grep -c "Award-Winning Bay Area Designers" press.html
grep -c "Immie" press.html
grep -c "through April 5" press.html
```

If any of these returns a non-zero count, stop and investigate. Do NOT proceed to commit until all are `0`.

- [ ] **Step 2: Stragglers sweep — check for new content**

Run each of these. Outputs should match the expected values:

```bash
grep -c "February 26 - May 31, 2026" press.html    # expect 1 (Key Facts grid)
grep -c "February 26 – May 31, 2026" press.html    # expect 1 (Production Details, en dash)
grep -c "Feb-May 2026" press.html                  # expect 12 (photo credits)
grep -c "Who Gets to Decide What Happened?" press.html  # expect 1
grep -c "two-hour immersive crime thriller for 5-20 players" press.html  # expect 1 (boilerplate)
grep -c "Fridays &amp; Saturdays at 8pm" press.html  # expect 1
```

If any of these returns an unexpected count, stop and investigate before committing.

- [ ] **Step 3: Inspect the diff**

Run:
```bash
git diff press.html | head -200
```

Visually confirm the diff contains only the expected changes. There should be no accidental whitespace changes, no line-ending conversions, and no other edits outside the four sections you touched.

- [ ] **Step 4: Stage and commit**

Run:
```bash
git add press.html
```

Then commit with this message (use a HEREDOC to preserve formatting):

```bash
git commit -m "$(cat <<'EOF'
content(press): replace release with new framing, update for May 31 extension

- Replace old press release with new philosophical-framing release
  ("Who Gets to Decide What Happened?"), with dateline added, Immie→IMMY
  correction, dates updated, schedule updated, h4 case normalized
- Update Key Facts grid run dates to February 26 - May 31, 2026
- Update 12 photo credit year-range strings from Feb-Apr to Feb-May
- Replace About the Production boilerplate with tonally-aligned rewrite
  (corrects runtime 90-minute → two-hour, leads with premise, adds
  post-game report beat)

Per spec: docs/superpowers/specs/2026-04-06-press-page-update-design.md

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

**If the pre-commit hook (`tidy`) fails:**
- Read the error output carefully — `tidy` will print line numbers
- Fix the issue in `press.html` (common culprits: unbalanced tags, malformed HTML entities, stray characters from copy-paste)
- Re-stage: `git add press.html`
- Re-run the commit command (do NOT use `--amend`, do NOT use `--no-verify`)

- [ ] **Step 5: Verify the commit landed**

Run:
```bash
git log -1 --stat
```

Expected: one commit on `main` touching only `press.html`, with the "content(press):" subject line.

Run:
```bash
git status
```

Expected: `press.html` no longer in the working tree diff.

---

## Task 6: Update Memory

**Files:**
- Modify: `C:/Users/spide/.claude/projects/C--Users-spide-documents-claudecode-aboutlastnight/memory/project_show_extension_march2026.md`
- Modify: `C:/Users/spide/.claude/projects/C--Users-spide-documents-claudecode-aboutlastnight/memory/MEMORY.md`

**What this does:** Removes the "press.html is stale" flag from the extension memory file and updates the MEMORY.md index line, since press.html is now current.

- [ ] **Step 1: Read the current memory file**

Use the Read tool on `C:/Users/spide/.claude/projects/C--Users-spide-documents-claudecode-aboutlastnight/memory/project_show_extension_march2026.md` to load it into context.

- [ ] **Step 2: Remove the stale press.html paragraph**

The memory file has a paragraph that begins `**press.html is stale** — still references the original "April 5" closing date...`. Use the Edit tool to remove this entire paragraph.

**old_string:**
```
**press.html is stale** — still references the original "April 5" closing date in multiple spots (fact sheet lines ~66, ~300; press release body line ~264). Was missed in the first extension and not updated in the second either. Handle separately when refreshing press materials.
```

**new_string:**
```
**press.html is current** (updated 2026-04-06): new philosophical-framing release replaces the old one, run dates reflect May 31 closing, schedule reflects Fri & Sat 8pm / Sun 7pm, About the Production boilerplate rewritten to match new release's framing. See `docs/superpowers/specs/2026-04-06-press-page-update-design.md`.
```

- [ ] **Step 3: Update MEMORY.md index line**

Use the Read tool on `C:/Users/spide/.claude/projects/C--Users-spide-documents-claudecode-aboutlastnight/memory/MEMORY.md`, then use Edit:

**old_string:**
```
- [Show Extension & Press Update](project_show_extension_march2026.md) — Run now through May 31 (extended twice). SF Chronicle + TCV press quotes. press.html still stale at Apr 5.
```

**new_string:**
```
- [Show Extension & Press Update](project_show_extension_march2026.md) — Run now through May 31 (extended twice). SF Chronicle + TCV press quotes. press.html refreshed 2026-04-06 with new framing release.
```

Memory files live outside the repo, so there is no git commit needed for this task.

---

## Post-Implementation Validation

After Task 6 is complete, perform a manual smoke test:

- [ ] **Open `press.html` in a browser** (local file or `python3 -m http.server` if preferred)
- [ ] **Verify visually:**
  - Key Facts grid shows `February 26 - May 31, 2026`
  - Press Release section renders with new headline, subhead, section h4s, production details, bios, resources, `###` end marker
  - About the Production section renders with two new paragraphs
  - Photo gallery still shows all 12 photos with updated `Feb-May 2026` credit lines
- [ ] **Post-deployment (optional):** If the commit is pushed to `origin/main`, wait 1-2 minutes for GitHub Pages to rebuild, force-refresh `aboutlastnightgame.com/press.html` with Ctrl+Shift+R, and re-check the above.

**Pushing to origin is explicitly NOT part of this plan.** The user will decide when to push. The plan's terminal state is the local commit in Task 5 plus the memory updates in Task 6.

---

## Self-Review Notes

**Spec coverage:**
- Spec §1 (Key Facts grid Run Dates) → Task 1 ✓
- Spec §2 (Photo Gallery credit lines) → Task 2 ✓
- Spec §3 (Press Release full replacement, all surgical edits + h4 normalization) → Task 4 ✓
- Spec §4 (About the Production boilerplate) → Task 3 ✓
- Spec "Validation Plan" → Task 5 (stragglers sweep covers items 2 + partial 4) and Post-Implementation Validation (visual spot-check covers items 3-6); item 1 (tidy validation) is automatic via pre-commit hook ✓
- Spec "Memory Update" → Task 6 ✓

**Placeholder scan:** No TBD/TODO/FIXME in plan. All code blocks show actual content. All grep commands have exact expected outputs.

**Type consistency:** N/A — no code, no types, no function signatures. Class names in HTML (`release-headline`, `release-subhead`, `release-details`, `release-end`, `about-content`, `fact-value`) used consistently throughout.

**Scope:** Focused on a single file. All six tasks together should take well under an hour of wall time for a human engineer, and commit once.
