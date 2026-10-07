/**
 * The moves with a place on the map's board (phase 4b, piece 4, brief 4B; spec 2026-10-07 section
 * 6; R2, R10): a move to a place in any section, a move brought back to a place, Move up and Move
 * down within its section, and a photo onto a move in any section, each one function in
 * console/outline-edit-logic.js that the board's drag and its button both call. Invented text: the
 * repo is public.
 */
const EditLogic = require('../outline-edit-logic');
const { boardMap } = require('../../lib/__tests__/fixtures/board-map');

const clone = (v) => JSON.parse(JSON.stringify(v));
const idsIn = (map, slot) => map.sections.find((s) => s.slot === slot).beats.map((b) => b.id);

// ═══════════════════════════════════════════════════════════════════════════
// The moves with a place (console/outline-edit-logic.js)
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: the moves with a place', () => {
  test('a move to another section at a place, at its head, and at its foot when no place is given', () => {
    const map = boardMap();
    expect(idsIn(EditLogic.moveBeat(map, 'b9', 'theStory', 2), 'theStory')).toEqual(['b3', 'b4', 'b9', 'b5', 'b6', 'b7', 'b8']);
    expect(idsIn(EditLogic.moveBeat(map, 'b9', 'theStory', 0), 'theStory')).toEqual(['b9', 'b3', 'b4', 'b5', 'b6', 'b7', 'b8']);
    expect(idsIn(EditLogic.moveBeat(map, 'b9', 'theStory'), 'theStory')).toEqual(['b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
    expect(idsIn(EditLogic.moveBeat(map, 'b9', 'theStory', 99), 'theStory')).toEqual(['b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b9']);
    expect(map).toEqual(boardMap());
  });

  test('a move within its own section to a place, and no change with no place or the place it holds', () => {
    const map = boardMap();
    expect(idsIn(EditLogic.moveBeat(map, 'b8', 'theStory', 0), 'theStory')).toEqual(['b8', 'b3', 'b4', 'b5', 'b6', 'b7']);
    expect(idsIn(EditLogic.moveBeat(map, 'b3', 'theStory', 3), 'theStory')).toEqual(['b4', 'b5', 'b6', 'b3', 'b7', 'b8']);
    expect(EditLogic.moveBeat(map, 'b3', 'theStory')).toBe(map);
    expect(EditLogic.moveBeat(map, 'b3', 'theStory', 0)).toBe(map);
  });

  test('a move takes its photos along, wherever it lands', () => {
    const next = EditLogic.moveBeat(boardMap(), 'b3', 'lede', 1);
    expect(idsIn(next, 'lede')).toEqual(['b1', 'b3', 'b2']);
    expect(next.sections[0].photos).toEqual([{ filename: 'p02.jpg', beat: 'b1' }, { filename: 'p03.jpg', beat: 'b3' }]);
  });

  test('a move brought back from left out to a place', () => {
    expect(idsIn(EditLogic.bringBackBeat(boardMap(), 'b17', 'theStory', 1), 'theStory')).toEqual(['b3', 'b17', 'b4', 'b5', 'b6', 'b7', 'b8']);
    expect(idsIn(EditLogic.bringBackBeat(boardMap(), 'b17', 'theStory'), 'theStory')).toEqual(['b3', 'b4', 'b5', 'b6', 'b7', 'b8', 'b17']);
  });

  test('Move up and Move down within its section, and no change at either end or in left out', () => {
    const map = boardMap();
    expect(idsIn(EditLogic.moveBeatBy(map, 'b5', -1), 'theStory')).toEqual(['b3', 'b5', 'b4', 'b6', 'b7', 'b8']);
    expect(idsIn(EditLogic.moveBeatBy(map, 'b5', 1), 'theStory')).toEqual(['b3', 'b4', 'b6', 'b5', 'b7', 'b8']);
    expect(EditLogic.moveBeatBy(map, 'b3', -1)).toBe(map);
    expect(EditLogic.moveBeatBy(map, 'b8', 1)).toBe(map);
    expect(EditLogic.moveBeatBy(map, 'b17', 1)).toBe(map);
    expect(() => EditLogic.moveBeatBy(map, 'b99', 1)).toThrow(/moveBeatBy/);
  });

  test('Move up and Move down move by -1 or +1 alone: any other delta leaves the map as it was (run 1 follow-up F7)', () => {
    const map = boardMap();
    [0, 2, -2, 0.5, '1', undefined, NaN].forEach((delta) => expect(EditLogic.moveBeatBy(map, 'b5', delta)).toBe(map));
  });

  test('a photo onto a move in another section lands in that section beside the move, in one op', () => {
    const next = EditLogic.placePhotoBeside(boardMap(), 'followTheMoney', 0, 'lede', 'b2');
    expect(next.sections[2].photos).toEqual([]);
    expect(next.sections[0].photos).toEqual([{ filename: 'p02.jpg', beat: 'b1' }, { filename: 'p06.jpg', beat: 'b2' }]);
  });

  test('a photo onto a move of its own section is set beside it, and the top photo can go beside a move too', () => {
    expect(EditLogic.placePhotoBeside(boardMap(), 'theStory', 2, 'theStory', 'b7').sections[1].photos[2]).toEqual({ filename: 'p05.jpg', beat: 'b7' });
    const fromTop = EditLogic.placePhotoBeside(boardMap(), EditLogic.MAP_TOP_PHOTO, 0, 'closing', 'b15');
    expect(fromTop).not.toHaveProperty('topPhoto');
    expect(fromTop.sections[4].photos).toEqual([{ filename: 'p09.jpg', beat: 'b16' }, { filename: 'p10.jpg' }, { filename: 'p01.jpg', beat: 'b15' }]);
  });

  test('a photo onto a move the section does not hold is refused, and the map is left as it was', () => {
    const map = boardMap();
    expect(() => EditLogic.placePhotoBeside(map, 'followTheMoney', 0, 'lede', 'b5')).toThrow(/placePhotoBeside/);
    expect(map).toEqual(boardMap());
  });

  test('every move with a place leaves each kept photo placed once', () => {
    const placements = (m) => EditLogic.mapPhotoPlacements(m).map((p) => p.filename).sort();
    const before = placements(boardMap());
    [
      EditLogic.moveBeat(boardMap(), 'b13', 'lede', 0),
      EditLogic.moveBeatBy(boardMap(), 'b12', 1),
      EditLogic.placePhotoBeside(boardMap(), 'thePlayers', 0, 'closing', 'b15')
    ].forEach((m) => expect(placements(m)).toEqual(before));
    expect(clone(boardMap())).toEqual(boardMap());
  });
});
