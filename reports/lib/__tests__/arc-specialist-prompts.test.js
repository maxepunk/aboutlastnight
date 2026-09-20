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

  it('asks for a plain claim in the summary, not the reporter telling it (brief 1.2)', () => {
    // The summaries are what the director reads on the arc cards and what the
    // outline is built from, and they came back in the reporter's voice with
    // presence claims in them. The field's own instruction is where that is said.
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).not.toContain('"summary": "2-3 sentences describing this narrative thread"');
    const summaryLine = prompt.split(String.fromCharCode(10)).find(l => l.trim().startsWith('"summary":'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toMatch(/1 to 3 plain sentences/);
    expect(summaryLine).toMatch(/what this thread claims happened/);
    expect(summaryLine).toMatch(/[Tt]hird person/);
    expect(summaryLine).toMatch(/no reporter persona/);
    expect(summaryLine).toMatch(/no presence claims/);
  });

  it('the arc system prompts state the reporting mode of the session (brief 1.5)', () => {
    // The arc writer was never told where the reporter was, so a remote session's
    // arc summaries said "I watched". The block is the same constant the article
    // system prompt carries, in the same position: after the identity line.
    const { REPORTING_MODE_BLOCKS } = require('../prompt-builder');
    const remote = { reportingMode: 'remote' };

    expect(arcModule._testing.coreArcSystemPrompt(remote)).toContain(REPORTING_MODE_BLOCKS.remote);
    expect(arcModule._testing.interweavingSystemPrompt(remote)).toContain(REPORTING_MODE_BLOCKS.remote);
    expect(arcModule._testing.coreArcSystemPrompt({})).toContain(REPORTING_MODE_BLOCKS['on-site']);
  });

  it('no arc system prompt hands the writer a first-person presence marker (integrator ruling, phase 1)', () => {
    const { CORE_ARC_SYSTEM_PROMPT, INTERWEAVING_SYSTEM_PROMPT } = require('../sdk-client/subagents');
    for (const text of [CORE_ARC_SYSTEM_PROMPT, INTERWEAVING_SYSTEM_PROMPT]) {
      expect(text).not.toContain('I watched');
      expect(text).not.toContain('I saw');
      expect(text).not.toContain('Nova WAS there');
    }
  });
});
