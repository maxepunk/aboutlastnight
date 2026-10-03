/**
 * The hand-edit validation gate is ONE source of truth per checkpoint file.
 *
 * Review fix round 1, findings 1 + 2: `handleReject` was added by copying
 * `handleApprove`'s validate-and-report block character for character (Article.js
 * even had the helper already and re-implemented it inline). Two copies of a gate
 * drift: the approve path and the reject path would start accepting different
 * edits, and the one that drifts loose is the one that ships an invalid outline or
 * bundle to the server. So each file gets exactly one `gateEdits` helper and every
 * handler calls it.
 *
 * Finding 5: the article gate's thesis echo rendered `outlineThesis.hook` raw,
 * unlike every sibling renderer in these two files — a non-string field (a number
 * or an object from an older/edited outline) is a React render throw on a
 * read-only panel. It renders through the same string-or-'(empty)' guard the
 * outline THESIS panel uses.
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

describe('Outline.js validates hand edits in one place', () => {
  const src = read('components/checkpoints/Outline.js');

  it('has a gateEdits helper', () => {
    expect(src).toContain('function gateEdits(');
  });

  it('calls the validator from the helper and the JSON path only', () => {
    // 2 = the shared gateEdits helper + handleJsonApprove (its own message and
    // its own error slot). handleApprove and handleReject must not call it directly.
    expect(count(src, 'EditLogic.validateOutlineShape(')).toBe(2);
  });

  it('routes both the approve and the reject handler through the helper', () => {
    expect(count(src, 'if (!gateEdits(editedOutline, setEditError')).toBe(2);
  });

  it("names the verb, so the reject path does not read 'Cannot approve'", () => {
    // M13: one call site per verb — approve takes the default, reject passes 'send'.
    expect(count(src, "if (!gateEdits(editedOutline, setEditError)) return;")).toBe(1);
    expect(count(src, "if (!gateEdits(editedOutline, setEditError, 'send')) return;")).toBe(1);
    expect(src).toContain("'Cannot ' + (verb || 'approve') + ', edited outline is invalid: '");
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

describe('Article.js thesis echo is type-guarded (spec 2026-09-19 §6.2)', () => {
  const src = read('components/checkpoints/Article.js');

  it('renders each field through the string-or-(empty) guard', () => {
    expect(src).toContain("typeof value === 'string' && value.trim()");
  });

  it('never renders a raw outlineThesis field', () => {
    ['hook', 'keyTension', 'primaryArc'].forEach((field) => {
      expect(src).not.toContain('outlineThesis.' + field + " || '(empty)'");
    });
  });
});
