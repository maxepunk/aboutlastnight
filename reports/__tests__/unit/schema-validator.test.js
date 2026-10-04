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

    it('should ACCEPT ContentBundle with a non-ISO generatedAt (format intentionally not enforced)', () => {
      // generatedAt is server-stamped (ai-nodes.js generateContentBundle:1218), so the schema
      // deliberately carries no `format:"date-time"` — that keyword silently disables the
      // SDK constrained-decoding channel (#277). This test locks in the relaxation.
      const nonIsoDate = {
        metadata: { sessionId: 'test', theme: 'journalist', generatedAt: 'not-a-date' },
        headline: { main: 'Valid Headline With Enough Length' },
        sections: [{ id: 's1', type: 'narrative', content: [] }]
      };
      const result = validator.validate('content-bundle', nonIsoDate);
      expect(result.valid).toBe(true);
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

    it('accepts a quote with attribution omitted (F3 crystallization, CR-2)', () => {
      const omittedAttribution = {
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
              { type: 'quote', text: 'The room rewrote the night it had just lived.' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', omittedAttribution);

      expect(result.valid).toBe(true);
    });

    it('should reject quote missing text', () => {
      const missingText = {
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
              { type: 'quote', attribution: 'Skyler' }
            ]
          }
        ]
      };

      const result = validator.validate('content-bundle', missingText);

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

/**
 * Phase 3 (3.2): the schemas decide shape only (names, types, required fields); the
 * rule set decides content. Fields that never print stay optional and unasked (HY1;
 * the integrator's ruling: the article stop's sidebar editor writes `owner`, and the
 * parked detective prompt asks for `photos` and `voice_self_check`).
 */
describe('phase 3 (3.2): shape-only schemas', () => {
  const contentBundleSchema = require('../../lib/schemas/content-bundle.schema.json');
  const outlineSchema = require('../../lib/schemas/outline.schema.json');
  const validator = new SchemaValidator();
  const minimal = () => ({
    metadata: { sessionId: '010126', theme: 'journalist', generatedAt: '2026-01-01T00:00:00Z' },
    headline: { main: 'NeurAI Pays to Forget' },
    sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'One.' }] }]
  });

  /** Every description string in a schema, by its path. */
  function descriptions(node, at = '') {
    if (!node || typeof node !== 'object') return [];
    const own = typeof node.description === 'string' ? [[at || '/', node.description]] : [];
    return own.concat(...Object.entries(node).map(([k, v]) => descriptions(v, `${at}/${k}`)));
  }

  it('a sidebar entry with an owner is accepted', () => {
    const bundle = minimal();
    bundle.evidenceCards = [{ tokenId: 'ale003', headline: 'The brag', summary: 'Marcus brags', owner: 'Alex Reeves', significance: 'critical', placement: 'sidebar' }];
    expect(validator.validate('content-bundle', bundle).valid).toBe(true);
  });

  it('the fields nothing prints are optional: a bundle without them is valid, and one with them too', () => {
    expect(validator.validate('content-bundle', minimal()).valid).toBe(true);
    ['photos', 'pullQuotes', 'voice_self_check', 'financialTracker', 'evidenceCards', 'byline', 'heroImage'].forEach((field) => {
      expect(contentBundleSchema.required).not.toContain(field);
    });
    const withThem = {
      ...minimal(),
      photos: [{ filename: 'p.jpg', caption: 'A caption' }],
      pullQuotes: [{ type: 'verbatim', text: 'Worth it.', attribution: 'Marcus Blackwood' }],
      voice_self_check: { overall_assessment: 'fine' },
      financialTracker: { entries: [{ description: 'Ember', amount: '$5' }], totalExposed: '$5' }
    };
    expect(validator.validate('content-bundle', withThem).valid).toBe(true);
  });

  it.each([
    ['content-bundle', contentBundleSchema],
    ['outline', outlineSchema]
  ])('the %s schema descriptions carry no content rule and no implementation note', (name, schema) => {
    const CONTENT_OR_IMPLEMENTATION = /prose only|no HTML|OMIT for|crystallization|quotable|inline article placement|summarizing|mystery|central conflict|systemic|murder|#277|format:date-time|lib\/|templates\/|\.hbs|\.js\b|SDK|future compatibility|for styling|template selection|for debugging|Skyler|buried|\bNova\b|\u2014/i;
    const offending = descriptions(schema).filter(([, text]) => CONTENT_OR_IMPLEMENTATION.test(text));
    expect(offending).toEqual([]);
  });

  // Phase 4 (brief 4.6): the map lays the settled weave out; the convergence is the weave's,
  // and the map's schema holds slots, beats and photos.
  it("the map's schema holds slots, beats and photos, with no convergence of its own", () => {
    expect(Object.keys(outlineSchema.properties)).toEqual(['headline', 'deck', 'topPhoto', 'gapNote', 'sections', 'dropped', 'leftOut', 'expectedLength', 'weaveChanges']);
    expect(JSON.stringify(outlineSchema)).not.toMatch(/convergence/);
  });
});
