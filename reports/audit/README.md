# ALN Reporting System Audit — Workspace

Ground-truth-driven audit of the ALN report-generation system (console/LangGraph path + pure `journalist-report` skill + refinement workflow). We work **backwards from ground truth** to establish *independently* what a successful article is, then audit the system against it. Full plan: `~/.claude/plans/hey-claude-i-d-like-cached-cosmos.md`.

## Validated definition of success

> A successful ALN article recovers **the most compelling TRUE story latent in that session's specific ingredients** — almost always the **gap between the room's verdict and what the full record (exposed memories + money choreography + director-observed behavior) actually implies** — assembled **bespoke from the shared, fixed Notion narrative universe**, honoring the three-layer evidence boundaries, threaded through every section and named only at the close, first person calibrated to Nova's real access. It is a **game artifact**: the post-show payoff that reflects a specific room's choices back to them as consequence.

Validated by ingredient-grounded reads of **041726, 051126, 060526** (see `calibration-3-sessions.md`). Decisive proof that quality is judgable only *with ingredients in hand*: the $1.4M "Sarah" account was a **frame** in 060526 (per a director note) but **acknowledged-hers** in 041726 — identical surface, opposite correct handling.

## The three ground-truth anchors (none of them the pipeline)

- **A — raw GM inputs:** Drive folder `1k7JeQXEJVQdyDZaFE0y9UY1jprmqSM_w` (~32 `MMDD inputs` docs + "Deliberation Transcripts" subfolder).
- **B — shared Notion universe:** the "Elements" DB (memory tokens + paper evidence) + Characters DB, read **directly from Notion** (not the pipeline's `fetched/` copies).
- **C — final outputs:** `outputs/report-MMDDYY.html`.

## Hard execution rules

1. **Ingredients in hand, always.** Every per-session analysis gets the full ingredient set (input doc + Notion content + photo descriptions + director notes). **Output-only judgment is banned** — it is the proven failure mode.
2. **Independence.** Stage 1 reads anchors A/B/C only — never pipeline code, prompts, schemas, or `data/{id}/` intermediates.
3. **Notion is source.** Read Notion directly; a mismatch with the pipeline's fetched copy is itself a Stage-2 finding.

## Stage 1 workstreams (calibration → Success Specification) — COMPLETE

- **1A** `narrative-universe.md` — shared fixed Notion story material (81 tokens, 25 characters, threads, old→new name map). ✅
- **1B** `fictional-timeline.md` — canonical murder-night chronology + four-stage meta-timeline. ✅
- **1C** `corpus-map.md` — session ↔ input-doc ↔ report mapping. ✅ (most rows verified during traces)
- **1D** `sessions/*.md` — **29 ingredient-grounded per-session traces** → the interaction model (in `success-spec.md` §2). ✅
- **1E** game-artifact purpose (`success-spec.md` §1). ✅
- **1F** `success-spec.md` — the **Success Specification** (purpose + interaction model + timeline + story-shapes + excellence bar + hard rules). **← USER-REVIEW GATE before Stage 2.** ✅
- **`open-questions.md`** — unverified observations & open questions held for Stage 2 (NOT failures — the approved outputs are the success target; intent must be verified before anything is called wrong). ✅
- `_trace-prompt.md` — the reusable per-session trace protocol; `calibration-3-sessions.md` — the seed method.

## Stage 2 — static-content audit (COMPLETE)

A white-box **conformance + design audit** of the static content (shared prompts, deterministic code, schema, console UI) against the Success Spec — NOT a behavioral run. Rubric-driven across both paths (shared / console / skill), attributed, with the **determinism-boundary** question applied throughout. Journalist theme only. Artifacts in `stage2/`:
- `grounding-map.md` — the territory (what exists where, file:line; the determinism-boundary master table).
- `rubric-and-plan.md` — the rubric (every spec rule × locus) + method + seeded findings register.
- `handoff.md` — prioritized, implementation-ready per-finding dossiers (P0–P2) + sequencing.

## Open confirmations

- **Detective theme:** CONFIRMED out of scope — journalist-only audit (director, 2026-06-20).
- **Theme/mode metadata** per session is recorded in `corpus-map.md`.
