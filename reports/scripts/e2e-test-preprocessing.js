#!/usr/bin/env node
/**
 * E2E Test for Preprocessing Pipeline (Commit 8.5)
 *
 * Tests the preprocessing phase against real 20251221 session data.
 * Validates that batch processing works correctly with actual tokens.
 *
 * Usage:
 *   node scripts/e2e-test-preprocessing.js
 *   node scripts/e2e-test-preprocessing.js --mock  # Use mocks (no Claude calls)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const { createReportGraph } = require('../lib/workflow/graph');
const { createMockClaudeClient, createMockPromptBuilder } = require('../lib/workflow/nodes/ai-nodes');
const { createMockPreprocessor } = require('../lib/evidence-preprocessor');

const SESSION_ID = '20251221';
const DATA_DIR = path.join(__dirname, '..', 'data', SESSION_ID);

// Check if using mocks
const USE_MOCKS = process.argv.includes('--mock');

async function loadSessionData() {
  console.log(`📂 Loading session data from ${DATA_DIR}...\n`);

  const directorNotes = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'inputs', 'director-notes.json'), 'utf8')
  );

  const sessionConfig = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'inputs', 'session-config.json'), 'utf8')
  );

  const tokens = JSON.parse(
    fs.readFileSync(path.join(DATA_DIR, 'fetched', 'tokens.json'), 'utf8')
  );

  let paperEvidence = [];
  try {
    paperEvidence = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, 'fetched', 'paper-evidence.json'), 'utf8')
    );
  } catch (e) {
    console.log('  ⚠️ No paper-evidence.json found, continuing without it');
  }

  console.log(`  ✅ Director notes loaded (playerFocus: ${directorNotes.playerFocus?.primaryInvestigation?.substring(0, 50)}...)`);
  console.log(`  ✅ Session config loaded (roster: ${sessionConfig.roster?.length || 0} players)`);
  console.log(`  ✅ ${tokens.length} memory tokens loaded`);
  console.log(`  ✅ ${paperEvidence.length} paper evidence items loaded`);

  return { directorNotes, sessionConfig, tokens, paperEvidence };
}

async function runPreprocessingTest(sessionData) {
  console.log('\n🚀 Running preprocessing pipeline...\n');

  const { directorNotes, sessionConfig, tokens, paperEvidence } = sessionData;

  // Create graph
  const graph = createReportGraph();

  // Build config - sessionId is required for initializeSession node
  const config = {
    configurable: {
      thread_id: `e2e-test-${SESSION_ID}-${Date.now()}`,
      sessionId: SESSION_ID,
      theme: 'journalist'
    }
  };

  // Add mocks if requested
  if (USE_MOCKS) {
    console.log('  📦 Using MOCK preprocessor (no Claude calls)\n');
    config.configurable.useMockPreprocessor = true;
    config.configurable.sdkClient = createMockClaudeClient();
    config.configurable.promptBuilder = createMockPromptBuilder();
  } else {
    console.log('  🔥 Using REAL Claude calls\n');
  }

  // Build initial state
  const initialState = {
    sessionId: SESSION_ID,
    theme: 'journalist',
    directorNotes,
    sessionConfig,
    playerFocus: directorNotes.playerFocus || {},
    memoryTokens: tokens,
    paperEvidence: paperEvidence || []
  };

  console.log('📊 Initial State:');
  console.log(`  - sessionId: ${initialState.sessionId}`);
  console.log(`  - theme: ${initialState.theme}`);
  console.log(`  - memoryTokens: ${initialState.memoryTokens.length}`);
  console.log(`  - paperEvidence: ${initialState.paperEvidence.length}`);
  console.log(`  - playerFocus.primaryInvestigation: ${initialState.playerFocus.primaryInvestigation?.substring(0, 50)}...`);
  console.log();

  // Run the graph
  const startTime = Date.now();
  console.log('⏳ Invoking graph...\n');

  try {
    const result = await graph.invoke(initialState, config);
    const duration = Date.now() - startTime;

    console.log('\n✅ Pipeline completed successfully!\n');
    console.log('📊 Final State:');
    console.log(`  - currentPhase: ${result.currentPhase}`);
    console.log(`  - awaitingApproval: ${result.awaitingApproval}`);
    console.log(`  - approvalType: ${result.approvalType}`);

    if (result.preprocessedEvidence) {
      console.log('\n📦 Preprocessed Evidence:');
      console.log(`  - items: ${result.preprocessedEvidence.items?.length || 0}`);
      console.log(`  - processingTime: ${result.preprocessedEvidence.stats?.processingTimeMs}ms`);
      console.log(`  - significanceCounts: ${JSON.stringify(result.preprocessedEvidence.stats?.significanceCounts)}`);

      // Show first few items
      const preview = result.preprocessedEvidence.items?.slice(0, 3);
      if (preview?.length > 0) {
        console.log('\n  First 3 items:');
        preview.forEach((item, i) => {
          console.log(`    ${i + 1}. [${item.significance}] ${item.summary?.substring(0, 60)}...`);
        });
      }
    }

    if (result.evidenceBundle) {
      console.log('\n📚 Evidence Bundle:');
      console.log(`  - exposed.tokens: ${result.evidenceBundle.exposed?.tokens?.length || 0}`);
      console.log(`  - buried.transactions: ${result.evidenceBundle.buried?.transactions?.length || 0}`);
    }

    if (result.errors?.length > 0) {
      console.log('\n⚠️ Errors:');
      result.errors.forEach(err => {
        console.log(`  - [${err.phase}] ${err.type}: ${err.message}`);
      });
    }

    console.log(`\n⏱️ Total duration: ${duration}ms`);

    return { success: true, result, duration };

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('\n❌ Pipeline failed:', error.message);
    console.error('Stack:', error.stack);
    return { success: false, error, duration };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  E2E TEST: Preprocessing Pipeline (Commit 8.5)');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Load session data
    const sessionData = await loadSessionData();

    // Run preprocessing test
    const result = await runPreprocessingTest(sessionData);

    if (result.success) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('  ✅ E2E TEST PASSED');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(0);
    } else {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('  ❌ E2E TEST FAILED');
      console.log('═══════════════════════════════════════════════════════════\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Setup error:', error.message);
    process.exit(1);
  }
}

main();
