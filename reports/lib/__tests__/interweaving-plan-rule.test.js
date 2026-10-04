/**
 * No internal flag in the outline writer's prompt (phase 2 final fix wave, item 7).
 *
 * reviseArcs set `interweavingFromPreviousRound` on the arc cache, and the outline
 * writer's <arc-analysis> printed the cache with only `timing` and `architecture`
 * stripped, so the flag reached the writer.
 *
 * Phase 4: the interweaving call and the arc rework's plan went with the weave (brief
 * 4.4), and the one rule for "has an interweaving plan" (hasInterweavingPlan) went with
 * the outline judge, its last reader (brief 4.6), with its tests.
 */

const { generateOutline } = require('../workflow/nodes/ai-nodes');
const { reworkFixtureState, OUTLINE } = require('./fixtures/rework-state');

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

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
