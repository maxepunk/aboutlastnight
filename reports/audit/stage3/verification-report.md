All claims verified. Here is the decision-grade verification report.

---

# Stage 3 Remediation — Final Verification Report

**Plan:** `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/docs/superpowers/plans/2026-06-21-stage3-remediation.md`
**Verifier scope:** 65-task plan (Workstreams A/B/C + cleanup), 12 phases, M1–M6 + CR-7 integration merges.
**Method:** Every load-bearing claim re-verified against live source; the one refuted finding re-checked by downloading and reading the actual `@langchain/langgraph-checkpoint-sqlite@1.0.3` package source (not installed in the repo).

---

## 1. Verdict

**GO-WITH-REVISIONS.** The plan's core architecture is sound and correctly grounded: the throw→checkpoint→/resume durable spine matches LangGraph 1.0.7 semantics exactly, the SqliteSaver swap works at runtime without an explicit `setup()` call (the one "unverified runtime failure" concern is refuted — `setup()` is invoked per-method and auto-creates schema + WAL), every removed symbol in P12 is genuinely dead, and the security path-confinement helper genuinely closes traversal. No finding rises to a true BLOCKER in the "data-loss / unrecoverable" sense — both LOCKED constraints (recoverable + re-runnable) hold across every confirmed defect. **However**, two confirmed defects make security-objective A and durability-objective B *partially fail their stated goals while baking false justifying prose into the plan*, and one plan-internal desync (M6) will turn a test red mid-execution. These three must be fixed before kickoff because they are objective-gating, not polish. The remaining MAJORs (retry-layer multiplication, dead classifier branches) are correctness-safe but cost/coverage gaps that must not be forgotten. Implementation should not start until the three Section-2 edits land.

---

## 2. Must-fix before implementation (BLOCKERs — the gate)

These three are gating because each one makes a *stated objective silently fail* (A, A, and B-completion respectively) and each bakes a false claim or a guaranteed-red test into the plan. All three are verified against live source.

### MUST-FIX 1 — SEC-4 Secure cookie is dead: `NODE_ENV` is never `'production'` (finding SEC-A-1)
**Affected task:** P7 / Task 7.3 (plan lines 5853–5863).
**Confirmed defect:** Line 5857 gates `secure: process.env.NODE_ENV === 'production'`, and line 5863 asserts "`start-everything.bat`/the tunnel run with `NODE_ENV=production`." That assertion is **false**: `start-everything.bat` sets only `SCRIPT_DIR` and runs `npm start` (verified, full 42-line file); `package.json scripts.start` = `node scripts/kill-port.js 3001 && node server.js` (no NODE_ENV); the only repo-wide `NODE_ENV` reference is `ENV_SETUP.md:232` in a "future/optional" table, and `.env.example` has none. Behind the tunnel `process.env.NODE_ENV` is `undefined` → `secure` is `false` → the `Secure` attribute is never set, and the `app.set('trust proxy', 1)` line P7 adds is dead for its sole stated purpose. The hardening half of SEC-4 provably does not land.
**Exact required edit (pick one mechanism, wire it end-to-end):**
- **Preferred (c):** change line 5857 to `secure: 'auto'` (relies on the already-added `trust proxy` + `x-forwarded-proto`, so the cookie is Secure whenever the inbound hop is HTTPS — no launch-script change). OR
- **(b):** keep the NODE_ENV gate but edit `start-everything.bat` line 21 to `start "ALN Console Server" cmd /k "cd /d %SCRIPT_DIR% && set NODE_ENV=production && npm start"`, and add `NODE_ENV=production` to `.env.example` + ENV_SETUP.md current-variables.
- **In all cases:** (1) delete/rewrite the line-5863 sentence claiming the launch scripts run with `NODE_ENV=production` (it is false as written), and (2) add a verification step to Task 7.3: `curl -sI -L https://console.aboutlastnightgame.com/<login-route> | grep -i 'set-cookie'` and assert `Secure` is present — the plan currently has no check proving the flag landed.

### MUST-FIX 2 — M6 not folded into P12.5: `ROLLBACK_CLEARS_EXEMPT` strip is missing from the task body, guaranteeing a red completeness test mid-execution (finding F1)
**Affected task:** P12 / Task 12.5 (plan lines 8590–8676); interacts with P6.3 (line 5260) and the completeness test (lines 5336–5339).
**Confirmed defect:** P6.3 adds `'supervisorNarrativeCompass'` to `ROLLBACK_CLEARS_EXEMPT` (line 5260, verified). The completeness test `every EXEMPT entry is a real state field` computes `stale = [...EXEMPT].filter(f => !Object.keys(getDefaultState()).includes(f))` and `expect(stale).toEqual([])` (lines 5336–5339, verified). Task 12.5's body (Steps 1–6, read in full) deletes the field from the annotation, getDefaultState, the header, and `state.test.js` — but has **no step removing it from EXEMPT**, and Step 5's verification runs only `npx jest __tests__/unit/workflow/state.test.js`, NOT the completeness suite. A worker executing 12.5's checkboxes lands a red test caught only at the final whole-suite gate. M6 (lines 126–127) prescribes the fix but lives in the authoritative Integration section as an *instruction to modify the body* that was never reconciled into the body itself.
**Exact required edit:**
- Insert **Step 4b** in Task 12.5 (between current Step 4 and Step 5): "Remove the `'supervisorNarrativeCompass'` entry from `ROLLBACK_CLEARS_EXEMPT` in `lib/workflow/state.js` — it sits on the `// Default-only channels never written by any node return` line (state.js ~line 5260-equivalent). After removal that line lists only `'whiteboardAnalysis', 'preCurationSummary'`."
- Change Step 5's jest line to `npx jest __tests__/unit/workflow/state.test.js lib/__tests__/rollback-clears-completeness.test.js` and add to Expected: "rollback-clears-completeness.test.js — all 6 tests pass (the 'no stale exemptions' test now green; 'every field cleared or exempt' stays green with one fewer field and one fewer exemption)."
- Annotate M6 (lines 126–127) as "folded into Task 12.5 Steps 4b/5" to prevent a double-edit.

### MUST-FIX 3 — `isTransientError` status/type branches are dead against real wrapper errors: sustained upstream API failures classify PERMANENT and never auto-retry (finding TRC-1)
**Affected task:** P2 / Task 2.1 (`isTransientError`, plan lines 861–883) + its tests (lines 762–797); consumed by P3 (`retryOn: isTransientError`, plan line 1596).
**Confirmed defect:** The classifier's `status` branch reads `err.apiErrorStatus ?? err.status` and its type branch reads `err.error?.type || err.name || err.code` (verified, lines 871–880). But the SDK wrapper, on the error-result path, throws `new Error('SDK ${msg.subtype}: ${errorDetails}')` with **no status, no error.type, no code, name==='Error'** (client.js:355–358, verified), and the catch re-throws everything except AbortError/StructuredOutputExtractionError unwrapped (client.js:371–385, verified). The SDK type `SDKResultError` carries `errors: string[]` and has **no** `api_error_status` field (that field exists only on `SDKResultSuccess`). So a sustained upstream 429/500/529 that exhausts the SDK's internal `api_retry` surfaces as a bare `Error('SDK error_during_execution: overloaded_error')` → `typeName` resolves to `'Error'` (not transient) → `isTransientError` returns false → LangGraph `retryOn` returns false → **no auto-retry**. The plan's "rate-limit/5xx/overloaded auto-retry" objective is unmet for the dominant upstream-transient class; the status/type/code branches and their tests only match synthetic errors the wrapper never produces. (It still fails-loud and is operator-recoverable via /resume, so the LOCKED constraints hold — this is an objective-coverage gap, classified MAJOR by the auditor. It is listed as a must-fix here only because it makes a *stated B objective silently false*; if the team consciously downgrades the objective in prose instead of fixing the code, that satisfies the gate.)
**Exact required edit (close the gap — preferred):**
- (a) `client.js:355–358` — enrich before throwing: `const err = new Error(\`SDK ${msg.subtype}: ${errorDetails}\`); err.sdkSubtype = msg.subtype; err.sdkErrors = msg.errors || []; throw err;`
- (b) `lib/llm/retry.js#isTransientError` — add a subtype/string branch **before** the final `return false`: build `const hay = \`${err.sdkSubtype||''} ${(err.sdkErrors||[]).join(' ')} ${err.message||''}\``; `if (/error_max_budget_usd|error_max_turns|error_max_structured_output_retries/.test(hay)) return false;` then `if (/overloaded_error|rate_limit_error|\bapi_error\b|\b(429|500|503|529)\b|ECONNRESET|ETIMEDOUT/.test(hay)) return true;`
- (c) `retry.test.js` — REPLACE the synthetic `err.apiErrorStatus/err.status/err.error.type` rows with real wrapper-output rows: `Error('SDK error_during_execution: overloaded_error')` with `sdkSubtype`/`sdkErrors` set → expect true; `Error('SDK error_max_budget_usd: ...')` → expect false.
- **If the team declines to enrich the wrapper:** Task 2.1 must state in prose that the status/type branches are dead against current wrapper output, that the de-facto transient signal is the idle-timeout only, and downgrade the objective line for upstream transients from "auto-retry" to "operator-driven /resume." The silent objective↔coverage inconsistency is the defect — either close it (a–c) or document it.

---

## 3. Should-fix (MAJORs / new-debt — fix during implementation, do not forget)

### SHOULD-FIX 1 — Double-retry layering: in-node loops kept AND graph `retryPolicy` added on the same nodes → up to 9 Opus attempts, each a fresh per-call budget (finding TRC-2; MINOR dup IDEM-2)
**Affected tasks:** P3.1 (retryPolicy on `analyzeArcs`/`curateEvidenceBundle`, plan lines 1654/1663), P3.9/P3.5 (keep in-node loops, plan lines 2116/2512), P2.4 (`MODEL_BUDGETS`, plan ~1308–1317).
**Confirmed:** arc-specialist keeps `MAX_GENERATION_ATTEMPTS=3` and throws the original "SDK timeout after…" on exhaustion (verified, arc-specialist-nodes.js:772–804) → classified transient by `isSdkTimeoutError` → graph `retryPolicy` re-invokes the whole node (grounded retry.js semantics) → **analyzeArcs = 3×3 = 9** full `generateCoreArcs` attempts; scorePaperEvidence's single in-node retry = 2×3 = **6/batch** (verified, ai-nodes.js:214–225). `maxBudgetUsd` is per-call (grounded SDK semantics), so it does **not** bound aggregate spend — up to ~9×$5 = $45 and ~9× the idle window worst-case. Bounded (no infinite loop) → MAJOR, not BLOCKER.
**Correction to the finding's description:** the auditor's claim that this "contradicts the plan's own 'retryPolicy is the sole retrier' framing / primer warning" is a **misattribution** — those phrases are in the grounded-semantics block, NOT in the plan. Drop that justification; rest the finding solely on multiplicative composition + per-call budget.
**Exact required edit (pick ONE layer per self-retrying node):** Preferred — in P3.9/P3.5, when removing the terminal swallow, **also remove the in-node retry loops** (arc-specialist-nodes.js:772–804; ai-nodes.js:214–225) so graph `retryPolicy` is the sole retrier (clean 3 attempts, one budget each). Alternative — keep the in-node loops but set graph `maxAttempts:1` on exactly `analyzeArcs` and `curateEvidenceBundle` in P3.1. Either way, add a note in Task 2.4 (near plan:1308) that `MODEL_BUDGETS`/`maxBudgetUsd` is a per-CALL ceiling, so N retries cost up to N× the per-call ceiling.

### SHOULD-FIX 2 — `llm_retry` SSE affordance has consumers but no producer (dead UI wiring + one misleading comment) (finding IDEM-1)
**Affected tasks:** P2.5 (`SSE_EVENT_TYPES.LLM_RETRY`, plan line 1456), P5.2 (`applyLlmRetry` + reducer, plan lines 4242–4257, 4419–4431), P5.3 (api.js/app.js `case 'llm_retry'`, plan lines 4520, 4542–4549), P5 render (plan lines 4796–4798), retry.js header comment (plan line 832).
**Confirmed:** The full consumer chain exists end-to-end, but no code anywhere emits `llm_retry` — client.js does not consume the SDK's `api_retry` message (verified: zero `api_retry`/`SDKAPIRetryMessage` hits), LangGraph's `retryPolicy` re-run emits nothing through the progress channel (grounded retry.js), and lib/observability has no `llm_retry` branch (verified). The "retrying (n/3)" note can never render. Not a correctness defect (auto-retry behaves as intended, invisibly) → MINOR observability/dead-code gap, NOT the MAJOR idempotency finding the auditor first filed.
**Exact required edit (preferred — YAGNI, drop dead consumer):** remove `LLM_RETRY: 'llm_retry'` (plan:1456) + its assertion (plan:1417); remove `applyLlmRetry` + export + `SSE_LLM_RETRY` action/reducer + `retryNote` field + its test (plan:4242–4257, 4284, 4326, 4419–4431, 4222/4315, 4139–4146); remove the api.js/app.js `case 'llm_retry'` (plan:4520, 4542–4549); remove the retry-note render (plan:4796–4798); fix the retry.js header comment (plan:832) to drop "observability (SSE_LLM_RETRY surfacing)." **Alternatively** (if surfacing SDK transport retries is wanted): add a P2/P3 client.js branch on `msg.type==='system' && msg.subtype==='api_retry'` → `onProgress({type:'llm_retry', attempt, maxAttempts:max_retries, reason})`, and a progress-bridge pass-through — documenting that it surfaces ONLY SDK transport retries, NOT LangGraph node-level retryPolicy re-runs (which stay invisible).

---

## 4. Composition coherence — do P1–P5 compose into one correct failure model?

**Yes, the spine composes correctly**, with the M6 reconciliation gap (MUST-FIX 2) being the only cross-phase break, and it is already named (just not folded). Verified chain:

- **P1 durable spine is sound and complete.** `durability:'sync'` is correctly configured (plan:310/328) and correctly justified per grounded semantics (sync flushes the checkpoint before control returns; async only loses writes on abrupt process exit). The SqliteSaver swap preserves `interrupt()`/`Command(resume)` (saver-agnostic per grounded Q6) and the runtime-failure worry is **refuted** — see §6.
- **P2→P3 throw/checkpoint semantics match the grounded model.** A thrown super-step commits NO channel state (grounded Q2: ERROR-only pending write); the last durable checkpoint is the clean pre-node boundary; /resume re-runs only the failed node from that boundary (grounded Q3). The P3 fail-loud throws in `parseRawInput` fire BEFORE any file write, so replay is idempotent (writeFile overwrites; the SDK calls above the interrupt are read-only). The graph is fully sequential (no fan-out super-step), so the "re-run a succeeded sibling" hazard does not exist here.
- **P4→P5 SSE reconciliation (M4) yields exactly one failed path.** The inline-card path (SSE_COMPLETE clears `processing`, `applyLlmFailure` stamps `phase='failed'`) is consistent; the dropped P5.3-Step-3 mis-keying is correctly excised by M4.

**Cross-phase interactions the per-phase sections miss (beyond documented M1–M6/CR-7):**
1. **`lastOutcome` lifetime contradicts the new durable spine (DEL-1 / DUR-OUTCOME-LIFETIME-1, MINOR).** P4's `session-outcome.js` uses a module-scope `Map`, and its comment claims it "rides the checkpointer cache lifetime" because "one process holds all session state." After P1 makes the checkpointer durable *across restarts*, that premise is false: the durable interrupt state survives a restart but `getSessionOutcome` returns null in the new process. The interrupt status itself survives (so recovery works), but the comment is now self-contradicting. **Fix the comment** to state the store is process-local and intentionally NOT restart-durable; the durable interrupt state is the authoritative recovery surface.
2. **`lastOutcome` is persisted/exposed via GET /state but no console code reads it (DEL-1-readside, QUESTION).** Console recovery actually rides `SessionStart.handleResume → getCheckpoint(graph.getState)+resume`, which recovers interrupted/complete/failed terminals independently. The P4 objective is met *literally* (the field is recoverable via GET /state) but the console never consumes it. **Weaken the "recoverable via GET /state" framing to "inspectable via GET /state,"** or add a console reconnect path. Not gating.

No other un-documented cross-phase break found. M1 (cumulative module.exports), M2 (single finally), M3 (allowlist union), M5 (input-nodes:428 merge), and the P7 stale-anchor coordination are all correctly specified in the Integration section.

---

## 5. Objective & completeness check

| Objective | Status | Bearing findings |
|---|---|---|
| **B — durable: failures never unrecoverable** | **MET** | Spine verified sound; SqliteSaver runtime-failure REFUTED (DUR-SETUP-1). Both LOCKED constraints hold across every confirmed defect. |
| **B — LLM failures (timeout AND schema-invalid) re-runnable by operator** | **MET** | Timeout→isSdkTimeoutError→transient (bounded); StructuredOutputExtractionError→permanent→fail-loud→/resume re-runs node. Verified. |
| **B — fail-loud-to-operator** | **MET** | Wrapper throws on every error-result path (client.js:355–369); no silent swallow after P3 removes terminal swallows. |
| **B — observable** | **AT-RISK (MINOR)** | `llm_retry` affordance is dead (IDEM-1, SHOULD-FIX 2). LangGraph node retries are invisible by design. Streaming (llm_delta) observability is intact. |
| **B — upstream-transient auto-retry (stated sub-objective)** | **GAP** | TRC-1 (MUST-FIX 3): sustained 429/500/529 classifies PERMANENT, no auto-retry. Recoverable but objective silently false until fixed/documented. |
| **A — SEC-1/2 traversal closed** | **MET** | `confineToBase` blocks `../`, absolute, UNC, drive-relative, sibling-prefix; legitimate data/ child paths allowed. Null-byte defeated by fs layer. Verified by auditor execution. |
| **A — SEC-3 token removal** | **MET** | Only legacy detlog*.html read notionToken; SPA does not. |
| **A — SEC-4 SESSION_SECRET fail-fast** | **MET** | `process.exit(1)` at module load; guarded test. |
| **A — SEC-4 secure cookies behind tunnel** | **GAP (gating)** | SEC-A-1 (MUST-FIX 1): NODE_ENV never set → Secure never applied. Security task fails its objective + false prose. |
| **A — SEC-5 rate limiter** | **MET (with caveat)** | Logic correct; trust-proxy:1 + Cloudflare XFF → per-client IP. SEC-A-3 (MINOR): forgeable XFF if port 3001 reachable outside tunnel — document the ingress assumption. |
| **A — SEC-6 1kb auth-route parser** | **MET** | 413-on-oversize, 50mb-elsewhere reproduced by auditor. |
| **C — F1/F3/F4/F9 fully completed** | **MET** | All P8–P11 before-snippets match live source; each targets a genuinely-broken path; M5 composes. F1's only gap is the M6 desync (MUST-FIX 2). |
| **No NEW debt; 12 phases compose into ONE failure model** | **AT-RISK** | TRC-2 (retry multiplication, SHOULD-FIX 1) is the only real new-debt; the two body↔Integration desyncs (M6/F1, CR-7 numbering) are documentation-level and resolved by the authoritative Integration section. |

**Orphan handoff findings with no dedicated task (F3, MINOR):** UX-5 (SSE mid-run drop kills reconnect, api.js:199) is title-claimed by Task 4.5 but its reconnect mechanism is NOT implemented (4.5 implements only the SET_ERROR-clears-processing fix); UX-7 (app.js:198 rollback fall-through) appears nowhere. UX-5's *data-loss* is mitigated by the DEL-1 persisted-outcome path. **Resolution:** either add a one-line note to Task 4.5 clarifying UX-5's data-loss is covered by Task 4.2 (and drop "5" from the 4.5 title since no reconnect is implemented), or add a micro-task for the api.js:199 onerror reconnect + resolve UX-7. Not gating.

---

## 6. Refuted (false positives — do not re-litigate)

- **DUR-SETUP-1 — "Plan never calls `SqliteSaver.setup()`; first invoke/getState may fail at runtime."** **REFUTED, independently re-verified.** I downloaded and read `@langchain/langgraph-checkpoint-sqlite@1.0.3` source (`dist/index.cjs`): `setup()` (line 64) is idempotent via `isSetup` guard (line 65), runs `PRAGMA journal_mode=WAL` (line 66) and `CREATE TABLE IF NOT EXISTS checkpoints/writes` (lines 68, 79); **every public method calls `this.setup()` first** — getTuple (95), list (131), put (218), putWrites (244). `fromConnString` (line 61) only constructs; schema is lazily created on the first method call. The plan's pattern (`fromConnString` → `invoke` → `getState`) **cannot throw "no such table"** and WAL is auto-enabled. The P1.2 durable round-trip test will pass. Not a design defect.

---

## 7. Minor / open questions

**Polish (do during implementation, no decision needed):**
- **TRC-3 (MINOR):** `isTransientError` checks `err.name || err.code` — Node socket errors carry `ECONNRESET` on `err.code` while `err.name==='Error'`, so the `|| err.code` fallback short-circuits. Check name and code independently. (Folded naturally into MUST-FIX 3's rewrite.)
- **IDEM-3 (MINOR):** `parseRawInput` re-runs all 4 SDK calls + 3 file writes on every /resume past its interrupt — idempotent today (overwrites, read-only SDK calls). Add a one-line comment above input-nodes.js:632 so a future edit doesn't add a non-idempotent effect before the interrupt.
- **F2 (MINOR):** CR-7 numbering collides with the existing "Task 12.8" green-check. Renumber the body's green-check to 12.9 and insert CR-7 as 12.8 (Integration section already has the full CR-7 text — nothing lost).
- **F4 (MINOR):** Task 12.3 leaves a stale comment at subagents.js:227 referencing the deleted `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT`. Reword to "Split from the former player-focus-guided single-call prompt."
- **M4-single-path / slice-49 / shapeSessionState-parity (MINOR):** optional cleanups — delete the now-unreachable `currentPhase==='error'` branch inside `case 'complete'`; cap `eventLog` at ~1000 not 49; have `shapeSessionState` reuse `isGraphInterrupted`/`getInterruptData` instead of inline extraction. None gating.
- **retry-handler-inline-logic (MINOR):** the [Retry] handler duplicates `SessionStart.handleResume`'s resume-branching inline and loses live streaming during retry. Optionally route through the shared SSE-before-POST path.

**Human-decision questions:**
- **SEC-A-2 (QUESTION):** `confineToBase` does not `realpath()` — a symlink inside `data/` pointing outside would pass. Document the assumption that `data/` contains no attacker-controlled symlinks, or add `fs.realpathSync.native` re-check (guard ENOENT for write targets). Decide based on whether `data/` is ever attacker-writable.
- **SEC-A-3 (QUESTION):** Confirm port 3001 binds to `127.0.0.1` only so the tunnel is sole ingress; if direct LAN access is possible, key the limiter on `CF-Connecting-IP`. Document the ingress assumption in Task 7.4.
- **SEC-A-5 (QUESTION):** P7 module-scope additions anchor on `const sharedCheckpointer = new MemorySaver()` (server.js:37), which P1 replaces. Already covered by the Integration stale-anchor note (plan:131); optionally edit the P7 anchors to say "after the sharedCheckpointer declaration (SqliteSaver block post-P1)" for self-consistency when read in isolation.

---

## 8. Recommended next action

Make these plan edits **in this order**, then kick off implementation:

1. **MUST-FIX 2 (M6/F1) first** — it is a pure plan-text fold with zero design choice: add Step 4b + amend Step 5's jest command in Task 12.5; annotate M6 as folded. Smallest, removes a guaranteed mid-execution red test.
2. **MUST-FIX 1 (SEC-A-1)** — choose mechanism (recommend `secure:'auto'`, option c — no launch-script change), edit line 5857, delete the false line-5863 assertion, add the curl verification step to Task 7.3.
3. **MUST-FIX 3 (TRC-1)** — decide enrich-vs-document. Recommend enrich (edits a–c): touch client.js:355–358, retry.js#isTransientError, retry.test.js. This also subsumes TRC-3. If the team declines, add the prose downgrade to Task 2.1 instead.
4. **SHOULD-FIX 1 (TRC-2)** — pick one retry layer per self-retrying node (recommend removing the in-node loops in P3.9/P3.5 so graph retryPolicy is sole retrier); add the per-call-budget note to Task 2.4; drop the misattributed "contradicts its own framing" justification from the finding.
5. **SHOULD-FIX 2 (IDEM-1)** — recommend dropping the dead `llm_retry` consumer wiring (YAGNI) per the listed edits; fix the retry.js:832 comment.
6. **Sweep the MINORs** (F2 renumber, F4 stale comment, IDEM-3 comment, DEL-1 lifetime comment, F3 orphan-task note) in one pass — they are one-line edits each.

After edits 1–3 land, the plan clears the gate. Edits 4–6 can be applied during implementation but should be tracked so they are not forgotten. The refuted DUR-SETUP-1 needs no action — the durable spine is runtime-safe as written.

**Relevant files (absolute):**
- Plan: `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/docs/superpowers/plans/2026-06-21-stage3-remediation.md`
- `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/lib/llm/client.js` (TRC-1: error shape at 355–385)
- `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/lib/workflow/nodes/arc-specialist-nodes.js` (TRC-2: in-node loop 772–804)
- `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/lib/workflow/nodes/ai-nodes.js` (TRC-2: scorePaperEvidence retry 214–225)
- `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/start-everything.bat` and `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/package.json` (SEC-A-1: no NODE_ENV)
- `C:/Users/spide/Documents/claudecode/aboutlastnight/reports/lib/workflow/state.js` (F1/M6: EXEMPT + getDefaultState)