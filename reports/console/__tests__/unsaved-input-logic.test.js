/**
 * Task 4.14d: input that lands. What the director has typed at a stop and not yet saved holds
 * the stop's actions, and one line beside the buttons names it (console/unsaved-input-logic.js).
 *
 * The final review reproduced the loss on each screen (screens 1): at the desk an open block
 * editor's text, on the map a headline typed in its open editor, at the story meeting a thread
 * typed in the add line and never added, each dropped by Approve without a word. One rule
 * decides for every screen whether its actions wait and what the line says; the components
 * consult it on every action path (pinned in __tests__/unit/console-held-actions.test.js).
 */
const { unsavedInputLine } = require('../unsaved-input-logic');

const paragraph = (text) => ({ type: 'paragraph', text });

/** A desk bundle in the content-bundle's shape, with invented text. */
function deskBundle() {
  return {
    headline: { main: 'The Room Voted Overdose', kicker: 'NovaNews', deck: 'A sale the night he died.' },
    byline: { author: 'Cass Nova', title: 'Correspondent' },
    heroImage: { filename: 'hero.jpg', caption: 'The table at midnight.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Six votes named an overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('The brag came first.'),
          { type: 'evidence-card', tokenId: 'tok001', headline: 'The brag', content: 'A memory.', significance: 'critical' },
          { type: 'photo', filename: 'p2.jpg', caption: 'Two players at the bar.' }
        ]
      },
      { id: 'closing', type: 'conclusion', content: [{ type: 'quote', text: 'We only kept the books.', attribution: 'Riley' }] }
    ],
    evidenceCards: [
      { tokenId: 'tok001', headline: 'The brag', summary: 'A brag about a sale.' },
      { tokenId: 'tok002', summary: 'An envelope at the bar.' }
    ],
    financialTracker: { entries: [{ description: 'Banana', amount: '$2,505,000' }, { amount: '$40,000' }] }
  };
}

/** The map's sections as mapView lists them: each slot with the label the page heads it with. */
const MAP_SECTIONS = [
  { slot: 'lede', label: 'Lede' },
  { slot: 'theStory', label: 'The Story' },
  { slot: 'followTheMoney', label: 'Follow the Money' }
];

describe('4.14d: unsavedInputLine, the one rule for a stop\'s unsaved input', () => {
  describe('the desk (article): an open editor holds Approve, Send back and the JSON editor\'s Save & Approve', () => {
    it('holds nothing while no editor is open', () => {
      expect(unsavedInputLine('article', { editor: null, bundle: deskBundle() })).toBeNull();
    });

    it('names a block\'s open editor by its block and its section, and says to save or cancel it first', () => {
      expect(unsavedInputLine('article', { editor: { type: 'block', sectionIdx: 1, blockIdx: 0 }, bundle: deskBundle() }))
        .toBe('Before you approve or send back, save or cancel your edit to the paragraph in "The Story".');
    });

    it.each([
      ['a card in a section', { type: 'block', sectionIdx: 1, blockIdx: 1 }, 'the evidence card in "The Story"'],
      ['a photo in a section', { type: 'block', sectionIdx: 1, blockIdx: 2 }, 'the photo in "The Story"'],
      ['a block in a section with no heading, named as the desk\'s move control names it', { type: 'block', sectionIdx: 2, blockIdx: 0 }, 'the quote in "closing"'],
      ['a section\'s heading', { type: 'heading', sectionIdx: 1 }, 'the heading of "The Story"'],
      ['the headline', { type: 'headline' }, 'the headline'],
      ['a sidebar card with a headline', { type: 'sidebar', category: 'evidenceCards', idx: 0 }, 'the Evidence Cards entry "The brag"'],
      ['a sidebar card without one', { type: 'sidebar', category: 'evidenceCards', idx: 1 }, 'Evidence Cards entry 2'],
      ['a tracker row with a description', { type: 'sidebar', category: 'financialEntry', idx: 0 }, 'the financial tracker row "Banana"'],
      ['a tracker row without one', { type: 'sidebar', category: 'financialEntry', idx: 1 }, 'row 2 of the financial tracker'],
      ['the hero\'s caption', { type: 'sidebar', category: 'heroImage', idx: 0 }, 'the hero image caption'],
      ['the byline', { type: 'sidebar', category: 'byline', idx: 0 }, 'the byline']
    ])('names %s', (_case, editor, name) => {
      expect(unsavedInputLine('article', { editor, bundle: deskBundle() }))
        .toBe(`Before you approve or send back, save or cancel your edit to ${name}.`);
    });

    it('holds the actions for an editor it cannot name, so no editor\'s text is ever dropped', () => {
      expect(unsavedInputLine('article', { editor: { type: 'something-new' }, bundle: deskBundle() }))
        .toBe('Before you approve or send back, save or cancel the edit you have open.');
    });
  });

  describe('the map (outline): an open editor or an add line holding text holds Approve and Send back', () => {
    it('holds nothing while no editor is open and no add line holds text', () => {
      expect(unsavedInputLine('outline', { editor: null, adding: null, sections: MAP_SECTIONS })).toBeNull();
      expect(unsavedInputLine('outline', { editor: null, adding: { slot: 'theStory', material: '  ', players: '' }, sections: MAP_SECTIONS })).toBeNull();
    });

    it('names an open editor, and says to save or cancel it first', () => {
      expect(unsavedInputLine('outline', { editor: { line: 'head', key: 'head' }, adding: null, sections: MAP_SECTIONS }))
        .toBe('Before you approve or send back, save or cancel your edit to the headline and deck.');
    });

    it.each([
      ['a beat by its id', { line: 'beat', key: 'b4' }, 'beat b4'],
      ['a section by the label the page heads it with', { line: 'section', key: 'followTheMoney' }, 'the heading and job of "Follow the Money"'],
      ['the gap note', { line: 'gapNote', key: 'gap' }, 'the gap note'],
      ['the expected length', { line: 'length', key: 'length' }, 'the expected length']
    ])('names %s', (_case, editor, name) => {
      expect(unsavedInputLine('outline', { editor, adding: null, sections: MAP_SECTIONS }))
        .toBe(`Before you approve or send back, save or cancel your edit to ${name}.`);
    });

    it('names an add line that holds a beat or only its players, by its section, and says to add or cancel it first', () => {
      const line = 'Before you approve or send back, add or cancel the new beat in "The Story".';
      expect(unsavedInputLine('outline', { editor: null, adding: { slot: 'theStory', material: 'Morgan pays Riley at the bar', players: '' }, sections: MAP_SECTIONS })).toBe(line);
      expect(unsavedInputLine('outline', { editor: null, adding: { slot: 'theStory', material: '', players: 'Morgan, Riley' }, sections: MAP_SECTIONS })).toBe(line);
    });

    it('names both when an editor and an add line are open', () => {
      expect(unsavedInputLine('outline', {
        editor: { line: 'beat', key: 'b4' },
        adding: { slot: 'followTheMoney', material: 'The ledger at 9:40', players: '' },
        sections: MAP_SECTIONS
      })).toBe('Before you approve or send back: save or cancel your edit to beat b4; add or cancel the new beat in "Follow the Money".');
    });
  });

  describe('the story meeting (arc-selection): a thread typed in the add line holds Approve, Reweave and Send back', () => {
    it('holds nothing while the add line is empty or blank', () => {
      expect(unsavedInputLine('arc-selection', { addLine: '' })).toBeNull();
      expect(unsavedInputLine('arc-selection', { addLine: '   ' })).toBeNull();
    });

    it('names the thread typed in the add line, and says to add or clear it first', () => {
      expect(unsavedInputLine('arc-selection', { addLine: 'Riley kept a second ledger.' }))
        .toBe('Before you approve, reweave or send back, add or clear the new thread you typed.');
    });
  });

  it('refuses a stop it has no rule for, and a call with no description of what is open', () => {
    expect(() => unsavedInputLine('photos', {})).toThrow(/photos/);
    expect(() => unsavedInputLine('article')).toThrow(/article/);
  });

  describe('the actions the line says wait are the ones the stop\'s payload builder takes', () => {
    // MEETING_ACTIONS and MAP_ACTIONS (console/checkpoint-view-logic.js, held equal to lib/meeting.js
    // and lib/map.js) are the one list of each stop's actions; the line reads them rather than a copy.
    const View = require('../checkpoint-view-logic');
    const OPEN_HEAD = { editor: { line: 'head', key: 'head' }, adding: null, sections: MAP_SECTIONS };

    /** Runs `fn` with the map taking `actions`, then gives the map its own list back. */
    function withMapActions(actions, fn) {
      const own = View.MAP_ACTIONS.slice();
      View.MAP_ACTIONS.splice(0, View.MAP_ACTIONS.length, ...actions);
      try {
        return fn();
      } finally {
        View.MAP_ACTIONS.splice(0, View.MAP_ACTIONS.length, ...own);
      }
    }

    it('names a map that took a reweave as waiting for it too', () => {
      withMapActions(['approve', 'reweave', 'send-back'], () => {
        expect(unsavedInputLine('outline', OPEN_HEAD))
          .toBe('Before you approve, reweave or send back, save or cancel your edit to the headline and deck.');
      });
    });

    it('refuses an action it has no words for, naming it', () => {
      withMapActions(['approve', 'publish', 'send-back'], () => {
        expect(() => unsavedInputLine('outline', OPEN_HEAD)).toThrow(/publish/);
      });
    });
  });
});

describe('4.14d fix round 1, finding 2: JSON typed in the desk\'s JSON editor holds Approve and Send back', () => {
  // The desk sends two things. Approve and Send back ('article') send the bundle on the desk; the JSON
  // editor's Save & Approve ('article-json') sends the JSON typed there. The review saw Approve, with
  // the JSON editor open and holding a rewritten closing, publish the writer's closing without a word.
  const SEED = JSON.stringify(deskBundle(), null, 2);
  const TYPED = SEED.replace('We only kept the books.', 'We kept two sets of books.');
  const OPEN_BLOCK = { type: 'block', sectionIdx: 1, blockIdx: 0 };
  /** The desk with its JSON editor open on SEED and holding `text`, the desk unchanged since, and `editor` open or not. */
  const withJson = (text, editor = null) => ({ editor, bundle: deskBundle(), json: { text, seed: SEED, seededAt: 0 }, deskVersion: 0 });

  it('holds nothing while the JSON editor holds the text it opened with', () => {
    expect(unsavedInputLine('article', withJson(SEED))).toBeNull();
    expect(unsavedInputLine('article-json', withJson(SEED))).toBeNull();
  });

  it('holds Approve and Send back while it holds JSON the director typed, and says to close it or send the JSON with Save & Approve', () => {
    expect(unsavedInputLine('article', withJson(TYPED)))
      .toBe('Before you approve or send back, close the JSON editor to discard what you typed in it, or send what you typed with Save & Approve.');
  });

  it('leaves the JSON editor\'s Save & Approve free, since it sends what was typed', () => {
    expect(unsavedInputLine('article-json', withJson(TYPED))).toBeNull();
  });

  it('holds nothing once the text is back to what the editor opened with, or once the editor is closed, since it opens on the desk again', () => {
    expect(unsavedInputLine('article', withJson(TYPED.replace('We kept two sets of books.', 'We only kept the books.')))).toBeNull();
    expect(unsavedInputLine('article', { editor: null, bundle: deskBundle(), json: null })).toBeNull();
  });

  it('with an editor open too, names the editor and then the typed JSON; Save & Approve waits for the editor alone', () => {
    expect(unsavedInputLine('article', withJson(TYPED, OPEN_BLOCK)))
      .toBe('Before you approve or send back: save or cancel your edit to the paragraph in "The Story"; close the JSON editor to discard what you typed in it, or send what you typed with Save & Approve.');
    expect(unsavedInputLine('article-json', withJson(TYPED, OPEN_BLOCK)))
      .toBe('Before you approve, save or cancel your edit to the paragraph in "The Story".');
  });

  it('refuses an open JSON editor that does not say what it holds and the text it opened with', () => {
    expect(() => unsavedInputLine('article', { editor: null, bundle: deskBundle(), json: { text: TYPED } })).toThrow(/JSON editor/);
    expect(() => unsavedInputLine('article-json', { editor: null, bundle: deskBundle(), json: {} })).toThrow(/JSON editor/);
  });
});

describe('4.14d fix round 1, finding 1: the JSON editor\'s Save & Approve waits for changes made on the desk after it opened', () => {
  // The JSON editor takes its text from the desk when it opens, and Save & Approve sends that text. The
  // review followed the held line (save the open block editor) and pressed Save & Approve: it sent the
  // JSON from before the save, the writer's closing over the director's. `deskVersion` counts the
  // changes on the desk, and `seededAt` is its count when the JSON editor opened.
  const SEED = JSON.stringify(deskBundle(), null, 2);
  const TYPED = SEED.replace('We only kept the books.', 'We kept two sets of books.');
  const OPEN_BLOCK = { type: 'block', sectionIdx: 1, blockIdx: 0 };
  /** The desk at `deskVersion`, its JSON editor holding `text`, opened on SEED at `seededAt`. */
  const withJson = (text, { seededAt = 2, deskVersion = 2, editor = null } = {}) =>
    ({ editor, bundle: deskBundle(), json: { text, seed: SEED, seededAt }, deskVersion });

  it('holds nothing while the desk has not changed since the JSON editor opened', () => {
    expect(unsavedInputLine('article-json', withJson(SEED))).toBeNull();
  });

  it('holds Save & Approve once the desk has changed since, and says to close the JSON editor and open it again', () => {
    expect(unsavedInputLine('article-json', withJson(SEED, { deskVersion: 3 })))
      .toBe('Before you approve, close the JSON editor and open it again so it holds your latest changes on the desk.');
  });

  it('leaves Approve and Send back free, since they send the desk with its changes', () => {
    expect(unsavedInputLine('article', withJson(SEED, { deskVersion: 3 }))).toBeNull();
  });

  it('with JSON typed too, holds all three, since no button sends both, and says closing the JSON editor discards what was typed', () => {
    expect(unsavedInputLine('article-json', withJson(TYPED, { deskVersion: 3 })))
      .toBe('Before you approve, close the JSON editor, which discards what you typed in it, and open it again so it holds your latest changes on the desk.');
    expect(unsavedInputLine('article', withJson(TYPED, { deskVersion: 3 })))
      .toBe('Before you approve or send back, close the JSON editor to discard what you typed in it.');
  });

  it('with an editor open too, names the editor first', () => {
    expect(unsavedInputLine('article-json', withJson(SEED, { deskVersion: 3, editor: OPEN_BLOCK })))
      .toBe('Before you approve: save or cancel your edit to the paragraph in "The Story"; close the JSON editor and open it again so it holds your latest changes on the desk.');
  });

  it('refuses an open JSON editor that does not say the desk\'s count when it opened, or a desk that does not say its count now', () => {
    expect(() => unsavedInputLine('article-json', { editor: null, bundle: deskBundle(), json: { text: SEED, seed: SEED }, deskVersion: 2 })).toThrow(/seededAt/);
    expect(() => unsavedInputLine('article', { editor: null, bundle: deskBundle(), json: { text: SEED, seed: SEED, seededAt: 2 } })).toThrow(/deskVersion/);
  });
});

describe('4.14g: the desk\'s actions are one list, checkpoint-view-logic.js DESK_ACTIONS, which its three readers read', () => {
  // The review of 4.14d (finding 3): the desk's ['approve', 'send-back'] was stated three times, in this
  // module's line, in reviewPayload's guard and in the harness's STOP_ACTIONS, where the meeting's and
  // the map's actions are each one exported list.
  const View = require('../checkpoint-view-logic');
  const { STOP_ACTIONS } = require('../../scripts/lib/stop-payloads');
  const OPEN_BLOCK = { type: 'block', sectionIdx: 1, blockIdx: 0 };

  /** Runs `fn` with the desk taking `actions`, then gives the desk its own list back. */
  function withDeskActions(actions, fn) {
    const own = View.DESK_ACTIONS.slice();
    View.DESK_ACTIONS.splice(0, View.DESK_ACTIONS.length, ...actions);
    try {
      return fn();
    } finally {
      View.DESK_ACTIONS.splice(0, View.DESK_ACTIONS.length, ...own);
    }
  }

  it('the console exports the desk\'s two actions, which articleReviewPayload builds', () => {
    expect(View.DESK_ACTIONS).toEqual(['approve', 'send-back']);
    expect(View.articleReviewPayload(null, 'Keep the vote.', 'approve')).toEqual({ article: true, articleNote: 'Keep the vote.' });
    expect(View.articleReviewPayload(null, 'Cut the lede.', 'send-back')).toEqual({ article: false, articleFeedback: 'Cut the lede.' });
  });

  it('the harness reads the list itself', () => {
    expect(STOP_ACTIONS.article).toBe(View.DESK_ACTIONS);
  });

  it('the held line names the actions the list holds', () => {
    withDeskActions(['approve', 'reweave', 'send-back'], () => {
      expect(unsavedInputLine('article', { editor: OPEN_BLOCK, bundle: deskBundle() }))
        .toBe('Before you approve, reweave or send back, save or cancel your edit to the paragraph in "The Story".');
    });
  });

  it('reviewPayload\'s guard takes the actions the list holds, and refuses the rest, naming the list', () => {
    withDeskActions(['approve'], () => {
      expect(() => View.articleReviewPayload(null, 'Cut the lede.', 'send-back')).toThrow("reviewPayload: action must be 'approve', got send-back");
      expect(View.articleReviewPayload(null, 'Keep the vote.', 'approve')).toEqual({ article: true, articleNote: 'Keep the vote.' });
    });
  });
});
