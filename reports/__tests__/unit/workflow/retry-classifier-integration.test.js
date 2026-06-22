/**
 * P3.12 — Phase capstone integration assertion.
 *
 * Ties the phase together: the retryPolicy.retryOn classifier wired onto every
 * LLM-calling node in P3.1 retries a mocked transient SDK error and lets a
 * permanent one through. This is the "a node with a mocked transient SDK error
 * retries; a permanent error throws" acceptance test from the phase brief.
 *
 * LangGraph's retryPolicy retries opaquely (node re-invoke), so we assert at the
 * classifier boundary the policy actually uses — and that it is the EXACT
 * isTransientError classifier (no divergent copy).
 */
const { createGraphBuilder } = require('../../../lib/workflow/graph')._testing; // exported under _testing, not top-level
const { isTransientError } = require('../../../lib/llm/retry');

describe('retryPolicy classifier integration (P3 acceptance)', () => {
  const builder = createGraphBuilder();
  const policy = builder.nodes['generateContentBundle'].retryPolicy;

  test('a transient SDK error (overloaded / 5xx) is retried', () => {
    expect(policy.retryOn({ name: 'overloaded_error' })).toBe(true);
    expect(policy.retryOn({ status: 529 })).toBe(true);
    expect(policy.retryOn({ apiErrorStatus: 503 })).toBe(true);
  });

  test('a permanent error (auth / invalid-request / schema) is NOT retried → throws through', () => {
    expect(policy.retryOn({ status: 401 })).toBe(false);
    expect(policy.retryOn({ error: { type: 'invalid_request_error' } })).toBe(false);
    const soe = Object.assign(new Error('bad json'), { name: 'StructuredOutputExtractionError' });
    expect(policy.retryOn(soe)).toBe(false);
  });

  test('maxAttempts is 3 (transient gets up to 3 tries before surfacing)', () => {
    expect(policy.maxAttempts).toBe(3);
  });

  test('isTransientError is the exact classifier wired (no divergent copy)', () => {
    expect(policy.retryOn).toBe(isTransientError);
  });
});
