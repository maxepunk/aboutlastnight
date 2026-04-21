# Post-Enrichment Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land all "do now" cleanup items surfaced during the director-notes enrichment reviews — dead code removal, doc drift fixes, XML renderer deduplication, defensive hardening, schema tightening, and test improvements — before the feature branch merges.

**Architecture:** Five task buckets in dependency order. (1) Dead-code + doc sweep (pure deletions, reduces renderer duplication from 3→2 sites). (2) Extract shared `renderDirectorEnrichmentBlock` helper (collapses remaining 2 sites into 1). (3) Rename misnomer variable. (4) Defensive hardening of enricher inputs + outputs + schema. (5) Fix one weak regression guard.

**Tech Stack:** Node.js, Jest 30, no new dependencies. All work on branch `feature/director-enrichment` in `C:/Users/spide/Documents/claudecode/aboutlastnight/.worktrees/director-enrichment/reports/`.

**Baseline:** HEAD `796d3bc`, 1121 tests passing, 1 skipped, `lib/director-enricher.js` at 100% coverage.

**Spec reference:** Triage list derived from review reports of Tasks 1-12 in the primary enrichment plan (`docs/superpowers/plans/2026-04-20-director-notes-enrichment.md`). Related prior cleanup proposals: `docs/superpowers/plans/2026-03-29-prompt-quality-simplification.md` Task 12 (never executed — rolled in here).

---

## File Structure

### New
- `lib/prompt-renderers/director-notes-renderer.js` — Single source of truth for rendering the enriched director-notes XML tag block (`<DIRECTOR_NOTES>` + `<QUOTE_BANK>` + `<TRANSACTION_LINKS>` + `<POST_INVESTIGATION_NEWS>`). Consumed by `arc-specialist-nodes.js` and `prompt-builder.js`.
- `lib/__tests__/director-notes-renderer.test.js` — Unit tests for the renderer.

### Modified — backend
- `lib/workflow/nodes/arc-specialist-nodes.js` — Delete deprecated `buildPlayerFocusGuidedPrompt` (Task 1); replace inline XML block in `buildCoreArcPrompt` + `buildArcRevisionPrompt` with calls to the new renderer (Task 2).
- `lib/prompt-builder.js` — Remove `THEME_SYSTEM_PROMPTS.{journalist,detective}.arcAnalysis` entries (Task 1); replace inline XML block in `buildArticlePrompt` with the new renderer (Task 2).
- `lib/theme-loader.js` — Remove `PHASE_REQUIREMENTS.arcAnalysis` entry + self-test demo branch (Task 1).
- `lib/workflow/nodes/contradiction-nodes.js` — Rename misnamed `behaviorPatterns` local to `proseSentences` (Task 3).
- `lib/director-enricher.js` — Add input-shape guards on `buildEnrichmentPrompt`, add verbatim-check on `enrichDirectorNotes` result, tighten `DIRECTOR_NOTES_ENRICHED_SCHEMA` with `additionalProperties: false` + integer/minimum on `proseOffset` (Task 4).

### Modified — tests
- `lib/__tests__/prompt-builder.test.js` — Remove `PHASE_REQUIREMENTS.arcAnalysis` assertion at line 317 (Task 1).
- `lib/__tests__/theme-loader.test.js` — Remove `arcAnalysis`-specific tests at lines 182, 184, 386, 396, 467 (Task 1).
- `lib/__tests__/contradiction-surfacing.test.js` — Amend `transactionReferences` test to assert on returned state instead of input state (Task 5).
- `lib/__tests__/director-enricher.test.js` — New tests for input guards, verbatim check, schema tightening (Task 4).

### Modified — docs
- `reports/CLAUDE.md` — Remove `buildArcAnalysisPrompt` from PromptBuilder method list (line 244 region).
- `.claude/skills/journalist-report/SKILL.md` — Remove `buildArcAnalysisPrompt` example (line 900 region).

### NOT touched (clarified during triage)
- `lib/workflow/nodes/input-nodes.js` `mergeDirectorOverrides` — reserved as passthrough extension point per `docs/superpowers/specs/2026-04-20-reporting-mode-explicit-input-design.md`.

---

## Task 1: Dead-code & doc sweep

**Context:** Pure deletions. No behavior change. Regression suite is the safety net.

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js`
- Modify: `lib/prompt-builder.js`
- Modify: `lib/theme-loader.js`
- Modify: `lib/__tests__/prompt-builder.test.js`
- Modify: `lib/__tests__/theme-loader.test.js`
- Modify: `reports/CLAUDE.md`
- Modify: `.claude/skills/journalist-report/SKILL.md`

- [ ] **Step 1: Baseline check**

```bash
cd C:/Users/spide/Documents/claudecode/aboutlastnight/.worktrees/director-enrichment/reports
npx jest 2>&1 | tail -3
```

Expected: `Tests: 1 skipped, 1121 passed, 1122 total`.

- [ ] **Step 2: Verify `buildPlayerFocusGuidedPrompt` has no live callers**

```bash
grep -rn "buildPlayerFocusGuidedPrompt" lib/ server.js __tests__/ 2>/dev/null
```

Expected: exactly one match — the function definition at `lib/workflow/nodes/arc-specialist-nodes.js:732`. If any other match appears, STOP and report NEEDS_CONTEXT.

- [ ] **Step 3: Delete `buildPlayerFocusGuidedPrompt`**

In `lib/workflow/nodes/arc-specialist-nodes.js`, locate the `buildPlayerFocusGuidedPrompt` function (starts line 732, marked `@deprecated Commit 8.28`). Delete:
- The JSDoc comment block immediately preceding the function (search for the `/**` above `function buildPlayerFocusGuidedPrompt`).
- The entire function body through its closing `}`.

Search for any `_testing` export that includes this function name and remove that export line.

- [ ] **Step 4: Delete `THEME_SYSTEM_PROMPTS.{journalist,detective}.arcAnalysis`**

In `lib/prompt-builder.js`, find lines 72 and 81:

Line 72 (inside `THEME_SYSTEM_PROMPTS.journalist` object):
```javascript
    arcAnalysis: 'You are analyzing narrative arcs for a NovaNews investigative article.',
```

Line 81 (inside `THEME_SYSTEM_PROMPTS.detective` object):
```javascript
    arcAnalysis: 'You are analyzing narrative threads for a detective investigation case report. Identify thematic clusters from the evidence that can be synthesized into a coherent case file.',
```

Delete both lines (including the trailing commas on the preceding line if deletion leaves a dangling comma — adjust for valid JS syntax).

- [ ] **Step 5: Delete `PHASE_REQUIREMENTS.arcAnalysis`**

In `lib/theme-loader.js`, find the `PHASE_REQUIREMENTS` object (starts ~line 13). Delete the `arcAnalysis` entry (lines 19-23):

```javascript
  arcAnalysis: [
    'evidence-boundaries',
    'narrative-structure',
    'anti-patterns'
  ],
```

- [ ] **Step 6: Delete the `arcAnalysis` branch in `theme-loader.js` self-test**

In `lib/theme-loader.js`, find the `require.main === module` self-test block around line 324:

```javascript
      const prompts = await loader.loadPhasePrompts('arcAnalysis');
      console.log(`Loaded ${Object.keys(prompts).length} prompts for arcAnalysis:`);
```

And the surrounding code that prints the arcAnalysis phase output. Delete the arcAnalysis-specific block — leave the demo's other phase calls intact (imageAnalysis, outlineGeneration, articleGeneration, validation if present).

To find the exact block: search for `'arcAnalysis'` in the file; the only remaining match after Step 5 should be in this self-test. Delete the containing `try`/`await`/log block, preserving sibling blocks for other phases.

- [ ] **Step 7: Remove `arcAnalysis` references in tests**

In `lib/__tests__/prompt-builder.test.js` line 317:

```javascript
      expect(reqs).toEqual(PHASE_REQUIREMENTS.arcAnalysis);
```

Read the surrounding context (the enclosing `it(...)` or `describe(...)` block). If the entire test is *about* verifying arcAnalysis requirements and has no other substantive assertions, delete the whole test. If the test is broader and only happens to reference arcAnalysis as one of several phases, drop that line alone.

In `lib/__tests__/theme-loader.test.js`:
- Line 182-184 region (test loading prompts for arcAnalysis): delete the whole `it(...)` block containing `loadPhasePrompts('arcAnalysis')`.
- Lines 386, 396, 467: each is an `expect(...)` that references `PHASE_REQUIREMENTS.arcAnalysis`. Read each enclosing test; if the test's sole purpose is to validate arcAnalysis presence, delete the whole test. Otherwise remove only the arcAnalysis-specific assertion, preserving other phases in the same test.

Run the theme-loader tests and prompt-builder tests to confirm remaining tests still pass:

```bash
npx jest lib/__tests__/theme-loader.test.js lib/__tests__/prompt-builder.test.js --verbose 2>&1 | tail -10
```

Expected: all remaining tests pass.

- [ ] **Step 8: Clean up documentation references**

In `reports/CLAUDE.md`, find the line around 244 that lists PromptBuilder methods:

```
- `buildArcAnalysisPrompt()`, `buildOutlinePrompt()`, `buildArticlePrompt()`
```

(Exact wording may differ — find by content.) Remove `buildArcAnalysisPrompt()` from the list. Preserve the other method names.

In `.claude/skills/journalist-report/SKILL.md`, find the line around 900 that shows `promptBuilder.buildArcAnalysisPrompt(...)` as an example call:

```javascript
  model: 'sonnet',
```

(Exact context will be a fenced code block showing the deleted method.) Replace with a current-method example — preferably `promptBuilder.buildArticlePrompt(...)` or `promptBuilder.buildOutlinePrompt(...)`. If the example is a code block specifically demonstrating arc analysis, rewrite to demonstrate article or outline generation with an equivalent shape, preserving the skill's intent.

If the context makes the deletion ambiguous, STOP and report NEEDS_CONTEXT with the surrounding 20 lines.

- [ ] **Step 9: Full regression**

```bash
npx jest 2>&1 | tail -5
```

Expected: fewer tests than baseline (some arcAnalysis-specific tests removed — probably 3-6 fewer), all passing.

Record the new count for subsequent tasks.

- [ ] **Step 10: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js lib/prompt-builder.js lib/theme-loader.js lib/__tests__/prompt-builder.test.js lib/__tests__/theme-loader.test.js CLAUDE.md .claude/skills/journalist-report/SKILL.md
git commit -m "chore: sweep dead arcAnalysis config + deprecated prompt builder + doc drift"
```

---

## Task 2: Extract shared `renderDirectorEnrichmentBlock` helper

**Context:** After Task 1, the XML tag block rendering (`<DIRECTOR_NOTES>` + optional `<QUOTE_BANK>` + `<TRANSACTION_LINKS>` + `<POST_INVESTIGATION_NEWS>`) still exists in two sites: `arc-specialist-nodes.js buildCoreArcPrompt` (`buildArcRevisionPrompt` has its own copy too — so 3 total if we count revision), and `prompt-builder.js buildArticlePrompt`. Factor into a single helper.

**Files:**
- Create: `lib/prompt-renderers/director-notes-renderer.js`
- Create: `lib/__tests__/director-notes-renderer.test.js`
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js` (`buildCoreArcPrompt` + `buildArcRevisionPrompt`)
- Modify: `lib/prompt-builder.js` (`buildArticlePrompt`)

- [ ] **Step 1: Write the failing renderer test**

Create `lib/__tests__/director-notes-renderer.test.js`:

```javascript
const { renderDirectorEnrichmentBlock } = require('../prompt-renderers/director-notes-renderer');

describe('renderDirectorEnrichmentBlock', () => {
  it('renders <DIRECTOR_NOTES> with the prose when rawProse provided', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'Vic worked the room.',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<DIRECTOR_NOTES>');
    expect(out).toContain('Vic worked the room.');
    expect(out).toContain('</DIRECTOR_NOTES>');
  });

  it('emits "(no director notes provided)" when rawProse is empty', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: '', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] });
    expect(out).toContain('(no director notes provided)');
  });

  it('emits <QUOTE_BANK> when quotes present', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<QUOTE_BANK>');
    expect(out).toContain('- Alex: "we had to act"');
    expect(out).toContain('[high]');
  });

  it('includes addressee and context in quote line when present', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', addressee: 'Mel', context: 'after unlocking a box', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('- Remi (to Mel): "do you want to trade a little" — after unlocking a box [high]');
  });

  it('emits <TRANSACTION_LINKS> when references present, formatting each linked transaction', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [{
        excerpt: 'Kai paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000', sellingTeam: 'Cass' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<TRANSACTION_LINKS>');
    expect(out).toContain('"Kai paid Blake"');
    expect(out).toContain('09:40 PM tay004 $450,000 → Cass');
    expect(out).toContain('(high)');
  });

  it('emits "no link" marker when linkedTransactions is empty', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [{ excerpt: 'ambiguous observation', linkedTransactions: [], confidence: 'low' }],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('[no link]');
    expect(out).toContain('(low)');
  });

  it('emits <POST_INVESTIGATION_NEWS> with headline, detail, subjects, and bearing', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: [{
        headline: 'Sarah named interim CEO',
        detail: 'Just been announced',
        subjects: ['Sarah'],
        bearingOnNarrative: 'power consolidation'
      }]
    });
    expect(out).toContain('<POST_INVESTIGATION_NEWS>');
    expect(out).toContain('- Sarah named interim CEO: Just been announced [subjects: Sarah] — power consolidation');
  });

  it('omits optional sections when their arrays are empty', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] });
    expect(out).not.toContain('<QUOTE_BANK>');
    expect(out).not.toContain('<TRANSACTION_LINKS>');
    expect(out).not.toContain('<POST_INVESTIGATION_NEWS>');
  });

  it('accepts missing optional arrays (undefined) without throwing', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p' });
    expect(out).toContain('<DIRECTOR_NOTES>');
    expect(out).not.toContain('<QUOTE_BANK>');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx jest lib/__tests__/director-notes-renderer.test.js -v
```

Expected: all FAIL — module not found.

- [ ] **Step 3: Create the renderer**

Create `lib/prompt-renderers/director-notes-renderer.js`:

```javascript
/**
 * Director Notes Enrichment Renderer
 *
 * Produces the XML-tagged director-notes block consumed by:
 * - lib/workflow/nodes/arc-specialist-nodes.js (buildCoreArcPrompt, buildArcRevisionPrompt)
 * - lib/prompt-builder.js (buildArticlePrompt)
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

/**
 * Render the enriched director-notes block as XML tags.
 *
 * @param {Object} ctx - Director-notes context
 * @param {string} [ctx.rawProse] - Verbatim director prose
 * @param {Array} [ctx.quotes] - Extracted quotes
 * @param {Array} [ctx.transactionReferences] - Observation → transaction links
 * @param {Array} [ctx.postInvestigationDevelopments] - Post-investigation news items
 * @returns {string} Multi-block XML-tagged string. Omits optional blocks when their arrays are empty.
 */
function renderDirectorEnrichmentBlock({
  rawProse = '',
  quotes = [],
  transactionReferences = [],
  postInvestigationDevelopments = []
} = {}) {
  const blocks = [];

  blocks.push(`<DIRECTOR_NOTES>
${rawProse || '(no director notes provided)'}
</DIRECTOR_NOTES>`);

  if (quotes.length > 0) {
    const lines = quotes.map(q =>
      `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`
    ).join('\n');
    blocks.push(`<QUOTE_BANK>
Verbatim quotes extracted from the director's prose — prefer these when citing what someone said:
${lines}
</QUOTE_BANK>`);
  }

  if (transactionReferences.length > 0) {
    const lines = transactionReferences.map(t => {
      const txs = (t.linkedTransactions || [])
        .map(tx => `${tx.timestamp} ${tx.tokenId} ${tx.amount} → ${tx.sellingTeam}`)
        .join('; ');
      return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
    }).join('\n');
    blocks.push(`<TRANSACTION_LINKS>
Behavioral observations pre-linked to specific burial transactions:
${lines}
</TRANSACTION_LINKS>`);
  }

  if (postInvestigationDevelopments.length > 0) {
    const lines = postInvestigationDevelopments.map(d =>
      `- ${d.headline}${d.detail ? `: ${d.detail}` : ''}${d.subjects?.length ? ` [subjects: ${d.subjects.join(', ')}]` : ''}${d.bearingOnNarrative ? ` — ${d.bearingOnNarrative}` : ''}`
    ).join('\n');
    blocks.push(`<POST_INVESTIGATION_NEWS>
Developments that occurred AFTER the investigation concluded — distinct epistemic status:
${lines}
</POST_INVESTIGATION_NEWS>`);
  }

  return blocks.join('\n\n');
}

module.exports = { renderDirectorEnrichmentBlock };
```

- [ ] **Step 4: Verify all renderer tests pass**

```bash
npx jest lib/__tests__/director-notes-renderer.test.js -v
```

Expected: 9 passing.

- [ ] **Step 5: Replace inline block in `buildCoreArcPrompt`**

In `lib/workflow/nodes/arc-specialist-nodes.js`, locate `buildCoreArcPrompt` (around line 150). Find the `### Director Observations` block starting with:

```
### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
The director's prose below is the AUTHORITATIVE source. Use it to ground arcs in behavioral reality.

<DIRECTOR_NOTES>
${context.directorProse || '(no director notes provided)'}
</DIRECTOR_NOTES>
```

…through the end of the `<POST_INVESTIGATION_NEWS>` conditional (ending with the closing template-literal tag `'' : ''`).

Replace the **entire multi-section block** (the <DIRECTOR_NOTES> + conditional QUOTE_BANK + TRANSACTION_LINKS + POST_INVESTIGATION_NEWS part, but KEEP the preamble `### Director Observations (GROUND TRUTH - ...)`) with a single call:

```
### Director Observations (GROUND TRUTH - Director witnessed these behaviors)
The director's prose below is the AUTHORITATIVE source. Use it to ground arcs in behavioral reality.

${renderDirectorEnrichmentBlock({
  rawProse: context.directorProse,
  quotes: context.directorQuotes,
  transactionReferences: context.directorTransactionLinks,
  postInvestigationDevelopments: context.directorPostInvestigation
})}
```

At the top of `arc-specialist-nodes.js`, add the import near the other requires:

```javascript
const { renderDirectorEnrichmentBlock } = require('../../prompt-renderers/director-notes-renderer');
```

- [ ] **Step 6: Replace inline block in `buildArcRevisionPrompt`**

Still in `lib/workflow/nodes/arc-specialist-nodes.js`, find `buildArcRevisionPrompt` and its Director Observations block (structurally identical to Step 5 but using local `directorProse` / `directorQuotes` / `directorTxRefs` / `directorPostInv` variables instead of `context.*`).

Replace the multi-section XML block with:

```javascript
${renderDirectorEnrichmentBlock({
  rawProse: directorProse,
  quotes: directorQuotes,
  transactionReferences: directorTxRefs,
  postInvestigationDevelopments: directorPostInv
})}
```

Keep any surrounding preamble text (e.g. "The director's prose below is the AUTHORITATIVE source.") unchanged.

- [ ] **Step 7: Replace inline block in `buildArticlePrompt`**

In `lib/prompt-builder.js`, find `buildArticlePrompt` (around line 600+). Locate the enriched director-notes block — it starts with:

```javascript
${(directorNotes?.rawProse) ? `
<INVESTIGATION_OBSERVATIONS>
```

…and spans through the four conditional tags ending at `</POST_INVESTIGATION_NEWS>` (the four interpolations after `<INVESTIGATION_OBSERVATIONS>`, each a conditional ternary).

Replace the entire `<INVESTIGATION_OBSERVATIONS>` block + the three conditional blocks that follow with:

```javascript
${directorNotes?.rawProse ? `<INVESTIGATION_OBSERVATIONS>
What you observed during the investigation this morning.
These ground your behavioral claims — who you saw talking to whom, notable moments, patterns you noticed.

${renderDirectorEnrichmentBlock({
  rawProse: directorNotes.rawProse,
  quotes: directorNotes.quotes,
  transactionReferences: directorNotes.transactionReferences,
  postInvestigationDevelopments: directorNotes.postInvestigationDevelopments
})}
</INVESTIGATION_OBSERVATIONS>` : ''}
```

At the top of `lib/prompt-builder.js`, add the import near the other requires:

```javascript
const { renderDirectorEnrichmentBlock } = require('./prompt-renderers/director-notes-renderer');
```

- [ ] **Step 8: Run consuming tests**

```bash
npx jest lib/__tests__/arc-specialist-prompts.test.js lib/__tests__/prompt-builder.test.js lib/__tests__/director-notes-renderer.test.js --verbose 2>&1 | tail -20
```

Expected: all pass. If any assertion breaks because the new renderer formats a line marginally differently, read the failing assertion and adjust the renderer template string to match the original output byte-for-byte (the existing tests encode the contract).

- [ ] **Step 9: Full regression**

```bash
npx jest 2>&1 | tail -3
```

Expected: grand total same or slightly higher than Task 1's closing count (+9 from the new renderer tests).

- [ ] **Step 10: Commit**

```bash
git add lib/prompt-renderers/director-notes-renderer.js lib/__tests__/director-notes-renderer.test.js lib/workflow/nodes/arc-specialist-nodes.js lib/prompt-builder.js
git commit -m "refactor(enrichment): extract renderDirectorEnrichmentBlock helper (dedupe 3 call sites)"
```

---

## Task 3: Rename `behaviorPatterns` → `proseSentences` in contradiction-nodes

**Context:** After Task 8 of the primary enrichment plan, the local `behaviorPatterns` variable in `contradiction-nodes.js` now holds generic prose sentences from the raw-prose split, not bucketed behavior patterns. Rename for accuracy.

**Files:**
- Modify: `lib/workflow/nodes/contradiction-nodes.js`

- [ ] **Step 1: Read current state**

```bash
cd C:/Users/spide/Documents/claudecode/aboutlastnight/.worktrees/director-enrichment/reports
grep -n "behaviorPatterns" lib/workflow/nodes/contradiction-nodes.js
```

Expected: exactly four lines — the declaration, and three usages in the filter/map logic (approximately lines 24-67, moved slightly after Task 8).

- [ ] **Step 2: Apply the rename**

In `lib/workflow/nodes/contradiction-nodes.js`, search for these exact patterns and rename:

Declaration line (currently):
```javascript
  const behaviorPatterns = rawProse
```
→ rename to `proseSentences`:
```javascript
  const proseSentences = rawProse
```

Transparency-match block (currently):
```javascript
    const transparencyNotes = behaviorPatterns.filter(p => {
```
→ rename:
```javascript
    const transparencyNotes = proseSentences.filter(p => {
```

Blake-proximity block (currently):
```javascript
  const blakeProximity = behaviorPatterns.filter(p =>
```
→ rename:
```javascript
  const blakeProximity = proseSentences.filter(p =>
```

Ensure no `behaviorPatterns` identifier remains in the file.

- [ ] **Step 3: Verify tests pass**

```bash
npx jest lib/__tests__/contradiction-surfacing.test.js lib/__tests__/contradiction-prompt.test.js --verbose 2>&1 | tail -10
```

Expected: all pass. The test file uses `directorNotes.rawProse` inputs, not the internal variable name, so the rename is transparent to tests.

- [ ] **Step 4: Full regression sanity**

```bash
npx jest 2>&1 | tail -3
```

Expected: same count as after Task 2.

- [ ] **Step 5: Commit**

```bash
git add lib/workflow/nodes/contradiction-nodes.js
git commit -m "chore: rename behaviorPatterns → proseSentences in contradiction-nodes"
```

---

## Task 4: Harden enricher inputs, verbatim check, and schema

**Context:** Three small hardening changes in `lib/director-enricher.js` to tighten contracts and defend against silent failure modes.

**Files:**
- Modify: `lib/director-enricher.js`
- Modify: `lib/__tests__/director-enricher.test.js`

- [ ] **Step 1: Write failing tests**

Append to `lib/__tests__/director-enricher.test.js` (end of file):

```javascript
describe('buildEnrichmentPrompt — defensive input guards', () => {
  it('accepts accusation.accused as a string and coerces to array', () => {
    const { userPrompt } = buildEnrichmentPrompt({
      rawProse: 'p',
      accusation: { accused: 'Morgan', charge: 'Murder' }
    });
    expect(userPrompt).toContain('Accused: Morgan');
  });

  it('accepts roster as non-array by coercing to empty', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', roster: null });
    expect(userPrompt).toContain('<ROSTER>\n(none provided)\n</ROSTER>');
  });

  it('accepts npcs as non-array by coercing to empty', () => {
    const { userPrompt } = buildEnrichmentPrompt({ rawProse: 'p', npcs: null });
    expect(userPrompt).toContain('<NPCS>\n(none)\n</NPCS>');
  });
});

describe('enrichDirectorNotes — verbatim check', () => {
  it('falls back when SDK returns a non-verbatim rawProse', async () => {
    const input = 'Vic worked the room.';
    const sdk = jest.fn().mockResolvedValue({
      rawProse: 'Vic worked the room (summarized).',  // not verbatim
      characterMentions: {}, entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [], transactionReferences: [], postInvestigationDevelopments: []
    });

    const result = await enrichDirectorNotes({ rawProse: input, roster: [] }, sdk);
    expect(result.rawProse).toBe(input);  // fallback preserves original
    expect(result.characterMentions).toEqual({});  // fallback empties enrichments
  });

  it('accepts SDK result when rawProse matches exactly', async () => {
    const input = 'Vic worked the room.';
    const sdk = jest.fn().mockResolvedValue({
      rawProse: input,
      characterMentions: { Vic: [{ excerpt: 'Vic worked the room.' }] },
      entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes: [], transactionReferences: [], postInvestigationDevelopments: []
    });

    const result = await enrichDirectorNotes({ rawProse: input, roster: [] }, sdk);
    expect(result.rawProse).toBe(input);
    expect(result.characterMentions).toEqual({ Vic: [{ excerpt: 'Vic worked the room.' }] });
  });
});

describe('DIRECTOR_NOTES_ENRICHED_SCHEMA — tightened constraints', () => {
  it('declares additionalProperties: false at the top level', () => {
    expect(DIRECTOR_NOTES_ENRICHED_SCHEMA.additionalProperties).toBe(false);
  });

  it('declares proseOffset as integer with minimum 0 on characterMentions items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.characterMentions.additionalProperties.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on transactionReferences items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.transactionReferences.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on quotes items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.quotes.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });

  it('declares proseOffset as integer with minimum 0 on postInvestigationDevelopments items', () => {
    const prop = DIRECTOR_NOTES_ENRICHED_SCHEMA.properties.postInvestigationDevelopments.items.properties.proseOffset;
    expect(prop.type).toBe('integer');
    expect(prop.minimum).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx jest lib/__tests__/director-enricher.test.js -v 2>&1 | tail -15
```

Expected: the 10 new tests FAIL.

- [ ] **Step 3: Add input guards to `buildEnrichmentPrompt`**

In `lib/director-enricher.js`, locate `buildEnrichmentPrompt`. Update the destructuring block and the locals assembly:

Find:
```javascript
function buildEnrichmentPrompt({
  rawProse,
  roster = [],
  accusation = null,
  npcs = [],
  shellAccounts = [],
  detectiveEvidenceLog = [],
  scoringTimeline = []
}) {
  const rosterBlock = roster.length > 0 ? roster.join(', ') : '(none provided)';
  const accusationBlock = accusation
    ? `Accused: ${(accusation.accused || []).join(', ') || 'unspecified'}\nCharge: ${accusation.charge || 'unspecified'}`
    : '(none provided)';
  const npcsBlock = npcs.length > 0 ? npcs.join(', ') : '(none)';
  const shellAccountsBlock = shellAccounts.length > 0
    ? JSON.stringify(shellAccounts, null, 2)
    : '(none)';
  const evidenceLogBlock = detectiveEvidenceLog.length > 0
    ? JSON.stringify(detectiveEvidenceLog, null, 2)
    : '(none)';
  const timelineBlock = scoringTimeline.length > 0
    ? JSON.stringify(scoringTimeline, null, 2)
    : '(none)';
```

Replace with:
```javascript
function buildEnrichmentPrompt({
  rawProse,
  roster,
  accusation = null,
  npcs,
  shellAccounts,
  detectiveEvidenceLog,
  scoringTimeline
} = {}) {
  // Coerce any non-array input to an empty array for safe downstream handling
  const rosterArr = Array.isArray(roster) ? roster : [];
  const npcsArr = Array.isArray(npcs) ? npcs : [];
  const shellAccountsArr = Array.isArray(shellAccounts) ? shellAccounts : [];
  const evidenceLogArr = Array.isArray(detectiveEvidenceLog) ? detectiveEvidenceLog : [];
  const timelineArr = Array.isArray(scoringTimeline) ? scoringTimeline : [];

  const rosterBlock = rosterArr.length > 0 ? rosterArr.join(', ') : '(none provided)';

  // accusation.accused may arrive as string, array, or missing
  const accusedValue = accusation?.accused;
  const accusedStr = Array.isArray(accusedValue)
    ? (accusedValue.join(', ') || 'unspecified')
    : (typeof accusedValue === 'string' && accusedValue.trim() ? accusedValue : 'unspecified');
  const accusationBlock = accusation
    ? `Accused: ${accusedStr}\nCharge: ${accusation.charge || 'unspecified'}`
    : '(none provided)';

  const npcsBlock = npcsArr.length > 0 ? npcsArr.join(', ') : '(none)';
  const shellAccountsBlock = shellAccountsArr.length > 0
    ? JSON.stringify(shellAccountsArr, null, 2)
    : '(none)';
  const evidenceLogBlock = evidenceLogArr.length > 0
    ? JSON.stringify(evidenceLogArr, null, 2)
    : '(none)';
  const timelineBlock = timelineArr.length > 0
    ? JSON.stringify(timelineArr, null, 2)
    : '(none)';
```

The rest of the function body remains unchanged. The default-to-empty-array destructuring behavior is preserved for existing callers; the new coercion handles `null` and non-arrays explicitly.

- [ ] **Step 4: Add verbatim check in `enrichDirectorNotes`**

In the same file, locate `enrichDirectorNotes`. Find the block after the SDK call:

```javascript
    if (!result || typeof result.rawProse !== 'string') {
      console.warn('[enrichDirectorNotes] SDK returned invalid result; falling back');
      return createFallback(rawProse);
    }
```

Replace with:

```javascript
    if (!result || typeof result.rawProse !== 'string') {
      console.warn('[enrichDirectorNotes] SDK returned invalid result; falling back');
      return createFallback(rawProse);
    }

    if (result.rawProse !== rawProse) {
      console.warn('[enrichDirectorNotes] SDK returned non-verbatim rawProse; falling back to preserve source prose');
      return createFallback(rawProse);
    }
```

- [ ] **Step 5: Tighten schema**

In the same file, update `DIRECTOR_NOTES_ENRICHED_SCHEMA`.

Add `additionalProperties: false` as a top-level property (immediately after `properties: { ... }`):

```javascript
const DIRECTOR_NOTES_ENRICHED_SCHEMA = {
  type: 'object',
  required: ['rawProse'],
  additionalProperties: false,  // ADD THIS LINE
  properties: {
    // ... existing properties ...
  }
};
```

Change every `proseOffset` field from:
```javascript
            proseOffset: { type: 'number', description: '...' },
```
to:
```javascript
            proseOffset: { type: 'integer', minimum: 0, description: '...' },
```

There are **4 occurrences** of `proseOffset`:
- Inside `characterMentions.additionalProperties.items.properties` (line ~28)
- Inside `transactionReferences.items.properties` (line ~74)
- Inside `quotes.items.properties` (line ~100)
- Inside `postInvestigationDevelopments.items.properties` (line ~115)

Update all four. Keep each field's existing `description`.

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx jest lib/__tests__/director-enricher.test.js -v 2>&1 | tail -15
```

Expected: all pass (including the 10 new tests).

- [ ] **Step 7: Full regression**

```bash
npx jest 2>&1 | tail -3
```

Expected: grand total higher than Task 3 by 10 (the new tests).

- [ ] **Step 8: Commit**

```bash
git add lib/director-enricher.js lib/__tests__/director-enricher.test.js
git commit -m "refactor(enrichment): harden buildEnrichmentPrompt inputs, verbatim rawProse check, tighten schema"
```

---

## Task 5: Strengthen contradiction-nodes transactionReferences regression test

**Context:** Task 8's added test for `transactionReferences` asserts on the input state (`state.directorNotes.transactionReferences[0].linkedTransactions[0].tokenId`) instead of the returned state. As a regression guard it's weak — it wouldn't catch a future refactor that shallow-copies directorNotes and drops the tx refs. Strengthen the assertion.

Note: the current node `surfaceContradictions` does not return `directorNotes` in its output — it only returns `narrativeTensions`. The weak test documented this contract. Strengthening requires either (a) asserting the node's actual behavior (tensions fire correctly on state that includes tx refs), or (b) adding a future-facing assertion that the node does NOT mutate the input tx refs.

We'll use approach (a) + (b): assert that the node produces tensions correctly AND that tx refs pass through state unmodified. This catches both regressions: if the node accidentally consumes tx refs, or if a refactor adds tx-ref-aware tension logic incorrectly.

**Files:**
- Modify: `lib/__tests__/contradiction-surfacing.test.js`

- [ ] **Step 1: Read current test**

```bash
cd C:/Users/spide/Documents/claudecode/aboutlastnight/.worktrees/director-enrichment/reports
grep -n "transactionReferences from enriched notes" lib/__tests__/contradiction-surfacing.test.js
```

Note the line number of the test's opening `test(...)`.

- [ ] **Step 2: Replace the weak assertions**

In `lib/__tests__/contradiction-surfacing.test.js`, locate the test `transactionReferences from enriched notes are available in state for downstream use`. The assertion block currently looks like:

```javascript
  const result = surfaceContradictions(state);
  expect(result.narrativeTensions).toBeDefined();
  // transactionReferences pass through state unchanged (not consumed by this node directly)
  expect(state.directorNotes.transactionReferences[0].linkedTransactions[0].tokenId).toBe('tay004');
});
```

Replace with:

```javascript
  const originalTxRefs = JSON.parse(JSON.stringify(state.directorNotes.transactionReferences));
  const result = surfaceContradictions(state);

  // Node correctly produces tensions (Kai's Blake-proximity flag)
  expect(result.narrativeTensions).toBeDefined();
  expect(result.narrativeTensions.tensions.length).toBeGreaterThan(0);
  const blakeTension = result.narrativeTensions.tensions.find(t => t.type === 'blake-proximity');
  expect(blakeTension).toBeDefined();

  // Node does NOT mutate transactionReferences on the input state
  expect(state.directorNotes.transactionReferences).toEqual(originalTxRefs);

  // Node does NOT expose transactionReferences on its output (current contract — pure pass-through)
  expect(result.directorNotes).toBeUndefined();
});
```

- [ ] **Step 3: Run the contradiction test**

```bash
npx jest lib/__tests__/contradiction-surfacing.test.js --verbose 2>&1 | tail -10
```

Expected: all pass (including the strengthened test).

If the `blake-proximity` assertion fails, re-read the test fixture's `rawProse`. The seed prose is `'Kai was seen with Blake.'` — the `surfaceContradictions` logic (line ~65 in `contradiction-nodes.js`) looks for sentence fragments containing `'blake'` or `'valet'`. A single sentence containing "Blake" should satisfy the filter. If not, update the fixture's `rawProse` to `'Kai was seen with Blake. They lingered near the valet.'` so the Blake match is unambiguous.

- [ ] **Step 4: Full regression**

```bash
npx jest 2>&1 | tail -3
```

Expected: count unchanged (same number of tests, one just got stronger).

- [ ] **Step 5: Commit**

```bash
git add lib/__tests__/contradiction-surfacing.test.js
git commit -m "test: strengthen contradiction-nodes transactionReferences regression assertions"
```

---

## Out of scope (deferred per triage)

Addressed in a separate future plan:
- **C2** (Dr./Mr. abbreviation split in `contradiction-nodes`): fix only if empirical transparency-check misses surface.
- **D3** (`kind` enum on characterMentions): defer to post-Task-13 empirical tuning.
- **D4** (soften post-investigation marker list): defer to post-Task-13 empirical tuning.
- **E1-E6** (UI polish — max-height, border-radius, keys, missing-field guards, etc.): address if user feedback surfaces.
- **F2** (`prompt-builder.test.js` beforeEach consistency): cosmetic, defer.
- **G1-G3** (prompt-quality empirical concerns): resolve after Task 13 of the primary plan runs against real 0411/0417 sessions.

---

## Commit cadence

Expected commits, in order:
1. `chore: sweep dead arcAnalysis config + deprecated prompt builder + doc drift`
2. `refactor(enrichment): extract renderDirectorEnrichmentBlock helper (dedupe 3 call sites)`
3. `chore: rename behaviorPatterns → proseSentences in contradiction-nodes`
4. `refactor(enrichment): harden buildEnrichmentPrompt inputs, verbatim rawProse check, tighten schema`
5. `test: strengthen contradiction-nodes transactionReferences regression assertions`
