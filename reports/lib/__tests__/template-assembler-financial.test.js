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

// Task 4.3b: whether the page prints the writer's money tracker is decided once, by
// writerTrackerPrints beside overrideFinancialTracker. The page (buildContext), the desk's
// preview (lib/article-preview.js) and the article judge (evaluator-nodes.js printedBundle)
// read it, so none of them can say the tracker prints where another says it does not. They
// differed on a non-object entry: the judge left it out and the other two counted it.
describe('writerTrackerPrints: one rule for the page, the desk and the judge (task 4.3b)', () => {
  const { writerTrackerPrints } = require('../template-assembler');
  const preview = require('../article-preview');
  const { _testing: { printedBundle } } = require('../workflow/nodes/evaluator-nodes');

  const ENTRY = { description: 'WritersAccount', amount: '$5,000' };
  const LEDGER = [{ name: 'JessKane', total: 3235000, tokenCount: 4 }];
  const bundleWith = (financialTracker) => ({
    metadata: { sessionId: '0926262', theme: 'journalist', generatedAt: '2026-10-02T17:09:31.000Z' },
    headline: { main: 'The Room Voted Five to Four' },
    sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'Alex asked for the scoreboard.' }] }],
    financialTracker
  });
  /** How each caller reads one bundle: does the page print the writer's tracker? */
  async function readings(bundle, shellAccounts) {
    const context = await new TemplateAssembler('journalist', { inlineCss: false, inlineJs: false })
      .buildContext(bundle, '0926262', shellAccounts);
    const pageWriters = context.hasFinancialTracker && context.financialTracker.entries.every((e) => e.category !== 'shell-account');
    return {
      page: pageWriters,
      desk: preview.writerTrackerPrints(bundle, shellAccounts),
      judge: printedBundle(bundle, shellAccounts).financialTracker !== undefined
    };
  }

  test.each([
    ['a non-object entry alone', { entries: ['$5,000 to the account'], totalExposed: '$5,000' }, false],
    ['an entry beside a non-object one', { entries: [ENTRY, 'x'], totalExposed: '$5,000' }, true],
    ['an entry', { entries: [ENTRY] }, true],
    ['no entry', { entries: [] }, false],
    ['no entries list', { totalExposed: '$5,000' }, false]
  ])('%s: the page, the desk\'s preview and the judge read it the same', async (_case, tracker, prints) => {
    expect(writerTrackerPrints(tracker, [])).toBe(prints);
    expect(await readings(bundleWith(tracker), [])).toEqual({ page: prints, desk: prints, judge: prints });
  });

  test('a ledger account above zero prints in its place, whatever the writer\'s tracker holds', async () => {
    const tracker = { entries: [ENTRY, 'x'] };
    expect(writerTrackerPrints(tracker, LEDGER)).toBe(false);
    expect(await readings(bundleWith(tracker), LEDGER)).toEqual({ page: false, desk: false, judge: false });
    // An account at zero, or one with no name, prints nothing in its place.
    expect(writerTrackerPrints(tracker, [{ name: 'Melanie', total: 0 }, { total: 9 }])).toBe(true);
  });

  test('a tracker that is not an object never prints', () => {
    [undefined, null, 'tracker', [ENTRY]].forEach((tracker) => expect([tracker, writerTrackerPrints(tracker, [])]).toEqual([tracker, false]));
  });
});
