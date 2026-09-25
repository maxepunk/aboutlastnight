/**
 * Model Freshness Check
 *
 * Validates that MODEL_IDS in lib/llm/client.js resolve to the models they name.
 * This script cannot run inside Jest because the Agent SDK requires a full Node
 * runtime with subprocess transport.
 *
 * LIVE: one short call per MODEL_IDS entry. Each call goes through the wrapper
 * (sdkQueryImpl), so it carries exactly the options every pipeline call does:
 * the isolation options (mcpServers {}, strictMcpConfig, settingSources [], the env
 * with CLAUDE_CODE_DISABLE_AUTO_MEMORY), no tools, the betas, thinking and effort.
 * Before phase 2 it called the SDK directly without the isolation options.
 *
 * For each alias it reports the model init names and the model(s) the result's
 * modelUsage says served the call. It exits 1 when any alias misses its id or fails.
 *
 * Run manually: node scripts/check-model-freshness.js
 *
 * When this script reports a mismatch, update MODEL_IDS in lib/llm/client.js.
 */

const { servedModelMatches } = require('./lib/probe-verdicts');

/**
 * @param {string} alias
 * @param {string} expectedId
 * @param {{sdkQuery: Function}} deps - sdkQueryImpl (injected for tests)
 * @returns {Promise<{ok: boolean, initModel: string|null, betas: string[]|null, servedModels: string[]|null, error: string|null}>}
 */
async function checkModel(alias, expectedId, { sdkQuery }) {
  const out = { ok: false, initModel: null, betas: null, servedModels: null, error: null };
  try {
    await sdkQuery({
      prompt: 'Reply with OK',
      model: alias,
      disableTools: true,
      label: `model freshness (${alias})`,
      onProgress: (e) => {
        if (e.type === 'system' && e.subtype === 'init' && e.init && out.initModel === null) {
          out.initModel = e.init.model ?? null;
          out.betas = e.init.betas ?? null;
        }
        if (e.type === 'llm_complete' || e.type === 'llm_error') out.servedModels = e.servedModels ?? null;
      }
    });
  } catch (err) {
    out.error = err && err.message ? err.message : String(err);
  }
  out.ok = !out.error &&
    out.initModel === expectedId &&
    Array.isArray(out.servedModels) && out.servedModels.length > 0 &&
    out.servedModels.every((m) => servedModelMatches(m, expectedId));
  return out;
}

async function main() {
  const { sdkQueryImpl, MODEL_IDS } = require('../lib/llm/client');
  console.log('Verifying MODEL_IDS against the live Agent SDK, through the pipeline wrapper...\n');

  let failures = 0;
  for (const [alias, expectedId] of Object.entries(MODEL_IDS)) {
    const r = await checkModel(alias, expectedId, { sdkQuery: sdkQueryImpl });
    if (r.error) {
      console.error(`  ✗ ${alias}: ${expectedId} → ERROR: ${r.error}`);
    } else {
      // init.betas is printed as reported: whether the CLI echoes requested betas there
      // is what this line shows (an older comment here said it never does).
      console.log(`  ${r.ok ? '✓' : '✗'} ${alias}: ${expectedId} → init ${r.initModel}, served ${JSON.stringify(r.servedModels)}, init betas ${JSON.stringify(r.betas)}`);
      if (!r.ok) console.error(`    ⚠️  MODEL_IDS.${alias} may need updating!`);
    }
    if (!r.ok) failures++;
  }

  console.log(failures === 0 ? '\nDone. Every alias resolves to its pinned id.' : '\nDone. Update MODEL_IDS in lib/llm/client.js for every ✗.');
  process.exitCode = failures === 0 ? 0 : 1;
}

// Guard: only execute the live-SDK check when run directly (not when required).
// Keeps `require('./scripts/check-model-freshness')` from triggering SDK calls.
if (require.main === module) {
  main().catch((e) => {
    console.error('Fatal error:', e.message);
    process.exit(1);
  });
}

module.exports = { checkModel };
