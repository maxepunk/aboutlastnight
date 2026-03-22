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

describe('temporal pre-annotation', () => {
  test('exposed tokens get PARTY temporal context', () => {
    const tokens = [{
      id: 'rem001', disposition: 'exposed', ownerLogline: 'Remi Whitman',
      summary: 'Remi watches Marcus', fullDescription: 'REMI.1 - 9:02PM - ...',
      characterRefs: [], tags: []
    }];
    const { exposed } = routeTokensByDisposition(tokens);
    expect(exposed[0].temporalContext).toBe('PARTY');
  });

  test('buried tokens get INVESTIGATION temporal context', () => {
    const tokens = [{
      disposition: 'buried', shellAccount: 'Burns', transactionAmount: 75000,
      sessionTransactionTime: '10:30 PM'
    }];
    const { buried } = routeTokensByDisposition(tokens);
    expect(buried[0].temporalContext).toBe('INVESTIGATION');
  });
});

describe('extractEvidenceSummary temporal tags', () => {
  test('exposed tokens carry temporalContext through to summary', () => {
    const bundle = {
      exposed: {
        tokens: [{ id: 'rem001', owner: 'Remi', summary: 'test', temporalContext: 'PARTY', characterRefs: [] }],
        paperEvidence: [{ id: 'p1', name: 'Doc', summary: 'test', temporalContext: 'BACKGROUND', characterRefs: [] }]
      },
      buried: {
        transactions: [{ shellAccount: 'Burns', amount: 75000, time: '10:30 PM', temporalContext: 'INVESTIGATION' }]
      }
    };
    const result = extractEvidenceSummary(bundle);
    expect(result.exposedTokens[0].timeline).toBe('PARTY');
    expect(result.exposedPaper[0].timeline).toBe('BACKGROUND');
    expect(result.buriedTransactions[0].timeline).toBe('INVESTIGATION');
  });

  test('falls back to lowercase defaults when temporalContext missing', () => {
    const bundle = {
      exposed: {
        tokens: [{ id: 'rem001', owner: 'Remi', summary: 'test', characterRefs: [] }],
        paperEvidence: [{ id: 'p1', name: 'Doc', summary: 'test', characterRefs: [] }]
      },
      buried: {
        transactions: [{ shellAccount: 'Burns', amount: 75000, time: '10:30 PM' }]
      }
    };
    const result = extractEvidenceSummary(bundle);
    expect(result.exposedTokens[0].timeline).toBe('party-night');
    expect(result.exposedPaper[0].timeline).toBe('BACKGROUND');
    expect(result.buriedTransactions[0].timeline).toBe('investigation');
  });
});
