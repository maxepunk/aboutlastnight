# Article Checkpoint Resilience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent user edits from being lost when post-approval workflow fails, and prevent trivially invalid AI output from killing the pipeline.

**Architecture:** Three defensive layers: (1) sanitize AI-generated contentBundle before schema validation to remove trivially invalid blocks, (2) preserve user edits in reducer state so they survive the Article component unmounting during processing, (3) enable recovery from error state back to the article checkpoint.

**Tech Stack:** React 18 (CDN, no build), Express server, LangGraph workflow, JSON Schema (AJV)

---

## Root Cause Summary

**Bug 1 — Empty paragraphs kill pipeline:** The AI generated `{ "type": "paragraph", "text": "" }` which violates `minLength: 1` in the content-bundle schema. Schema validation sent the pipeline to END with error phase. This is a trivially fixable content issue that should never be fatal.

**Bug 2 — User edits lost on error:** When the user clicks "Approve with Edits", `PROCESSING_START` sets `processing: true`. The render priority chain (`processing` > `checkpointType`) unmounts the Article component, destroying its local `editedBundle` state. If the pipeline errors, the Article remounts fresh — edits gone.

**Bug 3 — Reject flow also fails:** When the user tried to reject the article (for revision), the same schema validation failure likely occurred on the revised content, OR the Opus SDK call timed out during `reviseContentBundle`. Either way, the error handling destroys the checkpoint state the same way, and the graph reaches a terminal error state with no way back to the checkpoint.

**Bug 4 — Dead-end error state:** Once the graph reaches `currentPhase: 'error'` at END, there's no recovery path. The graph is not interrupted, so `/approve` returns "Session is not at a checkpoint". The user must rollback or start over.

---

### Task 1: Sanitize contentBundle before schema validation

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js` (the `validateContentBundle` function, ~line 1238)
- Test: `__tests__/unit/workflow/ai-nodes.test.js` (add sanitization tests)

**Step 1: Write the failing test**

In `__tests__/unit/workflow/ai-nodes.test.js`, add a new describe block for `validateContentBundle`. If the test file doesn't have one already, add:

```javascript
describe('validateContentBundle', () => {
  it('removes empty paragraph blocks before validation', async () => {
    const state = {
      contentBundle: {
        metadata: { sessionId: '0216', theme: 'journalist', generatedAt: new Date().toISOString() },
        headline: { main: 'Test Headline That Is Long Enough' },
        sections: [{
          id: 'sec-1',
          type: 'narrative',
          heading: 'Test Section',
          content: [
            { type: 'paragraph', text: 'Valid paragraph with content.' },
            { type: 'paragraph', text: '' },  // Empty — should be removed
            { type: 'paragraph', text: 'Another valid paragraph.' }
          ]
        }]
      }
    };
    const config = { configurable: {} };

    const result = await validateContentBundle(state, config);

    // Should NOT error — empty paragraphs stripped before validation
    expect(result.currentPhase).not.toBe('error');
    expect(result.errors).toBeUndefined();
  });

  it('removes whitespace-only paragraph blocks', async () => {
    const state = {
      contentBundle: {
        metadata: { sessionId: '0216', theme: 'journalist', generatedAt: new Date().toISOString() },
        headline: { main: 'Test Headline That Is Long Enough' },
        sections: [{
          id: 'sec-1',
          type: 'narrative',
          heading: 'Test Section',
          content: [
            { type: 'paragraph', text: 'Valid text.' },
            { type: 'paragraph', text: '   ' }  // Whitespace-only
          ]
        }]
      }
    };
    const config = { configurable: {} };

    const result = await validateContentBundle(state, config);

    expect(result.currentPhase).not.toBe('error');
  });

  it('passes valid contentBundle without modification', async () => {
    const state = {
      contentBundle: {
        metadata: { sessionId: '0216', theme: 'journalist', generatedAt: new Date().toISOString() },
        headline: { main: 'Test Headline That Is Long Enough' },
        sections: [{
          id: 'sec-1',
          type: 'narrative',
          heading: 'Test Section',
          content: [
            { type: 'paragraph', text: 'Valid paragraph.' }
          ]
        }]
      }
    };
    const config = { configurable: {} };

    const result = await validateContentBundle(state, config);

    expect(result.currentPhase).not.toBe('error');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest __tests__/unit/workflow/ai-nodes.test.js -t "validateContentBundle" -v`
Expected: FAIL — empty paragraph causes schema validation error

**Step 3: Write minimal implementation**

In `lib/workflow/nodes/ai-nodes.js`, modify `validateContentBundle` to sanitize before validating:

```javascript
async function validateContentBundle(state, config) {
  const validator = getSchemaValidator(config);

  // Sanitize: remove empty/whitespace-only paragraph blocks (common AI generation artifact)
  const bundle = state.contentBundle;
  if (bundle?.sections) {
    for (const section of bundle.sections) {
      if (Array.isArray(section.content)) {
        section.content = section.content.filter(block => {
          if (block.type === 'paragraph' && (!block.text || !block.text.trim())) {
            console.log(`[validateContentBundle] Removed empty paragraph from section "${section.id || section.heading}"`);
            return false;
          }
          return true;
        });
      }
    }
  }

  const result = validator.validate('content-bundle', bundle);

  if (!result.valid) {
    return {
      currentPhase: PHASES.ERROR,
      errors: result.errors.map(e => ({
        phase: PHASES.VALIDATE_SCHEMA,
        type: 'schema-validation',
        ...e
      }))
    };
  }

  return {
    currentPhase: PHASES.VALIDATE_SCHEMA
  };
}
```

Note: We mutate `state.contentBundle.sections[].content` in-place. This is safe because LangGraph state is already a working copy at this point, and the sanitized version is what we want downstream in `assembleHtml`.

**Step 4: Run test to verify it passes**

Run: `npx jest __tests__/unit/workflow/ai-nodes.test.js -t "validateContentBundle" -v`
Expected: PASS

**Step 5: Run full test suite**

Run: `npx jest --verbose`
Expected: All tests pass

**Step 6: Commit**

```bash
git add lib/workflow/nodes/ai-nodes.js __tests__/unit/workflow/ai-nodes.test.js
git commit -m "fix: sanitize empty paragraphs before schema validation"
```

---

### Task 2: Preserve article edits in reducer state

**Files:**
- Modify: `console/state.js` (~line 9, add `pendingEdits` to initialState; ~line 79-86, preserve edits in PROCESSING_START)
- Modify: `console/components/checkpoints/Article.js` (~line 610 and ~line 748, read/write pendingEdits)

**Step 1: Add `pendingEdits` to state and preserve on PROCESSING_START**

In `console/state.js`, add `pendingEdits` to `initialState`:

```javascript
const initialState = {
  // ... existing fields ...
  // Pending edits (survives component unmount during processing)
  pendingEdits: null,
  // Errors
  error: null,
  // ...
};
```

Add a new action type:

```javascript
const ACTIONS = {
  // ... existing actions ...
  SAVE_PENDING_EDITS: 'SAVE_PENDING_EDITS',
  // ...
};
```

Add the reducer case:

```javascript
case ACTIONS.SAVE_PENDING_EDITS:
  return {
    ...state,
    pendingEdits: action.edits
  };
```

In the `CHECKPOINT_RECEIVED` case, clear pendingEdits when new checkpoint data arrives (edits were either applied or we're at a fresh checkpoint):

```javascript
case ACTIONS.CHECKPOINT_RECEIVED:
  return {
    ...state,
    checkpointType: action.checkpointType,
    checkpointData: action.data || {},
    phase: action.phase || state.phase,
    processing: false,
    pendingEdits: null  // Clear — new checkpoint data supersedes
  };
```

Also clear in `WORKFLOW_COMPLETE`:

```javascript
case ACTIONS.WORKFLOW_COMPLETE:
  return {
    ...state,
    completedResult: action.result,
    processing: false,
    checkpointType: null,
    pendingEdits: null  // Clear — workflow done
  };
```

**Step 2: Save edits before approve in Article.js**

In `console/components/checkpoints/Article.js`, modify `handleApprove` (~line 748):

```javascript
function handleApprove() {
  if (hasEdits && editedBundle) {
    // Persist edits in reducer state so they survive unmount during processing
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', edits: editedBundle });
    }
    onApprove({ article: true, articleEdits: editedBundle });
  } else {
    onApprove({ article: true });
  }
}
```

**Step 3: Restore edits on mount if pendingEdits exists**

In the Article component, accept `pendingEdits` from props and restore on mount. The `app.js` already passes all state-derived props. We need to thread `pendingEdits` through.

In `console/app.js`, pass `pendingEdits` to the checkpoint component. Find the `CHECKPOINT_COMPONENTS` rendering (~line 249) and add it:

```javascript
React.createElement(CHECKPOINT_COMPONENTS[state.checkpointType], {
  data: state.checkpointData,
  sessionId: state.sessionId,
  theme: state.theme,
  onApprove: handleApprove,
  onReject: handleReject,
  dispatch: dispatch,
  revisionCache: state.revisionCache,
  pendingEdits: state.pendingEdits  // Restore edits after error
})
```

In `Article.js`, update the component signature (~line 586) and restore logic:

```javascript
function Article({ data, sessionId: propSessionId, theme, onApprove, onReject, dispatch, revisionCache, pendingEdits }) {
```

Add after the `useEffect` reset block (~line 632), a second effect to restore pending edits:

```javascript
// Restore edits from reducer state if component remounted after processing error
React.useEffect(function () {
  if (pendingEdits && !editedBundle) {
    setEditedBundle(pendingEdits);
    setHasEdits(true);
  }
}, [pendingEdits]);
```

**Step 4: Manual test**

1. Start server, reach article checkpoint
2. Make an edit to a paragraph
3. Temporarily break something to cause a pipeline error (or test with current empty paragraph bug before Task 1 fix)
4. Verify edits are preserved after the error banner appears
5. Verify edits clear when new checkpoint data arrives (rollback or successful advance)

**Step 5: Commit**

```bash
git add console/state.js console/components/checkpoints/Article.js console/app.js
git commit -m "fix: preserve article edits across processing errors"
```

---

### Task 3: Enable recovery from error state at article checkpoint

**Files:**
- Modify: `server.js` (~line 903, in `/api/session/:id/approve` endpoint)
- Modify: `console/app.js` (~line 129, handle error phase with checkpoint recovery)

**Step 1: Handle error-state recovery on the server**

The problem: after a schema validation failure, the graph is at END with `currentPhase: 'error'` and `articleApproved: true`. It's not interrupted, so `/approve` returns 400.

The fix: when the graph is NOT interrupted but the state shows `articleApproved: true` and `currentPhase: 'error'`, allow the user to retry. The server should reset `articleApproved` to `false` and re-invoke the graph from the article checkpoint.

In `server.js`, modify the `/api/session/:id/approve` endpoint. After the `isGraphInterrupted` check (~line 917), add a recovery path:

```javascript
// Check if graph is interrupted using native LangGraph pattern
const graphState = await graph.getState(config);
if (!graphState || !isGraphInterrupted(graphState)) {
    // Recovery path: if graph ended with error after article approval,
    // allow retry by rolling back articleApproved
    const stateValues = graphState?.values || {};
    if (stateValues.currentPhase === 'error' && stateValues.articleApproved === true) {
        console.log(`[${new Date().toISOString()}] Recovering from article error state for session ${sessionId}`);
        // Use the rollback endpoint logic to go back to article checkpoint
        return res.status(400).json({
            sessionId,
            error: 'Session ended with error after article approval. Use rollback to return to article checkpoint.',
            recoverable: true,
            rollbackTo: 'article'
        });
    }

    return res.status(400).json({
        sessionId,
        error: 'Session is not at a checkpoint',
        currentPhase: stateValues.currentPhase || null
    });
}
```

**Step 2: Handle the recovery response in the frontend**

In `console/app.js`, when the SSE complete event has `currentPhase === 'error'`, check if the previous checkpoint was the article and keep the checkpoint UI visible:

The current handler (~line 129):
```javascript
} else if (result.currentPhase === 'error') {
  dispatch({
    type: APP_ACTIONS.SET_ERROR,
    message: result.error || 'Workflow error'
  });
}
```

Add recovery context:
```javascript
} else if (result.currentPhase === 'error') {
  dispatch({
    type: APP_ACTIONS.SET_ERROR,
    message: (result.error || 'Workflow error') +
      (result.details ? ' ' + result.details : '') +
      ' You can edit and retry, or use rollback.'
  });
  // Don't clear checkpointType — let the user retry from the same checkpoint
}
```

This already works because `SET_ERROR` only sets `state.error` without clearing `checkpointType`. The Article component will remain visible with the error banner above it.

**Step 3: Manual test**

1. Reach article checkpoint
2. Approve (the empty paragraph bug from Task 1 would trigger error)
3. Verify error banner appears with recovery message
4. Verify Article component is still visible with edits
5. After Task 1 fix: verify pipeline completes successfully

**Step 4: Commit**

```bash
git add server.js console/app.js
git commit -m "fix: enable recovery from article checkpoint error state"
```

---

### Task 4: Run full test suite and verify

**Step 1: Run all tests**

Run: `npx jest --verbose`
Expected: All tests pass (912+ existing + new sanitization tests)

**Step 2: Integration test with e2e-walkthrough**

If a session is available:
Run: `node scripts/e2e-walkthrough.js --session 0216 --step`
Verify: can view and approve the article checkpoint

**Step 3: Final commit if any cleanup needed**

---

## Execution Order

Tasks 1 and 2 are independent and can be done in parallel.
Task 3 depends on understanding from Tasks 1-2 but modifies different files.
Task 4 is verification — must run after all others.
