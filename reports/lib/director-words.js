/**
 * The director's words, one list (phases 14 and 15, brief B; spec
 * docs/superpowers/specs/2026-10-09-your-words-and-the-world.md section 3; ruling R1).
 *
 * Everything the director writes reaches every later stage as their words (T1): their session
 * notes, their corrections at the input review, their accusation, their answers at the story
 * meeting, and every note they send at a stop with an approve, a reweave or a send-back. Each
 * source is `{key, label, material, texts}`:
 * - `label`: how an article truth question names it (evaluator-nodes.js ARTICLE_DIRECTOR_WORDS);
 * - `material`: the judge's material it prints under (evaluator-nodes.js TRUTH_MATERIAL);
 * - `texts(state)`: its texts in state, each word for word.
 *
 * Every reader of the director's words reads this list: the article judge's questions and
 * materials, the fact check's directorText and the verdict guard's record (evaluator-nodes.js
 * directorWords), and the evidence check's "notes" (lib/evidence.js notesTextsOf). "From your
 * notes" at the story meeting is not one of them: it quotes the session notes and the
 * corrections alone (arc-specialist-nodes.js directorWordsOf).
 *
 * The notes at the stops are read from directorGateNotes whole, never through filterGateNotes:
 * a judge reads the note a rework acted on too, which that rework read as its HUMAN FEEDBACK.
 */

const { directorAccusationText } = require('./accusation-verdict');
const { weaveQuestionsOf, isAnswered, WEAVE_ANSWER_KEY } = require('./writer-questions');

/** A text of the director's that says something: a string with more than spaces in it. */
const hasText = (text) => typeof text === 'string' && text.trim() !== '';

/**
 * The director's answers at the story meeting, each word for word (brief 4.7a; T1: the answers
 * count like the notes). Only answered questions give one.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function meetingAnswers(state) {
  const weave = state && state.weave;
  return weaveQuestionsOf(weave && weave.questions).filter(isAnswered).map((question) => question[WEAVE_ANSWER_KEY]);
}

/**
 * The notes the director sent at the stops, in the order they were filed, each with text: every
 * note in directorGateNotes, the one a rework is acting on included. The judges' block prints
 * these (director-words-renderer.js renderDirectorStopNotes).
 *
 * @param {Object} state
 * @returns {Array<{gate: string, kind?: string, text: string}>}
 */
function stopNotesOf(state) {
  const notes = state && state.directorGateNotes;
  return (Array.isArray(notes) ? notes : []).filter((note) => note && typeof note === 'object' && hasText(note.text));
}

/**
 * The director's words (T1), source by source, in one order: the notes, the input-review
 * corrections, the accusation as the director wrote it, the answers at the story meeting and
 * the notes at the stops.
 */
const DIRECTOR_WORDS_SOURCES = Object.freeze([
  { key: 'notes', label: 'the notes', material: 'notes', texts: (state) => [state.directorNotes && state.directorNotes.rawProse] },
  { key: 'corrections', label: 'the input-review corrections', material: 'corrections', texts: (state) => (Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : []) },
  { key: 'accusation', label: 'the accusation', material: 'verdict', texts: (state) => [directorAccusationText(state)] },
  { key: 'answers', label: 'the answers at the story meeting', material: 'answers', texts: (state) => meetingAnswers(state) },
  { key: 'stopNotes', label: 'the notes at the stops', material: 'stopNotes', texts: (state) => stopNotesOf(state).map((note) => note.text) }
].map(Object.freeze));

/**
 * Every source's texts, in the list's order, each word for word, the empty ones dropped.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function directorWordsTexts(state) {
  const s = state && typeof state === 'object' ? state : {};
  return DIRECTOR_WORDS_SOURCES.flatMap((source) => source.texts(s)).filter(hasText);
}

module.exports = {
  DIRECTOR_WORDS_SOURCES,
  directorWordsTexts,
  meetingAnswers,
  stopNotesOf
};
