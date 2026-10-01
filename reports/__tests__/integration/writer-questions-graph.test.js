process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The writers' questions, end to end through the REAL compiled graph (phase 3, brief
 * 3.7; spec C15, R5).
 *
 * The brief's verification, without a model call: a thread with planted questions in
 * each output shows them at its stop, and they survive an automatic pass and a send
 * back. Each run seeds a thread as if the writer had just produced its output
 * (`updateState(..., asNode)`), invokes the real graph, and lets the real check,
 * evaluator, increment, reworker and router run until the real stop interrupts. The
 * model calls go to a scripted mock routed by call label; the checkpointer is a
 * SqliteSaver on a temp file, as in trace-automatic-pass.test.js.
 *
 * The click-through in the console is the gate's: it covers the panel's wiring.
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
const { writerQuestionsView } = require('../../console/checkpoint-view-logic');

const clone = (v) => JSON.parse(JSON.stringify(v));

const PASSING_EVALUATION = {
  ready: true, structuralPassed: true, overallScore: 0.9,
  criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
};
const FAILING_EVALUATION = {
  ready: false, structuralPassed: false, overallScore: 0.5,
  criteriaScores: {}, structuralIssues: ['The LEDE names no roster member.'], advisoryWarnings: [],
  revisionGuidance: 'Name a roster member in the LEDE.', confidence: 'high'
};

const Q_ZIA = { about: 'Zia', question: 'The record holds nothing Zia did this morning: what did Zia do?' };
const Q_LEDGER = { about: 'The 10:02 AM sale of $250,000 into Ember', question: 'Is this sale a duplicate entry?' };

/**
 * A scripted SDK: each rework by its label returns the next of its scripted outputs
 * (then repeats the last); the evaluations by their system prompt, in order.
 */
function scriptedSdk({ reworks, evaluations }) {
  const calls = [];
  let reworkIndex = 0;
  let evaluationIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    calls.push(label || 'evaluation');
    if (/^(Arc|Outline|Article) revision/.test(label)) {
      const answer = reworks[Math.min(reworkIndex, reworks.length - 1)];
      reworkIndex += 1;
      return clone(answer);
    }
    if (/Evaluator/.test(options.systemPrompt || '')) {
      const answer = evaluations[Math.min(evaluationIndex, evaluations.length - 1)];
      evaluationIndex += 1;
      return clone(answer);
    }
    throw new Error(`scriptedSdk: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  return sdk;
}

function bundle(questions) {
  return {
    metadata: { sessionId: 'questions-test', theme: 'journalist', generatedAt: '2026-10-01T10:00:00.000Z' },
    headline: { main: 'The Room Voted, The Ledger Disagreed' },
    sections: [{
      id: 'opening',
      type: 'narrative',
      content: [{ type: 'paragraph', text: 'Vic walked in at nine, and Zia sold at ten.' }]
    }],
    ...(questions && { writerQuestions: questions })
  };
}

describe("the writers' questions through the real graph (phase 3, brief 3.7)", () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-questions-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  async function runToStop({ sdk, asNode, values }) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'questions-test',
        sessionId: 'questions-test',
        theme: 'journalist',
        sdkClient: sdk,
        promptBuilder: mocks.createMockPromptBuilder(),
        dataDir: dir
      }
    };
    await graph.updateState(thread, { theme: 'journalist', sessionId: 'questions-test', ...values }, asNode);
    await graph.invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    return { graph, thread, snapshot: await graph.getState(thread) };
  }

  async function sendBack(graph, thread, values, approvals) {
    const { resume, stateUpdates, error } = buildResumePayload(approvals, values);
    expect(error).toBeNull();
    await graph.invoke(new Command({ resume, update: stateUpdates }), { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    return graph.getState(thread);
  }

  it('the arc stop: a questioned player passes the check, and the questions survive a send back', async () => {
    const arcs = [{
      id: 'arc-verdict', title: 'The verdict', summary: 'The room accused Vic.', arcSource: 'accusation',
      keyEvidence: [], characterPlacements: { Vic: 'accused' }, evidenceStrength: 'moderate',
      playerEmphasis: 'high', storyRelevance: 'critical'
    }];
    // The rework returns its arcs and no questions field: the previous list is kept.
    const sdk = scriptedSdk({ reworks: [{ narrativeArcs: arcs, synthesisNotes: 's' }], evaluations: [PASSING_EVALUATION] });

    const { graph, thread, snapshot } = await runToStop({
      sdk,
      asNode: 'analyzeArcs',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'], accusation: { verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder' } },
        evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
        canonicalCharacters: { Vic: 'Vic Kingsley', Zia: 'Zia Bashir' },
        narrativeArcs: arcs,
        _arcAnalysisCache: { synthesisNotes: 's', interweavingPlan: {}, writerQuestions: [Q_ZIA, Q_LEDGER] }
      }
    });

    // Zia is placed nowhere, and the question about Zia covers Zia: no rework, one evaluation.
    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['evaluation']);
    expect(snapshot.values._arcValidation.rosterCoveredByQuestion).toEqual(['Zia']);
    let data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, snapshot.values);
    expect(data.writerQuestions).toEqual([Q_ZIA, Q_LEDGER]);
    expect(writerQuestionsView(data.writerQuestions).items.map((i) => i.about)).toEqual(['Zia', Q_LEDGER.about]);

    const next = await sendBack(graph, thread, snapshot.values, { selectedArcs: false, arcFeedback: 'Lead with the ledger.' });
    expect(next.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['evaluation', 'Arc revision 0', 'evaluation']);
    data = await getCheckpointData(CHECKPOINT_TYPES.ARC_SELECTION, next.values);
    expect(data.writerQuestions).toEqual([Q_ZIA, Q_LEDGER]);
  });

  it('the outline stop: the questions survive an automatic pass and a send back, and clear when answered', async () => {
    const base = require('../fixtures/mock-responses/outline.json');
    const withQuestions = { ...clone(base), writerQuestions: [Q_ZIA, Q_LEDGER] };
    const reworked = clone(base);                               // no questions field
    const answered = { ...clone(base), writerQuestions: [Q_LEDGER] };
    const sdk = scriptedSdk({ reworks: [reworked, answered], evaluations: [FAILING_EVALUATION, PASSING_EVALUATION] });

    const { graph, thread, snapshot } = await runToStop({
      sdk,
      asNode: 'generateOutline',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'] },
        outline: withQuestions,
        selectedArcs: ['a1'],
        evaluationHistory: [{ phase: 'arcs', ready: true }]
      }
    });

    // The automatic pass returned no questions field: the stop still shows both.
    expect(snapshot.next).toEqual(['checkpointOutline']);
    expect(sdk.calls).toEqual(['evaluation', 'Outline revision 1', 'evaluation']);
    let data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, snapshot.values);
    expect(data.writerQuestions).toEqual([Q_ZIA, Q_LEDGER]);
    // The trace shows what the pass changed, and the questions are not a scope.
    expect(data.trace[0].changedScopes).toEqual([]);

    // The director answers the question about Zia in the note; the rework drops it.
    const next = await sendBack(graph, thread, snapshot.values, { outline: false, outlineFeedback: 'Zia sold the first memory at 10:02 AM.' });
    expect(next.next).toEqual(['checkpointOutline']);
    data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, next.values);
    expect(data.writerQuestions).toEqual([Q_LEDGER]);
  });

  it('the article stop: the questions survive a send back whose rework returns no field', async () => {
    const sdk = scriptedSdk({ reworks: [bundle(null)], evaluations: [PASSING_EVALUATION] });

    const { graph, thread, snapshot } = await runToStop({
      sdk,
      asNode: 'generateContentBundle',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'] },
        contentBundle: bundle([Q_LEDGER]),
        outlineApproved: true,
        evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
      }
    });
    expect(snapshot.next).toEqual(['checkpointArticle']);
    let data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, snapshot.values);
    expect(data.writerQuestions).toEqual([Q_LEDGER]);
    expect(data.htmlPreview || '').not.toContain(Q_LEDGER.question);

    const next = await sendBack(graph, thread, snapshot.values, { article: false, articleFeedback: 'Tighten the opening.' });
    expect(next.next).toEqual(['checkpointArticle']);
    data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.writerQuestions).toEqual([Q_LEDGER]);
  });
});
