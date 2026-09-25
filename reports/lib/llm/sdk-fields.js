/**
 * Readers for SDK message fields the gate depends on, in one place for the wrapper
 * (lib/llm/client.js), the progress bridge and the probe scripts.
 *
 * Pure: no SDK import, so the bridge and the scripts can load it freely.
 *
 * @module llm/sdk-fields
 */
'use strict';

/**
 * The models that actually served a call, from the result's `modelUsage`: keyed by the
 * model string the CLI used, with `canonicalModel` (SDK 0.3.218) as the normalised id
 * when present. The call log records this next to the alias the call asked for, so a
 * silent model fallback (SDK 0.3.174) or a refusal retry on another model shows. More
 * than one entry means more than one model answered part of the call. null when the
 * result carries no modelUsage (older CLIs, test mocks).
 *
 * @param {Object|undefined} modelUsage - result.modelUsage
 * @returns {string[]|null}
 */
function servedModelsOf(modelUsage) {
  if (!modelUsage || typeof modelUsage !== 'object') return null;
  const ids = Object.entries(modelUsage).map(([key, usage]) =>
    (usage && typeof usage.canonicalModel === 'string' && usage.canonicalModel) || key);
  return [...new Set(ids)];
}

/**
 * Whether an init frame's `memory_paths` names any memory that loaded. The 2026-09-19
 * leak showed `memory_paths.auto` set to the operator's memory directory; with
 * CLAUDE_CODE_DISABLE_AUTO_MEMORY the field was absent. The field is not in the 0.3.282
 * public types, so every shape is accepted: a non-empty string anywhere inside counts,
 * and absent, null, empty or all-empty containers do not.
 *
 * @param {unknown} memoryPaths - init.memory_paths as forwarded (init.memoryPaths)
 * @returns {boolean}
 */
function hasMemoryPaths(memoryPaths) {
  if (typeof memoryPaths === 'string') return memoryPaths.trim().length > 0;
  if (Array.isArray(memoryPaths)) return memoryPaths.some(hasMemoryPaths);
  if (memoryPaths && typeof memoryPaths === 'object') return Object.values(memoryPaths).some(hasMemoryPaths);
  return false;
}

module.exports = { servedModelsOf, hasMemoryPaths };
