#!/usr/bin/env node
/**
 * E2E Walkthrough Script (Commit 8.9.7)
 *
 * Interactive walkthrough of the complete report generation pipeline.
 * Tests the full HTTP flow via /api/generate endpoint.
 *
 * Usage:
 *   node scripts/e2e-walkthrough.js                    # Interactive mode with raw input
 *   node scripts/e2e-walkthrough.js --session 1221    # Load from existing session files
 *   node scripts/e2e-walkthrough.js --auto            # Auto-approve all checkpoints
 *   node scripts/e2e-walkthrough.js --help            # Show help
 *
 * Checkpoints (7 total):
 *   1. INPUT_REVIEW - Review parsed raw input
 *   2. PAPER_EVIDENCE_SELECTION - Select unlocked paper evidence
 *   3. CHARACTER_IDS - Map characters to photos
 *   4. EVIDENCE_BUNDLE - Approve curated evidence bundle
 *   5. ARC_SELECTION - Select narrative arcs to develop
 *   6. OUTLINE - Approve article outline
 *   7. ARTICLE - Approve final article
 */

require('dotenv').config();
const readline = require('readline');
const fs = require('fs');
const path = require('path');

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
const sessionIndex = args.indexOf('--session');
const SESSION_ID = sessionIndex !== -1 ? args[sessionIndex + 1] : null;

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

// HTTP helper using native fetch (Node 18+) with timeout
async function apiCall(endpoint, body, method = 'POST') {
  const url = `${API_BASE}${endpoint}`;

  const headers = {
    'Content-Type': 'application/json'
  };

  // Include session cookie if we have one
  if (sessionCookie) {
    headers['Cookie'] = sessionCookie;
  }

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // Store session cookie from login response
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];  // Extract just the session cookie
    }

    const data = await response.json();
    return { status: response.status, data };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { status: 408, error: `Request timeout after ${API_TIMEOUT_MS / 1000}s` };
    }
    return { status: 500, error: error.message };
  }
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
  --session <id>   Load input from existing data/{id}/inputs/ files
  --auto           Auto-approve all checkpoints (for CI/testing)
  --help, -h       Show this help message

${color('EXAMPLES:', 'cyan')}
  # Interactive mode - gather input from prompts
  node scripts/e2e-walkthrough.js

  # Load from existing session
  node scripts/e2e-walkthrough.js --session 1221

  # Auto-approve everything (CI mode)
  node scripts/e2e-walkthrough.js --session 1221 --auto

${color('CHECKPOINTS:', 'cyan')}
  At each checkpoint you can:
  - [A]pprove - Continue with current data
  - [E]dit - Modify the data before continuing
  - [Q]uit - Exit the walkthrough

${color('NOTES:', 'cyan')}
  - Server must be running at ${API_BASE}
  - In interactive mode, you'll be prompted for raw session input
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

  return {
    sessionId,
    rawSessionInput: {
      roster,
      accusation,
      sessionReport,
      directorNotes
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
    console.log(`  Roster: ${response.sessionConfig.roster?.map(c => c.name).join(', ')}`);
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
  const analyses = response.photoAnalyses?.analyses || [];
  const roster = response.sessionConfig?.roster || [];

  console.log(color(`Photos to identify (${photos.length}):`, 'bright'));

  analyses.forEach((analysis, i) => {
    console.log(`\n  ${color(`Photo ${i + 1}:`, 'cyan')} ${photos[i] || 'unknown'}`);
    console.log(`  ${color('Visual:', 'dim')} ${analysis.visualContent?.substring(0, 100)}...`);
    console.log(`  ${color('People:', 'dim')} ${analysis.peopleDescriptions?.length || 0} detected`);
    analysis.peopleDescriptions?.forEach((desc, j) => {
      console.log(`    ${j + 1}. ${desc.substring(0, 80)}...`);
    });
  });

  console.log(color(`\nRoster: ${roster.map(c => c.name).join(', ')}`, 'bright'));

  if (AUTO_MODE) {
    console.log(color('\n[AUTO] Skipping character mapping...', 'yellow'));
    return { characterIds: {} };
  }

  const choice = await prompt('\n[A]pprove (skip mapping), [E]dit mappings, or [Q]uit? ');

  if (choice.toLowerCase() === 'q') {
    throw new Error('User quit');
  }

  if (choice.toLowerCase() === 'e') {
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

async function handleEvidenceBundle(response) {
  checkpointHeader('EVIDENCE_BUNDLE', response.currentPhase);

  const bundle = response.evidenceBundle || {};

  console.log(color('Evidence Bundle Summary:', 'bright'));
  console.log(`  Exposed Tokens: ${bundle.exposed?.tokens?.length || 0}`);
  console.log(`  Buried Transactions: ${bundle.buried?.transactions?.length || 0}`);
  console.log(`  Paper Evidence: ${bundle.paper?.length || 0}`);

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
    const indices = await prompt('Enter arc numbers to include (comma-separated): ');
    const selected = indices.split(',')
      .map(s => parseInt(s.trim()) - 1)
      .filter(i => i >= 0 && i < arcs.length)
      .map(i => arcs[i].id || arcs[i].title);

    if (selected.length === 0) {
      console.log(color('Must select at least one arc', 'red'));
      return handleArcSelection(response); // Retry
    }

    return { selectedArcs: selected };
  }

  return { selectedArcs: arcs.map(a => a.id || a.title) };
}

async function handleOutline(response) {
  checkpointHeader('OUTLINE', response.currentPhase);

  const outline = response.outline || {};

  console.log(color('Article Outline:', 'bright'));
  console.log(`  Headline: ${outline.headline || 'N/A'}`);
  console.log(`  Sections: ${outline.sections?.length || 0}`);

  if (outline.sections) {
    outline.sections.forEach((section, i) => {
      console.log(`\n  ${color(`Section ${i + 1}: ${section.title || section.type}`, 'cyan')}`);
      if (section.content) console.log(`    ${section.content.substring(0, 100)}...`);
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
  'evidence-bundle': handleEvidenceBundle,
  'arc-selection': handleArcSelection,
  'outline': handleOutline,
  'article': handleArticle
};

// ============================================================================
// Main Walkthrough Loop
// ============================================================================

async function runWalkthrough() {
  header('E2E Walkthrough');

  console.log(`Mode: ${AUTO_MODE ? color('AUTO', 'yellow') : color('INTERACTIVE', 'green')}`);
  console.log(`Server: ${API_BASE}`);
  console.log(`Theme: ${DEFAULT_THEME}\n`);

  // Authenticate first
  console.log(color('Authenticating...', 'dim'));
  const loggedIn = await login();
  if (!loggedIn) {
    throw new Error('Authentication failed');
  }

  // Gather or load input
  let inputData;
  if (SESSION_ID) {
    console.log(color(`Loading session: ${SESSION_ID}`, 'cyan'));
    inputData = await loadSessionInput(SESSION_ID);
  } else {
    inputData = await gatherRawInput();
  }

  const sessionId = inputData.sessionId || SESSION_ID;
  console.log(color(`\nSession ID: ${sessionId}`, 'bright'));

  // Build initial request
  let requestBody = {
    sessionId,
    theme: DEFAULT_THEME
  };

  // Add raw input if gathered
  if (inputData.rawSessionInput) {
    requestBody.rawSessionInput = inputData.rawSessionInput;
  }

  // Main loop
  let iteration = 0;
  const maxIterations = 20; // Safety limit

  while (iteration < maxIterations) {
    iteration++;

    console.log(color(`\n─── API Call #${iteration} ───`, 'dim'));
    console.log(color(`POST ${API_BASE}/api/generate`, 'dim'));

    const startTime = Date.now();
    const { status, data, error } = await apiCall('/api/generate', requestBody);
    const duration = Date.now() - startTime;

    console.log(color(`Response: ${status} (${duration}ms)`, status === 200 ? 'green' : 'red'));

    if (error) {
      console.error(color(`Error: ${error}`, 'red'));
      break;
    }

    if (status !== 200) {
      console.error(color(`API Error: ${data.error || JSON.stringify(data)}`, 'red'));
      break;
    }

    // Display current phase
    console.log(`Phase: ${color(data.currentPhase, 'cyan')}`);
    console.log(`Awaiting Approval: ${data.awaitingApproval}`);
    if (data.approvalType) {
      console.log(`Approval Type: ${color(data.approvalType, 'yellow')}`);
    }

    // Check for completion
    if (data.currentPhase === 'complete') {
      header('Pipeline Complete!');

      if (data.assembledHtml) {
        // Save HTML to file
        const outputDir = path.join(__dirname, '..', 'outputs');
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, `report-${sessionId}-${Date.now()}.html`);
        fs.writeFileSync(outputPath, data.assembledHtml);
        console.log(color(`HTML saved to: ${outputPath}`, 'green'));
        console.log(`Length: ${data.assembledHtml.length} characters`);
      }

      if (data.validationResults) {
        console.log(color('\nValidation Results:', 'bright'));
        console.log(`  Passed: ${data.validationResults.passed ? color('YES', 'green') : color('NO', 'red')}`);
        if (data.validationResults.issues) {
          console.log(`  Issues: ${data.validationResults.issues.length}`);
        }
      }

      break;
    }

    // Check for error phase
    if (data.currentPhase === 'error') {
      header('Pipeline Error');
      console.log(color('Errors:', 'red'));
      (data.errors || []).forEach(err => {
        console.log(`  - [${err.type}] ${err.message}`);
      });
      break;
    }

    // Handle checkpoint
    if (data.awaitingApproval && data.approvalType) {
      const handler = checkpointHandlers[data.approvalType];

      if (handler) {
        try {
          const approvals = await handler(data);

          // Build next request with approvals
          requestBody = {
            sessionId,
            theme: DEFAULT_THEME,
            approvals
          };
        } catch (err) {
          if (err.message === 'User quit') {
            console.log(color('\nWalkthrough cancelled by user.', 'yellow'));
            break;
          }
          throw err;
        }
      } else {
        console.log(color(`Unknown approval type: ${data.approvalType}`, 'red'));
        break;
      }
    } else {
      // No checkpoint, something unexpected
      console.log(color('Unexpected state - not awaiting approval but not complete', 'yellow'));
      prettyPrint(data);
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
  console.log(color('  Commit 8.9.7', 'dim'));
  console.log(color('═'.repeat(60), 'magenta'));

  createReadline();

  try {
    await runWalkthrough();
  } catch (error) {
    console.error(color(`\nFatal error: ${error.message}`, 'red'));
    console.error(error.stack);
    process.exit(1);
  } finally {
    rl.close();
  }

  console.log(color('\nWalkthrough complete.', 'green'));
  process.exit(0);
}

main();
