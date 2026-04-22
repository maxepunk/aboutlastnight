# ALN Pipeline Optimization Findings — 2026-04-20

Synthesis of what makes manually-edited reports strong, what the pipeline systematically fails at, and where in the pipeline to intervene. Based on review of 5 final edited reports (032826, 040326, 040426, 041126, 041726), 5 sets of refinement artifacts (040426, 041026, 041226, 041726, 041826), and the current pipeline code.

## 1. What makes the edited reports strong

Every strong final follows the **same load-bearing template** with minor variation. The humans aren't inventing structure — they're correcting, reframing, and enriching within a fixed skeleton:

- **Hero + deck** that states the counter-thesis (the room voted X, this article says Y)
- **Unheaded lede** — "Marcus Blackwood is dead." verbatim in 4 of 5
- **The Story** — chronological with time-stamped beats (9:18 PM → 10:10 PM → 11:22 PM → 12:50 AM → 1:08 AM → 1:36 AM → 1:50 AM recur), inline evidence cards every 2–4 paragraphs
- **Follow the Money** — shell-account forensics, named amounts, interpretive reads
- **The Players** — one paragraph per roster character as moral disposition
- **What's Missing** — surfaces holes as evidence
- **Unheaded closing** — rhetorical crescendo ending in a ≤15-word aphoristic tail

### Signature voice hallmarks (what Nova actually does when she's strong)
1. **Short-clause moral triplets** resolving to a one-word sentence
2. **Concrete + interpretation pairs** with parallel anaphora (Sarah did X. Sarah said Y. Sarah also…)
3. **Cold-observer report-outs** — "Ten people came to me directly. Every one of Vic Kingsley's memories is absent. All four — sealed."
4. **Rhetorical inversions** — "The only person who brought her own worst moments was the one the group accused."
5. **Uncertainty as shape, not content** — *"I can tell you the shape of the silence. I cannot tell you what is inside it."* (appears in all 5; humans rotate the phrasing to avoid repetition)
6. **Director observations as eyewitness sight-verbs** — *"I watched Quinn work the floor this morning, stopping Alex mid-room to ask 'you got anything to trade.'"* — verbatim quotes from director notes woven into reportage
7. **Aphoristic closing** — *"They accused Morgan Reed. The investor is not running. He does not need to."*

### What humans consistently ADD to drafts (the highest-value finding)

1. A controlling editorial thesis that counter-argues the room's verdict (pipeline gives "what happened", humans add "why this article disagrees")
2. Verbatim director-note quotes as eyewitness reportage (pipeline paraphrases these away)
3. Concrete specifics replacing abstractions ("power dynamics of the old order" → "Marcus's inner circle was collapsing in real time, and the people inside it were still turning to each other for cash")
4. Character-specific epigrammatic verdicts (pipeline produces descriptions, humans produce epigrams)
5. Paper-evidence-as-named-source citations (pipeline underweights paper evidence vs. tokens)
6. The aphoristic closing tail
7. "What's Missing" as a named editorial act
8. Caption-as-interpretation rather than caption-as-identification
9. Sensory specificity from director notes (hushed conversations, heads nodded, heavy negotiations)

### What humans consistently REMOVE
1. Repetitive hedges ("I can/can't tell you" repeated 3× → collapsed to 1 anchor + varied phrasings)
2. Parroted card setups that retell evidence before and after the card
3. Abstract systemic language ("power dynamics of the old order", "the system does not just produce…")
4. Fabricated specifics (wrong numbers, fabricated group memberships, invented spatial continuity)
5. Boundary-violating interpretations of buried content
6. Captions that spoil downstream reveals
7. Remote-framing violations (Nova "watching" when she's remote and Ashe is in-room)
8. Redundant observations duplicated across sections

## 2. What the pipeline systematically gets wrong

**Twelve persistent error classes**, ranked by frequency across the 5 refined sessions (all are 3/5+ recurrence — nothing is a one-off):

| # | Error class | Frequency | Origin phase |
|---|-------------|-----------|--------------|
| 1 | Pronoun misgendering (Alex, Morgan, Vic, Ashe, Quinn, Cass, Jamie, Remi, Riley, Mel) | 5/5 | Article |
| 2 | Character misID / group misID / wrong evidence attribution | 5/5 | Arc / Article |
| 3 | Evidence boundary violations (token→account decoding, buried-content inference) | 5/5 | Arc / Article |
| 4 | Missing narrative tensions (memory-erasure pattern, paternity test, director observations not surfaced) | 5/5 | Arc / Input |
| 5 | Throat-clearing scaffolding ("Now the picture assembles", "This is where every thread collides") | 5/5 | Article |
| 6 | Temporal conflation (party events → investigation-morning narration) | 4/5 | Article |
| 7 | Unsourced or wrong numerical claims ("billion-dollar", wrong memory counts, wrong rankings) | 4/5 | Preprocessing / Article |
| 8 | Overclaim on inference edges ("neurotoxin", "sustained operation", "blackmailed back") | 4/5 | Article |
| 9 | Roster coverage gaps (named without storyline; 1/17 fully missing in 041826) | 4/5 | Outline / Article |
| 10 | Dual-location internal inconsistency (sidebar ≠ body; "nine minutes" vs "twenty minutes" same article) | 3/5 | Assembly |
| 11 | Photo under-use (7/10 unused in 041726) | 3/5 | Outline |
| 12 | Paper evidence not cited as in-prose source | 3/5 | Article |

**Three standout examples worth quoting:**

- *041826:* Jess Kane — Marcus's pregnant mistress, load-bearing character in a murder investigation with a paternity test in paper evidence — **entirely missing from the article body**. 1 of 17 players completely absent.
- *040426:* Pipeline teleported Marcus five miles in three minutes by fabricating "in another part of the house" to bridge sarah's HOME-mailbox memory with Remi's WAREHOUSE observation.
- *041026:* Same Follow-the-Money section declares the boundary rule ("I cannot tell you whose memories went where") then violates it two paragraphs later ("Bob made sure of part of it. Unicorn's pace looks like cleanup.").

**Edit magnitude signal:** Across the 5 refined sessions, edits roughly split as 40–45% mechanical copy-edit, 30–35% fact corrections, 15–20% paragraph-level re-conception, 5–10% whole-section rewrites or additions. Translation: **the pipeline's structural bones are good; source-fidelity and editorial interpretation are the systemic failures.**

## 3. Where in the current pipeline to intervene

### Prompt architecture drift
- Arc-generation prompt uses markdown section headers while outline/article prompts use XML tags — the upstream fulcrum is the *least* structured.
- Temporal rules live in Section 4.5 of the arc prompt, *after* ~20KB of evidence JSON. Model ingests the evidence before learning how to frame it.
- Evidence items render as `kai042: "..."` without inline temporal context. The `temporalContext` field exists on every item but isn't surfaced in the rendered prompt.
- Temporal rule duplicated across 3–5 files (system prompt, `<TEMPORAL_DISCIPLINE>` block, narrative-structure.md, anti-patterns.md, writing-principles.md) — updates require coordinated edits.

### Evaluator reality
Evaluators are prose/structure reviewers, **not fact-checkers** (deliberate scope-narrowing after aggressive revisions per Commit 8.22). They do not catch:
- Temporal conflation in prose
- Character group misID (no cross-check against `characterData.groups`)
- Buried-content inference in `analysisNotes` or article prose
- Whether the article actually used surfaced narrative tensions

### Contradiction + character-data wiring
- `surfaceContradictions` uses a narrow keyword list ("submit", "expos", "public", "boldly", "transparent") — misses "openly", "willingly", "eagerly", "without hesitation".
- Named-account matching is literal — won't catch pseudonyms like "ChaseT" for Taylor Chase even though this exact pattern is documented in `evidence-boundaries.md:65-67`.
- `characterData` reaches arc and article prompts but **not outline prompt** — the outline inherits arc-layer errors without independent access to ground truth.
- Neither signal is verified by any evaluator — generated-and-maybe-ignored.

### Arc analysisNotes as unchecked claims channel
Arc `analysisNotes.financial/.behavioral/.victimization` are free-form strings that downstream prompts treat as authoritative subtext. `buildInterweavingPrompt` receives no evidence at all — it can invent "callback seeds" and "bridge opportunities". These become outline structure and article prose. **Zero factual check** between arc production and article generation.

### Checkpoint signal assessment
- **High signal** — paper-evidence-selection, await-roster, character-ids, await-full-context, arc-selection
- **Medium signal** — input-review, evidence-and-photos, outline
- **Low signal** — pre-curation (human asked to review ~100 Haiku summaries), article (mostly accept-or-reject-whole)

## 4. Ranked optimization recommendations

All recommendations improve **generation quality upstream** or **add programmatic post-generation checks** — none are "more evaluator revision loops".

### Do-first bundle (highest impact/effort)

**#1 — Per-evidence-item temporal prefix in generation prompts** *(effort: S, impact: high)*
Render each evidence item with inline context: `[PARTY-MEMORY jav042, owner: Jamie]: "..."` and `[INVESTIGATION-TRANSACTION 09:40PM]: $450K → ChaseT` and `[BACKGROUND-DOCUMENT]: ...`. The `temporalContext` field already exists; it's just not in the rendered prompt. Fixes #1 source of temporal conflation.
*Files:* `lib/workflow/nodes/arc-specialist-nodes.js` (buildCoreArcPrompt, extractEvidenceSummary), `lib/prompt-builder.js` (arcEvidenceSection, buildArticlePrompt).

**#2 — Ship the director-notes-enrichment design** *(effort: M–L, impact: very high)*
Already specced at `docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md` and planned. Current `parseRawInput` step-3 lossily compresses director notes into three JSON buckets that consumers `JSON.stringify` back — net-negative transformation. Enrichment produces `rawProse` (verbatim) + 4 indexes. Fixes quote fabrication, binds "Kai seen with Blake before Taylor transfer" to concrete transactions, gives post-investigation news its own epistemic slot. **Directly addresses error classes 3, 4, 6, 7, and most of the "humans ADD verbatim director quotes" gap.**

**#3 — Factual post-arc validator (programmatic, no LLM)** *(effort: M, impact: high)*
New `validateArcFactuality` node between `validateArcs` and `evaluateArcs`. Checks:
- `analysisNotes.financial` doesn't contain content-inference keywords ("memory about", "knew that", "hid evidence of", "was there when")
- Every `characterPlacements` name not in roster/NPC appears in at least one evidence `characterRefs`
- Group claims match `state.characterData.characters[name].groups`
- `keyEvidence` with `temporalContext === 'PARTY'` doesn't appear in analysisNotes with investigation-era verbs ("watched", "saw")

On failure, short-circuit to revision with specific issues (same pattern as Commit 8.27 `validateArcStructure`). Catches arc-level versions of error classes 2, 3, 6 before they propagate.

**#4 — Post-article fact-checker node (pre-assembly, human-facing)** *(effort: M, impact: very high)*
New `factCheckContentBundle` node after `validateContentBundle`. Programmatic checks:
- Every `type === 'verbatim'` pull quote must appear as substring in some evidence `fullContent`
- Every paragraph containing "I watched", "I saw", "standing there" flagged if referencing party-only evidence
- Every character name not in `canonicalCharacters` flagged (catches "Vic Chen" → "Vic Kingsley" errors directly)
- Group claims ("Stanford Four", "Ezra's mentees") matched against `characterData.groups`
- Pronoun usage cross-referenced with a per-character pronoun map from paper evidence / character sheets

Output surfaced **at the article checkpoint** as a defect inventory — not a revision loop. Human decides what to fix; gets a targeted punch list instead of blank-slate fact-check.

### Second wave

**#5 — Inject `characterData` and `narrativeTensions` into outline prompt** *(effort: S)*
Mirror the article prompt. Outline currently inherits arc-layer errors without independent ground truth.

**#6 — Strengthen `surfaceContradictions`** *(effort: S–M)*
Expand keyword list ("openly", "willingly", "eagerly", "without hesitation", "brought forward"). Add a Haiku call that maps shell-account pseudonyms to roster candidates (e.g., "ChaseT" → Taylor Chase) and feeds them to named-account matching.

**#7 — Canonicalize arc character placements automatically** *(effort: S)*
In `validateArcStructure`, rewrite `characterPlacements` keys to canonical full names using `state.canonicalCharacters`. Warn on any unresolvable key.

**#8 — Mark `analysisNotes` as advisory, require evidence-ID citations** *(effort: M)*
Change schema to `analysisNotes.financial: { summary: "...", evidenceIds: [...] }`. Makes claims auditable downstream.

### Third wave

**#9 — Pre-arc-selection AI sanity report** *(effort: M)*
Cheap Haiku pass producing `arcQualityReport` surfaced on the arc checkpoint: "Arc 2 references Marcus as 'mentor' but characterData has no such relationship." Shifts defect-hunting from human to AI; human keeps directional authority.

**#10 — Split `anti-patterns.md` into blocking vs. voice** *(effort: S–M)*
Regex-catchable rules (em-dashes, hallucination name table, game mechanics vocabulary) → programmatic enforcement in #4. Voice/tone judgments stay in-prompt.

**#11 — Deduplicate temporal + evidence-boundary rules** *(effort: M)*
Single canonical source per rule family; delete inline duplicates. Reduces drift risk.

**#12 — Temporal-context tag on preprocessed evidence summaries** *(effort: S)*
Prefix each Haiku-summarized evidence item with `[PARTY-NIGHT]` / `[INVESTIGATION]` / `[BACKGROUND]`. Reinforces temporal clarity at the summary layer.

### Not recommended
- More evaluator revision loops. The evaluators are already scope-narrowed deliberately. Piling retry cycles on fact-checking failures adds cost without catching the errors.
- A "voice" evaluator that tries to score epigram quality or aphoristic closings. These are high-variance human moves. Better addressed by cleaner upstream material (recommendations #1–#4) that lets the article generator produce stronger raw prose.

## 5. Strategic read

The pipeline's structural output is **close to the final template** — humans don't rebuild scaffolds, they correct within them. The gap between raw pipeline and final is:

1. **Source fidelity** (pronouns, groups, numbers, evidence attribution, temporal framing) — fixable upstream by inlining the structured data the pipeline already has (#1, #3) and by a programmatic post-check (#4).
2. **Director-note density** — fixable by the enrichment already designed (#2). Verbatim quotes and sensory specifics that humans restore are in the source; they're being compressed away.
3. **Editorial counter-thesis** — the hardest to automate. Humans writing the deck+closing reframe the room's verdict. The pipeline can be prompted toward this (e.g., "the deck should name the counter-argument to the room's vote, not summarize it") but the quality will remain human-bounded for now.

The do-first bundle (#1–#4) targets items 1 and 2. Item 3 is probably best left as human work — it's what the refinement skill exists for.

## References

- Refinement artifacts analyzed: `outputs/041026-refine/`, `outputs/041226-refine/`, `outputs/041826-refine/`, `outputs/report-041726-*.md`, `outputs/report-040426-*.md`
- Final reports reviewed: `outputs/report-032826.html`, `report-040326.html`, `report-040426.html`, `report-041126.html`, `report-041726.html`
- Prior design specs: `docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md`
- Pipeline code entry points cited in recommendations: `lib/workflow/nodes/arc-specialist-nodes.js`, `lib/prompt-builder.js`, `lib/workflow/nodes/ai-nodes.js`, `lib/workflow/nodes/evaluator-nodes.js`, `lib/workflow/nodes/contradiction-nodes.js`, `lib/workflow/nodes/character-data-nodes.js`
