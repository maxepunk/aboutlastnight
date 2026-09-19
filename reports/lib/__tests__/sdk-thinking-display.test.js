/**
 * Thinking display (operator gate, 2026-09-19)
 *
 * On Opus 4.8 and Sonnet 5 the SDK's thinking display defaults to "omitted":
 * thinking streams as EMPTY blocks. A long think at effort xhigh is therefore a
 * silent stream, and something (the CLI's stream watchdog or the API edge)
 * re-requests after ~5 minutes — the live Opus enrichment call cycled
 * "empty thinking delta → status: requesting" every ~340s for 20 minutes and never
 * completed, while re-arming our own idle timer each cycle. A direct probe with
 * `thinking: { type: 'adaptive', display: 'summarized' }` streamed 1.3K chars of
 * thinking summary in the first 20s. Haiku 4.5 does not support adaptive thinking,
 * so it gets no thinking option.
 */

let capturedOptions = null;
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(({ options }) => {
    capturedOptions = options;
    return (async function* () {
      yield { type: 'result', subtype: 'success', result: 'ok', structured_output: { test: true } };
    })();
  })
}));

const { sdkQuery } = require('../llm');

describe('SDK thinking display', () => {
  beforeEach(() => { capturedOptions = null; });

  test.each(['opus', 'sonnet'])('%s streams summarized adaptive thinking', async (model) => {
    await sdkQuery({ prompt: 'test', model, disableTools: true });
    expect(capturedOptions.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  test('haiku passes no thinking config (adaptive is unsupported on Haiku 4.5)', async () => {
    await sdkQuery({ prompt: 'test', model: 'haiku', disableTools: true });
    expect(capturedOptions.thinking).toBeUndefined();
  });
});
