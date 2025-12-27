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

      it('sets preprocessedEvidence to empty result on error (not null)', async () => {
        // This ensures retry logic can distinguish "not attempted" (null) from "failed" (empty)
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

        const result = await preprocessEvidence(state, config);

        // Should have empty result, NOT null/undefined
        expect(result.preprocessedEvidence).toBeDefined();
        expect(result.preprocessedEvidence.items).toEqual([]);
        expect(result.preprocessedEvidence.sessionId).toBe('error-test');
        expect(result.preprocessedEvidence.stats.totalItems).toBe(0);
        // NOTE: playerFocus assertion removed - playerFocus removed in SRP fix (Phase 3)
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

    // Phase 4a: Background paper evidence merge tests
    describe('background paper merge (Phase 4a)', () => {
      // Mock getBackgroundResultOrWait to return paper results
      let originalModule;

      beforeEach(() => {
        // Save original to restore later
        originalModule = jest.requireActual('../../../lib/background-pipeline-manager');
      });

      it('merges background paper evidence with token-only preprocessing', async () => {
        // Create mock preprocessor that will be called twice (once for paper, once for tokens)
        const mockPreprocessor = {
          process: jest.fn()
            .mockResolvedValueOnce({
              items: [{ id: 'token-1', sourceType: 'memory-token', summary: 'Token summary' }],
              preprocessedAt: new Date().toISOString(),
              sessionId: 'merge-test',
              stats: {
                totalItems: 1,
                memoryTokenCount: 1,
                paperEvidenceCount: 0,
                batchesProcessed: 1,
                processingTimeMs: 50
              }
            })
        };

        // Create mock background result for paper evidence
        const bgPaperResult = {
          items: [
            { id: 'paper-1', sourceType: 'paper-evidence', summary: 'Paper summary 1' },
            { id: 'paper-2', sourceType: 'paper-evidence', summary: 'Paper summary 2' }
          ],
          preprocessedAt: new Date().toISOString(),
          sessionId: 'merge-test',
          stats: {
            totalItems: 2,
            memoryTokenCount: 0,
            paperEvidenceCount: 2,
            batchesProcessed: 1,
            processingTimeMs: 100
          }
        };

        // Mock getBackgroundResultOrWait
        jest.doMock('../../../lib/background-pipeline-manager', () => ({
          ...originalModule,
          getBackgroundResultOrWait: jest.fn()
            .mockResolvedValueOnce(null)  // First call: no full preprocessed result
            .mockResolvedValueOnce(bgPaperResult)  // Second call: paper result available
        }));

        // Clear module cache to pick up mock
        jest.resetModules();
        const { preprocessEvidence: mockedPreprocess } = require('../../../lib/workflow/nodes/preprocess-nodes');

        const state = {
          memoryTokens: [{ id: 't1' }],
          paperEvidence: [{ id: 'p1' }, { id: 'p2' }],
          sessionId: 'merge-test'
        };
        const config = { configurable: { preprocessor: mockPreprocessor } };

        const result = await mockedPreprocess(state, config);

        // Should have merged items
        expect(result.preprocessedEvidence.items.length).toBe(3); // 2 paper + 1 token
        expect(result.preprocessedEvidence.stats.paperFromBackground).toBe(true);
        expect(result.preprocessedEvidence.stats.paperEvidenceCount).toBe(2);
        expect(result.preprocessedEvidence.stats.memoryTokenCount).toBe(1);

        // Restore original module
        jest.dontMock('../../../lib/background-pipeline-manager');
        jest.resetModules();
      });

      it('includes batchesProcessed in merged stats', async () => {
        // This test ensures the merged result has consistent stats structure
        const mockPreprocessor = {
          process: jest.fn().mockResolvedValue({
            items: [{ id: 'token-1' }],
            stats: { memoryTokenCount: 1, batchesProcessed: 1, processingTimeMs: 50 }
          })
        };

        const bgPaperResult = {
          items: [{ id: 'paper-1' }],
          stats: { paperEvidenceCount: 1, batchesProcessed: 2, processingTimeMs: 100 }
        };

        jest.doMock('../../../lib/background-pipeline-manager', () => ({
          ...originalModule,
          getBackgroundResultOrWait: jest.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(bgPaperResult)
        }));

        jest.resetModules();
        const { preprocessEvidence: mockedPreprocess } = require('../../../lib/workflow/nodes/preprocess-nodes');

        const state = { memoryTokens: [{ id: 't1' }], sessionId: 'batch-test' };
        const config = { configurable: { preprocessor: mockPreprocessor } };

        const result = await mockedPreprocess(state, config);

        // Should combine batches from both preprocessing runs
        expect(result.preprocessedEvidence.stats.batchesProcessed).toBe(3); // 2 + 1

        jest.dontMock('../../../lib/background-pipeline-manager');
        jest.resetModules();
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
