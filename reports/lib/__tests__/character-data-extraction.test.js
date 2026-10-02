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

  /**
   * Phase 3 (3.6): character extraction stops filling gaps. A role was required for
   * every character, relationships could be "strongly implied", and the prompt told
   * the model to include ALL members of a group, so the writers' character context
   * carried roles and ties no document gives. Blake was "the Black Market operator".
   */
  describe('extractCharacterData asks only for what a document states (phase 3, 3.6)', () => {
    const callOf = async () => {
      const mockSdk = jest.fn().mockResolvedValueOnce({ characters: {} });
      await extractCharacterData({
        characterData: null,
        paperEvidence: [{ notionId: 'p-1', name: 'Mel - Nat texts', basicType: 'Document', description: 'Mel: our Stanford Four era.', owners: ['Mel Nilsson'] }],
        memoryTokens: [],
        sessionConfig: { roster: ['Mel', 'Nat'] }
      }, { configurable: { sdkClient: mockSdk } });
      return mockSdk.mock.calls[0][0];
    };
    const promptOf = async () => (await callOf()).prompt;
  
    test('requires no role: the record may not give one', async () => {
      const entry = (await callOf()).jsonSchema.properties.characters.additionalProperties;
      expect(entry.required || []).not.toContain('role');
      expect(entry.properties.role.type).toBe('string');
    });
  
    /**
     * The one rule that covers a relationship, a group and a role (3.6 fix batch,
     * item 5): every entry is what a document states about that character. It used
     * to be stated in the schema, the numbered list, a closing line and the system
     * prompt, with no reason.
     */
    const DOCUMENT_ONLY_RULE = 'Take each entry from what a document states about that character, and leave a field empty when no document states it.';
    const DOCUMENT_ONLY_REASON = 'The writers read these entries as what the documents say about each character, so an inferred group, relationship or role would reach the article as a claim no document makes.';

    test('lists a relationship only where a document states it, never an implied one', async () => {
      const prompt = await promptOf();
      expect(prompt).not.toMatch(/implied/i);
      // 3.6b fix batch, finding 2: the field list itself asks for a relationship a
      // document states, to another character, not one entry per other character.
      expect(prompt).toMatch(/^2\. relationships: each relationship a document states between them and another character \(e\.g\./m);
      expect(prompt).not.toMatch(/each other character/);
      expect(prompt).toContain(DOCUMENT_ONLY_RULE);
    });

    test("lists a group's members only where a document names them", async () => {
      const prompt = await promptOf();
      expect(prompt).not.toMatch(/include ALL members/i);
      expect(prompt).toMatch(/^1\. groups:/m);
      expect(prompt).toContain(DOCUMENT_ONLY_RULE);
    });

    // 3.6b fix batch, finding 8: "Stanford Four" is a real in-game group, so the
    // example taught content; a placeholder teaches the shape. The fixture's own
    // document says "Stanford Four", so only the instructions are read here.
    test('gives the group example as a placeholder, in the field list and the schema', async () => {
      const call = await callOf();
      const instructions = call.prompt.slice(call.prompt.indexOf('For each ROSTER character'));
      expect(instructions).toMatch(/^1\. groups: the named groups \(e\.g\., "<group name>"\) they are a member of\.$/m);
      const groups = call.jsonSchema.properties.characters.additionalProperties.properties.groups;
      expect(groups.description).toBe('Named groups this character is a member of (e.g., "<group name>")');
      expect(`${call.systemPrompt}\n${call.prompt.slice(0, call.prompt.indexOf('THE PAPER DOCUMENTS'))}\n${instructions}\n${JSON.stringify(call.jsonSchema)}`)
        .not.toMatch(/Stanford/);
    });

    test('states the document-only rule once per call, with its reason (fix batch, item 5)', async () => {
      const call = await callOf();
      const entry = call.jsonSchema.properties.characters.additionalProperties;
      const everything = [
        call.systemPrompt,
        call.prompt,
        ...Object.values(entry.properties).map((field) => field.description)
      ].join('\n');
      expect(call.prompt).toContain(`${DOCUMENT_ONLY_RULE} ${DOCUMENT_ONLY_REASON}`);
      // The rule's words appear in the rule, and in the relationships field of the
      // list, which says what the field holds (3.6b fix batch, finding 2: the list
      // itself asks for nothing inferred); not in the schema or the system prompt.
      expect(everything.match(/a document states|no document|explicitly states|Every entry rests/g))
        .toEqual(['a document states', 'a document states', 'no document', 'no document']);
      expect(call.prompt).toMatch(/^2\. relationships: each relationship a document states/m);
    });
  
    test('describes Blake by the canon line, not as "the Black Market operator"', async () => {
      const prompt = await promptOf();
      expect(prompt).not.toMatch(/Black Market/i);
      expect(prompt).toContain('Blake: manages operations at NeurAI; Marcus called Blake his Valet');
    });
  
    // Phase 3 (3.2; M26): the NPC lines are theme-config's canon, stated once there
    // and read here, so the extraction and the writers never word the canon twice.
    test("prints each NPC from theme-config's canon lines", async () => {
      const { getThemeNPCEntries } = require('../theme-config');
      const prompt = await promptOf();
      const canon = getThemeNPCEntries('journalist').filter((e) => !e.aliasOf);
      expect(canon.length).toBe(3);
      canon.forEach((e) => expect(prompt).toContain(`- ${e.fullName}: ${e.role}\n`));
      expect(prompt).toContain('- Marcus Blackwood: the man whose death the room investigates\n');
    });

    test('carries no em-dash', async () => {
      expect(await promptOf()).not.toContain('—');
    });
  
    test('keeps an extracted character with no role', async () => {
      const mockSdk = jest.fn().mockResolvedValueOnce({ characters: { Nat: { groups: ['Stanford Four'], relationships: {} } } });
      const result = await extractCharacterData({
        characterData: null,
        paperEvidence: [{ notionId: 'p-1', name: 'Mel - Nat texts', description: 'Mel: our Stanford Four era.', owners: ['Mel Nilsson'] }],
        memoryTokens: [],
        sessionConfig: { roster: ['Mel', 'Nat'] }
      }, { configurable: { sdkClient: mockSdk } });
      expect(result.characterData.characters.Nat).toEqual({ groups: ['Stanford Four'], relationships: {} });
    });
  });
});
