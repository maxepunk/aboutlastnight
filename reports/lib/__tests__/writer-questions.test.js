/**
 * The writers' questions (phase 3, brief 3.7; spec C15, C7, T9, T5 and R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a
 * ledger line looks wrong, a writer asks the director instead of guessing. The
 * questions ride in one optional field, `writerQuestions`, on each writer's output:
 * the arcs (stored in `_arcAnalysisCache.writerQuestions`; the interweaving call has
 * no field), the outline and the article, at the top level. The director reads them
 * at the stop and answers with the stop's note.
 *
 * - A rework carries forward every question it did not answer (R5): only the director
 *   answers one. An automatic pass keeps every previous question beside the ones it
 *   returns; after the director's note the rework's list replaces the old one; a
 *   rework that returns no field keeps the previous list.
 * - The field never prints, and never reaches the template, the fact check's printed
 *   text or a later writer's prompt.
 * - At the arc stage a roster member a question names counts as covered, by first
 *   name or full name, in the arc check, its fix line, the arc judge and the arc
 *   writer's own roster lines. The article fact check's coverage is unchanged.
 * - The detective is parked (spec D13): its schemas, prompts and checks do not change.
 */

const { SchemaValidator } = require('../schema-validator');
const outlineSchema = require('../schemas/outline.schema.json');
const contentBundleSchema = require('../schemas/content-bundle.schema.json');
const detectiveBundleCopy = require('../schemas/content-bundle.detective-prompt.json');
const subagents = require('../sdk-client/subagents');
const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt, buildEvaluationSystemPrompt, getArcCriteria } } = require('../workflow/nodes/evaluator-nodes');
const { PromptBuilder } = require('../prompt-builder');
const { PHASE_REQUIREMENTS } = require('../theme-loader');
const { diffOutline, diffBundle } = require('../hand-edit-diff');
const { TemplateAssembler } = require('../template-assembler');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

const Q_SARAH = { about: 'Sarah', question: 'The record holds nothing Sarah did this morning: where was Sarah?' };
const Q_FULL = { about: 'Sarah Blackwood', question: 'The record holds nothing Sarah Blackwood did: what did the room see?' };
const Q_LEDGER = { about: 'The 07:50 AM sale of $75,000 into Melanie', question: 'Is this sale a duplicate entry?' };
const Q_PRONOUN = { about: "Riley's pronoun", question: 'The roster gives Riley no pronoun: which one?' };
const QUESTION_TEXTS = [Q_SARAH, Q_FULL, Q_LEDGER, Q_PRONOUN].map((q) => q.question);

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** The field, wherever a schema defines it: an optional list of {about, question} strings. */
function expectQuestionsField(schema, label) {
  const field = schema.properties && schema.properties.writerQuestions;
  expect(`${label}: ${field ? 'has' : 'lacks'} writerQuestions`).toBe(`${label}: has writerQuestions`);
  expect(field.type).toBe('array');
  expect(field.items.type).toBe('object');
  expect(field.items.properties.about.type).toBe('string');
  expect(field.items.properties.question.type).toBe('string');
  expect(field.items.required).toEqual(['about', 'question']);
  expect(schema.required || []).not.toContain('writerQuestions');
}

function sdkReturning(...values) {
  const sdk = jest.fn();
  values.forEach((value) => sdk.mockImplementationOnce(async () => clone(value)));
  return sdk;
}

// ═══════════════════════════════════════════════════════════════════════════
// The four schemas
// ═══════════════════════════════════════════════════════════════════════════

describe('the optional writerQuestions field in the four schemas', () => {
  it('the arc writer\'s schema (CORE_ARC_SCHEMA)', () => {
    expectQuestionsField(subagents.CORE_ARC_SCHEMA, 'CORE_ARC_SCHEMA');
  });

  it('the arc reworker\'s schema (PLAYER_FOCUS_GUIDED_SCHEMA)', () => {
    expectQuestionsField(subagents.PLAYER_FOCUS_GUIDED_SCHEMA, 'PLAYER_FOCUS_GUIDED_SCHEMA');
  });

  it('the outline schema, at the top level, and the validator accepts it', () => {
    expectQuestionsField(outlineSchema, 'outline.schema.json');
    const validator = new SchemaValidator();
    const outline = { lede: { hook: 'Marcus died with a sale on his lips.' } };
    expect(validator.validate('outline', outline).valid).toBe(true);
    expect(validator.validate('outline', { ...outline, writerQuestions: [Q_SARAH] }).valid).toBe(true);
    expect(validator.validate('outline', { ...outline, writerQuestions: [{ about: 'Sarah' }] }).valid).toBe(false);
  });

  it('the content-bundle schema, at the top level, and the validator accepts it', () => {
    expectQuestionsField(contentBundleSchema, 'content-bundle.schema.json');
    const validator = new SchemaValidator();
    const bundle = clone(require('../../__tests__/fixtures/content-bundles/valid-journalist.json'));
    expect(validator.validate('content-bundle', bundle).valid).toBe(true);
    expect(validator.validate('content-bundle', { ...bundle, writerQuestions: [Q_LEDGER] }).valid).toBe(true);
  });

  it('the descriptions state the shape and name C15, with no em-dash', () => {
    for (const schema of [subagents.CORE_ARC_SCHEMA, subagents.PLAYER_FOCUS_GUIDED_SCHEMA, outlineSchema, contentBundleSchema]) {
      const field = schema.properties.writerQuestions;
      expect(field.description).toMatch(/C15/);
      expect(field.items.properties.about.description).toMatch(/a player/);
      expect(JSON.stringify(field)).not.toMatch(/—/);
    }
  });

  // Fix 3.7b (finding 3): one wording for the field. The arc schemas use the JS
  // constant itself; the three JSON files repeat it, with the `additionalProperties:
  // false` those files put on every object, so a wording change must touch all four.
  it('one wording: each JSON schema defines the field exactly as WRITER_QUESTIONS_PROPERTY', () => {
    const { WRITER_QUESTIONS_PROPERTY } = require('../writer-questions');
    const expected = { ...WRITER_QUESTIONS_PROPERTY, items: { ...WRITER_QUESTIONS_PROPERTY.items, additionalProperties: false } };
    for (const [label, schema] of [
      ['outline.schema.json', outlineSchema],
      ['content-bundle.schema.json', contentBundleSchema],
      ['content-bundle.detective-prompt.json', detectiveBundleCopy]
    ]) {
      expect({ label, field: schema.properties.writerQuestions }).toEqual({ label, field: expected });
    }
    expect(subagents.CORE_ARC_SCHEMA.properties.writerQuestions).toBe(WRITER_QUESTIONS_PROPERTY);
    expect(subagents.PLAYER_FOCUS_GUIDED_SCHEMA.properties.writerQuestions).toBe(WRITER_QUESTIONS_PROPERTY);
  });

  it('the interweaving call has no field (spec section 8)', () => {
    expect(subagents.INTERWEAVING_SCHEMA.properties.writerQuestions).toBeUndefined();
  });

  it('the detective\'s arc schemas do not change: neither copy carries the field', () => {
    expect(subagents.DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA.properties.writerQuestions).toBeUndefined();
    expect(subagents.DETECTIVE_INTERWEAVING_SCHEMA.properties.writerQuestions).toBeUndefined();
    expect(subagents.DETECTIVE_CORE_ARC_SCHEMA.properties.writerQuestions).toBeUndefined();
    const { writerQuestions, ...rest } = subagents.CORE_ARC_SCHEMA.properties;
    expect(subagents.DETECTIVE_CORE_ARC_SCHEMA.properties).toEqual(rest);
  });

  it('the detective\'s frozen copy of the content-bundle schema keeps the live shape', () => {
    expect(detectiveBundleCopy.properties.writerQuestions).toEqual(
      expect.objectContaining({ type: 'array' })
    );
  });
});

describe('the detective\'s calls do not ask for the field (spec D13)', () => {
  it('the detective arc writer is sent its own schema; the journalist\'s carries the field', async () => {
    for (const theme of ['journalist', 'detective']) {
      const state = reworkFixtureState(theme);
      const sdk = sdkReturning({ narrativeArcs: state.narrativeArcs, synthesisNotes: 's' });
      await arcNodes._testing.generateCoreArcs({ ...state, narrativeArcs: null }, { configurable: { sdkClient: sdk, theme } });
      const schema = sdk.mock.calls[0][0].jsonSchema;
      expect(`${theme}: ${Boolean(schema.properties.writerQuestions)}`).toBe(`${theme}: ${theme === 'journalist'}`);
    }
  });

  it.each([
    ['generateContentBundle', (state, cfg) => aiNodes.generateContentBundle({ ...state, contentBundle: null }, cfg)],
    ['reviseContentBundle', (state, cfg) => aiNodes.reviseContentBundle({ ...state, _previousContentBundle: clone(PREVIOUS_BUNDLE), articleRevisionCount: 1 }, cfg)]
  ])('%s sends the detective a content-bundle schema without the field', async (_name, run) => {
    for (const theme of ['journalist', 'detective']) {
      const state = reworkFixtureState(theme);
      const sdk = sdkReturning(PREVIOUS_BUNDLE);
      await run(state, { configurable: { sdkClient: sdk, theme } });
      const schema = sdk.mock.calls[0][0].jsonSchema;
      expect(`${theme}: ${Boolean(schema.properties.writerQuestions)}`).toBe(`${theme}: ${theme === 'journalist'}`);
    }
  });

  it('the detective\'s printed <SCHEMA> leaves the field out', async () => {
    const themeLoader = { loadPhasePrompts: jest.fn().mockResolvedValue({}), validate: jest.fn() };
    const { userPrompt } = await new PromptBuilder(themeLoader, 'detective', {})
      .buildArticlePrompt({}, [], null, [], null, null, null, {});
    expect(userPrompt).not.toContain('writerQuestions');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The arcs: the merge, the cache, the rework
// ═══════════════════════════════════════════════════════════════════════════

describe('the arc questions survive the merge and reach the cache', () => {
  const { mergeArcsWithInterweaving } = arcNodes._testing;
  const core = { narrativeArcs: [{ id: 'arc-a', title: 'A' }], synthesisNotes: 's', writerQuestions: [Q_SARAH] };

  it('the merge keeps the writer\'s questions beside the interweaving', () => {
    const merged = mergeArcsWithInterweaving(core, { arcInterweaving: [], interweavingPlan: { suggestedOrder: ['arc-a'] } });
    expect(merged.writerQuestions).toEqual([Q_SARAH]);
  });

  it('the merge keeps them when the interweaving call failed', () => {
    const merged = mergeArcsWithInterweaving(core, { _failed: true, _error: 'x' });
    expect(merged.writerQuestions).toEqual([Q_SARAH]);
  });

  it('the merge gives an empty list when the writer raised none', () => {
    const merged = mergeArcsWithInterweaving({ narrativeArcs: [], synthesisNotes: 's' }, null);
    expect(merged.writerQuestions).toEqual([]);
  });

  it('the arc analysis stores them as _arcAnalysisCache.writerQuestions', async () => {
    const state = reworkFixtureState('journalist');
    const sdk = sdkReturning(
      { narrativeArcs: state.narrativeArcs, synthesisNotes: 's', writerQuestions: [Q_SARAH, Q_LEDGER] },
      { arcInterweaving: [], interweavingPlan: { suggestedOrder: ['arc-sale'] } }
    );
    const result = await arcNodes.analyzeArcsPlayerFocusGuided({ ...state, narrativeArcs: [] }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_SARAH, Q_LEDGER]);
  });
});

describe('the rework rule: only the director answers a question (R5)', () => {
  const { carriedWriterQuestions, withCarriedWriterQuestions } = require('../writer-questions');
  const Q_NEW = { about: 'Melanie', question: 'Did Melanie leave before the vote?' };

  it('throws unless the caller says whether the rework followed the director\'s note', () => {
    expect(() => carriedWriterQuestions([Q_LEDGER], [Q_SARAH])).toThrow(/afterDirectorNote/);
    expect(() => carriedWriterQuestions([Q_LEDGER], [Q_SARAH], {})).toThrow(/afterDirectorNote/);
    expect(() => carriedWriterQuestions([Q_LEDGER], [Q_SARAH], { afterDirectorNote: 'yes' })).toThrow(/afterDirectorNote/);
    expect(() => withCarriedWriterQuestions({ writerQuestions: [] }, { writerQuestions: [Q_SARAH] })).toThrow(/afterDirectorNote/);
  });

  it('an automatic pass keeps every previous question, in order, then the new ones', () => {
    expect(carriedWriterQuestions([Q_NEW], [Q_SARAH, Q_LEDGER], { afterDirectorNote: false })).toEqual([Q_SARAH, Q_LEDGER, Q_NEW]);
    expect(carriedWriterQuestions([], [Q_SARAH, Q_LEDGER], { afterDirectorNote: false })).toEqual([Q_SARAH, Q_LEDGER]);
  });

  it('an automatic pass that returns a kept question lists it once, whatever its case and spacing', () => {
    const restated = { about: '  sarah ', question: Q_SARAH.question.toUpperCase().replace(/ /g, '  ') };
    expect(carriedWriterQuestions([restated, Q_NEW, Q_NEW], [Q_SARAH], { afterDirectorNote: false })).toEqual([Q_SARAH, Q_NEW]);
  });

  it('after the director\'s note the rework\'s list replaces the old one, an empty list included', () => {
    expect(carriedWriterQuestions([Q_LEDGER], [Q_SARAH, Q_LEDGER], { afterDirectorNote: true })).toEqual([Q_LEDGER]);
    expect(carriedWriterQuestions([], [Q_SARAH], { afterDirectorNote: true })).toEqual([]);
  });

  it('a rework that returns no field keeps the previous list, on either kind of pass', () => {
    for (const afterDirectorNote of [false, true]) {
      expect(carriedWriterQuestions(undefined, [Q_SARAH], { afterDirectorNote })).toEqual([Q_SARAH]);
      expect(withCarriedWriterQuestions({ lede: {} }, { writerQuestions: [Q_SARAH] }, { afterDirectorNote })).toEqual({ lede: {}, writerQuestions: [Q_SARAH] });
    }
  });

  it('an output with no field and nothing to carry comes back as it was', () => {
    const output = { lede: {} };
    expect(withCarriedWriterQuestions(output, { lede: {} }, { afterDirectorNote: false })).toBe(output);
  });
});

describe('an arc rework carries forward the questions it did not answer (R5)', () => {
  function reworkState(previousQuestions, feedback = null) {
    const state = reworkFixtureState('journalist');
    return {
      ...state,
      narrativeArcs: null,
      _previousArcs: state.narrativeArcs,
      _arcFeedback: feedback,
      _arcAnalysisCache: { ...state._arcAnalysisCache, writerQuestions: previousQuestions }
    };
  }

  it('shows the previous questions in the rework prompt, as JSON under their own heading', () => {
    const prompt = arcNodes._testing.buildArcRevisionPrompt(reworkState([Q_SARAH]), 'CTX', 'PREV');
    expect(prompt).toContain(`### PREVIOUS QUESTIONS FOR THE DIRECTOR (writerQuestions)\n${JSON.stringify([Q_SARAH], null, 2)}`);
  });

  it('shows no such section when there were no questions', () => {
    const prompt = arcNodes._testing.buildArcRevisionPrompt(reworkState([]), 'CTX', 'PREV');
    expect(prompt).not.toContain('PREVIOUS QUESTIONS FOR THE DIRECTOR');
  });

  it('keeps the previous list when the rework returns no field', async () => {
    const state = reworkState([Q_SARAH, Q_LEDGER]);
    const sdk = sdkReturning({ narrativeArcs: state._previousArcs, synthesisNotes: 's' });
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_SARAH, Q_LEDGER]);
  });

  it('drops a question the rework answered after the director\'s note, and keeps the unanswered one', async () => {
    const state = reworkState([Q_SARAH, Q_LEDGER], 'Sarah sold the first memory at 07:50 AM.');
    const sdk = sdkReturning({ narrativeArcs: state._previousArcs, synthesisNotes: 's', writerQuestions: [Q_LEDGER] });
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_LEDGER]);
  });

  it('adds the rework\'s own new questions', async () => {
    const state = reworkState([Q_LEDGER]);
    const sdk = sdkReturning({ narrativeArcs: state._previousArcs, synthesisNotes: 's', writerQuestions: [Q_LEDGER, Q_PRONOUN] });
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_LEDGER, Q_PRONOUN]);
  });

  it('an automatic pass keeps a question its rework left out, beside the rework\'s own', async () => {
    const state = reworkState([Q_SARAH, Q_LEDGER]);
    const sdk = sdkReturning({ narrativeArcs: state._previousArcs, synthesisNotes: 's', writerQuestions: [Q_LEDGER, Q_PRONOUN] });
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_SARAH, Q_LEDGER, Q_PRONOUN]);
  });

  it('an automatic pass whose rework returns an empty list keeps every previous question', async () => {
    const state = reworkState([Q_SARAH, Q_LEDGER]);
    const sdk = sdkReturning({ narrativeArcs: state._previousArcs, synthesisNotes: 's', writerQuestions: [] });
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_SARAH, Q_LEDGER]);
  });

  it('keeps the questions with the previous arcs on the free timeout retry', async () => {
    const state = reworkState([Q_SARAH]);
    const sdk = jest.fn().mockRejectedValueOnce(new Error('SDK timeout after 300.0s (limit: 300s)'));
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcAnalysisCache._revisionTimedOut).toBe(true);
    expect(result._arcAnalysisCache.writerQuestions).toEqual([Q_SARAH]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The outline and the article: the rework keeps what it did not answer
// ═══════════════════════════════════════════════════════════════════════════

describe('an outline or article rework carries forward the questions it did not answer (R5)', () => {
  const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: aiNodes.createMockPromptBuilder(), theme: 'journalist' } });

  it('reviseOutline keeps the previous outline\'s questions when the rework returns no field', async () => {
    const previous = { ...clone(OUTLINE), writerQuestions: [Q_SARAH] };
    const result = await aiNodes.reviseOutline({ _previousOutline: previous, outlineRevisionCount: 1 }, cfg(sdkReturning(OUTLINE)));
    expect(result.outline.writerQuestions).toEqual([Q_SARAH]);
  });

  it('reviseOutline takes the rework\'s list after the director\'s note, an empty list included', async () => {
    const previous = { ...clone(OUTLINE), writerQuestions: [Q_SARAH] };
    const result = await aiNodes.reviseOutline(
      { _previousOutline: previous, _outlineFeedback: 'Sarah sold at 07:50 AM.', outlineRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(OUTLINE), writerQuestions: [] }))
    );
    expect(result.outline.writerQuestions).toEqual([]);
  });

  it('reviseOutline on an automatic pass keeps a question its rework left out, beside the rework\'s own', async () => {
    const previous = { ...clone(OUTLINE), writerQuestions: [Q_SARAH, Q_LEDGER] };
    const result = await aiNodes.reviseOutline(
      { _previousOutline: previous, outlineRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(OUTLINE), writerQuestions: [Q_PRONOUN] }))
    );
    expect(result.outline.writerQuestions).toEqual([Q_SARAH, Q_LEDGER, Q_PRONOUN]);
  });

  it('reviseOutline on an automatic pass keeps every previous question when its rework returns an empty list', async () => {
    const previous = { ...clone(OUTLINE), writerQuestions: [Q_SARAH, Q_LEDGER] };
    const result = await aiNodes.reviseOutline(
      { _previousOutline: previous, outlineRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(OUTLINE), writerQuestions: [] }))
    );
    expect(result.outline.writerQuestions).toEqual([Q_SARAH, Q_LEDGER]);
  });

  it('reviseContentBundle keeps the previous article\'s questions when the rework returns no field', async () => {
    const previous = { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER] };
    const result = await aiNodes.reviseContentBundle({ _previousContentBundle: previous, articleRevisionCount: 1 }, cfg(sdkReturning(PREVIOUS_BUNDLE)));
    expect(result.contentBundle.writerQuestions).toEqual([Q_LEDGER]);
  });

  it('reviseContentBundle on an automatic pass keeps a question its rework left out, beside the rework\'s own', async () => {
    const previous = { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER] };
    const result = await aiNodes.reviseContentBundle(
      { _previousContentBundle: previous, articleRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_PRONOUN] }))
    );
    expect(result.contentBundle.writerQuestions).toEqual([Q_LEDGER, Q_PRONOUN]);
  });

  it('reviseContentBundle takes the rework\'s list after the director\'s note, dropping the answered question', async () => {
    const previous = { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER, Q_PRONOUN] };
    const result = await aiNodes.reviseContentBundle(
      { _previousContentBundle: previous, _articleFeedback: 'The 07:50 AM sale is not a duplicate.', articleRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_PRONOUN] }))
    );
    expect(result.contentBundle.writerQuestions).toEqual([Q_PRONOUN]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Kept out of every later prompt, the template and the trace
// ═══════════════════════════════════════════════════════════════════════════

describe('the questions never reach a later writer, a judge\'s JSON or the template', () => {
  function withQuestions(state) {
    return {
      ...state,
      _arcAnalysisCache: { ...state._arcAnalysisCache, writerQuestions: [Q_SARAH] },
      outline: { ...clone(OUTLINE), writerQuestions: [Q_FULL] },
      contentBundle: { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER, Q_PRONOUN] }
    };
  }
  const expectNoQuestions = (text) => {
    expect(text).not.toContain('writerQuestions');
    QUESTION_TEXTS.forEach((q) => expect(text).not.toContain(q));
  };

  it('outlineWriterInputs strips the arc questions from <arc-analysis>', () => {
    const [arcAnalysis] = aiNodes.outlineWriterInputs(withQuestions(reworkFixtureState('journalist')), 'hero.jpg');
    expect(arcAnalysis).not.toHaveProperty('writerQuestions');
    expect(arcAnalysis.interweavingPlan).toBeDefined();
  });

  it('the outline writer\'s prompt carries none of the arc questions', async () => {
    const sdk = sdkReturning(OUTLINE);
    const state = withQuestions(reworkFixtureState('journalist'));
    await aiNodes.generateOutline({ ...state, outline: null }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    QUESTION_TEXTS.forEach((q) => expect(sdk.mock.calls[0][0].prompt).not.toContain(q));
  });

  it('the article writer\'s APPROVED OUTLINE carries none of the outline\'s questions', async () => {
    const state = withQuestions(reworkFixtureState('journalist'));
    const builder = new PromptBuilder(
      {
        loadPhasePrompts: async (phase) => Object.fromEntries((PHASE_REQUIREMENTS.journalist[phase] || []).map((n) => [n, `STUB ${n}`])),
        validate: async () => ({ valid: true, missing: [] })
      },
      'journalist', state.sessionConfig, state.canonicalCharacters, state.characterData.characters
    );
    const sdk = sdkReturning(PREVIOUS_BUNDLE);
    await aiNodes.generateContentBundle({ ...state, contentBundle: null }, { configurable: { sdkClient: sdk, promptBuilder: builder, theme: 'journalist' } });
    const { prompt } = sdk.mock.calls[0][0];
    expect(prompt).toContain('APPROVED OUTLINE:');
    QUESTION_TEXTS.forEach((q) => expect(prompt).not.toContain(q));
  });

  it.each(['outline', 'article'])('the %s judge\'s JSON carries none of the questions', (phase) => {
    for (const theme of ['journalist', 'detective']) {
      const prompt = buildEvaluationUserPrompt(phase, withQuestions(reworkFixtureState(theme)), {});
      expectNoQuestions(prompt);
    }
  });

  it('the template context and the page carry none of them', async () => {
    const bundle = { ...clone(require('../../__tests__/fixtures/content-bundles/valid-journalist.json')), writerQuestions: [Q_LEDGER] };
    const assembler = new TemplateAssembler('journalist');
    const context = await assembler.buildContext(bundle, '010126', []);
    expect(context).not.toHaveProperty('writerQuestions');
    const html = await assembler.assemble(bundle);
    expect(html).not.toContain(Q_LEDGER.question);
  });

  it('the fact check\'s printed text carries none of them', () => {
    const { _testing } = require('../content-bundle-fact-check');
    const bundle = { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER] };
    expect(_testing.visibleText(bundle, 'journalist')).not.toContain(Q_LEDGER.question);
    expect(_testing.narratorText(bundle)).not.toContain(Q_LEDGER.question);
  });

  it('the hand-edit diff and the trace ignore them (diffOutline, diffBundle)', () => {
    const before = { ...clone(OUTLINE), writerQuestions: [Q_SARAH] };
    expect(diffOutline(before, { ...clone(OUTLINE), writerQuestions: [] }).sections).toEqual([]);
    expect(diffOutline(clone(OUTLINE), before).sections).toEqual([]);
    const bundle = { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_LEDGER] };
    expect(diffBundle(clone(PREVIOUS_BUNDLE), bundle).scopes).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Roster coverage at the arc stage: placed through the record, or questioned
// ═══════════════════════════════════════════════════════════════════════════

describe('the arc check counts a questioned player as covered (C7, C15)', () => {
  const placesAlex = {
    id: 'arc-verdict', title: 'The verdict', arcSource: 'accusation',
    keyEvidence: [], characterPlacements: { Alex: 'accused' }, evidenceStrength: 'moderate'
  };
  function stateWith(questions, theme = 'journalist') {
    return {
      narrativeArcs: [placesAlex],
      sessionConfig: { roster: ['Alex', 'Sarah'], accusation: { verdictKind: 'culprit', accused: ['Alex'], charge: 'Murder' } },
      evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
      canonicalCharacters: { Alex: 'Alex Reeves', Sarah: 'Sarah Blackwood' },
      _arcAnalysisCache: questions === undefined ? null : { writerQuestions: questions },
      theme
    };
  }

  it('a player no arc places and no question names is missing', () => {
    const result = arcNodes.validateArcStructure(stateWith([]), {});
    expect(result._arcValidation.missingRoster).toEqual(['Sarah']);
    expect(result._arcValidation.structuralPassed).toBe(false);
  });

  it.each([
    ['first name', Q_SARAH],
    ['full name', Q_FULL],
    ['a pronoun question', { about: "Sarah's pronoun", question: 'Which pronoun?' }]
  ])('a question naming the player by %s covers them', (_kind, question) => {
    const result = arcNodes.validateArcStructure(stateWith([question]), {});
    expect(result._arcValidation.missingRoster).toEqual([]);
    expect(result._arcValidation.rosterCoverage).toBe(1);
    expect(result._arcValidation.rosterCoveredByQuestion).toEqual(['Sarah']);
    expect(result._arcValidation.structuralPassed).toBe(true);
  });

  it('a question about someone else, or about a ledger line, covers no one else', () => {
    const result = arcNodes.validateArcStructure(stateWith([Q_LEDGER, { about: 'Sarahson', question: 'Who?' }]), {});
    expect(result._arcValidation.missingRoster).toEqual(['Sarah']);
  });

  it('a thread with no cache counts placements only', () => {
    const result = arcNodes.validateArcStructure(stateWith(undefined), {});
    expect(result._arcValidation.missingRoster).toEqual(['Sarah']);
  });

  it('the fix line offers a placement through the record or a question to the director', () => {
    const guidance = arcNodes.validateArcStructure(stateWith([]), {}).validationResults.revisionGuidance;
    expect(guidance).toContain('Roster members with no placement and no writerQuestions entry about them:\n  - Sarah');
    expect(guidance).toMatch(/through what the record shows they did, or, where the record holds nothing about them, a writerQuestions entry about them for the director \(C15\)/);
    expect(guidance).not.toMatch(/MUST appear/);
  });

  it('the detective keeps its check and its fix line (D13)', () => {
    const result = arcNodes.validateArcStructure(stateWith([Q_SARAH], 'detective'), {});
    expect(result._arcValidation.missingRoster).toEqual(['Sarah']);
    expect(result.validationResults.revisionGuidance).toContain('Missing roster members that MUST appear in characterPlacements:');
    expect(result.validationResults.revisionGuidance).toContain("Ensure each missing member appears in at least one arc's characterPlacements.");
  });
});

describe('the arc judge counts a questioned player as covered (C7, C15)', () => {
  it('the journalist rosterCoverage criterion names the questions; it stays structural', () => {
    const criterion = getArcCriteria('journalist').rosterCoverage;
    expect(criterion.type).toBe('structural');
    expect(criterion.description).toBe(
      'Does every roster member have a placement in at least one arc, or a question about them in QUESTIONS FOR THE DIRECTOR (C7, C15)?'
    );
  });

  it('the journalist judge is shown the arc writer\'s questions as JSON under their own label', () => {
    const state = { ...reworkFixtureState('journalist'), _arcAnalysisCache: { writerQuestions: [Q_SARAH] } };
    const prompt = buildEvaluationUserPrompt('arcs', state, {});
    expect(prompt).toContain(`QUESTIONS FOR THE DIRECTOR (writerQuestions):\n${JSON.stringify([Q_SARAH], null, 2)}`);
    expect(prompt).toContain('1. ROSTER COVERAGE: Every name in SESSION ROSTER has a role in characterPlacements of at least one arc, or a question about them in QUESTIONS FOR THE DIRECTOR');
  });

  it('the journalist judge is told when there are none', () => {
    const prompt = buildEvaluationUserPrompt('arcs', { ...reworkFixtureState('journalist'), _arcAnalysisCache: {} }, {});
    expect(prompt).toContain('QUESTIONS FOR THE DIRECTOR (writerQuestions):\n[]');
  });

  it('the journalist judge\'s system prompt counts a question in its distinction line', () => {
    const system = buildEvaluationSystemPrompt('arcs', getArcCriteria('journalist'), 'journalist', { sessionConfig: { reportingMode: 'on-site' } });
    expect(system).toContain('- rosterCoverage: Check that every roster member appears in characterPlacements of at least one arc, or has a question about them in QUESTIONS FOR THE DIRECTOR');
  });

  it('the detective judge is unchanged (D13)', () => {
    const state = { ...reworkFixtureState('detective'), _arcAnalysisCache: { writerQuestions: [Q_SARAH] } };
    const prompt = buildEvaluationUserPrompt('arcs', state, {});
    expect(prompt).not.toContain('QUESTIONS FOR THE DIRECTOR');
    expect(prompt).toContain('1. ROSTER COVERAGE: Every name in SESSION ROSTER needs a role in characterPlacements of at least one arc');
    expect(getArcCriteria('detective').rosterCoverage.description).toBe('Does every roster member have a placement in at least one arc?');
  });
});

describe('the arc writer\'s roster lines offer the question (C7, C15)', () => {
  it('the journalist system prompt\'s output list', () => {
    expect(subagents.CORE_ARC_SYSTEM_PROMPT).toContain('- Each roster member has a placement the record shows, or a writerQuestions entry about them (C7, C15)');
    expect(subagents.CORE_ARC_SYSTEM_PROMPT).not.toContain('Every roster member has at least one placement');
  });

  it('the journalist writer\'s roster heading, character categories and OUTPUT FORMAT', () => {
    const prompt = arcNodes._testing.buildCoreArcPrompt(reworkFixtureState('journalist'));
    expect(prompt).toContain('### Session Roster (the players at the investigation)');
    expect(prompt).toContain('**ROSTER PCs** (each has a placement the record shows, or a writerQuestions entry about them - they were in the room;');
    expect(prompt).not.toMatch(/MUST have placements|ALL characters who need placement/);
    expect(prompt).toContain('"writerQuestions": [');
  });

  it('the detective writer keeps its lines (D13)', () => {
    const prompt = arcNodes._testing.buildCoreArcPrompt(reworkFixtureState('detective'));
    expect(prompt).toContain('### Session Roster (ALL characters who need placement)');
    expect(prompt).toContain('**ROSTER PCs** (MUST have placements - present at the investigation):');
    expect(prompt).not.toContain('writerQuestions');
    expect(subagents.DETECTIVE_CORE_ARC_SYSTEM_PROMPT).toContain('- Every roster member has at least one placement');
  });
});

// The reworker carries the writer's sections, so it is shown the same OUTPUT FORMAT.
describe('the arc reworker carries the writer\'s OUTPUT FORMAT with the field', () => {
  it('journalist', () => {
    const state = reworkFixtureState('journalist');
    const prompt = arcNodes._testing.buildArcRevisionPrompt({ ...state, _previousArcs: state.narrativeArcs }, 'CTX', 'PREV');
    expect(prompt).toContain('"writerQuestions": [');
  });
});

