# Prompt Design & Context Engineering Review — ALN Report Pipeline

Scope: `reports/lib/prompt-builder.js`, the 11 journalist prompt md files, `reference-loader.js`,
`theme-loader.js`, `arc-specialist-nodes.js`, `ai-nodes.js`, `evidence-preprocessor.js`,
`image-prompt-builder.js`, `theme-config.js`. Detective prompts skimmed for divergence.

Confidence legend: **[HIGH]** = directly verified in code/text; **[SPEC]** = plausible inference, not fully confirmed.

---

## TOP PRIORITY FINDINGS (cause the named failure modes)

### 1. [HIGH] No canonical ground-truth fact sheet in the article prompt → pronoun/name/number/outcome errors
**Where:** `prompt-builder.js:579-1047` (`buildArticlePrompt`), roster via `generateRosterSection` (`:22-52`).

The article generation prompt's only "canonical" block is `generateRosterSection`, which emits
`firstName → fullName` lines plus optional role/group/relationship context. It does NOT contain:
- **Pronouns** per character. Nowhere in the article prompt is a character's pronoun stated. The model
  infers gender from names/evidence → the documented pronoun errors. This is the single highest-value gap.
- **Account-owner map / "who is whom"** as a marked canonical table. The FINANCIAL_SUMMARY block
  (`:187-205`) lists account names + amounts but the roster→account correlation the model is allowed to
  *infer* (ChaseT = Taylor Chase) is left to the model, and there is no canonical statement of which
  correlations are sanctioned vs forbidden for THIS session.
- **Accusation outcome** appears only inside `<SESSION_FACTS>` as `accusation: "X and Y"` (`:890`), far
  down the prompt and as a bare string — not as a canonical "the group accused X of charge Z; outcome
  was W" record.
- **Exact figures** live in FINANCIAL_SUMMARY but are physically separated from the roster, so the model
  must join two distant blocks to answer "how much did Taylor's account get."

**Why it fails:** Best practice for factual grounding is one compact, clearly-delimited, "this is
canonical, do not infer" block containing roster + pronouns + account map + figures + outcome, placed at
high salience. The pipeline instead scatters these across `generateRosterSection`, `FINANCIAL_SUMMARY`,
`SESSION_FACTS`, `INVESTIGATION_OBSERVATIONS`, and the evidence JSON. The model is forced to infer, which
is exactly when Opus fabricates plausible-but-wrong facts.

**Fix (high value):** Build a single `<CANONICAL_FACTS>` block, emitted FIRST in the user prompt (or in
the system prompt for max salience), assembled programmatically from state. Example shape:
```
<CANONICAL_FACTS>  (AUTHORITATIVE — every fact here is verified. NEVER contradict or infer around it.)
ROSTER (name | pronouns | role):
- Taylor Chase | she/her | NeurAI investor
- Morgan Reed | they/them | lab tech
... (one line per roster PC; pronouns sourced from Notion character DB)
SHELL ACCOUNTS (account | $total | sanctioned correlation):
- ChaseT | $750,000 | MAY note "Chase" name echo (speculation only)
- Gorlan | $1,125,000 | NO sanctioned correlation — treat as unknown
ACCUSATION: The group accused Taylor Chase of murdering Marcus. Outcome: unresolved.
TOTAL BURIED: $4,110,000
</CANONICAL_FACTS>
```
Pronouns require adding a pronoun field to the Notion-derived `canonicalCharacters` map (currently only
`firstName → fullName`, see `prompt-builder.js:25-27`). This is the most impactful single change.

---

### 2. [HIGH] Example character names in prompts contradict the canonical roster and each other → trains name hallucination
**Where:** `formatting.md:87,119,135,143,153` use owner/attribution **"Vic Chase"**.
`narrative-structure.md:224` uses **"Skyler Chen"**. `anti-patterns.md:94,105,110` declare the canonical
is **"Vic Kingsley"** and explicitly flag **"Vic Chen"** as a hallucination to avoid. `evidence-boundaries.md`
examples use **"Taylor Chase"/"ChaseT"**.

So across the 8 files loaded simultaneously at article generation, the same character "Vic" appears as
"Vic Chase", "Vic Kingsley", and "Vic Chen" — and a separate "Chase" surname is attached to Taylor. The
anti-fabrication file says "the LLM defaults to common last names like Chen when uncertain; this is ALWAYS
wrong," yet the formatting examples it ships alongside literally model inventing surnames. This is
in-context contradiction: the model sees `owner: "Vic Chase"` as a worked example and pattern-matches it.

**Why it fails:** Few-shot examples are powerful. Inconsistent example names directly produce the
pronoun/character-name errors. The model has no way to know which is canonical; the real roster is
session-specific and injected separately.

**Fix:** Purge ALL surnamed character names from the prompt md files. Use placeholder tokens
(`{{CHAR_A}}`, `{{CHAR_A_FULL}}`) or obviously-fake names flagged as illustrative ("EXAMPLE ONLY — not a
real character"). At minimum make every example use first-name-only, which the anti-patterns file already
says is the safe fallback. Highest value: `formatting.md` (6 occurrences of "Vic Chase").

---

### 3. [HIGH] EXPOSED quotable text is present but not clearly delimited as "verbatim-only" spans
**Where:** `prompt-builder.js:596-615` (`arcEvidenceSection`), `:846-883` (evidence-card rules).

Quotable content IS supplied: `quotableExcerpts` (pre-extracted) and `fullContent` per evidence item.
The prompt tells the model to "use these VERBATIM" and evidence-card `content` must be "COPY EXACTLY".
That part is reasonable. **However:**
- `quotableExcerpts` are produced by a brittle regex heuristic (`ai-nodes.js:669-684`,
  `extractQuotableExcerpts`) that splits on `[.!?]` and filters 10-100 char sentences containing dialogue
  verbs / absolutes. This can emit **sentence fragments mid-quote** and miss the actual verbatim spans,
  so the model is handed low-quality "quotable" strings and falls back to `fullContent`, paraphrasing.
- There is no explicit rule stating "a `quote`/`pullQuote` `text` field MUST be a contiguous substring of
  a provided `fullContent`; if no verbatim span fits, do not emit a quote." The anti-patterns file warns
  against fabricated dialogue (`anti-patterns.md:172-184`) but the *generation instruction* never binds
  quote fields to the supplied source text. The `pullQuotes[].sourceTokenId` is "Optional" (`:972`),
  removing the only traceability hook.

**Why it fails:** Without a hard "quotes must be exact substrings of provided fullContent, else omit"
rule + a required `sourceTokenId`, the model invents quotes that read plausibly — the named "invented
quotes" failure.

**Fix:** (a) Make `sourceTokenId` REQUIRED for `type:"verbatim"` pull quotes and for `quote` blocks with
attribution. (b) Add an operational rule in `<VISUAL_COMPONENT_TYPES>`: "Every attributed quote `text`
MUST be a verbatim contiguous span copied from the cited token's `fullContent`. If you cannot find a span
that says what you need, use a `paragraph` describing the memory instead — do NOT invent a quote." (c)
Replace/augment the regex `extractQuotableExcerpts` with delimiting the actual quoted spans (text inside
double-quotes) from `fullContent`, or drop the heuristic and rely on `fullContent` with the substring
rule.

---

### 4. [HIGH] Token bloat / attention dilution: all 8 reference files + 13.7K schema + large inline rules in one prompt
**Where:** `theme-loader.js:26-35` (articleGeneration loads 8 files), `prompt-builder.js:782-1046`.

Measured sizes (chars): 8 article-phase md files = **94,478 chars** (~24K tokens). content-bundle schema
JSON = **13,749 chars** (~3.4K tokens), embedded **twice** in the article path (once in
`<SCHEMA>` at `:1043`, and the same schema also referenced in revision). On top of that the user prompt
hardcodes large inline blocks: TEMPORAL_DISCIPLINE, ARC_FLOW, VISUAL_DISTRIBUTION,
VISUAL_COMPONENT_TYPES (with a full JSON example), SESSION_FACTS, ANTI_PATTERNS (the full anti-patterns
file *again* via `labelPromptSection`), VOICE_CHECKPOINT (full character-voice + writing-principles
files), and the 10-point GENERATION_INSTRUCTION with per-field schema prose that **duplicates** the JSON
schema.

Rough estimate of the article-gen user prompt: **35K–45K tokens** before evidence/outline JSON, which
themselves can be many KB. Rules-to-data ratio is heavily rules-dominated.

Specific redundancies confirmed:
- **`evidence-boundaries` appears twice** in article gen: in the system prompt (`:594`) AND the user
  `<RULES>` block (`:783` loads section-rules/narrative-structure/formatting/editorial-design — boundaries
  is in system; but boundaries is *also* in the system prompt only here, OK) — however boundaries IS
  double-loaded across outline (`:276` and `:458`) within the same outline prompt. Verified duplication
  at `prompt-builder.js:276` and `:458` (both inside `buildOutlinePrompt` user prompt).
- **`narrative-structure` Section 8 visual table** is reproduced as inline markdown (`:831-839`) AND
  present in the loaded narrative-structure.md (`narrative-structure.md:164-171`) AND in editorial-design.md
  — three copies of the same section-appropriateness table in one prompt.
- **Anti-patterns** full file is in `<ANTI_PATTERNS>` (`:901-903`) and the same content is summarized
  again in `voice_self_check` criteria (`:1030-1034`) and in the inline `hardConstraints` (`:95-102`).
- **Schema rules** stated in prose (the 10-point STRUCTURE, `:920-1038`) then the schema JSON itself
  (`:1043`) — two encodings of the same contract.

**Why it fails:** With ~40K tokens of overlapping, partly-contradictory rules, salient instructions
(anti-fabrication, evidence boundaries, pronouns) lose attention weight; the model satisfices on style
rules it sees repeated and drops the rarely-but-critically stated factual constraints. This is consistent
with "persistent failures despite the rules being present."

**Fix:** (a) Stop double-loading `evidence-boundaries` in the outline prompt (remove one of `:276`/`:458`).
(b) Pick ONE home for the visual-component section-appropriateness table (the inline one at `:831` is
fine) and delete it from narrative-structure.md + editorial-design.md, or vice-versa. (c) Drop
`editorial-design.md` and `formatting.md` from the article phase if the inline VISUAL_* blocks already
cover them — they are largely scroll-psychology guidance that doesn't change per session and overlaps
narrative-structure. (d) Collapse the prose STRUCTURE (10-point) to a terse field checklist since the JSON
schema is authoritative. Target: cut article-gen rules by ~40%.

---

### 5. [HIGH] Style rules are vague/aspirational rather than operational → throat-clearing, redundancy, em-dashes persist
**Where:** `character-voice.md` throughout; `writing-principles.md`; `anti-patterns.md`.

Many rules are descriptive prose, not checkable constraints:
- "Sentence rhythm: Short punchy, then longer building, then short again" (voice, `:231-235`) — not
  operationalizable; the model can't self-verify.
- "Be punchy and specific" (headline, `formatting.md:197`).
- The no-em-dash rule IS stated firmly (good), and is also enforced programmatically in
  `theme-config.js:57` bannedPatterns — but only as a *validation* check that triggers a revision loop,
  not a generation-time hard gate, and the revision loop is capped at 2 (`ai-nodes.js:1369`). Em-dashes
  that survive 2 revisions ship.
- "Throat-clearing" / redundancy have NO explicit rule at all in the loaded article prompt. The
  anti-repetition rule (`section-rules.md:47-81`) addresses card-vs-prose repetition but not opening
  throat-clearing ("In this article...", "It is worth noting that...").

**Why it fails:** Vague aesthetic guidance ("punchy") doesn't constrain generation; the named style
failures are precisely the ones with no operational rule.

**Fix:** Convert to checkable constraints: "Do not open any paragraph with: 'It is worth noting',
'In this article', 'As we will see', 'Importantly'." Add a banned-opener list to `theme-config.js`
bannedPatterns so it's caught programmatically. Keep the em-dash programmatic gate but ALSO strip
em-dashes deterministically in `validateContentBundle` (it already sanitizes empty paragraphs,
`ai-nodes.js:1283-1297` — add em-dash → comma/period replacement there as a non-AI guarantee).

---

## SECONDARY FINDINGS

### 6. [HIGH] Recency ordering holds in code, but the most critical rules are NOT last
**Where:** `prompt-builder.js:735-1047`.

The DATA→TEMPLATE→RULES recency claim is only partly true. Actual order of the journalist user prompt is:
DATA_CONTEXT → TEMPLATE → RULES (section-rules, narrative-structure, formatting, editorial-design, roster,
TEMPORAL_DISCIPLINE) → ARC_FLOW → VISUAL_DISTRIBUTION → VISUAL_COMPONENT_TYPES → SESSION_FACTS →
ANTI_PATTERNS → VOICE_CHECKPOINT → GENERATION_INSTRUCTION (+ SCHEMA last).

So the literal **last** thing the model sees is the schema and output-format plumbing — NOT the
anti-fabrication, evidence-boundary, or canonical-facts rules. Evidence boundaries sits only in the SYSTEM
prompt; SESSION_FACTS (roster guardrail) is buried in the middle. Per recency best practice, the
highest-stakes factual constraints should be in the final pre-generation block.

**Fix:** Move a compact "FINAL CHECKS before you write" block to the very end (after SCHEMA): re-state the
3 hard factual rules (use only canonical names+pronouns from CANONICAL_FACTS; never infer buried
ownership/content; every quote is a verbatim span with sourceTokenId). 6-8 lines, highest recency.

### 7. [HIGH] Evidence-boundary rules are well-written but split across system/user inconsistently
**Where:** system prompt `:594` (evidence-boundaries full file); user prompt relies on it via
cross-reference (`section-rules.md:543` "See <evidence-boundaries>"). Arc phase re-states a *condensed*
version inline (`arc-specialist-nodes.js:310-329`) and `reference-loader.js:82-105` has yet another
`getEvidenceBoundariesSummary()`.

There are **three** different encodings of the three-layer model: full md file, the arc-node inline
SECTION 4, and the reference-loader compact summary. They mostly agree but the arc-node version omits the
"money flows TO the burier, not FROM" correction (`evidence-boundaries.md:88-99`) — the exact rule that
prevents the documented financial-direction errors. So arc analysis can plant a reversed-money-direction
framing that the article inherits.

**Fix:** Add the money-direction rule to the arc-node Layer 2 block (`arc-specialist-nodes.js:316-318`).
Long-term: single source — load the md file in the arc phase too rather than maintaining a hand-written
condensation.

### 8. [HIGH] FINANCIAL_SUMMARY semantics are correct but fragile; "buried" wording risks reversal
**Where:** `prompt-builder.js:187-205`.

The block correctly states money flows TO account holders and that totals = what holders RECEIVED. Good.
But it also says "The total ($X) is the combined VALUE of secrets Blake acquired" and "Total buried: $X" —
mixing "received by account" and "buried value" framings in adjacent lines. The article must keep these
straight while the financialTracker `description` field is required to be the **account name** (`:991`),
not prose. This is well-specified. Risk is moderate, mainly that the dual framing invites the
reversed-direction error the boundaries file warns about. Low-effort fix: drop the "combined VALUE of
secrets Blake acquired" sentence; keep only the received-by-account framing.

### 9. [HIGH] Schema-in-prompt workaround placement is sane; bleed risk is real but mitigated
**Where:** `prompt-builder.js:1040-1046` (article), `:725-731` (detective), `ai-nodes.js:1554-1560`
(revision local builder per CLAUDE.md note).

Placement is correct (immediately before `</GENERATION_INSTRUCTION>`, max recency) and the "if anything
contradicts the schema, the schema wins" framing is good. The schema is embedded as a fenced ```json
block, which is the right delimiter. **Bleed risk:** the prompt also contains a worked JSON *example*
(`:864-873`, the evidence-card example with real-ish text "Victoria's composure finally cracking") — that
example uses a non-canonical character ("Victoria"/"Jamie Woods") and could be copied verbatim into the
article. Lower priority than #2 but same class of problem. Also the schema is embedded twice on the
revision path (full bundle) which compounds bloat (#4).

**Fix:** Mark the evidence-card example explicitly as `"content": "[EXAMPLE — replace with real verbatim
text from arcEvidencePackages]"` rather than shipping plausible prose, and use a placeholder owner.

### 10. [SPEC] Revision prompts re-send full prior output + full schema; regression risk is bounded but real
**Where:** `ai-nodes.js:1402-1491` (`reviseContentBundle`), `:1529-1560` (`buildArticleRevisionPrompt`),
`node-helpers.js:825-909` (`buildRevisionContext`).

The revision prompt DOES re-send the full previous contentBundle + a context section that lists
"working well (PRESERVE)" vs "needs improvement," plus the system prompt instructs targeted/surgical
fixes. This is good design against whack-a-mole. **However:**
- The revision user prompt does NOT re-send the evidence packages, roster, FINANCIAL_SUMMARY, or
  evidence-boundaries — only the prior bundle + feedback + schema (`buildArticleRevisionPrompt` is minimal).
  So if a fix requires re-grounding (e.g., correcting a fabricated quote), the model has no source text to
  pull the correct verbatim span from → it will "fix" by inventing a different plausible quote. **This is a
  real regression vector for the fabrication/quote failures specifically.**
- "Preserve ≥80% criteria" relies on `criteriaScores` being numeric; `validateArticle` (`:1346-1364`)
  returns `issues`/`passed` but the schema there has no `criteriaScores`, so `workingWell` is usually
  empty and the model gets "Focus on the issues identified below" with no preservation guidance →
  higher regression risk than the design intends.

**Fix:** On the article revision path, re-include the CANONICAL_FACTS block and the arcEvidencePackages
`fullContent` for any token referenced by a flagged quote/card, so corrections can be re-grounded. And
ensure `validateArticle` emits per-criterion scores so the preserve-list actually populates.

### 11. [HIGH] Preprocessing does NOT destroy quotable detail/provenance (good) — but the 150-char summary can mislead downstream
**Where:** `evidence-preprocessor.js:172-182` (`exposedContentFields`), `:99-130` (schema),
`:350-371` (merge).

Verified: for exposed/non-buried items, `fullContent` is extracted directly from `rawData`
(`fullDescription → content → description → text → name → title`) independent of Haiku's 150-char
`summary`. So verbatim content and owner provenance survive preprocessing intact. Buried items correctly
get neither rawData nor fullContent. This is correctly implemented and is NOT a fabrication source.

Residual risk **[SPEC]**: Haiku writes the `summary` (≤150 chars) and `characterRefs`. If Haiku
paraphrases a name or mis-attributes a characterRef, that paraphrase flows into arc analysis and outline
(which use `summary`), and only the article phase pulls `fullContent`. So a mis-summarized name can seed a
wrong name in arcs/outline that the article then echoes. Low-to-moderate; mitigated by canonical roster if
#1 is implemented.

### 12. [SPEC] Model choice is reasonable but article validation uses Opus to grade Opus
**Where:** `ai-nodes.js`: preprocess=haiku (`evidence-preprocessor.js:343`), paper scoring=sonnet
(`:208`), arcs/outline/article/revision/validation=**opus** (`:936,1024,1213,1446,1349`).

Using Opus for both generation AND validation of the same output (`validateArticle` model:'opus') means
the validator shares the generator's blind spots — it won't catch fabrications that "look right" to the
same model family. The validation is also LLM-based for things that should be deterministic (em-dash,
token-term, roster coverage) which `theme-config.js` already encodes as regex bannedPatterns.

**Fix:** Make `validateArticle` do the deterministic checks programmatically (reuse
`theme-config.articleRules.bannedPatterns`) and reserve the LLM pass for genuinely semantic checks. Cheap,
removes a whole class of "validator missed the em-dash" outcomes.

### 13. [HIGH] No few-shot of a *correct* full mini-article; only fragment do/don't pairs
**Where:** all prompt files.

The prompts are rich in WRONG/RIGHT fragment pairs (good for local style) but there is no single
end-to-end exemplar showing a correct paragraph→card→pull-quote→financial-tracker flow grounded in a tiny
fake evidence set with canonical handling. The model assembles global structure with no global exemplar.

**Fix:** Add ONE compact gold exemplar (≈150 words + 1 card + 1 verbatim quote with sourceTokenId + 1
crystallization) using clearly-fake placeholder names, demonstrating: verbatim quoting, pronoun
consistency, no em-dash, evidence-boundary-safe money phrasing. Place near GENERATION_INSTRUCTION. Net
token cost is small relative to the dilution savings from #4.

### 14. [SPEC] Output-length controls are advisory only
**Where:** `formatting.md:178-189`, `prompt-builder.js:918`, `theme-config.js:38-45` (wordBudgets).

Word budgets exist as advisory prose and as `outlineRules.wordBudgets`, but nothing in the article
generation prompt enforces total length; the model regularly needs manual trimming. The 1000-1500 figure
is stated 2x (consistent). Minor: consider a post-gen word-count check that routes to a "tighten" revision
rather than relying on the same capped voice-revision loop.

### 15. [MINOR] Eleven-file count includes 3 image-only files diluting "article" mental model
`whiteboard-analysis.md`, `photo-analysis.md`, `photo-enrichment.md` are image-phase only
(`theme-loader.js:14-18`) and are never loaded for article gen — correctly scoped. No action; noted so the
"8 files per article phase" vs "11 files" distinction is clear: article phase = 8, image phase = 3,
overlap = 0 of the image set.

---

## QUICK WINS (low effort, high leverage)
1. Purge "Vic Chase"/"Skyler Chen"/"Vic Chen" surnamed examples from md files → first-name or `{{CHAR}}` (#2).
2. Add pronouns to `canonicalCharacters` and emit a `<CANONICAL_FACTS>` block first (#1).
3. Remove duplicate `evidence-boundaries` load in outline prompt (`prompt-builder.js:276` vs `:458`) (#4).
4. Make `sourceTokenId` required for verbatim quotes + add "quotes must be verbatim substrings" rule (#3).
5. Move a 6-line "FINAL FACTUAL CHECKS" block after `<SCHEMA>` for recency (#6).
6. Make `validateArticle` em-dash/token/roster checks programmatic via existing bannedPatterns (#5, #12).
