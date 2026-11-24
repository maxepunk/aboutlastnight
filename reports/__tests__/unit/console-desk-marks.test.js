/**
 * 4.10: the desk's marks, wired (phase 4, brief 4.10; spec 6.2 and 6.3).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so the marks' logic is pinned in
 * console/__tests__/checkpoint-view-logic-desk.test.js and their wiring here, on the source
 * text, in the style of console-map-screen.test.js: Article.js builds the desk's model from
 * the view logic once per change, renders each mark in the row of the piece it is about,
 * lists a mark with no piece in one line beside the approve button, shows the settled story
 * above the headline, and folds below the article what the automatic passes did. Nothing sits
 * in front of the article: no evaluation bar, no score and no questions panel.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');
const count = (haystack, needle) => haystack.split(needle).length - 1;

describe('4.10: Article.js renders the desk from the view logic', () => {
  const src = read('components/checkpoints/Article.js');

  it('builds the desk once per change, from the stop\'s payload and the bundle on the desk', () => {
    expect(count(src, 'ViewLogic.deskView(')).toBe(1);
    expect(src).toMatch(/React\.useMemo\(function \(\) \{\s*return ViewLogic\.deskView\(data, editedBundle \|\| contentBundle\);\s*\}, \[data, editedBundle\]\)/);
  });

  it('every row carries the marks of its piece, rendered under the piece and never over it', () => {
    const row = src.slice(src.indexOf('function deskRow('));
    const body = row.slice(0, row.indexOf('\n  }\n'));
    expect(body).toContain('function deskRow(key, className, body, onEdit, controls, marks)');
    expect(body).toContain("React.createElement('div', { className: 'desk-row__body' }, body, deskMarksList(marks))");
    [
      "marksAt({ kind: 'block', section: sectionIdx, block: blockIdx })",
      "marksAt({ kind: 'heading', section: sectionIdx })",
      "marksAt({ kind: 'headline' })",
      "marksAt({ kind: 'byline' })",
      "marksAt({ kind: 'hero' })",
      "marksAt({ kind: 'sidebar', index: idx })"
    ].forEach((call) => expect(`${call} ${src.includes(call)}`).toBe(`${call} true`));
    expect(src).toContain('return ViewLogic.deskMarksAt(desk.marks, anchor);');
  });

  it('a piece open in its editor keeps its marks under the editor: a block, a heading, a sidebar card, the hero, the headline, the byline', () => {
    const block = src.slice(src.indexOf('function renderBlock('), src.indexOf('function renderSectionHeading('));
    expect(block).toMatch(/withMarks\('edit-' \+ sectionIdx \+ '-' \+ blockIdx, React\.createElement\(BlockEditor, \{[\s\S]*?\}\), marks\)/);
    // Task 4.14g: between the editor and its marks, the line saying the desk's other controls wait
    // for it; and a tracker row's editor, which has no marks, renders through withMarks for that line.
    const helper = src.slice(src.indexOf('function withMarks('));
    expect(helper.slice(0, helper.indexOf('\n  }\n'))).toContain('React.createElement(React.Fragment, { key: key }, editor, heldLine(editHeld), deskMarksList(marks))');
    expect(count(src, 'withMarks(')).toBe(8);
  });

  it('shows the settled story above the headline, with no thesis of the old outline', () => {
    const echoAt = src.indexOf('desk.echo && React.createElement(');
    expect(echoAt).toBeGreaterThan(-1);
    expect(echoAt).toBeLessThan(src.indexOf('renderHeadline(),'));
    expect(src).not.toMatch(/outlineThesis|thesisField|THESIS/);
  });

  it('lists a mark with no piece to sit beside in one line each, right before the approve button', () => {
    const apartAt = src.indexOf('desk.apart.any && React.createElement(');
    const buttonsAt = src.indexOf("className: 'action-modes mt-md'");
    expect(apartAt).toBeGreaterThan(-1);
    expect(apartAt).toBeLessThan(buttonsAt);
    expect(src.slice(apartAt, buttonsAt).match(/React\.createElement\(/g).length).toBeLessThanOrEqual(4);
  });

  it('folds below the article, after the buttons, what the automatic passes did: the possibly resolved, the fact check, the trace and the round', () => {
    const buttonsAt = src.indexOf("className: 'action-modes mt-md'");
    [
      'React.createElement(CollapsibleSection, { title: desk.folds.resolved.title }',
      'React.createElement(CollapsibleSection, { title: desk.folds.factCheck.title }',
      'React.createElement(CollapsibleSection, { title: trace.title }',
      'React.createElement(CollapsibleSection, { title: desk.folds.rounds.title }'
    ].forEach((fold) => {
      expect(`${fold} ${count(src, fold)}`).toBe(`${fold} 1`);
      expect(src.indexOf(fold)).toBeGreaterThan(buttonsAt);
    });
    expect(src.indexOf('React.createElement(RevisionDiff, {')).toBeGreaterThan(src.indexOf('title: desk.folds.rounds.title'));
    expect(src.indexOf('React.createElement(FactCheckPanel, {')).toBeGreaterThan(src.indexOf('title: desk.folds.factCheck.title'));
  });

  it('puts nothing in front of the article: no evaluation bar, no score and no questions panel', () => {
    ['EvalBar', 'evaluationView', 'lastEvaluationFrom', 'WriterQuestionsPanel', 'writerQuestionsView', 'overallScore']
      .forEach((gone) => expect(`${gone}: ${src.includes(gone)}`).toBe(`${gone}: false`));
    const main = src.slice(src.indexOf("return React.createElement('div', { className: 'flex flex-col gap-md' },"));
    const heroAt = main.indexOf('renderHeroImage(),');
    expect(heroAt).toBeGreaterThan(-1);
    ['RevisionDiff', 'TracePanel', 'FactCheckPanel', 'CollapsibleSection'].forEach((panel) => {
      expect(`${panel} before the article: ${main.slice(0, heroAt).includes(panel)}`).toBe(`${panel} before the article: false`);
    });
  });

  it("the approve button's count stays structural only, from the fact check's summary", () => {
    expect(src).toContain('ViewLogic.approveLabel(desk.folds.factCheck.summary, hasEdits)');
  });
});

describe('4.10: utils.js keeps no evaluation bar, and the trace panel no scores', () => {
  const src = read('utils.js');

  it('defines and publishes neither the evaluation bar nor the questions panel', () => {
    expect(src).not.toMatch(/EvalBar|WriterQuestionsPanel/);
    const exported = src.slice(src.indexOf('window.Console.utils = {'));
    expect(exported).toMatch(/\bTracePanel,/);
  });

  it('the trace panel renders no scores', () => {
    const panel = src.slice(src.indexOf('function TracePanel('), src.indexOf('function editBtn('));
    expect(panel).not.toMatch(/criteria|Scores/);
  });
});

describe("4.10: the desk's styles", () => {
  const css = read('console.css');

  it("the marks have their own section, and the evaluation bar's, the questions panel's and the thesis echo's styles went with them", () => {
    expect(css).toContain("/* ── 4.10: the desk's marks ──");
    const marks = css.slice(css.indexOf("/* ── 4.10: the desk's marks ──"));
    ['.desk-marks', '.desk-mark--judge', '.desk-mark--structural', '.desk-mark--concern', '.desk-mark--changed', '.desk-mark--advisory', '.desk-echo', '.desk-apart', '.desk-resolved']
      .forEach((rule) => expect(`${rule}: ${marks.includes(rule)}`).toBe(`${rule}: true`));
    ['.eval-bar', '.writer-questions', '.article-thesis-echo'].forEach((gone) => expect(`${gone}: ${css.includes(gone)}`).toBe(`${gone}: false`));
  });
});

// 4.10c: the round's record folded below the article says the director's edits stand in the
// words the map and the meeting print (steeringView's `kept`, which is editsStandLine), so
// RevisionDiff composes no line of its own about them.
describe("4.10c: the folded record says the edits stand, in steeringView's words", () => {
  const src = read('components/RevisionDiff.js');

  it("prints steeringView's `kept`, and no wording of its own about the edits a rework kept", () => {
    expect(src).toContain('steering.kept && React.createElement(');
    expect(src).not.toMatch(/kept all|keptCount/);
  });
});

// Phase 18, brief S: the desk says what a send-back acts on, and an advisory mark's "Add to note"
// button adds its line to the note box. The lines and the rules are checkpoint-view-logic.js's,
// pinned in console/__tests__/checkpoint-view-logic-desk.test.js; here, that Article.js renders them
// and that a press changes the note as typing does. The click-through is the integrator's.
describe("brief S: Article.js wires the note's button and the send-back's lines", () => {
  const src = read('components/checkpoints/Article.js');
  const body = (name) => {
    const from = src.slice(src.indexOf(`function ${name}(`));
    return from.slice(0, from.indexOf('\n  }\n'));
  };
  const noteBox = src.slice(src.indexOf("htmlFor: 'article-note'"), src.indexOf("id: 'article-note'"));

  it("every list of marks is drawn inside the desk, where the note is, once: beside a piece, apart and in the resolved fold", () => {
    expect(count(src, 'function deskMarksList(')).toBe(1);
    expect(src.indexOf('function deskMarksList(')).toBeGreaterThan(src.indexOf('function Article('));
    expect(body('deskMarksList')).toContain('ViewLogic.deskNoteButton(mark, feedbackText)');
    // Run 2g: the list apart prints each mark's where, which names the line of a concern no longer on the desk.
    expect(src).toContain('deskMarksList(desk.apart.items, true)');
    expect(src).toContain('deskMarksList(desk.folds.resolved.items, true)');
  });

  it('the button reads as the view says, waits while the note holds its line, and a press adds the line as typing would, disarming the send-back', () => {
    const list = body('deskMarksList');
    expect(list).toContain('disabled: button.inNote');
    expect(list).toContain('button.label');
    expect(list).toContain('e.stopPropagation(); addToNote(button);');
    const add = body('addToNote');
    expect(add).toContain('if (button.inNote) return;');
    expect(add).toContain('setFeedbackText(ViewLogic.noteWithLine(feedbackText, button.line));');
    expect(add).toContain('setSendBackArmed(false);');
  });

  it('under the note box\'s line, the line on what a send-back acts on, then the changed line on the hand edits', () => {
    const existing = noteBox.indexOf('With Approve it stands for every later writer.');
    expect(count(src, 'const scopeLine = ViewLogic.sendBackScopeLine(desk.marks);')).toBe(1);
    const scope = noteBox.indexOf("scopeLine && React.createElement('p', { className: 'text-xs text-muted' }, scopeLine)");
    const edits = noteBox.indexOf('hasEdits && React.createElement(');
    expect([existing > -1, scope > existing, edits > scope]).toEqual([true, true, true]);
    expect(noteBox).toContain('ViewLogic.DESK_HAND_EDITS_LINE');
    expect(src).not.toContain("'Your hand edits are sent with this note. The writer is told to keep them.'");
  });

  it('the button has its style in the marks\' section', () => {
    const css = read('console.css');
    const marks = css.slice(css.indexOf("/* ── 4.10: the desk's marks ──"));
    expect(marks).toContain('.desk-mark__add');
  });
});
