/**
 * One rule for "has an interweaving plan", and no internal flag in the outline
 * writer's prompt (phase 2 final fix wave, item 7).
 *
 * reviseArcs set `interweavingFromPreviousRound` on the arc cache, and the outline
 * writer's <arc-analysis> printed the cache with only `timing` and `architecture`
 * stripped, so the flag reached the writer. And three places decided whether a plan
 * said anything, each its own way: reviseArcs by "an object with a key" (so an empty
 * returned plan replaced a real previous one), the arc reworker by the plan's own
 * fields, and the outline judge by "any non-empty value". They now share the one
 * exported hasInterweavingPlan.
 */

const { hasInterweavingPlan, reviseArcs, _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { generateOutline } = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState, OUTLINE } = require('./fixtures/rework-state');

const REAL_PLAN = { suggestedOrder: ['arc-sale', 'arc-envelope'], convergencePoint: 'The vote', keyCallbacks: [] };

/** Plans the three consumers used to disagree on, and what the one rule says. */
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

describe('the arc reworker, reviseArcs and the outline judge apply it', () => {
  it.each(CASES)('the arc reworker shows the previous plan: %s', (_name, plan, expected) => {
    const prompt = arcTesting.buildArcRevisionPrompt({ ...reworkFixtureState('journalist'), _arcAnalysisCache: { interweavingPlan: plan } }, 'CTX', 'PREV');
    expect(prompt.includes('### PREVIOUS INTERWEAVING PLAN')).toBe(expected);
  });

  it.each(CASES)('the outline judge shows the plan: %s', (_name, plan, expected) => {
    const prompt = buildEvaluationUserPrompt('outline', { ...reworkFixtureState('journalist'), _arcAnalysisCache: { interweavingPlan: plan } }, {});
    expect(prompt.includes('INTERWEAVING PLAN (from arc analysis)')).toBe(expected);
  });

  it.each(CASES)('reviseArcs stores the plan the rework returned only when it has one: %s', async (_name, plan, expected) => {
    const state = reworkFixtureState('journalist');
    const sdk = jest.fn(async () => ({ narrativeArcs: state.narrativeArcs, synthesisNotes: 's', interweavingPlan: plan }));
    const result = await reviseArcs(
      { ...state, narrativeArcs: null, _previousArcs: state.narrativeArcs, _arcAnalysisCache: { interweavingPlan: REAL_PLAN } },
      { configurable: { sdkClient: sdk } }
    );
    expect(result._arcAnalysisCache.interweavingPlan).toEqual(expected ? plan : REAL_PLAN);
    expect(result._arcAnalysisCache.interweavingFromPreviousRound === true).toBe(!expected);
  });

  it('reviseArcs does not claim to keep a previous plan that says nothing', async () => {
    const state = reworkFixtureState('journalist');
    const sdk = jest.fn(async () => ({ narrativeArcs: state.narrativeArcs, synthesisNotes: 's' }));
    const result = await reviseArcs(
      { ...state, narrativeArcs: null, _previousArcs: state.narrativeArcs, _arcAnalysisCache: { interweavingPlan: {} } },
      { configurable: { sdkClient: sdk } }
    );
    expect(result._arcAnalysisCache.interweavingPlan).toEqual(arcTesting.createDefaultInterweavingPlan());
    expect(result._arcAnalysisCache).not.toHaveProperty('interweavingFromPreviousRound');
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
