/**
 * Workflow Integration Tests - Commit 8.6
 *
 * Tests the complete report generation graph flow including:
 * - Approval checkpoints pause execution
 * - Arc specialists run and synthesize
 * - Evaluator loops with revision caps
 * - Full pipeline completion with mock approvals
 * - Error handling and state transitions
 *
 * Uses mock clients injected via config.configurable to test
 * graph behavior without real API calls.
 */

const path = require('path');
const {
  createReportGraph,
  createReportGraphNoCheckpoint,
  _testing: {
    routeEvidenceApproval,
    routeArcEvaluation,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeSchemaValidation
  }
} = require('../../lib/workflow/graph');
const { PHASES, APPROVAL_TYPES, REVISION_CAPS, getDefaultState } = require('../../lib/workflow/state');
const { mocks } = require('../../lib/workflow/nodes');

// Fixtures data directory for session files
const FIXTURES_DATA_DIR = path.join(__dirname, '..', 'fixtures', 'sessions');

// Load fixtures
const mockEvidenceBundle = require('../fixtures/mock-responses/evidence-bundle.json');
const mockArcAnalysis = require('../fixtures/mock-responses/arc-analysis.json');
const mockOutline = require('../fixtures/mock-responses/outline.json');
const mockContentBundle = require('../fixtures/content-bundles/valid-journalist.json');
const mockValidationPassed = require('../fixtures/mock-responses/validation-results.json');
const mockValidationFailed = require('../fixtures/mock-responses/validation-results-failed.json');
const mockPreprocessedEvidence = require('../fixtures/mock-responses/preprocessed-evidence.json');

describe('workflow integration', () => {
  describe('routing functions', () => {
    describe('routeEvidenceApproval', () => {
      it('returns "wait" when awaitingApproval is true', () => {
        expect(routeEvidenceApproval({ awaitingApproval: true })).toBe('wait');
      });

      it('returns "continue" when awaitingApproval is false', () => {
        expect(routeEvidenceApproval({ awaitingApproval: false })).toBe('continue');
      });

      it('returns "continue" when awaitingApproval is undefined', () => {
        expect(routeEvidenceApproval({})).toBe('continue');
      });
    });

    describe('routeArcEvaluation', () => {
      it('returns "checkpoint" when evaluation ready', () => {
        expect(routeArcEvaluation({
          evaluationHistory: [{ ready: true }],
          arcRevisionCount: 0
        })).toBe('checkpoint');
      });

      it('returns "checkpoint" when at revision cap', () => {
        expect(routeArcEvaluation({
          evaluationHistory: [{ ready: false }],
          arcRevisionCount: REVISION_CAPS.ARCS
        })).toBe('checkpoint');
      });

      it('returns "revise" when not ready and under cap', () => {
        expect(routeArcEvaluation({
          evaluationHistory: [{ ready: false }],
          arcRevisionCount: 0
        })).toBe('revise');
      });

      it('returns "error" when in error phase', () => {
        expect(routeArcEvaluation({
          currentPhase: PHASES.ERROR
        })).toBe('error');
      });
    });

    describe('routeOutlineEvaluation', () => {
      it('returns "checkpoint" when evaluation ready', () => {
        expect(routeOutlineEvaluation({
          evaluationHistory: [{ ready: true }],
          outlineRevisionCount: 0
        })).toBe('checkpoint');
      });

      it('returns "checkpoint" when at revision cap', () => {
        expect(routeOutlineEvaluation({
          evaluationHistory: [{ ready: false }],
          outlineRevisionCount: REVISION_CAPS.OUTLINE
        })).toBe('checkpoint');
      });

      it('returns "revise" when not ready and under cap', () => {
        expect(routeOutlineEvaluation({
          evaluationHistory: [{ ready: false }],
          outlineRevisionCount: 1
        })).toBe('revise');
      });
    });

    describe('routeArticleEvaluation', () => {
      it('returns "checkpoint" when evaluation ready', () => {
        expect(routeArticleEvaluation({
          evaluationHistory: [{ ready: true }],
          articleRevisionCount: 0
        })).toBe('checkpoint');
      });

      it('returns "checkpoint" when at revision cap', () => {
        expect(routeArticleEvaluation({
          evaluationHistory: [{ ready: false }],
          articleRevisionCount: REVISION_CAPS.ARTICLE
        })).toBe('checkpoint');
      });

      it('returns "revise" when not ready and under cap', () => {
        expect(routeArticleEvaluation({
          evaluationHistory: [{ ready: false }],
          articleRevisionCount: 2
        })).toBe('revise');
      });
    });

    describe('routeSchemaValidation', () => {
      it('returns "error" when schema validation errors exist', () => {
        expect(routeSchemaValidation({
          errors: [{ type: 'schema-validation', message: 'test' }]
        })).toBe('error');
      });

      it('returns "continue" when errors array is empty', () => {
        expect(routeSchemaValidation({ errors: [] })).toBe('continue');
      });

      it('returns "continue" when no schema-validation errors', () => {
        expect(routeSchemaValidation({
          errors: [{ type: 'other-error' }]
        })).toBe('continue');
      });

      it('returns "continue" when errors is undefined', () => {
        expect(routeSchemaValidation({})).toBe('continue');
      });
    });
  });

  describe('graph creation', () => {
    it('creates graph with MemorySaver checkpointer', () => {
      const graph = createReportGraph();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });

    it('creates graph without checkpointer', () => {
      const graph = createReportGraphNoCheckpoint();
      expect(graph).toBeDefined();
      expect(typeof graph.invoke).toBe('function');
    });
  });

  describe('approval checkpoints', () => {
    // Create config with all mocks for full pipeline
    function createMockConfig(sessionId = 'test-session', fixtures = {}) {
      const sdkClient = mocks.createMockSdkClient({
        evidenceBundle: fixtures.evidenceBundle || mockEvidenceBundle,
        arcAnalysis: fixtures.arcAnalysis || mockArcAnalysis,
        outline: fixtures.outline || mockOutline,
        contentBundle: fixtures.contentBundle || mockContentBundle,
        validationResults: fixtures.validationResults || mockValidationPassed
      });

      const promptBuilder = mocks.createMockPromptBuilder();
      const templateAssembler = mocks.createMockTemplateAssembler();
      const notionClient = mocks.createMockNotionClient({
        tokens: [{ tokenId: 'test-001', content: 'Test token' }],
        paperEvidence: [{ notionId: 'ev-001', description: 'Test evidence' }]
      });

      return {
        configurable: {
          sessionId,  // Required by initializeSession
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          sdkClient,
          promptBuilder,
          templateAssembler,
          notionClient,
          useMockPreprocessor: true,  // Use mock preprocessor for testing
          thread_id: `test-${Date.now()}`
        }
      };
    }

    it('pauses at evidence bundle approval checkpoint', async () => {
      const graph = createReportGraph();
      const config = createMockConfig('test-session');

      // Initial state is minimal - sessionId comes from config
      const initialState = {
        sessionConfig: {
          roster: [{ name: 'Alice' }, { name: 'Bob' }],
          accusation: { accused: ['Blake'] }
        }
      };

      const result = await graph.invoke(initialState, config);

      expect(result.awaitingApproval).toBe(true);
      // Commit 8.6: evidence curation still sets EVIDENCE_BUNDLE approval type
      expect([APPROVAL_TYPES.EVIDENCE_BUNDLE, APPROVAL_TYPES.EVIDENCE_AND_PHOTOS]).toContain(result.approvalType);
      expect(result.evidenceBundle).toBeDefined();
      expect(result.currentPhase).toBe(PHASES.CURATE_EVIDENCE);
    });

    it('continues past evidence approval to arc specialists', async () => {
      const graph = createReportGraph();
      const config = createMockConfig('test-session');

      // Simulate resuming after approval (evidenceBundle already set, awaitingApproval cleared)
      const stateAfterApproval = {
        evidenceBundle: mockEvidenceBundle,
        awaitingApproval: false,
        currentPhase: PHASES.CURATE_EVIDENCE,
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        }
      };

      const result = await graph.invoke(stateAfterApproval, config);

      // Commit 8.6: Should now pause at arc selection checkpoint
      // (after arc specialists + synthesizer + evaluator)
      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });
  });

  describe('full pipeline', () => {
    // Create config that auto-approves everything
    function createAutoApproveConfig(sessionId = 'test-session') {
      // Mock Claude client that returns validation passed
      const sdkClient = mocks.createMockSdkClient({
        evidenceBundle: mockEvidenceBundle,
        arcAnalysis: mockArcAnalysis,
        outline: mockOutline,
        contentBundle: mockContentBundle,
        validationResults: mockValidationPassed
      });

      const promptBuilder = mocks.createMockPromptBuilder();
      const templateAssembler = mocks.createMockTemplateAssembler({
        html: '<html><body>Test Article</body></html>'
      });
      const notionClient = mocks.createMockNotionClient({
        tokens: [{ tokenId: 'test-001' }],
        paperEvidence: [{ notionId: 'ev-001' }]
      });

      // Mock schema validator that always passes
      const schemaValidator = {
        validate: () => ({ valid: true, errors: null })
      };

      return {
        configurable: {
          sessionId,
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          sdkClient,
          promptBuilder,
          templateAssembler,
          notionClient,
          schemaValidator,
          useMockPreprocessor: true,  // Use mock preprocessor for testing
          thread_id: `test-${Date.now()}`
        }
      };
    }

    it('completes full pipeline when all approvals are pre-set', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = createAutoApproveConfig('test-session');

      // Set up state with all approvals already given (sessionId from config)
      // Commit 8.6: Include specialist analyses and evaluation history
      const preApprovedState = {
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        // Pre-populate with data as if approvals were given
        preprocessedEvidence: mockPreprocessedEvidence,  // Skip preprocessing
        evidenceBundle: mockEvidenceBundle,
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        outline: mockOutline,
        contentBundle: mockContentBundle,
        // Commit 8.6: evaluation history with ready=true
        evaluationHistory: [
          { phase: 'arcs', ready: true },
          { phase: 'outline', ready: true },
          { phase: 'article', ready: true }
        ],
        // Critical: Don't await approval, and indicate which checkpoint was approved
        awaitingApproval: false,
        approvalType: APPROVAL_TYPES.ARTICLE  // Signal article checkpoint was approved
      };

      const result = await graph.invoke(preApprovedState, config);

      // Should complete with assembled HTML
      expect(result.assembledHtml).toBeDefined();
    }, 30000);

    it('produces assembledHtml in final state', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = createAutoApproveConfig('test-session');

      // Complete state with all fields needed for nodes to skip
      const preApprovedState = {
        // Session identification (set by initializeSession, but we include for completeness)
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        // Fetch phase data (so fetch nodes skip)
        directorNotes: { observations: [], playerFocus: {} },
        memoryTokens: [{ tokenId: 'test-001' }],
        paperEvidence: [{ notionId: 'ev-001' }],
        selectedPaperEvidence: [{ notionId: 'ev-001' }],  // Commit 8.9.4: Skip paper evidence selection checkpoint
        sessionPhotos: [],
        photoAnalyses: { analyses: [] },
        // Processing phase data
        preprocessedEvidence: mockPreprocessedEvidence,
        evidenceBundle: mockEvidenceBundle,
        // Arc phase data
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        // Generation phase data
        outline: mockOutline,
        contentBundle: mockContentBundle,
        // Evaluation history (all phases ready)
        evaluationHistory: [
          { phase: 'arcs', ready: true },
          { phase: 'outline', ready: true },
          { phase: 'article', ready: true }
        ],
        awaitingApproval: false,
        approvalType: APPROVAL_TYPES.ARTICLE  // Signal article checkpoint was approved
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.assembledHtml).toContain('<html>');
      expect(result.assembledHtml).toContain('</html>');
    }, 30000);
  });

  describe('revision loops', () => {
    function createEvaluatorMockConfig(sessionId = 'test-session', evalResults = {}) {
      // Mock Claude client that returns specific evaluation results
      const sdkClient = mocks.createMockSdkClient({
        evidenceBundle: mockEvidenceBundle,
        arcAnalysis: mockArcAnalysis,
        outline: mockOutline,
        contentBundle: mockContentBundle,
        validationResults: mockValidationPassed,
        ...evalResults
      });

      return {
        configurable: {
          sessionId,
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,
          sdkClient,
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: { validate: () => ({ valid: true, errors: null }) },
          useMockPreprocessor: true,
          thread_id: `test-${Date.now()}`
        }
      };
    }

    it('respects arc revision cap (max 2)', async () => {
      // Test that arc revision count is respected
      const state = {
        evaluationHistory: [{ ready: false }],
        arcRevisionCount: REVISION_CAPS.ARCS
      };

      // At cap, should route to checkpoint
      expect(routeArcEvaluation(state)).toBe('checkpoint');
    });

    it('respects outline revision cap (max 3)', async () => {
      const state = {
        evaluationHistory: [{ ready: false }],
        outlineRevisionCount: REVISION_CAPS.OUTLINE
      };

      expect(routeOutlineEvaluation(state)).toBe('checkpoint');
    });

    it('respects article revision cap (max 3)', async () => {
      const state = {
        evaluationHistory: [{ ready: false }],
        articleRevisionCount: REVISION_CAPS.ARTICLE
      };

      expect(routeArticleEvaluation(state)).toBe('checkpoint');
    });
  });

  describe('error handling', () => {
    it('stops when schema validation fails', async () => {
      const graph = createReportGraphNoCheckpoint();

      // Mock schema validator that fails
      const failingSchemaValidator = {
        validate: () => ({
          valid: false,
          errors: [{ path: '/sections', message: 'missing required field' }]
        })
      };

      const config = {
        configurable: {
          sessionId: 'test-session',
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,
          sdkClient: mocks.createMockSdkClient({
            contentBundle: mockContentBundle
          }),
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: failingSchemaValidator,
          useMockPreprocessor: true,
          thread_id: `test-${Date.now()}`
        }
      };

      // Complete state with all fields needed for nodes to skip
      const preApprovedState = {
        // Session identification
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        // Fetch phase data (so fetch nodes skip)
        directorNotes: { observations: [], playerFocus: {} },
        memoryTokens: [{ tokenId: 'test-001' }],
        paperEvidence: [{ notionId: 'ev-001' }],
        selectedPaperEvidence: [{ notionId: 'ev-001' }],  // Commit 8.9.4: Skip paper evidence selection checkpoint
        sessionPhotos: [],
        photoAnalyses: { analyses: [] },
        // Processing phase data
        preprocessedEvidence: mockPreprocessedEvidence,
        evidenceBundle: mockEvidenceBundle,
        // Arc phase data
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        // Generation phase data
        outline: mockOutline,
        contentBundle: mockContentBundle,
        // Evaluation history (all phases ready)
        evaluationHistory: [
          { phase: 'arcs', ready: true },
          { phase: 'outline', ready: true },
          { phase: 'article', ready: true }
        ],
        awaitingApproval: false,
        approvalType: APPROVAL_TYPES.ARTICLE  // Signal article checkpoint was approved
      };

      const result = await graph.invoke(preApprovedState, config);

      // Should have schema validation errors
      expect(result.errors).toBeDefined();
      expect(result.errors.some(e => e.type === 'schema-validation')).toBe(true);
    }, 30000);
  });

  describe('state preservation', () => {
    it('preserves sessionId throughout pipeline', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = {
        configurable: {
          sessionId: 'test-session',
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,
          sdkClient: mocks.createMockSdkClient({
            evidenceBundle: mockEvidenceBundle,
            arcAnalysis: mockArcAnalysis,
            outline: mockOutline,
            contentBundle: mockContentBundle,
            validationResults: mockValidationPassed
          }),
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: { validate: () => ({ valid: true, errors: null }) },
          useMockPreprocessor: true,
          thread_id: `test-${Date.now()}`
        }
      };

      // Complete state with all fields needed for nodes to skip
      const preApprovedState = {
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        directorNotes: { observations: [], playerFocus: {} },
        memoryTokens: [{ tokenId: 'test-001' }],
        paperEvidence: [{ notionId: 'ev-001' }],
        selectedPaperEvidence: [{ notionId: 'ev-001' }],  // Commit 8.9.4: Skip paper evidence selection checkpoint
        sessionPhotos: [],
        photoAnalyses: { analyses: [] },
        preprocessedEvidence: mockPreprocessedEvidence,
        evidenceBundle: mockEvidenceBundle,
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        outline: mockOutline,
        contentBundle: mockContentBundle,
        evaluationHistory: [
          { phase: 'arcs', ready: true },
          { phase: 'outline', ready: true },
          { phase: 'article', ready: true }
        ],
        awaitingApproval: false
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.sessionId).toBe('test-session');
    }, 30000);

    it('preserves theme throughout pipeline', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = {
        configurable: {
          sessionId: 'test-session',
          theme: 'detective',
          dataDir: FIXTURES_DATA_DIR,
          sdkClient: mocks.createMockSdkClient({
            evidenceBundle: mockEvidenceBundle,
            arcAnalysis: mockArcAnalysis,
            outline: mockOutline,
            contentBundle: mockContentBundle,
            validationResults: mockValidationPassed
          }),
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: { validate: () => ({ valid: true, errors: null }) },
          useMockPreprocessor: true,
          thread_id: `test-${Date.now()}`
        }
      };

      // Complete state with all fields needed for nodes to skip
      const preApprovedState = {
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        directorNotes: { observations: [], playerFocus: {} },
        memoryTokens: [{ tokenId: 'test-001' }],
        paperEvidence: [{ notionId: 'ev-001' }],
        selectedPaperEvidence: [{ notionId: 'ev-001' }],  // Commit 8.9.4: Skip paper evidence selection checkpoint
        sessionPhotos: [],
        photoAnalyses: { analyses: [] },
        preprocessedEvidence: mockPreprocessedEvidence,
        evidenceBundle: mockEvidenceBundle,
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        outline: mockOutline,
        contentBundle: mockContentBundle,
        evaluationHistory: [
          { phase: 'arcs', ready: true },
          { phase: 'outline', ready: true },
          { phase: 'article', ready: true }
        ],
        awaitingApproval: false
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.theme).toBe('detective');
    }, 30000);
  });
});
