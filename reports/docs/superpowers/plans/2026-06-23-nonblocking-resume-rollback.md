# Non-Blocking /resume + /rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the blocking `/api/session/:id/resume` and `/api/session/:id/rollback` endpoints to the same non-blocking, SSE-driven contract as `/approve`, so a long-running re-invoke (e.g. `generateContentBundle`, ~400s) no longer dies at undici's 5-min `headersTimeout` (e2e harness) or Cloudflare's ~100s edge timeout (production console).

**Architecture:** Extract the `/approve` background-task machinery (CONC-1 session lock + DUR-2 drain tracking + DEL-1 outcome record + SSE `emitComplete`) into one shared, unit-tested helper `lib/api-background-runner.js`. Route `/resume`, `/rollback`, and `/approve` through it. Each endpoint keeps its own synchronous validation and supplies an `invoke` thunk + a `buildResponse` callback for its distinct response shape. Then update the two clients that consume these endpoints: the e2e harness (`/rollback` call needs the SSE arg) and the console (`api.resume`/`api.rollback` → SSE-before-POST, with a `pendingResume` hand-off for the `SessionStart` reconnect path that can't own a long-lived SSE).

**Tech Stack:** Node, Express, LangGraph (`@langchain/langgraph`) + SqliteSaver checkpointer, the Claude Agent SDK, Jest (node env, no jsdom). Console is React 18 via Babel-standalone CDN (zero build, no React test harness — wiring is verified by manual browser click-through, per `reports/CLAUDE.md`).

## Global Constraints

- **Zero new dependencies.** No supertest, no jsdom. Server unit tests require exported functions; console wiring is manually verified.
- **Never bypass the pre-commit hook** (`git commit --no-verify` is forbidden). Commit messages END with the trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Commit/push policy:** commit per task; do NOT push (the user manages pushing). Git root is the PARENT dir `C:\Users\spide\Documents\claudecode\aboutlastnight`; this project lives in `reports/`. Run all `npx jest` / `node` commands from `reports/`.
- **Graph-invoke semantics are UNCHANGED.** This plan only moves the existing `await graph.invoke(...)` off the HTTP response path into the background and delivers the result via SSE. Do not change what is invoked, the `durability: 'sync'` option, or `recursionLimit: RECURSION_LIMIT`.
- **The session lock is keyed on `sessionId` and is endpoint-agnostic** ([lib/session-locks.js](../../../lib/session-locks.js)). Routing resume/rollback/approve through it gives mutual exclusion across all three for free.
- **`/start` stays blocking** (it interrupts at the first checkpoint within seconds; background pipelines don't block it). Out of scope by decision.
- **`lib/observability/progress-bridge.js` is the sole source of progress strings/icons** — do not add display wording elsewhere.
- **`progressEmitter.emitComplete(sessionId, payload)` spreads the payload FLAT onto the SSE `complete` event** (`{ ...payload, type:'complete' }`) — clients read `currentPhase`/`checkpoint`/`interrupted`/`outputPath`/`rolledBackTo`/`fieldsCleared` directly off the event. Do not nest under `.result`.

---

## File Structure

- **`lib/api-background-runner.js`** (CREATE) — the shared non-blocking runner. Owns everything from lock-acquire onward: 409-on-contention, the immediate `{status:'processing'}` response, the `setImmediate` background invoke, `getState`, the `buildResponse` callback, outcome record, `emitComplete`, the error path, lock release, and inFlight tracking. Dependencies (`invoke`/`getState` thunks, lock/outcome/emit) are injected so it is unit-testable with fakes. ONE responsibility: the background-invoke lifecycle.
- **`lib/__tests__/api-background-runner.test.js`** (CREATE) — node-env unit tests driving the runner with fake thunks + fake deps.
- **`server.js`** (MODIFY) — `/resume` (~:1102), `/rollback` (~:1014), `/approve` (~:843) handlers delegate to the runner. Each keeps its synchronous validation and supplies `invoke`/`getState`/`buildResponse`. Add `require` for the runner.
- **`scripts/e2e-walkthrough.js`** (MODIFY, ~:3391) — the `--rollback` `apiCall` gains the `sessionId` SSE arg and reads the SSE-resolved completion payload.
- **`console/api.js`** (MODIFY, `resume` ~:123, `rollback` ~:108) — convert both to the SSE-before-POST pattern (`api.approve` is the template, ~:75) returning `{ response, eventSource }`.
- **`console/state.js`** (MODIFY) — add a `pendingResume` field + a `RESUME_REQUESTED` action so `SessionStart` can hand a streaming resume off to `App` (which owns the SSE lifecycle and `ProgressStream`).
- **`console/app.js`** (MODIFY) — extract `handleApprove`'s SSE-event switch into a shared `makeSseHandler`; add `streamingResume`/`streamingRollback`; convert `onRetry` (~:285) and `handleRollbackConfirm` (~:231) to streaming; add a `pendingResume` effect that drives `streamingResume`.
- **`console/components/SessionStart.js`** (MODIFY, `handleResume` ~:124) — the "not at a checkpoint" branch dispatches `RESUME_REQUESTED` instead of awaiting the blocking `api.resume`.

---

## Task 1: Shared background runner + unit tests

**Files:**
- Create: `lib/api-background-runner.js`
- Test: `lib/__tests__/api-background-runner.test.js`

**Interfaces:**
- Consumes: `lib/session-locks` (`acquireSessionLock`/`releaseSessionLock`), `lib/session-outcome` (`recordSessionOutcome`/`buildOutcomeRecord`), `lib/observability` (`progressEmitter`), `lib/workflow/state` (`PHASES`). All overridable via `deps` for tests.
- Produces: `runGraphInBackground({ sessionId, invoke, getState, buildResponse, res, inFlightTasks, processingExtra?, deps? }) → { scheduled: boolean, task: Promise|null }`.
  - `invoke: () => Promise<result>` — thunk wrapping `graph.invoke(invokeArg, {...config, durability:'sync', recursionLimit})`.
  - `getState: () => Promise<graphState>` — thunk wrapping `graph.getState(config)`.
  - `buildResponse: (result, graphState) => responseObject` — endpoint-specific SSE-completion payload. Defined in the handler so it closes over server.js helpers.
  - `res` — Express response; the runner sends `409` (contended) or `200 {status:'processing', ...processingExtra}`.
  - `inFlightTasks` — server-owned `Set` for SIGINT drain.
  - On 409 returns `{ scheduled:false, task:null }` and the caller must NOT have sent `res` yet.

- [ ] **Step 1: Write the failing tests.**

Create `lib/__tests__/api-background-runner.test.js`:
```javascript
const { runGraphInBackground } = require('../api-background-runner');

function makeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
}

// Deterministic fake deps. A real lock Set so acquire/release behave like production.
function makeDeps(overrides = {}) {
  const held = new Set();
  const emitted = [];
  const recorded = [];
  return {
    held, emitted, recorded,
    deps: {
      acquireSessionLock: (id) => { if (held.has(id)) return false; held.add(id); return true; },
      releaseSessionLock: (id) => { held.delete(id); },
      buildOutcomeRecord: (r) => ({ outcome: r.currentPhase === 'error' ? 'failed' : 'complete', from: r }),
      recordSessionOutcome: (id, rec) => { recorded.push({ id, rec }); },
      emitComplete: (id, payload) => { emitted.push({ id, payload }); },
      ...overrides
    }
  };
}

describe('runGraphInBackground', () => {
  it('409s when the session lock is already held, and schedules nothing', async () => {
    const { deps, held } = makeDeps();
    held.add('s1'); // pre-hold
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's1',
      invoke: async () => { throw new Error('should not invoke'); },
      getState: async () => ({}),
      buildResponse: () => ({}),
      res, inFlightTasks: inFlight, deps
    });
    expect(out.scheduled).toBe(false);
    expect(out.task).toBeNull();
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/already in progress/i);
    expect(inFlight.size).toBe(0);
  });

  it('happy path: sends processing, invokes, builds + emits the response, records outcome, releases lock, untracks', async () => {
    const { deps, held, emitted, recorded } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const result = { currentPhase: 'complete', outputPath: '/x.html' };
    const graphState = { values: {} };
    const built = { sessionId: 's2', currentPhase: 'complete', outputPath: '/x.html' };

    const out = runGraphInBackground({
      sessionId: 's2',
      invoke: async () => result,
      getState: async () => graphState,
      buildResponse: (r, gs) => { expect(r).toBe(result); expect(gs).toBe(graphState); return built; },
      res, inFlightTasks: inFlight,
      processingExtra: { previousPhase: 'article' },
      deps
    });

    expect(out.scheduled).toBe(true);
    expect(res.body).toEqual({ sessionId: 's2', status: 'processing', previousPhase: 'article' });
    expect(inFlight.has(out.task)).toBe(true); // tracked while running

    await out.task;

    expect(emitted).toEqual([{ id: 's2', payload: built }]);
    expect(recorded).toEqual([{ id: 's2', rec: { outcome: 'complete', from: built } }]);
    expect(held.has('s2')).toBe(false);      // lock released
    expect(inFlight.size).toBe(0);           // untracked after completion
  });

  it('invoke throws: emits + records a failed outcome, still releases lock and untracks', async () => {
    const { deps, held, emitted, recorded } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's3',
      invoke: async () => { throw new Error('boom'); },
      getState: async () => ({}),
      buildResponse: () => ({ sessionId: 's3', currentPhase: 'ok' }),
      res, inFlightTasks: inFlight, deps
    });
    await out.task;
    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.currentPhase).toBe('error');
    expect(emitted[0].payload.error).toBe('Internal server error');
    expect(recorded[0].rec.outcome).toBe('failed');
    expect(held.has('s3')).toBe(false);
    expect(inFlight.size).toBe(0);
  });

  it('buildResponse throws: treated as a failure (emit/record/release), never leaks the lock', async () => {
    const { deps, held, emitted } = makeDeps();
    const res = makeRes();
    const inFlight = new Set();
    const out = runGraphInBackground({
      sessionId: 's4',
      invoke: async () => ({ currentPhase: 'x' }),
      getState: async () => ({}),
      buildResponse: () => { throw new Error('shape bug'); },
      res, inFlightTasks: inFlight, deps
    });
    await out.task;
    expect(emitted[0].payload.currentPhase).toBe('error');
    expect(held.has('s4')).toBe(false);
    expect(inFlight.size).toBe(0);
  });

  it('releases the lock and schedules nothing if res.json throws synchronously (pre-schedule)', () => {
    // Regression guard: the lock is otherwise released only in the background finally, which
    // never runs if res.json throws before the task is registered. A leaked sessionId-keyed
    // lock would 409 every later op on that session until restart. Mirrors old /approve's
    // lockAcquired guard.
    const { deps, held } = makeDeps();
    const res = makeRes();
    res.json = () => { throw new Error('headers already sent'); }; // simulate an Express res.json throw
    const inFlight = new Set();
    expect(() => runGraphInBackground({
      sessionId: 's5',
      invoke: async () => ({}),
      getState: async () => ({}),
      buildResponse: () => ({}),
      res, inFlightTasks: inFlight, deps
    })).toThrow('headers already sent');
    expect(held.has('s5')).toBe(false); // lock released despite the throw — session not bricked
    expect(inFlight.size).toBe(0);      // nothing scheduled/tracked
  });
});
```

- [ ] **Step 2: Run the tests, expect failure.**

Run: `npx jest lib/__tests__/api-background-runner.test.js`
Expected: FAIL — `Cannot find module '../api-background-runner'`.

- [ ] **Step 3: Implement the runner.**

Create `lib/api-background-runner.js`:
```javascript
/**
 * api-background-runner — the shared non-blocking graph-invoke runner.
 *
 * Extracted from the /approve handler so the lock (CONC-1) + drain tracking (DUR-2)
 * + outcome record (DEL-1) + SSE emitComplete contract has ONE source of truth. The
 * /resume, /rollback, and /approve handlers all delegate the "run the graph in the
 * background and deliver the result over SSE" boilerplate here.
 *
 * The HANDLER owns: auth, synchronous validation (400/404), the shuttingDown 503
 * guard, building the `invoke`/`getState` thunks and the `buildResponse` callback.
 * THIS runner owns everything from the lock acquire onward: 409 on contention, the
 * immediate {status:'processing'} response, the setImmediate background invoke,
 * getState, buildResponse, outcome record, emitComplete, error path, lock release,
 * and inFlight tracking for graceful drain.
 *
 * @module api-background-runner
 */

const { acquireSessionLock, releaseSessionLock } = require('./session-locks');
const { recordSessionOutcome, buildOutcomeRecord } = require('./session-outcome');
const { progressEmitter } = require('./observability');
const { PHASES } = require('./workflow/state');

/**
 * @param {object} a
 * @param {string}   a.sessionId
 * @param {() => Promise<object>} a.invoke      - wraps graph.invoke(invokeArg, {...config, durability:'sync', recursionLimit})
 * @param {() => Promise<object>} a.getState    - wraps graph.getState(config)
 * @param {(result:object, graphState:object) => object} a.buildResponse - endpoint-specific SSE payload
 * @param {object}   a.res                      - Express response (runner sends 409 or 200-processing)
 * @param {Set}      a.inFlightTasks            - server-owned Set for SIGINT drain (DUR-2)
 * @param {object}   [a.processingExtra]        - extra fields merged into the {status:'processing'} body
 * @param {object}   [a.deps]                   - injectable singletons for tests
 * @returns {{scheduled: boolean, task: Promise|null}}
 */
function runGraphInBackground({
  sessionId, invoke, getState, buildResponse, res,
  inFlightTasks, processingExtra = {}, deps = {}
}) {
  const _acquire = deps.acquireSessionLock || acquireSessionLock;
  const _release = deps.releaseSessionLock || releaseSessionLock;
  const _record = deps.recordSessionOutcome || recordSessionOutcome;
  const _buildOutcome = deps.buildOutcomeRecord || buildOutcomeRecord;
  const _emitComplete = deps.emitComplete || ((id, payload) => progressEmitter.emitComplete(id, payload));

  // CONC-1: refuse a concurrent invoke on this session (lock is sessionId-keyed, so this
  // spans resume/rollback/approve). The loser gets a 409, not a second 'processing'.
  if (!_acquire(sessionId)) {
    res.status(409).json({
      sessionId,
      error: 'An operation is already in progress for this session. Please wait for it to finish.'
    });
    return { scheduled: false, task: null };
  }

  // Everything from here to inFlightTasks.add(task) must release the lock if it throws
  // synchronously — otherwise the background `finally` (the only OTHER release) never runs and
  // the sessionId-keyed lock bricks the session (every later op 409s until restart). This is
  // the old /approve `lockAcquired` guard, now owned by the runner since the lock lives here.
  try {
    // Return immediately; the graph runs in the background and the result arrives via SSE.
    res.json({ sessionId, status: 'processing', ...processingExtra });

    // DUR-2: wrap in a tracked promise so SIGINT can drain it.
    const task = new Promise((resolve) => {
      setImmediate(async () => {
        try {
          const result = await invoke();
          const graphState = await getState();
          const response = buildResponse(result, graphState);
          // DEL-1: persist the outcome FIRST so a dropped SSE is recoverable via GET /state.
          _record(sessionId, _buildOutcome(response));
          _emitComplete(sessionId, response);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
          const failedResponse = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Background operation failed. Check server logs.'
          };
          _record(sessionId, _buildOutcome(failedResponse));
          _emitComplete(sessionId, failedResponse);
        } finally {
          _release(sessionId);
          resolve();
        }
      });
    }).finally(() => inFlightTasks.delete(task));
    inFlightTasks.add(task);
    return { scheduled: true, task };
  } catch (err) {
    // res.json (or scheduling) threw before the background task was registered: release the
    // lock so the session isn't permanently locked, then rethrow to the handler's outer catch.
    _release(sessionId);
    throw err;
  }
}

module.exports = { runGraphInBackground };
```

- [ ] **Step 4: Run the tests, expect pass.**

Run: `npx jest lib/__tests__/api-background-runner.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**
```bash
git add lib/api-background-runner.js lib/__tests__/api-background-runner.test.js
git commit -m "feat(api): extract shared non-blocking graph-invoke runner (lock/drain/outcome/emit)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: Route /resume through the runner (non-blocking)

**Files:**
- Modify: `server.js` (the `app.post('/api/session/:id/resume', ...)` handler, ~:1102–1149; the `require` block near the top of the file)

**Interfaces:**
- Consumes: `runGraphInBackground` (Task 1); existing server.js helpers `createGraphAndConfig`, `getSessionState`, `isGraphInterrupted`, `getInterruptData`, `buildCompleteCheckpointData`, `buildInterruptResponse`, `PHASES`, `RECURSION_LIMIT`, `inFlightTasks`, `shuttingDown`, `sharedCheckpointer`, `sendErrorResponse`.
- Produces: `/resume` now returns `200 {status:'processing'}` (or `409`/`404`/`503`) and emits the real completion over SSE.

- [ ] **Step 1: Add the runner require.** Near the other `require('./lib/...')` lines at the top of `server.js`, add:
```javascript
const { runGraphInBackground } = require('./lib/api-background-runner');
```
(Verify by searching for `require('./lib/session-locks')` or `require('./lib/session-outcome')` and placing it alongside them.)

- [ ] **Step 2: Replace the `/resume` handler body.** Replace the entire current handler (from `app.post('/api/session/:id/resume', requireAuth, async (req, res) => {` through its closing `});`) with:
```javascript
app.post('/api/session/:id/resume', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { stateOverrides } = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/resume`);

    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const theme = session.state.theme || 'journalist';
        const { graph, config } = createGraphAndConfig(sessionId, theme, {
            checkpointer: sharedCheckpointer
        });

        const initialState = {};
        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // Non-blocking: run graph.invoke in the background; deliver the result via SSE.
        // (A long re-invoke — e.g. generateContentBundle ~400s — used to exceed undici's
        //  5-min headersTimeout / Cloudflare's ~100s edge timeout on the held-open POST.)
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: (result, graphState) => {
                if (isGraphInterrupted(graphState)) {
                    const interruptData = getInterruptData(graphState);
                    const checkpointData = buildCompleteCheckpointData(interruptData, graphState.values);
                    return buildInterruptResponse(sessionId, checkpointData, result.currentPhase);
                }
                const response = { sessionId, currentPhase: result.currentPhase };
                if (result.currentPhase === PHASES.COMPLETE) {
                    response.assembledHtml = result.assembledHtml;
                    response.validationResults = result.validationResults;
                    response.outputPath = result.outputPath;
                    response.photosCopied = result.photosCopied;
                }
                if (result.errors?.length > 0) {
                    response.errors = result.errors;
                }
                return response;
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/resume`);
    }
});
```

- [ ] **Step 3: Require-load smoke + suite stays green.**

Run: `node -e "require('./server.js'); console.log('load OK')"`
Expected: `load OK` (catches a typo/wiring error in the hot path; `server.js` is guarded by `require.main === module` so requiring it does not start the server).

Run: `npx jest`
Expected: green — no suite asserted the OLD blocking `/resume` shape (there is no endpoint test harness; the lock/outcome/drain unit suites are unaffected). Integration is proven in Task 10.

- [ ] **Step 4: Commit.**
```bash
git add server.js
git commit -m "feat(api): make /resume non-blocking via the background runner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Route /rollback through the runner (non-blocking), preserving rolledBackTo/fieldsCleared

**Files:**
- Modify: `server.js` (the `app.post('/api/session/:id/rollback', ...)` handler, ~:1014–1095)

**Interfaces:**
- Consumes: `runGraphInBackground` (Task 1); existing helpers `buildRollbackState`, `VALID_ROLLBACK_POINTS`, `ROLLBACK_CLEARS`, `clearSessionOutcome`, plus the same set as Task 2.
- Produces: `/rollback` returns `200 {status:'processing'}` and the SSE completion payload carries `rolledBackTo` + `fieldsCleared` (the harness and console read these). It now also RECORDS a terminal outcome on completion (DEL-1 recoverability) — the old blocking handler only cleared one.

- [ ] **Step 1: Replace the `/rollback` handler body.** Replace the entire current handler with:
```javascript
app.post('/api/session/:id/rollback', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { rollbackTo, stateOverrides } = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    // Validate rollbackTo
    if (!rollbackTo) {
        return res.status(400).json({ error: 'rollbackTo is required' });
    }
    if (!VALID_ROLLBACK_POINTS.includes(rollbackTo)) {
        return res.status(400).json({
            error: `Invalid rollbackTo: '${rollbackTo}'. Valid values: ${VALID_ROLLBACK_POINTS.join(', ')}`
        });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/rollback: rollbackTo=${rollbackTo}`);

    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const { graph, config } = createGraphAndConfig(sessionId, session.state.theme || 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Build rollback state (synchronous setup).
        const initialState = buildRollbackState(rollbackTo);

        // ROLL-4: stash prior full-context so AwaitFullContext pre-fills re-collection
        // whenever the rollback CLEARS those channels. buildRollbackState nulls the
        // channels; capture their current values first.
        if (ROLLBACK_CLEARS[rollbackTo]?.includes('accusation')) {
            initialState._previousFullContext = {
                accusation: session.state.accusation || null,
                sessionReport: session.state.sessionReport || null,
                directorNotes: session.state.directorNotesRaw || null
            };
        }

        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // DEL-1: a rolled-back session's prior TERMINAL outcome is stale the moment we
        // commit the rollback — clear it synchronously so a dropped SSE mid-rollback can't
        // surface the pre-rollback outcome via GET /state. The rollback's own completion
        // records a fresh outcome.
        clearSessionOutcome(sessionId);

        // Non-blocking: rollback re-invokes from the rollback point. Usually re-pauses fast,
        // but a rollback upstream of a long node can exceed the proxy timeouts on a held POST.
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: (result, graphState) => {
                const base = isGraphInterrupted(graphState)
                    ? buildInterruptResponse(
                        sessionId,
                        buildCompleteCheckpointData(getInterruptData(graphState), graphState.values),
                        result.currentPhase
                      )
                    : { sessionId, currentPhase: result.currentPhase };
                if (!isGraphInterrupted(graphState) && result.errors?.length > 0) {
                    base.errors = result.errors;
                }
                return { ...base, rolledBackTo: rollbackTo, fieldsCleared: ROLLBACK_CLEARS[rollbackTo] };
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/rollback`);
    }
});
```

- [ ] **Step 2: Require-load smoke + suite green.**

Run: `node -e "require('./server.js'); console.log('load OK')"`
Expected: `load OK`.

Run: `npx jest`
Expected: green.

- [ ] **Step 3: Commit.**
```bash
git add server.js
git commit -m "feat(api): make /rollback non-blocking via the runner (preserves rolledBackTo/fieldsCleared)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refactor /approve onto the shared runner (behavior-preserving)

**Files:**
- Modify: `server.js` (the `app.post('/api/session/:id/approve', ...)` handler, ~:843–1008)

**Interfaces:**
- Consumes: `runGraphInBackground` (Task 1); existing `buildResumePayload`, `acquireSessionLock`/`releaseSessionLock` (now only via the runner), `recordSessionOutcome`, `buildOutcomeRecord`, `progressEmitter`, `Command`, plus the Task 2 set.
- Produces: `/approve` keeps its EXACT external behavior (400 not-at-checkpoint, 400 recovery, 400 validation, 409 contention, 200 processing, SSE completion incl. `previousPhase`, sync-error SSE emit). Only the lock + background block is replaced by the runner.

**Note on what stays vs. moves:** the synchronous validation (interrupt precheck, recovery 400, `buildResumePayload` 400) and the top-level `catch` (which emits an SSE completion for an UNEXPECTED sync error so the console's open SSE doesn't hang) STAY. The `acquireSessionLock`/`lockAcquired` bookkeeping, the `res.json({status:'processing'})`, and the `setImmediate` background block MOVE into the runner. The runner acquires the lock AFTER all sync validation (same order as today: validation → lock → processing).

- [ ] **Step 1: Replace the `/approve` handler body.** Replace the entire current handler with:
```javascript
app.post('/api/session/:id/approve', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const approvals = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve:`, JSON.stringify(approvals));

    try {
        // Create graph and config (theme resolved from state below)
        const { graph, config } = createGraphAndConfig(sessionId, 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Check if graph is interrupted using native LangGraph pattern
        const graphState = await graph.getState(config);
        if (!graphState || !isGraphInterrupted(graphState)) {
            const stateValues = graphState?.values || {};
            if (stateValues.currentPhase === 'error' && stateValues.articleApproved === true) {
                console.log(`[${new Date().toISOString()}] Recovering from article error state for session ${sessionId}`);
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

        // Resolve theme from state
        const theme = graphState.values?.theme || 'journalist';
        config.configurable.theme = theme;

        // Build resume payload from approvals (pass current state for incremental input merging)
        const { resume, stateUpdates, error: validationError } = buildResumePayload(approvals, graphState.values, theme);
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        const previousPhase = graphState.values?.currentPhase;

        // Non-blocking via the shared runner: it acquires the sessionId lock (409 on a
        // second concurrent approve), returns {status:'processing'}, runs the graph in the
        // background, records the outcome, and emits the result via SSE.
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(
                new Command({ resume, update: stateUpdates }),
                { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }
            ),
            getState: () => graph.getState(config),
            buildResponse: (result, newGraphState) => {
                if (isGraphInterrupted(newGraphState)) {
                    const interruptData = getInterruptData(newGraphState);
                    const checkpointData = buildCompleteCheckpointData(interruptData, newGraphState.values);
                    return {
                        ...buildInterruptResponse(sessionId, checkpointData, result.currentPhase),
                        previousPhase
                    };
                }
                const response = { sessionId, previousPhase, currentPhase: result.currentPhase };
                if (result.currentPhase === PHASES.COMPLETE) {
                    response.assembledHtml = result.assembledHtml;
                    response.validationResults = result.validationResults;
                    response.outputPath = result.outputPath;
                    response.photosCopied = result.photosCopied;
                }
                if (result.errors?.length > 0) {
                    response.errors = result.errors;
                }
                return response;
            },
            res,
            inFlightTasks,
            processingExtra: { previousPhase }
        });
    } catch (error) {
        // Only fires for an UNEXPECTED error BEFORE the runner scheduled the background task
        // (validation throw, getState throw). The runner owns the lock, so there is no lock to
        // release here. Emit an SSE completion so the console's open SSE doesn't hang.
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve error:`, error);
        const earlyFailure = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Approval operation failed. Check server logs.'
        };
        recordSessionOutcome(sessionId, buildOutcomeRecord(earlyFailure));
        progressEmitter.emitComplete(sessionId, earlyFailure);
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/approve`);
    }
});
```

- [ ] **Step 2: Verify no now-unused symbols.** Confirm `acquireSessionLock`/`releaseSessionLock` are still required elsewhere in `server.js` (they are imported but now only the runner uses them at runtime — the `require` line stays since the runner is a separate module; if server.js had a direct `acquireSessionLock` import ONLY for approve, the import is now unused — remove it to avoid a lint/no-unused warning, but ONLY if no other handler references it).

Run: `npx eslint server.js` if an eslint config exists; otherwise visually scan for a now-orphaned `const { acquireSessionLock, releaseSessionLock } = require('./lib/session-locks');` and remove it if unreferenced in server.js. (The runner imports them itself.)

- [ ] **Step 3: Require-load smoke + full suite.**

Run: `node -e "require('./server.js'); console.log('load OK')"`
Expected: `load OK`.

Run: `npx jest`
Expected: green. Pay attention to `__tests__/unit/server-build-resume-payload.test.js` (still passes — `buildResumePayload` is untouched), `__tests__/unit/session-locks.test.js`, `__tests__/unit/session-outcome.test.js`, `__tests__/unit/sigint-drain.test.js`, `__tests__/unit/clear-session-outcome-wiring.test.js`.

- [ ] **Step 4: Commit.**
```bash
git add server.js
git commit -m "refactor(api): route /approve through the shared background runner (single source of truth)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: e2e harness — wire the /rollback call to SSE

**Files:**
- Modify: `scripts/e2e-walkthrough.js` (the `--rollback` block, ~:3385–3398)

**Interfaces:**
- Consumes: the existing `apiCall(endpoint, body, method, sseSessionId)` — passing `sessionId` as the 4th arg routes the call through the `processing`→SSE-completion path (`apiCall` line ~401), so a `{status:'processing'}` rollback resolves via the SSE `complete` event into a flat payload.
- Produces: the harness `--rollback` path reads `currentPhase`/`fieldsCleared` from the SSE-resolved payload.

**Why:** `/resume` is already called WITH the 4th arg (line ~3431) so it needs no harness change. The `/rollback` call (line ~3391) is `apiCall('/api/session/${sessionId}/rollback', rollbackBody)` with NO 4th arg — once `/rollback` returns `{status:'processing'}`, that call would get `currentPhase: undefined` and not wait. Add the arg.

- [ ] **Step 1: Replace the rollback `apiCall` line.** In the `if (ROLLBACK_TO) {` block, change:
```javascript
    const { status, data, error } = await apiCall(`/api/session/${sessionId}/rollback`, rollbackBody);
```
to:
```javascript
    // 4th arg routes through the SSE 'processing'→'complete' path now that /rollback is
    // non-blocking (returns {status:'processing'} and emits the result via SSE).
    const { status, data, error } = await apiCall(`/api/session/${sessionId}/rollback`, rollbackBody, 'POST', sessionId);
```

- [ ] **Step 2: Verify the success log reads the resolved payload.** The two lines immediately after already read `data.currentPhase` and `data.fieldsCleared?.length` — those fields are present on the SSE-resolved payload (the `buildResponse` from Task 3 includes them). No change needed; confirm they are:
```javascript
    console.log(color(`  ✓ Rolled back. Phase: ${data.currentPhase}`, 'green'));
    console.log(color(`  Cleared: ${data.fieldsCleared?.length || 0} fields`, 'dim'));
```

- [ ] **Step 3: Syntax check.**

Run: `node --check scripts/e2e-walkthrough.js`
Expected: no output (valid syntax).

- [ ] **Step 4: Commit.**
```bash
git add scripts/e2e-walkthrough.js
git commit -m "fix(e2e): wire the --rollback call to SSE now that /rollback is non-blocking

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: console api.js — convert resume + rollback to SSE-before-POST

**Files:**
- Modify: `console/api.js` (`rollback` ~:108–116, `resume` ~:123–130)

**Interfaces:**
- Consumes: the existing `api.connectSSE(sessionId, onProgress) → { eventSource, connected }` and the `api.approve` template (~:75–99).
- Produces: `api.resume(sessionId, onProgress) → Promise<{ response, eventSource }>` and `api.rollback(sessionId, rollbackTo, overrides, onProgress) → Promise<{ response, eventSource }>`. Both open the SSE, await `connected` (10s timeout), POST, and return the parsed POST body + the live EventSource. The CALLER consumes completion via the SSE `complete`/`failed`/`error` events (Task 7/8/9).

- [ ] **Step 1: Replace `api.rollback`.** Replace the current method:
```javascript
  async rollback(sessionId, rollbackTo, overrides) {
    const res = await fetch(`/api/session/${sessionId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rollbackTo, stateOverrides: overrides })
    });
    return res.json();
  },
```
with:
```javascript
  /**
   * Rollback to a checkpoint (SSE-before-POST — /rollback is non-blocking and streams
   * its result + live progress via SSE, same contract as approve()).
   * @returns {Promise<{response: object, eventSource: EventSource}>}
   */
  async rollback(sessionId, rollbackTo, overrides, onProgress) {
    const { eventSource, connected } = api.connectSSE(sessionId, onProgress);
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('SSE connection timeout after 10s')), 10000);
    });
    await Promise.race([connected, timeout]).then(() => clearTimeout(timerId)).catch((err) => {
      clearTimeout(timerId);
      eventSource.close();
      throw err;
    });

    const res = await fetch(`/api/session/${sessionId}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ rollbackTo, stateOverrides: overrides })
    });
    const response = await res.json();
    return { response, eventSource };
  },
```

- [ ] **Step 2: Replace `api.resume`.** Replace the current method:
```javascript
  async resume(sessionId) {
    const res = await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    return res.json();
  },
```
with:
```javascript
  /**
   * Resume an existing workflow (SSE-before-POST — /resume is non-blocking and streams
   * its result + live progress via SSE, same contract as approve()).
   * @returns {Promise<{response: object, eventSource: EventSource}>}
   */
  async resume(sessionId, onProgress) {
    const { eventSource, connected } = api.connectSSE(sessionId, onProgress);
    let timerId;
    const timeout = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('SSE connection timeout after 10s')), 10000);
    });
    await Promise.race([connected, timeout]).then(() => clearTimeout(timerId)).catch((err) => {
      clearTimeout(timerId);
      eventSource.close();
      throw err;
    });

    const res = await fetch(`/api/session/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include'
    });
    const response = await res.json();
    return { response, eventSource };
  },
```

- [ ] **Step 3: Syntax check.**

Run: `node --check console/api.js`
Expected: no output (valid syntax). (Browser-only `EventSource`/`fetch` are referenced but `node --check` only parses, it does not execute — so this passes.)

- [ ] **Step 4: Commit.**
```bash
git add console/api.js
git commit -m "feat(console): convert api.resume/api.rollback to SSE-before-POST (non-blocking endpoints)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: console state.js — add the pendingResume hand-off action

**Files:**
- Modify: `console/state.js` (`initialState` ~:13–38, `ACTIONS` ~:40–61, `reducer` ~:63–202)

**Interfaces:**
- Consumes: nothing new.
- Produces: a `pendingResume` state field (`{ sessionId } | null`) and a `RESUME_REQUESTED` action. `RESUME_REQUESTED` sets the session, flips `processing` on, and sets `pendingResume` so `App` (which owns the SSE + `ProgressStream`) can drive a streaming resume after `SessionStart` unmounts. The App effect clears it by dispatching `PROCESSING_START`-like state is NOT enough — add an explicit clear via a dedicated reducer branch reusing `SET_SESSION` semantics. We add a tiny `RESUME_CLEAR_PENDING` action for the effect to consume the flag exactly once.

**Why a flag:** `SessionStart.handleResume`'s "not at a checkpoint" branch must start a streaming resume, but `SessionStart` unmounts the instant `sessionId` is set (App renders `ProgressStream` instead). It therefore cannot own the long-lived EventSource. The flag lets `App` pick the resume up.

- [ ] **Step 1: Add `pendingResume` to `initialState`.** In the `initialState` object, after the `completedResult: null` line (the last field), add a trailing comma to it and a new field:
```javascript
  // Completed
  completedResult: null,
  // Hand-off: set by SessionStart's reconnect-resume so App drives the streaming resume
  // (SessionStart unmounts once sessionId is set, so it can't own the EventSource).
  pendingResume: null
```

- [ ] **Step 2: Add the actions.** In the `ACTIONS` object, after `SET_SESSION: 'SET_SESSION',` add:
```javascript
  RESUME_REQUESTED: 'RESUME_REQUESTED',
  RESUME_CLEAR_PENDING: 'RESUME_CLEAR_PENDING',
```

- [ ] **Step 3: Add the reducer branches.** In `reducer`, immediately after the `case ACTIONS.SET_SESSION:` block, add:
```javascript
    case ACTIONS.RESUME_REQUESTED:
      // Reconnect-resume hand-off: set the session, enter processing, and flag App to
      // drive the streaming resume. Mirrors PROCESSING_START's stream-reset fields.
      return {
        ...state,
        sessionId: action.sessionId,
        pendingResume: { sessionId: action.sessionId },
        processing: true,
        progressMessages: [],
        eventLog: [],
        llmActivity: null,
        error: null
      };

    case ACTIONS.RESUME_CLEAR_PENDING:
      return { ...state, pendingResume: null };
```

- [ ] **Step 4: Confirm `RESET_SESSION`/`LOGOUT` clear the flag.** Both return `{ ...initialState, ... }`, so `pendingResume` resets to `null` automatically. No change needed — verify by reading the `LOGOUT` and `RESET_SESSION` branches (they spread `initialState`).

- [ ] **Step 5: Syntax check.**

Run: `node --check console/state.js`
Expected: no output (valid syntax).

- [ ] **Step 6: Commit.**
```bash
git add console/state.js
git commit -m "feat(console): add pendingResume hand-off action for streaming reconnect-resume

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: console app.js — shared SSE handler + streaming resume/rollback + retry/rollback wiring + pendingResume effect

**Files:**
- Modify: `console/app.js` (`handleApprove` ~:72–211, `handleRollbackConfirm` ~:226–248, `onRetry` ~:277–311, add a new effect near the other `React.useEffect`s ~:36–54)

**Interfaces:**
- Consumes: `appApi.approve`/`appApi.resume`/`appApi.rollback` (Task 6), the reducer actions incl. `RESUME_REQUESTED`/`RESUME_CLEAR_PENDING` (Task 7), `sseRef`, `dispatch`, `APP_ACTIONS`.
- Produces: a module-scope `makeSseHandler(dispatch, sseRef)` that returns the SSE `onProgress` callback (the exact switch currently inline in `handleApprove`); `streamingResume(sessionId)` and `streamingRollback(target, overrides)` that mirror `handleApprove`'s flow for the new endpoints; `onRetry`/`handleRollbackConfirm` call the streaming functions; a `pendingResume` effect drives `streamingResume`.

**Design:** `handleApprove`, `streamingResume`, and `streamingRollback` are identical except for which `appApi.*` they call. Extract the shared SSE-event switch (currently `handleApprove`'s inline `(event) => { switch (event.type) {...} }`, app.js ~:81–190) into one helper so all three reuse it. The completion semantics (`complete` → CHECKPOINT_RECEIVED / WORKFLOW_COMPLETE / SET_ERROR; `failed` → SSE_LLM_FAILURE; `error` → SSE_ERROR) are identical for all three.

- [ ] **Step 1: Extract `makeSseHandler` at module scope.** Add this function ABOVE `function App() {` (after the `CHECKPOINT_COMPONENTS` map, ~:28). It is the body of `handleApprove`'s current inline `onProgress` switch, lifted to a factory — adapted to close via the shared `eventSourceClose(sseRef)` helper (instead of the closure-local `eventSource`) and with the `complete` branch's `result` declaration block-scoped:
```javascript
/**
 * Build the SSE onProgress handler shared by approve/resume/rollback (all three drive
 * the same non-blocking, SSE-delivered contract). Closes over dispatch + the EventSource
 * ref so the completion branches can close the stream.
 */
function makeSseHandler(dispatch, sseRef) {
  return (event) => {
    switch (event.type) {
      case 'connected':
        dispatch({ type: APP_ACTIONS.SSE_CONNECTED });
        break;
      case 'progress':
        dispatch({
          type: APP_ACTIONS.SSE_PROGRESS,
          message: event.data.message || event.data.context || JSON.stringify(event.data)
        });
        break;
      case 'llm_start':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_START,
          label: event.data.label || event.data.context || 'Processing',
          model: event.data.model || 'unknown',
          prompt: event.data.prompt || null,
          systemPrompt: event.data.systemPrompt || null
        });
        break;
      case 'llm_delta':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_DELTA,
          phase: event.data.phase || 'writing',
          deltaText: event.data.deltaText || '',
          tokenCount: event.data.tokenCount,
          ttftMs: event.data.ttftMs
        });
        break;
      case 'llm_complete':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_COMPLETE,
          response: event.data.response || null,
          elapsed: event.data.elapsed || null
        });
        break;
      case 'llm_error':
        dispatch({
          type: APP_ACTIONS.SSE_LLM_COMPLETE,
          response: null,
          elapsed: event.data.elapsed || null
        });
        dispatch({
          type: APP_ACTIONS.SSE_PROGRESS,
          message: `Extraction failed: ${event.data.error || 'unknown'} (channel=text_fallback, stop=${event.data.diagnostics?.stopReason || '?'}, structuredOutputPresent=${event.data.diagnostics?.structuredOutputPresent})`
        });
        break;
      case 'complete':
        eventSourceClose(sseRef);
        dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
        {
          const result = event.data;
          if (result.interrupted && result.checkpoint) {
            dispatch({
              type: APP_ACTIONS.CHECKPOINT_RECEIVED,
              checkpointType: result.checkpoint.type,
              data: result.checkpoint,
              phase: result.currentPhase
            });
          } else if (result.currentPhase === 'complete') {
            dispatch({ type: APP_ACTIONS.WORKFLOW_COMPLETE, result });
          } else if (result.currentPhase === 'error') {
            // Unreachable on the runner path: the server stamps a non-interrupted error as
            // SSE type:'failed' (progress-emitter outcomeEventType), so it hits the 'failed'
            // branch (inline failure card) below, not here. Kept for parity with the legacy
            // inline approve handler / any future non-runner emit.
            dispatch({
              type: APP_ACTIONS.SET_ERROR,
              message: (result.error || 'Workflow error') +
                (result.details ? ' ' + result.details : '') +
                ' You can edit and retry, or use rollback.'
            });
          }
        }
        break;
      case 'failed':
        eventSourceClose(sseRef);
        dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
        dispatch({
          type: APP_ACTIONS.SSE_LLM_FAILURE,
          error: (event.data.error
            || (event.data.errors && event.data.errors[0] && event.data.errors[0].message)
            || 'Workflow failed') +
            (event.data.details ? ' — ' + event.data.details : '')
        });
        break;
      case 'error':
        eventSourceClose(sseRef);
        dispatch({
          type: APP_ACTIONS.SSE_ERROR,
          message: event.data.message || 'Connection lost'
        });
        break;
    }
  };
}

/** Close + clear the tracked EventSource (idempotent). */
function eventSourceClose(sseRef) {
  if (sseRef.current) {
    sseRef.current.close();
    sseRef.current = null;
  }
}
```

- [ ] **Step 2: Rewrite `handleApprove` to use the shared handler.** Replace the whole `handleApprove` function (app.js ~:72–211) with:
```javascript
  const handleApprove = async (payload) => {
    if (!state.sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    try {
      const { response, eventSource } = await appApi.approve(
        state.sessionId, payload, makeSseHandler(dispatch, sseRef)
      );
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
      }
    } catch (err) {
      dispatch({
        type: APP_ACTIONS.SSE_ERROR,
        message: 'Failed to connect: ' + (err.message || 'Unknown error')
      });
    }
  };

  /**
   * Streaming resume (non-blocking /resume). Used by the [Retry] button and the
   * reconnect-resume hand-off. Same SSE contract as approve.
   */
  const streamingResume = async (sessionId) => {
    if (!sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    try {
      const { response, eventSource } = await appApi.resume(sessionId, makeSseHandler(dispatch, sseRef));
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
      }
    } catch (err) {
      dispatch({ type: APP_ACTIONS.SSE_ERROR, message: 'Resume failed: ' + (err.message || 'Unknown error') });
    }
  };

  /**
   * Streaming rollback (non-blocking /rollback). Same SSE contract as approve.
   */
  const streamingRollback = async (target, overrides) => {
    if (!state.sessionId) return;
    dispatch({ type: APP_ACTIONS.PROCESSING_START });
    try {
      const { response, eventSource } = await appApi.rollback(
        state.sessionId, target, overrides, makeSseHandler(dispatch, sseRef)
      );
      sseRef.current = eventSource;
      if (response.error) {
        dispatch({ type: APP_ACTIONS.SET_ERROR, message: response.error });
      }
    } catch (err) {
      dispatch({ type: APP_ACTIONS.SET_ERROR, message: 'Rollback failed: ' + (err.message || 'Unknown error') });
    }
  };
```

- [ ] **Step 3: Point `handleRollbackConfirm` at `streamingRollback`.** Replace the current `handleRollbackConfirm` (app.js ~:226–248) with:
```javascript
  const handleRollbackConfirm = async (target, overrides) => {
    setRollbackTarget(null);
    await streamingRollback(target, overrides);
  };
```
(The CHECKPOINT_RECEIVED / error dispatching now happens inside `makeSseHandler`'s `complete`/`failed` branches, so the old inline result-handling is removed.)

- [ ] **Step 4: Point the `[Retry]` button at `streamingResume`.** In the `ProgressStream` element's props, replace the entire `onRetry: async () => { ... }` block (app.js ~:277–311) with:
```javascript
        onRetry: () => streamingResume(state.sessionId),
```

- [ ] **Step 5: Add the `pendingResume` effect.** Add this effect alongside the other `React.useEffect`s inside `App` (after the auth-check effect, ~:54):
```javascript
  // Reconnect-resume hand-off: SessionStart dispatched RESUME_REQUESTED (it can't own the
  // EventSource because it unmounts once sessionId is set). Drive the streaming resume here,
  // then clear the flag so it fires exactly once.
  React.useEffect(() => {
    if (state.pendingResume && state.pendingResume.sessionId) {
      const sid = state.pendingResume.sessionId;
      dispatch({ type: APP_ACTIONS.RESUME_CLEAR_PENDING });
      streamingResume(sid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pendingResume]);
```
(`streamingResume`/`dispatch` are stable enough for this one-shot; the flag is cleared before the async call so a re-render can't double-fire.)

- [ ] **Step 6: Syntax check.**

Run: `node --check console/app.js`
Expected: no output (valid syntax).

- [ ] **Step 7: Commit.**
```bash
git add console/app.js
git commit -m "feat(console): stream resume/rollback via shared SSE handler; retry + rollback get live progress

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: console SessionStart.js — hand off reconnect-resume to App

**Files:**
- Modify: `console/components/SessionStart.js` (`handleResume` ~:124–175)

**Interfaces:**
- Consumes: `RESUME_REQUESTED` (Task 7).
- Produces: the "not at a checkpoint" branch dispatches `RESUME_REQUESTED` (which sets session + processing + the hand-off flag) instead of awaiting the now-non-blocking `api.resume` directly.

- [ ] **Step 1: Replace the "not at a checkpoint" branch.** In `handleResume`, replace the `else` block that currently calls `sessionApi.resume` (SessionStart.js ~:149–169):
```javascript
      } else {
        // Not at a checkpoint — resume the workflow
        setStatus('Resuming workflow...');
        const result = await sessionApi.resume(sessionId);

        if (result.interrupted && result.checkpoint) {
          dispatch({
            type: SESSION_ACTIONS.CHECKPOINT_RECEIVED,
            checkpointType: result.checkpoint.type,
            data: result.checkpoint,
            phase: result.currentPhase
          });
        } else if (result.currentPhase === 'complete') {
          dispatch({
            type: SESSION_ACTIONS.WORKFLOW_COMPLETE,
            result
          });
        } else {
          setStatus('Session at phase: ' + (result.currentPhase || 'unknown'));
          setLoading(false);
        }
      }
```
with:
```javascript
      } else {
        // Not at a checkpoint — hand off a STREAMING resume to App. /resume is non-blocking
        // now (returns {status:'processing'} and streams the result via SSE), and this
        // component unmounts once sessionId is set, so it can't own the EventSource itself.
        // RESUME_REQUESTED sets the session + processing + the pendingResume flag that App's
        // effect picks up to drive the streaming resume.
        dispatch({ type: SESSION_ACTIONS.RESUME_REQUESTED, sessionId });
      }
```
(Note: the `dispatch({ type: SET_SESSION })` at the TOP of `handleResume`'s try — line ~139 — still runs before this branch. `RESUME_REQUESTED` also sets `sessionId`, so it is idempotent; leave the earlier `SET_SESSION` in place since the "at a checkpoint" branch relies on it.)

- [ ] **Step 2: Syntax check.**

Run: `node --check console/components/SessionStart.js`
Expected: no output (valid syntax).

- [ ] **Step 3: Commit.**
```bash
git add console/components/SessionStart.js
git commit -m "feat(console): hand reconnect-resume to App via RESUME_REQUESTED (streaming, non-blocking)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Full verification — suite, e2e live re-run, manual console click-through, docs

**Files:**
- Test: whole suite (no source changes unless a regression surfaces)
- Modify (docs): `reports/CLAUDE.md` (the API Reference / endpoint section) to note resume/rollback are now non-blocking

- [ ] **Step 1: Full Jest suite.**

Run: `npx jest 2>&1 | tail -12`
Expected: `0 failed`. Specifically the new `api-background-runner` suite passes and the pre-existing `session-locks`, `session-outcome`, `sigint-drain`, `clear-session-outcome-wiring`, `server-build-resume-payload`, `get-session-state` suites are unchanged-green. If any suite asserted an OLD blocking response shape, update it to the non-blocking contract and note it in the commit.

- [ ] **Step 2: Require-load smoke for every modified server/console file.**

Run:
```bash
node -e "require('./server.js'); require('./lib/api-background-runner.js'); console.log('server load OK')"
node --check scripts/e2e-walkthrough.js
node --check console/api.js && node --check console/app.js && node --check console/state.js && node --check console/components/SessionStart.js
```
Expected: `server load OK` and no `node --check` output (all valid).

- [ ] **Step 3: e2e live re-run (operator-run; the integration proof for the harness path).**

Start the server (`npm start`) in one terminal. In another, resume a real session that triggers a LONG node (the session that previously failed at `generateContentBundle` is ideal — it re-runs ~400s, well past undici's 5-min default):
```bash
node scripts/e2e-walkthrough.js --session <id> --resume --auto
```
Expected: the run NO LONGER exits with `Response: 500 / Resume failed: fetch failed` at ~5 min. Instead the SSE progress streams throughout, and on completion the harness advances to the next checkpoint (or prints "Pipeline Complete!"). Also exercise `--rollback`:
```bash
node scripts/e2e-walkthrough.js --session <id> --rollback arc-selection --auto
```
Expected: `✓ Rolled back. Phase: <phase>` with a real phase (NOT `undefined`) and a non-zero `Cleared: N fields`.

- [ ] **Step 4: Manual console click-through (operator-run; the integration proof for the React wiring — there is NO automated console harness).**

With the server running, open `http://localhost:3001/console`, log in, and verify all three converted paths show LIVE progress and resolve correctly:
1. **Retry (success AND re-fail):** drive a session to a failure (or use a known-failing session), click **[Retry]** on the inline failure card → the live LLM stream/ribbon now animates during the re-run (previously frozen at "preparing"). On success it advances to the next checkpoint. **Also verify retry-REFAIL:** if the node fails again, the INLINE failure card must re-render (NOT a SET_ERROR banner) — the server stamps node-errors as SSE `failed`, so this stays the inline card.
2. **Rollback:** at any checkpoint, open the rollback modal and confirm a rollback → live progress shows, then the target checkpoint loads.
3. **Reconnect-resume:** with a session that is mid-run/errored (not at a checkpoint), enter its ID and click **Resume** → the app transitions into the processing view with live progress (not a frozen spinner), then lands at a checkpoint / completion.
Also confirm a **second concurrent action is rejected**: trigger a long resume, then quickly trigger another action on the same session → the second returns the 409 "already in progress" error (surfaced as an error banner), and the first completes normally.

- [ ] **Step 5: Update `reports/CLAUDE.md`.** In the "Session REST API" section, change the resume/rollback descriptions to reflect the non-blocking contract. Replace:
```markdown
- `/api/session/:id/resume` (POST) - Resume existing workflow (re-invoke at current state)
...
- `/api/session/:id/rollback` (POST) - Roll back to checkpoint
```
with:
```markdown
- `/api/session/:id/resume` (POST) - Resume existing workflow (re-invoke at current state). NON-BLOCKING: returns `{status:'processing'}` immediately, runs the graph in the background, and delivers the result via the `/progress` SSE `complete` event (same contract as `/approve`). Clients MUST use SSE-before-POST. (A long re-invoke would otherwise exceed undici's 5-min `headersTimeout` / Cloudflare's ~100s edge timeout on a held-open POST.)
- `/api/session/:id/rollback` (POST) - Roll back to checkpoint. NON-BLOCKING (same contract as resume/approve); the SSE completion payload carries `rolledBackTo` + `fieldsCleared`.
```
Also add a one-line note under the API section pointing at the shared runner:
```markdown
**Non-blocking endpoints** (`/start` excepted — it interrupts in seconds): `/approve`, `/resume`, `/rollback` all run their `graph.invoke` in the background via `lib/api-background-runner.js#runGraphInBackground` (one source of truth for the CONC-1 lock + DUR-2 drain + DEL-1 outcome + SSE `emitComplete`). The sessionId-keyed lock gives mutual exclusion across all three; a concurrent second call gets a 409.
```

- [ ] **Step 6: Commit the docs + any test fixes.**
```bash
git add reports/CLAUDE.md
git commit -m "docs(api): note /resume + /rollback are non-blocking (SSE-delivered) via the shared runner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
(If Step 1 required a test-assertion update, that commit already happened in this task; otherwise nothing else to commit.)

- [ ] **Step 7: Final code review.** Dispatch a final adversarial reviewer over the whole branch (server concurrency correctness — lock release on every path; no double `res.send`; the three `buildResponse` shapes match the clients' reads; console completion branches reachable for resume/rollback exactly as for approve; the `pendingResume` effect fires once). Then finish the branch per `superpowers:finishing-a-development-branch`.

---

## Notes / out of scope

- **`/start` stays blocking** by decision (interrupts at the first checkpoint within seconds; background pipelines don't block it). Its latent tunnel-timeout risk is documented but not realized today. Convert it later (server + `api.startSession` + `SessionStart.handleStart`) only if it ever 524s.
- **No endpoint integration tests exist** (zero-dep, no supertest; `server.js` doesn't export its app). The new shared runner is unit-tested directly; the endpoints are verified by require-load smoke + the e2e live re-run + the manual console click-through. This is consistent with the existing (untested) `/approve` background.
- **Console has no React/DOM test harness** by design (`reports/CLAUDE.md`). Tasks 6–9 are verified by Step 4's manual click-through, not automated tests.
- **Minor pre-existing behavior preserved:** on a synchronous `response.error` (404/400) the console dispatches an error but does not explicitly close the just-opened EventSource (the unmount cleanup effect closes it). This mirrors the existing `handleApprove` behavior and is not made worse here.
- **The SDK progress-event legibility plan** (`docs/superpowers/plans/2026-06-23-sdk-progress-event-legibility.md`) is the NEXT, independent follow-up — it touches the progress *formatter*, not the connection lifecycle, and is unaffected by this plan.
