/**
 * Arc Specialist Nodes Unit Tests
 *
 * Tests for the three domain specialists and synthesizer that
 * perform parallel arc analysis in the workflow.
 *
 * See ARCHITECTURE_DECISIONS.md 8.6.2 for design rationale.
 */

const {
  analyzeFinancialPatterns,
  analyzeBehavioralPatterns,
  analyzeVictimizationPatterns,
  synthesizeArcs,
  createMockSpecialist,
  createMockSynthesizer,
  _testing: {
    SPECIALIST_DOMAINS,
    getSdkClient,
    buildSpecialistSystemPrompt,
    buildSpecialistUserPrompt,
    buildSynthesizerSystemPrompt,
    buildSynthesizerUserPrompt,
    safeParseJson,
    createEmptySpecialistResult,
    analyzeForDomain
  }
} = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const { PHASES, APPROVAL_TYPES } = require('../../../lib/workflow/state');

describe('arc-specialist-nodes', () => {
  describe('module exports', () => {
    it('exports analyzeFinancialPatterns function', () => {
      expect(typeof analyzeFinancialPatterns).toBe('function');
    });

    it('exports analyzeBehavioralPatterns function', () => {
      expect(typeof analyzeBehavioralPatterns).toBe('function');
    });

    it('exports analyzeVictimizationPatterns function', () => {
      expect(typeof analyzeVictimizationPatterns).toBe('function');
    });

    it('exports synthesizeArcs function', () => {
      expect(typeof synthesizeArcs).toBe('function');
    });

    it('exports createMockSpecialist factory', () => {
      expect(typeof createMockSpecialist).toBe('function');
    });

    it('exports createMockSynthesizer factory', () => {
      expect(typeof createMockSynthesizer).toBe('function');
    });

    it('exports _testing with helper functions', () => {
      expect(SPECIALIST_DOMAINS).toBeDefined();
      expect(typeof getSdkClient).toBe('function');
      expect(typeof buildSpecialistSystemPrompt).toBe('function');
      expect(typeof safeParseJson).toBe('function');
    });
  });

  describe('SPECIALIST_DOMAINS', () => {
    it('defines financial domain', () => {
      expect(SPECIALIST_DOMAINS.financial).toBeDefined();
      expect(SPECIALIST_DOMAINS.financial.name).toContain('Financial');
      expect(SPECIALIST_DOMAINS.financial.focus).toBeInstanceOf(Array);
      expect(SPECIALIST_DOMAINS.financial.outputFields).toBeInstanceOf(Array);
    });

    it('defines behavioral domain', () => {
      expect(SPECIALIST_DOMAINS.behavioral).toBeDefined();
      expect(SPECIALIST_DOMAINS.behavioral.name).toContain('Behavioral');
    });

    it('defines victimization domain', () => {
      expect(SPECIALIST_DOMAINS.victimization).toBeDefined();
      expect(SPECIALIST_DOMAINS.victimization.name).toContain('Victimization');
    });

    it('each domain has required properties', () => {
      Object.values(SPECIALIST_DOMAINS).forEach(domain => {
        expect(domain.name).toBeDefined();
        expect(domain.focus.length).toBeGreaterThan(0);
        expect(domain.outputFields.length).toBeGreaterThan(0);
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
  });

  describe('buildSpecialistSystemPrompt', () => {
    it('includes domain focus areas', () => {
      const prompt = buildSpecialistSystemPrompt('financial', {});

      expect(prompt).toContain('Financial');
      expect(prompt).toContain('Transaction patterns');
    });

    it('includes player focus when provided', () => {
      const playerFocus = { primaryInvestigation: 'Who stole the money?' };
      const prompt = buildSpecialistSystemPrompt('financial', playerFocus);

      expect(prompt).toContain('Who stole the money?');
    });

    it('throws for unknown domain', () => {
      expect(() => buildSpecialistSystemPrompt('unknown', {}))
        .toThrow('Unknown specialist domain: unknown');
    });

    it('mentions About Last Night game', () => {
      const prompt = buildSpecialistSystemPrompt('behavioral', {});

      expect(prompt).toContain('About Last Night');
    });
  });

  describe('buildSpecialistUserPrompt', () => {
    it('includes evidence bundle', () => {
      const state = {
        evidenceBundle: { exposed: ['item1'], buried: ['item2'] }
      };
      const prompt = buildSpecialistUserPrompt(state, 'financial');

      expect(prompt).toContain('exposed');
      expect(prompt).toContain('item1');
    });

    it('includes photo analyses', () => {
      const state = {
        photoAnalyses: { analyses: [{ filename: 'photo.jpg' }] }
      };
      const prompt = buildSpecialistUserPrompt(state, 'behavioral');

      expect(prompt).toContain('photo.jpg');
    });

    it('limits preprocessed evidence items', () => {
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `item-${i}` }));
      const state = {
        preprocessedEvidence: { items }
      };
      const prompt = buildSpecialistUserPrompt(state, 'victimization');

      expect(prompt).toContain('and 10 more items');
    });
  });

  describe('buildSynthesizerSystemPrompt', () => {
    it('mentions all three specialist domains', () => {
      const prompt = buildSynthesizerSystemPrompt({});

      expect(prompt).toContain('Financial');
      expect(prompt).toContain('Behavioral');
      expect(prompt).toContain('Victimization');
    });

    it('includes whiteboard accusations when provided', () => {
      const playerFocus = {
        whiteboardAccusations: { 'Alice': 'operator' }
      };
      const prompt = buildSynthesizerSystemPrompt(playerFocus);

      expect(prompt).toContain('WHITEBOARD ACCUSATIONS');
      expect(prompt).toContain('Alice');
    });

    it('mentions Layer 3 drives narrative', () => {
      const prompt = buildSynthesizerSystemPrompt({});

      expect(prompt).toContain('Layer 3');
    });
  });

  describe('buildSynthesizerUserPrompt', () => {
    it('includes all specialist findings', () => {
      const state = {
        specialistAnalyses: {
          financial: { findings: { patterns: ['pattern1'] } },
          behavioral: { findings: { dynamics: ['dynamic1'] } },
          victimization: { findings: { victims: ['victim1'] } }
        }
      };
      const prompt = buildSynthesizerUserPrompt(state);

      expect(prompt).toContain('FINANCIAL');
      expect(prompt).toContain('pattern1');
      expect(prompt).toContain('BEHAVIORAL');
      expect(prompt).toContain('VICTIMIZATION');
    });

    it('handles missing specialist analyses', () => {
      const state = {};
      const prompt = buildSynthesizerUserPrompt(state);

      expect(prompt).toContain('FINANCIAL');
      // Should not throw
    });
  });

  describe('safeParseJson', () => {
    it('parses valid JSON', () => {
      const result = safeParseJson('{"key": "value"}', 'test');
      expect(result.key).toBe('value');
    });

    it('throws actionable error for invalid JSON', () => {
      expect(() => safeParseJson('not json', 'financial specialist'))
        .toThrow(/Failed to parse financial specialist:/);
    });
  });

  describe('createEmptySpecialistResult', () => {
    it('creates result with domain name', () => {
      const result = createEmptySpecialistResult('financial', 'test-session');
      expect(result.domain).toBe('financial');
    });

    it('includes sessionId', () => {
      const result = createEmptySpecialistResult('behavioral', 'my-session');
      expect(result.sessionId).toBe('my-session');
    });

    it('initializes empty findings for domain output fields', () => {
      const result = createEmptySpecialistResult('victimization', 'test');
      expect(result.findings.victims).toEqual([]);
      expect(result.findings.operators).toEqual([]);
    });
  });

  describe('analyzeFinancialPatterns', () => {
    it('returns specialistAnalyses.financial', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        accountPatterns: [{ description: 'Pattern 1' }],
        timingClusters: [],
        suspiciousFlows: [],
        financialConnections: []
      });

      const state = {
        evidenceBundle: { exposed: [] },
        sessionId: 'test'
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await analyzeFinancialPatterns(state, config);

      expect(result.specialistAnalyses.financial).toBeDefined();
      expect(result.specialistAnalyses.financial.domain).toBe('financial');
    });

    it('sets currentPhase to ARC_SPECIALISTS', async () => {
      const mockClient = jest.fn().mockResolvedValue({});
      const state = { evidenceBundle: {} };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await analyzeFinancialPatterns(state, config);

      expect(result.currentPhase).toBe(PHASES.ARC_SPECIALISTS);
    });

    it('skips if financial analysis already exists', async () => {
      const state = {
        specialistAnalyses: { financial: { domain: 'financial' } }
      };

      const result = await analyzeFinancialPatterns(state, {});

      expect(result.specialistAnalyses).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.ARC_SPECIALISTS);
    });
  });

  describe('analyzeBehavioralPatterns', () => {
    it('returns specialistAnalyses.behavioral', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        characterDynamics: [],
        behaviorCorrelations: [],
        zeroFootprintCharacters: [],
        behavioralInsights: []
      });

      const state = { evidenceBundle: {}, sessionId: 'test' };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await analyzeBehavioralPatterns(state, config);

      expect(result.specialistAnalyses.behavioral).toBeDefined();
    });
  });

  describe('analyzeVictimizationPatterns', () => {
    it('returns specialistAnalyses.victimization', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        victims: [],
        operators: [],
        selfBurialPatterns: [],
        targetingInsights: []
      });

      const state = { evidenceBundle: {}, sessionId: 'test' };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await analyzeVictimizationPatterns(state, config);

      expect(result.specialistAnalyses.victimization).toBeDefined();
    });
  });

  describe('analyzeForDomain (generic)', () => {
    it('handles Claude client error gracefully', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('API timeout'));
      const state = { evidenceBundle: {}, sessionId: 'test' };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await analyzeForDomain('financial', state, config);

      expect(result.specialistAnalyses.financial._error).toBe('API timeout');
      expect(result.errors[0].type).toBe('financial-specialist-failed');
      expect(result.currentPhase).toBe(PHASES.ARC_SPECIALISTS); // Not ERROR - partial success
    });

    it('creates empty result when no evidence', async () => {
      const state = { sessionId: 'test' };

      const result = await analyzeForDomain('behavioral', state, {});

      expect(result.specialistAnalyses.behavioral.findings.characterDynamics).toEqual([]);
    });

    it('uses sonnet model for quality', async () => {
      const mockClient = jest.fn().mockResolvedValue({});
      const state = { evidenceBundle: {} };
      const config = { configurable: { sdkClient: mockClient } };

      await analyzeForDomain('financial', state, config);

      expect(mockClient).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'sonnet' })
      );
    });
  });

  describe('synthesizeArcs', () => {
    it('returns narrativeArcs array', async () => {
      const mockClient = jest.fn().mockResolvedValue({
        arcs: [
          { title: 'Arc 1', summary: 'Summary 1' }
        ],
        synthesisNotes: 'Test notes'
      });

      const state = {
        specialistAnalyses: {
          financial: { findings: {} },
          behavioral: { findings: {} },
          victimization: { findings: {} }
        },
        sessionId: 'test'
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await synthesizeArcs(state, config);

      expect(result.narrativeArcs).toHaveLength(1);
      expect(result.narrativeArcs[0].title).toBe('Arc 1');
    });

    it('sets currentPhase to ARC_SYNTHESIS', async () => {
      const mockClient = jest.fn().mockResolvedValue({ arcs: [] });
      const state = { specialistAnalyses: {} };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await synthesizeArcs(state, config);

      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });

    it('sets awaitingApproval and approvalType', async () => {
      const mockClient = jest.fn().mockResolvedValue({ arcs: [{ title: 'Test' }] });
      const state = { specialistAnalyses: {} };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await synthesizeArcs(state, config);

      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });

    it('skips if narrativeArcs already exist', async () => {
      const state = {
        narrativeArcs: [{ title: 'Existing Arc' }]
      };

      const result = await synthesizeArcs(state, {});

      expect(result.narrativeArcs).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });

    it('populates _arcAnalysisCache', async () => {
      const mockClient = jest.fn().mockResolvedValue({ arcs: [{ title: 'Arc' }], synthesisNotes: 'Notes' });
      const state = {
        specialistAnalyses: { financial: {} }
      };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await synthesizeArcs(state, config);

      expect(result._arcAnalysisCache.synthesizedAt).toBeDefined();
      expect(result._arcAnalysisCache.specialistDomains).toContain('financial');
      expect(result._arcAnalysisCache.synthesisNotes).toBe('Notes');
    });

    it('handles synthesis error with ERROR phase', async () => {
      const mockClient = jest.fn().mockRejectedValue(new Error('Synthesis failed'));
      const state = { specialistAnalyses: {} };
      const config = { configurable: { sdkClient: mockClient } };

      const result = await synthesizeArcs(state, config);

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors[0].type).toBe('arc-synthesis-failed');
      expect(result.narrativeArcs).toEqual([]);
    });
  });

  describe('createMockSpecialist', () => {
    it('creates mock with domain-specific findings', async () => {
      const mock = createMockSpecialist('financial');
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.specialistAnalyses.financial).toBeDefined();
      expect(result.specialistAnalyses.financial.domain).toBe('financial');
    });

    it('can simulate failure', async () => {
      const mock = createMockSpecialist('behavioral', {
        shouldFail: true,
        errorMessage: 'Test error'
      });
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.specialistAnalyses.behavioral._error).toBe('Test error');
      expect(result.errors).toHaveLength(1);
    });

    it('uses custom findings when provided', async () => {
      const mock = createMockSpecialist('financial', {
        findings: {
          financial: { customField: [{ data: 'custom' }] }
        }
      });
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.specialistAnalyses.financial.findings.customField).toBeDefined();
    });
  });

  describe('createMockSynthesizer', () => {
    it('creates mock with default arc', async () => {
      const mock = createMockSynthesizer();
      const result = await mock({ specialistAnalyses: {} }, {});

      expect(result.narrativeArcs).toHaveLength(1);
      expect(result.narrativeArcs[0].title).toBe('Mock Arc 1');
    });

    it('can simulate failure', async () => {
      const mock = createMockSynthesizer({
        shouldFail: true,
        errorMessage: 'Synthesis error'
      });
      const result = await mock({}, {});

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.narrativeArcs).toEqual([]);
    });

    it('uses custom arcs when provided', async () => {
      const customArcs = [
        { title: 'Custom Arc', summary: 'Custom summary' }
      ];
      const mock = createMockSynthesizer({ arcs: customArcs });
      const result = await mock({}, {});

      expect(result.narrativeArcs[0].title).toBe('Custom Arc');
    });

    it('sets approval state', async () => {
      const mock = createMockSynthesizer();
      const result = await mock({}, {});

      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });
  });

  describe('parallel execution pattern', () => {
    it('all three specialists can run concurrently', async () => {
      const mockClient = jest.fn().mockResolvedValue({});
      const state = { evidenceBundle: {}, sessionId: 'test' };
      const config = { configurable: { sdkClient: mockClient } };

      // Simulate parallel execution
      const [financial, behavioral, victimization] = await Promise.all([
        analyzeFinancialPatterns(state, config),
        analyzeBehavioralPatterns(state, config),
        analyzeVictimizationPatterns(state, config)
      ]);

      expect(financial.specialistAnalyses.financial).toBeDefined();
      expect(behavioral.specialistAnalyses.behavioral).toBeDefined();
      expect(victimization.specialistAnalyses.victimization).toBeDefined();
    });

    it('merged specialist results work with synthesizer', async () => {
      // Simulate scatter-gather pattern
      const mockClient = jest.fn()
        .mockResolvedValueOnce({ accountPatterns: [] }) // financial
        .mockResolvedValueOnce({ characterDynamics: [] }) // behavioral
        .mockResolvedValueOnce({ victims: [] }) // victimization
        .mockResolvedValueOnce({ arcs: [{ title: 'Unified Arc' }] }); // synthesizer

      const state = { evidenceBundle: {}, sessionId: 'test' };
      const config = { configurable: { sdkClient: mockClient } };

      // Scatter: Run specialists
      const [financial, behavioral, victimization] = await Promise.all([
        analyzeFinancialPatterns(state, config),
        analyzeBehavioralPatterns(state, config),
        analyzeVictimizationPatterns(state, config)
      ]);

      // Merge results
      const mergedState = {
        ...state,
        specialistAnalyses: {
          ...financial.specialistAnalyses,
          ...behavioral.specialistAnalyses,
          ...victimization.specialistAnalyses
        }
      };

      // Gather: Run synthesizer
      const synthesis = await synthesizeArcs(mergedState, config);

      expect(synthesis.narrativeArcs[0].title).toBe('Unified Arc');
      expect(synthesis._arcAnalysisCache.specialistDomains).toHaveLength(3);
    });
  });
});
