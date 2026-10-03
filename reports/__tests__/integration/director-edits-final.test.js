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
  let reworkIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    calls.push(label || 'evaluation');
    sent.push(options);
    if (/^(Outline|Article) revision/.test(label)) {
      const output = Array.isArray(revised) ? revised[Math.min(reworkIndex, revised.length - 1)] : revised;
      reworkIndex += 1;
      return clone(output);
    }
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

  // Fix round 1, finding 1: a mixed verdict (one finding on the director's closing, one
  // on the writer's line) sends the article to an automatic pass. That pass reads the
  // writer's must-fix items and no fix located in the director's text: not the truth
  // criterion the guard released, and not the judge's guidance about the closing.
  it('after a mixed verdict, the automatic pass reads no fix located in the director\'s text', async () => {
    const WRITERS_LINE = 'Sarah pointed the room at the baby mama, and the vote followed.';
    const WRITER_FINDING = `T12: "${WRITERS_LINE}" puts the line in Sarah's mouth; no document or note gives it to her. Cut it.`;
    const MIXED = {
      ready: false, structuralPassed: false, overallScore: 0.7,
      criteriaScores: {
        evidenceTruth: { score: 0.3, type: 'structural', notes: 'The closing states a motive as fact.', fix: 'Rewrite the closing as the room\'s suspicion.' },
        wordsTruth: { score: 0.4, type: 'structural', notes: `"${WRITERS_LINE}" is in no document.`, fix: 'Cut the line.' }
      },
      structuralIssues: [CLOSING_FINDING, WRITER_FINDING],
      advisoryWarnings: [],
      revisionGuidance: 'Step 1: write the closing as the room\'s suspicion. Step 2: cut the line about the vote.',
      confidence: 'high'
    };
    const sdk = scriptedSdk({ evaluations: [PASSING, MIXED, PASSING], revised: reworkedArticle() });
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'edits-mixed', sessionId: 'edits-mixed', theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const run = { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' };

    await graph.updateState(thread, {
      theme: 'journalist',
      sessionId: 'edits-mixed',
      sessionConfig: { roster: ['Alex', 'Jess', 'Mel', 'Sarah'], reportingMode: 'on-site' },
      sessionPhotos: ['photos/p1.jpg', 'photos/p2.jpg', 'photos/p3.jpg'],
      contentBundle: writersArticle(),
      outlineApproved: true,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
    }, 'generateContentBundle');
    await graph.invoke(null, run);
    const atStop = await graph.getState(thread);
    const { resume, stateUpdates } = buildResumePayload(
      { article: false, articleFeedback: 'Move the photos so that no two sit together. Keep my copy as it is.', articleEdits: directorsArticle() },
      atStop.values
    );
    await graph.invoke(new Command({ resume, update: stateUpdates }), run);
    const next = await graph.getState(thread);

    // The send-back's rework, the mixed verdict, one automatic pass, then the stop.
    expect(sdk.calls).toEqual(['evaluation', 'Article revision 0', 'evaluation', 'Article revision 1', 'evaluation']);
    expect(next.next).toEqual(['checkpointArticle']);

    const automaticPass = sdk.sent[3].prompt;
    const evaluation = automaticPass.slice(automaticPass.indexOf('EVALUATION SUMMARY'), automaticPass.indexOf('<HAND_EDITS>'));
    expect(evaluation).toContain(WRITER_FINDING);
    expect(evaluation).toContain('fix: Cut the line.');
    expect(evaluation).not.toContain(DIRECTORS_CLOSING);
    expect(evaluation).not.toContain('closing');
    // The pass is told the director's closing stands.
    expect(automaticPass).toContain(`E2 (section "closing", paragraph): "${DIRECTORS_CLOSING}"`);
  });
});

// FA (requirement 14): 0926262's real shape, with invented text. The director rewrote the
// closing to state a motive, and rewrote WHAT'S MISSING, dropping the one sentence that
// named a debated theory (a rewrite, not a cut). After the send-back's rework the judge
// filed a T1 issue and a T2 issue, each quoting a heading or the writer's insertion point
// beside the director's text, and a truth criterion whose notes quote both. F1 kept the
// T2 issue structural and handed the criterion's fix to the automatic pass (final review,
// findings 1 and 2).
describe('0926262\'s real shape: findings that quote the director\'s text beside the writer\'s (FA)', () => {
  const HEADING = 'The Story: Eight Minutes';
  const INSERTION = 'someone floated self-defense before the vote';
  const SARAH = `Sarah pointed the room at the baby mama, and ${INSERTION}.`;
  const THEORY_SENTENCE = 'And the Kowalski theory Mel called boring is still open: the IOU names a man nobody could place.';
  const OPEN_WRITERS = `Nobody asked who signed the transfer. ${THEORY_SENTENCE} The vote went ahead anyway.`;
  const OPEN_DIRECTORS = 'Nobody asked who signed the transfer. The vote went ahead anyway.';
  const CLOSING = 'Alex wanted Marcus out of the company, and the January demand puts it in writing.';
  const MEL = 'Mel built the first theory around the fight and the fraud.';

  const writers = () => ({
    metadata: { sessionId: 'edits-real', theme: 'journalist', generatedAt: '2026-10-02T10:00:00.000Z' },
    headline: { main: 'Alex Reeves Pointed the Room at Jess Kane', kicker: 'NovaNews', deck: 'The room named Alex, five votes to four.' },
    sections: [
      { id: 'lede', type: 'narrative', content: [paragraph('Alex had the scoreboard pulled up in the last minutes, and Jess said she was being framed.')] },
      {
        id: 'the-story', type: 'narrative', heading: HEADING,
        content: [paragraph(MEL), photo('p1.jpg', 'Mel lays out the theory'), photo('p2.jpg', 'The two cards on the table'), photo('p3.jpg', 'Vic, Remi and Alex'), paragraph(SARAH)]
      },
      { id: 'whats-missing', type: 'narrative', heading: "What's Missing", content: [paragraph(OPEN_WRITERS)] },
      { id: 'closing', type: 'narrative', heading: 'Closing', content: [paragraph('Whether the verdict costs Alex anything is still open.')] }
    ]
  });
  const directors = () => {
    const a = writers();
    a.sections[2].content[0] = paragraph(OPEN_DIRECTORS);
    a.sections[3].content[0] = paragraph(CLOSING);
    return a;
  };
  /** The send-back's rework: the photos spaced out, the director's copy kept. */
  const reworked = () => {
    const a = directors();
    const story = a.sections[1].content;
    a.sections[1].content = [story[0], story[1], story[4], story[2]];
    a.sections[3].content.push(story[3]);
    return a;
  };

  const T1 = `T1: the closing "${CLOSING}" states Alex's motive as fact; in "${HEADING}" the room only weighed it. Write it as Nova's suspicion.`;
  const T2 = `T2: the debated theory "the Kowalski theory Mel called boring is still open" is no longer reported. Report it in "${HEADING}" after "${INSERTION}".`;
  const CRITERIA = {
    evidenceTruth: {
      score: 0.6, type: 'structural',
      notes: `The closing "${CLOSING}" states a motive as fact. The lesser points, "${MEL.slice(0, -1)}", are acceptable.`,
      fix: 'Rewrite the closing sentence as Nova\'s suspicion.'
    },
    verdictTruth: { score: 0.5, type: 'structural', notes: 'A debated theory is unreported.', fix: 'Report the Kowalski theory.' }
  };
  const FLAGS_THE_DIRECTOR = {
    ready: false, structuralPassed: false, overallScore: 0.7, criteriaScores: CRITERIA,
    structuralIssues: [T1, T2], advisoryWarnings: [],
    revisionGuidance: 'Step 1: rewrite the closing sentence. Step 2: report the theory.', confidence: 'high'
  };

  let dir;
  let saver;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-edits-real-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  /** The writer's article at the stop, then the director's send-back, then the run to the next stop. */
  async function sendBackAndRun(threadId, sdk) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: threadId, sessionId: threadId, theme: 'journalist',
        sdkClient: sdk, promptBuilder: mocks.createMockPromptBuilder(), dataDir: dir
      }
    };
    const run = { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' };
    await graph.updateState(thread, {
      theme: 'journalist',
      sessionId: threadId,
      sessionConfig: { roster: ['Alex', 'Jess', 'Mel', 'Sarah'], reportingMode: 'on-site' },
      sessionPhotos: ['photos/p1.jpg', 'photos/p2.jpg', 'photos/p3.jpg'],
      contentBundle: writers(),
      outlineApproved: true,
      evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
    }, 'generateContentBundle');
    await graph.invoke(null, run);
    const atStop = await graph.getState(thread);
    expect(atStop.next).toEqual(['checkpointArticle']);
    const { resume, stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Move the photos so that no two sit together. Keep my copy as it is.', articleEdits: directors() },
      atStop.values
    );
    expect(error).toBeNull();
    await graph.invoke(new Command({ resume, update: stateUpdates }), run);
    return graph.getState(thread);
  }

  it('both findings become concerns, the criterion\'s fix reaches no rework, and no automatic pass runs', async () => {
    const sdk = scriptedSdk({ evaluations: [PASSING, FLAGS_THE_DIRECTOR], revised: { ...reworked(), [CHANGED_EDITS_KEY]: [] } });
    const next = await sendBackAndRun('edits-real', sdk);

    expect(next.values._articleHandEdits.edits.map((e) => [e.id, e.path, e.removed])).toEqual([
      ['E1', 'sections[#whats-missing].content[0].text', [THEORY_SENTENCE]],
      ['E2', 'sections[#closing].content[0].text', ['Whether the verdict costs Alex anything is still open.']]
    ]);
    // The judge read the removed sentence under its edit.
    expect(sdk.sent[2].prompt).toContain(`E1 (section "whats-missing", paragraph): "${OPEN_DIRECTORS}"\n  removed: "${THEORY_SENTENCE}"`);

    expect(sdk.calls).toEqual(['evaluation', 'Article revision 0', 'evaluation']);
    expect(next.next).toEqual(['checkpointArticle']);
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.lastEvaluation.ready).toBe(true);
    expect(data.lastEvaluation.structuralIssues).toEqual([]);
    expect(data.lastEvaluation.advisoryWarnings).toEqual([`${DIRECTOR_EDIT_PREFIX}E2: ${T1}`, `${DIRECTOR_EDIT_PREFIX}E1: ${T2}`]);
    expect(next.values.validationResults.criteriaScores).toEqual({
      evidenceTruth: { score: 0.6, type: 'structural' },
      verdictTruth: { score: 0.5, type: 'structural' }
    });
    expect(JSON.stringify(next.values.validationResults)).not.toContain('Rewrite the closing sentence');
    expect(JSON.stringify(next.values.validationResults)).not.toContain('Kowalski');
  });

  it('an automatic pass on another must-fix that changes the director\'s closing has it put back, and the report says so', async () => {
    const WRITER_ISSUE = 'T12: "Jess said she was being framed" puts words in her mouth that no document gives her. Attribute the line or cut it.';
    const MIXED = { ...FLAGS_THE_DIRECTOR, structuralIssues: [T1, T2, WRITER_ISSUE] };
    const automatic = reworked();
    automatic.sections[0].content[0] = paragraph('Alex had the scoreboard pulled up in the last minutes.');
    automatic.sections[3].content[0] = paragraph('Alex may have wanted Marcus out of the company.');
    const sdk = scriptedSdk({ evaluations: [PASSING, MIXED, PASSING], revised: [{ ...reworked(), [CHANGED_EDITS_KEY]: [] }, automatic] });
    const next = await sendBackAndRun('edits-real-auto', sdk);

    expect(sdk.calls).toEqual(['evaluation', 'Article revision 0', 'evaluation', 'Article revision 1', 'evaluation']);
    const automaticPass = sdk.sent[3].prompt;
    const evaluation = automaticPass.slice(automaticPass.indexOf('EVALUATION SUMMARY'), automaticPass.indexOf('<HAND_EDITS>'));
    expect(evaluation).toContain(WRITER_ISSUE);
    expect(evaluation).not.toContain('Rewrite the closing sentence');
    expect(evaluation).not.toContain(CLOSING);
    expect(evaluation).not.toContain('Kowalski');

    // The pass fixed the writer's line, and code put the director's closing back.
    expect(next.values.contentBundle.sections[3].content[0]).toEqual(paragraph(CLOSING));
    expect(next.values.contentBundle.sections[0].content[0]).toEqual(paragraph('Alex had the scoreboard pulled up in the last minutes.'));
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.handEditReport.changed).toEqual([expect.objectContaining({
      id: 'E2', pass: 1, automatic: true, restored: true, director: CLOSING, became: 'Alex may have wanted Marcus out of the company.'
    })]);
    expect(steeringView(data.handEditReport, []).changedEdits).toEqual([expect.objectContaining({ id: 'E2', automatic: true })]);
  });
});
