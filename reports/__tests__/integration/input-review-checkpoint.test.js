/**
 * input-review against REAL LangGraph (CODE-REVIEW B2, B8)
 *
 * The unit tests call checkpointInputReview with checkpoint-helpers mocked, so
 * they cannot show the two things the findings are actually about:
 *
 *   B8 — does the gate INTERRUPT at all? Its old skip condition
 *        (`sessionConfig.roster?.length > 0`) was satisfied by the parse that had
 *        just run two statements earlier inside the same node, so it never fired
 *        in any of the last five real sessions.
 *   B2 — does an APPROVE re-run the parse? LangGraph re-executes an interrupted
 *        node from its top on resume, and the interrupt used to sit at the bottom
 *        of parseRawInput, after three SDK calls and three file writes.
 *
 * So this wires the real node, the real routing function and the real
 * MemorySaver/interrupt machinery to a counting parse stub, and drives the whole
 * loop: pause, reject-with-corrections, re-parse, pause again, approve, finish.
 */

const { StateGraph, START, END, MemorySaver, Command } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES } = require('../../lib/workflow/state');
const { _testing: { routeAfterInputReview } } = require('../../lib/workflow/graph');
const { checkpointInputReview } = require('../../lib/workflow/nodes/checkpoint-nodes');

/** A parse stub with parseRawInput's real skip condition and corrections handling. */
function makeParseStub() {
  const calls = [];
  const node = async (state) => {
    if (state.sessionConfig && Object.keys(state.sessionConfig).length > 0) {
      return { currentPhase: PHASES.LOAD_DIRECTOR_NOTES };
    }
    calls.push(state._inputCorrections || null);
    return {
      sessionConfig: { roster: ['Vic'], accusation: { accused: ['Blake'] } },
      directorNotes: { rawProse: 'They circled each other all morning.' },
      playerFocus: { primaryInvestigation: 'Who buried the ledger?' },
      _inputCorrections: null,
      currentPhase: PHASES.REVIEW_INPUT
    };
  };
  return { node, calls };
}

function buildGraph(parseNode) {
  const builder = new StateGraph(ReportStateAnnotation);
  builder.addNode('parseRawInput', parseNode);
  builder.addNode('checkpointInputReview', checkpointInputReview);
  builder.addNode('finalizeInput', async () => ({ currentPhase: PHASES.COMPLETE }));
  builder.addEdge(START, 'parseRawInput');
  builder.addEdge('parseRawInput', 'checkpointInputReview');
  builder.addConditionalEdges('checkpointInputReview', routeAfterInputReview, {
    reparse: 'parseRawInput',
    forward: 'finalizeInput'
  });
  builder.addEdge('finalizeInput', END);
  return builder.compile({ checkpointer: new MemorySaver() });
}

const interruptOf = (graphState) =>
  graphState.tasks?.find(t => t.interrupts?.length > 0)?.interrupts?.[0]?.value || null;

describe('input-review gate, real interrupt machinery', () => {
  let parse;
  let graph;
  let config;

  beforeEach(() => {
    parse = makeParseStub();
    graph = buildGraph(parse.node);
    config = { configurable: { thread_id: `input-review-${Date.now()}-${Math.random()}` } };
  });

  it('B8: actually pauses after the parse, with the parsed input in the payload', async () => {
    await graph.invoke({ rawSessionInput: { roster: ['Vic'] } }, config);

    const payload = interruptOf(await graph.getState(config));
    expect(payload).not.toBeNull();
    expect(payload.type).toBe('input-review');
    expect(payload.sessionConfig.roster).toEqual(['Vic']);
    expect(payload.directorNotes).toBeDefined();
    expect(payload.playerFocus).toBeDefined();
    expect(payload).toHaveProperty('canonicalCharacters');
    expect(parse.calls).toHaveLength(1);
  });

  it('a reject re-parses exactly once, and the re-parse SEES the corrections', async () => {
    await graph.invoke({ rawSessionInput: { roster: ['Vic'] } }, config);
    await graph.invoke(
      new Command({ resume: { approved: false, feedback: 'Blake said the dead-man line, not Casper' } }),
      config
    );

    const state = await graph.getState(config);
    expect(interruptOf(state)).not.toBeNull();          // pauses again on the NEW parse
    expect(parse.calls).toEqual([null, 'Blake said the dead-man line, not Casper']);
    expect(state.values._inputCorrections).toBeNull();  // consumed, so the loop terminates
  });

  it('B2: an approve runs to the end WITHOUT re-running the parse', async () => {
    await graph.invoke({ rawSessionInput: { roster: ['Vic'] } }, config);
    const before = parse.calls.length;

    const result = await graph.invoke(new Command({ resume: { approved: true } }), config);

    expect(result.currentPhase).toBe(PHASES.COMPLETE);
    expect(result.inputReviewApproved).toBe(true);
    expect(parse.calls).toHaveLength(before);
    expect(interruptOf(await graph.getState(config))).toBeNull();
  });

  it('a second run on an approved session does not pause again', async () => {
    await graph.invoke({ rawSessionInput: { roster: ['Vic'] } }, config);
    await graph.invoke(new Command({ resume: { approved: true } }), config);

    // /resume re-invokes at the current state; the gate must stay shut.
    const result = await graph.invoke(null, config);
    expect(interruptOf(await graph.getState(config))).toBeNull();
    expect(result.inputReviewApproved).toBe(true);
  });
});
