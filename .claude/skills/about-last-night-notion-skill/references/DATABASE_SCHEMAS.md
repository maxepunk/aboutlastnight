# About Last Night - Database Schemas

This reference consolidates complete database structure information from all sources. Use when working with database fields, rollups, or understanding data relationships.

---

## Characters Database

### Core Fields

**Name** (title): Character identifier with goal cluster prefix
- Format: "E - Ashe Motoko" (E-/R-/P-/S- prefixes)
- Goal cluster prefix determines character motivation

**Goal Cluster** (select): Character motivation category
- Options: JUSTICE / RECOVERY / COVERUP / PRAGMATIC
- Determines token framing and gameplay tendencies

**Tier** (select): Narrative centrality
- Options: Core / Secondary / Tertiary
- Core: Always active, high narrative density (6-10 elements)
- Secondary: Active ≥15 players, medium density (4-7 elements)
- Tertiary: Active ≥20 players, can own critical mechanics (2-5 elements)
- Determines activation priority when <20 players

**Type** (select): Player vs NPC
- Options: Player / NPC
- NPCs: Marcus, Detective, Blake

### Narrative Context Fields ("Given Circumstances")

These fields document design intent and inform token creation:

**Character Logline** (rich_text): One-sentence character essence
- Character's core identity distilled
- Used as touchstone for all content related to character

**Overview & Key Relationships** (rich_text): Trust network and backstory
- Documents trust pairs: "You know you can trust [name]"
- Character history and key connections
- Background that grounds their PRESENT actions

**Emotion towards CEO & others** (rich_text): Marcus relationship
- How character feels about Marcus (and others)
- Informs token voice and emotional tone
- Drives PRESENT tense motivation

**Primary Action** (rich_text): PRESENT tense gameplay objective
- What this character IS DOING during 2-hour gameplay
- Present tense, active voice
- Token content should support this objective

**Why These Matter:** Token content should support Primary Action, voice should match Emotion, content grounds in Overview, essence reflects Logline.

### Relations

**Owned Elements** (relation to Elements): Elements character owns
- Whose POV/possession
- Character's personal perspective/evidence
- Direct Element → Character relation

**Associated Elements** (relation to Elements): Elements mentioning character
- Character involved in backstory but not owner
- Appears in others' stories
- Via Timeline Event rollup

**Events** (relation to Timeline): Timeline events character attended
- PAST backstory involvement
- Creates shared history with other characters

**Character Puzzles** (relation to Puzzles): Puzzles specific to character
- Mechanical touchpoints
- Gameplay integration

### Rollups

**Owned Elem Types** (rollup from Owned Elements → Basic Type)
- Distribution: Memory Tokens, Props, Documents, Set Dressing counts
- Shows variety of element types

**Owner Tier** (rollup via Owner → Tier)
- For filtering and analysis

---

## Elements Database

### Core Fields

**Name** (title): Element identifier
- Format varies by type (e.g., "SAB001" for tokens, "Derek's Lab Notes")

**Basic Type** (select): Element category
- Options: Memory Token (Image/Audio/Video/Audio+Image), Prop, Document, Set Dressing, Physical, Container
- Determines gameplay interaction method

**Description/Text** (rich_text): **PRIMARY NARRATIVE FIELD**

**CRITICAL - DUAL CONTENT FOR TOKENS:**

For Memory Tokens specifically:
```
[Narrative content - readable story]
[Usually several paragraphs]

SF_MemoryType: [Technical/Business/Personal]
SF_ValueRating: [1-5]
SF_Group: [usually empty, or "Black Market Ransom"]
SF_Summary: [Dual-context summary, 1-2 sentences]
```

For ALL other element types (Props, Documents, Set Dressing):
- Pure narrative content
- NO SF_ fields

**ALL element types deliver narrative through Description/Text field!**

**Status** (status): Production status
- Tracks development progress

### Narrative Relationships (CRITICAL DISTINCTIONS)

**Owner** (relation to Characters): Whose POV/possession is this?
- Element belongs to this character
- Their personal perspective/evidence
- ONE owner per element
- **Example:** Derek owns Stanford graduation photo (Owner = Derek)

**Associated Characters** (rollup via Timeline Event → Characters Involved): Who's involved in backstory event this evidences?
- **DIFFERENT from Owner!**
- Shared timeline events create Associated Characters rollup
- Multiple associated characters possible
- **Example:** Stanford photo evidences 2015 Stanford graduation event with attendees Derek, Marcus, Diana, Sofia (Associated = all four)

**Timeline Event** (relation to Timeline): Which PAST backstory event does this evidence?
- Grounds element in history
- Creates Associated Characters rollup
- Links element to specific date and location

**Narrative Threads** (multi_select): Thematic arcs
- Options: Funding & Espionage, Marriage Troubles, Memory Drug, Underground Parties, Advanced Technology
- Element assigns to ONE thread (or none if unwired)
- Thread assignment is SEPARATE from narrative mentions

**Why This Distinction Matters:**
Complete coverage analysis requires checking BOTH:
1. Owned elements (character's POV/possession)
2. Associated elements (appearances in others' stories)

Character can have 0 owned elements but high associated presence (supporting role in others' stories).

### Puzzle/Gameplay Mechanics

**Required For (Puzzle)** (relation to Puzzles): Puzzles needing this as input
- Element must be discovered/solved to access puzzle

**Rewarded by (Puzzle)** (relation to Puzzles): Puzzles outputting this as reward
- Puzzle completion grants access to element

**Container** (relation to Elements): If element is inside container
- Nesting relationship

**Contents** (relation to Elements): If this IS container, what's inside
- Reverse of Container relation

**Container Puzzle** (relation to Puzzles): Container puzzle mechanics
- Puzzle that gates access to container's contents

**Puzzle Chain** (rollup): Chain of connected puzzles
- Calculated from puzzle relations

**Critical Path** (checkbox): On critical path for game completion?
- Flags essential elements

**First Available** (select): When element becomes accessible
- Options: Act 0 / Act 1 / Act 2 / Act 3
- Act 0 = Coat check phase

**Act Index** (formula): Calculated act number from First Available

**Container?** (formula): Calculated boolean for container status

### Production/Design

**Production/Puzzle Notes** (rich_text): Design notes
- NOT player-facing
- Development context and intent

**Owner Tier** (rollup via Owner → Tier): Character tier
- For filtering and analysis

**Content Link** (url): External content reference
- Links to source material

**Files & media** (files): Attached files
- Images, audio, etc.

---

## Timeline Database

### Core Fields

**Date** (date): Event date
- Format: YYYY-MM-DD
- Range: 2010-2025 (PAST events only)

**Event Name** (title): Short identifier
- Memorable event title

**Description** (rich_text): Event narrative
- What happened
- Why it matters
- Who was involved

**Location** (text): Where event occurred
- Venue or place name

**Characters Involved** (relation to Characters): Attendees
- Who was at this event
- Creates shared character history
- Powers Associated Characters rollup on Elements

### Relations

**Evidence** (relation to Elements): Elements that evidence this event
- Memory tokens, props, documents, photos
- Physical grounding for backstory

**Event Puzzles** (relation to Puzzles): Puzzles related to this event
- Gameplay integration

### Purpose

- Grounds element backstories in specific PAST events
- Creates Associated Characters rollup for elements
- Enables trust pair verification (shared events)
- Provides timeline structure for narrative

### Design Requirement

Token content should reference events that exist in Timeline. If event doesn't exist:
1. Create Timeline event first
2. Add all involved Characters
3. Link Element to Timeline event
4. Associated Characters rollup will populate automatically

---

## Puzzles Database

### Core Fields

**Name** (title): Puzzle identifier

**Type** (select): Puzzle category
- Options: Container, Logic, Sequence, Discovery, etc.
- Determines solving mechanic

**Contains Elements** (relation to Elements): Elements in/rewarded by puzzle
- Input/output elements

**Reward** (text): What solving puzzle unlocks
- Descriptive text of outcome

### Relations

**Parent Puzzle** (relation to Puzzles): If this is sub-puzzle
- Hierarchical structure

**Sub-Puzzles** (relation to Puzzles): Puzzles within this puzzle
- Nested puzzle structure

**Required Elements** (relation to Elements): Elements needed to solve
- Inputs

**Rewarded Elements** (relation to Elements): Elements granted on solving
- Outputs

### Rollups

**Narrative Threads** (rollup from Rewarded Elements → Narrative Threads)
- Puzzles inherit threads from reward elements
- No direct thread assignment on Puzzles

**Timeline Events** (rollup from Elements → Timeline Event)
- Backstory connections via element relations

### Purpose

- Organize physical elements spatially
- Create discovery moments
- Gate access to tokens and evidence
- Structure gameplay progression
- Reward chains link puzzles together

### Coat Check Phase

Most early puzzles (Act 0) contain props/documents, NOT tokens. See EARLY_GAME_SCAFFOLDING.md for non-token element importance.

---

## Rollup Logic & Calculations

### Element Rollups

**Associated Characters** (on Elements):
- Path: Element → Timeline Event → Timeline.Characters Involved
- Shows who's involved in element's backstory event
- Automatic calculation based on Timeline relations

**Element Count by Type** (on Characters):
- Count of Memory Tokens owned
- Count of Props owned
- Count of Documents owned
- Count of Set Dressing owned
- Calculated from Owned Elements → Basic Type

### Character Rollups

**Elements** (on Characters):
- All Elements where Character = Owner
- Shows character's owned content
- Direct relation, not calculated

**Associated Elements** (on Characters):
- All Elements where Character in Associated Characters rollup
- Shows appearances in others' stories
- Via Timeline Event connections

**Timeline Events** (on Characters):
- All Timeline Events where Character in Characters Involved
- Shows character's backstory presence
- Direct relation, not calculated

### Why Rollups Matter

- Enable cross-database queries without API calls
- Power coverage analysis tools
- Support relationship verification
- Calculate narrative presence metrics

### Rollup Limitations

Rollups update automatically but:
- May lag slightly after database changes
- Cannot be directly edited (edit source relations instead)
- Some complex queries still require API calls

---

## Orphan Detection Patterns

### Type A: Narrative Mentions Without Relations

**Pattern:** Element Description/Text mentions character name, but character NOT in Owner or Associated Characters

**Example:** Leila's character sheet says "Oliver is a fixed point" but Oliver not in her Associated Elements

**Confidence Factors:**
- Name appears in narrative text
- Name NOT in database relations
- Context suggests involvement
- Multiple mentions increase confidence

### Type B: Missing Timeline Evidence

**Pattern:** Character Overview documents relationship, but no timeline event + elements evidencing that history

**Example:** Character overview: "worked in crypto with Leila" but no timeline event showing this

**Confidence Factors:**
- Explicit relationship claim in character fields
- No corresponding Timeline Event
- No Elements evidencing the claim

### Type C: Thread Assignment Gaps

**Pattern:** Element has rich narrative about thread theme, but thread NOT in Narrative Threads field

**Example:** Token clearly about marriage dissolution but Marriage Troubles not in Narrative Threads multi-select

**Confidence Factors:**
- Content analysis matches thread patterns
- Keyword/theme matching
- Character connection to thread
- 94.6% of elements lack thread assignment (known data quality issue)

### Type D: Associated Character Gaps

**Pattern:** Timeline event exists with multiple Characters Involved, but elements evidencing that event don't have proper Associated Characters rollup

**Cause:** Usually database wiring issue - Element → Timeline Event relation not set

**Fix:** Link Element to proper Timeline Event, rollup will populate automatically

### Confidence Scoring

See ORPHAN_DETECTION_SPEC.md for multi-factor confidence scoring system (7 layers).

---

## Schema Validation

### Required Fields

**Characters:**
- Name (must include cluster prefix)
- Goal Cluster (must be JUSTICE/RECOVERY/COVERUP/PRAGMATIC)
- Tier (must be Core/Secondary/Tertiary)

**Elements:**
- Name
- Basic Type
- Description/Text (primary narrative field)

**Timeline:**
- Date (YYYY-MM-DD format)
- Event Name
- Characters Involved (at least one)

**Puzzles:**
- Name
- Type

### Field Constraints

**Goal Cluster:** Must be one of four options
**Tier:** Must be one of three options
**SF_MemoryType:** Must be Technical/Business/Personal (tokens only)
**SF_ValueRating:** Must be 1-5 integer (tokens only)
**SF_Group:** Usually empty, or "Black Market Ransom" (only 4 tokens)
**Date:** Must be valid date 2010-2025

### Validation Tool

Run `verify_actual_schemas.py` for schema verification and troubleshooting.

---

## Database Relationship Patterns

### Elements are CENTRAL

- Only database with Narrative Threads field
- Connects all other databases
- Timeline/Puzzles inherit threads via rollups
- Hub of narrative organization

### Timeline Events Ground Narrative

- PAST tense backstory only
- Create shared character history
- Evidenced by Elements (Memory/Evidence relation)
- NO direct thread assignment (inherits via Elements)

### Puzzles Gate Progression

- PRESENT tense mechanics
- Elements as inputs and outputs
- Hierarchical structure (Parent/Sub-Puzzles)
- Inherit threads via Rewards rollup
- NO type categorization field

### Characters Provide Context

- Tier determines activation priority
- Goal cluster determines motivation
- Narrative fields (Overview, Emotion, Primary Action) document design intent
- Owned vs Associated vs Mentions = complete presence calculation

---

## Assessment Frameworks

### Complete Character Analysis Requires

1. All narrative context fields (Logline, Overview, Emotion, Primary Action)
2. Owned Elements count AND types (not just count)
3. Associated Elements (appearances in others' stories)
4. Events count (backstory grounding)
5. Character Puzzles (mechanical touchpoints)
6. Tier-appropriate expectations

### Complete Element Analysis Requires

1. Owner vs Associated Characters distinction
2. Narrative content from Description/Text
3. SF_ field separation for tokens
4. Timeline Event connection (backstory grounding)
5. Puzzle connections (mechanical integration)
6. Thread assignment status

### Assessing Character "Completeness"

**WRONG Approach:** "Character has 4 elements, they're thin"

**RIGHT Approach:**
1. Check Tier (is 4 appropriate for this tier?)
2. Check element types (4 tokens vs 3 props + 1 token?)
3. Check narrative fields (complete Logline, Primary Action, etc?)
4. Check Owned Elements content (rich narrative in Description/Text?)
5. Check Associated Elements (appearances in others' stories?)
6. Check narrative mentions (orphan elements referencing them?)
7. THEN assess: Given tier, is total presence complete?

### Narrative Delivery Across Element Types

- **Memory Tokens:** Scannable, SF_ choice mechanics (Hold/Sell/Turn In)
- **Props:** Examinable, rich narrative in Description/Text
- **Documents:** Readable, full text content
- **Set Dressing:** Environmental narrative, context
- **Physical:** Object significance

**ALL TYPES DELIVER NARRATIVE** - not just tokens!

Thread with "0 tokens" might have 5 props + 3 documents = substantial story presence.

---

## Ludo-Narrative Coherence Checks

- Do character's elements align with their goal cluster?
- Does Primary Action have mechanical support (puzzles, elements)?
- Do trust pairs have shared timeline events + elements?
- Do SF_ fields (tokens) match narrative richness?
- Does element Type distribution support gameplay variety?

Use these checks when validating character completeness and token design.
