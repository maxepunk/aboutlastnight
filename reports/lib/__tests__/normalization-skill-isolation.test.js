const { _testing } = require('../workflow/nodes/character-data-nodes');

function makeCapturingSdk(returnValue = { characters: {} }) {
  const calls = [];
  const fn = async (options) => {
    calls.push(options);
    return returnValue;
  };
  fn.calls = calls;
  return fn;
}

// Minimal paper evidence that passes the description-length filter (> 20 chars)
const MINIMAL_PAPER_EVIDENCE = [
  { name: 'Test Doc', description: 'A test document with enough text to pass the filter.' }
];

describe('normalization nodes skill isolation', () => {
  test('extractCharacterData passes loadProjectSettings: false', async () => {
    expect(_testing).toBeDefined();
    expect(_testing.extractCharacterData).toBeDefined();

    const sdk = makeCapturingSdk({ characters: {} });
    const state = {
      sessionId: 'test',
      paperEvidence: MINIMAL_PAPER_EVIDENCE,
      memoryTokens: [],
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: sdk } };
    await _testing.extractCharacterData(state, config);
    expect(sdk.calls.length).toBeGreaterThan(0);
    expect(sdk.calls[0].loadProjectSettings).toBe(false);
  });

  test('extractCharacterData no longer overrides timeoutMs to 60s', async () => {
    const sdk = makeCapturingSdk({ characters: {} });
    const state = {
      sessionId: 'test',
      paperEvidence: MINIMAL_PAPER_EVIDENCE,
      memoryTokens: [],
      sessionConfig: { roster: [] }
    };
    const config = { configurable: { sdkClient: sdk } };
    await _testing.extractCharacterData(state, config);
    expect(sdk.calls[0].timeoutMs).toBeUndefined();
  });
});
