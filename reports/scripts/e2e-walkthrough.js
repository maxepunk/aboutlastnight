#!/usr/bin/env node
/**
 * E2E Walkthrough Script (Phase 4f)
 *
 * Interactive walkthrough of the complete report generation pipeline.
 * Uses REST endpoints for granular state access and control.
 *
 * Usage:
 *   node scripts/e2e-walkthrough.js                    # Interactive mode with raw input
 *   node scripts/e2e-walkthrough.js --session 1221    # Load from existing session files
 *   node scripts/e2e-walkthrough.js --fresh           # Clear cached checkpoints first
 *   node scripts/e2e-walkthrough.js --input file.json # Load raw input from JSON file
 *   node scripts/e2e-walkthrough.js --auto            # Auto-approve all checkpoints
 *   node scripts/e2e-walkthrough.js --verbose         # Show full request/response
 *   node scripts/e2e-walkthrough.js --help            # Show help
 *
 * Checkpoints (8 total):
 *   1. INPUT_REVIEW - Review parsed raw input
 *   2. PAPER_EVIDENCE_SELECTION - Select unlocked paper evidence
 *   3. CHARACTER_IDS - Map characters to photos
 *   4. PRE_CURATION - Review preprocessed evidence before curation (Phase 4f)
 *   5. EVIDENCE_AND_PHOTOS - Approve curated evidence bundle
 *   6. ARC_SELECTION - Select narrative arcs to develop
 *   7. OUTLINE - Approve article outline
 *   8. ARTICLE - Approve final article
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
const API_TIMEOUT_MS = parseInt(process.env.API_TIMEOUT_MS) || 10 * 60 * 1000; // 10 minutes default
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

// Session cookie storage for authenticated requests
let sessionCookie = null;

// Parse CLI arguments
const args = process.argv.slice(2);
const AUTO_MODE = args.includes('--auto');
const HELP_MODE = args.includes('--help') || args.includes('-h');
const FRESH_MODE = args.includes('--fresh');
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

function connectSSE(sessionId) {
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
      return;
    }

    res.setEncoding('utf8');
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.message && data.message !== lastProgressLine) {
              lastProgressLine = data.message;
              // TTY-safe progress display
              if (isTTY) {
                process.stdout.write(`\r\x1b[K  ${color('Progress:', 'dim')} ${data.message}`);
              } else {
                console.log(`  Progress: ${data.message}`);
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
            if (isTTY) {
              process.stdout.write(`\r\x1b[K  ${color('Progress:', 'dim')} ${data.message}`);
            } else {
              console.log(`  Progress: ${data.message}`);
            }
          }
        } catch (_) {
          // Ignore parse errors on final buffer
        }
      }
      activeSSE = null;
    });
  });

  req.on('error', (err) => {
    // SSE connection errors are non-fatal - API call continues
    if (VERBOSE) {
      console.log(color(`\n  SSE error: ${err.message}`, 'yellow'));
    }
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

  // Connect SSE for progress streaming if sessionId provided (Commit 8.16)
  if (sseSessionId) {
    connectSSE(sseSessionId);
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    disconnectSSE();  // Clean up SSE connection
    const durationMs = Date.now() - startTime;

    // Store session cookie from login response
    // Handle both single string and comma-separated multiple cookies
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      const cookies = setCookie.split(',').map(c => c.trim());
      const sessionCookieValue = cookies[0]?.split(';')[0];
      if (sessionCookieValue && sessionCookieValue.includes('=')) {
        sessionCookie = sessionCookieValue;
      }
    }

    const data = await response.json();

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
  --session <id>     Load input from existing data/{id}/inputs/ files
  --fresh            Clear cached checkpoints before starting
  --input <file>     Load rawSessionInput from JSON file
  --override <file>  Load stateOverrides from JSON file (e.g., playerFocus)
  --rollback <type>  Rollback to checkpoint before running
  --auto             Auto-approve all checkpoints (for CI/testing)
  --step             Run one checkpoint, display data, exit (non-interactive)
  --approve <type>   Approve the current checkpoint and advance to next
  --approve-file <f> Use custom JSON payload for approval (with --approve)
  --verbose, -v      Show full request/response JSON
  --help, -h         Show this help message

${color('ROLLBACK VALUES:', 'cyan')}
  input-review, paper-evidence-selection, character-ids, pre-curation,
  evidence-bundle, arc-selection, outline, article

${color('EXAMPLES:', 'cyan')}
  # Interactive mode - gather input from prompts
  node scripts/e2e-walkthrough.js

  # Load from existing session
  node scripts/e2e-walkthrough.js --session 1221

  # Fresh start with input file
  node scripts/e2e-walkthrough.js --fresh --input session-1225.json

  # Rollback and retry with modified focus
  node scripts/e2e-walkthrough.js --session 1221 --rollback arc-selection --override focus.json

  # Auto-approve everything (CI mode)
  node scripts/e2e-walkthrough.js --session 1221 --auto --verbose

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
  - [F]ull    - View full JSON response
  - [E]dit    - Modify the data before continuing
  - [Q]uit    - Exit the walkthrough

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
  header('Raw Session Input');
  console.log('Enter the session details. This will be parsed into structured data.\n');

  const sessionId = await prompt(color('Session ID (e.g., 1221): ', 'cyan'));

  console.log('\n' + color('Roster', 'bright') + ' - Enter character names, comma-separated:');
  const roster = await prompt(color('> ', 'cyan'));

  console.log('\n' + color('Accusation', 'bright') + ' - Describe the murder accusation:');
  const accusation = await promptMultiline(color('> ', 'cyan'));

  console.log('\n' + color('Session Report', 'bright') + ' - Token purchases, shell accounts, gameplay events:');
  const sessionReport = await promptMultiline(color('> ', 'cyan'));

  console.log('\n' + color('Director Notes', 'bright') + ' - Your observations about player dynamics:');
  const directorNotes = await promptMultiline(color('> ', 'cyan'));

  console.log('\n' + color('Session Photos Path', 'bright') + ' - Directory containing session photos:');
  console.log(color('(Press Enter to use default: data/{sessionId}/inputs/photos)', 'dim'));
  const photosPath = await prompt(color('> ', 'cyan'));

  console.log('\n' + color('Whiteboard Photo Path', 'bright') + ' - Path to whiteboard image for Layer 3 analysis:');
  console.log(color('(Press Enter to skip whiteboard analysis)', 'dim'));
  const whiteboardPhotoPath = await prompt(color('> ', 'cyan'));

  return {
    sessionId,
    rawSessionInput: {
      roster,
      accusation,
      sessionReport,
      directorNotes,
      photosPath: photosPath || null,
      whiteboardPhotoPath: whiteboardPhotoPath || null
    }
  };
}

async function loadSessionInput(sessionId) {
  const dataDir = path.join(__dirname, '..', 'data', sessionId, 'inputs');

  console.log(color(`Loading from ${dataDir}...`, 'dim'));

  try {
    const sessionConfig = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'session-config.json'), 'utf8')
    );
    const directorNotes = JSON.parse(
      fs.readFileSync(path.join(dataDir, 'director-notes.json'), 'utf8')
    );

    console.log(color(`  ✓ Session config loaded (${sessionConfig.roster?.length || 0} characters)`, 'green'));
    console.log(color(`  ✓ Director notes loaded`, 'green'));

    // When loading from files, we don't send rawSessionInput - just sessionId
    // The pipeline will load from files automatically
    return { sessionId, fromFiles: true };
  } catch (error) {
    console.error(color(`  ✗ Failed to load: ${error.message}`, 'red'));
    throw error;
  }
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
// Checkpoint Handlers
// ============================================================================

async function handleInputReview(response) {
  checkpointHeader('INPUT_REVIEW', response.currentPhase);

  console.log(color('Parsed Input:', 'bright'));
  if (response.parsedInput) {
    prettyPrint(response.parsedInput);
  }

  console.log('\n' + color('Session Config:', 'bright'));
  if (response.sessionConfig) {
    console.log(`  Roster: ${response.sessionConfig.roster?.join(', ')}`);
    console.log(`  Accused: ${response.sessionConfig.accusation?.accused?.join(', ')}`);
  }

  console.log('\n' + color('Player Focus:', 'bright'));
  if (response.playerFocus) {
    console.log(`  Primary: ${response.playerFocus.primaryInvestigation}`);
  }

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Approving input...', 'yellow'));
    return { inputReview: true };
  }

  const choice = await prompt('\n[A]pprove, [E]dit, or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    console.log(color('\nEdit mode - enter corrections as JSON:', 'cyan'));
    const editsJson = await promptMultiline('');
    try {
      const inputEdits = JSON.parse(editsJson);
      return { inputReview: true, inputEdits };
    } catch (e) {
      console.log(color('Invalid JSON, approving as-is', 'yellow'));
    }
  }

  return { inputReview: true };
}

async function handlePaperEvidenceSelection(response) {
  checkpointHeader('PAPER_EVIDENCE_SELECTION', response.currentPhase);

  const evidence = response.paperEvidence || [];
  console.log(color(`Available Paper Evidence (${evidence.length} items):`, 'bright'));

  evidence.forEach((item, i) => {
    console.log(`  ${i + 1}. ${item.title || item.description || 'Untitled'}`);
    if (item.type) console.log(color(`     Type: ${item.type}`, 'dim'));
  });

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Selecting all evidence...', 'yellow'));
    return { selectedPaperEvidence: evidence };
  }

  const choice = await prompt('\n[A]pprove all, [E]dit selection, or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    const indices = await prompt('Enter item numbers to include (comma-separated): ');
    const selected = indices.split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < evidence.length)
      .map(i => evidence[i]);
    return { selectedPaperEvidence: selected };
  }

  return { selectedPaperEvidence: evidence };
}

async function handleCharacterIds(response) {
  checkpointHeader('CHARACTER_IDS', response.currentPhase);

  const photos = response.sessionPhotos || [];
  const analyses = response.photoAnalyses?.analyses || [];  // Nested under .analyses property
  const roster = response.sessionConfig?.roster || [];

  console.log(color(`Photos to identify (${photos.length}):`, 'bright'));

  analyses.forEach((analysis, i) => {
    console.log(`\n  ${color(`Photo ${i + 1}:`, 'cyan')} ${photos[i] || 'unknown'}`);
    console.log(`  ${color('Visual:', 'dim')} ${analysis.visualContent?.substring(0, 100)}...`);
    // Schema uses characterDescriptions (array of {description, role} objects)
    const charDescs = analysis.characterDescriptions || [];
    console.log(`  ${color('People:', 'dim')} ${charDescs.length} detected`);
    charDescs.forEach((desc, j) => {
      // Handle object format: {description: "...", role: "..."}
      const text = typeof desc === 'string' ? desc : desc.description || JSON.stringify(desc);
      console.log(`    ${j + 1}. ${text.substring(0, 80)}${text.length > 80 ? '...' : ''}`);
    });
  });

  console.log(color(`\nRoster: ${roster.join(', ')}`, 'bright'));

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Skipping character mapping...', 'yellow'));
    return { characterIds: {} };
  }

  const choice = await prompt('\n[A]pprove (skip mapping), [E]nter natural text, [J]SON format, or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

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

async function handlePreCuration(response) {
  checkpointHeader('PRE_CURATION', response.currentPhase);

  const summary = response.preCurationSummary || {};
  const preprocessed = response.preprocessedEvidence || {};

  console.log(color('Pre-Curation Summary (Phase 4f):', 'bright'));
  console.log(`  Total Preprocessed Items: ${summary.preprocessedItemCount || preprocessed.items?.length || 0}`);
  console.log(`  Exposed Items: ${summary.exposedCount || 0}`);
  console.log(`  Buried Items: ${summary.buriedCount || 0}`);
  console.log(`  Selected Paper Evidence: ${summary.selectedPaperCount || 0}`);
  console.log(`  Photos Analyzed: ${summary.photoCount || 0}`);

  if (preprocessed.items?.length > 0) {
    console.log(color('\nPreprocessed Items (first 3):', 'dim'));
    preprocessed.items.slice(0, 3).forEach(item => {
      const disposition = item.disposition || 'unknown';
      const dispColor = disposition === 'exposed' ? 'green' : disposition === 'buried' ? 'yellow' : 'dim';
      console.log(`  - [${color(disposition.toUpperCase(), dispColor)}] ${item.summary?.substring(0, 50) || item.content?.substring(0, 50) || 'No summary'}...`);
    });
  }

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Approving pre-curation...', 'yellow'));
    return { preCuration: true };
  }

  const choice = await prompt('\n[A]pprove, [F]ull (view all items), or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'f') {
    console.log(color('\nFull Preprocessed Evidence:', 'cyan'));
    prettyPrint(preprocessed);
    const confirm = await prompt('\nApprove and proceed to curation? [Y/n] ');
    if (confirm.toLowerCase() === 'n') {
      throw new Error('User rejected pre-curation');
    }
  }

  return { preCuration: true };
}

async function handleEvidenceBundle(response) {
  checkpointHeader('EVIDENCE_AND_PHOTOS', response.currentPhase);

  const bundle = response.evidenceBundle || {};

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

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Approving evidence bundle...', 'yellow'));
    return { evidenceBundle: true };
  }

  const choice = await prompt('\n[A]pprove, [E]dit (view full), or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    console.log(color('\nFull Evidence Bundle:', 'cyan'));
    prettyPrint(bundle);
    const confirm = await prompt('\nApprove this bundle? [Y/n] ');
    if (confirm.toLowerCase() === 'n') {
      throw new Error('User rejected evidence bundle');
    }
  }

  return { evidenceBundle: true };
}

async function handleArcSelection(response) {
  checkpointHeader('ARC_SELECTION', response.currentPhase);

  const arcs = response.narrativeArcs || [];

  console.log(color(`Available Narrative Arcs (${arcs.length}):`, 'bright'));

  arcs.forEach((arc, i) => {
    console.log(`\n  ${color(`${i + 1}. ${arc.title || arc.id}`, 'cyan')}`);
    if (arc.hook) console.log(`     Hook: ${arc.hook.substring(0, 80)}...`);
    if (arc.evidence) console.log(color(`     Evidence: ${arc.evidence.length} items`, 'dim'));
  });

  if (AUTO_MODE) {
    const selected = arcs.slice(0, 2).map(a => a.id || a.title);
    console.log(color(`\n[AUTO] Selecting first 2 arcs: ${selected.join(', ')}`, 'yellow'));
    return { selectedArcs: selected };
  }

  const choice = await prompt('\n[A]pprove (select all), [E]dit selection, or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    // Use loop instead of recursion for retry safety
    while (true) {
      const indices = await prompt('Enter arc numbers to include (comma-separated): ');
      const selected = indices.split(',')
        .map(s => parseInt(s.trim()) - 1)
        .filter(i => i >= 0 && i < arcs.length)
        .map(i => arcs[i].id || arcs[i].title);

      if (selected.length > 0) {
        return { selectedArcs: selected };
      }
      console.log(color('Must select at least one arc. Please try again.', 'red'));
    }
  }

  return { selectedArcs: arcs.map(a => a.id || a.title) };
}

async function handleOutline(response) {
  checkpointHeader('OUTLINE', response.currentPhase);

  const outline = response.outline || {};

  console.log(color('Article Outline:', 'bright'));
  // Fix: Use correct outline schema fields (Commit 8.9.9)
  // Outline has: lede.hook, lede.keyTension, theStory.arcs[], not headline/sections
  console.log(`  Opening Hook: ${outline.lede?.hook?.substring(0, 80) || 'N/A'}${outline.lede?.hook?.length > 80 ? '...' : ''}`);
  console.log(`  Key Tension: ${outline.lede?.keyTension?.substring(0, 60) || 'N/A'}${outline.lede?.keyTension?.length > 60 ? '...' : ''}`);
  console.log(`  Story Arcs: ${outline.theStory?.arcs?.length || 0}`);

  if (outline.theStory?.arcs) {
    outline.theStory.arcs.forEach((arc, i) => {
      console.log(`\n  ${color(`Arc ${i + 1}: ${arc.name || 'Unnamed'}`, 'cyan')}`);
      console.log(`    Paragraphs: ${arc.paragraphCount || 0}, Evidence Cards: ${arc.evidenceCards?.length || 0}`);
    });
  }

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Approving outline...', 'yellow'));
    return { outline: true };
  }

  const choice = await prompt('\n[A]pprove, [E]dit (view full), or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    console.log(color('\nFull Outline:', 'cyan'));
    prettyPrint(outline);
    const confirm = await prompt('\nApprove this outline? [Y/n] ');
    if (confirm.toLowerCase() === 'n') {
      throw new Error('User rejected outline');
    }
  }

  return { outline: true };
}

async function handleArticle(response) {
  checkpointHeader('ARTICLE', response.currentPhase);

  // Note: ARTICLE checkpoint may include the HTML for preview
  const html = response.assembledHtml || response.articleHtml || null;

  if (html) {
    console.log(color('Article Preview:', 'bright'));
    console.log(color('─'.repeat(40), 'dim'));
    // Show first 500 chars of HTML
    console.log(html.substring(0, 500) + '...');
    console.log(color('─'.repeat(40), 'dim'));
    console.log(color(`Total length: ${html.length} characters`, 'dim'));
  } else {
    console.log(color('Article ready for final assembly.', 'bright'));
  }

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Approving article...', 'yellow'));
    return { article: true };
  }

  const choice = await prompt('\n[A]pprove, [E]dit (view full HTML), or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
    if (html) {
      console.log(color('\nFull HTML:', 'cyan'));
      console.log(html);
    }
    const confirm = await prompt('\nApprove this article? [Y/n] ');
    if (confirm.toLowerCase() === 'n') {
      throw new Error('User rejected article');
    }
  }

  return { article: true };
}

// Map approval types to handlers
const checkpointHandlers = {
  'input-review': handleInputReview,
  'paper-evidence-selection': handlePaperEvidenceSelection,
  'character-ids': handleCharacterIds,
  'pre-curation': handlePreCuration,  // Phase 4f
  'evidence-and-photos': handleEvidenceBundle,
  'arc-selection': handleArcSelection,
  'outline': handleOutline,
  'article': handleArticle
};

// Display checkpoint data without interactive prompts (for step mode)
function displayCheckpointData(approvalType, response) {
  switch (approvalType) {
    case 'input-review':
      checkpointHeader('INPUT_REVIEW', response.currentPhase);
      console.log(color('Parsed Input:', 'bright'));
      if (response.parsedInput) prettyPrint(response.parsedInput);
      console.log('\n' + color('Session Config:', 'bright'));
      if (response.sessionConfig) {
        console.log(`  Roster: ${response.sessionConfig.roster?.join(', ')}`);
        console.log(`  Accused: ${response.sessionConfig.accusation?.accused?.join(', ')}`);
      }
      console.log('\n' + color('Player Focus:', 'bright'));
      if (response.playerFocus) {
        console.log(`  Primary: ${response.playerFocus.primaryInvestigation}`);
      }
      break;

    case 'paper-evidence-selection':
      checkpointHeader('PAPER_EVIDENCE_SELECTION', response.currentPhase);
      const evidence = response.paperEvidence || [];
      console.log(color(`Available Paper Evidence (${evidence.length} items):`, 'bright'));
      evidence.forEach((item, i) => {
        console.log(`  ${i + 1}. ${item.title || item.description || 'Untitled'}`);
        if (item.type) console.log(color(`     Type: ${item.type}`, 'dim'));
      });
      break;

    case 'character-ids':
      checkpointHeader('CHARACTER_IDS', response.currentPhase);
      const photos = response.sessionPhotos || [];
      // photoAnalyses can be { analyses: [...] } or direct array
      const analysesData = response.photoAnalyses?.analyses || response.photoAnalyses || [];
      const analyses = Array.isArray(analysesData) ? analysesData : [];
      const roster = response.sessionConfig?.roster || [];
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

    case 'pre-curation':
      checkpointHeader('PRE_CURATION', response.currentPhase);
      const preCurationSummary = response.preCurationSummary || {};
      const preprocessedEvidence = response.preprocessedEvidence || {};
      console.log(color('Pre-Curation Summary (Phase 4f):', 'bright'));
      console.log(`  Total Preprocessed Items: ${preCurationSummary.preprocessedItemCount || preprocessedEvidence.items?.length || 0}`);
      console.log(`  Exposed Items: ${preCurationSummary.exposedCount || 0}`);
      console.log(`  Buried Items: ${preCurationSummary.buriedCount || 0}`);
      console.log(`  Selected Paper Evidence: ${preCurationSummary.selectedPaperCount || 0}`);
      console.log(`  Photos Analyzed: ${preCurationSummary.photoCount || 0}`);
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
      checkpointHeader('EVIDENCE_AND_PHOTOS', response.currentPhase);
      const bundle = response.evidenceBundle || {};
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
      checkpointHeader('ARC_SELECTION', response.currentPhase);
      const arcs = response.narrativeArcs || [];
      console.log(color(`Available Narrative Arcs (${arcs.length}):`, 'bright'));
      arcs.forEach((arc, i) => {
        console.log(`\n  ${color(`${i + 1}. ${arc.title || arc.id}`, 'cyan')}`);
        if (arc.hook) console.log(`     Hook: ${arc.hook.substring(0, 80)}...`);
        if (arc.evidence) console.log(color(`     Evidence: ${arc.evidence.length} items`, 'dim'));
      });
      break;

    case 'outline':
      checkpointHeader('OUTLINE', response.currentPhase);
      const outline = response.outline || {};
      console.log(color('Article Outline:', 'bright'));
      // Fix: Use correct outline schema fields (Commit 8.9.9)
      console.log(`  Opening Hook: ${outline.lede?.hook?.substring(0, 80) || 'N/A'}${outline.lede?.hook?.length > 80 ? '...' : ''}`);
      console.log(`  Key Tension: ${outline.lede?.keyTension?.substring(0, 60) || 'N/A'}${outline.lede?.keyTension?.length > 60 ? '...' : ''}`);
      console.log(`  Story Arcs: ${outline.theStory?.arcs?.length || 0}`);
      if (outline.theStory?.arcs) {
        outline.theStory.arcs.forEach((arc, i) => {
          console.log(`\n  ${color(`Arc ${i + 1}: ${arc.name || 'Unnamed'}`, 'cyan')}`);
          console.log(`    Paragraphs: ${arc.paragraphCount || 0}, Evidence Cards: ${arc.evidenceCards?.length || 0}`);
        });
      }
      break;

    case 'article':
      checkpointHeader('ARTICLE', response.currentPhase);
      const html = response.assembledHtml || response.articleHtml || null;
      if (html) {
        console.log(color('Article Preview:', 'bright'));
        console.log(color('─'.repeat(40), 'dim'));
        console.log(html.substring(0, 500) + '...');
        console.log(color('─'.repeat(40), 'dim'));
        console.log(color(`Total length: ${html.length} characters`, 'dim'));
      } else {
        console.log(color('Article ready for final assembly.', 'bright'));
      }
      break;

    default:
      console.log(color(`Unknown checkpoint type: ${approvalType}`, 'yellow'));
      prettyPrint(response);
  }
}

// Get default approval payload for step mode (auto-approve with sensible defaults)
function getDefaultApproval(approvalType, response) {
  switch (approvalType) {
    case 'input-review':
      return { inputReview: true };
    case 'paper-evidence-selection':
      return { selectedPaperEvidence: response.paperEvidence || [] };
    case 'character-ids':
      return { characterIds: {} };
    case 'pre-curation':
      return { preCuration: true };  // Phase 4f
    case 'evidence-and-photos':
      return { evidenceBundle: true };
    case 'arc-selection':
      const arcs = response.narrativeArcs || [];
      return { selectedArcs: arcs.slice(0, 2).map(a => a.id || a.title) };
    case 'outline':
      return { outline: true };
    case 'article':
      return { article: true };
    default:
      return {};
  }
}

// ============================================================================
// Main Walkthrough Loop
// ============================================================================

async function runWalkthrough() {
  header('E2E Walkthrough');

  console.log(`Mode: ${AUTO_MODE ? color('AUTO', 'yellow') : color('INTERACTIVE', 'green')}`);
  console.log(`Fresh: ${FRESH_MODE ? color('YES', 'yellow') : 'NO'}`);
  console.log(`Server: ${API_BASE}`);
  console.log(`Theme: ${DEFAULT_THEME}`);
  if (VERBOSE) console.log(color('Verbose mode enabled', 'dim'));
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

  // Initial request - use /start for fresh with raw input, /generate for resume
  const useStartEndpoint = inputData.rawSessionInput && (FRESH_MODE || !inputData.fromFiles);
  if (useStartEndpoint) {
    // Use /start endpoint for fresh sessions with raw input
    console.log(color(`\n─── Starting Session ───`, 'dim'));
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
    // Use /generate for resume or file-based sessions
    console.log(color(`\n─── Resuming Session ───`, 'dim'));
    const requestBody = {
      sessionId,
      theme: DEFAULT_THEME,
      mode: FRESH_MODE ? 'fresh' : 'resume'
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
    console.log(color(`\n─── Checkpoint #${iteration} ───`, 'dim'));
    console.log(`Phase: ${color(currentData.currentPhase, 'cyan')}`);
    console.log(`Awaiting Approval: ${currentData.awaitingApproval}`);
    if (currentData.approvalType) {
      console.log(`Approval Type: ${color(currentData.approvalType, 'yellow')}`);
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
    if (currentData.awaitingApproval && currentData.approvalType) {
      // STEP MODE: Non-interactive checkpoint handling
      if (STEP_MODE) {
        // If --approve was provided, verify it matches current checkpoint
        if (APPROVE_TYPE) {
          if (APPROVE_TYPE !== currentData.approvalType) {
            console.log(color(`\nError: --approve ${APPROVE_TYPE} does not match current checkpoint: ${currentData.approvalType}`, 'red'));
            console.log(color('Use --step without --approve to view current checkpoint', 'dim'));
            break;
          }

          // Approve this checkpoint - use custom file if provided, otherwise defaults
          let approvals;
          if (APPROVE_FILE) {
            approvals = loadApprovalFile(APPROVE_FILE);
          } else {
            approvals = getDefaultApproval(currentData.approvalType, currentData);
          }
          console.log(color(`\n─── Approving ${currentData.approvalType}... ───`, 'dim'));

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
          if (currentData.currentPhase === 'complete') {
            console.log(color('\n✓ Pipeline complete!', 'green'));
          } else if (currentData.awaitingApproval && currentData.approvalType) {
            console.log(color(`\n✓ Advanced to next checkpoint:`, 'green'));
            displayCheckpointData(currentData.approvalType, currentData);
            console.log(color(`\nTo approve this checkpoint, run:`, 'dim'));
            console.log(color(`  node scripts/e2e-walkthrough.js --session ${sessionId} --approve ${currentData.approvalType} --step`, 'cyan'));
          }
          break; // Exit after one approval in step mode

        } else {
          // No --approve: Just display current checkpoint and exit
          displayCheckpointData(currentData.approvalType, currentData);
          console.log(color(`\nTo approve this checkpoint, run:`, 'dim'));
          console.log(color(`  node scripts/e2e-walkthrough.js --session ${sessionId} --approve ${currentData.approvalType} --step`, 'cyan'));
          break; // Exit after displaying in step mode
        }
      }

      // INTERACTIVE/AUTO MODE: Use checkpoint handlers
      const handler = checkpointHandlers[currentData.approvalType];

      if (handler) {
        try {
          const approvals = await handler(currentData);

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
          throw err;
        }
      } else {
        console.log(color(`Unknown approval type: ${currentData.approvalType}`, 'red'));
        break;
      }
    } else {
      // No checkpoint, something unexpected
      console.log(color('Unexpected state - not awaiting approval but not complete', 'yellow'));
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
