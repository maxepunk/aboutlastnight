/**
 * Preprocess Nodes Unit Tests
 *
 * Tests for the preprocessEvidence node that batch-summarizes
 * evidence before theme-specific curation.
 *
 * See ARCHITECTURE_DECISIONS.md 8.5.1-8.5.5 for design rationale.
 */

// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests
// Uses shared mock - see __tests__/mocks/checkpoint-helpers.mock.js
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

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

      // NOTE: 'includes playerFocus in result' test removed - playerFocus removed in SRP fix (Phase 3)

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
      // H12: the node used to CATCH a preprocessor failure and return an empty
      // result plus currentPhase: ERROR, which trapped the session (see
      // preprocess-nodes-failloud.test.js). It now throws, so the graph's
      // LLM_RETRY policy can retry it and a persistent failure surfaces.
      it('rejects with the preprocessor error instead of returning an error state', async () => {
        const failingPreprocessor = {
          process: jest.fn().mockRejectedValue(new Error('Processing failed'))
        };

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: []
        };
        const config = { configurable: { preprocessor: failingPreprocessor } };

        await expect(preprocessEvidence(state, config)).rejects.toThrow('Processing failed');
      });

      it('writes no preprocessedEvidence on failure (nothing for the skip guard to latch onto)', async () => {
        const failingPreprocessor = {
          process: jest.fn().mockRejectedValue(new Error('API timeout'))
        };

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [],
          sessionId: 'error-test',
          playerFocus: { primaryInvestigation: 'Test investigation' }
        };
        const config = { configurable: { preprocessor: failingPreprocessor } };

        const outcome = await preprocessEvidence(state, config).then(
          (result) => ({ resolved: result }),
          (error) => ({ rejected: error })
        );

        expect(outcome.resolved).toBeUndefined();
        expect(outcome.rejected.message).toBe('API timeout');
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

    // NOTE: Background paper merge tests removed - parallel branches handle this now
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
