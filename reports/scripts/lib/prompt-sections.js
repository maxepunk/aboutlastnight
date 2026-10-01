/**
 * The gate's prompt tools (phase 3, brief 3.0), pure so they are unit-tested
 * without files or model calls (__tests__/unit/scripts/prompt-sections.test.js).
 *
 *   scripts/render-prompts.js --sections <dirA> <dirB> -> splitRender, compareSections
 *   scripts/render-prompts.js (every render it writes)   -> renderProblems
 *
 * A top-level section is an XML-style tag that opens a line, through its matching
 * close, and the lines between them. A tag that opens a line again inside it (same
 * name) nests; any other tag inside it is part of its text. Text between top-level
 * sections is a section of its own, named after the section before it.
 */
'use strict';

/** A tag that opens a line: `<NAME>` or `<name attr="...">`. Not `</x>`, `<!--`, `<x/>`. */
const OPENING_TAG = /^<([A-Za-z][A-Za-z0-9_.:-]*)(?:\s[^<>]*)?>/;

/** The frame scripts/render-prompts.js writes around each render. */
const SYSTEM_FRAME = '===== SYSTEM =====';
const USER_FRAME = '===== USER =====';

const PROMISE_TEXT = '[object Promise]';

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The tag a line opens, or null. A self-closing tag (`<x/>`) opens nothing. */
function openingTagOf(line) {
  const m = OPENING_TAG.exec(line);
  if (!m || /\/>$/.test(m[0])) return null;
  return { name: m[1], length: m[0].length };
}

/**
 * Split a text into its top-level sections, in reading order.
 *
 * @param {string} text
 * @param {number} [firstLine=1] - the file line number of the text's first line
 * @returns {Array<{key: string, name: string|null, kind: 'section'|'text'|'unclosed', text: string, line: number}>}
 *   `section`: a closed tag, `name` its tag name, `key` `<NAME>`.
 *   `text`: lines outside any tag, `key` `(text at start)` or `(text after <PREV>)`;
 *     a run of blank lines alone is not kept.
 *   `unclosed`: a tag that opens a line and is never closed. Its entry holds only
 *     that line; the lines after it are read on as if it were text, so nothing is
 *     dropped and a later section is still found.
 *   A key that repeats gets `#2`, `#3`, ...
 */
function splitSections(text, firstLine = 1) {
  const lines = String(text).split('\n');
  const raw = [];
  let pending = [];
  let pendingStart = 0;

  const flushText = () => {
    if (pending.some((l) => l.trim())) raw.push({ name: null, kind: 'text', text: pending.join('\n'), line: firstLine + pendingStart });
    pending = [];
  };

  let i = 0;
  while (i < lines.length) {
    const tag = openingTagOf(lines[i]);
    if (!tag) {
      if (pending.length === 0) pendingStart = i;
      pending.push(lines[i]);
      i++;
      continue;
    }
    const close = new RegExp(`</${escapeRegExp(tag.name)}>`, 'g');
    const countCloses = (s) => (s.match(close) || []).length;
    let depth = 1 - countCloses(lines[i].slice(tag.length));
    let end = i;
    while (depth > 0 && end + 1 < lines.length) {
      end++;
      const inner = openingTagOf(lines[end]);
      if (inner && inner.name === tag.name) depth++;
      depth -= countCloses(lines[end]);
    }
    flushText();
    if (depth <= 0) {
      raw.push({ name: tag.name, kind: 'section', text: lines.slice(i, end + 1).join('\n'), line: firstLine + i });
      i = end + 1;
    } else {
      raw.push({ name: tag.name, kind: 'unclosed', text: lines[i], line: firstLine + i });
      i++;
    }
  }
  flushText();

  const seen = new Map();
  let previous = null;
  return raw.map((entry) => {
    let base;
    if (entry.kind === 'section') base = `<${entry.name}>`;
    else if (entry.kind === 'unclosed') base = `<${entry.name}> (unclosed)`;
    else base = previous ? `(text after ${previous})` : '(text at start)';
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = n === 1 ? base : `${base}#${n}`;
    if (entry.kind !== 'text') previous = key;
    return { key, ...entry };
  });
}

/**
 * Split one render file. A file with the SYSTEM / USER frame is split part by part,
 * each key prefixed with its part, so a section that moves between the system and
 * the user prompt shows as moved. Line numbers stay the file's.
 *
 * @param {string} text
 * @returns {Array} as splitSections
 */
function splitRender(text) {
  const lines = String(text).split('\n');
  const sys = lines.indexOf(SYSTEM_FRAME);
  const usr = lines.indexOf(USER_FRAME);
  if (sys !== 0 || usr < 0) return splitSections(text);
  const part = (label, from, to) => splitSections(lines.slice(from, to).join('\n'), from + 1)
    .map((entry) => ({ ...entry, key: `${label} ${entry.key}` }));
  return [...part('SYSTEM', sys + 1, usr), ...part('USER', usr + 1, lines.length)];
}

/**
 * Compare two renders section by section.
 *
 * @param {string} textA
 * @param {string} textB
 * @returns {{rows: Array<{key: string, status: 'same'|'differs'|'only-a'|'only-b', sizeA: number|null, sizeB: number|null}>,
 *   differences: number, unclosed: Array<{side: 'A'|'B', key: string, line: number}>}}
 *   Rows run in A's order. A section only B has goes after the shared section B has
 *   before it, and after any section only A has there, as a diff puts a removal
 *   before an addition. Sizes are UTF-8 bytes.
 */
function compareSections(textA, textB) {
  const a = splitRender(textA);
  const b = splitRender(textB);
  const byKeyA = new Map(a.map((e) => [e.key, e]));
  const byKeyB = new Map(b.map((e) => [e.key, e]));

  const order = a.map((e) => e.key);
  let after = -1;
  for (const e of b) {
    const found = order.indexOf(e.key);
    if (found >= 0) { after = found; continue; }
    let at = after + 1;
    while (at < order.length && !byKeyB.has(order[at])) at++;
    order.splice(at, 0, e.key);
    after = at;
  }

  const size = (e) => (e ? Buffer.byteLength(e.text, 'utf8') : null);
  const rows = order.map((key) => {
    const ea = byKeyA.get(key);
    const eb = byKeyB.get(key);
    const status = !eb ? 'only-a' : !ea ? 'only-b' : ea.text === eb.text ? 'same' : 'differs';
    return { key, status, sizeA: size(ea), sizeB: size(eb) };
  });
  const unclosed = [
    ...a.filter((e) => e.kind === 'unclosed').map((e) => ({ side: 'A', key: e.key, line: e.line })),
    ...b.filter((e) => e.kind === 'unclosed').map((e) => ({ side: 'B', key: e.key, line: e.line }))
  ];
  return { rows, differences: rows.filter((r) => r.status !== 'same').length, unclosed };
}

/**
 * What is wrong with one render, before any scan of it can be trusted.
 *
 * @param {string} file - the file name, for the messages
 * @param {*} systemPrompt - the system prompt as the builder returned it
 * @param {*} userPrompt - the user prompt as the builder returned it
 * @param {string[]|undefined} markers - the file's required markers; each must open a
 *   line, so a prose reference ("in <RECORD>") does not count
 * @returns {string[]} one message per problem, each naming the file; [] when sound
 */
function renderProblems(file, systemPrompt, userPrompt, markers) {
  const problems = [];
  const isEmpty = (part) => typeof part !== 'string' || !part.trim();
  if (isEmpty(systemPrompt)) problems.push(`${file}: the system prompt is empty`);
  if (isEmpty(userPrompt)) problems.push(`${file}: the user prompt is empty`);
  const text = `${String(systemPrompt)}\n${String(userPrompt)}`;
  if (text.includes(PROMISE_TEXT)) {
    problems.push(`${file}: contains "${PROMISE_TEXT}" (a builder returned a promise that was not awaited)`);
  }
  if (!Array.isArray(markers) || markers.length === 0) {
    problems.push(`${file}: has no required marker in the table`);
    return problems;
  }
  const lines = text.split('\n');
  for (const marker of markers) {
    if (!lines.some((line) => line.startsWith(marker))) {
      problems.push(`${file}: missing its marker "${marker}" (no line opens with it)`);
    }
  }
  return problems;
}

module.exports = {
  splitSections,
  splitRender,
  compareSections,
  renderProblems
};
