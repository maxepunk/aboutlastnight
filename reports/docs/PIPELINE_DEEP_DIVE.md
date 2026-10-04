# ALN Director Console: Pipeline Deep Dive

This document provides a comprehensive understanding of the post-game report generation system for "About Last Night." Use this as a reference when debugging, extending, or understanding the pipeline.

## Table of Contents

1. [Business Context](#business-context)
2. [Character Roster](#character-roster)
3. [The Game Loop](#the-game-loop)
4. [The Report's Purpose](#the-reports-purpose)
5. [Three-Layer Evidence Model](#three-layer-evidence-model)
6. [Data Flow Architecture](#data-flow-architecture)
7. [Phase-by-Phase Breakdown](#phase-by-phase-breakdown)
8. [Prompt Construction Patterns](#prompt-construction-patterns)
9. [Evaluation & Revision Architecture](#evaluation--revision-architecture)
10. [Key Implementation Details](#key-implementation-details)
11. [Common Debugging Scenarios](#common-debugging-scenarios)

---

## Business Context

**"About Last Night"** is an immersive crime thriller LARP/escape room experience where:

- Players are characters who wake up at a party with no memory of the previous night
- Marcus Blackwood (the host) is dead
- Players must investigate what happened using discovered memories and evidence
- At the end, players must collectively decide on a story to tell authorities

**The Report** is a post-game gift delivered via the pipeline's theme system:

- **Journalist theme** (`state.theme = 'journalist'`): Nova, the NovaNews reporter (who Nova is: `world.md`), writes an investigative article in the first person, about 1,500 words (`craft-voice.md`, `craft-telling.md`), with NovaNews branding.
- **Detective theme** (`state.theme = 'detective'`): Detective Anondono files an official case report (~750 words, third-person investigative voice, single-column case file format).

Both themes share one 44-node LangGraph pipeline with 11 checkpoints, and since phase 4 the detective is parked (R1): it starts no session until it has its own files for the story meeting, the map and the article. What a theme decides lives in its files: `theme-config.js` (its NPCs, map slots, rules folder and identity lines), `rule-set.js` (each theme's rule set, read from the folder its config names; the journalist's: see [Prompt Reference Files](#prompt-reference-files)), `theme-loader.js` (the image calls' prompt files from `.claude/skills/{theme}-report/`), and `templates/{theme}/` (Handlebars layouts). `reports/CLAUDE.md`, "Adding a new theme", lists them.

---

## Character Roster

### The 20 Player Characters

Each session has a subset of these characters (typically 8-16 players). Token ID prefixes map to characters.

| Character | Token Prefix | Notes |
|-----------|--------------|-------|
| Sarah Blackwood | sab | Marcus's wife |
| Alex Reeves | alr | |
| James Whitman | jaw | |
| Victoria Kingsley | vik | |
| Derek Thorne | det | |
| Ashe Motoko | asm | |
| Diana Nilsson | din | |
| Jessicah Kane | jek | |
| Morgan Reed | mor | |
| Flip | fli | No known last name |
| Taylor Chase | tac | |
| Leila Bishara | leb | |
| Rachel Torres | rat | |
| Howie Sullivan | hos | |
| Kai Andersen | kaa | |
| Jamie "Volt" Woods | jav | |
| Sofia Francisco | sof | |
| Oliver Sterling | ols | |
| Skyler Iyer | ski | |
| Tori Zhang | toz | |

### The 3 NPCs

| NPC | Token Prefix | Role |
|-----|--------------|------|
| **Marcus Blackwood** | mab | The man whose death the room investigates (T15). Host of the party. Founder of NeurAI. |
| **[Firstname] Nova** | — | The NovaNews reporter who writes the article (`world.md`). Players turn memories in to Nova to EXPOSE them. First name is configurable per session (often "Cassandra"). |
| **Blake / Valet** | — | Manages operations at NeurAI; Marcus called Blake his Valet (T15). Works the room, making the deals that BURY memories (`world.md`; the money and the buyer: T5). |

### Character Sheets

Character sheets are part of the paper evidence in Notion. They contain:
- The character's **starting memories** (what they "remember" at game start)
- Basic character context before investigation begins
- Relationships and backstory hints

These starting memories give players a foundation before they discover additional memory tokens and paper evidence during gameplay.

---

## The Game Loop

How the game runs, as the writers and judges read it, is `world.md` ("The game" and "What each memory became"). This section is an orientation.

### 1. Individual Discovery
Each player discovers their character's memories (tokens) and finds paper evidence (props, documents, texts).

### 2. The Choice Point
For each memory token, players choose:
- **EXPOSE**: Turn memory over to Nova (the journalist) - makes it public, everyone can see it
- **BURY**: Sell a memory to Blake or the Valet to be erased; the payment goes to an account the seller names, and the ledger shows the sale, never the memory (see `world.md`)

### 3. Collective Negotiation
Players discuss, share (or withhold), and negotiate based on what they've individually discovered. Social dynamics emerge:
- Who's sharing information?
- Who's hiding things?
- What alliances form?

### 4. The Accusation
Players must agree on a collective story to give authorities. This is shaped by:
- What's been publicly exposed
- What paper evidence was unlocked
- Conversations and negotiations during the game
- Social pressure and group dynamics

---

## The Report's Purpose

Nova's article is NOT just a factual record. It reflects:

| Aspect | What It Captures |
|--------|-----------------|
| **Player Agency** | What they chose to expose vs bury |
| **Collective Story** | The accusation they agreed upon |
| **Tensions** | Gap between accusation and actual evidence |
| **Unanswered Questions** | What remains mysterious |
| **Social Dynamics** | Observed patterns (who talked to whom, who avoided whom) |

**The article celebrates their gameplay experience** - including the messy negotiations, the things left unsaid, and the collective story they constructed together. The purpose as the writers read it opens `world.md`.

---

## Three-Layer Evidence Model

What the article can do with each layer is the rule set's, stated once: `world.md` ("What each memory became", "The record and the timeline") and `truth-rules.md`. Each layer below says what the game left and where its rules live.

### Layer 1: EXPOSED (Full Reportability)

**Game Reality**: Player scanned token → chose "EXPOSE" → the memory's summary went up on the Evidence Board, Nova has the full memory, and the evidence log has its time and the name on the turn-in.

**Rules**: `world.md` ("Exposed"); in `truth-rules.md`, T1 (evidence decides how a claim is written), T6 (exposers are anonymous unless named) and T12 (words are exact); cards are C9 in `craft-cards.md`.

### Layer 2: BURIED (Observable Patterns Only)

**Game Reality**: Player scanned token → chose "BURY" → the memory was sold to be erased. Nova's ledger has the sale's time, amount and account, never which memory, and the record view prints a buried memory only as that sale on the morning timeline (`lib/prompt-renderers/record-view.js`).

**Rules**: `world.md` ("Buried", the ledger, an account); in `truth-rules.md`, T3 (buried memories never appear as evidence), T4 (an account is the seller's chosen destination and name), T5 (the buyer pays the seller) and T7 (the stages and the clock).

### Layer 3: CONTEXT (Director Notes = the Director's Observations)

**Game Reality**: The director watched the session and writes it into the notes: the room's scenes and lines, the deliberation, often the director's own read of the session, and the epilogue. The players' whiteboard and the director's accusation text come in beside the notes.

**Rules**: in `truth-rules.md`, T1 (evidence decides how a claim is written), T2 (the verdict is the group's negotiated official story), T7 (the stages and the clock) and T13 (photos and the whiteboard); the director's lines are C8 in `craft-material.md`, weighed by the arc writer and chosen by the map. What Nova could witness is the session's reporting mode block (`mode-on-site.md` or `mode-remote.md`, through `buildReportingModeBlock` in `lib/prompt-builder.js`).

---

## Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RAW DATA SOURCES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐          │
│  │  NOTION DATABASE │  │  SESSION PHOTOS  │  │  DIRECTOR INPUT  │          │
│  │  • Memory Tokens │  │  • Player moments│  │  • Roster        │          │
│  │  • Paper Evidence│  │  • Evidence shots│  │  • Accusation    │          │
│  └────────┬─────────┘  └────────┬─────────┘  │  • Observations  │          │
│           │                     │            │  • Whiteboard    │          │
│           │                     │            └────────┬─────────┘          │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 0-1: DATA ACQUISITION & PARSING                          │
│  fetchMemoryTokens() → tag disposition (exposed/buried/unknown)             │
│  fetchPaperEvidence() → narrativeThreads, owners, descriptions              │
│  (photos are NOT fetched here - see PHASE 2.36)                             │
│  parseDirectorNotes() → playerFocus, whiteboard, accusation                 │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 1.8: EVIDENCE CURATION (Hybrid Approach)                 │
│  Step 1: Programmatic token routing (instant)                               │
│  Step 2: Batched Sonnet paper scoring (8 items/batch × 8 concurrent)        │
│  Step 3: Programmatic report assembly                                       │
│  OUTPUT: evidenceBundle { exposed, buried, curationReport }                 │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 2: THE WEAVE AND THE STORY MEETING (Opus)                │
│  One call writes the weave: the story, the threads in their roles,          │
│  the connections, the convergence and the questions                         │
│  Code checks it; one fact check scores the truth rules                      │
│  OUTPUT: the weave, settled by the director at the story meeting            │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 3: THE MAP (Opus writer, code checks)                    │
│  The settled weave laid across the theme's slots, in about 450 words        │
│  Beats name their material; the article writer writes the prose             │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 4: ARTICLE GENERATION (Opus)                             │
│  Reads the whole rule set: the world, the truth rules, all 8 craft files    │
│  Nova's voice: C12 in craft-voice.md; words that never print: T14           │
│  Writes from the settled weave and the map; the fact check, then a          │
│  truth-only judge; the director finishes the article at the desk            │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 5: HTML ASSEMBLY                                         │
│  Handlebars template rendering → outputs/report-{sessionId}.html            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase-by-Phase Breakdown

### Phase 0: Input Parsing

**Nodes**: `parseRawInput`, `finalizeInput`

**Inputs**:
- Raw roster text (via `await-roster` checkpoint)
- Accusation details (via `await-full-context` checkpoint)
- Director observations
- Whiteboard photo/content

**Outputs**:
- `sessionConfig`: { roster, accusation, journalistFirstName } (NOT photosPath: the photo folder lives on `rawSessionInput` and the `photosPath` channel, collected at the `photos` gate after arc selection)
- `directorNotes`: { playerFocus, observations, whiteboard, accusationContext }

**Checkpoint**:
- `input-review` (0.2): Confirm parsed session data (runs AFTER data acquisition + incremental input)

**Note**: Incremental input flow means `parseRawInput` runs after `await-full-context` checkpoint, not at workflow start.

### Phase 1: Data Acquisition

**Nodes**: `fetchMemoryTokens`, `fetchPaperEvidence`, `preprocessEvidence` (photo nodes moved to Phase 2.36)

**Key Files**:
- `lib/workflow/nodes/fetch-nodes.js`
- `lib/workflow/nodes/photo-nodes.js`
- `lib/workflow/nodes/preprocess-nodes.js`

**Memory Token Structure** (from Notion):
```javascript
{
  tokenId: "vik001",
  name: "Victoria's Confession",
  fullDescription: "You remember standing in Marcus's office...", // SECOND PERSON
  summary: "Victoria confronts Marcus about the deal",
  valueRating: 450000,
  memoryType: "Confession",
  group: "Victoria",
  owners: ["Victoria"]
}
```

**Paper Evidence Structure** (from Notion):
```javascript
{
  pageId: "abc123",
  name: "Text Messages - Sarah to Marcus",
  basicType: "Document",
  description: "Thread of increasingly hostile messages...",
  narrativeThreads: ["Marriage", "Betrayal"],
  owners: ["Sarah", "Marcus"],
  files: [{ url: "...", name: "texts.pdf" }]
}
```

**Checkpoints** (incremental input flow):
- `paper-evidence-selection` (1.35): Select which paper evidence was unlocked
- `await-roster` (1.51): Wait for roster (names and pronouns)
- `await-full-context` (1.52): Wait for accusation/sessionReport/directorNotes

### Phase 1.8: Evidence Curation

**Node**: `curateEvidenceBundle` (in `lib/workflow/nodes/ai-nodes.js`)

**Hybrid Approach** (Commit 8.11):

1. **Programmatic Token Routing** (~10ms, no AI):
   ```javascript
   if (disposition === 'exposed') → exposed.tokens (full content)
   if (disposition === 'buried')  → buried.transactions (metadata only)
   if (disposition === 'unknown') → excluded
   ```

2. **Batched Paper Scoring** (~30s, Sonnet):
   - 8 items per batch × 8 concurrent calls
   - Scoring criteria:
     - Roster connection (+1)
     - Token corroboration (+2)
     - Suspect relevance (+2)
     - Theme alignment (+1)
     - Substantive content (+1)
   - Score >= 2 → included
   - Score < 2 → excluded (may be rescuable)

3. **Programmatic Aggregation** (~5ms):
   - Build curationReport with included/excluded items
   - Assemble final evidenceBundle structure

**Output Structure**:
```javascript
{
  exposed: {
    tokens: [...],        // Full memory content
    paperEvidence: [...]  // Curated props/documents
  },
  buried: {
    transactions: [...]   // { tokenId, shellAccount, amount, time }
  },
  curationReport: {
    included: [...],
    excluded: [...]
  }
}
```

**Checkpoint**: `evidence-and-photos` (1.8) - Approve bundle, rescue excluded items

### Phase 2: The Weave and the Story Meeting

**Nodes**: `analyzeArcs` (graph name; the function `analyzeArcsPlayerFocusGuided`), `validateArcs` (`validateArcStructure`, the weave checks), `evaluateArcs` (the fact check), `checkpointArcSelection` (the story meeting), and the rework, `incrementArcRevision` then `reviseArcs` (phase 4, briefs 4.4 and 4.5; spec section 4)
**Files**: `lib/workflow/nodes/arc-specialist-nodes.js`, `lib/weave.js` (the weave's shape and its checks), `lib/meeting.js` (the meeting's payloads and what it shows)

**The arc writer** writes one weave in one call: the story the article will tell, which the director settles at the story meeting before anything is planned. When the director's notes end with their own read of the session, the story starts from it (C1); the record and everything else supply the threads, the receipts and what complicates the story. The lens work C16 sets out stays in the writer's reasoning, and reaches the weave as each thread's role.

**Prompt Structure** (recency bias: rules LAST). The system prompt is the theme's identity line, the mode block, the world and the truth rules (`systemPromptOpening`, from `loadRuleSet('arc', {theme})`), then the writer's role. The user prompt (`buildWeaveSections`):

```
OUTPUT FORMAT: the weave's fields
SECTION 1: WHAT THE ROOM CONCLUDED
  - The accusation, with the director's account of it word for word
  - The whiteboard: a model's reading of the photo, context only
  - The director's notes and corrections: the record for the room, under T1
  - Blake and the Valet in the director's notes (when the notes name them)
  - The investigation focus, the session roster, the character categories,
    the roster with pronouns and the character context
SECTION 2: THE RECORD (every exposed document, then the morning timeline),
  then the receipts a thread may give: the document ids, and "ledger"
SECTION 3: THE WEAVE (WEAVE_TASK: C1, C16 and C15, by pointer)
SECTION 4: CRAFT GUIDANCE (story, form, material, judgement, questions)
<DIRECTOR_GUIDANCE> (the standing notes)
```

**The weave** (`WEAVE_SCHEMA` in `lib/sdk-client/subagents.js`, built from `lib/weave.js`'s constants), about 400 words; the checks bound the writer's words at `WEAVE_WORD_BOUND`:

```javascript
{
  story, question, headline,     // the thesis in one to three sentences, the question it carries, a working headline
  fromYourNotes,                 // the director's own words the story rests on, only when it starts from their read
  threads: [{ id, claim, role, receipt, reason, verdict }],
    // role: main-thread | grounds-it | complicates-it | mirrors-it | carries-it-forward | left-out
    // receipt: a document id from the record, or "ledger"; verdict: true on the thread that carries the room's verdict
  connections: [{ id, kind, joins, detail }],          // kind: person | moment | document | line
  convergence,
  strongerMainThread: { thread, reason },              // only when the writer sees one
  questions: [{ id, kind, about, question, changes }]  // kind: player | pronoun | figure (C15)
}
```

**The checks and the fact check**, before the meeting (spec 4.5): code checks the weave, free (see Arc Validation Routing below), and a failed check sends it back for one rework in the round. Then one fact check (`evaluateArcs`, Opus) scores the truth criteria alone; a breach gets one automatic fix, and the meeting opens with no second judge call. No note on the writing and no score reaches the meeting.

**Checkpoint**: `arc-selection` (2.35) - The story meeting (brief 4.5): about 400 words, in the spec's order: the verdict; the story, its question and the working headline; "from your notes"; the threads with their roles and receipts; the connections and the convergence; the stronger main thread; the questions, each with its answer box. The director edits the words, changes a role, adds a thread, strikes a connection and answers each question, then approves, reweaves (the writer fits the changes in and keeps every line the director did not touch) or sends back (the writer rethinks the weave as the note asks). A connection that joins a left-out thread goes out of the story with it, and its line at the meeting says so; it comes back when the thread does (brief 4.14a). The director's edits are final: an automatic pass or a reweave never changes one, and a struck connection keeps its id, so a connection a rework adds under it takes an id of its own (brief 4.14a). Later prompts name the meeting's changes in the meeting's own form, M and the edit's number, apart from the map's and the desk's E ids. Approve writes `data/<id>/analysis/weave.approved.json`. Going back to the meeting reopens it as the director left it, with no model call (R9). The details are in `reports/CLAUDE.md`, **The story meeting**.

### Phase 2.36: Photo Branch

**Nodes**: `checkpointPhotos`, `fetchSessionPhotos`, `preprocessPhotos`, `analyzePhotos`, `detectWhiteboard`, `checkpointCharacterIds`, `parseCharacterIds`, `finalizePhotoAnalyses`

**Checkpoints**: `photos` (2.36, conditional - skipped when photosPath came from /start); `character-ids` (1.66, historical number), where each photo has a "Leave this photo out" box (phase 4, brief 4.2). A photo left out appears nowhere: not on the map, the page or the published folder (T13; `isPhotoExcluded`, through `lib/photo-leave-out.js`).

The photo branch joins at the map writer. Phase 2.4, the arc evidence packages (`buildArcEvidencePackages`), went in phase 4 (brief 4.6; R5): every writer reads the record whole, and the fact check's card sources come from it alone.

### Phase 3: The Map

**Nodes**: `generateOutline` (the map writer, `lib/workflow/nodes/ai-nodes.js`), `checkMap` (`lib/workflow/nodes/map-nodes.js`), `checkpointOutline`, and the rework `incrementOutlineRevision` + `reviseOutline` (phase 4, brief 4.6; spec 5.1 to 5.4).

**The map's shape** (`lib/schemas/outline.schema.json`; the theme's slots filled in by `lib/map.js` `mapSchemaFor`):

```javascript
{
  headline, deck,                 // within the content bundle's limits (HEADLINE_LIMITS)
  topPhoto,                       // the photo the article prints as its hero
  gapNote: { line, players },     // only when the record cannot carry part of the story
  sections: [{ slot, heading, job,
    beats: [{ id, kind, material, players, card?, connection? }],   // kind: scene | receipt | line | figure
    photos: [{ filename, beat? }] }],
  dropped: [{ slot, reason }],
  leftOut: [/* beats considered and not used */],
  expectedLength,                 // the writer's estimate
  weaveChanges: [{ source, change }]   // what the map changed to fit a meeting change (its id as the settled weave marks it, M3) or the meeting's approval note ("note"), when the prompt holds one
}
```

**The writer** reads the settled weave first, as its task (`settledWeaveOf`), then the theme's slots, the director's notes, the photos with code's pick for the top photo first, the record, FINANCIAL_SUMMARY, `SESSION_FACTS`, the roster with pronouns, `<SCHEMA>` and every craft file but `craft-voice.md` and `craft-questions.md` (`loadRuleSet('outline', {theme})`), and the standing notes last. Code writes `heroImage` from the map's top photo.

**The checks** (`lib/map.js` `mapFindings`), free and in code: every roster player in a beat or raised in the gap note, every kept photo placed once, three to five cards from the record, every connection the settled weave keeps landed in a beat (none struck, and none that joins a left-out thread), each weave change named by its source, and no two beats under one id. A failed check sends the map back for one automatic rework (`REVISION_CAPS.OUTLINE` is 1); a check still failing after it opens the stop, which shows it. A failure the director caused is a concern on their edit, never a rework. The director's send-back reads no check failure from before it, as the meeting's does: the checks run again on its map. No model judge reads the map.

**Checkpoint**: `outline` (3.25) - The map: the director edits its beats, its photos and its top photo, and approves or sends it back. The approved map is saved as `data/<id>/analysis/map.approved.json`. To change the story itself, the director goes back to the story meeting; going back to the map reopens it as the director left it, with no model call (R9), and the rollback panel says so. A photo the director has left out since the map, such as one deleted at the desk, shows on the map as left out, with no move, and the gate refuses it as a top photo the director chose; the article leaves it out (`articleMapOf`). At approve and at send-back the gate stores a photo a strike freed by itself, and moves a section the director emptied (no beat and no photo left) to the dropped list, with the line "The director emptied this section on the map." (task 4.14b).

### Phase 4: Article Generation

**Nodes**: `generateContentBundle`, `evaluateArticle` (the fact check, then the article judge), `checkpointArticle` (the desk), and the rework, `incrementArticleRevision` then `reviseContentBundle` (`lib/workflow/nodes/ai-nodes.js` and `evaluator-nodes.js`; phase 4, briefs 4.7a and 4.7b; spec section 6)

**What the writer reads** (`articleWriterInputs`): the settled weave first (`settledWeaveOf`), then the map as the director left it (`<STORY_MAP>`), then its task, then PHOTOS, the record, the money, the director's notes, `SESSION_FACTS`, the instruction with its `<SCHEMA>`, the eight craft files and the standing notes last. It writes all the prose from the map's beats, and adds no beat and no connection (C16). Code stamps the map's headline, deck and top photo into the first draft (`stampFromMap`, R7).

**The rules**: the article writer reads the whole rule set (`loadRuleSet('article', {theme})`): the world and the truth rules in its system prompt after the mode block, and all eight craft files last in its user prompt. Nova's voice is C12 in `craft-voice.md`; where Nova stood is the session's mode block (`mode-on-site.md` or `mode-remote.md`) and T8; the length and the house style are C4 in `craft-telling.md`; the fiction's own words are T14, buried memories T3, and characters, not players, T11, all in `truth-rules.md`. Code checks the em-dash, the production words, Nova's pronoun, the length and the head count as advisories (`lib/content-bundle-fact-check.js`).

**Photos** (T13): the writer is given every photo the director kept (`articleWriterInputs`, `options.photos`): the hero, the map's top photo, first, then every other photo but the whiteboard, each printed once under PHOTOS. The map places each kept photo once, beside its beat or with its people, and the article prints each where the map places it; the article judge's `photosTruth` checks every one. The hero is read once, through `topPhotoOf(articleMapOf(state))`: PHOTOS, the instruction's hero line, the stamp and the judge's PHOTOS all name it (brief 4.7c).

**The judge**: the fact check runs first, and a structural failure under the automated budget sends the article to its rework without the judge's call; then the article judge scores the truth criteria alone (see [Evaluation & Revision Architecture](#evaluation--revision-architecture)).

**Checkpoint**: `article` (4.25) - The desk (tasks 4.3 and 4.10; spec 6.3): the article as it will print, every editor visible, move, delete and insert, the marks beside their pieces, and nothing in front of the article. Approve publishes exactly what is on the desk; Send back, with a note, starts a structural rework. The details are in `reports/CLAUDE.md`, **The map's and the desk's editors**.

### Phase 5: HTML Assembly

**Node**: `assembleHtml` (in `lib/workflow/nodes/template-nodes.js`)

**Template Structure**:
```
templates/journalist/
  layouts/article.hbs
  partials/
    header.hbs
    navigation.hbs
    content-blocks/
      paragraph.hbs
      quote.hbs
      evidence-reference.hbs
    sidebar/
      evidence-card.hbs
      pull-quote.hbs
      financial-tracker.hbs
```

**Output**: `outputs/report-{sessionId}.html` + the photos it prints, in `outputs/sessionphotos/{sessionId}/`

**Photos** (the fixes before phase 4, F2): `lib/publish-photos.js` publishes only the photos the page prints, each at web size under its own name; its header states the settings. A printed photo missing from `data/{sessionId}/photos` stops the publish before the report is written.

---

## Prompt Construction Patterns

### Recency Bias Pattern

Rules placed LAST in prompts for maximum salience:

```
<DATA_CONTEXT>
  Session data, evidence bundle, player focus...
</DATA_CONTEXT>

<TEMPLATE>
  Output structure requirements...
</TEMPLATE>

<RULES>
  Critical constraints (MOST RECENT = HIGHEST WEIGHT)
</RULES>
```

For the journalist (phase 3) the rules are the rule set: the world and the truth rules sit in the system prompt right after the mode block, and the call's craft files come last in the user prompt, with only the director's standing notes (`<DIRECTOR_GUIDANCE>`) after them. Since phase 4 the judges read no craft file: they score the truth criteria alone.

### Immutable Inputs Pattern (retired)

The judges used to be told which inputs were fixed upstream, in an IMMUTABLE INPUTS block. The block went with the arc judge's weighted criteria (phase 4, brief 4.4) and the article judge's (brief 4.7a): a truth-only judge checks the output against the record and the director's words, and suggests no change to anything.

### NPC Allowlist Pattern

Every writer and judge reads the NPCs' canon lines in its roster section (`generateRosterSection` in `lib/prompt-builder.js`, from the theme's NPC entries in `lib/theme-config.js`), and the weave writer reads them again among its character categories (`buildCharacterCategoriesBlock`). The fact check reads the theme's NPC entries (`npcs`) for its pronoun check. The arc judge's own NPC list went with roster coverage at the arc stage (brief 4.4).

### XML Tag Format Migration (Commit ba3f534)

**Change**: Migrated from box-drawing characters to pure XML tags for prompt sections.

**Before** (box-drawing format; `narrative-structure.md` was a journalist craft file of the time, deleted in phase 3):
```
═══════════════════════════════════════════════════════════════════════════
FROM: narrative-structure.md
═══════════════════════════════════════════════════════════════════════════
${content}
═══════════════════════════════════════════════════════════════════════════
END: narrative-structure.md
═══════════════════════════════════════════════════════════════════════════
```

**After** (XML format):
```
<narrative-structure>
${content}
</narrative-structure>
```

**Implementation** (`labelPromptSection` in `lib/prompt-builder.js`):
```javascript
function labelPromptSection(filename, content) {
  if (!content || !content.trim()) return '';
  return `<${filename}>
${content.trim()}
</${filename}>`;
}
```

**Benefits**:
- **Token savings**: ~560 tokens per article generation (~120 chars × 12 usages)
- **Claude-native parsing**: XML aligns with model training data
- **Clear boundaries**: Opening/closing tags eliminate ambiguity
- **Cross-referencing**: Tag names enable natural references (e.g., "as C16 (`<craft-story>`) sets them out")
- **DRY enforcement**: Single source of truth prevents rule drift

**Cross-Reference System**:
- In prompt text: an item by its id and the tag of the file that states it, as the weave writer's task (SECTION 3, `WEAVE_TASK`) does: `C16 (<craft-story>) sets out the threads`
- In markdown docs: `` C16 (`<craft-story>`) `` (backtick-wrapped)

---

## Evaluation & Revision Architecture

### The truth-only contract

Since phase 4 the judges have one contract (briefs 4.4, 4.7a and 4.7c; spec 4.5 and 6.2): the story meeting's fact check and the article judge score the truth rules alone, and write no notes on the writing.

- **The truth criteria** (`TRUTH_GROUPS` in `evaluator-nodes.js`), one per group of truth rules, each structural, with no weight: `evidenceTruth` (T1, T3, T4, T6), `moneyTruth` (T5), `verdictTruth` (T2), `stagesTruth` (T7), `novaPositionTruth` (T8), `playersTruth` (T9, T11), `wordsTruth` (T12), and at the article `photosTruth` (T13) and `fictionTruth` (T14). Each asks only what its judge can check against its own prompts, so a group is worded per judge.
- **The verdict** (`TRUTH_ONLY_EVALUATION_JSON_SCHEMA` and `truthOnlyOutputFormat`, held to the contract by `truthOnlyVerdict`): a score for each criterion; the structural issues, each opening with its rule ids and quoting the text at fault beside the record it contradicts; a criterion's `fix` only when it scores below `STRUCTURAL_PASS_SCORE` (0.8); and `revisionGuidance` only as the steps that fix the structural issues. `overallScore` is the lowest truth-criterion score. `advisoryWarnings` holds only a concern about one of the director's edits, under `DIRECTOR_EDIT_PREFIX`.
- **Ready** when no structural issue remains and no truth criterion scored below `STRUCTURAL_PASS_SCORE`, whatever the judge's own `structuralPassed`. A finding located in the director's text is a concern beside its line, never a must-fix (the verdict guard, `guardDirectorEdits`: the director's edits are final).
- **The code checks** are the rest of the gate, free: the weave checks before the fact check, the map checks in place of a judge (no model judge reads the map), and the article's fact check before the article judge, whose structural failure under the budget skips the judge's call. The fact check's advisory checks (`FACT_CHECK_ADVISORY_ONLY`: an em-dash, a production word, a gendered pronoun for Nova, the length, the head count, the NPCs' pronouns, a leaked prompt example, and the absence stated more than once) never block: at the desk each is a mark beside its paragraph.
- **No score shows.** No stop shows a model score since task 4.10, and no note on the writing reaches a stop or a rework.

`evaluatePhase` skips a phase whose most recent evaluation is ready or escalated to the director (`escalatedToHuman`), so a replay from START reaches an escalated stop without paying for a new evaluation; the story meeting's fact check skips by its mark on the weave instead (`_factCheck`).

### Revision Loop Flow

```
Story meeting:  Weave -> Weave checks -[failed, no rework yet this round]-> Rework -> Weave checks
                                      -> Fact check -[breach, no fix yet]-> Fix -> Weave checks
                                      -> the meeting (a check still failing is shown there)
Map:            Map -> Map checks -[failed, no rework yet this round]-> Rework -> Map checks
                                  -> the map's stop (a check still failing is shown there)
Article:        Article -> Fact check, then judge -[not ready, under the budget]-> Rework -> Fact check, then judge
                                                  -> the desk (at the budget, escalated: each issue left is marked)
```

**Automated budget** (`REVISION_CAPS`, per round of the director's; the director's own rounds are never capped):
- Story meeting: one check rework and one fact-check fix, counted apart (`ARCS` is 1)
- Map: one check rework (`OUTLINE` is 1)
- Article: two reworks (`ARTICLE` is 2)

A reweave or a send-back opens a new round and starts the budget over.

**Rework Pattern** (DRY):
- `incrementXxxRevision` counts the pass; the map's and the article's keep the version the rework starts from (`_previousOutline`, `_previousContentBundle`), and the weave's rework starts from the weave where it is
- `reviseXxx` receives the previous version and the revision context
- A rework that fails keeps the version it started from as its stop's output (task 4.14e): a call that fails on a transient error runs again, up to three calls; a director's send-back that gives up reopens its stop with the director's version and says the round did not run; an automatic pass that gives up ends the run in an error with that version kept, so Retry opens the stop with no call ("A rework that fails" in `reports/CLAUDE.md`)
- How much it keeps follows the revision context (`buildRevisionContext`, under WHAT THIS REWORK DOES; phase 3, TH7): on a send back the director's note decides ("rethink" gets a rethink); a reweave fits the director's changes in and keeps every line they did not touch; on an automatic pass the rework fixes the must-fix items and leaves everything else word for word (R23; "The rework rules" in `reports/CLAUDE.md` gives the details). After an automatic pass or a reweave, code puts back what the pass changed in the director's edits (`settleEdits`); a send-back's rework may change an edit where its note needs it, and says why. One revision context serves every theme: the detective's older "targeted fixes" branch went (R1; phase 4, brief 4.7c)

## Key Implementation Details

### The Weave in One Call (Commit 8.15; phase 4)

**Why one call?** The room's conclusions guide everything: the story starts from the director's read and the room's verdict. Parallel specialists could not share that context (8.15), and since phase 4 the one call writes the weave alone: every later writer reads the record itself, so a write-up for each thread repeated what the next writer already had (spec 4.2).

**The room's verdict is always one of the threads** (C16): the weave checks require a thread marked `verdict: true` that is not left out. The report must address what players actually concluded.

### Arc Validation Routing (Commit 8.27; the weave checks since phase 4)

**Before the fact check:** `validateArcStructure` runs the weave checks in code (`lib/weave.js` `checkWeave`, no LLM), on the writer's text alone (a thread, a field or words the director added are never a check's failure):
- each of the writer's threads has a receipt, and every receipt names a document in the record (`buildValidEvidenceIds`) or the ledger;
- the room's verdict is one of the threads (`verdict: true`, not left out);
- every live connection joins two threads the weave holds;
- each left-out thread has its reason;
- every thread, connection and question has an id of its own, and a stronger main thread names a thread the weave holds;
- "from your notes" is the director's words, word for word (`isVerbatimIn`);
- the writer's words come to no more than `WEAVE_WORD_BOUND`.

**Routing behavior:**
- A failed check on a weave the fact check has not judged → one rework in the round (`routeArcValidation` → `incrementArcRevision` → `reviseArcs`), which reads the check's lines under their own label, `WEAVE CHECK FAILURES`
- A check still failing after that rework → on to the fact check; the meeting shows the failure
- The fact check (`evaluateArcs`) marks the weave it judged (`_factCheck`); a breach gets one fix (`routeArcEvaluation`), the checks run again on the fix, and the meeting opens with no second judge call
- A marked weave is never judged again, so a replay from START pays for nothing at the arc stage

So no fact check is paid for on a weave the code has already found at fault and is about to rework. Roster coverage left this stage in phase 4 (spec 4.5): the map places every player.

### Three-Category Character Model (Commit 4193772)

**Architecture**: Characters are classified into three mutually exclusive categories:

| Category | Definition | Where it is read | Example |
|----------|-----------|---------------|---------|
| **Roster PCs** | Characters present at investigation | The map places each in a beat, or raises them in its gap note (the map checks; C7) | "Sarah", "Alex", "Victoria" |
| **NPCs** | Non-player game characters | Valid, and never players | "Marcus", "Nova", "Blake", "Valet" |
| **Non-Roster PCs** | Valid game characters NOT in session | Named only through what the record shows of them | "Sofia" (if not playing) |

**Why This Matters**:
- **Prevents false negatives**: "Sofia" appearing in evidence is not a missing player
- **Prevents false positives**: NPCs like "Marcus" never count as players
- **Prevents hallucinations**: a name the record does not show is no one the article can name

**Implementation**: the weave writer reads the three categories in its prompt (`buildCharacterCategoriesBlock` in `arc-specialist-nodes.js`, with `getNonRosterPCs` in `node-helpers.js`: every known game character less the roster and the theme's NPCs). Coverage is the map's: its checks and its Everyone line read each beat's players against the roster (`mapTally` in `console/outline-edit-logic.js`, over `mapRosterOf` in `lib/map.js`), and the article's fact check covers the players the map places (`placedPlayers`). A player the director leaves off the map, by an unanswered question or a strike, is the director's decision: a concern on their edit at the map, and no finding at the article.

### Canonical Name Preservation (Commit 4193772)

**Problem**: LLM hallucinates last names ("Victoria Chen") when it doesn't know the canonical full name.

**Solution**: Accept BOTH first names AND canonical full names as valid.

**On the map**: `mapRosterOf` gives each roster player the canon's full name (`canonicalCharacters`, built from Notion), and `rosterMemberOf` (`console/outline-edit-logic.js`) matches a beat's player by the first name, the first word of the name given, or the full name. So "Sarah Blackwood" and "Sarah" place the same player.

**Canonical names in the prompts**: the roster section the writers and judges print (`generateRosterSection` in `lib/prompt-builder.js`) lists each character by canonical full name and tells the writer to use those names only; T1 in `truth-rules.md` says nothing is invented. The arc stage's name check, `validateRosterName`, went with its roster coverage (brief 4.4).

### disableTools Flag (Commit 4193772)

**Why Added**: The weave is pure structured output: the writer needs no file access or tool execution.

**Implementation** (`generateWeave` in `arc-specialist-nodes.js`):
```javascript
const result = await sdkClient({
  prompt,
  systemPrompt: weaveSystemPrompt(state.sessionConfig, state.theme),
  model: 'opus',
  jsonSchema: WEAVE_SCHEMA,
  disableTools: true,  // H21: pure structured output
  label: 'The weave'
});
```

**Benefits**:
- Prevents unnecessary tool invocations
- Improves performance (reduces context and latency)
- Ensures deterministic output (no file-read variations)

Since H21 every pipeline call declares its tools (`disableTools: true` for pure structured output, `tools: ['Read']` for the two image calls), because a call with neither runs with the full tool set (`reports/CLAUDE.md`, "Tool gating").

### fullDescription Priority Chain (Commit 6ffeef8)

**Problem**: Memory tokens have `fullDescription` (rich second-person narrative) but fallback chains only looked for `content`, `description`, etc. Articles received summaries instead of quotable content.

**Solution**: Add `fullDescription` to fallback chains in 3 locations.

**Priority Order**:
```javascript
1. fullContent       → Preprocessed field (if set by earlier processing)
2. fullDescription   → Memory tokens (rich Notion content)
3. rawData.fullDescription → Nested memory token data
4. content           → Paper evidence primary field
5. rawData.content   → Nested paper evidence data
6. description       → Legacy/alternate field
7. summary           → Last resort (150 chars, AI-generated)
```

**extractFullContent() Helper** (`node-helpers.js:309-320`):
```javascript
function extractFullContent(item) {
  return item.fullContent ||
         item.fullDescription ||        // Memory tokens
         item.rawData?.fullDescription ||
         item.content ||                // Paper evidence
         item.rawData?.content ||
         item.description ||
         item.summary ||
         '';
}
```

**Fixed Locations**:
- `evidence-preprocessor.js:328` - Batch processing
- `node-helpers.js:439` - Token routing to exposed layer
- `ai-nodes.js:777` - Arc evidence packages (gone since phase 4, brief 4.6; R5)

### Hybrid Evidence Curation (Commit 8.11)

**Before**: Single Opus call for 100+ items, ~9.5 minutes (measured), frequent timeouts

**After**:
- Token routing: Programmatic (~10ms, estimated)
- Paper scoring: Batched Sonnet (~30s, measured)
- Total: ~45 seconds with higher reliability (measured)

### LangGraph Checkpoints

Uses native `interrupt()` from `@langchain/langgraph`:

```javascript
const { interrupt } = require('@langchain/langgraph');

// In checkpoint node
interrupt({
  type: 'arc-selection',
  weave            // the story meeting (phase 4, brief 4.5)
});
```

State persists via `MemorySaver` (in-memory) or `SqliteSaver` (persistent).

### The stages and the clock

The party, the investigation and Nova's day, and the clock every logged time is printed on, are T7 in `truth-rules.md`, with the timeline in `world.md` ("The record and the timeline"). Code makes the clock: the session clock (`lib/prompt-renderers/session-clock.js`) decides once per session whether logged times print as logged or with AM for PM, and every time a prompt prints goes through it, the record view's `<morning-timeline>` and the transaction links included.

---

## Common Debugging Scenarios

### "A player is in no beat on the map"

**Check**:
1. Is the roster correctly parsed in `sessionConfig.roster`?
2. Do the beats name the player as the roster does: the first name, or the canon's full name (`rosterMemberOf`)?
3. Are NPCs (Marcus, Nova, Blake) on the roster by mistake?
4. Does the record say anything about the player? If not, the story meeting asked a question of kind `player` (C15); with no answer, the map writer raises the player in `gapNote` (C7), which the checks count as raised.

**Fix**: The map check's line names the player and the fix, and the round's one rework reads it. A player the director struck off the map is a concern on their edit, never a rework.

### "Buried content appearing in article"

**Check**:
1. Is three-layer model enforced in prompts?
2. Is article generation receiving buried transactions (metadata only)?
3. Does the article writer's system prompt carry `truth-rules.md` T3 (buried memories never appear as evidence)? The world and the truth rules come from `loadRuleSet('article', {theme})`, which throws naming a missing or empty rule file.

**Fix**: Check that `<RECORD>` prints a buried memory only as its sale (`lib/__tests__/buried-memory-sentinel.test.js`), and read the judges' `evidenceTruth` criterion (T3) for the line at fault.

### "The weave has no verdict thread"

**Check**:
1. Does a thread carry `"verdict": true`, and is that thread left out?
2. Is the accusation present in `playerFocus.accusation`, and the director's account in `sessionConfig.accusationRaw`?
3. Is the weave writer's SECTION 1 (what the room concluded) populated?

**Fix**: The weave check fails with a line that names the fix, and the round's one rework reads it. A check still failing after that rework reaches the meeting, which shows it; a send-back with a note asks the writer to rethink the weave.

### "Evaluation keeps failing same criterion"

**Check**:
1. Is the rework starting from the previous version (`_previousOutline`, `_previousContentBundle`, or the weave where it is)?
2. What did `buildRevisionContext` give the rework? Read its prompt in `llm-log/`: a criterion's notes and fix print only when it scored below `STRUCTURAL_PASS_SCORE`, and an automatic pass carries no judge `revisionGuidance` (a code check's lines still reach it, under the check's own label).
3. Is the automated budget spent (`REVISION_CAPS`)? At the cap the stop opens on the escalated verdict, and at the desk each issue left is marked beside its paragraph.
4. Is the finding about the director's own text? Then it is a concern beside the line, never a must-fix (`guardDirectorEdits`).

**Fix**: Check that `validationResults` is stamped with this phase (a mismatched stamp drops the whole evaluation block) and that the failing criterion's fix names the line at fault.

### "Photos not appearing in article"

**Check**:
1. Was a photos folder supplied - at /start or at the `photos` checkpoint? (state.photosPath)
2. Are photos analyzed in `photoAnalyses`?
3. Are `characterDescriptions` mapped to roster?
4. Did the director leave the photo out, with its "Leave this photo out" box at the `character-ids` stop (`leftOutPhotos`), or by deleting it at the desk? A photo left out reaches no writer or judge (T13).
5. Does the map place it? The map checks hold every kept photo to one place, and the article prints each where the map places it. Every photo the director kept reaches the article writer through `articleWriterInputs` (`options.photos`, since 3.9).

**Fix**: `fetchSessionPhotos` THROWS on a missing folder now, so a bad path shows as a run error naming the path, not as a silent zero-photo article. Check the `photos` gate's answer, then the `character-ids` approval and its leave-out boxes.

### "fullDescription not appearing in articles" (Commit 6ffeef8)

**Symptom**: Evidence cards show token IDs ("ALR001") or short summaries instead of rich quotable content.

**Check**:
1. Is `fullDescription` present in memory tokens from Notion?
2. Are fallback chains using `extractFullContent()` helper?
3. Check where a memory's text enters:
   - the preprocessor (`evidence-preprocessor.js`), which sends an exposed memory's `fullDescription`;
   - the token routing (`routeTokensByDisposition` in `node-helpers.js`), through `extractFullContent`;
   - the record view (`lib/prompt-renderers/record-view.js`), which prints the record's `fullDescription` or `description`, never a summary.

**Fix**: Ensure `fullDescription` is prioritized in fallback chain BEFORE `content`, `description`, `summary`.

**Correct priority**:
```javascript
item.fullDescription || item.rawData?.fullDescription || item.content || item.summary
```

### "Character name hallucinations" (Commit 4193772)

**Symptom**: Article uses incorrect last names ("Victoria Chen" instead of "Victoria Kingsley").

**Check**:
1. Are canonical names in the writers' roster section?
2. Does the prompt's roster block (`generateRosterSection` in `lib/prompt-builder.js`) list each character by canonical full name?
3. On the map, does `rosterMemberOf` place the player under the name given (the first name, or the canon's full name)?

**Fix**:
- Ensure prompts include roster with canonical names (from `canonicalCharacters`, built from Notion)
- The map's player matching accepts both "Victoria" AND "Victoria Kingsley"

**Common hallucinations**:
- "Victoria Chen" → should be "Victoria Kingsley"
- "Alex Chen" → should be "Alex Reeves"
- "Sarah Chen" → should be "Sarah Blackwood"

### "Temporal conflation in article"

**Symptom**: The article mixes the party (what a memory shows) with the investigation (the room, and the sales and exposures on the morning timeline) in one sentence, or prints a logged time off the morning clock.

**Check**:
1. Does the article writer's system prompt carry `truth-rules.md` T7 (the stages and the clock)?
2. Does the record's `<morning-timeline>` show the times on the session clock? The input review's ledger panel says which clock rule applied.
3. Did the judges' `stagesTruth` criterion (T7) flag the line?

**Fix**: The rule is T7 (`truth-rules.md`), with the timeline in `world.md`. A time on the wrong clock is fixed in `lib/prompt-renderers/session-clock.js`, which every printed time goes through.

---

## File Reference

### Core Pipeline Files

| File | Purpose |
|------|---------|
| `lib/workflow/graph.js` | LangGraph StateGraph (44 nodes, edges) |
| `lib/workflow/state.js` | State annotations, phases, reducers; the stop's round (`stopRoundOf`) |
| `lib/workflow/nodes/arc-specialist-nodes.js` | The arc writer: the weave, the weave checks' node and the arc rework |
| `lib/workflow/nodes/evaluator-nodes.js` | The two truth-only judges and the article's fact check |
| `lib/workflow/nodes/map-nodes.js` | The map checks' node (`checkMap`) |
| `lib/workflow/nodes/ai-nodes.js` | Curation, the map writer and its rework, the article writer and its rework |
| `lib/workflow/nodes/checkpoint-nodes.js` | Human approval checkpoints: the story meeting, the map and the desk among them |
| `lib/weave.js`, `lib/meeting.js` | The weave's shape and checks; the story meeting's payloads and what it shows |
| `lib/map.js` | The story map's schemas, checks, payloads and what its stop shows |
| `lib/hand-edit-diff.js` | The director's edits at a stop, and code's restore after an automatic pass |
| `lib/prompt-builder.js` | Prompt assembly for each phase |

### Prompt Reference Files

The writers and judges read the rule set of their theme (phase 3; phase 4, R14), which `lib/rule-set.js` loads from the folder the theme's config names: the journalist's is `.claude/skills/journalist-report/references/rules/`. The eight journalist craft files under `references/prompts/` that it replaced are deleted; the detective keeps its own.

| File | Purpose |
|------|---------|
| `references/rules/world.md` | The article's purpose and the world: the party, the investigation, the ledger, Nova, and what each memory became |
| `references/rules/truth-rules.md` | T1 to T15, each with its reason: the floor |
| `references/rules/craft-story.md` | C1, C3, C16: one thesis, how the official story was made, the threads woven toward one convergence |
| `references/rules/craft-form.md` | C2, C5, C6, C17, C18, C19, C14: the article's form, from the opening to the closing |
| `references/rules/craft-material.md` | C8, C7, C10, C11: the director's lines (weighed by the arc writer, chosen by the map), the players, the mechanics, the exposures |
| `references/rules/craft-voice.md` | C12: Nova, a working reporter with a stake |
| `references/rules/craft-judgement.md` | C13: judgement on the characters, critique past them |
| `references/rules/craft-telling.md` | C4: about 1,500 words, every paragraph pulling the reader on |
| `references/rules/craft-cards.md` | C9: cards and quote blocks |
| `references/rules/craft-questions.md` | C15: questions to the director, at the story meeting |
| `references/rules/mode-on-site.md`, `mode-remote.md` | The reporting-mode block: T8's mode part, what Nova could witness |

The eight craft files group C1 to C19 by the writer's job (phase 3, task 3.8). Each call reads the ones the phase 4 spec's section 11 gives it (`RULE_SET_CALLS` in `lib/rule-set.js`; it was the rule-set spec's section 8).

### Data Directory Structure

What the console writes (the standalone skill writes its own files beside these: `reports/CLAUDE.md`, "Session Data Directory Structure"):

```
data/{sessionId}/
├── inputs/
│   ├── session-config.json       # Roster, accusation, journalistFirstName
│   ├── director-notes.json       # Observations, whiteboard
│   ├── orchestrator-parsed.json  # Exposed/buried token lists
│   └── photo-descriptions.json   # The director's description of each photo
├── fetched/
│   ├── tokens.json               # Memory tokens from Notion
│   └── paper-evidence.json       # Paper evidence from Notion
├── photos/                       # The session photos, resized; publish reads them
├── analysis/
│   ├── weave.approved.json       # The weave as the director approved it at the story meeting
│   └── map.approved.json         # The map as the director approved it
├── output/
│   └── content-bundle.approved.json  # The article as the director approved it at the desk
├── llm-log/                      # Every model call's prompt and response, and index.jsonl
└── stops.jsonl                   # The stops log: each pause and each action of the director's
```

The published report goes to `outputs/report-{sessionId}.html`, with its photos in `outputs/sessionphotos/{sessionId}/`.

---

*Last updated: 2026-10-04 (phase 4: the weave and the story meeting, the map, the desk)*
*Based on codebase analysis including Commits 8.11 (hybrid curation), 8.15 (player-focus arcs), 8.24 (momentum criteria), 8.25 (outline schema), 8.26 (SRP checkpoints), 8.27 (arc validation routing), ba3f534 (XML migration), 4193772 (arc architecture), 6ffeef8 (data wiring), and phase 4's briefs*

*Graph: 44 nodes total (see lib/workflow/graph.js for complete node list)*
