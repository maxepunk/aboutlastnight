/**
 * The evidence underneath (phase 4b, piece 1, brief 1B; spec
 * docs/superpowers/specs/2026-10-05-story-level-and-evidence.md sections 3, 5 and 6.1; ruling R10).
 *
 * The story meeting and the map show the story in plain terms, and the evidence behind each line
 * travels underneath it, so the article writer cites from it. A thread, a connection and a beat
 * each carry `evidence`: the pieces of the record that tell it, each `{sources, shows, stance, card?}`:
 * - `sources`: one or more of a document in the record by its id (the record view's id rule) and
 *   EVIDENCE_SOURCES, the ledger, the evidence log and the director's notes. A piece that sets two
 *   sources side by side names both;
 * - `shows`: what the piece shows, in a short line with the words or figures that matter;
 * - `stance`: whether it supports its line or cuts against it (EVIDENCE_STANCES);
 * - `card`: on a beat's piece only, the one whose document prints as the beat's card (R4).
 *
 * This module holds what the weave and the map share, so each rule is one function:
 * - EVIDENCE_PIECE_SCHEMA, the piece's shape, which both writers' schemas embed;
 * - SOURCES_GLOSS, what each of EVIDENCE_SOURCES holds, which the weave writer's Sources line
 *   and the article writer's map label print, and which evidenceContextOf reads in code;
 * - evidenceProblems, the evidence check: each source names a document in the record or one of
 *   EVIDENCE_SOURCES, never a buried memory, and each quotation in `shows` is word for word in one
 *   of its sources' texts (lib/grounding.js isVerbatimIn), whatever its quotation marks, case or
 *   spacing;
 * - storyTermsProblems, the story-terms check over one of the writer's lines: a document id the
 *   record holds, a quotation in quotation marks (lib/grounding.js QUOTED_SPANS, so an apostrophe
 *   in a name or a possessive is never one), a clock time and a money figure; describeStoryTerms
 *   and STORY_TERMS_FIX give its line and its fix;
 * - documentTextsOf, a document id to its quotable text (it was the article fact check's
 *   buildSourceMap);
 * - recordDocumentOf and documentResolverOf, the one rule for "this document is in the record"
 *   (fix round 4): an id in any case to the record's own id and text, which the evidence check,
 *   the map's card check, the article writer's card line and the article fact check's card
 *   fidelity read;
 * - evidenceContextOf, what both checks read from a thread's state.
 *
 * The evidence is never the director's edit (R6): lib/hand-edit-diff.js leaves it out of every
 * diff, so no check finds a director's share of it.
 *
 * Pure: no I/O, no state, no input mutated. Generic: nothing here names a theme.
 */
'use strict';

const { isVerbatimIn, normalizeForGrounding, QUOTED_SPANS, ELISION } = require('./grounding');
const { recordIdOf, buildMorningTimeline, timelineEventLine } = require('./prompt-renderers/record-view');
// Phases 14 and 15, brief B (R1): the director's words are one list, which "notes" reads.
const { directorWordsTexts } = require('./director-words');

/** The sources a piece may name besides a document in the record. */
const EVIDENCE_SOURCES = Object.freeze({ LEDGER: 'ledger', EVIDENCE_LOG: 'evidence-log', NOTES: 'notes' });

/** Whether a piece supports its line or cuts against it. */
const EVIDENCE_STANCES = Object.freeze(['supports', 'cuts-against']);

/** The sources besides a document, as a list reads them: "ledger", "evidence-log" or "notes". */
const NAMED_SOURCES = (() => {
  const quoted = Object.values(EVIDENCE_SOURCES).map((source) => `"${source}"`);
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
})();

/**
 * What each source besides a document holds, as the writers read it. evidenceContextOf reads the
 * same meanings in code: the ledger's rows and the evidence log's from the morning timeline, and
 * the director's words through notesTextsOf. The evidence log's meaning follows the ledger's in
 * EVIDENCE_SOURCES' order, so its "it" is the morning timeline.
 */
const SOURCE_MEANINGS = Object.freeze({
  [EVIDENCE_SOURCES.LEDGER]: 'a sale, the bonus or a transfer on the morning timeline',
  [EVIDENCE_SOURCES.EVIDENCE_LOG]: 'an exposure on it',
  [EVIDENCE_SOURCES.NOTES]: "the director's own words: the notes, the corrections, the accusation, the answers at the story meeting and the standing notes from the stops"
});

/**
 * The sources besides a document, each with what it holds, as a list reads them: the one gloss
 * the weave writer's Sources line and the article writer's map label both print.
 */
const SOURCES_GLOSS = (() => {
  const glossed = Object.values(EVIDENCE_SOURCES).map((source) => `"${source}" for ${SOURCE_MEANINGS[source]}`);
  return `${glossed.slice(0, -1).join(', ')}, or ${glossed[glossed.length - 1]}`;
})();

/**
 * One piece of evidence, as the weave's schema and the map's embed it (R1). Every description
 * says what its field holds; the rule items the writers read state the rest. A description names
 * the record in words, never by its tag: the weave writer's OUTPUT FORMAT prints them above the
 * record.
 */
const EVIDENCE_PIECE_SCHEMA = {
  type: 'object',
  description: 'One piece of the record the line rests on',
  properties: {
    sources: {
      type: 'array',
      items: { type: 'string' },
      minItems: 1,
      description: `Where the piece comes from: the id of a document in the record, or ${NAMED_SOURCES}. A piece that sets two sources side by side names both`
    },
    shows: { type: 'string', description: 'What the piece shows, in a short line with the words or figures that matter; a quotation is word for word from its source' },
    stance: { type: 'string', enum: [...EVIDENCE_STANCES], description: 'Whether the piece supports its line or cuts against it' },
    card: { type: 'boolean', description: "On a beat of the map: true on the one piece whose document the article prints as the beat's card (C9)" }
  },
  required: ['sources', 'shows', 'stance']
};

/** A field as text: the string trimmed, or '' for anything else. */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

// ── The record's documents ───────────────────────────────────────────────────

/**
 * The text fields a document may carry its quotable content in. `summary` is left out on
 * purpose: it is a generated paraphrase, so reading it as quotable would bless the fabrication a
 * card check exists to catch.
 */
function sourceTextOf(item) {
  if (!isObject(item)) return '';
  return String(item.fullContent || item.content || item.description || item.text || '');
}

/**
 * The ids a document in the record answers to: its id, tokenId, notionId, pageId and name, in
 * that order. A card or a piece cites a document by any of them: the record view names it by the
 * first of id, tokenId and notionId (record-view.js recordIdOf), and the ids a card may name
 * include a paper's pageId and name (node-helpers.js buildValidEvidenceIds).
 */
const SOURCE_ID_FIELDS = ['id', 'tokenId', 'notionId', 'pageId', 'name'];

/**
 * Each document in the record by every id it answers to (SOURCE_ID_FIELDS), with its quotable
 * text: the evidence bundle's exposed documents, nested under `exposed.{tokens,paperEvidence}`
 * (older callers pass a flat `exposedEvidence` array). The first document to claim an id keeps it.
 * A buried memory is never a document.
 *
 * Phase 4 (brief 4.6; R5): the record alone, every source an arc package supplied still found.
 * Phase 4b (brief 1B; R10): moved here from the article fact check (its buildSourceMap), which
 * reads it for card fidelity, so the evidence check reads a piece's document the same way.
 *
 * @param {Object|null} evidenceBundle - the curated bundle
 * @returns {Map<string, string>}
 */
function documentTextsOf(evidenceBundle) {
  const map = new Map();
  const add = (item) => {
    if (!isObject(item)) return;
    const text = sourceTextOf(item);
    if (!text) return;
    SOURCE_ID_FIELDS.forEach((field) => {
      const id = item[field];
      if (id && !map.has(String(id))) map.set(String(id), text);
    });
  };
  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  asArray(exposed.tokens).forEach(add);
  asArray(exposed.paperEvidence).forEach(add);
  asArray(evidenceBundle && evidenceBundle.exposedEvidence).forEach(add);
  return map;
}

/**
 * The one rule for "this document is in the record" (fix round 4), over documentTextsOf's
 * documents, the exposed documents with quotable text: an id in any case, any of the ids a
 * document answers to (SOURCE_ID_FIELDS), resolves to `{id, text}`, the record's own id, as the
 * record view names the document (record-view.js recordIdOf, else its pageId or name), and its
 * text. The first document to claim an id keeps it. Null for an id no such document answers to.
 *
 * The evidence check reads it for a piece's source (evidenceProblems), the map's card check for a
 * card's document (lib/map.js), the article writer's card line to print the record's spelling
 * (lib/prompt-builder.js mapCardsLine) and the article fact check's card fidelity for a card's
 * source, so a card cited as "SAM001" for sam001 passes every reader alike.
 *
 * @param {Object|null} evidenceBundle - the curated bundle
 * @returns {function(*): ({id: string, text: string}|null)}
 */
function documentResolverOf(evidenceBundle) {
  const byLowerId = new Map();
  const add = (item) => {
    if (!isObject(item)) return;
    const text = sourceTextOf(item);
    if (!text) return;
    const own = recordIdOf(item) || textOf(item.pageId) || textOf(item.name);
    SOURCE_ID_FIELDS.forEach((field) => {
      const id = item[field] ? String(item[field]).trim().toLowerCase() : '';
      if (id && !byLowerId.has(id)) byLowerId.set(id, { id: own, text });
    });
  };
  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  asArray(exposed.tokens).forEach(add);
  asArray(exposed.paperEvidence).forEach(add);
  asArray(evidenceBundle && evidenceBundle.exposedEvidence).forEach(add);
  return (id) => {
    const key = typeof id === 'string' || typeof id === 'number' ? String(id).trim().toLowerCase() : '';
    return (key && byLowerId.get(key)) || null;
  };
}

/** The resolver a context built by hand gives: each id of its `documents` in any case, the id as the map holds it. */
function resolverOfTexts(documents) {
  const byLowerId = new Map();
  documents.forEach((text, id) => {
    const lower = String(id).trim().toLowerCase();
    if (!byLowerId.has(lower)) byLowerId.set(lower, { id: String(id), text });
  });
  return (id) => {
    const key = typeof id === 'string' || typeof id === 'number' ? String(id).trim().toLowerCase() : '';
    return (key && byLowerId.get(key)) || null;
  };
}

/** The shortest id the story-terms check looks for: a shorter one would match ordinary words. */
const MIN_ID_LENGTH = 3;

/**
 * The ids the record's documents answer to, never their names: what the story-terms check finds
 * in a line. A document's name is the writer's way to say what it is, and a line may say it; an id
 * is a handle the director never needs (spec 4.1).
 *
 * @param {Object|null} evidenceBundle
 * @returns {Set<string>}
 */
function documentIdsOf(evidenceBundle) {
  const ids = new Set();
  const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
  const add = (...values) => values.forEach((value) => {
    const id = textOf(value);
    if (id.length >= MIN_ID_LENGTH) ids.add(id);
  });
  asArray(exposed.tokens).filter(isObject).forEach((token) => {
    add(recordIdOf(token), token.tokenId, token.notionId, isObject(token.rawData) ? token.rawData.tokenId : null);
  });
  asArray(exposed.paperEvidence).filter(isObject).forEach((paper) => add(recordIdOf(paper), paper.notionId, paper.pageId, paper.tokenId));
  return ids;
}

/** The buried memories by every id their rows carry, in lower case: never a piece's source. */
function buriedIdsOf(evidenceBundle) {
  const ids = new Set();
  const rows = asArray(evidenceBundle && evidenceBundle.buried && evidenceBundle.buried.transactions).filter(isObject);
  rows.forEach((row) => {
    const raw = isObject(row.rawData) ? row.rawData : {};
    [row.id, row.tokenId, row.notionId, raw.tokenId, raw.id].map(textOf).filter(Boolean).forEach((id) => ids.add(id.toLowerCase()));
  });
  return ids;
}

/**
 * The director's own words a piece names as "notes" (T1): the director's words as one list
 * (lib/director-words.js), the notes, the corrections, the accusation as written, the answers
 * at the story meeting and every note sent at a stop, so a piece may quote a note at a stop.
 */
function notesTextsOf(state) {
  return directorWordsTexts(state);
}

/**
 * What the evidence check and the story-terms check read, from a thread's state:
 * - `documents`: each document in the record by every id it answers to, with its text
 *   (documentTextsOf);
 * - `resolveDocument`: an id in any case to the record's own id and text (documentResolverOf;
 *   fix round 4);
 * - `documentIds`: the ids a line may not name (documentIdsOf);
 * - `texts`: the text of each source besides a document: the ledger's rows (each sale, the
 *   first-burial bonus and each transfer) and the evidence log's (each exposure: the document and
 *   the name on its turn-in, or "anonymous"), each as the writer reads it on the morning timeline
 *   (lib/prompt-renderers/record-view.js timelineEventLine; fix round 4), and the director's words
 *   (notesTextsOf);
 * - `buried`: the buried memories by their ids, which no piece names.
 * A buried memory's id, owner and text reach none of them but `buried`.
 *
 * @param {Object} state - the evidence bundle, the session's parse, the director's words, the weave's answers
 * @returns {{documents: Map<string, string>, resolveDocument: function(*): ({id: string, text: string}|null),
 *            documentIds: Set<string>, texts: Object<string, string[]>, buried: Set<string>}}
 */
function evidenceContextOf(state) {
  const s = isObject(state) ? state : {};
  const bundle = s.evidenceBundle || null;
  const { events } = buildMorningTimeline(bundle, s.sessionConfig || null);
  return {
    documents: documentTextsOf(bundle),
    resolveDocument: documentResolverOf(bundle),
    documentIds: documentIdsOf(bundle),
    texts: {
      [EVIDENCE_SOURCES.LEDGER]: events.filter((event) => event.kind !== 'exposure').map(timelineEventLine),
      [EVIDENCE_SOURCES.EVIDENCE_LOG]: events.filter((event) => event.kind === 'exposure').map(timelineEventLine),
      [EVIDENCE_SOURCES.NOTES]: notesTextsOf(s)
    },
    buried: buriedIdsOf(bundle)
  };
}

/** A context as the checks read it: every part present. */
function contextOf(context) {
  const c = isObject(context) ? context : {};
  const documents = c.documents instanceof Map ? c.documents : new Map();
  return {
    documents,
    resolveDocument: typeof c.resolveDocument === 'function' ? c.resolveDocument : resolverOfTexts(documents),
    documentIds: c.documentIds instanceof Set ? c.documentIds : new Set(),
    texts: isObject(c.texts) ? c.texts : {},
    buried: c.buried instanceof Set ? c.buried : new Set()
  };
}

// ── The evidence check ───────────────────────────────────────────────────────

/**
 * The quotation marks the grounding module's fold leaves apart from a straight single mark: the
 * straight double mark, and the low and the reversed ones.
 */
const OTHER_QUOTATION_MARKS = /[‚‛„‟"]/g;

/**
 * Text as a quotation is compared: the grounding module's fold (lib/grounding.js
 * normalizeForGrounding: curly marks straight, every dash a hyphen, runs of space one space), then
 * every quotation mark one mark, single or double, and one case. A quotation that differs from
 * its source only in its marks, case or spacing is word for word (Review focus 5).
 */
function folded(text) {
  return normalizeForGrounding(text).replace(OTHER_QUOTATION_MARKS, "'").toLowerCase();
}

/** A quotation's words without its own marks, or the punctuation and space at its ends. */
function quotedWords(span) {
  return span.replace(/^[\s'‘’"“”]+|[\s'‘’"“”]+$/g, '').replace(/^[\s.,;:!?]+|[\s.,;:!?]+$/g, '');
}

/** The quotations a line holds (QUOTED_SPANS), each as written, with the parts its elisions leave. */
function quotationsOf(text) {
  return (String(text).match(QUOTED_SPANS) || []).map((span) => ({
    span,
    parts: quotedWords(span).split(ELISION).map(quotedWords).filter(Boolean)
  }));
}

/** Whether one of `texts` holds `words` word for word, whatever their quotation marks, case or spacing. */
function heldIn(texts, words) {
  return texts.some((text) => isVerbatimIn(folded(words), folded(text)));
}

/**
 * The texts a source names, or null for a source the record lacks: a buried memory (whatever the
 * record lists), one of EVIDENCE_SOURCES, or a document by any id it answers to, in any case
 * (the context's resolveDocument, documentResolverOf's rule).
 */
function sourceTexts(source, ctx) {
  const lower = source.toLowerCase();
  if (ctx.buried.has(lower)) return null;
  const named = Object.values(EVIDENCE_SOURCES).find((name) => name === lower);
  if (named) return asArray(ctx.texts[named]).filter((text) => typeof text === 'string');
  const document = ctx.resolveDocument(source);
  return document ? [document.text] : null;
}

/**
 * The document in the record an id names, in any case, as the evidence check reads a source:
 * `{id, text}`, the record's own id and its text, or null (documentResolverOf's rule).
 *
 * @param {*} id
 * @param {Object} context - evidenceContextOf's
 * @returns {{id: string, text: string}|null}
 */
function recordDocumentOf(id, context) {
  return contextOf(context).resolveDocument(id);
}

/** How to fix each kind of fault a piece can have, in the order a line gives them. */
const PIECE_FIXES = {
  malformed: 'Give each piece its sources, what it shows and its stance, "supports" or "cuts-against".',
  source: `Name each source by the id of a document in the record, or as ${NAMED_SOURCES}.`,
  quotation: 'Copy each quotation word for word from a source the piece names, or name the source that holds it.'
};

/** What a piece lacks of its shape, as a line names it, or none. */
function missingParts(piece, sources) {
  return [
    sources.length === 0 && 'its sources',
    !textOf(piece.shows) && 'what it shows',
    !EVIDENCE_STANCES.includes(piece.stance) && `its stance, ${EVIDENCE_STANCES.map((stance) => `"${stance}"`).join(' or ')}`
  ].filter(Boolean);
}

/**
 * The evidence check (spec 6.1; R1): one problem for each piece that fails it, `{index, kinds,
 * what, fix, unknownSources, quotations, lacks}`, where `index` is the piece's place in the list,
 * `kinds` its faults in order (`malformed`: it lacks its sources, what it shows or its stance;
 * `source`: it names a source the record lacks; `quotation`: a quotation in what it shows is word
 * for word in none of its sources), `what` says them in a phrase that follows "piece N", and `fix`
 * says how to fix them. The rest is what evidenceProblemsSaid says to the director: how many of
 * its sources the record lacks (`unknownSources`), the quotations none of them holds
 * (`quotations`, each as written) and the parts of its shape it lacks (`lacks`: `sources`, `shows`,
 * `stance`).
 * A source the record lacks and a buried memory read alike, so the line names nothing the record
 * keeps of a buried memory. A quotation is read only against the sources the piece names that the
 * record holds, and is word for word whatever its quotation marks, case or spacing, each part of
 * an elided one alike.
 *
 * @param {*} pieces - a thread's, a connection's or a beat's evidence; anything but a list holds none
 * @param {Object} context - evidenceContextOf's
 * @returns {Array<{index: number, kinds: string[], what: string, fix: string, unknownSources: number,
 *                  quotations: string[], lacks: string[]}>}
 */
function evidenceProblems(pieces, context) {
  if (!Array.isArray(pieces)) return [];
  const ctx = contextOf(context);
  return pieces.map((element, index) => {
    const piece = isObject(element) ? element : {};
    const sources = asArray(piece.sources).map(textOf).filter(Boolean);
    const faults = [];
    const missing = missingParts(piece, sources);
    if (missing.length > 0) faults.push({ kind: 'malformed', what: `lacks ${listOf(missing)}` });
    const read = sources.map((source) => ({ source, texts: sourceTexts(source, ctx) }));
    const unknown = read.filter((entry) => entry.texts === null).map((entry) => `"${entry.source}"`);
    if (unknown.length > 0) {
      faults.push({ kind: 'source', what: `names ${listOf(unknown)}, which ${unknown.length > 1 ? 'are no documents' : 'is no document'} in the record and none of ${NAMED_SOURCES}` });
    }
    const texts = read.filter((entry) => entry.texts !== null).flatMap((entry) => entry.texts);
    const unheld = read.some((entry) => entry.texts !== null)
      ? quotationsOf(textOf(piece.shows)).filter(({ parts }) => parts.some((part) => !heldIn(texts, part))).map(({ span }) => span)
      : [];
    if (unheld.length > 0) faults.push({ kind: 'quotation', what: `quotes ${listOf(unheld)}, which none of its sources holds word for word` });
    if (faults.length === 0) return null;
    const kinds = faults.map((fault) => fault.kind);
    return {
      index,
      kinds,
      what: faults.map((fault) => fault.what).join('; and '),
      fix: kinds.map((kind) => PIECE_FIXES[kind]).join(' '),
      unknownSources: unknown.length,
      quotations: unheld,
      lacks: [sources.length === 0 && 'sources', !textOf(piece.shows) && 'shows', !EVIDENCE_STANCES.includes(piece.stance) && 'stance'].filter(Boolean)
    };
  }).filter(Boolean);
}

/**
 * A line's evidence problems (evidenceProblems') as one phrase and one fix, the line the weave's
 * checks and the map's write: `piece 2 names "zzz999", which is no document in the record ...; piece
 * 3 quotes "...", which none of its sources holds word for word`, each piece by its place in the
 * line's evidence, counted from one, and each kind of fix once, in the order its fault first
 * comes.
 *
 * @param {Array<{index: number, kinds: string[], what: string}>} problems
 * @returns {{what: string, fix: string}}
 */
function describeEvidenceProblems(problems) {
  const list = asArray(problems);
  const kinds = [];
  list.forEach((problem) => asArray(problem.kinds).forEach((kind) => { if (!kinds.includes(kind)) kinds.push(kind); }));
  return {
    what: list.map((problem) => `piece ${problem.index + 1} ${problem.what}`).join('; '),
    fix: kinds.map((kind) => PIECE_FIXES[kind]).filter(Boolean).join(' ')
  };
}

/** The parts of a piece's shape, as the director's line says a piece lacks them. */
const LACKS_SAID = { sources: 'where it comes from', shows: 'what it shows', stance: 'whether it supports the line' };

/**
 * A line's evidence problems (evidenceProblems') said to the director, in a phrase that follows
 * "the evidence behind" the line, for the whole line at once: `cites a document the record does
 * not hold, and has a piece that quotes words its source does not hold`. It says each kind of
 * fault once, the documents the record lacks first, then the misquoting pieces, then a piece's
 * missing parts, and names no source's id, no piece's number and no quotation, since the director
 * reads the line and not its pieces, and the only quotation on the meeting's page is the
 * director's own words (spec 2026-10-05 section 4.1; fix round 4). The rework's message keeps the
 * quotation (describeEvidenceProblems). The weave's checks and the map's give it in a failure's
 * `line` (lib/weave.js weaveFindings).
 *
 * @param {Array<{unknownSources: number, quotations: string[], lacks: string[]}>} problems
 * @returns {string} '' for no problem
 */
function evidenceProblemsSaid(problems) {
  const list = asArray(problems).filter(isObject);
  const unknown = list.reduce((sum, problem) => sum + (Number(problem.unknownSources) || 0), 0);
  const misquoting = list.filter((problem) => asArray(problem.quotations).length > 0).length;
  const malformed = list.filter((problem) => asArray(problem.lacks).length > 0);
  const lacks = Object.keys(LACKS_SAID).filter((part) => malformed.some((problem) => problem.lacks.includes(part))).map((part) => LACKS_SAID[part]);
  const clauses = [
    unknown > 0 && `cites ${unknown > 1 ? 'documents' : 'a document'} the record does not hold`,
    misquoting > 0 && (misquoting > 1 ? 'has pieces that quote words their sources do not hold' : 'has a piece that quotes words its source does not hold'),
    lacks.length > 0 && `has ${malformed.length > 1 ? 'pieces that do' : 'a piece that does'} not say ${lacks.length > 1 ? `${lacks.slice(0, -1).join(', ')} or ${lacks[lacks.length - 1]}` : lacks[0]}`
  ].filter(Boolean);
  if (clauses.length < 3) return clauses.join(', and ');
  return `${clauses.slice(0, -1).join('; ')}; and ${clauses[clauses.length - 1]}`;
}

// ── The story-terms check ────────────────────────────────────────────────────

/** A clock time's half of the day: "AM", "pm", "a.m."; a sentence's full stop after "AM" is not part of it. */
const HALF_OF_DAY = '(?:[ap]\\.m\\.|[ap]m(?![a-z]))';

/** A clock time: "9:58", "10:18 AM", "8 PM", "9 o'clock". */
const CLOCK_TIME = new RegExp(`\\b\\d{1,2}:\\d{2}(?:\\s?${HALF_OF_DAY})?|\\b\\d{1,2}\\s?${HALF_OF_DAY}|\\b\\d{1,2}\\s?o['’]clock\\b`, 'gi');

/** A money figure: "$450,000", "$1.2 million", "$75K", "450,000 dollars". */
const MONEY = /(?:US)?[$£€]\s?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?(?:k|m|bn|thousand|million|billion)\b)?|\b\d+(?:,\d{3})*(?:\.\d+)?\s?(?:dollars|bucks)\b/gi;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The record's document ids as one pattern, each a whole word in any case, the longest first. */
function documentIdPattern(ids) {
  const list = [...ids].map(textOf).filter((id) => id.length >= MIN_ID_LENGTH).sort((a, b) => b.length - a.length);
  if (list.length === 0) return null;
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map(escapeRegExp).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

/** What each kind of hit is called in a line. */
const STORY_TERM_WORDS = {
  'document-id': 'the document id',
  quotation: 'the quotation',
  'clock-time': 'the clock time',
  money: 'the money figure'
};

/**
 * The story-terms check over one of the writer's lines (spec 4.1 and 6.1; R8): each document id
 * the record holds, each quotation in quotation marks, each clock time and each money figure the
 * line holds, `{kind, excerpt}`, each excerpt once, in the order the line holds them. A name, a
 * possessive and a number in words are story terms: the check reads quotation marks by
 * QUOTED_SPANS, so an apostrophe in a word is no quotation, and a figure only with its currency
 * and a time only with its colon or its half of the day. Which lines it reads, and which are
 * exempt (the director's own, "from your notes", the headline, the questions), is its caller's.
 *
 * @param {*} text - one line
 * @param {Object} context - evidenceContextOf's (its `documentIds`)
 * @returns {Array<{kind: 'document-id'|'quotation'|'clock-time'|'money', excerpt: string}>}
 */
function storyTermsProblems(text, context) {
  const line = typeof text === 'string' ? text : '';
  if (!line.trim()) return [];
  const ctx = contextOf(context);
  const hits = [];
  const scan = (pattern, kind) => {
    if (!pattern) return;
    for (const match of line.matchAll(pattern)) hits.push({ kind, excerpt: match[0].trim(), at: match.index });
  };
  scan(documentIdPattern(ctx.documentIds), 'document-id');
  scan(QUOTED_SPANS, 'quotation');
  scan(CLOCK_TIME, 'clock-time');
  scan(MONEY, 'money');
  const seen = new Set();
  return hits
    .sort((a, b) => a.at - b.at)
    .filter((hit) => {
      const key = `${hit.kind}\u0000${hit.excerpt}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map(({ kind, excerpt }) => ({ kind, excerpt }));
}

/**
 * What a line holds that story terms leave to the evidence, as a phrase: `holds the clock time
 * "9:58" and the quotation "Not here"`. A quotation is shown with its own marks.
 *
 * @param {Array<{kind: string, excerpt: string}>} problems - storyTermsProblems'
 * @returns {string}
 */
function describeStoryTerms(problems) {
  const items = asArray(problems).map(({ kind, excerpt }) => `${STORY_TERM_WORDS[kind] || kind} ${kind === 'quotation' ? excerpt : `"${excerpt}"`}`);
  return `holds ${listOf(items)}`;
}

/** What each kind of hit is called when a line is said to the director. A document's id is never shown. */
const STORY_TERM_SAID = {
  quotation: (excerpt) => `the quotation ${excerpt}`,
  'clock-time': (excerpt) => `the time ${excerpt}`,
  money: (excerpt) => `the figure ${excerpt}`
};

/**
 * What a line holds that story terms leave to the evidence, said to the director, in a phrase
 * that follows the line: `gives the time 9:58, the figure $450,000 and a document's id`. A
 * quotation, a time and a figure are shown as the line holds them; a document's id is said,
 * never shown, once however many the line holds. The weave's checks and the map's give it in a
 * failure's `line` (lib/weave.js weaveFindings).
 *
 * @param {Array<{kind: string, excerpt: string}>} problems - storyTermsProblems'
 * @returns {string}
 */
function storyTermsSaid(problems) {
  const list = asArray(problems).filter(isObject);
  const ids = list.filter(({ kind }) => kind === 'document-id').length;
  const items = list
    .filter(({ kind }) => kind !== 'document-id')
    .map(({ kind, excerpt }) => (STORY_TERM_SAID[kind] ? STORY_TERM_SAID[kind](excerpt) : `"${excerpt}"`));
  if (ids > 0) items.push(ids > 1 ? "documents' ids" : "a document's id");
  return `gives ${listOf(items)}`;
}

/** The fix of a line that fails the story-terms check: the rule it keeps, and where what it holds belongs. */
const STORY_TERMS_FIX = 'Say it in story terms, as C16 (<craft-story>) sets out: the evidence under the lines carries the record\'s quotations, figures, times and document ids.';

module.exports = {
  EVIDENCE_SOURCES,
  SOURCES_GLOSS,
  EVIDENCE_STANCES,
  EVIDENCE_PIECE_SCHEMA,
  evidenceProblems,
  describeEvidenceProblems,
  evidenceProblemsSaid,
  storyTermsProblems,
  describeStoryTerms,
  storyTermsSaid,
  STORY_TERMS_FIX,
  documentTextsOf,
  documentIdsOf,
  evidenceContextOf,
  // Fix round 4: the one rule for "this document is in the record"
  documentResolverOf,
  recordDocumentOf
};
