/**
 * Arc Specialist Nodes Unit Tests - Commit 8.xx
 *
 * Tests for the arc analysis nodes in the workflow.
 *
 * Commit 8.xx: Removed legacy parallel specialist tests (analyzeArcsWithSubagents, etc.)
 * Current architecture uses single-call player-focus-guided analysis.
 *
 * Phase 4 (brief 4.4): the arc writer writes the weave in one call, and the code checks
 * replace the arc check. The arc schemas, the mock orchestrator, the accusation-arc
 * filter and the source labels went with the arcs; lib/__tests__/weave.test.js and
 * lib/__tests__/weave-stage.test.js pin the weave, its checks and its routing.
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const {
  _testing: {
    buildWeavePrompt,
    generateWeave,
    extractEvidenceSummary,
    extractPlayerFocusContext,
    weaveSystemPrompt
  }
} = require('../../../lib/workflow/nodes/arc-specialist-nodes');
const { WEAVE_SCHEMA } = require('../../../lib/sdk-client/subagents');

describe('arc-specialist-nodes', () => {
  describe('module exports', () => {
    it('exports _testing with current architecture helpers', () => {
      expect(typeof buildWeavePrompt).toBe('function');
      expect(typeof generateWeave).toBe('function');
      expect(typeof extractEvidenceSummary).toBe('function');
      expect(typeof extractPlayerFocusContext).toBe('function');
      expect(typeof weaveSystemPrompt).toBe('function');
    });

    it('exports player-focus-guided schema for revision flow', () => {
      // Phase 4 (brief 4.4): one schema, the weave's, serves the writer and its rework.
      expect(WEAVE_SCHEMA).toBeDefined();
      expect(WEAVE_SCHEMA.required).toContain('threads');
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

      // Phase 4 (brief 4.4): a buried sale is the ledger's, which a receipt names as
      // "ledger"; the writer reads the sales on the record view's morning timeline, so
      // the summary lists none of them. Buried transactions NOT in allEvidenceIds
      // (Layer 2 can't be cited).
      expect(summary).not.toHaveProperty('buriedTransactions');
      expect(summary.allEvidenceIds).not.toContain('tx-1');
    });

    it('handles empty evidence bundle', () => {
      const summary = extractEvidenceSummary({});

      expect(summary.exposedTokens).toEqual([]);
      expect(summary.exposedPaper).toEqual([]);
      expect(summary.allEvidenceIds).toEqual([]);
    });
  });

  describe('buildWeavePrompt', () => {
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
      const prompt = buildWeavePrompt(state);

      expect(prompt).toContain('Blake');
      expect(prompt).toContain('Murder');
    });

    it('includes roster in prompt', () => {
      const state = createMinimalState();
      const prompt = buildWeavePrompt(state);

      expect(prompt).toContain('Sarah');
      expect(prompt).toContain('Alex');
    });

    it('does not include rosterCoverageCheck in output format (Commit 8.xx)', () => {
      const state = createMinimalState();
      const prompt = buildWeavePrompt(state);

      expect(prompt).not.toContain('rosterCoverageCheck');
      // Phase 4 (brief 4.4): the output format is the weave's.
      expect(prompt).toContain('"threads": [');
      expect(prompt).not.toContain('narrativeArcs');
    });
  });
});
