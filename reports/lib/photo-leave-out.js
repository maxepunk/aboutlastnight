/**
 * Photo leave-out - the photos the director leaves out (phase 4, brief 4.2; spec
 * 2026-10-02 section 8; T13: an excluded photo never appears)
 *
 * The character-IDs stop shows a "leave this photo out" box on each photo, and the box
 * decides. Until it, a photo was left out only when the character-ID parse read an
 * exclusion in the director's free text. Two records carry the decision:
 * - the list, `state.leftOutPhotos`: the filenames the director left out, each once. The
 *   stop's boxes write it (listAfterStopChoices, from buildResumePayload), and
 *   leavePhotosOut adds to it, as 4.7 does for a photo the director deletes at the desk;
 * - each photo's mapping, `characterIdMappings[<filename>].exclude`, which
 *   isPhotoExcluded (ai-nodes.js) reads first. That one predicate decides the writers'
 *   photo lists, the hero, the fact check and so what publish prints.
 *
 * The character-ID parse writes an explicit `exclude` into the mapping of every photo
 * the stop showed (withExplicitExclusions), in each of its paths: true when the photo is
 * on the list, otherwise the parse's own value (an exclusion the director's text asked
 * for), otherwise false. So the mapping decides for every photo the director saw, and an
 * analysis's `excluded` mark, which a rollback to character-ids leaves stale (the
 * analyses are kept and finalizePhotoAnalyses skips once any is enriched), never does.
 *
 * Photos are matched by photoKey (basename, case-insensitive), the one join key, and a
 * photo's mapping is the one photoMappingOf finds, which isPhotoExcluded,
 * finalizePhotoAnalyses and the explicit mark all read.
 *
 * @module photo-leave-out
 */

const { photoKey } = require('./prompt-renderers/director-words-renderer');
const { CHARACTER_IDS_PHOTO_TEMPLATE } = require('./schemas/character-ids');

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A filename without its folders. */
function basenameOf(filename) {
  return String(filename).split(/[/\\]/).pop();
}

/** Each photo once, by photoKey, in first-seen order. */
function uniqueByKey(filenames) {
  const seen = new Set();
  return filenames.filter((filename) => {
    const key = photoKey(filename);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The photos the character-IDs stop shows: one card per analysis (the console's
 * characterIdCards), so every analysis with a filename.
 *
 * @param {Object} state
 * @returns {string[]} filenames, each once
 */
function shownPhotos(state) {
  const analyses = (state && state.photoAnalyses && state.photoAnalyses.analyses) || [];
  return uniqueByKey(analyses
    .filter((analysis) => analysis && typeof analysis.filename === 'string' && analysis.filename.trim())
    .map((analysis) => basenameOf(analysis.filename)));
}

/** The name a photo is recorded under: its analysis's own filename, else its basename. */
function recordedName(state, filename) {
  const key = photoKey(filename);
  return shownPhotos(state).find((name) => photoKey(name) === key) || basenameOf(filename);
}

/**
 * The leave-out list as stored, each photo once. A cleared or absent list is none.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function leftOutPhotosOf(state) {
  const list = state && Array.isArray(state.leftOutPhotos) ? state.leftOutPhotos : [];
  return uniqueByKey(list.filter((filename) => typeof filename === 'string' && filename.trim()));
}

/** A mapping in the parse's shape (CHARACTER_IDS_PHOTO_TEMPLATE, without its filename). */
function newMapping(exclude) {
  const { filename, ...fields } = CHARACTER_IDS_PHOTO_TEMPLATE;
  return { ...JSON.parse(JSON.stringify(fields)), exclude };
}

/** The keys of `mappings` that name the photo, whatever their case. */
function keysNaming(mappings, filename) {
  const key = photoKey(filename);
  return Object.keys(mappings).filter((name) => photoKey(name) === key);
}

/**
 * A photo's mapping: the first entry of `mappings` whose key names the photo and whose
 * value is a mapping object; a key naming the photo that holds text, null or a list is
 * passed over. The one lookup (brief 4.2b, fix round 1), because the parse's keys need
 * not match a filename's case: isPhotoExcluded reads the photo's `exclude` from it,
 * finalizePhotoAnalyses its identifications and corrections, and withExplicitExclusions
 * the parse's own value, so all three read the same entry.
 *
 * @param {Object|null} mappings - characterIdMappings, or the mappings the parse is building
 * @param {string} filename - a photo's filename or path
 * @returns {Object|null} the mapping, or null when no entry names the photo with one
 */
function photoMappingOf(mappings, filename) {
  if (!isPlainObject(mappings) || !photoKey(filename)) return null;
  return keysNaming(mappings, filename).map((key) => mappings[key]).find(isPlainObject) || null;
}

/**
 * `mappings` with `exclude` set on every key that names the photo. A key whose value is
 * no mapping object becomes one, so every key naming the photo agrees whichever
 * isPhotoExcluded reads; with no such key, a new mapping under `name`. Never mutates.
 */
function withExclude(mappings, name, exclude) {
  const keys = keysNaming(mappings, name);
  const next = { ...mappings };
  if (keys.length === 0) {
    next[name] = newMapping(exclude);
    return next;
  }
  keys.forEach((key) => {
    next[key] = isPlainObject(mappings[key]) ? { ...mappings[key], exclude } : newMapping(exclude);
  });
  return next;
}

/**
 * Leaves photos out: adds each filename to the list, and sets `exclude: true` in each
 * one's mapping, creating the mapping when the photo has none, so the exclusion holds
 * however long after the parse it is added. The one function that adds to the list; 4.7
 * calls it for a photo the director deletes at the desk.
 *
 * @param {Object} state - reads leftOutPhotos, characterIdMappings and the analyses' filenames
 * @param {string[]} filenames - each photo's filename or path
 * @returns {{leftOutPhotos: string[], characterIdMappings: Object}} both channels' new
 *   values, for a state update
 * @throws {TypeError} when filenames is not a list of filenames
 */
function leavePhotosOut(state, filenames) {
  if (!Array.isArray(filenames) || filenames.some((f) => typeof f !== 'string' || !f.trim())) {
    throw new TypeError('leavePhotosOut: filenames must be a list of photo filenames');
  }
  const names = filenames.map((filename) => recordedName(state, filename.trim()));
  let mappings = isPlainObject(state && state.characterIdMappings) ? { ...state.characterIdMappings } : {};
  names.forEach((name) => { mappings = withExclude(mappings, name, true); });
  return {
    leftOutPhotos: uniqueByKey([...leftOutPhotosOf(state), ...names]),
    characterIdMappings: mappings
  };
}

/**
 * The list after the character-IDs stop's choices: for every photo the stop showed, its
 * box decides; a listed photo the stop did not show stays listed. A choice that is not a
 * list of the stop's photos is refused, naming each unknown filename, so a malformed
 * payload never leaves out the wrong photo, or none.
 *
 * @param {Object} state - the state at the stop: its list and its analyses
 * @param {*} ticked - the filenames whose box is ticked (approvals.leftOutPhotos)
 * @returns {{list: string[]|null, error: string|null}}
 */
function listAfterStopChoices(state, ticked) {
  if (!Array.isArray(ticked) || ticked.some((f) => typeof f !== 'string' || !f.trim())) {
    return { list: null, error: 'leftOutPhotos must be a list of photo filenames' };
  }
  const shownKeys = new Set(shownPhotos(state).map(photoKey));
  const unknown = ticked.filter((filename) => !shownKeys.has(photoKey(filename.trim())));
  if (unknown.length > 0) {
    const one = unknown.length === 1;
    return {
      list: null,
      error: `leftOutPhotos names ${unknown.map((f) => `"${f}"`).join(', ')}, which ${one ? 'is not a photo' : 'are not photos'} at this stop`
    };
  }
  const notShown = leftOutPhotosOf(state).filter((filename) => !shownKeys.has(photoKey(filename)));
  return {
    list: uniqueByKey([...notShown, ...ticked.map((filename) => recordedName(state, filename.trim()))]),
    error: null
  };
}

/**
 * The parse's explicit mark: `mappings` with an `exclude` in the mapping of every photo
 * the stop showed. True when the photo is on the list (its box was ticked, or
 * leavePhotosOut added it), otherwise the parse's own value (in the photo's mapping,
 * photoMappingOf), otherwise false. A photo with no mapping gets one; a key naming no
 * photo the stop showed is kept as it is. Never mutates.
 *
 * @param {Object|null} mappings - the mappings the parse built, or the stop's own
 * @param {Object} state - reads the list and the analyses
 * @returns {Object}
 */
function withExplicitExclusions(mappings, state) {
  const listed = new Set(leftOutPhotosOf(state).map(photoKey));
  let next = isPlainObject(mappings) ? { ...mappings } : {};
  shownPhotos(state).forEach((name) => {
    const own = photoMappingOf(next, name);
    const exclude = listed.has(photoKey(name)) || Boolean(own && own.exclude);
    next = withExclude(next, name, exclude);
  });
  return next;
}

module.exports = {
  leftOutPhotosOf,
  leavePhotosOut,
  listAfterStopChoices,
  withExplicitExclusions,
  photoMappingOf,
  shownPhotos
};
