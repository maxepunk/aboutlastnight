/**
 * Arc Specialist Nodes Unit Tests - Commit 8.8/8.9
 *
 * Tests for the orchestrated subagent pattern that performs
 * arc analysis in the workflow.
 *
 * Commit 8.8 changed from 4 sequential nodes (3 specialists + 1 synthesizer)
 * to 1 orchestrator node with 3 subagents.
 *
 * Commit 8.9: Specialists are now file-based agents in .claude/agents/
 *
 * See ARCHITECTURE_DECISIONS.md 8.8/8.9 for design rationale.
 */

const {
  analyzeArcsWithSubagents,
  createMockOrchestrator,
  createMockSpecialist,  // @deprecated
  createMockSynthesizer, // @deprecated
  _testing: {
    buildOrchestratorPrompt,
    createEmptyAnalysisResult,
    SPECIALIST_AGENT_NAMES,
    getSpecialistAgents,  // Commit 8.11: Factory function for absolute paths
    ORCHESTRATOR_SYSTEM_PROMPT,
    ORCHESTRATOR_OUTPUT_SCHEMA
  }
} = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const { PHASES, APPROVAL_TYPES } = require('../../../lib/workflow/state');

describe('arc-specialist-nodes (Commit 8.8)', () => {
  describe('module exports', () => {
    it('exports analyzeArcsWithSubagents function', () => {
      expect(typeof analyzeArcsWithSubagents).toBe('function');
    });

    it('exports createMockOrchestrator factory', () => {
      expect(typeof createMockOrchestrator).toBe('function');
    });

    it('exports deprecated createMockSpecialist for backwards compatibility', () => {
      expect(typeof createMockSpecialist).toBe('function');
    });

    it('exports deprecated createMockSynthesizer for backwards compatibility', () => {
      expect(typeof createMockSynthesizer).toBe('function');
    });

    it('exports _testing with orchestrator helpers', () => {
      expect(typeof buildOrchestratorPrompt).toBe('function');
      expect(typeof createEmptyAnalysisResult).toBe('function');
      expect(SPECIALIST_AGENT_NAMES).toBeDefined();
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toBeDefined();
      expect(ORCHESTRATOR_OUTPUT_SCHEMA).toBeDefined();
    });
  });

  describe('SPECIALIST_AGENT_NAMES (Commit 8.9)', () => {
    it('defines financial specialist agent name', () => {
      expect(SPECIALIST_AGENT_NAMES.financial).toBe('journalist-financial-specialist');
    });

    it('defines behavioral specialist agent name', () => {
      expect(SPECIALIST_AGENT_NAMES.behavioral).toBe('journalist-behavioral-specialist');
    });

    it('defines victimization specialist agent name', () => {
      expect(SPECIALIST_AGENT_NAMES.victimization).toBe('journalist-victimization-specialist');
    });

    it('all three specialist domains are defined', () => {
      expect(Object.keys(SPECIALIST_AGENT_NAMES)).toHaveLength(3);
      expect(SPECIALIST_AGENT_NAMES.financial).toBeDefined();
      expect(SPECIALIST_AGENT_NAMES.behavioral).toBeDefined();
      expect(SPECIALIST_AGENT_NAMES.victimization).toBeDefined();
    });
  });

  describe('getSpecialistAgents (Commit 8.11)', () => {
    it('returns all three specialist agents', () => {
      const agents = getSpecialistAgents();
      expect(agents['journalist-financial-specialist']).toBeDefined();
      expect(agents['journalist-behavioral-specialist']).toBeDefined();
      expect(agents['journalist-victimization-specialist']).toBeDefined();
    });

    it('includes evidence boundaries content', () => {
      const agents = getSpecialistAgents();
      const financialPrompt = agents['journalist-financial-specialist'].prompt;
      // Commit 8.14: Content is now inlined, not referenced by path
      expect(financialPrompt).toContain('evidence-boundaries.md');
      expect(financialPrompt).not.toContain('\\');  // No backslashes in prompt
      // Check that evidence boundaries content is present
      expect(financialPrompt).toContain('REPORTABLE');
    });
  });

  describe('ORCHESTRATOR_SYSTEM_PROMPT', () => {
    it('mentions About Last Night game', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('About Last Night');
    });

    it('mentions all three specialist agent names', () => {
      // Commit 8.9: Specialists are now file-based agents
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('journalist-financial-specialist');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('journalist-behavioral-specialist');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('journalist-victimization-specialist');
    });

    it('emphasizes Layer 3 drives narrative', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('Layer 3');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('PLAYER FOCUS');
    });

    it('defines expected output structure', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('specialistAnalyses');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('narrativeArcs');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('synthesisNotes');
    });
  });

  describe('ORCHESTRATOR_OUTPUT_SCHEMA', () => {
    it('requires specialistAnalyses field', () => {
      expect(ORCHESTRATOR_OUTPUT_SCHEMA.required).toContain('specialistAnalyses');
    });

    it('requires narrativeArcs field', () => {
      expect(ORCHESTRATOR_OUTPUT_SCHEMA.required).toContain('narrativeArcs');
    });

    it('requires synthesisNotes field', () => {
      expect(ORCHESTRATOR_OUTPUT_SCHEMA.required).toContain('synthesisNotes');
    });

    it('defines specialist analyses structure', () => {
      const spec = ORCHESTRATOR_OUTPUT_SCHEMA.properties.specialistAnalyses;
      expect(spec.properties.financial).toBeDefined();
      expect(spec.properties.behavioral).toBeDefined();
      expect(spec.properties.victimization).toBeDefined();
    });
  });

  describe('buildOrchestratorPrompt', () => {
    it('includes player focus investigation', () => {
      const state = {
        playerFocus: { primaryInvestigation: 'Who is the Valet?' }
      };
      const prompt = buildOrchestratorPrompt(state);

      expect(prompt).toContain('Who is the Valet?');
    });

    it('includes whiteboard context when provided', () => {
      // Implementation expects whiteboardContext with suspectsExplored, connections, notes, namesFound
      const state = {
        playerFocus: {
          whiteboardContext: {
            suspectsExplored: ['Victoria', 'Morgan'],
            connections: ['Victoria to Morgan via shell account'],
            notes: ['MARCUS BLACKWOOD IS DEAD'],
            namesFound: ['Marcus', 'Victoria']
          }
        }
      };
      const prompt = buildOrchestratorPrompt(state);

      expect(prompt).toContain('WHITEBOARD');
      expect(prompt).toContain('Victoria');
      expect(prompt).toContain('Morgan');
    });

    it('includes evidence bundle', () => {
      // Evidence bundle uses nested structure: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [], relationships: [] } }
      const state = {
        evidenceBundle: {
          exposed: {
            tokens: [{ id: 'exposed-token-1', name: 'Test Token' }],
            paperEvidence: []
          },
          buried: {
            transactions: [{ id: 'buried-tx-1', description: 'Test Transaction' }],
            relationships: []
          }
        }
      };
      const prompt = buildOrchestratorPrompt(state);

      expect(prompt).toContain('EXPOSED EVIDENCE');
      expect(prompt).toContain('BURIED EVIDENCE');
      expect(prompt).toContain('exposed-token-1');
    });

    it('includes roster when provided', () => {
      const state = {
        sessionConfig: { roster: ['Alex', 'Victoria', 'Morgan'] }
      };
      const prompt = buildOrchestratorPrompt(state);

      expect(prompt).toContain('ROSTER');
      expect(prompt).toContain('Alex');
    });

    it('includes subagent instructions', () => {
      const prompt = buildOrchestratorPrompt({});

      expect(prompt).toContain('financial-specialist');
      expect(prompt).toContain('behavioral-specialist');
      expect(prompt).toContain('victimization-specialist');
    });
  });

  describe('createEmptyAnalysisResult', () => {
    it('creates result with all specialist domains', () => {
      const result = createEmptyAnalysisResult('test-session');

      expect(result.specialistAnalyses.financial).toBeDefined();
      expect(result.specialistAnalyses.behavioral).toBeDefined();
      expect(result.specialistAnalyses.victimization).toBeDefined();
    });

    it('creates empty narrative arcs array', () => {
      const result = createEmptyAnalysisResult('test-session');

      expect(result.narrativeArcs).toEqual([]);
    });

    it('includes sessionId', () => {
      const result = createEmptyAnalysisResult('my-session');

      expect(result.sessionId).toBe('my-session');
    });

    it('includes timestamp', () => {
      const result = createEmptyAnalysisResult('test');

      expect(result.analyzedAt).toBeDefined();
    });
  });

  describe('analyzeArcsWithSubagents', () => {
    it('skips if narrativeArcs already exist', async () => {
      const state = {
        narrativeArcs: [{ title: 'Existing Arc' }]
      };

      const result = await analyzeArcsWithSubagents(state, {});

      expect(result.narrativeArcs).toBeUndefined();
      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });

    it('creates empty result when no evidence', async () => {
      const state = { sessionId: 'test' };

      const result = await analyzeArcsWithSubagents(state, {});

      expect(result.specialistAnalyses).toBeDefined();
      expect(result.narrativeArcs).toEqual([]);
      expect(result.awaitingApproval).toBe(true);
    });

    it('sets awaitingApproval and approvalType on success', async () => {
      // Use mock orchestrator pattern
      const mockOrchestrator = createMockOrchestrator();
      const state = { evidenceBundle: {}, sessionId: 'test' };

      const result = await mockOrchestrator(state, {});

      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });

    it('sets currentPhase to ARC_SYNTHESIS', async () => {
      const mockOrchestrator = createMockOrchestrator();
      const state = { evidenceBundle: {} };

      const result = await mockOrchestrator(state, {});

      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });
  });

  describe('createMockOrchestrator', () => {
    it('creates mock with default specialist analyses', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.specialistAnalyses.financial).toBeDefined();
      expect(result.specialistAnalyses.behavioral).toBeDefined();
      expect(result.specialistAnalyses.victimization).toBeDefined();
    });

    it('creates mock with default narrative arc', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({}, {});

      expect(result.narrativeArcs).toHaveLength(1);
      expect(result.narrativeArcs[0].title).toBe('Mock Arc 1');
    });

    it('can simulate failure', async () => {
      const mock = createMockOrchestrator({
        shouldFail: true,
        errorMessage: 'Test orchestrator error'
      });
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.errors[0].type).toBe('orchestrator-failed');
      expect(result.errors[0].message).toBe('Test orchestrator error');
    });

    it('uses custom specialist analyses when provided', async () => {
      const customAnalyses = {
        financial: { customField: 'custom data' },
        behavioral: {},
        victimization: {}
      };
      const mock = createMockOrchestrator({ specialistAnalyses: customAnalyses });
      const result = await mock({}, {});

      expect(result.specialistAnalyses.financial.customField).toBe('custom data');
    });

    it('uses custom arcs when provided', async () => {
      const customArcs = [
        { title: 'Custom Arc', summary: 'Custom summary', playerEmphasis: 'high', storyRelevance: 'critical' }
      ];
      const mock = createMockOrchestrator({ arcs: customArcs });
      const result = await mock({}, {});

      expect(result.narrativeArcs[0].title).toBe('Custom Arc');
    });

    it('populates _arcAnalysisCache', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({}, {});

      expect(result._arcAnalysisCache.synthesizedAt).toBeDefined();
      expect(result._arcAnalysisCache.specialistDomains).toContain('financial');
      expect(result._arcAnalysisCache.arcCount).toBe(1);
    });

    it('sets approval state', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({}, {});

      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });
  });

  describe('deprecated mock factories', () => {
    // These tests verify backwards compatibility
    // The deprecated mocks should still work but log warnings

    it('createMockSpecialist still works', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mock = createMockSpecialist('financial');
      const result = await mock({ sessionId: 'test' }, {});

      expect(result.specialistAnalyses).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATED'));
      consoleSpy.mockRestore();
    });

    it('createMockSynthesizer still works', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mock = createMockSynthesizer();
      const result = await mock({}, {});

      expect(result.narrativeArcs).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATED'));
      consoleSpy.mockRestore();
    });
  });

  describe('orchestrator pattern vs old sequential pattern', () => {
    it('new orchestrator returns all analyses in one call', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({ evidenceBundle: {} }, {});

      // All three specialist domains in one result
      expect(Object.keys(result.specialistAnalyses)).toHaveLength(3);

      // Arcs synthesized in same call
      expect(result.narrativeArcs.length).toBeGreaterThan(0);

      // Single phase transition
      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });

    it('orchestrator sets approval after synthesis', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({}, {});

      // Orchestrator combines specialist work + synthesis + approval checkpoint
      expect(result.awaitingApproval).toBe(true);
      expect(result.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
    });
  });
});
