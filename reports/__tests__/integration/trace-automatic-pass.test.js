process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * The trace, end to end through the REAL compiled graph (phase 2, brief 2.7).
 *
 * The brief's verification: a unit-level run through an automatic pass with the
 * mocked SDK. Each run seeds a thread as if the writer had just produced its output
 * (`updateState(..., asNode)`), invokes the real graph, and lets the real evaluator,
 * increment, reworker and router run until the real stop interrupts. The model calls
 * go to a scripted mock routed by call label (no live model). The checkpointer is a
 * SqliteSaver on a temp file, the kind the server runs on, so what reaches the stop
 * is what a saved checkpoint holds; the production database is never opened.
 *
 * This is also where an undeclared channel would show: LangGraph drops a write to a
 * key that is not an Annotation, and a unit test of the increment alone cannot see it.
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
const { traceView } = require('../../console/checkpoint-view-logic');

const PASSING_EVALUATION = {
  ready: true, structuralPassed: true, overallScore: 0.9,
  criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], revisionGuidance: '', confidence: 'high'
};

/**
 * A scripted SDK: the reworks by their labels, the evaluations by their system
 * prompt. `evaluations` is consumed in order, then repeats its last answer. Each
 * rework's prompt is kept by its label (`sdk.reworkPrompts`).
 */
function scriptedSdk({ revised, evaluations }) {
  const calls = [];
  const reworkPrompts = {};
  let evaluationIndex = 0;
  const sdk = async (options) => {
    const label = options.label || '';
    calls.push(label || 'evaluation');
    if (/^(Outline|Article) revision/.test(label)) {
      reworkPrompts[label] = options.prompt || '';
      return JSON.parse(JSON.stringify(revised));
    }
    // Brief 4.7a: the article judge, by its identity line.
    if (/ARTICLE judge/.test(options.systemPrompt || '')) {
      const answer = evaluations[Math.min(evaluationIndex, evaluations.length - 1)];
      evaluationIndex += 1;
      return JSON.parse(JSON.stringify(answer));
    }
    throw new Error(`scriptedSdk: unexpected call ${label || (options.systemPrompt || '').slice(0, 60)}`);
  };
  sdk.calls = calls;
  sdk.reworkPrompts = reworkPrompts;
  return sdk;
}

function bundle(extraParagraph) {
  return {
    metadata: { sessionId: 'trace-test', theme: 'journalist', generatedAt: '2026-09-26T10:00:00.000Z' },
    headline: { main: 'The Room Voted, The Ledger Disagreed' },
    sections: [{
      id: 'opening',
      type: 'narrative',
      content: [
        { type: 'paragraph', text: 'Vic walked in at nine and left with the room convinced.' },
        ...(extraParagraph ? [{ type: 'paragraph', text: extraParagraph }] : [])
      ]
    }]
  };
}

describe('the trace through the real graph (phase 2, brief 2.7)', () => {
  let dir;
  let saver;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-trace-'));
    saver = SqliteSaver.fromConnString(path.join(dir, 'checkpoints.sqlite'));
  });

  afterEach(() => {
    saver.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  async function runToStop({ sdk, asNode, values }) {
    const graph = createReportGraphWithCheckpointer(saver);
    const thread = {
      configurable: {
        thread_id: 'trace-test',
        sessionId: 'trace-test',
        theme: 'journalist',
        sdkClient: sdk,
        promptBuilder: mocks.createMockPromptBuilder(),
        dataDir: dir
      }
    };
    await graph.updateState(thread, { theme: 'journalist', sessionId: 'trace-test', ...values }, asNode);
    await graph.invoke(null, { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    return { graph, thread, snapshot: await graph.getState(thread) };
  }

  it('an article pass the check triggered reaches the stop: trigger, findings and what it changed', async () => {
    const before = bundle(null);   // names Vic but never Zia: the roster check fails
    const after = bundle('Zia said nothing all night, and her account moved the most money.');
    const sdk = scriptedSdk({ revised: after, evaluations: [PASSING_EVALUATION] });

    const { snapshot } = await runToStop({
      sdk,
      asNode: 'generateContentBundle',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'] },
        contentBundle: before,
        outlineApproved: true,
        evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
      }
    });

    // Paused at the article stop after exactly one automatic pass: the check failed
    // (no model call), the rework ran, then the evaluation passed.
    expect(snapshot.next).toEqual(['checkpointArticle']);
    expect(sdk.calls).toEqual(['Article revision 1', 'evaluation']);
    expect(snapshot.values.articleRevisionCount).toBe(1);

    // The channel survived LangGraph: declared, written by the increment, not cleared
    // by the reworker, and holding the version the pass started from.
    const channel = snapshot.values._articleTrace;
    expect(channel).toHaveLength(1);
    expect(channel[0]).toEqual(expect.objectContaining({ pass: 1, round: 1, trigger: 'check', before }));
    expect(channel[0].findings.structuralIssues).toEqual([expect.stringMatching(/^Roster coverage gap: Zia/)]);
    // ...while validationResults now holds the passing evaluation that overwrote it.
    expect(snapshot.values.validationResults.passed).toBe(true);

    // The stop's payload: the pass with its diff, and no whole versions.
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, snapshot.values);
    expect(data.trace).toHaveLength(1);
    expect(data.trace[0]).not.toHaveProperty('before');
    expect(data.trace[0].changedScopes).toEqual(['section:opening']);
    expect(data.trace[0].diff.scopes[0].changes).toEqual([{
      path: 'sections[#opening].content[1]',
      before: null,
      after: { type: 'paragraph', text: 'Zia said nothing all night, and her account moved the most money.' }
    }]);

    // The panel names the trigger and the finding, and lists what changed.
    const [pass] = traceView(data.trace).passes;
    expect(pass.triggerLabel).toBe('Why it ran: the check failed.');
    expect(pass.mustFix.label).toBe('Must fix (1)');
    expect(pass.mustFix.items[0]).toMatch(/^Roster coverage gap: Zia/);
    expect(pass.changed.text).toBe('What changed: Section "opening"');
  });

  it('a send back opens a round with an empty trace, and its own rework adds no entry', async () => {
    const before = bundle(null);
    const after = bundle('Zia said nothing all night, and her account moved the most money.');
    const sdk = scriptedSdk({ revised: after, evaluations: [PASSING_EVALUATION] });
    const { graph, thread, snapshot } = await runToStop({
      sdk,
      asNode: 'generateContentBundle',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'] },
        contentBundle: before,
        outlineApproved: true,
        evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
      }
    });
    expect(snapshot.values._articleTrace).toHaveLength(1);

    // The director sends it back, through the server's own payload builder.
    const { resume, stateUpdates, error } = buildResumePayload(
      { article: false, articleFeedback: 'Say where Zia was when the vote happened.' },
      snapshot.values
    );
    expect(error).toBeNull();
    await graph.invoke(new Command({ resume, update: stateUpdates }), { ...thread, recursionLimit: RECURSION_LIMIT, durability: 'sync' });
    const next = await graph.getState(thread);

    expect(next.next).toEqual(['checkpointArticle']);
    expect(next.values.humanArticleRevisionCount).toBe(1);
    expect(next.values.articleRevisionCount).toBe(0);
    expect(next.values._articleTrace).toBeNull();
    const data = await getCheckpointData(CHECKPOINT_TYPES.ARTICLE, next.values);
    expect(data.trace).toEqual([]);
    expect(traceView(data.trace).any).toBe(false);
  });

  it('one pass adds about the size of the version it started from to every later saved checkpoint', async () => {
    const before = bundle(null);
    const after = bundle('Zia said nothing all night, and her account moved the most money.');
    const { thread } = await runToStop({
      sdk: scriptedSdk({ revised: after, evaluations: [PASSING_EVALUATION] }),
      asNode: 'generateContentBundle',
      values: {
        sessionConfig: { roster: ['Vic', 'Zia'] },
        contentBundle: before,
        outlineApproved: true,
        evaluationHistory: [{ phase: 'arcs', ready: true }, { phase: 'outline', ready: true }]
      }
    });

    // The saved checkpoint at the stop, serialized as SqliteSaver stores it, with and
    // without the trace channel: the difference is what the pass costs each row.
    const { checkpoint } = await saver.getTuple(thread);
    const [, withTrace] = await saver.serde.dumpsTyped(checkpoint);
    const channelValues = { ...checkpoint.channel_values };
    const entry = channelValues._articleTrace[0];
    delete channelValues._articleTrace;
    const [, withoutTrace] = await saver.serde.dumpsTyped({ ...checkpoint, channel_values: channelValues });
    const added = withTrace.length - withoutTrace.length;

    const beforeBytes = Buffer.byteLength(JSON.stringify(before));
    const entryBytes = Buffer.byteLength(JSON.stringify(entry));
    expect(added).toBeGreaterThanOrEqual(beforeBytes);        // the whole starting version is kept
    expect(added).toBeLessThanOrEqual(entryBytes + 64);       // plus the findings, and little else
  });
});
