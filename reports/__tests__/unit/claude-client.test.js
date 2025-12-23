/**
 * Claude Client Unit Tests
 *
 * Tests the parsing functions exported via _testing interface.
 * These functions are pure and deterministic - they transform
 * Claude CLI output into usable JSON strings.
 *
 * Test strategy:
 * - Unit test parsing functions with real CLI output fixtures
 * - Cover all output formats: streaming array, legacy object
 * - Cover all extraction paths: structured_output, result field, assistant text
 * - Cover code fence variations: with newlines, without, multiple blocks
 */

const path = require('path');
const fs = require('fs');
const {
  _testing: { parseJsonOutput, extractJsonFromText },
  MODEL_TIMEOUTS,
  getModelTimeout
} = require('../../lib/claude-client');

// Load fixtures
const fixturesDir = path.join(__dirname, '..', 'fixtures', 'claude-outputs');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf-8'));
}

describe('claude-client', () => {
  describe('MODEL_TIMEOUTS', () => {
    it('defines timeouts for all supported models', () => {
      expect(MODEL_TIMEOUTS).toHaveProperty('opus');
      expect(MODEL_TIMEOUTS).toHaveProperty('sonnet');
      expect(MODEL_TIMEOUTS).toHaveProperty('haiku');
    });

    it('opus has longest timeout (10 minutes)', () => {
      expect(MODEL_TIMEOUTS.opus).toBe(10 * 60 * 1000);
    });

    it('sonnet has medium timeout (5 minutes)', () => {
      expect(MODEL_TIMEOUTS.sonnet).toBe(5 * 60 * 1000);
    });

    it('haiku has shortest timeout (2 minutes)', () => {
      expect(MODEL_TIMEOUTS.haiku).toBe(2 * 60 * 1000);
    });
  });

  describe('getModelTimeout', () => {
    it('returns correct timeout for each model', () => {
      expect(getModelTimeout('opus')).toBe(MODEL_TIMEOUTS.opus);
      expect(getModelTimeout('sonnet')).toBe(MODEL_TIMEOUTS.sonnet);
      expect(getModelTimeout('haiku')).toBe(MODEL_TIMEOUTS.haiku);
    });

    it('returns sonnet timeout for unknown models', () => {
      expect(getModelTimeout('unknown')).toBe(MODEL_TIMEOUTS.sonnet);
      expect(getModelTimeout('')).toBe(MODEL_TIMEOUTS.sonnet);
      expect(getModelTimeout(null)).toBe(MODEL_TIMEOUTS.sonnet);
    });
  });

  describe('extractJsonFromText', () => {
    let codeFenceVariations;

    beforeAll(() => {
      codeFenceVariations = loadFixture('code-fence-variations.json');
    });

    it('extracts JSON from standard code fence with newlines', () => {
      const input = codeFenceVariations.withNewlines;
      const result = extractJsonFromText(input);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ key: 'value with\nnewlines' });
    });

    it('handles code fence without newline after opening', () => {
      const input = codeFenceVariations.withoutNewlineAfterFence;
      const result = extractJsonFromText(input);

      // Should still extract the JSON even without perfect formatting
      expect(result).toContain('compact');
    });

    it('extracts first code block when multiple present', () => {
      const input = codeFenceVariations.multipleCodeBlocks;
      const result = extractJsonFromText(input);
      const parsed = JSON.parse(result);

      // Should get the first JSON block
      expect(parsed).toEqual({ first: true });
    });

    it('returns raw text when no code fences present', () => {
      const input = codeFenceVariations.noCodeFence;
      const result = extractJsonFromText(input);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ raw: 'json without fences' });
    });

    it('handles trailing whitespace', () => {
      const input = codeFenceVariations.trailingWhitespace;
      const result = extractJsonFromText(input);
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ key: 'value' });
    });

    it('handles plain JSON string', () => {
      const result = extractJsonFromText('{"simple": true}');
      const parsed = JSON.parse(result);

      expect(parsed).toEqual({ simple: true });
    });

    it('preserves content when extraction fails', () => {
      const malformed = 'not json at all';
      const result = extractJsonFromText(malformed);

      expect(result).toBe('not json at all');
    });
  });

  describe('parseJsonOutput', () => {
    describe('streaming array format', () => {
      it('extracts structured_output from result message', () => {
        const fixture = loadFixture('streaming-structured-output.json');
        const rawOutput = JSON.stringify(fixture);

        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('status', 'success');
        expect(parsed).toHaveProperty('data');
        expect(parsed.data).toEqual({
          name: 'test',
          value: 42
        });
      });

      it('extracts JSON from result field with code fences', () => {
        const fixture = loadFixture('streaming-result-field.json');
        const rawOutput = JSON.stringify(fixture);

        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('tokens');
        expect(parsed).toHaveProperty('count', 1);
        expect(parsed.tokens[0]).toEqual({ id: 'tok1', value: 'memory' });
      });

      it('extracts JSON from assistant message text content', () => {
        const fixture = loadFixture('streaming-assistant-text.json');
        const rawOutput = JSON.stringify(fixture);

        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('arcs');
        expect(parsed.arcs).toContain('Financial Trail');
        expect(parsed.arcs).toContain('Marriage Troubles');
        expect(parsed).toHaveProperty('recommended', 'Financial Trail');
      });
    });

    describe('legacy single object format', () => {
      it('extracts JSON from result field with code fences', () => {
        const fixture = loadFixture('legacy-single-object.json');
        const rawOutput = JSON.stringify(fixture);

        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('passed', true);
        expect(parsed).toHaveProperty('issues');
        expect(parsed.issues).toEqual([]);
        expect(parsed).toHaveProperty('voiceScore', 4);
      });

      it('extracts structured_output directly', () => {
        const fixture = loadFixture('legacy-structured-output.json');
        const rawOutput = JSON.stringify(fixture);

        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toHaveProperty('html');
        expect(parsed.html).toContain('<!DOCTYPE html>');
        expect(parsed).toHaveProperty('voice_self_check');
      });
    });

    describe('edge cases', () => {
      it('returns raw output when not valid JSON', () => {
        const rawOutput = 'This is plain text, not JSON';
        const result = parseJsonOutput(rawOutput);

        expect(result).toBe(rawOutput);
      });

      it('handles empty array', () => {
        const rawOutput = '[]';
        const result = parseJsonOutput(rawOutput);

        expect(result).toBe('[]');
      });

      it('handles empty object', () => {
        const rawOutput = '{}';
        const result = parseJsonOutput(rawOutput);

        expect(result).toBe('{}');
      });

      it('handles array with no result or assistant messages', () => {
        const streamWithOnlyInit = [
          { type: 'system', subtype: 'init', session_id: 'test' }
        ];
        const rawOutput = JSON.stringify(streamWithOnlyInit);
        const result = parseJsonOutput(rawOutput);

        // Should return the original since no extractable content
        expect(result).toBe(rawOutput);
      });

      it('handles result message with neither structured_output nor result', () => {
        const incompleteResult = [
          { type: 'result', subtype: 'success', duration_ms: 100 }
        ];
        const rawOutput = JSON.stringify(incompleteResult);
        const result = parseJsonOutput(rawOutput);

        // Should fall through and return raw
        expect(result).toBe(rawOutput);
      });

      it('prioritizes structured_output over result field', () => {
        const bothPresent = [
          {
            type: 'result',
            subtype: 'success',
            structured_output: { source: 'structured' },
            result: '```json\n{"source": "result"}\n```'
          }
        ];
        const rawOutput = JSON.stringify(bothPresent);
        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toEqual({ source: 'structured' });
      });

      it('prioritizes result message over assistant message', () => {
        const bothPresent = [
          {
            type: 'assistant',
            message: {
              content: [{ type: 'text', text: '{"source": "assistant"}' }]
            }
          },
          {
            type: 'result',
            subtype: 'success',
            result: '```json\n{"source": "result"}\n```'
          }
        ];
        const rawOutput = JSON.stringify(bothPresent);
        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed).toEqual({ source: 'result' });
      });
    });

    describe('error handling', () => {
      it('does not throw on malformed JSON', () => {
        expect(() => parseJsonOutput('{malformed')).not.toThrow();
      });

      it('returns raw output on parse error', () => {
        const malformed = '{not: valid: json}';
        const result = parseJsonOutput(malformed);

        expect(result).toBe(malformed);
      });

      it('handles deeply nested content gracefully', () => {
        const deepNesting = [
          {
            type: 'assistant',
            message: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    level1: {
                      level2: {
                        level3: { data: 'deep' }
                      }
                    }
                  })
                }
              ]
            }
          }
        ];
        const rawOutput = JSON.stringify(deepNesting);
        const result = parseJsonOutput(rawOutput);
        const parsed = JSON.parse(result);

        expect(parsed.level1.level2.level3.data).toBe('deep');
      });
    });
  });
});
