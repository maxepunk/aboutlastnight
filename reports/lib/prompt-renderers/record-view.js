/**
 * The record view (phase 2, brief 2.1; wave-1 ruling R1)
 *
 * One renderer for the session's record. Every call that decides or writes the
 * story reads it: the arc writer (the weave, since phase 4), the outline writer and the
 * article writer (the reworkers take it in 2.3, the judges in 2.4).
 *
 * Each exposed document sits in its own tag, labelled the same way everywhere:
 *
 *   <document id="…" kind="…" name="…" owner="…" layer="exposed">
 *   the document's full text
 *   </document>
 *
 * Buried memories are never documents. They appear once, as sales on the morning
 * timeline (<morning-timeline>, phase 3 brief 3.5): account, amount and time, with no
 * id, owner or text. The timeline merges the ledger (the sales and the classified
 * adjustments on sessionConfig.adjustments) with the evidence log
 * (sessionConfig.exposures, for memories the bundle holds as exposed) in time order,
 * every logged time on the session clock (session-clock.js). It replaced the
 * <buried-transactions> list, and this is the only place it is rendered.
 *
 * Before this, every call got its own cut of the record: the arc writer read
 * Haiku's summaries of each memory's name and the first 200 characters of each
 * paper document, and the outline writer read at most five documents per arc
 * (docs/superpowers/specs/2026-09-24-information-architecture.md §5, root cause 1).
 * The whole usable record of 092026 is about 68,000 characters.
 *
 * Pure: no I/O, no state, and the bundle is never mutated.
 */

const { sessionClockOf, firstEventTime, printLoggedTime, printClockMinute, sessionOrderOf } = require('./session-clock');

/** The one wording an instruction uses to point a writer at a document's text (R1). */
const DOCUMENT_POINTER = 'the document with that id in <RECORD>';

const NO_DOCUMENTS = '(The record holds no exposed documents.)';
const NO_TEXT = '(The record holds no text for this document.)';
const NOT_RECORDED = '(not recorded)';

/**
 * A document's id: `id`, else `tokenId`, else `notionId`.
 *
 * The fact check's source map (lib/evidence.js documentTextsOf, phase 4b) keys on
 * the same fields in the same order, so the id a card cites names a document the
 * writer could see. A rescued paper item carries no `id`; it is named by its Notion
 * id.
 *
 * @param {Object} item - an exposed token or paper item
 * @returns {string|null}
 */
function recordIdOf(item) {
  if (!item || typeof item !== 'object') return null;
  const id = item.id || item.tokenId || item.notionId;
  return id ? String(id) : null;
}

/**
 * The record's own fields for an item. Curation keeps a token's Notion record under
 * `rawData`; a paper item IS its Notion record, spread, with `id` added.
 */
function recordOf(item) {
  return (item && item.rawData && typeof item.rawData === 'object') ? item.rawData : (item || {});
}

/** The first non-empty string, trimmed, or ''. */
function firstText(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * The owner as the record names it: the Notion `owners[]`, already resolved to
 * names by the Notion layer (lib/notion/relations.js). The relation layer writes
 * 'Unknown' for an id it could not name; that is not a name, so it is dropped.
 *
 * The bundle's own `owner` field is never read. It is the preprocessor's
 * `ownerLogline`, null on about half the tokens, and on 092026 it gave the
 * paternity test the wrong owner.
 */
function ownerOf(item) {
  const { owners } = recordOf(item);
  const names = (Array.isArray(owners) ? owners : [])
    .filter(o => typeof o === 'string')
    .map(o => o.trim())
    .filter(o => o && o !== 'Unknown');
  return names.length > 0 ? names.join(', ') : '';
}

/**
 * The document's full text, from the record's own fields: a memory's
 * `fullDescription`, a paper document's `description`. Never a summary, and never
 * `fullContent`, whose fallback chain ends in the item's name.
 */
function textOf(item) {
  const record = recordOf(item);
  return firstText(record.fullDescription, record.description, record.content, record.text);
}

/** Attribute values escape `"` and `&` (R1), and stay on one line. */
function escapeAttr(value) {
  return String(value)
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

/**
 * One <document> tag. An attribute the record holds no value for is left out,
 * never guessed (R1).
 */
function renderDocument(item, kind) {
  const attrs = [
    ['id', recordIdOf(item)],
    ['kind', kind],
    ['name', firstText(recordOf(item).name, item.name)],
    ['owner', ownerOf(item)],
    ['layer', 'exposed']
  ]
    .filter(([, value]) => typeof value === 'string' && value.trim())
    .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
    .join(' ');
  return `<document ${attrs}>\n${textOf(item) || NO_TEXT}\n</document>`;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/**
 * The documents part of the view: every exposed memory, then every exposed paper
 * document (rescued items included), each in full.
 *
 * @param {Object|null} evidenceBundle - the curated bundle ({exposed: {tokens, paperEvidence}})
 * @returns {string} the <document> tags, or a line saying there are none
 */
function renderRecordDocuments(evidenceBundle) {
  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  const documents = [
    ...asArray(exposed.tokens).filter(t => t && typeof t === 'object').map(t => renderDocument(t, 'memory')),
    ...asArray(exposed.paperEvidence).filter(p => p && typeof p === 'object')
      .map(p => renderDocument(p, firstText(recordOf(p).basicType, p.basicType)))
  ];
  return documents.length > 0 ? documents.join('\n\n') : NO_DOCUMENTS;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function formatAmount(amount) {
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    return `$${amount.toLocaleString('en-US')}`;
  }
  return String(amount).trim();
}

/** A field's text, or the mark for a field the record holds no value for. */
function fieldText(value, format = (v) => String(v).trim()) {
  return hasValue(value) ? format(value) : NOT_RECORDED;
}

/** "account: … | amount: …", each field marked when the record has no value for it. */
function accountAmountFields(account, amount) {
  return `account: ${fieldText(account)} | amount: ${fieldText(amount, formatAmount)}`;
}

/**
 * One buried transaction as a prompt prints it outside the timeline: the account,
 * the amount and the time on the session clock, and nothing else. The
 * <TRANSACTION_LINKS> the director's notes are linked to print each sale through
 * here, and the timeline's sale lines go through the same account and amount
 * formatter, so no id, owner or text can reach a prompt through either.
 *
 * @param {Object} fields
 * @param {*} [fields.account]
 * @param {*} [fields.amount] - a number, or a string already formatted
 * @param {*} [fields.time] - the logged time
 * @param {Object|null} [clock] - the session's clock decision (session-clock.js);
 *   without one the time prints as logged
 * @returns {string} "account: … | amount: … | time: …"
 */
function buriedTransactionFields({ account, amount, time } = {}, clock = null) {
  return `${accountAmountFields(account, amount)} | time: ${fieldText(time, (t) => printLoggedTime(t, clock))}`;
}

/**
 * Whether a buried row is a transaction: it has an account, an amount or a time.
 *
 * A buried item with none of the three is not a transaction: it is a memory no one
 * scanned (fetch-nodes tagTokensWithDisposition marks every token in neither list
 * buried, with no transaction data). Every list of buried transactions a prompt
 * carries applies this one rule (the timeline below), so each prompt counts the same
 * sales (phase 2 final fix wave). The arc writer's and the arc judge's own lists went
 * with the arc stage's detective branch (phase 4, brief 4.4).
 *
 * @param {*} row - a bundle's buried.transactions entry
 * @returns {boolean}
 */
function isBuriedTransactionRow(row) {
  if (!row || typeof row !== 'object') return false;
  return hasValue(row.shellAccount) || hasValue(row.amount) || hasValue(row.time);
}

/** The order a shared minute lists its events in: the ledger's rows, then the evidence log's. */
const TABLE_ORDER = { sale: 0, bonus: 1, transfer: 1, exposure: 2 };

/**
 * The name on an exposure's turn-in: null when the evidence log records it as
 * anonymous (empty, "NovaNews (Anonymous)", or Nova's outlet alone), else the name as
 * written, which is an honest attribution (spec T6).
 */
function turnInName(exposer) {
  const text = typeof exposer === 'string' ? exposer.trim() : '';
  if (!text || /anonymous/i.test(text) || /^novanews$/i.test(text)) return null;
  return text;
}

/** The memories the bundle holds as exposed: each known id, lower case, to the id the view prints. */
function exposedMemoryIds(evidenceBundle) {
  const ids = new Map();
  const tokens = asArray(evidenceBundle && evidenceBundle.exposed && evidenceBundle.exposed.tokens);
  tokens.filter((t) => t && typeof t === 'object').forEach((token) => {
    const printed = recordIdOf(token);
    if (!printed) return;
    [printed, recordOf(token).tokenId, token.tokenId]
      .filter((id) => typeof id === 'string' && id.trim())
      .forEach((id) => ids.set(id.trim().toLowerCase(), printed));
  });
  return ids;
}

/**
 * The morning timeline: the ledger and the evidence log merged in time order, every
 * logged time on the session clock (phase 3, brief 3.5).
 *
 * - Sales: the bundle's buried transactions, as account, amount and time only.
 * - Exposures: sessionConfig.exposures, only for a memory the bundle holds as
 *   exposed (the list is model-filled, and an entry naming a buried memory is left
 *   out), as the memory's document id and the name on the turn-in. Its owner column
 *   is never read.
 * - Adjustments: sessionConfig.adjustments, the bonus and the transfers.
 *
 * Events go in order from the first of them, the adjustments included, so an
 * adjustment logged before the first exposure or sale opens the timeline; the clock
 * decision reads the exposures and sales alone (session-clock.js). Events in the
 * same minute keep each table's order, the ledger's (sales, then adjustments) before
 * the evidence log's, and are flagged `sameMinute`. Each event's `minute` is its
 * minute on the session clock in one format (printClockMinute), so two events share
 * it exactly when they share a minute, however each row wrote its time. An event
 * with no readable time goes last, in its table's order, with no minute. A thread
 * parsed before phase 3 (no exposures, no adjustments) gets its sales alone.
 *
 * @param {Object|null} evidenceBundle - the curated bundle
 * @param {Object|null} sessionConfig - the parse: exposures, adjustments, sessionClock
 * @returns {{clock: Object, events: Array<Object>}}
 */
function buildMorningTimeline(evidenceBundle, sessionConfig) {
  const config = sessionConfig || {};
  const clock = sessionClockOf(config, evidenceBundle);
  const rows = [];

  asArray(evidenceBundle && evidenceBundle.buried && evidenceBundle.buried.transactions)
    .filter(isBuriedTransactionRow)
    .forEach((t) => rows.push({ logged: t.time, event: { kind: 'sale', account: t.shellAccount, amount: t.amount } }));

  asArray(config.adjustments)
    .filter((a) => a && (a.kind === 'bonus' || a.kind === 'transfer'))
    .forEach((a) => rows.push({
      logged: a.time,
      event: a.kind === 'bonus'
        ? { kind: 'bonus', toAccount: a.toAccount, amount: a.amount }
        : { kind: 'transfer', fromAccount: a.fromAccount, toAccount: a.toAccount, amount: a.amount }
    }));

  const exposed = exposedMemoryIds(evidenceBundle);
  const exposedIdOf = (entry) => (entry && typeof entry.tokenId === 'string' ? exposed.get(entry.tokenId.trim().toLowerCase()) : undefined);
  asArray(config.exposures)
    .filter((e) => exposedIdOf(e))
    .forEach((e) => rows.push({ logged: e.time, event: { kind: 'exposure', documentId: exposedIdOf(e), exposer: turnInName(e.exposer) } }));

  const start = firstEventTime(rows.map((row) => row.logged));
  const placed = rows.map((row, index) => ({ ...row, index, order: sessionOrderOf(row.logged, start) }));
  placed.sort((a, b) => {
    if (a.order !== b.order) {
      if (a.order === null) return 1;
      if (b.order === null) return -1;
      return a.order - b.order;
    }
    return TABLE_ORDER[a.event.kind] - TABLE_ORDER[b.event.kind] || a.index - b.index;
  });

  const perMinute = new Map();
  placed.forEach((row) => { if (row.order !== null) perMinute.set(row.order, (perMinute.get(row.order) || 0) + 1); });

  const events = placed.map((row) => ({
    ...row.event,
    time: fieldText(row.logged, (t) => printLoggedTime(t, clock)),
    minute: row.order === null ? null : printClockMinute(row.logged, clock),
    sameMinute: row.order !== null && perMinute.get(row.order) > 1
  }));
  return { clock, events };
}

/** One event's line, without its time. */
function timelineEventText(event) {
  switch (event.kind) {
    case 'sale':
      return `sale | ${accountAmountFields(event.account, event.amount)}`;
    case 'exposure':
      return `exposure | document: ${event.documentId} | ${event.exposer ? `named: ${event.exposer}` : 'anonymous'}`;
    case 'bonus':
      return `first-burial bonus | paid to: ${fieldText(event.toAccount)} | amount: ${fieldText(event.amount, formatAmount)}`;
    case 'transfer':
      return `transfer | from: ${fieldText(event.fromAccount)} | to: ${fieldText(event.toAccount)} | amount: ${fieldText(event.amount, formatAmount)}`;
    default:
      return '';
  }
}

const TIMELINE_INTRO = 'The morning in time order: the ledger and the evidence log merged, each logged time on the morning clock. ' +
  'A sale is a buried memory\'s ledger line: the account paid, the amount and the time. ' +
  'An exposure names the memory\'s document id and the name on the turn-in. ' +
  'Events logged in the same minute sit under that minute, in no known order.';

/**
 * The <morning-timeline> part of the view (buildMorningTimeline, printed): one line
 * per event, time first, and the events of a shared minute under one heading, which
 * prints the minute in one format.
 *
 * @param {Object|null} evidenceBundle
 * @param {Object|null} sessionConfig
 * @returns {string} the <morning-timeline> block
 */
function renderMorningTimeline(evidenceBundle, sessionConfig) {
  const { events } = buildMorningTimeline(evidenceBundle, sessionConfig);
  const lines = [];
  events.forEach((event, i) => {
    if (!event.sameMinute) {
      lines.push(`- ${event.time} | ${timelineEventText(event)}`);
      return;
    }
    const previous = events[i - 1];
    if (!previous || !previous.sameMinute || previous.minute !== event.minute) lines.push(`- ${event.minute}, same minute:`);
    lines.push(`  - ${timelineEventText(event)}`);
  });
  return `<morning-timeline>\n${TIMELINE_INTRO}\n${lines.length > 0 ? lines.join('\n') : '(none)'}\n</morning-timeline>`;
}

/**
 * The whole view: one <RECORD> section, the documents and then the morning
 * timeline. A prompt that lists the buried transactions itself takes the documents
 * alone with `{ buried: false }` (R2), so the sales appear once per prompt: the arc
 * writer and the arc judge, until phase 3's 3.3 and 3.4 move them to the timeline.
 *
 * A missing bundle renders as an empty record, so the prompt says the record is
 * empty rather than dropping the section.
 *
 * @param {Object|null} evidenceBundle - the curated evidence bundle
 * @param {Object} [options]
 * @param {boolean} [options.buried=true] - include the <morning-timeline> block
 * @param {Object|null} [options.sessionConfig] - the session's parse: its exposures,
 *   adjustments and clock (a caller without it gets the sales alone, on the clock
 *   their times decide)
 * @returns {string}
 */
function renderRecordView(evidenceBundle, { buried = true, sessionConfig = null } = {}) {
  const intro = 'The session\'s record. Each exposed document below is complete: its id, its kind ' +
    '(memory, or the paper document\'s type), its name, its owner when the record names one, ' +
    'and its layer, then its full text.' +
    (buried ? ' Buried memories appear only as sales on the <morning-timeline> that follows the documents.' : '');
  const parts = [intro, renderRecordDocuments(evidenceBundle)];
  if (buried) parts.push(renderMorningTimeline(evidenceBundle, sessionConfig));
  return `<RECORD>\n${parts.join('\n\n')}\n</RECORD>`;
}

module.exports = {
  renderRecordView,
  renderRecordDocuments,
  buildMorningTimeline,
  renderMorningTimeline,
  buriedTransactionFields,
  isBuriedTransactionRow,
  formatAmount,
  recordIdOf,
  DOCUMENT_POINTER
};

