/**
 * 4.10: the desk's marks (phase 4, brief 4.10; spec 6.2 and 6.3).
 *
 * The line every stop phrases a changed edit with (changedEditLine), as the integrator's
 * rulings 7 and 8 have it: a move put back out of the director's order says so, and a
 * reweave's entry is the reweave's.
 */
const ViewLogic = require('../checkpoint-view-logic');
const { REWEAVE_PASS } = require('../../lib/hand-edit-diff');

const { changedEditLine } = ViewLogic;

// ═══════════════════════════════════════════════════════════════════════════
// The line every stop phrases a changed edit with (changedEditLine)
// ═══════════════════════════════════════════════════════════════════════════

describe('4.10: the changed-edit line says what each pass did', () => {
  const MOVE = { id: 'E1', scope: 'section:s', where: 'section "s", photo p3.jpg, moved within the section', moved: true, cut: false, removed: false, director: 'filename: p3.jpg', became: 'section "t"', pass: 1, automatic: true, reason: null, restored: true };

  test('a block put back out of the order the director left it says so (4.3c inOrder)', () => {
    expect(changedEditLine({ ...MOVE, inOrder: false })).toBe(
      'E1, section "s", photo p3.jpg, moved within the section: automatic pass 1 moved the block you placed here to section "t". It was put back in its section, but not in the order you left it: move it again if the order matters.'
    );
    expect(changedEditLine({ ...MOVE, inOrder: true })).toBe(
      'E1, section "s", photo p3.jpg, moved within the section: automatic pass 1 moved the block you placed here to section "t". It was put back.'
    );
    expect(changedEditLine(MOVE)).toMatch(/It was put back\.$/);
  });

  test("a reweave's entry is the reweave's, held to the director's edits as an automatic pass is", () => {
    const CONNECTION = 'id: c2; kind: moment; joins: t2 / t4; detail: The night of the sale.';
    const struck = { id: 'E5', scope: 'connections', where: 'connection "c2", struck', struck: true, director: CONNECTION, became: CONNECTION, pass: REWEAVE_PASS, automatic: false, reason: null, restored: false };
    expect(changedEditLine(struck)).toBe('E5, connection "c2", struck: your reweave brought it back. It could not be struck again.');
    const removed = { id: 'E1', scope: 'story', where: 'story', removed: true, cut: false, moved: false, director: 'Who paid Riley?', became: 'Who gained? Who paid Riley?', pass: REWEAVE_PASS, automatic: false, reason: null, restored: false };
    expect(changedEditLine(removed, { stillIn: 'in the weave' })).toBe(
      'E1, story: a sentence you removed came back as "Who gained? Who paid Riley?" (your reweave). It is still in the weave: cut it again if it should go.'
    );
    expect(ViewLogic.REWEAVE_PASS).toBe(REWEAVE_PASS);
  });
});
