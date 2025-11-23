# About Last Night - Complete Workflows

This reference provides comprehensive workflow documentation for all common tasks. Use when you need detailed step-by-step guidance.

---

## Workflow 1: Thread Wiring (Existing Content)

### Overview

Assign narrative threads to unwired elements. Wire existing content BEFORE creating new content.

### When to Use

- Element exists but lacks thread assignment
- bird_eye_analysis shows threads with low token counts but character has unwired tokens
- After discovering rich narrative content without thread

### Prerequisites

- Character identified
- Token exists in database
- Token has narrative content in Description/Text

### Step-by-Step Process

**Step 1: Identify Unwired Content**

Tool: `character_element_coverage.py "[Character Name]"`

Output interpretation:
```
TOKENS: 2 total
- SAB001: No thread assigned ⚠️
- SAB002: No thread assigned ⚠️
```

This reveals unwired content that needs thread assignment.

**Step 2: Read Token Content**

Tool: `examine_token_content.py` OR direct Element database query

What to extract:
- Main narrative content
- Subject matter and themes
- Character perspectives mentioned
- Timeline grounding hints

Example:
```
Token: SAB002
Content: "Our marriage was supposed to be a partnership of equals, but somewhere along the way, Marcus stopped seeing me as a partner and started seeing me as an accessory to his ambitions..."
```

**Step 3: Match Content to Thread Patterns**

Reference: narrative-threads.md

Read sections:
- Thread Content Patterns (5 threads)
- Thread Assignment Decision Framework (5-step process)
- Character Database Hooks (character-thread connections)

Decision framework:
1. What story does this content tell?
2. Which thread's thematic question does it answer?
3. Does character have narrative connection to thread?
4. Does content exemplify thread patterns?
5. Are there competing thread assignments?

Example matching:
- Content theme: Marriage dissolution, partnership breakdown
- Thread question: "How did personal relationships fracture?" → Marriage Troubles
- Character connection: Sarah is central to Marriage Troubles thread
- Pattern match: Relationship conflict, personal stakes
- Decision: STRONG FIT for Marriage Troubles

**Step 4: Verify Goal Cluster Framing**

Reference: goal-clusters.md

Read sections:
- Character's goal cluster (JUSTICE/RECOVERY/COVERUP/PRAGMATIC)
- Content themes for cluster
- Voice and tone patterns
- Anti-patterns to avoid

Example verification:
- Sarah = PRAGMATIC cluster
- PRAGMATIC framing: Transactional relationships, disillusionment
- Check: Does token voice match PRAGMATIC patterns?
- Token voice: Partnership as transaction, calculated assessment
- Verdict: Voice matches PRAGMATIC cluster ✓

**Step 5: Validate Character-Thread Fit**

Reference: narrative-threads.md → Character Database Hooks section

Check:
- Does character's Overview field mention thread themes?
- Do character's timeline events ground in thread?
- Is character central/peripheral/irrelevant to thread?

Example validation:
- Thread: Marriage Troubles
- Character: Sarah
- Overview field: "Marcus's ex-wife, pragmatic businesswoman navigating divorce aftermath"
- Timeline events: Multiple marriage-related events
- Verdict: Central to thread ✓

**Step 6: Assign Thread**

Action: Update Element's Narrative Threads field in Notion

Double-check:
- Thread assignment aligns with content
- Cluster framing makes sense
- Character has narrative connection
- No better thread option

### Common Issues

**Issue:** Token fits multiple threads
**Solution:** Use goal cluster framing as tiebreaker. Same event → different threads depending on owner's cluster.

**Issue:** Token doesn't clearly fit any thread
**Solution:** May be legitimately ambiguous. Leave unassigned if no strong fit; revisit after more content wired.

**Issue:** Character seems disconnected from thread
**Solution:** Check Overview field and Timeline events. If truly disconnected, reassess thread assignment.

### Success Metrics

- Thread assignment feels thematically coherent
- Character has narrative grounding in thread
- Cluster framing aligns with content voice
- Thread coverage improves (tracked by bird_eye_analysis)

### Time Estimate

2-5 minutes per token once references loaded.

---

## Workflow 2: Content Gap Identification

### Overview

Identify genuinely missing content (not just unwired content). Always check for unwired content first.

### When to Use

- After wiring existing content
- When thread shows low coverage in bird_eye_analysis
- Planning new token creation

### Prerequisites

- Existing content already wired
- bird_eye_analysis run showing thread coverage
- Thread identified as potential gap

### Step-by-Step Process

**Step 1: System Overview**

Tool: `bird_eye_analysis_v2.py`

Output interpretation:
```
=== THREAD COVERAGE ===
Funding & Espionage: 7 elements (1 token, 4 props, 2 documents)
Marriage Troubles: 4 elements (0 tokens, 2 props, 2 documents) ⚠️
Memory Drug: 2 elements (0 tokens, 1 prop, 1 document) ⚠️
Advanced Technology: 1 element total ⚠️⚠️
```

Identify threads with "0 tokens" or very low total coverage.

**Step 2: Character-Thread Connection Check**

Reference: narrative-threads.md → Character Database Hooks

For each gap thread, identify which characters have narrative connections:
- Overview field mentions thread themes
- Timeline events relate to thread
- Character's cluster aligns with thread content

Example:
- Thread: Advanced Technology
- Connected characters: Oliver (medical research), Skyler (AI strategy), Howie (tech sage)
- All have Overview fields mentioning technical innovation

**Step 3: Check Character Coverage**

Tool: Run `character_element_coverage.py` for each connected character

Critical: Check ALL element types, not just tokens.

Example for Oliver:
```
TOKENS: 1 (medical formulations - ransom token)
PROPS: 2 (lab equipment)
DOCUMENTS: 0
SET DRESSING: 0
TOTAL: 3 elements
```

Assess:
- Do existing elements relate to thread?
- Is element type distribution appropriate?
- Does total coverage tell thread story?

**Step 4: Total Thread Presence Assessment**

Calculate TOTAL narrative presence:
- All tokens across all connected characters
- All props related to thread
- All documents related to thread
- All set dressing contextualizing thread

Example:
- Advanced Technology thread
- Oliver: 1 token (medical), 2 props (lab)
- Skyler: 0 tokens, 4 props (AI docs)
- Total: 1 token, 6 props
- Assessment: Substantial prop coverage, but players need tokens for choice moments

**Step 5: True Gap Determination**

Decision matrix:
- 0 tokens, <3 total elements → TRUE GAP (severely underdeveloped)
- 0 tokens, 3-6 total elements → Token gap (need 2-3 tokens for choices)
- 1-2 tokens, adequate props/docs → May be sufficient
- 3+ tokens, good prop/doc mix → Well-covered

Document gap with justification:
"Advanced Technology needs 2-3 tokens. Current: 1 token, 6 props. Tokens needed for player choice moments. Oliver, Skyler, Howie all connected to thread."

**Step 6: Prioritize Gap Filling**

Consider:
- Thread importance to overall narrative
- Number of connected characters
- Current total coverage
- Tier distribution of connected characters

High priority: 0-2 total elements, multiple Core characters connected
Medium priority: 3-6 elements, mix of tiers
Low priority: 7+ elements including some tokens

### Common Pitfalls

**Pitfall:** Counting only tokens, ignoring props/documents
**Reality:** Props and documents deliver narrative too
**Fix:** Always check character_element_coverage for ALL types

**Pitfall:** Assuming "0 tokens" means "create content immediately"
**Reality:** Might have substantial prop coverage telling complete story
**Fix:** Assess TOTAL narrative presence before deciding

**Pitfall:** Not checking if content is just unwired
**Reality:** Content might exist, just needs thread assignment
**Fix:** ALWAYS wire existing content before creating new

### Success Metrics

- True gaps identified with justification
- Total narrative presence assessed (not just tokens)
- Character-thread connections verified
- Creation priority established

### Time Estimate

15-30 minutes for comprehensive gap analysis across all threads.

---

## Workflow 3: Token Design (New Content)

### Overview

Design new token following established patterns. Only after confirming true content gap exists.

### When to Use

- True content gap identified via Workflow 2
- Character-thread connection verified
- Ready to create new narrative content

### Prerequisites

- Gap justification documented
- Character selected for token ownership
- Character's tier, cluster, timeline events known

### Step-by-Step Process

**Step 1: Gather Character Context**

Tool: `token_design_context_generator.py "[Character Name]"`

Output provides:
- Character narrative fields (Logline, Overview, Emotion, Primary Action)
- Tier and goal cluster
- Existing tokens owned
- Timeline events character is involved in
- Trust pairs
- Thread candidates based on character connections

Review all context before designing.

**Step 2: Read Goal Cluster Reference**

Reference: goal-clusters.md for character's cluster

Read sections:
- Cluster overview and mantra
- Content themes for cluster
- SF_ field patterns for cluster
- Voice and tone guidance
- Anti-patterns (8 comprehensive patterns)

Example for PRAGMATIC cluster:
- Mantra: "The past is only worth what you make of it..."
- Themes: Transactional relationships, opportunistic leverage
- Voice: Calculated, not sentimental
- Anti-pattern: Avoid nostalgic or emotional attachment tones

**Step 3: Design Narrative Content**

Write token narrative that:
- Supports character's Primary Action
- Matches Emotion towards CEO voice
- Grounds in timeline events
- Exemplifies Logline essence
- Aligns with goal cluster framing

Structure:
```
[Opening paragraph - set scene/context]
[Middle paragraphs - develop narrative, reveal information]
[Closing - emotional beat or decision point]

SF_MemoryType: [Technical/Business/Personal]
SF_ValueRating: [1-5]
SF_Group: [usually empty]
SF_Summary: [1-2 sentence dual-context summary]
```

**Step 4: Assign Narrative Thread**

Reference: narrative-threads.md

Apply thread assignment decision framework:
1. What story does content tell?
2. Which thread's thematic question does it answer?
3. Character-thread connection verified?
4. Content exemplifies thread patterns?
5. Any competing assignments?

Match content to ONE thread.

**Step 5: Set SF_ Fields**

Reference: sf-mechanics.md

**SF_MemoryType** - Content categorization:
- Technical: System specifications, formulations, technical knowledge
- Business: Professional relationships, deals, partnerships
- Personal: Emotional moments, relationships, private experiences

Decision tree in sf-mechanics.md guides selection.

**SF_ValueRating** - Narrative stakes (1-5):
- 1-2: Minor personal moments, background context
- 3: Significant information, meaningful relationships
- 4: High-stakes revelations, identity-defining moments
- 5: Game-changing information, ransom tokens only

Justify rating with narrative stakes. See sf-mechanics.md rating scale.

**SF_Group** - Special collection:
- Usually EMPTY
- "Black Market Ransom" ONLY for 4 specific tokens
- Do not invent new group names

**SF_Summary** - Dual-context summary:
- Must work as private scanner view (player decision support)
- Must work as public detective log (case evidence)
- 1-2 sentences maximum
- Specific enough to inform choice
- Preserves discovery (doesn't spoil full content)

See sf-mechanics.md for dual-context writing patterns and examples.

**Step 6: Validate Cross-Field Coherence**

Checklist:
- ✓ SF_MemoryType matches content (Technical/Business/Personal)
- ✓ SF_ValueRating justified by narrative stakes
- ✓ SF_Summary works in both contexts
- ✓ Cluster framing aligns with voice
- ✓ Thread assignment fits content
- ✓ Timeline grounding present
- ✓ Character's Primary Action supported

Review goal-clusters.md cluster-specific SF_ field patterns section.

### Common Pitfalls

**Pitfall:** Wrong MemoryType for content
**Example:** Technical research assigned "Personal" because "character personally did research"
**Fix:** SF_MemoryType categorizes CONTENT, not ownership. Technical = systems/specs.

**Pitfall:** ValueRating without justification
**Example:** Rating 5 assigned to minor moment
**Fix:** High ratings rare and justified. Most tokens 2-4. Check rating scale.

**Pitfall:** Single-context SF_Summary
**Example:** "Smoking gun that will bring down Marcus" (only Detective context)
**Fix:** Write for BOTH contexts. Provide info without moral judgment.

**Pitfall:** Cluster voice mismatch
**Example:** PRAGMATIC character with sentimental, emotional tone
**Fix:** PRAGMATIC isn't sentimental. Voice should be calculated, transactional.

**Pitfall:** No timeline grounding
**Example:** Token about event that doesn't exist in Timeline
**Fix:** Create Timeline event first, then reference it in token.

### Success Metrics

- Token supports character's Primary Action
- Voice matches character's Emotion and cluster
- Content grounds in timeline events
- Thread assignment feels right
- SF_ fields all validated and coherent
- Dual-context SF_Summary works

### Time Estimate

30-60 minutes per token including research and validation.

---

## Workflow 4: SF_ Field Validation

### Overview

Validate existing token's SF_ fields for coherence and proper function.

### When to Use

- Reviewing existing token
- Token seems misaligned with character/cluster
- SF_ fields feel arbitrary or unjustified
- Before finalizing token for production

### Prerequisites

- Token exists with SF_ fields
- Token narrative content readable
- Character context known

### Step-by-Step Process

**Step 1: Read Complete Token**

Get full Description/Text content including SF_ fields.

Parse structure:
```
[Narrative content]

SF_MemoryType: [value]
SF_ValueRating: [value]
SF_Group: [value or empty]
SF_Summary: [text]
```

**Step 2: Validate SF_MemoryType**

Reference: sf-mechanics.md → SF_MemoryType validation decision trees

Questions:
- Is content about systems/specs/technical knowledge? → Technical
- Is content about professional relationships/deals/partnerships? → Business
- Is content about emotional moments/relationships/private experiences? → Personal

Common errors:
- Technical content marked Personal (ownership confusion)
- Business content marked Personal (emotional tone ≠ Personal type)
- Personal content marked Business (professional context ≠ Business type)

Validation:
Read content carefully. What IS the content ABOUT? Apply decision tree.

**Step 3: Validate SF_ValueRating**

Reference: sf-mechanics.md → SF_ValueRating scale

Rating scale:
- 1: Trivial, background flavor
- 2: Minor personal moments, context-setting
- 3: Significant information, meaningful relationships
- 4: High-stakes revelations, identity-defining
- 5: Game-changing, ransom tokens ONLY

Check narrative justification:
- Would Blake pay this much (if 4-5)?
- Would Detective want this (if 3-5)?
- Is it identity-defining (if 4-5)?
- Does narrative support rating?

Healthy distribution: 5-10% rating 5, 40-50% rating 3, rest 1-2 or 4.

**Step 4: Validate SF_Summary Dual-Context**

Reference: sf-mechanics.md → SF_Summary dual-context writing patterns

Context 1 test (Private Scanner - Player Decision):
- Does it provide context for choice?
- Is it specific enough to inform Hold/Sell/Turn In decision?
- Does it preserve discovery (not spoil full content)?

Context 2 test (Public Detective Log - Case Evidence):
- Does it work as evidence statement?
- Can Detective use this to build case?
- Is tone appropriate for public display?

Length check:
- 1-2 sentences maximum
- Fits scanner interface

Tone check:
- Matches SF_MemoryType (Technical = technical tone, Personal = personal tone)
- Aligns with cluster (PRAGMATIC = calculated, JUSTICE = accountability)

**Step 5: Check SF_Group**

Validation:
- Is this one of the 4 Black Market Ransom tokens?
  - Oliver's medical formulations
  - James's secret laboratory
  - Howie's lecture notes
  - Leila's algorithms
- If YES: SF_Group = "Black Market Ransom"
- If NO: SF_Group should be EMPTY

Error: Any other SF_Group value is wrong.

**Step 6: Validate Cross-Field Coherence**

Reference: goal-clusters.md → cluster-specific SF_ field patterns

Questions:
- Do all SF_ fields align with each other?
- Does cluster framing make sense given SF_ values?
- Does thread assignment fit SF_MemoryType and content?
- Is timeline grounding present?

Example coherence check:
- Token: Oliver's medical formulations
- MemoryType: Technical ✓ (system specifications)
- ValueRating: 5 ✓ (Blake ransom, dangerous research)
- Group: "Black Market Ransom" ✓ (one of 4 tokens)
- Summary: "Oliver's medical formulation specifications" ✓ (neutral, technical)
- Cluster: COVERUP ✓ (dangerous secrets worth hiding)
- Thread: Could be Advanced Technology or Memory Drug ✓

### Common Issues

**Issue:** MemoryType doesn't match content
**Solution:** Re-read content. What is it ABOUT? Apply decision tree.

**Issue:** ValueRating too high for narrative stakes
**Solution:** Lower rating. Check if narrative truly justifies high stakes.

**Issue:** SF_Summary only works in one context
**Solution:** Rewrite for dual context. See sf-mechanics.md patterns.

**Issue:** SF_Group has unexpected value
**Solution:** Should be empty unless it's one of 4 ransom tokens.

### Success Metrics

- SF_MemoryType matches content type
- SF_ValueRating justified by narrative stakes
- SF_Summary works in both contexts
- SF_Group correct (empty or "Black Market Ransom")
- Cross-field coherence validated
- Cluster alignment confirmed

### Time Estimate

10-15 minutes per token validation.

---

## Workflow 5: Relationship and Evidence Validation

### Overview

Verify character sheet claims have database grounding in timeline events and elements.

### When to Use

- Auditing character scaffolding
- Character feels arbitrary or ungrounded
- Trust pair seems unsupported
- Checking if backstory claims are discoverable through gameplay

### Prerequisites

- Character identified
- Access to character sheets in Google Drive
- Timeline events exist in database

### Step-by-Step Process

**Step 1: Run Background Cross-Reference Tool**

Tool: `character_background_cross_reference.py "[Character Name]"`

Output provides:
- Character tier and goal cluster
- All timeline events character is involved in
- Event descriptions, dates, other characters
- Evidence element counts per event

**Step 2: Fetch Character Sheet**

Tool: `google_drive_fetch` with character sheets document ID

Document ID: 1_5G8uAWHLPWGHDwtdrPqv1A5bBjMhXNpCUBABmwLNts

Find character's section in document.

**Step 3: Extract Claims from Character Sheet**

Read character section and extract:

1. **Logline** - Core identity statement
2. **Memory Inventory** - Backstory facts, relationship mentions, events
3. **Trust Pairs** - "You know you can trust [name]"
4. **Emotional Context** - Feelings about Marcus/others
5. **Goal Cluster Mantra** - Last bullet before birthday

**Step 4: Compare Claims to Timeline Events**

For each claim, check if matching timeline event exists:

Relationship claims:
- Sheet: "Marcus tried to burn Ashe's career"
- Timeline: ✓ Event #4 "Ashe's Expose is buried" + Event #5 "Ashe is fired"
- Assessment: WELL-GROUNDED

Backstory claims:
- Sheet: "Covers silicon valley beat"
- Timeline: ✓ Event #1 "SVBJ assigns Ashe the AIBioComp story"
- Assessment: GROUNDED

Trust pairs (use separate workflow):
- Sheet: "You know you can trust Alex Reeves"
- Tool: `trust_pair_verification.py "E - Ashe Motoko" "E - Alex Reeves"`
- Check: Shared timeline events?

**Step 5: Identify Ungrounded Claims**

Document claims that lack timeline evidence:

Format:
```
Ungrounded Claims for [Character]:
1. [Claim from sheet] - NO timeline event
2. [Claim from sheet] - NO timeline event
```

**Step 6: Decision Points**

For each ungrounded claim:
- **Create timeline event** - Add event with Characters Involved
- **Create elements** - Add evidence (tokens, props, documents)
- **Revise character sheet** - Remove claim if not core to character
- **Accept gap** - Intentional narrative gap (rare)

### Trust Pair Verification Sub-Workflow

Tool: `trust_pair_verification.py "Character 1" "Character 2"`

Output shows:
- Shared timeline events
- Dates and descriptions
- Other characters at events
- Evidence counts

Assessment:
- 2+ shared events = STRONG grounding
- 1 shared event = MODERATE grounding
- 0 shared events = UNGROUNDED (create events)

### Common Issues

**Issue:** Character sheet mentions relationship but no timeline events
**Solution:** Create timeline event with both characters in Characters Involved

**Issue:** Timeline event exists but no elements evidence it
**Solution:** Create props/documents/tokens that reference the event

**Issue:** Trust pair ungrounded
**Solution:** Create 1-2 shared timeline events establishing relationship

### Success Metrics

- All character sheet claims have timeline grounding
- Trust pairs have 1+ shared events
- Timeline events have element evidence
- Character feels grounded and discoverable

### Time Estimate

20-30 minutes per character for complete validation.

---

## Common Pitfalls and Anti-Patterns

### Pitfall 1: Assuming Content Gaps Without Checking Wiring

**What Goes Wrong:**
bird_eye_analysis shows "Marriage Troubles: 0 tokens" → immediate conclusion "need to create tokens"

**The Reality:**
Sarah owns 2 tokens, they're just unwired. 94.6% of tokens lack thread assignments.

**Root Cause:**
Jumping to content creation without checking existing content coverage.

**The Fix:**
ALWAYS run character_element_coverage.py before assuming content gaps. Wire existing content FIRST.

**Workflow:**
1. See gap in bird_eye_analysis
2. Identify characters connected to thread
3. Run character_element_coverage for each
4. Check for unwired tokens matching thread
5. Wire existing content
6. THEN assess remaining gap

**Time Saved:**
Wiring takes 2-5 minutes. Content creation takes 30-60 minutes. Wire first.

### Pitfall 2: Ignoring Non-Token Elements

**What Goes Wrong:**
Analyzing only memory tokens, missing props/documents/set dressing that tell substantial story.

**The Reality:**
ALL element types deliver narrative. Thread with "0 tokens" might have 5 props + 3 documents = substantial story presence.

**Root Cause:**
Assuming only tokens matter because they have game mechanics.

**The Fix:**
Check ALL element types in coverage analysis. Use character_element_coverage.py which shows complete picture.

**Assessment Framework:**
- 0 tokens, 0 other elements = TRUE GAP
- 0 tokens, 5+ props/docs = Token gap only (need choice moments)
- 2+ tokens, adequate props = Well-covered

### Pitfall 3: Wrong MemoryType for Content

**What Goes Wrong:**
Token about technical research assigned "Personal" because "Oliver personally did the research."

**The Reality:**
SF_MemoryType categorizes CONTENT, not ownership. Technical means system/specification content.

**Root Cause:**
Confusing who owns element with what element contains.

**The Fix:**
Read sf-mechanics.md MemoryType validation decision tree. Ask: What is this content ABOUT?

**Examples:**
- Oliver's medical formulations → Technical (system specs)
- Alex/Marcus partnership tension → Business (professional relationship)
- Sarah/Marcus marriage arguments → Personal (emotional/interpersonal)

### Pitfall 4: Single-Context SF_Summary

**What Goes Wrong:**
SF_Summary written only for Detective context: "Smoking gun that will bring down Marcus"

**The Reality:**
Must work for BOTH Detective's public scoreboard AND player's private scanner. Single-context summary removes player choice.

**Root Cause:**
Not considering dual display contexts for SF_Summary.

**The Fix:**
Write SF_Summary using dual-context patterns from sf-mechanics.md. Provide context without dictating moral judgment.

**Good Example:**
"Marcus's financial dealings with Leila's blockchain network" - works both as decision support and public evidence

**Bad Example:**
"Proof that Marcus is a criminal" - only works as Detective evidence, removes player agency

### Pitfall 5: Cluster Framing Mismatch

**What Goes Wrong:**
Token content doesn't align with owner's goal cluster framing.

**Example:**
Sarah (PRAGMATIC) token with sentimental, emotional voice about friendship and loyalty.

**The Reality:**
PRAGMATIC characters aren't sentimental. Voice should be transactional even for relationships.

**Root Cause:**
Not reading goal-clusters.md for character's cluster before writing.

**The Fix:**
Read goal-clusters.md for owner's cluster. Match voice and framing to cluster patterns. Check 8 anti-patterns section.

**Cluster Voice Guide:**
- JUSTICE: Accountability-focused, evidence-gathering, moral clarity
- RECOVERY: Reclamation-focused, personal stakes, community-oriented
- COVERUP: Protection-focused, danger-aware, secret-keeping
- PRAGMATIC: Transaction-focused, calculated, commodity-minded

### Pitfall 6: ValueRating Without Justification

**What Goes Wrong:**
Assigning ValueRating 5 to minor personal moment without narrative justification.

**The Reality:**
ValueRating should match stakes. High ratings rare and justified. Most tokens 2-4.

**Root Cause:**
Not understanding rating scale or inflating importance.

**The Fix:**
Use sf-mechanics.md rating scale. Rating 5 requires game-changing significance or ransom status. Check healthy distribution (5-10% rating 5, 40-50% rating 3).

**Rating Guidelines:**
- 5: Ransom tokens ONLY (4 total in entire game)
- 4: Identity-defining, high-stakes revelations (rare, <15%)
- 3: Significant information, meaningful relationships (most common, 40-50%)
- 2: Minor moments, context-setting (30-40%)
- 1: Trivial, background flavor (5-10%)

### Pitfall 7: Creating Tokens Without Timeline Grounding

**What Goes Wrong:**
Token about event that doesn't exist in Timeline database.

**The Reality:**
Breaks narrative consistency, creates orphan content, can't cross-reference.

**Root Cause:**
Writing token without checking Timeline first.

**The Fix:**
ALWAYS check Timeline for grounding event. If event doesn't exist:
1. Create Timeline event first
2. Add all involved Characters to event's Characters Involved
3. Then create token referencing the event
4. Link token to Timeline event
5. Associated Characters rollup will populate automatically

**Verification:**
Other characters mentioned in token narrative should be in Timeline event's Characters Involved.

---

## Decision Trees

### "Should I Create New Content?" Decision Tree

```
Start: Identified thread with low token count

├─ Have you run character_element_coverage for all connected characters?
│  ├─ No → Run character_element_coverage first [STOP]
│  └─ Yes → Continue
│
├─ Are there unwired tokens that match this thread?
│  ├─ Yes → Wire existing tokens first, reassess gap after [STOP]
│  └─ No → Continue
│
├─ What's the TOTAL element count for thread (all types)?
│  ├─ 0-2 total elements → TRUE GAP → Continue
│  ├─ 3-5 total elements → Check element type distribution
│  │  ├─ All props/documents → May need tokens for choice moments
│  │  └─ Mix with some tokens → May be sufficient [STOP]
│  └─ 6+ total elements → Probably sufficient coverage [STOP]
│
├─ Do characters have strong narrative connections to thread?
│  ├─ Check Overview fields for thread themes
│  ├─ Check Timeline events for thread grounding
│  └─ If weak connections → Not priority for content creation [STOP]
│
└─ Decision
   ├─ TRUE CONTENT GAP → Create 2-3 tokens
   └─ SUFFICIENT COVERAGE → Focus elsewhere
```

### "Which Thread Should This Token Have?" Decision Tree

```
Start: Token with content, needs thread assignment

├─ Read token narrative content completely
│
├─ Which thread's thematic question does content answer?
│  ├─ "How did business conflicts escalate?" → Funding & Espionage
│  ├─ "How did relationships fracture?" → Marriage Troubles
│  ├─ "What was the memory drug?" → Memory Drug
│  ├─ "What was the party scene?" → Underground Parties
│  ├─ "What technical innovations drove story?" → Advanced Technology
│  └─ Multiple possible → Continue to tiebreakers
│
├─ Tiebreaker 1: Character's Goal Cluster
│  └─ Same event can be different threads depending on cluster framing
│     Example: Tech research
│     - JUSTICE character → Might be Funding & Espionage (corporate competition)
│     - COVERUP character → Might be Advanced Technology (dangerous innovation)
│
├─ Tiebreaker 2: Character Database Hooks
│  └─ Does character's Overview field connect more strongly to one thread?
│
├─ Tiebreaker 3: Thread Coverage Needs
│  └─ If one thread has 0 tokens and other has 5, prioritize the gap
│
└─ Decision
   ├─ Clear single thread → Assign that thread
   ├─ Ambiguous → Consult narrative-threads.md patterns
   └─ No strong fit → Leave unassigned, revisit later
```

### "Is This SF_MemoryType Correct?" Decision Tree

```
Start: Token with SF_MemoryType assigned

├─ Read token narrative content (ignore SF_ fields for now)
│
├─ What IS the content ABOUT? (not who owns it)
│  ├─ System specifications, technical knowledge, formulations?
│  │  └─ Should be: Technical
│  ├─ Professional relationships, deals, partnerships, corporate info?
│  │  └─ Should be: Business
│  ├─ Emotional moments, personal relationships, private experiences?
│  │  └─ Should be: Personal
│  └─ Multiple aspects → Continue to primary content check
│
├─ What's the PRIMARY content focus?
│  └─ Example: Oliver's research about memory drug
│     - Contains: Technical specs (system) + Business context (corporate) + Personal stakes (ethics)
│     - Primary: Technical specifications
│     - Secondary aspects don't change type
│     - Answer: Technical
│
├─ Common Confusions to Avoid:
│  ├─ "Character personally did this" ≠ Personal type
│  ├─ "Emotional tone about business" ≠ Personal type (Business with emotion)
│  ├─ "Technical work in business context" ≠ Business type (Technical with context)
│  └─ Ask: Strip away context - what's the CONTENT?
│
└─ Decision
   ├─ MemoryType matches primary content → Correct ✓
   └─ MemoryType doesn't match → Change to match content
```
## Thread Consolidation Workflow

**Goal:** Consolidate minor threads into core threads for cleaner narrative structure.

**When to Use:** When you have threads with very few elements (1-3) that could be merged into larger threads, or when simplifying the thread structure.

### Steps

1. **Identify threads to consolidate**
   ```bash
   python3 bird_eye_analysis_v2.py
   ```
   Look for threads with few elements (typically <5)

2. **Examine content in minor threads**
   ```bash
   python3 thread_detail_analysis.py "Thread1,Thread2,Thread3"
   ```
   Review each element to understand its content and determine appropriate reassignment

3. **Decide reassignments**
   For each element, determine which core thread best fits:
   - Match thematic content (party content → Underground Parties)
   - Match investigation focus (corporate intrigue → Funding & Espionage)
   - Match character connections (check narrative-threads.md)

4. **Create batch wiring CSV**
   ```csv
   element_name,new_thread
   "Element 1","Core Thread A"
   "Element 2","Core Thread B"
   "Element 3","Core Thread A"
   ```
   Use token codes or partial names for reliable matching

5. **Execute consolidation**
   ```bash
   python3 batch_wire_elements.py consolidation.csv
   ```
   Review output for any failures

6. **Handle failures**
   For any "Element not found" errors:
   ```bash
   python3 wire_element.py "Shorter Name" "Thread Name"
   ```
   Use simpler search terms

7. **Verify consolidation**
   ```bash
   python3 bird_eye_analysis_v2.py
   ```
   Confirm minor threads are empty and core threads have increased element counts

### Example

**Before consolidation:**
- Funding & Espionage: 19 elements
- Class Conflicts: 2 elements
- Investigative Journalism: 2 elements
- The Senate Testimony: 1 element

**After consolidation:**
- Funding & Espionage: 22 elements
- Underground Parties: 7 elements
- (3 minor threads eliminated)

### Common Patterns

**Party-related content** → Underground Parties
- Memories at parties (check timestamps)
- Party observations
- Social dynamics at events

**Corporate/political content** → Funding & Espionage
- Investigation of companies
- Political maneuvering
- Financial intrigue
- Senate testimony

**Technology ethics** → Advanced Technology or Funding & Espionage
- If focus is on tech itself → Advanced Technology
- If focus is corporate use/investigation → Funding & Espionage

### Validation

After consolidation:
- All elements should have valid thread assignments
- No threads should have <3 elements
- Thread names should be consistent across database
- Character-thread connections should still be valid (check narrative-threads.md)

---
