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

const { isBuriedTransactionRow, renderMorningTimeline } = require('../prompt-renderers/record-view');
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

  it('is the rule the morning timeline applies to sales (phase 3: it replaced the <buried-transactions> block)', () => {
    const block = renderMorningTimeline(bundleWith([...SOLD, ...UNSOLD]), {});
    expect(block.split('\n').filter((l) => l.includes('| sale |'))).toHaveLength(2);
  });

  it('keeps a row whose time the parse wrote as "Not recorded": a sale whose details the record lacks (phase 3 ruling, 3.3)', () => {
    // 092026's bundle holds two such rows: no account, no amount, time "Not recorded".
    // The parse took them from the session report's list of buried memories, so each is
    // a sale; an all-null row is a memory no one scanned. The timeline prints the row
    // with its missing fields marked, and an entry that looks wrong goes to the director
    // as a question (T5, C15), which a writer can raise only about a row it sees.
    const notRecorded = { sourceType: 'memory-token', shellAccount: null, amount: null, time: 'Not recorded', temporalContext: 'INVESTIGATION' };
    expect(isBuriedTransactionRow(notRecorded)).toBe(true);
    const block = renderMorningTimeline(bundleWith([SOLD[0], notRecorded]), {});
    expect(block).toContain('- Not recorded | sale | account: (not recorded) | amount: (not recorded)');
  });
});

describe('the arc writer, its reworker and the arc judge share the rule', () => {
  const ROWS = [UNSOLD[0], SOLD[0], UNSOLD[1], SOLD[1], UNSOLD[2]];

  it('extractEvidenceSummary lists only the sold rows', () => {
    const { buriedTransactions } = arcTesting.extractEvidenceSummary(bundleWith(ROWS));
    expect(buriedTransactions.map((t) => t.shellAccount)).toEqual(['Melanie', 'Gorlan']);
  });

  it('the journalist arc writer (and so its reworker) reads the 2 sales on the record view\'s timeline (phase 3, 3.3)', () => {
    const state = { ...reworkFixtureState('journalist'), evidenceBundle: bundleWith(ROWS) };
    const sections = arcTesting.buildCoreArcSections(state);
    expect(sections).not.toContain('### Buried Transactions');
    const timeline = sections.slice(sections.indexOf('<morning-timeline>\n'), sections.indexOf('</morning-timeline>'));
    expect(timeline.split('\n').filter((l) => l.includes('| sale |'))).toHaveLength(2);
  });

  it('the detective arc writer (and so its reworker, built from its sections) counts and lists 2 rows', () => {
    const state = { ...reworkFixtureState('detective'), evidenceBundle: bundleWith(ROWS) };
    const sections = arcTesting.buildCoreArcSections(state);
    expect(sections).toContain('### Buried Transactions (2 items - Layer 2, INVESTIGATION ACTIONS)');
    const list = sections.slice(sections.indexOf('### Buried Transactions'), sections.indexOf('### All Valid Evidence IDs'));
    // No unsold memory's all-null row (a sold row may still lack one field).
    expect(list).not.toContain('"shellAccount": null');
    expect(list.match(/"shellAccount"/g)).toHaveLength(2);
  });

  // Phase 3 (3.4): the journalist arc judge reads the sales on the record view's morning
  // timeline, under the same rule, in place of a list of its own; the detective keeps it.
  it('the journalist arc judge reads 2 sales on the timeline and no "Unknown" account', () => {
    const state = { ...reworkFixtureState('journalist'), evidenceBundle: bundleWith(ROWS), narrativeArcs: [] };
    const prompt = evalTesting.buildEvaluationUserPrompt('arcs', state, {});
    expect(prompt).not.toContain('BURIED TRANSACTIONS (');
    const timeline = prompt.slice(prompt.indexOf('<morning-timeline>'), prompt.indexOf('</morning-timeline>'));
    expect(timeline.split('\n').filter((l) => l.includes('| sale |'))).toHaveLength(2);
    expect(timeline).not.toContain('Unknown');
    expect(timeline).toContain('account: Melanie');
    expect(timeline).toContain('account: Gorlan');
  });

  it('the detective arc judge lists 2 rows and no "Unknown" account', () => {
    const state = { ...reworkFixtureState('detective'), evidenceBundle: bundleWith(ROWS), narrativeArcs: [] };
    const prompt = evalTesting.buildEvaluationUserPrompt('arcs', state, {});
    expect(prompt).toContain('BURIED TRANSACTIONS (2 - for amount/account verification):');
    const list = prompt.slice(prompt.indexOf('BURIED TRANSACTIONS ('), prompt.indexOf('EVALUATION CHECKLIST'));
    expect(list).not.toContain('Unknown');
    expect(list).toContain('"accountName": "Melanie"');
    expect(list).toContain('"accountName": "Gorlan"');
  });
});
