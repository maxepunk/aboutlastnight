# SF_ Field Mechanics - Business Logic & Validation

## Quick Reference

SF_ fields control token scanning, auction mechanics, and choice architecture. Four fields create the business logic layer:

**SF_ValueRating (1-5):** Blake's auction value. Higher stakes = higher rating. Narrative significance should justify mechanical value.

**SF_MemoryType (Technical/Business/Personal):** Content categorization for scanner display. Technical = systems/formulations. Business = professional relationships. Personal = emotional/interpersonal.

**SF_Group:** Collection designation. Primary use: "Black Market Ransom" marks the 4 critical tokens Blake needs. May have other thematic collections.

**SF_Summary:** Player-facing text displayed when token scanned. Must work in dual context: Detective's public scoreboard AND player's private NeurAI scanner. Provides decision context without spoiling choice.

**Critical Rule:** SF_ fields are BUSINESS LOGIC, not just metadata. They directly impact gameplay mechanics, auction value, and player choice architecture.

---

## How to Use This Reference

**When designing tokens:**
1. Determine SF_MemoryType from content (validation decision tree below)
2. Set SF_ValueRating based on narrative stakes (rating guidance below)
3. Assign SF_Group if token belongs to special collection
4. Write SF_Summary for dual context (Detective + NeurAI scanner)
5. Validate coherence across all four fields

**When validating tokens:**
1. Check SF_MemoryType matches actual content
2. Verify SF_ValueRating justified by narrative stakes
3. Confirm SF_Summary works in both scanner contexts
4. Validate SF_Group assignment is appropriate

---

## Scanner Infrastructure Context

### Three Scanner Contexts

**From CHOICE_ARCHITECTURE_ANALYSIS.md and gameplay script:**

SF_ fields display differently across three scanner types, each with distinct player/audience:

**1. NeurAI Scanner (Player Team Context)**

**Who uses it:** Player teams (formed in Beat 1.2.2)
**Access:** Team-based scanner access, shared among team members
**What displays:** SF_Summary + full token content after scan
**Player sees:**
- Token identifier
- SF_MemoryType category
- SF_Summary (decision context)
- After scanning: full narrative content

**Purpose:** Private viewing for choice-making
- Players decide: SELL / EXPOSE / HOLD
- SF_Summary provides context for this decision
- Content reveals full story after player chooses to scan

**Design Implication:** SF_Summary must help player understand what memory IS and why it matters, without dictating choice.

**2. Detective's Scoreboard (Public Case Display)**

**Who uses it:** Detective displays exposed tokens publicly
**Access:** Public viewing for all players
**What displays:** SF_Summary of exposed tokens as evidence
**Players see:**
- Which tokens have been exposed to Detective
- SF_Summary as case evidence
- Building case against Marcus and others

**Purpose:** Public evidence display
- Shows what's been exposed vs. held/sold
- Demonstrates case building in real-time
- Creates social pressure and transparency

**Design Implication:** SF_Summary should work as case evidence statement. "Evidence of [wrongdoing]" framing appropriate here.

**3. Blake's Auction Context (Value Assessment)**

**Who uses it:** Blake (NPC) assessing token value
**Access:** Blake sees all tokens via scanner network
**What displays:** SF_ValueRating drives auction offers
**Blake sees:**
- All discovered tokens (meta knowledge)
- SF_ValueRating determines payment offer
- SF_Group "Black Market Ransom" flags critical 4 tokens

**Purpose:** Auction mechanics
- Blake pays per token based on ValueRating
- Premium for secrets worth burying (COVERUP)
- Special focus on the 4 ransom tokens

**Design Implication:** SF_ValueRating is LITERAL value Blake will pay. SF_Group "Black Market Ransom" marks mechanically essential tokens.

### Scanner Infrastructure Summary

**From CHOICE_ARCHITECTURE_ANALYSIS.md lines 93-98, 156:**

"Everyone must have scanner access through a team" (Beat 1.2.2)
"Scan token → Learn what memory contains (SF_Summary displayed)" (Gameplay loop)

**Key Insight:** SF_ fields exist in TENSION across three contexts:
- NeurAI scanner (player choice support)
- Detective scoreboard (public case evidence)
- Blake auction (mechanical value)

SF_Summary must work for BOTH Detective's public scoreboard AND player's private scanner. This dual context requirement is CRITICAL.

---

## SF_MemoryType: Technical / Business / Personal

### From COMPREHENSIVE_KNOWLEDGE.md (lines 169-181)

**Purpose:** Semantic categorization for scanner display
**Design Rule:** Must align with narrative content

**Core Definitions:**
- **Technical:** System details, technical knowledge, formulations
- **Business:** Professional relationships, deals, partnerships, corporate info
- **Personal:** Emotional moments, relationships, private experiences

### Detailed Patterns with Examples

#### Technical MemoryType

**What qualifies as Technical:**
- System specifications and formulations
- Technical research and development work
- Algorithms, code, scientific processes
- Specialized knowledge requiring expertise
- Hardware/software configurations
- Technical innovations and inventions

**Characteristics:**
- Content describes HOW a system works
- Requires technical knowledge to understand fully
- Could be stolen as intellectual property
- Valuable to competitors or those with technical interest
- Often includes specifications, measurements, procedures

**Examples from Design Context:**

**Oliver Sterling's medical formulations (Ransom Token):**
- Content: Neurological interface specifications, drug formulations, technical procedures
- Why Technical: System details, specialized medical/technical knowledge
- Scanner display: Categorized as Technical innovation/research

**Skyler Iyer's AI algorithms:**
- Content: Machine learning approaches, system architecture, technical specifications
- Why Technical: Algorithm details, technical implementation
- Scanner display: Technical system knowledge

**Howie Sullivan's lecture notes on adaptive collaboration (Ransom Token):**
- Content: Technical frameworks for collaborative systems, implementation notes
- Why Technical: System design, technical methodology
- Scanner display: Technical collaborative knowledge

**Pattern Recognition:**
- If content is "how to build X" → Technical
- If content is "specifications of X" → Technical
- If content is "research process for X" → Technical

**Edge Case:** Personal reaction to technical work
- Research process itself → Technical
- Researcher's emotional journey → Personal
- Professional pressure about research → Business

#### Business MemoryType

**What qualifies as Business:**
- Professional relationships and partnerships
- Corporate deals and negotiations
- VC relationships and funding arrangements
- Business strategy and competitive intelligence
- Professional collaborations and conflicts
- Employment relationships and workplace dynamics

**Characteristics:**
- Content describes professional interactions
- Involves business interests, not personal relationships
- Corporate context, even if emotionally charged
- About deals, partnerships, competitive dynamics
- Professional reputation and business dealings

**Examples from Design Context:**

**Victoria Kingsley's VC negotiations:**
- Content: Investment discussions, funding terms, due diligence concerns
- Why Business: Professional financial relationships
- Scanner display: Business/investment dealings

**Alex Reeves / Marcus partnership tension:**
- Content: Business partnership dissolution, corporate conflict
- Why Business: Professional relationship in business context
- Scanner display: Partnership/business relationship

**Taylor Chase's media relationships:**
- Content: Professional connections, PR arrangements, media deals
- Why Business: Professional networking and business arrangements
- Scanner display: Business/media relationships

**Sarah Blackwood's marriage as business arrangement:**
- Content: Marriage framed transactionally (prenup, assets, financial implications)
- Why Business: Even personal relationships can be Business if framed through professional/financial lens
- Scanner display: Business/financial relationship

**Pattern Recognition:**
- If content is "professional relationship with X" → Business
- If content is "deal/negotiation about X" → Business
- If content is "corporate context for X" → Business

**Edge Case:** Personal relationships in professional settings
- Professional collaboration only → Business
- Workplace friendship developing → Personal
- Business deal affecting personal life → Depends on framing

#### Personal MemoryType

**What qualifies as Personal:**
- Emotional and interpersonal moments
- Private relationships and experiences
- Personal grief, joy, love, betrayal
- Intimate conversations and private communications
- Personal identity and self-reflection
- Non-professional social interactions

**Characteristics:**
- Content describes emotional/interpersonal experiences
- Focus on feelings, relationships, personal meaning
- Private moments, not public/professional
- About who people ARE, not what they DO professionally
- Emotional stakes and personal significance

**Examples from Design Context:**

**Derek Thorne's party memories:**
- Content: Underground parties, community experiences, social connections
- Why Personal: Social/interpersonal experiences, community belonging
- Scanner display: Personal/social memories

**Sarah Blackwood's texts to Rachel:**
- Content: Venting about marriage, emotional support, friendship
- Why Personal: Interpersonal emotional communication
- Scanner display: Personal communication/friendship

**Ashe Motoko and Alex Reeves dating:**
- Content: Romantic relationship, personal connection
- Why Personal: Intimate relationship, not professional
- Scanner display: Personal/romantic relationship

**Jamie Volt as invisible witness:**
- Content: Personal experiences of being overlooked, social invisibility
- Why Personal: Personal identity and social experience
- Scanner display: Personal experience/identity

**Pattern Recognition:**
- If content is "how I felt about X" → Personal
- If content is "my relationship with X" (non-professional) → Personal
- If content is "personal moment when X" → Personal

**Edge Case:** Personal feelings about professional situations
- Professional event itself → Business/Technical
- Emotional reaction to professional event → Personal
- Both dimensions present → Choose dominant framing or split into two tokens

### Validation Decision Tree

**Step-by-step process for determining SF_MemoryType:**

```
START: What is the primary content of this token?

1. Is the content about technical systems, specifications, or specialized knowledge?
   → YES: Consider Technical
   → NO: Continue to step 2

2. Is the content about professional relationships, deals, or business operations?
   → YES: Consider Business
   → NO: Continue to step 3

3. Is the content about emotional experiences or interpersonal relationships?
   → YES: Consider Personal
   → NO: Re-examine content (everything should fit one category)

REFINEMENT: If content seems to fit multiple categories, ask:

4. What is the PRIMARY focus?
   - System/how it works → Technical
   - Professional relationship/transaction → Business
   - Emotional/interpersonal experience → Personal

5. What would scanner user want to know?
   - Technical: "What system knowledge does this contain?"
   - Business: "What professional relationship does this document?"
   - Personal: "What personal experience does this reveal?"

6. How would character describe it?
   - "This is how we built X" → Technical
   - "This is my deal with X" → Business
   - "This is how I felt about X" → Personal
```

### Complex Cases and Edge Situations

**Case 1: Technical work with emotional dimension**

**Scenario:** Oliver's medical research that he's emotionally invested in

**Analysis:**
- Research specifications themselves → Technical MemoryType
- Oliver's guilt/pressure about research → Personal MemoryType
- Professional obligation to continue research → Business MemoryType

**Decision:** Create separate tokens for different dimensions, OR choose dominant dimension
- If token focuses on formulations → Technical
- If token focuses on Oliver's emotional state → Personal
- If token focuses on professional pressure from Victoria → Business

**Case 2: Business relationship that became personal**

**Scenario:** Marcus and Derek started as business (drug dealing) but became friends

**Analysis:**
- Early transactions → Business MemoryType
- Friendship development → Personal MemoryType
- Ongoing deals within friendship → Ambiguous

**Decision:** Frame based on what token emphasizes
- Transaction details → Business
- Friendship moments → Personal
- If both are inseparable → Choose character's perspective (Derek likely views as Personal)

**Case 3: Personal information with business implications**

**Scenario:** Affair that could destroy business reputation

**Analysis:**
- Affair itself → Personal MemoryType
- Business consequences of affair → Business MemoryType
- Cover-up of affair for business reasons → Business or Personal depending on emphasis

**Decision:** What does token content focus on?
- Romantic/intimate moments → Personal
- Calculation about business risk → Business
- Both present → Choose token owner's framing (COVERUP character might frame as Business risk)

**Case 4: Technical knowledge shared in personal context**

**Scenario:** Howie teaching technical concepts to friends at parties

**Analysis:**
- Technical content → Technical MemoryType
- Social context and teaching moments → Personal MemoryType
- Educational relationship → Business or Personal depending on formality

**Decision:** Is token about the knowledge OR the social moment?
- Knowledge itself (what he taught) → Technical
- Teaching moment and friendship → Personal
- Why Howie's ransom token is Technical: Content is collaborative frameworks, not the friendships

### Anti-Patterns for SF_MemoryType

**Anti-Pattern 1: "Personal to owner, therefore Personal MemoryType"**

WRONG: "Oliver personally conducted this research, so it's Personal MemoryType"
RIGHT: Research specifications are Technical regardless of who did them

MemoryType categorizes CONTENT, not ownership or personal investment.

**Anti-Pattern 2: "Business context makes everything Business"**

WRONG: "This happened at work, so it's Business MemoryType"
RIGHT: Workplace affair is still Personal, even though it happened at work

Context matters, but content determines MemoryType.

**Anti-Pattern 3: "Multiple dimensions means Technical + Personal"**

WRONG: Can't assign two MemoryTypes to same token
RIGHT: Choose dominant dimension OR create separate tokens for different aspects

Each token has ONE MemoryType. Complex situations may need multiple tokens.

**Anti-Pattern 4: "Technical details in emotional story"**

WRONG: Story mentions technical details, therefore Technical MemoryType
RIGHT: If story is about emotions and relationship, not how system works, it's Personal

Incidental technical references don't make content Technical.

---

## SF_ValueRating: 1-5 Scale

### From COMPREHENSIVE_KNOWLEDGE.md (lines 162-168)

**Purpose:** Mechanical value in Blake's auction
**Design Rule:** Narrative stakes should inform mechanical value

Core principle: "Narrative stakes should inform mechanical value"
- High-stakes revelations = higher value
- Personal/emotional moments = variable value
- Complete sets = premium value

### Understanding ValueRating as Game Economy

**Blake's Auction Mechanics:**
- Blake pays players per token based on ValueRating
- Higher rating = more money = more incentive to sell
- ValueRating creates mechanical tension with moral choice

**Player Decision Context:**
- High ValueRating → Financial incentive to sell
- But high ValueRating also means → High significance (reason to expose or hold)
- Rating is VISIBLE to players when scanning

**Design Implication:** ValueRating creates meaningful choice tension. Don't inflate ratings arbitrarily.

### Detailed Rating Scale

**Rating 5: Maximum Stakes**

**When to use:**
- Game-changing secrets that could destroy careers/companies
- Critical evidence for Detective's case against Marcus
- The 4 Black Market Ransom tokens (mechanical necessity)
- Revelations that fundamentally shift player understanding
- Information Blake desperately wants buried

**Narrative Justification Required:**
- Why is Blake willing to pay premium for this?
- What makes this irreplaceable or catastrophic if exposed?
- How does this change the game state?

**Examples:**
- Oliver Sterling's medical formulations (Ransom Token): Dangerous research Blake needs
- James Whitman's secret laboratory memory (Ransom Token): Evidence of Marcus's illegal activities
- Major corruption evidence: Proof of serious wrongdoing with legal consequences
- Identity-defining memories: Information that fundamentally defines character

**Pattern:** Rating 5 is RARE. Reserve for truly exceptional significance.

**Rating 4: High Stakes**

**When to use:**
- Significant secrets with serious consequences
- Important evidence supporting Detective's case
- Emotionally devastating revelations
- Information that shifts character relationships
- Memories central to character identity

**Narrative Justification:**
- What serious consequence comes from exposure?
- Why does this matter beyond personal embarrassment?
- How does this advance major narrative threads?

**Examples:**
- Partnership betrayal evidence: Substantial wrongdoing documented
- Major personal secrets: Affairs, hidden relationships with consequences
- Significant technical secrets: Valuable IP or dangerous research
- Critical relationship evidence: Trust foundations with major implications

**Pattern:** Rating 4 is for substantial stakes, not just interesting information.

**Rating 3: Medium Stakes**

**When to use:**
- Meaningful information with moderate consequences
- Supporting evidence (not smoking gun)
- Personal moments with emotional weight
- Information that matters but isn't game-changing
- Memories that enrich character but aren't defining

**Narrative Justification:**
- Why does this matter to character?
- What moderate consequence or value exists?
- How does this support broader narratives?

**Examples:**
- Minor business secrets: Competitive intelligence, not catastrophic
- Meaningful personal moments: Important but not identity-defining
- Supporting evidence: Corroborates patterns, doesn't prove case alone
- Relationship foundations: Important to trust pairs but not explosive

**Pattern:** Rating 3 is the DEFAULT for solid content. Most tokens should be here.

**Rating 2: Low Stakes**

**When to use:**
- Minor information with limited consequences
- Personal moments without broader implications
- Background information that provides context
- Memories that flavor character but aren't critical
- Information with minimal value to Blake or Detective

**Narrative Justification:**
- Why include this token at all?
- What small value does it provide?
- How does it support character or narrative in minor way?

**Examples:**
- Casual interactions: Pleasant moments without major significance
- Minor grievances: Personal complaints without actionable content
- Background details: Context that fills in character but doesn't drive plot
- Low-stakes personal moments: Nice memories without identity implications

**Pattern:** Rating 2 is for content that enriches without driving. Valid but not critical.

**Rating 1: Minimal Stakes**

**When to use:**
- Very minor information
- Background flavor with no consequences
- Personal moments with no broader significance
- Information with essentially no value in auction or case

**Narrative Justification:**
- Why is this a token at all? (Consider: should it be a prop instead?)
- What minimal value justifies its existence?

**Examples:**
- Trivial personal moments: Pleasant but inconsequential
- Minor background details: Flavor text level content
- Low-significance information: Context without stakes

**Pattern:** Rating 1 is RARE for tokens. Consider whether content should be prop or set dressing instead.

**Critical Design Note:** Most tokens should be Rating 2-4. Rating 5 is exceptional. Rating 1 is edge case.

### Goal Cluster Implications for ValueRating

**How character goal clusters affect value perception:**

**JUSTICE Cluster:**
- Values evidence proportionally to case-building importance
- High ratings for proof of wrongdoing
- Lower ratings for personal grievance without evidence
- Detective appeal aligns with JUSTICE cluster

**Pattern:** JUSTICE tokens often 3-5, weighted toward evidence value

**RECOVERY Cluster:**
- Values memories based on identity and community significance
- High ratings for memories central to self/relationships
- Lower ratings for nice-but-not-essential moments
- Hold appeal aligns with RECOVERY cluster

**Pattern:** RECOVERY tokens span 2-5, based on personal significance

**COVERUP Cluster:**
- Values secrets based on destructive potential if exposed
- High ratings for career-destroying or dangerous information
- Lower ratings for minor embarrassments
- Blake appeal aligns with COVERUP cluster

**Pattern:** COVERUP tokens often 3-5, weighted toward secret severity

**PRAGMATIC Cluster:**
- Values information based on literal market value
- High ratings for leverage and valuable intelligence
- Lower ratings for information without transactional utility
- Sell appeal aligns with PRAGMATIC cluster

**Pattern:** PRAGMATIC tokens span 2-5, based on market assessment

### ValueRating Validation Checklist

**Before assigning ValueRating, ask:**

1. **Would Blake pay premium for this?** (If Rating 4-5)
   - Is this a secret worth burying?
   - Is this mechanically necessary (ransom token)?
   - Does this have exceptional significance?

2. **Would Detective want this for the case?** (If Rating 3-5)
   - Does this prove wrongdoing?
   - Does this support broader patterns?
   - Does this advance investigation?

3. **Is this identity-defining for character?** (If Rating 4-5)
   - Is holding this crucial to character's sense of self?
   - Does this memory define who they are?
   - Would losing this fundamentally change them?

4. **What are the stakes?**
   - Career/company destruction → Rating 4-5
   - Significant consequences → Rating 3-4
   - Moderate impact → Rating 2-3
   - Minor implications → Rating 1-2

5. **Is this rating justified by narrative content?**
   - Rating matches substance of token?
   - Not inflated for arbitrary reasons?
   - Proportional to other tokens in game?

### Anti-Patterns for ValueRating

**Anti-Pattern 1: Rating inflation**

WRONG: "This token is owned by Core tier character, so it should be Rating 5"
RIGHT: Tier doesn't determine rating; narrative stakes do

Don't inflate ratings based on character importance.

**Anti-Pattern 2: Arbitrary maximum ratings**

WRONG: "I want players to care about this, so Rating 5"
RIGHT: Rating 5 requires genuine game-changing significance

High ratings should be rare and justified.

**Anti-Pattern 3: Confusing interesting with valuable**

WRONG: "This is interesting backstory, so Rating 4"
RIGHT: Interesting ≠ high stakes. Rate based on consequences, not curiosity

Flavor content can be Rating 2-3 even if interesting.

**Anti-Pattern 4: Ignoring game economy**

WRONG: Making most tokens Rating 4-5
RIGHT: Most tokens should be Rating 2-4, with Rating 5 exceptional

Rating distribution affects game balance.

---

## SF_Group: Collection Designation

### Primary Use: Black Market Ransom

**From COMPREHENSIVE_KNOWLEDGE.md lines 143-155:**

Four specific tokens needed to free hostages:
1. Oliver Sterling's medical formulations
2. James Whitman's memory of Marcus's secret laboratory
3. Howie Sullivan's lecture notes on adaptive collaboration
4. Leila Bishara's private collection of algorithms

**SF_Group = "Black Market Ransom"** marks these four tokens.

**Mechanical Function:**
- Blake needs ALL FOUR to release hostages
- This is primary win condition communicated to players
- Players must find these specific tokens
- Selling them to Blake advances hostage release

**Design Implication:** These 4 tokens have SF_Group field populated. Most tokens have empty SF_Group.

### Other Potential Group Uses

**Possible collection types:**
- Thematic sets (all tokens about specific event)
- Character sets (complete collection for one character)
- Thread sets (all tokens in narrative thread)
- Evidence chains (tokens that build cumulative case)

**Current Status:** SF_Group primarily used for Black Market Ransom. Other uses are possible but not yet implemented.

**Design Rule:** Don't populate SF_Group without clear mechanical purpose. Empty is default.

---

## SF_Summary: Dual-Context Writing

### Critical Understanding

**From CHOICE_ARCHITECTURE_ANALYSIS.md lines 258-276:**

SF_Summary has TWO distinct display contexts:
1. Detective's public scoreboard (evidence display)
2. NeurAI scanner (player private viewing)

**Both contexts matter. Summary must work in BOTH.**

### The Dual Context Challenge

**Detective Scoreboard Context:**
- Exposed tokens display publicly
- Summary serves as case evidence
- All players can see what's been exposed
- Summary should work as public statement of evidence

**NeurAI Scanner Context:**
- Player scans token privately
- Summary provides decision-making context
- Player decides: SELL / EXPOSE / HOLD
- Summary should help choice without dictating it

**Design Challenge:** Write summary that:
- Works as public evidence statement (Detective)
- Provides private decision context (Player)
- Doesn't spoil choice or remove agency
- Gives enough information to make meaningful choice

### Summary Writing Patterns

**Pattern 1: Evidence Statement (works in both contexts)**

**Structure:** "Evidence of [specific claim] by/about [person]"

**Examples:**
- "Evidence of Marcus's unauthorized medical experiments"
- "Documentation of partnership betrayal by Alex Reeves"
- "Proof that Victoria knew about safety concerns"

**Why this works:**
- Detective context: Clear case evidence statement
- Player context: Understand what evidence IS
- Doesn't dictate choice (player must decide if exposure is right)
- Specific enough to inform decision

**Pattern 2: Memory Description (works in both contexts)**

**Structure:** "[Character]'s memory of [event/relationship]"

**Examples:**
- "Derek's memory of underground party community"
- "Sarah's recollection of marriage before conflict"
- "Howie's documentation of collaborative frameworks"

**Why this works:**
- Detective context: Identifies what memory contains
- Player context: Understand personal significance
- Neutral framing doesn't bias choice
- Allows player to assess value

**Pattern 3: Relationship Documentation (works in both contexts)**

**Structure:** "[Character]'s [record/communication] about [relationship/event]"

**Examples:**
- "Rachel's text exchange with Sarah about Marcus's parties"
- "Oliver's research notes on formulation development"
- "Victoria's VC correspondence about funding concerns"

**Why this works:**
- Detective context: Type of evidence clear
- Player context: Content and significance indicated
- Format indicates MemoryType alignment
- Maintains choice tension

**Pattern 4: Claim + Context (works in both contexts)**

**Structure:** "[Specific content] showing [broader implication]"

**Examples:**
- "Partnership dissolution showing financial impropriety"
- "Technical specifications revealing safety compromises"
- "Personal communication demonstrating prior knowledge"

**Why this works:**
- Detective context: Claim + significance for case
- Player context: Content + why it matters
- Two-part structure provides depth
- Supports informed choice

### Summary Writing Guidelines

**DO:**
- Be specific about what information contains
- Indicate significance without editorializing
- Match tone to MemoryType and goal cluster
- Provide enough context for meaningful choice
- Work as both evidence statement and decision support
- Keep to 1-2 sentences (scanner display limitation)

**DON'T:**
- Spoil full content (that's what scanning reveals)
- Dictate moral judgment ("obvious crime")
- Use inflammatory language that removes choice
- Be so vague player can't assess value
- Write only for one context (must work in both)
- Exceed scanner display space

### Summary by MemoryType

**Technical MemoryType summaries:**
- Emphasize system/specification content
- "Technical documentation of [system]"
- "Research specifications for [innovation]"
- Neutral, descriptive tone

**Business MemoryType summaries:**
- Emphasize professional relationship/transaction
- "Business correspondence about [deal]"
- "Partnership documentation showing [relationship]"
- Professional, factual tone

**Personal MemoryType summaries:**
- Emphasize emotional/interpersonal content
- "Personal memory of [relationship/experience]"
- "Private communication about [emotional content]"
- Intimate but not maudlin tone

### Summary by Goal Cluster

**JUSTICE cluster summaries:**
- Frame as evidence when appropriate
- "Evidence of [wrongdoing]"
- "Documentation showing [accountability need]"
- Serious, case-building tone

**RECOVERY cluster summaries:**
- Frame as memory/experience
- "Memory of [community/relationship]"
- "Recollection of [what matters]"
- Personal, preservation tone

**COVERUP cluster summaries:**
- Frame as protected information
- "Documentation of [secret/compromise]"
- "Evidence that [something needs hiding]"
- Careful, stakes-aware tone

**PRAGMATIC cluster summaries:**
- Frame as asset/information
- "Documentation of [value/leverage]"
- "Record of [transaction/opportunity]"
- Transactional, matter-of-fact tone

### Edge Cases and Complex Summaries

**Edge Case 1: Highly sensitive content**

**Challenge:** Summary could be triggering or spoil major revelation

**Solution:** Use more general framing
- Instead of: "Evidence of Marcus's murder of previous partner"
- Use: "Documentation of fatal incident involving previous partner"
- Let full content reveal details after player chooses to scan

**Edge Case 2: Multi-character events**

**Challenge:** Token involves several characters

**Solution:** Focus on owner's perspective
- "Sarah's documentation of [event] involving Marcus and Rachel"
- Owner's name first, others as context
- Maintains owner framing

**Edge Case 3: Ambiguous significance**

**Challenge:** Information could be seen multiple ways

**Solution:** Present facts, not interpretation
- "Communication between Oliver and Victoria about research"
- Not: "Evidence proving Oliver's guilt in cover-up"
- Let player interpret significance

**Edge Case 4: Blake Ransom tokens**

**Challenge:** Mechanically critical, but shouldn't spoil that fact

**Solution:** Summary describes content, SF_Group field marks ransom status
- Summary: "Oliver's medical formulation specifications"
- SF_Group: "Black Market Ransom" (backend flag)
- Scanner may highlight differently, but summary stays content-focused

### Summary Validation Checklist

**Before finalizing SF_Summary, ask:**

1. **Does this work as Detective scoreboard evidence statement?**
   - Clear what evidence proves?
   - Appropriate for public display?
   - Supports case-building narrative?

2. **Does this work as player decision support?**
   - Enough context to assess value?
   - Doesn't dictate choice?
   - Maintains moral complexity?

3. **Is this specific enough to be meaningful?**
   - Player understands what's in token?
   - Not so vague as to be useless?
   - Provides actual information?

4. **Is this general enough to preserve discovery?**
   - Doesn't spoil full content?
   - Leaves room for scanning to reveal details?
   - Maintains gameplay value of discovery?

5. **Does tone match MemoryType and cluster?**
   - Technical summaries sound technical?
   - Personal summaries sound personal?
   - Cluster framing appropriate?

6. **Is this 1-2 sentences maximum?**
   - Scanner display constraint?
   - Concise and scannable?
   - Gets point across quickly?

### Anti-Patterns for SF_Summary

**Anti-Pattern 1: Spoiler summaries**

WRONG: "Complete evidence of Marcus murdering his partner in cold blood and covering it up with Victoria's help"
RIGHT: "Documentation of fatal incident involving Marcus's previous partner"

Don't spoil the full revelation. Summary provides context, content provides details.

**Anti-Pattern 2: Editorialized summaries**

WRONG: "Shocking proof of Marcus's evil crimes"
RIGHT: "Evidence of unauthorized activities by Marcus"

Avoid moral judgment in summary. Let player decide significance.

**Anti-Pattern 3: Vague summaries**

WRONG: "Information about the past"
RIGHT: "Documentation of partnership dissolution between Marcus and Alex"

Be specific enough to inform choice.

**Anti-Pattern 4: Single-context summaries**

WRONG (Only works for Detective): "Smoking gun that will bring down Marcus"
RIGHT (Works both contexts): "Evidence of financial impropriety in Marcus's business dealings"

Must work as both public evidence AND private decision support.

**Anti-Pattern 5: Breaking scanner display**

WRONG: Three-paragraph summary with multiple sub-points
RIGHT: "Oliver's medical formulation specifications for neurological interface technology"

Keep to 1-2 sentences that fit scanner display.

---

## Validation Decision Trees

### Complete Token Validation Process

**Step 1: Validate SF_MemoryType**

```
1. Read token content
2. Identify primary subject:
   - System/specifications → Technical
   - Professional relationship → Business
   - Emotional/interpersonal → Personal
3. Apply decision tree (see SF_MemoryType section above)
4. Verify against examples and patterns
5. Check for anti-patterns
```

**Step 2: Validate SF_ValueRating**

```
1. Identify narrative stakes
2. Ask: What happens if this is exposed/sold/held?
3. Assess consequences:
   - Game-changing → 5
   - High stakes → 4
   - Medium stakes → 3
   - Low stakes → 2
   - Minimal stakes → 1
4. Check goal cluster expectations
5. Verify against rating distribution (most should be 2-4)
```

**Step 3: Validate SF_Group**

```
1. Is this one of the 4 Black Market Ransom tokens?
   → YES: SF_Group = "Black Market Ransom"
   → NO: Continue

2. Is there a defined collection this belongs to?
   → YES: Assign appropriate group
   → NO: Leave empty (default)

3. Verify mechanical purpose if group assigned
```

**Step 4: Validate SF_Summary**

```
1. Read summary aloud
2. Test Detective context: Does this work as evidence statement?
3. Test Player context: Does this support decision-making?
4. Check specificity: Informative without spoiling?
5. Check tone: Matches MemoryType and cluster?
6. Check length: 1-2 sentences maximum?
7. Verify against anti-patterns
```

**Step 5: Cross-Field Coherence Check**

```
1. MemoryType matches content? ✓
2. ValueRating justified by stakes? ✓
3. Summary accurately represents content? ✓
4. Summary tone matches MemoryType? ✓
5. All fields align with goal cluster? ✓
6. No contradictions across fields? ✓
```

### Quick Validation Checklist

**For rapid token review:**

- [ ] SF_MemoryType: Technical/Business/Personal matches content?
- [ ] SF_ValueRating: 1-5 justified by narrative stakes?
- [ ] SF_Group: Only populated if mechanically necessary?
- [ ] SF_Summary: Works in both Detective and Player contexts?
- [ ] Summary: 1-2 sentences, specific but not spoiling?
- [ ] Coherence: All fields align with each other?
- [ ] Cluster: Fields align with character's goal cluster?

---

## Integration with Other References

### Using with goal-clusters.md

**goal-clusters.md provides cluster-specific patterns**
**sf-mechanics.md provides technical validation**

**Workflow:**
1. goal-clusters.md: What SF_ patterns fit this character's cluster?
2. sf-mechanics.md: Are the SF_ fields technically valid?

**Example:**
- Character: Sarah (PRAGMATIC)
- goal-clusters.md: PRAGMATIC tokens typically Business MemoryType, ValueRating based on market value
- sf-mechanics.md: Verify Business category appropriate for content, validate rating justification

### Using with narrative-threads.md

**narrative-threads.md provides thread-specific content patterns**
**sf-mechanics.md provides SF_ field validation for that content**

**Workflow:**
1. narrative-threads.md: What content fits this thread?
2. sf-mechanics.md: What SF_ fields match that content?

**Example:**
- Thread: Marriage Troubles
- narrative-threads.md: Personal relationship conflict, interpersonal stakes
- sf-mechanics.md: Personal MemoryType likely, ValueRating 2-4 depending on significance

### Using with token_design_context_generator.py

**Tool outputs character context**
**This reference validates SF_ fields for that context**

**Workflow:**
1. Tool provides: Character tier, cluster, existing tokens, timeline events
2. This reference: Validates SF_ fields align with character context
3. goal-clusters.md: Provides cluster-specific patterns
4. Output: Coherent SF_ fields that match character and content

---

## Common Validation Scenarios

### Scenario 1: Technical Token for RECOVERY Character

**Question:** Derek (RECOVERY) owns token about party sound system specs

**Analysis:**
- Content: Sound system specifications, technical setup
- Owner: Derek (RECOVERY cluster)
- Challenge: Technical content, but RECOVERY typically Personal

**Resolution:**
- SF_MemoryType: Technical (content determines this)
- But frame through RECOVERY lens
- SF_Summary: "Derek's documentation of collaborative sound system"
- ValueRating: Moderate (technical asset + community memory)
- Frame: Technical specs matter because community built this

**Lesson:** MemoryType from content, but summary and rating can reflect cluster.

### Scenario 2: High ValueRating for Low-Stakes Personal Moment

**Question:** Couple's pleasant anniversary dinner - should this be high value?

**Analysis:**
- Content: Nice personal moment, no dramatic stakes
- Challenge: Temptation to rate high because "memories are precious"

**Resolution:**
- SF_MemoryType: Personal (interpersonal moment)
- SF_ValueRating: 2-3 at most (pleasant but not identity-defining)
- Blake doesn't pay premium for nice-but-not-critical memories
- Rating reflects mechanical auction value, not emotional preciousness

**Lesson:** Don't inflate ratings for sentimental reasons. Rate based on stakes and market value.

### Scenario 3: Business Content That Feels Personal

**Question:** Marcus betrayed Alex's trust in business partnership - Business or Personal?

**Analysis:**
- Content: Partnership dissolution, business fraud
- Challenge: Betrayal feels personal, but context is professional

**Resolution:**
- SF_MemoryType: Business (professional partnership context)
- Betrayal is emotionally personal, but content is business relationship
- If want both: Create two tokens (one Business fraud, one Personal betrayal impact)

**Lesson:** Context and content matter. Professional betrayal can be Business MemoryType even when emotionally charged.

### Scenario 4: Summary That Works Detective But Not Player

**Question:** "Critical evidence Detective needs to convict Marcus"

**Analysis:**
- Detective context: Clear case importance
- Player context: Dictates that exposure is correct choice
- Problem: Removes player agency, makes choice obvious

**Resolution:**
- Rewrite: "Evidence of financial irregularities in Marcus's business operations"
- Detective context: Still useful case evidence
- Player context: Understand what it is, but must decide significance
- Preserves choice tension

**Lesson:** Test both contexts. Summary should support both without dictating.

---

## Advanced: SF_ Fields and Game Balance

### Token Value Distribution

**Healthy distribution for game economy:**
- Rating 5: 5-10% of tokens (exceptional cases only)
- Rating 4: 15-20% of tokens (significant stakes)
- Rating 3: 40-50% of tokens (solid content, default)
- Rating 2: 20-30% of tokens (supporting content)
- Rating 1: <5% of tokens (edge cases)

**Why this matters:**
- Too many high-value tokens breaks economy
- Blake paying premium for everything removes choice tension
- Distribution creates meaningful differences between tokens

### MemoryType Distribution Expectations

**Varies by character cluster:**
- JUSTICE: Business + Technical heavy (evidence focus)
- RECOVERY: Personal heavy (relationship focus)
- COVERUP: Mixed all three (secrets at every level)
- PRAGMATIC: Business heavy (transactional focus)

**System-wide:** Should have healthy mix across all three categories. If one type dominates, may indicate content gaps.

### SF_Summary Consistency

**Across similar tokens:**
- Similar content should have similar summary patterns
- Parallel structure helps scanner recognition
- Consistency aids player learning

**Example:**
- All partnership betrayal tokens follow similar pattern
- "Evidence of [relationship] betrayal by [person]"
- Players learn to recognize evidence types

---

## Reference Maintenance

**When to update this reference:**

**Add validation cases:**
- When complex validation scenarios emerge
- Document resolution and reasoning
- Help future agents handle similar cases

**Refine decision trees:**
- If validation patterns become clearer
- Simplify or expand trees based on usage
- Add shortcuts for common cases

**Add examples:**
- Query existing tokens for patterns
- Document successful SF_ field combinations
- Create example library

**Update edge cases:**
- As new edge situations are encountered
- Document how they were resolved
- Expand edge case section

---

## Summary

SF_ fields create the business logic layer of token mechanics. Four fields control auction value, scanner display, and choice architecture:

**SF_ValueRating (1-5):** Blake's auction value, justified by narrative stakes
**SF_MemoryType (Technical/Business/Personal):** Content categorization based on what information contains
**SF_Group:** Collection designation, primarily "Black Market Ransom" for critical 4 tokens
**SF_Summary:** Dual-context text for Detective scoreboard and player scanner

**Critical principles:**
- Narrative stakes justify mechanical value
- Content determines MemoryType, not ownership
- Summary must work in BOTH scanner contexts
- Goal cluster influences framing but doesn't override validation rules
- Cross-field coherence essential

Use this reference for:
- Validating SF_ fields on tokens
- Designing SF_ fields for new tokens
- Resolving edge cases and complex scenarios
- Ensuring game economy and balance

For goal cluster patterns, see goal-clusters.md
For narrative thread patterns, see narrative-threads.md
For character database guidance, see SEMANTIC_MODEL_COMPLETE.md
