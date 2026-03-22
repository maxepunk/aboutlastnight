jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { extractCharacterData } = require('../workflow/nodes/character-data-nodes')._testing;

describe('extractCharacterData', () => {
  test('extracts character data from paper evidence and tokens', async () => {
    const mockSdk = jest.fn().mockResolvedValueOnce({
      characters: {
        'Mel': { groups: ['Stanford Four'], relationships: { 'Sarah': 'divorce attorney', 'Marcus': 'old friend' }, role: 'Attorney' },
        'Nat': { groups: ['Stanford Four'], relationships: { 'Mel': 'Stanford Four member' }, role: 'Filmmaker' }
      }
    });

    const state = {
      characterData: null,
      paperEvidence: [
        { name: 'Mel - Nat texts', description: 'Mel: compare how these parties went down in our Stanford Four era vs today.', owners: ['Mel Nilsson'] }
      ],
      memoryTokens: [
        { tokenId: 'nat001', disposition: 'exposed', fullDescription: 'NAT.1 - MARCUS grabs your shoulder: We are going to change the world, Nat. All four of us.', owners: ['Nat Francisco'] }
      ],
      sessionConfig: { roster: ['Mel', 'Nat', 'Sam'] }
    };

    const result = await extractCharacterData(state, { configurable: { sdkClient: mockSdk } });
    expect(result.characterData).toBeDefined();
    expect(result.characterData.characters['Mel'].groups).toContain('Stanford Four');
    expect(result.characterData.source).toBe('extracted');
    expect(mockSdk).toHaveBeenCalledTimes(1);
  });

  test('skips if characterData already exists', async () => {
    const state = { characterData: { characters: { 'Mel': { groups: ['Stanford Four'] } } } };
    const result = await extractCharacterData(state, { configurable: {} });
    expect(result.characterData).toBeUndefined();
  });

  test('returns empty on error (non-fatal)', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('timeout'));
    const state = {
      characterData: null,
      paperEvidence: [{ name: 'Test', description: 'test content here for length requirement', owners: [] }],
      memoryTokens: [],
      sessionConfig: { roster: ['Test'] }
    };
    const result = await extractCharacterData(state, { configurable: { sdkClient: mockSdk } });
    expect(result.characterData.source).toBe('error');
    expect(result.characterData.characters).toEqual({});
  });

  test('returns empty when no evidence available', async () => {
    const state = { characterData: null, paperEvidence: [], memoryTokens: [], sessionConfig: { roster: [] } };
    const result = await extractCharacterData(state, { configurable: {} });
    expect(result.characterData.source).toBe('empty');
  });
});
