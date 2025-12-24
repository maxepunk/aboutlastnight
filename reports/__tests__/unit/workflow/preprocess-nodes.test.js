/**
 * Preprocess Nodes Unit Tests
 *
 * Tests for the preprocessEvidence node that batch-summarizes
 * evidence before theme-specific curation.
 *
 * See ARCHITECTURE_DECISIONS.md 8.5.1-8.5.5 for design rationale.
 */

const {
  preprocessEvidence,
  createMockPreprocessor,
  _testing: { getPreprocessor }
} = require('../../../lib/workflow/nodes/preprocess-nodes');
const { PHASES } = require('../../../lib/workflow/state');

describe('preprocess-nodes', () => {
  describe('module exports', () => {
    it('exports preprocessEvidence function', () => {
      expect(typeof preprocessEvidence).toBe('function');
    });

    it('exports createMockPreprocessor function', () => {
      expect(typeof createMockPreprocessor).toBe('function');
    });
  });

  describe('getPreprocessor', () => {
    it('returns injected preprocessor from config', () => {
      const mockPreprocessor = { process: jest.fn() };
      const config = { configurable: { preprocessor: mockPreprocessor } };

      const result = getPreprocessor(config);

      expect(result).toBe(mockPreprocessor);
    });

    it('returns mock preprocessor when useMockPreprocessor is true', () => {
      const config = { configurable: { useMockPreprocessor: true } };

      const result = getPreprocessor(config);

      expect(typeof result.process).toBe('function');
    });

    it('uses mockPreprocessorData when provided', () => {
      const config = {
        configurable: {
          useMockPreprocessor: true,
          mockPreprocessorData: { summaryPrefix: 'Custom' }
        }
      };

      const result = getPreprocessor(config);

      expect(typeof result.process).toBe('function');
    });
  });

  describe('preprocessEvidence', () => {
    describe('skip logic', () => {
      it('skips when preprocessedEvidence already exists', async () => {
        const state = {
          preprocessedEvidence: { items: [{ id: 'existing' }] },
          memoryTokens: [{ id: 't1' }]
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.currentPhase).toBe(PHASES.PREPROCESS_EVIDENCE);
        expect(result.preprocessedEvidence).toBeUndefined(); // No update when skipping
      });

      it('skips when no evidence to preprocess', async () => {
        const state = {
          memoryTokens: [],
          paperEvidence: []
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.currentPhase).toBe(PHASES.PREPROCESS_EVIDENCE);
        expect(result.preprocessedEvidence.items).toEqual([]);
        expect(result.preprocessedEvidence.stats.totalItems).toBe(0);
      });

      it('skips when memoryTokens and paperEvidence are undefined', async () => {
        const state = {};
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.currentPhase).toBe(PHASES.PREPROCESS_EVIDENCE);
        expect(result.preprocessedEvidence.items).toEqual([]);
      });
    });

    describe('processing', () => {
      it('processes memoryTokens', async () => {
        const state = {
          memoryTokens: [{ id: 't1' }, { id: 't2' }],
          paperEvidence: [],
          sessionId: 'test-session'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.preprocessedEvidence.items.length).toBe(2);
        expect(result.currentPhase).toBe(PHASES.PREPROCESS_EVIDENCE);
      });

      it('processes paperEvidence', async () => {
        const state = {
          memoryTokens: [],
          paperEvidence: [{ id: 'e1' }, { id: 'e2' }, { id: 'e3' }],
          sessionId: 'test-session'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.preprocessedEvidence.items.length).toBe(3);
      });

      it('processes both tokens and evidence', async () => {
        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [{ id: 'e1' }],
          sessionId: 'test-session'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.preprocessedEvidence.items.length).toBe(2);
      });

      it('includes playerFocus in result', async () => {
        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [],
          playerFocus: { primaryInvestigation: 'Test investigation' },
          sessionId: 'test-session'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.preprocessedEvidence.playerFocus.primaryInvestigation).toBe('Test investigation');
      });

      it('includes sessionId in result', async () => {
        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [],
          sessionId: 'my-session-123'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        expect(result.preprocessedEvidence.sessionId).toBe('my-session-123');
      });
    });

    describe('dependency injection', () => {
      it('uses injected preprocessor', async () => {
        const mockPreprocessor = {
          process: jest.fn().mockResolvedValue({
            items: [{ id: 'injected' }],
            preprocessedAt: new Date().toISOString(),
            sessionId: 'test',
            playerFocus: {},
            stats: { totalItems: 1 }
          })
        };

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: []
        };
        const config = { configurable: { preprocessor: mockPreprocessor } };

        const result = await preprocessEvidence(state, config);

        expect(mockPreprocessor.process).toHaveBeenCalled();
        expect(result.preprocessedEvidence.items[0].id).toBe('injected');
      });

      it('passes correct input to preprocessor', async () => {
        const mockPreprocessor = {
          process: jest.fn().mockResolvedValue({
            items: [],
            preprocessedAt: new Date().toISOString(),
            sessionId: 'test',
            playerFocus: {},
            stats: { totalItems: 0 }
          })
        };

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [{ id: 'e1' }],
          playerFocus: { primaryInvestigation: 'Test' },
          sessionId: 'session-456'
        };
        const config = { configurable: { preprocessor: mockPreprocessor } };

        await preprocessEvidence(state, config);

        expect(mockPreprocessor.process).toHaveBeenCalledWith({
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [{ id: 'e1' }],
          playerFocus: { primaryInvestigation: 'Test' },
          sessionId: 'session-456'
        });
      });
    });

    describe('error handling', () => {
      it('returns error state when preprocessing fails', async () => {
        const failingPreprocessor = {
          process: jest.fn().mockRejectedValue(new Error('Processing failed'))
        };

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: []
        };
        const config = { configurable: { preprocessor: failingPreprocessor } };

        const result = await preprocessEvidence(state, config);

        expect(result.currentPhase).toBe(PHASES.ERROR);
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBe(1);
        expect(result.errors[0].type).toBe('preprocessing-failed');
        expect(result.errors[0].message).toBe('Processing failed');
      });

      it('error includes phase information', async () => {
        const failingPreprocessor = {
          process: jest.fn().mockRejectedValue(new Error('API timeout'))
        };

        const state = { memoryTokens: [{ id: 't1' }], paperEvidence: [] };
        const config = { configurable: { preprocessor: failingPreprocessor } };

        const result = await preprocessEvidence(state, config);

        expect(result.errors[0].phase).toBe(PHASES.PREPROCESS_EVIDENCE);
        expect(result.errors[0].timestamp).toBeDefined();
      });
    });

    describe('state updates', () => {
      it('returns partial state update', async () => {
        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [],
          sessionId: 'test',
          // These should NOT be in the result (not part of this node's update)
          existingField: 'should-not-be-in-result'
        };
        const config = { configurable: { useMockPreprocessor: true } };

        const result = await preprocessEvidence(state, config);

        // Should only contain preprocessedEvidence and currentPhase
        expect(result.preprocessedEvidence).toBeDefined();
        expect(result.currentPhase).toBeDefined();
        expect(result.existingField).toBeUndefined();
      });
    });
  });

  describe('createMockPreprocessor', () => {
    it('creates mock with process method', () => {
      const mock = createMockPreprocessor();

      expect(typeof mock.process).toBe('function');
    });

    it('returns valid structure from process', async () => {
      const mock = createMockPreprocessor();
      const result = await mock.process({
        memoryTokens: [{ id: '1' }],
        paperEvidence: [],
        sessionId: 'test'
      });

      expect(result.items).toBeDefined();
      expect(result.preprocessedAt).toBeDefined();
      expect(result.sessionId).toBe('test');
      expect(result.stats).toBeDefined();
    });

    it('uses mockPreprocessorData for customization', async () => {
      const mock = createMockPreprocessor({ summaryPrefix: 'CustomPrefix' });
      const result = await mock.process({
        memoryTokens: [{ id: '1' }],
        paperEvidence: []
      });

      expect(result.items[0].summary).toContain('CustomPrefix');
    });
  });
});
