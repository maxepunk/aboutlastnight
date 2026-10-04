/**
 * The writers' questions (phase 3, brief 3.7; spec C15, C7, T9, T5 and R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a
 * ledger line looks wrong, a writer asks the director instead of guessing. The
 * questions ride in one optional field, `writerQuestions`, on the outline and the
 * article, at the top level. The director reads them at the stop and answers with the
 * stop's note.
 *
 * Phase 4 (brief 4.4): the arc writer's questions are the weave's own (`weave.questions`,
 * WEAVE_QUESTIONS_PROPERTY), each with an id and what its answer changes, and their
 * kinds are C15's player, pronoun and figure. lib/__tests__/weave.test.js pins their
 * shape; this file follows their carry through the arc rework (R5).
 *
 * - A rework carries forward every question it did not answer (R5): only the director
 *   answers one. On an automatic pass a question the rework returns replaces each
 *   earlier question of the same kind and `about` (case and spacing folded), in its
 *   place, and an earlier question whose kind and `about` the rework returned nothing
 *   for is kept (phase 3, 3.10); after the director's note the rework's list replaces
 *   the old one; a rework that returns no field keeps the previous list.
 * - The field never prints, and never reaches the template, the fact check's printed
 *   text or a later writer's prompt.
 * - Roster coverage left the arc stage (phase 4, brief 4.4), and with it the rule that a
 *   question of kind "player" covered a player there. The article fact check's
 *   coverage is unchanged.
 * - The detective is parked (spec D13): its outline and article schemas, prompts and
 *   checks do not change. Its arc stage went (R1).
 */

const { SchemaValidator } = require('../schema-validator');
const outlineSchema = require('../schemas/outline.schema.json');
const contentBundleSchema = require('../schemas/content-bundle.schema.json');
const detectiveBundleCopy = require('../schemas/content-bundle.detective-prompt.json');
const arcNodes = require('../workflow/nodes/arc-specialist-nodes');
const aiNodes = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { PromptBuilder } = require('../prompt-builder');
const { PHASE_REQUIREMENTS } = require('../theme-loader');
const { diffOutline, diffBundle } = require('../hand-edit-diff');
const { TemplateAssembler } = require('../template-assembler');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

const clone = (v) => JSON.parse(JSON.stringify(v));

// Fix 3.7b (finding 1): each question carries its kind, one of C15's three cases.
const Q_SARAH = { kind: 'player', about: 'Sarah', question: 'The record holds nothing Sarah did this morning: where was Sarah?' };
const Q_FULL = { kind: 'player', about: 'Sarah Blackwood', question: 'The record holds nothing Sarah Blackwood did: what did the room see?' };
const Q_LEDGER = { kind: 'ledger', about: 'The 07:50 AM sale of $75,000 into Melanie', question: 'Is this sale a duplicate entry?' };
const Q_PRONOUN = { kind: 'pronoun', about: 'Riley', question: 'The roster gives Riley no pronoun: which one?' };
const QUESTION_TEXTS = [Q_SARAH, Q_FULL, Q_LEDGER, Q_PRONOUN].map((q) => q.question);

// Phase 4 (brief 4.4): the weave's questions, each with an id and what its answer changes.
const W_SARAH = { id: 'q1', kind: 'player', about: 'Sarah', question: 'The record holds nothing Sarah did this morning: where was Sarah?', changes: 'Whether Sarah prints in the story.' };
const W_FIGURE = { id: 'q2', kind: 'figure', about: 'The 07:50 AM sale of $75,000 into Melanie', question: 'Is this sale a duplicate entry?', changes: "The money section's total." };
const W_PRONOUN = { id: 'q3', kind: 'pronoun', about: 'Riley', question: 'The roster gives Riley no pronoun: which one?', changes: "Riley's pronoun in print." };

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** The field, wherever a schema defines it: an optional list of {kind, about, question}. */
function expectQuestionsField(schema, label) {
  const field = schema.properties && schema.properties.writerQuestions;
  expect(`${label}: ${field ? 'has' : 'lacks'} writerQuestions`).toBe(`${label}: has writerQuestions`);
  expect(field.type).toBe('array');
  expect(field.items.type).toBe('object');
  expect(field.items.properties.kind).toEqual(expect.objectContaining({ type: 'string', enum: ['player', 'pronoun', 'ledger'] }));
  expect(field.items.properties.about.type).toBe('string');
  expect(field.items.properties.question.type).toBe('string');
  expect(field.items.required).toEqual(['kind', 'about', 'question']);
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

// Phase 4 (brief 4.4): the arc writer's and the arc reworker's schemas went with the
// weave, whose questions have their own property (weave.test.js). The field stays on the
// outline and the bundle until 4.6 and 4.7 drop it.
describe('the optional writerQuestions field in the four schemas', () => {
  it('the outline schema, at the top level, and the validator accepts it', () => {
    expectQuestionsField(outlineSchema, 'outline.schema.json');
    const validator = new SchemaValidator();
    const outline = { lede: { hook: 'Marcus died with a sale on his lips.' } };
    expect(validator.validate('outline', outline).valid).toBe(true);
    expect(validator.validate('outline', { ...outline, writerQuestions: [Q_SARAH] }).valid).toBe(true);
    expect(validator.validate('outline', { ...outline, writerQuestions: [{ about: 'Sarah' }] }).valid).toBe(false);
    // Fix 3.7b: the kind is required, and is one of the three.
    const { kind, ...noKind } = Q_SARAH;
    expect(validator.validate('outline', { ...outline, writerQuestions: [noKind] }).valid).toBe(false);
    expect(validator.validate('outline', { ...outline, writerQuestions: [{ ...Q_SARAH, kind: 'other' }] }).valid).toBe(false);
  });

  it('the content-bundle schema, at the top level, and the validator accepts it', () => {
    expectQuestionsField(contentBundleSchema, 'content-bundle.schema.json');
    const validator = new SchemaValidator();
    const bundle = clone(require('../../__tests__/fixtures/content-bundles/valid-journalist.json'));
    expect(validator.validate('content-bundle', bundle).valid).toBe(true);
    expect(validator.validate('content-bundle', { ...bundle, writerQuestions: [Q_LEDGER] }).valid).toBe(true);
    const { kind, ...noKind } = Q_LEDGER;
    expect(validator.validate('content-bundle', { ...bundle, writerQuestions: [noKind] }).valid).toBe(false);
  });

  it('the descriptions state the shape and name C15, with no em-dash', () => {
    for (const schema of [outlineSchema, contentBundleSchema]) {
      const field = schema.properties.writerQuestions;
      expect(field.description).toMatch(/C15/);
      expect(field.items.properties.kind.description).toMatch(/C15/);
      expect(field.items.properties.about.description).toMatch(/player's name/);
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
  });

  it('the detective\'s frozen copy of the content-bundle schema keeps the live shape', () => {
    expect(detectiveBundleCopy.properties.writerQuestions).toEqual(
      expect.objectContaining({ type: 'array' })
    );
  });
});

describe('the detective\'s calls do not ask for the field (spec D13)', () => {
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

describe("the arc writer's questions reach the weave", () => {
  // Phase 4 (brief 4.4): the merge with the interweaving went; the writer's weave
  // carries its questions, the well-formed ones only (weaveQuestionsOf).
  it('the arc analysis stores the well-formed ones on the weave, in order', async () => {
    const state = reworkFixtureState('journalist');
    const sdk = sdkReturning({ ...clone(state.weave), questions: [W_SARAH, { kind: 'player', about: 'Kai' }, W_FIGURE] });
    const result = await arcNodes.analyzeArcsPlayerFocusGuided({ ...state, weave: null }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    expect(result.weave.questions).toEqual([W_SARAH, W_FIGURE]);
    expect(result).not.toHaveProperty('_arcAnalysisCache');
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

/**
 * Phase 3, brief 3.10 (the ledger's ruling on 3.7 finding 6, after the gate): on an
 * automatic pass a rework's question replaces the earlier ones on its subject. The union
 * kept a question and its reworded copy, so the gate's arc and outline stops showed 16
 * questions with one pronoun asked two or three times, in a list built to be skimmed
 * (D8). Every unanswered subject is still kept (R5): an earlier question stays whenever
 * the rework returned nothing of its kind and `about`.
 *
 * The gate's call log (092026, every arc, outline and article write and rework) worded a
 * repeated question's `about` the same across passes when it named one player ("Mel",
 * "Remi"), and differently when the writer regrouped its subjects: "Kai", "Remi" and
 * "Mel" became "Kai, Remi, Mel" and "Alex, Jess, Kai, Mel, Sam, Sarah, Vic"; a ledger
 * question's time and amount were reworded between the arcs and the outline; the article
 * names a player in full ("Ashe Motoko") where the arcs used the first name. Only case
 * and spacing are folded, so a regrouped subject is a new subject, and its earlier
 * questions stay.
 */
describe('an automatic pass replaces each earlier question on the subject the rework asks about (phase 3, 3.10)', () => {
  const { carriedWriterQuestions } = require('../writer-questions');
  const AUTOMATIC = { afterDirectorNote: false };
  const pronoun = (about, question) => ({ kind: 'pronoun', about, question });

  it("the gate's case: one pronoun question asked three times across passes ends as one", () => {
    const asked = [
      pronoun('Remi', "Neither the roster nor the notes give Remi's pronouns. Which should print?"),
      pronoun('Remi', 'The evaluation reports the roster gives Remi she/her. Confirm for print?'),
      pronoun(' REMI ', 'The arcs use she/her for Remi, as the evaluation reports. Confirm?')
    ];
    let questions = [Q_SARAH, asked[0]];
    questions = carriedWriterQuestions([Q_SARAH, asked[1]], questions, AUTOMATIC);
    questions = carriedWriterQuestions([Q_SARAH, asked[2]], questions, AUTOMATIC);
    expect(questions.filter((q) => q.kind === 'pronoun')).toEqual([{ ...asked[2], about: 'REMI' }]);
    expect(questions).toHaveLength(2);
  });

  it('a replacement takes the place of the question it replaces, and new questions follow', () => {
    const reworded = { ...Q_LEDGER, question: 'Is the 07:50 AM sale entered twice?' };
    expect(carriedWriterQuestions([Q_PRONOUN, reworded], [Q_SARAH, Q_LEDGER, Q_FULL], AUTOMATIC))
      .toEqual([Q_SARAH, reworded, Q_FULL, Q_PRONOUN]);
  });

  it('each earlier question of the subject goes, and every question the rework asks on it takes the first one\'s place', () => {
    const second = { ...Q_SARAH, question: 'Did Sarah vote?' };
    const restated = { ...Q_SARAH, question: 'What did Sarah do this morning?' };
    const followUp = { ...Q_SARAH, question: 'Who saw Sarah with Blake?' };
    expect(carriedWriterQuestions([restated, followUp], [Q_SARAH, Q_LEDGER, second], AUTOMATIC))
      .toEqual([restated, followUp, Q_LEDGER]);
  });

  it('`about` is compared with case and spacing folded, and nothing looser', () => {
    const spaced = { kind: 'player', about: '  sarah ', question: 'Where was Sarah at the check-in?' };
    expect(carriedWriterQuestions([spaced], [Q_SARAH], AUTOMATIC)).toEqual([{ ...spaced, about: 'sarah' }]);
    // A full name, or a group of names, is another subject: the earlier question stays.
    expect(carriedWriterQuestions([Q_FULL], [Q_SARAH], AUTOMATIC)).toEqual([Q_SARAH, Q_FULL]);
    const group = pronoun('Kai, Riley', 'The roster gives Kai and Riley no pronoun: which ones?');
    expect(carriedWriterQuestions([group], [Q_PRONOUN], AUTOMATIC)).toEqual([Q_PRONOUN, group]);
  });

  it('the kind must match too, and an absent kind matches only an absent kind', () => {
    const ledgerOnSarah = { kind: 'ledger', about: 'Sarah', question: 'Is the Sarah account entered twice?' };
    expect(carriedWriterQuestions([ledgerOnSarah], [Q_SARAH], AUTOMATIC)).toEqual([Q_SARAH, ledgerOnSarah]);
    const oldNoKind = { about: 'Sarah', question: 'Where was Sarah?' };
    const newNoKind = { about: 'Sarah', question: 'Where was Sarah during the vote?' };
    expect(carriedWriterQuestions([newNoKind], [oldNoKind, Q_SARAH], AUTOMATIC)).toEqual([newNoKind, Q_SARAH]);
    expect(carriedWriterQuestions([newNoKind], [Q_SARAH], AUTOMATIC)).toEqual([Q_SARAH, newNoKind]);
  });

  it('an earlier question is kept when the rework returns nothing of its kind and about', () => {
    expect(carriedWriterQuestions([Q_PRONOUN], [Q_SARAH, Q_LEDGER], AUTOMATIC)).toEqual([Q_SARAH, Q_LEDGER, Q_PRONOUN]);
    expect(carriedWriterQuestions([], [Q_SARAH, Q_LEDGER], AUTOMATIC)).toEqual([Q_SARAH, Q_LEDGER]);
  });

  it('after the director\'s note the rework\'s list still replaces the old one, and no list keeps it', () => {
    const reworded = { ...Q_SARAH, question: 'Where was Sarah at the vote?' };
    expect(carriedWriterQuestions([reworded], [Q_SARAH, Q_LEDGER], { afterDirectorNote: true })).toEqual([reworded]);
    expect(carriedWriterQuestions(undefined, [Q_SARAH, Q_LEDGER], AUTOMATIC)).toEqual([Q_SARAH, Q_LEDGER]);
  });

  // Phase 4 (brief 4.4): the weave's questions carry an id, and the arc rework's
  // version of a question replaces it by that id (carriedWeaveQuestions).
  it('the three reworks replace in place on an automatic pass', async () => {
    const reworded = { ...Q_SARAH, question: 'What did Sarah do at the check-in?' };
    const rewordedInWeave = { ...W_SARAH, question: 'What did Sarah do at the check-in?' };
    const arcState = reworkFixtureState('journalist');
    const arcResult = await arcNodes.reviseArcs(
      { ...arcState, weave: { ...clone(arcState.weave), questions: [W_SARAH, W_FIGURE] } },
      { configurable: { sdkClient: sdkReturning({ ...clone(arcState.weave), questions: [rewordedInWeave] }) } }
    );
    expect(arcResult.weave.questions).toEqual([rewordedInWeave, W_FIGURE]);

    const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: aiNodes.createMockPromptBuilder(), theme: 'journalist' } });
    const outlineResult = await aiNodes.reviseOutline(
      { _previousOutline: { ...clone(OUTLINE), writerQuestions: [Q_SARAH, Q_LEDGER] }, outlineRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(OUTLINE), writerQuestions: [reworded] }))
    );
    expect(outlineResult.outline.writerQuestions).toEqual([reworded, Q_LEDGER]);

    const articleResult = await aiNodes.reviseContentBundle(
      { _previousContentBundle: { ...clone(PREVIOUS_BUNDLE), writerQuestions: [Q_SARAH, Q_LEDGER] }, articleRevisionCount: 1 },
      cfg(sdkReturning({ ...clone(PREVIOUS_BUNDLE), writerQuestions: [reworded] }))
    );
    expect(articleResult.contentBundle.writerQuestions).toEqual([reworded, Q_LEDGER]);
  });
});

// Fix 3.7b (finding 1): the normalizer keeps a question's kind when it is one of the
// three, and still keeps a question with no kind (a list from before the field had
// one), so an old list renders.
describe('writerQuestionsOf keeps the kind', () => {
  const { writerQuestionsOf } = require('../writer-questions');

  it('keeps each of the three kinds', () => {
    expect(writerQuestionsOf([Q_SARAH, Q_PRONOUN, Q_LEDGER])).toEqual([Q_SARAH, Q_PRONOUN, Q_LEDGER]);
  });

  it('keeps a question with no kind, or an unknown one, without a kind', () => {
    expect(writerQuestionsOf([{ about: 'Sarah', question: 'Where?' }, { kind: 'other', about: 'Alex', question: 'Who?' }]))
      .toEqual([{ about: 'Sarah', question: 'Where?' }, { about: 'Alex', question: 'Who?' }]);
  });
});

// Phase 4 (brief 4.4): the arc rework reads and returns the weave, its questions in it.
// Brief 4.5: a director's round is marked explicitly (`_meetingRound`), and every rework
// keeps each question the director has not answered (C15, ruling 4).
describe('an arc rework carries forward the questions it did not answer (R5)', () => {
  function reworkState(previousQuestions, feedback = null) {
    const state = reworkFixtureState('journalist');
    return {
      ...state, _arcFeedback: feedback, ...(feedback && { _meetingRound: 'send-back' }),
      weave: { ...clone(state.weave), questions: previousQuestions }
    };
  }
  /** The weave the rework returns: the one it started from, with these questions, or none. */
  function returned(state, questions) {
    const weave = clone(state.weave);
    if (questions === undefined) delete weave.questions;
    else weave.questions = questions;
    return weave;
  }

  it('shows the previous questions in the rework prompt, inside the previous weave', async () => {
    const state = reworkState([W_SARAH]);
    const sdk = sdkReturning(returned(state, [W_SARAH]));
    await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    const { prompt } = sdk.mock.calls[0][0];
    const previous = prompt.slice(prompt.indexOf('PREVIOUS WEAVE OUTPUT'), prompt.indexOf('END PREVIOUS OUTPUT'));
    expect(previous).toContain(JSON.stringify(W_SARAH.question));
    expect(prompt).not.toContain('PREVIOUS QUESTIONS FOR THE DIRECTOR');
  });

  it('keeps the previous list when the rework returns no field', async () => {
    const state = reworkState([W_SARAH, W_FIGURE]);
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, undefined)) } });
    expect(result.weave.questions).toEqual([W_SARAH, W_FIGURE]);
  });

  it("keeps a question a send-back's rework left out: the note answers no question, only its box does", async () => {
    const state = reworkState([W_SARAH, W_FIGURE], 'Sarah sold the first memory at 07:50 AM.');
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, [W_FIGURE])) } });
    expect(result.weave.questions).toEqual([W_SARAH, W_FIGURE]);
  });

  it("keeps an answered question whole, with its answer, through a send-back whose rework returns no questions at all", async () => {
    const answered = { ...W_SARAH, answer: 'Sarah ran the bar all morning.' };
    const state = reworkState([answered, W_FIGURE], 'Rethink the money thread.');
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, [])) } });
    expect(result.weave.questions).toEqual([answered, W_FIGURE]);
    const none = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, undefined)) } });
    expect(none.weave.questions).toEqual([answered, W_FIGURE]);
  });

  it("keeps an answered question whole through a reweave that rewords it, and reads no answer the rework wrote", async () => {
    const answered = { ...W_SARAH, answer: 'Sarah ran the bar all morning.' };
    const state = { ...reworkState([answered, W_FIGURE]), _meetingRound: 'reweave' };
    const rework = [{ ...W_SARAH, question: 'Where was Sarah at nine?', answer: 'At the bar.' }, { ...W_FIGURE, answer: 'Not a duplicate.' }];
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, rework)) } });
    expect(result.weave.questions).toEqual([answered, W_FIGURE]);
  });

  it('adds the rework\'s own new questions', async () => {
    const state = reworkState([W_FIGURE]);
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, [W_FIGURE, W_PRONOUN])) } });
    expect(result.weave.questions).toEqual([W_FIGURE, W_PRONOUN]);
  });

  it('an automatic pass keeps a question its rework left out, beside the rework\'s own', async () => {
    const state = reworkState([W_SARAH, W_FIGURE]);
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, [W_FIGURE, W_PRONOUN])) } });
    expect(result.weave.questions).toEqual([W_SARAH, W_FIGURE, W_PRONOUN]);
  });

  it('an automatic pass whose rework returns an empty list keeps every previous question', async () => {
    const state = reworkState([W_SARAH, W_FIGURE]);
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdkReturning(returned(state, [])) } });
    expect(result.weave.questions).toEqual([W_SARAH, W_FIGURE]);
  });

  it('keeps the questions with the weave on the free timeout retry', async () => {
    const state = reworkState([W_SARAH]);
    const sdk = jest.fn().mockRejectedValueOnce(new Error('SDK timeout after 300.0s (limit: 300s)'));
    const result = await arcNodes.reviseArcs(state, { configurable: { sdkClient: sdk } });
    expect(result._arcReworkTimeout).toMatchObject({ consecutive: 1 });
    // The weave, its questions in it, stays in its channel: the rework writes none.
    expect(result).not.toHaveProperty('weave');
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

// The reworker carries the writer's sections, so it is shown the same OUTPUT FORMAT.
// Phase 4 (brief 4.4): the weave's, whose questions stay empty unless the record leaves
// something only the director can settle, each entry's kinds and `about` in the
// schema's own wording.
describe('the arc reworker carries the writer\'s OUTPUT FORMAT with the field', () => {
  it('journalist', () => {
    const { WEAVE_QUESTIONS_PROPERTY } = require('../writer-questions');
    const prompt = arcNodes._testing.buildArcRevisionPrompt(reworkFixtureState('journalist'), 'CTX', 'PREV');
    expect(prompt).toContain('  "questions": []\n}\n');
    expect(prompt).toContain('"questions" stays [] unless the record leaves something only the director can settle (C15). Each entry:\n{ "id": "q1", "kind": "player" | "pronoun" | "figure", ');
    expect(prompt).toContain(`"about": ${JSON.stringify(WEAVE_QUESTIONS_PROPERTY.items.properties.about.description)}, `);
    expect(prompt).not.toContain('writerQuestions');
  });
});


// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: question repeats clear on a rework
// ═══════════════════════════════════════════════════════════════════════════
//
// carriedWeaveQuestions pairs the questions under a repeated id by occurrence, as the diff
// pairs elements (lib/hand-edit-diff.js): the first under an id with the first, the second
// with the second. An occurrence the rework returned under no such place is one it gave an
// id of its own: it pairs, in order, with the rework's questions under the ids the weave
// did not hold. Keyed by id alone, a repeated question id survived every rework, and a
// rework that renumbered printed one question twice (4.5 re-review).
describe('4.5b: question repeats clear on a rework (carriedWeaveQuestions)', () => {
  const { carriedWeaveQuestions } = require('../writer-questions');
  const MORGAN = { ...W_SARAH, about: 'Morgan', question: 'The record holds nothing Morgan did: what did Morgan do?', changes: 'Whether Morgan prints.' };
  const ANSWER = 'Morgan ran the door.';
  const ids = (questions) => questions.map((q) => q.id);
  const abouts = (questions) => questions.map((q) => q.about);

  it("the re-review's case: the rework renumbers to q1, q2; the answer stays with its question, under the rework's id, and no question appears twice", () => {
    const previous = [W_SARAH, { ...MORGAN, answer: ANSWER }];
    const returned = [clone(W_SARAH), { ...MORGAN, id: 'q2' }];
    const carried = carriedWeaveQuestions(returned, previous);
    expect(carried).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }]);
    expect(abouts(carried)).toEqual(['Sarah', 'Morgan']);
  });

  it('a rework that renumbers two unanswered questions clears the repeat', () => {
    const carried = carriedWeaveQuestions([{ ...W_SARAH, question: 'Where was Sarah at nine?' }, { ...MORGAN, id: 'q4' }], [W_SARAH, MORGAN]);
    expect(ids(carried)).toEqual(['q1', 'q4']);
    expect(abouts(carried)).toEqual(['Sarah', 'Morgan']);
    expect(carried[0].question).toBe('Where was Sarah at nine?');
  });

  it('a rework that keeps the repeat keeps each question once, paired in order: each keeps its own question', () => {
    const reworded = [{ ...W_SARAH, question: 'Where was Sarah at nine?' }, { ...MORGAN, question: 'What did Morgan do at the door?' }];
    expect(carriedWeaveQuestions(reworded, [W_SARAH, MORGAN])).toEqual(reworded);
    expect(carriedWeaveQuestions(reworded, [W_SARAH, { ...MORGAN, answer: ANSWER }])).toEqual([reworded[0], { ...MORGAN, answer: ANSWER }]);
  });

  it("an occurrence the rework left out comes back in its place, and the rework's other new questions follow", () => {
    expect(carriedWeaveQuestions([clone(W_SARAH)], [W_SARAH, { ...MORGAN, answer: ANSWER }])).toEqual([W_SARAH, { ...MORGAN, answer: ANSWER }]);
    const carried = carriedWeaveQuestions([clone(W_SARAH), { ...MORGAN, id: 'q2' }, clone(W_PRONOUN)], [W_SARAH, MORGAN]);
    expect(ids(carried)).toEqual(['q1', 'q2', 'q3']);
    expect(abouts(carried)).toEqual(['Sarah', 'Morgan', 'Riley']);
  });

  it('through the arc rework: the weave it stores holds each question once, and the checks find no repeat', async () => {
    const state = reworkFixtureState('journalist');
    const previous = { ...clone(state.weave), questions: [W_SARAH, { ...MORGAN, answer: ANSWER }] };
    const fixState = {
      ...state, weave: previous, arcRevisionCount: 1,
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['Two questions share the id "q1". Give each question an id of its own.'] }
    };
    const rework = { ...clone(previous), questions: [clone(W_SARAH), { ...MORGAN, id: 'q2' }] };
    const result = await arcNodes.reviseArcs(fixState, { configurable: { sdkClient: sdkReturning(rework) } });
    expect(result.weave.questions).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }]);
    const checked = arcNodes.validateArcStructure({ ...fixState, ...result }, {});
    expect(checked._arcValidation.failures).toEqual([]);
  });
});
