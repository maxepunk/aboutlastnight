# ALN Report-Generation Pipeline — Review & Remediation Roadmap

**Date:** 2026-06-13
**Scope:** the journalist/detective report pipeline under `reports/` — bugs, code quality, prompt & context engineering, quality gates, and the console HITL UX (including why operators bypass it for the skill path).

This README is the synthesis. Five detailed appendices sit alongside it:

| File | Covers |
|---|---|
| `error-taxonomy.md` | What the manual refinement pass actually fixes every session (frequency/severity/trend, from `outputs/*-findings*.md`) |
| `prompt-context-engineering.md` | The 11 prompt files + `prompt-builder.js`: grounding, contradictions, bloat, salience, quote discipline |
| `code-bugs.md` | Correctness/data-wiring defects in the graph, nodes, LLM client, templates, server |
| `quality-gates.md` | Every evaluator/validator/checkpoint and what it provably cannot catch |
| `console-hitl-ux.md` | Why the console is abandoned for the skill, and the skill-vs-console capability matrix |

---

## TL;DR — the one diagnosis behind "every run needs manual refinement"

**The pipeline generates from ground truth but verifies against nothing — and the path that has the (weak) gates is the one operators avoid.** Three reinforcing layers produce the same outcome:

1. **Generation isn't grounded.** The article prompt's only canonical block is a `firstName → fullName` list (`prompt-builder.js:22-52`) — **no pronouns**, no account-owner map, no accusation outcome, with exact figures sitting in a *different* block. The model is forced to infer gender, relationships, and numbers, which is exactly when it fabricates plausible-but-wrong facts. Worse, the prompt files **actively teach the error**: `formatting.md` uses "Vic Chase" (6×) and `narrative-structure.md` "Skyler Chen" as worked examples, while `anti-patterns.md` declares the canonical name is "Vic Kingsley" and flags "Vic Chen" as a hallucination to avoid.

2. **Nothing downstream re-checks against ground truth.** `generateContentBundle` *is* handed the full evidence, `shellAccounts`, roster, and director notes (`ai-nodes.js:1165-1202`) — but every gate after it has that data stripped. The article evaluator's prompt contains only the content bundle + outline (`evaluator-nodes.js:731-740`); `validateArticle` is a style/voice linter with no evidence; the schema gate checks shape, not truth. Programmatic substance routing was **deliberately removed** in commit 8.23 ("trust Opus evaluators," `graph.js:197-199`) — but the Opus evaluator was never given substance to check, and is explicitly told its inputs are `IMMUTABLE, don't question` (`evaluator-nodes.js:339-348`). So no gate can detect a claim that is fluent, schema-valid, and false.

3. **The path with gates is the one operators flee.** The console has volatile in-memory sessions (`MemorySaver`, `server.js:37` — a restart wipes everything mid-run), SSE that strands the client on a refresh/tunnel blip, a stepper that lies about checkpoint order, and a primary recovery button that dispatches an unhandled action and does nothing (`ArcSelection.js:135`). So operators run the **skill** instead — which skips even the schema gate, the arc-structure check, the evaluators, and the revision caps. They pick the pleasant path precisely because it has the weakest guardrails.

**Net:** the human refinement pass is, today, the pipeline's *only* real fact-checking gate — and it works precisely because it does the one thing the pipeline never does: rebuild ground truth from `data/{session}/` first, then check claim-by-claim. The highest-leverage program of work is to **automate the front half of that refinement pass** (build the refsheet in code) and wire it into both generation and a real verification gate — so the human is doing spot-checks, not full fact-checks.

---

## The error profile we are trying to eliminate (from `error-taxonomy.md`)

Persistent across nearly every fact-checked session despite the prompts warning about each:

1. **Pronoun / misgendering** — ~100% failure rate on any they/them or cross-gender-from-name player (15 instances in 050926). #1 recurring failure; usually hits the accused.
2. **Paper-evidence cited as omniscient narration** (no document attribution) — called "the single most systematic issue" (052926). Facts are *true* but unsourced.
3. **Buried-layer boundary violations** — the article decodes which account holds what / who operated it; 052326 even cites `vic002` from the *untouched* list, meaning buried/untouched content is reaching the generation context at all.
4. **Roster confusion** — wrong character attributed to a pivotal beat, propagated across body + closing + sidebar (050926: the 12:50 meeting attributed to Vic instead of Mel).
5. **Financial-number errors** — ranking drops anonymous accounts holding 30-47% of the money; the orchestrator `totalBuried` field is systematically untrustworthy and gets used anyway.
6. **Photo-caption errors** (misID, miscount, deceased-shown-as-present, caption-contradicts-body) and **photo under-use** (the thesis-bearing whiteboard left unused in 052926).
7. **Style** — aphoristic filler, throat-clearing, and section-template-driven redundancy ("The Players" and "Closing" sections habitually recap).

Outright fabrication is *rare* (one clean case in 053126); most "errors" are misattribution and boundary leaks, not invention. Quote integrity is consistently clean today — but the prompt has no rule binding quotes to verbatim source spans, so that's luck, not design.

---

## Remediation roadmap (ordered by ROI)

### Tier 0 — Confirmed bugs (cheap, ship-blocking correctness). See `code-bugs.md`.

These are concrete defects with code-level fixes; several directly cause taxonomy categories.

- **P0-1 — Photo analysis index mismatch** (`ai-nodes.js:895`). `availablePhotos` is built from `sessionPhotos` *after* filtering out the hero/whiteboard, but the analysis is looked up by the post-filter index `[i]` into the *unfiltered* analyses array — so every photo gets a shifted, wrong analysis. **This is a primary cause of the caption character-misID class.** One-line fix: key by filename (`analyses.find(a => a.filename === filename)`), exactly as line 870 already does for hero selection. *(Verified firsthand.)*
- **P0-2 / P0-3 — Disposition over-burying** (`fetch-nodes.js:392-400, 102-110`). A transient file-read error re-buries *all* tokens (suppressing exposed content); tokens missing from both lists silently default to `buried` with `unknownCount` hardcoded to 0. ID-format drift silently buries exposed evidence. Fix: no-op on read failure; track a real `unknown` bucket and surface it at pre-curation.
- **P1-5 — `arcEvidencePackages` never cleared on rollback** (`state.js` ROLLBACK_CLEARS). After any rollback ≥ arc-selection, `buildArcEvidencePackages` sees a non-empty array and skips, so generation consumes per-arc evidence/quotes built from the *old* arcs — fabricated/mismatched content after a rollback. Fix: add it to ROLLBACK_CLEARS for every checkpoint ≥ arc selection.
- **P1-8 — `fullContent` fallback substitutes a label for content** (`evidence-preprocessor.js:172-182`). The chain appends `name`/`title`, diverging from the canonical `extractFullContent`; if body fields are absent, a token's *name* gets quoted verbatim as memory content. Fix: reuse `extractFullContent()`.
- **P1-6 / P1-7 — Preprocessor evidence loss & boundary leak.** Model-omitted batch items are silently dropped (no reconciliation); items whose id doesn't match an input ship un-enriched with the model-assigned disposition — a buried token with a garbled id can ship as exposed. Fix: reconcile IDs; never emit unmatched items.
- **P1-9 / P1-10 — Photo `Promise.all` data loss** (`photo-nodes.js`). One prompt-build throw rejects the whole batch and discards every completed analysis. Fix: `Promise.allSettled` / move prompt-build inside the try.
- **P2-12 — Detective templates render LLM prose via triple-stache** (`{{{text}}}`) — any `<`, `&`, `"` breaks the DOM. Journalist theme is safe; the two diverge. Fix: double-stache.
- **P2-13 — `pullQuotes` are generated but never rendered** by any layout, and `generateContentBundle` runs *futile revision loops* demanding more of them. Fix: render them, or drop the requirement.
- **P2-18 — Structured-output fence extraction takes only the first ```fence**; an example block before the real answer can be accepted. Fix: `matchAll`, validate each.

### Tier 1 — The grounding + verification spine (the core fix for "minimal manual editing"). See `quality-gates.md` R1-R8 and `prompt-context-engineering.md` #1.

**Single highest-leverage move: add a programmatic `buildRefsheet` node** right after evidence packaging, assembled in code from state — roster + **pronouns** + canonical names, the `shellAccounts` ledger (name → amount → txn count → timestamps), an exposed-evidence `fullContent` index, and the accusation/outcome. Store as `state.refsheet`. This is the same artifact the human builds by hand as `-refsheet.md`. It then powers four things:

- **Inject it into generation** as a `<CANONICAL_FACTS>` block, emitted first/most-salient and marked "authoritative — never infer around it." (Requires adding a pronoun field to the Notion-derived character map — the single most impactful prompt change.)
- **Deterministic gates (no LLM):** pronoun checker keyed off the roster; numeric-claim checker (every `$` figure must appear in `shellAccounts`, and the financial tracker must reconcile); verbatim-quote verifier (every attributed quote must be a contiguous substring of an EXPOSED `fullContent`).
- **A real fact-check evaluator (`evaluateFacts`, Opus):** receives the content bundle **and** the refsheet, marks every proper noun / figure / quote / causal claim `supported | unsupported | contradicts`, and fails on any unsupported/contradicts. Invert the "immutable, don't question" framing to "verify the article against this."
- **An evidence-layer linter (Sonnet):** asserts buried-layer claims assert only amounts/patterns/timing, never content or ownership.

**Wire these failures into `routeArticleEvaluation` so they block** (re-enable substance routing — but with these non-brittle, ground-truth-backed checks, which is what commit 8.23 actually needed).

### Tier 2 — Prompt hygiene (cheap, high-leverage). See `prompt-context-engineering.md`.

- **Purge the contradictory example surnames** ("Vic Chase", "Skyler Chen", "Vic Chen") from the prompt md files → first-name-only or clearly-fake placeholders. Directly attacks the roster-confusion / name-hallucination class. *(Verified the contradiction firsthand.)*
- **Require `sourceTokenId` for verbatim quotes** and add the rule: "every attributed quote must be a verbatim contiguous span from the cited token's `fullContent`; if none fits, write a paragraph instead — do not invent a quote."
- **De-bloat** (~40% of article-phase rules): the article-gen prompt is ~35-45K tokens, heavily rules-dominated, with `evidence-boundaries` double-loaded in the outline prompt and the section-appropriateness table appearing 2-3×. Redundancy dilutes the rarely-but-critically-stated factual constraints.
- **Move a 6-line "FINAL FACTUAL CHECKS" block to maximum recency** (after `<SCHEMA>`): canonical names+pronouns only; never infer buried ownership/content; quotes are verbatim with `sourceTokenId`.
- **Operationalize style rules:** add a banned-opener list (throat-clearing) to `theme-config.bannedPatterns`; strip em-dashes deterministically in `validateContentBundle` rather than relying on a capped revision loop.
- **Add the money-direction rule** (money flows *to* the burier) to the arc-node boundary block — it's currently omitted there, so arc analysis can plant the reversed-direction framing the article inherits.
- **Harden the section templates** that invite redundancy ("Players" and "Closing" defaulting to recap) — a structural prompt issue, not just sentence polish.
- **Add one gold mini-exemplar** demonstrating verbatim quoting, pronoun consistency, no em-dash, and boundary-safe money phrasing with fake placeholder names.

### Tier 3 — Make quality path-independent. See `console-hitl-ux.md` §B and R13.

Operators use the skill, so the gates cannot live only on the server. Port them into the skill/subagents:
- Run ajv `outline.schema.json` / `content-bundle.schema.json` as a **blocking** script step before `assemble-article.js`.
- Add the programmatic arc-structure check (roster coverage, accusation arc, evidence-id validity) as a script.
- Make `journalist-article-validator` a **hard** gate (no silent "proceed anyway" without a logged override).
- Have `assemble-article.js` **refuse to render** a bundle that fails schema validation.
- Ideally, run the Tier 1 deterministic refsheet checks here too, so the skill is as safe as the server.

### Tier 4 — Console survivability/UX (so operators stop fleeing). See `console-hitl-ux.md` §C.

The console already solved the hard part (surgical edits apply without an LLM round-trip on Approve). The adoption problem is **trust and survivability**:
- **`MemorySaver` → `SqliteSaver`** — highest-ROI console fix; makes the advertised "resume" actually durable across restart/crash/deploy.
- **SSE reconnect/replay** + a "re-check status" affordance so a refresh or tunnel blip doesn't strand the client on an eternal spinner.
- **Fix `CHECKPOINT_ORDER`** (`utils.js:119-123`) to match the real graph order; **fix the dead `SHOW_ROLLBACK` button** (`ArcSelection.js:135`); **ajv-validate `articleEdits`** (`server.js:227-229`) to match the outline path.
- **Surface inline editing** (the per-block pencils are undiscoverable; operators reach for the Reject box and eat a full Opus revision + cap decrement); **persist input drafts** to the reducer; **collapse `await-roster` + `await-full-context`** into one front-loaded input step.
- **Add the refsheet panel to the Article checkpoint** (Tier 1 output → `checkpoint-nodes.js:420` payload + `Article.js`), with inline ✓/✗ badges on flagged claims — so the human's last line of defense can actually see what the gates flagged.

---

## Process & data-hygiene notes

- **Refinement coverage is itself inconsistent:** 060526 was published with no refinement pass at all, and 060626 has only a manual-edit commit (no findings files). "Fewer June findings" is a coverage gap, not a quality improvement.
- **PII in inputs:** the raw session input docs (e.g. Drive `0606inputs`) carry a trailing block of player names and personal email addresses. Confirm the input parser strips these and that they never enter any model context or persisted artifact.
- **Opus grades Opus:** `validateArticle` uses Opus to validate Opus output, sharing blind spots, and does LLM checks for things already encoded as regex in `theme-config.bannedPatterns`. Make the deterministic checks programmatic; reserve the LLM for genuinely semantic verification.
