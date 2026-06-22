# Stage 3 — Control-Layer Correctness & Robustness Audit (scope & method gate)

**This is the sign-off gate.** It defines a *new audit axis* and is grounded in a first-hand read of the control-layer spine (server.js, graph.js, state.js, api-helpers.js, checkpoint-helpers.js, checkpoint-nodes.js, photo-nodes.js, the observability layer, and the console client). No fixes applied here. On approval this expands into `grounding-map.md` (formal territory), `rubric-and-plan.md` (invariant × locus), and `handoff.md` (dossiers) — mirroring Stage 2.

---

## 1. What Stage 3 is — and how it differs from Stages 1–2

Stage 1 built the **Success Spec** (what a *good article* is). Stage 2 audited the **static content** (prompts, schema, deterministic code, console UI) for *conformance* to that spec. Both measured **content/output quality**.

Stage 3 audits a **different axis entirely: the control & delivery layer** — the LangGraph wiring, checkpoint/interrupt/resume/rollback semantics, state reducers, the REST+SSE API, the client↔server contract, error-handling/observability, and the e2e harness. The question is not "is the article good?" but **"does the machine reliably produce *an* article — fail-loud, recoverable, no manual intervention, no silently-degraded output?"**

A perfect prompt cannot save a pipeline that finishes a polished article on top of a failed photo analysis, drops the director's pronoun choices between HTTP and the graph, or refuses to re-pause when the user rolls back to fix the roster. Stage 3 is where those live.

> **There is no pre-existing "spec" for this axis.** The intellectual core of this gate is therefore §4 — **deriving the correctness & robustness invariants** the control layer *should* satisfy. Those invariants play the role the Success Spec rules played in Stage 2.

## 2. North star

A control layer that is:
1. **Fail-loud** — an LLM/IO/auth failure halts or surfaces; it never degrades to empty/placeholder output that flows on to a finished-looking report. *(CLAUDE.md: "Throw errors early — fail fast rather than silent fallbacks.")*
2. **Recoverable** — resume and rollback land you exactly where intended, re-pausing the right checkpoint and clearing the right state.
3. **Contract-honest** — what the client sends is what the server consumes; what the server signals is unambiguous; HTTP/SSE outcomes are not lossy.
4. **Observable** — every outcome (success, pause, error) is delivered to *some* durable place, not only to a live in-memory listener.
5. **Hands-off** — the happy path needs no manual nudging; the test harness faithfully reflects the server.

## 3. Method

White-box **static read** of the control layer (the backbone) + **targeted runtime probes** (the server is running, PID on :3001, with session `061226-verify` parked at await-roster). Divergence is established by reading; probes *demonstrate* the highest-value findings live.

- **Rubric-driven** — every invariant (§4) traced across each locus (server / graph / state / nodes / observability / console / harness), attributed, with a status.
- **Master lens** (the Stage-3 analog of Stage 2's determinism-boundary): **explicit-guaranteed vs implicit-distributed-assumption**, and **fail-loud vs silent-degrade**. For each behavior: *is correctness guaranteed in one place, or assumed across many places that can drift?*
- **Status legend:** ✅ holds · ⚠️ fragile/contract-unclear · ❌ violated (concrete defect) · 🔎 needs a runtime probe to settle.

## 4. Correctness & robustness invariants (the Stage-3 "spec")

Grouped by the 7 dimensions. Each is checkable by reading + (some) by probe. `[status]` is my grounded first-pass; the audit adjudicates.

### D1 — Control-flow correctness (graph wiring / edges / routing)
- **CR1.1** Every node is reachable from `START`; every path terminates at `END` or an interrupt. `[✅ linear graph]`
- **CR1.2** Every conditional router returns only keys present in its edge map (`routeArcValidation/Evaluation`, `routeOutline/ArticleEvaluation`, `routeAfter*Checkpoint`, `routeSchemaValidation`). An unmapped key throws at runtime. `[🔎 sweep all 8]`
- **CR1.3** Revision loops are bounded and always progress (increment-before-revise; caps ARCS 2 / HUMAN_ARCS 4 / OUTLINE 3 / ARTICLE 3). `[✅ structurally; verify counters can't be bypassed]`
- **CR1.4** `RECURSION_LIMIT` (75) is passed to **every** `invoke()`, never to `compile()`. `[✅ all 5 paths: server.js:567,890,982,1089,1146]`
- **CR1.5** Routers key off `currentPhase`, not the append-only `errors[]`. `[⚠️ routeSchemaValidation does this deliberately (graph.js:207-209); sweep the rest]`

### D2 — Checkpoint / interrupt / resume / skip semantics
- **CR2.1** Each checkpoint's skip-condition reads a field that is (a) captured on resume **and** (b) cleared by that checkpoint's `ROLLBACK_CLEARS` entry — otherwise rollback can't re-pause it. `[❌ await-roster: skip reads state.roster (checkpoint-nodes.js:150); ROLLBACK_CLEARS['await-roster'] omits roster/rosterPronouns (state.js:881-890)]`
- **CR2.2** `interrupt()` payload + `getCheckpointData()` together supply every field the client UI needs. `[🔎 per-checkpoint]`
- **CR2.3** `Command({resume, update})` reliably lands the resume value in state (nodes defensively re-return captured values because "update may not persist" — verify each does). `[⚠️ pattern is load-bearing & undocumented why]`
- **CR2.4** Every checkpoint has the full set: node + `CHECKPOINT_TYPES` entry + `getCheckpointData` case + client component + (if rollbackable) `ROLLBACK_CLEARS` entry. `[⚠️ await-full-context is a checkpoint but NOT a rollback point; coverage matrix needed]`
- **CR2.5** `isGraphInterrupted`/`getInterruptData` correctly detect the interrupt (they inspect `tasks[0].interrupts` only). `[🔎 confirm single-task assumption holds]`

### D3 — State management (reducers / rollback / clears)
- **CR3.1** Each of the 55 fields' reducer matches its semantics (replace / append / appendSingle / merge). `[🔎 audit all]`
- **CR3.2** `ROLLBACK_CLEARS[cp]` clears every field produced downstream of `cp` — no stale output survives a rollback. `[❌ arcEvidencePackages (state.js:418) and supervisorNarrativeCompass (:471) are in NO clear list; rosterPronouns/roster never cleared; shellAccounts/canonicalCharacters rely on replay-overwrite]`
- **CR3.3** Append-reducer fields cleared with `[]` not `null`. `[✅ buildRollbackState appendReducerFields set = {evaluationHistory, errors}; verify that's the complete append set]`
- **CR3.4** No dual source of truth for one datum. `[🔎 rosterPronouns lives both top-level AND in sessionConfig.rosterPronouns — can they diverge?]`
- **CR3.5** `currentPhase=null` after rollback triggers regeneration via skip-logic in **every** downstream node (the implicit distributed contract). `[⚠️ the riskiest architectural assumption; spot-check nodes]`

### D4 — REST API + SSE contract
- **CR4.1** Every write endpoint validates inputs and returns typed errors. `[✅ mostly; /api/generate deprecated-but-mounted]`
- **CR4.2** The approve **outcome is reliably delivered.** `[❌ fire-and-forget: /approve returns 200 {status:'processing'} (server.js:970), real result emitted later via an UNBUFFERED in-memory EventEmitter (progress-emitter.js); lost if no SSE subscriber, on reconnect, or on the early-validation 400 path]`
- **CR4.3** SSE event types are unambiguous — one type ≠ multiple outcomes. `[❌ emitComplete forces type:'complete' for done | paused-at-next-interrupt | error (progress-emitter.js:39-46); disambiguated only by payload shape]`
- **CR4.4** HTTP status reflects the outcome (or async is clearly documented). `[⚠️ approve always 200 regardless of eventual success/error]`
- **CR4.5** Read endpoints return a consistent state view. `[⚠️ two access paths: getSessionState reads raw channel_values (server.js:49-60, no interrupt info); /session/:id & /checkpoint use graph.getState (interrupt-aware) — /state & /state/:field can't report interrupt status]`
- **CR4.6** No secret leakage in responses. `[✅ sendErrorResponse sanitizes; /api/config returns NOTION_TOKEN to an authed client by design — note]`

### D5 — Client ↔ server contract matching
- **CR5.1** Every checkpoint component's approve payload shape matches `buildResumePayload`'s expected keys. `[❌ rosterPronouns: client sends it (AwaitRoster.js:66-70), buildResumePayload (server.js:244-250) drops it → F1 silently no-ops on the console path; full matrix needed for the other 9]`
- **CR5.2** Client correctly disambiguates the overloaded `complete` event. `[⚠️ app.js does (app.js:124-153); the e2e harness does NOT — that's S9]`
- **CR5.3** Client UI state cannot get stuck. `[❌ approve early-400 (not-at-checkpoint / validation) dispatches SET_ERROR, which doesn't clear `processing` (state.js:167), and no SSE 'complete' arrives → spinner hangs]`
- **CR5.4** F1 pronouns travel end-to-end on the **console** path (not just via the harness). `[❌ severed at CR5.1; the harness's parallel plumbing masks it]`

### D6 — Error handling / resilience / observability
- **CR6.1** LLM/IO/auth failures fail loud; never degrade to empty output that flows to a finished article. `[❌ analyzePhotos returns createEmptyPhotoAnalysisResult + appends errors but currentPhase stays ANALYZE_PHOTOS, workflow proceeds (photo-nodes.js:480-491); same fail-soft in parseCharacterIds (:694-705) and finalizePhotoAnalyses enrich-fallback (:893). Systemic.]`
- **CR6.2** `errors[]` is actionable & scoped, not cumulative-leaking into success payloads. `[⚠️ append-only (state.js:549-552); completion/resume responses include result.errors even after recovery]`
- **CR6.3** SDK auth validated at startup and mid-run auth failures are distinguishable from content errors. `[⚠️ isClaudeAvailable at startup ✅; mid-run failures get swallowed by CR6.1]`
- **CR6.4** Background-task failures reach the user. `[❌ ties CR4.2 — background catch emits generic 'Internal server error' via the same unbuffered channel; HTTP already returned 200]`
- **CR6.5** SSE loss is recoverable (replay / Last-Event-ID). `[❌ heartbeat only; no buffer/replay]`

### D7 — The e2e harness (the primary test tool)
- **CR7.1** The harness faithfully reflects server state transitions. `[❌ S2: mishandles the overloaded 'complete' event → currentData undefined after the first approve]`
- **CR7.2** The harness doesn't mask server bugs with band-aids or parallel logic. `[❌ the currentData guard band-aid; AND its own rosterPronouns plumbing masks CR5.1/CR5.4]`
- **CR7.3** Harness incremental-input handling matches the server payload contract. `[🔎 reconcile against buildResumePayload — and note even a correct harness can't get pronouns through the real server until CR5.1 is fixed]`

### D8 — Durability & persistence
- **CR8.1** In-flight sessions survive a server restart / crash / deploy. `[❌ sharedCheckpointer = new MemorySaver() (server.js:37); CLAUDE.md prescribes SqliteSaver for production but the server wires in-memory only → a restart loses EVERY session, including ones parked at a human checkpoint after hours of director review]`
- **CR8.2** In-flight background tasks are drained/persisted on graceful shutdown. `[❌ SIGINT handler (server.js:1329-1340) closes the cache and process.exit(0); any setImmediate approve task in flight is lost silently]`
- **CR8.3** Output writes (assembleHtml, photo copy) are atomic and failure-surfacing (no half-written report). `[🔎 read template-nodes.js / template-assembler.js]`

### D9 — Concurrency & re-entrancy
- **CR9.1** Two writes to one session can't interleave destructively (double-approve, two tabs, approve-while-background-running). `[⚠️ approve is fire-and-forget via setImmediate over a shared graph + shared checkpointer; a second approve before the first completes reads not-yet-updated state → race window]`
- **CR9.2** SSE supports the real subscriber model (multiple tabs; reconnect). `[⚠️ per-session broadcast; reconnect loses gap events (S4/S18)]`
- **CR9.3** A graph compiled per request over one shared checkpointer holds no cross-request mutable state. `[🔎 confirm]`

### D10 — Security & input hardening
- **CR10.1** No arbitrary filesystem access via the API. `[❌ /api/file → sendFile(path.resolve(sanitizePath(path))) and /api/browse → readdir(path.resolve(...)); sanitizePath only strips quotes/trims (input-nodes.js:244-248), NO traversal confinement → any authed caller can read/list any file on the host (reports/.env, ~/.claude/.credentials.json) over the public tunnel]`
- **CR10.2** Auth secrets are strong; cookies hardened. `[⚠️ SESSION_SECRET falls back to 'fallback-secret-change-this' (server.js:334); cookie secure:false; one shared ACCESS_PASSWORD; no login rate-limit/lockout]`
- **CR10.3** Secrets aren't over-exposed to the client. `[⚠️ /api/config returns NOTION_TOKEN to any authed client by design — review]`
- **CR10.4** Request/body limits are sane. `[🔎 express.json 50mb global; per-route?]`

### D11 — UI/UX completeness (first-class, per the directive)
- **CR11.1** Every checkpoint component handles all states: populated / empty-or-missing-data / loading / error / disabled-while-processing. `[🔎 18/19 components unread — matrix needed]`
- **CR11.2** Every approve/reject/edit payload shape matches buildResumePayload (CR5.1 across all 10 checkpoints). `[🔎 1/10 verified — and that one (roster) is broken (S2)]`
- **CR11.3** Both the happy path AND every unhappy path give the user a non-dead-end: SSE drop, background failure, validation rejection, not-at-checkpoint, stuck-spinner (S7), revision loop. `[⚠️ dead-ends already found]`
- **CR11.4** Resume/reconnect: closing the tab mid-processing and returning recovers the real state, not a lost background result. `[❌ ties S4/S18 — a completed-while-away approve outcome is unrecoverable]`
- **CR11.5** Accessibility & responsive basics (aria, keyboard, mobile) hold across components. `[🔎 console.css + components]`

## 5. Scope

**Three pillars (per the thoroughness directive): all user flows · all code paths · UI/UX *and* server-side correctness.** The audit must cover each, not just the backend spine.

**In scope — full delivery layer (theme-shared control machinery):**
- **Server/API:** `server.js` (every endpoint, incl. deprecated `/api/generate`), `lib/api-helpers.js`.
- **Graph/state:** `lib/workflow/graph.js`, `state.js`, `checkpoint-helpers.js`.
- **All 13 node files** — error-handling posture + state contract for each: `checkpoint-nodes`, `input-nodes` (incl. the input-review interrupt + `sanitizePath`), `fetch-nodes`, `photo-nodes`, `preprocess-nodes`, `character-data-nodes`, `contradiction-nodes`, `arc-specialist-nodes`, `evaluator-nodes`, `ai-nodes`, `template-nodes`, `node-helpers`, `index`.
- **Failure-surface dependencies:** `lib/llm/*` (timeouts, AbortController, #277 recovery, auth-failure propagation), `lib/cache/*` (SQLite handle, Notion-token/staleness failure modes) — for *how failures propagate*, not their content logic.
- **Observability:** `lib/observability/*` (SSE contract, progress, tracing).
- **All 19 console components** — UX-state + payload-shape matrix: `app`, `state`, `api`, `utils`, `outline-edit-logic`, `SessionStart`, `LoginOverlay`, `CheckpointShell`, `PipelineProgress`, `ProgressStream`, `CompletionView`, `RollbackPanel`, `RevisionDiff`, `FileBrowser`, and the 10 `checkpoints/*`.
- **Harness:** `scripts/e2e-walkthrough.js` (all modes: interactive, `--auto`, `--step`).
- **Cross-cutting dimensions:** durability/persistence (D8), concurrency/re-entrancy (D9), security/hardening (D10), UI/UX completeness (D11).

**User flows to trace end-to-end (happy + unhappy):**
(A) fresh session via console; (B) resume existing / reconnect-after-tab-close; (C) rollback from each checkpoint; (D) revision loops (reject arc/outline/article); (E) e2e harness; (F) skill path *(scope decision)*; (G) detective theme *(scope decision)*; (H) error/recovery (SSE drop, background failure, server restart mid-session); (I) concurrent access (double-click, two tabs).

**Out of scope:** content/prompt/voice quality (Stage 2); article correctness vs ground truth (refinement workflow); SDK internals (#277 is known upstream); **detective/skill *content*** (Stage 2 ruled detective content out).

**Open scope decision (the one genuine fork left):** do flows **F (skill orchestration)** and **G (detective control paths)** get full Stage-3 treatment, or journalist-console only? Detective control paths are ~free (shared machinery + a few theme branches: `detective-outline` schema, detective evaluator, templates); the skill path is a genuinely separate orchestration (standalone agents + fetch scripts, no server). See §11 for the proposed default.

## 6. Loci inventory (grounded anchors)

| Concern | File:line |
|---|---|
| Resume-payload bridge (the rosterPronouns drop) | `server.js:136-276` (roster branch :244-250) |
| Approve fire-and-forget + SSE emit | `server.js:918-1048` (res :970, setImmediate :977, emitComplete :1021/1025/1039) |
| Early-400 paths (no SSE emit) | `server.js:932-951`, `:959-961` |
| Two state-access paths | `server.js:49-60` (getSessionState) vs `:627,:698` (graph.getState) |
| SSE endpoint + heartbeat (no replay) | `server.js:735-778` |
| emitComplete overload | `lib/observability/progress-emitter.js:39-46` |
| Checkpoint skip-conditions | `lib/workflow/nodes/checkpoint-nodes.js` (await-roster :148-178) |
| ROLLBACK_CLEARS / never-cleared fields | `lib/workflow/state.js:850-948`; arcEvidencePackages :418; supervisorNarrativeCompass :471 |
| Routers / revision loops / RECURSION_LIMIT | `lib/workflow/graph.js:84-251`, :696 |
| Fail-soft node error handling | `lib/workflow/nodes/photo-nodes.js:262-265,480-491,694-705,893` |
| Client approve flow / stuck-spinner | `console/app.js:72-183`; `console/state.js:167` |
| Client roster payload | `console/components/checkpoints/AwaitRoster.js:66-78` |
| e2e harness incremental input | `scripts/e2e-walkthrough.js:613,1987-1990` |

## 7. Seeded findings register (grounded; prioritized; to adjudicate in execution)

IDs are **S#** (Stage 3) to avoid colliding with Stage 2's F#. Each will become a handoff dossier in the Stage-2 shape *(does → diverges → locus → fail-loud/contract verdict → burden → fix → priority)*.

### P0 — silent-wrong-output / data-loss / breaks recovery
- **S1 — Silent degradation on LLM/IO failure.** Photo analysis, character-ID parse, and enrichment catch failures, emit placeholders/empties, append to `errors[]`, and **let the workflow finish** (currentPhase never goes ERROR). A polished article gets built on failed inputs. Systemic, contra CLAUDE.md fail-fast. `[CR6.1/CR6.3/CR6.4]`
- **S2 — `buildResumePayload` drops `rosterPronouns` → F1 broken on the console path.** Client sends it, server bridge omits it, node defaults to `{}` → everyone gets they/them. Masked by the harness's parallel plumbing. One-line omission severs a just-shipped feature. `[CR5.1/CR5.4]`
- **S3 — `await-roster` rollback never re-pauses.** `ROLLBACK_CLEARS['await-roster']` omits `roster`/`rosterPronouns`, but the skip-condition reads `state.roster`; after rollback the old roster survives → graph blows past the checkpoint reusing it. "Roll back to fix the roster" silently does nothing. `[CR2.1/CR3.2]`
- **S4 — Approve outcome delivered only via an unbuffered in-memory EventEmitter, under an overloaded event type.** No subscriber / a reconnect / the early-400 path = outcome lost; `type:'complete'` conflates done/paused/error. This is the *root cause of the verification blocker* (S9). `[CR4.2/CR4.3/CR6.4]`

### P1 — consistency / resilience / contract clarity
- **S5 — `ROLLBACK_CLEARS` stale-state gaps.** `arcEvidencePackages` and `supervisorNarrativeCompass` cleared by no rollback point; `rosterPronouns`/`roster` never cleared; `shellAccounts`/`canonicalCharacters` rely on replay-overwrite. `[CR3.2]`
- **S6 — `errors[]` is cumulative and leaks into success payloads;** routers must avoid reading it. `[CR6.2/CR1.5]`
- **S7 — Approve early-400 leaves the client stuck in `processing`** (SET_ERROR doesn't clear it; no SSE complete arrives). `[CR5.3]`
- **S8 — Two state-access paths with divergent interrupt visibility** (`getSessionState` channel_values vs `graph.getState`). `[CR4.5]`
- **S9 — e2e harness mishandles the overloaded `complete` event** (the band-aid `currentData` guard) — the primary test tool. `[CR7.1/CR7.2]`
- **S10 — Deprecated `/api/generate` still mounted** with divergent rollback/merge logic (`buildResumePayload(approvals, {}, ...)` loses the fullContext merge). `[CR4.1 hygiene/risk]`

### P2 — hygiene / drift / verify
- **S11 — Vestigial parallel-branch machinery** (`joinParallelBranches` defined but never added as a node; `genericPhotoAnalyses`; "Branch A/B/C" comments) for parallelism that doesn't exist (graph is sequential). `[CR1 hygiene]`
- **S12 — `getDefaultState` field-count comments drift** (53 vs 55). `[doc]`
- **S13 — SSE has no replay/Last-Event-ID** (overlaps S4). `[CR6.5]`
- **S14 — `isGraphInterrupted` inspects `tasks[0]` only.** `[CR2.5 verify]`
- **S0 — SDK-auth env fragility (environment).** A spawned server inherits gateway/host-auth env that doesn't refresh; the server could detect+warn on invalid SDK auth at startup rather than failing mid-run (ties S1 observability).

### Added by the completeness review (D8–D11 surfaces the spine missed)
- **S15 — No durable checkpointer (P0/robustness).** `MemorySaver` in production (server.js:37) despite CLAUDE.md prescribing SqliteSaver. A restart/crash/deploy loses **every** in-flight session — including ones parked at a human checkpoint after hours of director work — and any in-flight background approve dies on SIGINT. `[CR8.1/CR8.2]`
- **S17 — Arbitrary file read/list via `/api/file` & `/api/browse` (P0/security).** `sanitizePath` only strips quotes (input-nodes.js:244-248); no confinement → any authed caller on the public Cloudflare tunnel can exfiltrate `reports/.env` (NOTION_TOKEN, ACCESS_PASSWORD, SESSION_SECRET) and `~/.claude/.credentials.json`. Compounded by `SESSION_SECRET` fallback + `secure:false` cookie + single shared password + no login lockout. `[CR10.1/CR10.2]`
- **S16 — Approve re-entrancy / concurrency races (P1).** Fire-and-forget `setImmediate` over a shared graph + checkpointer: double-click / two tabs / approve-during-background can interleave on one session's state. `[CR9.1]`
- **S18 — Reconnect loses a completed background outcome (P1/UX).** If the approve finishes while the SSE is down (tab closed / network blip), the outcome is gone (no replay); the UI can only re-derive a *checkpoint* via polling `/checkpoint`, never the `complete` result. `[CR11.4/CR6.5]`

### Systematic sweeps still owed by the grounding pass (completeness, not yet done)
These are matrices, not single reads — the spine only sampled them:
1. **Node-error-posture sweep** across all 13 node files (S1 is currently grounded in *one* file).
2. **Rollback re-pause matrix** — every rollback point × its checkpoint skip-condition × its clear-set (only `await-roster` confirmed = S3).
3. **Client-payload × `buildResumePayload` matrix** — all 10 checkpoints (only roster done = S2).
4. **Per-component UX-state matrix** — 18/19 components unread (D11).
5. **Reducer-correctness table** — all 55 state fields × reducer semantics.
6. **Router-key validity sweep** — all 8 conditional routers return only mapped keys (CR1.2).

## 8. Deliverables (mirroring Stage 2)

1. `grounding-map.md` — formal territory: the checkpoint coverage matrix, the reducer table, the ROLLBACK_CLEARS × state-field completeness matrix, the client-payload × buildResumePayload matrix, the SSE event contract.
2. `rubric-and-plan.md` — the full invariant × locus table with adjudicated statuses + the finding register.
3. `handoff.md` — prioritized, implementation-ready per-finding dossiers + a "make explicit / fail loud / delete" summary + sequencing.

## 9. Decisions needed before execution

1. **Audit posture** — audit-only → handoff (Stage-2 pattern), or audit + fix the concrete P0 bugs inline, or audit + fix everything.
2. **Runtime-probe depth** — static + safe read-only probes only (don't mutate the parked `061226-verify` session), or static + active probes (POST a rollback/approve against a throwaway session to demonstrate S3/S4 live), or static-only.

## 10. Connection to the paused verification

S2/S3/S4/S9 explain *why* the verification run stalled and why resuming it first would have been misleading: the harness masks S2 (pronouns), and the overloaded `complete` event (S4) is what broke the approve loop (S9). **Fixing S9 (harness) + S4 (contract) is the clean unblock path for resuming the content verification** — so Stage 3 should run before we return to it.

## 11. Proposed default for the §5 scope decision

Recommend **yes to both, weighted:**
- **Detective control paths — include (near-free).** The graph/state/API/checkpoint/SSE machinery is identical; only a few branches differ (`detective-outline` schema in `buildResumePayload`, detective evaluator/templates). Covering it is mostly confirming the journalist findings hold + checking the theme branches.
- **Skill orchestration (flow F) — include as a lighter stream.** No server/SSE/rollback, so D4/D8/D9/D11 don't apply; its real Stage-3 risks are orchestration correctness, fetch-script failure modes, and the same fail-soft pattern as the nodes. One focused pass, not the full rubric.

Proceeding on this default unless redirected.

## 12. Coverage ledger (read vs owed — so completeness is provable)

**Backend / control (✓ read first-hand this gate · ◐ sampled/grepped · ☐ owed):**

| File(s) | Status | Still owed |
|---|---|---|
| state.js, graph.js, api-helpers.js, checkpoint-helpers.js, checkpoint-nodes.js, server.js | ✓ | reducer table; router-key sweep; rollback matrix |
| progress-emitter/bridge, node-tracer | ✓ | full SSE contract write-up |
| console api.js, state.js, app.js | ✓ | — |
| photo-nodes.js (errors), input-nodes.js (sanitizePath) | ◐ | full error posture + input-review interrupt |
| fetch · preprocess · character-data · contradiction · arc-specialist · evaluator · ai · template · node-helpers · index nodes | ☐ | error posture + state contract (each) |
| lib/llm/* , lib/cache/* | ☐ | failure propagation (timeouts, #277, auth, SQLite/Notion) |
| observability config/constants/state-snapshot/llm-tracer | ☐ | tracing/PII + config gating |

**Console UI (✓ read · ☐ owed — D11 payload+state matrix):**

| Component | Status |
|---|---|
| app.js, state.js, api.js, checkpoints/AwaitRoster | ✓ |
| utils, outline-edit-logic, SessionStart, LoginOverlay, CheckpointShell, PipelineProgress, ProgressStream, CompletionView, RollbackPanel, RevisionDiff, FileBrowser | ☐ |
| checkpoints: InputReview, PaperEvidence, PreCuration, CharacterIds, AwaitFullContext, EvidenceBundle, ArcSelection, Outline, Article | ☐ |

**User flows (covered · partial · ☐ not yet):**

| Flow | Status |
|---|---|
| A fresh-session console | partial (server side traced; UI states owed) |
| C rollback-from-checkpoint | partial (S3 only; full matrix owed) |
| D revision loops · E e2e harness · H error/recovery | partial (reasoned; not swept) |
| B resume/reconnect · I concurrency · F skill · G detective | ☐ |

**Honest verdict:** the gate is a *grounded scaffold with high-confidence seeds*, not a finished audit. The grounding pass closes every ☐ above; only then is the claim "covers all flows/paths/UX + server correctness" earned.
