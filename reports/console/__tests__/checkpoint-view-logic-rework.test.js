/**
 * 4.14e: a send-back at the map or the desk whose rework did not run (the final review's
 * ruling 5), on screen. The stop reopens with the director's version and one line saying the
 * round did not run, read by what the note box holds, as the story meeting's line is
 * (didNotRunLine, brief 4.5c): a note the box holds is sent again as it is, and one it does not
 * hold is given back word for word.
 *
 * The map's payloads are the server's own (lib/map.js mapCheckpointData), and the note box is
 * reopened through pendingEditsAfterCheckpoint with the slot the map's send() saved, as the
 * console's reducer reopens it. Invented text.
 */
const ViewLogic = require('../checkpoint-view-logic');
const { reworkFixtureState, MAP } = require('../../lib/__tests__/fixtures/rework-state');
const { mapCheckpointData } = require('../../lib/map');
const { roundDidNotRunAt } = require('../../lib/workflow/state');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');

const { reworkDidNotRunLine, mapPendingSlot, mapNoteOf, mapDraftOf, pendingEditsAfterCheckpoint, noteSlotKey } = ViewLogic;

const clone = (v) => JSON.parse(JSON.stringify(v));
const NOTE = 'Tighten the money section.';
const GAVE_UP = { round: 'send-back', note: NOTE, countsBefore: {}, failures: 3, at: '2026-10-04T10:00:00.000Z', error: 'SDK timeout after 900s', status: 'did-not-run' };
const LINE = 'Your send-back did not run: the writer failed, and the map is as you left it.';

/** The map's payload, as the server sends it, for a state at the map. */
function mapPayload(state) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline && state.outline.topPhoto), maxRevisions: 1 });
}

describe('4.14e: the line for a send-back whose rework did not run', () => {
  it('says nothing when every round ran', () => {
    expect(reworkDidNotRunLine(null, '', 'map')).toBe('');
    expect(reworkDidNotRunLine(undefined, NOTE, 'article')).toBe('');
  });

  it('says the round did not run and the stop is as the director left it, and sends the note in the box again as it is', () => {
    const round = roundDidNotRunAt('outline', { _outlineRework: GAVE_UP });
    expect(reworkDidNotRunLine(round, NOTE, 'map')).toBe(`${LINE} Your note is in the box: send the map back again to retry.`);
    expect(reworkDidNotRunLine(round, `  ${NOTE}\n`, 'map')).toBe(`${LINE} Your note is in the box: send the map back again to retry.`);
  });

  it('gives the note back word for word when the box does not hold it', () => {
    const round = roundDidNotRunAt('article', { _articleRework: GAVE_UP });
    expect(reworkDidNotRunLine(round, '', 'article')).toBe(
      'Your send-back did not run: the writer failed, and the article is as you left it. '
      + `To retry, write your note in the box again and send the article back. Your note was: "${NOTE}"`
    );
    expect(reworkDidNotRunLine(round, 'Another note.', 'map')).toBe(
      `${LINE} To retry, write your note in the box again and send the map back. Your note was: "${NOTE}"`
    );
  });

  it('asks for a note when the round carried none', () => {
    expect(reworkDidNotRunLine({ round: 'send-back', at: 't', note: null }, '', 'map')).toBe(`${LINE} To retry, write a note and send the map back.`);
  });

  it('throws for a stop that sends nothing back', () => {
    expect(() => reworkDidNotRunLine({ round: 'send-back', at: 't', note: NOTE }, '', 'weave')).toThrow(/map or article/);
  });
});

describe('4.14e: the map reopened after a send-back that did not run', () => {
  /** The state at the map in round 1, the writer's map shown. */
  const atMap = () => ({ ...reworkFixtureState('journalist'), outline: clone(MAP), _mapBaseline: clone(MAP), outlineRevisionCount: 0, humanOutlineRevisionCount: 0 });

  it('a note-only send-back: the map reopens on the same version, so the box holds the note again and the line says so', () => {
    const shown = mapPayload(atMap());
    // The map's send(): the map and the note saved under the version shown, then posted.
    const pending = { outline: mapPendingSlot(shown, mapDraftOf(shown, null)), [noteSlotKey('outline')]: NOTE };
    // The round did not run: the map is as the director left it, and the counts went back.
    const reopened = mapPayload({ ...atMap(), _outlineRework: GAVE_UP });
    const kept = pendingEditsAfterCheckpoint(pending, 'outline', reopened);
    const box = mapNoteOf(reopened, kept.outline, kept[noteSlotKey('outline')]);
    expect(box).toBe(NOTE);
    expect(reworkDidNotRunLine(reopened.roundDidNotRun, box, 'map')).toBe(`${LINE} Your note is in the box: send the map back again to retry.`);
  });

  it("a send-back with the director's edits: the map reopens on their version, and the line gives the note back", () => {
    const shown = mapPayload(atMap());
    const left = clone(MAP);
    left.headline = 'The Ledger Kept Talking After the Room Voted';
    const pending = { outline: mapPendingSlot(shown, left), [noteSlotKey('outline')]: NOTE };
    const reopened = mapPayload({ ...atMap(), outline: left, _outlineRework: GAVE_UP });
    const kept = pendingEditsAfterCheckpoint(pending, 'outline', reopened);
    expect(mapDraftOf(reopened, kept.outline)).toEqual(left);
    const box = mapNoteOf(reopened, kept.outline, kept[noteSlotKey('outline')]);
    expect(reworkDidNotRunLine(reopened.roundDidNotRun, box, 'map')).toBe(
      `${LINE} To retry, write your note in the box again and send the map back. Your note was: "${NOTE}"`
    );
  });
});
