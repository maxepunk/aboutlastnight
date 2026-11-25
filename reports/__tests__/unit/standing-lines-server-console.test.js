process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The desk reads the server's own standing lines (phase 18, the final review's item 4).
 *
 * The article stop's payload says where each of the director's standing lines sits
 * (`standingLines`, server.js standingLinesOf), and the desk places a judge's concern that names a
 * line by its id and quotes nothing beside that line (console/checkpoint-view-logic.js
 * standingLinePlace, with its own patterns for the address). Each side is held to the address form
 * by literal strings in its own tests; this one feeds the console what the server produces. The
 * real stamp (ai-nodes.js stampFromMap) writes the map's headline, deck and headings into a draft
 * and records them as the article stop's standing edits; the server's getCheckpointData builds the
 * stop's payload from that state, and the desk places a concern for each line on its own piece:
 * the headline row for the headline and the line under it, a section's heading row for its heading.
 *
 * server.js is required without starting it (require.main guard); the database path is a temp
 * file (__tests__/setup/checkpoint-db-path.js). Invented names and text.
 */
const { getCheckpointData } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { _testing: { stampFromMap } } = require('../../lib/workflow/nodes/ai-nodes');
const { DIRECTOR_EDIT_PREFIX } = require('../../lib/hand-edit-diff');
const { deskMarks, deskMarksAt } = require('../../console/checkpoint-view-logic');

const paragraph = (text) => ({ type: 'paragraph', text });

/** The writer's first draft: its own headline, deck and headings, which the stamp replaces. */
const draft = () => ({
  headline: { main: 'A Quiet Vote in the Glass Room', deck: 'Seven guests and one account no one claimed.' },
  byline: { author: 'Nova', title: 'Independent Reporter' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph('Rowan Pike asked for the count before the lights came up.')] },
    { id: 'theStory', type: 'narrative', heading: 'What the Room Saw', content: [paragraph('Tess Arlen kept the ledger closed until the second round.')] },
    { id: 'followTheMoney', type: 'evidence-highlight', heading: 'Where It Went', content: [paragraph('Eleven sales reached one account in the last minutes of selling.')] },
    { id: 'closing', type: 'conclusion', heading: 'After', content: [paragraph('Whether the vote costs Rowan anything is still open.')] }
  ]
});

/** The story map as the director left it: its headline, deck and the headings it gives. */
const map = () => ({
  headline: 'Seven Guests Named Rowan Pike, and the Money Had Already Moved',
  deck: 'The vote came after the account had filled.',
  sections: [
    { slot: 'lede', heading: '', job: 'Opens on the vote.', beats: [], photos: [] },
    { slot: 'theStory', heading: 'The Second Round', job: 'Shows how the room reached Rowan.', beats: [], photos: [] },
    { slot: 'followTheMoney', heading: 'The Account Before the Vote', job: 'Shows the money moving first.', beats: [], photos: [] },
    { slot: 'closing', heading: 'What the Verdict Leaves', job: 'Asks what the vote costs.', beats: [], photos: [] }
  ],
  dropped: [],
  leftOut: [],
  expectedLength: 900,
  weaveChanges: []
});

describe("the desk places a concern by each standing line the server's payload names", () => {
  let payload;
  let stamped;
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const state = { theme: 'journalist', outline: map(), _outlineHandEdits: null };
    const { contentBundle, edits } = stampFromMap(draft(), state);
    stamped = contentBundle;
    payload = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, {
      ...state,
      contentBundle,
      _articleHandEdits: edits,
      evaluationHistory: []
    });
  });
  afterAll(() => jest.restoreAllMocks());

  it("the server's payload names the headline, the line under it and each heading the map gives", () => {
    const paths = payload.standingLines.map((line) => line.path).sort();
    expect(paths).toEqual([
      'headline.deck',
      'headline.main',
      'sections[#closing].heading',
      'sections[#followTheMoney].heading',
      'sections[#theStory].heading'
    ]);
    expect(new Set(payload.standingLines.map((line) => line.id)).size).toBe(payload.standingLines.length);
  });

  it('a concern for each line, by its id and with no quotation, sits on its own piece of the desk, and none is apart', () => {
    const concernFor = (line) => `${DIRECTOR_EDIT_PREFIX}${line.id}: T9: Concern number ${line.id} about this line.`;
    const marks = deskMarks({
      ...payload,
      factCheck: { findings: [] },
      handEditReport: null,
      lastEvaluation: { phase: 'article', ready: true, overallScore: 0.9, structuralIssues: [], advisoryWarnings: payload.standingLines.map(concernFor) }
    }, payload.contentBundle);
    const textOf = (line) => `Concern number ${line.id} about this line.`;

    expect(marks.apart).toEqual([]);
    expect(marks.resolved).toEqual([]);
    payload.standingLines.forEach((line) => {
      const heading = /^sections\[#([^\]]+)\]\.heading$/.exec(line.path);
      const anchor = heading
        ? { kind: 'heading', section: stamped.sections.findIndex((section) => section.id === heading[1]) }
        : { kind: 'headline' };
      expect(`${line.path}: ${deskMarksAt(marks, anchor).filter((m) => m.tone === 'concern').map((m) => m.text).includes(textOf(line))}`)
        .toBe(`${line.path}: true`);
    });
    // Each heading's concern sits on that heading alone.
    payload.standingLines.filter((line) => /\.heading$/.test(line.path)).forEach((line) => {
      const onHeadings = stamped.sections.map((_s, i) => deskMarksAt(marks, { kind: 'heading', section: i }).some((m) => m.text === textOf(line)));
      expect(onHeadings.filter(Boolean).length).toBe(1);
    });
  });
});
