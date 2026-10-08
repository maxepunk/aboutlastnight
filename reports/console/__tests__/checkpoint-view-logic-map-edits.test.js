/**
 * Phase 4b, piece 4, brief 4C: the map's page reads the director's order and summaries as edits
 * (spec 2026-10-07 sections 3, 6, 7 and 17; R3, R11; Review focus 1 and 4).
 *
 * - One reader of a report entry's beat (beatOfPlace): the place lib/hand-edit-diff.js
 *   mapEditWhere writes, `beat "<id>"`, which both mapView's routing and the page's words read.
 * - The words: a summary edit reads as the summary of the move, by its title, and an order edit
 *   as the order of the section, by its slot's label; neither shows an id or a field name.
 * - Where a changed line sits (spec 7): on the card of the move it is about, or of the move the
 *   photo it is about sits beside; under the head of its section (an order edit, a photo by
 *   itself); beside the gap note, the expected length or the weave changes (`changedBeside`); and
 *   among the round's lines only when the page has no place for it.
 *
 * Every payload is the server's own: lib/map.js mapCheckpointData on a state paused at the map.
 * Invented text: the repo is public.
 */
const fs = require('fs');
const path = require('path');
const EditLogic = require('../outline-edit-logic');
const ViewLogic = require('../checkpoint-view-logic');
const { reworkFixtureState, MAP } = require('../../lib/__tests__/fixtures/rework-state');
const { mapCheckpointData } = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { mapSlotsOf } = require('../../lib/theme-config');
const { standingOnMap, settleEdits, carriedEdits, editWhere, mapEditAddress, SEND_BACK_PASS } = require('../../lib/hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const SLOTS = mapSlotsOf('journalist').map((s) => ({ key: s.key, label: s.label }));
/** A tag the page never prints: a beat's, a thread's or a connection's id. */
const TAG = /\b[btc]\d+\b/;
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);
/** The id of the beat a place names, as the one reader reads it, or null. */
const readBeat = (where) => {
  const named = ViewLogic.beatOfPlace(where);
  return named ? named.id : null;
};

/** A state paused at the map, as the map writer left it. */
function stateAt(overrides = {}) {
  return { ...reworkFixtureState('journalist'), directorGateNotes: [], outlineRevisionCount: 0, humanOutlineRevisionCount: 0, ...overrides };
}

/** The stop's payload for a state, as server.js getCheckpointData sends it (less the trace). */
function payloadOf(state) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline && state.outline.topPhoto), maxRevisions: 1 });
}

/** The page for a map and a report, as the stop shows them. */
function viewOf(map, report) {
  const d = payloadOf(stateAt({ outline: map, _mapBaseline: clone(map), _outlineHandEditReport: report, humanOutlineRevisionCount: 1 }));
  return ViewLogic.mapView(d, ViewLogic.mapDraftOf(d, undefined));
}

/** A report entry a send-back's rework wrote, which the page shows. */
const entry = (fields) => ({
  scope: 'map', cut: false, removed: false, moved: false, director: 'a', became: 'b', pass: SEND_BACK_PASS, automatic: false,
  reason: 'The note asks for it.', restored: false, ...fields
});
const reportOf = (...entries) => ({ checked: entries.map((e) => e.id), changed: entries });

/** Every changed line the page shows, wherever it sits. */
const changedLinesOf = (view) => [
  ...view.changedEdits,
  ...view.top.changed,
  ...view.sections.flatMap((s) => [...s.changed, ...s.beats.flatMap((b) => b.changed)]),
  ...view.leftOut.items.flatMap((b) => b.changed),
  ...['gapNote', 'length', 'weaveChanges'].flatMap((key) => view.changedBeside[key])
];

// ═══════════════════════════════════════════════════════════════════════════
// One reader of an entry's beat
// ═══════════════════════════════════════════════════════════════════════════

describe("4C: one reader of a report entry's beat, which mapView and the page's words both call", () => {
  test('reads the beat the place names, and none from a place that names no beat', () => {
    expect(readBeat('section "lede", beat "b4", move')).toBe('b4');
    expect(readBeat('section "theStory", the summary of beat "b3"')).toBe('b3');
    expect(readBeat('left out, beat "b9", struck from section "lede"')).toBe('b9');
    expect(readBeat('section "theStory", the order of its moves')).toBeNull();
    expect(readBeat('section "theStory", photo "p2.jpg", beat')).toBeNull();
    expect(readBeat(undefined)).toBeNull();
  });

  test('the place format is read in one place: beatWords and mapView call the reader, and the pattern is written once', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'checkpoint-view-logic.js'), 'utf8');
    const body = (name) => {
      const start = src.indexOf(`function ${name}(`);
      return start === -1 ? '' : src.slice(start, src.indexOf('\n  }\n', start));
    };
    expect(body('beatWords')).toContain('beatOfPlace(');
    expect(body('mapView')).toContain('beatOfPlace(');
    expect(src.split('beat "([^"]*)"').length - 1).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The words (R11)
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: a summary edit reads as the summary of the move, and an order edit as the order of the section', () => {
  const place = (where, map = clone(MAP)) => ViewLogic.mapEditLineOptions(SLOTS, map).place({ where, scope: 'map' });

  test('by its title and its slot\'s label, with no id and no field name', () => {
    expect(place('section "theStory", the summary of beat "b3"')).toBe('The Story, the summary of the move "Morgan pays Riley at the bar"');
    expect(place('section "theStory", the order of its moves')).toBe('The Story, the order of its moves');
    expect(place('left out, the summary of beat "b9"')).toBe('Left out, the summary of the move "An unsigned letter threatens Marcus"');
  });

  test("the map's own lines read by their names, not their fields' names", () => {
    expect(place('expectedLength')).toBe('The expected length');
    expect(place('weaveChanges')).toBe("The map's changes to the weave");
  });

  test('the gate names a summary it refuses as the summary of the move', () => {
    const map = clone(MAP);
    beatOf(map, 'b3').synopsis = 42;
    const problem = ViewLogic.mapProblems(map, payloadOf(stateAt()));
    expect(problem).toContain('the summary of the move "Morgan pays Riley at the bar"');
    expect(problem).not.toMatch(/synopsis/);
  });

  test('Review focus 4: a summary an automatic pass rewrote, put back by code, reads as the summary of its move', () => {
    const left = clone(MAP);
    beatOf(left, 'b3').synopsis = 'Morgan slips Riley an envelope at the bar.';
    const edits = carriedEdits(standingOnMap(null, MAP, left), left);
    const pass = clone(left);
    beatOf(pass, 'b3').synopsis = 'Morgan pays Riley off at the bar, and Riley pockets it.';
    const { report } = settleEdits(null, { edits, before: left, after: pass, pass: 1 });
    const [line] = report.changed.map((c) => ViewLogic.changedEditLine(c, ViewLogic.mapEditLineOptions(SLOTS, left)));
    expect(line).toBe('The Story, the summary of the move "Morgan pays Riley at the bar": automatic pass 1 changed your "Morgan slips Riley an envelope at the bar." to "Morgan pays Riley off at the bar, and Riley pockets it.". Your text was put back.');
    // Code put it back, so the page lists nothing and says the edit stands.
    const view = viewOf(left, report);
    expect(changedLinesOf(view)).toEqual([]);
    expect(view.kept).toBe('Your edit stands.');
  });

  test("a send-back's rework that changed the order: one line, under the section's head, the moves by their titles", () => {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    const edits = carriedEdits(standingOnMap(null, MAP, left), left);
    const rework = EditLogic.moveBeatBy(left, 'b4', 1);
    const { report } = settleEdits(null, { edits, before: left, after: rework, pass: SEND_BACK_PASS, reasons: [{ id: 'E1', reason: 'The note asks for the sale first.' }] });
    const view = viewOf(rework, report);
    expect(view.sections.find((s) => s.slot === 'theStory').changed).toEqual([
      'The Story, the order of its moves: your "Marcus brags about the sale / The paternity result names Sarah / Morgan pays Riley at the bar" became "Marcus brags about the sale / Morgan pays Riley at the bar / The paternity result names Sarah" (the rework of your send-back). Why: The note asks for the sale first.'
    ]);
    expect(changedLinesOf(view)).toHaveLength(1);
    changedLinesOf(view).forEach((text) => expect(text).not.toMatch(TAG));
  });

  test('no line the page shows for the new kinds holds an id or a field name, after a send-back or an automatic pass', () => {
    const left = EditLogic.moveBeatBy(clone(MAP), 'b4', -1);
    beatOf(left, 'b6').synopsis = 'Riley insists they only kept the books.';
    const edits = carriedEdits(standingOnMap(null, MAP, left), left);
    const pass = EditLogic.moveBeatBy(left, 'b4', 1);
    beatOf(pass, 'b6').synopsis = 'Riley says the books were all.';
    [SEND_BACK_PASS, 1].forEach((kind) => {
      const { report } = settleEdits(null, { edits, before: left, after: pass, pass: kind });
      const lines = report.changed.map((c) => ViewLogic.changedEditLine(c, ViewLogic.mapEditLineOptions(SLOTS, left)));
      expect(lines).toHaveLength(2);
      lines.forEach((text) => {
        expect(text).not.toMatch(TAG);
        expect(text).not.toMatch(/synopsis|beats\b/);
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The console's words, held to the server's places on one corpus (R11)
// ═══════════════════════════════════════════════════════════════════════════

describe("4C: the console's reading of each place the server writes, on one corpus with the new kinds", () => {
  /** The director's map: one edit of every kind the map's page makes. */
  function directorsMap() {
    let map = clone(MAP);
    map.headline = 'The Ledger Kept Talking';
    map.expectedLength = 1400;
    map.gapNote = { line: 'The record holds nothing Sarah did.', players: ['Sarah'] };
    beatOf(map, 'b3').move = 'Morgan pays Riley off at the bar';
    beatOf(map, 'b3').synopsis = 'Morgan slips Riley an envelope at the bar.';
    beatOf(map, 'b6').players = ['Riley', 'Morgan'];
    map = EditLogic.moveBeatBy(map, 'b4', -1);
    map = EditLogic.strikeBeat(map, 'b5');
    map = EditLogic.bringBackBeat(map, 'b9', 'closing', 0);
    map = EditLogic.movePhoto(map, 'theStory', 0, 'lede');
    map = EditLogic.addBeat(map, 'lede', 'Kai leaves before the count', 'Kai');
    return map;
  }

  test('the reader finds the beat the server placed each edit on, and the words name no id, no beat tag and no summary field', () => {
    const left = directorsMap();
    const edits = standingOnMap(null, MAP, left).edits;
    const wheres = edits.map((e) => editWhere(e));
    // The corpus holds the new kinds.
    expect(wheres).toEqual(expect.arrayContaining([
      'section "theStory", the summary of beat "b3"', 'section "theStory", the order of its moves', 'section "closing", the order of its moves'
    ]));
    edits.forEach((e) => {
      const address = mapEditAddress(e);
      const id = address && address.kind === 'beat' ? address.identity.id : null;
      expect(`${e.path}: ${readBeat(editWhere(e))}`).toBe(`${e.path}: ${id}`);
      const words = ViewLogic.mapEditLineOptions(SLOTS, left).place({ where: editWhere(e), scope: 'map' });
      expect(words).not.toMatch(TAG);
      expect(words).not.toMatch(/beat "|synopsis|expectedLength|weaveChanges/);
      if (id) expect(words).toContain(`the move "${beatOf(left, id).move}"`);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Where a changed line sits (spec 7; the integrator's ruling after run 1's follow-ups)
// ═══════════════════════════════════════════════════════════════════════════

describe('4C: each changed line sits beside its place on the page; only one with no place stays among the round\'s lines', () => {
  /** The fixture's map with a photo by itself in The Story and a gap note. */
  function pageMap() {
    const map = clone(MAP);
    map.sections[1].photos.push({ filename: 'p3.jpg' });
    map.gapNote = { line: 'The record holds nothing Sarah did.', players: ['Sarah'] };
    return map;
  }
  const story = (view) => view.sections.find((s) => s.slot === 'theStory');
  const card = (view, id) => [...view.sections.flatMap((s) => s.beats), ...view.leftOut.items].find((b) => b.id === id);
  const BESIDE_NONE = { gapNote: [], length: [], weaveChanges: [] };

  test('a photo beside a move: on that move\'s card, where the photo prints', () => {
    const view = viewOf(pageMap(), reportOf(entry({ id: 'E1', where: 'section "theStory", photo "p2.jpg", beat' })));
    expect(card(view, 'b2').changed).toEqual([
      'The Story, photo "p2.jpg", beat: your "a" became "b" (the rework of your send-back). Why: The note asks for it.'
    ]);
    expect(story(view).changed).toEqual([]);
    expect(view.changedEdits).toEqual([]);
  });

  test('a photo by itself: under its section\'s head', () => {
    const view = viewOf(pageMap(), reportOf(entry({ id: 'E1', where: 'section "theStory", photo "p3.jpg", moved from section "lede"', moved: true, became: 'section "lede"' })));
    expect(story(view).changed).toEqual([
      'The Story, photo "p3.jpg", moved from Lede: the rework of your send-back moved the photo you placed here to Lede. Why: The note asks for it.'
    ]);
    expect(view.sections.flatMap((s) => s.beats.flatMap((b) => b.changed))).toEqual([]);
  });

  test("an order edit: under its section's head", () => {
    const view = viewOf(pageMap(), reportOf(entry({ id: 'E1', where: 'section "theStory", the order of its moves' })));
    expect(story(view).changed).toEqual(['The Story, the order of its moves: your "a" became "b" (the rework of your send-back). Why: The note asks for it.']);
    expect(view.changedEdits).toEqual([]);
  });

  test('the gap note, the expected length and the weave changes: each beside its own place', () => {
    const view = viewOf(pageMap(), reportOf(
      entry({ id: 'E1', where: 'gap note, line' }),
      entry({ id: 'E2', where: 'expectedLength', director: '1400', became: '1200' }),
      entry({ id: 'E3', where: 'weaveChanges' })
    ));
    expect(view.changedBeside).toEqual({
      gapNote: ['Gap note, line: your "a" became "b" (the rework of your send-back). Why: The note asks for it.'],
      length: ['The expected length: your "1400" became "1200" (the rework of your send-back). Why: The note asks for it.'],
      weaveChanges: ["The map's changes to the weave: your \"a\" became \"b\" (the rework of your send-back). Why: The note asks for it."]
    });
    expect(view.changedEdits).toEqual([]);
    // The weave changes show, to carry their line, though the map lists none.
    expect(view.order).toContain('weaveChanges');
  });

  test('a gap note the page no longer shows: its line stays among the round\'s lines', () => {
    const map = clone(MAP);
    const view = viewOf(map, reportOf(entry({ id: 'E1', where: 'gap note', director: 'line: The record holds nothing Sarah did.', became: null })));
    expect(view.changedBeside).toEqual(BESIDE_NONE);
    expect(view.changedEdits).toHaveLength(1);
  });

  test('a line with no place on the page stays among the round\'s lines, and the page shows no beside lines', () => {
    // A section the board does not show: the rework folded it into another.
    const view = viewOf(pageMap(), reportOf(entry({ id: 'E1', where: 'section "whatsMissing", added', became: null })));
    expect(view.changedEdits).toEqual(["What's Missing, added: your \"a\" is gone (the rework of your send-back). Why: The note asks for it."]);
    expect(view.changedBeside).toEqual(BESIDE_NONE);
    expect(view.sections.flatMap((s) => [...s.changed, ...s.beats.flatMap((b) => b.changed)])).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The console's copy of the summary's field, and the page the harness prints
// ═══════════════════════════════════════════════════════════════════════════

describe("4C: the console's copy of the summary's field is the server's, and the printed page carries the beside lines", () => {
  test("the field the page names as a move's summary is the server's, and a beat's own", () => {
    const { _testing } = require('../../lib/hand-edit-diff');
    expect(ViewLogic.MAP_SUMMARY_FIELD).toBe(_testing.MAP_SUMMARY_FIELD);
    expect(EditLogic.BEAT_KEYS).toContain(ViewLogic.MAP_SUMMARY_FIELD);
  });

  test('the page lib/stop-pages.js prints, as the harness and the stops log read it, holds each beside line once', () => {
    const { stopPage } = require('../../lib/stop-pages');
    const map = clone(MAP);
    map.gapNote = { line: 'The record holds nothing Sarah did.', players: ['Sarah'] };
    const report = reportOf(
      entry({ id: 'E1', where: 'gap note, line' }),
      entry({ id: 'E2', where: 'expectedLength', director: '1400', became: '1200' }),
      entry({ id: 'E3', where: 'weaveChanges' })
    );
    const d = payloadOf(stateAt({ outline: map, _mapBaseline: clone(map), _outlineHandEditReport: report, humanOutlineRevisionCount: 1 }));
    const view = ViewLogic.mapView(d, ViewLogic.mapDraftOf(d, undefined));
    const printed = stopPage('outline', d).lines.map((line) => line.text);
    ['gapNote', 'length', 'weaveChanges'].forEach((key) => {
      expect(view.changedBeside[key]).toHaveLength(1);
      expect(printed.filter((text) => text === view.changedBeside[key][0])).toHaveLength(1);
    });
  });
});

describe("4C: a place that opens on a word keeps it; only a field's name is put in the page's words", () => {
  test('the headline, the deck and the gap note read as before', () => {
    const place = (where) => ViewLogic.mapEditLineOptions(SLOTS, clone(MAP)).place({ where, scope: 'map' });
    expect([place('headline'), place('deck'), place('gap note, line'), place('weaveChanges, cut')]).toEqual([
      'Headline', 'Deck', 'Gap note, line', "The map's changes to the weave, cut"
    ]);
  });
});
