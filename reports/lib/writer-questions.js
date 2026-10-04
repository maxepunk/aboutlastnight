/**
 * The writers' questions for the director (phase 3, brief 3.7; spec C15, R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a figure
 * looks wrong, the writer asks the director instead of guessing. Since phase 4 the
 * questions are asked at the story meeting alone (spec section 10): the weave carries
 * them in its own property, `questions` (WEAVE_QUESTIONS_PROPERTY below), each
 * `{id, kind, about, question, changes}`, with C15's three cases as the story meeting asks
 * them (a player, a pronoun, a figure that looks wrong) and what each answer changes in
 * print. The outline's `writerQuestions` went with the map (brief 4.6), and the
 * article's with brief 4.7b, their carry through a rework (carriedWriterQuestions) and
 * their normalizer with them. Their strip from what prints (withoutWriterQuestions) went
 * with task 4.11: only a thread from before the story meeting carried the field, and the
 * server refuses such a thread (lib/old-thread.js).
 *
 * Brief 4.5 (C15, ruling 4): the director answers each question in its own box at the
 * story meeting, and the answer (`answer`, WEAVE_ANSWER_KEY) travels with its question
 * to every later writer as the director's words. Code keeps each answered question
 * apart from any model's output, its words and the answer as the director left them (it
 * may take a new id when a rework gives its id away): every rework keeps each question
 * the director has not answered, and no answer is ever read from a rework's returned questions
 * (carriedWeaveQuestions). The writer's schema has no `answer`; the director-side schema
 * (lib/meeting.js) adds it.
 */

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
 * Which question of one version of the weave each question of another is (briefs 4.5b and
 * 4.5c): the one rule of sameness the rework's carry keeps questions by
 * (carriedWeaveQuestions) and the story meeting's marks read a round's questions by
 * (lib/hand-edit-diff.js weaveMarks). Each question of `previous` pairs with at most one of
 * `returned`, and only with what reads as the same question (brief 4.5b, fix rounds 1 to 3).
 * The pairing runs in five steps, each over every previous question before the next, so no
 * question takes another's partner:
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
 * rework puts it (fix round 3), unless the two `about`s hold the same numbers
 * (carriedWeaveQuestions lists that limit). A question's place is its occurrence under its
 * id (lib/weave.js occurrenceKeys), as the diff pairs elements, so the questions under an
 * id the weave repeats pair in order. A field a question lacks reads as empty text.
 *
 * @param {Array} previous - the questions of the version a rework started from
 * @param {Array} returned - the questions of the other version
 * @returns {Array<number|null>} for each previous question, in order, the index in
 *   `returned` of the question it is, or null for one the other version does not hold
 */
function pairWeaveQuestions(previous, returned) {
  // A question's place under its id (lib/weave.js), required here rather than at the top:
  // lib/weave.js requires this module.
  const { occurrenceKeys } = require('./weave');
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(returned) ? returned : [];
  const textOf = (question, field) => (question && typeof question[field] === 'string' ? question[field].trim() : '');
  const read = (question) => ({
    kind: textOf(question, 'kind'), about: textOf(question, 'about'), question: textOf(question, 'question'), answered: isAnswered(question)
  });
  const previousQuestions = before.map(read);
  const returnedQuestions = after.map(read);
  const previousPlaces = occurrenceKeys(before);
  const returnedPlaces = occurrenceKeys(after);
  const sameSubject = (i, j) => subjectKey(previousQuestions[i]) === subjectKey(returnedQuestions[j]);
  const sameWords = (i, j) => sameSubject(i, j) && questionKey(previousQuestions[i]) === questionKey(returnedQuestions[j]);
  const samePlace = (i, j) => previousPlaces[i] === returnedPlaces[j];
  const sameQuestion = (i, j) => fold(previousQuestions[i].question) === fold(returnedQuestions[j].question);
  const rephrased = (i, j) => samePlace(i, j) && previousQuestions[i].kind === returnedQuestions[j].kind
    && namesOneSubject(previousQuestions[i].about, returnedQuestions[j].about)
    && (!previousQuestions[i].answered || sameQuestion(i, j));
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
  return partners;
}

/**
 * A weave rework's questions (C15, ruling 4 of brief 4.5): every rework, an automatic
 * pass or the director's round alike, keeps each question the director has not answered.
 * Each previous question pairs with at most one of the rework's, by the rule of sameness
 * pairWeaveQuestions states (brief 4.5b, fix rounds 1 to 3; one function since brief 4.5c).
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
 * - Two `about`s that hold the same numbers name one subject (namesOneSubject), whatever
 *   their words: two sales at one minute for one amount into different accounts, or two
 *   lines said in the room naming one figure. A question on the other one in a question's
 *   place reads as that question (step 5), and as its subject at steps 3 and 4 when the
 *   `about` is the bare time and amount. Thirteen of 48 sessions with timed sales hold two
 *   such sales.
 *
 * @param {*} returned - the rework's questions (undefined when it returned none)
 * @param {*} previous - the questions of the weave the rework started from
 * @returns {Array}
 */
function carriedWeaveQuestions(returned, previous) {
  const previousQuestions = weaveQuestionsOf(previous);
  if (!Array.isArray(returned)) return previousQuestions;
  const returnedQuestions = withoutAnswers(weaveQuestionsOf(returned));
  const partners = pairWeaveQuestions(previousQuestions, returnedQuestions);
  const paired = new Set(partners.filter((j) => j !== null));
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
  // Phase 4 (brief 4.4): the weave's questions; brief 4.5: their answers
  WEAVE_QUESTIONS_KEY,
  WEAVE_QUESTION_KINDS,
  WEAVE_QUESTIONS_PROPERTY,
  WEAVE_ANSWER_KEY,
  weaveQuestionsOf,
  isAnswered,
  withoutAnswers,
  carriedWeaveQuestions,
  // Brief 4.5c: the carry's pairing, which the meeting's marks read too
  pairWeaveQuestions
};
