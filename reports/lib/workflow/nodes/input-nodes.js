/**
 * Input Nodes - Raw input parsing for report generation workflow
 *
 * Handles the input parsing phase (0.1-0.2) of the pipeline:
 * - parseRawInput: Parse raw text input + analyze whiteboard photo
 * - reviewInputCheckpoint: Set up checkpoint for user review/edit
 *
 * Added in Commit 8.9 to accept unstructured user input and transform
 * it into structured JSON files before the main workflow.
 *
 * Input fields:
 * - roster: Comma-separated character names
 * - accusation: Free-form narrative about group's conclusion
 * - sessionReport: Structured markdown with token tables
 * - directorNotes: Free-form observations about gameplay
 * - photosPath: Directory containing session photos
 * - whiteboardPhotoPath: Path to whiteboard image (Layer 3 data)
 *
 * Output files (saved to data/{sessionId}/inputs/):
 * - session-config.json: roster, accusation, photosPath, metadata
 * - director-notes.json: observations, whiteboard data (from vision)
 * - orchestrator-parsed.json: exposedTokens, buriedTokens, shellAccounts
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants for currentPhase values
 *
 * See ARCHITECTURE_DECISIONS.md 8.9 for design rationale.
 */

const fs = require('fs').promises;
const path = require('path');
const { PHASES, APPROVAL_TYPES } = require('../state');
const { getSdkClient, synthesizePlayerFocus } = require('./node-helpers');
const { createImagePromptBuilder } = require('../../image-prompt-builder');
const { traceNode } = require('../tracing');

/**
 * Default data directory for session files
 * Can be overridden via config.configurable.dataDir
 */
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

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

// ═══════════════════════════════════════════════════════
// JSON SCHEMAS FOR STRUCTURED OUTPUT
// ═══════════════════════════════════════════════════════

/**
 * Schema for session config parsing
 */
const SESSION_CONFIG_SCHEMA = {
  type: 'object',
  required: ['sessionId', 'roster', 'accusation'],
  properties: {
    sessionId: {
      type: 'string',
      description: 'Session identifier in MMDD format (e.g., "1221" for Dec 21)'
    },
    sessionDate: {
      type: 'string',
      description: 'Full date in YYYY-MM-DD format'
    },
    roster: {
      type: 'array',
      items: { type: 'string' },
      description: 'List of character first names played in this session'
    },
    rosterCount: {
      type: 'number',
      description: 'Number of characters in roster'
    },
    accusation: {
      type: 'object',
      required: ['accused', 'charge'],
      properties: {
        accused: {
          type: 'array',
          items: { type: 'string' },
          description: 'Character names accused by the group'
        },
        charge: {
          type: 'string',
          description: 'What the group accused them of'
        },
        notes: {
          type: 'string',
          description: 'Additional context about the accusation'
        }
      }
    }
  }
};

/**
 * Schema for session report parsing (tokens, shell accounts)
 */
const SESSION_REPORT_SCHEMA = {
  type: 'object',
  required: ['exposedTokens', 'buriedTokens'],
  properties: {
    sessionId: {
      type: 'string',
      description: 'UUID from the session report'
    },
    sessionName: {
      type: 'string',
      description: 'Name of the session'
    },
    startTime: {
      type: 'string',
      description: 'Session start time'
    },
    exposedTokens: {
      type: 'array',
      items: { type: 'string' },
      description: 'Token IDs submitted to Detective (public evidence)'
    },
    exposedCount: {
      type: 'number',
      description: 'Number of exposed tokens'
    },
    buriedTokens: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tokenId', 'shellAccount', 'amount'],
        properties: {
          tokenId: { type: 'string' },
          shellAccount: { type: 'string' },
          amount: { type: 'number' },
          time: { type: 'string' }
        }
      },
      description: 'Tokens sold to Black Market with shell account info'
    },
    buriedCount: {
      type: 'number',
      description: 'Number of buried tokens'
    },
    shellAccounts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'total', 'tokenCount', 'rank'],
        properties: {
          name: { type: 'string' },
          total: { type: 'number' },
          tokenCount: { type: 'number' },
          rank: { type: 'number' }
        }
      },
      description: 'Shell account standings'
    },
    totalBuried: {
      type: 'number',
      description: 'Total Black Market economy value'
    },
    teamsRegistered: {
      type: 'array',
      items: { type: 'string' },
      description: 'Team names registered in session'
    }
  }
};

/**
 * Schema for director notes parsing
 */
const DIRECTOR_NOTES_SCHEMA = {
  type: 'object',
  required: ['observations'],
  properties: {
    observations: {
      type: 'object',
      properties: {
        behaviorPatterns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Observed behavior patterns during gameplay'
        },
        suspiciousCorrelations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Suspected connections between players/events'
        },
        notableMoments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Key moments during the session'
        }
      }
    }
  }
};

/**
 * Schema for whiteboard analysis
 */
const WHITEBOARD_SCHEMA = {
  type: 'object',
  required: ['names'],
  properties: {
    names: {
      type: 'array',
      items: { type: 'string' },
      description: 'All character names found on whiteboard (roster-corrected via OCR disambiguation)'
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source element' },
          to: { type: 'string', description: 'Target element' },
          label: { type: 'string', description: 'Connection label or type' }
        }
      },
      description: 'Lines or arrows connecting elements on the whiteboard'
    },
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Group label (e.g., SUSPECTS, FACTS)' },
          members: { type: 'array', items: { type: 'string' }, description: 'Items in this group' }
        }
      },
      description: 'Boxed or circled clusters with a label'
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Text content not directly associated with connections or groups'
    },
    structureType: {
      type: 'string',
      description: 'Overall organization observed (e.g., "accusation web", "timeline", "free-form notes")'
    },
    ambiguities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Unclear elements that may need verification'
    }
  }
};

// ═══════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════

/**
 * Sanitize a file path by removing surrounding quotes and whitespace
 * Handles cases like: "\"C:\\path\\to\\file\"" -> "C:\\path\\to\\file"
 *
 * @param {string} pathString - Path string to sanitize
 * @returns {string|null} Sanitized path or null if empty
 */
function sanitizePath(pathString) {
  if (!pathString) return null;
  // Remove surrounding quotes (both single and double) and trim whitespace
  return pathString.replace(/^["']|["']$/g, '').trim();
}

/**
 * Ensure directory exists, create if needed
 * @param {string} dirPath - Directory path
 */
async function ensureDir(dirPath) {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Derive sessionId from date information
 * Format: MMDD (e.g., "1221" for Dec 21)
 * Multi-session days: MMDD2, MMDD3, etc.
 *
 * @param {string} dateStr - Date string from session report
 * @param {number} sessionNumber - Session number for multi-session days (1, 2, 3)
 * @returns {string} Session ID in MMDD format
 */
function deriveSessionId(dateStr, sessionNumber = 1) {
  // Parse date from various formats
  let date;
  if (dateStr.includes('@')) {
    // Format: "Dec 21, 2025 @ 7:24 PM"
    const datePart = dateStr.split('@')[0].trim();
    date = new Date(datePart);
  } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
    // Format: "2025-12-21"
    date = new Date(dateStr);
  } else {
    // Try to parse directly
    date = new Date(dateStr);
  }

  if (isNaN(date.getTime())) {
    // Fallback: use current date
    date = new Date();
    console.warn(`[deriveSessionId] Could not parse date "${dateStr}", using current date`);
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const base = `${month}${day}`;

  return sessionNumber > 1 ? `${base}${sessionNumber}` : base;
}

// ═══════════════════════════════════════════════════════
// PARSE RAW INPUT NODE
// ═══════════════════════════════════════════════════════

/**
 * Parse raw session input and analyze whiteboard photo
 *
 * Takes unstructured input from director and uses Claude to:
 * 1. Parse roster and accusation into structured format
 * 2. Parse session report markdown into token lists
 * 3. Parse director notes into categorized observations
 * 4. Analyze whiteboard photo for Layer 3 data (suspects, conclusions)
 *
 * Saves output to data/{sessionId}/inputs/ directory.
 *
 * @param {Object} state - Current state with rawSessionInput
 * @param {Object} config - Graph config with optional configurable.sdkClient, dataDir
 * @returns {Object} Partial state update with sessionConfig, directorNotes, playerFocus, currentPhase
 */
async function parseRawInput(state, config) {
  // Skip if no raw input provided (resume case or pre-populated files)
  if (!state.rawSessionInput) {
    console.log('[parseRawInput] No rawSessionInput, skipping to loadDirectorNotes');
    return {
      currentPhase: PHASES.LOAD_DIRECTOR_NOTES
    };
  }

  console.log('[parseRawInput] Processing raw session input');
  const startTime = Date.now();

  const sdk = getSdkClient(config, 'parseRawInput');
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const rawInput = state.rawSessionInput;

  // Get sessionId from config (passed from API request)
  const configSessionId = config?.configurable?.sessionId;

  // ─────────────────────────────────────────────────────
  // Phase 4c: Run Steps 1, 2, 3 in parallel (independent AI calls)
  // Step 4 (whiteboard) depends on Step 1 (roster for OCR)
  // ─────────────────────────────────────────────────────

  console.log('[parseRawInput] Running Steps 1-3 in parallel');

  // Use config sessionId if provided, otherwise try to derive from session report
  const sessionIdHint = configSessionId
    ? `Use sessionId: "${configSessionId}" (provided by caller)`
    : `Derive sessionId from: ${rawInput.sessionReport?.match(/Start Time\s*\|\s*([^\n|]+)/)?.[1] || 'current date'}`;

  // Step 1 Promise: Parse roster and accusation
  const step1Promise = (async () => {
    console.log('[parseRawInput] Step 1: Parsing roster and accusation');
    const sessionConfigPrompt = `Parse the following information into structured JSON:

ROSTER OF CHARACTERS:
${rawInput.roster || 'Not provided'}

MURDER ACCUSATION:
${rawInput.accusation || 'Not provided'}

SESSION ID INSTRUCTION:
${sessionIdHint}

Rules for parsing:
1. Extract character first names from the roster (comma-separated list)
2. For accusation, identify WHO was accused and WHAT they were accused of
3. For sessionId: If a specific sessionId is provided above, use it exactly. Otherwise derive in MMDD format.
4. sessionDate should be YYYY-MM-DD format

Return structured JSON matching the schema.`;

    const result = await sdk({
      prompt: sessionConfigPrompt,
      systemPrompt: 'You parse game session information into structured JSON. Be precise and accurate.',
      model: 'haiku',
      jsonSchema: SESSION_CONFIG_SCHEMA
    });
    result.rosterCount = result.roster?.length || 0;
    result.photosPath = sanitizePath(rawInput.photosPath);
    result.journalistName = 'Cassandra'; // Default journalist NPC name
    result.createdAt = new Date().toISOString();
    return result;
  })();

  // Step 2 Promise: Parse session report (tokens, shell accounts)
  const step2Promise = (async () => {
    if (!rawInput.sessionReport) {
      return {
        exposedTokens: [],
        buriedTokens: [],
        shellAccounts: [],
        exposedCount: 0,
        buriedCount: 0,
        totalBuried: 0
      };
    }

    console.log('[parseRawInput] Step 2: Parsing session report');
    const sessionReportPrompt = `Parse the following session gameplay report into structured JSON:

SESSION REPORT:
${rawInput.sessionReport}

Rules for parsing:
1. Extract token IDs from the Detective Scans table (these are "exposed" tokens)
2. Extract token data from Black Market Scans table (these are "buried" tokens)
3. For buried tokens, include the shell account name, amount, and time
4. Extract shell account standings with name, total, token count, and rank
5. Extract the session UUID from "Session ID" field
6. Extract team names from "Teams Registered"

Return structured JSON matching the schema.`;

    try {
      return await sdk({
        prompt: sessionReportPrompt,
        systemPrompt: 'You parse game session reports with token and transaction data. Be precise with numbers and IDs.',
        model: 'sonnet', // Use sonnet for complex table parsing
        jsonSchema: SESSION_REPORT_SCHEMA
      });
    } catch (error) {
      console.warn('[parseRawInput] Error parsing session report:', error.message);
      // Continue with empty orchestrator data - not critical
      return {
        exposedTokens: [],
        buriedTokens: [],
        shellAccounts: [],
        exposedCount: 0,
        buriedCount: 0,
        totalBuried: 0
      };
    }
  })();

  // Step 3 Promise: Parse director notes
  const step3Promise = (async () => {
    if (!rawInput.directorNotes) {
      return {
        observations: {
          behaviorPatterns: [],
          suspiciousCorrelations: [],
          notableMoments: []
        }
      };
    }

    console.log('[parseRawInput] Step 3: Parsing director notes');
    const directorNotesPrompt = `Parse the following director observations into categorized lists:

DIRECTOR NOTES:
${rawInput.directorNotes}

Categories:
1. behaviorPatterns: Observable behaviors (who talked to whom, what they did)
2. suspiciousCorrelations: Suspected connections, possible pseudonyms, theories
3. notableMoments: Key moments or events worth highlighting

Return structured JSON matching the schema.`;

    try {
      return await sdk({
        prompt: directorNotesPrompt,
        systemPrompt: 'You categorize game director observations into behavior patterns, suspicions, and notable moments.',
        model: 'haiku',
        jsonSchema: DIRECTOR_NOTES_SCHEMA
      });
    } catch (error) {
      console.warn('[parseRawInput] Error parsing director notes:', error.message);
      // Continue with empty observations - not critical
      return {
        observations: {
          behaviorPatterns: [],
          suspiciousCorrelations: [],
          notableMoments: []
        }
      };
    }
  })();

  // Wait for Steps 1-3 to complete in parallel
  // Use allSettled to handle partial failures gracefully
  const [step1Result, step2Result, step3Result] = await Promise.allSettled([
    step1Promise,
    step2Promise,
    step3Promise
  ]);

  // Extract results (Step 1 is critical, Steps 2-3 have fallbacks)
  let sessionConfig;
  if (step1Result.status === 'fulfilled') {
    sessionConfig = step1Result.value;
  } else {
    console.error('[parseRawInput] Error parsing session config:', step1Result.reason?.message);
    throw new Error(`Failed to parse session config: ${step1Result.reason?.message}`);
  }

  const orchestratorParsed = step2Result.status === 'fulfilled'
    ? step2Result.value
    : { exposedTokens: [], buriedTokens: [], shellAccounts: [], exposedCount: 0, buriedCount: 0, totalBuried: 0 };

  let directorNotes = step3Result.status === 'fulfilled'
    ? step3Result.value
    : { observations: { behaviorPatterns: [], suspiciousCorrelations: [], notableMoments: [] } };

  console.log('[parseRawInput] Steps 1-3 complete');

  // ─────────────────────────────────────────────────────
  // Step 4: Analyze whiteboard photo (Layer 3 data)
  // Sequential - depends on Step 1 roster for OCR disambiguation
  // ─────────────────────────────────────────────────────

  let whiteboardData = {
    suspects: [],
    keyPhrases: [],
    evidenceConnections: [],
    factsEstablished: []
  };

  if (rawInput.whiteboardPhotoPath) {
    console.log('[parseRawInput] Step 4: Analyzing whiteboard photo');

    // Use ImagePromptBuilder for roster-aware OCR disambiguation
    const imagePromptBuilder = getImagePromptBuilder(config);
    const { systemPrompt: whiteboardSystemPrompt, userPrompt: whiteboardUserPrompt } =
      await imagePromptBuilder.buildWhiteboardPrompt({
        roster: sessionConfig.roster || [],
        whiteboardPhotoPath: rawInput.whiteboardPhotoPath
      });

    try {
      whiteboardData = await sdk({
        prompt: whiteboardUserPrompt,
        systemPrompt: whiteboardSystemPrompt,
        model: 'sonnet', // Use sonnet for complex image analysis
        jsonSchema: WHITEBOARD_SCHEMA,
        allowedTools: ['Read'] // Required for image viewing
      });
    } catch (error) {
      console.warn('[parseRawInput] Error analyzing whiteboard:', error.message);
      // Continue without whiteboard data - not critical but reduces quality
    }
  }

  // Merge whiteboard data into director notes
  directorNotes.whiteboard = whiteboardData;
  directorNotes.savedAt = new Date().toISOString();

  // ─────────────────────────────────────────────────────
  // Step 5: Build playerFocus (Layer 3 drives narrative)
  // ─────────────────────────────────────────────────────
  // Uses shared synthesizePlayerFocus from node-helpers.js (DRY)
  // See node-helpers.js for priority hierarchy documentation

  const playerFocus = synthesizePlayerFocus(sessionConfig, directorNotes);

  // ─────────────────────────────────────────────────────
  // Step 6: Save files to data directory
  // ─────────────────────────────────────────────────────

  const sessionId = sessionConfig.sessionId;
  const inputsDir = path.join(dataDir, sessionId, 'inputs');

  console.log(`[parseRawInput] Saving files to ${inputsDir}`);
  await ensureDir(inputsDir);

  // Include playerFocus in director notes for file-based resume
  // loadDirectorNotes extracts directorNotes.playerFocus when loading from files
  directorNotes.playerFocus = playerFocus;

  try {
    // Save session config
    await fs.writeFile(
      path.join(inputsDir, 'session-config.json'),
      JSON.stringify(sessionConfig, null, 2),
      'utf-8'
    );

    // Save director notes (includes whiteboard data AND playerFocus)
    await fs.writeFile(
      path.join(inputsDir, 'director-notes.json'),
      JSON.stringify(directorNotes, null, 2),
      'utf-8'
    );

    // Save orchestrator-parsed (token data)
    await fs.writeFile(
      path.join(inputsDir, 'orchestrator-parsed.json'),
      JSON.stringify(orchestratorParsed, null, 2),
      'utf-8'
    );
  } catch (error) {
    console.error('[parseRawInput] Error saving files:', error.message);
    throw new Error(`Failed to save input files: ${error.message}`);
  }

  const processingTimeMs = Date.now() - startTime;
  console.log(`[parseRawInput] Complete in ${processingTimeMs}ms`);

  // Return parsed data for review checkpoint
  return {
    sessionId,
    sessionConfig,
    directorNotes,
    playerFocus,
    _parsedInput: {
      sessionConfig,
      directorNotes,
      orchestratorParsed,
      parsedAt: new Date().toISOString(),
      processingTimeMs
    },
    currentPhase: PHASES.REVIEW_INPUT,
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.INPUT_REVIEW
  };
}

// ═══════════════════════════════════════════════════════
// FINALIZE INPUT NODE
// ═══════════════════════════════════════════════════════

/**
 * Finalize input after user review
 *
 * Receives user-edited input (or approval of parsed input) and
 * updates the saved files with any corrections.
 *
 * Called after user approves/edits at INPUT_REVIEW checkpoint.
 *
 * @param {Object} state - Current state with edited input from approval
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with finalized data, currentPhase
 */
async function finalizeInput(state, config) {
  // Check if user provided edits
  const editedInput = config?.configurable?.approvals?.inputReview;

  if (editedInput && !editedInput.approved) {
    // User provided edits - update files
    console.log('[finalizeInput] Applying user edits to input files');

    const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
    const sessionId = state.sessionId;
    const inputsDir = path.join(dataDir, sessionId, 'inputs');

    if (editedInput.sessionConfig) {
      await fs.writeFile(
        path.join(inputsDir, 'session-config.json'),
        JSON.stringify(editedInput.sessionConfig, null, 2),
        'utf-8'
      );
    }

    if (editedInput.directorNotes) {
      await fs.writeFile(
        path.join(inputsDir, 'director-notes.json'),
        JSON.stringify(editedInput.directorNotes, null, 2),
        'utf-8'
      );
    }

    if (editedInput.orchestratorParsed) {
      await fs.writeFile(
        path.join(inputsDir, 'orchestrator-parsed.json'),
        JSON.stringify(editedInput.orchestratorParsed, null, 2),
        'utf-8'
      );
    }

    // Update state with edited values
    return {
      sessionConfig: editedInput.sessionConfig || state.sessionConfig,
      directorNotes: editedInput.directorNotes || state.directorNotes,
      playerFocus: editedInput.playerFocus || state.playerFocus,
      awaitingApproval: false,
      approvalType: null,
      currentPhase: PHASES.LOAD_DIRECTOR_NOTES
    };
  }

  // User approved without edits - proceed
  console.log('[finalizeInput] Input approved, proceeding to workflow');

  return {
    awaitingApproval: false,
    approvalType: null,
    currentPhase: PHASES.LOAD_DIRECTOR_NOTES
  };
}

// ═══════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════

/**
 * Create mock SDK client for testing
 *
 * @param {Object} mockResponses - Map of expected responses by schema type
 * @returns {Function} Mock SDK query function
 */
function createMockInputParser(mockResponses = {}) {
  const calls = [];

  async function mockSdk({ prompt, systemPrompt, model, jsonSchema }) {
    calls.push({ prompt, systemPrompt, model, jsonSchema });

    // Determine which mock to return based on schema
    if (jsonSchema === SESSION_CONFIG_SCHEMA) {
      return mockResponses.sessionConfig || {
        sessionId: '1221',
        sessionDate: '2025-12-21',
        roster: ['Alex', 'Victoria', 'Morgan'],
        rosterCount: 3,
        accusation: {
          accused: ['Victoria', 'Morgan'],
          charge: 'Collusion to murder Marcus',
          notes: 'Test accusation'
        }
      };
    }

    if (jsonSchema === SESSION_REPORT_SCHEMA) {
      return mockResponses.sessionReport || {
        exposedTokens: ['alr001', 'asm031'],
        buriedTokens: [
          { tokenId: 'mor021', shellAccount: 'Offbeat', amount: 150000, time: '10:30 PM' }
        ],
        shellAccounts: [
          { name: 'Offbeat', total: 150000, tokenCount: 1, rank: 1 }
        ],
        exposedCount: 2,
        buriedCount: 1,
        totalBuried: 150000
      };
    }

    if (jsonSchema === DIRECTOR_NOTES_SCHEMA) {
      return mockResponses.directorNotes || {
        observations: {
          behaviorPatterns: ['Taylor and Diana spotted together early'],
          suspiciousCorrelations: ['ChaseT might be Taylor'],
          notableMoments: ['Final accusation at 11:48 PM']
        }
      };
    }

    if (jsonSchema === WHITEBOARD_SCHEMA) {
      return mockResponses.whiteboard || {
        names: ['Victoria', 'Morgan', 'Derek', 'Marcus', 'James'],
        connections: [
          { from: 'Victoria', to: 'Morgan', label: 'colluded with' },
          { from: 'Marcus', to: 'Victoria', label: 'was married to' }
        ],
        groups: [
          { label: 'SUSPECTS', members: ['Victoria', 'Morgan', 'Derek'] },
          { label: 'FACTS', members: ['Marcus was killed', 'Memory drug was used'] }
        ],
        notes: ['Victoria hired Morgan', 'Past bad blood between Marcus and Victoria'],
        structureType: 'accusation web with suspects circled',
        ambiguities: ['Unclear handwriting near top right corner']
      };
    }

    return {};
  }

  mockSdk.getCalls = () => calls;
  mockSdk.clear = () => { calls.length = 0; };

  return mockSdk;
}

module.exports = {
  // Node functions (wrapped with LangSmith tracing)
  parseRawInput: traceNode(parseRawInput, 'parseRawInput', {
    stateFields: ['rawSessionInput']
  }),
  finalizeInput: traceNode(finalizeInput, 'finalizeInput'),

  // Utilities (exported for DRY reuse in server.js Phase 4e)
  sanitizePath,

  // Testing utilities
  createMockInputParser,

  // Constants for testing
  _testing: {
    DEFAULT_DATA_DIR,
    SESSION_CONFIG_SCHEMA,
    SESSION_REPORT_SCHEMA,
    DIRECTOR_NOTES_SCHEMA,
    WHITEBOARD_SCHEMA,
    deriveSessionId,
    ensureDir,
    sanitizePath
  }
};
