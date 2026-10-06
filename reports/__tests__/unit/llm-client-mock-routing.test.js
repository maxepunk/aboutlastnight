/**
 * The mock SDK client's routing (__tests__/mocks/llm-client.mock.js detectFixtureKey): which
 * fixture a call gets, read from what marks the call.
 *
 * Fix round 3 (phase 4b): the weave writer's prompt carries the whole record, and a real record
 * can hold the word "batch" (092026's does), which the preprocessing match took first: the weave
 * writer got the preprocessor's fixture and threw, and a server run on the mock stopped at the
 * meeting. The weave writer and its rework are routed by the heading their prompts open with,
 * ahead of every match on a word the prompt holds. Invented text.
 */
const { createMockSdkClient, detectFixtureKey, getDefaultWeave } = require('../mocks/llm-client.mock');
const { _testing: { buildWeavePrompt, buildArcRevisionPrompt, weaveSystemPrompt, generateWeave } } = require('../../lib/workflow/nodes/arc-specialist-nodes');
const { WEAVE_SCHEMA } = require('../../lib/sdk-client/subagents');
const { reworkFixtureState } = require('../../lib/__tests__/fixtures/rework-state');

/** The rework fixture, its director's notes holding the word the preprocessing match reads. */
function stateWithBatch() {
  const state = reworkFixtureState('journalist');
  state.directorNotes = { ...state.directorNotes, rawProse: `${(state.directorNotes && state.directorNotes.rawProse) || ''} Marcus tried the first batch on himself.` };
  return state;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("fix round 3: the mock routes the weave writer by its prompt's opening, ahead of the word matches", () => {
  it("a weave-writer call whose prompt holds the word 'batch' gets the weave fixture", async () => {
    const state = stateWithBatch();
    const prompt = buildWeavePrompt(state);
    expect(prompt.toLowerCase()).toContain('batch');
    const call = { prompt, systemPrompt: weaveSystemPrompt(state.sessionConfig, state.theme), jsonSchema: WEAVE_SCHEMA, label: 'The weave' };
    expect(detectFixtureKey(call)).toBe('weave');
    expect(await createMockSdkClient()(call)).toEqual(getDefaultWeave());
  });

  it("the weave rework, which opens with the writer's sections, gets the weave fixture too", () => {
    const state = stateWithBatch();
    const prompt = buildArcRevisionPrompt(state, 'The checks found nothing to fix.', 'PREVIOUS WEAVE OUTPUT');
    expect(prompt.toLowerCase()).toContain('batch');
    expect(detectFixtureKey({ prompt, systemPrompt: '', jsonSchema: WEAVE_SCHEMA, label: 'Arc revision 1' })).toBe('weave');
  });

  it('the weave writer node, run on the mock, writes the fixture weave', async () => {
    const sdk = createMockSdkClient();
    const weave = await generateWeave(stateWithBatch(), { configurable: { sdkClient: sdk } });
    expect(sdk.getLastCall().prompt.toLowerCase()).toContain('batch');
    expect(weave.story).toBe(getDefaultWeave().story);
  });

  it("a preprocessing call still gets the preprocessor's fixture", () => {
    expect(detectFixtureKey({ prompt: 'Preprocess this batch of evidence items.', systemPrompt: '' })).toBe('preprocess');
  });
});
