/**
 * Evidence Preprocessor Unit Tests
 *
 * Tests for the batch processing module that summarizes evidence
 * before theme-specific curation.
 *
 * See ARCHITECTURE_DECISIONS.md 8.5.1-8.5.5 for design rationale.
 */

const {
  createEvidencePreprocessor,
  createMockPreprocessor,
  BATCH_SIZE,
  CONCURRENCY,
  _testing: {
    createBatches,
    processWithConcurrency,
    createEmptyResult,
    normalizePlayerFocus
  }
} = require('../../lib/evidence-preprocessor');

describe('evidence-preprocessor', () => {
  describe('module exports', () => {
    it('exports createEvidencePreprocessor factory', () => {
      expect(typeof createEvidencePreprocessor).toBe('function');
    });

    it('exports createMockPreprocessor factory', () => {
      expect(typeof createMockPreprocessor).toBe('function');
    });

    it('exports BATCH_SIZE constant', () => {
      expect(typeof BATCH_SIZE).toBe('number');
      expect(BATCH_SIZE).toBe(8);
    });

    it('exports CONCURRENCY constant', () => {
      expect(typeof CONCURRENCY).toBe('number');
      expect(CONCURRENCY).toBe(4);
    });
  });

  describe('createEvidencePreprocessor', () => {
    it('throws error when callClaude is not provided', () => {
      expect(() => createEvidencePreprocessor()).toThrow('callClaude function is required');
    });

    it('returns object with process method', () => {
      const mockClaude = jest.fn();
      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      expect(typeof preprocessor.process).toBe('function');
    });
  });

  describe('createBatches', () => {
    it('splits items into correct number of batches', () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const batches = createBatches(items, 8);

      expect(batches.length).toBe(4);
    });

    it('first batches have full size', () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const batches = createBatches(items, 8);

      expect(batches[0].length).toBe(8);
      expect(batches[1].length).toBe(8);
      expect(batches[2].length).toBe(8);
    });

    it('last batch has remaining items', () => {
      const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
      const batches = createBatches(items, 8);

      expect(batches[3].length).toBe(1);
    });

    it('handles empty array', () => {
      const batches = createBatches([], 8);

      expect(batches.length).toBe(0);
    });

    it('handles array smaller than batch size', () => {
      const items = [{ id: 1 }, { id: 2 }];
      const batches = createBatches(items, 8);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(2);
    });

    it('handles array exactly equal to batch size', () => {
      const items = Array.from({ length: 8 }, (_, i) => ({ id: i }));
      const batches = createBatches(items, 8);

      expect(batches.length).toBe(1);
      expect(batches[0].length).toBe(8);
    });
  });

  describe('processWithConcurrency', () => {
    it('processes all items', async () => {
      const items = [1, 2, 3, 4, 5];
      const results = await processWithConcurrency(items, 2, async (item) => item * 2);

      expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    it('maintains order despite concurrent processing', async () => {
      const items = [1, 2, 3, 4, 5, 6];
      const results = await processWithConcurrency(items, 3, async (item, index) => {
        // Add variable delay to test ordering
        await new Promise(resolve => setTimeout(resolve, (6 - index) * 10));
        return { item, index };
      });

      expect(results.map(r => r.index)).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('handles empty array', async () => {
      const results = await processWithConcurrency([], 4, async (item) => item);

      expect(results).toEqual([]);
    });

    it('respects concurrency limit', async () => {
      const concurrent = [];
      let maxConcurrent = 0;

      const items = [1, 2, 3, 4, 5, 6, 7, 8];
      await processWithConcurrency(items, 2, async (item) => {
        concurrent.push(item);
        maxConcurrent = Math.max(maxConcurrent, concurrent.length);
        await new Promise(resolve => setTimeout(resolve, 20));
        concurrent.pop();
        return item;
      });

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('createEmptyResult', () => {
    it('returns valid empty result structure', () => {
      const result = createEmptyResult('test-session', {}, Date.now());

      expect(result.items).toEqual([]);
      expect(result.sessionId).toBe('test-session');
      expect(result.preprocessedAt).toBeDefined();
      expect(result.stats.totalItems).toBe(0);
    });

    it('includes playerFocus in result', () => {
      const playerFocus = {
        primaryInvestigation: 'Test investigation',
        emotionalHook: 'Test hook',
        openQuestions: ['Q1', 'Q2']
      };
      const result = createEmptyResult('test', playerFocus, Date.now());

      expect(result.playerFocus.primaryInvestigation).toBe('Test investigation');
      expect(result.playerFocus.emotionalHook).toBe('Test hook');
      expect(result.playerFocus.openQuestions).toEqual(['Q1', 'Q2']);
    });

    it('calculates processing time', () => {
      const startTime = Date.now() - 100;
      const result = createEmptyResult('test', {}, startTime);

      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(100);
    });

    it('initializes significance counts to zero', () => {
      const result = createEmptyResult('test', {}, Date.now());

      expect(result.stats.significanceCounts).toEqual({
        critical: 0,
        supporting: 0,
        contextual: 0,
        background: 0
      });
    });
  });

  describe('normalizePlayerFocus', () => {
    it('extracts core fields from playerFocus', () => {
      const playerFocus = {
        primaryInvestigation: 'Follow the money',
        emotionalHook: 'Betrayal narrative',
        openQuestions: ['Who funded it?', 'When did it start?'],
        extraField: 'should be ignored'
      };
      const result = normalizePlayerFocus(playerFocus);

      expect(result.primaryInvestigation).toBe('Follow the money');
      expect(result.emotionalHook).toBe('Betrayal narrative');
      expect(result.openQuestions).toEqual(['Who funded it?', 'When did it start?']);
      expect(result.extraField).toBeUndefined();
    });

    it('handles undefined input', () => {
      const result = normalizePlayerFocus(undefined);

      expect(result.primaryInvestigation).toBeNull();
      expect(result.emotionalHook).toBeNull();
      expect(result.openQuestions).toEqual([]);
    });

    it('handles empty object', () => {
      const result = normalizePlayerFocus({});

      expect(result.primaryInvestigation).toBeNull();
      expect(result.emotionalHook).toBeNull();
      expect(result.openQuestions).toEqual([]);
    });

    it('handles partial playerFocus', () => {
      const result = normalizePlayerFocus({
        primaryInvestigation: 'Only this field'
      });

      expect(result.primaryInvestigation).toBe('Only this field');
      expect(result.emotionalHook).toBeNull();
      expect(result.openQuestions).toEqual([]);
    });
  });

  describe('createMockPreprocessor', () => {
    it('returns object with process method', () => {
      const mock = createMockPreprocessor();

      expect(typeof mock.process).toBe('function');
    });

    it('returns object with call tracking methods', () => {
      const mock = createMockPreprocessor();

      expect(typeof mock.getCalls).toBe('function');
      expect(typeof mock.getLastCall).toBe('function');
      expect(typeof mock.clearCalls).toBe('function');
    });

    it('process returns valid preprocessed structure', async () => {
      const mock = createMockPreprocessor();
      const result = await mock.process({
        memoryTokens: [{ id: 't1' }, { id: 't2' }],
        paperEvidence: [{ id: 'e1' }],
        sessionId: 'test-123'
      });

      expect(result.items.length).toBe(3);
      expect(result.sessionId).toBe('test-123');
      expect(result.preprocessedAt).toBeDefined();
      expect(result.stats).toBeDefined();
    });

    it('tracks calls', async () => {
      const mock = createMockPreprocessor();

      await mock.process({ memoryTokens: [{ id: '1' }], sessionId: 'call1' });
      await mock.process({ memoryTokens: [{ id: '2' }], sessionId: 'call2' });

      expect(mock.getCalls().length).toBe(2);
      expect(mock.getLastCall().sessionId).toBe('call2');
    });

    it('clearCalls resets call log', async () => {
      const mock = createMockPreprocessor();

      await mock.process({ memoryTokens: [{ id: '1' }] });
      mock.clearCalls();

      expect(mock.getCalls().length).toBe(0);
      expect(mock.getLastCall()).toBeNull();
    });

    it('uses custom summaryPrefix', async () => {
      const mock = createMockPreprocessor({ summaryPrefix: 'Custom' });
      const result = await mock.process({
        memoryTokens: [{ id: '1' }],
        paperEvidence: []
      });

      expect(result.items[0].summary).toContain('Custom');
    });

    it('uses custom items if provided', async () => {
      const customItems = [{ id: 'custom', summary: 'Custom item' }];
      const mock = createMockPreprocessor({ items: customItems });
      const result = await mock.process({
        memoryTokens: [{ id: '1' }],
        paperEvidence: []
      });

      expect(result.items).toEqual(customItems);
    });

    it('assigns significance levels to items', async () => {
      const mock = createMockPreprocessor();
      const result = await mock.process({
        memoryTokens: [{ id: '1' }, { id: '2' }, { id: '3' }],
        paperEvidence: [{ id: '4' }]
      });

      // First token is critical, rest are supporting
      expect(result.items[0].significance).toBe('critical');
      expect(result.items[1].significance).toBe('supporting');
      expect(result.items[2].significance).toBe('supporting');
      // Paper evidence is contextual
      expect(result.items[3].significance).toBe('contextual');
    });
  });

  describe('process integration', () => {
    it('returns empty result when no evidence provided', async () => {
      const mockClaude = jest.fn();
      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      const result = await preprocessor.process({
        memoryTokens: [],
        paperEvidence: [],
        sessionId: 'empty-session'
      });

      expect(result.items).toEqual([]);
      expect(result.stats.totalItems).toBe(0);
      expect(mockClaude).not.toHaveBeenCalled();
    });

    it('calls Claude with correct model', async () => {
      const mockClaude = jest.fn().mockResolvedValue(JSON.stringify({
        items: [{
          id: 't1',
          sourceType: 'memory-token',
          summary: 'Test',
          significance: 'critical'
        }]
      }));

      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      await preprocessor.process({
        memoryTokens: [{ id: 't1', type: 'Video' }],
        paperEvidence: [],
        sessionId: 'test'
      });

      expect(mockClaude).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'haiku' })
      );
    });

    it('includes playerFocus in prompt', async () => {
      const mockClaude = jest.fn().mockResolvedValue(JSON.stringify({ items: [] }));
      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      await preprocessor.process({
        memoryTokens: [{ id: 't1' }],
        paperEvidence: [],
        playerFocus: { primaryInvestigation: 'Money trail investigation' },
        sessionId: 'test'
      });

      expect(mockClaude).toHaveBeenCalledWith(
        expect.objectContaining({
          systemPrompt: expect.stringContaining('Money trail investigation')
        })
      );
    });

    it('handles Claude errors gracefully with fallback items', async () => {
      const mockClaude = jest.fn().mockRejectedValue(new Error('API timeout'));
      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      const result = await preprocessor.process({
        memoryTokens: [{ id: 't1', name: 'Test Token' }],
        paperEvidence: [],
        sessionId: 'test'
      });

      // Should have fallback item
      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('t1');
      expect(result.items[0].significance).toBe('contextual');
    });

    it('calculates significance counts correctly', async () => {
      const mockClaude = jest.fn().mockResolvedValue(JSON.stringify({
        items: [
          { id: 't1', sourceType: 'memory-token', summary: 'A', significance: 'critical' },
          { id: 't2', sourceType: 'memory-token', summary: 'B', significance: 'supporting' },
          { id: 'e1', sourceType: 'paper-evidence', summary: 'C', significance: 'contextual' }
        ]
      }));

      const preprocessor = createEvidencePreprocessor({ callClaude: mockClaude });

      const result = await preprocessor.process({
        memoryTokens: [{ id: 't1' }, { id: 't2' }],
        paperEvidence: [{ id: 'e1' }],
        sessionId: 'test'
      });

      expect(result.stats.significanceCounts.critical).toBe(1);
      expect(result.stats.significanceCounts.supporting).toBe(1);
      expect(result.stats.significanceCounts.contextual).toBe(1);
    });
  });
});
