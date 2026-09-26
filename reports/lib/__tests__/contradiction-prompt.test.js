jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

describe('contradiction data in arc prompt', () => {
  test('buildCoreArcPrompt includes narrative tensions when present', () => {
    const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
    const buildCoreArcPrompt = _testing.buildCoreArcPrompt;

    const state = {
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [] }
      },
      playerFocus: {
        accusation: { accused: ['Marcus'], charge: 'fraud' },
        whiteboardContext: { suspectsExplored: [], connections: [], notes: [], namesFound: [] },
        directorObservations: { behaviorPatterns: [], suspiciousCorrelations: [], notableMoments: [] },
        primaryInvestigation: 'fraud'
      },
      sessionConfig: { roster: ['Skyler', 'Alex'] },
      directorNotes: { rawProse: '', transactionReferences: [] },
      theme: 'journalist',
      narrativeTensions: {
        tensions: [
          {
            type: 'transparency-vs-burial',
            character: 'Skyler',
            narrativeNote: 'Skyler publicly demonstrated transparency while maintaining a $155,000 burial account.'
          }
        ]
      }
    };

    const prompt = buildCoreArcPrompt(state);
    expect(prompt).toContain('NARRATIVE TENSIONS');
    expect(prompt).toContain('transparency-vs-burial');
    expect(prompt).toContain('$155,000');
  });

  test('labels the tensions as code-made leads the record overrules, not as verified (brief 2.1)', () => {
    const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
    const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
    const prompt = _testing.buildCoreArcPrompt({
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
      playerFocus: { accusation: { accused: ['Marcus'] }, whiteboardContext: {} },
      sessionConfig: { roster: ['Skyler'] },
      directorNotes: { rawProse: '' },
      theme: 'journalist',
      narrativeTensions: { tensions: [{ type: 'named-account', narrativeNote: 'Skyler used their own name.' }] }
    });
    const section = prompt.slice(prompt.indexOf('## SECTION 4.6'), prompt.indexOf('## SECTION 5'));
    expect(section).toContain(DERIVED_LABELS.narrativeTensions);
    expect(section).toContain('- [named-account] Skyler used their own name.');
    expect(section).not.toMatch(/verified to respect|evidence-boundary compliant/);
  });

  test('buildCoreArcPrompt omits tensions section when no tensions', () => {
    const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
    const buildCoreArcPrompt = _testing.buildCoreArcPrompt;

    const state = {
      evidenceBundle: {
        exposed: { tokens: [], paperEvidence: [] },
        buried: { transactions: [] }
      },
      playerFocus: {
        accusation: { accused: ['Marcus'], charge: 'fraud' },
        whiteboardContext: { suspectsExplored: [], connections: [], notes: [], namesFound: [] },
        directorObservations: { behaviorPatterns: [], suspiciousCorrelations: [], notableMoments: [] },
        primaryInvestigation: 'fraud'
      },
      sessionConfig: { roster: ['Skyler'] },
      directorNotes: { rawProse: '', transactionReferences: [] },
      theme: 'journalist',
      narrativeTensions: null
    };

    const prompt = buildCoreArcPrompt(state);
    expect(prompt).not.toContain('NARRATIVE TENSIONS');
  });
});
