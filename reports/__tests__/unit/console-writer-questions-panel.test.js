/**
 * The writer's questions on the console's screens (phase 3, brief 3.7; spec C15, D8).
 *
 * Phase 4: the questions are asked at the story meeting alone (spec section 10), through the
 * meeting's own view with an answer box on each (task 4.8). The map holds none (task 4.9), and
 * the article stop none (brief 4.7b), so the shared WriterQuestionsPanel went with its last
 * use, the desk (task 4.10). writerQuestionsView stays for the harness (task 4.12); its logic
 * is pinned in console/__tests__/checkpoint-view-logic.test.js, and the wiring here, on the
 * source text, in the style of console-trace-panel.test.js.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

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

// Task 4.9: the map writer asks nothing and the map's stop sends no questions (brief 4.6), so
// the map renders no questions panel. writerQuestionsView stays for the harness (4.12).
describe('4.9: the map renders no questions panel', () => {
  it('reads neither the shared panel nor its view model nor a questions key', () => {
    const src = read('components/checkpoints/Outline.js');
    expect(src).not.toMatch(/WriterQuestionsPanel|writerQuestionsView|writerQuestions/);
  });
});

// Task 4.10: the article stop holds no questions (brief 4.7b), and it was the shared panel's
// last use, so the panel went with it. The desk names neither the panel nor a questions key.
describe('4.10: the desk renders no questions panel, and utils.js defines none', () => {
  it('the desk reads neither the panel nor its view model nor a questions key', () => {
    const src = read('components/checkpoints/Article.js');
    expect(src).not.toMatch(/WriterQuestionsPanel|writerQuestionsView|writerQuestions/);
  });

  it('utils.js neither defines nor publishes the panel, and its styles went with it', () => {
    const utils = read('utils.js');
    expect(utils).not.toMatch(/WriterQuestionsPanel/);
    expect(read('console.css')).not.toMatch(/.writer-questions/);
  });
});
