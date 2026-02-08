# Phase 3: Checkpoint UI — Backend + Frontend Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute Sub-Phase 3A first (backend), then Sub-Phase 3B (frontend).

> **Master Roadmap:** `C:\Users\spide\.claude\plans\structured-purring-cook.md` — This is Phase 3 of a 5-phase roadmap. Phases 1-2 are complete on branch `cleanup/foundation-dead-code-removal`. After executing this plan, update the master roadmap: mark Phase 3 complete with findings, assess Phase 4 readiness, and note any scope changes discovered during implementation.

**Goal:** Enable human-triggered revision loops for outline/article checkpoints (backend), then build a browser-based frontend that drives the LangGraph workflow through the session REST API.

**Two Sub-Phases:**
- **3A (Backend):** Add approve-with-edits and reject-with-feedback capabilities to outline/article checkpoints. ~200 lines across 5 files + tests.
- **3B (Frontend):** Build the React SPA console UI. ~20 new files, purely additive.

**Architecture:** Sub-Phase 3A extends the existing LangGraph graph topology with conditional routing after human checkpoints, reusing the existing evaluator-driven revision loop. Sub-Phase 3B is a single-page application using React 18 via CDN with Babel JSX transpilation — no build process, no node_modules. All frontend code lives in `console/` served statically by the existing Express server.

**Tech Stack:** LangGraph conditional edges (3A), React 18 CDN + Babel standalone (3B), CSS custom properties, Google Fonts, EventSource API for SSE.

---

# Sub-Phase 3A: Human Rejection Backend

**Goal:** Enable three approval modes at outline and article checkpoints: approve as-is, approve with direct edits, and reject with feedback that triggers the existing revision loop.

**Branch:** Same `feature/checkpoint-ui` branch — backend changes land first, frontend builds on top.

---

## Three Approval Modes

| Mode | API Payload | Graph Behavior |
|------|------------|----------------|
| Approve as-is | `{ outline: true }` | Set `outlineApproved: true`, route forward |
| Approve with edits | `{ outline: true, outlineEdits: {...} }` | Replace `state.outline` via `Command({ update })`, set approved, route forward |
| Reject with feedback | `{ outline: false, outlineFeedback: "..." }` | Store feedback in `_outlineFeedback`, route to existing revision loop |

Same pattern for article (`articleEdits`, `articleFeedback`, `_articleFeedback`).

## Data Flow: Rejection Path

```
1. User sends { outline: false, outlineFeedback: "Fix the lede hook" }
2. buildResumePayload → resume: { approved: false }, stateUpdates: { _outlineFeedback: "..." }
3. Command({ resume, update: stateUpdates }) resumes checkpoint
4. checkpointOutline sees approved === false → returns { currentPhase } (outlineApproved stays false)
5. routeAfterOutlineCheckpoint: outlineApproved is false → 'revise'
6. incrementOutlineRevision: preserves outline in _previousOutline, clears outline, increments count
7. reviseOutline: reads _outlineFeedback + evaluator feedback, generates revision, clears _outlineFeedback
8. evaluateOutline: checks quality → routes to checkpoint (ready) or revision (needs work)
9. User sees revised version at checkpoint
```

## Data Flow: Direct Edit Path

```
1. User sends { outline: true, outlineEdits: { ...modifiedOutline } }
2. buildResumePayload → resume: { approved: true }, stateUpdates: { outline: modifiedOutline }
3. Command({ resume, update: stateUpdates }) overwrites state.outline, then resumes checkpoint
4. checkpointOutline sees approved === true → returns { outlineApproved: true }
5. routeAfterOutlineCheckpoint: outlineApproved is true → 'forward'
6. generateContentBundle proceeds with the human-edited outline
```

---

## Batch 3A.1: State Layer (1 commit)

**Goal:** Add feedback state fields, update rollback config.

### Task 3A.1.1 — Add feedback state annotations

**Files:**
- Modify: `lib/workflow/state.js`

**Step 1: Add Annotation definitions** (after `_previousContentBundle` annotation, ~line 563)

```javascript
  /**
   * Human feedback for outline rejection (triggers revision loop)
   * Set by server approval handler, consumed by reviseOutline
   * Cleared after revision completes — follows _previousOutline pattern
   */
  _outlineFeedback: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),

  /**
   * Human feedback for article rejection (triggers revision loop)
   * Set by server approval handler, consumed by reviseContentBundle
   * Cleared after revision completes — follows _previousContentBundle pattern
   */
  _articleFeedback: Annotation({
    reducer: replaceReducer,
    default: () => null
  }),
```

**Step 2: Add to `getDefaultState()`** (after `_arcValidation: null`, ~line 657)

```javascript
    // Human rejection feedback (consumed by revision nodes, cleared after use)
    _outlineFeedback: null,
    _articleFeedback: null
```

**Step 3: Add to `ROLLBACK_CLEARS`**

In the `'outline'` entry (~line 829), add feedback fields:
```javascript
  'outline': [
    'heroImage', 'outline', 'outlineApproved', '_outlineFeedback',
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults'
  ],
```

In the `'article'` entry (~line 835):
```javascript
  'article': [
    'contentBundle', 'articleApproved', '_articleFeedback', 'assembledHtml', 'validationResults'
  ]
```

Also add `'_outlineFeedback', '_articleFeedback'` to all upstream rollback entries (`input-review` through `arc-selection`) since they clear everything downstream.

**Step 4: Run existing tests**

```bash
npx jest __tests__/unit/workflow/state.test.js -v
```

Expected: All existing tests pass. Update the `getDefaultState` key count assertion if one exists.

### Task 3A.1.2 — Add state tests

**Files:**
- Modify: `__tests__/unit/workflow/state.test.js`

Add test cases:

```javascript
describe('human feedback state fields', () => {
  test('getDefaultState includes _outlineFeedback as null', () => {
    const state = getDefaultState();
    expect(state._outlineFeedback).toBeNull();
  });

  test('getDefaultState includes _articleFeedback as null', () => {
    const state = getDefaultState();
    expect(state._articleFeedback).toBeNull();
  });

  test('ROLLBACK_CLEARS outline includes _outlineFeedback', () => {
    expect(ROLLBACK_CLEARS['outline']).toContain('_outlineFeedback');
  });

  test('ROLLBACK_CLEARS outline includes _articleFeedback', () => {
    expect(ROLLBACK_CLEARS['outline']).toContain('_articleFeedback');
  });

  test('ROLLBACK_CLEARS article includes _articleFeedback', () => {
    expect(ROLLBACK_CLEARS['article']).toContain('_articleFeedback');
  });
});
```

```bash
npx jest __tests__/unit/workflow/state.test.js -v
```

Expected: All tests pass including new ones.

**Commit:** `feat: add _outlineFeedback and _articleFeedback state annotations`

---

## Batch 3A.2: Server + Checkpoint Nodes (1 commit)

**Goal:** Handle three approval modes in API layer and checkpoint nodes.

### Task 3A.2.1 — Update `buildResumePayload` for outline

**Files:**
- Modify: `server.js` (`buildResumePayload` function)

Replace the existing outline block (~line 176):
```javascript
    // Outline approval (boolean)
    if (approvals.outline === true) {
        validApprovalDetected = true;
        resume.approved = true;
    }
```

With:
```javascript
    // Outline: approve, approve-with-edits, or reject-with-feedback
    if (approvals.outline === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.outlineEdits && typeof approvals.outlineEdits === 'object') {
            stateUpdates.outline = approvals.outlineEdits;
        }
    } else if (approvals.outline === false && typeof approvals.outlineFeedback === 'string' && approvals.outlineFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.outlineFeedback.trim();
        stateUpdates._outlineFeedback = approvals.outlineFeedback.trim();
    }
```

### Task 3A.2.2 — Update `buildResumePayload` for article

**Files:**
- Modify: `server.js` (`buildResumePayload` function)

Replace the existing article block (~line 182):
```javascript
    // Article approval (boolean) (Commit 8.9.7)
    if (approvals.article === true) {
        validApprovalDetected = true;
        resume.approved = true;
    }
```

With:
```javascript
    // Article: approve, approve-with-edits, or reject-with-feedback
    if (approvals.article === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.articleEdits && typeof approvals.articleEdits === 'object') {
            stateUpdates.contentBundle = approvals.articleEdits;
        }
    } else if (approvals.article === false && typeof approvals.articleFeedback === 'string' && approvals.articleFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.articleFeedback.trim();
        stateUpdates._articleFeedback = approvals.articleFeedback.trim();
    }
```

### Task 3A.2.3 — Update `checkpointOutline` for three resume modes

**Files:**
- Modify: `lib/workflow/nodes/checkpoint-nodes.js` (~line 320)

Replace `checkpointOutline` function body:

```javascript
async function checkpointOutline(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state.outlineApproved === true
    ? true
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.OUTLINE,
    {
      outline: state.outline,
      evaluationHistory: state.evaluationHistory
    },
    skipCondition
  );

  // Approve (with or without edits — edits applied via Command update before this runs)
  if (resumeValue?.approved === true && !skipCondition) {
    console.log(`[checkpointOutline] Approved by human`);
    return {
      outlineApproved: true,
      currentPhase: PHASES.OUTLINE_CHECKPOINT
    };
  }

  // Reject with feedback — routing function sends to revision loop
  if (resumeValue?.approved === false && resumeValue?.feedback) {
    console.log(`[checkpointOutline] Rejected by human with feedback`);
    return {
      currentPhase: PHASES.OUTLINE_CHECKPOINT
    };
  }

  return {
    currentPhase: PHASES.OUTLINE_CHECKPOINT
  };
}
```

### Task 3A.2.4 — Update `checkpointArticle` (same pattern)

**Files:**
- Modify: `lib/workflow/nodes/checkpoint-nodes.js` (~line 359)

Replace `checkpointArticle` function body:

```javascript
async function checkpointArticle(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state.articleApproved === true
    ? true
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.ARTICLE,
    {
      contentBundle: state.contentBundle,
      evaluationHistory: state.evaluationHistory
    },
    skipCondition
  );

  // Approve (with or without edits — edits applied via Command update before this runs)
  if (resumeValue?.approved === true && !skipCondition) {
    console.log(`[checkpointArticle] Approved by human`);
    return {
      articleApproved: true,
      currentPhase: PHASES.ARTICLE_CHECKPOINT
    };
  }

  // Reject with feedback — routing function sends to revision loop
  if (resumeValue?.approved === false && resumeValue?.feedback) {
    console.log(`[checkpointArticle] Rejected by human with feedback`);
    return {
      currentPhase: PHASES.ARTICLE_CHECKPOINT
    };
  }

  return {
    currentPhase: PHASES.ARTICLE_CHECKPOINT
  };
}
```

**Verify:**

```bash
npm start
# Ctrl+C after startup confirmation — no import errors
```

**Commit:** `feat: handle approve/edit/reject in server and checkpoint nodes`

---

## Batch 3A.3: Graph Topology (1 commit)

**Goal:** Replace static post-checkpoint edges with conditional routing.

### Task 3A.3.1 — Add routing functions

**Files:**
- Modify: `lib/workflow/graph.js` (after `routeArticleEvaluation`, ~line 142)

```javascript
/**
 * Route function after outline human checkpoint
 * Approve → forward to content generation
 * Reject → revision loop (outlineApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterOutlineCheckpoint(state) {
  if (state.outlineApproved) return 'forward';
  return 'revise';
}

/**
 * Route function after article human checkpoint
 * Approve → forward to validation
 * Reject → revision loop (articleApproved stays false)
 * @param {Object} state - Current graph state
 * @returns {string} 'forward' or 'revise'
 */
function routeAfterArticleCheckpoint(state) {
  if (state.articleApproved) return 'forward';
  return 'revise';
}
```

### Task 3A.3.2 — Replace static outline edge

**Files:**
- Modify: `lib/workflow/graph.js` (~line 523-524)

Replace:
```javascript
  // Checkpoint → next phase (after human approval)
  builder.addEdge('checkpointOutline', 'generateContentBundle');
```

With:
```javascript
  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointOutline', routeAfterOutlineCheckpoint, {
    forward: 'generateContentBundle',
    revise: 'incrementOutlineRevision'
  });
```

### Task 3A.3.3 — Replace static article edge

**Files:**
- Modify: `lib/workflow/graph.js` (~line 548-549)

Replace:
```javascript
  // Checkpoint → next phase (after human approval)
  builder.addEdge('checkpointArticle', 'validateContentBundle');
```

With:
```javascript
  // Checkpoint → conditional: approve forwards, reject enters revision loop
  builder.addConditionalEdges('checkpointArticle', routeAfterArticleCheckpoint, {
    forward: 'validateContentBundle',
    revise: 'incrementArticleRevision'
  });
```

### Task 3A.3.4 — Export routing functions for testing

**Files:**
- Modify: `lib/workflow/graph.js` (module.exports section)

Add to existing exports (or create a `_testing` export):
```javascript
  _testing: {
    routeAfterOutlineCheckpoint,
    routeAfterArticleCheckpoint,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeArcEvaluation
  }
```

**Verify:**

```bash
npm start
# Ctrl+C — no import errors, graph builds without edge conflicts
```

**Commit:** `feat: replace static checkpoint edges with conditional routing for human rejection`

---

## Batch 3A.4: Revision Context (1 commit)

**Goal:** Feed human feedback into the existing revision prompt pipeline.

### Task 3A.4.1 — Add `humanFeedback` parameter to `buildRevisionContext`

**Files:**
- Modify: `lib/workflow/nodes/node-helpers.js` (`buildRevisionContext` function, ~line 817)

**Step 1:** Update destructuring (~line 818):

```javascript
  const { phase, revisionCount, validationResults, previousOutput, humanFeedback } = options;
```

**Step 2:** Add human feedback section to `contextSection` string. Insert after the `EVALUATOR FEEDBACK:` section (~line 885) and before the `CRITICAL REVISION INSTRUCTIONS:` section:

```javascript
${humanFeedback ? `
HUMAN FEEDBACK (HIGHEST PRIORITY):
${humanFeedback}

NOTE: The human reviewer has explicitly requested these changes.
Address human feedback FIRST, then address any remaining evaluator issues.
` : ''}
```

### Task 3A.4.2 — Update `reviseOutline` to pass and clear human feedback

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js` (`reviseOutline` function, ~line 964)

**Step 1:** Add `humanFeedback` to `buildRevisionContextDRY` call:

Replace:
```javascript
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'outline',
    revisionCount,
    validationResults: state.validationResults,
    previousOutput: previousOutline
  });
```

With:
```javascript
  const { contextSection, previousOutputSection } = buildRevisionContextDRY({
    phase: 'outline',
    revisionCount,
    validationResults: state.validationResults,
    previousOutput: previousOutline,
    humanFeedback: state._outlineFeedback || null
  });
```

**Step 2:** Clear feedback in success return (~line 992). Add `_outlineFeedback: null`:

```javascript
    return {
      outline: result || {},
      _previousOutline: null,
      _outlineFeedback: null,  // Clear human feedback after consumption
      currentPhase: PHASES.GENERATE_OUTLINE
    };
```

**Step 3:** Clear feedback in error return (~line 1001). Add `_outlineFeedback: null`.

### Task 3A.4.3 — Update `reviseContentBundle` (same pattern)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js` (`reviseContentBundle` function, ~line 1332)

Same as Task 3A.4.2:
- Add `humanFeedback: state._articleFeedback || null` to `buildRevisionContextDRY` call
- Add `_articleFeedback: null` to success and error return objects

**Commit:** `feat: feed human feedback into revision context for outline and article`

---

## Batch 3A.5: Tests + Verification (1 commit)

### Task 3A.5.1 — Test routing functions

**Files:**
- Create: `__tests__/unit/workflow/graph-routing.test.js`

```javascript
const { _testing } = require('../../../lib/workflow/graph');
const { routeAfterOutlineCheckpoint, routeAfterArticleCheckpoint } = _testing;

describe('routeAfterOutlineCheckpoint', () => {
  test('returns forward when outlineApproved is true', () => {
    expect(routeAfterOutlineCheckpoint({ outlineApproved: true })).toBe('forward');
  });

  test('returns revise when outlineApproved is false', () => {
    expect(routeAfterOutlineCheckpoint({ outlineApproved: false })).toBe('revise');
  });

  test('returns revise when outlineApproved is undefined', () => {
    expect(routeAfterOutlineCheckpoint({})).toBe('revise');
  });
});

describe('routeAfterArticleCheckpoint', () => {
  test('returns forward when articleApproved is true', () => {
    expect(routeAfterArticleCheckpoint({ articleApproved: true })).toBe('forward');
  });

  test('returns revise when articleApproved is false', () => {
    expect(routeAfterArticleCheckpoint({ articleApproved: false })).toBe('revise');
  });
});
```

### Task 3A.5.2 — Test buildRevisionContext with human feedback

**Files:**
- Modify or create test for `node-helpers.js`

Test that `humanFeedback` parameter appears in output when provided:

```javascript
const { buildRevisionContext } = require('../../lib/workflow/nodes/node-helpers');

describe('buildRevisionContext with humanFeedback', () => {
  test('includes HUMAN FEEDBACK section when humanFeedback provided', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: {},
      previousOutput: { sections: [] },
      humanFeedback: 'Fix the lede hook'
    });
    expect(contextSection).toContain('HUMAN FEEDBACK');
    expect(contextSection).toContain('Fix the lede hook');
  });

  test('omits HUMAN FEEDBACK section when humanFeedback is null', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'outline',
      revisionCount: 1,
      validationResults: {},
      previousOutput: { sections: [] },
      humanFeedback: null
    });
    expect(contextSection).not.toContain('HUMAN FEEDBACK');
  });
});
```

### Task 3A.5.3 — Run full test suite

```bash
npm test
```

Expected: All tests pass. No regressions.

### Task 3A.5.4 — E2E verification with rejection

```bash
# Use an existing session that's reached the outline checkpoint
node scripts/e2e-walkthrough.js --session 1225 --resume
# At outline checkpoint: choose 'r' to reject with feedback
# Verify: revision generates without 400 error
# Verify: revised outline appears at checkpoint
# Approve the revision
```

**Commit:** `test: add tests for human rejection routing and revision context`

---

## Sub-Phase 3A: Critical Files Summary

| File | Change | Lines |
|------|--------|-------|
| `lib/workflow/state.js` | 2 annotations, 2 defaults, rollback entries | ~20 |
| `server.js` | `buildResumePayload` outline+article blocks | ~30 |
| `lib/workflow/nodes/checkpoint-nodes.js` | 2 checkpoint functions rewritten | ~40 |
| `lib/workflow/graph.js` | 2 routing functions, 2 edge replacements, `_testing` export | ~30 |
| `lib/workflow/nodes/node-helpers.js` | `humanFeedback` param in `buildRevisionContext` | ~10 |
| `lib/workflow/nodes/ai-nodes.js` | 2 revision functions pass + clear feedback | ~12 |
| `__tests__/unit/workflow/state.test.js` | Feedback field tests | ~20 |
| `__tests__/unit/workflow/graph-routing.test.js` | Routing function tests (new) | ~30 |

**Total: ~5 batches, ~5 commits, ~200 lines of changes + ~50 lines of tests**

---
---

# Sub-Phase 3B: Checkpoint UI Frontend

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a browser-based SPA that drives the LangGraph workflow through the session REST API, replacing the E2E CLI walkthrough as the primary interface.

**Architecture:** React 18 via CDN with Babel standalone JSX transpilation. No build process, no node_modules. All frontend code lives in `console/` served statically by the existing Express server. Modular files communicate via `window.Console` namespace. State managed by a single `useReducer` state machine.

**Tech Stack:** React 18 CDN (production builds), Babel standalone, CSS custom properties, Google Fonts (Bebas Neue, Source Code Pro, Newsreader), EventSource API for SSE.

**Branch:** Same `cleanup/foundation-dead-code-removal` branch. Sub-Phase 3A is complete.

**Prerequisite:** Sub-Phase 3A (complete) — backend handles approve/edit/reject for outline and article checkpoints.

---

## Architecture Decision Record

### SPA vs Multi-Page: SPA

The workflow is a linear progression through checkpoints with shared session state. Multi-page would require constant state serialization. SPA keeps state in memory and renders checkpoint-specific views as the workflow advances.

### Framework: React 18 via CDN (no build process)

- The console is a **developer/operator tool**, not the public landing page. The parent project's zero-dependency rule applies to the marketing site, not this separate Express-served app.
- `detlogv3.html` established this pattern (2,157 lines). It failed due to wrong API integration, not technology choice.
- React's component model maps cleanly to 10 checkpoint types.
- **Production builds** (not development) for performance:
  - `react@18/umd/react.production.min.js`
  - `react-dom@18/umd/react-dom.production.min.js`

**Rejected from detlogv3.html:**
- No Tailwind CDN (300KB+, utility soup). Hand-written CSS with variables.
- No Lucide CDN. Unicode characters or inline SVG for the few icons needed.
- No 34 `useState` hooks. Single `useReducer` state machine.
- No client-side prompt building. Frontend is purely a checkpoint approval UI.
- No monolithic files. Modular: separate CSS file + JS modules via `window.Console` namespace.

### Module System: Window Namespace

Babel standalone transpiles each `<script type="text/babel" src="...">` in isolation. No ES module support across files.

**Solution:** All modules assign to `window.Console`:

```javascript
// api.js — produces
window.Console = window.Console || {};
window.Console.api = { login, startSession, approve, ... };

// state.js — produces
window.Console.useAppState = function useAppState() { ... };
window.Console.ACTIONS = { ... };

// components/LoginOverlay.js — produces
window.Console.LoginOverlay = function LoginOverlay(props) { ... };

// app.js — consumes
const { api, useAppState, LoginOverlay } = window.Console;
```

**Key rule:** Load order in `index.html` defines the dependency graph. Utilities first, components second, app.js last.

---

## File Structure

```
console/
├── index.html                 # Shell: CDN scripts, mount point, CSS link
├── console.css                # All styles (CSS variables, components, layout)
├── api.js                     # API client (fetch wrappers, SSE connection)
├── state.js                   # useReducer state machine, action types
├── utils.js                   # Shared display utilities (truncate, badges, formatters)
├── app.js                     # Root App component, auth gate, checkpoint router
├── components/
│   ├── LoginOverlay.js        # Password authentication
│   ├── SessionStart.js        # Session ID input + start/resume
│   ├── ProgressStream.js      # SSE progress display during processing
│   ├── CheckpointShell.js     # Shared checkpoint wrapper (header, actions, raw JSON)
│   ├── PipelineProgress.js    # 10-step checkpoint stepper bar
│   ├── RollbackPanel.js       # Rollback confirmation dialog
│   ├── RevisionDiff.js        # Shared revision diff display (outline/article)
│   ├── CompletionView.js      # Workflow complete screen
│   └── checkpoints/
│       ├── InputReview.js
│       ├── PaperEvidence.js
│       ├── AwaitRoster.js
│       ├── CharacterIds.js
│       ├── AwaitFullContext.js
│       ├── PreCuration.js
│       ├── EvidenceBundle.js
│       ├── ArcSelection.js
│       ├── Outline.js
│       └── Article.js
```

**Server change:** 2 lines in `server.js` — static serving + SPA catch-all.

---

## SSE Integration Design

### Connection Lifecycle (SSE-before-POST)

```
1. User clicks "Approve" / "Reject"
2. Frontend opens EventSource to /api/session/:id/progress
3. Frontend WAITS for SSE 'connected' event
4. THEN frontend POSTs to /api/session/:id/approve
5. Server returns { status: 'processing' } immediately
6. SSE streams: progress → llm_start → progress → llm_complete → ... → complete
7. On 'complete': parse result → dispatch CHECKPOINT_RECEIVED or WORKFLOW_COMPLETE
8. Close EventSource
```

**Critical pattern** — `api.approve()` coordinates this internally:

```javascript
api.approve = async (sessionId, payload, onProgress) => {
  // 1. Connect SSE and wait for 'connected'
  const { eventSource, connected } = api.connectSSE(sessionId, onProgress);
  await connected;
  // 2. POST approval
  const res = await fetch(`/api/session/${sessionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(payload)
  });
  return { response: await res.json(), eventSource };
};
```

### SSE Event → State Dispatch Mapping

| SSE Event | Dispatch Action | State Change |
|-----------|----------------|--------------|
| `connected` | `SSE_CONNECTED` | `sseConnected: true` |
| `progress` | `SSE_PROGRESS` | Append to `progressMessages` |
| `llm_start` | `SSE_LLM_START` | `llmActivity: { label, model, startTime }` |
| `llm_complete` | `SSE_LLM_COMPLETE` | `llmActivity: null` |
| `complete` | `SSE_COMPLETE` → then `CHECKPOINT_RECEIVED` or `WORKFLOW_COMPLETE` | Parse result, update checkpoint state |
| `error` | `SSE_ERROR` | `error: message`, `processing: false` |

---

## State Machine

```javascript
const initialState = {
  // Auth
  authenticated: false,

  // Session
  sessionId: null,
  phase: null,

  // Checkpoint
  checkpointType: null,
  checkpointData: {},

  // Processing
  processing: false,
  sseConnected: false,
  progressMessages: [],
  llmActivity: null,       // { label, model, startTime } or null

  // Revision tracking (client-side cache for diff display)
  revisionCache: { outline: null, article: null },

  // Errors
  error: null,

  // Completed
  completedResult: null
};

const ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGOUT: 'LOGOUT',
  SET_SESSION: 'SET_SESSION',
  CHECKPOINT_RECEIVED: 'CHECKPOINT_RECEIVED',
  PROCESSING_START: 'PROCESSING_START',
  SSE_CONNECTED: 'SSE_CONNECTED',
  SSE_PROGRESS: 'SSE_PROGRESS',
  SSE_LLM_START: 'SSE_LLM_START',
  SSE_LLM_COMPLETE: 'SSE_LLM_COMPLETE',
  SSE_COMPLETE: 'SSE_COMPLETE',
  SSE_ERROR: 'SSE_ERROR',
  WORKFLOW_COMPLETE: 'WORKFLOW_COMPLETE',
  CACHE_REVISION: 'CACHE_REVISION',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR'
};
```

---

## Checkpoint Component Contract

Every checkpoint component receives the same props interface:

```javascript
function CheckpointName({ data, onApprove, onReject }) { ... }
```

- `data` — Checkpoint-specific data object from `getCheckpointData()` merged with interrupt data
- `onApprove(payload)` — Called with the approval payload (varies per checkpoint)
- `onReject(payload)` — Called with rejection payload (only outline/article use this)

`CheckpointShell` wraps every checkpoint with shared UI: header, raw JSON toggle, error display. The checkpoint component provides the content and action buttons.

---

## Design Tokens

```css
:root {
  --bg-void: #06080c;
  --bg-surface: #0a0c10;
  --bg-panel: rgba(20, 25, 35, 0.7);
  --bg-panel-hover: rgba(25, 32, 45, 0.8);
  --bg-input: rgba(10, 14, 22, 0.8);

  --accent-amber: #d4a853;
  --accent-cyan: #4ecdc4;
  --accent-red: #e74c3c;
  --accent-green: #27ae60;

  --text-primary: #e8e6e1;
  --text-secondary: #8a8578;
  --text-muted: #5a5549;

  --layer-exposed: #27ae60;
  --layer-buried: #e74c3c;
  --layer-context: #4ecdc4;
  --layer-excluded: #d4a853;

  --font-display: 'Bebas Neue', sans-serif;
  --font-mono: 'Source Code Pro', monospace;
  --font-body: 'Newsreader', serif;

  --glass-blur: blur(16px);
  --glass-border: 1px solid rgba(212, 168, 83, 0.15);

  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 40px;
}
```

---

## Batched Execution Order

```
Batch 3B.1 (Foundation)     → Batch 3B.2 (SSE + Shell)
                                  ↓
                            Batch 3B.3 (Simple checkpoints: InputReview, PaperEvidence, PreCuration)
                                  ↓
                            Batch 3B.4 (Data input: Roster, CharacterIds, FullContext)
                                  ↓
                            Batch 3B.5 (Complex display: EvidenceBundle, ArcSelection)
                                  ↓
                            Batch 3B.6 (Revision: Outline, Article + RevisionDiff)
                                  ↓
                            Batch 3B.7 (Rollback, Completion, Resume, Error handling)
                                  ↓
                            Batch 3B.8 (Integration verification + docs)
```

Each batch = 1 commit. Batches are sequential (each depends on the previous).

---

## Batch 3B.1: Foundation (1 commit)

**Goal:** Minimal working shell — serves page, authenticates, shows session start form.

### Task 3B.1.1 — Create `console/index.html`

**Files:**
- Create: `console/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ALN Director Console</title>
  <link rel="stylesheet" href="console.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Source+Code+Pro:wght@400;600&family=Newsreader:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body>
  <div id="root"></div>
  <!-- Load order defines dependency graph -->
  <script type="text/babel" src="api.js"></script>
  <script type="text/babel" src="state.js"></script>
  <script type="text/babel" src="utils.js"></script>
  <script type="text/babel" src="components/LoginOverlay.js"></script>
  <script type="text/babel" src="components/SessionStart.js"></script>
  <script type="text/babel" src="app.js"></script>
</body>
</html>
```

### Task 3B.1.2 — Create `console/api.js`

**Files:**
- Create: `console/api.js`

API client module. All methods include `credentials: 'include'` for cookies and return parsed JSON. Exports to `window.Console.api`.

Methods:
- `login(password)` → POST `/api/auth/login` → `{ success, message }`
- `checkAuth()` → GET `/api/auth/check` → `{ authenticated }`
- `logout()` → POST `/api/auth/logout` → `{ success }`
- `startSession(sessionId, rawInput)` → POST `/api/session/:id/start` with `{ theme: 'journalist', rawSessionInput: rawInput }`
- `approve(sessionId, payload, onProgress)` → SSE-before-POST pattern:
  1. Connect SSE, wait for 'connected'
  2. POST `/api/session/:id/approve` with payload
  3. Return `{ response, eventSource }`
- `rollback(sessionId, rollbackTo, overrides)` → POST `/api/session/:id/rollback`
- `resume(sessionId)` → POST `/api/session/:id/resume`
- `getCheckpoint(sessionId)` → GET `/api/session/:id/checkpoint`
- `getState(sessionId)` → GET `/api/session/:id/state`
- `connectSSE(sessionId, onProgress)` → Returns `{ eventSource, connected: Promise }`. Parses SSE events and calls `onProgress(event)` for each. Handles heartbeats, errors, and cleanup.

### Task 3B.1.3 — Create `console/state.js`

**Files:**
- Create: `console/state.js`

State reducer with `initialState` and `ACTIONS` as defined in the State Machine section above. Exports `window.Console.useAppState` (wraps `React.useReducer`) and `window.Console.ACTIONS`.

Reducer handles all action types. Key transitions:
- `PROCESSING_START` → `{ processing: true, progressMessages: [], llmActivity: null, error: null }`
- `SSE_PROGRESS` → append to `progressMessages` (keep last 50)
- `SSE_COMPLETE` → `{ processing: false, sseConnected: false }` (caller dispatches CHECKPOINT_RECEIVED separately)
- `CHECKPOINT_RECEIVED` → `{ checkpointType, checkpointData, phase }` extracted from payload
- `WORKFLOW_COMPLETE` → `{ completedResult, processing: false, checkpointType: null }`

### Task 3B.1.4 — Create `console/utils.js`

**Files:**
- Create: `console/utils.js`

Shared display utilities. Exports to `window.Console.utils`:

```javascript
window.Console.utils = {
  truncate(str, maxLen = 80) { /* ... */ },
  Badge({ label, color }) { /* React component: colored pill badge */ },
  CollapsibleSection({ title, defaultOpen, children }) { /* React component */ },
  JsonViewer({ data, label }) { /* React component: collapsible <pre> with formatted JSON */ },
  formatElapsed(ms) { /* "1m 23s" or "45s" */ },
  CHECKPOINT_ORDER: [
    'input-review', 'paper-evidence-selection', 'await-roster', 'character-ids',
    'await-full-context', 'pre-curation', 'evidence-and-photos', 'arc-selection',
    'outline', 'article'
  ],
  CHECKPOINT_LABELS: {
    'input-review': 'Input Review',
    'paper-evidence-selection': 'Paper Evidence',
    'await-roster': 'Roster',
    'character-ids': 'Character IDs',
    'await-full-context': 'Full Context',
    'pre-curation': 'Pre-Curation',
    'evidence-and-photos': 'Evidence Bundle',
    'arc-selection': 'Arc Selection',
    'outline': 'Outline',
    'article': 'Article'
  }
};
```

### Task 3B.1.5 — Create `console/components/LoginOverlay.js`

**Files:**
- Create: `console/components/LoginOverlay.js`

Full-screen overlay with glass panel. Password input, submit button. On submit: `api.login(password)`. Success: dispatches `LOGIN_SUCCESS`. Failure: shows error. Exports `window.Console.LoginOverlay`.

### Task 3B.1.6 — Create `console/components/SessionStart.js`

**Files:**
- Create: `console/components/SessionStart.js`

Session ID input (4-digit MMDD). Two buttons: "Start Fresh" and "Resume".

- Start: calls `api.startSession(sessionId, { photosPath: 'data/' + sessionId + '/photos' })`. On checkpoint response: dispatches `SET_SESSION` then `CHECKPOINT_RECEIVED`.
- Resume: calls `api.getCheckpoint(sessionId)`. If interrupted, dispatches `SET_SESSION` then `CHECKPOINT_RECEIVED`. If not interrupted, calls `api.resume(sessionId)`.

Exports `window.Console.SessionStart`.

### Task 3B.1.7 — Create `console/app.js`

**Files:**
- Create: `console/app.js`

Root component. On mount: `api.checkAuth()` → dispatch `LOGIN_SUCCESS` or show login. Renders:
- If not authenticated: `LoginOverlay`
- If no session: `SessionStart`
- If processing: `ProgressStream` (placeholder div for now — added in Batch 3B.2)
- If at checkpoint: checkpoint component (placeholder — wired in Batch 3B.3)
- If complete: completion view (placeholder — added in Batch 3B.7)

Header: session ID display, logout button.

Mounts app: `ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App))`.

Exports `window.Console.App` (consumed by itself for mounting).

### Task 3B.1.8 — Create `console/console.css`

**Files:**
- Create: `console/console.css`

Foundation CSS with all design tokens (CSS variables from Design Tokens section), reset, typography, glass panel base class, login overlay styles, session start form styles, header styles, button styles, input styles, error banner styles.

Use the `@frontend-design` skill aesthetic: noir theme, glass-morphism, amber/cyan accents.

### Task 3B.1.9 — Add console route to `server.js`

**Files:**
- Modify: `server.js`

Add after the existing `app.use(express.static(__dirname))` line (~line 267):

```javascript
app.use('/console', express.static(path.join(__dirname, 'console')));
app.get('/console/*', (req, res) => res.sendFile(path.join(__dirname, 'console', 'index.html')));
```

### Task 3B.1.10 — Verify Batch 3B.1

**Steps:**
1. `npm start` — server starts without errors
2. Open `http://localhost:3001/console` — page loads, CDN scripts load
3. Enter wrong password — see error message
4. Enter correct password (from .env ACCESS_PASSWORD) — see session start form
5. Enter session ID "1221" and click Resume — see API call (may show checkpoint data or error depending on session state)

**Commit:** `feat: add console frontend shell with auth, API client, and session start`

---

## Batch 3B.2: SSE Progress + Checkpoint Infrastructure (1 commit)

**Goal:** ProgressStream component, PipelineProgress stepper, CheckpointShell wrapper.

### Task 3B.2.1 — Create `console/components/ProgressStream.js`

**Files:**
- Create: `console/components/ProgressStream.js`

Component rendered when `state.processing === true`. Shows:
- Animated pulsing indicator (CSS animation)
- Current operation label + model (from `state.llmActivity`)
- Elapsed time counter (updates every second via `setInterval`, computed from `llmActivity.startTime`)
- Rolling progress messages (last 10 from `state.progressMessages`)
- Collapsible "Full LLM Activity" panel showing prompt/response when available

Props: `{ processing, llmActivity, progressMessages }`

Exports `window.Console.ProgressStream`.

### Task 3B.2.2 — Create `console/components/PipelineProgress.js`

**Files:**
- Create: `console/components/PipelineProgress.js`

Horizontal stepper bar with 10 steps. Uses `utils.CHECKPOINT_ORDER` and `utils.CHECKPOINT_LABELS`.

Props: `{ currentCheckpoint, completedCheckpoints, onRollback }`

States per step:
- **Completed** (solid amber fill): `completedCheckpoints` includes this type → clickable, calls `onRollback(type)`
- **Active** (pulsing cyan glow): `currentCheckpoint === type`
- **Pending** (dim outline): neither completed nor active

Completed checkpoints list is computed: all checkpoints before `currentCheckpoint` in CHECKPOINT_ORDER.

Exports `window.Console.PipelineProgress`.

### Task 3B.2.3 — Create `console/components/CheckpointShell.js`

**Files:**
- Create: `console/components/CheckpointShell.js`

Shared wrapper for all checkpoint components.

Props: `{ type, phase, data, children }`

Renders:
- Checkpoint header (type label from `utils.CHECKPOINT_LABELS`, phase string)
- `{children}` — the checkpoint-specific content
- "View Raw JSON" toggle (collapsible `<pre>` with `JSON.stringify(data, null, 2)`)

Exports `window.Console.CheckpointShell`.

### Task 3B.2.4 — Wire infrastructure into app.js

**Files:**
- Modify: `console/app.js`
- Modify: `console/index.html` (add `<script>` tags for new components)

Add `ProgressStream` and `PipelineProgress` rendering to App. When `processing`, show ProgressStream. When at checkpoint, show PipelineProgress above checkpoint content.

Wire `onApprove` flow:
1. Dispatch `PROCESSING_START`
2. Call `api.approve(sessionId, payload, onProgress)` where `onProgress` dispatches SSE events
3. On SSE `complete` event: dispatch `CHECKPOINT_RECEIVED` or `WORKFLOW_COMPLETE`
4. On SSE error: dispatch `SSE_ERROR`

### Task 3B.2.5 — Add infrastructure CSS

**Files:**
- Modify: `console/console.css`

Styles for: progress stream (spinner animation, message log), pipeline stepper (dots, labels, glow animation), checkpoint shell (header, raw JSON panel), collapsible sections.

### Task 3B.2.6 — Verify Batch 3B.2

**Steps:**
1. `npm start`, open console, login
2. Resume session at any checkpoint — verify PipelineProgress renders with correct active step
3. Approve a checkpoint — verify ProgressStream shows with animation and progress messages
4. After processing completes — verify next checkpoint loads
5. Verify "View Raw JSON" toggle shows checkpoint data

**Commit:** `feat: add SSE progress stream, pipeline stepper, and checkpoint shell`

---

## Batch 3B.3: Simple Display Checkpoints (1 commit)

**Goal:** InputReview, PaperEvidence, PreCuration — the three simplest checkpoint displays.

### Task 3B.3.1 — Create `console/components/checkpoints/InputReview.js`

**Files:**
- Create: `console/components/checkpoints/InputReview.js`

**Data shape received** (from `getCheckpointData` for `input-review`):
```javascript
{
  parsedInput: { sessionId, parsedAt, processingTimeMs },
  sessionConfig: {
    sessionId, journalistName, roster: string[],
    accusation: { accused, reasoning, confidence }
  },
  directorNotes: { observations: string[], whiteboard: { connectionsMade, questionsRaised, votingResults } },
  playerFocus: { primaryInvestigation, primarySuspects: string[], playerTheory, confidenceLevel, secondaryThreads: string[] }
}
```

**Displays:** Session info, roster (tag list), accusation (with confidence badge), player focus sections, director observations (bulleted), whiteboard data.

**Actions:** Approve button only (edit mode deferred — approve-as-is is sufficient for MVP).

**Payload:** `{ inputReview: true }`

Exports `window.Console.checkpoints.InputReview`.

### Task 3B.3.2 — Create `console/components/checkpoints/PaperEvidence.js`

**Files:**
- Create: `console/components/checkpoints/PaperEvidence.js`

**Data shape received** (from `getCheckpointData` for `paper-evidence-selection`):
```javascript
{
  paperEvidence: [
    { name|title, type, category, owner, dateFound, description, attachments: any[] }
  ]
}
```

**Displays:** Numbered list of evidence items. Each shows: name, type+category badges, owner, date, description (truncated 80 chars with expand), attachment count.

**Actions:** "Select All" checkbox at top. Individual checkboxes per item. Submit button.

**State:** `selectedItems` set — initialized to all items.

**Payload:** `{ selectedPaperEvidence: selectedItems }` (full item objects, not just IDs)

Exports `window.Console.checkpoints.PaperEvidence`.

### Task 3B.3.3 — Create `console/components/checkpoints/PreCuration.js`

**Files:**
- Create: `console/components/checkpoints/PreCuration.js`

**Data shape received** (from `getCheckpointData` for `pre-curation`):
```javascript
{
  preCurationSummary: string,  // markdown summary
  preprocessedEvidence: {
    items: [
      { id, sourceType: 'memory-token'|'paper-evidence', disposition: 'exposed'|'buried', summary, content, significance }
    ]
  }
}
```

**Displays:** Summary counts (total, exposed/buried, tokens/paper). Preview of first 5 items with disposition badges (EXPOSED green / BURIED amber). Expandable full list via CollapsibleSection.

**Actions:** Approve only (read-only checkpoint).

**Payload:** `{ preCuration: true }`

Exports `window.Console.checkpoints.PreCuration`.

### Task 3B.3.4 — Wire checkpoints into app.js

**Files:**
- Modify: `console/app.js`
- Modify: `console/index.html` (add `<script>` tags for checkpoint files)

Add checkpoint type → component mapping:
```javascript
const CHECKPOINT_COMPONENTS = {
  'input-review': checkpoints.InputReview,
  'paper-evidence-selection': checkpoints.PaperEvidence,
  'pre-curation': checkpoints.PreCuration,
  // ... more added in subsequent batches
};
```

When `checkpointType` is set, render the matching component inside `CheckpointShell`, passing `data`, `onApprove`, `onReject`.

### Task 3B.3.5 — Add checkpoint display CSS

**Files:**
- Modify: `console/console.css`

Styles for: section boxes with colored borders, confidence badges (high=green, medium=amber, low=red), disposition badges, checkbox list, evidence item cards, tag lists.

### Task 3B.3.6 — Verify Batch 3B.3

**Steps:**
1. Resume session 1221 (or any session at input-review checkpoint)
2. Verify InputReview renders with roster, accusation, player focus
3. Approve → verify PaperEvidence renders with item list
4. Toggle "Select All" → verify checkboxes respond
5. Approve → continue to next checkpoint
6. Navigate to pre-curation checkpoint — verify summary and item preview

**Commit:** `feat: add InputReview, PaperEvidence, and PreCuration checkpoints`

---

## Batch 3B.4: Data Input Checkpoints (1 commit)

**Goal:** AwaitRoster, CharacterIds, AwaitFullContext — checkpoints that collect user input.

### Task 3B.4.1 — Create `console/components/checkpoints/AwaitRoster.js`

**Files:**
- Create: `console/components/checkpoints/AwaitRoster.js`

**Data shape received:** `{ genericPhotoAnalyses?, whiteboardPhotoPath? }` (may be mostly empty)

**Displays:** Explanation of why roster is needed. Generic photo analyses (first 3, truncated) if available. Whiteboard status.

**Input:** Tag-style input — user types name, presses comma or Enter → name becomes a removable tag chip. Can remove with X button.

**State:** `tags: string[]`

**Payload:** `{ roster: tags }`

Exports `window.Console.checkpoints.AwaitRoster`.

### Task 3B.4.2 — Create `console/components/checkpoints/CharacterIds.js`

**Files:**
- Create: `console/components/checkpoints/CharacterIds.js`

**Data shape received:**
```javascript
{
  sessionPhotos: string[],
  photoAnalyses: {
    analyses: [
      { relevanceScore, visualContent, environmentDetails, characterDescriptions: [{ description, role, physicalMarkers }], suggestedCaption }
    ]
  },
  sessionConfig: { roster: string[] }
}
```

**Displays:** Roster sidebar for reference. Photo gallery: each photo shows filename, relevance score (color-coded bar: green >7, amber 4-7, red <4), visual content (truncated 120 chars), character descriptions with role badges (CENTRAL/SUPPORTING/BACKGROUND), physical markers, suggested caption.

**Input:** Three modes via radio buttons:
1. **Skip** (default) — no character mapping
2. **Natural text** — textarea for free-form descriptions
3. **JSON** — code textarea for structured mappings

**Payload:**
- Skip: `{ characterIds: {} }`
- Natural: `{ characterIdsRaw: textareaValue }`
- JSON: `{ characterIds: JSON.parse(textareaValue) }`

Exports `window.Console.checkpoints.CharacterIds`.

### Task 3B.4.3 — Create `console/components/checkpoints/AwaitFullContext.js`

**Files:**
- Create: `console/components/checkpoints/AwaitFullContext.js`

**Data shape received:** `{ roster?, whiteboardAnalysis? }` (what's been provided so far)

**Displays:** What's already provided (roster list, whiteboard status). What's still needed.

**Input:** Three text areas:
- Accusation (single-line input, required)
- Session Report (multiline textarea, required)
- Director Notes (multiline textarea, required)

**Validation:** All three fields must be non-empty. Submit button disabled until valid.

**Payload:** `{ fullContext: { accusation, sessionReport, directorNotes } }`

Exports `window.Console.checkpoints.AwaitFullContext`.

### Task 3B.4.4 — Wire into app.js + CSS

**Files:**
- Modify: `console/app.js` (add to CHECKPOINT_COMPONENTS map)
- Modify: `console/index.html` (add script tags)
- Modify: `console/console.css` (tag input chips, photo gallery cards, relevance bars, role badges, textarea styling, form validation states)

### Task 3B.4.5 — Verify Batch 3B.4

**Steps:**
1. Start fresh session or rollback to await-roster
2. Enter roster names as tags → verify tag chips render with X buttons
3. Remove a tag → verify it disappears
4. Submit roster → verify character-ids shows with photo gallery
5. Test "Natural text" mode → submit → verify pipeline advances
6. Continue to await-full-context → fill all 3 fields → submit

**Commit:** `feat: add data input checkpoints (roster, character IDs, full context)`

---

## Batch 3B.5: Complex Display Checkpoints (1 commit)

**Goal:** EvidenceBundle and ArcSelection — the two most data-rich display checkpoints.

### Task 3B.5.1 — Create `console/components/checkpoints/EvidenceBundle.js`

**Files:**
- Create: `console/components/checkpoints/EvidenceBundle.js`

**Data shape received:**
```javascript
{
  evidenceBundle: {
    exposed: {
      tokens: [{ id|tokenId, owner|ownerLogline, summary|content, ... }],
      paperEvidence: [{ title|name, category|type, description, ... }]
    },
    buried: {
      transactions: [{ amount|value, account|shellAccount, time|timestamp, ... }],
      relationships: any[]
    },
    context: {
      characterProfiles: { [name]: {...} },
      timeline: { [key]: {...} }
    },
    curatorNotes: { dispositionSummary, curationRationale, layerRationale, characterCoverage },
    curationReport: {
      excluded: [{ name, score, rescuable, reasons|reason }],
      curationSummary: { rosterPlayers, suspects, totalCurated, totalExcluded, humanRescued }
    }
  },
  _excludedItemsCache: { [itemName]: { ... } }
}
```

**Displays:** Three-layer collapsible sections:
- **Exposed** (green border `--layer-exposed`): Tokens (ID, owner, summary truncated 70 chars) + paper evidence (title, category, description truncated 60 chars). First 5 items, expandable.
- **Buried** (red border `--layer-buried`): Transactions (amount, account, time, first 3) + relationship count only.
- **Context** (cyan border `--layer-context`): Character profile count + timeline entry count.
- **Curator Notes**: Disposition summary, rationale, character coverage.
- **Excluded Items** (amber border `--layer-excluded`): Items with rescuable badges, exclusion reasons, scores. Rescue checkboxes only for `rescuable === true` items.
- **Curation Summary**: Roster players, suspects, curated/excluded counts.

**State:** `rescuedItems: Set<string>` — names of items user wants to rescue.

**Actions:** "Approve" or "Approve + Rescue Selected".

**Payload:**
- No rescue: `{ evidenceBundle: true }`
- With rescue: `{ evidenceBundle: true, rescuedItems: [...rescuedItems] }`

Exports `window.Console.checkpoints.EvidenceBundle`.

### Task 3B.5.2 — Create `console/components/checkpoints/ArcSelection.js`

**Files:**
- Create: `console/components/checkpoints/ArcSelection.js`

**Data shape received:**
```javascript
{
  narrativeArcs: [{
    id|title, title, evidenceStrength, arcSource, emotionalTone, hook,
    keyMoments: string[]|[{description}],
    evidence: [{ tokenId|id, layer }],
    characterPlacements: { [name]: role },
    financialConnections: string[]|[{description}],
    thematicLinks: string[],
    evaluationHistory: { overallScore, structuralIssues }
  }]
}
```

**Displays:** Arc cards in responsive grid. Each card:
- Title + evidence strength badge (HIGH=green, MEDIUM=amber, LOW=red)
- Source + emotional tone
- Hook text (full)
- Key moments (first 3, truncated 60 chars, expandable)
- Evidence breakdown (total, exposed/buried split)
- Character placements (name: role)
- Financial connections (first 2, truncated 50 chars)
- Thematic links
- Evaluation score bar + issues count

Checkbox on each card for selection. "Select 3-5 arcs" hint. Minimum 1 validation.

**State:** `selectedArcs: Set<string>` — arc IDs.

**Payload:** `{ selectedArcs: [...selectedArcs] }`

Exports `window.Console.checkpoints.ArcSelection`.

### Task 3B.5.3 — Wire + CSS

**Files:**
- Modify: `console/app.js`, `console/index.html`, `console/console.css`

CSS for: evidence layer sections (colored left borders), arc cards grid, strength/evaluation badges, collapsible animations, rescue checkboxes, arc selection highlighting.

### Task 3B.5.4 — Verify Batch 3B.5

**Steps:**
1. Navigate to evidence-and-photos checkpoint (session 1221 if available at that stage)
2. Verify three layers render with correct colored borders
3. Expand collapsed sections
4. Test rescue checkbox selection
5. Approve → verify arc-selection shows with arc cards
6. Select 3 arcs → approve → pipeline advances

**Commit:** `feat: add evidence bundle and arc selection checkpoints`

---

## Batch 3B.6: Revision Loop Checkpoints (1 commit)

**Goal:** Outline and Article with three action modes and revision diff display.

**Depends on:** Sub-Phase 3A (complete) for reject-with-feedback backend support.

### Task 3B.6.1 — Create `console/components/RevisionDiff.js`

**Files:**
- Create: `console/components/RevisionDiff.js`

Shared component for outline/article revision display.

Props: `{ previous, current, revisionCount, maxRevisions, previousFeedback }`

Shows:
- Revision number banner: "Revision N of {maxRevisions}" with budget indicator (green if < max, amber at max-1, red at max)
- Previous feedback display (if available)
- Shallow object diff: added keys (green +), modified keys (amber ~), removed keys (red -), unchanged (gray =). Compares top-level keys of `previous` vs `current`.
- Escalation warning when `revisionCount >= maxRevisions`: prominent banner

Only renders if `previous !== null` (i.e., revision > 0).

Exports `window.Console.RevisionDiff`.

### Task 3B.6.2 — Create `console/components/checkpoints/Outline.js`

**Files:**
- Create: `console/components/checkpoints/Outline.js`

**Data shape received:**
```javascript
{
  outline: {
    lede: { hook, keyTension, selectedEvidence? },
    theStory: { arcs: [{ name, paragraphCount, keyPoints, evidenceCards, photoPlacement }], arcInterweaving },
    followTheMoney: { arcConnections|focus, shellAccounts },
    thePlayers: { arcConnections|focus, characterHighlights },
    whatsMissing: { arcConnections|focus, buriedItems },
    closing: { arcResolutions|theme, systemicAngle, finalLine },
    pullQuotes: [{ text, attribution, placement }]
  },
  evaluationHistory: { overallScore, structuralIssues, advisoryNotes }
}
```

**Displays:** Full outline in structured sections (LEDE, THE STORY, etc.). Evaluation status bar (score, issues). Revision diff (if `revisionCache.outline` exists in state).

**Three action modes:**
1. **Approve**: Button → `{ outline: true }`
2. **Edit & Approve**: Opens inline JSON editor (textarea pre-populated with `JSON.stringify(outline, null, 2)`). Save → `{ outline: true, outlineEdits: JSON.parse(editedText) }`
3. **Reject**: Opens feedback textarea. Submit → dispatches `CACHE_REVISION` with current outline, then sends `{ outline: false, outlineFeedback: feedbackText }`

**State:** `mode: 'view'|'edit'|'reject'`, `editText: string`, `feedbackText: string`

Exports `window.Console.checkpoints.Outline`.

### Task 3B.6.3 — Create `console/components/checkpoints/Article.js`

**Files:**
- Create: `console/components/checkpoints/Article.js`

**Data shape received:**
```javascript
{
  contentBundle: {
    metadata, headline: { main, kicker, deck },
    byline: { author, title, location, date },
    heroImage: { filename, caption, characters },
    sections: [{ id, type, heading, content: [{ type, text|items|... }] }],
    pullQuotes, evidenceCards, photos, financialTracker
  },
  assembledHtml: string  // or articleHtml
}
```

**Displays:** Full article content rendered from contentBundle. Sections with typed content blocks:
- `paragraph` → `<p>` with word wrapping
- `quote` → styled `<blockquote>` with attribution
- `evidence-reference` → linked card
- `photo` → image placeholder with caption
- `list` → `<ul>` or `<ol>`

Evaluation status bar. Revision diff. Word count estimate.

**HTML Preview:** Toggle button that shows `assembledHtml` in a sandboxed `<iframe srcDoc={html}>`.

**Three action modes:** Same pattern as Outline:
1. Approve → `{ article: true }`
2. Edit & Approve → `{ article: true, articleEdits: editedBundle }`
3. Reject → cache + `{ article: false, articleFeedback: text }`

Exports `window.Console.checkpoints.Article`.

### Task 3B.6.4 — Wire CACHE_REVISION in state.js

**Files:**
- Modify: `console/state.js`

Add `CACHE_REVISION` handler:
```javascript
case ACTIONS.CACHE_REVISION:
  return { ...state, revisionCache: {
    ...state.revisionCache,
    [action.contentType]: action.data  // 'outline' or 'article'
  }};
```

### Task 3B.6.5 — Wire + CSS

**Files:**
- Modify: `console/app.js`, `console/index.html`, `console/console.css`

CSS for: revision diff banners, evaluation bar, feedback textarea, outline section cards, article content blocks, HTML preview iframe (sandboxed, max-height), pull quote styling, financial tracker table, edit mode textarea.

### Task 3B.6.6 — Verify Batch 3B.6

**Steps:**
1. Navigate to outline checkpoint
2. Verify full outline renders with all sections
3. Click "Edit & Approve" → verify JSON editor opens with outline data
4. Cancel edit → click "Reject" → enter feedback → submit
5. Verify SSE progress during revision generation
6. On revision return: verify revision diff banner shows
7. Approve outline → verify article checkpoint
8. Test HTML preview toggle (iframe with assembled HTML)
9. Test article reject → revision cycle

**Commit:** `feat: add outline and article checkpoints with revision diff and HTML preview`

---

## Batch 3B.7: Rollback, Completion, Resume, Error Handling (1 commit)

**Goal:** Complete the UI with rollback, completion, and error handling.

### Task 3B.7.1 — Create `console/components/RollbackPanel.js`

**Files:**
- Create: `console/components/RollbackPanel.js`

Modal dialog triggered by clicking completed checkpoint in PipelineProgress.

Props: `{ targetCheckpoint, onConfirm, onCancel }`

Shows:
- Target checkpoint name
- Warning about data loss ("This will clear all data from this point forward")
- Optional: "State Overrides" collapsible textarea for advanced JSON input (collapsed by default)
- Confirm / Cancel buttons

On confirm: calls `onConfirm(targetCheckpoint, stateOverrides)`.

Exports `window.Console.RollbackPanel`.

### Task 3B.7.2 — Create `console/components/CompletionView.js`

**Files:**
- Create: `console/components/CompletionView.js`

Rendered when `state.completedResult` is set.

Props: `{ result, onNewSession }`

Shows:
- Success banner
- Session summary (sessionId, output path)
- "View Report" button → opens HTML in new tab (`window.open`)
- Validation results (if present)
- "Start New Session" button → calls `onNewSession` (resets state)

Exports `window.Console.CompletionView`.

### Task 3B.7.3 — Wire rollback flow in app.js

**Files:**
- Modify: `console/app.js`

When PipelineProgress's `onRollback` fires:
1. Show RollbackPanel modal
2. On confirm: dispatch `PROCESSING_START`, call `api.rollback(sessionId, target, overrides)`
3. On response: dispatch `CHECKPOINT_RECEIVED` with rollback result
4. On cancel: close modal

### Task 3B.7.4 — Add error handling

**Files:**
- Modify: `console/app.js`

Global error banner: appears at top when `state.error` is set. "Dismiss" button dispatches `CLEAR_ERROR`. Retry button for transient errors (calls last action again).

SSE connection loss: auto-reconnect with 3-second delay (max 3 retries).

### Task 3B.7.5 — Wire + CSS polish

**Files:**
- Modify: `console/index.html` (add script tags for RollbackPanel, CompletionView)
- Modify: `console/console.css`

CSS for: rollback modal (centered overlay, glass panel), completion view (success banner), error banner (red accent), transitions (fade-in for checkpoint changes), responsive breakpoints (min-width: 768px for tablet, 1024px for desktop), focus states for accessibility.

### Task 3B.7.6 — Verify Batch 3B.7

**Steps:**
1. Complete through arc-selection → click a completed checkpoint in stepper
2. Verify rollback confirmation dialog appears
3. Confirm rollback → verify pipeline resets to that checkpoint
4. Run full pipeline to completion → verify completion screen
5. Click "View Report" → verify HTML opens in new tab
6. Click "Start New Session" → verify state resets
7. Kill server during processing → verify error banner appears

**Commit:** `feat: add rollback, completion, resume, and error handling to console`

---

## Batch 3B.8: Integration Verification + Docs (1 commit)

**Goal:** Full pipeline walkthrough, documentation update.

### Task 3B.8.1 — Full pipeline walkthrough

Manual verification steps:
1. Start fresh session via console UI
2. Walk through all 10 checkpoints, approving each
3. Verify: SSE progress shows during each processing phase
4. Verify: pipeline stepper updates correctly
5. Verify: completion screen shows with valid HTML report
6. Open report in new tab → verify it renders

### Task 3B.8.2 — Test revision loops

1. At outline checkpoint: reject with feedback
2. Verify revision generates, diff displays
3. Approve revision
4. At article checkpoint: reject with feedback
5. Verify revision cycle works

### Task 3B.8.3 — Test rollback scenarios

1. Complete through arc-selection
2. Rollback to evidence-bundle → verify pipeline resets
3. Re-approve → verify arcs regenerate

### Task 3B.8.4 — Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (the reports-level one)

Add section documenting:
- Console access: `http://localhost:3001/console`
- File structure overview (`console/` directory)
- How to modify checkpoint components
- CDN dependencies (React 18, Babel standalone)

### Task 3B.8.5 — Update master roadmap

**Files:**
- Modify: `C:\Users\spide\.claude\plans\structured-purring-cook.md`

Mark Phase 3 complete with findings. Note any Phase 4 impacts.

**Commit:** `docs: update CLAUDE.md and roadmap for Phase 3 console frontend`

---

## Critical Files Summary

| File | Role | Batch |
|------|------|-------|
| `console/index.html` | SPA shell, CDN scripts, load order | 3B.1 |
| `console/console.css` | All styles (CSS variables, noir theme) | 3B.1+ |
| `console/api.js` | REST client + SSE-before-POST | 3B.1 |
| `console/state.js` | useReducer state machine | 3B.1 |
| `console/utils.js` | Shared utilities (truncate, badges, constants) | 3B.1 |
| `console/app.js` | Root component, auth gate, checkpoint router | 3B.1+ |
| `console/components/LoginOverlay.js` | Auth overlay | 3B.1 |
| `console/components/SessionStart.js` | Session ID + start/resume | 3B.1 |
| `console/components/ProgressStream.js` | SSE progress display | 3B.2 |
| `console/components/PipelineProgress.js` | 10-step stepper | 3B.2 |
| `console/components/CheckpointShell.js` | Shared wrapper | 3B.2 |
| `console/components/checkpoints/*.js` | 10 checkpoint components | 3B.3-3B.6 |
| `console/components/RevisionDiff.js` | Shared diff display | 3B.6 |
| `console/components/RollbackPanel.js` | Rollback dialog | 3B.7 |
| `console/components/CompletionView.js` | Done screen | 3B.7 |
| `server.js` | 2-line static serving addition | 3B.1 |

## Estimated Scope

- **8 batches, 8 commits**
- **~22 new files** in `console/` directory
- **~2 lines added** to `server.js`
- **~1 section added** to `CLAUDE.md`
- **Depends on** Sub-Phase 3A (complete) for outline/article rejection
