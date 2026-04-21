/**
 * Arc-specialist prompt builders consume enriched director-notes shape
 *
 * Verifies that both the core arc prompt and the revision prompt surface
 * the enriched director-notes fields (rawProse, quotes, transactionReferences,
 * postInvestigationDevelopments) and no longer emit the legacy 3-bucket
 * observations shape.
 */

describe('arc-specialist prompt builders consume enriched director-notes', () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');

  const state = {
    sessionConfig: { roster: ['Alex', 'Vic', 'Morgan'] },
    playerFocus: {
      accusation: { accused: ['Alex'], charge: 'Murder', reasoning: 'Motive present' },
      whiteboardContext: { suspectsExplored: ['Vic'], connections: [], notes: [], namesFound: ['Alex'] },
      primaryInvestigation: 'Who killed Marcus'
    },
    directorNotes: {
      rawProse: 'Alex was seen with Sam in the corner. "we had to act" Alex said.',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [{
        excerpt: 'Alex paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: [{ headline: 'Alex detained' }],
      whiteboard: {}
    },
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] }, allEvidenceIds: [] },
    theme: 'journalist',
    canonicalCharacters: {}
  };

  it('buildCoreArcPrompt includes rawProse and NOT legacy 3-bucket JSON', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
    expect(prompt).not.toMatch(/\*\*Suspicious Correlations:\*\*/);
    expect(prompt).not.toMatch(/\*\*Notable Moments:\*\*/);
  });

  it('buildCoreArcPrompt surfaces quotes, transactionReferences, postInvestigationDevelopments', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('we had to act');
    expect(prompt).toContain('tay004');
    expect(prompt).toContain('Alex detained');
  });

  it('buildArcRevisionPrompt includes rawProse and NOT legacy arrays', () => {
    const revisionState = { ...state, validationResults: { structuralIssues: [], issues: [] } };
    const prompt = arcModule._testing.buildArcRevisionPrompt(revisionState, '', '');
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
  });
});
