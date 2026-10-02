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
 * - session-config.json: roster (stamped from the roster stop), accusation (with its
 *   verdictKind and, for a split final vote, its votes), the director's accusation
 *   word for word (accusationRaw), each exposed memory's exposer/time/owner
 *   (exposures, which the morning timeline reads since phase 3), the classified
 *   adjustments, the totals check (ledgerCheck), the session clock (sessionClock),
 *   metadata (NOT photosPath - C1: state.photosPath owns it)
 * - director-notes.json: observations, whiteboard data (from vision)
 * - orchestrator-parsed.json: exposedTokens, exposures, buriedTokens, the Adjustment
 *   rows and Final Standings as the model copied them, and shellAccounts as code
 *   computed them
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
const { getThemeNPCs, getThemeNPCEntries } = require('../../theme-config');
const { VERDICT_KINDS, normalizeAccusation } = require('../../accusation-verdict');
const { buildParseCorrectionsBlock, normalizeCorrections } = require('../../prompt-renderers/director-words-renderer');
const { decideSessionClock } = require('../../prompt-renderers/session-clock');
const { buildLedger } = require('../../session-ledger');

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
 * Schema for session config parsing: the group statement only.
 *
 * Phase 3 (brief 3.5): the roster, the session id, the reporter and the reporting
 * mode are stamped by code from where the director entered them; the model is asked
 * for none of them, so a parse can never rewrite them. (sessionDate went too: no
 * date reached the call and nothing read it.)
 */
const SESSION_CONFIG_SCHEMA = {
  type: 'object',
  required: ['accusation'],
  properties: {
    // Phase 2 brief 2.2: a verdict with no culprit has its own shape. On 092026 the
    // room voted for an accidental overdose and this schema, which could only name a
    // defendant, got the victim as the accused. Phase 3 (3.5): a verdict that blames
    // an institution or an unnamed person, and a split final vote, have theirs.
    accusation: {
      type: 'object',
      required: ['verdictKind', 'accused', 'charge'],
      properties: {
        verdictKind: {
          type: 'string',
          enum: VERDICT_KINDS,
          description: 'What kind of verdict the group statement is. "culprit" when it holds someone responsible: one or more characters, an institution such as NeurAI\'s board, or a person it does not name. Otherwise it names no culprit: "accident", "overdose" (an accidental overdose included), "self-harm", or "other" for any other verdict that holds no one responsible.'
        },
        accused: {
          type: 'array',
          items: { type: 'string' },
          description: 'The characters the group statement holds responsible, by name. Empty when it blames an institution or an unnamed person, and for every kind but "culprit". Marcus Blackwood is the man whose death the room investigates, so he is never listed here.'
        },
        charge: {
          type: 'string',
          description: 'What the group statement concluded, in the room\'s words: the charge against the culprit, naming the institution or unnamed person when that is who the room blamed, or, for a verdict with no culprit, the verdict itself (e.g. "Accidental overdose").'
        },
        votes: {
          type: 'array',
          items: {
            type: 'object',
            required: ['option', 'count', 'adopted'],
            properties: {
              option: { type: 'string', description: 'What the votes were for, in the director\'s words: a character, an institution, or a verdict such as "accidental overdose".' },
              count: { type: 'number', description: 'How many votes it drew.' },
              adopted: { type: 'boolean', description: 'True for the option the group statement adopted.' }
            }
          },
          description: 'Only for a split final vote that the text records: every option that drew votes, with its count. Mark the one the group statement adopted, or none when it adopted none of them. Leave this out when the final vote was unanimous or the text gives no tally.'
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
 * Schema for session report parsing: the evidence log, the sales, the Adjustment
 * rows and the Final Standings, each copied as written.
 *
 * Phase 3 (brief 3.5): the model copies rows and counts nothing. Code classifies the
 * Adjustment rows and computes each account's total and sale count (session-ledger.js);
 * the model's own account list, with its sale counts, is gone.
 */
const SESSION_REPORT_SCHEMA = {
  type: 'object',
  required: ['exposedTokens', 'buriedTokens', 'adjustmentRows', 'finalStandings'],
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
      description: 'The ids of the memories turned in to Nova, from the evidence log\'s Token column'
    },
    // Phase 2 brief 2.2 kept the Detective Evidence Log's per-row columns. Phase 3
    // (brief 3.5): the morning timeline prints each exposure's time and the name on
    // its turn-in, for memories the bundle holds as exposed; the owner column prints
    // nowhere.
    exposures: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tokenId'],
        properties: {
          tokenId: { type: 'string', description: 'The memory id, exactly as in exposedTokens' },
          exposer: { type: 'string', description: 'The "Exposed By" column, copied as written: the name the player put on the turn-in to Nova, or the anonymous default (e.g. "NovaNews (Anonymous)"). A name here is the player\'s honest attribution of who turned the memory in.' },
          time: { type: 'string', description: 'The time the memory was turned in, from the log row, verbatim (e.g. "09:06 PM")' },
          owner: { type: 'string', description: 'The "Owner" column: whose memory it is, verbatim' }
        }
      },
      description: 'One entry per memory turned in to Nova, from its evidence log row: when it was turned in, the name on the turn-in, and whose memory it is'
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
      description: 'The sales: each memory sold to be erased, with the account paid, the amount and the time'
    },
    buriedCount: {
      type: 'number',
      description: 'Number of buried tokens'
    },
    adjustmentRows: {
      type: 'array',
      items: {
        type: 'object',
        required: ['time', 'detail', 'team', 'amount'],
        properties: {
          time: { type: 'string', description: 'The row\'s time, verbatim' },
          detail: { type: 'string', description: 'The Detail column, verbatim' },
          team: { type: 'string', description: 'The Team column, verbatim' },
          amount: { type: 'number', description: 'The Amount column as a number: negative when the row shows a minus' }
        }
      },
      description: 'Every Scoring Timeline row whose Type is "Adjustment", copied as written'
    },
    finalStandings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'total'],
        properties: {
          name: { type: 'string', description: 'The account\'s name, verbatim' },
          total: { type: 'number', description: 'Its total, as a number' }
        }
      },
      description: 'Every row of the Final Standings section (or Final Totals, or Shell Account Standings), copied as written'
    },
    totalBuried: {
      type: 'number',
      description: 'The session report\'s total of all sales'
    },
    teamsRegistered: {
      type: 'array',
      items: { type: 'string' },
      description: 'Team names registered in session'
    }
  }
};

/**
 * Schema for whiteboard analysis.
 *
 * Phase 3 (brief 3.5): the regions of the whiteboard, each with the heading the
 * players wrote, in place of groups under a model-written label (the old example
 * "SUSPECTS" led the model to label clusters itself, and code read the first group
 * so labelled as the room's suspects). Names are matched against every character and
 * the NPCs, and kept as written when unsure.
 *
 * Each rule is stated once (fix batch, finding 7): the reading rules, name matching
 * included, are whiteboard-analysis.md's; these descriptions define the fields; the
 * user prompt carries the photo, the session's lists and the corrections.
 */
const WHITEBOARD_SCHEMA = {
  type: 'object',
  required: ['names', 'regions'],
  properties: {
    names: {
      type: 'array',
      items: { type: 'string' },
      description: 'Every name written on the whiteboard, spelled as the matching rules decide.'
    },
    regions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['label', 'entries'],
        properties: {
          label: { type: 'string', description: 'The heading the players wrote over this region, copied as written; empty when they wrote none.' },
          location: { type: 'string', description: 'Where the region sits on the whiteboard, such as "left column" or "top right".' },
          entries: { type: 'array', items: { type: 'string' }, description: 'The writing inside the region, item by item, copied as written, with names spelled as in names.' }
        }
      },
      description: 'One entry per region of the whiteboard.'
    },
    connections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Where the line or arrow starts' },
          to: { type: 'string', description: 'Where it ends' },
          label: { type: 'string', description: 'The words written on the line, copied as written; empty when there are none' }
        }
      },
      description: 'Lines or arrows drawn between items on the whiteboard'
    },
    notes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Writing that sits in no region and on no line, copied as written'
    },
    structureType: {
      type: 'string',
      description: 'How the whiteboard is laid out, described plainly (e.g. "three columns", "names joined by lines", "free-form notes")'
    },
    ambiguities: {
      type: 'array',
      items: { type: 'string' },
      description: 'Writing you could not read with confidence: the text as written, and what it might say'
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
 * rows into the `{ time, type, team, amount }` shape consumed by
 * `lib/director-enricher.js`, which keys each row for the model.
 *
 * A row is a buried memory's sale, so it carries no memory id (phase 2 final fix
 * wave): the id's prefix names the owner, and the enricher's links used to carry the
 * id from here into every writer, reworker and judge.
 *
 * @param {Array<{tokenId: string, shellAccount: string, amount: number, time?: string}>} buriedTokens
 * @returns {Array<{time: string, type: string, team: string, amount: string}>}
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
 * The roster as the director entered it at the roster stop (phase 3, brief 3.5).
 *
 * Code stamps it, as it stamps rosterPronouns and reportingMode: the parse never
 * rewrites it, so a name the model dropped or renamed can no longer leave a player
 * out of every list that reads the roster. A name that matches a canonical character
 * (its first name or its full name, case-insensitive) takes the canonical first name,
 * the key normalizeRosterPronounsToCanonical stamps that player's pronouns under; any
 * other name stays as the director typed it.
 *
 * @param {string[]|string|null} roster - state.roster (the roster stop), or the
 *   at-start rawInput.roster (comma-separated)
 * @param {Object|null} canonicalCharacters - firstName -> fullName
 * @returns {string[]}
 */
function rosterFromRosterStop(roster, canonicalCharacters) {
  const list = Array.isArray(roster) ? roster : (typeof roster === 'string' ? roster.split(',') : []);
  const canonical = canonicalCharacters || {};
  const keys = Object.keys(canonical);
  return list
    .map(entry => (typeof entry === 'string' ? entry : entry?.name))
    .filter(name => typeof name === 'string' && name.trim())
    .map(name => {
      const lower = name.trim().toLowerCase();
      return keys.find(k => k.toLowerCase() === lower) ||
        keys.find(k => String(canonical[k]).trim().toLowerCase() === lower) ||
        name.trim();
    });
}

/**
 * The NPCs' names for the whiteboard parse: full names where the theme gives one.
 *
 * @param {string} theme
 * @returns {string[]}
 */
function npcNamesOf(theme) {
  return getThemeNPCEntries(theme)
    .map(n => (typeof n === 'string' ? n : (n.fullName || n.name)))
    .filter(Boolean);
}

/**
 * The corrections a parse applies: every one the director has sent back from the
 * input review this session, in order (phase 2, brief 2.2).
 *
 * A re-parse starts again from the source text, so a second send back that carried
 * only its own correction undid the first one in the parse. The kept list is the
 * record; `_inputCorrections` (the round's own correction) only stands in when the
 * list is empty, for a thread whose send back predates the list.
 *
 * The block itself is buildParseCorrectionsBlock (director-words-renderer.js), the
 * one wording every parse prompt shares (B2).
 *
 * @param {Object} state
 * @returns {string[]}
 */
function correctionsForParse(state) {
  const kept = normalizeCorrections(state.inputReviewCorrections || []);
  if (kept.length > 0) return kept;
  return normalizeCorrections(state._inputCorrections);
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

  // Use state.roster if available (from await-roster checkpoint), otherwise fall
  // back to sessionConfig and finally to the at-start rawInput.roster (H4: one
  // shared resolver for the incremental-channel-vs-sessionConfig precedence).
  const resolvedRoster = resolveRoster(state);
  // Phase 3 (brief 3.5): the roster is stamped by code from the roster stop and
  // shown to the parses as context; no parse returns it.
  const roster = rosterFromRosterStop(resolvedRoster.length > 0 ? resolvedRoster : rawInput.roster, state.canonicalCharacters);

  // B2: on a re-parse the director's corrections ride along on every parse prompt.
  // Brief 2.2: all of them, in order, not only this round's.
  const parseCorrections = correctionsForParse(state);
  const correctionsBlock = buildParseCorrectionsBlock(parseCorrections);
  if (correctionsBlock) {
    console.log(`[parseRawInput] Re-parsing with ${parseCorrections.length} director correction(s)`);
  }

  // Step 1 Promise: Parse the group statement; stamp the roster and the session's settings
  const step1Promise = (async () => {
    console.log('[parseRawInput] Step 1: Parsing the group statement');
    const sessionConfigPrompt = `Parse the group statement below into structured JSON.

THE ROSTER (the characters played this session):
${roster.length > 0 ? roster.join(', ') : 'Not provided'}

THE GROUP STATEMENT (the room's verdict, as the director entered it):
${state.accusation || 'Not provided'}

How to parse it:
1. Record who the group statement holds responsible and what it concluded.
   - It blames one or more characters: verdictKind "culprit", and those characters in accused.
   - It blames an institution, such as NeurAI's board, or a person it does not name: verdictKind "culprit", accused empty, and the room's own words for who and what in charge.
   - It names no culprit (an accident, an overdose, self-harm): verdictKind is that kind, accused empty, and the verdict in charge.
   Marcus Blackwood is the man whose death the room investigates, so accused never lists him.
2. When the text records a split final vote, list in votes every option that drew votes, with its count, and mark the one the group statement adopted; when it adopted none of them, mark none.

Return structured JSON matching the schema.${correctionsBlock}`;

    const parsed = await sdk({
      prompt: sessionConfigPrompt,
      systemPrompt: 'You parse game session information into structured JSON. Be precise and accurate.',
      model: 'haiku',
      jsonSchema: SESSION_CONFIG_SCHEMA,
      disableTools: true,          // H21: pure parse; no tool needs it
      loadProjectSettings: false
    });
    // Brief 3.5: the parse returns the group statement and nothing code sets. The
    // session id (B1: a model-derived id once sent 071126's inputs to data/0711/) and
    // the roster are stamped here, from the caller and the roster stop.
    const result = { accusation: parsed.accusation };
    result.sessionId = configSessionId || state.sessionId || null;
    result.roster = roster;
    result.rosterCount = roster.length;
    // Brief 2.2: a verdict with no culprit has no accused, whatever the model listed
    // (on 092026 it listed the victim). Enforced here, in code, for every reader.
    result.accusation = normalizeAccusation(result.accusation);
    // Brief 2.2: the director's accusation, word for word, stored WITH the parse:
    // in state through sessionConfig and on disk in inputs/session-config.json. A
    // code stamp, like reportingMode: the model never writes or rewrites it. The
    // writers read the director's words from here, beside the parsed accused and charge.
    result.accusationRaw = typeof state.accusation === 'string' && state.accusation.trim()
      ? state.accusation
      : null;
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

  // Step 2 Promise: Parse the session report (the evidence log, the sales, the
  // Adjustment rows and the Final Standings, each copied as written)
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

Section names vary between session-report generations. Recognize all of these patterns.

EXPOSED memories (each was turned in to Nova, and its summary went up on the Evidence Board):
- The "Detective Evidence Log" table (current format) or the "Detective Scans" table (older format)
- Memory ids appear in the leftmost "Token" column
- For each exposed memory, also return an exposures entry from the same row: tokenId; time = the row's time; exposer = the "Exposed By" column, the name on the turn-in; owner = the "Owner" column. Copy each value as written. Leave a field out when the table has no such column.

BURIED memories (each was sold to be erased, and the sale paid the account the seller named):
- "Scoring Timeline" rows whose Type is "Sale" (current format), or the "Black Market Scans" table (older format)
- For each Sale row: the Detail column holds "<tokenId>/<Character Name>", the Team column is the account paid, and the Amount column is the sale's amount
- A Sale row's Detail begins with a memory id, like "fli001/" or "sar002/"

ADJUSTMENTS (the rest of the money on the Scoring Timeline: the first-burial bonus, transfers between accounts, and the bookkeeping rows around them):
- Return every Scoring Timeline row whose Type is "Adjustment", copied as written: time, detail (the Detail column), team (the Team column) and amount, negative when the row shows a minus. Code reads what each row means, so return each one as it stands.

FINAL STANDINGS:
- The "Final Standings" or "Final Totals" section (current format), or "Shell Account Standings" (older format)
- Return every row: the account's name and its total, as written.

OTHER FIELDS:
- "Session ID" / "session UUID" → sessionId
- "Teams Registered" or the comma-separated team list under "Session Summary" → teamsRegistered

When the report has no such section, return an empty array for that field. Each list is read as the whole of its section, so copy every row exactly as it stands: a missing row drops a memory or a sale from the story, and an added one puts in one that never happened.

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

  // Brief 2.2: each exposed memory's exposer, exposure time and owner, from the
  // session report's Detective Evidence Log. Kept in orchestrator-parsed.json (the
  // step's own output, written below) and, so the input review shows them and a
  // replay rehydrates them, on sessionConfig. Phase 3 (brief 3.5): the morning
  // timeline prints each one's time and the name on its turn-in, for memories the
  // bundle holds as exposed; the owner column prints nowhere.
  orchestratorParsed.exposures = Array.isArray(orchestratorParsed.exposures) ? orchestratorParsed.exposures : [];
  sessionConfig.exposures = orchestratorParsed.exposures;
  // Brief 3.5 fix batch: how many memories the evidence log turned in, from the id
  // list disposition reads (fetch-nodes tagTokensWithDisposition reads exposedTokens,
  // never the per-row exposures). The input review says every memory will count as
  // buried only when this is 0.
  sessionConfig.exposedTokenCount = Array.isArray(orchestratorParsed.exposedTokens) ? orchestratorParsed.exposedTokens.length : 0;

  // Brief 3.5: the ledger, read by code. The Adjustment rows become the bonus and the
  // transfers (sessionConfig.adjustments, beside the exposures), each account's total
  // and sale count are computed (the model's counts are gone), and the totals are
  // checked against the Final Standings (sessionConfig.ledgerCheck, shown at the input
  // review). The computed accounts replace the model's on disk too, because
  // loadDirectorNotes refills state.shellAccounts from orchestrator-parsed.json.
  const ledger = buildLedger({
    buriedTokens: orchestratorParsed.buriedTokens,
    adjustmentRows: orchestratorParsed.adjustmentRows,
    finalStandings: orchestratorParsed.finalStandings
  });
  sessionConfig.adjustments = ledger.adjustments;
  sessionConfig.ledgerCheck = ledger.ledgerCheck;
  orchestratorParsed.shellAccounts = ledger.shellAccounts;
  if (!ledger.ledgerCheck.adjustmentsParsed) {
    console.warn('[parseRawInput] No Adjustment rows parsed: account totals are the Final Standings, with no bonus or transfer events');
  } else if (ledger.ledgerCheck.mismatches.length > 0) {
    console.warn(`[parseRawInput] Account totals disagree with the Final Standings: ${JSON.stringify(ledger.ledgerCheck.mismatches)}`);
  }

  // Brief 3.5: one session clock, decided once from the first exposure or sale (never
  // an adjustment: a setup row can fall before 5 PM in an evening session).
  sessionConfig.sessionClock = decideSessionClock([
    ...orchestratorParsed.exposures.map(e => e && e.time),
    ...(Array.isArray(orchestratorParsed.buriedTokens) ? orchestratorParsed.buriedTokens : []).map(t => t && t.time)
  ]);

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
      corrections: parseCorrections   // B2 + brief 2.2: every correction so far, in order
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
  // Sequential - depends on Step 1 roster for name matching
  // ─────────────────────────────────────────────────────

  let whiteboardData = {
    suspects: [],
    keyPhrases: [],
    evidenceConnections: [],
    factsEstablished: []
  };

  if (rawInput.whiteboardPhotoPath) {
    console.log('[parseRawInput] Step 4: Analyzing whiteboard photo');

    // Brief 3.5: names are matched against the roster, every character and the NPCs,
    // and kept as written when unsure: a room can suspect someone not at the table,
    // and matching against the roster alone rewrote that name into a player's.
    const imagePromptBuilder = getImagePromptBuilder(config);
    const { systemPrompt: whiteboardSystemPrompt, userPrompt: whiteboardUserPrompt } =
      await imagePromptBuilder.buildWhiteboardPrompt({
        roster: sessionConfig.roster || [],
        characters: Object.values(state.canonicalCharacters || {}).filter(name => typeof name === 'string' && name.trim()),
        npcs: npcNamesOf(theme),
        whiteboardPhotoPath: rawInput.whiteboardPhotoPath,
        corrections: parseCorrections   // Brief 2.2: the one parse call that never got them
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
      throw new Error(`Failed to analyze whiteboard: ${error.message}`, { cause: error });
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
    projectBuriedTokensToScoringTimeline,
    correctionsForParse,
    rosterFromRosterStop
  }
};
