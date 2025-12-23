/**
 * SchemaValidator Unit Tests
 *
 * Tests the Ajv-based schema validation for ContentBundle and other schemas.
 */

const { SchemaValidator } = require('../../lib/schema-validator');
const validJournalist = require('../fixtures/content-bundles/valid-journalist.json');
const invalidMissingSections = require('../fixtures/content-bundles/invalid-missing-sections.json');

describe('SchemaValidator', () => {
  let validator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('constructor', () => {
    it('should initialize with content-bundle schema registered', () => {
      expect(validator.hasSchema('content-bundle')).toBe(true);
    });

    it('should return content-bundle in schema names list', () => {
      const names = validator.getSchemaNames();
      expect(names).toContain('content-bundle');
    });
  });

  describe('validate - valid ContentBundle', () => {
    it('should accept a valid journalist ContentBundle', () => {
      const result = validator.validate('content-bundle', validJournalist);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('should accept ContentBundle with only required fields', () => {
      const minimal = {
        metadata: {
          sessionId: 'test-001',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: {
          main: 'This Is A Valid Headline With Enough Characters'
        },
        sections: [
          {
            id: 'section-1',
            type: 'narrative',
            content: [
              { type: 'paragraph', text: 'Test content.' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', minimal);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeNull();
    });

    it('should accept ContentBundle with detective theme', () => {
      const detectiveBundle = {
        ...validJournalist,
        metadata: {
          ...validJournalist.metadata,
          theme: 'detective'
        }
      };

      const result = validator.validate('content-bundle', detectiveBundle);

      expect(result.valid).toBe(true);
    });
  });

  describe('validate - invalid ContentBundle', () => {
    it('should reject ContentBundle missing required sections array', () => {
      const result = validator.validate('content-bundle', invalidMissingSections);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeInstanceOf(Array);
      expect(result.errors.length).toBeGreaterThan(0);

      // Should report missing 'sections' property
      const sectionError = result.errors.find(
        e => e.keyword === 'required' && e.missingProperty === 'sections'
      );
      expect(sectionError).toBeDefined();
    });

    it('should reject ContentBundle with empty sections array', () => {
      const emptySections = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: []
      };

      const result = validator.validate('content-bundle', emptySections);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ keyword: 'minItems' })
      );
    });

    it('should reject ContentBundle with invalid theme', () => {
      const invalidTheme = {
        metadata: {
          sessionId: 'test',
          theme: 'invalid-theme',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          { id: 's1', type: 'narrative', content: [] }
        ]
      };

      const result = validator.validate('content-bundle', invalidTheme);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({
          keyword: 'enum',
          allowedValues: ['journalist', 'detective']
        })
      );
    });

    it('should reject ContentBundle with headline too short', () => {
      const shortHeadline = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Short' },
        sections: [
          { id: 's1', type: 'narrative', content: [] }
        ]
      };

      const result = validator.validate('content-bundle', shortHeadline);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ keyword: 'minLength' })
      );
    });

    it('should reject ContentBundle with invalid date-time format', () => {
      const invalidDate = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: 'not-a-date'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          { id: 's1', type: 'narrative', content: [] }
        ]
      };

      const result = validator.validate('content-bundle', invalidDate);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ keyword: 'format' })
      );
    });

    it('should reject ContentBundle with invalid section type', () => {
      const invalidSectionType = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          { id: 's1', type: 'invalid-type', content: [] }
        ]
      };

      const result = validator.validate('content-bundle', invalidSectionType);

      expect(result.valid).toBe(false);
    });

    it('should reject ContentBundle with additional properties', () => {
      const extraProps = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          { id: 's1', type: 'narrative', content: [] }
        ],
        unknownField: 'should not be here'
      };

      const result = validator.validate('content-bundle', extraProps);

      expect(result.valid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.objectContaining({ keyword: 'additionalProperties' })
      );
    });
  });

  describe('validate - content blocks', () => {
    it('should accept valid paragraph content', () => {
      const withParagraph = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'narrative',
            content: [
              { type: 'paragraph', text: 'This is a valid paragraph.' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', withParagraph);

      expect(result.valid).toBe(true);
    });

    it('should accept valid quote content', () => {
      const withQuote = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'narrative',
            content: [
              { type: 'quote', text: 'A notable quote.', attribution: 'Source' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', withQuote);

      expect(result.valid).toBe(true);
    });

    it('should accept valid evidence-reference content', () => {
      const withEvidence = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'evidence-highlight',
            content: [
              { type: 'evidence-reference', tokenId: 'doc001', caption: 'Bank records' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', withEvidence);

      expect(result.valid).toBe(true);
    });

    it('should accept valid list content', () => {
      const withList = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'narrative',
            content: [
              { type: 'list', ordered: true, items: ['Item 1', 'Item 2'] }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', withList);

      expect(result.valid).toBe(true);
    });

    it('should reject list with empty items array', () => {
      const emptyList = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'narrative',
            content: [
              { type: 'list', items: [] }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', emptyList);

      expect(result.valid).toBe(false);
    });

    it('should reject quote missing attribution', () => {
      const missingAttribution = {
        metadata: {
          sessionId: 'test',
          theme: 'journalist',
          generatedAt: '2024-12-23T10:00:00.000Z'
        },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [
          {
            id: 's1',
            type: 'narrative',
            content: [
              { type: 'quote', text: 'A quote without attribution' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', missingAttribution);

      expect(result.valid).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown schema', () => {
      expect(() => {
        validator.validate('unknown-schema', {});
      }).toThrow('Unknown schema: unknown-schema');
    });

    it('should allow registering custom schemas', () => {
      const customSchema = {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' }
        }
      };

      validator.registerSchema('custom', customSchema);

      expect(validator.hasSchema('custom')).toBe(true);

      const result = validator.validate('custom', { name: 'test' });
      expect(result.valid).toBe(true);
    });

    it('should throw error for invalid schema registration', () => {
      const invalidSchema = {
        type: 'invalid-type'
      };

      expect(() => {
        validator.registerSchema('bad-schema', invalidSchema);
      }).toThrow(/Failed to compile schema/);
    });
  });

  describe('formatErrors', () => {
    it('should format errors with path and message', () => {
      const result = validator.validate('content-bundle', {});

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);

      result.errors.forEach(error => {
        expect(error).toHaveProperty('path');
        expect(error).toHaveProperty('message');
        expect(error).toHaveProperty('keyword');
      });
    });

    it('should include missingProperty for required errors', () => {
      const result = validator.validate('content-bundle', {});

      const requiredError = result.errors.find(e => e.keyword === 'required');
      expect(requiredError).toBeDefined();
      expect(requiredError.missingProperty).toBeDefined();
    });
  });
});
