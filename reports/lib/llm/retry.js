/**
 * Transient-vs-permanent error classification for retry decisions.
 *
 * Single source of truth consumed by:
 *   - LangGraph node retryPolicy.retryOn (graph.js) — auto-retry transient LLM failures
 *
 * Transient (retry): our idle/stall timeout, rate-limit / overloaded / 5xx upstream,
 * connection resets. Permanent (surface to operator): auth/permission/invalid-request,
 * structured-output extraction failures, cost-ceiling overruns.
 *
 * Error-type strings verified against the claude-api skill shared/error-codes.md:
 *   400 invalid_request_error · 401 authentication_error · 403 permission_error  → NO retry
 *   429 rate_limit_error · 500 api_error · 529 overloaded_error                  → retry
 *
 * @module llm/retry
 */

const { isSdkTimeoutError } = require('./client');
const { StructuredOutputExtractionError } = require('./structured-output-extractor');

const TRANSIENT_STATUS = new Set([429, 500, 503, 529]);
const TRANSIENT_TYPES = new Set([
  // Anthropic API error type strings (matched against err.error.type)
  'rate_limit_error', 'overloaded_error', 'api_error',
  // Node socket error names/codes (matched against err.name / err.code)
  'ECONNRESET', 'ETIMEDOUT'
]);

/**
 * @param {unknown} err
 * @returns {boolean} true if the failure is worth an automatic retry
 */
function isTransientError(err) {
  if (!err || typeof err !== 'object') return false;

  // Permanent by identity — never retry these regardless of any status field.
  if (err instanceof StructuredOutputExtractionError) return false;

  // Our own idle/stall abort (client.js wraps it as "SDK timeout after ...").
  if (isSdkTimeoutError(err)) return true;

  // HTTP-ish status carried by the SDK or an underlying fetch error.
  const status = err.apiErrorStatus ?? err.status;
  if (typeof status === 'number') {
    if (TRANSIENT_STATUS.has(status)) return true;
    // 400/401/403 and any other explicit status → permanent.
    return false;
  }

  // Anthropic error-type string and Node socket error name/code — checked
  // INDEPENDENTLY. A normal Error has name==='Error', which must NOT short-circuit
  // a real err.code like 'ECONNRESET' (the old `type || name || code` chain did).
  if (typeof err.error?.type === 'string' && TRANSIENT_TYPES.has(err.error.type)) return true;
  if (typeof err.name === 'string' && TRANSIENT_TYPES.has(err.name)) return true;
  if (typeof err.code === 'string' && TRANSIENT_TYPES.has(err.code)) return true;

  // The DOMINANT real case: the SDK wrapper throws a bare Error for an error-result
  // subtype (client.js), enriched with sdkSubtype + sdkErrors but NO status/type
  // fields. Classify from those (message as a weak fallback). Terminal subtypes
  // (cost ceiling, max-turns) are permanent and MUST be tested first.
  const hay = `${err.sdkSubtype || ''} ${(err.sdkErrors || []).join(' ')} ${err.message || ''}`;
  if (/error_max_budget_usd|error_max_turns|error_max_structured_output_retries/.test(hay)) return false;
  // Named API/socket error strings don't collide with natural language — match unrestricted.
  if (/overloaded_error|rate_limit_error|\bapi_error\b|ECONNRESET|ETIMEDOUT/.test(hay)) return true;
  // Raw HTTP status digits only count when this came from the SDK wrapper (sdkSubtype set),
  // so a business-logic message like "read 500 records" is never misclassified.
  if (err.sdkSubtype && /\b(?:429|500|503|529)\b/.test(hay)) return true;

  return false;
}

module.exports = { isTransientError };
