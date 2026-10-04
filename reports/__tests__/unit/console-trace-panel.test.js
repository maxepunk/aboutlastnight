/**
 * The trace panel's wiring at the outline and article stops (phase 2, brief 2.7).
 *
 * The console has no DOM harness, so the panel's logic is pinned in
 * console/__tests__/checkpoint-view-logic.test.js (traceView) and its wiring here, on
 * the source text, in the style of console-edit-gates.test.js: each stop reads the
 * payload's `trace` through ViewLogic.traceView and renders the shared TracePanel
 * once: the article stop after its evaluation bar, as the brief places it, and the map
 * (task 4.9) folded below itself.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('the trace panel is shared from utils.js', () => {
  const src = read('utils.js');

  it('defines TracePanel and publishes it on window.Console.utils', () => {
    expect(src).toMatch(/function TracePanel\(\{ view \}\)/);
    const exported = src.slice(src.indexOf('window.Console.utils = {'));
    expect(exported).toMatch(/\bTracePanel,/);
  });
});

describe.each([
  ['Outline', 'components/checkpoints/Outline.js'],
  ['Article', 'components/checkpoints/Article.js']
])('the %s stop renders the trace', (name, rel) => {
  const src = read(rel);

  it('destructures TracePanel from utils at load time', () => {
    const line = src.split('\n').find((l) => l.includes('= window.Console.utils;'));
    expect(line).toMatch(/\bTracePanel\b/);
  });

  // Final review (reworks[0]): the view labels the evaluation's guidance by whether the
  // rework was given it, which depends on the theme, so each stop passes its theme prop.
  it('builds the panel model from the payload key and the stop\'s theme through the view logic', () => {
    expect(count(src, 'ViewLogic.traceView(data && data.trace, theme)')).toBe(1);
  });
});

describe('the article stop renders the trace right after the evaluation bar', () => {
  const src = read('components/checkpoints/Article.js');

  it('renders the panel once, right after the evaluation bar', () => {
    expect(count(src, 'React.createElement(TracePanel, { view: trace })')).toBe(1);
    const evalAt = src.indexOf('React.createElement(EvalBar, { view: evaluation })');
    const traceAt = src.indexOf('React.createElement(TracePanel, { view: trace })');
    expect(evalAt).toBeGreaterThan(-1);
    expect(traceAt).toBeGreaterThan(evalAt);
    // Nothing else is rendered between them.
    expect(src.slice(evalAt, traceAt).match(/React\.createElement\(/g)).toHaveLength(1);
  });
});

// Task 4.9: the map has no evaluation bar (no judge reads the map, brief 4.6), and its trace
// is folded below the map, after the note box and the buttons.
describe('the map folds the trace below itself', () => {
  const src = read('components/checkpoints/Outline.js');

  it('renders the panel once, folded, after the buttons', () => {
    expect(count(src, 'React.createElement(TracePanel, { view: trace })')).toBe(1);
    const foldAt = src.indexOf('React.createElement(CollapsibleSection, { title: trace.title }');
    const buttonsAt = src.indexOf("className: 'action-modes mt-md'");
    expect(buttonsAt).toBeGreaterThan(-1);
    expect(foldAt).toBeGreaterThan(buttonsAt);
    expect(src.indexOf('React.createElement(TracePanel, { view: trace })')).toBeGreaterThan(foldAt);
  });
});
