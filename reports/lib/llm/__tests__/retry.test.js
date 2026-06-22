// lib/llm/__tests__/retry.test.js
const { isTransientError } = require('../retry');
const { StructuredOutputExtractionError } = require('../structured-output-extractor');

describe('isTransientError', () => {
  describe('returns true (transient — should retry)', () => {
    test('our own SDK idle/timeout error', () => {
      // Same message shape isSdkTimeoutError matches (client.js idle abort)
      expect(isTransientError(new Error('SDK timeout after 905.0s (limit: 900s) - analyzeArcs'))).toBe(true);
    });

    test.each([429, 500, 503, 529])('apiErrorStatus %i', (status) => {
      const err = new Error('upstream'); err.apiErrorStatus = status;
      expect(isTransientError(err)).toBe(true);
    });

    test.each([429, 500, 503, 529])('status %i', (status) => {
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

  describe('returns false (permanent — do not retry)', () => {
    test.each([400, 401, 403])('apiErrorStatus %i', (status) => {
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
});
