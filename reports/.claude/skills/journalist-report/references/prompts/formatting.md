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

### Rule: Max 3 paragraphs without a visual break

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
| Evidence Cards | Sidebar (~10) + Inline | Same cards in both; inline where they hit hardest |
| Photos | Inline only | Woven into sections for emotional pacing |
| Pull Quotes | Inline | 2-3 for crystallization moments |
| Financial Tracker | Sidebar (required) | Always in FOLLOW THE MONEY |

**The goal is a compelling GIFT for players, not quota compliance.**

---

## Content Block Types (JSON Output)

Visual components are emitted as **content blocks within section content arrays**.

### Photo Content Block

```json
{ "type": "photo", "filename": "20251221_205807.png", "caption": "Victoria before the vote" }
```

### Evidence Card Content Block

```json
{ "type": "evidence-card", "tokenId": "rat031", "headline": "The Offer", "content": "The job is yours. The CEO isn't even cold yet.", "owner": "Victoria Chase", "significance": "critical" }
```

### Sidebar vs Inline Evidence Cards

**Sidebar** (`evidenceCards` array in contentBundle):
- Curated ~10 cards that support the article
- Serves as "bibliography" for quick reference

**Inline** (`evidence-card` content blocks in sections):
- The SAME cards placed where they hit hardest in prose
- Woven into narrative at paragraph-level precision

---

## Photos (Inline Placement)

Photos are placed as **content blocks within sections**, NOT as a separate gallery.

Example section with inline photo:
```json
{
  "id": "the-story",
  "content": [
    { "type": "paragraph", "text": "Victoria arrived early that evening..." },
    { "type": "photo", "filename": "20251221_205807.png", "caption": "Victoria before the vote" },
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

**Total article:** 1000-2000 words typical. Can be shorter with sparse evidence.

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
