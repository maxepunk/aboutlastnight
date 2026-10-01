/**
 * Node-env unit tests for the InputReview pronoun resolver (F1 / X-4).
 * Pure logic extracted to a dual-export module per reports/CLAUDE.md.
 */
const { resolveRosterPronoun } = require('../input-review-logic');

describe('resolveRosterPronoun (X-4 review-gate lookup)', () => {
  const map = { Victoria: 'she/her', Sam: 'he/him' };

  it('returns the exact-key pronoun', () => {
    expect(resolveRosterPronoun('Victoria', map)).toBe('she/her');
  });

  it('is case-insensitive (parsed "victoria" still finds the director-set pronoun)', () => {
    expect(resolveRosterPronoun('victoria', map)).toBe('she/her');
  });

  it('defaults to they/them for an unknown name', () => {
    expect(resolveRosterPronoun('Mystery', map)).toBe('they/them');
  });

  it('defaults to they/them for a null/empty map', () => {
    expect(resolveRosterPronoun('Victoria', null)).toBe('they/them');
    expect(resolveRosterPronoun('Victoria', {})).toBe('they/them');
  });

  it('resolves a full-name key (feeder may key by the free-typed roster name)', () => {
    expect(resolveRosterPronoun('Sarah Blackwood', { 'Sarah Blackwood': 'she/her' })).toBe('she/her');
  });

  it('returns they/them for an Object.prototype key name (no inherited-member leak)', () => {
    expect(resolveRosterPronoun('constructor', {})).toBe('they/them');
    expect(resolveRosterPronoun('toString', {})).toBe('they/them');
  });
});

// ── Phase 3, brief 3.5: the session clock and the ledger at the input review ──

const { clockLine, ledgerView } = require('../input-review-logic');

describe('clockLine: which clock rule applied', () => {
  it('names the evening rule, the daytime rule, and a clock no time decided', () => {
    expect(clockLine({ decided: true, evening: true, firstTime: '07:37 PM' }))
      .toBe('Evening session: logged times shown as morning (first exposure or sale at 07:37 PM)');
    expect(clockLine({ decided: true, evening: false, firstTime: '02:25 PM' }))
      .toBe('Daytime session: logged times shown as logged (first exposure or sale at 02:25 PM)');
    expect(clockLine({ decided: false, evening: false, firstTime: null }))
      .toBe('Clock not decided: no exposure or sale time was parsed');
    expect(clockLine(null)).toBe('Clock not decided: no exposure or sale time was parsed');
  });
});

describe('ledgerView: the adjustments beside the sales', () => {
  const ledger = {
    clock: { decided: true, evening: true, firstTime: '07:37 PM' },
    adjustmentsParsed: true,
    adjustments: [
      { time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' },
      { time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' }
    ],
    accounts: [
      { name: 'Ember', total: 925000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 375000, tokenCount: 0, rank: 2 }
    ],
    mismatches: [],
    unclassified: []
  };

  it('lists each account with its total and sale count, and each adjustment in words', () => {
    const view = ledgerView(ledger);
    expect(view.clockLine).toBe(clockLine(ledger.clock));
    expect(view.accounts).toEqual([
      { name: 'Ember', total: '$925,000', sales: '2 sales' },
      { name: 'L', total: '$375,000', sales: 'no sales' }
    ]);
    expect(view.adjustments).toEqual([
      '07:50 PM: first-burial bonus of $50,000 paid to Ember',
      '10:30 PM: transfer of $375,000 from Vic to L'
    ]);
    expect(view.warnings).toEqual([]);
  });

  it('puts a totals mismatch first, in words the director can check against the session report', () => {
    const view = ledgerView({ ...ledger, mismatches: [{ account: 'Ember', computed: 925000, standings: 900000 }] });
    expect(view.warnings).toEqual(['Ember: the sales and adjustments add up to $925,000; the Final Standings say $900,000']);
  });

  it('says so when the adjustment rows were not parsed', () => {
    const view = ledgerView({ ...ledger, adjustmentsParsed: false, adjustments: [] });
    expect(view.warnings).toEqual([
      'Adjustments not parsed: the account totals are the session report\'s Final Standings, and no first-burial bonus or transfer reaches the writers'
    ]);
  });

  it('counts the rows it could not classify', () => {
    const view = ledgerView({ ...ledger, unclassified: [{ time: '09:00 PM', account: 'Ember', amount: 10000 }] });
    expect(view.warnings).toEqual(['1 adjustment row not classified: 09:00 PM, $10,000 on Ember']);
  });

  it('names what an unreadable row carries, and what it lacks (fix batch, finding 5)', () => {
    const view = ledgerView({ ...ledger, unclassified: [
      { time: '08:10 PM', account: '', amount: 20000 },
      { time: '08:12 PM', account: 'Vic', amount: 'twenty grand' },
      { time: '', account: '', amount: '' }
    ] });
    expect(view.warnings).toEqual([
      '3 adjustment rows not classified: 08:10 PM, $20,000 on no account; 08:12 PM, twenty grand on Vic; no amount on no account'
    ]);
  });

  it('says when no sale or account total was parsed at all', () => {
    const view = ledgerView({ ...ledger, accounts: [], adjustments: [] });
    expect(view.warnings).toEqual(['No sales or account totals parsed from the session report: the writers get no ledger']);
  });

  it('renders a missing ledger as not parsed', () => {
    const view = ledgerView(null);
    expect(view.accounts).toEqual([]);
    expect(view.warnings[0]).toMatch(/^Adjustments not parsed/);
  });
});
