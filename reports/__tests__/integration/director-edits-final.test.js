process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The director's edits are final, end to end through the REAL compiled graph (before
 * phase 4, F1; spec 2026-10-02 section 7). Session 0926262's shape, with synthetic data.
 *
 * On 0926262 the director edited the article and sent it back only to move photos.
 * After that send-back the article judge flagged two of the director's own edits as
 * must-fix (the rewritten closing stated Alex's motive as fact, T1; the cut paragraph
 * of open questions left a debated theory unreported, T2), and the automatic rework
 * changed both. Here the same judge findings arrive, and:
 *   - the verdict is ready, because both findings quote the director's text;
 *   - the findings reach the stop as concerns about the director's edits;
 *   - no automatic rework runs: the graph goes from the evaluation to the stop.
 *
 * The model calls go to a scripted mock routed by call label (no live model). The
 * checkpointer is a SqliteSaver on a temp file; the production database is never opened.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');

const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('../../lib/workflow/graph');
const { mocks } = require('../../lib/workflow/nodes');
const { getCheckpointData, buildResumePayload } = require('../../server.js');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');
const { DIRECTOR_EDIT_PREFIX, CHANGED_EDITS_KEY } = require('../../lib/hand-edit-diff');
const { evaluationView, steeringView } = require('../../console/checkpoint-view-logic');

const clone = (v) => JSON.parse(JSON.stringify(v));
const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });

const THEORY = 'The room also weighed whether Vic would replace Marcus, not kill him, and set it aside before the vote.';
const DIRECTORS_CLOSING = 'Alex wanted Marcus out of the company, and the January demand puts it in writing.';

/** The article as the writer first wrote it: three photos in a row in THE STORY. */
function writersArticle() {
  return {
    metadata: { sessionId: 'edits-test', theme: 'journalist', generatedAt: '2026-10-02T10:00:00.000Z' },
    headline: { main: 'Alex Reeves Pointed the Room at Jess Kane', kicker: 'NovaNews', deck: 'The room named Alex, five votes to four.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex had the scoreboard pulled up in the last minutes, and Jess said she was being framed.')] },
      {
        id: 'the-story', type: 'narrative', heading: 'The Story',
        content: [
          paragraph('Mel built the first theory around the fight and the fraud.'),
          photo('p1.jpg', 'Mel lays out the theory'),
          photo('p2.jpg', 'The two cards on the table'),
          photo('p3.jpg', 'Vic, Remi and Alex'),
          paragraph(THEORY),
          paragraph('Sarah pointed the room at the baby mama, and the vote followed.')
        ]
      },
      { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
    ]
  };
}

/** The director's version: the closing rewritten, the open questions cut. */
function directorsArticle() {
  const a = writersArticle();
  a.sections[2].content[0] = paragraph(DIRECTORS_CLOSING);
  a.sections[1].content.splice(4, 1);
  return a;
}

/** The send-back's rework: the photos spaced out, every one of the director's edits kept. */
function reworkedArticle() {
  const a = directorsArticle();
  const story = a.sections[1].content;
  // [Mel, p1, p2, p3, Sarah] -> [Mel, p1, Sarah, p2] and p3 moved to the closing
  a.sections[1].content = [story[0], story[1], story[4], story[2]];
  a.sections[2].content.push(story[3]);
  return { ...a, [CHANGED_EDITS_KEY]: [] };
}

const PASSING = {
  ready: true, structuralPassed: true, overallScore: 0.92,
  criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
};
const CLOSING_FINDING = `T1: "${DIRECTORS_CLOSING}" states Alex's motive as fact; the record holds only the January demand. Write it as the room's suspicion.`;
const THEORY_FINDING = 'T2: the debated theory "whether Vic would replace Marcus, not kill him" no longer appears. Report the alternative theories the room weighed.';
const FLAGS_THE_DIRECTORS_EDITS = {
  ready: false, structuralPassed: false, overallScore: 0.71,
  criteriaScores: {
    evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Attribute the motive.' },
    verdictTruth: { score: 0.4, type: 'structural', notes: 'A debated theory is unreported.', fix: 'Report it.' }
  },
  structuralIssues: [CLOSING_FINDING, THEORY_FINDING],
  advisoryWarnings: [],
  revisionGuidance: 'Step 1: attribute the motive. Step 2: report the theory.',
  confidence: 'high'
};

/** A scripted SDK: reworks by label, evaluations in order. Every call's options are kept. */
function scriptedSdk({ evaluations, revised }) {
  const calls = [];
  const sent = [];
  let evaluationIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    calls.push(label || 'evaluation');
    sent.push(options);
    if (/^(Outline|Article) revision/.test(label)) return clone(revised);
    if (/Evaluator/.test(options.systemPrompt || '')) {
      const answer = evaluations[Math.min(evaluationIndex, evaluations.length - 1)];
      evaluationIndex += 1;
      return clone(answer);
    }
    throw new Error(`scriptedSdk: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  sdk.sent = sent;
  return sdk;
}

describe('0926262\'s shape: the judge flags the director\'s edits after a send-back (F1)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-edits-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('the verdict is ready, the findings are concerns, and the graph routes to the stop with no automatic rework', async () => {
    const sdk = scriptedSdk({ evaluations: [PASSING, FLAGS_THE_DIRECTORS_EDITS], revised: reworkedArticle() });
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'edits-test', sessionId: 'edits-test', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const run = { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' };

    // The writer's article reaches the stop on a passing evaluation.
    await graph.updateState(thread, {
      theme: 'journalist',
      sessionId: 'edits-test',
      sessionConfig: { roster: ['Alex', 'Jess', 'Mel', 'Sarah'], reportingMode: 'on-site' },
      sessionPhotos: ['photos/p1.jpg', 'photos/p2.jpg', 'photos/p3.jpg'],
      contentBundle: writersArticle(),
      outlineApproved: true,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
    }, 'generateContentBundle');
    await graph.invoke(null, run);
    const atStop = await graph.getState(thread);
    expect(atStop.next).toEqual(['checkpointArticle']);

    // The director edits the closing, cuts the open questions, and sends the article
    // back only to move the photos.
    const { resume, stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Move the photos so that no two sit together. Keep my copy as it is.', articleEdits: directorsArticle() },
      atStop.values
    );
    expect(error).toBeNull();
    expect(stateUpdates._articleHandEdits.edits.map((e) => e.id)).toEqual(['E1', 'E2']);
    await graph.invoke(new Command({ resume, update: stateUpdates }), run);
    const next = await graph.getState(thread);

    // The send-back's rework ran, then one evaluation, then the stop: no automatic pass.
    expect(next.next).toEqual(['checkpointArticle']);
    expect(sdk.calls).toEqual(['evaluation', 'Article revision 0', 'evaluation']);
    expect(next.values.articleRevisionCount).toBe(0);

    // The rework was told the edits stand, and the judge saw which text is the director's.
    const reworkPrompt = sdk.sent[1].prompt;
    expect(reworkPrompt).toContain('<HAND_EDITS>');
    expect(reworkPrompt).toContain(`E2 (section "closing", paragraph): "${DIRECTORS_CLOSING}"`);
    expect(sdk.sent[2].prompt).toContain("THE DIRECTOR'S EDITS");
    expect(sdk.sent[2].prompt).toContain(`E1 (section "the-story", paragraph, cut): "${THEORY}"`);

    // The verdict: ready, nothing must-fix, both findings concerns under their edits' ids.
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.lastEvaluation.ready).toBe(true);
    expect(data.lastEvaluation.structuralIssues).toEqual([]);
    expect(data.lastEvaluation.advisoryWarnings).toEqual([
      `${DIRECTOR_EDIT_PREFIX}E2: ${CLOSING_FINDING}`,
      `${DIRECTOR_EDIT_PREFIX}E1: ${THEORY_FINDING}`
    ]);
    const view = evaluationView(data.lastEvaluation);
    expect(view.directorEditConcerns).toHaveLength(2);
    expect(view.advisoryWarnings).toEqual([]);

    // The stored article never carries the rework's list, and the report says every edit was kept.
    expect(next.values.contentBundle).not.toHaveProperty(CHANGED_EDITS_KEY);
    expect(data.handEditReport).toEqual({ checked: ['E1', 'E2'], changed: [] });
    expect(steeringView(data.handEditReport, []).keptCount).toBe(2);
    // The edits still stand for the next round.
    expect(next.values._articleHandEdits.edits.map((e) => e.id)).toEqual(['E1', 'E2']);
  });
});
