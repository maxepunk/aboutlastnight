const { routeTokensByDisposition } = require('../workflow/nodes/node-helpers');

// Mock LLM + observability before requiring arc-specialist-nodes
jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
const { extractEvidenceSummary } = _testing;

describe('buried transaction ID stripping', () => {
  test('buried transactions do NOT contain token id field (source)', () => {
    const tokens = [
      { id: 'sam004', disposition: 'buried', shellAccount: 'Burns', transactionAmount: '$75,000', sessionTransactionTime: '6:25 PM' },
      { id: 'vic002', disposition: 'buried', shellAccount: 'Burns', transactionAmount: '$150,000', sessionTransactionTime: '6:36 PM' },
      { id: 'ale001', disposition: 'exposed', ownerLogline: 'Alex', summary: 'test', rawData: {} }
    ];

    const { exposed, buried } = routeTokensByDisposition(tokens);

    // Buried transactions must NOT have id field (leaks whose memory was buried)
    for (const tx of buried) {
      expect(tx).not.toHaveProperty('id');
    }
    expect(buried[0].shellAccount).toBe('Burns');
    expect(buried[0].amount).toBe('$75,000');

    // Exposed tokens SHOULD still have id field
    expect(exposed[0].id).toBe('ale001');
  });

  test('buried transactions preserve financial data fields', () => {
    const tokens = [
      { id: 'tok001', disposition: 'buried', shellAccount: 'Meridian', transactionAmount: '$50,000', sessionTransactionTime: '7:00 PM' }
    ];

    const { buried } = routeTokensByDisposition(tokens);

    expect(buried).toHaveLength(1);
    expect(buried[0]).toEqual({
      sourceType: 'memory-token',
      shellAccount: 'Meridian',
      amount: '$50,000',
      time: '7:00 PM'
    });
  });

  test('extractEvidenceSummary buried transactions lack id field (second defense)', () => {
    const evidenceBundle = {
      exposed: { tokens: [], paperEvidence: [] },
      buried: {
        transactions: [
          { id: 'sam004', shellAccount: 'Burns', amount: '$75,000', time: '6:25 PM' },
          { shellAccount: 'Meridian', amount: '$50,000', time: '7:00 PM' }
        ],
        relationships: []
      }
    };

    const summary = extractEvidenceSummary(evidenceBundle);

    for (const tx of summary.buriedTransactions) {
      expect(tx).not.toHaveProperty('id');
      expect(tx).toHaveProperty('shellAccount');
      expect(tx).toHaveProperty('timeline', 'investigation');
    }
  });
});
