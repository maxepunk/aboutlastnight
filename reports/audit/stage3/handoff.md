# Stage 3 — Control-Layer Audit Handoff (consolidated, prioritized)

Code review of the ALN control/delivery layer, intent-aware ([intent-brief.md](intent-brief.md)). Two passes: the branch diff (`code-review-findings.md`, CR-#) + the pre-existing layer (5 parallel streams). Findings deduped here. **Correctness proven by execution; security proven by live HTTP probe.** No fixes applied yet (sequencing: fix after this register).

Provenance: **[REGR]** = regression from the Stage-2 branch · **[PRE]** = pre-existing latent. Proof: ✅ live/executed · 🔬 verified by read.

---

## P0-CRITICAL — Security (live-proven, public-tunnel exposure) [all PRE]

> The server is reachable at `console.aboutlastnightgame.com` via Cloudflare tunnel, gated only by one shared `ACCESS_PASSWORD`. The endpoints below turn one password into host-wide read.

- **SEC-1 `/api/file` = arbitrary host file read** ✅ — `server.js:1251` `res.sendFile(path.resolve(sanitizePath(req.query.path)))`; `sanitizePath` (input-nodes.js:244) only strips quotes. Proven: returned `../CLAUDE.md` (22 KB), `C:/Windows/win.ini`, server source. (`.env`/`.credentials.json` blocked only incidentally by Express `dotfiles:'ignore'` — not a control; every non-dotfile secret is readable.) **Fix:** confine to an allowlisted base dir (the session `data/` tree) — resolve, then verify the resolved path `startsWith` the allowed root; reject otherwise. Same helper for SEC-2.
- **SEC-2 `/api/browse` = arbitrary host directory enumeration** ✅ — `server.js:1212` `fs.readdir(path.resolve(sanitizePath(dir)))`. Proven: listed `C:/Windows`, `C:/Users`, `~/.claude`. **Fix:** same base-dir confinement; or remove (it's a "local dev tool" that shouldn't be on a tunneled server).
- **SEC-3 `/api/config` leaks `NOTION_TOKEN`** ✅ — `server.js:1205` returns the token in JSON to any authed client → off-host read/write of the game's Notion DBs. **Fix:** stop shipping the token to the client; do Notion calls server-side, or scope a minimal client capability.
- **SEC-4 Forgeable sessions** 🔬 — `server.js:334` `SESSION_SECRET || 'fallback-secret-change-this'`; `cookie.secure:false`. If the env var is ever unset, the signing key is public (in-repo) → mint `{authenticated:true}` cookies, full bypass. **Fix:** fail-fast if `SESSION_SECRET` unset; `secure:true` behind the tunnel.
- **SEC-5 No login throttle** 🔬 — `server.js:355` bare equality, no rate-limit/lockout, no `helmet`/`express-rate-limit` in `package.json`; brute-forceable over the tunnel. **Fix:** add rate-limit + lockout (zero-dep token bucket is fine).
- **SEC-6 Unauth 50 MB body DoS** 🔬 — `server.js:317` `express.json({limit:'50mb'})` runs before `requireAuth`, so unauthenticated `/api/auth/login` buffers 50 MB/req → memory exhaustion on the single-process server that also holds all session state. **Fix:** small JSON limit on auth routes.

---

## P0 — Correctness: silent degradation feeds the generator [all PRE unless noted]

> The flagship Stage-3 theme. A node catches an LLM/IO/**auth** failure, returns empty/placeholder, appends to `errors[]`, and lets the workflow continue (`currentPhase != ERROR`). The confident generator then fabricates over the gap → a polished, plausible, WRONG, *published* article. Every catch below is bare `catch(error)` with no auth-vs-content discrimination (an SDK "Please run /login" is swallowed identically to a content error). Contra CLAUDE.md "throw early, fail fast."

- **N1 `parseRawInput` session-report parse fail-soft** ✅-pattern — `input-nodes.js:489` catch → `{exposedTokens:[],buriedTokens:[],shellAccounts:[],counts:0}`, continues. This is the **authoritative token-disposition + financial source**; empty → every token defaults buried, no shell accounts → generator invents the investigation + amounts. **Highest blast radius.**
- **N3 `curateEvidenceBundle` empty-bundle-as-success** 🔬 — `ai-nodes.js:331` returns an empty three-layer bundle with `curatorNotes:'No evidence to curate'` + continues when `preprocessedEvidence` is empty → masks upstream failure → article authored with zero grounding.
- **N8 `assembleHtml` has no non-empty guard (the missing backstop)** 🔬 — `template-nodes.js:130` assembles + writes `report-{id}.html` + returns `COMPLETE` regardless of bundle thinness → hollow/fabricated article published to `outputs/` with a success log.
- **N2 photo analysis** ✅ — `photo-nodes.js:262/480` placeholder per photo, node returns `ANALYZE_PHOTOS` (not ERROR). Proven: auth-error SDK → `currentPhase=1.65`, placeholders, continues → mis-attributed photo captions.
- **N7 arc analysis** 🔬 — `arc-specialist-nodes.js:863` catch → `[]` arcs + `ARC_SYNTHESIS` (explicitly not ERROR) → empty arc-selection screen indistinguishable from "genuinely no arcs" vs an outage; force-forward can carry `[]` onward.
- **N4 whiteboard parse** 🔬 — `input-nodes.js:600` catch → empty player-focus → arcs invented with no player-conclusion grounding.
- **N6 character extraction** 🔬 — `character-data-nodes.js:125` catch → `{characters:{}}` → the "don't infer group composition" guard goes empty → wrong affiliations.
- **N5 paper-evidence scoring** 🔬 — `ai-nodes.js:227` batch failure → whole batch `include:false, excludeReason:'scoringError'` → real exposed evidence silently dropped, shown as "low relevance" at the rescue checkpoint.
- **Fix (pattern):** distinguish infra/auth failures (throw → `PHASES.ERROR`) from genuine empty results; never let an empty-because-failed payload reach the generator; add the `assembleHtml` non-empty guard as the final backstop; detect SDK auth at startup (and ideally per-call) and fail loud.

- **CR-1 `buildResumePayload` drops `rosterPronouns` → F1 dead on the console** ✅ **[REGR]** — `server.js:246`. (Full dossier in `code-review-findings.md`.) The one unchanged glue link severs the just-shipped feature; every character → they/them. **Fix:** forward `rosterPronouns` in the roster branch + regression test.
- **CR-2 F3 crystallization ↔ schema contradiction** 🔬 **[REGR]** — `prompt-builder.js:884` recommends an attribution-less inline `quote` block; `content-bundle.schema.json:125` requires `attribution` → invalid bundle → `validateContentBundle` fails → `END(error)` *after* the human approved. **Fix:** make `attribution` optional/nullable on the quote content-block variant (template already tolerates it; do NOT reroute to non-rendering `pullQuotes[]`).

---

## P0/P1 — Durability & recovery [PRE]

- **DUR-1 No durable checkpointer** 🔬 — `server.js:37` `new MemorySaver()` (CLAUDE.md prescribes SqliteSaver). Restart/crash/deploy loses **every** session, including ones parked mid-review. **Fix:** wire SqliteSaver for production.
- **DUR-2 SIGINT drops in-flight approves** 🔬 — `server.js:1329` `process.exit(0)` with no `server.close()`/drain → a `setImmediate` resume mid-flight loses its checkpoint write + never emits. **Fix:** track in-flight tasks; drain or refuse-new before exit.
- **ROLL-1 `await-roster` rollback never re-pauses** ✅ **[REGR-adjacent]** — `state.js:882` clears downstream but not `roster`/`rosterPronouns`; `checkpointAwaitRoster` skips on `state.roster?.length>0` → "roll back to fix the roster" silently reuses stale input. Proven via `buildRollbackState`.
- **ROLL-2 `arcEvidencePackages` survives `arc-selection` rollback** ✅ — `state.js:418` in no clear list; `buildArcEvidencePackages` (ai-nodes.js:701) skips when present → rolling back to re-pick arcs reuses evidence for the OLD arcs → article quotes the wrong storyline. **Fix:** add to `ROLLBACK_CLEARS['arc-selection']` (+ upstream).
- **DEL-1 Approve outcome delivered only via unbuffered emitter** 🔬 — `server.js:970` returns 200 `{status:'processing'}`, real result via `emitComplete` (no buffer/replay). No subscriber / reconnect / early-400 → outcome lost. **Fix:** persist last outcome per session (readable via `/checkpoint`/`/state`); or buffer + Last-Event-ID replay.

---

## P1 — Robustness / contract / UX

- **CONC-1 Concurrent `/approve` race** 🔬 — `server.js:918` two approves both pass `isGraphInterrupted` before either `setImmediate` runs → interleaved resumes on one thread/checkpointer. **Fix:** per-session lock / in-flight guard.
- **SSE-1 `emitComplete` overloads `type:'complete'`** 🔬 — done|paused|error on one event, payload-shape-disambiguated (`progress-emitter.js:39`). **Fix:** distinct event types.
- **READ-1 Read endpoints can't report interrupts** 🔬 — `getSessionState` (server.js:49) reads raw `channel_values`; `/state` & `/state/:field` can't show checkpoint status (only `graph.getState` paths can). **Fix:** use `graph.getState` uniformly.
- **GEN-1 `/api/generate` divergent + photosPath loss** ✅ — `server.js:558` calls `buildResumePayload(approvals, {}, ...)` (empty state) → fullContext merge drops `photosPath`. **Fix:** remove the deprecated endpoint (or fix its state passing).
- **CR-3 e2e harness reads `data.result`; server emits flat** ✅ **[REGR-adjacent]** — `e2e-walkthrough.js:166/3444`; band-aid guard masks it; this stalled the verification run. **Fix:** `onComplete(data.result || data)`; remove the guard; assert rendered result.
- **UX-1 Approve-400 → stuck spinner** 🔬 — `app.js:171` `SET_ERROR` doesn't clear `processing` (`state.js:167`) and early-400s emit no SSE complete → spinner hangs (only reload escapes). **Fix:** clear `processing` on POST error; emit a terminal SSE on early returns.
- **UX-2 `articleEdits` injected with no validation** ✅ — `server.js:227` writes `approvals.articleEdits` straight to `contentBundle` (outlineEdits IS schema-validated). **Fix:** schema-validate `articleEdits` like `outlineEdits`.
- **UX-3 ArcSelection dead recovery button** 🔬 — `ArcSelection.js:135` dispatches non-existent `SHOW_ROLLBACK` → on empty arcs the only recovery is a no-op → stranded. **Fix:** wire to the rollback flow.
- **UX-4 Generic-fallback `{approved:true}` → 400 → hang** 🔬 — `app.js:280` for a data-input checkpoint whose component fails to load → server rejects → UX-1 hang. **Fix:** correct fallback payloads / fail visibly.
- **UX-5 SSE mid-run drop kills reconnect** 🔬 — `api.js:199` `onerror` closes the stream → background completion emitted to nobody → lost. **Fix:** reconnect + recover via `/checkpoint`.
- **CR-4 `parseRawInput` `|| {}` precedence** 🔬 **[REGR]** — `input-nodes.js:428` truthy-`{}` shadows the `rawInput` fallback + accepts empty silently. **Fix:** length check, fail loud on empty-required.
- **ROLL-3 `input-review` rollback also leaves roster/pronouns stale** ✅ — `state.js:852`; compounds ROLL-1.

---

## P2 — Cleanup / hygiene / root-cause

- **CR-5 Delete `bannedPatterns` dead config** 🔬 **[decision: delete]** — `theme-config.js:55/124`, `getArticleRules`; zero runtime consumers. Remove config + `getArticleRules` + test; document ban is prompt-only.
- **ROOT-1 `buildRollbackState` is an untested denylist** ✅ — `api-helpers.js:29` clears a hand-maintained list with no test asserting completeness vs node-written fields (the root cause of ROLL-1/2). **Fix:** add a completeness test enumerating downstream-written fields.
- **CR-6 `rosterPronouns` dual source-of-truth + in no `ROLLBACK_CLEARS`** 🔬 **[REGR]** — `state.js:207` channel + `sessionConfig` copy. **Fix:** single source; add to clears.
- **DEAD-1 `supervisorNarrativeCompass` is dead state** ✅ — `state.js:471`, zero writers, yet header claims cross-phase cohesion. **Fix:** remove or implement.
- **DEAD-2 unused `mergeReducer`** 🔬 — defined/exported, bound to no annotation.
- **CR-7 `generateRosterSection` 4-arg call ×4** 🔬 **[REGR]** — `prompt-builder.js:603/653/793/1079` → single `this._rosterSection()` accessor.
- **CR-8 dead F3 `pullQuoteCount` guards + false comment** 🔬 **[REGR]** — `ai-nodes.js:~1220-1231`.
- **UX-6/7 processing-not-cleared edge cases** 🔬 — `app.js:144` (error w/o clean complete), `app.js:198` (rollback fall-through).

---

## Verified clean (not findings)
Reducers all correct (only `errors`/`evaluationHistory` accumulate); `lib/llm/client.js` + `structured-output-extractor.js` throw correctly (fail-loud); F16 `subagents.js` deletion + F8 `buildArticlePrompt` signature change are caller-consistent; 9/10 checkpoint payload shapes match `buildResumePayload`; `RECURSION_LIMIT` passed on every `invoke()`.

## xhigh re-review additions (deeper-recall pass on the same diff)

A second `/code-review` at xhigh effort, seeded with CR-1…CR-8, surfaced new diff findings. Verified by direct read.

- **X-1 (P0) F1 pronoun key-namespace mismatch** ✅ **[REGR]** — `prompt-builder.js:33-34` `generateRosterSection` iterates `canonicalCharacters` (Notion-derived first-name keys) and resolves pronouns via `resolvePronouns(canonicalFirstName, rosterPronouns)`, but `rosterPronouns` is keyed by the **director-typed** roster name (`AwaitRoster.js:68`); case-insensitive match only. Any nickname/full-name divergence ("Vic"↔"Victoria", "Sarah Blackwood"↔"Sarah") → silent they/them. **F1 stays broken for common name forms even after CR-1 is fixed** (node-reproduced: emits "Victoria → Victoria Kingsley (they/them)"). **Fix:** key pronouns by canonical name, or resolve typed→canonical when building/stamping `rosterPronouns` (single normalization at source). CR-1 and X-1 must BOTH land for F1 to work.
- **X-2 (P1) F9 scoping never reached the live validators** ✅ **[REGR]** — `evaluator-nodes.js:543` (journalist) + `:541` (detective) still instruct "MUST NOT contain ... 'token'" as a blocking `structural` antiPattern (weight 0.15), and `prompt-builder.js:1158` `buildValidationPrompt` still flags `"token/tokens"`. F9 scoped only the dead `bannedPatterns` regex (CR-5) + the skill `.md`. → "memory token" triggers spurious revision loops; F9 is unimplemented on the server path. **Fix:** scope the `token` instruction in `evaluator-nodes.js` + `buildValidationPrompt` to bare token (allow "memory token"), both themes.
- **X-3 (P1) F4 retired data in the live article prompt** 🔬 **[REGR]** — `prompt-builder.js:876-877` example hardcodes `jav042`/`JAV042`, "Victoria", "Jamie Woods" — anchors the model on retired identifiers every journalist run. F4 only edited fetch scripts + agent `.md`. **Fix:** replace with current canon or neutral placeholders (`tok001`, `[Character A]`).
- **X-4 (P1) InputReview shows wrong pronouns to the director** 🔬 **[REGR]** — `InputReview.js:112` indexes `rosterPronouns[name]` with `name` from the LLM-parsed `sessionConfig.roster`, but the map is keyed by typed names (no case-insensitive fallback even). The HITL review surface displays "(they/them)" for characters the director explicitly set → director approves wrong pronouns unknowingly. Same root cause as X-1, at the review gate.
- **X-5 (P1) F3 not propagated to the outline contract** 🔬 **[REGR]** — `prompt-builder.js:547` outline prompt + `outline.schema.json` still elicit per-section `pullQuotes`; the approved outline plans pull-quotes the article phase (post-F3) ignores. Plus `ai-nodes.js:1214` `minPullQuotes ?? 2` resurrects the dropped quota for any unconfigured theme, and its "validation will trigger revision loop" comment is now false. **Fix:** propagate F3 to the outline prompt+schema; drop the `?? 2` fallback.
- **X-6 (P2) Pronouns injected into the detective theme** 🔬 — `generateRosterSection` appends "(pronouns)" unconditionally; detective (third-person, no pronoun capture) gets "(they/them)" lines in its prompt. **Fix:** gate the pronoun annotation on journalist theme.
- **X-7 (P2) Test false-confidence cluster** 🔬 — the F1 prompt-builder tests exercise `generateRosterSection` in isolation (and the "defaults to they/them" test *codifies* the masking default), so CR-1 + X-1 ship green; `server-build-resume-payload.test.js` has no roster/pronoun coverage; the F9 `token-term` test validates dead config; the "NPC anti-drift" test never compares against the hardcoded lists it claims to guard; F3 test asserts config only, not the `?? 2` consumer. **Fix:** add the end-to-end regression tests these gaps name (they ARE the test plan for the fixes above). Plus **[conventions]** `AwaitRoster.js:66` added pure logic (`buildPayload`, dedup) inline instead of a dual-export module (reports/CLAUDE.md testing rule) → no node-env coverage possible.
- **X-8 (P2) Dead code from the deletions** 🔬 — `theme-loader.js:157` `loadTemplate()` orphaned after F8; `subagents.js:21/26` `REFS_PATH`+`normalizePath` dead after F16 (+ stale "Live exports" header :7); `arc-specialist-nodes.js:57` `PLAYER_FOCUS_GUIDED_SYSTEM_PROMPT` imported/exported but unused; `e2e-walkthrough.js:1985` reorder makes the `--auto` await-roster profile unreachable; `e2e-walkthrough.js:615` `--fresh` sends only `directorNotes.rawProse`, dropping structured whiteboard/quotes/transactions for the 11 enriched sessions.
- **REFUTED:** the claimed `roster.map(p => p.name)` coverage bug — all roster sites (`ai-nodes.js:371/911/1178`) are string-safe.

**Net:** F1 needs CR-1 + X-1 + X-4 (capture→bridge→key-namespace→display); F9 needs CR-5 + X-2 (delete dead config AND scope the live validators); F3 needs CR-2 + X-5 (schema attribution AND outline propagation); F4 needs X-3 (live prompt example).

## Fix decisions needed
1. **Security endpoints:** confine `/api/file`+`/api/browse` to the `data/` tree, or **remove** them (are they used by the console UI at all)?
2. **Durability:** wire SqliteSaver now, or accept in-memory for the current single-operator usage?
3. **Fail-loud refactor (N1–N8):** throw-to-ERROR everywhere (safest, may surface more mid-run stops), or a tiered approach (hard-fail on auth/empty-authoritative-source, warn on cosmetic)?
4. **`/api/generate`:** remove the deprecated endpoint outright?
