/**
 * The map's page model as a corkboard (phase 4b, piece 4, brief 4B; spec 2026-10-07 sections 4
 * to 7; R4, R7, R8, R11): the order of the page, the legend of the story's threads with each
 * card's dots, the "Card" mark, each move's synopsis, the photos on their cards and by themselves,
 * the counts and the tray. Invented text: the repo is public.
 */
const EditLogic = require('../outline-edit-logic');
const ViewLogic = require('../checkpoint-view-logic');
const { mapCheckpointData } = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { boardMap, boardMapState } = require('../../lib/__tests__/fixtures/board-map');

/** The stop's payload for a state, as server.js getCheckpointData sends it (less the trace). */
function payloadOf(state = boardMapState()) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
}

const viewOf = (state = boardMapState(), map) => {
  const data = payloadOf(state);
  return ViewLogic.mapView(data, map || ViewLogic.mapDraftOf(data, undefined));
};

const cardsOf = (view) => view.sections.flatMap((s) => s.beats);
const cardOf = (view, id) => [...cardsOf(view), ...view.leftOut.items].find((b) => b.id === id);

// ═══════════════════════════════════════════════════════════════════════════
// The page's order (spec 4)
// ═══════════════════════════════════════════════════════════════════════════

describe("4B: the page reads in the spec's order", () => {
  test('the counts, the settled story, the threads, the top of the article, the board, the tray, then what dropped', () => {
    expect(viewOf().order).toEqual(['tally', 'settledStory', 'legend', 'top', 'sections', 'leftOut', 'dropped']);
  });

  test("the round's lines come first when there are any, and the map's changes to the weave last", () => {
    const state = boardMapState({ humanOutlineRevisionCount: 1 });
    state.outline.weaveChanges = [{ source: 'note', change: 'The successors get their own section.' }];
    expect(viewOf(state).order).toEqual(['round', 'tally', 'settledStory', 'legend', 'top', 'sections', 'leftOut', 'dropped', 'weaveChanges']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The legend and the dots (R4)
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: the threads at the top, and a dot on each card for each thread it carries', () => {
  test("the legend lists the story's threads in the angle's order, each with its tone by place and its line", () => {
    const { legend } = viewOf();
    expect(legend.title).toBe('The threads');
    expect(legend.threads.map((t) => [t.tone, t.name])).toEqual([
      [1, 'An accident'], [2, "Marcus's own dosing"], [3, 'The trial run'], [4, "Quinn's two stories"],
      [5, 'The memories sold'], [6, 'Reality is negotiable'], [7, 'The successors']
    ]);
    expect(legend.threads[2].line).toBe('The night tried the batch on its guests, and someone wanted it tried.');
    expect(legend.threads[0].labels.pick).toBe('Follow the thread "An accident" across the board');
  });

  test('the tones repeat after eight', () => {
    const state = boardMapState();
    const extra = Array.from({ length: 3 }, (_, i) => ({ id: `t${20 + i}`, name: `Extra ${i}`, line: 'More.', evidence: [] }));
    state.weave.threads.push(...extra);
    state.weave.angles[0].threads.push(...extra.map((t) => t.id));
    expect(viewOf(state).legend.threads.map((t) => t.tone)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 1, 2]);
  });

  test("a card's dots are its threads by tone and name, in its own order", () => {
    const view = viewOf();
    expect(cardOf(view, 'b4').dots).toEqual([{ tone: 3, name: 'The trial run' }, { tone: 2, name: "Marcus's own dosing" }]);
  });

  test('a thread outside the story has the grey tone and its name; an id the weave does not hold, the grey tone and no name', () => {
    const map = boardMap();
    map.sections[0].beats[0].threads = ['t1', 't9', 't99'];
    expect(cardOf(viewOf(boardMapState(), map), 'b1').dots).toEqual([
      { tone: 1, name: 'An accident' }, { tone: 0, name: 'Protecting Sarah' }, { tone: 0, name: '' }
    ]);
    expect(cardOf(viewOf(), 'b17').dots).toEqual([{ tone: 0, name: 'The other suspects' }]);
  });

  test('a move the director added carries no thread, so no dot', () => {
    const data = payloadOf();
    const added = EditLogic.addBeat(ViewLogic.mapDraftOf(data, undefined), 'closing', 'Remi walks out', 'Remi');
    expect(cardOf(ViewLogic.mapView(data, added), 'b19').dots).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The cards
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: each card gives its title, people, dots, mark, photos, synopsis, evidence and controls', () => {
  test('the "Card" mark replaces "(card)", on a move whose evidence prints as a card', () => {
    expect(ViewLogic.MAP_CARD_MARK).toBe('Card');
    const view = viewOf();
    expect(cardOf(view, 'b3')).toMatchObject({ card: true, cardMark: 'Card' });
    expect(cardOf(view, 'b1')).toMatchObject({ card: false, cardMark: '' });
  });

  test("the synopsis is the move's, or '' for a move with none, as on a map from before piece 4", () => {
    const view = viewOf();
    expect(cardOf(view, 'b1').synopsis).toBe('Near the end, Quinn and Kai steer the room toward calling the death an accident, and the vote follows.');
    const old = boardMap();
    old.sections.forEach((s) => s.beats.forEach((b) => { delete b.synopsis; }));
    expect(cardsOf(viewOf(boardMapState(), old)).map((b) => b.synopsis)).toEqual(Array(16).fill(''));
  });

  test("a card's photos are those beside it; a column's byThemselves those beside no move of its own", () => {
    const view = viewOf();
    expect(cardOf(view, 'b3').photos.map((p) => p.filename)).toEqual(['p03.jpg']);
    expect(cardOf(view, 'b5').photos).toEqual([]);
    expect(view.sections[1].byThemselves.map((p) => p.filename)).toEqual(['p05.jpg']);
    // The section's photo list stays whole, in its order, for the controls that place a photo by its index.
    expect(view.sections[1].photos.map((p) => p.filename)).toEqual(['p03.jpg', 'p04.jpg', 'p05.jpg']);
  });

  test('where its threads meet, by the connection\'s line, when a connection lands in the move', () => {
    const view = viewOf();
    expect(cardOf(view, 'b10').meets).toBe('The sales spiked as the trial run came to light.');
    expect(cardOf(view, 'b9').meets).toBe('');
  });

  test("each card's label and each legend thread's label are its words as the page prints them (run 1 follow-up F4)", () => {
    const view = viewOf();
    expect(cardOf(view, 'b5')).toMatchObject({ label: 'Jess warns Sarah away', move: 'Jess warns Sarah away' });
    expect(cardOf(view, 'b17').label).toBe('The other suspects let go');
    expect(view.legend.threads.map((t) => t.label)).toEqual(view.legend.threads.map((t) => t.name));
    expect(view.legend.threads[0]).toMatchObject({ label: 'An accident', name: 'An accident' });
  });

  test("its controls' labels name the move by its title, never by an id", () => {
    const labels = cardOf(viewOf(), 'b5').labels;
    expect(labels).toMatchObject({
      select: 'Select the move "Jess warns Sarah away"',
      showSummary: 'Show the summary of "Jess warns Sarah away"',
      hideSummary: 'Hide the summary of "Jess warns Sarah away"',
      moveUp: 'Move "Jess warns Sarah away" up',
      moveDown: 'Move "Jess warns Sarah away" down',
      photoBeside: 'Put a photo beside "Jess warns Sarah away"'
    });
  });

  test('a card says whether it can move up or down within its column', () => {
    const view = viewOf();
    expect([cardOf(view, 'b3').canMoveUp, cardOf(view, 'b3').canMoveDown]).toEqual([false, true]);
    expect([cardOf(view, 'b8').canMoveUp, cardOf(view, 'b8').canMoveDown]).toEqual([true, false]);
    expect([cardOf(view, 'b17').canMoveUp, cardOf(view, 'b17').canMoveDown]).toEqual([false, false]);
  });

  test("an edit of the director's that a rework changed sits on the card it is about", () => {
    const state = boardMapState({
      _outlineHandEditReport: {
        checked: ['E1', 'E2'],
        changed: [
          { id: 'E1', scope: 'outline', where: 'section "theStory", beat "b5", move', director: 'Jess pulls Sarah aside', became: 'Jess warns Sarah away', pass: 'send-back', automatic: false, reason: 'The note asked for the warning.' },
          { id: 'E2', scope: 'outline', where: 'headline', director: 'An Accident, Says the Room', became: 'Ten Votes Call the Trial Run an Accident', pass: 'send-back', automatic: false, reason: 'The note asked for the count.' }
        ]
      }
    });
    const view = viewOf(state);
    expect(cardOf(view, 'b5').changed).toEqual([expect.stringContaining('Jess pulls Sarah aside')]);
    expect(view.changedEdits).toEqual([expect.stringContaining('An Accident, Says the Room')]);
    expect(cardOf(view, 'b4').changed).toEqual([]);
  });

  test('no card, photo or legend label or line carries an id: ids are keys and control values only', () => {
    const view = viewOf();
    /** Every string the view gives, but under the keys a control finds a line by. */
    const strings = (value, key) => {
      if (['id', 'key', 'value', 'beat'].includes(key)) return [];
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap((v) => strings(v));
      if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => strings(v, k));
      return [];
    };
    strings({ legend: view.legend, sections: view.sections, leftOut: view.leftOut }).forEach((text) => expect(text).not.toMatch(/\b[btc]\d+\b/));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The columns, the counts and the tray
// ═══════════════════════════════════════════════════════════════════════════

describe('4B: the columns, the counts and the tray', () => {
  test('a column with no heading says none prints, and one the director emptied says it drops when the map is sent', () => {
    const view = viewOf();
    expect(ViewLogic.MAP_NO_HEADING_LINE).toBe('No heading printed');
    expect(view.sections[0].heading).toBe('');
    const data = payloadOf();
    let map = ViewLogic.mapDraftOf(data, undefined);
    ['b15', 'b16'].forEach((id) => { map = EditLogic.strikeBeat(map, id); });
    map = EditLogic.movePhoto(map, 'closing', 1, 'theStory');
    map = EditLogic.movePhoto(map, 'closing', 0, 'theStory');
    const emptied = ViewLogic.mapView(data, map).sections.find((s) => s.slot === 'closing');
    expect(emptied.emptied).toBe(ViewLogic.MAP_EMPTIED_COLUMN_LINE);
    expect(view.sections[4].emptied).toBe('');
  });

  test('the counts: everyone placed, the cards, the photos placed of those kept, the expected length', () => {
    const { tally } = viewOf();
    expect(tally).toEqual({
      placed: 'Everyone placed', unplaced: '', raised: '', cards: '3 cards', photos: '10 of 10 photos', length: 'About 1,350 words', lengthConcerns: []
    });
  });

  test('a player in no move is named, the cards off their range say so, and a length not set says so', () => {
    const map = boardMap();
    map.sections[2].beats[2].card = false;
    map.sections[1].beats.forEach((b) => { b.card = false; b.evidence.forEach((p) => { delete p.card; }); });
    map.sections[1].beats.splice(5, 1);
    delete map.expectedLength;
    const { tally } = viewOf(boardMapState(), map);
    expect(tally.placed).toBe('');
    expect(tally.unplaced).toBe('In no move: Remi');
    expect(tally.cards).toBe('0 cards, under the 3 to 5 the article carries');
    expect(tally.length).toBe('Length not set');
  });

  test('the tray is always open, each move by its title and its dots', () => {
    const { leftOut } = viewOf();
    expect(leftOut).not.toHaveProperty('open');
    expect(leftOut.title).toBe('Left out (2)');
    expect(leftOut.items.map((b) => [b.move, b.dots])).toEqual([
      ['The other suspects let go', [{ tone: 0, name: 'The other suspects' }]],
      ['An old grudge at the bar', [{ tone: 0, name: "Remi's and Kai's quarrels" }]]
    ]);
  });

  test('the board\'s toggle opens or closes every summary', () => {
    expect(viewOf().summaries).toEqual({ open: 'Open every summary', close: 'Close every summary' });
  });

  test('a photo can go beside any move in any section, each named by its title and its section', () => {
    const photo = viewOf().sections[2].byThemselves[0];
    expect(photo.besideTargets).toHaveLength(16);
    expect(photo.besideTargets[0]).toEqual({ slot: 'lede', value: 'b1', label: 'Beside: The room settles on an accident (Lede)' });
  });
});
