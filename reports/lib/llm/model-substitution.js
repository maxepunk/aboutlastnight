/**
 * A call served by a model other than the one it asked for.
 *
 * Ruling (integrator, 2026-09-25, adopted after the full 2.0 gate served all 19 calls on
 * their pinned models): when a completed call's `servedModels` (the result's modelUsage,
 * lib/llm/sdk-fields.js) names any model that is not the model the call resolved to under
 * `servedModelMatches`, the call fails with `SdkModelSubstitutionError`. Before the ruling
 * such a result was returned and the substitute was only recorded in `servedModels`.
 * CLAUDE_CODE_NO_MODEL_FALLBACK (client.js) tells the CLI never to substitute; this is the
 * check that it did not. A result with no modelUsage names no model and still returns.
 *
 * A substitute after a refusal signal is a declined request instead: `SdkRefusalError`
 * naming the fallback model (lib/llm/refusal.js).
 *
 * Permanent (lib/llm/retry.js): a retry runs the same options through the same CLI, and
 * why another model answered is a question for the operator.
 *
 * @module llm/model-substitution
 */
'use strict';

const { servedModelMatches } = require('./sdk-fields');

const SUBSTITUTION_SUBTYPE = 'model_substitution';

// Every substitution message starts with this marker, so a node that re-wraps the error
// around its text, or keeps only the text, still carries a name the retry classifier reads.
const SUBSTITUTION_MARKER = 'SDK model substitution';
const SUBSTITUTION_MESSAGE_RE = /\bSDK model substitution: requested /;

/**
 * The served models that are not the requested one.
 *
 * @param {string[]|null} servedModels - servedModelsOf(result.modelUsage)
 * @param {string} requestedModel - the model id the call resolved to
 * @returns {string[]}
 */
function substituteModelsOf(servedModels, requestedModel) {
  return (Array.isArray(servedModels) ? servedModels : [])
    .filter((m) => !servedModelMatches(m, requestedModel));
}

class SdkModelSubstitutionError extends Error {
  /**
   * @param {Object} details
   * @param {string} details.requestedModel - the model id the call resolved to
   * @param {string[]} details.servedModels - every model the result's modelUsage names
   * @param {string} [details.label] - the call's label
   * @param {{cause?: unknown}} [options] - Error options: a failure the result also had
   *   (a schema mismatch)
   */
  constructor({ requestedModel = null, servedModels = [], label = '' } = {}, options) {
    const served = Array.isArray(servedModels) ? [...servedModels] : [];
    super(
      `${SUBSTITUTION_MARKER}: requested ${requestedModel || 'the pinned model'}, ` +
      `served by ${served.join(', ') || 'no model named'}${label ? ` - ${label}` : ''}; the result is not used`,
      options
    );
    this.name = 'SdkModelSubstitutionError';
    this.sdkSubtype = SUBSTITUTION_SUBTYPE;
    this.requestedModel = requestedModel || null;
    this.servedModels = served;
    this.substituteModels = substituteModelsOf(served, requestedModel);
  }
}

/**
 * Whether an error is a model substitution, looking through `.cause` links (a re-wrapping
 * node passes the original as the cause) and, last, the marker in a message that kept
 * only the text.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
function isModelSubstitutionError(err) {
  const seen = new Set();
  for (let e = err; e && typeof e === 'object' && !seen.has(e) && seen.size < 10; e = e.cause) {
    seen.add(e);
    if (e instanceof SdkModelSubstitutionError || e.sdkSubtype === SUBSTITUTION_SUBTYPE) return true;
    if (typeof e.message === 'string' && SUBSTITUTION_MESSAGE_RE.test(e.message)) return true;
  }
  return false;
}

module.exports = {
  SdkModelSubstitutionError,
  isModelSubstitutionError,
  substituteModelsOf,
  SUBSTITUTION_SUBTYPE,
  SUBSTITUTION_MARKER
};
