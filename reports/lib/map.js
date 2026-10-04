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
 * This module holds the rules every reader of a map shares, each one function:
 * - THE SCHEMAS: the writer's (mapSchemaFor, the map's shape with the theme's slots) and the
 *   director-side one derived from it (directorMapSchemaFor, R12), which allows a beat the
 *   director added or brought back and is never sent to the SDK;
 * - THE CHECKS (mapFindings), the map's version stamp (mapKey) and the roster they read;
 * - THE STOP: its payloads (mapResume, which server.js buildResumePayload calls) and what it
 *   shows (mapCheckpointData).
 * Everyone and the counts are console/outline-edit-logic.js's mapTally, which the checks,
 * the stop and the console share, with its rule for a beat's card (beatCardOf). A photo is
 * read by its filename's one join key (lib/prompt-renderers/director-words-renderer.js
 * photoKey), as the map's edits and the kept photos read it.
 *
 * Generic: slots, beats and photos. The theme's config names the slots, so nothing here
 * names a theme.
 */
'use strict';

const crypto = require('crypto');
const Ajv = require('ajv');
const outlineSchema = require('./schemas/outline.schema.json');
const { mapSlotsOf } = require('./theme-config');
const { mapTally, mapPhotoPlacements, rosterMemberOf, beatCardOf } = require('../console/outline-edit-logic');
const { photoKey } = require('./prompt-renderers/director-words-renderer');
const {
  mapEditAddress, isCut, isStrike, isMap, standingOnMap, carriedEdits, concernEditIds, editWhere,
  handEditReportOf, MAP_NONE, MAP_LEFT_OUT, MAP_SCOPE
} = require('./hand-edit-diff');

/** A beat's kind: what it puts on the page (C2). */
const MAP_BEAT_KINDS = Object.freeze(['scene', 'receipt', 'line', 'figure']);

/** How many inline cards the article carries (C9), which the map's cards are held to. */
const MAP_CARDS = Object.freeze({ min: 3, max: 5 });

/** The `source` the map checks stamp on validationResults (node-helpers.js CODE_CHECKS). */
const MAP_CHECKS_SOURCE = 'map-checks';

/** The source a change to the weave names when the director's note at the meeting asked for it. */
const MEETING_NOTE_SOURCE = 'note';

/** The story meeting's stop type (R3), the gate its notes carry. */
const MEETING_GATE = 'arc-selection';

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

/**
 * The beat ids that more than one beat of a map carries, in the sections and in leftOut,
 * each once, in the order of its first beat. An id is read as the map's edits find a beat
 * by it: its text, trimmed. The checks (duplicate-beat-id) and the gate
 * (directorMapProblems) both read it.
 *
 * @param {*} map
 * @returns {string[]}
 */
function repeatedBeatIds(map) {
  if (!map || typeof map !== 'object') return [];
  const counts = new Map();
  [...objectsOf(map.sections).flatMap((section) => objectsOf(section.beats)), ...objectsOf(map.leftOut)].forEach((beat) => {
    const id = textOf(String(beat.id === undefined || beat.id === null ? '' : beat.id));
    if (id) counts.set(id, (counts.get(id) || 0) + 1);
  });
  return [...counts].filter(([, n]) => n > 1).map(([id]) => id);
}

/**
 * Each photo a map places, the top photo and the sections' photos, found by the one join
 * key (photoKey), in the order of its first place: the name its first place gives it and
 * how many places it has.
 *
 * @param {*} map
 * @returns {Map<string, {filename: string, count: number}>} photoKey -> the photo
 */
function placedPhotos(map) {
  const placed = new Map();
  mapPhotoPlacements(map).forEach(({ filename }) => {
    const key = photoKey(filename);
    const first = placed.get(key);
    placed.set(key, first ? { filename: first.filename, count: first.count + 1 } : { filename, count: 1 });
  });
  return placed;
}

/**
 * The photos a map places more than once (placedPhotos), each once, under the name its
 * first place gives it, in the map's order. The checks (photo-placed-twice) and the gate
 * (directorMapProblems) both read it.
 *
 * @param {*} map
 * @returns {Map<string, string>} photoKey -> filename
 */
function repeatedPhotos(map) {
  return new Map([...placedPhotos(map)].filter(([, photo]) => photo.count > 1).map(([key, photo]) => [key, photo.filename]));
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
  const key = photoKey(filename);
  return entries
    .filter(({ address }) => address && address.kind === 'photo' && address.fieldSteps.length === 0 && photoKey(address.identity.filename) === key)
    .map(({ edit }) => edit.id);
}

/**
 * The ids of the director's edits on one beat's card, for a card that names no document in
 * the record: a card they gave the beat, and the beat they cut, struck, added or brought
 * back with its card.
 */
function editsOnCards(entries, beatId) {
  return entries.filter(({ edit, address }) => {
    if (!address || address.kind !== 'beat' || String(address.identity.id).trim() !== beatId) return false;
    if (address.fieldSteps.length > 0) return address.fieldSteps[0].key === 'card';
    if (isCut(edit)) return Boolean(beatCardOf(edit.before));
    const bringsIn = edit.from === MAP_NONE || edit.from === MAP_LEFT_OUT;
    return Boolean(beatCardOf(edit.after)) && (bringsIn || address.container === MAP_LEFT_OUT);
  }).map(({ edit }) => edit.id);
}

/**
 * How the director's edits moved the card count the card check reads (mapTally; brief
 * 4.6b): one change for each beat their edits touch that is a card beat in a section on one
 * side only, read where it sat, with its card, before their edits and where it sits now.
 * `delta` is +1 for a card beat they added or brought back and a card they gave a beat, and
 * -1 for a card beat they struck or cut and a card they cleared; `editIds` are their edits
 * on that beat. An edit that changes which document a card prints, or moves a card beat
 * between sections, moves no count.
 *
 * @param {Array<{edit: Object, address: Object|null}>} entries - the edits with what each is about (addressed)
 * @returns {Array<{delta: number, editIds: string[]}>}
 */
function cardCountChanges(entries) {
  const beats = new Map();
  entries.forEach(({ edit, address }) => {
    if (!address || address.kind !== 'beat') return;
    const onCard = address.fieldSteps.length === 1 && address.fieldSteps[0].key === 'card';
    if (address.fieldSteps.length > 0 && !onCard) return;
    const id = String(address.identity.id).trim();
    beats.set(id, { ...beats.get(id), [onCard ? 'card' : 'place']: { edit, address } });
  });
  const inSections = (container) => container !== MAP_LEFT_OUT && container !== MAP_NONE;
  const cardOf = (value) => beatCardOf({ card: value });
  const changes = [];
  beats.forEach(({ place, card }) => {
    let was;
    let now;
    if (place && isCut(place.edit)) {
      was = inSections(place.address.container) && Boolean(beatCardOf(place.edit.before));
      now = false;
    } else {
      const sits = (place || card).address.container;
      const sat = place && place.edit.from ? place.edit.from : sits;
      const nowCard = card ? cardOf(card.edit.after) : beatCardOf(place.edit.after);
      now = inSections(sits) && Boolean(nowCard);
      was = inSections(sat) && Boolean(card ? cardOf(card.edit.before) : nowCard);
    }
    if (was !== now) changes.push({ delta: now ? 1 : -1, editIds: [place, card].filter(Boolean).map(({ edit }) => edit.id) });
  });
  return changes;
}

/**
 * Whose a card count that fails is (brief 4.6b, fix round 1; R11). The director's edits
 * own it only when, together, they moved the count the way it fails, and then only the
 * edits that moved it that way: a strike cannot make too many cards, and a swap of one card
 * beat for another moves no count. The writer owns the rest: all of it when their edits
 * moved the count the other way or not at all, and a part of it when the count without
 * their edits fails the same way, so the failure splits.
 *
 * @param {number} cards - the map's card count (mapTally), outside MAP_CARDS
 * @param {Array<{edit: Object, address: Object|null}>} entries - the edits with what each is about (addressed)
 * @returns {{editIds: string[], writers: boolean}} the director's edits the count is a
 *   concern on, and whether the writer's part fails
 */
function cardCountOwners(cards, entries) {
  const way = cards > MAP_CARDS.max ? 1 : -1;
  const changes = cardCountChanges(entries);
  const net = changes.reduce((sum, change) => sum + change.delta, 0);
  if (Math.sign(net) !== way) return { editIds: [], writers: true };
  const writersCount = cards - net;
  return {
    editIds: changes.filter((change) => change.delta === way).flatMap((change) => change.editIds),
    writers: way > 0 ? writersCount > MAP_CARDS.max : writersCount < MAP_CARDS.min
  };
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
 * rework (R11): a beat they struck or cut that held the only place of a player or a
 * connection; a card or a photo they placed; the card count, when their edits, together,
 * moved it the way it fails (cardCountOwners; brief 4.6b); a beat they added under an id
 * the map holds. A failure partly theirs splits: the writer's part fails, the director's is
 * a concern. A card count is partly theirs when the count without their edits fails the
 * same way.
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
  const repeated = repeatedBeatIds(map);
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
  const keptKeys = kept.map(photoKey);
  const placed = placedPhotos(map);
  const split = (type, filenames, writersLine, directorsFinding) => {
    const theirs = [];
    filenames.forEach((filename) => {
      const ids = editsOnPhoto(entries, filename);
      if (ids.length > 0) concern(type, ids, directorsFinding(filename));
      else theirs.push(filename);
    });
    if (theirs.length > 0) fail(type, writersLine(theirs));
  };
  const nameOfKey = (key) => (kept.find((f) => photoKey(f) === key) || placed.get(key).filename);
  split('photo-not-placed', kept.filter((filename) => !placed.has(photoKey(filename))),
    (list) => `Photos placed nowhere: ${list.join(', ')}. Place each photo once: as topPhoto, or among the photos of the section where it belongs, beside its beat or with its people, as C2 (\`<craft-form>\`) sets out.`,
    (filename) => `${filename} is placed nowhere.`);
  split('photo-placed-twice', [...repeatedPhotos(map).keys()].filter((key) => keptKeys.includes(key)).map(nameOfKey),
    (list) => `Photos placed more than once: ${list.join(', ')}. Place each photo once.`,
    (filename) => `${filename} is placed more than once.`);
  split('photo-not-offered', [...placed.keys()].filter((key) => !keptKeys.includes(key)).map(nameOfKey),
    (list) => `Photos placed that are not among the photos offered: ${list.join(', ')}. Place only the photos offered: ${kept.join(', ') || 'none'}.`,
    (filename) => `${filename} is not among the photos kept for the article.`);

  // Each card names a document in the record, and the cards, as the tally counts them,
  // number three to five (C9).
  const known = new Set([...(inputs.recordIds || [])].filter((id) => typeof id === 'string').map((id) => id.trim().toLowerCase()));
  const unknown = [];
  sectionBeats(map).filter(({ beat }) => beatCardOf(beat)).forEach(({ beat }) => {
    const card = beatCardOf(beat);
    if (known.has(card.toLowerCase())) return;
    const ids = editsOnCards(entries, textOf(String(beat.id)));
    if (ids.length > 0) concern('card-not-in-record', ids, `The card ${card} names no document in the record.`);
    else unknown.push(`${card} (beat ${textOf(String(beat.id))})`);
  });
  if (unknown.length > 0) {
    fail('card-not-in-record', `Cards naming no document in <RECORD>: ${unknown.join(', ')}. A card names the id of a document in <RECORD>: ${[...(inputs.recordIds || [])].join(', ')}.`);
  }
  if (tally.cards < MAP_CARDS.min || tally.cards > MAP_CARDS.max) {
    const owners = cardCountOwners(tally.cards, entries);
    const carries = `The map carries ${tally.cards} card${tally.cards === 1 ? '' : 's'}`;
    if (owners.editIds.length > 0) concern('card-count', owners.editIds, `${carries}; the article carries ${MAP_CARDS.min} to ${MAP_CARDS.max}.`);
    if (owners.writers) fail('card-count', `${carries}. Mark ${MAP_CARDS.min} to ${MAP_CARDS.max} beats as cards, each with the id of the document it prints, as C9 (\`<craft-cards>\`) sets out.`);
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


// ─── the map's schemas (brief 4.6; R12) ──────────────────────────────────────

/** Each theme's built schemas, made once, so the SDK guardrail's memo and ajv compile once. */
const writerSchemas = new Map();
const directorSchemas = new Map();
const directorValidators = new Map();

/**
 * The map writer's schema for a theme: the map's shape (lib/schemas/outline.schema.json)
 * with the theme's slots (lib/theme-config.js mapSlotsOf) as the only slots a section or a
 * dropped slot may name. The writer, its rework and the prompt's <SCHEMA> read it.
 *
 * @param {string} theme
 * @returns {Object}
 * @throws {Error} for a theme with no map slots, such as the parked detective (R1)
 */
function mapSchemaFor(theme) {
  if (!writerSchemas.has(theme)) {
    const slots = mapSlotsOf(theme).map((slot) => slot.key);
    if (slots.length === 0) {
      throw new Error(`The "${theme}" theme has no story map: its config names no map slots (lib/theme-config.js). The detective is parked (R1).`);
    }
    const schema = structuredClone(outlineSchema);
    schema.properties.sections.items.properties.slot.enum = slots;
    schema.properties.dropped.items.properties.slot.enum = slots;
    writerSchemas.set(theme, schema);
  }
  return writerSchemas.get(theme);
}

/**
 * The map as the director leaves it (R12): the writer's schema for the theme, derived in
 * code, with a beat the director added or brought back allowed whole: a beat needs only its
 * id and its material, in a section and in leftOut. The payload gate validates against it
 * and the console's validator is held to it (console/outline-edit-logic.js
 * validateMapShape); it is never sent to the SDK, so no model writes to it.
 *
 * @param {string} theme
 * @returns {Object}
 */
function directorMapSchemaFor(theme) {
  if (!directorSchemas.has(theme)) {
    const schema = structuredClone(mapSchemaFor(theme));
    [schema.properties.sections.items.properties.beats.items, schema.properties.leftOut.items]
      .forEach((beat) => { beat.required = ['id', 'material']; });
    directorSchemas.set(theme, schema);
  }
  return directorSchemas.get(theme);
}

/**
 * What the director-side schema finds wrong with a map, as one refusal that says where, or
 * null for a map it accepts. Past the schema, every beat has an id of its own, since the
 * edits find a beat by its id, and every photo is placed once (brief 4.6b), since a photo
 * the director's changes place twice is a copy no edit carries: the check would file it as
 * the writer's, and an automatic pass could undo the director's choice unrestored. For
 * both, a repeat the map the stop showed holds is the writer's, which the map checks report
 * and a rework fixes; one it does not hold is the director's, refused. The gate and the
 * checks find repeats by the same rules (repeatedBeatIds, repeatedPhotos).
 *
 * @param {*} map - the map as the director left it
 * @param {Object} options
 * @param {string} options.theme
 * @param {Object|null} [options.shown] - the map the stop showed
 * @returns {string|null}
 */
function directorMapProblems(map, { theme, shown = null } = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 'The map must be an object: the map as the director left it.';
  if (!directorValidators.has(theme)) {
    directorValidators.set(theme, new Ajv({ allErrors: true, strict: true }).compile(directorMapSchemaFor(theme)));
  }
  const validate = directorValidators.get(theme);
  if (!validate(map)) {
    const errors = (validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
    return `The map as the director left it failed the director-side schema: ${errors}`;
  }
  const writers = new Set(repeatedBeatIds(shown));
  const theirs = repeatedBeatIds(map).filter((id) => !writers.has(id));
  if (theirs.length > 0) {
    return `Two beats share the id ${listOf(theirs.map((id) => `"${id}"`))}: the director's changes made ${theirs.length > 1 ? 'these repeats' : 'this repeat'}. Give each beat an id of its own.`;
  }
  const writersPhotos = repeatedPhotos(shown);
  const theirPhotos = [...repeatedPhotos(map)].filter(([key]) => !writersPhotos.has(key)).map(([, filename]) => `"${filename}"`);
  if (theirPhotos.length > 0) {
    const many = theirPhotos.length > 1;
    return `${listOf(theirPhotos)} ${many ? 'are' : 'is'} placed more than once: the director's changes made ${many ? 'these repeats' : 'this repeat'}. Place each photo once: as the top photo, or in one section.`;
  }
  return null;
}

/** The map's top photo, or null: the photo the article prints as its hero. */
function topPhotoOf(map) {
  return map && typeof map === 'object' && typeof map.topPhoto === 'string' && map.topPhoto.trim() ? map.topPhoto : null;
}

// ─── the stop (brief 4.6) ─────────────────────────────────────────────────────

/** The map's two actions. */
const MAP_ACTIONS = Object.freeze(['approve', 'send-back']);

/** The outline stop's old payload keys, refused by name. */
const RETIRED_OUTLINE_KEYS = Object.freeze(['outlineEdits', 'outlineFeedback', 'outlineNote']);

/**
 * One of the map's payloads, as the stop's resume and the state it writes (brief 4.6):
 * `{outline: 'approve' | 'send-back', map, note}`.
 * - Approve carries the map as the director left it, and an optional note, which joins the
 *   standing notes as an approval note.
 * - A send-back carries a note, the round's (`_outlineFeedback`), which joins them as a
 *   rejection note, and the map when the director edited it; it opens a new round, so the
 *   report and the trace start over.
 *
 * Both write the director's version, validated against the director-side schema, the
 * standing edits against the writer's last map (`_mapBaseline`, or the map the stop showed
 * when the thread holds none; lib/hand-edit-diff.js standingOnMap), and the hero, the map's
 * top photo. The approval itself is the stop's to set (checkpoint-nodes.js
 * checkpointOutline). The old outline payload is refused by name, and so is a payload for a
 * theme with no map (the parked detective, R1).
 *
 * @param {Object} approvals - the request body
 * @param {Object} currentState - the thread's state at the stop
 * @param {Object} options
 * @param {string} options.theme
 * @param {string[]} [options.names] - the roster's names, which a cut or a rewrite records
 * @returns {{resume: Object, stateUpdates: Object, note: {text: string, kind: string}|null, error: string|null}}
 */
function mapResume(approvals, currentState = {}, { theme, names } = {}) {
  const refuse = (error) => ({ resume: {}, stateUpdates: {}, note: null, error });
  const body = approvals || {};
  if (mapSlotsOf(theme).length === 0) {
    return refuse(`The "${theme}" theme has no story map: its config names no map slots (lib/theme-config.js). The detective is parked (R1).`);
  }
  const retired = RETIRED_OUTLINE_KEYS.filter((key) => body[key] !== undefined);
  if (retired.length > 0 || !MAP_ACTIONS.includes(body.outline)) {
    const named = retired.length > 0 ? ` (${retired.join(', ')} ${retired.length > 1 ? 'are' : 'is'} the old outline's)` : ` (got outline: ${JSON.stringify(body.outline)})`;
    return refuse(`The map takes {outline: "approve" | "send-back", map, note}${named}.`);
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== 'string') return refuse("The map's note must be text.");
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (body.outline === 'send-back' && !note) return refuse('A send-back carries a note: what the writer should change.');
  if (body.outline === 'approve' && (body.map === undefined || body.map === null)) return refuse('An approve carries the map as the director left it.');
  const shown = currentState.outline || null;
  const left = body.map === undefined || body.map === null ? shown : body.map;
  const problems = directorMapProblems(left, { theme, shown });
  if (problems) return refuse(problems);

  const baseline = isMap(currentState._mapBaseline) ? currentState._mapBaseline : shown;
  const stateUpdates = {
    outline: left,
    _outlineHandEdits: standingOnMap(currentState._outlineHandEdits, baseline, left, { names }),
    heroImage: topPhotoOf(left)
  };
  if (body.outline === 'approve') {
    return { resume: { approved: true }, stateUpdates, note: note ? { text: note, kind: 'approval' } : null, error: null };
  }
  Object.assign(stateUpdates, { _outlineFeedback: note, _outlineHandEditReport: null, _outlineTrace: null });
  return { resume: { approved: false, feedback: note }, stateUpdates, note: { text: note, kind: 'rejection' }, error: null };
}

/**
 * A map check still failing on the map in hand: the checks' last result survives the
 * rollback to the map (R9), so its failures show only when its mapKey names the map the
 * stop shows.
 *
 * @param {Object} state
 * @returns {Array<{type: string, message: string}>}
 */
function mapCheckFailures(state) {
  const check = state && state._mapCheck;
  if (!check || check.passed !== false || !isMapValue(state.outline) || check.mapKey !== mapKey(state.outline)) return [];
  return Array.isArray(check.failures) ? check.failures : [];
}

/**
 * The concerns about the director's own changes on the map (R11): the map checks' on the map
 * in hand, as mapCheckFailures reads them, each with the edits it is about and their places,
 * so the stop shows it beside the line. A concern about an edit the map no longer carries is
 * not shown.
 *
 * @param {Object} state
 * @returns {Array<{text: string, editIds: string[], places: Array<{id: string, path: string, where: string}>}>}
 */
function mapConcerns(state) {
  if (!state || !isMapValue(state.outline)) return [];
  const check = state._mapCheck;
  const edits = new Map(carriedEdits(state._outlineHandEdits, state.outline).map((edit) => [edit.id, edit]));
  return (check && check.mapKey === mapKey(state.outline) && Array.isArray(check.concerns) ? check.concerns : [])
    .filter((text) => typeof text === 'string')
    .map((text) => {
      const editIds = concernEditIds(text).filter((id) => edits.has(id));
      return { text, editIds, places: editIds.map((id) => ({ id, path: edits.get(id).path, where: editWhere(edits.get(id)) })) };
    })
    .filter((concern) => concern.editIds.length > 0);
}

/** The ids of the director's changes at the story meeting that the weave carries. */
function meetingEditIdsOf(state) {
  const weave = state && state.weave;
  return carriedEdits(state && state._weaveHandEdits, weave).map((edit) => edit.id);
}

/** Did the director leave a note when approving the story meeting (an approval note at arc-selection)? */
function meetingNoteOf(state) {
  return (state && Array.isArray(state.directorGateNotes) ? state.directorGateNotes : [])
    .some((note) => note && note.gate === MEETING_GATE && note.kind === 'approval' && textOf(note.text));
}

/** The story the director settled at the meeting, as the map's stop prints it: the story and its question. */
function settledStoryOf(weave) {
  if (!weave || typeof weave !== 'object') return null;
  return { story: textOf(weave.story), question: textOf(weave.question) };
}

/**
 * The payload the map's stop sends (brief 4.6; server.js getCheckpointData adds the trace):
 * the map; the theme's slots, for the screen; the settled story, which the map cannot
 * change; Everyone and the counts (mapTally); a check still failing on the map in hand; the
 * concerns beside their lines; the edits a send-back changed (the report); the standing
 * notes; the round's note and its counters.
 *
 * @param {Object} state
 * @param {Object} options
 * @param {string[]} options.keptPhotos - the photos kept for the article
 * @param {number} options.maxRevisions - the automated budget of a round
 * @returns {Object}
 */
function mapCheckpointData(state, { keptPhotos = [], maxRevisions } = {}) {
  const s = state || {};
  return {
    outline: s.outline || null,
    mapSlots: mapSlotsOf(s.theme || 'journalist'),
    settledStory: settledStoryOf(s.weave),
    tally: mapTally(s.outline, { roster: mapRosterOf(s.sessionConfig, s.canonicalCharacters), keptPhotos }),
    checkFailures: mapCheckFailures(s),
    concerns: mapConcerns(s),
    handEditReport: handEditReportOf(s._outlineHandEditReport),
    directorGateNotes: s.directorGateNotes || [],
    previousFeedback: s._outlineFeedback || null,
    revisionCount: s.outlineRevisionCount || 0,
    humanRevisionCount: s.humanOutlineRevisionCount || 0,
    maxRevisions
  };
}

module.exports = {
  MAP_BEAT_KINDS,
  MAP_CARDS,
  MAP_CHECKS_SOURCE,
  MEETING_NOTE_SOURCE,
  MAP_ACTIONS,
  mapKey,
  mapRosterOf,
  mapFindings,
  mapSchemaFor,
  directorMapSchemaFor,
  directorMapProblems,
  topPhotoOf,
  mapResume,
  mapCheckFailures,
  mapConcerns,
  meetingEditIdsOf,
  meetingNoteOf,
  mapCheckpointData
};
