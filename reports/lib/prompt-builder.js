/**
 * PromptBuilder - Assemble phase-specific prompts from ThemeLoader + session data
 *
 * Takes loaded prompt files and session data to build complete prompts
 * for each phase of the journalist pipeline.
 */

const { createThemeLoader, PHASE_REQUIREMENTS } = require('./theme-loader');
const { getThemeConfig } = require('./theme-config');

/**
 * Generate canonical character roster section from theme config
 * DRY: Single source of truth is theme-config.js canonicalCharacters
 *
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @returns {string} Formatted roster section for prompts
 */
function generateRosterSection(theme = 'journalist') {
  const config = getThemeConfig(theme);
  const characters = config?.canonicalCharacters || {};

  const lines = Object.entries(characters)
    .map(([first, full]) => `- ${first} → ${full}`)
    .join('\n');

  return `CANONICAL CHARACTER ROSTER:
Use ONLY these full names in ALL article text. NEVER invent different last names:
${lines}`;
}

/**
 * Wrap prompt content with XML tags for AI cross-referencing
 *
 * Uses XML tags for consistency with Claude's training and token efficiency.
 * Cross-references use tag names: "See <narrative-structure> Section 8"
 *
 * @param {string} filename - The prompt file name (e.g., 'narrative-structure')
 * @param {string} content - The prompt file content
 * @returns {string} XML-wrapped content
 */
function labelPromptSection(filename, content) {
  if (!content || !content.trim()) return '';
  return `<${filename}>
${content.trim()}
</${filename}>`;
}

// Theme-specific system prompt framing
const THEME_SYSTEM_PROMPTS = {
  journalist: {
    arcAnalysis: 'You are analyzing narrative arcs for a NovaNews investigative article.',
    outlineGeneration: 'You are creating an article outline for a NovaNews investigative piece.',
    articleGeneration: `You are Nova, writing a NovaNews investigative article. First-person participatory voice - you WERE THERE, you SAW this happen.`,
    revision: `You are Nova, revising your investigative article to fix voice issues you identified.`,
    validation: 'You are validating a NovaNews article against anti-patterns and voice requirements.'
  },
  detective: {
    arcAnalysis: 'You are analyzing narrative threads for a detective investigation case report. Identify thematic clusters from the evidence that can be synthesized into a coherent case file.',
    outlineGeneration: 'You are planning the structure of Detective Anondono\'s case report. Each section answers a DIFFERENT QUESTION about the same underlying facts.',
    articleGeneration: `You are a cynical, seasoned Detective in a near-future noir setting. You are writing an official Case Report.

TONE: Professional, analytical, with a distinct noir flair. Economical with words. Every sentence earns its place.
FORMAT: HTML (body content only, NO <html>, <head>, or <body> tags).`,
    revision: 'You are revising Detective Anondono\'s case report to fix structural or factual issues. Make TARGETED fixes only.',
    validation: 'You are validating a detective case report against anti-patterns and section differentiation requirements.'
  }
};

// Theme-specific hard constraints and voice guidance
const THEME_CONSTRAINTS = {
  journalist: {
    hardConstraints: `HARD CONSTRAINTS (violations = failure):
- NO em-dashes (use commas or periods)
- NO "tokens" - say "extracted memories" or "memories"
- NO game mechanics ("transactions", "buried", "first-buried bonus", "guests")
- NO passive observer voice ("The group decided") - use "We decided" or "I watched them decide"
- NO third-person self-reference ("The Detective noted") - you ARE the detective
- NO countable memories ("5 memories") - memories are experiences, not inventory
- NO inventing last names - use ONLY canonical names from the roster above`,
    voiceCheckpoint: `Before generating, internalize Nova's voice:`,
    voiceQuestion: 'Ask yourself: "Am I writing AS Nova who experienced this, or ABOUT events Nova observed?"\nThe answer must be AS Nova. Every sentence should feel like it\'s coming from someone who was in that room.',
    revisionVoice: `VOICE INFLUENCES TO EMBODY:
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
- Sentence rhythm: Short punchy, then longer building, then short again`
  },
  detective: {
    hardConstraints: `CRITICAL WRITING PRINCIPLES:
- SYNTHESIZE evidence into thematic groups—do NOT list every item individually
- Tell the STORY of what happened—do NOT catalog facts
- Each report must feel BESPOKE to this specific case—reference unique details
- Avoid repetition—each fact appears ONCE in the most impactful location
- TARGET LENGTH: 750 words (+-50 words acceptable)

FACTUAL ACCURACY (CRITICAL - NEVER VIOLATE):
- Only state facts EXPLICITLY supported by the evidence provided
- Do NOT infer group memberships, relationships, or details unless directly stated
- If evidence is ambiguous or incomplete, acknowledge uncertainty

EVIDENCE REFERENCING (CRITICAL):
- Call them "memory extractions", "recovered memories", or "scanned memories"
- NEVER use "Memory Token", token codes, database names, RFID codes, or item IDs
- NEVER reference "character sheets" as sources—present as background knowledge
- NO inventing last names - use ONLY canonical names from the roster above`,
    voiceCheckpoint: 'Before generating, internalize Detective Anondono\'s voice:',
    voiceQuestion: 'Ask yourself: "Am I writing a professional case report that synthesizes evidence, or am I just listing facts?"\nThe answer must be synthesis. Every section answers a different question about the same underlying facts.',
    revisionVoice: `DETECTIVE VOICE:
- Third-person investigative: "The investigation revealed..." not "I saw..."
- Professional noir: world-weary but precise, economical with words
- In-world always: never reference game mechanics
- Section differentiation: each section answers a DIFFERENT question
- Name formatting: ALL names in <strong> tags, evidence in <em> tags`
  }
};

class PromptBuilder {
  /**
   * @param {ThemeLoader} themeLoader - Initialized ThemeLoader instance
   * @param {string} themeName - Theme name (default: 'journalist')
   */
  constructor(themeLoader, themeName = 'journalist') {
    this.theme = themeLoader;
    this.themeName = themeName;
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

    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].arcAnalysis}
${labelPromptSection('character-voice', prompts['character-voice'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}`;

    const userPrompt = `Analyze the following evidence for narrative arcs.

ROSTER: ${sessionData.roster.join(', ')}
ACCUSATION: ${sessionData.accusation}

DIRECTOR OBSERVATIONS (PRIMARY WEIGHT):
${JSON.stringify(sessionData.directorNotes?.observations || {}, null, 2)}

WHITEBOARD (interpreted through observations):
${JSON.stringify(sessionData.directorNotes?.whiteboard || {}, null, 2)}

EVIDENCE BUNDLE:
${JSON.stringify(sessionData.evidenceBundle, null, 2)}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
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

    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].outlineGeneration}
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('editorial-design', prompts['editorial-design'])}`;

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

    let userPrompt;

    if (this.themeName === 'detective') {
      userPrompt = `Generate a case report outline using these selected narrative threads.

SELECTED THREADS (in order of significance):
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

<arc-metadata>
${JSON.stringify(arcsWithMetadata, null, 2)}

USING THREAD METADATA IN THE OUTLINE:

1. **arcSource** determines framing:
   - "accusation": The suspects concluded this. Frame as "The group accused..."
   - "whiteboard": Investigation thread explored by subjects. Frame as lead.
   - "observation": Observed behavioral pattern. Frame as investigative finding.
   - "discovered": Evidence pattern subjects missed. Frame as detective's insight.

2. **evidenceStrength** determines confidence:
   - "strong": State findings with authority
   - "moderate": Use "evidence suggests", "indicators point to"
   - "weak": Use "warrants further investigation", "inconclusive"
   - "speculative": Use "subjects believed..." with noted uncertainty

3. **caveats** become investigative complications
   - Each caveat is a gap in the evidence chain

4. **unansweredQuestions** feed OUTSTANDING QUESTIONS section
   - These represent genuine investigative gaps
</arc-metadata>

<evidence-context>

${arcEvidencePackages.length > 0 ? arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

**Evidence Items (${pkg.evidenceItems?.length || 0} items):**
${(pkg.evidenceItems || []).slice(0, 5).map(item => `- ${item.id}: ${item.type}
  Content: "${item.fullContent || item.summary || ''}"`).join('\n')}
`).join('\n') : 'No arc evidence packages available - using evidence bundle directly'}
</evidence-context>

<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE:
${JSON.stringify(evidenceBundle, null, 2)}
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>

<section-guidance>
CRITICAL: This is a CASE REPORT, not a narrative article. Each section answers a DIFFERENT QUESTION:

- EXECUTIVE SUMMARY: What happened? (Hook + factual overview + top findings)
- EVIDENCE LOCKER: What does the evidence show? (Thematically grouped, synthesized—NOT listed)
- MEMORY ANALYSIS (optional): What do the memory extraction patterns reveal?
- SUSPECT NETWORK: Who are the key players and how do they connect?
- OUTSTANDING QUESTIONS: What remains unknown?
- FINAL ASSESSMENT: What is the detective's conclusion?

SECTION DIFFERENTIATION is critical. If a fact appears in one section, it should NOT repeat in another.
The report should feel BESPOKE to this specific case—reference unique details, not generic observations.

TARGET LENGTH: ~750 words total. Be economical. Every sentence earns its place.
</section-guidance>

Return JSON with the following structure:
{
  "executiveSummary": {
    "hook": "Opening line establishing case tension",
    "caseOverview": "Brief factual summary of the case",
    "primaryFindings": ["Top finding 1", "Top finding 2", "Top finding 3"]
  },
  "evidenceLocker": {
    "evidenceGroups": [
      {
        "theme": "Thematic grouping (e.g., 'Financial Irregularities')",
        "evidenceIds": ["evidence-id-1", "evidence-id-2"],
        "synthesis": "What this group reveals together"
      }
    ]
  },
  "memoryAnalysis": {
    "focus": "What memory extraction patterns reveal",
    "keyPatterns": ["Notable pattern 1"],
    "significance": "Why these patterns matter"
  },
  "suspectNetwork": {
    "keyRelationships": [
      {"characters": ["Name1", "Name2"], "nature": "Relationship description"}
    ],
    "assessments": [
      {"name": "Character", "role": "Their role in events", "suspicionLevel": "high|moderate|low"}
    ]
  },
  "outstandingQuestions": {
    "questions": ["Unanswered question 1", "Unanswered question 2"],
    "investigativeGaps": "Summary of what remains unknown"
  },
  "finalAssessment": {
    "accusationHandling": "How the group's accusation relates to evidence",
    "verdict": "Detective's overall assessment",
    "closingLine": "Final noir closing line"
  }
}`;
    } else {
      // Journalist (NovaNews article) outline prompt
      userPrompt = `Generate an article outline using these selected arcs.

SELECTED ARCS (in order of appearance):
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

HERO IMAGE: ${heroImage}

<arc-metadata>
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
</arc-metadata>

<arc-interweaving>
See <arc-flow> for complete interweaving philosophy. Key points:
- Arcs are THREADS, not CHAPTERS
- Plan callback opportunities (details planted in Arc A that pay off in Arc C)
- All arcs must converge at a specific point in THE STORY
</arc-interweaving>

<visual-rules>
See <narrative-structure> Section 8 for complete visual component rules.

**Pull Quotes (Key Points):**
- VERBATIM: Exact quote from evidence WITH character attribution
- CRYSTALLIZATION: Journalist insight, NO attribution (NEVER "— Nova")

**Photo Placement:**
- Humanize BEFORE damning revelation about that character
- ONLY use filenames from AVAILABLE PHOTOS below
</visual-rules>

<visual-principles>
**Each component must EARN its place:**
- Evidence cards: CLOSE or OPEN a narrative loop (not just illustrate)
- Photos: Create emotional beats (humanize before revelation, breathe after intensity)
- Pull quotes: Crystallize powerful moments (verbatim, not summaries)

**Anti-Clustering:** See <narrative-structure> Visual Rhythm Rules (rules 6-8)

**Section Appropriateness:**
- LEDE: Pure prose hook (hero image optional)
- THE STORY: Primary home for evidence cards and photos
- FOLLOW THE MONEY: Financial tracker required, evidence cards optional
- THE PLAYERS: Pull quotes for standout moments
- WHAT'S MISSING: Prose-driven (photos optional for emotional beats)
- CLOSING: Evidence cards optional, pull quotes for final crystallization

**Quality Over Quantity:**
A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.
The goal is a compelling GIFT for players, not quota compliance.
</visual-principles>

<available-photos>

${availablePhotos.length > 0 ? availablePhotos.map((p, i) => `${i + 1}. ${p.filename}
   Characters: ${p.characters.slice(0, 3).join('; ') || 'Unknown'}
   Visual: ${(p.visualContent || '').substring(0, 100)}...`).join('\n\n') : 'No session photos available'}

IMPORTANT: When specifying photoPlacement, use the EXACT filename from above (e.g., "IMG_1234.jpg").
Do NOT use paths like "character-photos/victoria.png" - these files do not exist.

**Evidence Cards:**
- Every card must CLOSE or OPEN a loop (not just illustrate)
- CLOSER: proves what was hinted
- OPENER: raises new question while answering old
</available-photos>

<arc-evidence>

${arcEvidencePackages.length > 0 ? arcEvidencePackages.map(pkg => `
### ${pkg.arcId} - ${pkg.arcTitle}

**Evidence Items (${pkg.evidenceItems?.length || 0} items):**
${(pkg.evidenceItems || []).slice(0, 5).map(item => `- ${item.id}: ${item.type}
  Full Content: "${item.fullContent || item.summary || ''}"
  Quotable: ${(item.quotableExcerpts || []).slice(0, 2).map(q => `"${q}"`).join(' | ') || 'None extracted'}`).join('\n')}

**Arc-Relevant Photos (${pkg.photos?.length || 0} photos):**
${(pkg.photos || []).map(p => `- ${p.filename}: ${p.characters?.join(', ') || 'Unknown characters'}`).join('\n') || 'No arc-specific photos'}
`).join('\n') : 'No arc evidence packages available - using evidence bundle directly'}

**Using Arc Evidence Packages:**
1. For pull quotes, use **quotableExcerpts** - these are pre-extracted verbatim text
2. For evidence cards, use **evidenceItems** with their **fullContent**
3. For photo placement, use **arc-relevant photos** that feature arc characters
</arc-evidence>

<arc-analysis>
${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE (for evidence card selection):
${JSON.stringify(evidenceBundle, null, 2)}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('arc-flow', prompts['arc-flow'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}
</arc-analysis>

<arc-section-flow>
CRITICAL: Arcs are THREADS that weave through the entire article, not chapters isolated to THE STORY.

Each arc should appear in multiple sections with different focus:
- LEDE: Hooks with arc's central tension
- THE STORY: Full arc development with evidence
- FOLLOW THE MONEY: Financial angles of the arc
- THE PLAYERS: Character revelations that advance the arc
- WHAT'S MISSING: Gaps/questions raised by the arc
- CLOSING: Arc resolution or haunting continuation

Every section (except LEDE) must have "arcConnections" showing which arcs it advances.
</arc-section-flow>

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
    }

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
   * @param {string|null} heroImage - Hero image filename (prevents duplicate in photos)
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(outline, evidenceBundle, template, arcEvidencePackages = [], heroImage = null) {
    const prompts = await this.theme.loadPhasePrompts('articleGeneration');

    // System prompt: Identity and hard constraints (kept short for salience)
    // Roster in system prompt for higher salience (prevents name hallucination)
    const constraints = THEME_CONSTRAINTS[this.themeName];
    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].articleGeneration}

${generateRosterSection(this.themeName)}

${constraints.hardConstraints}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}`;

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
  `${item.id} (${item.type}): "${item.fullContent || item.summary || ''}"`
).join('\n')}

ARC PHOTOS:
${(pkg.photos || []).map(p => `- ${p.filename}: ${p.characters?.join(', ') || 'Unknown'}`).join('\n') || 'None'}
`).join('\n---\n')}
` : '';

    // User prompt: Data first, then template, then RULES LAST (recency bias)
    // Branch by theme — detective gets simplified case report prompt, journalist gets full article prompt
    let userPrompt;

    if (this.themeName === 'detective') {
      userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

HERO IMAGE:
Filename: ${heroImage || 'Use first available photo from outline'}
- Use this exact filename in the "heroImage" field
- Do NOT include this filename in the "photos" array

EVIDENCE BUNDLE:
${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
</DATA_CONTEXT>

<TEMPLATE>
${template}
</TEMPLATE>

<RULES>
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}

${generateRosterSection(this.themeName)}
</RULES>

<SECTION_GUIDANCE>
CRITICAL: This is a CASE REPORT. Each section answers a DIFFERENT QUESTION about the same underlying facts.

- EXECUTIVE SUMMARY: What happened? (Hook + factual overview + top findings)
- EVIDENCE LOCKER: What does the evidence show? (Thematically grouped, synthesized — NOT listed individually)
- MEMORY ANALYSIS (optional): What do the memory extraction patterns reveal?
- SUSPECT NETWORK: Who are the key players and how do they connect?
- OUTSTANDING QUESTIONS: What remains unknown or unresolved?
- FINAL ASSESSMENT: What is the detective's conclusion?

SECTION DIFFERENTIATION is critical. If a fact appears in one section, it should NOT repeat in another.
The report should feel BESPOKE to this specific case — reference unique details, not generic observations.
</SECTION_GUIDANCE>

<ANTI_PATTERNS>
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
</ANTI_PATTERNS>

<VOICE_CHECKPOINT>
${constraints.voiceCheckpoint}
${labelPromptSection('character-voice', prompts['character-voice'])}
${labelPromptSection('writing-principles', prompts['writing-principles'])}
${constraints.voiceQuestion}
</VOICE_CHECKPOINT>

<GENERATION_INSTRUCTION>
Generate structured case report content as JSON matching the ContentBundle schema.

STRUCTURE:
1. "sections" - Array of report sections, each with:
   - "id": Section identifier (executive-summary, evidence-locker, memory-analysis, suspect-network, outstanding-questions, final-assessment)
   - "type": Section type for styling (case-summary, evidence-highlight, narrative, investigation-notes, conclusion)
   - "heading": Section heading
   - "content": Array of content blocks:
     * {"type": "paragraph", "text": "..."} - Prose text
     * {"type": "quote", "text": "...", "attribution": "..."} - Inline quotes
     * {"type": "evidence-reference", "tokenId": "xxx", "caption": "..."} - Evidence reference
     * {"type": "list", "items": [...], "ordered": false} - Lists

2. "headline" - Report headline with:
   - "main": Case report title
   - "kicker": Optional subtitle
   - "deck": Brief summary line

3. "byline" - Author information:
   - "author": "Detective Anondono"
   - "title": "Lead Investigator"

4. "photos" - Session photos with placement:
   - "filename": EXACT filename from available photos (do NOT include hero image here)
   - "caption": Caption text
   - "characters": Array of character names visible
   - "placement": "inline" or "sidebar"
   - "afterSection": Section ID after which photo appears

5. "heroImage" - Hero image filename (same as HERO IMAGE above)

6. "voice_self_check" - Self-assessment:
   - Is the tone professional and analytical with noir flair?
   - Does each section answer a DIFFERENT question?
   - Are names in <strong> tags, evidence in <em> tags?
   - Is the report ~750 words?
   - Are facts synthesized (not cataloged)?
   - No game mechanics language?

Do NOT include pullQuotes, evidenceCards, or financialTracker — these are journalist-specific components.

TARGET LENGTH: ~750 words (+-50 words acceptable). Be economical. Every sentence earns its place.
</GENERATION_INSTRUCTION>`;
    } else {
      // Journalist (NovaNews article) prompt — full article with visual components
      userPrompt = `<DATA_CONTEXT>
APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

HERO IMAGE (CRITICAL - do NOT duplicate):
Filename: ${heroImage || 'Use first available photo from outline'}
This image is the HERO IMAGE at the top of the article.
- Use this exact filename in the "heroImage" field
- Do NOT include this filename in the "photos" array (it would cause duplication)
- Inline photos must use DIFFERENT photos from the session

EVIDENCE BUNDLE (quote ONLY from exposed evidence):
${JSON.stringify(evidenceBundle, null, 2)}
${arcEvidenceSection}
</DATA_CONTEXT>

<TEMPLATE>
${template}
</TEMPLATE>

<RULES>
${labelPromptSection('section-rules', prompts['section-rules'])}
${labelPromptSection('narrative-structure', prompts['narrative-structure'])}
${labelPromptSection('arc-flow', prompts['arc-flow'])}
${labelPromptSection('formatting', prompts['formatting'])}
${labelPromptSection('editorial-design', prompts['editorial-design'])}

${generateRosterSection()}
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

ANTI-CLUSTERING: See <narrative-structure> Visual Rhythm Rules (rules 6-8)

SECTION APPROPRIATENESS (authoritative):
| Section          | Evidence Cards | Photos    | Pull Quotes |
|------------------|----------------|-----------|-------------|
| LEDE             | No             | Hero only | No          |
| THE STORY        | Yes            | Yes       | Yes         |
| FOLLOW THE MONEY | Optional       | Optional  | Yes         |
| THE PLAYERS      | Optional       | Yes       | Yes         |
| WHAT'S MISSING   | No             | Yes       | Optional    |
| CLOSING          | Optional       | Optional  | Yes (1 max) |

Quality over quantity. A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.
</VISUAL_DISTRIBUTION>

<VISUAL_COMPONENT_TYPES>
CRITICAL: Understand the difference between evidence-card and evidence-reference.

EVIDENCE-CARD (inline, full display):
- Goes in sections[].content[] array
- type: "evidence-card"
- REQUIRES: tokenId, headline, content (VERBATIM from arcEvidencePackages.evidenceItems[].fullContent), owner, significance
- SHOWS: Full evidence as styled card in article body
- USE FOR: Narrative climax moments, proving claims, CLOSING or OPENING a loop

EVIDENCE-REFERENCE (link only):
- Goes in sections[].content[] array
- type: "evidence-reference"
- REQUIRES: tokenId only (plus optional caption)
- SHOWS: Small diamond icon linking to sidebar
- USE FOR: Brief mentions, sidebar navigation ONLY

IF YOU WANT EVIDENCE DISPLAYED INLINE: You MUST use "evidence-card" type.
Using "evidence-reference" will NOT display content - it only creates a link.

EVIDENCE-CARD INLINE EXAMPLE:
{
  "id": "the-story",
  "type": "narrative",
  "content": [
    {"type": "paragraph", "text": "I watched them circle each other, Victoria's composure finally cracking..."},
    {"type": "evidence-card", "tokenId": "jav042", "headline": "The Moment of Truth", "content": "JAV042 - 12:17AM - [Full verbatim text from arcEvidencePackages.evidenceItems[].fullContent - do NOT truncate or summarize]", "owner": "Jamie Woods", "significance": "critical"},
    {"type": "paragraph", "text": "After that, nothing was the same between them..."}
  ]
}

PULL QUOTES (2 types):
- VERBATIM: Exact quote from evidence WITH character attribution ("— Victoria Kingsley")
- CRYSTALLIZATION: Journalist insight, NO attribution (NEVER "— Nova")

MINIMUM REQUIREMENTS:
- At least 3 evidence-card blocks across sections (in sections[].content[], NOT just evidenceCards[])
- At least 2 pull quotes distributed across 2+ sections
- No two evidence-cards adjacent (separate with prose)
</VISUAL_COMPONENT_TYPES>

<ANTI_PATTERNS>
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
</ANTI_PATTERNS>

<VOICE_CHECKPOINT>
${constraints.voiceCheckpoint}
${labelPromptSection('character-voice', prompts['character-voice'])}
${labelPromptSection('writing-principles', prompts['writing-principles'])}
${constraints.voiceQuestion}
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
   - "content": VERBATIM full text - COPY EXACTLY from arcEvidencePackages fullContent, include tokenId/timestamp prefix
   - "summary": Brief 100-char summary for sidebar display
   - "owner": Character canonical full name
   - "significance": "critical" | "supporting" | "contextual"

   CRITICAL: Cards are VISUAL COMPONENTS for compulsive readability:
   - Each card is a CLOSER (proves what was hinted) or OPENER (raises new question)
   - The prose BEFORE sets up tension, prose AFTER draws implications
   - Distribute across sections per the outline - NOT all in THE STORY

   EVIDENCE CARD DUAL FIELDS:
   - "content" = VERBATIM memory text for BODY inline cards
     * COPY EXACTLY from arcEvidencePackages evidenceItems[].fullContent
     * Include tokenId prefix and timestamp (e.g., "JAV042 - 12:17AM - ...")
     * Do NOT paraphrase or summarize

   - "summary" = Brief 100-char summary for SIDEBAR mini-cards
     * Write your own concise summary
     * Keep under 100 characters

   Template rendering:
   - Body cards: content-blocks/evidence-card.hbs uses {{content}}
   - Sidebar cards: sidebar/evidence-card.hbs uses {{summary}}

   EVIDENCE PLACEMENT (Commit 8.26):
   - evidenceCards[] = Both sidebar AND body cards (same array, dual fields)
   - evidence-reference in sections = References to inline body cards
   - Body evidence MUST be a SUBSET of evidenceCards (same tokenIds)
   - Sidebar: 5-8 cards as navigation/reference
   - Body: Reference only cards already in evidenceCards array

3. "pullQuotes" - Featured quotes for sidebar (distribute across 2+ sections)

4. "photos" - Session photos with placement:
   - "filename": EXACT filename from available photos (do NOT include hero image here)
   - "caption": Caption text
   - "characters": Array of character names visible
   - "placement": "inline" or "sidebar"
   - "afterSection": Section ID after which photo appears

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
    }

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

    const revisionConstraints = THEME_CONSTRAINTS[this.themeName];
    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].revision}

REVISION RULES:
- Make TARGETED fixes only - do not rewrite sections that are working
- Preserve structure: ${this.themeName === 'detective' ? 'sections, photos' : 'sections, evidence cards, photos, pull quotes, financial tracker'}
- Focus on the specific issues you identified in your self-check

${revisionConstraints.revisionVoice}`;

    const revisionChecklist = this.themeName === 'detective'
      ? `Fix the issues you identified in your self-check. Also check for:
- Any game mechanics terminology ("tokens", "character sheets", "Act 1/2/3")
- Repeated facts across sections (each section must answer a DIFFERENT question)
- Names missing <strong> tags or evidence missing <em> tags
- Any first-person voice that slipped in ("I saw", "I discovered")
- Section headings that don't clearly signal different analytical angles`
      : `Fix the issues you identified in your self-check. Also check for:
- "guests" -> "people" or "those present" or "partygoers"
- "From my notes that night" -> "- Nova" or remove
- Any remaining passive/observer voice patterns
- Any em-dashes that slipped through
- Generic praise or vague attributions
- Game mechanics language ("tokens", "transactions", "buried bonus")`;

    const userPrompt = `<YOUR_SELF_CHECK>
${voiceSelfCheck}
</YOUR_SELF_CHECK>

<ARTICLE_TO_REVISE>
${articleContent}
</ARTICLE_TO_REVISE>

<ANTI_PATTERNS_REFERENCE>
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
</ANTI_PATTERNS_REFERENCE>

<REVISION_INSTRUCTION>
${revisionChecklist}

Return JSON with:
1. "contentBundle" - Revised ContentBundle (if input was JSON) with all ${this.themeName === 'detective' ? 'sections and photos' : 'sections, evidenceCards, pullQuotes, photos'} preserved
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

    const systemPrompt = `${THEME_SYSTEM_PROMPTS[this.themeName].validation}

ANTI-PATTERNS CHECKLIST:
${labelPromptSection('anti-patterns', prompts['anti-patterns'])}
VOICE REQUIREMENTS:
${labelPromptSection('character-voice', prompts['character-voice'])}
EVIDENCE BOUNDARIES:
${labelPromptSection('evidence-boundaries', prompts['evidence-boundaries'])}`;

    const validationChecklist = this.themeName === 'detective'
      ? `Check for:
1. Game mechanics language ("token", "Act 3", "final call", "character sheet")
2. First-person voice (should be third-person investigative)
3. Repeated facts appearing in multiple sections (section differentiation)
4. Missing roster members
5. Names not in <strong> tags
6. Evidence artifacts not in <em> tags
7. Report exceeds ~800 words (target ~750)`
      : `Check for:
1. Em-dashes (— or --)
2. "token/tokens" instead of "extracted memory"
3. Game mechanics language ("Act 3", "final call", "first burial", "guest/guests")
4. Vague attribution ("from my notes", "sources say")
5. Passive/neutral voice (should be participatory)
6. Missing roster members
7. Blake condemned (should be suspicious but nuanced)
8. Missing systemic critique in CLOSING`;

    const validationReturnFormat = this.themeName === 'detective'
      ? `Return JSON:
{
  "passed": true|false,
  "issues": [
    {
      "type": "game_mechanics|first_person_voice|fact_repetition|missing_character|formatting",
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
  "section_differentiation": true|false,
  "word_count_acceptable": true|false
}`
      : `Return JSON:
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

    const userPrompt = `Validate this article against all anti-patterns.

CHARACTER ROSTER (all must be mentioned):
${roster.join(', ')}

ARTICLE HTML:
${articleHtml}

${validationChecklist}

${validationReturnFormat}`;

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
 * @param {string|Object|null} options - Custom path (string, legacy) or { theme, customSkillPath }
 * @returns {PromptBuilder}
 */
function createPromptBuilder(options = null) {
  // Legacy: support direct string argument (custom skill path)
  if (typeof options === 'string') {
    const themeLoader = createThemeLoader(options);
    return new PromptBuilder(themeLoader, 'journalist');
  }

  const { theme = 'journalist', customSkillPath } = options || {};
  const themeLoader = createThemeLoader({ theme, customPath: customSkillPath });
  return new PromptBuilder(themeLoader, theme);
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
