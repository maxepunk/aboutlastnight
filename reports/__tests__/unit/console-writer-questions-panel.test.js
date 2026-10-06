/**
 * The writer's questions on the console's screens (phase 3, brief 3.7; spec C15, D8).
 *
 * Phase 4: the questions are asked at the story meeting alone (spec section 10), through the
 * meeting's own view with an answer box on each (task 4.8). The map holds none (task 4.9), and
 * the article stop none (brief 4.7b), so the shared WriterQuestionsPanel went with its last
 * use, the desk (task 4.10), and writerQuestionsView with its last reader, the harness (task
 * 4.12a). The wiring is pinned here, on the source text, in the style of
 * console-trace-panel.test.js.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Fix 3.7b (finding 4): RevisionDiff's shallow diff walks ViewLogic.revisionDiffKeys, not
// its own union of every key. The writer's questions it once skipped went with the old
// threads the guard refuses (task 4.11).
describe('RevisionDiff walks the keys revisionDiffKeys gives', () => {
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

  // Piece 3 (brief 3B; spec 5): each question sits beside the thread its answer changes, or by the
  // pitch, so the page renders each where the view puts it, through one block with its answer box.
  it('renders each question of the meeting\'s view where it sits, with an answer box that sets the answer on its question', () => {
    ['pitch.questions.map(questionBlock)', 'thread.questions.map(questionBlock)', 'leftOut.questions.map(questionBlock)']
      .forEach((where) => expect(src).toContain(where));
    expect(count(src, 'ViewLogic.setQuestionAnswer(')).toBe(1);
  });
});

// Task 4.9: the map writer asks nothing and the map's stop sends no questions (brief 4.6), so
// the map renders no questions panel.
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
