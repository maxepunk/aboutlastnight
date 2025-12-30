#!/usr/bin/env node
/**
 * E2E Walkthrough Script (Parallel Branch Architecture)
 *
 * Interactive walkthrough of the complete report generation pipeline.
 * Uses REST endpoints for granular state access and control.
 *
 * Usage:
 *   node scripts/e2e-walkthrough.js                    # Interactive mode with raw input
 *   node scripts/e2e-walkthrough.js --session 1221    # Start fresh with incremental input
 *   node scripts/e2e-walkthrough.js --session 1221 --resume  # Continue existing session
 *   node scripts/e2e-walkthrough.js --input file.json # Load raw input from JSON file
 *   node scripts/e2e-walkthrough.js --auto            # Auto-approve all checkpoints
 *   node scripts/e2e-walkthrough.js --verbose         # Show full request/response
 *   node scripts/e2e-walkthrough.js --help            # Show help
 *
 * Checkpoints (10 total):
 *   1. INPUT_REVIEW - Review parsed raw input
 *   2. PAPER_EVIDENCE_SELECTION - Select unlocked paper evidence
 *   3. AWAIT_ROSTER - Provide roster for whiteboard OCR (incremental input)
 *   4. CHARACTER_IDS - Map characters to photos
 *   5. AWAIT_FULL_CONTEXT - Provide accusation/sessionReport/directorNotes
 *   6. PRE_CURATION - Review preprocessed evidence before curation
 *   7. EVIDENCE_AND_PHOTOS - Approve curated evidence bundle
 *   8. ARC_SELECTION - Select narrative arcs to develop
 *   9. OUTLINE - Approve article outline
 *  10. ARTICLE - Approve final article
 */

require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// Configuration
const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD;
const DEFAULT_THEME = 'journalist';

// Timeout configuration (in ms) - photo analysis can take 5+ minutes for 7 photos
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 20 * 60 * 1000; // 20 minutes default (matches server)
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Session cookie storage for authenticated requests
let sessionCookie = null;

// Revision tracking - store previous versions for diff display (Phase 6.5)
const revisionCache = {
  outline: null,      // Previous outline content
  article: null,      // Previous article content
  outlineFeedback: null,  // Feedback that triggered current revision
  articleFeedback: null   // Feedback that triggered current revision
};

// Incremental input data - loaded from files, provided at checkpoints
// Set during loadSessionInput(), accessed by await-roster and await-full-context handlers
let incrementalInputData = null;

// Parse CLI arguments
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const HELP_MODE = args.includes('--help') || args.includes('-h');
const RESUME_MODE = args.includes('--resume');  // Resume existing session (skip /start)
const STEP_MODE = args.includes('--step');  // Run one checkpoint, display, exit

// Get argument values
function getArgValue(flag) {
  const index = args.indexOf(flag);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : null;
}

const SESSION_ID = getArgValue('--session');
const INPUT_FILE = getArgValue('--input');
const OVERRIDE_FILE = getArgValue('--override');
const ROLLBACK_TO = getArgValue('--rollback');
const APPROVE_TYPE = getArgValue('--approve');  // Approve specific checkpoint type
const APPROVE_FILE = getArgValue('--approve-file');  // Custom approval payload JSON file
const PROFILE_NAME = getArgValue('--profile');  // Auto-approval profile name

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function color(text, colorName) {
  return `${colors[colorName]}${text}${colors.reset}`;
}

// SSE Progress Connection (Commit 8.16)
// Connects to SSE endpoint and displays progress while API call runs
let activeSSE = null;
let lastProgressLine = '';
const isTTY = process.stdout.isTTY;  // Safe line clearing only in interactive terminals

function connectSSE(sessionId, { onEvent, onComplete, onConnected, onError } = {}) {
  if (activeSSE) {
    activeSSE.destroy();
    activeSSE = null;
  }

  const url = new URL(`${API_BASE}/api/session/${sessionId}/progress`);
  const isHttps = url.protocol === 'https:';
  const httpModule = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      ...(sessionCookie ? { 'Cookie': sessionCookie } : {})
    }
  };

  const req = httpModule.request(options, (res) => {
    if (res.statusCode !== 200) {
      console.log(color(`  SSE connection failed: ${res.statusCode}`, 'yellow'));
      if (onError) onError(new Error(`SSE connection failed: ${res.statusCode}`));
      return;
    }

    console.log(color('  [SSE] Connection established', 'dim'));
    res.setEncoding('utf8');
    let buffer = '';
    let dataEventCount = 0;

    res.on('data', (chunk) => {
      dataEventCount++;
      // Reset timeout on ANY data (heartbeats, progress, any SSE event)
      if (onEvent) {
        if (dataEventCount <= 3 || dataEventCount % 10 === 0) {
          console.log(color(`  [SSE] Data received #${dataEventCount}, resetting timeout`, 'dim'));
        }
        onEvent();
      }

      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));

            // Handle SSE events by type
            switch (data.type) {
              case 'connected':
                if (onConnected) onConnected();
                break;

              case 'complete':
                console.log(color('\n  [SSE] Received completion event', 'green'));
                if (onComplete) onComplete(data.result);
                break;

              case 'llm_start':
                // Full LLM call visibility - display prompt
                console.log(color(`\n┌─── LLM: ${data.label || data.context} ───`, 'cyan'));
                console.log(color(`│ Model: ${data.model}`, 'dim'));
                if (data.prompt?.schema?.$id) {
                  console.log(color(`│ Schema: ${data.prompt.schema.$id}`, 'dim'));
                }
                console.log(color('│ ═══ SYSTEM PROMPT ═══', 'cyan'));
                console.log(color(data.prompt?.system || '(none)', 'dim'));
                console.log(color('│ ═══ USER PROMPT ═══', 'cyan'));
                console.log(color(data.prompt?.user || '(none)', 'dim'));
                break;

              case 'llm_complete':
                // Full LLM response visibility
                console.log(color(`└─── Done (${data.elapsed?.toFixed(1) || '?'}s, ${data.response?.length || 0} chars) ───`, 'green'));
                console.log(color('═══ RESPONSE ═══', 'green'));
                try {
                  console.log(color(JSON.stringify(data.response?.full, null, 2), 'dim'));
                } catch (e) {
                  console.log(color('[Unable to serialize response]', 'yellow'));
                }
                break;

              case 'progress':
                // Standard progress messages
                if (data.message && data.message !== lastProgressLine) {
                  lastProgressLine = data.message;
                  updateProgressLine(data.message);
                }
                break;

              default:
                // Unknown event types - log if verbose
                if (VERBOSE) {
                  console.log(color(`  [SSE] Unknown event: ${data.type}`, 'yellow'));
                }
            }
          } catch (e) {
            // Ignore parse errors (heartbeats, malformed data)
          }
        }
      }
    });

    res.on('end', () => {
      // Process any remaining buffer content before closing
      if (buffer.trim().startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.trim().slice(6));
          if (data.message) {
            updateProgressLine(data.message);
          }
        } catch (_) {
          // Ignore parse errors on final buffer
        }
      }
      activeSSE = null;
    });
  });

  req.on('error', (err) => {
    // SSE connection errors - notify caller if handler provided
    if (VERBOSE) {
      console.log(color(`\n  SSE error: ${err.message}`, 'yellow'));
    }
    if (onError) onError(err);
  });

  req.end();
  activeSSE = req;
  return req;
}

function disconnectSSE() {
  if (activeSSE) {
    activeSSE.destroy();
    activeSSE = null;
  }
  // Clear progress line if we printed one (TTY only)
  if (lastProgressLine && isTTY) {
    process.stdout.write('\r\x1b[K');
  }
  lastProgressLine = '';
}

// Readline interface for prompts
let rl;

function createReadline() {
  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

function prompt(question) {
  return new Promise(resolve => {
    rl.question(question, answer => resolve(answer.trim()));
  });
}

function promptMultiline(promptText) {
  return new Promise(resolve => {
    console.log(promptText);
    console.log(color('(Enter empty line to finish)', 'dim'));
    const lines = [];
    const collectLine = () => {
      rl.question('', line => {
        if (line === '') {
          resolve(lines.join('\n'));
        } else {
          lines.push(line);
          collectLine();
        }
      });
    };
    collectLine();
  });
}

// HTTP helper using native fetch (Node 18+) with timeout and optional SSE progress
// When sseSessionId is provided, connects to SSE for real-time progress during long operations
async function apiCall(endpoint, body, method = 'POST', sseSessionId = null) {
  const url = `${API_BASE}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json'
  };

  // Include session cookie if we have one
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  // Verbose logging - request
  if (VERBOSE) {
    console.log(color('\n─── REQUEST ───', 'dim'));
    console.log(color(`${method} ${url}`, 'cyan'));
    if (body) {
      console.log(color('Body:', 'dim'));
      console.log(JSON.stringify(body, null, 2));
    }
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  let timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  // For non-blocking endpoints (with SSE), we wait for completion via SSE
  // CRITICAL: Establish SSE connection BEFORE sending POST to avoid race condition
  // where fast-completing workflows emit 'complete' before we're subscribed
  let sseCompletionPromise = null;
  let sseConnectedPromise = null;
  let timeoutResetCount = 0;

  if (sseSessionId) {
    // Create two promises:
    // 1. sseConnectedPromise - resolves when SSE connection is ready (wait for this before POST)
    // 2. sseCompletionPromise - resolves when workflow completes (wait for this after POST)
    let resolveConnected, rejectConnected;
    sseConnectedPromise = new Promise((resolve, reject) => {
      resolveConnected = resolve;
      rejectConnected = reject;
    });

    sseCompletionPromise = new Promise((resolve, reject) => {
      connectSSE(sseSessionId, {
        onConnected: () => {
          resolveConnected();
        },
        onError: (err) => {
          rejectConnected(err);
          reject(err);
        },
        onEvent: () => {
          timeoutResetCount++;
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            console.log(color(`\n  [TIMEOUT] Firing after ${timeoutResetCount} resets`, 'red'));
            controller.abort();
          }, API_TIMEOUT_MS);
        },
        onComplete: (result) => {
          clearTimeout(timeoutId);
          resolve(result);
        }
      });
    });

    // Wait for SSE to be ready before sending POST
    try {
      await sseConnectedPromise;
    } catch (err) {
      clearTimeout(timeoutId);
      return { status: 503, error: `SSE connection failed: ${err.message}` };
    }
  }
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    // Store session cookie from login response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const cookies = setCookie.split(',').map(c => c.trim());
      const sessionCookieValue = cookies[0]?.split(';')[0];
      if (sessionCookieValue && sessionCookieValue.includes('=')) {
        sessionCookie = sessionCookieValue;
      }
    }

    const data = await response.json();

    // If server returns 'processing', wait for SSE completion
    if (data.status === 'processing' && sseCompletionPromise) {
      if (VERBOSE) {
        console.log(color('\n─── PROCESSING (non-blocking) ───', 'dim'));
        console.log(color('Waiting for SSE completion...', 'cyan'));
      }

      // Wait for SSE completion event
      const sseResult = await sseCompletionPromise;
      disconnectSSE();
      const durationMs = Date.now() - startTime;

      if (VERBOSE) {
        console.log(color('\n─── SSE COMPLETION ───', 'dim'));
        console.log(color(`Duration: ${durationMs}ms`, 'green'));
        console.log(color('Result:', 'dim'));
        console.log(JSON.stringify(sseResult, null, 2));
      }

      return { status: 200, data: sseResult, durationMs };
    }

    // Normal response (non-processing or no SSE)
    clearTimeout(timeoutId);
    disconnectSSE();
    const durationMs = Date.now() - startTime;

    // Verbose logging - response
    if (VERBOSE) {
      console.log(color('\n─── RESPONSE ───', 'dim'));
      console.log(color(`Status: ${response.status} (${durationMs}ms)`, response.status === 200 ? 'green' : 'red'));
      console.log(color('Body:', 'dim'));
      console.log(JSON.stringify(data, null, 2));
    }

    return { status: response.status, data, durationMs };
  } catch (error) {
    clearTimeout(timeoutId);
    disconnectSSE();  // Clean up SSE connection on error
    if (error.name === 'AbortError') {
      return { status: 408, error: `Request timeout after ${API_TIMEOUT_MS / 1000}s` };
    }
    return { status: 500, error: error.message };
  }
}

// GET helper for read-only endpoints
async function apiGet(endpoint) {
  return apiCall(endpoint, null, 'GET');
}

// Login to the API
async function login() {
  if (!ACCESS_PASSWORD) {
    console.log(color('WARNING: ACCESS_PASSWORD not set in .env', 'yellow'));
    const password = await prompt(color('Enter password: ', 'cyan'));
    const result = await apiCall('/api/auth/login', { password });
    return result.status === 200;
  }

  const result = await apiCall('/api/auth/login', { password: ACCESS_PASSWORD });
  if (result.status === 200) {
    console.log(color('  ✓ Authenticated', 'green'));
    return true;
  } else {
    console.log(color(`  ✗ Authentication failed: ${result.data?.message || 'Unknown error'}`, 'red'));
    return false;
  }
}

// Pretty print JSON with indentation
function prettyPrint(obj, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

// Display section header
function header(text) {
  console.log('\n' + color('═'.repeat(60), 'cyan'));
  console.log(color(`  ${text}`, 'bright'));
  console.log(color('═'.repeat(60), 'cyan') + '\n');
}

// Display checkpoint info
function checkpointHeader(approvalType, phase) {
  console.log('\n' + color('┌' + '─'.repeat(58) + '┐', 'yellow'));
  console.log(color('│', 'yellow') + color(` CHECKPOINT: ${approvalType}`.padEnd(58), 'bright') + color('│', 'yellow'));
  console.log(color('│', 'yellow') + color(` Phase: ${phase}`.padEnd(58), 'dim') + color('│', 'yellow'));
  console.log(color('└' + '─'.repeat(58) + '┘', 'yellow') + '\n');
}

// Show help
function showHelp() {
  console.log(`
${color('E2E Walkthrough Script', 'bright')} - Interactive pipeline testing

${color('USAGE:', 'cyan')}
  node scripts/e2e-walkthrough.js [options]

${color('OPTIONS:', 'cyan')}
  --session <id>     Start fresh with incremental input from data/{id}/inputs/
  --resume           Continue existing session instead of starting fresh
  --input <file>     Load rawSessionInput from JSON file
  --override <file>  Load stateOverrides from JSON file (e.g., playerFocus)
  --rollback <type>  Rollback to checkpoint before running
  --auto             Auto-approve all checkpoints (for CI/testing)
  --profile <name>   Auto-approval profile (default: smart-defaults)
                     Available: smart-defaults, testing-fast, testing-full, ci-pipeline
  --step             Run one checkpoint, display data, exit (non-interactive)
  --approve <type>   Approve the current checkpoint and advance to next
  --approve-file <f> Use custom JSON payload for approval (with --approve)
  --verbose, -v      Show full request/response JSON
  --help, -h         Show this help message

${color('ROLLBACK VALUES:', 'cyan')}
  input-review, paper-evidence-selection, await-roster, character-ids,
  pre-curation, evidence-bundle, arc-selection, outline, article

${color('EXAMPLES:', 'cyan')}
  # Interactive mode - gather input from prompts
  node scripts/e2e-walkthrough.js

  # Load from existing session
  node scripts/e2e-walkthrough.js --session 1221

  # Fresh start with input file
  node scripts/e2e-walkthrough.js --fresh --input session-1225.json

  # Rollback and retry with modified focus
  node scripts/e2e-walkthrough.js --session 1221 --rollback arc-selection --override focus.json

  # Auto-approve with default smart-defaults profile (CI mode)
  node scripts/e2e-walkthrough.js --session 1221 --auto --verbose

  # Auto-approve with testing-fast profile (select first few items)
  node scripts/e2e-walkthrough.js --session 1221 --auto --profile testing-fast

  # Auto-approve with testing-full profile (select all items)
  node scripts/e2e-walkthrough.js --session 1221 --auto --profile testing-full

  # Step-by-step collaborative mode (non-interactive):
  # 1. Start fresh, show first checkpoint:
  node scripts/e2e-walkthrough.js --session 1225 --fresh --step
  # 2. Review the output, then approve and continue:
  node scripts/e2e-walkthrough.js --session 1225 --approve input-review --step
  # 3. Approve with custom payload (e.g., character mappings):
  node scripts/e2e-walkthrough.js --session 1225 --approve character-ids --approve-file mappings.json --step

${color('CHECKPOINTS:', 'cyan')}
  At each checkpoint you can:
  - [A]pprove - Continue with current data
  - [J]SON    - View raw JSON response
  - [R]eject  - Reject with feedback for revision (outline/article only)
  - [H]TML    - View rendered HTML (article only)
  - [Q]uit    - Exit the walkthrough

  Outline and Article checkpoints show FULL content by default.

${color('NOTES:', 'cyan')}
  - Server must be running at ${API_BASE}
  - Uses REST endpoints: /api/session/:id/start, /api/session/:id/approve
  - Final HTML is saved to reports/outputs/
`);
}

// ============================================================================
// Input Gathering
// ============================================================================

async function gatherRawInput() {
  header('Session Start (Incremental Input)');
  console.log('Minimal input to start workflow. Additional data gathered at checkpoints.\n');

  const sessionId = await prompt(color('Session ID (e.g., 1221): ', 'cyan'));

  const defaultPhotosPath = path.join(__dirname, '..', 'data', sessionId, 'photos');
  console.log('\n' + color('Photos Path', 'bright') + ' - Directory containing session photos:');
  console.log(color(`(Press Enter to use default: ${defaultPhotosPath})`, 'dim'));
  const photosPathInput = await prompt(color('> ', 'cyan'));

  const photosPath = photosPathInput || defaultPhotosPath;

  console.log(color('\n─────────────────────────────────────', 'dim'));
  console.log(color('Starting workflow with:', 'green'));
  console.log(`  Session ID: ${sessionId}`);
  console.log(`  Photos Path: ${photosPath}`);
  console.log(color('\nRemaining input gathered at checkpoints:', 'dim'));
  console.log(color('  • Roster → await-roster checkpoint', 'dim'));
  console.log(color('  • Accusation, Session Report, Director Notes → await-full-context checkpoint', 'dim'));

  return {
    sessionId,
    rawSessionInput: {
      photosPath
    }
  };
}

async function loadSessionInput(sessionId) {
  const dataDir = path.join(__dirname, '..', 'data', sessionId, 'inputs');
  const photosDir = path.join(__dirname, '..', 'data', sessionId, 'photos');

  // RESUME MODE: Just return sessionId, use /generate to continue existing session
  if (RESUME_MODE) {
    console.log(color(`  → Resume mode: will continue existing session`, 'dim'));
    return { sessionId, fromFiles: true };
  }

  // NORMAL MODE: Incremental input flow via /start
  // 1. /start gets minimal input (photosPath only)
  // 2. Checkpoints gather remaining data (roster, accusation, etc.)

  // Try to pre-load files for checkpoint handlers (optional - not required)
  // DRY: Use loadJsonFile for silent fallback
  const sessionConfig = loadJsonFile(path.join(dataDir, 'session-config.json'));
  const directorNotes = loadJsonFile(path.join(dataDir, 'director-notes.json'));

  if (sessionConfig && directorNotes) {
    console.log(color(`  ✓ Pre-loaded session data for checkpoints`, 'green'));
    incrementalInputData = {
      roster: sessionConfig.roster,
      accusation: sessionConfig.accusation,
      sessionReport: directorNotes.sessionReport || sessionConfig.sessionReport,
      directorNotes: JSON.stringify(directorNotes, null, 2)
    };
  } else {
    // Files not required - checkpoints will gather data interactively
    console.log(color(`  → No pre-loaded data (will gather at checkpoints)`, 'dim'));
    incrementalInputData = null;
  }

  // Return minimal input for /start endpoint
  return {
    sessionId,
    fromFiles: false,
    rawSessionInput: {
      photosPath: photosDir
    }
  };
}

// Load raw input from JSON file (--input flag)
function loadInputFile(filePath) {
  console.log(color(`Loading input from ${filePath}...`, 'dim'));

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Validate required fields
    const required = ['roster', 'accusation', 'sessionReport', 'directorNotes'];
    const missing = required.filter(f => !data.rawSessionInput?.[f] && !data[f]);

    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }

    // Normalize structure
    const rawSessionInput = data.rawSessionInput || {
      roster: data.roster,
      accusation: data.accusation,
      sessionReport: data.sessionReport,
      directorNotes: data.directorNotes,
      photosPath: data.photosPath,
      whiteboardPhotoPath: data.whiteboardPhotoPath
    };

    console.log(color(`  ✓ Loaded raw session input`, 'green'));
    return {
      sessionId: data.sessionId,
      rawSessionInput
    };
  } catch (error) {
    console.error(color(`  ✗ Failed to load: ${error.message}`, 'red'));
    throw error;
  }
}

// Load state overrides from JSON file (--override flag)
function loadOverrideFile(filePath) {
  console.log(color(`Loading overrides from ${filePath}...`, 'dim'));

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    console.log(color(`  ✓ Loaded state overrides: ${Object.keys(data).join(', ')}`, 'green'));
    return data;
  } catch (error) {
    console.error(color(`  ✗ Failed to load: ${error.message}`, 'red'));
    throw error;
  }
}

// Load custom approval payload from JSON file (--approve-file flag)
function loadApprovalFile(filePath) {
  console.log(color(`Loading approval payload from ${filePath}...`, 'dim'));

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    console.log(color(`  ✓ Loaded approval: ${Object.keys(data).join(', ')}`, 'green'));
    return data;
  } catch (error) {
    console.error(color(`  ✗ Failed to load: ${error.message}`, 'red'));
    throw error;
  }
}

// ============================================================================
// Auto-Approval Profile System (Phase 6.6)
// ============================================================================

// Cache for loaded profile
let activeProfile = null;

/**
 * Load an auto-approval profile from config/auto-profiles/
 * @param {string} profileName - Profile name (without .json extension)
 * @returns {Object} Profile configuration or null if not found
 */
function loadAutoProfile(profileName) {
  const profilePath = path.join(__dirname, '..', 'config', 'auto-profiles', `${profileName}.json`);

  // DRY: Use loadJsonFile for silent fallback
  const profile = loadJsonFile(profilePath);

  if (!profile) {
    // Prevent infinite recursion - if smart-defaults is missing, return null
    if (profileName === 'smart-defaults') {
      console.error(color(`  ✗ Critical: smart-defaults profile not found at ${profilePath}`, 'red'));
      return null;
    }
    console.log(color(`  Profile '${profileName}' not found, using smart-defaults`, 'yellow'));
    return loadAutoProfile('smart-defaults');
  }

  // Validate profile structure
  if (!profile.name || !profile.checkpoints) {
    console.error(color(`  ✗ Invalid profile structure: missing required fields (name, checkpoints)`, 'red'));
    return null;
  }

  console.log(color(`  ✓ Loaded profile: ${profile.name} - ${profile.description || ''}`, 'green'));
  return profile;
}

/**
 * Apply auto-approval strategy based on profile configuration
 * @param {string} checkpointType - Current checkpoint type
 * @param {Object} checkpointData - Data from checkpoint (e.g., narrativeArcs, paperEvidence)
 * @param {Object} profile - Loaded profile configuration
 * @returns {Object} Approval payload for the API
 */
function applyAutoApproval(checkpointType, checkpointData, profile) {
  const config = profile?.checkpoints?.[checkpointType];

  if (!config) {
    // No profile config for this checkpoint - use default approval
    console.log(color(`  [${checkpointType}] No profile config, using default`, 'dim'));
    return getDefaultApprovalForProfile(checkpointType, checkpointData);
  }

  console.log(color(`  [${checkpointType}] Strategy: ${config.strategy}`, 'dim'));

  switch (config.strategy) {
    case 'approve':
      return getDefaultApprovalForProfile(checkpointType, checkpointData);

    case 'skip':
      // For character-ids, skip means empty mappings
      if (checkpointType === 'character-ids') {
        return { characterIds: {} };
      }
      return getDefaultApprovalForProfile(checkpointType, checkpointData);

    case 'select-all':
      return applySelectAll(checkpointType, checkpointData);

    case 'select-first':
      return applySelectFirst(checkpointType, checkpointData, config.count || 3);

    case 'smart-select':
      return applySmartSelect(checkpointType, checkpointData, config);

    default:
      console.log(color(`  Unknown strategy '${config.strategy}', using default`, 'yellow'));
      return getDefaultApprovalForProfile(checkpointType, checkpointData);
  }
}

/**
 * Get default approval payload (used when no profile or unknown strategy)
 */
function getDefaultApprovalForProfile(checkpointType, checkpointData) {
  switch (checkpointType) {
    case 'input-review':
      return { inputReview: true };
    case 'paper-evidence-selection':
      return { selectedPaperEvidence: checkpointData.paperEvidence || [] };
    case 'await-roster':
      // For auto-mode, use roster from sessionConfig if available
      const rosterFromConfig = checkpointData.sessionConfig?.roster || [];
      return { roster: rosterFromConfig };
    case 'character-ids':
      return { characterIds: {} };
    case 'await-full-context':
      // For auto-mode, this requires real input - cannot be auto-approved without data
      // Return empty payload to signal this checkpoint needs manual input
      console.log(color('  [await-full-context] Requires manual input: accusation, sessionReport, directorNotes', 'yellow'));
      return { fullContext: null };
    case 'pre-curation':
      return { preCuration: true };
    case 'evidence-and-photos':
      return { evidenceBundle: true };
    case 'arc-selection':
      const arcs = checkpointData.narrativeArcs || [];
      return { selectedArcs: arcs.slice(0, 3).map(a => a.id || a.title) };
    case 'outline':
      return { outline: true };
    case 'article':
      return { article: true };
    default:
      return {};
  }
}

/**
 * Select all available items
 */
function applySelectAll(checkpointType, checkpointData) {
  switch (checkpointType) {
    case 'paper-evidence-selection':
      return { selectedPaperEvidence: checkpointData.paperEvidence || [] };
    case 'arc-selection':
      const arcs = checkpointData.narrativeArcs || [];
      return { selectedArcs: arcs.map(a => a.id || a.title) };
    default:
      return getDefaultApprovalForProfile(checkpointType, checkpointData);
  }
}

/**
 * Select first N items
 */
function applySelectFirst(checkpointType, checkpointData, count) {
  switch (checkpointType) {
    case 'paper-evidence-selection':
      const evidence = checkpointData.paperEvidence || [];
      return { selectedPaperEvidence: evidence.slice(0, count) };
    case 'arc-selection':
      const arcs = checkpointData.narrativeArcs || [];
      return { selectedArcs: arcs.slice(0, count).map(a => a.id || a.title) };
    default:
      return getDefaultApprovalForProfile(checkpointType, checkpointData);
  }
}

/**
 * Smart selection based on preferences and scoring
 */
function applySmartSelect(checkpointType, checkpointData, config) {
  if (checkpointType !== 'arc-selection') {
    return getDefaultApprovalForProfile(checkpointType, checkpointData);
  }

  const arcs = checkpointData.narrativeArcs || [];
  const targetCount = config.targetCount || 3;
  const prefs = config.preferences || {};

  // Score each arc based on preferences
  const scored = arcs.map(arc => {
    let score = 0;

    // Evidence strength scoring (with type safety)
    if (prefs.evidenceStrength && arc.evidenceStrength && typeof arc.evidenceStrength === 'string') {
      const strengthScore = prefs.evidenceStrength[arc.evidenceStrength.toLowerCase()];
      if (strengthScore !== undefined) score += strengthScore;
    }

    // Arc source scoring (with type safety)
    if (prefs.arcSource && arc.arcSource && typeof arc.arcSource === 'string') {
      const sourceScore = prefs.arcSource[arc.arcSource.toLowerCase()];
      if (sourceScore !== undefined) score += sourceScore;
    }

    return { arc, score };
  });

  // Sort by score descending and take top N
  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, targetCount).map(s => s.arc.id || s.arc.title);

  console.log(color(`  Smart-selected ${selected.length} arcs based on scoring`, 'dim'));
  return { selectedArcs: selected };
}

// ============================================================================
// Display Helpers (DRY - reused across all checkpoint handlers)
// ============================================================================

// Centralized constants
const SECTION_WIDTH = 65;

// Display truncation limits (DRY - no magic numbers)
const DISPLAY_LIMITS = {
  MAX_PREVIEW_ITEMS: 5,        // Max items shown in preview lists
  MAX_ISSUES_SHOWN: 5,         // Max evaluation issues to display
  ISSUE_TEXT_LENGTH: 70,       // Truncation for issue text
  EVIDENCE_DESC_LENGTH: 80,    // Truncation for evidence descriptions
  VISUAL_CONTENT_LENGTH: 120,  // Truncation for visual content
  CHARACTER_DESC_LENGTH: 70,   // Truncation for character descriptions
  DEFAULT_TRUNCATE: 60         // Default truncation length
};

// ANSI escape codes (DRY - no raw escape sequences)
const ANSI = {
  CLEAR_LINE: '\r\x1b[K'
};

// Revision caps - mirrors lib/workflow/state.js REVISION_CAPS
// Scripts are standalone, so we define local constants matching the lib
const REVISION_CAPS = {
  OUTLINE: 3,
  ARTICLE: 3
};

// Content types for revision caching - matches CHECKPOINT_TYPES.OUTLINE/ARTICLE
const CONTENT_TYPES = {
  OUTLINE: 'outline',
  ARTICLE: 'article'
};

// ============================================================================
// Common Interaction Helpers (DRY - extracted from checkpoint handlers)
// ============================================================================

/**
 * Handle user quit choice (DRY - used by all checkpoint handlers)
 * @param {string} choice - User's choice input
 * @throws {Error} If user chose to quit
 */
function handleUserQuit(choice) {
  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }
}

/**
 * Handle AUTO_MODE approval (DRY - used by all checkpoint handlers)
 * Returns approval payload if AUTO_MODE, null otherwise
 * @param {string} checkpointType - Checkpoint type name
 * @param {Object} checkpointData - Data to pass to applyAutoApproval
 * @param {string} [message] - Optional custom message (default: "Approving {type}...")
 * @returns {Object|null} Approval payload if AUTO_MODE, null otherwise
 */
function handleAutoApproval(checkpointType, checkpointData, message = null) {
  if (!AUTO_MODE) return null;

  const approval = applyAutoApproval(checkpointType, checkpointData, activeProfile);
  const defaultMsg = `[AUTO] Approving ${checkpointType}...`;
  console.log(color(`\n${message || defaultMsg}`, 'yellow'));
  return approval;
}

/**
 * Update progress line in TTY (DRY - used by SSE handlers)
 * @param {string} message - Progress message to display
 */
function updateProgressLine(message) {
  if (isTTY) {
    process.stdout.write(`${ANSI.CLEAR_LINE}  ${color('Progress:', 'dim')} ${message}`);
  } else {
    console.log(`  Progress: ${message}`);
  }
}

/**
 * Safely truncate text with ellipsis
 * @param {*} text - Text to truncate (handles null/undefined)
 * @param {number} maxLength - Maximum length
 * @param {string} suffix - Suffix for truncated text
 * @returns {string} Truncated text
 */
function truncate(text, maxLength = 60, suffix = '...') {
  if (text === undefined || text === null) return '';
  const str = String(text);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
}

// ============================================================================
// DRY UTILITIES (Refactor 8.x - reduce duplication)
// ============================================================================

/**
 * Load and parse a JSON file with fallback (DRY - replaces 4 try-catch blocks)
 * @param {string} filePath - Path to JSON file
 * @param {*} defaultValue - Value to return on error
 * @returns {*} Parsed JSON or defaultValue
 */
function loadJsonFile(filePath, defaultValue = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Prompt for confirmation with consistent pattern (DRY - replaces 4 confirmation blocks)
 * @param {string} message - Confirmation message
 * @param {Object} options - Options
 * @returns {Promise<boolean>} True if confirmed
 */
async function confirmAction(message, options = {}) {
  const { defaultYes = true, throwOnReject = false, rejectMessage = 'User cancelled' } = options;
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const response = await prompt(`${message} ${hint} `);

  const isYes = defaultYes
    ? response.toLowerCase() !== 'n'
    : response.toLowerCase() === 'y';

  if (!isYes && throwOnReject) {
    throw new Error(rejectMessage);
  }
  return isYes;
}

/**
 * Wrap handler execution with retry/skip/quit recovery (DRY - centralizes error handling)
 * @param {Function} fn - Async handler function to execute
 * @param {Object} options - Recovery options
 * @returns {Promise<Object>} Handler result or default approval
 */
async function withRetry(fn, options = {}) {
  const { checkpointType = 'unknown', checkpoint = {}, maxRetries = 3 } = options;

  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (err) {
      if (err.message === 'User quit') throw err;

      attempts++;
      console.log(color(`\nError: ${err.message}`, 'red'));

      if (attempts >= maxRetries) {
        console.log(color('Max retries reached.', 'red'));
        throw err;
      }

      const choice = await prompt('[R]etry, [S]kip with defaults, or [Q]uit? ');
      handleUserQuit(choice);

      if (choice.toLowerCase() === 's') {
        console.log(color('Using default approval...', 'yellow'));
        return getDefaultApprovalForProfile(checkpointType, checkpoint);
      }
      // 'r' or anything else = retry
      console.log(color('Retrying...', 'cyan'));
    }
  }
}

/**
 * Draw a section box with title
 * @param {string} title - Section title
 * @param {string} borderColor - Color for border
 */
function sectionBox(title, borderColor = 'yellow') {
  const padded = ` ${title} `.padEnd(SECTION_WIDTH - 2, '─');
  console.log(color(`┌─${padded}┐`, borderColor));
}

function sectionEnd(borderColor = 'yellow') {
  console.log(color('└' + '─'.repeat(SECTION_WIDTH) + '┘', borderColor));
}

function sectionDivider(title, borderColor = 'yellow') {
  const padded = ` ${title} `.padEnd(SECTION_WIDTH - 2, '─');
  console.log(color(`├─${padded}┤`, borderColor));
}

/**
 * Display evaluation status (DRY - shared by outline and article handlers)
 * @param {Object} evaluation - Evaluation history entry
 * @param {boolean} isEscalated - Whether this is an escalated checkpoint
 */
function displayEvaluationStatus(evaluation, isEscalated = false) {
  if (!evaluation || Object.keys(evaluation).length === 0) return;

  const scoreColor = evaluation.overallScore >= 80 ? 'green' :
                     evaluation.overallScore >= 60 ? 'yellow' : 'red';
  const readyText = evaluation.ready ? color('[READY]', 'green') : color('[NEEDS WORK]', 'yellow');

  sectionBox(`EVALUATION: Score ${evaluation.overallScore || 'N/A'}% ${readyText}`, scoreColor);

  if (evaluation.revisionNumber > 0) {
    console.log(color(`  Revision #${evaluation.revisionNumber} of max 3`, 'dim'));
  }

  if (isEscalated) {
    console.log(color('  ESCALATED: At revision cap - human decision required', 'yellow'));
  }

  // Show issues if any
  if (evaluation.issues?.length > 0) {
    console.log(color('\n  Issues:', 'bright'));
    evaluation.issues.slice(0, DISPLAY_LIMITS.MAX_ISSUES_SHOWN).forEach(issue => {
      const severity = issue.severity || 'info';
      const severityColor = severity === 'error' ? 'red' : severity === 'warning' ? 'yellow' : 'dim';
      const issueText = typeof issue === 'string' ? issue : (issue.message || issue.description || JSON.stringify(issue));
      console.log(`    ${color('•', severityColor)} ${truncate(issueText, DISPLAY_LIMITS.ISSUE_TEXT_LENGTH)}`);
    });
    if (evaluation.issues.length > DISPLAY_LIMITS.MAX_ISSUES_SHOWN) {
      console.log(color(`    ... and ${evaluation.issues.length - DISPLAY_LIMITS.MAX_ISSUES_SHOWN} more issues`, 'dim'));
    }
  }
  sectionEnd(scoreColor);
}

/**
 * Display a labeled field value
 * @param {string} label - Field label
 * @param {*} value - Field value (auto-formatted)
 * @param {Object} options - Display options
 */
function displayField(label, value, options = {}) {
  const { indent = 2, labelColor = 'bright', valueColor = 'white', maxLength = 80 } = options;
  const prefix = ' '.repeat(indent);

  if (value === undefined || value === null) {
    console.log(`${prefix}${color(label + ':', labelColor)} ${color('(not set)', 'dim')}`);
    return;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      console.log(`${prefix}${color(label + ':', labelColor)} ${color('(empty)', 'dim')}`);
    } else {
      console.log(`${prefix}${color(label + ':', labelColor)} ${value.join(', ')}`);
    }
  } else if (typeof value === 'object') {
    console.log(`${prefix}${color(label + ':', labelColor)}`);
    Object.entries(value).forEach(([k, v]) => {
      // Preserve color and maxLength options for nested objects
      displayField(k, v, { indent: indent + 2, labelColor, valueColor, maxLength });
    });
  } else {
    let displayValue = String(value);
    if (displayValue.length > maxLength) {
      displayValue = displayValue.substring(0, maxLength - 3) + '...';
    }
    console.log(`${prefix}${color(label + ':', labelColor)} ${displayValue}`);
  }
}

/**
 * Display a list with bullet points
 * @param {string[]} items - List items
 * @param {Object} options - Display options
 */
function displayList(items, options = {}) {
  const { indent = 4, bullet = '•', maxItems = 10, emptyMessage = '(none)' } = options;
  const prefix = ' '.repeat(indent);

  if (!items || items.length === 0) {
    console.log(`${prefix}${color(emptyMessage, 'dim')}`);
    return;
  }

  const displayItems = items.slice(0, maxItems);
  displayItems.forEach(item => {
    const text = typeof item === 'string' ? item : JSON.stringify(item);
    console.log(`${prefix}${bullet} ${text}`);
  });

  if (items.length > maxItems) {
    console.log(color(`${prefix}  ... and ${items.length - maxItems} more`, 'dim'));
  }
}

/**
 * Display a confidence/strength indicator
 * @param {string} level - Confidence level (high/medium/low or strong/moderate/weak)
 */
function displayConfidence(level) {
  if (!level) return color('(unknown)', 'dim');
  const normalized = level.toLowerCase();
  if (normalized === 'high' || normalized === 'strong') {
    return color(`[${level.toUpperCase()}]`, 'green');
  } else if (normalized === 'medium' || normalized === 'moderate') {
    return color(`[${level.toUpperCase()}]`, 'yellow');
  } else {
    return color(`[${level.toUpperCase()}]`, 'red');
  }
}

// ============================================================================
// Edit Workflow Helpers (Field-by-field editing)
// ============================================================================

/**
 * Edit a string field
 * @param {string} currentValue - Current field value
 * @param {string} fieldName - Name for display
 * @returns {Promise<string|null>} New value or null if cancelled
 */
async function editStringField(currentValue, fieldName) {
  console.log(color(`\n─── EDITING: ${fieldName.toUpperCase()} ───`, 'cyan'));
  console.log(`Current: ${truncate(currentValue || '(empty)', 100)}`);
  const newValue = await prompt('\nEnter new value (or press Enter to keep current): ');
  if (newValue.trim() === '') return null;
  return newValue.trim();
}

/**
 * Edit an array field (add/remove/replace)
 * @param {string[]} currentValues - Current array values
 * @param {string} fieldName - Name for display
 * @returns {Promise<string[]|null>} New array or null if cancelled
 */
async function editArrayField(currentValues, fieldName) {
  const values = Array.isArray(currentValues) ? currentValues : [];

  console.log(color(`\n─── EDITING: ${fieldName.toUpperCase()} ───`, 'cyan'));
  console.log('Current:');
  if (values.length === 0) {
    console.log(color('  (empty)', 'dim'));
  } else {
    values.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
  }

  console.log('\nHow would you like to edit?');
  console.log('  [A]dd items    - Add to existing list');
  console.log('  [R]emove items - Remove from list');
  console.log('  [P]replace all - Replace entire list');
  console.log('  [C]ancel       - Keep current');

  const choice = await prompt('\nChoice: ');
  const c = choice.toLowerCase();

  if (c === 'c' || c === '') return null;

  if (c === 'a') {
    const additions = await prompt('Enter items to add (comma-separated): ');
    if (additions.trim() === '') return null;
    const newItems = additions.split(',').map(s => s.trim()).filter(s => s);
    return [...values, ...newItems];
  }

  if (c === 'r') {
    if (values.length === 0) {
      console.log(color('Nothing to remove', 'yellow'));
      return null;
    }
    const indices = await prompt('Enter numbers to remove (comma-separated): ');
    const toRemove = new Set(
      indices.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n) && n >= 0 && n < values.length)
    );
    if (toRemove.size === 0) return null;
    return values.filter((_, i) => !toRemove.has(i));
  }

  if (c === 'p') {
    const replacement = await prompt('Enter new items (comma-separated): ');
    if (replacement.trim() === '') return null;
    return replacement.split(',').map(s => s.trim()).filter(s => s);
  }

  return null;
}

/**
 * Edit a selection field (toggle items on/off)
 * @param {Object[]} allItems - All available items
 * @param {string[]} selectedIds - Currently selected item IDs
 * @param {string} idField - Field name to use as ID
 * @param {string} displayField - Field name to display
 * @returns {Promise<string[]|null>} New selection or null if cancelled
 */
async function editSelectionField(allItems, selectedIds, idField = 'id', displayField = 'title') {
  const selected = new Set(selectedIds || []);

  console.log(color('\n─── TOGGLE SELECTION ───', 'cyan'));
  console.log(`Current selection: ${selected.size} items\n`);

  allItems.forEach((item, i) => {
    const id = item[idField] || item.id || item.title || `item-${i}`;
    const display = item[displayField] || item.title || item.name || id;
    const check = selected.has(id) ? color('[✓]', 'green') : '[ ]';
    console.log(`  ${check} ${i + 1}. ${display}`);
  });

  const input = await prompt('\nToggle items (comma-separated numbers), or [D]one: ');

  if (input.toLowerCase() === 'd' || input.trim() === '') {
    return null;
  }

  const toToggle = input.split(',')
    .map(s => parseInt(s.trim(), 10) - 1)
    .filter(n => !isNaN(n) && n >= 0 && n < allItems.length);

  if (toToggle.length === 0) return null;

  // Toggle the selected items
  for (const idx of toToggle) {
    const item = allItems[idx];
    const id = item[idField] || item.id || item.title || `item-${idx}`;
    if (selected.has(id)) {
      selected.delete(id);
    } else {
      selected.add(id);
    }
  }

  return Array.from(selected);
}

/**
 * Show an edit menu and handle selection
 * @param {Object} fields - Field definitions { name: { value, type, editable } }
 * @param {Function} onEdit - Callback when field is edited: (fieldName, newValue) => void
 * @returns {Promise<Object>} Modified values
 */
async function showEditMenu(fields, onEdit) {
  const fieldNames = Object.keys(fields);
  const edits = {};

  while (true) {
    console.log(color('\nWhich field would you like to edit?', 'bright'));
    fieldNames.forEach((name, i) => {
      const field = fields[name];
      const modified = edits[name] !== undefined ? color(' (modified)', 'green') : '';
      console.log(`  ${i + 1}. ${field.label || name}${modified}`);
    });
    console.log('  0. Done editing');

    const choice = await prompt('\nSelect field (or 0 when done): ');
    const idx = parseInt(choice.trim(), 10);

    if (idx === 0 || isNaN(idx)) break;
    if (idx < 1 || idx > fieldNames.length) {
      console.log(color('Invalid selection', 'red'));
      continue;
    }

    const fieldName = fieldNames[idx - 1];
    const field = fields[fieldName];
    const currentValue = edits[fieldName] !== undefined ? edits[fieldName] : field.value;

    let newValue = null;
    switch (field.type) {
      case 'string':
        newValue = await editStringField(currentValue, field.label || fieldName);
        break;
      case 'array':
        newValue = await editArrayField(currentValue, field.label || fieldName);
        break;
      default:
        console.log(color(`Editing ${field.type} fields not yet supported`, 'yellow'));
        break;
    }

    if (newValue !== null) {
      edits[fieldName] = newValue;
      if (onEdit) onEdit(fieldName, newValue);
      console.log(color(`\n✓ ${field.label || fieldName} updated`, 'green'));
    }
  }

  return edits;
}

/**
 * Show confirmation preview of changes
 * @param {Object} original - Original values
 * @param {Object} edits - Modified values
 * @param {Object} fieldDefs - Field definitions for labels
 */
function showConfirmationPreview(original, edits, fieldDefs = {}) {
  const editedKeys = Object.keys(edits);
  if (editedKeys.length === 0) {
    console.log(color('\n  No changes made', 'dim'));
    return;
  }

  sectionBox('CONFIRMATION PREVIEW');
  console.log(color('  CHANGES MADE:', 'bright'));

  editedKeys.forEach(key => {
    const label = fieldDefs[key]?.label || key;
    const oldVal = original[key];
    const newVal = edits[key];

    if (Array.isArray(newVal)) {
      const added = newVal.filter(v => !oldVal?.includes(v)).length;
      const removed = (oldVal || []).filter(v => !newVal.includes(v)).length;
      let changeDesc = [];
      if (added > 0) changeDesc.push(`+${added}`);
      if (removed > 0) changeDesc.push(`-${removed}`);
      console.log(`    ${color('✓', 'green')} ${label}: ${changeDesc.join(', ') || 'reordered'}`);
    } else {
      console.log(`    ${color('✓', 'green')} ${label}: "${truncate(newVal, 40)}"`);
    }
  });

  Object.keys(fieldDefs).forEach(key => {
    if (!editedKeys.includes(key)) {
      const label = fieldDefs[key]?.label || key;
      console.log(`    ${color('-', 'dim')} ${label}: (unchanged)`);
    }
  });

  sectionEnd();
}

// ============================================================================
// Revision Diff Helpers (Phase 6.5)
// ============================================================================

/**
 * Compute a shallow diff between two objects
 * @param {Object} previous - Previous version
 * @param {Object} current - Current version
 * @returns {Object} Diff with added, modified, removed, unchanged arrays
 */
function computeObjectDiff(previous, current) {
  const diff = {
    added: [],    // Keys in current but not in previous
    modified: [], // Keys in both but with different values
    removed: [],  // Keys in previous but not in current
    unchanged: [] // Keys in both with same values
  };

  if (!previous || Object.keys(previous).length === 0) {
    // No previous version - everything is "added"
    if (current) {
      diff.added = Object.keys(current);
    }
    return diff;
  }

  const prevKeys = new Set(Object.keys(previous));
  const currKeys = new Set(Object.keys(current || {}));

  // Find added keys
  for (const key of currKeys) {
    if (!prevKeys.has(key)) {
      diff.added.push(key);
    }
  }

  // Find removed keys
  for (const key of prevKeys) {
    if (!currKeys.has(key)) {
      diff.removed.push(key);
    }
  }

  // Find modified and unchanged (with error handling for circular refs)
  for (const key of prevKeys) {
    if (currKeys.has(key)) {
      try {
        const prevVal = JSON.stringify(previous[key]);
        const currVal = JSON.stringify(current[key]);
        if (prevVal !== currVal) {
          diff.modified.push(key);
        } else {
          diff.unchanged.push(key);
        }
      } catch (error) {
        // Handle circular reference or other stringify errors
        diff.modified.push(key);  // Assume modified if can't compare
      }
    }
  }

  return diff;
}

/**
 * Describe a change for a specific field
 * @param {string} key - Field name
 * @param {*} prevValue - Previous value
 * @param {*} currValue - Current value
 * @returns {string} Human-readable change description
 */
function describeChange(key, prevValue, currValue) {
  // Handle arrays
  if (Array.isArray(currValue)) {
    const prevLen = Array.isArray(prevValue) ? prevValue.length : 0;
    const currLen = currValue.length;
    const diff = currLen - prevLen;
    if (diff > 0) return `Added ${diff} item(s) (${prevLen} → ${currLen})`;
    if (diff < 0) return `Removed ${Math.abs(diff)} item(s) (${prevLen} → ${currLen})`;
    return 'Items reordered or modified';
  }

  // Handle objects
  if (typeof currValue === 'object' && currValue !== null) {
    const prevKeys = prevValue ? Object.keys(prevValue).length : 0;
    const currKeys = Object.keys(currValue).length;
    if (currKeys !== prevKeys) {
      return `Structure changed (${prevKeys} → ${currKeys} keys)`;
    }
    return 'Content modified';
  }

  // Handle strings - show short before/after
  if (typeof currValue === 'string' && typeof prevValue === 'string') {
    const prevShort = truncate(prevValue, 25);
    const currShort = truncate(currValue, 25);
    return `"${prevShort}" → "${currShort}"`;
  }

  // Default
  return `${truncate(String(prevValue), 20)} → ${truncate(String(currValue), 20)}`;
}

/**
 * Display revision diff between previous and current versions
 * @param {Object} previous - Previous version
 * @param {Object} current - Current version
 * @param {Object} evaluation - Current evaluation with revisionNumber, feedback
 * @param {string} contentType - CONTENT_TYPES.OUTLINE or CONTENT_TYPES.ARTICLE
 * @param {number} maxRevisions - Maximum revisions allowed (from REVISION_CAPS)
 */
function displayRevisionDiff(previous, current, evaluation, contentType, maxRevisions) {
  const revNum = evaluation?.revisionNumber || 0;

  // Only show diff if this is a revision (revNum > 0) and we have previous content
  if (revNum === 0 || !previous) {
    return;
  }

  const budgetColor = revNum >= maxRevisions ? 'red' : revNum >= maxRevisions - 1 ? 'yellow' : 'green';
  const budgetText = revNum >= maxRevisions
    ? 'NO REVISIONS REMAINING - Final version'
    : `${maxRevisions - revNum} revision(s) remaining`;

  sectionBox(`REVISION #${revNum} (of max ${maxRevisions})`, budgetColor);

  // Show previous feedback that triggered this revision
  const previousFeedback = contentType === CONTENT_TYPES.OUTLINE
    ? revisionCache.outlineFeedback
    : revisionCache.articleFeedback;

  if (previousFeedback) {
    console.log(color('  PREVIOUS FEEDBACK:', 'bright'));
    const feedbackLines = previousFeedback.split('\n').slice(0, 3);
    feedbackLines.forEach(line => {
      console.log(`    "${truncate(line, 60)}"`);
    });
    if (previousFeedback.split('\n').length > 3) {
      console.log(color('    ...', 'dim'));
    }
    console.log('');
  }

  // Compute diff
  const diff = computeObjectDiff(previous, current);

  // Display changes
  console.log(color('  CHANGES FROM PREVIOUS VERSION:', 'bright'));

  // ADDED
  if (diff.added.length > 0) {
    console.log(color('\n  ADDED:', 'green'));
    diff.added.forEach(key => {
      const val = current[key];
      let desc;
      if (Array.isArray(val)) {
        desc = `New array with ${val.length} item(s)`;
      } else if (typeof val === 'object' && val !== null) {
        desc = `New section with ${Object.keys(val).length} field(s)`;
      } else {
        desc = truncate(String(val), 50);
      }
      console.log(`    ${color('+', 'green')} ${key}: ${desc}`);
    });
  }

  // MODIFIED
  if (diff.modified.length > 0) {
    console.log(color('\n  MODIFIED:', 'yellow'));
    diff.modified.forEach(key => {
      const desc = describeChange(key, previous[key], current[key]);
      console.log(`    ${color('~', 'yellow')} ${key}: ${desc}`);
    });
  }

  // REMOVED
  if (diff.removed.length > 0) {
    console.log(color('\n  REMOVED:', 'red'));
    diff.removed.forEach(key => {
      console.log(`    ${color('-', 'red')} ${key}: Removed`);
    });
  }

  // UNCHANGED (summary only)
  if (diff.unchanged.length > 0) {
    console.log(color('\n  UNCHANGED:', 'dim'));
    console.log(color(`    = ${diff.unchanged.join(', ')}`, 'dim'));
  }

  // Revision budget warning
  console.log('');
  console.log(`  ${color('REVISION BUDGET:', 'bright')} ${color(budgetText, budgetColor)}`);

  sectionEnd(budgetColor);
  console.log('');
}

/**
 * Store current content for future diff comparison
 * Called after displaying but before user decision
 * @param {string} contentType - CONTENT_TYPES.OUTLINE or CONTENT_TYPES.ARTICLE
 * @param {Object} content - Current content to store
 * @param {string} feedback - Feedback provided (if rejecting)
 */
function cacheForRevision(contentType, content, feedback = null) {
  if (contentType === CONTENT_TYPES.OUTLINE) {
    revisionCache.outline = content ? JSON.parse(JSON.stringify(content)) : null;
    if (feedback) {
      revisionCache.outlineFeedback = feedback;
    }
  } else if (contentType === CONTENT_TYPES.ARTICLE) {
    revisionCache.article = content ? JSON.parse(JSON.stringify(content)) : null;
    if (feedback) {
      revisionCache.articleFeedback = feedback;
    }
  }
}

// ============================================================================
// Checkpoint Handlers
// ============================================================================

async function handleInputReview(checkpoint, currentPhase) {
  checkpointHeader('INPUT_REVIEW', currentPhase);

  const sessionConfig = checkpoint.sessionConfig || {};
  const playerFocus = checkpoint.playerFocus || {};
  const directorNotes = checkpoint.directorNotes || {};
  const parsedInput = checkpoint.parsedInput || {};

  // Header with session info
  sectionBox('INPUT REVIEW');
  displayField('Session ID', sessionConfig.sessionId || parsedInput.sessionId, { indent: 2 });
  displayField('Journalist', sessionConfig.journalistName, { indent: 2 });
  if (parsedInput.parsedAt) {
    console.log(color(`  Parsed: ${new Date(parsedInput.parsedAt).toLocaleString()} (${parsedInput.processingTimeMs || 0}ms)`, 'dim'));
  }

  // Roster section
  sectionDivider(`ROSTER (${sessionConfig.roster?.length || 0})`);
  if (sessionConfig.roster?.length > 0) {
    console.log(`  ${sessionConfig.roster.join(', ')}`);
  } else {
    console.log(color('  (no roster defined)', 'dim'));
  }

  // Accusation section
  sectionDivider('ACCUSATION');
  const accusation = sessionConfig.accusation || {};
  displayField('Accused', accusation.accused, { indent: 2 });
  displayField('Reasoning', accusation.reasoning, { indent: 2, maxLength: 120 });
  console.log(`  ${color('Confidence:', 'bright')} ${displayConfidence(accusation.confidence)}`);

  // Player Focus section
  sectionDivider('PLAYER FOCUS');
  displayField('Primary Investigation', playerFocus.primaryInvestigation, { indent: 2, maxLength: 120 });
  displayField('Primary Suspects', playerFocus.primarySuspects, { indent: 2 });
  displayField('Player Theory', playerFocus.playerTheory, { indent: 2, maxLength: 120 });
  console.log(`  ${color('Confidence:', 'bright')} ${displayConfidence(playerFocus.confidenceLevel)}`);

  if (playerFocus.secondaryThreads?.length > 0) {
    console.log(color('  Secondary Threads:', 'bright'));
    displayList(playerFocus.secondaryThreads, { indent: 4 });
  }

  // Director Observations section
  sectionDivider('DIRECTOR OBSERVATIONS');
  if (directorNotes.observations?.length > 0) {
    displayList(directorNotes.observations, { indent: 2 });
  } else {
    console.log(color('  (no observations recorded)', 'dim'));
  }

  // Whiteboard section
  const whiteboard = directorNotes.whiteboard || {};
  if (whiteboard.connectionsMade || whiteboard.questionsRaised || whiteboard.votingResults) {
    sectionDivider('WHITEBOARD CAPTURED');
    if (whiteboard.connectionsMade?.length > 0) {
      console.log(color('  Connections Made:', 'bright'));
      displayList(whiteboard.connectionsMade, { indent: 4 });
    }
    if (whiteboard.questionsRaised?.length > 0) {
      console.log(color('  Questions Raised:', 'bright'));
      displayList(whiteboard.questionsRaised, { indent: 4 });
    }
    if (whiteboard.votingResults) {
      console.log(color('  Voting Results:', 'bright'));
      if (typeof whiteboard.votingResults === 'object') {
        Object.entries(whiteboard.votingResults).forEach(([name, votes]) => {
          console.log(`    ${name}: ${votes} vote(s)`);
        });
      } else {
        console.log(`    ${whiteboard.votingResults}`);
      }
    }
  }

  sectionEnd();

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('input-review', checkpoint, '[AUTO] Approving input...');
  if (autoApproval) return autoApproval;

  const choice = await prompt('\n[A]pprove, [E]dit, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 'e') {
    // Field-by-field edit mode
    const fieldDefs = {
      roster: { label: 'Roster', type: 'array', value: sessionConfig.roster || [] },
      primaryInvestigation: { label: 'Primary Investigation', type: 'string', value: playerFocus.primaryInvestigation },
      primarySuspects: { label: 'Primary Suspects', type: 'array', value: playerFocus.primarySuspects || [] },
      secondaryThreads: { label: 'Secondary Threads', type: 'array', value: playerFocus.secondaryThreads || [] }
    };

    const edits = await showEditMenu(fieldDefs);

    if (Object.keys(edits).length > 0) {
      // Build inputEdits in the expected format
      const inputEdits = {};
      if (edits.roster) inputEdits['sessionConfig.roster'] = edits.roster;
      if (edits.primaryInvestigation) inputEdits['playerFocus.primaryInvestigation'] = edits.primaryInvestigation;
      if (edits.primarySuspects) inputEdits['playerFocus.primarySuspects'] = edits.primarySuspects;
      if (edits.secondaryThreads) inputEdits['playerFocus.secondaryThreads'] = edits.secondaryThreads;

      showConfirmationPreview(
        { roster: sessionConfig.roster, primaryInvestigation: playerFocus.primaryInvestigation,
          primarySuspects: playerFocus.primarySuspects, secondaryThreads: playerFocus.secondaryThreads },
        edits,
        fieldDefs
      );

      const confirm = await prompt('\n[C]onfirm changes, [E]dit more, or [R]eset? ');
      if (confirm.toLowerCase() === 'c') {
        return { inputReview: true, inputEdits };
      } else if (confirm.toLowerCase() === 'r') {
        console.log(color('Changes reset - approving original', 'yellow'));
      }
      // else fall through to approve original
    }
  }

  return { inputReview: true };
}

async function handlePaperEvidenceSelection(checkpoint, currentPhase) {
  checkpointHeader('PAPER_EVIDENCE_SELECTION', currentPhase);

  const evidence = checkpoint.paperEvidence || [];

  sectionBox(`PAPER EVIDENCE (${evidence.length} items)`);

  if (evidence.length === 0) {
    console.log(color('  No paper evidence available', 'dim'));
    sectionEnd();
    return { selectedPaperEvidence: [] };
  }

  evidence.forEach((item, i) => {
    const num = String(i + 1).padStart(2, ' ');
    // Notion uses 'name' field; support both 'name' and 'title' for compatibility
    console.log(`  ${color(num + '.', 'cyan')} ${color(item.name || item.title || 'Untitled', 'bright')}`);

    // Type and category on same line
    const typeInfo = [];
    if (item.type) typeInfo.push(`Type: ${item.type}`);
    if (item.category) typeInfo.push(`Category: ${item.category}`);
    if (typeInfo.length > 0) {
      console.log(color(`      ${typeInfo.join(' │ ')}`, 'dim'));
    }

    // Owner and date
    if (item.owner || item.dateFound) {
      const ownerInfo = [];
      if (item.owner) ownerInfo.push(`Owner: ${item.owner}`);
      if (item.dateFound) ownerInfo.push(`Found: ${item.dateFound}`);
      console.log(color(`      ${ownerInfo.join(' │ ')}`, 'dim'));
    }

    // Description (truncated)
    if (item.description) {
      const maxLen = DISPLAY_LIMITS.EVIDENCE_DESC_LENGTH;
      const desc = item.description.length > maxLen
        ? item.description.substring(0, maxLen - 3) + '...'
        : item.description;
      console.log(`      ${desc}`);
    }

    // Attachments count
    if (item.attachments?.length > 0) {
      console.log(color(`      📎 ${item.attachments.length} attachment(s)`, 'dim'));
    }

    console.log('');  // Blank line between items
  });

  sectionEnd();

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('paper-evidence-selection', { paperEvidence: evidence });
  if (autoApproval) {
    console.log(color(`  Selected ${autoApproval.selectedPaperEvidence?.length || 0} item(s)`, 'dim'));
    return autoApproval;
  }

  const choice = await prompt('\n[A]pprove all, [S]elect specific, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 's') {
    console.log(color('\nEnter item numbers to include (comma-separated, e.g., 1,3,5):', 'cyan'));
    const indices = await prompt('Selection: ');
    const selected = indices.split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < evidence.length)
      .map(i => evidence[i]);

    if (selected.length === 0) {
      console.log(color('No valid items selected, approving all', 'yellow'));
      return { selectedPaperEvidence: evidence };
    }

    console.log(color(`\nSelected ${selected.length} item(s):`, 'green'));
    selected.forEach(item => console.log(`  • ${item.name || item.title || 'Untitled'}`));

    return { selectedPaperEvidence: selected };
  }

  return { selectedPaperEvidence: evidence };
}

async function handleCharacterIds(checkpoint, currentPhase) {
  checkpointHeader('CHARACTER_IDS', currentPhase);

  const photos = checkpoint.sessionPhotos || [];
  const analyses = checkpoint.photoAnalyses?.analyses || [];  // Nested under .analyses property
  const roster = checkpoint.sessionConfig?.roster || [];

  sectionBox(`CHARACTER IDENTIFICATION (${photos.length} photos)`);

  // Show roster for reference
  console.log(color('  Available Characters (Roster):', 'bright'));
  if (roster.length > 0) {
    console.log(`  ${roster.join(', ')}`);
  } else {
    console.log(color('  (no roster defined)', 'dim'));
  }

  sectionDivider('PHOTO ANALYSES');

  analyses.forEach((analysis, i) => {
    const photoPath = photos[i] || 'unknown';
    const photoName = photoPath.split(/[/\\]/).pop();

    console.log(`\n  ${color(`Photo ${i + 1}:`, 'cyan')} ${photoName}`);

    // Relevance score if available
    if (analysis.relevanceScore !== undefined) {
      const scoreColor = analysis.relevanceScore >= 7 ? 'green' : analysis.relevanceScore >= 4 ? 'yellow' : 'dim';
      console.log(`  ${color('Relevance:', 'bright')} ${color(`${analysis.relevanceScore}/10`, scoreColor)}`);
    }

    // Visual content (truncated)
    if (analysis.visualContent) {
      const maxLen = DISPLAY_LIMITS.VISUAL_CONTENT_LENGTH;
      const visual = analysis.visualContent.length > maxLen
        ? analysis.visualContent.substring(0, maxLen - 3) + '...'
        : analysis.visualContent;
      console.log(`  ${color('Scene:', 'dim')} ${visual}`);
    }

    // Environment details
    if (analysis.environmentDetails) {
      console.log(`  ${color('Environment:', 'dim')} ${analysis.environmentDetails}`);
    }

    // Character descriptions with role and physical markers
    const charDescs = analysis.characterDescriptions || [];
    if (charDescs.length > 0) {
      console.log(color(`  People (${charDescs.length}):`, 'bright'));
      charDescs.forEach((desc, j) => {
        const text = typeof desc === 'string' ? desc : desc.description || '';
        const maxLen = DISPLAY_LIMITS.CHARACTER_DESC_LENGTH;
        const truncated = text.length > maxLen ? text.substring(0, maxLen - 3) + '...' : text;

        // Role indicator
        const role = desc.role || 'unknown';
        const roleColor = role === 'central' ? 'green' : role === 'background' ? 'dim' : 'yellow';
        const roleIndicator = color(`[${role.toUpperCase()}]`, roleColor);

        console.log(`    ${j + 1}. ${roleIndicator} ${truncated}`);

        // Physical markers
        if (desc.physicalMarkers?.length > 0) {
          const markers = Array.isArray(desc.physicalMarkers)
            ? desc.physicalMarkers.slice(0, 3).join(', ')
            : desc.physicalMarkers;
          console.log(color(`       Markers: ${markers}`, 'dim'));
        }
      });
    } else {
      console.log(color('  No people detected', 'dim'));
    }

    // Suggested caption
    if (analysis.suggestedCaption) {
      console.log(`  ${color('Caption:', 'dim')} "${analysis.suggestedCaption}"`);
    }
  });

  sectionEnd();

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('character-ids', checkpoint, '[AUTO] Skipping character mapping...');
  if (autoApproval) return autoApproval;

  const choice = await prompt('\n[A]pprove (skip mapping), [E]nter natural text, [J]SON format, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 'e') {
    console.log(color('\nDescribe who is in each photo using natural language:', 'cyan'));
    console.log(color('Example: "Photo 1 shows Marcus in the red shirt and Elena with glasses.', 'dim'));
    console.log(color('         Photo 2 has David by the window talking to Sarah."', 'dim'));
    console.log(color('(Empty line to finish)', 'dim'));
    const naturalText = await promptMultiline('');
    if (naturalText.trim()) {
      // Pass as characterIdsRaw - the parseCharacterIds node will convert to structured format
      return { characterIdsRaw: naturalText.trim() };
    }
    console.log(color('No input provided, skipping mappings', 'yellow'));
  }

  if (choice.toLowerCase() === 'j') {
    console.log(color('\nEnter character mappings as JSON:', 'cyan'));
    console.log(color('Format: { "photo.jpg": { characterMappings: [{descriptionIndex: 0, characterName: "Name"}] } }', 'dim'));
    const mappingsJson = await promptMultiline('');
    try {
      const characterIds = JSON.parse(mappingsJson);
      return { characterIds };
    } catch (e) {
      console.log(color('Invalid JSON, skipping mappings', 'yellow'));
    }
  }

  return { characterIds: {} };
}

async function handleAwaitRoster(checkpoint, currentPhase) {
  checkpointHeader('AWAIT_ROSTER', currentPhase);

  console.log(color('Awaiting Roster Input (Incremental Input)', 'bright'));
  console.log(color('\nThis checkpoint pauses for roster to enable:', 'dim'));
  console.log('  • Whiteboard OCR with name disambiguation');
  console.log('  • Character ID mapping');

  // Show generic photo analyses if available
  const genericAnalyses = checkpoint.genericPhotoAnalyses?.analyses || [];
  if (genericAnalyses.length > 0) {
    console.log(color(`\nGeneric Photo Analyses (${genericAnalyses.length} photos):`, 'bright'));
    genericAnalyses.slice(0, 3).forEach((analysis, i) => {
      console.log(`  ${i + 1}. ${truncate(analysis.visualContent || 'No content', 80)}`);
    });
    if (genericAnalyses.length > 3) {
      console.log(color(`  ... and ${genericAnalyses.length - 3} more`, 'dim'));
    }
  }

  // Show whiteboard if detected
  if (checkpoint.whiteboardPhotoPath) {
    console.log(color(`\nWhiteboard detected: ${checkpoint.whiteboardPhotoPath}`, 'green'));
  }

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('await-roster', checkpoint, '[AUTO] Providing roster...');
  if (autoApproval) return autoApproval;

  // Check for pre-loaded incremental data (from loadSessionInput)
  if (incrementalInputData?.roster) {
    const roster = incrementalInputData.roster;
    console.log(color(`\n[INCREMENTAL] Using pre-loaded roster: ${roster.join(', ')}`, 'green'));
    return { roster };
  }

  // Fall back to interactive input
  console.log(color('\nEnter character names (comma-separated):', 'cyan'));
  const rosterInput = await prompt('Roster: ');

  if (rosterInput.trim()) {
    const roster = rosterInput.split(',').map(s => s.trim()).filter(s => s);
    console.log(color(`\n✓ Roster: ${roster.join(', ')}`, 'green'));
    return { roster };
  }

  console.log(color('No roster provided', 'yellow'));
  return { roster: [] };
}

async function handleAwaitFullContext(checkpoint, currentPhase) {
  checkpointHeader('AWAIT_FULL_CONTEXT', currentPhase);

  console.log(color('Awaiting Full Session Context (Incremental Input)', 'bright'));
  console.log(color('\nThis checkpoint pauses for full session context:', 'dim'));
  console.log('  • Accusation (who players accused)');
  console.log('  • Session Report (gameplay events, token purchases)');
  console.log('  • Director Notes (observations, dynamics)');

  // Show what we have so far
  if (checkpoint.roster?.length > 0) {
    console.log(color(`\nRoster provided: ${checkpoint.roster.join(', ')}`, 'green'));
  }

  if (checkpoint.whiteboardAnalysis) {
    console.log(color('\nWhiteboard Analysis available:', 'green'));
    const wb = checkpoint.whiteboardAnalysis;
    if (wb.connectionsMade?.length > 0) {
      console.log(`  Connections: ${wb.connectionsMade.slice(0, 3).join(', ')}${wb.connectionsMade.length > 3 ? '...' : ''}`);
    }
  }

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('await-full-context', checkpoint, '[AUTO] Checking for full context...');
  if (autoApproval && autoApproval.fullContext !== null) {
    return autoApproval;
  }

  // Check for pre-loaded incremental data (from loadSessionInput)
  if (incrementalInputData?.accusation && incrementalInputData?.sessionReport && incrementalInputData?.directorNotes) {
    const fullContext = {
      accusation: incrementalInputData.accusation,
      sessionReport: incrementalInputData.sessionReport,
      directorNotes: incrementalInputData.directorNotes
    };
    console.log(color('\n[INCREMENTAL] Using pre-loaded full context:', 'green'));
    console.log(color(`  Accusation: ${truncate(fullContext.accusation, 60)}`, 'dim'));
    console.log(color(`  Session Report: ${truncate(fullContext.sessionReport, 60)}`, 'dim'));
    console.log(color(`  Director Notes: ${truncate(fullContext.directorNotes, 60)}`, 'dim'));
    return { fullContext };
  }

  // Interactive text input (like roster handler)
  console.log(color('\nEnter session context (or [J]SON input, [Q]uit):', 'cyan'));

  const choice = await prompt('\n[T]ext input, [J]SON input, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 't' || choice === '') {
    // Interactive text prompts
    console.log(color('\n─── Accusation ───', 'bright'));
    console.log(color('Who did the players accuse? (single line)', 'dim'));
    const accusation = await prompt('> ');
    if (!accusation.trim()) {
      throw new Error('Accusation is required');
    }

    console.log(color('\n─── Session Report ───', 'bright'));
    console.log(color('Gameplay events, token purchases, key moments', 'dim'));
    console.log(color('(Enter text, then empty line to finish)', 'dim'));
    const sessionReport = await promptMultiline('> ');
    if (!sessionReport.trim()) {
      throw new Error('Session report is required');
    }

    console.log(color('\n─── Director Notes ───', 'bright'));
    console.log(color('Your observations about player dynamics, notable interactions', 'dim'));
    console.log(color('(Enter text, then empty line to finish)', 'dim'));
    const directorNotes = await promptMultiline('> ');
    if (!directorNotes.trim()) {
      throw new Error('Director notes are required');
    }

    const fullContext = { accusation, sessionReport, directorNotes };
    console.log(color('\n✓ Full context captured', 'green'));
    return { fullContext };
  }

  if (choice.toLowerCase() === 'j') {
    console.log(color('\nEnter full context as JSON:', 'cyan'));
    console.log(color('Format: { "accusation": "...", "sessionReport": "...", "directorNotes": "..." }', 'dim'));
    const contextJson = await promptMultiline('');
    try {
      const parsed = JSON.parse(contextJson);
      if (parsed.fullContext || (parsed.accusation && parsed.sessionReport && parsed.directorNotes)) {
        const fullContext = parsed.fullContext || {
          accusation: parsed.accusation,
          sessionReport: parsed.sessionReport,
          directorNotes: parsed.directorNotes
        };
        return { fullContext };
      }
      console.log(color('Missing required fields: accusation, sessionReport, directorNotes', 'yellow'));
    } catch (e) {
      console.log(color('Invalid JSON', 'yellow'));
    }
  }

  throw new Error('Full context required - cannot proceed without accusation, sessionReport, directorNotes');
}

async function handlePreCuration(checkpoint, currentPhase) {
  checkpointHeader('PRE_CURATION', currentPhase);

  const preprocessed = checkpoint.preprocessedEvidence || {};
  const items = preprocessed.items || [];

  // Calculate counts from items array
  const exposedCount = items.filter(i => i.disposition === 'exposed').length;
  const buriedCount = items.filter(i => i.disposition === 'buried').length;
  const tokenCount = items.filter(i => i.sourceType === 'memory-token').length;
  const paperCount = items.filter(i => i.sourceType === 'paper-evidence').length;

  console.log(color('Pre-Curation Summary (Phase 4f):', 'bright'));
  console.log(`  Total Preprocessed Items: ${items.length}`);
  console.log(`  Exposed Items: ${exposedCount}`);
  console.log(`  Buried Items: ${buriedCount}`);
  console.log(`  Memory Tokens: ${tokenCount}`);
  console.log(`  Paper Evidence: ${paperCount}`);

  if (preprocessed.items?.length > 0) {
    console.log(color('\nPreprocessed Items (first 3):', 'dim'));
    preprocessed.items.slice(0, 3).forEach(item => {
      const disposition = item.disposition || 'unknown';
      const dispColor = disposition === 'exposed' ? 'green' : disposition === 'buried' ? 'yellow' : 'dim';
      console.log(`  - [${color(disposition.toUpperCase(), dispColor)}] ${item.summary?.substring(0, 50) || item.content?.substring(0, 50) || 'No summary'}...`);
    });
  }

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('pre-curation', checkpoint, '[AUTO] Approving pre-curation...');
  if (autoApproval) return autoApproval;

  const choice = await prompt('\n[A]pprove, [F]ull (view all items), or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 'f') {
    console.log(color('\nFull Preprocessed Evidence:', 'cyan'));
    prettyPrint(preprocessed);
    // DRY: Use confirmAction utility
    await confirmAction('\nApprove and proceed to curation?', { throwOnReject: true, rejectMessage: 'User rejected pre-curation' });
  }

  return { preCuration: true };
}

async function handleEvidenceBundle(checkpoint, currentPhase) {
  checkpointHeader('EVIDENCE_AND_PHOTOS', currentPhase);

  const bundle = checkpoint.evidenceBundle || {};
  const excludedCache = checkpoint._excludedItemsCache || {};
  const curationReport = bundle.curationReport || {};
  const curatorNotes = bundle.curatorNotes || {};

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXPOSED LAYER
  // ═══════════════════════════════════════════════════════════════════════════════
  const exposedTokens = bundle.exposed?.tokens || [];
  const exposedPaper = bundle.exposed?.paperEvidence || [];

  sectionBox(`EXPOSED LAYER (${exposedTokens.length + exposedPaper.length} items)`, 'green');
  console.log(color('  Journalist CAN: Quote, describe, draw conclusions', 'dim'));

  // Exposed Tokens
  if (exposedTokens.length > 0) {
    sectionDivider(`Memory Tokens (${exposedTokens.length})`, 'green');
    exposedTokens.slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach((t, i) => {
      const id = t.id || t.tokenId || `token-${i + 1}`;
      const owner = t.owner || t.ownerLogline || 'Unknown';
      const summary = t.summary || t.content || 'No summary';
      console.log(`  ${color((i + 1) + '.', 'cyan')} ${color(id, 'bright')} (Owner: ${owner})`);
      console.log(`     ${truncate(summary, DISPLAY_LIMITS.ISSUE_TEXT_LENGTH)}`);
    });
    if (exposedTokens.length > DISPLAY_LIMITS.MAX_PREVIEW_ITEMS) {
      console.log(color(`  ... and ${exposedTokens.length - DISPLAY_LIMITS.MAX_PREVIEW_ITEMS} more tokens`, 'dim'));
    }
  }

  // Exposed Paper Evidence
  if (exposedPaper.length > 0) {
    sectionDivider(`Paper Evidence (${exposedPaper.length})`, 'green');
    exposedPaper.slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach((p, i) => {
      const title = p.title || p.name || 'Untitled';
      const category = p.category || p.type || '';
      console.log(`  ${color((i + 1) + '.', 'cyan')} ${color(title, 'bright')}${category ? ` [${category}]` : ''}`);
      if (p.description) {
        console.log(`     ${truncate(p.description, DISPLAY_LIMITS.DEFAULT_TRUNCATE)}`);
      }
    });
    if (exposedPaper.length > DISPLAY_LIMITS.MAX_PREVIEW_ITEMS) {
      console.log(color(`  ... and ${exposedPaper.length - DISPLAY_LIMITS.MAX_PREVIEW_ITEMS} more paper items`, 'dim'));
    }
  }
  sectionEnd('green');

  // ═══════════════════════════════════════════════════════════════════════════════
  // BURIED LAYER
  // ═══════════════════════════════════════════════════════════════════════════════
  const buriedTx = bundle.buried?.transactions || [];
  const buriedRel = bundle.buried?.relationships || [];

  sectionBox(`BURIED LAYER (${buriedTx.length + buriedRel.length} items)`, 'red');
  console.log(color('  Journalist CAN: Report patterns, amounts - NOT content/owners', 'dim'));

  // Buried Transactions (anonymized preview)
  if (buriedTx.length > 0) {
    sectionDivider(`Transactions (${buriedTx.length})`, 'red');
    buriedTx.slice(0, 3).forEach((tx, i) => {
      const amount = tx.amount || tx.value || '???';
      const account = tx.account || tx.shellAccount || 'Unknown account';
      const time = tx.time || tx.timestamp || '';
      // Show anonymized preview - amounts and times only
      console.log(`  ${color((i + 1) + '.', 'cyan')} ${color('$' + amount, 'bright')} → ${account}${time ? ` (${time})` : ''}`);
    });
    if (buriedTx.length > 3) {
      console.log(color(`  ... and ${buriedTx.length - 3} more transactions`, 'dim'));
    }
  }

  // Buried Relationships
  if (buriedRel.length > 0) {
    sectionDivider(`Relationships (${buriedRel.length})`, 'red');
    console.log(color(`  ${buriedRel.length} relationship entries (hidden from journalist)`, 'dim'));
  }

  if (buriedTx.length === 0 && buriedRel.length === 0) {
    console.log(color('  (No buried items)', 'dim'));
  }
  sectionEnd('red');

  // ═══════════════════════════════════════════════════════════════════════════════
  // CONTEXT LAYER
  // ═══════════════════════════════════════════════════════════════════════════════
  const context = bundle.context || {};
  const profiles = context.characterProfiles || {};
  const timeline = context.timeline || {};
  const profileCount = Object.keys(profiles).length;
  const timelineCount = Object.keys(timeline).length;

  if (profileCount > 0 || timelineCount > 0) {
    sectionBox(`CONTEXT LAYER`, 'cyan');
    if (profileCount > 0) {
      displayField('Character Profiles', `${profileCount} characters`, { indent: 2 });
      Object.keys(profiles).slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach(name => {
        console.log(color(`    • ${name}`, 'dim'));
      });
      if (profileCount > DISPLAY_LIMITS.MAX_PREVIEW_ITEMS) {
        console.log(color(`    ... and ${profileCount - DISPLAY_LIMITS.MAX_PREVIEW_ITEMS} more`, 'dim'));
      }
    }
    if (timelineCount > 0) {
      displayField('Timeline Entries', `${timelineCount} events`, { indent: 2 });
    }
    sectionEnd('cyan');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CURATOR NOTES
  // ═══════════════════════════════════════════════════════════════════════════════
  if (Object.keys(curatorNotes).length > 0) {
    sectionBox('CURATOR NOTES');
    if (curatorNotes.dispositionSummary) {
      displayField('Disposition', curatorNotes.dispositionSummary, { indent: 2 });
    }
    if (curatorNotes.curationRationale) {
      displayField('Curation', curatorNotes.curationRationale, { indent: 2 });
    }
    if (curatorNotes.layerRationale) {
      displayField('Layer Rationale', curatorNotes.layerRationale, { indent: 2, maxLength: 100 });
    }
    // Character coverage
    if (curatorNotes.characterCoverage && Object.keys(curatorNotes.characterCoverage).length > 0) {
      console.log(color('\n  Character Coverage:', 'bright'));
      Object.entries(curatorNotes.characterCoverage).slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach(([char, coverage]) => {
        const coverageText = typeof coverage === 'object' ? JSON.stringify(coverage) : coverage;
        console.log(`    ${color(char + ':', 'cyan')} ${coverageText}`);
      });
    }
    sectionEnd();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXCLUDED ITEMS (Available for Rescue)
  // ═══════════════════════════════════════════════════════════════════════════════
  const excluded = curationReport.excluded || [];
  const rescuable = excluded.filter(e => e.rescuable === true);

  if (excluded.length > 0) {
    sectionBox(`EXCLUDED ITEMS (${excluded.length} total, ${rescuable.length} rescuable)`, 'yellow');

    excluded.slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach((item, i) => {
      const name = item.name || 'Untitled';
      const score = item.score !== undefined ? `Score: ${item.score}` : '';
      const canRescue = item.rescuable ? color('[RESCUABLE]', 'green') : color('[FINAL]', 'red');

      console.log(`  ${color((i + 1) + '.', 'cyan')} ${name} ${canRescue} ${score ? color(`(${score})`, 'dim') : ''}`);

      // Show exclusion reasons
      if (item.reasons && item.reasons.length > 0) {
        const reason = item.reasons[0];
        console.log(`     ${color('Reason:', 'dim')} ${truncate(reason, 60)}`);
      } else if (item.reason) {
        console.log(`     ${color('Reason:', 'dim')} ${truncate(item.reason, 60)}`);
      }
    });

    if (excluded.length > 5) {
      console.log(color(`\n  ... and ${excluded.length - 5} more excluded items`, 'dim'));
    }

    if (rescuable.length > 0) {
      console.log(color(`\n  💡 ${rescuable.length} items can be rescued via [R]escue option`, 'green'));
    }
    sectionEnd('yellow');
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // CURATION SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════════
  const summary = curationReport.curationSummary || {};
  if (Object.keys(summary).length > 0) {
    console.log(color('\n  Curation Summary:', 'bright'));
    if (summary.rosterPlayers?.length > 0) {
      console.log(`    Roster: ${summary.rosterPlayers.join(', ')}`);
    }
    if (summary.suspects?.length > 0) {
      console.log(`    Suspects: ${summary.suspects.join(', ')}`);
    }
    if (summary.totalCurated !== undefined) {
      console.log(`    Curated: ${summary.totalCurated} items`);
    }
    if (summary.totalExcluded !== undefined) {
      console.log(`    Excluded: ${summary.totalExcluded} items`);
    }
    if (summary.humanRescued !== undefined && summary.humanRescued > 0) {
      console.log(`    Human Rescued: ${summary.humanRescued} items`);
    }
  }

  // Cache info for debugging
  const cacheSize = Object.keys(excludedCache).length;
  if (cacheSize > 0) {
    console.log(color(`\n  [Debug] Excluded items cache: ${cacheSize} items available for rescue`, 'dim'));
  }

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('evidence-and-photos', checkpoint, '[AUTO] Approving evidence bundle...');
  if (autoApproval) return autoApproval;

  // Enhanced options: Approve, Edit (view full), Rescue, Quit
  const hasRescuable = rescuable.length > 0;
  const optionsText = hasRescuable
    ? '\n[A]pprove, [F]ull (view all), [R]escue items, or [Q]uit? '
    : '\n[A]pprove, [F]ull (view all), or [Q]uit? ';

  const choice = await prompt(optionsText);
  handleUserQuit(choice);
  const c = choice.toLowerCase();

  if (c === 'f') {
    console.log(color('\nFull Evidence Bundle:', 'cyan'));
    prettyPrint(bundle);
    // DRY: Use confirmAction utility
    await confirmAction('\nApprove this bundle?', { throwOnReject: true, rejectMessage: 'User rejected evidence bundle' });
  }

  if (c === 'r' && hasRescuable) {
    console.log(color('\nRescuable Items:', 'green'));
    rescuable.forEach((item, i) => {
      console.log(`  ${i + 1}. ${item.name} (Score: ${item.score || 'N/A'})`);
    });
    const rescueInput = await prompt('\nEnter item numbers to rescue (comma-separated), or [C]ancel: ');

    if (rescueInput.toLowerCase() !== 'c') {
      const indices = rescueInput.split(',').map(s => parseInt(s.trim(), 10) - 1).filter(n => !isNaN(n));
      const itemsToRescue = indices
        .filter(i => i >= 0 && i < rescuable.length)
        .map(i => rescuable[i].name);

      if (itemsToRescue.length > 0) {
        console.log(color(`\nRescuing: ${itemsToRescue.join(', ')}`, 'green'));
        return { evidenceBundle: true, rescuedItems: itemsToRescue };
      }
    }
  }

  return { evidenceBundle: true };
}

async function handleArcSelection(checkpoint, currentPhase) {
  checkpointHeader('ARC_SELECTION', currentPhase);

  const arcs = checkpoint.narrativeArcs || [];

  sectionBox(`NARRATIVE ARCS (${arcs.length} available)`);
  console.log(color('  Recommended: Select 3-5 arcs for a balanced article', 'dim'));

  arcs.forEach((arc, i) => {
    const num = String(i + 1).padStart(2, ' ');

    // Title with strength indicator
    const strength = arc.evidenceStrength || 'unknown';
    console.log(`\n  ${color(num + '.', 'cyan')} ${color(arc.title || arc.id || 'Untitled', 'bright')} ${displayConfidence(strength)}`);

    // Arc source and emotional tone
    const meta = [];
    if (arc.arcSource) meta.push(`Source: ${arc.arcSource}`);
    if (arc.emotionalTone) meta.push(`Tone: ${arc.emotionalTone}`);
    if (meta.length > 0) {
      console.log(color(`      ${meta.join(' │ ')}`, 'dim'));
    }

    // Hook (full display)
    if (arc.hook) {
      console.log(`      ${color('Hook:', 'bright')} ${arc.hook}`);
    }

    // Key moments
    if (arc.keyMoments?.length > 0) {
      console.log(color('      Key Moments:', 'bright'));
      arc.keyMoments.slice(0, 3).forEach(moment => {
        const text = typeof moment === 'string' ? moment : moment.description || JSON.stringify(moment);
        console.log(`        • ${text.substring(0, 60)}${text.length > 60 ? '...' : ''}`);
      });
      if (arc.keyMoments.length > 3) {
        console.log(color(`        ... and ${arc.keyMoments.length - 3} more`, 'dim'));
      }
    }

    // Evidence breakdown
    if (arc.evidence?.length > 0) {
      const exposed = arc.evidence.filter(e => e.layer === 'exposed').length;
      const buried = arc.evidence.filter(e => e.layer === 'buried').length;
      console.log(`      ${color('Evidence:', 'bright')} ${arc.evidence.length} items (${exposed} exposed, ${buried} buried)`);

      // Show first few evidence IDs
      const evidenceIds = arc.evidence.slice(0, 3).map(e => e.tokenId || e.id || 'unknown');
      console.log(color(`        IDs: ${evidenceIds.join(', ')}${arc.evidence.length > 3 ? '...' : ''}`, 'dim'));
    }

    // Character placements
    if (arc.characterPlacements && Object.keys(arc.characterPlacements).length > 0) {
      console.log(color('      Characters:', 'bright'));
      Object.entries(arc.characterPlacements).forEach(([char, role]) => {
        console.log(`        ${char}: ${role}`);
      });
    }

    // Financial connections
    if (arc.financialConnections?.length > 0) {
      console.log(color('      Financial:', 'bright'));
      arc.financialConnections.slice(0, 2).forEach(conn => {
        const text = typeof conn === 'string' ? conn : conn.description || JSON.stringify(conn);
        console.log(`        💰 ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`);
      });
    }

    // Thematic links to other arcs
    if (arc.thematicLinks?.length > 0) {
      console.log(color(`      Links: ${arc.thematicLinks.join(', ')}`, 'dim'));
    }

    // Evaluation score if available
    if (arc.evaluationHistory?.overallScore !== undefined) {
      const score = arc.evaluationHistory.overallScore;
      const scoreColor = score >= 7 ? 'green' : score >= 4 ? 'yellow' : 'red';
      console.log(`      ${color('Eval Score:', 'bright')} ${color(score + '/10', scoreColor)}`);

      if (arc.evaluationHistory.structuralIssues?.length > 0) {
        console.log(color('      ⚠️ Issues:', 'yellow'));
        arc.evaluationHistory.structuralIssues.slice(0, 2).forEach(issue => {
          console.log(color(`        - ${issue}`, 'yellow'));
        });
      }
    }
  });

  // Relationship Matrix (if arcs have thematic links)
  const hasLinks = arcs.some(a => a.thematicLinks?.length > 0 || a.characterPlacements);
  if (hasLinks && arcs.length > 1) {
    sectionDivider('RELATIONSHIP MATRIX');
    console.log(color('  Shared characters and thematic connections:', 'dim'));

    // Build simple character overlap matrix
    const charToArcs = {};
    arcs.forEach((arc, i) => {
      if (arc.characterPlacements) {
        Object.keys(arc.characterPlacements).forEach(char => {
          if (!charToArcs[char]) charToArcs[char] = [];
          charToArcs[char].push(i + 1);
        });
      }
    });

    // Show characters that appear in multiple arcs
    Object.entries(charToArcs)
      .filter(([_, arcNums]) => arcNums.length > 1)
      .forEach(([char, arcNums]) => {
        console.log(`    ${char}: Arcs ${arcNums.join(', ')}`);
      });

    // Show thematic links
    const links = [];
    arcs.forEach((arc, i) => {
      if (arc.thematicLinks?.length > 0) {
        arc.thematicLinks.forEach(link => {
          links.push(`Arc ${i + 1} ↔ ${link}`);
        });
      }
    });
    if (links.length > 0) {
      console.log(color('  Thematic Links:', 'bright'));
      links.slice(0, DISPLAY_LIMITS.MAX_PREVIEW_ITEMS).forEach(link => console.log(`    ${link}`));
    }
  }

  sectionEnd();

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('arc-selection', { narrativeArcs: arcs });
  if (autoApproval) {
    const selectedCount = autoApproval.selectedArcs?.length || 0;
    console.log(color(`  Selected ${selectedCount} arc(s): ${autoApproval.selectedArcs?.join(', ')}`, 'dim'));
    return autoApproval;
  }

  const choice = await prompt('\n[A]pprove (select all), [S]elect specific, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 's') {
    // Use loop instead of recursion for retry safety
    while (true) {
      console.log(color('\nEnter arc numbers to include (comma-separated, e.g., 1,2,4):', 'cyan'));
      const indices = await prompt('Selection: ');
      const selected = indices.split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => i >= 0 && i < arcs.length)
        .map(i => arcs[i].id || arcs[i].title);

      if (selected.length > 0) {
        console.log(color(`\nSelected ${selected.length} arc(s):`, 'green'));
        selected.forEach(id => {
          const arc = arcs.find(a => (a.id || a.title) === id);
          console.log(`  • ${arc?.title || id}`);
        });
        return { selectedArcs: selected };
      }
      console.log(color('Must select at least one arc. Please try again.', 'red'));
    }
  }

  return { selectedArcs: arcs.map(a => a.id || a.title) };
}

async function handleOutline(checkpoint, currentPhase) {
  checkpointHeader('OUTLINE', currentPhase);

  const outline = checkpoint.outline || {};
  const evaluation = checkpoint.evaluationHistory || {};
  const isEscalated = checkpoint.escalated === true;

  // Display evaluation status (using DRY helper)
  displayEvaluationStatus(evaluation, isEscalated);

  // Display revision diff if this is a revision (Phase 6.5)
  displayRevisionDiff(revisionCache.outline, outline, evaluation, CONTENT_TYPES.OUTLINE, REVISION_CAPS.OUTLINE);

  // Show FULL outline for review (Commit 8.24)
  console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));
  console.log(color('                         FULL ARTICLE OUTLINE', 'bright'));
  console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));

  // LEDE Section
  console.log(color('\n┌─ LEDE ─────────────────────────────────────────────────────────┐', 'yellow'));
  console.log(color('│ Hook:', 'bright'));
  console.log(`│   ${outline.lede?.hook || 'N/A'}`);
  console.log(color('│ Key Tension:', 'bright'));
  console.log(`│   ${outline.lede?.keyTension || 'N/A'}`);
  if (outline.lede?.selectedEvidence?.length > 0) {
    console.log(color('│ Selected Evidence:', 'bright'));
    outline.lede.selectedEvidence.forEach(e => console.log(`│   - ${e}`));
  }
  console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));

  // THE STORY Section
  console.log(color('\n┌─ THE STORY ────────────────────────────────────────────────────┐', 'yellow'));
  if (outline.theStory?.arcs) {
    outline.theStory.arcs.forEach((arc, i) => {
      console.log(color(`│\n│ Arc ${i + 1}: ${arc.name || arc.arcId || 'Unnamed'}`, 'cyan'));
      console.log(`│   Paragraphs: ${arc.paragraphCount || 0}`);
      if (arc.keyPoints?.length > 0) {
        console.log(color('│   Key Points:', 'dim'));
        arc.keyPoints.forEach(p => {
          const text = typeof p === 'string' ? p : JSON.stringify(p);
          console.log(`│     • ${text}`);
        });
      }
      if (arc.evidenceCards?.length > 0) {
        console.log(color('│   Evidence Cards:', 'dim'));
        arc.evidenceCards.forEach(c => {
          const id = typeof c === 'string' ? c : (c.evidenceId || c.id || JSON.stringify(c));
          const purpose = typeof c === 'object' && c.purpose ? ` - ${c.purpose}` : '';
          console.log(`│     📄 ${id}${purpose}`);
        });
      }
      if (arc.photoPlacement) {
        const photo = arc.photoPlacement;
        const filename = typeof photo === 'string' ? photo : (photo.filename || photo.photo || JSON.stringify(photo));
        const purpose = typeof photo === 'object' && photo.purpose ? ` (${photo.purpose})` : '';
        console.log(color(`│   Photo: ${filename}${purpose}`, 'dim'));
      }
    });
  }
  if (outline.theStory?.arcInterweaving) {
    console.log(color('│\n│ Arc Interweaving:', 'bright'));
    const interweaving = outline.theStory.arcInterweaving;
    if (typeof interweaving === 'string') {
      console.log(`│   ${interweaving}`);
    } else if (typeof interweaving === 'object') {
      // Handle object format with interleavingPlan, callbackOpportunities, convergencePoint
      if (interweaving.interleavingPlan) console.log(`│   Plan: ${interweaving.interleavingPlan}`);
      if (interweaving.convergencePoint) console.log(`│   Convergence: ${interweaving.convergencePoint}`);
      if (interweaving.callbackOpportunities?.length > 0) {
        console.log(color('│   Callbacks:', 'dim'));
        interweaving.callbackOpportunities.forEach(cb => {
          const detail = typeof cb === 'string' ? cb : `${cb.plantIn} → ${cb.payoffIn}: ${cb.detail || ''}`;
          console.log(`│     ↩ ${detail}`);
        });
      }
    }
  }
  console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));

  // FOLLOW THE MONEY Section
  if (outline.followTheMoney) {
    console.log(color('\n┌─ FOLLOW THE MONEY ─────────────────────────────────────────────┐', 'yellow'));
    // Display arcConnections (new schema) or fall back to focus (legacy)
    if (outline.followTheMoney.arcConnections?.length > 0) {
      console.log(color('│ Arc Connections:', 'dim'));
      outline.followTheMoney.arcConnections.forEach(ac => {
        console.log(`│   🔗 ${ac.arcName}: ${ac.financialAngle || ''}`);
      });
    } else if (outline.followTheMoney.focus) {
      console.log(`│ Focus: ${outline.followTheMoney.focus}`);
    }
    if (outline.followTheMoney.shellAccounts?.length > 0) {
      console.log(color('│ Shell Accounts:', 'dim'));
      outline.followTheMoney.shellAccounts.forEach(a => {
        if (typeof a === 'string') {
          console.log(`│   💰 ${a}`);
        } else if (typeof a === 'object') {
          const name = a.name || a.account || a.accountName || 'Unknown';
          const amount = a.amount || a.total || '';
          const note = a.note || a.observation || '';
          console.log(`│   💰 ${name}${amount ? `: ${amount}` : ''}${note ? ` - ${note}` : ''}`);
        }
      });
    }
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // THE PLAYERS Section
  if (outline.thePlayers) {
    console.log(color('\n┌─ THE PLAYERS ──────────────────────────────────────────────────┐', 'yellow'));
    // Display arcConnections (new schema) or fall back to focus (legacy)
    if (outline.thePlayers.arcConnections?.length > 0) {
      console.log(color('│ Arc Connections:', 'dim'));
      outline.thePlayers.arcConnections.forEach(ac => {
        console.log(`│   🔗 ${ac.arcName}: ${ac.characterAngle || ''}`);
      });
    } else if (outline.thePlayers.focus) {
      console.log(`│ Focus: ${outline.thePlayers.focus}`);
    }
    if (outline.thePlayers.characterHighlights) {
      console.log(color('│ Character Highlights:', 'dim'));
      Object.entries(outline.thePlayers.characterHighlights).forEach(([char, highlight]) => {
        console.log(`│   👤 ${char}: ${highlight}`);
      });
    }
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // WHAT'S MISSING Section
  if (outline.whatsMissing) {
    console.log(color('\n┌─ WHAT\'S MISSING ───────────────────────────────────────────────┐', 'yellow'));
    // Display arcConnections (new schema) or fall back to focus (legacy)
    if (outline.whatsMissing.arcConnections?.length > 0) {
      console.log(color('│ Arc Connections:', 'dim'));
      outline.whatsMissing.arcConnections.forEach(ac => {
        console.log(`│   🔗 ${ac.arcName}: ${ac.openQuestion || ''}`);
      });
    } else if (outline.whatsMissing.focus) {
      console.log(`│ Focus: ${outline.whatsMissing.focus}`);
    }
    if (outline.whatsMissing.buriedItems?.length > 0) {
      console.log(color('│ Buried Items:', 'dim'));
      outline.whatsMissing.buriedItems.forEach(b => console.log(`│   🔒 ${b}`));
    }
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // CLOSING Section
  if (outline.closing) {
    console.log(color('\n┌─ CLOSING ──────────────────────────────────────────────────────┐', 'yellow'));
    // Display arcResolutions (new schema) or fall back to theme (legacy)
    if (outline.closing.arcResolutions?.length > 0) {
      console.log(color('│ Arc Resolutions:', 'dim'));
      outline.closing.arcResolutions.forEach(ar => {
        console.log(`│   🎭 ${ar.arcName}: ${ar.resolution || ''}`);
      });
    } else if (outline.closing.theme) {
      console.log(`│ Theme: ${outline.closing.theme}`);
    }
    if (outline.closing.systemicAngle) {
      console.log(`│ Systemic Angle: ${outline.closing.systemicAngle}`);
    }
    console.log(`│ Final Line: ${outline.closing.finalLine || 'N/A'}`);
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Pull Quotes
  if (outline.pullQuotes?.length > 0) {
    console.log(color('\n┌─ PULL QUOTES ──────────────────────────────────────────────────┐', 'yellow'));
    outline.pullQuotes.forEach((pq, i) => {
      const attr = pq.attribution ? ` — ${pq.attribution}` : ' (Nova insight)';
      console.log(`│ ${i + 1}. "${pq.text}"${attr}`);
      console.log(color(`│    Placement: ${pq.placement || 'unspecified'}`, 'dim'));
    });
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('outline', checkpoint, '[AUTO] Approving outline...');
  if (autoApproval) return autoApproval;

  const choice = await prompt('\n[A]pprove, [J]SON (raw), [R]eject with feedback, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 'j') {
    console.log(color('\nRaw JSON Outline:', 'cyan'));
    prettyPrint(outline);
    // DRY: Use confirmAction utility
    await confirmAction('\nApprove this outline?', { throwOnReject: true, rejectMessage: 'User rejected outline' });
  }

  if (choice.toLowerCase() === 'r') {
    console.log(color('\nEnter revision feedback:', 'cyan'));
    const feedback = await promptMultiline('');
    if (feedback.trim()) {
      // Cache current outline for diff display on next revision (Phase 6.5)
      cacheForRevision(CONTENT_TYPES.OUTLINE, outline, feedback.trim());
      return { outline: false, outlineFeedback: feedback.trim() };
    }
    console.log(color('No feedback provided, approving as-is', 'yellow'));
  }

  // Cache current outline for potential future revision diff (on re-entry)
  cacheForRevision(CONTENT_TYPES.OUTLINE, outline);
  return { outline: true };
}

async function handleArticle(checkpoint, currentPhase) {
  checkpointHeader('ARTICLE', currentPhase);

  const contentBundle = checkpoint.contentBundle || {};
  const html = checkpoint.articleHtml || null;
  const evaluation = checkpoint.evaluationHistory || {};
  const isEscalated = checkpoint.escalated === true;
  const metadata = contentBundle.metadata || {};

  // Display evaluation status (using DRY helper)
  displayEvaluationStatus(evaluation, isEscalated);

  // Display revision diff if this is a revision (Phase 6.5)
  displayRevisionDiff(revisionCache.article, contentBundle, evaluation, CONTENT_TYPES.ARTICLE, REVISION_CAPS.ARTICLE);

  // ═══════════════════════════════════════════════════════════════════════════════
  // METADATA
  // ═══════════════════════════════════════════════════════════════════════════════
  if (Object.keys(metadata).length > 0) {
    console.log(color('\n  Metadata:', 'dim'));
    if (metadata.sessionId) console.log(color(`    Session: ${metadata.sessionId}`, 'dim'));
    if (metadata.theme) console.log(color(`    Theme: ${metadata.theme}`, 'dim'));
    if (metadata.generatedAt) console.log(color(`    Generated: ${metadata.generatedAt}`, 'dim'));
    if (metadata.version) console.log(color(`    Version: ${metadata.version}`, 'dim'));
  }

  // Show FULL article content for review (Commit 8.24)
  console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));
  console.log(color('                         FULL ARTICLE DRAFT', 'bright'));
  console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));

  // Headline (complete: main, sub/deck, kicker)
  if (contentBundle.headline) {
    console.log(color('\n┌─ HEADLINE ─────────────────────────────────────────────────────┐', 'yellow'));
    if (contentBundle.headline.kicker) {
      console.log(color(`│ Kicker: ${contentBundle.headline.kicker}`, 'dim'));
    }
    console.log(color('│ Main:', 'bright'));
    console.log(`│   ${contentBundle.headline.main || 'N/A'}`);
    if (contentBundle.headline.sub || contentBundle.headline.deck) {
      console.log(color('│ Deck:', 'dim'));
      console.log(`│   ${contentBundle.headline.sub || contentBundle.headline.deck}`);
    }
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Byline (complete: author, title, location, date)
  if (contentBundle.byline) {
    const byline = contentBundle.byline;
    const bylineInfo = [];
    if (byline.author) bylineInfo.push(byline.author);
    if (byline.title) bylineInfo.push(byline.title);
    if (byline.location) bylineInfo.push(byline.location);
    if (byline.date) bylineInfo.push(byline.date);
    console.log(color(`\nByline: ${bylineInfo.join(' | ')}`, 'dim'));
  }

  // Hero Image
  if (contentBundle.heroImage) {
    const hero = contentBundle.heroImage;
    console.log(color('\n┌─ HERO IMAGE ───────────────────────────────────────────────────┐', 'yellow'));
    console.log(`│ 📷 ${hero.filename || hero.photo || 'No filename'}`);
    if (hero.caption) console.log(`│ Caption: ${hero.caption}`);
    if (hero.characters?.length > 0) {
      console.log(color(`│ Characters: ${hero.characters.join(', ')}`, 'dim'));
    }
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Sections - show FULL prose content
  if (contentBundle.sections?.length > 0) {
    console.log(color('\n═══════════════════════════════════════════════════════════════', 'magenta'));
    console.log(color('                         ARTICLE SECTIONS', 'bright'));
    console.log(color('═══════════════════════════════════════════════════════════════', 'magenta'));

    contentBundle.sections.forEach((section, i) => {
      console.log(color(`\n┌─ ${section.id?.toUpperCase() || `SECTION ${i + 1}`} ─${'─'.repeat(Math.max(0, 50 - (section.id?.length || 10)))}┐`, 'yellow'));
      if (section.heading) {
        console.log(color(`│ ${section.heading}`, 'bright'));
      }
      console.log('│');

      // Show all content blocks
      if (section.content?.length > 0) {
        section.content.forEach((block, j) => {
          if (block.type === 'paragraph') {
            // Wrap long paragraphs for readability
            const text = block.text || '';
            const lines = text.match(/.{1,70}(\s|$)/g) || [text];
            lines.forEach(line => console.log(`│ ${line.trim()}`));
            console.log('│');
          } else if (block.type === 'quote') {
            console.log(color(`│ "${block.text}"`, 'cyan'));
            if (block.attribution) console.log(color(`│   — ${block.attribution}`, 'dim'));
            console.log('│');
          } else if (block.type === 'evidence-reference') {
            console.log(color(`│ 📄 [Evidence: ${block.evidenceId}] ${block.caption || ''}`, 'green'));
            console.log('│');
          } else if (block.type === 'photo') {
            console.log(color(`│ 📷 [Photo: ${block.filename}] ${block.caption || ''}`, 'blue'));
            console.log('│');
          } else if (block.type === 'list') {
            (block.items || []).forEach(item => console.log(`│   • ${item}`));
            console.log('│');
          }
        });
      }
      console.log(color(`└${'─'.repeat(68)}┘`, 'yellow'));
    });
  }

  // Pull Quotes
  if (contentBundle.pullQuotes?.length > 0) {
    console.log(color('\n┌─ PULL QUOTES ──────────────────────────────────────────────────┐', 'yellow'));
    contentBundle.pullQuotes.forEach((pq, i) => {
      const attr = pq.attribution ? ` — ${pq.attribution}` : ' (Nova insight)';
      console.log(`│ ${i + 1}. "${pq.text}"${attr}`);
    });
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Evidence Cards (sidebar) - complete with owner, significance, placement
  if (contentBundle.evidenceCards?.length > 0) {
    console.log(color('\n┌─ EVIDENCE CARDS (Sidebar) ─────────────────────────────────────┐', 'yellow'));
    contentBundle.evidenceCards.forEach((card, i) => {
      console.log(color(`│ ${i + 1}. ${card.title || card.evidenceId}`, 'cyan'));
      if (card.summary) console.log(`│    ${card.summary.substring(0, 55)}${card.summary.length > 55 ? '...' : ''}`);
      const cardMeta = [];
      if (card.owner) cardMeta.push(`Owner: ${card.owner}`);
      if (card.significance) cardMeta.push(`Significance: ${card.significance}`);
      if (card.placement || card.afterSection) cardMeta.push(`After: ${card.placement || card.afterSection}`);
      if (cardMeta.length > 0) {
        console.log(color(`│    ${cardMeta.join(' │ ')}`, 'dim'));
      }
    });
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Photos (standalone array, not in sections)
  if (contentBundle.photos?.length > 0) {
    console.log(color('\n┌─ PHOTOS ───────────────────────────────────────────────────────┐', 'yellow'));
    contentBundle.photos.forEach((photo, i) => {
      const filename = photo.filename || photo.photo || `photo-${i + 1}`;
      console.log(color(`│ ${i + 1}. 📷 ${filename}`, 'cyan'));
      if (photo.caption) console.log(`│    Caption: ${photo.caption.substring(0, 50)}${photo.caption.length > 50 ? '...' : ''}`);
      const photoMeta = [];
      if (photo.characters?.length > 0) photoMeta.push(`Characters: ${photo.characters.join(', ')}`);
      if (photo.placement || photo.afterSection) photoMeta.push(`After: ${photo.placement || photo.afterSection}`);
      if (photoMeta.length > 0) {
        console.log(color(`│    ${photoMeta.join(' │ ')}`, 'dim'));
      }
    });
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  // Financial Tracker
  if (contentBundle.financialTracker?.entries?.length > 0) {
    console.log(color('\n┌─ FINANCIAL TRACKER ────────────────────────────────────────────┐', 'yellow'));
    contentBundle.financialTracker.entries.forEach(entry => {
      console.log(`│ 💰 ${entry.account}: ${entry.amount}`);
      if (entry.description || entry.note) {
        console.log(color(`│    ${entry.description || entry.note}`, 'dim'));
      }
    });
    console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
  }

  console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));

  // Word count estimate
  const wordCount = JSON.stringify(contentBundle).split(/\s+/).length;
  console.log(color(`Estimated word count: ~${wordCount} words`, 'dim'));

  if (html) {
    console.log(color(`HTML length: ${html.length} characters`, 'dim'));
  }

  // DRY: Use centralized helpers
  const autoApproval = handleAutoApproval('article', checkpoint, '[AUTO] Approving article...');
  if (autoApproval) return autoApproval;

  const choice = await prompt('\n[A]pprove, [H]TML (view rendered), [J]SON (raw), [R]eject with feedback, or [Q]uit? ');
  handleUserQuit(choice);

  if (choice.toLowerCase() === 'h') {
    if (html) {
      console.log(color('\nFull HTML:', 'cyan'));
      console.log(html);
    } else {
      console.log(color('HTML not yet assembled', 'yellow'));
    }
    // DRY: Use confirmAction utility
    await confirmAction('\nApprove this article?', { throwOnReject: true, rejectMessage: 'User rejected article' });
  }

  if (choice.toLowerCase() === 'j') {
    console.log(color('\nRaw JSON ContentBundle:', 'cyan'));
    prettyPrint(contentBundle);
    // DRY: Use confirmAction utility
    await confirmAction('\nApprove this article?', { throwOnReject: true, rejectMessage: 'User rejected article' });
  }

  if (choice.toLowerCase() === 'r') {
    console.log(color('\nEnter revision feedback:', 'cyan'));
    const feedback = await promptMultiline('');
    if (feedback.trim()) {
      // Cache current article for diff display on next revision (Phase 6.5)
      cacheForRevision(CONTENT_TYPES.ARTICLE, contentBundle, feedback.trim());
      return { article: false, articleFeedback: feedback.trim() };
    }
    console.log(color('No feedback provided, approving as-is', 'yellow'));
  }

  // Cache current article for potential future revision diff (on re-entry)
  cacheForRevision(CONTENT_TYPES.ARTICLE, contentBundle);
  return { article: true };
}

// Map approval types to handlers
const checkpointHandlers = {
  'input-review': handleInputReview,
  'paper-evidence-selection': handlePaperEvidenceSelection,
  'await-roster': handleAwaitRoster,           // Incremental input (parallel branch architecture)
  'character-ids': handleCharacterIds,
  'await-full-context': handleAwaitFullContext, // Incremental input (parallel branch architecture)
  'pre-curation': handlePreCuration,           // Phase 4f
  'evidence-and-photos': handleEvidenceBundle,
  'arc-selection': handleArcSelection,
  'outline': handleOutline,
  'article': handleArticle
};

// Display checkpoint data without interactive prompts (for step mode)
// NEW SIGNATURE: Receives checkpoint data directly (DRY - extracted once in main loop)
function displayCheckpointData(checkpointType, checkpoint, currentPhase) {
  switch (checkpointType) {
    case 'input-review':
      checkpointHeader('INPUT_REVIEW', currentPhase);
      console.log(color('Parsed Input:', 'bright'));
      if (checkpoint.parsedInput) prettyPrint(checkpoint.parsedInput);
      console.log('\n' + color('Session Config:', 'bright'));
      if (checkpoint.sessionConfig) {
        console.log(`  Roster: ${checkpoint.sessionConfig.roster?.join(', ')}`);
        console.log(`  Accused: ${checkpoint.sessionConfig.accusation?.accused?.join(', ')}`);
      }
      console.log('\n' + color('Player Focus:', 'bright'));
      if (checkpoint.playerFocus) {
        console.log(`  Primary: ${checkpoint.playerFocus.primaryInvestigation}`);
      }
      break;

    case 'paper-evidence-selection':
      checkpointHeader('PAPER_EVIDENCE_SELECTION', currentPhase);
      const evidence = checkpoint.paperEvidence || [];
      console.log(color(`Available Paper Evidence (${evidence.length} items):`, 'bright'));
      evidence.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.name || item.title || item.description || 'Untitled'}`);
        if (item.type) console.log(color(`     Type: ${item.type}`, 'dim'));
      });
      break;

    case 'character-ids':
      checkpointHeader('CHARACTER_IDS', currentPhase);
      const photos = checkpoint.sessionPhotos || [];
      // photoAnalyses can be { analyses: [...] } or direct array
      const analysesData = checkpoint.photoAnalyses?.analyses || checkpoint.photoAnalyses || [];
      const analyses = Array.isArray(analysesData) ? analysesData : [];
      const roster = checkpoint.sessionConfig?.roster || [];
      console.log(color(`Photos to identify (${photos.length}):`, 'bright'));
      analyses.forEach((analysis, i) => {
        const photoPath = photos[i] || 'unknown';
        const photoName = photoPath.split(/[/\\]/).pop(); // Get filename only
        console.log(`\n  ${color(`Photo ${i + 1}:`, 'cyan')} ${photoName}`);
        console.log(`  ${color('Visual:', 'dim')} ${analysis.visualContent?.substring(0, 100)}...`);
        const charDescs = analysis.characterDescriptions || analysis.peopleDescriptions || [];
        console.log(`  ${color('People:', 'dim')} ${charDescs.length} detected`);
        charDescs.slice(0, 3).forEach((desc, j) => {
          // Handle both string and object formats
          const descText = typeof desc === 'string' ? desc : desc.description || JSON.stringify(desc);
          console.log(`    ${j + 1}. ${descText.substring(0, 80)}...`);
        });
        if (charDescs.length > 3) {
          console.log(color(`    ... and ${charDescs.length - 3} more`, 'dim'));
        }
      });
      console.log(color(`\nRoster: ${roster.join(', ')}`, 'bright'));
      break;

    case 'await-roster':
      checkpointHeader('AWAIT_ROSTER', currentPhase);
      console.log(color('Awaiting Roster Input (Incremental Input)', 'bright'));
      console.log(color('\nThis checkpoint pauses for roster to enable:', 'dim'));
      console.log('  • Whiteboard OCR with name disambiguation');
      console.log('  • Character ID mapping');
      const genericAnalyses = checkpoint.genericPhotoAnalyses?.analyses || [];
      if (genericAnalyses.length > 0) {
        console.log(color(`\nGeneric Photo Analyses (${genericAnalyses.length} photos):`, 'bright'));
        genericAnalyses.slice(0, 3).forEach((analysis, i) => {
          console.log(`  ${i + 1}. ${analysis.visualContent?.substring(0, 80) || 'No content'}...`);
        });
        if (genericAnalyses.length > 3) {
          console.log(color(`  ... and ${genericAnalyses.length - 3} more`, 'dim'));
        }
      }
      if (checkpoint.whiteboardPhotoPath) {
        console.log(color(`\nWhiteboard detected: ${checkpoint.whiteboardPhotoPath}`, 'green'));
      }
      console.log(color('\nProvide roster as array: { "roster": ["Name1", "Name2", ...] }', 'cyan'));
      break;

    case 'await-full-context':
      checkpointHeader('AWAIT_FULL_CONTEXT', currentPhase);
      console.log(color('Awaiting Full Context (Incremental Input)', 'bright'));
      console.log(color('\nThis checkpoint pauses for full session context:', 'dim'));
      console.log('  • Accusation (who players accused)');
      console.log('  • Session Report (gameplay events, token purchases)');
      console.log('  • Director Notes (observations, dynamics)');
      if (checkpoint.roster?.length > 0) {
        console.log(color(`\nRoster provided: ${checkpoint.roster.join(', ')}`, 'green'));
      }
      if (checkpoint.whiteboardAnalysis) {
        console.log(color('\nWhiteboard Analysis available:', 'green'));
        const wb = checkpoint.whiteboardAnalysis;
        if (wb.connectionsMade?.length > 0) {
          console.log(`  Connections: ${wb.connectionsMade.slice(0, 3).join(', ')}${wb.connectionsMade.length > 3 ? '...' : ''}`);
        }
      }
      console.log(color('\nProvide context:', 'cyan'));
      console.log('{ "fullContext": { "accusation": "...", "sessionReport": "...", "directorNotes": "..." } }');
      break;

    case 'pre-curation':
      checkpointHeader('PRE_CURATION', currentPhase);
      const preprocessedEvidence = checkpoint.preprocessedEvidence || {};
      const pcItems = preprocessedEvidence.items || [];
      // Calculate counts from items array
      const pcExposedCount = pcItems.filter(i => i.disposition === 'exposed').length;
      const pcBuriedCount = pcItems.filter(i => i.disposition === 'buried').length;
      const pcTokenCount = pcItems.filter(i => i.sourceType === 'memory-token').length;
      const pcPaperCount = pcItems.filter(i => i.sourceType === 'paper-evidence').length;
      console.log(color('Pre-Curation Summary (Phase 4f):', 'bright'));
      console.log(`  Total Preprocessed Items: ${pcItems.length}`);
      console.log(`  Exposed Items: ${pcExposedCount}`);
      console.log(`  Buried Items: ${pcBuriedCount}`);
      console.log(`  Memory Tokens: ${pcTokenCount}`);
      console.log(`  Paper Evidence: ${pcPaperCount}`);
      if (preprocessedEvidence.items?.length > 0) {
        console.log(color('\nPreprocessed Items (first 3):', 'dim'));
        preprocessedEvidence.items.slice(0, 3).forEach(item => {
          const disp = item.disposition || 'unknown';
          const dispColor = disp === 'exposed' ? 'green' : disp === 'buried' ? 'yellow' : 'dim';
          console.log(`  - [${color(disp.toUpperCase(), dispColor)}] ${item.summary?.substring(0, 50) || 'No summary'}...`);
        });
      }
      break;

    case 'evidence-and-photos':
      checkpointHeader('EVIDENCE_AND_PHOTOS', currentPhase);
      const bundle = checkpoint.evidenceBundle || {};
      console.log(color('Evidence Bundle Summary:', 'bright'));
      console.log(`  Exposed Tokens: ${bundle.exposed?.tokens?.length || 0}`);
      console.log(`  Buried Transactions: ${bundle.buried?.transactions?.length || 0}`);
      console.log(`  Paper Evidence: ${bundle.exposed?.paperEvidence?.length || 0}`);
      if (bundle.exposed?.tokens?.length > 0) {
        console.log(color('\nExposed Tokens (first 3):', 'dim'));
        bundle.exposed.tokens.slice(0, 3).forEach(t => {
          console.log(`  - ${t.summary?.substring(0, 60) || t.content?.substring(0, 60)}...`);
        });
      }
      break;

    case 'arc-selection':
      checkpointHeader('ARC_SELECTION', currentPhase);
      const arcs = checkpoint.narrativeArcs || [];
      console.log(color(`Available Narrative Arcs (${arcs.length}):`, 'bright'));
      arcs.forEach((arc, i) => {
        console.log(`\n  ${color(`${i + 1}. ${arc.title || arc.id}`, 'cyan')}`);
        if (arc.hook) console.log(`     Hook: ${arc.hook.substring(0, 80)}...`);
        if (arc.evidence) console.log(color(`     Evidence: ${arc.evidence.length} items`, 'dim'));
      });
      break;

    case 'outline':
      checkpointHeader('OUTLINE', currentPhase);
      const outline = checkpoint.outline || {};

      // Show FULL outline for step mode (Commit 8.24)
      console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));
      console.log(color('                         FULL ARTICLE OUTLINE', 'bright'));
      console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));

      // LEDE
      console.log(color('\n┌─ LEDE ─────────────────────────────────────────────────────────┐', 'yellow'));
      console.log(color('│ Hook:', 'bright'));
      console.log(`│   ${outline.lede?.hook || 'N/A'}`);
      console.log(color('│ Key Tension:', 'bright'));
      console.log(`│   ${outline.lede?.keyTension || 'N/A'}`);
      console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));

      // THE STORY
      console.log(color('\n┌─ THE STORY ────────────────────────────────────────────────────┐', 'yellow'));
      if (outline.theStory?.arcs) {
        outline.theStory.arcs.forEach((arc, i) => {
          console.log(color(`│\n│ Arc ${i + 1}: ${arc.name || arc.arcId || 'Unnamed'}`, 'cyan'));
          console.log(`│   Paragraphs: ${arc.paragraphCount || 0}`);
          if (arc.keyPoints?.length > 0) {
            arc.keyPoints.forEach(p => {
              const text = typeof p === 'string' ? p : JSON.stringify(p);
              console.log(`│     • ${text}`);
            });
          }
          if (arc.evidenceCards?.length > 0) {
            arc.evidenceCards.forEach(c => {
              const id = typeof c === 'string' ? c : (c.evidenceId || c.id || JSON.stringify(c));
              console.log(`│     📄 ${id}`);
            });
          }
          if (arc.photoPlacement) {
            const photo = arc.photoPlacement;
            const filename = typeof photo === 'string' ? photo : (photo.filename || photo.photo || JSON.stringify(photo));
            console.log(color(`│   Photo: ${filename}`, 'dim'));
          }
        });
      }
      console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));

      // Other sections summary
      if (outline.followTheMoney) {
        console.log(color(`\n┌─ FOLLOW THE MONEY: ${outline.followTheMoney.focus || 'N/A'}`, 'yellow'));
        if (outline.followTheMoney.shellAccounts?.length > 0) {
          outline.followTheMoney.shellAccounts.forEach(a => {
            if (typeof a === 'string') {
              console.log(`│   💰 ${a}`);
            } else {
              const name = a.name || a.account || a.accountName || 'Unknown';
              const amount = a.amount || '';
              console.log(`│   💰 ${name}${amount ? `: ${amount}` : ''}`);
            }
          });
        }
      }
      if (outline.thePlayers) {
        console.log(color(`┌─ THE PLAYERS: ${outline.thePlayers.focus || 'N/A'}`, 'yellow'));
      }
      if (outline.whatsMissing) {
        console.log(color(`┌─ WHAT'S MISSING: ${outline.whatsMissing.focus || 'N/A'}`, 'yellow'));
      }
      if (outline.closing) {
        console.log(color(`┌─ CLOSING: ${outline.closing.theme || 'N/A'}`, 'yellow'));
      }
      if (outline.pullQuotes?.length > 0) {
        console.log(color(`\nPull Quotes: ${outline.pullQuotes.length}`, 'dim'));
        outline.pullQuotes.forEach((pq, i) => {
          const text = typeof pq === 'string' ? pq : (pq.text || JSON.stringify(pq));
          const attr = pq.attribution ? ` — ${pq.attribution}` : '';
          console.log(`  ${i + 1}. "${text.substring(0, 50)}..."${attr}`);
        });
      }
      console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));
      break;

    case 'article':
      checkpointHeader('ARTICLE', currentPhase);
      const contentBundle = checkpoint.contentBundle || {};
      const htmlContent = checkpoint.articleHtml || null;

      // Show FULL article for step mode (Commit 8.24)
      console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));
      console.log(color('                         FULL ARTICLE DRAFT', 'bright'));
      console.log(color('═══════════════════════════════════════════════════════════════', 'cyan'));

      // Headline
      if (contentBundle.headline) {
        console.log(color('\n┌─ HEADLINE ─────────────────────────────────────────────────────┐', 'yellow'));
        console.log(`│   ${contentBundle.headline.main || 'N/A'}`);
        if (contentBundle.headline.sub) console.log(`│   ${contentBundle.headline.sub}`);
        console.log(color('└────────────────────────────────────────────────────────────────┘', 'yellow'));
      }

      // Sections with full prose
      if (contentBundle.sections?.length > 0) {
        console.log(color('\n═══════════════════════════════════════════════════════════════', 'magenta'));
        contentBundle.sections.forEach((section, i) => {
          console.log(color(`\n┌─ ${section.id?.toUpperCase() || `SECTION ${i + 1}`} ─${'─'.repeat(Math.max(0, 50 - (section.id?.length || 10)))}┐`, 'yellow'));
          if (section.heading) console.log(color(`│ ${section.heading}`, 'bright'));
          if (section.content?.length > 0) {
            section.content.forEach(block => {
              if (block.type === 'paragraph') {
                const text = block.text || '';
                const lines = text.match(/.{1,70}(\s|$)/g) || [text];
                lines.forEach(line => console.log(`│ ${line.trim()}`));
                console.log('│');
              } else if (block.type === 'quote') {
                console.log(color(`│ "${block.text}"`, 'cyan'));
                if (block.attribution) console.log(color(`│   — ${block.attribution}`, 'dim'));
              } else if (block.type === 'evidence-reference') {
                console.log(color(`│ 📄 [Evidence: ${block.evidenceId}]`, 'green'));
              } else if (block.type === 'photo') {
                console.log(color(`│ 📷 [Photo: ${block.filename}]`, 'blue'));
              }
            });
          }
          console.log(color(`└${'─'.repeat(68)}┘`, 'yellow'));
        });
      }

      // Sidebar components summary
      if (contentBundle.pullQuotes?.length > 0) {
        console.log(color(`\nPull Quotes: ${contentBundle.pullQuotes.length}`, 'dim'));
      }
      if (contentBundle.evidenceCards?.length > 0) {
        console.log(color(`Evidence Cards: ${contentBundle.evidenceCards.length}`, 'dim'));
      }
      if (contentBundle.financialTracker?.entries?.length > 0) {
        console.log(color(`Financial Tracker: ${contentBundle.financialTracker.entries.length} entries`, 'dim'));
      }

      console.log(color('\n═══════════════════════════════════════════════════════════════', 'cyan'));
      if (htmlContent) {
        console.log(color(`HTML length: ${htmlContent.length} characters`, 'dim'));
      }
      break;

    default:
      console.log(color(`Unknown checkpoint type: ${checkpointType}`, 'yellow'));
      prettyPrint(checkpoint);
  }
}

// ============================================================================
// Main Walkthrough Loop
// ============================================================================

async function runWalkthrough() {
  header('E2E Walkthrough');

  console.log(`Mode: ${AUTO_MODE ? color('AUTO', 'yellow') : color('INTERACTIVE', 'green')}`);
  console.log(`Resume: ${RESUME_MODE ? color('YES', 'yellow') : 'NO (new session)'}`);
  console.log(`Server: ${API_BASE}`);
  console.log(`Theme: ${DEFAULT_THEME}`);
  if (VERBOSE) console.log(color('Verbose mode enabled', 'dim'));

  // Load auto-approval profile when in AUTO_MODE
  if (AUTO_MODE) {
    const profileName = PROFILE_NAME || 'smart-defaults';
    activeProfile = loadAutoProfile(profileName);
  }

  console.log('');

  // Authenticate first
  console.log(color('Authenticating...', 'dim'));
  const loggedIn = await login();
  if (!loggedIn) {
    throw new Error('Authentication failed');
  }

  // Load state overrides if specified
  let stateOverrides = null;
  if (OVERRIDE_FILE) {
    try {
      stateOverrides = loadOverrideFile(OVERRIDE_FILE);
    } catch (error) {
      console.error(color(`Failed to load override file: ${error.message}`, 'red'));
      return;
    }
  }

  // Gather or load input
  let inputData;
  let sessionId;

  try {
    if (INPUT_FILE) {
      // Load from --input file
      inputData = loadInputFile(INPUT_FILE);
      sessionId = inputData.sessionId || SESSION_ID;
    } else if (SESSION_ID) {
      // Load from existing session files
      console.log(color(`Loading session: ${SESSION_ID}`, 'cyan'));
      inputData = await loadSessionInput(SESSION_ID);
      sessionId = SESSION_ID;
    } else {
      // Interactive input gathering - not available in step mode
      if (STEP_MODE) {
        console.error(color('Error: --step mode requires --session <id> or --input <file>', 'red'));
        console.log(color('Step mode is non-interactive and cannot gather raw input.', 'dim'));
        return;
      }
      inputData = await gatherRawInput();
      sessionId = inputData.sessionId;
    }
  } catch (error) {
    console.error(color(`Failed to load input: ${error.message}`, 'red'));
    return;
  }

  // Warn if overrides won't be applied (only work with --rollback or resume mode)
  if (stateOverrides && !ROLLBACK_TO && inputData.rawSessionInput && !inputData.fromFiles) {
    console.log(color('WARNING: --override only applies with --rollback or when resuming existing session', 'yellow'));
  }

  console.log(color(`\nSession ID: ${sessionId}`, 'bright'));

  // Handle rollback first if specified
  if (ROLLBACK_TO) {
    console.log(color(`\nRolling back to: ${ROLLBACK_TO}`, 'yellow'));
    const rollbackBody = { rollbackTo: ROLLBACK_TO };
    if (stateOverrides) {
      rollbackBody.stateOverrides = stateOverrides;
    }
    const { status, data, error } = await apiCall(`/api/session/${sessionId}/rollback`, rollbackBody);
    if (status !== 200) {
      console.error(color(`Rollback failed: ${data?.error || error}`, 'red'));
      return;
    }
    console.log(color(`  ✓ Rolled back. Phase: ${data.currentPhase}`, 'green'));
    console.log(color(`  Cleared: ${data.fieldsCleared?.length || 0} fields`, 'dim'));
  }

  // Main loop
  let iteration = 0;
  const maxIterations = 20; // Safety limit
  let currentData = null;

  // Initial request - use /start for new sessions, /generate for resume
  if (inputData.rawSessionInput && !RESUME_MODE) {
    // Use /start endpoint for new sessions
    console.log(color(`\n─── Starting Session via /start ───`, 'dim'));
    const startBody = {
      theme: DEFAULT_THEME,
      rawSessionInput: inputData.rawSessionInput
    };
    const { status, data, error, durationMs } = await apiCall(`/api/session/${sessionId}/start`, startBody, 'POST', sessionId);

    if (!VERBOSE) {
      console.log(color(`Response: ${status} (${durationMs}ms)`, status === 200 ? 'green' : 'red'));
    }

    if (status !== 200) {
      console.error(color(`Start failed: ${data?.error || error}`, 'red'));
      return;
    }
    currentData = data;
  } else {
    // Use /generate for resume
    console.log(color(`\n─── Resuming Session via /generate ───`, 'dim'));
    const requestBody = {
      sessionId,
      theme: DEFAULT_THEME,
      mode: 'resume'
    };
    if (stateOverrides) {
      requestBody.stateOverrides = stateOverrides;
    }
    const { status, data, error, durationMs } = await apiCall('/api/generate', requestBody, 'POST', sessionId);

    if (!VERBOSE) {
      console.log(color(`Response: ${status} (${durationMs}ms)`, status === 200 ? 'green' : 'red'));
    }

    if (status !== 200) {
      console.error(color(`Resume failed: ${data?.error || error}`, 'red'));
      return;
    }
    currentData = data;
  }

  // Main checkpoint loop
  while (iteration < maxIterations) {
    iteration++;

    // Display current phase
    // NEW FORMAT: Use 'interrupted' and 'checkpoint.type' instead of 'awaitingApproval'/'approvalType'
    const checkpoint = currentData.checkpoint || {};
    const checkpointType = checkpoint.type || null;

    console.log(color(`\n─── Checkpoint #${iteration} ───`, 'dim'));
    console.log(`Phase: ${color(currentData.currentPhase, 'cyan')}`);
    console.log(`Interrupted: ${currentData.interrupted || false}`);
    if (checkpointType) {
      console.log(`Checkpoint Type: ${color(checkpointType, 'yellow')}`);
    }

    // Check for completion
    if (currentData.currentPhase === 'complete') {
      header('Pipeline Complete!');

      if (currentData.assembledHtml) {
        // Save HTML to file
        const outputDir = path.join(__dirname, '..', 'outputs');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, `report-${sessionId}-${Date.now()}.html`);
        fs.writeFileSync(outputPath, currentData.assembledHtml);
        console.log(color(`HTML saved to: ${outputPath}`, 'green'));
        console.log(`Length: ${currentData.assembledHtml.length} characters`);
      }

      if (currentData.validationResults) {
        console.log(color('\nValidation Results:', 'bright'));
        console.log(`  Passed: ${currentData.validationResults.passed ? color('YES', 'green') : color('NO', 'red')}`);
        if (currentData.validationResults.issues) {
          console.log(`  Issues: ${currentData.validationResults.issues.length}`);
        }
      }

      break;
    }

    // Check for error phase
    if (currentData.currentPhase === 'error') {
      header('Pipeline Error');
      console.log(color('Errors:', 'red'));
      (currentData.errors || []).forEach(err => {
        console.log(`  - [${err.type}] ${err.message}`);
      });
      break;
    }

    // Handle checkpoint
    // NEW FORMAT: Use 'interrupted' and 'checkpoint.type'
    if (currentData.interrupted && checkpointType) {
      // STEP MODE: Non-interactive checkpoint handling
      if (STEP_MODE) {
        // If --approve was provided, verify it matches current checkpoint
        if (APPROVE_TYPE) {
          if (APPROVE_TYPE !== checkpointType) {
            console.log(color(`\nError: --approve ${APPROVE_TYPE} does not match current checkpoint: ${checkpointType}`, 'red'));
            console.log(color('Use --step without --approve to view current checkpoint', 'dim'));
            break;
          }

          // Approve this checkpoint - use custom file if provided, otherwise defaults
          let approvals;
          if (APPROVE_FILE) {
            approvals = loadApprovalFile(APPROVE_FILE);
          } else {
            // DRY: Use single source of truth for default approvals
            approvals = getDefaultApprovalForProfile(checkpointType, checkpoint);
          }
          console.log(color(`\n─── Approving ${checkpointType}... ───`, 'dim'));

          const { status, data, error, durationMs } = await apiCall(
            `/api/session/${sessionId}/approve`,
            approvals,
            'POST',
            sessionId
          );

          if (!VERBOSE) {
            console.log(color(`Response: ${status} (${durationMs}ms)`, status === 200 ? 'green' : 'red'));
          }

          if (status !== 200) {
            console.error(color(`Approval failed: ${data?.error || error}`, 'red'));
            break;
          }

          currentData = data;

          // Display the next checkpoint (or completion)
          // NEW FORMAT: Extract checkpoint from new response
          const nextCheckpoint = currentData.checkpoint || {};
          const nextCheckpointType = nextCheckpoint.type || null;
          if (currentData.currentPhase === 'complete') {
            console.log(color('\n✓ Pipeline complete!', 'green'));
          } else if (currentData.interrupted && nextCheckpointType) {
            console.log(color(`\n✓ Advanced to next checkpoint:`, 'green'));
            displayCheckpointData(nextCheckpointType, nextCheckpoint, currentData.currentPhase);
            console.log(color(`\nTo approve this checkpoint, run:`, 'dim'));
            console.log(color(`  node scripts/e2e-walkthrough.js --session ${sessionId} --approve ${nextCheckpointType} --step`, 'cyan'));
          }
          break; // Exit after one approval in step mode

        } else {
          // No --approve: Just display current checkpoint and exit
          displayCheckpointData(checkpointType, checkpoint, currentData.currentPhase);
          console.log(color(`\nTo approve this checkpoint, run:`, 'dim'));
          console.log(color(`  node scripts/e2e-walkthrough.js --session ${sessionId} --approve ${checkpointType} --step`, 'cyan'));
          break; // Exit after displaying in step mode
        }
      }

      // INTERACTIVE/AUTO MODE: Use checkpoint handlers
      const handler = checkpointHandlers[checkpointType];

      if (handler) {
        try {
          // DRY: Use withRetry for error recovery (retry/skip/quit)
          const approvals = await withRetry(
            () => handler(checkpoint, currentData.currentPhase),
            { checkpointType, checkpoint }
          );

          // Use /approve endpoint for cleaner flow
          console.log(color(`\n─── Approving... ───`, 'dim'));
          const { status, data, error, durationMs } = await apiCall(
            `/api/session/${sessionId}/approve`,
            approvals,
            'POST',
            sessionId
          );

          if (!VERBOSE) {
            console.log(color(`Response: ${status} (${durationMs}ms)`, status === 200 ? 'green' : 'red'));
          }

          if (status !== 200) {
            console.error(color(`Approval failed: ${data?.error || error}`, 'red'));
            break;
          }

          currentData = data;

        } catch (err) {
          if (err.message === 'User quit') {
            console.log(color('\nWalkthrough cancelled by user.', 'yellow'));
            break;
          }
          // Max retries exceeded or unexpected error
          console.error(color(`\nFatal error: ${err.message}`, 'red'));
          break;
        }
      } else {
        console.log(color(`Unknown checkpoint type: ${checkpointType}`, 'red'));
        break;
      }
    } else {
      // No checkpoint, something unexpected
      console.log(color('Unexpected state - not interrupted but not complete', 'yellow'));
      prettyPrint(currentData);
      break;
    }
  }

  if (iteration >= maxIterations) {
    console.log(color('\nMax iterations reached - possible infinite loop', 'red'));
  }
}

// ============================================================================
// Entry Point
// ============================================================================

async function main() {
  if (HELP_MODE) {
    showHelp();
    process.exit(0);
  }

  console.log('\n' + color('═'.repeat(60), 'magenta'));
  console.log(color('  ALN Director Console - E2E Walkthrough', 'bright'));
  console.log(color('  Phase 4f (8 checkpoints)', 'dim'));
  console.log(color('═'.repeat(60), 'magenta'));

  // Only create readline if we need interactive input
  if (!STEP_MODE && !AUTO_MODE) {
    createReadline();
  }

  try {
    await runWalkthrough();
  } catch (error) {
    console.error(color(`\nFatal error: ${error.message}`, 'red'));
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (rl) {
      rl.close();
    }
  }

  console.log(color('\nWalkthrough complete.', 'green'));
  process.exit(0);
}

main();
