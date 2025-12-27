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

const fs = require('fs');
const path = require('path');
const { PHASES, APPROVAL_TYPES } = require('../state');
const { safeParseJson, getSdkClient } = require('./node-helpers');
const { createSemaphore, MODEL_TIMEOUTS } = require('../../sdk-client');
const { preprocessImages, formatFileSize } = require('../../image-preprocessor');
const { createImagePromptBuilder } = require('../../image-prompt-builder');
const { getBackgroundResultOrWait, RESULT_TYPES } = require('../../background-pipeline-manager');

/**
 * Get ImagePromptBuilder from config or create default instance
 * Supports dependency injection for testing
 *
 * @param {Object} config - Graph config with optional configurable.imagePromptBuilder
 * @returns {ImagePromptBuilder} ImagePromptBuilder instance
 */
function getImagePromptBuilder(config) {
  return config?.configurable?.imagePromptBuilder || createImagePromptBuilder();
}

/**
 * Photo processing configuration
 */
const PHOTO_CONFIG = {
  // Concurrency limit: max parallel SDK calls (each spawns a CLI process)
  MAX_CONCURRENT: 8,

  // Timeout for each photo analysis (2 min for haiku + overhead for preprocessing)
  ANALYSIS_TIMEOUT_MS: 3 * 60 * 1000  // 3 minutes
};

/**
 * Photo analysis output schema for Claude
 * Each photo produces one analysis object
 */
const PHOTO_ANALYSIS_SCHEMA = {
  type: 'object',
  required: ['filename', 'visualContent', 'narrativeMoment', 'characterDescriptions'],
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

// getSdkClient imported from node-helpers.js

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
 * @param {Object} [additionalStats] - Additional stats to merge
 * @returns {Object} Empty analysis result
 */
function createEmptyPhotoAnalysisResult(sessionId, additionalStats = {}) {
  return {
    analyses: [],
    analyzedAt: new Date().toISOString(),
    sessionId: sessionId || null,
    stats: {
      totalPhotos: 0,
      analyzedPhotos: 0,
      failedPhotos: 0,
      processingTimeMs: 0,
      ...additionalStats
    }
  };
}

/**
 * Create placeholder analysis for failed photo
 * @param {string} filename - Photo filename
 * @param {string} errorMessage - Error that occurred
 * @returns {Object} Placeholder analysis object
 */
function createFailedPhotoAnalysis(filename, errorMessage) {
  return {
    filename,
    visualContent: 'Analysis failed - see error log',
    narrativeMoment: 'Unable to analyze',
    suggestedCaption: '',
    characterDescriptions: [],
    emotionalTone: 'neutral',
    storyRelevance: 'contextual',
    _error: errorMessage
  };
}

/**
 * Build user prompt for photo analysis
 * @param {string} photoPath - Path to the photo file
 * @param {string} photoFilename - Original filename for output
 * @returns {string} User prompt for Claude
 */
function buildPhotoAnalysisUserPrompt(photoPath, photoFilename) {
  return `First, use the Read tool to view the photograph at: ${photoPath}

Then analyze what you see in the photograph.

Photo context: This is from a session of "About Last Night" - a crime thriller investigation game.

After viewing the image, provide your analysis in JSON format matching this structure:
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
}

/**
 * Analyze a single photo with the SDK
 *
 * Extracted for testability and single-responsibility.
 * Progress logging is handled automatically by the SDK wrapper (getSdkClient).
 *
 * @param {Object} params - Analysis parameters
 * @param {Function} params.sdk - SDK query function (wrapped with progress logging)
 * @param {Object} params.imagePromptBuilder - Prompt builder instance
 * @param {Object} params.playerFocus - Player focus context
 * @param {Array} params.roster - Character roster
 * @param {string} params.processedPath - Path to preprocessed image
 * @param {string} params.originalFilename - Original filename (for output)
 * @param {number} params.timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} Analysis result or error placeholder
 */
async function analyzeSinglePhoto({
  sdk,
  imagePromptBuilder,
  playerFocus,
  roster,
  processedPath,
  originalFilename,
  timeoutMs
}) {
  // Use ImagePromptBuilder for context-aware prompts
  const { systemPrompt, userPrompt } = await imagePromptBuilder.buildPhotoAnalysisPrompt({
    playerFocus,
    photoPath: processedPath,
    filename: originalFilename,
    roster
  });

  try {
    // Progress logging handled by SDK wrapper (getSdkClient)
    const analysis = await sdk({
      systemPrompt,
      prompt: userPrompt,
      model: 'haiku',
      jsonSchema: PHOTO_ANALYSIS_SCHEMA,
      allowedTools: ['Read'],
      timeoutMs,
      label: originalFilename
    });

    // Ensure filename is set (use original, not processed)
    analysis.filename = originalFilename;
    const charCount = analysis.characterDescriptions?.length || 0;
    console.log(`[analyzePhotos] Completed: ${originalFilename} (${charCount} people detected)`);
    return analysis;

  } catch (error) {
    console.error(`[analyzePhotos] Error analyzing ${originalFilename}:`, error.message);
    return createFailedPhotoAnalysis(originalFilename, error.message);
  }
}

/**
 * Analyze session photos using Haiku vision
 *
 * Processes photos early in pipeline to provide rich visual context
 * for arc analysis. Produces generic character descriptions that
 * the user maps to names at the character-ids checkpoint.
 *
 * Architecture (Commit 8.9):
 * 1. Preprocess large images (resize/compress via sharp) to avoid SDK timeouts
 * 2. Use semaphore to limit concurrent SDK calls (each spawns CLI process)
 * 3. Use AbortController timeout for each analysis
 * 4. Stream progress for visibility
 *
 * Skip logic: If state.photoAnalyses exists and is non-null,
 * skip processing (resume from checkpoint case).
 *
 * @param {Object} state - Current state with sessionPhotos, playerFocus
 * @param {Object} config - Graph config with optional configurable.sdkClient
 * @returns {Object} Partial state update with photoAnalyses, currentPhase
 */
async function analyzePhotos(state, config) {
  const startTime = Date.now();

  // Skip if already analyzed (resume case) - check BEFORE background cache
  // to avoid overwriting enriched analyses from finalizePhotoAnalyses
  if (state.photoAnalyses) {
    console.log('[analyzePhotos] Skipping - photoAnalyses already exists');
    return { currentPhase: PHASES.ANALYZE_PHOTOS };
  }

  // Check background pipeline (DRY - single helper for all nodes)
  const bgResult = await getBackgroundResultOrWait(state.sessionId, RESULT_TYPES.PHOTO_ANALYSES, config);
  if (bgResult) {
    console.log(`[analyzePhotos] Using background result (${bgResult.analyses?.length || 0} analyses)`);
    return { photoAnalyses: bgResult, currentPhase: PHASES.ANALYZE_PHOTOS };
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

  // Extract paths from photo objects
  const photoPaths = photos.map(photo =>
    typeof photo === 'string' ? photo : photo.path || photo.filename
  );

  console.log(`[analyzePhotos] Processing ${photos.length} photos`);

  try {
    // Step 1: Preprocess images (resize/compress large files)
    console.log('[analyzePhotos] Step 1/2: Preprocessing images...');
    const preprocessResults = await preprocessImages(photoPaths, {
      concurrency: PHOTO_CONFIG.MAX_CONCURRENT
    });

    const preprocessStats = {
      preprocessed: preprocessResults.filter(r => r.wasProcessed).length,
      originalSizeBytes: preprocessResults.reduce((sum, r) => sum + r.originalSize, 0),
      processedSizeBytes: preprocessResults.reduce((sum, r) => sum + r.processedSize, 0)
    };

    // Step 2: Analyze with SDK (limited concurrency + timeout + progress)
    console.log(`[analyzePhotos] Step 2/2: Analyzing with SDK (max ${PHOTO_CONFIG.MAX_CONCURRENT} concurrent)...`);

    const sdk = getSdkClient(config, 'analyzePhotos');
    const imagePromptBuilder = getImagePromptBuilder(config);
    const semaphore = createSemaphore(PHOTO_CONFIG.MAX_CONCURRENT);

    // Get roster from sessionConfig for photo analysis context
    const roster = state.sessionConfig?.roster || [];

    const analysisPromises = preprocessResults.map((preprocessResult, index) => {
      const originalFilename = path.basename(photoPaths[index]);

      return semaphore(() => analyzeSinglePhoto({
        sdk,
        imagePromptBuilder,
        playerFocus: state.playerFocus,
        roster,
        processedPath: preprocessResult.path,
        originalFilename,
        timeoutMs: PHOTO_CONFIG.ANALYSIS_TIMEOUT_MS
        // onProgress handled automatically by getSdkClient wrapper
      }));
    });

    const analyses = await Promise.all(analysisPromises);
    const processingTimeMs = Date.now() - startTime;

    const photoAnalyses = {
      analyses,
      analyzedAt: new Date().toISOString(),
      sessionId: state.sessionId || null,
      stats: {
        totalPhotos: photos.length,
        analyzedPhotos: analyses.filter(a => !a._error).length,
        failedPhotos: analyses.filter(a => a._error).length,
        processingTimeMs,
        ...preprocessStats
      }
    };

    console.log(`[analyzePhotos] Complete: ${photoAnalyses.stats.analyzedPhotos}/${photos.length} in ${(processingTimeMs / 1000).toFixed(1)}s`);

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

// safeParseJson imported from node-helpers.js

/**
 * Output schema for LLM-powered photo enrichment
 */
const ENRICHED_PHOTO_SCHEMA = {
  type: 'object',
  required: ['enrichedVisualContent', 'enrichedNarrativeMoment', 'finalCaption', 'identifiedCharacters'],
  properties: {
    enrichedVisualContent: {
      type: 'string',
      description: 'Visual content description with character names replacing generic descriptions'
    },
    enrichedNarrativeMoment: {
      type: 'string',
      description: 'Narrative moment with corrections applied and character names included'
    },
    finalCaption: {
      type: 'string',
      description: 'Natural-sounding caption for the article, using character names'
    },
    identifiedCharacters: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of all character names visible in the photo'
    }
  }
};

/**
 * Build enrichment prompt for a single photo analysis
 * @param {Object} analysis - Original Haiku analysis
 * @param {Object} userInput - User's character mappings and corrections
 * @returns {string} Prompt for enrichment
 */
function buildEnrichmentPrompt(analysis, userInput) {
  const { characterMappings = [], additionalCharacters = [], corrections = {}, exclude } = userInput;

  if (exclude) {
    return null; // Skip excluded photos
  }

  // Build character mapping context
  const mappingLines = characterMappings.map(m => {
    const desc = analysis.characterDescriptions?.[m.descriptionIndex];
    if (desc) {
      return `- "${desc.description}" (${desc.role || 'observed'}) → ${m.characterName}`;
    }
    return `- Description #${m.descriptionIndex} → ${m.characterName}`;
  });

  const additionalLines = additionalCharacters.map(c =>
    `- NEW: "${c.description}" (${c.role || 'observed'}) → ${c.characterName}`
  );

  const correctionLines = [];
  if (corrections.location) correctionLines.push(`Location correction: ${corrections.location}`);
  if (corrections.context) correctionLines.push(`Context correction: ${corrections.context}`);
  if (corrections.other) correctionLines.push(`Additional notes: ${corrections.other}`);

  return `Enrich this photo analysis by incorporating character identifications and corrections.

ORIGINAL ANALYSIS:
- Visual Content: ${analysis.visualContent}
- Narrative Moment: ${analysis.narrativeMoment}
- Suggested Caption: ${analysis.suggestedCaption || '(none)'}
- Emotional Tone: ${analysis.emotionalTone}
- Story Relevance: ${analysis.storyRelevance}

CHARACTER IDENTIFICATIONS:
${mappingLines.length > 0 ? mappingLines.join('\n') : '(no mappings provided)'}
${additionalLines.length > 0 ? '\nADDITIONAL CHARACTERS (not detected by initial analysis):\n' + additionalLines.join('\n') : ''}

${correctionLines.length > 0 ? 'CORRECTIONS:\n' + correctionLines.join('\n') : ''}

TASK:
1. Rewrite the visual content, replacing generic descriptions (e.g., "person in red dress") with character names
2. Update the narrative moment to incorporate any location/context corrections
3. Generate a natural-sounding caption that uses character names and captures the moment
4. List all identified characters (from mappings AND additional characters)

The caption should be suitable for a NovaNews investigative article - dramatic but factual.`;
}

/**
 * Template for character ID photo structure - single source of truth (DRY)
 * Used by both PARSED_CHARACTER_IDS_SCHEMA and image-prompt-builder.js
 * to keep schema and prompt examples in sync.
 */
const CHARACTER_IDS_PHOTO_TEMPLATE = {
  filename: '',  // Will be filled with actual filename
  characterMappings: [],
  additionalCharacters: [],
  corrections: {},
  exclude: false
};

/**
 * JSON schema for parsed character ID mappings
 *
 * Commit 8.11+: Changed from additionalProperties (dynamic keys) to array-based
 * structure. The additionalProperties keyword was being interpreted literally
 * by Claude's structured output as a key name instead of a schema construct.
 *
 * Array structure with explicit filename property avoids this ambiguity.
 */
const PARSED_CHARACTER_IDS_SCHEMA = {
  type: 'object',
  required: ['photos'],
  properties: {
    photos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string' },
          characterMappings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                descriptionIndex: { type: 'number' },
                characterName: { type: 'string' }
              },
              required: ['descriptionIndex', 'characterName']
            }
          },
          additionalCharacters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                characterName: { type: 'string' },
                role: { type: 'string' }
              },
              required: ['description', 'characterName']
            }
          },
          corrections: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              context: { type: 'string' },
              other: { type: 'string' }
            }
          },
          exclude: { type: 'boolean' }
        }
      }
    }
  }
};

/**
 * Parse natural language character IDs into structured format
 *
 * Converts user's natural language input (e.g., "Far left: Morgan, Center: Victoria")
 * into the structured characterIdMappings format that finalizePhotoAnalyses expects.
 *
 * Added in Commit 8.9.x for natural language character ID input.
 *
 * Skip logic: If characterIdMappings already exists and is structured, skip parsing.
 *
 * @param {Object} state - Current state with photoAnalyses, characterIdsRaw
 * @param {Object} config - Graph config with optional configurable.sdkClient
 * @returns {Object} Partial state update with characterIdMappings
 */
async function parseCharacterIds(state, config) {
  const startTime = Date.now();

  // Skip if no raw input to parse
  if (!state.characterIdsRaw) {
    console.log('[parseCharacterIds] Skipping - no characterIdsRaw to parse');
    return {
      currentPhase: PHASES.PARSE_CHARACTER_IDS
    };
  }

  // Skip if already have structured mappings (not from raw parsing)
  if (state.characterIdMappings && Object.keys(state.characterIdMappings).length > 0 && !state._characterIdsParsed) {
    console.log('[parseCharacterIds] Skipping - structured characterIdMappings already provided');
    return {
      currentPhase: PHASES.PARSE_CHARACTER_IDS
    };
  }

  // Skip if no photo analyses to map to
  if (!state.photoAnalyses?.analyses?.length) {
    console.log('[parseCharacterIds] Skipping - no photo analyses available');
    return {
      currentPhase: PHASES.PARSE_CHARACTER_IDS,
      characterIdMappings: {}
    };
  }

  console.log(`[parseCharacterIds] Parsing natural language input (${state.characterIdsRaw.length} chars)`);

  const sdk = getSdkClient(config, 'parseCharacterIds');
  const imagePromptBuilder = getImagePromptBuilder(config);

  try {
    const { systemPrompt, userPrompt } = await imagePromptBuilder.buildCharacterIdParsingPrompt({
      photoAnalyses: state.photoAnalyses.analyses,
      naturalLanguageInput: state.characterIdsRaw,
      roster: state.sessionConfig?.roster || []
    });

    const parsed = await sdk({
      systemPrompt,
      prompt: userPrompt,
      model: 'sonnet',  // Complex table parsing requires sonnet (same as input-nodes.js:445)
      jsonSchema: PARSED_CHARACTER_IDS_SCHEMA
    });

    const processingTimeMs = Date.now() - startTime;

    // Commit 8.11+: Convert array-based response to object keyed by filename
    // Schema uses array to avoid additionalProperties keyword being interpreted as literal key
    const photosArray = parsed.photos || [];
    const characterIdMappings = {};
    for (const photo of photosArray) {
      // Validate filename is a non-empty string
      if (photo.filename && typeof photo.filename === 'string' && photo.filename.trim()) {
        const normalizedFilename = photo.filename.trim();
        characterIdMappings[normalizedFilename] = {
          characterMappings: photo.characterMappings || [],
          additionalCharacters: photo.additionalCharacters || [],
          corrections: photo.corrections || {},
          exclude: photo.exclude || false
        };
      } else if (photo.filename !== undefined) {
        // Log invalid filenames to help debug SDK output issues
        console.warn(`[parseCharacterIds] Skipping photo with invalid filename: ${JSON.stringify(photo.filename)}`);
      }
    }

    const parsedKeys = Object.keys(characterIdMappings);

    // Debug: show what keys were returned vs what filenames exist
    const expectedFilenames = (state.photoAnalyses?.analyses || []).map(a => a.filename);
    const matchingKeys = parsedKeys.filter(key => expectedFilenames.includes(key));
    const unmatchedKeys = parsedKeys.filter(key => !expectedFilenames.includes(key));

    console.log(`[parseCharacterIds] Parsed ${photosArray.length} photos → ${parsedKeys.length} mappings in ${processingTimeMs}ms`);
    console.log(`[parseCharacterIds] Keys: ${parsedKeys.join(', ')}`);

    // Fail loud if LLM returned keys that don't match actual filenames
    if (unmatchedKeys.length > 0) {
      console.error(`[parseCharacterIds] ERROR: ${unmatchedKeys.length} keys don't match any filename`);
      console.error(`[parseCharacterIds] Unmatched keys: ${unmatchedKeys.join(', ')}`);
      console.error(`[parseCharacterIds] Expected filenames: ${expectedFilenames.join(', ')}`);
      console.error(`[parseCharacterIds] This means the LLM ignored the prompt instruction to use exact filenames.`);
    }

    if (matchingKeys.length > 0) {
      console.log(`[parseCharacterIds] Matched ${matchingKeys.length}/${expectedFilenames.length} photos`);
    }

    return {
      characterIdMappings,
      _characterIdsParsed: true,  // Flag to indicate this came from parsing
      currentPhase: PHASES.PARSE_CHARACTER_IDS
    };

  } catch (parseError) {
    console.error('[parseCharacterIds] Error parsing character IDs:', parseError.message);

    // Return empty mappings on error, allow workflow to continue
    return {
      characterIdMappings: {},
      errors: [{
        type: 'CHARACTER_ID_PARSE_ERROR',
        message: `Failed to parse character IDs: ${parseError.message}`,
        phase: PHASES.PARSE_CHARACTER_IDS,
        timestamp: new Date().toISOString()
      }],
      currentPhase: PHASES.PARSE_CHARACTER_IDS
    };
  }
}

/**
 * Finalize photo analyses by enriching with character identifications (LLM-powered)
 *
 * Uses Claude to intelligently merge user-provided character mappings and corrections
 * into photo analyses, generating natural-sounding enriched content.
 *
 * Input format (characterIdMappings):
 * {
 *   "photo1.jpg": {
 *     characterMappings: [{ descriptionIndex: 0, characterName: "Victoria" }],
 *     additionalCharacters: [{ description: "...", characterName: "...", role: "..." }],
 *     corrections: { location: "...", context: "...", other: "..." },
 *     exclude: false
 *   }
 * }
 *
 * Added in Commit 8.9.5 for character ID checkpoint support.
 *
 * Skip logic: If photoAnalyses already has enriched data (identifiedCharacters),
 * skip processing (resume from checkpoint case).
 *
 * @param {Object} state - Current state with photoAnalyses, characterIdMappings
 * @param {Object} config - Graph config with optional configurable.sdkClient
 * @returns {Object} Partial state update with enriched photoAnalyses
 */
async function finalizePhotoAnalyses(state, config) {
  const startTime = Date.now();

  // Skip if no photo analyses to enrich
  if (!state.photoAnalyses || !state.photoAnalyses.analyses || state.photoAnalyses.analyses.length === 0) {
    console.log('[finalizePhotoAnalyses] Skipping - no photo analyses to enrich');
    return {
      currentPhase: PHASES.FINALIZE_PHOTOS
    };
  }

  // Skip if already enriched WITH actual character names (not just empty arrays from failed parse)
  // Check if ANY photo has identifiedCharacters with content
  const hasActualEnrichment = state.photoAnalyses.analyses.some(
    a => a.identifiedCharacters && a.identifiedCharacters.length > 0
  );
  if (hasActualEnrichment) {
    console.log('[finalizePhotoAnalyses] Skipping - photoAnalyses already enriched with character names');
    return {
      currentPhase: PHASES.FINALIZE_PHOTOS
    };
  }

  const characterIdMappings = state.characterIdMappings || {};
  const mappingCount = Object.keys(characterIdMappings).length;

  console.log(`[finalizePhotoAnalyses] Enriching ${state.photoAnalyses.analyses.length} analyses with ${mappingCount} character mappings`);

  const sdk = getSdkClient(config, 'finalizePhotos');
  const imagePromptBuilder = getImagePromptBuilder(config);

  // Build sessionData for enrichment context
  const sessionData = {
    roster: state.sessionConfig?.roster || [],
    directorNotes: state.directorNotes || null
  };

  // Phase 4b: Parallelize photo enrichment using same semaphore pattern as analyzePhotos
  const semaphore = createSemaphore(PHOTO_CONFIG.MAX_CONCURRENT);

  const enrichmentPromises = state.photoAnalyses.analyses.map((analysis) => {
    const userInput = characterIdMappings[analysis.filename] || {};

    // Handle excluded photos (no SDK call needed)
    if (userInput.exclude) {
      console.log(`[finalizePhotoAnalyses] Excluding photo: ${analysis.filename}`);
      return Promise.resolve({
        ...analysis,
        excluded: true,
        identifiedCharacters: [],
        enrichedVisualContent: analysis.visualContent,
        enrichedNarrativeMoment: analysis.narrativeMoment,
        finalCaption: null,
        originalCaption: analysis.suggestedCaption
      });
    }

    // If no mappings or corrections, do simple passthrough (no SDK call needed)
    const hasMappings = (userInput.characterMappings?.length > 0) || (userInput.additionalCharacters?.length > 0);
    const hasCorrections = userInput.corrections && Object.values(userInput.corrections).some(v => v);

    if (!hasMappings && !hasCorrections) {
      console.log(`[finalizePhotoAnalyses] No enrichment data for: ${analysis.filename}`);
      return Promise.resolve({
        ...analysis,
        identifiedCharacters: [],
        enrichedVisualContent: analysis.visualContent,
        enrichedNarrativeMoment: analysis.narrativeMoment,
        finalCaption: analysis.suggestedCaption,
        originalCaption: analysis.suggestedCaption
      });
    }

    // SDK enrichment call - wrap with semaphore for concurrency control
    return semaphore(async () => {
      try {
        console.log(`[finalizePhotoAnalyses] Enriching: ${analysis.filename}`);

        // Use ImagePromptBuilder for context-aware enrichment
        const { systemPrompt, userPrompt } = await imagePromptBuilder.buildPhotoEnrichmentPrompt({
          analysis,
          userInput,
          sessionData
        });

        const enrichment = await sdk({
          systemPrompt,
          prompt: userPrompt,
          model: 'haiku',  // Fast model for simple text transformation
          jsonSchema: ENRICHED_PHOTO_SCHEMA
        });

        return {
          ...analysis,
          // Enriched fields
          identifiedCharacters: enrichment.identifiedCharacters || [],
          enrichedVisualContent: enrichment.enrichedVisualContent || analysis.visualContent,
          enrichedNarrativeMoment: enrichment.enrichedNarrativeMoment || analysis.narrativeMoment,
          finalCaption: enrichment.finalCaption,
          // Preserve originals
          originalVisualContent: analysis.visualContent,
          originalNarrativeMoment: analysis.narrativeMoment,
          originalCaption: analysis.suggestedCaption,
          // User input for reference
          userCorrections: userInput.corrections || null,
          additionalCharacters: userInput.additionalCharacters || []
        };

      } catch (enrichError) {
        console.error(`[finalizePhotoAnalyses] Error enriching ${analysis.filename}:`, enrichError.message);
        // Fallback to simple enrichment on error
        const allCharacters = [
          ...(userInput.characterMappings || []).map(m => m.characterName),
          ...(userInput.additionalCharacters || []).map(c => c.characterName)
        ];

        return {
          ...analysis,
          identifiedCharacters: allCharacters,
          enrichedVisualContent: analysis.visualContent,
          enrichedNarrativeMoment: analysis.narrativeMoment,
          finalCaption: allCharacters.length > 0
            ? `${allCharacters.join(' and ')}: ${analysis.suggestedCaption || 'Scene from the investigation'}`
            : analysis.suggestedCaption,
          originalCaption: analysis.suggestedCaption,
          _enrichmentError: enrichError.message
        };
      }
    });
  });

  // Wait for all enrichments to complete (runs with MAX_CONCURRENT limit)
  const enrichedAnalyses = await Promise.all(enrichmentPromises);

  const processingTimeMs = Date.now() - startTime;

  // Build enriched photoAnalyses with same structure
  const enrichedPhotoAnalyses = {
    ...state.photoAnalyses,
    analyses: enrichedAnalyses,
    enrichedAt: new Date().toISOString(),
    enrichmentStats: {
      totalAnalyses: enrichedAnalyses.length,
      withCharacters: enrichedAnalyses.filter(a => a.identifiedCharacters?.length > 0).length,
      withCorrections: enrichedAnalyses.filter(a => a.userCorrections).length,
      excluded: enrichedAnalyses.filter(a => a.excluded).length,
      processingTimeMs
    }
  };

  console.log(`[finalizePhotoAnalyses] Complete: ${enrichedPhotoAnalyses.enrichmentStats.withCharacters}/${enrichedAnalyses.length} photos enriched in ${processingTimeMs}ms`);

  return {
    photoAnalyses: enrichedPhotoAnalyses,
    currentPhase: PHASES.FINALIZE_PHOTOS
  };
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
  // Main node functions
  analyzePhotos,
  parseCharacterIds,      // Commit 8.9.x: parse natural language character IDs
  finalizePhotoAnalyses,  // Commit 8.9.5: enrich with character IDs

  // Commit 8.11+: Template for prompt builder (DRY - single source of truth)
  CHARACTER_IDS_PHOTO_TEMPLATE,

  // Mock factory for testing
  createMockPhotoAnalyzer,

  // Export for testing
  _testing: {
    getSdkClient,
    buildPhotoAnalysisSystemPrompt,
    buildPhotoAnalysisUserPrompt,
    createEmptyPhotoAnalysisResult,
    createFailedPhotoAnalysis,
    analyzeSinglePhoto,
    safeParseJson,
    PHOTO_ANALYSIS_SCHEMA,
    PHOTO_CONFIG,
    // Commit 8.9.5: Photo enrichment exports
    buildEnrichmentPrompt,
    ENRICHED_PHOTO_SCHEMA,
    // Commit 8.11+: Character ID schema (template exported at top-level for prompt builder)
    PARSED_CHARACTER_IDS_SCHEMA
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Photo Nodes Self-Test\n');

  // Test with mock SDK client - returns parsed objects directly
  const mockSdkClient = async (options) => {
    return {
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
    };
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
      sdkClient: mockSdkClient
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
