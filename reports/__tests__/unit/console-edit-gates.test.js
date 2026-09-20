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
    expect(count(src, 'if (!gateEdits(editedOutline, setEditError)) return;')).toBe(2);
  });
});

describe('Article.js validates hand edits in one place', () => {
  const src = read('components/checkpoints/Article.js');

  it('calls the validator from the gateEdits helper only', () => {
    expect(count(src, 'ArticleEditLogic.validateBundleShape(')).toBe(1);
  });

  it('routes both the approve and the reject handler through the helper', () => {
    expect(count(src, 'if (!gateEdits(editedBundle, setEditError)) return;')).toBe(2);
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
