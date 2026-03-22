/**
 * 1M Context Window Beta Test
 *
 * Verifies that the 1M context window beta header is passed for
 * opus and sonnet calls but NOT for haiku calls.
 */

// Mock the Agent SDK query function to capture options
let capturedOptions = null;
jest.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: jest.fn(({ prompt, options }) => {
    capturedOptions = options;
    // Return an async iterable that yields a success result
    return (async function* () {
      yield {
        type: 'result',
        subtype: 'success',
        result: 'test response',
        structured_output: { test: true }
      };
    })();
  })
}));

const { sdkQuery } = require('../llm');

describe('1M context window beta', () => {
  beforeEach(() => {
    capturedOptions = null;
  });

  test('opus calls include context-1m beta header', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'opus',
      disableTools: true
    });
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });

  test('sonnet calls include context-1m beta header', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'sonnet',
      disableTools: true
    });
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });

  test('haiku calls do NOT include context-1m beta header', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'haiku',
      disableTools: true
    });
    expect(capturedOptions.betas).toBeUndefined();
  });

  test('default model (sonnet) includes context-1m beta header', async () => {
    await sdkQuery({
      prompt: 'test',
      disableTools: true
    });
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });
});
