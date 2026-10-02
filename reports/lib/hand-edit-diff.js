/**
 * lib/hand-edit-diff.js — PURE: the director's edits at a stop (spec 2026-09-19 §4.2;
 * F1, the director's edits are final, spec 2026-10-02 section 7).
 *
 * Depends only on lib/grounding.js (pure). Never throws: any non-object input yields an
 * empty diff, no edits or no report.
 *
 * Paths are dotted from the root of the object, with collection selectors in
 * brackets: `lede.hook`, `headline.main`, `sections[#intro].heading`,
 * `sections[#intro].content[2]`, `evidenceCards[#alr001]`, `pullQuotes[1]`.
 * `#` selects by id (sections.id, evidenceCards.tokenId); a bare number is an index;
 * `[-]` marks a removed item (not resolvable). readAtPath resolves the same grammar.
 *
 * THE DIRECTOR'S EDITS (F1). Each change a send-back's diff holds becomes an edit with an
 * id that is stable within its stop: `{id: 'E3', scope, path, before, after}`, where
 * `after` is the director's text and a null `after` marks a cut (`before` is then the
 * text the director removed). A cut also records its `pieces`: each sentence of the text
 * it removed, of three words or more, that the version the director sent back no longer
 * held (fix round 1, finding 3). A sentence the director's version still printed
 * elsewhere is no piece, so text repeated elsewhere never voids the cut. The edits stand
 * at their stop across every send-back (standingAfterSendBack): an earlier edit stands
 * while the version the stop showed, and the version the director sent back, carry its
 * text, and a cut stands while its pieces stay absent, so an edit a rework changed,
 * which the director saw and left, drops. A new edit takes the next number after every
 * id issued at the stop. The approve branch, a rollback and a fresh start clear them
 * (checkpoint-nodes.js, state.js ROLLBACK_CLEARS, FRESH_START_CLEARS).
 *
 * Carried (editCarried). An edit addressed by id or by a plain field path
 * (`sections[#intro].heading`, `evidenceCards[#alr001]`, `headline.main`) is read
 * THROUGH readAtPath, because the id survives reordering. An INDEX-addressed edit
 * (`sections[#intro].content[2]`, `pullQuotes[1]`, `photos[0]`) is not read at its
 * index at all: the diff paired blocks by type + a 40-character text prefix, so the
 * index is only where the block sat in the director's own object, and a rework that
 * inserts or removes a block ahead of it shifts it. Such an edit is carried while a
 * MATCHING element exists ANYWHERE in the addressed collection, and a section's block
 * anywhere in the sections, since a rework may move it. A cut is carried while the
 * version's text holds none of its pieces, each matched whole, in any case, as
 * grounding.js normalizes text: a rework that brings back one sentence of a cut
 * paragraph, word for word, brings the cut back. A cut stored without pieces (a diff
 * from before F1) is read by every sentence of its text.
 *
 * Equality everywhere in this module is trimmed canonical JSON: keys sorted, every
 * string trimmed at whatever depth it sits. MATCHING an `after` value adds subset
 * semantics for objects: a block, quote, card or photo counts as kept when every key
 * the director's value carries is present in the revised element with a canonically
 * equal value, so an optional field the rework ADDED (`attribution`, `placement`,
 * `significance`, `characters`) is not a change, while a director-set field the rework
 * dropped or altered is. Scalar and array `after` values keep exact (trimmed) equality.
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

/** Keys whose text is no part of what the director edits or a reader reads. */
const UNPRINTED_KEYS = new Set(['metadata', '_revisionHistory', 'voice_self_check', '_voiceSelfCheck', ...OUTLINE_IGNORED_KEYS, CHANGED_EDITS_KEY]);

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) return Object.keys(v).sort().reduce((o, k) => { o[k] = sortKeys(v[k]); return o; }, {});
  return typeof v === 'string' ? v.trim() : v;
}

function canon(v) { return v === undefined ? 'undefined' : JSON.stringify(sortKeys(v)); }

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

/** Pair blocks by type + first 40 normalised characters, then by index for what is left. */
function matchBlocks(beforeArr, afterArr) {
  const b = Array.isArray(beforeArr) ? beforeArr : [];
  const a = Array.isArray(afterArr) ? afterArr : [];
  const usedB = new Set();
  const usedA = new Set();
  const pairs = [];
  a.forEach((blk, ai) => {
    const key = blockKey(blk);
    const bi = b.findIndex((cand, i) => !usedB.has(i) && blockKey(cand) === key);
    if (bi !== -1) { usedB.add(bi); usedA.add(ai); pairs.push({ bi, ai }); }
  });
  a.forEach((blk, ai) => {
    if (usedA.has(ai)) return;
    if (ai < b.length && !usedB.has(ai)) { usedB.add(ai); usedA.add(ai); pairs.push({ bi: ai, ai }); }
  });
  const removed = b.map((_, i) => i).filter((i) => !usedB.has(i));
  const added = a.map((_, i) => i).filter((i) => !usedA.has(i));
  return { pairs, removed, added };
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

/** A trailing bare-number selector: the part of a path that a rework's insert/remove shifts. */
const INDEX_TAIL = /\[(\d+)\]$/;
/** A section's blocks, as a path to the collection. */
const SECTION_CONTENT = /^sections\[#[^\]]+\]\.content$/;
/** One of a section's blocks, as an edit's path. */
const SECTION_BLOCK = /^sections\[#[^\]]+\]\.content\[\d+\]$/;

// ─── the director's edits (F1) ────────────────────────────────────────────────

function isEdit(e) { return isObj(e) && typeof e.id === 'string' && typeof e.path === 'string'; }

/** A cut: the director removed the text, so the edit has no `after`. */
function isCut(edit) { return edit.after === null || edit.after === undefined; }

function editNumber(id) {
  const m = /^E(\d+)$/.exec(String(id));
  return m ? Number(m[1]) : 0;
}

/** Every string inside a value, in order, leaving out the keys no reader reads. */
function stringLeaves(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringLeaves(v, out));
  else if (isObj(value)) Object.keys(value).forEach((k) => { if (!UNPRINTED_KEYS.has(k)) stringLeaves(value[k], out); });
  return out;
}

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

/** Every sentence of the text a cut removed. */
function cutSentences(edit) { return stringLeaves(edit.before).flatMap(sentencesOf); }

/**
 * The sentences whose return brings a cut back: the pieces the cut recorded when the
 * director made it, or, for a cut stored without them, every sentence of its text.
 */
function cutPieces(edit) {
  return Array.isArray(edit.pieces) ? edit.pieces.filter((piece) => typeof piece === 'string') : cutSentences(edit);
}

/** The sentences of a cut's text that `obj` holds none of: the cut's pieces, at its birth. */
function piecesAbsentFrom(obj, edit) {
  const leaves = stringLeaves(obj).map(fold);
  return cutSentences(edit).filter((sentence) => !leaves.some((leaf) => holdsWhole(leaf, fold(sentence))));
}

/** The first piece of text in `obj` that holds one of a cut's pieces, or null. */
function cutReturnedIn(obj, edit) {
  const pieces = cutPieces(edit).map(fold).filter(Boolean);
  if (pieces.length === 0) return null;
  const leaf = stringLeaves(obj).find((text) => {
    const folded = fold(text);
    return pieces.some((piece) => holdsWhole(folded, piece));
  });
  return leaf === undefined ? null : leaf.trim();
}

function sectionBlockPaths(obj) {
  return (Array.isArray(obj.sections) ? obj.sections : []).map((s, i) => `sections[#${idOf(s, 'id', i)}].content`);
}

/** Does `obj` still carry this edit's text (see the module header)? */
function editCarried(obj, edit) {
  if (!isObj(obj) || !isEdit(edit)) return false;
  if (isCut(edit)) return cutReturnedIn(obj, edit) === null;
  const m = INDEX_TAIL.exec(edit.path);
  if (!m) return matchesAfter(readAtPath(obj, edit.path), edit.after);
  const collectionPath = edit.path.slice(0, m.index);
  const paths = SECTION_CONTENT.test(collectionPath) ? [collectionPath, ...sectionBlockPaths(obj)] : [collectionPath];
  return paths.some((p) => {
    const collection = readAtPath(obj, p);
    return Array.isArray(collection) && collection.some((el) => matchesAfter(el, edit.after));
  });
}

/** A diff's changes as edits, numbered from `firstNumber`. */
function editsFromDiff(diff, firstNumber) {
  const edits = [];
  groups(diff).forEach((g) => (g.changes || []).forEach((c) => {
    if (!isObj(c) || typeof c.path !== 'string') return;
    edits.push({
      id: `E${firstNumber + edits.length}`,
      scope: g.key,
      path: c.path,
      before: c.before === undefined ? null : c.before,
      after: c.after === undefined ? null : c.after
    });
  }));
  return edits;
}

/**
 * The standing edits a state channel holds, or null: `{kind, issued, edits}`, where
 * `issued` counts every id given at the stop. A diff stored before the edits had ids
 * reads as its changes, numbered in order.
 *
 * @param {*} value - state._outlineHandEdits or state._articleHandEdits
 * @returns {{kind: string, issued: number, edits: Object[]}|null}
 */
function standingEditsOf(value) {
  if (!isObj(value)) return null;
  if (Array.isArray(value.edits)) {
    const edits = value.edits.filter(isEdit);
    const issued = Math.max(Number.isInteger(value.issued) ? value.issued : 0, 0, ...edits.map((e) => editNumber(e.id)));
    if (edits.length === 0 && issued === 0) return null;
    return { kind: value.kind, issued, edits };
  }
  if (value.kind === 'outline' || value.kind === 'bundle') {
    const edits = editsFromDiff(value, 1);
    return edits.length > 0 ? { kind: value.kind, issued: edits.length, edits } : null;
  }
  return null;
}

/**
 * The edits that stand after a send-back: each earlier edit that both the version the
 * stop showed and the version the director sent back carry, then the send-back's own
 * diff, numbered on from every id issued at the stop. Each new cut records its pieces:
 * the sentences of its text the director's version no longer held. Null when no edit
 * stands and none was ever issued; with earlier ids and none standing, the count is
 * kept, so no id is given twice at a stop.
 *
 * @param {*} previous - the stop's standing edits before this send-back
 * @param {Object} shown - the version the stop showed (the outline without the retired fields)
 * @param {Object} sentBack - the director's version, or `shown` when no edit was sent
 * @param {'outline'|'bundle'} kind
 * @returns {{kind: string, issued: number, edits: Object[]}|null}
 */
function standingAfterSendBack(previous, shown, sentBack, kind) {
  const prior = standingEditsOf(previous);
  const issued = prior ? prior.issued : 0;
  const kept = prior ? prior.edits.filter((e) => editCarried(shown, e) && editCarried(sentBack, e)) : [];
  const added = editsFromDiff(kind === 'outline' ? diffOutline(shown, sentBack) : diffBundle(shown, sentBack), issued + 1)
    .map((edit) => (isCut(edit) ? { ...edit, pieces: piecesAbsentFrom(sentBack, edit) } : edit));
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
  const edits = Array.isArray(handEdits) ? handEdits.filter(isEdit) : ((standingEditsOf(handEdits) || {}).edits || []);
  return edits.filter((e) => editCarried(obj, e));
}

/** A paragraph-like value: its one text field is the whole of what the director wrote. */
function isTextBlock(value) {
  return isObj(value) && typeof value.text === 'string' && Object.keys(value).every((k) => k === 'type' || k === 'text');
}

/** A value as one string: a string as it is, a paragraph as its text, anything else as JSON. */
function editValueText(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  if (isTextBlock(value)) return value.text.trim();
  return canon(value);
}

/** Where an edit sits, as the prompts name it: `section "closing", paragraph`, `headline, main`. */
function editWhere(edit) {
  const value = isCut(edit) ? edit.before : edit.after;
  const section = /^sections\[#([^\]]+)\](.*)$/.exec(edit.path);
  if (section) {
    const where = `section "${section[1]}"`;
    if (section[2] === '') return where;
    if (/^\.content\[(?:\d+|-)\]$/.test(section[2])) {
      return `${where}, ${isObj(value) && typeof value.type === 'string' && value.type ? value.type : 'block'}`;
    }
    return `${where}, ${section[2].replace(/^\./, '')}`;
  }
  const card = /^evidenceCards\[#([^\]]+)\]$/.exec(edit.path);
  if (card) return `sidebar card ${card[1]}`;
  if (/^pullQuotes\[\d+\]$/.test(edit.path)) return 'pull quote';
  if (/^photos\[\d+\]$/.test(edit.path)) return 'photos list';
  if (edit.path === 'heroImage') return 'hero image';
  const [scope, ...rest] = edit.path.split('.');
  return rest.length > 0 ? `${scope}, ${rest.join('.')}` : scope;
}

/**
 * One line per edit, by id and section, with the director's text whole: a cut's line
 * holds the text the director removed. Text is quoted; a structured value prints as JSON.
 *
 * @param {Object[]} edits
 * @returns {string}
 */
function formatEditLines(edits) {
  return (Array.isArray(edits) ? edits : []).filter(isEdit).map((e) => {
    const value = isCut(e) ? e.before : e.after;
    const text = typeof value === 'string' || isTextBlock(value) ? `"${editValueText(value)}"` : editValueText(value);
    return `${e.id} (${editWhere(e)}${isCut(e) ? ', cut' : ''}): ${text}`;
  }).join('\n');
}

/** The text `output` holds outside the edits it carries (each edit's text taken out once). */
function writerLeaves(output, edits) {
  const owned = new Map();
  edits.filter((e) => !isCut(e)).forEach((e) => stringLeaves(e.after).forEach((leaf) => {
    const key = fold(leaf);
    owned.set(key, (owned.get(key) || 0) + 1);
  }));
  return stringLeaves(output).filter((leaf) => {
    const key = fold(leaf);
    const n = owned.get(key) || 0;
    if (n === 0) return true;
    owned.set(key, n - 1);
    return false;
  });
}

/** An elision inside a quoted passage. */
const ELLIPSIS = /\s*(?:\[\s*(?:\.{3}|…)\s*\]|\.{3}|…)\s*/;

/**
 * Whose text a finding quotes. Each passage the finding quotes (grounding.js
 * quotedPassages, split at an elision) of three words or more is the writer's when the
 * writer's text holds it, and an edit's when that edit's text, or the text a cut
 * removed, does (isVerbatimIn, in any case). A passage in both is the writer's.
 *
 * @param {string} text - a finding, or a criterion's notes
 * @param {Object[]} edits - the edits `output` carries
 * @param {Object} output - the outline or bundle the finding is about
 * @returns {{editIds: string[], writer: boolean}} the edits quoted, in id order
 */
function locateQuotedText(text, edits, output) {
  const list = (Array.isArray(edits) ? edits : []).filter(isEdit);
  const passages = quotedPassages(text)
    .flatMap((p) => p.split(ELLIPSIS))
    .map((p) => p.trim())
    .filter((p) => wordsIn(p) >= MIN_LOCATING_WORDS);
  if (passages.length === 0) return { editIds: [], writer: false };
  const writer = writerLeaves(output, list);
  const quoted = new Set();
  let writerQuoted = false;
  for (const passage of passages) {
    if (writer.some((leaf) => holds(leaf, passage))) { writerQuoted = true; continue; }
    const edit = list.find((e) => stringLeaves(isCut(e) ? e.before : e.after).some((leaf) => holds(leaf, passage)));
    if (edit) quoted.add(edit.id);
  }
  return { editIds: list.map((e) => e.id).filter((id) => quoted.has(id)), writer: writerQuoted };
}

/** A finding about the director's edits: the prefix and the ids, then the finding. */
function directorEditConcern(ids, text) {
  const finding = String(text == null ? '' : text);
  return finding.startsWith(DIRECTOR_EDIT_PREFIX) ? finding : `${DIRECTOR_EDIT_PREFIX}${ids.join(', ')}: ${finding}`;
}

/** The ids a finding filed under the prefix names ("Director's edit E1, E3: ..."), or none. */
function concernEditIds(text) {
  const finding = String(text == null ? '' : text);
  if (!finding.startsWith(DIRECTOR_EDIT_PREFIX)) return [];
  const m = /^((?:E\d+)(?:\s*,\s*E\d+)*)\s*:/.exec(finding.slice(DIRECTOR_EDIT_PREFIX.length));
  return m ? m[1].split(',').map((id) => id.trim()) : [];
}

/**
 * Which of the director's edits each printed piece of a bundle is, for the fact check:
 * a section's block (a block of the director's, or any block of a section the director
 * wrote whole), a field such as `headline.main` or `heroImage`, and the cut whose text
 * named a player.
 *
 * @param {Object} bundle
 * @param {Object[]} edits - the edits the bundle carries
 */
function editLocator(bundle, edits) {
  const list = (Array.isArray(edits) ? edits : []).filter(isEdit);
  const written = list.filter((e) => !isCut(e));
  const cuts = list.filter(isCut);
  return {
    /** @returns {string|null} the id of the edit this block of section `sectionId` is */
    block(sectionId, block) {
      const whole = written.find((e) => e.path === `sections[#${sectionId}]`);
      if (whole) return whole.id;
      const hit = written.find((e) => SECTION_BLOCK.test(e.path) && matchesAfter(block, e.after));
      return hit ? hit.id : null;
    },
    /** @returns {string|null} the id of the edit this field is, or is part of */
    field(path) {
      const hit = written.find((e) => (e.path === path || path.startsWith(`${e.path}.`))
        && matchesAfter(readAtPath(bundle, e.path), e.after));
      return hit ? hit.id : null;
    },
    /** @returns {string|null} the id of a cut whose text names `name` as a whole word */
    cutNaming(name) {
      const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu');
      const hit = cuts.find((e) => stringLeaves(e.before).some((leaf) => re.test(leaf)));
      return hit ? hit.id : null;
    }
  };
}

/**
 * What an edit's text became in a pass's output, or null when it is gone: a field's new
 * value; a block's partner in the output (matchBlocks, from where the block sat in the
 * version the pass started from); for a cut, the text where it came back.
 */
function becameOf(edit, before, after) {
  if (!isObj(after)) return null;
  if (isCut(edit)) return cutReturnedIn(after, edit);
  const m = INDEX_TAIL.exec(edit.path);
  if (!m) {
    const value = readAtPath(after, edit.path);
    return value === undefined || value === null ? null : editValueText(value);
  }
  const collectionPath = edit.path.slice(0, m.index);
  const paths = SECTION_CONTENT.test(collectionPath) && isObj(before)
    ? [collectionPath, ...sectionBlockPaths(before).filter((p) => p !== collectionPath)]
    : [collectionPath];
  for (const p of paths) {
    const input = readAtPath(before, p);
    const index = Array.isArray(input) ? input.findIndex((el) => matchesAfter(el, edit.after)) : -1;
    if (index === -1) continue;
    const output = readAtPath(after, p);
    if (!Array.isArray(output)) return null;
    const pair = matchBlocks(input, output).pairs.find((x) => x.bi === index);
    return pair ? editValueText(output[pair.ai]) : null;
  }
  return null;
}

/**
 * The stop's report after one more pass of the round: every edit the pass started from
 * that its output no longer carries, with the director's text, what it became (null:
 * gone), the pass (SEND_BACK_PASS or the automatic pass's number), whether an automatic
 * pass made it, and the rework's reason (null: none given). `checked` lists every id the
 * round's passes checked. The report is reset at each send-back (server.js), so it holds
 * one round.
 *
 * @param {Object|null} previous - the round's report so far
 * @param {Object} pass
 * @param {Object[]} pass.edits - the standing edits the version the pass started from carries
 * @param {Object} pass.before - that version
 * @param {Object} pass.after - the version the pass returned
 * @param {string|number} pass.pass - SEND_BACK_PASS, or the automatic pass's number
 * @param {Array<{id: string, reason: string}>} [pass.reasons] - the rework's changed edits
 * @returns {{checked: string[], changed: Object[]}|null}
 */
function reportAfterPass(previous, { edits = [], before = null, after = null, pass, reasons = [] } = {}) {
  const carried = (Array.isArray(edits) ? edits : []).filter(isEdit);
  if (carried.length === 0) return previous || null;
  const prior = handEditReportOf(previous) || { checked: [], changed: [] };
  const why = new Map((Array.isArray(reasons) ? reasons : [])
    .filter((r) => isObj(r) && typeof r.id === 'string' && typeof r.reason === 'string' && r.reason.trim())
    .map((r) => [r.id.trim(), r.reason.trim()]));
  const automatic = pass !== SEND_BACK_PASS;
  const changed = carried.filter((e) => !editCarried(after, e)).map((e) => ({
    id: e.id,
    scope: e.scope,
    cut: isCut(e),
    director: editValueText(isCut(e) ? e.before : e.after),
    became: becameOf(e, before, after),
    pass,
    automatic,
    reason: why.get(e.id) || null
  }));
  return {
    checked: [...prior.checked, ...carried.map((e) => e.id).filter((id) => !prior.checked.includes(id))],
    changed: [...prior.changed, ...changed]
  };
}

/**
 * The report as the stop sends it (server.js getCheckpointData), or null. A report
 * written before F1 named scopes, not edits, and reads as none.
 */
function handEditReportOf(value) {
  if (!isObj(value) || !Array.isArray(value.checked) || !Array.isArray(value.changed)) return null;
  if (!value.checked.every((id) => typeof id === 'string' && /^E\d+$/.test(id))) return null;
  if (!value.changed.every((c) => isObj(c) && typeof c.id === 'string')) return null;
  return value;
}

module.exports = {
  diffOutline, diffBundle, isEmpty, scopeKeys, readAtPath,
  // F1: the director's edits are final
  DIRECTOR_EDIT_PREFIX, SEND_BACK_PASS, CHANGED_EDITS_KEY,
  standingEditsOf, standingAfterSendBack, carriedEdits, formatEditLines, editValueText,
  locateQuotedText, directorEditConcern, concernEditIds, editLocator, reportAfterPass, handEditReportOf,
  _testing: { matchBlocks, blockKey, canon, same, matchesAfter, editCarried, editWhere, becameOf, sentencesOf, holdsWhole, OUTLINE_IGNORED_KEYS, MIN_LOCATING_WORDS }
};
