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

// Phase 2 final fix wave, item 13: this file's output carries no warnings. Its
// fact-check fixtures used to name roster players with no canonicalCharacters, so
// buildSessionFacts printed the F1 "roster names with no canonical match" warning
// eight times. A test that makes the evaluator warn now fails here instead.
let warnSpy;
beforeEach(() => { warnSpy = jest.spyOn(console, 'warn'); });
afterEach(() => {
  const warnings = warnSpy.mock.calls.map((args) => String(args[0]));
  warnSpy.mockRestore();
  expect(warnings).toEqual([]);
});

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
      // Merge static criteria with dynamic outline/article criteria for full validation.
      // Phase 3 (3.4): a truth criterion carries rules and no weight; it decides readiness.
      const allCriteria = { ...QUALITY_CRITERIA, outline: getOutlineCriteria(), article: getArticleCriteria() };
      Object.entries(allCriteria).forEach(([phase, criteria]) => {
        if (!criteria) return; // Skip null entries
        Object.entries(criteria).filter(([, criterion]) => !criterion.truth).forEach(([name, criterion]) => {
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
        // Phase 3 (3.4): the truth criteria carry no weight.
        const totalWeight = Object.values(criteria).filter((c) => !c.truth).reduce((sum, c) => sum + c.weight, 0);
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
      // One entry line for Blake, with the Valet as its alias. The canon role names
      // Blake too ("Marcus called Blake his Valet", T15), so count entries, not words.
      const blakeEntries = desc.split('\n').filter((line) => /^- Blake\b/.test(line));
      expect(blakeEntries).toHaveLength(1);
      expect(desc.split('\n').filter((line) => /^- (?:the )?Valet\b/.test(line))).toHaveLength(0);
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
        // summaries and 100-character excerpts). Phase 3 (3.4): the journalist arc
        // judge reads the sales on the record view's morning timeline, not a list of
        // its own; the detective keeps the list.
        expect(prompt).toContain('<RECORD>');
        expect(prompt).not.toContain('EXPOSED EVIDENCE DETAILS');
        expect(prompt).toContain('<morning-timeline>');
        expect(prompt).not.toContain('BURIED TRANSACTIONS');
        expect(prompt).toContain('ALL VALID EVIDENCE IDS');
        expect(buildEvaluationUserPrompt('arcs', { ...state, theme: 'detective' })).toContain('BURIED TRANSACTIONS');
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
          // The judge lists the photos the writer could place: the session's photos.
          sessionPhotos: analyses.map(a => `/photos/${a.filename}`),
          photoAnalyses: { analyses }
        };
        const prompt = buildEvaluationUserPrompt('outline', state);

        expect(prompt).toContain('photo0.jpg');
        expect(prompt).toContain('photo4.jpg');
        // The outline judge of 092026 was shown five of nine and scored the
        // other four as photos "with NO analyses".
        expect(prompt).toContain('photo9.jpg');
        expect(prompt).toContain('PHOTOS (all 10 photos the outline could place');
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
      canonicalCharacters: { Vic: 'Vic Kingsley', Mel: 'Mel Nilsson' },
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
      { contentBundle: null, sessionConfig: { roster: ['Vic', 'Mel'] }, canonicalCharacters: { Vic: 'Vic Kingsley', Mel: 'Mel Nilsson' }, outline: {} },
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
  // Phase 3 (3.4): the criterion scores T8 as this session's mode block states it, and
  // exposed memories reach Nova by turn-in (spec T6, T8). The mode rule no longer lives in
  // the user prompt: the judge's system prompt carries the mode block, as every writer's does.
  // Phase 3 (3.9): it follows the remote mode block of round 7 (R13): the room's events
  // are told as scenes, with attribution where it matters, and the line that sent every
  // room event through "attribution to the people in the room" is gone.
  it('the journalist criterion tells the room in scenes and names repetition a failure', () => {
    const { description } = getArticleCriteria('journalist').reporterMode;
    expect(description).toContain('told as scenes, with attribution where it matters');
    expect(description).toContain('the absence stated more than once');
    expect(description).toContain('a claim to have seen or heard the room');
    expect(description).not.toContain('by attribution to the people in the room');
  });

  it('the remote judge reads the remote mode block, and its user prompt names the mode once', () => {
    const { loadModeBlock } = require('../../../lib/rule-set');
    const state = { contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' } };
    const prompt = buildEvaluationUserPrompt('article', state);
    expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: remote (the mode block in your instructions says what Nova could witness; reporterMode scores it)');
    expect(prompt).not.toContain('reached them as tips');
    const system = buildEvaluationSystemPrompt('article', getArticleCriteria('journalist'), 'journalist', { sessionConfig: state.sessionConfig });
    expect(system).toContain(loadModeBlock('remote'));
  });

  it('the on-site judge reads the on-site mode block, which carries no absence limit', () => {
    const { loadModeBlock } = require('../../../lib/rule-set');
    const prompt = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'on-site' }
    });
    expect(prompt).not.toContain('at most once');
    expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: on-site');
    const system = buildEvaluationSystemPrompt('article', getArticleCriteria('journalist'), 'journalist', { sessionConfig: { reportingMode: 'on-site' } });
    expect(system).toContain(loadModeBlock('on-site'));
    expect(loadModeBlock('on-site')).not.toContain('at most once');
  });

  it('the detective judge keeps today\'s mode rule in its user prompt', () => {
    const prompt = buildEvaluationUserPrompt('article', {
      theme: 'detective', contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' }
    });
    expect(prompt).toContain('A first-person claim to have been present is a STRUCTURAL failure.');
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
      canonicalCharacters: { Mel: 'Mel Nilsson' },
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
  const { renderSessionFactsVerdict, renderArcAccusation, photoKey } = require('../../../lib/prompt-renderers/director-words-renderer');
  const { renderDirectorEnrichmentBlock } = require('../../../lib/prompt-renderers/director-notes-renderer');
  const { createPromptBuilder } = require('../../../lib/prompt-builder');
  const { _testing: { extractEvidenceSummary } } = require('../../../lib/workflow/nodes/arc-specialist-nodes');
  const { _testing: { buildSessionFacts, buildAvailablePhotos, outlineWriterInputs, selectHeroImage } } = require('../../../lib/workflow/nodes/ai-nodes');

  /** The filenames the outline judge's PHOTOS section lists, in order. */
  function judgePhotoSet(prompt) {
    const photosSection = prompt.slice(prompt.indexOf('PHOTOS (all'), prompt.indexOf('SESSION ROSTER ('));
    return [...photosSection.matchAll(/^\d+\. (?:\[hero image\] )?(.+?): .*$/gm)].map(m => m[1]);
  }

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
      // The parse's player focus: the accusation the arc writer renders, and the
      // director's observations (the same prose as directorNotes.rawProse).
      playerFocus: {
        primaryInvestigation: 'Who supplied the compound?',
        primarySuspects: ['Alex'],
        accusation: {
          accused: [],
          charge: 'accidental overdose',
          reasoning: 'Ashe proposed an accidental overdose; six votes ended the deadlock.',
          verdictKind: 'overdose'
        },
        directorObservations: {
          rawProse: 'Early on, Sam and Sarah were in conversation. Overheard: "Sarah, you know almost everything about me. Almost."',
          quotes: [{ speaker: 'Sam', text: 'Almost.', confidence: 'high' }],
          postInvestigationDevelopments: []
        }
      },
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

  /** The roster section the article writer's system prompt carries, for this state. */
  function writerRosterSection(state) {
    return createPromptBuilder({
      theme: state.theme,
      sessionConfig: state.sessionConfig,
      canonicalCharacters: state.canonicalCharacters,
      characterData: state.characterData.characters
    })._rosterSection();
  }

  /** The director's notes with the corrections after them, as every writer renders them. */
  function writerNotesBlock(state) {
    const notes = state.directorNotes;
    return renderDirectorEnrichmentBlock({
      rawProse: notes.rawProse,
      quotes: notes.quotes,
      transactionReferences: notes.transactionReferences,
      postInvestigationDevelopments: notes.postInvestigationDevelopments,
      corrections: state.inputReviewCorrections
    });
  }

  const count = (text, part) => text.split(part).length - 1;

  describe('every judge gets the roster with pronouns and the director\'s words (roadmap 2.4)', () => {
    const PROMPTS = [
      ['arc', (state) => buildEvaluationUserPrompt('arcs', state)],
      ['outline', (state) => buildEvaluationUserPrompt('outline', state)],
      ['article', (state) => buildEvaluationUserPrompt('article', state, { factCheck: null })]
    ];

    it.each(PROMPTS)('the %s judge reads the writer\'s roster section with pronouns, once', (_, build) => {
      const state = realisticState();
      const prompt = build(state);
      expect(count(prompt, writerRosterSection(state))).toBe(1);
      expect(prompt).toContain('- Alex → Alex Reeves (she/her)');
      expect(prompt).toContain('- Sam → Sam Thorne (he/him)');
    });

    it.each(PROMPTS)('the %s judge reads the director\'s notes with the corrections after them, rendered as the writers render them, once', (_, build) => {
      const state = realisticState();
      const prompt = build(state);
      expect(count(prompt, writerNotesBlock(state))).toBe(1);
      // The notes' prose is not repeated anywhere else in the prompt.
      expect(count(prompt, state.directorNotes.rawProse)).toBe(1);
      expect(prompt.indexOf('<DIRECTOR_CORRECTIONS>')).toBeGreaterThan(prompt.indexOf('</DIRECTOR_NOTES>'));
      expect(prompt).toContain(CORRECTION);
    });

    it.each(PROMPTS)('the %s judge reads the director\'s accusation word for word, beside its parse, once', (_, build) => {
      const prompt = build(realisticState());
      expect(count(prompt, '<DIRECTOR_ACCUSATION>')).toBe(1);
      expect(count(prompt, ACCUSATION_RAW)).toBe(1);
      // The parse above it says the room named no culprit, never the victim.
      expect(prompt).toContain('none (the room\'s verdict names no culprit: an overdose)');
    });

    it.each(PROMPTS)('the %s judge on a detective session reads the detective roster section, without pronouns', (_, build) => {
      const state = realisticState({ theme: 'detective' });
      const prompt = build(state);
      expect(prompt).toContain(writerRosterSection(state));
      expect(prompt).toContain('- Alex → Alex Reeves\n');
      expect(prompt).not.toContain('- Alex → Alex Reeves (she/her)');
    });
  });

  describe('arc judge', () => {
    it('reads the record view in place of the name summaries and 100-character excerpts', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);

      // Phase 3 (3.4): the whole view, its sales on the morning timeline, in place of the
      // judge's own BURIED TRANSACTIONS list, so the buried lines appear once.
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig }));
      expect(prompt).not.toContain('<buried-transactions>');
      expect(prompt).not.toContain('BURIED TRANSACTIONS (');
      expect(prompt.match(/\| sale \|/g)).toHaveLength(2);
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

    it('reads the accusation as the arc writer renders it, with the director\'s account after the parse', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);
      const writerAccusation = renderArcAccusation(state.playerFocus.accusation, ACCUSATION_RAW, "Players' Reasoning");

      expect(prompt).toContain(`THE ACCUSATION (the parsed verdict, then the director's account word for word):\n${writerAccusation}`);
      expect(prompt).toContain('**Charge:** accidental overdose');
      expect(prompt).toContain('**Players\' Reasoning:** Ashe proposed an accidental overdose; six votes ended the deadlock.');
      expect(prompt.indexOf('<DIRECTOR_ACCUSATION>')).toBeGreaterThan(prompt.indexOf('**Accused:**'));
    });

    it('keeps the investigation focus in PLAYER FOCUS, without the accusation and observations it now renders', () => {
      const prompt = buildEvaluationUserPrompt('arcs', realisticState());
      const start = prompt.indexOf('{', prompt.indexOf('PLAYER FOCUS ('));
      const playerFocus = JSON.parse(prompt.slice(start, prompt.indexOf('ALL VALID EVIDENCE IDS')).trim());

      expect(playerFocus).toEqual({ primaryInvestigation: 'Who supplied the compound?', primarySuspects: ['Alex'] });
    });

    it('puts the roster section after the coverage roster, which still names only the session\'s players', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);
      expect(prompt).toContain('SESSION ROSTER (2 players who were PRESENT this session):\n[\n  "Alex",\n  "Sam"\n]');
      expect(prompt.indexOf(writerRosterSection(state))).toBeGreaterThan(prompt.indexOf('ONLY check coverage for the 2 names'));
    });
  });

  describe('outline judge', () => {
    it('reads the whole record view', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('outline', state);
      // Phase 3 (3.5): with the session config, so the sales sit on the morning timeline.
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig }));
      expect(prompt).toContain('- 10:41 AM | sale | account: Cayman | amount: $450,000');
    });

    it('sees every photo, each with the director\'s description joined by filename, and never the whiteboard', () => {
      const prompt = buildEvaluationUserPrompt('outline', realisticState());

      expect(prompt).toContain('PHOTOS (all 9 photos the outline could place');
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

    it('lists exactly the photos the outline writer could place: the hero, then the writer\'s own list', () => {
      // Two photos the lists would disagree on if the judge re-derived its own:
      // an analysis for a photo that is no longer a session photo (the writer's
      // list, built from sessionPhotos, excludes it), and a session photo that has
      // no analysis (the writer's list keeps it).
      const state = realisticState();
      state.photoAnalyses = {
        analyses: [...state.photoAnalyses.analyses, { filename: 'dropped from the session.jpg', visualContent: 'DROPPED' }]
      };
      state.sessionPhotos = [...state.sessionPhotos, '/sessions/092026/photos/late arrival.jpg'];
      const prompt = buildEvaluationUserPrompt('outline', state);

      const whiteboardFilename = state.whiteboardPhotoPath.split(/[/\\]/).pop();
      const writerSet = [state.heroImage, ...buildAvailablePhotos(state, state.heroImage, whiteboardFilename).map(p => p.filename)];
      // The same set the outline writer and its reworker build their prompts from.
      const [, , writerHero, writerPhotos] = outlineWriterInputs(state, state.heroImage);
      const judgeSet = judgePhotoSet(prompt);

      expect(judgeSet).toEqual(writerSet);
      expect(judgeSet).toEqual([writerHero, ...writerPhotos.map(p => p.filename)]);
      expect(judgeSet).toHaveLength(10);
      expect(prompt).not.toContain('dropped from the session.jpg');
      expect(prompt).not.toContain('DROPPED');
      expect(prompt).toContain('10. late arrival.jpg: Unknown\n   The director\'s description: none given\n   Photo analysis: none recorded for this photo');
      expect(prompt).toContain('PHOTOS (all 10 photos the outline could place');
    });

    it('with no stored hero, uses the hero the writer and its reworker would select', () => {
      const state = realisticState({ heroImage: null });
      const prompt = buildEvaluationUserPrompt('outline', state);
      const hero = selectHeroImage(state);
      const [, , , writerPhotos] = outlineWriterInputs(state, hero);

      expect(judgePhotoSet(prompt)).toEqual([hero, ...writerPhotos.map(p => p.filename)]);
      expect(prompt).toContain(`1. [hero image] ${hero}:`);
      expect(prompt.split(`${hero}:`)).toHaveLength(2);
    });

    it('pairs each photo with its analysis by the renderer\'s join key, whatever the case of either filename', () => {
      const state = realisticState();
      state.photoAnalyses = {
        analyses: state.photoAnalyses.analyses.map(a =>
          (a.filename === PHOTOS[2] ? { ...a, filename: a.filename.toUpperCase() } : a))
      };
      const prompt = buildEvaluationUserPrompt('outline', state);

      expect(photoKey(PHOTOS[2].toUpperCase())).toBe(photoKey(PHOTOS[2]));
      expect(prompt).toContain('VISUAL CONTENT 3"');
      expect(prompt).not.toContain('Photo analysis: none recorded');
    });

    it('reads the real interweaving plan from _arcAnalysisCache', () => {
      const prompt = buildEvaluationUserPrompt('outline', realisticState());
      expect(prompt).toContain(`INTERWEAVING PLAN (from arc analysis):\n${JSON.stringify(PLAN, null, 2)}`);
      expect(prompt).not.toContain('DEAD FIELD');
    });

    it('reads the session roster and the verdict as its writer\'s SESSION_FACTS prints them', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('outline', state);

      expect(prompt).toContain('SESSION ROSTER (2 players who were present at this session\'s investigation):\nAlex Reeves\nSam Thorne');
      expect(prompt).toContain(renderSessionFactsVerdict(buildSessionFacts(state)));
      expect(prompt).toContain('CHARGE: accidental overdose');
    });

    it('keeps every photo and the plan beside the new inputs, ahead of the record', () => {
      const prompt = buildEvaluationUserPrompt('outline', realisticState());
      const photos = prompt.indexOf('PHOTOS (all 9 photos the outline could place');
      const roster = prompt.indexOf('SESSION ROSTER (');
      const notes = prompt.indexOf('<DIRECTOR_NOTES>');
      const record = prompt.indexOf('<RECORD>');

      expect(prompt.indexOf('INTERWEAVING PLAN')).toBeLessThan(photos);
      expect(photos).toBeLessThan(roster);
      expect(roster).toBeLessThan(notes);
      expect(notes).toBeLessThan(record);
      expect(record).toBeLessThan(prompt.indexOf('MOMENTUM EVALUATION'));
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
      // Phase 3 (3.5): with the session config, so the sales sit on the morning timeline.
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig }));
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
        canonicalCharacters: { Vic: 'Vic Kingsley', Mel: 'Mel Nilsson' },
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
      // Phase 3 (3.4) adds the truth criteria (structural, journalist only); the
      // criteria that were here keep their status.
      const withoutTruth = (criteria) => Object.fromEntries(Object.entries(criteria).filter(([, c]) => !c.truth));
      expect(split(QUALITY_CRITERIA.arcs)).toEqual({
        structural: ['rosterCoverage', 'evidenceIdValidity', 'accusationArcPresent'],
        advisory: ['coherence', 'evidenceConfidenceBalance']
      });
      expect(split(withoutTruth(getOutlineCriteria('journalist')))).toEqual({
        structural: ['arcCoverage', 'requiredSections', 'arcSectionFlow', 'visualDistributionPlan'],
        advisory: ['sectionBalance', 'flowLogic', 'photoPlacement', 'wordBudget', 'loopArchitecture', 'arcInterweaving', 'visualMomentum', 'convergence']
      });
      expect(split(withoutTruth(getArticleCriteria('journalist')))).toEqual({
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

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3, brief 3.4: the judges read the rule set the writers read, and score
// the truth rules as must-fix (spec 2026-09-30-rule-set.md sections 4 and 8, R2).
// ═══════════════════════════════════════════════════════════════════════════
describe('the judges read the rule set (phase 3, 3.4)', () => {
  const crypto = require('crypto');
  const { loadRuleSet, loadModeBlock } = require('../../../lib/rule-set');
  const { getThemeNPCEntries } = require('../../../lib/theme-config');
  const { renderRecordView } = require('../../../lib/prompt-renderers/record-view');
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');
  const { _testing: { getPhaseCriteria, getArcCriteria } } = require('../../../lib/workflow/nodes/evaluator-nodes');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const count = (text, part) => text.split(part).length - 1;
  const JUDGE_CALLS = [['arcs', 'judge-arc'], ['outline', 'judge-outline'], ['article', 'judge-article']];
  const stateFor = (theme = 'journalist', extra = {}) => ({ ...reworkFixtureState(theme), contentBundle: clone(PREVIOUS_BUNDLE), ...extra });
  const systemFor = (phase, state) => buildEvaluationSystemPrompt(
    phase, getPhaseCriteria(phase, state.theme), state.theme, { sessionConfig: state.sessionConfig }
  );
  const userFor = (phase, state) => buildEvaluationUserPrompt(phase, state, { factCheck: null });

  /** The truth groups of brief 3.4, by criterion, with the rules each names. */
  const TRUTH_GROUPS = {
    evidenceTruth: ['T1', 'T3', 'T4', 'T6'],
    moneyTruth: ['T5'],
    verdictTruth: ['T2'],
    stagesTruth: ['T7'],
    novaPositionTruth: ['T8'],
    playersTruth: ['T9', 'T11'],
    wordsTruth: ['T12'],
    photosTruth: ['T13'],
    fictionTruth: ['T14']
  };
  // Arcs place no photos and print nothing, so T13 and T14 have nothing to score there:
  // a criterion that could only misfire would spend an automatic arc rework.
  const ARC_TRUTH = Object.keys(TRUTH_GROUPS).filter((k) => k !== 'photosTruth' && k !== 'fictionTruth');
  const TRUTH_BY_PHASE = { arcs: ARC_TRUTH, outline: Object.keys(TRUTH_GROUPS), article: Object.keys(TRUTH_GROUPS) };

  describe('wiring: the world, the truth rules and the mode block in the system prompt', () => {
    it.each(JUDGE_CALLS)('the journalist %s judge reads the world and the truth rules once', (phase, call) => {
      const prompt = systemFor(phase, stateFor());
      const { core } = loadRuleSet(call);
      expect(count(prompt, core)).toBe(1);
      expect(count(prompt, '<truth-rules>')).toBe(1);
    });

    it.each(JUDGE_CALLS)('the journalist %s judge reads the session\'s mode block once, right after the identity line', (phase) => {
      for (const mode of ['on-site', 'remote']) {
        const state = stateFor('journalist');
        state.sessionConfig.reportingMode = mode;
        const prompt = systemFor(phase, state);
        const block = loadModeBlock(mode);
        const other = loadModeBlock(mode === 'remote' ? 'on-site' : 'remote');
        expect(count(prompt, block)).toBe(1);
        expect(prompt).not.toContain(other);
        const [identity] = prompt.split('\n', 1);
        expect(prompt.startsWith(`${identity}\n\n${block}\n\n`)).toBe(true);
        expect(prompt.indexOf(block)).toBeLessThan(prompt.indexOf('<world>'));
      }
    });

    it.each(JUDGE_CALLS)('the journalist %s judge reads its writer\'s craft files in the user prompt, after the record', (phase, call) => {
      const prompt = userFor(phase, stateFor());
      const { craft } = loadRuleSet(call);
      expect(count(prompt, craft)).toBe(1);
      expect(prompt.indexOf(craft)).toBeGreaterThan(prompt.indexOf('</RECORD>'));
      // The truth rules sit in the system prompt only.
      expect(prompt).not.toContain('<truth-rules>');
      expect(prompt).not.toContain('<world>');
    });

    it('each judge reads exactly its writer\'s craft list', () => {
      const craftTags = (phase) => [...userFor(phase, stateFor()).matchAll(/^<(craft-[a-z]+)>$/gm)].map((m) => m[1]);
      // Task 3.8: the craft files grouped by the writer's job (spec section 8).
      expect(craftTags('arcs')).toEqual(['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions']);
      expect(craftTags('outline')).toEqual(['craft-story', 'craft-form', 'craft-material', 'craft-judgement',
        'craft-telling', 'craft-cards', 'craft-questions']);
      expect(craftTags('article')).toEqual(['craft-story', 'craft-form', 'craft-material', 'craft-voice',
        'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions']);
    });

    it('says a craft finding is should-consider, naming its item', () => {
      for (const [phase] of JUDGE_CALLS) {
        const prompt = systemFor(phase, stateFor());
        expect(prompt).toContain('CRAFT FINDINGS');
        expect(prompt).toMatch(/craft finding[^\n]*advisoryWarnings/i);
      }
    });

    it('createEvaluator sends the judge the session\'s mode block', async () => {
      const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
      await evaluateOutline(stateFor('journalist', { outlineApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
      expect(mockClient.mock.calls[0][0].systemPrompt).toContain(loadModeBlock('remote'));
    });
  });

  describe('the truth criteria (must-fix, R2)', () => {
    it.each(['arcs', 'outline', 'article'])('the journalist %s judge scores its truth groups, each structural and naming its rules', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      const truthKeys = Object.keys(criteria).filter((k) => criteria[k].truth === true);
      expect(truthKeys).toEqual(TRUTH_BY_PHASE[phase]);
      for (const key of truthKeys) {
        expect(criteria[key].type).toBe('structural');
        expect(criteria[key].rules).toEqual(TRUTH_GROUPS[key]);
        for (const rule of TRUTH_GROUPS[key]) expect(criteria[key].description).toMatch(new RegExp(`\\b${rule}\\b`));
      }
    });

    it.each(['arcs', 'outline', 'article'])('the %s system prompt lists each truth criterion with its rules, and asks for the sentence and the record', (phase) => {
      const prompt = systemFor(phase, stateFor());
      for (const key of TRUTH_BY_PHASE[phase]) {
        expect(prompt).toContain(`- ${key} (${TRUTH_GROUPS[key].join(', ')}; must pass):`);
      }
      expect(prompt).toContain('TRUTH RULES (MUST PASS');
      expect(prompt).toMatch(/opens with the rule ids/);
      expect(prompt).toMatch(/the record it contradicts/);
    });

    it('carries no weight: the weighted criteria still make up the whole score', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const criteria = getPhaseCriteria(phase, 'journalist');
        const weighted = Object.values(criteria).filter((c) => !c.truth);
        expect(weighted.reduce((sum, c) => sum + c.weight, 0)).toBeCloseTo(1.0, 5);
        Object.values(criteria).filter((c) => c.truth).forEach((c) => expect(c.weight).toBeUndefined());
      }
    });

    it('the detective judges carry no truth criterion', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const criteria = getPhaseCriteria(phase, 'detective');
        expect(Object.values(criteria).some((c) => c.truth)).toBe(false);
      }
    });
  });

  // Fix round 1: a truth criterion scored below 0.8 holds the output to not-ready, so a
  // clause the judge cannot check against its own prompt sends the draft back for a
  // rework that cannot fix it. Each criterion names the material it reads, and each
  // judge's prompts must print every one.
  describe('each truth criterion reads only what its judge\'s prompt holds', () => {
    const { _testing: { TRUTH_MATERIAL } } = require('../../../lib/workflow/nodes/evaluator-nodes');
    const { renderPhotoEntry } = require('../../../lib/prompt-renderers/director-words-renderer');
    const outlineSchema = require('../../../lib/schemas/outline.schema.json');

    /** The fixture, with a bundle that prints a hero image and a captioned photo beside its cards. */
    const fullState = () => {
      const state = stateFor('journalist');
      state.heroImage = 'hero.jpg';
      state.contentBundle.heroImage = { filename: 'hero.jpg', caption: 'The room before the vote.' };
      state.contentBundle.sections[0].content.push({ type: 'photo', filename: 'p2.jpg', caption: 'Alex points at a line in the ledger.' });
      return state;
    };
    const truthOf = (phase) => Object.entries(getPhaseCriteria(phase, 'journalist')).filter(([, c]) => c.truth);
    /** Every property name anywhere in a JSON schema. */
    const propertyNames = (schema) => {
      const names = new Set();
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.properties) Object.keys(node.properties).forEach((name) => names.add(name));
        Object.values(node).forEach(walk);
      };
      walk(schema);
      return names;
    };

    it.each(['arcs', 'outline', 'article'])('every material a %s truth criterion reads is printed in that judge\'s prompts', (phase) => {
      const state = fullState();
      const prompts = `${systemFor(phase, state)}\n${userFor(phase, state)}`;
      const missing = [];
      for (const [key, criterion] of truthOf(phase)) {
        expect(Array.isArray(criterion.reads) && criterion.reads.length > 0).toBe(true);
        for (const material of criterion.reads) {
          expect(Object.keys(TRUTH_MATERIAL)).toContain(material);
          if (!prompts.includes(TRUTH_MATERIAL[material])) missing.push(`${key} reads ${material}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('only the article judge reads printed card text and captions: the arcs and the outline hold neither', () => {
      // An outline places cards by id and photos by filename: no caption, no card text.
      const outlineFields = propertyNames(outlineSchema);
      for (const field of ['caption', 'content', 'text', 'headline']) expect(outlineFields.has(field)).toBe(false);
      for (const phase of ['arcs', 'outline']) {
        for (const [key, criterion] of truthOf(phase)) {
          expect([key, criterion.reads.filter((m) => m === 'printedCards' || m === 'printedCaptions')]).toEqual([key, []]);
          expect([key, criterion.description]).not.toEqual([key, expect.stringMatching(/\bcaption|\bcards?\b/i)]);
        }
      }
      const article = getPhaseCriteria('article', 'journalist');
      expect(article.wordsTruth.reads).toContain('printedCards');
      expect(article.wordsTruth.description).toMatch(/does every card copy the record/);
      expect(article.photosTruth.reads).toContain('printedCaptions');
      expect(article.photosTruth.description).toMatch(/caption/);
    });

    it('the outline judge holds the outline to its photo slots: photos from PHOTOS only, the rest left to the article', () => {
      // The outline has one photoPlacement per arc and one in FOLLOW THE MONEY, so it
      // cannot place every photo of a session with more photos than slots (092026: 8).
      // Phase 3 (3.9, ruled): T13's every-photo check is the article's; the outline
      // places what its slots hold, and the article places the rest.
      const { photosTruth } = getPhaseCriteria('outline', 'journalist');
      expect(photosTruth.description).toMatch(/every photo the outline places come from PHOTOS/);
      expect(photosTruth.description).toMatch(/the article places the rest/);
      expect(photosTruth.description).not.toMatch(/every photo the director kept/);
    });

    it('the article judge holds the article to PHOTOS, the photos its writer was given', () => {
      const { photosTruth } = getPhaseCriteria('article', 'journalist');
      expect(photosTruth.description).toMatch(/every photo in PHOTOS/);
      expect(photosTruth.description).toMatch(/director's description/);
    });

    // Phase 3 (3.9, ruled): the article places every photo the director kept (T13), so
    // the article writer gets the outline writer's whole set, and the judge's PHOTOS is
    // that set. A kept photo no arc package lists (p9.jpg) used to reach neither.
    it('the article judge gets the article writer\'s photos: the hero, then every photo the director kept, once each, never the whiteboard', () => {
      const state = fullState();
      state.arcEvidencePackages[1].photos = [
        { filename: 'p2.jpg', characters: ['Alex'] },  // a package names it too: listed once
        { filename: 'whiteboard.jpg', characters: ['Riley'] }  // the whiteboard photo: left out
      ];
      state.sessionPhotos = [...state.sessionPhotos, 'photos/p9.jpg'];  // no package lists it
      const prompt = userFor('article', state);
      const start = prompt.indexOf('\nPHOTOS (');
      expect(start).toBeGreaterThan(prompt.indexOf('</RECORD>'));
      const section = prompt.slice(start, prompt.indexOf('CONTENT BUNDLE:'));
      expect(section).toContain(`1. [hero image] ${renderPhotoEntry({ filename: 'hero.jpg', names: ['Alex', 'Morgan', 'Sarah'] }, state.photoDescriptions, '   ')}`);
      expect(section).toContain(`2. ${renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, state.photoDescriptions, '   ')}`);
      expect(section).toContain("The director's description, word for word: Alex leans over the ledger and points at a line.");
      expect(section).toContain(`3. ${renderPhotoEntry({ filename: 'p9.jpg', names: [] }, state.photoDescriptions, '   ')}`);
      expect(count(section, 'p2.jpg')).toBe(1);
      expect(section).not.toContain('whiteboard.jpg');
    });

    it('the detective article judge gets no PHOTOS section', () => {
      const prompt = userFor('article', { ...fullState(), theme: 'detective' });
      expect(prompt).not.toContain('\nPHOTOS (');
    });
  });

  describe('a truth breach goes back automatically', () => {
    const judgeWith = (verdict) => jest.fn().mockResolvedValue(verdict);

    it('a truth criterion the judge failed keeps the outline from ready, whatever structuralPassed says', async () => {
      const mockClient = judgeWith({
        ready: true, structuralPassed: true, overallScore: 0.9,
        criteriaScores: { evidenceTruth: { score: 0.3, notes: 'The lede names Morgan as the exposer of mor001.', fix: 'Keep the exposure anonymous.' } },
        structuralIssues: [], advisoryWarnings: []
      });
      const result = await evaluateOutline(stateFor('journalist', { outlineApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });

      expect(result.evaluationHistory.ready).toBe(false);
      expect(result.validationResults.passed).toBe(false);
      // Labelled with its rules, so the evaluation bar and the rework both see which rule.
      expect(result.evaluationHistory.structuralIssues).toEqual([
        'T1, T3, T4, T6: The lede names Morgan as the exposer of mor001. Keep the exposure anonymous.'
      ]);
      expect(result.validationResults.structuralIssues).toContain(result.evaluationHistory.structuralIssues[0]);
    });

    it('adds no second line when the judge already wrote the breach under its rule', async () => {
      const issue = 'T6: "Morgan turned in mor001" names an exposer; the evidence log has the turn-in as anonymous. Keep it anonymous.';
      const mockClient = judgeWith({
        ready: false, structuralPassed: false, overallScore: 0.6,
        criteriaScores: { evidenceTruth: { score: 0.0, notes: 'names an exposer', fix: 'anonymous' } },
        structuralIssues: [issue], advisoryWarnings: []
      });
      const result = await evaluateArticle(stateFor('journalist', { articleApproved: false, evaluationHistory: [], articleRevisionCount: REVISION_CAPS.ARTICLE }),
        { configurable: { sdkClient: mockClient } });
      expect(result.evaluationHistory.structuralIssues).toEqual([issue]);
    });

    it('passes a truth criterion at the structural bar', async () => {
      const mockClient = judgeWith({
        ready: true, structuralPassed: true, overallScore: 0.9,
        criteriaScores: { evidenceTruth: { score: 0.8 }, moneyTruth: { score: 1 } }, structuralIssues: [], advisoryWarnings: []
      });
      const result = await evaluateArcs(stateFor('journalist', { selectedArcs: [], evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
      expect(result.evaluationHistory.ready).toBe(true);
      expect(result.evaluationHistory.structuralIssues).toEqual([]);
    });

    // Fix 3.4b (review finding 4, ruled): a truth criterion the judge leaves out of its
    // scores counts as not scored. It is logged by name and does not hold the output.
    it('logs each truth criterion the judge left unscored by name, and does not hold the output for it', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const mockClient = judgeWith({
          ready: true, structuralPassed: true, overallScore: 0.9,
          criteriaScores: {
            evidenceTruth: { score: 0.9 }, moneyTruth: { score: 1 }, verdictTruth: { score: 1 },
            stagesTruth: { score: 1 }, novaPositionTruth: { score: 1 },
            wordsTruth: { notes: 'no score given' }   // present, but with no number: not scored
          },
          structuralIssues: [], advisoryWarnings: []
        });
        const result = await evaluateArcs(stateFor('journalist', { selectedArcs: [], evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
        expect(result.evaluationHistory.ready).toBe(true);
        expect(result.evaluationHistory.structuralIssues).toEqual([]);
        const lines = log.mock.calls.map((call) => call.join(' ')).filter((line) => line.includes('not scored'));
        expect(lines).toEqual(['[evaluateArcs] Truth criteria not scored: playersTruth, wordsTruth']);
      } finally {
        log.mockRestore();
      }
    });

    it('logs nothing as unscored when the judge scored every truth criterion', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      try {
        const scores = Object.fromEntries(Object.entries(getPhaseCriteria('arcs', 'journalist'))
          .filter(([, criterion]) => criterion.truth).map(([key]) => [key, { score: 1 }]));
        const mockClient = judgeWith({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: scores, structuralIssues: [], advisoryWarnings: [] });
        await evaluateArcs(stateFor('journalist', { selectedArcs: [], evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
        expect(log.mock.calls.map((call) => call.join(' ')).filter((line) => line.includes('not scored'))).toEqual([]);
      } finally {
        log.mockRestore();
      }
    });
  });

  describe('the existing criteria keep their status', () => {
    const EXISTING = {
      arcs: {
        structural: ['rosterCoverage', 'evidenceIdValidity', 'accusationArcPresent'],
        advisory: ['coherence', 'evidenceConfidenceBalance']
      },
      outline: {
        structural: ['arcCoverage', 'requiredSections', 'arcSectionFlow', 'visualDistributionPlan'],
        advisory: ['sectionBalance', 'flowLogic', 'photoPlacement', 'wordBudget', 'loopArchitecture', 'arcInterweaving', 'visualMomentum', 'convergence']
      },
      article: {
        structural: ['voiceConsistency', 'antiPatterns', 'reporterMode', 'arcThreading'],
        advisory: ['visualDistribution', 'evidenceIntegration', 'characterPlacement', 'emotionalResonance']
      }
    };

    it.each(['arcs', 'outline', 'article'])('every journalist %s criterion keeps its type, and the truth criteria are the only additions', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      const existing = Object.keys(criteria).filter((k) => !criteria[k].truth);
      expect({
        structural: existing.filter((k) => criteria[k].type === 'structural'),
        advisory: existing.filter((k) => criteria[k].type === 'advisory')
      }).toEqual(EXISTING[phase]);
    });

    it.each(['arcs', 'outline', 'article'])('every journalist %s criterion names the rule or craft item it scores', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      for (const [key, { description }] of Object.entries(criteria)) {
        expect([key, description]).toEqual([key, expect.stringMatching(/\b[TC]\d{1,2}\b|<world>/)]);
      }
    });
  });

  describe('the reworded criteria', () => {
    const article = () => getArticleCriteria('journalist');
    const outline = () => getOutlineCriteria('journalist');

    it('voiceConsistency: first person, no "participatory", and "we" as T8 allows it', () => {
      const { description } = article().voiceConsistency;
      expect(description).not.toMatch(/participatory/i);
      expect(description).toContain('"we"');
      expect(description).toMatch(/\bT8\b/);
      expect(description).toMatch(/\bC12\b/);
    });

    // Phase 3 (3.9; R4, R22; final review judges-factcheck[2]): the structural slot
    // scores C4's em-dash house rule in Nova's prose and T14's production words only. It
    // read the whole of C4 and nearly held the gate's article for its length.
    it('antiPatterns: T14 and C4\'s em-dash house rule only; length and C4\'s other craft are craft findings', () => {
      const { description } = article().antiPatterns;
      expect(description).toMatch(/\bT14\b/);
      expect(description).toMatch(/\bC4\b/);
      expect(description).toMatch(/em-dash/);
      expect(description).toContain("Nova's own prose");
      expect(description).toContain("C4's length and its other craft are craft findings");
      expect(description).not.toContain('house style C4 states');
    });

    it('reporterMode: T8, exposures by turn-in and the room\'s events by attribution, never every exposure a tip', () => {
      const { description } = article().reporterMode;
      expect(description).toMatch(/\bT8\b/);
      expect(description).toMatch(/turn-in/);
      expect(description).toMatch(/attribution/);
      expect(description).not.toMatch(/\btips?\b/i);
      expect(description).toContain('more than once');
    });

    // Phase 3 (3.9; final review judges-factcheck[5]): the structural criteria hold to
    // the plan's wording, with no new craft judgement in a must-fix slot (R2, R22).
    it('arcSectionFlow and arcThreading: C2, every section essential, nothing front-loaded, not every arc in every section', () => {
      for (const { description } of [outline().arcSectionFlow, article().arcThreading]) {
        expect(description).toMatch(/\bC2\b/);
        expect(description).toContain('essential part of one narrative');
        expect(description).toContain('nothing front-loaded into THE STORY');
        expect(description).toContain('Not every arc appears in every section');
        expect(description).not.toContain('arcConnections');
        expect(description).not.toContain('→');
        expect(description).not.toContain('the thesis running through every section');
      }
    });

    it('visualDistributionPlan: photos spread through the article, with no count', () => {
      const { description } = outline().visualDistributionPlan;
      expect(description).toMatch(/photos spread through the article/);
      expect(description).not.toMatch(/every (?:two|three|\d)|\d+ (?:visuals|photos|cards|paragraphs)/);
      expect(description).not.toContain('pulls the reader on');
    });

    it('requiredSections: each printed section earns its place (C2), with no fixed list', () => {
      const { description } = outline().requiredSections;
      expect(description).toContain('earn its place');
      expect(description).not.toContain('lede, theStory, thePlayers, closing');
      expect(description).not.toContain('the thesis deciding which sections exist');
      expect(buildEvaluationSystemPrompt('outline', outline(), 'journalist')).not.toContain('MUST exist');
    });

    // Phase 3 (3.9): C16 of round 7: one convergence near the end, the thesis said once.
    it('convergence: C16, one convergence near the end where the thesis lands, said once', () => {
      const { description } = outline().convergence;
      expect(description).toMatch(/\bC16\b/);
      expect(description).toContain('near the end');
      expect(description).toContain('where the thesis lands');
      expect(description).toContain('said once');
      expect(description).not.toContain('spent early in THE STORY');
      expect(description).not.toContain('kept for the end');
    });

    // Phase 3 (3.9; C16): a planted detail scores only when its payoff moves the
    // throughline. The old text rewarded every plant, and the gate's outline planted
    // details the director cut for not tying into the story.
    it('loopArchitecture: a planted detail scores only when its payoff moves the throughline (C16)', () => {
      const { description } = outline().loopArchitecture;
      expect(description).toMatch(/\bC16\b/);
      expect(description).toContain('moves the throughline');
      expect(description).not.toContain('with details planted early coming back changed');
    });

    it('sectionBalance and wordBudget: about 1,500 words, with no per-section ranges', () => {
      for (const { description } of [outline().sectionBalance, outline().wordBudget]) {
        expect(description).toContain('about 1,500 words');
        expect(description).not.toMatch(/1000-1500|lede 75-150/);
      }
    });

    it('visualMomentum: cards and photos, not pull quotes', () => {
      const { description } = outline().visualMomentum;
      expect(description).toMatch(/cards? and photos?/i);
      expect(description).not.toMatch(/pull quote/i);
    });

    it('coherence: faults only incompatible facts, never arcs that pull against the verdict (C3)', () => {
      const { description } = getArcCriteria('journalist').coherence;
      expect(description).toMatch(/\bC3\b/);
      expect(description).toContain('cannot both be true');
      expect(description).toContain('pull against');
      expect(description).not.toContain('without contradictions');
    });

    it('the outline judge\'s momentum questions name no murder and no pull quotes', () => {
      const prompt = userFor('outline', stateFor());
      const momentum = prompt.slice(prompt.indexOf('MOMENTUM EVALUATION'));
      expect(momentum).not.toMatch(/murder/i);
      expect(momentum).not.toMatch(/pull quote/i);
      expect(momentum).toMatch(/near the end/);
      // Phase 3 (3.9): question 4 repeated the convergence clause C16 no longer carries.
      expect(momentum).not.toContain('spent early in THE STORY');
      expect(momentum).not.toContain('kept for the end');
    });

    it('the journalist scoring rule says how the score is made (M30)', () => {
      for (const [phase] of JUDGE_CALLS) {
        const prompt = systemFor(phase, stateFor());
        expect(prompt).not.toContain('pass (1.0), partial (0.5), fail (0.0)');
        expect(prompt).toContain('weighted average');
      }
    });
  });

  describe('lines that contradicted the rules', () => {
    it('the arc judge reads the director\'s notes through its writer\'s label, not as ground truth', () => {
      const prompt = systemFor('arcs', stateFor());
      expect(prompt).not.toMatch(/ground truth/i);
      // The judge's own wording of the label is gone (fix 3.4b item 6): the line is the
      // arc writer's label, below.
      expect(prompt).not.toContain('record for what happened and was said in the room');
    });

    // Fix 3.4b item 6: one source for the notes label. The arc judge's directorNotes line
    // prints ARC_NOTES_LABEL, which arc-specialist-nodes.js exports for the arc writer.
    it('the arc judge\'s director-notes line prints the label arc-specialist-nodes.js exports', () => {
      const ARC_NODES = '../../../lib/workflow/nodes/arc-specialist-nodes';
      try {
        jest.isolateModules(() => {
          const actual = jest.requireActual(ARC_NODES);
          jest.doMock(ARC_NODES, () => ({ ...actual, ARC_NOTES_LABEL: 'SENTINEL NOTES LABEL' }));
          const isolated = require('../../../lib/workflow/nodes/evaluator-nodes')._testing;
          const state = stateFor();
          const prompt = isolated.buildEvaluationSystemPrompt('arcs', isolated.getPhaseCriteria('arcs', 'journalist'),
            'journalist', { sessionConfig: state.sessionConfig });
          expect(prompt).toContain('- directorNotes: SENTINEL NOTES LABEL\n');
        });
      } finally {
        jest.dontMock(ARC_NODES);
      }
    });

    // The connection itself: the arc judge prints the arc writer's own label, exported
    // by arc-specialist-nodes.js (one source, fixes 3.3b and 3.4b).
    it('the arc judge\'s prompt carries the arc writer\'s label', () => {
      const { ARC_NOTES_LABEL } = require('../../../lib/workflow/nodes/arc-specialist-nodes');
      expect(typeof ARC_NOTES_LABEL).toBe('string');
      expect(ARC_NOTES_LABEL.trim()).not.toBe('');
      expect(systemFor('arcs', stateFor())).toContain(`- directorNotes: ${ARC_NOTES_LABEL}`);
    });

    it('the journalist NPC list reads each canon line from the theme config (M26)', () => {
      const lines = getNpcDescriptions('journalist').split('\n');
      const entries = getThemeNPCEntries('journalist').filter((e) => !e.aliasOf);
      expect(lines).toHaveLength(entries.length);
      entries.forEach((entry, i) => {
        expect(lines[i]).toContain(entry.fullName || entry.name);
        expect(lines[i]).toContain(entry.role);
      });
      expect(getNpcDescriptions('journalist')).not.toContain('should appear in most arcs');
      expect(getNpcDescriptions('journalist')).toContain('Valet');
    });

    it('the article judge\'s mode line points at the mode block and sends no exposure through a tipster', () => {
      const prompt = userFor('article', stateFor());
      expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: remote');
      expect(prompt).not.toMatch(/\btips\b/);
    });
  });

  describe('fields the page never prints', () => {
    const PRINTED_BUNDLE = {
      ...clone(PREVIOUS_BUNDLE),
      byline: { author: 'Cass Nova | NovaNews', title: 'Senior Investigative Correspondent', location: 'Fremont', date: 'Feb 22', guestReporter: 'Ashe Motoko | Contributing Reporter' },
      heroImage: { filename: 'hero.jpg', caption: 'The room at the vote', characters: ['Alex', 'Morgan'] },
      voice_self_check: { overall_assessment: 'SELF CHECK: every roster player is named' },
      pullQuotes: [{ type: 'verbatim', text: 'PULL QUOTE TEXT', attribution: 'Alex' }],
      photos: [{ filename: 'p2.jpg', caption: 'TOP LEVEL PHOTO CAPTION', characters: ['Alex'] }],
      financialTracker: { entries: [{ description: 'TRACKER ENTRY', amount: '$1' }], totalExposed: '$1' },
      _revisionHistory: [{ timestamp: 'REVISION HISTORY' }],
      evidenceCards: [{ tokenId: 'mor001', headline: 'The envelope', summary: 'Morgan pays Riley', content: 'SIDEBAR CONTENT', owner: 'SIDEBAR OWNER', significance: 'supporting', placement: 'sidebar' }]
    };
    PRINTED_BUNDLE.sections = [{
      id: 'the-story', type: 'narrative', heading: 'The Story',
      content: [
        { type: 'paragraph', text: 'Marcus bragged.' },
        { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: 'ALE003 - 11:32PM - MARCUS brags', owner: 'Alex Reeves', significance: 'critical' },
        { type: 'photo', filename: 'p2.jpg', caption: 'Alex at the ledger', characters: ['PHOTO CHARACTERS'] },
        { type: 'quote', text: 'Worth it.', attribution: 'Marcus' }
      ]
    }];

    const bundleIn = (prompt) => {
      const start = prompt.indexOf('{', prompt.indexOf('CONTENT BUNDLE:\n'));
      return JSON.parse(prompt.slice(start, prompt.indexOf('\n}\n', start) + 2));
    };

    it('the journalist article judge reads only what the page prints', () => {
      const prompt = userFor('article', stateFor('journalist', { contentBundle: clone(PRINTED_BUNDLE) }));
      for (const never of ['SELF CHECK', 'PULL QUOTE TEXT', 'TOP LEVEL PHOTO CAPTION', 'TRACKER ENTRY', 'REVISION HISTORY',
        'SIDEBAR CONTENT', 'SIDEBAR OWNER', 'PHOTO CHARACTERS', '"location"', '"date": "Feb 22"', 'generatedAt']) {
        expect([never, prompt.includes(never)]).toEqual([never, false]);
      }
      const shown = bundleIn(prompt);
      expect(Object.keys(shown).sort()).toEqual(['byline', 'evidenceCards', 'headline', 'heroImage', 'sections']);
      expect(shown.byline).toEqual({ author: 'Cass Nova | NovaNews', title: 'Senior Investigative Correspondent', guestReporter: 'Ashe Motoko | Contributing Reporter' });
      expect(shown.heroImage).toEqual({ filename: 'hero.jpg', caption: 'The room at the vote' });
      expect(shown.evidenceCards).toEqual([{ tokenId: 'mor001', headline: 'The envelope', summary: 'Morgan pays Riley', significance: 'supporting' }]);
      expect(shown.sections[0].content).toEqual([
        { type: 'paragraph', text: 'Marcus bragged.' },
        { type: 'evidence-card', tokenId: 'ale003', headline: 'The brag', content: 'ALE003 - 11:32PM - MARCUS brags', owner: 'Alex Reeves' },
        { type: 'photo', filename: 'p2.jpg', caption: 'Alex at the ledger' },
        { type: 'quote', text: 'Worth it.', attribution: 'Marcus' }
      ]);
    });

    // Fix 3.4b (review finding 5): with no ledger account above zero, the page prints the
    // writer's tracker (TemplateAssembler.overrideFinancialTracker passes it through), so
    // the judge reads its printed fields: each entry's description and amount, and the total.
    it('keeps the writer\'s tracker when no ledger account has a positive total, as the page prints it', () => {
      const bundle = clone(PRINTED_BUNDLE);
      bundle.financialTracker = {
        entries: [{ date: 'NOT PRINTED DATE', description: 'TRACKER ENTRY', amount: '$1', category: 'shell-account' }],
        totalExposed: '$1'
      };
      const printed = { entries: [{ description: 'TRACKER ENTRY', amount: '$1' }], totalExposed: '$1' };
      for (const shellAccounts of [[], [{ name: 'Melanie', total: 0, tokenCount: 0 }], undefined]) {
        const shown = bundleIn(userFor('article', stateFor('journalist', { contentBundle: clone(bundle), shellAccounts })));
        expect([shellAccounts, shown.financialTracker]).toEqual([shellAccounts, printed]);
      }
      // A ledger account above zero: the page prints the ledger, so the writer's tracker stays out.
      const ledger = bundleIn(userFor('article', stateFor('journalist', { contentBundle: clone(bundle) })));
      expect(ledger.financialTracker).toBeUndefined();
      // A writer's tracker with no entry: the page prints no tracker at all.
      const empty = { ...clone(bundle), financialTracker: { entries: [], totalExposed: '$0' } };
      expect(bundleIn(userFor('article', stateFor('journalist', { contentBundle: empty, shellAccounts: [] }))).financialTracker).toBeUndefined();
    });

    it('the detective article judge keeps today\'s bundle', () => {
      const prompt = userFor('article', stateFor('detective', { contentBundle: clone(PRINTED_BUNDLE) }));
      expect(prompt).toContain(JSON.stringify(PRINTED_BUNDLE, null, 2));
    });
  });

  describe('the arc judge reads the morning timeline (3.5\'s), not a list of its own', () => {
    it('the journalist arc judge reads the whole record view with the session config', () => {
      const state = stateFor();
      const prompt = userFor('arcs', state);
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { sessionConfig: state.sessionConfig }));
      expect(prompt).toContain('<morning-timeline>');
      expect(prompt).not.toContain('BURIED TRANSACTIONS (');
      expect(prompt).not.toContain('"accountName"');
    });

    it('the detective arc judge keeps its own list', () => {
      const state = stateFor('detective');
      const prompt = userFor('arcs', state);
      expect(prompt).toContain(renderRecordView(state.evidenceBundle, { buried: false }));
      expect(prompt).toContain('BURIED TRANSACTIONS (1 - for amount/account verification):');
    });
  });

  describe('the detective judges are unchanged', () => {
    // sha256 of `${systemPrompt}\n<<USER>>\n${prompt}` as each node sends it, for the
    // detective fixture state, taken at 9286ec6 before 3.4 changed a line. The bundle
    // carries fields the page never prints, which the detective judge still reads.
    // Task 3.11 moved all three by one line of the director's notes block they share
    // with the writers (renderDirectorEnrichmentBlock): the fixture's stored quote has
    // no context or correction naming Riley, so <QUOTE_BANK> prints "(speaker not
    // recorded)" for "Riley". Restoring that line gives back the 9286ec6 hashes.
    // Task 3.9 moved all three by the two lines of the OUTPUT FORMAT both themes share
    // (outputFormat; the integrator's ruling on the judge's contract): "fix" is written
    // only below the bar, and "revisionGuidance" holds one step per structural issue.
    // Restoring those two lines gives back the 3.11 hashes (a41aadbd..., fcdacdb8...,
    // a45757c8...).
    const PINNED = {
      arcs: '0faa4ba3cbdf058f6ac32675c7d657cbf844a6f86388968ecc3cab6757ae8d57',
      outline: '5282b08c81ad69cb8ab69f95eaa7aee15ca81deea7e2c14af1740dd406a7db8c',
      article: '6e6ee008220dffdcd408efa5d463b91ef7b523e4ccca9f1b256e2f52a0943692'
    };
    const VERDICT = { ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
    const JUDGES = {
      arcs: [evaluateArcs, { selectedArcs: [] }],
      outline: [evaluateOutline, { outlineApproved: false }],
      article: [evaluateArticle, { articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE }]
    };

    it.each(Object.keys(PINNED))('the detective %s judge sends byte for byte what it sent before 3.4', async (phase) => {
      const [node, extra] = JUDGES[phase];
      const state = {
        ...reworkFixtureState('detective'),
        contentBundle: { ...clone(PREVIOUS_BUNDLE), voice_self_check: { overall_assessment: 'SELF CHECK' }, pullQuotes: [{ text: 'PQ' }] },
        evaluationHistory: [],
        ...extra
      };
      let sent;
      await node(clone(state), { configurable: { sdkClient: async (o) => { sent = o; return clone(VERDICT); }, theme: 'detective' } });
      const hash = crypto.createHash('sha256').update(`${sent.systemPrompt}\n<<USER>>\n${sent.prompt}`).digest('hex');
      expect(hash).toBe(PINNED[phase]);
    });

    it('the detective criteria are today\'s', () => {
      expect(getArcCriteria('detective')).toEqual({
        rosterCoverage: { description: 'Does every roster member have a placement in at least one arc?', weight: 0.30, type: 'structural' },
        evidenceIdValidity: { description: 'Are all keyEvidence IDs valid (exist in evidence bundle)?', weight: 0.25, type: 'structural' },
        accusationArcPresent: { description: 'Is there an arc with arcSource="accusation" addressing the player accusation?', weight: 0.20, type: 'structural' },
        coherence: { description: 'Do arcs tell a consistent story without contradictions?', weight: 0.15, type: 'advisory' },
        evidenceConfidenceBalance: { description: 'Are there arcs with strong/moderate evidence (not all speculative)?', weight: 0.10, type: 'advisory' }
      });
      expect(getOutlineCriteria('detective')).toEqual({
        arcCoverage: { description: 'Does outline address all selected narrative threads?', weight: 0.25, type: 'structural' },
        requiredSections: { description: 'Are all required sections present (executiveSummary, evidenceLocker, suspectNetwork, outstandingQuestions, finalAssessment)?', weight: 0.25, type: 'structural' },
        sectionDifferentiation: { description: 'Does each section answer a DIFFERENT question about the case? No fact should repeat across sections.', weight: 0.20, type: 'structural' },
        sectionBalance: { description: 'Are sections appropriately weighted within the ~750 word budget?', weight: 0.10, type: 'advisory' },
        flowLogic: { description: 'Does the report flow logically from summary through evidence to assessment?', weight: 0.05, type: 'advisory' },
        evidenceSynthesis: { description: 'Is evidence grouped thematically and synthesized (not listed individually)?', weight: 0.10, type: 'advisory' },
        wordBudget: { description: 'Are section word budgets reasonable for a ~750 word report?', weight: 0.05, type: 'advisory' }
      });
      expect(getArticleCriteria('detective')).toEqual({
        voiceConsistency: { description: 'Does report maintain third-person investigative detective voice (professional, analytical)?', weight: 0.20, type: 'structural' },
        antiPatterns: { description: 'Are anti-patterns avoided? (token terminology, game mechanics, character sheet references; the in-world phrase "memory token" is allowed)', weight: 0.15, type: 'structural' },
        visualDistribution: { description: 'Are visual components distributed for compelling narrative flow (not clustered)? Goal is a compelling GIFT for players, not quota compliance.', weight: 0.10, type: 'advisory' },
        arcThreading: { description: 'Does each section answer a DIFFERENT QUESTION about the same underlying facts? Sections should be analytically distinct, not repetitive.', weight: 0.10, type: 'structural' },
        evidenceIntegration: { description: 'Is evidence woven in naturally?', weight: 0.15, type: 'advisory' },
        characterPlacement: { description: 'Are all roster members mentioned?', weight: 0.15, type: 'advisory' },
        emotionalResonance: { description: 'Does article deliver the promised experience?', weight: 0.15, type: 'advisory' }
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 3, brief 3.9: the judges are the newsroom's editors. They hold a draft for a
// definite error only (R22), check the money against the figures the writers were
// given, ask for the must-fix work alone, and see every photo the article places
// (spec round 7; the ledger's rulings of 2026-10-02).
// ═══════════════════════════════════════════════════════════════════════════
describe('the judges and the money line (phase 3, 3.9)', () => {
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');
  const { renderPhotoEntry } = require('../../../lib/prompt-renderers/director-words-renderer');
  const { _testing: { getPhaseCriteria, EVALUATION_JSON_SCHEMA } } = require('../../../lib/workflow/nodes/evaluator-nodes');
  const {
    generateContentBundle, reviseContentBundle, getPromptBuilder,
    _testing: { articleWriterInputs, buildAvailablePhotos }
  } = require('../../../lib/workflow/nodes/ai-nodes');
  const { _testing: graph } = require('../../../lib/workflow/graph');
  const { buildRollbackState } = require('../../../lib/api-helpers');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const count = (text, part) => text.split(part).length - 1;
  const stateFor = (theme = 'journalist', extra = {}) => ({ ...reworkFixtureState(theme), contentBundle: clone(PREVIOUS_BUNDLE), ...extra });
  const systemFor = (phase, state) => buildEvaluationSystemPrompt(
    phase, getPhaseCriteria(phase, state.theme), state.theme, { sessionConfig: state.sessionConfig }
  );
  const userFor = (phase, state) => buildEvaluationUserPrompt(phase, state, { factCheck: null });

  describe('the money line (T5)', () => {
    // At the gate five of eight outline and article verdicts flagged the code-made
    // $7,495,000 as a figure the writer computed, and the writers asked the director to
    // confirm it at two stops: no judge saw the summary the writers were given.
    it.each(['outline', 'article'])('the %s judge reads the writers\' FINANCIAL_SUMMARY, from the same builder and input, once, after the record', (phase) => {
      const state = stateFor();
      const prompt = userFor(phase, state);
      const block = getPromptBuilder(null, state)._buildFinancialSummary(state.shellAccounts).trim();
      expect(block.startsWith('<FINANCIAL_SUMMARY>')).toBe(true);
      expect(count(prompt, block)).toBe(1);
      expect(count(prompt, '<FINANCIAL_SUMMARY>')).toBe(1);
      expect(prompt.indexOf(block)).toBeGreaterThan(prompt.indexOf('</RECORD>'));
    });

    it('the arc judge, whose writer is given no summary, and the detective judges read none', () => {
      expect(userFor('arcs', stateFor())).not.toContain('FINANCIAL_SUMMARY');
      for (const phase of ['arcs', 'outline', 'article']) {
        expect([phase, userFor(phase, stateFor('detective')).includes('FINANCIAL_SUMMARY')]).toEqual([phase, false]);
      }
    });

    it('a session with no account above zero gives the judges no summary, as it gives the writers none', () => {
      const state = stateFor('journalist', { shellAccounts: [{ name: 'Melanie', total: 0, tokenCount: 0 }] });
      for (const phase of ['outline', 'article']) expect(userFor(phase, state)).not.toContain('FINANCIAL_SUMMARY');
    });

    it('moneyTruth asks whether the money runs from the buyer, with NeurAI and its board Nova\'s suspicion', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const { description } = getPhaseCriteria(phase, 'journalist').moneyTruth;
        expect(description).toContain("run from the buyer to the seller's chosen account");
        expect(description).toContain("NeurAI and its board written as Nova's suspicion");
        expect(description).toContain('the morning\'s payments for erasure');
        expect(description).toMatch(/\bT5\b/);
        expect(description).not.toContain("run from NeurAI's board");
        expect(description).not.toContain('other wealth');
      }
    });

    it('moneyTruth reads the timeline at every judge, and FINANCIAL_SUMMARY where its writer had it', () => {
      expect(getPhaseCriteria('arcs', 'journalist').moneyTruth.reads).toEqual(['timeline']);
      expect(getPhaseCriteria('arcs', 'journalist').moneyTruth.description).not.toContain('FINANCIAL_SUMMARY');
      for (const phase of ['outline', 'article']) {
        const { reads, description } = getPhaseCriteria(phase, 'journalist').moneyTruth;
        expect(reads).toEqual(['timeline', 'financialSummary']);
        expect(description).toContain('as the ledger or FINANCIAL_SUMMARY gives it');
      }
    });
  });

  describe('the truth criteria follow the truth lines of round 7', () => {
    const truthOf = (phase, key) => getPhaseCriteria(phase, 'journalist')[key].description;

    it('evidenceTruth (T4): a person is tied to an account as fact only on the director\'s sight of the sale or an open sale, never by its name', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const description = truthOf(phase, 'evidenceTruth');
        expect(description).toContain('only where the director saw the sale or it was made openly in front of the room');
        expect(description).toContain('never a reason to suspect its namesake (T4)');
        expect(description).not.toContain('read as proof of who holds it');
      }
    });

    it('stagesTruth (T7): what NovaNews is still chasing is Nova\'s intent and needs no epilogue', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        expect(truthOf(phase, 'stagesTruth')).toContain("What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue");
      }
    });

    it('novaPositionTruth (T8): Nova never votes, joins the room\'s accusation or exposes a memory', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const description = truthOf(phase, 'novaPositionTruth');
        expect(description).toContain("never votes, joins the room's accusation or exposes a memory");
        expect(description).not.toContain('accusations and exposures');
      }
    });

    it('reporterMode follows the remote mode block and T8', () => {
      const { description } = getArticleCriteria('journalist').reporterMode;
      expect(description).toMatch(/\bT8\b/);
      expect(description).toContain("Nova voting, joining the room's accusation or exposing a memory");
      expect(description).toContain('a claim to have seen or heard the room');
      expect(description).toContain('told as scenes, with attribution where it matters: a line someone was overheard saying, a claim about a person');
      expect(description).not.toContain('by attribution to the people in the room');
      expect(description).not.toContain('first-person claim to have been in the warehouse');
    });

    it('the comment beside the article judge\'s mode line no longer says the room reaches Nova by attribution', () => {
      const source = require('fs').readFileSync(require.resolve('../../../lib/workflow/nodes/evaluator-nodes'), 'utf8');
      expect(source).not.toContain('the room\'s events by attribution)');
    });

    it('two criteria that restated a craft item name it instead', () => {
      const coherence = getPhaseCriteria('arcs', 'journalist').coherence.description;
      expect(coherence).toMatch(/\bC16\b/);
      const visual = getArticleCriteria('journalist').visualDistribution.description;
      expect(visual).toMatch(/\bC9\b/);
      expect(visual).not.toContain('a budget and never a quota');
    });
  });

  // Gate 2: the article judge still told every judge that three cards beat ten, against
  // C9's budget of three to five. The detective is parked (D13) and keeps it.
  it('the journalist article judge has no card-count line; the detective\'s keeps it', () => {
    const LINE = 'A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.';
    expect(systemFor('article', stateFor())).not.toContain(LINE);
    expect(systemFor('article', stateFor('detective'))).toContain(LINE);
  });

  describe('craft findings are the editor\'s notes for the director (R22)', () => {
    it.each(['arcs', 'outline', 'article'])('the %s judge files a craft finding as an editor\'s note for the director, never a blocker', (phase) => {
      const prompt = systemFor(phase, stateFor());
      const section = prompt.slice(prompt.indexOf('CRAFT FINDINGS'), prompt.indexOf('EVALUATION RULES'));
      expect(section).toContain("an editor's note for the director, never a blocker");
      expect(section).not.toContain('for the rework');
    });

    it('a truth-labelled advisory stays an advisory: nothing holds the draft on it', async () => {
      const advisory = 'T1: "Remi watched the money go" says more than the emails; the director may want it softened.';
      const mockClient = jest.fn().mockResolvedValue({
        ready: true, structuralPassed: true, overallScore: 0.9,
        criteriaScores: { evidenceTruth: { score: 0.9 } }, structuralIssues: [], advisoryWarnings: [advisory]
      });
      const result = await evaluateOutline(stateFor('journalist', { outlineApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
      expect(result.evaluationHistory.ready).toBe(true);
      expect(result.evaluationHistory.structuralIssues).toEqual([]);
      expect(result.evaluationHistory.advisoryWarnings).toEqual([advisory]);
      expect(result.validationResults.passed).toBe(true);
    });
  });

  // Final review judges-factcheck[1]: every passing criterion carried a fix and the
  // guidance carried optional steps, and the reworks acted on them. The contract is
  // shared by both themes, so the detective's judges change with it (the ruling).
  describe('the judge\'s output contract asks for the must-fix work only (both themes)', () => {
    it('the schema asks for a criterion\'s fix only below the bar, and guidance only for the structural issues', () => {
      const { fix } = EVALUATION_JSON_SCHEMA.properties.criteriaScores.additionalProperties.properties;
      expect(fix.description).toContain('Only for a score below 0.8');
      expect(fix.description).not.toContain('raise this score');
      const { revisionGuidance } = EVALUATION_JSON_SCHEMA.properties;
      expect(revisionGuidance.type).toBe('string');
      expect(revisionGuidance.description).toContain('One step per structural issue');
    });

    it.each(['journalist', 'detective'])('the %s judges\' OUTPUT FORMAT asks for a fix only below the bar and one step per structural issue', (theme) => {
      for (const phase of ['arcs', 'outline', 'article']) {
        const prompt = systemFor(phase, stateFor(theme));
        const format = prompt.slice(prompt.indexOf('OUTPUT FORMAT (JSON):'));
        expect([phase, format]).toEqual([phase, expect.stringContaining('"fix": "only for a score below 0.8:')]);
        expect([phase, format]).toEqual([phase, expect.stringContaining('"revisionGuidance": "one step per structural issue')]);
        expect([phase, /optional/i.test(format)]).toEqual([phase, false]);
      }
    });
  });

  // The 4b fix batch (3.9 review minor 4): each journalist judge's "MUST be actionable"
  // block asked for "CONCRETE fixes" in general, a few lines above the OUTPUT FORMAT that
  // asks for a fix only below the bar and one step per structural issue, so it could pull
  // fix work back into the notes and the advisories. Its fixes are now the contract's.
  // The detective's blocks are unchanged (pinned by hash in "the detective judges are
  // unchanged").
  describe('the judges ask for fixes the way the contract does (the 4b fix batch)', () => {
    const { STRUCTURAL_PASS_SCORE } = require('../../../lib/workflow/nodes/node-helpers');
    const fixesLine = (prompt) => prompt.split('\n').find((line) => line.startsWith('- CONCRETE fixes'));

    it.each(['arcs', 'outline', 'article'])('the journalist %s judge asks for concrete fixes for the criteria below the bar and the structural issues', (phase) => {
      const prompt = systemFor(phase, stateFor());
      const block = prompt.slice(prompt.indexOf('CRITICAL: Your feedback MUST be actionable'), prompt.indexOf('OUTPUT FORMAT (JSON):'));
      expect(fixesLine(block)).toContain(`- CONCRETE fixes for each criterion scored below ${STRUCTURAL_PASS_SCORE} and each structural issue (not "`);
    });

    it('the detective judges keep their blocks', () => {
      for (const phase of ['arcs', 'outline', 'article']) {
        expect([phase, fixesLine(systemFor(phase, stateFor('detective'))).startsWith('- CONCRETE fixes (not "')]).toEqual([phase, true]);
      }
    });

    it('judge prompt text writes the bar through STRUCTURAL_PASS_SCORE, never as a number; the prompts read the same', () => {
      const source = require('fs').readFileSync(require.resolve('../../../lib/workflow/nodes/evaluator-nodes'), 'utf8');
      expect(source).not.toMatch(/MUST score >= 0\.8|score it below 0\.8/);
      expect(systemFor('arcs', stateFor())).toContain('STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements); a truth criterion with any breach fails.');
      expect(systemFor('arcs', stateFor())).toContain('One breach fails it: score it below 0.8.');
      expect(systemFor('arcs', stateFor('detective'))).toContain('2. STRUCTURAL criteria MUST score >= 0.8 to pass (these are hard requirements)\n');
    });
  });

  // The ledger's Gate 3 finding: a replay from START at a stop escalated at the cap paid
  // for its evaluation again, because the skip read only a ready entry.
  describe('a replay does not re-pay an escalated evaluation', () => {
    const escalated = (phase) => ({ phase, ready: false, escalatedToHuman: true, escalationReason: 'Reached revision cap (2)', timestamp: 't' });
    /** The state after an update, as the graph's reducers apply it (evaluationHistory appends). */
    const apply = (state, update) => ({
      ...state, ...update,
      evaluationHistory: [...(state.evaluationHistory || []), ...[].concat(update.evaluationHistory || [])]
    });
    const STOPS = {
      arcs: { node: evaluateArcs, route: 'routeArcEvaluation', increment: 'incrementArcRevision', counter: 'arcRevisionCount', cap: REVISION_CAPS.ARCS, feedback: '_arcFeedback', output: 'narrativeArcs', open: { selectedArcs: [] } },
      outline: { node: evaluateOutline, route: 'routeOutlineEvaluation', increment: 'incrementOutlineRevision', counter: 'outlineRevisionCount', cap: REVISION_CAPS.OUTLINE, feedback: '_outlineFeedback', output: 'outline', open: { outlineApproved: false } },
      article: { node: evaluateArticle, route: 'routeArticleEvaluation', increment: 'incrementArticleRevision', counter: 'articleRevisionCount', cap: REVISION_CAPS.ARTICLE, feedback: '_articleFeedback', output: 'contentBundle', open: { articleApproved: false } }
    };
    const atStop = (phase) => stateFor('journalist', { ...STOPS[phase].open, [STOPS[phase].counter]: STOPS[phase].cap, evaluationHistory: [escalated(phase)] });
    const VERDICT = { ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [] };

    it.each(Object.keys(STOPS))('a replay at the escalated %s stop makes no model call and routes to the stop', async (phase) => {
      const { node, route } = STOPS[phase];
      const state = atStop(phase);
      const sdk = jest.fn();
      const update = await node(clone(state), { configurable: { sdkClient: sdk } });
      expect(sdk).not.toHaveBeenCalled();
      expect(update.evaluationHistory).toBeUndefined();
      expect(graph[route](apply(state, update))).toBe('checkpoint');
    });

    it.each(Object.keys(STOPS))('the director\'s send back at the escalated %s stop: the rework is evaluated', async (phase) => {
      const { node, increment, feedback, output } = STOPS[phase];
      const state = atStop(phase);
      // The send back's increment appends the not-ready stub; the rework writes the output.
      const stubbed = apply(state, await graph[increment]({ ...state, [feedback]: 'Lead with the vote.' }));
      const reworked = { ...stubbed, [output]: clone(state[output]), [feedback]: null };
      const sdk = jest.fn().mockResolvedValue(clone(VERDICT));
      await node(reworked, { configurable: { sdkClient: sdk } });
      expect(sdk).toHaveBeenCalledTimes(1);
    });

    it.each(['outline', 'article'])('a rollback to %s after the escalation appends the stub, so the regenerated output is evaluated', async (phase) => {
      const { node, output, open } = STOPS[phase];
      const state = atStop(phase);
      const rolled = apply(state, buildRollbackState(phase));
      const regenerated = { ...rolled, ...open, [output]: clone(state[output]) };
      const sdk = jest.fn().mockResolvedValue(clone(VERDICT));
      await node(regenerated, { configurable: { sdkClient: sdk } });
      expect(sdk).toHaveBeenCalledTimes(1);
    });
  });

  // The ruling of 2026-10-02: T13's every-photo check is the article's. The outline has
  // one photo slot per arc and one in FOLLOW THE MONEY (092026: nine photos, six slots),
  // so the article writer gets the outline writer's whole set through
  // articleWriterInputs, and the judge's PHOTOS is built from the same input.
  describe('every photo reaches the page (T13)', () => {
    /** The fixture with a kept photo no arc package lists, and a stored hero. */
    const withKeptPhoto = () => {
      const state = stateFor('journalist', { heroImage: 'hero.jpg' });
      state.sessionPhotos = [...state.sessionPhotos, 'photos/p9.jpg'];
      return state;
    };
    const ENTRIES = (state) => [
      `1. [hero image] ${renderPhotoEntry({ filename: 'hero.jpg', names: ['Alex', 'Morgan', 'Sarah'] }, state.photoDescriptions, '   ')}`,
      `2. ${renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, state.photoDescriptions, '   ')}`,
      `3. ${renderPhotoEntry({ filename: 'p9.jpg', names: [] }, state.photoDescriptions, '   ')}`
    ];
    /** The writer's answer: the fixture bundle with a third inline card, so the node logs no card-count warning. */
    const answer = () => {
      const bundle = clone(PREVIOUS_BUNDLE);
      bundle.sections[0].content.push({ type: 'evidence-card', tokenId: 'mor001', headline: 'The envelope', content: 'Morgan hands Riley an envelope by the bar.', owner: 'Morgan Reed', significance: 'supporting' });
      return bundle;
    };
    const recordingSdk = () => jest.fn(async () => answer());
    const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

    it('articleWriterInputs passes the hero, then every photo the outline writer could place', () => {
      const state = withKeptPhoto();
      const inputs = articleWriterInputs(state);
      const { photos } = inputs[inputs.length - 1];
      expect(photos[0]).toEqual({ filename: 'hero.jpg', identifiedCharacters: ['Alex', 'Morgan', 'Sarah'], hero: true });
      expect(photos.slice(1)).toEqual(buildAvailablePhotos(state, 'hero.jpg', 'whiteboard.jpg'));
      expect(photos.map((p) => p.filename)).toEqual(['hero.jpg', 'p2.jpg', 'p9.jpg']);
    });

    it('the article writer and its reworker list every photo once, under PHOTOS, and the packages point at theirs by filename', async () => {
      const state = withKeptPhoto();
      state.arcEvidencePackages[1].photos = [{ filename: 'whiteboard.jpg', characters: ['Riley'] }];
      const writer = recordingSdk();
      await generateContentBundle({ ...state, contentBundle: null }, cfg(writer));
      const rework = recordingSdk();
      await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(rework));
      for (const prompt of [writer.mock.calls[0][0].prompt, rework.mock.calls[0][0].prompt]) {
        const photos = prompt.slice(prompt.indexOf('\nPHOTOS ('), prompt.indexOf('<RECORD>'));
        expect(photos).toContain(`\n\n${ENTRIES(state).join('\n\n')}`);
        expect(count(prompt, 'p2.jpg: Alex')).toBe(1);
        expect(prompt).toContain('ARC PHOTOS:\n- p2.jpg\n');
        // The whiteboard photo a package names is neither listed nor pointed at.
        expect(prompt).not.toContain('whiteboard.jpg');
      }
    });

    it('the article judge\'s PHOTOS are the same entries, built from the article writer\'s inputs', () => {
      const state = withKeptPhoto();
      const prompt = userFor('article', state);
      const section = prompt.slice(prompt.indexOf('\nPHOTOS ('), prompt.indexOf('CONTENT BUNDLE:'));
      expect(section).toContain('PHOTOS (the 3 photos the article writer was given');
      expect(section).toContain(`\n\n${ENTRIES(state).join('\n\n')}`);
    });

    it('with no stored hero, the writer and the judge list every kept photo and mark none as the hero', () => {
      const state = withKeptPhoto();
      delete state.heroImage;
      const inputs = articleWriterInputs(state);
      expect(inputs[inputs.length - 1].photos.map((p) => p.filename)).toEqual(['hero.jpg', 'p2.jpg', 'p9.jpg']);
      expect(userFor('article', state)).not.toContain('[hero image]');
    });

    // T13: "an excluded photo never does" appear. The director excludes a photo at the
    // character-IDs stop, and finalizePhotoAnalyses (photo-nodes.js) marks its analysis
    // `excluded: true` with no names. buildAvailablePhotos did not read the mark, so the
    // article's set listed the photo under a header that calls it kept, and photosTruth
    // then asked for it in print (3.9 fix round 1). Since the 4b fix batch it reads the
    // one rule, isPhotoExcluded: the director's decision first, and the mark for a photo
    // no mapping names, as here.
    const markExcluded = (state, filename) => {
      state.photoAnalyses.analyses = [
        ...state.photoAnalyses.analyses.filter((a) => a.filename !== filename),
        { filename, excluded: true, identifiedCharacters: [], characterDescriptions: [{ description: 'a player mid-sentence' }] }
      ];
      return state;
    };
    /** The writer's and the reworker's user prompts, and the article judge's, for one state. */
    const articlePrompts = async (state) => {
      const writer = recordingSdk();
      await generateContentBundle({ ...state, contentBundle: null }, cfg(writer));
      const rework = recordingSdk();
      await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(rework));
      return { writer: writer.mock.calls[0][0].prompt, rework: rework.mock.calls[0][0].prompt, judge: userFor('article', state) };
    };

    it('a photo the director excluded reaches neither the writer, its reworker nor the judge', async () => {
      const state = markExcluded(withKeptPhoto(), 'p3-excluded.jpg');
      state.sessionPhotos = [...state.sessionPhotos, 'photos/p3-excluded.jpg'];
      state.photoDescriptions = { ...state.photoDescriptions, 'p3-excluded.jpg': 'Morgan mid-sentence, eyes half shut.' };
      const inputs = articleWriterInputs(state);
      expect(inputs[2]).toBe('hero.jpg');
      expect(inputs[inputs.length - 1].photos.map((p) => p.filename)).toEqual(['hero.jpg', 'p2.jpg', 'p9.jpg']);
      const prompts = await articlePrompts(state);
      expect(prompts.judge).toContain('PHOTOS (the 3 photos the article writer was given');
      for (const prompt of Object.values(prompts)) {
        expect(prompt).toContain(`\n\n${ENTRIES(state).join('\n\n')}`);
        expect(prompt).not.toContain('p3-excluded.jpg');
        expect(prompt).not.toContain('Morgan mid-sentence, eyes half shut.');
      }
    });

    it('a stored hero the director excluded is no hero: the writer is told none was chosen, and nothing lists it', async () => {
      const state = markExcluded(withKeptPhoto(), 'hero.jpg');
      const inputs = articleWriterInputs(state);
      expect(inputs[2]).toBeNull();
      expect(inputs[inputs.length - 1].photos.map((p) => p.filename)).toEqual(['p2.jpg', 'p9.jpg']);
      const prompts = await articlePrompts(state);
      expect(prompts.writer).toContain('HERO IMAGE: none chosen: use the first photo the outline places');
      expect(prompts.rework).toContain('HERO IMAGE: none chosen: use the first photo the outline places');
      expect(prompts.judge).toContain('PHOTOS (the 2 photos the article writer was given: every photo the director has not excluded');
      for (const prompt of Object.values(prompts)) {
        expect(prompt).not.toContain('hero.jpg');
        expect(prompt).not.toContain('[hero image]');
      }
      // The detective is parked (spec D13): its writer keeps the hero it was given.
      const detective = markExcluded(stateFor('detective', { heroImage: 'hero.jpg' }), 'hero.jpg');
      expect(articleWriterInputs(detective)[2]).toBe('hero.jpg');
    });
  });
});
