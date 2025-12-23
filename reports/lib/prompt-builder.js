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
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildOutlinePrompt(arcAnalysis, selectedArcs, heroImage, evidenceBundle) {
    const prompts = await this.theme.loadPhasePrompts('outlineGeneration');

    const systemPrompt = `You are creating an article outline for a NovaNews investigative piece.

${prompts['section-rules']}

${prompts['editorial-design']}`;

    const userPrompt = `Generate an article outline using these selected arcs.

SELECTED ARCS (in order of appearance):
${selectedArcs.map((arc, i) => `${i + 1}. ${arc}`).join('\n')}

HERO IMAGE: ${heroImage}

FULL ARC ANALYSIS:
${JSON.stringify(arcAnalysis, null, 2)}

EVIDENCE BUNDLE (for evidence card selection):
${JSON.stringify(evidenceBundle, null, 2)}

${prompts['narrative-structure']}

${prompts['formatting']}

${prompts['evidence-boundaries']}

Return JSON with the following structure:
{
  "lede": {
    "hook": "Opening hook text",
    "keyTension": "Central conflict"
  },
  "theStory": {
    "arcs": [
      {
        "name": "Arc name",
        "paragraphCount": 3,
        "evidenceCards": [{"tokenId": "xxx", "placement": "after para 1"}],
        "photoPlacement": {"filename": "xxx.png", "afterParagraph": 2} or null
      }
    ]
  },
  "followTheMoney": {
    "shellAccounts": [{"name": "X", "total": 123, "inference": "What it means"}],
    "photoPlacement": {"filename": "xxx.png"} or null
  },
  "thePlayers": {
    "exposed": ["names"],
    "buried": ["names"],
    "pullQuotes": [{"source": "token/observation", "text": "quote"}]
  },
  "whatsMissing": {
    "buriedMarkers": [{"account": "X", "amount": 123, "inference": "What might be there"}]
  },
  "closing": {
    "systemicAngle": "What broader point to make",
    "accusationHandling": "How to present the accusation"
  },
  "visualComponentCount": {
    "evidenceCards": 5,
    "photos": 3,
    "pullQuotes": 2,
    "buriedMarkers": 4
  }
}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build article generation prompt
   * Phase 4: Generate final article HTML from approved outline
   *
   * @param {Object} outline - Approved article outline
   * @param {Object} evidenceBundle - Full evidence bundle for quoting
   * @param {string} template - HTML template content
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildArticlePrompt(outline, evidenceBundle, template) {
    const prompts = await this.theme.loadPhasePrompts('articleGeneration');

    const systemPrompt = `You are generating a NovaNews investigative article.

CRITICAL VOICE REQUIREMENTS:
${prompts['character-voice']}

WRITING PRINCIPLES:
${prompts['writing-principles']}

EVIDENCE BOUNDARIES (what you can and cannot report):
${prompts['evidence-boundaries']}`;

    const userPrompt = `Generate the complete article following this outline.

APPROVED OUTLINE:
${JSON.stringify(outline, null, 2)}

EVIDENCE BUNDLE (quote from EXPOSED only):
${JSON.stringify(evidenceBundle, null, 2)}

SECTION RULES:
${prompts['section-rules']}

NARRATIVE STRUCTURE:
${prompts['narrative-structure']}

FORMATTING:
${prompts['formatting']}

ANTI-PATTERNS TO AVOID:
${prompts['anti-patterns']}

EDITORIAL DESIGN:
${prompts['editorial-design']}

HTML TEMPLATE STRUCTURE:
${template}

Generate the complete article HTML. Include all visual components specified in the outline:
- Evidence cards with proper CSS classes
- Photos with captions
- Pull quotes with attribution
- Buried markers in WHAT'S MISSING
- Financial tracker in FOLLOW THE MONEY sidebar

The article should be complete, self-contained HTML that matches the template structure.`;

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
