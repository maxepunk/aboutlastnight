# Narrative Structure Framework

This document addresses HOW the article READS. The goal is narrative journalism, not a character catalog or evidence summary.

## Core Principle

**Follow THREADS, not PEOPLE.** Characters appear when their evidence intersects a narrative thread.

---

## 1. Session Arc Correlation

The orchestrator report contains timestamps, but these may be in different timezones. Focus on the NARRATIVE ARC, not raw timestamps.

**CRITICAL: Avoid Game Mechanics Language**
Never use: "Act 3 unlock", "first burial", "script beat", "final call"
Instead use: "The investigation broke open", "The first silence was purchased", "In the final minutes"

| Narrative Moment | How to Identify | Article Treatment |
|------------------|-----------------|-------------------|
| Investigation opens | First major evidence exposed | Hook established |
| Money enters | First buried token | Black market motivations revealed |
| Final rush | Last 10-15% of evidence activity | Resolution cascade |

**Timing Language:**
- Use RELATIVE timing: "early in the evening", "as tensions rose", "in the final minutes"
- The game runs 7-9 PM Pacific. Orchestrator logs may show different timezones.
- If using times, use approximate Pacific: "Around 8 PM" not "10:45 PM"

**Article Arc Mapping:**
```
LEDE: The ending first (who died, who's accused, the hook)
THE STORY: Early evidence -> mid-session revelations -> final-hour cascade
FOLLOW THE MONEY: The burial timeline tells its own story
THE PLAYERS: Who contributed to each phase of the investigation
WHAT'S MISSING: Evidence that exists but content is unknown (buried tokens)
CLOSING: Systemic reflection
```

---

## 2. Evidence Weighting

Apply the same 80%/enrichment pattern from the detective report system:

| Layer | Focus | Usage |
|-------|-------|-------|
| PRIMARY EVIDENCE | 80% | Exposed tokens drive the narrative |
| BACKGROUND CONTEXT | Enrichment | Paper evidence, character context adds depth to primary threads |
| DIRECTOR NOTES | Canon | **Observations** (PRIMARY: human director's ground truth) + **Whiteboard** (interpreted through observations) |

**Director Notes Hierarchy:**
- **Observations = PRIMARY weight** - Human director watched the session and recorded ground truth
- **Whiteboard = interpreted through observations** - AI-transcribed player conclusions, may have errors

**CRITICAL:** Do NOT create separate narrative threads for background-only information. Background enriches PRIMARY threads with context.

**Enrichment Pattern Example:**
- Primary: Victoria's extracted memory about funding
- Thread established: "The funding conspiracy"
- Pull from Background: Paper evidence about NeurAI, character relationships
- Result: THE STORY covers conspiracy AND explains competitive context
- Do NOT create separate theme for paper evidence alone

---

## 3. Section Differentiation

Each section answers a DIFFERENT QUESTION. Repetition occurs when multiple sections answer the SAME question.

| Section | Question Answered | Focus |
|---------|-------------------|-------|
| THE STORY | "What happened that night?" | Narrative of events, discoveries |
| FOLLOW THE MONEY | "Who profited from burying evidence?" | Financial analysis, shell accounts |
| THE PLAYERS | "Who helped and who hindered?" | Character evaluations, choices |
| WHAT'S MISSING | "What don't we know?" | Evidence gaps, buried secrets |
| CLOSING | "What does this mean for all of us?" | Systemic reflection |

**ANTI-REPETITION CHECK:** Before writing any sentence, ask:
> "Have I already stated this fact in a previous section?"

If yes: Either skip it OR present from a new angle answering THAT section's question.

**Example:**
- THE STORY: "Alex's extracted memory shows the IP theft in 2022."
- BAD in FOLLOW THE MONEY: "Alex's memory revealed the IP theft." (repetition)
- GOOD in FOLLOW THE MONEY: "Someone paid to bury Alex's memory. The price? $4,200 to Sunset Ventures." (new angle)

---

## 4. Gap Theory & Tension Building

Create curiosity gaps that pull readers forward. Introduce questions, delay answers.

**Techniques:**
- Name a suspicious pattern, reveal the evidence later
- Mention buried evidence exists, hold details for WHAT'S MISSING
- Reference a character's choice before explaining the consequence

**Examples:**

BAD (no gap):
> "Victoria's extracted memories show she knew about the fraud. Here's exactly what she knew and when she knew it."

GOOD (gap created):
> "Three of Victoria's memories made it to the Detective. Only one made it out clean."

BAD (immediate explanation):
> "Someone buried Alex's memory for $4,200. That someone was Morgan, who wanted to protect Marcus's reputation."

GOOD (tension building):
> "Someone paid $4,200 to make Alex's memory disappear. The shell account traces back to a name everyone at that party would recognize."

---

## 5. Narrative-of-Thought Framework

Before generating, internally construct:

1. **Central tension?** Murder mystery + systemic critique
2. **Strongest arc evidence?** Select 3-5 key threads from exposed tokens
3. **Narrative gaps to exploit?** Buried evidence, contradictions, timeline gaps
4. **Session outcome tone?** Triumph vs tragedy, resolution vs lingering mystery

This internal structure prevents character-cataloging.

---

## 6. Character Catalog Transformation

**BAD (Character catalog):**
> "Alex provided 3 memories. Diana provided 2 memories. James provided 1 memory. Morgan provided 2 memories. Each of these memories revealed important information about the case."

**GOOD (Narrative arc):**
> "The first breakthrough came from Alex. Three memories that traced the IP theft back to 2022. But it was Diana's contribution, paired with what she chose to bury, that revealed the deeper pattern."

**The difference:** The article follows THREADS (IP theft, cover-up conspiracy, financial trail), not PEOPLE (Alex, Diana, James, Morgan). Characters appear when their evidence intersects the thread being explored.

---

## 7. Article Length & Narrative Density

**Measure by WORD COUNT, not HTML lines.** Visual components add markup but not reading time.

**Target:** 1200-1800 words of prose (excluding visual component markup)

**Density Principles:**
- Every paragraph must ADVANCE the narrative or DEEPEN understanding
- Cut prose that merely restates what a visual component shows
- Evidence cards REPLACE paragraphs, they don't supplement them
- If a fact can be shown visually, don't also explain it in prose

**Density Check Questions:**
1. Does this paragraph tell the reader something NEW?
2. Could this be shown in an evidence card instead of described?
3. Am I explaining the evidence or letting it speak?
4. Would removing this paragraph break the narrative flow?

**BAD (low density):**
> "Victoria's memory extraction reveals important information about the funding scheme. The memory shows that she was aware of the fraud. This is significant because it proves she knew about Marcus's actions. The extracted memory is a key piece of evidence."

**GOOD (high density):**
> "Victoria knew. Three words that cost her everything."
> [EVIDENCE CARD: Victoria's extracted memory with key quote]

The visual component DOES the work. The prose FRAMES and ADVANCES.

---

## 8. Visual Components as Momentum Tools

Visual components are not decoration. They are **narrative machinery** that serves loop architecture.

### Section Appropriateness (AUTHORITATIVE)

| Section          | Evidence Cards | Photos    | Pull Quotes |
|------------------|----------------|-----------|-------------|
| LEDE             | No             | Hero only | No          |
| THE STORY        | Yes            | Yes       | Yes         |
| FOLLOW THE MONEY | Optional       | Optional  | Yes         |
| THE PLAYERS      | Optional       | Yes       | Yes         |
| WHAT'S MISSING   | No             | Yes       | Optional    |
| CLOSING          | Optional       | Optional  | Yes (1 max) |

### Evidence Cards: Loop Mechanics

Every evidence card must either CLOSE a loop or OPEN one:

| Card Type | When to Use | Example Placement |
|-----------|-------------|-------------------|
| **CLOSER** | After building tension - proves what was hinted | "Victoria knew." → [CARD] |
| **OPENER** | Raises new question while answering old | [CARD reveals Morgan present] → "Why was Morgan there?" |
| **AMPLIFIER** | Before climax - raises stakes | [CARD: threatening letter] → "Three days later, Marcus was dead." |
| **CALLBACK** | Recontextualizes earlier material | [CARD] → Reader now re-reads Arc A differently |

**Never place a card that merely illustrates.** If removing the card doesn't change the reader's understanding, the card doesn't belong there.

### Photos: Emotional Beats & Breathing Room

Photos reset emotional temperature. Use them for:

| Photo Function | When to Use |
|----------------|-------------|
| **Humanize before revelation** | Place BEFORE damning evidence about that character |
| **Breathing room** | After intense sequence, let reader recover before next escalation |
| **Cross-arc bridge** | Same character in different context - visual connection |
| **Scene establishment** | Opening of new arc, anchor reader in space |

**Photos create pacing.** A photo after Victoria's exposure lets the reader breathe before Morgan's revelation. This is intentional.

**Photos are inline content blocks** - they appear within section content arrays, not in a separate photos array or gallery section. Place them at paragraph-level precision for maximum emotional impact.

### Pull Quotes: Crystallization Points

Pull quotes STOP the reader to land a moment. They demand the reader pause and absorb.

**Two types (CRITICAL):**

| Type | Attribution | When to Use |
|------|-------------|-------------|
| **Nova's crystallized insight** | NONE - just styled text | Systemic observation, thematic landing |
| **Verbatim evidence quote** | Character name | Damning moment from actual evidence |

**Pull quotes are verbatim, not summaries.** The quote must be the ACTUAL text, not a description of it.

**Example - WRONG:**
```
"$163 million. That's what Skyler threatened to withdraw from NeurAI."
— From Skyler's texts to Victoria
```
WHY WRONG: This is a summary ABOUT the texts, not a quote FROM them.

**Example - CORRECT:**
```
"Pull your funding and I'll pull your secrets into the light."
— Skyler Chen
```
WHY CORRECT: This is the actual text from the evidence.

### Visual Rhythm Rules

1. **Never more than 3 paragraphs without a visual break** (existing rule)
2. **Alternate between closers and openers** - don't close 3 loops in a row, don't open 3 in a row
3. **Use photos for emotional reset before escalation** - let reader breathe, then hit harder
4. **Place the most impactful evidence card at arc convergence** - maximum resonance
5. **End sections with open loops** - pull reader into next section
6. **No two evidence cards adjacent** - always have prose between them
7. **No photo immediately after evidence card** - breaks pacing rhythm
8. **Distribute components across sections** - don't cluster in one section

### Visual Component Density Check

Before placing any component, ask:
1. Does this CLOSE or OPEN a loop? (If neither, remove it)
2. Is the reader ready for this emotionally? (Pacing)
3. Does this ADD understanding or just illustrate? (Cut illustrators)
4. Would removing this break the forward momentum? (It should)

---

## Quick Reference Card

When writing each section, check:

- [ ] Am I following a THREAD, not listing PEOPLE?
- [ ] Does this section answer its SPECIFIC question?
- [ ] Have I already stated this fact elsewhere?
- [ ] Is there a curiosity gap pulling readers forward?
- [ ] Can this be shown visually instead of explained?
- [ ] Does every paragraph advance or deepen?

**Arc Interweaving Checks:**
- [ ] Are arcs INTERCUT (not sequential chapters)?
- [ ] Does any later paragraph recontextualize an earlier one?
- [ ] If I shuffle paragraphs, would it break? (Should be yes)
- [ ] Are there at least 2 "wait, so THAT'S why..." moments?

**Visual Momentum Checks:**
- [ ] Does each evidence card CLOSE or OPEN a loop?
- [ ] Are photos placed for emotional pacing (breathe before escalation)?
- [ ] Are pull quotes VERBATIM text (not summaries)?
- [ ] Do sections end with open loops pulling into next section?
