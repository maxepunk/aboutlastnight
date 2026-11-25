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

- **Journalist theme** (`state.theme = 'journalist'`): Nova, the NovaNews reporter (who Nova is: `world.md`), writes an investigative article in the first person, about 1,500 words at most (`job-map.md`, `job-article.md`), with NovaNews branding.
- **Detective theme** (`state.theme = 'detective'`): Detective Anondono files an official case report (~750 words, third-person investigative voice, single-column case file format).

Both themes share one 44-node LangGraph pipeline with 11 checkpoints, and since phase 4 the detective is parked (R1): it starts no session until it has its own files for the story meeting, the map and the article. What a theme decides lives in its files: `theme-config.js` (its NPCs, map slots, rules folder and identity lines), `rule-set.js` (each theme's rule set, read from the folder its config names; the journalist's: see [Prompt Reference Files](#prompt-reference-files)), `theme-loader.js` (the image calls' prompt files from `.claude/skills/{theme}-report/`), and `templates/{theme}/` (Handlebars layouts). `reports/docs/architecture/prompts.md`, "Adding a new theme", lists them.

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
| **Marcus Blackwood** | mab | The man whose death the room investigates (the fixed facts, `limits.md`). Host of the party. Founder of NeurAI. |
| **[Firstname] Nova** | — | The NovaNews reporter who writes the article (`world.md`). Players turn memories in to Nova to EXPOSE them. First name is configurable per session (often "Cassandra"), and every writer and judge is told it in the roster section's Nova line. |
| **Blake / Valet** | — | Manages operations at NeurAI; Marcus called Blake his Valet (the fixed facts). Works the room, making the deals that BURY memories (`world.md`; the money and the buyer: "The money" in `limits.md`). |

### Character Sheets

A character sheet is a player's private instructions for their character, handed out before the game: background on the character, a suspected motive, goals, where to start, and the character's secrets, mixed line by line. There are 20, one per character. A sheet is not an in-world document, so it is never in the record, never cited and never printed (the director's ruling, 2026-10-10).

- **Which document is a sheet** is one rule, `isCharacterSheet` in `lib/evidence.js`: a paper document whose name ends " Character Sheet", in any case.
- **The paper fetch leaves every sheet out** (`lib/workflow/nodes/fetch-nodes.js` `fetchPaperEvidence`), so no sheet reaches the paper-evidence stop, the preprocessing, the scoring, character extraction or any writer or judge. The standalone skill's fetch script leaves them out too.
- **A thread fetched before 2026-10-10** may still hold sheets. The record view (`renderRecordDocuments`), `documentTextsOf`, `documentResolverOf` and the weave writer's Sources list (`extractEvidenceSummary`) skip them, so no writer or judge reads one and no piece or card can cite one.

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

What the article can do with each layer is the rule set's, stated once: `world.md` ("What became of each memory", "What you are given, and what it is in the story") and `limits.md`. The code's words for the layers are "exposed" and "buried"; the rule files and the writers say "made public" and "sold". Each layer below says what the game left and where its rules live.

### Layer 1: EXPOSED (Full Reportability)

**Game Reality**: Player scanned token → chose "EXPOSE" → the memory's summary went up on the Evidence Board, Nova has the full memory, and the evidence log has its time and the name on the turn-in.

**Rules**: `world.md` ("Made public"); in `limits.md`, "What can be stated as fact", "Who made a memory public" and "Quotes are exact"; cards are the article writer's own part, `job-article.md`.

### Layer 2: BURIED (Observable Patterns Only)

**Game Reality**: Player scanned token → chose "BURY" → the memory was sold to be erased. Nova's ledger has the sale's time, amount and account, never which memory, and the record view prints a buried memory only as that sale on the investigation's timeline (`lib/prompt-renderers/record-view.js`).

**Rules**: `world.md` ("Sold", the ledger, an account); in `limits.md`, "Sold memories", "Whose account it is", "The money" and "Three stretches of time".

### Layer 3: CONTEXT (Director Notes = the Director's Observations)

**Game Reality**: The director watched the session and writes it into the notes: the room's scenes and lines, the deliberation, often the director's own read of the session, and the epilogue. The players' whiteboard and the director's accusation text come in beside the notes.

**The director's words** are one list (`lib/director-words.js` `DIRECTOR_WORDS_SOURCES`; spec 2026-10-09 section 3): the notes, the corrections at the input review, the accusation, the answers at the story meeting, and every note sent at a stop with approve, reweave or send-back. What a note says happened, or rules about the record, is record; a direction it gives is written as Nova's reading ("What can be stated as fact"). The writers read the notes at the stops as standing notes in `<DIRECTOR_GUIDANCE>`, each marked with its stop and action, `[the map, approved]`. Both judges print them in `<DIRECTOR_STOP_NOTES>`, read from `directorGateNotes` whole, the note a rework is acting on included, with "None." when there is none; the evidence check (a piece may cite one under `notes`), the article fact check and the verdict guard read the whole list. "From your notes" at the story meeting still quotes the session notes and corrections alone.

**Rules**: in `limits.md`, "What can be stated as fact", "The verdict", "Three stretches of time" and "Photos"; the notes print under one label in every prompt (`DIRECTOR_NOTES_LABEL`): they are Nova's notes and thinking, not text for the article, and only a line they quote a person as saying is one the article can quote. What Nova could witness is the part about this session (`mode-on-site.md` or `mode-remote.md` in a `<this-session>` tag, through `buildReportingModeBlock` in `lib/prompt-builder.js`).

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
│  One call pitches the weave: two or three angles over one set of threads,   │
│  the connections where the threads touch and the questions, each line in    │
│  plain words with the evidence that tells it underneath                     │
│  Code checks it; one fact check scores the limits. The page at most         │
│  450 words with any angle open: the writer's own words held to 450 less     │
│  what code prints, never under 350                                          │
│  OUTPUT: the weave; the director picks an angle and settles it              │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 3: THE MAP (Opus writer, code checks)                    │
│  The settled angle laid across the theme's slots, each section's beats in   │
│  the article's order, each section's step; each beat a move in plain words  │
│  with a one-sentence summary, its evidence underneath. A corkboard of at    │
│  most 550 words as it opens and 850 with every summary open                 │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 4: ARTICLE GENERATION (Opus)                             │
│  Reads the world and the limits, then the brief and its own part            │
│  The map's headline, deck and headings are the director's lines             │
│  Writes one story the map plans, each beat in the map's order, as its       │
│  summary says, where it has one, drawing on its evidence; the fact check,   │
│  then a truth-only judge; the director finishes the article at the desk     │
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

**The ledger's shift** (spec 2026-10-09 section 4; `lib/session-ledger.js` `buildLedger`). The session report can log the first-burial bonus and the transfers on another clock than the sales (100326 and 100426 logged them nine hours off). At the parse, a classified adjustment event (the bonus, a transfer) more than three hours outside the span of the session's sales and exposures is off the game's clock, and every such event moves by one shift of whole hours: the one that lands the bonus nearest the first sale when the bonus is among them, otherwise the fewest hours that put every one inside the span, and only when every event it moves lands inside the span. Each moved event keeps its `loggedTime` beside its new time; `ledgerCheck.clockShift` (`{hours, moved, bonus}`) records the shift, or `ledgerCheck.offClock` (`{rows}`) the rows no shift fits, which stay as logged. The input review's ledger panel says which in one line (`console/input-review-logic.js` `ledgerView`'s `shiftLine`). The shift is stamped at the parse, so a replay reads the stamped times, and a session parsed before it keeps its logged times until a new parse. Every writer, rework and judge reads the shifted times on the timeline, and a note at any stop corrects a wrong shift.

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

**The arc writer** writes one weave in one call: two or three angles, each a story the article could tell, over one shared set of threads, from which the director picks one and settles it at the story meeting before anything is planned (phase 4b, piece 3; spec `docs/superpowers/specs/2026-10-06-meeting-as-angles.md`). When the director's notes end with their own read of the session, angle 1 is that read worked up as a pitch, and the others are the strongest alternatives the session offers; otherwise every angle is the writer's, the strongest first (the weave writer's own part, `job-weave.md`). The record and everything else supply the threads, their evidence and what complicates each story. Since phase 4b (piece 1; spec `docs/superpowers/specs/2026-10-05-story-level-and-evidence.md`) each thread and connection is a line in plain words, with the evidence that tells it underneath: the director reads the lines, and the evidence travels to the map writer and on to the article writer, which draws on it for what each move needs and cites what it uses. The brief's work on the question and its steps reaches the weave as the angles, each a different way the threads make a story, and as the evidence, each piece marked as supporting its line or cutting against it.

**Prompt Structure** (recency bias: rules LAST). The system prompt is the theme's identity line, the part about this session (`<this-session>`), the world and the limits (`systemPromptOpening`, from `loadRuleSet('arc', {theme})`), then the writer's role. The user prompt (`buildWeaveSections`):

```
OUTPUT FORMAT: the weave's fields
SECTION 1: WHAT THE PLAYERS CONCLUDED
  - The accusation, with the director's account of it word for word
  - The whiteboard: a model's reading of the photo, context only
  - The director's notes and corrections, under the one label over the notes
  - Blake and the Valet in the director's notes (when the notes name them)
  - The investigation focus, the session roster with when the investigation
    ran and each guest reporter, when the session has any, who was played
    ("Played in this session", "The game's own characters", "Not played in
    this session"), the roster with pronouns and the summary of the characters
SECTION 2: THE RECORD (every exposed document, then the investigation's timeline),
  then the Sources a piece of evidence may name: the document ids,
  "ledger", "evidence-log" and "notes"
SECTION 3: THE WEAVE (WEAVE_TASK, pointing at <job-weave>)
SECTION 4: THE BRIEF AND YOUR PART (<brief>, then <job-weave>)
<DIRECTOR_GUIDANCE> (the standing notes)
```

**The weave** (`WEAVE_SCHEMA` in `lib/sdk-client/subagents.js`, built from `lib/weave.js`'s constants, with a piece of evidence from `lib/evidence.js`). The meeting's page shows the writer's lines with one angle open, the evidence folded, in at most 450 words in all with any angle open (`MEETING_WORD_BOUND`): the checks count the page once per angle, each open in turn, and hold the writer's own words to 450 less what code prints on that page, and never to fewer than 350 (`MEETING_WORD_FLOOR`; `lib/word-count.js` `pageLengthOf`, the one rule the map keeps too). The writer's task asks for about 325 words of its own:

```javascript
{
  angles: [{ id, headline, gist, story, question, lands, ends, threads }],
    // headline: the article's own printed line; gist: one sentence for the angle's card
    // story: two or three sentences; question: the question it carries; lands: why it lands with the players
    // ends: where it ends up, its convergence; threads: the ids of the threads it tells, in its order
  fromYourNotes,                 // the director's own words angle 1 rests on, only when angle 1 is their read
  threads: [{ id, name, line, verdict?, evidence }],
    // a name that says what happened, with its people, and one line in plain words
    // verdict: true on the thread that carries the verdict, which every angle tells
  connections: [{ id, joins, line, kind, evidence }],  // kind: person | moment | document | line, kept underneath and never printed
  questions: [{ id, kind, about, question, changes, thread? }],
    // kind: player | pronoun | figure (job-weave.md); thread: the thread its answer changes, or none for the pitch
  picked                         // the director's: the id of the angle they sent on (none: angle 1), written by the meeting's gate
}

// A piece of evidence (EVIDENCE_PIECE_SCHEMA), under a thread, a connection or a beat:
{ sources, shows, stance, card? }
  // sources: document ids in the record (the record view's id rule), "ledger", "evidence-log" or "notes",
  //   both sources when a piece sets two side by side
  // shows: what it shows, with the words or figures that matter; a quotation is word for word in its source
  // stance: supports | cuts-against; card: on a beat's piece only, the card's document
```

A thread the director adds at the meeting has no evidence: the map writer finds its evidence, or names the thread in its gap note, in plain words, when the record cannot carry it (piece 1's spec, 5.3). Every reader after the meeting reads the settled angle through one helper, `lib/weave.js` `settledAngleOf`: the picked angle with its threads in its order, the threads it leaves out, and the connections between its threads. No later writer reads the other angles. The evidence is never the director's edit: `lib/hand-edit-diff.js` leaves it out of every diff and mark.

**The checks and the fact check**, before the meeting (spec 4.5): code checks the weave, free (see Arc Validation Routing below), and a failed check sends it back for one rework in the round. Then one fact check (`evaluateArcs`, Opus) scores the truth criteria alone, reading each line against its evidence and each piece against the record: a line that says more than its evidence shows is an error of fact, and a finding about a piece is the writer's to fix (spec 6.2). Every angle is checked, not only the one open first, because the director may pick any of them. A breach gets one automatic fix, and the meeting opens with no second judge call. No note on the writing and no score reaches the meeting.

**Checkpoint**: `arc-selection` (2.35) - The story meeting (brief 4.5; phase 4b, pieces 1 and 3): a memo, at most 450 words as it prints with any angle open, counted by `wordsShown` with the folds closed, in the spec's order: the verdict and "from your notes", or one line saying the notes end without the director's read, so every angle is the writer's; the angles side by side, each its headline and its gist, the open angle's card saying it is open below; the open angle's pitch (its headline, story, question, why it lands and where it ends up), with the questions that sit by the pitch; its threads in the story, in the angle's order, each its name and its line with the questions beside it, the verdict's thread locked in; the threads it leaves out, by name, each opening in place to its line; the line to add a thread; and where they meet, the connections between the threads in the story, each its line. Angle 1 is open when the page opens. Each line opens in place to its evidence, "What's behind it". No line names an angle, a thread or a connection by its id, and there are no roles. The fold of a thread the director added says the map writer finds its evidence while it has none.

The director picks an angle (instant, with no model call), rewrites any line of its pitch or any thread's name or line in place, flips a thread into or out of the open angle (the verdict's thread stays in), adds a thread with a name and a line, answers each question, and then approves, reweaves or sends back. Whatever angle is open when they press a button is the one that goes: the gate stores every other angle as the meeting showed it, and refuses a version whose picked angle lacks the verdict's thread. A change to a thread's words shows in every angle that uses it. A connection shows only while both its threads are in; one the director wants gone while both stay goes with a note.
- **Approve** sends the open angle to the map writer as the director left it, with an optional note that stands for every later writer.
- **Reweave**, offered only when the director changed the open angle or a thread, or wrote a note, works on the open angle: the writer fits in the director's changes on that angle and on its threads (their changes on other angles stand as they are), keeps every line the director wrote, finds the evidence for a thread they added in the record, or leaves it with none when the record holds none (the meeting then says "The writer found nothing in the record for it.", and the map's gap note says so after), and writes the connections between the threads now in. Code then puts back every other angle, every thread outside the open angle and every connection that does not join two of its threads, as the rework started from them, so the director can still switch; a thread the open angle shares with another angle may be reworded, and the new words show in both.
- **Send back** needs a note, which sets the rethink: the rework may rewrite any angle or pitch new ones, and changes one of the director's edits only where the note needs it, saying why. The meeting reopens on the angle the director had open, if the rework kept it, otherwise on angle 1.

The director's edits are final: an automatic pass or a reweave never changes one. Later prompts name the meeting's changes in the meeting's own form, M and the edit's number, apart from the map's and the desk's E ids. Approve writes `data/<id>/analysis/weave.approved.json`, the whole weave with its pick. Going back to the meeting reopens it as the director left it, the angle they sent open, with no model call (R9). The details are in `reports/docs/architecture/story-meeting.md`, **The story meeting**.

### Phase 2.36: Photo Branch

**Nodes**: `checkpointPhotos`, `fetchSessionPhotos`, `preprocessPhotos`, `analyzePhotos`, `detectWhiteboard`, `checkpointCharacterIds`, `parseCharacterIds`, `finalizePhotoAnalyses`

**Checkpoints**: `photos` (2.36, conditional - skipped when photosPath came from /start); `character-ids` (1.66, historical number), where each photo has a "Leave this photo out" box (phase 4, brief 4.2). A photo left out appears nowhere: not on the map, the page or the published folder ("Photos" in `limits.md`; `isPhotoExcluded`, through `lib/photo-leave-out.js`).

The photo branch joins at the map writer. Phase 2.4, the arc evidence packages (`buildArcEvidencePackages`), went in phase 4 (brief 4.6; R5): every writer reads the record whole, and the fact check's card sources come from it alone.

### Phase 3: The Map

**Nodes**: `generateOutline` (the map writer, `lib/workflow/nodes/ai-nodes.js`), `checkMap` (`lib/workflow/nodes/map-nodes.js`), `checkpointOutline`, and the rework `incrementOutlineRevision` + `reviseOutline` (phase 4, brief 4.6; spec 5.1 to 5.4).

**The map's shape** (`lib/schemas/outline.schema.json`; the theme's slots and the piece of evidence filled in by `lib/map.js` `mapSchemaFor`):

```javascript
{
  headline, deck,                 // within the content bundle's limits (HEADLINE_LIMITS)
  topPhoto,                       // the photo the article prints as its hero
  gapNote: { line, players },     // only when the record cannot carry part of the story
  sections: [{ slot, heading, job,
    // job: the section's step, one sentence of about 25 words at most: what the reader learns there about the question; labelled "Step" on the page
    beats: [{ id, move, players, synopsis, threads, connection?, card?, kind?, evidence }],   // in the order the article tells them
      // move: the move of the story in a few plain words, its title on the map's page; threads: the ids of the settled weave's threads it carries
      // synopsis: one sentence in plain words on what the article tells at this move, folded under the title on the page; required of the writer, optional on a beat the director adds
      // card: true when its evidence prints as a card, with one piece flagged card: true, whose source is the card's document
      // kind: scene | receipt | line | figure, on a map stored before phase 18's run 2b; the writer is no longer asked for it, and no writer is shown it
    photos: [{ filename, beat? }] }],
  dropped: [{ slot, reason }],
  leftOut: [/* beats considered and not used */],
  expectedLength,                 // the writer's estimate
  weaveChanges: [{ source, change }]   // what the map changed to fit a meeting change (its id as the settled weave marks it, M3) or the meeting's approval note ("note"), when the prompt holds one
}
```

**The writer** reads the settled weave first, as its task (`settledWeaveOf`, in the map's form): the angle the director sent on, its headline, story, question, why it lands and where it ends up, each of its threads in its order with its evidence under it, the threads it leaves out by name, and the connections between its threads with the evidence under each, then the theme's slots (each by its name and what it stands for), the director's notes, the photos with code's pick for the top photo first, the record, FINANCIAL_SUMMARY, `SESSION_FACTS`, the roster with pronouns, `<SCHEMA>`, the brief and then the map writer's own part (`loadRuleSet('outline', {theme})`: `<brief>`, `<job-map>`), and the standing notes last. Its only prose is the deck under the settled angle's headline, which it carries word for word, and each section's heading, which the article prints; every other line stays in plain words. It writes each section's step, its `job`, one sentence of about 25 words at most on what the reader learns there about the question, and each section's beats as moves in plain words, in the order the article will tell them, gives each its people, a synopsis of about 20 words, its threads and its evidence, chosen for the step from those threads' evidence and from the record, flags each card's document, and aims for 400 words of its own as the page opens (`MAP_WORD_AIM`) and about 250 between the synopses (`MAP_SYNOPSIS_AIM`). Code writes `heroImage` from the map's top photo.

**The checks** (`lib/map.js` `mapFindings`), free and in code:
- every roster player in a beat or raised in the gap note, and every kept photo placed once;
- each beat marked as a card flags one piece, whose source is a document in the record, and the cards number three to five (`beatCardOf` reads a beat's card from its flagged piece);
- every thread in the settled angle lands in a beat that names it, and a thread the director added at the meeting, or flipped into the angle, may be named in the gap note instead, when the record cannot carry it, by its name, matched in any case and spacing and without its quotation marks, which the plain-words scan leaves out as the director's words; every connection between the settled angle's threads lands in a beat;
- each of the writer's beats carries a thread, and in a section only threads the settled angle tells (`thread-outside-story`; a beat the director added or brought back is never held to it), and has evidence, and every piece names a source the record holds, with each quotation word for word in its source (`lib/evidence.js` `evidenceProblems`);
- the writer's lines are in plain words: a beat's move and its synopsis, a section's step, the gap note's line and each weave change hold no document id the record holds, no quotation in quotation marks, no clock time and no money figure (`storyTermsProblems`); the headline, the deck and the section headings are exempt, since the article prints them;
- each weave change named by its source, and no two beats under one id;
- the page's length, counted by `wordsShown` on two pages (`MAP_PAGES`): as it opens, every synopsis and every other fold closed, the writer's own words are held to the larger of 400 and 550 less what the page prints that the writer did not write, such as the settled story and the counts (`MAP_WORD_AIM`, `MAP_WORD_BOUND`); with every synopsis open, to the larger of 650 and 850 less that page's overhead (`MAP_SYNOPSIS_AIM`, `MAP_OPEN_WORD_BOUND`). A photo prints no words on the page, so its description is in neither. Each page past its allowance is its own failure, saying which page ran long. The rule is `lib/word-count.js` `pageLengthOf`, which the meeting keeps with its own bound and floor (450 and 350).

A failed check sends the map back for one automatic rework (`REVISION_CAPS.OUTLINE` is 1); a check still failing after it opens the stop, which shows it beside its line, in plain words. The director's lines and the beats they added are never a check's failure: a failure the director caused is a concern on their edit, never a rework. The director's send-back reads no check failure from before it, as the meeting's does: the checks run again on its map. No model judge reads the map.

**The headline** is code's to hold (phase 17, fix wave 3, the director's call after the final review; `lib/map.js` `holdHeadline`), since the article prints the map's: the first map carries the settled angle's headline, the director's own where they edited it at the meeting, whatever the writer wrote, and each later pass keeps the headline of the map it started from, the director's version on a send-back. A send-back with the director's note is the one pass whose rework may write a new headline, the one the note asks for, and its prompt alone says so; the automatic passes after it in that round keep that one.

**Checkpoint**: `outline` (3.25) - The map (phase 4b, pieces 1 and 4: spec 2026-10-07 sections 4 to 6): a corkboard. Under the counts (everyone placed, or "In no move" with who is not; the cards; the photos placed of those kept; the expected length), the settled story with the gap note and the settled story's threads, each a coloured dot and its name, come the top of the article and a column for each section, headed by its slot, its heading and its step. Each move is a card in the order the article tells them: its title, its people, a dot for each thread it carries, "Card" where its evidence prints as a card, its photos as thumbnails, and its summary folded behind an arrow. Selecting a card opens it in place, with its threads by name, its photos with the director's descriptions, its controls and what's behind it, its evidence; the fold of a move the director added says the article writer finds its evidence. Left out is a tray under the board. No line names a move by its id. The director edits a move's title, summary and people, moves it up, down or to another section, leaves it out or brings it back, places its photos and the top photo, by the selected card's controls or by dragging, and approves or sends the map back. The order they leave a section's moves in is the article's. The approved map is saved as `data/<id>/analysis/map.approved.json`. To change the story itself, the director goes back to the story meeting; going back to the map reopens it as the director left it, with no model call (R9), and the rollback panel says so. A photo the director has left out since the map, such as one deleted at the desk, shows on the map as left out, with no move, and the gate refuses it as a top photo the director chose; the article leaves it out (`articleMapOf`). At approve and at send-back the gate stores a photo a strike freed by itself, and moves a section the director emptied (no beat and no photo left) to the dropped list, with the line "The director emptied this section on the map." (task 4.14b). The drop stands as the director's edit: an automatic pass that puts the section back has it taken out again when it holds nothing, and one it filled stays for the director to empty again, out of the dropped list (fix round 1).

### Phase 4: Article Generation

**Nodes**: `generateContentBundle`, `evaluateArticle` (the fact check, then the article judge), `checkpointArticle` (the desk), and the rework, `incrementArticleRevision` then `reviseContentBundle` (`lib/workflow/nodes/ai-nodes.js` and `evaluator-nodes.js`; phase 4, briefs 4.7a and 4.7b; spec section 6)

**What the writer reads** (`articleWriterInputs`): the settled weave first, in the article writer's form (`settledWeaveOf(state, { reader: 'article' })`: no headline line and no evidence, since the map holds both), then the map as the director left it (`<STORY_MAP>`, shown without a beat's kind, the gap note or the dropped sections, `mapAsShown`), under its line and the names of the sections, then its task, then PHOTOS, the record, the money, the director's notes, `SESSION_FACTS`, the instruction with its `<SCHEMA>` (only the fields the article prints, `WRITER_BUNDLE_SCHEMA`), the brief and then the article writer's own part, and the standing notes last. It writes the article the map plans: one cohesive story that argues the settled angle's thesis, built on the map's headline and deck, each section's beats in the map's order and each as its synopsis says, where it has one, each drawing on the evidence the beat carries for what the beat needs and citing what it uses, and it reads the whole record for a scene's detail; an inline card prints the document of the piece its beat flags. It adds no beat and no connection. Code stamps the map's headline, deck, each section's heading and the top photo into the first draft, and the theme's line above the headline (`stampFromMap`, R7), and records the headline, the deck and the headings as the director's lines, whoever wrote them, since the director approved the map that carries them: no automatic pass changes them, and a judge's finding in one is a concern for the desk (the lock, phase 18; **The lock** in `reports/docs/architecture/article.md`).

**The rules**: the article writer reads its rule set (`loadRuleSet('article', {theme})`): the world and the limits in its system prompt after the part about this session, and the brief and its own part last in its user prompt. The brief, which the three writers read, says how a reporter approaches the article, with reasons, and Nova's voice is in it; where Nova stood is the part about this session (`mode-on-site.md` or `mode-remote.md`) and the limit "Nova takes no side"; the length and the house style are in the article writer's own part, `job-article.md`; the story's own words, sold memories and characters, not players, are limits in `limits.md`. Code checks the em-dash, the production words, Nova's pronoun, the length and the head count as advisories (`lib/content-bundle-fact-check.js`).

**Photos** ("Photos" in `limits.md`): the writer is given every photo the director kept (`articleWriterInputs`, `options.photos`): the hero, the map's top photo, first, then every other photo but the whiteboard, each printed once under PHOTOS. The map places each kept photo once, beside its beat or with its people, and the article prints each where the map places it; the article judge's `photosTruth` checks every one. The hero is read once, through `topPhotoOf(articleMapOf(state))`: PHOTOS, the instruction's hero line, the stamp and the judge's PHOTOS all name it (brief 4.7c).

**The judge**: the fact check runs first, and a structural failure under the automated budget sends the article to its rework without the judge's call; then the article judge scores the truth criteria alone (see [Evaluation & Revision Architecture](#evaluation--revision-architecture)).

**Checkpoint**: `article` (4.25) - The desk (tasks 4.3 and 4.10; spec 6.3): the article as it will print, every editor visible, move, delete and insert, each Key Evidence entry moved and deleted as a block is (task 4.14c), the marks beside their pieces, and nothing in front of the article. Approve publishes exactly what is on the desk; Send back, with a note, starts a structural rework. The details are in `reports/docs/architecture/console.md`, **The map's and the desk's editors**.

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

For the journalist the rules are the rule set: the world and the limits sit in the system prompt right after the part about this session, and a writer's brief and its own part come last in the user prompt, with only the director's standing notes (`<DIRECTOR_GUIDANCE>`) after them. The judges read neither the brief nor a writer's part: they score the limits alone.

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
- **Cross-referencing**: Tag names enable natural references (e.g., "`<job-weave>` below says what an angle, a thread and a connection are")
- **DRY enforcement**: Single source of truth prevents rule drift

**Cross-Reference System**:
- In prompt text: a part of a rule file by its name and the tag of its file (`as "<part's name>" in <tag> says`), or the tag alone, as the weave writer's task (SECTION 3, `WEAVE_TASK`) does: `<job-weave> below says what an angle, a thread and a connection are`. No rule is cited by number in anything a writer reads (phase 18)
- In markdown docs: `` `<job-weave>` `` (backtick-wrapped)

---

## Evaluation & Revision Architecture

### The truth-only contract

Since phase 4 the judges have one contract (briefs 4.4, 4.7a and 4.7c; spec 4.5 and 6.2): the story meeting's fact check and the article judge score the limits alone, and write no notes on the writing. Each judge's instructions list the fifteen limits once, each by the code its findings open with and its name (`LIMIT_CODES`), say which limits none of its questions scores, what a breach is and what the director's words are.

- **The truth criteria** (`TRUTH_GROUPS` in `evaluator-nodes.js`), one per group of limits, each named here by the codes it scores, each structural, with no weight: `evidenceTruth` (T1, T3, T4, T6, T15), `moneyTruth` (T5), `verdictTruth` (T2), `stagesTruth` (T7), `novaPositionTruth` (T8), `playersTruth` (T9, T11), `wordsTruth` (T12), and at the article `photosTruth` (T13) and `fictionTruth` (T14). Each asks only what its judge can check against its own prompts, so a group is worded per judge.
- **The verdict** (`TRUTH_ONLY_EVALUATION_JSON_SCHEMA` and `truthOnlyOutputFormat`, held to the contract by `truthOnlyVerdict`): a score for each criterion; the structural issues, each opening with its limits' codes, quoting the text at fault and saying what is wrong (what the record or the director's words show instead, or what the limit rules out), never the new sentence; and a criterion's `fix` only when it scores below `STRUCTURAL_PASS_SCORE` (0.8), as what has to change, in a few words. No numbered steps are asked for (phase 18, run 2h). A rework reads each finding with the limit's name in place of its code (`withLimitNames`). `overallScore` is the lowest truth-criterion score. `advisoryWarnings` holds only a concern about one of the director's edits, under `DIRECTOR_EDIT_PREFIX`.
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
- A rework that fails keeps the version it started from as its stop's output (task 4.14e): a call that fails on a transient error runs again, up to three calls; a director's send-back that gives up reopens its stop with the director's version and says the round did not run; an automatic pass that gives up ends the run in an error with that version kept, so Retry opens the stop with no call ("A rework that fails" in `reports/docs/architecture/reworks.md`)
- How much it keeps follows the revision context (`buildRevisionContext`, under WHAT THIS REWORK DOES; phase 3, TH7): on a send back the director's note decides ("rethink" gets a rethink); a reweave works on the open angle: it fits the director's changes in and keeps every line they did not touch, and code puts back every other angle and every thread and connection outside the open angle; on an automatic pass the rework fixes the must-fix items and leaves everything else word for word (R23; "The rework rules" in `reports/docs/architecture/reworks.md` gives the details). After an automatic pass or a reweave, code puts back what the pass changed in the director's edits (`settleEdits`); a send-back's rework may change an edit where its note needs it, and says why. One revision context serves every theme: the detective's older "targeted fixes" branch went (R1; phase 4, brief 4.7c)

## Key Implementation Details

### The Weave in One Call (Commit 8.15; phase 4)

**Why one call?** The players' conclusions guide everything: the story starts from the director's read and the verdict. Parallel specialists could not share that context (8.15), and since phase 4 the one call writes the weave alone: every later writer reads the record itself, so a write-up for each thread repeated what the next writer already had (spec 4.2). Since phase 4b the same call attaches each thread's evidence, the pieces of the record that tell it, which the map writer hands on to the beats and the article writer cites.

**The verdict is a thread in every angle**: the weave checks require a thread marked `verdict: true` in each angle's threads, and the meeting's gate refuses a director's version whose picked angle lacks it. The report must address what players actually concluded.

### Arc Validation Routing (Commit 8.27; the weave checks since phase 4)

**Before the fact check:** `validateArcStructure` runs the weave checks in code (`lib/weave.js` `checkWeave`, no LLM), on the writer's text alone (a thread, a field or words the director added are never a check's failure):
- the angles: two or three, each with every field and naming only threads the weave holds, the verdict's thread among them;
- each of the writer's threads has at least one piece of evidence that supports it, and every piece, under a thread or a connection, names a source the record holds (a document by the record view's id rule, the ledger, the evidence log or the director's notes), never a buried memory, with each quotation word for word in its source (`lib/evidence.js` `evidenceProblems`);
- the writer's lines are in plain words: each angle's gist, story, question, why it lands and where it ends up, each thread's name and line, and each connection's line hold no document id the record holds, no quotation in quotation marks, no clock time and no money figure (`storyTermsProblems`); the director's lines, "from your notes", the verdict line, each angle's headline (the article's own printed line) and the questions are exempt;
- every connection joins two threads the weave holds;
- every angle, thread, connection and question has an id of its own;
- each question comes to at most 40 words across what it is about, the question and what its answer changes (`QUESTION_WORD_BOUND`; an answered question is not held to it), and a question that sits beside a thread names a thread the weave holds. One question per subject is the weave writer's own part (`job-weave.md`), not a check;
- "from your notes" is the director's words, word for word (`isVerbatimIn`);
- the writer's own words on the meeting's page stay within what it may use, the map's rule (`lib/word-count.js` `pageLengthOf`): the page, built from the writer's share of the weave and counted by `lib/stop-pages.js` `wordsShown` once per angle with that angle open, less what code prints there (the verdict with its charge and vote, the line that says the open angle is open below, the line that keeps the verdict's thread in, the labels), is held to the larger of 350 and 450 less that overhead (`MEETING_WORD_FLOOR`, `MEETING_WORD_BOUND`), so a long split vote never fails the writer. The check fails when any angle's page passes its allowance, and names the angle. Only the writer's output is held to it: the director's version is never refused for its length.

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
| **Roster PCs** ("Played in this session") | Characters present at investigation | The map places each in a beat, or raises them in its gap note (the map checks; the brief's "Everyone gets a place") | "Sarah", "Alex", "Victoria" |
| **NPCs** ("The game's own characters") | Non-player game characters | Valid, and never players | "Marcus", "Nova", "Blake", "Valet" |
| **Non-Roster PCs** ("Not played in this session") | Valid game characters NOT in session | Named only through what the record or the director's words show of them | "Sofia" (if not playing) |

**Why This Matters**:
- **Prevents false negatives**: "Sofia" appearing in evidence is not a missing player
- **Prevents false positives**: NPCs like "Marcus" never count as players
- **Prevents hallucinations**: a name the record does not show is no one the article can name

**Implementation**: the weave writer reads the three categories in its prompt, under the labels in brackets above (`buildCharacterCategoriesBlock` in `arc-specialist-nodes.js`, with `getNonRosterPCs` in `node-helpers.js`: every known game character less the roster and the theme's NPCs). Coverage is the map's: its checks and its counts read each beat's players against the roster (`mapTally` in `console/outline-edit-logic.js`, over `mapRosterOf` in `lib/map.js`), and the article's fact check covers the players the map places (`placedPlayers`). A player the director leaves off the map, by an unanswered question or a strike, is the director's decision: a concern on their edit at the map, and no finding at the article.

### Canonical Name Preservation (Commit 4193772)

**Problem**: LLM hallucinates last names ("Victoria Chen") when it doesn't know the canonical full name.

**Solution**: Accept BOTH first names AND canonical full names as valid.

**On the map**: `mapRosterOf` gives each roster player the canon's full name (`canonicalCharacters`, built from Notion), and `rosterMemberOf` (`console/outline-edit-logic.js`) matches a beat's player by the first name, the first word of the name given, or the full name. So "Sarah Blackwood" and "Sarah" place the same player.

**Canonical names in the prompts**: the roster section the writers and judges print (`generateRosterSection` in `lib/prompt-builder.js`) lists each character by canonical full name and says a surname not on the list is invented. The arc stage's name check, `validateRosterName`, went with its roster coverage (brief 4.4).

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

Since H21 every pipeline call declares its tools (`disableTools: true` for pure structured output, `tools: ['Read']` for the two image calls), because a call with neither runs with the full tool set (`reports/docs/architecture/sdk.md`, "Tool gating").

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

The party, the investigation and Nova's day, and the clock every logged time is printed on, are "Three stretches of time" in `limits.md`, with the timeline in `world.md` ("What you are given, and what it is in the story"). Code makes the clock: the session clock (`lib/prompt-renderers/session-clock.js`) decides once per session whether logged times print as logged or with AM for PM, and every time a prompt prints goes through it, the record view's `<investigation-timeline>` and the transaction links included. The investigation cannot begin before 5 AM: a session played from 5 PM on runs in the morning in the story, an earlier one in the afternoon. Code gives every writer and judge one line saying which, with the span of the session's sales and exposures (with the session's facts, or beside the session roster in the calls without them), and no code-built label fixes the time of day. Ledger rows the session report logged off the game's clock are lined up at the parse (see **The ledger's shift** under Phase 0).

---

## Common Debugging Scenarios

### "A player is in no move on the map" (the counts' "In no move:")

**Check**:
1. Is the roster correctly parsed in `sessionConfig.roster`?
2. Do the beats name the player as the roster does: the first name, or the canon's full name (`rosterMemberOf`)?
3. Are NPCs (Marcus, Nova, Blake) on the roster by mistake?
4. Does the record say anything about the player? If not, the story meeting asked a question of kind `player`; with no answer, the map writer raises the player in `gapNote`, which the checks count as raised.

**Fix**: The map check's line names the player and the fix, and the round's one rework reads it. A player the director struck off the map is a concern on their edit, never a rework.

### "Buried content appearing in article"

**Check**:
1. Is three-layer model enforced in prompts?
2. Is article generation receiving buried transactions (metadata only)?
3. Does the article writer's system prompt carry `limits.md` ("Sold memories": a sold memory appears only as its sale)? The world and the limits come from `loadRuleSet('article', {theme})`, which throws naming a missing or empty rule file.

**Fix**: Check that `<RECORD>` prints a buried memory only as its sale (`lib/__tests__/buried-memory-sentinel.test.js`), and read the judges' `evidenceTruth` criterion (its finding opens with T3) for the line at fault.

### "The weave has no verdict thread"

**Check**:
1. Does a thread carry `"verdict": true`, and does every angle's `threads` name it?
2. Is the accusation present in `playerFocus.accusation`, and the director's account in `sessionConfig.accusationRaw`?
3. Is the weave writer's SECTION 1 (what the players concluded) populated?

**Fix**: The weave check fails with a line that names the fix, and the round's one rework reads it. A check still failing after that rework reaches the meeting, which shows it; a send-back with a note asks the writer to rethink the angles.

### "Evaluation keeps failing same criterion"

**Check**:
1. Is the rework starting from the previous version (`_previousOutline`, `_previousContentBundle`, or the weave where it is)?
2. What did `buildRevisionContext` give the rework? Read its prompt in `llm-log/`: the evaluation prints as its must-fix lines, each with the limit's name in place of its code, and on an automatic pass its suggestions; a failed criterion's fix prints as a must-fix line only when the evaluation lists none, and no score or criterion's name prints (a code check's lines still reach it, under the check's own label).
3. Is the automated budget spent (`REVISION_CAPS`)? At the cap the stop opens on the escalated verdict, and at the desk each issue left is marked beside its paragraph.
4. Is the finding about the director's own text, which at the article includes the map's headline, deck and headings once the map is approved? Then it is a concern beside the line, never a must-fix (`guardDirectorEdits`).

**Fix**: Check that `validationResults` is stamped with this phase (a mismatched stamp drops the whole evaluation block) and that the failing criterion's fix names the line at fault.

### "Photos not appearing in article"

**Check**:
1. Was a photos folder supplied - at /start or at the `photos` checkpoint? (state.photosPath)
2. Are photos analyzed in `photoAnalyses`?
3. Are `characterDescriptions` mapped to roster?
4. Did the director leave the photo out, with its "Leave this photo out" box at the `character-ids` stop (`leftOutPhotos`), or by deleting it at the desk? A photo left out reaches no writer or judge ("Photos" in `limits.md`).
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

**Symptom**: The article mixes the party (what a memory shows) with the investigation (the room, and the sales and exposures on the investigation's timeline) in one sentence, prints a logged time off the session clock, or calls an afternoon investigation the morning.

**Check**:
1. Does the article writer's system prompt carry `limits.md` ("Three stretches of time")?
2. Does the record's `<investigation-timeline>` show the times on the session clock, and does the time-of-day line say morning or afternoon as the clock decides? The input review's ledger panel says which clock rule applied, and which ledger rows were shifted onto the game's clock.
3. Did the judges' `stagesTruth` criterion (its findings open with T7) flag the line?

**Fix**: The limit is "Three stretches of time" (`limits.md`), with the timeline in `world.md`. A time on the wrong clock is fixed in `lib/prompt-renderers/session-clock.js`, which every printed time goes through.

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

The writers and judges read the rule set of their theme (phase 3; phase 4, R14), which `lib/rule-set.js` loads from the folder the theme's config names: the journalist's is `.claude/skills/journalist-report/references/rules/`, eight files since phase 18, each the text the director settled (`docs/superpowers/specs/2026-11-20-the-brief-and-the-limits-design.md`; a copy of each is in `docs/superpowers/specs/2026-11-20-phase-18-approved-text/`). They carry no numbered items. The journalist's prompt files under `references/prompts/` that the rule set replaced are deleted; the detective keeps its own.

| File | Purpose | Who reads it |
|------|---------|--------------|
| `references/rules/world.md` | The world: the party, the investigation, Blake, the ledger, an account, the evidence log, the group statement, Nova; what became of each memory (made public, sold, never found); what the writer is given and what each thing is in the story | Every writer and judge, first, in the system prompt (`<world>`) |
| `references/rules/limits.md` | The fifteen limits on what the article may claim, each named by its lead-in | Every writer and judge, after the world (`<limits>`); the judges score them by code |
| `references/rules/brief.md` | How a reporter approaches this article, with reasons: what it is, the argument, one question and the steps to its answer, the headline, the sections, the threads, everyone given a place, paragraphs, Nova, the ending | The three writers, last in the user prompt (`<brief>`) |
| `references/rules/job-weave.md` | The weave writer's own part: the angles, the threads, the connections, the questions | The weave writer, after the brief (`<job-weave>`) |
| `references/rules/job-map.md` | The map writer's own part: the steps, the beats and their evidence, the lines the article prints, the length | The map writer, after the brief (`<job-map>`) |
| `references/rules/job-article.md` | The article writer's own part: following and reading the map, what is already written, cards, the sidebar and quote blocks, the length and house style, a guest reporter | The article writer, after the brief (`<job-article>`) |
| `references/rules/mode-on-site.md`, `mode-remote.md` | The part about this session: where Nova was and what Nova saw and heard | Every writer and judge, the session's one, in a `<this-session>` tag right after the identity line |

Each call reads the core (`CORE_FILES`: the world, then the limits) and then the files `RULE_SET_CALLS` in `lib/rule-set.js` gives it: each writer the brief, then its own part; the two judges nothing more. A rework reads what its writer reads. `lib/__tests__/rule-set.test.js` pins each file by its hash and lints the folder.

### Data Directory Structure

What the console writes (the standalone skill writes its own files beside these: `reports/docs/architecture/data.md`, "Session Data Directory Structure"):

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

*Last updated: 2026-11-24 (phase 18: the brief and the limits)*
*Based on codebase analysis including Commits 8.11 (hybrid curation), 8.15 (player-focus arcs), 8.24 (momentum criteria), 8.25 (outline schema), 8.26 (SRP checkpoints), 8.27 (arc validation routing), ba3f534 (XML migration), 4193772 (arc architecture), 6ffeef8 (data wiring), phase 4's briefs and phase 4b's piece 1*

*Graph: 44 nodes total (see lib/workflow/graph.js for complete node list)*
