/**
 * lib/hand-edit-diff.js — PURE: the director's edits at a stop (spec 2026-09-19 §4.2;
 * F1 and FA, the director's edits are final, spec 2026-10-02 section 7).
 *
 * Depends only on lib/grounding.js (pure). Never throws: any non-object input yields an
 * empty diff, no edits or no report.
 *
 * THE DIFF (diffOutline, diffBundle) records what changed between two versions, by
 * scope, for the trace (server.js traceForStop) and as the first step of the edits.
 * Paths are dotted from the root, with collection selectors in brackets: `lede.hook`,
 * `headline.main`, `sections[#intro].heading`, `sections[#intro].content[2]`,
 * `evidenceCards[#alr001]`, `pullQuotes[1]`. `#` selects by id (sections.id,
 * evidenceCards.tokenId); a bare number is an index; `[-]` marks a removed item.
 *
 * THE DIRECTOR'S EDITS. Each change a send-back makes is one edit per field the director
 * changed (FA, requirement 2): `{id, scope, path, at, before, after}`.
 * - `at` is the steps from the root to the field: `{key}` for an object's property, and
 *   `{index, match}` for an element of a collection, where `match` is what finds the
 *   element in any version (a section's id, a card's tokenId, an arc's name, a block's
 *   type with its text, filename or tokenId) and `index` where it sat in the director's
 *   version. `path` is the same place as a string, for reading.
 * - A field edit's `before` and `after` are the field's values, the writer's and the
 *   director's. An element the director added whole, or a block retyped, is one edit
 *   whose `after` is the element. Block-level matching only finds where an edit is.
 * - A null `after` is a cut: `before` is the text the director removed, and `pieces` each
 *   of its sentences of three words or more that the director's version no longer held.
 * - A rewritten text field also records `removed` (FA, requirement 3): each sentence of
 *   its old text the director's version no longer held, as written.
 * - A block that left one section and arrived unchanged in another is one edit, a move
 *   (FA, requirement 4): `after` is the block and `from` the section it left. A move is
 *   the block's place only (fix round 1, finding 2): the director changed none of its
 *   fields, so its text is still the writer's. It owns no text a finding is located in
 *   (locateQuotedText), the fact check finds no field of it the director wrote
 *   (editLocator), and its line names the block and its place (formatEditLines).
 * - Given the roster's names, a cut or a removal records `names` (FA, requirement 9):
 *   the names its text held that the director's version no longer named.
 * Ids (E1, E2, ...) are stable within a stop. The edits stand across every send-back
 * (standingAfterSendBack); the approve branch, a rollback and a fresh start clear them.
 *
 * WHAT A VERSION CARRIES (editCarried). A field edit is carried while the element it
 * belongs to, found by its `match`, holds the director's value; a section's block is
 * looked for in every section, since a rework may move it. A move is carried while its
 * block sits in the section the director put it in. A cut is carried while none of its
 * pieces is back. Text is read from the fields the page prints (printedParts; known item
 * 6), and a piece under six words is back only as a whole sentence (known item 4).
 *
 * Equality is trimmed canonical JSON: keys sorted, every string trimmed. Matching an
 * object value is a subset match: every key the director's value carries is present
 * with an equal value, so a field the rework added is no change.
 */
'use strict';

const { isVerbatimIn, normalizeForGrounding, quotedPassages } = require('./grounding');

// Never walked, by construction: the bundle diff visits only the scope lists below,
// which do not name metadata, voice_self_check or _revisionHistory.
const BUNDLE_OBJECT_SCOPES = ['headline', 'byline', 'financialTracker'];
const BUNDLE_SCALAR_SCOPES = ['heroImage'];
const BUNDLE_INDEX_COLLECTIONS = ['pullQuotes', 'photos'];
// Phase 3 (3.7): the writer's questions for the director are not part of the outline
// the director edits or a rework changes, so neither diff shows them as a scope. The
// bundle diff never visits them (its scope lists do not name them); the outline diff,
// which walks every top-level key, skips them. The console's RevisionDiff skips the
// same keys (console/checkpoint-view-logic.js REVISION_DIFF_IGNORED_KEYS; fix 3.7b, a
// test holds the two lists equal).
const OUTLINE_IGNORED_KEYS = ['writerQuestions'];

/**
 * The one prefix of a finding about one of the director's edits, in advisoryWarnings:
 * "Director's edit E3: T1: ...". The judges' prompts ask for it, the verdict guard and
 * the fact check write it, and the console groups by it (console/checkpoint-view-logic.js
 * holds a copy, which a test holds equal).
 */
const DIRECTOR_EDIT_PREFIX = "Director's edit ";

/**
 * How to read the edit lines (formatEditLines), for the judges' section and the
 * reworks' <HAND_EDITS> block alike: an edit is the field its place names (FA,
 * requirement 2), a moved block's text is still the writer's (requirement 4; fix round 1,
 * finding 2), and a removed: line is a sentence a rewrite took out (requirement 3).
 */
const EDIT_LINES_GUIDE = "An edit covers only the place its line names: a place that ends on a field, such as a card's headline or a photo's caption, is that field alone, and the rest of the block is the writer's. A line marked moved names a block the director moved to that place without changing it: the place is the director's, and the block's text is still the writer's. A removed: line under an edit is a sentence the director took out of that text when rewriting it.";

/** The pass a report entry names when the rework of the director's send-back changed an edit. */
const SEND_BACK_PASS = 'send-back';

/**
 * The field a send-back's rework returns its changed edits in, `[{id, reason}]`. It
 * exists only in the rework call's schema (ai-nodes.js), and the node takes it out
 * before it stores the output.
 */
const CHANGED_EDITS_KEY = 'changedDirectorEdits';

/**
 * The fewest words a quoted passage, or a piece of cut text, needs to say whose text it
 * is: a name or a short phrase ("Alex", "the vote") is in everyone's text.
 */
const MIN_LOCATING_WORDS = 3;

/**
 * A piece of cut or removed text shorter than this counts as back only as a whole
 * sentence of the version (known item 4): a sentence of three to five words recurs
 * inside the writer's prose.
 */
const MIN_INLINE_PIECE_WORDS = 6;

/** Keys whose text is no part of what the director edits or a reader reads. */
const UNPRINTED_KEYS = new Set(['metadata', '_revisionHistory', 'voice_self_check', '_voiceSelfCheck', ...OUTLINE_IGNORED_KEYS, CHANGED_EDITS_KEY]);

/**
 * The printed fields of each content block, by type (templates/journalist/partials/
 * content-blocks). A block type the template does not know prints as a paragraph.
 */
const PRINTED_BLOCK_FIELDS = {
  paragraph: ['type', 'text'],
  quote: ['type', 'text', 'attribution'],
  'evidence-reference': ['type', 'tokenId', 'caption'],
  list: ['type', 'ordered', 'items'],
  photo: ['type', 'filename', 'caption'],
  'evidence-card': ['type', 'tokenId', 'headline', 'content', 'owner']
};

/**
 * The fields the journalist page prints, by part: the one list the article judge reads
 * (evaluator-nodes.js printedBundle) and this module reads text from (known item 6). The
 * page never prints `voice_self_check`, the pull quotes, the top-level `photos`, a sidebar
 * entry's `content` or `owner`, the characters on a photo or the hero, or the byline's
 * location and date.
 */
const PRINTED_FIELDS = Object.freeze({
  headline: ['main', 'kicker', 'deck'],
  byline: ['author', 'title', 'guestReporter'],
  heroImage: ['filename', 'caption'],
  section: ['id', 'heading'],
  sidebarCard: ['tokenId', 'headline', 'summary', 'significance'],
  trackerEntry: ['description', 'amount'],
  tracker: ['totalExposed'],
  blocks: PRINTED_BLOCK_FIELDS
});

/** The field that names each element of a collection, by the collection's key. */
const ELEMENT_KEYS = {
  sections: 'id',
  evidenceCards: 'tokenId',
  arcs: 'name',
  arcConnections: 'arcName',
  arcResolutions: 'arcName',
  shellAccounts: 'name',
  entries: 'description',
  assessments: 'name',
  evidenceGroups: 'theme'
};

/** The field a block's text is in, which a label leaves unsaid ("paragraph", not "paragraph, text"). */
const MAIN_FIELD = { paragraph: 'text', quote: 'text', list: 'items' };

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return typeof v === 'string' ? v.trim() : v;
}

function canon(v) { return v === undefined ? 'undefined' : JSON.stringify(sortKeys(v)); }

function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }

function same(a, b) {
  if (typeof a === 'string' && typeof b === 'string') return a.trim() === b.trim();
  return canon(a) === canon(b);
}

/**
 * Does `actual` still carry the director's `after` value? Objects match as a SUBSET
 * (see the module header); everything else is plain trimmed-canonical equality.
 */
function matchesAfter(actual, after) {
  if (!isObj(after)) return same(actual, after);
  if (!isObj(actual)) return false;
  return Object.keys(after).every((k) => same(actual[k], after[k]));
}

function unionKeys(a, b) { return Array.from(new Set([...Object.keys(a || {}), ...Object.keys(b || {})])); }

function pick(obj, keys) {
  const out = {};
  keys.forEach((k) => { if (obj[k] !== undefined) out[k] = obj[k]; });
  return out;
}

function diffFields(before, after, prefix) {
  return unionKeys(before, after)
    .filter((k) => !same(before[k], after[k]))
    .map((k) => ({ path: `${prefix}.${k}`, before: before[k], after: after[k] }));
}

// ─── outline ──────────────────────────────────────────────────────────────────

function diffOutline(before, after) {
  if (!isObj(before) || !isObj(after)) return { kind: 'outline', sections: [] };
  const sections = [];
  for (const key of unionKeys(before, after)) {
    if (OUTLINE_IGNORED_KEYS.includes(key)) continue;
    const b = before[key];
    const a = after[key];
    if (same(a, b)) continue;
    const changes = (isObj(a) && isObj(b)) ? diffFields(b, a, key) : [{ path: key, before: b, after: a }];
    if (changes.length > 0) sections.push({ key, changes });
  }
  return { kind: 'outline', sections };
}

// ─── bundle ───────────────────────────────────────────────────────────────────

function blockText(b) {
  if (!isObj(b)) return '';
  if (typeof b.text === 'string') return b.text;
  if (Array.isArray(b.items)) return b.items.map(String).join(' ');
  if (typeof b.caption === 'string') return b.caption;
  if (typeof b.headline === 'string') return b.headline;
  return '';
}

function blockKey(b) {
  const type = isObj(b) && typeof b.type === 'string' ? b.type : '';
  return type + '|' + blockText(b).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 40);
}

/** Pair elements by `keyOf` (a null key never pairs), then by index for what is left. */
function pairBy(beforeArr, afterArr, keyOf) {
  const b = Array.isArray(beforeArr) ? beforeArr : [];
  const a = Array.isArray(afterArr) ? afterArr : [];
  const usedB = new Set();
  const usedA = new Set();
  const pairs = [];
  a.forEach((el, ai) => {
    const key = keyOf(el);
    if (key === null) return;
    const bi = b.findIndex((cand, i) => !usedB.has(i) && keyOf(cand) === key);
    if (bi !== -1) { usedB.add(bi); usedA.add(ai); pairs.push({ bi, ai }); }
  });
  a.forEach((el, ai) => {
    if (usedA.has(ai)) return;
    if (ai < b.length && !usedB.has(ai)) { usedB.add(ai); usedA.add(ai); pairs.push({ bi: ai, ai }); }
  });
  const removed = b.map((_, i) => i).filter((i) => !usedB.has(i));
  const added = a.map((_, i) => i).filter((i) => !usedA.has(i));
  return { pairs, removed, added };
}

/** Pair blocks by type + first 40 normalised characters, then by index for what is left. */
function matchBlocks(beforeArr, afterArr) {
  return pairBy(beforeArr, afterArr, blockKey);
}

function diffSection(id, before, after) {
  const prefix = `sections[#${id}]`;
  const changes = [];
  ['type', 'heading'].forEach((f) => {
    if (!same(before[f], after[f])) changes.push({ path: `${prefix}.${f}`, before: before[f], after: after[f] });
  });
  const bc = Array.isArray(before.content) ? before.content : [];
  const ac = Array.isArray(after.content) ? after.content : [];
  const { pairs, removed, added } = matchBlocks(bc, ac);
  pairs.forEach(({ bi, ai }) => {
    if (!same(bc[bi], ac[ai])) changes.push({ path: `${prefix}.content[${ai}]`, before: bc[bi], after: ac[ai] });
  });
  removed.forEach((bi) => changes.push({ path: `${prefix}.content[-]`, before: bc[bi], after: null }));
  added.forEach((ai) => changes.push({ path: `${prefix}.content[${ai}]`, before: null, after: ac[ai] }));
  return changes;
}

function idOf(item, idField, i) {
  return (isObj(item) && item[idField] != null) ? String(item[idField]) : `index-${i}`;
}

/**
 * A section's key as the director's edits address it: its id, else its index. The one
 * rule, which the fact check reads too (known item 7).
 *
 * @param {*} section
 * @param {number} index
 * @returns {string}
 */
function sectionKey(section, index) {
  return idOf(section, 'id', index);
}

function diffById(name, idField, before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const bMap = new Map(b.map((x, i) => [idOf(x, idField, i), x]));
  const aMap = new Map(a.map((x, i) => [idOf(x, idField, i), x]));
  const changes = [];
  for (const id of new Set([...bMap.keys(), ...aMap.keys()])) {
    const bv = bMap.get(id);
    const av = aMap.get(id);
    if (!same(bv, av)) changes.push({ path: `${name}[#${id}]`, before: bv === undefined ? null : bv, after: av === undefined ? null : av });
  }
  return changes;
}

function diffByIndex(name, before, after) {
  const b = Array.isArray(before) ? before : [];
  const a = Array.isArray(after) ? after : [];
  const changes = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (!same(b[i], a[i])) changes.push({ path: `${name}[${i}]`, before: b[i] === undefined ? null : b[i], after: a[i] === undefined ? null : a[i] });
  }
  return changes;
}

function diffBundle(before, after) {
  if (!isObj(before) || !isObj(after)) return { kind: 'bundle', scopes: [] };
  const scopes = [];
  const push = (key, changes) => { if (changes.length > 0) scopes.push({ key, changes }); };

  BUNDLE_OBJECT_SCOPES.forEach((k) => {
    if (same(before[k], after[k])) return;
    push(k, (isObj(before[k]) && isObj(after[k])) ? diffFields(before[k], after[k], k) : [{ path: k, before: before[k], after: after[k] }]);
  });
  BUNDLE_SCALAR_SCOPES.forEach((k) => {
    if (!same(before[k], after[k])) push(k, [{ path: k, before: before[k], after: after[k] }]);
  });

  const bSecs = Array.isArray(before.sections) ? before.sections : [];
  const aSecs = Array.isArray(after.sections) ? after.sections : [];
  const bById = new Map(bSecs.map((s, i) => [idOf(s, 'id', i), s]));
  const aById = new Map(aSecs.map((s, i) => [idOf(s, 'id', i), s]));
  for (const id of new Set([...bById.keys(), ...aById.keys()])) {
    const bs = bById.get(id);
    const as = aById.get(id);
    if (same(bs, as)) continue;
    if (!isObj(bs) || !isObj(as)) {
      push(`section:${id}`, [{ path: `sections[#${id}]`, before: bs === undefined ? null : bs, after: as === undefined ? null : as }]);
    } else {
      push(`section:${id}`, diffSection(id, bs, as));
    }
  }

  push('evidenceCards', diffById('evidenceCards', 'tokenId', before.evidenceCards, after.evidenceCards));
  BUNDLE_INDEX_COLLECTIONS.forEach((k) => push(k, diffByIndex(k, before[k], after[k])));
  return { kind: 'bundle', scopes };
}

// ─── shared ───────────────────────────────────────────────────────────────────

function groups(diff) {
  if (!isObj(diff)) return [];
  if (diff.kind === 'outline') return Array.isArray(diff.sections) ? diff.sections : [];
  if (diff.kind === 'bundle') return Array.isArray(diff.scopes) ? diff.scopes : [];
  return [];
}

function isEmpty(diff) {
  return groups(diff).every((g) => !g || !Array.isArray(g.changes) || g.changes.length === 0);
}

function scopeKeys(diff) {
  return groups(diff).filter((g) => g && Array.isArray(g.changes) && g.changes.length > 0).map((g) => g.key);
}

/** Resolve a change path against an object; undefined when any segment is missing. */
function readAtPath(obj, pathStr) {
  if (!isObj(obj) || typeof pathStr !== 'string' || !pathStr) return undefined;
  let cur = obj;
  for (const seg of pathStr.split('.')) {
    const m = /^([^\[]+)(?:\[(.+)\])?$/.exec(seg);
    if (!m) return undefined;
    cur = isObj(cur) ? cur[m[1]] : undefined;
    if (m[2] !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      const sel = m[2];
      if (sel === '-') return undefined;
      if (sel.startsWith('#')) {
        const id = sel.slice(1);
        const idField = m[1] === 'evidenceCards' ? 'tokenId' : 'id';
        cur = cur.find((x, i) => idOf(x, idField, i) === id);
      } else {
        cur = cur[Number(sel)];
      }
    }
    if (cur === undefined) return undefined;
  }
  return cur;
}

// ─── text a version prints (known item 6) ─────────────────────────────────────

/** Every string inside a value, in order, leaving out the keys no reader reads. */
function stringLeaves(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringLeaves(v, out));
  else if (isObj(value)) Object.keys(value).forEach((k) => { if (!UNPRINTED_KEYS.has(k)) stringLeaves(value[k], out); });
  return out;
}

/** The strings of `obj`'s `fields`, each a part; `cardContent` marks an evidence card's content. */
function fieldParts(obj, fields, cardContent = () => false) {
  if (!isObj(obj)) return [];
  return fields.flatMap((field) => stringLeaves(obj[field]).map((text) => ({ text, cardContent: cardContent(field) })));
}

/** A content block's printed text, by its type's printed fields. */
function blockParts(block) {
  if (!isObj(block)) return stringLeaves(block).map((text) => ({ text, cardContent: false }));
  const fields = (PRINTED_BLOCK_FIELDS[block.type] || ['type', 'text']).filter((f) => f !== 'type');
  return fieldParts(block, fields, (field) => block.type === 'evidence-card' && field === 'content');
}

function sectionParts(section) {
  if (!isObj(section)) return [];
  return [
    ...fieldParts(section, PRINTED_FIELDS.section),
    ...(Array.isArray(section.content) ? section.content : []).flatMap(blockParts)
  ];
}

/**
 * The text a version prints, part by part: for a content bundle, the fields the page
 * prints (PRINTED_FIELDS); for an outline, every string the writer reads, leaving out
 * the writer's questions. Each part says whether it is an evidence card's content, which
 * prints its document word for word (the citation rule, known item 5).
 *
 * @param {*} obj - the outline or bundle
 * @returns {Array<{text: string, cardContent: boolean}>}
 */
function printedParts(obj) {
  if (!isObj(obj)) return [];
  if (!Array.isArray(obj.sections)) return stringLeaves(obj).map((text) => ({ text, cardContent: false }));
  const tracker = isObj(obj.financialTracker) ? obj.financialTracker : null;
  return [
    ...fieldParts(obj.headline, PRINTED_FIELDS.headline),
    ...fieldParts(obj.byline, PRINTED_FIELDS.byline),
    ...(isObj(obj.heroImage) ? fieldParts(obj.heroImage, PRINTED_FIELDS.heroImage) : stringLeaves(obj.heroImage).map((text) => ({ text, cardContent: false }))),
    ...obj.sections.flatMap(sectionParts),
    ...(Array.isArray(obj.evidenceCards) ? obj.evidenceCards : []).flatMap((card) => fieldParts(card, PRINTED_FIELDS.sidebarCard)),
    ...(tracker && Array.isArray(tracker.entries) ? tracker.entries : []).flatMap((entry) => fieldParts(entry, PRINTED_FIELDS.trackerEntry)),
    ...fieldParts(tracker, PRINTED_FIELDS.tracker)
  ];
}

function printedLeaves(obj) { return printedParts(obj).map((part) => part.text); }

/** Text as grounding.js compares it, with case folded too. */
function fold(text) { return normalizeForGrounding(text).toLowerCase(); }

function wordsIn(text) { return (String(text).match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || []).length; }

/** Does `leaf` hold `piece` word for word (grounding.js isVerbatimIn), in any case? */
function holds(leaf, piece) { return isVerbatimIn(String(piece).toLowerCase(), String(leaf).toLowerCase()); }

/** A letter or a digit: what a word is made of. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Does folded `text` hold folded `piece` as whole words: starting and ending on a word
 * boundary, so "the vote" is not in "the voters"?
 */
function holdsWhole(text, piece) {
  if (!piece) return false;
  const startsWord = WORD_CHAR.test(piece[0]);
  const endsWord = WORD_CHAR.test(piece[piece.length - 1]);
  for (let at = text.indexOf(piece); at !== -1; at = text.indexOf(piece, at + 1)) {
    const end = at + piece.length;
    if ((!startsWord || at === 0 || !WORD_CHAR.test(text[at - 1]))
      && (!endsWord || end >= text.length || !WORD_CHAR.test(text[end]))) return true;
  }
  return false;
}

/** Where a sentence ends, in text normalized as grounding.js does: . ! ? or an ellipsis, any closing quotation marks or brackets, then a space. */
const SENTENCE_BREAK = /(?<=[.!?…]["')\]]*)\s+/;

/** Where a sentence ends in text as written, curly closing quotation marks included. */
const WRITTEN_SENTENCE_BREAK = /(?<=[.!?…]["'”’)\]]*)\s+/;

/**
 * The sentences of a text, normalized as grounding.js does (case kept), each without the
 * quotation marks and brackets around it or its closing punctuation, and each of
 * MIN_LOCATING_WORDS words or more.
 */
function sentencesOf(text) {
  return normalizeForGrounding(text)
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.replace(/^["'(\[]+/, '').replace(/[.!?,;:"')\]…]+$/, '').trim())
    .filter((sentence) => wordsIn(sentence) >= MIN_LOCATING_WORDS);
}

/** The sentences of a text as written, each of MIN_LOCATING_WORDS words or more. */
function writtenSentences(text) {
  return String(text).trim().split(WRITTEN_SENTENCE_BREAK).map((s) => s.trim()).filter((s) => sentencesOf(s).length > 0);
}

/** A version's printed text, once, folded, with each part's folded sentences. */
function versionText(obj) {
  return printedParts(obj).map((part) => ({ text: part.text, folded: fold(part.text), sentences: sentencesOf(part.text).map(fold) }));
}

/**
 * The part of a version that holds a piece of cut or removed text, or undefined: a piece
 * of six words or more anywhere, as whole words; a shorter one only as a whole sentence
 * (known item 4).
 */
function partHolding(text, piece) {
  const folded = fold(piece);
  if (!folded) return undefined;
  if (wordsIn(piece) >= MIN_INLINE_PIECE_WORDS) return text.find((part) => holdsWhole(part.folded, folded));
  return text.find((part) => part.sentences.includes(folded));
}

// ─── the steps to an edit ─────────────────────────────────────────────────────

/** What finds a section's block in any version: its type and the field that names it. */
function blockIdentity(block) {
  if (!isObj(block)) return null;
  switch (block.type) {
    case 'evidence-card':
    case 'evidence-reference':
      return pick(block, ['type', 'tokenId']);
    case 'photo':
      return pick(block, ['type', 'filename']);
    case 'list':
      return pick(block, ['type', 'items']);
    default:
      return typeof block.text === 'string' ? pick(block, ['type', 'text']) : { ...block };
  }
}

/** What finds an element of a collection in any version, or null (its index). */
function identityOf(collection, element) {
  if (!isObj(element)) return null;
  if (collection === 'content') return blockIdentity(element);
  const key = ELEMENT_KEYS[collection];
  if (key) return (element[key] != null && String(element[key]).trim()) ? { [key]: element[key] } : null;
  if (collection === 'pullQuotes') return typeof element.text === 'string' ? { text: element.text } : null;
  if (collection === 'photos') return typeof element.filename === 'string' ? { filename: element.filename } : null;
  return null;
}

/** The scalar fields two versions of an element share, which find it when nothing names it. */
function commonFields(b, a) {
  if (!isObj(b) || !isObj(a)) return null;
  const common = {};
  Object.keys(b).forEach((k) => {
    if (b[k] !== null && typeof b[k] !== 'object' && same(b[k], a[k])) common[k] = b[k];
  });
  return Object.keys(common).length > 0 ? common : null;
}

/** Pair two versions of a collection: blocks as the diff pairs them, others by what names them. */
function pairElements(collection, beforeArr, afterArr) {
  if (collection === 'content') return matchBlocks(beforeArr, afterArr);
  return pairBy(beforeArr, afterArr, (el) => {
    const identity = identityOf(collection, el);
    return identity ? canon(identity) : null;
  });
}

function isElementStep(step) { return isObj(step) && !('key' in step); }

/** The collection an element step is in: the key before it. */
function collectionAt(steps, i) {
  return i > 0 && 'key' in steps[i - 1] ? steps[i - 1].key : null;
}

/** A path this module writes, split at its dots outside brackets. */
function splitPath(p) {
  const out = [];
  let cur = '';
  let depth = 0;
  for (const ch of String(p)) {
    if (ch === '[') depth += 1;
    if (ch === ']') depth -= 1;
    if (ch === '.' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * The steps of a change a diff recorded, from its path: `{key}` for a property, and
 * `{index, match}` for an element. The last element finds itself by its own identity.
 * Null for a path this module never writes.
 */
function stepsOfChange(change) {
  if (!isObj(change) || typeof change.path !== 'string' || !change.path) return null;
  const steps = [];
  for (const seg of splitPath(change.path)) {
    const m = /^([^\[\]]+)((?:\[[^\]]*\])*)$/.exec(seg);
    if (!m) return null;
    steps.push({ key: m[1] });
    for (const sel of (m[2].match(/\[[^\]]*\]/g) || [])) {
      const inner = sel.slice(1, -1);
      const collection = steps[steps.length - 1].key;
      if (inner.startsWith('#')) {
        const id = inner.slice(1);
        const byIndex = /^index-(\d+)$/.exec(id);
        steps.push(byIndex ? { index: Number(byIndex[1]), match: null } : { index: null, match: { [ELEMENT_KEYS[collection] || 'id']: id } });
      } else if (inner === '-') {
        steps.push({ index: null, match: null });
      } else if (/^\d+$/.test(inner)) {
        steps.push({ index: Number(inner), match: null });
      } else {
        return null;
      }
    }
  }
  const last = steps[steps.length - 1];
  if (isElementStep(last) && last.match === null) {
    const value = change.after !== null && change.after !== undefined ? change.after : change.before;
    last.match = identityOf(collectionAt(steps, steps.length - 1), value);
  }
  return steps;
}

/** An edit's steps: its own, or, for one stored before FA, the steps of its path. */
function stepsOf(edit) {
  if (Array.isArray(edit.at)) return edit.at;
  return stepsOfChange(edit) || [];
}

/** A path for reading, from steps: `sections[#closing].content[0].text`, `theStory.arcs[1].photoPlacement`. */
function pathOf(steps) {
  let out = '';
  steps.forEach((step, i) => {
    if ('key' in step) { out += (i === 0 ? '' : '.') + step.key; return; }
    const collection = collectionAt(steps, i);
    const byId = collection === 'sections' || (collection === 'evidenceCards' && i === 1);
    if (byId) {
      const field = ELEMENT_KEYS[collection];
      out += `[#${step.match && step.match[field] != null ? step.match[field] : `index-${step.index}`}]`;
    } else {
      out += `[${Number.isInteger(step.index) ? step.index : '-'}]`;
    }
  });
  return out;
}

/** The last key of a list of steps. */
function lastKey(steps) {
  for (let i = steps.length - 1; i >= 0; i--) if ('key' in steps[i]) return steps[i].key;
  return null;
}

/**
 * One change per field that differs between two versions of a value, at the steps from
 * the root: objects field by field, collections of objects element by element (paired
 * by what names each element, then by index), and everything else, an array of strings
 * included, as one value. A block retyped is one change of the whole block.
 */
function valueEdits(b, a, at) {
  if (same(b, a)) return [];
  const retyped = isObj(b) && isObj(a) && typeof b.type === 'string' && typeof a.type === 'string' && b.type !== a.type;
  if (isObj(b) && isObj(a) && !retyped) {
    return unionKeys(b, a).flatMap((k) => valueEdits(b[k], a[k], [...at, { key: k }]));
  }
  if (Array.isArray(b) && Array.isArray(a) && b.length + a.length > 0 && [...b, ...a].every(isObj)) {
    const collection = lastKey(at);
    const { pairs, removed, added } = pairElements(collection, b, a);
    const out = [];
    [...pairs].sort((x, y) => x.ai - y.ai).forEach(({ bi, ai }) => {
      const match = identityOf(collection, a[ai]) || commonFields(b[bi], a[ai]);
      out.push(...valueEdits(b[bi], a[ai], [...at, { index: ai, match }]));
    });
    removed.forEach((bi) => out.push({ at: [...at, { index: null, match: identityOf(collection, b[bi]) }], before: b[bi], after: null }));
    added.forEach((ai) => out.push({ at: [...at, { index: ai, match: identityOf(collection, a[ai]) }], before: null, after: a[ai] }));
    return out;
  }
  return [{ at, before: b === undefined ? null : b, after: a === undefined ? null : a }];
}

/** A block's path, `sections[#id].content[i]` or `sections[#id].content[-]`. */
const SECTION_BLOCK_PATH = /^sections\[#([^\]]+)\]\.content\[(?:\d+|-)\]$/;

/**
 * A diff's changes as the director's edits, before ids: one per field changed, a move
 * for a block that left one section and arrived unchanged in another, a cut for each
 * element or field removed.
 */
function rawEditsOf(diff) {
  const changes = [];
  groups(diff).forEach((g) => (Array.isArray(g.changes) ? g.changes : []).forEach((c) => {
    if (!isObj(c) || typeof c.path !== 'string') return;
    changes.push({ scope: g.key, path: c.path, before: c.before === undefined ? null : c.before, after: c.after === undefined ? null : c.after });
  }));

  const sectionOf = (change) => {
    const m = SECTION_BLOCK_PATH.exec(change.path);
    return m ? m[1] : null;
  };
  const cuts = changes.filter((c) => sectionOf(c) !== null && c.after === null && isObj(c.before));
  const moves = new Map();
  const movedOut = new Set();
  changes.filter((c) => sectionOf(c) !== null && c.before === null && isObj(c.after)).forEach((add) => {
    const cut = cuts.find((c) => !movedOut.has(c) && sectionOf(c) !== sectionOf(add) && same(c.before, add.after));
    if (cut) { movedOut.add(cut); moves.set(add, sectionOf(cut)); }
  });

  const out = [];
  changes.forEach((c) => {
    if (movedOut.has(c)) return;
    const at = stepsOfChange(c);
    if (!at) return;
    if (moves.has(c)) {
      out.push({ scope: c.scope, at, before: null, after: c.after, from: moves.get(c) });
      return;
    }
    valueEdits(c.before, c.after, at).forEach((edit) => out.push({ scope: c.scope, ...edit }));
  });
  return out;
}

// ─── the director's edits ─────────────────────────────────────────────────────

function isEdit(e) { return isObj(e) && typeof e.id === 'string' && typeof e.path === 'string'; }

/** A cut: the director removed the text, so the edit has no `after`. */
function isCut(edit) { return edit.after === null || edit.after === undefined; }

/**
 * A move: a block the director moved, unchanged, from section `from` (FA, requirement 4).
 * Its place is the director's and its text the writer's (fix round 1, finding 2).
 */
function isMove(edit) { return Boolean(edit.from) && !isCut(edit); }

function editNumber(id) {
  const m = /^E(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : 0;
}

/**
 * The text of an edit's value as a reader reads it: a field's strings, or an element's
 * printed fields (a block's, a section's, a sidebar card's).
 */
function valueTexts(edit, value) {
  const steps = stepsOf(edit);
  const lastIndex = steps.length - 1;
  if (!isElementStep(steps[lastIndex]) || !isObj(value)) return stringLeaves(value);
  const collection = collectionAt(steps, lastIndex);
  if (collection === 'content') return blockParts(value).map((part) => part.text);
  if (collection === 'sections') return sectionParts(value).map((part) => part.text);
  if (collection === 'evidenceCards' && lastIndex === 1) return fieldParts(value, PRINTED_FIELDS.sidebarCard).map((part) => part.text);
  return stringLeaves(value);
}

/** Every sentence of the text a cut removed. */
function cutSentences(edit) { return valueTexts(edit, edit.before).flatMap(sentencesOf); }

/**
 * The sentences whose return brings a cut back: the pieces the cut recorded when the
 * director made it, or, for a cut stored without them, every sentence of its text.
 */
function cutPieces(edit) {
  return Array.isArray(edit.pieces) ? edit.pieces.filter((piece) => typeof piece === 'string') : cutSentences(edit);
}

/** The first part of `obj` that holds one of a cut's pieces, as its text, or null. */
function cutReturnedIn(obj, edit) {
  const pieces = cutPieces(edit).filter((piece) => fold(piece));
  if (pieces.length === 0) return null;
  const text = versionText(obj);
  for (const piece of pieces) {
    const part = partHolding(text, piece);
    if (part) return part.text.trim();
  }
  return null;
}

/** Is every sentence of a removed sentence held by the version's text? */
function removedHeld(text, sentence) { return sentencesOf(sentence).every((core) => partHolding(text, core)); }

/** The removed sentences that came back in `obj`, and where the first came back, or null. */
function removedReturnedIn(obj, edit) {
  const removed = Array.isArray(edit.removed) ? edit.removed.filter((s) => typeof s === 'string') : [];
  if (removed.length === 0 || !isObj(obj)) return null;
  const text = versionText(obj);
  const back = removed.filter((sentence) => removedHeld(text, sentence));
  if (back.length === 0) return null;
  const part = partHolding(text, sentencesOf(back[0])[0]);
  return { sentences: back, leaf: part ? part.text.trim() : '' };
}

/**
 * Every place the steps lead to in `root`, with the chain of links that led there. An
 * element step follows each element its `match` finds (or, with no match, its index;
 * for a whole element, every element). With `anywhere`, a section's block is looked for
 * in the section the steps name first, then in every other section, since a rework may
 * move it.
 */
function placesOf(root, steps, { anywhere = true } = {}) {
  const out = [];
  const walk = (value, i, chain) => {
    if (i === steps.length) { out.push({ value, chain }); return; }
    const step = steps[i];
    if ('key' in step) {
      if (isObj(value) && value[step.key] !== undefined) walk(value[step.key], i + 1, [...chain, { key: step.key, holder: value }]);
      return;
    }
    if (!Array.isArray(value)) return;
    const collection = collectionAt(steps, i);
    const last = i === steps.length - 1;
    const all = value.map((el, index) => ({ el, index }));
    let candidates = all.filter(({ el, index }) => (step.match ? matchesAfter(el, step.match) : (last || index === step.index)));
    if (anywhere && collection === 'sections' && steps[i + 1] && steps[i + 1].key === 'content') {
      candidates = [...candidates, ...all.filter((c) => !candidates.some((m) => m.index === c.index))];
    }
    candidates.forEach(({ el, index }) => walk(el, i + 1, [...chain, { index, holder: value, collection }]));
  };
  walk(root, 0, []);
  return out;
}

/** The place in `obj` that carries the edit's value, or undefined. */
function placeCarrying(obj, edit) {
  return placesOf(obj, stepsOf(edit), { anywhere: !edit.from }).find((place) => matchesAfter(place.value, edit.after));
}

/** Does `obj` still carry this edit (see the module header)? */
function editCarried(obj, edit) {
  if (!isObj(obj) || !isEdit(edit)) return false;
  if (isCut(edit)) return cutReturnedIn(obj, edit) === null;
  if (stepsOf(edit).length === 0) return false;
  return placeCarrying(obj, edit) !== undefined;
}

/** An edit stored before FA, given its steps; one with steps, as it is. */
function normalizeEdit(edit) {
  if (Array.isArray(edit.at)) return edit;
  const at = stepsOfChange(edit);
  return at ? { ...edit, at } : edit;
}

/** The names of `names` that `texts` name and no part of the version names. */
function droppedNames(texts, versionParts, names) {
  return names.filter((name) => texts.some((t) => namesPerson(t, name)) && !versionParts.some((part) => namesPerson(part.text, name)));
}

/**
 * One edit, complete: its path, and what the director's version tells about it. A cut
 * records its pieces; a rewrite, the sentences it removed; and, given the roster's names,
 * either records the names its text held that the director's version no longer names.
 *
 * @param {Object} edit - {id, scope, at, before, after, from?}
 * @param {Array|null} sentBackText - versionText of the director's version, or null for a
 *   diff stored before the edits had ids (its removals read against the edit's own text)
 * @param {string[]|null} names - the roster's names, or null
 */
function completeEdit(edit, sentBackText, names) {
  const out = { id: edit.id, scope: edit.scope, path: pathOf(edit.at), at: edit.at, before: edit.before, after: edit.after };
  if (edit.from) out.from = edit.from;
  const parts = sentBackText ? sentBackText.map((part) => ({ text: part.text })) : null;
  if (isCut(out)) {
    if (sentBackText) out.pieces = cutSentences(out).filter((sentence) => !partHolding(sentBackText, sentence));
    if (names && parts) out.names = droppedNames(valueTexts(out, out.before), parts, names);
    return out;
  }
  if (out.before !== null && !out.from) {
    const own = sentBackText || versionText({ value: valueTexts(out, out.after) });
    const removed = valueTexts(out, out.before).flatMap(writtenSentences).filter((sentence) => !removedHeld(own, sentence));
    if (removed.length > 0) {
      out.removed = removed;
      if (names && parts) out.names = droppedNames(removed, parts, names);
    }
  }
  return out;
}

/** An earlier edit as it stands now: its removed sentences that came back drop from it. */
function stillRemoved(edit, versions) {
  if (!Array.isArray(edit.removed)) return edit;
  const texts = versions.map(versionText);
  const removed = edit.removed.filter((sentence) => !texts.some((text) => removedHeld(text, sentence)));
  if (removed.length === edit.removed.length) return edit;
  const { removed: _gone, ...rest } = edit;
  return removed.length > 0 ? { ...rest, removed } : rest;
}

/**
 * The standing edits a state channel holds, or null: `{kind, issued, edits}`, where
 * `issued` counts every id given at the stop. A diff stored before the edits had ids
 * reads as its edits, field by field, numbered in order, its cuts read by every sentence
 * of their text and its rewrites' removed sentences by the field's own new text.
 *
 * @param {*} value - state._outlineHandEdits or state._articleHandEdits
 * @returns {{kind: string, issued: number, edits: Object[]}|null}
 */
function standingEditsOf(value) {
  if (!isObj(value)) return null;
  if (Array.isArray(value.edits)) {
    const edits = value.edits.filter(isEdit).map(normalizeEdit);
    const issued = Math.max(Number.isInteger(value.issued) ? value.issued : 0, 0, ...edits.map((e) => editNumber(e.id)));
    if (edits.length === 0 && issued === 0) return null;
    return { kind: value.kind, issued, edits };
  }
  if (value.kind === 'outline' || value.kind === 'bundle') {
    const edits = rawEditsOf(value).map((raw, i) => completeEdit({ id: `E${i + 1}`, ...raw }, null, null));
    return edits.length > 0 ? { kind: value.kind, issued: edits.length, edits } : null;
  }
  return null;
}

/**
 * The edits that stand after a send-back: each earlier edit that both the version the
 * stop showed and the version the director sent back carry (its removed sentences that
 * came back dropped from it), then the send-back's own edits, numbered on from every id
 * issued at the stop. Null when no edit stands and none was ever issued; with earlier
 * ids and none standing, the count is kept, so no id is given twice at a stop.
 *
 * @param {*} previous - the stop's standing edits before this send-back
 * @param {Object} shown - the version the stop showed (the outline without the retired fields)
 * @param {Object} sentBack - the director's version, or `shown` when no edit was sent
 * @param {'outline'|'bundle'} kind
 * @param {Object} [options]
 * @param {string[]} [options.names] - the roster's names: each cut and removal records
 *   which of them its text held and the director's version no longer names
 * @returns {{kind: string, issued: number, edits: Object[]}|null}
 */
function standingAfterSendBack(previous, shown, sentBack, kind, { names } = {}) {
  const prior = standingEditsOf(previous);
  const issued = prior ? prior.issued : 0;
  const kept = prior
    ? prior.edits.filter((e) => editCarried(shown, e) && editCarried(sentBack, e)).map((e) => stillRemoved(e, [shown, sentBack]))
    : [];
  const roster = Array.isArray(names) ? names.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()) : null;
  const sentBackText = versionText(sentBack);
  const added = rawEditsOf(kind === 'outline' ? diffOutline(shown, sentBack) : diffBundle(shown, sentBack))
    .map((raw, i) => completeEdit({ id: `E${issued + 1 + i}`, ...raw }, sentBackText, roster));
  if (kept.length === 0 && added.length === 0 && issued === 0) return null;
  return { kind: kind === 'outline' ? 'outline' : 'bundle', issued: issued + added.length, edits: [...kept, ...added] };
}

/**
 * The standing edits `obj` carries, in id order.
 *
 * @param {*} handEdits - standing edits, a list of edits, or a diff stored before ids
 * @param {*} obj - the outline or bundle in question
 * @returns {Object[]}
 */
function carriedEdits(handEdits, obj) {
  if (!isObj(obj)) return [];
  const edits = Array.isArray(handEdits) ? handEdits.filter(isEdit).map(normalizeEdit) : ((standingEditsOf(handEdits) || {}).edits || []);
  return edits.filter((e) => editCarried(obj, e));
}

/** A paragraph-like value: its one text field is the whole of what the director wrote. */
function isTextBlock(value) {
  return isObj(value) && typeof value.text === 'string' && Object.keys(value).every((k) => k === 'type' || k === 'text');
}

/**
 * A value as plain text, for the report: a string as it is, a paragraph as its text, a
 * list as its items, an element as its fields (`caption: The huddle; filename: p1.jpg`).
 * Never JSON.
 */
function editValueText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (isTextBlock(value)) return value.text.trim();
  if (Array.isArray(value)) return value.map(editValueText).filter(Boolean).join(' / ');
  if (isObj(value)) {
    return Object.keys(value).filter((k) => k !== 'type')
      .map((k) => [k, editValueText(value[k])]).filter(([, text]) => text)
      .map(([k, text]) => `${k}: ${text}`).join('; ');
  }
  return String(value);
}

/** A value as the prompts print it: text quoted, a list's items quoted, an element's fields named. */
function valueLine(value) {
  if (value === undefined || value === null) return '""';
  if (typeof value === 'string') return `"${value.trim()}"`;
  if (isTextBlock(value)) return `"${value.text.trim()}"`;
  if (Array.isArray(value)) return value.map(valueLine).join(' / ');
  if (isObj(value)) return Object.keys(value).filter((k) => k !== 'type').map((k) => `${k} ${valueLine(value[k])}`).join('; ');
  return String(value);
}

/** An element's label in a place: `"The case against Jess"` (what names it), else its number. */
function elementLabel(step) {
  const values = step.match ? Object.values(step.match).filter((v) => typeof v === 'string' || typeof v === 'number') : [];
  if (step.match && Object.keys(step.match).length === 1 && values.length === 1) return `"${values[0]}"`;
  return Number.isInteger(step.index) ? String(step.index + 1) : '';
}

/** Steps as words: `arcs "The case", photoPlacement, purpose`. */
function stepWords(steps) {
  const words = [];
  steps.forEach((step, i) => {
    if ('key' in step) {
      if (!isElementStep(steps[i + 1])) words.push(step.key);
      return;
    }
    const label = elementLabel(step);
    words.push([collectionAt(steps, i), label].filter(Boolean).join(' '));
  });
  return words;
}

/**
 * Where an edit sits, as the prompts and the report name it: `section "closing",
 * paragraph`, `section "the-story", evidence-card jes002, headline`, `headline, main`,
 * `theStory, arcs "The case", photoPlacement, purpose`, then `cut` or `moved from ...`.
 */
function editWhere(edit) {
  const steps = stepsOf(edit);
  const value = isCut(edit) ? edit.before : edit.after;
  const parts = [];
  const head = steps[0] && 'key' in steps[0] ? steps[0].key : null;
  if (head === 'sections' && isElementStep(steps[1])) {
    const sec = steps[1];
    parts.push(`section "${sec.match && sec.match.id != null ? sec.match.id : `index-${sec.index}`}"`);
    if (steps[2] && steps[2].key === 'content' && isElementStep(steps[3])) {
      const block = steps.length === 4 ? value : steps[3].match;
      const type = isObj(block) && typeof block.type === 'string' && block.type ? block.type : 'block';
      const name = isObj(block) ? (block.tokenId || block.filename) : null;
      parts.push(name ? `${type} ${name}` : type);
      const field = stepWords(steps.slice(4)).join(', ');
      if (field && field !== MAIN_FIELD[type]) parts.push(field);
    } else {
      parts.push(...stepWords(steps.slice(2)));
    }
  } else if (head === 'evidenceCards' && isElementStep(steps[1])) {
    const id = steps[1].match && steps[1].match.tokenId != null ? steps[1].match.tokenId : (isObj(value) && value.tokenId) || elementLabel(steps[1]);
    parts.push(`sidebar card ${id}`, ...stepWords(steps.slice(2)));
  } else if (head === 'pullQuotes' || head === 'photos') {
    parts.push(head === 'pullQuotes' ? 'pull quote' : 'photos list', ...stepWords(steps.slice(2)));
  } else if (head === 'heroImage') {
    parts.push('hero image', ...stepWords(steps.slice(1)));
  } else if (head === 'financialTracker') {
    parts.push('financial tracker', ...stepWords(steps.slice(1)).map((w) => w.replace(/^entries /, 'entry ')));
  } else if (head) {
    parts.push(head, ...stepWords(steps.slice(1)));
  } else {
    parts.push(edit.path);
  }
  if (isCut(edit)) parts.push('cut');
  if (edit.from) parts.push(`moved from section "${edit.from}"`);
  return parts.filter(Boolean).join(', ');
}

/** How many of its opening words name a moved block that no filename or tokenId names. */
const MOVED_OPENING_WORDS = 8;

/**
 * A move's line: its id and place, and, for a block its text names, the words it begins
 * with. Its text is the writer's (fix round 1, finding 2), so the line never prints it
 * as the director's.
 */
function moveLine(edit) {
  const block = edit.after;
  const named = isObj(block) && (block.filename || block.tokenId);
  const words = named ? [] : blockText(block).trim().split(/\s+/).filter(Boolean);
  const opening = words.length > MOVED_OPENING_WORDS ? `${words.slice(0, MOVED_OPENING_WORDS).join(' ')}…` : words.join(' ');
  return `${edit.id} (${editWhere(edit)})${opening ? `: begins "${opening}"` : ''}`;
}

/**
 * One line per edit, by id and place, with the director's text whole: a cut's line
 * holds the text the director removed, and a rewrite's removed sentences follow it, one
 * `removed:` line each. Text is quoted; an element prints its fields, never JSON. A
 * move's line names the block and its place (moveLine).
 *
 * @param {Object[]} edits
 * @returns {string}
 */
function formatEditLines(edits) {
  return (Array.isArray(edits) ? edits : []).filter(isEdit).map(normalizeEdit).map((e) => (isMove(e) ? moveLine(e) : [
    `${e.id} (${editWhere(e)}): ${valueLine(isCut(e) ? e.before : e.after)}`,
    ...(Array.isArray(e.removed) ? e.removed : []).map((sentence) => `  removed: "${String(sentence).trim()}"`)
  ].join('\n'))).join('\n');
}

/**
 * The text `output` prints outside the edits it carries (each edit's own text taken out
 * once), part by part. A moved block's text stays the writer's.
 */
function writerParts(output, edits) {
  const owned = new Map();
  edits.filter((e) => !isCut(e) && !isMove(e)).forEach((e) => valueTexts(e, e.after).forEach((leaf) => {
    const key = fold(leaf);
    owned.set(key, (owned.get(key) || 0) + 1);
  }));
  return printedParts(output).filter((part) => {
    const key = fold(part.text);
    const n = owned.get(key) || 0;
    if (n === 0) return true;
    owned.set(key, n - 1);
    return false;
  });
}

/**
 * The text an edit locates a quote against: its own text, the text it cut, and the
 * sentences it removed. A move has none: its block's text is the writer's.
 */
function locatingTexts(edit) {
  if (isMove(edit)) return [];
  return [
    ...valueTexts(edit, isCut(edit) ? edit.before : edit.after),
    ...(Array.isArray(edit.removed) ? edit.removed.filter((s) => typeof s === 'string') : [])
  ];
}

/** An elision inside a quoted passage. */
const ELLIPSIS = /\s*(?:\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/;

/** The record's texts, each folded once, by the list they came in (locateQuotedText). */
const FOLDED_RECORDS = new WeakMap();

function foldedRecord(record) {
  if (!Array.isArray(record)) return [];
  let folded = FOLDED_RECORDS.get(record);
  if (!folded) {
    folded = record.filter((text) => typeof text === 'string' && text.trim()).map(fold);
    FOLDED_RECORDS.set(record, folded);
  }
  return folded;
}

/** The section headings `output` prints, folded: a quote of one is where a finding points. */
function sectionHeadings(output) {
  const sections = isObj(output) && Array.isArray(output.sections) ? output.sections : [];
  return new Set(sections.filter((s) => isObj(s) && typeof s.heading === 'string' && s.heading.trim()).map((s) => fold(s.heading)));
}

/**
 * Whose text a finding quotes. Each passage the finding quotes (grounding.js
 * quotedPassages, split at an elision) of three words or more is, matched as
 * isVerbatimIn does, in any case:
 * - nobody's, when it is a section heading of the output: a finding quotes a heading to
 *   say where the problem is (known item 3);
 * - the writer's, when the writer's printed text holds it, unless every place that holds
 *   it is the content of the writer's evidence card and the record holds it too: a card
 *   prints its document word for word, so that is the record cited (fix round 1, finding
 *   2), and the passage is then located like any other (known item 5);
 * - an edit's, when that edit's text, the text a cut removed or a sentence a rewrite
 *   removed holds it.
 *
 * @param {string} text - a finding, or a criterion's notes
 * @param {Object[]} edits - the edits `output` carries
 * @param {Object} output - the outline or bundle the finding is about
 * @param {Object} [options]
 * @param {string[]} [options.record] - the record's texts as the judge read them: the
 *   documents and the director's words (evaluator-nodes.js recordTexts)
 * @returns {{editIds: string[], writer: boolean}} the edits quoted, in id order, and
 *   whether the writer's text is quoted too
 */
function locateQuotedText(text, edits, output, { record = [] } = {}) {
  const list = (Array.isArray(edits) ? edits : []).filter(isEdit).map(normalizeEdit);
  const headings = sectionHeadings(output);
  const passages = quotedPassages(text)
    .flatMap((p) => p.split(ELLIPSIS))
    .map((p) => p.trim())
    .filter((p) => wordsIn(p) >= MIN_LOCATING_WORDS && !headings.has(fold(p)));
  if (passages.length === 0) return { editIds: [], writer: false };
  const writer = writerParts(output, list);
  const recorded = foldedRecord(record);
  const inRecord = (passage) => {
    const folded = fold(passage);
    return folded.length > 0 && recorded.some((source) => source.includes(folded));
  };
  const quoted = new Set();
  let writerQuoted = false;
  for (const passage of passages) {
    const holding = writer.filter((part) => holds(part.text, passage));
    if (holding.length > 0 && !(holding.every((part) => part.cardContent) && inRecord(passage))) {
      writerQuoted = true;
      continue;
    }
    const edit = list.find((e) => locatingTexts(e).some((leaf) => holds(leaf, passage)));
    if (edit) quoted.add(edit.id);
  }
  return { editIds: list.map((e) => e.id).filter((id) => quoted.has(id)), writer: writerQuoted };
}

/** A finding about the director's edits: the prefix and the ids, then the finding. */
function directorEditConcern(ids, text) {
  const finding = String(text == null ? '' : text);
  return finding.startsWith(DIRECTOR_EDIT_PREFIX) ? finding : `${DIRECTOR_EDIT_PREFIX}${ids.join(', ')}: ${finding}`;
}

/** The ids after the prefix ("E1, E3: "), with the colon and the space after it. */
const CONCERN_IDS = /^((?:E\d+)(?:\s*,\s*E\d+)*)\s*:\s*/;

/** The ids a finding filed under the prefix names ("Director's edit E1, E3: ..."), or none. */
function concernEditIds(text) {
  const finding = String(text == null ? '' : text);
  if (!finding.startsWith(DIRECTOR_EDIT_PREFIX)) return [];
  const m = CONCERN_IDS.exec(finding.slice(DIRECTOR_EDIT_PREFIX.length));
  return m ? m[1].split(',').map((id) => id.trim()) : [];
}

/** What a finding filed under the prefix says after its ids ("T1: ..."), or null for any other text. */
function concernFinding(text) {
  const finding = String(text == null ? '' : text);
  if (!finding.startsWith(DIRECTOR_EDIT_PREFIX)) return null;
  const m = CONCERN_IDS.exec(finding.slice(DIRECTOR_EDIT_PREFIX.length));
  return m ? finding.slice(DIRECTOR_EDIT_PREFIX.length + m[0].length) : null;
}

/**
 * Does `text` name `name`? The roster coverage test (content-bundle-fact-check.js), and
 * the test a cut or a removal records its names by: the name as a whole word, in any case.
 *
 * @param {*} text
 * @param {string} name
 * @returns {boolean}
 */
function namesPerson(text, name) {
  const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(String(text == null ? '' : text));
}

/** The value at a block's or card's field steps. */
function valueAtSteps(value, steps) {
  let cur = value;
  for (const step of steps) {
    if (!('key' in step) || !isObj(cur)) return undefined;
    cur = cur[step.key];
  }
  return cur;
}

/**
 * Which of the director's edits each printed piece of a bundle is, for the fact check,
 * field by field (FA, requirement 2): the edit that wrote a block's field, any edit on a
 * block or a sidebar card, a field such as `headline.main` or `heroImage.filename`, and
 * the cut or removal that took out a player's last mention. A move wrote no field: the
 * block it placed is the writer's (fix round 1, finding 2).
 *
 * @param {Object} bundle
 * @param {Object[]} edits - the edits the bundle carries
 */
function editLocator(bundle, edits) {
  const list = (Array.isArray(edits) ? edits : []).filter(isEdit).map(normalizeEdit);
  const written = list.filter((e) => !isCut(e) && !isMove(e));
  /** The edits on section blocks: a whole section, a whole block, or a block's field. */
  const blockEdits = (sectionKeyOfBlock, block, onField) => {
    for (const e of written) {
      const steps = stepsOf(e);
      if (!steps[0] || steps[0].key !== 'sections' || !isElementStep(steps[1])) continue;
      if (steps.length === 2) {
        const sec = steps[1];
        const key = sec.match && sec.match.id != null ? String(sec.match.id) : `index-${sec.index}`;
        if (key === sectionKeyOfBlock) return e.id;
        continue;
      }
      if (!steps[2] || steps[2].key !== 'content' || !isElementStep(steps[3])) continue;
      if (steps.length === 4) {
        if (matchesAfter(block, e.after)) return e.id;
        continue;
      }
      const fieldSteps = steps.slice(4);
      if (steps[3].match && matchesAfter(block, steps[3].match) && onField(fieldSteps)
        && same(valueAtSteps(block, fieldSteps), e.after)) return e.id;
    }
    return null;
  };
  return {
    /** @returns {string|null} the id of the edit that wrote `field` of this block of section `key` */
    blockField(key, block, field) {
      return blockEdits(key, block, (steps) => steps.length === 1 && steps[0].key === field);
    },
    /** @returns {string|null} the id of an edit on any field of this block, or on the block whole */
    blockEdited(key, block) {
      return blockEdits(key, block, () => true);
    },
    /** @returns {string|null} the id of an edit on this sidebar card, any field or the card whole */
    sidebarCard(card) {
      for (const e of written) {
        const steps = stepsOf(e);
        if (!steps[0] || steps[0].key !== 'evidenceCards' || !isElementStep(steps[1])) continue;
        if (steps.length === 2) {
          if (matchesAfter(card, e.after)) return e.id;
          continue;
        }
        if (steps[1].match && matchesAfter(card, steps[1].match) && same(valueAtSteps(card, steps.slice(2)), e.after)) return e.id;
      }
      return null;
    },
    /** @returns {string|null} the id of the edit this field is, or is part of */
    field(path) {
      const hit = written.find((e) => (e.path === path || path.startsWith(`${e.path}.`)) && editCarried(bundle, e));
      return hit ? hit.id : null;
    },
    /**
     * @returns {string|null} the id of the cut or removal that took out the last place
     *   the director's version named `name` (the names it recorded, FA requirement 9); a
     *   cut that recorded none, stored before FA, by whether its text names `name`
     */
    cutNaming(name) {
      const lower = String(name).toLowerCase();
      const hit = list.find((e) => (Array.isArray(e.names)
        ? e.names.some((n) => String(n).toLowerCase() === lower)
        : isCut(e) && valueTexts(e, e.before).some((leaf) => namesPerson(leaf, name))));
      return hit ? hit.id : null;
    }
  };
}

// ─── putting back what a pass changed (FA, requirement 8) ─────────────────────

/** Two elements of one collection of the same kind: blocks of one type, or values of one type. */
function sameKind(a, b) {
  if (isObj(a) && isObj(b)) return a.type === b.type;
  return typeof a === typeof b;
}

/**
 * Where an element of the version a pass started from is in the version it returned, or
 * -1: by what names it (a section's id, a card's tokenId, a paragraph's text), then as
 * the collection pairs (blocks by type and opening words, then by index), of the same kind.
 */
function partnerIndex(collection, beforeArr, afterArr, bi) {
  const element = beforeArr[bi];
  const identity = identityOf(collection, element);
  if (identity) {
    const found = afterArr.findIndex((x) => matchesAfter(x, identity));
    if (found !== -1) return found;
  }
  const pair = pairElements(collection, beforeArr, afterArr).pairs.find((p) => p.bi === bi);
  return pair && sameKind(afterArr[pair.ai], element) ? pair.ai : -1;
}

/** The id of the section of `obj` whose content holds `block`, or null. */
function sectionHolding(obj, block) {
  const sections = isObj(obj) && Array.isArray(obj.sections) ? obj.sections : [];
  const index = sections.findIndex((s) => isObj(s) && Array.isArray(s.content) && s.content.some((b) => matchesAfter(b, block)));
  return index === -1 ? null : sectionKey(sections[index], index);
}

/**
 * What an edit's text became in a pass's output, or null when it is gone: the field's
 * new value, found by following the edit's element from where it sat in the version the
 * pass started from; for a cut, the text where it came back; for a move, the section
 * the block is in.
 */
function becameOf(edit, before, after) {
  if (!isObj(after)) return null;
  if (isCut(edit)) return cutReturnedIn(after, edit);
  if (edit.from) {
    const where = sectionHolding(after, edit.after);
    return where === null ? null : `section "${where}"`;
  }
  const place = placeCarrying(before, edit);
  if (!place) return null;
  let cur = after;
  for (const link of place.chain) {
    if ('key' in link) {
      if (!isObj(cur) || cur[link.key] === undefined) return null;
      cur = cur[link.key];
      continue;
    }
    if (!Array.isArray(cur)) return null;
    const partner = partnerIndex(link.collection, link.holder, cur, link.index);
    if (partner === -1) return null;
    cur = cur[partner];
  }
  return cur === undefined || cur === null ? null : editValueText(cur);
}

/** Put a moved block back in the section the director put it in. */
function restoreMove(edit, out) {
  const steps = stepsOf(edit);
  const sections = isObj(out) && Array.isArray(out.sections) ? out.sections : null;
  if (!sections || !isElementStep(steps[1]) || !isElementStep(steps[3])) return false;
  const sec = steps[1];
  const targetIndex = sections.findIndex((s, i) => (sec.match ? matchesAfter(s, sec.match) : i === sec.index));
  if (targetIndex === -1) return false;
  for (const s of sections) {
    if (!isObj(s) || !Array.isArray(s.content)) continue;
    const at = s.content.findIndex((b) => matchesAfter(b, edit.after));
    if (at !== -1) { s.content.splice(at, 1); break; }
  }
  const target = sections[targetIndex];
  if (!Array.isArray(target.content)) target.content = [];
  const index = Number.isInteger(steps[3].index) ? steps[3].index : target.content.length;
  target.content.splice(Math.min(index, target.content.length), 0, clone(edit.after));
  return true;
}

/**
 * Put one of the director's edits back into `out`, the pass's output (changed in place):
 * follow the edit's element from where it sat in `before`, the version the pass started
 * from, into `out`, and write the director's value at its field. An element the pass
 * removed goes back where it sat, as it was in `before`. A cut is never put back.
 *
 * @returns {boolean} whether anything was written
 */
function restoreEdit(edit, before, out) {
  if (isCut(edit) || !isObj(out)) return false;
  if (edit.from) return restoreMove(edit, out);
  const place = placeCarrying(before, edit);
  if (!place) return false;
  let cur = out;
  for (let i = 0; i < place.chain.length; i++) {
    const link = place.chain[i];
    const last = i === place.chain.length - 1;
    if ('key' in link) {
      if (last) {
        cur[link.key] = isObj(cur[link.key]) && isObj(edit.after) ? { ...cur[link.key], ...clone(edit.after) } : clone(edit.after);
        return true;
      }
      if (!isObj(cur[link.key]) && !Array.isArray(cur[link.key])) {
        cur[link.key] = clone(link.holder[link.key]);
        return true;
      }
      cur = cur[link.key];
      continue;
    }
    if (!Array.isArray(cur)) return false;
    const partner = partnerIndex(link.collection, link.holder, cur, link.index);
    if (last) {
      const element = clone(edit.after);
      if (partner !== -1 && sameKind(cur[partner], element)) {
        cur[partner] = isObj(cur[partner]) && isObj(element) ? { ...cur[partner], ...element } : element;
      } else {
        cur.splice(Math.min(link.index, cur.length), 0, element);
      }
      return true;
    }
    if (partner === -1) {
      cur.splice(Math.min(link.index, cur.length), 0, clone(link.holder[link.index]));
      return true;
    }
    cur = cur[partner];
  }
  return false;
}

/**
 * The stop's report after one more pass of the round. For each edit the pass started
 * from:
 * - a field or element the pass changed: the director's text, what it became (null:
 *   gone), and whether code put it back (`restored`);
 * - a cut whose text came back, or a rewrite's removed sentence that came back, flagged
 *   (`cut`, `removed`), with the text where it came back: code never takes it out;
 * - each with the pass (SEND_BACK_PASS or the automatic pass's number), whether an
 *   automatic pass made it, and the rework's reason (null: none given).
 * `checked` lists every id the round's passes checked. The server resets the report at
 * each send-back, so it holds one round.
 *
 * @param {Object|null} previous - the round's report so far
 * @param {Object} pass
 * @param {Object[]} pass.edits - the standing edits the version the pass started from carries
 * @param {Object} pass.before - that version
 * @param {Object} pass.after - the version the pass returned
 * @param {string|number} pass.pass - SEND_BACK_PASS, or the automatic pass's number
 * @param {Array<{id: string, reason: string}>} [pass.reasons] - the rework's changed edits
 * @param {string[]} [pass.restored] - the edits code put back after the pass
 * @param {Object} [pass.stored] - the version stored after the pass (default `after`)
 * @returns {{checked: string[], changed: Object[]}|null}
 */
function reportAfterPass(previous, { edits = [], before = null, after = null, pass, reasons = [], restored = [], stored = after } = {}) {
  const carried = (Array.isArray(edits) ? edits : []).filter(isEdit).map(normalizeEdit);
  if (carried.length === 0) return previous || null;
  const prior = handEditReportOf(previous) || { checked: [], changed: [] };
  const why = new Map((Array.isArray(reasons) ? reasons : [])
    .filter((r) => isObj(r) && typeof r.id === 'string' && typeof r.reason === 'string' && r.reason.trim())
    .map((r) => [r.id.trim(), r.reason.trim()]));
  const automatic = pass !== SEND_BACK_PASS;
  const putBack = new Set(Array.isArray(restored) ? restored : []);
  const entry = (e, fields) => ({
    id: e.id, scope: e.scope, where: editWhere(e), cut: false, removed: false, moved: false,
    director: '', became: null, pass, automatic, reason: why.get(e.id) || null, restored: false, ...fields
  });
  const changed = [];
  carried.forEach((e) => {
    if (isCut(e)) {
      const back = cutReturnedIn(stored, e);
      if (back !== null) changed.push(entry(e, { cut: true, director: editValueText(e.before), became: back }));
      return;
    }
    if (!editCarried(after, e)) {
      changed.push(entry(e, {
        moved: Boolean(e.from), director: editValueText(e.after), became: becameOf(e, before, after), restored: putBack.has(e.id)
      }));
    }
    const back = removedReturnedIn(stored, e);
    if (back) changed.push(entry(e, { removed: true, director: back.sentences.join(' '), became: back.leaf }));
  });
  return {
    checked: [...prior.checked, ...carried.map((e) => e.id).filter((id) => !prior.checked.includes(id))],
    changed: [...prior.changed, ...changed]
  };
}

/**
 * One pass, settled (FA, requirement 8): after an automatic pass, code puts back each
 * standing edit the pass changed, field by field, so the stored output carries every
 * one; a cut or removed sentence that came back stays, flagged in the report. A
 * send-back's rework is left as it is: the director's note may change an edit, and the
 * rework says why. The report records what each pass did and each restore.
 *
 * @param {Object|null} previous - the round's report so far
 * @param {Object} pass - as reportAfterPass takes it: {edits, before, after, pass, reasons}
 * @returns {{output: *, report: Object|null}} the version to store, and the report
 */
function settleEdits(previous, { edits = [], before = null, after = null, pass, reasons = [] } = {}) {
  const carried = (Array.isArray(edits) ? edits : []).filter(isEdit).map(normalizeEdit);
  if (carried.length === 0) return { output: after, report: previous || null };
  let output = after;
  const restored = [];
  if (pass !== SEND_BACK_PASS && isObj(after)) {
    const changed = carried.filter((e) => !isCut(e) && !editCarried(after, e));
    if (changed.length > 0) {
      output = clone(after);
      changed.forEach((e) => restoreEdit(e, before, output));
      changed.forEach((e) => { if (editCarried(output, e)) restored.push(e.id); });
    }
  }
  return { output, report: reportAfterPass(previous, { edits: carried, before, after, pass, reasons, restored, stored: output }) };
}

/**
 * The report as the stop sends it (server.js getCheckpointData), or null. A report
 * written before F1 named scopes, not edits, and one that checked no edit says nothing:
 * both read as none.
 */
function handEditReportOf(value) {
  if (!isObj(value) || !Array.isArray(value.checked) || !Array.isArray(value.changed)) return null;
  if (value.checked.length === 0) return null;
  if (!value.checked.every((id) => typeof id === 'string' && /^E\d+$/.test(id))) return null;
  if (!value.changed.every((c) => isObj(c) && typeof c.id === 'string')) return null;
  return value;
}

module.exports = {
  diffOutline, diffBundle, isEmpty, scopeKeys, readAtPath,
  // F1 and FA: the director's edits are final
  DIRECTOR_EDIT_PREFIX, SEND_BACK_PASS, CHANGED_EDITS_KEY, EDIT_LINES_GUIDE, PRINTED_BLOCK_FIELDS, PRINTED_FIELDS,
  standingEditsOf, standingAfterSendBack, carriedEdits, formatEditLines, editValueText,
  locateQuotedText, directorEditConcern, concernEditIds, concernFinding, editLocator,
  reportAfterPass, settleEdits, handEditReportOf, sectionKey, namesPerson,
  _testing: {
    matchBlocks, blockKey, canon, same, matchesAfter, editCarried, editWhere, becameOf, sentencesOf, holdsWhole,
    OUTLINE_IGNORED_KEYS, MIN_LOCATING_WORDS, MIN_INLINE_PIECE_WORDS, printedLeaves, restoreEdit, idOf, stepsOf
  }
};
