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
    const sdkClient = jest.fn().mockResolvedValue({ items: [] });
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

  test('a buried memory sends nothing more than before: no text, only its name and transaction', async () => {
    const { prompt, byId } = await batchInput();
    expect(byId.ril001.description).toBeUndefined();
    expect(byId.ril001.name).toBe('RIL001 - Riley knows');
    expect(byId.ril001.shellAccount).toBe('Melanie');
    expect(prompt).not.toContain(BURIED_TEXT);
    expect(byId.unk001.description).toBeUndefined();
    expect(prompt).not.toContain('Untagged memory text.');
  });

  test('a paper document still sends its description', async () => {
    const { byId } = await batchInput();
    expect(byId.p1.description).toBe(PAPER_TEXT);
  });
});
