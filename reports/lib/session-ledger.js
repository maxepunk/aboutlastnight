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
 * Code turns the rows into events: the bonus as one event paid to the account that
 * received it, a transfer as one row between two players' accounts. The setup and
 * reversal rows are bookkeeping and leave no event, and no Detail label ("GM_Station_1")
 * is kept. Code then computes each account's total (its sales, plus the bonus and
 * transfers it received, less transfers it sent) and sale count, and checks the totals
 * against the session report's Final Standings, which count the bonus in the account
 * that received it ($925,000 against $875,000 of sales on 092026) and list the holding
 * account at 0. The model only copies rows; it counts nothing.
 *
 * Pure: no I/O, no state.
 */

const { sessionClockOf } = require('./prompt-renderers/session-clock');

/** An account name for matching: letters and digits only, lower case. */
function keyOf(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The holding account the game master pays the first-burial bonus from. */
const BONUS_HOLDING_KEY = 'firstburialbonus';
/** The account the setup row funds the holding account from. */
const SETUP_SOURCE_KEY = 'holdingaccount';

/** A Detail column without its game-master station label: "Ember (GM_Station_1)" -> "Ember". */
function stripStationLabel(detail) {
  return String(detail || '').replace(/\(\s*GM[\s_]*Station[\s_]*\d*\s*\)/gi, '').trim();
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
 * The session report's Adjustment rows as events.
 *
 * @param {Array<{time, detail, team, amount}>} rows - every Adjustment row, as the parse copied it
 * @returns {{adjustments: Array<{time, kind, amount, toAccount, fromAccount?}>,
 *            unclassified: Array<{time, account, amount}>}}
 */
function classifyAdjustments(rows) {
  const read = (Array.isArray(rows) ? rows : []).map(readRow).filter(Boolean);
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

  const events = [];
  const unclassified = [];
  credits.forEach((credit) => {
    if (keyOf(credit.account) === BONUS_HOLDING_KEY) return; // setup: funds the holding account
    const source = sourceOf.get(credit.index) || stripStationLabel(credit.detail);
    const sourceKey = keyOf(source);
    if (sourceKey === BONUS_HOLDING_KEY) {
      events.push({ index: credit.index, event: { time: credit.time, kind: 'bonus', amount: credit.amount, toAccount: credit.account } });
    } else if (sourceKey && sourceKey !== SETUP_SOURCE_KEY && sourceKey !== keyOf(credit.account)) {
      events.push({ index: credit.index, event: { time: credit.time, kind: 'transfer', amount: credit.amount, fromAccount: source, toAccount: credit.account } });
    } else {
      unclassified.push({ time: credit.time, account: credit.account, amount: credit.amount });
    }
  });
  debits.forEach((debit) => {
    if (pairedDebits.has(debit.index)) return;          // the mirror of a credit above
    if (keyOf(debit.account) === BONUS_HOLDING_KEY) return; // the holding account's own bookkeeping
    const destination = debitDestination(debit.detail);
    const destinationKey = keyOf(destination);
    if (destinationKey && destinationKey !== BONUS_HOLDING_KEY && destinationKey !== keyOf(debit.account)) {
      events.push({ index: debit.index, event: { time: debit.time, kind: 'transfer', amount: -debit.amount, fromAccount: debit.account, toAccount: destination } });
    } else {
      unclassified.push({ time: debit.time, account: debit.account, amount: debit.amount });
    }
  });

  return {
    adjustments: events.sort((a, b) => a.index - b.index).map(({ event }) => event),
    unclassified
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
 * rows were not parsed. An account with no sale, bonus or transfer is left out, as is
 * the bonus's holding account.
 *
 * @param {Object} parse
 * @param {Array} [parse.buriedTokens] - the sales: {shellAccount, amount, time}
 * @param {Array} [parse.adjustmentRows] - every Adjustment row, as the parse copied it
 * @param {Array} [parse.finalStandings] - every Final Standings row: {name, total}
 * @returns {{adjustments: Array, shellAccounts: Array<{name, total, tokenCount, rank}>,
 *            ledgerCheck: {adjustmentsParsed: boolean, mismatches: Array, unclassified: Array}}}
 */
function buildLedger({ buriedTokens, adjustmentRows, finalStandings } = {}) {
  const adjustmentsParsed = Array.isArray(adjustmentRows) && adjustmentRows.length > 0;
  const { adjustments, unclassified } = classifyAdjustments(adjustmentRows);
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
  standings.forEach((row) => {
    if (row.total === 0) return;
    // Without the rows, an account the standings credit but no sale reached (a
    // transfer's receiver) is kept at its standing total.
    if (!adjustmentsParsed) get(row.name);
    else if (!accounts.has(keyOf(row.name))) mismatches.push({ account: row.name, computed: 0, standings: row.total });
  });

  const totals = [...accounts.entries()].map(([key, a]) => {
    const computed = a.sales + a.received - a.sent;
    const standing = standings.get(key);
    if (!adjustmentsParsed) {
      return { name: a.name, total: standing ? standing.total : computed, tokenCount: a.saleCount };
    }
    const agrees = standing ? Math.abs(standing.total - computed) < 0.5 : computed === 0;
    if (!agrees) mismatches.push({ account: a.name, computed, standings: standing ? standing.total : null });
    return { name: a.name, total: computed, tokenCount: a.saleCount };
  });

  const shellAccounts = totals
    .map((a, order) => ({ ...a, order }))
    .sort((a, b) => b.total - a.total || a.order - b.order)
    .map(({ order, ...a }, i) => ({ ...a, rank: i + 1 }));

  return { adjustments, shellAccounts, ledgerCheck: { adjustmentsParsed, mismatches, unclassified } };
}

/**
 * What the input review shows of the ledger: the clock rule, the adjustments beside
 * the accounts, and the totals check.
 *
 * A thread parsed before phase 3 has no adjustments and no check: it shows its stored
 * account totals, says the adjustment rows were not parsed, and decides its clock from
 * what it holds.
 *
 * @param {Object} state
 * @returns {{clock: Object, adjustmentsParsed: boolean, adjustments: Array, accounts: Array,
 *            mismatches: Array, unclassified: Array}}
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
    unclassified: Array.isArray(check.unclassified) ? check.unclassified : []
  };
}

module.exports = {
  classifyAdjustments,
  buildLedger,
  ledgerReviewOf
};
