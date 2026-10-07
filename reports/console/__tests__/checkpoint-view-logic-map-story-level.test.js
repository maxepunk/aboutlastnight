/**
 * The map on screen at the level of the story (phase 4b, piece 1, brief 1D; spec 2026-10-05
 * sections 4.2, 5.4, 6.3 and 9).
 *
 * The beat editors edit a move's words and its people, and keep every other field of the beat as
 * it is; the add line builds {id, move, players}. The client gate decides as the server's does on
 * the new shape. The map's view model gives each beat its move, its people, its card marker and its
 * evidence folded, each photo the director's description, a check still failing beside the line
 * its place names, and no tag on any line. Invented text: the repo is public.
 */
const EditLogic = require('../outline-edit-logic');
const ViewLogic = require('../checkpoint-view-logic');
const { mapCheckpointData, directorMapProblems, directorMapSchemaFor } = require('../../lib/map');
const { EVIDENCE_SOURCES, EVIDENCE_STANCES, EVIDENCE_PIECE_SCHEMA } = require('../../lib/evidence');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { standingOnMap } = require('../../lib/hand-edit-diff');
const { mapSlotsOf } = require('../../lib/theme-config');
const { storyLevelMap, storyLevelMapState, PHOTO_DESCRIPTIONS } = require('../../lib/__tests__/fixtures/story-level-map');
const { piece } = require('../../lib/__tests__/fixtures/story-level-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const SLOTS = mapSlotsOf('journalist');
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);

/** Each exposed document of the story-level record, as server.js buildEvidenceIndex names it. */
const EVIDENCE_INDEX = {
  jes002: { name: 'JES002 - The warning', owner: 'Jess Moreau', type: 'memory', firstLine: '' },
  sam001: { name: 'SAM001 - The journal', owner: 'Sam Okafor', type: 'memory', firstLine: '' },
  'p-email': { name: 'Email to Quinn', owner: 'Marcus Blackwood', type: 'paper', firstLine: '' }
};

/** The stop's payload for a state, as server.js getCheckpointData sends it (less the trace). */
function payloadOf(state = storyLevelMapState()) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: EVIDENCE_INDEX, maxRevisions: 1 });
}

/** The view's beat with `id`, in the sections or in left out. */
function beatView(view, id) {
  return [...view.sections.flatMap((s) => s.beats), ...view.leftOut.items].find((b) => b.id === id);
}

// ═══════════════════════════════════════════════════════════════════════════
// The console's copies of the server's shapes
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the client gate's copy of a beat's shape and of a piece's is the server's", () => {
  test("a beat's keys and the keys a beat the director adds needs are the director-side schema's", () => {
    const beat = directorMapSchemaFor('journalist').properties.sections.items.properties.beats.items;
    expect(EditLogic.BEAT_KEYS).toEqual(Object.keys(beat.properties));
    expect(EditLogic.BEAT_REQUIRED_KEYS).toEqual(beat.required);
  });

  test("a piece's required keys, its stances and the sources besides a document are lib/evidence.js's", () => {
    expect(EditLogic.EVIDENCE_PIECE_REQUIRED).toEqual(EVIDENCE_PIECE_SCHEMA.required);
    expect(EditLogic.EVIDENCE_PIECE_STANCES).toEqual([...EVIDENCE_STANCES]);
    expect(EditLogic.EVIDENCE_NAMED_SOURCES).toEqual(Object.values(EVIDENCE_SOURCES));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The beat's editors and the add line
// ═══════════════════════════════════════════════════════════════════════════

// Phase 4b, piece 4 (brief 4B; R1): the editor edits the move's summary too, its synopsis.
describe("1D: the beat's editor edits a move's words, its summary and its people, and keeps the rest of the beat", () => {
  test('initBeat opens on the move, the summary and the people', () => {
    const b4 = beatOf(storyLevelMap(), 'b4');
    expect(EditLogic.initBeat(b4)).toEqual({ move: 'Marcus asks Quinn for a higher dose', synopsis: b4.synopsis, players: 'Quinn' });
    expect(EditLogic.initBeat({ id: 'b10', move: 'Remi walks out' })).toEqual({ move: 'Remi walks out', synopsis: '', players: '' });
  });

  test('buildBeat writes the move and the summary as typed and the people as a list, and keeps the threads, the card, the connection, the kind and the evidence', () => {
    const b4 = beatOf(storyLevelMap(), 'b4');
    const built = EditLogic.buildBeat({ move: ' Marcus wants a stronger dose ', synopsis: ' Marcus asks Quinn to raise it. ', players: 'Quinn,  Sam ' }, b4);
    expect(built).toEqual({ ...b4, move: ' Marcus wants a stronger dose ', synopsis: ' Marcus asks Quinn to raise it. ', players: ['Quinn', 'Sam'] });
    const added = { id: 'b10', move: 'Remi walks out' };
    expect(EditLogic.buildBeat(EditLogic.initBeat(added), added)).toEqual(added);
    // A move with no summary gains one only when the director writes it; a summary they empty stays empty.
    expect(EditLogic.buildBeat({ move: 'Remi walks out', synopsis: 'Remi leaves before the count.', players: '' }, added))
      .toEqual({ ...added, synopsis: 'Remi leaves before the count.' });
    expect(EditLogic.buildBeat({ ...EditLogic.initBeat(b4), synopsis: '' }, b4)).toEqual({ ...b4, synopsis: '' });
  });

  test('addBeat builds {id, move, players} under an id no beat holds; a blank move adds none', () => {
    const map = storyLevelMap();
    const next = EditLogic.addBeat(map, 'closing', 'Remi walks out before the vote', 'Remi, Kai');
    expect(beatOf(next, 'b10')).toEqual({ id: 'b10', move: 'Remi walks out before the vote', players: ['Remi', 'Kai'] });
    expect(EditLogic.addBeat(map, 'closing', '   ', 'Remi')).toBe(map);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The client gate decides as the server's does
// ═══════════════════════════════════════════════════════════════════════════

describe('1D: the client gate decides as lib/map.js directorMapProblems does on the new shape', () => {
  const withBeat = (beat, where = 'section') => {
    const map = storyLevelMap();
    if (where === 'section') map.sections[3].beats.push(beat);
    else map.leftOut.push(beat);
    return map;
  };
  const CORPUS = [
    ['the writer\'s story-level map', storyLevelMap()],
    ['a beat the director added: its id and move', withBeat({ id: 'b10', move: 'Remi walks out' })],
    ['a beat the director added with its people', withBeat({ id: 'b10', move: 'Remi walks out', players: ['Remi'] })],
    ['a beat the director added with its summary', withBeat({ id: 'b10', move: 'Remi walks out', synopsis: 'Remi leaves before the count.' })],
    ['a summary that is no text', withBeat({ id: 'b10', move: 'Remi walks out', synopsis: ['Remi leaves'] })],
    ['a beat added straight into left out', withBeat({ id: 'b10', move: 'Remi walks out' }, 'leftOut')],
    ['a beat that names its material', withBeat({ id: 'b10', material: 'Remi walks out', players: [] })],
    ['a beat with no move', withBeat({ id: 'b10', players: ['Remi'] })],
    ['a card marker that is no boolean', withBeat({ id: 'b10', move: 'Remi walks out', card: 'jes002' })],
    ['threads that are no list of text', withBeat({ id: 'b10', move: 'Remi walks out', threads: 't1' })],
    ['a kind outside the four', withBeat({ id: 'b10', move: 'Remi walks out', kind: 'montage' })],
    ['a piece with no sources', withBeat({ id: 'b10', move: 'Remi walks out', evidence: [{ sources: [], shows: 'x', stance: 'supports' }] })],
    ['a piece with an unknown stance', withBeat({ id: 'b10', move: 'Remi walks out', evidence: [{ sources: ['notes'], shows: 'x', stance: 'neutral' }] })],
    ['a piece with no stance', withBeat({ id: 'b10', move: 'Remi walks out', evidence: [{ sources: ['notes'], shows: 'x' }] })],
    ['a piece flag that is no boolean', withBeat({ id: 'b10', move: 'Remi walks out', evidence: [{ ...piece(['notes'], 'x'), card: 'yes' }] })],
    ['evidence that is no list', withBeat({ id: 'b10', move: 'Remi walks out', evidence: piece(['notes'], 'x') })]
  ];

  test.each(CORPUS)('%s: the console and the server decide alike', (_name, map) => {
    const server = directorMapProblems(clone(map), { theme: 'journalist', shown: storyLevelMap() }) === null;
    const client = EditLogic.validateOutlineShape(clone(map), 'journalist', SLOTS, storyLevelMap()).valid;
    expect(client).toBe(server);
  });

  test('the corpus holds both decisions', () => {
    const decisions = CORPUS.map(([, map]) => directorMapProblems(clone(map), { theme: 'journalist', shown: storyLevelMap() }) === null);
    expect(decisions).toEqual(expect.arrayContaining([true, false]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The map's view model
// ═══════════════════════════════════════════════════════════════════════════

describe("1D: the map's view gives each beat its move, its people, its card marker and its evidence folded", () => {
  test("a beat's view: its move, its people, the card marker, and each piece by its sources' names", () => {
    const data = payloadOf();
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const b4 = beatView(view, 'b4');
    expect(b4).toMatchObject({ move: 'Marcus asks Quinn for a higher dose', players: 'Quinn', card: true, noEvidence: '', failures: [] });
    expect(b4.evidence.map((p) => p.text)).toEqual(['Email to Quinn (Marcus Blackwood): Marcus asks Quinn to "raise the dose for the pilot"']);
    expect(beatView(view, 'b1').card).toBe(false);
    expect(view.evidenceTitle).toBe("What's behind it");
    ['material', 'materialText', 'cardText', 'kindLabel', 'connection'].forEach((field) => expect(b4).not.toHaveProperty(field));
  });

  test('a beat the director added with no evidence, at this look or an earlier one, folds the line that the article writer finds it', () => {
    expect(ViewLogic.MAP_NO_EVIDENCE_LINE).toBe('Nothing yet: the article writer finds the evidence for it.');
    const data = payloadOf();
    const now = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out', 'Remi');
    expect(beatView(ViewLogic.mapView(data, now), 'b10').noEvidence).toBe(ViewLogic.MAP_NO_EVIDENCE_LINE);
    const left = EditLogic.addBeat(storyLevelMap(), 'closing', 'Remi walks out', 'Remi');
    const earlier = payloadOf(storyLevelMapState({ outline: left, _outlineHandEdits: standingOnMap(null, storyLevelMap(), left) }));
    expect(beatView(ViewLogic.mapView(earlier, ViewLogic.mapDraftOf(earlier, undefined)), 'b10').noEvidence).toBe(ViewLogic.MAP_NO_EVIDENCE_LINE);
    // A writer's beat with no evidence shows the check's failure instead.
    const bare = storyLevelMap();
    beatOf(bare, 'b2').evidence = [];
    const writers = payloadOf(storyLevelMapState({ outline: bare }));
    expect(beatView(ViewLogic.mapView(writers, bare), 'b2').noEvidence).toBe('');
  });

  test("each photo comes with the director's description, or none; the beside options name beats by their moves", () => {
    const data = payloadOf(storyLevelMapState({ photoDescriptions: { 'Board.JPG': PHOTO_DESCRIPTIONS['board.jpg'], 'top.jpg': PHOTO_DESCRIPTIONS['top.jpg'] } }));
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const [board, bar] = view.sections[1].photos;
    expect(board.description).toBe('Sam reading the journal by the board');
    expect(bar.description).toBe('');
    expect(view.topPhoto.description).toBe('Quinn, Kai and Alex at the evidence screen as the final count begins');
    expect(board.besideOptions.map((o) => o.label)).toEqual([
      'By itself, with its people',
      'Beside: Marcus trying the batch on himself',
      'Beside: Marcus asks Quinn for a higher dose',
      'Beside: Jess warns Sarah'
    ]);
  });

  test('a check still failing sits beside the line its place names, in story terms; one with no place stays at the top', () => {
    const map = storyLevelMap();
    beatOf(map, 'b6').evidence = [piece(['zzz999'], 'A document no record holds.')];
    const failures = [
      { type: 'evidence-not-in-record', message: 'Beat b6: piece 1 names "zzz999".', line: 'The evidence behind the move cites a document the record does not hold.', place: 'sections[#followTheMoney].beats[#b6]' },
      { type: 'story-terms', message: 'The job of lede holds a time.', line: 'This job gives the time 9:58.', place: 'sections[#lede]' },
      { type: 'story-terms', message: 'The gap note holds a time.', line: 'The gap note gives the time 9:58.', place: 'gapNote' },
      { type: 'weave-change-source', message: 'Sources "E9".', line: 'A change names something you did not change.', place: 'weaveChanges' },
      { type: 'player-not-placed', message: 'Players in no beat: Remi.', line: 'Remi is in no move and not in the gap note.' }
    ];
    const data = { ...payloadOf(), checkFailures: failures };
    const view = ViewLogic.mapView(data, map);
    expect(beatView(view, 'b6').failures).toEqual(['Check still failing: The evidence behind the move cites a document the record does not hold.']);
    expect(view.sections[0].failures).toEqual(['Check still failing: This job gives the time 9:58.']);
    expect(view.gapNote.failures).toEqual(['Check still failing: The gap note gives the time 9:58.']);
    expect(view.weaveChangesFailures).toEqual(['Check still failing: A change names something you did not change.']);
    expect(view.checkFailures).toEqual(['Check still failing: Remi is in no move and not in the gap note.']);
  });

  test("no line or label of the view carries a beat's, a thread's or a connection's tag", () => {
    const data = payloadOf();
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    const words = [];
    const walk = (value, key) => {
      if (['id', 'key', 'value', 'beat', 'slot', 'index'].includes(key)) return;
      if (typeof value === 'string') words.push(value);
      else if (Array.isArray(value)) value.forEach((v) => walk(v));
      else if (value && typeof value === 'object') Object.entries(value).forEach(([k, v]) => walk(v, k));
    };
    walk(view);
    words.forEach((text) => expect(text).not.toMatch(/\b[btc]\d+\b/));
  });

  test("a send-back's changes to a beat the director added and to the beat a photo sits beside read in story terms, with no tag", () => {
    const { reportAfterPass, carriedEdits, SEND_BACK_PASS } = require('../../lib/hand-edit-diff');
    const left = EditLogic.setPhotoBeside(EditLogic.addBeat(storyLevelMap(), 'closing', 'Remi walks out before the vote', 'Remi'), 'theStory', 0, 'b4');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const rework = EditLogic.setPhotoBeside(clone(left), 'theStory', 0, 'b5');
    Object.assign(beatOf(rework, 'b10'), { move: 'Remi leaves the room', threads: ['t1'], kind: 'scene', connection: 'c2', evidence: [piece(['notes'], 'The room votes for an accident.')] });
    const report = reportAfterPass(null, { edits: carriedEdits(standing, left), before: left, after: rework, pass: SEND_BACK_PASS });
    const data = payloadOf(storyLevelMapState({
      outline: rework, _outlineHandEdits: standing, _outlineHandEditReport: report, humanOutlineRevisionCount: 1
    }));
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    expect(view.changedEdits).toEqual([
      'Closing, the move "Remi leaves the room", added: your "Remi walks out before the vote (shows Remi)" became "Remi leaves the room (shows Remi)" (the rework of your send-back). No reason given.',
      'The Story, photo "board.jpg", beat: your "Marcus asks Quinn for a higher dose" became "Jess warns Sarah" (the rework of your send-back). No reason given.'
    ]);
    view.changedEdits.forEach((text) => expect(text).not.toMatch(/\b[btc]\d+\b/));
  });

  test("a photo the director took from beside its beat that a pass sat beside another beat reads as the move it came back beside, with no tag", () => {
    const { reportAfterPass, settleEdits, carriedEdits, SEND_BACK_PASS } = require('../../lib/hand-edit-diff');
    const left = EditLogic.setPhotoBeside(storyLevelMap(), 'theStory', 0, '');
    const standing = standingOnMap(null, storyLevelMap(), left);
    const pass = EditLogic.setPhotoBeside(left, 'theStory', 0, 'b4');
    const linesOf = (report) => {
      const data = payloadOf(storyLevelMapState({
        outline: pass, _outlineHandEdits: standing, _outlineHandEditReport: report, humanOutlineRevisionCount: 1
      }));
      return ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined)).changedEdits;
    };

    const sendBack = linesOf(reportAfterPass(null, { edits: carriedEdits(standing, left), before: left, after: pass, pass: SEND_BACK_PASS }));
    expect(sendBack).toEqual([
      'The Story, photo "board.jpg", beat, cut: the text you cut came back as "Marcus asks Quinn for a higher dose" (the rework of your send-back). No reason given.'
    ]);

    const automatic = linesOf(settleEdits(null, { edits: carriedEdits(standing, left), before: left, after: pass, pass: 1 }).report);
    expect(automatic).toEqual([
      'The Story, photo "board.jpg", beat, cut: the text you cut came back as "Marcus asks Quinn for a higher dose" (automatic pass 1). It is still on the map: cut it again if it should go.'
    ]);
    [...sendBack, ...automatic].forEach((text) => expect(text).not.toMatch(/\b[btc]\d+\b/));
  });
});
