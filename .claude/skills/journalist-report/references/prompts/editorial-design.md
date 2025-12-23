# Editorial Design Principles

This document addresses HOW the article LOOKS and keeps readers engaged. The goal is a compelling scroll experience that feels like a real 2027 investigative journalism website.

---

## 1. Scroll Depth Psychology

Readers decide to continue or abandon every 2-3 paragraphs. Design for this reality.

**Principles:**
- Visual breaks serve as "micro-rewards" that reinforce continued reading
- Each scroll should reveal something visually different from what came before
- Data terminal elements create curiosity ("what will the next reveal show?")
- Dense text walls signal "this will be work" and trigger abandonment

**Rule:** Never more than 3 consecutive paragraphs of prose without a visual break.

---

## 2. Information Hierarchy

Not all evidence is equally important. Visual weight should match narrative weight.

| Evidence Value | Visual Treatment |
|----------------|------------------|
| High-value (rating 4-5) | Full evidence card with quote and attribution |
| Mid-value (rating 2-3) | Pull quote or inline reference |
| Lower-value (rating 1) | Grouped mention or WHAT'S MISSING reference |

**Section Weight:**
- THE LEDE hooks (high visual impact, scannable)
- THE STORY builds (evidence cards at key moments)
- FOLLOW THE MONEY reveals (financial tracker, data visualization)
- THE PLAYERS evaluates (attribution cards)
- WHAT'S MISSING intrigues (buried evidence markers)
- CLOSING lands (pull quote, reflection)

---

## 3. Chunking & Cognitive Load

Dense information needs visual relief.

**Principles:**
- Dense prose sections (3+ paragraphs) MUST be followed by visual relief
- Evidence cards break up text AND add credibility
- Financial data in visual form is easier to process than prose descriptions
- Whitespace is not wasted space. It's processing time.

**Chunking Pattern:**
```
[Prose: 1-2 paragraphs, establish context]
[VISUAL BREAK: evidence card, pull quote, or timeline marker]
[Prose: 2-3 paragraphs, develop implication]
[VISUAL BREAK: different component type]
[Prose: 1-2 paragraphs, transition]
...
```

---

## 4. Narrative Pacing with Visual Rhythm

Visual components aren't decorations. They're narrative beats.

**Recommended Pattern:**
```
[Prose hook - 1-2 paragraphs, establish stakes]
[EVIDENCE CARD - interrupts with source material, proves the claim]
[Prose develops - 2-3 paragraphs, explore implication]
[TIMELINE MARKER - grounds in session reality, shows when this happened]
[Prose builds tension - 1-2 paragraphs, raise questions]
[PULL QUOTE - emphasizes key revelation, visual emphasis]
[Prose continues - advance to next thread]
```

**Component Frequency Guidelines (MAXIMUMS, not quotas):**
Visual components EARN their place. Use fewer if the narrative doesn't warrant them.
- Evidence cards: Up to 5 throughout article (use when proving claims)
- Financial tracker: 1 required (in sidebar, inline on mobile)
- Timeline markers: Up to 3 (at genuine dramatic turning points)
- Pull quotes: Up to 3 (for true emphasis moments)
- Buried evidence markers: Up to 4 (in WHAT'S MISSING)

**Quality over quantity:** A tight article with 3 well-placed evidence cards beats a bloated one forcing 5.

---

## 5. Data-Dense Communication

Show relationships, not just numbers.

**Principles:**
- Visual bars comparing shell accounts are clearer than prose descriptions
- Contextual revelation: data appears when narratively relevant
- Progressive disclosure: summary visible, detail on hover/focus (where possible)
- Annotation over explanation: let the data speak, Nova comments on meaning

**BAD (prose-heavy data):**
> "The shell accounts received varying amounts. Sunset Ventures received $12,400. Pacific Holdings received $8,200. Coastal Partners received $6,800. The total buried was $27,400."

**GOOD (data visualization with commentary):**
> "Three shell accounts. $27,400 buried. And every dollar traces back to someone in that room."
> [FINANCIAL TRACKER: Visual bars showing Sunset Ventures $12,400, Pacific Holdings $8,200, Coastal Partners $6,800]

---

## 6. Diegetic Integration

The article should feel like a snapshot from a REAL 2027 website, not an AI-generated report.

**Diegetic Elements:**
- Financial tracker feels like it's FROM NovaNews's data journalism team
- Evidence cards feel like leaked documents Nova obtained
- Timeline markers feel like investigative research visualization
- Pull quotes feel like editorial emphasis by the publication

**NOT diegetic (breaks immersion):**
- Generic "here is some evidence" styling
- Components that feel like AI formatting choices
- Data that looks like database output
- Formatting that screams "generated content"

**Test:** Would this component look at home on Bloomberg, Wired, or The Verge investigative pieces?

---

## 7. Component Specifications

### Evidence Card
**Purpose:** Show extracted memory content as leaked/obtained source material

**Structure:**
```html
<div class="evidence-card">
  <div class="evidence-badge">EXTRACTED MEMORY</div>
  <blockquote class="evidence-content">
    "[Memory content or key quote]"
  </blockquote>
  <div class="evidence-attribution">
    <span class="owner">Source: [Owner Name]</span>
    <span class="timestamp">[Date if available]</span>
  </div>
</div>
```

**When to use:** High-value memories, pivotal revelations, claims that need proof

### Financial Tracker
**Purpose:** Visualize shell account data in data journalism style

**Structure:**
```html
<div class="financial-tracker">
  <div class="tracker-header">BLACK MARKET TRANSACTIONS</div>
  <div class="tracker-entries">
    <div class="tracker-row">
      <span class="account-name">[Shell Account]</span>
      <div class="amount-bar" style="--amount: [percentage]"></div>
      <span class="amount">$[Amount]</span>
    </div>
    <!-- repeat for each account -->
  </div>
  <div class="tracker-total">TOTAL BURIED: $[Total]</div>
</div>
```

**When to use:** FOLLOW THE MONEY section, always

### Timeline Marker
**Purpose:** Ground narrative in session reality at dramatic turning points

**Timing Language:** Use RELATIVE timing, not raw timestamps:
- "Early in the evening" / "As the party began"
- "Midway through" / "As tensions rose"
- "In the final minutes" / "As time ran out"

**Structure:**
```html
<div class="timeline-marker">
  <div class="timeline-marker__time">[RELATIVE TIME]</div>
  <div class="timeline-marker__text">[What happened]</div>
</div>
```

**When to use:** Genuine dramatic turning points (investigation breaks open, money enters, final rush). Up to 3 throughout.

**NEVER use game mechanics language:** No "Act 3 unlock", "first burial", "script beat"

### Pull Quote
**Purpose:** Visual emphasis on key revelations or statements

**Structure:**
```html
<blockquote class="pull-quote">
  "[Impactful quote or statement]"
  <cite>[Attribution if needed]</cite>
</blockquote>
```

**When to use:** Key revelations, systemic critique moments, emotional peaks

### Buried Evidence Marker
**Purpose:** Represent hidden/unknown content, create intrigue

**Structure:**
```html
<div class="buried-marker">
  <div class="buried-badge">BURIED</div>
  <div class="buried-content">
    <span class="token-count">[X] memories</span>
    <span class="shell-account">via [Shell Account]</span>
    <span class="amount">$[Amount]</span>
  </div>
  <div class="buried-mystery">Content: [REDACTED]</div>
</div>
```

**When to use:** WHAT'S MISSING section, when referencing buried evidence in THE STORY

---

## Quick Reference Card

When structuring the article, check:

- [ ] No more than 3 paragraphs without a visual break
- [ ] Evidence cards at 5-8 key narrative moments
- [ ] Financial tracker in FOLLOW THE MONEY
- [ ] Timeline markers at 2-4 script beat moments
- [ ] Pull quotes at 2-3 emphatic moments
- [ ] Buried markers in WHAT'S MISSING
- [ ] Visual weight matches narrative importance
- [ ] Components feel diegetic (from NovaNews), not generated
