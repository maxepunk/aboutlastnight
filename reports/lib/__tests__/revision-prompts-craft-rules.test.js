/**
 * Revision prompts carry the craft rules and the theme's voice
 * (PROMPT-REVIEW: "revision prompts carry no craft rules")
 *
 * The three revision prompts handed the model the previous output plus the
 * evaluator's feedback and asked for targeted fixes — with none of the voice,
 * evidence-boundary or anti-pattern rules the GENERATOR was given, and with a
 * hardcoded journalist-ish system prompt for both themes. So a revision could
 * quietly undo the generator's compliance while "fixing" one criterion.
 */

const {
  _testing: {
    getOutlineRevisionSystemPrompt,
    getArticleRevisionSystemPrompt,
    buildOutlineRevisionPrompt,
    buildArticleRevisionPrompt
  },
  createMockPromptBuilder
} = require('../workflow/nodes/ai-nodes');

const {
  _testing: { buildArcRevisionPrompt }
} = require('../workflow/nodes/arc-specialist-nodes');

describe('revision system prompts are theme-aware', () => {
  it('journalist keeps Nova as the reviser', () => {
    expect(getArticleRevisionSystemPrompt('journalist')).toContain('Nova');
    expect(getOutlineRevisionSystemPrompt('journalist')).toContain('NovaNews');
  });

  it('detective gets the detective voice, not Nova', () => {
    const system = getArticleRevisionSystemPrompt('detective');
    expect(system).toContain('third-person');
    expect(system).not.toContain('Nova');
  });

  it('detective outline revision gets the case-report framing', () => {
    const system = getOutlineRevisionSystemPrompt('detective');
    expect(system).toContain('case report');
    expect(system).not.toContain('NovaNews');
  });

  it('defaults to journalist when no theme is given', () => {
    expect(getArticleRevisionSystemPrompt()).toContain('Nova');
  });
});

describe('revision user prompts end with a <RULES> block', () => {
  const promptBuilder = createMockPromptBuilder();

  it('article revision appends the loaded revision prompts LAST', async () => {
    const prompt = await buildArticleRevisionPrompt(
      {}, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt).toContain('<RULES>');
    expect(prompt).toContain('Test character voice prompt');
    expect(prompt).toContain('Test evidence boundaries prompt');
    expect(prompt).toContain('Test anti-patterns prompt');
    // LAST: the rules must sit after the context and the previous output.
    expect(prompt.indexOf('<RULES>')).toBeGreaterThan(prompt.indexOf('PREVIOUS-HERE'));
  });

  it('outline revision appends the loaded revision prompts LAST', async () => {
    const prompt = await buildOutlineRevisionPrompt(
      {}, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt).toContain('<RULES>');
    expect(prompt).toContain('Test character voice prompt');
    expect(prompt.indexOf('<RULES>')).toBeGreaterThan(prompt.indexOf('PREVIOUS-HERE'));
  });

  it('article revision carries <DIRECTOR_GUIDANCE> when the director set it', async () => {
    const prompt = await buildArticleRevisionPrompt(
      { _outlineGuidance: 'Lead with the money, not the vote.' },
      'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt).toContain('<DIRECTOR_GUIDANCE>');
    expect(prompt).toContain('Lead with the money, not the vote.');
    // Outranks the craft rules, so it comes after them.
    expect(prompt.indexOf('<DIRECTOR_GUIDANCE>')).toBeGreaterThan(prompt.indexOf('<RULES>'));
  });

  it('omits <DIRECTOR_GUIDANCE> when there is none', async () => {
    const prompt = await buildArticleRevisionPrompt({}, 'c', 'p', promptBuilder);
    expect(prompt).not.toContain('DIRECTOR_GUIDANCE');
  });

  it('keeps the human feedback that lives in the context section', async () => {
    const prompt = await buildArticleRevisionPrompt(
      {}, 'HUMAN FEEDBACK (HIGHEST PRIORITY):\ntighten the lede', 'p', promptBuilder
    );
    expect(prompt).toContain('tighten the lede');
    expect(prompt.indexOf('<RULES>')).toBeGreaterThan(prompt.indexOf('tighten the lede'));
  });
});

describe('arc revision prompt gives the model usable evidence (PROMPT-REVIEW)', () => {
  const STATE = {
    theme: 'journalist',
    canonicalCharacters: { Vic: 'Vic Kingsley', Mel: 'Mel Torres', Quinn: 'Quinn Ash' },
    sessionConfig: { roster: ['Vic', 'Mel'] },
    playerFocus: { accusation: { accused: ['Blake'], charge: 'murder' } },
    directorNotes: { rawProse: 'They circled each other.' },
    evidenceBundle: {
      exposed: {
        tokens: [{ id: 'vic001', owner: 'Vic Kingsley', summary: 'A ledger page in the study' }],
        paperEvidence: [{ id: 'paper-1', name: 'Cease and desist', summary: 'Legal threat to Marcus' }]
      },
      buried: { transactions: [] }
    }
  };

  it('describes each exposed item as id, owner and summary, not a bare ID', () => {
    const prompt = buildArcRevisionPrompt(STATE, 'ctx', 'prev');
    // The reviser was previously shown ONLY `["vic001","paper-1"]` and told to fix
    // its keyEvidence — with no way to know what any ID referred to.
    expect(prompt).toContain('vic001');
    expect(prompt).toContain('Vic Kingsley');
    expect(prompt).toContain('A ledger page in the study');
    expect(prompt).toContain('paper-1');
    expect(prompt).toContain('Cease and desist');
  });

  it('re-includes the three-category character block the generation prompt has', () => {
    const prompt = buildArcRevisionPrompt(STATE, 'ctx', 'prev');
    expect(prompt).toContain('Character Categories for characterPlacements');
    expect(prompt).toContain('ROSTER PCs');
    expect(prompt).toContain('NPCs');
    expect(prompt).toContain('NON-ROSTER PCs');
    // Quinn is a real game character who did not play this session.
    expect(prompt).toContain('Quinn');
    // Marcus/Nova are NPCs for the journalist theme.
    expect(prompt).toContain('Marcus');
  });
});
