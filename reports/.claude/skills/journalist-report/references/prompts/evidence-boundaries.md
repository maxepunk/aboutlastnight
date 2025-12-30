# Evidence Reporting Boundaries

The three-layer evidence model defines what the journalist CAN and CANNOT report based on how evidence was handled during gameplay.

## Layer 1: EXPOSED EVIDENCE (Full Reportability)

Memory tokens submitted to the Detective become PUBLIC RECORD.

**The journalist:**
- CAN quote full memory contents verbatim
- CAN describe what the memory reveals
- CAN draw conclusions from the content
- CAN name WHOSE memory it is (the owner - whose experience is recorded)
- CANNOT name who exposed it (Nova keeps her sources confidential)

**These become the FACTS of the article.**

### Correct Examples

> In Alex's memory, we see him presenting his algorithm to Marcus. "This is my life's work," Alex says in the recording.

> A cease and desist letter came across my desk. Patchwork Law Firm, representing Alex Chen, demanding NeurAI stop using the stolen algorithm.

> Jamie's memory shows Victoria offering Alex the position Marcus held. "He's gone. The job is yours." That's Victoria's voice. Jamie witnessed it.

### What Makes Exposed Evidence Usable

- Someone chose to bring it to the Detective (transparency)
- The content is on the public record
- Nova protects her sources - never reveal WHO exposed evidence

---

## Layer 2: BURIED PATTERNS (Observable Only)

Memory tokens sold to the Black Market are PRIVATE. The Valet promised discretion.

### CRITICAL: What's Visible vs Private

**Understanding the Game Mechanics:**
1. Players FIND/UNLOCK memory tokens during the game
2. A token belongs to whoever's memory it contains (the OWNER)
3. Players can SELL any token they find to Blake/Valet (receiving money as incentive)
4. The seller CHOOSES a shell account name for the transaction
5. **Black Market display shows:** Account Name + Total Amount (PUBLIC)
6. **Black Market display does NOT show:** Which tokens/owners contributed (PRIVATE)

**Key Distinction:**
- **Token OWNER** = Whose memory is in the token (e.g., "Kai's memory of...")
- **Transaction OPERATOR** = Who sold the token to Blake (could be anyone who found it)

**What Nova Can See (Public Display):**
- Shell account names (player-chosen pseudonyms like "ChaseT", "Gorlan", "John D.")
- Total dollar amounts per account
- Number of transactions per account (if displayed)
- **Transaction timestamps** (when each burial occurred)
- Who she observed visiting the Valet station (if director noted)

**What Nova CANNOT See:**
- WHOSE memories were sold to each account
- WHO sold specific memories (unless director observed them at Valet)
- Content of buried memories

**The journalist:**
- CAN report shell account names
- CAN report dollar amounts paid
- CAN report timing and sequence patterns
- CAN note suspicious correlations (name patterns like ChaseT = Taylor Chase?)
- CAN report who was OBSERVED at Valet (if director noted)
- CAN cross-reference director observations with transaction timing to hypothesize about account ownership
- CANNOT report whose memories went to which accounts
- CANNOT quote or describe buried memory content
- CANNOT infer specific content from transaction patterns

**These become the MYSTERIES of the article.** The shape of silence, not its contents.

### Correct Examples

> ChaseT received $750,000 across five transactions. Taylor's last name is Chase. That's an interesting choice of account name.

> Gorlan is the largest account: $1.125 million across six transactions. Someone paid a lot to keep something quiet.

> The first burial came at 8:15 PM. $200,000 to Offbeat. I don't know whose memory that was. I know what the silence cost.

> Six different shell accounts. Over $4 million in buried evidence. I can tell you the shape of the silence. I can't tell you what's inside it.

### Director Observation Exception

If the director noted someone at the Valet (e.g., "Taylor was seen selling at 8:15 PM"):
- CAN report that person visited the Valet
- CAN speculate about timing correlation with account activity
- CANNOT know whose MEMORY they were selling (could be their own or someone else's)

### WRONG - Never Do This

> Kai's memories were sold to ChaseT for $750,000.

WHY THIS IS WRONG: We cannot see whose memories went to which accounts. The Black Market display only shows account totals, not individual token ownership.

> Leila's 5 tokens went to Dominic.

WHY THIS IS WRONG: Same issue. We can see "Dominic received $960,000 across 5 transactions" but NOT whose memories those were.

> Victoria buried a memory showing her meeting with Marcus about the algorithm.

WHY THIS IS WRONG: Two violations - we can't know WHO's memory was buried AND we can't know what it contained.

> Derek's buried memories proved he knew about the lab experiments.

WHY THIS IS WRONG: We cannot "prove" anything from buried content. We can only report what we see on the display (account names, totals, timestamps).

> The buried evidence revealed Victoria's involvement in the murder.

WHY THIS IS WRONG: Buried evidence reveals NOTHING about content or ownership. Only patterns of account activity and timing.

### Using Timing + Observation Together (CORRECT)

When director noted someone at Valet AND we see transaction timing:

> I saw Taylor at the Valet station at 8:15 PM. A transaction hit ChaseT at 8:16 PM. Make of that what you will.

This is CORRECT because:
- Director observation = we saw Taylor at Valet (public behavior)
- Transaction timestamp = visible on display
- We're noting correlation, not claiming to know WHOSE memory Taylor sold

### What You CAN Infer vs CANNOT Infer

**CAN infer:**
- Shell account naming patterns (ChaseT = Taylor Chase?)
- Timing clusters (multiple burials in final minutes, first burials at certain times)
- Financial magnitude (someone paid $4.1M to hide things)
- Timing + observation correlations (saw Taylor at Valet at 8:15, transaction at 8:16)
- Account creation patterns (early transactions = likely account creator)

**CANNOT infer:**
- Whose memories went to which accounts (unless observed at Valet)
- What the buried memories showed
- What they prove or disprove
- Specific events or conversations they captured
- Any narrative content whatsoever

---

## Layer 3: DIRECTOR NOTES (Shapes Focus AND Drives Arc Selection)

Director provides session-specific context that shapes the article's emphasis.

**Sources (in priority order):**
1. **The Accusation** (who was accused and why) - PRIMARY, the players' final conclusion
2. **Director Observations** (behavior patterns, notable moments) - HIGHEST NARRATIVE WEIGHT, ground truth
3. **The Whiteboard** (what Cassandra documented during investigation) - SUPPORTING CONTEXT

**What Director Observations Include:**
- **TIMING:** When players were seen where (e.g., "Taylor at Valet 8:15 PM")
- **RELATIONSHIP hints:** Who worked together, who split apart, alliance dynamics
- **Behavioral patterns:** Evasive behavior, coordination, notable interactions
- **Ground truth:** What ACTUALLY happened during gameplay (not player interpretations)

These timing and relationship hints become the human ground truth for behavioral claims in the article.

### CRITICAL: Layer 3 Priority Hierarchy

**Priority hierarchy for arc selection:**
1. **Accusation** (sessionConfig.accusation) - What players concluded (PRIMARY)
2. **Director Observations** - Ground truth of what happened (HIGHEST NARRATIVE WEIGHT)
3. **Whiteboard** - Notes captured during investigation (SUPPORTING CONTEXT)

The accusation represents the players' final conclusion. Director observations provide authoritative behavioral evidence of what actually happened. The whiteboard captures the investigation journey but is NOT the authority. It's supporting evidence for how players reached their conclusion.

```
WRONG (evidence-first approach):
  1. Analyze all exposed evidence
  2. Identify arcs by evidence volume
  3. Rate by "strength" (how much evidence)
  4. Present to user

CORRECT (player-focused approach):
  1. Read accusation FIRST - what did PLAYERS conclude?
  2. Read director observations - what ACTUALLY happened?
  3. Review whiteboard - what path did players take to their conclusion?
  4. Identify arcs that match accusation focus, grounded in observations
  5. Find Layer 1 evidence that supports/contradicts each arc
  6. Present arcs in order of ACCUSATION ALIGNMENT, not evidence volume
```

**The article tells the story of THIS GROUP'S investigation, not a generic evidence summary.**

### How Layer 3 Sources Shape the Article

**Example: Dec 21 Session**

Accusation: Victoria and Morgan accused of colluding to murder Marcus
Director Observations: Victoria and Morgan working together, ChaseT activity in second half, John D. anonymity
Whiteboard Notes: SUSPECTS: Derek (emphasized), Victoria, Morgan; "Victoria + Morgan = permanent solution"

This shapes the article to:
- Lead with Victoria/Morgan collusion arc (accusation focus)
- Ground behavioral claims in director observations (what was seen, not inferred)
- Use whiteboard notes as supporting context for investigation journey
- Include Derek's suspicious behavior (players noticed him, whiteboard emphasis)
- Arcs not aligned with accusation get LOWER priority regardless of evidence volume

### Player Emphasis Levels

When analyzing arcs, assign emphasis based on accusation and observation alignment:

| Level | Criteria |
|-------|----------|
| **HIGH** | Directly connected to accusation, supported by director observations |
| **MEDIUM** | On whiteboard, discussed by group but not central to accusation |
| **LOW** | Supporting context, not player focus, weak observation support |

### What Director Notes Do NOT Do

- They don't replace evidence (still need exposed content to support claims)
- They don't reveal buried content (privacy boundaries still apply)
- They don't override the facts (synthesis, not invention)
- Director observations are ground truth but don't prove guilt (observations, not conclusions)

---

## Applying Boundaries in Each Section

### THE STORY
- Heavy use of Layer 1 (exposed evidence as narrative facts)
- Light Layer 3 (director notes for emphasis/framing)
- NO Layer 2 content (buried patterns don't belong here)

### FOLLOW THE MONEY
- Heavy Layer 2 patterns (shell accounts, amounts, timing)
- Light Layer 3 (suspicious correlations director noted)
- NO content inference from transactions

### THE PLAYERS
- Mix of Layers 1-3
- Who exposed (Layer 1 + credit)
- Who buried (Layer 2 patterns, no content)
- Behavioral observations (Layer 3)

### WHAT'S MISSING
- Pure Layer 2 (the mysteries)
- Shapes of silence, not contents
- Invitation to wonder, not claims

### CLOSING
- Systemic critique (beyond individual layers)
- The accusation (Layer 3 framing)
- What this means (synthesis)

---

## Quick Reference: Can I Say This?

| What You Want to Say | Layer | Allowed? |
|---------------------|-------|----------|
| "Alex's memory shows him presenting his algorithm" | 1 | YES - exposed content |
| "Victoria buried a memory about the murder" | 2 | NO - can't know content |
| "Victoria paid $450K to bury two memories" | 2 | YES - observable transaction |
| "The group suspected Derek" | 3 | YES - director notes |
| "Derek's buried memory proves guilt" | 2 | NO - can't infer content |
| "James exposed the cease and desist letter" | 1 | YES - attribution + content |
| "ChaseT might be Taylor's account" | 2 | YES - pattern inference |
| "The buried memories revealed the conspiracy" | 2 | NO - buried reveals nothing |
