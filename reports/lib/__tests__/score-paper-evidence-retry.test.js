const { _testing } = require('../workflow/nodes/ai-nodes');

describe('scorePaperEvidence batch retry on timeout', () => {
  const fn = _testing?.scorePaperEvidence;

  test('_testing.scorePaperEvidence is exported', () => {
    expect(fn).toBeDefined();
  });

  test('retries batch once on timeout error and returns success', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('SDK timeout after 120.0s (limit: 120s) - Paper evidence batch 1/1');
      }
      return {
        items: [{ id: 'p1', name: 'Doc1', score: 3, include: true, criteriaMatched: ['ROSTER'] }]
      };
    };

    const paperItems = [{
      id: 'p1',
      fullContent: 'content',
      rawData: { name: 'Doc1', content: 'content' }
    }];

    const merged = await fn(paperItems, {
      roster: [],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(callCount).toBe(2);
    expect(merged[0].include).toBe(true);
    expect(merged[0].excludeReason).toBeUndefined();
  });

  test('after one retry failure, falls through to fallback (rescuable scoringError)', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('SDK timeout after 120.0s');
    };

    const paperItems = [{
      id: 'p1',
      fullContent: 'content',
      rawData: { name: 'Doc1', content: 'content' }
    }];

    const merged = await fn(paperItems, {
      roster: [],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(callCount).toBe(2);
    expect(merged[0].include).toBe(false);
    expect(merged[0].excludeReason).toBe('scoringError');
    expect(merged[0].rescuable).toBe(true);
  });

  test('does not retry on non-timeout errors (e.g. schema validation failure)', async () => {
    let callCount = 0;
    const sdk = async () => {
      callCount++;
      throw new Error('Schema validation failed');
    };

    const paperItems = [{ id: 'p1', fullContent: 'c', rawData: { name: 'D' } }];

    const merged = await fn(paperItems, {
      roster: [], suspects: [], exposedTokenSummaries: [], playerFocus: {}
    }, sdk);

    expect(callCount).toBe(1);
    expect(merged[0].excludeReason).toBe('scoringError');
  });
});
