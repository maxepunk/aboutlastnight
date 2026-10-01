/**
 * render-prompts.js renders the interweaving call and the three judges through
 * scripts/lib/render-calls.js (brief 3.0, fix round 1). The nodes build those
 * prompts with argument lists they keep inline (analyzeArcsPlayerFocusGuided calling
 * enrichWithInterweaving; createEvaluator's criteria and fact check), so the module
 * repeats them. This test keeps the copy and the node together: it runs each node
 * with a recording stand-in for the model and requires the node to send exactly the
 * module's render, system prompt and user prompt, for both themes, on the fixture
 * state the writer pins use. A node that starts passing its builder something the
 * module does not (3.5 gives the interweaving call the session config) fails here
 * until render-calls.js passes it too.
 */
const path = require('path');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');
const { analyzeArcsPlayerFocusGuided } = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const { evaluateArcs, evaluateOutline, evaluateArticle } = require('../../../lib/workflow/nodes/evaluator-nodes');
const { REVISION_CAPS } = require('../../../lib/workflow/state');
const {
  JUDGE_PHASES,
  loadCallModules,
  renderInterweaving,
  renderJudge
} = require('../../../scripts/lib/render-calls');

const REPO = path.join(__dirname, '..', '..', '..');
const clone = (v) => JSON.parse(JSON.stringify(v));

/** A model stand-in that records every call and answers by `answer(options)`. */
const recordingSdk = (answer) => jest.fn(async (options) => clone(answer(options)));
const cfg = (sdk, theme) => ({ configurable: { sdkClient: sdk, theme } });

/** The node sent the render: both parts, each a non-empty string, byte for byte. */
function expectSent(sent, rendered) {
  expect(typeof rendered.systemPrompt === 'string' && rendered.systemPrompt.length > 0).toBe(true);
  expect(rendered.userPrompt).toContain('<RECORD>');
  expect(sent.systemPrompt).toBe(rendered.systemPrompt);
  expect(sent.prompt).toBe(rendered.userPrompt);
}

const VERDICT = { ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };

/** Each judge's node, and the state that keeps it from skipping its model call. */
const JUDGES = {
  arcs: [evaluateArcs, { selectedArcs: [] }],
  outline: [evaluateOutline, { outlineApproved: false }],
  // At the cap the article judge runs whatever the fact check found.
  article: [evaluateArticle, { articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE }]
};

let calls;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  calls = loadCallModules((p) => require(path.join(REPO, p)));
});
afterAll(() => jest.restoreAllMocks());

describe.each(['journalist', 'detective'])('%s: each node sends exactly what the script renders', (theme) => {
  test('the interweaving call', async () => {
    const state = reworkFixtureState(theme);
    // Call 1 answers with the stored arcs, which the render stands in for call 1's.
    const sdk = recordingSdk((options) => (options.label && options.label.startsWith('Interweaving')
      ? { arcInterweaving: [], interweavingPlan: { suggestedOrder: [], convergencePoint: '', keyCallbacks: [] } }
      : { narrativeArcs: state.narrativeArcs, synthesisNotes: 's' }));
    await analyzeArcsPlayerFocusGuided({ ...clone(state), narrativeArcs: null }, cfg(sdk, theme));
    expect(sdk).toHaveBeenCalledTimes(2);
    const sent = sdk.mock.calls[1][0];
    expect(sent.label).toMatch(/^Interweaving/);

    expectSent(sent, await renderInterweaving(calls, state));
  });

  test.each(JUDGE_PHASES)('the %s judge', async (phase) => {
    const [node, sendsItsCall] = JUDGES[phase];
    const state = { ...reworkFixtureState(theme), contentBundle: clone(PREVIOUS_BUNDLE), evaluationHistory: [], ...sendsItsCall };
    const sdk = recordingSdk(() => VERDICT);
    await node(clone(state), cfg(sdk, theme));
    expect(sdk).toHaveBeenCalledTimes(1);
    expectSent(sdk.mock.calls[0][0], await renderJudge(calls, state, phase));
  });
});

describe('loadCallModules', () => {
  test('names the module and the export a tree lacks', () => {
    const req = (p) => {
      const mod = require(path.join(REPO, p));
      if (!p.endsWith('evaluator-nodes.js')) return mod;
      const { buildEvaluationUserPrompt, ...rest } = mod._testing;
      return { ...mod, _testing: rest };
    };
    expect(() => loadCallModules(req)).toThrow('evaluator-nodes.js _testing does not export buildEvaluationUserPrompt');
  });
});
