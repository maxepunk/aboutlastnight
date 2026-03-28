# Prompt Architecture Improvements Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 root causes identified from the 0306 session that produced 25 manual fixes, by correcting prompt examples, updating stale character names, adding non-roster guardrails, fixing template date/ID generation, and injecting director observations into the article prompt.

**Architecture:** Prompt file corrections (RC1), theme-config.js name updates with runtime Notion derivation (RC2), new `<SESSION_FACTS>` injection in PromptBuilder (RC3), template helper + schema fixes for date/ID (RC4), and `<INVESTIGATION_OBSERVATIONS>` injection in article prompt (RC5). Each root cause is an independent task group; ordering minimizes merge conflicts.

**Tech Stack:** Node.js, Jest, LangGraph state, Handlebars templates, Claude Agent SDK (sdkQuery)

**Spec:** `docs/superpowers/specs/2026-03-13-prompt-architecture-improvements-design.md`

---

## Chunk 1: Prompt File Fixes + Template Date/ID (RC1 + RC4)

These are the safest, highest-impact changes — no PromptBuilder signature changes, no state wiring.

### Task 1: Fix wrong money direction in evidence-boundaries.md (RC1)

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/evidence-boundaries.md:40-46` (mechanics section)
- Modify: `.claude/skills/journalist-report/references/prompts/evidence-boundaries.md:253-264` (Quick Reference table)

- [ ] **Step 1: Read current evidence-boundaries.md and locate the three problem areas**

Identify:
1. Lines 40-46: mechanics subsection with "SELL" language
2. Line 259: Quick Reference row "Victoria paid $450K to bury two memories"
3. No WRONG/RIGHT money-direction example exists yet

- [ ] **Step 2: Rewrite the mechanics subsection (lines 40-46)**

Replace the current "Understanding the Game Mechanics" section with:

```markdown
**Understanding the Game Mechanics:**
1. Players FIND/UNLOCK memory tokens during the game
2. A token belongs to whoever's memory it contains (the OWNER)
3. Players can BURY any token they find by giving it to Blake/Valet
4. In exchange, Blake's employers PAY the player - money goes INTO a shell account
5. The player CHOOSES the shell account name (some use their real name, others use pseudonyms)
6. **Black Market display shows:** Account Name + Total Amount (PUBLIC)
7. **Black Market display does NOT show:** Which tokens/owners were buried (PRIVATE)
```

Key change: "SELL" → "BURY" and "receiving money as incentive" → explicit "money goes INTO a shell account"

- [ ] **Step 3: Fix the Quick Reference table row (line 259)**

Change:
```
| "Victoria paid $450K to bury two memories" | 2 | YES - observable transaction |
```
To:
```
| "$675,000 went to Vic's account for burying two memories" | 2 | YES - observable transaction |
```

Two fixes: money direction ("paid" → "went to account") and name update (Victoria → Vic, $450K → $675K for realism).

- [ ] **Step 4: Add money-direction WRONG/RIGHT example to the "Correct Examples" area under Layer 2**

After the existing "Correct Examples" subsection under Layer 2 (around line 77-84), add a new anti-pattern block:

```markdown
### WRONG - Money Direction Reversed

> Vic paid $675,000 to bury two memories.

WHY THIS IS WRONG: Burying evidence PAYS the player. Vic RECEIVED $675,000
from Blake's employers for burying two memories. Money flows TO the person
burying, not FROM them.

### CORRECT - Money Direction

> $675,000 went to an account bearing Vic's name. Two memories buried.
> Someone decided those memories were worth more hidden than exposed.
```

- [ ] **Step 5: Run existing prompt-builder tests to verify no breakage**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose`
Expected: All existing tests PASS (prompt loading still works, no structural change)

- [ ] **Step 6: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/evidence-boundaries.md
git commit -m "fix: correct money direction in evidence-boundaries prompt

Rewrite mechanics subsection: SELL→BURY, explicit money-INTO-account.
Add WRONG/RIGHT money-direction example. Fix Quick Reference table.
Root cause: 0306 article replicated wrong payment direction from examples."
```

---

### Task 2: Add storyDate to theme-config.js (RC4)

**Files:**
- Modify: `lib/theme-config.js:107-117` (journalist display section)
- Test: `lib/__tests__/theme-config.test.js`

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/theme-config.test.js` inside the `display config` describe block:

```javascript
it('journalist has storyDate for in-world article date', () => {
  const config = getThemeConfig('journalist');
  expect(config.display.storyDate).toBe('2027-02-22');
});

it('detective does not have storyDate (no in-world date constraint)', () => {
  const config = getThemeConfig('detective');
  expect(config.display.storyDate).toBeUndefined();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/theme-config.test.js --verbose -t "storyDate"`
Expected: FAIL — `config.display.storyDate` is `undefined`

- [ ] **Step 3: Add storyDate to journalist display config**

In `lib/theme-config.js`, inside the journalist `display` object (after line 111), add:

```javascript
storyDate: '2027-02-22',           // In-world article date (always Feb 22, 2027)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/theme-config.test.js --verbose -t "storyDate"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js
git commit -m "feat: add storyDate to journalist display config

In-world date is always 2027-02-22 per section-rules.md.
Template assembly will use this instead of generatedAt timestamp."
```

---

### Task 3: Fix articleId() to use sessionId instead of generatedAt (RC4)

**Files:**
- Modify: `lib/template-helpers.js:201-222` (articleId function)
- Test: `lib/__tests__/theme-config.test.js` (articleId tests live here — or create `lib/__tests__/template-helpers.test.js`)

- [ ] **Step 1: Check if template-helpers tests exist**

Run: `npx jest --listTests 2>&1 | grep template-helpers`
If no file exists, create `lib/__tests__/template-helpers.test.js`.

- [ ] **Step 2: Write the failing test**

```javascript
const { articleId } = require('../template-helpers');

describe('articleId', () => {
  it('should derive ID from sessionId instead of generatedAt', () => {
    const metadata = {
      sessionId: '0306',
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'journalist'
    };
    // Expected: NNA-0306-26 (sessionId + year from generatedAt)
    expect(articleId(metadata)).toBe('NNA-0306-26');
  });

  it('should use DCR prefix for detective theme', () => {
    const metadata = {
      sessionId: '0306',
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'detective'
    };
    expect(articleId(metadata)).toBe('DCR-0306-26');
  });

  it('should fallback gracefully when sessionId is missing', () => {
    const metadata = {
      generatedAt: '2026-03-13T10:30:00Z',
      theme: 'journalist'
    };
    expect(articleId(metadata)).toBe('NNA-0000-00');
  });

  it('should handle missing generatedAt for year suffix', () => {
    const metadata = {
      sessionId: '0306',
      theme: 'journalist'
    };
    expect(articleId(metadata)).toBe('NNA-0306-00');
  });

  it('should handle null metadata', () => {
    expect(articleId(null)).toBe('NNA-0000-00');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/template-helpers.test.js --verbose`
Expected: FAIL — current implementation generates `NNA-0313-10` (from generatedAt) not `NNA-0306-26` (from sessionId)

- [ ] **Step 4: Replace articleId() implementation**

In `lib/template-helpers.js`, find the `articleId` function by searching for `function articleId(metadata)`. Replace the entire function including its JSDoc comment (starts around line 193) through the closing brace. Note: the lazy `require('./theme-config')` inside the function body is intentional — it avoids a circular dependency since template-helpers is loaded early. Do not hoist the require.

```javascript
/**
 * Generate article ID from session metadata
 * Format: {PREFIX}-{sessionId}-{YY}
 * Prefix from theme-config.js display.articleIdPrefix (NNA for journalist, DCR for detective)
 * Year suffix from real-world generation date (2026 → "26"), NOT story date (2027)
 *
 * @param {Object} metadata - ContentBundle metadata
 * @returns {string} Article ID (e.g., NNA-0306-26)
 */
function articleId(metadata) {
  const { getThemeConfig } = require('./theme-config');
  const theme = (metadata && metadata.theme) || 'journalist';
  const config = getThemeConfig(theme);
  const prefix = (config && config.display && config.display.articleIdPrefix) || 'NNA';

  if (!metadata || !metadata.sessionId) {
    return `${prefix}-0000-00`;
  }

  const yearSuffix = metadata.generatedAt
    ? String(new Date(metadata.generatedAt).getFullYear()).slice(-2)
    : '00';

  return `${prefix}-${metadata.sessionId}-${yearSuffix}`;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/template-helpers.test.js --verbose`
Expected: PASS

- [ ] **Step 6: Run full test suite to check for regressions**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass. Any tests that asserted old articleId format (MMDD-HH from generatedAt) need updating.

- [ ] **Step 7: Commit**

```bash
git add lib/template-helpers.js lib/__tests__/template-helpers.test.js
git commit -m "fix: articleId derives from sessionId not generatedAt

NNA-0306-26 format: prefix + session date + real-world year.
Previously used generation timestamp which was meaningless."
```

---

### Task 4: Update header.hbs to use storyDate (RC4)

**Files:**
- Modify: `templates/journalist/partials/header.hbs:40-42`

- [ ] **Step 1: Update the date display in header.hbs**

Replace lines 40-42:

```handlebars
    <time class="nn-article__date" datetime="{{formatDatetime metadata.generatedAt}}">
      {{formatDate metadata.generatedAt}}
    </time>
```

With:

```handlebars
    <time class="nn-article__date" datetime="{{formatDatetime (or metadata.storyDate metadata.generatedAt)}}">
      {{formatDate (or metadata.storyDate metadata.generatedAt)}}
    </time>
```

Note: Handlebars doesn't have a built-in `or` helper. Check if one is registered. If not, use a simpler approach — the `storyDate` field will always be present when generated correctly, so we can use it directly with generatedAt as a reasonable visual fallback:

```handlebars
    {{#if metadata.storyDate}}
    <time class="nn-article__date" datetime="{{formatDatetime metadata.storyDate}}">
      {{formatDate metadata.storyDate}}
    </time>
    {{else}}
    <time class="nn-article__date" datetime="{{formatDatetime metadata.generatedAt}}">
      {{formatDate metadata.generatedAt}}
    </time>
    {{/if}}
```

- [ ] **Step 2: Determine which Handlebars approach to use**

Check if an `or` helper is registered:
Run: `grep -n "registerHelper.*'or'" lib/template-helpers.js`

If found, use the inline `(or ...)` approach. If not found (likely), use the `{{#if}}` / `{{else}}` block approach shown above.

- [ ] **Step 3: Verify template renders correctly**

Run the template compilation test (if one exists):
Run: `npx jest --verbose -t "header\|template" 2>&1 | head -30`

If no template tests exist, verify manually: check that the Handlebars syntax is valid by starting the server (`npm start`) and loading an existing report. The date should display as "February 22, 2027" for any session with a `storyDate` in its content bundle, or the generation date for older bundles.

- [ ] **Step 4: Commit**

```bash
git add templates/journalist/partials/header.hbs
git commit -m "fix: header.hbs uses storyDate for article display date

In-world date is always 2027-02-22. Falls back to generatedAt
for backwards compatibility with existing content bundles."
```

---

### Task 5: Add storyDate to content-bundle schema and populate in ai-nodes.js (RC4)

**Files:**
- Modify: `lib/schemas/content-bundle.schema.json:9-33` (metadata properties)
- Modify: `lib/workflow/nodes/ai-nodes.js` (generateContentBundle — metadata population)

- [ ] **Step 1: Add storyDate to content-bundle.schema.json**

In the `metadata.properties` object (after the `version` property, around line 31), add:

```json
"storyDate": {
  "type": "string",
  "description": "In-world article date (e.g., 2027-02-22 for journalist theme)"
}
```

Note: Do NOT add to `required` array — it's optional for backwards compatibility with detective theme and existing bundles.

- [ ] **Step 2: Find where metadata is populated in ai-nodes.js**

Search for where `contentBundle.metadata` is enriched after the SDK response is parsed. Look for the pattern where `sessionId`, `theme`, and `generatedAt` are assigned:

Run: `grep -n "contentBundle.metadata\|metadata.sessionId\|metadata.generatedAt\|metadata.theme" lib/workflow/nodes/ai-nodes.js | head -10`

The enrichment block will look like `contentBundle.metadata.sessionId = state.sessionId;` or similar. Insert the storyDate population adjacent to this block.

Note: `getThemeConfig` is already imported at the top of `ai-nodes.js` (via `require('../../theme-config')`). Verify with: `grep -n "theme-config" lib/workflow/nodes/ai-nodes.js | head -5`. Do not add a duplicate import.

- [ ] **Step 3: Add storyDate population**

In `generateContentBundle` in `ai-nodes.js`, after the content bundle is parsed from the SDK response, find where metadata is populated/enriched and add:

```javascript
// Populate storyDate from theme config (RC4: in-world date)
const { getThemeConfig } = require('../../theme-config');
const themeConfig = getThemeConfig(state.theme || 'journalist');
if (themeConfig?.display?.storyDate) {
  contentBundle.metadata = contentBundle.metadata || {};
  contentBundle.metadata.storyDate = themeConfig.display.storyDate;
}
```

Note: `getThemeConfig` is likely already imported at top of file. Check before adding duplicate import.

- [ ] **Step 4: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass. Schema change is additive (optional field), so no existing tests break.

- [ ] **Step 5: Commit**

```bash
git add lib/schemas/content-bundle.schema.json lib/workflow/nodes/ai-nodes.js
git commit -m "feat: populate storyDate in content bundle metadata

Theme config provides in-world date (2027-02-22 for journalist).
Added to schema as optional field, populated post-generation in ai-nodes."
```

---

## Chunk 2: Canonical Character Names (RC2)

### Task 6: Update hardcoded canonical names in theme-config.js

**Files:**
- Modify: `lib/theme-config.js:79-105` (journalist canonicalCharacters)
- Modify: `lib/theme-config.js:166-192` (detective canonicalCharacters)
- Modify: `lib/__tests__/theme-config.test.js`

- [ ] **Step 1: Write failing tests for updated names**

Add to `lib/__tests__/theme-config.test.js`:

```javascript
describe('canonical character names (current Notion names)', () => {
  it('journalist canonicalCharacters has current first names', () => {
    const config = getThemeConfig('journalist');
    const chars = config.canonicalCharacters;
    // Updated names (Notion source of truth)
    expect(chars['Remi']).toBe('Remi Whitman');
    expect(chars['Vic']).toBe('Vic Kingsley');
    expect(chars['Sam']).toBe('Sam Thorne');
    expect(chars['Mel']).toBe('Mel Nilsson');
    expect(chars['Jess']).toBe('Jess Kane');
    expect(chars['Zia']).toBe('Zia Bishara');
    expect(chars['Riley']).toBe('Riley Torres');
    expect(chars['Ezra']).toBe('Ezra Sullivan');
    expect(chars['Nat']).toBe('Nat Francisco');
    expect(chars['Quinn']).toBe('Quinn Sterling');
    // Unchanged names
    expect(chars['Sarah']).toBe('Sarah Blackwood');
    expect(chars['Alex']).toBe('Alex Reeves');
    expect(chars['Ashe']).toBe('Ashe Motoko');
    expect(chars['Morgan']).toBe('Morgan Reed');
    expect(chars['Flip']).toBe('Flip');
    expect(chars['Taylor']).toBe('Taylor Chase');
    expect(chars['Kai']).toBe('Kai Andersen');
    expect(chars['Jamie']).toBe("Jamie \"Volt\" Woods");
    expect(chars['Skyler']).toBe('Skyler Iyer');
    expect(chars['Tori']).toBe('Tori Zhang');
  });

  it('journalist should NOT have stale names', () => {
    const config = getThemeConfig('journalist');
    const chars = config.canonicalCharacters;
    expect(chars['James']).toBeUndefined();
    expect(chars['Victoria']).toBeUndefined();
    expect(chars['Derek']).toBeUndefined();
    expect(chars['Diana']).toBeUndefined();
    expect(chars['Jessicah']).toBeUndefined();
    expect(chars['Leila']).toBeUndefined();
    expect(chars['Rachel']).toBeUndefined();
    expect(chars['Howie']).toBeUndefined();
    expect(chars['Sofia']).toBeUndefined();
    expect(chars['Oliver']).toBeUndefined();
  });

  it('detective canonicalCharacters matches journalist PCs', () => {
    const journalist = getThemeConfig('journalist');
    const detective = getThemeConfig('detective');
    const journalistPCs = Object.keys(journalist.canonicalCharacters)
      .filter(name => !['Marcus', 'Nova', 'Blake'].includes(name));
    const detectivePCs = Object.keys(detective.canonicalCharacters)
      .filter(name => !['Marcus', 'Blake'].includes(name));
    expect(detectivePCs.sort()).toEqual(journalistPCs.sort());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/theme-config.test.js --verbose -t "current Notion names"`
Expected: FAIL — old names like 'James', 'Victoria' still present

- [ ] **Step 3: Update journalist canonicalCharacters**

In `lib/theme-config.js`, replace the journalist `canonicalCharacters` block (lines 79-105) with:

```javascript
canonicalCharacters: {
  // 20 Playable Characters (PCs) — names from Notion (source of truth)
  'Sarah': 'Sarah Blackwood',
  'Alex': 'Alex Reeves',
  'Remi': 'Remi Whitman',
  'Vic': 'Vic Kingsley',
  'Sam': 'Sam Thorne',
  'Ashe': 'Ashe Motoko',
  'Mel': 'Mel Nilsson',
  'Jess': 'Jess Kane',
  'Morgan': 'Morgan Reed',
  'Flip': 'Flip',  // No known last name
  'Taylor': 'Taylor Chase',
  'Zia': 'Zia Bishara',
  'Riley': 'Riley Torres',
  'Ezra': 'Ezra Sullivan',
  'Kai': 'Kai Andersen',
  'Jamie': 'Jamie "Volt" Woods',
  'Nat': 'Nat Francisco',
  'Quinn': 'Quinn Sterling',
  'Skyler': 'Skyler Iyer',
  'Tori': 'Tori Zhang',
  // 3 NPCs
  'Marcus': 'Marcus Blackwood',
  'Nova': 'Nova',
  'Blake': 'Blake'
},
```

- [ ] **Step 4: Update detective canonicalCharacters**

In `lib/theme-config.js`, replace the detective `canonicalCharacters` block (lines 166-192) with the same PC names (minus Nova):

```javascript
canonicalCharacters: {
  // 20 Playable Characters (PCs) — names from Notion (source of truth)
  'Sarah': 'Sarah Blackwood',
  'Alex': 'Alex Reeves',
  'Remi': 'Remi Whitman',
  'Vic': 'Vic Kingsley',
  'Sam': 'Sam Thorne',
  'Ashe': 'Ashe Motoko',
  'Mel': 'Mel Nilsson',
  'Jess': 'Jess Kane',
  'Morgan': 'Morgan Reed',
  'Flip': 'Flip',
  'Taylor': 'Taylor Chase',
  'Zia': 'Zia Bishara',
  'Riley': 'Riley Torres',
  'Ezra': 'Ezra Sullivan',
  'Kai': 'Kai Andersen',
  'Jamie': 'Jamie "Volt" Woods',
  'Nat': 'Nat Francisco',
  'Quinn': 'Quinn Sterling',
  'Skyler': 'Skyler Iyer',
  'Tori': 'Tori Zhang',
  // NPCs
  'Marcus': 'Marcus Blackwood',
  'Blake': 'Blake'
  // NOTE: No 'Nova' — detective theme narrator is Anondono, not an NPC
},
```

- [ ] **Step 5: Fix any tests that reference old names**

Search for old name references in test files:

Run: `grep -rn "Victoria\|James Whitman\|Derek Thorne\|Diana Nilsson\|Jessicah\|Leila\|Rachel Torres\|Howie\|Sofia Francisco\|Oliver Sterling" lib/__tests__/`

Update any assertions that use old names. Key files to check:
- `lib/__tests__/theme-config.test.js` — the `detective canonicalCharacters matches journalist PCs` test (line 206-214) uses old names for the filter
- `lib/__tests__/prompt-builder.test.js` — mock session data uses old names in roster (line 58: `'Victoria', 'Morgan', 'Derek'`)

For prompt-builder tests, update mock data to use current names:
```javascript
roster: ['Alex', 'Remi', 'Vic', 'Morgan', 'Sam'],
accusation: 'Vic and Morgan',
```

- [ ] **Step 6: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js lib/__tests__/prompt-builder.test.js
git commit -m "fix: update canonical character names to match Notion

10 names updated: James→Remi, Victoria→Vic, Derek→Sam, Diana→Mel,
Jessicah→Jess, Leila→Zia, Rachel→Riley, Howie→Ezra, Sofia→Nat,
Oliver→Quinn. Both journalist and detective configs updated."
```

---

### Task 7: Add generateRosterSection() override from state.canonicalCharacters (RC2)

**Files:**
- Modify: `lib/prompt-builder.js:18-29` (generateRosterSection function)
- Test: `lib/__tests__/prompt-builder.test.js`

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/prompt-builder.test.js`:

```javascript
describe('generateRosterSection with override', () => {
  it('should merge Notion-derived override with theme-config fallback', () => {
    const { generateRosterSection } = require('../prompt-builder');
    // Simulate Notion returning only session players (subset of all 20)
    const override = {
      'Alex': 'Alex Reeves',
      'Vic': 'Vic Kingsley'
    };
    const result = generateRosterSection('journalist', override);
    // Override names present
    expect(result).toContain('Alex → Alex Reeves');
    expect(result).toContain('Vic → Vic Kingsley');
    // theme-config fallback names ALSO present (merge, not replace)
    // Per spec: "Notion-derived map supplements (not replaces) theme-config.js"
    expect(result).toContain('Sarah → Sarah Blackwood');
    expect(result).toContain('Marcus → Marcus Blackwood');
  });

  it('should prefer Notion-derived name over theme-config when both exist', () => {
    const { generateRosterSection } = require('../prompt-builder');
    // If Notion had a different full name (hypothetical), override wins
    const override = { 'Sarah': 'Sarah Rebranded' };
    const result = generateRosterSection('journalist', override);
    expect(result).toContain('Sarah → Sarah Rebranded');
    expect(result).not.toContain('Sarah Blackwood');
  });

  it('should fall back to theme-config when no override provided', () => {
    const { generateRosterSection } = require('../prompt-builder');
    const result = generateRosterSection('journalist');
    expect(result).toContain('Sarah → Sarah Blackwood');
    expect(result).toContain('Remi → Remi Whitman');
  });
});
```

Note: `generateRosterSection` is not currently exported. Step 3 must also add it to `module.exports`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "generateRosterSection with override"`
Expected: FAIL — `generateRosterSection` doesn't accept a second parameter

- [ ] **Step 3: Update generateRosterSection signature**

In `lib/prompt-builder.js`, update the function (lines 18-29):

```javascript
/**
 * Generate canonical character roster section
 * Merges Notion-derived override with theme-config.js fallback.
 * Override names take precedence; theme-config fills in characters
 * without tokens in this session (e.g., characters with no memories).
 *
 * Per spec: "Notion-derived map supplements (not replaces) theme-config.js"
 *
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @param {Object|null} canonicalCharacters - Optional override map from Notion data
 * @returns {string} Formatted roster section for prompts
 */
function generateRosterSection(theme = 'journalist', canonicalCharacters = null) {
  const themeCharacters = getThemeConfig(theme)?.canonicalCharacters || {};
  // Merge: theme-config as base, Notion override wins on conflict
  const characters = canonicalCharacters
    ? { ...themeCharacters, ...canonicalCharacters }
    : themeCharacters;

  const lines = Object.entries(characters)
    .map(([first, full]) => `- ${first} → ${full}`)
    .join('\n');

  return `CANONICAL CHARACTER ROSTER:
Use ONLY these full names in ALL article text. NEVER invent different last names:
${lines}`;
}
```

- [ ] **Step 4: Add generateRosterSection to module.exports**

In `lib/prompt-builder.js`, find the `module.exports` block (search for `module.exports`) and add `generateRosterSection`:

```javascript
module.exports = {
  PromptBuilder,
  createPromptBuilder,
  generateRosterSection,  // NEW: exported for testing
  // ... existing exports
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "generateRosterSection with override"`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: generateRosterSection merges Notion override with theme-config

Notion-derived names supplement (not replace) theme-config.js.
Override names win on conflict; theme-config fills in characters
without tokens in the session. Exported for testing."
```

---

### Task 8: Extract canonical names from Notion token data (RC2)

**Files:**
- Create: `lib/workflow/nodes/node-helpers.js` (add helper function — file already exists)
- Modify: `lib/workflow/nodes/fetch-nodes.js` (call extraction after fetch)
- Modify: `lib/workflow/state.js` (add `canonicalCharacters` state field if needed)

- [ ] **Step 1: Verify node-helpers.js exists and check exports**

Run: `grep -n "module.exports" lib/workflow/nodes/node-helpers.js | head -5`

- [ ] **Step 2: Write the failing test**

Create or add to `lib/__tests__/node-helpers.test.js`:

```javascript
describe('extractCanonicalCharacters', () => {
  const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

  it('should extract unique owner names from token data', () => {
    const tokens = [
      { owners: ['Vic'] },
      { owners: ['Alex', 'Vic'] },
      { owners: ['Sarah'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    // Should include all unique first names mapped to full names
    expect(result['Vic']).toBe('Vic Kingsley');
    expect(result['Alex']).toBe('Alex Reeves');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });

  it('should use theme-config as fallback for full name resolution', () => {
    const tokens = [{ owners: ['Kai'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Kai']).toBe('Kai Andersen');
  });

  it('should handle empty token array', () => {
    const result = extractCanonicalCharacters([], 'journalist');
    expect(result).toEqual({});
  });

  it('should handle tokens with no owners', () => {
    const tokens = [{ owners: [] }, { owners: null }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result).toEqual({});
  });

  it('should log warning for unknown first names not in theme-config', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['UnknownPerson'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    // Unknown names pass through as first-name-only
    expect(result['UnknownPerson']).toBe('UnknownPerson');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('UnknownPerson')
    );
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/node-helpers.test.js --verbose -t "extractCanonicalCharacters"`
Expected: FAIL — function not exported

- [ ] **Step 4: Implement extractCanonicalCharacters in node-helpers.js**

Add to `lib/workflow/nodes/node-helpers.js`:

```javascript
const { getCanonicalName } = require('../../theme-config');

/**
 * Extract canonical character map from Notion token owner data
 *
 * Builds a first-name → full-name map from token owners,
 * resolving full names via theme-config.js.
 *
 * This makes the pipeline self-updating when names change in Notion:
 * - Notion data provides the authoritative set of first names
 * - theme-config provides full name resolution (fallback)
 *
 * @param {Array} tokens - Fetched tokens with `owners` arrays
 * @param {string} theme - Theme name for full-name resolution
 * @returns {Object} Map of firstName → fullName
 */
function extractCanonicalCharacters(tokens, theme = 'journalist') {
  const characters = {};

  for (const token of tokens) {
    for (const owner of (token.owners || [])) {
      if (!owner || characters[owner]) continue;
      const fullName = getCanonicalName(owner, theme);
      if (fullName === owner && !['Flip', 'Nova', 'Blake', 'Marcus'].includes(owner)) {
        console.warn(`[extractCanonicalCharacters] Unknown character "${owner}" not in theme-config`);
      }
      characters[owner] = fullName;
    }
  }

  return characters;
}
```

Add `extractCanonicalCharacters` to the module.exports.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/node-helpers.test.js --verbose -t "extractCanonicalCharacters"`
Expected: PASS

- [ ] **Step 6: Wire extraction into fetchMemoryTokens**

In `lib/workflow/nodes/fetch-nodes.js`, find the tagged tokens log line by searching for `Tagged ${taggedTokens.length} tokens`. After this log line, add the extraction:

```javascript
// Extract canonical character map from Notion token data (RC2)
const { extractCanonicalCharacters } = require('./node-helpers');
const canonicalCharacters = extractCanonicalCharacters(taggedTokens, state.theme || 'journalist');
console.log(`[fetchMemoryTokens] Derived ${Object.keys(canonicalCharacters).length} canonical characters from Notion data`);
```

Then find the existing `return` statement (search for `return {` after the tagged tokens block) and add `canonicalCharacters` to it. Do NOT replace the entire return — add the field alongside existing fields:

```javascript
return {
  memoryTokens: taggedTokens,
  canonicalCharacters,  // NEW: Notion-derived character map for PromptBuilder
  currentPhase: PHASES.FETCH_EVIDENCE
};
```

- [ ] **Step 7: Add canonicalCharacters to state annotations if needed**

Check `lib/workflow/state.js` for existing `canonicalCharacters` field. If not present, add it with a `replace` reducer (latest value wins):

```javascript
canonicalCharacters: Annotation({ reducer: (_, b) => b, default: () => null }),
```

- [ ] **Step 8: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add lib/workflow/nodes/node-helpers.js lib/workflow/nodes/fetch-nodes.js lib/workflow/state.js lib/__tests__/node-helpers.test.js
git commit -m "feat: derive canonical character map from Notion token data

extractCanonicalCharacters() builds firstName→fullName map from
token owners, resolving via theme-config. Stored in state for
downstream PromptBuilder use. Warns on unknown names."
```

---

## Chunk 3: Non-Roster Guardrail + Director Observations (RC3 + RC5)

### Task 9: Add non-roster character agency anti-pattern (RC3)

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/anti-patterns.md`

- [ ] **Step 1: Read current anti-patterns.md to find insertion point**

The new anti-pattern should go near the top (high severity), ideally after any existing "character" related patterns.

- [ ] **Step 2: Add the non-roster character agency anti-pattern**

Add the following section (placement: after existing character-related anti-patterns, before less critical ones):

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

- [ ] **Step 3: Run prompt-builder tests to verify no loading breakage**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/anti-patterns.md
git commit -m "feat: add non-roster character agency anti-pattern

CRITICAL anti-pattern with WRONG/RIGHT examples. References
SESSION_FACTS roster. Prevents giving absent characters
investigation-day actions based on memory content appearances."
```

---

### Task 10: Add SESSION_FACTS injection to buildArticlePrompt (RC3)

**Files:**
- Modify: `lib/prompt-builder.js:603+` (buildArticlePrompt — add `sessionFacts` parameter)
- Modify: `lib/workflow/nodes/ai-nodes.js:1154+` (pass roster and accusation data)
- Test: `lib/__tests__/prompt-builder.test.js`

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/prompt-builder.test.js`:

```javascript
describe('SESSION_FACTS injection in article prompt', () => {
  beforeEach(() => {
    mockThemeLoader.loadPhasePrompts.mockResolvedValue({
      'character-voice': 'voice content',
      'evidence-boundaries': 'boundaries content',
      'narrative-structure': 'structure content',
      'anti-patterns': 'anti-patterns content',
      'section-rules': 'section rules',
      'arc-flow': 'arc flow',
      'formatting': 'formatting',
      'editorial-design': 'editorial design',
      'writing-principles': 'writing principles',
      'photo-analysis': 'photo analysis'
    });
    mockThemeLoader.loadTemplate.mockResolvedValue('<template>');
  });

  it('should include SESSION_FACTS when sessionFacts provided', async () => {
    const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
    const { userPrompt } = await b.buildArticlePrompt(
      {}, // outline
      {}, // evidenceBundle
      '<template>',
      [], // arcEvidencePackages
      null, // heroImage
      [], // shellAccounts
      { // sessionFacts
        roster: ['Alex Reeves', 'Vic Kingsley', 'Sam Thorne'],
        accusation: 'Vic and Sam',
        playerCount: 3
      }
    );
    expect(userPrompt).toContain('<SESSION_FACTS>');
    expect(userPrompt).toContain('INVESTIGATION ROSTER (3 players)');
    expect(userPrompt).toContain('Alex Reeves');
    expect(userPrompt).toContain('Vic Kingsley');
    expect(userPrompt).toContain('CHARACTER AGENCY RULE');
    expect(userPrompt).toContain('Use exactly 3');
  });

  it('should omit SESSION_FACTS when sessionFacts is null', async () => {
    const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
    const { userPrompt } = await b.buildArticlePrompt(
      {}, {}, '<template>', [], null, [], null
    );
    expect(userPrompt).not.toContain('<SESSION_FACTS>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "SESSION_FACTS"`
Expected: FAIL — `buildArticlePrompt` doesn't accept `sessionFacts` parameter

- [ ] **Step 3: Add sessionFacts parameter to buildArticlePrompt**

In `lib/prompt-builder.js`, update the `buildArticlePrompt` signature:

```javascript
async buildArticlePrompt(outline, evidenceBundle, template, arcEvidencePackages = [], heroImage = null, shellAccounts = [], sessionFacts = null) {
```

Then, inside the journalist branch of the method (around line 742, before `<ANTI_PATTERNS>`), add the SESSION_FACTS section:

```javascript
// SESSION_FACTS injection (RC3: non-roster character guardrail)
const sessionFactsSection = sessionFacts ? `
<SESSION_FACTS>
INVESTIGATION ROSTER (${sessionFacts.playerCount} players):
${sessionFacts.roster.join('\n')}

ACCUSATION: ${sessionFacts.accusation}

CRITICAL - CHARACTER AGENCY RULE:
ONLY the ${sessionFacts.playerCount} characters listed above were present at the investigation.
Characters who appear in memory content but are NOT listed above were subjects
of memories from the party - they were NOT at the investigation.
NEVER give non-roster characters actions, decisions, or dialogue during
investigation events.

Use exactly ${sessionFacts.playerCount} when referencing how many people were present.
</SESSION_FACTS>` : '';
```

Insert `${sessionFactsSection}` in the user prompt right before `<ANTI_PATTERNS>`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "SESSION_FACTS"`
Expected: PASS

- [ ] **Step 5: Wire sessionFacts in ai-nodes.js**

In `lib/workflow/nodes/ai-nodes.js`, find the `buildArticlePrompt` call in `generateContentBundle` (search for `promptBuilder.buildArticlePrompt`). Update the call to pass session facts.

**Also check**: If `ai-nodes.js` has an inline mock of `buildArticlePrompt` (search for `createMockPromptBuilder`), update it to accept the new parameter signature so tests don't mask failures.

```javascript
// Build session facts for non-roster character guardrail (RC3)
const roster = state.sessionConfig?.roster || [];
const canonicalChars = state.canonicalCharacters || {};
const sessionFacts = roster.length > 0 ? {
  roster: roster.map(p => {
    const name = p.name || p;
    return canonicalChars[name] || name;
  }),
  accusation: state.sessionConfig?.accusation?.accused?.join(' and ') || 'Unknown',
  playerCount: roster.length
} : null;

const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
  state.outline || {},
  state.evidenceBundle || {},
  template,
  arcEvidencePackages,
  state.heroImage,
  shellAccounts,
  sessionFacts  // NEW: non-roster character guardrail
);
```

- [ ] **Step 6: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/prompt-builder.js lib/workflow/nodes/ai-nodes.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: inject SESSION_FACTS into article prompt for non-roster guardrail

Adds character agency rule: only roster members can have investigation-day
actions. Non-roster characters can only appear as memory subjects.
Includes exact player count to prevent hallucinated counts."
```

---

### Task 11: Inject director observations into article prompt (RC5)

**Files:**
- Modify: `lib/prompt-builder.js:603+` (buildArticlePrompt — add `directorNotes` parameter)
- Modify: `lib/workflow/nodes/ai-nodes.js:1154+` (pass state.directorNotes)
- Test: `lib/__tests__/prompt-builder.test.js`

- [ ] **Step 1: Write the failing test**

Add to `lib/__tests__/prompt-builder.test.js`:

```javascript
describe('INVESTIGATION_OBSERVATIONS injection in article prompt', () => {
  beforeEach(() => {
    mockThemeLoader.loadPhasePrompts.mockResolvedValue({
      'character-voice': 'voice', 'evidence-boundaries': 'boundaries',
      'narrative-structure': 'structure', 'anti-patterns': 'anti-patterns',
      'section-rules': 'rules', 'arc-flow': 'arc-flow', 'formatting': 'formatting',
      'editorial-design': 'editorial', 'writing-principles': 'writing', 'photo-analysis': 'photo'
    });
    mockThemeLoader.loadTemplate.mockResolvedValue('<template>');
  });

  it('should include INVESTIGATION_OBSERVATIONS when directorNotes has observations', async () => {
    const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
    const directorNotes = {
      observations: {
        behaviorPatterns: ['Blake solicited Vic three times'],
        notableMoments: ['Heated argument at the bar']
      },
      whiteboard: { suspects: ['Vic'] }  // Should NOT be included
    };
    const { userPrompt } = await b.buildArticlePrompt(
      {}, {}, '<template>', [], null, [], null, directorNotes
    );
    expect(userPrompt).toContain('<INVESTIGATION_OBSERVATIONS>');
    expect(userPrompt).toContain('Blake solicited Vic three times');
    expect(userPrompt).toContain('What you observed during the investigation');
    // Whiteboard should NOT be in this section
    expect(userPrompt).not.toContain('suspects');
  });

  it('should omit INVESTIGATION_OBSERVATIONS when directorNotes is null', async () => {
    const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
    const { userPrompt } = await b.buildArticlePrompt(
      {}, {}, '<template>', [], null, [], null, null
    );
    expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
  });

  it('should omit INVESTIGATION_OBSERVATIONS when observations is empty', async () => {
    const b = new PromptBuilder(mockThemeLoader, 'journalist', {});
    const { userPrompt } = await b.buildArticlePrompt(
      {}, {}, '<template>', [], null, [], null, { observations: {} }
    );
    expect(userPrompt).not.toContain('<INVESTIGATION_OBSERVATIONS>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "INVESTIGATION_OBSERVATIONS"`
Expected: FAIL — `buildArticlePrompt` doesn't accept 8th parameter

- [ ] **Step 3: Add directorNotes parameter to buildArticlePrompt**

Update the signature to accept `directorNotes` as the 8th parameter:

```javascript
async buildArticlePrompt(outline, evidenceBundle, template, arcEvidencePackages = [], heroImage = null, shellAccounts = [], sessionFacts = null, directorNotes = null) {
```

Inside the journalist branch, build the observations section and insert it in `<DATA_CONTEXT>` after the evidence bundle and financial summary:

```javascript
// INVESTIGATION_OBSERVATIONS injection (RC5: director observations in article)
const observationsSection = (directorNotes?.observations && Object.keys(directorNotes.observations).length > 0) ? `
<INVESTIGATION_OBSERVATIONS>
What you observed during the investigation this morning.
These ground your behavioral claims - who you saw talking to whom,
notable moments, patterns you noticed.

${JSON.stringify(directorNotes.observations, null, 2)}
</INVESTIGATION_OBSERVATIONS>` : '';
```

Insert `${observationsSection}` in the `<DATA_CONTEXT>` section, after `${this._buildFinancialSummary(shellAccounts)}`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose -t "INVESTIGATION_OBSERVATIONS"`
Expected: PASS

- [ ] **Step 5: Wire directorNotes in ai-nodes.js**

Update the `buildArticlePrompt` call in `generateContentBundle` to pass `state.directorNotes`:

```javascript
const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
  state.outline || {},
  state.evidenceBundle || {},
  template,
  arcEvidencePackages,
  state.heroImage,
  shellAccounts,
  sessionFacts,
  state.directorNotes || null  // NEW: director observations for article grounding (RC5)
);
```

- [ ] **Step 6: Run full test suite**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add lib/prompt-builder.js lib/workflow/nodes/ai-nodes.js lib/__tests__/prompt-builder.test.js
git commit -m "feat: inject director observations into article prompt

INVESTIGATION_OBSERVATIONS section provides specific behavioral details
that get compressed away through the outline. Framed as Nova's own
observations ('What you observed'). Only observations injected, not
whiteboard (already flows through outline)."
```

---

## Chunk 4: Prompt File Name Updates (RC2 remainder)

### Task 12: Update character names across all 11 prompt files

**Files:**
- Modify: All 11 files in `.claude/skills/journalist-report/references/prompts/`

This is a bulk find/replace task. The names to replace:
- James → Remi (full: James Whitman → Remi Whitman)
- Victoria → Vic (full: Victoria Kingsley → Vic Kingsley)
- Derek → Sam (full: Derek Thorne → Sam Thorne)
- Diana → Mel (full: Diana Nilsson → Mel Nilsson)
- Jessicah → Jess (full: Jessicah Kane → Jess Kane)
- Leila → Zia (full: Leila Bishara → Zia Bishara)
- Rachel → Riley (full: Rachel Torres → Riley Torres)
- Howie → Ezra (full: Howie Sullivan → Ezra Sullivan)
- Sofia → Nat (full: Sofia Francisco → Nat Francisco)
- Oliver → Quinn (full: Oliver Sterling → Quinn Sterling)

- [ ] **Step 1: Audit each file for stale FULL name references**

Search for full names first (high-confidence matches, no false positives):
```bash
grep -rn "James Whitman\|Victoria Kingsley\|Derek Thorne\|Diana Nilsson\|Jessicah Kane\|Leila Bishara\|Rachel Torres\|Howie Sullivan\|Sofia Francisco\|Oliver Sterling" .claude/skills/journalist-report/references/prompts/
```

Then search for first-name-only references (requires manual review — some like "James" or "Victoria" may appear in non-character contexts):
```bash
grep -rn "Jessicah\|Leila\|Howie\|Sofia\b" .claude/skills/journalist-report/references/prompts/
```

Note: "James", "Victoria", "Derek", "Diana", "Rachel", "Oliver" are common English words. Review each match to confirm it refers to a character before replacing.

Document a table mapping file → which old names appear → which new names to use.

- [ ] **Step 2: Update evidence-boundaries.md name references**

Expected old names: Victoria (multiple — lines 81, 84, 104, 106, 114, Quick Reference).
Replace: Victoria → Vic, Victoria Kingsley → Vic Kingsley.
**Caution**: If a "Victoria Chen" hallucination example exists (teaching the AI not to invent last names), update to "Vic Chen" — the pedagogical intent (wrong last name) must still work with the new first name.

- [ ] **Step 3: Update anti-patterns.md name references**

Expected old names: Victoria (lines 94, 97).
Replace: Victoria → Vic.
The non-roster example from Task 9 already uses "Quinn" (correct). **Note**: Morgan appears in arc-flow examples — Morgan is an UNCHANGED name (do NOT rename).

- [ ] **Step 4: Update character-voice.md name references**

Expected old names: Victoria in examples.
Replace: Victoria → Vic. Check for any Derek, James, Diana references.

- [ ] **Step 5: Update narrative-structure.md name references**

Expected old names: Victoria, Derek, Diana.
Replace: Victoria → Vic, Derek → Sam, Diana → Mel. Verify examples still make narrative sense with new names.

- [ ] **Step 6: Update section-rules.md name references**

Expected old names: Victoria.
Replace: Victoria → Vic.
**Cross-chunk dependency**: Also update any `[X]` player count instruction to reference `<SESSION_FACTS>` per the design spec. This requires Chunk 3 (Task 10) to be complete first. If implementing chunks out of order, defer this sub-step and add a TODO comment.

- [ ] **Step 7: Update writing-principles.md name references**

Expected old names: Victoria, Derek, James.
Replace: Victoria → Vic, Derek → Sam, James → Remi. These appear in WRONG/RIGHT writing examples — verify the examples still demonstrate their intended anti-pattern with new names.

- [ ] **Step 8: Update arc-flow.md name references**

Expected old names: Victoria.
Replace: Victoria → Vic. **Important**: Morgan also appears in arc-flow.md examples — Morgan is UNCHANGED (current name). Do NOT rename Morgan.

- [ ] **Step 9: Update remaining files (editorial-design, formatting, photo-analysis, photo-enrichment)**

Only if stale names found in Step 1 audit. These files typically have abstract examples with minimal character name references.

Only if stale names found in Step 1.

- [ ] **Step 10: Run prompt-builder tests**

Run: `npx jest lib/__tests__/prompt-builder.test.js --verbose`
Expected: PASS (prompt loading unaffected by content changes)

- [ ] **Step 11: Verify no stale names remain**

Full-name check (must return zero matches):
Run: `grep -rn "James Whitman\|Victoria Kingsley\|Derek Thorne\|Diana Nilsson\|Jessicah Kane\|Leila Bishara\|Rachel Torres\|Howie Sullivan\|Sofia Francisco\|Oliver Sterling" .claude/skills/journalist-report/references/prompts/`
Expected: No matches

First-name check for unambiguous old names (must return zero matches):
Run: `grep -rn "Jessicah\|Leila\|Howie\|Sofia Francisco\|Oliver Sterling" .claude/skills/journalist-report/references/prompts/`
Expected: No matches

Note: "James", "Victoria", "Derek", "Diana", "Rachel", "Oliver" as standalone words may appear in non-character contexts. Manual review of Step 1 audit results is the definitive check for these.

- [ ] **Step 12: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/
git commit -m "fix: update all prompt files with current character names

10 name updates across 11 prompt files to match Notion source of truth.
Examples updated to use current names while preserving pedagogical intent.
Low-impact: dynamically-injected roster section is the primary name source."
```

---

## Post-Implementation Verification

After all tasks complete:

- [ ] **Full test suite passes:** `npx jest --verbose`
- [ ] **No stale names in theme-config:** grep for old first names in `lib/theme-config.js`
- [ ] **No stale names in prompt files:** grep across `.claude/skills/journalist-report/references/prompts/`
- [ ] **evidence-boundaries.md money direction is correct:** manual review of mechanics section
- [ ] **articleId generates from sessionId:** check template-helpers test output
- [ ] **header.hbs uses storyDate:** visual inspection
- [ ] **SESSION_FACTS appears in article prompt:** add temporary `console.log` in generateContentBundle, run e2e with `--step` to verify prompt content

```bash
# Quick smoke test with existing session data
node scripts/e2e-walkthrough.js --session 0306 --step
```
