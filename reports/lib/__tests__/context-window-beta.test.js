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

  test('opus resolves to claude-opus-5-5 with 1M beta', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'opus',
      disableTools: true
    });
    expect(capturedOptions.model).toBe('claude-opus-5-5');
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });

  test('sonnet resolves to claude-sonnet-5-5 with 1M beta', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'sonnet',
      disableTools: true
    });
    expect(capturedOptions.model).toBe('claude-sonnet-5-5');
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });

  test('haiku resolves to claude-haiku-5-5 without 1M beta', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'haiku',
      disableTools: true
    });
    expect(capturedOptions.model).toBe('claude-haiku-5-5');
    expect(capturedOptions.betas).toBeUndefined();
  });

  test('default model (sonnet) resolves to claude-sonnet-5-5 with 1M beta', async () => {
    await sdkQuery({
      prompt: 'test',
      disableTools: true
    });
    expect(capturedOptions.model).toBe('claude-sonnet-5-5');
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });

  test('explicit model IDs pass through unchanged', async () => {
    await sdkQuery({
      prompt: 'test',
      model: 'claude-opus-4-8',
      disableTools: true
    });
    expect(capturedOptions.model).toBe('claude-opus-4-8');
    expect(capturedOptions.betas).toEqual(['context-1m-2025-08-07']);
  });
});

// 2026-10-11, the move to Sonnet 5.5 and Haiku 5.5: every call sends its model's effort
// default unless the call site passes its own, and every model, Haiku now too, is asked for
// summarized thinking, since all three default to "omitted" (an empty, silent stream).
describe('effort and thinking per model', () => {
  beforeEach(() => {
    capturedOptions = null;
  });

  test.each([
    ['opus', 'xhigh'],
    ['sonnet', 'high'],
    ['haiku', 'medium']
  ])('%s sends effort %s and summarized adaptive thinking', async (model, effort) => {
    await sdkQuery({ prompt: 'test', model, disableTools: true });
    expect(capturedOptions.effort).toBe(effort);
    expect(capturedOptions.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
  });

  test("a call site's own effort wins over the model's default", async () => {
    await sdkQuery({ prompt: 'test', model: 'haiku', effort: 'high', disableTools: true });
    expect(capturedOptions.effort).toBe('high');
  });
});
