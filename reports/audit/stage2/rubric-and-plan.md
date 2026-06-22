# Stage 2 — Rubric & Audit Plan (gate artifact)

**Method.** A white-box **conformance + design audit** of the static content (prompts, schema, deterministic code, console UI) against the [Success Spec](../success-spec.md) and best practices — **not** a behavioral demonstration. Divergence is established by reading. Lens throughout: *does this reliably produce a spec-compliant result, or does it offload to the model / a human cleanup pass something that should be guaranteed?* Structured **rubric-driven across both paths**: each spec rule / open question traced through shared / console / skill, attributed, with the **determinism-boundary** question applied. Goal metric: minimal post-generation refinement.

**Status legend:** ✅ conformant · ⚠️ divergence/tension · ❌ gap (spec rule cannot be honored as built) · 🔎 needs external verification (pipeline run / full Notion / director).

## Rubric (spec rule × locus)

| # | Spec rule / open question | Shared | Console | Skill | Determinism question |
|---|---|---|---|---|---|
| A1 | Exposed: quote + name owner, never name exposer | ⚠️ contradiction (D5) | ✅ owner kept, exposer not in schema | ⚠️ inherits | — |
| A2 | Buried sealed (amount/timing/behavior; no content/owner→acct) | ✅ rules | ✅ det seal | ⚠️ agent-prompt only | should be det (console ✓, skill ✗) |
| A3 | Director layer: observations primary, whiteboard supporting | ✅ | ✅ enricher | ✅ | — |
| A4 | Paper evidence default-all unless excluded | ❌ rule unstated | ⚠️ all-default **+ LLM relevance auto-exclude** | ⚠️ opt-in framing | exclusion should be director-only |
| A5 | Money direction market→players | ✅ | ✅ | ✅ | — |
| A6 | Grounded inference / present-interprets-past | ⚠️ partial (gap-is-story; no explicit 4-part test) | ✅ contradictions engine | ⚠️ | — |
| B1 | Financial totals reliable | ⚠️ | ✅ det override | ❌ model formula | **skill should adopt det override** |
| B2 | Diegetic vs out-of-world adjustments | ⚠️ unencoded | ⚠️ skip-all-adjustments | ⚠️ | classify in code, not skip-all |
| B3 | Tracker renders + matches prose | ✅ | ✅ | ✅ | — |
| C1 | Canonical names (current; first or full) | ⚠️ stale examples | ✅ Notion | ⚠️ Notion + stale | — |
| C2 | No retired/outdated baked-in names/IDs | ❌ examples (Tori, Vic Chase) | ⚠️ prompt examples/self-tests | ❌ pervasive | — |
| C3 | Roster coverage + non-roster agency + 3-category | ✅ | ✅ det gate | ✅ | — |
| C4 | NPC handling (Marcus/Nova/Blake/Valet) | ✅ | ⚠️ lists duplicated 4 places | ✅ | centralize |
| C5 | **Pronouns from roster; they/them fallback** | ❌ no rule | ❌ no capture/field/logic | ❌ | **should be det from roster; nothing exists** |
| D1 | Reporter first name input + default; Nova fixed | ✅ `{{var}}` | ✅ det stamp | ✅ | hardcoded 'Cassandra' default |
| D2 | Reporting mode on-site/remote | ✅ override rule | ✅ wired | ❌ absent | — |
| D3 | Guest reporter | ✅ schema | ✅ | ❌ absent | — |
| D4 | First-person participatory voice, calibrated to access | ✅ strong | ✅ | ✅ | — |
| D5 | **Exposure attribution: anonymous default, celebrate only public credit** | ❌ **flat contradiction**, neither pole = spec | inherits | inherits | — |
| D6 | Blake nuanced; empathy for buriers; critique system | ✅ | ✅ validator | ✅ validator | — |
| D7 | "extracted memories" not bare "token"; "memory token" OK; em-dash ban; no jargon | ⚠️ `token` substring ban catches "memory token"; **'guests' ban persists** | ⚠️ | ⚠️ | refine banned-pattern list |
| E1 | Party-past (recording) vs this-morning-present tense | ✅ strong | ✅ | ⚠️ no tense rule in SKILL.md | — |
| E2 | Article-NOW + post-game consequences | ⚠️ | ✅ post-investigation block | ⚠️ | — |
| E3 | Deliberation stage (room turns on its findings) | ❌ unencoded | ❌ | ❌ | — |
| F1/F2 | Bespoke gap-as-thesis; not forced; vs **mandated surveillance-capitalism dual-story** | ⚠️ tension | inherits | inherits | — |
| F3 | Throughline every section, multi-angle not repetition, named at close | ✅ | ✅ | ✅ | — |
| F4 | Story-shapes descriptive not forced | ✅ (not a template) | ✅ | ✅ | — |
| F5 | 6-section structure + proportionality | ✅ | ✅ rules | ✅ | — |
| G1 | Headline journalism-craft (proper nouns/verbs/stakes) | ⚠️ pushes poetic/thematic | inherits | inherits (none) | — |
| G2 | Closing bespoke/unreusable | ✅ explicit rule | ✅ | ✅ | — |
| H1-H3 | Photo generic→named; captions visible-only; whiteboard OCR | ✅ | ✅ | ✅ | — |
| I1 | meta/og/title/datetime synced | ✅ hbs | ✅ | ⚠️ stale `assets/article.html` | — |
| I2 | **Pull quotes render** | ❌ mandated, unrendered | ❌ | ❌ | remove mandate or render |
| I3 | Prompt-embedded template matches renderer | ❌ stale `assets/article.html` embedded | ❌ | ❌ | — |
| I4 | Article ID / byline / dateline | ✅ | ✅ | ⚠️ | location unset by builder |
| J1 | Console input capture completeness | — | ✅ (reporter/mode/guest/roster/paper) | n/a | — |
| J2 | Pronoun capture | — | ❌ | ❌ | see C5 |
| J4 | Skill-path parity | — | — | ❌ (mode/guest/det-totals/clean-names) | — |

## Candidate findings register (seeded by grounding; to adjudicate in execution)

### P0 — breaks correctness / forces refinement; high-confidence, knowable by reading
1. **Pronouns have no home (C5/J2).** No capture (`AwaitRoster.js`), no state/schema field, no rule in any prompt, no assignment logic, no they/them fallback — both paths. The roster (the spec's pronoun authority) is captured as bare names. → Model guesses gender from names = the corpus pronoun mismatches. *Fix spans:* UI pronoun capture → state/schema carry → deterministic assignment + they/them fallback → roster section in prompt-builder.
2. **Exposure-attribution contradiction (D5/A1).** `evidence-boundaries.md:14,30` "never reveal WHO exposed" vs `section-rules.md:131` / `character-voice.md:48-51` / `writing-principles.md:98` "name and celebrate sources." Neither pole matches spec ("anonymous by default; celebrate only when they publicly took credit; never default credit to the owner"). *Fix:* reconcile to the spec rule across the shared prompts.
3. **Pull quotes mandated but unrendered (I2).** `postGenValidation:{minPullQuotes:2}` + schema + heavy guidance force `pullQuotes[]`; neither `article.hbs` nor `assets/article.html` renders the array. → wasted generation + manual conversion to `quote` blocks. *Fix:* either render `pullQuotes[]` in the layout or drop the mandate and route crystallizations/verbatims to inline `quote` blocks.
4. **Retired/stale baked-in data (C2/C1).** Skill: `SKILL.md:1220-1221` hardcodes a 15-name retired roster (James/Victoria/Diana/Rachel/Derek/Tori/Oliver/Jessicah…); `schemas.md`, agent defs, `voice-samples.md` saturated; old IDs `alr001/jav042/vik002`. Shared: `anti-patterns.md:261` "Tori" as model-good example; `formatting.md:87` "Vic Chase" (contradicts canonical "Vic Kingsley" `anti-patterns.md:95`); `evidence-boundaries.md:166` "Cassandra". Console prompt examples/self-tests carry Victoria/Derek (`evidence-preprocessor.js:71-82`, `subagents.js:518`, `image-prompt-builder.js:374`). → retired-name leakage (e.g. corpus "Tori Zhang (Cass)"). *Fix:* purge/replace example data with current canon or neutral placeholders; fix the Vic Chase/Kingsley contradiction.
5. **Financial adjustment handling diverges from spec (B1/B2).** Skill computes totals via model formula `base+$50K bonus` with no override; console parse is told to **skip all adjustment/bonus rows** (`input-nodes.js:462-470`) — but spec says diegetic adjustments (first-burial bonus, transfers, settlements) are story material to **incorporate**, only GM corrections set aside. No diegetic/out-of-world classifier. 🔎 verify current bonus rule + per-session adjustment types against session data. *Fix:* classify adjustments in code; skill should consume the same authoritative override.

### P1 — quality / consistency / cross-path parity
6. **Surveillance-capitalism thesis mandated universally (F1/F2)** across `character-voice.md`, `writing-principles.md`, `section-rules.md` — risks the forced-generic-shape the director warned against; in tension with bespoke-gap-as-thesis (closing rules already say "must be unreusable"). *Fix:* reframe systemic critique as one available lens serving the bespoke gap, not a mandatory dual-story.
7. **Headline guidance pushes poetic/thematic (G1)** (`formatting.md:201-204`) vs journalism-craft (proper nouns, active verbs, specific stakes). *Fix:* rewrite headline rules + examples to the craft standard.
8. **Stale embedded template (I3).** `assets/article.html` (legacy `{{PLACEHOLDER}}`, hardcoded date/"Black Market Ledger"/4 nav links) is embedded into the JSON-output prompt as `<TEMPLATE>` while the real renderer is `article.hbs`. *Fix:* stop embedding a divergent HTML template in a JSON-output prompt (or regenerate it from the hbs), 🔎 confirm what `ai-nodes.generateContentBundle` passes as `template`.
9. **Banned-pattern breadth (D7).** `token` substring (case-insensitive, `theme-config.js:59`) flags allowed "memory token"; **'guests' ban persists** (`prompt-builder.js:98`, validator, revision checklist) despite the stated intent to stop. *Fix:* word-boundary "token" exemptions for "memory token"; remove residual 'guests' ban.
10. **Skill-path parity gaps (J4/D2/D3).** Reporting mode + guest reporter absent from `SKILL.md` → remote sessions impossible via skill; skill lacks the deterministic financial override and clean Notion-name discipline. *Fix:* port the console's session-config + determinism into the skill path.
11. **Timeline framing inconsistency (E1-E3).** Prompts say **two** timelines, `prompt-builder.js` injects **three**; deliberation stage unencoded. *Fix:* unify on the spec's four-stage frame (or three + deliberation), consistently.
12. **'Cassandra' hardcoded default (D1)** in `input-nodes.js:425`, `prompt-builder.js:1036,1244`, `SKILL.md:165`, `evidence-curator.md:107`, `schemas.md`. Acceptable as a default but proliferated. *Fix:* single source; consider a neutral default.

### P2 — hygiene / lower / verify
13. **NPC lists duplicated (C4)** across `theme-config.js`, `evaluator-nodes.js:284-289`, `character-data-nodes.js:81-85`, `contradiction-nodes.js` → drift risk. *Fix:* single source (`getThemeNPCs`).
14. **Paper-evidence LLM relevance auto-exclude (A4)** (`ai-nodes.js:84-107,423`) can drop director-intended paper beyond explicit exclusion. 🔎 confirm intent vs spec default-all.
15. **Metadata corpus artifacts (I1)** — real renderer syncs og/datetime; corpus mismatches likely manual post-gen HTML edits. 🔎 confirm.
16. **Dead code in `subagents.js`** (unexported specialists/orchestrator carrying boundary rules + retired examples). *Fix:* delete or quarantine.
17. **Cross-theme reference** — `narrative-structure.md:48` cites "the detective report system" inside journalist guidance.
18. **`references/schemas.md` byline drift** — "Senior Investigative Reporter" vs `prompt-builder.js` "Senior Investigative Correspondent".

### Verification-needed (cannot fully settle statically — flag, don't block)
- Faithfulness of specific corpus quotes ($163M Vic fund, Mel/Patchwork email, MAR004 dialogue) against full Notion — output-level, separate from static audit.
- Which template `generateContentBundle` embeds (finding 8); current first-burial-bonus rule + adjustment types (finding 5); paper auto-exclude intent (finding 14).

## Deliverable (per finding)

Each adjudicated finding → a dossier: **(1)** what the static content does, verbatim + file:line; **(2)** the spec rule it diverges from (citation); **(3)** locus + attribution (shared/console/skill); **(4)** determinism verdict (should this be code, guidance, or UI?); **(5)** refinement-burden it creates; **(6)** fix direction (concrete, file-level), with cross-path reconciliation; **(7)** priority + any 🔎 verification. Collected into a prioritized, implementation-ready **handoff** for a next session. No fixes applied in this audit.

## Execution sequence (post-approval)

1. Adjudicate each rubric row against the spec (confirm/downgrade candidates; resolve the 🔎 items that are quick code checks).
2. Write per-finding dossiers (P0 → P1 → P2).
3. Reconcile shared-vs-path findings; sequence fixes by dependency (e.g., pronoun capture before pronoun rule).
4. Produce the handoff + a short "what to make deterministic vs improve as guidance" summary.
5. Housekeeping: correct the superseded "compare actual generation" framing in `open-questions.md` + the audit memory; update `README.md` Stage-2 section.
