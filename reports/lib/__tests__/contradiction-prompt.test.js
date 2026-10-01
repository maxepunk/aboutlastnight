jest.mock('../llm', () => ({
  sdkQuery: jest.fn(),
  createProgressLogger: () => jest.fn()
}));
jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() }
}));

/**
 * The narrative tensions in the arc writer's prompt.
 *
 * Since phase 3 (3.6) the code stores one tension, `blake-proximity`, whose
 * `observations` are the director's sentences naming Blake or the Valet. Phase 3 (3.3):
 * the journalist arc writer prints those sentences, word for word, under the label
 * that calls them the director's own, and drops the tensions an older thread stored
 * that read an account's name as its holder (T4). The detective keeps today's section.
 */
describe('contradiction data in arc prompt', () => {
  const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const buildCoreArcPrompt = _testing.buildCoreArcPrompt;

  const BLAKE_SENTENCE = 'Blake pulled Skyler aside twice before the vote.';
  const baseState = (overrides = {}) => ({
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
    directorNotes: { rawProse: `Skyler argued with Alex. ${BLAKE_SENTENCE}`, transactionReferences: [] },
    theme: 'journalist',
    ...overrides
  });
  const STORED = {
    tensions: [
      {
        type: 'transparency-vs-burial',
        character: 'Skyler',
        narrativeNote: 'Skyler publicly demonstrated transparency while maintaining a $155,000 burial account.'
      },
      { type: 'named-account', narrativeNote: 'Skyler used their own name.' },
      { type: 'blake-proximity', observations: [BLAKE_SENTENCE], narrativeNote: 'Director observed multiple characters interacting with Blake' }
    ]
  };

  test("the journalist writer prints the director's sentences about Blake under their label, and drops the retired types", () => {
    const prompt = buildCoreArcPrompt(baseState({ narrativeTensions: STORED }));
    const section = prompt.slice(prompt.indexOf("### Blake and the Valet in the director's notes"), prompt.indexOf('### Primary Investigation Focus'));
    expect(section).toContain(DERIVED_LABELS.narrativeTensions);
    expect(section).toContain(`- ${BLAKE_SENTENCE}`);
    expect(prompt).not.toContain('transparency-vs-burial');
    expect(prompt).not.toContain('$155,000');
    expect(prompt).not.toContain('used their own name');
    expect(prompt).not.toContain('Director observed multiple characters');
    expect(section).not.toMatch(/verified to respect|evidence-boundary compliant|Black Market/);
  });

  test("a stored sentence the notes do not hold word for word is not printed as the director's", () => {
    const prompt = buildCoreArcPrompt(baseState({
      narrativeTensions: { tensions: [{ type: 'blake-proximity', observations: ['Blake paid Alex.'] }] }
    }));
    expect(prompt).not.toContain('Blake paid Alex.');
    expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
  });

  test("the detective writer keeps today's tensions section (D13)", () => {
    const prompt = buildCoreArcPrompt(baseState({ theme: 'detective', narrativeTensions: STORED }));
    const section = prompt.slice(prompt.indexOf('## SECTION 4.6'), prompt.indexOf('## SECTION 5'));
    expect(section).toContain(DERIVED_LABELS.narrativeTensions);
    expect(section).toContain('- [named-account] Skyler used their own name.');
    expect(section).toContain('$155,000');
  });

  test('buildCoreArcPrompt omits tensions section when no tensions', () => {
    for (const theme of ['journalist', 'detective']) {
      const prompt = buildCoreArcPrompt(baseState({ theme, narrativeTensions: null }));
      expect(prompt).not.toContain('NARRATIVE TENSIONS');
      expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
    }
  });
});
