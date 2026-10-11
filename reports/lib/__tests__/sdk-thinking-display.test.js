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
 * thinking summary in the first 20s. Haiku 4.5 did not support adaptive thinking and
 * got no thinking option; Haiku 5.5 (pinned since 2026-10-11) thinks by default with its
 * display "omitted", as Opus 5.5 and Sonnet 5.5 do, so every model now asks for
 * summarized thinking.
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

  test.each(['opus', 'sonnet', 'haiku'])('%s streams summarized adaptive thinking', async (model) => {
    await sdkQuery({ prompt: 'test', model, disableTools: true });
    expect(capturedOptions.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });
});
