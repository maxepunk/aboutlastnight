/**
 * Arc Specialist Nodes Unit Tests - Commit 8.xx
 *
 * Tests for the arc analysis nodes in the workflow.
 *
 * Commit 8.xx: Removed legacy parallel specialist tests (analyzeArcsWithSubagents, etc.)
 * Current architecture uses single-call player-focus-guided analysis.
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const {
  createMockOrchestrator,
  _testing: {
    buildCoreArcPrompt,
    generateCoreArcs,
    extractEvidenceSummary,
    extractPlayerFocusContext,
    buildOutputFormatSection,
    CORE_ARC_SCHEMA,
    buildPlayerFocusGuidedPrompt,
    PLAYER_FOCUS_GUIDED_SCHEMA
  }
} = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const { PHASES } = require('../../../lib/workflow/state');

describe('arc-specialist-nodes', () => {
  describe('module exports', () => {
    it('exports createMockOrchestrator factory', () => {
      expect(typeof createMockOrchestrator).toBe('function');
    });

    it('exports _testing with current architecture helpers', () => {
      expect(typeof buildCoreArcPrompt).toBe('function');
      expect(typeof generateCoreArcs).toBe('function');
      expect(typeof extractEvidenceSummary).toBe('function');
      expect(typeof extractPlayerFocusContext).toBe('function');
      expect(typeof buildOutputFormatSection).toBe('function');
      expect(CORE_ARC_SCHEMA).toBeDefined();
    });

    it('exports player-focus-guided helpers for revision flow', () => {
      expect(typeof buildPlayerFocusGuidedPrompt).toBe('function');
      expect(PLAYER_FOCUS_GUIDED_SCHEMA).toBeDefined();
    });
  });

  describe('CORE_ARC_SCHEMA', () => {
    it('requires narrativeArcs field', () => {
      expect(CORE_ARC_SCHEMA.required).toContain('narrativeArcs');
    });

    it('requires synthesisNotes field', () => {
      expect(CORE_ARC_SCHEMA.required).toContain('synthesisNotes');
    });

    it('does not require rosterCoverageCheck (Commit 8.xx)', () => {
      // rosterCoverageCheck removed to prevent model continuation after structured output
      expect(CORE_ARC_SCHEMA.properties.rosterCoverageCheck).toBeUndefined();
    });
  });

  describe('PLAYER_FOCUS_GUIDED_SCHEMA', () => {
    it('requires narrativeArcs and synthesisNotes', () => {
      expect(PLAYER_FOCUS_GUIDED_SCHEMA.required).toContain('narrativeArcs');
      expect(PLAYER_FOCUS_GUIDED_SCHEMA.required).toContain('synthesisNotes');
    });

    it('does not require rosterCoverageCheck (Commit 8.xx)', () => {
      // rosterCoverageCheck removed to prevent model continuation after structured output
      expect(PLAYER_FOCUS_GUIDED_SCHEMA.properties.rosterCoverageCheck).toBeUndefined();
    });
  });

  describe('extractEvidenceSummary', () => {
    it('extracts exposed tokens with IDs', () => {
      const evidenceBundle = {
        exposed: {
          tokens: [
            { id: 'token-1', owner: 'Sarah', summary: 'Memory about funding' }
          ],
          paperEvidence: []
        },
        buried: { transactions: [] }
      };

      const summary = extractEvidenceSummary(evidenceBundle);

      expect(summary.exposedTokens).toHaveLength(1);
      expect(summary.exposedTokens[0].id).toBe('token-1');
      expect(summary.allEvidenceIds).toContain('token-1');
    });

    it('extracts exposed paper evidence with IDs', () => {
      const evidenceBundle = {
        exposed: {
          tokens: [],
          paperEvidence: [
            { id: 'paper-1', name: 'Lab Notes', summary: 'Notes from the lab' }
          ]
        },
        buried: { transactions: [] }
      };

      const summary = extractEvidenceSummary(evidenceBundle);

      expect(summary.exposedPaper).toHaveLength(1);
      expect(summary.exposedPaper[0].id).toBe('paper-1');
      expect(summary.allEvidenceIds).toContain('paper-1');
    });

    it('extracts buried transactions (context only)', () => {
      const evidenceBundle = {
        exposed: { tokens: [], paperEvidence: [] },
        buried: {
          transactions: [
            { id: 'tx-1', shellAccount: 'RAVEN', amount: 50000 }
          ]
        }
      };

      const summary = extractEvidenceSummary(evidenceBundle);

      expect(summary.buriedTransactions).toHaveLength(1);
      // Buried transactions NOT in allEvidenceIds (Layer 2 can't be cited)
      expect(summary.allEvidenceIds).not.toContain('tx-1');
    });

    it('handles empty evidence bundle', () => {
      const summary = extractEvidenceSummary({});

      expect(summary.exposedTokens).toEqual([]);
      expect(summary.exposedPaper).toEqual([]);
      expect(summary.buriedTransactions).toEqual([]);
      expect(summary.allEvidenceIds).toEqual([]);
    });
  });

  describe('buildCoreArcPrompt', () => {
    const createMinimalState = () => ({
      sessionConfig: { roster: ['Sarah', 'Alex'] },
      playerFocus: {
        accusation: { accused: ['Blake'], charge: 'Murder' },
        whiteboardContext: { suspectsExplored: [], connections: [], notes: [], namesFound: [] }
      },
      directorNotes: { observations: {} },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } }
    });

    it('includes accusation in prompt', () => {
      const state = createMinimalState();
      const prompt = buildCoreArcPrompt(state);

      expect(prompt).toContain('Blake');
      expect(prompt).toContain('Murder');
    });

    it('includes roster in prompt', () => {
      const state = createMinimalState();
      const prompt = buildCoreArcPrompt(state);

      expect(prompt).toContain('Sarah');
      expect(prompt).toContain('Alex');
    });

    it('does not include rosterCoverageCheck in output format (Commit 8.xx)', () => {
      const state = createMinimalState();
      const prompt = buildCoreArcPrompt(state);

      expect(prompt).not.toContain('rosterCoverageCheck');
    });
  });

  describe('createMockOrchestrator', () => {
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
      expect(result._arcAnalysisCache.arcCount).toBe(1);
    });

    it('sets currentPhase to ARC_SYNTHESIS', async () => {
      const mock = createMockOrchestrator();
      const result = await mock({}, {});

      expect(result.currentPhase).toBe(PHASES.ARC_SYNTHESIS);
    });
  });
});
