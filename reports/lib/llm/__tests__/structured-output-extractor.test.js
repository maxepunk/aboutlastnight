const { extractStructuredOutput, StructuredOutputExtractionError } = require('../structured-output-extractor');

const SIMPLE_SCHEMA = {
  type: 'object',
  required: ['name', 'count'],
  properties: {
    name: { type: 'string' },
    count: { type: 'integer' }
  }
};

describe('extractStructuredOutput', () => {
  test('returns valid structured output unchanged', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 'foo', count: 3 },
      resultText: 'ignored',
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'foo', count: 3 });
  });

  test('extracts JSON from a markdown fence in resultText when structuredOutput missing', () => {
    const text = 'Here is the answer:\n```json\n{"name": "bar", "count": 7}\n```\nDone.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'bar', count: 7 });
  });

  test('extracts a bare JSON object from resultText when no fence is present', () => {
    const text = 'Some preamble. {"name": "baz", "count": 0} Some trailing prose.';
    const result = extractStructuredOutput({
      structuredOutput: undefined,
      resultText: text,
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'baz', count: 0 });
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
    expect(result).toEqual({ name: 'from-structured', count: 1 });
  });

  test('falls back to resultText when structuredOutput exists but is schema-invalid', () => {
    const result = extractStructuredOutput({
      structuredOutput: { name: 42 }, // wrong type
      resultText: '```json\n{"name": "valid", "count": 1}\n```',
      schema: SIMPLE_SCHEMA
    });
    expect(result).toEqual({ name: 'valid', count: 1 });
  });
});
