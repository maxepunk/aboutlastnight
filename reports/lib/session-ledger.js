/**
 * The ledger, as code reads it from the session report (phase 3, brief 3.5; spec
 * section 6 and T5).
 *
 * The session report's Scoring Timeline holds the sales and, as Adjustment rows,
 * the game master's double-entry bookkeeping for every other movement of money.
 * 092026's bonus, in that shape:
 *
 *   06:02 PM | Adjustment | Holding Account (GM_Station_1)    | First Burial Bonus | +$50,000   setup: funds the holding account
 *   07:50 PM | Adjustment | First burial bonus (GM_Station_1) | <account>          | +50,000    the payment, at the first sale
 *   07:51PM  | Adjustment | To<account>(GMStation1)           | FirstBurialBonus   | -50,000    its reversal on the holding account
 *
 * A credit row's Detail names where the money came from and its Team where it went;
 * a debit row's Detail names where it went ("To<account>") and its Team where it came
 * from. A transfer between two players' accounts takes the same two rows.
 *
 * The game master types these labels, and other sessions write the bonus other ways
 * (task 3.11). 061226's report:
 *
 *   Seed (GM_Station_1)                 | First Burial Bonus | +$50,000   setup
 *   First buried (GM_Station_1)         | Vic                | +$50,000   the payment, named by the bonus's stem
 *   Manual GM adjustment (GM_Station_1) | First Burial Bonus | -$50,000   the reversal, naming no destination, in the payment's minute
 *
 * So a credit whose source names the bonus by its stem ("first buri…") is the bonus,
 * and a holding-account debit its Detail leaves unpaired goes with the credit of the
 * same amount logged in the same minute. A transfer's source is an account only when
 * the session report shows it elsewhere, as a sale's account or a Final Standings
 * row; a source with neither is a label, and its row is reported as unclassified.
 *
 * Code turns the rows into events: the bonus as one event paid to the account that
 * received it, a transfer as one row between two players' accounts. The setup and
 * reversal rows are bookkeeping and leave no event, and no Detail label ("GM_Station_1")
 * is kept. Code then computes each account's total (its sales, plus the bonus and
 * transfers it received, less transfers it sent) and sale count, and checks the totals
 * against the session report's Final Standings, which count the bonus in the account
 * that received it ($925,000 against $875,000 of sales on 092026) and list the holding
 * account at 0. The model only copies rows; it counts nothing.
 *
 * Where the Final Standings disagree with a computed total, or list with a non-zero
 * total an account no sale, bonus or transfer reached, the account's total is the
 * standings' figure, as it is when no row was parsed, and `computedTotal` keeps what the
 * rows add up to (final review, data-harness-docs[0]). 053126's game master moved money
 * on "Manual GM adjustment" rows that name no account and paid a "Gift"; those rows are
 * unclassified, so the computed book had no account L though the standings show it at
 * $1,100,000, and the writers' money list left it out.
 *
 * The session report's clock can run hours off the game's: 100326's and 100426's logged
 * the bonus and the transfers nine hours ahead of the sales (phases 14 and 15, brief C).
 * The events are lined up before anything reads them (lineUpOffClockEvents): one
 * whole-hour shift, anchored on the bonus at the first sale, each moved event keeping
 * its logged time beside the shifted one.
 *
 * Pure: no I/O, no state.
 */

const {
  sessionClockOf,
  parseLoggedTime,
  loggedTimeFromMinutes,
  sessionSpanOf: clockSpanOf,
  placeInSpan,
  minutesOutsideSpan
} = require('./prompt-renderers/session-clock');

/** An account name for matching: letters and digits only, lower case. */
function keyOf(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The holding account the game master pays the first-burial bonus from. */
const BONUS_HOLDING_KEY = 'firstburialbonus';
/** The account the setup row funds the holding account from. */
const SETUP_SOURCE_KEY = 'holdingaccount';
/** The bonus's stem, as keyOf reads it: "First buried", "First burial bonus", "FirstBurialBonus". */
const BONUS_STEM_KEY = 'firstburi';

/** Whether a name names the first-burial bonus by its stem. */
function namesTheBonus(name) {
  return keyOf(name).startsWith(BONUS_STEM_KEY);
}

/** A Detail column without its game-master station label: "Ember (GM_Station_1)" -> "Ember". */
function stripStationLabel(detail) {
  return String(detail || '').replace(/\(\s*GM[\s_]*Station[\s_]*\d*\s*\)/gi, '').trim();
}

/** Whether two logged times fall in the same minute ("09:00 PM" and "09:00PM" do); false when either is not a time. */
function sameMinute(a, b) {
  const first = parseLoggedTime(a);
  const second = parseLoggedTime(b);
  return Boolean(first && second) && first.minutes === second.minutes;
}

/** The account a debit row's Detail names as its destination: "ToL(GMStation1)" -> "L". */
function debitDestination(detail) {
  const text = stripStationLabel(detail);
  return /^to\s*/i.test(text) ? text.replace(/^to\s*/i, '').trim() : '';
}

function toAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value || '').replace(/[$,\s]/g, '');
  return text ? Number(text) : NaN;
}

/** One Adjustment row, normalized; null when it has no account or no amount. */
function readRow(row, index) {
  if (!row || typeof row !== 'object') return null;
  const account = String(row.team || '').trim();
  const amount = toAmount(row.amount);
  if (!account || !Number.isFinite(amount) || amount === 0) return null;
  return { index, time: String(row.time || '').trim(), account, amount, detail: String(row.detail || '') };
}

/**
 * What an unreadable row carries, for the input review: its time, account and amount
 * as the parse copied them (a number, or the text), never its Detail.
 */
function unreadableRow(row, index) {
  const amount = typeof row.amount === 'number' ? row.amount : String(row.amount == null ? '' : row.amount).trim();
  return { index, time: String(row.time || '').trim(), account: String(row.team || '').trim(), amount };
}

/**
 * The session report's Adjustment rows as events.
 *
 * @param {Array<{time, detail, team, amount}>} rows - every Adjustment row, as the parse copied it
 * @param {Object} [options]
 * @param {Iterable<string>} [options.accounts] - the accounts the session report shows
 *   elsewhere: every sale's account and every Final Standings row. A transfer whose
 *   source is none of them is reported as unclassified, so a label such as "Payout" never
 *   becomes an account. Without it, no source is checked.
 * @returns {{adjustments: Array<{time, kind, amount, toAccount, fromAccount?}>,
 *            unclassified: Array<{time, account, amount}>}} unclassified holds every row
 *            code could not read or classify, in row order
 */
function classifyAdjustments(rows, { accounts } = {}) {
  const known = accounts ? new Set([...accounts].map(keyOf)) : null;
  const isAccount = (name) => !known || known.has(keyOf(name));
  const read = [];
  const unclassified = [];
  // A row with no account, or a zero or unreadable amount, is reported, never dropped:
  // the totals check would then disagree with the Final Standings and name no row.
  (Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const normalized = readRow(row, index);
    if (normalized) read.push(normalized);
    else if (row && typeof row === 'object') unclassified.push(unreadableRow(row, index));
  });
  const credits = read.filter((r) => r.amount > 0);
  const debits = read.filter((r) => r.amount < 0);

  // Pair each debit with the credit it mirrors: same amount, into the account the
  // debit's Detail names.
  const sourceOf = new Map();
  const pairedDebits = new Set();
  debits.forEach((debit) => {
    const destination = keyOf(debitDestination(debit.detail));
    if (!destination) return;
    const credit = credits.find((c) => !sourceOf.has(c.index) && keyOf(c.account) === destination && c.amount === -debit.amount);
    if (!credit) return;
    sourceOf.set(credit.index, debit.account);
    pairedDebits.add(debit.index);
  });
  // A holding-account debit left unpaired is the bonus's reversal (061226's "Manual GM
  // adjustment" names no destination): it pairs with an unpaired credit of the same
  // amount logged in the same minute, one whose source names the bonus first, which
  // makes that credit the bonus.
  debits.forEach((debit) => {
    if (pairedDebits.has(debit.index) || keyOf(debit.account) !== BONUS_HOLDING_KEY) return;
    const candidates = credits.filter((c) => !sourceOf.has(c.index) && keyOf(c.account) !== BONUS_HOLDING_KEY
      && c.amount === -debit.amount && sameMinute(c.time, debit.time));
    const credit = candidates.find((c) => namesTheBonus(stripStationLabel(c.detail))) || candidates[0];
    if (!credit) return;
    sourceOf.set(credit.index, debit.account);
    pairedDebits.add(debit.index);
  });

  const events = [];
  credits.forEach((credit) => {
    if (keyOf(credit.account) === BONUS_HOLDING_KEY) return; // setup: funds the holding account
    const source = sourceOf.get(credit.index) || stripStationLabel(credit.detail);
    const sourceKey = keyOf(source);
    if (namesTheBonus(source)) {
      events.push({ index: credit.index, event: { time: credit.time, kind: 'bonus', amount: credit.amount, toAccount: credit.account } });
    } else if (sourceKey && sourceKey !== SETUP_SOURCE_KEY && sourceKey !== keyOf(credit.account) && isAccount(source)) {
      events.push({ index: credit.index, event: { time: credit.time, kind: 'transfer', amount: credit.amount, fromAccount: source, toAccount: credit.account } });
    } else {
      unclassified.push({ index: credit.index, time: credit.time, account: credit.account, amount: credit.amount });
    }
  });
  debits.forEach((debit) => {
    if (pairedDebits.has(debit.index)) return;          // the mirror of a credit above
    if (keyOf(debit.account) === BONUS_HOLDING_KEY) return; // the holding account's own bookkeeping
    const destination = debitDestination(debit.detail);
    const destinationKey = keyOf(destination);
    if (destinationKey && destinationKey !== BONUS_HOLDING_KEY && destinationKey !== keyOf(debit.account) && isAccount(debit.account)) {
      events.push({ index: debit.index, event: { time: debit.time, kind: 'transfer', amount: -debit.amount, fromAccount: debit.account, toAccount: destination } });
    } else {
      unclassified.push({ index: debit.index, time: debit.time, account: debit.account, amount: debit.amount });
    }
  });

  return {
    adjustments: events.sort((a, b) => a.index - b.index).map(({ event }) => event),
    unclassified: unclassified.sort((a, b) => a.index - b.index).map(({ index, ...row }) => row)
  };
}

/**
 * How far outside the span of the session's sales and exposures an adjustment event may
 * sit before it is off the game's clock: three hours. The sessions on the clock put a
 * transfer up to two and a half hours after the last sale; the off-clock rows of 100326
 * and 100426 sat seven and a half to nine hours out.
 */
const OFF_CLOCK_MINUTES = 180;
/** The widest shift tried, in whole hours either way. */
const MAX_SHIFT_HOURS = 12;

/** Minutes after midnight, from a logged time; null when it is not a time. */
function minutesOf(text) {
  const read = parseLoggedTime(typeof text === 'string' ? text : '');
  return read ? read.minutes : null;
}

/**
 * The span of the session (session-clock.js sessionSpanOf: its first sale or exposure to its
 * last, in the session clock's order, so a session that runs past midnight is one span), with
 * its first sale. Null when no sale or exposure has a time.
 *
 * @returns {{start: number, end: number, firstSale: number|null}|null} `start` in minutes
 *   after midnight; `end` and `firstSale` in minutes after the start
 */
function sessionSpanOf(saleTimes, exposureTimes) {
  const span = clockSpanOf([...saleTimes, ...exposureTimes]);
  if (!span) return null;
  const sales = saleTimes.map(minutesOf).filter((m) => m !== null).map((m) => placeInSpan(m, span));
  return { start: span.start, end: span.end, firstSale: sales.length > 0 ? Math.min(...sales) : null };
}

/**
 * Lines up the adjustment events the session report logged off the game's clock
 * (phases 14 and 15, brief C; spec section 4, ruling R3).
 *
 * An event (the bonus, a transfer) is off the clock when it sits more than
 * OFF_CLOCK_MINUTES outside the session's span. Every off-clock event moves by one
 * shift of whole hours, from -12 to +12, and a shift is used only when every event it
 * moves lands inside the span. Among the shifts that do:
 * - when the bonus is among the events, the one that lands it nearest the session's
 *   first sale, since the first-burial bonus is paid with the first sale (a tie goes to
 *   the bonus at or after the sale, then to the fewer hours);
 * - otherwise the one of the fewest hours (a tie goes to the shift back).
 * When none fits, nothing moves. A row that makes no event (the setup row, an
 * unclassified row) is never tested and stays as logged, and the classification has
 * already paired the bonus with its holding-account debit on the logged minutes.
 *
 * @param {Array} adjustments - the classified events, each with its logged `time`
 * @param {Array<string>} saleTimes
 * @param {Array<string>} exposureTimes
 * @returns {{adjustments: Array, clockShift?: {hours, moved, bonus}, offClock?: {rows}}}
 *   a moved event's `time` is the shifted time and its `loggedTime` the time as logged
 */
function lineUpOffClockEvents(adjustments, saleTimes, exposureTimes) {
  const span = sessionSpanOf(saleTimes, exposureTimes);
  if (!span) return { adjustments };
  const offClock = adjustments
    .map((event, index) => ({ event, index, minutes: minutesOf(event.time) }))
    .filter(({ minutes }) => minutes !== null && minutesOutsideSpan(minutes, span) > OFF_CLOCK_MINUTES);
  if (offClock.length === 0) return { adjustments };

  const fits = [];
  for (let hours = -MAX_SHIFT_HOURS; hours <= MAX_SHIFT_HOURS; hours += 1) {
    if (hours !== 0 && offClock.every(({ minutes }) => placeInSpan(minutes + hours * 60, span) <= span.end)) fits.push(hours);
  }
  if (fits.length === 0) return { adjustments, offClock: { rows: offClock.length } };

  const bonus = offClock.find(({ event }) => event.kind === 'bonus');
  const byFewestHours = (a, b) => Math.abs(a) - Math.abs(b) || a - b;
  const fromFirstSale = (hours) => placeInSpan(bonus.minutes + hours * 60, span) - span.firstSale;
  const nearestFirstSale = (a, b) => Math.abs(fromFirstSale(a)) - Math.abs(fromFirstSale(b))
    || Number(fromFirstSale(a) < 0) - Number(fromFirstSale(b) < 0)
    || byFewestHours(a, b);
  const [hours] = fits.sort(bonus && span.firstSale !== null ? nearestFirstSale : byFewestHours);

  const moved = new Map(offClock.map(({ index, minutes }) => [index, loggedTimeFromMinutes(minutes + hours * 60)]));
  return {
    adjustments: adjustments.map((event, index) => {
      if (!moved.has(index)) return event;
      const { time, ...rest } = event;
      return { time: moved.get(index), loggedTime: time, ...rest };
    }),
    clockShift: { hours, moved: offClock.length, bonus: Boolean(bonus) }
  };
}

/**
 * The account book: every account, keyed for matching, keeping the first spelling seen.
 */
function accountBook() {
  const accounts = new Map();
  const get = (name) => {
    const key = keyOf(name);
    if (!accounts.has(key)) accounts.set(key, { name: String(name).trim(), sales: 0, saleCount: 0, received: 0, sent: 0 });
    return accounts.get(key);
  };
  return { accounts, get };
}

/**
 * Each account's total and sale count, the classified adjustments, and the check
 * against the Final Standings.
 *
 * With no Adjustment row parsed, the totals are the Final Standings' (they count the
 * bonus the rows would have shown) and the check is skipped: ledgerCheck says the
 * rows were not parsed. An account with no sale, bonus or transfer is left out unless
 * the Final Standings credit it, and the bonus's holding account is always left out.
 *
 * With the rows parsed, an account's total is what its rows add up to wherever the
 * Final Standings agree or do not list it. Where they list it with another figure, or
 * credit an account no row reached, the total is the standings' figure, as without the
 * rows, and `computedTotal` keeps what the rows add up to (final review,
 * data-harness-docs[0]): the writers' money list never leaves out or contradicts an
 * account the session report names. The check names each such account.
 *
 * @param {Object} parse
 * @param {Array} [parse.buriedTokens] - the sales: {shellAccount, amount, time}
 * @param {Array} [parse.adjustmentRows] - every Adjustment row, as the parse copied it
 * @param {Array} [parse.finalStandings] - every Final Standings row: {name, total}
 * @param {Array} [parse.exposures] - the evidence log's rows, {time}: with the sales, the
 *   span the bonus and the transfers are lined up against (lineUpOffClockEvents)
 * @returns {{adjustments: Array, shellAccounts: Array<{name, total, tokenCount, rank, computedTotal?}>,
 *            ledgerCheck: {adjustmentsParsed: boolean, mismatches: Array, unclassified: Array,
 *            clockShift?: {hours, moved, bonus}, offClock?: {rows}}}}
 *            computedTotal is present only on an account whose total is the standings';
 *            clockShift only when events moved onto the game's clock, offClock only when
 *            events sit off it and no single shift fits them
 */
function buildLedger({ buriedTokens, adjustmentRows, finalStandings, exposures } = {}) {
  const adjustmentsParsed = Array.isArray(adjustmentRows) && adjustmentRows.length > 0;
  // A transfer's source is an account only when the session report shows it here too.
  const shown = [
    ...(Array.isArray(buriedTokens) ? buriedTokens : []).map((sale) => sale && sale.shellAccount),
    ...(Array.isArray(finalStandings) ? finalStandings : []).map((row) => row && row.name)
  ].filter((name) => String(name || '').trim());
  const classified = classifyAdjustments(adjustmentRows, { accounts: shown });
  const { unclassified } = classified;
  const timesOf = (list) => (Array.isArray(list) ? list : []).map((entry) => entry && entry.time);
  const { adjustments, clockShift, offClock } = lineUpOffClockEvents(classified.adjustments, timesOf(buriedTokens), timesOf(exposures));
  const { accounts, get } = accountBook();

  (Array.isArray(buriedTokens) ? buriedTokens : []).forEach((sale) => {
    if (!sale || !String(sale.shellAccount || '').trim()) return;
    const account = get(sale.shellAccount);
    const amount = toAmount(sale.amount);
    account.sales += Number.isFinite(amount) ? amount : 0;
    account.saleCount += 1;
  });
  adjustments.forEach((event) => {
    get(event.toAccount).received += event.amount;
    if (event.kind === 'transfer') get(event.fromAccount).sent += event.amount;
  });

  const standings = new Map();
  (Array.isArray(finalStandings) ? finalStandings : []).forEach((row) => {
    const total = toAmount(row && row.total);
    if (!row || !String(row.name || '').trim() || !Number.isFinite(total)) return;
    if (keyOf(row.name) === BONUS_HOLDING_KEY) return;
    standings.set(keyOf(row.name), { name: String(row.name).trim(), total });
  });

  const mismatches = [];
  // An account the standings credit and no sale, bonus or transfer reached is kept at its
  // standing total: without the rows, a transfer's receiver; with them, an account whose
  // money came in on rows code could not classify (053126's L), which the check names.
  const standingOnly = new Set();
  standings.forEach((row, key) => {
    if (row.total === 0 || accounts.has(key)) return;
    get(row.name);
    if (adjustmentsParsed) {
      standingOnly.add(key);
      mismatches.push({ account: row.name, computed: 0, standings: row.total });
    }
  });

  const totals = [...accounts.entries()].map(([key, a]) => {
    const computed = a.sales + a.received - a.sent;
    const standing = standings.get(key);
    const account = { name: a.name, total: computed, tokenCount: a.saleCount };
    if (!adjustmentsParsed) return standing ? { ...account, total: standing.total } : account;
    if (standing ? Math.abs(standing.total - computed) < 0.5 : computed === 0) return account;
    if (!standingOnly.has(key)) mismatches.push({ account: a.name, computed, standings: standing ? standing.total : null });
    return standing ? { ...account, total: standing.total, computedTotal: computed } : account;
  });

  const shellAccounts = totals
    .map((a, order) => ({ ...a, order }))
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .map(({ order, ...a }, i) => ({ ...a, rank: i + 1 }));

  const ledgerCheck = { adjustmentsParsed, mismatches, unclassified };
  if (clockShift) ledgerCheck.clockShift = clockShift;
  if (offClock) ledgerCheck.offClock = offClock;
  return { adjustments, shellAccounts, ledgerCheck };
}

/**
 * What the input review shows of the ledger: the clock rule, the adjustments beside
 * the accounts, the totals check, and the rows the parse lined up onto the game's clock.
 *
 * A thread parsed before phase 3 has no adjustments and no check: it shows its stored
 * account totals, says the adjustment rows were not parsed, and decides its clock from
 * what it holds.
 *
 * @param {Object} state
 * @returns {{clock: Object, adjustmentsParsed: boolean, adjustments: Array, accounts: Array,
 *            mismatches: Array, unclassified: Array, clockShift: Object|null, offClock: Object|null}}
 *            the last two as the parse stamped them (lineUpOffClockEvents), null when absent
 */
function ledgerReviewOf(state) {
  const sessionConfig = (state && state.sessionConfig) || {};
  const check = sessionConfig.ledgerCheck && typeof sessionConfig.ledgerCheck === 'object' ? sessionConfig.ledgerCheck : {};
  const parsed = Array.isArray(sessionConfig.adjustments);
  return {
    clock: sessionClockOf(sessionConfig, state && state.evidenceBundle),
    adjustmentsParsed: parsed && check.adjustmentsParsed === true,
    adjustments: parsed ? sessionConfig.adjustments : [],
    accounts: Array.isArray(state && state.shellAccounts) ? state.shellAccounts : [],
    mismatches: Array.isArray(check.mismatches) ? check.mismatches : [],
    unclassified: Array.isArray(check.unclassified) ? check.unclassified : [],
    clockShift: isPlainObject(check.clockShift) ? check.clockShift : null,
    offClock: isPlainObject(check.offClock) ? check.offClock : null
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

module.exports = {
  classifyAdjustments,
  buildLedger,
  ledgerReviewOf
};
