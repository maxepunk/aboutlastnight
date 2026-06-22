# Stage 2 — Static-Content Grounding Map

The territory the audit measures against the [Success Spec](../success-spec.md). Journalist theme only (detective = inventory-and-flag, per director). Built by reading the shared guidance layer directly + three locator inventories of console-backend, console-UI, and skill-path files. **This file is structural reality, not judgment** — candidate divergences are adjudicated in [rubric-and-plan.md](rubric-and-plan.md).

## Architecture: two paths, one shared guidance layer

| Layer | What | Used by |
|---|---|---|
| **Shared guidance** | 11 prompt files in `.claude/skills/journalist-report/references/prompts/`; `lib/prompt-builder.js`; `lib/schemas/content-bundle.schema.json`; `templates/journalist/*.hbs`; `lib/theme-config.js` | **Both** paths (console loads prompts per-phase via `theme-loader.js` `PHASE_REQUIREMENTS`) |
| **Console path** | `lib/workflow/nodes/*`, `lib/workflow/state.js`, `console/*` UI | Console/LangGraph only |
| **Skill path** | `.claude/skills/journalist-report/SKILL.md`, `.claude/agents/journalist-*.md`, `references/voice-samples.md`, `references/schemas.md` | Pure Claude Code skill only |

**Key facts established:**
- The 11 prompt files are a **shared** layer — improper guidance there hits both paths (`theme-loader.js:13-56`).
- **Canonical character names are Notion-derived at fetch time** (`node-helpers.js:966-983` `extractCanonicalCharacters`); hardcoded maps were removed from `theme-config.js:79`. The console runtime is therefore clean of retired names; retired names survive only in **prompt examples, schema docs, and self-tests**.
- **Two templates exist:** `templates/journalist/layouts/article.hbs` (the real renderer, via `template-assembler.js`) and `.claude/skills/journalist-report/assets/article.html` (legacy `{{PLACEHOLDER}}` template, embedded into the generation prompt as `<TEMPLATE>`). They diverge.
- Financial totals + buried-content sealing + name normalization + metadata are **deterministic in the console**; the skill path leans on the model for several of these.

## The determinism boundary (master table)

For each spec concern: where it *should* be guaranteed vs where it actually lives. "LLM" = left to model discretion; "det-code" = computed/enforced in JS; "UI" = captured from director; "absent" = nowhere.

| # | Concern | Spec wants | Console actual | Skill actual | Gap |
|---|---|---|---|---|---|
| B1 | Financial totals | det-code from classified ledger | LLM parse → **det override** at render (`template-assembler.js:376-396`); validate log-only (`node-helpers.js:1000-1025`) | LLM formula `base+$50K bonus` (`SKILL.md:209-213`), no override | Skill non-det; source parse is LLM both |
| B2 | Diegetic vs out-of-world adjustments | classify: incorporate diegetic (bonus/transfers/settlements), drop GM fixes | prompt-only "skip adjustment/bonus rows" (`input-nodes.js:462-470`) | same prompt instruction (`SKILL.md`) | No diegetic/out-of-world distinction; spec nuance unencoded |
| A2 | Buried content sealed | det-code | **det** `exposedContentFields`→`{}` (`evidence-preprocessor.js:172-182`); IDs stripped (`node-helpers.js:452-461`) | curator-agent rule only (`journalist-evidence-curator.md:32-35`) | Skill prompt-only |
| A5 | Money direction (market→players) | correct in guidance | correct (`prompt-builder.js:189-195`); `+$` sign (`input-nodes.js:317-324`) | correct (`evidence-boundaries.md:88-99`, `arc-analyzer.md:55`) | Conformant |
| C1 | Canonical names | det from current source | **det from Notion** (`node-helpers.js:966-983`) | agent fetches Notion + stale `.md` examples | Conformant (console) |
| C5 | **Pronouns from roster** | det from roster, they/them fallback | **absent** — no capture (`AwaitRoster.js`), no field (`state.js`, schema), no rule, no assignment | **absent** | **Total gap, both paths** |
| D1 | Reporter first name | per-session input + default | **det** stamp, default `'Cassandra'` (`input-nodes.js:423-428`); UI captures (`SessionStart.js:238-252`) | input captured, default Cassandra (`SKILL.md:165`) | Conformant; hardcoded default |
| D2 | Reporting mode on-site/remote | threaded into voice | **det** stamp + woven (`prompt-builder.js:794,799`); UI radio (`SessionStart.js:256-284`) | **absent from SKILL.md** | Skill cannot do remote |
| D3 | Guest reporter | optional credit | wired (`prompt-builder.js:1037-1038`, schema, header) | **absent from SKILL.md** | Skill gap |
| I1 | meta/og/title/datetime sync | templated | **det** in `article.hbs:7-14,41-48` | stale hardcoded in `assets/article.html:63` | Conformant in real renderer |
| I2 | Pull quotes render | render or don't mandate | mandated (`minPullQuotes:2` `theme-config.js:91`) but `article.hbs` **never iterates `pullQuotes[]`** | not rendered in `assets/article.html` either | **Mandated, unrendered** |
| H1 | Photo generic→named | mapping-driven | det two-stage (`photo-nodes.js`) | image-analyzer agent | Conformant |
| C3 | Roster coverage + non-roster agency | enforced | **det** `validateArcStructure` coverage+accusation gate (`arc-specialist-nodes.js:1563-1597`) | prompt rule (`anti-patterns.md:113-146`) | Conformant (console stronger) |

## Shared guidance layer — what each piece governs

**The 11 prompts** (loaded per-phase, `theme-loader.js:13-41`):
- `writing-principles.md` — temporal (states **two** timelines :5), synthesize-not-catalog, ground speculation, gap-is-story, everyone-named, no fabricated dialogue.
- `narrative-structure.md` — threads-not-people, **visual-component machinery** (§8 evidence-card loops, photo pacing, pull-quote types), arc interweaving, density. References "**80%/enrichment pattern from the detective report system**" (:48 — cross-theme).
- `section-rules.md` — 6-section question table, multi-angle vs repetition, **"Name characters who exposed evidence (celebrate sources)" (:131)**, financial shell-account calc with **+$50K bonus (:280-284)**.
- `character-voice.md` — Nova identity (`{{JOURNALIST_FIRST_NAME}}` :5), influences, dual story, **"Celebrating Her Sources… name them" (:48-51)**, remote override (:85-90), extracted-memories-not-tokens, byline format (:241).
- `evidence-boundaries.md` — three-layer model; **"CANNOT name who exposed it" (:14,30)**; money-direction-correct (:88-99); hardcoded reporter "**Cassandra**" (:166); worked **"Dec 21 Session"** example (:205-216).
- `anti-patterns.md` — voice/language/temporal/structural failures; canonical last-name table ("**Vic Kingsley**" :95-97); non-roster agency rule (:113-146); em-dash ban; **"Tori" used as a model-good example (:261)**.
- `formatting.md` — content-block JSON shapes; **example uses "Vic Chase" / `rat031` (:87,143,153)**; headline rules push thematic ("The Party That Stole Your Mind" :201-204).
- `editorial-design.md` — scroll psychology, chunking, diegetic integration.
- `photo-analysis.md` / `photo-enrichment.md` / `whiteboard-analysis.md` — image stages (generic→named; roster OCR disambiguation). Solid.

**`prompt-builder.js`** — assembles prompts; data→template→**RULES last (recency)**; injects `<TEMPLATE>` (the stale `assets/article.html`), `<FINANCIAL_SUMMARY>` (authoritative, det :180-205), `<TEMPORAL_DISCIPLINE>` (**three** timelines :475-484, 790-803 — inconsistent with prompts' two), director-enrichment block, narrative-tensions. Default reporter `'Cassandra'` (:1036,1244). `THEME_CONSTRAINTS` still bans **"guests"** (:98).

**`content-bundle.schema.json`** — `additionalProperties:false` everywhere (the #277 trigger). No pronoun representation. `byline` has author/title/location/date/guestReporter. `pullQuotes[]` verbatim/crystallization. `financialTracker` server-overridden.

**`theme-config.js`** — `bannedPatterns` (em-dash, **`token` substring case-insensitive :59**, unlock, buried-memory…), `postGenValidation: {minPullQuotes:2, minInlineEvidenceCards:3}`, `requiredVoiceMarkers`. NPCs Marcus/Nova/Blake/Valet.

**`article.hbs`** — renders header, hero, sections (content blocks), financial-tracker, sidebar evidence cards, footer. **No `pullQuotes[]` rendering.** og/title/datetime synced.

## Console path — key mechanisms (file:line)

- **Input parse** `input-nodes.js` — LLM session-report parse (`SESSION_REPORT_SCHEMA` :155-172); reporter/mode/guest stamped det (:423-428); roster = strings only (:78-82); adjustment-skip prompt (:462-470).
- **Fetch/disposition** `fetch-nodes.js` — tokens default to buried (:102-104); canonical extraction (:346); buried tagging.
- **Preprocess** `evidence-preprocessor.js` — buried seal (:172-182), disposition forced from source (:354-356), paper always exposed (:234-246). Boundary examples use **VIK001/ALR002/Victoria** (:71-82).
- **Arc analysis** `arc-specialist-nodes.js` — split opus calls; `validateArcStructure` (:1294-1649) det coverage/accusation gate; buried IDs stripped (:1196-1217). Interweaving example "**Victoria's confident smile**" (:437).
- **Director enrichment** `director-enricher.js` — opus **indexer** (verbatim-preserving, det fallback :247-250); `director-notes-renderer.js` det XML formatter (`POST_INVESTIGATION_NEWS`).
- **Contradictions** `contradiction-nodes.js` — **fully programmatic** tension surfacing (:34-83).
- **Generate/revise** `ai-nodes.js` — opus; metadata stamped (:1248-1262); schema embedded for #277.
- **Assembly** `template-assembler.js` — financial override (:376-396), bar widths (:405-426), photo path rewrite `sessionphotos/${id}/` (:236).
- **UI** `console/` — `SessionStart` captures theme/reporter/mode/guest/paths; `AwaitRoster` names-only (no pronouns); `PaperEvidence` all-selected-default→exclude; `AwaitFullContext` accusation+report+notes; `InputReview` displays parsed config; `state.js` tracks only `theme` + opaque `checkpointData`. **No retired names in UI.**

## Skill path — key mechanisms (file:line)

- `SKILL.md` — 5-phase orchestration; required inputs roster/accusation/photos/notes (:156-163); first-name default Cassandra (:165); **no reporting-mode/guest capture**; paper-evidence HARD GATE (opt-in "what was unlocked" :335-419); money math `base+$50K` (:209-213); **hardcoded 15-name retired roster (:1220-1221)**.
- `.claude/agents/journalist-*.md` — 9 agents (article-generator=opus, others sonnet; arc-analyzer=opus). evidence-curator seals buried (:32-35). validator flags em-dash/token/**guest** (:23-33), requires systemic critique in CLOSING (:58), `blake_condemned` (:116). 4 specialists (financial/behavioral/victimization/arc-analyzer) **not invoked by server** (`SKILL.md:59-63`).
- `references/schemas.md` — example data saturated with retired names + Cassandra Nova/Fremont/Dec-21-2025 byline (:652-655) + old IDs.
- `references/voice-samples.md` — in-game voice bridges using "Derek, Sarah, James" (:151).
- `scripts/fetch-*.js` — Notion fetch (Elements DB `18c2f33d-583f-8020-91bc-d84c7dd94306`); narrative-thread filter values hardcoded (`fetch-paper-evidence.js:149-152`).

## Cross-path divergences (console vs skill)

| Concern | Console | Skill |
|---|---|---|
| Reporting mode / guest reporter | wired | **absent** |
| Financial totals | det override | model formula |
| Buried sealing | det code | agent prompt |
| Canonical names | Notion (clean) | Notion fetch + **stale `.md` examples** |
| Retired-name exposure | examples/self-tests only | **pervasive (SKILL.md roster, schemas.md, agents)** |
| Paper-evidence default | opt-out (all selected) | opt-in (pick unlocked) |
| Specialists | single SDK call | 4 standalone agents (unused by server) |

## Drift from CLAUDE.md / standing notes

- `lib/director-enricher.js` + `lib/prompt-renderers/director-notes-renderer.js` exist but aren't in CLAUDE.md's key-files list (deterministic director-notes processing).
- `subagents.js` legacy `getSpecialistAgents()` + orchestrator/synthesis prompts remain **defined but unexported** (`subagents.js:1011-1014`) — dead code carrying boundary rules + retired-name examples.
- Standing memory "[[reference_aln_journalist_template_render]] pull quotes DON'T render" — **confirmed** (`article.hbs` has no `pullQuotes` loop).
- Git "stop banning guests/transactions" — **'guests' ban persists** (`prompt-builder.js:98`, validator, revision checklist).
