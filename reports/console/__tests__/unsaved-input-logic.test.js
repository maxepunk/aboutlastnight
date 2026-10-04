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
