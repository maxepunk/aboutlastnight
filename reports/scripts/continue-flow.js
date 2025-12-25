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

    if (forceApprovalType === 'paper-evidence-selection' && statusData.paperEvidence) {
      approvals.selectedPaperEvidence = statusData.paperEvidence;
      console.log(`  Selecting ALL ${statusData.paperEvidence.length} paper evidence items`);
    } else if (forceApprovalType === 'arc-selection' && statusData.narrativeArcs) {
      approvals.selectedArcs = statusData.narrativeArcs.map(arc => arc.id);
      console.log(`  Selecting ALL ${statusData.narrativeArcs.length} narrative arcs`);
    } else {
      console.log('  Warning: Could not find items to select. Current state:', statusData.approvalType);
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

  console.log(`\nResponse (${elapsed}s):`);
  console.log('  Session ID:', data.sessionId);
  console.log('  Status:', res.status);
  console.log('  Phase:', data.currentPhase);
  console.log('  Awaiting Approval:', data.awaitingApproval);
  console.log('  Approval Type:', data.approvalType);

  if (data.error) {
    console.log('  Error:', data.error);
  }

  if (data.errors && data.errors.length > 0) {
    console.log('\n=== ERRORS ===');
    data.errors.forEach(e => console.log(`  [${e.type}] ${e.message}`));
  }

  // Show relevant data based on checkpoint
  if (data.approvalType === 'paper-evidence-selection' && data.paperEvidence) {
    console.log(`\n=== PAPER EVIDENCE (${data.paperEvidence.length} items) ===`);
    data.paperEvidence.slice(0, 5).forEach((e, i) => {
      console.log(`  ${i+1}. ${e.title || e.name || 'Untitled'}`);
    });
    if (data.paperEvidence.length > 5) {
      console.log(`  ... and ${data.paperEvidence.length - 5} more`);
    }
  }

  if (data.approvalType === 'character-ids' && data.photoAnalyses) {
    console.log(`\n=== PHOTO ANALYSES (${data.photoAnalyses.analyses?.length || 0} photos) ===`);
    data.photoAnalyses.analyses?.forEach((a, i) => {
      console.log(`\n  Photo ${i+1}: ${a.filename || 'unknown'}`);
      console.log(`    Visual: ${a.visualContent?.substring(0, 80)}...`);
      console.log(`    People: ${a.characterDescriptions?.length || 0} detected`);
    });
  }

  if (data.approvalType === 'evidence-bundle' && data.evidenceBundle) {
    console.log('\n=== EVIDENCE BUNDLE ===');
    console.log(`  Exposed: ${data.evidenceBundle.exposed?.length || 0} items`);
    console.log(`  Buried: ${data.evidenceBundle.buried?.length || 0} items`);
    console.log(`  Context: ${data.evidenceBundle.context?.length || 0} items`);
  }

  if (data.approvalType === 'arc-selection' && data.narrativeArcs) {
    console.log(`\n=== NARRATIVE ARCS (${data.narrativeArcs.length}) ===`);
    data.narrativeArcs.forEach((arc, i) => {
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
