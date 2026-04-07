# Word Budget Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate conflicting word budget / paragraph count signals so the LLM receives one consistent set of length targets that sum to the stated 1000-1500 word total.

**Architecture:** Three sources currently give conflicting per-section word ranges: `theme-config.js` (used by evaluator), `formatting.md` (injected into LLM prompts), and `section-rules.md` (injected into LLM prompts). We reconcile all three to a single canonical set of ranges that sum to the 1000-1500 word envelope, add coverage for optional sections in `theme-config.js`, and add an explicit length target to the journalist article generation prompt.

**Tech Stack:** Node.js (Jest for tests), Markdown prompt files

---

## Reconciled Word Budgets

The canonical per-section ranges, designed to sum to the 1000-1500 word envelope:

| Section | Min | Max | Notes |
|---------|-----|-----|-------|
| LEDE | 75 | 150 | Hook + death + accusation + Nova presence |
| THE STORY | 350 | 550 | Longest section, scales with evidence |
| FOLLOW THE MONEY | 75 | 200 | Financial tracker does visual heavy lifting |
| THE PLAYERS | 150 | 250 | Evaluation of choices, not evidence catalog |
| WHAT'S MISSING | 75 | 150 | Brief - mystery, not exhaustive gap list |
| CLOSING | 75 | 150 | Forward implications, not recap |

**Sum of mins:** 800 (leaves room for sparse-evidence articles)
**Sum of maxes:** 1,450 (stays under 1,500 ceiling with margin)

---

## Task 1: Update theme-config.js wordBudgets

**Files:**
- Modify: `lib/theme-config.js:37-42`
- Test: `lib/__tests__/theme-config.test.js:101-106`

- [ ] **Step 1: Update the existing test assertions to expect new values**

In `lib/__tests__/theme-config.test.js`, replace the existing word budget test:

```javascript
    it('should include word budgets', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.wordBudgets).toBeDefined();
      expect(rules.wordBudgets.lede).toEqual({ min: 50, max: 150 });
      expect(rules.wordBudgets.theStory).toEqual({ min: 300, max: 600 });
    });
```

with:

```javascript
    it('should include word budgets for all sections', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.wordBudgets).toBeDefined();
      expect(rules.wordBudgets.lede).toEqual({ min: 75, max: 150 });
      expect(rules.wordBudgets.theStory).toEqual({ min: 350, max: 550 });
      expect(rules.wordBudgets.followTheMoney).toEqual({ min: 75, max: 200 });
      expect(rules.wordBudgets.thePlayers).toEqual({ min: 150, max: 250 });
      expect(rules.wordBudgets.whatsMissing).toEqual({ min: 75, max: 150 });
      expect(rules.wordBudgets.closing).toEqual({ min: 75, max: 150 });
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/theme-config.test.js -t "should include word budgets" -v`
Expected: FAIL — current values don't match, and `followTheMoney`/`whatsMissing` are missing.

- [ ] **Step 3: Update wordBudgets in theme-config.js**

In `lib/theme-config.js`, replace lines 36-42:

```javascript
      // Target word counts per section (advisory)
      wordBudgets: {
        lede: { min: 50, max: 150 },
        theStory: { min: 300, max: 600 },
        thePlayers: { min: 100, max: 300 },
        closing: { min: 50, max: 150 }
      }
```

with:

```javascript
      // Target word counts per section (advisory)
      // Reconciled to sum to 1000-1500 word envelope (see docs/superpowers/plans/2026-03-30-word-budget-reconciliation.md)
      wordBudgets: {
        lede: { min: 75, max: 150 },
        theStory: { min: 350, max: 550 },
        followTheMoney: { min: 75, max: 200 },
        thePlayers: { min: 150, max: 250 },
        whatsMissing: { min: 75, max: 150 },
        closing: { min: 75, max: 150 }
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/theme-config.test.js -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/theme-config.js lib/__tests__/theme-config.test.js
git commit -m "fix: reconcile journalist wordBudgets to fit 1000-1500 word envelope

Added followTheMoney and whatsMissing budgets (were missing). Adjusted
all ranges so sum of maxes = 1450 (under 1500 ceiling). Previously
theStory max was 600 and thePlayers max was 300, leaving optional
sections unbudgeted."
```

---

## Task 2: Update formatting.md per-section length table

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/formatting.md:130-141`

The per-section table currently sums to 1050-2200, far exceeding its own stated 1000-1500 total. Align it with the canonical budgets from Task 1.

- [ ] **Step 1: Replace the Length Guidelines section**

In `.claude/skills/journalist-report/references/prompts/formatting.md`, replace lines 130-141:

```markdown
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
```

with:

```markdown
## Length Guidelines

| Section | Target Length | Notes |
|---------|---------------|-------|
| LEDE | 75-150 words | Hook, not setup |
| THE STORY | 350-550 words | Scales with exposed evidence |
| FOLLOW THE MONEY | 75-200 words | Tracker does the visual work |
| THE PLAYERS | 150-250 words | Evaluate choices, not catalog |
| WHAT'S MISSING | 75-150 words | Brief mystery, not exhaustive |
| CLOSING | 75-150 words | Forward implications, not recap |

**Total article:** 1000-1500 words of prose. Quality over quantity - a tight article with impact beats a long one that wanders. Section ranges sum to ~1450 max, leaving headroom for natural variance.
```

- [ ] **Step 2: Verify no tests reference the old values**

Run: `npx jest --listTests 2>/dev/null | xargs grep -l "100-200\|400-800\|200-400\|150-300" 2>/dev/null || echo "No tests reference old formatting.md values"`
Expected: No tests reference old formatting.md values (these are prompt files, not code).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/formatting.md
git commit -m "fix(prompts): align formatting.md section ranges with 1000-1500 total

Per-section ranges previously summed to 1050-2200, contradicting the
stated 1000-1500 total on the same page. Reduced each section to fit
the envelope. Now sums to 800-1450."
```

---

## Task 3: Update section-rules.md length annotations

**Files:**
- Modify: `.claude/skills/journalist-report/references/prompts/section-rules.md:88,124,260,336,431,490`

`section-rules.md` uses prose-style length hints ("2-4 paragraphs max", "Moderate. Scales with roster size") that lack word counts. These get injected into the outline AND article prompts, so they should reinforce the canonical budgets. Add word count annotations alongside the existing prose guidance.

- [ ] **Step 1: Update LEDE length (line 88)**

Replace:
```markdown
**Length:** 2-4 paragraphs max.
```
with:
```markdown
**Length:** 2-4 paragraphs max (75-150 words).
```

- [ ] **Step 2: Update THE STORY length (line 124)**

Replace:
```markdown
**Length:** The longest section. Scales with amount of exposed evidence.
```
with:
```markdown
**Length:** The longest section, 350-550 words. Scales with amount of exposed evidence.
```

- [ ] **Step 3: Update FOLLOW THE MONEY length (line 260)**

Replace:
```markdown
**Length:** Scales with financial activity. Can be brief if little happened.
```
with:
```markdown
**Length:** 75-200 words. Scales with financial activity. Can be brief if little happened.
```

- [ ] **Step 4: Update THE PLAYERS length (line 336)**

Replace:
```markdown
**Length:** Moderate. Scales with roster size.
```
with:
```markdown
**Length:** 150-250 words. Scales with roster size.
```

- [ ] **Step 5: Update WHAT'S MISSING length (line 431)**

Replace:
```markdown
**Length:** Brief to moderate. Don't dwell, but don't skip.
```
with:
```markdown
**Length:** 75-150 words. Don't dwell, but don't skip.
```

- [ ] **Step 6: Update CLOSING length (line 490)**

Replace:
```markdown
**Length:** 2-4 paragraphs.
```
with:
```markdown
**Length:** 2-4 paragraphs (75-150 words).
```

- [ ] **Step 7: Commit**

```bash
git add .claude/skills/journalist-report/references/prompts/section-rules.md
git commit -m "fix(prompts): add word count ranges to section-rules.md length hints

section-rules.md had only prose-style length hints (e.g., 'Moderate')
without word counts. Added ranges matching the canonical 1000-1500
word budget. These reinforce formatting.md and theme-config.js."
```

---

## Task 4: Add explicit length target to journalist article prompt

**Files:**
- Modify: `lib/prompt-builder.js:957` (inside `<GENERATION_INSTRUCTION>` for journalist theme)
- Test: `lib/__tests__/prompt-builder.test.js`

The detective prompt has `TARGET LENGTH: ~750 words (+-50 words acceptable)` in its `<GENERATION_INSTRUCTION>`. The journalist prompt has no equivalent — its only length signals come indirectly via `formatting.md` and `narrative-structure.md` injected as `<RULES>`. Add an explicit target.

- [ ] **Step 1: Write the failing test**

In `lib/__tests__/prompt-builder.test.js`, add after the existing detective word target test (around line 644):

```javascript
    it('journalist article prompt includes explicit word target', async () => {
      const { userPrompt } = await journalistBuilder.buildArticlePrompt(
        { lede: { hook: 'test' } }, '<html></html>', [], null
      );
      expect(userPrompt).toContain('1000-1500 words');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -t "journalist article prompt includes explicit word target" -v`
Expected: FAIL — the journalist prompt doesn't currently contain "1000-1500 words" in its own text (it's only in the injected formatting.md content, but the test checks the user prompt).

NOTE: This test might actually pass because `formatting.md` (which contains "1000-1500 words") is injected into the user prompt via `labelPromptSection('formatting', ...)`. If it passes, the explicit target is still worth adding for salience (recency bias — rules at end of prompt carry more weight), but skip to Step 4 to add it and update the test to check for the `<GENERATION_INSTRUCTION>` location specifically:

```javascript
    it('journalist article prompt includes explicit word target in GENERATION_INSTRUCTION', async () => {
      const { userPrompt } = await journalistBuilder.buildArticlePrompt(
        { lede: { hook: 'test' } }, '<html></html>', [], null
      );
      const generationInstruction = userPrompt.split('<GENERATION_INSTRUCTION>')[1] || '';
      expect(generationInstruction).toContain('1000-1500 words');
    });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest lib/__tests__/prompt-builder.test.js -t "GENERATION_INSTRUCTION" -v`
Expected: FAIL — the `<GENERATION_INSTRUCTION>` section for journalist has no word target.

- [ ] **Step 4: Add length target to journalist GENERATION_INSTRUCTION**

In `lib/prompt-builder.js`, find the journalist `<GENERATION_INSTRUCTION>` section (line 957). After the existing line:

```javascript
Generate structured article content as JSON matching the ContentBundle schema.
```

Add:

```javascript
TARGET LENGTH: 1000-1500 words of prose (excluding visual component markup). Quality over quantity.
```

The full line becomes:
```javascript
<GENERATION_INSTRUCTION>
Generate structured article content as JSON matching the ContentBundle schema.

TARGET LENGTH: 1000-1500 words of prose (excluding visual component markup). Quality over quantity.

STRUCTURE:
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest lib/__tests__/prompt-builder.test.js -t "GENERATION_INSTRUCTION" -v`
Expected: PASS

- [ ] **Step 6: Run full prompt-builder test suite**

Run: `npx jest lib/__tests__/prompt-builder.test.js -v`
Expected: PASS (no regressions)

- [ ] **Step 7: Commit**

```bash
git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js
git commit -m "fix(prompts): add explicit 1000-1500 word target to journalist article prompt

Detective prompt had an explicit TARGET LENGTH in its GENERATION_INSTRUCTION
but journalist did not. Length signals only reached the LLM indirectly
via injected prompt files. Added explicit target in GENERATION_INSTRUCTION
for recency bias salience (rules at end of prompt carry more weight)."
```

---

## Task 5: Update evaluator criteria descriptions

**Files:**
- Modify: `lib/workflow/nodes/evaluator-nodes.js:124,138-139,185-186`

The journalist outline evaluator's `wordBudget` criterion description says "Is section word budget reasonable?" with no reference to the target range. The detective evaluator says "~750 word budget" — the journalist should say "~1000-1500". Also update the `sectionBalance` description for the journalist criteria.

- [ ] **Step 1: Update journalist outline sectionBalance description**

In `lib/workflow/nodes/evaluator-nodes.js`, find the journalist outline criteria (line 170-172):

```javascript
    sectionBalance: {
      description: 'Are sections appropriately weighted?',
      weight: 0.05,
```

Replace with:

```javascript
    sectionBalance: {
      description: 'Are sections appropriately weighted within the 1000-1500 word budget?',
      weight: 0.05,
```

- [ ] **Step 2: Update journalist outline wordBudget description**

Find the journalist outline `wordBudget` criterion (line 185-188):

```javascript
    wordBudget: {
      description: 'Is section word budget reasonable?',
      weight: 0.05,
      type: 'advisory'
```

Replace with:

```javascript
    wordBudget: {
      description: 'Are section word budgets reasonable for a 1000-1500 word article? (lede 75-150, theStory 350-550, followTheMoney 75-200, thePlayers 150-250, whatsMissing 75-150, closing 75-150)',
      weight: 0.05,
      type: 'advisory'
```

- [ ] **Step 3: Run evaluator tests**

Run: `npx jest lib/__tests__/evaluator-nodes.test.js -v 2>/dev/null || echo "No evaluator test file found — criteria descriptions are advisory strings, not tested by value"`
Expected: PASS or no test file (evaluator criteria descriptions are prompt text, not asserted in tests).

- [ ] **Step 4: Commit**

```bash
git add lib/workflow/nodes/evaluator-nodes.js
git commit -m "fix: add word budget ranges to journalist evaluator criteria descriptions

Evaluator LLM now sees explicit per-section word budgets in the
criteria it evaluates against. Previously the journalist criteria
said only 'Is section word budget reasonable?' with no reference range."
```

---

## Task 6: Run full test suite and verify consistency

**Files:**
- None modified — verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS

- [ ] **Step 2: Spot-check prompt output**

Run a quick Node.js check to verify the journalist article prompt now contains the target:

```bash
node -e "
const { createThemeLoader } = require('./lib/theme-loader');
const PromptBuilder = require('./lib/prompt-builder');
(async () => {
  const loader = createThemeLoader('journalist');
  const pb = new PromptBuilder(loader, 'journalist');
  const { userPrompt } = await pb.buildArticlePrompt({ lede: { hook: 'test' } }, '<html></html>');
  const gi = userPrompt.split('<GENERATION_INSTRUCTION>')[1] || '';
  console.log('Has target:', gi.includes('1000-1500'));
  const fmt = userPrompt.split('<formatting>')[1]?.split('</formatting>')[0] || '';
  console.log('formatting.md 75-150 lede:', fmt.includes('75-150'));
  console.log('formatting.md 350-550 story:', fmt.includes('350-550'));
})();
"
```
Expected:
```
Has target: true
formatting.md 75-150 lede: true
formatting.md 350-550 story: true
```

- [ ] **Step 3: Verify theme-config budgets sum correctly**

```bash
node -e "
const { getOutlineRules } = require('./lib/theme-config');
const budgets = getOutlineRules('journalist').wordBudgets;
const minSum = Object.values(budgets).reduce((s, b) => s + b.min, 0);
const maxSum = Object.values(budgets).reduce((s, b) => s + b.max, 0);
console.log('Sections:', Object.keys(budgets).length);
console.log('Sum of mins:', minSum, '(should be ~800)');
console.log('Sum of maxes:', maxSum, '(should be <=1500)');
console.log('Includes followTheMoney:', !!budgets.followTheMoney);
console.log('Includes whatsMissing:', !!budgets.whatsMissing);
"
```
Expected:
```
Sections: 6
Sum of mins: 800 (should be ~800)
Sum of maxes: 1450 (should be <=1500)
Includes followTheMoney: true
Includes whatsMissing: true
```

---

## Summary of Changes

| Source | Before | After |
|--------|--------|-------|
| `theme-config.js` wordBudgets | 4 sections, max sum 1200 | 6 sections, max sum 1450 |
| `formatting.md` section table | max sum 2200 | max sum 1450 |
| `section-rules.md` length hints | prose only ("Moderate") | prose + word range ("150-250 words") |
| journalist article prompt | no explicit word target | "TARGET LENGTH: 1000-1500 words" |
| journalist evaluator criteria | "Is word budget reasonable?" | includes per-section ranges |

All five sources now point at the same canonical set of ranges summing to the 1000-1500 word envelope.
