// lib/observability/__tests__/constants.test.js
const { SSE_EVENT_TYPES } = require('../constants');

describe('SSE_EVENT_TYPES', () => {
  test('includes the streaming-delta event name (P2/P5 contract)', () => {
    expect(SSE_EVENT_TYPES.LLM_DELTA).toBe('llm_delta');
  });

  test('retains existing event names', () => {
    expect(SSE_EVENT_TYPES.LLM_START).toBe('llm_start');
    expect(SSE_EVENT_TYPES.LLM_COMPLETE).toBe('llm_complete');
    expect(SSE_EVENT_TYPES.COMPLETE).toBe('complete');
  });
});
