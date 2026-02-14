/**
 * Template Helpers Unit Tests
 *
 * Tests individual helper functions for template rendering.
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const {
  formatDate,
  formatDatetime,
  significanceClass,
  sectionClass,
  contentBlockPartial,
  articleId,
  eq,
  hasItems,
  take,
  formatCurrency,
  pullQuotePlacement,
  registerHelpers,
  _testing
} = require('../../lib/template-helpers');

describe('template-helpers', () => {
  describe('formatDate', () => {
    it('formats ISO date string with long format by default', () => {
      // Use full ISO timestamp to avoid timezone issues
      const result = formatDate('2024-12-23T12:00:00');
      expect(result).toBe('December 23, 2024');
    });

    it('formats with short format', () => {
      // Use full ISO timestamp to avoid timezone issues
      const result = formatDate('2024-12-23T12:00:00', 'short');
      expect(result).toBe('Dec 23, 2024');
    });

    it('formats Date object', () => {
      const date = new Date('2024-12-23T10:30:00Z');
      const result = formatDate(date);
      expect(result).toContain('December');
      expect(result).toContain('2024');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatDate(null)).toBe('');
      expect(formatDate(undefined)).toBe('');
    });

    it('returns original string for invalid date', () => {
      expect(formatDate('not-a-date')).toBe('not-a-date');
    });
  });

  describe('formatDatetime', () => {
    it('returns ISO date format (YYYY-MM-DD)', () => {
      const result = formatDatetime('2024-12-23T10:30:00Z');
      expect(result).toBe('2024-12-23');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatDatetime(null)).toBe('');
      expect(formatDatetime(undefined)).toBe('');
    });

    it('returns empty string for invalid date', () => {
      expect(formatDatetime('invalid')).toBe('');
    });
  });

  describe('significanceClass', () => {
    it('returns correct class for critical', () => {
      expect(significanceClass('critical')).toBe('evidence-card--critical');
    });

    it('returns correct class for supporting', () => {
      expect(significanceClass('supporting')).toBe('evidence-card--supporting');
    });

    it('returns correct class for contextual', () => {
      expect(significanceClass('contextual')).toBe('evidence-card--contextual');
    });

    it('returns contextual as default for unknown values', () => {
      expect(significanceClass('unknown')).toBe('evidence-card--contextual');
      expect(significanceClass(null)).toBe('evidence-card--contextual');
    });
  });

  describe('sectionClass', () => {
    it('returns correct class for narrative', () => {
      expect(sectionClass('narrative')).toBe('nn-section--narrative');
    });

    it('returns correct class for evidence-highlight', () => {
      expect(sectionClass('evidence-highlight')).toBe('nn-section--evidence');
    });

    it('returns correct class for investigation-notes', () => {
      expect(sectionClass('investigation-notes')).toBe('nn-section--notes');
    });

    it('returns correct class for conclusion', () => {
      expect(sectionClass('conclusion')).toBe('nn-section--conclusion');
    });

    it('returns correct class for case-summary', () => {
      expect(sectionClass('case-summary')).toBe('nn-section--summary');
    });

    it('returns empty string for unknown types', () => {
      expect(sectionClass('unknown')).toBe('');
      expect(sectionClass(null)).toBe('');
    });
  });

  describe('contentBlockPartial', () => {
    it('returns correct partial for paragraph', () => {
      expect(contentBlockPartial('paragraph')).toBe('content-blocks/paragraph');
    });

    it('returns correct partial for quote', () => {
      expect(contentBlockPartial('quote')).toBe('content-blocks/quote');
    });

    it('returns correct partial for evidence-reference', () => {
      expect(contentBlockPartial('evidence-reference')).toBe('content-blocks/evidence-reference');
    });

    it('returns correct partial for list', () => {
      expect(contentBlockPartial('list')).toBe('content-blocks/list');
    });

    it('returns paragraph as default for unknown types', () => {
      expect(contentBlockPartial('unknown')).toBe('content-blocks/paragraph');
    });
  });

  describe('articleId', () => {
    it('generates NNA format for journalist theme', () => {
      const metadata = { generatedAt: '2024-12-23T14:30:00Z', theme: 'journalist' };
      const result = articleId(metadata);
      expect(result).toMatch(/^NNA-\d{4}-\d{2}$/);
    });

    it('generates DCR format for detective theme', () => {
      const metadata = { generatedAt: '2024-12-23T14:30:00Z', theme: 'detective' };
      const result = articleId(metadata);
      expect(result).toMatch(/^DCR-\d{4}-\d{2}$/);
    });

    it('defaults to NNA when no theme in metadata', () => {
      const metadata = { generatedAt: '2024-12-23T14:30:00Z' };
      const result = articleId(metadata);
      expect(result).toMatch(/^NNA-\d{4}-\d{2}$/);
    });

    it('returns theme-appropriate default for null metadata', () => {
      expect(articleId(null)).toBe('NNA-0000-00');
      expect(articleId({})).toBe('NNA-0000-00');
    });

    it('returns default for invalid date', () => {
      expect(articleId({ generatedAt: 'invalid' })).toBe('NNA-0000-00');
    });
  });

  describe('eq', () => {
    it('returns true for equal values', () => {
      expect(eq(1, 1)).toBe(true);
      expect(eq('a', 'a')).toBe(true);
      expect(eq(null, null)).toBe(true);
    });

    it('returns false for unequal values', () => {
      expect(eq(1, 2)).toBe(false);
      expect(eq('a', 'b')).toBe(false);
      expect(eq(1, '1')).toBe(false); // strict equality
    });
  });

  describe('hasItems', () => {
    it('returns true for non-empty array', () => {
      expect(hasItems([1, 2, 3])).toBe(true);
      expect(hasItems([null])).toBe(true);
    });

    it('returns false for empty array', () => {
      expect(hasItems([])).toBe(false);
    });

    it('returns false for non-array values', () => {
      expect(hasItems(null)).toBe(false);
      expect(hasItems(undefined)).toBe(false);
      expect(hasItems('string')).toBe(false);
      expect(hasItems({})).toBe(false);
    });
  });

  describe('take', () => {
    it('returns first N items', () => {
      expect(take([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3]);
    });

    it('returns all items if N exceeds length', () => {
      expect(take([1, 2], 5)).toEqual([1, 2]);
    });

    it('returns empty array for non-array', () => {
      expect(take(null, 3)).toEqual([]);
      expect(take(undefined, 3)).toEqual([]);
    });
  });

  describe('formatCurrency', () => {
    it('returns formatted string as-is', () => {
      expect(formatCurrency('$150,000')).toBe('$150,000');
    });

    it('formats number to currency string', () => {
      expect(formatCurrency(150000)).toBe('$150,000');
    });

    it('returns $0 for null/undefined', () => {
      expect(formatCurrency(null)).toBe('$0');
      expect(formatCurrency(undefined)).toBe('$0');
    });

    it('converts non-currency strings', () => {
      expect(formatCurrency('150000')).toBe('150000');
    });
  });

  describe('pullQuotePlacement', () => {
    it('returns correct class for left', () => {
      expect(pullQuotePlacement('left')).toBe('pull-quote--left');
    });

    it('returns correct class for right', () => {
      expect(pullQuotePlacement('right')).toBe('pull-quote--right');
    });

    it('returns correct class for center', () => {
      expect(pullQuotePlacement('center')).toBe('pull-quote--center');
    });

    it('returns right as default for unknown', () => {
      expect(pullQuotePlacement('unknown')).toBe('pull-quote--right');
      expect(pullQuotePlacement(null)).toBe('pull-quote--right');
    });
  });

  describe('registerHelpers', () => {
    it('registers all helpers on a Handlebars instance', () => {
      const mockHandlebars = {
        registeredHelpers: {},
        registerHelper(name, fn) {
          this.registeredHelpers[name] = fn;
        }
      };

      registerHelpers(mockHandlebars);

      // Check that key helpers are registered
      expect(mockHandlebars.registeredHelpers.formatDate).toBeDefined();
      expect(mockHandlebars.registeredHelpers.significanceClass).toBeDefined();
      expect(mockHandlebars.registeredHelpers.renderContentBlock).toBeDefined();
      expect(mockHandlebars.registeredHelpers.eachWithIndex).toBeDefined();
    });
  });

  describe('_testing exports', () => {
    describe('parseDate', () => {
      it('parses valid ISO date string', () => {
        const result = _testing.parseDate('2024-12-23T10:30:00Z');
        expect(result).toBeInstanceOf(Date);
        expect(result.getFullYear()).toBe(2024);
      });

      it('parses Date object', () => {
        const input = new Date('2024-12-23T10:30:00Z');
        const result = _testing.parseDate(input);
        expect(result).toBe(input);
      });

      it('returns null for null/undefined', () => {
        expect(_testing.parseDate(null)).toBeNull();
        expect(_testing.parseDate(undefined)).toBeNull();
      });

      it('returns null for invalid date string', () => {
        expect(_testing.parseDate('not-a-date')).toBeNull();
        expect(_testing.parseDate('invalid')).toBeNull();
      });
    });

    describe('mapToClass', () => {
      const testMappings = {
        a: 'class-a',
        b: 'class-b'
      };

      it('returns mapped class for valid value', () => {
        expect(_testing.mapToClass('a', testMappings)).toBe('class-a');
        expect(_testing.mapToClass('b', testMappings)).toBe('class-b');
      });

      it('returns default class for unknown value', () => {
        expect(_testing.mapToClass('unknown', testMappings, 'default-class')).toBe('default-class');
      });

      it('returns empty string when no default provided', () => {
        expect(_testing.mapToClass('unknown', testMappings)).toBe('');
      });

      it('returns default for null/undefined', () => {
        expect(_testing.mapToClass(null, testMappings, 'fallback')).toBe('fallback');
        expect(_testing.mapToClass(undefined, testMappings, 'fallback')).toBe('fallback');
      });
    });

    describe('compilePartial', () => {
      it('returns function partial as-is', () => {
        const fn = () => 'test';
        const mockHandlebars = { compile: jest.fn() };
        const result = _testing.compilePartial(mockHandlebars, fn);
        expect(result).toBe(fn);
        expect(mockHandlebars.compile).not.toHaveBeenCalled();
      });

      it('compiles string partial', () => {
        const compiled = () => 'compiled';
        const mockHandlebars = { compile: jest.fn(() => compiled) };
        const result = _testing.compilePartial(mockHandlebars, 'template string');
        expect(result).toBe(compiled);
        expect(mockHandlebars.compile).toHaveBeenCalledWith('template string');
      });
    });

    describe('constant exports', () => {
      it('exports SIGNIFICANCE_CLASSES', () => {
        expect(_testing.SIGNIFICANCE_CLASSES).toBeDefined();
        expect(_testing.SIGNIFICANCE_CLASSES.critical).toBe('evidence-card--critical');
      });

      it('exports SECTION_CLASSES', () => {
        expect(_testing.SECTION_CLASSES).toBeDefined();
        expect(_testing.SECTION_CLASSES.narrative).toBe('nn-section--narrative');
      });

      it('exports PLACEMENT_CLASSES', () => {
        expect(_testing.PLACEMENT_CLASSES).toBeDefined();
        expect(_testing.PLACEMENT_CLASSES.left).toBe('pull-quote--left');
      });

      it('exports CONTENT_BLOCK_PARTIALS', () => {
        expect(_testing.CONTENT_BLOCK_PARTIALS).toBeDefined();
        expect(_testing.CONTENT_BLOCK_PARTIALS.paragraph).toBe('content-blocks/paragraph');
      });
    });
  });
});
