/**
 * Model Freshness Check
 *
 * Validates that our MODEL_IDS map in client.js points to the latest
 * Claude models. This script cannot run inside Jest because the Agent SDK
 * requires a full Node runtime with subprocess transport.
 *
 * Run manually: node scripts/check-model-freshness.js
 *
 * When this script warns about stale models, update MODEL_IDS in
 * lib/llm/client.js.
 */

// Guard: only execute the live-SDK check when run directly (not when required).
// Keeps `require('./scripts/check-model-freshness')` from triggering SDK calls.
if (require.main === module) {
  const { query } = require('@anthropic-ai/claude-agent-sdk');
  const { MODEL_IDS } = require('../lib/llm/client');

  (async () => {
    console.log('Verifying MODEL_IDS against live Agent SDK...\n');

    for (const [shorthand, expectedId] of Object.entries(MODEL_IDS)) {
      let resolvedModel = null;
      // The 1M context beta is requested for everything except haiku (matches
      // client.js). The SDK does NOT echo requested betas back in the init
      // message, so we report what was REQUESTED, not what init claims —
      // reading msg.betas always yields undefined and would mislabel every
      // model as 200K. (Whether the window is active is verified at the API
      // layer, not here; this script only checks model-ID resolution.)
      const requested1m = shorthand !== 'haiku';

      try {
        for await (const msg of query({
          prompt: 'Reply with OK',
          options: {
            model: expectedId,
            betas: requested1m ? ['context-1m-2025-08-07'] : undefined,
            tools: [],
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
            maxTurns: 1
          }
        })) {
          if (msg.type === 'system' && msg.subtype === 'init') {
            resolvedModel = msg.model;
          }
          if (msg.type === 'result') break;
        }

        const status = resolvedModel === expectedId ? '✓' : '✗';
        const betaStatus = requested1m ? '1M requested' : '200K';
        console.log(`  ${status} ${shorthand}: ${expectedId} → ${resolvedModel} (${betaStatus})`);

        if (resolvedModel !== expectedId) {
          console.error(`    ⚠️  MODEL_IDS.${shorthand} may need updating!`);
        }
      } catch (err) {
        console.error(`  ✗ ${shorthand}: ${expectedId} → ERROR: ${err.message}`);
      }
    }

    console.log('\nDone. If any models show ✗, update MODEL_IDS in lib/llm/client.js');
  })().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}
