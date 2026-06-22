# Stage 3 — Code Review Findings (branch `stage2-remediation` diff)

Max-effort intent-aware code review of the **code** in the 30-commit branch diff (the 17 `.md` prompt files are Stage-2 content, out of scope). Lens: [intent-brief.md](intent-brief.md). Method: 9 finder angles + verification; correctness findings proven by **execution**, not reading.

**Scope note:** this pass is **diff-bounded**. Pre-existing control-layer defects in *untouched* code (rollback re-pause, MemorySaver durability, `/api/file` path traversal — S3/S15/S17 in `scope-and-method.md`) are NOT in this diff and are the still-owed **second pass**.

Proof legend: ✅ execution-proven · 🔬 verified by direct file read · 🔁 multi-angle convergence.

## Findings (ranked)

### CR-1 — `buildResumePayload` drops `rosterPronouns` → F1 silently dead on every HTTP path ✅🔁 (P0)
- **file:** `server.js:244-250` (the `await-roster` branch of `buildResumePayload`)
- **does:** forwards `approvals.roster` into `resume`/`stateUpdates`; never forwards `approvals.rosterPronouns`.
- **failure:** AwaitRoster UI sends `{roster, rosterPronouns}` → bridge keeps only `roster` → `checkpointAwaitRoster` reads `resumeValue.rosterPronouns || {}` = `{}` → `sessionConfig.rosterPronouns = {}` → `generateRosterSection` resolves **every character to they/them** in all 4 article-prompt call sites. Found by 6 independent angles; proven by executing the real `buildResumePayload` export (`resume.rosterPronouns === undefined`). The just-shipped F1 feature is 100% inert on the production console path; the e2e harness has its own plumbing so it never caught it.
- **fix:** in the roster block, also forward pronouns: `if (approvals.rosterPronouns && typeof approvals.rosterPronouns === 'object') { stateUpdates.rosterPronouns = approvals.rosterPronouns; resume.rosterPronouns = approvals.rosterPronouns; }` **+ a regression test in `server-build-resume-payload.test.js`** (currently none — that's why it shipped green).

### CR-2 — F3 crystallization instruction contradicts the schema → invalid bundle, post-approval hard fail 🔬 (P0)
- **file:** `lib/prompt-builder.js:884` vs `lib/schemas/content-bundle.schema.json:123-132`
- **does:** prompt says emit a crystallization as *"an inline 'quote' content block with attribution omitted"*; the schema's `quote` content-block variant is `required: ["type","text","attribution"]`, `additionalProperties:false`.
- **failure:** when the model follows the prompt and emits `{type:"quote", text:"..."}` with no attribution, `validateContentBundle` (Phase 4.3) fails schema validation → `routeSchemaValidation` → `END`(error) — **after the human approved the article** at the article checkpoint. Model-dependent trigger, but the prompt *actively recommends* the invalid shape, and the embedded schema simultaneously forbids it (contradiction the model must guess past).
- **fix (intent-aware):** make `attribution` optional/nullable on the **quote content-block** variant in the schema (so attribution-less crystallizations validate **and still render in the body**). Do NOT reroute to `pullQuotes[]` — those don't render, which is the whole reason F3 used inline quote blocks.

### CR-3 — e2e harness reads `data.result`; server emits a flat payload → harness can't report completion ✅ (P1, test tool)
- **file:** `scripts/e2e-walkthrough.js:166` (reader) + `:3444` (the uncommitted band-aid guard)
- **does:** harness completion reader calls `onComplete(data.result)`, but `progressEmitter.emitComplete` spreads the response **flat** (`{...response, type:'complete'}`) — there is no `.result` field. So `currentData` is `undefined` on every non-interrupted completion; the new `if (!currentData) break` guard then fires on **successful** runs, printing a misleading message and discarding `assembledHtml`/`validationResults`/`outputPath`.
- **failure:** proven by reproducing emit+parse — `data.result === undefined`. This is the actual mechanism that stalled the content-verification run; the band-aid masks it instead of fixing the reader contract.
- **fix:** at the reader, `onComplete(data.result || data)` (or nest the emitter under `result`); then remove the band-aid guard. Make the harness assert the rendered result so a regression can't ship green again.

### CR-4 — `parseRawInput` `|| {}` precedence: truthy-empty shadows the fallback + fails soft 🔬 (P1)
- **file:** `lib/workflow/nodes/input-nodes.js:428` — `result.rosterPronouns = state.rosterPronouns || rawInput.rosterPronouns || {}`
- **does:** `checkpointAwaitRoster` always returns `rosterPronouns: resumeValue.rosterPronouns || {}` (a **truthy** `{}`), so `state.rosterPronouns` short-circuits the `||` — `rawInput.rosterPronouns` (the place the skill / `/api/generate` path would supply pronouns) is **unreachable**, and an empty map is accepted silently.
- **failure:** coupled to CR-1 (once CR-1 is fixed, `state.rosterPronouns` is non-empty on the console path). Independent harm: any non-console path that supplies pronouns via `rawInput` is silently ignored; and per the fail-loud rule, an empty-but-required pronoun map should surface, not default. Use an `Object.keys(...).length` check, not truthiness.

### CR-5 — `bannedPatterns` is dead config; the "deterministic" ban enforces nothing 🔬🔁 (P1, determinism boundary)
- **file:** `lib/theme-config.js:55` (journalist) / `:124` (detective), via `getArticleRules` (`:200`)
- **does:** `getArticleRules`/`articleRules.bannedPatterns` is referenced **only** in `theme-config.js` and `theme-config.test.js` — no node, server, or console code runs these regexes against generated output. Article validation is LLM-prompt-based.
- **failure:** the F9 regex fix (and the whole banned-pattern list, both themes) is inert at runtime — it *looks like* a deterministic guardrail but enforces nothing; the passing unit test gives false confidence. Pre-existing, re-exposed by F9 touching it.
- **fix (choice):** either **wire it** — run `bannedPatterns` against the assembled article in a post-gen node and route to revision on a hit (makes it a real determinism guardrail) — or **delete** the dead config + test and document that the ban is prompt-only. (Intent-aware: the determinism boundary wants it wired.)

### CR-6 — `rosterPronouns` dual source of truth, and in no `ROLLBACK_CLEARS` 🔬 (P2)
- **file:** `lib/workflow/state.js:207` (top-level channel) + `input-nodes.js:428` (copy into `sessionConfig`)
- **cost:** the prompt reads only `sessionConfig.rosterPronouns`; the top-level channel exists solely to be mirrored, and the two can drift (e.g., a rollback touching one but not the other — and `rosterPronouns` is in **no** `ROLLBACK_CLEARS` entry, so it survives every rollback as stale). Ties CR3.4 / S5.
- **fix:** single source — either read the channel directly in prompt-builder, or drop the channel and carry pronouns only in `sessionConfig`; add `rosterPronouns` to the relevant `ROLLBACK_CLEARS` lists.

### CR-7 — `generateRosterSection` called with the identical 4-arg `this.*` list at 4 sites (P2, altitude)
- **file:** `lib/prompt-builder.js:603, 653, 793, 1079`
- **cost:** F1 grew the call from 3→4 args across 4 sites, every arg a `this` field; a single `this._rosterSection()` accessor collapses them and prevents a future roster datum from being threaded to only some sites (which would reintroduce they/them at some prompt phases).

### CR-8 — dead F3 `pullQuoteCount` guards + now-false comment (P2)
- **file:** `lib/workflow/nodes/ai-nodes.js:~1220-1231`
- **cost:** with `minPullQuotes:0`, the `pullQuoteCount` computation and both `minPullQuotes > 0` guards are permanently dead, and the surviving comment still claims validation "will trigger revision loop" (routing never reads it). Remove with the F3 change.

## Verified clean (not findings)
- **F16** `subagents.js` −571 lines: all removed symbols have zero live callers (comments only in `arc-specialist-nodes.js`); modules `require` cleanly; 341 tests pass.
- **F8** `buildArticlePrompt` template-param removal: all 3 call sites updated consistently (no positional-arg shift).
- **F3** `minPullQuotes:0`: `??` (not `||`) preserves the zero; `pullQuotes` not in schema `required`; template tolerates absence.
- **CLAUDE.md conventions:** AwaitRoster/InputReview comply (`const`, functional updaters, aria-labels, utility classes); the `|| {}` defaults match the documented intentional-default pattern (so not a *conventions* violation — but CR-4 still flags the fail-soft behavior on its own merits).

## Still owed (second pass — pre-existing, out of this diff)
S3 (await-roster rollback no re-pause), S15 (MemorySaver durability), S17 (`/api/file` path traversal), + the systematic matrices (rollback re-pause ×all, node-error posture ×13, reducer table ×55, UX-state ×19). These are in untouched code, so a diff review structurally can't see them.
