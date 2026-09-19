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
 * - session-config.json: roster, accusation, metadata (NOT photosPath - C1: state.photosPath owns it)
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
const { PHASES } = require('../state');
const { getSdkClient, synthesizePlayerFocus, normalizeRosterPronounsToCanonical, resolveRoster } = require('./node-helpers');
const { createImagePromptBuilder } = require('../../image-prompt-builder');
const { traceNode } = require('../../observability');
const { enrichDirectorNotes } = require('../../director-enricher');
const { getThemeNPCs } = require('../../theme-config');

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
      description: 'Copy the provided sessionId verbatim.'
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

/**
 * Project buriedTokens entries into the scoringTimeline row shape expected by
 * the director-notes enricher prompt builder.
 *
 * orchestratorParsed has no `scoringTimeline` field; the Scoring Timeline data
 * the enricher needs for cross-referencing director observations to transactions
 * lives in `buriedTokens` (one row per burial sale). This helper reshapes those
 * rows into the `{ time, type, detail, team, amount }` shape consumed by
 * `lib/director-enricher.js`.
 *
 * @param {Array<{tokenId: string, shellAccount: string, amount: number, time?: string}>} buriedTokens
 * @returns {Array<{time: string, type: string, detail: string, team: string, amount: string}>}
 */
function projectBuriedTokensToScoringTimeline(buriedTokens) {
  if (!Array.isArray(buriedTokens) || buriedTokens.length === 0) {
    return [];
  }
  return buriedTokens.map(entry => {
    const rawAmount = typeof entry.amount === 'number' ? entry.amount : 0;
    return {
      time: entry.sessionTransactionTime || entry.time || '',
      type: 'Sale',
      detail: entry.tokenId || '',
      team: entry.shellAccount || '',
      amount: `+$${rawAmount.toLocaleString('en-US')}`
    };
  });
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

/**
 * Shallow-copy sessionConfig, reserved as an extension point for future
 * director-notes-driven overrides. Currently a passthrough — reportingMode
 * and guestReporter are now stamped from rawSessionInput in parseRawInput
 * Step 1 (see docs/superpowers/specs/2026-04-20-reporting-mode-explicit-input-design.md).
 * @param {Object} sessionConfig - Parsed session config from Step 1
 * @param {Object} directorNotes - Unused; retained for signature stability
 */
function mergeDirectorOverrides(sessionConfig, directorNotes) {
  return { ...sessionConfig };
}

/**
 * Resolve rosterPronouns with KEY-COUNT precedence (CR-4).
 *
 * An empty-but-present map ({}) is truthy and would shadow a populated source under
 * `||`. Select the first map that actually has keys: incremental state wins over
 * rawInput; {} only results when BOTH are genuinely empty.
 *
 * @param {Object} state - Workflow state (may carry rosterPronouns from await-roster).
 * @param {Object} rawInput - state.rawSessionInput (may carry rosterPronouns from /start).
 * @returns {Object} The chosen pronoun map (possibly {}).
 */
function resolveRosterPronouns(state, rawInput) {
  const fromState = (state && state.rosterPronouns) || {};
  if (Object.keys(fromState).length > 0) return fromState;
  const fromRaw = (rawInput && rawInput.rosterPronouns) || {};
  if (Object.keys(fromRaw).length > 0) return fromRaw;
  return {};
}

/**
 * Build the <DIRECTOR_CORRECTIONS> suffix appended to every parse prompt on a
 * re-parse (B2).
 *
 * The director rejected the previous parse at the input-review gate and typed
 * what was wrong. Those corrections outrank the source text: the source text is
 * exactly what produced the bad parse.
 *
 * @param {string|null} corrections - state._inputCorrections
 * @returns {string} '' when there are no corrections
 */
function buildCorrectionsBlock(corrections) {
  if (typeof corrections !== 'string' || !corrections.trim()) return '';
  return '\n\n<DIRECTOR_CORRECTIONS>\n' + corrections.trim() +
    '\n</DIRECTOR_CORRECTIONS>\nApply these corrections; they override anything in the source text.';
}

async function parseRawInput(state, config) {
  // ROLL-4: gate the skip on the parsed OUTPUT (sessionConfig), not the raw input, so a
  // rollback to await-full-context (which clears sessionConfig) re-parses; a normal resume
  // past input-review (sessionConfig populated) still skips; a from-files start (no
  // rawSessionInput) still skips. rawSessionInput is no longer pruned (Step 12b), so the
  // config reads below (photosPath/journalistFirstName/etc.) survive the rollback replay.
  if ((state.sessionConfig && Object.keys(state.sessionConfig).length > 0) || !state.rawSessionInput) {
    console.log('[parseRawInput] sessionConfig populated or no rawSessionInput — skipping parse');
    // B2: a reject-with-corrections at the input-review gate nulls sessionConfig and
    // routes back here. If there is no rawSessionInput (a from-files run), there is
    // nothing to re-parse — say so loudly and consume the corrections so the gate
    // does not keep offering a re-parse that cannot happen.
    if (typeof state._inputCorrections === 'string' && state._inputCorrections.trim()) {
      console.warn(
        '[parseRawInput] Director corrections supplied but there is no raw session input to ' +
        're-parse (file-based run). Edit data/<session>/inputs/*.json directly, or roll back ' +
        'to await-full-context to re-collect the source text.'
      );
      return {
        _inputCorrections: null,
        currentPhase: PHASES.LOAD_DIRECTOR_NOTES
      };
    }
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
  // Phase 4c: Run Steps 1, 2 in parallel (independent AI calls)
  // Steps 3 (director enrichment) and 4 (whiteboard) run sequentially — both need outputs from Steps 1 & 2.
  // ─────────────────────────────────────────────────────

  console.log('[parseRawInput] Running Steps 1-2 in parallel');

  // Use config sessionId if provided, otherwise try to derive from session report
  const sessionIdHint = configSessionId
    ? `Use sessionId: "${configSessionId}" (provided by caller)`
    : `Derive sessionId from: ${state.sessionReport?.match(/Start Time\s*\|\s*([^\n|]+)/)?.[1] || 'current date'}`;

  // Use state.roster if available (from await-roster checkpoint), otherwise fall
  // back to sessionConfig and finally to the at-start rawInput.roster (H4: one
  // shared resolver for the incremental-channel-vs-sessionConfig precedence).
  const resolvedRoster = resolveRoster(state);
  const rosterForParsing = resolvedRoster.length > 0 ? resolvedRoster : rawInput.roster;

  // B2: on a re-parse the director's corrections ride along on every parse prompt.
  const correctionsBlock = buildCorrectionsBlock(state._inputCorrections);
  if (correctionsBlock) {
    console.log('[parseRawInput] Re-parsing with director corrections');
  }

  // Step 1 Promise: Parse roster and accusation
  const step1Promise = (async () => {
    console.log('[parseRawInput] Step 1: Parsing roster and accusation');
    const sessionConfigPrompt = `Parse the following information into structured JSON:

ROSTER OF CHARACTERS:
${Array.isArray(rosterForParsing) ? rosterForParsing.join(', ') : (rosterForParsing || 'Not provided')}

MURDER ACCUSATION:
${state.accusation || 'Not provided'}

SESSION ID INSTRUCTION:
${sessionIdHint}

Rules for parsing:
1. Extract character first names from the roster (comma-separated list)
2. For accusation, identify WHO was accused and WHAT they were accused of
3. For sessionId: Use the provided sessionId verbatim. (B1: a derived id sent session 071126's inputs to data/0711/ and published report-0711.html with no photos. parseRawInput overrides a wrong answer, but do not produce one.)
4. sessionDate should be YYYY-MM-DD format

Return structured JSON matching the schema.${correctionsBlock}`;

    const result = await sdk({
      prompt: sessionConfigPrompt,
      systemPrompt: 'You parse game session information into structured JSON. Be precise and accurate.',
      model: 'haiku',
      jsonSchema: SESSION_CONFIG_SCHEMA,
      disableTools: true,          // H21: pure parse; no tool needs it
      loadProjectSettings: false
    });
    result.rosterCount = result.roster?.length || 0;
    // photosPath is NOT copied here any more (C1): state.photosPath is the one
    // owner and fetchSessionPhotos reads only that. Two copies is how the gate
    // and the fetch came to disagree about which folder was in play.
    result.journalistFirstName = rawInput.journalistFirstName || 'Cassandra';
    result.reportingMode = rawInput.reportingMode || 'on-site';
    result.guestReporter = rawInput.guestReporter || null;
    // F1 (X-1 + CR-6 + CR-4): consume the raw rosterPronouns channel EXACTLY ONCE here.
    // The await-roster approval writes typed-keyed pronouns to state.rosterPronouns
    // (the channel); this is the single bridge that normalizes them to canonical
    // first-name keys and stamps them onto sessionConfig.rosterPronouns. From this
    // point on, sessionConfig.rosterPronouns is the ONE source of truth — every
    // downstream reader (prompt-builder via getPromptBuilder, InputReview) reads
    // the sessionConfig copy, NOT the raw channel (whose key domain is typed, not
    // canonical). Do not re-read state.rosterPronouns downstream.
    // CR-4: resolveRosterPronouns picks the populated map by KEY COUNT so an
    // empty-but-present {} cannot shadow a populated rawInput under `||`.
    result.rosterPronouns = normalizeRosterPronounsToCanonical(
      resolveRosterPronouns(state, rawInput),
      state.canonicalCharacters || {}
    );
    result.createdAt = new Date().toISOString();
    return result;
  })();

  // Step 2 Promise: Parse session report (tokens, shell accounts)
  const step2Promise = (async () => {
    // ROLL-4 + N1 fail-loud: the await-full-context gate guarantees presence before
    // parseRawInput runs; a null here means the gate was bypassed. An empty session
    // report makes every token default to buried and drops shell accounts -> the
    // generator fabricates the investigation/amounts. Throw instead of degrading.
    if (!state.sessionReport) {
      throw new Error('parseRawInput: sessionReport is required but missing (await-full-context gate invariant violated)');
    }

    console.log('[parseRawInput] Step 2: Parsing session report');
    const sessionReportPrompt = `Parse the following session gameplay report into structured JSON.

SESSION REPORT:
${state.sessionReport}

Section names vary between session-report generations. Recognize ALL of these patterns:

EXPOSED tokens (sold to Detective, become public evidence):
- "Detective Evidence Log" table (current orchestrator format)
- "Detective Scans" table (older format)
- Token IDs appear in the leftmost "Token" column

BURIED tokens (sold to Black Market, buried in shell accounts):
- "Scoring Timeline" table rows where Type = "Sale" (current orchestrator format)
- "Black Market Scans" table (older format)
- For each Sale row: Detail column contains "<tokenId>/<Character Name>", Team column = shell account name, Amount column = dollar amount
- Adjustment rows on the Scoring Timeline are NOT buried tokens — skip them
- Only count true buries: rows whose Detail field begins with a tokenId like "fli001/" or "sar002/"

SHELL ACCOUNTS:
- "Final Standings" or "Final Totals" section (current orchestrator format)
- "Shell Account Standings" section (older format)
- Each shell account has a name, a total dollar amount, and a rank
- tokenCount = number of unique buried tokens routed to that account (count from the Scoring Timeline; if unavailable, use 0)
- IMPORTANT: only include team names that appear in BOTH Final Standings AND as a Sale-target in the Scoring Timeline. Skip placeholder/bonus rows like "First Burial Bonus" if they don't represent a player shell account.

OTHER FIELDS:
- "Session ID" / "session UUID" → sessionId
- "Teams Registered" or the comma-separated team list under "Session Summary" → teamsRegistered

If you can't find a section, return an empty array for that field rather than failing. The downstream pipeline tolerates missing data better than wrong data.

Return structured JSON matching the schema.${correctionsBlock}`;

    // N1 fail-loud: the session report is the AUTHORITATIVE token-disposition +
    // financial source. An empty fallback makes every token default to buried and
    // drops all shell accounts, so the generator fabricates the investigation and
    // amounts. Let the error propagate: graph retryPolicy retries transient SDK
    // failures, and a persistent failure throws against the clean pre-node snapshot
    // for operator-driven /resume.
    return await sdk({
      prompt: sessionReportPrompt,
      systemPrompt: 'You parse game session reports with token and transaction data. Be precise with numbers and IDs.',
      model: 'sonnet', // Use sonnet for complex table parsing
      jsonSchema: SESSION_REPORT_SCHEMA,
      disableTools: true,          // H21: pure parse; no tool needs it
      loadProjectSettings: false
    });
  })();

  // Wait for Steps 1-2 to complete in parallel (Step 3 enrichment depends on
  // Step 1 roster + Step 2 orchestrator data, so it runs sequentially after).
  // Use allSettled to handle partial failures gracefully.
  const [step1Result, step2Result] = await Promise.allSettled([
    step1Promise,
    step2Promise
  ]);

  // Extract results (Step 1 is critical, Step 2 has fallback)
  let sessionConfig;
  if (step1Result.status === 'fulfilled') {
    sessionConfig = step1Result.value;
  } else {
    console.error('[parseRawInput] Error parsing session config:', step1Result.reason?.message);
    throw new Error(`Failed to parse session config: ${step1Result.reason?.message}`);
  }

  // N1 fail-loud: do NOT substitute empty orchestrator data — that is the silent
  // degradation that lets the generator invent the investigation. Step 2 is as
  // critical as step 1.
  let orchestratorParsed;
  if (step2Result.status === 'fulfilled') {
    orchestratorParsed = step2Result.value;
  } else {
    console.error('[parseRawInput] Error parsing session report:', step2Result.reason?.message);
    throw new Error(`Failed to parse session report: ${step2Result.reason?.message}`);
  }

  console.log('[parseRawInput] Steps 1-2 complete');

  // Step 3: Director notes enrichment (depends on Step 1 roster + Step 2 orchestrator data)
  const theme = config?.configurable?.theme || 'journalist';
  const themeNPCs = getThemeNPCs(theme);

  // ROLL-4 + N1 fail-loud: gate guarantees presence (see sessionReport above).
  if (!state.directorNotesRaw) {
    throw new Error('parseRawInput: directorNotesRaw is required but missing (await-full-context gate invariant violated)');
  }
  let directorNotes;
  {
    console.log('[parseRawInput] Step 3: Enriching director notes with Opus');
    directorNotes = await enrichDirectorNotes({
      rawProse: state.directorNotesRaw,
      roster: sessionConfig.roster || [],
      accusation: sessionConfig.accusation || null,
      npcs: themeNPCs,
      shellAccounts: orchestratorParsed.shellAccounts || [],
      detectiveEvidenceLog: orchestratorParsed.exposedTokens || [],
      scoringTimeline: projectBuriedTokensToScoringTimeline(orchestratorParsed.buriedTokens || []),
      corrections: state._inputCorrections || null   // B2: re-parse corrections
    }, sdk);

    const counts = {
      chars: Object.keys(directorNotes.characterMentions || {}).length,
      quotes: (directorNotes.quotes || []).length,
      txRefs: (directorNotes.transactionReferences || []).length,
      postInv: (directorNotes.postInvestigationDevelopments || []).length
    };
    console.log(`[parseRawInput] Director enrichment complete: ${counts.chars} character mentions, ${counts.quotes} quotes, ${counts.txRefs} transaction links, ${counts.postInv} post-investigation items`);
  }

  // Merge director note overrides into sessionConfig
  sessionConfig = mergeDirectorOverrides(sessionConfig, directorNotes);
  console.log(`[parseRawInput] Reporting mode: ${sessionConfig.reportingMode}`);
  if (sessionConfig.guestReporter) {
    console.log(`[parseRawInput] Guest reporter: ${sessionConfig.guestReporter.name}`);
  }

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

    // N4 fail-loud: the whiteboard drives playerFocus (Layer 3), which grounds arc
    // analysis in the players' own conclusions. A swallowed failure leaves an empty
    // player-focus and the arcs get invented. Let it propagate (retryPolicy + snapshot).
    try {
      whiteboardData = await sdk({
        prompt: whiteboardUserPrompt,
        systemPrompt: whiteboardSystemPrompt,
        model: 'sonnet', // Use sonnet for complex image analysis
        jsonSchema: WHITEBOARD_SCHEMA,
        tools: ['Read'],        // H21: the ONLY tool this call may use
        allowedTools: ['Read'], // Required for image viewing (permission auto-allow)
        loadProjectSettings: false
      });
    } catch (error) {
      // N4 fail-loud: re-throw with phase context; do NOT continue with empty player-focus.
      console.error('[parseRawInput] Error analyzing whiteboard:', error.message);
      throw new Error(`Failed to analyze whiteboard: ${error.message}`);
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

  // B1: the sessionId channel is owned by initializeSession (thread_id). Haiku's
  // Step-1 answer is advisory at best -- for session 071126 it returned "0711", so
  // the inputs were written to data/0711/ while data/071126/ got none and the
  // report was published as report-0711.html with photosCopied=0. Take the
  // authoritative id, and refuse to write anything if we do not have one.
  const sessionId = state.sessionId || config?.configurable?.sessionId;
  if (!sessionId) {
    throw new Error('[parseRawInput] No sessionId in state or config; refusing to write inputs');
  }
  if (sessionConfig.sessionId !== sessionId) {
    console.warn(`[parseRawInput] Model returned sessionId "${sessionConfig.sessionId}"; overriding with "${sessionId}"`);
    sessionConfig.sessionId = sessionId;
  }
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

  // Build parsed data for review checkpoint
  const parsedData = {
    // NOTE (B1): no `sessionId` key -- returning one would overwrite the channel
    // initializeSession set from thread_id. The id lives inside sessionConfig.
    sessionConfig,
    directorNotes,
    playerFocus,
    shellAccounts: orchestratorParsed?.shellAccounts || []
    // No `_parsedInput`: it was never an Annotation channel, so LangGraph dropped
    // every write and its only reader (getCheckpointData) always saw undefined.
    // The parse outputs above are the checkpoint's data.
  };

  // B2: the input-review interrupt USED to live here, after the three SDK calls and
  // the three file writes above. LangGraph re-executes an interrupted node from its
  // top on resume, so every approve re-paid the whole parse. The interrupt now lives
  // in checkpointInputReview (the next node); this node is pure data again.
  //
  // _inputCorrections is consumed above and cleared here: a second reject re-supplies
  // it, and routeAfterInputReview only loops back while it is non-empty.
  return {
    ...parsedData,
    _inputCorrections: null,
    currentPhase: PHASES.REVIEW_INPUT
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
  // B2: the `config.configurable.approvals.inputReview` edit branch that used to live
  // here was dead code. Nothing ever populated config.configurable.approvals - the
  // /approve endpoint delivers decisions through Command({ resume }), and the field-edit
  // path it implemented wrote to a `_inputEdits` state key that was never an Annotation
  // channel (LangGraph drops undeclared keys). Corrections now arrive as prose at the
  // input-review gate and are applied by a re-parse (checkpointInputReview ->
  // parseRawInput), which also rewrites inputs/*.json.
  console.log('[finalizeInput] Input approved, proceeding to workflow');

  return {
    currentPhase: PHASES.LOAD_DIRECTOR_NOTES
  };
}

// ═══════════════════════════════════════════════════════
// TESTING UTILITIES
// ═══════════════════════════════════════════════════════


module.exports = {
  // Node functions (wrapped with LangSmith tracing)
  parseRawInput: traceNode(parseRawInput, 'parseRawInput', {
    stateFields: ['rawSessionInput']
  }),
  finalizeInput: traceNode(finalizeInput, 'finalizeInput'),

  // Utilities (exported for DRY reuse in server.js Phase 4e)
  sanitizePath,

  // Constants for testing
  _testing: {
    DEFAULT_DATA_DIR,
    SESSION_CONFIG_SCHEMA,
    SESSION_REPORT_SCHEMA,
    WHITEBOARD_SCHEMA,
    deriveSessionId,
    ensureDir,
    sanitizePath,
    mergeDirectorOverrides,
    resolveRosterPronouns,
    projectBuriedTokensToScoringTimeline
  }
};
