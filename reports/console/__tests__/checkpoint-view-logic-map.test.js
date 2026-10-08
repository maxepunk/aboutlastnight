/**
 * 4.9: the map on screen (phase 4, brief 4.9; spec 5.2 and 5.3).
 *
 * The map's editors are console/outline-edit-logic.js's, and its view models and payload
 * builders console/checkpoint-view-logic.js's; Outline.js is their thin consumer (the console
 * has no DOM harness). Every fixture payload here is the server's own: lib/map.js
 * mapCheckpointData run on a state paused at the map, with the photos kept for the article as
 * the server counts them (ai-nodes.js keptPhotoFilenames). Invented text.
 */
const EditLogic = require('../outline-edit-logic');
const ViewLogic = require('../checkpoint-view-logic');
const { reworkFixtureState, MAP } = require('../../lib/__tests__/fixtures/rework-state');
const {
  mapCheckpointData, mapRosterOf, directorMapProblems, mapKey, MAP_ACTIONS, MAP_CARDS, MEETING_NOTE_SOURCE
} = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { mapSlotsOf } = require('../../lib/theme-config');
const {
  standingOnMap, settleEdits, reportAfterPass, directorEditConcern, MAP_TOP_PHOTO, SEND_BACK_PASS
} = require('../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const SLOTS = mapSlotsOf('journalist');

/** A state paused at the map, as the map writer left it: the fixture's map, every check passing. */
function stateAt(overrides = {}) {
  return { ...reworkFixtureState('journalist'), directorGateNotes: [], outlineRevisionCount: 0, humanOutlineRevisionCount: 0, ...overrides };
}

/** The stop's payload for a state, as server.js getCheckpointData sends it (less the trace). */
function payloadOf(state) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline && state.outline.topPhoto), maxRevisions: 1 });
}

/** The map the screen opens on, before any change. */
const opened = (data = payloadOf(stateAt())) => ViewLogic.mapDraftOf(data, undefined);

/**
 * Every edit a rework changed that the page shows (piece 4; spec 2026-10-07 section 7): those
 * among the round's lines, then those on each move's card, in the sections and in the tray.
 */
/**
 * Every changed line the map's page shows, wherever it sits (spec 2026-10-07 section 7): the
 * round's, the top of the article's, then each section's under its head with its cards', then the
 * tray's.
 */
const changedLinesOf = (view) => [
  ...view.changedEdits,
  ...view.top.changed,
  ...view.sections.flatMap((s) => [...s.changed, ...s.beats.flatMap((b) => b.changed)]),
  ...view.leftOut.items.flatMap((b) => b.changed)
];

/** A beat of a map, wherever it sits. */
function beatOf(map, id) {
  return [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);
}

/** The places of the map's beats: each id under its section's slot, or under leftOut. */
function beatPlaces(map) {
  const out = {};
  map.sections.forEach((s) => { out[s.slot] = s.beats.map((b) => b.id); });
  out.leftOut = map.leftOut.map((b) => b.id);
  return out;
}

const gateTakes = (map, shown) => directorMapProblems(map, { theme: 'journalist', shown }) === null;
const consoleTakes = (map, shown) => EditLogic.validateOutlineShape(map, 'journalist', SLOTS, shown).valid;

// ═══════════════════════════════════════════════════════════════════════════
// The console's copies of the server's map constants
// ═══════════════════════════════════════════════════════════════════════════

describe("4.9: the console's copies of the server's map constants", () => {
  test("the top photo's place, the map's actions and the meeting note's source are the server's", () => {
    expect(EditLogic.MAP_TOP_PHOTO).toBe(MAP_TOP_PHOTO);
    expect(ViewLogic.MAP_ACTIONS).toEqual([...MAP_ACTIONS]);
    expect(ViewLogic.MAP_NOTE_SOURCE).toBe(MEETING_NOTE_SOURCE);
  });

  // Phase 4b (brief 1D; spec 11): a beat's kind stays underneath, unprinted, so the page keeps no labels for it.
  test("the cards' range is the checks'", () => {
    expect(ViewLogic.MAP_CARDS).toEqual({ ...MAP_CARDS });
    expect(ViewLogic).not.toHaveProperty('BEAT_KIND_LABELS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The map's editors: init, build and merge (each line editable)
// ═══════════════════════════════════════════════════════════════════════════

describe("4.9: the map's editors start from the line, build what the director typed, and merge it in place", () => {
  test('the headline and the deck, as typed, and nothing else changes', () => {
    const map = opened();
    expect(EditLogic.initMapHead(map)).toEqual({ headline: MAP.headline, deck: MAP.deck });
    const head = EditLogic.buildMapHead({ headline: '  The Ledger Kept Talking  ', deck: 'A sale the room left out.' });
    const next = EditLogic.mergeMapHead(map, head);
    expect([next.headline, next.deck]).toEqual(['  The Ledger Kept Talking  ', 'A sale the room left out.']);
    expect({ ...next, headline: MAP.headline, deck: MAP.deck }).toEqual(clone(MAP));
    expect(map).toEqual(clone(MAP));
  });

  test("the gap note's line, as typed, with the players it raises kept", () => {
    const map = { ...opened(), gapNote: { line: 'The record holds nothing Sarah did.', players: ['Sarah'] } };
    expect(EditLogic.initGapNote(map.gapNote)).toEqual({ line: 'The record holds nothing Sarah did.' });
    const next = EditLogic.mergeGapNote(map, EditLogic.buildGapNote({ line: 'Sarah ran the bar; the record is silent.' }, map.gapNote));
    expect(next.gapNote).toEqual({ line: 'Sarah ran the bar; the record is silent.', players: ['Sarah'] });
  });

  test("a section's heading and job, merged onto the section as it is now: a beat struck there meanwhile stays struck", () => {
    const map = opened();
    const form = EditLogic.initMapSection(map.sections[1]);
    expect(form).toEqual({ heading: 'The Story', job: 'How the sale and the envelope sat under the vote.' });
    const struck = EditLogic.strikeBeat(map, 'b4');
    const next = EditLogic.mergeMapSection(struck, 'theStory', EditLogic.buildMapSection({ heading: 'The Sale', job: 'What the room never weighed.' }));
    expect(next.sections[1]).toMatchObject({ slot: 'theStory', heading: 'The Sale', job: 'What the room never weighed.' });
    expect(beatPlaces(next).theStory).toEqual(['b2', 'b3']);
    expect(() => EditLogic.mergeMapSection(map, 'thePlayers', { heading: 'x', job: 'y' })).toThrow(/no section for the slot thePlayers/);
  });

  // Phase 4b (brief 1D): a beat's editor edits its move and its people; every other field, its
  // evidence among them, is the writer's and stays as it is.
  test('a beat: its move as typed and its players; its kind, threads, card, connection and evidence stay as they are', () => {
    const map = opened();
    const b3 = beatOf(map, 'b3');
    const form = EditLogic.initBeat(b3);
    // Piece 4 (brief 4B; R1): the editor opens on the move's summary too, its synopsis.
    expect(form).toEqual({ move: 'Morgan pays Riley at the bar', synopsis: b3.synopsis, players: 'Morgan, Riley' });
    const built = EditLogic.buildBeat({ ...form, move: ' The envelope at the bar ', players: 'Morgan,  Riley , Alex' }, b3);
    expect(built).toEqual({ ...b3, move: ' The envelope at the bar ', players: ['Morgan', 'Riley', 'Alex'] });
    const next = EditLogic.mergeBeat(map, 'b3', built);
    expect(beatOf(next, 'b3')).toEqual(built);
    expect(beatPlaces(next)).toEqual(beatPlaces(map));
  });

  test('a beat the director added with no players keeps none when none are typed', () => {
    const added = { id: 'b10', move: 'Alex at the window' };
    expect(EditLogic.initBeat(added)).toEqual({ move: 'Alex at the window', synopsis: '', players: '' });
    expect(EditLogic.buildBeat(EditLogic.initBeat(added), added)).toEqual(added);
  });

  test("a beat's edit merges where the beat sits now: one struck since its editor opened is edited in left out", () => {
    const map = opened();
    const form = { ...EditLogic.initBeat(beatOf(map, 'b4')), move: 'The paternity result' };
    const struck = EditLogic.strikeBeat(map, 'b4');
    const next = EditLogic.mergeBeat(struck, 'b4', EditLogic.buildBeat(form, beatOf(map, 'b4')));
    expect(beatPlaces(next).leftOut).toEqual(['b9', 'b4']);
    expect(beatOf(next, 'b4').move).toBe('The paternity result');
    expect(() => EditLogic.mergeBeat(map, 'b77', {})).toThrow(/no beat b77/);
  });

  test('the expected length: a whole number of words, commas allowed; anything else builds none', () => {
    const map = opened();
    expect(EditLogic.initMapLength(map)).toEqual({ expectedLength: '1200' });
    expect(EditLogic.buildMapLength({ expectedLength: '1,400' })).toBe(1400);
    expect(EditLogic.buildMapLength({ expectedLength: ' 900 ' })).toBe(900);
    ['', 'about 900', '9.5', '-3', 'x'].forEach((text) => expect([text, EditLogic.buildMapLength({ expectedLength: text })]).toEqual([text, null]));
    expect(EditLogic.mergeMapLength(map, 900).expectedLength).toBe(900);
    expect(() => EditLogic.mergeMapLength(map, null)).toThrow(/whole number/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The map's moves: move, strike, bring back, add, take out, the photos
// ═══════════════════════════════════════════════════════════════════════════

describe("4.9: the map's moves, each leaving the map it was given as it was", () => {
  test('a beat moves to the end of another section, and a photo beside it goes with it', () => {
    const map = opened();
    const next = EditLogic.moveBeat(map, 'b2', 'closing');
    expect(beatPlaces(next)).toMatchObject({ theStory: ['b3', 'b4'], closing: ['b6', 'b2'] });
    expect(next.sections[1].photos).toEqual([]);
    expect(next.sections[3].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);
    expect(map).toEqual(clone(MAP));
  });

  test('a beat moved to its own section, or a strike of a beat already left out, changes nothing', () => {
    const map = opened();
    expect(EditLogic.moveBeat(map, 'b2', 'theStory')).toBe(map);
    expect(EditLogic.strikeBeat(map, 'b9')).toBe(map);
    expect(() => EditLogic.moveBeat(map, 'b2', 'thePlayers')).toThrow(/no section for the slot thePlayers/);
    expect(() => EditLogic.moveBeat(map, 'b77', 'closing')).toThrow(/no beat b77/);
  });

  test('a struck beat joins left out, and a photo beside it stays in its section, by itself with its people', () => {
    const map = opened();
    const next = EditLogic.strikeBeat(map, 'b2');
    expect(beatPlaces(next)).toMatchObject({ theStory: ['b3', 'b4'], leftOut: ['b9', 'b2'] });
    expect(beatOf(next, 'b2')).toEqual(beatOf(map, 'b2'));
    // 4.14b: the photo keeps the struck beat's name, so bringing the beat back reattaches it;
    // every reader reads it as by itself (photoBeatOf), and the gate stores it so.
    expect(next.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);
    expect(EditLogic.photoBeatOf(next, next.sections[1].photos[0])).toBe('');
    expect(EditLogic.freeStruckBeatPhotos(next).sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(map).toEqual(clone(MAP));
  });

  test('a beat comes back from left out, whole, into the section the director picks', () => {
    const map = opened();
    const next = EditLogic.bringBackBeat(map, 'b9', 'followTheMoney');
    expect(beatPlaces(next)).toMatchObject({ followTheMoney: ['b5', 'b9'], leftOut: [] });
    expect(beatOf(next, 'b9')).toEqual(MAP.leftOut[0]);
    expect(() => EditLogic.bringBackBeat(map, 'b2', 'closing')).toThrow(/b2 is not in left out/);
  });

  test('a beat is added with its players, under an id no beat holds', () => {
    const map = opened();
    const next = EditLogic.addBeat(map, 'followTheMoney', 'The bonus at 07:52 PM', ' Riley, Morgan ');
    expect(next.sections[2].beats[1]).toEqual({ id: 'b10', move: 'The bonus at 07:52 PM', players: ['Riley', 'Morgan'] });
    expect(EditLogic.addBeat(next, 'lede', 'A second line', '').sections[0].beats[1]).toEqual({ id: 'b11', move: 'A second line', players: [] });
    expect(EditLogic.addBeat(map, 'lede', '   ', 'Alex')).toBe(map);
    expect(EditLogic.freshBeatId({ sections: [{ slot: 'lede', beats: [{ id: 'x' }, { id: 'b2' }] }], leftOut: [{ id: 'b3' }] })).toBe('b4');
  });

  test('a beat the director added at this look is taken out again, whole', () => {
    const map = opened();
    const added = EditLogic.addBeat(map, 'closing', 'Riley leaves town', 'Riley');
    expect(EditLogic.removeBeat(added, 'b10')).toEqual(map);
  });

  test('a photo moves to the top, and the top photo it replaces takes its place, by itself', () => {
    const map = opened();
    const next = EditLogic.movePhoto(map, 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
    expect(next.topPhoto).toBe('p2.jpg');
    expect(next.sections[1].photos).toEqual([{ filename: 'hero.jpg' }]);
    expect(map).toEqual(clone(MAP));
  });

  test('the top photo moves into a section, by itself, and the map then has no top photo', () => {
    const next = EditLogic.movePhoto(opened(), EditLogic.MAP_TOP_PHOTO, 0, 'closing');
    expect(next).not.toHaveProperty('topPhoto');
    expect(next.sections[3].photos).toEqual([{ filename: 'hero.jpg' }]);
  });

  test('a photo moves to another section, by itself; moved to its own place, nothing changes', () => {
    const map = opened();
    const next = EditLogic.movePhoto(map, 'theStory', 0, 'lede');
    expect(next.sections[0].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(next.sections[1].photos).toEqual([]);
    expect(EditLogic.movePhoto(map, 'theStory', 0, 'theStory')).toBe(map);
    expect(() => EditLogic.movePhoto(map, 'lede', 0, 'closing')).toThrow(/no photo at 0/);
  });

  test('a photo sits beside a beat of its own section, or by itself', () => {
    const map = opened();
    expect(EditLogic.setPhotoBeside(map, 'theStory', 0, 'b4').sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b4' }]);
    expect(EditLogic.setPhotoBeside(map, 'theStory', 0, '').sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(() => EditLogic.setPhotoBeside(map, 'theStory', 0, 'b6')).toThrow(/holds no beat b6/);
  });

  test("each move is one of the director's standing edits at its place, and the gate takes the map", () => {
    const cases = [
      ['a beat moved', (m) => EditLogic.moveBeat(m, 'b3', 'closing'), [['sections[#closing].beats[#b3]', 'theStory']]],
      ['a beat struck', (m) => EditLogic.strikeBeat(m, 'b4'), [['leftOut[#b4]', 'theStory']]],
      ['a beat brought back', (m) => EditLogic.bringBackBeat(m, 'b9', 'closing'), [['sections[#closing].beats[#b9]', 'leftOut']]],
      ['a beat added', (m) => EditLogic.addBeat(m, 'lede', 'Alex at the window', 'Alex'), [['sections[#lede].beats[#b10]', 'none']]],
      ['a photo moved to the top', (m) => EditLogic.movePhoto(m, 'theStory', 0, EditLogic.MAP_TOP_PHOTO), [['topPhoto', 'theStory'], ['sections[#theStory].photos[#hero.jpg]', 'topPhoto']]]
    ];
    cases.forEach(([name, change, expected]) => {
      const left = change(opened());
      const edits = standingOnMap(null, clone(MAP), left).edits.map((e) => [e.path, e.from]);
      expect([name, edits]).toEqual([name, expected]);
      expect([name, gateTakes(left, clone(MAP)), consoleTakes(left, clone(MAP))]).toEqual([name, true, true]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Everyone and the counts, rebuilt from the map as edited
// ═══════════════════════════════════════════════════════════════════════════

describe('4.9: Everyone and the counts are rebuilt from the map as edited, through mapTally', () => {
  const state = stateAt();
  const data = payloadOf(state);
  /** The server's own count of a map, with the session's roster and the photos kept for it. */
  const serverTally = (map) => EditLogic.mapTally(map, {
    roster: mapRosterOf(state.sessionConfig, state.canonicalCharacters),
    keptPhotos: keptPhotoFilenames(state, map.topPhoto)
  });

  // Task 4.6d: the stop's payload sends no count of its own, only the inputs it is built on.
  test("before any change, the console's count is the server's count of the map the stop showed", () => {
    expect(ViewLogic.mapTallyOf(data, opened(data))).toEqual(serverTally(clone(MAP)));
  });

  test('after a strike: the player whose only beat was struck is in no beat, and the card is gone from the count', () => {
    const struck = EditLogic.strikeBeat(opened(data), 'b4');
    const tally = ViewLogic.mapTallyOf(data, struck);
    expect(tally).toEqual(serverTally(struck));
    expect(tally.everyone).toEqual([
      { slot: 'lede', heading: '', players: ['Alex', 'Morgan'] },
      { slot: 'theStory', heading: 'The Story', players: ['Riley'] }
    ]);
    expect([tally.unplaced, tally.cards, tally.photos]).toEqual([['Sarah'], 2, { placed: 2, of: 2 }]);
  });

  test('after a beat added with its players, a move and a photo moved to the top, it is the server\'s count of that map', () => {
    let map = EditLogic.addBeat(opened(data), 'closing', 'Sarah at the bar', 'Sarah Blackwood');
    map = EditLogic.strikeBeat(map, 'b4');
    map = EditLogic.moveBeat(map, 'b3', 'followTheMoney');
    map = EditLogic.movePhoto(map, 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
    expect(ViewLogic.mapTallyOf(data, map)).toEqual(serverTally(map));
  });

  // Piece 4 (spec 2026-10-07 sections 4 and 14): the Everyone list goes; the counts say whether
  // everyone is placed and name anyone who is not, in the board's words.
  test('the lines: everyone placed or the players in no move, the cards, the photos and the expected length', () => {
    const view = ViewLogic.mapView(data, EditLogic.strikeBeat(opened(data), 'b4'));
    expect(view.tally).toEqual({
      placed: '',
      unplaced: 'In no move: Sarah',
      raised: '',
      cards: '2 cards, under the 3 to 5 the article carries',
      photos: '2 of 2 photos',
      length: 'About 1,200 words',
      lengthConcerns: []
    });
    const full = ViewLogic.mapView(data, opened(data)).tally;
    expect([full.placed, full.unplaced, full.cards]).toEqual(['Everyone placed', '', '3 cards']);
  });

  test('a player the gap note raises is named as raised, not as in no beat; the length reads as the map now holds it', () => {
    let map = { ...EditLogic.strikeBeat(opened(data), 'b4'), gapNote: { line: 'The record holds nothing Sarah did.', players: ['Sarah'] } };
    map = EditLogic.mergeMapLength(map, 900);
    const view = ViewLogic.mapView(data, map);
    expect([view.tally.unplaced, view.tally.raised, view.tally.length]).toEqual(['', 'Raised in the gap note: Sarah', 'About 900 words']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The console's validator reaches the gate's decisions (ruling 3)
// ═══════════════════════════════════════════════════════════════════════════

/** A map whose writer gave two beats the id b2. */
function writersRepeat() {
  const map = clone(MAP);
  map.sections[3].beats.push({ id: 'b2', kind: 'line', move: 'A second beat under b2', players: [] });
  return map;
}

/** Every change the map's controls make, on the fixture map. */
function everyChange(map) {
  let m = EditLogic.strikeBeat(map, 'b4');
  m = EditLogic.bringBackBeat(m, 'b9', 'closing');
  m = EditLogic.addBeat(m, 'followTheMoney', 'The bonus at 07:52 PM', 'Riley');
  m = EditLogic.moveBeat(m, 'b3', 'closing');
  m = EditLogic.mergeBeat(m, 'b6', EditLogic.buildBeat({ ...EditLogic.initBeat(beatOf(m, 'b6')), move: 'Riley keeps the books, and a second ledger' }, beatOf(m, 'b6')));
  m = EditLogic.mergeMapHead(m, EditLogic.buildMapHead({ headline: 'The Ledger Kept Talking', deck: 'A sale the room left out.' }));
  m = EditLogic.mergeMapSection(m, 'closing', EditLogic.buildMapSection({ heading: '', job: 'Who still gains.' }));
  m = EditLogic.mergeMapLength(m, 1100);
  m = EditLogic.movePhoto(m, 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
  return EditLogic.setPhotoBeside(m, 'theStory', 0, 'b2');
}

/** Each case: the map the director left, the map the stop showed, and whether the gate takes it. */
const DECISION_CASES = [
  ['the map as shown', true, () => [clone(MAP), clone(MAP)]],
  ["every change the map's controls make", true, () => [everyChange(clone(MAP)), clone(MAP)]],
  ['a beat the director added with only its id and its move', true, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'b11', move: 'x' }); return [m, clone(MAP)]; }],
  ['a beat the director added under an id every object carries, once', true, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'toString', move: 'x' }); return [m, clone(MAP)]; }],
  // Phase 4b (brief 1D): a beat that still names its material is the old shape, refused.
  ['a beat that names its material', false, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'b11', material: 'x' }); return [m, clone(MAP)]; }],
  ['no top photo', true, () => { const m = clone(MAP); delete m.topPhoto; return [m, clone(MAP)]; }],
  ["the writer's repeated beat id, left as shown", true, () => [writersRepeat(), writersRepeat()]],
  ["the writer's repeat left alone, another beat struck", true, () => [EditLogic.strikeBeat(writersRepeat(), 'b4'), writersRepeat()]],
  ['the director repeats a beat id', false, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'b3', move: 'x' }); return [m, clone(MAP)]; }],
  ['the director repeats a beat id in left out, read trimmed', false, () => { const m = clone(MAP); m.leftOut.push({ id: ' b1 ', move: 'x' }); return [m, clone(MAP)]; }],
  ["a repeat with no map shown, read as the director's", false, () => [writersRepeat(), null]],
  // Task 4.6e: a shown value that is no map is no map shown, though its left out holds the
  // repeat, where the map shown's repeats would read it as the writer's.
  ["a repeat in a shown value with no list of sections, read as the director's", false, () => { const m = clone(MAP); m.leftOut.push(clone(MAP.leftOut[0])); return [m, { leftOut: clone(m.leftOut) }]; }],
  ["a repeat in a shown value whose sections are no list, read as the director's", false, () => { const m = clone(MAP); m.leftOut.push(clone(MAP.leftOut[0])); return [m, { sections: {}, leftOut: clone(m.leftOut) }]; }],
  ['a headline one under its shortest', false, () => { const m = clone(MAP); m.headline = 'Too short'; return [m, clone(MAP)]; }],
  ['a deck one over its longest', false, () => { const m = clone(MAP); m.deck = 'd'.repeat(301); return [m, clone(MAP)]; }],
  ['a slot the theme has none of', false, () => { const m = clone(MAP); m.sections[3].slot = 'epilogue'; return [m, clone(MAP)]; }],
  ['a kind the map has none of', false, () => { const m = clone(MAP); m.sections[1].beats[0].kind = 'quote'; return [m, clone(MAP)]; }],
  ['a key the map has none of', false, () => { const m = clone(MAP); m.lede = { hook: 'x' }; return [m, clone(MAP)]; }],
  ['an expected length that is not a whole number', false, () => { const m = clone(MAP); m.expectedLength = 1200.5; return [m, clone(MAP)]; }],
  ['a list for a map', false, () => [[], clone(MAP)]],
  ['no map at all', false, () => [null, clone(MAP)]]
];

describe("4.9: the console's validator decides as the gate does (ruling 3)", () => {
  test.each(DECISION_CASES)('%s', (_name, accepts, build) => {
    const [left, shown] = build();
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: accepts, console: accepts });
    const problem = ViewLogic.mapProblems(left, { outline: shown, mapSlots: SLOTS });
    expect(problem === null).toBe(accepts);
  });

  test('a refusal names the place in words the director reads', () => {
    const m = clone(MAP);
    m.headline = 'Too short';
    expect(ViewLogic.mapProblems(m, { outline: clone(MAP), mapSlots: SLOTS }))
      .toBe('The map cannot be sent yet: the headline must be 10 to 200 characters.');
    const r = clone(MAP);
    r.sections[0].beats.push({ id: 'b3', move: 'Alex at the window' });
    // Phase 4b (brief 1D; spec 9): a beat by its move, never by its id.
    expect(ViewLogic.mapProblems(r, { outline: clone(MAP), mapSlots: SLOTS }))
      .toBe('The map cannot be sent yet: Lede, beat "Alex at the window" shares its id with another beat: your changes made this repeat. Give each beat an id of its own.');
  });
});

/** Each case: the map the director left, the map the stop showed, and whether the gate takes it under 4.6b's rule. */
const PHOTO_CASES = [
  ['a top photo set to a photo already in a section', false, () => { const m = clone(MAP); m.topPhoto = 'p2.jpg'; return [m, clone(MAP)]; }],
  ['a photo copied into a second section', false, () => { const m = clone(MAP); m.sections[3].photos.push({ filename: 'P2.JPG' }); return [m, clone(MAP)]; }],
  ["the writer's photo placed twice, left as shown", true, () => { const w = clone(MAP); w.sections[3].photos.push({ filename: 'p2.jpg' }); return [clone(w), w]; }],
  ['every photo moved by the controls, each placed once', true, () => [everyChange(clone(MAP)), clone(MAP)]],
  ['a photo placed once under a name every object carries', true, () => { const m = clone(MAP); m.sections[2].photos.push({ filename: 'constructor' }); return [m, clone(MAP)]; }]
];

// Brief 4.9, ruling 3: 4.6b added this rule to the gate (lib/map.js directorMapProblems), and
// the console refuses what the gate refuses: each case holds both sides.
describe('4.9: a photo the director\'s changes place more than once is refused (4.6b\'s rule, ruling 3)', () => {
  test.each(PHOTO_CASES)('%s', (_name, accepts, build) => {
    const [left, shown] = build();
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: accepts, console: accepts });
  });

  test('the refusal names the photo and says the repeat is the director\'s', () => {
    const [left, shown] = PHOTO_CASES[0][2]();
    expect(ViewLogic.mapProblems(left, { outline: shown, mapSlots: SLOTS }))
      .toBe('The map cannot be sent yet: the top photo places p2.jpg a second time: your changes made this repeat. Place each photo once.');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The map's readers are the edit logic's: one rule for a repeat (fix round 1)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A map whose writer gave two beats the id b2 (one read trimmed) and placed p2.jpg twice (once
 * under a folder, in capitals), beside a beat and a photo under names every object carries.
 */
function writersRepeats() {
  const map = clone(MAP);
  map.sections[3].beats.push({ id: ' b2 ', kind: 'line', move: 'A second beat under b2', players: [] });
  map.sections[0].beats.push({ id: 'toString', kind: 'scene', move: 'A beat under a name every object carries', players: [] });
  map.sections[3].photos.push({ filename: 'photos/P2.JPG' });
  map.sections[2].photos.push({ filename: 'constructor' });
  return map;
}

describe("4.9 fix round 1: the validator and the page read one rule for a repeat, and the map's readers are the edit logic's", () => {
  test('mapRepeats lists each beat id and each photo a map repeats, once, in the order of its first place', () => {
    expect(EditLogic.mapRepeats(writersRepeats())).toEqual({ beatIds: ['b2'], photoKeys: ['p2.jpg'] });
    const two = clone(MAP);
    two.sections[3].beats.push({ id: 'b5', move: 'x' }, { id: 'b1', move: 'y' });
    two.sections[1].photos.push({ filename: 'HERO.jpg' });
    expect(EditLogic.mapRepeats(two)).toEqual({ beatIds: ['b1', 'b5'], photoKeys: ['hero.jpg'] });
    expect(EditLogic.mapRepeats(clone(MAP))).toEqual({ beatIds: [], photoKeys: [] });
    expect(EditLogic.mapRepeats(null)).toEqual({ beatIds: [], photoKeys: [] });
  });

  test("each beat and photo is listed where the gate's paths name it; a beat with no id and a photo with no filename are not listed", () => {
    const map = clone(MAP);
    map.leftOut.push({ move: 'A beat with no id' });
    map.sections[2].photos.push({ beat: 'b5' });
    expect(EditLogic.mapBeatPlacements(map)).toEqual([
      { id: 'b1', at: 'lede', path: '/sections/0/beats/0' },
      { id: 'b2', at: 'theStory', path: '/sections/1/beats/0' },
      { id: 'b3', at: 'theStory', path: '/sections/1/beats/1' },
      { id: 'b4', at: 'theStory', path: '/sections/1/beats/2' },
      { id: 'b5', at: 'followTheMoney', path: '/sections/2/beats/0' },
      { id: 'b6', at: 'closing', path: '/sections/3/beats/0' },
      { id: 'b9', at: 'leftOut', path: '/leftOut/0' }
    ]);
    expect(EditLogic.mapPhotoPlacements(map)).toEqual([
      { filename: 'hero.jpg', at: 'topPhoto', path: '/topPhoto' },
      { filename: 'p2.jpg', at: 'theStory', path: '/sections/1/photos/0' }
    ]);
  });

  test('the page locks the lines under the repeats mapRepeats finds in the map shown, and no other line', () => {
    const shown = writersRepeats();
    const d = payloadOf(stateAt({ outline: shown, _mapBaseline: clone(shown) }));
    const view = ViewLogic.mapView(d, opened(d));
    const beats = [...view.sections.flatMap((s) => s.beats), ...view.leftOut.items];
    const photos = view.sections.flatMap((s) => s.photos);
    expect(beats.filter((b) => b.locked).map((b) => b.id)).toEqual(['b2', 'b2']);
    expect(photos.filter((p) => p.locked).map((p) => p.filename)).toEqual(['p2.jpg', 'photos/P2.JPG']);
  });

  test("the validator takes the writer's repeats the page locks, and refuses the same repeats as the director's, at the places the map shown does not hold", () => {
    const shown = writersRepeats();
    expect(EditLogic.validateMapShape(clone(shown), { slots: SLOTS, shown })).toEqual({ valid: true, errors: [] });
    expect(EditLogic.validateMapShape(clone(shown), { slots: SLOTS, shown: clone(MAP) }).errors.map((e) => e.path))
      .toEqual(['/sections/3/beats/1', '/sections/3/photos/0']);
  });

  test("a beat's editor opens on the beat the moves find: by its id read trimmed, in a section or in left out", () => {
    const map = clone(MAP);
    expect(EditLogic.beatWithId(map, 'b3')).toBe(map.sections[1].beats[1]);
    expect(EditLogic.beatWithId(map, ' b9 ')).toBe(map.leftOut[0]);
    expect(EditLogic.beatWithId(map, 'b77')).toBeNull();
    expect(EditLogic.beatWithId(null, 'b1')).toBeNull();
  });

  // Phase 4b (brief 1D; R4): the card is the piece a beat flags, read through beatCardOf.
  test("a beat's card on the page is beatCardOf's, the one rule for which beats are cards", () => {
    const map = clone(MAP);
    map.sections[1].beats[1].evidence[0].sources = ['  mor001  '];
    map.sections[1].beats[2].evidence[0].sources = ['   '];
    const data = payloadOf(stateAt());
    const view = ViewLogic.mapView(data, map);
    expect(view.sections[1].beats.map((b) => b.card)).toEqual(map.sections[1].beats.map((b) => Boolean(EditLogic.beatCardOf(b))));
    expect(view.sections[1].beats.map((b) => b.card)).toEqual([true, true, false]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The payloads and the buttons
// ═══════════════════════════════════════════════════════════════════════════

describe("4.9: the map's payloads are 4.6's", () => {
  const map = () => everyChange(opened());

  test('approve carries the map as the director left it, and a note only as typed', () => {
    expect(ViewLogic.mapPayload('approve', map(), '')).toEqual({ outline: 'approve', map: map() });
    expect(ViewLogic.mapPayload('approve', map(), '   ')).toEqual({ outline: 'approve', map: map() });
    expect(ViewLogic.mapPayload('approve', map(), ' Keep the bonus. ')).toEqual({ outline: 'approve', map: map(), note: ' Keep the bonus. ' });
  });

  test('a send-back carries its note and the map as the director left it; with no note there is none to send', () => {
    expect(ViewLogic.mapPayload('send-back', map(), 'Lead with the bonus.')).toEqual({ outline: 'send-back', map: map(), note: 'Lead with the bonus.' });
    expect(ViewLogic.mapPayload('send-back', map(), '  ')).toBeNull();
  });

  test('an action the map does not take throws, and no map builds no payload', () => {
    expect(() => ViewLogic.mapPayload('reweave', map(), 'x')).toThrow(/approve or send-back/);
    expect(ViewLogic.mapPayload('approve', null, '')).toBeNull();
  });

  test('the payload is a copy: a later change to the map on screen does not reach it', () => {
    const left = map();
    const payload = ViewLogic.mapPayload('approve', left, '');
    left.headline = 'Changed after the send';
    expect(payload.map.headline).toBe('The Ledger Kept Talking');
  });

  test('the buttons: Approve, and Send back on its note in two clicks', () => {
    const idle = ViewLogic.mapButtons('', false);
    expect(idle.approve.label).toBe('Approve');
    expect(idle.sendBack).toMatchObject({ label: 'Send back', disabled: true });
    expect(ViewLogic.mapButtons('A note.', false).sendBack).toMatchObject({ label: 'Send back', disabled: false });
    expect(ViewLogic.mapButtons('A note.', true).sendBack).toMatchObject({ label: 'Confirm send back, starts a rework', armed: true });
    expect(ViewLogic.mapButtons('A note.', true).sendBack.ariaLabel).toContain('the map');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The pending edits across a remount and a new version
// ═══════════════════════════════════════════════════════════════════════════

describe('4.9: the map and the note survive a remount of the same map version, and clear on a new one', () => {
  const data = () => payloadOf(stateAt());
  const nextVersion = () => {
    const reworked = clone(MAP);
    reworked.sections[0].job = 'Open on the vote, then the sale.';
    return payloadOf(stateAt({ outline: reworked, humanOutlineRevisionCount: 1 }));
  };
  const draft = () => EditLogic.strikeBeat(opened(data()), 'b4');

  test('the version is keyed the way computeResetKey keys the meeting: the map and both round counters', () => {
    const d = { ...data(), humanRevisionCount: 2, revisionCount: 1 };
    expect(ViewLogic.mapVersion(d)).toBe(EditLogic.computeResetKey(d.outline, 2 * 1000 + 1));
    expect(ViewLogic.mapVersion({ ...d, revisionCount: 0 })).not.toBe(ViewLogic.mapVersion(d));
    expect(ViewLogic.mapVersion(nextVersion())).not.toBe(ViewLogic.mapVersion(data()));
  });

  test("CHECKPOINT_RECEIVED keeps the map's slot and its note for the same version, and clears every other slot", () => {
    const slot = ViewLogic.mapPendingSlot(data(), draft());
    expect(slot).toEqual({ version: ViewLogic.mapVersion(data()), map: draft() });
    const pending = { outline: slot, 'outline:note': 'Keep the bonus.', article: { sections: [] }, 'arc-selection': { version: 'x' } };
    expect(ViewLogic.pendingEditsAfterCheckpoint(pending, 'outline', data())).toEqual({ outline: slot, 'outline:note': 'Keep the bonus.' });
  });

  test("a new version, the counters moving alone, or another stop clears the map's slot too", () => {
    const pending = { outline: ViewLogic.mapPendingSlot(data(), draft()), 'outline:note': 'Keep the bonus.' };
    expect(ViewLogic.pendingEditsAfterCheckpoint(pending, 'outline', nextVersion())).toEqual({});
    expect(ViewLogic.pendingEditsAfterCheckpoint(pending, 'outline', { ...data(), revisionCount: 1 })).toEqual({});
    expect(ViewLogic.pendingEditsAfterCheckpoint(pending, 'article', data())).toEqual({});
    expect(ViewLogic.pendingEditsAfterCheckpoint({ outline: { lede: {} } }, 'outline', data())).toEqual({});
  });

  test("the map reopens on the director's map and note for the same version, and on the stop's map for a new one", () => {
    const slot = ViewLogic.mapPendingSlot(data(), draft());
    expect(ViewLogic.mapDraftOf(data(), slot)).toEqual(draft());
    expect(ViewLogic.mapNoteOf(data(), slot, 'Keep the bonus.')).toBe('Keep the bonus.');
    expect(ViewLogic.mapDraftOf(nextVersion(), slot)).toEqual(nextVersion().outline);
    expect(ViewLogic.mapNoteOf(nextVersion(), slot, 'Keep the bonus.')).toBe('');
    expect(ViewLogic.mapDraftOf(data(), undefined)).toEqual(clone(MAP));
    expect(ViewLogic.mapDraftOf({ outline: { lede: {} } }, undefined)).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The page
// ═══════════════════════════════════════════════════════════════════════════

describe("4.9: the map's page before any round", () => {
  const data = payloadOf(stateAt());
  const view = ViewLogic.mapView(data, opened(data));

  test('the settled story at the top, read-only, with the way back to the meeting', () => {
    expect(view.settledStory).toEqual({ story: data.settledStory.story, question: data.settledStory.question });
    expect(view.storyHint).toBe('The story was settled at the story meeting. To change it, go back to the meeting: it reopens as you left it, with no model call.');
  });

  test('the headline, the deck and the top photo, which moves to any section', () => {
    expect(view.headline).toEqual({ text: MAP.headline, concerns: [] });
    expect(view.deck).toEqual({ text: MAP.deck, concerns: [] });
    expect(view.topPhoto).toMatchObject({ filename: 'hero.jpg', locked: false, concerns: [] });
    expect(view.topPhoto.moveTargets).toEqual([
      { value: 'lede', label: 'Lede' }, { value: 'theStory', label: 'The Story' },
      { value: 'followTheMoney', label: 'Follow the Money' }, { value: 'closing', label: 'Closing' }
    ]);
  });

  test("the sections in the map's order, each under its slot's label with its heading, job, beats and photos", () => {
    expect(view.sections.map((s) => [s.slot, s.label, s.heading, s.beats.map((b) => b.id), s.photos.map((p) => p.filename)])).toEqual([
      ['lede', 'Lede', '', ['b1'], []],
      ['theStory', 'The Story', 'The Story', ['b2', 'b3', 'b4'], ['p2.jpg']],
      ['followTheMoney', 'Follow the Money', 'Follow the Money', ['b5'], []],
      ['closing', 'Closing', '', ['b6'], []]
    ]);
    expect(view.sections[1].job).toBe('How the sale and the envelope sat under the vote.');
  });

  // Phase 4b (brief 1D; spec 9): its move, its people and its card mark, with its evidence
  // folded; its kind and its connection stay underneath.
  test("each beat with its move, its players, its card mark and its evidence folded, and the sections it can move to", () => {
    expect(view.sections[1].beats[0]).toMatchObject({
      id: 'b2', move: 'Marcus brags about the sale', players: 'Alex', card: true, noEvidence: '',
      added: false, locked: false, concerns: [], failures: []
    });
    expect(view.sections[1].beats[0].evidence.map((piece) => piece.shows)).toEqual(['Marcus on the sale: "Worth it. Finally worth it."']);
    ['kindLabel', 'material', 'materialText', 'cardText', 'connection'].forEach((field) => expect(view.sections[1].beats[0]).not.toHaveProperty(field));
    expect(view.sections[1].beats[0].moveTargets.map((t) => t.value)).toEqual(['lede', 'followTheMoney', 'closing']);
  });

  test('each photo beside its beat, with the beats of its section to sit beside, the top and the other sections to move to', () => {
    const photo = view.sections[1].photos[0];
    expect(photo).toMatchObject({ filename: 'p2.jpg', slot: 'theStory', index: 0, beat: 'b2', locked: false });
    expect(photo.besideOptions).toEqual([
      { value: '', label: 'By itself, with its people' },
      { value: 'b2', label: 'Beside: Marcus brags about the sale' },
      { value: 'b3', label: 'Beside: Morgan pays Riley at the bar' },
      { value: 'b4', label: 'Beside: The paternity result names Sarah' }
    ]);
    expect(photo.moveTargets.map((t) => t.value)).toEqual(['topPhoto', 'lede', 'followTheMoney', 'closing']);
    expect(photo.moveTargets[0].label).toBe('The top of the article');
  });

  test('the dropped sections with their reasons, and the tray, always open (R8), each item with the sections to bring it back to', () => {
    expect(view.dropped).toEqual([
      { key: 'dropped-thePlayers', slot: 'thePlayers', label: 'The Players', reason: 'Every player appears above.', concerns: [] },
      { key: 'dropped-whatsMissing', slot: 'whatsMissing', label: "What's Missing", reason: "Its question is the closing's.", concerns: [] }
    ]);
    expect(view.leftOut).toMatchObject({ title: 'Left out (1)' });
    expect(view.leftOut).not.toHaveProperty('open');
    expect(view.leftOut.items[0]).toMatchObject({ id: 'b9', move: 'An unsigned letter threatens Marcus', players: '', concerns: [] });
    expect(view.leftOut.items[0].targets.map((t) => t.value)).toEqual(['lede', 'theStory', 'followTheMoney', 'closing']);
  });

  test('nothing from a round: no round line, no check, no changed edit, no concern elsewhere, no change to the weave', () => {
    expect([view.round, view.checkFailures, view.changedEdits, view.kept, view.otherConcerns, view.weaveChanges])
      .toEqual([null, [], [], '', [], []]);
  });
});

describe("4.9: the director's changes on the page", () => {
  const data = payloadOf(stateAt());

  test('a beat the director added offers to be taken out; a beat the writer gave a repeated id has its controls off', () => {
    const added = ViewLogic.mapView(data, EditLogic.addBeat(opened(data), 'closing', 'Riley leaves town', 'Riley'));
    expect(added.sections[3].beats.map((b) => [b.id, b.added])).toEqual([['b6', false], ['b10', true]]);
    const repeated = payloadOf(stateAt({ outline: writersRepeat(), _mapBaseline: writersRepeat() }));
    const view = ViewLogic.mapView(repeated, opened(repeated));
    expect(view.sections[1].beats[0]).toMatchObject({ id: 'b2', locked: true });
    expect(view.sections[3].beats[1]).toMatchObject({ id: 'b2', locked: true });
    expect(view.sections[1].beats[1]).toMatchObject({ id: 'b3', locked: false });
    expect(view.lockedHint).toBe('The writer gave one id to more than one beat, or placed a photo twice, so the map cannot move or edit those lines: a send-back gives each its own place.');
  });

  test('a photo the writer placed twice has its controls off', () => {
    const twice = clone(MAP);
    twice.sections[3].photos.push({ filename: 'p2.jpg' });
    const d = payloadOf(stateAt({ outline: twice, _mapBaseline: twice }));
    const view = ViewLogic.mapView(d, opened(d));
    expect([view.sections[1].photos[0].locked, view.sections[3].photos[0].locked, view.topPhoto.locked]).toEqual([true, true, false]);
  });
});

describe('4.9: with a check still failing and with a concern', () => {
  /** The stop after the director struck b4: their strike took the third card and Sarah's only beat. */
  function struckState() {
    const left = EditLogic.strikeBeat(clone(MAP), 'b4');
    const concerns = [
      directorEditConcern(['E1'], 'Sarah is in no beat and not in the gap note.'),
      directorEditConcern(['E9'], 'An edit the map no longer carries.')
    ];
    return stateAt({
      outline: left,
      _outlineHandEdits: standingOnMap(null, clone(MAP), left),
      _mapCheck: { mapKey: mapKey(left), passed: false, failures: [{ type: 'connection-not-landed', message: 'Connections from the settled weave that land in no beat: c3.' }], concerns }
    });
  }
  const data = payloadOf(struckState());
  const view = ViewLogic.mapView(data, opened(data));

  test('a code check still failing, in one line', () => {
    expect(view.checkFailures).toEqual(['Check still failing: Connections from the settled weave that land in no beat: c3.']);
  });

  test('the concern sits beside the line of the edit it is about, in the tray, which is always open', () => {
    expect(view.leftOut.items.map((i) => [i.id, i.concerns])).toEqual([
      ['b9', []],
      ['b4', ['Concern: Sarah is in no beat and not in the gap note.']]
    ]);
    expect(view.otherConcerns).toEqual([]);
  });

  test("a concern whose place is not on the page is listed on its own", () => {
    const d = { ...data, concerns: [{ text: directorEditConcern(['E2'], 'A beat that is gone.'), editIds: ['E2'], places: [{ id: 'E2', path: 'sections[#closing].beats[#b77]', where: 'x' }] }] };
    expect(ViewLogic.mapView(d, opened(d)).otherConcerns).toEqual(['Concern: A beat that is gone.']);
  });
});

describe('4.9: after a send-back and an automatic pass', () => {
  const STRUCK = EditLogic.strikeBeat(EditLogic.moveBeat(clone(MAP), 'b3', 'closing'), 'b4');

  test('the round and the note it was sent back with', () => {
    // Task 4.12e: the state as the rework leaves it, the slot cleared and the note filed in the
    // round it was sent in, where the payload reads the round's note (roundNoteOf).
    const sent = { gate: 'outline', kind: 'rejection', round: 1, stopRound: 1, text: 'Lead with the bonus.', at: 't' };
    const d = payloadOf(stateAt({ humanOutlineRevisionCount: 1, _outlineFeedback: null, directorGateNotes: [sent] }));
    expect(ViewLogic.mapView(d, opened(d)).round).toEqual({ label: 'Round 2', note: 'You sent the map back with: "Lead with the bonus."' });
  });

  // 4.10 (the integrator's ruling 8 on 4.9's minors): code put both back, so they ask nothing
  // of the director, and the map lists neither. The line each would read is changedEditLine's.
  test('an automatic pass that brought back a struck beat and moved a placed one: code put both back, so the map lists neither', () => {
    const edits = standingOnMap(null, clone(MAP), STRUCK).edits;
    const pass = clone(STRUCK);
    pass.sections[1].beats.push(pass.leftOut.pop());
    pass.sections[1].beats.push(pass.sections[3].beats.pop());
    const { report } = settleEdits(null, { edits, before: STRUCK, after: pass, pass: 1 });
    expect(report.changed.map((c) => [c.automatic, c.restored])).toEqual([[true, true], [true, true]]);
    const d = payloadOf(stateAt({ outline: STRUCK, _outlineHandEditReport: report }));
    expect(ViewLogic.mapView(d, opened(d)).changedEdits).toEqual([]);
    // Phase 4b (brief 1D; spec 9): each beat by its move on the map, never by its id.
    expect(report.changed.map((c) => ViewLogic.changedEditLine(c, ViewLogic.mapEditLineOptions(SLOTS.map((s) => ({ key: s.key, label: s.label })), STRUCK)))).toEqual([
      'Closing, the move "Morgan pays Riley at the bar", moved from The Story: automatic pass 1 moved the move you placed here to The Story. It was put back.',
      'Left out, the move "The paternity result names Sarah", struck from The Story: automatic pass 1 brought it back. It was struck again.'
    ]);
  });

  test("a send-back's rework that changed one of the director's lines, with its reason", () => {
    const left = clone(MAP);
    left.sections[3].beats[0].move = 'Riley keeps the books, and a second ledger';
    const edits = standingOnMap(null, clone(MAP), left).edits;
    const rework = clone(left);
    rework.sections[3].beats[0].move = 'Riley keeps the books';
    const report = reportAfterPass(null, { edits, before: left, after: rework, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks for the plain line.' }] });
    const d = payloadOf(stateAt({ outline: rework, _outlineHandEditReport: report }));
    expect(changedLinesOf(ViewLogic.mapView(d, opened(d)))).toEqual([
      'Closing, the move "Riley keeps the books": your "Riley keeps the books, and a second ledger" became "Riley keeps the books" (the rework of your send-back). Why: The note asks for the plain line.'
    ]);
  });

  test('a round whose passes kept every edit says so', () => {
    const d = payloadOf(stateAt({ _outlineHandEditReport: { checked: ['E1', 'E2'], changed: [] } }));
    // 4.10b: the line says the edits stand, which holds too when code put a change back.
    expect(ViewLogic.mapView(d, opened(d)).kept).toBe('Both of your edits stand.');
  });
});

describe("4.9: the map's changes to the weave, and the standing notes", () => {
  test('each change to the weave with its source: an edit at the meeting, or the meeting note', () => {
    const map = { ...clone(MAP), weaveChanges: [{ source: 'E2', change: 'The envelope lands in the lede.' }, { source: 'note', change: 'The heir thread closes the map.' }] };
    const d = payloadOf(stateAt({ outline: map, _mapBaseline: clone(map) }));
    // 4.14b: an edit is named by its place among the meeting's changes, never by an id the
    // meeting does not show; this state's weave carries no change of the director's.
    expect(ViewLogic.mapView(d, opened(d)).weaveChanges).toEqual([
      { key: 'change-0', source: 'Your change at the meeting', change: 'The envelope lands in the lede.' },
      { key: 'change-1', source: 'Your note at the meeting', change: 'The heir thread closes the map.' }
    ]);
  });

  test("the standing notes, each under its stop's label, through the builder every stop reads", () => {
    const notes = [
      { gate: 'arc-selection', kind: 'approval', round: 1, text: 'Lead with the vote.' },
      { gate: 'outline', kind: 'rejection', round: 1, text: 'Strike the paternity card.' }
    ];
    const LABELS = { 'arc-selection': 'Story meeting', outline: 'Map' };
    expect(ViewLogic.standingNotesView(notes, LABELS)).toEqual({
      any: true,
      title: 'Standing notes (2)',
      items: [
        { key: 'note-0', label: 'Story meeting, approval note 1', text: 'Lead with the vote.' },
        { key: 'note-1', label: 'Map, rework note 1', text: 'Strike the paternity card.' }
      ]
    });
    expect(ViewLogic.meetingStandingNotes(notes, LABELS)).toEqual(ViewLogic.standingNotesView(notes, LABELS));
  });
});

// Task 4.11: a stop with no map went with the old-thread guard. Only a thread from before
// the story meeting reached one, and the console now shows the server's message in its
// place (checkpoint-view-logic-old-thread.test.js).
describe('4.9: the photos', () => {
  test("a photo's thumbnail is the session's photos folder, which the console serves to a logged-in director", () => {
    expect(ViewLogic.mapPhotoUrl('100326', 'Alex & Sarah.jpg')).toBe('/sessionphotos/100326/Alex%20%26%20Sarah.jpg');
    expect(ViewLogic.mapPhotoUrl('', 'a.jpg')).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The builders every stop shares
// ═══════════════════════════════════════════════════════════════════════════

describe('4.9: the builders the map shares with the meeting and the desk', () => {
  test("changedEditLine names a moved element as the stop does: a block at the desk, a beat or a photo on the map", () => {
    const entry = { id: 'E1', scope: 'map', where: 'x', moved: true, director: '', became: null, pass: 1, automatic: true, reason: null, restored: false };
    expect(ViewLogic.changedEditLine(entry)).toBe('E1, x: automatic pass 1 removed the block you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.');
    expect(ViewLogic.changedEditLine(entry, { thing: () => 'photo' })).toBe('E1, x: automatic pass 1 removed the photo you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.');
  });

  test('concernsBesideLines places each concern beside the lines of its places, and lists apart one with none on the page', () => {
    const concerns = [
      { text: "Director's edit E1: a finding.", places: [{ path: 'headline' }, { path: 'headline' }] },
      { text: "Director's edit E2: another.", places: [{ path: 'nowhere' }] },
      'not a concern'
    ];
    const placed = ViewLogic.concernsBesideLines(concerns, new Set(['headline']), (path) => path);
    expect([...placed.byLine]).toEqual([['headline', ['Concern: a finding.']]]);
    expect(placed.other).toEqual(['Concern: another.']);
  });

  test("the map's lines on the page and the line each place sits on", () => {
    const map = { ...clone(MAP), gapNote: { line: 'x', players: [] } };
    expect([...ViewLogic.mapLinesOnPage(map)].sort()).toEqual([
      'beat:b1', 'beat:b2', 'beat:b3', 'beat:b4', 'beat:b5', 'beat:b6', 'beat:b9', 'deck', 'dropped:thePlayers', 'dropped:whatsMissing',
      'expectedLength', 'gapNote', 'headline', 'photo:p2.jpg', 'section:closing', 'section:followTheMoney', 'section:lede', 'section:theStory',
      'topPhoto', 'weaveChanges'
    ]);
    [
      ['sections[#theStory].beats[#b2].move', 'beat:b2'],
      ['leftOut[#b4]', 'beat:b4'],
      ['sections[#theStory].photos[#P2.JPG]', 'photo:p2.jpg'],
      ['sections[#closing].job', 'section:closing'],
      ['sections[#closing]', 'section:closing'],
      ['dropped[#thePlayers].reason', 'dropped:thePlayers'],
      ['gapNote.line', 'gapNote'],
      ['topPhoto', 'topPhoto'],
      ['headline', 'headline'],
      ['weaveChanges', 'weaveChanges'],
      ['expectedLength', 'expectedLength'],
      ['somethingElse', null]
    ].forEach(([path, key]) => expect([path, ViewLogic.mapLineKeyOf(path)]).toEqual([path, key]));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6c: the map's follow-ups (the integrator's ruling 3 on the follow-ups, and ruling 4
// on 4.9's minors and hand-offs)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The fixture's documents as server.js buildEvidenceIndex keys them for the map's payload
 * (__tests__/unit/get-checkpoint-data.test.js holds the server's index to these names).
 */
const INDEX = (() => {
  const { DOCUMENT_TEXT } = require('../../lib/__tests__/fixtures/rework-state');
  return {
    ale003: { name: 'ALE003 - The sale', owner: 'Alex Reeves', type: 'memory', firstLine: DOCUMENT_TEXT.ale003 },
    mor001: { name: 'MOR001 - The envelope', owner: 'Morgan Reed', type: 'memory', firstLine: DOCUMENT_TEXT.mor001 },
    'p-dna': { name: 'DNA test', owner: 'Sarah Blackwood', type: 'paper', firstLine: DOCUMENT_TEXT['p-dna'] },
    'p-rescued': { name: 'Rescued letter', owner: '', type: 'paper', firstLine: DOCUMENT_TEXT['p-rescued'] }
  };
})();

// Phase 4b (brief 1D; spec 9): each move's fold names each piece's sources in words, a document
// by its name and owner through the payload's evidenceIndex, as the story meeting's folds do
// (evidenceFoldView), and the move itself prints as written.
describe("4.6c: the map's folds name each piece's documents in words, through the evidence index", () => {
  const state = stateAt();
  const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'hero.jpg'), evidenceIndex: INDEX, maxRevisions: 1 });

  test("each piece names its document by its name and owner, the ledger and the director's notes in words, and a document the index lacks as written", () => {
    const map = opened(data);
    map.sections[3].beats[0].evidence.push({ sources: ['zzz999'], shows: 'A document no record holds.', stance: 'cuts-against' });
    const view = ViewLogic.mapView(data, map);
    expect(view.sections.flatMap((s) => s.beats).map((b) => [b.id, b.move, b.evidence.map((piece) => piece.text)])).toEqual([
      ['b1', 'The deadlock between Alex and Morgan, then the vote for an overdose', ['Your notes: Alex and Morgan argued at the bar.']],
      ['b2', 'Marcus brags about the sale', ['ALE003 - The sale (Alex Reeves): Marcus on the sale: "Worth it. Finally worth it."']],
      ['b3', 'Morgan pays Riley at the bar', ['MOR001 - The envelope (Morgan Reed): Morgan hands Riley an envelope by the bar, and Riley says "Not here."']],
      ['b4', 'The paternity result names Sarah', ['DNA test (Sarah Blackwood): The paternity test names Sarah Blackwood.']],
      ['b5', 'The sale pays into Melanie', ['The ledger: Melanie, $75,000 at 07:50 PM']],
      ['b6', 'Riley says they only kept the books', ['Your notes: Riley watched the ledger all morning.', 'Cuts against · zzz999: A document no record holds.']]
    ]);
    expect(view.leftOut.items[0].evidence.map((piece) => piece.text)).toEqual(['Rescued letter: A friend gives Marcus "until Friday".']);
  });

  test("a photo's place beside a beat names the beat by its move", () => {
    const view = ViewLogic.mapView(data, opened(data));
    expect(view.sections[1].photos[0].besideOptions.map((o) => o.label)).toEqual([
      'By itself, with its people',
      'Beside: Marcus brags about the sale',
      'Beside: Morgan pays Riley at the bar',
      'Beside: The paternity result names Sarah'
    ]);
  });
});

describe("4.6c: Everyone and the counts read mapTally's own inputs, which the payload carries", () => {
  test('the payload carries the roster with its full names and the photos kept for the article', () => {
    const state = stateAt();
    const data = payloadOf(state);
    expect(data.roster).toEqual(mapRosterOf(state.sessionConfig, state.canonicalCharacters));
    expect(data.keptPhotos).toEqual(['hero.jpg', 'p2.jpg']);
  });

  test('"In no move" lists the players in roster order after an edit', () => {
    const data = payloadOf(stateAt());
    let map = EditLogic.strikeBeat(opened(data), 'b3');
    map = EditLogic.strikeBeat(map, 'b4');
    map = EditLogic.strikeBeat(map, 'b6');
    expect(stateAt().sessionConfig.roster).toEqual(['Alex', 'Morgan', 'Sarah', 'Riley']);
    expect(ViewLogic.mapTallyOf(data, map).unplaced).toEqual(['Sarah', 'Riley']);
    expect(ViewLogic.mapView(data, map).tally.unplaced).toBe('In no move: Sarah, Riley');
  });

  test('a beat that names a player by a full name not opening with the first name places them, as the map checks do', () => {
    const base = stateAt();
    const named = clone(MAP);
    named.sections[2].beats[0].players = ['Cassandra Vale'];
    const state = stateAt({
      sessionConfig: { ...base.sessionConfig, roster: [...base.sessionConfig.roster, 'Cass'] },
      canonicalCharacters: { ...base.canonicalCharacters, Cass: 'Cassandra Vale' },
      outline: named,
      _mapBaseline: clone(named)
    });
    const data = payloadOf(state);
    expect(ViewLogic.mapTallyOf(data, opened(data)).unplaced).toEqual([]);
    // Task 4.6d: the stop sends no count of its own; the server counts the map in its checks.
    const { failures } = require('../../lib/map').mapFindings(named, { roster: mapRosterOf(state.sessionConfig, state.canonicalCharacters) });
    expect(failures.filter((f) => f.type === 'player-not-placed')).toEqual([]);
  });

  test('a roster player whose name every object carries counts as any other, on the page and in the checks', () => {
    const roster = [{ name: 'constructor', fullName: null }, { name: 'toString', fullName: null }, { name: 'Alex', fullName: 'Alex Reeves' }];
    const map = { sections: [{ slot: 'lede', heading: '', job: 'Open.', beats: [{ id: 'b1', kind: 'scene', move: 'x', players: ['constructor'] }], photos: [] }], leftOut: [] };
    expect(EditLogic.mapTally(map, { roster })).toMatchObject({
      everyone: [{ slot: 'lede', heading: '', players: ['constructor'] }],
      unplaced: ['toString', 'Alex']
    });
    const { failures } = require('../../lib/map').mapFindings(map, { roster });
    expect(failures.filter((f) => f.type === 'player-not-placed').map((f) => f.message))
      .toEqual([expect.stringMatching(/^Players in no beat: toString, Alex\. /)]);
  });
});

describe('4.6c: a beat taken out leaves no photo beside it', () => {
  test('add a beat, set a photo beside it, take the beat out: the photo stands by itself, with its people', () => {
    const map = opened();
    const added = EditLogic.addBeat(map, 'theStory', 'Alex at the window', 'Alex');
    const beside = EditLogic.setPhotoBeside(added, 'theStory', 0, 'b10');
    expect(beside.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b10' }]);
    const out = EditLogic.removeBeat(beside, 'b10');
    expect(out.sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(beatPlaces(out)).toEqual(beatPlaces(map));
    expect(beside.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b10' }]);
  });
});

describe('4.6c: the map is read by one rule wherever a map is read', () => {
  test("a section's editor opens on the section the editors and moves find by its slot", () => {
    const map = opened();
    expect(EditLogic.sectionWithSlot(map, 'theStory')).toBe(map.sections[1]);
    expect(EditLogic.sectionWithSlot(map, 'thePlayers')).toBeNull();
    expect(EditLogic.sectionWithSlot({ lede: {} }, 'lede')).toBeNull();
    expect(EditLogic.sectionWithSlot(null, 'lede')).toBeNull();
  });

  test('a shown value that is no map is no map shown, to the refusal as to the page', () => {
    const left = clone(MAP);
    left.sections[1].photos.push({ filename: 'hero.jpg' });
    const notAMap = { topPhoto: 'hero.jpg' };
    const noMapShown = ViewLogic.mapProblems(left, { outline: null, mapSlots: SLOTS });
    expect(noMapShown).toBe('The map cannot be sent yet: the top photo places hero.jpg a second time: your changes made this repeat. Place each photo once.');
    expect(ViewLogic.mapProblems(left, { outline: notAMap, mapSlots: SLOTS })).toBe(noMapShown);
    expect(ViewLogic.mapView({ outline: notAMap, mapSlots: SLOTS }, left).sections[1].beats.map((b) => b.added)).toEqual([true, true, true]);
  });
});

/** Names every object carries, as a beat id and as a photo's filename. */
const PROTOTYPE_NAMES = ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf'];

/** The fixture's map with a beat and a photo under each prototype name, each placed `times` times. */
function prototypeNamed(times) {
  const map = clone(MAP);
  PROTOTYPE_NAMES.forEach((name) => {
    for (let n = 0; n < times; n += 1) {
      const section = map.sections[n % 2 === 0 ? 2 : 3];
      section.beats.push({ id: name, kind: 'scene', move: `A beat under ${name}`, players: [] });
      section.photos.push({ filename: name });
    }
  });
  return map;
}

describe('4.6c: the gate, the checks and the console find one set of repeats, under names every object carries', () => {
  const kept = ['hero.jpg', 'p2.jpg', ...PROTOTYPE_NAMES];
  const checksFind = (map) => {
    const { failures } = require('../../lib/map').mapFindings(map, { keptPhotos: kept });
    return failures.filter((f) => f.type === 'duplicate-beat-id' || f.type === 'photo-placed-twice').map((f) => f.message.split('. ')[0]);
  };

  test("the writer's repeats, left as shown: the gate and the console take them, the checks list each, and mapRepeats finds the same", () => {
    const [left, shown] = [prototypeNamed(2), prototypeNamed(2)];
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: true, console: true });
    expect(EditLogic.mapRepeats(left)).toEqual({ beatIds: PROTOTYPE_NAMES, photoKeys: PROTOTYPE_NAMES.map((name) => name.toLowerCase()) });
    // Phase 4b (brief 1D): one failure for each repeat, beside its first place.
    expect(checksFind(left)).toEqual([
      ...PROTOTYPE_NAMES.map((name) => `Beats sharing the id ${name}: "A beat under ${name}" and "A beat under ${name}"`),
      ...PROTOTYPE_NAMES.map((name) => `The photo ${name} is placed more than once`)
    ]);
  });

  test("the same repeats made by the director's changes: the gate and the console refuse them", () => {
    const [left, shown] = [prototypeNamed(2), prototypeNamed(1)];
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: false, console: false });
    expect(directorMapProblems(left, { theme: 'journalist', shown })).toMatch(/^Two beats share the id "constructor", "toString", "__proto__", "hasOwnProperty" and "valueOf"/);
  });

  test('each name placed once: the gate and the console take the map, and the checks find no repeat', () => {
    const [left, shown] = [prototypeNamed(1), clone(MAP)];
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: true, console: true });
    expect(EditLogic.mapRepeats(left)).toEqual({ beatIds: [], photoKeys: [] });
    expect(checksFind(left)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10: one rule for which changed lines a stop shows (the integrator's ruling 8 on 4.9's
// minors). The map lists what a send-back's rework changed of the director's edits, with its
// reason, and what any other pass changed that code did not put back; an entry code put back
// asks nothing of the director. The map reads the rule the meeting and the desk read.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.10: the map lists the changes no pass put back, and a send-back\'s with their reasons', () => {
  const entry = (fields) => ({ cut: false, removed: false, moved: false, reason: null, restored: false, ...fields });
  /** The map's changed lines for a report holding these entries. */
  function linesFor(changed) {
    const d = { ...payloadOf(stateAt()), handEditReport: { checked: changed.map((c) => c.id), changed } };
    return changedLinesOf(ViewLogic.mapView(d, opened(d)));
  }

  test('an automatic change code put back is not listed', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'map', where: 'section "closing", beat "b6", move', director: 'Riley keeps the books.', became: 'Riley kept nothing.', pass: 1, automatic: true, restored: true })])).toEqual([]);
  });

  test('a cut that came back is listed, still on the map', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'map', where: 'section "closing", beat "b6", move', cut: true, director: 'and the second ledger', became: 'Riley says they only kept the books, and the second ledger', pass: 1, automatic: true })]))
      .toEqual(['Closing, the move "Riley says they only kept the books": the text you cut came back as "Riley says they only kept the books, and the second ledger" (automatic pass 1). It is still on the map: cut it again if it should go.']);
  });

  test("a send-back's change is listed with its reason", () => {
    expect(linesFor([entry({ id: 'E2', scope: 'map', where: 'section "closing", beat "b6", move', director: 'Riley keeps the books.', became: 'Riley kept nothing.', pass: SEND_BACK_PASS, automatic: false, reason: 'The note asks for the plain line.' })]))
      .toEqual(['Closing, the move "Riley says they only kept the books": your "Riley keeps the books." became "Riley kept nothing." (the rework of your send-back). Why: The note asks for the plain line.']);
  });

  test('a beat a pass removed is listed: only its place was the director\'s, so code did not put it back', () => {
    expect(linesFor([entry({ id: 'E3', scope: 'map', where: 'section "closing", beat "b3", moved from section "theStory"', moved: true, director: 'b3', became: null, pass: 1, automatic: true })]))
      .toEqual(['Closing, the move "Morgan pays Riley at the bar", moved from The Story: automatic pass 1 removed the move you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6d: the gate and the console read the map the stop showed by one rule (the integrator's
// ruling 3 on the follow-ups' findings, minor 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// The gate takes a repeat the map the stop showed holds as the writer's. The console's
// refusal reads that map as the page does (isMapValue, task 4.6c), and the gate reads it so
// too: a value that is no map is no map shown, so a repeat in the director's map is theirs to
// both.
describe('4.6d: the gate and the console read the map the stop showed by one rule', () => {
  const { mapResume } = require('../../lib/map');
  /** The fixture's map with b9 twice in left out. */
  const repeatsB9 = () => {
    const map = clone(MAP);
    map.leftOut.push(clone(MAP.leftOut[0]));
    return map;
  };

  test.each([
    ['with no list of sections', () => ({ leftOut: repeatsB9().leftOut })],
    ['whose sections are no list', () => ({ sections: {}, leftOut: repeatsB9().leftOut })]
  ])("a shown value %s that repeats a beat is no map shown: the gate and the console refuse the repeat as the director's", (_name, shownOf) => {
    const left = repeatsB9();
    const shown = shownOf();
    expect([EditLogic.isMapValue(shown), EditLogic.mapRepeats(shown).beatIds]).toEqual([false, ['b9']]);
    const onScreen = ViewLogic.mapProblems(left, { outline: shown, mapSlots: SLOTS });
    expect(onScreen).toBe(ViewLogic.mapProblems(left, { outline: null, mapSlots: SLOTS }));
    expect(onScreen).toMatch(/^The map cannot be sent yet: left out, beat "An unsigned letter threatens Marcus" shares its id with another beat: your changes made this repeat\./);
    expect({ gate: gateTakes(left, shown), console: onScreen === null }).toEqual({ gate: false, console: false });
    expect(mapResume({ outline: 'approve', map: left }, { outline: shown }, { theme: 'journalist' }).error)
      .toBe(directorMapProblems(left, { theme: 'journalist', shown: null }));
  });

  test("the same repeat in the map the stop showed is the writer's, to the gate and the console alike", () => {
    const left = repeatsB9();
    expect({ gate: gateTakes(left, repeatsB9()), console: ViewLogic.mapProblems(left, { outline: repeatsB9(), mapSlots: SLOTS }) })
      .toEqual({ gate: true, console: null });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6d: one helper frees the photos beside a beat (the integrator's ruling 3 on the
// follow-ups' findings, minor 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// The strike and the take-out each leave the photos beside the beat in its section by
// themselves, through one helper both call (freePhotosBeside). 4.14b: a struck beat's photos
// keep its name on the director's map, so bringing it back reattaches them; the gate frees them
// when it stores the map (freeStruckBeatPhotos), through the same helper.
describe('4.6d: one helper frees the photos beside a beat, for the strike and the take-out', () => {
  const fs = require('fs');
  const path = require('path');
  /** The map after the director added b10 to The Story, with two photos beside it and one beside b3. */
  function besideB10() {
    const map = EditLogic.addBeat(opened(), 'theStory', 'Alex at the window', 'Alex');
    map.sections[1].photos = [{ filename: 'p2.jpg', beat: 'b10' }, { filename: 'p3.jpg', beat: ' b10 ' }, { filename: 'p4.jpg', beat: 'b3' }];
    return map;
  }

  test.each([
    ['struck into left out, as the gate stores the map', (map) => EditLogic.freeStruckBeatPhotos(EditLogic.strikeBeat(map, 'b10'))],
    ['taken out', (map) => EditLogic.removeBeat(map, 'b10')]
  ])('a beat %s leaves each photo beside it in its section, by itself, and a photo beside another beat where it was', (_name, move) => {
    const map = besideB10();
    expect(move(map).sections[1].photos).toEqual([{ filename: 'p2.jpg' }, { filename: 'p3.jpg' }, { filename: 'p4.jpg', beat: 'b3' }]);
    expect(map.sections[1].photos[0]).toEqual({ filename: 'p2.jpg', beat: 'b10' });
  });

  test("the statement that frees them is written once, in the helper the take-out and the gate's freeing of a strike's photos call", () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'outline-edit-logic.js'), 'utf8');
    /** A function's body in the module, from its declaration to its closing brace. */
    const body = (name) => {
      const start = src.indexOf(`function ${name}(`);
      return start === -1 ? '' : src.slice(start, src.indexOf('\n  }\n', start));
    };
    expect(src.split('{ delete photo.beat; })').length - 1).toBe(1);
    expect(body('freePhotosBeside')).toContain('{ delete photo.beat; })');
    ['freeStruckBeatPhotos', 'removeBeat'].forEach((name) => expect(`${name}: ${body(name).includes('freePhotosBeside(')}`).toBe(`${name}: true`));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.10b: the stops' lines, follow-ups (the integrator's ruling 1 on 4.10's minors and
// hand-offs). An entry code put back out of the director's order asks the director to act,
// so the map lists it, as every stop shows it (changedEditsToShow). And when the map checked
// the director's edits and lists no changed line, it says the edits stand: a round in which
// code put back every change says so too.
// ═══════════════════════════════════════════════════════════════════════════
describe("4.10b: the map lists a restore out of the director's order, and says when the edits stand", () => {
  const entry = (fields) => ({ cut: false, removed: false, moved: false, reason: null, restored: false, ...fields });
  const viewWith = (report) => {
    const d = { ...payloadOf(stateAt()), handEditReport: report };
    return ViewLogic.mapView(d, opened(d));
  };

  // 4.10c: only the desk produces an out-of-order restore. lib/hand-edit-diff.js reportAfterPass
  // writes `inOrder` only for a block moved within its section. The map records a move only from
  // one place to another (mapElementEdits), and the director's order within a section as one edit
  // of the section, the beat ids in their order, which code puts back on the beats it names with no
  // `inOrder` (mapOrderOf; piece 4, brief 4C, R3: map beats have ids, so the desk's move within a
  // section is not used); the weave records no move at all. This entry is built by hand to hold the
  // map to the rule every stop reads (changedEditsToShow); no map round writes one.
  test("the shared rule, on an entry only the desk writes: one code put back out of the director's order is listed, with the line that asks the director to move it", () => {
    const outOfOrder = entry({
      id: 'E1', scope: 'map', where: 'section "closing", photo "p2.jpg", moved from section "theStory"', moved: true,
      director: 'filename: p2.jpg', became: 'section "theStory"', pass: 1, automatic: true, restored: true, inOrder: false
    });
    const view = viewWith({ checked: ['E1'], changed: [outOfOrder] });
    // It sits under the head of the section its place names (run 1 follow-up F8): the photo sits
    // beside no move there, so it prints on no card of that section (brief 4C).
    expect(view.sections.find((s) => s.slot === 'closing').changed).toEqual([
      'Closing, photo "p2.jpg", moved from The Story: automatic pass 1 moved the photo you placed here to The Story. It was put back in its section, but not in the order you left it: move it again if the order matters.'
    ]);
    expect(view.kept).toBe('');
    // Put back in the director's order, it asks nothing, and the edit stands.
    const inOrder = viewWith({ checked: ['E1'], changed: [{ ...outOfOrder, inOrder: true }] });
    expect([changedLinesOf(inOrder), inOrder.kept]).toEqual([[], 'Your edit stands.']);
  });

  test("an automatic pass whose changes code put back: the map lists no changed line, and says the director's edits stand", () => {
    const struck = EditLogic.strikeBeat(EditLogic.moveBeat(clone(MAP), 'b3', 'closing'), 'b4');
    const edits = standingOnMap(null, clone(MAP), struck).edits;
    const pass = clone(struck);
    pass.sections[1].beats.push(pass.leftOut.pop());
    pass.sections[1].beats.push(pass.sections[3].beats.pop());
    const { report } = settleEdits(null, { edits, before: struck, after: pass, pass: 1 });
    expect(report.changed.map((c) => c.restored)).toEqual([true, true]);
    const d = payloadOf(stateAt({ outline: struck, _outlineHandEditReport: report }));
    const view = ViewLogic.mapView(d, opened(d));
    expect(view.changedEdits).toEqual([]);
    expect(view.kept).toBe('Both of your edits stand.');
  });

  test('three edits, and a send-back entry to show', () => {
    expect(viewWith({ checked: ['E1', 'E2', 'E3'], changed: [] }).kept).toBe('All 3 of your edits stand.');
    const sendBack = entry({ id: 'E2', scope: 'map', where: 'section "closing", beat "b6", move', director: 'a', became: 'b', pass: SEND_BACK_PASS, automatic: false });
    expect(viewWith({ checked: ['E1', 'E2'], changed: [sendBack] }).kept).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.6e: one helper reads the map the stop showed, for the gate and the console (the
// integrator's ruling 1 on 4.6d's minors, minor 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// A value that is no map is no map shown, so every repeat in the director's map is theirs.
// The console's validator (validateMapShape) and the gate (lib/map.js directorMapProblems)
// both read the map shown through one helper, shownMapOf, so mapProblems hands the validator
// the map shown as the payload holds it. DECISION_CASES holds the decisions equal on a shown
// value that is no map.
describe('4.6e: one helper reads the map the stop showed, for the gate and the console', () => {
  const fs = require('fs');
  const path = require('path');

  test('a map is the map shown, and any other value is none', () => {
    const map = clone(MAP);
    expect(EditLogic.shownMapOf(map)).toBe(map);
    [null, undefined, [], 'a map', { leftOut: clone(MAP.leftOut) }, { sections: {}, leftOut: clone(MAP.leftOut) }]
      .forEach((value) => expect(EditLogic.shownMapOf(value)).toBeNull());
  });

  test("both validators read the map shown through it, and mapProblems passes the payload's map as it is", () => {
    const read = (file) => fs.readFileSync(path.join(__dirname, '..', '..', file), 'utf8');
    /** A function's body, from its declaration to the brace that closes it at its own indent. */
    const body = (src, name, indent) => {
      const start = src.indexOf(`function ${name}(`);
      return start === -1 ? '' : src.slice(start, src.indexOf(`\n${indent}}\n`, start));
    };
    const editLogic = read('console/outline-edit-logic.js');
    const map = read('lib/map.js');
    const view = read('console/checkpoint-view-logic.js');
    expect(body(editLogic, 'shownMapOf', '  ')).toContain('isMapValue(');
    expect(body(editLogic, 'validateMapShape', '  ')).toContain('shownMapOf(opts.shown)');
    expect(body(map, 'directorMapProblems', '')).toContain('shownMapOf(shown)');
    expect(map).toMatch(/\bshownMapOf\b[^;]*= require\('\.\.\/console\/outline-edit-logic'\)/);
    // The ternary each caller wrote goes: the helper is the one place the rule is written.
    expect(`directorMapProblems: ${body(map, 'directorMapProblems', '').includes('isMapValue(')}`).toBe('directorMapProblems: false');
    expect(body(view, 'mapProblems', '  ')).toContain('validateOutlineShape(');
    expect(`mapProblems: ${body(view, 'mapProblems', '  ').includes('isMapValue(')}`).toBe('mapProblems: false');
    // mapView reads the map shown through the same helper (the integrator, at 4.6e's merge).
    expect(body(view, 'mapView', '  ')).toContain('shownMapOf(d.outline)');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14b: the map's last defects (the final review, ruling 2). The map shows the director
// what will print, and what they do there holds.
// ═══════════════════════════════════════════════════════════════════════════

describe('4.14b: going back to the map says what it costs: the map reopens as left, with no model call, and the article goes', () => {
  test("the rollback panel reads the map's own line, as it reads the meeting's", () => {
    expect(ViewLogic.rollbackWarningLine('outline')).toBe(ViewLogic.MAP_ROLLBACK_LINE);
    expect(ViewLogic.MAP_ROLLBACK_LINE).toBe('The map reopens as you left it, with no model call. The article is cleared, and written again once you approve.');
    expect(ViewLogic.rollbackWarningLine('arc-selection')).toBe(ViewLogic.MEETING_ROLLBACK_LINE);
    expect(ViewLogic.rollbackWarningLine('article')).toBe('This will clear all data from this point forward.');
  });

  test('the line holds: the rollback to the map keeps the map, its edits and its mark, and clears the article', () => {
    const { ROLLBACK_CLEARS } = require('../../lib/workflow/state');
    ['outline', '_mapBaseline', '_outlineHandEdits', '_mapCheck', 'heroImage'].forEach((kept) => {
      expect(`${kept}: ${ROLLBACK_CLEARS.outline.includes(kept)}`).toBe(`${kept}: false`);
    });
    ['contentBundle', '_articleHandEdits', 'articleApproved', 'assembledHtml'].forEach((cleared) => {
      expect(`${cleared}: ${ROLLBACK_CLEARS.outline.includes(cleared)}`).toBe(`${cleared}: true`);
    });
  });
});

describe('4.14b: the map names each meeting change by its place, as the meeting names the line', () => {
  /** The meeting's changes the weave carries, as 4.14a's payload field gives them: `{id, place}`. */
  const MEETING_CHANGES = [
    { id: 'M1', place: "the role of 'Morgan paid Riley at the bar'" },
    { id: 'M2', place: 'the story' }
  ];
  const viewWith = (weaveChanges, meetingChanges) => {
    const map = { ...clone(MAP), weaveChanges };
    const d = { ...payloadOf(stateAt({ outline: map, _mapBaseline: clone(map) })), ...(meetingChanges ? { meetingChanges } : {}) };
    return ViewLogic.mapView(d, opened(d));
  };

  test("a change names the line the meeting changed, and the meeting's note by its name", () => {
    const view = viewWith([
      { source: 'M1', change: 'The envelope beat now sits beside the vote.' },
      { source: 'note', change: 'The heir thread closes the map.' },
      { source: 'M2', change: 'The lede opens on the sale.' }
    ], MEETING_CHANGES);
    expect(view.weaveChanges).toEqual([
      { key: 'change-0', source: "Your change to the role of 'Morgan paid Riley at the bar'", change: 'The envelope beat now sits beside the vote.' },
      { key: 'change-1', source: 'Your note at the meeting', change: 'The heir thread closes the map.' },
      { key: 'change-2', source: 'Your change to the story', change: 'The lede opens on the sale.' }
    ]);
  });

  test('a source the meeting does not show is named by no id, with or without the meeting changes in the payload', () => {
    expect(viewWith([{ source: 'E7', change: 'A change.' }], MEETING_CHANGES).weaveChanges[0].source).toBe('Your change at the meeting');
    expect(viewWith([{ source: 'M1', change: 'A change.' }], null).weaveChanges[0].source).toBe('Your change at the meeting');
  });
});

describe("4.14b: the map's beat rows are keyed by the beat's id, so an open editor survives a strike or a move above it", () => {
  const data = payloadOf(stateAt());

  test("each beat row's key names its beat, in a section and in left out", () => {
    const view = ViewLogic.mapView(data, opened(data));
    expect(view.sections[1].beats.map((b) => b.key)).toEqual(['theStory-beat-b2', 'theStory-beat-b3', 'theStory-beat-b4']);
    expect(view.leftOut.items.map((b) => b.key)).toEqual(['leftOut-beat-b9']);
  });

  test('a strike or a move above a beat leaves its key as it was', () => {
    const keyOfB4 = (map) => ViewLogic.mapView(data, map).sections[1].beats.find((b) => b.id === 'b4').key;
    expect(keyOfB4(EditLogic.strikeBeat(opened(data), 'b3'))).toBe(keyOfB4(opened(data)));
    expect(keyOfB4(EditLogic.moveBeat(opened(data), 'b2', 'closing'))).toBe(keyOfB4(opened(data)));
  });

  test('a beat whose id another beat of its list holds, or with none, is keyed by its place, so no two rows of a list share a key', () => {
    const map = clone(MAP);
    map.sections[1].beats.push({ id: 'b3', kind: 'line', move: 'A second beat under b3', players: [] }, { kind: 'scene', move: 'A beat with no id', players: [] });
    const keys = ViewLogic.mapView(data, map).sections[1].beats.map((b) => b.key);
    expect(keys).toEqual(['theStory-beat-b2', 'theStory-beat@1', 'theStory-beat-b4', 'theStory-beat@3', 'theStory-beat@4']);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('4.14b: striking a beat and bringing it back keeps its photo', () => {
  const { mapResume } = require('../../lib/map');

  test('a strike frees the photo beside the beat: the page shows it by itself, and the gate stores it so', () => {
    const data = payloadOf(stateAt());
    const struck = EditLogic.strikeBeat(opened(data), 'b2');
    const photo = ViewLogic.mapView(data, struck).sections[1].photos[0];
    expect(photo).toMatchObject({ filename: 'p2.jpg', beat: '' });
    expect(photo.besideOptions.map((o) => o.value)).toEqual(['', 'b3', 'b4']);
    const { error, stateUpdates } = mapResume({ outline: 'approve', map: struck }, stateAt(), { theme: 'journalist' });
    expect(error).toBeNull();
    expect(stateUpdates.outline.sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
    expect(stateUpdates._outlineHandEdits.edits.map((e) => [e.path, e.from])).toEqual([['leftOut[#b2]', 'theStory']]);
  });

  // Piece 4 (brief 4C; R3): brought back to the place it held, the beat leaves the map as it was.
  // Brought back to the foot of its section, it changes the order the article tells the section's
  // moves in, which is the director's order of the section, its one edit.
  test('brought back into its place in its section, the beat has its photo beside it again, and the map records no edit', () => {
    const back = EditLogic.bringBackBeat(EditLogic.strikeBeat(opened(), 'b2'), 'b2', 'theStory', 0);
    expect(back.sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b2' }]);
    expect(ViewLogic.mapView(payloadOf(stateAt()), back).sections[1].photos[0].beat).toBe('b2');
    expect(standingOnMap(null, clone(MAP), back)).toBeNull();
    expect(mapResume({ outline: 'approve', map: back }, stateAt(), { theme: 'journalist' }).stateUpdates._outlineHandEdits).toBeNull();
    const atFoot = EditLogic.bringBackBeat(EditLogic.strikeBeat(opened(), 'b2'), 'b2', 'theStory');
    expect(standingOnMap(null, clone(MAP), atFoot).edits.map((e) => [e.path, e.order, e.after])).toEqual([['sections[#theStory].beats', true, ['b3', 'b4', 'b2']]]);
  });

  test("brought back into another section, its photo goes with it, beside it, as a moved beat's photo does", () => {
    const back = EditLogic.bringBackBeat(EditLogic.strikeBeat(opened(), 'b2'), 'b2', 'closing');
    expect([back.sections[1].photos, back.sections[3].photos]).toEqual([[], [{ filename: 'p2.jpg', beat: 'b2' }]]);
    expect(back).toEqual(EditLogic.moveBeat(opened(), 'b2', 'closing'));
  });

  test('a photo the director placed after the strike stays where they put it', () => {
    const besideB3 = EditLogic.setPhotoBeside(EditLogic.strikeBeat(opened(), 'b2'), 'theStory', 0, 'b3');
    expect(EditLogic.bringBackBeat(besideB3, 'b2', 'theStory').sections[1].photos).toEqual([{ filename: 'p2.jpg', beat: 'b3' }]);
    const moved = EditLogic.bringBackBeat(EditLogic.movePhoto(EditLogic.strikeBeat(opened(), 'b2'), 'theStory', 0, 'lede'), 'b2', 'theStory');
    expect([moved.sections[0].photos, moved.sections[1].photos]).toEqual([[{ filename: 'p2.jpg' }], []]);
  });

  test("the send-back's rework that sets the freed photo beside another beat leaves the director nothing to read", () => {
    const struck = EditLogic.strikeBeat(opened(), 'b2');
    const { stateUpdates } = mapResume({ outline: 'send-back', map: struck, note: 'Keep the strike; tighten the lede.' }, stateAt(), { theme: 'journalist' });
    const edits = stateUpdates._outlineHandEdits.edits;
    const rework = clone(stateUpdates.outline);
    rework.sections[1].photos[0].beat = 'b3';
    const report = reportAfterPass(null, { edits, before: stateUpdates.outline, after: rework, pass: SEND_BACK_PASS });
    expect(report.changed).toEqual([]);
    const d = payloadOf(stateAt({ outline: rework, _outlineHandEdits: stateUpdates._outlineHandEdits, _outlineHandEditReport: report }));
    expect(ViewLogic.mapView(d, opened(d)).changedEdits).toEqual([]);
  });
});

describe('4.14b: a section the director empties is dropped, and the page shows it there', () => {
  const { mapResume } = require('../../lib/map');

  test.each(['approve', 'send-back'])("at %s, the section moves to the dropped list, and the page reads its line in the director's words", (action) => {
    const emptied = EditLogic.strikeBeat(opened(), 'b5');
    const { error, stateUpdates } = mapResume({ outline: action, map: emptied, note: 'Tighten the lede.' }, stateAt(), { theme: 'journalist' });
    expect(error).toBeNull();
    const d = payloadOf(stateAt({ outline: stateUpdates.outline, _mapBaseline: clone(MAP), _outlineHandEdits: stateUpdates._outlineHandEdits }));
    const view = ViewLogic.mapView(d, opened(d));
    expect(view.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'closing']);
    expect(view.dropped.map((entry) => [entry.label, entry.reason])).toEqual([
      ['The Players', 'Every player appears above.'],
      ["What's Missing", "Its question is the closing's."],
      ['Follow the Money', ViewLogic.EMPTIED_SECTION_LINE]
    ]);
    expect(ViewLogic.EMPTIED_SECTION_LINE).toBe('You emptied this section on the map.');
  });
});

describe('4.14b: a photo on the leave-out list shows as left out on the map, and is refused as the top photo', () => {
  const { leavePhotosOut } = require('../../lib/photo-leave-out');
  const { mapResume } = require('../../lib/map');
  /** The map's stop after the director deleted p2.jpg at the desk and went back to the map (R9). */
  function deletedAtDesk(overrides = {}) {
    const state = stateAt(overrides);
    return { ...state, ...leavePhotosOut(state, ['p2.jpg']) };
  }
  /** The fixture's map with p2.jpg at the top and the hero in The Story. */
  const p2OnTop = () => EditLogic.movePhoto(clone(MAP), 'theStory', 0, EditLogic.MAP_TOP_PHOTO);

  test('the payload names each photo the map places that the director left out', () => {
    expect(payloadOf(deletedAtDesk())).toMatchObject({ keptPhotos: ['hero.jpg'], leftOutPhotos: ['p2.jpg'] });
    expect(payloadOf(stateAt()).leftOutPhotos).toEqual([]);
  });

  test("the page marks it left out and offers it no move; the kept photos, the count and the hint for the writer's repeats are as they were", () => {
    const data = payloadOf(deletedAtDesk());
    const view = ViewLogic.mapView(data, opened(data));
    expect(view.sections[1].photos[0]).toMatchObject({
      filename: 'p2.jpg', leftOut: true, locked: true, moveTargets: [], concerns: [ViewLogic.LEFT_OUT_PHOTO_LINE]
    });
    expect(ViewLogic.LEFT_OUT_PHOTO_LINE).toBe('You left this photo out of the article, so it does not print.');
    expect(view.topPhoto).toMatchObject({ filename: 'hero.jpg', leftOut: false, locked: false, concerns: [] });
    expect(view.topPhoto.moveTargets).toHaveLength(4);
    expect(view.lockedHint).toBe('');
    expect(view.tally.photos).toBe('1 of 1 photos');
  });

  test('moved to the top all the same, the console and the gate refuse it, saying why', () => {
    const state = deletedAtDesk();
    const data = payloadOf(state);
    const moved = EditLogic.movePhoto(opened(data), 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
    expect(ViewLogic.mapProblems(moved, data)).toBe('The map cannot be sent yet: the top photo is p2.jpg, a photo you left out of the article, so it would not print. Move another photo to the top.');
    const { error } = mapResume({ outline: 'approve', map: moved }, state, { theme: 'journalist' });
    expect(error).toBe("The top photo \"p2.jpg\" is a photo the director left out of the article, so it would not print: the director's changes put it at the top. Move another photo to the top.");
    expect(directorMapProblems(moved, { theme: 'journalist', shown: data.outline, leftOut: ['p2.jpg'] })).toBe(error);
    expect(EditLogic.validateOutlineShape(moved, 'journalist', SLOTS, data.outline, ['P2.JPG']).valid).toBe(false);
  });

  test('approved as the director left it, the map goes through, and the article reads it without the photo', () => {
    const state = deletedAtDesk();
    const data = payloadOf(state);
    expect(ViewLogic.mapProblems(opened(data), data)).toBeNull();
    const { error, stateUpdates } = mapResume({ outline: 'approve', map: opened(data) }, state, { theme: 'journalist' });
    expect(error).toBeNull();
    const { articleMapOf } = require('../../lib/workflow/nodes/ai-nodes');
    expect(articleMapOf({ ...state, ...stateUpdates }).sections[1].photos).toEqual([]);
  });

  test('a top photo left out after the map is marked so, with no move; as the map the stop showed holds it, both gates take the map as left', () => {
    const state = deletedAtDesk({ outline: p2OnTop(), _mapBaseline: p2OnTop() });
    const data = payloadOf(state);
    expect(data.leftOutPhotos).toEqual(['p2.jpg']);
    const view = ViewLogic.mapView(data, opened(data));
    expect(view.topPhoto).toMatchObject({ filename: 'p2.jpg', leftOut: true, locked: true, moveTargets: [], concerns: [ViewLogic.LEFT_OUT_PHOTO_LINE] });
    expect(ViewLogic.mapProblems(opened(data), data)).toBeNull();
    expect(mapResume({ outline: 'approve', map: opened(data) }, state, { theme: 'journalist' }).error).toBeNull();
    // Another photo moved to the top trades places with it, and the map goes through.
    const traded = EditLogic.movePhoto(opened(data), 'theStory', 0, EditLogic.MAP_TOP_PHOTO);
    expect([traded.topPhoto, traded.sections[1].photos]).toEqual(['hero.jpg', [{ filename: 'p2.jpg' }]]);
    expect(ViewLogic.mapProblems(traded, data)).toBeNull();
    expect(ViewLogic.mapView(data, traded).sections[1].photos[0]).toMatchObject({ filename: 'p2.jpg', leftOut: true, moveTargets: [] });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14b, fix round 1: a section the director emptied that a pass put back reads as one line on
// the map, the section's, in the words of its dropped line. The drop is two edits, its dropped
// slot and its cut; a pass that put the section back gives a line for each, one of them the
// entry's fields as written. After an automatic pass the section stays only when the pass put
// something in it (lib/hand-edit-diff.js settleEdits), so the line asks the director to empty it
// again; after a send-back it gives the rework's reasons.
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14b fix round 1: a section the director emptied that a pass put back reads as one line, the section\'s', () => {
  const { mapResume } = require('../../lib/map');
  const entry = (fields) => ({ scope: 'map', cut: false, removed: false, moved: false, reason: null, restored: false, ...fields });
  const slotGone = (pass, fields) => entry({
    id: 'E1', where: 'dropped slot "followTheMoney"', director: 'slot: followTheMoney; reason: The director emptied this section on the map.',
    became: null, pass, automatic: pass !== SEND_BACK_PASS, ...fields
  });
  const sectionBack = (pass, fields) => entry({
    id: 'E2', where: 'section "followTheMoney", cut', cut: true, director: 'slot: followTheMoney; heading: Follow the Money; job: What the sale paid, and to whom.',
    became: 'Follow the Money', pass, automatic: pass !== SEND_BACK_PASS, ...fields
  });
  /** The map's changed lines for a report holding these entries. */
  function linesFor(changed) {
    const d = { ...payloadOf(stateAt()), handEditReport: { checked: ['E1', 'E2', 'E3'], changed } };
    return changedLinesOf(ViewLogic.mapView(d, opened(d)));
  }
  const AUTOMATIC_LINE = 'Follow the Money: automatic pass 1 put back the section you emptied. It is still on the map: empty it again if it should go.';

  test('after an automatic pass: one line, which asks the director to empty it again', () => {
    expect(linesFor([slotGone(1), sectionBack(1)])).toEqual([AUTOMATIC_LINE]);
    // The pass kept the slot's entry, which code then took out: the section's line alone.
    expect(linesFor([sectionBack(1)])).toEqual([AUTOMATIC_LINE]);
  });

  test("after a send-back's rework: one line, with the rework's reasons", () => {
    const reason = 'The note asks for the money again.';
    expect(linesFor([slotGone(SEND_BACK_PASS, { reason }), sectionBack(SEND_BACK_PASS, { reason })]))
      .toEqual([`Follow the Money: the rework of your send-back put back the section you emptied. Why: ${reason}`]);
  });

  test('any other line reads as before, beside it', () => {
    const other = entry({ id: 'E3', where: 'section "closing", beat "b6", move', cut: true, director: 'and the second ledger', became: 'Riley says they only kept the books, and the second ledger', pass: 1, automatic: true });
    expect(linesFor([slotGone(1), sectionBack(1), other])).toEqual([
      AUTOMATIC_LINE,
      'Closing, the move "Riley says they only kept the books": the text you cut came back as "Riley says they only kept the books, and the second ledger" (automatic pass 1). It is still on the map: cut it again if it should go.'
    ]);
  });

  test('through the stop: an automatic pass that filled the section the director emptied, as code stores it and the page shows it', () => {
    const { error, stateUpdates } = mapResume({ outline: 'send-back', map: EditLogic.strikeBeat(opened(), 'b5'), note: 'Tighten the lede.' }, stateAt(), { theme: 'journalist' });
    expect(error).toBeNull();
    const before = stateUpdates.outline;
    const pass = clone(before);
    pass.sections.splice(2, 0, { ...clone(MAP.sections[2]), beats: [{ id: 'b7', kind: 'figure', move: 'The Melanie account takes the sale', players: [] }] });
    pass.dropped = pass.dropped.filter((d) => d.slot !== 'followTheMoney');
    const edits = stateUpdates._outlineHandEdits.edits;
    const settled = settleEdits(null, { edits, before, after: pass, pass: 1 });
    const d = payloadOf(stateAt({ outline: settled.output, _mapBaseline: settled.output, _outlineHandEdits: stateUpdates._outlineHandEdits, _outlineHandEditReport: settled.report }));
    const view = ViewLogic.mapView(d, opened(d));
    expect(view.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'followTheMoney', 'closing']);
    expect(view.dropped.map((x) => x.slot)).toEqual(['thePlayers', 'whatsMissing']);
    expect([changedLinesOf(view), view.kept]).toEqual([[AUTOMATIC_LINE], '']);
    // The section's line sits under its head, not among the round's lines (run 1 follow-up F8).
    expect(view.sections.find((s) => s.slot === 'followTheMoney').changed).toEqual([AUTOMATIC_LINE]);
    expect(view.changedEdits).toEqual([]);
  });
});

// Fix E3: a value that is no map shows no map, and nothing throws. A real thread at the map always
// holds a map, since the server refuses an old one (task 4.11), but the page reads a value that is
// no map as no map shown (shownMapOf, isMapValue), as the gate does. mapView threw on null
// (mapLinesOnPage read `gapNote` of it), and the whole stop rendered blank.
describe('Fix E3: a value that is no map shows no map, and nothing throws', () => {
  const data = payloadOf(stateAt());
  /** An outline in the shape from before the map: its sections by key, with no `sections` list. */
  const OLD_SHAPE = {
    lede: { hook: 'An old hook about the room.', keyTension: 'Who sold first', primaryArc: 'arc-1', selectedEvidence: ['e1'] },
    theStory: { arcs: [{ name: 'An old arc', paragraphs: 2 }] },
    closing: { finalLine: 'An old closing line.' }
  };
  const NO_MAPS = [['null', null], ['undefined', undefined], ['a string', 'not a map'], ['an outline in the old sections-by-key shape', OLD_SHAPE]];

  test.each(NO_MAPS)('the lines on the page, given %s, are the page\'s own lines alone', (_name, value) => {
    expect([...ViewLogic.mapLinesOnPage(value)].sort()).toEqual(['deck', 'expectedLength', 'headline', 'weaveChanges']);
  });

  test.each(NO_MAPS)('mapView given %s shows no map: no column, no move, no photo and no gap note', (_name, value) => {
    const view = ViewLogic.mapView(data, value);
    expect(view.sections).toEqual([]);
    expect(view.leftOut.items).toEqual([]);
    expect(view.topPhoto).toBeNull();
    expect(view.gapNote).toBeNull();
    expect(view.headline.text).toBe('');
    expect(view.deck.text).toBe('');
    expect(view.dropped).toEqual([]);
    expect(view.weaveChanges).toEqual([]);
    expect(view).toEqual(ViewLogic.mapView(data, null));
  });

  test('a shown value in the old shape is no map shown either, and the page still opens on the map as the director has it', () => {
    const view = ViewLogic.mapView({ ...data, outline: clone(OLD_SHAPE) }, opened(data));
    expect(view.sections.map((s) => s.slot)).toEqual(['lede', 'theStory', 'followTheMoney', 'closing']);
    expect(ViewLogic.mapView({ ...data, outline: clone(OLD_SHAPE) }, clone(OLD_SHAPE)).sections).toEqual([]);
  });
});
