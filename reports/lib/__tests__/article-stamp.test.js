/**
 * Brief 4.7b, the stamp (R7): code stamps the map's headline, deck and top photo into the
 * article writer's first draft. Where the director wrote or chose one of them on the map,
 * the stamp records it as the director's line at the article stop (`_articleHandEdits`),
 * so the fixes' machinery treats it as the director's: an automatic pass that changes it
 * gets it put back, and a judge's finding located in it is a concern, never a must-fix.
 *
 * The real nodes run on the rework fixture with a recording stand-in for the model.
 */

const { reworkFixtureState, MAP } = require('./fixtures/rework-state');
const { generateContentBundle, reviseContentBundle } = require('../workflow/nodes/ai-nodes');
const { standingOnMap, carriedEdits, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
const { _testing: judges } = require('../workflow/nodes/evaluator-nodes');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });
const recordingSdk = (value) => jest.fn(async () => clone(value));

const DIRECTORS_HEADLINE = 'Six Votes Said Overdose. The Ledger Said Sale.';

/** The writer's first draft: its own headline, deck and hero, before the stamp. */
const WRITERS_DRAFT = {
  headline: { main: "The Writer's Own Headline", kicker: 'NovaNews', deck: "The writer's own deck." },
  heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
  sections: [{ id: 'lede', type: 'narrative', content: [{ type: 'paragraph', text: 'Six votes named an overdose.' }] }],
  metadata: { sessionId: '010126', theme: 'journalist' }
};

/** The fixture past the map's approve: the writer's map as the director left it. */
function atArticle(overrides = {}) {
  return { ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null, ...overrides };
}

/** The map as the director left it with `change` applied, and the edits the map's approve records. */
function directorsMap(change) {
  const baseline = clone(MAP);
  const left = clone(MAP);
  change(left);
  return { outline: left, _mapBaseline: baseline, _outlineHandEdits: standingOnMap(null, baseline, left), heroImage: left.topPhoto || null };
}

async function firstDraft(state, draft = WRITERS_DRAFT) {
  const update = await generateContentBundle(state, cfg(recordingSdk(draft)));
  return update;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("4.7b: the stamp puts the map's headline, deck and top photo into the first draft (R7)", () => {
  it("stamps the map's headline, deck and top photo over the writer's, and keeps the writer's kicker and caption", async () => {
    const { contentBundle, _articleHandEdits } = await firstDraft(atArticle());
    expect(contentBundle.headline).toEqual({ main: MAP.headline, kicker: 'NovaNews', deck: MAP.deck });
    expect(contentBundle.heroImage).toEqual({ filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' });
    // The writer's map, untouched by the director: nothing at the article stop is theirs.
    expect(_articleHandEdits).toBeNull();
  });

  it("a caption the writer gave another photo goes with that photo: the map's top photo prints with none", async () => {
    const draft = { ...clone(WRITERS_DRAFT), heroImage: { filename: 'p2.jpg', caption: 'Alex leans over the ledger.' } };
    const { contentBundle } = await firstDraft(atArticle(), draft);
    expect(contentBundle.heroImage).toEqual({ filename: 'hero.jpg' });
  });

  it('with no top photo on the map, the first draft prints no hero', async () => {
    const { contentBundle } = await firstDraft(atArticle(directorsMap((map) => { delete map.topPhoto; })));
    expect(contentBundle).not.toHaveProperty('heroImage');
  });

  it('a top photo the director has left out since the map is no hero', async () => {
    const { contentBundle } = await firstDraft(atArticle({ characterIdMappings: { 'hero.jpg': { exclude: true } } }));
    expect(contentBundle).not.toHaveProperty('heroImage');
  });

  describe('a headline the director wrote on the map is theirs at the article stop', () => {
    const state = () => atArticle(directorsMap((map) => { map.headline = DIRECTORS_HEADLINE; }));

    it('is stamped, and recorded as the director\'s line: one edit, at headline.main, the deck still the writer\'s', async () => {
      const { contentBundle, _articleHandEdits } = await firstDraft(state());
      expect(contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(contentBundle.headline.deck).toBe(MAP.deck);
      expect(_articleHandEdits.edits).toEqual([
        expect.objectContaining({ id: 'E1', path: 'headline.main', before: null, after: DIRECTORS_HEADLINE })
      ]);
      expect(carriedEdits(_articleHandEdits, contentBundle).map((edit) => edit.id)).toEqual(['E1']);
    });

    it('an automatic pass that rewrites it gets it put back, and the report says so', async () => {
      const { contentBundle, _articleHandEdits } = await firstDraft(state());
      const rewritten = { ...clone(contentBundle), headline: { ...contentBundle.headline, main: 'A Headline the Rework Wrote' } };
      const update = await reviseContentBundle({
        ...state(), _articleHandEdits, _previousContentBundle: clone(contentBundle), articleRevisionCount: 1
      }, cfg(recordingSdk(rewritten)));
      expect(update.contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(update._articleHandEditReport.changed).toEqual([
        expect.objectContaining({ id: 'E1', automatic: true, restored: true, director: DIRECTORS_HEADLINE })
      ]);
    });

    it("the judge's guard reads a finding located in it as a concern, never a must-fix", async () => {
      const { contentBundle, _articleHandEdits } = await firstDraft(state());
      const judged = { ...state(), contentBundle, _articleHandEdits };
      const finding = `T1: "${DIRECTORS_HEADLINE}" states the sale as fact; the record holds only the brag.`;
      const guard = judges.guardDirectorEdits({
        evaluation: { ready: false, structuralPassed: false, structuralIssues: [finding], advisoryWarnings: [], criteriaScores: {} },
        criteria: {},
        edits: judges.judgedEdits('article', judged),
        output: contentBundle
      });
      expect(guard.kept).toEqual([]);
      expect(guard.moved).toEqual([`${DIRECTOR_EDIT_PREFIX}E1: ${finding}`]);
      expect(guard.ready).toBe(true);
    });
  });

  it('a deck the director wrote and a top photo the director chose are theirs too; the caption stays the writer\'s', async () => {
    const { contentBundle, _articleHandEdits } = await firstDraft(atArticle(directorsMap((map) => {
      map.deck = 'The director wrote this deck.';
      map.topPhoto = 'p2.jpg';
      map.sections[1].photos = [{ filename: 'hero.jpg', beat: 'b2' }];
    })), { ...clone(WRITERS_DRAFT), heroImage: { filename: 'p2.jpg', caption: 'Alex leans over the ledger.' } });

    expect(contentBundle.headline.deck).toBe('The director wrote this deck.');
    expect(contentBundle.heroImage).toEqual({ filename: 'p2.jpg', caption: 'Alex leans over the ledger.' });
    expect(_articleHandEdits.edits.map(({ path, after }) => [path, after])).toEqual([
      ['headline.deck', 'The director wrote this deck.'],
      ['heroImage.filename', 'p2.jpg']
    ]);
  });
});

// Brief 4.7d (ruling 1 on the follow-ups' findings): the stamp records no cut of the map's top
// photo. A cut is carried by its text wherever the page prints it (lib/hand-edit-diff.js), and
// T13 prints the photo in a section, so a cut of heroImage misfired. The console never cuts the
// top photo: movePhoto moves it into a section, which leaves the map with no top photo, so the
// writer is told to print no hero and the stamp prints none. Only a hand-built payload makes a
// cut, and the stamp records nothing for it.
describe("4.7d: the stamp records no cut of the map's top photo", () => {
  const EditLogic = require('../../console/outline-edit-logic');
  /** A photo named the way the director names a session's photos. */
  const CUT = 'aln010126 (1 of 3).jpg';

  /** The map as the director left it, `left`, from the writer's `baseline`, at the article stop. */
  const leftOnMap = (baseline, left) => atArticle({
    outline: left, _mapBaseline: baseline, _outlineHandEdits: standingOnMap(null, baseline, left), heroImage: left.topPhoto || null
  });

  /** The map with its top photo, CUT, taken off by a hand-built payload, and `change` applied. */
  const cutMap = (change = () => {}) => {
    const baseline = clone(MAP);
    baseline.topPhoto = CUT;
    const left = clone(baseline);
    delete left.topPhoto;
    change(left);
    return leftOnMap(baseline, left);
  };

  it('a top photo the director moved into a section: no hero is stamped, and no cut is recorded', async () => {
    const left = EditLogic.movePhoto(clone(MAP), EditLogic.MAP_TOP_PHOTO, 0, 'closing');
    const state = leftOnMap(clone(MAP), left);
    // The map records the move, from the top into the closing section.
    expect(carriedEdits(state._outlineHandEdits, state.outline).map(({ path, from }) => [path, from]))
      .toEqual([['sections[#closing].photos[#hero.jpg]', EditLogic.MAP_TOP_PHOTO]]);

    // The writer's draft carries a hero of its own: the map's, before the move.
    const sdk = recordingSdk(WRITERS_DRAFT);
    const { contentBundle, _articleHandEdits } = await generateContentBundle(state, cfg(sdk));
    expect(sdk.mock.calls[0][0].prompt).toContain('3. The map has no top photo, so the bundle has no "heroImage".');
    expect(contentBundle).not.toHaveProperty('heroImage');
    expect(_articleHandEdits).toBeNull();
  });

  it('a cut of the top photo, which only a hand-built payload makes, is no edit at the article stop', async () => {
    const state = cutMap();
    expect(carriedEdits(state._outlineHandEdits, state.outline)).toEqual([
      expect.objectContaining({ path: 'topPhoto', before: { filename: CUT }, after: null })
    ]);
    const { contentBundle, _articleHandEdits } = await firstDraft(state);
    expect(contentBundle).not.toHaveProperty('heroImage');
    expect(_articleHandEdits).toBeNull();
  });

  it('beside a top photo the director chose in its place, the stamp records the choice alone', async () => {
    const { contentBundle, _articleHandEdits } = await firstDraft(cutMap((left) => {
      left.topPhoto = 'p2.jpg';
      left.sections[1].photos = [];
    }), { ...clone(WRITERS_DRAFT), heroImage: { filename: 'p2.jpg', caption: 'Alex leans over the ledger.' } });
    expect(contentBundle.heroImage).toEqual({ filename: 'p2.jpg', caption: 'Alex leans over the ledger.' });
    expect(_articleHandEdits.edits.map(({ id, path, before, after }) => [id, path, before, after])).toEqual([
      ['E1', 'heroImage.filename', null, 'p2.jpg']
    ]);
    expect(carriedEdits(_articleHandEdits, contentBundle).map((edit) => edit.id)).toEqual(['E1']);
  });
});
