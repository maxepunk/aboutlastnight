#!/usr/bin/env node
/**
 * Continue the workflow from the current checkpoint
 * Usage: node scripts/continue-flow.js <sessionId> [approvalType] [inputFile]
 *
 * For character-ids-raw, inputFile should contain natural language character mappings
 */
require('dotenv').config();
const fs = require('fs');

const sessionId = process.argv[2];
const forceApprovalType = process.argv[3];
const inputFile = process.argv[4];  // Optional file for natural language input

if (!sessionId) {
  console.log('Usage: node scripts/continue-flow.js <sessionId> [approvalType] [inputFile]');
  console.log('Examples:');
  console.log('  node scripts/continue-flow.js test-123 input-review');
  console.log('  node scripts/continue-flow.js test-123 character-ids-raw mappings.txt');
  process.exit(1);
}

async function main() {
  const password = process.env.ACCESS_PASSWORD;

  // Login
  console.log('Logging in...');
  const loginRes = await fetch('http://localhost:3001/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  console.log('Login status:', loginRes.status);

  // Build approvals based on current checkpoint
  let approvals = {};

  // For character-ids-raw, read natural language input from file
  if (forceApprovalType === 'character-ids-raw') {
    if (!inputFile) {
      console.error('Error: character-ids-raw requires an input file');
      console.log('Usage: node scripts/continue-flow.js <sessionId> character-ids-raw <inputFile>');
      process.exit(1);
    }
    try {
      const rawInput = fs.readFileSync(inputFile, 'utf8');
      approvals.characterIdsRaw = rawInput;
      console.log(`\nLoaded character ID mappings from ${inputFile} (${rawInput.length} chars)`);
    } catch (readError) {
      console.error(`Error reading input file: ${readError.message}`);
      process.exit(1);
    }
  }

  // For paper-evidence-selection and arc-selection, we need to first fetch current state
  // to get the available items before selecting them all
  if (forceApprovalType === 'paper-evidence-selection' || forceApprovalType === 'arc-selection') {
    console.log(`\nFetching current state for ${forceApprovalType}...`);
    const statusRes = await fetch('http://localhost:3001/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
      body: JSON.stringify({ sessionId, theme: 'journalist', approvals: {} })
    });
    const statusData = await statusRes.json();
    // NEW FORMAT: Data is inside checkpoint object
    const statusCheckpoint = statusData.checkpoint || {};

    if (forceApprovalType === 'paper-evidence-selection' && statusCheckpoint.paperEvidence) {
      approvals.selectedPaperEvidence = statusCheckpoint.paperEvidence;
      console.log(`  Selecting ALL ${statusCheckpoint.paperEvidence.length} paper evidence items`);
    } else if (forceApprovalType === 'arc-selection' && statusCheckpoint.narrativeArcs) {
      approvals.selectedArcs = statusCheckpoint.narrativeArcs.map(arc => arc.id);
      console.log(`  Selecting ALL ${statusCheckpoint.narrativeArcs.length} narrative arcs`);
    } else {
      console.log('  Warning: Could not find items to select. Current state:', statusCheckpoint.type);
    }
  }

  // Map of approval types to their approval flags
  const approvalMap = {
    'input-review': () => { approvals.inputReview = true; },
    'paper-evidence-selection': () => { /* Handled above */ },
    'character-ids': () => { approvals.characterIds = {}; }, // Empty = skip mapping (use for quick pass)
    'character-ids-raw': () => { /* Handled above - use 4th arg for natural language input */ },
    'evidence-bundle': () => { approvals.evidenceBundle = true; },
    'arc-selection': () => { /* Handled above */ },
    'outline': () => { approvals.outline = true; },
    'article': () => { approvals.article = true; }
  };

  if (forceApprovalType && approvalMap[forceApprovalType]) {
    approvalMap[forceApprovalType]();
    console.log(`\nForcing approval for: ${forceApprovalType}`);
  } else if (!forceApprovalType) {
    // Default: approve input-review
    approvals.inputReview = true;
    console.log('\nApproving input-review by default');
  }

  // Call API
  console.log(`\nCalling /api/generate for session ${sessionId}...`);
  const startTime = Date.now();

  const res = await fetch('http://localhost:3001/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie },
    body: JSON.stringify({
      sessionId,
      theme: 'journalist',
      approvals
    })
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const data = await res.json();

  // NEW FORMAT: Extract checkpoint data once (DRY)
  const checkpoint = data.checkpoint || {};
  const checkpointType = checkpoint.type || null;

  console.log(`\nResponse (${elapsed}s):`);
  console.log('  Session ID:', data.sessionId);
  console.log('  Status:', res.status);
  console.log('  Phase:', data.currentPhase);
  console.log('  Interrupted:', data.interrupted || false);
  console.log('  Checkpoint Type:', checkpointType);

  if (data.error) {
    console.log('  Error:', data.error);
  }

  if (data.errors && data.errors.length > 0) {
    console.log('\n=== ERRORS ===');
    data.errors.forEach(e => console.log(`  [${e.type}] ${e.message}`));
  }

  // Show relevant data based on checkpoint (data now in checkpoint object)
  if (checkpointType === 'paper-evidence-selection' && checkpoint.paperEvidence) {
    console.log(`\n=== PAPER EVIDENCE (${checkpoint.paperEvidence.length} items) ===`);
    checkpoint.paperEvidence.slice(0, 5).forEach((e, i) => {
      console.log(`  ${i+1}. ${e.title || e.name || 'Untitled'}`);
    });
    if (checkpoint.paperEvidence.length > 5) {
      console.log(`  ... and ${checkpoint.paperEvidence.length - 5} more`);
    }
  }

  if (checkpointType === 'character-ids' && checkpoint.photoAnalyses) {
    console.log(`\n=== PHOTO ANALYSES (${checkpoint.photoAnalyses.analyses?.length || 0} photos) ===`);
    checkpoint.photoAnalyses.analyses?.forEach((a, i) => {
      console.log(`\n  Photo ${i+1}: ${a.filename || 'unknown'}`);
      console.log(`    Visual: ${a.visualContent?.substring(0, 80)}...`);
      console.log(`    People: ${a.characterDescriptions?.length || 0} detected`);
    });
  }

  if (checkpointType === 'evidence-and-photos' && checkpoint.evidenceBundle) {
    console.log('\n=== EVIDENCE BUNDLE ===');
    console.log(`  Exposed: ${checkpoint.evidenceBundle.exposed?.length || 0} items`);
    console.log(`  Buried: ${checkpoint.evidenceBundle.buried?.length || 0} items`);
    console.log(`  Context: ${checkpoint.evidenceBundle.context?.length || 0} items`);
  }

  if (checkpointType === 'arc-selection' && checkpoint.narrativeArcs) {
    console.log(`\n=== NARRATIVE ARCS (${checkpoint.narrativeArcs.length}) ===`);
    checkpoint.narrativeArcs.forEach((arc, i) => {
      console.log(`\n  ${i+1}. ${arc.title}`);
      console.log(`     Summary: ${arc.summary?.substring(0, 100)}...`);
      console.log(`     Emphasis: ${arc.playerEmphasis}, Relevance: ${arc.storyRelevance}`);
    });
  }

  // Full output for debugging
  console.log('\n=== FULL RESPONSE ===');
  console.log(JSON.stringify(data, null, 2));
}

main().catch(e => {
  console.error('Error:', e.message);
  console.error(e.stack);
  process.exit(1);
});
