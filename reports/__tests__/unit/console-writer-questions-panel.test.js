/**
 * The writer's questions panel at the arc, outline and article stops (phase 3, brief
 * 3.7; spec C15, D8).
 *
 * The console has no DOM harness, so the panel's logic is pinned in
 * console/__tests__/checkpoint-view-logic.test.js (writerQuestionsView) and its wiring
 * here, on the source text, in the style of console-trace-panel.test.js: each stop
 * reads the payload's `writerQuestions` through ViewLogic.writerQuestionsView and
 * renders the shared WriterQuestionsPanel once, above the output.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

describe('the panel is shared from utils.js', () => {
  const src = read('utils.js');

  it('defines WriterQuestionsPanel and publishes it on window.Console.utils', () => {
    expect(src).toMatch(/function WriterQuestionsPanel\(\{ view \}\)/);
    const exported = src.slice(src.indexOf('window.Console.utils = {'));
    expect(exported).toMatch(/\bWriterQuestionsPanel,/);
  });

  it('renders nothing for a view with no questions, and folds away', () => {
    const fn = src.slice(src.indexOf('function WriterQuestionsPanel('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/if \(!view \|\| !view\.any\) return null;/);
    expect(body).toMatch(/React\.createElement\(CollapsibleSection, \{ title: view\.title, defaultOpen: true \}/);
    expect(body).toMatch(/item\.about/);
    expect(body).toMatch(/item\.question/);
  });
});

describe.each([
  ['ArcSelection', 'components/checkpoints/ArcSelection.js', /React\.createElement\('div', \{ className: 'arc-grid' \}/],
  ['Outline', 'components/checkpoints/Outline.js', /\.\.\.renderOutlineSections\(\)/],
  ['Article', 'components/checkpoints/Article.js', /React\.createElement\(FactCheckPanel, /]
])('the %s stop renders the panel', (_name, rel, output) => {
  const src = read(rel);

  it('destructures WriterQuestionsPanel from utils at load time', () => {
    const line = src.split('\n').find((l) => l.includes('= window.Console.utils;'));
    expect(line).toMatch(/\bWriterQuestionsPanel\b/);
  });

  it('builds the panel model from the payload key through the view logic', () => {
    expect(count(src, 'ViewLogic.writerQuestionsView(data && data.writerQuestions)')).toBe(1);
  });

  it('renders the panel once, above the output', () => {
    expect(count(src, 'React.createElement(WriterQuestionsPanel, { view: writerQuestions })')).toBe(1);
    const panelAt = src.indexOf('React.createElement(WriterQuestionsPanel, { view: writerQuestions })');
    const outputAt = src.search(output);
    expect(outputAt).toBeGreaterThan(-1);
    expect(panelAt).toBeLessThan(outputAt);
    const evalAt = src.indexOf('React.createElement(EvalBar, { view: evaluation })');
    expect(panelAt).toBeGreaterThan(evalAt);
  });
});
