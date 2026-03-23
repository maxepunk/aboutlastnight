# Pipeline Reliability Fixes: 0306 Session Post-Mortem

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 reliability issues discovered in the 0306 production run: double evidence curation on checkpoint resume, buried memory content as latent leak risk, LangSmith trace payload overflow, and Haiku structured output failures.

**Architecture:** Apply SRP checkpoint pattern to evidence curation (split data+interrupt node), strip buried fullContent at preprocessor boundary, add `process_outputs` filters to LangSmith tracers, and relax Haiku schemas for structured output reliability.

**Tech Stack:** Node.js, Jest, LangGraph state, Claude Agent SDK (sdkQuery), LangSmith traceable

---

## Issue Summary

| # | Issue | Severity | Root Cause | Impact |
|---|-------|----------|------------|--------|
| 1 | Double evidence curation on resume | HIGH | `curateEvidenceBundle` combines data+interrupt; `interrupt()` throws before state saves | Wastes ~30s of Sonnet API calls on every checkpoint resume |
| 2 | Buried memory fullContent preserved | MEDIUM | `evidence-preprocessor.js` preserves fullContent for all items regardless of disposition | Latent leak risk — any code accessing preprocessedEvidence directly would expose buried narrative content |
| 3 | LangSmith trace overflow | MEDIUM | `node-tracer.js` and `llm-tracer.js` define `process_inputs` but no `process_outputs` | Full node outputs (274MB cumulative) sent to LangSmith, exceeding 26MB limit |
| 4 | Haiku structured output failures | LOW | `emotionalTone` enum too narrow, `enrichedNarrativeMoment` always required, `excludeReason` unconstrained | Photo enrichment retries 5x, paper scoring produces inconsistent exclusion reasons |

## Cross-Cutting Concerns

- **Tasks 1 and 2** both touch the evidence pipeline but different files (ai-nodes.js vs evidence-preprocessor.js). Task 1 also requires graph.js and checkpoint-nodes.js changes.
- **Tasks 3a and 3b** are identical patterns in two tracer files — implement together.
- **Tasks 4a, 4b, 4c** are schema-only changes in photo-nodes.js and ai-nodes.js — independent of each other.
- **No dependency between groups.** All 4 issues can be worked in any order.

## Recommended Order

1 → 2 → 3 → 4 (highest impact first, then defense-in-depth, then observability, then schema polish)

---

## Task 1: Split Evidence Curation into Data Node + Checkpoint Node (SRP)

**Why:** When `curateEvidenceBundle` calls `interrupt()`, it throws `GraphInterrupt` before the `return` statement executes. The evidenceBundle is never saved to state. On resume, the skip guard (`if (state.evidenceBundle)`) fails and full curation re-runs — wasting ~30s of batched Sonnet API calls.

**The working pattern** (arcs): `analyzeArcs` → `evaluateArcs` → `checkpointArcSelection` — data generation and checkpoint are separate nodes, so state saves between them.

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:290-483` (remove interrupt from curateEvidenceBundle)
- Modify: `lib/workflow/nodes/checkpoint-nodes.js` (add checkpointEvidenceAndPhotos)
- Modify: `lib/workflow/nodes/index.js` (export new node)
- Modify: `lib/workflow/graph.js:358-359,500-504` (add node, update edges)
- Test: `lib/__tests__/evidence-curation-srp.test.js` (new)

### Step 1: Write the failing test

```javascript
// lib/__tests__/evidence-curation-srp.test.js
const { _testing } = require('../workflow/nodes/ai-nodes');

describe('curateEvidenceBundle SRP', () => {
  test('curateEvidenceBundle does NOT call interrupt()', async () => {
    // If curateEvidenceBundle still calls interrupt(), it will throw GraphInterrupt
    // A properly split node should return state without interrupting
    const { curateEvidenceBundle } = _testing || {};

    // If curateEvidenceBundle is not in _testing, check the main export
    const nodes = require('../workflow/nodes/ai-nodes');
    const nodeFn = nodes._testing?.curateEvidenceBundlePure || nodes.curateEvidenceBundle;

    // Mock minimal state with preprocessed evidence
    const state = {
      preprocessedEvidence: {
        items: [],  // Empty items = creates empty bundle without SDK calls
        playerFocus: {}
      },
      sessionId: 'test-session'
    };

    const config = {
      configurable: {
        sdkClient: jest.fn()
      }
    };

    // Should NOT throw GraphInterrupt — just return evidenceBundle
    const result = await nodeFn(state, config);
    expect(result.evidenceBundle).toBeDefined();
    expect(result.evidenceBundle.exposed).toBeDefined();
    expect(result.evidenceBundle.buried).toBeDefined();
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx jest lib/__tests__/evidence-curation-srp.test.js --no-coverage`
Expected: FAIL — curateEvidenceBundle currently calls `interrupt()` which throws `GraphInterrupt`

### Step 3: Remove interrupt from curateEvidenceBundle

In `lib/workflow/nodes/ai-nodes.js`, find the `curateEvidenceBundle` function. Remove the `checkpointInterrupt()` call (lines ~472-476) and keep the return statement as-is. Also remove the empty-bundle interrupt (lines ~324-329).

**Before** (lines 471-482):
```javascript
  // Interrupt for evidence approval - user reviews evidence bundle and photos
  checkpointInterrupt(
    CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
    { evidenceBundle, _excludedItemsCache },
    null  // No skip - always pause for approval after curation
  );

  return {
    evidenceBundle,
    _excludedItemsCache,
    currentPhase: PHASES.CURATE_EVIDENCE
  };
```

**After:**
```javascript
  // State saves after this return. Checkpoint is in separate checkpointEvidenceAndPhotos node.
  return {
    evidenceBundle,
    _excludedItemsCache,
    currentPhase: PHASES.CURATE_EVIDENCE
  };
```

Do the same for the empty-bundle case (lines ~324-334) — remove the `checkpointInterrupt()` call, keep the return.

**Before** (lines 324-334):
```javascript
    // Interrupt for evidence approval - user reviews evidence bundle and photos
    checkpointInterrupt(
      CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
      { evidenceBundle: emptyBundle },
      null  // No skip - always pause for approval after curation
    );

    return {
      evidenceBundle: emptyBundle,
      currentPhase: PHASES.CURATE_EVIDENCE
    };
```

**After:**
```javascript
    // State saves after this return. Checkpoint is in separate checkpointEvidenceAndPhotos node.
    return {
      evidenceBundle: emptyBundle,
      currentPhase: PHASES.CURATE_EVIDENCE
    };
```

Also remove the `checkpointInterrupt` and `CHECKPOINT_TYPES` imports from the top of the function IF they're no longer used elsewhere in this file. Check first — other functions in this file may use them.

### Step 4: Add checkpointEvidenceAndPhotos to checkpoint-nodes.js

Add this function to `lib/workflow/nodes/checkpoint-nodes.js`, following the same pattern as `checkpointArcSelection`:

```javascript
/**
 * Evidence and Photos Checkpoint
 *
 * Pauses for user to review curated three-layer evidence bundle and photo analyses.
 * Handles rescue of excluded paper evidence items.
 * Requires: state.evidenceBundle (from curateEvidenceBundle)
 *
 * SRP: This node contains ONLY the interrupt. Data generation happens in curateEvidenceBundle.
 *
 * @param {Object} state - Current state with evidenceBundle, _excludedItemsCache
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with rescue items if any
 */
async function checkpointEvidenceAndPhotos(state, config) {
  // Skip if already approved (resume case — evidenceBundle exists AND we've passed this before)
  const skipCondition = state._evidenceApproved ? state.evidenceBundle : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
    {
      evidenceBundle: state.evidenceBundle,
      _excludedItemsCache: state._excludedItemsCache
    },
    skipCondition
  );

  // Process rescue items if user specified any
  const rescuedItems = resumeValue?.rescuedItems || [];

  return {
    _rescuedItems: rescuedItems,
    _evidenceApproved: true,
    currentPhase: PHASES.CURATE_EVIDENCE
  };
}
```

Add to the module.exports at the bottom of checkpoint-nodes.js:
```javascript
checkpointEvidenceAndPhotos: traceNode(checkpointEvidenceAndPhotos, 'checkpointEvidenceAndPhotos'),
```

### Step 5: Export from index.js

In `lib/workflow/nodes/index.js`, add the new checkpoint node export. It should already be picked up if checkpoint-nodes.js is re-exported via spread, but verify.

### Step 6: Update graph.js edges

In `lib/workflow/graph.js`:

**Add the new node** (near line 359):
```javascript
builder.addNode('checkpointEvidenceAndPhotos', nodes.checkpointEvidenceAndPhotos);
```

**Update edges** (near lines 500-504):
```javascript
// Before:
builder.addEdge('checkpointPreCuration', 'curateEvidenceBundle');
// ...
builder.addEdge('curateEvidenceBundle', 'processRescuedItems');

// After:
builder.addEdge('checkpointPreCuration', 'curateEvidenceBundle');
builder.addEdge('curateEvidenceBundle', 'checkpointEvidenceAndPhotos');  // NEW: data → checkpoint
builder.addEdge('checkpointEvidenceAndPhotos', 'processRescuedItems');   // checkpoint → rescue
```

Remove the old direct edge from `curateEvidenceBundle` to `processRescuedItems`.

### Step 7: Add `_evidenceApproved` to state annotations

In `lib/workflow/state.js`, add to the annotation:
```javascript
_evidenceApproved: { default: () => false, reducer: (_, v) => v },
```

### Step 8: Run test to verify it passes

Run: `npx jest lib/__tests__/evidence-curation-srp.test.js --no-coverage`
Expected: PASS

### Step 9: Run full test suite

Run: `npx jest --no-coverage`
Expected: All tests pass. If any checkpoint-related tests break, update them to account for the new node.

### Step 10: Commit

```bash
git add lib/workflow/nodes/ai-nodes.js lib/workflow/nodes/checkpoint-nodes.js lib/workflow/nodes/index.js lib/workflow/graph.js lib/workflow/state.js lib/__tests__/evidence-curation-srp.test.js
git commit -m "$(cat <<'EOF'
fix: split evidence curation into data node + checkpoint node (SRP)

curateEvidenceBundle called interrupt() before return, so evidenceBundle
never saved to state. On resume, full curation re-ran (~30s Sonnet calls
wasted). Now follows the same SRP pattern as arc analysis: data generation
in curateEvidenceBundle, interrupt in checkpointEvidenceAndPhotos.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Strip fullContent from Buried Items at Preprocessor Boundary

**Why:** `evidence-preprocessor.js` preserves `fullContent` for ALL items including buried tokens. While `routeTokensByDisposition` in `node-helpers.js` correctly strips buried content when building the evidence bundle, the preprocessed state (`state.preprocessedEvidence`) retains it. Any future code accessing preprocessed items directly could leak buried narrative content.

**Defense-in-depth:** Strip at the source so the invariant is enforced regardless of downstream code.

**Files:**
- Modify: `lib/evidence-preprocessor.js:336-342,376-382,490-498` (3 locations)
- Test: `lib/__tests__/evidence-preprocessor.test.js` (add test)

### Step 1: Write the failing test

Add to existing test file or create new:

```javascript
// lib/__tests__/evidence-preprocessor-buried.test.js
describe('EvidencePreprocessor buried content stripping', () => {
  test('buried items should NOT have fullContent after preprocessing', async () => {
    const { EvidencePreprocessor } = require('../evidence-preprocessor');

    const preprocessor = new EvidencePreprocessor({
      sdkClient: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'buried-token-1',
            summary: 'A buried transaction',
            characterRefs: [],
            tags: []
          }
        ]
      })
    });

    const result = await preprocessor.preprocess({
      memoryTokens: [{
        id: 'buried-token-1',
        disposition: 'buried',
        content: 'This is sensitive buried narrative content that should NOT be preserved',
        rawData: {
          fullDescription: 'Full secret content about buried memories',
          name: 'Buried Token',
          shellAccount: 'Cayman',
          transactionAmount: 150000
        }
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const buriedItem = result.items.find(i => i.id === 'buried-token-1');
    expect(buriedItem).toBeDefined();
    expect(buriedItem.disposition).toBe('buried');
    // fullContent should be stripped for buried items
    expect(buriedItem.fullContent).toBeUndefined();
    // Transaction metadata should be preserved
    expect(buriedItem.shellAccount).toBe('Cayman');
    expect(buriedItem.transactionAmount).toBe(150000);
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx jest lib/__tests__/evidence-preprocessor-buried.test.js --no-coverage`
Expected: FAIL — `buriedItem.fullContent` will be defined (currently preserved for all items)

### Step 3: Implement the fix

In `lib/evidence-preprocessor.js`, modify the 3 locations where fullContent is unconditionally preserved:

**Location 1** (line ~342, main merge path):

Before:
```javascript
          // PHASE 1 FIX: Preserve full content for article generation quotes
          fullContent: rawFullContent,
```

After:
```javascript
          // Preserve full content for EXPOSED items only (defense-in-depth)
          // Buried items must not carry narrative content — only transaction metadata
          ...(original.disposition !== 'buried' ? { fullContent: rawFullContent } : {}),
```

**Location 2** (line ~382, fallback path):

Before:
```javascript
        // PHASE 1 FIX: Preserve full content for article generation quotes
        fullContent: rawFullContent,
```

After:
```javascript
        // Preserve full content for EXPOSED items only (defense-in-depth)
        ...(item.disposition !== 'buried' ? { fullContent: rawFullContent } : {}),
```

**Location 3** (line ~498, mock data path):

Before:
```javascript
        // PHASE 1 FIX: Include fullContent for verbatim quoting
        fullContent: token.content || token.description || `Mock full content for token ${i + 1}`,
```

After:
```javascript
        // Include fullContent for verbatim quoting (exposed items only)
        ...(token.disposition !== 'buried' ? {
          fullContent: token.content || token.description || `Mock full content for token ${i + 1}`
        } : {}),
```

### Step 4: Run test to verify it passes

Run: `npx jest lib/__tests__/evidence-preprocessor-buried.test.js --no-coverage`
Expected: PASS

### Step 5: Run full test suite

Run: `npx jest --no-coverage`
Expected: All tests pass

### Step 6: Commit

```bash
git add lib/evidence-preprocessor.js lib/__tests__/evidence-preprocessor-buried.test.js
git commit -m "$(cat <<'EOF'
fix: strip fullContent from buried items at preprocessor boundary

Defense-in-depth fix: evidence-preprocessor.js preserved fullContent for
ALL items including buried tokens. While routeTokensByDisposition strips
buried content downstream, this ensures the invariant is enforced at the
source. Buried items now carry only transaction metadata, never narrative.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add process_outputs to LangSmith Tracers

**Why:** Both `node-tracer.js` and `llm-tracer.js` define `process_inputs` to filter inputs but have no `process_outputs`. LangSmith captures full function outputs by default. Node outputs grow from 28MB to 274MB cumulatively across 37+ nodes, exceeding the 26MB per-field limit.

**Files:**
- Modify: `lib/observability/node-tracer.js:36-72`
- Modify: `lib/observability/llm-tracer.js:66-107,127-154,174-188`
- Test: `lib/__tests__/observability-tracers.test.js` (new)

### Step 1: Write the failing test

```javascript
// lib/__tests__/observability-tracers.test.js

// Mock langsmith before requiring modules
jest.mock('langsmith/traceable', () => ({
  traceable: (fn, opts) => {
    // Store the options so tests can inspect them
    fn._traceOptions = opts;
    return fn;
  }
}));

describe('LangSmith tracer output filtering', () => {
  beforeEach(() => {
    process.env.LANGSMITH_TRACING = 'true';
    // Clear module cache to re-evaluate with tracing enabled
    jest.resetModules();
    jest.mock('langsmith/traceable', () => ({
      traceable: (fn, opts) => {
        fn._traceOptions = opts;
        return fn;
      }
    }));
  });

  afterEach(() => {
    delete process.env.LANGSMITH_TRACING;
  });

  test('traceNode should define process_outputs', () => {
    const { traceNode } = require('../observability/node-tracer');
    const tracedFn = traceNode(async () => ({}), 'testNode');
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
    expect(typeof tracedFn._traceOptions.process_outputs).toBe('function');
  });

  test('traceNode process_outputs truncates large objects', () => {
    const { traceNode } = require('../observability/node-tracer');
    const tracedFn = traceNode(async () => ({}), 'testNode');
    const processOutputs = tracedFn._traceOptions.process_outputs;

    // Simulate a large output (e.g., assembledHtml with 100KB of content)
    const largeOutput = {
      assembledHtml: 'x'.repeat(100000),
      contentBundle: { headline: 'Test', sections: [] },
      currentPhase: 'complete'
    };

    const filtered = processOutputs(largeOutput);
    // assembledHtml should be truncated
    expect(filtered.assembledHtml.length).toBeLessThan(5000);
    // currentPhase should be preserved as-is (small value)
    expect(filtered.currentPhase).toBe('complete');
  });

  test('createTracedSdkQuery should define process_outputs', () => {
    const { createTracedSdkQuery } = require('../observability/llm-tracer');
    const tracedFn = createTracedSdkQuery(async () => ({}));
    expect(tracedFn._traceOptions).toBeDefined();
    expect(tracedFn._traceOptions.process_outputs).toBeDefined();
    expect(typeof tracedFn._traceOptions.process_outputs).toBe('function');
  });
});
```

### Step 2: Run test to verify it fails

Run: `npx jest lib/__tests__/observability-tracers.test.js --no-coverage`
Expected: FAIL — `process_outputs` is undefined

### Step 3: Add process_outputs to node-tracer.js

In `lib/observability/node-tracer.js`, add `process_outputs` to the `traceable` options object (after the `metadata` block, around line 70):

```javascript
      // CRITICAL: Filter outputs to prevent 274MB+ cumulative traces
      // Without this, traceable captures full node return values
      process_outputs: (output) => {
        if (!output || typeof output !== 'object') return output;
        try {
          const filtered = {};
          for (const [key, value] of Object.entries(output)) {
            if (value === null || value === undefined) {
              filtered[key] = value;
            } else if (typeof value === 'string') {
              filtered[key] = value.length > 2000
                ? value.slice(0, 2000) + `... [+${value.length - 2000} chars]`
                : value;
            } else if (typeof value === 'object') {
              const serialized = JSON.stringify(value);
              filtered[key] = serialized.length > 4000
                ? `[${Array.isArray(value) ? 'Array' : 'Object'} ${serialized.length} chars]`
                : value;
            } else {
              filtered[key] = value;  // numbers, booleans pass through
            }
          }
          return filtered;
        } catch (err) {
          return { error: 'Failed to filter outputs', keys: Object.keys(output) };
        }
      }
```

### Step 4: Add process_outputs to llm-tracer.js

In `lib/observability/llm-tracer.js`, add `process_outputs` to the `createTracedSdkQuery` traceable options (after `metadata`, around line 105):

```javascript
      // Filter outputs to prevent large SDK responses in traces
      process_outputs: (output) => {
        if (!output || typeof output !== 'object') return output;
        try {
          const serialized = JSON.stringify(output);
          if (serialized.length > 8000) {
            return {
              _truncated: true,
              _originalSize: serialized.length,
              _keys: Object.keys(output),
              _preview: serialized.slice(0, 4000) + '...'
            };
          }
          return output;
        } catch (err) {
          return { error: 'Failed to serialize output' };
        }
      }
```

Also add the same `process_outputs` to `traceLLMCall` (around line 153) and `traceBatch` (around line 187) using the same pattern.

### Step 5: Run test to verify it passes

Run: `npx jest lib/__tests__/observability-tracers.test.js --no-coverage`
Expected: PASS

### Step 6: Run full test suite

Run: `npx jest --no-coverage`
Expected: All tests pass

### Step 7: Commit

```bash
git add lib/observability/node-tracer.js lib/observability/llm-tracer.js lib/__tests__/observability-tracers.test.js
git commit -m "$(cat <<'EOF'
fix: add process_outputs to LangSmith tracers to prevent payload overflow

Both node-tracer and llm-tracer defined process_inputs but no
process_outputs. LangSmith captured full outputs by default, causing
cumulative payloads to exceed the 26MB per-field limit across 37+ nodes.
Now truncates large strings and objects in trace outputs.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Fix Haiku Structured Output Schemas

Three independent schema fixes. Each is small and self-contained.

### Task 4a: Expand emotionalTone enum in photo analysis

**Why:** Haiku fails structured output when photos don't match the 7 predefined tones. Missing: "investigative", "analytical", "focused", "dramatic", "playful", "somber", "chaotic".

**Files:**
- Modify: `lib/workflow/nodes/photo-nodes.js:105-108`
- Test: existing photo-nodes tests should still pass

#### Step 1: Expand the enum

In `lib/workflow/nodes/photo-nodes.js`, find the `emotionalTone` property in `PHOTO_ANALYSIS_SCHEMA` (line ~105):

Before:
```javascript
    emotionalTone: {
      type: 'string',
      enum: ['tense', 'celebratory', 'suspicious', 'revelatory', 'confrontational', 'collaborative', 'neutral'],
      description: 'Overall emotional tone of the scene'
    },
```

After:
```javascript
    emotionalTone: {
      type: 'string',
      description: 'Overall emotional tone of the scene (e.g., tense, celebratory, suspicious, revelatory, confrontational, collaborative, neutral, investigative, analytical, focused, dramatic, playful, somber, chaotic)'
    },
```

**Rationale:** Removing the enum entirely and using description-as-guidance is more reliable with Haiku than trying to enumerate all possible tones. The field is used for article photo placement, where approximate tones are sufficient.

#### Step 2: Run tests

Run: `npx jest lib/__tests__/photo-nodes.test.js --no-coverage` (if exists)
Run: `npx jest --no-coverage`
Expected: All pass

#### Step 3: Commit

```bash
git add lib/workflow/nodes/photo-nodes.js
git commit -m "$(cat <<'EOF'
fix: remove narrow emotionalTone enum from photo analysis schema

Haiku fails structured output when photos don't match the 7 predefined
tones. Replaced with description-as-guidance which is more reliable for
Haiku while still producing useful tone labels for photo placement.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 4b: Make enrichedNarrativeMoment optional in enrichment schema

**Why:** When no corrections are provided for a photo, Haiku struggles to generate a "corrected" narrative moment. Making it optional lets Haiku skip it when the original is fine.

**Files:**
- Modify: `lib/workflow/nodes/photo-nodes.js:493-515`

#### Step 1: Update the schema

In `lib/workflow/nodes/photo-nodes.js`, find `ENRICHED_PHOTO_SCHEMA` (line ~493):

Before:
```javascript
const ENRICHED_PHOTO_SCHEMA = {
  type: 'object',
  required: ['enrichedVisualContent', 'enrichedNarrativeMoment', 'finalCaption', 'identifiedCharacters'],
```

After:
```javascript
const ENRICHED_PHOTO_SCHEMA = {
  type: 'object',
  required: ['enrichedVisualContent', 'finalCaption', 'identifiedCharacters'],
```

Remove `enrichedNarrativeMoment` from the `required` array only. Keep it in `properties` so Haiku can still provide it.

#### Step 2: Run tests and commit

Run: `npx jest --no-coverage`

```bash
git add lib/workflow/nodes/photo-nodes.js
git commit -m "$(cat <<'EOF'
fix: make enrichedNarrativeMoment optional in photo enrichment schema

Haiku fails when no corrections are needed but is still required to
produce a "corrected" narrative moment. Now optional — Haiku provides
it when meaningful corrections exist, omits when original is fine.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

### Task 4c: Add enum constraint to excludeReason in paper scoring

**Why:** Without an enum, Haiku generates inconsistent exclusion reasons (e.g., "notRelevant", "no_connection", "irrelevant") that are hard to programmatically process.

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:124` (PAPER_SCORING_SCHEMA)

#### Step 1: Add the enum

In `lib/workflow/nodes/ai-nodes.js`, find `excludeReason` in `PAPER_SCORING_SCHEMA` (line ~124):

Before:
```javascript
          excludeReason: { type: 'string' },
```

After:
```javascript
          excludeReason: {
            type: 'string',
            enum: ['puzzleArtifact', 'insufficientConnection', 'tangentialThread', 'minimalContent', 'containerOnly']
          },
```

These match the 5 reasons defined in `PAPER_SCORING_PROMPT` (line ~104). Note: this uses Sonnet (not Haiku), so enum constraints work well.

#### Step 2: Run tests and commit

Run: `npx jest --no-coverage`

```bash
git add lib/workflow/nodes/ai-nodes.js
git commit -m "$(cat <<'EOF'
fix: add enum constraint to excludeReason in paper scoring schema

Without an enum, Sonnet generates inconsistent exclusion reasons. Now
constrained to the 5 reasons defined in the scoring prompt: puzzleArtifact,
insufficientConnection, tangentialThread, minimalContent, containerOnly.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Verification

After all tasks are complete:

1. Run full test suite: `npx jest --no-coverage` — all pass
2. Start server: `npm start`
3. Resume session 0306: verify pipeline completes without double curation
4. Check LangSmith traces: verify payloads are under 26MB
5. Run a fresh session to test photo analysis with new schemas
