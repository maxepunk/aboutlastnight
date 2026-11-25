process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * Phase 18, run 2f (R40): the lines the director approves on the map are locked at the article,
 * through the REAL compiled graph.
 *
 * The director's decision of 2026-11-24: "lock them once I approve the map". The headline, the
 * line under it and each section's heading on the approved map are the director's lines at the
 * article, whoever wrote them. This file walks the path the run's review focus names, on a map
 * none of whose lines the director edited: the first write, the judge, an automatic pass, the
 * desk, a send-back whose note leaves the headline alone, and one whose note asks for a new one.
 *
 * Each run seeds a thread past the story meeting and the photo branch and runs the real map
 * writer, map checks, stops, article writer, stamp, fact check, judge, increment and rework, as
 * article-stage-graph.test.js does. The director acts through the server's own functions
 * (buildResumePayload, getCheckpointData), and the desk is read through the console's own view
 * model (deskView, steeringView). The model calls go to a scripted stand-in: the map writer by
 * its schema, the article writer by the bundle's, its rework by its label, and the judge by a
 * queue of verdicts, a clean one when the queue is empty.
 *
 * Invented text throughout: the repo is public.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { DIRECTOR_EDIT_PREFIX, CHANGED_EDITS_KEY } = require('../../lib/hand-edit-diff');
const { bundleAsShown } = require('../../lib/prompt-builder');
const ViewLogic = require('../../console/checkpoint-view-logic');
const { reworkFixtureState, MAP, DOCUMENT_TEXT } = require('../../lib/__tests__/fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });

const CLEAN = { ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
const BRAG = 'Marcus bragged about the sale the night he died.';
const NEW_HEADLINE = 'Six Votes for an Overdose, and a Sale Nobody Counted';

/** The map's three kinds of line, as the stamp records them on this draft: the article stop's standing edits. */
const LOCKED = [
  ['E1', 'headline.main', MAP.headline],
  ['E2', 'headline.deck', MAP.deck],
  ['E3', 'sections[#theStory].heading', 'The Story'],
  ['E4', 'sections[#followTheMoney].heading', 'Follow the Money']
];
/** Those four as a rework and the judge are listed them. */
const LISTED = [
  `E1 (headline, main): "${MAP.headline}"`,
  `E2 (headline, deck): "${MAP.deck}"`,
  'E3 (section "theStory", heading): "The Story"',
  'E4 (section "followTheMoney", heading): "Follow the Money"'
].join('\n');

/**
 * The article writer's first draft: every roster player named, its card copied from the record,
 * both kept photos placed, so the fact check finds nothing to send back. Its headline, the line
 * under it and its headings are the writer's own, none as the map gives them.
 */
function writersDraft() {
  return {
    metadata: { sessionId: '100326', theme: 'journalist', generatedAt: '2026-10-03T10:00:00.000Z' },
    headline: { main: "The Writer's Own Headline", deck: "The writer's own deck." },
    heroImage: { filename: 'hero.jpg', caption: 'Alex, Morgan and Sarah at the table.' },
    sections: [
      { id: 'lede', type: 'narrative', heading: 'A Heading the Writer Added', content: [paragraph('Alex and Morgan deadlocked, and six votes named an accidental overdose.')] },
      {
        id: 'theStory', type: 'narrative', heading: "The Writer's Own Heading",
        content: [
          paragraph(BRAG),
          { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: DOCUMENT_TEXT.ale003, owner: 'Alex Reeves', significance: 'critical' },
          { type: 'photo', filename: 'p2.jpg', caption: 'Alex leans over the ledger and points at a line.' },
          paragraph('Morgan handed Riley an envelope by the bar, and a paternity result named Sarah as the heir.')
        ]
      },
      { id: 'followTheMoney', type: 'evidence-highlight', content: [paragraph('The sale paid into the Melanie account.')] },
      { id: 'closing', type: 'conclusion', content: [paragraph('Riley says they only kept the books.')] }
    ]
  };
}

/**
 * A scripted SDK: the map writer by the map's schema, the article writer by the bundle's, its
 * rework by its label (`reworkReturns`, given the article it was shown), and the judge by the
 * next of `verdicts`, a clean verdict when none is left. Every call's options are kept.
 */
function scriptedSdk() {
  const sent = [];
  const sdk = async (options) => {
    const label = options.label || '';
    const schemaId = options.jsonSchema && options.jsonSchema.$id;
    sent.push({ who: /^Article revision/.test(label) ? 'rework' : (schemaId || 'judge'), options });
    if (/^Article revision/.test(label)) return clone(sdk.reworkReturns);
    if (schemaId === 'outline') return clone(MAP);
    if (schemaId === 'content-bundle') return writersDraft();
    return clone(sdk.verdicts.shift() || CLEAN);
  };
  sdk.sent = sent;
  sdk.verdicts = [];
  sdk.reworkReturns = null;
  sdk.calls = (who) => sent.filter((call) => call.who === who).map((call) => call.options);
  return sdk;
}

/** The block between a tag's opening line and its closing line. */
function block(text, tag) {
  const open = text.indexOf(`<${tag}>\n`);
  const close = text.indexOf(`\n</${tag}>`, open);
  expect(open).toBeGreaterThanOrEqual(0);
  return text.slice(open, close);
}

/**
 * The list of the lines the director approved on the map that the article's judge was sent, from its
 * heading to the fact check's (run 2i, R58): a line the map gives and the director did not write is
 * listed there, apart from the director's edits, which the prompt then does not print.
 */
function judgesApprovedLines(prompt) {
  const open = prompt.indexOf('THE LINES THE DIRECTOR APPROVED ON THE MAP (final as approved):');
  expect(open).toBeGreaterThanOrEqual(0);
  expect(prompt).not.toContain("THE DIRECTOR'S EDITS (");
  return prompt.slice(open, prompt.indexOf('THE FACT CHECK ON THIS BUNDLE', open));
}

describe('R40: the lines on the approved map, through the article stage', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-map-lock-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  const run = (graph, thread, input) => graph.invoke(input, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });

  /** The director's action at the stop the thread is paused at, through the server's payload builder. */
  async function act(graph, thread, approvals) {
    const snapshot = await graph.getState(thread);
    const type = snapshot.tasks[0].interrupts[0].value.type;
    const { resume, stateUpdates, error } = buildResumePayload(approvals, snapshot.values, 'journalist', type);
    expect(error).toBeNull();
    await run(graph, thread, new Command({ resume, update: stateUpdates }));
    const next = await graph.getState(thread);
    const nextType = next.tasks[0].interrupts[0].value.type;
    return { type: nextType, values: next.values, data: await getCheckpointData(nextType, next.values) };
  }

  /** The thread past the photo branch, run to the map's stop, and the map approved as `left` (by default as the writer wrote it). */
  async function toArticle(sdk, left = clone(MAP)) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = { configurable: { thread_id: 'map-lock-test', sessionId: '100326', theme: 'journalist', sdkClient: sdk, dataDir: dir } };
    const { outline: _o, _mapBaseline: _b, ...state } = reworkFixtureState('journalist');
    await graph.updateState(thread, { ...state, sessionId: '100326', evaluationHistory: [] }, 'finalizePhotoAnalyses');
    await run(graph, thread, null);
    const stop = await act(graph, thread, { outline: 'approve', map: left });
    expect(stop.type).toBe(CHECKPOINT_TYPES.ARTICLE);
    return { graph, thread, stop };
  }

  const standing = (values) => values._articleHandEdits.edits.map(({ id, path: at, after }) => [id, at, after]);
  const headingOf = (bundle, id) => bundle.sections.find((section) => section.id === id).heading;
  /** Every mark the desk shows, with the piece it sits beside ('' for a mark beside none). */
  const marksOf = (data) => {
    const view = ViewLogic.deskView(data, data.contentBundle);
    return [
      ...Object.values(view.marks.at).flat(),
      ...view.marks.apart,
      ...view.marks.resolved
    ].map((mark) => [mark.label, mark.where, mark.text]);
  };

  it('the first write: the map\'s lines are on the draft and stand as the director\'s, and the desk shows no mark for them', async () => {
    const sdk = scriptedSdk();
    const { stop } = await toArticle(sdk);

    const bundle = stop.values.contentBundle;
    expect(bundle.headline).toEqual({ main: MAP.headline, kicker: 'NovaNews Investigates', deck: MAP.deck });
    expect(bundle.sections.map((section) => [section.id, section.heading])).toEqual([
      ['lede', undefined], ['theStory', 'The Story'], ['followTheMoney', 'Follow the Money'], ['closing', undefined]
    ]);
    expect(standing(stop.values)).toEqual(LOCKED);

    // The first write's prompt holds no list of edits; the judge is listed the four as lines the
    // director approved on the map (run 2i), and nothing else is new in its prompt.
    const [writer] = sdk.calls('content-bundle');
    expect(writer.prompt).not.toContain('<HAND_EDITS>');
    const [judge] = sdk.calls('judge');
    expect(judgesApprovedLines(judge.prompt)).toContain(`\n\n${LISTED}\n\n`);

    // Nothing is wrong, so the desk holds no mark, no line beside any piece and no record of a pass.
    expect(stop.data.lastEvaluation.ready).toBe(true);
    expect(stop.data.handEditReport).toBeNull();
    expect(marksOf(stop.data)).toEqual([]);
    expect(ViewLogic.steeringView(stop.data.handEditReport, stop.data.directorGateNotes, {})).toMatchObject({ any: false, changedEdits: [], kept: '' });
  });

  it('an automatic pass that rewrites each line has it put back, and the desk keeps the record folded', async () => {
    const sdk = scriptedSdk();
    // The judge finds a breach in the writer's sentence, so one automatic pass runs.
    const WRITERS_ISSUE = `T12: "${BRAG}" quotes no document. Report what the memory shows.`;
    sdk.verdicts.push({
      ready: false, structuralPassed: false, overallScore: 0.4, confidence: 'high', advisoryWarnings: [],
      criteriaScores: { wordsTruth: { score: 0.4, notes: `"${BRAG}" quotes no document.`, fix: 'Report what the memory shows.' } },
      structuralIssues: [WRITERS_ISSUE]
    });
    // The pass fixes the sentence, and rewrites the headline, the line under it and a heading on its way.
    const draft = writersDraft();
    const stampedDraft = {
      ...draft,
      headline: { main: MAP.headline, kicker: 'NovaNews Investigates', deck: MAP.deck },
      sections: draft.sections.map((section) => {
        const { heading: _heading, ...rest } = section;
        const mapHeading = MAP.sections.find((each) => each.slot === section.id).heading;
        return mapHeading ? { ...rest, heading: mapHeading } : rest;
      })
    };
    const returned = bundleAsShown(stampedDraft);
    returned.headline.main = 'A Headline the Rework Wrote';
    returned.headline.deck = 'A line under it that the rework wrote.';
    returned.sections.find((section) => section.id === 'theStory').heading = 'A Heading the Rework Wrote';
    returned.sections.find((section) => section.id === 'theStory').content[0].text = 'A recovered memory shows Marcus bragging about the sale.';
    sdk.reworkReturns = returned;

    const { stop } = await toArticle(sdk);

    // One rework ran, on the writer's sentence, listed the director's lines and told to keep them.
    const reworks = sdk.calls('rework');
    expect(reworks).toHaveLength(1);
    const edits = block(reworks[0].prompt, 'HAND_EDITS');
    expect(edits).toContain("This automatic pass fixes the writer's text, in a block the director moved too. Each edit of the director's is final:");
    expect(edits.endsWith(`\n\n${LISTED}`)).toBe(true);
    expect(reworks[0].jsonSchema.properties).not.toHaveProperty(CHANGED_EDITS_KEY);

    // Code put each line back, and kept the pass's fix.
    const bundle = stop.values.contentBundle;
    expect(bundle.headline.main).toBe(MAP.headline);
    expect(bundle.headline.deck).toBe(MAP.deck);
    expect(headingOf(bundle, 'theStory')).toBe('The Story');
    expect(bundle.sections.find((section) => section.id === 'theStory').content[0].text).toBe('A recovered memory shows Marcus bragging about the sale.');
    expect(standing(stop.values)).toEqual(LOCKED);

    // The report says what the pass did; the judge then read the article with the lines back.
    expect(stop.data.handEditReport.checked).toEqual(['E1', 'E2', 'E3', 'E4']);
    expect(stop.data.handEditReport.changed.map(({ id, automatic, restored }) => [id, automatic, restored])).toEqual([
      ['E1', true, true], ['E2', true, true], ['E3', true, true]
    ]);
    const judged = sdk.calls('judge');
    expect(judged).toHaveLength(2);
    expect(judged[1].prompt).toContain(`"main": "${MAP.headline}"`);
    expect(judged[1].prompt).not.toContain('A Headline the Rework Wrote');

    // At the desk: no mark beside a line code put back, and the folded record of the round says so.
    expect(marksOf(stop.data)).toEqual([]);
    const record = ViewLogic.steeringView(stop.data.handEditReport, stop.data.directorGateNotes, {});
    expect(record.kept).toBe('All 4 of your lines stand.');
    expect(record.changedEdits.map((entry) => entry.line)).toEqual([
      `E1, headline, main: automatic pass 1 changed your "${MAP.headline}" to "A Headline the Rework Wrote". Your text was put back.`,
      `E2, headline, deck: automatic pass 1 changed your "${MAP.deck}" to "A line under it that the rework wrote.". Your text was put back.`,
      'E3, section "theStory", heading: automatic pass 1 changed your "The Story" to "A Heading the Rework Wrote". Your text was put back.'
    ]);
  });

  it("a judge's finding in the headline or the line under it is a concern on the desk and sends no rework; a concern under a heading's id is kept", async () => {
    const sdk = scriptedSdk();
    const HEADLINE_FINDING = 'T1: "The Ledger Kept Talking" states as fact what the record does not hold.';
    const DECK_FINDING = 'T2: "the room settled on an accidental overdose" calls the verdict settled.';
    const HEADING_CONCERN = `${DIRECTOR_EDIT_PREFIX}E4: Nothing from outside the story: the heading is a phrase from running the game.`;
    sdk.verdicts.push({
      ready: false, structuralPassed: false, overallScore: 0.3, confidence: 'high',
      criteriaScores: {
        evidenceTruth: { score: 0.3, notes: '"The Ledger Kept Talking" is stated as fact.', fix: 'Say what the record holds.' },
        verdictTruth: { score: 0.3, notes: 'The line under the headline calls the verdict settled.', fix: 'Report the verdict.' },
        fictionTruth: { score: 0.4, notes: 'A heading uses a phrase from running the game.', fix: "Use the story's own words." }
      },
      structuralIssues: [HEADLINE_FINDING, DECK_FINDING],
      advisoryWarnings: [HEADING_CONCERN]
    });

    const { stop } = await toArticle(sdk);

    // No rework was sent: the article is ready for the director, with the three concerns.
    expect(sdk.calls('rework')).toEqual([]);
    expect(sdk.calls('judge')).toHaveLength(1);
    expect(stop.data.lastEvaluation).toMatchObject({ ready: true, structuralIssues: [] });
    expect(stop.data.lastEvaluation.advisoryWarnings).toEqual([
      HEADING_CONCERN,
      `${DIRECTOR_EDIT_PREFIX}E1: ${HEADLINE_FINDING}`,
      `${DIRECTOR_EDIT_PREFIX}E2: ${DECK_FINDING}`
    ]);
    expect(stop.values.contentBundle.headline).toMatchObject({ main: MAP.headline, deck: MAP.deck });

    // The desk: each concern that quotes its line sits beside the line, under the desk's label for
    // a concern about one of the director's lines (the desk's headline piece holds the headline and
    // the line under it); the heading's, which quotes nothing, on its section's heading, by its id
    // (run 2g: the payload says where each standing line sits). A concern reads past its ids and
    // its limit's code; a limit written by name stays, as the judge wrote it.
    expect(stop.data.standingLines).toEqual(LOCKED.map(([id, at]) => ({ id, path: at })));
    expect(marksOf(stop.data)).toEqual([
      ['Concern about your line', 'Follow the Money, heading', 'Nothing from outside the story: the heading is a phrase from running the game.'],
      ['Concern about your line', 'The headline', '"The Ledger Kept Talking" states as fact what the record does not hold.'],
      ['Concern about your line', 'The headline', '"the room settled on an accidental overdose" calls the verdict settled.']
    ]);
  });

  it("a send-back whose note leaves the headline alone keeps it; one whose note asks for a new one changes it, with the rework's reason beside it", async () => {
    const sdk = scriptedSdk();
    const { graph, thread, stop } = await toArticle(sdk);
    const first = stop.values.contentBundle;

    // Round 2: the note is about the closing. The rework keeps every line of the director's.
    const tightened = bundleAsShown(first);
    tightened.sections.find((section) => section.id === 'closing').content[0].text = 'Riley kept the books.';
    sdk.reworkReturns = { ...tightened, [CHANGED_EDITS_KEY]: [] };
    const second = await act(graph, thread, ViewLogic.articleReviewPayload(null, 'Tighten the closing.', 'send-back'));
    expect(second.type).toBe(CHECKPOINT_TYPES.ARTICLE);

    const [leftAlone] = sdk.calls('rework');
    const edits = block(leftAlone.prompt, 'HAND_EDITS');
    expect(edits).toContain("Each edit of the director's is final unless the structural change their note asks for means it no longer fits:");
    expect(edits.endsWith(`\n\n${LISTED}`)).toBe(true);
    expect(leftAlone.jsonSchema.properties).toHaveProperty(CHANGED_EDITS_KEY);
    expect(second.values.contentBundle.headline.main).toBe(MAP.headline);
    expect(second.values.contentBundle.sections.find((section) => section.id === 'closing').content[0].text).toBe('Riley kept the books.');
    expect(standing(second.values)).toEqual(LOCKED);
    expect(second.data.handEditReport).toEqual({ checked: ['E1', 'E2', 'E3', 'E4'], changed: [] });
    expect(marksOf(second.data)).toEqual([]);

    // Round 3: the note asks for a new headline. The rework writes one and says why.
    const renamed = bundleAsShown(second.values.contentBundle);
    renamed.headline.main = NEW_HEADLINE;
    sdk.reworkReturns = { ...renamed, [CHANGED_EDITS_KEY]: [{ id: 'E1', reason: 'The note asks for a headline that names the sale.' }] };
    const third = await act(graph, thread, ViewLogic.articleReviewPayload(null, 'Write a headline that names the sale.', 'send-back'));
    expect(third.type).toBe(CHECKPOINT_TYPES.ARTICLE);

    expect(third.values.contentBundle.headline.main).toBe(NEW_HEADLINE);
    expect(third.values.contentBundle.headline.deck).toBe(MAP.deck);
    expect(headingOf(third.values.contentBundle, 'theStory')).toBe('The Story');
    expect(third.data.handEditReport.changed).toEqual([
      expect.objectContaining({
        id: 'E1', pass: 'send-back', automatic: false, restored: false, director: MAP.headline, became: NEW_HEADLINE,
        reason: 'The note asks for a headline that names the sale.'
      })
    ]);
    // The desk shows the change beside the headline, with why.
    expect(marksOf(third.data)).toEqual([
      ['Your line', 'The headline', `Headline, main: your "${MAP.headline}" became "${NEW_HEADLINE}" (the rework of your send-back). Why: The note asks for a headline that names the sale.`]
    ]);
    // The judge that read the new article was listed the lines it still carries, and not the headline the rework replaced.
    const lastJudge = sdk.calls('judge').pop();
    expect(judgesApprovedLines(lastJudge.prompt)).toContain(`\n\n${LISTED.split('\n').slice(1).join('\n')}\n\n`);
    expect(lastJudge.prompt).not.toContain('E1 (headline, main)');
  });

  it('on a map where the director edited the headline, their headline is the line recorded there, as before, beside the lines they approved', async () => {
    const DIRECTORS_HEADLINE = 'Six Votes Said Overdose. The Ledger Said Sale.';
    const sdk = scriptedSdk();
    const left = clone(MAP);
    left.headline = DIRECTORS_HEADLINE;
    const { stop } = await toArticle(sdk, left);
    expect(stop.values.contentBundle.headline.main).toBe(DIRECTORS_HEADLINE);
    expect(standing(stop.values)).toEqual([['E1', 'headline.main', DIRECTORS_HEADLINE], ...LOCKED.slice(1)]);
    // Run 2i (R58): the judge is listed the director's headline among the director's edits, and the
    // three lines they approved after it, in the list of their own.
    const [judge] = sdk.calls('judge');
    const own = judge.prompt.indexOf("THE DIRECTOR'S EDITS (record: the director's own text");
    const approved = judge.prompt.indexOf('THE LINES THE DIRECTOR APPROVED ON THE MAP (final as approved):');
    expect(own).toBeGreaterThanOrEqual(0);
    expect(approved).toBeGreaterThan(own);
    expect(judge.prompt.slice(own, approved)).toContain(`\n\nE1 (headline, main): "${DIRECTORS_HEADLINE}"\n\n`);
    expect(judge.prompt.slice(approved, judge.prompt.indexOf('THE FACT CHECK ON THIS BUNDLE'))).toContain(`\n\n${LISTED.split('\n').slice(1).join('\n')}\n\n`);
  });
});
