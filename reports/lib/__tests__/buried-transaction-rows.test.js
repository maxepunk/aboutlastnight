/**
 * One rule for which buried rows are transactions (phase 2 final fix wave, item 2).
 *
 * fetch-nodes tagTokensWithDisposition marks every memory in neither list buried,
 * with no transaction data, so the bundle's buried list holds memories no one sold.
 * The record view drops a row with no account, amount or time. extractEvidenceSummary
 * kept them: on 092026 the arc writer read "Buried Transactions (50 items)", 20 of
 * them all-null, and the arc judge listed them with the account "Unknown", while the
 * outline and article saw 30. The arc writer, its reworker and the arc judge now use
 * the view's own filter.
 */

const { isBuriedTransactionRow, renderBuriedTransactions } = require('../prompt-renderers/record-view');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { _testing: evalTesting } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState } = require('./fixtures/rework-state');

const SOLD = [
  { sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' },
  { sourceType: 'memory-token', shellAccount: 'Gorlan', amount: '$150,000', time: null, temporalContext: 'INVESTIGATION' }
];
const UNSOLD = [
  { sourceType: 'memory-token', shellAccount: null, amount: null, time: null, temporalContext: 'INVESTIGATION' },
  { sourceType: 'memory-token', shellAccount: '', amount: undefined, time: '  ', temporalContext: 'INVESTIGATION' },
  { sourceType: 'memory-token', temporalContext: 'INVESTIGATION' }
];

function bundleWith(rows) {
  const state = reworkFixtureState('journalist');
  return { ...state.evidenceBundle, buried: { transactions: rows, relationships: [] } };
}

describe('isBuriedTransactionRow: the record view\'s own rule', () => {
  it('keeps a row with an account, an amount or a time, and drops one with none', () => {
    expect(SOLD.map(isBuriedTransactionRow)).toEqual([true, true]);
    expect(UNSOLD.map(isBuriedTransactionRow)).toEqual([false, false, false]);
    expect([null, undefined, 'x'].map(isBuriedTransactionRow)).toEqual([false, false, false]);
  });

  it('is the rule the <buried-transactions> block applies', () => {
    const block = renderBuriedTransactions(bundleWith([...SOLD, ...UNSOLD]));
    expect(block.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2);
  });
});

describe('the arc writer, its reworker and the arc judge share the rule', () => {
  const ROWS = [UNSOLD[0], SOLD[0], UNSOLD[1], SOLD[1], UNSOLD[2]];

  it('extractEvidenceSummary lists only the sold rows', () => {
    const { buriedTransactions } = arcTesting.extractEvidenceSummary(bundleWith(ROWS));
    expect(buriedTransactions.map((t) => t.shellAccount)).toEqual(['Melanie', 'Gorlan']);
  });

  it('the arc writer (and so its reworker, built from its sections) counts and lists 2 rows', () => {
    const state = { ...reworkFixtureState('journalist'), evidenceBundle: bundleWith(ROWS) };
    const sections = arcTesting.buildCoreArcSections(state);
    expect(sections).toContain('### Buried Transactions (2 items - Layer 2, INVESTIGATION ACTIONS)');
    const list = sections.slice(sections.indexOf('### Buried Transactions'), sections.indexOf('### All Valid Evidence IDs'));
    // No unsold memory's all-null row (a sold row may still lack one field).
    expect(list).not.toContain('"shellAccount": null');
    expect(list.match(/"shellAccount"/g)).toHaveLength(2);
  });

  it('the arc judge lists 2 rows and no "Unknown" account', () => {
    const state = { ...reworkFixtureState('journalist'), evidenceBundle: bundleWith(ROWS), narrativeArcs: [] };
    const prompt = evalTesting.buildEvaluationUserPrompt('arcs', state, {});
    expect(prompt).toContain('BURIED TRANSACTIONS (2 - for amount/account verification):');
    const list = prompt.slice(prompt.indexOf('BURIED TRANSACTIONS ('), prompt.indexOf('EVALUATION CHECKLIST'));
    expect(list).not.toContain('Unknown');
    expect(list).toContain('"accountName": "Melanie"');
    expect(list).toContain('"accountName": "Gorlan"');
  });
});
