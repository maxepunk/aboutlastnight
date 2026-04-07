# Image Integration Design: 9 New Marketing Photos for index.html

**Date:** 2026-04-06
**Status:** Draft (awaiting user review)
**Scope:** `index.html`, `css/*.css`, image optimization pipeline

## Context

Nine new marketing photos (`C:/Users/spide/Downloads/marketing select/alnselections (1-9 of 9).jpg`) are available for integration into the landing page. They are candid player photographs from actual sessions — significantly different in character from the existing `images/ALN-*.jpg` set, which consists mostly of wide venue/environment shots currently deployed as darkened fixed-parallax backgrounds throughout the page.

The landing page currently has a deliberate **noir-parallax system**: every major section has a fixed-attachment background photo with heavy dark overlays (rgba 0.5–0.93), scanlines, and red accents. This creates strong visual continuity and mood but means the page has almost no foreground imagery — no photos of players in their actual contexts, no "this is what the experience looks like" moments.

The new photos give us the option to introduce a foreground layer over the existing parallax system. This spec captures the design decisions for doing that.

## Goals

1. **Narrative amplification.** Each new image earns its placement by amplifying a specific copy beat the reader just encountered. Images are not decoration — they are visual payoff for claims the copy is making.
2. **Density breaking.** In sections where the copy is a wall of prose, images act as rhythmic breaks that reward the reader for scrolling and keep the scroll compulsive. In sections that already have short-bullet rhythm built into the copy, additional images are unnecessary.
3. **Preserve the noir-parallax system.** The existing darkened fixed-background treatment is not replaced or reduced. New images layer *over* it, not *instead of* it.

## Non-Goals / Out of Scope

- **No copy changes.** Every image pairing is designed around the existing paragraphs in `index.html` as-is.
- **No changes to the existing background-parallax treatment.** `.narrative`, `.party-scene`, `.creators`, `.explanation-section`, `.faq-section`, `.interest-form` all keep their current `background: linear-gradient(...), url('../images/ALN-*.jpg') center/cover fixed;` declarations.
- **No new content sections.** All new images are inserted into existing sections.
- **No image treatment for the CREATORS section.** The "4 walls of credentials" density problem is real but unsolvable with this image set (no creator photos). Flagged as a separate followup — see Deferred Items.
- **No image treatment for FAQ section.** The 2-column grid layout already absorbs the question density. Inline photos would break the grid.
- **No image treatment for HERO section.** The teaser video already does the atmospheric heavy-lift; adding a foreground image would compete with it.
- **No image treatment for WHAT HAPPENED LAST NIGHT.** This section is written in-fiction (second person, present tense, inside the story: "Marcus is dead. Your memories were taken."). A real-player photo would pull the reader out of the fictional trance the copy is building. The darkened `ALN-seatingarea.jpg` parallax background is doing the right work — atmospheric, ambiguous enough to read as "the warehouse" in-fiction.
- **No responsive design work for mobile beyond the standard collapse behavior.** Side-by-side treatments stack to single-column below the 768px breakpoint.
- **No image optimization work specified in detail.** The optimization pipeline (resizing, compression, format selection) is an implementation concern; spec specifies target dimensions and acceptable file sizes, not tooling.

## Key Principles Established During Brainstorming

These informed every decision and should inform any future revisions:

### 1. Register Rule

Copy written **in-fiction** (second-person present-tense, addressing the reader as if they're inside the story) is risky for real-player photos — a documentary shot of people at a game can break the fictional trance the copy is building.

Copy written **meta** (the writer speaking to the reader about the experience) is safe for player photos — the reader is already in a reflective/meta frame.

**In-fiction sections on the page:** HERO, WHAT HAPPENED LAST NIGHT, FRAGMENTED MEMORIES
**Meta sections on the page:** WHAT EXACTLY IS ABOUT LAST NIGHT?, OUR PHILOSOPHY, FAQ

FRAGMENTED MEMORIES is the calculated exception: it gets image 07 because image 07's dramatic cross-lighting and tight face framing make the subjects read as "people in pressure" more than "players at a game," which aligns with the in-fiction register enough to work.

### 2. Density Must Be Measured, Not Assumed

"Density" means real prose density, not paragraph count. OUR PHILOSOPHY has 9 "paragraphs" but 5 of them are short bullets (≤15 words), and the real prose density is concentrated in the ¶4-6 middle cluster (111 words). WHAT EXACTLY IS ABOUT LAST NIGHT has 7 paragraphs averaging 23 words each, uniformly medium-dense prose throughout — *this* is the true density hot spot on the page.

**Rule:** allocate image moments to sections based on measured prose density, not paragraph counts. Short-bullet rhythm is a form of built-in density breaking that doesn't need image intervention.

### 3. Treatment Hierarchy (Ascending Visual Weight)

| Treatment | Role | Visual weight |
|---|---|---|
| **Side-by-side portrait** | Paragraph-cluster anchor — portrait image beside a multi-paragraph cluster that thematically holds together | ~347px row height (260px wide image × 3:4 aspect) |
| **Contained landscape banner** | Rhythm punctuation between paragraphs — full-column-width landscape strip | Variable height depending on aspect; typically 273-410px |
| **Full-bleed landscape closer** | Section climax / emotional payoff — image breaks out of the 900px container to the full viewport | ~514px tall at 1200w viewport (21:9 aspect) |

Only the full-bleed closer earns dominance, and only as a section-climax moment. Contained banners are rhythm punctuation, not focal photos. Side-by-side is the most balanced treatment because the image and text cluster share vertical extent.

### 4. Portrait Images Pair with Multi-Paragraph Clusters

A portrait image at reasonable display size (260px wide × 3:4 aspect = 347px tall) is taller than any single short paragraph. Pairing a portrait image with a single paragraph creates a visually broken layout — the text is a small raft floating in a sea of empty space beside the image.

**Rule:** portrait images in side-by-side treatment must pair with a **thematically cohesive cluster of multiple paragraphs** that fills a meaningful portion of the image's vertical extent. Target ~70% fill of the image height with text content (some empty space below is fine; centered-vertically empty space above *and* below is not).

### 5. Crops Must Be Intentional

When cropping landscape images to wider banner aspect ratios, the crop must be planned against the actual composition of the source image — key subjects identified, `object-position` chosen to preserve them. Never apply a default center crop and hope.

**Workflow for any new landscape banner:**
1. Examine the source image at full resolution
2. Identify the Y-percentage positions of critical content (heads, key objects)
3. Calculate the visible range for the target aspect ratio
4. Choose `object-position` so the critical content sits within the visible range with a safety margin
5. Verify the result at full render size

### 6. Placement: Closers AFTER the CTA line, not Before

Full-bleed closer images should land **after** the closing copy line that establishes the section's emotional beat, not before it. This lets the text line stand alone at its full weight and makes the image function as the *visual answer* to the line — not competing setup for it.

Applied to OUR PHILOSOPHY: image 06 goes after "Join the party!" so the invitation gets unambiguous primacy and the image becomes "here is what joining the party looks like."

Applied to FRAGMENTED MEMORIES: image 07 goes after "escape the warehouse before the time is up..." for the same reason.

## Image Inventory

Source files (high-resolution originals, `C:/Users/spide/Downloads/marketing select/`):

| # | Filename | Native dimensions | Native aspect | Orientation |
|---|---|---|---|---|
| 01 | `alnselections (1 of 9).jpg` | 3928×2210 | 1.78 | Landscape (16:9) |
| 02 | `alnselections (2 of 9).jpg` | 2807×3742 | 0.75 | Portrait (3:4) |
| 03 | `alnselections (3 of 9).jpg` | 2254×3005 | 0.75 | Portrait (3:4) |
| 04 | `alnselections (4 of 9).jpg` | 3511×2633 | 1.33 | Landscape (4:3) |
| 05 | `alnselections (5 of 9).jpg` | 2501×3334 | 0.75 | Portrait (3:4) |
| 06 | `alnselections (6 of 9).jpg` | 7236×5428 | 1.33 | Landscape (4:3) |
| 07 | `alnselections (7 of 9).jpg` | 7300×5476 | 1.33 | Landscape (4:3) |
| 08 | `alnselections (8 of 9).jpg` | 3095×2321 | 1.33 | Landscape (4:3) |
| 09 | `alnselections (9 of 9).jpg` | 3373×2530 | 1.33 | Landscape (4:3) |

## Allocation Summary

Six of nine images are placed. Three are parked as alternates.

| # | Subject | Placement | Treatment |
|---|---|---|---|
| 01 | Players arriving at graffiti-walled entry with character docs | BOOKING prelude (top of `.interest-form`) | Full-bleed 21:9, `object-position: 50% 10%` |
| 02 | Two players examining a newspaper clue | WHAT EXACTLY IS ALN mid-section | Side-by-side portrait, paired with ¶2-5 cluster, **image on right** |
| 03 | Partners examining a small object together | **PARKED** (functionally overlaps with image 02) | — |
| 04 | Five-player huddle over evidence | **PARKED** (functionally overlaps with image 07) | — |
| 05 | Two women across age ranges collaborating on puzzle | OUR PHILOSOPHY mid-section | Side-by-side portrait, paired with ¶4-6 cluster, **image on left** |
| 06 | Player laughing at the bar | OUR PHILOSOPHY closer | Full-bleed 21:9, `object-position: 50% 38%`, **after** ¶9 "Join the party!" |
| 07 | Four players examining evidence under flashlights | FRAGMENTED MEMORIES closer | Full-bleed 21:9, `object-position: 50% 5%`, **after** memory block 4 |
| 08 | Two women on a couch laughing over character briefs | WHAT EXACTLY IS ALN late-section | Contained banner 2:1, `object-position: 50% 5%` |
| 09 | Player reaching across graffiti wall with clipboard | **PARKED** (no clear beat match, was over-dense addition to OUR PHILOSOPHY) | — |

**Treatment count:**
- Side-by-side portrait: 2 uses (images 02, 05)
- Contained landscape banner: 1 use (image 08)
- Full-bleed landscape: 3 uses (images 01, 06, 07)

## Section-by-Section Design

### HERO · leave alone

**Current:** `<section class="hero" data-event-date="2026-02-26">` with `<video>` background and `ALN-marcusisdead.jpg` fallback poster for reduced-motion preference. Noir tagline, awards badge, press badge, CTAs.

**Decision:** no changes. The teaser video is already the atmospheric heavy-lift and any foreground image would compete with it. This is also an in-fiction register section.

### WHAT HAPPENED LAST NIGHT · leave alone

**Current:** `<section class="party-scene fade-in-section">` with `ALN-seatingarea.jpg` parallax background (dimmed). Seven short story-beat lines (the "Marcus is dead / memories were taken" premise).

**Decision:** no changes. In-fiction register + already-light density. The darkened ambient background is doing the right work.

### FRAGMENTED MEMORIES · image 07 full-bleed closer

**Current:** `<section id="narrative" class="narrative fade-in-section">` with `ALN-partyentry.jpg` parallax background (rgba 0.5 overlay, less darkened than explanation sections). Contains 4 `.memory-block` divs with the distinctive "MEMORY FRAGMENT" label badges. ~80 words total, medium density.

**New structure:**
```
<section id="narrative" class="narrative fade-in-section">
    <div class="narrative-content">
        <h2 class="section-header">Fragmented Memories</h2>
        <div class="memory-block">...</div>  <!-- Block 1: SUSPECT -->
        <div class="memory-block">...</div>  <!-- Block 2: supposed to remember -->
        <div class="memory-block">...</div>  <!-- Block 3: BURY / EXPOSE -->
        <div class="memory-block">...</div>  <!-- Block 4: get your story straight / escape -->
    </div>

    <!-- NEW: Full-bleed closer image -->
    <div class="section-closer-image">
        <img src="images/aln-07-flashlights.jpg"
             alt="Four players examining evidence under flashlights"
             style="object-position: 50% 5%;"
             loading="lazy">
    </div>
</section>
```

**Image 07 crop:** aspect-ratio 21/9, `object-position: 50% 5%`. All four heads preserved (back-right player's hair clip at ~1.85% is imperceptible). Flashlights visible. Shared document at bottom of source cropped out — acceptable trade since the emotional beat comes from the faces, not the papers.

**Why it works in an in-fiction section:** image 07's dramatic cross-lighting (warm orange from upper-left, cool blue from right) and tight face framing make the subjects read as "people in pressure" more than "players at a friendly game." Nametags are visible but subtle. The intensity of the expressions aligns with the in-fiction thriller voice.

**Positional rule:** image lands *after* memory block 4 ("ALL of you must get your story straight and escape the warehouse before the time is up..."), hugging the bottom edge of the `.narrative` section so it leads into the following SF Chronicle press quote interlude.

### SF Chronicle press quote interlude · no changes

Floats between FRAGMENTED MEMORIES and WHAT EXACTLY IS ALN. Existing `.testimonial.testimonial--press` styling unchanged. The full-bleed image 07 above and the darkened `ALN-noirdrugwall.jpg` parallax below frame this quote as a breathing moment between two visually heavy beats.

### WHAT EXACTLY IS ABOUT LAST NIGHT? · image 02 side-by-side + image 08 contained banner

**Current:** `<section id="what-exactly-is-about-last-night" class="explanation-section fade-in-section">` with `ALN-noirdrugwall.jpg` parallax background (heavy 0.80 overlay, scanlines). 7 paragraphs of prose, 164 words total, uniformly medium density (14-39 words per paragraph). This is the true density hot spot on the page.

**Cluster identification:**
- ¶1 (14 words): setup — "Think escape room meets murder mystery — but you're not solving for the 'right' answer."
- **¶2-5 (96 words): mechanic cluster** — "narrative archeology / you get to CHOOSE / bury-expose-trade / piecing together truth"
- ¶6 (39 words): accessibility reassurance — "no audience watching / not an actor / not a puzzle expert"
- ¶7 (15 words): closing question — "what kind of story do you want to tell tonight?"
- CTA inline link to `how-to-play.html`

**New structure:**
```
<section id="what-exactly-is-about-last-night" class="explanation-section fade-in-section"
         style="background: linear-gradient(rgba(0,0,0,0.80), rgba(0,0,0,0.80)), url('images/ALN-noirdrugwall.jpg') center/cover fixed;">
    <div class="content-container">
        <h2 class="section-header">What exactly is 'About Last Night...'?</h2>

        <p>Think escape room meets murder mystery — but you're not solving for the "right" answer.</p>

        <!-- NEW: Side-by-side with image on right, ¶2-5 cluster on left -->
        <div class="side-by-side side-by-side--image-right">
            <div class="side-by-side__text">
                <p>Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.</p>
                <p>But here's the thing: you get to <span class="corrupt">CHOOSE</span> whether or not you share what you've found.</p>
                <p>Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth.</p>
                <p>Instead, as you discover more about yourself and others, you are piecing together a 'truth' convincing enough to the authorities to clear <span class="corrupt">YOUR</span> name.</p>
            </div>
            <div class="side-by-side__image">
                <img src="images/aln-02-newspaper.jpg"
                     alt="Two players examining a newspaper clue together"
                     loading="lazy">
            </div>
        </div>

        <p>You don't need to be an actor — there's no audience watching. You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.</p>

        <!-- NEW: Contained banner between ¶6 and ¶7 -->
        <!-- Note: aspect-ratio 2/1 and object-position are image-specific overrides;
             see crop spec table. Default inline-banner is 2.5/1 but image 08 needs
             more vertical to preserve both heads and the character briefs. -->
        <div class="inline-banner">
            <img src="images/aln-08-couch-laughing.jpg"
                 alt="Two players laughing comfortably on a couch while reading character briefs"
                 style="aspect-ratio: 2/1; object-position: 50% 5%;"
                 loading="lazy">
        </div>

        <p>You just need to decide: what kind of story do you want to tell tonight?</p>

        <div class="cta-wrapper">
            <a href="how-to-play.html" class="cta-inline">Learn more about how the game is played →</a>
        </div>
    </div>
</section>
```

**Image 02 (side-by-side):** native portrait 3:4, no crop required. Placed on the **right** of the text column (`side-by-side--image-right` modifier) for directional variety with OUR PHILOSOPHY's left-placed image 05. Subjects in image 02 face inward/downward toward the document — gaze subtly leads the reader back into the left text column.

**Image 08 (contained banner):** aspect-ratio 2/1, `object-position: 50% 5%`. Less aggressive than 2.5:1 because the briefs in the women's laps are critical content (not just context) — they're the physical artifact that makes the image read as "reading character briefs, no audience watching." The 2:1 crop preserves both heads and ~60% of the briefs. At 820px container width this renders ~410px tall.

**Note on image 08's vertical dominance:** image 08 at 2:1 is slightly TALLER than image 02 in side-by-side (410 vs 347). This breaks the usual side-by-side < contained banner hierarchy. Accepted trade-off because a correct crop that preserves the content matters more than strict visual hierarchy.

### CREATORS · density flag, no image action

**Current:** `<section class="creators">` with 4 `.personnel-file` blocks (Shuai, Max, Casey, OTC), each with ~80 words of credentials. Dense but no player photos in the new set fit this section (subject is the creators themselves).

**Decision:** no image placement. Flagged as a separate design concern. Possible future moves: add creator headshots (out of scope — don't have them), reformat as a 2×2 grid instead of 4 vertical blocks, add a pull-quote treatment, or accept the density as a "trust is earned through text" intentional choice.

### OUR PHILOSOPHY · image 05 side-by-side + image 06 full-bleed closer

**Current:** `<section id="why-we-made-this" class="explanation-section fade-in-section">` with `ALN-noirdrugwall.jpg` parallax background. 9 "paragraphs" but only ¶4-6 are real prose (27/38/46 words); the rest are short bullets (¶1-3 at 12-15 words, ¶7-8 at 9 words each, ¶9 at 19 words as the close).

**Cluster identification:**
- ¶1 (lead callout, 14 words): "collage of game elements that 'aren't supposed to go together'"
- ¶2-3 (27 words combined): bullets — combine favorites / explore boundaries
- **¶4-6 (111 words): why + who cluster** — accessible to all friends / commoditized info / indie artists
- ¶7-8 (18 words combined): bullets — ambitious/DIY/evolving / every run we learn
- ¶9 (19 words): close — "If that sounds like your kind of weird, Join the party!"

**New structure:**
```
<section id="why-we-made-this" class="explanation-section fade-in-section"
         style="background: linear-gradient(rgba(15, 15, 15, 0.92), rgba(15, 15, 15, 0.94)), url('images/ALN-noirdrugwall.jpg') center/cover fixed; padding: 5rem 2rem;">
    <div class="content-container">
        <h2 class="section-header">Our Philosophy</h2>

        <p>About Last Night... is a collage of game elements that 'aren't supposed to go together'</p>

        <p>We wanted to combine our favorite aspects of escape rooms, immersive experiences, and tabletop gaming.</p>

        <p>We wanted to explore the boundaries of what is possible in experience design.</p>

        <!-- NEW: Side-by-side with image on left, ¶4-6 cluster on right -->
        <div class="side-by-side">
            <div class="side-by-side__image">
                <img src="images/aln-05-intergenerational.jpg"
                     alt="Two players across age ranges collaborating on a puzzle"
                     loading="lazy">
            </div>
            <div class="side-by-side__text">
                <p>We wanted it to be a game that is still accessible to all of our friends, without asking them to be actors, puzzle savants, or social butterflies.</p>
                <p>Most of all, in an age when our personal information and ability to connect are getting increasingly commoditized, we wanted to create a social experience where we could collectively explore some very-real-sh*t™ through the lens of fiction.</p>
                <p>This project is made by a small team of independent artists who've spent years in escape rooms, immersive theater, and game design, using our personal resources to create something weird and interesting while equitably paying our performers and facilitators who make running our game possible.</p>
            </div>
        </div>

        <p>It's ambitious. It's DIY. And it is constantly evolving.</p>

        <p>Every run we learn something to make it better.</p>

        <p>If that sounds like your kind of weird, <a href="#submit-evidence" class="corrupt">Join the party!</a> Let's tell a story <span class="corrupt">about last night</span> together.</p>
    </div>

    <!-- NEW: Full-bleed closer AFTER the Join the party! line -->
    <div class="section-closer-image">
        <img src="images/aln-06-joy-bar.jpg"
             alt="A player laughing at the bar during the game"
             style="object-position: 50% 38%;"
             loading="lazy">
    </div>
</section>
```

**Image 05 (side-by-side):** native portrait 3:4, no crop. Image on the **left** (default `side-by-side`, no modifier). Subjects in image 05 are angled slightly right — their orientation leads the reader's eye from the image into the text column on the right. Paired with the ¶4-6 cluster.

**Image 06 (full-bleed closer):** aspect-ratio 21/9, `object-position: 50% 38%`. Biases the crop upward to preserve both laughing faces, a hint of the pink-heart graffiti above their heads (atmospheric context), and the man's hands holding a document (the "active investigation" anchor). Crops out most of the lower bottle foreground.

**Positional rule:** image 06 lands *after* ¶9 "Join the party!", hugging the bottom edge of the `.explanation-section` so it physically closes the section and leads into whatever comes next (the following Tri-City Voice press quote). The text invitation retains its full weight as a standalone line, and the image becomes the visual answer to it.

### Tri-City Voice press quote interlude · no changes

Unchanged. Floats between OUR PHILOSOPHY and the FAQ grid.

### FAQ · density flag, no image action

Unchanged. The 2-column `.faq-grid` layout already absorbs the dense Q&A content into scannable cards. Inline photos would break the grid and disrupt scan-reading.

### BOOKING (Interest Form) · image 01 full-bleed prelude

**Current:** `<section id="submit-evidence" class="interest-form">` with `ALN-puzzlingtogether.jpg` parallax background. Contains a `.corrupted-header` ("NEURAI INC. - INVESTIGATION SCHEDULING TERMINAL"), `.cta-prompt`, three `.system-note` paragraphs, and the OTC booking iframe inside a 600px-max `.form-container`.

**New structure:**
```
<section id="submit-evidence" class="interest-form">

    <!-- NEW: Full-bleed prelude image at top of section, OUTSIDE form-container -->
    <div class="section-prelude-image">
        <img src="images/aln-01-arrival.jpg"
             alt="Players arriving at the venue entry with character documents in hand"
             style="object-position: 50% 10%;"
             loading="lazy">
    </div>

    <div class="form-container">
        <div class="corrupted-header">
            <span class="glitch"><b><u>NEURAI INC. - INVESTIGATION SCHEDULING TERMINAL</u></b></span>
        </div>
        <p class="cta-prompt">Select your entry point into the investigation.</p>
        <!-- ... existing system-notes ... -->
        <!-- ... existing OTC iframe ... -->
    </div>
</section>
```

**Image 01 crop:** aspect-ratio 21/9, `object-position: 50% 10%`. Image 01's native aspect is already ~16:9 (1.78:1), so cropping to 21:9 is minimal (only 23.6% of source cropped). Visible range 2.36% to 78.72%. All 5-6 player heads comfortably preserved, character docs visible in their hands, graffiti wall backdrop intact. Lower bodies/feet cropped.

**Narrative job:** the reader has just finished the FAQ and a player testimonial and is approaching the booking decision. The image acts as a quiet nudge saying "this is what showing up actually looks like — ordinary people, carrying their character docs, at the venue entry." Not an emotional climax — a welcoming reassurance that overcomes any last-minute hesitation about whether the experience is approachable.

**Positional rule:** image lands at the very top of the `.interest-form` section, *outside* the 600px form-container, spanning the full section width. Sits between the preceding section-divider and the corrupted header.

## Treatment Pattern Specifications

These are the new CSS patterns the implementation will need. All inherit from the existing noir aesthetic (red accents, dark shadows, scanline overlays).

### Pattern A: Side-by-side (portrait image + paragraph cluster)

**Purpose:** Pair a portrait photograph with a thematically cohesive multi-paragraph cluster.

**Layout:**
- CSS Grid, 2 columns, `grid-template-columns: 260px 1fr` (image left, text right)
- Modifier `.side-by-side--image-right` flips to `grid-template-columns: 1fr 260px`
- `gap: 36px`
- `align-items: start` (text pins to top of image; any whitespace falls below the text)
- `margin: 3rem 0` (breathing room above and below)

**Image sub-element:**
- `width: 100%` within the 260px grid column
- `aspect-ratio: 3/4` (portrait)
- `object-fit: cover`
- `border: 1px solid rgba(204, 0, 0, 0.4)`
- `box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7)`
- Optional overlay pseudo-element for scanlines to match section aesthetic

**Text sub-element:**
- Tighter paragraph spacing than the surrounding single-column text: `margin-bottom: 1.1rem` between paragraphs (vs ~1.5rem in the main flow)
- Slightly smaller font: `font-size: 14px` (vs 15px in the main section flow) — reinforces "cluster is a visual unit"
- `padding-top: 0.25rem` to align visually with the image top

**Responsive collapse (below 768px):**
- Grid becomes single column (`grid-template-columns: 1fr`)
- Image appears above text, full container width, aspect-ratio preserved

### Pattern B: Contained landscape banner (inline rhythmic break)

**Purpose:** Rhythmic punctuation between paragraphs inside a section. Not a focal photo — a strip that breaks the wall of text.

**Layout:**
- Full width of the containing `.content-container` (typically 900px max)
- `margin: 2.5rem 0`

**Image sub-element (base styles only):**
- `width: 100%`
- `object-fit: cover`
- Same border/shadow treatment as Pattern A
- Optional scanline overlay

**Per-instance overrides (applied via inline `style` attribute on each `<img>`):**
- `aspect-ratio` — image-specific, chosen based on source composition and how much vertical extent the critical content spans. See crop specs table.
- `object-position` — image-specific, chosen to preserve critical content in the crop. See crop specs table.

This split-responsibility is intentional: the base class carries the layout and visual treatment; the inline style carries the image-specific crop math. Swapping an image requires redoing the crop math and updating the inline style, which the comment marker in the HTML template explicitly flags.

**Responsive:** width scales; aspect ratio maintained.

### Pattern C: Full-bleed landscape closer/prelude

**Purpose:** Section climax image (emotional payoff) or section-beginning prelude. Breaks out of the section's content-container to the full viewport width.

**Layout:**
- Positioned as the last child of a section (closer variant) or the first child (prelude variant)
- Must break out of the parent section's horizontal padding so it spans the full viewport width — implementation technique is up to the plan, but either approach works: (a) negative `margin-left`/`margin-right` matching the section's horizontal padding, or (b) placing the full-bleed element outside the section's `.content-container` (which `.explanation-section` has anyway — the inner container, not the section itself, has the centered max-width).
- For **closer variant**: the containing section's `padding-bottom` should be canceled (either via a section-level modifier class when the section contains a closer, or by using negative bottom margin on the closer equal to the section's bottom padding) so the image physically reaches the section edge and leads into whatever follows.
- For **prelude variant**: same approach for `padding-top`.
- No `max-width` constraint on the image itself — spans full section width (which in practice spans the full viewport since sections use full-width backgrounds).

**Image sub-element (base styles):**
- `width: 100%`
- `aspect-ratio: 21/9` (cinematic, ~2.33:1) — **this is the default for all three full-bleeds and should not be changed without re-evaluation**
- `object-fit: cover`
- `border-top: 1px solid rgba(204, 0, 0, 0.5)` (closer variant only — sits at bottom of section)
- `border-bottom: 1px solid rgba(204, 0, 0, 0.5)` (all)
- Scanline overlay at higher opacity (0.5) for cinematic feel

**Per-instance override (applied via inline `style` attribute on each `<img>`):**
- `object-position` — image-specific, chosen to preserve critical content. See crop specs table.

**Responsive:** width scales to viewport; 21:9 aspect maintained. Height becomes 9/21 of viewport width.

## Image Crop Specifications

Per-image crop decisions for implementation. Source images must be optimized (resized and compressed) before deployment; spec does not prescribe tooling but does prescribe target max dimensions.

| Slot | Source | File name | Aspect crop | `object-position` | Max deploy width | Alt text |
|---|---|---|---|---|---|---|
| BOOKING prelude | `alnselections (1 of 9).jpg` | `aln-01-arrival.jpg` | 21/9 | `50% 10%` | 1600px | "Players arriving at the venue entry with character documents in hand" |
| WHAT EXACTLY IS ALN mid (side-by-side) | `alnselections (2 of 9).jpg` | `aln-02-newspaper.jpg` | 3/4 (native) | `50% 50%` (default) | 600px | "Two players examining a newspaper clue together" |
| OUR PHILOSOPHY mid (side-by-side) | `alnselections (5 of 9).jpg` | `aln-05-intergenerational.jpg` | 3/4 (native) | `50% 50%` (default) | 600px | "Two players across age ranges collaborating on a puzzle" |
| OUR PHILOSOPHY closer | `alnselections (6 of 9).jpg` | `aln-06-joy-bar.jpg` | 21/9 | `50% 38%` | 1600px | "A player laughing at the bar during the game" |
| FRAGMENTED MEMORIES closer | `alnselections (7 of 9).jpg` | `aln-07-flashlights.jpg` | 21/9 | `50% 5%` | 1600px | "Four players examining evidence under flashlights in dramatic cross-lighting" |
| WHAT EXACTLY IS ALN late (contained banner) | `alnselections (8 of 9).jpg` | `aln-08-couch-laughing.jpg` | 2/1 | `50% 5%` | 1600px | "Two players laughing comfortably on a couch while reading character briefs" |

**Note on `aln-08-couch-laughing.jpg`:** aspect-ratio 2/1 is tighter than the other contained banners would ideally be, but was chosen because image 08's composition has critical content (the character briefs in the women's laps) at 54-80% of source vertical, alongside the heads at 6-38% — together that's 74% of the source which forces a less aggressive crop than the default pattern contained banner aspect. This is an image-specific exception, not a pattern-level decision.

**Max deploy widths** are chosen to cover up to ~1400px rendered width (2× for Retina) plus a safety margin. Actual optimized file sizes should target <500KB per image using JPEG quality 80-85.

## Content-Editor Considerations

Per `CLAUDE.md`, content editors must be able to understand and update images without developer involvement. Each new image placement should be wrapped in a comment marker block matching the existing pattern. Template:

```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE IMAGE: <SLOT NAME>                             -->
<!-- SAFE TO EDIT: Replace image file, update alt text       -->
<!-- DO NOT EDIT: div structure, class names                 -->
<!-- FIND WITH: Search for "<SLOT NAME>" or filename         -->
<!-- ═══════════════════════════════════════════════════════ -->
```

Example for OUR PHILOSOPHY closer:
```html
<!-- ═══════════════════════════════════════════════════════ -->
<!-- EDITABLE IMAGE: OUR PHILOSOPHY CLOSER                   -->
<!-- SAFE TO EDIT: Replace aln-06-joy-bar.jpg with another   -->
<!--   landscape image, update alt text                      -->
<!-- DO NOT EDIT: div class, aspect-ratio, object-position   -->
<!--   (crop is tuned to this specific photo — new photos    -->
<!--    will need a new object-position value)               -->
<!-- FIND WITH: Search for "OUR PHILOSOPHY CLOSER" or        -->
<!--   "aln-06-joy-bar"                                      -->
<!-- ═══════════════════════════════════════════════════════ -->
```

The comment marker's reminder that `object-position` is image-specific is important — it prevents editors from swapping images without realizing the crop math needs to be redone.

## Implementation Notes

These are pointers for the implementation plan, not line-by-line instructions:

1. **Image optimization first.** The source files are 2-25 MB each. They must be resized (1600px max width for full-bleed and contained banners, 600px for side-by-side portraits) and JPEG-compressed (quality 80-85) before commit. Target <500KB per deployed file.

2. **Place optimized images in `images/`** with names matching the "File name" column of the crop spec table. Do not commit the source files to the repo.

3. **CSS additions go in a new file: `css/images.css`**, loaded after `css/layout.css` in the `<head>`. This keeps the three new treatment patterns together and separable from existing layout code. Update `index.html` to link the new stylesheet.

4. **HTML edits to `index.html`** are in four sections:
   - `.narrative` (FRAGMENTED MEMORIES) — insert `<div class="section-closer-image">` after `.narrative-content`
   - `.explanation-section#what-exactly-is-about-last-night` (WHAT EXACTLY IS ALN) — insert side-by-side after ¶1, insert contained banner between ¶6 and ¶7
   - `.explanation-section#why-we-made-this` (OUR PHILOSOPHY) — insert side-by-side after ¶3, insert full-bleed closer after ¶9 (outside `.content-container`)
   - `.interest-form` (BOOKING) — insert section-prelude-image before `.form-container`

5. **Pre-commit HTML validation.** The existing `tidy` pre-commit hook will validate the new markup. New `<div>` and `<img>` elements should pass without issue; the hook is strict about unclosed tags and nesting errors.

6. **Post-deployment checks** (per `CLAUDE.md` deployment procedures):
   - Force-refresh the deployed site (Ctrl+Shift+R)
   - Visual check of all four modified sections
   - Mobile responsive test (side-by-side collapse below 768px)
   - Lighthouse audit: FCP <1.5s, LCP <2.5s, CLS <0.1 (image `loading="lazy"` required to meet this)
   - Keyboard navigation still functions

## Deferred Items

These were identified during brainstorming but are not part of this spec's scope:

1. **CREATORS section density** — real problem, no solution in current image set. Needs a separate design effort focused on typography/layout restructuring or creator-headshot acquisition.

2. **Parked images 03, 04, 09** — held as alternates. Image 03 functionally overlaps with image 02. Image 04 functionally overlaps with image 07. Image 09 ("graffiti reach") has no strong beat match on the current landing page but may find a home on `how-to-play.html` or in press/marketing materials.

3. **Side-by-side treatment on `how-to-play.html`** — the treatment patterns developed here could enhance the how-to-play page's explanations. Not in scope for the index.html-focused design.

4. **Press page updates** — if any of the 9 new images should be added to the press kit gallery, that is a `press.html` concern addressed separately.

5. **Creator headshots** — if the creator headshots become available, CREATORS section could get a different kind of image treatment (e.g., headshot + credentials 2×2 grid). Out of scope until headshots exist.
