/**
 * SDK isolation probe (phase 2, brief 2.0 gate).
 *
 * LIVE: makes one pipeline-shaped model call per alias through the wrapper
 * (lib/llm/client.js sdkQueryImpl), so every option the pipeline sends is the one under
 * test: isolation (mcpServers {}, strictMcpConfig, settingSources [], the env with
 * CLAUDE_CODE_DISABLE_AUTO_MEMORY), tools, effort, thinking display, betas and the
 * pinned model id.
 *
 * Exits non-zero when any call (see scripts/lib/probe-verdicts.js isolationVerdict):
 *   - reports more than one tool at init (or no init at all);
 *   - loads any memory path;
 *   - streams no readable thinking text (Opus and Sonnet);
 *   - is served by anything other than the pinned id (result modelUsage);
 *   - fails.
 *
 * Usage:
 *   node scripts/probe-sdk-isolation.js                  # opus, sonnet, haiku
 *   node scripts/probe-sdk-isolation.js --model opus     # one or a comma list
 *
 * Requiring this file makes no call (require.main guard).
 */
'use strict';

const { isolationVerdict } = require('./lib/probe-verdicts');

// The call shapes the pipeline uses (pinned at the call sites by lib/__tests__/sdk-tool-gating.test.js):
// every Opus call and the Sonnet text calls run with no tools; the image calls (Haiku photo
// analysis, the Sonnet whiteboard) run with Read only. Haiku carries the one-tool shape here.
const PROBE_CALLS = {
  opus: { model: 'opus', disableTools: true },
  sonnet: { model: 'sonnet', disableTools: true },
  haiku: { model: 'haiku', tools: ['Read'], allowedTools: ['Read'] }
};

const PROBE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['account', 'total'],
  properties: {
    account: { type: 'string' },
    total: { type: 'number' }
  }
};

const SYSTEM_PROMPT =
  'You check money flows for an evidence-review pipeline. Answer only from the entries given. ' +
  'Do not use any tools: everything you need is in the message.';

// Small enough to be cheap, with one trap (a reversal), so an adaptive thinker has a
// reason to think. Expected answer: Ember Trust, 5250.
const USER_PROMPT = [
  'Transfers recorded during a party, in order:',
  '1. 12:04 Cascade Holdings received $4,200',
  '2. 12:11 Ember Trust received $1,750',
  '3. 12:19 Cascade Holdings received $900',
  '4. 12:26 Ember Trust received $3,100',
  '5. 12:31 the 12:19 transfer to Cascade Holdings was reversed',
  '6. 12:40 Lantern LLC received $5,050',
  '7. 12:47 Ember Trust received $400',
  '',
  'Which account holds the most money after all seven entries, and how much? Work it through before you answer.'
].join('\n');

/**
 * Run one probe call and judge it.
 *
 * @param {string} alias - a PROBE_CALLS key
 * @param {Object} deps
 * @param {Function} deps.sdkQuery - sdkQueryImpl (injected so tests can drive the Jest SDK mock)
 * @param {Object} deps.modelIds - MODEL_IDS
 * @returns {Promise<{obs: Object, verdict: {ok: boolean, failures: string[]}}>}
 */
async function probeOne(alias, { sdkQuery, modelIds }) {
  const obs = {
    alias,
    pinnedId: modelIds[alias],
    inits: [],
    thinkingChars: 0,
    servedModels: null,
    channel: null,
    durationApiMs: null,
    elapsed: null,
    answer: null,
    error: null
  };
  try {
    obs.answer = await sdkQuery({
      ...PROBE_CALLS[alias],
      prompt: USER_PROMPT,
      systemPrompt: SYSTEM_PROMPT,
      jsonSchema: PROBE_SCHEMA,
      label: `isolation probe (${alias})`,
      onProgress: (e) => {
        if (e.type === 'system' && e.subtype === 'init' && e.init) obs.inits.push(e.init);
        if (e.type === 'llm_delta' && e.phase === 'thinking') obs.thinkingChars += (e.deltaText || '').length;
        if (e.type === 'llm_complete' || e.type === 'llm_error') {
          obs.servedModels = e.servedModels ?? null;
          obs.channel = e.channel ?? null;
          obs.durationApiMs = e.durationApiMs ?? null;
          obs.elapsed = e.elapsed ?? null;
        }
      }
    });
  } catch (err) {
    obs.error = err && err.message ? err.message : String(err);
  }
  return { obs, verdict: isolationVerdict(obs) };
}

/**
 * @param {string[]} argv
 * @returns {string[]} aliases to probe
 * @throws on an unknown alias
 */
function parseModels(argv) {
  const i = argv.indexOf('--model');
  if (i === -1) return Object.keys(PROBE_CALLS);
  const list = String(argv[i + 1] || '').split(',').map((s) => s.trim()).filter(Boolean);
  const unknown = list.filter((a) => !PROBE_CALLS[a]);
  if (list.length === 0 || unknown.length > 0) {
    throw new Error(`--model takes a comma list of ${Object.keys(PROBE_CALLS).join(', ')}; got "${argv[i + 1] || ''}"`);
  }
  return list;
}

function report({ obs, verdict }) {
  const lines = [`[${obs.alias}] ${obs.pinnedId}  ${verdict.ok ? 'PASS' : 'FAIL'}` +
    `  (elapsed ${obs.elapsed ?? '?'}s, api ${obs.durationApiMs != null ? (obs.durationApiMs / 1000).toFixed(1) : '?'}s)`];
  obs.inits.forEach((init, n) => {
    lines.push(`  init ${n + 1}: model=${init.model} tools=${init.toolCount} permissionMode=${init.permissionMode}` +
      ` effort=${init.effort ?? 'absent'} betas=${JSON.stringify(init.betas ?? null)}` +
      ` memory_paths=${init.memoryPaths === undefined ? 'absent' : JSON.stringify(init.memoryPaths)}`);
  });
  lines.push(`  thinking: ${obs.thinkingChars} chars streamed`);
  lines.push(`  served: ${JSON.stringify(obs.servedModels)}   channel: ${obs.channel}`);
  lines.push(`  answer: ${JSON.stringify(obs.answer)}`);
  verdict.failures.forEach((f) => lines.push(`  x ${f}`));
  return lines.join('\n');
}

async function main(argv = process.argv.slice(2)) {
  let aliases;
  try {
    aliases = parseModels(argv);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 2;
    return;
  }
  const { sdkQueryImpl, MODEL_IDS } = require('../lib/llm/client');
  console.log(`SDK isolation probe: ${aliases.join(', ')} (one live call each, sequential)\n`);
  let failed = 0;
  for (const alias of aliases) {
    const result = await probeOne(alias, { sdkQuery: sdkQueryImpl, modelIds: MODEL_IDS });
    console.log(report(result) + '\n');
    if (!result.verdict.ok) failed++;
  }
  console.log(failed === 0 ? 'All probe calls passed.' : `${failed} of ${aliases.length} probe calls failed.`);
  process.exitCode = failed === 0 ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Probe crashed:', err);
    process.exit(1);
  });
}

module.exports = { PROBE_CALLS, PROBE_SCHEMA, probeOne, parseModels, report, main };
