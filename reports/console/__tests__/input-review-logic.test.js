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

  // Final review (data-harness-docs[0]): each disagreement says which figure the writers
  // got. The writers get the Final Standings' figure wherever the standings list one
  // (lib/session-ledger.js buildLedger). A thread parsed before that kept the sales and
  // adjustments' figure, and had no account for one the rows never reached, so the line
  // reads the figure from the accounts the writers were given.
  it('puts a totals mismatch first, in words the director can check against the session report, with the figure the writers get', () => {
    const view = ledgerView({
      ...ledger,
      accounts: [{ name: 'Ember', total: 900000, tokenCount: 2, rank: 1, computedTotal: 925000 }, ledger.accounts[1]],
      mismatches: [{ account: 'Ember', computed: 925000, standings: 900000 }]
    });
    expect(view.warnings).toEqual(["Ember: the sales and adjustments add up to $925,000; the Final Standings say $900,000. The writers get the Final Standings' figure"]);
  });

  it("says when the writers get the sales and adjustments' figure, or no figure, for a disagreement", () => {
    const view = ledgerView({
      ...ledger,
      mismatches: [
        { account: 'Ember', computed: 925000, standings: 900000 },
        { account: 'Zoe', computed: 0, standings: 30000 },
        { account: 'L', computed: 375000, standings: null }
      ]
    });
    expect(view.warnings).toEqual([
      "Ember: the sales and adjustments add up to $925,000; the Final Standings say $900,000. The writers get the sales and adjustments' figure",
      'Zoe: the sales and adjustments add up to $0; the Final Standings say $30,000. The writers get no figure for it',
      "L: the sales and adjustments add up to $375,000; the Final Standings do not list it. The writers get the sales and adjustments' figure"
    ]);
  });

  it("reads 053126's accounts as buildLedger gives them: L at the standings' figure, matched whatever the case", () => {
    const view = ledgerView({
      ...ledger,
      accounts: [{ name: 'l', total: 1100000, tokenCount: 0, rank: 1, computedTotal: 0 }],
      mismatches: [{ account: 'L', computed: 0, standings: 1100000 }]
    });
    expect(view.warnings).toEqual(["L: the sales and adjustments add up to $0; the Final Standings say $1,100,000. The writers get the Final Standings' figure"]);
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

// ── Task 3.5 fix batch, item 9: the notes panel reads the enricher's stored shape and
// the one task 3.6 stores (a quote may have no speaker and carries the director's
// correction; an epilogue item is the director's sentence, with no headline). ──

const { quoteView, epilogueItemView, enrichmentWarningLines } = require('../input-review-logic');

describe('quoteView: a quote as the notes panel shows it', () => {
  it('says "speaker not recorded" when the quote has no speaker, or the stored "unknown"', () => {
    expect(quoteView({ text: 'He was a dead man.', context: 'At the bar, someone said' }).speaker).toBe('speaker not recorded');
    expect(quoteView({ speaker: '  ', text: 'x' }).speaker).toBe('speaker not recorded');
    expect(quoteView({ speaker: 'unknown', text: 'x' }).speaker).toBe('speaker not recorded');
    expect(quoteView({ speaker: 'Unknown', text: 'x' }).speakerRecorded).toBe(false);
  });

  it('keeps a recorded speaker, the addressee, the text and the context as stored', () => {
    expect(quoteView({ speaker: 'Blake', addressee: 'Ashe', text: 'He was a dead man.', context: 'Blake to Ashe at the bar', confidence: 'high' }))
      .toEqual({ speaker: 'Blake', speakerRecorded: true, addressee: 'Ashe', text: 'He was a dead man.', context: 'Blake to Ashe at the bar', correction: '', confidence: 'high' });
  });

  it('carries the director\'s correction when the quote has one', () => {
    const view = quoteView({ speaker: 'Blake', text: 'He was a dead man.', context: 'Vic to Ashe', correction: 'Blake said "he was a dead man", not Vic.' });
    expect(view.correction).toBe('Blake said "he was a dead man", not Vic.');
    expect(quoteView({ speaker: 'Blake', text: 'x' }).correction).toBe('');
  });
});

describe('epilogueItemView: an epilogue item as the notes panel shows it', () => {
  it('a stored item keeps its headline beside the director\'s sentence', () => {
    expect(epilogueItemView({ headline: 'Riley left town', detail: 'Riley left town the next day.', subjects: ['Riley'] }))
      .toEqual({ headline: 'Riley left town', detail: 'Riley left town the next day.', subjects: ['Riley'], bearing: '' });
  });

  it('a new item is the director\'s sentence alone, with no headline', () => {
    expect(epilogueItemView({ detail: 'Remi was not available for comment.', subjects: ['Remi'] }))
      .toEqual({ headline: '', detail: 'Remi was not available for comment.', subjects: ['Remi'], bearing: '' });
  });

  it('keeps a stored item\'s bearing, and an empty detail as empty', () => {
    expect(epilogueItemView({ headline: 'H', bearingOnNarrative: 'B' })).toEqual({ headline: 'H', detail: '', subjects: [], bearing: 'B' });
    expect(epilogueItemView(null)).toEqual({ headline: '', detail: '', subjects: [], bearing: '' });
  });
});

describe('enrichmentWarningLines: the enricher\'s new warnings, each a count with a short label', () => {
  it('lists each new key with its count', () => {
    expect(enrichmentWarningLines({ unrecordedSpeakers: 2, droppedContexts: 1, droppedEpilogueItems: 3 })).toEqual([
      '2 quote speakers not recorded: the notes and corrections do not name them',
      '1 quote context dropped: not copied word for word from the notes',
      '3 epilogue items dropped: not copied word for word from the notes'
    ]);
  });

  it('says nothing for a key that is absent or zero, and leaves the existing keys to their own lines', () => {
    expect(enrichmentWarningLines({ droppedQuotes: 4, droppedLinks: 1, droppedContexts: 0 })).toEqual([]);
    expect(enrichmentWarningLines(null)).toEqual([]);
  });

  // 3.6b fix batch (3.5's deferred minor): the two keys the panel did not show yet.
  it("counts a quote's correction the director's corrections do not hold", () => {
    expect(enrichmentWarningLines({ droppedCorrections: 1 })).toEqual([
      '1 quote correction dropped: not copied word for word from the corrections'
    ]);
    expect(enrichmentWarningLines({ droppedCorrections: 2 })).toEqual([
      '2 quote corrections dropped: not copied word for word from the corrections'
    ]);
  });

  it('counts a transaction link whose observation the notes do not hold', () => {
    expect(enrichmentWarningLines({ droppedExcerpts: 1 })).toEqual([
      '1 transaction link dropped: observation not copied word for word from the notes'
    ]);
    expect(enrichmentWarningLines({ droppedExcerpts: 3 })).toEqual([
      '3 transaction links dropped: observation not copied word for word from the notes'
    ]);
  });
});

/**
 * Phases 14 and 15, brief C (ruling R3): the session report can log the bonus and the
 * transfers hours off the game's clock. The parse lines them up by one shift
 * (ledgerCheck.clockShift) or, when no single shift fits, leaves them as logged
 * (ledgerCheck.offClock), and ledgerView says which in one line beside the clock's.
 */
describe('ledgerView: the ledger rows off the game\'s clock', () => {
  const base = {
    clock: { decided: true, evening: false, firstTime: '03:50 PM' },
    adjustmentsParsed: true,
    adjustments: [],
    accounts: [{ name: 'Pip', total: 350000, tokenCount: 1, rank: 1 }],
    mismatches: [],
    unclassified: []
  };

  it('says what moved, how far and which way, exactly', () => {
    const line = (clockShift) => ledgerView({ ...base, clockShift }).shiftLine;
    expect(line({ hours: -9, moved: 5, bonus: true })).toBe(
      "The session report logged the first-burial bonus and 4 transfers 9 hours off the game's clock. They're shifted back 9 hours to line up with the sales."
    );
    expect(line({ hours: -9, moved: 1, bonus: true })).toBe(
      "The session report logged the first-burial bonus 9 hours off the game's clock. It's shifted back 9 hours to line up with the sales."
    );
    expect(line({ hours: -5, moved: 1, bonus: false })).toBe(
      "The session report logged 1 transfer 5 hours off the game's clock. It's shifted back 5 hours to line up with the sales."
    );
    expect(line({ hours: 1, moved: 2, bonus: false })).toBe(
      "The session report logged 2 transfers 1 hour off the game's clock. They're shifted forward 1 hour to line up with the sales."
    );
    expect(line({ hours: -4, moved: 2, bonus: true })).toBe(
      "The session report logged the first-burial bonus and 1 transfer 4 hours off the game's clock. They're shifted back 4 hours to line up with the sales."
    );
  });

  it('says when no single shift lines the rows up, exactly', () => {
    expect(ledgerView({ ...base, offClock: { rows: 3 } }).shiftLine).toBe(
      "3 ledger rows sit off the game's clock, and no single shift lines them up. They print as the session report logged them."
    );
    expect(ledgerView({ ...base, offClock: { rows: 1 } }).shiftLine).toBe(
      "1 ledger row sits off the game's clock, and no single shift lines it up. It prints as the session report logged it."
    );
  });

  it('has no line when every row is on the clock, or for a missing ledger', () => {
    expect(ledgerView(base).shiftLine).toBeNull();
    expect(ledgerView({ ...base, clockShift: null, offClock: null }).shiftLine).toBeNull();
    expect(ledgerView(null).shiftLine).toBeNull();
  });

  it('shows a moved row\'s logged time beside the shifted one', () => {
    const view = ledgerView({ ...base, adjustments: [
      { time: '03:55 PM', loggedTime: '12:55AM', kind: 'bonus', amount: 50000, toAccount: 'Pip' },
      { time: '04:28 PM', loggedTime: '01:28AM', kind: 'transfer', amount: 20000, fromAccount: 'Pip', toAccount: 'Ash' },
      { time: '04:40 PM', kind: 'transfer', amount: 1000, fromAccount: 'Ash', toAccount: 'Pip' }
    ] });
    expect(view.adjustments).toEqual([
      '03:55 PM (logged 12:55AM): first-burial bonus of $50,000 paid to Pip',
      '04:28 PM (logged 01:28AM): transfer of $20,000 from Pip to Ash',
      '04:40 PM: transfer of $1,000 from Ash to Pip'
    ]);
  });
});
