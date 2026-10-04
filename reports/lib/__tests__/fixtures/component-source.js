/**
 * A console component read in a node test (phase 4, task 4.12d). The console has no DOM harness,
 * so a test that holds the server's or the harness's copy of a screen's text to the screen reads
 * the component itself:
 * - rendersHeading: whether a component's source renders a text as a heading;
 * - loadInputReview: InputReview.js run with a React that builds a tree of its elements, so a test
 *   reads the text the input review renders (elementsOf, textOf).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a component renders `heading` as a heading: the text of an h1 to h6, of a p whose class
 * names it a label or a title (`__label`, `__title`), or a CollapsibleSection's title, whole or
 * with a count after it ("Quote Bank (3)"). A string anywhere else in the source is no heading:
 * an aria-label, which a screen reader reads and the screen does not print, a field's label, a
 * line's own words.
 *
 * @param {string} src - the component's source
 * @param {string} heading
 * @returns {boolean}
 */
function rendersHeading(src, heading) {
  const text = `'${escape(heading)}(?:'| \\()`;
  const element = new RegExp(`React\\.createElement\\('(h[1-6]|p)', \\{([^{}]*)\\},\\s*${text}`, 'g');
  for (const match of src.matchAll(element)) {
    if (match[1] !== 'p' || /className: '[^']*__(?:label|title)\b/.test(match[2])) return true;
  }
  return new RegExp(`CollapsibleSection, \\{\\s*title: ${text}`).test(src);
}

/** console/utils.js's safeStringify, read from the console's source. */
function consoleSafeStringify() {
  const src = fs.readFileSync(path.join(ROOT, 'console', 'utils.js'), 'utf8');
  const fn = src.match(/function safeStringify\(obj, indent = 2\) \{[\s\S]*?\n\}/);
  if (!fn) throw new Error('console/utils.js no longer defines safeStringify(obj, indent = 2)');
  return new Function(`${fn[0]}\nreturn safeStringify;`)();
}

/**
 * InputReview.js's EnrichmentPanel and InputReview, run with a React whose createElement returns
 * `{type, props, children}` (a component it is given stays a node, uncalled) and whose hooks hold
 * their first value, and with the console's own modules for the globals the file reads.
 *
 * @returns {{EnrichmentPanel: Function, InputReview: Function}}
 */
function loadInputReview() {
  const src = fs.readFileSync(path.join(ROOT, 'console', 'components', 'checkpoints', 'InputReview.js'), 'utf8');
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: (initial) => [initial, () => {}],
    useEffect: () => {}
  };
  const window = {
    Console: {
      utils: { Badge: 'Badge', CollapsibleSection: 'CollapsibleSection', safeStringify: consoleSafeStringify() },
      inputReviewLogic: require('../../../console/input-review-logic'),
      awaitRosterLogic: require('../../../console/await-roster-logic'),
      checkpointViewLogic: require('../../../console/checkpoint-view-logic')
    }
  };
  return new Function('window', 'React', `${src}\nreturn { EnrichmentPanel, InputReview };`)(window, React);
}

/** The text a rendered node shows: its strings and numbers, its children's in order. */
function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return node && typeof node === 'object' ? textOf(node.children) : '';
}

/** The elements of a rendered tree that `test` takes, in document order. */
function elementsOf(node, test, found = []) {
  if (Array.isArray(node)) node.forEach((child) => elementsOf(child, test, found));
  else if (node && typeof node === 'object') {
    if (test(node)) found.push(node);
    elementsOf(node.children, test, found);
  }
  return found;
}

module.exports = { rendersHeading, consoleSafeStringify, loadInputReview, textOf, elementsOf };
