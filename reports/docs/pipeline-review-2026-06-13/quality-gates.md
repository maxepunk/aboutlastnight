# QC Architecture Audit — Why the Pipeline's Own Gates Don't Catch Shipped Errors

Scope: `lib/workflow/nodes/{evaluator-nodes,ai-nodes,contradiction-nodes,character-data-nodes,arc-specialist-nodes,checkpoint-nodes}.js`, `lib/workflow/graph.js`, `lib/schemas/*.json`, `.claude/skills/journalist-report/references/prompts/{anti-patterns,evidence-boundaries}.md`, `.claude/agents/journalist-article-validator.md`, `console/components/checkpoints/Article.js`, `lib/prompt-builder.js`.

## THE ONE-SENTENCE ROOT CAUSE

**Generation receives the ground truth; every downstream gate does not.** `generateContentBundle` is handed `arcEvidencePackages` (with verbatim `fullContent`), `shellAccounts`, `sessionFacts` (roster + canonical full names), and `directorNotes` (ai-nodes.js:1165–1202). But the article **evaluator** is given only `contentBundle` + `outline` (evaluator-nodes.js:731–740); the article **validateArticle** node is given only the rendered article + a roster-name list (ai-nodes.js:1330–1344 → prompt-builder.js:1209–1219); and the human **Article checkpoint** is shown only `{contentBundle, evaluationHistory}` (checkpoint-nodes.js:411–424). No gate after generation can compare a claim against the source, so no gate can detect a claim that is fluent, schema-valid, and false. The human refinement pass works precisely because it does the one thing no gate does: rebuilds ground truth from `data/{session}/` first, then checks claim-by-claim.

---

## 1. GATE MAP — what each gate checks and what it provably CANNOT catch

### Programmatic gates

| Gate | File:line | Checks | Provably CANNOT catch |
|---|---|---|---|
| `validateArcStructure` | arc-specialist-nodes.js:1294–1523 | keyEvidence IDs exist in bundle (1347–1369); characterPlacements names ∈ roster/NPC/non-roster-PC, else dropped (1371–1412); victim+operator role contradiction (1414–1425); arcSource/evidenceStrength enum defaulting (1427–1455); accusation arc present (1517–1522) | Whether an arc's *prose claim* matches what the cited evidence *says*. It validates that ID `tok-x` exists — never that the arc's summary reflects `tok-x`'s content. Pronouns, amounts, quotes are out of scope entirely. |
| `surfaceContradictions` | contradiction-nodes.js:14–93 | Roster-named shell accounts vs director "transparency" language (36–69); Blake-proximity sentences (71–83). Output → `state.narrativeTensions` | **Gates nothing.** Output is an advisory hint fed *into* generation (ai-nodes.js:1201), not a pass/fail. Detects only named-account/roster collisions; cannot verify amounts, directions, or anyone's pronouns. |
| `extractCharacterData` | character-data-nodes.js:45–132 | Haiku extracts groups/relationships/role from paper+exposed tokens. `disableTools`, non-fatal on error (125–131) | **Gates nothing** — pure extraction, no comparison against the article. Errors are swallowed (`source: 'error'`). It does **not** extract pronouns, so nothing downstream has a pronoun source of truth. |
| `validateContentBundle` | ai-nodes.js:1280–1315 | ajv schema validity only; strips empty paragraphs (1283–1297) | Everything factual. **Schema-valid ≠ true.** A fabricated $750k figure, a wrong pronoun, an invented quote are all schema-valid strings. |
| `validateArticle` | ai-nodes.js:1330–1387 | Calls `buildValidationPrompt`: em-dash, "token", game-mechanics strings, vague attribution, passive voice, **roster presence**, Blake-condemned, systemic-critique-present (prompt-builder.js:1146–1163). `disableTools:true`, no evidence in prompt | Any claim-vs-source check. It is a **style/voice linter, not a fact-checker.** It receives the article HTML + a flat roster list — no evidence, no transactions, no pronoun map, no canonical-name table. |

### LLM-evaluator gates (all Opus, all `disableTools:true`)

| Gate | File:line | Context received | Provably CANNOT catch |
|---|---|---|---|
| `evaluateArcs` | evaluator-nodes.js:1071; prompt 586–679 | arcs, roster, playerFocus, **all valid evidence IDs**, exposed-evidence *summaries* (id/title/100-char summary, 599–603), buried *synthetic-id* amounts (610–616) | Whether arc prose matches evidence *content* (it gets summaries, not full text). It is told evidenceBundle/playerFocus/directorNotes are **IMMUTABLE** and not to question them (339–348) — so it cannot flag a director-fact misread. |
| `evaluateOutline` | evaluator-nodes.js:1077; prompt 680–729 | outline, selected arcs' interweaving, **first 5** photo analyses (704). No evidence text, no transactions | Any factual claim. Criteria are momentum/flow/coverage. Photo list truncated at 5. |
| `evaluateArticle` | evaluator-nodes.js:1083; prompt 731–740 | **`contentBundle` + `outline`. Nothing else.** | **All five shipped-error categories.** With no evidence, roster-with-pronouns, quote source, or transaction data in context, it is structurally incapable of fact-checking. Its structural criteria are `voiceConsistency` and `antiPatterns` only (219–251) — voice + string patterns. |

### Human checkpoints

| Checkpoint | Data shown | Can a director catch a pronoun/number error here? |
|---|---|---|
| `Outline` (Outline.js) | outline sections, arc coverage | No ground-truth panel; sees the plan, not the facts. |
| `Article` (Article.js + checkpoint-nodes.js:411–424) | Rendered article: headline, sections, evidence cards, **financial tracker**, pull quotes, photos, HTML preview, eval score (Article.js:1154–1169). Payload = `{contentBundle, evaluationHistory}` only. | **Not reliably.** The UI shows the *article's own* numbers/quotes/names with **nothing to compare against** — no roster+pronoun sheet, no transaction ledger, no exposed-quote list. To catch a fabricated $ figure or a wrong pronoun the director must have memorized `data/{session}/` (which is exactly what the human refinement pass does *separately*, with a refsheet). The financial tracker (Article.js:1021–1075) displays whatever the LLM emitted as if authoritative. |

---

## 2. TOP GAPS → mapped to each shipped-error category

1. **Fabricated plausible facts** — No gate ever compares a sentence to a source. `validateArcStructure` checks ID existence, not claim fidelity; `evaluateArticle` has no evidence; `validateArticle` is style-only; schema gate checks shape. A fluent invented fact passes all four. *(generation has the data — gates discard it.)*

2. **Evidence-boundary violations (EXPOSED/BURIED/DIRECTOR)** — The rules exist beautifully in `evidence-boundaries.md` and are loaded into the *generation* and *validation* system prompts (prompt-builder.js:1143–1144), but enforcement is left to an LLM with **no per-claim layer tagging**. The article evaluator never sees which facts came from buried (transaction-only) vs exposed layers; `contentBundle` evidence cards carry a `layer` field (rendered Article.js:1007) but no gate cross-checks that a buried-layer claim only asserts patterns/amounts, not content/ownership. `surfaceContradictions` knows the buried boundary but only emits advisory hints.

3. **Wrong pronouns/names** — There is **no pronoun source of truth anywhere in the pipeline.** `extractCharacterData` pulls groups/roles/relationships (character-data-nodes.js:14–43) but not pronouns. `validateArcStructure` validates names against roster but *canonicalizes silently* and accepts both "Sarah" and "Sarah Blackwood" (per CLAUDE.md), so a name swapped to the wrong canonical (the "Chen" hallucination in anti-patterns.md:90–99) is only caught if it isn't a valid roster name at all. The article evaluator gets no roster; `validateArticle` gets names but no pronouns. Wrong pronouns are invisible to every gate.

4. **Invented quotes** — Nothing string-matches quotes against EXPOSED `fullContent`. `fullContent` is present at generation (ai-nodes.js:1165–1177) and then **dropped** — the evaluator gets `contentBundle` (the quotes themselves) with no source to match against. `anti-patterns.md:172–196` names fabricated dialogue "the worst form of fabrication," but it's prompt guidance, not a gate.

5. **Financial-number errors** — `shellAccounts` (authoritative amounts) reach generation (ai-nodes.js:1179) and `surfaceContradictions`, but the `financialTracker` in `contentBundle` is never reconciled against `shellAccounts`. The Article checkpoint renders the tracker as truth (Article.js:1021–1075). Money-direction reversals (evidence-boundaries.md:88–99) are semantic and invisible to the schema/style gates.

### Why errors persist across sessions (the systemic finding)
- The gates were **deliberately narrowed**: `routeOutlineValidation`/`routeArticleValidation` programmatic checks were **removed** in Commit 8.23 ("too brittle — checked form, not substance. Trust Opus evaluators" graph.js:197–199). But the Opus article evaluator was never given substance to check — so substance is now checked by *no one*.
- The evaluator's `IMMUTABLE INPUTS` framing (evaluator-nodes.js:339–348, 505–512) actively tells it **not** to question evidence/director facts — converting the would-be fact-checker into a structure/voice checker by instruction.
- **At revision-cap exhaustion the loops do NOT silently pass through** — `routeArticleEvaluation` routes to the **human checkpoint** at cap (graph.js:139–154, mirrored for arcs/outline 84–132). So the last line of defense is always the human Article checkpoint — which, per §1, shows no ground truth. The "silent pass-through" risk is instead this: a `ready=true` from a context-starved evaluator is treated as a genuine quality signal, and the human is handed a polished artifact with no diff against reality.
- **Self-approval shortcut**: `evaluatePhase` skips evaluation entirely if `articleApproved`/`outlineApproved`/`selectedArcs` already set (evaluator-nodes.js:848–882), emitting a synthetic `ready:true`. On any resume the gate can be skipped wholesale.

---

## 3. RECOMMENDATIONS (prioritized; each: graph slot + impl + model)

**R1 — Auto-generated ground-truth refsheet node (HIGHEST LEVERAGE).** Add `buildRefsheet` immediately after evidence packaging / before `generateOutline` (graph: after `surfaceContradictions`, parallel-safe). Programmatically assemble from state: roster + canonical full names + **pronouns** (requires adding pronoun capture to roster intake or `extractCharacterData`'s schema), `shellAccounts` ledger (name→amount→txn count→timestamps), exposed-evidence `fullContent` index keyed by token/owner, accusation, director observations. Store as `state.refsheet`. **Programmatic, no model.** Inject into BOTH the generation prompt AND a new fact-check evaluator (R2). This mirrors the human `-refsheet.md` pass and is the single change that unblocks every other gate.

**R2 — Dedicated fact-check evaluator (`evaluateFacts`).** New Opus node between `validateContentBundle` and the Article checkpoint (graph: add node + conditional edge alongside `evaluateArticle`). Prompt receives `contentBundle` **AND** `state.refsheet`. Task: for every proper noun, $ figure, quote, and causal claim, mark `supported | unsupported | contradicts` against the refsheet; `passed=false` if any `unsupported`/`contradicts`. **LLM, Opus** (judgment over fuzzy matches). This is the gate that does not currently exist. Critically, do NOT label refsheet "immutable, don't question" — invert the framing to "verify article against this."

**R3 — Verbatim-quote verifier (programmatic).** Helper run inside R2's node or as a pre-filter: extract every `quote`/`pullQuote.type=="verbatim"`/evidence-card quoted span from `contentBundle`, normalize whitespace/punctuation, and require a substring match against EXPOSED `fullContent`. Non-match → structural fail with the offending string. **Programmatic (string/fuzzy match), no model.** Catches invented quotes deterministically.

**R4 — Numeric-claim checker (programmatic).** Regex every `$[\d,]+` (and written amounts) in `contentBundle` + `financialTracker.entries`; assert each appears in `shellAccounts`/transaction ground truth, and reconcile `financialTracker` totals against `shellAccounts`. Mismatch → structural fail. **Programmatic, no model.** Slots into R2's node or `validateContentBundle`. Catches financial-number errors and tracker drift.

**R5 — Pronoun checker (programmatic, keyed off roster).** Requires pronoun field on roster (intake addition). For each character mention, check surrounding pronouns against the roster's declared pronouns; flag mismatches. **Programmatic, no model** (NLP-lite: sentence-scoped nearest-name association). Slots into R2's node. Catches wrong-pronoun errors that are currently invisible everywhere.

**R6 — Evidence-layer linter (LLM, Sonnet).** Tag each `contentBundle` claim with its source layer (carry `layer` from evidence cards / arc packages through generation). Then assert: buried-layer claims assert only amounts/patterns/timing, never content or ownership (the evidence-boundaries.md rules); director-layer claims are observations, not proven guilt. **LLM, Sonnet** (boundary judgment is semantic but bounded). Slots into R2's node or as a sibling evaluator. Catches the three-layer boundary violations.

**R7 — Enrich the Article (and Outline) human checkpoint with a ground-truth panel.** Add `state.refsheet` (+ R2–R6 per-claim flags) to the `checkpointArticle` payload (checkpoint-nodes.js:420) and render a side-by-side "Source of Truth" panel in `Article.js` (roster+pronouns, ledger, exposed-quote list) with inline ✓/✗ badges on flagged claims. **Frontend + payload change, no model.** Makes the human's last-line defense actually capable of catching what the gates flag.

**R8 — Re-enable substance routing.** The 8.23 removal threw out the substance baby with the brittle-form bathwater. R3/R4/R5 are the non-brittle substance checks 8.23 wanted; wire their failures into `routeArticleEvaluation` so they actually block, not just annotate.

---

## 4. VAGUE / SUBJECTIVE EVALUATOR CRITERIA → likely rubber-stamp approvals

These are scored pass/partial/fail by an Opus model with no objective anchor; they reliably score ≥0.8 and never block:

- `evidenceIntegration`: "Is evidence woven in naturally?" (evaluator-nodes.js:256–260) — *advisory*, unmeasurable, and the evaluator has only summaries to judge "natural."
- `emotionalResonance`: "Does article deliver the promised experience?" (266–270) — *advisory*, pure vibe; "promised" is undefined.
- `arcThreading`: "arcs weave like conversation topics shifting, not chapter breaks" (245–251) — *structural* but subjective; near-impossible to fail.
- `characterPlacement`: "Are all roster members mentioned?" (261–265) — *advisory*; the one objectively checkable article criterion is downgraded to non-blocking.
- `voiceConsistency` / `antiPatterns` (219–238) — the only structural article criteria, and both are **style**, reinforcing that the article gate is a voice gate.
- Outline momentum criteria — `loopArchitecture`, `arcInterweaving`, `visualMomentum`, `convergence` (190–210), each weight 0.025, all *advisory* — readability vibes with negligible weight.
- `coherence`: "consistent story without contradictions" (arcs, 79–83) — *advisory*; the place arc-level fabrications would surface, made non-blocking.

Net effect: **every objectively-checkable, fact-bearing criterion is either absent or advisory; every structural (blocking) criterion is style/voice/structure.** The gates are tuned to approve fluent, well-voiced, correctly-shaped articles — which is exactly the failure profile (plausible + fluent + false) the human pass exists to clean up.

---

## KEY FILE:LINE CITATIONS
- Article evaluator context starvation: `evaluator-nodes.js:731–740` (gets only contentBundle+outline)
- Generation HAS the ground truth: `ai-nodes.js:1165–1202` (fullContent, shellAccounts, sessionFacts, directorNotes)
- validateArticle is style-only, no evidence: `ai-nodes.js:1330–1344`, `prompt-builder.js:1146–1219`
- Schema gate ≠ fact gate: `ai-nodes.js:1280–1315`
- Arc validation = ID/name existence, not claim fidelity: `arc-specialist-nodes.js:1347–1455`
- Contradiction/character nodes gate nothing: `contradiction-nodes.js:87–93`, `character-data-nodes.js:118–131`
- Article checkpoint payload lacks ground truth: `checkpoint-nodes.js:420`
- Article UI has no source-of-truth panel: `Article.js:1154–1169`, `1021–1075`
- Caps route to human, not silent pass: `graph.js:139–154`
- Substance routing deliberately removed: `graph.js:197–199`
- "IMMUTABLE, don't question" framing neuters fact-checking: `evaluator-nodes.js:339–348`
- Rules that SHOULD be enforced but are only prompt guidance: `anti-patterns.md:86–196`, `evidence-boundaries.md:88–128`
