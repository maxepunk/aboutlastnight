process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The writers' questions, end to end through the REAL compiled graph (phase 3, brief
 * 3.7; spec C15, R5).
 *
 * The brief's verification, without a model call: a thread with planted questions in
 * each output shows them at its stop, and they survive an automatic pass and a send
 * back; only a rework after the director's note drops one. Each run seeds a thread as if the writer had just produced its output
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

// Fix 3.7b: each question carries its kind; only a "player" question covers a player.
const Q_ZIA = { kind: 'player', about: 'Zia', question: 'The record holds nothing Zia did this morning: what did Zia do?' };
const Q_LEDGER = { kind: 'ledger', about: 'The 10:02 AM sale of $250,000 into Ember', question: 'Is this sale a duplicate entry?' };

// Phase 4 (brief 4.4): the arc writer's questions are the weave's own, each with an id
// and what its answer changes.
const W_ZIA = { id: 'q1', kind: 'player', about: 'Zia', question: Q_ZIA.question, changes: 'Whether Zia prints in the story.' };
const W_FIGURE = { id: 'q2', kind: 'figure', about: Q_LEDGER.about, question: Q_LEDGER.question, changes: "The money section's total." };
const WEAVE = {
  story: 'The room accused Vic, and the ledger tells another story.',
  question: 'Why Vic?',
  headline: 'The Room Named Vic',
  threads: [{ id: 't1', claim: 'The room accused Vic of the murder.', role: 'main-thread', receipt: 'ledger', verdict: true }],
  connections: [],
  convergence: 'The vote and the ledger meet at the end.',
  questions: [W_ZIA, W_FIGURE]
};

/**
 * A scripted SDK: each rework by its label returns the next of its scripted outputs
 * (then repeats the last); the evaluations by their system prompt, in order (the story
 * meeting's fact check is one, phase 4).
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
    if (/Evaluator|WEAVE fact check/.test(options.systemPrompt || '')) {
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

  // Phase 4 (brief 4.4): the weave carries the questions, and a player question no longer
  // covers a player at the arc stage, whose check counts no roster. The stop's payload is
  // the story meeting's (4.5).
  it('the arc stop: the weave\'s questions survive a send back whose rework returns no field', async () => {
    const { questions, ...withoutQuestions } = WEAVE;
    // The rework returns its weave and no questions field: the previous list is kept.
    const sdk = scriptedSdk({ reworks: [withoutQuestions], evaluations: [PASSING_EVALUATION] });

    const { graph, thread, snapshot } = await runToStop({
      sdk,
      asNode: 'analyzeArcs',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'], accusation: { verdictKind: 'culprit', accused: ['Vic'], charge: 'Murder' } },
        evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
        canonicalCharacters: { Vic: 'Vic Kingsley', Zia: 'Zia Bashir' },
        weave: clone(WEAVE)
      }
    });

    // The checks pass with no rework, and the fact check runs once.
    expect(snapshot.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['evaluation']);
    expect(snapshot.values.weave.questions).toEqual([W_ZIA, W_FIGURE]);

    const next = await sendBack(graph, thread, snapshot.values, { selectedArcs: false, arcFeedback: 'Lead with the ledger.' });
    expect(next.next).toEqual(['checkpointArcSelection']);
    expect(sdk.calls).toEqual(['evaluation', 'Arc revision 0', 'evaluation']);
    expect(next.values.weave.questions).toEqual([W_ZIA, W_FIGURE]);
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

  it('the outline stop: an automatic pass whose rework returns a shorter list drops nothing; only the director\'s note clears one', async () => {
    const base = require('../fixtures/mock-responses/outline.json');
    const Q_VIC = { kind: 'player', about: 'Vic', question: 'Did Vic leave the room before the vote?' };
    const withQuestions = { ...clone(base), writerQuestions: [Q_ZIA, Q_LEDGER] };
    const sdk = scriptedSdk({
      reworks: [
        { ...clone(base), writerQuestions: [Q_LEDGER, Q_VIC] },  // automatic: leaves Q_ZIA out, adds Q_VIC
        { ...clone(base), writerQuestions: [Q_LEDGER, Q_VIC] },  // the send back, after the note answers Zia
        { ...clone(base), writerQuestions: [] }                  // automatic, in the send back's round
      ],
      evaluations: [FAILING_EVALUATION, PASSING_EVALUATION, FAILING_EVALUATION, PASSING_EVALUATION]
    });

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

    // No note yet: the director has seen no question, so the pass keeps Q_ZIA.
    expect(snapshot.next).toEqual(['checkpointOutline']);
    expect(sdk.calls).toEqual(['evaluation', 'Outline revision 1', 'evaluation']);
    let data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, snapshot.values);
    expect(data.writerQuestions).toEqual([Q_ZIA, Q_LEDGER, Q_VIC]);

    // The note answers Zia and the send back's rework drops Q_ZIA. The automatic pass
    // after it returns an empty list and keeps the two the director has not seen answered.
    const next = await sendBack(graph, thread, snapshot.values, { outline: false, outlineFeedback: 'Zia sold the first memory at 10:02 AM.' });
    expect(next.next).toEqual(['checkpointOutline']);
    // A send back opens a new round, so the round's pass count starts again.
    expect(sdk.calls.slice(3)).toEqual(['Outline revision 0', 'evaluation', 'Outline revision 1', 'evaluation']);
    data = await getCheckpointData(CHECKPOINT_TYPES.OUTLINE, next.values);
    expect(data.writerQuestions).toEqual([Q_LEDGER, Q_VIC]);
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
