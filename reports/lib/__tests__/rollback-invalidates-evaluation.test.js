/**
 * A rollback invalidates the evaluation it is rolling back past (I1)
 *
 * `evaluatePhase` has two skip conditions. Skip logic 2 reads the MOST RECENT
 * history entry FOR THE PHASE and returns early when it is `ready: true`. On every
 * real session the last article entry IS ready:true — that is how the run reached
 * the article gate at all.
 *
 * `ROLLBACK_CLEARS.outline` and `.article` deliberately preserve
 * `evaluationHistory` (it may hold useful arc evaluations). So a rollback to
 * `article` — including the new complete-session rollback path — regenerated the
 * article and then skipped BOTH the Opus evaluation and the programmatic
 * fact-check that gates it, and the article gate opened with `factCheck: null`
 * beside the previous article's green verdict. The fact-check is the whole point
 * of that gate.
 *
 * The fix is a `ready: false` stub appended by buildRollbackState, so the tests
 * below run the real path: buildRollbackState -> appendSingleReducer -> evaluator.
 */

// No paid calls: the evaluator's SDK client is injected through config.
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));
// api-helpers requires lib/workflow/graph at load; nothing here compiles a graph.
jest.mock('../workflow/graph', () => ({
  createReportGraphWithCheckpointer: jest.fn(() => ({ mockGraph: true }))
}));

const { buildRollbackState } = require('../api-helpers');
const { ROLLBACK_CLEARS, _testing: { appendSingleReducer } } = require('../workflow/state');
const { evaluateArticle } = require('../workflow/nodes/evaluator-nodes');

/** The history a real session carries when it reaches the article gate. */
function historyOfAFinishedRun() {
  return [
    { phase: 'arcs', ready: true, timestamp: '2026-09-18T00:00:00.000Z' },
    { phase: 'outline', ready: true, timestamp: '2026-09-18T00:10:00.000Z' },
    { phase: 'article', ready: true, overallScore: 0.93, timestamp: '2026-09-18T00:20:00.000Z' }
  ];
}

/** State as the graph replays it after a rollback to `point`. */
function stateAfterRollbackTo(point) {
  const rollback = buildRollbackState(point);
  return {
    sessionId: '091826',
    theme: 'journalist',
    // What generateContentBundle produced on the replay.
    contentBundle: { headline: { main: 'A new draft' }, sections: [] },
    outline: { sections: [] },
    articleApproved: rollback.articleApproved,
    articleRevisionCount: rollback.articleRevisionCount,
    evaluationHistory: appendSingleReducer(historyOfAFinishedRun(), rollback.evaluationHistory)
  };
}

describe('buildRollbackState evaluation stubs', () => {
  test('rollback to article ends the history with a ready:false article entry', () => {
    const stubs = buildRollbackState('article').evaluationHistory;
    const last = stubs[stubs.length - 1];

    expect(last.phase).toBe('article');
    expect(last.ready).toBe(false);
    expect(last.reason).toBe('rollback-invalidated');
    expect(last.source).toBe('rollback');
    expect(typeof last.timestamp).toBe('string');
  });

  test('rollback to outline invalidates the outline AND the article', () => {
    const stubs = buildRollbackState('outline').evaluationHistory;

    // Both are regenerated after this point, so both evaluations are stale.
    expect(stubs.map(s => s.phase)).toEqual(['outline', 'article']);
    expect(stubs.every(s => s.ready === false)).toBe(true);
    expect(stubs.every(s => s.source === 'rollback')).toBe(true);
  });

  test('rollback to arc-selection empties the history instead of stubbing it', () => {
    // arc-selection HAS evaluationHistory in its clear list, so nothing can skip
    // and a stub would be noise. Verified here so the two mechanisms cannot drift.
    expect(ROLLBACK_CLEARS['arc-selection']).toContain('evaluationHistory');
    expect(buildRollbackState('arc-selection').evaluationHistory).toEqual([]);
  });

  test('the upstream points that clear the history still clear it', () => {
    for (const point of ['input-review', 'await-roster', 'pre-curation', 'evidence-and-photos']) {
      expect(buildRollbackState(point).evaluationHistory).toEqual([]);
    }
  });

  test('the stub survives appendSingleReducer as an entry, not a nested array', () => {
    const history = appendSingleReducer([{ phase: 'article', ready: true }], buildRollbackState('article').evaluationHistory);
    expect(history).toHaveLength(2);
    expect(history[1].phase).toBe('article');
    expect(history[1].ready).toBe(false);
  });
});

describe('evaluateArticle after a rollback', () => {
  const opusVerdict = {
    structuralPassed: true,
    ready: true,
    overallScore: 0.9,
    structuralIssues: [],
    advisoryWarnings: [],
    confidence: 'high'
  };

  test('does NOT skip: the fact-check runs and the evaluation is paid for again', async () => {
    const sdkClient = jest.fn().mockResolvedValue(opusVerdict);
    const state = stateAfterRollbackTo('article');

    const result = await evaluateArticle(state, { configurable: { sdkClient } });

    expect(sdkClient).toHaveBeenCalledTimes(1);
    // The fact-check only appears on a run that was not skipped.
    expect(result._articleFactCheck).toBeDefined();
    expect(result.evaluationHistory.phase).toBe('article');
    expect(result.evaluationHistory.ready).toBe(true);
  });

  test('does NOT skip after a rollback to outline either', async () => {
    const sdkClient = jest.fn().mockResolvedValue(opusVerdict);
    const state = stateAfterRollbackTo('outline');

    const result = await evaluateArticle(state, { configurable: { sdkClient } });

    expect(sdkClient).toHaveBeenCalledTimes(1);
    expect(result._articleFactCheck).toBeDefined();
  });

  test('control: with the old ready:true entry last, it still skips', async () => {
    // The pre-fix behaviour, kept as the contrast: skip logic 2 is doing its job
    // for an ordinary replay, and the stub is what distinguishes a rollback from one.
    const sdkClient = jest.fn().mockResolvedValue(opusVerdict);
    const state = {
      contentBundle: { headline: { main: 'The same draft' }, sections: [] },
      evaluationHistory: historyOfAFinishedRun()
    };

    const result = await evaluateArticle(state, { configurable: { sdkClient } });

    expect(sdkClient).not.toHaveBeenCalled();
    expect(result.evaluationHistory).toBeUndefined();
    expect(result._articleFactCheck).toBeUndefined();
  });
});
