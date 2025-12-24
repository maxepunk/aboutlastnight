/**
 * Workflow Integration Tests
 *
 * Tests the complete report generation graph flow including:
 * - Approval checkpoints pause execution
 * - Full pipeline completion with mock approvals
 * - Voice revision loop termination
 * - Error handling and state transitions
 *
 * Uses mock clients injected via config.configurable to test
 * graph behavior without real API calls.
 */

const path = require('path');
const {
  createReportGraph,
  createReportGraphNoCheckpoint,
  _testing: { routeApproval, routeValidation, routeVoiceValidation }
} = require('../../lib/workflow/graph');
const { PHASES, APPROVAL_TYPES, getDefaultState } = require('../../lib/workflow/state');
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

describe('workflow integration', () => {
  describe('routing functions', () => {
    describe('routeApproval', () => {
      it('returns "wait" when awaitingApproval is true', () => {
        expect(routeApproval({ awaitingApproval: true })).toBe('wait');
      });

      it('returns "continue" when awaitingApproval is false', () => {
        expect(routeApproval({ awaitingApproval: false })).toBe('continue');
      });

      it('returns "continue" when awaitingApproval is undefined', () => {
        expect(routeApproval({})).toBe('continue');
      });
    });

    describe('routeValidation', () => {
      it('returns "error" when errors array has items', () => {
        expect(routeValidation({ errors: [{ message: 'test' }] })).toBe('error');
      });

      it('returns "continue" when errors array is empty', () => {
        expect(routeValidation({ errors: [] })).toBe('continue');
      });

      it('returns "continue" when errors is undefined', () => {
        expect(routeValidation({})).toBe('continue');
      });
    });

    describe('routeVoiceValidation', () => {
      it('returns "complete" when validation passed', () => {
        expect(routeVoiceValidation({
          validationResults: { passed: true },
          voiceRevisionCount: 0
        })).toBe('complete');
      });

      it('returns "complete" when max revisions reached', () => {
        expect(routeVoiceValidation({
          validationResults: { passed: false },
          voiceRevisionCount: 2
        })).toBe('complete');
      });

      it('returns "revise" when validation failed and under max revisions', () => {
        expect(routeVoiceValidation({
          validationResults: { passed: false },
          voiceRevisionCount: 1
        })).toBe('revise');
      });

      it('returns "revise" when voiceRevisionCount is 0', () => {
        expect(routeVoiceValidation({
          validationResults: { passed: false },
          voiceRevisionCount: 0
        })).toBe('revise');
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
      const claudeClient = mocks.createMockClaudeClient({
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
          claudeClient,
          promptBuilder,
          templateAssembler,
          notionClient,
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
      expect(result.approvalType).toBe(APPROVAL_TYPES.EVIDENCE_BUNDLE);
      expect(result.evidenceBundle).toBeDefined();
      expect(result.currentPhase).toBe(PHASES.CURATE_EVIDENCE);
    });

    it('continues past evidence approval when awaitingApproval is false', async () => {
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

      // Note: When resuming, we need to use the checkpointer
      // For this test, we'll invoke fresh which will re-run from start
      // In production, checkpointer would restore state
      const result = await graph.invoke(stateAfterApproval, config);

      // Should pause at next checkpoint (arc selection)
      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });
  });

  describe('full pipeline', () => {
    // Create config that auto-approves everything
    function createAutoApproveConfig(sessionId = 'test-session') {
      // Mock Claude client that returns validation passed
      const claudeClient = mocks.createMockClaudeClient({
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
          claudeClient,
          promptBuilder,
          templateAssembler,
          notionClient,
          schemaValidator,
          thread_id: `test-${Date.now()}`
        }
      };
    }

    it('completes full pipeline when all approvals are pre-set', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = createAutoApproveConfig('test-session');

      // Set up state with all approvals already given (sessionId from config)
      const preApprovedState = {
        sessionConfig: {
          roster: [{ name: 'Alice' }],
          accusation: { accused: ['Blake'] }
        },
        // Pre-populate with data as if approvals were given
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['The Money Trail'],
        outline: mockOutline,
        // Critical: Don't await approval
        awaitingApproval: false
      };

      const result = await graph.invoke(preApprovedState, config);

      // Should complete with assembled HTML
      expect(result.currentPhase).toBe(PHASES.COMPLETE);
      expect(result.assembledHtml).toBeDefined();
      expect(result.validationResults).toBeDefined();
      expect(result.validationResults.passed).toBe(true);
    });

    it('produces assembledHtml in final state', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = createAutoApproveConfig('test-session');

      const preApprovedState = {
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.assembledHtml).toContain('<html>');
      expect(result.assembledHtml).toContain('</html>');
    });
  });

  describe('voice revision loop', () => {
    function createFailingValidationConfig(sessionId = 'test-session', failCount = 3) {
      let callCount = 0;

      // Mock Claude client that fails validation first N times
      const claudeClient = async (options) => {
        const promptLower = (options.prompt || '').toLowerCase();

        if (promptLower.includes('validate')) {
          callCount++;
          if (callCount <= failCount) {
            return JSON.stringify(mockValidationFailed);
          }
          return JSON.stringify(mockValidationPassed);
        }

        if (promptLower.includes('revise')) {
          return JSON.stringify({
            contentBundle: mockContentBundle,
            fixes_applied: [`Fix ${callCount}`]
          });
        }

        // Default responses for other nodes
        if (promptLower.includes('curate')) {
          return JSON.stringify(mockEvidenceBundle);
        }
        if (promptLower.includes('narrative arc')) {
          return JSON.stringify(mockArcAnalysis);
        }
        if (promptLower.includes('outline')) {
          return JSON.stringify(mockOutline);
        }

        return JSON.stringify(mockContentBundle);
      };

      return {
        configurable: {
          sessionId,  // Required by initializeSession
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          claudeClient,
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: { validate: () => ({ valid: true, errors: null }) },
          thread_id: `test-${Date.now()}`
        }
      };
    }

    it('revises content when validation fails', async () => {
      const graph = createReportGraphNoCheckpoint();
      // Fail once, then pass
      const config = createFailingValidationConfig('test-session', 1);

      const preApprovedState = {
        sessionId: 'test-session',
        theme: 'journalist',
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        voiceRevisionCount: 0,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.currentPhase).toBe(PHASES.COMPLETE);
      expect(result.voiceRevisionCount).toBe(1);
    });

    it('terminates after max 2 revisions even if validation keeps failing', async () => {
      const graph = createReportGraphNoCheckpoint();
      // Fail 10 times (more than max)
      const config = createFailingValidationConfig('test-session', 10);

      const preApprovedState = {
        sessionId: 'test-session',
        theme: 'journalist',
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        voiceRevisionCount: 0,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      // Should complete despite failing validation (max revisions reached)
      expect(result.currentPhase).toBe(PHASES.COMPLETE);
      // voiceRevisionCount should be 2 (max revisions)
      expect(result.voiceRevisionCount).toBe(2);
    });

    it('tracks revision history in contentBundle', async () => {
      const graph = createReportGraphNoCheckpoint();
      // Fail twice to force 2 revisions
      const config = createFailingValidationConfig('test-session', 2);

      const preApprovedState = {
        sessionId: 'test-session',
        theme: 'journalist',
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        voiceRevisionCount: 0,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      // Should have revision history
      expect(result.contentBundle._revisionHistory).toBeDefined();
      expect(result.contentBundle._revisionHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('error handling', () => {
    it('stops at ERROR phase when schema validation fails', async () => {
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
          sessionId: 'test-session',  // Required by initializeSession
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          claudeClient: mocks.createMockClaudeClient({
            contentBundle: mockContentBundle
          }),
          promptBuilder: mocks.createMockPromptBuilder(),
          templateAssembler: mocks.createMockTemplateAssembler(),
          notionClient: mocks.createMockNotionClient({
            tokens: [],
            paperEvidence: []
          }),
          schemaValidator: failingSchemaValidator,
          thread_id: `test-${Date.now()}`
        }
      };

      const preApprovedState = {
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors).toBeDefined();
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('state preservation', () => {
    it('preserves sessionId throughout pipeline', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = {
        configurable: {
          sessionId: 'test-session',  // Use fixture session - sessionId comes from config
          theme: 'journalist',
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          claudeClient: mocks.createMockClaudeClient({
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
          thread_id: `test-${Date.now()}`
        }
      };

      const preApprovedState = {
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      // sessionId comes from config.configurable, set by initializeSession node
      expect(result.sessionId).toBe('test-session');
    });

    it('preserves theme throughout pipeline', async () => {
      const graph = createReportGraphNoCheckpoint();
      const config = {
        configurable: {
          sessionId: 'test-session',  // Use fixture session
          theme: 'detective',  // Theme set in config
          dataDir: FIXTURES_DATA_DIR,  // Point to test fixtures
          claudeClient: mocks.createMockClaudeClient({
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
          thread_id: `test-${Date.now()}`
        }
      };

      const preApprovedState = {
        evidenceBundle: mockEvidenceBundle,
        narrativeArcs: mockArcAnalysis.narrativeArcs,
        selectedArcs: ['Test Arc'],
        outline: mockOutline,
        awaitingApproval: false,
        sessionConfig: { roster: [], accusation: {} }
      };

      const result = await graph.invoke(preApprovedState, config);

      expect(result.theme).toBe('detective');
    });
  });
});
