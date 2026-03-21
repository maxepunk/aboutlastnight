# Pipeline Reliability & Quality Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the death spiral in arc revision (timeout → 0 arcs → stale evaluation → unrecoverable), separate human/evaluator revision budgets, and strip buried token identity leaks that cause recurring evidence boundary violations across all sessions.

**Architecture:** Three tiers — (A) state management and evaluation lifecycle bugs, (B) revision resilience and quality, (C) context engineering to remove buried token ID leaks from all 4 generative prompt paths. The buried ID fix is a single-line removal at the data source (`routeTokensByDisposition`) that propagates to all downstream prompts.

**Tech Stack:** Node.js, LangGraph state annotations, Claude Agent SDK, React 18 (CDN), Jest

---

## Group A: State Management Foundation

These changes are prerequisites for Groups B and C.

### Task A1: Fix `appendSingleReducer` to support explicit clearing

**Files:**
- Modify: `lib/workflow/state.js:75-78`
- Test: `lib/__tests__/state-reducers.test.js` (create)

**Step 1: Write the failing test**

```javascript
// lib/__tests__/state-reducers.test.js
const { _testing } = require('../workflow/state');
const { appendSingleReducer, appendReducer } = _testing;

describe('appendSingleReducer', () => {
  test('appends single item to array', () => {
    expect(appendSingleReducer(['a'], 'b')).toEqual(['a', 'b']);
  });

  test('ignores null (normal append behavior)', () => {
    expect(appendSingleReducer(['a'], null)).toEqual(['a']);
  });

  test('ignores undefined', () => {
    expect(appendSingleReducer(['a'], undefined)).toEqual(['a']);
  });

  test('clears array when passed empty array []', () => {
    // THIS IS THE NEW BEHAVIOR - empty array = explicit clear for rollback
    expect(appendSingleReducer(['a', 'b', 'c'], [])).toEqual([]);
  });

  test('handles clearing from empty state', () => {
    expect(appendSingleReducer([], [])).toEqual([]);
  });

  test('handles clearing from null state', () => {
    expect(appendSingleReducer(null, [])).toEqual([]);
  });
});

describe('appendReducer', () => {
  test('clears array when passed empty array []', () => {
    // Same clear behavior for consistency
    expect(appendReducer(['a', 'b'], [])).toEqual([]);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/state-reducers.test.js -v`
Expected: FAIL on "clears array when passed empty array" tests

**Step 3: Implement the fix**

In `lib/workflow/state.js`, update both reducers:

```javascript
// Line 49-53: appendReducer
const appendReducer = (oldValue, newValue) => {
  if (Array.isArray(newValue) && newValue.length === 0) return [];
  const prev = oldValue || [];
  const next = newValue || [];
  return [...prev, ...next];
};

// Line 75-78: appendSingleReducer
const appendSingleReducer = (oldValue, newValue) => {
  if (Array.isArray(newValue) && newValue.length === 0) return [];
  const prev = oldValue || [];
  if (newValue === null || newValue === undefined) return prev;
  return [...prev, newValue];
};
```

**Step 4: Run test to verify it passes**

Run: `npx jest lib/__tests__/state-reducers.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/state.js lib/__tests__/state-reducers.test.js
git commit -m "fix(state): appendSingleReducer/appendReducer support [] as explicit clear

Rollback sets evaluationHistory/errors to null, but append reducers
ignore null (by design for normal appends). Empty array [] now signals
'clear this field' so rollback can actually reset append-reducer fields."
```

### Task A2: Fix `buildRollbackState` to use `[]` for append-reducer fields

**Files:**
- Modify: `lib/api-helpers.js:22-31`
- Test: `lib/__tests__/api-helpers.test.js` (create or extend)

**Step 1: Write the failing test**

```javascript
// lib/__tests__/api-helpers.test.js
const { buildRollbackState } = require('../api-helpers');

describe('buildRollbackState', () => {
  test('sets evaluationHistory to empty array (not null)', () => {
    const state = buildRollbackState('evidence-and-photos');
    expect(state.evaluationHistory).toEqual([]);
    expect(state.evaluationHistory).not.toBeNull();
  });

  test('sets errors to empty array (not null)', () => {
    const state = buildRollbackState('input-review');
    // errors is in ROLLBACK_CLEARS for input-review
    if ('errors' in state) {
      expect(state.errors).toEqual([]);
    }
  });

  test('sets non-array fields to null', () => {
    const state = buildRollbackState('evidence-and-photos');
    expect(state.narrativeArcs).toBeNull();
    expect(state.selectedArcs).toBeNull();
  });

  test('resets revision counters', () => {
    const state = buildRollbackState('evidence-and-photos');
    expect(state.arcRevisionCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/api-helpers.test.js -v`
Expected: FAIL on "sets evaluationHistory to empty array"

**Step 3: Implement the fix**

In `lib/api-helpers.js:22-31`:

```javascript
function buildRollbackState(rollbackPoint = 'input-review') {
  if (!ROLLBACK_CLEARS[rollbackPoint]) {
    throw new Error(`Invalid rollback point: '${rollbackPoint}'`);
  }
  const state = {};
  // Fields using append reducers need [] (not null) to clear — see appendSingleReducer
  const appendReducerFields = new Set(['evaluationHistory', 'errors']);
  ROLLBACK_CLEARS[rollbackPoint].forEach(field => {
    state[field] = appendReducerFields.has(field) ? [] : null;
  });
  Object.assign(state, ROLLBACK_COUNTER_RESETS[rollbackPoint]);
  state.currentPhase = null;
  return state;
}
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/api-helpers.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/api-helpers.js lib/__tests__/api-helpers.test.js
git commit -m "fix(rollback): use [] for evaluationHistory/errors clearing

appendSingleReducer ignores null, so rollback never actually cleared
these fields. Empty array triggers the new clear behavior."
```

### Task A3: Add `humanArcRevisionCount` state field and update caps

**Files:**
- Modify: `lib/workflow/state.js` — add field (~line 700), update `REVISION_CAPS` (line 796), update `ROLLBACK_COUNTER_RESETS` (line 912)

**Step 1: Write the failing test**

```javascript
// Add to lib/__tests__/state-reducers.test.js
const { getDefaultState, REVISION_CAPS, ROLLBACK_COUNTER_RESETS } = require('../workflow/state');

describe('humanArcRevisionCount', () => {
  test('exists in default state with value 0', () => {
    const defaults = getDefaultState();
    expect(defaults.humanArcRevisionCount).toBe(0);
  });

  test('REVISION_CAPS includes HUMAN_ARCS', () => {
    expect(REVISION_CAPS.HUMAN_ARCS).toBe(4);
  });

  test('ROLLBACK_COUNTER_RESETS includes humanArcRevisionCount', () => {
    expect(ROLLBACK_COUNTER_RESETS['evidence-and-photos'].humanArcRevisionCount).toBe(0);
    expect(ROLLBACK_COUNTER_RESETS['arc-selection'].humanArcRevisionCount).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/state-reducers.test.js -v`
Expected: FAIL

**Step 3: Implement**

In `lib/workflow/state.js`:

Add field near line 700 (after `arcRevisionCount`):
```javascript
humanArcRevisionCount: Annotation({
  reducer: replaceReducer,
  default: () => 0
}),
```

Update `REVISION_CAPS` (line 796):
```javascript
const REVISION_CAPS = {
  ARCS: 2,
  HUMAN_ARCS: 4,
  OUTLINE: 3,
  ARTICLE: 3
};
```

Update `ROLLBACK_COUNTER_RESETS` (line 912) — add `humanArcRevisionCount: 0` to every entry that has `arcRevisionCount: 0`:
```javascript
'input-review': { arcRevisionCount: 0, humanArcRevisionCount: 0, outlineRevisionCount: 0, articleRevisionCount: 0 },
// ... same for all entries through 'arc-selection'
```

Add to default state (line 699 area):
```javascript
humanArcRevisionCount: 0,
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/state-reducers.test.js -v`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/state.js lib/__tests__/state-reducers.test.js
git commit -m "feat(state): add humanArcRevisionCount with cap=4

Human rejections get separate budget from evaluator-driven revisions.
Evaluator cap stays at 2 (prevent infinite LLM loops).
Human cap is 4 (domain knowledge iterations are valuable)."
```

---

## Group B: Evaluation Lifecycle

### Task B1: Fix evaluation skip logic to check most recent phase entry

**Files:**
- Modify: `lib/workflow/nodes/evaluator-nodes.js:875-883`
- Test: `lib/__tests__/evaluator-skip-logic.test.js` (create)

**Step 1: Write the failing test**

```javascript
// lib/__tests__/evaluator-skip-logic.test.js
// Test the skip logic behavior by checking the evaluator factory's returned function
//
// We need to mock the SDK to prevent actual API calls, then verify skip behavior
// by inspecting the evaluationHistory handling.

const mockSdk = require('./mocks/llm-client.mock');

// Mock the llm module before requiring evaluator-nodes
jest.mock('../llm', () => ({
  sdkQuery: mockSdk.sdkQuery,
  createProgressLogger: () => ({ onProgress: jest.fn() })
}));

const { evaluateArcs } = require('../workflow/nodes/evaluator-nodes');

describe('evaluateArcs skip logic', () => {
  test('skips when most recent arcs evaluation is ready=true', async () => {
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc' }],
      evaluationHistory: [
        { phase: 'arcs', ready: true, timestamp: '2026-01-01' }
      ],
      arcRevisionCount: 0
    };
    const config = { configurable: {} };
    const result = await evaluateArcs(state, config);
    // Should skip — return only currentPhase, no new evaluationHistory entry
    expect(result.evaluationHistory).toBeUndefined();
  });

  test('does NOT skip when most recent arcs evaluation is ready=false (invalidated)', async () => {
    const state = {
      narrativeArcs: [{ id: 'test', title: 'Test Arc' }],
      evaluationHistory: [
        { phase: 'arcs', ready: true, timestamp: '2026-01-01' },
        { phase: 'arcs', ready: false, reason: 'revision-invalidated', timestamp: '2026-01-02' }
      ],
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
      arcRevisionCount: 0,
      playerFocus: {},
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: mockSdk.sdkQuery } };
    // Should NOT skip — most recent is ready=false
    // (will attempt actual evaluation via SDK mock)
    const result = await evaluateArcs(state, config);
    expect(result.evaluationHistory).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/evaluator-skip-logic.test.js -v`
Expected: FAIL — first test may pass (existing behavior), second test should fail (currently finds first ready=true and skips)

**Step 3: Implement**

In `lib/workflow/nodes/evaluator-nodes.js`, replace lines 875-883:

```javascript
    // Skip logic 2: Check MOST RECENT evaluation for this phase
    // (not first ready=true — that persists across revisions and blocks re-evaluation)
    const existingEvals = state.evaluationHistory || [];
    const phaseEvals = existingEvals.filter(e => e.phase === phase);
    const mostRecent = phaseEvals[phaseEvals.length - 1];
    if (mostRecent?.ready === true) {
      console.log(`[evaluate${phase.charAt(0).toUpperCase() + phase.slice(1)}] Skipping - most recent ${phase} evaluation is ready=true`);
      return {
        currentPhase: phaseConstant
      };
    }
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/evaluator-skip-logic.test.js -v && npm test`
Expected: PASS (new tests + all existing)

**Step 5: Commit**

```bash
git add lib/workflow/nodes/evaluator-nodes.js lib/__tests__/evaluator-skip-logic.test.js
git commit -m "fix(evaluator): check most recent phase entry, not first ready=true

.find() returned the first-ever ready=true, which persisted forever.
Now checks the LAST entry for the phase, so invalidation entries from
incrementArcRevision correctly force re-evaluation."
```

### Task B2: Add evaluation invalidation to increment functions

**Files:**
- Modify: `lib/workflow/graph.js:244-252` (incrementArcRevision), `:259-267` (incrementOutlineRevision), `:274-283` (incrementArticleRevision)

**Step 1: Write the failing test**

```javascript
// lib/__tests__/increment-revision.test.js
const { _testing } = require('../workflow/graph');
const { incrementArcRevision, incrementOutlineRevision, incrementArticleRevision } = _testing;

describe('incrementArcRevision', () => {
  test('adds evaluation invalidation entry', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'arcs',
      ready: false,
      reason: 'revision-invalidated'
    }));
  });

  test('increments evaluator count when no human feedback', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0, _arcFeedback: null };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(1);
    expect(result.humanArcRevisionCount).toBe(0);
  });

  test('increments human count when human feedback present', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0, humanArcRevisionCount: 0, _arcFeedback: 'fix burial stuff' };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(0);
    expect(result.humanArcRevisionCount).toBe(1);
  });

  test('falls back to _previousArcs when narrativeArcs is empty', async () => {
    const prevArcs = [{ id: 'a1' }];
    const state = { narrativeArcs: [], _previousArcs: prevArcs, arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result._previousArcs).toEqual(prevArcs);
  });
});

describe('incrementOutlineRevision', () => {
  test('adds evaluation invalidation entry for outline phase', async () => {
    const state = { outline: { sections: [] }, outlineRevisionCount: 0 };
    const result = await incrementOutlineRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'outline', ready: false
    }));
  });
});

describe('incrementArticleRevision', () => {
  test('adds evaluation invalidation entry for article phase', async () => {
    const state = { contentBundle: {}, articleRevisionCount: 0 };
    const result = await incrementArticleRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'article', ready: false
    }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/increment-revision.test.js -v`
Expected: FAIL

**Step 3: Implement**

In `lib/workflow/graph.js`, replace `incrementArcRevision` (lines 244-252):

```javascript
async function incrementArcRevision(state) {
  const isHumanDriven = !!state._arcFeedback;
  const newEvalCount = isHumanDriven
    ? (state.arcRevisionCount || 0)
    : (state.arcRevisionCount || 0) + 1;
  const newHumanCount = isHumanDriven
    ? (state.humanArcRevisionCount || 0) + 1
    : (state.humanArcRevisionCount || 0);

  // Preserve arcs for revision context — fall back to _previousArcs if narrativeArcs lost (timeout)
  const arcsToPreserve = (state.narrativeArcs?.length > 0)
    ? state.narrativeArcs
    : state._previousArcs;

  console.log(`[incrementArcRevision] count=${newEvalCount}, humanCount=${newHumanCount}, source=${isHumanDriven ? 'human' : 'evaluator'}, preserving ${arcsToPreserve?.length || 0} arcs`);

  return {
    arcRevisionCount: newEvalCount,
    humanArcRevisionCount: newHumanCount,
    _previousArcs: arcsToPreserve,
    narrativeArcs: null,
    evaluationHistory: {
      phase: 'arcs',
      ready: false,
      reason: 'revision-invalidated',
      timestamp: new Date().toISOString()
    }
  };
}
```

Replace `incrementOutlineRevision` (lines 259-267):
```javascript
async function incrementOutlineRevision(state) {
  const newCount = (state.outlineRevisionCount || 0) + 1;
  console.log(`[incrementOutlineRevision] Incrementing count to ${newCount}`);
  return {
    outlineRevisionCount: newCount,
    _previousOutline: state.outline,
    outline: null,
    evaluationHistory: {
      phase: 'outline',
      ready: false,
      reason: 'revision-invalidated',
      timestamp: new Date().toISOString()
    }
  };
}
```

Replace `incrementArticleRevision` (lines 274-283):
```javascript
async function incrementArticleRevision(state) {
  const newCount = (state.articleRevisionCount || 0) + 1;
  console.log(`[incrementArticleRevision] Incrementing count to ${newCount}`);
  return {
    articleRevisionCount: newCount,
    _previousContentBundle: state.contentBundle,
    contentBundle: null,
    assembledHtml: null,
    evaluationHistory: {
      phase: 'article',
      ready: false,
      reason: 'revision-invalidated',
      timestamp: new Date().toISOString()
    }
  };
}
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/increment-revision.test.js -v && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/graph.js lib/__tests__/increment-revision.test.js
git commit -m "fix(graph): invalidate evaluation on revision, separate human/evaluator counts

incrementArcRevision now adds {ready:false} to evaluationHistory so
evaluateArcs re-runs after revision. Human vs evaluator revisions
tracked separately via humanArcRevisionCount."
```

### Task B3: Update routing for human revision cap

**Files:**
- Modify: `lib/workflow/graph.js:175-178` (routeAfterArcCheckpoint)

**Step 1: Write the failing test**

```javascript
// Add to lib/__tests__/increment-revision.test.js
const { routeAfterArcCheckpoint } = _testing;

describe('routeAfterArcCheckpoint', () => {
  test('returns forward when selectedArcs populated', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: ['a1', 'a2'] })).toBe('forward');
  });

  test('returns revise when no selectedArcs and under human cap', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 0 })).toBe('revise');
  });

  test('returns forward when at human revision cap', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 4 })).toBe('forward');
  });
});
```

**Step 2: Run test, verify fails**

Run: `npx jest lib/__tests__/increment-revision.test.js -v`
Expected: FAIL on "returns forward when at human revision cap"

**Step 3: Implement**

In `lib/workflow/graph.js:175-178`:
```javascript
function routeAfterArcCheckpoint(state) {
  if (state.selectedArcs?.length > 0) return 'forward';
  const humanAtCap = (state.humanArcRevisionCount || 0) >= REVISION_CAPS.HUMAN_ARCS;
  if (humanAtCap) {
    console.log('[routeAfterArcCheckpoint] Human revision cap reached, forcing forward');
    return 'forward';
  }
  return 'revise';
}
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/increment-revision.test.js -v && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/graph.js lib/__tests__/increment-revision.test.js
git commit -m "feat(routing): check human revision cap in routeAfterArcCheckpoint"
```

---

## Group C: Timeout Recovery & Revision Quality

### Task C1: Add `disableTools` and graceful timeout recovery to `reviseArcs`

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1117-1175`

**Step 1: Write the failing test**

```javascript
// lib/__tests__/revise-arcs-timeout.test.js
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => ({ onProgress: jest.fn() })
}));

describe('reviseArcs timeout recovery', () => {
  test('preserves previous arcs on timeout instead of returning empty', async () => {
    // This test validates the behavior change — timeout returns previousArcs, not []
    const { sdkQuery } = require('../llm');
    sdkQuery.mockRejectedValueOnce(new Error('SDK timeout after 300.0s (limit: 300s) - Arc revision 1'));

    const { reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');
    const previousArcs = [{ id: 'arc-1', title: 'Test Arc' }];
    const state = {
      _previousArcs: previousArcs,
      arcRevisionCount: 1,
      humanArcRevisionCount: 1,
      _arcFeedback: 'fix burial mechanics',
      validationResults: {},
      playerFocus: { accusation: {} },
      sessionConfig: { roster: [] },
      evidenceBundle: { exposed: {}, buried: {} }
    };
    const config = { configurable: { sdkClient: sdkQuery } };

    const result = await reviseArcs(state, config);

    expect(result.narrativeArcs).toEqual(previousArcs);
    expect(result.narrativeArcs.length).toBe(1);
    // Timeout should be free retry — counters decremented
    expect(result.arcRevisionCount).toBeLessThan(state.arcRevisionCount);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/revise-arcs-timeout.test.js -v`
Expected: FAIL — current code returns `narrativeArcs: []` on timeout

**Step 3: Implement**

In `lib/workflow/nodes/arc-specialist-nodes.js`, update the SDK call (around line 1117):
```javascript
    const result = await sdkClient({
      prompt: revisionPrompt,
      systemPrompt: getArcRevisionSystemPrompt(!!state._arcFeedback),
      model: 'sonnet',
      jsonSchema: PLAYER_FOCUS_GUIDED_SCHEMA,
      disableTools: true,        // Pure analytical task — no tool access needed
      timeoutMs: 8 * 60 * 1000, // 8 min — revision prompt is ~55K chars
      label: `Arc revision ${revisionCount}`
    });
```

Update the catch block (around line 1154):
```javascript
  } catch (error) {
    const isTimeout = error.message?.includes('timeout');

    // Graceful timeout recovery: preserve previous arcs, don't consume revision slot
    if (isTimeout && previousArcs?.length > 0) {
      console.warn(`[reviseArcs] Timeout - preserving ${previousArcs.length} previous arcs (free retry)`);
      return {
        narrativeArcs: previousArcs,
        _previousArcs: null,
        _arcFeedback: null,
        _arcAnalysisCache: {
          synthesizedAt: new Date().toISOString(),
          _revisionTimedOut: true,
          _revisionAttempt: revisionCount,
          architecture: 'player-focus-guided-revision-timeout'
        },
        // Decrement counters — timeout is a free retry
        arcRevisionCount: Math.max(0, (state.arcRevisionCount || 1) - 1),
        humanArcRevisionCount: Math.max(0, (state.humanArcRevisionCount || 1) - 1),
        currentPhase: PHASES.ARC_SYNTHESIS
      };
    }

    // Non-timeout errors: existing behavior
    console.error('[reviseArcs] Error:', error.message);
    return {
      narrativeArcs: [],
      _previousArcs: null,
      _arcFeedback: null,
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        architecture: 'player-focus-guided-revision',
        revisionNumber: revisionCount
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: 'arc-revision-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/revise-arcs-timeout.test.js -v && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js lib/__tests__/revise-arcs-timeout.test.js
git commit -m "fix(reviseArcs): graceful timeout recovery + disableTools

Timeout preserves previous arcs instead of returning []. Adds
disableTools: true (matches generateCoreArcs pattern) and increases
timeout to 8min. Timeout doesn't consume revision slot."
```

### Task C2: Flexible revision prompt for human feedback

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1182-1206` (getArcRevisionSystemPrompt)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1119` (call site)

**Step 1: No test needed** — this is a prompt content change, not logic. Verified by E2E.

**Step 2: Implement**

Replace `getArcRevisionSystemPrompt` (line 1182):
```javascript
function getArcRevisionSystemPrompt(hasHumanFeedback = false) {
  if (hasHumanFeedback) {
    return `You are revising narrative arcs based on human reviewer feedback for "About Last Night."

The human reviewer has domain expertise about the game mechanics. Their feedback takes ABSOLUTE PRIORITY.

RULES:
1. Address the human's feedback completely - this is your primary task
2. You MAY replace entire arcs if the feedback warrants it
3. You MAY restructure arc narratives to address conceptual issues
4. PRESERVE arcs and arc content the feedback does not mention
5. If the feedback corrects a game mechanic (e.g., burial attribution, evidence boundaries), apply the correction ACROSS ALL arcs, not just the one mentioned
6. Output complete arcs with all required fields - do not return partial arcs
7. Maintain the same JSON schema structure as the input arcs`;
  }

  // Evaluator-driven revision: targeted fixes only
  return `You are revising narrative arcs for an investigative article about "About Last Night".

CRITICAL REVISION RULES:
1. You are IMPROVING existing arcs, not generating from scratch
2. The previous output is provided - PRESERVE everything that's working well
3. Only modify the specific issues identified in the feedback
4. If a criterion is scoring >=80%, do NOT change anything related to it
5. Maintain the same overall arc structure and organization
6. Output complete arcs with all required fields

Your goal is TARGETED FIXES that address the evaluator's feedback while preserving all the good work from the previous attempt.

Do NOT:
- Regenerate arcs from scratch (you lose good content)
- Change things that weren't flagged as issues
- Drop arcs that were working well
- Introduce new problems while fixing old ones

DO:
- Read the previous output carefully
- Identify exactly what needs to change
- Make minimal, surgical fixes
- Verify your changes address the feedback
- Return the complete updated arc set`;
}
```

Update the call site (line 1119) to pass the flag:
```javascript
      systemPrompt: getArcRevisionSystemPrompt(!!state._arcFeedback),
```

**Step 3: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js
git commit -m "feat(revision): flexible system prompt for human vs evaluator feedback

Human feedback allows conceptual arc replacement. Evaluator feedback
keeps targeted-fix approach. Addresses contradiction where prompt said
'preserve everything' but human said 'replace this arc entirely'."
```

---

## Group D: Context Engineering — Buried Token ID Stripping

### Task D1: Remove `id` from buried transactions at source

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js:448-455` (routeTokensByDisposition)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:1296-1302` (extractEvidenceSummary)
- Modify: `lib/workflow/nodes/evaluator-nodes.js:612` (buildEvaluationUserPrompt buried ID)
- Test: `lib/__tests__/buried-data-leak.test.js` (create)

**Step 1: Write the failing test**

```javascript
// lib/__tests__/buried-data-leak.test.js
const { routeTokensByDisposition } = require('../workflow/nodes/node-helpers');

describe('buried transaction ID stripping', () => {
  test('buried transactions do NOT contain token id field', () => {
    const tokens = [
      { id: 'sam004', disposition: 'buried', shellAccount: 'Burns', transactionAmount: '$75,000', sessionTransactionTime: '6:25 PM' },
      { id: 'vic002', disposition: 'buried', shellAccount: 'Burns', transactionAmount: '$150,000', sessionTransactionTime: '6:36 PM' },
      { id: 'ale001', disposition: 'exposed', ownerLogline: 'Alex', summary: 'test', rawData: {} }
    ];

    const { exposed, buried } = routeTokensByDisposition(tokens);

    // Buried transactions must NOT have id field (leaks whose memory was buried)
    for (const tx of buried) {
      expect(tx).not.toHaveProperty('id');
    }
    expect(buried[0].shellAccount).toBe('Burns');
    expect(buried[0].amount).toBe('$75,000');

    // Exposed tokens SHOULD still have id field
    expect(exposed[0].id).toBe('ale001');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest lib/__tests__/buried-data-leak.test.js -v`
Expected: FAIL — buried transactions currently include `id`

**Step 3: Implement**

In `lib/workflow/nodes/node-helpers.js:448-455`, remove `id: t.id`:
```javascript
    } else if (t.disposition === 'buried') {
      buried.push({
        // id intentionally omitted — token IDs like "sam004" leak whose memory was buried
        // Evidence boundaries: Nova CANNOT know whose memories went to which accounts
        sourceType: 'memory-token',
        shellAccount: t.shellAccount,
        amount: t.transactionAmount,
        time: t.sessionTransactionTime
      });
    }
```

In `lib/workflow/nodes/arc-specialist-nodes.js:1296-1302`, remove `id: t.id`:
```javascript
  const buriedTransactions = (buried.transactions || []).map(t => ({
    // id intentionally omitted — prevents identity inference from token IDs
    shellAccount: t.shellAccount,
    amount: t.amount,
    time: t.time,
    timeline: 'investigation'
  }));
```

In `lib/workflow/nodes/evaluator-nodes.js`, find `buildEvaluationUserPrompt` (around line 608-619). Update the buried evidence mapping to use synthetic ID:
```javascript
    const buriedEvidence = [...buriedTx, ...buriedRel]
      .map((e, index) => ({
        id: `buried-${index + 1}`,  // Synthetic ID — real token IDs stripped to prevent identity leak
        amount: e.amount || e.transactionAmount,
        accountName: e.shellAccount || e.accountName || 'Unknown',
        time: e.time || e.sessionTransactionTime
      }));
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/buried-data-leak.test.js -v && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/nodes/node-helpers.js lib/workflow/nodes/arc-specialist-nodes.js lib/workflow/nodes/evaluator-nodes.js lib/__tests__/buried-data-leak.test.js
git commit -m "fix(context): strip buried token IDs from all prompt paths

Token IDs like 'sam004' leak whose memory was buried, causing the LLM
to generate burial attribution claims that violate evidence boundaries.
This was the root cause of manual edits in every prior session.

ID removed from: routeTokensByDisposition (source), extractEvidenceSummary
(arc prompt), buildEvaluationUserPrompt (evaluator). Financial tracker
uses state.shellAccounts (separate field) — unaffected."
```

### Task D2: Update buried transaction prompt text

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:313-315` (core arc prompt buried section)

**Step 1: No test needed** — prompt content change

**Step 2: Implement**

In `buildCoreArcPrompt`, update the buried transactions section (around line 313):
```javascript
### Buried Transactions (${evidenceSummary.buriedTransactions.length} items - Layer 2, INVESTIGATION ACTIONS)
These transactions occurred DURING THE INVESTIGATION when players chose to bury memories.
Token identity is intentionally hidden - Nova CANNOT know whose memories were buried.
${JSON.stringify(evidenceSummary.buriedTransactions, null, 2)}
```

Do the same for the interweaving enrichment prompt at line 820 (if it has buried data — check; the agent report says Call 2 doesn't include evidence, only arcs + roster, so this may not apply).

**Step 3: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js
git commit -m "docs(prompt): update buried transaction prompt text to reflect stripped IDs"
```

### Task D3: Reorder evidence boundaries in core arc prompt

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:153-340` (buildCoreArcPrompt)

**Step 1: No test needed** — prompt structure change

**Step 2: Implement**

Reorder the prompt sections in `buildCoreArcPrompt`. Current order:
```
SECTION 1 → SECTION 2 → SECTION 3 (boundaries) → SECTION 3.5 (temporal) → SECTION 4 (data) → SECTION 5
```

New order (data before rules for recency bias):
```
SECTION 1 → SECTION 2 → SECTION 4 (data) → SECTION 3 (boundaries) → SECTION 3.5 (temporal) → SECTION 5
```

Move the SECTION 4 block (lines 304-321) to BEFORE SECTION 3 (lines 260-279). Keep SECTION 3.5 after SECTION 3 (both are constraint sections).

This means evidence data is read first, then boundary rules are fresher in working memory when the model generates output.

**Step 3: Commit**

```bash
git add lib/workflow/nodes/arc-specialist-nodes.js
git commit -m "refactor(prompt): reorder evidence data before boundary rules

Recency bias: model reads evidence data first, then boundary rules
are fresher in working memory when generating arc output. Previously
rules came before data, so the data was more recent than the constraints."
```

---

## Group E: Frontend Alignment

### Task E1: Fix 0-arc recovery UI

**Files:**
- Modify: `console/components/checkpoints/ArcSelection.js:118-128`

**Step 1: No test** — frontend component, verified by E2E

**Step 2: Implement**

Replace lines 118-128:
```javascript
  if (arcs.length === 0) {
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      React.createElement('div', { className: 'revision-diff__warning' },
        'No arcs available. This usually means revision timed out or generation failed.'
      ),
      previousFeedback && React.createElement('div', { className: 'revision-diff__feedback' },
        React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Your Last Feedback'),
        React.createElement('p', { className: 'revision-diff__feedback-text' }, previousFeedback)
      ),
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function() { dispatch({ type: 'SHOW_ROLLBACK' }); },
        'aria-label': 'Roll back to regenerate arcs'
      }, 'Roll Back to Regenerate')
    );
  }
```

**Step 3: Commit**

```bash
git add console/components/checkpoints/ArcSelection.js
git commit -m "fix(ui): show rollback option when 0 arcs, not misleading Continue button"
```

### Task E2: Add human revision count to checkpoint data

**Files:**
- Modify: `server.js:86-92` (checkpoint data for arc-selection)

**Step 1: Implement**

In `server.js`, update the `ARC_SELECTION` case in `buildCompleteCheckpointData`:
```javascript
        case CHECKPOINT_TYPES.ARC_SELECTION:
            return {
                narrativeArcs: state.narrativeArcs,
                revisionCount: state.arcRevisionCount || 0,
                humanRevisionCount: state.humanArcRevisionCount || 0,
                maxRevisions: REVISION_CAPS.ARCS,
                maxHumanRevisions: REVISION_CAPS.HUMAN_ARCS,
                previousFeedback: state._arcFeedback || null,
                _revisionTimedOut: state._arcAnalysisCache?._revisionTimedOut || false
            };
```

Import `REVISION_CAPS` if not already imported at top of server.js.

**Step 2: Commit**

```bash
git add server.js
git commit -m "feat(api): include humanRevisionCount in arc checkpoint data"
```

### Task E3: Update RevisionDiff to show human revision budget

**Files:**
- Modify: `console/components/RevisionDiff.js:74-131`

**Step 1: Implement**

Update the component to accept and display `humanRevisionCount` and `maxHumanRevisions`:
```javascript
function RevisionDiff({ previous, current, revisionCount, maxRevisions, previousFeedback, humanRevisionCount, maxHumanRevisions }) {
  if (previous === null || previous === undefined) {
    return null;
  }

  // Show whichever revision type is active
  const isHumanRevision = humanRevisionCount > 0;
  const displayCount = isHumanRevision ? humanRevisionCount : revisionCount;
  const displayMax = isHumanRevision ? (maxHumanRevisions || 4) : maxRevisions;
  const budgetRemaining = displayMax - displayCount;
  const budgetColor = budgetRemaining > 1 ? 'var(--accent-green)' :
                      budgetRemaining === 1 ? 'var(--accent-amber)' :
                      'var(--accent-red)';
  const atMax = displayCount >= displayMax;

  // ... rest of component uses displayCount, displayMax, budgetRemaining, atMax
```

Update ArcSelection.js to pass the new props to RevisionDiff:
```javascript
    React.createElement(RevisionDiff, {
      previous: previousArcs,
      current: arcs,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: data?.humanRevisionCount || 0,
      maxHumanRevisions: data?.maxHumanRevisions || 4
    }),
```

**Step 2: Commit**

```bash
git add console/components/RevisionDiff.js console/components/checkpoints/ArcSelection.js
git commit -m "feat(ui): show human vs evaluator revision budget in RevisionDiff"
```

### Task E4: Fix line-wrapping consistency across console UI

**Files:**
- Modify: `console/console.css`

**Context:** Investigation revealed 9 CSS selectors with missing or contradictory wrapping rules that can cause text overflow/truncation in checkpoint views.

**Step 1: No test** — CSS changes, verified visually

**Step 2: Implement**

Add `overflow-wrap: break-word` and related fixes to these selectors:

```css
/* 1. Progress messages — mono text can overflow container */
.progress-messages__item {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* 2. Revision diff items — flex without min-width:0 causes overflow */
.revision-diff__item {
  min-width: 0;
  flex-wrap: wrap;
}

/* 3. Revision diff detail — long values can overflow */
.revision-diff__item-detail {
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

/* 4. Revision diff feedback text — italic feedback can be long */
.revision-diff__feedback-text {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* 5. Character tag — white-space:nowrap contradicts overflow-wrap */
/* Remove white-space:nowrap, keep overflow-wrap:break-word */
.character-tag {
  white-space: normal; /* was: nowrap — prevented wrapping */
}

/* 6. Character tag role — no wrapping at all */
.character-tag__role {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* 7. Evidence item name — flex:1 without wrapping */
.evidence-item__name {
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

/* 8. Evidence item desc — no wrapping */
.evidence-item__desc {
  overflow-wrap: break-word;
  word-break: break-word;
  min-width: 0;
}

/* 9. Outline section — content can overflow */
.outline-section {
  overflow-wrap: break-word;
  word-break: break-word;
}
```

**Step 3: Commit**

```bash
git add console/console.css
git commit -m "fix(ui): add consistent line-wrapping across all console components

9 selectors had missing or contradictory overflow-wrap rules:
progress messages, revision diffs, character tags, evidence items,
outline sections. character-tag had white-space:nowrap contradicting
its overflow-wrap:break-word."
```

---

## Group F: Minor Fixes

### Task F1: Fix `extractCanonicalCharacters` first-name extraction

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js:955-969`

**Step 1: Write the failing test**

```javascript
// lib/__tests__/canonical-characters.test.js
const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

describe('extractCanonicalCharacters', () => {
  test('resolves full names like "Sarah Blackwood" without warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [
      { owners: ['Sarah Blackwood'] },
      { owners: ['Alex Reeves'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah Blackwood']).toBe('Sarah Blackwood');
    expect(result['Alex Reeves']).toBe('Alex Reeves');
    // Should NOT warn for known characters passed as full names
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('resolves first names correctly', () => {
    const tokens = [{ owners: ['Sarah'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });
});
```

**Step 2: Run test, verify fails**

Run: `npx jest lib/__tests__/canonical-characters.test.js -v`
Expected: FAIL — "Sarah Blackwood" triggers warning

**Step 3: Implement**

In `lib/workflow/nodes/node-helpers.js:955-969`:
```javascript
function extractCanonicalCharacters(tokens, theme = 'journalist') {
  const characters = {};

  for (const token of tokens) {
    for (const owner of (token.owners || [])) {
      if (!owner || characters[owner]) continue;
      // Extract first name for lookup — Notion owners may use full names
      const firstName = owner.includes(' ') ? owner.split(' ')[0].trim() : owner;
      const fullName = getCanonicalName(firstName, theme);
      if (fullName === firstName && !['Flip', 'Nova', 'Blake', 'Marcus'].includes(firstName)) {
        console.warn(`[extractCanonicalCharacters] Unknown character "${owner}" not in theme-config`);
      }
      characters[owner] = fullName;
    }
  }

  return characters;
}
```

**Step 4: Run tests**

Run: `npx jest lib/__tests__/canonical-characters.test.js -v && npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add lib/workflow/nodes/node-helpers.js lib/__tests__/canonical-characters.test.js
git commit -m "fix(characters): extract first name from full names before canonical lookup

Notion token owners use full names ('Sarah Blackwood') but
getCanonicalName() maps by first name ('Sarah'). Now splits on space
before lookup, eliminating 20+ false warnings per run."
```

---

## Verification Checklist

After all groups complete:

1. `npm test` — all tests pass (existing + new)
2. `node scripts/e2e-walkthrough.js --session 0320 --fresh` — pipeline reaches arc checkpoint without errors
3. At arc checkpoint, verify buried transactions in prompt have NO `id` field
4. Rollback to `evidence-and-photos` → verify `evaluationHistory` is cleared (`[]`)
5. Re-run arc generation → verify `evaluateArcs` RUNS (not skipped)
6. Reject arcs with feedback → verify `humanArcRevisionCount` increments, `arcRevisionCount` does NOT
7. If revision times out → verify previous arcs preserved, counter not incremented
8. Frontend: 0 arcs → shows "Roll Back" button, NOT "Continue"
9. Frontend: revision shows correct budget (human vs evaluator)
