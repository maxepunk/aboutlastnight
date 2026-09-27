/**
 * A call served by a model other than the one it asked for.
 *
 * Ruling (integrator, 2026-09-25; corrected 2026-09-26): when a model that wrote part of a
 * completed call's answer is not the model the call resolved to under
 * `servedModelMatches`, the call fails with `SdkModelSubstitutionError`. The models that
 * wrote the answer are the ones named on the call's own assistant frames (client.js,
 * `answerModels`). CLAUDE_CODE_NO_MODEL_FALLBACK (client.js) tells the CLI never to
 * substitute; this is the check that it did not. A call with no frame naming a model has
 * nothing to judge and still returns.
 *
 * The first version judged the result's modelUsage (`servedModels`, lib/llm/sdk-fields.js).
 * That also counts the CLI's own helper requests: on 2026-09-26 a Sonnet session-report
 * parse listed claude-haiku-4-5 beside claude-sonnet-5 there, every frame of its answer
 * was Sonnet's, and the check threw the answer away. modelUsage is now recorded, not judged.
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
 * The answer's models that are not the requested one.
 *
 * @param {string[]|null} servedModels - the models named on the call's own assistant frames
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
   * @param {string[]} details.servedModels - every model that wrote part of the answer
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
