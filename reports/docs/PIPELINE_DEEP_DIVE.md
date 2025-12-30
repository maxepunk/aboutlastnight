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

**The Report** is a post-game gift: Nova (an NPC journalist who was at the party) sends players her investigative article about their investigation together.

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
| **Marcus Blackwood** | mab | The murder victim. Host of the party. Founder of NeurAI. |
| **[Firstname] Nova** | — | The journalist narrator. Players turn memories into Nova to EXPOSE them. First name is configurable per session (often "Cassandra"). |
| **Blake / Valet** | — | Dual role: Representative of NeurAI (Marcus's company) AND the Black Market operator who pays players to BURY memories. |

### Character Sheets

Character sheets are part of the paper evidence in Notion. They contain:
- The character's **starting memories** (what they "remember" at game start)
- Basic character context before investigation begins
- Relationships and backstory hints

These starting memories give players a foundation before they discover additional memory tokens and paper evidence during gameplay.

---

## The Game Loop

### 1. Individual Discovery
Each player discovers their character's memories (tokens) and finds paper evidence (props, documents, texts).

### 2. The Choice Point
For each memory token, players choose:
- **EXPOSE**: Turn memory over to Nova (the journalist) - makes it public, everyone can see it
- **BURY**: Sell memory to Blake/Valet (the Black Market) - hide it for profit via shell accounts (content hidden, transaction visible)

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

**The article celebrates their gameplay experience** - including the messy negotiations, the things left unsaid, and the collective story they constructed together.

---

## Three-Layer Evidence Model

### Layer 1: EXPOSED (Full Reportability)

**Game Reality**: Player scanned token → chose "EXPOSE" → memory is public knowledge

**Nova CAN**:
- Quote the memory verbatim
- Name who exposed it ("Sarah chose to share her memory of...")
- Draw conclusions from the content
- Cross-reference with other exposed memories

**Example**:
> "Sarah's exposed memory reveals a heated conversation with Marcus: 'You think you can just walk away from this? After everything?'"

### Layer 2: BURIED (Observable Patterns Only)

**Game Reality**: Player scanned token → chose "BURY" → memory hidden for profit. The content is LITERALLY BURIED - nobody knows what's in it.

**Nova CAN**:
- Report transaction patterns ("$450K flowed through Gorlan account")
- Note timing ("The first burial came at 10:30 PM")
- Observe shell account activity ("ChaseT handled 3 high-value items")

**Nova CANNOT**:
- Say whose memory was buried ("Victoria buried her memory...")
- Say what the buried memory contained
- Claim the buried content proves anything

**Example**:
> "Someone fed $450,000 worth of memories to the Gorlan account. Whatever those memories contained, someone thought they were worth hiding."

### Layer 3: CONTEXT (Director Notes = Nova's Observations)

**Game Reality**: Director watched everything - player dynamics, conversations. Nova was "there" - she observed but doesn't have the extracted memories.

**Director Provides**:
- `playerFocus`: What players actually investigated
- `observations`: Behavioral patterns, suspicious correlations
- `whiteboard`: The players' own investigation notes
- `accusation`: Who they blamed and why

**Nova Uses This To**:
- Weight which arcs matter most (player focus drives everything)
- Note behavioral observations ("James never spoke to Blake once")
- Reflect player conclusions even if evidence is speculative

**Example**:
> "The group kept circling back to Victoria and Morgan. Their whiteboard was covered with connections between the two - 'permanent solution', 'criminal liability'. Whatever doubts I might have, this is the story they chose to tell."

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
│  analyzePhotos() → Haiku vision analysis                                    │
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
│              PHASE 2: ARC ANALYSIS (Single SDK Call)                        │
│  Player conclusions (accusation + whiteboard) drive arc generation          │
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
│  Nova's voice: first-person participatory journalism                        │
│  Anti-patterns enforced: no em-dashes, no "token", no game mechanics        │
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
- `sessionConfig`: { roster, accusation, journalistName, photosPath }
- `directorNotes`: { playerFocus, observations, whiteboard, accusationContext }

**Checkpoint**:
- `input-review` (0.2): Confirm parsed session data (runs AFTER data acquisition + incremental input)

**Note**: Incremental input flow means `parseRawInput` runs after `await-full-context` checkpoint, not at workflow start.

### Phase 1: Data Acquisition

**Nodes**: `fetchMemoryTokens`, `fetchPaperEvidence`, `analyzePhotos`, `preprocessEvidence`

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
- `await-roster` (1.51): Wait for roster (enables character ID mapping)
- `character-ids` (1.66): Map photos to characters based on Haiku descriptions
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

**Node**: `analyzeArcsPlayerFocusGuided` (in `lib/workflow/nodes/arc-specialist-nodes.js`)

**Architecture** (Commit 8.15): Single comprehensive SDK call where player conclusions drive everything.

**Prompt Structure** (recency bias - rules LAST):

```
SECTION 1: WHAT PLAYERS CONCLUDED (PRIMARY)
  - The Accusation: Who they blamed, what charge
  - Whiteboard Content: Their investigation notes

SECTION 2: ARC GENERATION RULES
  - Priority 1: ACCUSATION ARC (required, even if speculative)
  - Priority 2: Whiteboard-driven arcs
  - Priority 3: Director observation arcs
  - Priority 4: Discovered patterns (optional)

SECTION 3: EVIDENCE BOUNDARIES (three-layer model)

SECTION 4: EVIDENCE BUNDLE (full curated evidence)

SECTION 5: THREE-LENS ANALYSIS REQUIREMENT
  - Financial lens: Money flows, shell accounts
  - Behavioral lens: Character dynamics
  - Victimization lens: Who was targeted, why
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

**Checkpoint**: `arc-selection` (2.3) - Select 3-5 arcs for article

### Phase 3: Outline Generation

**Nodes**: `buildArcEvidencePackages`, `generateOutline` (in `lib/workflow/nodes/ai-nodes.js`)

**Article Structure** (NovaNews investigative journalism):

```javascript
{
  lede: { hook, keyTension },
  theStory: { arcs: [...] },           // Selected arcs woven together
  followTheMoney: { shellAccounts },   // BURIED layer analysis
  thePlayers: { exposed, buried },     // Character roster coverage
  whatsMissing: { gaps, questions },   // Honest about unknowns
  closing: { systemicAngle }           // Nova's take
}
```

**Key Principle**: Arcs flow THROUGH sections, not isolated chapters. A single arc might touch theStory, followTheMoney, and thePlayers.

**Momentum Criteria** (Commit 8.24):
- Loop architecture: Open questions that pull forward
- Arc interweaving: Callbacks, "wait so THAT'S why..." moments
- Visual momentum: Evidence cards serve loop mechanics
- Convergence: Where all threads meet

**Checkpoint**: `outline` (3.2) - Approve structure, photo placements

### Phase 4: Article Generation

**Node**: `generateContentBundle` (in `lib/workflow/nodes/ai-nodes.js`)

**Nova's Voice** (first-person participatory journalism):
- "I was there when..." not "The investigation revealed..."
- "What I saw that night..." not "Sources indicate..."
- Hunter S. Thompson meets Kara Swisher - gonzo tech journalism

**Influences**:
- Gonzo journalism (participatory, subjective, immersive)
- Tech investigative journalism (Theranos, Uber exposés)
- Noir atmosphere (moral ambiguity, everyone has secrets)

**Anti-Patterns** (strictly enforced):

| Forbidden | Use Instead |
|-----------|-------------|
| "token" | "memory", "extracted memory" |
| em-dashes (—) | commas, periods, restructure |
| "Act 1", "first burial" | avoid game mechanics language |
| "The players" | they are CHARACTERS |
| Claiming buried content | only report patterns |

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

### Immutable Inputs Pattern

Evaluators are told which inputs are FIXED and cannot be changed:

```
═══════════════════════════════════════════════════════════════
IMMUTABLE INPUTS (DO NOT suggest changes - fixed upstream)
═══════════════════════════════════════════════════════════════
- evidenceBundle: Curated evidence is final
- playerFocus: Accusation and whiteboard are immutable
- directorNotes: Ground truth - never question them
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
- Marcus Blackwood (the murder victim, NeurAI founder)
- [Firstname] Nova (the journalist - players EXPOSE memories to her)
- Blake / Valet (NeurAI rep / Black Market - players BURY memories to him)

Do NOT flag these as "missing from roster coverage".
```

---

## Evaluation & Revision Architecture

### Structural vs Advisory Criteria

**STRUCTURAL** (must pass, block if failed):
- `rosterCoverage`: Every player in at least one arc
- `evidenceIdValidity`: All keyEvidence IDs exist
- `accusationArcPresent`: arcSource="accusation" exists
- `requiredSections`: lede, theStory, thePlayers, closing
- `voiceConsistency`: First-person participatory voice
- `antiPatterns`: No em-dashes, no "token", no game mechanics

**ADVISORY** (warnings only, don't block):
- `coherence`: Consistent story
- `evidenceConfidenceBalance`: Not all speculative
- `sectionBalance`: Appropriate weighting
- `emotionalResonance`: Delivers promised experience

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

**Revision Caps**:
- Arcs: 2 revisions max
- Outline: 3 revisions max
- Article: 3 revisions max

**Targeted Fixes Pattern** (DRY):
- `incrementXxxRevision` preserves `_previousOutput`
- `reviseXxx` receives previous output + feedback
- Makes surgical fixes, not full regeneration

---

## Key Implementation Details

### Player-Focus-Guided Arc Analysis (Commit 8.15)

**Why single SDK call?** Player focus must guide everything. Parallel specialists couldn't share this context efficiently.

**Accusation arc is REQUIRED** even if evidence is speculative. The report must address what players actually concluded.

### Arc Validation Routing (Commit 8.27)

**Before evaluation:** `validateArcStructure` runs programmatic checks (no LLM):
- Roster coverage: Every player must be in at least one arc
- Accusation arc present: `arcSource: "accusation"` must exist
- Evidence ID validity: All `keyEvidence` IDs must exist in bundle

**Routing behavior:**
- Structural failures → skip expensive Opus evaluation, route directly to `incrementArcRevision`
- At revision cap → proceed to evaluation anyway (let evaluator handle escalation)
- All checks pass → proceed to `evaluateArcs`

This short-circuits the expensive Opus evaluator call when issues can be detected programmatically.

### Hybrid Evidence Curation (Commit 8.11)

**Before**: Single Opus call for 100+ items, ~9.5 minutes, frequent timeouts

**After**:
- Token routing: Programmatic (~10ms)
- Paper scoring: Batched Sonnet (~30s)
- Total: ~45 seconds with higher reliability

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

---

## Common Debugging Scenarios

### "Arc evaluation fails rosterCoverage"

**Check**:
1. Is roster correctly parsed in `sessionConfig.roster`?
2. Are arc `characterPlacements` using exact roster names?
3. Are NPCs (Marcus, Nova, Blake) being incorrectly flagged?

**Fix**: Evaluator has NPC allowlist - ensure it's not treating NPCs as roster members.

### "Buried content appearing in article"

**Check**:
1. Is three-layer model enforced in prompts?
2. Is article generation receiving buried transactions (metadata only)?
3. Are anti-patterns detecting "token" language?

**Fix**: Check `evidence-boundaries.md` prompt is being loaded and placed LAST.

### "Accusation arc missing"

**Check**:
1. Is `arcSource: "accusation"` being generated?
2. Is accusation data present in `playerFocus`?
3. Is prompt Section 1 (player conclusions) populated?

**Fix**: Arc analysis prompt requires accusation arc even if speculative.

### "Evaluation keeps failing same criterion"

**Check**:
1. Is revision using `_previousOutput` (targeted fixes)?
2. Is `buildRevisionContext` providing specific feedback?
3. Is revision cap being reached?

**Fix**: Check revision node is receiving evaluator feedback in `validationResults`.

### "Photos not appearing in article"

**Check**:
1. Are photos analyzed in `photoAnalyses`?
2. Are `characterDescriptions` mapped to roster?
3. Is `arcEvidencePackages` including relevant photos?

**Fix**: Check `character-ids` checkpoint approval and photo-to-arc mapping.

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

| File | Purpose |
|------|---------|
| `references/prompts/evidence-boundaries.md` | Three-layer model rules |
| `references/prompts/writing-principles.md` | Nova's voice and style |
| `references/prompts/anti-patterns.md` | What to avoid |
| `references/prompts/narrative-structure.md` | Article structure rules |

### Data Directory Structure

```
data/{sessionId}/
├── inputs/
│   ├── session-config.json       # Roster, accusation, photosPath
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

*Last updated: 2025-12-30*
*Based on codebase analysis including Commits 8.11 (hybrid curation), 8.15 (player-focus arcs), 8.24 (momentum criteria), 8.25 (outline schema), 8.26 (SRP checkpoints), 8.27 (arc validation routing)*
