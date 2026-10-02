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

Both themes share the same 45-node LangGraph pipeline and 11 checkpoints. Theme-specific behavior is handled by `theme-config.js` (NPCs, rules), `prompt-builder.js` (voice/constraints), `theme-loader.js` (prompt files from `.claude/skills/{theme}-report/`), `rule-set.js` (the journalist's rule set, phase 3: see [Prompt Reference Files](#prompt-reference-files)), and `templates/{theme}/` (Handlebars layouts).

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

**Rules**: in `truth-rules.md`, T1 (evidence decides how a claim is written), T2 (the verdict is the group's negotiated official story), T7 (the stages and the clock) and T13 (photos and the whiteboard); how the arc writer weighs the director's lines, and where the outline and article use them, is C8 in `craft-material.md`. What Nova could witness is the session's reporting mode block (`mode-on-site.md` or `mode-remote.md`, through `buildReportingModeBlock` in `lib/prompt-builder.js`).

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
│              PHASE 2: ARC ANALYSIS (Player-Focus-Guided)                    │
│  Player conclusions (accusation + whiteboard) drive arc generation          │
│  Architecture: Split-call (core arcs + enrichment) - See Section 10         │
│  OUTPUT: narrativeArcs (3-5 arcs with arcSource, evidenceStrength)          │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 3: OUTLINE GENERATION (Opus)                             │
│  Article structure: lede, theStory, followTheMoney, thePlayers, closing     │
│  Arcs weave THROUGH sections (not isolated chapters)                        │
└─────────────────────────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              PHASE 4: ARTICLE GENERATION (Opus)                             │
│  Reads the whole rule set: the world, the truth rules, all 8 craft files    │
│  Nova's voice: C12 in craft-voice.md; words that never print: T14           │
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

### Phase 2: Arc Analysis

**Node**: `analyzeArcs` (graph name) - implemented by `analyzeArcsPlayerFocusGuided` function
**File**: `lib/workflow/nodes/arc-specialist-nodes.js`

**Architecture** (Commit 8.15+): Player-focus-guided split-call approach where player conclusions drive everything.
*Note: See arc-specialist-nodes.js header comments for architecture evolution (8.12 parallel → 8.15 single → 8.28 split)*

**Prompt Structure** (recency bias - rules LAST). The journalist's since phase 3 (brief 3.3); the system prompt carries the mode block, the world and the truth rules (`loadRuleSet('arc')`), and the detective keeps its older sections:

```
SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY)
  - The Accusation: Who they blamed, what charge
  - The Whiteboard: a model's reading of the photo, context only
  - The Director's Notes: the record for the room, under T1; backstory in them is what Nova knows but the record cannot back, T1's third point
  - Blake and the Valet in the director's notes (when the notes name them)
  - The session roster and the character categories, then the roster with pronouns (since 3.10: the section the article writer and the judges print)

SECTION 2: ARC GENERATION RULES
  - Priority 1: ACCUSATION ARC (required, even if speculative)
  - Priority 2: Whiteboard and observation arcs
  - Priority 3: Discovered: a pattern the room did not take up (optional)

SECTION 3: THE RECORD (every exposed document, then the morning timeline)

SECTION 4: STAGES IN AN ARC SUMMARY

SECTION 5: THE THREE LENSES IN analysisNotes
  - The lenses as C16 (<craft-story>) sets them out, one analysisNotes field each:
    financial (read from the morning timeline), behavioral, victimization
  (C16 is their one statement: this section maps them onto the fields)

SECTION 6: CRAFT GUIDANCE (the rule set's craft files for the arc writer: story, form, material, judgement, questions)
```

**Arc Structure**:
```javascript
{
  id: "arc-victoria-morgan-collusion",
  title: "The Permanent Solution",
  arcSource: "accusation" | "whiteboard" | "observation" | "discovered",
  evidenceStrength: "strong" | "moderate" | "weak" | "speculative",
  keyEvidence: ["vik001", "mor021"],
  characterPlacements: { Victoria: "architect", Morgan: "enabler" },
  analysisNotes: { financial: {...}, behavioral: {...}, victimization: {...} },
  caveats: ["Morgan's motive unclear..."],
  unansweredQuestions: ["Who was the unknown contact?"]
}
```

**Checkpoint**: `arc-selection` (2.35) - Select 3-5 arcs for article

### Phase 2.36: Photo Branch

**Nodes**: `checkpointPhotos`, `fetchSessionPhotos`, `preprocessPhotos`, `analyzePhotos`, `detectWhiteboard`, `checkpointCharacterIds`, `parseCharacterIds`, `finalizePhotoAnalyses`

**Checkpoints**: `photos` (2.36, conditional - skipped when photosPath came from /start); `character-ids` (1.66, historical number)

### Phase 2.4: Arc Evidence Packaging

**Node**: `buildArcEvidencePackages` (in `lib/workflow/nodes/ai-nodes.js`)

**Purpose**: Creates per-arc evidence packages with full quotable content for outline generation.

**Output**: `arcEvidencePackages` - Evidence grouped by selected arc with full text for quoting.

### Phase 3: Outline Generation

**Node**: `generateOutline` (in `lib/workflow/nodes/ai-nodes.js`)

**Article Structure** (`lib/schemas/outline.schema.json`; since phase 3 every key is an optional slot, and the thesis decides which sections exist, C2):

```javascript
{
  lede: { hook, keyTension, primaryArc, selectedEvidence },
  theStory: { arcs, arcInterweaving },
  followTheMoney: { shellAccounts, arcConnections, photoPlacement },
  thePlayers: { exposed, characterHighlights, arcConnections },
  whatsMissing: { knownUnknowns, narrativePurpose, arcConnections },
  closing: { systemicAngle, accusationHandling, arcResolutions, finalLine },
  writerQuestions: [...]   // the outline writer's questions for the director (C15); never printed
}
```

**The rules**: the outline writer reads every craft file but `craft-voice.md` (`loadRuleSet('outline')`). How the sections carry one story is the form in `craft-form.md` (C2 first); how the threads intercut and converge is C16 in `craft-story.md`.

**Inputs** beside the arcs and the record: FINANCIAL_SUMMARY, `SESSION_FACTS`, the roster with pronouns (since 3.10) and the photos: the hero, then every other photo but the whiteboard and, since the 4b fix batch, the ones the director excluded. The outline places what its photo slots hold, one per arc and one in FOLLOW THE MONEY, and the article places the rest (T13).

**Momentum criteria** (Commit 8.24): the outline judge's advisory `loopArchitecture`, `arcInterweaving`, `visualMomentum` and `convergence` score C16, C4 and C9; see [Evaluation & Revision Architecture](#evaluation--revision-architecture).

**Checkpoint**: `outline` (3.2) - Approve structure, photo placements

### Phase 4: Article Generation

**Node**: `generateContentBundle` (in `lib/workflow/nodes/ai-nodes.js`)

**The rules**: the article writer reads the whole rule set (`loadRuleSet('article')`): the world and the truth rules in its system prompt after the mode block, and all eight craft files last in its user prompt. Nova's voice is C12 in `craft-voice.md`; where Nova stood is the session's mode block (`mode-on-site.md` or `mode-remote.md`) and T8; the length and the house style are C4 in `craft-telling.md`; the fiction's own words are T14, buried memories T3, and characters, not players, T11, all in `truth-rules.md`. Code checks the em-dash, the production words, Nova's pronoun, the length and the head count as advisories (`lib/content-bundle-fact-check.js`).

**Photos** (since 3.9; T13): the writer is given every photo the director kept (`articleWriterInputs`, `options.photos`): the hero, then every other photo but the whiteboard, each printed once under PHOTOS; the article places the photos the outline did not, and the article judge's `photosTruth` checks every one.

**Checkpoint**: `article` (4.2) - Final content approval

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

**Output**: `outputs/report-{sessionId}.html` + session photos

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

For the journalist (phase 3) the rules are the rule set: the world and the truth rules sit in the system prompt right after the mode block, and the call's craft files come last in the user prompt, before `<SHOULD_CONSIDER>` and `<DIRECTOR_GUIDANCE>`. A judge reads its writer's craft files after the material it judges.

### Immutable Inputs Pattern

Evaluators are told which inputs are FIXED and cannot be changed:

```
═══════════════════════════════════════════════════════════════
IMMUTABLE INPUTS (DO NOT suggest changes - fixed upstream)
═══════════════════════════════════════════════════════════════
- evidenceBundle: Curated evidence is final
- playerFocus: Accusation and whiteboard are immutable
- directorNotes: <the arc writer's notes label, ARC_NOTES_LABEL from arc-specialist-nodes.js>
- roster: Session roster is fixed

Your feedback should focus on how ARCS USE these inputs,
not changing the inputs themselves.
```

### NPC Allowlist Pattern

Evaluators know which non-roster characters are valid:

```
═══════════════════════════════════════════════════════════════
KNOWN NPCs (Valid despite NOT being on roster)
═══════════════════════════════════════════════════════════════
- Each NPC's full name, aliases and canon line, read from lib/theme-config.js
  (the journalist judge, phase 3; the detective keeps its own lines)

Do NOT flag these as "missing from roster coverage".
```

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

**Implementation** (`lib/prompt-builder.js:41-47`):
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
- In prompt text: an item by its id and the tag of the file that states it, as the arc writer's SECTION 5 does: `as C16 (<craft-story>) sets them out`
- In markdown docs: `` C16 (`<craft-story>`) `` (backtick-wrapped)

---

## Evaluation & Revision Architecture

### Structural vs Advisory Criteria

**STRUCTURAL** (must pass, block if failed):
- `rosterCoverage`: Every player in at least one arc, or, since phase 3 (3.7), named in a question of kind `player` to the director (journalist)
- `evidenceIdValidity`: All keyEvidence IDs exist
- `accusationArcPresent`: arcSource="accusation" exists
- `requiredSections`: journalist, each printed section earns its place (C2); detective, all five sections present (executiveSummary, evidenceLocker, suspectNetwork, outstandingQuestions, finalAssessment)
- `voiceConsistency`: Nova's first person; "we" as T8 allows it (C12, T8)
- `antiPatterns`: only C4's em-dash house rule and T14's production words (length is the fact check's advisory and a craft finding)
- `reporterMode`: T8 as the session's mode block states it (journalist): it fails on Nova voting, joining the room's accusation or exposing a memory and, remote, on a claim to have seen or heard the room or the absence stated more than once
- `arcSectionFlow` / `arcThreading`: every section an essential part of one narrative (C2)
- `visualDistributionPlan` (outline): the photos spread through the article
- Truth criteria (journalist, phase 3): one per group of truth rules (`TRUTH_GROUPS` in `evaluator-nodes.js`), no weight; one scored below `STRUCTURAL_PASS_SCORE` (0.8) sends the output back. `moneyTruth` (T5) asks whether the money runs from the buyer, and reads the timeline and, at the outline and article judges, the writers' FINANCIAL_SUMMARY; the article's `photosTruth` (T13) checks every photo the director kept

**ADVISORY** (warnings only, don't block):
- `coherence`: journalist, facts that cannot both be true (no craft item since round 7 rewrote C3), never arcs that pull against the verdict; detective, a consistent story without contradictions
- `evidenceConfidenceBalance`: Not all speculative
- `sectionBalance`: an article of about 1,500 words (C4)
- `convergence` (outline): one convergence near the end, where the thesis lands (C16)
- `emotionalResonance`: Delivers promised experience
- Craft findings (journalist): an editor's note for the director, naming its craft item, never a blocker (R22)

### The judges' output contract

A judge writes a criterion's `fix` only when it scores that criterion below `STRUCTURAL_PASS_SCORE`, and its `revisionGuidance` holds only the steps that fix the structural issues, one per issue (phase 3, 3.9; `EVALUATION_JSON_SCHEMA` and `outputFormat` in `evaluator-nodes.js`, shared by both themes). `evaluatePhase` skips a phase whose most recent evaluation is ready or escalated to the director, so a replay from START reaches an escalated stop without paying for a new evaluation.

### Revision Loop Flow

```
Generate → Evaluate → [structuralPassed?]
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
     [yes] Checkpoint            [no] Under cap?
                                        │
                              ┌─────────┴─────────┐
                              ▼                   ▼
                       [yes] Revise        [no] Escalate
                              │                   │
                              └───► Evaluate ◄────┘
```

**Automated budget** (`REVISION_CAPS`, per round of the director's; the director's own send-backs are never capped):
- Arcs: 2 automated reworks per round
- Outline: 2 automated reworks per round
- Article: 2 automated reworks per round

**Rework Pattern** (DRY):
- `incrementXxxRevision` preserves `_previousOutput`
- `reviseXxx` receives previous output + feedback
- How much it keeps follows the revision context (`buildRevisionContext`, under WHAT THIS REWORK DOES; phase 3, TH7): on a send back the director's note decides ("rethink" gets a rethink); on an automatic pass the rework fixes the must-fix items and leaves everything else word for word (R23; "The rework rules" in `reports/CLAUDE.md` gives the details). The detective keeps its older "targeted fixes" rules

---

## Key Implementation Details

### Player-Focus-Guided Arc Analysis (Commit 8.15)

**Why single SDK call?** Player focus must guide everything. Parallel specialists couldn't share this context efficiently.

**Accusation arc is REQUIRED** even if evidence is speculative. The report must address what players actually concluded.

### Arc Validation Routing (Commit 8.27)

**Before evaluation:** `validateArcStructure` runs programmatic checks (no LLM):
- Roster coverage: every player is placed in at least one arc or, journalist since phase 3 (3.7), named in a question of kind `player` to the director
- Accusation arc present: `arcSource: "accusation"` must exist
- Evidence ID validity: All `keyEvidence` IDs must exist in bundle

**Routing behavior:**
- Structural failures → skip expensive Opus evaluation, route directly to `incrementArcRevision`; the check's own guidance reaches the rework (the 4b fix batch)
- At revision cap → proceed to evaluation anyway (let evaluator handle escalation)
- All checks pass → proceed to `evaluateArcs`

This short-circuits the expensive Opus evaluator call when issues can be detected programmatically.

### Three-Category Character Model (Commit 4193772)

**Architecture**: Characters are classified into three mutually exclusive categories for validation:

| Category | Definition | Coverage Rule | Example |
|----------|-----------|---------------|---------|
| **Roster PCs** | Characters present at investigation | MUST appear in arcs, or (journalist, phase 3) in a question of kind `player` to the director | "Sarah", "Alex", "Victoria" |
| **NPCs** | Non-player game characters | Valid but don't count | "Marcus", "Nova", "Blake", "Valet" |
| **Non-Roster PCs** | Valid game characters NOT in session | Evidence-based mentions only | "Sofia" (if not playing) |

**Why This Matters**:
- **Prevents false negatives**: "Sofia" appearing in evidence doesn't break validation
- **Prevents false positives**: NPCs like "Marcus" don't count toward roster coverage
- **Prevents hallucinations**: Unknown names are still rejected

**Implementation** (`lib/workflow/nodes/node-helpers.js:74-125`):
```javascript
function isNonRosterPC(name, roster = [], allCharacters = [], npcs = []) {
  // If it's an NPC, it's not a non-roster PC
  if (isKnownNPC(name, npcs)) return false;

  // Check if name matches any roster member
  if (rosterLower.has(normalizedName)) return false;

  // Check if it's a valid game character
  return allCharacters.some(char => {
    const regex = new RegExp(`\\b${char.toLowerCase()}\\b`, 'i');
    return regex.test(name);
  });
}
```

**Validation Integration**: When validating character placements in arcs, the system:
1. Checks roster first (exact match or canonical name)
2. Checks NPCs second (valid but don't count for coverage)
3. Checks non-roster PCs third (valid game characters with evidence-based roles)
4. Rejects unknown names (potential hallucinations)

### Canonical Name Preservation (Commit 4193772)

**Problem**: LLM hallucinates last names ("Victoria Chen") when it doesn't know the canonical full name.

**Solution**: Accept BOTH first names AND canonical full names as valid.

**validateRosterName** (`node-helpers.js:680-720`):
- Input "Sarah Blackwood" → Returns "Sarah Blackwood" (preserves canonical)
- Input "Sarah" → Returns "Sarah" (preserves first name)
- Both map to same roster entry for coverage calculation

**Roster Coverage Calculation**:
```javascript
// Build mapping: both "sarah" and "sarah blackwood" → "sarah"
const canonicalToRoster = new Map();
roster.forEach(rosterName => {
  const nameLower = rosterName.toLowerCase();
  canonicalToRoster.set(nameLower, nameLower);
  const canonical = getCanonicalName(rosterName, theme);
  if (canonical.toLowerCase() !== nameLower) {
    canonicalToRoster.set(canonical.toLowerCase(), nameLower);
  }
});
```

**Canonical names in the prompts**: the roster section the writers and judges print (`generateRosterSection` in `lib/prompt-builder.js`) lists each character by canonical full name and tells the writer to use those names only; T1 in `truth-rules.md` says nothing is invented.

### disableTools Flag (Commit 4193772)

**Why Added**: Arc generation is purely analytical - it doesn't need file access or tool execution.

**Implementation** (`arc-specialist-nodes.js:441`):
```javascript
const result = await sdkClient({
  prompt,
  model: 'sonnet',
  jsonSchema: CORE_ARC_SCHEMA,
  timeoutMs: 3 * 60 * 1000,
  disableTools: true,  // Pure structured output, no tool access needed
  label: 'Core arc generation'
});
```

**Benefits**:
- Prevents unnecessary tool invocations
- Improves performance (reduces context and latency)
- Ensures deterministic output (no file-read variations)
- Keeps timeout realistic (3 minutes without tool overhead)

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
- `ai-nodes.js:777` - Arc evidence packages

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
  data: { narrativeArcs, evaluationHistory }
});
```

State persists via `MemorySaver` (in-memory) or `SqliteSaver` (persistent).

### The stages and the clock

The party, the investigation and Nova's day, and the clock every logged time is printed on, are T7 in `truth-rules.md`, with the timeline in `world.md` ("The record and the timeline"). Code makes the clock: the session clock (`lib/prompt-renderers/session-clock.js`) decides once per session whether logged times print as logged or with AM for PM, and every time a prompt prints goes through it, the record view's `<morning-timeline>` and the transaction links included.

---

## Common Debugging Scenarios

### "Arc evaluation fails rosterCoverage"

**Check**:
1. Is roster correctly parsed in `sessionConfig.roster`?
2. Are arc `characterPlacements` using exact roster names?
3. Are NPCs (Marcus, Nova, Blake) being incorrectly flagged?
4. Journalist: does a question for the director (`_arcAnalysisCache.writerQuestions`) of kind `player` name the missing player in its `about`? Such a player counts as covered (`_arcValidation.rosterCoveredByQuestion`). A `pronoun` or `ledger` question, or one with no kind, covers no one.

**Fix**: Evaluator has NPC allowlist - ensure it's not treating NPCs as roster members.

### "Buried content appearing in article"

**Check**:
1. Is three-layer model enforced in prompts?
2. Is article generation receiving buried transactions (metadata only)?
3. Does the article writer's system prompt carry `truth-rules.md` T3 (buried memories never appear as evidence)? The world and the truth rules come from `loadRuleSet('article')`, which throws naming a missing or empty rule file.

**Fix**: Check that `<RECORD>` prints a buried memory only as its sale (`lib/__tests__/buried-memory-sentinel.test.js`), and read the judges' `evidenceTruth` criterion (T3) for the line at fault.

### "Accusation arc missing"

**Check**:
1. Is `arcSource: "accusation"` being generated?
2. Is accusation data present in `playerFocus`?
3. Is prompt Section 1 (player conclusions) populated?

**Fix**: Arc analysis prompt requires accusation arc even if speculative.

### "Evaluation keeps failing same criterion"

**Check**:
1. Is the rework starting from `_previousOutput`?
2. What did `buildRevisionContext` give the rework? Read its prompt in `llm-log/`: on a journalist rework a criterion's notes and fix print only when it scored below `STRUCTURAL_PASS_SCORE`, and an automatic pass carries no judge `revisionGuidance` (a code check's guidance still reaches it).
3. Is the automated budget spent (`REVISION_CAPS`)? At the cap the stop opens on the escalated verdict.

**Fix**: Check that `validationResults` is stamped with this phase (a mismatched stamp drops the whole evaluation block) and that the failing criterion's fix names the line at fault.

### "Photos not appearing in article"

**Check**:
1. Was a photos folder supplied - at /start or at the `photos` checkpoint? (state.photosPath)
2. Are photos analyzed in `photoAnalyses`?
3. Are `characterDescriptions` mapped to roster?
4. Did the director exclude the photo at the `character-ids` stop? An excluded photo reaches no writer or judge (T13). Every photo the director kept reaches the article writer through `articleWriterInputs` (`options.photos`, since 3.9), whatever the arc packages list.

**Fix**: `fetchSessionPhotos` THROWS on a missing folder now, so a bad path shows as a run error naming the path, not as a silent zero-photo article. Check the `photos` gate's answer, then the `character-ids` approval and its exclusions.

### "fullDescription not appearing in articles" (Commit 6ffeef8)

**Symptom**: Evidence cards show token IDs ("ALR001") or short summaries instead of rich quotable content.

**Check**:
1. Is `fullDescription` present in memory tokens from Notion?
2. Are fallback chains using `extractFullContent()` helper?
3. Check three locations:
   - `evidence-preprocessor.js:328`
   - `node-helpers.js:439`
   - `ai-nodes.js:777`

**Fix**: Ensure `fullDescription` is prioritized in fallback chain BEFORE `content`, `description`, `summary`.

**Correct priority**:
```javascript
item.fullDescription || item.rawData?.fullDescription || item.content || item.summary
```

### "Character name hallucinations" (Commit 4193772)

**Symptom**: Article uses incorrect last names ("Victoria Chen" instead of "Victoria Kingsley").

**Check**:
1. Are canonical names provided in arc generation prompt?
2. Is `validateRosterName()` preserving canonical full names?
3. Does the prompt's roster block (`generateRosterSection` in `lib/prompt-builder.js`) list each character by canonical full name?

**Fix**:
- Ensure prompts include roster with canonical names (from `theme-config.js`)
- Validation should accept both "Victoria" AND "Victoria Kingsley"

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
| `lib/workflow/graph.js` | LangGraph StateGraph (37 nodes, edges) |
| `lib/workflow/state.js` | State annotations, phases, reducers |
| `lib/workflow/nodes/ai-nodes.js` | Curation, outline, article generation |
| `lib/workflow/nodes/arc-specialist-nodes.js` | Player-focus-guided arc analysis |
| `lib/workflow/nodes/evaluator-nodes.js` | Quality evaluation per phase |
| `lib/workflow/nodes/checkpoint-nodes.js` | Human approval checkpoints |
| `lib/prompt-builder.js` | Prompt assembly for each phase |

### Prompt Reference Files

The journalist writers and judges read the rule set (phase 3), which `lib/rule-set.js` loads from `.claude/skills/journalist-report/references/rules/`. The eight journalist craft files under `references/prompts/` that it replaced are deleted; the detective keeps its own.

| File | Purpose |
|------|---------|
| `references/rules/world.md` | The article's purpose and the world: the party, the investigation, the ledger, Nova, and what each memory became |
| `references/rules/truth-rules.md` | T1 to T15, each with its reason: the floor |
| `references/rules/craft-story.md` | C1, C3, C16: the thesis, how the official story was made, the threads woven toward one convergence |
| `references/rules/craft-form.md` | C2, C5, C6, C17, C18, C19, C14: the article's form, from the opening to the closing |
| `references/rules/craft-material.md` | C8, C7, C10, C11: the director's lines, the players, the mechanics, the exposures |
| `references/rules/craft-voice.md` | C12: Nova, a working reporter with a stake |
| `references/rules/craft-judgement.md` | C13: judgement on the characters, critique past them |
| `references/rules/craft-telling.md` | C4: about 1,500 words, every paragraph pulling the reader on |
| `references/rules/craft-cards.md` | C9: cards and quote blocks |
| `references/rules/craft-questions.md` | C15: the writer's questions to the director |
| `references/rules/mode-on-site.md`, `mode-remote.md` | The reporting-mode block: T8's mode part, what Nova could witness |

The eight craft files group C1 to C19 by the writer's job (phase 3, task 3.8). Each call reads the ones spec section 8 gives it (`RULE_SET_CALLS` in `lib/rule-set.js`).

### Data Directory Structure

```
data/{sessionId}/
├── inputs/
│   ├── session-config.json       # Roster, accusation, journalistFirstName
│   ├── director-notes.json       # Observations, whiteboard
│   └── orchestrator-parsed.json  # Exposed/buried token lists
├── fetched/
│   ├── tokens.json               # Memory tokens from Notion
│   └── paper-evidence.json       # Paper evidence from Notion
├── analysis/
│   ├── evidence-bundle.json      # Curated three-layer bundle
│   ├── arc-analysis.json         # Narrative arc candidates
│   └── article-outline.json      # Approved structure
└── output/
    └── article.html              # Final deliverable
```

---

*Last updated: 2026-10-02 (phase 3: the rule set, the judges and the reworks)*
*Based on codebase analysis including Commits 8.11 (hybrid curation), 8.15 (player-focus arcs), 8.24 (momentum criteria), 8.25 (outline schema), 8.26 (SRP checkpoints), 8.27 (arc validation routing), ba3f534 (XML migration), 4193772 (arc architecture), 6ffeef8 (data wiring)*

*Graph: 40 nodes total (see lib/workflow/graph.js for complete node list)*
