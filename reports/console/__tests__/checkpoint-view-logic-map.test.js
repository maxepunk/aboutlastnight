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
  mapCheckpointData, mapRosterOf, directorMapProblems, mapKey, MAP_ACTIONS, MAP_BEAT_KINDS, MAP_CARDS, MEETING_NOTE_SOURCE
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

  test("a beat's kind labels name the map's kinds, in their order, and the cards' range is the checks'", () => {
    expect(Object.keys(ViewLogic.BEAT_KIND_LABELS)).toEqual([...MAP_BEAT_KINDS]);
    expect(Object.values(ViewLogic.BEAT_KIND_LABELS)).toEqual(['Scene', 'Receipt', 'Line', 'Figure']);
    expect(ViewLogic.MAP_CARDS).toEqual({ ...MAP_CARDS });
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

  test('a beat: its material as typed, its kind, players, card and connection; a cleared field leaves no key', () => {
    const map = opened();
    const b3 = beatOf(map, 'b3');
    const form = EditLogic.initBeat(b3);
    expect(form).toEqual({ kind: 'receipt', material: 'mor001', players: 'Morgan, Riley', card: 'mor001', connection: '' });
    const built = EditLogic.buildBeat({ ...form, material: ' The envelope at the bar ', kind: 'scene', players: 'Morgan,  Riley , Alex', card: '' }, b3);
    expect(built).toEqual({ id: 'b3', kind: 'scene', material: ' The envelope at the bar ', players: ['Morgan', 'Riley', 'Alex'] });
    const next = EditLogic.mergeBeat(map, 'b3', built);
    expect(beatOf(next, 'b3')).toEqual(built);
    expect(beatPlaces(next)).toEqual(beatPlaces(map));
    expect(EditLogic.buildBeat({ ...form, connection: ' c2 ' }, b3).connection).toBe('c2');
  });

  test('a beat the director added with no players keeps none when none are typed, and a beat with no kind keeps none', () => {
    const added = { id: 'b10', material: 'Alex at the window' };
    expect(EditLogic.initBeat(added)).toEqual({ kind: '', material: 'Alex at the window', players: '', card: '', connection: '' });
    expect(EditLogic.buildBeat(EditLogic.initBeat(added), added)).toEqual(added);
  });

  test("a beat's edit merges where the beat sits now: one struck since its editor opened is edited in left out", () => {
    const map = opened();
    const form = { ...EditLogic.initBeat(beatOf(map, 'b4')), material: 'The paternity result' };
    const struck = EditLogic.strikeBeat(map, 'b4');
    const next = EditLogic.mergeBeat(struck, 'b4', EditLogic.buildBeat(form, beatOf(map, 'b4')));
    expect(beatPlaces(next).leftOut).toEqual(['b9', 'b4']);
    expect(beatOf(next, 'b4').material).toBe('The paternity result');
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
    expect(next.sections[1].photos).toEqual([{ filename: 'p2.jpg' }]);
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
    expect(next.sections[2].beats[1]).toEqual({ id: 'b10', material: 'The bonus at 07:52 PM', players: ['Riley', 'Morgan'] });
    expect(EditLogic.addBeat(next, 'lede', 'A second line', '').sections[0].beats[1]).toEqual({ id: 'b11', material: 'A second line', players: [] });
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

  test("before any change, the console's count is the stop's", () => {
    expect(ViewLogic.mapTallyOf(data, opened(data))).toEqual(data.tally);
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

  test('the lines: Everyone by section label, the players in no beat, the cards, the photos and the expected length', () => {
    const view = ViewLogic.mapView(data, EditLogic.strikeBeat(opened(data), 'b4'));
    expect(view.tally).toEqual({
      everyone: 'Alex, Morgan (Lede) · Riley (The Story)',
      unplaced: 'In no beat: Sarah',
      raised: '',
      cards: 'Cards: 2, under the 3 to 5 the article carries',
      photos: 'Photos: 2 of 2',
      length: 'Expected length: about 1,200 words',
      lengthConcerns: []
    });
    const full = ViewLogic.mapView(data, opened(data)).tally;
    expect([full.unplaced, full.cards]).toEqual(['', 'Cards: 3']);
  });

  test('a player the gap note raises is named as raised, not as in no beat; the length reads as the map now holds it', () => {
    let map = { ...EditLogic.strikeBeat(opened(data), 'b4'), gapNote: { line: 'The record holds nothing Sarah did.', players: ['Sarah'] } };
    map = EditLogic.mergeMapLength(map, 900);
    const view = ViewLogic.mapView(data, map);
    expect([view.tally.unplaced, view.tally.raised, view.tally.length]).toEqual(['', 'Raised in the gap note: Sarah', 'Expected length: about 900 words']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The console's validator reaches the gate's decisions (ruling 3)
// ═══════════════════════════════════════════════════════════════════════════

/** A map whose writer gave two beats the id b2. */
function writersRepeat() {
  const map = clone(MAP);
  map.sections[3].beats.push({ id: 'b2', kind: 'line', material: 'A second beat under b2', players: [] });
  return map;
}

/** Every change the map's controls make, on the fixture map. */
function everyChange(map) {
  let m = EditLogic.strikeBeat(map, 'b4');
  m = EditLogic.bringBackBeat(m, 'b9', 'closing');
  m = EditLogic.addBeat(m, 'followTheMoney', 'The bonus at 07:52 PM', 'Riley');
  m = EditLogic.moveBeat(m, 'b3', 'closing');
  m = EditLogic.mergeBeat(m, 'b6', EditLogic.buildBeat({ ...EditLogic.initBeat(beatOf(m, 'b6')), material: 'Riley: "I kept the books, and the second ledger"' }, beatOf(m, 'b6')));
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
  ['a beat the director added with only its id and its material', true, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'b11', material: 'x' }); return [m, clone(MAP)]; }],
  ['a beat the director added under an id every object carries, once', true, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'toString', material: 'x' }); return [m, clone(MAP)]; }],
  ['no top photo', true, () => { const m = clone(MAP); delete m.topPhoto; return [m, clone(MAP)]; }],
  ["the writer's repeated beat id, left as shown", true, () => [writersRepeat(), writersRepeat()]],
  ["the writer's repeat left alone, another beat struck", true, () => [EditLogic.strikeBeat(writersRepeat(), 'b4'), writersRepeat()]],
  ['the director repeats a beat id', false, () => { const m = clone(MAP); m.sections[0].beats.push({ id: 'b3', material: 'x' }); return [m, clone(MAP)]; }],
  ['the director repeats a beat id in left out, read trimmed', false, () => { const m = clone(MAP); m.leftOut.push({ id: ' b1 ', material: 'x' }); return [m, clone(MAP)]; }],
  ["a repeat with no map shown, read as the director's", false, () => [writersRepeat(), null]],
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
    r.sections[0].beats.push({ id: 'b3', material: 'x' });
    expect(ViewLogic.mapProblems(r, { outline: clone(MAP), mapSlots: SLOTS }))
      .toBe('The map cannot be sent yet: Lede, beat b3 shares its id with another beat: your changes made this repeat. Give each beat an id of its own.');
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
  map.sections[3].beats.push({ id: ' b2 ', kind: 'line', material: 'A second beat under b2', players: [] });
  map.sections[0].beats.push({ id: 'toString', kind: 'scene', material: 'A beat under a name every object carries', players: [] });
  map.sections[3].photos.push({ filename: 'photos/P2.JPG' });
  map.sections[2].photos.push({ filename: 'constructor' });
  return map;
}

describe("4.9 fix round 1: the validator and the page read one rule for a repeat, and the map's readers are the edit logic's", () => {
  test('mapRepeats lists each beat id and each photo a map repeats, once, in the order of its first place', () => {
    expect(EditLogic.mapRepeats(writersRepeats())).toEqual({ beatIds: ['b2'], photoKeys: ['p2.jpg'] });
    const two = clone(MAP);
    two.sections[3].beats.push({ id: 'b5', material: 'x' }, { id: 'b1', material: 'y' });
    two.sections[1].photos.push({ filename: 'HERO.jpg' });
    expect(EditLogic.mapRepeats(two)).toEqual({ beatIds: ['b1', 'b5'], photoKeys: ['hero.jpg'] });
    expect(EditLogic.mapRepeats(clone(MAP))).toEqual({ beatIds: [], photoKeys: [] });
    expect(EditLogic.mapRepeats(null)).toEqual({ beatIds: [], photoKeys: [] });
  });

  test("each beat and photo is listed where the gate's paths name it; a beat with no id and a photo with no filename are not listed", () => {
    const map = clone(MAP);
    map.leftOut.push({ material: 'A beat with no id' });
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

  test("a beat's card on the page is beatCardOf's, the one rule for which beats are cards", () => {
    const map = clone(MAP);
    map.sections[1].beats[1].card = '  mor001  ';
    map.sections[1].beats[2].card = '   ';
    const data = payloadOf(stateAt());
    const view = ViewLogic.mapView(data, map);
    expect(view.sections[1].beats.map((b) => b.card)).toEqual(map.sections[1].beats.map(EditLogic.beatCardOf));
    expect(view.sections[1].beats.map((b) => b.card)).toEqual(['ale003', 'mor001', '']);
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
    expect(view.hasMap).toBe(true);
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

  test("each beat with its kind, material, players, card and connection, and the sections it can move to", () => {
    expect(view.sections[1].beats[0]).toMatchObject({
      id: 'b2', kindLabel: 'Receipt', material: 'ale003', players: 'Alex', card: 'ale003', connection: 'c2',
      added: false, locked: false, concerns: []
    });
    expect(view.sections[1].beats[0].moveTargets.map((t) => t.value)).toEqual(['lede', 'followTheMoney', 'closing']);
  });

  test('each photo beside its beat, with the beats of its section to sit beside, the top and the other sections to move to', () => {
    const photo = view.sections[1].photos[0];
    expect(photo).toMatchObject({ filename: 'p2.jpg', slot: 'theStory', index: 0, beat: 'b2', locked: false });
    expect(photo.besideOptions).toEqual([
      { value: '', label: 'By itself, with its people' },
      { value: 'b2', label: 'Beside b2: ale003' },
      { value: 'b3', label: 'Beside b3: mor001' },
      { value: 'b4', label: 'Beside b4: p-dna' }
    ]);
    expect(photo.moveTargets.map((t) => t.value)).toEqual(['topPhoto', 'lede', 'followTheMoney', 'closing']);
    expect(photo.moveTargets[0].label).toBe('The top of the article');
  });

  test('the dropped sections with their reasons, and left out folded, each item with the sections to bring it back to', () => {
    expect(view.dropped).toEqual([
      { key: 'dropped-thePlayers', slot: 'thePlayers', label: 'The Players', reason: 'Every player appears above.', concerns: [] },
      { key: 'dropped-whatsMissing', slot: 'whatsMissing', label: "What's Missing", reason: "Its question is the closing's.", concerns: [] }
    ]);
    expect(view.leftOut).toMatchObject({ title: 'Left out (1)', open: false });
    expect(view.leftOut.items[0]).toMatchObject({ id: 'b9', kindLabel: 'Receipt', material: 'p-rescued', players: '', concerns: [] });
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

  test('the concern sits beside the line of the edit it is about, and left out opens to show it', () => {
    expect(view.leftOut.items.map((i) => [i.id, i.concerns])).toEqual([
      ['b9', []],
      ['b4', ['Concern: Sarah is in no beat and not in the gap note.']]
    ]);
    expect(view.leftOut.open).toBe(true);
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
    const d = payloadOf(stateAt({ humanOutlineRevisionCount: 1, _outlineFeedback: 'Lead with the bonus.' }));
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
    expect(report.changed.map((c) => ViewLogic.changedEditLine(c, ViewLogic.mapEditLineOptions(SLOTS.map((s) => ({ key: s.key, label: s.label })))))).toEqual([
      'Closing, beat "b3", moved from The Story: automatic pass 1 moved the beat you placed here to The Story. It was put back.',
      'Left out, beat "b4", struck from The Story: automatic pass 1 brought it back. It was struck again.'
    ]);
  });

  test("a send-back's rework that changed one of the director's lines, with its reason", () => {
    const left = clone(MAP);
    left.sections[3].beats[0].material = 'Riley: "I kept the books, and the second ledger"';
    const edits = standingOnMap(null, clone(MAP), left).edits;
    const rework = clone(left);
    rework.sections[3].beats[0].material = 'Riley: "I kept the books"';
    const report = reportAfterPass(null, { edits, before: left, after: rework, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks for the plain line.' }] });
    const d = payloadOf(stateAt({ outline: rework, _outlineHandEditReport: report }));
    expect(ViewLogic.mapView(d, opened(d)).changedEdits).toEqual([
      'Closing, beat "b6", material: your "Riley: "I kept the books, and the second ledger"" became "Riley: "I kept the books"" (the rework of your send-back). Why: The note asks for the plain line.'
    ]);
  });

  test('a round whose passes kept every edit says so', () => {
    const d = payloadOf(stateAt({ _outlineHandEditReport: { checked: ['E1', 'E2'], changed: [] } }));
    expect(ViewLogic.mapView(d, opened(d)).kept).toBe('The reworks kept all 2 of your edits.');
  });
});

describe("4.9: the map's changes to the weave, and the standing notes", () => {
  test('each change to the weave with its source: an edit at the meeting, or the meeting note', () => {
    const map = { ...clone(MAP), weaveChanges: [{ source: 'E2', change: 'The envelope lands in the lede.' }, { source: 'note', change: 'The heir thread closes the map.' }] };
    const d = payloadOf(stateAt({ outline: map, _mapBaseline: clone(map) }));
    expect(ViewLogic.mapView(d, opened(d)).weaveChanges).toEqual([
      { key: 'change-0', source: 'Your change E2 at the meeting', change: 'The envelope lands in the lede.' },
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

describe('4.9: a stop with no map, and the photos', () => {
  test('says so, with the way back to the meeting', () => {
    const view = ViewLogic.mapView({ outline: { lede: { hook: 'An old outline' } }, settledStory: null }, null);
    expect(view.hasMap).toBe(false);
    expect(view.emptyLine).toBe('This stop holds no story map, so there is nothing to edit here. Go back to the story meeting: approving it there writes the map.');
  });

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
      ['sections[#theStory].beats[#b2].material', 'beat:b2'],
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

describe("4.6c: the map names each card's and each material's document in words, through receiptView", () => {
  const state = stateAt();
  const data = mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, 'hero.jpg'), evidenceIndex: INDEX, maxRevisions: 1 });

  test('a card and a material that name a document read as its name and owner; a material that names none prints as written', () => {
    const map = opened(data);
    map.sections[2].beats.push({ id: 'b7', kind: 'figure', material: 'ledger', players: [] });
    map.sections[3].beats[0].card = 'zzz999';
    const view = ViewLogic.mapView(data, map);
    expect(view.sections.flatMap((s) => s.beats).map((b) => [b.id, b.materialText, b.cardText])).toEqual([
      ['b1', 'The deadlock between Alex and Morgan, then six votes for an overdose', ''],
      ['b2', 'ALE003 - The sale (Alex Reeves)', 'ALE003 - The sale (Alex Reeves)'],
      ['b3', 'MOR001 - The envelope (Morgan Reed)', 'MOR001 - The envelope (Morgan Reed)'],
      ['b4', 'DNA test (Sarah Blackwood)', 'DNA test (Sarah Blackwood)'],
      ['b5', 'Melanie, $75,000 at 07:50 PM', ''],
      ['b7', 'ledger', ''],
      ['b6', 'Riley: "I only kept the books"', 'zzz999']
    ]);
    expect(view.leftOut.items[0]).toMatchObject({ id: 'b9', material: 'p-rescued', materialText: 'Rescued letter', cardText: '' });
    // The ids stay on the view for the editors, which edit what the map holds.
    expect(view.sections[1].beats[0]).toMatchObject({ material: 'ale003', card: 'ale003' });
  });

  test("a photo's place beside a beat names the beat's material as the beat does", () => {
    const view = ViewLogic.mapView(data, opened(data));
    expect(view.sections[1].photos[0].besideOptions.map((o) => o.label)).toEqual([
      'By itself, with its people',
      'Beside b2: ALE003 - The sale (Alex Reeves)',
      'Beside b3: MOR001 - The envelope (Morgan Reed)',
      'Beside b4: DNA test (Sarah Blackwood)'
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

  test('"In no beat" lists the players in roster order after an edit', () => {
    const data = payloadOf(stateAt());
    let map = EditLogic.strikeBeat(opened(data), 'b3');
    map = EditLogic.strikeBeat(map, 'b4');
    map = EditLogic.strikeBeat(map, 'b6');
    expect(stateAt().sessionConfig.roster).toEqual(['Alex', 'Morgan', 'Sarah', 'Riley']);
    expect(ViewLogic.mapTallyOf(data, map).unplaced).toEqual(['Sarah', 'Riley']);
    expect(ViewLogic.mapView(data, map).tally.unplaced).toBe('In no beat: Sarah, Riley');
  });

  test("a beat that names a player by a full name not opening with the first name places them, as the stop's count does", () => {
    const base = stateAt();
    const named = clone(MAP);
    named.sections[2].beats[0].players = ['Cassandra Vale'];
    const data = payloadOf(stateAt({
      sessionConfig: { ...base.sessionConfig, roster: [...base.sessionConfig.roster, 'Cass'] },
      canonicalCharacters: { ...base.canonicalCharacters, Cass: 'Cassandra Vale' },
      outline: named,
      _mapBaseline: clone(named)
    }));
    expect(data.tally.unplaced).toEqual([]);
    expect(ViewLogic.mapTallyOf(data, opened(data))).toEqual(data.tally);
  });

  test('a roster player whose name every object carries counts as any other, on the page and in the checks', () => {
    const roster = [{ name: 'constructor', fullName: null }, { name: 'toString', fullName: null }, { name: 'Alex', fullName: 'Alex Reeves' }];
    const map = { sections: [{ slot: 'lede', heading: '', job: 'Open.', beats: [{ id: 'b1', kind: 'scene', material: 'x', players: ['constructor'] }], photos: [] }], leftOut: [] };
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
      section.beats.push({ id: name, kind: 'scene', material: `A beat under ${name}`, players: [] });
      section.photos.push({ filename: name });
    }
  });
  return map;
}

describe('4.6c: the gate, the checks and the console find one set of repeats, under names every object carries', () => {
  const kept = ['hero.jpg', 'p2.jpg', ...PROTOTYPE_NAMES];
  const checksFind = (map) => {
    const { failures } = require('../../lib/map').mapFindings(map, { keptPhotos: kept, recordIds: ['ale003', 'mor001', 'p-dna'] });
    return failures.filter((f) => f.type === 'duplicate-beat-id' || f.type === 'photo-placed-twice').map((f) => f.message.split('. ')[0]);
  };

  test("the writer's repeats, left as shown: the gate and the console take them, the checks list each, and mapRepeats finds the same", () => {
    const [left, shown] = [prototypeNamed(2), prototypeNamed(2)];
    expect({ gate: gateTakes(left, shown), console: consoleTakes(left, shown) }).toEqual({ gate: true, console: true });
    expect(EditLogic.mapRepeats(left)).toEqual({ beatIds: PROTOTYPE_NAMES, photoKeys: PROTOTYPE_NAMES.map((name) => name.toLowerCase()) });
    expect(checksFind(left)).toEqual([
      'Beats sharing an id: constructor, toString, __proto__, hasOwnProperty and valueOf',
      'Photos placed more than once: constructor, toString, __proto__, hasOwnProperty, valueOf'
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
    return ViewLogic.mapView(d, opened(d)).changedEdits;
  }

  test('an automatic change code put back is not listed', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'map', where: 'section "closing", beat "b6", material', director: 'Riley keeps the books.', became: 'Riley kept nothing.', pass: 1, automatic: true, restored: true })])).toEqual([]);
  });

  test('a cut that came back is listed, still on the map', () => {
    expect(linesFor([entry({ id: 'E1', scope: 'map', where: 'section "closing", beat "b6", material', cut: true, director: 'and the second ledger', became: 'Riley: "I kept the books, and the second ledger"', pass: 1, automatic: true })]))
      .toEqual(['Closing, beat "b6", material: the text you cut came back as "Riley: "I kept the books, and the second ledger"" (automatic pass 1). It is still on the map: cut it again if it should go.']);
  });

  test("a send-back's change is listed with its reason", () => {
    expect(linesFor([entry({ id: 'E2', scope: 'map', where: 'section "closing", beat "b6", material', director: 'Riley keeps the books.', became: 'Riley kept nothing.', pass: SEND_BACK_PASS, automatic: false, reason: 'The note asks for the plain line.' })]))
      .toEqual(['Closing, beat "b6", material: your "Riley keeps the books." became "Riley kept nothing." (the rework of your send-back). Why: The note asks for the plain line.']);
  });

  test('a beat a pass removed is listed: only its place was the director\'s, so code did not put it back', () => {
    expect(linesFor([entry({ id: 'E3', scope: 'map', where: 'section "closing", beat "b3", moved from section "theStory"', moved: true, director: 'b3', became: null, pass: 1, automatic: true })]))
      .toEqual(['Closing, beat "b3", moved from The Story: automatic pass 1 removed the beat you placed here. Only its place was your edit, so it was not put back: add it again if it should stay.']);
  });
});
