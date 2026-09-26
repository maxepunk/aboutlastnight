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
    expect(prompt).toContain('09:40 PM $450,000');
    expect(prompt).not.toContain('tay004'); // a buried memory's id never reaches a writer
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

/**
 * Brief 2.1 — the arc writer and the interweaving call read the record view.
 *
 * The arc writer used to read Haiku's summary of each memory's name and the first
 * 200 characters of each paper document. SECTION 3's exposed items are now the
 * record view's documents, in full; its buried transactions stay as they were (R2),
 * so they appear once.
 */
describe('arc prompts carry the record view (brief 2.1)', () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');
  const { buildValidEvidenceIds } = require('../workflow/nodes/node-helpers');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');

  const LONG_PAPER = 'Paternity test result. ' + 'The probability of paternity is 99.9 percent. '.repeat(10);
  const MEMORY_TEXT = 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Worth it. Finally worth it.';
  const evidenceBundle = {
    exposed: {
      tokens: [{
        id: 'ale003', sourceType: 'memory-token', owner: 'Derived Guess',
        summary: 'Haiku summary of the name', characterRefs: ['Marcus'],
        fullContent: MEMORY_TEXT, content: MEMORY_TEXT, temporalContext: 'PARTY',
        rawData: { tokenId: 'ale003', name: 'ALE003 - Alex fight', fullDescription: MEMORY_TEXT, owners: ['Alex Reeves'] }
      }],
      paperEvidence: [
        { notionId: 'p-dna', name: 'DNA test', basicType: 'Document', description: LONG_PAPER,
          owners: ['Sarah Blackwood'], id: 'p-dna', fullContent: LONG_PAPER, sourceType: 'paper-evidence' },
        // A rescued item: the raw record, no id, no fullContent.
        { notionId: 'p-rescued', name: 'Rescued letter', basicType: 'Prop',
          description: 'Dear Marcus, I know what you did.', owners: [], rescuedByHuman: true }
      ]
    },
    buried: {
      transactions: [{ sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' }]
    }
  };
  const state = {
    sessionConfig: { roster: ['Alex'] },
    playerFocus: { accusation: { accused: ['Alex'], charge: 'Murder' }, whiteboardContext: {} },
    directorNotes: { rawProse: 'Alex argued with Sarah.' },
    evidenceBundle,
    theme: 'journalist',
    canonicalCharacters: {}
  };
  const count = (haystack, needle) => haystack.split(needle).length - 1;

  it('SECTION 3 holds every exposed document in full, once, labelled from the record', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    const section3 = prompt.slice(prompt.indexOf('## SECTION 3'), prompt.indexOf('## SECTION 4:'));
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(section3).toContain('<RECORD>');
    expect(count(prompt, MEMORY_TEXT)).toBe(1);
    expect(count(prompt, LONG_PAPER.trim())).toBe(1);   // past the old 200-character cut
    expect(section3).toContain('<document id="ale003" kind="memory" name="ALE003 - Alex fight" owner="Alex Reeves" layer="exposed">');
    expect(section3).toContain('<document id="p-rescued" kind="Prop" name="Rescued letter" layer="exposed">');
    // The summaries of names no longer stand in for a document.
    expect(prompt).not.toContain('Haiku summary of the name');
    expect(prompt).not.toContain('Derived Guess');
    expect(section3).toContain('### Exposed Documents (1 memories - Layer 1, PARTY MEMORIES; 2 paper documents - Layer 1, PARTY CONTEXT)');
  });

  it('keeps SECTION 3\'s buried transactions as they were, so they appear once (R2)', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('### Buried Transactions (1 items - Layer 2, INVESTIGATION ACTIONS)');
    expect(prompt).toContain('"shellAccount": "Melanie"');
    expect(prompt).not.toContain('<buried-transactions>');
    expect(count(prompt, 'Melanie')).toBe(1);
  });

  it('names a rescued document by the id the view gives it, in the id list and the arc check', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    const idList = prompt.slice(prompt.indexOf('### All Valid Evidence IDs'), prompt.indexOf('CRITICAL: keyEvidence'));
    expect(idList).toContain('"p-rescued"');
    expect(idList).not.toContain('"Rescued letter"');
    expect(buildValidEvidenceIds(evidenceBundle).has('p-rescued')).toBe(true);
  });

  it('labels the character context as a model\'s extraction that the record overrules', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt({
      ...state,
      characterData: { characters: { Alex: { groups: ['Stanford Four'], relationships: {}, role: 'CEO' } } }
    });
    expect(prompt).toContain(`### Character Context (${DERIVED_LABELS.characterContext})`);
    expect(prompt).not.toContain('use for accuracy');
    expect(prompt).not.toContain('as ground truth');
  });

  it('the interweaving call holds the whole view once: documents and buried transactions', () => {
    const arcs = [{ id: 'arc-1', title: 'T', summary: 'S', arcSource: 'accusation', characterPlacements: {} }];
    const prompt = arcModule._testing.buildInterweavingPrompt(arcs, ['Alex'], evidenceBundle);
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(count(prompt, MEMORY_TEXT)).toBe(1);
    expect(count(prompt, LONG_PAPER.trim())).toBe(1);
    expect(prompt).toContain('- account: Melanie | amount: $75,000 | time: 07:50 PM');
    expect(prompt.indexOf('</RECORD>')).toBeLessThan(prompt.indexOf('## YOUR TASK'));
  });

  it('enrichWithInterweaving hands the bundle to the prompt', async () => {
    const sdk = jest.fn().mockResolvedValue({ arcInterweaving: [], interweavingPlan: {} });
    const arcs = [{ id: 'arc-1', title: 'T', summary: 'S', arcSource: 'accusation', characterPlacements: {} }];
    await arcModule._testing.enrichWithInterweaving(arcs, ['Alex'], { configurable: { sdkClient: sdk } }, {}, evidenceBundle);
    expect(sdk.mock.calls[0][0].prompt).toContain(MEMORY_TEXT);
  });
});
