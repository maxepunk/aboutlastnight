# Image Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate 6 of 9 new marketing photos into `index.html` as a foreground layer over the existing noir-parallax background system, per the design spec at `docs/superpowers/specs/2026-04-06-image-integration-design.md`.

**Architecture:** One new CSS file (`css/images.css`) containing three treatment patterns (side-by-side portrait, contained landscape banner, full-bleed landscape closer/prelude). Six new optimized JPEG assets in `images/`. Five HTML edits to `index.html` adding new markup blocks at specific paragraph-break points within four sections. No changes to existing CSS files. No changes to JS. No changes to other HTML pages. Pre-commit `tidy` hook validates HTML automatically.

**Tech Stack:** Static HTML5, vanilla CSS (no preprocessor), no build step, no JS additions. `ffmpeg` for image optimization (already on PATH per environment). GitHub Pages for hosting (auto-deploys from `main`).

## Context for the Implementing Engineer

If you're reading this without having been in the brainstorming session, here's what you need to know:

- **The site** is the landing page for "About Last Night...", a limited-run immersive crime thriller. `index.html` is the marketing landing page with hero, story-premise sections, gameplay explanation, creators bios, philosophy, FAQ, and a booking iframe.
- **Why these images:** A photographer delivered 9 candid player photos from real sessions. The current landing page has almost no foreground photography — it relies on a deliberate "noir-parallax" system (every section has a darkened fixed-attachment background photo). The 9 new photos give us the chance to add foreground player imagery without breaking that system.
- **Why these specific 6 of 9:** During brainstorming we measured prose density per section, identified register risks (in-fiction vs meta copy), and matched each image to a specific narrative beat or density-break point. Three images are parked as alternates with no clear home. See the design spec for the per-image rationale and the brainstorming history.
- **The "design spec" file** (`docs/superpowers/specs/2026-04-06-image-integration-design.md`) is the source of truth for every design decision. If anything in this plan looks wrong, check the spec first.
- **Each image has a tuned crop.** The crop isn't decorative — it preserves specific subjects (faces, character docs, dramatic lighting, etc.) that the design spec identifies. Aspect-ratio and `object-position` values are baked into per-image inline styles in the HTML, not into the CSS classes, so they can be tuned per-image without polluting the base treatment classes.
- **Don't touch** any other HTML files (`playtest.html`, `feedback.html`, `how-to-play.html`, `press.html`), any existing CSS files (`base.css`, `layout.css`, `components.css`, `animations.css`), any JS files, or any of the existing `ALN-*.jpg` images that are currently used as parallax backgrounds. All of those are out of scope.
- **The pre-commit hook runs `tidy`** to validate HTML. If it fails on commit, do NOT use `--no-verify`. Read the error, fix the issue, re-stage, re-commit.
- **You can preview changes locally** by running `python3 -m http.server` in the project root and visiting `http://localhost:8000`. Forms won't work locally (Google Apps Script backend), but visual layout will.
- **Source images live OUTSIDE the repo** at `C:/Users/spide/Downloads/marketing select/alnselections (1-9 of 9).jpg`. They are 2-25 MB each. The optimization step in Task 1 produces web-friendly versions inside `images/`. Do NOT commit the originals.
- **Image filename convention:** `aln-NN-semantic-name.jpg` where NN matches the source image number (1-9) and the name describes the content. This helps content editors understand what each image is when browsing the `images/` directory.

## File Structure

Files this plan creates or modifies. Nothing else is touched.

| File | What it does | Change |
|---|---|---|
| `css/images.css` | New stylesheet with three image treatment patterns: side-by-side, inline-banner, section-closer-image / section-prelude-image. Loaded after `css/components.css` in `index.html`. | **CREATE** |
| `images/aln-01-arrival.jpg` | Players arriving at venue entry with character docs. BOOKING prelude image. | **CREATE** (optimized from source) |
| `images/aln-02-newspaper.jpg` | Two players examining a newspaper clue. WHAT EXACTLY IS ALN side-by-side. | **CREATE** (optimized from source) |
| `images/aln-05-intergenerational.jpg` | Two players across age ranges collaborating on a puzzle. OUR PHILOSOPHY side-by-side. | **CREATE** (optimized from source) |
| `images/aln-06-joy-bar.jpg` | Player laughing at the bar. OUR PHILOSOPHY full-bleed closer. | **CREATE** (optimized from source) |
| `images/aln-07-flashlights.jpg` | Four players examining evidence under flashlights. FRAGMENTED MEMORIES full-bleed closer. | **CREATE** (optimized from source) |
| `images/aln-08-couch-laughing.jpg` | Two players laughing on a couch with character briefs. WHAT EXACTLY IS ALN contained banner. | **CREATE** (optimized from source) |
| `index.html` | Five edits across four sections: add CSS link in `<head>`, add side-by-side wrapper in OUR PHILOSOPHY, add full-bleed closer in OUR PHILOSOPHY, add side-by-side wrapper in WHAT EXACTLY IS ALN, add contained banner in WHAT EXACTLY IS ALN, add full-bleed closer in FRAGMENTED MEMORIES, add full-bleed prelude in BOOKING. | **MODIFY** |

**Tasks 4-12 build on each other.** The CSS file is built up incrementally, with each pattern added in its own task and immediately tested in real context by the next HTML task. This catches problems early.

---

## Task 1: Optimize and Add 6 Image Assets

**Files:**
- Create: `images/aln-01-arrival.jpg`
- Create: `images/aln-02-newspaper.jpg`
- Create: `images/aln-05-intergenerational.jpg`
- Create: `images/aln-06-joy-bar.jpg`
- Create: `images/aln-07-flashlights.jpg`
- Create: `images/aln-08-couch-laughing.jpg`

**What this does:** Produces web-friendly optimized JPEGs from the high-resolution source files in `C:/Users/spide/Downloads/marketing select/`. Landscape images (used as full-bleed or contained banners) are scaled to max 1600px width. Portrait images (used in side-by-side at 260px wide on desktop) are scaled to max 600px width to provide ~2× retina margin without bloating file size.

- [ ] **Step 1: Verify ffmpeg is available**

Run:
```bash
ffmpeg -version
```

Expected: ffmpeg version output (any recent version is fine).

If ffmpeg is not on PATH, install it via `winget install Gyan.FFmpeg` (Windows) and re-run.

- [ ] **Step 2: Verify all 9 source files exist at the expected location**

Run:
```bash
ls "C:/Users/spide/Downloads/marketing select/" | grep alnselections
```

Expected output (9 lines):
```
alnselections (1 of 9).jpg
alnselections (2 of 9).jpg
alnselections (3 of 9).jpg
alnselections (4 of 9).jpg
alnselections (5 of 9).jpg
alnselections (6 of 9).jpg
alnselections (7 of 9).jpg
alnselections (8 of 9).jpg
alnselections (9 of 9).jpg
```

If the directory doesn't exist or files are missing, stop and resolve before proceeding. The 6 specific source files this plan needs are 1, 2, 5, 6, 7, 8.

- [ ] **Step 3: Verify the `images/` directory exists**

Run:
```bash
ls images/ | head -5
```

Expected: directory exists with existing `ALN-*.jpg` files. (Don't need to list everything — just confirm it's there.)

- [ ] **Step 4: Optimize image 01 (arrival) — 1600px max width**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (1 of 9).jpg" -vf "scale='min(1600,iw)':-2" -q:v 4 images/aln-01-arrival.jpg
```

Expected: ffmpeg outputs `frame=    1 fps=...` and writes the file. No errors.

- [ ] **Step 5: Optimize image 02 (newspaper) — 600px max width (portrait)**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (2 of 9).jpg" -vf "scale='min(600,iw)':-2" -q:v 4 images/aln-02-newspaper.jpg
```

Expected: ffmpeg outputs frame info, no errors.

- [ ] **Step 6: Optimize image 05 (intergenerational) — 600px max width (portrait)**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (5 of 9).jpg" -vf "scale='min(600,iw)':-2" -q:v 4 images/aln-05-intergenerational.jpg
```

- [ ] **Step 7: Optimize image 06 (joy at bar) — 1600px max width**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (6 of 9).jpg" -vf "scale='min(1600,iw)':-2" -q:v 4 images/aln-06-joy-bar.jpg
```

- [ ] **Step 8: Optimize image 07 (flashlights) — 1600px max width**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (7 of 9).jpg" -vf "scale='min(1600,iw)':-2" -q:v 4 images/aln-07-flashlights.jpg
```

- [ ] **Step 9: Optimize image 08 (couch laughing) — 1600px max width**

Run:
```bash
ffmpeg -y -i "C:/Users/spide/Downloads/marketing select/alnselections (8 of 9).jpg" -vf "scale='min(1600,iw)':-2" -q:v 4 images/aln-08-couch-laughing.jpg
```

- [ ] **Step 10: Verify all 6 output files exist and check sizes**

Run:
```bash
ls -la images/aln-0*.jpg
```

Expected: 6 files listed, each between 100KB and 600KB. If any file is >700KB, it's larger than the design spec target — re-run that file's ffmpeg command with `-q:v 5` (slightly more compression) instead of `-q:v 4`.

- [ ] **Step 11: Spot-check one image visually**

Open `images/aln-01-arrival.jpg` in any image viewer (Windows: just double-click). Verify it's the arrival/briefing scene with players at the graffiti entry. If you see something different, you have a numbering mismatch — stop and re-verify the source filenames before proceeding.

- [ ] **Step 12: Commit the new image assets**

Run:
```bash
git add images/aln-01-arrival.jpg images/aln-02-newspaper.jpg images/aln-05-intergenerational.jpg images/aln-06-joy-bar.jpg images/aln-07-flashlights.jpg images/aln-08-couch-laughing.jpg
git commit -m "$(cat <<'EOF'
chore(images): add 6 optimized marketing photos

Optimized from source files at C:/Users/spide/Downloads/marketing select/
using ffmpeg. Landscape images max width 1600px (full-bleed and
contained banner usage), portrait images max width 600px (side-by-side
at 260px desktop, ~320px mobile, with 2x retina margin).

Image-to-placement mapping per design spec:
- aln-01-arrival.jpg → BOOKING prelude
- aln-02-newspaper.jpg → WHAT EXACTLY IS ALN side-by-side
- aln-05-intergenerational.jpg → OUR PHILOSOPHY side-by-side
- aln-06-joy-bar.jpg → OUR PHILOSOPHY full-bleed closer
- aln-07-flashlights.jpg → FRAGMENTED MEMORIES full-bleed closer
- aln-08-couch-laughing.jpg → WHAT EXACTLY IS ALN contained banner

See docs/superpowers/specs/2026-04-06-image-integration-design.md
EOF
)"
```

Expected: commit succeeds. No pre-commit hook output (the hook only runs on HTML edits).

---

## Task 2: Create `css/images.css` with Side-by-side Pattern (Pattern A)

**Files:**
- Create: `css/images.css`

**What this does:** Creates the new stylesheet with the first treatment pattern (side-by-side portrait + paragraph cluster) and its mobile responsive collapse. Pattern B (contained banner) and Pattern C (full-bleed) are added in later tasks (Task 6 and Task 8 respectively) so each pattern can be tested in real HTML context immediately after being defined.

- [ ] **Step 1: Create the file with the file-level header and Pattern A only**

Use the Write tool on `css/images.css` with this content:

```css
/* ═══════════════════════════════════════════════════════════════ */
/*  IMAGE TREATMENTS                                                */
/*  Three patterns for integrating new marketing photos into        */
/*  index.html as a foreground layer over the existing noir-        */
/*  parallax background system.                                     */
/*                                                                  */
/*  Pattern A: Side-by-side portrait + paragraph cluster            */
/*  Pattern B: Contained landscape banner (inline rhythm break)     */
/*  Pattern C: Full-bleed landscape closer / prelude                */
/*                                                                  */
/*  Per-image crops (aspect-ratio, object-position) are applied    */
/*  via inline style attributes on the <img> elements, not in this */
/*  file. Each crop is tuned to the specific source image's        */
/*  composition. See docs/superpowers/specs/2026-04-06-image-      */
/*  integration-design.md for the per-image crop spec table.       */
/* ═══════════════════════════════════════════════════════════════ */


/* ─── PATTERN A: SIDE-BY-SIDE ─────────────────────────────────── */
/*
   A portrait image paired with a multi-paragraph text cluster.
   The cluster must be a thematically cohesive group of paragraphs
   that fills enough vertical space to balance against the image
   (target ~70% fill of image height with text content).
   
   Default: image LEFT, text RIGHT.
   Modifier .side-by-side--image-right flips to text LEFT, image RIGHT.
*/

.side-by-side {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 36px;
  align-items: start;
  margin: 3rem auto;
  max-width: 900px;
  position: relative;
}

.side-by-side--image-right {
  grid-template-columns: 1fr 260px;
}

.side-by-side__image {
  position: relative;
}

.side-by-side__image img {
  width: 100%;
  aspect-ratio: 3/4;
  object-fit: cover;
  display: block;
  border: 1px solid rgba(204, 0, 0, 0.4);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
}

/* Scanline overlay matches the existing explanation-section aesthetic */
.side-by-side__image::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
  opacity: 0.4;
}

.side-by-side__text {
  padding-top: 0.25rem;
}

/* Text cluster paragraphs use tighter spacing and slightly smaller
   font than the surrounding section flow, so the cluster reads as
   a visual unit rather than three loose paragraphs. */
.side-by-side__text p {
  font-size: 14px;
  line-height: 1.8;
  margin-bottom: 1.1rem;
}

.side-by-side__text p:last-child {
  margin-bottom: 0;
}

/* Mobile: collapse to single column. HTML order determines
   stacking — for default variant, image stacks above text;
   for reverse variant, text stacks above image. Both work. */
@media (max-width: 768px) {
  .side-by-side,
  .side-by-side--image-right {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .side-by-side__image img {
    max-width: 320px;
    margin: 0 auto;
    aspect-ratio: 3/4;
  }
}
```

- [ ] **Step 2: Verify the file was written**

Run:
```bash
ls -la css/images.css
wc -l css/images.css
```

Expected: file exists, ~85 lines.

- [ ] **Step 3: Visual sanity check via grep**

Run:
```bash
grep -c "PATTERN A" css/images.css
grep -c "side-by-side" css/images.css
```

Expected: PATTERN A appears at least once. side-by-side appears at least 8 times.

- [ ] **Step 4: Commit**

Run:
```bash
git add css/images.css
git commit -m "feat(css): add side-by-side image treatment pattern

New stylesheet css/images.css with Pattern A (side-by-side portrait
+ paragraph cluster). Patterns B and C will be added incrementally
in later commits as each pattern is tested in real context.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: commit succeeds.

---

## Task 3: Link `css/images.css` from `index.html`

**Files:**
- Modify: `index.html` (head section, around line 17)

**What this does:** Adds the `<link rel="stylesheet">` tag for the new CSS file in `index.html`'s `<head>`, immediately after the existing `css/components.css` link and before `css/animations.css`. This load order matters: images.css needs to come after components.css so it can override component styles if needed, but before animations.css so animation overrides still work.

- [ ] **Step 1: Read the current head block of index.html**

Use the Read tool on `index.html` with limit=30 to load just the head section.

- [ ] **Step 2: Verify the existing CSS link block looks like the expected pattern**

The CSS links should look like:
```html
    <!-- CSS Files -->
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/layout.css">
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/animations.css">
```

If it doesn't look like this, stop and figure out what's different before proceeding.

- [ ] **Step 3: Add the new link with the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/animations.css">
```

**new_string:**
```
    <link rel="stylesheet" href="css/components.css">
    <link rel="stylesheet" href="css/images.css">
    <link rel="stylesheet" href="css/animations.css">
```

- [ ] **Step 4: Verify the edit landed**

Run:
```bash
grep -n "css/images.css" index.html
```

Expected: one matching line showing the new `<link>` tag.

- [ ] **Step 5: Verify the existing pre-commit `tidy` hook will validate the change**

Run:
```bash
git diff index.html
```

Expected: shows the one-line addition. No other changes.

- [ ] **Step 6: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): link new css/images.css stylesheet

Adds css/images.css to the head <link> chain, between
components.css and animations.css. Required for the image
treatment patterns introduced in subsequent commits."
```

Expected: pre-commit `tidy` runs and passes. Commit succeeds.

---

## Task 4: Add Side-by-side Image to OUR PHILOSOPHY (image 05, ¶4-6 cluster)

**Files:**
- Modify: `index.html` (around lines 256-278, the `#why-we-made-this` section)

**What this does:** Wraps the ¶4-5-6 cluster of OUR PHILOSOPHY (the "accessible to all friends / commoditized info / indie artists" three-paragraph block) inside a `.side-by-side` container with image 05 positioned to the LEFT (default placement, no modifier class). This is the first real-world use of Pattern A from Task 2.

The three paragraphs being clustered are:
- ¶4: "We wanted it to be a game that is still accessible to all of our friends..."
- ¶5: "Most of all, in an age when our personal information..."
- ¶6: "This project is made by a small team of independent artists..."

The image (260px wide × 3:4 aspect = ~347px tall) anchors the cluster as the visual representation of "accessible / inclusive / made by a small team."

- [ ] **Step 1: Read the OUR PHILOSOPHY section of index.html**

Use the Read tool on `index.html` with offset=251 limit=35 to load lines 251-285. Verify you see the section opening at line ~256 (`<section id="why-we-made-this"...>`) and ¶4-5-6 inside the `.content-container`.

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
            <p>About Last Night... is a collage of game elements that 'aren't supposed to go together'</p>
			
			<p>We wanted to combine our favorite aspects of escape rooms, immersive experiences, and tabletop gaming. </p>
			
			<p>We wanted to explore the boundaries of what is possible in experience design.</p> 
       
			<p> We wanted it to be a game that is still accessible to all of our friends, without asking them to be actors, puzzle savants, or social butterflies.</p>
			
			<p> Most of all, in an age when our personal information and ability to connect are getting increasingly commoditized, we wanted to create a social experience where we could collectively explore some very-real-sh*t™ through the lens of fiction. </p>

            <p>This project is made by a small team of independent artists who've spent years in escape rooms, immersive theater, and game design, using our personal resources to  to create something weird and interesting while equitably paying our performers and facilitators who make running our game possible.</p>
```

**new_string:**
```
            <p>About Last Night... is a collage of game elements that 'aren't supposed to go together'</p>
			
			<p>We wanted to combine our favorite aspects of escape rooms, immersive experiences, and tabletop gaming. </p>
			
			<p>We wanted to explore the boundaries of what is possible in experience design.</p> 
       
            <!-- ═══════════════════════════════════════════════════════ -->
            <!-- EDITABLE IMAGE: PHILOSOPHY SIDE-BY-SIDE                 -->
            <!-- SAFE TO EDIT: Replace src with another portrait image,  -->
            <!--   update alt text. Default placement: image LEFT.       -->
            <!-- DO NOT EDIT: div class names or grid structure.         -->
            <!-- FIND WITH: Search for "PHILOSOPHY SIDE-BY-SIDE" or      -->
            <!--   "aln-05-intergenerational"                            -->
            <!-- ═══════════════════════════════════════════════════════ -->
            <div class="side-by-side">
                <div class="side-by-side__image">
                    <img src="images/aln-05-intergenerational.jpg"
                         alt="Two players across age ranges collaborating on a puzzle"
                         loading="lazy">
                </div>
                <div class="side-by-side__text">
                    <p>We wanted it to be a game that is still accessible to all of our friends, without asking them to be actors, puzzle savants, or social butterflies.</p>
                    <p>Most of all, in an age when our personal information and ability to connect are getting increasingly commoditized, we wanted to create a social experience where we could collectively explore some very-real-sh*t™ through the lens of fiction.</p>
                    <p>This project is made by a small team of independent artists who've spent years in escape rooms, immersive theater, and game design, using our personal resources to  to create something weird and interesting while equitably paying our performers and facilitators who make running our game possible.</p>
                </div>
            </div>
```

Note: leading whitespace and the pre-existing inconsistent indentation (mixed tabs and spaces) is preserved exactly. Match it character-for-character.

- [ ] **Step 3: Verify the edit landed and ¶4-6 are now inside the side-by-side wrapper**

Run:
```bash
grep -n "PHILOSOPHY SIDE-BY-SIDE" index.html
grep -n "aln-05-intergenerational" index.html
grep -c "side-by-side__text" index.html
```

Expected output:
- PHILOSOPHY SIDE-BY-SIDE: matched on one line (the comment marker)
- aln-05-intergenerational: matched on one line (the img src)
- side-by-side__text count: 1

- [ ] **Step 4: Visual sanity check by serving locally**

Run:
```bash
python3 -m http.server 8000
```

Expected: server starts on port 8000.

In a browser, visit `http://localhost:8000` and scroll down to the "Our Philosophy" section. Verify:
- ¶1-3 still appear above the image as single-column paragraphs
- The image of two players across age ranges sits on the LEFT
- ¶4-6 sit to the RIGHT of the image as a tighter text cluster
- ¶7-9 (ambitious/DIY/Join the party) appear below the image as single-column paragraphs again
- The image has a subtle red-tinted border and dark shadow
- The scanline overlay is visible on the image (matches the section's existing scanline aesthetic)

Stop the server with Ctrl+C when done.

- [ ] **Step 5: Mobile responsive check**

Restart the server (`python3 -m http.server 8000`), open `http://localhost:8000` in a browser, open DevTools (F12), enable device emulation (Ctrl+Shift+M), select a viewport width below 768px (e.g., iPhone SE = 375px). Verify:
- The side-by-side collapses to single column
- The image appears at the top of the cluster, max-width ~320px, centered
- ¶4-6 stack below the image as single-column text
- No horizontal scroll
- ¶1-3 and ¶7-9 still flow normally above and below

Stop the server.

- [ ] **Step 6: Commit (pre-commit `tidy` will validate the new HTML)**

Run:
```bash
git add index.html
git commit -m "feat(index): add side-by-side image to OUR PHILOSOPHY

Wraps the ¶4-6 cluster (accessible/commoditized/indie artists)
inside a .side-by-side container with image 05 (intergenerational
collaboration) positioned LEFT. The cluster anchors the section's
'who this is for and who's making it' beat as a single visual unit.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit `tidy` runs and passes. Commit succeeds.

If `tidy` fails, read the error carefully — the most likely issue is a malformed entity in the very-real-sh*t™ string or an unbalanced div. Fix in place, re-stage, re-commit. Do NOT bypass the hook.

---

## Task 5: Add Reverse Side-by-side Image to WHAT EXACTLY IS ALN (image 02, ¶2-5 cluster)

**Files:**
- Modify: `index.html` (around lines 158-181, the `#what-exactly-is-about-last-night` section)

**What this does:** Wraps ¶2-5 of WHAT EXACTLY IS ALN (the "narrative archeology / choose / bury-expose-trade / piecing together truth" four-paragraph mechanic cluster) inside a `.side-by-side .side-by-side--image-right` container with image 02 (newspaper close-up) positioned to the RIGHT. Tests the reverse modifier.

The cluster:
- ¶2: "Every puzzle unlocks a piece of the past..."
- ¶3: "But here's the thing: you get to CHOOSE..."
- ¶4: "Bury a memory for profit. Expose it as evidence. Trade it for leverage..."
- ¶5: "Instead, as you discover more about yourself..."

- [ ] **Step 1: Read the WHAT EXACTLY IS ALN section of index.html**

Use the Read tool on `index.html` with offset=153 limit=35 to load lines 153-187. Verify you see the section opening at line ~158 with `id="what-exactly-is-about-last-night"`.

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
            <p>Think escape room meets murder mystery — but you're not solving for the "right" answer.</p>

            <p>Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.</p>

            <p>But here's the thing: you get to <span class="corrupt">CHOOSE</span> whether or not you share what you've found.</p>

            <p>Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth. </p>	


			<p> Instead, as you discover more about yourself and others, you are piecing together a 'truth' convincing enough to the authorities to clear <span class="corrupt">YOUR </span> name. </p>
```

**new_string:**
```
            <p>Think escape room meets murder mystery — but you're not solving for the "right" answer.</p>

            <!-- ═══════════════════════════════════════════════════════ -->
            <!-- EDITABLE IMAGE: WHAT EXACTLY SIDE-BY-SIDE               -->
            <!-- SAFE TO EDIT: Replace src with another portrait image,  -->
            <!--   update alt text. Placement: image RIGHT (reverse).    -->
            <!-- DO NOT EDIT: div class names or grid structure.         -->
            <!-- FIND WITH: Search for "WHAT EXACTLY SIDE-BY-SIDE" or    -->
            <!--   "aln-02-newspaper"                                    -->
            <!-- ═══════════════════════════════════════════════════════ -->
            <div class="side-by-side side-by-side--image-right">
                <div class="side-by-side__text">
                    <p>Every puzzle unlocks a piece of the past. Backstory. Relationships. What actually happened at that party. Call it narrative archeology. You're digging up secrets that belong to everyone in the room.</p>
                    <p>But here's the thing: you get to <span class="corrupt">CHOOSE</span> whether or not you share what you've found.</p>
                    <p>Bury a memory for profit. Expose it as evidence. Trade it for leverage. The "truth" that emerges isn't always the objective truth.</p>
                    <p>Instead, as you discover more about yourself and others, you are piecing together a 'truth' convincing enough to the authorities to clear <span class="corrupt">YOUR </span> name.</p>
                </div>
                <div class="side-by-side__image">
                    <img src="images/aln-02-newspaper.jpg"
                         alt="Two players examining a newspaper clue together"
                         loading="lazy">
                </div>
            </div>
```

Note: in the source HTML, the `<span class="corrupt">YOUR </span>` element preserves its trailing space (matches the existing odd whitespace in the file). Match it exactly.

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "WHAT EXACTLY SIDE-BY-SIDE" index.html
grep -n "aln-02-newspaper" index.html
grep -c "side-by-side--image-right" index.html
```

Expected:
- WHAT EXACTLY SIDE-BY-SIDE: 1 line
- aln-02-newspaper: 1 line
- side-by-side--image-right count: 1

- [ ] **Step 4: Visual check**

Start the local server (`python3 -m http.server 8000`), visit `http://localhost:8000`, scroll to "What exactly is 'About Last Night...'?". Verify:
- ¶1 ("Think escape room...") still appears above the image as single-column
- ¶2-5 cluster is on the LEFT
- Image 02 (newspaper close-up) is on the RIGHT
- ¶6 ("You don't need to be an actor...") appears below the image as single-column
- The reverse-modifier visual ordering is correct (text left, image right)
- Subjects in image 02 face inward/down toward the document, not outward

Mobile check at <768px viewport: should collapse to single column with text appearing above image (because in HTML order, text comes first in the reverse variant).

Stop the server.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): add reverse side-by-side to WHAT EXACTLY IS ALN

Wraps the ¶2-5 cluster (narrative archeology / choose / bury-
expose-trade / piecing together truth) inside a side-by-side
container with image 02 (newspaper close-up) positioned RIGHT
via the .side-by-side--image-right modifier. Tests the reverse
variant of Pattern A.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit `tidy` passes, commit succeeds.

---

## Task 6: Add Pattern B (Contained Banner) to `css/images.css`

**Files:**
- Modify: `css/images.css` (append new pattern at end)

**What this does:** Adds the contained landscape banner pattern. Used for an inline rhythmic break image inside a section's content column. Per-image aspect-ratio and object-position are applied via inline `style` attributes on the `<img>` element, not in the CSS class.

- [ ] **Step 1: Read the existing css/images.css**

Use the Read tool on `css/images.css`. Confirm Pattern A is present from Task 2.

- [ ] **Step 2: Append Pattern B with the Edit tool**

Use the Edit tool on `css/images.css`:

**old_string:**
```
@media (max-width: 768px) {
  .side-by-side,
  .side-by-side--image-right {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .side-by-side__image img {
    max-width: 320px;
    margin: 0 auto;
    aspect-ratio: 3/4;
  }
}
```

**new_string:**
```
@media (max-width: 768px) {
  .side-by-side,
  .side-by-side--image-right {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
  .side-by-side__image img {
    max-width: 320px;
    margin: 0 auto;
    aspect-ratio: 3/4;
  }
}


/* ─── PATTERN B: CONTAINED LANDSCAPE BANNER ──────────────────── */
/*
   A landscape image placed between paragraphs as a rhythmic break.
   Sits inside the section's content column (max-width 900px).
   
   aspect-ratio and object-position MUST be set per-image via
   inline style attributes on the <img> element. They depend on
   the source composition and are tuned to preserve specific
   subjects (heads, key objects). See the per-image crop spec
   table in the design doc.
*/

.inline-banner {
  margin: 2.5rem auto;
  max-width: 900px;
  position: relative;
}

.inline-banner img {
  width: 100%;
  display: block;
  object-fit: cover;
  border: 1px solid rgba(204, 0, 0, 0.4);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.75);
}

.inline-banner::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
  opacity: 0.4;
}
```

- [ ] **Step 3: Verify the addition**

Run:
```bash
grep -c "PATTERN B" css/images.css
grep -c "inline-banner" css/images.css
```

Expected: PATTERN B appears 1 time, inline-banner appears at least 4 times.

- [ ] **Step 4: Commit**

Run:
```bash
git add css/images.css
git commit -m "feat(css): add Pattern B (contained landscape banner)

Adds .inline-banner class for inline rhythm-break images inside
a section's content column. aspect-ratio and object-position are
per-image inline overrides — the base class only handles layout,
border, shadow, and the scanline overlay.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: commit succeeds.

---

## Task 7: Add Contained Banner to WHAT EXACTLY IS ALN (image 08)

**Files:**
- Modify: `index.html` (in `#what-exactly-is-about-last-night`, between ¶6 and ¶7)

**What this does:** Inserts an `.inline-banner` wrapper containing image 08 (couch laughing over briefs) between ¶6 (the "no audience watching / not an actor" accessibility paragraph) and ¶7 (the "what story do you want to tell" closing question). The image's per-instance crop is applied via inline `style` attributes: `aspect-ratio: 2/1; object-position: 50% 5%;`.

- [ ] **Step 1: Read the WHAT EXACTLY IS ALN section to locate ¶6 and ¶7**

Use the Read tool on `index.html` around the previously-edited area (offset=170 limit=25). Find ¶6 (the "You don't need to be an actor..." paragraph) and ¶7 (the "You just need to decide..." paragraph).

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
            <p>You don't need to be an actor — there's no audience watching. You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.</p>

            <p>You just need to decide: what kind of story do you want to tell tonight?</p>
```

**new_string:**
```
            <p>You don't need to be an actor — there's no audience watching. You don't need to be a puzzle expert — you could never touch a lock and still play a crucial role in shaping the story.</p>

            <!-- ═══════════════════════════════════════════════════════ -->
            <!-- EDITABLE IMAGE: WHAT EXACTLY CONTAINED BANNER           -->
            <!-- SAFE TO EDIT: Replace src with another landscape image, -->
            <!--   update alt text                                       -->
            <!-- DO NOT EDIT: div class. The aspect-ratio and object-    -->
            <!--   position inline styles are TUNED to this specific     -->
            <!--   photo's composition (preserves heads + briefs).       -->
            <!--   Swapping the image requires re-tuning these values.   -->
            <!-- FIND WITH: Search for "WHAT EXACTLY CONTAINED" or       -->
            <!--   "aln-08-couch-laughing"                               -->
            <!-- ═══════════════════════════════════════════════════════ -->
            <div class="inline-banner">
                <img src="images/aln-08-couch-laughing.jpg"
                     alt="Two players laughing comfortably on a couch while reading character briefs"
                     style="aspect-ratio: 2/1; object-position: 50% 5%;"
                     loading="lazy">
            </div>

            <p>You just need to decide: what kind of story do you want to tell tonight?</p>
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "WHAT EXACTLY CONTAINED" index.html
grep -n "aln-08-couch-laughing" index.html
```

Expected: each pattern matches on one line.

- [ ] **Step 4: Visual check**

Start `python3 -m http.server 8000`, visit `http://localhost:8000`, scroll to WHAT EXACTLY IS ALN. Verify:
- The contained banner appears between ¶6 (accessibility) and ¶7 (closing question)
- Both women's heads are clearly visible in the cropped image (no decapitation)
- The character briefs in their laps are visible
- The banner is wider than it is tall (~410px tall in a ~820px column)
- The scanline overlay sits over the image
- Red-tinted border and shadow visible around the image

Stop the server.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): add contained banner to WHAT EXACTLY IS ALN

Inserts image 08 (couch laughing over character briefs) as an
.inline-banner between ¶6 (accessibility) and ¶7 (closing question).
Aspect-ratio 2/1 with object-position 50% 5% — chosen to preserve
both faces and the briefs in the laps. The crop is tighter than
default (2.5/1) because of the source composition's vertical span.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit passes, commit succeeds.

---

## Task 8: Add Pattern C (Full-bleed Closer/Prelude) to `css/images.css`

**Files:**
- Modify: `css/images.css` (append the third pattern at end)

**What this does:** Adds the full-bleed landscape closer/prelude pattern. This is the most complex pattern because the image needs to:
1. Break out of the parent section's horizontal padding (negative left/right margins)
2. Break out of the parent section's bottom padding (closer) or top padding (prelude)
3. Override `overflow: hidden` on the parent section (so the negative margins aren't clipped)

Sections have different padding values, so the per-section margin overrides use ID selectors.

- [ ] **Step 1: Append Pattern C to css/images.css**

Use the Edit tool on `css/images.css`:

**old_string:**
```
.inline-banner::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
  opacity: 0.4;
}
```

**new_string:**
```
.inline-banner::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
  opacity: 0.4;
}


/* ─── PATTERN C: FULL-BLEED CLOSER / PRELUDE ─────────────────── */
/*
   Landscape image that breaks out of the section's content
   container to span the full viewport width. Two variants:
   
   - .section-closer-image: positioned as the LAST child of a
     section, hugs the bottom edge. Used for emotional payoff or
     thriller climax moments.
   
   - .section-prelude-image: positioned as the FIRST child of a
     section, hugs the top edge. Used for visual transitions
     into a section.
   
   object-position MUST be set per-image via inline style
   attribute on the <img> element. aspect-ratio is fixed at
   21/9 for both variants for visual consistency across the page.
*/

.section-closer-image,
.section-prelude-image {
  position: relative;
  width: calc(100% + 4rem);
  margin-left: -2rem;
  margin-right: -2rem;
}

.section-closer-image img,
.section-prelude-image img {
  width: 100%;
  display: block;
  aspect-ratio: 21/9;
  object-fit: cover;
  border-top: 1px solid rgba(204, 0, 0, 0.5);
  border-bottom: 1px solid rgba(204, 0, 0, 0.5);
}

.section-closer-image::after,
.section-prelude-image::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background: repeating-linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.15) 0px,
    rgba(0, 0, 0, 0) 1px,
    rgba(0, 0, 0, 0) 3px,
    rgba(0, 0, 0, 0.1) 4px
  );
  pointer-events: none;
  opacity: 0.5;
}

/* Section-specific margin overrides to hug section vertical edges.
   Each value matches the parent section's vertical padding so the
   negative margin cancels it out exactly.
   
   .narrative has padding: 8rem 2rem (from layout.css).
   #why-we-made-this has inline padding: 5rem 2rem.
   .interest-form has padding: 6rem 2rem (from layout.css). */

#narrative .section-closer-image {
  margin-top: 3rem;
  margin-bottom: -8rem;
}

#why-we-made-this .section-closer-image {
  margin-top: 3rem;
  margin-bottom: -5rem;
}

#submit-evidence .section-prelude-image {
  margin-top: -6rem;
  margin-bottom: 4rem;
}

/* Allow full-bleed images to escape the parent section's
   overflow:hidden (which would otherwise clip the negative margins).
   These three sections all have overflow:hidden in layout.css. */

#narrative,
#why-we-made-this,
#submit-evidence {
  overflow: visible;
}
```

- [ ] **Step 2: Verify the addition**

Run:
```bash
grep -c "PATTERN C" css/images.css
grep -c "section-closer-image" css/images.css
grep -c "section-prelude-image" css/images.css
```

Expected: PATTERN C 1 time, section-closer-image at least 5 times, section-prelude-image at least 4 times.

- [ ] **Step 3: Commit**

Run:
```bash
git add css/images.css
git commit -m "feat(css): add Pattern C (full-bleed closer/prelude)

Adds .section-closer-image and .section-prelude-image classes for
full-bleed landscape images that hug section vertical edges and
break out of parent horizontal padding via negative margins.
Includes section-specific bottom-margin overrides to cancel each
parent section's specific padding value, plus overflow:visible
overrides on the three target sections to prevent clipping.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: commit succeeds.

---

## Task 9: Add Full-bleed Closer to OUR PHILOSOPHY (image 06, after ¶9)

**Files:**
- Modify: `index.html` (`#why-we-made-this` section, after the closing `</div>` of `.content-container`, before the closing `</section>`)

**What this does:** Inserts the full-bleed closer image (image 06, joy at the bar) AFTER the `.content-container` div but BEFORE the `</section>` closing tag of OUR PHILOSOPHY. The image is a sibling to `.content-container`, not a child of it, so it can escape the 900px content width and span the full section width. Per-image `object-position: 50% 38%` is applied via inline style.

This image is positioned AFTER ¶9 ("Join the party!") so it acts as the visual answer to the invitation, not setup for it.

- [ ] **Step 1: Read OUR PHILOSOPHY section's closing structure**

Use the Read tool on `index.html` with offset=270 limit=15 to load the bottom of the OUR PHILOSOPHY section. Verify you see ¶9 (the "Join the party!" line), then `</div>` closing `.content-container`, then `</section>`.

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
            <p>If that sounds like your kind of weird, <a href="#submit-evidence" class="corrupt">Join the party!</a> Let's tell a story  <span class="corrupt">about last night</span> together.</p>
        </div>
    </section>
    <!-- END CONTENT SECTION: WHY WE MADE THIS -->
```

**new_string:**
```
            <p>If that sounds like your kind of weird, <a href="#submit-evidence" class="corrupt">Join the party!</a> Let's tell a story  <span class="corrupt">about last night</span> together.</p>
        </div>

        <!-- ═══════════════════════════════════════════════════════ -->
        <!-- EDITABLE IMAGE: PHILOSOPHY FULL-BLEED CLOSER            -->
        <!-- SAFE TO EDIT: Replace src with another landscape image, -->
        <!--   update alt text                                       -->
        <!-- DO NOT EDIT: div class, aspect-ratio (fixed at 21/9     -->
        <!--   for all full-bleeds). object-position is TUNED to     -->
        <!--   this specific photo. Swapping requires re-tuning.     -->
        <!-- FIND WITH: Search for "PHILOSOPHY FULL-BLEED CLOSER"    -->
        <!--   or "aln-06-joy-bar"                                   -->
        <!-- ═══════════════════════════════════════════════════════ -->
        <div class="section-closer-image">
            <img src="images/aln-06-joy-bar.jpg"
                 alt="A player laughing at the bar during the game"
                 style="object-position: 50% 38%;"
                 loading="lazy">
        </div>
    </section>
    <!-- END CONTENT SECTION: WHY WE MADE THIS -->
```

Note: leading whitespace for the new `<div class="section-closer-image">` matches the section's existing 8-space indentation (one level inside `<section>`, same level as `<div class="content-container">`).

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "PHILOSOPHY FULL-BLEED CLOSER" index.html
grep -n "aln-06-joy-bar" index.html
```

Expected: each matches on one line.

- [ ] **Step 4: Visual check**

Start `python3 -m http.server 8000`, visit `http://localhost:8000`, scroll to OUR PHILOSOPHY. Verify:
- The "Join the party!" line still appears as the last text in the section, with full visual weight
- BELOW that line, the full-bleed image 06 spans the full viewport width
- Both laughing players' faces are clearly visible in the crop
- The pink-heart graffiti above their heads is visible (or at least hinted)
- The man's hands holding the document are visible
- The image hugs the bottom edge of the section — no gap of dark background between the image and the section divider/next section
- The image is roughly 21:9 aspect (cinematic widescreen)
- Scrolling continues smoothly to the next section (Tri-City Voice press quote)

Stop the server.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): add full-bleed closer to OUR PHILOSOPHY

Inserts image 06 (joy at the bar) as a .section-closer-image
positioned AFTER ¶9 (Join the party!) and outside the
.content-container, hugging the bottom of the section.
object-position 50% 38% biases crop upward to preserve both
faces, hint of pink-heart graffiti above, and the man's hands
holding a document. First test of Pattern C closer variant.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit `tidy` passes, commit succeeds.

If `tidy` fails, the most likely issue is a misnested div. Verify the new `<div class="section-closer-image">` block is OUTSIDE `</div>` (closing `.content-container`) but INSIDE `</section>` (closing the parent section).

---

## Task 10: Add Full-bleed Closer to FRAGMENTED MEMORIES (image 07, after memory block 4)

**Files:**
- Modify: `index.html` (`#narrative` section, after `</div>` closing `.narrative-content`, before `</section>`)

**What this does:** Inserts the full-bleed closer image (image 07, four players under flashlights) AFTER the `.narrative-content` div but BEFORE the `</section>` closing tag of FRAGMENTED MEMORIES. Same structural pattern as Task 9 but with image 07 and a different `object-position` value.

This is the **register-risk image** — the section is written in-fiction. The image bets that the noir cross-lighting and tight face framing will read as "people in pressure" rather than "players at a game" enough to preserve the fictional spell.

- [ ] **Step 1: Read FRAGMENTED MEMORIES section's closing structure**

Use the Read tool on `index.html` with offset=135 limit=15 to load lines 135-150. Verify you see the 4th memory block, then `</div>` closing `.narrative-content`, then `</section>`.

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
            <div class="memory-block">
                The wrinkle is: ALL of you must get your story straight and escape the warehouse before the time is up...
            </div>
        </div>
    </section>
    <!-- END CONTENT SECTION: FRAGMENTED MEMORIES -->
```

**new_string:**
```
            <div class="memory-block">
                The wrinkle is: ALL of you must get your story straight and escape the warehouse before the time is up...
            </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════ -->
        <!-- EDITABLE IMAGE: FRAGMENTED MEMORIES FULL-BLEED CLOSER   -->
        <!-- SAFE TO EDIT: Replace src with another landscape image, -->
        <!--   update alt text                                       -->
        <!-- DO NOT EDIT: div class, aspect-ratio (fixed 21/9).      -->
        <!--   object-position is tuned to preserve all four heads.  -->
        <!--   Swapping the image requires re-tuning.                -->
        <!-- FIND WITH: Search for "FRAGMENTED MEMORIES FULL-BLEED"  -->
        <!--   or "aln-07-flashlights"                               -->
        <!-- ═══════════════════════════════════════════════════════ -->
        <div class="section-closer-image">
            <img src="images/aln-07-flashlights.jpg"
                 alt="Four players examining evidence under flashlights in dramatic cross-lighting"
                 style="object-position: 50% 5%;"
                 loading="lazy">
        </div>
    </section>
    <!-- END CONTENT SECTION: FRAGMENTED MEMORIES -->
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "FRAGMENTED MEMORIES FULL-BLEED" index.html
grep -n "aln-07-flashlights" index.html
```

Expected: each matches on one line.

- [ ] **Step 4: Visual check (and register check)**

Start `python3 -m http.server 8000`, visit `http://localhost:8000`, scroll to "Fragmented Memories." Verify:
- All 4 memory blocks render with their MEMORY FRAGMENT label badges
- Below memory block 4 ("ALL of you must get your story straight..."), image 07 appears as a full-bleed cinematic strip
- All 4 player heads are clearly in frame — especially the back-right player (the highest in the source frame)
- The dramatic cross-lighting (warm orange / cool blue) is visible
- The image hugs the bottom of the .narrative section
- The transition into the next element (SF Chronicle press quote testimonial) is clean

Read the memory blocks aloud, then look at the image. Check the **register test**: does the image break the in-fiction spell, or does it feel like a continuation of the thriller mood the memory blocks set? If it breaks the spell badly, raise this with the design owner before committing — the design spec explicitly notes this image is a calculated register risk.

Stop the server.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): add full-bleed closer to FRAGMENTED MEMORIES

Inserts image 07 (four players under flashlights) as a
.section-closer-image after memory block 4 (escape before time
is up). Calculated register-risk image: the dramatic noir cross-
lighting and tight face framing aim to keep the in-fiction spell
intact rather than break it as documentary. object-position 50% 5%
preserves all four heads with minimal hair-clip on back-right player.

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit `tidy` passes, commit succeeds.

---

## Task 11: Add Full-bleed Prelude to BOOKING (image 01, top of section)

**Files:**
- Modify: `index.html` (`#submit-evidence` section, after `<section>` opening, before `<div class="form-container">`)

**What this does:** Inserts the full-bleed prelude image (image 01, players arriving at the venue) at the very top of the `.interest-form` section, OUTSIDE the 600px `.form-container`, spanning full section width. Tests Pattern C's prelude variant (top-anchored).

- [ ] **Step 1: Read the BOOKING section opening**

Use the Read tool on `index.html` with offset=420 limit=15 to load lines 420-435. Verify you see the section opening at line ~422 (`<section id="submit-evidence" class="interest-form">`) followed by `<div class="form-container">`.

- [ ] **Step 2: Apply the edit using the Edit tool**

Use the Edit tool on `index.html`:

**old_string:**
```
    <section id="submit-evidence" class="interest-form">
        <div class="form-container">
```

**new_string:**
```
    <section id="submit-evidence" class="interest-form">

        <!-- ═══════════════════════════════════════════════════════ -->
        <!-- EDITABLE IMAGE: BOOKING FULL-BLEED PRELUDE              -->
        <!-- SAFE TO EDIT: Replace src with another landscape image, -->
        <!--   update alt text                                       -->
        <!-- DO NOT EDIT: div class, aspect-ratio (fixed 21/9).      -->
        <!--   object-position is tuned to preserve all 5-6 player   -->
        <!--   heads and character docs in their hands. Swapping     -->
        <!--   requires re-tuning.                                   -->
        <!-- FIND WITH: Search for "BOOKING FULL-BLEED PRELUDE" or   -->
        <!--   "aln-01-arrival"                                      -->
        <!-- ═══════════════════════════════════════════════════════ -->
        <div class="section-prelude-image">
            <img src="images/aln-01-arrival.jpg"
                 alt="Players arriving at the venue entry with character documents in hand"
                 style="object-position: 50% 10%;"
                 loading="lazy">
        </div>

        <div class="form-container">
```

- [ ] **Step 3: Verify the edit landed**

Run:
```bash
grep -n "BOOKING FULL-BLEED PRELUDE" index.html
grep -n "aln-01-arrival" index.html
```

Expected: each matches on one line.

- [ ] **Step 4: Visual check**

Start `python3 -m http.server 8000`, visit `http://localhost:8000`, scroll to the bottom of the page (after the FAQ section). Verify:
- The player testimonial card appears (existing element)
- A red section divider appears
- IMAGE 01 appears as a full-bleed cinematic strip at the very TOP of the booking section, hugging the top edge (no dark gap above it)
- All 5-6 players' heads are visible in the crop
- Character docs in their hands are visible
- The graffiti wall backdrop is visible
- BELOW the image, the corrupted "NEURAI INC." header appears, then the rest of the booking form
- The OTC iframe still loads correctly below all of that

Stop the server.

- [ ] **Step 5: Commit**

Run:
```bash
git add index.html
git commit -m "feat(index): add full-bleed prelude to BOOKING section

Inserts image 01 (arrival at venue with character docs) as a
.section-prelude-image at the top of .interest-form, OUTSIDE
the 600px form-container, spanning full section width. Acts as
a visual transition into the booking decision — 'this is what
showing up actually looks like.' object-position 50% 10% preserves
all 5-6 player heads (highest at ~5% from top of source).

Per design spec docs/superpowers/specs/2026-04-06-image-integration-design.md"
```

Expected: pre-commit `tidy` passes, commit succeeds.

---

## Task 12: Final Verification + Push to Deploy

**Files:** none (verification + git push)

**What this does:** Runs the complete post-implementation checks defined in the design spec's "Implementation Notes" section: visual sanity check at desktop and mobile, Lighthouse performance audit, and the deploy push to GitHub Pages.

- [ ] **Step 1: Start the local server one more time**

Run:
```bash
python3 -m http.server 8000
```

- [ ] **Step 2: Full-page desktop scroll-through**

In a browser at desktop width (>1200px), visit `http://localhost:8000`. Scroll the entire page top to bottom and verify each section in order:

| Section | What to check |
|---|---|
| HERO | Video loops, no foreground image (unchanged) |
| WHAT HAPPENED LAST NIGHT | Story-beat lines, parallax bg unchanged, no foreground image |
| Tri-City Voice press quote | Unchanged |
| FRAGMENTED MEMORIES | 4 memory blocks, then full-bleed image 07 (flashlights) hugging bottom |
| SF Chronicle press quote | Unchanged, framed between image 07 and the next section |
| WHAT EXACTLY IS ALN | ¶1 lead, then side-by-side with image 02 on RIGHT, then ¶6, then contained banner with image 08, then ¶7, then learn-more CTA |
| Player testimonial | Unchanged |
| WHO WE ARE (Creators) | Unchanged (4 personnel files) |
| Player testimonial | Unchanged |
| OUR PHILOSOPHY | ¶1-3 lead, then side-by-side with image 05 on LEFT, then ¶7-9, then full-bleed image 06 (joy) hugging bottom |
| Tri-City Voice press quote | Unchanged |
| FAQ | Unchanged (2-column grid of questions) |
| Player testimonial | Unchanged |
| BOOKING | Full-bleed image 01 (arrival) at top, then NEURAI INC. terminal, then OTC iframe |
| FOOTER | Unchanged |

- [ ] **Step 3: Mobile responsive scroll-through**

Open DevTools (F12), enable device emulation (Ctrl+Shift+M), select iPhone SE (375px) or similar mobile viewport. Repeat the scroll-through. Verify:
- Both side-by-side treatments collapse to single column with image stacked above text (default variant) or text above image (reverse variant)
- Side-by-side images appear at max-width 320px, centered
- Full-bleed images still span the full mobile viewport width
- Contained banner spans the full mobile content width
- No horizontal scroll on any image
- Memory block badges (MEMORY FRAGMENT) still readable
- Booking iframe still functional

- [ ] **Step 4: Lighthouse performance audit**

Still in DevTools, switch to the Lighthouse tab. Generate a Performance audit (Mobile or Desktop, doesn't matter much for static content). Wait for it to complete.

Check the metrics against the targets in `CLAUDE.md`:
- First Contentful Paint: <1.5s
- Largest Contentful Paint: <2.5s
- Cumulative Layout Shift: <0.1
- Time to Interactive: <3s

If any metric is significantly worse than before this work (compare to a baseline if you have one — otherwise just check absolute values):
- LCP regressions: likely from one of the new images. Check that all images have `loading="lazy"` (which they should from the HTML edits).
- CLS regressions: likely from images without explicit `aspect-ratio` declarations. The full-bleed images have aspect-ratio in CSS; verify the side-by-side and contained banner images render correctly with their declared aspect ratios.
- If CLS is bad: add `width` and `height` attributes to the `<img>` tags as a fallback, or add explicit `aspect-ratio` inline styles.

Document the metrics — they go in the post-deploy verification log.

- [ ] **Step 5: Stop the local server**

Press Ctrl+C in the terminal running `python3 -m http.server 8000`.

- [ ] **Step 6: Verify clean git state**

Run:
```bash
git status
git log --oneline -15
```

Expected:
- Working tree clean
- Recent commits show all the tasks from this plan in order

- [ ] **Step 7: Push to deploy**

Run:
```bash
git push origin main
```

Expected: push succeeds, GitHub Pages auto-deploys within 1-2 minutes.

- [ ] **Step 8: Post-deploy verification**

Wait 2-3 minutes for GitHub Pages to deploy. Then visit `https://aboutlastnightgame.com` and force-refresh (Ctrl+Shift+R). Repeat the desktop scroll-through (Step 2) on the live site. If anything looks different from the local preview, investigate before considering the work done.

If something is broken in production but worked locally:
- Check browser DevTools Network tab for 404s on the new image files
- Check if `css/images.css` is loading
- Check if there's a caching issue (force-refresh again, or open in a private window)

If the live site is broken in a way that needs immediate rollback, follow the rollback procedure in `docs/DEPLOYMENT.md`:
```bash
git revert -m 1 HEAD~6..HEAD  # adjust the revert range based on how many commits this plan produced
git push origin main
```

---

## Self-Review Checklist (for the engineer before declaring done)

Before declaring the work complete, run through this checklist:

- [ ] All 6 image files exist in `images/` and are <500KB each
- [ ] `css/images.css` exists with all three patterns (Pattern A, B, C all present)
- [ ] `index.html` head links `css/images.css`
- [ ] `index.html` contains all 5 new HTML blocks (search for the 5 comment marker headings: "PHILOSOPHY SIDE-BY-SIDE", "WHAT EXACTLY SIDE-BY-SIDE", "WHAT EXACTLY CONTAINED", "PHILOSOPHY FULL-BLEED CLOSER", "FRAGMENTED MEMORIES FULL-BLEED CLOSER", "BOOKING FULL-BLEED PRELUDE" — that's 6 markers)
- [ ] Pre-commit hook passed for every commit (no `--no-verify` used)
- [ ] Visual sanity check passed at desktop AND mobile widths
- [ ] Lighthouse metrics meet targets (FCP <1.5s, LCP <2.5s, CLS <0.1)
- [ ] Live site verified after deploy
- [ ] No source files from `C:/Users/spide/Downloads/marketing select/` were committed
- [ ] No changes to `playtest.html`, `feedback.html`, `how-to-play.html`, `press.html`
- [ ] No changes to `css/base.css`, `css/layout.css`, `css/components.css`, `css/animations.css`
- [ ] No JS changes
