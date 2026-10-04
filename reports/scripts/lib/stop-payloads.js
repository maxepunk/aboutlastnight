/**
 * The e2e harness's payloads at the story meeting, the map, the desk and the character-IDs stop
 * (phase 4, brief 4.12a; the integrator's rulings 1 and 2), built by the console's own builders
 * (console/checkpoint-view-logic.js), so the harness sends what the console sends:
 * - the story meeting: meetingPayload(action, data, meetingDraftOf(data), note);
 * - the map: mapPayload(action, mapDraftOf(data), note);
 * - the desk: articleReviewPayload(the article as the stop shows it, note, action), the article
 *   riding as articleEdits. It meets the server's schema gate alone: the desk's own checks run
 *   in the console, and step mode prints them (deskProblems) for the operator to see;
 * - the character-IDs stop: characterIdsPayload when the run gives the director's photo
 *   descriptions, characterIdsSkipPayload otherwise. Each sends the photos to leave out only
 *   when the run names them (--leave-out); without them it sends no list, which leaves the list
 *   as it is.
 * The harness edits nothing: it sends each stop's output as the stop shows it, with the
 * director's action and note. A payload carrying the director's own changes goes as a file
 * (--approve-file). The server refuses the old payloads by name (selectedArcs, outline: true).
 */
'use strict';

const View = require('../../console/checkpoint-view-logic');

/** The actions each stop takes, by its stop type. */
const STOP_ACTIONS = Object.freeze({
  'arc-selection': View.MEETING_ACTIONS,
  outline: View.MAP_ACTIONS,
  article: ['approve', 'send-back'],
  'character-ids': ['approve']
});

/** What each stop is called in a refusal. */
const STOP_NAMES = Object.freeze({
  'arc-selection': 'The story meeting',
  outline: 'The map',
  article: 'The article',
  'character-ids': 'The character-IDs stop'
});

const SEND_BACK_NEEDS_A_NOTE = 'A send-back needs a note: give it with --note.';

/** Words joined as a list is read: "a", "a or b", "a, b or c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} or ${words[words.length - 1]}` : words.join('');
}

function baseName(value) {
  return String(value || '').split('/').pop().split('\\').pop();
}

/**
 * The card of each photo a run's option names, matched by filename as the stop's cards are (its
 * basename, in any case). A name the stop does not show stops the run, naming it and the photos
 * the stop shows.
 *
 * @param {Array} cards - characterIdCards(...)
 * @param {string[]} names - the filenames the option names
 * @param {string} option - the option, for the refusal
 * @returns {Array<{name: string, card: Object}>}
 */
function cardsNamed(cards, names, option) {
  return names.map((name) => {
    const wanted = baseName(name).toLowerCase();
    const card = cards.find((c) => c.filename && c.filename.toLowerCase() === wanted);
    if (!card) {
      throw new Error(`${option} names ${name}, which the character-IDs stop does not show. It shows ${cards.map((c) => c.filename).filter(Boolean).join(', ') || 'no photo'}.`);
    }
    return { name, card };
  });
}

/** The character-IDs stop's payload: the console's Approve with the director's descriptions, else its Skip. */
function characterIdsApproval(data, { leaveOut, photoDescriptions }) {
  const analyses = data.photoAnalyses && Array.isArray(data.photoAnalyses.analyses) ? data.photoAnalyses.analyses : [];
  const cards = View.characterIdCards(analyses, data.sessionPhotos, data.leftOutPhotos);
  const ticks = {};
  if (leaveOut) cardsNamed(cards, leaveOut, '--leave-out').forEach(({ card }) => { ticks[card.key] = true; });
  let descriptions = null;
  if (photoDescriptions) {
    descriptions = {};
    cardsNamed(cards, Object.keys(photoDescriptions), '--photo-descriptions').forEach(({ name, card }) => {
      descriptions[card.key] = photoDescriptions[name];
    });
  }
  const built = descriptions ? View.characterIdsPayload(cards, descriptions, ticks) : View.characterIdsSkipPayload(cards, ticks);
  if (leaveOut) return { payload: built };
  const { leftOutPhotos: _list, ...payload } = built;
  return { payload };
}

/**
 * The harness's payload at a stop the console's builders cover, or null at any other stop (the
 * harness keeps its own default there).
 *
 * @param {string} stop - the stop type the thread is paused at
 * @param {Object} data - the stop's payload, as the server sends it
 * @param {Object} [options]
 * @param {string} [options.action='approve'] - approve, reweave (the story meeting only) or send-back
 * @param {string} [options.note=''] - the director's note, sent as typed
 * @param {string[]|null} [options.leaveOut] - the photos to leave out at the character-IDs stop (--leave-out)
 * @param {Object|null} [options.photoDescriptions] - the director's {filename: description} (--photo-descriptions)
 * @returns {{payload: Object}|{refusal: string}|null} the payload; or why none is built, as the
 *   console's buttons would refuse it; or null for a stop the builders do not cover
 * @throws when an option names a photo the character-IDs stop does not show
 */
function stopApproval(stop, data, { action = 'approve', note = '', leaveOut = null, photoDescriptions = null } = {}) {
  if (!Object.prototype.hasOwnProperty.call(STOP_ACTIONS, stop)) return null;
  if (!STOP_ACTIONS[stop].includes(action)) {
    return { refusal: `${STOP_NAMES[stop]} takes ${listOf(STOP_ACTIONS[stop])} (got --action ${action}).` };
  }
  const d = data && typeof data === 'object' ? data : {};
  const typed = typeof note === 'string' ? note : '';

  if (stop === 'character-ids') {
    if (typed.trim()) return { refusal: `${STOP_NAMES[stop]} takes no note.` };
    return characterIdsApproval(d, { leaveOut, photoDescriptions });
  }
  if (stop === 'arc-selection') {
    const weave = View.meetingDraftOf(d);
    const payload = View.meetingPayload(action, d, weave, typed);
    if (payload) return { payload };
    return { refusal: action === 'send-back' ? SEND_BACK_NEEDS_A_NOTE : View.meetingButtons(d, weave, typed, false).reweave.hint };
  }
  if (stop === 'outline') {
    const map = View.mapDraftOf(d);
    if (!map) throw new Error("The map's payload holds no map to send: every map's stop holds one since task 4.11.");
    const payload = View.mapPayload(action, map, typed);
    return payload ? { payload } : { refusal: SEND_BACK_NEEDS_A_NOTE };
  }
  const payload = View.articleReviewPayload(d.contentBundle, typed, action);
  return payload ? { payload } : { refusal: SEND_BACK_NEEDS_A_NOTE };
}

module.exports = { STOP_ACTIONS, stopApproval };
