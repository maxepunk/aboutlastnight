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

  test('throws on extraction error (fail-loud — empty character data drifts affiliations)', async () => {
    const mockSdk = jest.fn().mockRejectedValueOnce(new Error('overloaded_error'));
    const state = {
      characterData: null,
      paperEvidence: [{ name: 'Test', description: 'test content here for length requirement', owners: [] }],
      memoryTokens: [],
      sessionConfig: { roster: ['Test'] }
    };
    await expect(extractCharacterData(state, { configurable: { sdkClient: mockSdk } }))
      .rejects.toThrow(/character data|overloaded/i);
  });

  test('returns empty when no evidence available', async () => {
    const state = { characterData: null, paperEvidence: [], memoryTokens: [], sessionConfig: { roster: [] } };
    const result = await extractCharacterData(state, { configurable: {} });
    expect(result.characterData.source).toBe('empty');
  });

  /**
   * Brief 2.1: the director's selection, not every fetched item, and every exposed
   * memory in full through the record view (the 30-memory and 200-character caps
   * are gone).
   */
  describe('reads the selection, in full, through the record view', () => {
    const promptOf = async (state) => {
      const mockSdk = jest.fn().mockResolvedValueOnce({ characters: {} });
      await extractCharacterData(state, { configurable: { sdkClient: mockSdk } });
      return mockSdk.mock.calls[0][0].prompt;
    };
    const memoryText = (i) => `MEM${i} - 10:${String(i).padStart(2, '0')}PM - ` + `memory ${i} goes on and on. `.repeat(12) + `END OF MEMORY ${i}.`;
    const tokens = Array.from({ length: 35 }, (_, i) => ({
      tokenId: `mem${String(i).padStart(3, '0')}`, name: `MEM${i}`, disposition: 'exposed',
      fullDescription: memoryText(i), owners: ['Nat Francisco']
    }));
    const selected = { notionId: 'p-sel', name: 'Mel - Nat texts', basicType: 'Document',
      description: 'Mel: compare how these parties went down in our Stanford Four era vs today.', owners: ['Mel Nilsson'] };
    const unselected = { notionId: 'p-not', name: 'Locked safe letter', basicType: 'Prop',
      description: 'Only in the locked safe: Sam is secretly Nat\'s half-brother.', owners: [] };

    test('takes the director\'s selected paper documents, not every fetched item', async () => {
      const prompt = await promptOf({
        characterData: null,
        paperEvidence: [selected, unselected],
        selectedPaperEvidence: [selected],
        memoryTokens: [],
        sessionConfig: { roster: ['Mel', 'Nat'] }
      });
      expect(prompt).toContain('<document id="p-sel" kind="Document" name="Mel - Nat texts" owner="Mel Nilsson" layer="exposed">');
      expect(prompt).toContain('Stanford Four era vs today.');
      expect(prompt).not.toContain('half-brother');
      expect(prompt).not.toContain('Locked safe letter');
    });

    test('an empty selection means no paper documents', async () => {
      const prompt = await promptOf({
        characterData: null,
        paperEvidence: [selected, unselected],
        selectedPaperEvidence: [],
        memoryTokens: [tokens[0]],
        sessionConfig: { roster: ['Nat'] }
      });
      expect(prompt).not.toContain('era vs today');
      expect(prompt).not.toContain('half-brother');
    });

    test('carries every exposed memory whole, past the old 30-memory and 200-character caps, and no buried one', async () => {
      const buried = { tokenId: 'bur001', name: 'BUR001', disposition: 'buried', fullDescription: 'Buried secret text.', owners: ['Sam'] };
      const prompt = await promptOf({
        characterData: null,
        paperEvidence: [],
        memoryTokens: [...tokens, buried],
        sessionConfig: { roster: ['Nat'] }
      });
      for (let i = 0; i < 35; i++) expect(prompt).toContain(memoryText(i));
      expect(prompt).toContain('<document id="mem034" kind="memory" name="MEM34" owner="Nat Francisco" layer="exposed">');
      expect(prompt).not.toContain('Buried secret text.');
      expect(prompt).not.toContain('bur001');
    });
  });
});
