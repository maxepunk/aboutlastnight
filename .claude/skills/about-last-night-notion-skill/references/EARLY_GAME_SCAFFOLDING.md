# Early Game Scaffolding - Information Architecture for Player Onboarding

## The Core Design Challenge

Players start with amnesia but need to make **meaningful, non-arbitrary choices** about their character while preserving the **sense of discovery** and evolving understanding.

**The Delicate Balance:**
- **Too little scaffolding** → Players feel lost, make arbitrary decisions
- **Too much frontloading** → Destroys discovery, overwhelming info dump

**Design Goal:** Progressive revelation that grounds identity while maintaining mystery.

---

## The Scaffolding Phase: Act 0 → Early Act 1

### Act 0: Structured Onboarding (Most "On Rails")

**What Players Receive:**

1. **Character Sheet** (Google Drive source of truth)
   - Baseline identity: Name, role, logline
   - Goal cluster context: JUSTICE/RECOVERY/COVERUP/PRAGMATIC
   - Trust pairs: "You know you can trust [names]"
   - Emotional state: Relationship to Marcus/CEO
   - Birthdates, key beats

2. **Coat Check Items** (First Available = Act 0)
   - Initial physical evidence about past
   - Owned by Core tier characters (5 playable)
   - Connected via Character Puzzles relation

3. **Coat Check Puzzle**
   - Gating mechanism for locked contents
   - IF solved → deeper context unlocked
   - IF not solved → player proceeds with surface-level items only

**Database Properties Involved:**
- Owner Tier = Core (these 5 characters get coat check distribution)
- First Available = Act 0 (immediately accessible)
- Character Puzzles relation (coat check puzzle per character)
- Container relation (coat check items may have locked contents)
- Puzzle Chain rollup (shows which puzzle unlocks container)

---

## Critical Insight: Coat Check Elements Are Mostly Non-Memory-Tokens

**Pattern Discovered:** Coat check puzzles operate almost exclusively using non-token elements (props, documents).

**Why This Matters:**

### Memory Tokens = SF_ Choice Pressure
- Hold/Sell/Expose decision required
- Blake's auction mechanics engaged
- Introduces economic/moral stakes
- Requires understanding of value and consequences

### Props/Documents = Narrative Context WITHOUT Choice Pressure
- Readable, examinable evidence
- Build understanding of character's past
- No immediate mechanical decision required
- Scaffolds identity before introducing stakes

**Design Implication:**
**Delay token introduction until players have narrative grounding.**

---

## Information Architecture Layers

### Layer 1: Character Sheet (Immediate, Complete)
**What It Provides:**
- Core identity (who you are)
- Motivational context (goal cluster)
- Social network (trust pairs)
- Emotional baseline (feelings about Marcus)

**Design Questions:**
- Does sheet provide enough context to make team choice (Blake vs Detective)?
- Are trust pairs actionable (can players find those characters)?
- Does goal cluster mantra guide interpretation of discoveries?

---

### Layer 2: Coat Check Items (Act 0, Surface Level)
**What They Provide:**
- Physical evidence about past (props/documents primarily)
- Narrative grounding for sheet claims
- Discoverable text/examination content
- Setup for Act 1 puzzle chains

**Database Evaluation:**
```
For each Core character's coat check items:
1. Query Elements where:
   - Owner = character
   - First Available = Act 0
   - Character Puzzles relation exists

2. Check Basic Type distribution:
   - Prop count (physical examination)
   - Document count (readable text)
   - Memory Token count (should be LOW/zero at surface level)

3. Evaluate narrative coherence:
   - Do items reflect character sheet context?
   - Do items mention trust pairs?
   - Do items ground goal cluster motivation?

4. Check volume:
   - Enough to provide context (not just 1 item)
   - Not overwhelming (not 10+ items to process)
   - Typical: 3-5 items per character?
```

**Design Questions:**
- Does each Core character get sufficient coat check items?
- Is the Basic Type distribution appropriate (prop/document heavy)?
- Do items coherently relate to character sheet narrative?
- Is the information load manageable (not overwhelming)?

---

### Layer 3: Coat Check Puzzle Solution (Act 0/1, Conditional Depth)
**What It Unlocks:**
- Locked contents of coat check containers
- Deeper narrative context
- Potentially first memory tokens (delayed choice introduction)

**The Conditional Branch:**
- **IF solved**: Player gets deeper context, possibly tokens
- **IF not solved**: Player proceeds with surface-level only
- This creates skill-based progression in onboarding

**Database Evaluation:**
```
For each Core character's coat check puzzle:
1. Query Puzzle where:
   - Character Puzzles relation = character

2. Check Locked Item:
   - Which element is the container?
   - Puzzle Chain rollup confirms puzzle unlocks it

3. Check container Contents relation:
   - What's inside the locked container?
   - Basic Type of locked contents:
     → Still props/documents? (extends discovery)
     → Memory tokens? (introduces choice mechanics)

4. Evaluate reward appropriateness:
   - Does solving puzzle feel worthwhile?
   - Is locked content narratively deeper than surface?
   - If tokens inside, is player ready for that decision?
```

**Design Questions:**
- Do coat check puzzle solutions provide meaningful reward?
- Is the difficulty appropriate for onboarding phase?
- If tokens are inside, has player had enough grounding?
- Does locked content deepen understanding or just add choice pressure?

---

### Layer 4: Team Creation (Act 0, First Social Choice)
**What It Requires:**
- Understanding of Blake vs Detective framing
- Some sense of character's moral alignment
- Social negotiation with other players

**Scaffolding Needed:**
- Character sheet provides goal cluster (hints at alignment)
- Coat check items may contain evidence of Marcus's actions
- Script tutorializes the stakes of this choice

**Design Questions:**
- Do Core characters have enough context to make non-arbitrary team choice?
- Does evidence in coat check items inform Blake/Detective decision?
- Can players articulate WHY their character would choose each side?

---

### Layer 5: Token Introduction & Tutorialization (Act 1, Choice Mechanics)
**When Tokens Enter Play:**
- Later in coat check puzzle solutions? (locked contents)
- Act 1 puzzle rewards? (after some exploration)
- Environmental discovery in Act 1?

**The Tutorialization Moment:**
- Script demonstrates Hold/Sell/Expose mechanics
- Players learn SF_ field meanings
- Blake's auction context introduced
- Economic/moral stakes clarified

**Database Evaluation:**
```
Check First Available distribution for Memory Tokens:
1. Count tokens with First Available = Act 0
   - Should be minimal (delayed introduction)
   
2. Count tokens with First Available = Act 1
   - Ramp-up of choice opportunities
   
3. Check Owner Tier of early tokens:
   - Core tier tokens = encountered by active players
   - Should have clear narrative context

4. Evaluate SF_ field alignment:
   - SF_MemoryType matches content?
   - SF_ValueRating appropriate for stakes?
   - SF_Summary provides context for decision?
```

**Design Questions:**
- Is token introduction paced appropriately?
- Do early tokens have strong narrative grounding?
- Are SF_ fields clear enough for first-time choice?
- Does tutorialization happen at right moment?

---

## Scaffolding Evaluation Framework

When analyzing a Core character's readiness for gameplay, check:

### 1. Character Sheet Narrative Richness
- Clear logline and role
- Goal cluster with actionable mantra
- Trust pairs listed (can players find these characters?)
- Emotional baseline about Marcus
- Sufficient context for team choice

### 2. Coat Check Items Type Distribution
**Query:** Elements where Owner = character AND First Available = Act 0

**Ideal Distribution:**
- Majority props/documents (4-6 items)
- Minimal/zero memory tokens at surface level (0-1)
- Narrative coherence with character sheet
- Manageable volume (not overwhelming)

**Red Flags:**
- Token-heavy coat check (too much choice pressure too early)
- Single item only (insufficient context)
- 10+ items (overwhelming)
- No connection to character sheet narrative

### 3. Coat Check → Locked Contents Progression
**Query:** Character Puzzles → Locked Item → Contents

**Evaluate:**
- Does solving puzzle reward appropriately?
- Are locked contents narratively deeper?
- If tokens inside, is it after sufficient grounding?
- Is puzzle difficulty appropriate for onboarding?

**Progression Options:**
- Prop → More props (extends discovery, no choice pressure)
- Prop → Documents (readable depth, still no tokens)
- Prop → Token (introduces choice IF player has grounding)

### 4. Total Act 0 Elements Available
**Query:** Elements where First Available = Act 0

**Count:**
- Surface coat check items
- Locked contents IF puzzle solved
- Environmental Act 0 elements

**Evaluate:**
- Not so few players feel lost (minimum 3-5 items per Core character)
- Not so many players feel overwhelmed (maximum ~8 items including locked?)

### 5. Character Sheet ↔ Discoverable Evidence Coherence
**Cross-reference:**
- Trust pairs in sheet → Do elements mention these characters?
- Goal cluster motivation → Do elements ground this motivation?
- Backstory claims → Are there timeline events evidencing this?
- Emotional state → Do elements explain these feelings?

**Design Goal:** Players can connect their sheet to their items (identity coherence).

---

## Secondary/Tertiary Character Scaffolding

**Different Stakes:**
- Secondary active at 15+ players
- Tertiary active at 20 players (full game)

**Scaffolding Considerations:**

### Secondary Characters (8 total)
- May not all get coat check items (not enough slots)
- Should have clear Act 1 discovery paths
- Character sheet still provides baseline
- Puzzle rewards can introduce them gradually

**Design Questions:**
- If no coat check, how do players discover Secondary characters?
- Do puzzle rewards in Act 1 provide their context?
- Is the delay in introduction narratively justified?

### Tertiary Characters (7 total)
- Rarely in coat check
- Minimal Act 0/1 presence
- Main presence in Act 2 (full game)
- **Exception**: Blake's ransom tokens (mechanically critical)

**Design Questions:**
- Do Tertiary characters have clear discovery paths despite late entry?
- Are Blake's ransom token owners findable despite Tertiary tier?
- Is late introduction acceptable given full game context?

**Key Insight:** Core tier scaffolding is most critical since these 5 are always active.

---

## Design Levers for Scaffolding

### 1. Basic Type Distribution (Coat Check)
**Control:** Ratio of props/documents vs memory tokens
**Effect:** Delays choice pressure, prioritizes narrative grounding

### 2. First Available Timing (Token Introduction)
**Control:** When memory tokens become accessible
**Effect:** Controls when players face Hold/Sell/Expose decisions

### 3. Container → Locked Contents (Progression)
**Control:** What's inside coat check puzzles
**Effect:** Skill-based progression in narrative depth

### 4. Character Sheet Narrative Richness
**Control:** Detail in Overview, trust pairs, context
**Effect:** Baseline identity strength for decision-making

### 5. Coat Check Item Volume
**Control:** How many elements per character at Act 0
**Effect:** Information load management

### 6. Timeline Event → Element Evidence
**Control:** Grounding character sheet claims in discoverable evidence
**Effect:** Coherence between identity and discovery

---

## Evaluation Questions for Agent

When Max asks about character readiness, the agent should investigate:

### Onboarding Scaffolding:
1. Does character sheet provide sufficient baseline identity?
2. Do coat check items ground the character sheet narrative?
3. Is coat check item volume appropriate (not too few, not too many)?
4. Is coat check type distribution appropriate (prop/document heavy)?
5. Do coat check puzzle rewards deepen understanding appropriately?

### Choice Readiness:
6. Can player make non-arbitrary team choice (Blake vs Detective)?
7. When do memory tokens enter (delayed introduction)?
8. Do early tokens have strong narrative grounding?
9. Is tutorialization moment well-timed?

### Discovery vs Frontloading Balance:
10. Is there room for evolving understanding (not everything at once)?
11. Does progression respect skill-based unlocking (puzzle solutions)?
12. Are there discovery surprises in Act 1+ (not all info in Act 0)?

**The Goal:** Progressive revelation that grounds identity while maintaining mystery.

---

## Red Flags in Scaffolding Design

### Too Little Scaffolding:
- Character sheet lacks context (vague Overview)
- Coat check has 1-2 items only (insufficient grounding)
- No coat check items for Core character (missing onboarding)
- Character sheet mentions trust pairs not discoverable
- No timeline events grounding character's backstory

### Too Much Frontloading:
- Coat check has 10+ items (overwhelming)
- Memory tokens in surface coat check (premature choice pressure)
- Character sheet exhaustively explains everything (no mystery)
- All narrative discoveries happen in Act 0 (nothing left for Acts 1-2)
- Locked contents just add volume without depth

### Poor Coherence:
- Character sheet doesn't match coat check items (disconnect)
- Trust pairs mentioned but no shared timeline events
- Goal cluster motivation not grounded in elements
- Coat check items contradict character sheet narrative

### Inappropriate Difficulty:
- Coat check puzzle too hard (blocks onboarding)
- Coat check puzzle too easy (no sense of reward)
- Locked contents not worth puzzle effort
- Token introduction before narrative grounding

---

## The Goldilocks Zone

**Just Right Scaffolding:**

1. **Character sheet** provides clear identity + motivation + social context
2. **Coat check items** (4-6 props/documents) ground the sheet narrative
3. **Coat check puzzle** (appropriate difficulty) gates deeper context
4. **Locked contents** reward with narrative depth (tokens optional, IF grounded)
5. **Token introduction** delayed until Act 1 OR after puzzle solution
6. **Tutorialization** happens when tokens enter play
7. **Discovery opportunities** preserved for Acts 1-2 (not all frontloaded)
8. **Coherence** maintained between sheet, items, and timeline evidence

**Player Experience:**
- Feels grounded enough to make team choice (not arbitrary)
- Has baseline understanding of character's past (not lost)
- Faces meaningful choices as tokens appear (not overwhelmed)
- Discovers evolving understanding through Act 1-2 (sense of mystery)
- Can articulate WHY character makes decisions (agency)

This is the delicate balance we're designing toward.

