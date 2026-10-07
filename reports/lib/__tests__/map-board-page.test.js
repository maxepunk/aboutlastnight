/**
 * The map's page as a corkboard, and its length on two pages (phase 4b, piece 4, brief 4B; spec
 * 2026-10-07 sections 4, 8 and 13; R6 to R8): lib/stop-pages.js prints the board's lines in
 * mapView's order, with each synopsis, each thread's line, the evidence and each photo's
 * description folded, and opens the synopses on request; the check counts the page as it opens and
 * with every synopsis open, each against its own bound, on the writer's share alone; the stops log
 * records both counts at the map. Invented text: the repo is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const View = require('../../console/checkpoint-view-logic');
const EditLogic = require('../../console/outline-edit-logic');
const { stopPage, wordsShown, PAGE_REGIONS } = require('../stop-pages');
const {
  mapCheckpointData, mapFindings, mapLengthOf, directorMapProblems, mapResume,
  MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM
} = require('../map');
const { isOldShapeMap } = require('../old-thread');
const { standingOnMap } = require('../hand-edit-diff');
const { wordCount } = require('../word-count');
const { CHECKPOINT_TYPES } = require('../workflow/checkpoint-helpers');
const { keptPhotoFilenames } = require('../workflow/nodes/ai-nodes');
const mapNodes = require('../workflow/nodes/map-nodes')._testing;
const stopsLog = require('../stops-log');
const { boardMap, boardMapState, BOARD_PHOTOS } = require('./fixtures/board-map');

const OUTLINE = CHECKPOINT_TYPES.OUTLINE;
const clone = (v) => JSON.parse(JSON.stringify(v));
const payloadOf = (state = boardMapState()) => mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
const shownOf = (page) => page.lines.filter((l) => !l.folded).map((l) => l.text);
const foldedOf = (page) => page.lines.filter((l) => l.folded).map((l) => l.text);
const beatOf = (map, id) => [...map.sections.flatMap((s) => s.beats), ...map.leftOut].find((b) => b.id === id);
/** The map with every synopsis padded by `words` words. */
const longSynopses = (words, map = boardMap()) => {
  map.sections.forEach((s) => s.beats.forEach((b) => { b.synopsis = `${b.synopsis} ${Array.from({ length: words }, (_, i) => `word${i}`).join(' ')}`; }));
  return map;
};
const withoutSynopses = () => {
  const map = boardMap();
  [...map.sections.flatMap((s) => s.beats), ...map.leftOut].forEach((b) => { delete b.synopsis; });
  return map;
};

// ═══════════════════════════════════════════════════════════════════════════
// The page (spec 4; R7, R8)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: the map's page prints the board in the view's order", () => {
  test('the counts, then the settled story, the threads, the top of the article, the columns, the tray and what dropped', () => {
    const page = stopPage(OUTLINE, payloadOf());
    const shown = shownOf(page);
    const at = (text) => shown.indexOf(text);
    ['Everyone placed', 'An accident', 'Ten Votes Call the Trial Run an Accident', 'The room settles on an accident', 'The other suspects let go', "Its questions land in the closing."]
      .forEach((text) => expect([text, at(text)]).not.toEqual([text, -1]));
    expect(at('Everyone placed')).toBeLessThan(at('An accident'));
    expect(at('An accident')).toBeLessThan(at('Ten Votes Call the Trial Run an Accident'));
    expect(at('Ten Votes Call the Trial Run an Accident')).toBeLessThan(at('The room settles on an accident'));
    expect(at('A launch waits on the closed case')).toBeLessThan(at('The other suspects let go'));
    expect(at('The other suspects let go')).toBeLessThan(at("Its questions land in the closing."));
  });

  test('the counts are a part the page names only by its aria-label', () => {
    expect(PAGE_REGIONS[OUTLINE].counts).toBe('The counts');
    const counts = stopPage(OUTLINE, payloadOf()).lines.filter((l) => l.region === PAGE_REGIONS[OUTLINE].counts).map((l) => l.text);
    expect(counts).toEqual(['Everyone placed', '3 cards', '10 of 10 photos', 'About 1,350 words']);
  });

  test('a card prints its title, its people and the "Card" mark; its synopsis, its threads and its evidence are folded', () => {
    const page = stopPage(OUTLINE, payloadOf());
    expect(shownOf(page)).toEqual(expect.arrayContaining(['Marcus tests the batch on himself', 'Sam', 'Card']));
    expect(foldedOf(page)).toEqual(expect.arrayContaining([
      "Sam's journal shows Marcus trying the new batch on himself in the days before the party.",
      "Marcus's own dosing",
      'The sales spiked as the trial run came to light.'
    ]));
    expect(shownOf(page).join('\n')).not.toMatch(/journal shows Marcus|The sales spiked/);
  });

  test("the legend prints each thread's name and folds its line", () => {
    const page = stopPage(OUTLINE, payloadOf());
    expect(shownOf(page)).toEqual(expect.arrayContaining(['An accident', "Quinn's two stories", 'The successors']));
    expect(foldedOf(page)).toContain('What Quinn told the room does not match what Quinn was asked to do.');
    expect(shownOf(page)).not.toContain('What Quinn told the room does not match what Quinn was asked to do.');
  });

  test('a photo prints no words: its description is folded, for the harness', () => {
    const page = stopPage(OUTLINE, payloadOf());
    Object.values(BOARD_PHOTOS).forEach((text) => {
      expect(shownOf(page)).not.toContain(text);
      expect(foldedOf(page)).toContain(text);
    });
  });

  test('the option that opens the synopses unfolds them, and only them', () => {
    const data = payloadOf();
    const closed = stopPage(OUTLINE, data);
    const open = stopPage(OUTLINE, data, { synopsesOpen: true });
    const synopses = boardMap().sections.flatMap((s) => s.beats.map((b) => b.synopsis));
    synopses.forEach((text) => expect(shownOf(open)).toContain(text));
    expect(shownOf(open).filter((text) => !synopses.includes(text))).toEqual(shownOf(closed));
    expect(foldedOf(open)).toEqual(foldedOf(closed).filter((text) => !synopses.includes(text)));
    // The tray's moves open on selection, not with the board's toggle.
    expect(shownOf(open)).not.toContain(boardMap().leftOut[0].synopsis);
  });

  test('no line or label carries an id', () => {
    [stopPage(OUTLINE, payloadOf()), stopPage(OUTLINE, payloadOf(), { synopsesOpen: true })].forEach(({ lines }) => {
      lines.forEach((l) => expect(`${l.label} ${l.text}`).not.toMatch(/\b[btc]\d+\b/));
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The length on two pages (spec 8; R6)
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: the length is counted as the page opens and with every synopsis open', () => {
  test('the bounds: 450 as it opens, aiming for 300; 750 with every synopsis open, the synopses aiming for 250', () => {
    expect([MAP_WORD_BOUND, MAP_WORD_AIM, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM]).toEqual([450, 300, 750, 250]);
    expect(mapLengthOf(400, 150)).toEqual({ page: 400, writer: 250, allowance: 300 });
    expect(mapLengthOf(700, 150, { open: true })).toEqual({ page: 700, writer: 550, allowance: 600 });
    expect(mapLengthOf(700, 250, { open: true })).toEqual({ page: 700, writer: 450, allowance: 550 });
  });

  test('a map in the mock-up\'s shape, sixteen moves, fits both pages', () => {
    const state = boardMapState();
    const words = mapNodes.mapPageWords(state, state.outline, []);
    const data = mapNodes.firstLookData(state, state.outline);
    expect(words.folded.page).toBe(wordsShown(OUTLINE, data));
    expect(words.unfolded.page).toBe(wordsShown(OUTLINE, data, { synopsesOpen: true }));
    expect(words.folded.page).toBeLessThanOrEqual(MAP_WORD_BOUND);
    expect(words.unfolded.page).toBeLessThanOrEqual(MAP_OPEN_WORD_BOUND);
    const synopses = state.outline.sections.reduce((n, s) => n + s.beats.reduce((m, b) => m + wordCount(b.synopsis), 0), 0);
    expect(words.unfolded.writer - words.folded.writer).toBe(synopses);
    expect(words.unfolded.page - words.folded.page).toBe(synopses);
    const result = mapNodes.checkMap(state);
    expect(result._mapCheck).toMatchObject({ passed: true, words });
  });

  test("long synopses fail the open page alone, and its message names the longest of the writer's lines there", () => {
    const result = mapNodes.checkMap(boardMapState({ outline: longSynopses(30) }));
    const { failures, words } = result._mapCheck;
    expect(failures.map((f) => f.type)).toEqual(['over-length']);
    expect(words.folded.writer).toBeLessThanOrEqual(words.folded.allowance);
    expect(failures[0].line).toBe(`With every summary open, the writer's part of the map runs to ${words.unfolded.writer} words, past the ${words.unfolded.allowance} it may use.`);
    expect(failures[0].message).toMatch(/^With every synopsis open, the map's page runs to \d+ words/);
    expect(failures[0].message).toMatch(/starting with the longest: beat b\d+'s synopsis \(\d+ words\)/);
    expect(failures[0].message).not.toMatch(/photos' descriptions/);
  });

  test('long titles fail the page as it opens, its line saying so', () => {
    const map = boardMap();
    map.sections.forEach((s) => s.beats.forEach((b) => { b.move = `${b.move} ${Array.from({ length: 20 }, (_, i) => `title${i}`).join(' ')}`; }));
    const { failures, words } = mapNodes.checkMap(boardMapState({ outline: map }))._mapCheck;
    expect(failures.map((f) => f.type)).toEqual(['over-length', 'over-length']);
    expect(failures[0].line).toBe(`As the map opens, the writer's part of the map runs to ${words.folded.writer} words, past the ${words.folded.allowance} it may use.`);
    expect(failures[0].message).toMatch(/^As the map opens, the map's page runs to \d+ words/);
    expect(failures[0].message).toMatch(/beat b\d+'s move and people/);
    expect(failures[0].message).not.toMatch(/synopsis \(/);
  });

  test('long photo descriptions count on neither page', () => {
    const long = Object.fromEntries(Object.keys(BOARD_PHOTOS).map((name) => [name, Array.from({ length: 90 }, () => 'crowd').join(' ')]));
    const base = mapNodes.mapPageWords(boardMapState(), boardMap(), []);
    const state = boardMapState({ photoDescriptions: long });
    expect(mapNodes.mapPageWords(state, state.outline, [])).toEqual(base);
    expect(mapNodes.checkMap(state)._mapCheck.failures).toEqual([]);
  });

  test("the director's lines never count toward the writer's words, a synopsis they rewrote among them", () => {
    const left = boardMap();
    beatOf(left, 'b3').synopsis = Array.from({ length: 300 }, () => 'theirs').join(' ');
    beatOf(left, 'b5').move = Array.from({ length: 200 }, () => 'theirs').join(' ');
    const edits = standingOnMap(null, boardMap(), left);
    const state = boardMapState({ outline: left, _outlineHandEdits: edits });
    const result = mapNodes.checkMap(state);
    expect(result._mapCheck.failures).toEqual([]);
    const base = mapNodes.mapPageWords(boardMapState(), boardMap(), []);
    expect(result._mapCheck.words.unfolded.writer).toBeLessThan(base.unfolded.writer);
    expect(directorMapProblems(left, { theme: 'journalist', shown: boardMap() })).toBeNull();
  });

  test('mapFindings reads each page\'s count apart: a page within its allowance passes beside one past it', () => {
    const state = boardMapState();
    const inputs = mapNodes.mapCheckInputsOf(state, state.outline);
    const ok = { page: 300, writer: 200, allowance: 300 };
    const over = { page: 760, writer: 610, allowance: 600 };
    expect(mapFindings(state.outline, { ...inputs, length: { folded: ok, unfolded: ok } }).failures).toEqual([]);
    const failures = mapFindings(state.outline, { ...inputs, length: { folded: ok, unfolded: over } }).failures;
    expect(failures.map((f) => f.type)).toEqual(['over-length']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A map from before piece 4 (spec 13; R1; Review focus 2)
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: a map with no synopses validates, counts and shows', () => {
  test('it passes the director\'s gate and the client\'s, is no earlier shape, and counts the same on both pages', () => {
    const old = withoutSynopses();
    expect(isOldShapeMap(old)).toBe(false);
    expect(directorMapProblems(old, { theme: 'journalist', shown: old })).toBeNull();
    expect(EditLogic.validateOutlineShape(clone(old), 'journalist', payloadOf().mapSlots, old).valid).toBe(true);
    expect(mapResume({ outline: 'approve', map: old }, boardMapState({ outline: old }), { theme: 'journalist' }).error).toBeNull();
    const data = payloadOf(boardMapState({ outline: old }));
    expect(wordsShown(OUTLINE, data, { synopsesOpen: true })).toBe(wordsShown(OUTLINE, data));
    const view = View.mapView(data, View.mapDraftOf(data));
    expect(view.sections.flatMap((s) => s.beats).every((b) => b.synopsis === '')).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The stops log (R6)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: the map's pause line in the stops log carries both counts", () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-stops-log-board-'));
    stopsLog.setStopsLogRoot(dir);
  });
  afterEach(() => {
    stopsLog._resetForTests();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const linesOf = () => fs.readFileSync(path.join(dir, '100726', 'stops.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

  test('wordsOpen at the map, the count with every synopsis open, and at no other stop', () => {
    const state = boardMapState();
    const data = { type: 'outline', ...payloadOf(state), trace: [] };
    stopsLog.recordPause('100726', { stop: OUTLINE, state, data });
    stopsLog.recordPause('100726', { stop: 'photos', state: {}, data: { type: 'photos' } });
    const [map, photos] = linesOf();
    expect(Object.keys(map)).toEqual(['at', 'kind', 'stop', 'round', 'words', 'wordsOpen']);
    expect([map.words, map.wordsOpen]).toEqual([wordsShown(OUTLINE, data), wordsShown(OUTLINE, data, { synopsesOpen: true })]);
    expect(map.wordsOpen).toBeGreaterThan(map.words);
    expect(Object.keys(photos)).toEqual(['at', 'kind', 'stop', 'round', 'words']);
  });
});
