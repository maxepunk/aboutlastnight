/**
 * The e2e harness's payloads at the story meeting, the map, the desk and the character-IDs stop
 * (phase 4, briefs 4.12a and 4.12c; the integrator's rulings 1 and 2), built by the console's own
 * builders (console/checkpoint-view-logic.js), so the harness sends what the console sends:
 * - the story meeting: meetingPayload(action, data, meetingDraftOf(data), note), with the angle the
 *   run's --angle names picked through pickMeetingAngle, as the console's angle picker picks it
 *   (piece 3, brief 3E);
 * - the map: mapPayload(action, mapDraftOf(data), note);
 * - the desk: articleReviewPayload(the article as the stop shows it, note, action), the article
 *   riding as articleEdits. It meets the server's schema gate alone: the desk's own checks run
 *   in the console, and step mode prints them (deskProblems) for the operator to see;
 * - the character-IDs stop: characterIdsPayload when the run gives the director's photo
 *   descriptions, characterIdsSkipPayload otherwise. The leave-out boxes start from the photos
 *   the server lists as left out, as the console's do (characterIdLeaveOutTicks), and the run's
 *   --leave-out only ticks the photos it names (task 4.12d). The payload carries the list as the
 *   boxes leave it, as the console's does (task 4.12c): empty only when the server lists none and
 *   the run names none.
 * The harness edits nothing: it sends each stop's output as the stop shows it, with the
 * director's action and note, and at the story meeting the angle they pick. A payload carrying
 * the director's own changes goes as a file (--approve-file), sent as it is. The server refuses
 * the old payloads by name (selectedArcs, outline: true).
 *
 * optionsRefusal says when a run's options do not fit together (tasks 4.12c, 4.12d and 4.12e), from
 * the lists the payloads are built from, and the harness exits OPTIONS_REFUSED_EXIT_CODE on one.
 */
'use strict';

const fs = require('fs');
const View = require('../../console/checkpoint-view-logic');

/**
 * The actions each decision stop takes, by its stop type: the director's --action chooses among
 * them, and --note goes with it. Each is the console's own list (the desk's since task 4.14g).
 * The character-IDs stop takes approve alone and no note, so it is not among them.
 */
const STOP_ACTIONS = Object.freeze({
  'arc-selection': View.MEETING_ACTIONS,
  outline: View.MAP_ACTIONS,
  article: View.DESK_ACTIONS
});

/** The stop whose leave-out boxes --leave-out ticks. */
const LEAVE_OUT_STOP = 'character-ids';

/** What each stop is called in a refusal. */
const STOP_NAMES = Object.freeze({
  'arc-selection': 'The story meeting',
  outline: 'The map',
  article: 'The article',
  [LEAVE_OUT_STOP]: 'The character-IDs stop'
});

const SEND_BACK_NEEDS_A_NOTE = 'A send-back needs a note: give it with --note.';

/** The stop whose angle --angle picks. */
const ANGLE_STOP = 'arc-selection';

/** Whether --angle as given is an angle's number: a whole number from 1. */
function isAngleNumber(value) {
  return /^[1-9][0-9]*$/.test(String(value));
}

/**
 * The weave with the angle a run's --angle names picked (piece 3, R1), through the console's own
 * operation, or a refusal for a number past the angles the meeting shows. --angle counts from 1,
 * in the order the meeting shows the angles, which is the weave's.
 *
 * @param {Object} weave - the meeting's draft (meetingDraftOf)
 * @param {number|string|null} angle - --angle, or null for the pick as the meeting showed it
 * @returns {{weave: Object}|{refusal: string}}
 */
function withAnglePicked(weave, angle) {
  if (angle === null || angle === undefined) return { weave };
  const angles = weave && Array.isArray(weave.angles) ? weave.angles : [];
  const number = Number(angle);
  if (!isAngleNumber(angle) || number > angles.length) {
    return { refusal: `The story meeting shows ${angles.length} angles, so --angle takes 1 to ${angles.length} (got ${angle}).` };
  }
  return { weave: View.pickMeetingAngle(weave, angles[number - 1].id) };
}

/** Words joined as a list is read: "a", "a or b", "a, b or c" (or with "and"). */
function listOf(words, conjunction = 'or') {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} ${conjunction} ${words[words.length - 1]}` : words.join('');
}

/** A stop's name inside a sentence: "the story meeting", "the character-IDs stop". */
function inSentence(name) {
  return name.charAt(0).toLowerCase() + name.slice(1);
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

/**
 * The character-IDs stop's payload: the console's Approve with the director's descriptions, else
 * its Skip. The boxes start from the server's list (characterIdLeaveOutTicks), and each photo the
 * run names is ticked.
 */
function characterIdsApproval(data, { leaveOut, photoDescriptions }) {
  const analyses = data.photoAnalyses && Array.isArray(data.photoAnalyses.analyses) ? data.photoAnalyses.analyses : [];
  const cards = View.characterIdCards(analyses, data.sessionPhotos, data.leftOutPhotos);
  const ticks = View.characterIdLeaveOutTicks(cards);
  if (leaveOut) cardsNamed(cards, leaveOut, '--leave-out').forEach(({ card }) => { ticks[card.key] = true; });
  if (!photoDescriptions) return { payload: View.characterIdsSkipPayload(cards, ticks) };
  const descriptions = {};
  cardsNamed(cards, Object.keys(photoDescriptions), '--photo-descriptions').forEach(({ name, card }) => {
    descriptions[card.key] = photoDescriptions[name];
  });
  return { payload: View.characterIdsPayload(cards, descriptions, ticks) };
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
 * @param {string[]|null} [options.leaveOut] - the photos --leave-out ticks at the character-IDs stop
 * @param {Object|null} [options.photoDescriptions] - the director's {filename: description} (--photo-descriptions)
 * @param {number|string|null} [options.angle] - the story meeting's angle to pick, counted from 1 (--angle)
 * @returns {{payload: Object}|{refusal: string}|null} the payload; or why none is built, as the
 *   console's buttons would refuse it; or null for a stop the builders do not cover
 * @throws when an option names a photo the character-IDs stop does not show
 */
function stopApproval(stop, data, { action = 'approve', note = '', leaveOut = null, photoDescriptions = null, angle = null } = {}) {
  const d = data && typeof data === 'object' ? data : {};
  const typed = typeof note === 'string' ? note : '';

  if (stop === LEAVE_OUT_STOP) {
    if (action !== 'approve') return { refusal: `${STOP_NAMES[stop]} takes approve alone (got --action ${action}).` };
    if (typed.trim()) return { refusal: `${STOP_NAMES[stop]} takes no note.` };
    return characterIdsApproval(d, { leaveOut, photoDescriptions });
  }
  if (!Object.prototype.hasOwnProperty.call(STOP_ACTIONS, stop)) return null;
  if (!STOP_ACTIONS[stop].includes(action)) {
    return { refusal: `${STOP_NAMES[stop]} takes ${listOf(STOP_ACTIONS[stop])} (got --action ${action}).` };
  }
  if (stop === ANGLE_STOP) {
    const picked = withAnglePicked(View.meetingDraftOf(d), angle);
    if (picked.refusal) return { refusal: picked.refusal };
    const { weave } = picked;
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

/**
 * The approval an --approve-file holds, which step mode sends at its stop as it is (task 4.12d):
 * a weave, a map or an article the director changed, with the action, the note, the pick and the
 * photos left out. This is the harness's one loader, so a test that reads a file through it sends
 * what --approve-file sends (fix round B, review focus 5).
 *
 * @param {string} filePath - --approve-file as given
 * @returns {Object} the file's JSON object
 * @throws {Error} naming the option and the file, on a missing file, bad JSON, or anything but one object
 */
function loadApprovalFile(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`--approve-file ${filePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--approve-file ${filePath}: expected one JSON object, the approval step mode sends.`);
  }
  return parsed;
}

/** Where --action and --note go, read from STOP_ACTIONS: each stop, with the actions it takes. */
const ACTION_NOTE_REFUSAL = `--action and --note go with --approve <stop> and --step, at a stop that takes them: ${
  Object.entries(STOP_ACTIONS).map(([stop, actions]) => `${inSentence(STOP_NAMES[stop])} (${stop}) takes ${listOf(actions)}`).join('; ')
}.`;

/**
 * The harness's exit code when optionsRefusal refuses a run (task 4.12e): not 0, so a scripted
 * gate run sees the refusal, and not the 1 a crash exits with. 2 is the usage error's code.
 */
const OPTIONS_REFUSED_EXIT_CODE = 2;

/**
 * Why a run's options do not fit together, or null when they do (tasks 4.12c, 4.12d and 4.12e).
 * The harness stops on a refusal before it posts anything, and exits OPTIONS_REFUSED_EXIT_CODE:
 * - --approve-file is read only with --approve in step mode, where step mode sends it as the
 *   approval at that stop (task 4.12e). Anywhere else the run never reads the file, so the file
 *   itself is refused, naming what the run lacks.
 * - Where it is read, it is sent as it is (task 4.12d), so --action, --note, --angle and
 *   --leave-out, which build the payload the file replaces, would be dropped without a word. The
 *   file carries the action, the note, the pick and the photos left out.
 * - --angle picks the story meeting's angle, so it goes with --approve arc-selection and --step,
 *   and names an angle by its number, from 1 (piece 3, brief 3E).
 * - --action and --note are the director's at the one stop --approve names in step mode, a stop
 *   STOP_ACTIONS lists. Anywhere else they would act at every stop a run passes, or at a stop
 *   that takes no action of its own.
 * - --leave-out ticks the character-IDs stop's boxes, so with an --approve it goes only with
 *   --approve character-ids. With no --approve, the run ticks them when it reaches that stop.
 *
 * @param {Object} options
 * @param {string|null} [options.approveType] - --approve's stop
 * @param {boolean} [options.stepMode] - --step
 * @param {string|null} [options.action] - --action as given, null when absent
 * @param {string|null} [options.note] - --note as given, null when absent
 * @param {boolean} [options.leaveOut] - whether --leave-out was given, with names or none
 * @param {string|null} [options.approveFile] - --approve-file as given, null when absent
 * @param {string|null} [options.angle] - --angle as given, null when absent
 * @returns {string|null}
 */
function optionsRefusal({ approveType = null, stepMode = false, action = null, note = null, leaveOut = false, approveFile = null, angle = null } = {}) {
  const given = (value) => value !== null && value !== undefined;
  if (given(approveFile)) {
    const lacks = [!approveType && '--approve', !stepMode && '--step'].filter(Boolean);
    if (lacks.length > 0) {
      return `--approve-file goes with --approve <stop> and --step: step mode sends the file as the approval at that stop. This run has no ${listOf(lacks, 'and no')}, so it would never read the file.`;
    }
    const dropped = [given(action) && '--action', given(note) && '--note', given(angle) && '--angle', leaveOut && '--leave-out'].filter(Boolean);
    if (dropped.length > 0) {
      return `--approve-file sends its file as it is, so it takes no --action, --note, --angle or --leave-out (got ${listOf(dropped, 'and')}): put the action, the note, the pick and the photos left out in the file.`;
    }
  }
  if (given(angle)) {
    if (approveType !== ANGLE_STOP || !stepMode) {
      return `--angle picks the angle the story meeting sends on, so it goes with --approve ${ANGLE_STOP} and --step.`;
    }
    if (!isAngleNumber(angle)) {
      return `--angle takes an angle's number, counted from 1 in the order the story meeting shows them (got "${angle}").`;
    }
  }
  const takesActions = Boolean(approveType) && stepMode && Object.prototype.hasOwnProperty.call(STOP_ACTIONS, approveType);
  if ((given(action) || given(note)) && !takesActions) return ACTION_NOTE_REFUSAL;
  if (leaveOut && approveType && approveType !== LEAVE_OUT_STOP) {
    return `--leave-out ticks ${inSentence(STOP_NAMES[LEAVE_OUT_STOP])}'s leave-out boxes, so with --approve it goes only with --approve ${LEAVE_OUT_STOP} (got --approve ${approveType}).`;
  }
  return null;
}

module.exports = { STOP_ACTIONS, stopApproval, loadApprovalFile, optionsRefusal, OPTIONS_REFUSED_EXIT_CODE };
