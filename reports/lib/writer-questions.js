/**
 * The writers' questions for the director (phase 3, brief 3.7; spec C15, R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a
 * ledger line looks wrong, a writer asks the director instead of guessing. Each
 * writer's output carries the questions in one optional field, `writerQuestions`: a
 * list of `{kind, about, question}`, where `kind` is which of C15's three cases the
 * question raises (`player`, `pronoun`, `ledger`) and `about` names its subject (the
 * player's name, or the ledger entry's time and amount). The arcs keep theirs in
 * `_arcAnalysisCache.writerQuestions`; the outline and the article at their top
 * level. The interweaving call has no field (spec section 8).
 *
 * The field never prints. The director reads it at the stop (getCheckpointData, the
 * console's writer-questions panel) and answers with the stop's note, the one
 * exception to HY1. So it is kept out of the template and out of every later prompt.
 *
 * Journalist only: the detective's schemas and calls stay as they were (spec D13).
 */

const { getCanonicalName } = require('./theme-config');

/** The field's name on every writer's output. */
const WRITER_QUESTIONS_KEY = 'writerQuestions';

/**
 * A question's kind: which of C15's three cases it raises, in the rule's order (fix
 * 3.7b). `player`: the record holds nothing about a player; `pronoun`: a roster
 * pronoun is missing; `ledger`: a ledger entry looks wrong.
 */
const WRITER_QUESTION_KINDS = Object.freeze(['player', 'pronoun', 'ledger']);

/**
 * The field as the two arc schemas define it (lib/sdk-client/subagents.js). The
 * outline and content-bundle schema files carry the same shape and wording, with the
 * `additionalProperties: false` those files put on every object; a test holds the
 * four to one wording (fix 3.7b). The arc writer's OUTPUT FORMAT shows `about` in
 * this wording too.
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

/** A name as a whole word, any case: "Sarah" in "Sarah's pronoun", not in "Sarahson". */
function namesWord(text, name) {
  const escaped = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escaped) return false;
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * The roster members a question names, in roster order (C7, C15). A question names a
 * player when its kind is `player` and what it is about (`about`) holds the roster
 * name or the character's full name as a whole word, so a question about "Sarah
 * Blackwood" covers "Sarah". A pronoun or ledger question covers no one (fix 3.7b): a
 * ledger question about an account named after a player is about the account, and an
 * account's name is never a reason to suspect its namesake (T4).
 *
 * @param {*} questions - writerQuestions
 * @param {string[]} roster - the session roster (first names)
 * @param {Object} [canonicalCharacters] - state.canonicalCharacters (first name -> full name)
 * @returns {string[]}
 */
function questionedRosterNames(questions, roster, canonicalCharacters = {}) {
  const abouts = writerQuestionsOf(questions).filter((q) => q.kind === 'player').map((q) => q.about);
  if (abouts.length === 0) return [];
  return (Array.isArray(roster) ? roster : [])
    .filter((name) => typeof name === 'string' && name.trim())
    .filter((name) => {
      const names = [name, getCanonicalName(name, canonicalCharacters || {})];
      return abouts.some((about) => names.some((n) => typeof n === 'string' && namesWord(about, n)));
    });
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
  questionedRosterNames
};
