// IMPORTANT: input shape note. The preprocessor wraps the entire input item as
// `rawData: token` (memory tokens) or `rawData: evidence` (paper evidence) at
// `lib/evidence-preprocessor.js:197-219`. Pass FLAT fields in test input — do
// NOT wrap them in a `rawData` key, or the internal rawData will be
// double-nested.

const { createEvidencePreprocessor } = require('../evidence-preprocessor');

describe('evidence preprocessor preserves rawData', () => {
  test('happy-path: rawData is carried through to output items (paper evidence)', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'p1',
        sourceType: 'paper-evidence',
        disposition: 'exposed',
        summary: 'A short summary',
        characterRefs: [],
        ownerLogline: 'Owner X',
        tags: ['t1']
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        notionId: 'p1',
        name: 'Important Document',
        description: 'Full description text we must preserve',
        content: 'Actual full content body',
        owners: ['Owner X'],
        narrativeThreads: ['thread-a']
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    const item = result.items[0];

    expect(item.rawData).toBeDefined();
    expect(item.rawData.name).toBe('Important Document');
    expect(item.rawData.content).toBe('Actual full content body');
    expect(item.rawData.narrativeThreads).toEqual(['thread-a']);
  });

  test('fallback path (SDK error): rawData is still preserved', async () => {
    const failingSdk = async () => { throw new Error('SDK timeout'); };

    const preprocessor = createEvidencePreprocessor({ sdkClient: failingSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        notionId: 'p1',
        name: 'Important Doc',
        description: 'Full description',
        content: 'Content body'
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    const item = result.items[0];

    expect(item.rawData).toBeDefined();
    expect(item.rawData.content).toBe('Content body');
  });

  test('exposed paper item retains fullContent extracted from rawData', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'p1', sourceType: 'paper-evidence', disposition: 'exposed',
        summary: 'short', characterRefs: [], tags: []
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const input = {
      memoryTokens: [],
      paperEvidence: [{
        notionId: 'p1',
        name: 'Doc',
        content: 'Verbatim content for quoting'
      }],
      sessionId: 'test'
    };

    const result = await preprocessor.process(input);
    expect(result.items[0].fullContent).toBe('Verbatim content for quoting');
  });

  // C3 ⊕ buried-data-leak boundary:
  test('buried memory tokens do NOT carry rawData with content', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'b1',
        sourceType: 'memory-token',
        disposition: 'buried',
        summary: 'A buried token',
        characterRefs: [],
        tags: [],
        ownerLogline: null,
        narrativeTimelineRef: null,
        sfFields: {}
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const result = await preprocessor.process({
      memoryTokens: [{
        tokenId: 'b1',
        disposition: 'buried',
        fullDescription: 'SECRET buried memory content',
        name: 'Buried Token',
        shellAccount: 'Cayman',
        transactionAmount: 150000
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const item = result.items[0];
    expect(item.disposition).toBe('buried');
    expect(item.fullContent).toBeUndefined();
    expect(item.rawData).toBeUndefined();
    expect(item.shellAccount).toBe('Cayman');
    expect(item.transactionAmount).toBe(150000);
  });

  test('exposed memory tokens DO carry rawData (with fullDescription)', async () => {
    const fakeSdk = async () => ({
      items: [{
        id: 'e1',
        sourceType: 'memory-token',
        disposition: 'exposed',
        summary: 'An exposed token',
        characterRefs: [],
        tags: [],
        ownerLogline: 'Riley',
        narrativeTimelineRef: null,
        sfFields: {}
      }]
    });

    const preprocessor = createEvidencePreprocessor({ sdkClient: fakeSdk });
    const result = await preprocessor.process({
      memoryTokens: [{
        tokenId: 'e1',
        disposition: 'exposed',
        fullDescription: 'Visible exposed content',
        name: 'Exposed Token'
      }],
      paperEvidence: [],
      sessionId: 'test'
    });

    const item = result.items[0];
    expect(item.disposition).toBe('exposed');
    expect(item.rawData).toBeDefined();
    expect(item.rawData.fullDescription).toBe('Visible exposed content');
  });
});

const { _testing } = require('../workflow/nodes/ai-nodes');

describe('scorePaperEvidence preserves fullContent through merge', () => {
  const fn = _testing?.scorePaperEvidence;

  test('_testing.scorePaperEvidence is exported', () => {
    expect(fn).toBeDefined();
  });

  test('merged result carries original.fullContent and original.rawData', async () => {
    const sdk = async () => ({
      items: [
        { id: 'p1', name: 'Doc1', score: 3, include: true, criteriaMatched: ['ROSTER'] }
      ]
    });

    const paperItems = [{
      id: 'p1',
      fullContent: 'Original full content body',
      rawData: { name: 'Doc1', content: 'Original full content body', narrativeThreads: ['t1'] }
    }];

    const merged = await fn(paperItems, {
      roster: ['Alice'],
      suspects: [],
      exposedTokenSummaries: [],
      playerFocus: {}
    }, sdk);

    expect(merged[0].rawData).toBeDefined();
    expect(merged[0].fullContent).toBe('Original full content body');
  });
});
