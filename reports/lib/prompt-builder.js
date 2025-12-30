/**
 * PromptBuilder - Assemble phase-specific prompts from ThemeLoader + session data
 *
 * Takes loaded prompt files and session data to build complete prompts
 * for each phase of the journalist pipeline.
 */

const { createThemeLoader, PHASE_REQUIREMENTS } = require('./theme-loader');

class PromptBuilder {
  /**
   * @param {ThemeLoader} themeLoader - Initialized ThemeLoader instance
   */
  constructor(themeLoader) {
    this.theme = themeLoader;
  }

  /**
   * Build arc analysis prompt
   * Phase 2: Analyze evidence for narrative arcs based on director observations
   *
   * @param {Object} sessionData - Session data
   * @param {string[]} sessionData.roster - Character names
   * @param {string} sessionData.accusation - Who was accused
   * @param {Object} sessionData.directorNotes - Director observations and whiteboard
   * @param {Object} sessionData.evidenceBundle - Three-layer evidence bundle
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArcAnalysisPrompt(sessionData) {
    const prompts = await this.theme.loadPhasePrompts('arcAnalysis');

    const systemPrompt = `You are analyzing narrative arcs for a NovaNews investigative article.

${prompts['character-voice']}

${prompts['evidence-boundaries']}`;

    const userPrompt = `Analyze the following evidence for narrative arcs.

ROSTER: ${sessionData.roster.join(', ')}
ACCUSATION: ${sessionData.accusation}

DIRECTOR OBSERVATIONS (PRIMARY WEIGHT):
${JSON.stringify(sessionData.directorNotes?.observations || {}, null, 2)}

WHITEBOARD (interpreted through observations):
${JSON.stringify(sessionData.directorNotes?.whiteboard || {}, null, 2)}

EVIDENCE BUNDLE:
${JSON.stringify(sessionData.evidenceBundle, null, 2)}

${prompts['narrative-structure']}

Return JSON with the following structure:
{
  "narrativeArcs": [
    {
      "name": "Arc Name",
      "playerEmphasis": "HIGH|MEDIUM|LOW",
      "directorObservationSupport": "What director saw that supports this",
      "evidenceTokens": ["token1", "token2"],
      "charactersFeatured": ["Name1", "Name2"],
      "summary": "Brief description"
    }
  ],
  "characterPlacementOpportunities": {
    "CharacterName": "How they can be featured based on observations"
  },
  "rosterCoverage": {
    "featured": ["names appearing prominently"],
    "mentioned": ["names appearing briefly"],
    "needsPlacement": ["names not yet covered"]
  },
  "heroImageSuggestion": {
    "filename": "suggested photo",
    "reasoning": "why this photo works"
  }
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build outline generation prompt
   * Phase 3: Generate article outline from selected arcs
   *
   * @param {Object} arcAnalysis - Arc analysis results
   * @param {string[]} selectedArcs - User-selected arc names
   * @param {string} heroImage - Confirmed hero image filename
   * @param {Object} evidenceBundle - Evidence bundle for reference
   * @param {Array} availablePhotos - List of available photos with analyses (Commit 8.24)
   * @param {Array} arcEvidencePackages - Per-arc evidence with fullContent for outline generation
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, evidenceBundle, availablePhotos = [], arcEvidencePackages = []) {
    const prompts = await this.theme.loadPhasePrompts('outlineGeneration');

    const systemPrompt = `You are creating an article outline for a NovaNews investigative piece.

${prompts['section-rules']}

${prompts['editorial-design']}`;

    // Commit 8.15: Extract arc-specific fields for outline guidance
    const arcsWithMetadata = (arcAnalysis.narrativeArcs || []).map(arc => ({
      id: arc.id,
      title: arc.title,
      arcSource: arc.arcSource,  // accusation | whiteboard | observation | discovered
      evidenceStrength: arc.evidenceStrength,  // strong | moderate | weak | speculative
      caveats: arc.caveats || [],  // Complications to acknowledge
      unansweredQuestions: arc.unansweredQuestions || [],  // Gaps for narrative tension
      analysisNotes: arc.analysisNotes || {}  // Financial/behavioral/victimization insights
    }));

    const userPrompt = `Generate an article outline using these selected arcs.

SELECTED ARCS (in order of appearance):
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

HERO IMAGE: ${heroImage}

═══════════════════════════════════════════════════════════════════════════
ARC METADATA (Commit 8.15 - use these for framing)
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(arcsWithMetadata, null, 2)}

USING ARC METADATA IN THE OUTLINE:

1. **arcSource** determines framing:
   - "accusation": This is what players concluded. Frame as "The group accused..."
   - "whiteboard": Players explored this. Frame as investigation thread.
   - "observation": Director saw this. Frame as behavioral evidence.
   - "discovered": Evidence pattern players missed. Frame as revelation.

2. **evidenceStrength** determines confidence:
   - "strong": State conclusions confidently
   - "moderate": Use "suggests", "indicates"
   - "weak": Use "hints at", "raises questions about"
   - "speculative": Use "The group believed..." with uncertainty markers

3. **caveats** become "But questions remain..." sections
   - Each caveat is a complication to weave into the narrative
   - Don't ignore complications - acknowledge them

4. **unansweredQuestions** create narrative tension in "What's Missing"
   - These become hooks for the reader
   - Nova can explicitly say "I don't know why..."

═══════════════════════════════════════════════════════════════════════════
ARC INTERWEAVING (Critical for Compulsive Readability)
═══════════════════════════════════════════════════════════════════════════

Arcs are THREADS, not CHAPTERS. Plan them as intercut narratives:

- Arc A paragraph → Arc B paragraph → Arc A continues → Arc C reveals
- Later paragraphs should RECONTEXTUALIZE earlier ones ("wait, so THAT'S why...")
- Plant details in Arc A that pay off in Arc C
- If you can shuffle arc paragraphs without breaking the narrative, you've failed

**Callback opportunities:** For each arc, identify what detail can be planted that pays off later.

═══════════════════════════════════════════════════════════════════════════
VISUAL COMPONENT RULES
═══════════════════════════════════════════════════════════════════════════

**Pull Quotes (Two Types - CRITICAL):**
1. Nova's crystallized insight = NO attribution (just styled text)
2. Verbatim evidence quote = Character name attribution (e.g., "— Victoria Chen")

Pull quotes must be VERBATIM text from evidence, NOT summaries.
- WRONG: "$163 million. That's what Skyler threatened to withdraw."
- RIGHT: "Pull your funding and I'll pull your secrets into the light." — Skyler Chen

**Photo Placement:**
- Humanize BEFORE damning revelation about that character
- Provide breathing room after intense sequences
- Cross-arc bridge: same character in different arc contexts
- ONLY use filenames from AVAILABLE PHOTOS below (do not invent paths)

═══════════════════════════════════════════════════════════════════════════
VISUAL COMPONENT PRINCIPLES
═══════════════════════════════════════════════════════════════════════════

**Each component must EARN its place:**
- Evidence cards: CLOSE or OPEN a narrative loop (not just illustrate)
- Photos: Create emotional beats (humanize before revelation, breathe after intensity)
- Pull quotes: Crystallize powerful moments (verbatim, not summaries)

**Anti-Clustering (REQUIRED):**
- No two evidence cards adjacent (prose between)
- No photo immediately after evidence card (breaks pacing)
- Distribute across sections, don't cluster in one

**Section Appropriateness:**
- LEDE: Pure prose hook (hero image optional)
- THE STORY: Primary home for evidence cards and photos
- FOLLOW THE MONEY: Financial tracker required, evidence cards optional
- THE PLAYERS: Pull quotes for standout moments
- WHAT'S MISSING: Prose-driven (no photos - maintains mystery)
- CLOSING: Reflection (no evidence cards - resolution, not revelation)

**Quality Over Quantity:**
A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.
The goal is a compelling GIFT for players, not quota compliance.

═══════════════════════════════════════════════════════════════════════════
AVAILABLE PHOTOS (Commit 8.24 - use these EXACT filenames)
═══════════════════════════════════════════════════════════════════════════

${availablePhotos.length > 0 ? availablePhotos.map((p, i) => `${i + 1}. ${p.filename}
   Characters: ${p.characters.slice(0, 3).join('; ') || 'Unknown'}
   Visual: ${(p.visualContent || '').substring(0, 100)}...`).join('\n\n') : 'No session photos available'}

IMPORTANT: When specifying photoPlacement, use the EXACT filename from above (e.g., "IMG_1234.jpg").
Do NOT use paths like "character-photos/victoria.png" - these files do not exist.

**Evidence Cards:**
- Every card must CLOSE or OPEN a loop (not just illustrate)
- CLOSER: proves what was hinted
- OPENER: raises new question while answering old

═══════════════════════════════════════════════════════════════════════════
PER-ARC EVIDENCE PACKAGES (Phase 1 Fix: Full content for quoting)
═══════════════════════════════════════════════════════════════════════════

${arcEvidencePackages.length > 0 ? arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

**Evidence Items (${pkg.evidenceItems?.length || 0} items):**
${(pkg.evidenceItems || []).slice(0, 5).map(item => `- ${item.id}: ${item.type} - "${(item.fullContent || item.summary || '').substring(0, 150)}..."
  Quotable: ${(item.quotableExcerpts || []).slice(0, 2).map(q => `"${q.substring(0, 60)}..."`).join(' | ') || 'None extracted'}`).join('\n')}

**Arc-Relevant Photos (${pkg.photos?.length || 0} photos):**
${(pkg.photos || []).map(p => `- ${p.filename}: ${p.characters?.join(', ') || 'Unknown characters'}`).join('\n') || 'No arc-specific photos'}
`).join('\n') : 'No arc evidence packages available - using evidence bundle directly'}

**Using Arc Evidence Packages:**
1. For pull quotes, use **quotableExcerpts** - these are pre-extracted verbatim text
2. For evidence cards, use **evidenceItems** with their **fullContent**
3. For photo placement, use **arc-relevant photos** that feature arc characters

═══════════════════════════════════════════════════════════════════════════
FULL ARC ANALYSIS (for complete context)
═══════════════════════════════════════════════════════════════════════════

${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE (for evidence card selection):
${JSON.stringify(evidenceBundle, null, 2)}

${prompts['narrative-structure']}

${prompts['formatting']}

${prompts['evidence-boundaries']}

═══════════════════════════════════════════════════════════════════════════
ARC-SECTION FLOW (Phase 1 Fix: Arcs flow THROUGH all sections)
═══════════════════════════════════════════════════════════════════════════

CRITICAL: Arcs are THREADS that weave through the entire article, not chapters isolated to THE STORY.

Each arc should appear in multiple sections with different focus:
- LEDE: Hooks with arc's central tension
- THE STORY: Full arc development with evidence
- FOLLOW THE MONEY: Financial angles of the arc
- THE PLAYERS: Character revelations that advance the arc
- WHAT'S MISSING: Gaps/questions raised by the arc
- CLOSING: Arc resolution or haunting continuation

Every section (except LEDE) must have "arcConnections" showing which arcs it advances.

Return JSON with the following structure:
{
  "lede": {
    "hook": "Opening hook text",
    "keyTension": "Central conflict",
    "primaryArc": "Which arc drives the hook"
  },
  "theStory": {
    "arcInterweaving": {
      "interleavingPlan": "How arcs will be intercut (not sequential)",
      "callbackOpportunities": [
        {"plantIn": "Arc A", "payoffIn": "Arc C", "detail": "What's planted and paid off"}
      ],
      "convergencePoint": "Where all arcs meet (paragraph/section location)"
    },
    "arcs": [
      {
        "name": "Arc name",
        "paragraphCount": 3,
        "evidenceCards": [{"tokenId": "xxx", "placement": "after para 1", "loopFunction": "CLOSER|OPENER"}],
        "photoPlacement": {"filename": "xxx.png", "afterParagraph": 2, "purpose": "breathing|humanize|bridge"} or null
      }
    ]
  },
  "followTheMoney": {
    "arcConnections": [
      {"arcName": "Arc A", "financialAngle": "How this arc's financial thread continues here"}
    ],
    "shellAccounts": [{"name": "X", "total": 123, "inference": "What it means", "relatedArc": "Arc name"}],
    "photoPlacement": {"filename": "xxx.png"} or null
  },
  "thePlayers": {
    "arcConnections": [
      {"arcName": "Arc A", "characterAngle": "How this arc advances through character revelation"}
    ],
    "exposed": ["names"],
    "buried": ["names"],
    "pullQuotes": [
      {"type": "verbatim", "text": "Exact quote from evidence", "attribution": "Character Name", "advancesArc": "Arc name"},
      {"type": "insight", "text": "Nova's crystallized observation", "attribution": null, "advancesArc": "Arc name"}
    ]
  },
  "whatsMissing": {
    "arcConnections": [
      {"arcName": "Arc A", "openQuestion": "What gap in this arc creates tension"}
    ],
    "knownUnknowns": ["Questions Nova explicitly noticed but couldn't answer - NOT buried evidence IDs"],
    "narrativePurpose": "How these gaps create tension and pull the reader forward"
  },
  "closing": {
    "arcResolutions": [
      {"arcName": "Arc A", "resolution": "How this arc concludes or haunts"}
    ],
    "systemicAngle": "What broader point to make",
    "accusationHandling": "How to present the accusation"
  }
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build article generation prompt
   * Phase 4: Generate final article HTML from approved outline
   *
   * Uses context engineering techniques:
   * - XML tags for clear section boundaries
   * - Recency bias: rules placed LAST in prompt
   * - Voice checkpoint: model internalizes voice before generating
   * - Voice self-check: model assesses own output
   *
   * @param {Object} outline - Approved article outline
   * @param {Object} evidenceBundle - Full evidence bundle for quoting
   * @param {string} template - HTML template content
   * @param {Array} arcEvidencePackages - Per-arc evidence with fullContent (Phase 1 Fix)
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(outline, evidenceBundle, template, arcEvidencePackages = []) {
    const prompts = await this.theme.loadPhasePrompts('articleGeneration');

    // System prompt: Identity and hard constraints (kept short for salience)
    const systemPrompt = `You are Nova, writing a NovaNews investigative article. First-person participatory voice - you WERE THERE, you SAW this happen.

HARD CONSTRAINTS (violations = failure):
- NO em-dashes (use commas or periods)
- NO "tokens" - say "extracted memories" or "memories"
- NO game mechanics ("transactions", "buried", "first-buried bonus", "guests")
- NO passive observer voice ("The group decided") - use "We decided" or "I watched them decide"
- NO third-person self-reference ("The Detective noted") - you ARE the detective
- NO countable memories ("5 memories") - memories are experiences, not inventory
- NO vague attributions ("From my notes") - use "- Nova" or character name

${prompts['evidence-boundaries']}`;

    // Format arc evidence packages for verbatim quoting
    const arcEvidenceSection = arcEvidencePackages.length > 0 ? `
ARC EVIDENCE PACKAGES (Phase 1 Fix - use these for verbatim quotes):
${arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

QUOTABLE EXCERPTS (use these VERBATIM for pull quotes and article text):
${(pkg.evidenceItems || []).flatMap(item =>
  (item.quotableExcerpts || []).map(q => `- "${q}" (from ${item.id})`)
).join('\n') || 'No extracted quotes - use fullContent directly'}

FULL EVIDENCE (for context and additional quoting):
${(pkg.evidenceItems || []).map(item =>
  `${item.id} (${item.type}): "${(item.fullContent || item.summary || '').substring(0, 300)}..."`
).join('\n')}

ARC PHOTOS:
${(pkg.photos || []).map(p => `- ${p.filename}: ${p.characters?.join(', ') || 'Unknown'}`).join('\n') || 'None'}
`).join('\n---\n')}
` : '';

    // User prompt: Data first, then template, then RULES LAST (recency bias)
    const userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

EVIDENCE BUNDLE (quote ONLY from exposed evidence):
${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
</DATA_CONTEXT>

<TEMPLATE>
${template}
</TEMPLATE>

<RULES>
${prompts['section-rules']}

${prompts['narrative-structure']}

${prompts['formatting']}

${prompts['editorial-design']}
</RULES>

<ARC_FLOW>
CRITICAL: Arcs are THREADS that weave through the entire article.

Use the outline's arcConnections in each section:
- THE STORY: Interweave arcs per the interleavingPlan
- FOLLOW THE MONEY: Continue arc threads through financial lens per arcConnections
- THE PLAYERS: Advance arcs through character revelations per arcConnections
- WHAT'S MISSING: Honor the knownUnknowns - gaps Nova noticed, NOT buried evidence IDs
- CLOSING: Resolve or haunt per arcResolutions

If the reader can identify where one arc ends and another begins, you've failed.
Arc boundaries should feel like a conversation topic shifting, not a chapter break.
</ARC_FLOW>

<VISUAL_DISTRIBUTION>
Visual components EARN their place by serving the narrative.

PRINCIPLES:
- Evidence cards: CLOSE or OPEN a narrative loop (not just illustrate)
- Photos: Create emotional beats (humanize before revelation, breathe after intensity)
- Pull quotes: Crystallize powerful moments (verbatim, not summaries)

ANTI-CLUSTERING:
- No two evidence cards adjacent (prose between)
- No photo immediately after evidence card (breaks pacing)
- Distribute across sections, don't cluster in one

SECTION APPROPRIATENESS:
- LEDE: Pure prose hook (hero image optional)
- THE STORY: Primary home for evidence cards and photos
- FOLLOW THE MONEY: Financial tracker required
- THE PLAYERS: Pull quotes for standout moments
- WHAT'S MISSING: Prose-driven (no photos)
- CLOSING: Reflection (no evidence cards)

Quality over quantity. A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.
</VISUAL_DISTRIBUTION>

<ANTI_PATTERNS>
${prompts['anti-patterns']}
</ANTI_PATTERNS>

<VOICE_CHECKPOINT>
Before generating, internalize Nova's voice:
${prompts['character-voice']}

${prompts['writing-principles']}

Ask yourself: "Am I writing AS Nova who experienced this, or ABOUT events Nova observed?"
The answer must be AS Nova. Every sentence should feel like it's coming from someone who was in that room.
</VOICE_CHECKPOINT>

<GENERATION_INSTRUCTION>
Generate structured article content as JSON matching the ContentBundle schema.

STRUCTURE:
1. "sections" - Array of article sections, each with:
   - "id": Section identifier (lede, the-story, follow-the-money, the-players, whats-missing, closing)
   - "type": Section type for styling (narrative, evidence-highlight, investigation-notes, conclusion)
   - "heading": Optional section heading
   - "content": Array of content blocks:
     * {"type": "paragraph", "text": "..."} - Prose text
     * {"type": "quote", "text": "...", "attribution": "..."} - Inline quotes
     * {"type": "evidence-reference", "tokenId": "xxx", "caption": "..."} - Reference to evidence card
     * {"type": "list", "items": [...], "ordered": false} - Lists

2. "evidenceCards" - Array of evidence card content:
   - "tokenId": ID matching evidence-reference blocks
   - "headline": Card headline (compelling, not just descriptive)
   - "summary": Brief context
   - "significance": "critical" | "supporting" | "contextual"

   CRITICAL: Cards are VISUAL COMPONENTS for compulsive readability:
   - Each card is a CLOSER (proves what was hinted) or OPENER (raises new question)
   - The prose BEFORE sets up tension, prose AFTER draws implications
   - Distribute across sections per the outline - NOT all in THE STORY

3. "pullQuotes" - Featured quotes for sidebar (distribute across 2+ sections)

4. "photos" - Session photos with placement:
   - "filename": EXACT filename from available photos
   - "caption": Caption text
   - "sectionId": Which section it appears in

5. "financialTracker" - Shell account entries (required for FOLLOW THE MONEY)

6. "headline" - Article headline with main, kicker, deck

7. "voice_self_check" - Self-assessment against ALL voice requirements:

   VOICE INFLUENCES CHECK:
   - Hunter S. Thompson: Am I participatory, in-the-muck, part of the chaos? NOT observing from outside?
   - Kara Swisher: Am I direct, calling out BS, no corporate spin tolerance?
   - Casey Newton: Am I explaining tech clearly, accessible but not dumbed down?
   - Heather Cox Richardson: Am I connecting to bigger patterns, systemic meaning?
   - Marisa Kabas: Am I maintaining moral clarity without preaching?

   VOICE MECHANICS CHECK:
   - First-person witness: "I watched", "I saw" NOT "The group decided"
   - Sentence rhythm: Short punchy, then longer building, then short again
   - No em-dashes (commas or periods instead)
   - "Extracted memories" NOT "tokens"
   - Celebrating sources who exposed, understanding those who buried
   - Systemic critique woven throughout, not just in closing

   ANTI-PATTERN CHECK:
   - Any passive/observer voice that slipped through?
   - Any game mechanics language?
   - Any generic praise or vague attribution?
</GENERATION_INSTRUCTION>`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build revision prompt
   * Phase 4b: Revise article based on voice self-check findings
   *
   * Uses Sonnet for targeted fixes (faster than Opus for surgical edits)
   * Accepts either ContentBundle JSON or assembled HTML as input.
   *
   * @param {string} articleContent - Generated article (ContentBundle JSON or HTML)
   * @param {string} voiceSelfCheck - Self-assessment from initial generation
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildRevisionPrompt(articleContent, voiceSelfCheck) {
    const prompts = await this.theme.loadPhasePrompts('articleGeneration');

    const systemPrompt = `You are Nova, revising your investigative article to fix voice issues you identified.

REVISION RULES:
- Make TARGETED fixes only - do not rewrite sections that are working
- Preserve structure: sections, evidence cards, photos, pull quotes, financial tracker
- Focus on the specific issues you identified in your self-check
- Every fix should make the voice MORE participatory, not less

VOICE INFLUENCES TO EMBODY:
- Hunter S. Thompson: Participatory, in-the-muck, part of the chaos
- Kara Swisher: Directness, calling out BS, no corporate spin
- Casey Newton: Tech fluency, accessible explanations
- Heather Cox Richardson: Connects to bigger patterns
- Marisa Kabas: Moral clarity without preaching

VOICE MECHANICS:
- First-person participatory: "I watched", "I saw", "I was there"
- NOT observer mode: "The group decided", "They concluded", "It was noted"
- Transform: "The group came to a conclusion" -> "I watched them reach their conclusion"
- Transform: "From my notes that night" -> remove attribution or use "- Nova"
- Transform: "guests" -> "people" or "those present" or "partygoers"
- Sentence rhythm: Short punchy, then longer building, then short again`;

    const userPrompt = `<YOUR_SELF_CHECK>
${voiceSelfCheck}
</YOUR_SELF_CHECK>

<ARTICLE_TO_REVISE>
${articleContent}
</ARTICLE_TO_REVISE>

<ANTI_PATTERNS_REFERENCE>
${prompts['anti-patterns']}
</ANTI_PATTERNS_REFERENCE>

<REVISION_INSTRUCTION>
Fix the issues you identified in your self-check. Also check for:
- "guests" -> "people" or "those present" or "partygoers"
- "From my notes that night" -> "- Nova" or remove
- Any remaining passive/observer voice patterns
- Any em-dashes that slipped through
- Generic praise or vague attributions
- Game mechanics language ("tokens", "transactions", "buried bonus")

Return JSON with:
1. "contentBundle" - Revised ContentBundle (if input was JSON) with all sections, evidenceCards, pullQuotes, photos preserved
2. "html" - Revised HTML (if input was HTML)
3. "fixes_applied" - List of specific fixes you made (be specific about what changed and which voice influence guided each fix)
</REVISION_INSTRUCTION>`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build validation prompt
   * Phase 5: Validate article against anti-patterns
   *
   * @param {string} articleHtml - Generated article HTML
   * @param {string[]} roster - Character roster for coverage check
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildValidationPrompt(articleHtml, roster) {
    const prompts = await this.theme.loadPhasePrompts('validation');

    const systemPrompt = `You are validating a NovaNews article against anti-patterns and voice requirements.

ANTI-PATTERNS CHECKLIST:
${prompts['anti-patterns']}

VOICE REQUIREMENTS:
${prompts['character-voice']}

EVIDENCE BOUNDARIES:
${prompts['evidence-boundaries']}`;

    const userPrompt = `Validate this article against all anti-patterns.

CHARACTER ROSTER (all must be mentioned):
${roster.join(', ')}

ARTICLE HTML:
${articleHtml}

Check for:
1. Em-dashes (— or --)
2. "token/tokens" instead of "extracted memory"
3. Game mechanics language ("Act 3", "final call", "first burial", "guest/guests")
4. Vague attribution ("from my notes", "sources say")
5. Passive/neutral voice (should be participatory)
6. Missing roster members
7. Blake condemned (should be suspicious but nuanced)
8. Missing systemic critique in CLOSING

Return JSON:
{
  "passed": true|false,
  "issues": [
    {
      "type": "em_dash|token_language|game_mechanics|vague_attribution|passive_voice|missing_character|blake_condemned",
      "line": 123,
      "text": "the problematic text",
      "fix": "suggested fix"
    }
  ],
  "voice_score": 1-5,
  "voice_notes": "assessment of voice consistency",
  "roster_coverage": {
    "featured": ["names"],
    "mentioned": ["names"],
    "missing": ["names"]
  },
  "systemic_critique_present": true|false,
  "blake_handled_correctly": true|false
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Get required prompts for a phase (for debugging/logging)
   * @param {string} phase - Phase name
   * @returns {string[]} - List of required prompt names
   */
  getPhaseRequirements(phase) {
    return PHASE_REQUIREMENTS[phase] || [];
  }
}

/**
 * Factory function to create PromptBuilder with default ThemeLoader
 * @param {string} customSkillPath - Optional custom path to skill directory
 * @returns {PromptBuilder}
 */
function createPromptBuilder(customSkillPath = null) {
  const themeLoader = createThemeLoader(customSkillPath);
  return new PromptBuilder(themeLoader);
}

module.exports = {
  PromptBuilder,
  createPromptBuilder
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('PromptBuilder Self-Test\n');

    const builder = createPromptBuilder();

    // Validate theme loader first
    const validation = await builder.theme.validate();
    if (!validation.valid) {
      console.error('Theme validation failed:', validation.missing);
      process.exit(1);
    }
    console.log('Theme files validated.\n');

    // Test arc analysis prompt build
    console.log('Building arcAnalysis prompt...');
    const mockSessionData = {
      roster: ['Alex', 'James', 'Victoria', 'Morgan', 'Derek'],
      accusation: 'Victoria and Morgan',
      directorNotes: {
        observations: {
          behaviorPatterns: ['Test observation 1', 'Test observation 2']
        },
        whiteboard: {
          suspects: ['Derek', 'Victoria']
        }
      },
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [] }
      }
    };

    const { systemPrompt, userPrompt } = await builder.buildArcAnalysisPrompt(mockSessionData);

    console.log(`System prompt: ${systemPrompt.length} chars`);
    console.log(`User prompt: ${userPrompt.length} chars`);
    console.log(`Total: ${systemPrompt.length + userPrompt.length} chars\n`);

    // Show phase requirements
    console.log('Phase requirements:');
    Object.keys(PHASE_REQUIREMENTS).forEach(phase => {
      const reqs = builder.getPhaseRequirements(phase);
      console.log(`  ${phase}: ${reqs.length} prompts`);
    });
  })();
}
