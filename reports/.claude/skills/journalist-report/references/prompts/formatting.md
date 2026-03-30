# Formatting Rules

Rules for article output structure. The AI outputs JSON (Outline or ContentBundle). The template system converts JSON to HTML.

---

## Forbidden Formatting

| Never Use | Why |
|-----------|-----|
| Em-dashes (—) | Hard rule. Use periods or restructure. |
| Game mechanics language | "Act 3 unlock", "first burial", "script beat" |
| Vague attributions | "From my notes", "Sources say" |

---

## Visual Components

Four visual component types break up text walls and create scroll engagement. Use them strategically at narrative moments, not decoratively.

### Visual Pacing for Compulsive Readability

Place visual components (evidence cards, photos, pull quotes) to maintain scroll engagement. Every 2-3 paragraphs, readers decide whether to continue or abandon. A well-placed visual at that decision point acts as a micro-reward that pulls them forward. Let the narrative dictate placement — components should EARN their position by serving the story, not filling a quota.

### Evidence Card

**Purpose:** Show extracted memory content as leaked source material.

**When to use:** High-value memories, pivotal revelations, claims that need proof.

**Attribution Clarity:**
- **Memory Owner:** Whose memory this is (always show)
- Nova NEVER reveals who exposed evidence (source confidentiality)

### Photo

**Purpose:** Create emotional beats, humanize characters, provide breathing room.

**When to use:** Before damning revelations (humanize first), after intense sequences (let reader breathe), to bridge arcs featuring the same character.

### Pull Quote

**Purpose:** Visual emphasis on key revelations or statements.

**When to use:** Impactful moments, systemic critique statements, emotional peaks.

> **Pull Quote Types**: See `<narrative-structure>` Section 8 for authoritative guidance on:
> - VERBATIM quotes (exact evidence text WITH character attribution)
> - CRYSTALLIZATION quotes (journalist insight, NO attribution - NEVER "— Nova")

### Financial Tracker

**Purpose:** Visualize shell account data. REQUIRED in FOLLOW THE MONEY.

**When to use:** Always in FOLLOW THE MONEY section. One tracker showing all shell accounts.

---

## Component Frequency Guidelines

Visual components EARN their place. These are soft guidelines, not quotas.

| Component | Placement | Guidance |
|-----------|-----------|----------|
| Evidence Cards | Sidebar (~10) + Inline (3-5) | Sidebar: concise catalog. Inline: full verbatim at climax moments |
| Photos | Inline only | Woven into sections for emotional pacing |
| Pull Quotes | Inline | 2-3 for crystallization moments |
| Financial Tracker | Sidebar (required) | Always in FOLLOW THE MONEY |

**The goal is a compelling GIFT for players, not quota compliance.**

---

## Content Block Types (JSON Output)

Visual components are emitted as **content blocks within section content arrays**.

### Photo Content Block

```json
{ "type": "photo", "filename": "20251221_205807.png", "caption": "Vic before the vote" }
```

### Evidence Card Content Block

```json
{ "type": "evidence-card", "tokenId": "rat031", "headline": "The Offer", "content": "The job is yours. The CEO isn't even cold yet.", "owner": "Vic Chase", "significance": "critical" }
```

### Sidebar vs Inline Evidence

**Sidebar** (`evidenceCards` array in contentBundle):
- Curated catalog of ~10 key evidence items supporting the article
- Brief format: tokenId, headline, short content summary, owner
- Serves as reference index — readers can browse all evidence at a glance
- NOT verbatim full text (keep sidebar entries concise)

**Inline evidence-card** (content blocks in sections):
- 3-5 high-impact moments shown with FULL verbatim text
- Placed at narrative climax points to prove claims or create reveals
- These are the moments that EARN full display — most evidence is referenced, not displayed

**Inline evidence-reference** (content blocks in sections):
- Lightweight diamond-icon link to a sidebar card
- Use for mentions that don't need full display: "Records show..." with a reference link
- Keeps prose flowing without interrupting with full evidence blocks

---

## Photos (Inline Placement)

Photos are placed as **content blocks within sections**, NOT as a separate gallery.

Example section with inline photo:
```json
{
  "id": "the-story",
  "content": [
    { "type": "paragraph", "text": "Vic arrived early that evening..." },
    { "type": "photo", "filename": "20251221_205807.png", "caption": "Vic before the vote" },
    { "type": "paragraph", "text": "No one knew what she was carrying..." }
  ]
}
```

**Hero Image:** Optional `heroImage` in contentBundle appears after the header, before sections.

---

## Length Guidelines

| Section | Target Length |
|---------|---------------|
| LEDE | 100-200 words |
| THE STORY | 400-800 words (scales with evidence) |
| FOLLOW THE MONEY | 100-300 words |
| THE PLAYERS | 200-400 words |
| WHAT'S MISSING | 100-200 words |
| CLOSING | 150-300 words |

**Total article:** 1000-1500 words. Quality over quantity - a tight article with impact beats a long one that wanders.

---

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
