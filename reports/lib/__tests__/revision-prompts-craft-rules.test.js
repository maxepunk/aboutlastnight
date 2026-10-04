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
    outlineRevisionRules,
    articleRevisionRules
  },
  createMockPromptBuilder
} = require('../workflow/nodes/ai-nodes');

const {
  _testing: { buildArcRevisionPrompt, getArcRevisionSystemPrompt, arcRevisionRules: arcRulesFor }
} = require('../workflow/nodes/arc-specialist-nodes');

// Brief 4.13: a rework's rules open with its theme's rework identity; these are the journalist's.
const OUTLINE_REVISION_RULES = outlineRevisionRules('journalist');
const ARTICLE_REVISION_RULES = articleRevisionRules('journalist');
const ARC_AUTOMATIC_RULES = arcRulesFor(null, 'journalist');

const { createPromptBuilder } = require('../prompt-builder');
// Phase 4 (brief 4.6): the outline writer is the map writer, which reads the settled weave.
// Brief 4.7b: the article writer and its rework read the settled weave, then the map.
const { WEAVE, MAP } = require('./fixtures/rework-state');

describe('revision system prompts', () => {
  it('journalist keeps Nova as the reviser', async () => {
    expect(ARTICLE_REVISION_RULES).toContain('Nova');
    const outline = await buildOutlineRevisionSystemPrompt(createPromptBuilder({ theme: 'journalist' }));
    expect(outline).toContain('NovaNews');
  });

  // Phase 4 (brief 4.6; R1): the outline stage's detective branch went, its rework with it.
  it('the detective has no map rework: its system prompt fails loud', async () => {
    await expect(buildOutlineRevisionSystemPrompt(createPromptBuilder({ theme: 'detective' })))
      .rejects.toThrow('The "detective" theme has no story map');
  });

  // Phase 4 (brief 4.7b; R1): the article stage's detective branch went, its rework with it.
  it('the detective has no article rework: its system prompt fails loud', async () => {
    await expect(buildArticleRevisionSystemPrompt(createPromptBuilder({ theme: 'detective' })))
      .rejects.toThrow('The "detective" theme has no story map');
  });

  it("the rework composers take the writer's system prompt and fail loud on a theme name", () => {
    // They used to take a theme; an old call would now open the prompt with the
    // word "journalist". A reworker is its writer's prompt plus the rework rules.
    expect(() => getOutlineRevisionSystemPrompt('journalist')).toThrow(/writer's system prompt/);
    expect(() => getArticleRevisionSystemPrompt('detective')).toThrow(/writer's system prompt/);
    expect(getOutlineRevisionSystemPrompt('W1\nW2', 'journalist')).toBe(`W1\nW2\n\n${OUTLINE_REVISION_RULES}`);
    expect(getArticleRevisionSystemPrompt('W1\nW2', 'journalist')).toBe(`W1\nW2\n\n${ARTICLE_REVISION_RULES}`);
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
    expect(ARC_AUTOMATIC_RULES).not.toContain('80%');
    expect(getArcRevisionSystemPrompt(null)).not.toContain('80%');
  });

  it('the article rework rules carry the rule in no wording', () => {
    // Integrator ruling after wave 1: the same rule lived here as "High-scoring
    // criteria (0.8+) should be left unchanged", on the reworker that turned the
    // director's rethink into a relabel on 091826. Phase 4 (brief 4.7b; R1): the
    // detective's rules went with its article stage.
    expect(ARTICLE_REVISION_RULES).not.toContain('80%');
    expect(ARTICLE_REVISION_RULES).not.toContain('0.8+');
    expect(ARTICLE_REVISION_RULES).not.toContain('score well');
  });

  // Phase 4 (brief 4.4): the arc stage's detective branch went, with its numbered list.
  // Brief 4.6 (R1): so did the outline's, with its outline stage.
  it('the journalist\'s outline and arc rework rules carry no numbered list since phase 3', () => {
    const numbered = (text) => text
      .split('\n')
      .map((line) => line.match(/^(\d+)\. /))
      .filter(Boolean)
      .map((match) => Number(match[1]));

    expect(numbered(OUTLINE_REVISION_RULES)).toEqual([]);
    expect(numbered(ARC_AUTOMATIC_RULES)).toEqual([]);
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
      { weave: WEAVE, outline: MAP }, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt.startsWith(`Generate article from the settled weave and a map with ${MAP.sections.length} sections`)).toBe(true);
    expect(prompt.indexOf('CONTEXT-HERE')).toBeGreaterThan(0);
    expect(prompt.indexOf('PREVIOUS-HERE')).toBeGreaterThan(prompt.indexOf('CONTEXT-HERE'));
    expect(prompt).not.toContain('<RULES>');
    expect(prompt).not.toContain('## OUTPUT SCHEMA');
  });

  // Brief 4.6: the map's rework opens with the map writer's sections, built from the settled weave.
  it("outline revision opens with the writer's sections and keeps the context before the previous output", async () => {
    const prompt = await buildOutlineRevisionPrompt(
      { weave: WEAVE }, 'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder
    );
    expect(prompt.startsWith('Lay out the map from the settled weave')).toBe(true);
    expect(prompt.indexOf('PREVIOUS-HERE')).toBeGreaterThan(prompt.indexOf('CONTEXT-HERE'));
    expect(prompt).not.toContain('<RULES>');
    expect(prompt).not.toContain('SESSION CONTEXT');
  });

  // Brief 4.7b (R4): the guidance is the standing notes alone; the arc selection's
  // emphasis went with its last readers, so a stored one prints nowhere.
  it('article revision carries <DIRECTOR_GUIDANCE> when the director left a standing note, last', async () => {
    const NOTE = { gate: 'outline', kind: 'approval', round: 1, text: 'Lead with the money, not the vote.', at: 't1' };
    const prompt = await buildArticleRevisionPrompt(
      { _outlineGuidance: 'An emphasis stored before brief 4.7b.' },
      'CONTEXT-HERE', 'PREVIOUS-HERE', promptBuilder, [NOTE]
    );
    expect(prompt).toContain('<DIRECTOR_GUIDANCE>');
    expect(prompt).toContain('Lead with the money, not the vote.');
    expect(prompt).not.toContain('An emphasis stored before brief 4.7b.');
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
    expect(prompt.indexOf('tighten the lede')).toBeGreaterThan(prompt.indexOf('Generate article from'));
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

  it("carries each exposed document in full, labelled, and the writer's list of receipts", () => {
    const prompt = buildArcRevisionPrompt(STATE, 'ctx', 'prev');
    // The reviser was once shown ONLY `["vic001","paper-1"]` and told to fix its
    // keyEvidence; then an id, an owner and a summary of the name. It now reads the
    // documents themselves, as the writer does, and the ids follow the writer's rule.
    // Phase 4 (brief 4.4): the ids are the receipts a thread may give.
    expect(prompt).toContain('<document id="vic001" kind="memory" name="VIC001 - The ledger" owner="Vic Kingsley" layer="exposed">');
    expect(prompt).toContain(MEMORY_TEXT);
    expect(prompt).toContain('<document id="paper-1" kind="Document" name="Cease and desist" layer="exposed">');
    expect(prompt).toContain(PAPER_TEXT);
    expect(prompt).toContain('### Receipts\nA thread\'s receipt is one of these document ids, or "ledger" for the ledger:\n["vic001","paper-1"]');
    expect(prompt).not.toContain('A summary of the name only');
  });

  it('re-includes the three-category character block the generation prompt has', () => {
    const prompt = buildArcRevisionPrompt(STATE, 'ctx', 'prev');
    expect(prompt).toContain('### Character Categories');
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
  const { PHASE_REQUIREMENTS } = require('../theme-loader');

  it("journalist: both writers' craft files load", async () => {
    const builder = createPromptBuilder({ theme: 'journalist' });
    await expect(builder.requirePhasePrompts('outlineGeneration')).resolves.toBeUndefined();
    await expect(builder.requirePhasePrompts('articleGeneration')).resolves.toBeUndefined();
  });

  // Brief 4.7c (R1): the parked detective's branch, which checked its own craft files, went
  // with the old stages its writers wrote; retired-craft-files.test.js holds the check to the
  // rule set for every builder.

  it('has no revision phase to check any more', () => {
    expect(PHASE_REQUIREMENTS.journalist.revision).toBeUndefined();
    expect(PHASE_REQUIREMENTS.detective.revision).toBeUndefined();
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
  // judge's build creates a PromptBuilder and ThemeLoader and calls the writers' input
  // builders, and the arc rework prompt carries a
  // deliberate throw (buildArcReworkOutputAddendum), so a throw there bypassed the
  // swallow-into-state contract and rejected the graph.
  const { evaluateArcs, evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
  const { reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');
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
    // Phase 4 (brief 4.6): the outline judge left the graph.
    ['arcs', evaluateArcs, (s) => ({ ...s, meetingApproved: false })],
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

  // Phase 4 (brief 4.4): the rework keeps the weave it started from in its channel, so
  // the error contract writes none.
  it('reviseArcs returns the error contract when its prompt throws', async () => {
    const state = { ...reworkFixtureState('journalist'), _arcFeedback: 'Tighten it.', arcRevisionCount: 1 };
    Object.defineProperty(state, 'evidenceBundle', { get() { throw new Error('evidence bundle exploded'); } });
    const sdkClient = jest.fn();
    const result = await reviseArcs(state, { configurable: { sdkClient } });
    expect(result.currentPhase).toBe(PHASES.ERROR);
    expect(result).not.toHaveProperty('weave');
    expect(result.errors[0].type).toBe('arc-revision-failed');
    expect(result.errors[0].message).toBe('evidence bundle exploded');
    expect(sdkClient).not.toHaveBeenCalled();
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
  // Brief 4.13: the journalist's arc rework rules, opened by its rework identity.
  const arcRevisionRules = (round) => arcRulesFor(round, 'journalist');
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
      'arc rules (send back)': arcRevisionRules('send-back'),
      'arc rules (reweave)': arcRevisionRules('reweave'),
      'arc rules (automated)': arcRevisionRules(null),
      'outline rules': OUTLINE_REVISION_RULES,
      'article rules': ARTICLE_REVISION_RULES
    };
    // Brief 4.5: the weave's rework, at each of its kinds, by the story meeting's round mark.
    [[null, null], ['reweave', null], ['reweave', 'Join the ledger thread to the vote.'], ['send-back', 'Rethink it from scratch.']]
      .forEach(([round, note]) => {
        const arcs = buildRevisionContext({
          phase: 'arcs', outputName: 'weave', revisionCount: 1, previousOutput: {}, humanFeedback: note, meetingRound: round,
          validationResults: round ? null : { phase: 'arcs', passed: false, structuralIssues: ['one defect'] }
        });
        texts[`arc task (${round || 'automated'}${note ? ', with a note' : ''})`] = after(
          buildArcRevisionPrompt({ ...ARC_STATE, _meetingRound: round, _arcFeedback: note }, arcs.contextSection, arcs.previousOutputSection),
          '# Weave Rework'
        );
      });
    for (const humanFeedback of [null, 'Rethink it from scratch.']) {
      const kind = humanFeedback ? 'send back' : 'automated';
      const outline = contextFor('outline', humanFeedback);
      const article = contextFor('article', humanFeedback);
      texts[`outline task (${kind})`] = after(
        await buildOutlineRevisionPrompt({ weave: WEAVE }, outline.contextSection, outline.previousOutputSection, promptBuilder),
        '# Map Revision Request'
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
    expect(firstLine(arcRevisionRules('send-back'))).toMatch(/reworking the weave/);
    expect(firstLine(arcRevisionRules('send-back'))).toMatch(/director sent it back/);
    // Brief 4.5: a reweave's first line names the changes the revision context lists.
    expect(firstLine(arcRevisionRules('reweave'))).toMatch(/reworking the weave/);
    expect(firstLine(arcRevisionRules('reweave'))).toMatch(/asked for a reweave, and the revision context lists the changes/);
    expect(firstLine(arcRevisionRules(null))).toMatch(/reworking the weave/);
    expect(firstLine(arcRevisionRules(null))).toMatch(/automatic check or fact check/);
    // Brief 4.6: the map's rework.
    expect(firstLine(OUTLINE_REVISION_RULES)).toMatch(/reworking the story map/);
    expect(firstLine(OUTLINE_REVISION_RULES)).toMatch(/revision context/);
    // The article rework's first line is its own (3.10, fix round 1). It was the
    // theme's revision framing (3.2's string), which named the automatic task "the
    // evaluation's findings": every finding the context lists, the SHOULD CONSIDER items
    // and the suggestions among them. R23 makes that task the must-fix items, and the
    // revision context's WHAT THIS REWORK DOES states it once, so the line points there.
    // 3.3's finding 4 (fix 3.2b): that line, the first of the rework rules, right
    // after the writer's system prompt, names the task the revision context gives.
    // Phase 4 (brief 4.7b; R1): it is the whole of the rules, the empty voice slot that
    // followed it going with the detective's voice.
    const articleLine = ARTICLE_REVISION_RULES;
    expect(articleLine.split('\n')).toHaveLength(1);
    expect(articleLine).toMatch(/reworking your article/);
    expect(articleLine).toMatch(/REVISION CONTEXT/);
    expect(articleLine).toMatch(/the director's note on a send back/);
    expect(articleLine).toMatch(/automatic check or evaluation/);
    expect(articleLine).toMatch(/under WHAT THIS REWORK DOES/);
    expect(articleLine).not.toMatch(/findings/);
    expect(articleLine).not.toMatch(/voice issues|you identified/);
    expect(getArticleRevisionSystemPrompt('W1\nW2', 'journalist').split('\n')[3]).toBe(articleLine);
  });

  // 3.10, fix round 1 (R23): an automatic rework fixes the must-fix items, and the
  // revision context's WHAT THIS REWORK DOES states that once. A rework rule that
  // called the automatic task "the evaluation's findings" handed it every finding the
  // context lists, the suggestions among them, from the system prompt. Each rule names
  // the revision context as the task's source and states no scope of its own.
  it('no journalist rework rule names the findings as the automatic task: each points at the revision context', () => {
    const rules = {
      'arc rules (send back)': arcRevisionRules('send-back'),
      'arc rules (reweave)': arcRevisionRules('reweave'),
      'arc rules (automatic)': arcRevisionRules(null),
      'outline rules': OUTLINE_REVISION_RULES,
      'article rules': ARTICLE_REVISION_RULES
    };
    Object.entries(rules).forEach(([name, text]) => {
      expect(`${name}: ${(text.match(/[^.\n]*\bfindings?\b[^.\n]*/i) || [''])[0]}`).toBe(`${name}: `);
      expect(`${name}: ${/revision context/i.test(text)}`).toBe(`${name}: true`);
    });
  });

  it('the article rework rules give no advisory criterion as a defect to fix', () => {
    const rules = ARTICLE_REVISION_RULES;
    expect(rules).not.toContain('WHAT TO FIX');
    expect(rules).not.toMatch(/Low-scoring criteria/i);
    expect(rules).not.toMatch(/anti-patterns flagged/i);
  });

  // Post-merge fix (3.3 review, finding 2): each rule once. The arc send back's rules
  // said "A note can call for a rethink" and its revision context said "a note that
  // asks for a rethink gets a rethink". The rethink rule is the revision context's,
  // the one place every reworker shares; the arc rules add only the mechanic line.
  it("an arc send back states the rethink rule once, in the revision context, and a corrected mechanic reaches every thread", () => {
    const rules = arcRevisionRules('send-back');
    expect(rules).not.toMatch(/rethink/i);
    expect(rules).toMatch(/corrects every thread it touches/);
    const feedback = 'Merge the two money threads.';
    const context = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, round: 1, previousOutput: {}, humanFeedback: feedback, meetingRound: 'send-back',
      validationResults: { phase: 'arcs', passed: true, criteriaScores: { evidenceTruth: { score: 0.9, type: 'structural' } } }
    });
    const system = getArcRevisionSystemPrompt('send-back', ARC_STATE.sessionConfig, 'journalist');
    const user = buildArcRevisionPrompt({ ...ARC_STATE, _meetingRound: 'send-back', _arcFeedback: feedback }, context.contextSection, context.previousOutputSection);
    const whole = `${system}\n${user}`;
    expect(whole.match(/rethink/gi)).toHaveLength(2);
    expect(whole.match(/a note that asks for a rethink gets a rethink/g)).toHaveLength(1);
    expect(user.indexOf('rethink')).toBeGreaterThan(user.indexOf('WHAT THIS REWORK DOES'));
  });
});
