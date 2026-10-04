/**
 * The story map (phase 4, brief 4.6; spec docs/superpowers/specs/2026-10-02-story-meeting-and-map.md
 * sections 5.1 to 5.4; CONTEXT.md "Story map"): the settled weave laid across the
 * article's sections in about 450 words. The map writer lays it out, the director edits it
 * at the map's stop, and the article writer writes the prose from it.
 *
 * A map holds:
 * - `headline` and `deck`, within the content bundle's limits;
 * - `topPhoto`: the photo the article prints at its top, its hero;
 * - `gapNote`, only when the record cannot carry part of the story, a player cannot be
 *   placed or a link the weave lacks was seen: `{line, players}`;
 * - `sections`, in order: `{slot, heading, job, beats, photos}`, each slot one of the
 *   theme's (lib/theme-config.js mapSlotsOf);
 * - each beat `{id, kind, material, players, card?, connection?}`: its kind
 *   (MAP_BEAT_KINDS), its material named, the roster players it shows, the id of the
 *   document it prints as a card, and the id of the weave's connection that lands in it;
 * - each photo `{filename, beat?}`, beside the beat it belongs with, or by itself in the
 *   section where its people appear;
 * - `dropped`: `{slot, reason}` for each slot the story does not use;
 * - `leftOut`: the beats considered and not used, in the beat's shape;
 * - `expectedLength`: the writer's estimate of the article's length, in words;
 * - `weaveChanges`: `{source, change}` for each change the map made to the weave to fit
 *   in one the director made at the meeting, its source a meeting edit's id or "note".
 *
 * This module holds the rules every reader of a map shares, each one function: the code
 * checks (mapFindings), the map's version stamp (mapKey) and the roster the checks read.
 * Everyone and the counts are console/outline-edit-logic.js's mapTally, which the checks,
 * the stop and the console share.
 *
 * Generic: slots, beats and photos. The theme's config names the slots, so nothing here
 * names a theme.
 */
'use strict';

const crypto = require('crypto');
const { mapTally, mapPhotoPlacements, rosterMemberOf } = require('../console/outline-edit-logic');
const { mapEditAddress, mapPhotoKey, isCut, isStrike, MAP_NONE, MAP_LEFT_OUT, MAP_SCOPE } = require('./hand-edit-diff');

/** A beat's kind: what it puts on the page (C2). */
const MAP_BEAT_KINDS = Object.freeze(['scene', 'receipt', 'line', 'figure']);

/** How many inline cards the article carries (C9), which the map's cards are held to. */
const MAP_CARDS = Object.freeze({ min: 3, max: 5 });

/** The `source` the map checks stamp on validationResults (node-helpers.js CODE_CHECKS). */
const MAP_CHECKS_SOURCE = 'map-checks';

/** The source a change to the weave names when the director's note at the meeting asked for it. */
const MEETING_NOTE_SOURCE = 'note';

/** A field as text: the string trimmed, or '' for anything else. */
function textOf(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** The objects in a list, or none. */
function objectsOf(value) {
  return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)) : [];
}

/** Words joined as a list is read: "a", "a and b", "a, b and c". */
function listOf(words) {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words.join('');
}

/** JSON with every object's keys sorted, so equal content gives one text. */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((key) => value[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

/**
 * The map's version stamp: a short hash of its content. The checks' result is stamped
 * with it, so the stop shows a failure only for the map it was found on.
 *
 * @param {*} map
 * @returns {string} 12 hex characters
 */
function mapKey(map) {
  return crypto.createHash('sha1').update(canonicalJson(map === undefined ? null : map)).digest('hex').slice(0, 12);
}

/**
 * The session's roster as the checks and Everyone read it: each player's name as the
 * roster stop gave it, with the full name the canon gives.
 *
 * @param {Object|null} sessionConfig - its roster
 * @param {Object|null} canonicalCharacters - first name -> full name
 * @returns {Array<{name: string, fullName: string|null}>}
 */
function mapRosterOf(sessionConfig, canonicalCharacters) {
  const roster = sessionConfig && Array.isArray(sessionConfig.roster) ? sessionConfig.roster : [];
  const canon = canonicalCharacters && typeof canonicalCharacters === 'object' ? canonicalCharacters : {};
  return roster
    .map((entry) => (entry && typeof entry === 'object' ? entry.name : entry))
    .filter((name) => typeof name === 'string' && name.trim())
    .map((name) => ({ name: name.trim(), fullName: typeof canon[name.trim()] === 'string' ? canon[name.trim()] : null }));
}

/** Is `map` a map: an object with a list of sections? */
function isMapValue(map) {
  return Boolean(map && typeof map === 'object' && !Array.isArray(map) && Array.isArray(map.sections));
}

/** The beats in the map's sections, each with the slot it sits in; a left-out beat is not among them. */
function sectionBeats(map) {
  return objectsOf(map.sections).flatMap((section) => objectsOf(section.beats).map((beat) => ({ beat, slot: textOf(section.slot) })));
}

/** The director's edits on the map's beats and photos, each with what it is about. */
function addressed(edits) {
  return (Array.isArray(edits) ? edits : [])
    .filter((edit) => edit && edit.scope === MAP_SCOPE)
    .map((edit) => ({ edit, address: mapEditAddress(edit) }));
}

/** The players a beat, a gap note or a players list names. */
function playersIn(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object' && Array.isArray(value.players)) return value.players;
  return [];
}

/** Does a value (a beat, a gap note, a players list) name this roster member? */
function namesMember(value, member, roster) {
  return playersIn(value).some((name) => rosterMemberOf(name, roster) === member);
}

/** The ids of the director's edits that took a roster member off the map's beats and gap note. */
function editsRemovingPlayer(edits, member, roster) {
  return edits.filter((edit) => {
    const steps = Array.isArray(edit.at) ? edit.at : [];
    const field = steps.length > 0 && 'key' in steps[steps.length - 1] ? steps[steps.length - 1].key : null;
    const address = mapEditAddress(edit);
    if (address && address.kind === 'beat' && address.fieldSteps.length === 0) {
      if (isCut(edit)) return namesMember(edit.before, member, roster);
      return isStrike(edit) && namesMember(edit.after, member, roster);
    }
    const aboutPlayers = field === 'players' || (steps[0] && steps[0].key === 'gapNote');
    return aboutPlayers && namesMember(edit.before, member, roster) && !namesMember(edit.after, member, roster);
  }).map((edit) => edit.id);
}

/** The ids of the director's edits on a photo: a placement of it, or a cut of one. */
function editsOnPhoto(entries, filename) {
  const key = mapPhotoKey(filename);
  return entries
    .filter(({ address }) => address && address.kind === 'photo' && address.fieldSteps.length === 0 && mapPhotoKey(address.identity.filename) === key)
    .map(({ edit }) => edit.id);
}

/** A beat's card, or '' for a beat that is no card. */
function cardOf(value) {
  return value && typeof value === 'object' ? textOf(value.card) : '';
}

/**
 * The ids of the director's edits that touch the map's cards: a card beat they cut, struck,
 * added or brought back, and a beat's card they changed. With `beatId`, only that beat's.
 */
function editsOnCards(entries, beatId = null) {
  return entries.filter(({ edit, address }) => {
    if (!address || address.kind !== 'beat') return false;
    if (beatId !== null && String(address.identity.id).trim() !== beatId) return false;
    if (address.fieldSteps.length > 0) return address.fieldSteps[0].key === 'card';
    if (isCut(edit)) return Boolean(cardOf(edit.before));
    const bringsIn = edit.from === MAP_NONE || edit.from === MAP_LEFT_OUT;
    return Boolean(cardOf(edit.after)) && (bringsIn || address.container === MAP_LEFT_OUT);
  }).map(({ edit }) => edit.id);
}

/** The ids of the director's edits that took a connection off the map's beats. */
function editsRemovingConnection(entries, connection) {
  return entries.filter(({ edit, address }) => {
    if (!address || address.kind !== 'beat') return false;
    if (address.fieldSteps.length > 0) return address.fieldSteps[0].key === 'connection' && textOf(edit.before) === connection;
    if (isCut(edit)) return edit.before && textOf(edit.before.connection) === connection;
    return isStrike(edit) && edit.after && textOf(edit.after.connection) === connection;
  }).map(({ edit }) => edit.id);
}

/**
 * The map's code checks (spec 5.4), each failure one line that names the defect and its
 * fix with its own list, in the order the stop prints the map:
 * - every beat has an id of its own, since the director's edits find a beat by its id
 *   (`duplicate-beat-id`);
 * - every roster player appears in a section's beat, or is among the gap note's players
 *   (`player-not-placed`; C7);
 * - every kept photo is placed once: as the top photo or among a section's photos
 *   (`photo-not-placed`, `photo-placed-twice`), and no photo outside the kept set is placed
 *   (`photo-not-offered`; T13);
 * - each card names a document in the record (`card-not-in-record`), and the cards number
 *   three to five (`card-count`; C9);
 * - every live connection of the settled weave lands in a section's beat
 *   (`connection-not-landed`);
 * - each change to the weave names a meeting edit's id or the meeting's note
 *   (`weave-change-source`), and there is none when the director changed nothing at the
 *   meeting and left no note (`weave-change-unasked`).
 *
 * A failure the director caused is a concern on their edit, beside its line, never a
 * rework (R11): a beat they struck or cut that held the only place of a player, a card or
 * a connection; a card or a photo they placed; a beat they added under an id the map
 * holds. A failure partly theirs splits: the writer's part fails, the director's is a
 * concern.
 *
 * @param {*} map
 * @param {Object} inputs
 * @param {Array} inputs.roster - mapRosterOf's roster
 * @param {string[]} inputs.keptPhotos - the filenames of the photos kept for the article
 * @param {Iterable<string>} inputs.recordIds - the ids a document in the record answers to
 * @param {string[]} inputs.connections - the ids of the settled weave's live connections
 * @param {string[]} inputs.meetingEdits - the ids of the director's edits at the meeting
 * @param {boolean} inputs.meetingNote - whether the director left a note at the meeting
 * @param {Object[]} [inputs.edits] - the director's standing edits the map carries
 * @returns {{failures: Array<{type: string, message: string}>,
 *            concerns: Array<{type: string, editIds: string[], finding: string}>}}
 */
function mapFindings(map, inputs = {}) {
  if (!isMapValue(map)) {
    return { failures: [{ type: 'no-map', message: 'The output holds no sections. Write the whole map in the shape <SCHEMA> gives.' }], concerns: [] };
  }
  const roster = Array.isArray(inputs.roster) ? inputs.roster : [];
  const kept = Array.isArray(inputs.keptPhotos) ? inputs.keptPhotos.filter((f) => typeof f === 'string' && f.trim()) : [];
  const edits = (Array.isArray(inputs.edits) ? inputs.edits : []).filter((edit) => edit && edit.scope === MAP_SCOPE);
  const entries = addressed(edits);
  const failures = [];
  const concerns = [];
  const fail = (type, message) => failures.push({ type, message });
  const concern = (type, editIds, finding) => concerns.push({ type, editIds: [...new Set(editIds)], finding });

  // Every beat has an id of its own (the edits find a beat by its id).
  const counts = new Map();
  [...objectsOf(map.sections).flatMap((section) => objectsOf(section.beats)), ...objectsOf(map.leftOut)].forEach((beat) => {
    const id = textOf(String(beat.id === undefined || beat.id === null ? '' : beat.id));
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  const repeated = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  if (repeated.length > 0) {
    const added = entries.filter(({ edit, address }) => address && address.kind === 'beat' && address.fieldSteps.length === 0
      && edit.from === MAP_NONE && repeated.includes(String(address.identity.id).trim()));
    const writers = repeated.filter((id) => !added.some(({ address }) => String(address.identity.id).trim() === id));
    if (added.length > 0) concern('duplicate-beat-id', added.map(({ edit }) => edit.id), `The beat you added shares its id with another beat (${listOf(repeated.filter((id) => !writers.includes(id)))}).`);
    if (writers.length > 0) fail('duplicate-beat-id', `Beats sharing an id: ${listOf(writers)}. Give each beat, in the sections and in leftOut, an id of its own.`);
  }

  // Every roster player appears in a beat, or is raised in the gap note (C7).
  const tally = mapTally(map, { roster, keptPhotos: kept });
  const raised = new Set(tally.raised);
  const missing = tally.unplaced.filter((name) => !raised.has(name));
  const writersMissing = [];
  missing.forEach((name) => {
    const ids = editsRemovingPlayer(edits, name, roster);
    if (ids.length > 0) concern('player-not-placed', ids, `${name} is in no beat and not in the gap note.`);
    else writersMissing.push(name);
  });
  if (writersMissing.length > 0) {
    fail('player-not-placed', `Players in no beat: ${writersMissing.join(', ')}. Place each in a section's beat, or name them among gapNote's players, as C7 (\`<craft-material>\`) sets out.`);
  }

  // Every kept photo is placed once, and only kept photos are placed (T13).
  const keptKeys = kept.map(mapPhotoKey);
  const placements = mapPhotoPlacements(map);
  const placedCount = new Map();
  placements.forEach(({ filename }) => placedCount.set(mapPhotoKey(filename), (placedCount.get(mapPhotoKey(filename)) || 0) + 1));
  const split = (type, filenames, writersLine, directorsFinding) => {
    const theirs = [];
    filenames.forEach((filename) => {
      const ids = editsOnPhoto(entries, filename);
      if (ids.length > 0) concern(type, ids, directorsFinding(filename));
      else theirs.push(filename);
    });
    if (theirs.length > 0) fail(type, writersLine(theirs));
  };
  const nameOfKey = (key) => (kept.find((f) => mapPhotoKey(f) === key) || placements.find((p) => mapPhotoKey(p.filename) === key).filename);
  split('photo-not-placed', kept.filter((filename) => !placedCount.has(mapPhotoKey(filename))),
    (list) => `Photos placed nowhere: ${list.join(', ')}. Place each photo once: as topPhoto, or among the photos of the section where it belongs, beside its beat or with its people, as C2 (\`<craft-form>\`) sets out.`,
    (filename) => `${filename} is placed nowhere.`);
  split('photo-placed-twice', [...placedCount].filter(([key, n]) => n > 1 && keptKeys.includes(key)).map(([key]) => nameOfKey(key)),
    (list) => `Photos placed more than once: ${list.join(', ')}. Place each photo once.`,
    (filename) => `${filename} is placed more than once.`);
  split('photo-not-offered', [...new Set(placements.map((p) => mapPhotoKey(p.filename)))].filter((key) => !keptKeys.includes(key)).map(nameOfKey),
    (list) => `Photos placed that are not among the photos offered: ${list.join(', ')}. Place only the photos offered: ${kept.join(', ') || 'none'}.`,
    (filename) => `${filename} is not among the photos kept for the article.`);

  // Each card names a document in the record, and the cards number three to five (C9).
  const known = new Set([...(inputs.recordIds || [])].filter((id) => typeof id === 'string').map((id) => id.trim().toLowerCase()));
  const cards = sectionBeats(map).filter(({ beat }) => cardOf(beat));
  const unknown = [];
  cards.forEach(({ beat }) => {
    const card = cardOf(beat);
    if (known.has(card.toLowerCase())) return;
    const ids = editsOnCards(entries, textOf(String(beat.id)));
    if (ids.length > 0) concern('card-not-in-record', ids, `The card ${card} names no document in the record.`);
    else unknown.push(`${card} (beat ${textOf(String(beat.id))})`);
  });
  if (unknown.length > 0) {
    fail('card-not-in-record', `Cards naming no document in <RECORD>: ${unknown.join(', ')}. A card names the id of a document in <RECORD>: ${[...(inputs.recordIds || [])].join(', ')}.`);
  }
  if (cards.length < MAP_CARDS.min || cards.length > MAP_CARDS.max) {
    const ids = editsOnCards(entries);
    if (ids.length > 0) concern('card-count', ids, `The map carries ${cards.length} cards; the article carries ${MAP_CARDS.min} to ${MAP_CARDS.max}.`);
    else fail('card-count', `The map carries ${cards.length} cards. Mark ${MAP_CARDS.min} to ${MAP_CARDS.max} beats as cards, each with the id of the document it prints, as C9 (\`<craft-cards>\`) sets out.`);
  }

  // Every live connection of the settled weave lands in a beat.
  const landed = new Set(sectionBeats(map).map(({ beat }) => textOf(beat.connection)).filter(Boolean));
  const unlanded = [];
  (Array.isArray(inputs.connections) ? inputs.connections : []).map(textOf).filter(Boolean).forEach((connection) => {
    if (landed.has(connection)) return;
    const ids = editsRemovingConnection(entries, connection);
    if (ids.length > 0) concern('connection-not-landed', ids, `The connection ${connection} lands in no beat.`);
    else unlanded.push(connection);
  });
  if (unlanded.length > 0) {
    fail('connection-not-landed', `Connections from the settled weave that land in no beat: ${unlanded.join(', ')}. Land each in the beat where it does its work, by its id in that beat's connection.`);
  }

  // Each change to the weave names its source, and there is none the director did not ask for.
  const changes = objectsOf(map.weaveChanges);
  const meetingEdits = (Array.isArray(inputs.meetingEdits) ? inputs.meetingEdits : []).map(textOf).filter(Boolean);
  const sources = new Set([...meetingEdits, ...(inputs.meetingNote ? [MEETING_NOTE_SOURCE] : [])]);
  const directorsChanges = edits.filter((edit) => Array.isArray(edit.at) && edit.at[0] && edit.at[0].key === 'weaveChanges').map((edit) => edit.id);
  if (changes.length > 0 && sources.size === 0) {
    if (directorsChanges.length > 0) concern('weave-change-unasked', directorsChanges, 'The map lists changes to the weave the meeting did not ask for.');
    else fail('weave-change-unasked', 'The map lists changes to the weave, and the director changed nothing at the meeting and left no note. Leave weaveChanges empty.');
  } else {
    const unnamed = changes.map((change) => textOf(change.source)).filter((source) => !sources.has(source));
    if (unnamed.length > 0) {
      const allowed = [...meetingEdits, ...(inputs.meetingNote ? [`"${MEETING_NOTE_SOURCE}"`] : [])];
      if (directorsChanges.length > 0) concern('weave-change-source', directorsChanges, `A change to the weave names a source the meeting does not hold: ${unnamed.map((s) => `"${s}"`).join(', ')}.`);
      else fail('weave-change-source', `Changes to the weave name sources the meeting does not hold: ${unnamed.map((s) => `"${s}"`).join(', ')}. Name each change's source: ${listOf(allowed)}.`);
    }
  }

  return { failures, concerns };
}

module.exports = {
  MAP_BEAT_KINDS,
  MAP_CARDS,
  MAP_CHECKS_SOURCE,
  MEETING_NOTE_SOURCE,
  mapKey,
  mapRosterOf,
  mapFindings
};
