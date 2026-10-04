/**
 * The writers' questions for the director (phase 3, brief 3.7; spec C15, R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a
 * ledger line looks wrong, a writer asks the director instead of guessing. The outline
 * and the article carry the questions in one optional top-level field,
 * `writerQuestions`: a list of `{kind, about, question}`, where `kind` is which of
 * C15's three cases the question raises (`player`, `pronoun`, `ledger`) and `about`
 * names its subject (the player's name, or the ledger entry's time and amount).
 *
 * The field never prints. The director reads it at the stop (getCheckpointData, the
 * console's writer-questions panel) and answers with the stop's note, the one
 * exception to HY1. So it is kept out of the template and out of every later prompt.
 *
 * Phase 4 (brief 4.4): the weave carries its own questions in its own property,
 * `questions` (WEAVE_QUESTIONS_PROPERTY below): `{id, kind, about, question, changes}`,
 * with C15's three cases as the story meeting asks them (a player, a pronoun, a figure
 * that looks wrong) and what each answer changes in print. The outline's and the
 * article's `writerQuestions` stay until their writers drop the field (4.6, 4.7).
 *
 * Brief 4.5 (C15, ruling 4): the director answers each question in its own box at the
 * story meeting, and the answer (`answer`, WEAVE_ANSWER_KEY) travels with its question
 * to every later writer as the director's words. Code keeps each answered question
 * whole, apart from any model's output: every rework keeps each question the director has
 * not answered, and no answer is ever read from a rework's returned questions
 * (carriedWeaveQuestions). The writer's schema has no `answer`; the director-side schema
 * (lib/meeting.js) adds it.
 */

/** The field's name on the outline and the article. */
const WRITER_QUESTIONS_KEY = 'writerQuestions';

/**
 * A question's kind: which of C15's three cases it raises, in the rule's order (fix
 * 3.7b). `player`: the record holds nothing about a player; `pronoun`: a roster
 * pronoun is missing; `ledger`: a ledger entry looks wrong.
 */
const WRITER_QUESTION_KINDS = Object.freeze(['player', 'pronoun', 'ledger']);

/**
 * The field's one wording. The outline and content-bundle schema files carry this shape
 * and wording, with the `additionalProperties: false` those files put on every object; a
 * test holds them to it (fix 3.7b).
 */
const WRITER_QUESTIONS_PROPERTY = Object.freeze({
  type: 'array',
  description: 'Questions for the director (C15), each with its kind, what it is about and the question',
  items: {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: [...WRITER_QUESTION_KINDS], description: 'The C15 case the question raises' },
      about: { type: 'string', description: 'The player\'s name, or for a ledger question the entry\'s time and amount' },
      question: { type: 'string' }
    },
    required: ['kind', 'about', 'question']
  }
});

/**
 * The questions in a list, as `{kind, about, question}` with each string trimmed at
 * the ends. An entry without both strings is not a question and is left out. The
 * kind is kept when it is one of WRITER_QUESTION_KINDS; a question with no kind, or
 * an unknown one, is kept without it (a list from before the field had a kind still
 * renders), and counts for no player's coverage.
 *
 * @param {*} value - an output's writerQuestions
 * @returns {Array<{kind?: string, about: string, question: string}>}
 */
function writerQuestionsOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q) => q && typeof q === 'object' && typeof q.about === 'string' && typeof q.question === 'string')
    .map((q) => ({
      ...(WRITER_QUESTION_KINDS.includes(q.kind) && { kind: q.kind }),
      about: q.about.trim(),
      question: q.question.trim()
    }))
    .filter((q) => q.about && q.question);
}

/** A text with its case and spacing folded: lower case, each run of whitespace one space. */
function fold(text) {
  return text.replace(/\s+/g, ' ').toLowerCase();
}

/** One question's identity for de-duplication: `about` and `question`, any case and spacing. */
function questionKey(q) {
  return `${fold(q.about)}\n${fold(q.question)}`;
}

/**
 * One question's subject (phase 3, 3.10): its kind and its `about`, the `about` with
 * case and spacing folded and nothing looser. A question with no kind (a list from
 * before the field had one) has the empty kind, which only another kindless question
 * shares.
 */
function subjectKey(q) {
  return `${q.kind || ''}\n${fold(q.about)}`;
}

/** The list with each question once, the first wording kept. */
function distinctQuestions(questions) {
  const seen = new Set();
  return questions.filter((q) => {
    const key = questionKey(q);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The previous questions with each subject the rework asks about replaced by the
 * rework's questions on it (phase 3, 3.10): they take the place of the first earlier
 * question on that subject, and every other earlier question on it goes. An earlier
 * question on a subject the rework asked nothing about stays where it was. The
 * rework's questions on new subjects follow, in its order.
 *
 * @param {Array} previousQuestions - writerQuestionsOf the previous list
 * @param {Array} returnedQuestions - writerQuestionsOf the rework's list
 * @returns {Array}
 */
function replacedBySubject(previousQuestions, returnedQuestions) {
  const returnedBySubject = new Map();
  for (const q of returnedQuestions) {
    const key = subjectKey(q);
    if (!returnedBySubject.has(key)) returnedBySubject.set(key, []);
    returnedBySubject.get(key).push(q);
  }
  const placed = new Set();
  const merged = [];
  for (const q of previousQuestions) {
    const key = subjectKey(q);
    if (!returnedBySubject.has(key)) {
      merged.push(q);
    } else if (!placed.has(key)) {
      merged.push(...returnedBySubject.get(key));
      placed.add(key);
    }
  }
  merged.push(...returnedQuestions.filter((q) => !placed.has(subjectKey(q))));
  return merged;
}

/**
 * A rework's questions (R5): a rework keeps every question it did not answer, and only
 * the director answers one, with the stop's note.
 * - An automatic pass (no note: an evaluation or a check sent it) keeps every previous
 *   subject. A question it returns replaces each earlier question of the same kind and
 *   `about` (subjectKey), in the place of the first one; an earlier question on a
 *   subject it returned nothing for is kept; its questions on new subjects follow
 *   (phase 3, 3.10, the ledger's ruling on 3.7 finding 6). The plain union this
 *   replaces kept a question and its reworded copy: at the gate the arc and outline
 *   stops showed 16 questions, one pronoun asked two or three times.
 * - A rework after the director's note returns the questions the note left open
 *   beside its own: its list replaces the old one, an empty list included.
 * - A rework that returns no list keeps the previous one, on either kind of pass.
 * Each question is listed once (questionKey).
 *
 * @param {*} returned - the rework's writerQuestions (undefined when it returned none)
 * @param {*} previous - the previous output's writerQuestions
 * @param {{afterDirectorNote: boolean}} options - true when the rework acts on the
 *   director's note for this stop (`_arcFeedback`, `_outlineFeedback`, `_articleFeedback`);
 *   required, so no caller falls back to letting a model drop a question
 * @returns {Array<{kind?: string, about: string, question: string}>}
 */
function carriedWriterQuestions(returned, previous, { afterDirectorNote } = {}) {
  if (typeof afterDirectorNote !== 'boolean') {
    throw new TypeError('carriedWriterQuestions: options.afterDirectorNote must be true or false (does this rework act on the director\'s note?)');
  }
  const previousQuestions = writerQuestionsOf(previous);
  if (!Array.isArray(returned)) return previousQuestions;
  const returnedQuestions = writerQuestionsOf(returned);
  return distinctQuestions(afterDirectorNote ? returnedQuestions : replacedBySubject(previousQuestions, returnedQuestions));
}

/**
 * An outline or article from a rework, carrying the questions carriedWriterQuestions
 * keeps.
 *
 * @param {Object|null} output - the rework's outline or content bundle
 * @param {Object|null} previous - the version the rework started from
 * @param {{afterDirectorNote: boolean}} options - as carriedWriterQuestions
 * @returns {Object|null} the same object when it has no field and there is nothing to carry
 */
function withCarriedWriterQuestions(output, previous, options) {
  const questions = carriedWriterQuestions(
    output && output[WRITER_QUESTIONS_KEY],
    previous && previous[WRITER_QUESTIONS_KEY],
    options
  );
  if (!output || typeof output !== 'object') return output;
  if (!Array.isArray(output[WRITER_QUESTIONS_KEY]) && questions.length === 0) return output;
  return { ...output, [WRITER_QUESTIONS_KEY]: questions };
}

/**
 * An output with its questions taken out, for every print that is not the stop's:
 * a later writer's prompt, a judge's JSON, the template.
 *
 * @param {*} output
 * @returns {*} the same value when it is not an object or carries no questions
 */
function withoutWriterQuestions(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || !(WRITER_QUESTIONS_KEY in output)) return output;
  const { [WRITER_QUESTIONS_KEY]: _questions, ...rest } = output;
  return rest;
}

const schemasWithout = new WeakMap();

/**
 * A schema with its top-level writerQuestions property taken out: what the parked
 * detective is sent and printed (spec D13). A deep copy, kept per schema object, so
 * the SDK wrapper's per-object memo sees one object per schema.
 *
 * @param {Object} schema
 * @returns {Object}
 */
function schemaWithoutWriterQuestions(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties || !(WRITER_QUESTIONS_KEY in schema.properties)) return schema;
  if (!schemasWithout.has(schema)) {
    const copy = JSON.parse(JSON.stringify(schema));
    delete copy.properties[WRITER_QUESTIONS_KEY];
    schemasWithout.set(schema, copy);
  }
  return schemasWithout.get(schema);
}

// ═══════════════════════════════════════════════════════════════════════════
// THE WEAVE'S QUESTIONS (phase 4, brief 4.4; C15)
// ═══════════════════════════════════════════════════════════════════════════

/** The weave's field for its questions (lib/weave.js). */
const WEAVE_QUESTIONS_KEY = 'questions';

/**
 * A weave question's kind: C15's three cases, as the story meeting asks them. `player`:
 * the record holds nothing about a player; `pronoun`: a roster pronoun is missing;
 * `figure`: a figure looks wrong, in the ledger or as said in the room.
 */
const WEAVE_QUESTION_KINDS = Object.freeze(['player', 'pronoun', 'figure']);

/**
 * The weave's `questions`, as the weave's schema carries it (lib/sdk-client/subagents.js
 * WEAVE_SCHEMA): each question with its id, its kind, what it is about, the question and
 * what its answer changes in print. The arc writer's OUTPUT FORMAT shows `about` in this
 * wording.
 */
const WEAVE_QUESTIONS_PROPERTY = Object.freeze({
  type: 'array',
  description: 'Questions for the director (C15), each saying what its answer changes',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'A short id, unique in the weave' },
      kind: { type: 'string', enum: [...WEAVE_QUESTION_KINDS], description: 'The C15 case the question raises' },
      about: { type: 'string', description: "The player's name; for a figure, the ledger entry's time and amount or the words said in the room" },
      question: { type: 'string', description: 'The question for the director' },
      changes: { type: 'string', description: 'What its answer changes in print' }
    },
    required: ['id', 'kind', 'about', 'question', 'changes']
  }
});

/** The five strings a weave question carries. */
const WEAVE_QUESTION_FIELDS = ['id', 'kind', 'about', 'question', 'changes'];

/** The director's answer on a weave question, given at the story meeting (brief 4.5). */
const WEAVE_ANSWER_KEY = 'answer';

/**
 * The weave's questions in a list, as `{id, kind, about, question, changes}` with each
 * string trimmed at the ends, and the director's `answer` when there is one, trimmed at
 * the ends only (brief 4.5). An entry that lacks one of the five, or whose kind is not
 * one of WEAVE_QUESTION_KINDS, is not a question the meeting can ask, and is left out.
 *
 * @param {*} value - a weave's questions
 * @returns {Array<{id: string, kind: string, about: string, question: string, changes: string, answer?: string}>}
 */
function weaveQuestionsOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q) => q && typeof q === 'object')
    .map((q) => {
      const question = Object.fromEntries(WEAVE_QUESTION_FIELDS.map((field) => [field, typeof q[field] === 'string' ? q[field].trim() : '']));
      const answer = typeof q[WEAVE_ANSWER_KEY] === 'string' ? q[WEAVE_ANSWER_KEY].trim() : '';
      return answer ? { ...question, [WEAVE_ANSWER_KEY]: answer } : question;
    })
    .filter((q) => WEAVE_QUESTION_FIELDS.every((field) => q[field]) && WEAVE_QUESTION_KINDS.includes(q.kind));
}

/** Whether the director has answered this weave question. */
function isAnswered(question) {
  return Boolean(question && typeof question[WEAVE_ANSWER_KEY] === 'string' && question[WEAVE_ANSWER_KEY].trim());
}

/** Questions with no answer on any: what a model's output may carry (brief 4.5). */
function withoutAnswers(questions) {
  return (Array.isArray(questions) ? questions : []).map((question) => {
    if (!question || typeof question !== 'object' || !(WEAVE_ANSWER_KEY in question)) return question;
    const { [WEAVE_ANSWER_KEY]: _answer, ...asked } = question;
    return asked;
  });
}

/**
 * An id for a question the carry puts back, one no question in either version holds
 * (brief 4.5b, fix round 2): the question's own id with the number at its end replaced by
 * the smallest number that gives an id no question holds ("q1" gives "q3" while "q1" and
 * "q2" are held). An id with no number at its end takes one after a hyphen ("sarah" gives
 * "sarah-1").
 *
 * @param {string} id - the question's id
 * @param {Set<string>} held - the ids of every question in either version, and each id given so far
 * @returns {string}
 */
function idOfItsOwn(id, held) {
  const stem = /\d$/.test(id) ? id.replace(/\d+$/, '') : `${id}-`;
  let number = 1;
  while (held.has(`${stem}${number}`)) number += 1;
  return `${stem}${number}`;
}

/**
 * Whether two questions' `about`s name one subject, in the same words or in others (brief
 * 4.5b, fix round 3). A figure's `about` names its ledger entry by its time and amount, so
 * two that both hold numbers name one entry when they hold the same numbers ("The 07:50 AM
 * sale of $75,000 into Melanie" and "07:50 AM: $75,000 into Melanie's account"). Otherwise
 * one holds every word of the other, as a name given in full holds the name ("Sarah" and
 * "Sarah Blackwood"). So "Riley" and "Jordan" are two players, "Sarah Blackwood" and "Marcus
 * Blackwood" too, and a sale at another time or for another amount is another entry.
 *
 * @param {string} about - one question's `about`
 * @param {string} other - the other question's `about`
 * @returns {boolean}
 */
function namesOneSubject(about, other) {
  const numbers = (text) => new Set(text.match(/\d+/g) || []);
  const words = (text) => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
  const within = (some, all) => some.size > 0 && [...some].every((item) => all.has(item));
  const [aboutNumbers, otherNumbers] = [numbers(about), numbers(other)];
  if (aboutNumbers.size > 0 && otherNumbers.size > 0) {
    return within(aboutNumbers, otherNumbers) && within(otherNumbers, aboutNumbers);
  }
  const [aboutWords, otherWords] = [words(about), words(other)];
  return within(aboutWords, otherWords) || within(otherWords, aboutWords);
}

/**
 * A weave rework's questions (C15, ruling 4 of brief 4.5): every rework, an automatic
 * pass or the director's round alike, keeps each question the director has not answered.
 * Each previous question pairs with at most one of the rework's, and only with what reads
 * as the same question (brief 4.5b, fix rounds 1 to 3). The pairing runs in five steps,
 * each over every previous question before the next, so no question takes another's
 * partner:
 * 1. the same words (the kind, `about` and question, case and spacing folded), in its place;
 * 2. the same words in another place: a question the rework renumbered or moved;
 * 3. the same subject (subjectKey: the kind and `about`, the outline carry's rule), in its
 *    place: a question the rework reworded;
 * 4. the same subject in another place: a question the rework reworded and renumbered;
 * 5. in its place, of its kind, with an `about` that names the same subject in other words
 *    (namesOneSubject: the same numbers, or every word of one in the other): a question
 *    whose `about` the rework rephrased, as 4.5 read a question under its id. In an
 *    answered question's place the question's own words must be the same too: the rework
 *    reads the director's answer, so a question it puts there in other words is a new one.
 * A question on another player or another ledger entry is a new question wherever the
 * rework puts it (fix round 3). A question's place is its occurrence under its id
 * (lib/weave.js occurrenceKeys), as the diff pairs elements, so the questions under an id
 * the weave repeats pair in order.
 * - An answered question stays whole, as the director answered it, in its place: code
 *   keeps it apart from the model's output, so a rework that drops it or rewords it
 *   changes nothing in it but its id. Paired, it takes its partner's id; left out, it
 *   keeps its own unless another question holds it (below).
 * - An unanswered question paired with one of the rework's is the rework's version, in the
 *   previous place; one the rework left out comes back, in its place.
 * - The ids the rework gave stand. A question that comes back keeps its id unless another
 *   question in the list holds it, and then takes one no question in either version holds
 *   (idOfItsOwn), so every repeated id in the list is one the rework returned, which the
 *   checks report as the writer's (fix round 2). A rework that returns each question once,
 *   under an id of its own, therefore clears a repeat.
 * - The rework's questions no previous question pairs with follow, in its order, so none is
 *   dropped.
 * - A rework that returns no list keeps the previous one.
 * No answer is ever read from the rework's returned questions.
 *
 * The pairing reads each case it cannot tell apart one way:
 * - A question the rework asks on the subject of a question it left out is that question
 *   reworded (steps 3 to 5): it takes an unanswered question's place, and an answered
 *   question absorbs it. Under a rephrased `about`, an answered question absorbs only a
 *   question in its own words, and a question there in other words stays beside it.
 * - A question whose `about` the rework rephrases and moves to another place, or rephrases
 *   past one subject ("7:50" for "07:50", a nickname), is a new question: an unanswered
 *   question then shows twice, and an answered one is asked again.
 * - Two questions on one subject that a rework rewords can pair the wrong way round.
 *
 * @param {*} returned - the rework's questions (undefined when it returned none)
 * @param {*} previous - the questions of the weave the rework started from
 * @returns {Array}
 */
function carriedWeaveQuestions(returned, previous) {
  const previousQuestions = weaveQuestionsOf(previous);
  if (!Array.isArray(returned)) return previousQuestions;
  // A question's place under its id (lib/weave.js), required here rather than at the top:
  // lib/weave.js requires this module.
  const { occurrenceKeys } = require('./weave');
  const returnedQuestions = withoutAnswers(weaveQuestionsOf(returned));
  const previousPlaces = occurrenceKeys(previousQuestions);
  const returnedPlaces = occurrenceKeys(returnedQuestions);
  const sameSubject = (i, j) => subjectKey(previousQuestions[i]) === subjectKey(returnedQuestions[j]);
  const sameWords = (i, j) => sameSubject(i, j) && questionKey(previousQuestions[i]) === questionKey(returnedQuestions[j]);
  const samePlace = (i, j) => previousPlaces[i] === returnedPlaces[j];
  const sameQuestion = (i, j) => fold(previousQuestions[i].question) === fold(returnedQuestions[j].question);
  const rephrased = (i, j) => samePlace(i, j) && previousQuestions[i].kind === returnedQuestions[j].kind
    && namesOneSubject(previousQuestions[i].about, returnedQuestions[j].about)
    && (!isAnswered(previousQuestions[i]) || sameQuestion(i, j));
  const steps = [
    (i, j) => sameWords(i, j) && samePlace(i, j),
    sameWords,
    (i, j) => sameSubject(i, j) && samePlace(i, j),
    sameSubject,
    rephrased
  ];
  const partners = previousQuestions.map(() => null);
  const paired = new Set();
  steps.forEach((same) => previousQuestions.forEach((_question, i) => {
    if (partners[i] !== null) return;
    const j = returnedQuestions.findIndex((_candidate, k) => !paired.has(k) && same(i, k));
    if (j === -1) return;
    partners[i] = j;
    paired.add(j);
  }));
  // The rework's ids stand: a question that comes back yields its id to them, and to a
  // question that came back before it.
  const held = new Set([...previousQuestions, ...returnedQuestions].map((question) => question.id));
  const listed = new Set(returnedQuestions.map((question) => question.id));
  const carried = previousQuestions.map((question, i) => {
    if (partners[i] !== null) {
      const partner = returnedQuestions[partners[i]];
      return isAnswered(question) ? { ...question, id: partner.id } : partner;
    }
    if (!listed.has(question.id)) {
      listed.add(question.id);
      return question;
    }
    const id = idOfItsOwn(question.id, held);
    held.add(id);
    listed.add(id);
    return { ...question, id };
  });
  return [...carried, ...returnedQuestions.filter((_question, j) => !paired.has(j))];
}

module.exports = {
  WRITER_QUESTIONS_KEY,
  WRITER_QUESTION_KINDS,
  WRITER_QUESTIONS_PROPERTY,
  writerQuestionsOf,
  carriedWriterQuestions,
  withCarriedWriterQuestions,
  withoutWriterQuestions,
  schemaWithoutWriterQuestions,
  // Phase 4 (brief 4.4): the weave's questions; brief 4.5: their answers
  WEAVE_QUESTIONS_KEY,
  WEAVE_QUESTION_KINDS,
  WEAVE_QUESTIONS_PROPERTY,
  WEAVE_ANSWER_KEY,
  weaveQuestionsOf,
  isAnswered,
  withoutAnswers,
  carriedWeaveQuestions
};
