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
