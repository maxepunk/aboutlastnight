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

  // Fix 3.7b (finding 1): each line shows the question's kind before what it is about.
  it('shows the kind, when the question has one, before what it is about', () => {
    const fn = src.slice(src.indexOf('function WriterQuestionsPanel('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/item\.kindLabel && React\.createElement\('span', \{ className: 'writer-questions__kind' \}, item\.kindLabel\)/);
    expect(body.indexOf('item.kindLabel')).toBeLessThan(body.indexOf('item.about'));
  });
});

// Fix 3.7b (finding 4): RevisionDiff's shallow diff walks ViewLogic.revisionDiffKeys,
// which skips writerQuestions (pinned in checkpoint-view-logic.test.js), not its own
// union of every key.
describe('RevisionDiff skips the questions in its key walk', () => {
  const src = read('components/RevisionDiff.js');

  it('walks the keys revisionDiffKeys returns', () => {
    const fn = src.slice(src.indexOf('function shallowDiff('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toMatch(/const allKeys = ViewLogic\.revisionDiffKeys\(previous, current\);/);
    expect(body).not.toMatch(/new Set\(/);
  });
});

// Task 3.11: each stop names itself, so the panel's hint says what an answer does there
// (checkpoint-view-logic.test.js pins the three hints). Task 4.8: the story meeting shows
// its questions through its own view, each with its answer box (the describe below), so
// the arc stop's row went with the arc cards it was placed above.
describe.each([
  ['Outline', 'components/checkpoints/Outline.js', 'outline', /\.\.\.renderOutlineSections\(\)/],
  ['Article', 'components/checkpoints/Article.js', 'article', /React\.createElement\(FactCheckPanel, /]
])('the %s stop renders the panel', (_name, rel, stop, output) => {
  const src = read(rel);

  it('destructures WriterQuestionsPanel from utils at load time', () => {
    const line = src.split('\n').find((l) => l.includes('= window.Console.utils;'));
    expect(line).toMatch(/\bWriterQuestionsPanel\b/);
  });

  it('builds the panel model from the payload key through the view logic, naming its stop', () => {
    expect(count(src, `ViewLogic.writerQuestionsView(data && data.writerQuestions, '${stop}')`)).toBe(1);
    expect(count(src, 'ViewLogic.writerQuestionsView(')).toBe(1);
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

// Task 4.8: the story meeting asks its questions through its own view (meetingView's
// questions, each with its answer box), never through the shared panel, whose hint tells
// the director to answer in the note.
describe('4.8: the story meeting shows its questions through its own view', () => {
  const src = read('components/checkpoints/ArcSelection.js');

  it('reads neither the shared panel nor its view model', () => {
    expect(src).not.toMatch(/WriterQuestionsPanel/);
    expect(src).not.toMatch(/writerQuestionsView/);
    expect(src).not.toMatch(/data\.writerQuestions/);
  });

  it('renders each question of the meeting\'s view with an answer box that sets the answer on its question', () => {
    expect(src).toMatch(/view\.questions\.map\(/);
    expect(count(src, 'ViewLogic.setQuestionAnswer(')).toBe(1);
  });
});
