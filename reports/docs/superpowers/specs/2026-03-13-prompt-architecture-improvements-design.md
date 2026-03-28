# Prompt Architecture Improvements — Design Spec

**Date**: 2026-03-13
**Context**: Post-mortem analysis of session 0306 article generation. User manually fixed 25 issues in the pipeline-generated report. Root cause analysis identified 5 systemic failures in the prompt architecture.

## Problem Statement

The 0306 pipeline run produced an article requiring 25 manual fixes across 6 categories:

| Category | Fixes | Root Cause |
|----------|-------|------------|
| Wrong game mechanic (money direction) | 3 | Prompt teaches wrong example |
| Stale character names | 4 | theme-config.js 10/20 names outdated |
| Non-roster character hallucination | 1 | No guardrail against giving absent characters agency |
| Hallucinated player count | 3 | Instruction exists but diluted under cognitive load |
| Director knowledge not woven in | 3 | Raw observations absent from article prompt |
| Narrative accuracy / voice | 11 | Downstream effects of above + voice calibration |

The voice/accuracy issues (11 fixes) are largely downstream effects of the first 5 root causes. Fixing the root causes should substantially reduce these.

---

## Root Cause 1: Wrong Game Mechanic in evidence-boundaries.md

### Problem

Two locations in evidence-boundaries.md teach the wrong money direction:

- **Line 43**: "Players can SELL any token they find to Blake/Valet" — "SELL" implies peer-to-peer transactions. The actual mechanic: players give evidence to Blake, Blake's employers pay them.
- **Line 259 (Quick Reference)**: `"Victoria paid $450K to bury two memories" | YES` — teaches that burying costs the player money. In reality, burying pays the player.

The AI replicated both errors in the 0306 article: "crisis management was worth $675,000" (implying Vic spent money), "The investigator who sold one memory to Skyler" (wrong transaction model).

### Design

**Rewrite the mechanics subsection (lines 40-46)** with unambiguous money-direction framing:

```markdown
**Understanding the Game Mechanics:**
1. Players FIND/UNLOCK memory tokens during the game
2. A token belongs to whoever's memory it contains (the OWNER)
3. Players can BURY any token they find by giving it to Blake/Valet
4. In exchange, Blake's employers PAY the player — money goes INTO a shell account
5. The player CHOOSES the shell account name (some use their real name, others use pseudonyms)
6. **Black Market display shows:** Account Name + Total Amount (PUBLIC)
7. **Black Market display does NOT show:** Which tokens/owners were buried (PRIVATE)
```

**Add a money-direction WRONG/RIGHT example** to the "WRONG — Never Do This" section:

```markdown
### WRONG — Money Direction Reversed

> Vic paid $675,000 to bury two memories.

WHY THIS IS WRONG: Burying evidence PAYS the player. Vic RECEIVED $675,000
from Blake's employers for burying two memories. Money flows TO the person
burying, not FROM them.

### CORRECT — Money Direction

> $675,000 went to an account bearing Vic's name. Two memories buried.
> Someone decided those memories were worth more hidden than exposed.
```

**Fix the Quick Reference table** (line 259):

Change: `"Victoria paid $450K to bury two memories" | 2 | YES`
To: `"$675,000 went to Vic's account for burying two memories" | 2 | YES`

Note: the dollar amount also changes ($450K → $675K) because the original example used an arbitrary amount. The new example uses a realistic session figure. The key fix is the money direction ("paid" → "went to account").

### Prompt Engineering Principle

Examples trump rules. The model follows demonstrated patterns more reliably than prose instructions. A single wrong example in a "CORRECT" section has outsized negative influence.

---

## Root Cause 2: Stale Canonical Character Names

### Problem

10 of 20 playable characters were renamed in Notion (source of truth). theme-config.js still has the old names. `generateRosterSection()` injects the wrong names into every prompt across all phases.

| theme-config.js (stale) | Notion (current) |
|--------------------------|------------------|
| James Whitman | **Remi** Whitman |
| Victoria Kingsley | **Vic** Kingsley |
| Derek Thorne | **Sam** Thorne |
| Diana Nilsson | **Mel** Nilsson |
| Jessicah Kane | **Jess** Kane |
| Leila Bishara | **Zia** Bishara |
| Rachel Torres | **Riley** Torres |
| Howie Sullivan | **Ezra** Sullivan |
| Sofia Francisco | **Nat** Francisco |
| Oliver Sterling | **Quinn** Sterling |

Unchanged: Sarah, Alex, Ashe, Morgan, Flip, Taylor, Kai, Jamie, Skyler, Tori.
NPCs unchanged: Marcus, Nova, Blake.

### Design

**Runtime derivation from Notion data (Approach B)**

The fetch phase already pulls all tokens from Notion, including `owners` fields. Derive the canonical name map dynamically:

1. During fetch phase, extract unique owner full names from token data
2. Build first-name → full-name map programmatically
3. Store in `state.canonicalCharacters`
4. `generateRosterSection()` uses `state.canonicalCharacters` when available, falling back to theme-config.js

**Wiring**: `PromptBuilder` constructor already receives `sessionConfig`. Add `canonicalCharacters` as a constructor parameter (or set via `PromptBuilder.setCanonicalCharacters()`). `generateRosterSection()` signature changes from `(theme)` to `(theme, canonicalCharacters = null)`. All 4 call sites updated to pass `this.canonicalCharacters`. When `canonicalCharacters` is null, falls back to theme-config.js.

**Edge cases**: If Notion data contains conflicting full names for the same first name, log a warning and use the first occurrence. The Notion-derived map supplements (not replaces) theme-config.js — characters with no tokens in a given session still resolve via fallback.

This makes the pipeline self-updating when names change in Notion.

**Update theme-config.js as fallback**

Update the hardcoded map to current names. This serves as fallback when Notion data isn't available (e.g., tests, offline use).

**Update all prompt file examples**

All 11 prompt files in `.claude/skills/journalist-report/references/prompts/` reference character names in examples. Update all stale name references to current names. These are illustrative examples — if names drift later, the dynamically-injected roster section still gives the AI correct names, so prompt file examples becoming slightly stale is low-impact compared to the roster section being wrong.

### Files to Update

- `lib/theme-config.js` — canonicalCharacters map (both journalist and detective configs)
- `lib/workflow/nodes/fetch-nodes.js` or new helper — canonical name extraction from Notion data
- `lib/prompt-builder.js` — accept `canonicalCharacters` from state, pass to `generateRosterSection()`
- All 11 prompt files — update character name references in examples
- `lib/__tests__/` — update test fixtures with current names

### Prompt Engineering Principle

Single source of truth, actually enforced. When the canonical roster says "Victoria" but evidence data says "Vic," the model sees a contradiction and picks unpredictably. Deriving both from the same Notion source eliminates the contradiction.

---

## Root Cause 3: Missing Non-Roster Character Guardrail

### Problem

The article prompt gets the canonical roster (all 20 characters, for name validation) but never receives the session roster (the specific characters played in this session). No prompt anywhere says "characters NOT in the roster were not present at the investigation."

The AI read Quinn and Morgan in exposed memory content and gave them investigation-day actions: "Quinn was trapped between blackmail and exposure," "Morgan took their story to Taylor Chase." These characters weren't players in the 0306 session.

### Design

**`<SESSION_FACTS>` section in article prompt**

New dynamically-injected section in `buildArticlePrompt()`:

```xml
<SESSION_FACTS>
INVESTIGATION ROSTER ({N} players):
{full canonical names from session roster}

ACCUSATION: {accusation text}

CRITICAL — CHARACTER AGENCY RULE:
ONLY the {N} characters listed above were present at the investigation.
Characters who appear in memory content but are NOT listed above were subjects
of memories from the party — they were NOT at the investigation.
NEVER give non-roster characters actions, decisions, or dialogue during
investigation events.

Use exactly {N} when referencing how many people were present.
</SESSION_FACTS>
```

**Placement**: Right before `<ANTI_PATTERNS>` in the article prompt. Late enough for strong recency bias, immediately before the anti-pattern that teaches the same concept with examples.

**Data source**: `state.roster` (set at await-roster checkpoint) mapped through `state.canonicalCharacters` (from root cause 2 fix). Player count is `roster.length`. Accusation from `state.sessionConfig.accusation`.

**Supporting anti-pattern in anti-patterns.md**:

```markdown
### Non-Roster Character Agency (CRITICAL)

The <SESSION_FACTS> roster defines who was present at the investigation.
Before giving ANY character actions during the investigation, verify
they appear in the roster.

- **IN the roster** → can have investigation-day actions, dialogue, decisions
- **NOT in the roster** → can ONLY appear as subjects in memory content (party events)

Memory content describes THE PARTY (past). Investigation actions require
physical presence, which means roster membership.

**WRONG (example: if Quinn is not on this session's roster):**

> Quinn was trapped between blackmail and exposure. Quinn had evidence
> and tried to get Marcus to confess.

WHY: Quinn's name appeared in other characters' exposed memories, but
if Quinn is not on the roster, Quinn was not at the investigation.
You cannot give a non-roster character investigation-day actions.

**RIGHT (same scenario: Quinn not on roster):**

> Quinn's name comes up in three exposed memories. Whatever pressure
> Marcus put on Quinn over the research, it left marks on everyone
> at that party.

WHY: Quinn appears as a subject of party-night memories without being
given investigation-day agency. The article references Quinn's role
in events without claiming Quinn was present this morning.

**THE CHECK:** Before writing "[Character] did/said/tried..." about the
investigation, verify that character is in <SESSION_FACTS>. If not,
they can only be referenced through memory content or paper evidence.
```

**Interaction with existing prompts**: The canonical roster in the system prompt and RULES section handles name validation (use correct full names). SESSION_FACTS handles presence and agency (who's actually here). These are complementary, not redundant.

**Phase 3 consideration**: The outline prompt also doesn't receive the session roster. If non-roster character issues originate from outlines, SESSION_FACTS should be added to `buildOutlinePrompt()` as well. Monitor and extend.

### Prompt Engineering Principle

Concrete injection over derived calculation. "There were exactly 11 players" is more reliable than "count the names in the roster list." Under 30K+ token cognitive load, models skip derivation steps.

Data proximity. The guardrail is placed immediately adjacent to the roster data it governs, not in a separate prompt file.

---

## Root Cause 4: Template Assembly Date/ID Bug

### Problem

`header.hbs` uses `metadata.generatedAt` for both the article display date and article ID. The article date should always be February 22, 2027 (story-world constant). The article ID should derive from the session date (e.g., NNA-0306-26), not the generation timestamp.

The existing prompt (section-rules.md:109) already says "in-world: always 02/22/27" but the template assembly code ignores this and uses the generation timestamp.

### Design

**Article date fix**:

Add `storyDate: '2027-02-22'` to the journalist config in `theme-config.js` display section. At content-bundle generation time (`ai-nodes.js`), populate `metadata.storyDate` from theme config. Update `header.hbs` to use `metadata.storyDate` with `metadata.generatedAt` as fallback:

```handlebars
<time class="nn-article__date" datetime="{{formatDatetime metadata.storyDate}}">
  {{formatDate metadata.storyDate}}
</time>
```

**Article ID fix**:

Update `articleId()` in `template-helpers.js` to derive from `metadata.sessionId` instead of `metadata.generatedAt`:

```javascript
function articleId(metadata) {
  const theme = (metadata && metadata.theme) || 'journalist';
  const config = getThemeConfig(theme);
  const prefix = (config && config.display && config.display.articleIdPrefix) || 'NNA';

  if (!metadata || !metadata.sessionId) {
    return `${prefix}-0000-00`;
  }

  // sessionId format: "0306" → NNA-0306-26
  // Year suffix from real-world generation date (2026 → "26"), NOT story date (2027)
  const yearSuffix = metadata.generatedAt
    ? String(new Date(metadata.generatedAt).getFullYear()).slice(-2)
    : '00';

  return `${prefix}-${metadata.sessionId}-${yearSuffix}`;
}
```

### Files to Update

- `lib/theme-config.js` — add `storyDate` to journalist display config
- `lib/template-helpers.js` — update `articleId()` to use sessionId
- `templates/journalist/partials/header.hbs` — use `metadata.storyDate`
- `lib/workflow/nodes/ai-nodes.js` — populate `metadata.storyDate` from theme config
- `lib/schemas/content-bundle.schema.json` — add optional `storyDate` field to metadata

---

## Root Cause 5: Director Observations Absent from Article Prompt

### Problem

Director observations are injected prominently in arc analysis (phase 2) with "PRIMARY WEIGHT" label. They reach the article (phase 4) only filtered through the outline, which compresses specific behavioral details into arc metadata. The 0306 article missed director-observed details: Blake's solicitation targets, NeurAI board dynamics, buyer due diligence behavior.

### Design

**Inject `directorNotes.observations` into the article prompt's DATA_CONTEXT**

New section in `buildArticlePrompt()`, placed inside `<DATA_CONTEXT>` after the evidence bundle and financial summary:

```xml
<INVESTIGATION_OBSERVATIONS>
What you observed during the investigation this morning.
These ground your behavioral claims — who you saw talking to whom,
notable moments, patterns you noticed.

${JSON.stringify(directorNotes.observations, null, 2)}
</INVESTIGATION_OBSERVATIONS>
```

**Key design decisions**:

- Named `INVESTIGATION_OBSERVATIONS`, not `DIRECTOR_OBSERVATIONS` — the concept of a "director" is a game mechanic that doesn't exist in Nova's world
- Framed as Nova's own observations ("What you observed") — the AI treats them as first-person source material
- No mention of "director" anywhere in the section — avoids planting a concept that would need to be suppressed
- Only `observations` injected, not `whiteboard` — whiteboard is already captured in arc analysis and flows through the outline. Observations contain the specific behavioral details that get compressed away.
- Placed in DATA_CONTEXT (with other source material), not RULES — these are content the AI draws from, not constraints

**Interaction with reporting mode**: The existing temporal discipline section already handles on-site vs remote framing. When `reportingMode` is "remote," Nova's language shifts to "I received reports" instead of "I watched." The observations section doesn't need mode-specific framing because the AI already has that context from TEMPORAL_DISCIPLINE.

### Files to Update

- `lib/prompt-builder.js` — `buildArticlePrompt()` accepts `directorNotes` as additional parameter, injects INVESTIGATION_OBSERVATIONS section into DATA_CONTEXT
- `lib/workflow/nodes/ai-nodes.js` — calling code for `buildArticlePrompt()` updated to pass `state.directorNotes` (already available in state from the await-full-context checkpoint)

**Parameter approach**: Add `directorNotes = {}` as a named parameter to `buildArticlePrompt()`. The calling code in `ai-nodes.js` passes `state.directorNotes`. Only `observations` is injected (not whiteboard).

### Prompt Engineering Principle

State what to DO with data, not what NOT to do. "These ground your behavioral claims" is more effective than "Never reference a director." Negative instructions introduce concepts that then need suppression.

---

## Structural Bonus: Token ID Identity Leak

### Problem

Buried items in the evidence bundle are well-stripped (no fullContent, no ownerLogline, no characterRefs). But token IDs encode identity: `ril003` = Riley, `qui002` = Quinn. The AI can decode these prefixes and connect buried transactions to specific characters.

### Design (Deferred)

This is a defense-in-depth concern, not a root cause of the 0306 failures. The primary fixes (evidence-boundaries money direction + SESSION_FACTS non-roster guardrail) address the behavioral failures. If identity attribution from token IDs persists after these fixes, consider:

- Anonymizing buried token IDs in `routeTokensByDisposition()`: replace `ril003` with `buried-001`, `qui002` with `buried-002`
- This removes the last data-level identity leak without adding prompt guardrails

Monitor in next pipeline run before implementing.

---

## Update Scope: Prompt File Name References

All 11 prompt files need character name updates. Scope of changes per file:

| File | References to Update |
|------|---------------------|
| evidence-boundaries.md | Victoria → Vic (lines 81, 84, 104, 106, 114, 259+), mechanics rewrite |
| anti-patterns.md | Victoria → Vic (lines 94, 97), add non-roster agency anti-pattern |
| character-voice.md | Victoria references in examples |
| narrative-structure.md | Victoria, Derek, Diana references in examples |
| section-rules.md | Victoria references, update [X] instruction to reference SESSION_FACTS |
| writing-principles.md | Victoria, Derek, James references in examples |
| editorial-design.md | Minimal — mostly abstract examples |
| arc-flow.md | Victoria, Morgan references in examples |
| formatting.md | Check for name references |
| photo-analysis.md | Check for name references |
| photo-enrichment.md | Check for name references |

Names to find/replace across all files:
- James → Remi
- Victoria → Vic
- Derek → Sam
- Diana → Mel
- Jessicah → Jess
- Leila → Zia
- Rachel → Riley
- Howie → Ezra
- Sofia → Nat
- Oliver → Quinn

**Caution**: Some prompt files use old names in WRONG/RIGHT examples. When updating names, verify the examples still make sense with the new names (e.g., the anti-patterns "Victoria Chen" hallucination example needs to become "Vic Chen" to still demonstrate the pattern).

---

## Summary of Changes

| Component | Change Type | Root Cause |
|-----------|------------|------------|
| evidence-boundaries.md | Rewrite mechanics + add money-direction examples | RC1 |
| theme-config.js | Update canonical names (fallback) + add storyDate | RC2, RC4 |
| fetch-nodes.js (or helper) | Extract canonical names from Notion data | RC2 |
| prompt-builder.js | Accept canonicalCharacters from state, add SESSION_FACTS, add INVESTIGATION_OBSERVATIONS | RC2, RC3, RC5 |
| anti-patterns.md | Add non-roster character agency anti-pattern | RC3 |
| template-helpers.js | Fix articleId() to use sessionId | RC4 |
| header.hbs | Use storyDate instead of generatedAt | RC4 |
| ai-nodes.js | Populate metadata.storyDate | RC4 |
| content-bundle.schema.json | Add storyDate field | RC4 |
| All 11 prompt files | Update character name references | RC2 |
| section-rules.md | Update [X] instruction to reference SESSION_FACTS | RC3 |
