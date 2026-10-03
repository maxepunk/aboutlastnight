/**
 * render-prompts.js renders the three judges through scripts/lib/render-calls.js
 * (brief 3.0, fix round 1). The nodes build those prompts with argument lists they keep
 * inline (createEvaluator's criteria and fact check), so the module repeats them. This
 * test keeps the copy and the node together: it runs each node with a recording
 * stand-in for the model and requires the node to send exactly the module's render,
 * system prompt and user prompt, for both themes, on the fixture state the writer pins
 * use. A node that starts passing its builder something the module does not fails here
 * until render-calls.js passes it too.
 *
 * Phase 4 (brief 4.4): the interweaving call went, and the arcs judge is the story
 * meeting's fact check on the fixture's weave.
 */
const path = require('path');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');
const { evaluateArcs, evaluateOutline, evaluateArticle } = require('../../../lib/workflow/nodes/evaluator-nodes');
const { REVISION_CAPS } = require('../../../lib/workflow/state');
const {
  JUDGE_PHASES,
  loadCallModules,
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

// F1: the outline and article judges now receive the director's standing edits
// (evaluator-nodes.js judgedEdits), and render-calls.js passes them as the node does.
describe.each(['journalist', 'detective'])('%s: a judge with the director\'s edits sends what the script renders (F1)', (theme) => {
  const { standingAfterSendBack } = require('../../../lib/hand-edit-diff');
  const { OUTLINE } = require('../../../lib/__tests__/fixtures/rework-state');

  test('the outline judge', async () => {
    const edited = clone(OUTLINE);
    edited.lede.hook = 'Marcus died the morning his company sold.';
    const state = {
      ...reworkFixtureState(theme), outline: edited, evaluationHistory: [], outlineApproved: false,
      _outlineHandEdits: standingAfterSendBack(null, OUTLINE, edited, 'outline')
    };
    const sdk = recordingSdk(() => VERDICT);
    await evaluateOutline(clone(state), cfg(sdk, theme));
    const rendered = await renderJudge(calls, state, 'outline');
    expect(rendered.userPrompt).toContain('E1 (lede, hook): "Marcus died the morning his company sold."');
    expectSent(sdk.mock.calls[0][0], rendered);
  });

  test('the article judge', async () => {
    const edited = clone(PREVIOUS_BUNDLE);
    edited.sections[0].content[2] = { type: 'paragraph', text: 'Then the paternity test came back, and the room went quiet.' };
    const state = {
      ...reworkFixtureState(theme), contentBundle: edited, evaluationHistory: [], articleApproved: false,
      articleRevisionCount: REVISION_CAPS.ARTICLE,
      _articleHandEdits: standingAfterSendBack(null, PREVIOUS_BUNDLE, edited, 'bundle')
    };
    const sdk = recordingSdk(() => VERDICT);
    await evaluateArticle(clone(state), cfg(sdk, theme));
    const rendered = await renderJudge(calls, state, 'article');
    expect(rendered.userPrompt).toContain('E1 (section "the-story", paragraph): "Then the paternity test came back, and the room went quiet."');
    expectSent(sdk.mock.calls[0][0], rendered);
  });
});
