/**
 * The writers' questions for the director (phase 3, brief 3.7; spec C15, R5).
 *
 * When the record holds nothing about a player, a roster pronoun is missing, or a
 * ledger line looks wrong, a writer asks the director instead of guessing. Each
 * writer's output carries the questions in one optional field, `writerQuestions`: a
 * list of `{about, question}`, where `about` names what the question is about (a
 * player, a pronoun, a ledger line). The arcs keep theirs in
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
 * The field as the two arc schemas define it (lib/sdk-client/subagents.js). The
 * outline and content-bundle schema files carry the same shape and wording, with the
 * `additionalProperties: false` those files put on every object.
 */
const WRITER_QUESTIONS_PROPERTY = Object.freeze({
  type: 'array',
  description: 'Questions for the director (C15), each with what it is about and the question',
  items: {
    type: 'object',
    properties: {
      about: { type: 'string', description: 'What the question is about: a player by name, a player\'s pronoun, or a ledger line' },
      question: { type: 'string' }
    },
    required: ['about', 'question']
  }
});

/**
 * The questions in a list, as `{about, question}` with each string trimmed at the
 * ends. An entry without both strings is not a question and is left out.
 *
 * @param {*} value - an output's writerQuestions
 * @returns {Array<{about: string, question: string}>}
 */
function writerQuestionsOf(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((q) => q && typeof q === 'object' && typeof q.about === 'string' && typeof q.question === 'string')
    .map((q) => ({ about: q.about.trim(), question: q.question.trim() }))
    .filter((q) => q.about && q.question);
}

/** One question's identity for de-duplication: `about` and `question`, any case and spacing. */
function questionKey(q) {
  const fold = (text) => text.replace(/\s+/g, ' ').toLowerCase();
  return `${fold(q.about)}\n${fold(q.question)}`;
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
 * A rework's questions (R5): a rework keeps every question it did not answer, and only
 * the director answers one, with the stop's note.
 * - An automatic pass (no note: an evaluation or a check sent it) keeps every previous
 *   question, in order, then adds the ones it returned. So an automatic pass never
 *   drops a question before the director sees it, whatever list the model returns.
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
 * @returns {Array<{about: string, question: string}>}
 */
function carriedWriterQuestions(returned, previous, { afterDirectorNote } = {}) {
  if (typeof afterDirectorNote !== 'boolean') {
    throw new TypeError('carriedWriterQuestions: options.afterDirectorNote must be true or false (does this rework act on the director\'s note?)');
  }
  const previousQuestions = writerQuestionsOf(previous);
  if (!Array.isArray(returned)) return previousQuestions;
  const returnedQuestions = writerQuestionsOf(returned);
  return distinctQuestions(afterDirectorNote ? returnedQuestions : [...previousQuestions, ...returnedQuestions]);
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
 * player when what it is about (`about`) holds the roster name or the character's
 * full name as a whole word, so a question about "Sarah Blackwood" covers "Sarah".
 *
 * @param {*} questions - writerQuestions
 * @param {string[]} roster - the session roster (first names)
 * @param {Object} [canonicalCharacters] - state.canonicalCharacters (first name -> full name)
 * @returns {string[]}
 */
function questionedRosterNames(questions, roster, canonicalCharacters = {}) {
  const abouts = writerQuestionsOf(questions).map((q) => q.about);
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
  WRITER_QUESTIONS_PROPERTY,
  writerQuestionsOf,
  carriedWriterQuestions,
  withCarriedWriterQuestions,
  withoutWriterQuestions,
  schemaWithoutWriterQuestions,
  questionedRosterNames
};
