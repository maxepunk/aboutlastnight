/**
 * The hand-edit validation gate is ONE source of truth per checkpoint file.
 *
 * Review fix round 1, findings 1 + 2: `handleReject` was added by copying
 * `handleApprove`'s validate-and-report block character for character (Article.js
 * even had the helper already and re-implemented it inline). Two copies of a gate
 * drift: the approve path and the reject path would start accepting different
 * edits, and the one that drifts loose is the one that ships an invalid map or
 * bundle to the server. So each file gets exactly one gate, and every handler
 * reaches it: the desk's `gateEdits` helper, and the map's one send path (task 4.9).
 *
 * Finding 5: the article gate's thesis echo rendered `outlineThesis.hook` raw,
 * unlike every sibling renderer in that file — a non-string field (a number or an
 * object from an older/edited outline) is a React render throw on a read-only
 * panel. It renders through a string-or-'(empty)' guard. Task 4.10: the echo shows
 * the settled story and its question, which the view logic's deskEcho returns as
 * text, so the guard is the view's (pinned in checkpoint-view-logic-desk.test.js).
 *
 * The console has no DOM harness (reports/CLAUDE.md), so these are source
 * contracts — the right shape for a defect that IS a duplicated block.
 */
const fs = require('fs');
const path = require('path');

const CONSOLE_DIR = path.join(__dirname, '..', '..', 'console');
const read = (rel) => fs.readFileSync(path.join(CONSOLE_DIR, rel), 'utf8');

/** Count occurrences of `needle` in `haystack`. */
function count(haystack, needle) {
  return haystack.split(needle).length - 1;
}

// Phase 4, task 4.9: the outline stop is the map. Its one gate is the view logic's
// mapProblems, the gate's decisions (lib/map.js directorMapProblems, held equal by a test),
// called from the one send path that Approve and Send back both take, on the map on screen,
// edited or not. The map has no JSON editor, so there is no second gate to drift.
describe('Outline.js holds the map to the gate in one place', () => {
  const src = read('components/checkpoints/Outline.js');
  const send = src.slice(src.indexOf('function send(action)'), src.indexOf('function handleSendBackClick('));

  it('has one send path', () => {
    expect(count(src, 'function send(action)')).toBe(1);
  });

  it("calls the gate's decisions from the send path only, and the validator nowhere itself", () => {
    expect(count(src, 'ViewLogic.mapProblems(')).toBe(1);
    expect(send).toContain('ViewLogic.mapProblems(draft, data)');
    expect(src).not.toMatch(/validateOutlineShape|validateMapShape|function gateEdits\(|handleJsonApprove/);
  });

  it('routes both the approve and the send-back through the send path', () => {
    expect(count(src, "send('approve')")).toBe(1);
    expect(count(src, "send('send-back')")).toBe(1);
    expect(send).toContain('ViewLogic.mapPayload(action, draft, note)');
  });
});

// Phase 4, task 4.3: the article stop is the director's desk. The gate used to run only
// when the director had edited something, so an empty block or a headline outside the
// schema's limits in an untouched draft reached the server, where validateContentBundle
// dropped a blank paragraph without a word or ended the run. Now one gate runs the desk's
// checks (an empty block, the headline and deck limits) and the shape check on every
// approve and every send-back, edited or not, on the bundle on the desk, which is what the
// payload carries.
describe('Article.js checks the bundle on the desk in one place, on every approve and send-back', () => {
  const src = read('components/checkpoints/Article.js');
  const gate = src.slice(src.indexOf('function gateEdits('), src.indexOf('function handleApprove('));

  it('runs the shape check and the desk\'s checks from the gateEdits helper', () => {
    expect(count(src, 'ArticleEditLogic.validateBundleShape(')).toBe(1);
    expect(gate).toContain('ArticleEditLogic.validateBundleShape(bundle)');
    expect(gate).toContain('DeskLogic.deskProblems(bundle)');
  });

  it('routes the approve, the send-back and the JSON approve through the helper', () => {
    expect(count(src, 'if (!gateEdits(')).toBe(3);
    expect(count(src, 'if (!gateEdits(deskBundle, setEditError')).toBe(2);
    expect(count(src, 'if (!gateEdits(parsed, setJsonError)) return;')).toBe(1);
  });

  it('checks an untouched draft too: no gate waits for an edit', () => {
    expect(src).not.toContain('hasEdits && editedBundle');
    expect(count(src, 'const deskBundle = getCurrentBundle();')).toBe(2);
  });

  it("names the verb, so the send-back does not read 'Cannot approve'", () => {
    // M13: one call site per verb — approve takes the default, the send-back passes 'send'.
    expect(count(src, "if (!gateEdits(deskBundle, setEditError)) return;")).toBe(1);
    expect(count(src, "if (!gateEdits(deskBundle, setEditError, 'send')) return;")).toBe(1);
    expect(src).toContain("'Cannot ' + (verb || 'approve') + ' yet. Fix these first:'");
  });

  it('sends exactly the bundle on the desk with every approve and send-back', () => {
    expect(count(src, "ViewLogic.articleReviewPayload(deskBundle, note, 'approve')")).toBe(1);
    expect(count(src, "ViewLogic.articleReviewPayload(deskBundle, note, 'send-back')")).toBe(1);
    expect(count(src, "ViewLogic.articleReviewPayload(parsed, note, 'approve')")).toBe(1);
    expect(count(src, 'ViewLogic.articleReviewPayload(')).toBe(3);
  });
});

// Task 4.10: the echo above the headline shows the settled story and its question, as the view
// logic's deskEcho returns them, text in every field (a non-string reads as empty).
describe("Article.js's echo of the settled story renders the view's text (spec 2026-09-19 §6.2; task 4.10)", () => {
  const src = read('components/checkpoints/Article.js');

  it('renders each line from the view, with an (empty) line for a blank one', () => {
    expect(src).toContain('echoLine(desk.echo.storyLabel, desk.echo.story)');
    expect(src).toContain('echoLine(desk.echo.questionLabel, desk.echo.question)');
  });

  it('never renders a raw payload field: no settledStory read and no outlineThesis', () => {
    expect(src).not.toMatch(/data\.settledStory|settledStory\.|outlineThesis/);
  });
});
