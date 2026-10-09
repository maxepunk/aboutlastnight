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

/**
 * The bonus as 061226's report wrote it (task 3.11; final review, session-data finding
 * 0): the setup row's source is "Seed", the payment's Detail names the bonus only by its
 * stem ("First buried"), and the holding account's reversal is a "Manual GM adjustment"
 * that names no destination, logged in the payment's minute. Synthetic rows in that
 * shape.
 */
const BONUS_ROWS_061226 = [
  { time: '08:41 PM', detail: 'Seed (GM_Station_1)', team: 'First Burial Bonus', amount: 50000 },
  { time: '09:00 PM', detail: 'First buried (GM_Station_1)', team: 'Vic', amount: 50000 },
  { time: '09:00 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -50000 }
];

/** Two transfers in 061226's shape: the credit row's Detail "From <account>", the debit row's "To <account>". */
const TRANSFER_ROWS_061226 = [
  { time: '10:12 PM', detail: 'From vic (GM_Station_1)', team: 'Alex', amount: 150000 },
  { time: '10:12 PM', detail: 'To alex (GM_Station_1)', team: 'Vic', amount: -150000 },
  { time: '10:31 PM', detail: 'From alex (GM_Station_1)', team: 'Remi', amount: 40000 },
  { time: '10:31 PM', detail: 'To remi (GM_Station_1)', team: 'Alex', amount: -40000 }
];

const SALES_061226 = [
  { tokenId: 'ccc001', shellAccount: 'Vic', amount: 600000, time: '09:00 PM' },
  { tokenId: 'ccc002', shellAccount: 'Vic', amount: 250000, time: '09:20 PM' },
  { tokenId: 'ddd001', shellAccount: 'Alex', amount: 300000, time: '09:45 PM' }
];

/** Vic: two sales and the bonus, less the transfer to Alex; Alex: a sale and Vic's transfer, less the one to Remi. */
const STANDINGS_061226 = [
  { name: 'Vic', total: 750000 },
  { name: 'Alex', total: 410000 },
  { name: 'Remi', total: 40000 },
  { name: 'First Burial Bonus', total: 0 }
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

  it('reports a row it cannot read (no account, a zero or unreadable amount) as unclassified, with what it carries (fix batch, finding 5)', () => {
    const { adjustments, unclassified } = classifyAdjustments([
      ...BONUS_ROWS,
      { time: '08:10 PM', detail: 'Ember (GM_Station_1)', team: '', amount: 20000 },
      { time: '08:11 PM', detail: 'Ember (GM_Station_1)', team: 'Vic', amount: 0 },
      { time: '08:12 PM', detail: 'Ember (GM_Station_1)', team: 'Vic', amount: 'twenty grand' },
      { detail: 'Ember (GM_Station_1)' }
    ]);
    expect(adjustments).toEqual([{ time: '07:50 PM', kind: 'bonus', amount: 50000, toAccount: 'Ember' }]);
    expect(unclassified).toEqual([
      { time: '08:10 PM', account: '', amount: 20000 },
      { time: '08:11 PM', account: 'Vic', amount: 0 },
      { time: '08:12 PM', account: 'Vic', amount: 'twenty grand' },
      { time: '', account: '', amount: '' }
    ]);
    expect(JSON.stringify(unclassified)).not.toMatch(/GM|Station/i);
  });
});

/**
 * Task 3.11 (final review, session-data finding 0): the first-burial bonus in the other
 * row shapes a game master writes. 061226's report paid it as "First buried" with a
 * holding-account reversal that names no destination, and code read the payment as a
 * transfer from a made-up account named "First buried". 092026's shape, tested above,
 * classifies as before.
 */
describe('classifyAdjustments: the first-burial bonus in 061226\'s shape', () => {
  it('turns 061226\'s bonus rows into one bonus paid to the account that received it, and its transfers into transfers', () => {
    const { adjustments, unclassified } = classifyAdjustments([...BONUS_ROWS_061226, ...TRANSFER_ROWS_061226]);
    expect(adjustments).toEqual([
      { time: '09:00 PM', kind: 'bonus', amount: 50000, toAccount: 'Vic' },
      { time: '10:12 PM', kind: 'transfer', amount: 150000, fromAccount: 'Vic', toAccount: 'Alex' },
      { time: '10:31 PM', kind: 'transfer', amount: 40000, fromAccount: 'Alex', toAccount: 'Remi' }
    ]);
    expect(unclassified).toEqual([]);
    expect(JSON.stringify(adjustments)).not.toMatch(/First buried|Seed|Manual|GM|Station/i);
  });

  it.each([
    ['First buried (GM_Station_1)'],
    ['First buried bonus (GM_Station_1)'],
    ['First burial (GM_Station_1)'],
    ['First burial bonus (GM_Station_1)'],
    ['FirstBurialBonus(GMStation1)']
  ])('reads a credit whose source names the bonus by its stem as the bonus: %s', (detail) => {
    const { adjustments, unclassified } = classifyAdjustments([{ time: '09:00 PM', detail, team: 'Vic', amount: 50000 }]);
    expect(adjustments).toEqual([{ time: '09:00 PM', kind: 'bonus', amount: 50000, toAccount: 'Vic' }]);
    expect(unclassified).toEqual([]);
  });

  it('pairs an unpaired holding-account debit with the credit of the same amount in the same minute: that credit is the bonus', () => {
    const { adjustments, unclassified } = classifyAdjustments([
      { time: '09:00 PM', detail: 'Payout (GM_Station_1)', team: 'Vic', amount: 50000 },
      { time: '09:00PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -50000 }
    ]);
    expect(adjustments).toEqual([{ time: '09:00 PM', kind: 'bonus', amount: 50000, toAccount: 'Vic' }]);
    expect(unclassified).toEqual([]);
  });

  it('pairs the holding-account debit with the credit that names the bonus, when another credit of that amount shares the minute', () => {
    const { adjustments, unclassified } = classifyAdjustments([
      { time: '09:00 PM', detail: 'Payout (GM_Station_1)', team: 'Alex', amount: 50000 },
      { time: '09:00 PM', detail: 'First buried (GM_Station_1)', team: 'Vic', amount: 50000 },
      { time: '09:00 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -50000 }
    ], { accounts: ['Alex', 'Vic'] });
    expect(adjustments).toEqual([{ time: '09:00 PM', kind: 'bonus', amount: 50000, toAccount: 'Vic' }]);
    expect(unclassified).toEqual([{ time: '09:00 PM', account: 'Alex', amount: 50000 }]);
  });

  it('pairs nothing across minutes or amounts: such a credit is no bonus', () => {
    const accounts = ['Vic'];
    const laterMinute = classifyAdjustments([
      { time: '09:00 PM', detail: 'Payout (GM_Station_1)', team: 'Vic', amount: 50000 },
      { time: '09:05 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -50000 }
    ], { accounts });
    const otherAmount = classifyAdjustments([
      { time: '09:00 PM', detail: 'Payout (GM_Station_1)', team: 'Vic', amount: 50000 },
      { time: '09:00 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -40000 }
    ], { accounts });
    [laterMinute, otherAmount].forEach(({ adjustments, unclassified }) => {
      expect(adjustments).toEqual([]);
      expect(unclassified).toEqual([{ time: '09:00 PM', account: 'Vic', amount: 50000 }]);
    });
  });
});

/**
 * Task 3.11: a transfer's source is an account only when the session report shows it
 * elsewhere, as a sale's account or a Final Standings row. A source with neither is a
 * label the game master wrote, so its row is reported as unclassified and the source
 * never becomes an account.
 */
describe('a transfer source the session report shows nowhere else', () => {
  it('is reported as unclassified, from a credit row, and never added as an account', () => {
    const ledger = buildLedger({
      buriedTokens: SALES,
      adjustmentRows: [{ time: '09:30 PM', detail: 'Payout (GM_Station_1)', team: 'Vic', amount: 20000 }],
      finalStandings: STANDINGS
    });
    expect(ledger.adjustments).toEqual([]);
    expect(ledger.ledgerCheck.unclassified).toEqual([{ time: '09:30 PM', account: 'Vic', amount: 20000 }]);
    expect(ledger.shellAccounts.map((a) => a.name)).not.toContain('Payout');
  });

  it('is reported as unclassified, from a debit row that names a destination, and never added as an account', () => {
    const ledger = buildLedger({
      buriedTokens: SALES,
      adjustmentRows: [{ time: '09:31 PM', detail: 'ToVic(GMStation1)', team: 'Ghost', amount: -10000 }],
      finalStandings: STANDINGS
    });
    expect(ledger.adjustments).toEqual([]);
    expect(ledger.ledgerCheck.unclassified).toEqual([{ time: '09:31 PM', account: 'Ghost', amount: -10000 }]);
    expect(ledger.shellAccounts.map((a) => a.name)).not.toContain('Ghost');
  });

  it('keeps a transfer from an account the Final Standings list, though it made no sale', () => {
    const ledger = buildLedger({
      buriedTokens: SALES,
      adjustmentRows: [
        { time: '10:40 PM', detail: 'L (GM_Station_1)', team: 'Vic', amount: 5000 },
        { time: '10:40 PM', detail: 'ToVic(GMStation1)', team: 'L', amount: -5000 }
      ],
      finalStandings: STANDINGS
    });
    expect(ledger.adjustments).toEqual([{ time: '10:40 PM', kind: 'transfer', amount: 5000, fromAccount: 'L', toAccount: 'Vic' }]);
    expect(ledger.ledgerCheck.unclassified).toEqual([]);
  });

  it('classifyAdjustments checks no source when it is given no accounts', () => {
    const { adjustments } = classifyAdjustments([{ time: '09:30 PM', detail: 'Payout (GM_Station_1)', team: 'Vic', amount: 20000 }]);
    expect(adjustments).toEqual([{ time: '09:30 PM', kind: 'transfer', amount: 20000, fromAccount: 'Payout', toAccount: 'Vic' }]);
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
    // Brief C (R3): matched exactly, so it also holds that rows on the game's clock add no clockShift or offClock key.
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
    // Brief C (R3): matched exactly, so it also holds that rows on the game's clock add no clockShift or offClock key.
    expect(ledger.ledgerCheck).toEqual({ adjustmentsParsed: false, mismatches: [], unclassified: [] });
    expect(ledger.shellAccounts).toEqual([
      { name: 'Ember', total: 925000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 375000, tokenCount: 0, rank: 2 },
      { name: 'Vic', total: 25000, tokenCount: 1, rank: 3 }
    ]);
  });

  it('on 061226\'s rows, the bonus is in the account that received it, the totals reconcile, and no account is made up (task 3.11)', () => {
    const ledger = buildLedger({
      buriedTokens: SALES_061226,
      adjustmentRows: [...BONUS_ROWS_061226, ...TRANSFER_ROWS_061226],
      finalStandings: STANDINGS_061226
    });
    expect(ledger.adjustments).toEqual([
      { time: '09:00 PM', kind: 'bonus', amount: 50000, toAccount: 'Vic' },
      { time: '10:12 PM', kind: 'transfer', amount: 150000, fromAccount: 'Vic', toAccount: 'Alex' },
      { time: '10:31 PM', kind: 'transfer', amount: 40000, fromAccount: 'Alex', toAccount: 'Remi' }
    ]);
    expect(ledger.shellAccounts).toEqual([
      { name: 'Vic', total: 750000, tokenCount: 2, rank: 1 },
      { name: 'Alex', total: 410000, tokenCount: 1, rank: 2 },
      { name: 'Remi', total: 40000, tokenCount: 0, rank: 3 }
    ]);
    // Brief C (R3): matched exactly, so it also holds that rows on the game's clock add no clockShift or offClock key.
    expect(ledger.ledgerCheck).toEqual({ adjustmentsParsed: true, mismatches: [], unclassified: [] });
  });

  it('counts sales in code, never 0 for an account that sold', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: undefined, finalStandings: undefined });
    expect(ledger.shellAccounts).toEqual([
      { name: 'Ember', total: 875000, tokenCount: 2, rank: 1 },
      { name: 'Vic', total: 400000, tokenCount: 1, rank: 2 }
    ]);
  });
});

/**
 * Final review (data-harness-docs[0]): the money story keeps every account the session
 * report names. 053126's game master moved money between players' accounts on "Manual
 * GM adjustment" rows that name neither a destination nor a source, keyed one credit
 * wrong (+350,000 for the 375,000 taken from Vic), and paid Zoe on a "Gift" row. The
 * account L received the money and made no sale. The Final Standings show L at
 * $1,100,000, Zoe at $30,000, and Vic and Phil at $0. Since 3.11 those label rows are
 * unclassified, so with the rows parsed the book lost L and Zoe and kept Vic's and
 * Phil's sales, a money list the session report contradicts.
 *
 * Where the computed book lacks an account the Final Standings list with a non-zero
 * total, or disagrees with one, the account's total is the standings' figure, as
 * without the rows, and `computedTotal` keeps what the sales, bonus and transfers add
 * up to. Synthetic rows in 053126's shape.
 */
describe("buildLedger: an account the Final Standings name and the rows cannot explain (053126's shape)", () => {
  const SALES_053126 = [
    { tokenId: 'eee001', shellAccount: 'Ft', amount: 655000, time: '07:41 PM' },
    { tokenId: 'eee002', shellAccount: 'Ft', amount: 450000, time: '07:58 PM' },
    { tokenId: 'fff001', shellAccount: 'Vic', amount: 375000, time: '08:05 PM' },
    { tokenId: 'ggg001', shellAccount: 'Phil', amount: 750000, time: '08:20 PM' }
  ];
  const ADJUSTMENTS_053126 = [
    { time: '07:41 PM', detail: 'First burial bonus (GM_Station_1)', team: 'Ft', amount: 50000 },
    { time: '08:45 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'Vic', amount: -375000 },
    { time: '08:45 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'Phil', amount: -750000 },
    { time: '08:46 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'L', amount: 350000 },
    { time: '08:46 PM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'L', amount: 750000 },
    { time: '08:50 PM', detail: 'Gift (GM_Station_1)', team: 'Zoe', amount: 30000 }
  ];
  const STANDINGS_053126 = [
    { name: 'Ft', total: 1155000 },
    { name: 'L', total: 1100000 },
    { name: 'Zoe', total: 30000 },
    { name: 'Vic', total: 0 },
    { name: 'Phil', total: 0 },
    { name: 'First Burial Bonus', total: 0 }
  ];
  const ledger053126 = () => buildLedger({ buriedTokens: SALES_053126, adjustmentRows: ADJUSTMENTS_053126, finalStandings: STANDINGS_053126 });

  it('keeps L and Zoe at the standings\' figures, and Vic and Phil at theirs, with what the rows add up to beside each', () => {
    expect(ledger053126().shellAccounts).toEqual([
      { name: 'Ft', total: 1155000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 1100000, tokenCount: 0, rank: 2, computedTotal: 0 },
      { name: 'Zoe', total: 30000, tokenCount: 0, rank: 3, computedTotal: 0 },
      { name: 'Vic', total: 0, tokenCount: 1, rank: 4, computedTotal: 375000 },
      { name: 'Phil', total: 0, tokenCount: 1, rank: 5, computedTotal: 750000 }
    ]);
  });

  it('names every disagreement for the input review, and reports the label rows as unclassified', () => {
    const { ledgerCheck, adjustments } = ledger053126();
    expect(ledgerCheck.mismatches).toEqual([
      { account: 'L', computed: 0, standings: 1100000 },
      { account: 'Zoe', computed: 0, standings: 30000 },
      { account: 'Vic', computed: 375000, standings: 0 },
      { account: 'Phil', computed: 750000, standings: 0 }
    ]);
    expect(ledgerCheck.unclassified).toEqual([
      { time: '08:45 PM', account: 'Vic', amount: -375000 },
      { time: '08:45 PM', account: 'Phil', amount: -750000 },
      { time: '08:46 PM', account: 'L', amount: 350000 },
      { time: '08:46 PM', account: 'L', amount: 750000 },
      { time: '08:50 PM', account: 'Zoe', amount: 30000 }
    ]);
    expect(adjustments).toEqual([{ time: '07:41 PM', kind: 'bonus', amount: 50000, toAccount: 'Ft' }]);
  });

  it('never makes a label an account or a timeline source', () => {
    const { shellAccounts, adjustments } = ledger053126();
    expect(shellAccounts.map((a) => a.name)).toEqual(['Ft', 'L', 'Zoe', 'Vic', 'Phil']);
    expect(JSON.stringify({ shellAccounts, adjustments })).not.toMatch(/Manual|Gift|GM|Station/i);
  });

  it('the sum of what the rows add up to is still the sales and the bonus', () => {
    const rowsTotal = ledger053126().shellAccounts
      .reduce((sum, a) => sum + (a.computedTotal === undefined ? a.total : a.computedTotal), 0);
    expect(rowsTotal).toBe(655000 + 450000 + 375000 + 750000 + 50000);
  });

  it('a total the rows give and the standings do not list stays the rows\' figure', () => {
    const ledger = buildLedger({ buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: [] });
    expect(ledger.shellAccounts.every((a) => a.computedTotal === undefined)).toBe(true);
    expect(ledger.shellAccounts.find((a) => a.name === 'Ember')).toEqual({ name: 'Ember', total: 925000, tokenCount: 2, rank: 1 });
  });

  it("leaves 092026's and 061226's reconciling shapes as they were: every total computed, none from the standings", () => {
    const shapes = [
      buildLedger({ buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: STANDINGS }),
      buildLedger({ buriedTokens: SALES_061226, adjustmentRows: [...BONUS_ROWS_061226, ...TRANSFER_ROWS_061226], finalStandings: STANDINGS_061226 })
    ];
    shapes.forEach(({ shellAccounts, ledgerCheck }) => {
      expect(ledgerCheck.mismatches).toEqual([]);
      shellAccounts.forEach((a) => expect(Object.keys(a).sort()).toEqual(['name', 'rank', 'tokenCount', 'total']));
    });
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

/**
 * Phases 14 and 15, brief C (spec section 4, ruling R3): the session report logged the
 * bonus and the transfers of two sessions nine hours off the game's clock. At the parse,
 * an adjustment event (the bonus, a transfer) more than three hours outside the span of
 * the session's sales and exposures moves by one whole-hour shift, and keeps its logged
 * time beside the shifted one. ledgerCheck says which shift was used (clockShift), or
 * that no single shift lines the rows up (offClock); neither key is present when no
 * event is off the clock. Synthetic rows in the two sessions' shapes, with invented
 * accounts.
 */
describe("buildLedger: adjustment events logged off the game's clock", () => {
  /** A daytime session's sales, from 03:54 to 05:15 PM, and its exposures, 03:50 to 05:18 PM. */
  const DAY_SALES = [
    { tokenId: 'hhh001', shellAccount: 'Pip', amount: 300000, time: '03:54 PM' },
    { tokenId: 'hhh002', shellAccount: 'Ash', amount: 250000, time: '04:20 PM' },
    { tokenId: 'hhh003', shellAccount: 'Kit', amount: 200000, time: '05:15 PM' }
  ];
  const DAY_EXPOSURES = [{ tokenId: 'iii001', time: '03:50 PM' }, { tokenId: 'iii002', time: '05:18 PM' }];
  /** The Final Standings the shifted rows reconcile with: a shift moves times, never money. */
  const DAY_STANDINGS = [
    { name: 'Pip', total: 325000 }, { name: 'Ash', total: 255000 }, { name: 'Kit', total: 220000 },
    { name: 'First Burial Bonus', total: 0 }
  ];
  /**
   * The rows in the shape of the daytime session whose report ran nine hours ahead: the
   * setup row before the session, the bonus at 12:55 AM (its credit and the holding
   * account's debit, written two ways), and four transfers from 1:28 to 2:14 AM, a
   * transfer's debit sometimes a minute after its credit.
   */
  const DAY_ROWS = [
    { time: '10:07 PM', detail: 'First Burial Bonus (GM_Station_1)', team: 'First Burial Bonus', amount: 50000 },
    { time: '12:55AM', detail: 'Firstburial(GMStation2)', team: 'Pip', amount: 50000 },
    { time: '12:55 AM', detail: 'To pip (GM_Station_2)', team: 'First Burial Bonus', amount: -50000 },
    { time: '01:28AM', detail: 'From pip (GM_Station_2)', team: 'Ash', amount: 20000 },
    { time: '01:28 AM', detail: 'To ash (GM_Station_2)', team: 'Pip', amount: -20000 },
    { time: '02:09AM', detail: 'From ash (GM_Station_2)', team: 'Kit', amount: 15000 },
    { time: '02:10 AM', detail: 'To kit (GM_Station_2)', team: 'Ash', amount: -15000 },
    { time: '02:11AM', detail: 'From kit (GM_Station_2)', team: 'Pip', amount: 5000 },
    { time: '02:11 AM', detail: 'To pip (GM_Station_2)', team: 'Kit', amount: -5000 },
    { time: '02:14AM', detail: 'From pip (GM_Station_2)', team: 'Kit', amount: 10000 },
    { time: '02:15 AM', detail: 'To kit (GM_Station_2)', team: 'Pip', amount: -10000 }
  ];

  /** An evening session's sales, 09:20 to 10:23 PM, and its exposures, 08:59 to 10:20 PM. */
  const EVENING_SALES = [
    { tokenId: 'jjj001', shellAccount: 'Ratchet', amount: 400000, time: '09:20 PM' },
    { tokenId: 'jjj002', shellAccount: 'Wren', amount: 150000, time: '10:23 PM' }
  ];
  const EVENING_EXPOSURES = [{ tokenId: 'kkk001', time: '08:59 PM' }, { tokenId: 'kkk002', time: '10:20 PM' }];
  /** The bonus alone off the clock, at 6:21 AM: back 8 and back 9 hours both land it inside the span. */
  const EVENING_ROWS = [
    { time: '03:48 AM', detail: 'Holding Account (GM_Station_1)', team: 'First Burial Bonus', amount: 50000 },
    { time: '06:21AM', detail: 'First burial bonus (GM_Station_1)', team: 'Ratchet', amount: 50000 },
    { time: '06:22 AM', detail: 'ToRatchet(GMStation1)', team: 'FirstBurialBonus', amount: -50000 }
  ];

  /** Two sales an afternoon apart, 01:00 and 04:00 PM, and nothing else. */
  const AFTERNOON_SALES = [
    { tokenId: 'lll001', shellAccount: 'Mo', amount: 100000, time: '01:00 PM' },
    { tokenId: 'lll002', shellAccount: 'Jo', amount: 100000, time: '04:00 PM' }
  ];
  const transferRows = (credit, debit, amount, from, to) => [
    { time: credit, detail: `From ${from.toLowerCase()} (GM_Station_1)`, team: to, amount },
    { time: debit, detail: `To ${to.toLowerCase()} (GM_Station_1)`, team: from, amount: -amount }
  ];

  it("moves the daytime shape's bonus and four transfers back 9 hours: the bonus a minute after the first sale, the transfers inside the span", () => {
    const ledger = buildLedger({ buriedTokens: DAY_SALES, adjustmentRows: DAY_ROWS, finalStandings: DAY_STANDINGS, exposures: DAY_EXPOSURES });
    expect(ledger.adjustments).toEqual([
      { time: '03:55 PM', loggedTime: '12:55AM', kind: 'bonus', amount: 50000, toAccount: 'Pip' },
      { time: '04:28 PM', loggedTime: '01:28AM', kind: 'transfer', amount: 20000, fromAccount: 'Pip', toAccount: 'Ash' },
      { time: '05:09 PM', loggedTime: '02:09AM', kind: 'transfer', amount: 15000, fromAccount: 'Ash', toAccount: 'Kit' },
      { time: '05:11 PM', loggedTime: '02:11AM', kind: 'transfer', amount: 5000, fromAccount: 'Kit', toAccount: 'Pip' },
      { time: '05:14 PM', loggedTime: '02:14AM', kind: 'transfer', amount: 10000, fromAccount: 'Pip', toAccount: 'Kit' }
    ]);
    expect(ledger.ledgerCheck).toEqual({
      adjustmentsParsed: true, mismatches: [], unclassified: [],
      clockShift: { hours: -9, moved: 5, bonus: true }
    });
  });

  it('keeps the bonus paired with its holding-account debit, and the setup row out, after the shift', () => {
    const { adjustments, ledgerCheck } = buildLedger({ buriedTokens: DAY_SALES, adjustmentRows: DAY_ROWS, exposures: DAY_EXPOSURES });
    expect(adjustments.filter((a) => a.kind === 'bonus')).toHaveLength(1);
    expect(ledgerCheck.unclassified).toEqual([]);
    expect(JSON.stringify(adjustments)).not.toMatch(/10:07/);
  });

  it("moves a bonus paired only by its minute (061226's shape) as the bonus", () => {
    const { adjustments, ledgerCheck } = buildLedger({
      buriedTokens: DAY_SALES,
      exposures: DAY_EXPOSURES,
      adjustmentRows: [
        { time: '12:55AM', detail: 'Payout (GM_Station_1)', team: 'Pip', amount: 50000 },
        { time: '12:55 AM', detail: 'Manual GM adjustment (GM_Station_1)', team: 'First Burial Bonus', amount: -50000 }
      ]
    });
    expect(adjustments).toEqual([{ time: '03:55 PM', loggedTime: '12:55AM', kind: 'bonus', amount: 50000, toAccount: 'Pip' }]);
    expect(ledgerCheck.clockShift).toEqual({ hours: -9, moved: 1, bonus: true });
  });

  it('leaves an unclassified row as logged, beside the events it moves', () => {
    const { adjustments, ledgerCheck } = buildLedger({
      buriedTokens: DAY_SALES,
      exposures: DAY_EXPOSURES,
      adjustmentRows: [...DAY_ROWS, { time: '01:40AM', detail: 'Gift (GM_Station_2)', team: 'Ash', amount: 1000 }]
    });
    expect(ledgerCheck.unclassified).toEqual([{ time: '01:40AM', account: 'Ash', amount: 1000 }]);
    expect(adjustments).toHaveLength(5);
    expect(ledgerCheck.clockShift).toEqual({ hours: -9, moved: 5, bonus: true });
  });

  it('on the evening shape, where back 8 and back 9 both fit the span, lets the bonus decide: back 9, a minute after the first sale', () => {
    const ledger = buildLedger({ buriedTokens: EVENING_SALES, adjustmentRows: EVENING_ROWS, exposures: EVENING_EXPOSURES });
    expect(ledger.adjustments).toEqual([{ time: '09:21 PM', loggedTime: '06:21AM', kind: 'bonus', amount: 50000, toAccount: 'Ratchet' }]);
    expect(ledger.ledgerCheck.clockShift).toEqual({ hours: -9, moved: 1, bonus: true });
  });

  it('prints the shifted time on the timeline, on the evening clock as on the daytime one', () => {
    const { renderMorningTimeline } = require('../prompt-renderers/record-view');
    const timelineOf = (sales, rows, exposures) => {
      const ledger = buildLedger({ buriedTokens: sales, adjustmentRows: rows, exposures });
      return renderMorningTimeline(
        { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: sales.map((s) => ({ ...s, sourceType: 'memory-token' })) } },
        { adjustments: ledger.adjustments, exposures }
      );
    };
    const evening = timelineOf(EVENING_SALES, EVENING_ROWS, EVENING_EXPOSURES);
    expect(evening).toMatch(/09:21 AM[^\n]*first-burial bonus/);
    expect(evening).not.toMatch(/06:21/);
    const day = timelineOf(DAY_SALES, DAY_ROWS, DAY_EXPOSURES);
    expect(day).toMatch(/03:55 PM[^\n]*first-burial bonus/);
    expect(day).not.toMatch(/12:55|01:28|02:1/);
  });

  it('with no bonus off the clock, takes the shift of the fewest hours that puts every off-clock transfer inside the span', () => {
    // The span runs 01:00 to 04:00 PM; a transfer at 08:30 PM fits back 5, 6 or 7 hours.
    const { adjustments, ledgerCheck } = buildLedger({
      buriedTokens: AFTERNOON_SALES,
      adjustmentRows: transferRows('08:30PM', '08:30 PM', 30000, 'Mo', 'Jo')
    });
    expect(adjustments).toEqual([{ time: '03:30 PM', loggedTime: '08:30PM', kind: 'transfer', amount: 30000, fromAccount: 'Mo', toAccount: 'Jo' }]);
    expect(ledgerCheck.clockShift).toEqual({ hours: -5, moved: 1, bonus: false });
  });

  it('moves nothing when no single shift lines the rows up, and counts them in offClock', () => {
    // The span runs 01:00 to 04:00 PM: 09:00 PM fits only back 5 to 8 hours, 02:00 AM only back 10 to 12.
    const { adjustments, ledgerCheck } = buildLedger({
      buriedTokens: AFTERNOON_SALES,
      adjustmentRows: [
        ...transferRows('09:00PM', '09:00 PM', 30000, 'Mo', 'Jo'),
        ...transferRows('02:00AM', '02:00 AM', 10000, 'Jo', 'Mo')
      ]
    });
    expect(adjustments).toEqual([
      { time: '09:00PM', kind: 'transfer', amount: 30000, fromAccount: 'Mo', toAccount: 'Jo' },
      { time: '02:00AM', kind: 'transfer', amount: 10000, fromAccount: 'Jo', toAccount: 'Mo' }
    ]);
    expect(ledgerCheck.offClock).toEqual({ rows: 2 });
    expect(ledgerCheck.clockShift).toBeUndefined();
  });

  it('leaves a transfer two and a half hours after the last sale where it was logged, and adds no key', () => {
    const ledger = buildLedger({
      buriedTokens: [
        { tokenId: 'mmm001', shellAccount: 'Mo', amount: 100000, time: '07:30 PM' },
        { tokenId: 'mmm002', shellAccount: 'Jo', amount: 100000, time: '08:00 PM' }
      ],
      adjustmentRows: transferRows('10:30 PM', '10:30 PM', 30000, 'Mo', 'Jo'),
      exposures: [{ tokenId: 'nnn001', time: '07:20 PM' }]
    });
    expect(ledger.adjustments).toEqual([{ time: '10:30 PM', kind: 'transfer', amount: 30000, fromAccount: 'Mo', toAccount: 'Jo' }]);
    expect(Object.keys(ledger.ledgerCheck).sort()).toEqual(['adjustmentsParsed', 'mismatches', 'unclassified']);
  });

  it("leaves the repo's on-clock shapes as they were, byte for byte", () => {
    [
      { buriedTokens: SALES, adjustmentRows: [...BONUS_ROWS, ...TRANSFER_ROWS], finalStandings: STANDINGS },
      { buriedTokens: SALES_061226, adjustmentRows: [...BONUS_ROWS_061226, ...TRANSFER_ROWS_061226], finalStandings: STANDINGS_061226 }
    ].forEach((input) => {
      const without = buildLedger(input);
      const withExposures = buildLedger({ ...input, exposures: [{ tokenId: 'ooo001', time: '07:37 PM' }] });
      expect(JSON.stringify(withExposures)).toBe(JSON.stringify(without));
      expect(JSON.stringify(without.adjustments)).not.toMatch(/loggedTime/);
    });
  });

  it('tests nothing when the session has no sale and no exposure time', () => {
    const ledger = buildLedger({ buriedTokens: [], adjustmentRows: TRANSFER_ROWS, finalStandings: STANDINGS, exposures: [] });
    expect(ledger.adjustments).toEqual([{ time: '10:30 PM', kind: 'transfer', amount: 375000, fromAccount: 'Vic', toAccount: 'L' }]);
    expect(Object.keys(ledger.ledgerCheck).sort()).toEqual(['adjustmentsParsed', 'mismatches', 'unclassified']);
  });

  it('ledgerReviewOf passes the shift, or the rows no shift fits, through to the input review', () => {
    const ledger = buildLedger({ buriedTokens: DAY_SALES, adjustmentRows: DAY_ROWS, exposures: DAY_EXPOSURES });
    const review = ledgerReviewOf({ sessionConfig: { adjustments: ledger.adjustments, ledgerCheck: ledger.ledgerCheck }, shellAccounts: ledger.shellAccounts });
    expect(review.clockShift).toEqual({ hours: -9, moved: 5, bonus: true });
    expect(review.offClock).toBeNull();
    expect(review.adjustments[0].loggedTime).toBe('12:55AM');
    const unfit = ledgerReviewOf({ sessionConfig: { adjustments: [], ledgerCheck: { adjustmentsParsed: true, mismatches: [], unclassified: [], offClock: { rows: 3 } } } });
    expect(unfit.offClock).toEqual({ rows: 3 });
    expect(unfit.clockShift).toBeNull();
    const none = ledgerReviewOf({ sessionConfig: { adjustments: [], ledgerCheck: { adjustmentsParsed: true, mismatches: [], unclassified: [] } } });
    expect([none.clockShift, none.offClock]).toEqual([null, null]);
  });
});
