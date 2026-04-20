# Director Notes Enrichment — Design Spec

**Date:** 2026-04-20
**Status:** Design approved, pending plan
**Touches:** Pipeline phase 0.1 (`parseRawInput` step 3), arc/outline/article prompt assembly, `input-review` checkpoint UI

## Problem

The `parseRawInput` step-3 node (`lib/workflow/nodes/input-nodes.js:481-523`) runs Claude Haiku over the director's free-form observations and compresses them into three string arrays:

```json
{ "observations": { "behaviorPatterns": [...], "suspiciousCorrelations": [...], "notableMoments": [...] } }
```

Director notes are the pipeline's **only real-time behavioral data** — the single source of ground truth for what happened during the investigation. Memory tokens describe the party (past); paper evidence is static; buried transactions are data points without narrative; whiteboard captures player *conclusions* not player *actions*; the accusation is an end-state. The director's prose is the only input that describes the morning of the investigation as it unfolded.

Empirically, the current step performs **lossy summarization** of this uniquely load-bearing input:

- **Verbatim quotes get paraphrased away.** `"I need BOTH of your companies to succeed"`, `"so do you want to trade a little"`, `"I'll let you take the box if you give me the memory that belongs to me"` — gold-quality dialogue Nova could quote directly — becomes "Vic and Remi had a conversation about companies" etc.
- **Causal reasoning collapses.** The director's *why* behind flagging an observation ("Different fingerprints on transactions indicating multiple individuals contributing — was this account created to frame someone?") compresses into a single de-hedged bullet.
- **Temporal precision rounds off.** "Soon before a transfer to an account named after Taylor" loses its bindable-to-data quality.
- **Atmosphere/texture disappears.** "Shadowy corners", "working the room", "slide under the radar" — director-written journalistic phrasing — gets normalized out.
- **Director's epistemic hedging flattens.** "Seems suspicious", "🤔", "may have been" lose their uncertainty markers, so downstream Nova asserts where the director was tentative.
- **Post-investigation developments get lost.** Passages like "Sarah Blackwood will be taking over NeurAI leadership as interim CEO", "Morgan may have left the country", "Mel is on his way to Rome" have no slot in the three-bucket taxonomy and frequently drop out.

The cost is paid with **no downstream structural benefit**: every consumer (`prompt-builder.js:191`, `:807-814`) dumps the three arrays back into a prompt via `JSON.stringify`. The structure is pure serialization wrapper — Opus at arc/outline/article generation then has to mentally re-parse it.

## Goal

Change the step-3 node's role from **compressor** to **enricher/indexer**. Preserve the director's prose verbatim and add context-grounded structured indexes over it. The LLM earns its keep only where it adds information downstream stages can't cleanly derive alone.

## Non-goals

- Changing the director's input format or the UI they use to submit notes.
- Editorial smoothing, grammar correction, or rewriting of director prose.
- Summarization of any kind.
- In-checkpoint editing of enrichment output (rollback-to-parse covers correction needs in v1).

## Design

### Role shift (summary)

| Role | Output | Value |
|---|---|---|
| **Compressor** (current) | 3-bucket string arrays from prose | Negative — destroys information for no downstream gain |
| **Enricher/indexer** (proposed) | Raw prose preserved verbatim + 4 context-grounded indexes | Positive — adds information downstream can't cleanly derive without redoing work |

### Four high-value enrichments

All four confirmed load-bearing during brainstorming; scope ships them together.

1. **Entity resolution** against canonical roster, known NPCs, and shell-account names — so downstream references are consistent across all Opus passes (arcs, outline, article, revisions) without 3-5× redundant resolution work.
2. **Transaction cross-references** — bind fuzzy temporal observations ("Kai was seen with Blake soon before a transfer to an account named after Taylor") to concrete scoring-timeline rows (token ID, timestamp, team, amount). This is the cheapest way to add behavioral-claim grounding and feeds the existing `contradiction-nodes` detection directly.
3. **Verbatim quote bank with attribution** — first-class extraction of overheard quotes with speaker, addressee (where known), and source context. Consistency across revision passes; Nova draws from a stable pool instead of re-extracting on each pass.
4. **Post-investigation developments separated from in-investigation observations** — distinct epistemic slot so Nova writes breaking news ("It has just been announced…") differently from witnessed observations ("This morning I watched…").

### Architecture & integration

**Model swap.** `haiku` → `opus`. `disableTools: true`, `timeoutMs: 10 * 60 * 1000`, structured output via new schema. One-time early-pipeline cost; no latency pressure on user-facing flow.

**Dependency reordering.** Step 3 currently runs in parallel with steps 1 & 2 (`Promise.allSettled`). Enrichment needs the roster (step 1) and orchestrator data (step 2) in context, so step 3 must await both. New flow:

```
Step 1 (roster+accusation, Haiku) ┐
Step 2 (session report, Sonnet)   ┘──► Step 3 (director enrichment, Opus)
                                       ├─► Step 4 (whiteboard image, Sonnet) [unchanged]
                                       └─► Step 5 (synthesizePlayerFocus) [unchanged, updated consumer]
```

Steps 1 & 2 stay parallel; step 3 awaits both. Modest latency regression (step 3 no longer overlaps 1/2), dominated by Opus runtime anyway.

**Evidence-boundary safety.** Enricher receives the Detective Evidence Log (exposed content, fully reportable) and Scoring Timeline (transaction metadata only — no buried memory content), plus director prose. No buried memory content enters the enricher's context; existing boundary rules unchanged downstream.

**Migration posture.** Pre-production — no backwards-compat shim. Existing sessions have old-shape `director-notes.json`; they'll be re-parsed on next run or manually migrated. Not worth preserving old format.

### Output schema

New `DIRECTOR_NOTES_ENRICHED_SCHEMA` replaces `DIRECTOR_NOTES_SCHEMA` in `input-nodes.js`. Written to `data/{sessionId}/inputs/director-notes.json`.

```jsonc
{
  // Source of truth — verbatim. All downstream prompts read this.
  "rawProse": "<original director prose, unmodified>",

  // A. Entity-resolved character mention index.
  //    Keys = canonical roster names. Each entry points into rawProse.
  "characterMentions": {
    "Vic": [
      {
        "excerpt": "Vic had been working the room throughout the morning…",
        "proseOffset": 412,              // byte index into rawProse for future UI highlight
        "timeAnchor": "throughout morning",
        "linkedCharacters": ["Morgan"],  // co-mentioned roster members
        "kind": "behavioral_pattern"     // freeform tag — not a closed taxonomy
      }
    ]
  },

  // Special-entity flags separate from roster
  "entityNotes": {
    "npcsReferenced": ["Blake", "Marcus"],
    "shellAccountsReferenced": [
      { "account": "Marcus friend", "directorSuspicion": "possibly fake, created to frame real friends" }
    ]
  },

  // B. Transaction cross-references (from scoring timeline)
  "transactionReferences": [
    {
      "excerpt": "Kai was seen with Blake soon before a transfer to an account named after Taylor occurred",
      "proseOffset": 1204,
      "linkedTransactions": [
        { "timestamp": "09:40 PM", "tokenId": "tay004", "tokenOwner": "Taylor Chase", "sellingTeam": "Cass", "amount": "$450,000" }
      ],
      "confidence": "high",             // high | medium | low
      "linkReasoning": "Only post-09:30 Taylor-owned burial matching 'account named after Taylor'"
    }
  ],

  // C. Verbatim quote bank
  "quotes": [
    {
      "speaker": "Remi",
      "text": "so do you want to trade a little",
      "addressee": "Mel",
      "context": "shortly after a box of memory tokens was unlocked",
      "proseOffset": 890,
      "confidence": "high"              // high = verbatim with clear attribution
    }
  ],

  // D. Post-investigation developments — distinct epistemic layer
  "postInvestigationDevelopments": [
    {
      "headline": "Sarah Blackwood named interim NeurAI CEO",
      "detail": "Just been announced — taking over leadership to ensure minimal disruption",
      "subjects": ["Sarah"],
      "bearingOnNarrative": "power consolidation post-Marcus",
      "proseOffset": 2891
    }
  ],

  // Existing downstream fields preserved
  "whiteboard": { /* unchanged — from step 4 */ },
  "playerFocus": { /* unchanged — from step 5 synthesis */ },
  "savedAt": "ISO timestamp"
}
```

**No `observations.{behaviorPatterns,suspiciousCorrelations,notableMoments}` field.** Removed. Replaced by `rawProse` + the four indexes. All downstream consumers updated.

**`proseOffset` fields** are emitted by the enricher for future UI highlight/scroll-to-excerpt interactions. v1 doesn't consume them; they're cheap to emit and leaving them out would force a migration later.

### Prompt design

XML-tagged format matching the `ba3f534` pattern. Rules block placed last in user prompt for recency-bias salience.

**System prompt** (core rules):

> You enrich director notes with context-grounded indexes. You do **not** summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*.
>
> Hard rules:
> 1. `rawProse` in your output MUST equal the input prose exactly (verbatim, including punctuation and line breaks).
> 2. Character mentions use canonical names from the provided `<ROSTER>` only. Non-roster names go to `entityNotes` (`npcsReferenced` for known NPCs, otherwise leave unflagged).
> 3. `transactionReferences`: link an observation to a scoring-timeline row *only* when timestamp, actor, and amount converge. If no row matches cleanly, emit `linkedTransactions: []` with `confidence: "low"` and a `linkReasoning` explaining the ambiguity. Do **not** fabricate.
> 4. `quotes`: only extract phrases that appear in quotation marks in the prose, or unambiguous direct speech. Preserve wording exactly. `confidence: "high"` iff speaker is named adjacent to the quote.
> 5. `postInvestigationDevelopments`: only passages with explicit post-investigation temporal markers ("just been announced", "currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article's writing").
> 6. Never fabricate. Empty arrays are always valid.

**User prompt structure:**

```
<ROSTER>...</ROSTER>
<ACCUSATION>...</ACCUSATION>
<NPCS>Blake, Marcus, Nova, …</NPCS>   (from lib/theme-config.js)
<SHELL_ACCOUNTS>...</SHELL_ACCOUNTS>  (final standings table)
<DETECTIVE_EVIDENCE_LOG>...</DETECTIVE_EVIDENCE_LOG>
<SCORING_TIMELINE>...</SCORING_TIMELINE>
<DIRECTOR_NOTES_RAW>...</DIRECTOR_NOTES_RAW>
<ENRICHMENT_RULES>...</ENRICHMENT_RULES>
```

### Downstream consumer updates

| File | Current behavior | Change |
|---|---|---|
| `lib/workflow/nodes/node-helpers.js:336-380` `synthesizePlayerFocus` | Reads `observations.{behaviorPatterns,suspiciousCorrelations,notableMoments}` into `playerFocus.directorObservations` | Replace with `directorObservations: { rawProse, quotes, postInvestigationDevelopments }`. Drop the 3-bucket shape. |
| `lib/prompt-builder.js:191` (`buildArcAnalysisPrompt`) | `DIRECTOR OBSERVATIONS: ${JSON.stringify(directorNotes.observations)}` | Replace with `<DIRECTOR_NOTES>${rawProse}</DIRECTOR_NOTES>` + `<QUOTE_BANK>`, `<TRANSACTION_LINKS>`, `<POST_INVESTIGATION_NEWS>`. Character-mentions index skipped (redundant with prose). |
| `lib/prompt-builder.js:807-814` (`buildArticlePrompt` `<INVESTIGATION_OBSERVATIONS>` block) | Dumps `observations` object | Same replacement pattern; `postInvestigationDevelopments` gets its own `<POST_INVESTIGATION_NEWS>` tag so Nova treats it with distinct epistemic language ("It has just been announced…"). |
| `lib/workflow/nodes/contradiction-nodes.js` | Reads directorNotes for behavior-vs-transaction contradiction detection | Use pre-computed `transactionReferences` as first-class input. Raw prose still passed in for any contradictions not pre-linked. |
| `lib/workflow/nodes/evaluator-nodes.js` | Uses directorNotes for grounding checks | Read `rawProse` instead of 3-bucket arrays. Quote bank optionally surfaced for voice evaluation. |
| `lib/__tests__/input-nodes-schema.test.js` | Tests old `DIRECTOR_NOTES_SCHEMA` | Rewrite for new schema. |
| `console/components/checkpoints/InputReview.js` | Renders `directorNotes.observations` as flat array (currently broken — schema mismatch with object of arrays) | Rebuild per UI spec below. |

No state annotation changes in `lib/workflow/state.js` — `directorNotes` is already a `merge` reducer; the shape change is transparent.

### InputReview UI changes

The current `input-review` checkpoint (`console/components/checkpoints/InputReview.js:128-136`) renders director content as a flat `<ul>` mapping `directorNotes.observations`, but the schema today produces an object of three arrays — so the block almost never renders. This work fixes that and adds surface for the four new enrichments.

Render order, top to bottom:

1. **Session Info / Roster / Accusation / Player Focus** — unchanged.
2. **Director Notes (raw)** — new. Collapsible `<details>`, open by default on first view. Shows `rawProse` as preformatted text with a character count. Ground truth users scan to spot-check enrichment fidelity.
3. **Character Mentions** — new. Tag grid `Vic · 7` `Morgan · 5` `Sarah · 4`; click a tag to expand the per-character excerpts with `timeAnchor` and co-mentions as sub-badges. Roster members with zero mentions render as muted pills — their absence is itself a signal.
4. **Quote Bank** — new. Compact list of `<speaker>: "<quote>"` rows with confidence pill (high/low) and expandable "context" line. Low-confidence quotes render amber so attribution risk is visually obvious.
5. **Transaction Cross-References** — new. Two-column layout: left = observation excerpt, right = linked transaction row(s) (timestamp, tokenId, amount, team). `linkReasoning` under a small "Why this link?" disclosure. Most error-prone enrichment — UI emphasises visual comparison to make mis-links obvious.
6. **Post-Investigation Developments** — new. News-card strip (headline + detail + subjects as badges).
7. **Whiteboard / Entity flags** — existing whiteboard block plus a small "Entity notes" strip for NPCs and flagged shell accounts.

**No inline editing in v1.** Mis-enrichment is corrected via the existing rollback pattern (`/api/session/:id/rollback` → `input-review`) to re-run the parse. Consistent with how other checkpoints work today.

The `inputReview` checkpoint payload in `checkpoint-nodes.js` currently sends `{parsedInput, sessionConfig, directorNotes, playerFocus}`. Schema change is transparent to that wiring — `directorNotes` just has a different shape. No new state fields.

### Error handling

On Opus failure (timeout, schema validation, network), return graceful fallback:

```js
{ rawProse: rawInput.directorNotes,
  characterMentions: {},
  entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
  quotes: [],
  transactionReferences: [],
  postInvestigationDevelopments: [] }
```

Pipeline continues with raw prose intact; downstream Opus still gets the full source material, just without the indexes. Console warning logged. Matches existing step-2/step-4 pattern in `parseRawInput`.

Schema validation uses SDK's built-in retry. If invalid after retries, catch and fall back as above.

### Logging

```
[parseRawInput] Director enrichment complete: N character mentions, M quotes, K transaction links, P post-investigation items (Xs)
```

Lets users eyeball parse quality from server logs before opening the checkpoint.

### Testing

- **Unit** — mock `sdkQuery`, assert schema shape and that `rawProse === input`.
- **Unit** — verify fallback on SDK error (no throw, returns empty-indexes shape).
- **Unit** — `synthesizePlayerFocus` against new schema.
- **Unit** — `prompt-builder` snapshot tests for `buildArcAnalysisPrompt` and `buildArticlePrompt` — verify new XML tag structure.
- **Integration** — run against `data/041126/inputs/` and `data/041726/inputs/` raw inputs; eyeball that the 0411 Remi/Mel quote, the Kai→Taylor transaction link, and the Sarah-CEO post-investigation development surface correctly.
- **Regression** — existing pipeline integration tests that consume parsed director notes: update fixtures.
- **Schema test** — `lib/__tests__/input-nodes-schema.test.js` rewritten for new schema.

### Cost / latency

Opus at ~30-120s one-time for a typical 3-6K-token input. Not on any user-facing hot path. Delta vs total pipeline runtime is trivial.

## Rollout

Pre-production; ship as a single change. No feature flag, no dual-schema support.

1. Implement `DIRECTOR_NOTES_ENRICHED_SCHEMA` and new enrichment prompt in `input-nodes.js`.
2. Reorder `parseRawInput` so step 3 awaits steps 1 & 2.
3. Update consumers (`node-helpers.js`, `prompt-builder.js`, `contradiction-nodes.js`, `evaluator-nodes.js`) to read new schema.
4. Rebuild InputReview UI per Section 2.
5. Update tests; add integration test using 0411/0417 fixtures.
6. Run end-to-end against 0411 and 0417 to validate enrichment quality before merging.

## Open questions (deferred to plan)

- Exact XML tag names for the four new `<QUOTE_BANK>` / `<TRANSACTION_LINKS>` / `<POST_INVESTIGATION_NEWS>` sections in downstream prompts — snapshot tests will pin these during plan implementation.
- Whether `characterMentions` index should also be surfaced to arc-gen (currently deferred as redundant-with-prose). Plan can revisit with a side-by-side test run.
