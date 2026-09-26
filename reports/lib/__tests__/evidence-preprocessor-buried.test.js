/**
 * Tests for buried content stripping in evidence preprocessor
 * Defense-in-depth: buried items should NOT carry fullContent
 */

jest.mock('../../lib/llm', () => ({
  sdkQuery: jest.fn()
}));

jest.mock('../../lib/observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { createEvidencePreprocessor, createMockPreprocessor } = require('../evidence-preprocessor');

describe('EvidencePreprocessor buried content stripping', () => {
  test('buried items should NOT have fullContent after preprocessing', async () => {
    const mockSdkClient = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'buried-token-1',
          summary: 'A buried transaction',
          characterRefs: [],
          tags: [],
          ownerLogline: null,
          narrativeTimelineRef: null,
          sfFields: {}
        }
      ]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: mockSdkClient });

    const result = await preprocessor.process({
      memoryTokens: [{
        id: 'buried-token-1',
        disposition: 'buried',
        fullDescription: 'Full secret content about buried memories',
        name: 'Buried Token',
        shellAccount: 'Cayman',
        transactionAmount: 150000
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const buriedItem = result.items.find(i => i.id === 'buried-token-1');
    expect(buriedItem).toBeDefined();
    expect(buriedItem.disposition).toBe('buried');
    expect(buriedItem.fullContent).toBeUndefined();
    // Transaction metadata should still be preserved
    expect(buriedItem.shellAccount).toBe('Cayman');
    expect(buriedItem.transactionAmount).toBe(150000);
  });

  test('exposed items should still have fullContent after preprocessing', async () => {
    const mockSdkClient = jest.fn().mockResolvedValue({
      items: [
        {
          id: 'exposed-token-1',
          summary: 'An exposed token',
          characterRefs: ['Riley'],
          tags: ['investigation'],
          ownerLogline: 'Riley',
          narrativeTimelineRef: null,
          sfFields: {}
        }
      ]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: mockSdkClient });

    const result = await preprocessor.process({
      memoryTokens: [{
        id: 'exposed-token-1',
        disposition: 'exposed',
        fullDescription: 'Full exposed content that should be preserved',
        name: 'Exposed Token'
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const exposedItem = result.items.find(i => i.id === 'exposed-token-1');
    expect(exposedItem).toBeDefined();
    expect(exposedItem.disposition).toBe('exposed');
    expect(exposedItem.fullContent).toBe('Full exposed content that should be preserved');
  });

  test('mock preprocessor should strip fullContent from buried tokens', async () => {
    const mockPreprocessor = createMockPreprocessor();

    const result = await mockPreprocessor.process({
      memoryTokens: [
        {
          id: 'mock-buried',
          disposition: 'buried',
          content: 'Secret buried content'
        },
        {
          id: 'mock-exposed',
          disposition: 'exposed',
          content: 'Visible exposed content'
        }
      ],
      paperEvidence: [],
      sessionId: 'test'
    });

    const buriedItem = result.items.find(i => i.id === 'mock-buried');
    const exposedItem = result.items.find(i => i.id === 'mock-exposed');

    expect(buriedItem.fullContent).toBeUndefined();
    expect(exposedItem.fullContent).toBe('Visible exposed content');
  });
});

/**
 * Brief 2.1: Haiku summarised each memory from its NAME, because the batch input
 * sent `description || text`, which a memory token does not have. An exposed memory
 * now sends its full text; a buried one sends exactly what it sent before.
 */
describe('EvidencePreprocessor batch input: what Haiku reads', () => {
  const EXPOSED_TEXT = 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Worth it. Finally worth it.';
  const BURIED_TEXT = 'RILEY.1 - Riley reads the paternity test result twice.';
  const PAPER_TEXT = 'Board minutes: the vote passed four to one.';

  async function batchInput() {
    // One summary per input, so no input falls back (and nothing warns).
    const sdkClient = jest.fn(async ({ prompt }) => ({
      items: JSON.parse(prompt.slice(prompt.indexOf('['))).map(i => ({ id: i.id, sourceType: i.sourceType, summary: 's' }))
    }));
    const preprocessor = createEvidencePreprocessor({ sdkClient });
    await preprocessor.process({
      memoryTokens: [
        { tokenId: 'ale003', name: 'ALE003 - Alex fight', disposition: 'exposed', fullDescription: EXPOSED_TEXT, owners: ['Alex Reeves'] },
        { tokenId: 'ril001', name: 'RIL001 - Riley knows', disposition: 'buried', fullDescription: BURIED_TEXT, owners: ['Riley Chen'],
          shellAccount: 'Melanie', transactionAmount: 75000, sessionTransactionTime: '07:50 PM' },
        // A token with no tag counts as buried, as it does everywhere else.
        { tokenId: 'unk001', name: 'UNK001 - untagged', fullDescription: 'Untagged memory text.' }
      ],
      paperEvidence: [{ notionId: 'p1', name: 'Board minutes', description: PAPER_TEXT }],
      sessionId: 'test'
    });
    expect(sdkClient).toHaveBeenCalledTimes(1);
    const { prompt } = sdkClient.mock.calls[0][0];
    const items = JSON.parse(prompt.slice(prompt.indexOf('[')));
    return { prompt, byId: Object.fromEntries(items.map(i => [i.id, i])) };
  }

  test('an exposed memory sends its full text', async () => {
    const { byId } = await batchInput();
    expect(byId.ale003.description).toBe(EXPOSED_TEXT);
  });

  test('a buried memory is not sent at all: not its id, its name, its owner or its text (final fix wave)', async () => {
    // Its id and name name its owner; all Haiku could say of it is the sale.
    const { prompt, byId } = await batchInput();
    expect(byId.ril001).toBeUndefined();
    expect(byId.unk001).toBeUndefined();
    ['ril001', 'RIL001', 'Riley', BURIED_TEXT, 'unk001', 'UNK001', 'Untagged memory text.'].forEach((leak) =>
      expect(prompt).not.toContain(leak));
  });

  test('a paper document still sends its description', async () => {
    const { byId } = await batchInput();
    expect(byId.p1.description).toBe(PAPER_TEXT);
  });
});

/**
 * Final fix wave: a buried memory's item is made in code from its sale. It keeps the
 * input's id (the pipeline still routes it) and carries no text, owner or name.
 */
describe('EvidencePreprocessor: a buried memory is normalized without the model', () => {
  test('its item keeps the id, the disposition and the sale; the summary is the sale', async () => {
    const sdkClient = jest.fn();
    const result = await createEvidencePreprocessor({ sdkClient }).process({
      memoryTokens: [
        { tokenId: 'ril001', name: 'RIL001 - Riley knows', disposition: 'buried', fullDescription: 'Riley reads the test.',
          owners: ['Riley Chen'], owner: { logline: 'Riley, the accountant' },
          shellAccount: 'Melanie', transactionAmount: 75000, sessionTransactionTime: '07:50 PM' },
        { tokenId: 'unk001', name: 'UNK001 - untagged', fullDescription: 'Untagged memory text.' }
      ],
      paperEvidence: [],
      sessionId: 'test'
    });
    expect(sdkClient).not.toHaveBeenCalled();
    const [ril, unk] = result.items;
    expect(ril).toMatchObject({
      id: 'ril001', sourceType: 'memory-token', disposition: 'buried',
      summary: 'Buried memory: sold to Melanie for $75,000 at 07:50 PM',
      shellAccount: 'Melanie', transactionAmount: 75000, sessionTransactionTime: '07:50 PM',
      ownerLogline: null, characterRefs: []
    });
    expect(unk).toMatchObject({ id: 'unk001', disposition: 'buried', summary: 'Buried memory: no sale recorded', shellAccount: null });
    const { id: _ril, ...rilRest } = ril;
    const { id: _unk, ...unkRest } = unk;
    expect(JSON.stringify([rilRest, unkRest])).not.toMatch(/ril001|RIL001|Riley|unk001|UNK001|Untagged/);
  });
});

/**
 * Residual item 8 (minor): the items come out in their input order. The wave's first
 * cut put every buried memory first, so the pre-curation stop's five-item preview
 * (PreCuration.js) showed only buried rows.
 */
describe('EvidencePreprocessor: output order', () => {
  test('buried memories made in code and summarised items keep the input order', async () => {
    const sdkClient = jest.fn(async ({ prompt }) => ({
      items: JSON.parse(prompt.slice(prompt.indexOf('['))).map(i => ({ id: i.id, sourceType: i.sourceType, summary: 's' }))
    }));
    const result = await createEvidencePreprocessor({ sdkClient }).process({
      memoryTokens: [
        { tokenId: 'exp001', disposition: 'exposed', fullDescription: 'one' },
        { tokenId: 'bur001', disposition: 'buried', shellAccount: 'Gorlan', transactionAmount: 1, sessionTransactionTime: '8:00 PM' },
        { tokenId: 'exp002', disposition: 'exposed', fullDescription: 'two' },
        { tokenId: 'bur002', disposition: 'buried' }
      ],
      paperEvidence: [{ notionId: 'p1', name: 'Board minutes', description: 'x' }],
      sessionId: 'test'
    });
    expect(result.items.map(i => i.id)).toEqual(['exp001', 'bur001', 'exp002', 'bur002', 'p1']);
  });
});
