/**
 * Node Helpers Unit Tests - Batch 3A.5
 *
 * Tests the buildRevisionContext helper function, specifically
 * the humanFeedback parameter added in Batch 3A.4.
 *
 * buildRevisionContext is used by all revision loops (arcs, outline, article)
 * to provide targeted revision context instead of full regeneration.
 */

const { buildRevisionContext, validateFinancialData } = require('../../../lib/workflow/nodes/node-helpers');

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

describe('validateFinancialData', () => {
  it('should flag financial tracker entries that deviate from shell account totals', () => {
    const financialTracker = {
      entries: [
        { name: 'Cayman', amount: '$1,455,000' },
        { name: 'Sarah', amount: '$125,000' }  // WRONG
      ]
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000 },
      { name: 'Sarah', total: 350000 }
    ];

    const issues = validateFinancialData(financialTracker, shellAccounts);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain('Sarah');
    expect(issues[0]).toContain('350,000');
  });

  it('should return empty array when all amounts match', () => {
    const financialTracker = {
      entries: [
        { name: 'Cayman', amount: '$1,455,000' },
        { name: 'Sarah', amount: '$350,000' }
      ]
    };
    const shellAccounts = [
      { name: 'Cayman', total: 1455000 },
      { name: 'Sarah', total: 350000 }
    ];

    const issues = validateFinancialData(financialTracker, shellAccounts);
    expect(issues).toEqual([]);
  });

  it('should handle numeric amount values', () => {
    const financialTracker = {
      entries: [{ name: 'Cayman', amount: 1455000 }]
    };
    const shellAccounts = [{ name: 'Cayman', total: 1455000 }];

    expect(validateFinancialData(financialTracker, shellAccounts)).toEqual([]);
  });

  it('should return empty when inputs are null/empty', () => {
    expect(validateFinancialData(null, [])).toEqual([]);
    expect(validateFinancialData({}, [{ name: 'X', total: 100 }])).toEqual([]);
    expect(validateFinancialData({ entries: [] }, [])).toEqual([]);
  });

  it('should be case-insensitive on account names', () => {
    const financialTracker = {
      entries: [{ name: 'CAYMAN', amount: '$1,455,000' }]
    };
    const shellAccounts = [{ name: 'Cayman', total: 1455000 }];

    expect(validateFinancialData(financialTracker, shellAccounts)).toEqual([]);
  });
});
