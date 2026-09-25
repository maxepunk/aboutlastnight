/**
 * Pass/fail rules for the SDK probe scripts (brief 2.0 gate). Pure, so the rules are
 * unit-tested without a model call (__tests__/unit/scripts/probe-verdicts.test.js).
 *
 *   scripts/probe-sdk-isolation.js         -> isolationVerdict
 *   scripts/probe-content-bundle-channel.js -> channelVerdict
 *
 * servedModelMatches lives in lib/llm/sdk-fields.js, because the wrapper uses it too;
 * scripts/check-model-freshness.js imports it from there.
 */
'use strict';

const { hasMemoryPaths, servedModelMatches } = require('../../lib/llm/sdk-fields');

// Aliases the wrapper sends adaptive thinking with display 'summarized' (client.js).
const THINKING_ALIASES = new Set(['opus', 'sonnet']);

// A leaked tool set can run to a hundred MCP tools; the first names say which servers leaked.
const MAX_TOOL_NAMES = 25;

/**
 * @param {string[]|undefined} names - init.toolNames as forwarded
 * @returns {string} ': a, b, c' (capped), or '' when the init named none
 */
function toolNameList(names) {
  if (!Array.isArray(names) || names.length === 0) return '';
  const shown = names.slice(0, MAX_TOOL_NAMES).join(', ');
  const more = names.length > MAX_TOOL_NAMES ? ` and ${names.length - MAX_TOOL_NAMES} more` : '';
  return `: ${shown}${more}`;
}

/**
 * The isolation probe's verdict for one pipeline-shaped call.
 *
 * Fails when: the call failed; no init frame arrived (nothing verified); an init reports
 * more than one tool (the failure names them), or does not report its tools; any memory
 * path loaded; no readable thinking text streamed on Opus or Sonnet; the result named no
 * served model; or any served model is not the pinned id.
 *
 * @param {Object} obs
 * @param {string} obs.alias - 'opus' | 'sonnet' | 'haiku'
 * @param {string} obs.pinnedId - MODEL_IDS[alias]
 * @param {Object[]} [obs.inits] - every forwarded `init` (per-turn frames can repeat)
 * @param {number} [obs.thinkingChars] - total deltaText of llm_delta phase 'thinking'
 * @param {string[]|null} [obs.servedModels] - from llm_complete / llm_error
 * @param {string|null} [obs.error] - the thrown message, if the call failed
 * @returns {{ok: boolean, failures: string[]}}
 */
function isolationVerdict({ alias, pinnedId, inits = [], thinkingChars = 0, servedModels = null, error = null }) {
  const failures = new Set();
  if (error) failures.add(`call failed: ${error}`);
  if (inits.length === 0) failures.add('no init frame arrived, so the tool count and memory paths are unverified');
  for (const init of inits) {
    if (typeof init.toolCount !== 'number') failures.add('an init frame did not report its tools');
    else if (init.toolCount > 1) {
      failures.add(`init reported ${init.toolCount} tools (a pipeline call has 0 or 1)${toolNameList(init.toolNames)}`);
    }
    if (hasMemoryPaths(init.memoryPaths)) failures.add(`memory loaded into the call: ${JSON.stringify(init.memoryPaths)}`);
  }
  if (THINKING_ALIASES.has(alias) && !(thinkingChars > 0)) {
    failures.add('no readable thinking text streamed (display "summarized" not honoured, or no thinking)');
  }
  if (!Array.isArray(servedModels) || servedModels.length === 0) {
    failures.add('the result named no served model (no modelUsage)');
  } else {
    const off = servedModels.filter((m) => !servedModelMatches(m, pinnedId));
    if (off.length > 0) failures.add(`served by ${off.join(', ')}, not ${pinnedId}`);
  }
  return { ok: failures.size === 0, failures: [...failures] };
}

/**
 * The content-bundle probe's verdict: structured output must arrive through the SDK
 * channel. The text fallback fails, and so does a failed call.
 *
 * @param {{channel?: string|null, error?: string|null}} obs
 * @returns {{ok: boolean, failures: string[]}}
 */
function channelVerdict({ channel = null, error = null } = {}) {
  if (error) return { ok: false, failures: [`call failed: ${error}`] };
  if (channel === 'structured_output') return { ok: true, failures: [] };
  if (channel === 'text_fallback') {
    return { ok: false, failures: ['structured output arrived through the text fallback, not the SDK channel'] };
  }
  return { ok: false, failures: [`no structured-output channel reported (channel=${channel})`] };
}

module.exports = { isolationVerdict, channelVerdict, THINKING_ALIASES };
