# Stage 3 — Remediation Architecture (synthesis: findings → one coherent fix)

The bridge from the audit ([handoff.md](handoff.md) holds every finding's detail) to implementation. It does three things: (1) names the **single diagnosis** under most of the findings, (2) **reorganizes the ~35 findings into 4 workstreams**, and (3) records the **design decisions** this review settled. No new findings here.

---

## The meta-finding

Roughly half the Stage-3 findings are symptoms of **one** root cause:

> **The pipeline reimplements or *defeats* LangGraph's durable-execution model, and gives the operator no visibility or control.**

So when something fails, the result is either:
- **silently wrong** — a fail-soft node returns empty/placeholder, the workflow continues, and a confident generator fabricates a polished article over the hole (N1–N8); or
- **unrecoverable** — a node throws to `ERROR`→`END`, or `MemorySaver` evaporates the session on restart (DUR-1, throw-to-END routing);

…and in both cases the operator is **blind** (spinner over a dead call; outcome delivered only through an unbuffered emitter). The framework already provides the primitives to do this correctly (`retryPolicy`, durable checkpointers, `durability:"sync"`, resume-re-runs-the-failed-node, `includePartialMessages`, `maxBudgetUsd`); the codebase overrides or ignores them.

The **security** holes and the **Stage-2 remediation regressions** are real but on *different* axes — they don't share this root cause, so they're separate workstreams.

---

## The ~35 findings, reorganized into 4 workstreams

| Workstream | Findings absorbed | Nature |
|---|---|---|
| **A — Security hardening** | SEC-1…SEC-6 | Independent, urgent, zero-dep. Pre-existing. |
| **B — Durable-execution & failure/control spine** | N1–N8, DUR-1/2, DEL-1, SSE-1, READ-1, CONC-1, GEN-1, ROLL-1/2, ROOT-1, UX-1/4/5/6/7 **+** the timeout/retry/cost/observability design | The architectural core. Not 15 patches — one model. |
| **C — Complete the Stage-2 remediation** | CR-1, X-1, X-4, CR-6, CR-7 (F1); CR-2, X-5, CR-8 (F3); X-3 (F4); CR-5, X-2 (F9); CR-3, X-8-e2e (harness); CR-4; X-6; X-7 (the regression tests) | Correctness; finish incompletely-applied fixes. Mostly independent of B. |
| **D — Cleanup / hygiene** | X-8 dead code, DEAD-1/2, S11/S12/S14, CR-7 | Low-risk batch, last. |

---

## Workstream B — the spine (what the whole failure conversation designed)

**Principle:** *fail to the operator at their decision point, recoverably. Transient failures auto-retry and stay invisible; persistent failures surface for a human decision. Nothing degraded reaches the generator, and nothing unguarded reaches `outputs/`.* Built on LangGraph-native + SDK-native primitives → **near-zero new dependencies**.

| # | Mechanism | Primitive | Resolves |
|---|---|---|---|
| 1 | **Durable checkpointer** — every node boundary is a persisted recovery point | `SqliteSaver` + `invoke(..., { durability: "sync" })` | DUR-1; underpins all recovery |
| 2 | **Nodes throw, not fail-soft / not throw-to-END** — a failure leaves the clean *pre-node* snapshot | remove the `catch → empty → continue` and `catch → ERROR→END` patterns | N1–N8 (no more silent degradation) |
| 3 | **Resume = re-run the failed node** — prior work preserved, only the failed step repeats | `graph.invoke({})` on the same thread (LangGraph "resume after task failure") | "re-run LLM failures" + "never unrecoverable" |
| 4 | **Transient auto-retry** — rate-limit / 5xx / connection retry w/ backoff; auth / schema do **not** | LangGraph node `retryPolicy: { maxAttempts, initialInterval, retryOn }` | ad-hoc per-node retry inconsistency |
| 5 | **Idle (stall) timeout** — abort on ~15 min of *silence*, not total duration; healthy long calls never trip it | `includePartialMessages: true` → reset the AbortController on each `stream_event` | the arbitrary 10-min total cap; false-abort waste |
| 6 | **Per-call cost ceiling** — bound spend so retries/long calls can't bonfire tokens | SDK `maxBudgetUsd` → `error_max_budget_usd` | no-cost-awareness gap |
| 7 | **Operator observability** — live phase/thinking/output stream + failure cards (the spine's front half, below) | `includePartialMessages` deltas → coalesced SSE → live UI | observability gaps; UX-1/4/5/6/7 dead-ends; the human stuck-detector that lets #5 stay generous |
| 8 | **Reliable outcome delivery** — the operator-facing surface must be trustworthy | persist last outcome per session (readable via `/state`/`/checkpoint`); split the overloaded `type:'complete'`; uniform `graph.getState` reads; per-session approve lock | DEL-1, SSE-1, READ-1, CONC-1 |

Plus recovery correctness inside B: fix the `ROLLBACK_CLEARS` re-pause/completeness gaps (ROLL-1/2) and add the `buildRollbackState` completeness test (ROOT-1); remove the divergent deprecated `/api/generate` (GEN-1).

**Why this collapses the findings:** items 1–3 turn the N1–N8 cluster from "15 silent-degradation bugs" into "stop overriding durable execution." Items 5–6 turn the timeout/retry/cost thread into three SDK/framework flags. Items 7–8 turn the observability + delivery + UX-dead-end findings into one operator surface.

### The operator observability surface (spine front half — design locked this session)
- **Split macro from micro.** Macro = the `PipelineProgress` stepper + a proper scrollable event log (the cap-49 list is retired — it was an arbitrary UI choice). Micro = a **live call feed** for the call running now, cleared on completion.
- **Four phases** off the `stream_event` stream: *preparing → thinking → writing → done/failed*. Thinking is legible (`ttft_ms` + elapsed) so a long silent think never looks frozen. **Both `thinking_delta` and `text_delta` shown raw** (Opus/Sonnet; Haiku is output-only).
- **Raw live stream** rendered as it forms (yes, structured calls stream raw JSON — that's the chosen transparency). A ticking token counter is the liveness cue.
- **Failures surface here inline** — "rate-limited, retrying (2/3)…", or "❌ failed: 401 — [Retry] [Roll back]". This is the fail-loud / fail-to-operator surface, and the [Retry] is mechanism #3 (`/resume`).
- **Layout:** macro stepper stays visible **above** the live feed during processing.
- **Throttling:** coalesce deltas server-side (~250 ms / ~50 tokens), render replace-not-append, buffer bounded per call. No firehose.
- **State model:** `llmActivity` gains `phase / streamText / ttftMs / tokenCount / lastEventAt / error`; new `SSE_LLM_DELTA` (+ `SSE_LLM_RETRY`); event log becomes its own structure.

---

## Locked design decisions (this conversation)

- **Fail-loud means fail-to-operator, recoverably** — not throw-to-END (strands the session) and not fail-soft (feeds the generator garbage). Hard backstops only where no human follows (`assembleHtml`, startup SDK-auth + Notion-reachability checks). Unattended `--auto` runs lean on the backstops + cost ceiling.
- **Timeout = generous idle/stall (~15 min between stream events), not total duration.** Generous by default; tune only *down*, only from data (the false-abort scars). No gating measurement needed.
- **Retry = transient-only**, via LangGraph `retryPolicy` with a `retryOn` classifier; never blind-retry an expensive long call — that surfaces for a human-decided re-run.
- **Cost** bounded per call via `maxBudgetUsd`.
- **Durability = `SqliteSaver` + `durability:"sync"`.**
- **Observability = raw live stream, thinking + output, macro stepper above** (decisions this session).
- **F9 dead config → delete** (CR-5).

---

## Sequencing, dependencies, open verifications

**Sequence:** **A (security)** is independent and urgent — first / parallel. **B** is the architectural core with internal order: durable checkpointer → throw-not-failsoft → retry/timeout/cost → observability → delivery/rollback. **C** (Stage-2 completion) runs largely parallel to B (different files, mostly prompts/schema), coordinating on shared files (`server.js`, `prompt-builder.js`). **D** last.

**Dependencies (per package.json):**
- `retryPolicy`, `durability` → **zero new deps** (in `@langchain/langgraph@1.0.7`).
- `includePartialMessages`, `maxBudgetUsd` → **zero new deps** (SDK `0.2.119`).
- `SqliteSaver` → one package `@langchain/langgraph-checkpoint-sqlite`, riding on **already-present** `better-sqlite3@12`. ⚠️ verify version-compat with langgraph `1.0.7`; fallback = thin custom `BaseCheckpointSaver` over the existing `better-sqlite3` (zero new package).
- Security, path-confinement, login-throttle, schema, failure-pause → **zero new deps**.
- Respect pins: SDK `0.2.x` (`bypassPermissions` pairing), langgraph `1.0.7` (v1 APIs), `better-sqlite3@12` (native).

**Open verifications (genuine — not hedges):**
1. `@langchain/langgraph-checkpoint-sqlite` version compatible with langgraph `1.0.7`.
2. `claude-api` skill → the exact transient-vs-permanent error taxonomy for the `retryOn` classifier (rate-limit/overloaded/5xx codes, `retry-after`).
3. `stream_event` delta cadence when wiring `includePartialMessages` — a confirmation while implementing, not a blocker.
4. Retry surfacing: LangGraph `retryPolicy` retries opaquely (node re-invoke → fresh `llm_start`); if we want labeled "retry 2/3" UX, keep retry in our SDK wrapper. Decide at implementation.

**Still open for the director:** whether to implement B as one staged mini-project vs. fold piecemeal; and the A-vs-B-vs-C start order.
