# Formatting Rules

Technical rules for article output structure.

## Document Structure

```html
<article class="novanews-article">
  <header class="article-header">
    <h1 class="headline">{{HEADLINE}}</h1>
    <p class="byline">{{JOURNALIST_FIRST_NAME}} Nova | NovaNews</p>
    <p class="dateline">February 22, 2027 | Article {{ARTICLE_ID}}</p>
  </header>

  <section class="lede">
    <!-- LEDE content -->
  </section>

  <section class="story">
    <h2>The Story</h2>
    <!-- THE STORY content -->
  </section>

  <section class="money">
    <h2>Follow the Money</h2>
    <!-- FOLLOW THE MONEY content -->
  </section>

  <section class="players">
    <h2>The Players</h2>
    <!-- THE PLAYERS content -->
  </section>

  <section class="missing">
    <h2>What's Missing</h2>
    <!-- WHAT'S MISSING content -->
  </section>

  <section class="closing">
    <!-- CLOSING content - no header -->
  </section>
</article>
```

## Text Formatting

**Paragraphs:**
- Wrap in `<p>` tags
- One thought per paragraph for punch
- Vary paragraph length for rhythm

**Character names:**
- Bold on first mention in each section: `<strong>Sarah</strong>`
- Plain text on subsequent mentions

**Evidence references:**
- Italicize memory content when quoting: `<em>"The instructions were clear..."</em>`
- Timestamps in monospace: `<span class="timestamp">3:52 AM</span>`

**Financial figures:**
- Use `<span class="money">$127,000</span>` for amounts
- Right-align in financial section tables if using tables

## Forbidden Formatting

| Never Use | Why |
|-----------|-----|
| Em-dashes (—) | Hard rule. Use periods or restructure. |
| `<br>` for spacing | Use proper paragraph breaks |
| Inline styles | Use class-based styling |
| Smart quotes in code | Use straight quotes |

---

## Visual Components (CRITICAL)

Visual components break up text walls and create scroll engagement. Use them strategically at narrative moments, not decoratively.

### Rule: Max 3 paragraphs without a visual break

### Evidence Card

**Purpose:** Show extracted memory content as leaked source material.

**When to use:** High-value memories, pivotal revelations, claims that need proof. 3-5 per article in THE STORY.

```html
<div class="evidence-card">
  <div class="evidence-card__label">EXTRACTED MEMORY</div>
  <blockquote class="evidence-card__content">
    "The exact quote or key content from the memory."
  </blockquote>
  <div class="evidence-card__meta">
    <span class="evidence-card__owner">Memory Owner: Character Name</span>
    <span class="evidence-card__submitter">Exposed By: Character Name</span>
  </div>
</div>
```

**Attribution Clarity:**
- **Memory Owner:** Whose memory this is (always show)
- **Exposed By:** Who brought it to the Detective (only show if DIFFERENT from owner)
- If owner exposed their own memory, omit "Exposed By" line

### Financial Tracker

**Purpose:** Visualize shell account data. REQUIRED in FOLLOW THE MONEY.

**When to use:** Always in FOLLOW THE MONEY section. One tracker showing all shell accounts.

```html
<div class="financial-tracker">
  <div class="tracker-header">BLACK MARKET TRANSACTIONS</div>
  <div class="tracker-entries">
    <div class="tracker-row">
      <span class="account-name">Sunset Ventures</span>
      <div class="amount-bar" style="width: 45%"></div>
      <span class="amount">$12,400</span>
    </div>
    <div class="tracker-row">
      <span class="account-name">Pacific Holdings</span>
      <div class="amount-bar" style="width: 30%"></div>
      <span class="amount">$8,200</span>
    </div>
    <div class="tracker-row">
      <span class="account-name">Coastal Partners</span>
      <div class="amount-bar" style="width: 25%"></div>
      <span class="amount">$6,800</span>
    </div>
  </div>
  <div class="tracker-total">TOTAL BURIED: $27,400</div>
</div>
```

### Timeline Marker

**Purpose:** Ground narrative in session reality at key dramatic moments.

**Timing Language:** Use RELATIVE timing, not raw orchestrator timestamps. The game runs 7-9 PM Pacific but orchestrator logs may show different timezones. Convert to in-world language:
- "Early in the evening" / "As the party began"
- "Midway through" / "As tensions rose"
- "In the final minutes" / "As time ran out"
- OR use approximate Pacific times if needed: "Around 8 PM" not "10:45 PM"

**When to use:** Dramatic turning points (investigation breakthrough, first evidence sold, final rush). Up to 3 per article in THE STORY. Use sparingly at genuine turning points.

**NEVER use game mechanics language:** No "Act 3 unlock", "first burial", "script beat". Use in-world language only:
- "The investigation broke open when..."
- "The first silence was purchased..."
- "In the final minutes before midnight..."

```html
<div class="timeline-marker">
  <div class="timestamp-badge">Early evening</div>
  <div class="event-description">First evidence reaches the Detective.</div>
</div>
```

### Pull Quote

**Purpose:** Visual emphasis on key revelations or statements.

**When to use:** Impactful moments, systemic critique statements, emotional peaks. Up to 3 total, primarily in THE PLAYERS and CLOSING.

**Attribution Rules (CRITICAL):**
Valid attributions ONLY:
- Character name who said/did something: `<cite>Derek, on why he exposed</cite>`
- Reference to extracted memory content: `<cite>From Victoria's extracted memory</cite>`
- Nova's own statement (no cite needed, or): `<cite>Nova</cite>`

**NEVER use vague attributions:**
- ~~"From my notes"~~ (nonsense, Nova doesn't have separate notes)
- ~~"From the investigation"~~ (too vague)
- ~~"Anonymous source"~~ (we know who exposed what)

```html
<div class="pull-quote">
  <p class="pull-quote__text">"Someone decided that money was worth more than answers."</p>
  <span class="pull-quote__attribution">Nova</span>
</div>
```

### Buried Evidence Marker

**Purpose:** Represent hidden/unknown content, create intrigue.

**When to use:** WHAT'S MISSING section. 2-4 markers for major categories of buried evidence.

```html
<div class="buried-marker">
  <div class="buried-badge">BURIED</div>
  <div class="buried-content">
    <span class="token-count">4 memories</span>
    <span class="shell-account">via Sunset Ventures</span>
    <span class="amount">$12,400</span>
  </div>
  <div class="buried-mystery">Content: [REDACTED]</div>
</div>
```

---

## Component Frequency Guidelines

Visual components EARN their place. These are MAXIMUMS, not quotas. Use fewer if the narrative doesn't warrant them.

| Component | Section | Maximum | Use When... |
|-----------|---------|---------|-------------|
| Evidence Card | THE STORY | Up to 5 | High-value memory that proves a claim |
| Timeline Marker | THE STORY | Up to 3 | Genuine dramatic turning point |
| Financial Tracker | FOLLOW THE MONEY | 1 (required) | Always in sidebar + mobile inline |
| Pull Quote | THE PLAYERS, CLOSING | Up to 3 | Statement worth visual emphasis |
| Buried Marker | WHAT'S MISSING | Up to 4 | Major category of suppressed evidence |

**Quality over quantity:** A tight article with 3 well-placed evidence cards beats a bloated one with 5 forced cards.

---

## Shell Account Display (Legacy)

For inline references outside the tracker:

**Narrative style:**
```html
<p><strong>Derek</strong> walked away with <span class="money">$127,000</span>.
Three buried memories. That's the price NeurAI put on silence.</p>
```

## Photo Gallery (If Photos Provided)

```html
<section class="gallery">
  <h2>From the Scene</h2>
  <div class="photo-grid">
    <figure>
      <img src="{{PHOTO_URL}}" alt="{{PHOTO_DESCRIPTION}}">
      <figcaption>{{PHOTO_CAPTION}}</figcaption>
    </figure>
    <!-- more photos -->
  </div>
</section>
```

Gallery section goes between PLAYERS and MISSING if photos exist.

## Template Variables

| Variable | Source | Example |
|----------|--------|---------|
| `{{JOURNALIST_FIRST_NAME}}` | Director input | "Cassandra" |
| `{{ARTICLE_ID}}` | Session date (YYYYMMDD-NN) | "20251221-01" |
| `{{HEADLINE}}` | Director input or generated | "Death at NeurAI" |
| `{{SESSION_DATE_DISPLAY}}` | Session date formatted | "Dec 21, 2025" |
| `{{CHARACTER_NAME}}` | From roster | "Sarah", "Derek" |
| `{{SHELL_ACCOUNT_NAME}}` | Director input | Player's chosen name |
| `{{SHELL_ACCOUNT_TOTAL}}` | Director input | "$127,000" |

**Article ID Format:**
- Use REAL session date for file management: `YYYYMMDD-NN` (e.g., `20251221-01`)
- In-world dateline stays "February 22, 2027" (the game's fictional date)
- Article ID is for internal tracking, dateline is for immersion

## Length Guidelines

| Section | Target Length |
|---------|---------------|
| LEDE | 100-200 words |
| THE STORY | 400-800 words (scales with evidence) |
| FOLLOW THE MONEY | 100-300 words |
| THE PLAYERS | 200-400 words |
| WHAT'S MISSING | 100-200 words |
| CLOSING | 150-300 words |

**Total article:** 1000-2000 words typical. Can be shorter with sparse evidence.

## Headline Rules

If director doesn't provide headline, generate one that:
- Is punchy and specific (not generic)
- Hints at the systemic critique
- Avoids clickbait

**Good headlines:**
- "Marcus Blackwood Is Dead. His Memory Machine Is Just Getting Started."
- "The Party That Stole Your Mind"
- "What NeurAI Doesn't Want You to Remember"

**Bad headlines:**
- "Murder at Tech Company"
- "SHOCKING: CEO Found Dead!"
- "An Investigation into Recent Events"
