# Stage 2 — Remediation Handoff (implementation-ready)

Per-finding dossiers from the static-content audit, prioritized for a next session to implement. Measured against [success-spec.md](../success-spec.md) and the project memory feedback notes. **No fixes were applied in this audit.** Grounding evidence: [grounding-map.md](grounding-map.md); rubric: [rubric-and-plan.md](rubric-and-plan.md).

Each dossier: **does** (static behavior + file:line) → **diverges** (spec rule) → **locus** → **determinism verdict** → **burden** (refinement it creates) → **fix**.

## How to read the result

The console pipeline is **strong where it's deterministic** — buried-content sealing, Notion-derived names, financial override at render, roster-coverage gating, metadata templating, programmatic contradiction surfacing. The spec gaps cluster in two places: **the shared prompt layer** (which both paths inherit) and **the skill path's failure to carry the console's determinism**. The single highest-leverage theme: *push the remaining correctness-critical work off the model and into code/UI, and fix the prompt rules that are contradictory, stale, or over-mandated.*

### What to make deterministic vs improve as guidance vs keep

| Make DETERMINISTIC (code/UI) | Fix as GUIDANCE (prompts) | KEEP (already right) |
|---|---|---|
| Pronoun resolution from roster (F1) | Exposure attribution (F2) | Buried sealing (`evidence-preprocessor.js:172`) |
| Financial adjustment classification (F5) | Surveillance-capitalism mandate → bespoke gap (F6) | Notion name derivation (`node-helpers.js:966`) |
| Pull-quote rendering (F3) | Headline craft (F7) | Roster-coverage gate (`arc-specialist-nodes.js:1563`) |
| Skill: financial override + mode/guest (F10) | Retired-name examples (F4) | Contradiction engine (`contradiction-nodes.js`) |
| | Timeline framing (F11), bans (F9) | Money direction; financial override (console) |

---

# P0 — breaks correctness / forces refinement

## F1 — Pronouns have no home in any layer
- **Does.** Roster is captured as bare name strings: UI `AwaitRoster.js` (chip input, no pronoun control), schema `input-nodes.js:78-82` (roster = array of strings), `state.js` (no pronoun field), `content-bundle.schema.json` (no pronoun representation). No assignment logic anywhere (`node-helpers.js` has none), no they/them fallback, and no writing prompt states a pronoun rule. Skill path identical (`SKILL.md:160` "list of first names").
- **Diverges.** Spec / [[reference_character_data_sources]] / [[feedback_aln_voice_survives_mechanics]]: the director's session roster is the **authoritative pronoun source**; the universe is gender-neutral (they/them) and canon does not override the roster. The system captures the authority *without the pronouns*, so the rule is unimplementable as built — the model infers gender from names. This is the mechanism behind the corpus pronoun mismatches.
- **Locus.** Shared + console-UI + skill (all three).
- **Determinism verdict.** Must be **deterministic from captured data**, not LLM-inferred.
- **Burden.** Every report risks per-character pronoun errors; a recurring manual fix in refinement.
- **Fix (multi-layer; sequence top-to-bottom).**
  1. **Capture** — add a per-name pronoun control in `AwaitRoster.js` (select: `they/them` default · `she/her` · `he/him` · custom). Change payload to `roster: [{name, pronouns}]` (or a parallel `pronouns` map). Mirror in `SKILL.md` roster input.
  2. **Carry** — extend `SESSION_CONFIG_SCHEMA` roster (`input-nodes.js:78-82`) to objects (or add `rosterPronouns`), persist in `sessionConfig`, surface read-only in `InputReview.js`.
  3. **Assign** — a helper `resolvePronouns(name, roster)` with `they/them` fallback; inject into the roster block in `generateRosterSection` (`prompt-builder.js:22-52`) so each line reads `Vic → Vic Kingsley (they/them)`.
  4. **Rule** — add to `character-voice.md`: "Use each character's pronouns exactly as given in the roster. Default they/them when unspecified. Never infer gender from a name." Remove gendered assumptions from prompt examples (overlaps F4).

## F2 — Exposure-attribution guidance contradicts itself, and neither pole matches the spec
- **Does.** `evidence-boundaries.md:14` "CANNOT name who exposed it (Nova keeps her sources confidential)" and `:30` "never reveal WHO exposed evidence" — vs `section-rules.md:131` "Name characters who exposed evidence (celebrate sources)", `character-voice.md:48-51` "Celebrating Her Sources… name them and acknowledge what it cost them", `writing-principles.md:98` "Who exposed which memories (from exposed evidence list)".
- **Diverges.** [[feedback_aln_exposure_attribution]]: exposer ≠ owner; bringing a memory to Nova is **anonymous by default**; celebrate a named exposer **only when they publicly took credit**; never default exposure credit to the owner. The prompts assert both extremes (always-anonymous AND always-celebrate-by-name), and neither encodes the conditional rule.
- **Locus.** Shared (both paths inherit).
- **Determinism verdict.** Guidance.
- **Burden.** Either fabricated source credit (naming an exposer who was anonymous, often defaulting to the owner) or suppressed legitimate credit — both hand-corrected.
- **Fix.** Reconcile all four sites to one rule: *owner naming is fine (whose memory it is); exposure is anonymous by default; name/celebrate an exposer only when the director notes or accusation show they publicly claimed it.* Suggested replacement for `evidence-boundaries.md:13-14`: "CAN name whose memory it is (the owner). Treat WHO chose to expose it as anonymous by default — name an exposer only when the director notes or public record show they took credit; never assume the owner exposed their own memory." Update `section-rules.md:131` / `character-voice.md:48-51` to "celebrate the *choice* to expose; attribute it to a person only on public credit."

## F3 — Pull quotes are mandated but rendered by neither template
- **Does.** `theme-config.js:91` `postGenValidation: { minPullQuotes: 2 }`; `content-bundle.schema.json` defines `pullQuotes[]`; `narrative-structure.md §8` + `formatting.md` + `prompt-builder.js:879-882` require ≥2. `template-assembler.js:341-342` computes a `hasPullQuotes` flag — but `article.hbs` never references it and never invokes `partials/sidebar/pull-quote.hbs`; `template-nodes.js` has no pull-quote handling; `assets/article.html` has no pull-quote slot. The array is generated, validated, prepared in context, then discarded.
- **Diverges.** Wasted, validation-enforced output that never reaches the reader; the partial + flag exist, so this is a dropped wiring, not a design choice.
- **Locus.** Shared (schema + config + templates).
- **Determinism verdict.** Deterministic (template wiring).
- **Burden.** Generation spends effort + revision loops satisfying `minPullQuotes`; pull-quote moments are then hand-added as inline quotes in refinement (matches [[reference_aln_journalist_template_render]]).
- **Fix (decide one).** **(a) Render** — add to `article.hbs` sidebar: `{{#if hasPullQuotes}}<section …>{{#each pullQuotes}}{{> sidebar/pull-quote this}}{{/each}}</section>{{/if}}` (flag + partial already exist; ~6 lines; decide desktop sidebar vs inline placement). **(b) Drop** — remove `minPullQuotes` from `theme-config.js`, soften the guidance, and route crystallizations/verbatims to inline `quote` content blocks (which *do* render via `quote.hbs`). **Recommend (a)** — lowest effort, preserves the crystallization device.

## F4 — Retired / contradictory character data baked into examples
- **Does.** Skill (worst): `SKILL.md:1220-1221` hardcodes a 15-name roster that is almost entirely retired (James, Victoria, Diana, Rachel, Derek, Tori, Oliver, Jessicah…); `references/schemas.md`, all `.claude/agents/journalist-*.md`, and `voice-samples.md:151` are saturated with retired names + old IDs (`alr001`, `jav042`, `vik002`) + a frozen Dec-21-2025 session. Shared: `anti-patterns.md:261` uses "Tori" as a *model-good* example; `formatting.md:87,143,153` uses "Vic Chase" — contradicting the canonical "Vic Kingsley" asserted at `anti-patterns.md:95`; `evidence-boundaries.md:166` hardcodes reporter "Cassandra". Console prompts/self-tests: `evidence-preprocessor.js:71-82` (VIK001/ALR002/Victoria), `subagents.js:518`, `image-prompt-builder.js:374` self-test rosters.
- **Diverges.** Old→new drift (James→Remi, Victoria→Vic, Diana→Mel, etc.); [[reference_character_data_sources]]. Console runtime is clean (Notion-derived), but the examples anchor the model toward retired names (cf. corpus "Tori Zhang (Cass)").
- **Locus.** Skill (severe) + shared prompts (both paths) + console prompt examples (lower).
- **Determinism verdict.** Guidance/data hygiene.
- **Burden.** Retired-name leakage requiring find-and-replace in refinement.
- **Fix.** Replace example data with current canon or neutral placeholders (`[Character A]`, `tok001`). **Priority order:** (1) shared `anti-patterns.md:261` + `formatting.md` "Vic Chase"→"Vic Kingsley" (both-path impact, and resolves the internal contradiction); (2) `SKILL.md:1220` roster + `schemas.md` + agent defs (skill path); (3) console self-tests/prompt examples. Consider a single canonical example-set file referenced everywhere.

## F5 — Financial adjustment handling diverges from the diegetic/out-of-world rule
- **Does.** Console parse instruction (`input-nodes.js:462-470`): "Adjustment rows on the Scoring Timeline are NOT buried tokens — skip them… Skip placeholder/bonus rows like 'First Burial Bonus'." No diegetic-vs-out-of-world classifier. Totals are LLM-parsed then deterministically overridden (`template-assembler.js:376-396`). Skill computes totals via model formula `base + $50,000 first-token bonus` (`SKILL.md:209-213`) with no override.
- **Diverges.** Spec (director-confirmed, [rubric-and-plan.md](rubric-and-plan.md) B2): in-world adjustments (first-burial bonus, account transfers, settlements) are **diegetic story material to incorporate**; only out-of-world GM corrections are set aside. Current logic skips *all* adjustments, discarding narratable money events.
- **Locus.** Console (parse) + skill (totals) + shared (no rule).
- **Determinism verdict.** Classification should be **deterministic in code**; skill should consume the same authoritative `shellAccounts` override.
- **Burden.** Diegetic money the article should narrate is dropped; skill totals can drift from the ledger.
- **Fix.** In the session-report parse, classify adjustment rows by type (the scoring timeline labels them) — retain diegetic adjustments as narratable events surfaced to the financial summary + director-enricher; drop only GM-correction rows. Port the deterministic override into the skill path. 🔎 **Verify** current first-burial-bonus value and the per-session adjustment taxonomy against a session's scoring data before encoding.

---

# P1 — quality / consistency / cross-path parity

## F6 — Surveillance-capitalism thesis mandated universally
- **Does.** `character-voice.md:26-33` "The Dual Story… Marcus's murder… the logical endpoint"; `writing-principles.md:34-48` "Every Section Serves Both Stories… surveillance capitalism"; `section-rules.md` closing "surveillance capitalism thread made explicit."
- **Diverges.** [[feedback_aln_reports_thesis_driven]] + spec §1/§4: the thesis is the **bespoke gap** between the room's verdict and the record; do **not** force a recurring shape. The universal dual-story mandate competes with the per-session gap (the closing rules already demand "unreusable," creating internal tension).
- **Locus.** Shared. **Verdict.** Guidance. **Burden.** Generic systemic-critique padding that refinement reworks toward the session's actual gap.
- **Fix.** Reframe systemic critique as **one available lens that serves the bespoke gap when the session supports it**, not a mandatory second story in every section. Keep the "must be unreusable" closing rule; make the gap (verdict vs record) the explicit organizing thesis.

## F7 — Headline guidance pushes poetic/thematic over journalism craft
- **Does.** `formatting.md:193-208` — "hint at the systemic critique"; examples "The Party That Stole Your Mind", "What NeurAI Doesn't Want You to Remember."
- **Diverges.** [[feedback_aln_headlines_journalism_craft]]: headlines must do journalism work — proper nouns, active verbs, specific stakes, genre signal — not thesis-fragment poetry.
- **Locus.** Shared. **Verdict.** Guidance. **Burden.** Headlines hand-rewritten in refinement.
- **Fix.** Rewrite the rules + examples to the craft standard (name names, active verb, concrete stake). Add the same to `SKILL.md`/`outline` guidance (currently no headline craft there).

## F8 — Stale legacy template embedded into the generation prompt
- **Does.** `ai-nodes.js:1160` loads `theme.loadTemplate()` → `assets/article.html` (legacy `{{PLACEHOLDER}}` template: hardcoded `datetime="2027-02-22"`, "Black Market Ledger" not "Blake's Ledger", 4 nav links, no hero/evidence-card/pull-quote slots) and `:1193-1195` embeds it as `<TEMPLATE>`. Real render is `templates/journalist/*.hbs`. The comment at `:1159` calls it "optional."
- **Diverges.** The model is shown a structure that doesn't match the output contract (which is the JSON schema, embedded separately). Low-value at best, misleading at worst.
- **Locus.** Shared/console. **Verdict.** Code. **Burden.** Subtle — can bias structure/labels (e.g., "Black Market Ledger").
- **Fix.** Remove the `<TEMPLATE>` embed from the journalist article prompt (the JSON schema is the contract), or regenerate `assets/article.html` from the current hbs. **Recommend removal.**

## F9 — Banned-pattern breadth
- **Does.** `theme-config.js:59` bans substring `token` (case-insensitive) → also flags allowed "memory token". 'guests' ban persists at `prompt-builder.js:98`, the skill validator (`journalist-article-validator.md:25`), and the revision checklist (`prompt-builder.js:1087`).
- **Diverges.** [[feedback_aln_voice_survives_mechanics]]: "memory token" is in-world/allowed; only bare "token" as a system label is avoided. Git history "stop banning guests/transactions" — yet 'guests' bans remain.
- **Locus.** Shared/console + skill validator. **Verdict.** Code (pattern list). **Burden.** False-positive validation failures → revision loops over legitimate language.
- **Fix.** Scope the `token` pattern to bare token(s) (word-boundary + negative lookbehind for "memory "); remove the residual 'guests' bans.

## F10 — Skill-path parity gaps
- **Does.** `SKILL.md` captures no reporting mode and no guest reporter (console does, `SessionStart.js:256-322`, `input-nodes.js:423-428`); skill computes financial totals by model formula (no override); skill examples carry retired names (F4).
- **Diverges.** Remote sessions can't be produced via the skill path; skill output is less deterministic than console.
- **Locus.** Skill. **Verdict.** Mixed (capture = UI/process; totals = code). **Burden.** Skill-path reports need more manual correction than console.
- **Fix.** Add reporting-mode + guest-reporter capture to `SKILL.md` inputs; adopt the deterministic `shellAccounts` override and Notion-name discipline in the skill flow.

## F11 — Timeline framing inconsistency; deliberation stage unencoded
- **Does.** `writing-principles.md:5` + `narrative-structure.md` say **two** timelines (party/investigation); `prompt-builder.js:475-484,790-803` injects **three** (adds "the article NOW"). No explicit deliberation stage anywhere.
- **Diverges.** [[feedback_aln_four_stage_timeline]]: party → investigation → **deliberation (the room turning against its own findings)** → Nova's same-day write-up. The 2-vs-3 split is internally inconsistent; the deliberation beat (key to the gap-as-thesis) is absent.
- **Locus.** Shared + console. **Verdict.** Guidance. **Burden.** Tense slips + missed deliberation framing.
- **Fix.** Unify on the four-stage frame across the prompts and the prompt-builder injection; add deliberation-stage language (how the vote/verdict relates to the record).

## F12 — 'Cassandra' hardcoded as reporter default in many places
- **Does.** `input-nodes.js:425`, `prompt-builder.js:1036,1244`, `SKILL.md:165`, `evidence-curator.md:107`, `schemas.md`.
- **Diverges.** Spec: first name is a per-session input; a default is fine, but it's duplicated and a specific persona.
- **Locus.** Shared + console + skill. **Verdict.** Code (single source). **Burden.** Low; drift risk.
- **Fix.** Single source for the default; consider a neutral default. Low effort.

---

# P2 — hygiene / verify

## F13 — NPC lists duplicated
`theme-config.js` (`getThemeNPCs`) vs hardcoded `evaluator-nodes.js:284-289`, `character-data-nodes.js:81-85`, `contradiction-nodes.js:71-83`. **Fix:** centralize on `getThemeNPCs`; drift risk only.

## F14 — Paper-evidence relevance gate re-couples paper to tokens
`ai-nodes.js:88` weights "supporting detail for an EXPOSED token" (+2); `:96` auto-excludes (regardless of score) paper that "would introduce entirely NEW narrative threads not touched by exposed tokens, player focus, or suspects." **Diverges** from the director-confirmed rule that paper is available by default and *not* gated by the token mechanic. Mitigated by the rescue UI (`EvidenceBundle.js`). *Consider P1.* **Fix:** narrow auto-exclude to minimal/puzzle-only content + explicit director exclusion; drop the exposed-token coupling.

## F15 — Metadata corpus artifacts
The real renderer syncs og/title/`<time datetime>` (`article.hbs:7-14,41-48`). Corpus mismatches (open-question #6) are therefore most likely **manual post-gen HTML edits**, not a generation defect. 🔎 confirm against a refined report's git history; low.

## F16 — Dead code in `subagents.js`
Unexported `getSpecialistAgents()` + orchestrator/synthesis prompts (`subagents.js:62-284, 292-456`) carry boundary rules + retired-name examples but aren't used. **Fix:** delete or quarantine to prevent future drift/confusion.

## F17 — Cross-theme reference
`narrative-structure.md:48` cites "the same 80%/enrichment pattern from the detective report system" inside journalist guidance. **Fix:** restate self-contained.

## F18 — Byline title drift
`references/schemas.md` "Senior Investigative Reporter" vs `prompt-builder.js:1037` "Senior Investigative Correspondent". **Fix:** pick one.

---

# Implementation sequencing

1. **Pronoun pipeline (F1)** — capture → carry → assign → rule, in that order (each depends on the prior).
2. **Shared-prompt rewrites batched by file** — `anti-patterns.md` (F4 names), `formatting.md` (F4 names + F7 headlines), `evidence-boundaries.md` (F2 attribution + F4 Cassandra), `character-voice.md`/`writing-principles.md`/`section-rules.md` (F2 + F6 thesis + F11 timeline). Do F4 name-purge in the same pass as F2/F6/F7 since they touch the same files.
3. **Template/code (F3 pull-quotes, F8 embed, F9 bans, F12 default)** — independent, low-risk.
4. **Skill parity (F10) + skill name-purge (F4)** — port console patterns.
5. **Financial classification (F5)** — after 🔎 verifying the adjustment taxonomy.
6. **P2 hygiene (F13–F18).**

# Items requiring external verification (🔎)
- F5: current first-burial-bonus value + per-session adjustment taxonomy (session scoring data).
- F15: whether corpus metadata mismatches trace to manual edits (report git history).
- Output-faithfulness checks ($163M Vic fund, Mel/Patchwork email, MAR004 dialogue) vs full Notion — **output-level, out of static-audit scope.**
