/**
 * Brief 4.7b, the stamp (R7): code stamps the map's headline, deck and top photo into the
 * article writer's first draft.
 *
 * Phase 18, run 2f (R40): once the director approves the map, its headline, the line under it
 * and each section's heading are the director's lines at the article, whoever wrote them. The
 * stamp puts each section's heading on the first draft by the section's slot, and records the
 * three kinds of line as the director's at the article stop (`_articleHandEdits`), so the fixes'
 * machinery treats them as the director's: an automatic pass that changes one gets it put back,
 * and a judge's finding located in one is a concern, never a must-fix. The top photo is the
 * director's line only where the director chose it on the map, as before.
 *
 * The real nodes run on the rework fixture with a recording stand-in for the model.
 */

const { reworkFixtureState, MAP } = require('./fixtures/rework-state');
const { generateContentBundle, reviseContentBundle } = require('../workflow/nodes/ai-nodes');
const { standingOnMap, standingAfterSendBack, carriedEdits, formatEditLines, DIRECTOR_EDIT_PREFIX, CHANGED_EDITS_KEY } = require('../hand-edit-diff');
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
  it("stamps the map's headline, deck and top photo over the writer's, the theme's line above the headline, and keeps the writer's caption", async () => {
    const { contentBundle, _articleHandEdits } = await firstDraft(atArticle());
    expect(contentBundle.headline).toEqual({ main: MAP.headline, kicker: 'NovaNews Investigates', deck: MAP.deck });
    expect(contentBundle.heroImage).toEqual({ filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' });
    // R40: the map the director approved gives the headline and the line under it, so both are the
    // director's lines. The top photo, which the director did not choose, and the theme's line are not.
    expect(_articleHandEdits.edits.map(({ id, path, before, after }) => [id, path, before, after])).toEqual([
      ['E1', 'headline.main', null, MAP.headline],
      ['E2', 'headline.deck', null, MAP.deck]
    ]);
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

    it('is stamped, and recorded as the director\'s line at headline.main, as before; since R40 the deck they approved is theirs too', async () => {
      const { contentBundle, _articleHandEdits } = await firstDraft(state());
      expect(contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(contentBundle.headline.deck).toBe(MAP.deck);
      expect(_articleHandEdits.edits).toEqual([
        expect.objectContaining({ id: 'E1', path: 'headline.main', before: null, after: DIRECTORS_HEADLINE }),
        expect.objectContaining({ id: 'E2', path: 'headline.deck', before: null, after: MAP.deck })
      ]);
      expect(carriedEdits(_articleHandEdits, contentBundle).map((edit) => edit.id)).toEqual(['E1', 'E2']);
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
      ['headline.main', MAP.headline],
      ['headline.deck', 'The director wrote this deck.'],
      ['heroImage.filename', 'p2.jpg']
    ]);
  });
});

// Phase 18, run 2f (R40): the director's decision of 2026-11-24, "lock them once I approve the
// map". The headline, the line under it and each section's heading on the approved map are the
// director's lines at the article, whoever wrote them: the stamp puts the headings on the first
// draft by each section's slot, as it puts the other two, and records all three kinds where the
// director's lines are already recorded. Everything after that is what a director's line already
// gets, with no new rule.
describe('R40: the lines on the approved map are locked at the article', () => {
  const { bundleAsShown } = require('../prompt-builder');
  const { _testing: nodes } = require('../workflow/nodes/ai-nodes');
  const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
  const paragraph = (text) => ({ type: 'paragraph', text });

  /**
   * A first draft with a section for each of the map's four, each heading as a writer might get it
   * wrong: one added where the map prints none, one reworded, one missing, and a section the map
   * does not hold.
   */
  const DRAFT = {
    headline: { main: "The Writer's Own Headline", deck: "The writer's own deck." },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', heading: 'A Heading the Writer Added', content: [paragraph('Six votes named an overdose after Alex and Morgan deadlocked.')] },
      { id: 'theStory', type: 'narrative', heading: "The Writer's Own Heading", content: [paragraph('Marcus bragged about the sale the night he died.')] },
      { id: 'followTheMoney', type: 'evidence-highlight', content: [paragraph('The sale paid into the Melanie account.')] },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] },
      { id: 'afterword', type: 'investigation-notes', heading: 'A Section the Map Does Not Hold', content: [paragraph('Sarah has not said what she will do.')] }
    ],
    metadata: { sessionId: '010126', theme: 'journalist' }
  };
  /** The stamp's four records on DRAFT, on the map as the writer wrote it and the director approved it. */
  const LOCKED = [
    ['E1', 'headline', 'headline.main', MAP.headline],
    ['E2', 'headline', 'headline.deck', MAP.deck],
    ['E3', 'section:theStory', 'sections[#theStory].heading', 'The Story'],
    ['E4', 'section:followTheMoney', 'sections[#followTheMoney].heading', 'Follow the Money']
  ];
  const lines = (standing) => standing.edits.map(({ id, scope, path, after }) => [id, scope, path, after]);
  const headingOf = (bundle, id) => bundle.sections.find((section) => section.id === id).heading;

  /** The first draft, stamped, with the standing edits the stamp recorded, as the thread stores them. */
  async function stamped(state = atArticle(), draft = DRAFT) {
    const { contentBundle, _articleHandEdits } = await firstDraft(state, draft);
    return { state: { ...state, contentBundle, _articleHandEdits }, contentBundle, _articleHandEdits };
  }

  /** The article as the rework can return it: the writer's shape, with `change` applied. */
  const reworked = (bundle, change) => {
    const out = bundleAsShown(bundle);
    change(out);
    return out;
  };

  /** An automatic pass over the stamped draft whose rework returns `returned`. */
  const automaticPass = (state, contentBundle, returned) => reviseContentBundle({
    ...state, _previousContentBundle: clone(contentBundle), articleRevisionCount: 1
  }, cfg(recordingSdk(returned)));

  describe('the first draft', () => {
    it("carries the map's heading over each section, by the section's slot, whatever the writer returned", async () => {
      const { contentBundle } = await stamped();
      expect(headingOf(contentBundle, 'theStory')).toBe('The Story');
      expect(headingOf(contentBundle, 'followTheMoney')).toBe('Follow the Money');
    });

    it('prints no heading where the map gives none: a heading the writer added over the opening goes', async () => {
      const { contentBundle } = await stamped();
      expect(contentBundle.sections.find((section) => section.id === 'lede')).not.toHaveProperty('heading');
      expect(contentBundle.sections.find((section) => section.id === 'closing')).not.toHaveProperty('heading');
    });

    it('leaves a section the map does not hold as the writer wrote it', async () => {
      const { contentBundle } = await stamped();
      expect(contentBundle.sections.find((section) => section.id === 'afterword')).toEqual(DRAFT.sections[4]);
    });

    it('changes nothing else of a section: its id, its type and its blocks are the writer\'s', async () => {
      const { contentBundle } = await stamped();
      expect(contentBundle.sections.map(({ heading: _heading, ...rest }) => rest))
        .toEqual(DRAFT.sections.map(({ heading: _heading, ...rest }) => rest));
    });
  });

  describe("the article stop's standing edits", () => {
    it('hold the headline, the line under it and each heading that is not empty, each with no writer\'s text before it', async () => {
      const { contentBundle, _articleHandEdits } = await stamped();
      expect(lines(_articleHandEdits)).toEqual(LOCKED);
      expect(_articleHandEdits.edits.map((edit) => edit.before)).toEqual([null, null, null, null]);
      expect(_articleHandEdits).toMatchObject({ kind: 'bundle', issued: 4 });
      expect(carriedEdits(_articleHandEdits, contentBundle).map((edit) => edit.id)).toEqual(['E1', 'E2', 'E3', 'E4']);
    });

    it('hold nothing for the opening and the closing, which print no heading, for a section the map does not hold, for the theme\'s line or for a top photo the director did not choose', async () => {
      const { _articleHandEdits } = await stamped();
      const paths = _articleHandEdits.edits.map((edit) => edit.path);
      ['sections[#lede].heading', 'sections[#closing].heading', 'sections[#afterword].heading', 'headline.kicker', 'heroImage.filename', 'heroImage']
        .forEach((path) => expect(paths).not.toContain(path));
    });

    it('a heading the stamp records is the kind of edit a heading the director types at the desk is: the same place, found the same way', async () => {
      const { contentBundle, _articleHandEdits } = await stamped();
      const stamps = _articleHandEdits.edits.find((edit) => edit.path === 'sections[#theStory].heading');
      // The director retypes that heading at the desk and sends the article back.
      const desk = clone(contentBundle);
      desk.sections.find((section) => section.id === 'theStory').heading = 'What the Bar Saw';
      const after = standingAfterSendBack(_articleHandEdits, contentBundle, desk, 'bundle');
      const typed = after.edits.find((edit) => edit.path === 'sections[#theStory].heading');
      expect({ scope: typed.scope, path: typed.path, at: typed.at }).toEqual({ scope: stamps.scope, path: stamps.path, at: stamps.at });
      expect([typed.id, typed.before, typed.after]).toEqual(['E5', 'The Story', 'What the Bar Saw']);
      // The director's own heading takes the stamped one's place; the other three lines stand.
      expect(after.edits.map((edit) => edit.id)).toEqual(['E1', 'E2', 'E4', 'E5']);
    });

    // Run 2i (R58): the judge lists them apart from the director's edits, as lines the director
    // approved on the map; a rework is listed them among the director's edits, as before.
    it('are listed to a rework among the director\'s edits, and to the judge as lines approved on the map, each by its id, its place and its text', async () => {
      const { state, contentBundle, _articleHandEdits } = await stamped();
      const LISTED = [
        `E1 (headline, main): "${MAP.headline}"`,
        `E2 (headline, deck): "${MAP.deck}"`,
        'E3 (section "theStory", heading): "The Story"',
        'E4 (section "followTheMoney", heading): "Follow the Money"'
      ].join('\n');
      expect(formatEditLines(carriedEdits(_articleHandEdits, contentBundle), contentBundle)).toBe(LISTED);
      const { contextSection } = buildRevisionContext({
        phase: 'article', revisionCount: 1, previousOutput: contentBundle, handEdits: _articleHandEdits,
        validationResults: { phase: 'article', passed: false, structuralIssues: ['T12: "Marcus bragged about the sale" quotes no document.'] }
      });
      expect(contextSection).toContain(`\n\n${LISTED}\n</HAND_EDITS>`);
      const judge = judges.buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: judges.judgedEdits('article', state) });
      expect(judge).toContain(`THE LINES THE DIRECTOR APPROVED ON THE MAP (final as approved):\n`);
      expect(judge).not.toContain("THE DIRECTOR'S EDITS (");
      expect(judge).toContain(`\n\n${LISTED}\n\nTHE FACT CHECK ON THIS BUNDLE`);
    });
  });

  describe('an automatic pass', () => {
    it('that rewrites the headline, the line under it and a heading has each put back, and the report says so', async () => {
      const { state, contentBundle } = await stamped();
      const update = await automaticPass(state, contentBundle, reworked(contentBundle, (out) => {
        out.headline.main = 'A Headline the Rework Wrote';
        out.headline.deck = 'A line under it that the rework wrote.';
        out.sections.find((section) => section.id === 'theStory').heading = 'A Heading the Rework Wrote';
        out.sections.find((section) => section.id === 'closing').content[0].text = 'Riley told the room they only kept the books.';
      }));
      expect(update.contentBundle.headline.main).toBe(MAP.headline);
      expect(update.contentBundle.headline.deck).toBe(MAP.deck);
      expect(headingOf(update.contentBundle, 'theStory')).toBe('The Story');
      // The pass's fix of the writer's text stays.
      expect(update.contentBundle.sections.find((section) => section.id === 'closing').content[0].text).toBe('Riley told the room they only kept the books.');
      expect(update._articleHandEditReport.checked).toEqual(['E1', 'E2', 'E3', 'E4']);
      expect(update._articleHandEditReport.changed).toEqual([
        expect.objectContaining({ id: 'E1', where: 'headline, main', automatic: true, restored: true, director: MAP.headline, became: 'A Headline the Rework Wrote' }),
        expect.objectContaining({ id: 'E2', where: 'headline, deck', automatic: true, restored: true, director: MAP.deck, became: 'A line under it that the rework wrote.' }),
        expect.objectContaining({ id: 'E3', where: 'section "theStory", heading', automatic: true, restored: true, director: 'The Story', became: 'A Heading the Rework Wrote' })
      ]);
    });

    it('that takes a heading off has it put back', async () => {
      const { state, contentBundle } = await stamped();
      const update = await automaticPass(state, contentBundle, reworked(contentBundle, (out) => {
        delete out.sections.find((section) => section.id === 'followTheMoney').heading;
      }));
      expect(headingOf(update.contentBundle, 'followTheMoney')).toBe('Follow the Money');
      expect(update._articleHandEditReport.changed).toEqual([
        expect.objectContaining({ id: 'E4', automatic: true, restored: true, director: 'Follow the Money', became: null })
      ]);
    });

    it('that keeps all of them leaves the report with nothing changed', async () => {
      const { state, contentBundle } = await stamped();
      const update = await automaticPass(state, contentBundle, reworked(contentBundle, (out) => {
        out.sections.find((section) => section.id === 'closing').content[0].text = 'Riley told the room they only kept the books.';
      }));
      expect(update._articleHandEditReport).toEqual({ checked: ['E1', 'E2', 'E3', 'E4'], changed: [] });
      expect(update).not.toHaveProperty('_articleHandEdits');
    });

    // The stamp records nothing where the map prints no heading, as it records no cut, so nothing
    // holds that place afterwards: a heading a later pass adds over the opening stays until the
    // director takes it off at the desk, where it prints as any heading does.
    it('that adds a heading where the map prints none is not undone: the stamp recorded nothing there', async () => {
      const { state, contentBundle } = await stamped();
      const update = await automaticPass(state, contentBundle, reworked(contentBundle, (out) => {
        out.sections.find((section) => section.id === 'lede').heading = 'A Heading the Rework Added';
      }));
      expect(headingOf(update.contentBundle, 'lede')).toBe('A Heading the Rework Added');
      expect(update._articleHandEditReport.changed).toEqual([]);
    });
  });

  describe("the judge's guard", () => {
    const verdictOf = (state, contentBundle, evaluation) => {
      const criteria = judges.getPhaseCriteria('article', 'journalist');
      return judges.truthOnlyVerdict(judges.guardDirectorEdits({
        evaluation: { ready: false, structuralPassed: false, structuralIssues: [], advisoryWarnings: [], ...evaluation },
        criteria, edits: judges.judgedEdits('article', state), output: contentBundle
      }), criteria);
    };

    it.each([
      ['the headline', 'E1', 'The Ledger Kept Talking'],
      ['the line under it', 'E2', 'the room settled on an accidental overdose']
    ])('a finding located in %s is a concern in the verdict and holds no rework', async (_line, id, quoted) => {
      const { state, contentBundle } = await stamped();
      const finding = `T1: "${quoted}" states as fact what the record does not hold.`;
      const verdict = verdictOf(state, contentBundle, {
        structuralIssues: [finding],
        criteriaScores: { evidenceTruth: { score: 0.3, notes: `"${quoted}" is stated as fact.`, fix: 'Say what the record holds.' } }
      });
      expect(verdict.kept).toEqual([]);
      expect(verdict.holding).toEqual([]);
      expect(verdict.ready).toBe(true);
      expect(verdict.moved).toEqual([`${DIRECTOR_EDIT_PREFIX}${id}: ${finding}`]);
      // The rework, were one sent for another finding, reads no notes or fix of it.
      expect(verdict.criteriaScores.evidenceTruth).toEqual({ score: 0.3, type: 'structural' });
    });

    it("a concern the judge writes with a heading's edit id is kept, and covers its criterion", async () => {
      const { state, contentBundle } = await stamped();
      const concern = `${DIRECTOR_EDIT_PREFIX}E4: T14: the heading is a phrase from running the game.`;
      const verdict = verdictOf(state, contentBundle, {
        advisoryWarnings: [concern],
        criteriaScores: { fictionTruth: { score: 0.4, notes: 'A heading uses a word from running the game.', fix: 'Use the story\'s own words.' } }
      });
      expect(verdict.advisories).toEqual([concern]);
      expect(verdict.kept).toEqual([]);
      expect(verdict.ready).toBe(true);
    });

    // lib/hand-edit-diff.js locateQuotedText, unchanged: a finding quotes a heading to say where
    // the problem is, so a quote of a whole heading locates nothing, and the writer's sentence it
    // points at is still the writer's must-fix, though the heading is now the director's line.
    it('a finding that quotes a heading to name its section is still read as naming the section', async () => {
      const { state, contentBundle } = await stamped();
      const finding = 'T5: in "Follow the Money", "The sale paid into the Melanie account" gives no amount. Give the amount the ledger gives.';
      const verdict = verdictOf(state, contentBundle, {
        structuralIssues: [finding],
        criteriaScores: { moneyTruth: { score: 0.4, notes: 'The sale is given no amount.', fix: 'Give the amount.' } }
      });
      expect(verdict.kept).toEqual([finding]);
      expect(verdict.moved).toEqual([]);
      expect(verdict.holding).toEqual(['moneyTruth']);
      expect(verdict.ready).toBe(false);
    });
  });

  describe("a send-back's rework", () => {
    const NEW_HEADLINE = 'Six Votes for an Overdose, and a Sale Nobody Counted';
    const sendBack = (state, contentBundle, note, returned) => {
      const sdk = recordingSdk(returned);
      return reviseContentBundle({
        ...state, _previousContentBundle: clone(contentBundle), _articleFeedback: note, articleRevisionCount: 0, humanArticleRevisionCount: 1
      }, cfg(sdk)).then((update) => ({ update, call: sdk.mock.calls[0][0] }));
    };

    it('whose note asks for a new headline may change it, and the report gives its reason', async () => {
      const { state, contentBundle } = await stamped();
      const { update, call } = await sendBack(state, contentBundle, 'Write a headline that names the sale.', {
        ...reworked(contentBundle, (out) => { out.headline.main = NEW_HEADLINE; }),
        [CHANGED_EDITS_KEY]: [{ id: 'E1', reason: "The director's note asks for a headline that names the sale." }]
      });
      // The rework is asked for each edit it changes, with why, since it carries the director's lines.
      expect(call.jsonSchema.properties).toHaveProperty(CHANGED_EDITS_KEY);
      expect(update.contentBundle.headline.main).toBe(NEW_HEADLINE);
      expect(update.contentBundle).not.toHaveProperty(CHANGED_EDITS_KEY);
      expect(update._articleHandEditReport.changed).toEqual([
        expect.objectContaining({
          id: 'E1', pass: 'send-back', automatic: false, restored: false, director: MAP.headline, became: NEW_HEADLINE,
          reason: "The director's note asks for a headline that names the sale."
        })
      ]);
      // The line under it and the headings stand.
      expect(update.contentBundle.headline.deck).toBe(MAP.deck);
      expect(headingOf(update.contentBundle, 'theStory')).toBe('The Story');
    });

    it('whose note leaves the headline alone leaves it as the map gives it', async () => {
      const { state, contentBundle } = await stamped();
      const { update } = await sendBack(state, contentBundle, 'Tighten the closing.', {
        ...reworked(contentBundle, (out) => { out.sections.find((section) => section.id === 'closing').content[0].text = 'Riley kept the books.'; }),
        [CHANGED_EDITS_KEY]: []
      });
      expect(update.contentBundle.headline.main).toBe(MAP.headline);
      expect(update.contentBundle.sections.find((section) => section.id === 'closing').content[0].text).toBe('Riley kept the books.');
      expect(update._articleHandEditReport).toEqual({ checked: ['E1', 'E2', 'E3', 'E4'], changed: [] });
    });
  });

  describe('on a map where the director edited the headline: as before', () => {
    const state = () => atArticle(directorsMap((map) => { map.headline = DIRECTORS_HEADLINE; }));

    it("the director's headline is stamped and recorded at the same place, under the same id", async () => {
      const { contentBundle, _articleHandEdits } = await stamped(state());
      expect(contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(lines(_articleHandEdits)).toEqual([['E1', 'headline', 'headline.main', DIRECTORS_HEADLINE], ...LOCKED.slice(1)]);
    });

    it('an automatic pass that rewrites it has it put back', async () => {
      const { state: stampedState, contentBundle } = await stamped(state());
      const update = await automaticPass(stampedState, contentBundle, reworked(contentBundle, (out) => { out.headline.main = 'A Headline the Rework Wrote'; }));
      expect(update.contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(update._articleHandEditReport.changed).toEqual([
        expect.objectContaining({ id: 'E1', automatic: true, restored: true, director: DIRECTORS_HEADLINE })
      ]);
    });
  });

  describe('a map with a blank line, and a thread with no map', () => {
    it('a blank deck and blank headings print as none and are recorded as none: a blank line is no line of the director\'s', () => {
      const bare = clone(MAP);
      bare.deck = '';
      bare.sections.forEach((section) => { section.heading = '   '; });
      const { contentBundle, edits } = nodes.stampFromMap(clone(DRAFT), atArticle({ outline: bare, _mapBaseline: clone(bare) }));
      expect(contentBundle.headline.deck).toBe('');
      expect(contentBundle.sections.filter((section) => section.id !== 'afterword').every((section) => !('heading' in section))).toBe(true);
      expect(edits.edits.map((edit) => edit.path)).toEqual(['headline.main']);
    });

    it('a thread with no map stamps the theme\'s line alone and records nothing', () => {
      const { contentBundle, edits } = nodes.stampFromMap(clone(DRAFT), atArticle({ outline: null }));
      expect(contentBundle.headline).toEqual({ ...DRAFT.headline, kicker: 'NovaNews Investigates' });
      expect(contentBundle.sections).toEqual(DRAFT.sections);
      expect(edits).toBeNull();
    });
  });

  // An article stamped before this change holds no record of the map's lines. Nothing errors for
  // want of them, and nothing adds them: the stamp runs on a first write only, and a thread that
  // holds an article passes the writer's node by.
  describe('a thread stamped before the change', () => {
    /** The stored article of such a thread: the map's lines on it, and no standing edit. */
    const oldThread = async (overrides = {}) => {
      const { contentBundle } = await stamped();
      return { ...atArticle(), contentBundle, _articleHandEdits: null, ...overrides };
    };

    it('the writer\'s node passes it by: no call, no stamp, no new record', async () => {
      const state = await oldThread();
      const sdk = recordingSdk(DRAFT);
      const update = await generateContentBundle(state, cfg(sdk));
      expect(sdk).not.toHaveBeenCalled();
      expect(update).not.toHaveProperty('contentBundle');
      expect(update).not.toHaveProperty('_articleHandEdits');
    });

    it('an automatic pass that rewrites its headline is left as it is, as before, and records nothing', async () => {
      const state = await oldThread();
      const update = await automaticPass(state, state.contentBundle, reworked(state.contentBundle, (out) => { out.headline.main = 'A Headline the Rework Wrote'; }));
      expect(update.contentBundle.headline.main).toBe('A Headline the Rework Wrote');
      expect(update._articleHandEditReport).toBeNull();
      expect(update).not.toHaveProperty('_articleHandEdits');
    });

    it('the judge is listed no edit, and a finding in its headline is the writer\'s must-fix, as before', async () => {
      const state = await oldThread();
      expect(judges.judgedEdits('article', state)).toEqual([]);
      expect(judges.buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: [] })).not.toContain("THE DIRECTOR'S EDITS");
      const criteria = judges.getPhaseCriteria('article', 'journalist');
      const finding = 'T1: "The Ledger Kept Talking" states as fact what the record does not hold.';
      const verdict = judges.truthOnlyVerdict(judges.guardDirectorEdits({
        evaluation: { ready: false, structuralPassed: false, structuralIssues: [finding], advisoryWarnings: [], criteriaScores: {} },
        criteria, edits: judges.judgedEdits('article', state), output: state.contentBundle
      }), criteria);
      expect(verdict.kept).toEqual([finding]);
      expect(verdict.ready).toBe(false);
    });

    it('whose director wrote the headline on the map keeps that one record, and its line under the headline stays the writer\'s', async () => {
      const { contentBundle } = await stamped(atArticle(directorsMap((map) => { map.headline = DIRECTORS_HEADLINE; })));
      const writers = clone(contentBundle);
      delete writers.headline.main;
      // The record as the stamp made it before the change: the director's headline alone.
      const before = standingAfterSendBack(null, writers, contentBundle, 'bundle');
      expect(before.edits.map((edit) => edit.path)).toEqual(['headline.main']);
      const state = { ...atArticle(), contentBundle, _articleHandEdits: before };
      const update = await automaticPass(state, contentBundle, reworked(contentBundle, (out) => {
        out.headline.main = 'A Headline the Rework Wrote';
        out.headline.deck = 'A line under it that the rework wrote.';
      }));
      expect(update.contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
      expect(update.contentBundle.headline.deck).toBe('A line under it that the rework wrote.');
      expect(update._articleHandEditReport.checked).toEqual(['E1']);
    });
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

  /** The stamp's records at the top photo: the top photo's rule is its own, beside the map's lines (R40). */
  const heroEdits = (standing) => standing.edits.filter((edit) => edit.scope === 'heroImage');

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
    expect(heroEdits(_articleHandEdits)).toEqual([]);
  });

  it('a cut of the top photo, which only a hand-built payload makes, is no edit at the article stop', async () => {
    const state = cutMap();
    expect(carriedEdits(state._outlineHandEdits, state.outline)).toEqual([
      expect.objectContaining({ path: 'topPhoto', before: { filename: CUT }, after: null })
    ]);
    const { contentBundle, _articleHandEdits } = await firstDraft(state);
    expect(contentBundle).not.toHaveProperty('heroImage');
    expect(heroEdits(_articleHandEdits)).toEqual([]);
  });

  it('beside a top photo the director chose in its place, the stamp records the choice alone', async () => {
    const { contentBundle, _articleHandEdits } = await firstDraft(cutMap((left) => {
      left.topPhoto = 'p2.jpg';
      left.sections[1].photos = [];
    }), { ...clone(WRITERS_DRAFT), heroImage: { filename: 'p2.jpg', caption: 'Alex leans over the ledger.' } });
    expect(contentBundle.heroImage).toEqual({ filename: 'p2.jpg', caption: 'Alex leans over the ledger.' });
    expect(heroEdits(_articleHandEdits).map(({ id, path, before, after }) => [id, path, before, after])).toEqual([
      ['E3', 'heroImage.filename', null, 'p2.jpg']
    ]);
    expect(carriedEdits(_articleHandEdits, contentBundle).map((edit) => edit.id)).toEqual(['E1', 'E2', 'E3']);
  });
});

// Phase 18, run 2d (R38): the line above the headline is the theme's, and code prints it. The
// writer is not asked for it, so the stamp puts the theme's line on a first write, and a rework
// carries the line the previous article held (carryUnshownFields), as it carries every field the
// writer is not shown: the theme's line, the line the director typed at the desk, or an old
// thread's writer-made line until the director changes it.
describe('R38: the line above the headline is the theme\'s, and a rework carries it', () => {
  const { bundleAsShown } = require('../prompt-builder');
  const { _testing: nodes } = require('../workflow/nodes/ai-nodes');
  const THEMES_LINE = 'NovaNews Investigates';
  const DESK_LINE = 'Inside the Ledger';

  it("a first write carries the theme's line whatever the writer returned", async () => {
    const none = clone(WRITERS_DRAFT);
    delete none.headline.kicker;
    const writerless = await firstDraft(atArticle(), none);
    expect(writerless.contentBundle.headline.kicker).toBe(THEMES_LINE);
    const own = { ...clone(WRITERS_DRAFT), headline: { ...WRITERS_DRAFT.headline, kicker: 'A Line the Writer Wrote' } };
    const overwritten = await firstDraft(atArticle(), own);
    expect(overwritten.contentBundle.headline.kicker).toBe(THEMES_LINE);
    // The line is the theme's, not the director's: the stamp records no edit for it.
    expect(overwritten._articleHandEdits.edits.map((edit) => edit.path)).toEqual(['headline.main', 'headline.deck']);
  });

  it('a theme with no line gets none, and the writer\'s line goes', () => {
    const { contentBundle } = nodes.stampFromMap(clone(WRITERS_DRAFT), atArticle({ theme: 'detective' }));
    expect(contentBundle.headline).not.toHaveProperty('kicker');
    expect(contentBundle.headline.main).toBe(MAP.headline);
  });

  /** The first draft, stamped, as the thread stores it. */
  async function stored() {
    return (await firstDraft(atArticle())).contentBundle;
  }

  /** The reworked article as the writer can return it: the writer's shape, a paragraph changed. */
  function reworkedFrom(bundle, change = () => {}) {
    const out = bundleAsShown(bundle);
    out.sections[0].content[0].text = 'Marcus bragged at the bar.';
    change(out);
    return out;
  }

  it("an automatic pass keeps the theme's line, though the writer was not shown it", async () => {
    const before = await stored();
    const sdk = recordingSdk(reworkedFrom(before));
    const out = await reviseContentBundle({ ...atArticle(), _previousContentBundle: before, articleRevisionCount: 1 }, cfg(sdk));
    expect(sdk.mock.calls[0][0].prompt).not.toContain(THEMES_LINE);
    expect(out.contentBundle.headline.kicker).toBe(THEMES_LINE);
    expect(out.contentBundle.sections[0].content[0].text).toBe('Marcus bragged at the bar.');
  });

  it("an old thread's line the writer made stays through a rework, until the director changes it", async () => {
    const before = { ...(await stored()) };
    before.headline = { ...before.headline, kicker: 'NovaNews' };
    const out = await reviseContentBundle({ ...atArticle(), _previousContentBundle: before, articleRevisionCount: 1 }, cfg(recordingSdk(reworkedFrom(before))));
    expect(out.contentBundle.headline.kicker).toBe('NovaNews');
  });

  describe('a line the director typed at the desk', () => {
    /** The stored first draft, and the director's at the desk with their own line above the headline. */
    async function deskState() {
      const writers = await stored();
      const directors = clone(writers);
      directors.headline.kicker = DESK_LINE;
      return { state: { ...atArticle(), _previousContentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle') }, directors };
    }

    it('is the director\'s edit', async () => {
      const { state } = await deskState();
      expect(state._articleHandEdits.edits).toEqual([expect.objectContaining({ path: 'headline.kicker', before: THEMES_LINE, after: DESK_LINE })]);
    });

    it('survives an automatic pass, carried with nothing to put back', async () => {
      const { state, directors } = await deskState();
      const out = await reviseContentBundle({ ...state, articleRevisionCount: 1 }, cfg(recordingSdk(reworkedFrom(directors))));
      expect(out.contentBundle.headline.kicker).toBe(DESK_LINE);
      expect(JSON.stringify(out._articleHandEditReport || {})).not.toContain('restored');
    });

    it('is put back by code when an automatic pass changed it', async () => {
      const { state, directors } = await deskState();
      const changed = reworkedFrom(directors, (out) => { out.headline.kicker = 'A Line the Rework Wrote'; });
      const out = await reviseContentBundle({ ...state, articleRevisionCount: 1 }, cfg(recordingSdk(changed)));
      expect(out.contentBundle.headline.kicker).toBe(DESK_LINE);
      expect(out._articleHandEditReport.changed).toEqual([
        expect.objectContaining({ automatic: true, restored: true, director: DESK_LINE })
      ]);
    });

    it('survives a send-back', async () => {
      const { state, directors } = await deskState();
      const sdk = recordingSdk({ ...reworkedFrom(directors), [CHANGED_EDITS_KEY]: [] });
      const out = await reviseContentBundle({
        ...state, _articleFeedback: 'Tighten the story.', articleRevisionCount: 0, humanArticleRevisionCount: 1
      }, cfg(sdk));
      expect(out.contentBundle.headline.kicker).toBe(DESK_LINE);
      expect(out.contentBundle.sections[0].content[0].text).toBe('Marcus bragged at the bar.');
    });
  });
});
