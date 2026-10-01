/**
 * Revision prompts carry the craft rules and the theme's voice
 * (PROMPT-REVIEW: "revision prompts carry no craft rules")
 *
 * The three revision prompts handed the model the previous output plus the
 * evaluator's feedback and asked for targeted fixes — with none of the voice,
 * evidence-boundary or anti-pattern rules the GENERATOR was given, and with a
 * hardcoded journalist-ish system prompt for both themes. So a revision could
 * quietly undo the generator's compliance while "fixing" one criterion.
 *
 * Phase 2 (2.3): the fix that followed gave the outline and article reworkers a
 * three-file <RULES> set of their own. Each reworker is now its writer's prompt,
 * built by the writer's own builders, plus the revision block, so it carries the
 * writer's rules themselves. reworker-writer-parity.test.js pins that against the
 * real builders; this file covers the rework rules, the order of the parts, and the
 * fail-loud check on the writer's craft files.
 */

const {
  _testing: {
    getOutlineRevisionSystemPrompt,
    getArticleRevisionSystemPrompt,
    buildOutlineRevisionSystemPrompt,
    buildArticleRevisionSystemPrompt,
    buildOutlineRevisionPrompt,
    buildArticleRevisionPrompt,
    OUTLINE_REVISION_RULES,
    articleRevisionRules
  },
  createMockPromptBuilder
} = require('../workflow/nodes/ai-nodes');

const {
  _testing: { buildArcRevisionPrompt, getArcRevisionSystemPrompt, ARC_REVISION_RULES }
} = require('../workflow/nodes/arc-specialist-nodes');

const { createPromptBuilder } = require('../prompt-builder');

describe('revision system prompts are theme-aware', () => {
  it('journalist keeps Nova as the reviser', async () => {
    expect(articleRevisionRules('journalist')).toContain('Nova');
    const outline = await buildOutlineRevisionSystemPrompt(createPromptBuilder({ theme: 'journalist' }));
    expect(outline).toContain('NovaNews');
  });

  it('detective gets the detective voice, not Nova', async () => {
    const rules = articleRevisionRules('detective');
    expect(rules).toContain('third-person');
    expect(rules).not.toContain('Nova');
    const system = await buildArticleRevisionSystemPrompt(createPromptBuilder({ theme: 'detective' }), 'detective');
    expect(system).toContain('third-person');
    expect(system).not.toContain('Nova');
  });

  it('detective outline revision gets the case-report framing', async () => {
    const system = await buildOutlineRevisionSystemPrompt(createPromptBuilder({ theme: 'detective' }));
    expect(system).toContain('case report');
    expect(system).not.toContain('NovaNews');
  });

  it('defaults to journalist when no theme is given', () => {
    expect(articleRevisionRules()).toContain('Nova');
  });

  it("the rework composers take the writer's system prompt and fail loud on a theme name", () => {
    // They used to take a theme; an old call would now open the prompt with the
    // word "journalist". A reworker is its writer's prompt plus the rework rules.
    expect(() => getOutlineRevisionSystemPrompt('journalist')).toThrow(/writer's system prompt/);
    expect(() => getArticleRevisionSystemPrompt('detective')).toThrow(/writer's system prompt/);
    expect(getOutlineRevisionSystemPrompt('W1\nW2')).toBe(`W1\nW2\n\n${OUTLINE_REVISION_RULES}`);
    expect(getArticleRevisionSystemPrompt('W1\nW2', 'detective')).toBe(`W1\nW2\n\n${articleRevisionRules('detective')}`);
  });
});

describe('no rework system prompt tells the writer to preserve a high-scoring criterion', () => {
  // Brief 1.3: the >=80% preserve instruction is gone from the rework USER
  // prompt; it survived in the system prompts, so a rework whose criteria all
  // scored above 0.8 was still told to change nothing. Since 2.3 each rework
  // system prompt opens with its writer's, whose craft files use "80%" for evidence
  // weighting (not this rule), so these read the rework rules added after it.
  it('the outline rework rules carry no 80% rule', () => {
    expect(OUTLINE_REVISION_RULES).not.toContain('80%');
  });

  it('the evaluator-driven arc rework system prompt carries no 80% rule', () => {
    expect(ARC_REVISION_RULES.evaluator).not.toContain('80%');
    expect(getArcRevisionSystemPrompt(false)).not.toContain('80%');
  });

  it('the article rework rules carry the rule in no wording, either theme', () => {
    // Integrator ruling after wave 1: the same rule lived here as "High-scoring
    // criteria (0.8+) should be left unchanged", on the reworker that turned the
    // director's rethink into a relabel on 091826.
    for (const theme of ['journalist', 'detective']) {
      const text = articleRevisionRules(theme);
      expect(text).not.toContain('80%');
      expect(text).not.toContain('0.8+');
      expect(text).not.toContain('score well');
    }
  });

  it('both lists stay consecutively numbered after the removal (the detective\'s; the journalist\'s have none since phase 3)', () => {
    const { _testing: { outlineRevisionRules } } = require('../workflow/nodes/ai-nodes');
    const { _testing: { arcRevisionRules } } = require('../workflow/nodes/arc-specialist-nodes');
    const numbered = (text) => text
      .split('\n')
      .map((line) => line.match(/^(\d+)\. /))
      .filter(Boolean)
      .map((match) => Number(match[1]));

    expect(numbered(outlineRevisionRules('detective'))).toEqual([1, 2, 3, 4, 5]);
    expect(numbered(arcRevisionRules(false, 'detective'))).toEqual([1, 2, 3, 4, 5]);
    expect(numbered(OUTLINE_REVISION_RULES)).toEqual([]);
    expect(numbered(ARC_REVISION_RULES.evaluator)).toEqual([]);
  });
});

/**
 * Phase 2 (2.3): the order of the parts, with the mock builder. The writer's
 * sections come first, then the revision block, then <DIRECTOR_GUIDANCE> last. The
 * three-file <RULES> set and the reworker's own copy of the schema are gone: the
 * writer's rules and the writer's <SCHEMA> are in its sections.
 */
describe("revision user prompts: the writer's sections, then the revision block", () => {
  const promptBuilder = createMockPromptBuilder();

  it("article revision opens with the writer's sections and keeps the context before the previous output", async () => {
    const prompt = await buildArticleRevisionPrompt(
      { outline: { lede: {} } }, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt.startsWith('Generate article from outline with 1 sections')).toBe(true);
    expect(prompt.indexOf('CONTEXT-HERE')).toBeGreaterThan(0);
    expect(prompt.indexOf('PREVIOUS-HERE')).toBeGreaterThan(prompt.indexOf('CONTEXT-HERE'));
    expect(prompt).not.toContain('<RULES>');
    expect(prompt).not.toContain('## OUTPUT SCHEMA');
  });

  it("outline revision opens with the writer's sections and keeps the context before the previous output", async () => {
    const prompt = await buildOutlineRevisionPrompt(
      { selectedArcs: ['arc-a'] }, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt.startsWith('Generate outline for arcs: arc-a')).toBe(true);
    expect(prompt.indexOf('PREVIOUS-HERE')).toBeGreaterThan(prompt.indexOf('CONTEXT-HERE'));
    expect(prompt).not.toContain('<RULES>');
    expect(prompt).not.toContain('SESSION CONTEXT');
  });

  it('article revision carries <DIRECTOR_GUIDANCE> when the director set it, last', async () => {
    const prompt = await buildArticleRevisionPrompt(
      { _outlineGuidance: 'Lead with the money, not the vote.' },
      'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt).toContain('<DIRECTOR_GUIDANCE>');
    expect(prompt).toContain('Lead with the money, not the vote.');
    expect(prompt.indexOf('<DIRECTOR_GUIDANCE>')).toBeGreaterThan(prompt.indexOf('PREVIOUS-HERE'));
    expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it('omits <DIRECTOR_GUIDANCE> when there is none', async () => {
    const prompt = await buildArticleRevisionPrompt({}, 'c', 'p', promptBuilder);
    expect(prompt).not.toContain('DIRECTOR_GUIDANCE');
  });

  it("keeps the human feedback that lives in the context section, after the writer's sections", async () => {
    const prompt = await buildArticleRevisionPrompt(
      {}, 'HUMAN FEEDBACK (HIGHEST PRIORITY):\ntighten the lede', 'p', promptBuilder
    );
    expect(prompt).toContain('tighten the lede');
    expect(prompt.indexOf('tighten the lede')).toBeGreaterThan(prompt.indexOf('Generate article from outline'));
  });
});

describe('arc revision prompt gives the model the record (PROMPT-REVIEW; brief 2.3)', () => {
  const MEMORY_TEXT = 'VIC.1 - 10:02PM - A ledger page in the study, every figure initialled.';
  const PAPER_TEXT = 'Cease and desist. Marcus Blackwood is ordered to stop using the BizAI name.';
  const STATE = {
    theme: 'journalist',
    canonicalCharacters: { Vic: 'Vic Kingsley', Mel: 'Mel Torres', Quinn: 'Quinn Ash' },
    sessionConfig: { roster: ['Vic', 'Mel'] },
    playerFocus: { accusation: { accused: ['Blake'], charge: 'murder' } },
    directorNotes: { rawProse: 'They circled each other.' },
    evidenceBundle: {
      exposed: {
        tokens: [{
          id: 'vic001', owner: 'Vic Kingsley', summary: 'A summary of the name only',
          rawData: { tokenId: 'vic001', name: 'VIC001 - The ledger', fullDescription: MEMORY_TEXT, owners: ['Vic Kingsley'] }
        }],
        paperEvidence: [{ id: 'paper-1', name: 'Cease and desist', basicType: 'Document', description: PAPER_TEXT }]
      },
      buried: { transactions: [] }
    }
  };

  it("carries each exposed document in full, labelled, and the writer's list of valid ids", () => {
    const prompt = buildArcRevisionPrompt(STATE, 'ctx', 'prev');
    // The reviser was once shown ONLY `["vic001","paper-1"]` and told to fix its
    // keyEvidence; then an id, an owner and a summary of the name. It now reads the
    // documents themselves, as the writer does, and the ids follow the writer's rule.
    expect(prompt).toContain('<document id="vic001" kind="memory" name="VIC001 - The ledger" owner="Vic Kingsley" layer="exposed">');
    expect(prompt).toContain(MEMORY_TEXT);
    expect(prompt).toContain('<document id="paper-1" kind="Document" name="Cease and desist" layer="exposed">');
    expect(prompt).toContain(PAPER_TEXT);
    expect(prompt).toContain('### All Valid Evidence IDs for keyEvidence (EXPOSED LAYER 1 ONLY)\n["vic001","paper-1"]');
    expect(prompt).not.toContain('A summary of the name only');
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

describe('requirePhasePrompts — the REAL PromptBuilder over the REAL ThemeLoader', () => {
  // ThemeLoader.loadPrompt warns and returns '' for a missing file. A reworker built
  // on that would run without the craft rules its writer had, invisibly. The
  // reworkers check their writer's phase before building (brief 2.3); until then
  // they checked a smaller 'revision' set, which no longer exists.
  const { PromptBuilder } = require('../prompt-builder');
  const { createThemeLoader, PHASE_REQUIREMENTS } = require('../theme-loader');

  ['journalist', 'detective'].forEach((theme) => {
    it(`${theme}: both writers' craft files load`, async () => {
      const builder = createPromptBuilder({ theme });
      await expect(builder.requirePhasePrompts('outlineGeneration')).resolves.toBeUndefined();
      await expect(builder.requirePhasePrompts('articleGeneration')).resolves.toBeUndefined();
    });
  });

  it('has no revision phase to check any more', () => {
    expect(PHASE_REQUIREMENTS.journalist.revision).toBeUndefined();
    expect(PHASE_REQUIREMENTS.detective.revision).toBeUndefined();
  });

  it('FAILS LOUD, naming the phase and the files, when a detective craft file is missing', async () => {
    const builder = new PromptBuilder(
      createThemeLoader({ theme: 'detective', customPath: '/definitely/not/a/skill' }),
      'detective'
    );
    await expect(builder.requirePhasePrompts('outlineGeneration'))
      .rejects.toThrow(/Missing outlineGeneration prompts for theme "detective": section-rules, editorial-design/);
    await expect(builder.requirePhasePrompts('articleGeneration'))
      .rejects.toThrow(/Missing articleGeneration prompts/);
  });

  // Phase 3 (3.2): the journalist's writers read the rule set, so its check is the
  // rule-set loader's, which names every missing rule file.
  it('FAILS LOUD, naming the call and the files, when a journalist rule file is missing', async () => {
    const os = require('os');
    const path = require('path');
    const fs = require('fs');
    const { setDefaultRulesRoot } = require('../rule-set');
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-rules-'));
    const builder = createPromptBuilder({ theme: 'journalist' });
    setDefaultRulesRoot(empty);
    try {
      await expect(builder.requirePhasePrompts('outlineGeneration'))
        .rejects.toThrow(/Missing or empty rule files for call "outline": world\.md, truth-rules\.md/);
      await expect(builder.requirePhasePrompts('articleGeneration'))
        .rejects.toThrow(/Missing or empty rule files for call "article"/);
    } finally {
      setDefaultRulesRoot(null);
      fs.rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('a missing craft file becomes the node error contract, not a graph rejection', () => {
  // The reworkers' craft-file check throws. Both node call sites build the prompt
  // INSIDE their try: the node's { errors: [...], currentPhase: PHASES.ERROR }
  // return is what clears the _previous* scratch and leaves the run resumable.
  const { reviseOutline, reviseContentBundle } = require('../workflow/nodes/ai-nodes');
  const { PHASES } = require('../workflow/state');
  const { createPromptBuilder } = require('../prompt-builder');
  const { setDefaultRulesRoot } = require('../rule-set');
  const os = require('os');
  const path = require('path');
  const fs = require('fs');

  // Phase 3 (3.2): the journalist's writers read the rule set, so a builder whose
  // rule files cannot be read is one whose rule root is an empty folder.
  let empty;
  beforeEach(() => {
    empty = fs.mkdtempSync(path.join(os.tmpdir(), 'no-rules-'));
    setDefaultRulesRoot(empty);
  });
  afterEach(() => {
    setDefaultRulesRoot(null);
    fs.rmSync(empty, { recursive: true, force: true });
  });

  /** A PromptBuilder whose rule files cannot be read. */
  const brokenBuilder = () => createPromptBuilder({ theme: 'journalist' });

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
    expect(result.errors[0].message).toMatch(/Missing or empty rule files for call "outline"/);
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
    expect(result.errors[0].message).toMatch(/Missing or empty rule files for call "article"/);
    expect(cfg.configurable.sdkClient).not.toHaveBeenCalled();
  });
});

describe('a prompt build that throws becomes the node error contract, for the judges and the arc reworker (final fix wave)', () => {
  // The evaluator and reviseArcs built their prompts BEFORE their try. Since 2.4 the
  // judge's build creates a PromptBuilder and ThemeLoader and calls
  // outlineWriterInputs / reworkHeroImage, and the arc rework prompt carries a
  // deliberate throw (buildArcReworkOutputAddendum), so a throw there bypassed the
  // swallow-into-state contract and rejected the graph.
  const { evaluateArcs, evaluateOutline, evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
  const { reviseArcs, _testing: { PLAYER_FOCUS_GUIDED_SCHEMA } } = require('../workflow/nodes/arc-specialist-nodes');
  const { PHASES, REVISION_CAPS } = require('../workflow/state');
  const { PromptBuilder } = require('../prompt-builder');
  const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { PromptBuilder.prototype._rosterSection.mockRestore?.(); });
  afterAll(() => jest.restoreAllMocks());

  it.each([
    ['arcs', evaluateArcs, (s) => ({ ...s, selectedArcs: [] })],
    ['outline', evaluateOutline, (s) => ({ ...s, outlineApproved: false })],
    ['article', evaluateArticle, (s) => ({ ...s, contentBundle: PREVIOUS_BUNDLE, articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE })]
  ])('the %s judge returns the error contract', async (phase, evaluate, shape) => {
    jest.spyOn(PromptBuilder.prototype, '_rosterSection').mockImplementation(() => { throw new Error('roster section exploded'); });
    const sdkClient = jest.fn();
    const result = await evaluate(shape({ ...reworkFixtureState('journalist'), heroImage: 'hero.jpg', evaluationHistory: [] }), { configurable: { sdkClient } });

    expect(result.currentPhase).toBe(PHASES.ERROR);
    expect(result.errors[0].type).toBe(`${phase}-evaluation-failed`);
    expect(result.errors[0].message).toBe('roster section exploded');
    expect(result.evaluationHistory).toEqual(expect.objectContaining({ phase, ready: false, _error: 'roster section exploded' }));
    expect(sdkClient).not.toHaveBeenCalled();
  });

  it('reviseArcs returns the error contract when its prompt throws', async () => {
    const plan = PLAYER_FOCUS_GUIDED_SCHEMA.properties.interweavingPlan;
    delete PLAYER_FOCUS_GUIDED_SCHEMA.properties.interweavingPlan;
    try {
      const state = reworkFixtureState('journalist');
      const sdkClient = jest.fn();
      const result = await reviseArcs(
        { ...state, narrativeArcs: null, _previousArcs: state.narrativeArcs, _arcFeedback: 'Tighten it.', arcRevisionCount: 1 },
        { configurable: { sdkClient } }
      );
      expect(result.currentPhase).toBe(PHASES.ERROR);
      expect(result.narrativeArcs).toEqual([]);
      expect(result._previousArcs).toBeNull();
      expect(result.errors[0].type).toBe('arc-revision-failed');
      expect(result.errors[0].message).toMatch(/no longer defines interweaving/);
      expect(sdkClient).not.toHaveBeenCalled();
    } finally {
      PLAYER_FOCUS_GUIDED_SCHEMA.properties.interweavingPlan = plan;
    }
  });
});

/**
 * Phase 3, brief 3.3 (TH7; coverage rows 51 to 58, 88 to 92): the rework rules.
 *
 * Every rework carried fixed text ("You are IMPROVING, not regenerating", "PRESERVE
 * everything that's working well", "Make minimal, surgical fixes"), on the director's
 * send back as on an automatic pass, so a "rethink it from scratch" came back as a
 * relabel. The article rework fixed "Low-scoring criteria" and every flagged
 * anti-pattern ("WHAT TO FIX") though most criteria are advisory. Now the director's
 * note governs how much a rework keeps, a rework's first line names the task its
 * revision context gives it, and an advisory criterion is a suggestion. The detective
 * keeps today's rules (D13).
 */
describe('the rework rules (phase 3, 3.3)', () => {
  const { _testing: { arcRevisionRules } } = require('../workflow/nodes/arc-specialist-nodes');
  const { _testing: { outlineRevisionRules } } = require('../workflow/nodes/ai-nodes');
  const { THEME_SYSTEM_PROMPTS } = require('../prompt-builder');
  const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
  const promptBuilder = createMockPromptBuilder();
  const ARC_STATE = {
    theme: 'journalist',
    canonicalCharacters: {},
    sessionConfig: { roster: ['Vic'] },
    playerFocus: { accusation: { accused: ['Vic'], charge: 'x' } },
    directorNotes: { rawProse: 'Vic left early.' },
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } }
  };

  const FIXED_PRESERVE = /preserve|not regenerat|IMPROVING|TARGETED FIX|surgical|WHAT TO FIX|Low-scoring criteria|working well/i;
  const contextFor = (phase, humanFeedback) => buildRevisionContext({
    phase, revisionCount: 1, previousOutput: {}, humanFeedback,
    validationResults: { phase, passed: false, structuralIssues: ['one defect'] }
  });
  /** The rework part of a reworker's user prompt: everything after its writer's sections. */
  const after = (text, marker) => text.slice(text.indexOf(marker));

  it('no journalist rework carries fixed "preserve" or "do not regenerate" text, in its rules or its task', async () => {
    const texts = {
      'arc rules (send back)': arcRevisionRules(true, 'journalist'),
      'arc rules (automated)': arcRevisionRules(false, 'journalist'),
      'outline rules': outlineRevisionRules('journalist'),
      'article rules': articleRevisionRules('journalist')
    };
    for (const humanFeedback of [null, 'Rethink it from scratch.']) {
      const kind = humanFeedback ? 'send back' : 'automated';
      const arcs = contextFor('arcs', humanFeedback);
      const outline = contextFor('outline', humanFeedback);
      const article = contextFor('article', humanFeedback);
      texts[`arc task (${kind})`] = after(
        buildArcRevisionPrompt({ ...ARC_STATE, _arcFeedback: humanFeedback }, arcs.contextSection, arcs.previousOutputSection),
        '# Arc Revision Request'
      );
      texts[`outline task (${kind})`] = after(
        await buildOutlineRevisionPrompt({ selectedArcs: [] }, outline.contextSection, outline.previousOutputSection, promptBuilder),
        '# Outline Revision Request'
      );
      texts[`article task (${kind})`] = after(
        await buildArticleRevisionPrompt({}, article.contextSection, article.previousOutputSection, promptBuilder),
        '## REVISION CONTEXT'
      );
    }
    Object.entries(texts).forEach(([name, text]) => {
      expect(`${name}: ${(text.match(FIXED_PRESERVE) || [''])[0]}`).toBe(`${name}: `);
    });
  });

  it("a rework's first line names the task its revision context gives it", () => {
    const firstLine = (text) => text.split('\n')[0];
    expect(firstLine(arcRevisionRules(true, 'journalist'))).toMatch(/reworking the arcs/);
    expect(firstLine(arcRevisionRules(true, 'journalist'))).toMatch(/director sent them back/);
    expect(firstLine(arcRevisionRules(false, 'journalist'))).toMatch(/reworking the arcs/);
    expect(firstLine(arcRevisionRules(false, 'journalist'))).toMatch(/automatic check or evaluation/);
    expect(firstLine(outlineRevisionRules('journalist'))).toMatch(/reworking the outline/);
    expect(firstLine(outlineRevisionRules('journalist'))).toMatch(/revision context/);
    // The article rework's first line is the theme's revision framing (3.2's string).
    expect(articleRevisionRules('journalist').startsWith(`${THEME_SYSTEM_PROMPTS.journalist.revision}\n`)).toBe(true);
  });

  it('the article rework rules give no advisory criterion as a defect to fix', () => {
    const rules = articleRevisionRules('journalist');
    expect(rules).not.toContain('WHAT TO FIX');
    expect(rules).not.toMatch(/Low-scoring criteria/i);
    expect(rules).not.toMatch(/anti-patterns flagged/i);
  });

  it('a send back may replace or restructure whole arcs, and a corrected mechanic reaches every arc', () => {
    const rules = arcRevisionRules(true, 'journalist');
    expect(rules).toMatch(/replace or restructure whole arcs/);
    expect(rules).toMatch(/every arc/);
  });

  it('the detective keeps its rework rules and tasks (D13)', async () => {
    expect(arcRevisionRules(true, 'detective')).toContain('Their feedback takes ABSOLUTE PRIORITY.');
    expect(arcRevisionRules(false, 'detective')).toContain('1. You are IMPROVING existing arcs, not generating from scratch');
    expect(outlineRevisionRules('detective')).toContain('1. You are IMPROVING an existing outline, not generating from scratch');
    expect(articleRevisionRules('detective')).toContain('WHAT TO PRESERVE:');
    const outline = await buildOutlineRevisionPrompt({ selectedArcs: [] }, 'c', 'p', promptBuilder, [], 'detective');
    expect(outline).toContain('Remember: You are IMPROVING, not regenerating.');
    const article = await buildArticleRevisionPrompt({}, 'c', 'p', promptBuilder, [], 'detective');
    expect(article).toContain("4. PRESERVE everything that's working well");
  });
});
