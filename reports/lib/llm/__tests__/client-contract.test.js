const { StructuredOutputExtractionError } = require('../structured-output-extractor');
const { setMockQuery, clearMockQuery } = require('@anthropic-ai/claude-agent-sdk');
const { sdkQueryImpl } = require('../client');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['ok'],
  properties: { ok: { type: 'boolean' } }
};

function makeAsyncIterable(messages) {
  return (async function* () {
    for (const m of messages) yield m;
  })();
}

describe('sdkQueryImpl contract', () => {
  afterEach(() => {
    clearMockQuery();
  });

  test('returns structured_output when present and schema-valid', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '{"ok":true}', structured_output: { ok: true } }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('falls back to text extraction when structured_output missing on success', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: '```json\n{"ok":true}\n```' }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku'
    });

    expect(result).toEqual({ ok: true });
  });

  test('throws StructuredOutputExtractionError when both paths fail', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'no json here' }
    ]));

    await expect(sdkQueryImpl({
      prompt: 'test',
      jsonSchema: SIMPLE_SCHEMA,
      model: 'haiku',
      label: 'contract-test'
    })).rejects.toThrow(StructuredOutputExtractionError);
  });

  test('passes through non-schema text result unchanged', async () => {
    setMockQuery(() => makeAsyncIterable([
      { type: 'result', subtype: 'success', result: 'plain text response' }
    ]));

    const result = await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku'
    });

    expect(result).toBe('plain text response');
  });

  test('settingSources: [] is set when loadProjectSettings is false', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: false
    });

    expect(capturedOptions.settingSources).toEqual([]);
  });

  test('settingSources is omitted when loadProjectSettings is true (SDK default)', async () => {
    let capturedOptions = null;
    setMockQuery(({ options }) => {
      capturedOptions = options;
      return makeAsyncIterable([
        { type: 'result', subtype: 'success', result: 'ok' }
      ]);
    });

    await sdkQueryImpl({
      prompt: 'test',
      model: 'haiku',
      loadProjectSettings: true
    });

    expect(capturedOptions.settingSources).toBeUndefined();
  });
});
