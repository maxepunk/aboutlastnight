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

// The CLI's own structured-output tool. CLI 2.1.282 lists it at init whenever the call
// has a schema: at the live gate on 2026-09-25 an Opus call with disableTools and a
// schema reported exactly this one tool, and a Haiku image call (tools ['Read'] and a
// schema) reported Read and this. The 2026-09-19 probes on the old CLI did not count it.
const STRUCTURED_OUTPUT_TOOL = 'StructuredOutput';

// A leaked tool set can run to a hundred MCP tools; the first names say which servers leaked.
const MAX_TOOL_NAMES = 25;

/**
 * @param {string[]} names
 * @returns {string} 'a, b, c' (capped at MAX_TOOL_NAMES), or 'none'
 */
function formatToolNames(names) {
  if (!Array.isArray(names) || names.length === 0) return 'none';
  const shown = names.slice(0, MAX_TOOL_NAMES).join(', ');
  const more = names.length > MAX_TOOL_NAMES ? ` and ${names.length - MAX_TOOL_NAMES} more` : '';
  return `${shown}${more}`;
}

/**
 * The tool set a wrapper call declares (lib/llm/client.js): `disableTools` wins and means
 * none; otherwise `tools`. null when the call declares neither, which runs it with the
 * SDK's full default set.
 *
 * @param {{disableTools?: boolean, tools?: string[]}} call - sdkQueryImpl options
 * @returns {string[]|null}
 */
function declaredToolsOf(call) {
  if (call && call.disableTools) return [];
  return call && Array.isArray(call.tools) ? call.tools.map(String) : null;
}

/**
 * The tool names an init frame must report for a call: exactly the declared tools, plus
 * the CLI's StructuredOutput when the call has a schema.
 *
 * @param {string[]} declaredTools
 * @param {boolean} hasSchema
 * @returns {string[]}
 */
function expectedInitTools(declaredTools, hasSchema) {
  const expected = [...new Set(declaredTools)];
  if (hasSchema && !expected.includes(STRUCTURED_OUTPUT_TOOL)) expected.push(STRUCTURED_OUTPUT_TOOL);
  return expected;
}

/**
 * The isolation probe's verdict for one pipeline-shaped call.
 *
 * Fails when: the call failed; the call declared no tool set; no init frame arrived
 * (nothing verified); an init's tool names are not exactly the declared tools plus
 * StructuredOutput when the call has a schema (every undeclared and every missing tool is
 * named), or the init does not report its tools; any memory path loaded; no readable
 * thinking text streamed on Opus or Sonnet; the result named no served model; or any
 * served model is not the pinned id.
 *
 * @param {Object} obs
 * @param {string} obs.alias - 'opus' | 'sonnet' | 'haiku'
 * @param {string} obs.pinnedId - MODEL_IDS[alias]
 * @param {string[]|null} obs.declaredTools - declaredToolsOf(the call's options)
 * @param {boolean} [obs.hasSchema] - the call passed a jsonSchema
 * @param {Object[]} [obs.inits] - every forwarded `init` (per-turn frames can repeat)
 * @param {number} [obs.thinkingChars] - total deltaText of llm_delta phase 'thinking'
 * @param {string[]|null} [obs.servedModels] - from llm_complete / llm_error (result modelUsage)
 * @param {string[]|null} [obs.answerModels] - from llm_complete / llm_error: the models named
 *   on the call's own assistant frames. Judged when present; modelUsage can also list the
 *   CLI's own helper requests (a Haiku beside the pinned model, seen live 2026-09-26), so it
 *   is judged only for an observation with no frame models.
 * @param {string|null} [obs.error] - the thrown message, if the call failed
 * @returns {{ok: boolean, failures: string[]}}
 */
function isolationVerdict({ alias, pinnedId, declaredTools = null, hasSchema = false, inits = [], thinkingChars = 0, servedModels = null, answerModels = null, error = null }) {
  const failures = new Set();
  if (error) failures.add(`call failed: ${error}`);
  const expected = Array.isArray(declaredTools) ? expectedInitTools(declaredTools, hasSchema) : null;
  if (!expected) failures.add('the call declared no tool set (neither tools nor disableTools), so it runs with the full default set');
  if (inits.length === 0) failures.add('no init frame arrived, so the tool names and memory paths are unverified');
  for (const init of inits) {
    if (!Array.isArray(init.toolNames)) failures.add('an init frame did not report its tools');
    else if (expected) {
      const reported = [...new Set(init.toolNames.map(String))];
      const undeclared = reported.filter((name) => !expected.includes(name));
      const missing = expected.filter((name) => !reported.includes(name));
      const want = `expected exactly: ${formatToolNames(expected)}`;
      if (undeclared.length > 0) failures.add(`init reported undeclared tools: ${formatToolNames(undeclared)} (${want})`);
      if (missing.length > 0) failures.add(`init is missing expected tools: ${formatToolNames(missing)} (${want})`);
    }
    if (hasMemoryPaths(init.memoryPaths)) failures.add(`memory loaded into the call: ${JSON.stringify(init.memoryPaths)}`);
  }
  if (THINKING_ALIASES.has(alias) && !(thinkingChars > 0)) {
    failures.add('no readable thinking text streamed (display "summarized" not honoured, or no thinking)');
  }
  const judged = Array.isArray(answerModels) && answerModels.length > 0 ? answerModels : servedModels;
  if (!Array.isArray(judged) || judged.length === 0) {
    failures.add('the result named no served model (no modelUsage)');
  } else {
    const off = judged.filter((m) => !servedModelMatches(m, pinnedId));
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

module.exports = {
  isolationVerdict,
  channelVerdict,
  declaredToolsOf,
  expectedInitTools,
  formatToolNames,
  THINKING_ALIASES,
  STRUCTURED_OUTPUT_TOOL
};
