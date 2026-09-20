/**
 * lib/hand-edit-diff.js — PURE diff of a director's hand edits (spec 2026-09-19 §4.2).
 *
 * No dependencies. Never throws: any non-object input yields an empty diff.
 *
 * Paths are dotted from the root of the object, with collection selectors in
 * brackets: `lede.hook`, `headline.main`, `sections[#intro].heading`,
 * `sections[#intro].content[2]`, `evidenceCards[#alr001]`, `pullQuotes[1]`.
 * `#` selects by id (sections.id, evidenceCards.tokenId); a bare number is an index;
 * `[-]` marks a removed item (not resolvable). readAtPath resolves the same grammar,
 * so changedScopes can check a REVISED object at exactly the places the director
 * changed — on any reviser pass, against the diff's own `after` values.
 *
 * changedScopes reads an ID-addressed change (`sections[#intro].heading`,
 * `evidenceCards[#alr001]`) and a plain field path THROUGH readAtPath, because the id
 * survives reordering. An INDEX-addressed change (`sections[#intro].content[2]`,
 * `pullQuotes[1]`, `photos[0]`) is not read at its index at all: the diff paired blocks
 * by type + a 40-character text prefix, so the index is only where the block sat in the
 * director's own object, and a reviser that inserts or removes a block ahead of it
 * shifts it. Such a change counts as KEPT when a MATCHING element exists ANYWHERE in
 * the addressed collection of the revised object (the section's `content` array, or
 * `pullQuotes` / `photos`). Removals (`after` null) stay unchecked either way.
 *
 * Equality everywhere in this module is trimmed canonical JSON: keys sorted, every
 * string trimmed at whatever depth it sits. MATCHING an `after` value adds subset
 * semantics for objects: a block, quote, card or photo counts as kept when every key
 * the director's value carries is present in the revised element with a canonically
 * equal value, so an optional field the reviser ADDED (`attribution`, `placement`,
 * `significance`, `characters`) is not a change, while a director-set field the reviser
 * dropped or altered is. Scalar and array `after` values keep exact (trimmed) equality.
 */
'use strict';

// Never walked, by construction: the bundle diff visits only the scope lists below,
// which do not name metadata, voice_self_check or _revisionHistory.
const BUNDLE_OBJECT_SCOPES = ['headline', 'byline', 'financialTracker'];
const BUNDLE_SCALAR_SCOPES = ['heroImage'];
const BUNDLE_INDEX_COLLECTIONS = ['pullQuotes', 'photos'];
const BEFORE_MAX = 300;
const AFTER_MAX = 1500;
const BLOCK_MAX = 12000;

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

function asText(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v.trim();
  return canon(v);
}

function trunc(s, max) { return s.length > max ? s.slice(0, max) + '…' : s; }

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

function formatHandEditsBlock(diff) {
  if (isEmpty(diff)) return '';
  const lines = [];
  groups(diff).forEach((g) => (g.changes || []).forEach((c) => {
    const gone = (v) => v === null || v === undefined;
    if (gone(c.before)) lines.push(`- ${c.path}: added "${trunc(asText(c.after), AFTER_MAX)}"`);
    else if (gone(c.after)) lines.push(`- ${c.path}: removed "${trunc(asText(c.before), BEFORE_MAX)}"`);
    else lines.push(`- ${c.path}: was "${trunc(asText(c.before), BEFORE_MAX)}" -> now "${trunc(asText(c.after), AFTER_MAX)}"`);
  }));
  let out = '';
  let shown = 0;
  for (const line of lines) {
    if (out.length + line.length + 1 > BLOCK_MAX) break;
    out += (out ? '\n' : '') + line;
    shown++;
  }
  if (shown < lines.length) out += `\n(… ${lines.length - shown} more changes not shown)`;
  return out;
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

/** A trailing bare-number selector: the part of a path that a reviser's insert/remove shifts. */
const INDEX_TAIL = /\[(\d+)\]$/;

/**
 * Is this change still present in `revised`?
 *
 * Index-addressed changes are searched for across the whole addressed collection
 * (see the module header); everything else is read at its path.
 */
function changeSurvives(revised, change) {
  const m = INDEX_TAIL.exec(change.path);
  if (!m) return matchesAfter(readAtPath(revised, change.path), change.after);
  const collection = readAtPath(revised, change.path.slice(0, m.index));
  if (!Array.isArray(collection)) return false;
  return collection.some((el) => matchesAfter(el, change.after));
}

/**
 * Scope keys whose edits `revised` no longer carries. Removals are not checked:
 * the director deleted the item, so there is no `after` value to look for.
 */
function changedScopes(diff, revised) {
  const out = [];
  groups(diff).forEach((g) => {
    const changed = (g.changes || []).some((c) => {
      if (c.after === null || c.after === undefined) return false;
      return !changeSurvives(revised, c);
    });
    if (changed) out.push(g.key);
  });
  return out;
}

module.exports = {
  diffOutline, diffBundle, isEmpty, scopeKeys, formatHandEditsBlock, changedScopes, readAtPath,
  _testing: { matchBlocks, blockKey, canon, same, matchesAfter, changeSurvives }
};
