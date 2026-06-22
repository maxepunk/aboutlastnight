const { _testing } = require('../workflow/nodes/ai-nodes');

// N5/TRC-2 fail-loud contract: scorePaperEvidence makes ONE sdk attempt per batch
// and does NOT retry in-node (curateEvidenceBundle's graph retryPolicy is the SOLE
// retrier). A batch failure — timeout OR non-timeout — PROPAGATES (throws); it is no
// longer swallowed into include:false / excludeReason:'scoringError' placeholders
// (which silently dropped real exposed evidence and disguised it as "low relevance"
// at the rescue checkpoint). A single paper item produces exactly one batch, so the
// sdk call count is exact.
describe('scorePaperEvidence fail-loud (single attempt, no in-node retry)', () => {
  const fn = _testing?.scorePaperEvidence;

  const ctx = { roster: [], suspects: [], exposedTokenSummaries: [], playerFocus: {} };
  const singleItem = [{
    id: 'p1',
    fullContent: 'content',
    rawData: { name: 'Doc1', content: 'content' }
  }];

  test('_testing.scorePaperEvidence is exported', () => {
    expect(fn).toBeDefined();
  });

  test('success: a single sdk call yields merged included items (no retry layer)', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      return {
        items: [{ id: 'p1', name: 'Doc1', score: 3, include: true, criteriaMatched: ['ROSTER'] }]
      };
    };

    const merged = await fn(singleItem, ctx, sdk);

    // Exactly ONE attempt — proves there is no in-node retry layer.
    expect(callCount).toBe(1);
    expect(merged[0].include).toBe(true);
    expect(merged[0].excludeReason).toBeUndefined();
    // Merge preserves original rawData/fullContent.
    expect(merged[0].fullContent).toBe('content');
  });

  test('timeout failure: rejects (does not swallow to scoringError) with ONE sdk call', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('SDK timeout after 120.0s (limit: 120s) - Paper evidence batch 1/1');
    };

    await expect(fn(singleItem, ctx, sdk)).rejects.toThrow(/timeout/i);
    // No in-node retry: the graph retryPolicy on curateEvidenceBundle is the sole retrier.
    expect(callCount).toBe(1);
  });

  test('non-timeout failure: rejects (no scoringError swallow) with ONE sdk call', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('Schema validation failed');
    };

    await expect(fn(singleItem, ctx, sdk)).rejects.toThrow(/schema|validation/i);
    expect(callCount).toBe(1);
  });
});
