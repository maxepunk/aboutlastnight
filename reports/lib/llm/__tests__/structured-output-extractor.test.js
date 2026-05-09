const { extractStructuredOutput, StructuredOutputExtractionError } = require('../structured-output-extractor');
const { STRUCTURED_OUTPUT_CHANNELS } = require('../../observability/constants');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['name', 'count'],
  properties: {
    name: { type: 'string' },
    count: { type: 'integer' }
  }
};

describe('extractStructuredOutput', () => {
  test('returns valid structured output with structured_output channel', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 'foo', count: 3 },
      resultText: 'ignored',
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'foo', count: 3 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.STRUCTURED_OUTPUT);
  });

  test('extracts JSON from markdown fence and reports text_fallback channel', () => {
    const text = 'Here is the answer:\n```json\n{"name": "bar", "count": 7}\n```\nDone.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'bar', count: 7 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK);
  });

  test('extracts a bare JSON object from resultText when no fence is present', () => {
    const text = 'Some preamble. {"name": "baz", "count": 0} Some trailing prose.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'baz', count: 0 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK);
  });

  test('throws StructuredOutputExtractionError when text contains no JSON', () => {
    expect(() => extractStructuredOutput({
      structuredOutput: undefined,
      resultText: 'no json here at all',
      schema: SIMPLE_SCHEMA
    })).toThrow(StructuredOutputExtractionError);
  });

  test('throws StructuredOutputExtractionError when JSON does not match schema', () => {
    const text = '```json\n{"name": "missing-count"}\n```';
    expect(() => extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    })).toThrow(/schema/i);
  });

  test('error includes diagnostic context (model label, schemaErrors)', () => {
    try {
      extractStructuredOutput({
        structuredOutput: undefined,
        resultText: '```json\n{"name": 42}\n```',
        schema: SIMPLE_SCHEMA,
        label: 'test-call',
        model: 'opus'
      });
      throw new Error('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(StructuredOutputExtractionError);
      expect(err.label).toBe('test-call');
      expect(err.model).toBe('opus');
      expect(Array.isArray(err.schemaErrors)).toBe(true);
    }
  });

  test('prefers structuredOutput when both are present and valid', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 'from-structured', count: 1 },
      resultText: '```json\n{"name": "from-text", "count": 2}\n```',
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'from-structured', count: 1 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.STRUCTURED_OUTPUT);
  });

  test('falls back to resultText when structuredOutput exists but is schema-invalid', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 42 }, // wrong type
      resultText: '```json\n{"name": "valid", "count": 1}\n```',
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'valid', count: 1 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK);
  });

  test('extracts the schema-valid object when text contains multiple top-level objects', () => {
    // Edge case from final review: "preamble {bad} prose {good}" — first object
    // must be tried and discarded; second must succeed via balanced scan.
    const text = 'Error context: {"unrelated": true, "extra": "stuff"}. Final answer: {"name": "winner", "count": 5}';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'winner', count: 5 });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK);
  });

  test('handles JSON containing strings with braces inside', () => {
    const text = '{"name": "has } brace", "count": 1, "nested": {"a": 1}}';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result.value).toEqual({ name: 'has } brace', count: 1, nested: { a: 1 } });
    expect(result.channel).toBe(STRUCTURED_OUTPUT_CHANNELS.TEXT_FALLBACK);
  });
});
