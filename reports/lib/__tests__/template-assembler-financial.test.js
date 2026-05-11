/**
 * Tests for TemplateAssembler.overrideFinancialTracker.
 *
 * Regression coverage for the 050926 bug: the LLM's financialTracker.entries
 * had prose in description/amount fields, the prior override looked at
 * non-existent entry.name/entry.account, and the prose flowed through to the
 * template (bar widths computed as 0% because amount didn't parse as currency).
 *
 * New contract: when shellAccounts has positive-total accounts, override
 * REPLACES the LLM entries with deterministic ones derived from shellAccounts.
 */

const { TemplateAssembler } = require('../template-assembler');

describe('TemplateAssembler.overrideFinancialTracker', () => {
  const assembler = new TemplateAssembler('journalist');

  test('generates entries from shellAccounts when provided, ignoring LLM data', () => {
    const llmTracker = {
      entries: [
        // Simulates the 050926 failure: prose in fields meant to be account/dollar.
        { description: 'Account in Jamie\'s name (declared comfortable)', amount: 'Largest single concentration' },
        { description: 'Some narrative about Sarah', amount: 'Substantial routing' }
      ],
      totalExposed: 'Multi-million concentration'
    };
    const shellAccounts = [
      { name: 'Sarah', total: 385003, tokenCount: 6 },
      { name: 'Jamie', total: 1299997, tokenCount: 7 }
    ];

    const result = assembler.overrideFinancialTracker(llmTracker, shellAccounts);

    expect(result.entries).toHaveLength(2);
    // Sorted by total descending — Jamie first.
    expect(result.entries[0]).toEqual({
      description: 'Jamie',
      amount: '$1,299,997',
      category: 'shell-account'
    });
    expect(result.entries[1]).toEqual({
      description: 'Sarah',
      amount: '$385,003',
      category: 'shell-account'
    });
    expect(result.totalExposed).toBe('$1,685,000');
  });

  test('passes LLM tracker through unchanged when shellAccounts is empty', () => {
    const llmTracker = {
      entries: [{ description: 'whatever', amount: '$50' }],
      totalExposed: '$50'
    };

    expect(assembler.overrideFinancialTracker(llmTracker, [])).toBe(llmTracker);
    expect(assembler.overrideFinancialTracker(llmTracker, null)).toBe(llmTracker);
    expect(assembler.overrideFinancialTracker(llmTracker, undefined)).toBe(llmTracker);
  });

  test('filters out shell accounts with zero or negative totals', () => {
    const shellAccounts = [
      { name: 'Jamie', total: 100000 },
      { name: 'Empty', total: 0 },
      { name: 'Negative', total: -50 }
    ];

    const result = assembler.overrideFinancialTracker({ entries: [] }, shellAccounts);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].description).toBe('Jamie');
  });

  test('treats shellAccounts as authoritative even when LLM tracker is empty', () => {
    const shellAccounts = [{ name: 'Sole', total: 12345 }];

    const result = assembler.overrideFinancialTracker(null, shellAccounts);
    expect(result.entries).toEqual([
      { description: 'Sole', amount: '$12,345', category: 'shell-account' }
    ]);
    expect(result.totalExposed).toBe('$12,345');
  });

  test('skips shellAccounts entries that lack a name', () => {
    const shellAccounts = [
      { name: 'Valid', total: 100 },
      { total: 200 },           // missing name
      { name: '', total: 300 }, // empty name
    ];

    const result = assembler.overrideFinancialTracker({ entries: [] }, shellAccounts);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].description).toBe('Valid');
  });

  test('preserves non-entry top-level fields from LLM tracker', () => {
    const llmTracker = {
      entries: [{ description: 'old', amount: '$0' }],
      // future fields that might be added — should pass through
      _someExtension: { meta: 'preserved' }
    };
    const shellAccounts = [{ name: 'A', total: 100 }];

    const result = assembler.overrideFinancialTracker(llmTracker, shellAccounts);
    expect(result._someExtension).toEqual({ meta: 'preserved' });
  });
});
