const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

function makeAsyncIterable(messages) {
  return (async function* () { for (const m of messages) yield m; })();
}

async function captureForward(sdkMessages) {
  const events = [];
  setMockQuery(() => makeAsyncIterable([
    ...sdkMessages,
    { type: 'result', subtype: 'success', result: 'ok' }
  ]));
  await sdkQueryImpl({ prompt: 'x', model: 'haiku', onProgress: (e) => events.push(e) });
  return events;
}

describe('client onProgress forward — api_retry', () => {
  afterEach(() => clearMockQuery());

  it('forwards a structured retry field with attempt/reason/status/backoff', async () => {
    const events = await captureForward([
      { type: 'system', subtype: 'api_retry', attempt: 2, max_retries: 10, retry_delay_ms: 30000, error_status: 429, error: 'rate_limit' }
    ]);
    const retry = events.find(e => e.subtype === 'api_retry');
    expect(retry).toBeDefined();
    expect(retry.retry).toEqual({ attempt: 2, maxRetries: 10, delayMs: 30000, errorStatus: 429, reason: 'rate_limit' });
  });
});
