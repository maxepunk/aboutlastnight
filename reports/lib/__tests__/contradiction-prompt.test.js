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
 *
 * Phase 4 (brief 4.4): the arc writer writes the weave and prints the same section; the
 * arc stage's detective branch went (R1).
 */
describe('contradiction data in arc prompt', () => {
  const { _testing } = require('../workflow/nodes/arc-specialist-nodes');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const buildWeavePrompt = _testing.buildWeavePrompt;

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
    const prompt = buildWeavePrompt(baseState({ narrativeTensions: STORED }));
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
    const prompt = buildWeavePrompt(baseState({
      narrativeTensions: { tensions: [{ type: 'blake-proximity', observations: ['Blake paid Alex.'] }] }
    }));
    expect(prompt).not.toContain('Blake paid Alex.');
    expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
  });

  test('buildWeavePrompt omits tensions section when no tensions', () => {
    const prompt = buildWeavePrompt(baseState({ narrativeTensions: null }));
    expect(prompt).not.toContain('NARRATIVE TENSIONS');
    expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
  });

  // Fix 3.2b: one filter, directorTensionSentences, for both journalist print sites.
  // Given the same stored tensions and notes, the arc writer's Blake section and the
  // article writer's <NARRATIVE_TENSIONS> list the same sentences, in the same order.
  test('the arc writer and the article writer print the same sentences, through one filter', async () => {
    const { directorTensionSentences } = require('../prompt-renderers/director-notes-renderer');
    const promptBuilderModule = require('../prompt-builder');
    const OTHER = 'The Valet counted the cash at the door.';
    const state = baseState({
      directorNotes: { rawProse: `${BLAKE_SENTENCE} Skyler left early. ${OTHER}`, transactionReferences: [] },
      narrativeTensions: {
        tensions: [
          ...STORED.tensions,
          { type: 'blake-proximity', observations: ['Blake paid Alex.', OTHER, BLAKE_SENTENCE] }
        ]
      }
    });
    const expected = directorTensionSentences(state.narrativeTensions, state.directorNotes.rawProse);
    expect(expected).toEqual([BLAKE_SENTENCE, OTHER]);
    const listed = (text) => text.split('\n').filter(line => line.startsWith('- ')).map(line => line.slice(2));

    const arcPrompt = buildWeavePrompt(state);
    const arcSection = arcPrompt.slice(arcPrompt.indexOf("### Blake and the Valet in the director's notes"), arcPrompt.indexOf('### Primary Investigation Focus'));
    expect(listed(arcSection)).toEqual(expected);

    const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue({}), validate: jest.fn() };
    const builder = new promptBuilderModule.PromptBuilder(themeLoader, 'journalist', { roster: ['Skyler', 'Alex'] });
    const { userPrompt } = await builder.buildArticlePrompt(
      {}, [], null, [], null, state.directorNotes, state.narrativeTensions, { evidenceBundle: state.evidenceBundle }
    );
    const articleBlock = userPrompt.slice(userPrompt.indexOf('<NARRATIVE_TENSIONS>'), userPrompt.indexOf('</NARRATIVE_TENSIONS>'));
    expect(listed(articleBlock)).toEqual(expected);

    expect(promptBuilderModule.narrativeTensionSentences).toBeUndefined();
  });
});
