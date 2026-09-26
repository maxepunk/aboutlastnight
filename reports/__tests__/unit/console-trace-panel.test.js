/**
 * The trace panel's wiring at the outline and article stops (phase 2, brief 2.7).
 *
 * The console has no DOM harness, so the panel's logic is pinned in
 * console/__tests__/checkpoint-view-logic.test.js (traceView) and its wiring here, on
 * the source text, in the style of console-edit-gates.test.js: each stop reads the
 * payload's `trace` through ViewLogic.traceView and renders the shared TracePanel
 * once, after the evaluation bar, as the brief places it.
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

  it('builds the panel model from the payload key through the view logic', () => {
    expect(count(src, 'ViewLogic.traceView(data && data.trace)')).toBe(1);
  });

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
