/**
 * Evaluator Nodes Unit Tests
 *
 * Tests for the per-phase quality evaluators that determine
 * if content is ready for human review.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.4-8.6.5 for design rationale.
 */

const {
  evaluateArcs,
  evaluateOutline,
  evaluateArticle,
  createEvaluator,
  createMockEvaluator,
  _testing: {
    QUALITY_CRITERIA,
    getSdkClient,
    buildEvaluationSystemPrompt,
    buildEvaluationUserPrompt,
    safeParseJson,
    getRevisionCountField,
    getRevisionCap,
    getApprovalType,
    getPhaseConstant
  }
} = require('../../../lib/workflow/nodes/evaluator-nodes');
const { PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('../../../lib/workflow/state');

describe('evaluator-nodes', () => {
  describe('module exports', () => {
    it('exports evaluateArcs function', () => {
      expect(typeof evaluateArcs).toBe('function');
    });

    it('exports evaluateOutline function', () => {
      expect(typeof evaluateOutline).toBe('function');
    });

    it('exports evaluateArticle function', () => {
      expect(typeof evaluateArticle).toBe('function');
    });

    it('exports createEvaluator factory', () => {
      expect(typeof createEvaluator).toBe('function');
    });

    it('exports createMockEvaluator factory', () => {
      expect(typeof createMockEvaluator).toBe('function');
    });

    it('exports _testing with helper functions', () => {
      expect(QUALITY_CRITERIA).toBeDefined();
      expect(typeof getSdkClient).toBe('function');
      expect(typeof buildEvaluationSystemPrompt).toBe('function');
      expect(typeof buildEvaluationUserPrompt).toBe('function');
      expect(typeof safeParseJson).toBe('function');
    });
  });

  describe('QUALITY_CRITERIA', () => {
    it('defines criteria for arcs phase', () => {
      expect(QUALITY_CRITERIA.arcs).toBeDefined();
      // Commit 8.15: Structural criteria
      expect(QUALITY_CRITERIA.arcs.rosterCoverage).toBeDefined();
      expect(QUALITY_CRITERIA.arcs.evidenceIdValidity).toBeDefined();
      expect(QUALITY_CRITERIA.arcs.accusationArcPresent).toBeDefined();
      // Commit 8.15: Advisory criteria
      expect(QUALITY_CRITERIA.arcs.coherence).toBeDefined();
      expect(QUALITY_CRITERIA.arcs.evidenceConfidenceBalance).toBeDefined();
    });

    it('defines criteria for outline phase', () => {
      expect(QUALITY_CRITERIA.outline).toBeDefined();
      expect(QUALITY_CRITERIA.outline.arcCoverage).toBeDefined();
      expect(QUALITY_CRITERIA.outline.sectionBalance).toBeDefined();
      expect(QUALITY_CRITERIA.outline.flowLogic).toBeDefined();
      expect(QUALITY_CRITERIA.outline.photoPlacement).toBeDefined();
      expect(QUALITY_CRITERIA.outline.wordBudget).toBeDefined();
    });

    it('defines criteria for article phase', () => {
      expect(QUALITY_CRITERIA.article).toBeDefined();
      expect(QUALITY_CRITERIA.article.voiceConsistency).toBeDefined();
      expect(QUALITY_CRITERIA.article.antiPatterns).toBeDefined();
      expect(QUALITY_CRITERIA.article.evidenceIntegration).toBeDefined();
      expect(QUALITY_CRITERIA.article.characterPlacement).toBeDefined();
      expect(QUALITY_CRITERIA.article.emotionalResonance).toBeDefined();
    });

    it('all criteria have description and weight', () => {
      Object.entries(QUALITY_CRITERIA).forEach(([phase, criteria]) => {
        Object.entries(criteria).forEach(([name, criterion]) => {
          expect(criterion.description).toBeDefined();
          expect(typeof criterion.weight).toBe('number');
          expect(criterion.weight).toBeGreaterThan(0);
          expect(criterion.weight).toBeLessThanOrEqual(1);
        });
      });
    });

    it('weights sum to approximately 1.0 for each phase', () => {
      Object.entries(QUALITY_CRITERIA).forEach(([phase, criteria]) => {
        const totalWeight = Object.values(criteria).reduce((sum, c) => sum + c.weight, 0);
        expect(totalWeight).toBeCloseTo(1.0, 1);
      });
    });
  });

  describe('getSdkClient', () => {
    it('returns injected client from config', () => {
      const mockClient = jest.fn();
      const config = { configurable: { sdkClient: mockClient } };

      expect(getSdkClient(config)).toBe(mockClient);
    });

    it('returns default when not injected', () => {
      expect(typeof getSdkClient(null)).toBe('function');
    });

    it('returns default for empty config', () => {
      expect(typeof getSdkClient({})).toBe('function');
    });
  });

  describe('buildEvaluationSystemPrompt', () => {
    it('includes phase name', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs);
      expect(prompt).toContain('ARCS');
    });

    it('includes all criteria with weights', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs);

      expect(prompt).toContain('coherence');
      // Commit 8.15: Changed from evidenceGrounding to evidenceIdValidity
      expect(prompt).toContain('evidenceIdValidity');
      expect(prompt).toContain('rosterCoverage');
    });

    it('includes evaluation rules', () => {
      const prompt = buildEvaluationSystemPrompt('outline', QUALITY_CRITERIA.outline);

      // Commit 8.21: Now uses structural/advisory criteria (0.8 threshold for structural)
      expect(prompt).toContain('score >= 0.8');
      expect(prompt).toContain('STRUCTURAL criteria MUST');
      expect(prompt).toContain('READY');
    });

    it('includes output format', () => {
      const prompt = buildEvaluationSystemPrompt('article', QUALITY_CRITERIA.article);

      expect(prompt).toContain('OUTPUT FORMAT');
      expect(prompt).toContain('ready');
      expect(prompt).toContain('overallScore');
      expect(prompt).toContain('criteriaScores');
    });

    it('mentions About Last Night game', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs);
      expect(prompt).toContain('About Last Night');
    });

    it('emphasizes human always makes final decision', () => {
      const prompt = buildEvaluationSystemPrompt('article', QUALITY_CRITERIA.article);
      expect(prompt).toContain('Human always makes final decision');
    });
  });

  describe('buildEvaluationUserPrompt', () => {
    describe('arcs phase', () => {
      it('includes narrative arcs', () => {
        const state = {
          narrativeArcs: [{ title: 'Arc 1', summary: 'Test summary' }]
        };
        const prompt = buildEvaluationUserPrompt('arcs', state);

        expect(prompt).toContain('Arc 1');
        expect(prompt).toContain('Test summary');
      });

      it('includes player focus', () => {
        const state = {
          playerFocus: { primaryInvestigation: 'Who stole the money?' }
        };
        const prompt = buildEvaluationUserPrompt('arcs', state);

        expect(prompt).toContain('Who stole the money?');
      });

      it('includes evidence bundle summary', () => {
        const state = {
          evidenceBundle: {
            exposed: {
              tokens: [{ id: 'item1' }, { id: 'item2' }],
              paperEvidence: []
            },
            buried: {
              transactions: [{ id: 'item3' }],
              relationships: []
            }
          }
        };
        const prompt = buildEvaluationUserPrompt('arcs', state);

        // Updated to match new format with IDs and details sections
        expect(prompt).toContain('EXPOSED EVIDENCE DETAILS');
        expect(prompt).toContain('BURIED TRANSACTIONS');
        expect(prompt).toContain('ALL VALID EVIDENCE IDS');
      });
    });

    describe('outline phase', () => {
      it('includes outline data', () => {
        const state = {
          outline: { sections: [{ title: 'Intro' }] }
        };
        const prompt = buildEvaluationUserPrompt('outline', state);

        expect(prompt).toContain('Intro');
      });

      it('includes selected arcs', () => {
        const state = {
          selectedArcs: [{ title: 'Selected Arc' }]
        };
        const prompt = buildEvaluationUserPrompt('outline', state);

        expect(prompt).toContain('Selected Arc');
      });

      it('includes photo analyses (limited to 5)', () => {
        const analyses = Array.from({ length: 10 }, (_, i) => ({
          filename: `photo${i}.jpg`
        }));
        const state = {
          photoAnalyses: { analyses }
        };
        const prompt = buildEvaluationUserPrompt('outline', state);

        expect(prompt).toContain('photo0.jpg');
        expect(prompt).toContain('photo4.jpg');
        // Should only include first 5
      });
    });

    describe('article phase', () => {
      it('includes content bundle', () => {
        const state = {
          contentBundle: {
            headline: { main: 'Test Headline' },
            sections: []
          }
        };
        const prompt = buildEvaluationUserPrompt('article', state);

        expect(prompt).toContain('Test Headline');
      });

      it('includes outline', () => {
        const state = {
          outline: { structure: 'test' }
        };
        const prompt = buildEvaluationUserPrompt('article', state);

        expect(prompt).toContain('structure');
      });
    });

    it('throws for unknown phase', () => {
      expect(() => buildEvaluationUserPrompt('unknown', {}))
        .toThrow('Unknown evaluation phase: unknown');
    });
  });

  describe('safeParseJson', () => {
    it('parses valid JSON', () => {
      const result = safeParseJson('{"key": "value"}', 'test');
      expect(result.key).toBe('value');
    });

    it('throws actionable error for invalid JSON', () => {
      expect(() => safeParseJson('not json', 'arcs evaluation'))
        .toThrow(/Failed to parse arcs evaluation:/);
    });

    it('includes response preview in error', () => {
      expect(() => safeParseJson('this is not json', 'test'))
        .toThrow(/Response preview: this is not json/);
    });
  });

  describe('getRevisionCountField', () => {
    it('returns arcRevisionCount for arcs', () => {
      expect(getRevisionCountField('arcs')).toBe('arcRevisionCount');
    });

    it('returns outlineRevisionCount for outline', () => {
      expect(getRevisionCountField('outline')).toBe('outlineRevisionCount');
    });

    it('returns articleRevisionCount for article', () => {
      expect(getRevisionCountField('article')).toBe('articleRevisionCount');
    });

    it('throws for unknown phase', () => {
      expect(() => getRevisionCountField('unknown'))
        .toThrow('Unknown phase: unknown');
    });
  });

  describe('getRevisionCap', () => {
    it('returns REVISION_CAPS.ARCS for arcs', () => {
      expect(getRevisionCap('arcs')).toBe(REVISION_CAPS.ARCS);
      expect(getRevisionCap('arcs')).toBe(2);
    });

    it('returns REVISION_CAPS.OUTLINE for outline', () => {
      expect(getRevisionCap('outline')).toBe(REVISION_CAPS.OUTLINE);
      expect(getRevisionCap('outline')).toBe(3);
    });

    it('returns REVISION_CAPS.ARTICLE for article', () => {
      expect(getRevisionCap('article')).toBe(REVISION_CAPS.ARTICLE);
      expect(getRevisionCap('article')).toBe(3);
    });

    it('returns default 2 for unknown phase', () => {
      expect(getRevisionCap('unknown')).toBe(2);
    });
  });

  describe('getApprovalType', () => {
    it('returns ARC_SELECTION for arcs', () => {
      expect(getApprovalType('arcs')).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });

    it('returns OUTLINE for outline', () => {
      expect(getApprovalType('outline')).toBe(APPROVAL_TYPES.OUTLINE);
    });

    it('returns ARTICLE for article', () => {
      expect(getApprovalType('article')).toBe(APPROVAL_TYPES.ARTICLE);
    });

    it('returns null for unknown phase', () => {
      expect(getApprovalType('unknown')).toBeNull();
    });
  });

  describe('getPhaseConstant', () => {
    it('returns ARC_EVALUATION for arcs', () => {
      expect(getPhaseConstant('arcs')).toBe(PHASES.ARC_EVALUATION);
    });

    it('returns OUTLINE_EVALUATION for outline', () => {
      expect(getPhaseConstant('outline')).toBe(PHASES.OUTLINE_EVALUATION);
    });

    it('returns ARTICLE_EVALUATION for article', () => {
      expect(getPhaseConstant('article')).toBe(PHASES.ARTICLE_EVALUATION);
    });

    it('throws for unknown phase', () => {
      expect(() => getPhaseConstant('unknown'))
        .toThrow('Unknown phase: unknown');
    });
  });

  describe('createEvaluator', () => {
    it('creates evaluator function', () => {
      const evaluator = createEvaluator('arcs');
      expect(typeof evaluator).toBe('function');
    });

    it('throws for unknown phase', () => {
      expect(() => createEvaluator('unknown'))
        .toThrow('No quality criteria defined for phase: unknown');
    });

    it('accepts custom model option', () => {
      const mockClient = jest.fn().mockResolvedValue('{"ready":true,"overallScore":0.8}');
      const evaluator = createEvaluator('arcs', { model: 'sonnet' });
      const config = { configurable: { sdkClient: mockClient } };

      evaluator({ narrativeArcs: [] }, config);

      expect(mockClient).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'sonnet' })
      );
    });
  });

  describe('evaluateArcs', () => {
    const createMockState = () => ({
      sessionId: 'test',
      narrativeArcs: [{ title: 'Test Arc' }],
      playerFocus: { primaryInvestigation: 'Test focus' },
      evidenceBundle: { exposed: [], buried: [] }
    });

    it('returns ready state when score >= 0.7', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.85,
        criteriaScores: {},
        issues: [],
        confidence: 'high'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateArcs(createMockState(), config);

      // Evaluator no longer sets awaitingApproval/approvalType - that's checkpoint's job
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.approvalType).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.ARC_EVALUATION);
      // Verify evaluationHistory records the ready state
      expect(result.evaluationHistory.ready).toBe(true);
    });

    it('returns revision needed when score < 0.7', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        criteriaScores: {},
        issues: ['Issue 1'],
        revisionGuidance: 'Fix issue 1',
        confidence: 'medium'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateArcs(createMockState(), config);

      expect(result.awaitingApproval).toBeUndefined();
      // Note: revision count increment moved to graph.js incrementArcRevision node
      expect(result.arcRevisionCount).toBeUndefined();
      expect(result.validationResults.passed).toBe(false);
      expect(result.validationResults.feedback).toBe('Fix issue 1');
    });

    it('adds entry to evaluationHistory', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9,
        issues: [],
        confidence: 'high'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateArcs(createMockState(), config);

      expect(result.evaluationHistory).toBeDefined();
      expect(result.evaluationHistory.phase).toBe('arcs');
      expect(result.evaluationHistory.ready).toBe(true);
      expect(result.evaluationHistory.overallScore).toBe(0.9);
    });

    it('escalates to human when at revision cap', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Still has issues'],
        confidence: 'medium'
      });

      const state = {
        ...createMockState(),
        arcRevisionCount: REVISION_CAPS.ARCS // At cap
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(state, config);

      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
      expect(result.evaluationHistory.escalationReason).toContain('revision cap');
    });

    it('handles Claude client error', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('API timeout'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(createMockState(), config);

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors[0].type).toBe('arcs-evaluation-failed');
      expect(result.errors[0].message).toBe('API timeout');
    });

    it('uses opus model for high-quality arc evaluation (Commit 8.17)', async () => {
      const mockClient = jest.fn().mockResolvedValue('{"ready":true,"overallScore":0.8}');
      const config = { configurable: { sdkClient: mockClient } };

      await evaluateArcs(createMockState(), config);

      expect(mockClient).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'opus' })
      );
    });
  });

  describe('evaluateOutline', () => {
    const createMockState = () => ({
      sessionId: 'test',
      outline: { sections: [{ title: 'Intro' }] },
      selectedArcs: [{ title: 'Arc 1' }],
      photoAnalyses: { analyses: [] }
    });

    it('returns ready state when score >= 0.7', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.8,
        criteriaScores: {},
        issues: [],
        confidence: 'high'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateOutline(createMockState(), config);

      // Evaluator no longer sets awaitingApproval/approvalType - that's checkpoint's job
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.approvalType).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.OUTLINE_EVALUATION);
      expect(result.evaluationHistory.ready).toBe(true);
    });

    it('returns revision needed when not ready (count increment in graph.js)', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.6,
        issues: ['Need more detail'],
        revisionGuidance: 'Add more detail',
        confidence: 'medium'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateOutline(createMockState(), config);

      // Note: revision count increment moved to graph.js incrementOutlineRevision node
      expect(result.outlineRevisionCount).toBeUndefined();
      expect(result.validationResults.passed).toBe(false);
    });

    it('escalates at revision cap (3)', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Still has issues'],
        confidence: 'low'
      });

      const state = {
        ...createMockState(),
        outlineRevisionCount: REVISION_CAPS.OUTLINE // At cap (3)
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateOutline(state, config);

      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    });
  });

  describe('evaluateArticle', () => {
    const createMockState = () => ({
      sessionId: 'test',
      contentBundle: {
        headline: { main: 'Test Headline' },
        sections: []
      },
      outline: { sections: [] }
    });

    it('returns ready state when score >= 0.7', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.75,
        criteriaScores: {},
        issues: [],
        confidence: 'medium'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateArticle(createMockState(), config);

      // Evaluator no longer sets awaitingApproval/approvalType - that's checkpoint's job
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.approvalType).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.ARTICLE_EVALUATION);
      expect(result.evaluationHistory.ready).toBe(true);
    });

    it('returns revision needed when not ready (count increment in graph.js)', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.55,
        issues: ['Voice inconsistent'],
        revisionGuidance: 'Improve voice consistency',
        confidence: 'medium'
      });

      const config = { configurable: { sdkClient: mockClient } };
      const result = await evaluateArticle(createMockState(), config);

      // Note: revision count increment moved to graph.js incrementArticleRevision node
      expect(result.articleRevisionCount).toBeUndefined();
      expect(result.validationResults.passed).toBe(false);
    });

    it('escalates at revision cap (3)', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Anti-patterns present'],
        confidence: 'low'
      });

      const state = {
        ...createMockState(),
        articleRevisionCount: REVISION_CAPS.ARTICLE // At cap (3)
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArticle(state, config);

      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    });
  });

  describe('createMockEvaluator', () => {
    it('creates mock that returns ready by default', async () => {
      const mock = createMockEvaluator('arcs');
      const result = await mock({ arcRevisionCount: 0 }, {});

      expect(result.awaitingApproval).toBe(true);
      expect(result.evaluationHistory.ready).toBe(true);
    });

    it('creates mock that returns not ready when configured', async () => {
      const mock = createMockEvaluator('arcs', { ready: false, issues: ['Issue 1'] });
      const result = await mock({ arcRevisionCount: 0 }, {});

      expect(result.awaitingApproval).toBeUndefined();
      expect(result.arcRevisionCount).toBe(1);
      expect(result.validationResults.passed).toBe(false);
    });

    it('can simulate failure', async () => {
      const mock = createMockEvaluator('outline', {
        shouldFail: true,
        errorMessage: 'Mock error'
      });
      const result = await mock({ outlineRevisionCount: 0 }, {});

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors[0].message).toBe('Mock error');
    });

    it('uses custom overallScore', async () => {
      const mock = createMockEvaluator('article', { overallScore: 0.95 });
      const result = await mock({ articleRevisionCount: 0 }, {});

      expect(result.evaluationHistory.overallScore).toBe(0.95);
    });

    it('sets correct approval type for phase', async () => {
      const arcsMock = createMockEvaluator('arcs');
      const outlineMock = createMockEvaluator('outline');
      const articleMock = createMockEvaluator('article');

      const arcsResult = await arcsMock({}, {});
      const outlineResult = await outlineMock({}, {});
      const articleResult = await articleMock({}, {});

      expect(arcsResult.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
      expect(outlineResult.approvalType).toBe(APPROVAL_TYPES.OUTLINE);
      expect(articleResult.approvalType).toBe(APPROVAL_TYPES.ARTICLE);
    });

    it('sets correct phase constant', async () => {
      const mock = createMockEvaluator('outline');
      const result = await mock({}, {});

      expect(result.currentPhase).toBe(PHASES.OUTLINE_EVALUATION);
    });

    it('tracks revision number in history', async () => {
      const mock = createMockEvaluator('arcs', { ready: false });
      const result = await mock({ arcRevisionCount: 2 }, {});

      expect(result.evaluationHistory.revisionNumber).toBe(2);
    });
  });

  describe('revision cap behavior', () => {
    it('arcs has cap of 2', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // At revision 1, should allow another revision (increment happens in graph.js)
      const result1 = await evaluateArcs({ narrativeArcs: [], arcRevisionCount: 1 }, config);
      expect(result1.arcRevisionCount).toBeUndefined(); // Increment moved to graph.js
      expect(result1.awaitingApproval).toBeUndefined();
      expect(result1.validationResults.passed).toBe(false);

      // At revision 2 (the cap), should escalate
      const result2 = await evaluateArcs({ narrativeArcs: [], arcRevisionCount: 2 }, config);
      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result2.awaitingApproval).toBeUndefined();
      expect(result2.evaluationHistory.escalatedToHuman).toBe(true);
    });

    it('outline has cap of 3', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // At revision 2, should allow another revision (increment happens in graph.js)
      const result1 = await evaluateOutline({ outline: {}, outlineRevisionCount: 2 }, config);
      expect(result1.outlineRevisionCount).toBeUndefined(); // Increment moved to graph.js
      expect(result1.awaitingApproval).toBeUndefined();
      expect(result1.validationResults.passed).toBe(false);

      // At revision 3 (the cap), should escalate
      const result2 = await evaluateOutline({ outline: {}, outlineRevisionCount: 3 }, config);
      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result2.awaitingApproval).toBeUndefined();
      expect(result2.evaluationHistory.escalatedToHuman).toBe(true);
    });

    it('article has cap of 3', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // At revision 3 (the cap), should escalate
      const result = await evaluateArticle({ contentBundle: {}, articleRevisionCount: 3 }, config);
      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.awaitingApproval).toBeUndefined();
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    });
  });

  describe('evaluation history tracking', () => {
    it('includes timestamp', async () => {
      const mockClient = jest.fn().mockResolvedValue('{"ready":true,"overallScore":0.8}');
      const config = { configurable: { sdkClient: mockClient } };

      const before = new Date().toISOString();
      const result = await evaluateArcs({ narrativeArcs: [] }, config);
      const after = new Date().toISOString();

      expect(result.evaluationHistory.timestamp).toBeDefined();
      expect(result.evaluationHistory.timestamp >= before).toBe(true);
      expect(result.evaluationHistory.timestamp <= after).toBe(true);
    });

    it('includes confidence level', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.85,
        confidence: 'high'
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.evaluationHistory.confidence).toBe('high');
    });

    it('defaults confidence to medium', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.8
        // No confidence field
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.evaluationHistory.confidence).toBe('medium');
    });

    it('includes issues when present', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.6,
        issues: ['Issue 1', 'Issue 2']
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.evaluationHistory.issues).toEqual(['Issue 1', 'Issue 2']);
    });

    it('defaults issues to empty array', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9
        // No issues field
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.evaluationHistory.issues).toEqual([]);
    });
  });

  describe('validationResults for revision', () => {
    it('includes passed=false when not ready', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue']
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.validationResults.passed).toBe(false);
    });

    it('includes revision feedback', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: [],
        revisionGuidance: 'Fix the coherence issues by...'
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.validationResults.feedback).toBe('Fix the coherence issues by...');
    });

    it('includes criteria scores when available', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        criteriaScores: {
          coherence: { score: 0.3, notes: 'Poor' }
        },
        issues: []
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.validationResults.criteriaScores.coherence.score).toBe(0.3);
    });

    it('does not include validationResults when ready', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9,
        issues: []
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.validationResults).toBeUndefined();
    });
  });

  describe('error handling', () => {
    it('adds error to errors array', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Network error'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('arcs-evaluation-failed');
      expect(result.errors[0].message).toBe('Network error');
      expect(result.errors[0].timestamp).toBeDefined();
    });

    it('includes error in evaluation history', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Parse error'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.evaluationHistory._error).toBe('Parse error');
      expect(result.evaluationHistory.ready).toBe(false);
    });

    it('sets currentPhase to ERROR', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Timeout'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArticle({ contentBundle: {} }, config);

      expect(result.currentPhase).toBe(PHASES.ERROR);
    });

    it('preserves revision count on error', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('API error'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [], arcRevisionCount: 1 }, config);

      expect(result.evaluationHistory.revisionNumber).toBe(1);
      // Should not increment on error
      expect(result.arcRevisionCount).toBeUndefined();
    });
  });
});
