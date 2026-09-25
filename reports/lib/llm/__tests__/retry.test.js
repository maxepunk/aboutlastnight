// lib/llm/__tests__/retry.test.js
const { isTransientError } = require('../retry');
const { StructuredOutputExtractionError } = require('../structured-output-extractor');

describe('isTransientError', () => {
  describe('returns true (transient — should retry)', () => {
    test('our own SDK idle/timeout error', () => {
      // Same message shape isSdkTimeoutError matches (client.js idle abort)
      expect(isTransientError(new Error('SDK timeout after 905.0s (limit: 900s) - analyzeArcs'))).toBe(true);
    });

    // Round 3: every 5xx, not only the four listed before; 502 and 504 were permanent.
    test.each([429, 500, 502, 503, 504, 529])('apiErrorStatus %i', (status) => {
      const err = new Error('upstream'); err.apiErrorStatus = status;
      expect(isTransientError(err)).toBe(true);
    });

    test.each([429, 500, 502, 503, 504, 529])('status %i', (status) => {
      const err = new Error('upstream'); err.status = status;
      expect(isTransientError(err)).toBe(true);
    });

    test.each(['rate_limit_error', 'overloaded_error', 'api_error'])('error.type %s', (type) => {
      const err = new Error('upstream'); err.error = { type };
      expect(isTransientError(err)).toBe(true);
    });

    test.each(['ECONNRESET', 'ETIMEDOUT'])('err.name %s', (name) => {
      const err = new Error('socket'); err.name = name;
      expect(isTransientError(err)).toBe(true);
    });

    test('err.code ECONNRESET', () => {
      const err = new Error('socket'); err.code = 'ECONNRESET';
      expect(isTransientError(err)).toBe(true);
    });

    // Real wrapper output (the DOMINANT upstream-transient shape): the SDK
    // error-result path throws a bare Error enriched with sdkSubtype + sdkErrors
    // (client.js), with NO apiErrorStatus/status/error.type. A sustained 429/500/529
    // that exhausts the SDK's own retries surfaces here as error_during_execution +
    // overloaded_error — this is what must auto-retry in practice.
    test.each(['overloaded_error', 'rate_limit_error', 'api_error'])(
      'enriched wrapper error: sdkErrors contains %s', (type) => {
        const err = new Error(`SDK error_during_execution: ${type}`);
        err.sdkSubtype = 'error_during_execution';
        err.sdkErrors = [type];
        expect(isTransientError(err)).toBe(true);
      });

    test('err.code ETIMEDOUT', () => {
      const err = new Error('socket'); err.code = 'ETIMEDOUT';
      expect(isTransientError(err)).toBe(true);
    });
  });

  // Ruling (integrator, 2026-09-25): calls are served by their pinned model, never a
  // substitute (CLAUDE_CODE_NO_MODEL_FALLBACK). The CLI then has no model to route an
  // overload to, and the call ends as an is_error result whose assistant error is
  // `server_error`. That must stay transient, so the node retry policy retries it on the
  // same model. Message text as the bundled CLI 2.1.282 writes it; the wrapper's
  // error as client.js builds it (sdkSubtype = the assistant error).
  describe('an overload the CLI could not route to another model is transient', () => {
    const REPEATED_529 = 'API Error: Repeated 529 Overloaded errors. The API is at capacity — this is usually temporary. Try again in a moment.';
    const wrapperError = (reason, status, text) => {
      const err = new Error(`SDK result error (${reason}${status != null ? `, HTTP ${status}` : ''}) - Core arc generation: ${text}`);
      err.sdkSubtype = reason;
      if (status != null) err.apiErrorStatus = status;
      return err;
    };

    test('the repeated-529 result with its status', () => {
      expect(isTransientError(wrapperError('server_error', 529, REPEATED_529))).toBe(true);
    });

    test('the repeated-529 result without a status: the assistant error decides, not the digits', () => {
      expect(isTransientError(wrapperError('server_error', null, REPEATED_529))).toBe(true);
      expect(isTransientError(wrapperError('server_error', null, 'API Error: Connection lost before a response was produced. Try again.'))).toBe(true);
    });

    test('the `overloaded` assistant error (0.3.282 SDKAssistantMessageError) is transient too', () => {
      expect(isTransientError(wrapperError('overloaded', null, 'API Error: Overloaded'))).toBe(true);
    });

    // Round 3: the numeric-status check returns before the assistant-error check, so a
    // gateway 5xx the CLI reported with its status was permanent.
    test.each([502, 504])('a server_error result with HTTP %i is transient', (status) => {
      expect(isTransientError(wrapperError('server_error', status, `API Error: ${status} Bad Gateway`))).toBe(true);
    });

    test('an explicit permanent status still wins over the assistant error', () => {
      expect(isTransientError(wrapperError('server_error', 400, 'API Error: bad request'))).toBe(false);
    });

    test.each([401, 403, 404, 413, 422])('an explicit %i wins over the assistant error too', (status) => {
      expect(isTransientError(wrapperError('server_error', status, 'API Error'))).toBe(false);
    });

    test('other assistant errors, and the words in free text, stay permanent', () => {
      expect(isTransientError(wrapperError('invalid_request', null, 'API Error: prompt is too long'))).toBe(false);
      expect(isTransientError(wrapperError('model_not_found', null, 'API Error: model not found'))).toBe(false);
      expect(isTransientError(new Error('the CLI reported server_error and was overloaded'))).toBe(false);
    });
  });

  describe('returns false (permanent — do not retry)', () => {
    test.each([400, 401, 403, 404, 413, 422])('apiErrorStatus %i', (status) => {
      const err = new Error('bad'); err.apiErrorStatus = status;
      expect(isTransientError(err)).toBe(false);
    });

    test.each(['authentication_error', 'permission_error', 'invalid_request_error'])('error.type %s', (type) => {
      const err = new Error('bad'); err.error = { type };
      expect(isTransientError(err)).toBe(false);
    });

    test('StructuredOutputExtractionError is permanent', () => {
      expect(isTransientError(new StructuredOutputExtractionError('no json', { label: 'x' }))).toBe(false);
    });

    test('budget-exceeded error is permanent', () => {
      expect(isTransientError(new Error('SDK error_max_budget_usd: budget exceeded'))).toBe(false);
    });

    test('plain unknown error is permanent (no false retries)', () => {
      expect(isTransientError(new Error('something weird'))).toBe(false);
    });

    test('a plain message containing a status-like number is permanent (no digit false-positive)', () => {
      expect(isTransientError(new Error('Could not read 500 records'))).toBe(false);
    });

    test('null / undefined are permanent', () => {
      expect(isTransientError(null)).toBe(false);
      expect(isTransientError(undefined)).toBe(false);
    });
  });

  // Brief 2.0: a declined request is deterministic, so it is never retried, through
  // every shape a node hands the classifier.
  describe('a declined request (refusal) is permanent', () => {
    const { SdkRefusalError } = require('../refusal');
    const refusal = () => new SdkRefusalError({ category: 'bio', model: 'claude-opus-5-5', label: 'Core arc generation (Call 1)' });

    test('the wrapper\'s own SdkRefusalError', () => {
      expect(isTransientError(refusal())).toBe(false);
    });

    test('checked before any status field: a transient status does not retry it', () => {
      const err = refusal(); err.apiErrorStatus = 529;
      expect(isTransientError(err)).toBe(false);
    });

    test('checked before the named-string scan: a transient word in the explanation does not retry it', () => {
      const err = new SdkRefusalError({ category: 'cyber', explanation: 'overloaded_error ECONNRESET api_error', label: 'x' });
      expect(isTransientError(err)).toBe(false);
    });

    test('re-wrapped into a plain Error with the original as cause (the four re-wrapping nodes)', () => {
      const wrapped = new Error(`Arc analysis failed: ${refusal().message}`, { cause: refusal() });
      expect(isTransientError(wrapped)).toBe(false);
    });

    test('re-wrapped with only the text kept (per-photo placeholder, then the all-failed throw)', () => {
      const textOnly = new Error(`Photo analysis failed: all 2 photos errored (e.g. "${refusal().message}").`);
      expect(isTransientError(textOnly)).toBe(false);
    });

    test('a cause chain whose inner link carries an otherwise-transient status still stops at the refusal', () => {
      const inner = refusal(); inner.sdkErrors = ['overloaded_error'];
      const outer = new Error('Photo analysis failed: x', { cause: new Error('mid', { cause: inner }) });
      expect(isTransientError(outer)).toBe(false);
    });

    // Only the marker ("SDK refusal (category: ...)") or a refusal error in the chain
    // counts. A message that merely mentions a refusal keeps its old classification.
    test('a non-refusal error whose message mentions "refusal" keeps its old classification', () => {
      const overloaded = new Error('SDK error_during_execution: overloaded_error after a refusal retry');
      overloaded.sdkSubtype = 'error_during_execution';
      overloaded.sdkErrors = ['overloaded_error'];
      expect(isTransientError(overloaded)).toBe(true);

      const stalled = new Error('SDK timeout after 905.0s idle 900.0s with no streamed activity (idle limit: 900s) - refusal review');
      expect(isTransientError(stalled)).toBe(true);

      const withStatus = new Error('upstream refusal of the connection'); withStatus.apiErrorStatus = 529;
      expect(isTransientError(withStatus)).toBe(true);

      expect(isTransientError(new Error('the model_refusal_fallback notice was malformed'))).toBe(false);
      const unauthorized = new Error('SDK refusal handler: HTTP 401'); unauthorized.apiErrorStatus = 401;
      expect(isTransientError(unauthorized)).toBe(false);
    });
  });
});
