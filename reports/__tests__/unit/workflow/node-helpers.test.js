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

    // Brief 1.4: the counter this prints is the AUTOMATED pass number, which resets
    // at the start of every round of the director's, so "Attempt 0" was about to
    // become a routine header. The label says what the number counts.
    test('names the automated pass number in the context section', () => {
      const { contextSection } = buildRevisionContext({
        phase: 'arcs',
        revisionCount: 2,
        validationResults: {},
        previousOutput: []
      });
      expect(contextSection).toContain('automated pass 2');
      expect(contextSection).not.toContain('Attempt');
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

/**
 * M29 (phase 3, brief 3.3): validateFinancialData read the tracker entries' `name` and
 * `account`, which the content-bundle schema forbids (an entry names its account in
 * `description`), so it matched nothing. The assembler replaces the tracker from the
 * ledger anyway (template-assembler.js overrideFinancialTracker), and the writer is no
 * longer asked for tracker entries (3.2), so the check goes with its one caller in
 * assembleHtml.
 */
describe('validateFinancialData (M29)', () => {
  it('is gone, with its caller', () => {
    const fs = require('fs');
    const path = require('path');
    expect(require('../../../lib/workflow/nodes/node-helpers').validateFinancialData).toBeUndefined();
    const source = fs.readFileSync(path.join(__dirname, '../../../lib/workflow/nodes/template-nodes.js'), 'utf8');
    expect(source).not.toContain('validateFinancialData');
  });
});
