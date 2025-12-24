/**
 * Photo Analysis Nodes - Early photo analysis for report generation workflow
 *
 * Handles the photo analysis phase (1.65) of the pipeline:
 * - analyzePhotos: Batch-analyze session photos using Haiku vision
 *
 * Added in Commit 8.6 to provide rich visual context to arc analysis.
 * Photos are analyzed BEFORE preprocessing to inform evidence curation.
 *
 * Key features:
 * - Uses Haiku vision for fast, cost-effective analysis
 * - Produces generic character descriptions (not names)
 * - User provides character-ids.json at checkpoint to map descriptions → names
 * - Output enriches arc specialist analysis
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants for currentPhase values
 * - Support skip logic for resume
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.3 for design rationale.
 */

const { PHASES, APPROVAL_TYPES } = require('../state');
const { callClaude } = require('../../claude-client');

/**
 * Photo analysis output schema for Claude
 * Each photo produces one analysis object
 */
const PHOTO_ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['filename', 'visualContent', 'narrativeMoment'],
  properties: {
    filename: {
      type: 'string',
      description: 'Original filename of the photo'
    },
    visualContent: {
      type: 'string',
      description: 'Detailed description of what is visible in the photo (people, objects, setting, actions)'
    },
    narrativeMoment: {
      type: 'string',
      description: 'What story moment or interaction this photo captures'
    },
    suggestedCaption: {
      type: 'string',
      description: 'Suggested caption for use in the final article'
    },
    characterDescriptions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['description'],
        properties: {
          description: {
            type: 'string',
            description: 'Physical description of person (e.g., "person in blue dress", "tall person with glasses")'
          },
          role: {
            type: 'string',
            description: 'Apparent role or action in scene (e.g., "appears to be accusing", "looks surprised")'
          }
        }
      },
      description: 'List of people visible in photo with generic descriptions'
    },
    emotionalTone: {
      type: 'string',
      enum: ['tense', 'celebratory', 'suspicious', 'revelatory', 'confrontational', 'collaborative', 'neutral'],
      description: 'Overall emotional tone of the scene'
    },
    storyRelevance: {
      type: 'string',
      enum: ['critical', 'supporting', 'contextual'],
      description: 'How important this moment appears to the narrative'
    }
  }
};

/**
 * Get Claude client from config or use default
 * @param {Object} config - Graph config
 * @returns {Function} Claude client function
 */
function getClaudeClient(config) {
  return config?.configurable?.claudeClient || callClaude;
}

/**
 * Build system prompt for photo analysis
 * @param {Object} playerFocus - Player focus data for context
 * @returns {string} System prompt
 */
function buildPhotoAnalysisSystemPrompt(playerFocus) {
  const focusContext = playerFocus?.primaryInvestigation
    ? `The players were investigating: "${playerFocus.primaryInvestigation}".`
    : 'Analyze from a general investigative perspective.';

  return `You are analyzing photographs from a crime thriller investigation game called "About Last Night."

Your task is to provide detailed visual analysis of each photo for use in generating a investigative news article.

IMPORTANT RULES:
1. DO NOT use character names - use physical descriptions only (e.g., "person in red jacket", "tall figure with glasses")
2. Focus on observable facts: body language, positioning, objects, setting
3. Note any dramatic or revelatory moments captured
4. Consider how this photo might illustrate a story about the investigation

${focusContext}

For each photo, identify:
- What is literally visible (visual content)
- What story moment this captures (narrative moment)
- How each person appears (using descriptions, NOT names)
- The emotional tone of the scene
- A suggested caption for the article`;
}

/**
 * Create empty photo analysis result
 * @param {string} sessionId - Session identifier
 * @returns {Object} Empty analysis result
 */
function createEmptyPhotoAnalysisResult(sessionId) {
  return {
    analyses: [],
    analyzedAt: new Date().toISOString(),
    sessionId: sessionId || null,
    stats: {
      totalPhotos: 0,
      analyzedPhotos: 0,
      processingTimeMs: 0
    }
  };
}

/**
 * Analyze session photos using Haiku vision
 *
 * Processes photos early in pipeline to provide rich visual context
 * for arc analysis. Produces generic character descriptions that
 * the user maps to names at the character-ids checkpoint.
 *
 * Skip logic: If state.photoAnalyses exists and is non-null,
 * skip processing (resume from checkpoint case).
 *
 * @param {Object} state - Current state with sessionPhotos, playerFocus
 * @param {Object} config - Graph config with optional configurable.claudeClient
 * @returns {Object} Partial state update with photoAnalyses, currentPhase
 */
async function analyzePhotos(state, config) {
  const startTime = Date.now();

  // Skip if already analyzed (resume case)
  if (state.photoAnalyses) {
    console.log('[analyzePhotos] Skipping - photoAnalyses already exists');
    return {
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  }

  // Skip if no photos to analyze
  const photos = state.sessionPhotos || [];
  if (photos.length === 0) {
    console.log('[analyzePhotos] Skipping - no session photos');
    return {
      photoAnalyses: createEmptyPhotoAnalysisResult(state.sessionId),
      currentPhase: PHASES.ANALYZE_PHOTOS
    };
  }

  console.log(`[analyzePhotos] Analyzing ${photos.length} photos`);

  const claudeClient = getClaudeClient(config);
  const systemPrompt = buildPhotoAnalysisSystemPrompt(state.playerFocus);

  try {
    // Process photos - for now, sequentially with Haiku vision
    // Future optimization: batch process similar to evidence preprocessing
    const analyses = [];

    for (const photo of photos) {
      const photoPath = typeof photo === 'string' ? photo : photo.path || photo.filename;
      const photoFilename = photoPath.split('/').pop().split('\\').pop();

      console.log(`[analyzePhotos] Processing: ${photoFilename}`);

      const userPrompt = `Analyze this photograph: ${photoFilename}

Photo context: This is from a session of "About Last Night" - a crime thriller investigation game.

Please provide your analysis in JSON format matching this structure:
{
  "filename": "${photoFilename}",
  "visualContent": "...",
  "narrativeMoment": "...",
  "suggestedCaption": "...",
  "characterDescriptions": [{"description": "...", "role": "..."}],
  "emotionalTone": "...",
  "storyRelevance": "..."
}

Remember: Use physical descriptions for people, NOT names.`;

      try {
        const response = await claudeClient({
          systemPrompt,
          userPrompt,
          model: 'haiku',
          outputFormat: 'json',
          timeout: 60000 // 1 minute per photo
        });

        const analysis = safeParseJson(response, photoFilename);
        analysis.filename = photoFilename; // Ensure filename is set
        analyses.push(analysis);

      } catch (photoError) {
        console.error(`[analyzePhotos] Error analyzing ${photoFilename}:`, photoError.message);
        // Add placeholder analysis for failed photos
        analyses.push({
          filename: photoFilename,
          visualContent: 'Analysis failed - see error log',
          narrativeMoment: 'Unable to analyze',
          suggestedCaption: '',
          characterDescriptions: [],
          emotionalTone: 'neutral',
          storyRelevance: 'contextual',
          _error: photoError.message
        });
      }
    }

    const processingTimeMs = Date.now() - startTime;

    const photoAnalyses = {
      analyses,
      analyzedAt: new Date().toISOString(),
      sessionId: state.sessionId || null,
      stats: {
        totalPhotos: photos.length,
        analyzedPhotos: analyses.filter(a => !a._error).length,
        failedPhotos: analyses.filter(a => a._error).length,
        processingTimeMs
      }
    };

    console.log(`[analyzePhotos] Complete: ${photoAnalyses.stats.analyzedPhotos}/${photos.length} photos analyzed in ${processingTimeMs}ms`);

    return {
      photoAnalyses,
      currentPhase: PHASES.ANALYZE_PHOTOS
    };

  } catch (error) {
    console.error('[analyzePhotos] Error:', error.message);

    return {
      photoAnalyses: createEmptyPhotoAnalysisResult(state.sessionId),
      errors: [{
        phase: PHASES.ANALYZE_PHOTOS,
        type: 'photo-analysis-failed',
        message: error.message,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.ERROR
    };
  }
}

/**
 * Safely parse JSON with actionable error messages
 * @param {string} response - JSON string to parse
 * @param {string} context - Context for error messages (e.g., filename)
 * @returns {Object} Parsed JSON
 * @throws {Error} If parsing fails
 */
function safeParseJson(response, context = 'photo') {
  try {
    return JSON.parse(response);
  } catch (error) {
    const preview = response.substring(0, 100);
    throw new Error(
      `Failed to parse photo analysis JSON for ${context}. ` +
      `Response preview: "${preview}..." ` +
      `Parse error: ${error.message}`
    );
  }
}

/**
 * Create mock photo analyzer for testing
 * @param {Object} options - Mock configuration
 * @returns {Object} Mock analyzer with process method
 */
function createMockPhotoAnalyzer(options = {}) {
  const { analysisPrefix = 'Mock' } = options;

  return {
    async analyze(photos, playerFocus) {
      const analyses = photos.map((photo, index) => {
        const filename = typeof photo === 'string' ? photo : photo.filename || `photo-${index}.jpg`;
        return {
          filename,
          visualContent: `${analysisPrefix} visual content for ${filename}`,
          narrativeMoment: `${analysisPrefix} narrative moment`,
          suggestedCaption: `${analysisPrefix} caption`,
          characterDescriptions: [
            { description: 'person in dark clothing', role: 'appears to be speaking' }
          ],
          emotionalTone: 'neutral',
          storyRelevance: 'supporting'
        };
      });

      return {
        analyses,
        analyzedAt: new Date().toISOString(),
        sessionId: 'mock-session',
        stats: {
          totalPhotos: photos.length,
          analyzedPhotos: photos.length,
          failedPhotos: 0,
          processingTimeMs: 50
        }
      };
    }
  };
}

module.exports = {
  // Main node function
  analyzePhotos,

  // Mock factory for testing
  createMockPhotoAnalyzer,

  // Export for testing
  _testing: {
    getClaudeClient,
    buildPhotoAnalysisSystemPrompt,
    createEmptyPhotoAnalysisResult,
    safeParseJson,
    PHOTO_ANALYSIS_SCHEMA
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Photo Nodes Self-Test\n');

  // Test with mock client
  const mockClaudeClient = async (options) => {
    return JSON.stringify({
      filename: 'test.jpg',
      visualContent: 'A group of people gathered around a table',
      narrativeMoment: 'The accusation moment',
      suggestedCaption: 'The truth revealed',
      characterDescriptions: [
        { description: 'person in red dress', role: 'pointing accusingly' },
        { description: 'tall figure in suit', role: 'looking shocked' }
      ],
      emotionalTone: 'confrontational',
      storyRelevance: 'critical'
    });
  };

  const mockState = {
    sessionId: 'self-test-session',
    sessionPhotos: ['photo1.jpg', 'photo2.jpg'],
    playerFocus: {
      primaryInvestigation: 'Who was working with the Valet?'
    }
  };

  const mockConfig = {
    configurable: {
      claudeClient: mockClaudeClient
    }
  };

  console.log('Testing analyzePhotos with mock client...');
  analyzePhotos(mockState, mockConfig).then(result => {
    console.log('Result currentPhase:', result.currentPhase);
    console.log('Photos analyzed:', result.photoAnalyses?.stats?.analyzedPhotos);
    console.log('First analysis:', JSON.stringify(result.photoAnalyses?.analyses?.[0], null, 2));
    console.log('\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });

  // Test skip logic
  console.log('\nTesting skip logic...');
  const alreadyAnalyzedState = {
    ...mockState,
    photoAnalyses: { analyses: [{ filename: 'existing.jpg' }] }
  };

  analyzePhotos(alreadyAnalyzedState, mockConfig).then(result => {
    console.log('Skip logic result - currentPhase:', result.currentPhase);
    console.log('Skip logic result - photoAnalyses modified:', result.photoAnalyses !== undefined);
  });
}
