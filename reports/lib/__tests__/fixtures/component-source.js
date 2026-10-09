/**
 * A console component read in a node test (phase 4, task 4.12d). The console has no DOM harness,
 * so a test that holds the server's or the harness's copy of a screen's text to the screen reads
 * the component itself:
 * - rendersHeading: whether a component's source renders a text as a heading;
 * - loadInputReview: InputReview.js run with a React that builds a tree of its elements, so a test
 *   reads the text the input review renders (elementsOf, textOf);
 * - elementsOf and textOf, the one way the input review's, the story meeting's and the map's tests
 *   read such a tree (phase 4b, fix round 3): an element with whether a fold holds it, and the
 *   text a node shows as the page first opens.
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
 * InputReview.js's EnrichmentPanel, LedgerPanel and InputReview, run with a React whose createElement returns
 * `{type, props, children}` (a component it is given stays a node, uncalled) and whose hooks hold
 * their first value, and with the console's own modules for the globals the file reads.
 *
 * @returns {{EnrichmentPanel: Function, InputReview: Function, LedgerPanel: Function}}
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
  return new Function('window', 'React', `${src}\nreturn { EnrichmentPanel, InputReview, LedgerPanel };`)(window, React);
}

/**
 * The components a test's React keeps as nodes, uncalled, whose text is a prop: the fold a page
 * folds its content in, and a badge.
 */
const FOLD = 'CollapsibleSection';
const BADGE = 'Badge';

/**
 * The text a rendered node shows as the page first opens, its children's in order: its strings
 * and numbers, a field's value, a select's chosen option, a badge's label and a fold's title, never
 * what a fold holds.
 */
function textOf(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node || typeof node !== 'object') return '';
  if (node.type === FOLD) return String(node.props.title || '');
  if (node.type === BADGE) return String(node.props.label || '');
  if (node.type === 'textarea' || node.type === 'input') return String(node.props.value || '');
  if (node.type === 'select') {
    const chosen = elementsOf(node.children, (n) => n.type === 'option').find((option) => option.props.value === node.props.value);
    return chosen ? textOf(chosen.children) : '';
  }
  return textOf(node.children);
}

/**
 * The elements of a rendered tree that `test` takes, in document order. `test` gets each element
 * and whether a fold holds it, so a test can tell what shows as the page first opens.
 */
function elementsOf(node, test, found = [], folded = false) {
  if (Array.isArray(node)) node.forEach((child) => elementsOf(child, test, found, folded));
  else if (node && typeof node === 'object') {
    if (test(node, folded)) found.push(node);
    elementsOf(node.children, test, found, folded || node.type === FOLD);
  }
  return found;
}

module.exports = { rendersHeading, consoleSafeStringify, loadInputReview, textOf, elementsOf, FOLD };
