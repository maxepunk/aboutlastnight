/**
 * Evaluator Nodes Unit Tests
 *
 * Tests for the per-phase quality evaluators that determine
 * if content is ready for human review.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.4-8.6.5 for design rationale.
 */

// Mock checkpointInterrupt to prevent GraphInterrupt in unit tests
// Uses shared mock - see __tests__/mocks/checkpoint-helpers.mock.js
jest.mock('../../../lib/workflow/checkpoint-helpers',
  () => require('../../mocks/checkpoint-helpers.mock'));

const {
  evaluateArcs,
  evaluateOutline,
  evaluateArticle,
  createEvaluator,
  createMockEvaluator,
  _testing: {
    QUALITY_CRITERIA,
    getOutlineCriteria,
    getArticleCriteria,
    getNpcDescriptions,
    getSdkClient,
    buildEvaluationSystemPrompt,
    buildEvaluationUserPrompt,
    safeParseJson,
    getRevisionCountField,
    getRevisionCap,
    // NOTE: getApprovalType removed in interrupt() migration
    getPhaseConstant
  }
} = require('../../../lib/workflow/nodes/evaluator-nodes');
const { PHASES, REVISION_CAPS } = require('../../../lib/workflow/state');
const { CHECKPOINT_TYPES } = require('../../../lib/workflow/checkpoint-helpers');

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

    it('defines criteria for outline phase via getOutlineCriteria', () => {
      const outlineCriteria = getOutlineCriteria();
      expect(outlineCriteria).toBeDefined();
      expect(outlineCriteria.arcCoverage).toBeDefined();
      expect(outlineCriteria.sectionBalance).toBeDefined();
      expect(outlineCriteria.flowLogic).toBeDefined();
      expect(outlineCriteria.photoPlacement).toBeDefined();
      expect(outlineCriteria.wordBudget).toBeDefined();
    });

    it('returns detective-specific criteria for detective outline', () => {
      const detectiveOutline = getOutlineCriteria('detective');
      expect(detectiveOutline.requiredSections.description).toContain('executiveSummary');
      expect(detectiveOutline.requiredSections.description).not.toContain('lede');
      expect(detectiveOutline.sectionDifferentiation).toBeDefined();
      expect(detectiveOutline.sectionDifferentiation.description).toContain('DIFFERENT question');
      // Detective does not have journalist-specific criteria
      expect(detectiveOutline.photoPlacement).toBeUndefined();
      expect(detectiveOutline.arcInterweaving).toBeUndefined();
    });

    it('defines criteria for article phase via getArticleCriteria', () => {
      const articleCriteria = getArticleCriteria();
      expect(articleCriteria).toBeDefined();
      expect(articleCriteria.voiceConsistency).toBeDefined();
      expect(articleCriteria.antiPatterns).toBeDefined();
      expect(articleCriteria.evidenceIntegration).toBeDefined();
      expect(articleCriteria.characterPlacement).toBeDefined();
      expect(articleCriteria.emotionalResonance).toBeDefined();
    });

    it('returns detective-specific criteria for detective theme', () => {
      const detectiveCriteria = getArticleCriteria('detective');
      expect(detectiveCriteria.voiceConsistency.description).toContain('third-person');
      expect(detectiveCriteria.voiceConsistency.description).not.toContain('NovaNews');
      expect(detectiveCriteria.antiPatterns.description).toContain('character sheet');
      expect(detectiveCriteria.arcThreading.description).toContain('DIFFERENT QUESTION');
    });

    it('all criteria have description and weight', () => {
      // Merge static criteria with dynamic outline/article criteria for full validation
      const allCriteria = { ...QUALITY_CRITERIA, outline: getOutlineCriteria(), article: getArticleCriteria() };
      Object.entries(allCriteria).forEach(([phase, criteria]) => {
        if (!criteria) return; // Skip null entries
        Object.entries(criteria).forEach(([name, criterion]) => {
          expect(criterion.description).toBeDefined();
          expect(typeof criterion.weight).toBe('number');
          expect(criterion.weight).toBeGreaterThan(0);
          expect(criterion.weight).toBeLessThanOrEqual(1);
        });
      });
    });

    it('weights sum to approximately 1.0 for each phase', () => {
      const allCriteria = { ...QUALITY_CRITERIA, outline: getOutlineCriteria(), article: getArticleCriteria() };
      Object.entries(allCriteria).forEach(([phase, criteria]) => {
        if (!criteria) return; // Skip null entries
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
      const prompt = buildEvaluationSystemPrompt('outline', getOutlineCriteria());

      // Commit 8.21: Now uses structural/advisory criteria (0.8 threshold for structural)
      expect(prompt).toContain('score >= 0.8');
      expect(prompt).toContain('STRUCTURAL criteria MUST');
      expect(prompt).toContain('READY');
    });

    it('includes output format', () => {
      const prompt = buildEvaluationSystemPrompt('article', getArticleCriteria());

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
      const prompt = buildEvaluationSystemPrompt('article', getArticleCriteria());
      expect(prompt).toContain('Human always makes final decision');
    });

    it('includes journalist NPCs (with Nova) for journalist theme', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs, 'journalist');
      expect(prompt).toContain('Marcus');
      expect(prompt).toContain('Nova');
      expect(prompt).toContain('Blake');
    });

    it('excludes Nova from detective theme NPC list', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs, 'detective');
      expect(prompt).toContain('Marcus');
      expect(prompt).toContain('Blake');
      expect(prompt).not.toContain('Nova');
    });

    it('uses theme-aware non-roster PC example for journalist', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs, 'journalist');
      expect(prompt).toContain("Nova didn't see this");
    });

    it('uses theme-aware non-roster PC example for detective', () => {
      const prompt = buildEvaluationSystemPrompt('arcs', QUALITY_CRITERIA.arcs, 'detective');
      expect(prompt).toContain('the investigation did not observe this');
      expect(prompt).not.toContain("Nova didn't see this");
    });

    it('uses theme-aware critical checks for detective article evaluation', () => {
      const prompt = buildEvaluationSystemPrompt('article', getArticleCriteria('detective'), 'detective');
      expect(prompt).toContain('third-person investigative voice');
      expect(prompt).toContain('character sheet');
      expect(prompt).not.toContain('em-dashes');
    });
  });

  describe('getNpcDescriptions', () => {
    it('returns Marcus, Nova, Blake for journalist', () => {
      const desc = getNpcDescriptions('journalist');
      expect(desc).toContain('Marcus');
      expect(desc).toContain('Nova');
      expect(desc).toContain('Blake');
    });

    it('returns Marcus, Blake but not Nova for detective', () => {
      const desc = getNpcDescriptions('detective');
      expect(desc).toContain('Marcus');
      expect(desc).toContain('Blake');
      expect(desc).not.toContain('Nova');
    });

    it('does not duplicate Blake/Valet entry', () => {
      const desc = getNpcDescriptions('journalist');
      const blakeMatches = desc.match(/Blake/g);
      // Blake appears once in the "Blake / Valet" description
      expect(blakeMatches.length).toBe(1);
    });

    it('returns empty string for unknown theme', () => {
      const desc = getNpcDescriptions('nonexistent');
      expect(desc).toBe('');
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

        // Brief 2.4: the record view replaced EXPOSED EVIDENCE DETAILS (name
        // summaries and 100-character excerpts).
        expect(prompt).toContain('<RECORD>');
        expect(prompt).not.toContain('EXPOSED EVIDENCE DETAILS');
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

      it('includes every photo analysis, not the first five (brief 2.4)', () => {
        const analyses = Array.from({ length: 10 }, (_, i) => ({
          filename: `photo${i}.jpg`
        }));
        const state = {
          photoAnalyses: { analyses }
        };
        const prompt = buildEvaluationUserPrompt('outline', state);

        expect(prompt).toContain('photo0.jpg');
        expect(prompt).toContain('photo4.jpg');
        // The outline judge of 092026 was shown five of nine and scored the
        // other four as photos "with NO analyses".
        expect(prompt).toContain('photo9.jpg');
        expect(prompt).toContain('PHOTOS (all 10 session photos');
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
      expect(getRevisionCap('outline')).toBe(2);
    });

    it('returns REVISION_CAPS.ARTICLE for article', () => {
      expect(getRevisionCap('article')).toBe(REVISION_CAPS.ARTICLE);
      expect(getRevisionCap('article')).toBe(2);
    });

    it('returns default 2 for unknown phase', () => {
      expect(getRevisionCap('unknown')).toBe(2);
    });
  });

  // NOTE: describe('getApprovalType') removed in interrupt() migration
  // Function getApprovalType was removed from evaluator-nodes.js
  // Checkpoint types are now handled via checkpointInterrupt() helper

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

      // NOTE: Mock evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.evaluationHistory.ready).toBe(true);
    });

    it('creates mock that returns not ready when configured', async () => {
      const mock = createMockEvaluator('arcs', { ready: false, issues: ['Issue 1'] });
      const result = await mock({ arcRevisionCount: 0 }, {});

      // Mock evaluator no longer sets awaitingApproval - checkpoint handles it
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

    // NOTE: 'sets correct approval type for phase' test removed
    // Mock evaluator no longer sets approvalType - checkpoint handles it via checkpointInterrupt()

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

    it('outline allows 2 automated passes per round, then hands over', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // At automated pass 1, should allow another (increment happens in graph.js)
      const result1 = await evaluateOutline({ outline: {}, outlineRevisionCount: 1 }, config);
      expect(result1.outlineRevisionCount).toBeUndefined(); // Increment moved to graph.js
      expect(result1.awaitingApproval).toBeUndefined();
      expect(result1.validationResults.passed).toBe(false);

      // At automated pass 2 (the cap), should escalate to the director
      const result2 = await evaluateOutline({ outline: {}, outlineRevisionCount: 2 }, config);
      // Evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result2.awaitingApproval).toBeUndefined();
      expect(result2.evaluationHistory.escalatedToHuman).toBe(true);
    });

    it('article allows 2 automated passes per round, then hands over', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // Under the cap the evaluator writes a failing record and the graph reworks
      const under = await evaluateArticle({ contentBundle: {}, articleRevisionCount: 1 }, config);
      expect(under.evaluationHistory.escalatedToHuman).toBeUndefined();

      // At automated pass 2 (the cap), should escalate to the director
      const result = await evaluateArticle({ contentBundle: {}, articleRevisionCount: 2 }, config);
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

  describe('validationResults for revision — PROMPT-REVIEW B4 / shared channel', () => {
    it('stamps the phase so a different phase reviser cannot consume it', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.5,
        structuralIssues: ['Missing roster members: Quinn']
      });
      const result = await evaluateArcs({ narrativeArcs: [{ id: 'a' }] }, { configurable: { sdkClient: mockClient } });
      expect(result.validationResults.phase).toBe('arcs');
    });

    it('forwards structuralIssues and advisoryWarnings to the reviser', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.5,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['coherence is thin'],
        confidence: 'high'
      });
      const result = await evaluateArcs({ narrativeArcs: [{ id: 'a' }] }, { configurable: { sdkClient: mockClient } });
      // These were computed, logged, stored in evaluationHistory — and then dropped
      // on the floor instead of being handed to the revision node.
      expect(result.validationResults.structuralIssues).toEqual(['Missing roster members: Quinn']);
      expect(result.validationResults.advisoryWarnings).toEqual(['coherence is thin']);
      expect(result.validationResults.confidence).toBe('high');
    });

    it('escalates at the cap with the structural+advisory findings, not `issues`', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.4,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['thin coherence']
      });
      const result = await evaluateArcs(
        { narrativeArcs: [{ id: 'a' }], _previousArcs: [{ id: 'a' }], arcRevisionCount: REVISION_CAPS.ARCS },
        { configurable: { sdkClient: mockClient } }
      );
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
      // `evaluation.issues` is absent in the structural/advisory schema, so the old
      // formatIssuesForMessage(evaluation.issues) produced "unspecified issues".
      expect(result.evaluationHistory.escalationReason).toContain('Missing roster members: Quinn');
      expect(result.evaluationHistory.escalationReason).toContain('thin coherence');
      expect(result.evaluationHistory.escalationReason).not.toContain('unspecified issues');
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

    // Brief 1.3: a passing evaluation used to write nothing, so the previous
    // failure stayed in the shared channel and the next rework prompt described an
    // evaluation state an hour out of date.
    it('records the pass instead of leaving the previous failure in the channel', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9,
        issues: [],
        advisoryWarnings: ['the second arc leans on one document'],
        criteriaScores: { coherence: { score: 0.9, type: 'advisory' } },
        confidence: 'high'
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs({ narrativeArcs: [] }, config);

      expect(result.validationResults).toEqual(expect.objectContaining({
        phase: 'arcs',
        passed: true,
        structuralIssues: [],
        advisoryWarnings: ['the second arc leans on one document'],
        confidence: 'high'
      }));
      expect(result.validationResults.criteriaScores.coherence.score).toBe(0.9);
    });

    it('records the escalation at the cap so the reworks that follow read the current state', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.4,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['thin coherence'],
        revisionGuidance: 'Cover Quinn.'
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(
        { narrativeArcs: [{ id: 'a' }], _previousArcs: [{ id: 'a' }], arcRevisionCount: REVISION_CAPS.ARCS },
        config
      );

      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
      expect(result.validationResults).toEqual(expect.objectContaining({
        phase: 'arcs',
        passed: false,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['thin coherence']
      }));
      expect(result.validationResults.revisionGuidance).toBe('Cover Quinn.');
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

describe('evaluateArticle — programmatic fact-check pre-check (BASELINE class 1)', () => {
  const { factCheckContentBundle } = require('../../../lib/content-bundle-fact-check');

  const SOURCE = 'You are standing by the bar when Vic leans in and hands you the number twice over.';

  // The card under test is an INLINE evidence card, which prints its content;
  // a sidebar entry prints only its headline and summary, so the card check reads
  // no sidebar text (slice 2.5).
  function stateWith(cardContent, extra = {}) {
    return {
      theme: 'journalist',
      contentBundle: {
        sections: [{
          id: 'the-story',
          type: 'narrative',
          content: [
            { type: 'paragraph', text: 'Vic and Mel argued.' },
            { type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: cardContent }
          ]
        }],
        evidenceCards: [{ tokenId: 'vic001', headline: 'The Offer', summary: 'Vic makes the offer' }]
      },
      arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: SOURCE }] }],
      sessionConfig: { roster: ['Vic', 'Mel'], reportingMode: 'on-site' },
      outline: {},
      ...extra
    };
  }

  it('skips the Opus call and routes to revision when a card is fabricated', async () => {
    const mockClient = jest.fn();
    const state = stateWith('Vic told me the job was already handed out to somebody else.');

    const result = await evaluateArticle(state, { configurable: { sdkClient: mockClient } });

    // The whole point: the $5 Opus evaluation is not paid for a bundle we can
    // already prove is wrong.
    expect(mockClient).not.toHaveBeenCalled();
    expect(result.evaluationHistory.ready).toBe(false);
    expect(result.evaluationHistory.source).toBe('fact-check');
    expect(result.evaluationHistory.structuralPassed).toBe(false);
    expect(result.evaluationHistory.phase).toBe('article');
    expect(result.validationResults.phase).toBe('article');
    expect(result.validationResults.passed).toBe(false);
    // The feedback IS the revision instruction.
    expect(result.validationResults.feedback).toContain('vic001');
    expect(result.validationResults.structuralIssues.length).toBeGreaterThan(0);
    expect(result._articleFactCheck.cardFidelity[0].ok).toBe(false);
  });

  it('runs Opus as usual and still stores the fact-check when the bundle is clean', async () => {
    const mockClient = jest.fn().mockResolvedValue({
      ready: true, structuralPassed: true, overallScore: 0.93, confidence: 'high'
    });
    const state = stateWith(SOURCE);

    const result = await evaluateArticle(state, { configurable: { sdkClient: mockClient } });

    expect(mockClient).toHaveBeenCalled();
    expect(result.evaluationHistory.ready).toBe(true);
    expect(result._articleFactCheck.structuralIssues).toEqual([]);
  });

  it('at the revision cap it runs Opus and escalates WITH the fact-check attached', async () => {
    const mockClient = jest.fn().mockResolvedValue({
      ready: false, structuralPassed: false, overallScore: 0.6, structuralIssues: ['thin closing']
    });
    const state = stateWith(
      'Vic told me the job was already handed out to somebody else.',
      { articleRevisionCount: REVISION_CAPS.ARTICLE }
    );

    const result = await evaluateArticle(state, { configurable: { sdkClient: mockClient } });

    expect(mockClient).toHaveBeenCalled();
    expect(result.evaluationHistory.escalatedToHuman).toBe(true);
    expect(result.evaluationHistory.escalationReason).toContain('vic001');
    expect(result._articleFactCheck.structuralIssues.length).toBeGreaterThan(0);
  });

  it('at the cap a passing Opus verdict cannot pass a bundle the fact-check disproved', async () => {
    // A proven defect outranks an opinion. Without this the record read
    // passed:true beside the card defects it carried, and the director's
    // send-back opened a rework prompt saying "Ready: YES" above its own
    // ISSUES TO ADDRESS list.
    const mockClient = jest.fn().mockResolvedValue({
      ready: true, structuralPassed: true, overallScore: 0.92, confidence: 'high'
    });
    const state = stateWith(
      'Vic told me the job was already handed out to somebody else.',
      { articleRevisionCount: REVISION_CAPS.ARTICLE }
    );

    const result = await evaluateArticle(state, { configurable: { sdkClient: mockClient } });

    expect(mockClient).toHaveBeenCalled();
    expect(result.validationResults.passed).toBe(false);
    expect(result.validationResults.structuralIssues.length).toBeGreaterThan(0);
    expect(result.validationResults.structuralIssues.join(' ')).toContain('vic001');
  });

  it('does not fact-check the arcs or outline phases', async () => {
    const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
    const result = await evaluateOutline(
      { outline: { lede: {} }, selectedArcs: ['a'], narrativeArcs: [{ id: 'a' }] },
      { configurable: { sdkClient: mockClient } }
    );
    expect(mockClient).toHaveBeenCalled();
    expect(result._articleFactCheck).toBeUndefined();
  });
});

describe('evaluateArticle fact-check guard', () => {
  it('does not fact-check a MISSING content bundle (reviseContentBundle error path)', async () => {
    const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
    const result = await evaluateArticle(
      { contentBundle: null, sessionConfig: { roster: ['Vic', 'Mel'] }, outline: {} },
      { configurable: { sdkClient: mockClient } }
    );
    // A missing bundle would otherwise report every roster member as uncovered
    // and route to a reviser with nothing to revise.
    expect(mockClient).toHaveBeenCalled();
    expect(result._articleFactCheck).toBeUndefined();
  });
});

describe('reporterMode: a remote article states its absence at most once (phase 2, 2.6)', () => {
  // 092026's remote article said it was not there five times, and this
  // criterion's evaluation praised it as voice. Attribution shows the absence;
  // announcing it again is a defect.
  it('the journalist criterion asks for attribution and names repetition a defect, not voice', () => {
    const { description } = getArticleCriteria('journalist').reporterMode;
    expect(description).toContain('by attributing it to the people who were there');
    expect(description).toContain('the article states that absence at most once');
    expect(description).toContain('stating it more than once is a defect, not a sign of voice');
  });

  it('the remote mode rule in the evaluation prompt says the same', () => {
    const prompt = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' }
    });
    expect(prompt).toContain('the article states it at most once');
    expect(prompt).toContain('is a reporterMode defect, not a sign of voice');
    // Unchanged: a presence claim is still a structural failure.
    expect(prompt).toContain('A first-person claim to have been present is a STRUCTURAL failure.');
  });

  it('the on-site mode rule carries no absence limit', () => {
    const prompt = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'on-site' }
    });
    expect(prompt).not.toContain('at most once');
    expect(prompt).toContain('The reporter watched the investigation from inside the room');
  });
});

describe('evaluateArticle — the card check reads what the page prints (slice 2.5)', () => {
  const SOURCE = 'You are standing by the bar when Vic leans in and hands you the number twice over.';

  function stateFor(theme, contentBundle) {
    return {
      theme,
      contentBundle,
      arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: SOURCE }] }],
      sessionConfig: { roster: ['Mel'], reportingMode: 'on-site' },
      outline: {}
    };
  }

  it('passes the theme through: a name only in the headline is covered on the journalist page, not the detective page', async () => {
    const bundle = {
      headline: { main: 'Mel and the ledger' },
      sections: [{ id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: 'The ledger never balanced.' }] }]
    };
    const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });

    const journalist = await evaluateArticle(stateFor('journalist', bundle), { configurable: { sdkClient: mockClient } });
    expect(journalist._articleFactCheck.rosterCoverage.missing).toEqual([]);

    const detective = await evaluateArticle(stateFor('detective', bundle), { configurable: { sdkClient: mockClient } });
    expect(detective._articleFactCheck.rosterCoverage.missing).toEqual(['Mel']);
  });

  it('does not send a rework for a sidebar entry whose content does not print', async () => {
    const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.93, confidence: 'high' });
    const state = stateFor('journalist', {
      sections: [{ id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: 'Mel watched the bar.' }] }],
      evidenceCards: [{ tokenId: 'vic001', headline: 'The Offer', summary: 'Vic makes the offer', content: 'A paraphrase, not the memory.' }]
    });

    const result = await evaluateArticle(state, { configurable: { sdkClient: mockClient } });

    expect(mockClient).toHaveBeenCalled();
    expect(result._articleFactCheck.structuralIssues).toEqual([]);
    expect(result.evaluationHistory.ready).toBe(true);
  });
});

describe('what each judge sees (phase 2, brief 2.4)', () => {
  // The judges scored what they could not see: the outline and article judges had
  // no documents, the article judge was asked whether every roster member is
  // named with no roster in its prompt, and the outline judge saw 5 of 9 photos
  // and a null interweaving plan. Each judge now reads the record view and its
  // writer's inputs, built by the writer's own renderers and builders.
  const { renderRecordView } = require('../../../lib/prompt-renderers/record-view');
  const { renderSessionFactsVerdict } = require('../../../lib/prompt-renderers/director-words-renderer');
  const { createPromptBuilder } = require('../../../lib/prompt-builder');
  const { _testing: { extractEvidenceSummary } } = require('../../../lib/workflow/nodes/arc-specialist-nodes');
  const { _testing: { buildSessionFacts } } = require('../../../lib/workflow/nodes/ai-nodes');

  const LONG_PAPER_TEXT = 'Patchwork LLP, engagement letter. The firm will represent Sarah Blackwood in the dissolution ' +
    'of her marriage to Marcus Blackwood, retained at 2:14 AM on February 21, with the retainer paid in full.';
  const PHOTOS = Array.from({ length: 9 }, (_, i) => `aln (${i + 1} of 9).jpg`);
  const WHITEBOARD = 'whiteboard.jpg';
  const PLAN = {
    suggestedOrder: ['arc-jess', 'arc-verdict'],
    convergencePoint: 'The six-vote overdose verdict, as reported by people in the room.',
    keyCallbacks: [{ plantIn: 'arc-jess', payoffIn: 'arc-verdict', detail: 'Plant: the paternity test. Payoff: the vote.' }]
  };
  const CORRECTION = 'The "Almost" line was Sam\'s, not Sarah\'s.';
  const ACCUSATION_RAW = 'Six votes for an accidental overdose, in a final round that had already deadlocked 4 to 4 between Alex and Vic.';

  function evidenceBundle() {
    return {
      exposed: {
        tokens: [
          {
            id: 'ale001',
            summary: 'HAIKU SUMMARY OF ALE001',
            owner: 'Alex',
            rawData: { name: 'ALE001 - Alex finds the code', fullDescription: 'ALEX.1 - 11:02PM - You open the repository and every commit is his.', owners: ['Alex Reeves'] }
          },
          {
            id: 'sam003',
            summary: 'HAIKU SUMMARY OF SAM003',
            rawData: { name: 'SAM003 - The compound', fullDescription: 'SAM.3 - 1:40AM - The vial is lighter than it was an hour ago.', owners: ['Sam Thorne'] }
          }
        ],
        paperEvidence: [
          { id: 'paper-1', name: 'Patchwork engagement letter', basicType: 'Document', description: LONG_PAPER_TEXT, owners: ['Sarah Blackwood'] },
          // A rescued item has no `id`; the record view names it by its Notion id.
          { notionId: 'rescued-notion-id', name: 'Paternity test', basicType: 'Document', description: 'Probability of paternity: 99.9%.' }
        ]
      },
      buried: {
        transactions: [
          { tokenId: 'jes002', shellAccount: 'Cayman', amount: 450000, time: '10:41 AM' },
          { tokenId: 'vic004', shellAccount: 'Offshore', amount: 1200000, time: '10:55 AM' }
        ],
        relationships: []
      }
    };
  }

  function realisticState(extra = {}) {
    const analyses = [...PHOTOS, WHITEBOARD].map((filename, i) => ({
      filename,
      identifiedCharacters: i % 2 === 0 ? ['Alex', 'Sam'] : ['Sam'],
      visualContent: `VISUAL CONTENT ${i + 1}`
    }));
    return {
      theme: 'journalist',
      sessionConfig: {
        roster: ['Alex', 'Sam'],
        rosterPronouns: { Alex: 'she/her', Sam: 'he/him' },
        reportingMode: 'remote',
        accusation: { accused: [], charge: 'accidental overdose', verdictKind: 'overdose' },
        accusationRaw: ACCUSATION_RAW
      },
      canonicalCharacters: { Alex: 'Alex Reeves', Sam: 'Sam Thorne', Marcus: 'Marcus Blackwood' },
      characterData: { characters: { Alex: { role: 'Software Engineer' } } },
      evidenceBundle: evidenceBundle(),
      narrativeArcs: [
        { id: 'arc-jess', title: 'Two cards', interweaving: { callbacks: ['the test'] } },
        { id: 'arc-verdict', title: 'The verdict' }
      ],
      selectedArcs: ['arc-jess', 'arc-verdict'],
      _arcAnalysisCache: { synthesisNotes: 'notes', interweavingPlan: PLAN },
      // The field the old judge read. It is not a state channel.
      interweavingPlan: { convergencePoint: 'DEAD FIELD' },
      sessionPhotos: [...PHOTOS, WHITEBOARD].map(f => `/sessions/092026/photos/${f}`),
      photoAnalyses: { analyses },
      heroImage: PHOTOS[0],
      whiteboardPhotoPath: `/sessions/092026/photos/${WHITEBOARD}`,
      photoDescriptions: {
        [PHOTOS[0]]: 'gathered by the public evidence screen',
        // Joined by basename, case-insensitively.
        'ALN (6 OF 9).JPG': 'in the midst of an investigation',
        [PHOTOS[7]]: 'reviewing the contents of a memory on one of Marcus\' scanners'
      },
      directorNotes: {
        rawProse: 'Early on, Sam and Sarah were in conversation. Overheard: "Sarah, you know almost everything about me. Almost."',
        quotes: [{ speaker: 'Sam', text: 'Almost.', confidence: 'high' }],
        transactionReferences: [],
        postInvestigationDevelopments: []
      },
      inputReviewCorrections: [CORRECTION],
      outline: { lede: { hook: 'Marcus Blackwood is dead.' } },
      contentBundle: {
        headline: { main: 'Nine people, one verdict' },
        sections: [{ id: 'the-story', type: 'narrative', content: [{ type: 'paragraph', text: 'Alex Reeves and Sam Thorne argued.' }] }]
      },
      ...extra
    };
  }

  function validIdsIn(prompt) {
    const start = prompt.indexOf('[', prompt.indexOf('ALL VALID EVIDENCE IDS'));
    return JSON.parse(prompt.slice(start, prompt.indexOf('<RECORD>')).trim());
  }

  describe('arc judge', () => {
    it('reads the record view in place of the name summaries and 100-character excerpts', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);

      // The documents part, as the arc writer's SECTION 3 takes it: the judge keeps
      // its own BURIED TRANSACTIONS list, so the buried lines appear once (R2).
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { buried: false }));
      expect(prompt).not.toContain('<buried-transactions>');
      expect(prompt.match(/BURIED TRANSACTIONS \(/g)).toHaveLength(1);
      expect(prompt).toContain('ALEX.1 - 11:02PM - You open the repository and every commit is his.');
      // The whole paper document, not its first 100 characters.
      expect(prompt).toContain(LONG_PAPER_TEXT);
      expect(prompt).not.toContain('HAIKU SUMMARY OF ALE001');
      expect(prompt).not.toContain('EXPOSED EVIDENCE DETAILS');
    });

    it('checks keyEvidence against the arc writer\'s own valid-id list, so every id names a document it can see', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);
      const ids = validIdsIn(prompt);

      expect(ids).toEqual(extractEvidenceSummary(state.evidenceBundle).allEvidenceIds);
      // The rescued document is named by its Notion id in the view; the old rule
      // (id || tokenId || pageId || name) listed it by name, so an arc citing the
      // id it was shown would have been judged invalid.
      expect(ids).toContain('rescued-notion-id');
      expect(prompt).toContain('<document id="rescued-notion-id"');
      const documentIds = [...prompt.matchAll(/<document id="([^"]+)"/g)].map(m => m[1]);
      expect([...documentIds].sort()).toEqual([...ids].sort());
    });
  });

  describe('outline judge', () => {
    it('reads the whole record view', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('outline', state);
      expect(prompt).toContain(renderRecordView(state.evidenceBundle));
      expect(prompt).toContain('- account: Cayman | amount: $450,000 | time: 10:41 AM');
    });

    it('sees every photo, each with the director\'s description joined by filename, and never the whiteboard', () => {
      const prompt = buildEvaluationUserPrompt('outline', realisticState());

      expect(prompt).toContain('PHOTOS (all 9 session photos');
      PHOTOS.forEach((filename, i) => {
        expect(prompt).toContain(`${i + 1}. ${i === 0 ? '[hero image] ' : ''}${filename}:`);
        expect(prompt).toContain(`VISUAL CONTENT ${i + 1}"`);
      });
      expect(prompt).toContain('1. [hero image] aln (1 of 9).jpg: Alex, Sam\n   The director\'s description, word for word: gathered by the public evidence screen');
      expect(prompt).toContain('aln (6 of 9).jpg: Sam\n   The director\'s description, word for word: in the midst of an investigation');
      expect(prompt).toContain('aln (8 of 9).jpg: Sam\n   The director\'s description, word for word: reviewing the contents of a memory on one of Marcus\' scanners');
      expect(prompt).toContain('aln (9 of 9).jpg: Alex, Sam\n   The director\'s description: none given');
      // Director-layer evidence, never an article photo (the writer's list drops it too).
      expect(prompt).not.toContain(WHITEBOARD);
      expect(prompt).not.toContain('PHOTO ANALYSES');
    });

    it('reads the real interweaving plan from _arcAnalysisCache', () => {
      const prompt = buildEvaluationUserPrompt('outline', realisticState());
      expect(prompt).toContain(`INTERWEAVING PLAN (from arc analysis):\n${JSON.stringify(PLAN, null, 2)}`);
      expect(prompt).not.toContain('DEAD FIELD');
    });

    it('leaves the plan section out when the arc analysis has none, instead of printing null', () => {
      for (const cache of [null, {}, { interweavingPlan: null }, { interweavingPlan: {} },
        { interweavingPlan: { suggestedOrder: [], convergencePoint: '', keyCallbacks: [] } }]) {
        const prompt = buildEvaluationUserPrompt('outline', realisticState({ _arcAnalysisCache: cache }));
        expect(prompt).not.toContain('INTERWEAVING PLAN');
        expect(prompt).not.toMatch(/\nnull\n/);
      }
    });
  });

  describe('article judge', () => {
    it('reads the roster with pronouns, the section the article writer gets, beside the session roster', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null });
      const writerRoster = createPromptBuilder({
        theme: 'journalist',
        sessionConfig: state.sessionConfig,
        canonicalCharacters: state.canonicalCharacters,
        characterData: state.characterData.characters
      })._rosterSection();

      expect(prompt).toContain(writerRoster);
      expect(prompt).toContain('- Alex → Alex Reeves (she/her)');
      expect(prompt).toContain('- Sam → Sam Thorne (he/him)');
      // characterPlacement asks whether every roster member is named: the judge is
      // told which characters were this session's players.
      expect(prompt).toContain('SESSION ROSTER (2 players who were present at this session\'s investigation):\nAlex Reeves\nSam Thorne');
    });

    it('the detective judge reads the detective writer\'s roster section, without pronouns', () => {
      const prompt = buildEvaluationUserPrompt('article', realisticState({ theme: 'detective' }), { factCheck: null });
      expect(prompt).toContain('- Alex → Alex Reeves\n');
      expect(prompt).not.toContain('- Alex → Alex Reeves (she/her)');
    });

    it('reads the full accusation: the parsed verdict and the director\'s account word for word', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null });

      expect(prompt).toContain(renderSessionFactsVerdict(buildSessionFacts(state)));
      expect(prompt).toContain('ACCUSATION: none (the room\'s verdict names no culprit: an overdose)');
      expect(prompt).toContain('CHARGE: accidental overdose');
      expect(prompt).toContain('<DIRECTOR_ACCUSATION>');
      expect(prompt).toContain(ACCUSATION_RAW);
    });

    it('reads the director\'s notes, with the input-review corrections after them', () => {
      const prompt = buildEvaluationUserPrompt('article', realisticState(), { factCheck: null });
      const notesEnd = prompt.indexOf('</DIRECTOR_NOTES>');

      expect(prompt).toContain('<DIRECTOR_NOTES>\nEarly on, Sam and Sarah were in conversation.');
      expect(notesEnd).toBeGreaterThan(-1);
      expect(prompt.indexOf('<DIRECTOR_CORRECTIONS>')).toBeGreaterThan(notesEnd);
      expect(prompt).toContain(CORRECTION);
      expect(prompt).toContain('<QUOTE_BANK>');
    });

    it('reads the whole record view', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null });
      expect(prompt).toContain(renderRecordView(state.evidenceBundle));
    });

    it('reads the fact check\'s result as two labelled lists, not the result object', () => {
      const factCheck = {
        structuralIssues: ['Evidence card "ale001" (in section "the-story") is not verbatim: copy its sentences from the document with that id in <RECORD>.'],
        advisoryWarnings: ['Absence stated 2 times (remote): "I was not there."'],
        cardFidelity: [{ tokenId: 'ale001', ok: false, reason: 'CARD FIDELITY INTERNALS', locations: [] }],
        rosterCoverage: { missing: [] },
        photoReferences: { invalid: [] },
        reporterMode: { violations: [] }
      };
      const prompt = buildEvaluationUserPrompt('article', realisticState(), { factCheck });

      expect(prompt).toContain('THE FACT CHECK ON THIS BUNDLE');
      expect(prompt).toContain(`Structural issues (1):\n- ${factCheck.structuralIssues[0]}`);
      expect(prompt).toContain(`Advisories (1):\n- ${factCheck.advisoryWarnings[0]}`);
      expect(prompt).not.toContain('CARD FIDELITY INTERNALS');
      expect(prompt).not.toContain('cardFidelity');
      // Beside the bundle it describes, right before the question.
      expect(prompt.indexOf('THE FACT CHECK ON THIS BUNDLE')).toBeGreaterThan(prompt.indexOf('CONTENT BUNDLE:'));
      expect(prompt.trim().endsWith('Is this article ready for human review?')).toBe(true);
    });

    it('says so when the check found nothing, and when it did not run', () => {
      const clean = buildEvaluationUserPrompt('article', realisticState(), { factCheck: { structuralIssues: [], advisoryWarnings: [] } });
      expect(clean).toContain('Structural issues (0):\n- none\nAdvisories (0):\n- none');

      const none = buildEvaluationUserPrompt('article', realisticState());
      expect(none).toContain('THE FACT CHECK ON THIS BUNDLE');
      expect(none).toContain('It did not run: there was no content bundle to check.');
    });

    it('never reads the state\'s _articleFactCheck, which belongs to the previous bundle until this evaluation writes it', () => {
      const state = realisticState({ _articleFactCheck: { structuralIssues: ['STALE ISSUE FROM THE LAST BUNDLE'], advisoryWarnings: [] } });
      const fresh = buildEvaluationUserPrompt('article', state, { factCheck: { structuralIssues: [], advisoryWarnings: [] } });
      const unset = buildEvaluationUserPrompt('article', state);
      expect(fresh).not.toContain('STALE ISSUE');
      expect(unset).not.toContain('STALE ISSUE');
    });
  });

  describe('the evaluator hands each judge its inputs', () => {
    const SOURCE = 'You are standing by the bar when Vic leans in and hands you the number twice over.';

    function articleState(cardContent, extra = {}) {
      return {
        theme: 'journalist',
        contentBundle: {
          sections: [{
            id: 'the-story',
            type: 'narrative',
            content: [
              { type: 'paragraph', text: 'Vic and Mel argued.' },
              { type: 'evidence-card', tokenId: 'vic001', headline: 'The Offer', content: cardContent }
            ]
          }]
        },
        arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: SOURCE }] }],
        sessionConfig: { roster: ['Vic', 'Mel'], reportingMode: 'on-site' },
        outline: {},
        // A previous bundle's result: this evaluation must not show it.
        _articleFactCheck: { structuralIssues: ['STALE ISSUE FROM THE LAST BUNDLE'], advisoryWarnings: [] },
        ...extra
      };
    }

    it('at the cap the article judge reads the structural issues the check proved', async () => {
      const mockClient = jest.fn().mockResolvedValue({ ready: false, structuralPassed: false, overallScore: 0.6 });
      const result = await evaluateArticle(
        articleState('Vic told me the job was already handed out to somebody else.', { articleRevisionCount: REVISION_CAPS.ARTICLE }),
        { configurable: { sdkClient: mockClient } }
      );

      const { prompt } = mockClient.mock.calls[0][0];
      const issues = result._articleFactCheck.structuralIssues;
      expect(issues.length).toBeGreaterThan(0);
      expect(prompt).toContain(`Structural issues (${issues.length}):`);
      issues.forEach(issue => expect(prompt).toContain(`- ${issue}`));
      expect(prompt).not.toContain('STALE ISSUE');
    });

    it('under the cap a clean bundle reaches the article judge with a clean check', async () => {
      const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.93 });
      await evaluateArticle(articleState(SOURCE), { configurable: { sdkClient: mockClient } });

      const { prompt } = mockClient.mock.calls[0][0];
      expect(prompt).toContain('Structural issues (0):\n- none');
      expect(prompt).not.toContain('STALE ISSUE');
    });

    it('the outline judge reads every photo, the plan and the record', async () => {
      const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
      await evaluateOutline(realisticState(), { configurable: { sdkClient: mockClient } });

      const { prompt } = mockClient.mock.calls[0][0];
      expect(prompt).toContain('9. aln (9 of 9).jpg');
      expect(prompt).toContain(PLAN.convergencePoint);
      expect(prompt).toContain('<RECORD>');
    });
  });

  describe('what does not change', () => {
    const split = (criteria) => ({
      structural: Object.keys(criteria).filter(k => criteria[k].type === 'structural'),
      advisory: Object.keys(criteria).filter(k => criteria[k].type === 'advisory')
    });

    it('the criteria and their structural or advisory status', () => {
      expect(split(QUALITY_CRITERIA.arcs)).toEqual({
        structural: ['rosterCoverage', 'evidenceIdValidity', 'accusationArcPresent'],
        advisory: ['coherence', 'evidenceConfidenceBalance']
      });
      expect(split(getOutlineCriteria('journalist'))).toEqual({
        structural: ['arcCoverage', 'requiredSections', 'arcSectionFlow', 'visualDistributionPlan'],
        advisory: ['sectionBalance', 'flowLogic', 'photoPlacement', 'wordBudget', 'loopArchitecture', 'arcInterweaving', 'visualMomentum', 'convergence']
      });
      expect(split(getArticleCriteria('journalist'))).toEqual({
        structural: ['voiceConsistency', 'antiPatterns', 'reporterMode', 'arcThreading'],
        advisory: ['visualDistribution', 'evidenceIntegration', 'characterPlacement', 'emotionalResonance']
      });
    });

    it('the fact check still runs first and short-circuits the judge under the automated budget', async () => {
      const mockClient = jest.fn();
      const result = await evaluateArticle(
        {
          theme: 'journalist',
          contentBundle: { sections: [{ id: 's', type: 'narrative', content: [{ type: 'evidence-card', tokenId: 'vic001', headline: 'h', content: 'Invented text that is in no document at all.' }] }] },
          arcEvidencePackages: [{ arcId: 'a1', evidenceItems: [{ id: 'vic001', fullContent: 'The real memory text, which says something else entirely.' }] }],
          sessionConfig: { roster: [], reportingMode: 'on-site' },
          outline: {}
        },
        { configurable: { sdkClient: mockClient } }
      );
      expect(mockClient).not.toHaveBeenCalled();
      expect(result.evaluationHistory.source).toBe('fact-check');
    });
  });
});
