/**
 * Node Helpers Unit Tests - Batch 3A.5
 *
 * Tests the buildRevisionContext helper function, specifically
 * the humanFeedback parameter added in Batch 3A.4.
 *
 * buildRevisionContext is used by all revision loops (arcs, outline, article)
 * to provide targeted revision context instead of full regeneration.
 */

const { buildRevisionContext } = require('../../../lib/workflow/nodes/node-helpers');

describe('buildRevisionContext', () => {
  describe('with humanFeedback', () => {
    test('includes HUMAN FEEDBACK section when humanFeedback provided', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: { sections: [] },
        humanFeedback: 'Fix the lede hook'
      });
      expect(contextSection).toContain('HUMAN FEEDBACK');
      expect(contextSection).toContain('Fix the lede hook');
    });

    test('omits HUMAN FEEDBACK section when humanFeedback is null', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: { sections: [] },
        humanFeedback: null
      });
      expect(contextSection).not.toContain('HUMAN FEEDBACK');
    });

    test('omits HUMAN FEEDBACK section when humanFeedback is undefined', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: { sections: [] }
      });
      expect(contextSection).not.toContain('HUMAN FEEDBACK');
    });

    test('omits HUMAN FEEDBACK section when humanFeedback is empty string', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: { sections: [] },
        humanFeedback: ''
      });
      expect(contextSection).not.toContain('HUMAN FEEDBACK');
    });

    test('includes HIGHEST PRIORITY note when humanFeedback provided', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'article',
        revisionCount: 2,
        validationResults: {},
        previousOutput: {},
        humanFeedback: 'Rewrite the conclusion'
      });
      expect(contextSection).toContain('HIGHEST PRIORITY');
      expect(contextSection).toContain('Rewrite the conclusion');
    });
  });

  describe('basic structure', () => {
    test('returns contextSection and previousOutputSection', () => {
      const result = buildRevisionContext({
        phase: 'arcs',
        revisionCount: 1,
        validationResults: {},
        previousOutput: []
      });
      expect(result).toHaveProperty('contextSection');
      expect(result).toHaveProperty('previousOutputSection');
      expect(typeof result.contextSection).toBe('string');
      expect(typeof result.previousOutputSection).toBe('string');
    });

    test('includes phase name in context section', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: {}
      });
      expect(contextSection).toContain('OUTLINE');
    });

    test('includes revision count in context section', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'arcs',
        revisionCount: 2,
        validationResults: {},
        previousOutput: []
      });
      expect(contextSection).toContain('Attempt 2');
    });

    test('includes previous output in previousOutputSection', () => {
      const { previousOutputSection } = buildRevisionContext({
        phase: 'outline',
        revisionCount: 1,
        validationResults: {},
        previousOutput: { sections: ['intro', 'body'] }
      });
      expect(previousOutputSection).toContain('intro');
      expect(previousOutputSection).toContain('body');
    });
  });
});
