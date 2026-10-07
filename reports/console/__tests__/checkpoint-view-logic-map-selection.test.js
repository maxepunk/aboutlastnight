/**
 * What the board needs from the map's page model to follow a thread and open a selected card
 * (phase 4b, piece 4, brief 4D; spec 2026-10-07 sections 4 and 5): the legend's threads each card
 * carries, the photos a card can take beside it, the piece that prints as the card, and the names
 * a photo's selection and its placing controls read out. Outline.js reads each of them as given.
 * Invented text: the repo is public.
 */
const EditLogic = require('../outline-edit-logic');
const ViewLogic = require('../checkpoint-view-logic');
const { mapCheckpointData } = require('../../lib/map');
const { keptPhotoFilenames } = require('../../lib/workflow/nodes/ai-nodes');
const { boardMap, boardMapState, BOARD_PHOTOS } = require('../../lib/__tests__/fixtures/board-map');

function payloadOf(state = boardMapState()) {
  return mapCheckpointData(state, { keptPhotos: keptPhotoFilenames(state, state.outline.topPhoto), evidenceIndex: {}, maxRevisions: 1 });
}

const viewOf = (state = boardMapState(), map) => {
  const data = payloadOf(state);
  return ViewLogic.mapView(data, map || ViewLogic.mapDraftOf(data, undefined));
};

const cardsOf = (view) => view.sections.flatMap((s) => s.beats);
const cardOf = (view, id) => [...cardsOf(view), ...view.leftOut.items].find((b) => b.id === id);
const described = (n) => `"${BOARD_PHOTOS[`p${String(n).padStart(2, '0')}.jpg`]}"`;

describe("4D: each card names the legend's threads it carries, for following a thread across the board", () => {
  test("a card's legendKeys are the keys of the story's threads it carries, in its own order", () => {
    const view = viewOf();
    const keyOf = (name) => view.legend.threads.find((t) => t.name === name).key;
    expect(cardOf(view, 'b4').legendKeys).toEqual([keyOf('The trial run'), keyOf("Marcus's own dosing")]);
    expect(cardOf(view, 'b1').legendKeys).toEqual([keyOf('An accident')]);
  });

  test('a thread outside the story, an id the weave does not hold and a repeat give no key', () => {
    const map = boardMap();
    map.sections[0].beats[0].threads = ['t1', 't9', 't99', 't1'];
    const view = viewOf(boardMapState(), map);
    expect(cardOf(view, 'b1').legendKeys).toEqual([view.legend.threads[0].key]);
    expect(cardOf(view, 'b17').legendKeys).toEqual([]);
  });
});

describe('4D: a selected card offers every photo it can take beside it', () => {
  test('each photo placed on the board and not beside the move, the top photo first, named by its description and its place', () => {
    const view = viewOf();
    const choices = cardOf(view, 'b3').photoChoices;
    expect(choices.map((c) => c.label)).toEqual([
      `${described(1)} (${'The top of the article'})`,
      `${described(2)} (${view.sections[0].label})`,
      `${described(4)} (${view.sections[1].label})`,
      `${described(5)} (${view.sections[1].label})`,
      `${described(6)} (${view.sections[2].label})`,
      `${described(7)} (${view.sections[3].label})`,
      `${described(8)} (${view.sections[3].label})`,
      `${described(9)} (${view.sections[4].label})`,
      `${described(10)} (${view.sections[4].label})`
    ]);
    expect(cardOf(view, 'b5').photoChoices).toHaveLength(10);
    expect(new Set(choices.map((c) => c.value)).size).toBe(choices.length);
  });

  test("each choice carries the photo's place, which placePhotoBeside takes as it is", () => {
    const data = payloadOf();
    const map = ViewLogic.mapDraftOf(data, undefined);
    const [top, , , p05] = cardOf(ViewLogic.mapView(data, map), 'b3').photoChoices;
    expect(top).toMatchObject({ slot: EditLogic.MAP_TOP_PHOTO, index: 0 });
    expect(p05).toMatchObject({ slot: 'theStory', index: 2 });
    const placed = EditLogic.placePhotoBeside(map, p05.slot, p05.index, 'theStory', 'b3');
    expect(placed.sections[1].photos[2]).toEqual({ filename: 'p05.jpg', beat: 'b3' });
    const fromTop = EditLogic.placePhotoBeside(map, top.slot, top.index, 'theStory', 'b3');
    expect(fromTop.topPhoto).toBeUndefined();
  });

  test('a photo the director left out, a move in the tray and a locked move offer none', () => {
    const data = { ...payloadOf(), leftOutPhotos: ['p01.jpg', 'p02.jpg'] };
    const view = ViewLogic.mapView(data, ViewLogic.mapDraftOf(data, undefined));
    expect(cardOf(view, 'b3').photoChoices.map((c) => c.label)).not.toEqual(expect.arrayContaining([expect.stringContaining(described(1))]));
    expect(cardOf(view, 'b3').photoChoices).toHaveLength(7);
    expect(cardOf(view, 'b17').photoChoices).toEqual([]);
  });
});

describe("4D: what's behind a selected card marks the piece that prints as the card", () => {
  test('the flagged piece of a move marked as a card prints "Prints as a card"; every other piece none', () => {
    expect(ViewLogic.MAP_PRINTS_AS_CARD).toBe('Prints as a card');
    const view = viewOf();
    expect(cardOf(view, 'b3').evidence.map((p) => p.printsAsCard)).toEqual([true]);
    expect(cardOf(view, 'b1').evidence.map((p) => p.printsAsCard)).toEqual([false]);
    const map = boardMap();
    map.sections[1].beats[0].card = false;
    expect(cardOf(viewOf(boardMapState(), map), 'b3').evidence.map((p) => p.printsAsCard)).toEqual([false]);
  });
});

describe("4D: a photo's selection and its placing beside a move are named by its description", () => {
  test('a section photo and the top photo', () => {
    const view = viewOf();
    const [p05] = view.sections[1].byThemselves;
    expect(p05.labels).toMatchObject({ select: `Select the photo ${described(5)}`, placeBeside: `Put ${described(5)} beside a move` });
    expect(view.topPhoto.labels).toMatchObject({ select: `Select the top photo ${described(1)}`, placeBeside: `Put the top photo ${described(1)} beside a move` });
  });
});
