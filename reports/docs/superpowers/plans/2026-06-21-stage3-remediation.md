# Stage 3 Remediation Implementation Plan (Workstreams A + B + C)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **⚠️ READ "Cross-Phase Integration & Sequencing" (below) BEFORE STARTING ANY PHASE.** The 12 phase sections were authored independently and several edit the *same files*. The integration section is authoritative for execution order and for six shared-file merges the per-phase sections do not individually resolve. Where a phase's `Dependencies:` line and the integration section disagree on a phase number, the integration section wins.

**Goal:** Make the ALN Director Console's GenAI pipeline durable, observable, and recoverable — failures fail loud to the operator and re-run without losing the session — while closing the live security holes (A) and completing the incompletely-applied Stage-2 remediations F1/F3/F4/F9 (C).

**Architecture:** Adopt LangGraph's native durable-execution model instead of fighting it. A persistent `SqliteSaver` + `durability:"sync"` make every node boundary a recovery point (P1); nodes **throw** (with per-node `retryPolicy` for transient errors classified by a shared `isTransientError`) instead of fail-soft or throw-to-`END`, so `/resume` re-runs only the failed node (P2/P3); an idle/stall timeout + `maxBudgetUsd` + token-level `includePartialMessages` streaming give safe long calls and live operator observability (P2/P5); the approve outcome is persisted and the SSE contract de-overloaded so nothing is silently lost (P4); rollback clears completely and re-pauses correctly (P6). Security (A/P7) and the Stage-2 completions (C/P8–P11) interleave by shared file; cleanup (D/P12) runs last.

**Tech Stack:** Node + Express; `@langchain/langgraph@1.0.7` (StateGraph, `interrupt`/`Command`, `RetryPolicy`, `durability`) + `@langchain/langgraph-checkpoint-sqlite@1.0.3` over the already-present `better-sqlite3@12`; `@anthropic-ai/claude-agent-sdk@0.2.119` (`includePartialMessages`, `maxBudgetUsd`); `ajv@8`; React-18-via-CDN console (no build; tested via dual-export node modules); Jest (node env, no DOM/React harness).

---

# Cross-Phase Integration & Sequencing

## Recommended execution order

Phases are grouped into waves by dependency. Within a wave, phases are independent unless a shared-file note (below) constrains order.

1. **P1 — Durable checkpointer** (foundation; everything resumes on it).
2. **P2 — SDK call layer** (`isTransientError`, idle timer, `llm_delta` deltas, `maxBudgetUsd`; the contract P3+P5 consume).
3. **P3 — Retry + fail-loud** (needs P2's classifier + P1's persisted snapshot) · **P4 — Delivery + SSE contract** (needs P1's checkpointer). P3 and P4 are independent of each other.
4. **P5 — Observability UI** (needs P2's deltas, P4's `failed` event, P1/P3 resume semantics).
5. **P6 — Rollback correctness** — after P1 (so a re-paused rollback persists); otherwise independent, may run alongside waves 2–4.
6. **P7 — Security (A)** — independent; run **after P1** so its `server.js` module-scope additions anchor on the post-P1 checkpointer line (see stale-anchor note).
7. **Workstream C — P8 → P11, plus P9, P10** — parallel to B; **P8 before P11** (they merge on `input-nodes.js:428`). Coordinate shared `server.js` / `prompt-builder.js` files per the map below.
8. **P12 — Cleanup (D)** — **LAST**. It deletes fields/symbols that earlier phases reference (notably the `ROLLBACK_CLEARS_EXEMPT` entry from P6).

## Shared-file ordering map

Each phase edits *different functions/lines* of a shared file unless a merge (M#) is noted. **Anchor edits on the symbol/function name, not the line number** — line numbers shift after the first phase edits a file.

| File | Phases (in order) | Notes |
|---|---|---|
| `server.js` | P1 → P4 → P7 → P8 | P1 establishes the `SqliteSaver` line + module-scope singletons; **M1** (`module.exports`), **M2** (approve `finally`). P7 anchors module-scope additions on the post-P1 checkpointer (stale-anchor note). |
| `lib/api-helpers.js` | P7 (source) ; P6 (test only) | P7 adds `confineToBase` + `path` require + export. P6 only appends to `api-helpers.test.js`. |
| `lib/workflow/state.js` | P6 → P12 | P6 adds `ROLLBACK_CLEARS` entries + `ROLLBACK_CLEARS_EXEMPT`; **M6** — P12.5 must also strip `supervisorNarrativeCompass` from `EXEMPT`. |
| `lib/workflow/graph.js` | P3 → P12 | P3 adds `retryPolicy` to `addNode` calls; P12 rewrites adjacent comments. |
| `lib/workflow/nodes/input-nodes.js` | P3, P8 → P11 | P3 at ~489/520/591 (fail-loud); **M5** — P8 (`:428` normalize) then P11 (`:428` precedence) merge into one line. |
| `lib/workflow/nodes/ai-nodes.js` | P3, P9, P12 | P3 at 214–354; P9 at ~1213–1233; P12 at ~1573. Disjoint. |
| `lib/prompt-builder.js` | P9, P10, P11, then CR-7 | P9 `buildOutlinePrompt`; P10 example + `buildValidationPrompt`; P11 `generateRosterSection`; CR-7 collapses the 4 call sites (last). Disjoint functions. |
| `lib/workflow/nodes/arc-specialist-nodes.js` | P3, P12 | P3 at ~863 (N7); P12 at 56–58/1769. Disjoint. |
| `console/state.js` | P4, P5 | P4 `SET_ERROR`/`CLEAR_ERROR`; P5 `PROCESSING_START`/`SSE_PROGRESS`/`SSE_LLM_*` + `StreamLogic` const + `initialState`/`ACTIONS`. Disjoint cases. |
| `console/api.js` | P4, P5 | **M3** — both extend the SSE allowlist; merge into one. |
| `console/app.js` | P4, P5 | **M4** — both add `failed` handling; reconcile into one inline-card path. P5 also rewrites the processing render block. |
| `console/index.html` | P4, P5, P8 | Three new `<script>` tags (`session-status-logic.js`, `llm-stream-logic.js`, `input-review-logic.js`), each before its consumer. Compose; order among the three is irrelevant. |
| `lib/__tests__/api-helpers.test.js` | P6, P7 | Both append `describe` blocks; only P7 edits the import line. |
| `__tests__/unit/workflow/state.test.js` | P12 (12.4/12.5/12.6) | Internal to P12; do tasks in order. |

## The six shared-file merges

### M1 — `server.js` `module.exports` is cumulative
P1.4, P4.1, and P4.2 each rewrite `module.exports = { buildResumePayload };` from the *original* baseline. Applied naively, the later phase drops the earlier exports. **Each phase ADDS to the current export object.** After P1+P4 the line must be:
```js
module.exports = { buildResumePayload, drainAndClose, _inFlight: inFlightTasks, getSessionOutcome, shapeSessionState };
```
(When you reach P4.1/P4.2, read the current `module.exports` and append `getSessionOutcome`/`shapeSessionState` rather than replacing it with `{ buildResumePayload, ... }`.)

### M2 — one `finally` in the approve background task
P1.4 Step 4 wraps the `setImmediate` in a tracked Promise and adds `finally { resolve(); }` to its inner `try/catch`. P4.3 Step 5 adds `finally { releaseSessionLock(sessionId); }` to the **same** `try/catch`. Two `finally` clauses are a syntax error — **merge into one** (do P1 first, then in P4.3 add the release as the first line of the finally P1.4 created):
```js
            } catch (error) {
                // ... existing P4.1 failed-outcome record + emitComplete ...
            } finally {
                releaseSessionLock(sessionId);   // CONC-1 (P4.3)
                resolve();                       // DUR-2 drain (P1.4)
            }
```

### M3 — merged `console/api.js` SSE allowlist
P4.4 Step 5 adds `'failed'`; P5.3 Step 1 adds `'llm_delta'`/`'llm_error'`. Both rewrite the same `switch (type)` allowlist. Use the union (whichever phase lands second produces this; the `default` branch still forwards anything, so this is explicit-contract, not new routing):
```js
          case 'progress':
          case 'llm_start':
          case 'llm_delta':
          case 'llm_complete':
          case 'llm_error':
          case 'complete':
          case 'failed':
          case 'error':
          case 'heartbeat':
            if (onProgress) onProgress({ type, data });
            break;
```

### M4 — ONE `failed` path in `console/app.js` (inline card, not banner)
**This is a design reconciliation, not just a merge.** P4.4 Step 6 handles the `failed` SSE event with a `SET_ERROR` **banner**; P5.3 Step 3 instead drives an inline **failure card** via `SSE_LLM_FAILURE` — but mis-keys it as `currentPhase === 'failed'` *inside* the `complete` case (wrong: P4's `outcomeEventType` makes the *event type* `'failed'` while `currentPhase` stays `'error'`). The intended UX (per the design) is the **inline card**. Resolution:
- **Use this single `case 'failed':`** in `handleApprove`'s SSE switch (replaces P4.4 Step 6's version):
```js
            case 'failed':
              // P4 SSE-1 emits type:'failed' for an error outcome. Reconciled failure
              // UX: close the stream, clear `processing` (SSE_COMPLETE), and drive the
              // INLINE failure card (Retry=/resume, Roll back) via SSE_LLM_FAILURE —
              // NOT a SET_ERROR banner. ProgressStream stays mounted while
              // llmActivity.phase==='failed', so the card renders with processing=false.
              eventSource.close();
              sseRef.current = null;
              dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
              dispatch({
                type: APP_ACTIONS.SSE_LLM_FAILURE,
                error: (event.data.error || 'Workflow failed') +
                  (event.data.details ? ' — ' + event.data.details : '')
              });
              break;
```
- **DROP P5.3 Step 3 entirely** (its `currentPhase === 'failed'`-inside-`complete` branch and all its intermediate-draft cruft). Keep P5.3 Steps 1–2 (the `llm_delta` case) and Steps 4–6.
- The existing `else if (result.currentPhase === 'error')` branch inside `case 'complete':` becomes unreachable (errors now arrive as `type:'failed'`); leave it or delete it — harmless.
- `SSE_LLM_FAILURE` is added to `ACTIONS` + the reducer by P5.2; it must land before/with this (P5 depends on P4, so P4's `failed` event + P5's handler land together — sequence P4 then P5).

### M5 — merged `input-nodes.js:428` (precedence + canonical normalization)
P8.2/P8.4 (X-1/CR-6) rewrite line 428 to normalize to canonical keys; P11.2 (CR-4) rewrites the *same line* to fix `|| {}` precedence. **Merge — P11's precedence picks the map, P8's normalizer re-keys it.** Do **P8 first**, then P11.2 Step 4 produces this final line (its "before" is P8's normalized form):
```js
      // F1 (X-1 + CR-6 + CR-4): pick the populated pronoun map by key-count (CR-4 —
      // an empty {} must not shadow rawInput), then re-key to canonical first names
      // (X-1) so generateRosterSection.resolvePronouns matches. sessionConfig.rosterPronouns
      // is the single downstream source (CR-6).
      result.rosterPronouns = normalizeRosterPronounsToCanonical(
        resolveRosterPronouns(state, rawInput),
        state.canonicalCharacters || {}
      );
```
Both helpers are required: `resolveRosterPronouns` (P11, defined above `parseRawInput`) and `normalizeRosterPronounsToCanonical` (P8, imported from `node-helpers`). **Also update P8.4 Step 2's `stamp()` test mirror** to call `resolveRosterPronouns(state, rawInput)` instead of `state.rosterPronouns || rawInput.rosterPronouns || {}`, so the characterization test pins the real merged expression. Keep both P8's and P11's test suites.

### M6 — P12 must update P6's `ROLLBACK_CLEARS_EXEMPT`
> **✅ FOLDED (2026-06-21 verification):** now folded directly into Task 12.5 as **Step 4b** (remove the field from `ROLLBACK_CLEARS_EXEMPT`) and the amended **Step 5** (which also runs `rollback-clears-completeness.test.js`). No separate action needed; the rationale below is retained.

P6.3 adds `'supervisorNarrativeCompass'` to `ROLLBACK_CLEARS_EXEMPT`. P12.5 deletes that field from `state.js`. Task 12.5 Step 4b also removes the `'supervisorNarrativeCompass'` line from `ROLLBACK_CLEARS_EXEMPT`, or P6's `rollback-clears-completeness.test.js` ("every EXEMPT entry is a real state field") fails. (The "every field cleared or exempt" test still passes — one fewer field and one fewer exemption.)

### M7 — `client.js` error branch: Task 2.1 enrichment + Task 2.4 budget case (same lines)
Both Task 2.1 (MUST-FIX 3 enrichment — adds `sdkSubtype`/`sdkErrors` to the generic error throw) and Task 2.4 Step 5 (inserts the explicit `error_max_budget_usd` case) edit the SAME `client.js:354–359` error-result branch. **P2.1 runs first** and enriches the generic branch; **P2.4 then inserts the budget case BEFORE it and keeps the enrichment** on the generic fallthrough. Task 2.4 Step 5's "from"/"to" blocks already reflect the post-2.1 enriched shape — apply them as written. Net (both landed): a budget case (enriched, non-transient) followed by the enriched generic branch (keeps `overloaded_error` auto-retryable).

## Stale-anchor coordinations (no merge, just re-anchor)

- **P7 `server.js:37` anchor:** Tasks 7.2 Step 3 and 7.4 Step 3 add `DATA_DIR` / `loginRateLimiter` "after `const sharedCheckpointer = new MemorySaver();`" — but P1.2 replaced that with the `SqliteSaver` block (`CHECKPOINT_DB_PATH` + `mkdirSync` + `SqliteSaver.fromConnString(...)`). Anchor the additions **after the `sharedCheckpointer` declaration** (whatever its current form), alongside P1.4's `inFlightTasks`/`shuttingDown`/`httpServer`.
- **P3 startup Notion-reachability probe (P3.11):** lives in the `server.js` startup IIFE next to `isClaudeAvailable()` (P1 doesn't change that block; P7 doesn't either) — additive, no conflict.
- **`console/state.js` / `console/app.js`:** P4 and P5 touch different reducer cases / switch cases; locate by case name.

## CR-7 — the one finding the drafters did not cover (add to P12)

CR-7 (collapse the four identical `generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData, this.sessionConfig?.rosterPronouns)` call sites at `prompt-builder.js:603/653/793/1079` into one accessor) was dropped. It is **cosmetic DRY** (the four sites are correct; the `resolvePronouns` linear scan is over a ≤~10-key map — negligible, no perf fix needed). Land it **last, after P11/X-6** (which modifies `generateRosterSection`'s body). Append as **Task P12.8 (renumber the existing "Final whole-suite green check" to P12.9):**

**Task P12.8: Collapse the 4 `generateRosterSection` call sites into `_rosterSection()` (CR-7)**
- Files: `lib/prompt-builder.js` (add a `_rosterSection()` method on the `PromptBuilder` class; replace the 4 call sites); Test: `lib/__tests__/prompt-builder.test.js`.
- [ ] Step 1: Add a characterization test asserting the accessor equals the direct call:
```js
it('_rosterSection() returns the same string as the direct generateRosterSection call (CR-7)', () => {
  const pb = new PromptBuilder('journalist');
  pb.canonicalCharacters = { Vic: 'Vic Kingsley' };
  pb.characterData = null;
  pb.sessionConfig = { rosterPronouns: { Vic: 'she/her' } };
  const { generateRosterSection } = require('../prompt-builder');
  expect(pb._rosterSection()).toBe(
    generateRosterSection('journalist', pb.canonicalCharacters, pb.characterData, pb.sessionConfig.rosterPronouns)
  );
});
```
- [ ] Step 2: Run it — FAIL (`pb._rosterSection is not a function`).
- [ ] Step 3: Add the method to the `PromptBuilder` class (near the other private helpers): `_rosterSection() { return generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData, this.sessionConfig?.rosterPronouns); }`.
- [ ] Step 4: Replace each of the 4 call sites (`prompt-builder.js:603/653/793/1079`) — the embedded `${generateRosterSection(this.themeName, this.canonicalCharacters, this.characterData, this.sessionConfig?.rosterPronouns)}` becomes `${this._rosterSection()}`.
- [ ] Step 5: Run the full `prompt-builder.test.js` — all green (output byte-identical).
- [ ] Step 6: Commit `chore(cleanup): DRY generateRosterSection into _rosterSection accessor (CR-7)`.

## Final integration gate (run after ALL phases land)

- [ ] `npx jest` — the entire suite green.
- [ ] `node -e "require('./server.js'); console.log('server requires OK')"` then `rm -f data/checkpoints.sqlite data/checkpoints.sqlite-*`.
- [ ] Live smoke: `npm start`, run one full session through the console (or `node scripts/e2e-walkthrough.js --session <id> --auto`) to confirm the durable checkpointer + live stream + reconciled `failed` card + retry path work end-to-end.

## Verification follow-ups (minor — 2026-06-21 design-verification gate; apply at the noted task)

The 2026-06-21 verification cleared the gate (3 must-fixes + 2 should-fixes folded above). These remaining items are non-gating polish — each is a ~one-line edit; apply when you reach the task.

- **F4 (Task 12.3):** after deleting `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT`, reword the now-stale comment at `subagents.js:227` to "Split from the former player-focus-guided single-call prompt."
- **IDEM-3 (Task P3.2):** add a one-line comment above the `parseRawInput` interrupt (input-nodes.js ~632) noting the SDK calls + file writes BEFORE the interrupt are RE-RUN on every `/resume` and must stay idempotent (writes overwrite; SDK calls read-only) — so a future edit doesn't introduce a non-idempotent side effect there.
- **DEL-1 lifetime (Task P4.1):** in `session-outcome.js`, fix the comment claiming the module-scope `Map` "rides the checkpointer cache lifetime." After P1 the checkpointer is restart-durable but this store is NOT — state it is process-local and that the durable interrupt state is the authoritative recovery surface.
- **F3 orphan (Task 4.5):** 4.5 implements only the SET_ERROR-clears-processing fix, not an SSE reconnect — drop the "UX-5" claim from its title and add a one-line note that UX-5's data-loss is covered by Task 4.2's persisted outcome (GET /state is *inspectable* after a disconnect). UX-7 (app.js rollback fall-through) needs no task — verified harmless.
- **SEC-A-2 (Task 7.1 — threat-model decision):** `confineToBase` does not `realpath()`, so a symlink INSIDE `data/` pointing outside would pass. For this single-tenant console where `data/` holds only server-created session dirs (no attacker-controlled symlinks), document that assumption in the helper's JSDoc. If `data/` could ever be attacker-writable, instead add an `fs.realpathSync.native` re-check (guard ENOENT for not-yet-created write targets).
- **SEC-A-3 (Task 7.4 — ingress assumption):** the rate-limiter keys on client IP via `trust proxy` + Cloudflare `x-forwarded-for`; correct ONLY if the tunnel is the sole ingress. Confirm `server.js` binds port 3001 to `127.0.0.1` (not `0.0.0.0`); if direct LAN access is possible, key on `CF-Connecting-IP`. Document the assumption in Task 7.4.

---

# Phase Sections

The 12 phase sections follow. Their per-task code is exact; defer to the integration section above for the six merges (M1–M6), the CR-7 addition, and execution order.

---

## Phase P1: Durable execution foundation (SqliteSaver + durability:sync)

Goal: Sessions survive a server restart/crash/deploy — every node boundary is a persisted recovery point on disk, and an in-flight resume drains (or refuses new work) on SIGINT instead of vanishing.

Dependencies: None. This is the first phase of Workstream B and underpins all later recovery work (resume-after-failure, retry, rollback). Land it before any other B phase.

### Task P1.1: Install `@langchain/langgraph-checkpoint-sqlite` and resolve the `@langchain/core` peer

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\package.json:23,27` (deps block)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\package-lock.json` (regenerated by npm)

- [ ] **Step 1: Confirm the exact peer-version contract before editing (verification command, not a guess).** The saver pins core; we must match it.
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npm view @langchain/langgraph-checkpoint-sqlite@1.0.3 peerDependencies
  ```
  Expected output (already verified during planning — re-run to confirm at task time):
  ```
  {
    '@langchain/core': '^1.1.44',
    '@langchain/langgraph-checkpoint': '^1.0.0'
  }
  ```
  We currently resolve `@langchain/core@1.1.40` (verify: `node -e "console.log(require('@langchain/core/package.json').version)"`) and `@langchain/langgraph-checkpoint@1.0.0` — so only `core` needs a bump; `langgraph-checkpoint@1.0.0` already satisfies `^1.0.0`.

- [ ] **Step 2: Bump `@langchain/core` in package.json from `^1.1.8` to `^1.1.44`.** Real before/after at `package.json:23`:
  ```json
  // before
    "@langchain/core": "^1.1.8",
  // after
    "@langchain/core": "^1.1.44",
  ```

- [ ] **Step 3: Add the new dependency in package.json, alphabetically after `@langchain/core` (line 23) and before `@langchain/langgraph` (line 24).** Real before/after:
  ```json
  // before
    "@langchain/core": "^1.1.44",
    "@langchain/langgraph": "^1.0.7",
  // after
    "@langchain/core": "^1.1.44",
    "@langchain/langgraph-checkpoint-sqlite": "1.0.3",
    "@langchain/langgraph": "^1.0.7",
  ```
  (Pin `1.0.3` exactly — it is the version whose peer set we verified; do not float it.)

- [ ] **Step 4: Install and let npm hoist a compatible `core`.** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npm install
  ```
  Expected: install succeeds with no `ERESOLVE` peer error (the core bump resolves it). If `ERESOLVE` still appears, the message names the unmet peer — re-read it and adjust that exact range; do NOT pass `--force`/`--legacy-peer-deps` (that would mask a real incompatibility with the `better-sqlite3@12` native binding).

- [ ] **Step 5: Verify the saver loads against the already-present native `better-sqlite3@12` and exposes the documented API.** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  node -e "const {SqliteSaver}=require('@langchain/langgraph-checkpoint-sqlite'); const s=SqliteSaver.fromConnString(':memory:'); console.log('ctor:'+(typeof SqliteSaver)+' fromConnString:'+(typeof SqliteSaver.fromConnString)+' db.close:'+(typeof s.db.close)); s.db.close();"
  ```
  Expected output:
  ```
  ctor:function fromConnString:function db.close:function
  ```
  (Confirms `fromConnString(path)` and the public `.db` better-sqlite3 handle with `.close()` — the two API surfaces P1.2 and P1.3 depend on.)

- [ ] **Step 6: Confirm the existing suite still passes (no version-bump regression).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/integration/workflow.test.js
  ```
  Expected: the suite passes (graph compiles + routes unchanged under the bumped core).

- [ ] **Step 7: Commit.**
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  git add package.json package-lock.json
  git commit -m "chore(deps): add @langchain/langgraph-checkpoint-sqlite@1.0.3, bump core to ^1.1.44

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task P1.2: Replace `MemorySaver` with a durable `SqliteSaver` over `data/checkpoints.sqlite`

**Files:**
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\integration\durable-checkpointer.test.js`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js:14,36-37`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\.gitignore` (ignore the sqlite db + WAL sidecars)

- [ ] **Step 1: Write the failing integration test FIRST (TDD).** This proves the *whole point* of the phase — an interrupt survives a fresh process. It builds a minimal real `interrupt()` graph (NOT the 43-node pipeline; that needs Notion/SDK) so the test isolates the saver's durability, then simulates a restart by discarding the first saver and opening a *second* `SqliteSaver` over the same db file.

  `__tests__/integration/durable-checkpointer.test.js`:
  ```js
  /**
   * Durable checkpointer integration test (Phase P1 / DUR-1).
   *
   * Proves: a graph paused at interrupt() persists to disk and a FRESH
   * SqliteSaver over the same db file restores the interrupt — i.e. a
   * server restart does not evaporate a session parked mid-review.
   *
   * Uses a minimal real interrupt() graph, not the 43-node pipeline (which
   * needs Notion + the SDK). The saver behavior under test is graph-agnostic.
   */
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const { StateGraph, START, END, Annotation, interrupt } = require('@langchain/langgraph');
  const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

  const State = Annotation.Root({
    value: Annotation({ reducer: (_, b) => b, default: () => null })
  });

  function buildGraph(checkpointer) {
    const builder = new StateGraph(State)
      .addNode('pause', () => {
        // interrupt() throws GraphInterrupt; the saver persists the pre-interrupt snapshot
        const answer = interrupt({ ask: 'approve?' });
        return { value: answer };
      })
      .addEdge(START, 'pause')
      .addEdge('pause', END);
    return builder.compile({ checkpointer });
  }

  describe('SqliteSaver durability across a simulated restart', () => {
    let dbPath;

    beforeEach(() => {
      dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aln-ckpt-')), 'checkpoints.sqlite');
    });

    it('restores a parked interrupt from disk via a brand-new saver instance', async () => {
      const thread = { configurable: { thread_id: 'sess-1' } };

      // --- process #1: run to the interrupt, then "crash" (drop the saver ref) ---
      let saver1 = SqliteSaver.fromConnString(dbPath);
      const graph1 = buildGraph(saver1);
      await graph1.invoke({ value: 'init' }, { ...thread, durability: 'sync' });
      const state1 = await graph1.getState(thread);
      expect(state1.tasks?.[0]?.interrupts?.length).toBeGreaterThan(0); // genuinely paused
      saver1.db.close(); // simulate process exit releasing the file handle

      // --- process #2: fresh saver, SAME file — must see the parked interrupt ---
      const saver2 = SqliteSaver.fromConnString(dbPath);
      const graph2 = buildGraph(saver2);
      const restored = await graph2.getState(thread);
      expect(restored.tasks?.[0]?.interrupts?.length).toBeGreaterThan(0);
      expect(restored.values.value).toBe('init'); // pre-interrupt work preserved
      saver2.db.close();
    });

    it('an in-memory MemorySaver would NOT survive (control): fresh saver sees nothing', async () => {
      const { MemorySaver } = require('@langchain/langgraph');
      const thread = { configurable: { thread_id: 'sess-2' } };
      const g1 = buildGraph(new MemorySaver());
      await g1.invoke({ value: 'init' }, { ...thread, durability: 'sync' });
      // a *new* MemorySaver (the restart) has an empty store
      const g2 = buildGraph(new MemorySaver());
      const restored = await g2.getState(thread);
      expect(restored.tasks).toEqual([]); // nothing parked -> the bug DUR-1 describes
    });
  });
  ```

- [ ] **Step 2: Run the test and watch it pass for the SqliteSaver case (it should already pass once the package from P1.1 is installed — this test pins the BEHAVIOR we are about to wire into server.js, and guards against a future regression to MemorySaver).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/integration/durable-checkpointer.test.js
  ```
  Expected: both tests pass. (If `interrupts` is read at a different path on this langgraph version, the first assertion fails with the actual shape printed — adjust the accessor to match `graph.getState` output; do not weaken the assertion to a bare truthy.)

- [ ] **Step 3: Swap the import at `server.js:14` to add `SqliteSaver` (keep `Command`; `MemorySaver` is no longer needed in server.js).** Real before/after:
  ```js
  // before (server.js:14)
  const { MemorySaver, Command } = require('@langchain/langgraph');
  // after
  const { Command } = require('@langchain/langgraph');
  const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
  ```

- [ ] **Step 4: Replace the checkpointer instantiation at `server.js:36-37`.** Resolve the db path under the repo's `data/` tree and ensure the directory exists (a fresh clone may not have `data/` yet). Real before/after:
  ```js
  // before (server.js:36-37)
  // Shared checkpointer instance - must persist across API calls for resume to work
  const sharedCheckpointer = new MemorySaver();
  // after
  // Shared checkpointer instance - DURABLE (DUR-1): sessions survive restart/crash/deploy.
  // SqliteSaver.fromConnString opens (and creates) the db; .db is the better-sqlite3 handle.
  const CHECKPOINT_DB_PATH = path.join(__dirname, 'data', 'checkpoints.sqlite');
  fs.mkdirSync(path.dirname(CHECKPOINT_DB_PATH), { recursive: true });
  const sharedCheckpointer = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);
  ```
  (`path` and `fs` are already required at `server.js:10-11`.)

- [ ] **Step 5: Ignore the on-disk db and its WAL/SHM sidecars so they never get committed.** Append to `.gitignore`:
  ```gitignore
  # Durable LangGraph checkpointer (DUR-1)
  data/checkpoints.sqlite
  data/checkpoints.sqlite-shm
  data/checkpoints.sqlite-wal
  ```
  (Verify the exact path isn't already covered: `grep -n checkpoints .gitignore` — add only the lines not already present.)

- [ ] **Step 6: Confirm server.js still loads with the new import/instantiation (no startup crash), without starting the listener.** `server.js` is guarded by `require.main === module`, so requiring it is safe. Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  node -e "require('./server.js'); const fs=require('fs'); console.log('db-created:'+fs.existsSync('data/checkpoints.sqlite'))"
  ```
  Expected output:
  ```
  db-created:true
  ```
  (Proves the require path resolves the new package, `fromConnString` opens the file, and `data/` was created.)

- [ ] **Step 7: Re-run the durable test + the server-requiring unit test together (no regression to the existing server contract).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/integration/durable-checkpointer.test.js __tests__/unit/server-build-resume-payload.test.js
  ```
  Expected: all pass.

- [ ] **Step 8: Remove the scratch db the node probe created so it isn't left in the tree.** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  rm -f data/checkpoints.sqlite data/checkpoints.sqlite-shm data/checkpoints.sqlite-wal
  ```

- [ ] **Step 9: Commit.**
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  git add server.js .gitignore __tests__/integration/durable-checkpointer.test.js
  git commit -m "fix(durability): replace MemorySaver with on-disk SqliteSaver (DUR-1)

Sessions parked mid-review now survive restart/crash/deploy.
Adds durable-checkpointer integration test proving interrupt restore
across a fresh saver over the same db file.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task P1.3: Add `durability: 'sync'` to all 5 `graph.invoke` sites

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js:567,890,982,1089,1146`

- [ ] **Step 1: Confirm there are exactly 5 invoke sites and capture their current option objects (verification command).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  grep -n "graph.invoke" server.js
  ```
  Expected (5 lines): `567`, `890`, `982`, `1089`, `1146`. Every one currently passes `{ ...config, recursionLimit: RECURSION_LIMIT }` (verified in planning). With the durable saver from P1.2, `durability: 'sync'` forces a flush to sqlite at every super-step boundary — without it the default (`'async'`) can lose the last writes on an abrupt exit, re-opening the DUR-1 gap we just closed.

- [ ] **Step 2: Edit the `/api/generate`-legacy-or-fresh invoke at `server.js:567`.** Real before/after:
  ```js
  // before
  const result = await graph.invoke(initialState, { ...config, recursionLimit: RECURSION_LIMIT });
  // after
  const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });
  ```

- [ ] **Step 3: Edit the `/start` invoke at `server.js:890`.** Same edit (identical before string → add `durability: 'sync', ` before `recursionLimit`):
  ```js
  // after
  const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });
  ```

- [ ] **Step 4: Edit the `/approve` background-resume invoke at `server.js:982` (this is the `Command({ resume })` path).** Real before/after:
  ```js
  // before
  const result = await graph.invoke(command, { ...config, recursionLimit: RECURSION_LIMIT });
  // after
  const result = await graph.invoke(command, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });
  ```

- [ ] **Step 5: Edit the `/rollback` invoke at `server.js:1089`.** Same edit as Step 2:
  ```js
  // after
  const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });
  ```

- [ ] **Step 6: Edit the `/resume` invoke at `server.js:1146`.** Same edit as Step 2:
  ```js
  // after
  const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });
  ```

- [ ] **Step 7: Verify all 5 invokes now carry `durability: 'sync'` and none was missed (verification command).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  grep -c "durability: 'sync'" server.js && grep -n "graph.invoke" server.js | grep -v "durability" ; echo "exit:$?"
  ```
  Expected: first count prints `5`; the second grep prints nothing (no invoke line lacks `durability`) and `exit:1` (grep found no non-matching lines). If any invoke line prints, it was missed — fix it.

- [ ] **Step 8: Confirm server.js still requires cleanly (syntax + option-object validity).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  node -e "require('./server.js'); console.log('require-ok')" && rm -f data/checkpoints.sqlite data/checkpoints.sqlite-*
  ```
  Expected output: `require-ok`.

- [ ] **Step 9: Commit.**
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  git add server.js
  git commit -m "fix(durability): flush every invoke with durability:'sync' (DUR-1)

Forces a per-super-step write to the sqlite checkpointer so an abrupt
exit cannot lose the last node boundary. Applied to all 5 graph.invoke
sites (start/approve/rollback/resume/legacy).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task P1.4: Drain in-flight work and close the saver on SIGINT (DUR-2)

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js:36-41` (module-scope state), `server.js:976-1032` (track the `/approve` background task), `server.js:1301` (hoist `server`), `server.js:1329-1340` (SIGINT handler)
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\sigint-drain.test.js`

  > Why this is needed: `server.js:1329` SIGINT does `process.exit(0)` with no `server.close()` and no awareness of the `setImmediate` background resume started at `server.js:977`. A Ctrl+C mid-approve kills the process between the graph's checkpoint write and the SSE emit — the resume's outcome is lost and (without `durability:'sync'`, or even with it on an unlucky boundary) the checkpoint write can be truncated. DUR-2 requires: stop accepting new approves, await the in-flight one, close the saver's db handle, then exit.

- [ ] **Step 1: Write the failing unit test FIRST (TDD).** The drain logic must be a *pure, exported* helper so it is testable node-side (the SIGINT handler itself calls `process.exit`, which is not unit-testable). Test the helper `drainAndClose({ inFlight, checkpointer, server })`: it must await every tracked promise, call `checkpointer.db.close()`, and call `server.close()` exactly once, in that order.

  `__tests__/unit/sigint-drain.test.js`:
  ```js
  /**
   * SIGINT drain (DUR-2): an in-flight /approve resume must finish (or be
   * awaited) and the durable checkpointer's db handle must close before exit.
   */
  const { drainAndClose, _inFlight } = require('../../server.js');

  describe('drainAndClose (DUR-2)', () => {
    it('awaits every in-flight task, then closes the db, then the server', async () => {
      const order = [];
      const inFlight = new Set();
      const task = new Promise(resolve => setTimeout(() => { order.push('task'); resolve(); }, 20))
        .finally(() => inFlight.delete(task));
      inFlight.add(task);

      const checkpointer = { db: { close: () => order.push('db.close') } };
      const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };

      await drainAndClose({ inFlight, checkpointer, server });

      expect(order).toEqual(['task', 'db.close', 'server.close']);
      expect(inFlight.size).toBe(0);
    });

    it('still closes db + server when there are no in-flight tasks', async () => {
      const order = [];
      const checkpointer = { db: { close: () => order.push('db.close') } };
      const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };
      await drainAndClose({ inFlight: new Set(), checkpointer, server });
      expect(order).toEqual(['db.close', 'server.close']);
    });

    it('closes db + server even if an in-flight task rejects (no unhandled rejection)', async () => {
      const order = [];
      const inFlight = new Set();
      const task = Promise.reject(new Error('boom')).catch(() => order.push('task-rejected'));
      inFlight.add(task);
      const checkpointer = { db: { close: () => order.push('db.close') } };
      const server = { close: (cb) => { order.push('server.close'); cb && cb(); } };
      await drainAndClose({ inFlight, checkpointer, server });
      expect(order).toContain('db.close');
      expect(order).toContain('server.close');
    });

    it('exposes a module-scope in-flight Set for the /approve handler to register into', () => {
      expect(_inFlight instanceof Set).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it and watch it FAIL (helper not exported yet).** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/unit/sigint-drain.test.js -t 'drainAndClose'
  ```
  Expected: fails — `drainAndClose is not a function` / `_inFlight` undefined (it's not exported from server.js yet).

- [ ] **Step 3: Add the module-scope in-flight registry and the pure `drainAndClose` helper near the checkpointer (after `server.js:41`).** Insert after the `let sharedPromptBuilder = null;` line:
  ```js
  // In-flight background tasks (DUR-2): the /approve handler runs the graph in a
  // setImmediate; SIGINT must await these (and refuse new ones) before exit so a
  // resume's checkpoint write + SSE emit are never severed mid-flight.
  const inFlightTasks = new Set();
  let shuttingDown = false;

  /**
   * Drain in-flight background tasks, then close the durable checkpointer's
   * sqlite handle, then close the HTTP server — in that order. Pure + injectable
   * so it is unit-testable (the SIGINT handler itself calls process.exit).
   * @param {{inFlight:Set<Promise>, checkpointer:{db:{close:Function}}, server?:{close:Function}}} deps
   */
  async function drainAndClose({ inFlight, checkpointer, server }) {
    if (inFlight && inFlight.size > 0) {
      // allSettled: a rejected resume must not abort the drain of the others
      await Promise.allSettled(Array.from(inFlight));
    }
    if (checkpointer && checkpointer.db && typeof checkpointer.db.close === 'function') {
      checkpointer.db.close();
    }
    if (server && typeof server.close === 'function') {
      await new Promise(resolve => server.close(resolve));
    }
  }
  ```

- [ ] **Step 4: Register the `/approve` background resume into `inFlightTasks` and refuse new work while shutting down.** The `setImmediate` callback at `server.js:977` is currently fire-and-forget. Wrap its promise so it is tracked, and guard the handler entry. Real before/after.

  First, guard the handler near its top (after `const approvals = req.body;` at `server.js:920`):
  ```js
  // after the existing: const approvals = req.body;
      if (shuttingDown) {
          return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
      }
  ```

  Then track the background task. Real before/after at `server.js:976-977` (the `setImmediate` open) and its closing `});` at `server.js:1032`:
  ```js
  // before
          // Run workflow in background using Command({ resume }) pattern
          setImmediate(async () => {
              try {
  // ...existing body...
          });
  // after
          // Run workflow in background using Command({ resume }) pattern.
          // Wrap in a tracked promise so SIGINT can drain it (DUR-2).
          const task = new Promise((resolve) => {
              setImmediate(async () => {
                  try {
  // ...existing body unchanged...
                  } finally {
                      resolve();
                  }
              });
          }).finally(() => inFlightTasks.delete(task));
          inFlightTasks.add(task);
  ```
  Note: the existing `try { ... } catch (error) { ...emitComplete... }` block inside the callback stays exactly as-is; we only add the outer Promise wrapper + a `finally { resolve(); }` so resolution fires after the existing catch. (Read `server.js:977-1032` and place the `} finally { resolve(); }` as the last clause of the inner `try/catch`.)

- [ ] **Step 5: Hoist the `server` reference to module scope so the SIGINT handler can close it.** At `server.js:36-41` region add a module-scope `let httpServer = null;`. Then at `server.js:1301` change `const server = app.listen(...)` to assign the hoisted var. Real before/after at `server.js:1301`:
  ```js
  // before
      const server = app.listen(PORT, () => {
  // after
      httpServer = app.listen(PORT, () => {
  ```
  And update the four timeout assignments at `server.js:1321-1324` from `server.` to `httpServer.`:
  ```js
  // after
      httpServer.timeout = SERVER_TIMEOUT_MS;
      httpServer.requestTimeout = SERVER_TIMEOUT_MS;
      httpServer.keepAliveTimeout = SERVER_TIMEOUT_MS;
      httpServer.headersTimeout = SERVER_TIMEOUT_MS + 1000;
  ```
  Add the module-scope declaration after `let shuttingDown = false;` (from Step 3):
  ```js
  let httpServer = null; // hoisted so SIGINT (module scope) can drain + close it
  ```

- [ ] **Step 6: Rewrite the SIGINT handler at `server.js:1329-1340` to set the refuse-new flag, drain, close the saver, then exit.** Real before/after:
  ```js
  // before (server.js:1329-1340)
  process.on('SIGINT', () => {
      console.log('\n\nShutting down gracefully...');
      // Close cached Notion client (SQLite connection)
      try {
          const { resetCachedNotionClient } = require('./lib/cache');
          resetCachedNotionClient();
          console.log('Closed cache connections.');
      } catch (err) {
          console.warn('Cache cleanup skipped:', err.message);
      }
      process.exit(0);
  });
  // after
  process.on('SIGINT', async () => {
      console.log('\n\nShutting down gracefully...');
      shuttingDown = true; // refuse new /approve resumes (DUR-2)
      try {
          if (inFlightTasks.size > 0) {
              console.log(`Draining ${inFlightTasks.size} in-flight task(s)...`);
          }
          await drainAndClose({
              inFlight: inFlightTasks,
              checkpointer: sharedCheckpointer,
              server: httpServer
          });
          console.log('Drained in-flight work; closed checkpointer + server.');
      } catch (err) {
          console.warn('Drain/close error:', err.message);
      }
      // Close cached Notion client (separate SQLite connection)
      try {
          const { resetCachedNotionClient } = require('./lib/cache');
          resetCachedNotionClient();
          console.log('Closed cache connections.');
      } catch (err) {
          console.warn('Cache cleanup skipped:', err.message);
      }
      process.exit(0);
  });
  ```

- [ ] **Step 7: Export the helper + the in-flight set for the test.** Real before/after at `server.js:1342-1343`:
  ```js
  // before
  // Export helpers for testing
  module.exports = { buildResumePayload };
  // after
  // Export helpers for testing
  module.exports = { buildResumePayload, drainAndClose, _inFlight: inFlightTasks };
  ```

- [ ] **Step 8: Re-run the drain test — now PASS.** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/unit/sigint-drain.test.js
  ```
  Expected: all 4 tests pass (`task` → `db.close` → `server.close` ordering, the no-task case, the rejecting-task case, and `_inFlight` is a Set).

- [ ] **Step 9: Confirm the full server-related suite is green and the server still requires cleanly.** Run:
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  npx jest __tests__/unit/server-build-resume-payload.test.js __tests__/unit/sigint-drain.test.js __tests__/integration/durable-checkpointer.test.js && node -e "require('./server.js'); console.log('require-ok')" && rm -f data/checkpoints.sqlite data/checkpoints.sqlite-*
  ```
  Expected: all suites pass; prints `require-ok`.

- [ ] **Step 10: Commit.**
  ```bash
  cd /c/Users/spide/Documents/claudecode/aboutlastnight/reports
  git add server.js __tests__/unit/sigint-drain.test.js
  git commit -m "fix(durability): drain in-flight approves + close saver on SIGINT (DUR-2)

SIGINT now refuses new /approve resumes, awaits the in-flight background
task (allSettled), closes the SqliteSaver db handle, then closes the HTTP
server before exit — no more severed checkpoint write / lost SSE emit.
Hoists the http server to module scope; adds a pure drainAndClose helper
with node-env unit coverage.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```
```

Key file paths referenced (all absolute):
- `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\package.json`
- `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js`
- `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\workflow\graph.js`
- `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\integration\durable-checkpointer.test.js` (new)
- `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\sigint-drain.test.js` (new)

Verified at draft time: `SqliteSaver.fromConnString(path)` + public `.db.close()` API; `@langchain/langgraph-checkpoint-sqlite@1.0.3` peers `@langchain/core@^1.1.44` (we're on 1.1.40 → bump) and `@langchain/langgraph-checkpoint@^1.0.0` (already 1.0.0); all 5 `graph.invoke` sites at server.js:567/890/982/1089/1146; SIGINT at 1329 does a bare `process.exit(0)`; the `/approve` background task is a fire-and-forget `setImmediate` at 977; `server` is block-scoped inside the startup IIFE (must hoist).

---

## Phase P2: SDK call layer — stall timeout + partial streaming + cost cap + transient classifier

**Goal:** Replace the SDK wrapper's fixed total-duration abort with an idle (stall) timer, stream token-level deltas to `onProgress`, enforce a per-call spend ceiling, and add a shared transient/permanent error classifier the retry policy and observability layers consume.

**Dependencies:** None at the code level — P2 is self-contained in `lib/llm/`. It produces the `isTransientError` classifier and the `llm_delta` event contract that **P3 (node `retryPolicy` + fail-loud)** and **P5 (observability back half: progress-bridge coalescing + SSE + console state)** depend on, so P2 must land before P3's `retryOn` wiring and before P5's delta plumbing. The existing client behavior (structured-output extraction, `settingSources` scoping, diagnostics envelope) is preserved unchanged.

---

### Task 2.1: Create `isTransientError` classifier in `lib/llm/retry.js` + re-export from index

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\client.js` (error-result throw ~355–358 — enrich with `sdkSubtype`/`sdkErrors`)
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\retry.js`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\index.js` (lines 17–25 import block; 58–67 exports block)
- Test (create): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\__tests__\retry.test.js`

Error taxonomy confirmed against the `claude-api` skill's `shared/error-codes.md`: **non-retryable** 400 `invalid_request_error`, 401 `authentication_error`, 403 `permission_error`; **retryable** 429 `rate_limit_error`, 500 `api_error`, 529 `overloaded_error` (503 added per the fixed interface contract; connection-reset names `ECONNRESET`/`ETIMEDOUT` per Node). `isSdkTimeoutError` (client.js:399) classifies our own idle-abort message as transient.

- [ ] **Step 1: Write the failing test file** covering every transient and permanent case in the contract.

```js
// lib/llm/__tests__/retry.test.js
const { isTransientError } = require('../retry');
const { StructuredOutputExtractionError } = require('../structured-output-extractor');

describe('isTransientError', () => {
  describe('returns true (transient — should retry)', () => {
    test('our own SDK idle/timeout error', () => {
      // Same message shape isSdkTimeoutError matches (client.js idle abort)
      expect(isTransientError(new Error('SDK timeout after 905.0s (limit: 900s) - analyzeArcs'))).toBe(true);
    });

    test.each([429, 500, 503, 529])('apiErrorStatus %i', (status) => {
      const err = new Error('upstream'); err.apiErrorStatus = status;
      expect(isTransientError(err)).toBe(true);
    });

    test.each([429, 500, 503, 529])('status %i', (status) => {
      const err = new Error('upstream'); err.status = status;
      expect(isTransientError(err)).toBe(true);
    });

    test.each(['rate_limit_error', 'overloaded_error', 'api_error'])('error.type %s', (type) => {
      const err = new Error('upstream'); err.error = { type };
      expect(isTransientError(err)).toBe(true);
    });

    test.each(['ECONNRESET', 'ETIMEDOUT'])('err.name %s', (name) => {
      const err = new Error('socket'); err.name = name;
      expect(isTransientError(err)).toBe(true);
    });

    test('err.code ECONNRESET', () => {
      const err = new Error('socket'); err.code = 'ECONNRESET';
      expect(isTransientError(err)).toBe(true);
    });

    // Real wrapper output (the DOMINANT upstream-transient shape): the SDK
    // error-result path throws a bare Error enriched with sdkSubtype + sdkErrors
    // (client.js), with NO apiErrorStatus/status/error.type. A sustained 429/500/529
    // that exhausts the SDK's own retries surfaces here as error_during_execution +
    // overloaded_error — this is what must auto-retry in practice.
    test.each(['overloaded_error', 'rate_limit_error', 'api_error'])(
      'enriched wrapper error: sdkErrors contains %s', (type) => {
        const err = new Error(`SDK error_during_execution: ${type}`);
        err.sdkSubtype = 'error_during_execution';
        err.sdkErrors = [type];
        expect(isTransientError(err)).toBe(true);
      });
  });

  describe('returns false (permanent — do not retry)', () => {
    test.each([400, 401, 403])('apiErrorStatus %i', (status) => {
      const err = new Error('bad'); err.apiErrorStatus = status;
      expect(isTransientError(err)).toBe(false);
    });

    test.each(['authentication_error', 'permission_error', 'invalid_request_error'])('error.type %s', (type) => {
      const err = new Error('bad'); err.error = { type };
      expect(isTransientError(err)).toBe(false);
    });

    test('StructuredOutputExtractionError is permanent', () => {
      expect(isTransientError(new StructuredOutputExtractionError('no json', { label: 'x' }))).toBe(false);
    });

    test('budget-exceeded error is permanent', () => {
      expect(isTransientError(new Error('SDK error_max_budget_usd: budget exceeded'))).toBe(false);
    });

    test('plain unknown error is permanent (no false retries)', () => {
      expect(isTransientError(new Error('something weird'))).toBe(false);
    });

    test('null / undefined are permanent', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails because the module does not exist.**
  - Run: `npx jest lib/llm/__tests__/retry.test.js`
  - Expected: `Cannot find module '../retry' from 'lib/llm/__tests__/retry.test.js'`

- [ ] **Step 3: Enrich the SDK wrapper's thrown error, then create `lib/llm/retry.js`.**

  First, give the wrapper's error-result throw a classifiable shape. In `lib/llm/client.js` the error-result path throws a BARE `Error` with no status/type/code (client.js:355–358) — so a sustained upstream 429/500/529 (which the SDK surfaces as `error_during_execution` carrying `overloaded_error` after exhausting its OWN internal retries) classifies as permanent and never auto-retries. Enrich it so the classifier can read the subtype:
  ```javascript
  // lib/llm/client.js — error-result path (currently ~355-358):
  if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
      clearTimeout(timeoutId);
      const errorDetails = msg.errors?.join(', ') || 'Unknown error';
      const sdkErr = new Error(`SDK ${msg.subtype}: ${errorDetails}`);
      sdkErr.sdkSubtype = msg.subtype;     // e.g. 'error_during_execution', 'error_max_budget_usd'
      sdkErr.sdkErrors = msg.errors || []; // e.g. ['overloaded_error']
      throw sdkErr;
  }
  ```

  Then create `lib/llm/retry.js` with the classifier. It imports `isSdkTimeoutError` from `client.js` (existing export, client.js:472) and `StructuredOutputExtractionError` from the extractor.

```js
// lib/llm/retry.js
/**
 * Transient-vs-permanent error classification for retry decisions.
 *
 * Single source of truth consumed by:
 *   - LangGraph node retryPolicy.retryOn (graph.js) — auto-retry transient LLM failures
 *
 * Transient (retry): our idle/stall timeout, rate-limit / overloaded / 5xx upstream,
 * connection resets. Permanent (surface to operator): auth/permission/invalid-request,
 * structured-output extraction failures, cost-ceiling overruns.
 *
 * Error-type strings verified against the claude-api skill shared/error-codes.md:
 *   400 invalid_request_error · 401 authentication_error · 403 permission_error  → NO retry
 *   429 rate_limit_error · 500 api_error · 529 overloaded_error                  → retry
 *
 * @module llm/retry
 */

const { isSdkTimeoutError } = require('./client');
const { StructuredOutputExtractionError } = require('./structured-output-extractor');

const TRANSIENT_STATUS = new Set([429, 500, 503, 529]);
const TRANSIENT_TYPES = new Set([
  'rate_limit_error',
  'overloaded_error',
  'api_error',
  'ECONNRESET',
  'ETIMEDOUT'
]);

/**
 * @param {unknown} err
 * @returns {boolean} true if the failure is worth an automatic retry
 */
function isTransientError(err) {
  if (!err || typeof err !== 'object') return false;

  // Permanent by identity — never retry these regardless of any status field.
  if (err instanceof StructuredOutputExtractionError) return false;

  // Our own idle/stall abort (client.js wraps it as "SDK timeout after ...").
  if (isSdkTimeoutError(err)) return true;

  // HTTP-ish status carried by the SDK or an underlying fetch error.
  const status = err.apiErrorStatus ?? err.status;
  if (typeof status === 'number') {
    if (TRANSIENT_STATUS.has(status)) return true;
    // 400/401/403 and any other explicit status → permanent.
    return false;
  }

  // Anthropic error-type string and Node socket error name/code — checked
  // INDEPENDENTLY. A normal Error has name==='Error', which must NOT short-circuit
  // a real err.code like 'ECONNRESET' (the old `type || name || code` chain did).
  if (typeof err.error?.type === 'string' && TRANSIENT_TYPES.has(err.error.type)) return true;
  if (typeof err.name === 'string' && TRANSIENT_TYPES.has(err.name)) return true;
  if (typeof err.code === 'string' && TRANSIENT_TYPES.has(err.code)) return true;

  // The DOMINANT real case: the SDK wrapper throws a bare Error for an error-result
  // subtype (client.js), enriched with sdkSubtype + sdkErrors but NO status/type
  // fields. Classify from those (message as a weak fallback). Terminal subtypes
  // (cost ceiling, max-turns) are permanent and MUST be tested first.
  const hay = `${err.sdkSubtype || ''} ${(err.sdkErrors || []).join(' ')} ${err.message || ''}`;
  if (/error_max_budget_usd|error_max_turns|error_max_structured_output_retries/.test(hay)) return false;
  if (/overloaded_error|rate_limit_error|\bapi_error\b|\b(?:429|500|503|529)\b|ECONNRESET|ETIMEDOUT/.test(hay)) return true;

  return false;
}

module.exports = { isTransientError };
```

- [ ] **Step 4: Re-export from `lib/llm/index.js`.** Add the require under the client import block (after line 25) and add to `module.exports` (line 58–67).

```js
// after the require('./client') block (index.js:25):
const { isTransientError } = require('./retry');
```

```js
// index.js module.exports — add isTransientError:
module.exports = {
  sdkQuery,
  query,
  getModelTimeout,
  isClaudeAvailable,
  isSdkTimeoutError,
  isTransientError,
  createSemaphore,
  createProgressLogger,
  MODEL_TIMEOUTS
};
```

- [ ] **Step 5: Re-run the test, confirm green.**
  - Run: `npx jest lib/llm/__tests__/retry.test.js`
  - Expected: all tests pass (suite green, ~30 assertions across the `test.each` rows).

- [ ] **Step 6: Confirm the index re-export resolves at runtime.**
  - Run: `node -e "console.log(typeof require('./lib/llm').isTransientError)"`
  - Expected: `function`

- [ ] **Step 7: Commit.**
  - `git add lib/llm/client.js lib/llm/retry.js lib/llm/index.js lib/llm/__tests__/retry.test.js && git commit -m "feat(llm): enrich SDK error shape + isTransientError classifier so sustained upstream 429/500/529 auto-retries (TRC-1, TRC-3)"`

---

### Task 2.2: Convert the AbortController total cap to a resettable 15-min idle timer

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\client.js` (lines 24–38 `MODEL_TIMEOUTS` doc; 110–118 timeout setup; 207–209 loop head; 380–383 abort message)
- Test (modify): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\__tests__\client-contract.test.js`

The current single `setTimeout(abort, effectiveTimeout)` (client.js:116–118) fires on **total** duration. We replace it with an idle timer re-armed on every streamed message. `MODEL_TIMEOUTS` is repurposed (and kept exported) as the idle value.

- [ ] **Step 1: Add the failing test** — a healthy long call that streams a message past the (test-shrunk) idle window must NOT abort, but a silent gap longer than the window must. Use Jest fake timers. Append to `client-contract.test.js` inside the existing `describe`.

```js
  test('idle timer resets on each streamed message (long-but-active call does not abort)', async () => {
    jest.useFakeTimers();
    // A generator that yields an intermediate assistant message after a long gap,
    // then the success result after another long gap. Each gap is < the idle window
    // only because the timer is reset per message.
    setMockQuery(() => (async function* () {
      // advance 14 min, then emit activity (resets idle)
      jest.advanceTimersByTime(14 * 60 * 1000);
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'working' }] } };
      // advance another 14 min, then the result (idle never hit 15 min between events)
      jest.advanceTimersByTime(14 * 60 * 1000);
      yield { type: 'result', subtype: 'success', result: 'done' };
    })());

    const p = sdkQueryImpl({ prompt: 'test', model: 'sonnet' });
    await expect(p).resolves.toBe('done');
    jest.useRealTimers();
  });

  test('abort message reports idle stall, not total limit', async () => {
    // Force an abort by aborting from inside the loop before a result arrives.
    setMockQuery(({ options }) => (async function* () {
      options.abortController.abort();
      yield { type: 'assistant', message: { content: [] } };
    })());

    await expect(
      sdkQueryImpl({ prompt: 'test', model: 'haiku', label: 'idle-test' })
    ).rejects.toThrow(/idle .* with no streamed activity/);
  });
```

- [ ] **Step 2: Run the new tests, confirm they fail.**
  - Run: `npx jest lib/llm/__tests__/client-contract.test.js -t 'idle'`
  - Expected (before code change): the "abort message reports idle stall" test fails — current message is `SDK timeout after ...s (limit: ...s)`, no "idle ... with no streamed activity" substring.

- [ ] **Step 3: Repurpose `MODEL_TIMEOUTS` as the idle value** and update its doc block (client.js:24–38). Replace:

```js
/**
 * Per-model abort cap (in milliseconds).
 *
 * Standardized at 10 minutes across all models so the AbortController fires only
 * on genuinely-stuck calls. Per-call overrides have caused repeated production
 * failures (see git history: e81a63b, 2830be7, character-data-nodes.js:106).
 *
 * Steady-state response timing is captured on every call via `duration_api_ms`
 * in the llm_complete event — that's the data source for any future tightening.
 */
const MODEL_TIMEOUTS = {
  opus: 10 * 60 * 1000,
  sonnet: 10 * 60 * 1000,
  haiku: 10 * 60 * 1000
};
```

with:

```js
/**
 * Idle (stall) window in milliseconds — the maximum time we tolerate with NO
 * streamed activity from the SDK before aborting. This is NOT a total-duration
 * cap: a healthy long call (Opus thinking for 20 min while emitting deltas) never
 * trips it because the timer is re-armed on every streamed message (see resetIdle
 * below). Only genuine silence — a hung subprocess, a stuck upstream — fires it.
 *
 * Generous by design; tune only DOWN, only from data. duration_api_ms on every
 * llm_complete event is the data source.
 *
 * Kept named MODEL_TIMEOUTS and exported for backward compatibility (getModelTimeout,
 * llm/index.js re-export), but the semantics are now idle-between-events.
 */
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MODEL_TIMEOUTS = {
  opus: IDLE_TIMEOUT_MS,
  sonnet: IDLE_TIMEOUT_MS,
  haiku: IDLE_TIMEOUT_MS
};
```

- [ ] **Step 4: Replace the one-shot timeout setup** (client.js:110–118). Before:

```js
  const resolvedModel = MODEL_IDS[model] || model;
  const effectiveTimeout = timeoutMs || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
  const abortController = new AbortController();
  const startTime = Date.now();
  const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');

  // Set up timeout
  const timeoutId = setTimeout(() => {
    abortController.abort();
  }, effectiveTimeout);
```

After:

```js
  const resolvedModel = MODEL_IDS[model] || model;
  const idleTimeoutMs = timeoutMs || MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
  const abortController = new AbortController();
  const startTime = Date.now();
  const progressLabel = label || prompt.slice(0, 25).replace(/\n/g, ' ');

  // Idle (stall) timer: abort only after idleTimeoutMs of NO streamed activity.
  // resetIdle() is called once before the loop and again on EVERY message inside
  // it, so a healthy long-running call that keeps streaming never aborts — only a
  // genuinely silent/hung call does. Replaces the old total-duration cap.
  let lastActivityAt = Date.now();
  let timeoutId = null;
  const resetIdle = () => {
    lastActivityAt = Date.now();
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => abortController.abort(), idleTimeoutMs);
  };
  resetIdle();
```

- [ ] **Step 5: Reset the idle timer on every message** inside the `for await` loop. The loop head is client.js:207–209:

```js
    for await (const msg of query({ prompt, options })) {
      messageCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
```

becomes:

```js
    for await (const msg of query({ prompt, options })) {
      resetIdle();  // any message = activity → re-arm the stall timer
      messageCount++;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
```

- [ ] **Step 6: Update every `clearTimeout(timeoutId)` guard and the abort message.** `timeoutId` can be `null` only before `resetIdle()` runs (it never is, but keep `clearTimeout(null)` safe — it is a no-op in Node, so the existing `clearTimeout(timeoutId)` calls at lines 283, 356, 363, 368, 372 need no change). Update only the abort message (client.js:380–383). Before:

```js
    // Check if it was an abort/timeout
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      throw new Error(`SDK timeout after ${elapsed}s (limit: ${effectiveTimeout / 1000}s) - ${progressLabel}`);
    }
```

After:

```js
    // Check if it was an idle/stall abort. Message must still start with
    // "SDK timeout after" so isSdkTimeoutError (and thus isTransientError) keeps
    // classifying it as transient — the wording past that is diagnostic.
    if (error.name === 'AbortError' || abortController.signal.aborted) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const idleSec = ((Date.now() - lastActivityAt) / 1000).toFixed(1);
      throw new Error(
        `SDK timeout after ${elapsed}s idle ${idleSec}s with no streamed activity ` +
        `(idle limit: ${idleTimeoutMs / 1000}s) - ${progressLabel}`
      );
    }
```

- [ ] **Step 7: Run the full client test file + the retry classifier test** (the abort message change must still satisfy `isSdkTimeoutError`).
  - Run: `npx jest lib/llm/__tests__/client-contract.test.js lib/llm/__tests__/retry.test.js`
  - Expected: all green — including the existing structured-output/settingSources tests, the two new idle tests, and the retry test asserting the `SDK timeout after` shape is transient.

- [ ] **Step 8: Commit.**
  - `git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js && git commit -m "feat(llm): replace total-duration abort with resettable 15-min idle/stall timer"`

---

### Task 2.3: Stream token-level deltas — `includePartialMessages` + `llm_delta` onProgress

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\client.js` (options object 120–127; loop body, after the `resetIdle()` added in 2.2)
- Test (modify): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\__tests__\client-contract.test.js`

The `stream_event` message carries `event: BetaRawMessageStreamEvent` (confirmed sdk.d.ts:2970–2973). Phase derives from `event.type`: `message_start` → `'preparing'`; `content_block_delta` with `event.delta.type === 'thinking_delta'` → `'thinking'`; with `'text_delta'` → `'writing'`. Delta text is `event.delta.thinking` or `event.delta.text` (confirmed BetaThinkingDelta/BetaTextDelta in beta messages.d.ts).

- [ ] **Step 1: Add the failing test** — assert `includePartialMessages: true` is passed and that `stream_event` messages emit `llm_delta` with the right phase/text/ttft/tokenCount, and reset idle. Append to `client-contract.test.js`.

```js
  test('passes includePartialMessages: true to the SDK', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'haiku' });
    expect(capturedOptions.includePartialMessages).toBe(true);
  });

  test('emits llm_delta with phase=writing for a text_delta stream_event', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', event: { type: 'message_start' } },
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hello' } } },
      { type: 'result', subtype: 'success', result: 'Hello world' }
    ]));

    await sdkQueryImpl({
      prompt: 'test', model: 'sonnet',
      onProgress: (m) => { if (m.type === 'llm_delta') events.push(m); }
    });

    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe('preparing');
    expect(events[1].phase).toBe('writing');
    expect(events[1].deltaText).toBe('Hello');
    expect(events[1].tokenCount).toBeGreaterThan(0);
    expect(typeof events[1].ttftMs).toBe('number');
  });

  test('emits llm_delta with phase=thinking for a thinking_delta stream_event', async () => {
    const events = [];
    setMockQuery(() => makeAsyncIterable([
      { type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'reasoning...' } } },
      { type: 'result', subtype: 'success', result: 'done' }
    ]));

    await sdkQueryImpl({
      prompt: 'test', model: 'opus',
      onProgress: (m) => { if (m.type === 'llm_delta') events.push(m); }
    });

    expect(events).toHaveLength(1);
    expect(events[0].phase).toBe('thinking');
    expect(events[0].deltaText).toBe('reasoning...');
  });
```

- [ ] **Step 2: Run, confirm failure.**
  - Run: `npx jest lib/llm/__tests__/client-contract.test.js -t 'llm_delta'`
  - Expected: fails — no `llm_delta` events emitted yet (arrays empty), and `includePartialMessages` undefined.

- [ ] **Step 3: Add `includePartialMessages: true` to the options object** (client.js:120–127). Before:

```js
  const options = {
    model: resolvedModel,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,  // Required pair for bypassPermissions in SDK 0.2.x
    abortController
  };
```

After:

```js
  const options = {
    model: resolvedModel,
    systemPrompt,
    allowedTools,
    permissionMode: 'bypassPermissions',
    allowDangerouslySkipPermissions: true,  // Required pair for bypassPermissions in SDK 0.2.x
    abortController,
    // Stream token-level deltas so the operator sees thinking/writing live and the
    // idle timer is fed by real activity (SDK 0.2.119: SDKPartialAssistantMessage).
    includePartialMessages: true
  };
```

- [ ] **Step 4: Handle `stream_event` in the loop.** Add a delta-counter declaration just before the `for await` (it must persist across iterations). The loop currently starts (after the 2.2 edit) with `resetIdle(); messageCount++;`. Add the handler immediately after `messageCount++` and before the existing `if (onProgress) { ... }` progress block at client.js:220. Insert:

```js
      // Token-level partial streaming (includePartialMessages). Feed the idle timer
      // (resetIdle already ran above) and forward a coalesce-able llm_delta to the
      // progress channel. phase is derived from the raw stream event type.
      if (msg.type === 'stream_event' && onProgress) {
        const ev = msg.event || {};
        let phase = null;
        let deltaText = '';
        if (ev.type === 'message_start') {
          phase = 'preparing';
        } else if (ev.type === 'content_block_delta') {
          const d = ev.delta || {};
          if (d.type === 'thinking_delta') { phase = 'thinking'; deltaText = d.thinking || ''; }
          else if (d.type === 'text_delta') { phase = 'writing'; deltaText = d.text || ''; }
        }
        if (phase) {
          deltaCharCount += deltaText.length;
          if (deltaText.length > 0 && ttftMs === null) {
            ttftMs = Date.now() - startTime;
          }
          onProgress({
            type: 'llm_delta',
            phase,
            deltaText,
            // Rough char/4 token estimate — a liveness cue, not billing. The server
            // coalescer (P5) is the throttle; we emit one event per stream_event.
            tokenCount: Math.ceil(deltaCharCount / 4),
            ttftMs,
            elapsed: parseFloat(elapsed)
          });
        }
        continue;  // partials are not assistant/result messages; skip the rest of the loop body
      }
```

And declare the two accumulators just before the `for await` loop (alongside `let messageCount = 0;` at client.js:192):

```js
    let messageCount = 0;
    let deltaCharCount = 0;   // running streamed-char total for the token-count cue
    let ttftMs = null;        // time-to-first-token (first non-empty delta)
```

- [ ] **Step 5: Re-run the delta tests + the full file.**
  - Run: `npx jest lib/llm/__tests__/client-contract.test.js`
  - Expected: all green — `includePartialMessages` test passes, both `llm_delta` phase tests pass (preparing/writing and thinking), and the pre-existing success/extraction tests are unaffected (their mocks emit no `stream_event`, so the new branch is skipped).

- [ ] **Step 6: Commit.**
  - `git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js && git commit -m "feat(llm): stream partial-message deltas as llm_delta (phase/ttft/tokenCount)"`

---

### Task 2.4: Per-call cost ceiling — `MODEL_BUDGETS` + `maxBudgetUsd` + throw on `error_max_budget_usd`

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\client.js` (add `MODEL_BUDGETS` near `MODEL_TIMEOUTS`; options object; the error-result branch at 354–365; module.exports 467–475)
- Test (modify): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\__tests__\client-contract.test.js`

`maxBudgetUsd` is a confirmed SDK option (sdk.d.ts:1391); exceeding it yields a `result` message with `subtype: 'error_max_budget_usd'` (sdk.d.ts:3052). The generic error branch (client.js:354–359) catches any `subtype.includes('error')` — it would already throw, but with an opaque message. We make budget overrun an **explicit, clearly-labeled non-transient** throw so `isTransientError` (Task 2.1, which matches `error_max_budget_usd` in the error subtype/message and returns false) never retries it. **NOTE (merge M7):** Task 2.1 (runs first) already enriched this same branch with `sdkSubtype`/`sdkErrors`; this task inserts the budget case BEFORE the enriched generic branch and keeps the enrichment — the blocks below reflect that post-2.1 shape.

- [ ] **Step 1: Add the failing tests** — `maxBudgetUsd` is passed (defaulting per model), and a budget-overrun result throws a clearly-labeled error that `isTransientError` classifies false. Append to `client-contract.test.js`.

```js
  test('passes a per-model maxBudgetUsd to the SDK', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'opus' });
    expect(typeof capturedOptions.maxBudgetUsd).toBe('number');
    expect(capturedOptions.maxBudgetUsd).toBeGreaterThan(0);
  });

  test('explicit maxBudgetUsd option overrides the model default', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([{ type: 'result', subtype: 'success', result: 'ok' }]);
    });
    await sdkQueryImpl({ prompt: 'test', model: 'haiku', maxBudgetUsd: 0.42 });
    expect(capturedOptions.maxBudgetUsd).toBe(0.42);
  });

  test('error_max_budget_usd result throws a labeled, non-transient error', async () => {
    const { isTransientError } = require('../retry');
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'error_max_budget_usd', total_cost_usd: 5.01, errors: ['budget exceeded'] }
    ]));

    let thrown;
    try {
      await sdkQueryImpl({ prompt: 'test', model: 'opus', label: 'budget-test' });
    } catch (e) { thrown = e; }

    expect(thrown).toBeDefined();
    expect(thrown.message).toMatch(/budget/i);
    expect(isTransientError(thrown)).toBe(false);
  });
```

- [ ] **Step 2: Run, confirm failure.**
  - Run: `npx jest lib/llm/__tests__/client-contract.test.js -t 'budget'`
  - Expected: the `maxBudgetUsd` option tests fail (`capturedOptions.maxBudgetUsd` is `undefined`); the throw test currently throws the generic `SDK error_max_budget_usd: budget exceeded` — message matches `/budget/i` so that assertion may pass, but the option tests fail the suite.

- [ ] **Step 3: Add `MODEL_BUDGETS`** immediately after the `MODEL_TIMEOUTS` block (client.js, just after line 38). These are generous per-call ceilings — a backstop against a runaway retry/long call, not a tight cap.

```js
/**
 * Per-call spend ceiling (USD), passed to the SDK as maxBudgetUsd. A backstop so a
 * runaway call (or an auto-retried long Opus call) cannot bonfire tokens unattended.
 * Generous by design — tune only from billing data. Opus arc-analysis is the most
 * expensive call, hence the highest ceiling.
 *
 * NOTE: this is a PER-CALL ceiling, not aggregate. LangGraph's node retryPolicy
 * (Task P3.1) re-runs a failed node up to `maxAttempts` times, each a FRESH SDK call
 * with its own budget — so N retries can cost up to N× this ceiling. The TRC-2
 * de-layering (one retry layer, ≤3 attempts) keeps that bound predictable.
 */
const MODEL_BUDGETS = {
  opus: 5.0,
  sonnet: 2.0,
  haiku: 0.5
};
```

- [ ] **Step 4: Accept a `maxBudgetUsd` override param and set the option.** Add `maxBudgetUsd` to the destructured params (client.js:94–108 signature, alongside `timeoutMs`):

```js
  effort,
  timeoutMs,
  maxBudgetUsd,
  onProgress,
```

Then in the options block, after the `includePartialMessages: true` line added in 2.3, append the budget wiring (place it right after the `options` object is created, before the `settingSources` logic):

```js
  // Per-call cost ceiling. Explicit param wins; else the per-model default.
  options.maxBudgetUsd = maxBudgetUsd ?? MODEL_BUDGETS[model] ?? MODEL_BUDGETS.sonnet;
```

- [ ] **Step 5: Make budget overrun an explicit labeled throw (merges with Task 2.1's enrichment — M7).** Because P2.1 ran first, the generic error branch at client.js:354–360 is ALREADY enriched:

```js
      // Handle error results
      if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
        clearTimeout(timeoutId);
        const errorDetails = msg.errors?.join(', ') || 'Unknown error';
        const sdkErr = new Error(`SDK ${msg.subtype}: ${errorDetails}`);
        sdkErr.sdkSubtype = msg.subtype;
        sdkErr.sdkErrors = msg.errors || [];
        throw sdkErr;
      }
```

Insert an explicit budget case BEFORE it, and KEEP the enrichment on the generic fallthrough:

```js
      // Cost ceiling tripped — explicit, non-transient. isTransientError matches
      // `error_max_budget_usd` in the subtype/message and returns false; the operator
      // must decide, we never auto-retry spend.
      if (msg.type === 'result' && msg.subtype === 'error_max_budget_usd') {
        clearTimeout(timeoutId);
        const spent = typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd.toFixed(2) : '?';
        const budgetErr = new Error(
          `SDK error_max_budget_usd: per-call budget exceeded ` +
          `($${spent} spent, limit $${options.maxBudgetUsd}) - ${progressLabel}`
        );
        budgetErr.sdkSubtype = msg.subtype;
        budgetErr.sdkErrors = msg.errors || [];
        throw budgetErr;
      }

      // Handle error results (generic) — KEEP Task 2.1's enrichment so a sustained
      // upstream overload (error_during_execution / overloaded_error) stays auto-retryable.
      if (msg.type === 'result' && msg.subtype && msg.subtype.includes('error')) {
        clearTimeout(timeoutId);
        const errorDetails = msg.errors?.join(', ') || 'Unknown error';
        const sdkErr = new Error(`SDK ${msg.subtype}: ${errorDetails}`);
        sdkErr.sdkSubtype = msg.subtype;
        sdkErr.sdkErrors = msg.errors || [];
        throw sdkErr;
      }
```

- [ ] **Step 6: Export `MODEL_BUDGETS`** for downstream visibility (module.exports, client.js:467–475). Add it to the object:

```js
module.exports = {
  sdkQueryImpl,
  query,  // Export raw SDK query for subagent use
  getModelTimeout,
  isClaudeAvailable,
  isSdkTimeoutError,
  createSemaphore,
  MODEL_TIMEOUTS,
  MODEL_BUDGETS
};
```

- [ ] **Step 7: Re-run the budget tests + the whole llm suite** (ensure no regression to retry/idle/delta/extraction).
  - Run: `npx jest lib/llm/`
  - Expected: all green — budget option tests pass, the overrun-throws-non-transient test passes, and Tasks 2.1–2.3 tests remain green.

- [ ] **Step 8: Update the JSDoc param list** for the new `maxBudgetUsd` option (client.js:88 area, after the `timeoutMs` `@param`):

```js
 * @param {number} [options.timeoutMs] - Idle/stall window override in ms (defaults to per-model MODEL_TIMEOUTS)
 * @param {number} [options.maxBudgetUsd] - Per-call spend ceiling override (defaults to per-model MODEL_BUDGETS)
```

- [ ] **Step 9: Commit.**
  - `git add lib/llm/client.js lib/llm/__tests__/client-contract.test.js && git commit -m "feat(llm): add per-call maxBudgetUsd ceiling; throw labeled non-transient on error_max_budget_usd"`

---

### Task 2.5: Add `llm_delta` to the SSE/observability constants (contract surface for P5)

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\observability\constants.js` (SSE_EVENT_TYPES, lines 29–38)
- Test (create): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\observability\__tests__\constants.test.js`

Register the `llm_delta` event name in the single-source-of-truth constants so P5's progress-bridge/server/console all reference one symbol rather than a magic string. (Coalescing and SSE wiring are P5; this only locks the name.)

- [ ] **Step 1: Write the failing test.**

```js
// lib/observability/__tests__/constants.test.js
const { SSE_EVENT_TYPES } = require('../constants');

describe('SSE_EVENT_TYPES', () => {
  test('includes the streaming-delta event name (P2/P5 contract)', () => {
    expect(SSE_EVENT_TYPES.LLM_DELTA).toBe('llm_delta');
  });

  test('retains existing event names', () => {
    expect(SSE_EVENT_TYPES.LLM_START).toBe('llm_start');
    expect(SSE_EVENT_TYPES.LLM_COMPLETE).toBe('llm_complete');
    expect(SSE_EVENT_TYPES.COMPLETE).toBe('complete');
  });
});
```

- [ ] **Step 2: Run, confirm failure.**
  - Run: `npx jest lib/observability/__tests__/constants.test.js`
  - Expected: fails — `SSE_EVENT_TYPES.LLM_DELTA` is `undefined`.

- [ ] **Step 3: Add the event name** to `SSE_EVENT_TYPES` (constants.js:30–38). Before:

```js
const SSE_EVENT_TYPES = {
  CONNECTED: 'connected',      // SSE connection established
  PROGRESS: 'progress',        // Standard progress update
  LLM_START: 'llm_start',      // LLM call starting (full prompt)
  LLM_COMPLETE: 'llm_complete', // LLM call complete (full response)
  LLM_ERROR: 'llm_error',      // LLM call returned success but extraction failed (carries same diagnostics as llm_complete)
  COMPLETE: 'complete',        // Workflow complete or checkpoint reached
  ERROR: 'error'               // Error occurred
};
```

After:

```js
const SSE_EVENT_TYPES = {
  CONNECTED: 'connected',      // SSE connection established
  PROGRESS: 'progress',        // Standard progress update
  LLM_START: 'llm_start',      // LLM call starting (full prompt)
  LLM_DELTA: 'llm_delta',      // Token-level partial-message delta (phase/ttft/tokenCount); coalesced server-side (P5)
  LLM_COMPLETE: 'llm_complete', // LLM call complete (full response)
  LLM_ERROR: 'llm_error',      // LLM call returned success but extraction failed (carries same diagnostics as llm_complete)
  COMPLETE: 'complete',        // Workflow complete or checkpoint reached
  ERROR: 'error'               // Error occurred
};
```

- [ ] **Step 4: Re-run, confirm green.**
  - Run: `npx jest lib/observability/__tests__/constants.test.js`
  - Expected: both tests pass.

- [ ] **Step 5: Commit.**
  - `git add lib/observability/constants.js lib/observability/__tests__/constants.test.js && git commit -m "feat(observability): register llm_delta SSE event name (P2/P5 contract)"`

---

### Task 2.6: Full-suite regression gate for the P2 surface

**Files:**
- Test (run only): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\llm\`, `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\observability\`

No code change — a gate confirming P2 introduced no cross-module regression (the client wrapper is on the hot path of every node).

- [ ] **Step 1: Run the llm + observability suites together.**
  - Run: `npx jest lib/llm lib/observability`
  - Expected: all suites pass (retry.test.js, client-contract.test.js, structured-output-extractor.test.js, constants.test.js, plus any existing observability tests).

- [ ] **Step 2: Confirm the public contract resolves at runtime** (P1/P5 import these).
  - Run: `node -e "const llm=require('./lib/llm'); const {SSE_EVENT_TYPES}=require('./lib/observability/constants'); const {MODEL_BUDGETS}=require('./lib/llm/client'); console.log(typeof llm.isTransientError, SSE_EVENT_TYPES.LLM_DELTA, JSON.stringify(MODEL_BUDGETS))"`
  - Expected: `function llm_delta {"opus":5,"sonnet":2,"haiku":0.5}`

- [ ] **Step 3: Run the broader test suite to catch consumers of `MODEL_TIMEOUTS`/`getModelTimeout`** whose semantics shifted from total to idle (no behavioral test should depend on total-duration semantics; this confirms it).
  - Run: `npx jest --testPathPattern 'lib/(llm|observability|workflow)'`
  - Expected: green; if any workflow test asserted a total-duration timeout message string, it surfaces here and is the only place to reconcile.

- [ ] **Step 4: No commit (verification-only gate).** If Step 3 surfaces a stale total-duration assertion, fix it in the same task and commit: `git add <file> && git commit -m "test: reconcile timeout assertion with idle-stall semantics"`.

---

## Phase P3: Node retry policies + fail-loud refactor

**Goal:** Transient LLM failures auto-retry invisibly; persistent failures throw (leaving a clean pre-node checkpoint snapshot for `/resume`); no node feeds the generator empty-because-failed output; hard backstops fire where no human follows (`assembleHtml` empty-bundle guard, startup Notion-reachability probe).

**Dependencies:** Phase **P2** must land first — it creates `lib/llm/retry.js` exporting the pure `isTransientError(err)` and re-exports it from `lib/llm/index.js` (the FIXED INTERFACE CONTRACT classifier). Phase **P1** (durable `SqliteSaver` at `server.js:37` + `durability:'sync'` on every `graph.invoke`) must land first so that a node that throws leaves a *persisted* pre-node snapshot that `/resume` can re-run; without P1, a thrown node on `MemorySaver` is still recoverable only in-process. This phase consumes both but modifies neither's core files except by importing `isTransientError`. (NOTE: the interface contract said `initialInterval: 2`; this phase correctly uses `2000` — langgraph 1.0.7 measures it in milliseconds.)

---

### Task P3.1: Wire `retryPolicy` onto every LLM-calling node in `graph.js`

**Files:**
- Modify: `lib/workflow/graph.js:58` (import), `lib/workflow/graph.js:360-499` (the `addNode` calls)
- Test: `lib/workflow/__tests__/graph-retry-policy.test.js` (Create)

The LLM-calling nodes (the only ones that get a `retryPolicy`) are: `parseRawInput` (input-nodes), `analyzePhotos` + `finalizePhotoAnalyses` + `parseCharacterIds` (photo-nodes), `preprocessEvidence` (preprocess-nodes), `extractCharacterData` (character-data-nodes), `curateEvidenceBundle` + `scorePaperEvidence-driver` is inside `curateEvidenceBundle`, `analyzeArcs` + `reviseArcs` (arc-specialist), `evaluateArcs` + `evaluateOutline` + `evaluateArticle` (evaluator-nodes), `generateOutline` + `reviseOutline` + `generateContentBundle` + `reviseContentBundle` + `validateContentBundle` (ai-nodes). Pure/programmatic nodes (`initializeSession`, `tagTokenDispositions`, `validateArcs`, `surfaceContradictions`, `assembleHtml`, all `checkpoint*`, `increment*Revision`, `buildArcEvidencePackages`, `finalizeInput`, `parseCharacterIds` is LLM, `loadDirectorNotes`, `fetch*`, `preprocessPhotos`, `detectWhiteboard`) get **no** retryPolicy.

- [ ] **Step 1: Confirm the `RetryPolicy` field units before writing the value.** The FIXED INTERFACE CONTRACT wrote `initialInterval: 2`, but the installed type documents `initialInterval` in **milliseconds** (default 500). Run:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && grep -A2 "initialInterval" node_modules/@langchain/langgraph/dist/pregel/utils/index.d.ts | head -4
```
Expected output includes `Amount of time that must elapse before the first retry occurs in milliseconds.` → therefore use `initialInterval: 2000` (2 seconds) to honor the contract's intent of "2s backoff". Record this in the code comment.

- [ ] **Step 2: Write the failing test FIRST** asserting each LLM node carries a `retryPolicy` whose `retryOn` delegates to `isTransientError`, and that pure nodes do not. The builder stores node specs on `builder.nodes[name]` in langgraph 1.0.7.

Create `lib/workflow/__tests__/graph-retry-policy.test.js`:
```javascript
/**
 * P3.1 — every LLM-calling node carries retryPolicy{maxAttempts,retryOn:isTransientError};
 * pure/programmatic nodes carry none.
 */
const { createGraphBuilder } = require('../graph');
const { isTransientError } = require('../../llm/retry');

const LLM_NODES = [
  'parseRawInput', 'analyzePhotos', 'finalizePhotoAnalyses', 'parseCharacterIds',
  'preprocessEvidence', 'extractCharacterData', 'curateEvidenceBundle',
  'analyzeArcs', 'reviseArcs', 'evaluateArcs', 'evaluateOutline', 'evaluateArticle',
  'generateOutline', 'reviseOutline', 'generateContentBundle', 'reviseContentBundle',
  'validateContentBundle'
];
const PURE_NODES = [
  'initializeSession', 'tagTokenDispositions', 'validateArcs', 'surfaceContradictions',
  'assembleHtml', 'checkpointArcSelection', 'incrementArcRevision', 'buildArcEvidencePackages'
];

function specOf(builder, name) {
  // langgraph 1.0.7 StateGraph stores node specs on builder.nodes
  return builder.nodes[name];
}

describe('graph retryPolicy wiring', () => {
  const builder = createGraphBuilder();

  test.each(LLM_NODES)('%s has retryPolicy with maxAttempts 3 and transient retryOn', (name) => {
    const spec = specOf(builder, name);
    expect(spec).toBeDefined();
    expect(spec.retryPolicy).toBeDefined();
    expect(spec.retryPolicy.maxAttempts).toBe(3);
    // retryOn must be our transient classifier: a 429 retries, a 401 does not
    expect(spec.retryPolicy.retryOn({ status: 429 })).toBe(true);
    expect(spec.retryPolicy.retryOn({ status: 401 })).toBe(false);
    expect(spec.retryPolicy.retryOn).toBe(isTransientError);
  });

  test.each(PURE_NODES)('%s has no retryPolicy', (name) => {
    const spec = specOf(builder, name);
    expect(spec).toBeDefined();
    expect(spec.retryPolicy).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it and confirm the shape assumption.** The only risk is `builder.nodes[name]` (the internal field name). Run:
```bash
npx jest lib/workflow/__tests__/graph-retry-policy.test.js -t 'has retryPolicy'
```
If `spec` is `undefined` for ALL nodes, the internal accessor is wrong — fall back by reading the field name:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && node -e "const {createGraphBuilder}=require('./lib/workflow/graph'); const b=createGraphBuilder(); console.log(Object.keys(b)); console.log(JSON.stringify(Object.keys(b.nodes||b._nodes||{})).slice(0,200));"
```
Use whichever of `b.nodes` / `b._nodes` is populated, and update `specOf` accordingly. Expected (before implementation): test FAILS with `spec.retryPolicy` undefined for the LLM nodes.

- [ ] **Step 4: Implement.** Add the import and a shared `LLM_RETRY` constant at the top of `graph.js`, then add the second `addNode` argument to each LLM node.

In `lib/workflow/graph.js`, change line 58–60 from:
```javascript
const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');
```
to:
```javascript
const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');
const { isTransientError } = require('../llm/retry');

// P3.1 — Transient-only auto-retry for LLM-calling nodes.
// initialInterval is MILLISECONDS in @langchain/langgraph 1.0.7 (verified against
// node_modules/@langchain/langgraph/dist/pregel/utils/index.d.ts), so 2000 = 2s.
// retryOn is the FIXED-INTERFACE classifier: rate-limit/5xx/overloaded/timeouts retry;
// auth/permission/invalid-request/StructuredOutputExtractionError throw straight through.
const LLM_RETRY = { retryPolicy: { maxAttempts: 3, initialInterval: 2000, retryOn: isTransientError } };
```

Then add `LLM_RETRY` as the 3rd argument to each LLM `addNode`. Concretely, change these lines:

`graph.js:360`:
```javascript
  builder.addNode('parseRawInput', nodes.parseRawInput);
```
→
```javascript
  builder.addNode('parseRawInput', nodes.parseRawInput, LLM_RETRY);
```

`graph.js:397`:
```javascript
  builder.addNode('analyzePhotos', nodes.analyzePhotos);
```
→
```javascript
  builder.addNode('analyzePhotos', nodes.analyzePhotos, LLM_RETRY);
```

`graph.js:401-402`:
```javascript
  builder.addNode('parseCharacterIds', nodes.parseCharacterIds);
  builder.addNode('finalizePhotoAnalyses', nodes.finalizePhotoAnalyses);
```
→
```javascript
  builder.addNode('parseCharacterIds', nodes.parseCharacterIds, LLM_RETRY);
  builder.addNode('finalizePhotoAnalyses', nodes.finalizePhotoAnalyses, LLM_RETRY);
```

`graph.js:412`:
```javascript
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence);
```
→
```javascript
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence, LLM_RETRY);
```

`graph.js:415`:
```javascript
  builder.addNode('extractCharacterData', nodes.extractCharacterData);
```
→
```javascript
  builder.addNode('extractCharacterData', nodes.extractCharacterData, LLM_RETRY);
```

`graph.js:421`:
```javascript
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle);
```
→
```javascript
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle, LLM_RETRY);
```

`graph.js:436`:
```javascript
  builder.addNode('analyzeArcs', nodes.analyzeArcsPlayerFocusGuided);
```
→
```javascript
  builder.addNode('analyzeArcs', nodes.analyzeArcsPlayerFocusGuided, LLM_RETRY);
```

`graph.js:443`:
```javascript
  builder.addNode('evaluateArcs', nodes.evaluateArcs);
```
→
```javascript
  builder.addNode('evaluateArcs', nodes.evaluateArcs, LLM_RETRY);
```

`graph.js:452`:
```javascript
  builder.addNode('reviseArcs', nodes.reviseArcs);
```
→
```javascript
  builder.addNode('reviseArcs', nodes.reviseArcs, LLM_RETRY);
```

`graph.js:466`:
```javascript
  builder.addNode('generateOutline', nodes.generateOutline);
```
→
```javascript
  builder.addNode('generateOutline', nodes.generateOutline, LLM_RETRY);
```

`graph.js:469`:
```javascript
  builder.addNode('evaluateOutline', nodes.evaluateOutline);
```
→
```javascript
  builder.addNode('evaluateOutline', nodes.evaluateOutline, LLM_RETRY);
```

`graph.js:476`:
```javascript
  builder.addNode('reviseOutline', nodes.reviseOutline);
```
→
```javascript
  builder.addNode('reviseOutline', nodes.reviseOutline, LLM_RETRY);
```

`graph.js:482`:
```javascript
  builder.addNode('generateContentBundle', nodes.generateContentBundle);
```
→
```javascript
  builder.addNode('generateContentBundle', nodes.generateContentBundle, LLM_RETRY);
```

`graph.js:485`:
```javascript
  builder.addNode('evaluateArticle', nodes.evaluateArticle);
```
→
```javascript
  builder.addNode('evaluateArticle', nodes.evaluateArticle, LLM_RETRY);
```

`graph.js:492-493`:
```javascript
  builder.addNode('reviseContentBundle', nodes.reviseContentBundle);
  builder.addNode('validateContentBundle', nodes.validateContentBundle);
```
→
```javascript
  builder.addNode('reviseContentBundle', nodes.reviseContentBundle, LLM_RETRY);
  builder.addNode('validateContentBundle', nodes.validateContentBundle, LLM_RETRY);
```

- [ ] **Step 5: Re-run the test.**
```bash
npx jest lib/workflow/__tests__/graph-retry-policy.test.js
```
Expected: all `LLM_NODES` and `PURE_NODES` cases PASS.

- [ ] **Step 6: Guard against the whole graph compiling.** Run the existing graph build smoke to ensure no node name typo broke wiring:
```bash
npx jest __tests__/unit/workflow/ -t 'graph' 2>&1 | tail -20
```
Expected: no new failures vs baseline.

- [ ] **Step 7: Commit.**
```bash
git add lib/workflow/graph.js lib/workflow/__tests__/graph-retry-policy.test.js && git commit -m "feat(graph): add transient-only retryPolicy to every LLM-calling node (P3.1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.2: N1 — `parseRawInput` session-report parse must throw, not fall-soft to empty

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:489-500` (the session-report catch)
- Test: `lib/__tests__/parse-raw-input-failloud.test.js` (Create)

This is the highest-blast-radius silent degradation: empty `orchestratorParsed` → every token defaults buried, no shell accounts → the generator invents the investigation and amounts. The catch at 489 (inside `step2Promise`) returns the empty shape; the `Promise.allSettled` consumer at 520-522 then *also* falls soft. We remove the inner catch so the rejection propagates, AND make the `step2Result` consumer throw instead of substituting empty.

- [ ] **Step 1: Write the failing test FIRST.** `parseRawInput` with a session report present but the report-parse SDK call rejecting must REJECT (so retryPolicy + pre-node snapshot handle it), not resolve with empty orchestrator data.

Create `lib/__tests__/parse-raw-input-failloud.test.js`:
```javascript
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn(),
  isClaudeAvailable: jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { parseRawInput } = require('../workflow/nodes/input-nodes')._testing
  || require('../workflow/nodes/input-nodes');

// Minimal raw input that forces BOTH step1 (config) and step2 (session report) parses.
function makeState() {
  return {
    rawSessionInput: {
      rawInput: 'SESSION REPORT\nTeams: A, B\nScoring Timeline: ...',
      sessionReportText: 'Final Standings: Team A 100, Team B 50\nScoring Timeline: tok001 -> Team A'
    }
  };
}

describe('parseRawInput fail-loud (N1)', () => {
  test('session-report parse failure REJECTS (no empty orchestrator fallthrough)', async () => {
    const { sdkQuery } = require('../llm');
    // step1 config parse succeeds; step2 session-report parse fails.
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1
      .mockRejectedValueOnce(new Error('overloaded_error: server is overloaded'));               // step2

    const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir() } };
    await expect(parseRawInput(makeState(), cfg)).rejects.toThrow(/session report/i);
  });
});
```

- [ ] **Step 2: Run it (expect FAIL — currently resolves).**
```bash
npx jest lib/__tests__/parse-raw-input-failloud.test.js -t 'session-report parse failure'
```
Expected: FAILS — the promise resolves because the catch swallows the error and `allSettled` substitutes empty. (If `_testing.parseRawInput` is not exported, the `||` import falls back to the module-level export; confirm with the run.)

- [ ] **Step 3: Implement — remove the inner catch.** In `lib/workflow/nodes/input-nodes.js`, change lines 481-500 from:
```javascript
    try {
      return await sdk({
        prompt: sessionReportPrompt,
        systemPrompt: 'You parse game session reports with token and transaction data. Be precise with numbers and IDs.',
        model: 'sonnet', // Use sonnet for complex table parsing
        jsonSchema: SESSION_REPORT_SCHEMA,
        loadProjectSettings: false
      });
    } catch (error) {
      console.warn('[parseRawInput] Error parsing session report:', error.message);
      // Continue with empty orchestrator data - not critical
      return {
        exposedTokens: [],
        buriedTokens: [],
        shellAccounts: [],
        exposedCount: 0,
        buriedCount: 0,
        totalBuried: 0
      };
    }
  })();
```
to:
```javascript
    // N1 fail-loud: the session report is the AUTHORITATIVE token-disposition +
    // financial source. An empty fallback makes every token default to buried and
    // drops all shell accounts, so the generator fabricates the investigation and
    // amounts. Let the error propagate: graph retryPolicy retries transient SDK
    // failures, and a persistent failure throws against the clean pre-node snapshot
    // for operator-driven /resume.
    return await sdk({
      prompt: sessionReportPrompt,
      systemPrompt: 'You parse game session reports with token and transaction data. Be precise with numbers and IDs.',
      model: 'sonnet', // Use sonnet for complex table parsing
      jsonSchema: SESSION_REPORT_SCHEMA,
      loadProjectSettings: false
    });
  })();
```

- [ ] **Step 4: Implement — make the `allSettled` consumer throw instead of substituting empty.** Change lines 520-524 from:
```javascript
  const orchestratorParsed = step2Result.status === 'fulfilled'
    ? step2Result.value
    : { exposedTokens: [], buriedTokens: [], shellAccounts: [], exposedCount: 0, buriedCount: 0, totalBuried: 0 };

  console.log('[parseRawInput] Steps 1-2 complete');
```
to:
```javascript
  // N1 fail-loud: do NOT substitute empty orchestrator data — that is the silent
  // degradation that lets the generator invent the investigation. Step 2 is as
  // critical as step 1.
  let orchestratorParsed;
  if (step2Result.status === 'fulfilled') {
    orchestratorParsed = step2Result.value;
  } else {
    console.error('[parseRawInput] Error parsing session report:', step2Result.reason?.message);
    throw new Error(`Failed to parse session report: ${step2Result.reason?.message}`);
  }

  console.log('[parseRawInput] Steps 1-2 complete');
```

- [ ] **Step 5: Re-run the test (expect PASS).**
```bash
npx jest lib/__tests__/parse-raw-input-failloud.test.js
```
Expected: PASS.

- [ ] **Step 6: Re-run existing input-nodes tests for regressions.**
```bash
npx jest lib/__tests__/input-nodes-schema.test.js
```
Expected: no new failures.

- [ ] **Step 7: Commit.**
```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/parse-raw-input-failloud.test.js && git commit -m "fix(N1): parseRawInput throws on session-report parse failure (no empty fallthrough)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.3: N4 — whiteboard parse must throw, not silently drop player-focus

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:591-604` (the whiteboard catch)
- Test: `lib/__tests__/parse-raw-input-failloud.test.js` (extend)

The whiteboard feeds `playerFocus`; an empty player-focus → arcs invented with no player-conclusion grounding. Remove the catch so the failure propagates. (Note: the `whiteboardData` default object at lines 573-578 stays — it is the legitimate "no whiteboard photo provided" path; only the *parse-failed* swallow is removed.)

- [ ] **Step 1: Add the failing test** to `lib/__tests__/parse-raw-input-failloud.test.js`:
```javascript
  test('whiteboard analysis failure REJECTS (no silent empty player-focus)', async () => {
    const { sdkQuery } = require('../llm');
    sdkQuery
      .mockResolvedValueOnce({ sessionId: 'TEST', roster: ['Alex'], reportingMode: 'on-site' }) // step1 config
      .mockResolvedValueOnce({ exposedTokens: [], buriedTokens: [], shellAccounts: [],          // step2 report
        exposedCount: 0, buriedCount: 0, totalBuried: 0 })
      .mockRejectedValueOnce(new Error('api_error: internal'));                                  // step4 whiteboard

    const state = makeState();
    state.rawSessionInput.whiteboardPhotoPath = '/tmp/whiteboard.jpg';
    const cfg = { configurable: { sdkClient: sdkQuery, dataDir: require('os').tmpdir() } };
    await expect(parseRawInput(state, cfg)).rejects.toThrow(/whiteboard/i);
  });
```

- [ ] **Step 2: Run it (expect FAIL).**
```bash
npx jest lib/__tests__/parse-raw-input-failloud.test.js -t 'whiteboard analysis failure'
```
Expected: FAILS — the catch swallows and the node resolves.

- [ ] **Step 3: Implement.** In `lib/workflow/nodes/input-nodes.js`, change lines 591-604 from:
```javascript
    try {
      whiteboardData = await sdk({
        prompt: whiteboardUserPrompt,
        systemPrompt: whiteboardSystemPrompt,
        model: 'sonnet', // Use sonnet for complex image analysis
        jsonSchema: WHITEBOARD_SCHEMA,
        allowedTools: ['Read'], // Required for image viewing
        loadProjectSettings: false
      });
    } catch (error) {
      console.warn('[parseRawInput] Error analyzing whiteboard:', error.message);
      // Continue without whiteboard data - not critical but reduces quality
    }
  }
```
to:
```javascript
    // N4 fail-loud: the whiteboard drives playerFocus (Layer 3), which grounds arc
    // analysis in the players' own conclusions. A swallowed failure leaves an empty
    // player-focus and the arcs get invented. Let it propagate (retryPolicy + snapshot).
    whiteboardData = await sdk({
      prompt: whiteboardUserPrompt,
      systemPrompt: whiteboardSystemPrompt,
      model: 'sonnet', // Use sonnet for complex image analysis
      jsonSchema: WHITEBOARD_SCHEMA,
      allowedTools: ['Read'], // Required for image viewing
      loadProjectSettings: false
    });
  }
```
Note: the thrown SDK error message will not literally contain "whiteboard"; wrap so the operator sees the phase. Add immediately above the `if (rawInput.whiteboardPhotoPath)` block is unnecessary — instead wrap the call. Replace the body just written with this wrapped form so the test's `/whiteboard/i` matches:
```javascript
    try {
      whiteboardData = await sdk({
        prompt: whiteboardUserPrompt,
        systemPrompt: whiteboardSystemPrompt,
        model: 'sonnet',
        jsonSchema: WHITEBOARD_SCHEMA,
        allowedTools: ['Read'],
        loadProjectSettings: false
      });
    } catch (error) {
      // N4 fail-loud: re-throw with phase context; do NOT continue with empty player-focus.
      console.error('[parseRawInput] Error analyzing whiteboard:', error.message);
      throw new Error(`Failed to analyze whiteboard: ${error.message}`);
    }
  }
```

- [ ] **Step 4: Re-run (expect PASS).**
```bash
npx jest lib/__tests__/parse-raw-input-failloud.test.js
```
Expected: both N1 and N4 cases PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/workflow/nodes/input-nodes.js lib/__tests__/parse-raw-input-failloud.test.js && git commit -m "fix(N4): parseRawInput re-throws on whiteboard analysis failure

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.4: N3 — `curateEvidenceBundle` throws on empty preprocessed evidence instead of returning a success bundle

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:330-354` (the empty-bundle-as-success path)
- Test: `__tests__/unit/workflow/ai-nodes-failloud.test.js` (Create)

`preprocessedEvidence` empty means an upstream failure (fetch/preprocess). Returning a fully-formed empty three-layer bundle with `curatorNotes:'No evidence to curate'` masks that and lets the article be authored with zero grounding. Throw instead.

- [ ] **Step 1: Write the failing test FIRST.**

Create `__tests__/unit/workflow/ai-nodes-failloud.test.js`:
```javascript
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { curateEvidenceBundle } = require('../../../lib/workflow/nodes/ai-nodes');

describe('curateEvidenceBundle fail-loud (N3)', () => {
  test('throws when preprocessedEvidence is empty (upstream failure masked otherwise)', async () => {
    const state = {
      evidenceBundle: null,
      preprocessedEvidence: { items: [], playerFocus: {} },
      playerFocus: {},
      sessionId: 'TEST'
    };
    await expect(curateEvidenceBundle(state, { configurable: {} }))
      .rejects.toThrow(/no preprocessed evidence|empty/i);
  });

  test('still skips cleanly when evidenceBundle already exists (resume)', async () => {
    const state = { evidenceBundle: { exposed: {} } };
    const result = await curateEvidenceBundle(state, { configurable: {} });
    expect(result.currentPhase).toBeDefined();
  });
});
```

- [ ] **Step 2: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/ai-nodes-failloud.test.js -t 'throws when preprocessedEvidence is empty'
```
Expected: FAILS — currently resolves with an empty bundle.

- [ ] **Step 3: Implement.** In `lib/workflow/nodes/ai-nodes.js`, change lines 330-354 from:
```javascript
  // If no preprocessed items, create empty evidence bundle
  if (!preprocessed.items || preprocessed.items.length === 0) {
    console.log('[curateEvidenceBundle] No preprocessed evidence - creating empty bundle');
    const emptyBundle = {
      exposed: { tokens: [], paperEvidence: [] },
      buried: { transactions: [], relationships: [] },
      context: {
        timeline: {},
        playerFocus: state.playerFocus || {},
        sessionMetadata: { sessionId: state.sessionId }
      },
      curatorNotes: {
        layerRationale: 'No evidence to curate',
        characterCoverage: {}
      }
    };

    return {
      evidenceBundle: emptyBundle,
      memoryTokens: null,          // Prune: data now in evidenceBundle.exposed.tokens
      paperEvidence: null,          // Prune: data now in evidenceBundle.exposed.paperEvidence
      preprocessedEvidence: null,   // Prune: consumed to build evidenceBundle
      currentPhase: PHASES.CURATE_EVIDENCE
    };
  }
```
to:
```javascript
  // N3 fail-loud: empty preprocessed evidence means an upstream fetch/preprocess
  // failure, NOT a legitimate empty session. Returning a polished empty three-layer
  // bundle masks the hole and the generator authors an article with zero grounding.
  // Throw so retryPolicy/operator recovery handles it against the pre-node snapshot.
  if (!preprocessed.items || preprocessed.items.length === 0) {
    throw new Error(
      '[curateEvidenceBundle] No preprocessed evidence to curate — upstream ' +
      'fetch/preprocess produced zero items. Refusing to emit an empty bundle.'
    );
  }
```

- [ ] **Step 4: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/ai-nodes-failloud.test.js
```
Expected: both cases PASS.

- [ ] **Step 5: Regression-check the existing ai-nodes suite** (the old empty-bundle behavior may be asserted somewhere):
```bash
npx jest __tests__/unit/workflow/ai-nodes.test.js 2>&1 | tail -25
```
If a test asserts the old empty-bundle success, update it to `expect(...).rejects.toThrow()` (it was codifying the bug). Note any such file in the commit message.

- [ ] **Step 6: Commit.**
```bash
git add lib/workflow/nodes/ai-nodes.js __tests__/unit/workflow/ai-nodes-failloud.test.js && git commit -m "fix(N3): curateEvidenceBundle throws on empty preprocessedEvidence (no masked-upstream success)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.5: N5 — paper-evidence scoring batch failure must throw, not mark the whole batch `scoringError`

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:227-241` (the batch catch in `scorePaperEvidence`)
- Test: `__tests__/unit/workflow/ai-nodes-failloud.test.js` (extend)

When a batch fails, marking every item `include:false, excludeReason:'scoringError'` silently drops real exposed evidence and presents it at the rescue checkpoint as "low relevance" — indistinguishable from a genuine judgment. Remove BOTH the in-node timeout-retry (lines 214-225) AND the terminal swallow (227-241): per the single-retry-layer decision (TRC-2), `curateEvidenceBundle`'s graph `retryPolicy` is the SOLE retrier, so a transient batch failure throws and re-runs the node against the pre-node snapshot (no in-node × graph attempt multiplication).

- [ ] **Step 1: Add the failing test.** `scorePaperEvidence` is not exported; drive it through `curateEvidenceBundle` with one paper item and an SDK that rejects every attempt. Append to `__tests__/unit/workflow/ai-nodes-failloud.test.js`:
```javascript
  test('curateEvidenceBundle throws when a paper-scoring batch fails persistently', async () => {
    const mockSdk = jest.fn().mockRejectedValue(new Error('api_error: internal'));
    const state = {
      evidenceBundle: null,
      preprocessedEvidence: {
        items: [
          { id: 'p1', sourceType: 'paper-evidence', name: 'Letter', disposition: 'exposed',
            summary: 'A letter', fullContent: 'Dear X...' }
        ],
        playerFocus: {}
      },
      playerFocus: {},
      sessionConfig: { roster: ['Alex'] },
      canonicalCharacters: {},
      sessionId: 'TEST'
    };
    await expect(curateEvidenceBundle(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/api_error|scoring/i);
  });
```

- [ ] **Step 2: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/ai-nodes-failloud.test.js -t 'paper-scoring batch fails persistently'
```
Expected: FAILS — `curateEvidenceBundle` resolves because the batch is swallowed into `scoringError` placeholders.

- [ ] **Step 3: Implement.** In `lib/workflow/nodes/ai-nodes.js`, change lines 214-241 from:
```javascript
    try {
      let response;
      try {
        response = await attemptBatch();
      } catch (firstErr) {
        if (isSdkTimeoutError(firstErr)) {
          console.warn(`[scorePaperEvidence] Batch ${batchIdx + 1} timed out, retrying once`);
          response = await attemptBatch();
        } else {
          throw firstErr;
        }
      }
      return response.items || [];
    } catch (error) {
      console.error(`[scorePaperEvidence] Batch ${batchIdx + 1} failed: ${error.message}`);
      // Return items as excluded on error (recoverable at checkpoint)
      return batch.map(p => ({
        id: p.id,
        // Fallback chain for name to prevent undefined
        name: p.name || p.rawData?.name || p.id || 'Unknown Item',
        score: 0,
        include: false,
        criteriaMatched: [],
        excludeReason: 'scoringError',
        excludeNote: `Scoring failed: ${error.message}`,
        rescuable: true
      }));
    }
  });
```
to:
```javascript
    // N5 fail-loud + SINGLE retry layer (TRC-2): do NOT swallow a persistent batch
    // failure into scoringError placeholders (that silently drops real exposed
    // evidence and disguises it as "low relevance" at the rescue checkpoint), and do
    // NOT retry in-node — curateEvidenceBundle's graph retryPolicy is the SOLE
    // retrier, so a transient batch failure throws and re-runs the node against the
    // pre-node snapshot (avoids the in-node × graph attempt multiplication). One
    // attempt; on failure it propagates out of the Promise.all and the node throws.
    const response = await attemptBatch();
    return response.items || [];
  });
```
  (This removes `ai-nodes.js`'s only remaining `isSdkTimeoutError` call — grep confirms just the import at line 27 and this usage. Also delete the `const { isSdkTimeoutError } = require('../../llm');` import at ai-nodes.js:27, or an unused-var check will flag it.)

- [ ] **Step 4: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/ai-nodes-failloud.test.js
```
Expected: all three cases PASS.

- [ ] **Step 5: Regression-check.**
```bash
npx jest __tests__/unit/workflow/ai-nodes.test.js 2>&1 | tail -20
```
If a test asserts `scoringError` for a failed batch, retarget it to `rejects.toThrow`. Note in commit.

- [ ] **Step 6: Commit.**
```bash
git add lib/workflow/nodes/ai-nodes.js __tests__/unit/workflow/ai-nodes-failloud.test.js && git commit -m "fix(N5): scorePaperEvidence re-throws on persistent batch failure (no scoringError masking)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.6: N2 — `analyzePhotos` node throws on total failure; per-photo degradation stays as a surfaced warning

**Files:**
- Modify: `lib/workflow/nodes/photo-nodes.js:480-493` (node-level catch — REMOVE/THROW)
- Keep (document only): `lib/workflow/nodes/photo-nodes.js:262-265` (`analyzeSinglePhoto` per-photo placeholder — KEEP, it is cosmetic per-item degradation)
- Test: `__tests__/unit/workflow/photo-nodes-failloud.test.js` (Create)

The KEEP/REMOVE split: `analyzeSinglePhoto` (262) degrading ONE photo to a placeholder among N is genuine cosmetic degradation — keep it, but it is already surfaced via `_error` and `stats.failedPhotos` (not silent). The node-level catch (480) currently returns an EMPTY photo-analysis result with `currentPhase: PHASES.ERROR`; that empty payload still flows onward (the stale `ERROR` phase does not stop the sequential edges). Replace it with a throw.

- [ ] **Step 1: Write the failing test FIRST.**

Create `__tests__/unit/workflow/photo-nodes-failloud.test.js`:
```javascript
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const photoNodes = require('../../../lib/workflow/nodes/photo-nodes');
const analyzePhotos = photoNodes.analyzePhotos;

describe('analyzePhotos fail-loud (N2)', () => {
  test('throws when the whole analysis batch fails (no empty-result fallthrough)', async () => {
    // sdk that throws synchronously in the promise → Promise.all rejects
    const mockSdk = jest.fn().mockRejectedValue(new Error('Please run /login'));
    const state = {
      photoAnalyses: null,
      sessionPhotos: ['/tmp/a.jpg', '/tmp/b.jpg'],
      sessionId: 'TEST',
      playerFocus: {},
      sessionConfig: { roster: [] }
    };
    await expect(analyzePhotos(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/photo analysis|login/i);
  });

  test('skips cleanly when no photos (legitimate empty)', async () => {
    const state = { photoAnalyses: null, sessionPhotos: [], sessionId: 'TEST' };
    const result = await analyzePhotos(state, { configurable: {} });
    expect(result.photoAnalyses).toBeDefined();
  });
});
```
Note: `analyzeSinglePhoto`'s own catch turns a per-photo SDK error into a placeholder, so `Promise.all` would NOT reject from a single failure. To make a *total* failure throw, the node must detect "every photo failed" after the gather. Implement that in Step 3 (the throw fires when `analyzedPhotos === 0 && totalPhotos > 0`).

- [ ] **Step 2: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/photo-nodes-failloud.test.js -t 'throws when the whole analysis batch fails'
```
Expected: FAILS — node currently resolves (either via per-photo placeholders or via the 480 catch returning empty).

- [ ] **Step 3: Implement.** Two edits.

(a) Replace the node-level catch at `photo-nodes.js:480-493`:
```javascript
  } catch (error) {
    console.error('[analyzePhotos] Error:', error.message);

    return {
      photoAnalyses: createEmptyPhotoAnalysisResult(state.sessionId),
      errors: [{
        phase: PHASES.ANALYZE_PHOTOS,
        type: 'photo-analysis-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}
```
→
```javascript
  } catch (error) {
    // N2 fail-loud: a batch-wide failure must not return an empty photoAnalyses that
    // flows onward and yields mis-attributed captions. Throw so retryPolicy + the
    // pre-node snapshot handle it (covers a hard reject like an auth error).
    console.error('[analyzePhotos] Error:', error.message);
    throw new Error(`Photo analysis failed: ${error.message}`);
  }
}
```

(b) Add a total-failure guard right after the `photoAnalyses` object is built (insert after `photo-nodes.js:471`, before the success `console.log` at 473):
```javascript
    // N2 fail-loud: per-photo placeholders (analyzeSinglePhoto) are acceptable
    // cosmetic degradation AS LONG AS some photos succeeded. If EVERY photo failed,
    // that is an outage (e.g. auth error applied uniformly), not "no faces detected".
    if (photos.length > 0 && photoAnalyses.stats.analyzedPhotos === 0) {
      const firstErr = analyses.find(a => a._error)?._error || 'unknown error';
      throw new Error(
        `Photo analysis failed: all ${photos.length} photos errored (e.g. "${firstErr}").`
      );
    }
```

- [ ] **Step 4: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/photo-nodes-failloud.test.js
```
Expected: both cases PASS.

- [ ] **Step 5: Regression-check the photo-nodes suite.**
```bash
npx jest __tests__/unit/workflow/photo-nodes.test.js 2>&1 | tail -20
```
Expected: no new failures. If a test asserted `currentPhase: PHASES.ERROR` from a total-failure path, retarget to `rejects.toThrow`.

- [ ] **Step 6: Commit.**
```bash
git add lib/workflow/nodes/photo-nodes.js __tests__/unit/workflow/photo-nodes-failloud.test.js && git commit -m "fix(N2): analyzePhotos throws on total failure; per-photo degradation kept as surfaced warning

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.7: parseCharacterIds & finalizePhotoAnalyses — throw on total failure; keep per-photo enrich fallback

**Files:**
- Modify: `lib/workflow/nodes/photo-nodes.js:694-708` (`parseCharacterIds` catch — REMOVE/THROW)
- Keep (document only): `lib/workflow/nodes/photo-nodes.js:893-912` (`finalizePhotoAnalyses` per-photo enrich fallback — KEEP, cosmetic, already surfaced via `_enrichmentError`)
- Test: `__tests__/unit/workflow/photo-nodes-failloud.test.js` (extend)

`parseCharacterIds` returning `{}` on a parse failure empties the character-ID mapping that the director just approved at the `character-ids` checkpoint — silent degradation. Throw. The `finalizePhotoAnalyses` per-photo enrich catch (893) is a legitimate fallback to non-enriched content for one photo and stamps `_enrichmentError` — keep, surfaced.

- [ ] **Step 1: Add the failing test** to `__tests__/unit/workflow/photo-nodes-failloud.test.js`:
```javascript
describe('parseCharacterIds fail-loud', () => {
  const parseCharacterIds = photoNodes.parseCharacterIds;
  test('throws when ID parsing fails (no empty mapping fallthrough)', async () => {
    const mockSdk = jest.fn().mockRejectedValue(new Error('overloaded_error'));
    const state = {
      characterIdMappings: null,
      _characterIdsParsed: false,
      characterIdInput: { 'a.jpg': { characterName: 'Alex' } },
      photoAnalyses: { analyses: [{ filename: 'a.jpg' }] },
      sessionId: 'TEST'
    };
    await expect(parseCharacterIds(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/character id|overloaded/i);
  });
});
```
Confirm the node's resume-skip / input field names by reading the function head:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && sed -n '600,660p' lib/workflow/nodes/photo-nodes.js
```
Adjust `characterIdInput` / skip-guard fields in the test state to match what `parseCharacterIds` actually reads so it reaches the SDK call (not an early skip-return).

- [ ] **Step 2: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/photo-nodes-failloud.test.js -t 'throws when ID parsing fails'
```
Expected: FAILS — resolves with `characterIdMappings: {}`.

- [ ] **Step 3: Implement.** Change `photo-nodes.js:694-708` from:
```javascript
  } catch (parseError) {
    console.error('[parseCharacterIds] Error parsing character IDs:', parseError.message);

    // Return empty mappings on error, allow workflow to continue
    return {
      characterIdMappings: {},
      errors: [{
        type: 'CHARACTER_ID_PARSE_ERROR',
        message: `Failed to parse character IDs: ${parseError.message}`,
        phase: PHASES.PARSE_CHARACTER_IDS,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.PARSE_CHARACTER_IDS
    };
  }
}
```
to:
```javascript
  } catch (parseError) {
    // Fail-loud: empty character-ID mappings discard the director's just-approved
    // character-ids selection and yield mis-identified photos. Throw so retryPolicy +
    // the pre-node snapshot handle it.
    console.error('[parseCharacterIds] Error parsing character IDs:', parseError.message);
    throw new Error(`Failed to parse character IDs: ${parseError.message}`);
  }
}
```

- [ ] **Step 4: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/photo-nodes-failloud.test.js
```
Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add lib/workflow/nodes/photo-nodes.js __tests__/unit/workflow/photo-nodes-failloud.test.js && git commit -m "fix: parseCharacterIds throws on parse failure (keep per-photo enrich fallback)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.8: N6 — `extractCharacterData` throws on failure (no `source:'error'` empty)

**Files:**
- Modify: `lib/workflow/nodes/character-data-nodes.js:125-131` (the catch)
- Modify: `lib/__tests__/character-data-extraction.test.js:45-56` (retarget the "returns empty on error" test that codifies the bug)
- Test: same file

The empty `{characters:{}}` makes the "don't infer group composition" guard go empty → wrong affiliations. The legitimate `source:'empty'` (no evidence) path at the top of the node stays; only the *catch* is removed.

- [ ] **Step 1: Retarget the existing bug-codifying test FIRST.** In `lib/__tests__/character-data-extraction.test.js`, change lines 45-56 from:
```javascript
  test('returns empty on error (non-fatal)', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('timeout'));
    const state = {
      characterData: null,
      paperEvidence: [{ name: 'Test', description: 'test content here for length requirement', owners: [] }],
      memoryTokens: [],
      sessionConfig: { roster: ['Test'] }
    };
    const result = await extractCharacterData(state, { configurable: { sdkClient: mockSdk } });
    expect(result.characterData.source).toBe('error');
    expect(result.characterData.characters).toEqual({});
  });
```
to:
```javascript
  test('throws on extraction error (fail-loud — empty character data drifts affiliations)', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('overloaded_error'));
    const state = {
      characterData: null,
      paperEvidence: [{ name: 'Test', description: 'test content here for length requirement', owners: [] }],
      memoryTokens: [],
      sessionConfig: { roster: ['Test'] }
    };
    await expect(extractCharacterData(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/character data|overloaded/i);
  });
```

- [ ] **Step 2: Run (expect FAIL).**
```bash
npx jest lib/__tests__/character-data-extraction.test.js -t 'throws on extraction error'
```
Expected: FAILS — the node resolves with `source:'error'`.

- [ ] **Step 3: Implement.** Change `character-data-nodes.js:125-131` from:
```javascript
  } catch (error) {
    console.error('[extractCharacterData] Error:', error.message);
    // Non-fatal — pipeline can proceed without character data
    return {
      characterData: { characters: {}, source: 'error', error: error.message }
    };
  }
}
```
to:
```javascript
  } catch (error) {
    // N6 fail-loud: empty character data silences the "don't infer group composition"
    // guard, drifting affiliations. Throw so retryPolicy + the pre-node snapshot handle it.
    console.error('[extractCharacterData] Error:', error.message);
    throw new Error(`Failed to extract character data: ${error.message}`);
  }
}
```

- [ ] **Step 4: Re-run the whole file (expect PASS, incl. the unchanged extract/skip/empty cases).**
```bash
npx jest lib/__tests__/character-data-extraction.test.js
```
Expected: all 4 cases PASS (the `source:'empty'` no-evidence path is untouched).

- [ ] **Step 5: Commit.**
```bash
git add lib/workflow/nodes/character-data-nodes.js lib/__tests__/character-data-extraction.test.js && git commit -m "fix(N6): extractCharacterData throws on failure (retarget bug-codifying test)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.9: N7 — `analyzeArcsPlayerFocusGuided` throws instead of returning `[]` arcs

**Files:**
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:863-885` (the catch)
- Test: `__tests__/unit/workflow/arc-specialist-nodes-failloud.test.js` (Create)

Returning `[]` arcs + `ARC_SYNTHESIS` makes an outage indistinguishable from "genuinely no arcs" at the empty arc-selection screen, and force-forward can carry `[]` into the article. Throw. **Also remove the in-node `MAX_GENERATION_ATTEMPTS` retry loop (772-804)** so the node's graph `retryPolicy` is the sole retrier (TRC-2 de-layering — the in-node loop × retryPolicy previously stacked to 3×3 = 9 Opus attempts, each a fresh per-call budget).

- [ ] **Step 1: Confirm the exported node name + how `sdk` is obtained.** Run:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && grep -n "analyzeArcsPlayerFocusGuided\|getSdkClient\|module.exports" lib/workflow/nodes/arc-specialist-nodes.js | head -20
```
Use the exported name (`analyzeArcsPlayerFocusGuided`) and note whether it pulls `sdk` via `getSdkClient(config, ...)` so the mock injects through `config.configurable.sdkClient`.

- [ ] **Step 2: Write the failing test FIRST.**

Create `__tests__/unit/workflow/arc-specialist-nodes-failloud.test.js`:
```javascript
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const arcNodes = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const analyzeArcs = arcNodes.analyzeArcsPlayerFocusGuided;

describe('analyzeArcs fail-loud (N7)', () => {
  test('throws on SDK failure instead of returning [] arcs', async () => {
    const mockSdk = jest.fn().mockRejectedValue(new Error('overloaded_error'));
    const state = {
      narrativeArcs: null,
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] }, context: {} },
      playerFocus: { accusation: { accused: ['Alex'] } },
      sessionConfig: { roster: ['Alex'] },
      canonicalCharacters: {},
      sessionId: 'TEST'
    };
    await expect(analyzeArcs(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/arc|overloaded/i);
  });
});
```
If the node early-returns when `narrativeArcs` already exists or requires more state to reach the SDK call, read the function head and populate the minimum state so the mock SDK is actually invoked:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && sed -n '700,780p' lib/workflow/nodes/arc-specialist-nodes.js
```

- [ ] **Step 3: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/arc-specialist-nodes-failloud.test.js
```
Expected: FAILS — resolves with `narrativeArcs: []`.

- [ ] **Step 4: Implement (two edits in `analyzeArcsPlayerFocusGuided`).**

  **(a) De-layer: remove the in-node `MAX_GENERATION_ATTEMPTS` retry loop (TRC-2).** Replace `arc-specialist-nodes.js:772-804`:
  ```javascript
  // BEFORE (arc-specialist-nodes.js:772-804):
    const MAX_GENERATION_ATTEMPTS = 3;
    let coreResult = null;
    let retryCount = 0;
    let call1Duration = '0';

    for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
      try {
        const call1Start = Date.now();
        coreResult = await generateCoreArcs(state, config);
        call1Duration = ((Date.now() - call1Start) / 1000).toFixed(1);

        // Validate we got arcs
        if (!coreResult || !coreResult.narrativeArcs || coreResult.narrativeArcs.length === 0) {
          throw new Error('Call 1 returned no arcs');
        }

        console.log(`[analyzeArcsPlayerFocusGuided] Call 1 complete: ${coreResult.narrativeArcs.length} arcs in ${call1Duration}s${retryCount > 0 ? ` (after ${retryCount} retries)` : ''}`);
        break; // Success — exit retry loop

      } catch (attemptError) {
        const isTimeout = isSdkTimeoutError(attemptError);
        if (!isTimeout || attempt === MAX_GENERATION_ATTEMPTS) {
          throw attemptError;
        }
        retryCount++;
        console.warn(`[analyzeArcsPlayerFocusGuided] Call 1 timeout on attempt ${attempt}/${MAX_GENERATION_ATTEMPTS}: ${attemptError.message}`);
        console.log(`[analyzeArcsPlayerFocusGuided] Retrying (attempt ${attempt + 1}/${MAX_GENERATION_ATTEMPTS})...`);
      }
    }
  // AFTER — single attempt; a transient failure throws and the node's graph
  // retryPolicy re-runs the whole node against the pre-node snapshot (no 3×3 = 9
  // attempt multiplication):
    const call1Start = Date.now();
    const coreResult = await generateCoreArcs(state, config);
    const call1Duration = ((Date.now() - call1Start) / 1000).toFixed(1);
    if (!coreResult || !coreResult.narrativeArcs || coreResult.narrativeArcs.length === 0) {
      throw new Error('Call 1 returned no arcs');
    }
    console.log(`[analyzeArcsPlayerFocusGuided] Call 1 complete: ${coreResult.narrativeArcs.length} arcs in ${call1Duration}s`);
  ```
  Then fix the now-undefined `retryCount` in the success return's `_arcAnalysisCache.timing` (~arc-specialist-nodes.js:857): change `retries: retryCount` → `retries: 0`.

  **(b) Fail-loud: throw from the catch.** (Line numbers below shift up after edit (a) — anchor on the `} catch (error) {` block that builds `narrativeArcs: []`.) Change `arc-specialist-nodes.js:863-885` from:
```javascript
  } catch (error) {
    const isTimeout = isSdkTimeoutError(error);
    console.error(`[analyzeArcsPlayerFocusGuided] ${isTimeout ? 'Timeout' : 'Error'}:`, error.message);

    return {
      narrativeArcs: [],
      _arcAnalysisCache: {
        synthesizedAt: new Date().toISOString(),
        _error: error.message,
        _generationTimedOut: isTimeout,
        architecture: 'split-call'
      },
      errors: [{
        phase: PHASES.ARC_SYNTHESIS,
        type: isTimeout ? 'split-call-timeout' : 'split-call-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      // Use ARC_SYNTHESIS (not ERROR) — let routing handle the 0-arc case
      // ERROR phase would bypass validateArcs entirely but then there's no route to checkpoint
      currentPhase: PHASES.ARC_SYNTHESIS
    };
  }
}
```
to:
```javascript
  } catch (error) {
    // N7 fail-loud: returning [] arcs makes an outage indistinguishable from
    // "genuinely no arcs" at the selection screen, and force-forward can carry [] into
    // the article. Throw so retryPolicy retries transient failures and a persistent
    // one surfaces against the clean pre-node snapshot for operator /resume.
    const isTimeout = isSdkTimeoutError(error);
    console.error(`[analyzeArcsPlayerFocusGuided] ${isTimeout ? 'Timeout' : 'Error'}:`, error.message);
    throw new Error(`Arc analysis failed${isTimeout ? ' (timeout)' : ''}: ${error.message}`);
  }
}
```

- [ ] **Step 5: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/arc-specialist-nodes-failloud.test.js
```
Expected: PASS.

- [ ] **Step 6: Regression-check arc suites** (the timeout test may assert the old `[]` return):
```bash
npx jest __tests__/unit/workflow/arc-specialist-nodes.test.js lib/__tests__/revise-arcs-timeout.test.js 2>&1 | tail -25
```
If `revise-arcs-timeout.test.js` asserted `narrativeArcs: []` on analyze timeout, retarget to `rejects.toThrow`; note in commit. (`reviseArcs` is a separate node — leave its own behavior untouched unless its test also covered `analyzeArcs`.)

- [ ] **Step 7: Commit.**
```bash
git add lib/workflow/nodes/arc-specialist-nodes.js __tests__/unit/workflow/arc-specialist-nodes-failloud.test.js && git commit -m "fix(N7): analyzeArcs throws on SDK failure (no [] arcs masking an outage)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.10: N8 — `assembleHtml` non-empty/valid backstop (the last guard where no human follows)

**Files:**
- Modify: `lib/workflow/nodes/template-nodes.js:112-133` (add guard at the top of `assembleHtml`)
- Test: `__tests__/unit/workflow/assemble-html-backstop.test.js` (Create)

`assembleHtml` is the final node after the human `article` approval — no operator follows it, so it is the hard backstop. It currently assembles + writes + returns `COMPLETE` regardless of bundle thinness, publishing a hollow article to `outputs/`. Add a guard that throws on an empty/structurally-invalid `contentBundle` *before* any file write.

- [ ] **Step 1: Write the failing test FIRST.**

Create `__tests__/unit/workflow/assemble-html-backstop.test.js`:
```javascript
jest.mock('../../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const templateNodes = require('../../../lib/workflow/nodes/template-nodes');
const assembleHtml = templateNodes.assembleHtml;
const { createMockTemplateAssembler } = templateNodes;

function cfg() {
  return { configurable: {
    templateAssembler: createMockTemplateAssembler({ html: '<html>ok</html>' }),
    baseDir: require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'aln-')),
    theme: 'journalist'
  } };
}

describe('assembleHtml backstop (N8)', () => {
  test('throws on null contentBundle (never publishes a hollow report)', async () => {
    await expect(assembleHtml({ contentBundle: null, sessionId: 'TEST' }, cfg()))
      .rejects.toThrow(/empty|invalid|content bundle/i);
  });

  test('throws on contentBundle with no sections/blocks', async () => {
    await expect(assembleHtml({ contentBundle: { sections: [] }, sessionId: 'TEST' }, cfg()))
      .rejects.toThrow(/empty|invalid|content bundle/i);
  });

  test('assembles a populated bundle', async () => {
    const bundle = { sections: [{ heading: 'Lede', contentBlocks: [{ type: 'paragraph', text: 'X' }] }] };
    const result = await assembleHtml({ contentBundle: bundle, sessionId: 'TEST' }, cfg());
    expect(result.currentPhase).toBeDefined();
    expect(result.assembledHtml).toContain('ok');
  });
});
```

- [ ] **Step 2: Confirm the real `contentBundle` shape so the guard checks the right field.** Read the schema (the guard must match the actual required structure, not a guess):
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && node -e "const s=require('./lib/schemas/content-bundle.schema.json'); console.log('required:', s.required); console.log('section path keys:', Object.keys(s.properties||{}));"
```
Use the reported top-level required field that holds the article body (e.g. `sections`) and its per-section content-block array name to write the emptiness check. Update the test's populated-bundle fixture in Step 1 if the field names differ.

- [ ] **Step 3: Run (expect FAIL).**
```bash
npx jest __tests__/unit/workflow/assemble-html-backstop.test.js
```
Expected: the two throw-cases FAIL (node proceeds to assemble/write).

- [ ] **Step 4: Implement.** In `lib/workflow/nodes/template-nodes.js`, insert at the very top of `assembleHtml` (right after line 112's signature, before line 113):
```javascript
async function assembleHtml(state, config) {
  // N8 backstop — this is the FINAL node after the human article approval; no operator
  // follows it. Refuse to publish a hollow/fabricated report to outputs/. Validate the
  // bundle is structurally non-empty BEFORE any file write.
  const bundle = state.contentBundle;
  const sections = bundle && Array.isArray(bundle.sections) ? bundle.sections : null;
  const hasContent = sections && sections.length > 0 &&
    sections.some(s => Array.isArray(s.contentBlocks) && s.contentBlocks.length > 0);
  if (!hasContent) {
    throw new Error(
      '[assembleHtml] Refusing to publish: contentBundle is empty or has no content ' +
      'blocks. This backstop prevents a hollow report from reaching outputs/.'
    );
  }

  const theme = state.theme || config?.configurable?.theme || 'journalist';
```
and DELETE the now-duplicated original line 113:
```javascript
  const theme = state.theme || config?.configurable?.theme || 'journalist';
```
(Confirm the section/contentBlocks field names against Step 2's schema output; if the schema names them differently, substitute the real names in `s.contentBlocks`/`bundle.sections`.)

- [ ] **Step 5: Re-run (expect PASS).**
```bash
npx jest __tests__/unit/workflow/assemble-html-backstop.test.js
```
Expected: all three cases PASS.

- [ ] **Step 6: Regression-check the existing template-node/assembler tests.**
```bash
npx jest __tests__/unit/template-assembler.test.js lib/__tests__/template-assembler-financial.test.js 2>&1 | tail -20
```
Expected: no new failures (those exercise the assembler with populated bundles).

- [ ] **Step 7: Commit.**
```bash
git add lib/workflow/nodes/template-nodes.js __tests__/unit/workflow/assemble-html-backstop.test.js && git commit -m "fix(N8): assembleHtml backstop throws on empty contentBundle before any write

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.11: Notion-reachability startup probe alongside `isClaudeAvailable`

**Files:**
- Modify: `server.js:1269-1289` (startup IIFE — add the Notion probe after the Claude check)
- Test: `__tests__/unit/notion-reachability-probe.test.js` (Create)

The startup already hard-fails on missing Claude auth. Notion is the other infra dependency every run needs; a probe at startup turns a per-session N1/fetch failure into a single loud startup message. Implement a small `probeNotionReachable()` helper (exported for test) that does one lightweight authenticated GET and returns `{ ok, error }`, then call it in the startup IIFE.

- [ ] **Step 1: Pick a lightweight Notion call for the probe.** `NotionClient.request()` is the generic authenticated request. The cheapest reachability+auth check is `GET users/me`. Confirm it is accepted by the integration token:
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && node -e "process.env.NOTION_TOKEN && (async()=>{const N=require('./lib/notion-client');const c=new N(process.env.NOTION_TOKEN);try{const r=await c.request('users/me');console.log('ok', r.type||r.object);}catch(e){console.log('ERR', e.message);}})()"
```
Expected: `ok bot` (or similar). If the token lacks `users` capability and returns 403, fall back to `request('databases/18c2f33d-583f-8020-91bc-d84c7dd94306')` (the ELEMENTS_DB the pipeline already reads). Record which endpoint the probe uses.

- [ ] **Step 2: Write the failing test FIRST.** `probeNotionReachable` is a pure function taking an injected client, so it is node-testable without network.

Create `__tests__/unit/notion-reachability-probe.test.js`:
```javascript
const { probeNotionReachable } = require('../../server.js');

describe('probeNotionReachable', () => {
  test('returns ok:true when the client request resolves', async () => {
    const client = { request: jest.fn().mockResolvedValue({ object: 'user', type: 'bot' }) };
    const result = await probeNotionReachable(client);
    expect(result.ok).toBe(true);
    expect(client.request).toHaveBeenCalledWith('users/me');
  });

  test('returns ok:false with the error message when the request rejects', async () => {
    const client = { request: jest.fn().mockRejectedValue(new Error('401 unauthorized')) };
    const result = await probeNotionReachable(client);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/401/);
  });
});
```
(Adjust the expected endpoint string to whatever Step 1 settled on.)

- [ ] **Step 3: Run (expect FAIL — function not exported yet).**
```bash
npx jest __tests__/unit/notion-reachability-probe.test.js
```
Expected: FAILS — `probeNotionReachable is not a function`.

- [ ] **Step 4: Implement the helper + wire it.** In `server.js`, add the helper near the top-level helpers (above the startup IIFE) and export it. First add the function (place it just before the `if (require.main === module)` block at line 1266):
```javascript
/**
 * Notion reachability + auth startup probe.
 * One lightweight authenticated GET; returns {ok, error} instead of throwing so the
 * startup IIFE can render a single loud failure card (mirrors isClaudeAvailable).
 * @param {{request: Function}} client - a NotionClient (injected for testing)
 */
async function probeNotionReachable(client) {
  try {
    await client.request('users/me');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
```
Then inside the startup IIFE, after `console.log('Claude Agent SDK available ✓');` (server.js:1289), add:
```javascript
    console.log('Claude Agent SDK available ✓');

    // Notion-reachability probe — fail loud at startup, not per-session.
    console.log('Checking Notion reachability...');
    const NotionClient = require('./lib/notion-client');
    if (!process.env.NOTION_TOKEN) {
        console.error('ERROR: NOTION_TOKEN is not set. Notion fetches will fail. Aborting startup.');
        process.exit(1);
    }
    const notionProbe = await probeNotionReachable(new NotionClient(process.env.NOTION_TOKEN));
    if (!notionProbe.ok) {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Notion not reachable                              ║
║                                                           ║
║  ${String(notionProbe.error).slice(0, 53).padEnd(53)}║
║                                                           ║
║  Check NOTION_TOKEN validity and network access.          ║
║  Server startup aborted.                                  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }
    console.log('Notion reachable ✓');
```
And extend the export at server.js:1343 from:
```javascript
module.exports = { buildResumePayload };
```
to:
```javascript
module.exports = { buildResumePayload, probeNotionReachable };
```
(Confirm `require('./lib/notion-client')` exports the class directly — `lib/notion-client.js` uses `module.exports = NotionClient;`; verify:)
```bash
cd "C:/Users/spide/Documents/claudecode/aboutlastnight/reports" && node -e "const N=require('./lib/notion-client'); console.log(typeof N, N.name||'(not a fn)')"
```
Expected: `function NotionClient`. If it exports `{ NotionClient }`, adjust the `require` to destructure.

- [ ] **Step 5: Re-run (expect PASS).** `require('../../server.js')` does not start the server (guarded by `require.main === module`).
```bash
npx jest __tests__/unit/notion-reachability-probe.test.js
```
Expected: both cases PASS.

- [ ] **Step 6: Confirm requiring server.js for the test does not start a listener.**
```bash
npx jest __tests__/unit/notion-reachability-probe.test.js 2>&1 | grep -i "server running\|listen\|EADDRINUSE" || echo "no server started — OK"
```
Expected: `no server started — OK`.

- [ ] **Step 7: Commit.**
```bash
git add server.js __tests__/unit/notion-reachability-probe.test.js && git commit -m "feat(startup): add Notion-reachability probe alongside isClaudeAvailable (fail-loud)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task P3.12: Phase verification — transient-retries-vs-permanent-throws integration + full suite

**Files:**
- Test: `__tests__/unit/workflow/retry-classifier-integration.test.js` (Create)

A focused integration assertion that ties the phase together: the `retryOn` classifier wired in P3.1 retries a mocked transient SDK error and lets a permanent one through. This is the "a node with a mocked transient SDK error retries; a permanent error throws" acceptance test from the phase brief. Since LangGraph's `retryPolicy` retries opaquely (node re-invoke), assert at the classifier boundary the policy uses.

- [ ] **Step 1: Write the test.**

Create `__tests__/unit/workflow/retry-classifier-integration.test.js`:
```javascript
const { createGraphBuilder } = require('../../../lib/workflow/graph');
const { isTransientError } = require('../../../lib/llm/retry');

describe('retryPolicy classifier integration (P3 acceptance)', () => {
  const builder = createGraphBuilder();
  const policy = builder.nodes['generateContentBundle'].retryPolicy; // adjust if specOf differs

  test('a transient SDK error (overloaded) is retried', () => {
    expect(policy.retryOn({ name: 'overloaded_error' })).toBe(true);
    expect(policy.retryOn({ status: 529 })).toBe(true);
    expect(policy.retryOn({ apiErrorStatus: 503 })).toBe(true);
  });

  test('a permanent error (auth/invalid-request/schema) is NOT retried → throws through', () => {
    expect(policy.retryOn({ status: 401 })).toBe(false);
    expect(policy.retryOn({ error: { type: 'invalid_request_error' } })).toBe(false);
    const soe = Object.assign(new Error('bad json'), { name: 'StructuredOutputExtractionError' });
    expect(policy.retryOn(soe)).toBe(false);
  });

  test('maxAttempts is 3 (transient gets up to 3 tries before surfacing)', () => {
    expect(policy.maxAttempts).toBe(3);
  });

  test('isTransientError is the exact classifier wired (no divergent copy)', () => {
    expect(policy.retryOn).toBe(isTransientError);
  });
});
```

- [ ] **Step 2: Run it.** (If `builder.nodes[...]` was wrong in P3.1, use the same accessor settled there.)
```bash
npx jest __tests__/unit/workflow/retry-classifier-integration.test.js
```
Expected: PASS — these all rely on P3.1 wiring + P1's `isTransientError`. If any transient/permanent case fails, the defect is in P1's classifier; fix there, not here.

- [ ] **Step 3: Run the full workflow + llm + server test suites to confirm no fail-loud refactor broke a green path.**
```bash
npx jest __tests__/unit/workflow lib/__tests__ lib/llm/__tests__ __tests__/integration 2>&1 | tail -30
```
Expected: green, except any tests intentionally retargeted in P3.2–P3.10 (now asserting `rejects.toThrow`). Resolve any unexpected red before committing.

- [ ] **Step 4: Run coverage to confirm the new throw paths are exercised and thresholds hold.**
```bash
npx jest --coverage --collectCoverageFrom='lib/workflow/nodes/{input,photo,ai,character-data,arc-specialist,template}-nodes.js' 2>&1 | tail -15
```
Expected: ≥80% lines/functions on the touched node files (the per-node fail-loud tests cover the new branches).

- [ ] **Step 5: Commit.**
```bash
git add __tests__/unit/workflow/retry-classifier-integration.test.js && git commit -m "test(P3): retry-classifier integration — transient retries, permanent throws

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase P4: Reliable outcome delivery + SSE contract + concurrency
Goal: The approve outcome is never lost (recoverable via GET /state), each pipeline outcome maps to one SSE event type, read endpoints report interrupt status, and a second concurrent /approve is rejected instead of corrupting the thread.
Dependencies: P1 must land first (it replaces `new MemorySaver()` at server.js:37 with the durable `SqliteSaver`; this phase's `getSessionState` rewrite and outcome persistence ride on the same `sharedCheckpointer` and the durable `graph.getState`). No dependency on P2/P3, but if P5 lands first the `SSE_LLM_DELTA`/`eventLog` console state already exists — the UX-1 `SET_ERROR` change here is additive and independent of it. **See the Cross-Phase Integration section: Task 4.4 (`failed` event) must be reconciled with P5's inline-failure-card design, and Tasks 4.1–4.3 share the approve handler + `module.exports` with P1.4.**

### Task 4.1: Persist the final approve outcome so a dropped SSE is recoverable via GET /state (DEL-1)
**Files:**
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\session-outcome.js`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js` (require + emit sites 1020-1031, 1038-1044; module.exports 1343)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\session-outcome.test.js`

- [ ] **Step 1: Write the failing test for the pure outcome store.** The contract says the final approve outcome must be readable via GET /state even if the SSE subscriber dropped. We capture that as a pure, in-memory, last-write-wins store keyed by sessionId, plus a builder that normalizes the three terminal shapes (`interrupted` / `complete` / `failed`) into one record.

Create `__tests__\unit\session-outcome.test.js`:
```js
/**
 * session-outcome unit tests (DEL-1)
 * The approve outcome must survive a dropped SSE: it is recorded in a
 * session-readable store and merged into GET /state responses.
 */
const {
  buildOutcomeRecord,
  recordSessionOutcome,
  getSessionOutcome,
  clearSessionOutcome,
  _resetOutcomeStore
} = require('../../lib/session-outcome');

beforeEach(() => _resetOutcomeStore());

describe('buildOutcomeRecord', () => {
  it('classifies an interrupted result as outcome "interrupted" with the next checkpoint phase', () => {
    const rec = buildOutcomeRecord({ interrupted: true, checkpoint: { type: 'outline' }, currentPhase: 3.25 });
    expect(rec.outcome).toBe('interrupted');
    expect(rec.currentPhase).toBe(3.25);
    expect(rec.checkpointType).toBe('outline');
    expect(typeof rec.recordedAt).toBe('string');
  });

  it('classifies a complete result as outcome "complete" and keeps the output path', () => {
    const rec = buildOutcomeRecord({ currentPhase: 'complete', outputPath: 'outputs/report-1221.html' });
    expect(rec.outcome).toBe('complete');
    expect(rec.outputPath).toBe('outputs/report-1221.html');
  });

  it('classifies an error result as outcome "failed" and preserves the error text', () => {
    const rec = buildOutcomeRecord({ currentPhase: 'error', error: 'Internal server error', details: 'Approval failed.' });
    expect(rec.outcome).toBe('failed');
    expect(rec.error).toBe('Internal server error');
    expect(rec.details).toBe('Approval failed.');
  });
});

describe('record/get/clear store', () => {
  it('returns null before anything is recorded', () => {
    expect(getSessionOutcome('1221')).toBeNull();
  });

  it('persists the last outcome and is readable without an SSE subscriber (last-write-wins)', () => {
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'error', error: 'boom' }));
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'complete', outputPath: 'outputs/x.html' }));
    const got = getSessionOutcome('1221');
    expect(got.outcome).toBe('complete');
    expect(got.outputPath).toBe('outputs/x.html');
  });

  it('clears a session outcome (used on rollback / fresh start)', () => {
    recordSessionOutcome('1221', buildOutcomeRecord({ currentPhase: 'complete' }));
    clearSessionOutcome('1221');
    expect(getSessionOutcome('1221')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure (module missing).**
```
npx jest __tests__/unit/session-outcome.test.js
```
Expected: `Cannot find module '../../lib/session-outcome'` — all suites fail to load.

- [ ] **Step 3: Implement `lib/session-outcome.js`.** A tiny, dependency-free, last-write-wins store plus the normalizer. The classifier mirrors the three terminal phases the approve background task can reach (`interrupted` / `complete` / `error`).
```js
/**
 * session-outcome — durable-enough record of the LAST terminal outcome per session.
 *
 * DEL-1: the approve endpoint returns 200 {status:'processing'} immediately and
 * delivers the real result via the unbuffered SSE emitter. If no subscriber is
 * attached (early-400, reconnect gap, tab closed) that outcome is lost. We also
 * record it here so GET /state can surface it after the fact.
 *
 * In-memory + last-write-wins. One process holds all session state already
 * (same lifetime as the checkpointer cache); this rides that lifetime.
 *
 * @module session-outcome
 */

const _store = new Map();

/**
 * Normalize a workflow result/response into a single outcome record.
 * @param {object} result - { interrupted?, checkpoint?, currentPhase, outputPath?, error?, details?, errors? }
 * @returns {object} record with a discriminating `outcome` field
 */
function buildOutcomeRecord(result = {}) {
  const recordedAt = new Date().toISOString();
  if (result.interrupted) {
    return {
      outcome: 'interrupted',
      currentPhase: result.currentPhase ?? null,
      checkpointType: result.checkpoint?.type || null,
      recordedAt
    };
  }
  if (result.currentPhase === 'error') {
    return {
      outcome: 'failed',
      currentPhase: 'error',
      error: result.error || 'Workflow error',
      details: result.details || null,
      errors: result.errors || [],
      recordedAt
    };
  }
  return {
    outcome: 'complete',
    currentPhase: result.currentPhase ?? 'complete',
    outputPath: result.outputPath || null,
    photosCopied: result.photosCopied || null,
    recordedAt
  };
}

function recordSessionOutcome(sessionId, record) {
  if (!sessionId) return;
  _store.set(sessionId, record);
}

function getSessionOutcome(sessionId) {
  return _store.get(sessionId) || null;
}

function clearSessionOutcome(sessionId) {
  _store.delete(sessionId);
}

/** Test-only: wipe the whole store. */
function _resetOutcomeStore() {
  _store.clear();
}

module.exports = {
  buildOutcomeRecord,
  recordSessionOutcome,
  getSessionOutcome,
  clearSessionOutcome,
  _resetOutcomeStore
};
```

- [ ] **Step 4: Re-run the test, expect green.**
```
npx jest __tests__/unit/session-outcome.test.js
```
Expected: `Tests: 6 passed`.

- [ ] **Step 5: Wire the store into the approve background task and the early-error path in `server.js`.** Require the module near the other lib requires (after line 32):
```js
const { buildRollbackState, createGraphAndConfig, sendErrorResponse } = require('./lib/api-helpers');
const { buildOutcomeRecord, recordSessionOutcome, getSessionOutcome } = require('./lib/session-outcome');
```
In the background `setImmediate` success branch, record before emitting. Change (server.js:1020-1021):
```js
                // Emit completion via SSE
                progressEmitter.emitComplete(sessionId, response);
```
to:
```js
                // Persist the outcome FIRST so a dropped SSE is recoverable via GET /state (DEL-1)
                recordSessionOutcome(sessionId, buildOutcomeRecord(response));
                // Emit completion via SSE
                progressEmitter.emitComplete(sessionId, response);
```
In the background `catch` branch, change (server.js:1024-1031):
```js
                console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
                progressEmitter.emitComplete(sessionId, {
                    sessionId,
                    currentPhase: PHASES.ERROR,
                    error: 'Internal server error',
                    details: 'Approval operation failed. Check server logs.'
                });
```
to:
```js
                console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
                const failedResponse = {
                    sessionId,
                    currentPhase: PHASES.ERROR,
                    error: 'Internal server error',
                    details: 'Approval operation failed. Check server logs.'
                };
                recordSessionOutcome(sessionId, buildOutcomeRecord(failedResponse));
                progressEmitter.emitComplete(sessionId, failedResponse);
```
And in the outer (pre-background) `catch` (server.js:1038-1044), record the early failure too:
```js
        // Emit SSE completion for sync errors so client doesn't hang waiting
        const earlyFailure = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Approval operation failed. Check server logs.'
        };
        recordSessionOutcome(sessionId, buildOutcomeRecord(earlyFailure));
        progressEmitter.emitComplete(sessionId, earlyFailure);
```

- [ ] **Step 6: Export the getter from server.js for the GET /state merge in Task 4.2.** Change `module.exports = { buildResumePayload };` (server.js:1343) to:
```js
module.exports = { buildResumePayload, getSessionOutcome };
```

- [ ] **Step 7: Confirm the existing server test still loads (require doesn't start the server).**
```
npx jest __tests__/unit/server-build-resume-payload.test.js
```
Expected: all existing `buildResumePayload` suites pass; no server banner printed.

- [ ] **Step 8: Commit.**
```
git add lib/session-outcome.js __tests__/unit/session-outcome.test.js server.js && git commit -m 'feat(server): persist last approve outcome for SSE-drop recovery (DEL-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

### Task 4.2: Make GET /state interrupt-aware via graph.getState and surface the persisted outcome (READ-1 + DEL-1 read side)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js` (`getSessionState` 49-60; GET /state 665-685; GET /state/:field 784-806; module.exports 1343)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\get-session-state.test.js`

- [ ] **Step 1: Write the failing test for an interrupt-aware `getSessionState`.** It must use `graph.getState` (which exposes `tasks[].interrupts`) rather than the raw `checkpointer.getTuple` (which exposes only `channel_values`), so `/state` can report `interrupted`. We test the pure shaping helper `shapeSessionState(graphState, outcome)` that the endpoint will call, injecting fakes (no real graph/SQLite).

Create `__tests__\unit\get-session-state.test.js`:
```js
/**
 * getSessionState / shapeSessionState (READ-1 + DEL-1 read side)
 * A state read must report interrupt status and the last persisted outcome.
 */
const { shapeSessionState } = require('../../server.js');

function interruptedGraphState() {
  return {
    values: { currentPhase: 3.25, theme: 'journalist', outline: { lede: {} } },
    config: { configurable: { checkpoint_id: 'ckpt-abc', thread_id: '1221' } },
    createdAt: '2026-06-21T00:00:00.000Z',
    tasks: [{ id: 't1', interrupts: [{ value: { type: 'outline' } }] }]
  };
}

function runningGraphState() {
  return {
    values: { currentPhase: 2.0, theme: 'journalist' },
    config: { configurable: { checkpoint_id: 'ckpt-def', thread_id: '1221' } },
    createdAt: '2026-06-21T00:00:01.000Z',
    tasks: [{ id: 't2', interrupts: [] }]
  };
}

describe('shapeSessionState', () => {
  it('reports interrupted:true and the checkpoint type when an interrupt is pending', () => {
    const out = shapeSessionState(interruptedGraphState(), null);
    expect(out.interrupted).toBe(true);
    expect(out.checkpointType).toBe('outline');
    expect(out.checkpointId).toBe('ckpt-abc');
    expect(out.state.currentPhase).toBe(3.25);
  });

  it('reports interrupted:false when no interrupt is pending', () => {
    const out = shapeSessionState(runningGraphState(), null);
    expect(out.interrupted).toBe(false);
    expect(out.checkpointType).toBeNull();
  });

  it('attaches the persisted outcome when present (so a dropped SSE is recoverable)', () => {
    const outcome = { outcome: 'failed', currentPhase: 'error', error: 'boom', recordedAt: 'x' };
    const out = shapeSessionState(runningGraphState(), outcome);
    expect(out.lastOutcome).toEqual(outcome);
  });

  it('omits lastOutcome (null) when nothing was persisted', () => {
    const out = shapeSessionState(runningGraphState(), null);
    expect(out.lastOutcome).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
```
npx jest __tests__/unit/get-session-state.test.js
```
Expected: `TypeError: shapeSessionState is not a function` (not yet exported).

- [ ] **Step 3: Rewrite `getSessionState` to use `graph.getState` and add the pure `shapeSessionState` helper.** Replace the body (server.js:49-60):
```js
async function getSessionState(sessionId) {
    const config = { configurable: { thread_id: sessionId } };
    const tuple = await sharedCheckpointer.getTuple(config);

    if (!tuple) return null;

    return {
        checkpointId: tuple.checkpoint?.id,
        timestamp: tuple.checkpoint?.ts,
        state: tuple.checkpoint?.channel_values || {}
    };
}
```
with:
```js
/**
 * Pure shaper: turn a graph.getState() snapshot (+ persisted outcome) into the
 * /state response body. Interrupt-aware (READ-1) and outcome-aware (DEL-1).
 * @param {object} graphState - result of graph.getState(config)
 * @param {object|null} outcome - getSessionOutcome(sessionId) result
 * @returns {object}
 */
function shapeSessionState(graphState, outcome) {
    const interruptTask = (graphState.tasks || []).find(t => t.interrupts && t.interrupts.length > 0);
    const interrupted = !!interruptTask;
    const checkpointType = interrupted
        ? (interruptTask.interrupts[0]?.value?.type || null)
        : null;
    return {
        checkpointId: graphState.config?.configurable?.checkpoint_id || null,
        timestamp: graphState.createdAt || null,
        interrupted,
        checkpointType,
        state: graphState.values || {},
        lastOutcome: outcome || null
    };
}

async function getSessionState(sessionId) {
    const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
    const config = { configurable: { thread_id: sessionId } };
    const graphState = await graph.getState(config);

    if (!graphState || !graphState.values || Object.keys(graphState.values).length === 0) {
        return null;
    }

    return shapeSessionState(graphState, getSessionOutcome(sessionId));
}
```
(`createReportGraphWithCheckpointer` is already imported at server.js:15; `getSessionOutcome` was required in Task 4.1.)

- [ ] **Step 4: Forward the new fields in the GET /state handler.** Change (server.js:675-680):
```js
        res.json({
            sessionId,
            checkpointId: session.checkpointId,
            timestamp: session.timestamp,
            state: session.state
        });
```
to:
```js
        res.json({
            sessionId,
            checkpointId: session.checkpointId,
            timestamp: session.timestamp,
            interrupted: session.interrupted,
            checkpointType: session.checkpointType,
            lastOutcome: session.lastOutcome,
            state: session.state
        });
```
(The GET /state/:field handler at 784-806 already reads `session.state[field]` and needs no change — `shapeSessionState` still returns `state`.)

- [ ] **Step 5: Export `shapeSessionState` for the test.** Change `module.exports = { buildResumePayload, getSessionOutcome };` (server.js:1343) to:
```js
module.exports = { buildResumePayload, getSessionOutcome, shapeSessionState };
```

- [ ] **Step 6: Re-run both the new and the existing server tests.**
```
npx jest __tests__/unit/get-session-state.test.js __tests__/unit/server-build-resume-payload.test.js
```
Expected: new file 4 passed; existing file still all green; no server banner.

- [ ] **Step 7: Commit.**
```
git add server.js __tests__/unit/get-session-state.test.js && git commit -m 'fix(server): GET /state reports interrupt status + persisted outcome (READ-1, DEL-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

### Task 4.3: Per-session in-flight lock rejects a second concurrent /approve (CONC-1)
**Files:**
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\session-locks.js`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js` (require after 33; approve handler 918-1048)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\session-locks.test.js`

- [ ] **Step 1: Write the failing test for the pure lock.** Two approves can both pass `isGraphInterrupted` before either `setImmediate` runs (server.js:931-982); the lock must let exactly one acquire and reject the other until released.

Create `__tests__\unit\session-locks.test.js`:
```js
/**
 * session-locks unit tests (CONC-1)
 * A second /approve on a session whose first /approve is still running must be rejected.
 */
const { acquireSessionLock, releaseSessionLock, isSessionLocked, _resetLocks } = require('../../lib/session-locks');

beforeEach(() => _resetLocks());

describe('per-session in-flight lock', () => {
  it('lets the first acquire succeed', () => {
    expect(acquireSessionLock('1221')).toBe(true);
    expect(isSessionLocked('1221')).toBe(true);
  });

  it('rejects a second acquire while held', () => {
    acquireSessionLock('1221');
    expect(acquireSessionLock('1221')).toBe(false);
  });

  it('allows re-acquire after release', () => {
    acquireSessionLock('1221');
    releaseSessionLock('1221');
    expect(isSessionLocked('1221')).toBe(false);
    expect(acquireSessionLock('1221')).toBe(true);
  });

  it('locks are independent per session', () => {
    acquireSessionLock('1221');
    expect(acquireSessionLock('1225')).toBe(true);
  });

  it('release of an unheld session is a no-op (no throw)', () => {
    expect(() => releaseSessionLock('9999')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test, expect failure.**
```
npx jest __tests__/unit/session-locks.test.js
```
Expected: `Cannot find module '../../lib/session-locks'`.

- [ ] **Step 3: Implement `lib/session-locks.js`.**
```js
/**
 * session-locks — per-session in-flight guard for the approve endpoint (CONC-1).
 *
 * Two /approve requests can both pass isGraphInterrupted() before either
 * setImmediate resume runs, interleaving resumes on one thread/checkpointer.
 * This Set-based lock makes the second acquire fail-fast so the handler can
 * 409 it. Single-process server → an in-memory Set is sufficient and atomic
 * (Node is single-threaded; acquire is a synchronous check-then-set).
 *
 * @module session-locks
 */

const _held = new Set();

/** @returns {boolean} true if the lock was acquired; false if already held. */
function acquireSessionLock(sessionId) {
  if (_held.has(sessionId)) return false;
  _held.add(sessionId);
  return true;
}

function releaseSessionLock(sessionId) {
  _held.delete(sessionId);
}

function isSessionLocked(sessionId) {
  return _held.has(sessionId);
}

/** Test-only. */
function _resetLocks() {
  _held.clear();
}

module.exports = { acquireSessionLock, releaseSessionLock, isSessionLocked, _resetLocks };
```

- [ ] **Step 4: Re-run, expect green.**
```
npx jest __tests__/unit/session-locks.test.js
```
Expected: `Tests: 5 passed`.

- [ ] **Step 5: Wire the lock into the approve handler.** Require it (after the session-outcome require added in Task 4.1):
```js
const { buildOutcomeRecord, recordSessionOutcome, getSessionOutcome } = require('./lib/session-outcome');
const { acquireSessionLock, releaseSessionLock } = require('./lib/session-locks');
```
Acquire immediately after the interrupt check passes and before building the resume payload. The lock must be released in EVERY exit of the background task. Change the block (server.js:953-982) — from the theme resolve through the `setImmediate` open — so it reads:
```js
        // Resolve theme from state
        const theme = graphState.values?.theme || 'journalist';
        config.configurable.theme = theme;

        // Build resume payload from approvals (pass current state for incremental input merging)
        const { resume, stateUpdates, error: validationError } = buildResumePayload(approvals, graphState.values, theme);
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        // CONC-1: reject a second concurrent approve on this session.
        if (!acquireSessionLock(sessionId)) {
            return res.status(409).json({
                sessionId,
                error: 'An approval is already in progress for this session. Please wait for it to finish.'
            });
        }

        // Return immediately - workflow runs in background
        const previousPhase = graphState.values?.currentPhase;
        res.json({
            sessionId,
            status: 'processing',
            previousPhase
        });

        // Run workflow in background using Command({ resume }) pattern
        setImmediate(async () => {
            try {
```
Then add a `finally` that releases the lock. Change the background task's `catch` close (server.js:1023-1032) so the try/catch gains a finally:
```js
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
                const failedResponse = {
                    sessionId,
                    currentPhase: PHASES.ERROR,
                    error: 'Internal server error',
                    details: 'Approval operation failed. Check server logs.'
                };
                recordSessionOutcome(sessionId, buildOutcomeRecord(failedResponse));
                progressEmitter.emitComplete(sessionId, failedResponse);
            } finally {
                releaseSessionLock(sessionId);
            }
        });
```
(The lock is acquired only after all synchronous 400 paths, so those early returns never leak it. The outer pre-background `catch` at 1034 runs only for throws before `acquireSessionLock`, so it must NOT release — leave it unchanged except for the Task 4.1 outcome-record edit.)

- [ ] **Step 6: Verify no early-return path holds the lock by reading the changed handler.**
```
node -e "const s=require('fs').readFileSync('server.js','utf8'); const i=s.indexOf('acquireSessionLock(sessionId)'); console.log(s.slice(i-400,i+1200));"
```
Expected output shows: the `acquireSessionLock` guard sits AFTER the `validationError` 400 return, and a `finally { releaseSessionLock(sessionId); }` closes the `setImmediate` task.

- [ ] **Step 7: Re-run the lock test and the existing server test (require still must not boot the server).**
```
npx jest __tests__/unit/session-locks.test.js __tests__/unit/server-build-resume-payload.test.js
```
Expected: both green, no server banner.

- [ ] **Step 8: Commit.**
```
git add lib/session-locks.js __tests__/unit/session-locks.test.js server.js && git commit -m 'fix(server): per-session in-flight lock rejects concurrent /approve (CONC-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

### Task 4.4: One SSE event type per outcome — split the overloaded `complete` (SSE-1)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\observability\progress-emitter.js` (emitComplete 33-46)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\console\api.js` (SSE switch 176-193)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\console\app.js` (complete handler 124-153)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\progress-emitter-outcome.test.js`

- [ ] **Step 1: Write the failing test for outcome→event-type mapping.** The contract: the overloaded `complete` keeps its payload, but a distinct `failed` currentPhase must be surfaceable so the client can show a retry affordance. We add a pure classifier `outcomeEventType(response)` on the emitter module that maps a response to the SSE `type` the emitter stamps. `interrupted`/`complete` stay `type:'complete'` (the console already disambiguates on `interrupted`/`currentPhase`); a failure becomes a distinct `type:'failed'`.

Create `__tests__\unit\progress-emitter-outcome.test.js`:
```js
/**
 * progress-emitter outcome event typing (SSE-1)
 */
const { outcomeEventType, ProgressEmitter } = require('../../lib/observability/progress-emitter');

describe('outcomeEventType', () => {
  it('maps an interrupted result to "complete" (payload-disambiguated by the client)', () => {
    expect(outcomeEventType({ interrupted: true, currentPhase: 3.25 })).toBe('complete');
  });
  it('maps a completed result to "complete"', () => {
    expect(outcomeEventType({ currentPhase: 'complete' })).toBe('complete');
  });
  it('maps an error result to the distinct "failed" type', () => {
    expect(outcomeEventType({ currentPhase: 'error', error: 'boom' })).toBe('failed');
  });
});

describe('emitComplete stamps the outcome-derived type', () => {
  it('emits type:"failed" for an error response', (done) => {
    const em = new ProgressEmitter();
    em.subscribe('1221', (data) => {
      expect(data.type).toBe('failed');
      expect(data.error).toBe('boom');
      done();
    });
    em.emitComplete('1221', { sessionId: '1221', currentPhase: 'error', error: 'boom' });
  });

  it('emits type:"complete" for an interrupted response', (done) => {
    const em = new ProgressEmitter();
    em.subscribe('1225', (data) => {
      expect(data.type).toBe('complete');
      expect(data.interrupted).toBe(true);
      done();
    });
    em.emitComplete('1225', { sessionId: '1225', interrupted: true, currentPhase: 3.25 });
  });
});
```

- [ ] **Step 2: Run, expect failure.**
```
npx jest __tests__/unit/progress-emitter-outcome.test.js
```
Expected: `TypeError: outcomeEventType is not a function`.

- [ ] **Step 3: Add `outcomeEventType` and use it in `emitComplete`.** In `progress-emitter.js`, add the helper above the class and stamp the derived type. Replace the `emitComplete` method (33-46):
```js
  emitComplete(sessionId, result) {
    if (!sessionId) return;
    this.emit(`progress:${sessionId}`, {
      timestamp: new Date().toISOString(),
      ...result,
      type: 'complete'  // Must be last to override any 'type' in result
    });
  }
```
with:
```js
  emitComplete(sessionId, result) {
    if (!sessionId) return;
    this.emit(`progress:${sessionId}`, {
      timestamp: new Date().toISOString(),
      ...result,
      // SSE-1: failures get a DISTINCT type so the client can show a retry
      // affordance; interrupted/complete stay 'complete' (client disambiguates
      // on interrupted/currentPhase). Must be last to override any inbound type.
      type: outcomeEventType(result)
    });
  }
```
Add the pure helper just below the `require('events')` line (after line 12):
```js
const EventEmitter = require('events');

/**
 * Map a terminal workflow response to its SSE event type (SSE-1).
 * - error  -> 'failed' (distinct; client renders a retry affordance)
 * - interrupted / complete -> 'complete' (client disambiguates on the payload)
 * @param {object} result
 * @returns {'complete'|'failed'}
 */
function outcomeEventType(result = {}) {
  if (!result.interrupted && result.currentPhase === 'error') return 'failed';
  return 'complete';
}
```
And export it. Change the module.exports (66):
```js
module.exports = { progressEmitter, ProgressEmitter };
```
to:
```js
module.exports = { progressEmitter, ProgressEmitter, outcomeEventType };
```

- [ ] **Step 4: Re-run, expect green.**
```
npx jest __tests__/unit/progress-emitter-outcome.test.js
```
Expected: `Tests: 5 passed`.

- [ ] **Step 5: Teach the console SSE client to forward the new `failed` type (console/api.js).** Add `'failed'` to the recognized event list. Change (api.js:182-189):
```js
          case 'progress':
          case 'llm_start':
          case 'llm_complete':
          case 'complete':
          case 'error':
          case 'heartbeat':
            if (onProgress) onProgress({ type, data });
            break;
```
to:
```js
          case 'progress':
          case 'llm_start':
          case 'llm_complete':
          case 'complete':
          case 'failed':
          case 'error':
          case 'heartbeat':
            if (onProgress) onProgress({ type, data });
            break;
```
(The `default` branch already forwarded unknown types, so this is explicitness, not new routing — but it documents the contract at the dispatch site.)

- [ ] **Step 6: Handle the `failed` event in app.js with a retry-affordance error.** Add a case alongside `complete` (app.js, after the `complete` case closes at line 153). Insert:
```js
            case 'failed':
              // SSE-1: distinct terminal failure. Close the stream, stop the
              // spinner, and surface a retry affordance (retry == re-/approve
              // or rollback from the same checkpoint).
              eventSource.close();
              sseRef.current = null;
              dispatch({ type: APP_ACTIONS.SSE_COMPLETE });
              dispatch({
                type: APP_ACTIONS.SET_ERROR,
                message: (event.data.error || 'Workflow failed') +
                  (event.data.details ? ' ' + event.data.details : '') +
                  ' You can retry from this checkpoint, or use rollback.'
              });
              break;
```
(Note: the existing `error` case at app.js:154 handles SSE *transport* loss; `failed` is a clean workflow-failure terminal. Both now stop the spinner — `SSE_COMPLETE`/`SET_ERROR` both set `processing:false` after Task 4.5.)

- [ ] **Step 7: Manual browser verification (no React harness).** Note in the commit body: with the server running, drive an approve that errors in the background (e.g. a session whose resume throws) and confirm the console shows the inline failure + retry copy and the spinner stops. Automated coverage is the emitter unit test in Steps 1-4; the app.js/api.js wiring is verified manually per reports/CLAUDE.md.

- [ ] **Step 8: Run the full emitter-adjacent suite to confirm nothing else keyed on `type:'complete'` for errors.**
```
npx jest __tests__/unit/progress-emitter-outcome.test.js && npx jest --listTests | findstr observability
```
Expected: the outcome test passes; `--listTests` shows any other observability test files (run them if present — none currently assert error→complete).

- [ ] **Step 9: Commit.**
```
git add lib/observability/progress-emitter.js console/api.js console/app.js __tests__/unit/progress-emitter-outcome.test.js && git commit -m 'feat(sse): distinct "failed" outcome event with client retry affordance (SSE-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

### Task 4.5: Clear the client processing state on early-400 approve so the spinner cannot hang (UX-1/4/5/6)
**Files:**
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\console\session-status-logic.js` (dual-export pure module)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\console\state.js` (SET_ERROR 167-168)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\console\index.html` (add the new script tag in load order)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\session-status-logic.test.js`

- [ ] **Step 1: Write the failing test for the SET_ERROR reducer transition.** UX-1: an approve that returns 400 dispatches `SET_ERROR` (app.js:171-176), but `SET_ERROR` (state.js:167) does not clear `processing`, and early-400s emit no SSE `complete`, so the spinner hangs until reload. We extract the SET_ERROR transition into a pure, dual-export reducer fragment so it can be unit-tested in node-env (per reports/CLAUDE.md — the console has no React harness).

Create `__tests__\unit\session-status-logic.test.js`:
```js
/**
 * session-status-logic (UX-1/4/5/6)
 * Setting an error must also stop the spinner (clear `processing`), so an
 * early-400 approve (which emits no SSE complete) cannot hang the UI.
 */
const { applySetError, applyClearError } = require('../../console/session-status-logic');

describe('applySetError', () => {
  it('sets the error message AND clears processing (UX-1: spinner cannot hang)', () => {
    const next = applySetError({ processing: true, error: null }, 'Session is not at a checkpoint');
    expect(next.error).toBe('Session is not at a checkpoint');
    expect(next.processing).toBe(false);
  });

  it('preserves unrelated state fields', () => {
    const next = applySetError({ processing: true, sessionId: '1221', checkpointType: 'outline' }, 'boom');
    expect(next.sessionId).toBe('1221');
    expect(next.checkpointType).toBe('outline');
  });
});

describe('applyClearError', () => {
  it('clears the error and leaves processing untouched', () => {
    const next = applyClearError({ error: 'boom', processing: false });
    expect(next.error).toBeNull();
    expect(next.processing).toBe(false);
  });
});
```

- [ ] **Step 2: Run, expect failure.**
```
npx jest __tests__/unit/session-status-logic.test.js
```
Expected: `Cannot find module '../../console/session-status-logic'`.

- [ ] **Step 3: Create the dual-export pure module `console/session-status-logic.js`.**
```js
/**
 * session-status-logic — pure reducer fragments for terminal/error transitions.
 *
 * Dual-export (browser: window.Console.sessionStatusLogic; node: module.exports)
 * so the SET_ERROR contract can be unit-tested in node-env — the console has no
 * React/DOM harness (see reports/CLAUDE.md "Console has NO DOM/React test harness").
 *
 * UX-1: clearing `processing` on SET_ERROR is what stops the spinner when an
 * approve fails with an early 400 (which emits no SSE 'complete'/'failed').
 */
(function (root) {
  'use strict';

  function applySetError(state, message) {
    return { ...state, error: message, processing: false };
  }

  function applyClearError(state) {
    return { ...state, error: null };
  }

  const api = { applySetError, applyClearError };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Console = root.Console || {};
    root.Console.sessionStatusLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Re-run, expect green.**
```
npx jest __tests__/unit/session-status-logic.test.js
```
Expected: `Tests: 3 passed`.

- [ ] **Step 5: Use the pure fragment in the real reducer.** In `console/state.js`, the SET_ERROR / CLEAR_ERROR cases (167-171) currently are:
```js
    case ACTIONS.SET_ERROR:
      return { ...state, error: action.message };

    case ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
```
Replace with (delegating to the pure fragment so node-tested behavior IS the runtime behavior):
```js
    case ACTIONS.SET_ERROR:
      // UX-1: also clears `processing` so an early-400 approve can't hang the spinner.
      return window.Console.sessionStatusLogic.applySetError(state, action.message);

    case ACTIONS.CLEAR_ERROR:
      return window.Console.sessionStatusLogic.applyClearError(state);
```

- [ ] **Step 6: Add the new script tag to `console/index.html` BEFORE `state.js` in load order.** `state.js`'s reducer now references `window.Console.sessionStatusLogic` at call time (inside the reducer, not at module-eval), but loading it before `state.js` keeps the dependency obvious and matches the `outline-edit-logic.js` precedent. Find the existing `state.js` script tag and insert the new one immediately above it:
```
node -e "const fs=require('fs');let h=fs.readFileSync('console/index.html','utf8');const tag='<script type=\"text/babel\" src=\"state.js\"></script>';if(!h.includes('session-status-logic.js')){h=h.replace(tag,'<script type=\"text/babel\" src=\"session-status-logic.js\"></script>\n    '+tag);fs.writeFileSync('console/index.html',h);}console.log(h.includes('session-status-logic.js')?'inserted':'FAILED — locate the state.js tag manually');"
```
Expected output: `inserted`. (If it prints `FAILED`, open `console/index.html`, find the `src="state.js"` script tag, and add `<script type="text/babel" src="session-status-logic.js"></script>` on the line above it.)

- [ ] **Step 7: Manual browser verification.** Note in commit body: with the server running, trigger an approve that returns 400 (e.g. POST /approve when the session is not at a checkpoint) and confirm the spinner stops and the error renders, with no page reload needed. The reducer transition itself is covered by the node test in Steps 1-4.

- [ ] **Step 8: Run the console pure-logic tests together to confirm no regression in the sibling module.**
```
npx jest __tests__/unit/session-status-logic.test.js console/__tests__ 2>/dev/null; npx jest -t outline-edit
```
Expected: session-status-logic green; outline-edit-logic suite still green.

- [ ] **Step 9: Commit.**
```
git add console/session-status-logic.js console/state.js console/index.html __tests__/unit/session-status-logic.test.js && git commit -m 'fix(console): SET_ERROR clears processing so early-400 approve cannot hang (UX-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

### Task 4.6: Remove the deprecated, divergent /api/generate endpoint (GEN-1)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\server.js` (JSDoc + handler ~430-611)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\no-api-generate.test.js`

- [ ] **Step 1: Confirm nothing in the console or e2e harness still calls /api/generate.** GEN-1 says it is deprecated and divergent (`buildResumePayload(approvals, {}, ...)` drops `photosPath`). Verify there are no live callers before deleting.
```
npx jest --version >/dev/null; node -e "1"  # no-op to keep step shape
```
Then search the front-end + tooling:
```
git grep -n "api/generate" -- console scripts e2e-walkthrough.js 2>/dev/null || true
```
Expected: zero hits in `console/` and `scripts/` (the only matches, if any, are in `server.js` itself and docs). If a live caller appears, STOP and migrate it to `/start`+`/approve` before deleting — do not delete with a live caller.

- [ ] **Step 2: Write the failing guard test asserting the endpoint is gone from server source.** Since there is no supertest harness, assert the route is not registered by scanning the server source for the route definition (the same static-source approach used to verify wiring without booting Express).

Create `__tests__\unit\no-api-generate.test.js`:
```js
/**
 * GEN-1: the deprecated /api/generate endpoint must be removed.
 * No supertest harness exists; assert the route is not registered in source.
 */
const fs = require('fs');
const path = require('path');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

describe('GEN-1 /api/generate removal', () => {
  it('does not register the deprecated /api/generate route', () => {
    expect(SERVER_SRC).not.toMatch(/app\.post\(\s*['"`]\/api\/generate['"`]/);
  });

  it('still registers the supported /start and /approve routes', () => {
    expect(SERVER_SRC).toMatch(/\/api\/session\/:id\/start/);
    expect(SERVER_SRC).toMatch(/\/api\/session\/:id\/approve/);
  });
});
```

- [ ] **Step 3: Run, expect failure.**
```
npx jest __tests__/unit/no-api-generate.test.js
```
Expected: the first test fails — `/api/generate` is still registered.

- [ ] **Step 4: Delete the handler and its JSDoc block.** Read the exact span first (the JSDoc opens at server.js:469's `*/` predecessor; the handler runs 470-611). Read to find the JSDoc start:
```
node -e "const s=require('fs').readFileSync('server.js','utf8').split('\n'); for(let i=420;i<472;i++) console.log((i+1)+': '+s[i]);"
```
Then remove the contiguous block from the JSDoc comment opener that documents `/api/generate` through the handler's closing `});` at line 611 (inclusive). Use an exact-anchor edit: delete from the comment line containing `* POST /api/generate` opener up to and including the `});` that closes the handler at 611, leaving the `// ===== SESSION STATE ENDPOINTS (8.9.7) =====` block (612+) intact. After editing, the line immediately following the prior route's `});` should be the `// ===== SESSION STATE ENDPOINTS` comment.

- [ ] **Step 5: Re-run, expect green.**
```
npx jest __tests__/unit/no-api-generate.test.js
```
Expected: `Tests: 2 passed`.

- [ ] **Step 6: Sanity-check the file still parses and the server module still requires cleanly (no boot).**
```
node -e "require('./server.js'); console.log('server.js requires OK, no boot');"
```
Expected: `server.js requires OK, no boot` with no Express banner (require.main guard holds).

- [ ] **Step 7: Run the existing server test to confirm exports intact.**
```
npx jest __tests__/unit/server-build-resume-payload.test.js
```
Expected: all green.

- [ ] **Step 8: Commit.**
```
git add server.js __tests__/unit/no-api-generate.test.js && git commit -m 'chore(server): remove deprecated divergent /api/generate endpoint (GEN-1)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>'
```

---

## Phase P5: Observability streaming UI
Goal: Render a live preparing→thinking→writing→done/failed call feed with raw token-streamed text, a ticking token/TTFT liveness counter, and an inline failure card with [Retry]/[Roll back], while the macro PipelineProgress stepper stays visible above the feed during processing.
Dependencies: **P2** must land first — it adds `options.includePartialMessages = true` to `lib/llm/client.js`, emits `onProgress({ type: 'llm_delta', phase, deltaText, tokenCount, ttftMs, elapsed })` on `stream_event`, and adds `SSE_EVENT_TYPES.LLM_DELTA` to `lib/observability/constants.js`. This phase consumes those events. **P1** (durable checkpointer) and **P3** (resume = re-run failed node) and **P4** (reliable outcome delivery: persisted outcome + distinct `failed` SSE event type) must land first because the failure card's **[Retry]** affordance calls `/resume` (P1/P3 semantics) and is driven by P4's `failed` SSE event. **See the Cross-Phase Integration section: the `failed` handling here (P5.3 Step 3) and in P4.4 Step 6 MUST be merged into one inline-failure-card path, and this phase shares `console/{state.js, api.js, app.js, index.html}` with P4.**

---

### Task P5.1: Server-side coalescing of `llm_delta` into throttled SSE events

**Files:**
- Modify: `lib/observability/progress-bridge.js` (add an `llm_delta` branch + a per-`(context)` coalescer; lines 156–290 hold the `createProgressFromTrace` callback)
- Test: `lib/observability/__tests__/progress-bridge-llm-delta.test.js` (create)

- [ ] **Step 1: Confirm the upstream contract.** Verify P3 added the constant and that client.js emits `llm_delta`:
  ```bash
  node -e "console.log(require('./lib/observability/constants').SSE_EVENT_TYPES.LLM_DELTA)"   # expect: llm_delta
  grep -n "llm_delta\|includePartialMessages\|stream_event" lib/llm/client.js
  ```
  Expected: the first prints `llm_delta`; the grep shows the `stream_event` handler emitting `{ type: 'llm_delta', phase, deltaText, tokenCount, ttftMs, elapsed }`. If `LLM_DELTA` is missing, stop — P3 is not landed.

- [ ] **Step 2: Write the failing test FIRST.** Create `lib/observability/__tests__/progress-bridge-llm-delta.test.js`:
  ```js
  const { createProgressFromTrace } = require('../progress-bridge');
  const { progressEmitter } = require('../progress-emitter');
  const { SSE_EVENT_TYPES } = require('../constants');

  describe('progress-bridge llm_delta coalescing', () => {
    let originalSdkProgress;
    let emitted;
    let unsubscribe;
    const SESSION = 'test-delta-session';

    beforeAll(() => {
      originalSdkProgress = process.env.SDK_PROGRESS;
      process.env.SDK_PROGRESS = 'true';
    });
    afterAll(() => {
      if (originalSdkProgress === undefined) delete process.env.SDK_PROGRESS;
      else process.env.SDK_PROGRESS = originalSdkProgress;
    });

    beforeEach(() => {
      jest.useFakeTimers();
      emitted = [];
      unsubscribe = progressEmitter.subscribe(SESSION, (d) => emitted.push(d));
    });
    afterEach(() => {
      unsubscribe();
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    const deltas = () => emitted.filter((e) => e.type === SSE_EVENT_TYPES.LLM_DELTA);

    test('coalesces sub-threshold deltas into one flushed event after <=250ms', () => {
      const logger = createProgressFromTrace('genOutline', SESSION);
      logger({ type: 'llm_delta', phase: 'writing', deltaText: 'Hel', tokenCount: 1, ttftMs: 120, elapsed: 0.3 });
      logger({ type: 'llm_delta', phase: 'writing', deltaText: 'lo ', tokenCount: 2, ttftMs: 120, elapsed: 0.4 });
      expect(deltas().length).toBe(0);            // nothing flushed yet (sub-threshold)
      jest.advanceTimersByTime(250);
      expect(deltas().length).toBe(1);
      const d = deltas()[0];
      expect(d.phase).toBe('writing');
      expect(d.deltaText).toBe('Hello ');         // accumulated text since last flush
      expect(d.tokenCount).toBe(2);               // latest cumulative token count
      expect(d.ttftMs).toBe(120);
      expect(d.context).toBe('genOutline');
    });

    test('flushes immediately when >=50 tokens accumulate since last flush', () => {
      const logger = createProgressFromTrace('genArticle', SESSION);
      for (let i = 1; i <= 50; i++) {
        logger({ type: 'llm_delta', phase: 'thinking', deltaText: 'x', tokenCount: i, ttftMs: 90, elapsed: i / 100 });
      }
      expect(deltas().length).toBe(1);            // 50-token threshold tripped a synchronous flush
      expect(deltas()[0].tokenCount).toBe(50);
      expect(deltas()[0].deltaText.length).toBe(50);
    });

    test('a phase change flushes the prior phase buffer immediately', () => {
      const logger = createProgressFromTrace('genArticle', SESSION);
      logger({ type: 'llm_delta', phase: 'thinking', deltaText: 'mm', tokenCount: 1, ttftMs: 80, elapsed: 0.2 });
      logger({ type: 'llm_delta', phase: 'writing', deltaText: 'go', tokenCount: 2, ttftMs: 80, elapsed: 0.3 });
      const d = deltas();
      expect(d.length).toBe(1);                   // the thinking buffer flushed on phase switch
      expect(d[0].phase).toBe('thinking');
      expect(d[0].deltaText).toBe('mm');
    });

    test('llm_complete flushes any pending delta buffer before completing', () => {
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const logger = createProgressFromTrace('genOutline', SESSION);
      logger({ type: 'llm_delta', phase: 'writing', deltaText: 'tail', tokenCount: 3, ttftMs: 100, elapsed: 0.5 });
      logger({ type: 'llm_complete', elapsed: 1.0, result: { ok: true } });
      const d = deltas();
      expect(d.length).toBe(1);
      expect(d[0].deltaText).toBe('tail');
      logSpy.mockRestore();
    });
  });
  ```

- [ ] **Step 3: Run the test, watch it fail.**
  ```bash
  npx jest lib/observability/__tests__/progress-bridge-llm-delta.test.js -t 'coalesces sub-threshold'
  ```
  Expected: fails — `createProgressFromTrace` has no `llm_delta` branch, so `deltas().length` is `0` after `advanceTimersByTime(250)`.

- [ ] **Step 4: Implement the coalescer.** Add the throttle constants and a module-scope buffer map near the top of `lib/observability/progress-bridge.js`, just after the imports (after line 13):
  ```js
  // ── llm_delta coalescing (P5) ─────────────────────────────────────────────
  // The SDK fires a stream_event per token; forwarding each as its own SSE frame
  // is a firehose. We buffer per (sessionId, context) and flush on whichever
  // comes first: a 250ms timer, 50 accumulated tokens, a phase change, or the
  // terminating llm_complete/llm_error. Flush emits ONE coalesced llm_delta whose
  // deltaText is everything accumulated since the previous flush (replace-not-append
  // on the client) and whose tokenCount/ttftMs are the latest cumulative values.
  const DELTA_FLUSH_MS = 250;
  const DELTA_FLUSH_TOKENS = 50;
  const deltaBuffers = new Map(); // key: `${sessionId}::${context}` -> { phase, text, tokenCount, ttftMs, elapsed, timer }

  function deltaKey(sessionId, context) {
    return `${sessionId}::${context}`;
  }

  function flushDeltaBuffer(sessionId, context) {
    const key = deltaKey(sessionId, context);
    const buf = deltaBuffers.get(key);
    if (!buf) return;
    if (buf.timer) { clearTimeout(buf.timer); buf.timer = null; }
    if (buf.text.length === 0 && buf.tokenCount === 0) {
      deltaBuffers.delete(key);
      return;
    }
    progressEmitter.emitProgress(sessionId, {
      type: SSE_EVENT_TYPES.LLM_DELTA,
      timestamp: new Date().toISOString(),
      context,
      phase: buf.phase,
      deltaText: buf.text,
      tokenCount: buf.tokenCount,
      ttftMs: buf.ttftMs ?? null,
      elapsed: buf.elapsed ?? null
    });
    deltaBuffers.delete(key);
  }

  function pushDelta(sessionId, context, msg) {
    if (!sessionId) return; // console-only logger: no SSE coalescing
    const key = deltaKey(sessionId, context);
    let buf = deltaBuffers.get(key);
    // A phase change flushes the prior buffer so phases never interleave in one frame.
    if (buf && buf.phase !== msg.phase) {
      flushDeltaBuffer(sessionId, context);
      buf = undefined;
    }
    if (!buf) {
      buf = { phase: msg.phase, text: '', tokenCount: 0, ttftMs: msg.ttftMs ?? null, elapsed: null, timer: null };
      deltaBuffers.set(key, buf);
    }
    buf.text += msg.deltaText || '';
    buf.tokenCount = msg.tokenCount ?? buf.tokenCount;
    if (buf.ttftMs == null && msg.ttftMs != null) buf.ttftMs = msg.ttftMs;
    buf.elapsed = msg.elapsed ?? buf.elapsed;
    if (buf.tokenCount >= DELTA_FLUSH_TOKENS) {
      flushDeltaBuffer(sessionId, context);
      return;
    }
    if (!buf.timer) {
      buf.timer = setTimeout(() => flushDeltaBuffer(sessionId, context), DELTA_FLUSH_MS);
    }
  }
  ```
  Then add the `llm_delta` branch inside the returned callback in `createProgressFromTrace`. Insert it immediately BEFORE the `if (msg.type === 'llm_complete')` block (currently line 181) so deltas are handled before the completion path:
  ```js
    if (msg.type === 'llm_delta') {
      // Coalesced into ≤250ms / ≤50-token SSE frames; not logged per-token (firehose).
      pushDelta(sessionId, context, msg);
      return;
    }
  ```
  Then make `llm_complete` and `llm_error` flush any pending buffer first. In the `llm_complete` branch (line 181) add as its FIRST statement:
  ```js
    if (msg.type === 'llm_complete') {
      if (sessionId) flushDeltaBuffer(sessionId, context);   // drain trailing partials before completion
      const responseStr = msg.result === undefined || msg.result === null
  ```
  And in the `llm_error` branch (line 222) add as its FIRST statement:
  ```js
    if (msg.type === 'llm_error') {
      if (sessionId) flushDeltaBuffer(sessionId, context);   // drain trailing partials before the error
      // Same diagnostic envelope as llm_complete, plus the error context.
  ```

- [ ] **Step 5: Re-run the full delta test file, watch it pass.**
  ```bash
  npx jest lib/observability/__tests__/progress-bridge-llm-delta.test.js
  ```
  Expected: 4 passing. Then run the existing bridge test to confirm no regression:
  ```bash
  npx jest lib/observability/__tests__/progress-bridge-undefined-result.test.js
  ```
  Expected: 3 passing.

- [ ] **Step 6: Commit.**
  ```bash
  git add lib/observability/progress-bridge.js lib/observability/__tests__/progress-bridge-llm-delta.test.js
  git commit -m "feat(observability): coalesce llm_delta into ≤250ms/≤50-token SSE frames

Buffer per (session,context); flush on timer, 50-token threshold, phase
change, or terminating llm_complete/llm_error. One coalesced llm_delta
per flush (replace-not-append on client). Part of P5 streaming UI.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P5.2: Pure reducer-transition module for `llmActivity` streaming + `eventLog`

**Files:**
- Create: `console/llm-stream-logic.js` (dual-export pure module: `window.Console.llmStreamLogic` + node `module.exports`)
- Modify: `console/state.js` (lines 9–33 initialState; 35–54 ACTIONS; 85–137 reducer cases — delegate the streaming transitions to the pure module, retire the `.slice(-49)` cap into `eventLog`)
- Test: `__tests__/unit/llm-stream-logic.test.js` (create)

- [ ] **Step 1: Write the failing test FIRST.** Create `__tests__/unit/llm-stream-logic.test.js`:
  ```js
  /**
   * llm-stream-logic.js — pure reducer-transition unit tests (node-env, no DOM/React).
   * Covers SSE_LLM_DELTA accumulation, eventLog append (no .slice(-49) cap),
   * and llmActivity lifecycle (start → delta → complete/error reset).
   */
  const L = require('../../console/llm-stream-logic.js');

  describe('applyLlmStart', () => {
    test('initializes llmActivity with phase=preparing and zeroed liveness', () => {
      const next = L.applyLlmStart({}, { label: 'genOutline', model: 'opus', startTime: 1000 });
      expect(next.phase).toBe('preparing');
      expect(next.label).toBe('genOutline');
      expect(next.model).toBe('opus');
      expect(next.streamText).toBe('');
      expect(next.tokenCount).toBe(0);
      expect(next.ttftMs).toBe(null);
      expect(next.error).toBe(null);
      expect(next.startTime).toBe(1000);
    });
  });

  describe('applyLlmDelta', () => {
    test('appends streamText, advances phase/token/ttft/lastEventAt', () => {
      const a = L.applyLlmStart({}, { label: 'x', model: 'opus', startTime: 0 });
      const b = L.applyLlmDelta(a, { phase: 'thinking', deltaText: 'Hmm ', tokenCount: 3, ttftMs: 110, lastEventAt: 50 });
      expect(b.phase).toBe('thinking');
      expect(b.streamText).toBe('Hmm ');
      expect(b.tokenCount).toBe(3);
      expect(b.ttftMs).toBe(110);
      expect(b.lastEventAt).toBe(50);
      const c = L.applyLlmDelta(b, { phase: 'writing', deltaText: 'Once', tokenCount: 7, ttftMs: 110, lastEventAt: 70 });
      expect(c.phase).toBe('writing');
      expect(c.streamText).toBe('Hmm Once');  // accumulates across phases
      expect(c.tokenCount).toBe(7);
    });
    test('first non-null ttftMs sticks (later nulls do not clobber)', () => {
      const a = L.applyLlmStart({}, { label: 'x', model: 'opus', startTime: 0 });
      const b = L.applyLlmDelta(a, { phase: 'thinking', deltaText: 'a', tokenCount: 1, ttftMs: 99, lastEventAt: 10 });
      const c = L.applyLlmDelta(b, { phase: 'writing', deltaText: 'b', tokenCount: 2, ttftMs: null, lastEventAt: 20 });
      expect(c.ttftMs).toBe(99);
    });
    test('is a no-op-safe transition when there is no active llmActivity', () => {
      const b = L.applyLlmDelta(null, { phase: 'writing', deltaText: 'x', tokenCount: 1, ttftMs: 1, lastEventAt: 1 });
      expect(b.phase).toBe('writing');
      expect(b.streamText).toBe('x');
    });
  });

  describe('applyLlmComplete', () => {
    test('captures lastLlmActivity (with response) and clears live llmActivity', () => {
      const a = L.applyLlmDelta(L.applyLlmStart({}, { label: 'genArticle', model: 'opus', startTime: 0 }),
        { phase: 'writing', deltaText: 'body', tokenCount: 4, ttftMs: 30, lastEventAt: 8 });
      const out = L.applyLlmComplete({ llmActivity: a, lastLlmActivity: null }, { response: { ok: 1 }, elapsed: 2.2 });
      expect(out.llmActivity).toBe(null);
      expect(out.lastLlmActivity.label).toBe('genArticle');
      expect(out.lastLlmActivity.response).toEqual({ ok: 1 });
      expect(out.lastLlmActivity.phase).toBe('done');
      expect(out.lastLlmActivity.completedElapsed).toBe(2.2);
    });
  });

  describe('applyLlmFailure', () => {
    test('marks phase=failed and stamps error on the live activity (card stays mounted)', () => {
      const a = L.applyLlmStart({}, { label: 'genArticle', model: 'opus', startTime: 0 });
      const out = L.applyLlmFailure(a, { error: '401 authentication_error' });
      expect(out.phase).toBe('failed');
      expect(out.error).toBe('401 authentication_error');
    });
  });

  describe('appendEvent (eventLog, no cap)', () => {
    test('appends without the legacy 49-item slice cap', () => {
      let log = [];
      for (let i = 0; i < 120; i++) log = L.appendEvent(log, { kind: 'progress', message: 'm' + i });
      expect(log.length).toBe(120);
      expect(log[0].message).toBe('m0');
      expect(log[119].message).toBe('m119');
      expect(typeof log[0].seq).toBe('number');
      expect(log[1].seq).toBeGreaterThan(log[0].seq);
    });
  });
  ```

- [ ] **Step 2: Run it, watch it fail.**
  ```bash
  npx jest __tests__/unit/llm-stream-logic.test.js -t 'applyLlmStart'
  ```
  Expected: fails — `Cannot find module '../../console/llm-stream-logic.js'`.

- [ ] **Step 3: Implement the pure module.** Create `console/llm-stream-logic.js`:
  ```js
  /**
   * llm-stream-logic.js — PURE reducer-transition helpers for the live LLM stream.
   *
   * Dual-export: window.Console.llmStreamLogic (browser; state.js delegates) AND
   * module.exports (node-env Jest). Per reports/CLAUDE.md, console logic is tested
   * ONLY by extracting it into a dual-export module and unit-testing in node-env.
   *
   * Owns the llmActivity lifecycle: preparing → thinking → writing → done|failed,
   * plus the unbounded eventLog (retires state.js's legacy progressMessages.slice(-49)).
   * No React, no window references except the guarded window.Console write.
   */
  (function () {
    'use strict';

    let _seq = 0;

    function applyLlmStart(_prev, { label, model, startTime, prompt, systemPrompt }) {
      return {
        label: label || 'Processing',
        model: model || 'unknown',
        startTime: startTime ?? Date.now(),
        phase: 'preparing',
        streamText: '',
        tokenCount: 0,
        ttftMs: null,
        lastEventAt: startTime ?? Date.now(),
        error: null,
        prompt: prompt || null,
        systemPrompt: systemPrompt || null,
        response: null
      };
    }

    function applyLlmDelta(activity, { phase, deltaText, tokenCount, ttftMs, lastEventAt }) {
      const base = activity || applyLlmStart(null, { label: 'Processing', model: 'unknown', startTime: Date.now() });
      return {
        ...base,
        phase: phase || base.phase,
        streamText: base.streamText + (deltaText || ''),
        tokenCount: tokenCount != null ? tokenCount : base.tokenCount,
        ttftMs: base.ttftMs != null ? base.ttftMs : (ttftMs != null ? ttftMs : null),
        lastEventAt: lastEventAt != null ? lastEventAt : Date.now(),
        error: null
      };
    }

    function applyLlmComplete(state, { response, elapsed }) {
      const prev = state.llmActivity;
      return {
        lastLlmActivity: prev
          ? { ...prev, phase: 'done', response: response || null, completedElapsed: elapsed ?? null }
          : state.lastLlmActivity,
        llmActivity: null
      };
    }

    function applyLlmFailure(activity, { error }) {
      const base = activity || applyLlmStart(null, { label: 'Processing', model: 'unknown', startTime: Date.now() });
      return { ...base, phase: 'failed', error: error || 'LLM call failed' };
    }

    function appendEvent(eventLog, entry) {
      // No cap. The macro feed is a proper scrollable log (P5 design); the legacy
      // progressMessages.slice(-49) arbitrary cap is retired here.
      const list = Array.isArray(eventLog) ? eventLog : [];
      return [...list, { seq: _seq++, ts: Date.now(), ...entry }];
    }

    const api = {
      applyLlmStart,
      applyLlmDelta,
      applyLlmComplete,
      applyLlmFailure,
      appendEvent
    };

    if (typeof window !== 'undefined') {
      window.Console = window.Console || {};
      window.Console.llmStreamLogic = api;
    }
    if (typeof module !== 'undefined' && module.exports) {
      module.exports = api;
    }
  })();
  ```

- [ ] **Step 4: Re-run, watch it pass.**
  ```bash
  npx jest __tests__/unit/llm-stream-logic.test.js
  ```
  Expected: all describe-blocks green (applyLlmStart, applyLlmDelta ×3, applyLlmComplete, applyLlmFailure, appendEvent).

- [ ] **Step 5: Wire state.js to the pure module.** First add `eventLog` + the new `llmActivity` shape to `initialState` in `console/state.js`. Replace lines 22–23:
  ```js
    progressMessages: [],
    llmActivity: null,       // { label, model, startTime, prompt, systemPrompt, response } or null
  ```
  with:
  ```js
    progressMessages: [],    // DEPRECATED: retained for any legacy reader; eventLog is authoritative
    eventLog: [],            // unbounded scrollable macro feed (retires the .slice(-49) cap)
    llmActivity: null,       // { label, model, startTime, phase, streamText, tokenCount, ttftMs, lastEventAt, error, response } or null
  ```
  Add the two new actions to `ACTIONS` — replace lines 43–44:
  ```js
    SSE_LLM_START: 'SSE_LLM_START',
    SSE_LLM_COMPLETE: 'SSE_LLM_COMPLETE',
  ```
  with:
  ```js
    SSE_LLM_START: 'SSE_LLM_START',
    SSE_LLM_DELTA: 'SSE_LLM_DELTA',
    SSE_LLM_COMPLETE: 'SSE_LLM_COMPLETE',
    SSE_LLM_FAILURE: 'SSE_LLM_FAILURE',
  ```
  At the very top of `console/state.js`, just after `window.Console = window.Console || {};` (line 7), grab the pure module:
  ```js
  window.Console = window.Console || {};

  // Pure transition logic for the live LLM stream (dual-export, node-tested).
  // Must load BEFORE state.js in index.html (script-tag order).
  const StreamLogic = window.Console.llmStreamLogic;
  ```

- [ ] **Step 6: Replace the reducer cases to delegate.** In `console/state.js`, replace the `PROCESSING_START` case (lines 85–92):
  ```js
      case ACTIONS.PROCESSING_START:
        return {
          ...state,
          processing: true,
          progressMessages: [],
          llmActivity: null,
          error: null
        };
  ```
  with:
  ```js
      case ACTIONS.PROCESSING_START:
        return {
          ...state,
          processing: true,
          progressMessages: [],
          eventLog: [],
          llmActivity: null,
          error: null
        };
  ```
  Replace the `SSE_PROGRESS` case (lines 97–101):
  ```js
      case ACTIONS.SSE_PROGRESS:
        return {
          ...state,
          progressMessages: [...state.progressMessages.slice(-49), action.message]
        };
  ```
  with (retire the cap into the unbounded eventLog):
  ```js
      case ACTIONS.SSE_PROGRESS:
        return {
          ...state,
          eventLog: StreamLogic.appendEvent(state.eventLog, { kind: 'progress', message: action.message })
        };
  ```
  Replace the `SSE_LLM_START` case (lines 103–114):
  ```js
      case ACTIONS.SSE_LLM_START:
        return {
          ...state,
          llmActivity: {
            label: action.label,
            model: action.model,
            startTime: Date.now(),
            prompt: action.prompt || null,
            systemPrompt: action.systemPrompt || null,
            response: null
          }
        };
  ```
  with:
  ```js
      case ACTIONS.SSE_LLM_START:
        return {
          ...state,
          llmActivity: StreamLogic.applyLlmStart(state.llmActivity, {
            label: action.label,
            model: action.model,
            startTime: Date.now(),
            prompt: action.prompt,
            systemPrompt: action.systemPrompt
          })
        };

      case ACTIONS.SSE_LLM_DELTA:
        return {
          ...state,
          llmActivity: StreamLogic.applyLlmDelta(state.llmActivity, {
            phase: action.phase,
            deltaText: action.deltaText,
            tokenCount: action.tokenCount,
            ttftMs: action.ttftMs,
            lastEventAt: Date.now()
          })
        };

      case ACTIONS.SSE_LLM_FAILURE:
        return {
          ...state,
          llmActivity: StreamLogic.applyLlmFailure(state.llmActivity, { error: action.error }),
          eventLog: StreamLogic.appendEvent(state.eventLog, { kind: 'error', message: action.error })
        };
  ```
  Replace the `SSE_LLM_COMPLETE` case (lines 116–126):
  ```js
      case ACTIONS.SSE_LLM_COMPLETE:
        return {
          ...state,
          // Preserve last LLM activity with response for the collapsible panel
          lastLlmActivity: state.llmActivity ? {
            ...state.llmActivity,
            response: action.response || null,
            completedElapsed: action.elapsed || null
          } : state.lastLlmActivity,
          llmActivity: null
        };
  ```
  with:
  ```js
      case ACTIONS.SSE_LLM_COMPLETE:
        return {
          ...state,
          ...StreamLogic.applyLlmComplete(state, {
            response: action.response,
            elapsed: action.elapsed
          })
        };
  ```

- [ ] **Step 7: Confirm node still parses state.js delegation logic indirectly.** `state.js` references `React`/`window` so it is browser-only and not node-required directly — its delegated logic is covered by the pure-module test from Step 4. Re-run the pure test plus the existing console pure-logic test to confirm no breakage:
  ```bash
  npx jest __tests__/unit/llm-stream-logic.test.js __tests__/unit/outline-edit-logic.test.js
  ```
  Expected: both files green.

- [ ] **Step 8: Add the script tag before state.js.** In `console/index.html`, find the `<script type="text/babel" src="state.js">` tag and add the new module immediately before it. Run this to locate the exact line:
  ```bash
  grep -n "state.js\|outline-edit-logic.js" console/index.html
  ```
  Then add, on the line BEFORE the `state.js` script tag:
  ```html
      <script type="text/babel" src="llm-stream-logic.js"></script>
  ```
  (Mirror the indentation and `type` of the adjacent `outline-edit-logic.js` tag found by the grep — `outline-edit-logic.js` already loads before `state.js`, so place `llm-stream-logic.js` alongside it.)

- [ ] **Step 9: Commit.**
  ```bash
  git add console/llm-stream-logic.js __tests__/unit/llm-stream-logic.test.js console/state.js console/index.html
  git commit -m "feat(console): live LLM stream state — phases, token liveness, unbounded eventLog

New dual-export llm-stream-logic.js owns the preparing→thinking→writing→
done|failed lifecycle, streamText accumulation, ttft/token liveness, and an
uncapped eventLog. state.js delegates SSE_LLM_START/DELTA/COMPLETE/
FAILURE to it and retires the progressMessages.slice(-49) cap. Part of P5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P5.3: Route `llm_delta` / `failed` through api.js + app.js into the new actions

**Files:**
- Modify: `console/api.js` (lines 176–193 — the `switch (type)` allowlist forwarding SSE event types)
- Modify: `console/app.js` (lines 83–162 — the SSE event dispatch switch inside `handleApprove`; lines 139–152 — the `complete` outcome parse)
- Test: manual browser verification (React component wiring has no node-env harness per reports/CLAUDE.md). No node test asserts on `app.js`/`api.js` wiring; the pure transitions they invoke are already covered by Task P5.2.

- [ ] **Step 1: Forward the new event types in api.js.** In `console/api.js`, replace the `case` allowlist (lines 182–189):
  ```js
            case 'progress':
            case 'llm_start':
            case 'llm_complete':
            case 'complete':
            case 'error':
            case 'heartbeat':
              if (onProgress) onProgress({ type, data });
              break;
  ```
  with:
  ```js
            case 'progress':
            case 'llm_start':
            case 'llm_delta':
            case 'llm_complete':
            case 'llm_error':
            case 'complete':
            case 'error':
            case 'heartbeat':
              if (onProgress) onProgress({ type, data });
              break;
  ```
  (Note: the `default` branch already forwards any other type, so `llm_delta` reaches `onProgress` even without the explicit case — adding it makes the contract explicit and self-documenting.)

- [ ] **Step 2: Dispatch the new events in app.js.** In `console/app.js`, inside `handleApprove`'s SSE switch, add two cases immediately after the `case 'llm_start':` block (after line 101, before `case 'llm_complete':`):
  ```js
              case 'llm_delta':
                dispatch({
                  type: APP_ACTIONS.SSE_LLM_DELTA,
                  phase: event.data.phase || 'writing',
                  deltaText: event.data.deltaText || '',
                  tokenCount: event.data.tokenCount,
                  ttftMs: event.data.ttftMs
                });
                break;
  ```

- [ ] **Step 3: Surface a `failed` currentPhase as an inline failure (not a banner).** In `console/app.js`, the `case 'complete':` outcome parse currently handles `interrupted`, `currentPhase === 'complete'`, and `currentPhase === 'error'` (lines 132–152). Add a `failed` branch (P4 introduces a distinct `failed` currentPhase) that drives the inline failure card via `SSE_LLM_FAILURE`. Insert after the `else if (result.currentPhase === 'error') { ... }` block (after line 152), before the closing `}` of the `case 'complete':`:
  ```js
                } else if (result.currentPhase === 'failed') {
                  // P4 distinct terminal: a node failed unrecoverably mid-run.
                  // Drive the inline failure card (Retry=/resume, Roll back) rather
                  // than the generic error banner. Keep checkpointType so the macro
                  // stepper stays anchored on the phase the operator was at.
                  dispatch({
                    type: APP_ACTIONS.SSE_LLM_FAILURE,
                    error: (result.error || 'Workflow failed') +
                      (result.details ? ' — ' + result.details : '')
                  });
                  dispatch({ type: APP_ACTIONS.PROCESSING_START_DONE = undefined }); // no-op placeholder removed below
  ```
  Then remove the placeholder line and instead clear `processing` correctly. The clean version of the inserted branch is:
  ```js
                } else if (result.currentPhase === 'failed') {
                  dispatch({
                    type: APP_ACTIONS.SSE_LLM_FAILURE,
                    error: (result.error || 'Workflow failed') +
                      (result.details ? ' — ' + result.details : '')
                  });
                  dispatch({ type: APP_ACTIONS.SET_PROCESSING_DONE });
  ```
  This needs a tiny action to clear `processing` without wiping the failed `llmActivity` (the existing `SSE_COMPLETE` already ran above at line 128 and set `processing:false`, so the failure card is shown by `ProgressStream` only if it stays mounted — see P5.4 Step 4). Since `SSE_COMPLETE` already cleared `processing`, DROP the extra dispatch — the final branch is simply:
  ```js
                } else if (result.currentPhase === 'failed') {
                  // SSE_COMPLETE above already set processing:false. Stamp the failure
                  // onto llmActivity so the inline failure card renders; keep
                  // checkpointType so the macro stepper + Retry/Roll back stay in context.
                  dispatch({
                    type: APP_ACTIONS.SSE_LLM_FAILURE,
                    error: (result.error || 'Workflow failed') +
                      (result.details ? ' — ' + result.details : '')
                  });
                }
  ```
  Apply ONLY this final clean form (ignore the two intermediate drafts above — they were the reasoning).

- [ ] **Step 4: Verify no syntax errors via babel transform.** The console scripts are Babel-standalone in the browser, but we can lint-parse `app.js` with node's parser to catch syntax mistakes (it will fail on JSX-free plain JS — `app.js` uses `React.createElement`, no JSX, so it parses):
  ```bash
  node --check console/app.js && echo "app.js OK"
  node --check console/api.js && echo "api.js OK"
  ```
  Expected: `app.js OK` and `api.js OK`. (If `app.js` uses any JSX it would fail — confirmed it uses `React.createElement` only.)

- [ ] **Step 5: Manual browser verification (no automated harness).** With P3 landed, start the server and run a session to a generation node:
  ```bash
  npm start
  ```
  In `http://localhost:3001/console`, start a session and approve through to an LLM-calling phase. Confirm by eye: (a) the live feed text streams in as tokens arrive, (b) the token counter ticks, (c) on a `failed` terminal the inline failure card appears with [Retry]/[Roll back]. Document the click-path result in the PR description (this is the only verification path for React wiring per reports/CLAUDE.md).

- [ ] **Step 6: Commit.**
  ```bash
  git add console/api.js console/app.js
  git commit -m "feat(console): route llm_delta SSE events and failed terminal into stream state

api.js forwards llm_delta/llm_error explicitly; app.js dispatches
SSE_LLM_DELTA and maps the P4 'failed' currentPhase to an inline failure
card via SSE_LLM_FAILURE. Wiring verified manually (no node-env React
harness). Part of P5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task P5.4: ProgressStream — four-phase live feed, raw auto-scroll stream, token/TTFT counter, inline failure card; macro stepper stays above

**Files:**
- Modify: `console/components/ProgressStream.js` (full rewrite of the body — currently lines 13–105; add phase ribbon, raw stream pane with auto-scroll, liveness counter, failure card)
- Modify: `console/app.js` (lines 235–242 — render `PipelineProgress` ABOVE `ProgressStream` during processing; pass the new props + handlers)
- Modify: `console/console.css` (append the `progress-stream__*` phase/stream/failure styles)
- Test: manual browser verification (component rendering has no node-env harness). The phase-label/derived-state helper is extracted into the pure module and node-tested below.

- [ ] **Step 1: Add a pure phase-presentation helper to the dual-export module (node-tested).** Append to `console/llm-stream-logic.js`'s `api` surface a `describePhase` helper so the label/derivation logic is testable. First add the failing test to `__tests__/unit/llm-stream-logic.test.js`:
  ```js
  describe('describePhase', () => {
    test('maps each phase to label + active flags', () => {
      expect(L.describePhase('preparing').label).toBe('Preparing');
      expect(L.describePhase('thinking').label).toBe('Thinking');
      expect(L.describePhase('writing').label).toBe('Writing');
      expect(L.describePhase('done').label).toBe('Done');
      expect(L.describePhase('failed').label).toBe('Failed');
      expect(L.describePhase('failed').isError).toBe(true);
      expect(L.describePhase('writing').isError).toBe(false);
    });
    test('ordered phase list for the ribbon, failed excluded from the happy path', () => {
      expect(L.phaseOrder()).toEqual(['preparing', 'thinking', 'writing', 'done']);
    });
    test('isPhaseReached: writing reaches preparing+thinking but not done', () => {
      expect(L.isPhaseReached('writing', 'preparing')).toBe(true);
      expect(L.isPhaseReached('writing', 'thinking')).toBe(true);
      expect(L.isPhaseReached('writing', 'writing')).toBe(true);
      expect(L.isPhaseReached('writing', 'done')).toBe(false);
    });
  });
  ```
  Run it, watch it fail:
  ```bash
  npx jest __tests__/unit/llm-stream-logic.test.js -t 'describePhase'
  ```
  Expected: fails — `L.describePhase is not a function`.

- [ ] **Step 2: Implement the helpers in the pure module.** In `console/llm-stream-logic.js`, before the `const api = {` line, add:
  ```js
    const PHASE_LABELS = {
      preparing: 'Preparing',
      thinking: 'Thinking',
      writing: 'Writing',
      done: 'Done',
      failed: 'Failed'
    };
    const PHASE_ORDER = ['preparing', 'thinking', 'writing', 'done'];

    function describePhase(phase) {
      return {
        key: phase,
        label: PHASE_LABELS[phase] || 'Processing',
        isError: phase === 'failed',
        isDone: phase === 'done'
      };
    }
    function phaseOrder() {
      return PHASE_ORDER.slice();
    }
    function isPhaseReached(currentPhase, candidatePhase) {
      const ci = PHASE_ORDER.indexOf(currentPhase);
      const pi = PHASE_ORDER.indexOf(candidatePhase);
      if (ci === -1 || pi === -1) return false;
      return pi <= ci;
    }
  ```
  Then add them to the `api` object:
  ```js
    const api = {
      applyLlmStart,
      applyLlmDelta,
      applyLlmComplete,
      applyLlmFailure,
      appendEvent,
      describePhase,
      phaseOrder,
      isPhaseReached
    };
  ```
  Re-run, watch pass:
  ```bash
  npx jest __tests__/unit/llm-stream-logic.test.js -t 'describePhase'
  npx jest __tests__/unit/llm-stream-logic.test.js -t 'isPhaseReached'
  npx jest __tests__/unit/llm-stream-logic.test.js -t 'ordered phase list'
  ```
  Expected: all three green.

- [ ] **Step 3: Rewrite ProgressStream.js.** Replace the entire body of `console/components/ProgressStream.js` (lines 1–107) with:
  ```js
  /**
   * ProgressStream Component
   * Live LLM call feed: four-phase ribbon (preparing→thinking→writing→done|failed),
   * a raw auto-scrolling token stream, a token/TTFT liveness counter, the scrollable
   * macro event log, and an inline failure card with [Retry] (=/resume) / [Roll back].
   * Exports to window.Console.ProgressStream
   */

  window.Console = window.Console || {};

  const { formatElapsed, CollapsibleSection, safeStringify } = window.Console.utils;
  const StreamLogicView = window.Console.llmStreamLogic;

  function ProgressStream({ processing, llmActivity, lastLlmActivity, eventLog, onRetry, onRollback }) {
    const [elapsed, setElapsed] = React.useState(0);
    const streamRef = React.useRef(null);

    // Liveness: tick every second while a call is active and not failed.
    React.useEffect(() => {
      if (!llmActivity || !llmActivity.startTime || llmActivity.phase === 'failed') {
        return;
      }
      setElapsed(Date.now() - llmActivity.startTime);
      const interval = setInterval(() => {
        setElapsed(Date.now() - llmActivity.startTime);
      }, 1000);
      return () => clearInterval(interval);
    }, [llmActivity]);

    // Auto-scroll the raw stream pane to the newest token.
    React.useEffect(() => {
      if (streamRef.current) {
        streamRef.current.scrollTop = streamRef.current.scrollHeight;
      }
    }, [llmActivity && llmActivity.streamText]);

    if (!processing && !(llmActivity && llmActivity.phase === 'failed')) return null;

    const phase = llmActivity ? llmActivity.phase : 'preparing';
    const failed = phase === 'failed';
    const order = StreamLogicView.phaseOrder();
    const recentEvents = (eventLog || []).slice(-12);

    return React.createElement('div', { className: 'progress-stream glass-panel fade-in' },

      // ── Phase ribbon: preparing → thinking → writing → done|failed ──
      React.createElement('div', { className: 'progress-phases', role: 'list', 'aria-label': 'LLM call phase' },
        order.map((p) => {
          const d = StreamLogicView.describePhase(p);
          const reached = StreamLogicView.isPhaseReached(phase, p);
          const active = phase === p;
          return React.createElement('div', {
            key: p,
            role: 'listitem',
            className: 'progress-phases__step'
              + (reached ? ' progress-phases__step--reached' : '')
              + (active ? ' progress-phases__step--active' : '')
          }, d.label);
        }),
        failed && React.createElement('div', {
          role: 'listitem',
          className: 'progress-phases__step progress-phases__step--failed'
        }, 'Failed')
      ),

      // ── Operation label + model ──
      React.createElement('div', { className: 'progress-operation' },
        React.createElement('span', { className: 'progress-operation__label' },
          (llmActivity && llmActivity.label) || 'Processing'),
        llmActivity && llmActivity.model && React.createElement('span', {
          className: 'progress-operation__model badge badge--cyan'
        }, llmActivity.model)
      ),

      // ── Liveness counter: elapsed · tokens · ttft ──
      llmActivity && !failed && React.createElement('div', { className: 'progress-liveness' },
        React.createElement('span', { className: 'progress-liveness__elapsed' }, formatElapsed(elapsed)),
        React.createElement('span', { className: 'progress-liveness__sep' }, '·'),
        React.createElement('span', { className: 'progress-liveness__tokens' },
          (llmActivity.tokenCount || 0) + ' tok'),
        llmActivity.ttftMs != null && React.createElement(React.Fragment, null,
          React.createElement('span', { className: 'progress-liveness__sep' }, '·'),
          React.createElement('span', { className: 'progress-liveness__ttft' },
            'ttft ' + llmActivity.ttftMs + 'ms')
        )
      ),

      // ── Raw live token stream (auto-scroll). Structured calls stream raw JSON — chosen transparency. ──
      llmActivity && llmActivity.streamText && React.createElement('pre', {
        className: 'progress-stream__raw',
        ref: streamRef,
        'aria-label': 'Live model output'
      }, llmActivity.streamText),

      // ── Inline failure card ──
      failed && React.createElement('div', { className: 'progress-failure', role: 'alert' },
        React.createElement('div', { className: 'progress-failure__title' },
          '\u274C ' + (llmActivity.error || 'LLM call failed')),
        React.createElement('div', { className: 'progress-failure__actions' },
          React.createElement('button', {
            className: 'btn btn-primary',
            onClick: () => onRetry && onRetry(),
            'aria-label': 'Retry the failed step'
          }, 'Retry'),
          React.createElement('button', {
            className: 'btn btn-ghost',
            onClick: () => onRollback && onRollback(),
            'aria-label': 'Roll back to an earlier checkpoint'
          }, 'Roll back')
        )
      ),

      // ── Scrollable macro event log (retired .slice(-49) cap) ──
      recentEvents.length > 0 && React.createElement('div', { className: 'progress-eventlog' },
        recentEvents.map((ev) =>
          React.createElement('div', {
            key: ev.seq,
            className: 'progress-eventlog__item progress-eventlog__item--' + (ev.kind || 'progress')
          }, ev.message)
        )
      ),

      // ── Collapsible last-completed details (prompt/response) ──
      lastLlmActivity && React.createElement(CollapsibleSection, {
        title: 'Last call details',
        defaultOpen: false
      },
        React.createElement('pre', { className: 'progress-llm-panel__content' },
          typeof lastLlmActivity.response === 'string'
            ? lastLlmActivity.response
            : safeStringify(lastLlmActivity.response || lastLlmActivity)
        )
      )
    );
  }

  window.Console.ProgressStream = ProgressStream;
  ```

- [ ] **Step 4: Render the macro stepper ABOVE the live feed and pass handlers.** In `console/app.js`, replace the `else if (state.processing)` content block (lines 235–242):
  ```js
    } else if (state.processing) {
      // Processing: show ProgressStream with real-time SSE data
      content = React.createElement(ProgressStream, {
        processing: state.processing,
        llmActivity: state.llmActivity,
        lastLlmActivity: state.lastLlmActivity,
        progressMessages: state.progressMessages
      });
    } else if (state.completedResult) {
  ```
  with (macro stepper stays visible above the feed during processing, and the failure card's handlers wire to `/resume` and the rollback modal):
  ```js
    } else if (state.processing || (state.llmActivity && state.llmActivity.phase === 'failed')) {
      // Processing (or a terminal failure card): macro stepper ABOVE the live feed.
      content = React.createElement(React.Fragment, null,
        // Keep the macro stepper anchored on the operator's current phase.
        state.checkpointType && React.createElement(PipelineProgress, {
          currentCheckpoint: state.checkpointType,
          onRollback: (target) => setRollbackTarget(target)
        }),
        React.createElement(ProgressStream, {
          processing: state.processing,
          llmActivity: state.llmActivity,
          lastLlmActivity: state.lastLlmActivity,
          eventLog: state.eventLog,
          // [Retry] = re-run the failed node (P2 resume semantics).
          onRetry: async () => {
            if (!state.sessionId) return;
            dispatch({ type: APP_ACTIONS.PROCESSING_START });
            try {
              const result = await appApi.resume(state.sessionId);
              if (result.error) {
                dispatch({ type: APP_ACTIONS.SET_ERROR, message: result.error });
              } else if (result.interrupted && result.checkpoint) {
                dispatch({
                  type: APP_ACTIONS.CHECKPOINT_RECEIVED,
                  checkpointType: result.checkpoint.type,
                  data: result.checkpoint,
                  phase: result.currentPhase
                });
              } else if (result.currentPhase === 'complete') {
                dispatch({ type: APP_ACTIONS.WORKFLOW_COMPLETE, result });
              }
            } catch (err) {
              dispatch({ type: APP_ACTIONS.SSE_ERROR, message: 'Retry failed: ' + (err.message || 'Unknown error') });
            }
          },
          // [Roll back] = open the existing rollback modal at the current checkpoint.
          onRollback: () => setRollbackTarget(state.checkpointType)
        })
      );
    } else if (state.completedResult) {
  ```

- [ ] **Step 5: Append CSS.** Add to the end of `console/console.css`:
  ```css
  /* ── P5: live LLM stream UI ───────────────────────────────────────────── */
  .progress-phases {
    display: flex;
    gap: var(--space-xs, 8px);
    margin-bottom: var(--space-md, 16px);
    flex-wrap: wrap;
  }
  .progress-phases__step {
    padding: 2px 10px;
    border-radius: 999px;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted, #8a8f99);
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
    opacity: 0.5;
  }
  .progress-phases__step--reached { opacity: 1; color: var(--text, #e6e8ec); }
  .progress-phases__step--active {
    border-color: var(--accent-cyan, #38bdf8);
    color: var(--accent-cyan, #38bdf8);
    box-shadow: 0 0 0 1px var(--accent-cyan, #38bdf8) inset;
  }
  .progress-phases__step--failed {
    border-color: var(--accent-red, #f87171);
    color: var(--accent-red, #f87171);
    opacity: 1;
  }
  .progress-liveness {
    display: flex;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    color: var(--text-muted, #8a8f99);
    margin: 4px 0 10px;
  }
  .progress-liveness__sep { opacity: 0.5; }
  .progress-retry-note {
    font-size: 0.8rem;
    color: var(--accent-amber, #fbbf24);
    margin-bottom: 8px;
  }
  .progress-stream__raw {
    max-height: 240px;
    overflow-y: auto;
    background: var(--surface-sunken, rgba(0, 0, 0, 0.35));
    border: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
    border-radius: 8px;
    padding: 10px 12px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.78rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--text, #e6e8ec);
    margin-bottom: 12px;
  }
  .progress-failure {
    border: 1px solid var(--accent-red, #f87171);
    border-radius: 8px;
    padding: 12px 14px;
    background: rgba(248, 113, 113, 0.08);
    margin-bottom: 12px;
  }
  .progress-failure__title {
    color: var(--accent-red, #f87171);
    font-weight: 600;
    margin-bottom: 10px;
    word-break: break-word;
  }
  .progress-failure__actions { display: flex; gap: 8px; }
  .progress-eventlog {
    max-height: 180px;
    overflow-y: auto;
    border-top: 1px solid var(--border-subtle, rgba(255, 255, 255, 0.12));
    padding-top: 8px;
  }
  .progress-eventlog__item {
    font-size: 0.76rem;
    color: var(--text-muted, #8a8f99);
    padding: 1px 0;
  }
  .progress-eventlog__item--error { color: var(--accent-red, #f87171); }
  .progress-eventlog__item--retry { color: var(--accent-amber, #fbbf24); }
  ```

- [ ] **Step 6: Syntax-check the rewritten files.**
  ```bash
  node --check console/components/ProgressStream.js && echo "ProgressStream OK"
  node --check console/app.js && echo "app.js OK"
  npx jest __tests__/unit/llm-stream-logic.test.js
  ```
  Expected: `ProgressStream OK`, `app.js OK`, and the full pure-logic test file green.

- [ ] **Step 7: Manual browser verification (only path for component wiring).** `npm start`, open `/console`, drive a session to an LLM phase. Confirm by eye: (1) the phase ribbon advances preparing→thinking→writing; (2) the raw stream pane fills and auto-scrolls; (3) the token counter + ttft tick; (4) the macro `PipelineProgress` stepper stays visible ABOVE the feed; (5) forcing a terminal failure (e.g. invalid Notion token) shows the inline failure card with working [Retry] (calls `/resume`) and [Roll back] (opens the modal). Record the click-through outcome in the PR description.

- [ ] **Step 8: Commit.**
  ```bash
  git add console/components/ProgressStream.js console/app.js console/console.css console/llm-stream-logic.js __tests__/unit/llm-stream-logic.test.js
  git commit -m "feat(console): live ProgressStream — phase ribbon, raw auto-scroll stream, liveness, failure card

Four-phase ribbon (preparing→thinking→writing→done|failed), raw token stream
with auto-scroll, token/ttft liveness counter, scrollable eventLog, and an
inline failure card whose [Retry] calls /resume (P2 re-run) and [Roll back]
opens the rollback modal. Macro PipelineProgress renders ABOVE the feed during
processing. describePhase/phaseOrder/isPhaseReached are node-tested; component
wiring verified manually. Part of P5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Phase P6: Rollback / recovery correctness

Goal: Every rollback re-pauses its own checkpoint and clears all downstream-produced state, with a completeness test that guards the hand-maintained `ROLLBACK_CLEARS` denylist against future drift.

Dependencies: None hard. Lands independently of the durable-execution spine (P1–P5). Touches `lib/workflow/state.js` and `lib/api-helpers.js` (the latter is also touched by the security phase's `confineToBase` addition — coordinate the merge on `api-helpers.js`, but the code regions are disjoint). Best sequenced AFTER the durable checkpointer (P1) is live so a re-paused rollback actually persists, but the correctness fixes and tests here do not require it.

### Task P6.1: `await-roster` and `input-review` rollback must clear `roster` + `rosterPronouns` so the checkpoint re-pauses (ROLL-1, ROLL-3)

**Files:**
- Modify: `lib/workflow/state.js:881-890` (`ROLLBACK_CLEARS['await-roster']`)
- Modify: `lib/workflow/state.js:851-868` (`ROLLBACK_CLEARS['input-review']`)
- Test: `lib/__tests__/api-helpers.test.js` (extend existing `buildRollbackState` describe block)

- [ ] **Step 1: Write the failing test FIRST.** Append a new describe block to `lib/__tests__/api-helpers.test.js` right after the existing `buildRollbackState` describe (after line 123, before the `createGraphAndConfig` divider at line 125):

```javascript
// ═══════════════════════════════════════════════════════
// buildRollbackState — re-pause correctness (ROLL-1/ROLL-3)
// ═══════════════════════════════════════════════════════

describe('buildRollbackState re-pause correctness', () => {
  test("await-roster nulls roster so checkpointAwaitRoster re-pauses (ROLL-1)", () => {
    const state = buildRollbackState('await-roster');
    // checkpointAwaitRoster skips on state.roster?.length > 0 — must be cleared
    expect(state).toHaveProperty('roster', null);
    expect(state).toHaveProperty('rosterPronouns', null);
  });

  test('input-review nulls roster + rosterPronouns (ROLL-3 — compounds ROLL-1)', () => {
    const state = buildRollbackState('input-review');
    expect(state).toHaveProperty('roster', null);
    expect(state).toHaveProperty('rosterPronouns', null);
  });

  test('await-roster still clears its existing downstream fields', () => {
    const state = buildRollbackState('await-roster');
    expect(state).toHaveProperty('whiteboardAnalysis', null);
    expect(state).toHaveProperty('evidenceBundle', null);
    expect(state).toHaveProperty('selectedArcs', null);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js -t "re-pause correctness"`
  - Expected: 2 failures — `await-roster nulls roster...` and `input-review nulls roster...` fail with `Expected path: "roster" ... Received: undefined` (the field is not in either clear list). The "still clears its existing downstream fields" test passes.

- [ ] **Step 3: Add `roster` + `rosterPronouns` to `ROLLBACK_CLEARS['await-roster']`.** In `lib/workflow/state.js`, change the `await-roster` block:

```javascript
  // Phase 1.51: Await roster (incremental input)
  'await-roster': [
    'whiteboardAnalysis',
    'characterIdMappings',
```

to:

```javascript
  // Phase 1.51: Await roster (incremental input)
  // ROLL-1: clear roster + rosterPronouns so checkpointAwaitRoster (skip on
  // state.roster?.length > 0) re-pauses instead of silently reusing stale input.
  'await-roster': [
    'roster', 'rosterPronouns',
    'whiteboardAnalysis',
    'characterIdMappings',
```

- [ ] **Step 4: Add `roster` + `rosterPronouns` to `ROLLBACK_CLEARS['input-review']`.** In `lib/workflow/state.js`, change the `input-review` block opening:

```javascript
  // Phase 0.2: Input review - clears everything (essentially fresh start)
  'input-review': [
    // Input phase outputs
    'sessionConfig', 'directorNotes', 'playerFocus',
```

to:

```javascript
  // Phase 0.2: Input review - clears everything (essentially fresh start)
  'input-review': [
    // Input phase outputs
    'sessionConfig', 'directorNotes', 'playerFocus',
    // ROLL-3: incremental-input roster must clear too, else await-roster reuses stale roster
    'roster', 'rosterPronouns',
```

- [ ] **Step 5: Re-run the test, confirm it passes.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js -t "re-pause correctness"`
  - Expected: 3 passing in this describe block, 0 failing.

- [ ] **Step 6: Run the full api-helpers suite to confirm no regression** (the existing "does not include extra unexpected fields" test only checks `article`, so the new keys won't break it).
  - Command: `npx jest lib/__tests__/api-helpers.test.js`
  - Expected: all tests pass (existing + 3 new).

- [ ] **Step 7: Commit.**
  - Command: `git add lib/workflow/state.js lib/__tests__/api-helpers.test.js && git commit -m "fix(rollback): clear roster/rosterPronouns on await-roster + input-review rollback (ROLL-1/ROLL-3)

checkpointAwaitRoster skips on state.roster?.length > 0, so a rollback that left
roster intact silently reused stale input. Add roster + rosterPronouns to both
clear lists so the checkpoint re-pauses.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

### Task P6.2: `arc-selection` (and upstream points) rollback must clear `arcEvidencePackages` so it rebuilds for the new arcs (ROLL-2)

**Files:**
- Modify: `lib/workflow/state.js:851-948` (`input-review`, `paper-evidence-selection`, `await-roster`, `character-ids`, `pre-curation`, `evidence-and-photos`, `arc-selection` blocks)
- Test: `lib/__tests__/api-helpers.test.js` (extend the re-pause describe block from P6.1)

- [ ] **Step 1: Write the failing test FIRST.** Append to the `buildRollbackState re-pause correctness` describe added in P6.1:

```javascript
  test('arc-selection clears arcEvidencePackages so it rebuilds for new arcs (ROLL-2)', () => {
    const state = buildRollbackState('arc-selection');
    // buildArcEvidencePackages skips when state.arcEvidencePackages.length > 0 —
    // re-picking arcs must NOT reuse evidence packaged for the OLD arcs.
    expect(state).toHaveProperty('arcEvidencePackages', null);
  });

  test('every rollback point at/upstream of arc-selection clears arcEvidencePackages', () => {
    const upstreamOfPackages = [
      'input-review', 'paper-evidence-selection', 'await-roster',
      'character-ids', 'pre-curation', 'evidence-and-photos', 'arc-selection'
    ];
    for (const point of upstreamOfPackages) {
      const state = buildRollbackState(point);
      expect(state).toHaveProperty('arcEvidencePackages', null);
    }
  });
```

- [ ] **Step 2: Run the test, confirm it fails.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js -t "arcEvidencePackages"`
  - Expected: both tests fail — `arcEvidencePackages` is in no clear list (state.js:418 annotation exists, but it's absent from `ROLLBACK_CLEARS`), so `state.arcEvidencePackages` is `undefined`, not `null`.

- [ ] **Step 3: Add `arcEvidencePackages` to the `arc-selection` clear list.** In `lib/workflow/state.js`, change:

```javascript
  // Phase 2.3: Arc selection - most common rollback point
  'arc-selection': [
    'narrativeTensions',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
```

to:

```javascript
  // Phase 2.3: Arc selection - most common rollback point
  // ROLL-2: arcEvidencePackages is built post-selection (buildArcEvidencePackages
  // skips when non-empty); re-picking arcs must clear it or the article quotes the
  // wrong storyline's evidence.
  'arc-selection': [
    'narrativeTensions',
    'arcEvidencePackages',
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
```

- [ ] **Step 4: Add `arcEvidencePackages` to every upstream point that already clears `selectedArcs`.** These six blocks all clear `selectedArcs` and thus must also clear the packages derived from it. In `lib/workflow/state.js`, in each of the `input-review`, `paper-evidence-selection`, `await-roster`, `character-ids`, `pre-curation`, and `evidence-and-photos` blocks, find the line:

```javascript
    'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
```

and replace it (in each of those six blocks) with:

```javascript
    'arcEvidencePackages', 'specialistAnalyses', 'narrativeArcs', 'selectedArcs', '_arcAnalysisCache', '_arcFeedback',
```

(Use `replace_all` is unsafe here because `arc-selection` already got its own edit in Step 3 — apply this string edit to the six blocks that still carry the un-prefixed line. Verify with the count command in Step 5.)

- [ ] **Step 5: Verify exactly the right number of clear lists now reference `arcEvidencePackages`.** `arc-selection`, `input-review`, `paper-evidence-selection`, `await-roster`, `character-ids`, `pre-curation`, `evidence-and-photos` = 7 lists. (`outline` and `article` are DOWNSTREAM of package-build and intentionally preserve it.)
  - Command: `grep -c "'arcEvidencePackages'" lib/workflow/state.js`
  - Expected: `7`

- [ ] **Step 6: Re-run the test, confirm it passes.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js -t "arcEvidencePackages"`
  - Expected: both tests pass.

- [ ] **Step 7: Run the full api-helpers suite.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js`
  - Expected: all pass.

- [ ] **Step 8: Commit.**
  - Command: `git add lib/workflow/state.js lib/__tests__/api-helpers.test.js && git commit -m "fix(rollback): clear arcEvidencePackages on arc-selection + upstream rollbacks (ROLL-2)

buildArcEvidencePackages skips when packages already exist, so rolling back to
re-pick arcs reused evidence packaged for the OLD arcs -> article quoted the wrong
storyline. Add arcEvidencePackages to every clear list at/upstream of arc-selection
(7 lists); outline/article preserve it (downstream of the build).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

### Task P6.3: Completeness test — enumerate every node-written state field and assert each is in a clear list or a documented EXEMPT set (ROOT-1)

**Files:**
- Modify: `lib/workflow/state.js:850` (add an exported `ROLLBACK_CLEARS_EXEMPT` Set + JSDoc immediately above `ROLLBACK_CLEARS`; export it in `module.exports`)
- Create: `lib/__tests__/rollback-clears-completeness.test.js`

- [ ] **Step 1: Add the documented EXEMPT set to `state.js`.** In `lib/workflow/state.js`, insert immediately BEFORE the `const ROLLBACK_CLEARS = {` declaration (currently at line 850):

```javascript
/**
 * Fields intentionally NOT subject to the downstream-clear denylist (ROOT-1).
 *
 * Every field in getDefaultState() must either appear in at least one
 * ROLLBACK_CLEARS list OR be listed here with a reason. The completeness test
 * (rollback-clears-completeness.test.js) enforces this so the hand-maintained
 * denylist cannot silently drift behind new node-written state.
 *
 * Categories:
 *  - Session identity / config: stable for the whole run; rollback never re-derives.
 *  - Fetched-but-re-derivable: fetch nodes re-derive on replay even without an
 *    explicit clear (canonicalCharacters), or are cleared transitively via their
 *    source field.
 *  - Incremental raw input: rawSessionInput is owned by the await-* checkpoints'
 *    own skip semantics, not the clear lists (the await-roster/input-review fixes
 *    in P6.1 handle roster/rosterPronouns explicitly).
 *  - Transient per-revision scratch: '_'-prefixed caches that nodes null out
 *    themselves at end of use; no rollback owns them.
 *  - Default-only / never written by a node: dead-but-defaulted channels.
 *  - Control + counters: currentPhase + *RevisionCount handled by
 *    buildRollbackState directly / ROLLBACK_COUNTER_RESETS, not the field list.
 */
const ROLLBACK_CLEARS_EXEMPT = new Set([
  // Session identity / config (stable across the run)
  'sessionId', 'theme',
  // Incremental raw input — owned by await-* checkpoint skip logic
  'rawSessionInput',
  // Fetched, re-derived by fetch nodes on replay (fetch-nodes.js:285 re-derives)
  'canonicalCharacters',
  // Photo branch inputs cleared transitively / re-discovered on replay
  'sessionPhotos', 'genericPhotoAnalyses', 'whiteboardPhotoPath', 'preprocessStats',
  // Default-only channels never written by any node return (consolidated into photoAnalyses)
  'whiteboardAnalysis', 'preCurationSummary', 'supervisorNarrativeCompass',
  // Raw character-ID text — paired with characterIdMappings (which IS cleared)
  'characterIdsRaw',
  // Transient per-revision scratch — nodes null these themselves after use
  '_rescuedItems', '_excludedItemsCache', '_rescueWarnings',
  '_previousArcs', '_previousOutline', '_previousContentBundle', '_arcValidation',
  // Control flow + counters — handled by buildRollbackState / ROLLBACK_COUNTER_RESETS
  'currentPhase', 'voiceRevisionCount',
  'arcRevisionCount', 'humanArcRevisionCount', 'outlineRevisionCount', 'articleRevisionCount',
  // Accumulator — append-reducer, cleared as [] by the lists that include it
  'errors'
]);
```

- [ ] **Step 2: Export the new set.** In `lib/workflow/state.js` `module.exports`, change:

```javascript
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS,
```

to:

```javascript
  ROLLBACK_CLEARS,
  ROLLBACK_CLEARS_EXEMPT,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS,
```

- [ ] **Step 3: Write the completeness test FIRST in its real form** (it will pass once Steps 1–2 land + P6.1/P6.2 fixes are in; if a field is mis-classified the test fails loudly). Create `lib/__tests__/rollback-clears-completeness.test.js`:

```javascript
/**
 * ROLLBACK_CLEARS completeness guard (ROOT-1)
 *
 * buildRollbackState clears a hand-maintained denylist (ROLLBACK_CLEARS). Nothing
 * previously asserted that the denylist actually COVERS every field a node writes —
 * which is exactly how ROLL-1 (roster) and ROLL-2 (arcEvidencePackages) slipped in.
 *
 * This test enumerates every state channel (getDefaultState keys === Annotation
 * channels) and asserts each one is EITHER cleared by some rollback point OR
 * explicitly listed in ROLLBACK_CLEARS_EXEMPT with a documented reason. A new
 * node-written field added without a clear-list entry (and not exempted) fails here.
 */

const {
  getDefaultState,
  ROLLBACK_CLEARS,
  ROLLBACK_CLEARS_EXEMPT
} = require('../workflow/state');

describe('ROLLBACK_CLEARS completeness (ROOT-1)', () => {
  // Union of every field cleared by ANY rollback point
  const clearedSomewhere = new Set(
    Object.values(ROLLBACK_CLEARS).flat()
  );

  const allStateFields = Object.keys(getDefaultState());

  test('every state field is either cleared by a rollback point or explicitly exempt', () => {
    const uncovered = allStateFields.filter(
      f => !clearedSomewhere.has(f) && !ROLLBACK_CLEARS_EXEMPT.has(f)
    );
    // If this fails, a state field was added without deciding its rollback semantics.
    // Either add it to the relevant ROLLBACK_CLEARS list(s) or to ROLLBACK_CLEARS_EXEMPT
    // (with a reason in the JSDoc category comment).
    expect(uncovered).toEqual([]);
  });

  test('EXEMPT and CLEARED are disjoint (no field both cleared and exempted)', () => {
    const both = [...ROLLBACK_CLEARS_EXEMPT].filter(f => clearedSomewhere.has(f));
    expect(both).toEqual([]);
  });

  test('every EXEMPT entry is a real state field (no stale exemptions)', () => {
    const stale = [...ROLLBACK_CLEARS_EXEMPT].filter(f => !allStateFields.includes(f));
    expect(stale).toEqual([]);
  });

  test('every cleared field is a real state field (no typos in ROLLBACK_CLEARS)', () => {
    const ghosts = [...clearedSomewhere].filter(f => !allStateFields.includes(f));
    expect(ghosts).toEqual([]);
  });

  test('roster + rosterPronouns are cleared somewhere (ROLL-1/ROLL-3 guard)', () => {
    expect(clearedSomewhere.has('roster')).toBe(true);
    expect(clearedSomewhere.has('rosterPronouns')).toBe(true);
  });

  test('arcEvidencePackages is cleared somewhere (ROLL-2 guard)', () => {
    expect(clearedSomewhere.has('arcEvidencePackages')).toBe(true);
  });
});
```

- [ ] **Step 4: Run the completeness test.**
  - Command: `npx jest lib/__tests__/rollback-clears-completeness.test.js`
  - Expected: all 6 tests pass. If the first test fails with a non-empty `uncovered` array, EACH listed field must be triaged: a genuinely node-written downstream field → add to the appropriate `ROLLBACK_CLEARS` list; a stable/transient field → add to `ROLLBACK_CLEARS_EXEMPT` with the matching category comment. (With P6.1 + P6.2 applied and the EXEMPT set above, `uncovered` is empty.)

- [ ] **Step 5: Prove the guard actually bites (negative check, temporary).** Temporarily remove `'arcEvidencePackages'` from the `arc-selection` clear list and from one upstream list, re-run, and confirm the test now fails:
  - Command: `npx jest lib/__tests__/rollback-clears-completeness.test.js -t "every state field is either cleared"`
  - Expected: FAILS with `Expected: []  Received: ["arcEvidencePackages"]`. Then restore the removed entries and confirm green again with the same command. (This verifies the test is not vacuously passing.)

- [ ] **Step 6: Run the broader state + api-helpers suites to confirm the new export breaks nothing.**
  - Command: `npx jest lib/__tests__/api-helpers.test.js __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js`
  - Expected: all pass.

- [ ] **Step 7: Commit.**
  - Command: `git add lib/workflow/state.js lib/__tests__/rollback-clears-completeness.test.js && git commit -m "test(rollback): completeness guard for ROLLBACK_CLEARS denylist (ROOT-1)

Enumerate every state channel and assert each is cleared by a rollback point or
listed in a documented ROLLBACK_CLEARS_EXEMPT set. This is the root-cause guard for
ROLL-1/ROLL-2: a new node-written field added without rollback semantics now fails
CI instead of silently reusing stale state.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

### Task P6.4: Integration assertion — rolling back to `await-roster` actually re-pauses `checkpointAwaitRoster` (ROLL-1 end-to-end)

**Files:**
- Test: `lib/workflow/__tests__/rollback-repause.test.js` (Create)
- Reference (no change): `lib/workflow/nodes/checkpoint-nodes.js:148-178` (`checkpointAwaitRoster` skip logic)

- [ ] **Step 1: Confirm the skip predicate is exactly `state.roster?.length > 0`** so the test asserts against the real guard, not an assumed one.
  - Command: `grep -n "state.roster" lib/workflow/nodes/checkpoint-nodes.js`
  - Expected: line 150 `const skipCondition = state.roster?.length > 0` (the `checkpointAwaitRoster` guard). If the line number/shape differs, adjust the test's predicate reference accordingly before writing it.

- [ ] **Step 2: Write the test FIRST.** This is a node-level unit test (no graph invoke, no SDK) that composes `buildRollbackState('await-roster')` onto a populated state and asserts `checkpointAwaitRoster` would interrupt (re-pause) rather than skip. Use the `_testing` export of the node and the real `checkpoint-helpers` interrupt — which throws a `GraphInterrupt` when not skipping. Create `lib/workflow/__tests__/rollback-repause.test.js`:

```javascript
/**
 * ROLL-1 end-to-end: rolling back to await-roster must RE-PAUSE the checkpoint.
 *
 * checkpointAwaitRoster skips (returns without interrupting) when
 * state.roster?.length > 0. buildRollbackState('await-roster') must null roster so
 * the merged post-rollback state causes the checkpoint to interrupt again.
 *
 * We don't run the full graph; we apply the rollback patch to a populated state the
 * way LangGraph's replaceReducer would (null overwrites prior value) and assert the
 * checkpoint node interrupts.
 */

const { buildRollbackState } = require('../../api-helpers');
const { _testing } = require('../nodes/checkpoint-nodes');
const { GraphInterrupt } = require('@langchain/langgraph');

// Apply a rollback patch onto a prior state using replace semantics (null clears),
// mirroring how the checkpointer merges buildRollbackState output on resume.
function applyRollback(priorState, patch) {
  const merged = { ...priorState };
  for (const [k, v] of Object.entries(patch)) {
    merged[k] = v; // replaceReducer: explicit value (incl. null) overwrites
  }
  return merged;
}

describe('ROLL-1 await-roster re-pause', () => {
  const populated = {
    roster: ['Alice', 'Bob'],
    rosterPronouns: { Alice: 'she/her', Bob: 'he/him' },
    photoAnalyses: { analyses: [] },
    whiteboardPhotoPath: '/tmp/wb.jpg',
    evidenceBundle: { exposed: {} },
    selectedArcs: ['arc-1']
  };

  test('before rollback: checkpointAwaitRoster SKIPS (roster present)', () => {
    // skip path returns a plain object, does NOT throw GraphInterrupt
    return expect(
      _testing.checkpointAwaitRoster(populated, {})
    ).resolves.toMatchObject({ currentPhase: expect.any(String) });
  });

  test('after rollback patch: roster is nulled so checkpoint RE-PAUSES (interrupts)', async () => {
    const patch = buildRollbackState('await-roster');
    const rolledBack = applyRollback(populated, patch);

    expect(rolledBack.roster).toBeNull();
    expect(rolledBack.rosterPronouns).toBeNull();

    // With roster null, skipCondition is falsy -> checkpointInterrupt throws GraphInterrupt
    await expect(
      _testing.checkpointAwaitRoster(rolledBack, {})
    ).rejects.toThrow(GraphInterrupt);
  });
});
```

- [ ] **Step 3: Run the test, observe the result.**
  - Command: `npx jest lib/workflow/__tests__/rollback-repause.test.js`
  - Expected with P6.1 applied: both tests pass. (If P6.1 were NOT applied, the second test would fail — the patch would lack `roster`, `rolledBack.roster` would still be `['Alice','Bob']`, and the checkpoint would skip instead of throwing. This is the regression this test locks.)

- [ ] **Step 4: Confirm `GraphInterrupt` is the actual throw type** (the SDK/langgraph interrupt class name must match the import). If `require('@langchain/langgraph').GraphInterrupt` is undefined in this version, the `rejects.toThrow(GraphInterrupt)` would error on an undefined matcher.
  - Command: `node -e "const g=require('@langchain/langgraph'); console.log(typeof g.GraphInterrupt, typeof g.isGraphInterrupt)"`
  - Expected: prints `function ...`. If `GraphInterrupt` is `undefined` but `isGraphInterrupt` exists, change the assertion in Step 2 to `await expect(...).rejects.toThrow()` and add `.catch(e => { expect(g.isGraphInterrupt(e)).toBe(true); })`-style narrowing; if both exist, keep as written. Re-run Step 3 after any adjustment.

- [ ] **Step 5: Commit.**
  - Command: `git add lib/workflow/__tests__/rollback-repause.test.js && git commit -m "test(rollback): assert await-roster rollback re-pauses checkpointAwaitRoster (ROLL-1 e2e)

Composes buildRollbackState('await-roster') onto a populated state and asserts the
checkpoint node interrupts (re-pauses) instead of skipping on stale roster. Locks the
ROLL-1 regression at the node level without a full graph invoke.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"`

---

## Phase P7: Security hardening (Workstream A — SEC-1…SEC-6)

**Goal:** Close the host-wide read/list, auth-bypass, brute-force, token-leak, and unauth-body-DoS holes on the public-tunnel server (`console.aboutlastnightgame.com`) using zero new dependencies.

**Dependencies:** None. This phase is independent of the durable-execution spine (Phase B) and the Stage-2 completion (Phase C) — it only touches `lib/api-helpers.js` and a handful of `server.js` lines (the `/api/file`, `/api/browse`, `/api/config`, session, and login surfaces). It is safe to land first or in parallel with everything else.

> **Production exposure (why this is P0):** the server is reachable over a Cloudflare tunnel gated only by one shared `ACCESS_PASSWORD`. Live HTTP probes proved `/api/file?path=../CLAUDE.md` and `C:/Windows/win.ini` returned, `/api/browse?dir=C:/Users` enumerated the host, `/api/config` shipped `NOTION_TOKEN` to any authed client, the session secret falls back to an in-repo string, login has no throttle, and `express.json({limit:'50mb'})` runs before auth. Each task below closes one of SEC-1…SEC-6.

---

### Task 7.1: `confineToBase(baseDir, requestedPath)` helper + tests (SEC-1/SEC-2 core)

**Files:**
- Modify: `lib/api-helpers.js:1-13` (add `path` require), `lib/api-helpers.js:83` (export)
- Test: `lib/__tests__/api-helpers.test.js` (append `confineToBase` describe block)

- [ ] **Step 1: Write the failing test FIRST.** Append this block to `lib/__tests__/api-helpers.test.js` (after the existing `sendErrorResponse` describe). Note the import line at the top of the file (`lib/__tests__/api-helpers.test.js:22`) must also gain `confineToBase`:

  Change the import at line 22 from:
  ```javascript
  const { buildRollbackState, createGraphAndConfig, sendErrorResponse } = require('../api-helpers');
  ```
  to:
  ```javascript
  const { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase } = require('../api-helpers');
  ```

  Then append:
  ```javascript
  // ═══════════════════════════════════════════════════════
  // confineToBase
  // ═══════════════════════════════════════════════════════

  const path = require('path');

  describe('confineToBase', () => {
    const base = path.join(__dirname, '..', '..', 'data');

    test('returns the resolved path for a child file', () => {
      const resolved = confineToBase(base, path.join(base, '1221', 'fetched', 'tokens.json'));
      expect(resolved).toBe(path.resolve(base, '1221', 'fetched', 'tokens.json'));
    });

    test('returns the resolved path for a relative child', () => {
      const resolved = confineToBase(base, path.join('1221', 'photos', 'a.jpg'));
      expect(resolved).toBe(path.resolve(base, '1221', 'photos', 'a.jpg'));
    });

    test('allows the base dir itself', () => {
      expect(confineToBase(base, base)).toBe(path.resolve(base));
    });

    test('throws on ../ escape', () => {
      expect(() => confineToBase(base, path.join(base, '..', 'CLAUDE.md')))
        .toThrow(/outside the permitted directory/i);
    });

    test('throws on absolute escape (C:/Windows/win.ini style)', () => {
      const outside = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
      expect(() => confineToBase(base, outside))
        .toThrow(/outside the permitted directory/i);
    });

    test('throws on a sibling-prefix bypass (data-evil)', () => {
      // path.resolve(base) === .../data ; a sibling '.../data-evil' must NOT pass a naive startsWith
      const sibling = path.resolve(base) + '-evil';
      expect(() => confineToBase(base, sibling))
        .toThrow(/outside the permitted directory/i);
    });

    test('throws on empty/missing requestedPath', () => {
      expect(() => confineToBase(base, '')).toThrow(/missing path/i);
      expect(() => confineToBase(base, null)).toThrow(/missing path/i);
    });
  });
  ```

- [ ] **Step 2: Run the failing test — expect failure (helper undefined).**
  ```bash
  npx jest lib/__tests__/api-helpers.test.js -t 'confineToBase'
  ```
  Expected: `TypeError: confineToBase is not a function` (all 7 cases fail).

- [ ] **Step 3: Implement the helper.** In `lib/api-helpers.js`, add `path` to the requires at the top (the file currently has no `path` import; `lib/api-helpers.js:12-13`):
  ```javascript
  const path = require('path');
  const { createReportGraphWithCheckpointer } = require('./workflow/graph');
  const { ROLLBACK_CLEARS, ROLLBACK_COUNTER_RESETS, PHASES } = require('./workflow/state');
  ```
  Then add the function immediately before `module.exports` (`lib/api-helpers.js:83`):
  ```javascript
  /**
   * Resolve `requestedPath` and verify it stays within `baseDir`.
   * Throws if the path escapes the permitted directory (../, absolute
   * elsewhere, or a sibling-prefix bypass like `data-evil`).
   *
   * @param {string} baseDir - Absolute directory the result must live under
   * @param {string} requestedPath - Caller-supplied (untrusted) path
   * @returns {string} The resolved absolute path, guaranteed within baseDir
   */
  function confineToBase(baseDir, requestedPath) {
    if (!requestedPath) {
      throw new Error('Missing path');
    }
    const root = path.resolve(baseDir);
    const resolved = path.resolve(root, requestedPath);
    // Append the platform separator so `/data` does not match `/data-evil`.
    const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
    if (resolved !== root && !resolved.startsWith(rootWithSep)) {
      throw new Error(`Path is outside the permitted directory: ${requestedPath}`);
    }
    return resolved;
  }
  ```
  Update the export line (`lib/api-helpers.js:83`):
  ```javascript
  module.exports = { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase };
  ```

- [ ] **Step 4: Re-run the test — expect pass.**
  ```bash
  npx jest lib/__tests__/api-helpers.test.js -t 'confineToBase'
  ```
  Expected: `7 passed`.

- [ ] **Step 5: Commit.**
  ```bash
  git add lib/api-helpers.js lib/__tests__/api-helpers.test.js && git commit -m "feat(security): add confineToBase path-confinement helper (SEC-1/SEC-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.2: Confine `/api/file` and `/api/browse` to the `data/` tree (SEC-1, SEC-2)

**Files:**
- Modify: `server.js:32` (import), `server.js:1211-1248` (`/api/browse`), `server.js:1250-1259` (`/api/file`)
- Test: `__tests__/integration/api-file-browse-confinement.test.js` (NEW)

- [ ] **Step 1: Write the failing integration test FIRST.** The console only consumes `/api/file` for photo thumbnails (`console/components/checkpoints/CharacterIds.js:115`, paths under `data/{id}/photos`) and `/api/browse` via `FileBrowser.js:26`, so confining both to `data/` does not break the SPA. Drive the Express app directly with `supertest` if present, else with the bare handler. Confirm supertest availability first:
  ```bash
  node -e "require.resolve('supertest'); console.log('supertest present')" 2>/dev/null || echo "NO supertest — use http listen harness"
  ```
  If `supertest` is absent (zero-new-dep constraint), use the listen-on-ephemeral-port harness below. Create `__tests__/integration/api-file-browse-confinement.test.js`:
  ```javascript
  /**
   * SEC-1 / SEC-2: /api/file and /api/browse must confine to data/.
   * Boots the real Express app on an ephemeral port, injects an authed
   * session cookie by stubbing requireAuth via a forged signed cookie is
   * fragile — instead we hit the handlers with an authenticated agent.
   */
  const http = require('http');
  const path = require('path');

  // Requiring server.js does NOT start the listener (require.main guard).
  // We re-require the express app is not exported, so we test the helper
  // contract end-to-end through a tiny mounted app that mirrors the routes.
  const express = require('express');
  const { confineToBase } = require('../../lib/api-helpers');

  function makeApp() {
    const app = express();
    const DATA_DIR = path.join(__dirname, '..', '..', 'data');
    app.get('/api/file', (req, res) => {
      let resolved;
      try {
        resolved = confineToBase(DATA_DIR, req.query.path || '');
      } catch (e) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      res.json({ ok: true, resolved });
    });
    app.get('/api/browse', (req, res) => {
      let resolved;
      try {
        resolved = confineToBase(DATA_DIR, req.query.dir || DATA_DIR);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid path' });
      }
      res.json({ ok: true, resolved });
    });
    return app;
  }

  function get(app, urlPath) {
    return new Promise((resolve) => {
      const server = app.listen(0, () => {
        const port = server.address().port;
        http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
          let body = '';
          res.on('data', (c) => (body += c));
          res.on('end', () => {
            server.close();
            resolve({ status: res.statusCode, body });
          });
        });
      });
    });
  }

  describe('SEC-1/SEC-2 path confinement (route contract)', () => {
    const app = makeApp();

    test('/api/file rejects ../ escape with 400', async () => {
      const r = await get(app, '/api/file?path=' + encodeURIComponent('../CLAUDE.md'));
      expect(r.status).toBe(400);
    });

    test('/api/file rejects absolute host path with 400', async () => {
      const evil = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
      const r = await get(app, '/api/file?path=' + encodeURIComponent(evil));
      expect(r.status).toBe(400);
    });

    test('/api/file allows a data/ child path with 200', async () => {
      const r = await get(app, '/api/file?path=' + encodeURIComponent('1221/photos/x.jpg'));
      expect(r.status).toBe(200);
    });

    test('/api/browse rejects C:/Users enumeration with 400', async () => {
      const evil = process.platform === 'win32' ? 'C:\\Users' : '/home';
      const r = await get(app, '/api/browse?dir=' + encodeURIComponent(evil));
      expect(r.status).toBe(400);
    });
  });
  ```
  > This test pins the **contract** (confine-then-serve). The wiring into the real `server.js` routes is verified by reading the diff in Step 3 + the manual probe in Step 5, because `server.js` does not export its `app` (only `buildResumePayload`).

- [ ] **Step 2: Run it — expect pass on the contract (helper already exists from 7.1), confirming the test harness is green before wiring server.js.**
  ```bash
  npx jest __tests__/integration/api-file-browse-confinement.test.js
  ```
  Expected: `4 passed`. (If any fail, fix the harness before touching `server.js`.)

- [ ] **Step 3: Wire the real routes.** First add the import to `server.js:32`:
  ```javascript
  const { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase } = require('./lib/api-helpers');
  ```
  Define the data root once near the other path constants — add immediately after `const sharedCheckpointer = new MemorySaver();` (`server.js:37`):
  ```javascript
  // Base directory all browse/file requests are confined to (SEC-1/SEC-2)
  const DATA_DIR = path.join(__dirname, 'data');
  ```
  Replace `/api/browse` (`server.js:1211-1248`). Current head:
  ```javascript
  app.get('/api/browse', requireAuth, async (req, res) => {
      const projectRoot = path.resolve(__dirname);
      const rawDir = req.query.dir || projectRoot;
      const targetDir = path.resolve(sanitizePath(rawDir));

      try {
          const stat = await fs.promises.stat(targetDir);
  ```
  becomes:
  ```javascript
  app.get('/api/browse', requireAuth, async (req, res) => {
      const rawDir = req.query.dir || DATA_DIR;
      let targetDir;
      try {
          targetDir = confineToBase(DATA_DIR, sanitizePath(rawDir) || DATA_DIR);
      } catch (err) {
          return res.status(400).json({ error: 'Invalid path' });
      }

      try {
          const stat = await fs.promises.stat(targetDir);
  ```
  Then inside that same handler, fix the `parent` so the user cannot navigate above `DATA_DIR`. Current (`server.js:1236-1241`):
  ```javascript
          const parsed = path.parse(targetDir);
          res.json({
              path: targetDir,
              parent: parsed.dir || null,
              entries
          });
  ```
  becomes:
  ```javascript
          const parentDir = path.dirname(targetDir);
          const atRoot = path.resolve(targetDir) === path.resolve(DATA_DIR);
          res.json({
              path: targetDir,
              parent: atRoot ? null : parentDir,
              entries
          });
  ```
  Replace `/api/file` (`server.js:1250-1259`). Current:
  ```javascript
  app.get('/api/file', requireAuth, (req, res) => {
      const filePath = sanitizePath(req.query.path || '');
      if (!filePath) return res.status(400).json({ error: 'Missing path parameter' });
      res.sendFile(path.resolve(filePath), (err) => {
          if (err && !res.headersSent) {
              res.status(err.status || 404).json({ error: 'File not found' });
          }
      });
  });
  ```
  becomes:
  ```javascript
  app.get('/api/file', requireAuth, (req, res) => {
      const raw = sanitizePath(req.query.path || '');
      if (!raw) return res.status(400).json({ error: 'Missing path parameter' });
      let filePath;
      try {
          filePath = confineToBase(DATA_DIR, raw);
      } catch (err) {
          return res.status(400).json({ error: 'Invalid path' });
      }
      res.sendFile(filePath, (err) => {
          if (err && !res.headersSent) {
              res.status(err.status || 404).json({ error: 'File not found' });
          }
      });
  });
  ```

- [ ] **Step 4: Run the full suite to confirm nothing regressed.**
  ```bash
  npx jest __tests__/integration/api-file-browse-confinement.test.js lib/__tests__/api-helpers.test.js
  ```
  Expected: all green.

- [ ] **Step 5: Manual live verification (no automated harness for the real routes).** Start the server, log in, and probe:
  ```bash
  npm start &
  # after "Server Running":
  curl -s -b cookies.txt -c cookies.txt -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' -d "{\"password\":\"$ACCESS_PASSWORD\"}"
  curl -s -b cookies.txt "localhost:3001/api/file?path=../CLAUDE.md" ; echo
  curl -s -b cookies.txt "localhost:3001/api/browse?dir=C:/Users" ; echo
  ```
  Expected: both return `{"error":"Invalid path"}` with HTTP 400 (was: 22 KB of `CLAUDE.md` / a host directory listing).

- [ ] **Step 6: Commit.**
  ```bash
  git add server.js __tests__/integration/api-file-browse-confinement.test.js && git commit -m "fix(security): confine /api/file and /api/browse to data/ tree (SEC-1, SEC-2)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.3: Fail-fast on unset `SESSION_SECRET`; set `cookie.secure` behind the tunnel (SEC-4)

**Files:**
- Modify: `server.js:332-342` (session middleware)

- [ ] **Step 1: Replace the fallback-secret session config.** Current (`server.js:332-342`):
  ```javascript
  // Session middleware for authentication
  app.use(session({
      secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
      resave: false,
      saveUninitialized: false,
      cookie: {
          httpOnly: true,
          secure: false, // Set to true if using HTTPS only
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
  }));
  ```
  becomes:
  ```javascript
  // Session middleware for authentication.
  // SECURITY (SEC-4): refuse to start without a real secret — the in-repo
  // fallback let anyone forge {authenticated:true} cookies over the tunnel.
  if (!process.env.SESSION_SECRET) {
      console.error(
          '\nFATAL: SESSION_SECRET is not set.\n' +
          'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
          'and add it to .env before starting the server.\n'
      );
      process.exit(1);
  }

  // Behind the Cloudflare tunnel the public origin is HTTPS, but Express sees
  // the proxied (http) hop — trust the proxy so secure cookies are honored.
  app.set('trust proxy', 1);

  app.use(session({
      secret: process.env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
          httpOnly: true,
          // 'auto' = mark the cookie Secure whenever the request is HTTPS. With
          // `trust proxy` set (above) Express derives this from x-forwarded-proto,
          // so the cookie is Secure behind the tunnel and plain on http://localhost
          // dev — WITHOUT depending on NODE_ENV, which the launch scripts never set.
          secure: 'auto',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
  }));
  ```
  > A Secure cookie requires `trust proxy` set (above), otherwise Express judges the proxied request as insecure and silently drops the cookie — locking every user out behind the tunnel. We use `secure: 'auto'` rather than a `NODE_ENV==='production'` gate **on purpose**: the launch path (`start-everything.bat` → `npm start`) never sets `NODE_ENV` (verified — the `.bat` sets only `SCRIPT_DIR`; `package.json` `start` is `node scripts/kill-port.js 3001 && node server.js`), so a `NODE_ENV` gate would leave `secure` permanently `false` and the `Secure` flag would never land behind the tunnel. `'auto'` ties Secure to the real request protocol (HTTPS via the tunnel's `x-forwarded-proto`), so it is correct behind the tunnel and still allows plain `http://localhost:3001` dev.

- [ ] **Step 2: Verify fail-fast behavior.** Because the session config runs at module load (before the `require.main` listen guard), requiring `server.js` with no secret would call `process.exit(1)` and break the existing `server-build-resume-payload.test.js`. Confirm that test currently sets a secret, and if not, ensure the test env provides one. Run:
  ```bash
  node -e "const c=require('fs').readFileSync('__tests__/unit/server-build-resume-payload.test.js','utf8'); console.log(/SESSION_SECRET/.test(c)?'test sets secret':'TEST DOES NOT SET SECRET')"
  ```
  If it prints `TEST DOES NOT SET SECRET`, add a guard at the very top of `__tests__/unit/server-build-resume-payload.test.js:1` (before the `require('../../server.js')`):
  ```javascript
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
  ```

- [ ] **Step 3: Confirm the existing server test still passes (proves no module-load regression).**
  ```bash
  npx jest __tests__/unit/server-build-resume-payload.test.js
  ```
  Expected: all green.

- [ ] **Step 4: Manual fail-fast check.**
  ```bash
  SESSION_SECRET= node server.js
  ```
  Expected: prints `FATAL: SESSION_SECRET is not set.` and exits non-zero (no listener).

- [ ] **Step 4b: Prove the `Secure` flag actually lands (the gate this task previously lacked).** `secure: 'auto'` only sets `Secure` when Express judges the request HTTPS, which behind the tunnel depends on `trust proxy` + the `x-forwarded-proto` header. Verify both halves with the running server (start it locally with `SESSION_SECRET` + `ACCESS_PASSWORD` set). The login route is `POST /api/auth/login` (server.js:355) and the default session cookie is `connect.sid`:
  ```bash
  # (a) HTTPS at the proxy hop → Secure MUST be present:
  curl -si -X POST http://localhost:3001/api/auth/login \
    -H 'X-Forwarded-Proto: https' -H 'Content-Type: application/json' \
    -d "{\"password\":\"$ACCESS_PASSWORD\"}" | grep -i '^set-cookie:'
  # (b) plain http dev → Secure MUST be absent (cookie still sets, no lock-out):
  curl -si -X POST http://localhost:3001/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"password\":\"$ACCESS_PASSWORD\"}" | grep -i '^set-cookie:'
  ```
  Expected: (a) prints a `Set-Cookie: connect.sid=...` line that INCLUDES `Secure`; (b) prints a `Set-Cookie: connect.sid=...` line WITHOUT `Secure`. If (a) lacks `Secure`, `trust proxy` is not wired and the hardening did not land — do not commit.

- [ ] **Step 5: Commit.**
  ```bash
  git add server.js __tests__/unit/server-build-resume-payload.test.js && git commit -m "fix(security): fail-fast on unset SESSION_SECRET; secure cookies behind tunnel (SEC-4)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.4: Zero-dep in-memory login rate-limiter + lockout (SEC-5)

**Files:**
- Create: `lib/login-rate-limiter.js`
- Test: `lib/__tests__/login-rate-limiter.test.js` (NEW)
- Modify: `server.js:32` (import), `server.js:355-381` (login route)

- [ ] **Step 1: Write the failing unit test FIRST.** The limiter is a pure module (clock-injectable for deterministic tests), so it is node-unit-testable directly. Create `lib/__tests__/login-rate-limiter.test.js`:
  ```javascript
  const { createLoginRateLimiter } = require('../login-rate-limiter');

  describe('login rate limiter', () => {
    test('allows up to maxAttempts failures, then locks out', () => {
      let now = 0;
      const rl = createLoginRateLimiter({ maxAttempts: 5, windowMs: 60000, lockoutMs: 300000, clock: () => now });
      const ip = '1.2.3.4';
      for (let i = 0; i < 5; i++) {
        expect(rl.check(ip).allowed).toBe(true);
        rl.recordFailure(ip);
      }
      const blocked = rl.check(ip);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBeGreaterThan(0);
    });

    test('successful login clears the counter', () => {
      let now = 0;
      const rl = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000, clock: () => now });
      const ip = '5.6.7.8';
      rl.recordFailure(ip);
      rl.recordFailure(ip);
      rl.recordSuccess(ip);
      // counter reset → full budget again
      expect(rl.check(ip).allowed).toBe(true);
      rl.recordFailure(ip);
      rl.recordFailure(ip);
      expect(rl.check(ip).allowed).toBe(true);
    });

    test('lockout expires after lockoutMs', () => {
      let now = 0;
      const rl = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60000, lockoutMs: 300000, clock: () => now });
      const ip = '9.9.9.9';
      rl.recordFailure(ip); rl.recordFailure(ip);
      expect(rl.check(ip).allowed).toBe(false);
      now += 300001; // past lockout
      expect(rl.check(ip).allowed).toBe(true);
    });

    test('failures outside the rolling window do not accumulate', () => {
      let now = 0;
      const rl = createLoginRateLimiter({ maxAttempts: 3, windowMs: 60000, lockoutMs: 300000, clock: () => now });
      const ip = '8.8.8.8';
      rl.recordFailure(ip);
      now += 61000; // first failure ages out
      rl.recordFailure(ip);
      rl.recordFailure(ip);
      expect(rl.check(ip).allowed).toBe(true); // only 2 in-window
    });

    test('separate IPs have independent budgets', () => {
      let now = 0;
      const rl = createLoginRateLimiter({ maxAttempts: 2, windowMs: 60000, lockoutMs: 300000, clock: () => now });
      rl.recordFailure('a'); rl.recordFailure('a');
      expect(rl.check('a').allowed).toBe(false);
      expect(rl.check('b').allowed).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it — expect failure (module missing).**
  ```bash
  npx jest lib/__tests__/login-rate-limiter.test.js
  ```
  Expected: `Cannot find module '../login-rate-limiter'`.

- [ ] **Step 3: Implement the limiter.** Create `lib/login-rate-limiter.js`:
  ```javascript
  /**
   * Zero-dependency in-memory login rate limiter (SEC-5).
   *
   * Per-IP rolling-window failure count with lockout. Single-process server,
   * so a plain Map is sufficient — no Redis/express-rate-limit dependency.
   * Clock is injectable for deterministic tests.
   */
  function createLoginRateLimiter({
    maxAttempts = 5,
    windowMs = 15 * 60 * 1000,   // rolling window for counting failures
    lockoutMs = 15 * 60 * 1000,  // how long a tripped IP stays blocked
    clock = Date.now
  } = {}) {
    // ip -> { failures: number[] (timestamps), lockedUntil: number }
    const buckets = new Map();

    function prune(entry, now) {
      entry.failures = entry.failures.filter(t => now - t < windowMs);
    }

    function check(ip) {
      const now = clock();
      const entry = buckets.get(ip);
      if (!entry) return { allowed: true };
      if (entry.lockedUntil && now < entry.lockedUntil) {
        return { allowed: false, retryAfterMs: entry.lockedUntil - now };
      }
      prune(entry, now);
      if (entry.failures.length >= maxAttempts) {
        // window full but no active lock (e.g. just aged in) — block + lock
        entry.lockedUntil = now + lockoutMs;
        return { allowed: false, retryAfterMs: lockoutMs };
      }
      return { allowed: true };
    }

    function recordFailure(ip) {
      const now = clock();
      let entry = buckets.get(ip);
      if (!entry) { entry = { failures: [], lockedUntil: 0 }; buckets.set(ip, entry); }
      prune(entry, now);
      entry.failures.push(now);
      if (entry.failures.length >= maxAttempts) {
        entry.lockedUntil = now + lockoutMs;
      }
    }

    function recordSuccess(ip) {
      buckets.delete(ip);
    }

    return { check, recordFailure, recordSuccess };
  }

  module.exports = { createLoginRateLimiter };
  ```

- [ ] **Step 4: Re-run the test — expect pass.**
  ```bash
  npx jest lib/__tests__/login-rate-limiter.test.js
  ```
  Expected: `5 passed`.

- [ ] **Step 5: Wire the limiter into the login route.** Add to imports near `server.js:32`:
  ```javascript
  const { createLoginRateLimiter } = require('./lib/login-rate-limiter');
  ```
  Instantiate once, near the other shared singletons after `server.js:37`:
  ```javascript
  // Login brute-force protection (SEC-5): 5 failures / 15 min per IP, 15 min lockout
  const loginRateLimiter = createLoginRateLimiter({
      maxAttempts: 5,
      windowMs: 15 * 60 * 1000,
      lockoutMs: 15 * 60 * 1000
  });
  ```
  Replace the login handler body (`server.js:355-381`). Current:
  ```javascript
  app.post('/api/auth/login', (req, res) => {
      const { password } = req.body;
      const correctPassword = process.env.ACCESS_PASSWORD;

      if (!correctPassword) {
          console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
          return res.status(500).json({
              success: false,
              message: 'Server configuration error'
          });
      }

      if (password === correctPassword) {
          req.session.authenticated = true;
          console.log(`[${new Date().toISOString()}] Successful login from ${req.ip}`);
          res.json({
              success: true,
              message: 'Authentication successful'
          });
      } else {
          console.warn(`[${new Date().toISOString()}] Failed login attempt from ${req.ip}`);
          res.status(401).json({
              success: false,
              message: 'Incorrect password'
          });
      }
  });
  ```
  becomes:
  ```javascript
  app.post('/api/auth/login', (req, res) => {
      const { password } = req.body;
      const correctPassword = process.env.ACCESS_PASSWORD;
      const ip = req.ip;

      if (!correctPassword) {
          console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
          return res.status(500).json({
              success: false,
              message: 'Server configuration error'
          });
      }

      // SEC-5: refuse before checking the password if this IP is locked out.
      const gate = loginRateLimiter.check(ip);
      if (!gate.allowed) {
          const retryAfterSec = Math.ceil(gate.retryAfterMs / 1000);
          console.warn(`[${new Date().toISOString()}] Login blocked (rate limit) from ${ip}, retry in ${retryAfterSec}s`);
          res.set('Retry-After', String(retryAfterSec));
          return res.status(429).json({
              success: false,
              message: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
              retryAfterMs: gate.retryAfterMs
          });
      }

      if (password === correctPassword) {
          loginRateLimiter.recordSuccess(ip);
          req.session.authenticated = true;
          console.log(`[${new Date().toISOString()}] Successful login from ${ip}`);
          res.json({
              success: true,
              message: 'Authentication successful'
          });
      } else {
          loginRateLimiter.recordFailure(ip);
          console.warn(`[${new Date().toISOString()}] Failed login attempt from ${ip}`);
          res.status(401).json({
              success: false,
              message: 'Incorrect password'
          });
      }
  });
  ```
  > The client (`console/components/LoginOverlay.js:25-29`) already reads `result.message` and shows it on any non-`success` response (and `api.login` returns `res.json()` regardless of status — `console/api.js:22`), so the 429 message renders with no frontend change. `req.ip` is meaningful because Task 7.3 set `app.set('trust proxy', 1)`, so it reflects the Cloudflare-forwarded client IP, not the tunnel hop.

- [ ] **Step 6: Re-run limiter tests + server load test.**
  ```bash
  npx jest lib/__tests__/login-rate-limiter.test.js __tests__/unit/server-build-resume-payload.test.js
  ```
  Expected: all green (server.js still requires cleanly with the new import).

- [ ] **Step 7: Commit.**
  ```bash
  git add lib/login-rate-limiter.js lib/__tests__/login-rate-limiter.test.js server.js && git commit -m "feat(security): zero-dep per-IP login rate limiter with lockout (SEC-5)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.5: Stop `/api/config` leaking `NOTION_TOKEN` (SEC-3)

**Files:**
- Modify: `server.js:1204-1209` (`/api/config`)

- [ ] **Step 1: Confirm the console SPA does not consume the token (so removal is safe).** Run:
  ```bash
  cd C:/Users/spide/Documents/claudecode/aboutlastnight/reports && grep -rn "notionToken\|/api/config" console/ || echo "console SPA does not use notionToken"
  ```
  Expected: no hits in `console/` (only the legacy `detlogv2.html`/`detlogv3.html` standalone pages read `notionToken`, and those make Notion calls directly from the browser — they are not the production console SPA). This confirms the SPA never needs the token client-side; all pipeline Notion calls already run server-side via `lib/notion-client.js`.

- [ ] **Step 2: Stop shipping the token.** Replace `/api/config` (`server.js:1204-1209`). Current:
  ```javascript
  // Config endpoint - serves environment variables to frontend (protected)
  app.get('/api/config', requireAuth, (req, res) => {
      res.json({
          notionToken: process.env.NOTION_TOKEN || ''
      });
  });
  ```
  becomes:
  ```javascript
  // Config endpoint - serves NON-SECRET client configuration (protected).
  // SEC-3: NOTION_TOKEN is NEVER sent to the client — all Notion access is
  // server-side (lib/notion-client.js). The console SPA does not read it.
  app.get('/api/config', requireAuth, (req, res) => {
      res.json({
          notionConfigured: Boolean(process.env.NOTION_TOKEN)
      });
  });
  ```

- [ ] **Step 3: Manual verification.**
  ```bash
  # server running + authed cookie from Task 7.2 Step 5:
  curl -s -b cookies.txt localhost:3001/api/config ; echo
  ```
  Expected: `{"notionConfigured":true}` — no `notionToken` field (was: `{"notionToken":"ntn_..."}`).

- [ ] **Step 4: Update the docs that describe the old contract.** `ENV_SETUP.md` documents `/api/config` returning the token (e.g. `ENV_SETUP.md:172`). Edit those lines to reflect that the token stays server-side and `/api/config` now returns `{notionConfigured: boolean}`. (Mechanical doc edit — match the new response shape; do not leave the `Should return: {"notionToken":"ntn_..."}` line.)

- [ ] **Step 5: Commit.**
  ```bash
  git add server.js ENV_SETUP.md && git commit -m "fix(security): stop /api/config leaking NOTION_TOKEN to clients (SEC-3)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.6: Small JSON body limit on the auth route (SEC-6)

**Files:**
- Modify: `server.js:316-317` (global body parser), `server.js:355` (login route gains a tight parser)

- [ ] **Step 1: Add a tight per-route parser to the auth login route.** The global `express.json({ limit: '50mb' })` (`server.js:317`) runs before `requireAuth`, so an unauthenticated `POST /api/auth/login` can buffer 50 MB. Keep the generous global limit for authenticated pipeline payloads, but mount a tiny parser specifically on the login route so the unauth surface is bounded.

  First, add a shared tight parser constant right after the global parser (`server.js:316-318`). Current:
  ```javascript
  // Middleware
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(__dirname));
  ```
  becomes:
  ```javascript
  // Middleware
  // SEC-6: tight parser for the UNAUTHENTICATED auth surface so a pre-auth
  // request cannot buffer the 50mb global limit and exhaust memory.
  const authBodyParser = express.json({ limit: '1kb' });
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(__dirname));
  ```

- [ ] **Step 2: Apply it to the login route.** The login handler is defined at `server.js:355`. Express runs the global 50mb parser first; to bound the unauth body we mount the tight parser AND reject oversized bodies before the global parser sees them. Mount a guard ahead of the global parser for the exact auth path. Replace the middleware block so the auth route is parsed by the tight parser before the global one:

  Change `server.js:316-318` to:
  ```javascript
  // Middleware
  // SEC-6: the unauthenticated /api/auth/login surface gets a 1kb parser
  // mounted BEFORE the 50mb global parser, so a pre-auth client cannot
  // buffer 50mb and exhaust memory on this single-process server.
  app.use('/api/auth/login', express.json({ limit: '1kb' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.static(__dirname));
  ```
  > Express's `json` parser is a no-op when `req._body` is already set, so once the 1kb parser has consumed `/api/auth/login`, the global 50mb parser skips re-parsing it. A body over 1kb makes the tight parser throw `entity.too.large` (HTTP 413) before any handler — and before the global limit could buffer 50mb. Remove the now-unused `authBodyParser` const if it was added in Step 1 (it is superseded by the path-mounted form above).

- [ ] **Step 3: Add an error handler so oversized bodies return a clean 413 (not an unhandled throw).** The `body-parser` `entity.too.large` error surfaces as an Express error with `err.type === 'entity.too.large'`. Add a JSON error handler AFTER all routes but BEFORE the `app.listen` block — insert immediately before the `if (require.main === module)` block (`server.js:1266`):
  ```javascript
  // Body-size / malformed-JSON guard (SEC-6): return a clean 413/400 instead
  // of leaking a stack trace for oversized or malformed request bodies.
  app.use((err, req, res, next) => {
      if (err.type === 'entity.too.large') {
          return res.status(413).json({ error: 'Request body too large' });
      }
      if (err.type === 'entity.parse.failed') {
          return res.status(400).json({ error: 'Malformed JSON body' });
      }
      return next(err);
  });
  ```

- [ ] **Step 4: Manual verification.**
  ```bash
  # server running:
  python3 -c "print('x'*5000)" > big.txt
  curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3001/api/auth/login -H 'Content-Type: application/json' --data-binary "{\"password\":\"$(cat big.txt)\"}"
  ```
  Expected: `413` (was: the 50mb parser would accept and buffer it). A normal small login still returns 200/401/429.

- [ ] **Step 5: Commit.**
  ```bash
  git add server.js && git commit -m "fix(security): bound unauthenticated auth-route body to 1kb (SEC-6)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

### Task 7.7: Phase regression sweep — full suite green

**Files:**
- Test: run-only (no source changes)

- [ ] **Step 1: Run the complete Jest suite to confirm no security change regressed unit/integration coverage.**
  ```bash
  npx jest
  ```
  Expected: the full suite passes, including the new `confineToBase`, `login-rate-limiter`, and `api-file-browse-confinement` tests, and the existing `server-build-resume-payload` and `api-helpers` suites.

- [ ] **Step 2: Confirm the server boots with a real secret and refuses without one (combined SEC-4 smoke).**
  ```bash
  SESSION_SECRET= node -e "try{require('./server.js')}catch(e){}" ; echo "exit=$?"
  ```
  Expected: prints the `FATAL: SESSION_SECRET is not set.` banner and `exit=1`.

- [ ] **Step 3: Commit (only if Step 1 surfaced a snapshot/fixture touch; otherwise skip).**
  ```bash
  git add -A && git commit -m "test(security): finalize Phase P7 security suite green

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Phase P8: Complete F1 (pronouns) — all three links + tests

Goal: Director-set pronouns survive capture → resume → prompt → review so the article (and the HITL review surface) use the right pronouns instead of silently defaulting every character to they/them.

Dependencies: None mechanically — this phase touches `server.js` (buildResumePayload), `lib/workflow/nodes/input-nodes.js`, `lib/workflow/nodes/node-helpers.js`, `console/components/checkpoints/InputReview.js`. It coordinates on `server.js`/`prompt-builder.js` with Workstream C/B siblings (land P8 before or after them — the edits are disjoint line ranges). F1 only works when CR-1 (Task 8.1) AND X-1 (Task 8.2) AND X-4 (Task 8.3) all land; the F1 chain in `audit/stage3/remediation-architecture.md` ("Net: F1 needs CR-1 + X-1 + X-4 (capture→bridge→key-namespace→display)") is the spec for this phase.

### Task 8.1: buildResumePayload forwards approvals.rosterPronouns (CR-1)

**Files:**
- Modify: `server.js:246-250` (the `await-roster` branch of `buildResumePayload`)
- Test: `__tests__/unit/server-build-resume-payload.test.js` (new `describe` block appended)

- [ ] **Step 1: Write the failing regression test (the one that was missing).** Append this block to `__tests__/unit/server-build-resume-payload.test.js`, after the existing `describe('buildResumePayload — outlineEdits routing ...')` block (ends at line 159):

```javascript
describe('buildResumePayload — rosterPronouns forwarding (F1 / CR-1 regression)', () => {
  it('forwards approvals.rosterPronouns into BOTH resume and stateUpdates when roster is present', () => {
    const result = buildResumePayload({
      roster: ['Vic', 'Sam'],
      rosterPronouns: { Vic: 'she/her', Sam: 'he/him' }
    });
    expect(result.error).toBeNull();
    expect(result.resume.roster).toEqual(['Vic', 'Sam']);
    // The link CR-1 severed: pronouns must ride along on resume + stateUpdates.
    expect(result.resume.rosterPronouns).toEqual({ Vic: 'she/her', Sam: 'he/him' });
    expect(result.stateUpdates.rosterPronouns).toEqual({ Vic: 'she/her', Sam: 'he/him' });
  });

  it('forwards roster without rosterPronouns when none supplied (no undefined keys injected)', () => {
    const result = buildResumePayload({ roster: ['Vic'] });
    expect(result.error).toBeNull();
    expect(result.resume.roster).toEqual(['Vic']);
    expect('rosterPronouns' in result.resume).toBe(false);
    expect('rosterPronouns' in result.stateUpdates).toBe(false);
  });

  it('ignores rosterPronouns when roster is absent/invalid (no orphan pronouns)', () => {
    const result = buildResumePayload({ rosterPronouns: { Vic: 'she/her' } });
    // roster branch never fires → pronouns must NOT leak through on their own.
    expect('rosterPronouns' in result.resume).toBe(false);
    expect('rosterPronouns' in result.stateUpdates).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.** Command:
  `npx jest __tests__/unit/server-build-resume-payload.test.js -t 'rosterPronouns forwarding'`
  Expected: the first test fails — `result.resume.rosterPronouns` is `undefined` (server.js:246-250 only forwards `roster`), so `expect(...).toEqual({ Vic: 'she/her', Sam: 'he/him' })` throws `Received: undefined`.

- [ ] **Step 3: Implement the forward in the roster branch.** In `server.js`, replace the `await-roster` branch (currently lines 246-250):

  Before:
  ```javascript
    // Await roster checkpoint (Parallel branch architecture)
    // User provides roster to enable character ID mapping
    if (approvals.roster && Array.isArray(approvals.roster)) {
        validApprovalDetected = true;
        stateUpdates.roster = approvals.roster;
        resume.roster = approvals.roster;
    }
  ```

  After:
  ```javascript
    // Await roster checkpoint (Parallel branch architecture)
    // User provides roster to enable character ID mapping.
    // F1 (CR-1): pronouns captured alongside the roster MUST ride along on both
    // the Command resume AND the direct state update, or every character defaults
    // to they/them downstream (generateRosterSection.resolvePronouns).
    if (approvals.roster && Array.isArray(approvals.roster)) {
        validApprovalDetected = true;
        stateUpdates.roster = approvals.roster;
        resume.roster = approvals.roster;
        if (approvals.rosterPronouns && typeof approvals.rosterPronouns === 'object') {
            stateUpdates.rosterPronouns = approvals.rosterPronouns;
            resume.rosterPronouns = approvals.rosterPronouns;
        }
    }
  ```

- [ ] **Step 4: Re-run, confirm green.** Command:
  `npx jest __tests__/unit/server-build-resume-payload.test.js -t 'rosterPronouns forwarding'`
  Expected: 3 passing. Then run the full file to prove no regression:
  `npx jest __tests__/unit/server-build-resume-payload.test.js`
  Expected: all prior outline tests + the 3 new ones pass.

- [ ] **Step 5: Commit.**
  `git add server.js __tests__/unit/server-build-resume-payload.test.js && git commit -m 'fix(F1/CR-1): forward rosterPronouns through buildResumePayload await-roster branch + regression test'`

### Task 8.2: Normalize sessionConfig.rosterPronouns to canonical first-name keys (X-1)

**Files:**
- Create helper in: `lib/workflow/nodes/node-helpers.js` (new `normalizeRosterPronounsToCanonical` + export at module.exports, currently starts line 1027)
- Modify: `lib/workflow/nodes/input-nodes.js:428` (the `result.rosterPronouns` stamp inside `step1Promise`)
- Test: `lib/__tests__/node-helpers.test.js` (new `describe` block)

Context (confirmed by read): `parseRawInput` runs AFTER `fetchMemoryTokens` (graph.js edges: `…→fetchMemoryTokens→fetchPaperEvidence→…→checkpointAwaitContext→parseRawInput`), so `state.canonicalCharacters` (Notion-derived title-cased first-name keys, e.g. `{ Victoria: 'Victoria Kingsley' }`) is populated when the stamp at input-nodes.js:428 runs. `generateRosterSection` (prompt-builder.js:33-34) iterates `canonicalCharacters` keys and calls `resolvePronouns(canonicalFirstName, rosterPronouns)` — so the pronoun map MUST be keyed by the SAME canonical first names, not the director-typed names. A typed "Victoria Kingsley" (or "victoria") must resolve to canonical key "Victoria".

- [ ] **Step 1: Write the failing unit test for the normalizer.** Append to `lib/__tests__/node-helpers.test.js` (after the existing `extractCanonicalCharacters` describe block):

```javascript
describe('normalizeRosterPronounsToCanonical', () => {
  const { normalizeRosterPronounsToCanonical } = require('../workflow/nodes/node-helpers');
  const canonical = { Victoria: 'Victoria Kingsley', Sam: 'Sam Rivera' };

  it('passes through an exact canonical-key match', () => {
    const out = normalizeRosterPronounsToCanonical({ Victoria: 'she/her' }, canonical);
    expect(out).toEqual({ Victoria: 'she/her' });
  });

  it('re-keys a case-divergent typed name to the canonical key', () => {
    const out = normalizeRosterPronounsToCanonical({ victoria: 'she/her' }, canonical);
    expect(out.Victoria).toBe('she/her');
    expect(out.victoria).toBeUndefined();
  });

  it('re-keys a full-name typed entry to the canonical first-name key', () => {
    // Director typed the full name; canonical key is the first name.
    const out = normalizeRosterPronounsToCanonical({ 'Victoria Kingsley': 'she/her' }, canonical);
    expect(out.Victoria).toBe('she/her');
    expect(out['Victoria Kingsley']).toBeUndefined();
  });

  it('keeps an unmatched typed name under its original key (no data loss)', () => {
    const out = normalizeRosterPronounsToCanonical({ Mystery: 'they/them' }, canonical);
    expect(out.Mystery).toBe('they/them');
  });

  it('returns an empty object for empty/null inputs', () => {
    expect(normalizeRosterPronounsToCanonical(null, canonical)).toEqual({});
    expect(normalizeRosterPronounsToCanonical({}, null)).toEqual({});
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.** Command:
  `npx jest lib/__tests__/node-helpers.test.js -t 'normalizeRosterPronounsToCanonical'`
  Expected: fails at the `require` destructure — `normalizeRosterPronounsToCanonical` is `undefined` (not yet exported), so the first `.toEqual` throws `TypeError: normalizeRosterPronounsToCanonical is not a function`.

- [ ] **Step 3: Implement the helper.** In `lib/workflow/nodes/node-helpers.js`, add this function just above the `module.exports = {` line at 1027. `getCanonicalName` is already imported at line 12 (`const { getCanonicalName, getThemeNPCs } = require('../../theme-config');`):

```javascript
/**
 * Normalize a director-typed rosterPronouns map to canonical first-name keys (F1 / X-1).
 *
 * generateRosterSection iterates state.canonicalCharacters (Notion-derived,
 * title-cased first-name keys) and resolves pronouns by that key. The director,
 * however, types pronouns keyed by whatever roster string they entered
 * ("victoria", "Victoria Kingsley", "Vic"). Without re-keying, any case- or
 * form-divergence silently falls through to they/them. This re-keys each typed
 * entry to its canonical first name when a match exists, preserving the value;
 * unmatched entries are kept under their original key so nothing is dropped.
 *
 * Match order per typed entry:
 *   1. exact canonical key (case-insensitive)
 *   2. typed string equals a canonical FULL name (case-insensitive) -> that key
 *   3. no match -> keep original key
 *
 * @param {Object|null} rosterPronouns - director-typed map: typedName -> pronouns
 * @param {Object|null} canonicalCharacters - Notion map: canonicalFirstName -> fullName
 * @returns {Object} pronouns re-keyed by canonical first name where resolvable
 */
function normalizeRosterPronounsToCanonical(rosterPronouns, canonicalCharacters) {
  const pronouns = rosterPronouns || {};
  const canonical = canonicalCharacters || {};
  const canonicalKeys = Object.keys(canonical);
  const out = {};

  for (const [typedName, value] of Object.entries(pronouns)) {
    const typedLower = String(typedName).toLowerCase().trim();

    // 1. Case-insensitive canonical key match.
    let resolvedKey = canonicalKeys.find(k => k.toLowerCase() === typedLower);

    // 2. Typed string equals a canonical full name -> map to its first-name key.
    if (!resolvedKey) {
      resolvedKey = canonicalKeys.find(
        k => String(canonical[k]).toLowerCase().trim() === typedLower
      );
    }

    // 3. Fall back to the original typed key (preserve, don't drop).
    out[resolvedKey || typedName] = value;
  }

  return out;
}
```

  Then add it to the `module.exports` object. The export block ends at line 1070 (`processWithConcurrency`); insert before the closing brace:

  Before:
  ```javascript
    // Re-export batching utilities from preprocessor for convenience
    createBatches,
    processWithConcurrency
  };
  ```

  After:
  ```javascript
    // Re-export batching utilities from preprocessor for convenience
    createBatches,
    processWithConcurrency,

    // F1 (X-1): canonical-key normalization for director-typed pronouns
    normalizeRosterPronounsToCanonical
  };
  ```

- [ ] **Step 4: Re-run the helper test, confirm green.** Command:
  `npx jest lib/__tests__/node-helpers.test.js -t 'normalizeRosterPronounsToCanonical'`
  Expected: 5 passing.

- [ ] **Step 5: Wire the normalizer into the stamp.** First add `normalizeRosterPronounsToCanonical` to the node-helpers import in `input-nodes.js:36`:

  Before:
  ```javascript
  const { getSdkClient, synthesizePlayerFocus } = require('./node-helpers');
  ```

  After:
  ```javascript
  const { getSdkClient, synthesizePlayerFocus, normalizeRosterPronounsToCanonical } = require('./node-helpers');
  ```

  Then replace the stamp at input-nodes.js:428 (inside `step1Promise`):

  Before:
  ```javascript
      result.rosterPronouns = state.rosterPronouns || rawInput.rosterPronouns || {};
  ```

  After:
  ```javascript
      // F1 (X-1): re-key director-typed pronouns to canonical first names so
      // generateRosterSection.resolvePronouns (which iterates canonicalCharacters
      // keys) finds them. Without this, "Victoria Kingsley"/"victoria" silently
      // resolve to they/them.
      result.rosterPronouns = normalizeRosterPronounsToCanonical(
        state.rosterPronouns || rawInput.rosterPronouns || {},
        state.canonicalCharacters || {}
      );
  ```

- [ ] **Step 6: Add the integration-level regression test (X-7 — proves the full key chain end-to-end through generateRosterSection).** Append to `lib/__tests__/node-helpers.test.js`:

```javascript
describe('F1 pronoun key chain (X-1 + X-7): normalize then render', () => {
  const { normalizeRosterPronounsToCanonical } = require('../workflow/nodes/node-helpers');
  const { generateRosterSection } = require('../prompt-builder');

  it('a full-name typed pronoun reaches the rendered roster line (not they/them)', () => {
    const canonicalCharacters = { Victoria: 'Victoria Kingsley', Sam: 'Sam Rivera' };
    // Director typed the full name with a pronoun; X-1 re-keys to "Victoria".
    const typed = { 'Victoria Kingsley': 'she/her' };
    const normalized = normalizeRosterPronounsToCanonical(typed, canonicalCharacters);
    const section = generateRosterSection('journalist', canonicalCharacters, null, normalized);
    expect(section).toContain('Victoria → Victoria Kingsley (she/her)');
    // Sam unset -> still they/them; proves we did not over-apply.
    expect(section).toContain('Sam → Sam Rivera (they/them)');
    // Regression guard for the masking default the audit called out.
    expect(section).not.toContain('Victoria Kingsley (they/them)');
  });
});
```

- [ ] **Step 7: Run both new describes + the full node-helpers and prompt-builder suites.** Commands:
  `npx jest lib/__tests__/node-helpers.test.js`
  `npx jest lib/__tests__/prompt-builder.test.js -t 'generateRosterSection'`
  Expected: all pass (node-helpers includes the 5 normalizer tests + the chain test; prompt-builder roster tests unchanged-green).

- [ ] **Step 8: Commit.**
  `git add lib/workflow/nodes/node-helpers.js lib/workflow/nodes/input-nodes.js lib/__tests__/node-helpers.test.js && git commit -m 'fix(F1/X-1): re-key director pronouns to canonical first names at parseRawInput stamp + key-chain regression test'`

### Task 8.3: InputReview looks up pronouns by the canonical key it displays (X-4)

**Files:**
- Create dual-export module: `console/input-review-logic.js` (pure `resolveRosterPronoun` + dedup of the lookup logic; `window.Console.inputReviewLogic` + node `module.exports` guard, per reports/CLAUDE.md console testing rule)
- Modify: `console/components/checkpoints/InputReview.js:112` (use the shared resolver)
- Modify: `console/index.html` (add the new `<script type="text/babel">` before `InputReview.js` in load order)
- Test: `console/__tests__/input-review-logic.test.js` (new node-env test)

Context (confirmed by read): InputReview.js:62-63 reads `roster = sessionConfig.roster` and `rosterPronouns = sessionConfig.rosterPronouns`; line 112 does `rosterPronouns[name] || 'they/them'` with `name` from `sessionConfig.roster` (the LLM-parsed first names). After Task 8.2, `sessionConfig.rosterPronouns` is canonical-first-name-keyed, and `sessionConfig.roster` is the parsed first-name list — but there is still NO case-insensitive fallback, so any case divergence between the parsed roster entry and the canonical key shows they/them at the review gate. We extract a tolerant resolver and unit-test it (the React wiring itself stays manual-verify, per the console testing rule).

- [ ] **Step 1: Write the failing node-env test for the resolver.** Create `console/__tests__/input-review-logic.test.js`:

```javascript
/**
 * Node-env unit tests for the InputReview pronoun resolver (F1 / X-4).
 * Pure logic extracted to a dual-export module per reports/CLAUDE.md.
 */
const { resolveRosterPronoun } = require('../input-review-logic');

describe('resolveRosterPronoun (X-4 review-gate lookup)', () => {
  const map = { Victoria: 'she/her', Sam: 'he/him' };

  it('returns the exact-key pronoun', () => {
    expect(resolveRosterPronoun('Victoria', map)).toBe('she/her');
  });

  it('is case-insensitive (parsed "victoria" still finds the director-set pronoun)', () => {
    expect(resolveRosterPronoun('victoria', map)).toBe('she/her');
  });

  it('defaults to they/them for an unknown name', () => {
    expect(resolveRosterPronoun('Mystery', map)).toBe('they/them');
  });

  it('defaults to they/them for a null/empty map', () => {
    expect(resolveRosterPronoun('Victoria', null)).toBe('they/them');
    expect(resolveRosterPronoun('Victoria', {})).toBe('they/them');
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.** Command:
  `npx jest console/__tests__/input-review-logic.test.js`
  Expected: fails — `Cannot find module '../input-review-logic'` (the module does not exist yet).

- [ ] **Step 3: Create the dual-export module.** Create `console/input-review-logic.js`:

```javascript
/**
 * input-review-logic.js — pure, dual-export logic for the InputReview checkpoint.
 *
 * Browser: registers on window.Console.inputReviewLogic.
 * Node: module.exports (unit-tested in node-env; reports/CLAUDE.md console rule —
 *       no DOM/React harness, so pure logic lives here and the React component
 *       is a thin consumer verified manually).
 */
(function () {
  /**
   * Resolve a character's pronouns for display at the input-review gate.
   * Tolerant of case divergence between the parsed roster name and the
   * (canonical-keyed, post-X-1) pronoun map; defaults to they/them.
   *
   * @param {string} name - roster name as parsed into sessionConfig.roster
   * @param {Object|null} rosterPronouns - canonical-first-name-keyed pronoun map
   * @returns {string} pronoun string, or 'they/them'
   */
  function resolveRosterPronoun(name, rosterPronouns) {
    const map = rosterPronouns || {};
    if (map[name]) return map[name];
    const lower = String(name).toLowerCase();
    const key = Object.keys(map).find(k => k.toLowerCase() === lower);
    return key ? map[key] : 'they/them';
  }

  const api = { resolveRosterPronoun };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.inputReviewLogic = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
```

- [ ] **Step 4: Re-run, confirm green.** Command:
  `npx jest console/__tests__/input-review-logic.test.js`
  Expected: 4 passing.

- [ ] **Step 5: Consume the resolver in InputReview.js.** First wire the module-scope alias near the existing import at InputReview.js:11:

  Before:
  ```javascript
  const { Badge, safeStringify } = window.Console.utils;
  ```

  After:
  ```javascript
  const { Badge, safeStringify } = window.Console.utils;
  const { resolveRosterPronoun } = window.Console.inputReviewLogic;
  ```

  Then replace the lookup at InputReview.js:112:

  Before:
  ```javascript
        roster.map(function (name) {
          const pronouns = rosterPronouns[name] || 'they/them';
          return React.createElement(Badge, { key: name, label: name + ' (' + pronouns + ')', color: 'var(--accent-cyan)' });
        })
  ```

  After:
  ```javascript
        roster.map(function (name) {
          const pronouns = resolveRosterPronoun(name, rosterPronouns);
          return React.createElement(Badge, { key: name, label: name + ' (' + pronouns + ')', color: 'var(--accent-cyan)' });
        })
  ```

- [ ] **Step 6: Add the script tag to the SPA shell in load order.** In `console/index.html`, add the new script tag immediately BEFORE the `InputReview.js` tag (so `window.Console.inputReviewLogic` exists when InputReview.js's module scope runs). Confirm the exact existing line first:
  `grep -n 'checkpoints/InputReview.js\|input-review-logic.js' console/index.html`
  Expected: one hit for `InputReview.js`, none for `input-review-logic.js`. Then insert before it:

  Before:
  ```html
      <script type="text/babel" src="components/checkpoints/InputReview.js"></script>
  ```

  After:
  ```html
      <script type="text/babel" src="input-review-logic.js"></script>
      <script type="text/babel" src="components/checkpoints/InputReview.js"></script>
  ```

- [ ] **Step 7: Manual browser verification (no React harness — console wiring rule).** With the server running (`npm start`), open `http://localhost:3001/console`, resume a session to the `input-review` checkpoint where the director set a non-default pronoun (e.g. Victoria → she/her). Confirm the Roster section renders `Victoria (she/her)` — not `Victoria (they/them)`. Note in the commit body that the React wiring was verified manually; the resolver itself is unit-tested.

- [ ] **Step 8: Commit.**
  `git add console/input-review-logic.js console/components/checkpoints/InputReview.js console/index.html console/__tests__/input-review-logic.test.js && git commit -m 'fix(F1/X-4): tolerant canonical-keyed pronoun lookup at InputReview gate via dual-export resolver + node-env test'`

### Task 8.4: Collapse the rosterPronouns dual source-of-truth — read one place (CR-6)

**Files:**
- Modify: `lib/workflow/nodes/input-nodes.js:428` (drop the `state.rosterPronouns` channel read at the stamp; the canonical-keyed `sessionConfig.rosterPronouns` becomes the single downstream source)
- Test: `lib/__tests__/node-helpers.test.js` (assert the stamp precedence is correct — extend, no new file)

Context (confirmed by read + CR-6 in handoff.md): `rosterPronouns` exists in two places — the LangGraph channel `state.rosterPronouns` (state.js:207, set by the await-roster approval via Task 8.1) AND the copy carried into `sessionConfig.rosterPronouns` by `parseRawInput` (input-nodes.js:428). Everything downstream of parseRawInput (prompt-builder via ai-nodes `getPromptBuilder` → `sessionConfig`, and InputReview) reads the `sessionConfig` copy. CR-6 says: single source. The stamp at 428 is the bridge point — `state.rosterPronouns` (raw typed map from the channel) is consumed ONCE there, normalized, and written into `sessionConfig.rosterPronouns`; nothing downstream should read the raw channel again. This task makes that intent explicit and documents that `sessionConfig.rosterPronouns` is the canonical single source post-parse, so a future reader does not re-introduce a channel read with the wrong (typed) key domain.

- [ ] **Step 1: Confirm no downstream consumer reads the raw `state.rosterPronouns` channel after parseRawInput.** Command:
  `grep -rn "rosterPronouns" lib/ console/ server.js --include=*.js | grep -v __tests__`
  Expected hits and their roles (verify each is one of):
  - `lib/workflow/state.js:207` — channel definition (kept; set by await-roster approval).
  - `lib/workflow/nodes/input-nodes.js:428` — THE stamp (the single channel→sessionConfig bridge).
  - `lib/prompt-builder.js:22/24` — reads the passed-in `rosterPronouns` arg (fed from `sessionConfig`, not the channel).
  - `console/components/checkpoints/InputReview.js` — reads `sessionConfig.rosterPronouns`.
  - `console/components/checkpoints/AwaitRoster.js` — produces the typed map (capture side).
  - `server.js` — the await-roster branch from Task 8.1 (capture side).
  If any OTHER node reads `state.rosterPronouns` directly for prompt/render, it is a second source — STOP and fold it through `sessionConfig` instead. (Per the read at audit time, there is none; this step guards against drift from a sibling phase.)

- [ ] **Step 2: Write the failing precedence test for the single-source stamp.** This asserts the stamp reads the channel exactly once and that `sessionConfig.rosterPronouns` (the single source) wins over `rawInput.rosterPronouns`. Append to `lib/__tests__/node-helpers.test.js`:

```javascript
describe('F1 single-source stamp precedence (CR-6)', () => {
  const { normalizeRosterPronounsToCanonical } = require('../workflow/nodes/node-helpers');
  // Mirror the exact stamp expression from input-nodes.js:428 so this test
  // pins the precedence contract that parseRawInput depends on.
  function stamp(stateChannel, rawInput, canonicalCharacters) {
    return normalizeRosterPronounsToCanonical(
      stateChannel || rawInput || {},
      canonicalCharacters || {}
    );
  }
  const canonical = { Victoria: 'Victoria Kingsley' };

  it('the await-roster channel value takes precedence over rawInput', () => {
    const out = stamp({ Victoria: 'she/her' }, { Victoria: 'he/him' }, canonical);
    expect(out.Victoria).toBe('she/her');
  });

  it('falls back to rawInput.rosterPronouns when the channel is empty', () => {
    const out = stamp(null, { 'Victoria Kingsley': 'they/them' }, canonical);
    expect(out.Victoria).toBe('they/them');
  });

  it('yields {} when neither source supplies pronouns', () => {
    expect(stamp(null, null, canonical)).toEqual({});
  });
});
```

- [ ] **Step 3: Run, confirm pass-or-fail honestly.** Command:
  `npx jest lib/__tests__/node-helpers.test.js -t 'single-source stamp precedence'`
  Expected: PASSES immediately — Task 8.2 already implemented the exact precedence (`state.rosterPronouns || rawInput.rosterPronouns || {}` → normalize). This test is a characterization lock, not a red-first driver; its job is to FAIL if a future edit re-orders the precedence or re-introduces a second source. (If it fails now, Task 8.2 was applied incorrectly — fix the stamp, do not weaken the test.)

- [ ] **Step 4: Make the single-source intent explicit at the stamp.** Tighten the comment block added in Task 8.2 so the channel is documented as consumed-once. In `input-nodes.js`, replace the Task-8.2 comment + stamp:

  Before:
  ```javascript
      // F1 (X-1): re-key director-typed pronouns to canonical first names so
      // generateRosterSection.resolvePronouns (which iterates canonicalCharacters
      // keys) finds them. Without this, "Victoria Kingsley"/"victoria" silently
      // resolve to they/them.
      result.rosterPronouns = normalizeRosterPronounsToCanonical(
        state.rosterPronouns || rawInput.rosterPronouns || {},
        state.canonicalCharacters || {}
      );
  ```

  After:
  ```javascript
      // F1 (X-1 + CR-6): consume the raw rosterPronouns channel EXACTLY ONCE here.
      // The await-roster approval writes typed-keyed pronouns to state.rosterPronouns
      // (the channel); this is the single bridge that normalizes them to canonical
      // first-name keys and stamps them onto sessionConfig.rosterPronouns. From this
      // point on, sessionConfig.rosterPronouns is the ONE source of truth — every
      // downstream reader (prompt-builder via getPromptBuilder, InputReview) reads
      // the sessionConfig copy, NOT the raw channel (whose key domain is typed, not
      // canonical). Do not re-read state.rosterPronouns downstream.
      result.rosterPronouns = normalizeRosterPronounsToCanonical(
        state.rosterPronouns || rawInput.rosterPronouns || {},
        state.canonicalCharacters || {}
      );
  ```

- [ ] **Step 5: Re-run the precedence lock + the full input/roster surface.** Commands:
  `npx jest lib/__tests__/node-helpers.test.js -t 'single-source stamp precedence'`
  `npx jest lib/__tests__/node-helpers.test.js lib/__tests__/prompt-builder.test.js __tests__/unit/server-build-resume-payload.test.js`
  Expected: all green — the three F1 links (8.1 server forward, 8.2 normalize, 8.4 single-source lock) pass together.

- [ ] **Step 6: Commit.**
  `git add lib/workflow/nodes/input-nodes.js lib/__tests__/node-helpers.test.js && git commit -m 'fix(F1/CR-6): document single-source rosterPronouns stamp + precedence lock test (channel consumed once, sessionConfig is canonical)'`

---

## Phase P9: Complete F3 (crystallization/pull-quotes) — schema + outline contract

Goal: Attribution-less crystallization quote blocks validate against the content-bundle schema and render as inline `quote` blocks; the outline phase stops planning per-section `pullQuotes` that the post-F3 article phase ignores, and the dead `pullQuoteCount`/`minPullQuotes>0` post-gen guards (plus their false "revision loop" comment) are removed.

Dependencies: None within the remediation set — P9 touches only `lib/schemas/content-bundle.schema.json`, `lib/schemas/outline.schema.json`, `lib/prompt-builder.js`, and `lib/workflow/nodes/ai-nodes.js`. It coordinates on `prompt-builder.js` with the F1 phase (different methods/line ranges — `buildOutlinePrompt`/`buildArticlePrompt` JSON skeletons here vs. `generateRosterSection` there), so land whichever of the two is ready; no ordering constraint. Resolves CR-2, X-5, CR-8.

### Task 9.1: Make `attribution` optional on the `quote` content-block variant (CR-2)

**Files:**
- Modify: `lib/schemas/content-bundle.schema.json:123-132` (the `quote` variant in `sections[].content[].items.oneOf`)
- Test: `lib/__tests__/content-bundle-quote-attribution.test.js` (Create)

- [ ] **Step 1: Write the failing test FIRST.** The current schema (`content-bundle.schema.json:125`) lists `"required": ["type", "text", "attribution"]`, so a crystallization quote block with attribution omitted is rejected — which is exactly the CR-2 contradiction (`prompt-builder.js:884` tells the model to omit attribution; the schema then rejects the bundle *after* the human approved). Create `lib/__tests__/content-bundle-quote-attribution.test.js`:

  ```javascript
  const { SchemaValidator } = require('../schema-validator');

  describe('content-bundle quote content-block — F3 crystallization (CR-2)', () => {
    const validator = new SchemaValidator();

    function bundleWithQuoteBlock(quoteBlock) {
      return {
        metadata: {
          sessionId: '1221',
          theme: 'journalist',
          generatedAt: '2027-02-22T18:00:00.000Z'
        },
        headline: { main: 'A headline long enough' },
        sections: [
          {
            id: 'the-story',
            type: 'narrative',
            content: [
              { type: 'paragraph', text: 'Setup prose.' },
              quoteBlock,
              { type: 'paragraph', text: 'Payoff prose.' }
            ]
          }
        ]
      };
    }

    it('accepts a crystallization quote block with attribution OMITTED', () => {
      const result = validator.validate(
        'content-bundle',
        bundleWithQuoteBlock({ type: 'quote', text: 'The room rewrote the night it had just lived.' })
      );
      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('still accepts a verbatim quote block WITH attribution', () => {
      const result = validator.validate(
        'content-bundle',
        bundleWithQuoteBlock({ type: 'quote', text: "I never touched the account.", attribution: 'Skyler' })
      );
      expect(result.valid).toBe(true);
    });

    it('rejects a quote block with no text', () => {
      const result = validator.validate(
        'content-bundle',
        bundleWithQuoteBlock({ type: 'quote', attribution: 'Skyler' })
      );
      expect(result.valid).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run the test, confirm it fails on the attribution-omitted case.**
  ```
  npx jest lib/__tests__/content-bundle-quote-attribution.test.js -t 'attribution OMITTED'
  ```
  Expected: FAIL — Ajv reports `must have required property 'attribution'` for the `quote` `oneOf` branch (`result.valid === false`), so `expect(result.valid).toBe(true)` fails.

- [ ] **Step 3: Make `attribution` optional on the `quote` variant.** Edit `lib/schemas/content-bundle.schema.json:123-132`. Before:
  ```json
                {
                  "type": "object",
                  "required": ["type", "text", "attribution"],
                  "properties": {
                    "type": { "const": "quote" },
                    "text": { "type": "string" },
                    "attribution": { "type": "string" }
                  },
                  "additionalProperties": false
                },
  ```
  After:
  ```json
                {
                  "type": "object",
                  "required": ["type", "text"],
                  "properties": {
                    "type": { "const": "quote" },
                    "text": { "type": "string", "minLength": 1 },
                    "attribution": {
                      "type": "string",
                      "description": "Speaker name for a verbatim quote. OMIT for a crystallization quote (journalist insight, no '— Nova'). See lib/prompt-builder.js CRYSTALLIZATION & VERBATIM MOMENTS."
                    }
                  },
                  "additionalProperties": false
                },
  ```
  (Note: `attribution` stays a plain `string` — when present it must be a string; it is simply no longer required. `text` gains `minLength: 1` so the "no text" rejection in Step 1 still holds for the right reason. `additionalProperties: false` is preserved.)

- [ ] **Step 4: Re-run the test, confirm all three pass.**
  ```
  npx jest lib/__tests__/content-bundle-quote-attribution.test.js
  ```
  Expected: PASS (3 passed) — attribution-omitted valid, attribution-present valid, missing-text invalid.

- [ ] **Step 5: Run the full schema-validator / content-bundle suite to confirm no regression** (the change only relaxes a `required`, but verify nothing asserted the old shape):
  ```
  npx jest lib/__tests__/schema-validator.test.js lib/__tests__/content-bundle-quote-attribution.test.js
  ```
  Expected: PASS (if `schema-validator.test.js` does not exist, the command runs only the new file — still PASS).

- [ ] **Step 6: Commit.**
  ```
  git add lib/schemas/content-bundle.schema.json lib/__tests__/content-bundle-quote-attribution.test.js && git commit -m "fix(F3): make attribution optional on quote content-block (CR-2)

Crystallization quote blocks omit attribution by design (prompt-builder.js
CRYSTALLIZATION & VERBATIM MOMENTS), but the schema required it -> approved
bundle failed validateContentBundle -> END(error) after human approval.
Relax the quote oneOf branch to require only [type, text]; keep
additionalProperties:false. Do NOT reroute to pullQuotes (not rendered).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 9.2: Remove `pullQuotes` from the outline contract — prompt skeleton + schema (X-5)

**Files:**
- Modify: `lib/prompt-builder.js:547-550` (`buildOutlinePrompt` JSON skeleton — `thePlayers.pullQuotes`)
- Modify: `lib/schemas/outline.schema.json:199-223` (`thePlayers.pullQuotes` property)
- Test: `lib/__tests__/outline-no-pullquotes.test.js` (Create)

- [ ] **Step 1: Write the failing test FIRST.** Post-F3 the article phase ignores planned pull-quotes, but `buildOutlinePrompt` still elicits a `thePlayers.pullQuotes` array (`prompt-builder.js:547`) and `outline.schema.json:199` still permits it — so the approved outline plans quotes the article drops, and (with X-5) the schema would happily validate an outline carrying them. Create `lib/__tests__/outline-no-pullquotes.test.js`:

  ```javascript
  const { PromptBuilder } = require('../prompt-builder');
  const outlineSchema = require('../schemas/outline.schema.json');

  describe('outline contract — pullQuotes removed post-F3 (X-5)', () => {
    it('outline JSON skeleton in the prompt no longer elicits pullQuotes', async () => {
      const builder = new PromptBuilder('journalist');
      const { userPrompt } = await builder.buildOutlinePrompt(
        [{ arcId: 'arc-1', arcTitle: 'The Money', summary: 'x', evidenceIds: [] }],
        { exposed: [], buried: [] },
        []
      );
      expect(userPrompt).not.toContain('"pullQuotes"');
    });

    it('outline schema no longer defines a thePlayers.pullQuotes property', () => {
      expect(outlineSchema.properties.thePlayers.properties).not.toHaveProperty('pullQuotes');
    });
  });
  ```
  (Confirm the `buildOutlinePrompt` argument shape at task time by reading the method signature: `npx jest lib/__tests__/outline-no-pullquotes.test.js -t skeleton` will surface a wrong-arity error if the args differ — adjust the call to match the real signature near `prompt-builder.js` `buildOutlinePrompt(`.)

- [ ] **Step 2: Run the test, confirm both cases fail.**
  ```
  npx jest lib/__tests__/outline-no-pullquotes.test.js
  ```
  Expected: FAIL — the prompt still contains `"pullQuotes"` (line 547) and `outlineSchema.properties.thePlayers.properties` still has a `pullQuotes` key (line 199).

- [ ] **Step 3: Remove the `pullQuotes` block from the prompt skeleton.** Edit `lib/prompt-builder.js:541-551`. Before:
  ```javascript
  "thePlayers": {
    "arcConnections": [
      {"arcName": "Arc A", "characterAngle": "How this arc advances through character revelation"}
    ],
    "exposed": ["names"],
    "buried": ["names"],
    "pullQuotes": [
      {"type": "verbatim", "text": "Exact quote from evidence", "attribution": "Character Name", "advancesArc": "Arc name"},
      {"type": "insight", "text": "Nova's crystallized observation", "attribution": null, "advancesArc": "Arc name"}
    ]
  },
  ```
  After:
  ```javascript
  "thePlayers": {
    "arcConnections": [
      {"arcName": "Arc A", "characterAngle": "How this arc advances through character revelation"}
    ],
    "exposed": ["names"],
    "buried": ["names"]
  },
  ```

- [ ] **Step 4: Remove the `pullQuotes` property from the outline schema.** Edit `lib/schemas/outline.schema.json` — delete the entire `pullQuotes` property block at lines 199-223 (from `"pullQuotes": {` through its closing `},` that precedes `"characterHighlights"`). Before:
  ```json
        "buried": {
          "type": "array",
          "description": "Character names whose evidence was buried",
          "items": { "type": "string" }
        },
        "pullQuotes": {
          "type": "array",
          "description": "Pull quotes planned for this section",
          "items": {
            "type": "object",
            "required": ["type", "text"],
            "additionalProperties": false,
            "properties": {
              "type": {
                "type": "string",
                "enum": ["verbatim", "insight", "crystallization"],
                "description": "verbatim = exact quote with attribution, insight/crystallization = journalist's observation without attribution"
              },
              "text": { "type": "string", "description": "Quote text" },
              "attribution": {
                "type": ["string", "null"],
                "description": "Character name for verbatim quotes, null for crystallization"
              },
              "advancesArc": {
                "type": "string",
                "description": "Which arc this quote advances"
              }
            }
          }
        },
        "characterHighlights": {
  ```
  After:
  ```json
        "buried": {
          "type": "array",
          "description": "Character names whose evidence was buried",
          "items": { "type": "string" }
        },
        "characterHighlights": {
  ```
  (`thePlayers` keeps `additionalProperties: false` at line 174 — confirm no other property `required`-references `pullQuotes`: `thePlayers.required` is `["arcConnections"]` at line 174, so removal is safe.)

- [ ] **Step 5: Re-run the test, confirm both pass.**
  ```
  npx jest lib/__tests__/outline-no-pullquotes.test.js
  ```
  Expected: PASS (2 passed).

- [ ] **Step 6: Confirm the schema still compiles** (Ajv compiles all schemas in the `SchemaValidator` constructor; a malformed JSON edit throws there). Run any test that instantiates `SchemaValidator`:
  ```
  npx jest lib/__tests__/content-bundle-quote-attribution.test.js
  ```
  Expected: PASS — no `Failed to compile schema 'outline'` error, proving the edited `outline.schema.json` is still valid JSON Schema.

- [ ] **Step 7: Commit.**
  ```
  git add lib/prompt-builder.js lib/schemas/outline.schema.json lib/__tests__/outline-no-pullquotes.test.js && git commit -m "fix(F3): drop pullQuotes from the outline contract (X-5)

The article phase ignores planned per-section pull-quotes post-F3, but
buildOutlinePrompt still elicited thePlayers.pullQuotes and outline.schema.json
still permitted them -> the approved outline planned quotes the article drops.
Remove the pullQuotes block from the prompt JSON skeleton and the
thePlayers.pullQuotes property from the schema. Crystallization now flows
through inline quote content-blocks only (CR-2).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 9.3: Delete the dead `pullQuoteCount`/`minPullQuotes>0` post-gen guards + false "revision loop" comment (CR-8)

**Files:**
- Modify: `lib/workflow/nodes/ai-nodes.js:1214-1233` (post-generation logging in `generateContentBundle`)
- Test: `lib/__tests__/ai-nodes-postgen-no-pullquote-guard.test.js` (Create)

- [ ] **Step 1: Establish the dead-code facts before deleting.** `theme-config.js:91` and `:151` both set `display.postGenValidation.minPullQuotes = 0` for journalist and detective, so `themeDisplay.minPullQuotes ?? 2` (`ai-nodes.js:1214`) resolves to `0` for every real theme and the `?? 2` fallback only fires for an unconfigured theme that does not exist. With `minPullQuotes === 0`, the `minPullQuotes > 0` guards at `:1226`, `:1231-1233` are dead, and the comment "validation will trigger revision loop" is false — there is no pull-quote revision criterion post-F3 (the article phase ignores `pullQuotes` entirely). Confirm no live consumer of `minPullQuotes` remains:
  ```
  npx jest lib/__tests__/theme-config.test.js -t minPullQuotes
  ```
  Expected: PASS — codifies `minPullQuotes` is `0` for both themes (this test stays; it guards the config value, which we leave in place per the interface contract scope of P9).

- [ ] **Step 2: Write the failing/guard test FIRST.** This is a source-shape guard (the logic is logging-only, so assert the dead identifiers are gone from `generateContentBundle`'s source). Create `lib/__tests__/ai-nodes-postgen-no-pullquote-guard.test.js`:

  ```javascript
  const fs = require('fs');
  const path = require('path');

  describe('generateContentBundle post-gen logging — dead pullQuote guards removed (CR-8)', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'workflow', 'nodes', 'ai-nodes.js'),
      'utf8'
    );

    it('no longer computes minPullQuotes', () => {
      expect(src).not.toMatch(/minPullQuotes/);
    });

    it('no longer computes pullQuoteCount', () => {
      expect(src).not.toMatch(/pullQuoteCount/);
    });

    it('no longer claims pull quotes trigger a revision loop', () => {
      expect(src).not.toMatch(/INSUFFICIENT pull quotes/);
    });

    it('still logs the inline evidence-card check (kept)', () => {
      expect(src).toMatch(/minInlineCards/);
    });
  });
  ```

- [ ] **Step 3: Run the test, confirm the three "removed" cases fail.**
  ```
  npx jest lib/__tests__/ai-nodes-postgen-no-pullquote-guard.test.js
  ```
  Expected: FAIL — `minPullQuotes`, `pullQuoteCount`, and `INSUFFICIENT pull quotes` are all still present (lines 1214/1220/1232); the `minInlineCards` "kept" case PASSES.

- [ ] **Step 4: Delete the dead pull-quote computation, log line, and guard.** Edit `lib/workflow/nodes/ai-nodes.js:1213-1233`. Before:
  ```javascript
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
  After:
  ```javascript
    const themeDisplay = getThemeConfig(articleTheme)?.display?.postGenValidation || {};
    const minInlineCards = themeDisplay.minInlineEvidenceCards ?? 3;

    const inlineEvidenceCards = (generatedContent.sections || []).flatMap(s =>
      (s.content || []).filter(c => c.type === 'evidence-card')
    );
    const sidebarCardCount = (generatedContent.evidenceCards || []).length;

    console.log(`[generateContentBundle] Post-generation: Visual components generated:`);
    console.log(`  Inline evidence-cards: ${inlineEvidenceCards.length}${minInlineCards > 0 ? ` (minimum ${minInlineCards} required)` : ''}`);
    console.log(`  Sidebar evidence cards: ${sidebarCardCount}`);

    if (minInlineCards > 0 && inlineEvidenceCards.length < minInlineCards) {
      console.warn(`  ⚠ INSUFFICIENT inline evidence-cards — does not meet the inline-card minimum`);
    }
  ```
  (Removed: `minPullQuotes`, `pullQuoteCount`, the "Pull quotes:" log line, and the `minPullQuotes > 0` guard. Also corrected the surviving inline-card warning's tail — the "validation will trigger revision loop" claim was false here too; there is no post-gen revision routing in this node, the warning is log-only.)

- [ ] **Step 5: Re-run the guard test, confirm all four pass.**
  ```
  npx jest lib/__tests__/ai-nodes-postgen-no-pullquote-guard.test.js
  ```
  Expected: PASS (4 passed) — the three removed identifiers are gone, `minInlineCards` is kept.

- [ ] **Step 6: Run the existing ai-nodes suite to confirm `generateContentBundle` still parses and behaves** (the deletion is logging-only; this catches a stray syntax error):
  ```
  npx jest lib/__tests__/ai-nodes.test.js
  ```
  Expected: PASS — if no `ai-nodes.test.js` exists, run `node -e "require('./lib/workflow/nodes/ai-nodes.js')"` instead and expect no error (module loads cleanly).

- [ ] **Step 7: Commit.**
  ```
  git add lib/workflow/nodes/ai-nodes.js lib/__tests__/ai-nodes-postgen-no-pullquote-guard.test.js && git commit -m "fix(F3): delete dead pullQuote post-gen guards + false revision-loop comment (CR-8)

minPullQuotes is 0 for every real theme (theme-config), so the minPullQuotes>0
guard and the '?? 2' fallback (unreachable) were dead, and 'validation will
trigger revision loop' was false post-F3 (the article phase ignores pullQuotes
and there is no post-gen revision routing here). Remove the pullQuoteCount
computation, the Pull quotes log line, and the guard; keep the inline
evidence-card check and correct its log-only warning text.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

## Phase P10: Complete F4 + F9 — live prompt example + live validators
Goal: No retired identifiers anchor the live article prompt; the bare-"token" ban is scoped to allow "memory token" in the validators that actually execute, and the dead `bannedPatterns` config (which never ran) is removed so the ban is unambiguously prompt-only.
Dependencies: None. P10 touches `lib/prompt-builder.js`, `lib/theme-config.js`, `lib/workflow/nodes/evaluator-nodes.js`, and `lib/__tests__/theme-config.test.js` only — independent of Workstreams A/B and the other C phases (no shared `server.js` edits). Land any time; coordinate merge order on `prompt-builder.js` if a sibling C phase (F1/F3) is in flight, but there is no line overlap (P10 edits lines 876-877 and 1156-1164; F1 edits the `generateRosterSection` block ~33-130 and ~603-1079; F3 edits ~547 and ~883).

### Task 10.1: Replace retired identifiers in the live article prompt example (X-3 / F4)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\prompt-builder.js:876-877`
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\prompt-builder-banned-identifiers.test.js` (Create)

The EVIDENCE-CARD INLINE EXAMPLE hardcodes retired identifiers `jav042`/`JAV042`, "Victoria", "Jamie Woods" (prompt-builder.js:876-877). These anchor the model on identifiers the F4 cleanup retired everywhere else. F4 only touched fetch scripts + agent `.md` files; this live `buildArticlePrompt` string was missed. Replace with neutral placeholders (`tok001` / `[Character A]`) so the example teaches *shape*, never a specific retired person or token.

- [ ] **Step 1: Write the failing guard test FIRST.** This test asserts the assembled article prompt contains no retired identifiers. Create `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\prompt-builder-banned-identifiers.test.js`:

```js
/**
 * F4 (X-3) regression guard: the live article prompt must not anchor the model
 * on retired identifiers (jav042/JAV042, "Victoria", "Jamie Woods").
 * The EVIDENCE-CARD INLINE EXAMPLE must use neutral placeholders instead.
 */
const fs = require('fs');
const path = require('path');

describe('F4: no retired identifiers in the article prompt source', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );

  // Scope the assertion to the EVIDENCE-CARD INLINE EXAMPLE block so we don't
  // accidentally trip on unrelated prose elsewhere in the file.
  const exampleStart = src.indexOf('EVIDENCE-CARD INLINE EXAMPLE:');
  const exampleEnd = src.indexOf('CRYSTALLIZATION & VERBATIM MOMENTS:');
  const example = src.slice(exampleStart, exampleEnd);

  it('locates the example block', () => {
    expect(exampleStart).toBeGreaterThan(-1);
    expect(exampleEnd).toBeGreaterThan(exampleStart);
  });

  it('contains no retired token id (jav042/JAV042)', () => {
    expect(/jav042/i.test(example)).toBe(false);
  });

  it('contains no retired character names (Victoria / Jamie Woods)', () => {
    expect(example).not.toMatch(/Victoria/);
    expect(example).not.toMatch(/Jamie Woods/);
  });

  it('uses neutral placeholders (tok001 + [Character A])', () => {
    expect(example).toContain('tok001');
    expect(example).toContain('[Character A]');
  });
});
```

- [ ] **Step 2: Run it — expect RED.** Command:

```
npx jest lib/__tests__/prompt-builder-banned-identifiers.test.js
```

Expected: the "locates the example block" + placeholder tests fail (jav042/Victoria/Jamie Woods still present, `tok001`/`[Character A]` absent). Concretely the three content tests fail with `expect(...).toBe(false)` receiving `true` and the `toContain` assertions receiving the old string.

- [ ] **Step 3: Edit prompt-builder.js:876-877.** Exact before:

```js
    {"type": "paragraph", "text": "I watched them circle each other, Victoria's composure finally cracking..."},
    {"type": "evidence-card", "tokenId": "jav042", "headline": "The Moment of Truth", "content": "JAV042 - 12:17AM - [Full verbatim text from arcEvidencePackages.evidenceItems[].fullContent - do NOT truncate or summarize]", "owner": "Jamie Woods", "significance": "critical"},
```

Exact after:

```js
    {"type": "paragraph", "text": "I watched them circle each other, [Character A]'s composure finally cracking..."},
    {"type": "evidence-card", "tokenId": "tok001", "headline": "The Moment of Truth", "content": "[Token ID] - [timestamp] - [Full verbatim text from arcEvidencePackages.evidenceItems[].fullContent - do NOT truncate or summarize]", "owner": "[Character A]", "significance": "critical"},
```

- [ ] **Step 4: Re-run — expect GREEN.** Command:

```
npx jest lib/__tests__/prompt-builder-banned-identifiers.test.js
```

Expected: `Tests: 4 passed, 4 total`.

- [ ] **Step 5: Grep-assert no other live retired identifier in the prompt builder.** Command (should print nothing):

```
npx jest --listTests >/dev/null 2>&1; grep -niE 'jav042|jamie woods|"Victoria' lib/prompt-builder.js
```

Expected: empty output (exit 1 from grep is fine — it means no matches).

- [ ] **Step 6: Commit.**

```
git add lib/prompt-builder.js lib/__tests__/prompt-builder-banned-identifiers.test.js
git commit -m "fix(prompt): purge retired jav042/Victoria/Jamie Woods from live article example (X-3/F4)

The EVIDENCE-CARD INLINE EXAMPLE in buildArticlePrompt anchored every
journalist run on identifiers F4 retired elsewhere. Replace with neutral
placeholders (tok001 / [Character A]) and add a source-grep regression guard.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10.2: Delete the dead `bannedPatterns` config + `getArticleRules` (CR-5 / F9)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\theme-config.js:48-77` (journalist `articleRules`), `:120-140` (detective `articleRules`), `:194-201` (`getArticleRules`), `:238` (export)
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\theme-config.test.js:6-15` (import), `:34-37` `:55-62` `:118-170` `:186-217` `:321-328` (the `getArticleRules`/`articleRules` assertions)

`getArticleRules` and the `bannedPatterns` arrays have **zero runtime consumers** — confirmed by grep: the only references are the audit docs, the plan docs, and this one test file. The programmatic-validation pipeline the 8.19 comment claims (`Used by programmatic validation BEFORE LLM evaluation`) never wired these in; ban enforcement is entirely prompt-driven (anti-patterns.md + the evaluator/validation prompts). Delete the dead config, the accessor, and the test that guarded the dead regex; document that the ban is prompt-only.

- [ ] **Step 1: Confirm zero runtime consumers (verification command, run before deleting).** Command:

```
grep -rnE 'getArticleRules|\.bannedPatterns|requiredVoiceMarkers|minRosterMentions' --include='*.js' lib scripts console server.js | grep -v '__tests__'
```

Expected: empty output. (If any non-test `.js` line prints, STOP — a consumer exists and this task's premise is wrong; reassess before deleting.)

- [ ] **Step 2: Write the failing "config is gone" assertion FIRST (TDD for a deletion).** Replace the entire `describe('getArticleRules', ...)` block (theme-config.test.js:118-170) with a negative-space guard, and the import. First, edit the import at theme-config.test.js:6-15. Before:

```js
const {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getArticleRules,
  getCanonicalName,
  getThemeCharacters
} = require('../theme-config');
```

After:

```js
const {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getArticleRules,
  getCanonicalName,
  getThemeCharacters
} = require('../theme-config');
// getArticleRules is intentionally still destructured above to PROVE it is
// undefined after deletion (see "F9: dead bannedPatterns config removed").
```

Then replace the whole `describe('getArticleRules', ...)` block (theme-config.test.js:118-170) with:

```js
  describe('F9: dead bannedPatterns config removed', () => {
    it('getArticleRules is no longer exported', () => {
      expect(getArticleRules).toBeUndefined();
    });

    it('journalist config carries no articleRules', () => {
      expect(THEME_CONFIGS.journalist.articleRules).toBeUndefined();
    });

    it('detective config carries no articleRules', () => {
      expect(THEME_CONFIGS.detective.articleRules).toBeUndefined();
    });

    it('no theme retains a bannedPatterns array', () => {
      for (const cfg of Object.values(THEME_CONFIGS)) {
        expect(cfg.articleRules).toBeUndefined();
      }
    });
  });
```

- [ ] **Step 3: Remove the now-stale `articleRules` assertions in the sibling describes.** In `describe('THEME_CONFIGS')` delete theme-config.test.js:34-37 (the `journalist should have articleRules object` it-block). In `describe('getThemeConfig')` (journalist) delete the line `expect(config.articleRules).toBeDefined();` at :61. In `describe('detective theme')` delete `expect(config.articleRules).toBeDefined();` at :191 and the two it-blocks at :201-208 (`detective articleRules bans game mechanics but not em-dashes`) and :210-217 (`detective requiredVoiceMarkers are third-person investigative`). In `describe('module exports')` delete `expect(typeof getArticleRules).toBe('function');` at :327.

  Concrete deletions:

  Before (theme-config.test.js:34-37):
```js
    it('journalist should have articleRules object', () => {
      expect(THEME_CONFIGS.journalist.articleRules).toBeDefined();
      expect(typeof THEME_CONFIGS.journalist.articleRules).toBe('object');
    });
```
  After: (block removed entirely)

  Before (theme-config.test.js:59-61):
```js
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
      expect(config.articleRules).toBeDefined();
```
  After:
```js
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
```

  Before (theme-config.test.js:189-191):
```js
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
      expect(config.articleRules).toBeDefined();
```
  After:
```js
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
```

  Before (theme-config.test.js:201-217):
```js
    it('detective articleRules bans game mechanics but not em-dashes', () => {
      const rules = getArticleRules('detective');
      // Detective voice allows em-dashes (used in noir style)
      const patternNames = rules.bannedPatterns.map(p => p.name);
      expect(patternNames).not.toContain('em-dash');
      // Still bans game mechanics
      expect(patternNames).toContain('token-term');
    });

    it('detective requiredVoiceMarkers are third-person investigative', () => {
      const rules = getArticleRules('detective');
      // Detective uses third-person investigative, not first-person participatory
      expect(rules.requiredVoiceMarkers).not.toContain('I ');
      expect(rules.requiredVoiceMarkers).toEqual(
        expect.arrayContaining(['the investigation', 'evidence'])
      );
    });

```
  After: (both it-blocks removed entirely)

  Before (theme-config.test.js:326-327):
```js
      expect(typeof getOutlineRules).toBe('function');
      expect(typeof getArticleRules).toBe('function');
```
  After:
```js
      expect(typeof getOutlineRules).toBe('function');
```

- [ ] **Step 4: Run the test — expect RED** (config + accessor still present, so `getArticleRules`/`articleRules` are defined). Command:

```
npx jest lib/__tests__/theme-config.test.js
```

Expected: the new `F9: dead bannedPatterns config removed` block fails (`getArticleRules is no longer exported` gets a function not `undefined`; `articleRules` still defined).

- [ ] **Step 5: Delete the journalist `articleRules` block (theme-config.js:48-77).** Before:

```js
    // Article content rules (Commit 8.19)
    // Used by programmatic validation BEFORE LLM evaluation
    articleRules: {
      // Voice markers that MUST appear (structural - first-person participatory voice)
      requiredVoiceMarkers: ['I ', 'my ', 'we '],
      // Anti-patterns that MUST NOT appear (structural)
      // Extracted from anti-patterns.md "Quick Reference: Never Do This" and "Game Mechanics Language"
      bannedPatterns: [
        // Typography
        { pattern: '—', name: 'em-dash', description: 'Use hyphen (-) not em-dash (—)' },
        // Game mechanics terminology
        { pattern: '(?<!memory\\s)\\btokens?\\b', name: 'token-term', isRegex: true, caseSensitive: false, description: 'Bare "token" as a system label - use "memory token" or "extracted memory"' },
        { pattern: 'Act \\d', name: 'game-mechanics', isRegex: true, description: 'Game structure references' },
        { pattern: 'script beat', name: 'script-beat', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'final call', name: 'final-call', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'token scan', name: 'token-scan', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'orchestrator', name: 'orchestrator', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'unlock', name: 'unlock', caseSensitive: false, description: 'Game mechanic terminology' },
        // Meta terminology
        { pattern: 'buried memory', name: 'buried-memory', caseSensitive: false, description: 'Meta terminology' },
        { pattern: 'First burial', name: 'first-burial', caseSensitive: false, description: 'Meta terminology' },
        // Vague attributions (voice anti-patterns)
        { pattern: 'From my notes', name: 'vague-notes', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'From the investigation', name: 'vague-investigation', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'Sources confirm', name: 'vague-sources', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'Anonymous source', name: 'anonymous-source', caseSensitive: false, description: 'Vague attribution - cite specific evidence' }
      ],
      // Minimum roster coverage (advisory)
      minRosterMentions: 1  // Each roster member should be mentioned at least once
    },

```

After (the whole block removed; replace with a one-line provenance comment so a future reader knows enforcement moved to prompts):

```js
    // Article content rules: REMOVED (F9/CR-5). The bannedPatterns/getArticleRules
    // config had zero runtime consumers — ban enforcement is PROMPT-ONLY (see
    // anti-patterns.md + evaluator-nodes.js critical checks + buildValidationPrompt).

```

- [ ] **Step 6: Delete the detective `articleRules` block (theme-config.js:120-140).** Before:

```js
    // Article content rules for detective case report
    articleRules: {
      // Detective voice is third-person investigative
      requiredVoiceMarkers: ['the investigation', 'evidence'],
      bannedPatterns: [
        // Game mechanics terminology (shared with journalist)
        { pattern: 'token', name: 'token-term', caseSensitive: false, description: 'Game mechanic - use "extracted memory"' },
        { pattern: 'Act \\d', name: 'game-mechanics', isRegex: true, description: 'Game structure references' },
        { pattern: 'script beat', name: 'script-beat', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'final call', name: 'final-call', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'token scan', name: 'token-scan', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'orchestrator', name: 'orchestrator', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'unlock', name: 'unlock', caseSensitive: false, description: 'Game mechanic terminology' },
        // Meta terminology
        { pattern: 'buried memory', name: 'buried-memory', caseSensitive: false, description: 'Meta terminology' },
        { pattern: 'First burial', name: 'first-burial', caseSensitive: false, description: 'Meta terminology' },
        // Character sheet references (detective must present naturally)
        { pattern: 'character sheet', name: 'character-sheet', caseSensitive: false, description: 'Meta - present character info naturally' }
      ],
      minRosterMentions: 1
    },

```

After:

```js
    // Article content rules: REMOVED (F9/CR-5) — ban enforcement is PROMPT-ONLY.

```

- [ ] **Step 7: Delete `getArticleRules` (theme-config.js:194-201) and its export (theme-config.js:238).** Before (the function):

```js
/**
 * Get article rules for a theme (Commit 8.19)
 * @param {string} theme - Theme name
 * @returns {Object} Article rules or empty object if theme not found
 */
function getArticleRules(theme) {
  return THEME_CONFIGS[theme]?.articleRules || {};
}

```

After: (function removed entirely)

Before (the exports block, theme-config.js:232-241):

```js
module.exports = {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getArticleRules,
  getCanonicalName,
  getThemeCharacters
};
```

After:

```js
module.exports = {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getCanonicalName,
  getThemeCharacters
};
```

- [ ] **Step 8: Scrub the stale 8.19 file-header references to `articleRules`.** theme-config.js:5,10,14 mention `articleRules` in the header doc-comment. Read those lines and edit so the header no longer advertises removed config. Before (theme-config.js:5):

```js
 * Commit 8.19: Added outlineRules and articleRules for programmatic validation
```

After:

```js
 * Commit 8.19: Added outlineRules for programmatic validation
 * F9/CR-5: articleRules (bannedPatterns) removed — ban enforcement is prompt-only.
```

Before (theme-config.js:10):

```js
 * - articleRules: Content rules for generated articles
```

After: (line removed)

Before (theme-config.js:14):

```js
 * 2. Define npcs, outlineRules, articleRules
```

After:

```js
 * 2. Define npcs, outlineRules
```

- [ ] **Step 9: Re-run the theme-config test — expect GREEN.** Command:

```
npx jest lib/__tests__/theme-config.test.js
```

Expected: all pass, including the new `F9: dead bannedPatterns config removed` block (`getArticleRules` is `undefined`, no theme has `articleRules`/`bannedPatterns`).

- [ ] **Step 10: Run the full suite to confirm nothing else imported `getArticleRules`.** Command:

```
npx jest
```

Expected: green suite (the Step 1 grep already proved no non-test consumer; this confirms no test in another file imports it). If a failure names `getArticleRules`, that file is an undiscovered consumer — fix it before committing.

- [ ] **Step 11: Commit.**

```
git add lib/theme-config.js lib/__tests__/theme-config.test.js
git commit -m "chore(theme-config): delete dead bannedPatterns/getArticleRules; ban is prompt-only (CR-5/F9)

The articleRules.bannedPatterns arrays and getArticleRules() had zero runtime
consumers (verified by grep) — the 8.19 'programmatic validation' wiring was
never built. Remove the config, the accessor, and the test that guarded the
dead regex. Document that token/voice ban enforcement is prompt-driven only.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10.3: Scope the live "token" ban to bare token in the evaluator (X-2 / F9)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\workflow\nodes\evaluator-nodes.js:539-543`
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\workflow\nodes\__tests__\evaluator-token-scoping.test.js` (Create)

The article-quality evaluator's CRITICAL CHECKS string instructs the model "MUST NOT contain ... 'token'" for both themes (evaluator-nodes.js:541 detective, :543 journalist) as a blocking structural antiPattern. F9's intent — allow the in-world phrase "memory token", ban only the bare system label — never reached this live evaluator (it only edited the dead `bannedPatterns` regex + the skill `.md`). So "memory token" in a correct article triggers spurious revision loops. Scope the instruction to bare token and explicitly allow "memory token", both themes.

- [ ] **Step 1: Confirm the export name + helper signature so the test imports correctly (verification command).** The CRITICAL CHECKS string is built inside a phase-prompt builder in this file. Run:

```
grep -nE 'module.exports|^function |^async function |buildEvaluationPrompt|antiPatterns: ' lib/workflow/nodes/evaluator-nodes.js | head -40
```

Expected: shows the function that owns the `CRITICAL CHECKS:` block (the one containing line 538-543) and how it is exported. Use the exact exported name in Step 2's `require`. If the prompt builder is not individually exported, the test in Step 2 falls back to the source-grep form (also given below) — pick the import form that matches the grep output.

- [ ] **Step 2: Write the failing scoping test FIRST.** Create `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\workflow\nodes\__tests__\evaluator-token-scoping.test.js`. This is a source-level guard (the CRITICAL CHECKS text is a template literal, so a source-grep is the reliable, mock-free assertion):

```js
/**
 * F9 (X-2) regression guard: the live article evaluator must ban the BARE
 * "token" system label but explicitly ALLOW the in-world phrase "memory token".
 * Both themes. Asserted against the source of the CRITICAL CHECKS block.
 */
const fs = require('fs');
const path = require('path');

describe('F9: evaluator token ban is scoped to bare token', () => {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'evaluator-nodes.js'),
    'utf8'
  );

  // Isolate the CRITICAL CHECKS block so unrelated "token" mentions elsewhere
  // (e.g. tokenId in schemas) don't pollute the assertion.
  const start = src.indexOf('CRITICAL CHECKS:');
  const block = src.slice(start, start + 800);

  it('locates the CRITICAL CHECKS block', () => {
    expect(start).toBeGreaterThan(-1);
  });

  it('does not ban the unqualified word "token" without scoping', () => {
    // The old text was: antiPatterns: ... MUST NOT contain "token"
    // After the fix, every "token" mention in this block must be qualified as
    // bare/standalone, and "memory token" must be explicitly allowed.
    expect(block).toMatch(/memory token/);
    expect(block).toMatch(/bare\s+"token"|standalone\s+"token"|bare token/i);
  });

  it('does not contain the old unscoped instruction', () => {
    expect(block).not.toContain('MUST NOT contain "token"');
    expect(block).not.toContain("contain \"token\", \"Act");
  });
});
```

- [ ] **Step 3: Run it — expect RED.** Command:

```
npx jest lib/workflow/nodes/__tests__/evaluator-token-scoping.test.js
```

Expected: `does not contain the old unscoped instruction` fails (old `"token"` text still present) and the `bare "token"` / `memory token` assertions fail (those phrases absent).

- [ ] **Step 4: Edit evaluator-nodes.js:539-543.** Exact before:

```js
${theme === 'detective'
  ? `- voiceConsistency: Report MUST use third-person investigative voice ("The investigation revealed", "Evidence indicates")
- antiPatterns: Report MUST NOT contain "token", "Act 1/2/3", game terminology, "character sheet"`
  : `- voiceConsistency: Article MUST use first-person participatory voice ("I", "my", "we")
- antiPatterns: Article MUST NOT contain em-dashes (—), "token", "Act 1/2/3", game terminology`}
```

Exact after:

```js
${theme === 'detective'
  ? `- voiceConsistency: Report MUST use third-person investigative voice ("The investigation revealed", "Evidence indicates")
- antiPatterns: Report MUST NOT contain the bare system label "token" (the in-world phrase "memory token" is ALLOWED and correct), "Act 1/2/3", game terminology, "character sheet"`
  : `- voiceConsistency: Article MUST use first-person participatory voice ("I", "my", "we")
- antiPatterns: Article MUST NOT contain em-dashes (—), the bare system label "token" (the in-world phrase "memory token" is ALLOWED and correct), "Act 1/2/3", game terminology`}
```

- [ ] **Step 5: Re-run — expect GREEN.** Command:

```
npx jest lib/workflow/nodes/__tests__/evaluator-token-scoping.test.js
```

Expected: `Tests: 3 passed, 3 total`.

- [ ] **Step 6: Commit.**

```
git add lib/workflow/nodes/evaluator-nodes.js lib/workflow/nodes/__tests__/evaluator-token-scoping.test.js
git commit -m "fix(evaluator): scope live token ban to bare 'token', allow 'memory token' (X-2/F9)

The article-quality evaluator's CRITICAL CHECKS banned the unqualified word
'token' for both themes, so correct articles using the in-world phrase
'memory token' triggered spurious revision loops. F9's scoping had only
reached the dead bannedPatterns regex + the skill .md, not this live path.
Scope to the bare system label; explicitly allow 'memory token'. Both themes.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

### Task 10.4: Scope the "token" ban in `buildValidationPrompt` (X-2 / F9)
**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\prompt-builder.js:1147-1164` (`buildValidationPrompt` checklist, both theme branches), and `:1193` (journalist issue-type enum mentions `token_language`)
- Test: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\prompt-builder-banned-identifiers.test.js` (Modify — extend the Task 10.1 file)

`buildValidationPrompt` (prompt-builder.js:1158 journalist, :1149 detective) flags `"token"`/`"token/tokens"` unconditionally as a validation issue. This is the second live validator F9 missed. Scope both checklists to bare token, allow "memory token".

- [ ] **Step 1: Extend the Task 10.1 test file with a failing validation-prompt guard FIRST.** Append a new describe block to `lib/__tests__/prompt-builder-banned-identifiers.test.js`:

```js
describe('F9: buildValidationPrompt token ban is scoped', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'prompt-builder.js'),
    'utf8'
  );
  const start = src.indexOf('async buildValidationPrompt');
  const end = src.indexOf('getPhaseRequirements');
  const fn = src.slice(start, end);

  it('locates buildValidationPrompt', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('detective checklist no longer flags unqualified "token"', () => {
    // old detective line 1149: '"token", "Act 3", "final call", "character sheet"'
    expect(fn).not.toContain('("token", "Act 3"');
  });

  it('journalist checklist no longer flags unqualified "token/tokens"', () => {
    // old journalist line 1158: '"token/tokens" instead of "extracted memory"'
    expect(fn).not.toContain('"token/tokens"');
  });

  it('both checklists allow the in-world phrase "memory token"', () => {
    const occurrences = (fn.match(/memory token/g) || []).length;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run it — expect RED.** Command:

```
npx jest lib/__tests__/prompt-builder-banned-identifiers.test.js -t 'buildValidationPrompt token ban'
```

Expected: the detective/journalist "no longer flags" assertions fail (old strings still present) and the `memory token` count is `< 2`.

- [ ] **Step 3: Edit the detective checklist branch (prompt-builder.js:1147-1155).** Exact before:

```js
    const validationChecklist = this.themeName === 'detective'
      ? `Check for:
1. Game mechanics language ("token", "Act 3", "final call", "character sheet")
2. First-person voice (should be third-person investigative)
3. Repeated facts appearing in multiple sections (section differentiation)
4. Missing roster members
5. Names not in <strong> tags
6. Evidence artifacts not in <em> tags
7. Report exceeds ~800 words (target ~750)`
```

Exact after:

```js
    const validationChecklist = this.themeName === 'detective'
      ? `Check for:
1. Game mechanics language: the bare system label "token" (the in-world phrase "memory token" is ALLOWED), "Act 3", "final call", "character sheet"
2. First-person voice (should be third-person investigative)
3. Repeated facts appearing in multiple sections (section differentiation)
4. Missing roster members
5. Names not in <strong> tags
6. Evidence artifacts not in <em> tags
7. Report exceeds ~800 words (target ~750)`
```

- [ ] **Step 4: Edit the journalist checklist branch (prompt-builder.js:1156-1164).** Exact before:

```js
      : `Check for:
1. Em-dashes (— or --)
2. "token/tokens" instead of "extracted memory"
3. Game mechanics language ("Act 3", "final call", "first burial")
4. Vague attribution ("from my notes", "sources say")
5. Passive/neutral voice (should be participatory)
6. Missing roster members
7. Blake condemned (should be suspicious but nuanced)
8. Missing systemic critique in CLOSING`;
```

Exact after:

```js
      : `Check for:
1. Em-dashes (— or --)
2. The bare system label "token"/"tokens" instead of "memory token" or "extracted memory" (the in-world phrase "memory token" is ALLOWED and correct)
3. Game mechanics language ("Act 3", "final call", "first burial")
4. Vague attribution ("from my notes", "sources say")
5. Passive/neutral voice (should be participatory)
6. Missing roster members
7. Blake condemned (should be suspicious but nuanced)
8. Missing systemic critique in CLOSING`;
```

- [ ] **Step 5: Re-run — expect GREEN.** Command:

```
npx jest lib/__tests__/prompt-builder-banned-identifiers.test.js
```

Expected: all describes pass — `F4 ...`, `F9: buildValidationPrompt token ban is scoped` (4 passing, with `memory token` appearing ≥2 times across the two branches).

- [ ] **Step 6: Run the full prompt-builder + evaluator surface once more.** Command:

```
npx jest lib/__tests__/prompt-builder-banned-identifiers.test.js lib/workflow/nodes/__tests__/evaluator-token-scoping.test.js lib/__tests__/theme-config.test.js
```

Expected: all three files green.

- [ ] **Step 7: Commit.**

```
git add lib/prompt-builder.js lib/__tests__/prompt-builder-banned-identifiers.test.js
git commit -m "fix(prompt): scope buildValidationPrompt token ban to bare token (X-2/F9)

buildValidationPrompt flagged unqualified 'token'/'token/tokens' for both
themes, the second live validator F9's scoping never reached. Scope both
checklists to the bare system label and explicitly allow 'memory token'.
Completes F9 on every live path (evaluator + validation prompt); the dead
bannedPatterns config was already removed in CR-5.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Phase P11: Remaining correctness (harness + precedence + detective leak)
Goal: The e2e harness reports completed runs (reads the flat completion payload), `parseRawInput` fails loud on an empty-but-required pronoun map instead of silently shadowing `rawInput`, and pronoun annotations stop leaking into the detective prompt.
Dependencies: None of these depend on B-spine work. The F1 pronoun *key-namespace* normalization (CR-1/X-1/X-4) is a separate phase; P11 only fixes the *precedence* bug (CR-4) and the *theme-gate* (X-6), which are orthogonal and can land before or after F1. Land P11 independently.

### Task 11.1: Harness reads the flat completion payload (CR-3) + restore structured directorNotes (X-8) + drop the band-aid guard

**Files:**
- Create: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\scripts\lib\sse-complete.js`
- Create (test): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\__tests__\unit\scripts\sse-complete.test.js`
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\scripts\e2e-walkthrough.js:166` (complete handler), `:616` (directorNotes), `:3444` (band-aid guard)

Root cause (verified by read): `progress-emitter.js:39 emitComplete` spreads `result` **flat** onto the SSE event (`{ ...result, type:'complete' }`) — there is no `.result` wrapper. The harness reads `onComplete(data.result)` at `e2e-walkthrough.js:166`, which resolves the `sseCompletionPromise` (`:354`) with `undefined`. `apiCall` then returns `{ status:200, data:undefined }` (`:408`), the main loop sets `currentData = data` → `undefined`, and the band-aid guard at `:3444` breaks the loop with "currentData undefined" instead of rendering the completed pipeline. The fix reads `data.result || data` so the flat payload is used, restores the full `directorNotes` object so the `--fresh` path keeps structured whiteboard/quotes/transactions, and replaces the band-aid break with an explicit assertion that a completed payload was rendered.

- [ ] **Step 1: Failing test for the pure completion-payload resolver.**
  Create `__tests__\unit\scripts\sse-complete.test.js`:
  ```javascript
  const { resolveCompletePayload } = require('../../../scripts/lib/sse-complete');

  describe('resolveCompletePayload', () => {
    it('returns the flat payload when there is no .result wrapper (current server shape)', () => {
      // progress-emitter.emitComplete spreads result flat: { ...result, type:'complete' }
      const flat = { type: 'complete', currentPhase: 'complete', outputPath: 'outputs/report-1221.html', interrupted: false };
      expect(resolveCompletePayload(flat)).toBe(flat);
    });

    it('prefers a nested .result when present (forward-compatible)', () => {
      const inner = { currentPhase: 'complete', outputPath: 'x.html' };
      const wrapped = { type: 'complete', result: inner };
      expect(resolveCompletePayload(wrapped)).toBe(inner);
    });

    it('returns the flat payload for an interrupted (checkpoint) completion', () => {
      const interrupted = { type: 'complete', interrupted: true, currentPhase: '2.35', checkpoint: { type: 'arc-selection' } };
      expect(resolveCompletePayload(interrupted)).toBe(interrupted);
    });

    it('throws on a null/undefined event (no silent undefined currentData)', () => {
      expect(() => resolveCompletePayload(null)).toThrow(/completion event/i);
      expect(() => resolveCompletePayload(undefined)).toThrow(/completion event/i);
    });
  });
  ```

- [ ] **Step 2: Run the test, expect failure (module not found).**
  Run: `npx jest __tests__/unit/scripts/sse-complete.test.js -t 'resolveCompletePayload'`
  Expected output: `Cannot find module '../../../scripts/lib/sse-complete'` — all 4 tests fail to load.

- [ ] **Step 3: Implement the dual-export pure resolver.**
  Create `scripts\lib\sse-complete.js`:
  ```javascript
  /**
   * Resolve the workflow-completion payload from an SSE 'complete' event.
   *
   * The server's progressEmitter.emitComplete (lib/observability/progress-emitter.js)
   * spreads the result FLAT onto the event: { ...result, type:'complete' } — there is
   * no `.result` wrapper. Older/alternate emitters may nest under `.result`. Accept both;
   * fail loud on a missing event rather than letting `currentData` become undefined.
   *
   * @param {object} event - The parsed SSE event object (type === 'complete').
   * @returns {object} The completion payload (currentPhase, outputPath, interrupted, checkpoint, ...).
   */
  function resolveCompletePayload(event) {
    if (!event || typeof event !== 'object') {
      throw new Error('resolveCompletePayload: missing or invalid completion event');
    }
    return event.result || event;
  }

  module.exports = { resolveCompletePayload };
  ```

- [ ] **Step 4: Re-run the test, expect pass.**
  Run: `npx jest __tests__/unit/scripts/sse-complete.test.js -t 'resolveCompletePayload'`
  Expected output: `Tests: 4 passed, 4 total`.

- [ ] **Step 5: Wire the resolver into the harness complete handler (CR-3).**
  In `scripts\e2e-walkthrough.js`, add the require near the other top-level requires (after line 35 `const https = require('https');`):
  ```javascript
  const { resolveCompletePayload } = require('./lib/sse-complete');
  ```
  Then replace the complete-case handler at `:164-167`:
  ```javascript
              case 'complete':
                console.log(color('\n  [SSE] Received completion event', 'green'));
                if (onComplete) onComplete(data.result);
                break;
  ```
  with:
  ```javascript
              case 'complete':
                console.log(color('\n  [SSE] Received completion event', 'green'));
                if (onComplete) onComplete(resolveCompletePayload(data));
                break;
  ```

- [ ] **Step 6: Restore structured directorNotes in loadSessionInput (X-8).**
  In `scripts\e2e-walkthrough.js`, the `--fresh`/normal path currently flattens director notes to prose at `:616`, dropping the structured whiteboard/quotes/transactions for the 11 enriched sessions. Replace the `incrementalInputData` assignment block at `:611-617`:
  ```javascript
      incrementalInputData = {
        roster: sessionConfig.roster,
        rosterPronouns: sessionConfig.rosterPronouns || {},
        accusation: sessionConfig.accusation,
        sessionReport: directorNotes.sessionReport || sessionConfig.sessionReport,
        directorNotes: directorNotes.rawProse || JSON.stringify(directorNotes, null, 2)
      };
  ```
  with (send the full object so structured enrichment survives; keep a prose-only fallback only when the file truly has no structure):
  ```javascript
      incrementalInputData = {
        roster: sessionConfig.roster,
        rosterPronouns: sessionConfig.rosterPronouns || {},
        accusation: sessionConfig.accusation,
        sessionReport: directorNotes.sessionReport || sessionConfig.sessionReport,
        // Send the full structured directorNotes object (whiteboard, quotes, transactions),
        // NOT just rawProse — the enriched sessions carry structure the parser consumes.
        // Fall back to a prose-only shape only when the file has no structured fields.
        directorNotes: (directorNotes && Object.keys(directorNotes).length > 0)
          ? directorNotes
          : { rawProse: directorNotes?.rawProse || '' }
      };
  ```

- [ ] **Step 7: Remove the band-aid `!currentData` guard and assert a rendered result (CR-3).**
  At `:3442-3447` the guard masks the CR-3 stall. With Step 5 in place `currentData` is now the flat completion payload, so the guard is dead. Replace the guard block:
  ```javascript
      // Guard: the workflow can end without a checkpoint state (e.g. error routing to END).
      // Avoid crashing on currentData.checkpoint; let post-loop output handling run.
      if (!currentData) {
        console.error(color('\n[harness] currentData undefined (workflow ended without a checkpoint state); breaking loop.', 'yellow'));
        break;
      }
  ```
  with an assertion that fails loud (the harness should never see an undefined payload now that the resolver is wired):
  ```javascript
      // CR-3: with resolveCompletePayload wired, a 'complete' SSE always yields a flat
      // payload (currentPhase/outputPath/...). An undefined currentData here means the
      // resolver or the POST path regressed — fail loud instead of masking it.
      if (!currentData) {
        throw new Error('[harness] currentData is undefined after a server response — completion payload was not resolved (regression of CR-3)');
      }
  ```

- [ ] **Step 8: Manual verification (no node-env harness for the monolith wiring).**
  The `connectSSE` stream handler and the main loop run only when the script executes; there is no exported entry point, so the wiring (Steps 5–7) is verified by a live run, not Jest. Run (server already up on :3001):
  `node scripts/e2e-walkthrough.js --session 1221 --auto`
  Expected: the run reaches `header('Pipeline Complete!')` and prints `HTML saved to: ...` (from `:3463-3467`) — NOT `[harness] currentData undefined`. Confirm the printed `outputPath` matches an actual file under `outputs/`.

- [ ] **Step 9: Commit.**
  `git add scripts/lib/sse-complete.js __tests__/unit/scripts/sse-complete.test.js scripts/e2e-walkthrough.js && git commit -m 'fix(harness): read flat SSE completion payload, restore structured directorNotes, drop band-aid guard (CR-3, X-8)'`

### Task 11.2: parseRawInput precedence — empty `{}` must not shadow rawInput (CR-4)

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\workflow\nodes\input-nodes.js:428` (precedence) and `:781-791` (`_testing` export)
- Create (test): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\input-nodes-pronoun-precedence.test.js`

Root cause (verified by read): `input-nodes.js:428` is `result.rosterPronouns = state.rosterPronouns || rawInput.rosterPronouns || {};`. An **empty-but-present** `state.rosterPronouns = {}` is truthy, so it shadows a populated `rawInput.rosterPronouns` — the director-provided pronouns are silently discarded and every character defaults to they/them. The fix selects the first map that actually **has keys** (`Object.keys(...).length`), so `{}` no longer shadows a populated source. Extracted into a pure `resolveRosterPronouns(state, rawInput)` helper for node-env testability (the full node makes 3+ parallel SDK calls and is not unit-testable directly).

- [ ] **Step 1: Failing test for the precedence helper.**
  Create `lib\__tests__\input-nodes-pronoun-precedence.test.js`:
  ```javascript
  const { _testing } = require('../workflow/nodes/input-nodes');
  const { resolveRosterPronouns } = _testing;

  describe('resolveRosterPronouns — empty-{} must not shadow rawInput (CR-4)', () => {
    it('uses rawInput pronouns when state map is an empty object (the bug)', () => {
      const state = { rosterPronouns: {} };
      const rawInput = { rosterPronouns: { Vic: 'she/her', Sam: 'he/him' } };
      expect(resolveRosterPronouns(state, rawInput)).toEqual({ Vic: 'she/her', Sam: 'he/him' });
    });

    it('prefers a populated state map over rawInput (incremental roster wins)', () => {
      const state = { rosterPronouns: { Vic: 'they/them' } };
      const rawInput = { rosterPronouns: { Vic: 'she/her' } };
      expect(resolveRosterPronouns(state, rawInput)).toEqual({ Vic: 'they/them' });
    });

    it('falls back to rawInput when state has no map', () => {
      const state = {};
      const rawInput = { rosterPronouns: { Alex: 'she/her' } };
      expect(resolveRosterPronouns(state, rawInput)).toEqual({ Alex: 'she/her' });
    });

    it('returns {} when neither side provides keys (no crash, fail-soft only when genuinely empty)', () => {
      expect(resolveRosterPronouns({ rosterPronouns: {} }, { rosterPronouns: {} })).toEqual({});
      expect(resolveRosterPronouns({}, {})).toEqual({});
    });

    it('tolerates missing rawInput object', () => {
      expect(resolveRosterPronouns({ rosterPronouns: { Vic: 'she/her' } }, undefined)).toEqual({ Vic: 'she/her' });
    });
  });
  ```

- [ ] **Step 2: Run the test, expect failure (helper not exported).**
  Run: `npx jest lib/__tests__/input-nodes-pronoun-precedence.test.js -t 'CR-4'`
  Expected output: `TypeError: resolveRosterPronouns is not a function` — all 5 tests fail.

- [ ] **Step 3: Implement the pure helper.**
  In `lib\workflow\nodes\input-nodes.js`, add the helper directly above `async function parseRawInput(state, config)` at `:360`:
  ```javascript
  /**
   * Resolve rosterPronouns with KEY-COUNT precedence (CR-4).
   *
   * An empty-but-present map ({}) is truthy and would shadow a populated source under
   * `||`. Select the first map that actually has keys: incremental state wins over
   * rawInput; {} only results when BOTH are genuinely empty.
   *
   * @param {Object} state - Workflow state (may carry rosterPronouns from await-roster).
   * @param {Object} rawInput - state.rawSessionInput (may carry rosterPronouns from /start).
   * @returns {Object} The chosen pronoun map (possibly {}).
   */
  function resolveRosterPronouns(state, rawInput) {
    const fromState = (state && state.rosterPronouns) || {};
    if (Object.keys(fromState).length > 0) return fromState;
    const fromRaw = (rawInput && rawInput.rosterPronouns) || {};
    if (Object.keys(fromRaw).length > 0) return fromRaw;
    return {};
  }
  ```

- [ ] **Step 4: Use the helper at the assignment site.**
  At `input-nodes.js:428`, replace:
  ```javascript
      result.rosterPronouns = state.rosterPronouns || rawInput.rosterPronouns || {};
  ```
  with:
  ```javascript
      result.rosterPronouns = resolveRosterPronouns(state, rawInput);
  ```

- [ ] **Step 5: Export the helper for node-env testing.**
  In the `_testing` block at `:781-791`, add `resolveRosterPronouns` to the list (after `mergeDirectorOverrides,`):
  ```javascript
    _testing: {
      DEFAULT_DATA_DIR,
      SESSION_CONFIG_SCHEMA,
      SESSION_REPORT_SCHEMA,
      WHITEBOARD_SCHEMA,
      deriveSessionId,
      ensureDir,
      sanitizePath,
      mergeDirectorOverrides,
      resolveRosterPronouns,
      projectBuriedTokensToScoringTimeline
    }
  ```

- [ ] **Step 6: Re-run the test, expect pass.**
  Run: `npx jest lib/__tests__/input-nodes-pronoun-precedence.test.js -t 'CR-4'`
  Expected output: `Tests: 5 passed, 5 total`.

- [ ] **Step 7: Confirm no regression in the existing input-nodes suite.**
  Run: `npx jest lib/__tests__/input-nodes-schema.test.js`
  Expected output: existing `parseRawInput wiring` + `mergeDirectorOverrides` tests still pass (the `_testing` export shape only grew by one key).

- [ ] **Step 8: Commit.**
  `git add lib/workflow/nodes/input-nodes.js lib/__tests__/input-nodes-pronoun-precedence.test.js && git commit -m 'fix(input): key-count precedence so empty rosterPronouns map does not shadow rawInput (CR-4)'`

### Task 11.3: Gate the "(pronouns)" annotation on the journalist theme (X-6)

**Files:**
- Modify: `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\prompt-builder.js:22-35` (`generateRosterSection`)
- Modify (test): `C:\Users\spide\Documents\claudecode\aboutlastnight\reports\lib\__tests__\prompt-builder.test.js:1039-1087` (`generateRosterSection` describe block)

Root cause (verified by read): `generateRosterSection` at `prompt-builder.js:34` appends `(${resolvePronouns(first)})` to every roster line **unconditionally**, defaulting to `they/them`. All four call sites (`:603`, `:653`, `:793`, `:1079`) pass `this.themeName` as the first arg, so the detective theme (third-person, no pronoun capture) gets meaningless `(they/them)` lines injected into its prompt. The fix gates the annotation on `theme === 'journalist'`; detective roster lines become `- First → Full` with no pronoun suffix.

- [ ] **Step 1: Failing tests — detective omits pronouns, journalist keeps them.**
  In `lib\__tests__\prompt-builder.test.js`, inside the existing `describe('generateRosterSection (Notion-derived)', ...)` block, add two tests immediately after the `defaults all to they/them when no pronoun map is given` test (after `:1086`):
  ```javascript
    it('detective theme omits the pronoun annotation entirely (X-6)', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley', Sam: 'Sam Rivera' };
      const pronouns = { Vic: 'she/her' };
      const result = generateRosterSection('detective', canonical, null, pronouns);
      expect(result).toContain('Vic → Vic Kingsley');
      expect(result).toContain('Sam → Sam Rivera');
      // No pronoun suffix on detective roster lines:
      expect(result).not.toContain('they/them');
      expect(result).not.toContain('she/her');
      expect(result).not.toMatch(/Vic Kingsley \(/);
    });

    it('journalist theme still appends the pronoun annotation (X-6 does not regress F1)', () => {
      const { generateRosterSection } = require('../prompt-builder');
      const canonical = { Vic: 'Vic Kingsley' };
      const result = generateRosterSection('journalist', canonical, null, { Vic: 'she/her' });
      expect(result).toContain('Vic Kingsley (she/her)');
    });
  ```

- [ ] **Step 2: Run the new tests, expect the detective one to fail.**
  Run: `npx jest lib/__tests__/prompt-builder.test.js -t 'generateRosterSection'`
  Expected output: the `detective theme omits the pronoun annotation entirely (X-6)` test FAILS (`result` contains `Vic Kingsley (she/her)` and `Sam Rivera (they/them)`); the journalist test passes; the four pre-existing roster tests pass.

- [ ] **Step 3: Gate the annotation on journalist theme.**
  In `lib\prompt-builder.js`, replace the line-builder block at `:33-35`:
  ```javascript
    const lines = Object.entries(characters)
      .map(([first, full]) => `- ${first} → ${full} (${resolvePronouns(first)})`)
      .join('\n');
  ```
  with (gate the suffix on theme; detective gets bare `First → Full`):
  ```javascript
    // Pronoun annotation is journalist-only (first-person, captured pronouns).
    // Detective is third-person and never captures pronouns — omit the suffix (X-6).
    const showPronouns = theme === 'journalist';
    const lines = Object.entries(characters)
      .map(([first, full]) => showPronouns
        ? `- ${first} → ${full} (${resolvePronouns(first)})`
        : `- ${first} → ${full}`)
      .join('\n');
  ```

- [ ] **Step 4: Re-run the roster tests, expect all pass.**
  Run: `npx jest lib/__tests__/prompt-builder.test.js -t 'generateRosterSection'`
  Expected output: all 6 tests pass (4 pre-existing + 2 new).

- [ ] **Step 5: Run the full prompt-builder suite to confirm no detective call-site regression.**
  Run: `npx jest lib/__tests__/prompt-builder.test.js`
  Expected output: green, including the `detective theme prompts` describe block (its `buildArticlePrompt`/`buildOutlinePrompt` assertions don't depend on a pronoun suffix).

- [ ] **Step 6: Commit.**
  `git add lib/prompt-builder.js lib/__tests__/prompt-builder.test.js && git commit -m 'fix(prompt): gate roster pronoun annotation on journalist theme (X-6)'`

---

## Phase P12: Cleanup / hygiene

Goal: Remove dead exports, constants, methods, and stale comments surfaced by the audit (X-8, DEAD-1, DEAD-2, S11/S12/S14), keeping the Jest suite green after each removal.

Dependencies: None of the earlier workstreams block this phase mechanically, but run it LAST (after Phases A/B/C land) so it operates on the final tree and cannot mask a real regression. Specifically, the `mergeReducer` removal in Task 12.4 must not precede any phase that wires `mergeReducer` to an annotation — none of A/B/C do, but confirm with the grep in Step 1 of that task before deleting.

### Task 12.1: Remove dead `loadTemplate()` method from ThemeLoader (X-8)

**Files:**
- Modify: `lib/theme-loader.js:157-167` (delete `loadTemplate` method), `:204-216` references unaffected
- Modify: `lib/__tests__/theme-loader.test.js:211-233` (delete `loadTemplate` describe block), `:326`, `:350` (remove `loadTemplate` calls from cache tests)
- Modify: `__tests__/unit/workflow/ai-nodes.test.js:181-187` (delete the `loadTemplate` mock test)
- Modify: `lib/workflow/nodes/ai-nodes.js:1573` (remove the `loadTemplate` line from the `createMockPromptBuilder` `theme` mock in `_testing`)

- [ ] **Step 1: Verify `loadTemplate` has zero production callers.** Run the grep and confirm every hit is a test, a mock, or the definition itself (no node/server/lib production call):
  ```bash
  grep -rn "loadTemplate" lib/ server.js console/ scripts/ | grep -v "__tests__\|\.test\.js\|jest.fn\|mock\|async () =>"
  ```
  Expected output: only `lib/theme-loader.js:157:  async loadTemplate() {` (the definition). If any other line prints, STOP — it has a real caller; do not delete.

- [ ] **Step 2: Write the failing test FIRST — assert the method is gone.** Append to `lib/__tests__/theme-loader.test.js` inside the top-level `describe('ThemeLoader', ...)` (after the existing `getCacheStats` block, before its closing `});`):
  ```javascript
  describe('dead-method removal (X-8)', () => {
    it('does not expose loadTemplate (article.html is no longer prompt context)', () => {
      expect(loader.loadTemplate).toBeUndefined();
    });
  });
  ```
  Run: `npx jest lib/__tests__/theme-loader.test.js -t "does not expose loadTemplate"`
  Expected: FAIL — `Received: [Function loadTemplate]`.

- [ ] **Step 3: Delete the `loadTemplate` method.** In `lib/theme-loader.js`, remove lines 153-167 (the JSDoc + method):
  ```javascript
  // DELETE THIS BLOCK (lib/theme-loader.js:153-167):
  /**
   * Load the HTML article template (cached)
   * @returns {Promise<string>} - Template HTML
   */
  async loadTemplate() {
    const cacheKey = 'template:article';

    if (!this.cache.has(cacheKey)) {
      const filePath = path.join(this.assetsPath, 'article.html');
      const content = await fs.readFile(filePath, 'utf8');
      this.cache.set(cacheKey, content);
    }

    return this.cache.get(cacheKey);
  }
  ```

- [ ] **Step 4: Remove the now-orphaned test references.** In `lib/__tests__/theme-loader.test.js`:
  - Delete the entire `describe('loadTemplate', ...)` block (lines 211-233).
  - In the `clearCache` test (was :326), change `await loader.loadTemplate();` to `await loader.loadStyles();` and the readFile mock setup stays (`fs.readFile.mockResolvedValue('content')` already set). The assertion `expect(loader.cache.size).toBeGreaterThan(0)` still holds because `loadPrompt('test')` already populated the cache — so simply delete the `await loader.loadTemplate();` line.
  - In the `getCacheStats` test (was :350-357), delete `await loader.loadTemplate();`, change `expect(stats.entries).toBe(2)` to `expect(stats.entries).toBe(1)`, and delete `expect(stats.keys).toContain('template:article');`.
  Before/after for the getCacheStats test:
  ```javascript
  // BEFORE:
      await loader.loadPrompt('test-prompt');
      await loader.loadTemplate();
      const stats = loader.getCacheStats();
      expect(stats.entries).toBe(2);
      expect(stats.keys).toContain('prompt:test-prompt');
      expect(stats.keys).toContain('template:article');
      expect(stats.validated).toBe(false);
  // AFTER:
      await loader.loadPrompt('test-prompt');
      const stats = loader.getCacheStats();
      expect(stats.entries).toBe(1);
      expect(stats.keys).toContain('prompt:test-prompt');
      expect(stats.validated).toBe(false);
  ```

- [ ] **Step 5: Remove the `loadTemplate` mock + test in ai-nodes.** In `lib/workflow/nodes/ai-nodes.js:1573`, delete the line:
  ```javascript
  // DELETE (ai-nodes.js:1573, inside createMockPromptBuilder's theme: { ... }):
      loadTemplate: async () => '<html>{{content}}</html>',
  ```
  In `__tests__/unit/workflow/ai-nodes.test.js`, delete the test (lines 181-187):
  ```javascript
  // DELETE:
    it('has theme property with loadTemplate', async () => {
      const builder = createMockPromptBuilder();

      expect(builder.theme).toBeDefined();
      const template = await builder.theme.loadTemplate();
      expect(typeof template).toBe('string');
    });
  ```

- [ ] **Step 6: Re-run the affected suites + require-load smoke.** 
  ```bash
  node -e "require('./lib/theme-loader.js'); require('./lib/workflow/nodes/ai-nodes.js'); console.log('loads OK');"
  npx jest lib/__tests__/theme-loader.test.js __tests__/unit/workflow/ai-nodes.test.js
  ```
  Expected: `loads OK`, then both suites pass (the new "does not expose loadTemplate" test now PASSES).

- [ ] **Step 7: Commit.**
  ```bash
  git add lib/theme-loader.js lib/__tests__/theme-loader.test.js lib/workflow/nodes/ai-nodes.js __tests__/unit/workflow/ai-nodes.test.js
  git commit -m "chore(cleanup): remove dead ThemeLoader.loadTemplate method (X-8)

article.html stopped being prompt context after F8; loadTemplate had zero
production callers (only tests + mocks). Removed method, its tests, and the
mock in createMockPromptBuilder.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.2: Remove dead `normalizePath` / `REFS_PATH` and fix stale header in subagents.js (X-8, S11)

**Files:**
- Modify: `lib/sdk-client/subagents.js:7-10` (header), `:15` (`path` require — keep, still used by nothing? verify), `:17-26` (`normalizePath` + `REFS_PATH`), `:461-463` (`_testing.normalizePath`)
- Test: relies on existing `__tests__/unit/workflow/arc-specialist-nodes.test.js` staying green (no test imports `normalizePath`/`REFS_PATH` — confirmed via grep)

- [ ] **Step 1: Confirm `normalizePath`, `REFS_PATH`, and `path` are dead.** 
  ```bash
  grep -rn "normalizePath\|REFS_PATH" lib/ server.js scripts/ __tests__/ | grep -v "lib/sdk-client/subagents.js"
  grep -n "path\." lib/sdk-client/subagents.js
  ```
  Expected: first grep prints NOTHING (no external consumer). Second grep prints only `:25` (`const REPORTS_ROOT = path.resolve(...)`) and `:26` (`REFS_PATH = normalizePath(path.join(...))`) — both of which we are deleting, so after deletion `path` becomes unused too. Confirm there is no other `path.` usage; if the grep shows only :25/:26, the `path` require at :15 is also removable.

- [ ] **Step 2: Write the failing test FIRST.** Append to `__tests__/unit/workflow/arc-specialist-nodes.test.js` (or create `__tests__/unit/sdk-client/subagents-exports.test.js` if no subagents test file exists — verify with `ls __tests__/unit/sdk-client/ 2>/dev/null`). Use a standalone file to avoid coupling:
  Create `__tests__/unit/sdk-client/subagents-exports.test.js`:
  ```javascript
  const subagents = require('../../../lib/sdk-client/subagents');

  describe('subagents dead-export removal (X-8)', () => {
    it('no longer exports normalizePath from _testing', () => {
      expect(subagents._testing.normalizePath).toBeUndefined();
    });

    it('still exports the live schemas and prompts', () => {
      expect(subagents.CORE_ARC_SCHEMA).toBeDefined();
      expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA).toBeDefined();
      expect(subagents.CORE_ARC_SYSTEM_PROMPT).toBeDefined();
    });
  });
  ```
  Run: `npx jest __tests__/unit/sdk-client/subagents-exports.test.js -t "no longer exports normalizePath"`
  Expected: FAIL — `Received: [Function normalizePath]`.

- [ ] **Step 3: Delete the dead constants and the `path` require.** In `lib/sdk-client/subagents.js`, remove lines 15-26:
  ```javascript
  // DELETE (subagents.js:15-26):
  const path = require('path');

  /**
   * Normalize path to forward slashes for cross-platform consistency
   * Claude SDK's Read tool works with forward slashes on all platforms
   */
  const normalizePath = (p) => p.replace(/\\/g, '/');

  // Compute absolute paths at module load time
  // __dirname = lib/sdk-client, so go up 2 levels to reach reports/
  const REPORTS_ROOT = path.resolve(__dirname, '../..');
  const REFS_PATH = normalizePath(path.join(REPORTS_ROOT, '.claude/skills/journalist-report/references/prompts'));
  ```

- [ ] **Step 4: Remove `normalizePath` from `_testing` and fix the stale header.** In the `module.exports` block, change lines 461-464:
  ```javascript
  // BEFORE (subagents.js:461-464):
    // Testing exports
    _testing: {
      normalizePath,  // Exported for testing path normalization
      // Commit 8.28: Split-call schemas
  // AFTER:
    // Testing exports
    _testing: {
      // Commit 8.28: Split-call schemas
  ```
  Fix the header block (lines 7-10), removing the dead `normalizePath` listing:
  ```javascript
  // BEFORE (subagents.js:7-10):
   * Live exports: CORE_ARC_SYSTEM_PROMPT, CORE_ARC_SCHEMA,
   *               INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_SCHEMA,
   *               PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT, PLAYER_FOCUS_GUIDED_SCHEMA,
   *               normalizePath
  // AFTER:
   * Live exports: CORE_ARC_SYSTEM_PROMPT, CORE_ARC_SCHEMA,
   *               INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_SCHEMA,
   *               PLAYER_FOCUS_GUIDED_SCHEMA
  ```
  (Note: `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT` is dropped from this header line because Task 12.3 removes it; if Task 12.3 has not landed yet, keep it here and remove in 12.3. Sequence 12.2 → 12.3.)

- [ ] **Step 5: Re-run with require-load smoke.**
  ```bash
  node -e "const s=require('./lib/sdk-client/subagents.js'); console.log('loads OK, CORE_ARC_SCHEMA:', !!s.CORE_ARC_SCHEMA, '| normalizePath gone:', s._testing.normalizePath===undefined);"
  npx jest __tests__/unit/sdk-client/subagents-exports.test.js
  ```
  Expected: `loads OK, CORE_ARC_SCHEMA: true | normalizePath gone: true`, suite passes.

- [ ] **Step 6: Commit.**
  ```bash
  git add lib/sdk-client/subagents.js __tests__/unit/sdk-client/subagents-exports.test.js
  git commit -m "chore(cleanup): drop dead normalizePath/REFS_PATH + stale header in subagents (X-8/S11)

REFS_PATH and normalizePath were orphaned after F16 deleted the parallel
specialist architecture; the path require is now unused too. Removed both,
the _testing.normalizePath export, and corrected the file header.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.3: Remove unused `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT` (keep the live SCHEMA) (X-8)

**Files:**
- Modify: `lib/sdk-client/subagents.js:28-97` (the prompt constant + JSDoc), `:458` (live export), `:470` (`_testing` export), `:7-9` (header)
- Modify: `lib/workflow/nodes/arc-specialist-nodes.js:56-57` (import), `:1769-1770` (`_testing` re-export)

- [ ] **Step 1: Confirm the PROMPT is imported-but-unused while the SCHEMA is live.** 
  ```bash
  grep -rn "PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT" lib/ __tests__/ server.js scripts/
  grep -rn "PLAYER_FOCUS_GUIDED_SCHEMA" lib/ __tests__/ server.js scripts/
  ```
  Expected: `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT` appears ONLY at subagents.js (def + 2 exports) and arc-specialist-nodes.js (:57 import, :1770 re-export) — never passed to any `sdkClient`/`sdkQuery` `systemPrompt`. `PLAYER_FOCUS_GUIDED_SCHEMA` appears additionally at arc-specialist-nodes.js:961 (`jsonSchema:`), confirming the SCHEMA must stay. (The revision flow uses `getArcRevisionSystemPrompt`, not this constant — verified arc-specialist-nodes.js:959.)

- [ ] **Step 2: Write the failing test FIRST.** Add to `__tests__/unit/sdk-client/subagents-exports.test.js` (created in 12.2):
  ```javascript
  describe('PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT removal (X-8)', () => {
    it('no longer exports the unused system prompt', () => {
      expect(subagents.PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
      expect(subagents._testing.PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT).toBeUndefined();
    });
    it('still exports the live revision schema', () => {
      expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA).toBeDefined();
    });
  });
  ```
  Run: `npx jest __tests__/unit/sdk-client/subagents-exports.test.js -t "no longer exports the unused system prompt"`
  Expected: FAIL — `Received: "You are the Arc Analyst..."`.

- [ ] **Step 3: Delete the constant + JSDoc in subagents.js.** Remove lines 28-97 (the `/** ... */` block from `* System prompt for player-focus-guided arc analysis` through the closing backtick of `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT`). The block to delete starts:
  ```javascript
  /**
   * System prompt for player-focus-guided arc analysis
   *
   * Commit 8.15: Single comprehensive call driven by player conclusions
   */
  const PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT = `You are the Arc Analyst ...
  ...
  - Include interweavingPlan with suggestedOrder and keyCallbacks`;
  ```
  Then in the exports block remove line 458 (`PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,` under the "Commit 8.15" comment — keep `PLAYER_FOCUS_GUIDED_SCHEMA,`) and line 470 (`PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,` in `_testing` — keep `PLAYER_FOCUS_GUIDED_SCHEMA`). After: the `// Commit 8.15: Player-focus-guided architecture (used by reviseArcs)` comment should precede just `PLAYER_FOCUS_GUIDED_SCHEMA,`.
  Also remove the now-dangling header line (subagents.js:9, if Task 12.2 left it):
  ```javascript
  // BEFORE:
   *               PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT, PLAYER_FOCUS_GUIDED_SCHEMA,
  // AFTER:
   *               PLAYER_FOCUS_GUIDED_SCHEMA,
  ```

- [ ] **Step 4: Remove the import + re-export in arc-specialist-nodes.js.** At lines 56-58:
  ```javascript
  // BEFORE (arc-specialist-nodes.js:56-58):
    // Commit 8.15: Player-focus-guided (used by reviseArcs)
    PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
    PLAYER_FOCUS_GUIDED_SCHEMA
  // AFTER:
    // Commit 8.15: Player-focus-guided schema (used by reviseArcs)
    PLAYER_FOCUS_GUIDED_SCHEMA
  ```
  At the `_testing` re-export (lines 1769-1771):
  ```javascript
  // BEFORE:
      // Commit 8.15: Player-focus-guided schema (used by revision flow)
      PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT,
      PLAYER_FOCUS_GUIDED_SCHEMA,
  // AFTER:
      // Commit 8.15: Player-focus-guided schema (used by revision flow)
      PLAYER_FOCUS_GUIDED_SCHEMA,
  ```

- [ ] **Step 5: Re-run with require-load smoke + the arc revision path still resolves its schema.**
  ```bash
  node -e "const a=require('./lib/workflow/nodes/arc-specialist-nodes.js'); console.log('arc nodes load OK; revision schema present:', !!a._testing.PLAYER_FOCUS_GUIDED_SCHEMA);"
  npx jest __tests__/unit/sdk-client/subagents-exports.test.js __tests__/unit/workflow/arc-specialist-nodes.test.js
  ```
  Expected: `arc nodes load OK; revision schema present: true`, both suites pass.

- [ ] **Step 6: Commit.**
  ```bash
  git add lib/sdk-client/subagents.js lib/workflow/nodes/arc-specialist-nodes.js __tests__/unit/sdk-client/subagents-exports.test.js
  git commit -m "chore(cleanup): remove unused PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT (X-8)

The revision flow (reviseArcs) uses getArcRevisionSystemPrompt + the live
PLAYER_FOCUS_GUIDED_SCHEMA; the SYSTEM_PROMPT constant was imported and
re-exported but never passed to any SDK call. Removed the constant and its
imports/exports; kept the schema.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.4: Remove dead `mergeReducer` (DEAD-2)

**Files:**
- Modify: `lib/workflow/state.js:56-67` (the `mergeReducer` definition + JSDoc), `:984` (`_testing` export), `:1007`, `:1014-1015` (self-test lines)
- Modify: `__tests__/unit/workflow/state.test.js:46` (the `expect(typeof _testing.mergeReducer)` assertion), `:138-173` (the entire `mergeReducer` describe block)

- [ ] **Step 1: Confirm `mergeReducer` is bound to no annotation.** 
  ```bash
  grep -n "reducer: mergeReducer\|reducer:mergeReducer" lib/workflow/state.js
  grep -rn "mergeReducer" lib/ server.js | grep -v "lib/workflow/state.js"
  ```
  Expected: BOTH print nothing. (`specialistAnalyses` switched to `replaceReducer` per the 8.8 comment at state.js:377; no other annotation uses merge semantics.) If `reducer: mergeReducer` appears anywhere, STOP — it is live; do not remove.

- [ ] **Step 2: Update the failing test FIRST — assert it's gone, and delete the old behavior tests.** In `__tests__/unit/workflow/state.test.js`:
  - At line 46, change the assertion from presence to absence:
    ```javascript
    // BEFORE (state.test.js:46):
          expect(typeof _testing.mergeReducer).toBe('function');
    // AFTER:
          expect(_testing.mergeReducer).toBeUndefined();
    ```
  - Delete the entire `describe('mergeReducer (Commit 8.6)', ...)` block (lines 138-173).
  Run: `npx jest __tests__/unit/workflow/state.test.js -t "mergeReducer"`
  Expected: FAIL — the line-46 test fails because `mergeReducer` is still a function (the implementation removal hasn't happened yet); confirms the test now guards removal.

- [ ] **Step 3: Delete the `mergeReducer` implementation + JSDoc.** In `lib/workflow/state.js`, remove lines 56-67:
  ```javascript
  // DELETE (state.js:56-67):
  /**
   * Merge reducer: shallow-merges objects (Commit 8.6)
   * Used for specialistAnalyses where parallel specialists contribute results
   * @param {Object} oldValue - Previous object
   * @param {Object} newValue - New properties to merge
   * @returns {Object} Merged object
   */
  const mergeReducer = (oldValue, newValue) => {
    const prev = oldValue || {};
    const next = newValue || {};
    return { ...prev, ...next };
  };
  ```

- [ ] **Step 4: Remove `mergeReducer` from `_testing` and the self-test.** 
  In the exports block (line 984), remove `mergeReducer,`:
  ```javascript
  // BEFORE (state.js:981-986):
    _testing: {
      replaceReducer,
      appendReducer,
      mergeReducer,
      appendSingleReducer
    }
  // AFTER:
    _testing: {
      replaceReducer,
      appendReducer,
      appendSingleReducer
    }
  ```
  In the self-test (line 1007), drop `mergeReducer` from the destructure and delete the two `mergeReducer` console.log lines (1014-1015):
  ```javascript
  // BEFORE (state.js:1007):
    const { replaceReducer, appendReducer, mergeReducer, appendSingleReducer } = module.exports._testing;
  // AFTER:
    const { replaceReducer, appendReducer, appendSingleReducer } = module.exports._testing;
  ```
  ```javascript
  // DELETE (state.js:1014-1015):
    console.log('mergeReducer({a:1}, {b:2}):', mergeReducer({a:1}, {b:2})); // Should be {a:1, b:2}
    console.log('mergeReducer(null, {a:1}):', mergeReducer(null, {a:1})); // Should be {a:1}
  ```
  Also fix the now-misleading `specialistAnalyses` JSDoc at line 58 reference and the line-21 header (`Arc Specialists (8.6): specialistAnalyses`) — leave those (still accurate); only the `mergeReducer` JSDoc at :377 mentions "Uses replaceReducer instead of mergeReducer" which is now ambiguous. Update state.js:377:
  ```javascript
  // BEFORE (state.js:377):
     * Commit 8.8 change: Uses replaceReducer instead of mergeReducer
  // AFTER:
     * Commit 8.8 change: Uses replaceReducer (the orchestrator returns the
     * complete specialistAnalyses object in one SDK call, so no merge needed)
  ```

- [ ] **Step 5: Re-run with require-load + self-test smoke.**
  ```bash
  node -e "const s=require('./lib/workflow/state.js'); console.log('state loads OK; mergeReducer gone:', s._testing.mergeReducer===undefined);"
  node lib/workflow/state.js >/dev/null 2>&1 && echo "self-test runs without ReferenceError"
  npx jest __tests__/unit/workflow/state.test.js
  ```
  Expected: `state loads OK; mergeReducer gone: true`, `self-test runs without ReferenceError`, suite passes.

- [ ] **Step 6: Commit.**
  ```bash
  git add lib/workflow/state.js __tests__/unit/workflow/state.test.js
  git commit -m "chore(cleanup): remove dead mergeReducer (DEAD-2)

specialistAnalyses switched to replaceReducer in 8.8 (orchestrator returns
the full object in one call); mergeReducer was bound to no annotation.
Removed the reducer, its _testing export, self-test lines, and its tests.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.5: Remove dead `supervisorNarrativeCompass` state field (DEAD-1)

**Files:**
- Modify: `lib/workflow/state.js:462-474` (annotation + JSDoc), `:723-724` (getDefaultState entry), `:25` (header comment line)
- Modify: `__tests__/unit/workflow/state.test.js:293-294` (expectedFields entry), `:392-396` (the supervisor defaults describe block), `:239` (the "58" count comment)

- [ ] **Step 1: Confirm zero writers.** 
  ```bash
  grep -rn "supervisorNarrativeCompass" lib/ server.js console/ scripts/ | grep -v "state.js"
  grep -n "supervisorNarrativeCompass" lib/workflow/state.js
  ```
  Expected: first grep prints NOTHING (no node assigns it — confirms DEAD-1's "zero writers"). Second grep prints only the header (:25), the annotation (:471), and the default (:724). No `return { supervisorNarrativeCompass: ... }` anywhere outside state.js → safe to remove.

- [ ] **Step 2: Update the failing test FIRST.** In `__tests__/unit/workflow/state.test.js`:
  - Delete the `expectedFields` entry — lines 293-294:
    ```javascript
    // DELETE (state.test.js:293-294):
            // Supervisor (Commit 8.6)
            'supervisorNarrativeCompass',
    ```
  - Delete the supervisor defaults describe block — lines 392-396:
    ```javascript
    // DELETE (state.test.js:392-396):
        describe('supervisor defaults (Commit 8.6)', () => {
          it('supervisorNarrativeCompass defaults to null', () => {
            expect(defaultState.supervisorNarrativeCompass).toBeNull();
          });
        });
    ```
  - Fix the stale count in the test title (line 239) to the real post-removal count. After removing this one field, getDefaultState has 59 fields:
    ```javascript
    // BEFORE (state.test.js:239):
        it('includes all 58 state fields (includes revision context + human feedback fields)', () => {
    // AFTER:
        it('includes all 59 state fields (includes revision context + human feedback fields)', () => {
    ```
  Run: `npx jest __tests__/unit/workflow/state.test.js -t "includes all 59 state fields"`
  Expected: FAIL — `Object.keys(defaultState).sort()` still contains `supervisorNarrativeCompass`, which is no longer in `expectedFields`, so the arrays differ.

- [ ] **Step 3: Delete the annotation.** In `lib/workflow/state.js`, remove lines 462-474:
  ```javascript
  // DELETE (state.js:462-474):
    // ═══════════════════════════════════════════════════════
    // SUPERVISOR STATE (Commit 8.6)
    // ═══════════════════════════════════════════════════════

    /**
     * Supervisor's narrative compass - maintains cohesion across phases
     * Structure: { coreThemes, emotionalHook, keyMoments, playerFocusAnchors, coherenceNotes }
     * Updated by supervisor after each phase to track/enforce vision
     */
    supervisorNarrativeCompass: Annotation({
      reducer: replaceReducer,
      default: () => null
    }),
  ```

- [ ] **Step 4: Delete the getDefaultState entry + header line.** Remove lines 723-724:
  ```javascript
  // DELETE (state.js:723-724):
      // Supervisor (Commit 8.6)
      supervisorNarrativeCompass: null,
  ```
  Remove the header reference at line 25:
  ```javascript
  // DELETE (state.js:25):
   *   - Supervisor (8.6): supervisorNarrativeCompass
  ```

- [ ] **Step 4b: Remove the field from `ROLLBACK_CLEARS_EXEMPT` (M6 — folds the integration-section note into this task).** P6.3 added `'supervisorNarrativeCompass'` to `ROLLBACK_CLEARS_EXEMPT` in `lib/workflow/state.js` — it sits on the `// Default-only channels never written by any node return` line alongside `'whiteboardAnalysis', 'preCurationSummary'`. Removing the field from `getDefaultState` (Step 4) WITHOUT removing it here makes `rollback-clears-completeness.test.js`'s "every EXEMPT entry is a real state field" assertion fail (the exemption would point at a field that no longer exists). Delete it:
  ```javascript
  // BEFORE (state.js — the "Default-only channels" line inside ROLLBACK_CLEARS_EXEMPT):
    'whiteboardAnalysis', 'preCurationSummary', 'supervisorNarrativeCompass',
  // AFTER:
    'whiteboardAnalysis', 'preCurationSummary',
  ```

- [ ] **Step 5: Re-run with require-load smoke + the rollback completeness guard.**
  ```bash
  node -e "const {getDefaultState}=require('./lib/workflow/state.js'); const k=Object.keys(getDefaultState()); console.log('field count:', k.length, '| supervisorNarrativeCompass gone:', !k.includes('supervisorNarrativeCompass'));"
  npx jest __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js
  ```
  Expected: `field count: 59 | supervisorNarrativeCompass gone: true`; `state.test.js` passes; `rollback-clears-completeness.test.js` — all tests pass (the "no stale exemptions" test is green because Step 4b removed the now-nonexistent exemption; "every field cleared or exempt" stays green with one fewer field and one fewer exemption).

- [ ] **Step 6: Commit.**
  ```bash
  git add lib/workflow/state.js __tests__/unit/workflow/state.test.js
  git commit -m "chore(cleanup): remove dead supervisorNarrativeCompass state field (DEAD-1)

Zero writers across all nodes; the 'maintains cross-phase cohesion' header
described an unimplemented supervisor. Removed the annotation, the default,
the header line, and its tests; corrected the field-count comment.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.6: Fix the stale `getDefaultState` field-count comments (S12)

**Files:**
- Modify: `lib/workflow/state.js:12` (file-header "55 total"), `:663-665` (getDefaultState JSDoc "55 fields"), `:995` (self-test "Should be 53")

- [ ] **Step 1: Compute the authoritative count AFTER Tasks 12.4/12.5 land.** 
  ```bash
  node -e "const {getDefaultState}=require('./lib/workflow/state.js'); console.log('CURRENT FIELD COUNT:', Object.keys(getDefaultState()).length);"
  ```
  Expected: `CURRENT FIELD COUNT: 59` (60 minus `supervisorNarrativeCompass`; `mergeReducer` was never a state field so it doesn't affect this count). Use whatever number this prints as N below — this command is the source of truth, not a hardcoded guess.

- [ ] **Step 2: Write the failing guard test FIRST.** This pins the count so it can't silently drift again. Append to `__tests__/unit/workflow/state.test.js` inside the `getDefaultState` describe:
  ```javascript
  it('getDefaultState field count matches the documented count (S12)', () => {
    // Update this number AND the comments in state.js:12 / :664 / :995 together.
    expect(Object.keys(getDefaultState()).length).toBe(59);
  });
  ```
  Run: `npx jest __tests__/unit/workflow/state.test.js -t "matches the documented count"`
  Expected: PASS at 59 if 12.5 landed (this test documents the invariant; if Step 1 printed a different N, set the literal to N and the test passes — it is the anchor the comments must match).

- [ ] **Step 3: Update the three stale comments to N (=59).** In `lib/workflow/state.js`:
  ```javascript
  // BEFORE (state.js:12):
   * State Fields (55 total - includes revision context + human feedback):
  // AFTER:
   * State Fields (59 total - includes revision context + human feedback):
  ```
  ```javascript
  // BEFORE (state.js:663-665):
  /**
   * Get default state with all fields initialized (55 fields after human feedback + revision budget additions)
   * Useful for testing and initialization
  // AFTER:
  /**
   * Get default state with all fields initialized (59 fields after human feedback + revision budget additions)
   * Useful for testing and initialization
  ```
  ```javascript
  // BEFORE (state.js:995):
    console.log('Default state keys:', Object.keys(defaultState).length); // Should be 53
  // AFTER:
    console.log('Default state keys:', Object.keys(defaultState).length); // Should be 59
  ```

- [ ] **Step 4: Re-run + self-test smoke.**
  ```bash
  node lib/workflow/state.js 2>&1 | grep "Default state keys"
  npx jest __tests__/unit/workflow/state.test.js
  ```
  Expected: `Default state keys: 59`, suite passes.

- [ ] **Step 5: Commit.**
  ```bash
  git add lib/workflow/state.js __tests__/unit/workflow/state.test.js
  git commit -m "docs(state): correct stale getDefaultState field-count comments to 59 (S12)

The 55/53 counts in the header, getDefaultState JSDoc, and self-test were
all stale. Pinned the real count with a guard test so it can't drift again.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.7: Tidy vestigial parallel-branch comments in graph.js (S14)

**Files:**
- Modify: `lib/workflow/graph.js:396` (single-node "parallel branch" comment), `:510-513` (the deferred-parallelization TODO/NOTE block), `:517-528` ("Branch A/B/C" + "previously parallel branches" comments)

- [ ] **Step 1: Confirm the graph is fully sequential (no `Send()` / fan-in).** 
  ```bash
  grep -n "Send(\|addConditionalEdges\|fan-in\|parallel" lib/workflow/graph.js | head -30
  ```
  Expected: NO `Send(` usage; the edges between `loadDirectorNotes → fetchMemoryTokens → fetchPaperEvidence → fetchSessionPhotos → preprocessPhotos → analyzePhotos → detectWhiteboard` are plain `addEdge` (sequential). This proves the "parallel branch"/"Branch A/B/C" comments are vestigial — there is no parallelism. (The audit S14 flags these as misleading.)

- [ ] **Step 2: There is no unit test for comments; this is a manual + lint-by-require change.** Re-run the existing graph build smoke as the guard:
  ```bash
  node -e "const {buildGraph}=require('./lib/workflow/graph.js'); console.log('graph module loads OK');" 2>&1 | tail -3
  ```
  Expected: `graph module loads OK` (or the module's actual export name — confirm with `node -e "console.log(Object.keys(require('./lib/workflow/graph.js')))"` first and use that). This is the green-baseline before editing comments.

- [ ] **Step 3: Rewrite the misleading comments to describe the actual sequential flow.** In `lib/workflow/graph.js`:
  ```javascript
  // BEFORE (graph.js:396):
    // Photo analysis (pure - no checkpoint, runs in parallel branch)
  // AFTER:
    // Photo analysis (pure - no checkpoint; sequential in the data-fetch chain)
  ```
  Replace the deferred-parallelization NOTE/TODO block (lines 510-513):
  ```javascript
  // BEFORE (graph.js:510-513):
    // NOTE: Parallel branches deferred - LangGraph's addEdge doesn't create
    // proper fan-in behavior. Each edge triggers independently.
    // TODO: Implement proper parallelization using Send() pattern
    // ═══════════════════════════════════════════════════════
  // AFTER:
    // Data acquisition runs as a single sequential chain (no parallel branches).
    // ═══════════════════════════════════════════════════════
  ```
  Replace the "Branch A/B/C" comments (lines 517-528):
  ```javascript
  // BEFORE (graph.js:517-528):
    // Sequential data fetching (previously parallel branches A, B, C)
    // Branch A: Evidence fetching
    builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
    builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

    // Branch B: Photo processing
    builder.addEdge('fetchPaperEvidence', 'fetchSessionPhotos');
    builder.addEdge('fetchSessionPhotos', 'preprocessPhotos');
    builder.addEdge('preprocessPhotos', 'analyzePhotos');

    // Branch C: Whiteboard detection
    builder.addEdge('analyzePhotos', 'detectWhiteboard');
  // AFTER:
    // Sequential data acquisition: evidence → photos → whiteboard detection.
    // Evidence fetching
    builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
    builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

    // Photo processing
    builder.addEdge('fetchPaperEvidence', 'fetchSessionPhotos');
    builder.addEdge('fetchSessionPhotos', 'preprocessPhotos');
    builder.addEdge('preprocessPhotos', 'analyzePhotos');

    // Whiteboard detection
    builder.addEdge('analyzePhotos', 'detectWhiteboard');
  ```

- [ ] **Step 4: Re-run the full suite to confirm no behavioral change (comments only).**
  ```bash
  node -e "require('./lib/workflow/graph.js'); console.log('graph loads OK');"
  npx jest __tests__/unit/workflow/ 2>&1 | tail -6
  ```
  Expected: `graph loads OK`, all workflow suites pass (comment-only edit → zero test impact).

- [ ] **Step 5: Commit.**
  ```bash
  git add lib/workflow/graph.js
  git commit -m "docs(graph): replace vestigial parallel-branch comments with sequential reality (S14)

The Branch A/B/C and 'parallel branch deferred' TODO comments described an
architecture that was never built; data acquisition is a plain sequential
addEdge chain. Updated comments to match; no behavioral change.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

### Task 12.9: Final whole-suite green check for the phase
> (Renumbered from 12.8 — CR-7 is inserted as Task 12.8; see Integration §"CR-7". Run this LAST, after CR-7.)

**Files:**
- Test: entire Jest suite (no source changes)

- [ ] **Step 1: Run the full suite to confirm all P12 removals compose cleanly.**
  ```bash
  npx jest 2>&1 | tail -12
  ```
  Expected: `Test Suites: N passed, N total` / `Tests: M passed` with zero failures. If any suite fails, it references a removed symbol — re-grep that symbol (`grep -rn "<symbol>" __tests__ lib/`) and update the stray reference before proceeding.

- [ ] **Step 2: Confirm every touched module still requires without error (catches dangling references the tests might mock around).**
  ```bash
  node -e "['./lib/theme-loader.js','./lib/sdk-client/subagents.js','./lib/workflow/nodes/arc-specialist-nodes.js','./lib/workflow/state.js','./lib/workflow/graph.js','./lib/workflow/nodes/ai-nodes.js'].forEach(m=>{require(m);console.log('OK',m);});"
  ```
  Expected: `OK ./lib/theme-loader.js` … one `OK` per module, no thrown error.

- [ ] **Step 3: No commit needed (verification only).** If Steps 1-2 are clean, Phase P12 is complete. If a fix was required, commit it:
  ```bash
  git add -A && git commit -m "chore(cleanup): fix stray reference to a P12-removed symbol

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
  ```

---

