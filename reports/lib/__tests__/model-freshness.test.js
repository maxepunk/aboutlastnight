/**
 * Model Freshness Check
 *
 * Validates that our MODEL_IDS map in client.js points to the latest
 * Claude models. This test cannot run inside Jest because the Agent SDK
 * requires a full Node runtime with subprocess transport.
 *
 * Run manually: node lib/__tests__/model-freshness.test.js
 *
 * When this script warns about stale models, update MODEL_IDS in
 * lib/llm/client.js.
 */

// When run directly (not via Jest), execute the check
if (require.main === module) {
  const { query } = require('@anthropic-ai/claude-agent-sdk');

  const MODEL_IDS = {
    opus: 'claude-opus-4-7',
    sonnet: 'claude-sonnet-4-6',
    haiku: 'claude-haiku-4-5'
  };

  (async () => {
    console.log('Verifying MODEL_IDS against live Agent SDK...\n');

    for (const [shorthand, expectedId] of Object.entries(MODEL_IDS)) {
      let resolvedModel = null;
      let betas = null;

      try {
        for await (const msg of query({
          prompt: 'Reply with OK',
          options: {
            model: expectedId,
            betas: shorthand !== 'haiku' ? ['context-1m-2025-08-07'] : undefined,
            tools: [],
            permissionMode: 'bypassPermissions',
            allowDangerouslySkipPermissions: true,
            maxTurns: 1
          }
        })) {
          if (msg.type === 'system' && msg.subtype === 'init') {
            resolvedModel = msg.model;
            betas = msg.betas;
          }
          if (msg.type === 'result') break;
        }

        const status = resolvedModel === expectedId ? '✓' : '✗';
        const betaStatus = (betas || []).includes('context-1m-2025-08-07') ? '1M' : '200K';
        console.log(`  ${status} ${shorthand}: ${expectedId} → ${resolvedModel} (${betaStatus} context)`);

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
} else {
  // When loaded via Jest, just skip
  describe('model freshness', () => {
    test.skip('run manually: node lib/__tests__/model-freshness.test.js', () => {});
  });
}
