/**
 * One rule for "has an interweaving plan", and no internal flag in the outline
 * writer's prompt (phase 2 final fix wave, item 7).
 *
 * reviseArcs set `interweavingFromPreviousRound` on the arc cache, and the outline
 * writer's <arc-analysis> printed the cache with only `timing` and `architecture`
 * stripped, so the flag reached the writer. And three places decided whether a plan
 * said anything, each its own way. They shared the one exported hasInterweavingPlan.
 *
 * Phase 4 (brief 4.4): the interweaving call and the arc rework's plan went with the
 * weave, so the arc stage writes no plan. The rule stays for the outline judge, which
 * reads a stored plan by it until its own slice removes it.
 */

const { hasInterweavingPlan } = require('../workflow/nodes/arc-specialist-nodes');
const { generateOutline } = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState, OUTLINE } = require('./fixtures/rework-state');

/** Plans the consumers used to disagree on, and what the one rule says. */
const CASES = [
  ['no plan', null, false],
  ['an empty object', {}, false],
  ['the degradation default', { suggestedOrder: [], convergencePoint: '', keyCallbacks: [] }, false],
  ['a blank convergence point', { convergencePoint: '   ' }, false],
  ['only a field the schema does not define', { notes: 'loose text' }, false],
  ['an array', ['arc-sale'], false],
  ['an order', { suggestedOrder: ['arc-sale'] }, true],
  ['a convergence point', { convergencePoint: 'The vote' }, true],
  ['a callback', { keyCallbacks: [{ plantIn: 'a', payoffIn: 'b', detail: 'c' }] }, true]
];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('hasInterweavingPlan is exported by name', () => {
  it.each(CASES)('%s', (_name, plan, expected) => {
    expect(hasInterweavingPlan(plan)).toBe(expected);
  });
});

describe('the outline judge applies it', () => {
  it.each(CASES)('the outline judge shows the plan: %s', (_name, plan, expected) => {
    const prompt = buildEvaluationUserPrompt('outline', { ...reworkFixtureState('journalist'), _arcAnalysisCache: { interweavingPlan: plan } }, {});
    expect(prompt.includes('INTERWEAVING PLAN (from arc analysis)')).toBe(expected);
  });
});

describe("the outline writer's <arc-analysis> carries no internal flag", () => {
  it('interweavingFromPreviousRound is stripped with timing and architecture', async () => {
    const sdk = jest.fn(async () => JSON.parse(JSON.stringify(OUTLINE)));
    const state = reworkFixtureState('journalist');
    state._arcAnalysisCache = { ...state._arcAnalysisCache, interweavingFromPreviousRound: true };
    await generateOutline({ ...state, outline: null }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    const { prompt } = sdk.mock.calls[0][0];
    expect(prompt).toContain('"convergencePoint": "The vote"');
    ['interweavingFromPreviousRound', '"timing"', '"architecture"'].forEach((key) => expect(prompt).not.toContain(key));
  });
});
