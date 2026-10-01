/**
 * The ledger, from the session report (phase 3, brief 3.5; spec section 6, T5).
 *
 * The session report's Adjustment rows are the game master's double-entry
 * bookkeeping. 092026 read, in this shape: a setup row funding a holding account an
 * hour and a half before the first exposure, the bonus paid at the first sale, and its
 * reversal a minute later. The Final Standings count the bonus in that account's total
 * and list the holding account at 0. These rows are synthetic, in that shape: no test
 * reads data/.
 *
 * Code classifies the rows (the bonus as one event paid to an account, a transfer as a
 * row between two players' accounts, the setup and reversal dropped as bookkeeping),
 * computes each account's total and sale count, and checks the totals against the
 * Final Standings.
 */

const { classifyAdjustments, buildLedger, ledgerReviewOf } = require('../session-ledger');

/** The bonus, as 092026's report wrote it. */
const BONUS_ROWS = [
  { time: '06:02 PM', detail: 'Holding Account (GM_Station_1)', team: 'First Burial Bonus', amount: 50000 },
  { time: '07:50 PM', detail: 'First burial bonus (GM_Station_1)', team: 'Ember', amount: 50000 },
  { time: '07:51PM', detail: 'ToEmber(GMStation1)', team: 'FirstBurialBonus', amount: -50000 }
];

/** A transfer from the Vic account to one called L, in the same double-entry shape. */
const TRANSFER_ROWS = [
  { time: '10:30 PM', detail: 'Vic (GM_Station_1)', team: 'L', amount: 375000 },
  { time: '10:30 PM', detail: 'ToL(GMStation1)', team: 'Vic', amount: -375000 }
];

const SALES = [
  { tokenId: 'aaa001', shellAccount: 'Ember', amount: 500000, time: '07:50 PM' },
  { tokenId: 'aaa002', shellAccount: 'Ember', amount: 375000, time: '08:02 PM' },
  { tokenId: 'bbb001', shellAccount: 'Vic', amount: 400000, time: '09:15 PM' }
];

const STANDINGS = [
  { name: 'Ember', total: 925000 },
  { name: 'L', total: 375000 },
  { name: 'Vic', total: 25000 },
  { name: 'First Burial Bonus', total: 0 },
  { name: 'Ashe', total: 0 }
];

describe('classifyAdjustments', () => {
  it('turns 092026\'s three bonus rows into one bonus paid to the account that received it', () => {
    const { adjustments, unclassified } = classifyAdjustments(BONUS_ROWS);
    expect(adjustments).toEqual([{ time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }]);
    expect(unclassified).toEqual([]);
  });

  it('turns a transfer\'s two rows into one transfer between two players\' accounts', () => {
    const { adjustments } = classifyAdjustments(TRANSFER_ROWS);
    expect(adjustments).toEqual([{ time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' }]);
  });

  it('pairs a transfer\'s two rows whatever its credit row\'s Detail says', () => {
    const { adjustments } = classifyAdjustments([
      { time: '10:30 PM', detail: 'Transfer (GM_Station_1)', team: 'L', amount: 375000 },
      { time: '10:30 PM', detail: 'ToL(GMStation1)', team: 'Vic', amount: -375000 }
    ]);
    expect(adjustments).toEqual([{ time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' }]);
  });

  it('keeps no Detail label: nothing a game master wrote reaches an event', () => {
    const { adjustments } = classifyAdjustments([...BONUS_ROWS, ...TRANSFER_ROWS]);
    expect(JSON.stringify(adjustments)).not.toMatch(/GM|Station|Holding/i);
  });

  it('reports a row it cannot read as unclassified, by account, amount and time only', () => {
    const { adjustments, unclassified } = classifyAdjustments([
      { time: '09:00 PM', detail: 'Holding Account (GM_Station_1)', team: 'Ember', amount: 10000 }
    ]);
    expect(adjustments).toEqual([]);
    expect(unclassified).toEqual([{ time: '09:00 PM', account: 'Ember', amount: 10000 }]);
  });
});

describe('buildLedger: each account\'s total and sale count, checked against the Final Standings', () => {
  it('totals sales, plus the bonus and transfers received, less transfers sent, and they reconcile', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: STANDINGS });
    expect(ledger.shellAccounts).toEqual([
      { name: 'Ember', total: 925000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 375000, tokenCount: 0, rank: 2 },
      { name: 'Vic', total: 25000, tokenCount: 1, rank: 3 }
    ]);
    expect(ledger.ledgerCheck).toEqual({ adjustmentsParsed: true, mismatches: [], unclassified: [] });
    expect(ledger.adjustments).toHaveLength(2);
  });

  it('keeps an account funded only by transfer', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: TRANSFER_ROWS, finalStandings: [] });
    expect(ledger.shellAccounts.find((a) => a.name === 'L')).toEqual({ name: 'L', total: 375000, tokenCount: 0, rank: 2 });
  });

  it('names a total that disagrees with the Final Standings', () => {
    const standings = STANDINGS.map((s) => (s.name === 'Ember' ? { ...s, total: 900000 } : s));
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: standings });
    expect(ledger.ledgerCheck.mismatches).toEqual([{ account: 'Ember', computed: 925000, standings: 900000 }]);
  });

  it('with no adjustment rows, keeps the Final Standings totals and says the rows were not parsed', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: [], finalStandings: STANDINGS });
    expect(ledger.adjustments).toEqual([]);
    expect(ledger.ledgerCheck).toEqual({ adjustmentsParsed: false, mismatches: [], unclassified: [] });
    expect(ledger.shellAccounts).toEqual([
      { name: 'Ember', total: 925000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 375000, tokenCount: 0, rank: 2 },
      { name: 'Vic', total: 25000, tokenCount: 1, rank: 3 }
    ]);
  });

  it('counts sales in code, never 0 for an account that sold', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: undefined, finalStandings: undefined });
    expect(ledger.shellAccounts).toEqual([
      { name: 'Ember', total: 875000, tokenCount: 2, rank: 1 },
      { name: 'Vic', total: 400000, tokenCount: 1, rank: 2 }
    ]);
  });
});

describe('ledgerReviewOf: what the input review shows', () => {
  it('on a fresh parse: the clock, the adjustments, the accounts and the check', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: STANDINGS });
    const review = ledgerReviewOf({
      sessionConfig: {
        sessionClock: { decided: true, evening: true, firstTime: '07:37 PM' },
        adjustments: ledger.adjustments,
        ledgerCheck: ledger.ledgerCheck
      },
      shellAccounts: ledger.shellAccounts
    });
    expect(review.clock).toEqual({ decided: true, evening: true, firstTime: '07:37 PM' });
    expect(review.adjustmentsParsed).toBe(true);
    expect(review.adjustments).toEqual(ledger.adjustments);
    expect(review.accounts).toEqual(ledger.shellAccounts);
    expect(review.mismatches).toEqual([]);
  });

  it('on a thread from before phase 3: the stored totals, the clock from its exposures, and adjustments not parsed', () => {
    const review = ledgerReviewOf({
      sessionConfig: { exposures: [{ tokenId: 'nat002', time: '02:25 PM' }] },
      shellAccounts: [{ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 }]
    });
    expect(review.clock).toEqual({ decided: true, evening: false, firstTime: '02:25 PM' });
    expect(review.adjustmentsParsed).toBe(false);
    expect(review.adjustments).toEqual([]);
    expect(review.accounts).toEqual([{ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 }]);
  });
});
