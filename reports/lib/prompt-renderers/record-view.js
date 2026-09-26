/**
 * The record view (phase 2, brief 2.1; wave-1 ruling R1)
 *
 * One renderer for the session's record. Every call that decides or writes the
 * story reads it: the arc writer, the interweaving call, the outline writer and the
 * article writer (the reworkers take it in 2.3, the judges in 2.4).
 *
 * Each exposed document sits in its own tag, labelled the same way everywhere:
 *
 *   <document id="…" kind="…" name="…" owner="…" layer="exposed">
 *   the document's full text
 *   </document>
 *
 * Buried memories are never documents. They are listed once, in
 * <buried-transactions>, as account, amount and time, with no id, owner or text.
 *
 * Before this, every call got its own cut of the record: the arc writer read
 * Haiku's summaries of each memory's name and the first 200 characters of each
 * paper document, and the outline writer read at most five documents per arc
 * (docs/superpowers/specs/2026-09-24-information-architecture.md §5, root cause 1).
 * The whole usable record of 092026 is about 68,000 characters.
 *
 * Pure: no I/O, no state, and the bundle is never mutated.
 */

/** The one wording an instruction uses to point a writer at a document's text (R1). */
const DOCUMENT_POINTER = 'the document with that id in <RECORD>';

const NO_DOCUMENTS = '(The record holds no exposed documents.)';
const NO_TEXT = '(The record holds no text for this document.)';
const NOT_RECORDED = '(not recorded)';

/**
 * A document's id: `id`, else `tokenId`, else `notionId`.
 *
 * The fact check's source map (content-bundle-fact-check.js buildSourceMap) keys on
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

/**
 * The buried-transactions part of the view: one line per transaction, with only
 * the account, the amount and the time. Nothing else on a buried item is read, so
 * no id, owner or text can reach a prompt through it.
 *
 * A buried item with none of the three is not a transaction: it is a memory no one
 * scanned (fetch-nodes tagTokensWithDisposition marks every token in neither list
 * buried, with no transaction data). It is left out rather than printed as a sale.
 *
 * @param {Object|null} evidenceBundle - the curated bundle ({buried: {transactions}})
 * @returns {string} the <buried-transactions> block
 */
function renderBuriedTransactions(evidenceBundle) {
  const buried = (evidenceBundle && evidenceBundle.buried) || {};
  const lines = asArray(buried.transactions)
    .filter(t => t && typeof t === 'object')
    .filter(t => hasValue(t.shellAccount) || hasValue(t.amount) || hasValue(t.time))
    .map(t => {
      const account = hasValue(t.shellAccount) ? String(t.shellAccount).trim() : NOT_RECORDED;
      const amount = hasValue(t.amount) ? formatAmount(t.amount) : NOT_RECORDED;
      const time = hasValue(t.time) ? String(t.time).trim() : NOT_RECORDED;
      return `- account: ${account} | amount: ${amount} | time: ${time}`;
    });
  return `<buried-transactions>\n${lines.length > 0 ? lines.join('\n') : '(none)'}\n</buried-transactions>`;
}

/**
 * The whole view: one <RECORD> section, the documents and then the buried
 * transactions. A prompt that already lists the buried transactions takes the
 * documents alone with `{ buried: false }` (R2), so they appear once per prompt.
 *
 * A missing bundle renders as an empty record, so the prompt says the record is
 * empty rather than dropping the section.
 *
 * @param {Object|null} evidenceBundle - the curated evidence bundle
 * @param {Object} [options]
 * @param {boolean} [options.buried=true] - include the <buried-transactions> block
 * @returns {string}
 */
function renderRecordView(evidenceBundle, { buried = true } = {}) {
  const intro = 'The session\'s record. Each exposed document below is complete: its id, its kind ' +
    '(memory, or the paper document\'s type), its name, its owner when the record names one, ' +
    'and its layer, then its full text.' +
    (buried ? ' Buried memories appear only in <buried-transactions>, as account, amount and time.' : '');
  const parts = [intro, renderRecordDocuments(evidenceBundle)];
  if (buried) parts.push(renderBuriedTransactions(evidenceBundle));
  return `<RECORD>\n${parts.join('\n\n')}\n</RECORD>`;
}

module.exports = {
  renderRecordView,
  renderRecordDocuments,
  renderBuriedTransactions,
  recordIdOf,
  DOCUMENT_POINTER
};
