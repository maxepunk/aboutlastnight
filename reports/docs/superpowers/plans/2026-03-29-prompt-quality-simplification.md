# Prompt & Context Quality Simplification Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix verified prompt contradictions, missing constraints, and context engineering issues that directly degrade article output quality — without changing pipeline architecture.

**Architecture:** All changes are to prompt text (markdown files + prompt-builder.js) and two node files (evaluator-nodes.js, ai-nodes.js). No new files. No workflow graph changes. No schema changes. Tasks are independent and can be parallelized.

**Tech Stack:** Markdown prompt files, JavaScript (prompt-builder.js, ai-nodes.js, evaluator-nodes.js, theme-config.js)

---

## File Map

| File | Changes |
|------|---------|
| `lib/prompt-builder.js` | Remove "transactions" from hardConstraints, remove raw evidenceBundle from outline+article prompts, add roster to revision prompt, consolidate temporal discipline, update length targets |
| `lib/theme-config.js` | Remove "transactions" prohibition note if present, update wordBudgets |
| `lib/workflow/nodes/ai-nodes.js` | Hero image selection with group photo weighting |
| `lib/workflow/nodes/evaluator-nodes.js` | Remove evidence truncation in arc evaluator |
| `lib/workflow/nodes/node-helpers.js` | Derive canonical characters from Notion data, hardcoded map becomes fallback |
| `lib/theme-config.js` | Demote `canonicalCharacters` to fallback role, add comments |
| `.claude/skills/journalist-report/references/prompts/formatting.md` | Update length, clarify sidebar/inline card roles, reframe visual break guidance |
| `.claude/skills/journalist-report/references/prompts/narrative-structure.md` | Update length target |
| `.claude/skills/journalist-report/references/prompts/editorial-design.md` | Reframe visual break as design principle |
| `.claude/skills/journalist-report/references/prompts/section-rules.md` | Reframe visual break, add fabricated dialogue prohibition |
| `.claude/skills/journalist-report/references/prompts/writing-principles.md` | Add fabricated dialogue prohibition |

---

## Task 1: Remove "transactions" from Prohibited Terms

**Files:**
- Modify: `lib/prompt-builder.js:112`
- Modify: `lib/prompt-builder.js:1092`

**Context:** "transactions" is wrongly grouped with game mechanics terms. Players conduct transactions during the investigation to expose/bury tokens — this is a narrative action, not a game mechanic. The word appears 11 times in `evidence-boundaries.md` as correct vocabulary. The programmatic `bannedPatterns` in `theme-config.js` already correctly exclude "transactions" — only the prompt text bans it.

- [ ] **Step 1: Read the current hardConstraints text**

Read `lib/prompt-builder.js` lines 107-116 to see the full `THEME_CONSTRAINTS.journalist.hardConstraints` string.

- [ ] **Step 2: Remove "transactions" from hardConstraints**

In `lib/prompt-builder.js`, change line 112 from:
```javascript
- NO game mechanics ("transactions", "buried", "first-buried bonus", "guests")
```
to:
```javascript
- NO game mechanics ("buried memories", "first-buried bonus", "guests")
```

Note: "buried" as a standalone word is used legitimately in evidence-boundaries.md ("buried evidence"). The prohibition should target "buried memories" (the game-mechanic compound) specifically, not "buried" alone. "transactions" is removed entirely.

- [ ] **Step 3: Remove "transactions" from revision checklist**

In `lib/prompt-builder.js`, change line 1092 from:
```javascript
- Game mechanics language ("tokens", "transactions", "buried bonus")`;
```
to:
```javascript
- Game mechanics language ("tokens", "buried memories", "buried bonus")`;
```

- [ ] **Step 4: Run tests**

Run: `npx jest lib/__tests__/ --passWithNoTests -v`
Expected: All existing tests pass (these strings aren't tested directly).

- [ ] **Step 5: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "fix(prompts): remove 'transactions' from prohibited terms

Transactions are a narrative action (players transact to expose/bury
evidence during investigation), not a game mechanic. The prohibition
contradicted evidence-boundaries.md which uses 'transactions' 11x as
correct vocabulary. Also narrowed 'buried' to 'buried memories' to
avoid false-flagging legitimate evidence-boundaries language."
```

---

## Task 2: Add Roster to Revision Prompt

**Files:**
- Modify: `lib/prompt-builder.js:1066-1116`

**Context:** `buildRevisionPrompt` does not call `generateRosterSection()`. When a revision is triggered, the model operates without canonical character names, making it likely to hallucinate wrong names during targeted fixes. Every other generation phase (outline, article) includes the roster.

- [ ] **Step 1: Read the current buildRevisionPrompt method**

Read `lib/prompt-builder.js` lines 1066-1116 to understand the full revision prompt structure.

- [ ] **Step 2: Add roster to the revision system prompt**

In `lib/prompt-builder.js`, modify the `buildRevisionPrompt` method. After the `revisionConstraints.revisionVoice` line (line 1077), add the roster section:

```javascript
  async buildRevisionPrompt(articleContent, voiceSelfCheck) {
    const prompts = await this.theme.loadPhasePrompts('articleGeneration');

    const revisionConstraints = THEME_CONSTRAINTS[this.themeName];
    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].revision}

REVISION RULES:
- Make TARGETED fixes only - do not rewrite sections that are working
- Preserve structure: ${this.themeName === 'detective' ? 'sections, photos' : 'sections, evidence cards, photos, pull quotes, financial tracker'}
- Focus on the specific issues you identified in your self-check

${revisionConstraints.revisionVoice}

${generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData)}`;
```

- [ ] **Step 3: Run tests**

Run: `npx jest lib/__tests__/ --passWithNoTests -v`
Expected: PASS. The mock `buildRevisionPrompt` in ai-nodes.js doesn't test roster content.

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "fix(prompts): add canonical roster to revision prompt

buildRevisionPrompt was the only generation phase without the canonical
character roster. Revisions could introduce hallucinated character names
because the model had no name reference during targeted fixes."
```

---

## Task 3: Eliminate Hardcoded Canonical Character Map

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js:958-980` (`extractCanonicalCharacters`)
- Modify: `lib/workflow/nodes/node-helpers.js:476-482` (`extractOwnerName`)
- Modify: `lib/workflow/nodes/node-helpers.js:683-700` (`validateRosterName`)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:153-161` (`buildCoreArcPrompt`)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1731-1741` (`validateRosterCoverage`)
- Modify: `lib/prompt-builder.js:24-29` (`generateRosterSection`)
- Modify: `lib/theme-config.js:79-105,167-192` (remove `canonicalCharacters` maps)
- Modify: `lib/theme-config.js:263-268` (`getCanonicalName`)
- Modify: `lib/theme-config.js:279-289` (`getThemeCharacters`)
- Modify: `lib/__tests__/theme-config.test.js` (remove tests asserting hardcoded names)

**Context:** `theme-config.js` has hardcoded first→full name maps for all 20 PCs + NPCs in both themes. These are manually maintained and will silently go stale if a character name changes in Notion. Meanwhile, Notion's `resolveRelationNames` already resolves Character page IDs to their full title names — token `owners` already contain canonical full names like "Sarah Blackwood" from the Character database. The hardcoded map is redundant replication of Notion data.

**Data flow today:**
1. Notion Character pages have `Name` title (e.g., "Sarah Blackwood")
2. `resolveRelationNames` fetches each page, extracts Name
3. Token `owners` = `["Sarah Blackwood"]` (already full name)
4. `extractCanonicalCharacters` splits to get "Sarah", looks up in hardcoded map → "Sarah Blackwood"
5. Step 4 is circular — the hardcoded map just replicates what Notion already provided in step 3

**Data flow after:**
1-3: Same
4. `extractCanonicalCharacters` builds `{ "Sarah": "Sarah Blackwood" }` directly from the owner string — first name = split on space, full name = the owner string itself

**Callers of `getCanonicalName()` that must change:**
| Caller | File:Line | How It Uses Name Resolution |
|--------|-----------|---------------------------|
| `extractCanonicalCharacters` | `node-helpers.js:971` | Maps first name → full name |
| `extractOwnerName` | `node-helpers.js:482` | Maps first name from logline → full name |
| `validateRosterName` | `node-helpers.js:697` | Checks if input matches canonical form |
| `validateRosterCoverage` | `arc-specialist-nodes.js:1737` | Maps roster → canonical for coverage check |
| `generateRosterSection` | `prompt-builder.js:25` | Merges hardcoded base with Notion override |

- [ ] **Step 1: Rewrite `extractCanonicalCharacters` to derive from Notion data**

In `lib/workflow/nodes/node-helpers.js`, replace the function (lines 958-980):

```javascript
/**
 * Extract canonical character name mapping from Notion-resolved token data
 *
 * Builds a firstName → fullName map from token owners. Notion's
 * resolveRelationNames already provides full canonical names from
 * Character database pages — we derive the mapping directly.
 *
 * Also includes paper evidence owners for broader coverage.
 *
 * @param {Array} tokens - Memory tokens with Notion-resolved owners
 * @param {string} theme - Theme name (for NPC filtering)
 * @param {Array} paperEvidence - Optional paper evidence items with owners
 * @returns {Object} Map of firstName → fullName (e.g., { "Sarah": "Sarah Blackwood" })
 */
function extractCanonicalCharacters(tokens, theme = 'journalist', paperEvidence = []) {
  const characters = {};
  const npcNames = new Set(getThemeNPCs(theme).map(n => n.toLowerCase()));

  // Collect owners from both tokens and paper evidence
  const allItems = [...(tokens || []), ...(paperEvidence || [])];

  for (const item of allItems) {
    for (const owner of (item.owners || [])) {
      if (!owner) continue;

      // Notion resolves owners to full names from Character pages
      // e.g., "Sarah Blackwood", "Flip", "Marcus Blackwood"
      const firstName = owner.includes(' ') ? owner.split(' ')[0].trim() : owner;
      const firstNameKey = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();

      // Skip if we already have this character (first occurrence wins)
      if (characters[firstNameKey]) continue;

      // The owner string from Notion IS the canonical full name
      characters[firstNameKey] = owner;
    }
  }

  return characters;
}
```

Key changes:
- Derives firstName → fullName directly from Notion-resolved owner strings
- No `getCanonicalName()` call — Notion IS the source of truth
- No `knownNames` warning check against hardcoded list — if a character exists in Notion, they're valid
- Optionally accepts `paperEvidence` for broader character coverage (e.g., Marcus appears in paper evidence but not as token owner)

- [ ] **Step 2: Update `fetchMemoryTokens` to pass paper evidence**

In `lib/workflow/nodes/fetch-nodes.js`, update the `extractCanonicalCharacters` call (around line 340). The paper evidence might not be available yet at this point in the pipeline. Two options:

Option A (simple): Leave the call as-is, pass only tokens. Paper evidence owners will be added when `curateEvidenceBundle` runs.

Option B (better coverage): If `state.paperEvidence` is available, pass it:

```javascript
const canonicalCharacters = extractCanonicalCharacters(
  taggedTokens,
  state.theme || 'journalist',
  state.paperEvidence?.evidence || []
);
```

Use Option A for now — token owners cover all PCs. Paper evidence owners are typically the same characters.

- [ ] **Step 3: Rewrite `getCanonicalName` to use a passed map**

In `lib/theme-config.js`, change the function (lines 263-268):

```javascript
/**
 * Get canonical full name for a character first name
 *
 * Looks up in the provided canonicalCharacters map (derived from Notion).
 * Returns firstName as-is if not found in the map.
 *
 * @param {string} firstName - First name (e.g., 'Vic')
 * @param {Object} canonicalCharacters - firstName → fullName map from Notion
 * @returns {string} Full canonical name (e.g., 'Vic Kingsley') or firstName if not found
 */
function getCanonicalName(firstName, canonicalCharacters = {}) {
  if (!firstName) return firstName;
  const normalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return canonicalCharacters[normalized] || firstName;
}
```

**Breaking change:** Second parameter changes from `theme` (string) to `canonicalCharacters` (object). All callers must be updated.

- [ ] **Step 4: Update `extractOwnerName` to accept canonicalCharacters**

In `lib/workflow/nodes/node-helpers.js`, change the function (lines 476-483):

```javascript
/**
 * Extract owner name from token ownerLogline and resolve to canonical
 *
 * @param {string} ownerLogline - e.g., "Alex's memory of..." or "ALEX: ..."
 * @param {Object} canonicalCharacters - firstName → fullName map from Notion
 * @returns {string} Canonical full name (e.g., "Alex Reeves") or first name if not found
 */
function extractOwnerName(ownerLogline, canonicalCharacters = {}) {
  if (!ownerLogline) return 'Unknown';
  const match = ownerLogline.match(/^(\w+)/);
  const firstName = match ? match[1] : ownerLogline.substring(0, 20);
  return getCanonicalName(firstName, canonicalCharacters);
}
```

- [ ] **Step 5: Update `extractOwnerName` caller in `buildExposedTokenSummaries`**

There is one call site: `node-helpers.js:497` inside `buildExposedTokenSummaries`:

```javascript
owner: extractOwnerName(t.owner),
```

This function is called from `curateEvidenceBundle` in `ai-nodes.js`. The canonical characters map needs to be threaded through. Update `buildExposedTokenSummaries` to accept `canonicalCharacters`:

```javascript
function buildExposedTokenSummaries(exposedTokens, canonicalCharacters = {}) {
  return exposedTokens.map(t => ({
    id: t.id,
    owner: extractOwnerName(t.owner, canonicalCharacters),
    chars: (t.characterRefs || []).slice(0, 3).join(', '),
    gist: (t.summary || '').substring(0, 60)
```

Then update its caller in `ai-nodes.js` (`curateEvidenceBundle`) to pass `state.canonicalCharacters || {}`.

- [ ] **Step 6: Update `validateRosterName` to accept canonicalCharacters**

In `lib/workflow/nodes/node-helpers.js`, change the function signature (line 683):

```javascript
function validateRosterName(name, roster, canonicalCharacters = {}) {
```

And change line 697 from:
```javascript
    const canonical = getCanonicalName(rosterName, theme);
```
to:
```javascript
    const canonical = getCanonicalName(rosterName, canonicalCharacters);
```

There is one caller: `arc-specialist-nodes.js:1581` inside `normalizeCharacterPlacements`:

```javascript
const matchedName = validateRosterName(name, roster, theme);
```

Change to:
```javascript
const matchedName = validateRosterName(name, roster, canonicalCharacters);
```

The `normalizeCharacterPlacements` function is called from `validateArcStructure` which receives `state`. Thread `state.canonicalCharacters || {}` through as a `canonicalCharacters` parameter to `normalizeCharacterPlacements`.

- [ ] **Step 7: Update `validateRosterCoverage` in arc-specialist-nodes.js**

In `lib/workflow/nodes/arc-specialist-nodes.js`, update the coverage check (lines 1731-1741). Change:

```javascript
  const canonicalToRoster = new Map();
  roster.forEach(rosterName => {
    const nameLower = rosterName.toLowerCase();
    canonicalToRoster.set(nameLower, nameLower);
    const canonical = getCanonicalName(rosterName, theme);
    if (canonical.toLowerCase() !== nameLower) {
      canonicalToRoster.set(canonical.toLowerCase(), nameLower);
    }
  });
```

to:

```javascript
  const canonicalChars = state?.canonicalCharacters || {};
  const canonicalToRoster = new Map();
  roster.forEach(rosterName => {
    const nameLower = rosterName.toLowerCase();
    canonicalToRoster.set(nameLower, nameLower);
    const canonical = getCanonicalName(rosterName, canonicalChars);
    if (canonical.toLowerCase() !== nameLower) {
      canonicalToRoster.set(canonical.toLowerCase(), nameLower);
    }
  });
```

Note: `validateArcStructure` (the function containing this code) already receives `state` as a parameter (check the function signature). If not, pass `canonicalCharacters` as a parameter from the caller.

- [ ] **Step 8: Update `buildCoreArcPrompt` non-roster PC calculation**

In `lib/workflow/nodes/arc-specialist-nodes.js`, update lines 158-161:

```javascript
  const themeNPCs = getThemeNPCs(theme);
  const themeCharacters = getThemeCharacters(theme);
  const nonRosterPCs = getNonRosterPCs(context.roster, themeCharacters, themeNPCs);
```

Change to derive character list from the Notion-resolved canonical map:

```javascript
  const themeNPCs = getThemeNPCs(theme);
  const allCharacters = Object.keys(state.canonicalCharacters || {});
  const nonRosterPCs = getNonRosterPCs(context.roster, allCharacters, themeNPCs);
```

This uses the Notion-derived canonical characters (first names) as the "all characters" list instead of the hardcoded `getThemeCharacters()`. Non-roster PCs are now characters seen in Notion data that aren't in this session's roster and aren't NPCs.

- [ ] **Step 9: Update `generateRosterSection` to stop merging with hardcoded**

In `lib/prompt-builder.js`, change `generateRosterSection` (lines 24-29):

```javascript
function generateRosterSection(theme = 'journalist', canonicalCharacters = null, characterData = null) {
  // Notion-derived canonicalCharacters IS the authority — no hardcoded merging
  const characters = canonicalCharacters || {};
```

Remove the `themeCharacters` merge:
```javascript
  // REMOVED: const themeCharacters = getThemeConfig(theme)?.canonicalCharacters || {};
  // REMOVED: const characters = canonicalCharacters ? { ...themeCharacters, ...canonicalCharacters } : themeCharacters;
```

- [ ] **Step 10: Remove `canonicalCharacters` from theme-config.js**

In `lib/theme-config.js`:

Remove lines 76-105 (journalist `canonicalCharacters` block):
```javascript
    // DELETE entire canonicalCharacters object from journalist theme
```

Remove lines 166-193 (detective `canonicalCharacters` block):
```javascript
    // DELETE entire canonicalCharacters object from detective theme
```

Update `getThemeCharacters` to return empty array (or remove it):

```javascript
/**
 * @deprecated Use state.canonicalCharacters (Notion-derived) instead
 */
function getThemeCharacters(theme = 'journalist') {
  console.warn('[getThemeCharacters] DEPRECATED: Use state.canonicalCharacters from Notion data');
  return [];
}
```

Remove `getCanonicalName` from theme-config.js entirely — it now lives in node-helpers.js (or keep it but with the new signature that takes a map).

- [ ] **Step 11: Update imports**

Update `require` statements in files that import `getCanonicalName` from `theme-config`:
- `lib/workflow/nodes/node-helpers.js:12` — remove `getCanonicalName` from theme-config import, add local implementation or import from a shared util
- `lib/workflow/nodes/arc-specialist-nodes.js:40` — remove `getCanonicalName` and `getThemeCharacters` from import

Decision: Keep `getCanonicalName` in `theme-config.js` with the new signature (takes map instead of theme). It's a simple utility function that doesn't need to move.

- [ ] **Step 12: Update tests**

In `lib/__tests__/theme-config.test.js`, remove or update tests that assert on hardcoded character names:
- Remove "journalist canonicalCharacters has current first names" test
- Remove "detective canonicalCharacters matches journalist PCs" test
- Remove `getCanonicalName('Sarah', 'detective')` test
- Add test for new `getCanonicalName(firstName, map)` signature:

```javascript
it('getCanonicalName looks up from provided map', () => {
  const map = { 'Sarah': 'Sarah Blackwood', 'Vic': 'Vic Kingsley' };
  expect(getCanonicalName('Sarah', map)).toBe('Sarah Blackwood');
  expect(getCanonicalName('Vic', map)).toBe('Vic Kingsley');
  expect(getCanonicalName('Unknown', map)).toBe('Unknown');
  expect(getCanonicalName('sarah', map)).toBe('Sarah Blackwood'); // case-insensitive
});
```

- [ ] **Step 13: Run all tests**

Run: `npx jest --passWithNoTests -v`
Expected: All tests pass. Some theme-config tests will have been removed/updated.

- [ ] **Step 14: Commit**

```bash
git add lib/theme-config.js lib/prompt-builder.js \
       lib/workflow/nodes/node-helpers.js \
       lib/workflow/nodes/arc-specialist-nodes.js \
       lib/workflow/nodes/fetch-nodes.js \
       lib/__tests__/theme-config.test.js
git commit -m "refactor: eliminate hardcoded canonical character map

Character names now derived entirely from Notion Character database
pages via resolveRelationNames. The hardcoded canonicalCharacters maps
in theme-config.js (20 PCs + NPCs, duplicated across 2 themes) have
been removed.

getCanonicalName() now takes a Notion-derived map parameter instead of
looking up from hardcoded config. All callers updated to pass
state.canonicalCharacters.

This ensures character name changes in Notion automatically propagate
to the pipeline without manual code updates."
```

---

## Task 4: Standardize Article Length to 1000-1500 Words

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md:131`
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md:133`
- Modify: `lib/theme-config.js:37-43` (wordBudgets)

**Context:** Three sources give three different ranges: formatting.md says 1000-2000, narrative-structure.md says 1200-1800, theme-config wordBudgets sum to 400-1950. The official target is 1000-1500 words.

- [ ] **Step 1: Update formatting.md**

In `.claude/skills/journalist-report/references/prompts/formatting.md`, change line 131 from:
```markdown
**Total article:** 1000-2000 words typical. Can be shorter with sparse evidence.
```
to:
```markdown
**Total article:** 1000-1500 words. Quality over quantity - a tight article with impact beats a long one that wanders.
```

- [ ] **Step 2: Update narrative-structure.md**

In `.claude/skills/journalist-report/references/prompts/narrative-structure.md`, change line 133 from:
```markdown
**Target:** 1200-1800 words of prose (excluding visual component markup)
```
to:
```markdown
**Target:** 1000-1500 words of prose (excluding visual component markup)
```

- [ ] **Step 3: Update theme-config.js wordBudgets**

In `lib/theme-config.js`, update the journalist `wordBudgets` to fit the 1000-1500 envelope:

```javascript
wordBudgets: {
  lede: { min: 50, max: 150 },
  theStory: { min: 300, max: 600 },
  thePlayers: { min: 100, max: 300 },
  closing: { min: 50, max: 150 }
}
```

Reduced `theStory` max from 800→600 and `closing` max from 200→150 to stay within the 1500 ceiling. Sum of maxes: 150+600+300+150 = 1200 (leaves room for optional sections).

- [ ] **Step 4: Run tests**

Run: `npx jest lib/__tests__/theme-loader.test.js -v`
Expected: PASS (tests don't assert on specific word budget values).

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md \
       .claude/skills/journalist-report/references/prompts/narrative-structure.md \
       lib/theme-config.js
git commit -m "fix(prompts): standardize article length to 1000-1500 words

Three sources had three different ranges (1000-2000, 1200-1800, and
400-1950 via wordBudgets). Unified to 1000-1500 across formatting.md,
narrative-structure.md, and theme-config.js wordBudgets."
```

---

## Task 5: Reframe Visual Break Rule Around Compulsive Readability

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md:21`
- Modify: `.claude/skills/journalist-report/references/prompts/editorial-design.md:9-17`
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:41`
- Modify: `.claude/skills/journalist-report/references/prompts/narrative-structure.md:230`

**Context:** Four files reference "max 3 paragraphs without a visual break" with contradictory framing (two say "Rule", one says "guidance"). The real goal is intelligent visual component placement that creates compulsive readability — not a rigid paragraph count. `editorial-design.md` already explains the WHY (scroll depth psychology) but states the conclusion as a rigid rule.

- [ ] **Step 1: Reframe in formatting.md (the component definition file)**

Change line 21 from:
```markdown
### Rule: Max 3 paragraphs without a visual break
```
to:
```markdown
### Visual Pacing for Compulsive Readability

Place visual components (evidence cards, photos, pull quotes) to maintain scroll engagement. Every 2-3 paragraphs, readers decide whether to continue or abandon. A well-placed visual at that decision point acts as a micro-reward that pulls them forward. Let the narrative dictate placement — components should EARN their position by serving the story, not filling a quota.
```

- [ ] **Step 2: Reframe in editorial-design.md (the design principles file)**

Replace lines 9-17 (the "Rule" statement and surrounding context):

```markdown
## 1. Scroll Depth Psychology

Readers decide to continue or abandon every 2-3 paragraphs. Design for this reality.

**Principles:**
- Visual breaks serve as "micro-rewards" that reinforce continued reading
- Each scroll should reveal something visually different from what came before
- Data terminal elements create curiosity ("what will the next reveal show?")
- Dense text walls signal "this will be work" and trigger abandonment

**Guidance:** Aim for no more than 3 consecutive paragraphs of prose without a visual component. But the placement should feel organic — a perfectly placed evidence card after one paragraph of explosive revelation is better than a forced card after exactly three paragraphs of filler.
```

- [ ] **Step 3: Reframe in section-rules.md**

Change line 41 from:
```markdown
Visual components are **inline content blocks** within sections. The "max 3 paragraphs" rule is guidance, not a hard cap - the goal is compelling narrative flow.
```
to:
```markdown
Visual components are **inline content blocks** within sections. Place them where they serve the narrative — to prove a claim (evidence card), to humanize before a revelation (photo), or to crystallize a powerful moment (pull quote). The goal is compulsive readability, not quota compliance.
```

- [ ] **Step 4: Reframe in narrative-structure.md**

Change line 230 from:
```markdown
1. **Never more than 3 paragraphs without a visual break** (existing rule)
```
to:
```markdown
1. **Pace visual components for scroll engagement** — aim for a visual element every 2-3 paragraphs, but let narrative rhythm dictate placement
```

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md \
       .claude/skills/journalist-report/references/prompts/editorial-design.md \
       .claude/skills/journalist-report/references/prompts/section-rules.md \
       .claude/skills/journalist-report/references/prompts/narrative-structure.md
git commit -m "fix(prompts): reframe visual break rule around compulsive readability

Four files contradicted each other on whether 'max 3 paragraphs' was a
rule or guidance. Reframed all four around the actual goal: intelligent
visual component placement for scroll engagement and compulsive
readability. Components should EARN their place by serving the narrative."
```

---

## Task 6: Remove Raw evidenceBundle from Outline and Article Prompts

**Files:**
- Modify: `lib/prompt-builder.js:529-536` (outline journalist)
- Modify: `lib/prompt-builder.js:355-362` (outline detective)
- Modify: `lib/prompt-builder.js:798-811` (article journalist)
- Modify: `lib/prompt-builder.js:698-702` (article detective)

**Context:** Both outline and article prompts include the full `JSON.stringify(evidenceBundle, null, 2)` AND `arcEvidencePackages` (a curated per-arc subset with `fullContent` and `quotableExcerpts`). The raw bundle contains evidence NOT in any selected arc, which can pull the model off-topic. `arcEvidencePackages` is the signal; the raw bundle is noise that competes for attention.

The raw bundle should be removed from outline and article prompts. For evidence card selection, the model should use `arcEvidencePackages.evidenceItems` — these are the evidence items relevant to the approved arcs.

**Important:** The detective outline prompt at line 358-359 also includes the raw bundle inside `<arc-analysis>`. Both themes need the same treatment.

- [ ] **Step 1: Read the current outline prompt (journalist, lines 529-537)**

Read `lib/prompt-builder.js` lines 525-540 to see where `evidenceBundle` sits in the journalist outline prompt.

- [ ] **Step 2: Remove evidenceBundle from journalist outline prompt**

In the journalist outline prompt, find the `<arc-analysis>` block (around line 529). Change:

```javascript
<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE (for evidence card selection):
${JSON.stringify(evidenceBundle, null, 2)}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>
```

to:

```javascript
<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>
```

Remove the `EVIDENCE BUNDLE (for evidence card selection):` line and the `JSON.stringify(evidenceBundle)` line. The arc evidence packages (already included in the `<arc-evidence>` block above) contain all the evidence items needed for outline decisions.

- [ ] **Step 3: Remove evidenceBundle from detective outline prompt**

In the detective outline prompt, find the `<arc-analysis>` block (around line 355). Change:

```javascript
<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE:
${JSON.stringify(evidenceBundle, null, 2)}
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>
```

to:

```javascript
<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>
```

- [ ] **Step 4: Remove evidenceBundle from journalist article prompt**

In the journalist article prompt (around line 798-811), find:

```javascript
EVIDENCE BUNDLE (quote ONLY from exposed evidence):

TEMPORAL CONTEXT KEY (evidence items carry a temporalContext field):
- "PARTY" = RECOVERED MEMORY from the night of the party. You watched this play back on a screen.
  USE: "The memory shows..." / "Recovered footage from [time] captures..." / "A memory from [time] reveals..."
  NEVER: "I watched [character] do X" for party events. You were NOT at the party.
- "INVESTIGATION" = Something you DIRECTLY OBSERVED or that occurred during this morning's investigation.
  USE: "I watched..." / "I saw..." / "This morning..."
- "BACKGROUND" = Document or evidence that predates the party.
  USE: "Records show..." / "Documents reveal..."

${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
```

Replace with:

```javascript
TEMPORAL CONTEXT KEY (evidence items carry a temporalContext field):
- "PARTY" = RECOVERED MEMORY from the night of the party. You watched this play back on a screen.
  USE: "The memory shows..." / "Recovered footage from [time] captures..." / "A memory from [time] reveals..."
  NEVER: "I watched [character] do X" for party events. You were NOT at the party.
- "INVESTIGATION" = Something you DIRECTLY OBSERVED or that occurred during this morning's investigation.
  USE: "I watched..." / "I saw..." / "This morning..."
- "BACKGROUND" = Document or evidence that predates the party.
  USE: "Records show..." / "Documents reveal..."

${arcEvidenceSection}
```

Remove the `EVIDENCE BUNDLE` label and `JSON.stringify(evidenceBundle)`. Keep the temporal context key (it guides how to interpret the arc evidence items). Keep `arcEvidenceSection` (the curated per-arc evidence).

- [ ] **Step 5: Remove evidenceBundle from detective article prompt**

In the detective article prompt (around line 698-702), find:

```javascript
EVIDENCE BUNDLE:
${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
```

Replace with:

```javascript
${arcEvidenceSection}
```

- [ ] **Step 6: Update buildArticlePrompt signature (optional cleanup)**

The `evidenceBundle` parameter is still needed by `generateRosterSection` (which reads `this.canonicalCharacters`, not the bundle) and by `_buildFinancialSummary` (which reads `shellAccounts`, not the bundle). Verify: does any remaining code in `buildArticlePrompt` or `buildOutlinePrompt` use the `evidenceBundle` parameter after this change?

If not, consider removing `evidenceBundle` from the parameter list in a follow-up. For now, leave the parameter — it's still passed by callers and removing it would require changing `ai-nodes.js` call sites.

- [ ] **Step 7: Run tests**

Run: `npx jest lib/__tests__/ --passWithNoTests -v`
Expected: PASS. The mock `buildArticlePrompt` and `buildOutlinePrompt` don't assert on evidenceBundle serialization.

- [ ] **Step 8: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "fix(prompts): remove raw evidenceBundle from outline and article prompts

Both outline and article prompts included full evidenceBundle JSON AND
arcEvidencePackages (a curated per-arc subset). The raw bundle contained
evidence not in any approved arc, competing for model attention and
potentially pulling content off-topic. arcEvidencePackages contains all
evidence items needed for both phases."
```

---

## Task 7: Consolidate Temporal Discipline in Article Prompt

**Files:**
- Modify: `lib/prompt-builder.js:84-90` (system prompt)
- Modify: `lib/prompt-builder.js:841-854` (user prompt `<TEMPORAL_DISCIPLINE>` block)

**Context:** The temporal framework appears in the system prompt (lines 84-90) AND in a `<TEMPORAL_DISCIPLINE>` XML block in the user prompt (lines 841-854). The user prompt version is more detailed and is positioned at recency-bias position (inside `<RULES>`, which is late in the prompt). The system prompt version is shorter. Having both means the model sees two slightly different phrasings. The prompt files (`writing-principles.md`, `anti-patterns.md`, `narrative-structure.md`) already contain only cross-references to "the system prompt," which is correct.

**Decision:** Keep the detailed `<TEMPORAL_DISCIPLINE>` block in the user prompt (recency bias position, more detailed). Slim the system prompt version to a one-line reminder that points to the detailed block.

- [ ] **Step 1: Read both temporal sections**

Read `lib/prompt-builder.js` lines 78-92 (system prompt) and lines 841-854 (user prompt block).

- [ ] **Step 2: Slim the system prompt temporal section**

In `lib/prompt-builder.js`, change the journalist `articleGeneration` system prompt (lines 82-90) from:

```javascript
articleGeneration: `You are Nova, writing a NovaNews investigative article. First-person participatory voice.

CRITICAL TEMPORAL RULE: THE PARTY happened LAST NIGHT. THE INVESTIGATION happened THIS MORNING.
You are writing the article NOW, immediately after the investigation concluded.
- Memory CONTENT describes party events from LAST NIGHT. Nova was NOT at the party.
- Director observations describe investigation events from THIS MORNING.
- "I watched" / "I saw" = investigation behavior from this morning.
- "The memory shows" / "In the recording" = party events from last night.
- Burial transactions are investigation actions (this morning), NOT party events.`,
```

to:

```javascript
articleGeneration: `You are Nova, writing a NovaNews investigative article. First-person participatory voice.

CRITICAL: THE PARTY = LAST NIGHT. THE INVESTIGATION = THIS MORNING. See <TEMPORAL_DISCIPLINE> in the prompt for detailed rules.`,
```

The full temporal framework remains in the `<TEMPORAL_DISCIPLINE>` block (lines 841-854), which is in the `<RULES>` section at recency-bias position.

- [ ] **Step 3: Run tests**

Run: `npx jest lib/__tests__/ --passWithNoTests -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/prompt-builder.js
git commit -m "fix(prompts): consolidate temporal discipline to one detailed location

System prompt had a full temporal framework AND the user prompt had a
detailed <TEMPORAL_DISCIPLINE> block. Slimmed the system prompt to a
one-line pointer to the user prompt block, which has recency bias
advantage and more detailed language rules."
```

---

## Task 8: Clarify Sidebar vs Inline Evidence Card Roles

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md:88-97`
- Modify: `lib/prompt-builder.js:894-933` (the `<VISUAL_COMPONENT_TYPES>` block)

**Context:** `formatting.md` says sidebar and inline evidence cards are "the SAME cards." This creates visual redundancy — readers see identical evidence content in both the article body and the sidebar. Meanwhile `section-rules.md:49` says "Evidence cards and prose must NOT contain the same information." The model needs clearer guidance on what each serves.

**Design decision:** Sidebar cards are the complete evidence catalog for the session (all key evidence, brief format). Inline `evidence-card` blocks are the 3-5 most impactful moments, shown with full verbatim text at narrative climax points. Inline `evidence-reference` blocks link to the sidebar without duplicating content.

- [ ] **Step 1: Update formatting.md sidebar/inline section**

Replace lines 88-97 in `formatting.md`:

```markdown
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
```

- [ ] **Step 2: Also update the Component Frequency Guidelines table**

Change the Evidence Cards row in the table (around line 63) from:
```markdown
| Evidence Cards | Sidebar (~10) + Inline | Same cards in both; inline where they hit hardest |
```
to:
```markdown
| Evidence Cards | Sidebar (~10) + Inline (3-5) | Sidebar: concise catalog. Inline: full verbatim at climax moments |
```

- [ ] **Step 3: Update the `<VISUAL_COMPONENT_TYPES>` block in prompt-builder.js**

In `lib/prompt-builder.js`, update lines 894-933 to reinforce the differentiation:

Find:
```javascript
EVIDENCE-CARD (inline, full display):
- Goes in sections[].content[] array
- type: "evidence-card"
- REQUIRES: tokenId, headline, content (VERBATIM from arcEvidencePackages.evidenceItems[].fullContent), owner, significance
- SHOWS: Full evidence as styled card in article body
- USE FOR: Narrative climax moments, proving claims, CLOSING or OPENING a loop

EVIDENCE-REFERENCE (link only):
- Goes in sections[].content[] array
- type: "evidence-reference"
- REQUIRES: tokenId only (plus optional caption)
- SHOWS: Small diamond icon linking to sidebar
- USE FOR: Brief mentions, sidebar navigation ONLY
```

Replace with:
```javascript
EVIDENCE-CARD (inline, full display — use sparingly, 3-5 per article):
- Goes in sections[].content[] array
- type: "evidence-card"
- REQUIRES: tokenId, headline, content (VERBATIM from arcEvidencePackages.evidenceItems[].fullContent), owner, significance
- SHOWS: Full evidence as styled card in article body
- USE FOR: The 3-5 most powerful evidence moments. Each must CLOSE or OPEN a narrative loop.
- The surrounding prose should set up WHY this evidence matters, then the card delivers the proof.

EVIDENCE-REFERENCE (lightweight link — use freely):
- Goes in sections[].content[] array
- type: "evidence-reference"
- REQUIRES: tokenId only (plus optional caption)
- SHOWS: Small diamond icon linking to sidebar card
- USE FOR: Supporting mentions, corroboration, threading evidence through prose without interrupting flow
```

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md \
       lib/prompt-builder.js
git commit -m "fix(prompts): clarify sidebar vs inline evidence card roles

Sidebar cards: concise catalog (~10 items, brief summaries).
Inline evidence-cards: 3-5 high-impact moments with full verbatim text.
Inline evidence-references: lightweight links to sidebar.
Previously all three were described as 'the same cards,' creating
redundancy where readers saw identical content in body and sidebar."
```

---

## Task 9: Add Fabricated Dialogue Prohibition

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/writing-principles.md:93`
- Modify: `.claude/skills/journalist-report/references/prompts/anti-patterns.md:172-174`

**Context:** Existing rules prohibit "fabricating moments, reactions, or behaviors" but none specifically call out fabricated quoted dialogue. Fabricated quotes are the highest-risk fabrication type because they create false statements attributed to specific characters ("Victoria said X" when Victoria never said X). Claude's natural tendency toward vivid character dialogue makes this a gap.

- [ ] **Step 1: Add dialogue prohibition to writing-principles.md**

In `.claude/skills/journalist-report/references/prompts/writing-principles.md`, after line 93 ("Do not fabricate in-room moments, reactions, or behaviors unless they appear in director notes. The reporter can only report what she actually observed and documented."), add:

```markdown

**Never fabricate quoted dialogue.** All direct quotes must come from evidence content (memory text, paper evidence text) or director notes. If no verbatim quote exists, paraphrase or describe the action instead. Attributed quotes that don't exist in the evidence are the highest-risk fabrication — they put specific false words in a character's mouth.
```

- [ ] **Step 2: Add to anti-patterns.md**

In `.claude/skills/journalist-report/references/prompts/anti-patterns.md`, after "### Fabricating Moments" (line 172) and "Only use documented information." (line 173), add:

```markdown

**Fabricated dialogue is the worst form of fabrication:**

**WRONG:** "I didn't have a choice," Vic whispered, her voice cracking.
**WHY:** Unless this exact quote appears in evidence or director notes, it's invented dialogue attributed to a real character.

**RIGHT:** The memory captures Vic's voice, barely audible: "I didn't have a choice."
**WHY:** This quotes FROM the evidence content, framed as what the memory shows.

**RIGHT (no quote available):** Vic's composure fractured — the director noted her visible distress when the evidence surfaced.
**WHY:** Paraphrases a director observation without inventing dialogue.
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/writing-principles.md \
       .claude/skills/journalist-report/references/prompts/anti-patterns.md
git commit -m "fix(prompts): add explicit fabricated dialogue prohibition

Existing rules prohibited fabricating moments and reactions but not
specifically quoted dialogue. Fabricated quotes are the highest-risk
fabrication type — they attribute specific false words to characters.
Added explicit prohibition with wrong/right examples."
```

---

## Task 10: Hero Image Selection with Group Photo Weighting

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:860-878`

**Context:** `_arcAnalysisCache` is set by `analyzeArcsPlayerFocusGuided` but never includes `heroImageSuggestion`. In `generateOutline`, `arcAnalysis.heroImageSuggestion` is always undefined, so hero image always falls back to the first non-whiteboard photo. This ignores photo content entirely. Large group photos make better hero images because they represent the ensemble cast.

The fix is programmatic (no SDK call needed): score photos by character count from `photoAnalyses` and select the one with the most identified characters.

- [ ] **Step 1: Read the current hero image selection code**

Read `lib/workflow/nodes/ai-nodes.js` lines 860-878 to see the current fallback logic.

- [ ] **Step 2: Replace the fallback with group-photo-weighted selection**

Replace the hero image selection block (lines 869-878) with:

```javascript
  // Select hero image: prefer largest group photo, fallback to first non-whiteboard photo
  // Group photos better represent the ensemble cast as hero images
  const nonWhiteboardPhotos = (state.sessionPhotos || []).filter(
    photo => !whiteboardFilename || getPhotoFilename(photo) !== whiteboardFilename
  );

  let heroImage;
  const analyses = state.photoAnalyses?.analyses || [];
  if (analyses.length > 0 && nonWhiteboardPhotos.length > 0) {
    // Score each photo by number of identified characters (more = better group photo)
    // Uses identifiedCharacters (post-enrichment) with characterDescriptions as fallback
    const scored = nonWhiteboardPhotos.map(photo => {
      const filename = getPhotoFilename(photo);
      const analysis = analyses.find(a => a.filename === filename);
      // identifiedCharacters = enriched name strings, characterDescriptions = pre-enrichment objects
      const characterCount = analysis?.identifiedCharacters?.length
        || analysis?.characterDescriptions?.length
        || 0;
      return { photo, filename, characterCount };
    });
    // Sort by character count descending, take first
    scored.sort((a, b) => b.characterCount - a.characterCount);
    heroImage = scored[0]?.filename || getPhotoFilename(nonWhiteboardPhotos[0]) || 'evidence-board.png';
    console.log(`[generateOutline] Hero image selected: ${heroImage} (${scored[0]?.characterCount || 0} characters identified)`);
  } else {
    heroImage = getPhotoFilename(nonWhiteboardPhotos[0]) || 'evidence-board.png';
    console.log(`[generateOutline] Hero image fallback: ${heroImage} (no photo analyses available)`);
  }
```

Also remove the now-unused `arcSuggestion` variable and `fallbackHeroPhoto` (lines 872-878).

- [ ] **Step 3: Run tests**

Run: `npx jest lib/__tests__/unit/workflow/ai-nodes.test.js -v`
Expected: PASS. The mock doesn't test hero image selection logic specifically.

- [ ] **Step 4: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js
git commit -m "feat(pipeline): select hero image by group photo weighting

Previously hero image was always the first non-whiteboard photo,
ignoring photo content. Now scores photos by number of identified
characters from photoAnalyses and selects the largest group photo.
Group photos better represent the ensemble cast as hero images."
```

---

## Task 11: Remove Evidence Truncation in Arc Evaluator

**Files:**
- Modify: `lib/workflow/nodes/evaluator-nodes.js:598-647`

**Context:** The arc evaluator sends all evidence IDs but only the first 25 evidence items with titles/summaries. With 30+ exposed items, the evaluator can validate that an ID exists but can't verify what items 26+ actually contain — it may flag valid references as suspicious or miss contextual issues.

- [ ] **Step 1: Read the evaluator evidence preparation code**

Read `lib/workflow/nodes/evaluator-nodes.js` lines 594-650 to see the current truncation.

- [ ] **Step 2: Remove the `.slice(0, 25)` truncation**

In `lib/workflow/nodes/evaluator-nodes.js`, change the evaluator prompt assembly. Find the line (around 646):

```javascript
EXPOSED EVIDENCE DETAILS (first 25 of ${exposedEvidence.length}):
${JSON.stringify(exposedEvidence.slice(0, 25), null, 2)}
```

Replace with:

```javascript
EXPOSED EVIDENCE DETAILS (${exposedEvidence.length} items):
${JSON.stringify(exposedEvidence, null, 2)}
```

The evaluator uses Opus (which has a large context window). Sessions typically have 30-60 exposed items with compact summaries (~100 chars each). The full list is roughly 3K-6K tokens — well within budget.

- [ ] **Step 3: Run tests**

Run: `npx jest lib/__tests__/unit/workflow/evaluator-nodes.test.js -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/workflow/nodes/evaluator-nodes.js
git commit -m "fix(pipeline): remove evidence truncation in arc evaluator

Arc evaluator received all evidence IDs but only the first 25 items
with titles/summaries. With 30+ exposed items, the evaluator couldn't
verify what items 26+ contained. Removed .slice(0, 25) — the full list
is ~3-6K tokens, well within Opus's context budget."
```

---

## Task 12: Clean Up Dead `PHASE_REQUIREMENTS.arcAnalysis` Entry

**Files:**
- Modify: `lib/theme-loader.js:19-24`

**Context:** `PHASE_REQUIREMENTS.arcAnalysis` lists `character-voice` and other prompts, but the current production arc generation path (`arc-specialist-nodes.js:generateCoreArcs`) builds its own prompt inline and never calls `loadPhasePrompts('arcAnalysis')`. The only consumer is the dead `analyzeNarrativeArcs` in `ai-nodes.js`. The listing is misleading — developers assume these prompts affect arc generation when they don't.

The arc revision path also uses its own inline prompt (`buildArcRevisionPrompt` in arc-specialist-nodes.js), not PromptBuilder.

Remove `character-voice` from the arc analysis requirements since even if the PromptBuilder path is revived, voice instructions bias analytical tasks toward narrative drama rather than evidentiary accuracy. Keep `evidence-boundaries`, `narrative-structure`, and `anti-patterns` which are analytically relevant.

- [ ] **Step 1: Update PHASE_REQUIREMENTS**

In `lib/theme-loader.js`, change lines 19-24 from:

```javascript
arcAnalysis: [
  'character-voice',
  'evidence-boundaries',
  'narrative-structure',
  'anti-patterns'
],
```

to:

```javascript
arcAnalysis: [
  'evidence-boundaries',
  'narrative-structure',
  'anti-patterns'
],
```

- [ ] **Step 2: Run tests**

Run: `npx jest lib/__tests__/theme-loader.test.js -v`
Expected: Check output. If any test asserts on the number of prompts loaded for arcAnalysis (expecting 4), update to expect 3.

- [ ] **Step 3: Commit**

```bash
git add lib/theme-loader.js
git commit -m "fix(config): remove character-voice from arcAnalysis phase requirements

The current arc generation path (arc-specialist-nodes.js) builds its own
prompt inline and never calls loadPhasePrompts('arcAnalysis'). The
character-voice entry was misleading. Even for the legacy PromptBuilder
path, voice instructions bias analytical tasks toward narrative drama
rather than evidentiary accuracy."
```

---

## Summary

| Task | What It Fixes | Quality Impact |
|------|---------------|----------------|
| 1 | "transactions" wrongly prohibited | Removes contradiction with evidence-boundaries.md |
| 2 | No roster in revision prompt | Prevents name hallucination during revisions |
| 3 | Hardcoded canonical character names | Notion becomes sole source of truth for character data |
| 4 | Contradictory length targets | Single authoritative word count (1000-1500) |
| 5 | "Rule" vs "guidance" visual break contradiction | Reframes around compulsive readability |
| 6 | Raw evidenceBundle competing with arcEvidencePackages | Model uses curated evidence only |
| 7 | Temporal discipline stated twice in article prompt | One detailed version at recency position |
| 8 | Sidebar/inline evidence card redundancy | Clear roles for each evidence display type |
| 9 | No fabricated dialogue prohibition | Explicit constraint on highest-risk fabrication |
| 10 | Hero image always first photo | Group photo selection for ensemble representation |
| 11 | Evaluator can't verify evidence items 26+ | Full evidence context for quality evaluation |
| 12 | Dead character-voice in arcAnalysis requirements | Removes misleading phase requirement |

Tasks 1-2, 4-12 are independent and can run in parallel. Task 3 (canonical characters) touches files shared with Tasks 2 and 10, so should run sequentially with those.
