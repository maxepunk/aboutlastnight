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
  _testing: { buildArcRevisionPrompt, getArcRevisionSystemPrompt }
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

describe('no rework system prompt tells the writer to preserve a high-scoring criterion', () => {
  // Brief 1.3: the >=80% preserve instruction is gone from the rework USER
  // prompt; it survived in the system prompts, so a rework whose criteria all
  // scored above 0.8 was still told to change nothing.
  it('the outline rework system prompt carries no 80% rule, either theme', () => {
    for (const theme of ['journalist', 'detective']) {
      expect(getOutlineRevisionSystemPrompt(theme)).not.toContain('80%');
    }
  });

  it('the evaluator-driven arc rework system prompt carries no 80% rule', () => {
    expect(getArcRevisionSystemPrompt(false)).not.toContain('80%');
  });

  it('both lists stay consecutively numbered after the removal', () => {
    const numbered = (text) => text
      .split('\n')
      .map((line) => line.match(/^(\d+)\. /))
      .filter(Boolean)
      .map((match) => Number(match[1]));

    expect(numbered(getOutlineRevisionSystemPrompt('journalist'))).toEqual([1, 2, 3, 4, 5]);
    expect(numbered(getArcRevisionSystemPrompt(false))).toEqual([1, 2, 3, 4, 5]);
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

describe('buildRevisionRulesSection — the REAL PromptBuilder over the REAL ThemeLoader', () => {
  // The suite above composes prompts with createMockPromptBuilder(), whose
  // buildRevisionRulesSection is a SECOND implementation that hardcodes the three
  // filenames. That left the production method — the one the pipeline actually
  // calls — with no test at all.
  const { PromptBuilder, createPromptBuilder } = require('../prompt-builder');
  const { createThemeLoader, PHASE_REQUIREMENTS } = require('../theme-loader');

  ['journalist', 'detective'].forEach((theme) => {
    it(`${theme}: wraps the real content of all three revision prompts in <RULES>`, async () => {
      const builder = createPromptBuilder({ theme });
      const section = await builder.buildRevisionRulesSection();

      expect(section.startsWith('<RULES>')).toBe(true);
      expect(section.trim().endsWith('</RULES>')).toBe(true);

      const loader = createThemeLoader({ theme });
      for (const name of PHASE_REQUIREMENTS.revision) {
        const content = await loader.loadPrompt(name);
        expect(content.length).toBeGreaterThan(50);      // the file really exists
        expect(section).toContain(`<${name}>`);
        // The whole file's text, with {{VARIABLES}} resolved the way the
        // production method resolves them.
        expect(section).toContain(builder.resolvePromptVariables(content).trim());
      }
    });
  });

  it('resolves {{JOURNALIST_FIRST_NAME}} from the session config', async () => {
    const builder = createPromptBuilder({
      theme: 'journalist',
      sessionConfig: { journalistFirstName: 'Wilhelmina' }
    });
    const section = await builder.buildRevisionRulesSection();
    expect(section).not.toContain('{{JOURNALIST_FIRST_NAME}}');
    expect(section).toContain('Wilhelmina');
  });

  it('FAILS LOUD when a revision prompt file is missing', async () => {
    // ThemeLoader.loadPrompt warns and returns '' for a missing file, so without
    // this guard the reviser would silently run with no craft rules at all —
    // exactly the unguarded regeneration this phase is meant to prevent.
    const builder = new PromptBuilder(
      createThemeLoader({ theme: 'journalist', customPath: '/definitely/not/a/skill' }),
      'journalist'
    );
    await expect(builder.buildRevisionRulesSection()).rejects.toThrow(/revision prompt/i);
  });
});

describe('a missing revision prompt becomes the node error contract, not a graph rejection', () => {
  // buildRevisionRulesSection throws on a missing prompt file (round 1). Both
  // node call sites awaited the prompt builder ABOVE their try, so the throw
  // escaped as a graph-level rejection: the node's
  // { errors: [...], currentPhase: PHASES.ERROR } return is what clears the
  // _previous* scratch and leaves the run resumable.
  const { reviseOutline, reviseContentBundle } = require('../workflow/nodes/ai-nodes');
  const { PHASES } = require('../workflow/state');
  const { createThemeLoader } = require('../theme-loader');
  const { PromptBuilder } = require('../prompt-builder');

  /** A PromptBuilder whose revision prompts cannot be read. */
  const brokenBuilder = () => new PromptBuilder(
    createThemeLoader({ theme: 'journalist', customPath: '/definitely/not/a/skill' }),
    'journalist'
  );

  const config = () => ({
    configurable: {
      sdkClient: jest.fn(),                 // must never be reached
      promptBuilder: brokenBuilder(),
      theme: 'journalist'
    }
  });

  it('reviseOutline returns the error contract', async () => {
    const cfg = config();
    const result = await reviseOutline(
      { _previousOutline: { lede: {} }, outlineRevisionCount: 1, validationResults: null },
      cfg
    );

    expect(result.currentPhase).toBe(PHASES.ERROR);
    expect(result.outline).toBeNull();
    expect(result._previousOutline).toBeNull();
    expect(result._outlineFeedback).toBeNull();
    expect(result.errors[0].type).toBe('outline-revision-failed');
    expect(result.errors[0].message).toMatch(/revision prompt/i);
    expect(cfg.configurable.sdkClient).not.toHaveBeenCalled();
  });

  it('reviseContentBundle returns the error contract', async () => {
    const cfg = config();
    const result = await reviseContentBundle(
      { _previousContentBundle: { sections: [] }, articleRevisionCount: 1, validationResults: null },
      cfg
    );

    expect(result.currentPhase).toBe(PHASES.ERROR);
    expect(result.contentBundle).toBeNull();
    expect(result._previousContentBundle).toBeNull();
    expect(result._articleFeedback).toBeNull();
    expect(result.errors[0].type).toBe('article-revision-failed');
    expect(result.errors[0].message).toMatch(/revision prompt/i);
    expect(cfg.configurable.sdkClient).not.toHaveBeenCalled();
  });
});
