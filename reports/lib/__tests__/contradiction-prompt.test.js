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
    const section = prompt.slice(prompt.indexOf("### Blake and the Valet in the director's notes"), prompt.indexOf('### Session Roster'));
    expect(section).toContain(DERIVED_LABELS.narrativeTensions);
    // Run 2c (the wording doc's part 4): the weave writer keeps the block, under the new label;
    // run 2e (part 9): the label's first sentence says the Valet is gathered too.
    expect(section).toContain("### Blake and the Valet in the director's notes\nCode gathered these sentences from the director's notes above: every one that mentions Blake, by name or as the Valet. ");
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

  // Directors' notes wrap lines, and a wrapped line stays one stored sentence
  // (contradiction-surfacing.test.js). The notes still hold it word for word, and it prints
  // on one list line. Moved here from the article writer's test in run 2c, when the weave
  // writer became the one reader of directorTensionSentences.
  test('a stored sentence wrapped across lines still matches the notes and prints on one line', () => {
    const prompt = buildWeavePrompt(baseState({
      directorNotes: { rawProse: 'Blake pulled Vic aside at the bar. The Valet read the balances.', transactionReferences: [] },
      narrativeTensions: {
        tensions: [{ type: 'blake-proximity', observations: ['Blake pulled Vic aside\n  at the bar.', 'The Valet read the balances.'] }]
      }
    }));
    const section = prompt.slice(prompt.indexOf("### Blake and the Valet in the director's notes"), prompt.indexOf('### Session Roster'));
    const listed = section.split('\n').filter(line => line.startsWith('- '));
    expect(listed).toEqual(['- Blake pulled Vic aside at the bar.', '- The Valet read the balances.']);
  });

  test('buildWeavePrompt omits tensions section when no tensions', () => {
    const prompt = buildWeavePrompt(baseState({ narrativeTensions: null }));
    expect(prompt).not.toContain('NARRATIVE TENSIONS');
    expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
  });

  // Fix 3.2b: one filter, directorTensionSentences, for the journalist's print site. Phase 18,
  // run 2c (the wording doc's parts 4 and 6): the weave writer is its one reader; the article
  // writer no longer prints <NARRATIVE_TENSIONS>.
  test('the arc writer prints the sentences through the one filter, and the article writer prints none', async () => {
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
    const arcSection = arcPrompt.slice(arcPrompt.indexOf("### Blake and the Valet in the director's notes"), arcPrompt.indexOf('### Session Roster'));
    expect(listed(arcSection)).toEqual(expected);

    const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue({}), validate: jest.fn() };
    const builder = new promptBuilderModule.PromptBuilder(themeLoader, 'journalist', { roster: ['Skyler', 'Alex'] });
    // Brief 4.7b: the article writer writes from the settled weave and the map. Run 2e: the
    // builder takes no argument for the sentences about Blake; the notes carry them.
    const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
    const { WEAVE, MAP } = require('./fixtures/rework-state');
    const { userPrompt } = await builder.buildArticlePrompt(
      renderSettledWeave(WEAVE, null), MAP, [], null, state.directorNotes, { evidenceBundle: state.evidenceBundle }
    );
    expect(userPrompt).not.toContain('NARRATIVE_TENSIONS');
    expect(userPrompt).not.toContain(DERIVED_LABELS.narrativeTensions);

    expect(promptBuilderModule.narrativeTensionSentences).toBeUndefined();
  });
});
