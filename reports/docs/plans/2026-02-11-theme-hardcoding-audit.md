# Theme Hardcoding Audit — Fix Remaining Journalist Assumptions

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate all hardcoded journalist-theme assumptions so the detective theme produces correct output end-to-end through the article pipeline (Phase 4+).

**Architecture:** We follow the same 4-layer fix pattern proven in the outline pipeline fix (commit `1fb3ea3`): Schema → Prompt → AI Node → UI. Each layer must branch by theme. Where possible, we add theme config to the existing `theme-config.js` (Open/Closed principle) and derive behavior from config rather than adding `if/else` branches. DRY refactoring allowed — we extract shared constants and lookup functions rather than duplicating strings.

**Tech Stack:** Node.js, Jest, JSON Schema, React (CDN, no build)

**Key Principle from previous plan:** "The detective theme does NOT need to replicate the journalist theme's complexity." Detective reports are ~750 words, no pull quotes, no financial tracker, no sidebar evidence cards. The content-bundle schema should allow these fields to be absent, not require a parallel schema.

---

## Scope Summary

| # | Severity | Location | Issue |
|---|----------|----------|-------|
| 1 | CRITICAL | `prompt-builder.js` `buildArticlePrompt()` | User prompt has ~200 lines of journalist-only content (sections, visual components, arc flow) |
| 2 | CRITICAL | `prompt-builder.js` `buildRevisionPrompt()` | Revision checklist references Nova, em-dash, journalist voice patterns |
| 3 | CRITICAL | `prompt-builder.js` `buildValidationPrompt()` | Validation checklist references em-dash, participatory voice, CLOSING section |
| 4 | CRITICAL | `ai-nodes.js` `generateContentBundle()` | Post-generation validation hardcodes journalist minimums (2 pull quotes, 3 evidence-cards) |
| 5 | IMPORTANT | `Article.js` line 950 | `"Nova's Insight"` hardcoded label for crystallization pull quotes |
| 6 | IMPORTANT | `Article.js` rendering | Sidebar sections (pullQuotes, evidenceCards, financialTracker) rendered unconditionally |
| 7 | MINOR | `template-helpers.js` `articleId()` | Hardcoded "NNA" prefix (NovaNews Article) |
| 8 | MINOR | `ai-nodes.js` line 1013 | `result?.theStory?.arcs?.length` in reviseOutline log |

### What We're NOT Doing
- Creating a separate `detective-content-bundle.schema.json` — the existing schema already uses optional arrays/objects, so detective content bundles simply omit `pullQuotes`, `financialTracker`, and `evidenceCards`. The schema already validates both shapes.
- Rewriting the HTML template system — `template-assembler.js` and `template-nodes.js` are already theme-aware.
- Touching `graph.js`, `state.js`, or checkpoint flow — these are theme-agnostic.

---

## Task 1: Add Theme Display Config to `theme-config.js`

**Files:**
- Modify: `lib/theme-config.js`
- Modify: `__tests__/unit/theme-config.test.js` (if it exists, otherwise `lib/__tests__/theme-config.test.js`)

This task adds theme-derived display constants used by template-helpers and the UI, following the existing Open/Closed pattern. Instead of scattering `if (theme === 'detective')` across files, we centralize display config.

**Step 1: Write failing tests**

Add to the theme-config test file:

```javascript
describe('display config', () => {
  it('journalist has articleIdPrefix NNA', () => {
    const config = getThemeConfig('journalist');
    expect(config.display.articleIdPrefix).toBe('NNA');
  });

  it('detective has articleIdPrefix DCR', () => {
    const config = getThemeConfig('detective');
    expect(config.display.articleIdPrefix).toBe('DCR');
  });

  it('journalist has crystallizationLabel', () => {
    const config = getThemeConfig('journalist');
    expect(config.display.crystallizationLabel).toBe("Nova's Insight");
  });

  it('detective has crystallizationLabel', () => {
    const config = getThemeConfig('detective');
    expect(config.display.crystallizationLabel).toBe("Detective's Note");
  });

  it('journalist has postGenValidation rules', () => {
    const config = getThemeConfig('journalist');
    expect(config.display.postGenValidation.minPullQuotes).toBe(2);
    expect(config.display.postGenValidation.minInlineEvidenceCards).toBe(3);
  });

  it('detective has no postGenValidation minimums', () => {
    const config = getThemeConfig('detective');
    expect(config.display.postGenValidation.minPullQuotes).toBe(0);
    expect(config.display.postGenValidation.minInlineEvidenceCards).toBe(0);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx jest lib/__tests__/theme-config.test.js --verbose 2>&1 | head -40` (or equivalent path)
Expected: FAIL — `config.display` is undefined

**Step 3: Add display config to both themes**

In `lib/theme-config.js`, add `display` property to both theme configs:

```javascript
// Inside journalist config, after canonicalCharacters:
display: {
  articleIdPrefix: 'NNA',     // NovaNews Article
  crystallizationLabel: "Nova's Insight",
  postGenValidation: {
    minPullQuotes: 2,
    minInlineEvidenceCards: 3
  }
}

// Inside detective config, after canonicalCharacters:
display: {
  articleIdPrefix: 'DCR',     // Detective Case Report
  crystallizationLabel: "Detective's Note",
  postGenValidation: {
    minPullQuotes: 0,
    minInlineEvidenceCards: 0
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest lib/__tests__/theme-config.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js  # or __tests__/unit/...
git commit -m "feat: add display config to theme-config (articleIdPrefix, crystallizationLabel, postGenValidation)"
```

---

## Task 2: Make `articleId()` Theme-Aware in `template-helpers.js`

**Files:**
- Modify: `lib/template-helpers.js:200-215` (the `articleId` function)
- Modify: `__tests__/unit/template-helpers.test.js:139-155` (articleId tests)

**Step 1: Write failing tests**

Update existing tests and add detective test:

```javascript
describe('articleId', () => {
  it('generates NNA format for journalist theme', () => {
    const metadata = { generatedAt: '2024-12-23T14:30:00Z', theme: 'journalist' };
    const result = articleId(metadata);
    expect(result).toMatch(/^NNA-\d{4}-\d{2}$/);
  });

  it('generates DCR format for detective theme', () => {
    const metadata = { generatedAt: '2024-12-23T14:30:00Z', theme: 'detective' };
    const result = articleId(metadata);
    expect(result).toMatch(/^DCR-\d{4}-\d{2}$/);
  });

  it('defaults to NNA when no theme in metadata', () => {
    const metadata = { generatedAt: '2024-12-23T14:30:00Z' };
    const result = articleId(metadata);
    expect(result).toMatch(/^NNA-\d{4}-\d{2}$/);
  });

  it('returns theme-appropriate default for null metadata', () => {
    expect(articleId(null)).toBe('NNA-0000-00');
    expect(articleId({})).toBe('NNA-0000-00');
  });

  it('returns default for invalid date', () => {
    expect(articleId({ generatedAt: 'invalid' })).toBe('NNA-0000-00');
  });
});
```

**Step 2: Run tests to verify new detective test fails**

Run: `npx jest __tests__/unit/template-helpers.test.js --verbose -t "articleId"`
Expected: FAIL — detective test gets NNA, not DCR

**Step 3: Update `articleId()` to read theme from metadata**

In `lib/template-helpers.js`, replace the `articleId` function:

```javascript
/**
 * Generate article ID from session metadata
 * Format: {PREFIX}-{MMDD}-{HH}
 * Prefix from theme-config.js display.articleIdPrefix (NNA for journalist, DCR for detective)
 *
 * @param {Object} metadata - ContentBundle metadata (must include .theme for non-default prefix)
 * @returns {string} Article ID
 */
function articleId(metadata) {
  // Lazy-require to avoid circular dependency (template-helpers loaded early)
  const { getThemeConfig } = require('./theme-config');
  const theme = (metadata && metadata.theme) || 'journalist';
  const config = getThemeConfig(theme);
  const prefix = (config && config.display && config.display.articleIdPrefix) || 'NNA';

  if (!metadata || !metadata.generatedAt) {
    return `${prefix}-0000-00`;
  }

  const date = parseDate(metadata.generatedAt);
  if (!date) {
    return `${prefix}-0000-00`;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');

  return `${prefix}-${month}${day}-${hour}`;
}
```

**Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/template-helpers.test.js --verbose -t "articleId"`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/template-helpers.js __tests__/unit/template-helpers.test.js
git commit -m "fix: make articleId() theme-aware (NNA for journalist, DCR for detective)"
```

---

## Task 3: Theme-Aware `buildArticlePrompt()` in `prompt-builder.js`

**Files:**
- Modify: `lib/prompt-builder.js:548-787` (the `buildArticlePrompt` method)

This is the biggest change. The journalist user prompt is ~200 lines of journalist-specific content. Detective needs a completely different user prompt — shorter, no pull quotes, no financial tracker, no visual distribution table, no arc-flow section-by-section guidance.

The system prompt is already theme-aware (line 554 uses `THEME_SYSTEM_PROMPTS[this.themeName]`). Only the user prompt needs branching.

**Step 1: Write a smoke test**

There's no existing prompt-builder test file. Create a minimal one to verify the branch works:

File: `__tests__/unit/prompt-builder.test.js`

```javascript
/**
 * PromptBuilder unit tests — theme branching for article prompt
 */
const { PromptBuilder } = require('../../lib/prompt-builder');

// Minimal ThemeLoader stub
function createStubThemeLoader() {
  return {
    loadPhasePrompts: async () => ({
      'character-voice': 'voice rules',
      'evidence-boundaries': 'evidence rules',
      'section-rules': 'section rules',
      'narrative-structure': 'narrative rules',
      'arc-flow': 'arc flow rules',
      'formatting': 'formatting rules',
      'editorial-design': 'editorial rules',
      'anti-patterns': 'anti-pattern rules',
      'writing-principles': 'writing principles'
    }),
    loadTemplate: async () => '<html>template</html>'
  };
}

describe('PromptBuilder.buildArticlePrompt', () => {
  it('journalist prompt includes journalist sections', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'journalist');
    const { userPrompt } = await pb.buildArticlePrompt({}, {}, '', []);
    expect(userPrompt).toContain('LEDE');
    expect(userPrompt).toContain('THE STORY');
    expect(userPrompt).toContain('FOLLOW THE MONEY');
    expect(userPrompt).toContain('pullQuotes');
  });

  it('detective prompt does NOT include journalist sections', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
    const { userPrompt } = await pb.buildArticlePrompt({}, {}, '', []);
    expect(userPrompt).not.toContain('FOLLOW THE MONEY');
    expect(userPrompt).not.toContain('THE PLAYERS');
    expect(userPrompt).not.toContain('pullQuotes');
    expect(userPrompt).not.toContain('financialTracker');
  });

  it('detective prompt includes detective sections', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
    const { userPrompt } = await pb.buildArticlePrompt({}, {}, '', []);
    expect(userPrompt).toContain('executive-summary');
    expect(userPrompt).toContain('evidence-locker');
    expect(userPrompt).toContain('suspect-network');
    expect(userPrompt).toContain('final-assessment');
  });

  it('detective system prompt uses detective identity', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
    const { systemPrompt } = await pb.buildArticlePrompt({}, {}, '', []);
    expect(systemPrompt).toContain('Detective');
    expect(systemPrompt).toContain('Case Report');
  });
});
```

**Step 2: Run test to verify detective tests fail**

Run: `npx jest __tests__/unit/prompt-builder.test.js --verbose`
Expected: FAIL — detective prompt still contains journalist content

**Step 3: Add detective branch to `buildArticlePrompt()`**

In `lib/prompt-builder.js`, modify `buildArticlePrompt()`. The system prompt section (lines 552-559) is already theme-aware — keep it. Add a theme branch for the user prompt.

After line 580 (the `arcEvidenceSection` builder), add the branch:

```javascript
    let userPrompt;

    if (this.themeName === 'detective') {
      // Detective article prompt — much simpler, no visual components
      userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

EVIDENCE BUNDLE (quote ONLY from exposed evidence):
${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
</DATA_CONTEXT>

<TEMPLATE>
${template}
</TEMPLATE>

<RULES>
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}

${generateRosterSection(this.themeName)}
</RULES>

<SECTION_GUIDANCE>
Each section answers a DIFFERENT QUESTION about the same underlying facts.
No fact should appear in more than one section.

Sections with their purpose:
- EXECUTIVE SUMMARY: What happened? (overview, primary findings)
- EVIDENCE LOCKER: What does the evidence show? (thematically grouped, synthesized)
- MEMORY ANALYSIS: What do the memory patterns reveal? (optional, only if patterns are significant)
- SUSPECT NETWORK: Who is connected to whom? (relationships, suspicion levels)
- OUTSTANDING QUESTIONS: What remains unknown? (gaps, unresolved threads)
- FINAL ASSESSMENT: What does the detective conclude? (verdict, closing line)
</SECTION_GUIDANCE>

<ANTI_PATTERNS>
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
</ANTI_PATTERNS>

<VOICE_CHECKPOINT>
${constraints.voiceCheckpoint}
${labelPromptSection('character-voice', prompts['character-voice'])}
${labelPromptSection('writing-principles', prompts['writing-principles'])}
${constraints.voiceQuestion}
</VOICE_CHECKPOINT>

<GENERATION_INSTRUCTION>
Generate structured case report content as JSON matching the ContentBundle schema.

TARGET LENGTH: ~750 words total across all sections.

STRUCTURE:
1. "sections" - Array of report sections, each with:
   - "id": Section identifier (executive-summary, evidence-locker, memory-analysis, suspect-network, outstanding-questions, final-assessment)
   - "type": Section type for styling (case-summary, evidence-highlight, narrative, investigation-notes, conclusion)
   - "heading": Section heading
   - "content": Array of content blocks:
     * {"type": "paragraph", "text": "..."} - Prose text
     * {"type": "quote", "text": "...", "attribution": "..."} - Inline quotes
     * {"type": "list", "items": [...], "ordered": false} - Lists
     * {"type": "evidence-reference", "tokenId": "xxx", "caption": "..."} - Evidence reference

2. "headline" - Report headline with main, kicker, deck

3. "byline" - Author info (author: "Detective Anondono", title: "Lead Investigator", etc.)

4. "photos" - Session photos with placement (inline only, no sidebar)

5. "heroImage" - Featured image at top

6. "voice_self_check" - Self-assessment:
   - Is the voice professional and analytical?
   - Are names in <strong> tags, evidence in <em> tags?
   - Is each section answering a DIFFERENT question?
   - Any repeated facts across sections?
   - Any game terminology that slipped through?

NOTE: Do NOT include "pullQuotes", "evidenceCards", or "financialTracker" — these are journalist-only visual components. The detective report uses a simpler single-column layout.
</GENERATION_INSTRUCTION>`;

    } else {
      // Journalist article prompt — full visual component system
      userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
...existing journalist prompt unchanged...
`;
    }
```

The journalist `else` block should contain the ENTIRE existing user prompt from line 583 through line 784 (the closing backtick), **unchanged**.

**Step 4: Run tests to verify they pass**

Run: `npx jest __tests__/unit/prompt-builder.test.js --verbose`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/prompt-builder.js __tests__/unit/prompt-builder.test.js
git commit -m "feat: theme-aware buildArticlePrompt() — detective gets simplified case report prompt"
```

---

## Task 4: Theme-Aware `buildRevisionPrompt()` and `buildValidationPrompt()`

**Files:**
- Modify: `lib/prompt-builder.js:800-904` (revision + validation methods)
- Modify: `__tests__/unit/prompt-builder.test.js` (add revision/validation tests)

Both methods have journalist-specific checklists in their user prompts.

**Step 1: Write failing tests**

Add to `__tests__/unit/prompt-builder.test.js`:

```javascript
describe('PromptBuilder.buildRevisionPrompt', () => {
  it('journalist revision references Nova and em-dashes', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'journalist');
    const { userPrompt } = await pb.buildRevisionPrompt('content', 'check');
    expect(userPrompt).toContain('Nova');
    expect(userPrompt).toContain('em-dashes');
  });

  it('detective revision does NOT reference Nova or em-dashes', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
    const { userPrompt } = await pb.buildRevisionPrompt('content', 'check');
    expect(userPrompt).not.toContain('Nova');
    expect(userPrompt).not.toContain('em-dashes');
  });
});

describe('PromptBuilder.buildValidationPrompt', () => {
  it('journalist validation checks for em-dashes and participatory voice', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'journalist');
    const { userPrompt } = await pb.buildValidationPrompt('<html></html>', ['Alex']);
    expect(userPrompt).toContain('Em-dashes');
    expect(userPrompt).toContain('Passive/neutral voice');
  });

  it('detective validation checks for game terminology and section differentiation', async () => {
    const pb = new PromptBuilder(createStubThemeLoader(), 'detective');
    const { userPrompt } = await pb.buildValidationPrompt('<html></html>', ['Alex']);
    expect(userPrompt).not.toContain('Em-dashes');
    expect(userPrompt).toContain('section differentiation');
  });
});
```

**Step 2: Run tests to verify detective tests fail**

Run: `npx jest __tests__/unit/prompt-builder.test.js --verbose`
Expected: FAIL — detective prompts still contain journalist-specific content

**Step 3: Add theme branch to `buildRevisionPrompt()`**

In the `<REVISION_INSTRUCTION>` section (~lines 825-837), branch by theme:

```javascript
    // Theme-specific revision checklist
    const revisionChecklist = this.themeName === 'detective'
      ? `Fix the issues you identified in your self-check. Also check for:
- Any game mechanics terminology ("tokens", "character sheets", "Act 1/2/3")
- Repeated facts across sections (each section must answer a DIFFERENT question)
- Names missing <strong> tags or evidence missing <em> tags
- Any first-person voice that slipped in ("I saw", "I discovered")
- Section headings that don't clearly signal different analytical angles`
      : `Fix the issues you identified in your self-check. Also check for:
- "guests" -> "people" or "those present" or "partygoers"
- "From my notes that night" -> "- Nova" or remove
- Any remaining passive/observer voice patterns
- Any em-dashes that slipped through
- Generic praise or vague attributions
- Game mechanics language ("tokens", "transactions", "buried bonus")`;
```

Then use `${revisionChecklist}` in the user prompt where the hardcoded list was.

**Step 4: Add theme branch to `buildValidationPrompt()`**

In the user prompt checklist (~lines 871-880), branch by theme:

```javascript
    const validationChecklist = this.themeName === 'detective'
      ? `Check for:
1. Game mechanics language ("token", "Act 3", "final call", "character sheet")
2. First-person voice (should be third-person investigative)
3. Repeated facts appearing in multiple sections (section differentiation)
4. Missing roster members
5. Names not in <strong> tags
6. Evidence artifacts not in <em> tags
7. Report exceeds ~800 words (target ~750)`
      : `Check for:
1. Em-dashes (— or --)
2. "token/tokens" instead of "extracted memory"
3. Game mechanics language ("Act 3", "final call", "first burial", "guest/guests")
4. Vague attribution ("from my notes", "sources say")
5. Passive/neutral voice (should be participatory)
6. Missing roster members
7. Blake condemned (should be suspicious but nuanced)
8. Missing systemic critique in CLOSING`;
```

Also branch the JSON response format for the validation return to reflect detective-specific fields vs journalist-specific fields (e.g., no `blake_handled_correctly` for detective, add `section_differentiation` instead).

**Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/unit/prompt-builder.test.js --verbose`
Expected: PASS

**Step 6: Commit**

```bash
git add lib/prompt-builder.js __tests__/unit/prompt-builder.test.js
git commit -m "fix: theme-aware revision and validation prompts (detective-specific checklists)"
```

---

## Task 5: Theme-Aware Post-Generation Validation in `ai-nodes.js`

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:1179-1194` (post-generation logging)
- Modify: `lib/workflow/nodes/ai-nodes.js:1013` (reviseOutline log)
- Modify: `__tests__/unit/workflow/ai-nodes.test.js` (if tests cover these log lines)

**Step 1: Read the post-generation validation code**

The current code at lines 1179-1194 hardcodes:
- "minimum 2 pull quotes required"
- "minimum 3 inline evidence-cards required"

**Step 2: Replace hardcoded minimums with theme config lookup**

```javascript
  // Phase 3.2: Post-generation logging — theme-aware visual component checks
  const { getThemeConfig } = require('../../theme-config');
  const articleTheme = config?.configurable?.theme || state.theme || 'journalist';
  const themeDisplay = getThemeConfig(articleTheme)?.display?.postGenValidation || {};
  const minPullQuotes = themeDisplay.minPullQuotes ?? 2;
  const minInlineCards = themeDisplay.minInlineEvidenceCards ?? 3;

  const inlineEvidenceCards = (generatedContent.sections || []).flatMap(s =>
    (s.content || []).filter(c => c.type === 'evidence-card')
  );
  const pullQuoteCount = (generatedContent.pullQuotes || []).length;
  const sidebarCardCount = (generatedContent.evidenceCards || []).length;

  console.log(`[generateContentBundle] Post-generation: Visual components generated:`);
  console.log(`  Inline evidence-cards: ${inlineEvidenceCards.length}${minInlineCards > 0 ? ` (minimum ${minInlineCards} required)` : ''}`);
  console.log(`  Sidebar evidence cards: ${sidebarCardCount}`);
  console.log(`  Pull quotes: ${pullQuoteCount}${minPullQuotes > 0 ? ` (minimum ${minPullQuotes} required)` : ''}`);

  if (minInlineCards > 0 && inlineEvidenceCards.length < minInlineCards) {
    console.warn(`  ⚠ INSUFFICIENT inline evidence-cards — validation will trigger revision loop`);
  }
  if (minPullQuotes > 0 && pullQuoteCount < minPullQuotes) {
    console.warn(`  ⚠ INSUFFICIENT pull quotes — validation will trigger revision loop`);
  }
```

**Step 3: Fix reviseOutline log at line 1013**

Replace:
```javascript
console.log(`[reviseOutline] Complete: ${result?.theStory?.arcs?.length || 0} arcs in ${duration}s`);
```

With theme-aware version:
```javascript
const outlineTheme = config?.configurable?.theme || state.theme || 'journalist';
const arcCount = outlineTheme === 'detective'
  ? result?.evidenceLocker?.evidenceGroups?.length || 0
  : result?.theStory?.arcs?.length || 0;
console.log(`[reviseOutline] Complete: ${arcCount} ${outlineTheme === 'detective' ? 'evidence groups' : 'arcs'} in ${duration}s`);
```

**Step 4: Run full test suite to check for regressions**

Run: `npx jest --verbose 2>&1 | tail -20`
Expected: All tests pass

**Step 5: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js
git commit -m "fix: theme-aware post-generation validation and reviseOutline log"
```

---

## Task 6: Theme-Aware `Article.js` UI Component

**Files:**
- Modify: `console/components/checkpoints/Article.js:586,950,1261-1278`

**Step 1: Accept `theme` prop and detect theme**

At the top of the `Article` function (line 586), add theme prop and auto-detection:

Change:
```javascript
function Article({ data, sessionId: propSessionId, onApprove, onReject, dispatch, revisionCache }) {
```

To:
```javascript
function Article({ data, sessionId: propSessionId, theme, onApprove, onReject, dispatch, revisionCache }) {
```

After the `contentBundle` extraction (line 587), add:
```javascript
  // Theme detection: prop > metadata > fallback
  const isDetective = theme === 'detective' ||
    (!theme && contentBundle.metadata && contentBundle.metadata.theme === 'detective');
```

**Step 2: Fix "Nova's Insight" label at line 950**

Replace:
```javascript
!isVerbatim && React.createElement('span', { className: 'pull-quote__type-label' }, "Nova's Insight"),
```

With:
```javascript
!isVerbatim && React.createElement('span', { className: 'pull-quote__type-label' }, isDetective ? "Detective's Note" : "Nova's Insight"),
```

**Step 3: Conditionally render journalist-only sidebar sections**

At lines 1261-1278, wrap pull quotes, evidence cards, and financial tracker in a journalist-only conditional:

```javascript
    // Pull quotes (journalist theme only — detective reports don't use pull quotes)
    !isDetective && currentPullQuotes.length > 0 && React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'PULL QUOTES (' + currentPullQuotes.length + ')'),
      currentPullQuotes.map(function (pq, i) {
        return renderPullQuote(pq, i);
      })
    ),

    // Evidence cards (journalist theme only)
    !isDetective && currentEvidenceCards.length > 0 && React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE CARDS (' + currentEvidenceCards.length + ')'),
      currentEvidenceCards.map(function (card, i) {
        return renderSidebarEvidenceCard(card, i);
      })
    ),

    // Financial tracker (journalist theme only)
    !isDetective && renderFinancialTracker(getCurrentBundle().financialTracker || financialTracker),
```

**Note:** This is conservative — the conditionals already null-check the arrays, so detective data won't crash. But wrapping in `!isDetective` avoids rendering empty sections and confusing visual noise.

**Step 4: Test manually (no automated frontend tests)**

1. Start dev server: `npm start`
2. Navigate to console, start a detective session
3. Process through to article checkpoint
4. Verify: no pull quotes section, no evidence cards section, no financial tracker
5. Verify: if crystallization quotes somehow exist, they show "Detective's Note"

**Step 5: Commit**

```bash
git add console/components/checkpoints/Article.js
git commit -m "fix: theme-aware Article.js (crystallization label, conditional sidebar sections)"
```

---

## Task 7: Run Full Test Suite + Final Verification

**Step 1: Run the complete test suite**

Run: `npm test`
Expected: All tests pass, no regressions

**Step 2: Verify test count hasn't decreased**

Previous count: 871 tests. New tests added in Tasks 1-4 should bring it higher.

**Step 3: Run a quick detective E2E sanity check if time permits**

Run: `node scripts/e2e-walkthrough.js --session 1225 --step`
Verify the pipeline runs through article generation for detective theme without errors.

**Step 4: Final commit if any cleanup needed**

If any issues found, fix and commit. Otherwise, no action needed.

---

## Dependency Graph

```
Task 1 (theme-config) ← Task 2 (articleId reads display config)
Task 1 (theme-config) ← Task 5 (ai-nodes reads postGenValidation)
Task 1 (theme-config) ← Task 6 (Article.js could read crystallizationLabel from config, but uses prop for simplicity)
Task 3 (article prompt) — independent
Task 4 (revision/validation prompts) — independent
Task 7 (verification) ← all others
```

Tasks 3 and 4 can run in parallel with Tasks 1→2 and 1→5.

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Detective content-bundle fails schema validation | The existing `content-bundle.schema.json` makes `pullQuotes`, `evidenceCards`, `financialTracker` optional (not in `required`). Detective bundles simply omit them. **Verified in schema review.** |
| Prompt-builder changes break journalist pipeline | The journalist branch is the `else` block — existing code is preserved verbatim, only wrapped in the else. Tests verify journalist output unchanged. |
| `articleId()` circular dependency | The `require('./theme-config')` is lazy (inside function body), not at module level. Template-helpers loads early; theme-config has no dependency on template-helpers. No circular risk. |
| Article.js rendering breaks for detective | All conditionals are additive (`!isDetective &&`). Journalist rendering is untouched. Detective simply skips sidebar sections. |
