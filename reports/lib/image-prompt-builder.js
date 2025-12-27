/**
 * ImagePromptBuilder - Assemble image analysis prompts from ThemeLoader + session data
 *
 * Handles prompt construction for all image processing phases:
 * - Whiteboard analysis (OCR with roster-based name disambiguation)
 * - Photo analysis (generic descriptions, no names)
 * - Photo enrichment (character name replacement after user mapping)
 *
 * Follows the same pattern as PromptBuilder but with Single Responsibility
 * for image-specific context (roster, structure guidance, evidence boundaries).
 *
 * Added in Commit 8.9.x for DRY/SOLID image processing context.
 */

const { createThemeLoader, PHASE_REQUIREMENTS } = require('./theme-loader');
// Commit 8.11 fix: Import from shared module to break circular dependency
const { CHARACTER_IDS_PHOTO_TEMPLATE } = require('./schemas/character-ids');

class ImagePromptBuilder {
  /**
   * @param {ThemeLoader} themeLoader - Initialized ThemeLoader instance
   */
  constructor(themeLoader) {
    this.theme = themeLoader;
  }

  /**
   * Build whiteboard analysis prompt
   *
   * Provides roster context for OCR name disambiguation and structure
   * discovery guidance for spatial interpretation.
   *
   * @param {Object} sessionData - Session data
   * @param {string[]} sessionData.roster - Character names for OCR disambiguation
   * @param {string} sessionData.whiteboardPhotoPath - Path to whiteboard image
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildWhiteboardPrompt(sessionData) {
    const prompts = await this.theme.loadPhasePrompts('imageAnalysis');

    // Build roster list for disambiguation
    const rosterList = (sessionData.roster || []).join(', ');

    const systemPrompt = prompts['whiteboard-analysis'];

    const userPrompt = `First, use the Read tool to view the whiteboard photograph at:
${sessionData.whiteboardPhotoPath}

CHARACTER ROSTER (use for name disambiguation):
${rosterList}

Analyze the whiteboard and extract all visible information. When transcribing handwritten names,
use the roster above to correct OCR errors (e.g., "Viktoria" should be corrected to "Victoria"
if Victoria is in the roster).

Return structured JSON with:
- names: All character names found (roster-corrected)
- connections: Any lines/arrows between elements
- groups: Any boxed or circled clusters
- notes: Text content not part of connections
- structureType: Overall organization observed
- ambiguities: Unclear elements that may need verification`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build photo analysis prompt
   *
   * Generates generic descriptions without character names. Roster is
   * available for context but should NOT be used to identify people.
   *
   * @param {Object} options - Analysis options
   * @param {Object} options.playerFocus - Player focus for investigation context
   * @param {string} options.photoPath - Path to photo file
   * @param {string} options.filename - Original filename
   * @param {string[]} [options.roster] - Character roster (for context, not identification)
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildPhotoAnalysisPrompt(options) {
    const { playerFocus, photoPath, filename, roster = [] } = options;
    const prompts = await this.theme.loadPhasePrompts('imageAnalysis');

    // Build investigation context
    const focusContext = playerFocus?.primaryInvestigation
      ? `The investigation focused on: "${playerFocus.primaryInvestigation}".`
      : 'Analyze from a general investigative perspective.';

    const systemPrompt = prompts['photo-analysis'];

    const userPrompt = `First, use the Read tool to view the session photograph at:
${photoPath}

FILENAME: ${filename}

INVESTIGATION CONTEXT:
${focusContext}

${roster.length > 0 ? `NOTE: This session featured ${roster.length} characters. You will describe people generically; character identification happens at a later checkpoint.` : ''}

Analyze this photo and provide a detailed description focusing on:
1. Observable visual content (people, objects, setting)
2. The narrative moment captured
3. Generic character descriptions (physical features, clothing, position)
4. Emotional tone and story relevance
5. A suggested caption for article use

IMPORTANT: You MUST populate the characterDescriptions array with one entry per visible person.
Each entry needs a "description" (physical appearance) and optional "role" (what they're doing).
Example: {"description": "person in blue jacket with glasses", "role": "pointing at whiteboard"}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build photo enrichment prompt
   *
   * Transforms generic descriptions into character-named content using
   * user-provided mappings. Includes roster and director notes for
   * context-aware caption generation.
   *
   * @param {Object} options - Enrichment options
   * @param {Object} options.analysis - Original photo analysis from Haiku
   * @param {Object} options.userInput - User's character mappings and corrections
   * @param {Object} options.sessionData - Session data for context
   * @param {string[]} options.sessionData.roster - Character roster
   * @param {Object} [options.sessionData.directorNotes] - Director observations
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildPhotoEnrichmentPrompt(options) {
    const { analysis, userInput, sessionData = {} } = options;
    const prompts = await this.theme.loadPhasePrompts('imageAnalysis');

    const { characterMappings = [], additionalCharacters = [], corrections = {} } = userInput || {};

    // Build character mapping context
    const mappingLines = characterMappings.map(m => {
      const desc = analysis.characterDescriptions?.[m.descriptionIndex];
      if (desc) {
        return `- "${desc.description}" (${desc.role || 'observed'}) -> ${m.characterName}`;
      }
      return `- Description #${m.descriptionIndex} -> ${m.characterName}`;
    });

    const additionalLines = additionalCharacters.map(c =>
      `- NEW: "${c.description}" (${c.role || 'observed'}) -> ${c.characterName}`
    );

    const correctionLines = [];
    if (corrections.location) correctionLines.push(`Location: ${corrections.location}`);
    if (corrections.context) correctionLines.push(`Context: ${corrections.context}`);
    if (corrections.other) correctionLines.push(`Additional: ${corrections.other}`);

    // Build roster context for natural caption generation
    const rosterContext = sessionData.roster?.length > 0
      ? `ROSTER: ${sessionData.roster.join(', ')}`
      : '';

    // Include relevant director notes if available
    const directorContext = sessionData.directorNotes?.observations?.behaviorPatterns?.length > 0
      ? `DIRECTOR OBSERVATIONS:\n${sessionData.directorNotes.observations.behaviorPatterns.slice(0, 3).join('\n')}`
      : '';

    const systemPrompt = prompts['photo-enrichment'];

    const userPrompt = `Enrich this photo analysis by incorporating character identifications and corrections.

ORIGINAL ANALYSIS:
- Filename: ${analysis.filename}
- Visual Content: ${analysis.visualContent}
- Narrative Moment: ${analysis.narrativeMoment}
- Suggested Caption: ${analysis.suggestedCaption || '(none)'}
- Emotional Tone: ${analysis.emotionalTone}
- Story Relevance: ${analysis.storyRelevance}

CHARACTER IDENTIFICATIONS:
${mappingLines.length > 0 ? mappingLines.join('\n') : '(no mappings provided)'}
${additionalLines.length > 0 ? '\nADDITIONAL CHARACTERS (not detected initially):\n' + additionalLines.join('\n') : ''}

${correctionLines.length > 0 ? 'CORRECTIONS:\n' + correctionLines.join('\n') : ''}

${rosterContext}

${directorContext}

TASK:
1. Rewrite visual content, replacing generic descriptions with character names
2. Update narrative moment to incorporate any corrections
3. Generate a natural caption using character names (suitable for NovaNews article)
4. List all identified characters
5. Confirm no evidence boundary violations (no buried content referenced)`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Build character ID parsing prompt
   *
   * Converts natural language character identifications into structured format
   * that finalizePhotoAnalyses expects. Uses photo analyses for context.
   *
   * @param {Object} options - Parsing options
   * @param {Object[]} options.photoAnalyses - Array of photo analysis objects
   * @param {string} options.naturalLanguageInput - User's natural language mappings
   * @param {string[]} options.roster - Character roster for validation
   * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
   */
  async buildCharacterIdParsingPrompt(options) {
    const { photoAnalyses, naturalLanguageInput, roster = [] } = options;

    // Build photo context - each photo with its character descriptions
    const photoContexts = photoAnalyses.map((analysis, photoIndex) => {
      const descriptions = (analysis.characterDescriptions || [])
        .map((d, i) => `    [${i}] "${d.description}" (${d.role || 'observed'})`)
        .join('\n');

      return `PHOTO ${photoIndex + 1}: ${analysis.filename}
  Visual: ${analysis.visualContent?.substring(0, 150)}...
  People detected:
${descriptions || '    (no people detected)'}`;
    }).join('\n\n');

    // Extract just the filenames for the output format example
    const filenameList = photoAnalyses.map(a => a.filename).slice(0, 3);
    const exampleFilename = filenameList[0] || 'photo1.jpg';

    const systemPrompt = `You are a data parser that converts natural language character identifications into structured JSON.

You will receive:
1. Photo analyses with generic character descriptions (indexed)
2. Natural language input mapping descriptions to character names
3. A roster of valid character names

Your task is to parse the natural language into the exact JSON structure needed by the system.

OUTPUT FORMAT:
Return a JSON object with a "photos" array. Each photo entry MUST have:
- "filename": the EXACT filename from "PHOTO N:" (e.g., "${exampleFilename}")
- "characterMappings": array of {descriptionIndex, characterName} objects
- "additionalCharacters": array for characters not in original analysis
- "corrections": object with location/context/other fields
- "exclude": boolean

CRITICAL:
- Use the EXACT filename shown after "PHOTO N:" - NOT "PHOTO 1" or "Photo 1"
- The user may reference photos by number - YOU must translate to the exact filename
${filenameList.length > 1 ? `- Valid filenames: ${filenameList.join(', ')}${photoAnalyses.length > 3 ? ', ...' : ''}` : ''}

OTHER RULES:
- Match user's positional references ("far left", "center", "right") to the indexed descriptions
- Validate character names against the roster (correct typos if obvious)
- Create an entry for EACH photo the user provides mappings for

Output valid JSON only. No explanation needed.`;

    // Commit 8.11+: Generate example from template (DRY - single source of truth)
    const examplePhoto = {
      ...CHARACTER_IDS_PHOTO_TEMPLATE,
      filename: exampleFilename,
      characterMappings: [{ descriptionIndex: 0, characterName: 'Victoria' }],
      additionalCharacters: [{ description: 'person in background', characterName: 'Morgan', role: 'observing' }],
      corrections: { location: 'near the evidence table' }  // Omit null values per JSON best practice
    };
    const exampleOutput = JSON.stringify({ photos: [examplePhoto] }, null, 2);

    const userPrompt = `Parse these character identifications into structured format.

VALID ROSTER:
${roster.join(', ')}

PHOTO ANALYSES:
${photoContexts}

---

USER'S NATURAL LANGUAGE INPUT:
${naturalLanguageInput}

---

Output JSON with a "photos" array. Each entry must have "filename" set to the EXACT filename (not "PHOTO 1"):
${exampleOutput}

IMPORTANT: Include an entry for EACH photo the user provides mappings for. Use EXACT filenames from PHOTO ANALYSES above. Parse the input now:`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Get required prompts for the imageAnalysis phase
   * @returns {string[]} List of required prompt names
   */
  getPhaseRequirements() {
    return PHASE_REQUIREMENTS.imageAnalysis || [];
  }
}

/**
 * Factory function to create ImagePromptBuilder with default ThemeLoader
 * @param {string} [customSkillPath] - Optional custom path to skill directory
 * @returns {ImagePromptBuilder}
 */
function createImagePromptBuilder(customSkillPath = null) {
  const themeLoader = createThemeLoader(customSkillPath);
  return new ImagePromptBuilder(themeLoader);
}

/**
 * Create mock ImagePromptBuilder for testing
 *
 * Returns a builder with mock prompts that don't require file system access.
 * Useful for unit testing nodes that use ImagePromptBuilder.
 *
 * @param {Object} [options] - Mock configuration
 * @param {Object} [options.prompts] - Custom prompt overrides
 * @returns {ImagePromptBuilder} Mock builder instance
 */
function createMockImagePromptBuilder(options = {}) {
  const mockPrompts = {
    'whiteboard-analysis': options.prompts?.['whiteboard-analysis'] || 'Mock whiteboard analysis prompt',
    'photo-analysis': options.prompts?.['photo-analysis'] || 'Mock photo analysis prompt',
    'photo-enrichment': options.prompts?.['photo-enrichment'] || 'Mock photo enrichment prompt'
  };

  // Create mock ThemeLoader
  const mockThemeLoader = {
    loadPhasePrompts: async (phase) => {
      if (phase === 'imageAnalysis') {
        return { ...mockPrompts };
      }
      throw new Error(`Unknown phase: ${phase}`);
    },
    loadPrompt: async (name) => {
      if (mockPrompts[name]) {
        return mockPrompts[name];
      }
      throw new Error(`Unknown prompt: ${name}`);
    }
  };

  return new ImagePromptBuilder(mockThemeLoader);
}

module.exports = {
  ImagePromptBuilder,
  createImagePromptBuilder,
  createMockImagePromptBuilder,
  // Expose for testing
  _testing: {
    PHASE_REQUIREMENTS: PHASE_REQUIREMENTS.imageAnalysis
  }
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('ImagePromptBuilder Self-Test\n');

    const builder = createImagePromptBuilder();

    // Validate theme loader first
    const validation = await builder.theme.validate();
    if (!validation.valid) {
      console.error('Theme validation failed:', validation.missing);
      process.exit(1);
    }
    console.log('Theme files validated.\n');

    // Test whiteboard prompt
    console.log('Building whiteboard prompt...');
    const mockWhiteboardData = {
      roster: ['Victoria', 'Morgan', 'Jessicah', 'Kai', 'Taylor', 'Derek', 'James'],
      whiteboardPhotoPath: '/path/to/whiteboard.jpg'
    };
    const whiteboardResult = await builder.buildWhiteboardPrompt(mockWhiteboardData);
    console.log(`  System prompt: ${whiteboardResult.systemPrompt.length} chars`);
    console.log(`  User prompt: ${whiteboardResult.userPrompt.length} chars`);

    // Test photo analysis prompt
    console.log('\nBuilding photo analysis prompt...');
    const mockPhotoData = {
      playerFocus: { primaryInvestigation: 'Victoria and Morgan collusion' },
      photoPath: '/path/to/photo1.jpg',
      filename: 'photo1.jpg',
      roster: ['Victoria', 'Morgan', 'Jessicah']
    };
    const photoResult = await builder.buildPhotoAnalysisPrompt(mockPhotoData);
    console.log(`  System prompt: ${photoResult.systemPrompt.length} chars`);
    console.log(`  User prompt: ${photoResult.userPrompt.length} chars`);

    // Test photo enrichment prompt
    console.log('\nBuilding photo enrichment prompt...');
    const mockEnrichmentData = {
      analysis: {
        filename: 'photo1.jpg',
        visualContent: 'A person in a red dress examines evidence',
        narrativeMoment: 'Discovery of key evidence',
        suggestedCaption: 'The moment of truth',
        emotionalTone: 'revelatory',
        storyRelevance: 'critical',
        characterDescriptions: [
          { description: 'person in red dress', role: 'examining evidence' }
        ]
      },
      userInput: {
        characterMappings: [{ descriptionIndex: 0, characterName: 'Victoria' }],
        corrections: { context: 'This was near the evidence table' }
      },
      sessionData: {
        roster: ['Victoria', 'Morgan', 'Derek'],
        directorNotes: {
          observations: {
            behaviorPatterns: ['Victoria and Morgan worked together throughout']
          }
        }
      }
    };
    const enrichResult = await builder.buildPhotoEnrichmentPrompt(mockEnrichmentData);
    console.log(`  System prompt: ${enrichResult.systemPrompt.length} chars`);
    console.log(`  User prompt: ${enrichResult.userPrompt.length} chars`);

    // Test mock builder
    console.log('\nTesting mock builder...');
    const mockBuilder = createMockImagePromptBuilder();
    const mockResult = await mockBuilder.buildWhiteboardPrompt(mockWhiteboardData);
    console.log(`  Mock system prompt: ${mockResult.systemPrompt.length} chars`);
    console.log(`  Mock contains "Mock whiteboard": ${mockResult.systemPrompt.includes('Mock whiteboard')}`);

    console.log('\nAll tests passed!');
  })();
}
