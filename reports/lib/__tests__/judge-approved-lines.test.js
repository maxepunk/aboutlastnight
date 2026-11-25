/**
 * Phase 18, run 2i, brief Y: the article judge's two lists (R58 to R60; the run 2c wording doc's
 * part 11).
 *
 * Since the lock (run 2f), the map's headline, the line under it and each section's heading stand
 * at the article as the director's lines, whoever wrote them. The director chose (2026-11-24) that
 * a line they only approved is final and is not their words. So the article judge is listed the
 * standing lines in two lists: the director's edits, in that block's words, for each line the
 * director wrote, cut or moved; then, under part 11's heading, each line of the map a writer wrote
 * and the director approved. One function says which kind a line is (ai-nodes.js
 * linesApprovedOnMap): approved on the map when its place is the headline, the line under it or a
 * section's heading, its text is the map's line there, and the director did not write or change
 * that line on the map, or, for the headline, at the story meeting.
 *
 * Each case runs the real stamp on the rework fixture's map (invented names and text) and reads the
 * real block in the judge's user prompt. Who may change a line does not change (R60): the guard's
 * reading of a concern about an approved line is held here too.
 */
const { reworkFixtureState, MAP } = require('./fixtures/rework-state');
const { _testing: nodes, linesApprovedOnMap } = require('../workflow/nodes/ai-nodes');
const { _testing: judges } = require('../workflow/nodes/evaluator-nodes');
const {
  standingOnMap, standingAtMeeting, standingAfterSendBack, carriedEdits, formatEditLines, DIRECTOR_EDIT_PREFIX, EDIT_LINES_GUIDE
} = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });

/** Part 11, word for word: the second list's heading and its sentences. */
const APPROVED_HEADING = 'THE LINES THE DIRECTOR APPROVED ON THE MAP (final as approved):';
const APPROVED_SENTENCES = "A writer wrote each line below, and the director approved it with the map. The article prints it as given, and no rework changes it. It is not the director's words, so no other sentence of the article stands on it. Where one breaks a limit, write the concern in advisoryWarnings, opening with the line's id and then the limit it concerns, as in: Director's edit E2: T1: <the concern>.";

/** The director's edits block's heading and words, as they stood before this run. */
const OWN_HEADING = "THE DIRECTOR'S EDITS (record: the director's own text, each final as the director left it):";
const OWN_SENTENCES = `Each edit below is text the director wrote into the content bundle above, text they cut from it (marked cut), or a block they moved (marked moved). ${EDIT_LINES_GUIDE} An edit is the final word on its text, so score each criterion, and write each structural issue, on the writer's text alone. Where you disagree with an edit, or would bring back a cut or a removed sentence, write the concern in advisoryWarnings, opening with the edit's id and then the limit it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>.`;

/** The writer's first draft: a section for each of the map's four, with its own headline, deck and headings. */
const DRAFT = {
  headline: { main: "The Writer's Own Headline", deck: "The writer's own deck." },
  heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph('Six votes named an overdose after Alex and Morgan deadlocked.')] },
    { id: 'theStory', type: 'narrative', heading: "The Writer's Own Heading", content: [paragraph('Marcus bragged about the sale the night he died.')] },
    { id: 'followTheMoney', type: 'evidence-highlight', content: [paragraph('The sale paid into the Melanie account.')] },
    { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
  ],
  metadata: { sessionId: '010126', theme: 'journalist' }
};

/** The fixture past the map's approve, the map as the writer wrote it. */
const atArticle = (overrides = {}) => ({ ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', contentBundle: null, ...overrides });

/** The map as the director left it with `change` applied, and the edits the map's approve records. */
function directorsMap(change) {
  const baseline = clone(MAP);
  const left = clone(MAP);
  change(left);
  return { outline: left, _mapBaseline: baseline, _outlineHandEdits: standingOnMap(null, baseline, left) };
}

/** The state the real stamp leaves: the stamped first draft and the article stop's standing edits. */
function stamped(state = atArticle(), draft = DRAFT) {
  const { contentBundle, edits } = nodes.stampFromMap(clone(draft), state);
  return { ...state, contentBundle, _articleHandEdits: edits };
}

/** The judge's user prompt for `state`, its edits as createEvaluator sends them. */
const judgePrompt = (state) => judges.buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: judges.judgedEdits('article', state) });

/** The block between the article and the fact check: what follows CONTENT BUNDLE's JSON. */
function editsBlock(prompt) {
  const close = prompt.indexOf('THE FACT CHECK ON THIS BUNDLE');
  const bundle = prompt.lastIndexOf('\n}\n\n', close);
  return prompt.slice(bundle + 4, close).replace(/\n+$/, '');
}

/** Each list's edit ids, as the judge reads them. */
function listsOf(state) {
  const edits = judges.judgedEdits('article', state);
  const approved = linesApprovedOnMap(edits, state).map((edit) => edit.id);
  return { own: edits.map((edit) => edit.id).filter((id) => !approved.includes(id)), approved };
}

const own = (lines) => `${OWN_HEADING}\n${OWN_SENTENCES}\n\n${lines}`;
const onMap = (lines) => `${APPROVED_HEADING}\n${APPROVED_SENTENCES}\n\n${lines}`;

const HEADLINE = `E1 (headline, main): "${MAP.headline}"`;
const DECK = `E2 (headline, deck): "${MAP.deck}"`;
const STORY = 'E3 (section "theStory", heading): "The Story"';
const MONEY = 'E4 (section "followTheMoney", heading): "Follow the Money"';

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("R58, R59: a line of the map a writer wrote and the director approved prints in the second list", () => {
  it("a map the director approved as written: the four lines print under part 11's heading alone, word for word", () => {
    const state = stamped();
    expect(listsOf(state)).toEqual({ own: [], approved: ['E1', 'E2', 'E3', 'E4'] });
    const prompt = judgePrompt(state);
    expect(editsBlock(prompt)).toBe(onMap([HEADLINE, DECK, STORY, MONEY].join('\n')));
    expect(prompt).not.toContain("THE DIRECTOR'S EDITS");
  });

  it('the example in the second list is built from the prefix every concern opens with', () => {
    expect(APPROVED_SENTENCES).toContain(`as in: ${DIRECTOR_EDIT_PREFIX}E2: T1: <the concern>.`);
  });
});

describe("each way a line comes to be the director's own: it stays under the director's edits", () => {
  it('a headline the director changed on the map', () => {
    const state = stamped(atArticle(directorsMap((map) => { map.headline = 'Six Votes Said Overdose. The Ledger Said Sale.'; })));
    expect(listsOf(state)).toEqual({ own: ['E1'], approved: ['E2', 'E3', 'E4'] });
    expect(editsBlock(judgePrompt(state))).toBe(`${own('E1 (headline, main): "Six Votes Said Overdose. The Ledger Said Sale."')}\n\n${onMap([DECK, STORY, MONEY].join('\n'))}`);
  });

  it('a deck the director changed on the map', () => {
    const state = stamped(atArticle(directorsMap((map) => { map.deck = 'The director wrote this line under the headline.'; })));
    expect(listsOf(state)).toEqual({ own: ['E2'], approved: ['E1', 'E3', 'E4'] });
    expect(editsBlock(judgePrompt(state))).toBe(`${own('E2 (headline, deck): "The director wrote this line under the headline."')}\n\n${onMap([HEADLINE, STORY, MONEY].join('\n'))}`);
  });

  it("a section's heading the director changed on the map", () => {
    const state = stamped(atArticle(directorsMap((map) => { map.sections[2].heading = 'Where the Money Went'; })));
    // The map records the heading at its section's slot.
    expect(carriedEdits(state._outlineHandEdits, state.outline).map((edit) => edit.path)).toEqual(['sections[#followTheMoney].heading']);
    expect(listsOf(state)).toEqual({ own: ['E4'], approved: ['E1', 'E2', 'E3'] });
  });

  it('a heading in a section the director added on the map', () => {
    const state = stamped(atArticle(directorsMap((map) => {
      map.sections.splice(3, 0, { slot: 'aside', heading: 'What the Bartender Saw', job: 'Riley watched the ledger.', beats: [], photos: [] });
    })), {
      ...clone(DRAFT),
      sections: [...clone(DRAFT.sections.slice(0, 3)), { id: 'aside', type: 'narrative', content: [paragraph('Riley watched the ledger all morning.')] }, clone(DRAFT.sections[3])]
    });
    // The map records the section whole, its heading in it.
    expect(carriedEdits(state._outlineHandEdits, state.outline).map((edit) => [edit.path, edit.before])).toEqual([['sections[#aside]', null]]);
    expect(state._articleHandEdits.edits.map((edit) => edit.path)).toContain('sections[#aside].heading');
    const asideId = state._articleHandEdits.edits.find((edit) => edit.path === 'sections[#aside].heading').id;
    const lists = listsOf(state);
    expect(lists.own).toEqual([asideId]);
    expect(lists.approved).not.toContain(asideId);
    expect(lists.approved).toHaveLength(4);
  });

  it('a headline the director changed at the story meeting, which the map carries', () => {
    const MEETING_HEADLINE = 'The Ledger Kept Talking After the Vote';
    const fixture = reworkFixtureState('journalist');
    const directors = clone(fixture.weave);
    directors.angles[0].headline = MEETING_HEADLINE;
    const map = clone(MAP);
    map.headline = MEETING_HEADLINE;
    const state = stamped(atArticle({
      weave: directors, _weaveHandEdits: standingAtMeeting(null, fixture.weave, directors), outline: map, _mapBaseline: clone(map)
    }));
    expect(listsOf(state)).toEqual({ own: ['E1'], approved: ['E2', 'E3', 'E4'] });
  });

  it('a headline changed at the meeting that a map rework has since rewritten is the writer\'s, approved with the map', () => {
    const fixture = reworkFixtureState('journalist');
    const directors = clone(fixture.weave);
    directors.angles[0].headline = 'The Ledger Kept Talking After the Vote';
    const map = clone(MAP);
    map.headline = 'A Headline the Map Rework Wrote';
    const state = stamped(atArticle({
      weave: directors, _weaveHandEdits: standingAtMeeting(null, fixture.weave, directors), outline: map, _mapBaseline: clone(map)
    }));
    expect(listsOf(state)).toEqual({ own: [], approved: ['E1', 'E2', 'E3', 'E4'] });
  });

  it('a line the director retyped at the desk after the stamp, and a paragraph they wrote there', () => {
    const state = stamped();
    const desk = clone(state.contentBundle);
    desk.sections[1].heading = 'What the Bar Saw';
    desk.sections[3].content[0].text = 'Riley kept the books, and says so.';
    const after = { ...state, contentBundle: desk, _articleHandEdits: standingAfterSendBack(state._articleHandEdits, state.contentBundle, desk, 'bundle') };
    expect(after._articleHandEdits.edits.map((edit) => edit.id)).toEqual(['E1', 'E2', 'E4', 'E5', 'E6']);
    expect(listsOf(after)).toEqual({ own: ['E5', 'E6'], approved: ['E1', 'E2', 'E4'] });
    const block = editsBlock(judgePrompt(after));
    expect(block.startsWith(`${OWN_HEADING}\n`)).toBe(true);
    expect(block).toContain(`\n\n${onMap([HEADLINE, DECK, MONEY].join('\n'))}`);
    expect(block.indexOf('E5 (section "theStory", heading): "What the Bar Saw"')).toBeLessThan(block.indexOf(APPROVED_HEADING));
  });
});

describe('what printed before prints now', () => {
  it("an old thread with no stamped line: the director's edits alone, in their words", () => {
    const state = atArticle({ contentBundle: clone(DRAFT) });
    const desk = clone(DRAFT);
    desk.sections[3].content[0].text = 'Riley kept the books, and says so.';
    const old = { ...state, contentBundle: desk, _articleHandEdits: standingAfterSendBack(null, DRAFT, desk, 'bundle') };
    expect(listsOf(old)).toEqual({ own: ['E1'], approved: [] });
    const edits = judges.judgedEdits('article', old);
    expect(editsBlock(judgePrompt(old))).toBe(own(formatEditLines(edits)));
    expect(judgePrompt(old)).not.toContain(APPROVED_HEADING);
  });

  it("an old thread whose director wrote the headline on the map: that one record, the director's", () => {
    const state = atArticle(directorsMap((map) => { map.headline = 'Six Votes Said Overdose. The Ledger Said Sale.'; }));
    const { contentBundle } = nodes.stampFromMap(clone(DRAFT), state);
    const writers = clone(contentBundle);
    delete writers.headline.main;
    const old = { ...state, contentBundle, _articleHandEdits: standingAfterSendBack(null, writers, contentBundle, 'bundle') };
    expect(listsOf(old)).toEqual({ own: ['E1'], approved: [] });
  });

  it("a thread with no map: every standing line is the director's own", () => {
    const state = stamped();
    const noMap = { ...state, outline: null };
    expect(listsOf(noMap)).toEqual({ own: ['E1', 'E2', 'E3', 'E4'], approved: [] });
    expect(editsBlock(judgePrompt(noMap))).toBe(own([HEADLINE, DECK, STORY, MONEY].join('\n')));
  });

  it('no edits at all: neither list prints', () => {
    const state = { ...stamped(), _articleHandEdits: null };
    expect(linesApprovedOnMap([], state)).toEqual([]);
    const prompt = judgePrompt(state);
    expect(prompt).not.toContain("THE DIRECTOR'S EDITS");
    expect(prompt).not.toContain(APPROVED_HEADING);
  });

  it("the weave's judge is not touched: its block prints the meeting's changes as before", () => {
    expect(judges.renderJudgeDirectorEdits([], 'arcs')).toBe('');
  });
});

describe('when in doubt, a line is the director\'s own', () => {
  it('a line whose text differs from the map\'s is the director\'s', () => {
    const state = stamped();
    const moved = { ...state, outline: { ...clone(state.outline), deck: 'A deck the map holds now.' } };
    expect(listsOf(moved)).toEqual({ own: ['E2'], approved: ['E1', 'E3', 'E4'] });
  });

  it('a heading where the map\'s section has none, or for a section the map does not hold, is the director\'s', () => {
    const state = stamped();
    const blank = clone(state.outline);
    blank.sections[1].heading = '';
    blank.sections = blank.sections.filter((section) => section.slot !== 'followTheMoney');
    expect(listsOf({ ...state, outline: blank })).toEqual({ own: ['E3', 'E4'], approved: ['E1', 'E2'] });
  });

  it('an edit with no steps to read is the director\'s', () => {
    const state = stamped();
    const edits = judges.judgedEdits('article', state).map(({ at: _at, ...rest }) => rest);
    expect(linesApprovedOnMap(edits, state)).toEqual([]);
  });

  it('reads the edits and the map and changes neither', () => {
    const state = stamped();
    const edits = judges.judgedEdits('article', state);
    const before = clone({ edits, state });
    linesApprovedOnMap(edits, state);
    expect(clone({ edits, state })).toEqual(before);
  });
});

describe('the two lists together hold every standing line once', () => {
  const cases = {
    'as written': () => stamped(),
    'headline on the map': () => stamped(atArticle(directorsMap((map) => { map.headline = 'Six Votes Said Overdose. The Ledger Said Sale.'; }))),
    'heading on the map': () => stamped(atArticle(directorsMap((map) => { map.sections[1].heading = 'The Night of the Sale'; }))),
    'no map': () => ({ ...stamped(), outline: null })
  };
  it.each(Object.keys(cases))('%s', (name) => {
    const state = cases[name]();
    const block = editsBlock(judgePrompt(state));
    const ids = judges.judgedEdits('article', state).map((edit) => edit.id);
    ids.forEach((id) => expect(block.split('\n').filter((line) => line.startsWith(`${id} (`))).toHaveLength(1));
    const { own: mine, approved } = listsOf(state);
    expect([...mine, ...approved].sort()).toEqual([...ids].sort());
  });
});

describe('R60: a concern about an approved line is read as a concern about an edit is', () => {
  it("the guard keeps a concern opening with an approved line's id, and moves a finding located in one to a concern", () => {
    const state = stamped();
    const criteria = judges.getPhaseCriteria('article', 'journalist');
    const concern = `${DIRECTOR_EDIT_PREFIX}E2: T1: the line under the headline calls the verdict settled.`;
    const finding = `T1: "${MAP.headline}" states as fact what the record does not hold.`;
    const verdict = judges.truthOnlyVerdict(judges.guardDirectorEdits({
      evaluation: {
        ready: false, structuralPassed: false, structuralIssues: [finding], advisoryWarnings: [concern],
        criteriaScores: { evidenceTruth: { score: 0.3, notes: 'The headline is stated as fact.', fix: 'Say what the record holds.' } }
      },
      criteria, edits: judges.judgedEdits('article', state), output: state.contentBundle
    }), criteria);
    expect(verdict.kept).toEqual([]);
    expect(verdict.ready).toBe(true);
    expect(verdict.advisories).toEqual([concern]);
    expect(verdict.moved).toEqual([`${DIRECTOR_EDIT_PREFIX}E1: ${finding}`]);
  });
});
