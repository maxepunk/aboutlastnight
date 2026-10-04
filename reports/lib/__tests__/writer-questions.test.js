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
 * - Phase 4 (brief 4.6): the outline is the story map, and the writers' questions left
 *   its schema. The map's rework carries none; the article's stay until 4.7.
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
// weave, whose questions have their own property (weave.test.js). Brief 4.6: the outline's
// went with the map. The field stays on the bundle until 4.7 drops it.
describe('the optional writerQuestions field in the four schemas', () => {
  it("the map's schema has none, and the director-side gate refuses the field (brief 4.6)", () => {
    const { directorMapProblems } = require('../map');
    expect(outlineSchema.properties).not.toHaveProperty('writerQuestions');
    expect(directorMapProblems(clone(OUTLINE), { theme: 'journalist' })).toBeNull();
    expect(directorMapProblems({ ...clone(OUTLINE), writerQuestions: [Q_SARAH] }, { theme: 'journalist' }))
      .toMatch(/must NOT have additional properties/);
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
    for (const schema of [contentBundleSchema]) {
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
      .buildArticlePrompt({}, null, [], null, null, null, {});
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
  // version of a question replaces it by that id (carriedWeaveQuestions). Brief 4.6: the
  // map's rework has no questions.
  it('the arc and article reworks replace in place on an automatic pass', async () => {
    const reworded = { ...Q_SARAH, question: 'What did Sarah do at the check-in?' };
    const rewordedInWeave = { ...W_SARAH, question: 'What did Sarah do at the check-in?' };
    const arcState = reworkFixtureState('journalist');
    const arcResult = await arcNodes.reviseArcs(
      { ...arcState, weave: { ...clone(arcState.weave), questions: [W_SARAH, W_FIGURE] } },
      { configurable: { sdkClient: sdkReturning({ ...clone(arcState.weave), questions: [rewordedInWeave] }) } }
    );
    expect(arcResult.weave.questions).toEqual([rewordedInWeave, W_FIGURE]);

    const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: aiNodes.createMockPromptBuilder(), theme: 'journalist' } });
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

// Brief 4.6: the map holds no questions, so the map's rework carries none; the article's
// rework keeps what it did not answer.
describe('an outline or article rework carries forward the questions it did not answer (R5)', () => {
  const cfg = (sdk) => ({ configurable: { sdkClient: sdk, promptBuilder: aiNodes.createMockPromptBuilder(), theme: 'journalist' } });

  it("reviseOutline: the map's rework carries no questions, even from a map stored with them", async () => {
    const previous = { ...clone(OUTLINE), writerQuestions: [Q_SARAH] };
    const result = await aiNodes.reviseOutline({ _previousOutline: previous, outlineRevisionCount: 1 }, cfg(sdkReturning(OUTLINE)));
    expect(result.outline).toEqual(OUTLINE);
    expect(result.outline).not.toHaveProperty('writerQuestions');
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

  // Brief 4.6: the map writer reads the weave's questions in the settled weave alone, each
  // with the director's answer or "Unanswered.", and no other list of questions.
  it("the map writer's prompt carries the weave's questions in the settled weave alone", async () => {
    const sdk = sdkReturning(OUTLINE);
    const state = withQuestions(reworkFixtureState('journalist'));
    await aiNodes.generateOutline({ ...state, outline: null }, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    const { prompt } = sdk.mock.calls[0][0];
    const weaveQuestion = state.weave.questions[0].question;
    const settled = prompt.slice(prompt.indexOf('<SETTLED_WEAVE>'), prompt.indexOf('</SETTLED_WEAVE>'));
    expect(settled).toContain(weaveQuestion);
    expect(prompt.split(weaveQuestion)).toHaveLength(2);
    QUESTION_TEXTS.forEach((q) => expect(prompt).not.toContain(q));
    expect(prompt).not.toContain('writerQuestions');
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

  // Phase 4 (brief 4.6): the outline judge left the graph.
  it.each(['article'])('the %s judge\'s JSON carries none of the questions', (phase) => {
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
// carriedWeaveQuestions pairs a previous question with the rework's only when they read as
// the same question: the same words, then the same subject (its kind and `about`), each in
// its place under its id first, then a question of its kind in its place whose `about` names
// the same subject in other words (in an answered question's place, with the question's own
// words too). A question's place is its occurrence under its id (lib/weave.js
// occurrenceKeys), as the diff pairs elements: the first under an id with the first, the
// second with the second. The rework's ids stand, and a question that comes back takes an id
// of its own when another holds its id. Keyed by id alone, a repeated question id survived
// every rework, and a rework that renumbered printed one question twice (4.5 re-review).
// Paired by place alone, a rework that renumbered in order handed the director's answer to
// another question and dropped a question (fix round 1, finding 1). Paired by sameness alone,
// a rephrased `about` kept the answered question beside the rework's copy of it, and a
// question that came back beside the rework's question under its id made a repeat the rework
// never returned (fix round 2, findings 3 and 4). Paired in its place by kind alone, a
// question on another player or another ledger entry took a previous question's place and
// one of the two was dropped (fix round 3, finding 1).
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

  it("an occurrence the rework left out comes back in its place, under an id of its own when the rework holds its id, and the rework's other new questions follow", () => {
    expect(carriedWeaveQuestions([clone(W_SARAH)], [W_SARAH, { ...MORGAN, answer: ANSWER }])).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }]);
    const carried = carriedWeaveQuestions([clone(W_SARAH), { ...MORGAN, id: 'q2' }, clone(W_PRONOUN)], [W_SARAH, MORGAN]);
    expect(ids(carried)).toEqual(['q1', 'q2', 'q3']);
    expect(abouts(carried)).toEqual(['Sarah', 'Morgan', 'Riley']);
  });

  it('through the arc rework: the weave it stores holds each question once, and the checks find no repeat', async () => {
    const state = reworkFixtureState('journalist');
    const previous = { ...clone(state.weave), questions: [W_SARAH, { ...MORGAN, answer: ANSWER }] };
    // The meeting is open, so the checks run whatever the shared fixture holds.
    const fixState = {
      ...state, weave: previous, arcRevisionCount: 1, meetingApproved: null,
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['Two questions share the id "q1". Give each question an id of its own.'] }
    };
    const rework = { ...clone(previous), questions: [clone(W_SARAH), { ...MORGAN, id: 'q2' }] };
    const result = await arcNodes.reviseArcs(fixState, { configurable: { sdkClient: sdkReturning(rework) } });
    expect(result.weave.questions).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }]);
    const checked = arcNodes.validateArcStructure({ ...fixState, ...result }, {});
    expect(checked._arcValidation.failures).toEqual([]);
  });

  // Fix round 1, finding 1: two questions pair only when they are the same question.
  const RILEY = { ...W_PRONOUN, id: 'q2' };
  const REPEAT_FAILURE = { type: 'duplicate-id', message: 'Two questions share the id "q1". Give each question an id of its own.' };

  it('a renumbering in order pairs each question with its own: the answer stays with its question, and the question after it is kept', () => {
    const carried = carriedWeaveQuestions(
      [clone(W_SARAH), { ...MORGAN, id: 'q2' }, { ...RILEY, id: 'q3' }],
      [W_SARAH, { ...MORGAN, answer: ANSWER }, RILEY]
    );
    expect(carried).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }, { ...RILEY, id: 'q3' }]);
  });

  it('a renumbering of the first occurrence pairs each question with its own', () => {
    expect(carriedWeaveQuestions([{ ...W_SARAH, id: 'q2' }, clone(MORGAN)], [W_SARAH, { ...MORGAN, answer: ANSWER }]))
      .toEqual([{ ...W_SARAH, id: 'q2' }, { ...MORGAN, answer: ANSWER }]);
  });

  it('a swapped pair keeps each question once, in its place; the repeat stays as the rework left it', () => {
    expect(carriedWeaveQuestions([clone(MORGAN), clone(W_SARAH)], [W_SARAH, { ...MORGAN, answer: ANSWER }]))
      .toEqual([W_SARAH, { ...MORGAN, answer: ANSWER }]);
  });

  it('a reworded question pairs in its place, then by its subject under another id', () => {
    const where = { ...W_SARAH, question: 'Where was Sarah at nine?' };
    const door = { ...MORGAN, id: 'q2', question: 'What did Morgan do at the door?' };
    expect(carriedWeaveQuestions([where, door], [W_SARAH, { ...MORGAN, answer: ANSWER }]))
      .toEqual([where, { ...MORGAN, id: 'q2', answer: ANSWER }]);
  });

  it('two questions on one subject pair by their words: a renumbering of the first, and a swap of their ids', () => {
    const WHERE = { ...W_SARAH, question: 'Where was Sarah at nine?' };
    const VOTE = { ...W_SARAH, question: 'Did Sarah vote?' };
    expect(carriedWeaveQuestions([{ ...WHERE, id: 'q2' }, clone(VOTE)], [{ ...WHERE, answer: ANSWER }, VOTE]))
      .toEqual([{ ...WHERE, id: 'q2', answer: ANSWER }, VOTE]);
    expect(carriedWeaveQuestions([{ ...WHERE, id: 'q2' }, clone(VOTE)], [{ ...WHERE, answer: ANSWER }, { ...VOTE, id: 'q2' }]))
      .toEqual([{ ...WHERE, id: 'q2', answer: ANSWER }, VOTE]);
  });

  it('each step pairs every question before the next: a question the rework reworded never takes the copy of another', () => {
    const WHERE = { ...W_SARAH, question: 'Where was Sarah at nine?' };
    const VOTE = { ...W_SARAH, id: 'q2', question: 'Did Sarah vote?' };
    const rewordedWhere = { ...WHERE, id: 'q4', question: 'Where was Sarah when the bar opened?' };
    expect(carriedWeaveQuestions([{ ...VOTE, id: 'q3' }, rewordedWhere], [{ ...WHERE, answer: ANSWER }, VOTE]))
      .toEqual([{ ...WHERE, id: 'q4', answer: ANSWER }, { ...VOTE, id: 'q3' }]);
  });

  // Fix round 2, finding 3: a question in a previous question's place and of its kind is
  // that question with its `about` rephrased (4.5 read a question under its id as the same
  // question), when its `about` names the same subject (fix round 3). In an answered
  // question's place the question's own words must be the same too: the rework reads the
  // director's answer, so a question in other words there is new.
  const SARAH_IN_FULL = { ...W_SARAH, about: 'Sarah Blackwood' };
  const FIGURE = { ...W_FIGURE, id: 'q1' };
  const SARAH_PRONOUN = { ...W_SARAH, kind: 'pronoun', question: 'The roster gives Sarah no pronoun: which one?', changes: "Sarah's pronoun in print." };

  it("an answered question whose `about` the rework gives in full, in its place, is the answered question: it stays whole, once", () => {
    expect(carriedWeaveQuestions([clone(SARAH_IN_FULL)], [{ ...W_SARAH, answer: ANSWER }])).toEqual([{ ...W_SARAH, answer: ANSWER }]);
  });

  it("a figure whose `about` the rework rephrases, in its place, is the same question: the rework's version once, or, answered, the director's whole", () => {
    const rephrased = { ...FIGURE, about: '07:50 AM, $75,000 into Melanie' };
    expect(carriedWeaveQuestions([clone(rephrased)], [FIGURE])).toEqual([rephrased]);
    expect(carriedWeaveQuestions([{ ...FIGURE, about: 'The $75,000 sale into Melanie at 07:50 AM' }, clone(RILEY)], [{ ...FIGURE, answer: 'A duplicate.' }, RILEY]))
      .toEqual([{ ...FIGURE, answer: 'A duplicate.' }, RILEY]);
  });

  it("a question of its kind on another player, in an unanswered question's place, is a new question: both stay, the previous one under an id of its own", () => {
    expect(carriedWeaveQuestions([clone(MORGAN)], [W_SARAH])).toEqual([{ ...W_SARAH, id: 'q2' }, MORGAN]);
  });

  it("a question of its kind in other words, in an answered question's place, is a new question: both stay, the answered one under an id of its own", () => {
    expect(carriedWeaveQuestions([clone(MORGAN)], [{ ...W_SARAH, answer: ANSWER }])).toEqual([{ ...W_SARAH, id: 'q2', answer: ANSWER }, MORGAN]);
  });

  it("a question of another kind under a previous question's id is a new question: both stay, the previous one under an id of its own", () => {
    expect(carriedWeaveQuestions([clone(SARAH_PRONOUN)], [{ ...W_SARAH, answer: ANSWER }])).toEqual([{ ...W_SARAH, id: 'q2', answer: ANSWER }, SARAH_PRONOUN]);
    expect(carriedWeaveQuestions([clone(SARAH_PRONOUN)], [W_SARAH])).toEqual([{ ...W_SARAH, id: 'q2' }, SARAH_PRONOUN]);
  });

  // Fix round 2, finding 4: the ids the rework gave stand. A question the carry puts back
  // keeps its id unless another question holds it, and then takes an id no question in
  // either version holds, so every repeated id the checks see is one the rework returned.
  it("an answered question the rework left out, whose id it gave to another question, comes back under an id neither version holds", () => {
    expect(carriedWeaveQuestions([{ ...RILEY, id: 'q1' }], [{ ...W_SARAH, answer: ANSWER }, RILEY]))
      .toEqual([{ ...W_SARAH, id: 'q3', answer: ANSWER }, { ...RILEY, id: 'q1' }]);
  });

  it('an unanswered question the rework left out, whose id it gave to the next question, comes back under an id of its own', () => {
    const SALE = { ...W_FIGURE, id: 'q3' };
    expect(carriedWeaveQuestions([{ ...RILEY, id: 'q1' }, { ...SALE, id: 'q2' }], [W_SARAH, RILEY, SALE]))
      .toEqual([{ ...W_SARAH, id: 'q4' }, { ...RILEY, id: 'q1' }, { ...SALE, id: 'q2' }]);
  });

  it('the questions under a repeated id that the rework left out come back each under an id of its own', () => {
    expect(carriedWeaveQuestions([], [W_SARAH, MORGAN])).toEqual([W_SARAH, { ...MORGAN, id: 'q2' }]);
  });

  it('an id with no number at its end takes one', () => {
    expect(carriedWeaveQuestions([{ ...RILEY, id: 'sarah' }], [{ ...W_SARAH, id: 'sarah', answer: ANSWER }]))
      .toEqual([{ ...W_SARAH, id: 'sarah-1', answer: ANSWER }, { ...RILEY, id: 'sarah' }]);
  });

  // Fix round 3, finding 1: in a previous question's place, a question of its kind pairs
  // only when its `about` names the same subject. A figure's `about` names its ledger entry
  // by its time and amount, so two that both hold numbers name one entry when they hold the
  // same numbers; otherwise one holds every word of the other, as a name given in full holds
  // the name. A question on another player or another entry is a new question, and both stay.
  const WHICH_PRONOUN = 'Which pronoun does the article use?';
  const RILEY_PRONOUN = { ...W_PRONOUN, id: 'q1', question: WHICH_PRONOUN };
  const JORDAN_PRONOUN = { ...RILEY_PRONOUN, about: 'Jordan', changes: "Jordan's pronoun in print." };
  const DEREK_SALE = { ...FIGURE, about: 'The 08:10 AM sale of $50,000 into Derek' };
  const SARAH_BLACKWOOD = { ...W_SARAH, about: 'Sarah Blackwood', question: 'Where was Sarah Blackwood this morning?' };

  it("a question of its kind in the same words on another subject, in an answered question's place, is a new question: both stay, the answered one under an id of its own", () => {
    expect(carriedWeaveQuestions([clone(JORDAN_PRONOUN)], [{ ...RILEY_PRONOUN, answer: 'she/her' }]))
      .toEqual([{ ...RILEY_PRONOUN, id: 'q2', answer: 'she/her' }, JORDAN_PRONOUN]);
    expect(carriedWeaveQuestions([clone(DEREK_SALE)], [{ ...FIGURE, answer: 'A duplicate.' }]))
      .toEqual([{ ...FIGURE, id: 'q2', answer: 'A duplicate.' }, DEREK_SALE]);
  });

  it("the re-review's case: a new figure in the same words in the answered question's place stays, and the answered question stays once, its words and answer kept", () => {
    const melanieRenumbered = { ...FIGURE, id: 'q2', about: '07:50 AM, $75,000 into Melanie' };
    const carried = carriedWeaveQuestions([clone(DEREK_SALE), clone(melanieRenumbered)], [{ ...FIGURE, answer: 'A duplicate.' }]);
    expect(carried).toContainEqual(DEREK_SALE);
    expect(carried.filter((q) => q.answer)).toEqual([{ ...FIGURE, id: 'q3', answer: 'A duplicate.' }]);
  });

  it('a name given in full, or shortened, in its place is the same player: the rework\'s version stands; a family name two players share is not', () => {
    expect(carriedWeaveQuestions([clone(SARAH_BLACKWOOD)], [W_SARAH])).toEqual([SARAH_BLACKWOOD]);
    expect(carriedWeaveQuestions([clone(W_SARAH)], [SARAH_BLACKWOOD])).toEqual([W_SARAH]);
    const marcus = { ...SARAH_BLACKWOOD, about: 'Marcus Blackwood', question: 'Where was Marcus Blackwood this morning?' };
    expect(carriedWeaveQuestions([clone(marcus)], [SARAH_BLACKWOOD])).toEqual([{ ...SARAH_BLACKWOOD, id: 'q2' }, marcus]);
  });

  it("a figure's `about` names its entry by its numbers: the same time and amount in other words is the same entry; another time and amount, or the time alone, is another entry", () => {
    const reworded = { ...FIGURE, about: "07:50 AM: $75,000 into Melanie's account", question: 'Was this sale logged twice?' };
    expect(carriedWeaveQuestions([clone(reworded)], [FIGURE])).toEqual([reworded]);
    const derek = { ...DEREK_SALE, question: 'Was this sale logged twice?' };
    expect(carriedWeaveQuestions([clone(derek)], [FIGURE])).toEqual([{ ...FIGURE, id: 'q2' }, derek]);
    const sameMinute = { ...derek, about: 'The 07:50 AM sale into Derek' };
    expect(carriedWeaveQuestions([clone(sameMinute)], [FIGURE])).toEqual([{ ...FIGURE, id: 'q2' }, sameMinute]);
  });

  describe('through the arc rework, then the checks', () => {
    /**
     * The arc rework on a weave with these questions, returning those; then the checks on
     * what it stored. With a round, the director's round with a note; without, an
     * automatic pass after the check.
     */
    async function reworkQuestions(previousQuestions, reworkedQuestions, round = null) {
      const state = reworkFixtureState('journalist');
      const previous = { ...clone(state.weave), questions: previousQuestions };
      // The meeting is open, so the checks run whatever the shared fixture holds.
      const open = { ...state, weave: previous, arcRevisionCount: 1, meetingApproved: null };
      const fixState = round
        ? { ...open, _meetingRound: round, _arcFeedback: 'Rethink the main thread around the money.', validationResults: null }
        : { ...open, validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: [REPEAT_FAILURE.message] } };
      const rework = { ...clone(previous), questions: reworkedQuestions };
      const result = await arcNodes.reviseArcs(fixState, { configurable: { sdkClient: sdkReturning(rework) } });
      const checked = arcNodes.validateArcStructure({ ...fixState, ...result }, {});
      return { questions: result.weave.questions, failures: checked._arcValidation.failures };
    }

    it('a renumbering in order: each question once, the answer with its question, and no repeat', async () => {
      const { questions, failures } = await reworkQuestions(
        [W_SARAH, { ...MORGAN, answer: ANSWER }, RILEY],
        [clone(W_SARAH), { ...MORGAN, id: 'q2' }, { ...RILEY, id: 'q3' }]
      );
      expect(questions).toEqual([W_SARAH, { ...MORGAN, id: 'q2', answer: ANSWER }, { ...RILEY, id: 'q3' }]);
      expect(failures).toEqual([]);
    });

    it('a renumbering of the first occurrence: each question once, the answer with its question, and no repeat', async () => {
      const { questions, failures } = await reworkQuestions(
        [W_SARAH, { ...MORGAN, answer: ANSWER }],
        [{ ...W_SARAH, id: 'q2' }, clone(MORGAN)]
      );
      expect(questions).toEqual([{ ...W_SARAH, id: 'q2' }, { ...MORGAN, answer: ANSWER }]);
      expect(failures).toEqual([]);
    });

    it("a swapped pair: each question once, the answer with its question, and the repeat the rework kept is the writer's failure", async () => {
      const { questions, failures } = await reworkQuestions(
        [W_SARAH, { ...MORGAN, answer: ANSWER }],
        [clone(MORGAN), clone(W_SARAH)]
      );
      expect(questions).toEqual([W_SARAH, { ...MORGAN, answer: ANSWER }]);
      expect(failures).toEqual([REPEAT_FAILURE]);
    });

    // Fix round 2, finding 3.
    it("a send-back that gives an answered question's `about` in full: the answered question once, and no repeat", async () => {
      const { questions, failures } = await reworkQuestions([{ ...W_SARAH, answer: ANSWER }], [clone(SARAH_IN_FULL)], 'send-back');
      expect(questions).toEqual([{ ...W_SARAH, answer: ANSWER }]);
      expect(failures).toEqual([]);
    });

    // Fix round 2, finding 4.
    it.each([['an automatic pass', null], ['a send-back', 'send-back']])(
      "%s that leaves out an answered question and gives its id to the next: each question once, and no repeat",
      async (_name, round) => {
        const { questions, failures } = await reworkQuestions([{ ...W_SARAH, answer: ANSWER }, RILEY], [{ ...RILEY, id: 'q1' }], round);
        expect(questions).toEqual([{ ...W_SARAH, id: 'q3', answer: ANSWER }, { ...RILEY, id: 'q1' }]);
        expect(failures).toEqual([]);
      }
    );

    it('a send-back that leaves out an answered question in the middle and renumbers the one after it: each question once, and no repeat', async () => {
      const SALE = { ...W_FIGURE, id: 'q3' };
      const { questions, failures } = await reworkQuestions(
        [W_SARAH, { ...RILEY, answer: 'she/her' }, SALE],
        [clone(W_SARAH), { ...SALE, id: 'q2' }],
        'send-back'
      );
      expect(questions).toEqual([W_SARAH, { ...RILEY, id: 'q4', answer: 'she/her' }, { ...SALE, id: 'q2' }]);
      expect(failures).toEqual([]);
    });

    // Fix round 3, finding 1.
    it("a send-back that puts a question on another player, in the same words, in an answered question's place: both questions, and no repeat", async () => {
      const { questions, failures } = await reworkQuestions([{ ...RILEY_PRONOUN, answer: 'she/her' }], [clone(JORDAN_PRONOUN)], 'send-back');
      expect(questions).toEqual([{ ...RILEY_PRONOUN, id: 'q2', answer: 'she/her' }, JORDAN_PRONOUN]);
      expect(failures).toEqual([]);
    });

    it("an automatic pass that puts a question on another player in an unanswered question's place: both questions, and no repeat", async () => {
      const { questions, failures } = await reworkQuestions([W_SARAH], [clone(MORGAN)]);
      expect(questions).toEqual([{ ...W_SARAH, id: 'q2' }, MORGAN]);
      expect(failures).toEqual([]);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5c: the carry's pairing is one exported function, which the meeting's marks read too
// ═══════════════════════════════════════════════════════════════════════════
describe("4.5c: pairWeaveQuestions is the carry's pairing, exported", () => {
  const { pairWeaveQuestions, carriedWeaveQuestions, weaveQuestionsOf } = require('../writer-questions');
  const pronoun = (id, who, extra = {}) => ({ id, kind: 'pronoun', about: who, question: 'Which pronoun does the article use?', changes: `${who}'s pronoun in print.`, ...extra });

  it('gives, for each question of the first version, the index of the same question in the other, or null', () => {
    // Renumbered in order: each question pairs with its own.
    expect(pairWeaveQuestions([pronoun('q1', 'Sarah'), pronoun('q2', 'Riley')], [pronoun('q2', 'Sarah'), pronoun('q3', 'Riley')])).toEqual([0, 1]);
    // A question on another player in an answered question's place is another question.
    expect(pairWeaveQuestions([pronoun('q1', 'Riley', { answer: 'she/her' })], [pronoun('q1', 'Jordan')])).toEqual([null]);
    expect(pairWeaveQuestions([], [pronoun('q1', 'Riley')])).toEqual([]);
  });

  it('is the pairing the carry keeps by: a paired answered question takes its partner\'s id, and an unpaired one comes back', () => {
    const previous = [pronoun('q1', 'Riley', { answer: 'she/her' }), pronoun('q2', 'Sam')];
    const returned = [pronoun('q5', 'Riley'), pronoun('q1', 'Jordan')];
    expect(pairWeaveQuestions(weaveQuestionsOf(previous), weaveQuestionsOf(returned))).toEqual([0, null]);
    expect(carriedWeaveQuestions(returned, previous).map((q) => `${q.id}:${q.about}${q.answer ? ' (answered)' : ''}`))
      .toEqual(['q5:Riley (answered)', 'q2:Sam', 'q1:Jordan']);
  });

  it('reads a question with a field missing as one with that field empty, so the marks can read any question the weave holds', () => {
    expect(pairWeaveQuestions([{ id: 'q1', kind: 'player', about: 'Riley' }], [{ id: 'q2', kind: 'player', about: 'Riley', question: 'Where was Riley?' }])).toEqual([0]);
  });
});
