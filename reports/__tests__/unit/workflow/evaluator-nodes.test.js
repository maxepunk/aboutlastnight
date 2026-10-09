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

const evaluatorNodes = require('../../../lib/workflow/nodes/evaluator-nodes');
const {
  evaluateArcs,
  evaluateArticle,
  createEvaluator,
  createMockEvaluator,
  _testing: {
    getArcCriteria,
    getPhaseCriteria,
    getArticleCriteria,
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

/**
 * Phase 4 (brief 4.4): the arc stage's fact check judges the weave, scores the truth
 * criteria alone, marks the weave it judged and never escalates; its one fix per round is
 * counted on the mark. Its weighted criteria, its NPC and roster lists, its craft files
 * and the arc stage's detective judge went. The weave is pitched as angles (phase 4b, piece 3).
 */
const WEAVE = require('../../mocks/llm-client.mock').getDefaultWeave();
const weaveState = (extra = {}) => ({ weave: JSON.parse(JSON.stringify(WEAVE)), ...extra });

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

    // Phase 4 (brief 4.6; spec 5.4): no model judge reads the map.
    it('exports no evaluateOutline: the outline judge left the graph', () => {
      expect(evaluatorNodes.evaluateOutline).toBeUndefined();
      expect(evaluatorNodes._testing.getOutlineCriteria).toBeUndefined();
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
      expect(typeof getArcCriteria).toBe('function');
      expect(typeof getSdkClient).toBe('function');
      expect(typeof buildEvaluationSystemPrompt).toBe('function');
      expect(typeof buildEvaluationUserPrompt).toBe('function');
      expect(typeof safeParseJson).toBe('function');
    });
  });

  describe('QUALITY_CRITERIA', () => {
    // Phase 4 (brief 4.4): the arc stage's fact check scores the truth criteria alone.
    it('defines criteria for arcs phase', () => {
      const arcCriteria = getArcCriteria();
      expect(Object.keys(arcCriteria).length).toBeGreaterThan(0);
      Object.values(arcCriteria).forEach((criterion) => {
        expect(criterion.truth).toBe(true);
        expect(criterion.type).toBe('structural');
        expect(criterion.weight).toBeUndefined();
      });
      ['rosterCoverage', 'evidenceIdValidity', 'accusationArcPresent', 'coherence', 'evidenceConfidenceBalance']
        .forEach((retired) => expect(arcCriteria[retired]).toBeUndefined());
    });

    // Phase 4 (brief 4.6): the outline judge's criteria went with it, for both themes.
    it('defines no outline criteria', () => {
      for (const theme of ['journalist', 'detective']) {
        expect(() => getPhaseCriteria('outline', theme)).toThrow('No quality criteria defined for phase: outline');
      }
    });

    // Brief 4.7a (spec 6.2): the article judge scores the truth criteria alone; its
    // weighted criteria, and the detective's (R1), went.
    it('defines criteria for article phase via getArticleCriteria', () => {
      const articleCriteria = getArticleCriteria();
      expect(Object.keys(articleCriteria).length).toBeGreaterThan(0);
      Object.values(articleCriteria).forEach((criterion) => {
        expect(criterion.truth).toBe(true);
        expect(criterion.type).toBe('structural');
        expect(criterion.weight).toBeUndefined();
      });
      ['voiceConsistency', 'antiPatterns', 'reporterMode', 'arcThreading', 'visualDistribution', 'evidenceIntegration', 'characterPlacement', 'emotionalResonance']
        .forEach((retired) => expect(articleCriteria[retired]).toBeUndefined());
    });

    // Phase 3 (3.4): a truth criterion carries rules and no weight; it decides readiness.
    // Since phase 4 (briefs 4.4 and 4.7a) each judge's criteria are truth criteria alone.
    it('all criteria have a description and the rules they score, and none a weight', () => {
      const allCriteria = { arcs: getArcCriteria(), article: getArticleCriteria() };
      Object.entries(allCriteria).forEach(([phase, criteria]) => {
        Object.entries(criteria).forEach(([name, criterion]) => {
          expect([phase, name, typeof criterion.description, criterion.rules.length > 0, criterion.weight])
            .toEqual([phase, name, 'string', true, undefined]);
        });
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
      // Phase 4 (brief 4.4): the arc stage's judge is the weave's fact check.
      const prompt = buildEvaluationSystemPrompt('arcs', getArcCriteria());
      expect(prompt).toContain('WEAVE fact check');
    });

    // Phase 4 (briefs 4.4 and 4.7a): each judge lists its truth criteria, and nothing weighted.
    it('includes all criteria', () => {
      const article = buildEvaluationSystemPrompt('article', getArticleCriteria());
      Object.keys(getArticleCriteria()).forEach((key) => expect(article).toContain(`- ${key} (`));
      expect(article).not.toContain('voiceConsistency');
      expect(article).not.toContain('evidenceIntegration');
      const factCheck = buildEvaluationSystemPrompt('arcs', getArcCriteria());
      Object.keys(getArcCriteria()).forEach((key) => expect(factCheck).toContain(`- ${key} (`));
      expect(factCheck).not.toContain('rosterCoverage');
      expect(factCheck).not.toContain('evidenceIdValidity');
    });

    // Brief 4.7a: the article judge reads the truth-only rules (TRUTH_ONLY_EVALUATION_RULES).
    it('includes evaluation rules', () => {
      const prompt = buildEvaluationSystemPrompt('article', getArticleCriteria());

      expect(prompt).toContain('EVALUATION RULES:');
      expect(prompt).toContain('when every truth criterion scores 0.8 or more');
      expect(prompt).toContain('READY');
    });

    it('includes output format', () => {
      const prompt = buildEvaluationSystemPrompt('article', getArticleCriteria());

      expect(prompt).toContain('OUTPUT FORMAT');
      expect(prompt).toContain('ready');
      expect(prompt).toContain('overallScore');
      expect(prompt).toContain('criteriaScores');
    });

    // Brief 4.7a: the article judge's old frame (its identity line naming the game, its
    // "Human always makes final decision" close) and the detective's article judge (R1)
    // went; lib/__tests__/article-judge.test.js pins the identity line that replaced them.
  });

  describe('buildEvaluationUserPrompt', () => {
    describe('arcs phase', () => {
      // Phase 4 (brief 4.4): the fact check reads the weave.
      it('includes narrative arcs', () => {
        const state = weaveState();
        const prompt = buildEvaluationUserPrompt('arcs', state);

        expect(prompt).toContain('WEAVE:\n');
        // Piece 3 (brief 3B): it judges every angle.
        WEAVE.angles.forEach((angle) => expect(prompt).toContain(angle.story));
        // Phase 4b (brief 1B): each thread with its name, its line and its evidence underneath.
        expect(prompt).toContain(WEAVE.threads[0].line);
        expect(prompt).toContain(WEAVE.threads[0].evidence[0].shows);
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
        // its own. Phase 4 (brief 4.4): the code checks hold the receipts to the
        // record's ids, so the fact check prints no id list; since phase 4b (brief 1B), the
        // evidence's sources.
        expect(prompt).toContain('<RECORD>');
        expect(prompt).not.toContain('EXPOSED EVIDENCE DETAILS');
        expect(prompt).toContain('<morning-timeline>');
        expect(prompt).not.toContain('BURIED TRANSACTIONS');
        expect(prompt).not.toContain('ALL VALID EVIDENCE IDS');
      });
    });

    // Phase 4 (brief 4.6): no judge reads the outline.
    it('has no outline phase', () => {
      expect(() => buildEvaluationUserPrompt('outline', { outline: { sections: [{ title: 'Intro' }] } }))
        .toThrow('Unknown evaluation phase: outline');
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

    it('has no field for the outline: no judge reworks it (brief 4.6)', () => {
      expect(() => getRevisionCountField('outline')).toThrow('Unknown phase: outline');
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
      // Phase 4 (brief 4.4; R6): one check rework per round.
      expect(getRevisionCap('arcs')).toBe(1);
    });

    // Phase 4 (brief 4.6; R6): the outline's budget is the map check's one rework; no
    // judge spends it.
    it('REVISION_CAPS.OUTLINE is one: the map check\'s one rework', () => {
      expect(REVISION_CAPS.OUTLINE).toBe(1);
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

    it('has no outline evaluation phase (brief 4.6)', () => {
      expect(() => getPhaseConstant('outline')).toThrow('Unknown phase: outline');
      expect(PHASES).not.toHaveProperty('OUTLINE_EVALUATION');
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

      evaluator(weaveState(), config);

      expect(mockClient).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'sonnet' })
      );
    });
  });

  describe('evaluateArcs', () => {
    const createMockState = () => weaveState({
      sessionId: 'test',
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
      // Phase 4 (brief 4.4): the fact check marks the weave it judged.
      expect(result.weave._factCheck).toEqual(expect.objectContaining({ ready: true, fixes: 0 }));
    });

    // Brief 4.5 (ruling 8): a truth-only verdict holds the weave on a breach it lists, never
    // on its own ready flag, so each not-ready verdict here lists its breach.
    it('returns revision needed when score < 0.7', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        criteriaScores: {},
        issues: ['Issue 1'],
        structuralIssues: ['T3: "Issue 1" states what a buried memory held.'],
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

    // Phase 4 (brief 4.4; R6): the fact check never escalates. A breach is marked on the
    // weave for its one fix, whatever the check reworks' count, and the stop opens after it.
    it('marks a breach on the weave for its one fix, with no escalation at the cap', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Still has issues'],
        structuralIssues: ['T3: "Still has issues" states what a buried memory held.'],
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
      expect(result.evaluationHistory.escalatedToHuman).toBeUndefined();
      expect(result.weave._factCheck).toEqual(expect.objectContaining({ ready: false, fixes: 0 }));
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

    // Brief 4.7a (ruling 1): a truth-only verdict holds the article on a breach it lists,
    // never on its own ready flag, so each not-ready verdict here lists its breach.
    it('returns revision needed when not ready (count increment in graph.js)', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.55,
        issues: ['Voice inconsistent'],
        structuralIssues: ['T12: "Test Headline" quotes no document. Quote the record.'],
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
        structuralIssues: ['T14: "Test Headline" names the game\'s machinery. Use the fiction\'s words.'],
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
      const mock = createMockEvaluator('arcs', { ready: false, structuralIssues: ['T3: Issue 1'] });
      const result = await mock({ arcRevisionCount: 0 }, {});

      // Mock evaluator no longer sets awaitingApproval - checkpoint handles it
      expect(result.arcRevisionCount).toBe(1);
      expect(result.validationResults.passed).toBe(false);
    });

    // Brief 4.7d: the stand-in writes its breaches where the truth-only contract keeps them,
    // as createEvaluator does; the contract holds no `issues` array.
    it('reports its breaches under structuralIssues, in the history entry and in validationResults', async () => {
      const mock = createMockEvaluator('article', { ready: false, structuralIssues: ['T3: Issue 1'] });
      const result = await mock({ articleRevisionCount: 0 }, {});

      expect(result.evaluationHistory.structuralIssues).toEqual(['T3: Issue 1']);
      expect(result.validationResults.structuralIssues).toEqual(['T3: Issue 1']);
      expect(result.evaluationHistory).not.toHaveProperty('issues');
      expect(result.validationResults).not.toHaveProperty('issues');
    });

    it('can simulate failure', async () => {
      const mock = createMockEvaluator('article', {
        shouldFail: true,
        errorMessage: 'Mock error'
      });
      const result = await mock({ articleRevisionCount: 0 }, {});

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
      const mock = createMockEvaluator('article');
      const result = await mock({}, {});

      expect(result.currentPhase).toBe(PHASES.ARTICLE_EVALUATION);
    });

    it('tracks revision number in history', async () => {
      const mock = createMockEvaluator('arcs', { ready: false });
      const result = await mock({ arcRevisionCount: 2 }, {});

      expect(result.evaluationHistory.revisionNumber).toBe(2);
    });
  });

  describe('revision cap behavior', () => {
    // Phase 4 (brief 4.4; R6): one fact-check fix per round, counted on the weave's mark
    // (graph.js routeArcEvaluation), never on the check reworks' count.
    it('arcs: the fact check marks its one fix on the weave, at any count', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        structuralIssues: ['T3: "Issue" states what a buried memory held.'],
        confidence: 'low'
      });
      const config = { configurable: { sdkClient: mockClient } };

      for (const arcRevisionCount of [0, REVISION_CAPS.ARCS]) {
        const result = await evaluateArcs(weaveState({ arcRevisionCount }), config);
        expect(result.arcRevisionCount).toBeUndefined(); // Increment moved to graph.js
        expect(result.awaitingApproval).toBeUndefined();
        expect(result.validationResults.passed).toBe(false);
        expect(result.evaluationHistory.escalatedToHuman).toBeUndefined();
        expect(result.weave._factCheck).toEqual(expect.objectContaining({ ready: false, fixes: 0 }));
      }
    });

    // Brief 4.7a: the truth-only article judge holds the article on the breach it lists.
    it('article allows 2 automated passes per round, then hands over', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        structuralIssues: ['T3: "Issue" states what a buried memory held.'],
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
      const result = await evaluateArcs(weaveState(), config);
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

      const result = await evaluateArcs(weaveState(), config);

      expect(result.evaluationHistory.confidence).toBe('high');
    });

    it('defaults confidence to medium', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.8
        // No confidence field
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

      expect(result.evaluationHistory.confidence).toBe('medium');
    });

    // Brief 4.7c: an `issues` array lies outside the judge's contract, so the history entry
    // never carries the array. Task 4.12c: nor the `issues` alias that repeated its structural
    // issues for the e2e harness, which reads `structuralIssues` since task 4.12a.
    it('lists the structural issues under structuralIssues alone, never an issues key', async () => {
      const breach = 'T3: "Morgan sold the BizAI memory" in thread t2 states what a buried memory held. Report the sale.';
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.6,
        structuralIssues: [breach],
        issues: ['Issue 1', 'Issue 2']
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

      expect(result.evaluationHistory.structuralIssues).toEqual([breach]);
      expect(result.evaluationHistory).not.toHaveProperty('issues');
      expect(result.validationResults).not.toHaveProperty('issues');
    });

    it('defaults the structural issues to an empty list, with no issues key', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9
        // No issues field
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

      expect(result.evaluationHistory.structuralIssues).toEqual([]);
      expect(result.evaluationHistory).not.toHaveProperty('issues');
    });
  });

  describe('validationResults for revision — PROMPT-REVIEW B4 / shared channel', () => {
    it('stamps the phase so a different phase reviser cannot consume it', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.5,
        structuralIssues: ['Missing roster members: Quinn']
      });
      const result = await evaluateArcs(weaveState(), { configurable: { sdkClient: mockClient } });
      expect(result.validationResults.phase).toBe('arcs');
    });

    // Phase 4 (brief 4.4, fix round 1): the weave's fact check keeps no note on the
    // writing (lib/__tests__/weave-stage.test.js, "the truth-only contract"). Brief 4.7a:
    // nor does the article judge; it forwards its structural issues, and a note on the
    // writing reaches no reviser (brief 4.6: the outline judge, which this test used, left
    // the graph).
    it('forwards structuralIssues to the reviser, and no note on the writing', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.5,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['coherence is thin'],
        confidence: 'high'
      });
      const result = await evaluateArticle({ contentBundle: {} }, { configurable: { sdkClient: mockClient } });
      // These were computed, logged, stored in evaluationHistory — and then dropped
      // on the floor instead of being handed to the revision node.
      expect(result.validationResults.structuralIssues).toEqual(['Missing roster members: Quinn']);
      expect(result.validationResults.advisoryWarnings).toEqual([]);
      expect(result.validationResults.confidence).toBe('high');
    });

    // Phase 4 (brief 4.4): the arc stage no longer escalates; the article judge does
    // (brief 4.6: the outline judge left the graph). Brief 4.7a: its escalation lists its
    // breaches and its concerns about the director's edits, and no note on the writing.
    it('escalates at the cap with the structural findings, not `issues`, and no note on the writing', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.4,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['thin coherence']
      });
      const result = await evaluateArticle(
        { contentBundle: {}, articleRevisionCount: REVISION_CAPS.ARTICLE },
        { configurable: { sdkClient: mockClient } }
      );
      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
      // `evaluation.issues` is absent in the structural/advisory schema, so the old
      // formatIssuesForMessage(evaluation.issues) produced "unspecified issues".
      expect(result.evaluationHistory.escalationReason).toContain('Missing roster members: Quinn');
      expect(result.evaluationHistory.escalationReason).not.toContain('thin coherence');
      expect(result.evaluationHistory.escalationReason).not.toContain('unspecified issues');
    });
  });

  describe('validationResults for revision', () => {
    it('includes passed=false when not ready', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        issues: ['Issue'],
        structuralIssues: ['T3: "Issue" states what a buried memory held.']
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

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

      const result = await evaluateArcs(weaveState(), config);

      expect(result.validationResults.feedback).toBe('Fix the coherence issues by...');
    });

    // Phase 4 (brief 4.4, fix round 1): the weave's fact check keeps the criteria it was
    // given, its truth criteria.
    it('includes criteria scores when available', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false,
        overallScore: 0.5,
        criteriaScores: {
          evidenceTruth: { score: 0.3, notes: 'Poor' }
        },
        issues: []
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

      expect(result.validationResults.criteriaScores.evidenceTruth.score).toBe(0.3);
    });

    // Brief 1.3: a passing evaluation used to write nothing, so the previous
    // failure stayed in the shared channel and the next rework prompt described an
    // evaluation state an hour out of date. Phase 4 (brief 4.7a): on the article judge,
    // which scores the truth criteria alone, as the weave's fact check does
    // (lib/__tests__/weave-stage.test.js, "the truth-only contract"): a note on the writing
    // reaches no rework.
    it('records the pass instead of leaving the previous failure in the channel', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: true,
        overallScore: 0.9,
        issues: [],
        advisoryWarnings: ['the second arc leans on one document'],
        criteriaScores: { evidenceTruth: { score: 0.9 } },
        confidence: 'high'
      });
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArticle({ contentBundle: {} }, config);

      expect(result.validationResults).toEqual(expect.objectContaining({
        phase: 'article',
        passed: true,
        structuralIssues: [],
        advisoryWarnings: [],
        confidence: 'high'
      }));
      expect(result.validationResults.criteriaScores.evidenceTruth.score).toBe(0.9);
    });

    it('records the escalation at the cap so the reworks that follow read the current state', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        ready: false, structuralPassed: false, overallScore: 0.4,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: ['thin coherence'],
        revisionGuidance: 'Cover Quinn.'
      });
      const config = { configurable: { sdkClient: mockClient } };

      // Phase 4 (brief 4.4): the arc stage no longer escalates; the article judge does.
      const result = await evaluateArticle(
        { contentBundle: {}, articleRevisionCount: REVISION_CAPS.ARTICLE },
        config
      );

      expect(result.evaluationHistory.escalatedToHuman).toBe(true);
      // Brief 4.7a: the truth-only judge's note on the writing stays out.
      expect(result.validationResults).toEqual(expect.objectContaining({
        phase: 'article',
        passed: false,
        structuralIssues: ['Missing roster members: Quinn'],
        advisoryWarnings: []
      }));
      expect(result.validationResults.revisionGuidance).toBe('Cover Quinn.');
    });
  });

  describe('error handling', () => {
    it('adds error to errors array', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Network error'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('arcs-evaluation-failed');
      expect(result.errors[0].message).toBe('Network error');
      expect(result.errors[0].timestamp).toBeDefined();
    });

    it('includes error in evaluation history', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Parse error'));
      const config = { configurable: { sdkClient: mockClient } };

      const result = await evaluateArcs(weaveState(), config);

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

      const result = await evaluateArcs(weaveState({ arcRevisionCount: 1 }), config);

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
      evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: SOURCE }], paperEvidence: [] } },
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

  // Phase 4 (brief 4.6): the outline phase it also covered left with the outline judge.
  it('does not fact-check the arcs phase', async () => {
    const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
    const result = await evaluateArcs(weaveState(), { configurable: { sdkClient: mockClient } });
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
  // room event through "attribution to the people in the room" is gone. Brief 4.7a: the
  // weighted reporterMode criterion went; T8 (novaPositionTruth) and T7 (stagesTruth) score
  // the article against the mode block, which says it, and the fact check counts a repeated
  // absence.
  it('the remote judge reads the remote mode block, and its user prompt names the mode once', () => {
    // Brief 4.13 (R14): the journalist's mode file, from the folder its config names.
    const loadModeBlock = (mode) => require('../../../lib/rule-set').loadModeBlock(mode, { theme: 'journalist' });
    const state = { contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'remote' } };
    const prompt = buildEvaluationUserPrompt('article', state);
    expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: remote (the mode block in your instructions says what Nova could witness; stagesTruth and novaPositionTruth score the article against it)');
    expect(prompt).not.toContain('reached them as tips');
    const system = buildEvaluationSystemPrompt('article', getArticleCriteria('journalist'), 'journalist', { sessionConfig: state.sessionConfig });
    expect(system).toContain(loadModeBlock('remote'));
  });

  it('the on-site judge reads the on-site mode block, which carries no absence limit', () => {
    const loadModeBlock = (mode) => require('../../../lib/rule-set').loadModeBlock(mode, { theme: 'journalist' });
    const prompt = buildEvaluationUserPrompt('article', {
      contentBundle: {}, outline: {}, sessionConfig: { reportingMode: 'on-site' }
    });
    expect(prompt).not.toContain('at most once');
    expect(prompt).toContain('REPORTING MODE FOR THIS SESSION: on-site');
    const system = buildEvaluationSystemPrompt('article', getArticleCriteria('journalist'), 'journalist', { sessionConfig: { reportingMode: 'on-site' } });
    expect(system).toContain(loadModeBlock('on-site'));
    expect(loadModeBlock('on-site')).not.toContain('at most once');
  });

  // Brief 4.7a (R1): the detective's article judge, with its own mode rule, went.
});

describe('evaluateArticle — the card check reads what the page prints (slice 2.5)', () => {
  const SOURCE = 'You are standing by the bar when Vic leans in and hands you the number twice over.';

  function stateFor(theme, contentBundle) {
    return {
      theme,
      contentBundle,
      evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: SOURCE }], paperEvidence: [] } },
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
  const { renderSessionFactsVerdict, renderArcAccusation } = require('../../../lib/prompt-renderers/director-words-renderer');
  const { renderDirectorEnrichmentBlock } = require('../../../lib/prompt-renderers/director-notes-renderer');
  const { createPromptBuilder } = require('../../../lib/prompt-builder');
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
    // Phase 4 (brief 4.6): the outline judge left the graph.
    const PROMPTS = [
      ['arc', (state) => buildEvaluationUserPrompt('arcs', state)],
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

    it('reads the accusation as the arc writer renders it, with the director\'s account after the parse', () => {
      const state = realisticState();
      const prompt = buildEvaluationUserPrompt('arcs', state);
      const writerAccusation = renderArcAccusation(state.playerFocus.accusation, ACCUSATION_RAW, "Players' Reasoning");

      expect(prompt).toContain(`THE ACCUSATION (the parsed verdict, then the director's account word for word):\n${writerAccusation}`);
      expect(prompt).toContain('**Charge:** accidental overdose');
      expect(prompt).toContain('**Players\' Reasoning:** Ashe proposed an accidental overdose; six votes ended the deadlock.');
      expect(prompt.indexOf('<DIRECTOR_ACCUSATION>')).toBeGreaterThan(prompt.indexOf('**Accused:**'));
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
      // The judge is told which characters were this session's players (playersTruth
      // reads them; brief 4.7a).
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
      expect(prompt.trim().endsWith('Is the article free of truth-rule breaches?')).toBe(true);
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
        evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: SOURCE }], paperEvidence: [] } },
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
      // Phase 4: each judge scores the truth criteria alone, the arc stage's fact check
      // (brief 4.4) and the article judge (brief 4.7a).
      expect(split(withoutTruth(getArcCriteria()))).toEqual({ structural: [], advisory: [] });
      expect(split(withoutTruth(getArticleCriteria()))).toEqual({ structural: [], advisory: [] });
    });

    it('the fact check still runs first and short-circuits the judge under the automated budget', async () => {
      const mockClient = jest.fn();
      const result = await evaluateArticle(
        {
          theme: 'journalist',
          contentBundle: { sections: [{ id: 's', type: 'narrative', content: [{ type: 'evidence-card', tokenId: 'vic001', headline: 'h', content: 'Invented text that is in no document at all.' }] }] },
          evidenceBundle: { exposed: { tokens: [{ id: 'vic001', fullContent: 'The real memory text, which says something else entirely.' }], paperEvidence: [] } },
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
  // Brief 4.13 (R14): a call names the theme whose rules folder it reads; these read the journalist's.
  const ruleSet = require('../../../lib/rule-set');
  const loadRuleSet = (call) => ruleSet.loadRuleSet(call, { theme: 'journalist' });
  const loadModeBlock = (mode) => ruleSet.loadModeBlock(mode, { theme: 'journalist' });
  const { renderRecordView } = require('../../../lib/prompt-renderers/record-view');
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('../../../lib/__tests__/fixtures/rework-state');
  const { _testing: { getPhaseCriteria, TRUTH_ONLY_EVALUATION_RULES } } = require('../../../lib/workflow/nodes/evaluator-nodes');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const count = (text, part) => text.split(part).length - 1;
  // Phase 4 (brief 4.6): the outline judge left the graph.
  const JUDGE_CALLS = [['arcs', 'judge-arc'], ['article', 'judge-article']];
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
  const TRUTH_BY_PHASE = { arcs: ARC_TRUTH, article: Object.keys(TRUTH_GROUPS) };

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

    // Phase 4 (spec section 11): neither judge reads a craft file, the story meeting's fact
    // check (brief 4.4) nor the article judge (brief 4.7a), so neither writes a craft
    // finding. The article judge's craft files, its craft-findings section and their tests
    // went with its notes on the writing.
    it('neither judge reads a craft file, nor asks for a craft finding', () => {
      const craftTags = (phase) => [...userFor(phase, stateFor()).matchAll(/^<(craft-[a-z]+)>$/gm)].map((m) => m[1]);
      for (const [phase] of JUDGE_CALLS) {
        expect([phase, craftTags(phase)]).toEqual([phase, []]);
        expect(`${systemFor(phase, stateFor())}\n${userFor(phase, stateFor())}`).not.toMatch(/<craft-[a-z]+>/);
        expect(systemFor(phase, stateFor())).not.toContain('CRAFT FINDINGS');
      }
    });

    // Phase 4 (brief 4.6): on the weave's fact check, since the outline judge left.
    it('createEvaluator sends the judge the session\'s mode block', async () => {
      const mockClient = jest.fn().mockResolvedValue({ ready: true, structuralPassed: true, overallScore: 0.9 });
      await evaluateArcs(stateFor('journalist', { meetingApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
      expect(mockClient.mock.calls[0][0].systemPrompt).toContain(loadModeBlock('remote'));
    });
  });

  describe('the truth criteria (must-fix, R2)', () => {
    it.each(['arcs', 'article'])('the journalist %s judge scores its truth groups, each structural and naming its rules', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      const truthKeys = Object.keys(criteria).filter((k) => criteria[k].truth === true);
      expect(truthKeys).toEqual(TRUTH_BY_PHASE[phase]);
      for (const key of truthKeys) {
        expect(criteria[key].type).toBe('structural');
        expect(criteria[key].rules).toEqual(TRUTH_GROUPS[key]);
        for (const rule of TRUTH_GROUPS[key]) expect(criteria[key].description).toMatch(new RegExp(`\\b${rule}\\b`));
      }
    });

    it.each(['arcs', 'article'])('the %s system prompt lists each truth criterion with its rules, and asks for the sentence and the record', (phase) => {
      const prompt = systemFor(phase, stateFor());
      for (const key of TRUTH_BY_PHASE[phase]) {
        expect(prompt).toContain(`- ${key} (${TRUTH_GROUPS[key].join(', ')}; must pass):`);
      }
      expect(prompt).toContain('TRUTH RULES (MUST PASS');
      expect(prompt).toMatch(/opens with the rule ids/);
      expect(prompt).toMatch(/the record it contradicts/);
    });

    // Phase 4: each judge scores the truth criteria alone, and its overallScore comes from
    // them (TRUTH_ONLY_EVALUATION_RULES): the arc stage's fact check (brief 4.4) and the
    // article judge (brief 4.7a). The detective's article judge, which carried none, went
    // with its old stages (R1).
    it('carries no weight: the truth criteria are the whole evaluation', () => {
      for (const phase of ['arcs', 'article']) {
        Object.values(getPhaseCriteria(phase, 'journalist')).forEach((c) => {
          expect(c.truth).toBe(true);
          expect(c.weight).toBeUndefined();
        });
      }
    });
  });

  // Fix round 1: a truth criterion scored below 0.8 holds the output to not-ready, so a
  // clause the judge cannot check against its own prompt sends the draft back for a
  // rework that cannot fix it. Each criterion names the material it reads, and each
  // judge's prompts must print every one.
  describe('each truth criterion reads only what its judge\'s prompt holds', () => {
    const { _testing: { TRUTH_MATERIAL, judgedEdits } } = require('../../../lib/workflow/nodes/evaluator-nodes');
    const { renderPhotoEntry } = require('../../../lib/prompt-renderers/director-words-renderer');
    const { standingAfterSendBack } = require('../../../lib/hand-edit-diff');

    /**
     * The fixture, with a bundle that prints a hero image and a captioned photo beside its
     * cards, and (brief 4.5) a weave question the director answered at the story meeting.
     * Brief 4.7f: and a paragraph the director added at the desk, an edit verdictTruth reads.
     */
    const fullState = () => {
      const state = stateFor('journalist');
      state.weave.questions[0].answer = 'Sarah ran the bar all morning.';
      // Brief B (R2): a note the director sent at a stop, which both judges print.
      state.directorGateNotes = [{ gate: 'arc-selection', kind: 'rejection', round: 1, stopRound: 1, text: 'Keep the bartender in the story.' }];
      state.heroImage = 'hero.jpg';
      state.contentBundle.heroImage = { filename: 'hero.jpg', caption: 'The room before the vote.' };
      state.contentBundle.sections[0].content.push({ type: 'photo', filename: 'p2.jpg', caption: 'Alex points at a line in the ledger.' });
      const writers = clone(state.contentBundle);
      state.contentBundle.sections[0].content.push({ type: 'paragraph', text: 'The director added this paragraph at the desk.' });
      state._articleHandEdits = standingAfterSendBack(null, writers, state.contentBundle, 'bundle');
      return state;
    };
    const truthOf = (phase) => Object.entries(getPhaseCriteria(phase, 'journalist')).filter(([, c]) => c.truth);

    it.each(['arcs', 'article'])('every material a %s truth criterion reads is printed in that judge\'s prompts', (phase) => {
      const state = fullState();
      // The director's edits as createEvaluator sends them (judgedEdits).
      const prompts = `${systemFor(phase, state)}\n${buildEvaluationUserPrompt(phase, state, { factCheck: null, directorEdits: judgedEdits(phase, state) })}`;
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

    // Phase 4 (brief 4.6): the outline judge it also covered left the graph.
    it('only the article judge reads printed card text and captions: the weave holds neither', () => {
      for (const phase of ['arcs']) {
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

    it('the article judge holds the article to PHOTOS, the photos its writer was given', () => {
      const { photosTruth } = getPhaseCriteria('article', 'journalist');
      expect(photosTruth.description).toMatch(/every photo in PHOTOS/);
      expect(photosTruth.description).toMatch(/director's description/);
    });

    // Phase 3 (3.9, ruled): the article places every photo the director kept (T13), so
    // the article writer gets the outline writer's whole set, and the judge's PHOTOS is
    // that set. A kept photo no arc package listed (p9.jpg) used to reach neither; the
    // packages went in phase 4 (brief 4.6; R5).
    it('the article judge gets the article writer\'s photos: the hero, then every photo the director kept, once each, never the whiteboard', () => {
      const state = fullState();
      state.sessionPhotos = [...state.sessionPhotos, 'photos/p9.jpg'];
      const prompt = userFor('article', state);
      const start = prompt.indexOf('\nPHOTOS (');
      expect(start).toBeGreaterThan(prompt.indexOf('</RECORD>'));
      // Brief 4.7a: the settled weave follows PHOTOS, then the map, then the article.
      const section = prompt.slice(start, prompt.indexOf('<SETTLED_WEAVE>'));
      expect(section).toContain(`1. [hero image] ${renderPhotoEntry({ filename: 'hero.jpg', names: ['Alex', 'Morgan', 'Sarah'] }, state.photoDescriptions, '   ')}`);
      expect(section).toContain(`2. ${renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, state.photoDescriptions, '   ')}`);
      expect(section).toContain("The director's description, word for word: Alex leans over the ledger and points at a line.");
      expect(section).toContain(`3. ${renderPhotoEntry({ filename: 'p9.jpg', names: [] }, state.photoDescriptions, '   ')}`);
      expect(count(section, 'p2.jpg')).toBe(1);
      expect(section).not.toContain('whiteboard.jpg');
    });

    // Brief 4.7a (R1): the detective's article judge, which printed no PHOTOS, went.
  });

  describe('a truth breach goes back automatically', () => {
    const judgeWith = (verdict) => jest.fn().mockResolvedValue(verdict);

    // Phase 4 (brief 4.6): on the weave's fact check, since the outline judge left.
    it('a truth criterion the judge failed keeps the weave from ready, whatever structuralPassed says', async () => {
      const mockClient = judgeWith({
        ready: true, structuralPassed: true, overallScore: 0.9,
        criteriaScores: { evidenceTruth: { score: 0.3, notes: 'The lede names Morgan as the exposer of mor001.', fix: 'Keep the exposure anonymous.' } },
        structuralIssues: [], advisoryWarnings: []
      });
      const result = await evaluateArcs(stateFor('journalist', { meetingApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });

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
      const result = await evaluateArcs(stateFor('journalist', { meetingApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
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
        const result = await evaluateArcs(stateFor('journalist', { meetingApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
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
        await evaluateArcs(stateFor('journalist', { meetingApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
        expect(log.mock.calls.map((call) => call.join(' ')).filter((line) => line.includes('not scored'))).toEqual([]);
      } finally {
        log.mockRestore();
      }
    });
  });

  describe('the existing criteria keep their status', () => {
    const EXISTING = {
      // Phase 4: each judge scores the truth criteria alone, the arc stage's fact check
      // (brief 4.4) and the article judge (brief 4.7a).
      arcs: { structural: [], advisory: [] },
      article: { structural: [], advisory: [] }
    };

    it.each(['arcs', 'article'])('every journalist %s criterion keeps its type, and the truth criteria are the only additions', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      const existing = Object.keys(criteria).filter((k) => !criteria[k].truth);
      expect({
        structural: existing.filter((k) => criteria[k].type === 'structural'),
        advisory: existing.filter((k) => criteria[k].type === 'advisory')
      }).toEqual(EXISTING[phase]);
    });

    it.each(['arcs', 'article'])('every journalist %s criterion names the rule or craft item it scores', (phase) => {
      const criteria = getPhaseCriteria(phase, 'journalist');
      for (const [key, { description }] of Object.entries(criteria)) {
        expect([key, description]).toEqual([key, expect.stringMatching(/\b[TC]\d{1,2}\b|<world>/)]);
      }
    });
  });

  describe('the reworded criteria', () => {
    // Brief 4.7a (spec 6.2): the article judge's weighted criteria went (voiceConsistency,
    // antiPatterns, reporterMode, arcThreading and the advisory four), with the tests of
    // their wording. Their truth halves are the truth criteria's: T8 and the mode block
    // (novaPositionTruth), T14 (fictionTruth); the em-dash house rule is the fact check's
    // advisory.

    it('the journalist scoring rule says how the score is made (M30)', () => {
      for (const [phase] of JUDGE_CALLS) {
        const prompt = systemFor(phase, stateFor());
        expect(prompt).not.toContain('pass (1.0), partial (0.5), fail (0.0)');
        // Phase 4: each judge's score comes from its truth criteria (briefs 4.4 and 4.7a).
        expect([phase, prompt.includes(TRUTH_ONLY_EVALUATION_RULES), prompt.includes('weighted average')]).toEqual([phase, true, false]);
      }
      expect(TRUTH_ONLY_EVALUATION_RULES).toContain('overallScore is the lowest truth-criterion score.');
      expect(TRUTH_ONLY_EVALUATION_RULES).not.toMatch(/weighted|advisory/i);
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
    // Phase 4 (brief 4.4): the fact check prints it as the heading of the notes it reads.
    it('the arc judge\'s director-notes line prints the label arc-specialist-nodes.js exports', () => {
      const ARC_NODES = '../../../lib/workflow/nodes/arc-specialist-nodes';
      try {
        jest.isolateModules(() => {
          const actual = jest.requireActual(ARC_NODES);
          jest.doMock(ARC_NODES, () => ({ ...actual, ARC_NOTES_LABEL: 'SENTINEL NOTES LABEL' }));
          const isolated = require('../../../lib/workflow/nodes/evaluator-nodes')._testing;
          const prompt = isolated.buildEvaluationUserPrompt('arcs', stateFor(), { factCheck: null });
          expect(prompt).toContain('SENTINEL NOTES LABEL\n<DIRECTOR_NOTES>');
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
      expect(userFor('arcs', stateFor())).toContain(`${ARC_NOTES_LABEL}\n<DIRECTOR_NOTES>`);
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

    // Brief 4.7a (R1): the detective's article judge, which read the bundle whole, went.
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

  });

  // Phase 4 (brief 4.7a; R1): the detective's article judge, the last detective judge,
  // went with its old stages, and its pinned render (487c18ee..., 010dfb12... before the
  // fact check's roster line moved it) and its criteria's test with it: a detective session
  // gets the one article judge (lib/__tests__/article-judge.test.js).
  // Its arcs judge went in brief 4.4 and its outline judge in brief 4.6.
  // lib/workflow/nodes/__tests__/evaluator-token-scoping.test.js (F9) went too: it held
  // the token ban in the detective article judge's CRITICAL CHECKS block (R1) and in the
  // weighted antiPatterns criterion (spec 6.2). "Memory token" stays in-world through T14
  // and the fact check's productionWords check, which flags only a bare "token".
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
  const { _testing: { getPhaseCriteria, TRUTH_ONLY_EVALUATION_JSON_SCHEMA } } = require('../../../lib/workflow/nodes/evaluator-nodes');
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
    it.each(['article'])('the %s judge reads the writers\' FINANCIAL_SUMMARY, from the same builder and input, once, after the record', (phase) => {
      const state = stateFor();
      const prompt = userFor(phase, state);
      const block = getPromptBuilder(null, state)._buildFinancialSummary(state.shellAccounts).trim();
      expect(block.startsWith('<FINANCIAL_SUMMARY>')).toBe(true);
      expect(count(prompt, block)).toBe(1);
      expect(count(prompt, '<FINANCIAL_SUMMARY>')).toBe(1);
      expect(prompt.indexOf(block)).toBeGreaterThan(prompt.indexOf('</RECORD>'));
    });

    // Brief 4.7a (R1): the detective's article judge, which read no summary, went; a
    // detective session gets the one article judge.
    it('the arc judge, whose writer is given no summary, reads none', () => {
      expect(userFor('arcs', stateFor())).not.toContain('FINANCIAL_SUMMARY');
      expect(userFor('arcs', stateFor('detective'))).not.toContain('FINANCIAL_SUMMARY');
    });

    it('a session with no account above zero gives the judges no summary, as it gives the writers none', () => {
      const state = stateFor('journalist', { shellAccounts: [{ name: 'Melanie', total: 0, tokenCount: 0 }] });
      for (const phase of ['article']) expect(userFor(phase, state)).not.toContain('FINANCIAL_SUMMARY');
    });

    it('moneyTruth asks whether the money runs from the buyer, with NeurAI and its board Nova\'s suspicion', () => {
      for (const phase of ['arcs', 'article']) {
        const { description } = getPhaseCriteria(phase, 'journalist').moneyTruth;
        expect(description).toContain("run from the buyer to the seller's chosen account");
        expect(description).toContain("NeurAI and its board written as Nova's suspicion");
        expect(description).toContain('the morning\'s payments for erasure');
        expect(description).toMatch(/\bT5\b/);
        expect(description).not.toContain("run from NeurAI's board");
        expect(description).not.toContain('other wealth');
      }
    });

    it('moneyTruth reads the timeline and the notes at every judge, and FINANCIAL_SUMMARY where its writer had it', () => {
      // Brief 4.5 (T1): the weave's fact check reads the director's answers too.
      // Brief B (R1, R2): both judges read the notes the director sent at the stops.
      expect(getPhaseCriteria('arcs', 'journalist').moneyTruth.reads).toEqual(['timeline', 'notes', 'answers', 'stopNotes']);
      expect(getPhaseCriteria('arcs', 'journalist').moneyTruth.description).not.toContain('FINANCIAL_SUMMARY');
      // Brief 4.7a (T1, T5): the article judge reads the answers, and the settled weave,
      // which lists the questions left unanswered. Brief 4.7c: the director's words whole,
      // the input-review corrections and the accusation beside the notes and the answers.
      for (const phase of ['article']) {
        const { reads } = getPhaseCriteria(phase, 'journalist').moneyTruth;
        expect(reads).toEqual(['timeline', 'financialSummary', 'notes', 'corrections', 'verdict', 'answers', 'stopNotes', 'weave']);
      }
    });

    // Final review (judges-factcheck[0]): the outline and article judges now hold
    // FINANCIAL_SUMMARY, whose totals are each account's at the close of the morning,
    // while the director's notes record balances said or shown in the room earlier
    // (092026's read-out, 092626's "$4 million in the RW account"). The criterion names
    // each source by what it gives, so a judge never "corrects" a player's line to a
    // closing total (T1).
    // Brief 4.7a (T5 as rewritten): at the article, a figure raised as a question at the
    // story meeting follows the balance said in the room. Brief 4.7c: at the article, the
    // balance is the one the director's words record, each of the four sources named.
    it('moneyTruth names each source by what it gives: the ledger, the closing totals, and a balance said in the room', () => {
      const LEDGER = 'Each figure is as its source gives it: each sale, the first-burial bonus and each transfer as the ledger gives it;';
      const IN_THE_ROOM = "a balance the director's words (the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops) record as said or shown in the room as that moment's figure (T1);";
      for (const phase of ['article']) {
        const { description } = getPhaseCriteria(phase, 'journalist').moneyTruth;
        expect(description).toContain(LEDGER);
        expect(description).toContain('each total at the close of the morning as FINANCIAL_SUMMARY gives it;');
        expect(description).toContain(IN_THE_ROOM);
        expect(description).not.toContain('as the ledger or FINANCIAL_SUMMARY gives it');
      }
      // Brief 4.5 (T1): at the weave, a ledger line the director's answer explains, too.
      const arcs = getPhaseCriteria('arcs', 'journalist').moneyTruth.description;
      expect(arcs).toContain(`${LEDGER} a balance the director's notes record as said or shown in the room as that moment's figure; and a ledger line the director's answer at the story meeting explains as that answer gives it (T1).`);
    });
  });

  describe('the truth criteria follow the truth lines of round 7', () => {
    const truthOf = (phase, key) => getPhaseCriteria(phase, 'journalist')[key].description;

    it('evidenceTruth (T4): a person is tied to an account as fact only on the director\'s sight of the sale or an open sale, never by its name', () => {
      for (const phase of ['arcs', 'article']) {
        const description = truthOf(phase, 'evidenceTruth');
        expect(description).toContain('only where the director saw the sale or it was made openly in front of the room');
        expect(description).toContain('never a reason to suspect its namesake (T4)');
        expect(description).not.toContain('read as proof of who holds it');
      }
    });

    it('stagesTruth (T7): what NovaNews is still chasing is Nova\'s intent and needs no epilogue', () => {
      for (const phase of ['arcs', 'article']) {
        expect(truthOf(phase, 'stagesTruth')).toContain("What Nova says NovaNews is still chasing is Nova's own intent and needs no epilogue");
      }
    });

    it('novaPositionTruth (T8): Nova never votes, joins the room\'s accusation or exposes a memory', () => {
      for (const phase of ['arcs', 'article']) {
        const description = truthOf(phase, 'novaPositionTruth');
        expect(description).toContain("never votes, joins the room's accusation or exposes a memory");
        expect(description).not.toContain('accusations and exposures');
      }
    });

    // Brief 4.7a: the weighted reporterMode criterion went; T8 as the mode block states it
    // is novaPositionTruth's (above), and the article judge's mode line names the truth
    // criteria that read the mode block.
    it('the comment beside the article judge\'s mode line no longer says the room reaches Nova by attribution', () => {
      const source = require('fs').readFileSync(require.resolve('../../../lib/workflow/nodes/evaluator-nodes'), 'utf8');
      expect(source).not.toContain('the room\'s events by attribution)');
    });

    // Phase 4: the two criteria that restated a craft item, the arc judge's coherence
    // (brief 4.4) and the article judge's visualDistribution (brief 4.7a), went with their
    // judges' weighted criteria.
  });

  // Gate 2: the article judge still told every judge that three cards beat ten, against
  // C9's budget of three to five. Brief 4.7a: the detective's article judge, which kept
  // it, went (R1).
  it('the article judge has no card-count line', () => {
    const LINE = 'A tight article with 3 perfectly-placed evidence cards beats a bloated one with 10 forced cards.';
    expect(systemFor('article', stateFor())).not.toContain(LINE);
    // Brief 4.13 (R14; R1): the parked detective has no article judge to carry it.
    expect(() => systemFor('article', stateFor('detective'))).toThrow(/"detective" names no rules folder/);
  });

  describe('nothing holds a draft on an advisory (R22)', () => {
    // Phase 4: neither judge files a craft finding, the arc stage's fact check (brief 4.4)
    // nor the article judge (brief 4.7a); its craft-findings section went.

    // Brief 4.7a: the truth-only article judge leaves out an advisory that is no concern
    // about the director's edits, so nothing on it reaches the stop or holds the draft.
    it('a truth-labelled advisory holds nothing, and reaches neither the stop nor the rework', async () => {
      const advisory = 'T1: "Remi watched the money go" says more than the emails; the director may want it softened.';
      const mockClient = jest.fn().mockResolvedValue({
        ready: true, structuralPassed: true, overallScore: 0.9,
        criteriaScores: { evidenceTruth: { score: 0.9 } }, structuralIssues: [], advisoryWarnings: [advisory]
      });
      // Phase 4 (brief 4.6): on the article judge, since the outline judge left.
      const result = await evaluateArticle(stateFor('journalist', { articleApproved: false, evaluationHistory: [] }), { configurable: { sdkClient: mockClient } });
      expect(result.evaluationHistory.ready).toBe(true);
      expect(result.evaluationHistory.structuralIssues).toEqual([]);
      expect(result.evaluationHistory.advisoryWarnings).not.toContain(advisory);
      expect(result.validationResults.passed).toBe(true);
    });
  });

  // Final review judges-factcheck[1]: every passing criterion carried a fix and the
  // guidance carried optional steps, and the reworks acted on them. Since phase 4 both
  // judges read one contract, the truth-only one, for every theme (R1; brief 4.7c).
  // Brief 4.13 (R14; R1): a judge's prompt is its theme's, and the parked detective, which
  // names no rules folder, has none, so the contract is the journalist's judges' alone.
  describe('the judge\'s output contract asks for the must-fix work only', () => {
    it('the schema asks for a criterion\'s fix only below the bar, and guidance only for the structural issues', () => {
      const { fix } = TRUTH_ONLY_EVALUATION_JSON_SCHEMA.properties.criteriaScores.additionalProperties.properties;
      expect(fix.description).toContain('Only for a score below 0.8');
      expect(fix.description).not.toContain('raise this score');
      const { revisionGuidance } = TRUTH_ONLY_EVALUATION_JSON_SCHEMA.properties;
      expect(revisionGuidance.type).toBe('string');
      expect(revisionGuidance.description).toContain('One step per structural issue');
    });

    it.each(['journalist'])('the %s judges\' OUTPUT FORMAT asks for a fix only below the bar and one step per structural issue', (theme) => {
      for (const phase of ['arcs', 'article']) {
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
  // Phase 4: each judge names each breach and gives its fix in the truth section and the
  // OUTPUT FORMAT alone: the arc stage's fact check (brief 4.4) and the article judge,
  // whose "MUST be actionable" block went with its frame (brief 4.7a), as the detective's
  // did with its article judge (R1).
  describe('the judges ask for fixes the way the contract does (the 4b fix batch)', () => {
    it('judge prompt text writes the bar through STRUCTURAL_PASS_SCORE, never as a number; the prompts read the same', () => {
      const source = require('fs').readFileSync(require.resolve('../../../lib/workflow/nodes/evaluator-nodes'), 'utf8');
      expect(source).not.toMatch(/MUST score >= 0\.8|score it below 0\.8/);
      for (const phase of ['arcs', 'article']) {
        const prompt = systemFor(phase, stateFor());
        expect([phase, prompt.includes('One breach fails it: score it below 0.8.')]).toEqual([phase, true]);
        expect([phase, prompt.includes('when every truth criterion scores 0.8 or more.')]).toEqual([phase, true]);
        expect([phase, prompt.includes('MUST be actionable')]).toEqual([phase, false]);
      }
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
    // Phase 4 (brief 4.4): the arc stage never escalates; its fact check skips by its mark
    // on the weave (lib/__tests__/weave-stage.test.js, __tests__/integration/weave-graph.test.js).
    // Brief 4.6: the outline judge left the graph, and its stop with it.
    const STOPS = {
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

    it.each(['article'])('a rollback to %s after the escalation appends the stub, so the regenerated output is evaluated', async (phase) => {
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

    // Phase 4 (brief 4.6; R5): no arc package points at a photo; each prints once, in PHOTOS.
    it('the article writer and its reworker list every photo once, under PHOTOS', async () => {
      const state = withKeptPhoto();
      const writer = recordingSdk();
      await generateContentBundle({ ...state, contentBundle: null }, cfg(writer));
      const rework = recordingSdk();
      await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg(rework));
      for (const prompt of [writer.mock.calls[0][0].prompt, rework.mock.calls[0][0].prompt]) {
        const photos = prompt.slice(prompt.indexOf('\nPHOTOS ('), prompt.indexOf('<RECORD>'));
        expect(photos).toContain(`\n\n${ENTRIES(state).join('\n\n')}`);
        expect(count(prompt, 'p2.jpg: Alex')).toBe(1);
        expect(prompt).not.toContain('ARC PHOTOS:');
        // The whiteboard photo is never listed.
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

    // Brief 4.7c (R7): the hero is the map's top photo, whatever the stored heroImage.
    it('with no top photo on the map, the writer and the judge list every kept photo and mark none as the hero', () => {
      const state = withKeptPhoto();
      delete state.outline.topPhoto;
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
      // Brief 4.7b: the writer's second input is the map it writes from, its top photo the hero.
      expect(inputs[1].topPhoto).toBe('hero.jpg');
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
      // Phase 4 (brief 4.6): the map names no photo the director left out (its writer is
      // offered the kept photos alone), so its top photo goes with the exclusion here.
      const { topPhoto: _excluded, ...map } = state.outline;
      state.outline = map;
      const inputs = articleWriterInputs(state);
      // Brief 4.7b: the map the writer reads has no top photo, and the HERO IMAGE line went:
      // the instruction says the bundle takes no hero.
      expect(inputs[1]).not.toHaveProperty('topPhoto');
      expect(inputs[inputs.length - 1].photos.map((p) => p.filename)).toEqual(['p2.jpg', 'p9.jpg']);
      const prompts = await articlePrompts(state);
      expect(prompts.writer).toContain('The map has no top photo, so the bundle has no "heroImage".');
      expect(prompts.rework).toContain('The map has no top photo, so the bundle has no "heroImage".');
      expect(prompts.judge).toContain('PHOTOS (the 2 photos the article writer was given: every photo the director has not excluded');
      for (const prompt of Object.values(prompts)) {
        expect(prompt).not.toContain('hero.jpg');
        expect(prompt).not.toContain('[hero image]');
      }
      // Phase 4 (brief 4.7b; R1): the parked detective's stored hero went with its article
      // writer.
    });
  });
});
