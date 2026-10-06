/**
 * The story map (phase 4, brief 4.6; spec docs/superpowers/specs/2026-10-02-story-meeting-and-map.md
 * sections 5.1 to 5.4; CONTEXT.md "Story map"): the settled weave laid across the
 * article's sections. Since phase 4b (piece 1, brief 1D; spec
 * docs/superpowers/specs/2026-10-05-story-level-and-evidence.md sections 4.2, 5 and 6) the map
 * stays at the level of the story, a page of at most MAP_WORD_BOUND words that aims for
 * MAP_WORD_AIM, and the evidence behind each move travels underneath it. The map writer lays it
 * out, the director edits it at the map's stop, and the article writer writes the prose from it.
 *
 * A map holds:
 * - `headline` and `deck`, within the content bundle's limits;
 * - `topPhoto`: the photo the article prints at its top, its hero;
 * - `gapNote`, only when the record cannot carry part of the story, a player cannot be
 *   placed or a link the weave lacks was seen: `{line, players}`;
 * - `sections`, in order: `{slot, heading, job, beats, photos}`, each slot one of the
 *   theme's (lib/theme-config.js mapSlotsOf);
 * - each beat `{id, move, players, threads, connection?, card?, kind?, evidence}` (R1): its move
 *   in a few plain words, the roster players it shows, the ids of the settled weave's threads it
 *   carries, the id of the weave's connection that lands in it, its card marker, its kind
 *   (MAP_BEAT_KINDS, a hint to the article writer the page never prints) and its evidence, the
 *   pieces of the record that tell it (lib/evidence.js). On a beat marked as a card, one piece
 *   is flagged as the card's document (R4; console/outline-edit-logic.js beatCardOf);
 * - each photo `{filename, beat?}`, beside the beat it belongs with, or by itself in the
 *   section where its people appear;
 * - `dropped`: `{slot, reason}` for each slot the story does not use;
 * - `leftOut`: the beats considered and not used, in the beat's shape;
 * - `expectedLength`: the writer's estimate of the article's length, in words;
 * - `weaveChanges`: `{source, change}` for each change the map made to the weave to fit
 *   in one the director made at the meeting, its source a meeting change's id in the
 *   meeting's own form, as the settled weave marks it (M3; brief 4.14a), or "note".
 *
 * This module holds the rules every reader of a map shares, each one function:
 * - THE SCHEMAS: the writer's (mapSchemaFor, the map's shape with the theme's slots) and the
 *   director-side one derived from it (directorMapSchemaFor, R12), which allows a beat the
 *   director added or brought back and is never sent to the SDK;
 * - THE CHECKS (mapFindings), the map's version stamp (mapKey) and the roster they read, and
 *   the director's share of the map (mapDirectorsShare), which the checks never fail and the
 *   page's count leaves out (mapWritersShareOf);
 * - THE STOP: its payloads (mapResume, which server.js buildResumePayload calls) and what it
 *   shows (mapCheckpointData).
 * Everyone and the counts are console/outline-edit-logic.js's mapTally, which the checks and
 * the console share, with its rule for a beat's id (beatIdOf, which the checks read every beat
 * by; fix round 2), for a beat's card (beatCardOf) and for a repeat
 * (mapRepeats, which the gate and the checks read through repeatedBeatIds and
 * repeatedPhotos; task 4.6c). What is a map is its rule too (isMapValue), and the map the
 * stop showed is read by one helper on it (shownMapOf), which the gate and the console's
 * validator both call (tasks 4.6d and 4.6e). A photo is
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
const { roundNoteOf, roundDidNotRunAt } = require('./workflow/state');
const { CHECKPOINT_TYPES } = require('./workflow/checkpoint-helpers');
const {
  mapTally, mapPhotoPlacements, mapRepeats, rosterMemberOf, beatIdOf, beatCardOf, cardPiecesOf, beatWithId, isMapValue, shownMapOf,
  freeStruckBeatPhotos, dropEmptiedSections, leftOutTopPhoto, EMPTIED_SECTION_REASON
} = require('../console/outline-edit-logic');
const { photoKey, photoDescriptionFor } = require('./prompt-renderers/director-words-renderer');
const {
  mapEditAddress, isCut, isStrike, isMap, standingOnMap, carriedEdits, concernEditIds, editWhere,
  handEditReportOf, MAP_NONE, MAP_LEFT_OUT, MAP_SCOPE, MAP_TOP_PHOTO
} = require('./hand-edit-diff');
// Brief 4.14a: a meeting change by its id in the meeting's own form, and by its place as the
// meeting names the line.
const { meetingChangeId } = require('./prompt-renderers/settled-weave');
const { meetingChangePlace } = require('./meeting');
// Phase 4b (brief 1D; R10): the evidence check, the story-terms check and a piece's shape, which
// the weave and the map share.
const {
  EVIDENCE_PIECE_SCHEMA, evidenceProblems, describeEvidenceProblems, evidenceProblemsSaid, storyTermsProblems,
  describeStoryTerms, storyTermsSaid, STORY_TERMS_FIX, recordDocumentOf
} = require('./evidence');
const { normalizeForGrounding } = require('./grounding');
const { wordCount, pageLengthOf } = require('./word-count');

/** A beat's kind: what its move puts on the page, kept underneath as a hint to the article writer and never printed (R1). */
const MAP_BEAT_KINDS = Object.freeze(['scene', 'receipt', 'line', 'figure']);

/** How many inline cards the article carries (C9), which the map's cards are held to. */
const MAP_CARDS = Object.freeze({ min: 3, max: 5 });

/**
 * The bound on the map's page, as it prints when it first opens (spec 2026-10-05 sections 4.2 and
 * 6.1; R5). The rule is lib/word-count.js pageLengthOf's, which the meeting keeps too: the map
 * writer is held only to its own words, and may use max(MAP_WORD_AIM, MAP_WORD_BOUND - overhead)
 * of them (mapLengthOf). The map's overhead is its settled story with its question and hint, the
 * director's photo descriptions, the counts and every label code prints; the check node counts it
 * with every text field the writer writes left blank (mapWritersTextBlank;
 * lib/workflow/nodes/map-nodes.js mapPageWords), on the writer's share of the map
 * (mapWritersShareOf).
 */
const MAP_WORD_BOUND = 450;

/** The words of its own the map writer aims for, and may always use: the floor of pageLengthOf's rule (spec 4.2). Its task asks for them. */
const MAP_WORD_AIM = 300;

/**
 * Why a line that fails the story-terms check is wrong, said to the director after what it holds
 * (lib/evidence.js storyTermsSaid): the map's lines tell the story, and the record's details
 * travel under them.
 */
const MAP_STORY_TERMS_LINE = "The map tells the story in plain words; the record's quotations, times, figures and documents go in the evidence underneath.";

/** The `source` the map checks stamp on validationResults (node-helpers.js CODE_CHECKS). */
const MAP_CHECKS_SOURCE = 'map-checks';

/** The source a change to the weave names when the director's approval note at the meeting asked for it. */
const MEETING_NOTE_SOURCE = 'note';

/** The story meeting's stop type (R3), the gate its notes carry. */
const MEETING_GATE = 'arc-selection';

/**
 * Where a map prompt holds the note meetingNoteOf finds, the director's approval note at the
 * story meeting: <DIRECTOR_GUIDANCE> marks each standing note with its stop and its kind, as
 * "[arc-selection, approval 1]" (prompt-builder.js formatGateNotes). The map writer's task
 * (prompt-builder.js MAP_TASK_NOTE_CHANGE) and the schema's line for a change's source
 * (mapSchemaFor) both point at the note with this one text (brief 4.6e).
 */
const MEETING_NOTE_POINTER = `the approval note marked ${MEETING_GATE} in <DIRECTOR_GUIDANCE>`;

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

/** The text items of a list, trimmed, or none. */
function stringsOf(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()) : [];
}

/** Does `object` hold `key` as its own property? */
function has(object, key) {
  return Boolean(object) && Object.prototype.hasOwnProperty.call(object, key);
}

/** A phrase with its first letter up, to open a line. */
function opening(text) {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

/**
 * Where a beat sits on the map, as the map's page reads a place (console/checkpoint-view-logic.js
 * mapLineKeyOf; lib/hand-edit-diff.js writes the same paths): `sections[#lede].beats[#b2]`, or
 * `leftOut[#b9]` for a beat in left out; null for a beat with no id.
 */
function beatPlace(slot, beat) {
  const id = beatIdOf(beat);
  if (!id) return null;
  return slot === null ? `${MAP_LEFT_OUT}[#${id}]` : `sections[#${slot}].beats[#${id}]`;
}

/** A photo's place on the map, as the page reads it: `topPhoto`, or `sections[#lede].photos[#a.jpg]`. */
function photoPlace(map, filename) {
  const key = photoKey(filename);
  const at = mapPhotoPlacements(map).find((placement) => photoKey(placement.filename) === key);
  if (!at) return null;
  return at.at === MAP_TOP_PHOTO ? MAP_TOP_PHOTO : `sections[#${at.at}].photos[#${at.filename}]`;
}

/** A beat's move as a director's line names it: `the move "..."`, or `a move` when it has none. */
function moveWords(beat) {
  const move = textOf(beat && beat.move);
  return move ? `the move "${move}"` : 'a move';
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

/** The beats in the map's sections, each with the slot it sits in; a left-out beat is not among them. */
function sectionBeats(map) {
  return objectsOf(map.sections).flatMap((section) => objectsOf(section.beats).map((beat) => ({ beat, slot: textOf(section.slot) })));
}

/** Every beat on the map, the sections' then left out's, each with its slot (null in left out). */
function allBeats(map) {
  return [...sectionBeats(map), ...objectsOf(map.leftOut).map((beat) => ({ beat, slot: null }))];
}

/**
 * The director's share of the map, read from their standing edits on it (R11; phase 4b, brief
 * 1D), as the weave's is (lib/hand-edit-diff.js weaveDirectorsShare): each a map from what the
 * director changed to the id of their edit.
 * - `addedBeats`: a beat they added, by its id;
 * - `broughtBackBeats`: a beat they brought back from left out into a section, by its id (fix
 *   round 4): its text is the writer's, so the checks read it as the writer's, and the page's count
 *   leaves it out, as the meeting's leaves out a thread the director re-roled;
 * - `beatFields`: a field of a beat they rewrote (`b3.move`, `b3.players`);
 * - `sections`: a section they added whole, by its slot; `sectionFields`: a section's field they
 *   rewrote (`lede.job`);
 * - `fields`: a field of the map they rewrote (`headline`, `deck`, `gapNote` whole, `gapNote.line`,
 *   `weaveChanges`).
 * A beat or a photo they moved or struck carries the writer's text, so it is no share of theirs
 * but for the count, and the evidence is never theirs (R6). The checks never fail the director's share (a beat
 * they added is never failed for having no threads or no evidence; a line they wrote is not held
 * to story terms), and the page's count leaves it out (mapWritersShareOf).
 *
 * @param {Object[]} edits - the director's standing edits the map carries
 * @returns {{addedBeats: Object, broughtBackBeats: Object, beatFields: Object, sections: Object, sectionFields: Object, fields: Object}}
 */
function mapDirectorsShare(edits) {
  const share = { addedBeats: {}, broughtBackBeats: {}, beatFields: {}, sections: {}, sectionFields: {}, fields: {} };
  (Array.isArray(edits) ? edits : []).filter((edit) => edit && edit.scope === MAP_SCOPE && !isCut(edit)).forEach((edit) => {
    const address = mapEditAddress(edit);
    if (address) {
      if (address.kind !== 'beat') return;
      const id = String(address.identity.id).trim();
      if (address.fieldSteps.length === 0) {
        if (edit.from === MAP_NONE) share.addedBeats[id] = edit.id;
        else if (edit.from === MAP_LEFT_OUT && address.container !== MAP_LEFT_OUT) share.broughtBackBeats[id] = edit.id;
        return;
      }
      const field = address.fieldSteps[0] && address.fieldSteps[0].key;
      if (field) share.beatFields[`${id}.${field}`] = edit.id;
      return;
    }
    const steps = Array.isArray(edit.at) ? edit.at : [];
    const head = steps[0] && 'key' in steps[0] ? steps[0].key : null;
    if (head === 'sections' && steps[1] && steps[1].match && steps[1].match.slot !== undefined) {
      const slot = String(steps[1].match.slot).trim();
      if (steps.length === 2) share.sections[slot] = edit.id;
      else if (steps[2] && 'key' in steps[2]) share.sectionFields[`${slot}.${steps[2].key}`] = edit.id;
      return;
    }
    if (head) share.fields[`${head}${steps[1] && 'key' in steps[1] ? `.${steps[1].key}` : ''}`] = edit.id;
  });
  return share;
}

/**
 * The map as the writer's share of it (Review focus 3; R5), for the page the check node counts:
 * only the writer's output is held to MAP_WORD_BOUND, never the director's version. Read from
 * the director's share (mapDirectorsShare), it has each line the director rewrote empty (the
 * headline, the deck, the gap note's line, a section's heading or job, a beat's move), each list
 * they rewrote empty (a beat's players or threads, the changes to the weave), and no beat, section
 * or gap note they added and no beat they brought back from left out (fix round 4). The map given
 * is left as it was.
 *
 * @param {*} map
 * @param {Object} share - mapDirectorsShare's
 * @returns {*}
 */
function mapWritersShareOf(map, share) {
  if (!isMapValue(map)) return map;
  const s = share && typeof share === 'object' ? share : {};
  const out = JSON.parse(JSON.stringify(map));
  /** A field the director rewrote, written as the writer's share holds it: text empty, a list empty. */
  const emptied = (element, field) => {
    if (typeof element[field] === 'string') element[field] = '';
    else if (Array.isArray(element[field])) element[field] = [];
  };
  ['headline', 'deck', 'weaveChanges'].forEach((field) => { if (has(s.fields, field)) emptied(out, field); });
  if (out.gapNote && typeof out.gapNote === 'object') {
    if (has(s.fields, 'gapNote')) delete out.gapNote;
    else ['line', 'players'].forEach((field) => { if (has(s.fields, `gapNote.${field}`)) emptied(out.gapNote, field); });
  }
  const writersBeats = (beats) => (Array.isArray(beats) ? beats : [])
    .filter((beat) => !has(s.addedBeats, beatIdOf(beat)) && !has(s.broughtBackBeats, beatIdOf(beat)))
    .map((beat) => {
      if (!beat || typeof beat !== 'object') return beat;
      const id = beatIdOf(beat);
      Object.keys(s.beatFields || {}).filter((place) => id && place.startsWith(`${id}.`)).forEach((place) => emptied(beat, place.slice(id.length + 1)));
      return beat;
    });
  out.sections = out.sections
    .filter((section) => !(section && typeof section === 'object' && has(s.sections, textOf(section.slot))))
    .map((section) => {
      if (!section || typeof section !== 'object') return section;
      const slot = textOf(section.slot);
      ['heading', 'job'].forEach((field) => { if (has(s.sectionFields, `${slot}.${field}`)) emptied(section, field); });
      return { ...section, beats: writersBeats(section.beats) };
    });
  if (Array.isArray(out.leftOut)) out.leftOut = writersBeats(out.leftOut);
  return out;
}

/**
 * The map with every text field the writer writes left blank (pageLengthOf's rule), for the
 * page the check node counts the overhead on: the headline, the deck, the gap note's line, each
 * section's heading and job, each beat's move and players in the sections and in left out, each
 * change to the weave, and each dropped section's reason, but for the line the gate writes for a
 * section the director emptied (EMPTIED_SECTION_REASON), which is theirs. Everything else stays
 * as it was, the card markers and the evidence among it. The map given is left as it was.
 *
 * @param {*} map
 * @returns {*}
 */
function mapWritersTextBlank(map) {
  if (!isMapValue(map)) return map;
  const out = JSON.parse(JSON.stringify(map));
  const blank = (element, field) => {
    if (!element || typeof element !== 'object' || !has(element, field)) return;
    element[field] = Array.isArray(element[field]) ? [] : '';
  };
  ['headline', 'deck'].forEach((field) => blank(out, field));
  blank(out.gapNote, 'line');
  const beats = (list) => objectsOf(list).forEach((beat) => { blank(beat, 'move'); blank(beat, 'players'); });
  objectsOf(out.sections).forEach((section) => {
    blank(section, 'heading');
    blank(section, 'job');
    beats(section.beats);
  });
  beats(out.leftOut);
  objectsOf(out.weaveChanges).forEach((change) => blank(change, 'change'));
  objectsOf(out.dropped).filter((entry) => entry.reason !== EMPTIED_SECTION_REASON).forEach((entry) => blank(entry, 'reason'));
  return out;
}

/**
 * The map's length as the check reads it, by pageLengthOf's rule with the map's bound and floor:
 * the page's words, the writer's own words on it (the page's less its overhead) and the words of
 * its own the writer may use.
 *
 * @param {number} pageWords - the map's page as it first opens, counted
 * @param {number} overheadWords - the words on that page the writer did not write
 * @returns {{page: number, writer: number, allowance: number}}
 */
function mapLengthOf(pageWords, overheadWords) {
  return pageLengthOf(pageWords, overheadWords, { bound: MAP_WORD_BOUND, floor: MAP_WORD_AIM });
}

/**
 * The writer's lines on the map's page as it first opens, each with its words, the longest first:
 * each beat in a section (its move and its people), each section's job, the gap note's line, each
 * change to the weave and each dropped section's reason. The lines the director wrote
 * (mapDirectorsShare) are left out, and so are the headline, the deck and the section headings,
 * the article's own printed lines. The over-length check names the longest to the rework.
 *
 * @param {Object} map
 * @param {Object} share - mapDirectorsShare's
 * @returns {Array<{name: string, words: number}>}
 */
function writersLinesInPrint(map, share) {
  const lines = [];
  const add = (name, ...texts) => {
    const words = texts.reduce((sum, text) => sum + wordCount(text), 0);
    if (words > 0) lines.push({ name, words });
  };
  if (map.gapNote && typeof map.gapNote === 'object' && !has(share.fields, 'gapNote') && !has(share.fields, 'gapNote.line')) {
    add("gapNote's line", textOf(map.gapNote.line));
  }
  objectsOf(map.sections).forEach((section) => {
    const slot = textOf(section.slot);
    if (has(share.sections, slot)) return;
    if (!has(share.sectionFields, `${slot}.job`)) add(`the job of section ${slot}`, textOf(section.job));
    objectsOf(section.beats).forEach((beat) => {
      const id = beatIdOf(beat);
      if (has(share.addedBeats, id) || has(share.broughtBackBeats, id)) return;
      add(`beat ${id}'s move and people`,
        has(share.beatFields, `${id}.move`) ? '' : textOf(beat.move),
        has(share.beatFields, `${id}.players`) ? '' : stringsOf(beat.players).join(', '));
    });
  });
  if (!has(share.fields, 'weaveChanges')) {
    objectsOf(map.weaveChanges).forEach((change) => add(`the change to the weave "${textOf(change.change)}"`, textOf(change.change)));
  }
  objectsOf(map.dropped).filter((entry) => entry.reason !== EMPTIED_SECTION_REASON)
    .forEach((entry) => add(`the reason section ${textOf(entry.slot)} is dropped`, textOf(entry.reason)));
  return lines.sort((a, b) => b.words - a.words);
}

/**
 * The beat ids that more than one beat of a map carries, in the sections and in leftOut,
 * each once, in the order of its first beat: the repeats console/outline-edit-logic.js
 * mapRepeats finds, the one rule for a repeat (task 4.6c), which the console's validator and
 * the map on screen read too. An id is read as the map's edits find a beat by it (beatIdOf):
 * its text, trimmed. The checks (duplicate-beat-id) and the gate (directorMapProblems) both
 * read it.
 *
 * @param {*} map
 * @returns {string[]}
 */
function repeatedBeatIds(map) {
  return mapRepeats(map).beatIds;
}

/**
 * Each photo a map places, the top photo and the sections' photos, found by the one join
 * key (photoKey), in the order of its first place, under the name its first place gives it.
 *
 * @param {*} map
 * @returns {Map<string, string>} photoKey -> filename
 */
function placedPhotos(map) {
  const placed = new Map();
  mapPhotoPlacements(map).forEach(({ filename }) => {
    const key = photoKey(filename);
    if (!placed.has(key)) placed.set(key, filename);
  });
  return placed;
}

/**
 * The photos a map places more than once, each once, under the name its first place gives
 * it, in the map's order: the repeats console/outline-edit-logic.js mapRepeats finds, the
 * one rule for a repeat (task 4.6c). The checks (photo-placed-twice) and the gate
 * (directorMapProblems) both read it.
 *
 * @param {*} map
 * @returns {Map<string, string>} photoKey -> filename
 */
function repeatedPhotos(map) {
  const placed = placedPhotos(map);
  return new Map(mapRepeats(map).photoKeys.map((key) => [key, placed.get(key)]));
}

/**
 * The photos a map places that the director has left out of the article (task 4.14b): at the
 * photos stop, or by deleting one at the desk after the map, which joins the leave-out list
 * (lib/photo-leave-out.js). Read by the one rule the article reads the map by (ai-nodes.js
 * isPhotoExcluded, through articleMapOf), so the map's page marks exactly the photos the article
 * leaves out, and its gate refuses one the director's changes put at the top. Each photo once, by
 * its join key, under the name its first place gives it; none for anything that is no map.
 *
 * @param {Object} state - the session: its photo mappings and analyses
 * @param {*} map
 * @returns {string[]} filenames
 */
function mapLeftOutPhotos(state, map) {
  // The one rule, required here rather than at the top: ai-nodes.js requires this module.
  const { isPhotoExcluded } = require('./workflow/nodes/ai-nodes');
  return [...placedPhotos(map).values()].filter((filename) => isPhotoExcluded(state || {}, filename));
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
 * The ids of the director's edits on one beat's card marker that caused a fault in its card
 * (phase 4b, brief 1D; R4, R6; fix round 2): `set`, the marker they set on a beat whose evidence
 * flags no piece as the card's document (an edit of its card to true, or a beat they added with
 * the marker), and `cleared`, the marker they cleared from a beat whose evidence flags one. The
 * evidence is never the director's edit (R6), so a fault in the flags (more than one piece
 * flagged) or in the flagged piece's source (no document in the record) is always the writer's,
 * on any beat, one the director added or brought back from left out included (cardFault's
 * `marker` is null for those).
 *
 * @param {Array<{edit: Object, address: Object|null}>} entries - the edits with what each is about (addressed)
 * @param {string} beatId
 * @param {'set'|'cleared'} way - the marker change that caused the fault
 * @returns {string[]}
 */
function editsOnCardMarker(entries, beatId, way) {
  return entries.filter(({ edit, address }) => {
    if (!address || address.kind !== 'beat' || String(address.identity.id).trim() !== beatId) return false;
    if (address.fieldSteps.length === 0) return way === 'set' && edit.from === MAP_NONE && Boolean(edit.after) && edit.after.card === true;
    if (address.fieldSteps.length !== 1 || address.fieldSteps[0].key !== 'card') return false;
    return way === 'set' ? edit.after === true : edit.before === true && edit.after !== true;
  }).map(({ edit }) => edit.id);
}

/**
 * How the director's edits moved the card count the card check reads (mapTally; briefs
 * 4.6b and 4.6c): one change for each beat their edits touch that is a card beat in a
 * section on one side only, read where it sat, with its card, before their edits and where
 * it sits now. `delta` is +1 for a card beat they added or brought back and a card marker they
 * gave a beat, and -1 for a card beat they struck or cut and a card marker they cleared.
 * `editIds` are the edits that made the change: the edit on the beat's place only when it took
 * the beat into the sections or out of them, and the edit on its card only when it added the
 * marker or cleared it. So a beat moved between sections and given a card is a change of the card
 * edit alone, and one brought back from leftOut and given a card a change of both. A card beat
 * moved between sections moves no count.
 *
 * Phase 4b (brief 1D; R4, R6): a beat's card is its flagged piece, read through beatCardOf on the
 * beat as the map holds it now. The evidence is never the director's, so their edits carry none:
 * the card the beat had before their edits is its flagged piece under the marker it had then,
 * and a beat they cut, whose evidence went with it, was a card beat when it carried the marker.
 *
 * @param {Array<{edit: Object, address: Object|null}>} entries - the edits with what each is about (addressed)
 * @param {*} map - the map the edits are read on
 * @returns {Array<{delta: number, editIds: string[]}>}
 */
function cardCountChanges(entries, map) {
  const beats = new Map();
  entries.forEach(({ edit, address }) => {
    if (!address || address.kind !== 'beat') return;
    const onCard = address.fieldSteps.length === 1 && address.fieldSteps[0].key === 'card';
    if (address.fieldSteps.length > 0 && !onCard) return;
    const id = String(address.identity.id).trim();
    beats.set(id, { ...beats.get(id), [onCard ? 'card' : 'place']: { edit, address } });
  });
  const inSections = (container) => container !== MAP_LEFT_OUT && container !== MAP_NONE;
  const changes = [];
  beats.forEach(({ place, card }, id) => {
    // Whether the beat sat in a section and carried a card before the edits, and does now.
    let wasIn;
    let nowIn;
    let wasCard;
    let nowCard;
    if (place && isCut(place.edit)) {
      // A cut takes the beat off the map whole: its place is what changed.
      wasIn = inSections(place.address.container);
      nowIn = false;
      wasCard = Boolean(place.edit.before && place.edit.before.card === true);
      nowCard = wasCard;
    } else {
      const sits = (place || card).address.container;
      const beat = beatWithId(map, id) || {};
      nowIn = inSections(sits);
      wasIn = inSections(place && place.edit.from ? place.edit.from : sits);
      nowCard = Boolean(beatCardOf(beat));
      wasCard = card ? Boolean(beatCardOf({ ...beat, card: card.edit.before })) : nowCard;
    }
    const was = wasIn && wasCard;
    const now = nowIn && nowCard;
    if (was === now) return;
    const made = [place && wasIn !== nowIn ? place : null, card && wasCard !== nowCard ? card : null];
    changes.push({ delta: now ? 1 : -1, editIds: made.filter(Boolean).map(({ edit }) => edit.id) });
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
 * @param {*} map - the map the count is read on
 * @returns {{editIds: string[], writers: boolean}} the director's edits the count is a
 *   concern on, and whether the writer's part fails
 */
function cardCountOwners(cards, entries, map) {
  const way = cards > MAP_CARDS.max ? 1 : -1;
  const changes = cardCountChanges(entries, map);
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
 * The ids of the director's edits that took a thread off the map's beats (phase 4b, brief 1D;
 * R3): a beat they struck or cut that carried it, or a beat's threads they rewrote without it.
 */
function editsRemovingThread(entries, thread) {
  const carries = (beat) => Boolean(beat) && typeof beat === 'object' && stringsOf(beat.threads).includes(thread);
  return entries.filter(({ edit, address }) => {
    if (!address || address.kind !== 'beat') return false;
    if (address.fieldSteps.length > 0) return address.fieldSteps[0].key === 'threads' && stringsOf(edit.before).includes(thread) && !stringsOf(edit.after).includes(thread);
    if (isCut(edit)) return carries(edit.before);
    return isStrike(edit) && carries(edit.after);
  }).map(({ edit }) => edit.id);
}

/**
 * The settled weave's threads in the story as the checks read them: `{id, name, added,
 * broughtIn}`, each with an id; `added` and `broughtIn` mark the director's (fix round 4).
 */
function storyThreadsOf(threads) {
  return objectsOf(threads)
    .map((thread) => ({ id: textOf(thread.id), name: textOf(thread.name), added: thread.added === true, broughtIn: thread.broughtIn === true }))
    .filter((thread) => thread.id);
}

/** The quotation marks a thread's name is matched without, straight and curly, single and double. */
const NAME_QUOTE_MARKS = '["\'“”‘’‚‛„‟`´]';

/**
 * A thread's name as a pattern, matched loosely (fix round 4): in any case, any spacing and any
 * dash, with every quotation mark in it or around it left out, and as whole words. The gap note
 * names a thread the director put in the story by it (spec 5.3), and the story-terms scan leaves
 * it out. Null for a name with no letter or digit.
 *
 * @param {string} name
 * @param {string} flags - the RegExp's flags beside `iu`, such as `g`
 * @returns {RegExp|null}
 */
function threadNamePattern(name, flags = '') {
  const folded = normalizeForGrounding(name).replace(new RegExp(NAME_QUOTE_MARKS, 'g'), '').trim().toLowerCase();
  if (!/[\p{L}\p{N}]/u.test(folded)) return null;
  const Q = `${NAME_QUOTE_MARKS}*`;
  const body = [...folded].map((char) => {
    if (/\s/.test(char)) return `${Q}\\s+${Q}`;
    if (char === '-') return `[\u2013\u2014-]${Q}`;
    return `${char.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}${Q}`;
  }).join('');
  return new RegExp(`(?<![\\p{L}\\p{N}])${Q}${body}(?![\\p{L}\\p{N}])`, `iu${flags}`);
}

/**
 * A line of the writer's with the names of the director's threads (threadNamePattern) taken out,
 * for the story-terms scan: a name the director wrote is their words (fix round 4), so a figure or
 * a quotation mark in it, or around it, is never the writer's failure.
 *
 * @param {*} text
 * @param {string[]} names - the director's threads' names
 * @returns {*} the text with each name taken out, or the value given when it holds no text
 */
function withoutNames(text, names) {
  if (typeof text !== 'string') return text;
  return names.reduce((line, name) => {
    const pattern = threadNamePattern(name, 'g');
    return pattern ? line.replace(pattern, ' ') : line;
  }, text);
}

/** The connections the story keeps as the checks read them: `{id, line}`, each given as one or by its id alone. */
function storyConnectionsOf(connections) {
  return (Array.isArray(connections) ? connections : [])
    .map((connection) => (typeof connection === 'string' ? { id: textOf(connection), line: '' } : { id: textOf(connection && connection.id), line: textOf(connection && connection.line) }))
    .filter((connection) => connection.id);
}

/**
 * What is wrong with a beat's card, or null (phase 4b, brief 1D; R4; spec 6.1: a move marked
 * as a card flags one piece, whose source is a document in the record): `{message, said,
 * marker}`, the rework's fix, the director's words and the change of the card marker that made
 * the fault (`set` for a marker on a beat that flags no piece, `cleared` for a flagged piece on a
 * beat with no marker; null for a fault in the evidence), for a beat in a section that the map
 * marks as a card or whose evidence flags a piece as one. Only a marker change can be the
 * director's (editsOnCardMarker).
 */
function cardFault(beat, evidence) {
  const id = beatIdOf(beat);
  const flagged = cardPiecesOf(beat);
  const marked = beat.card === true;
  if (!marked && flagged.length === 0) return null;
  const C9 = 'as C9 (`<craft-cards>`) sets out';
  if (!marked) {
    return {
      message: `Beat ${id} flags a piece as a card's document and is not marked as a card. Mark the beat "card": true when its evidence prints as a card, or take the flag off the piece, ${C9}.`,
      said: "flags a piece of its evidence as a card's document, and is not marked as a card",
      marker: 'cleared'
    };
  }
  if (flagged.length === 0) {
    return {
      message: `Beat ${id} is marked as a card and flags no piece as the card's document. Flag the one piece whose document prints as the card with "card": true, ${C9}.`,
      said: "is marked as a card, and no piece of its evidence is the card's document",
      marker: 'set'
    };
  }
  if (flagged.length > 1) {
    return {
      message: `Beat ${id} flags ${flagged.length} pieces as the card's document. Flag one: the piece whose document prints as the card, ${C9}.`,
      said: "is marked as a card, and its evidence names more than one card's document",
      marker: null
    };
  }
  const card = beatCardOf(beat);
  if (card && recordDocumentOf(card, evidence)) return null;
  const sources = stringsOf(flagged[0].sources).map((source) => `"${source}"`);
  return {
    message: `Beat ${id}'s card piece names ${sources.length > 0 ? listOf(sources) : 'no source'}, which is no document in <RECORD>. A card prints a document from <RECORD>, never the ledger, the evidence log or the notes: choose in <RECORD> the document the card prints, and flag the piece that names it by its id.`,
    said: "is marked as a card, and its card's document is not one the record holds",
    marker: null
  };
}

/**
 * The map's code checks (spec 2026-10-02 section 5.4; spec 2026-10-05 sections 4.2 and 6.1),
 * on the writer's text alone (R11), in the order the stop prints the map.
 *
 * Each failure is `{type, message, line, place?}`, the convention the weave's checks set out
 * (lib/weave.js weaveFindings):
 * - `message` is the rework's: the defect and its fix, in the writer's terms (a beat by its id, a
 *   piece by its number, a source by its id, the rule item it breaks). The rework reads it,
 *   through validationResults.
 * - `line` is the director's (spec 6.3): what is wrong at that place in plain words, a move by
 *   its words, never a beat's, a thread's or a connection's id, a piece's number or a rule item.
 *   The map shows it when the check still fails after the rework
 *   (console/checkpoint-view-logic.js mapView).
 * - `place` is where the map shows it, beside the line it names: a beat's path
 *   (`sections[#lede].beats[#b2]`, `leftOut[#b9]`), a section's (`sections[#lede]`), a photo's
 *   (`sections[#lede].photos[#a.jpg]`, `topPhoto`), or a field of the map (`gapNote`,
 *   `weaveChanges`). A failure about what the map lacks (a player, a photo placed nowhere, a
 *   thread, a connection, the card count, the length) has no place and sits at the top.
 *
 * The checks:
 * - every beat has an id of its own, since the director's edits find a beat by its id
 *   (`duplicate-beat-id`);
 * - each of the writer's lines is in story terms (`story-terms`; lib/evidence.js
 *   storyTermsProblems: no document id the record holds, quotation, clock time or money
 *   figure): the gap note's line, each section's job, each beat's move in a section or in left
 *   out, and each change to the weave. The headline, the deck and the section headings are
 *   exempt (R2): the article prints them. The names of the director's threads in the gap note
 *   and the weave changes are their words, and the scan leaves them out (withoutNames; fix
 *   round 4);
 * - each of the writer's beats in a section carries a thread of the settled weave
 *   (`beat-without-threads`) and has evidence (`beat-without-evidence`), and every piece of every
 *   beat passes the evidence check (`evidence-not-in-record`; lib/evidence.js evidenceProblems:
 *   each source a document in the record or the ledger, the evidence log or the notes, never a
 *   buried memory, and each quotation word for word in its source);
 * - every roster player appears in a section's beat, or is among the gap note's players
 *   (`player-not-placed`; C7);
 * - every kept photo is placed once: as the top photo or among a section's photos
 *   (`photo-not-placed`, `photo-placed-twice`), and no photo outside the kept set is placed
 *   (`photo-not-offered`; T13);
 * - each beat in a section marked as a card flags one piece, whose source is a document in the
 *   record, and no unmarked beat flags one (`card-not-in-record`; R4, cardFault), and the cards
 *   number three to five (`card-count`; C9). A beat's card is its flagged piece, read through
 *   beatCardOf by every reader;
 * - every thread in the settled weave's story lands in a section's beat that names it among its
 *   threads (`thread-not-landed`; R3). A thread the director added at the meeting, or brought
 *   into the story from left out, may instead be named in the gap note's line, when the record
 *   cannot carry it (spec 5.3), by its name matched loosely (threadNamePattern; fix round 4);
 * - every connection the settled weave keeps lands in a section's beat
 *   (`connection-not-landed`);
 * - each change to the weave names a meeting change's id, in the meeting's own form (M3;
 *   brief 4.14a), or the meeting's approval note (`weave-change-source`), and there is none
 *   when the director changed nothing and left no approval note at the meeting
 *   (`weave-change-unasked`; brief 4.6e);
 * - the writer's own words on the map's page as it first opens stay within the words it may use
 *   (`over-length`; R5; pageLengthOf's rule): the check node counts the page of the writer's
 *   share (mapWritersShareOf) with lib/stop-pages.js wordsShown, and its overhead, and passes
 *   their length (mapLengthOf), which this module does not count.
 *
 * The director's share of the map is never a check's failure (mapDirectorsShare): a line they
 * wrote is not held to story terms, and a beat they added is never failed for having no threads
 * or no evidence, which the article writer finds (spec 5.3). The evidence is never theirs (R6),
 * so every piece is the writer's to answer for, under the director's beat too. A failure the
 * director caused is a concern on their edit, beside its line, never a rework: a beat they
 * struck or cut that held the only place of a player, a thread or a connection; a card fault the
 * card marker they set or cleared made (editsOnCardMarker: a fault in the evidence under a card is
 * the writer's, on any beat); a photo they placed; the card count, when their edits, together,
 * moved it the way it fails
 * (cardCountOwners; brief 4.6b); a beat they added under an id the map holds. A failure partly
 * theirs splits: the writer's part fails, the director's is a concern. A card count is partly
 * theirs when the count without their edits fails the same way.
 *
 * @param {*} map
 * @param {Object} inputs
 * @param {Array} inputs.roster - mapRosterOf's roster
 * @param {string[]} inputs.keptPhotos - the filenames of the photos kept for the article
 * @param {Array<{id: string, name: string, added: boolean, broughtIn: boolean}>} [inputs.threads] - the
 *   settled weave's threads in the story (every role but left out), `added` on one the director
 *   added at the meeting and `broughtIn` on one they brought into the story from left out
 * @param {Array<{id: string, line: string}|string>} inputs.connections - the connections the settled
 *   weave keeps (lib/weave.js storyConnections: none struck, and none that joins a left-out
 *   thread), each `{id, line}` or its id alone
 * @param {string[]} inputs.meetingEdits - the ids of the director's changes at the meeting, in
 *   the meeting's own form (meetingEditIdsOf)
 * @param {boolean} inputs.meetingNote - whether the director left an approval note at the meeting (meetingNoteOf)
 * @param {Object[]} [inputs.edits] - the director's standing edits the map carries
 * @param {Object} [inputs.photoDescriptions] - the director's description of each photo, `{filename: text}`,
 *   by which the director's words name a photo (a failure's `line`, a concern's finding)
 * @param {Object} [inputs.evidence] - what the evidence, story-terms and card checks read
 *   (lib/evidence.js evidenceContextOf); none, no evidence check, and no card's document is in the
 *   record (fix round 4: a card's document is one recordDocumentOf finds, a document with text,
 *   by any id in any case)
 * @param {{page: number, writer: number, allowance: number}|null} [inputs.length] - the map's page
 *   as it first opens, counted (mapLengthOf); none, no length check
 * @returns {{failures: Array<{type: string, message: string, line: string, place?: string}>,
 *            concerns: Array<{type: string, editIds: string[], finding: string}>}}
 */
function mapFindings(map, inputs = {}) {
  if (!isMapValue(map)) {
    return {
      failures: [{ type: 'no-map', message: 'The output holds no sections. Write the whole map in the shape <SCHEMA> gives.', line: 'The writer returned no map.' }],
      concerns: []
    };
  }
  const roster = Array.isArray(inputs.roster) ? inputs.roster : [];
  const kept = Array.isArray(inputs.keptPhotos) ? inputs.keptPhotos.filter((f) => typeof f === 'string' && f.trim()) : [];
  const edits = (Array.isArray(inputs.edits) ? inputs.edits : []).filter((edit) => edit && edit.scope === MAP_SCOPE);
  const entries = addressed(edits);
  const share = mapDirectorsShare(edits);
  const evidence = inputs.evidence || null;
  const failures = [];
  const concerns = [];
  const fail = (type, message, line, place) => failures.push(place ? { type, message, line, place } : { type, message, line });
  const concern = (type, editIds, finding) => concerns.push({ type, editIds: [...new Set(editIds)], finding });

  // Every beat has an id of its own (the edits find a beat by its id).
  const repeated = repeatedBeatIds(map);
  if (repeated.length > 0) {
    const added = entries.filter(({ edit, address }) => address && address.kind === 'beat' && address.fieldSteps.length === 0
      && edit.from === MAP_NONE && repeated.includes(String(address.identity.id).trim()));
    const theirs = added.map(({ address }) => String(address.identity.id).trim());
    if (added.length > 0) concern('duplicate-beat-id', added.map(({ edit }) => edit.id), 'The move you added shares its id with another move.');
    repeated.filter((id) => !theirs.includes(id)).forEach((id) => {
      const under = allBeats(map).filter(({ beat }) => beatIdOf(beat) === id);
      fail('duplicate-beat-id', `Beats sharing the id ${id}: ${listOf(under.map(({ beat }) => `"${textOf(beat.move)}"`))}. Give each beat, in the sections and in leftOut, an id of its own.`,
        `The writer gave the moves ${listOf(under.map(({ beat }) => `"${textOf(beat.move)}"`))} one id, so the map cannot move or edit them.`, beatPlace(under[0].slot, under[0].beat));
    });
  }

  // Each of the writer's lines is in story terms (R8): the headline, the deck and the section
  // headings are exempt, since the article prints them (R2).
  const terms = (writersWords, directorsWords, text, place) => {
    const problems = storyTermsProblems(text, evidence);
    if (problems.length === 0) return;
    fail('story-terms', `${opening(writersWords)} ${describeStoryTerms(problems)}. ${STORY_TERMS_FIX}`,
      `${opening(directorsWords)} ${storyTermsSaid(problems)}. ${MAP_STORY_TERMS_LINE}`, place);
  };
  // Fix round 4: the gap note and the weave changes name the director's threads in the director's
  // words, which the scan leaves out (withoutNames).
  const directorsNames = storyThreadsOf(inputs.threads).filter((thread) => (thread.added || thread.broughtIn) && thread.name).map((thread) => thread.name);
  if (map.gapNote && typeof map.gapNote === 'object' && !has(share.fields, 'gapNote') && !has(share.fields, 'gapNote.line')) {
    terms('the line in gapNote', 'the gap note', withoutNames(map.gapNote.line, directorsNames), 'gapNote');
  }
  objectsOf(map.sections).forEach((section) => {
    const slot = textOf(section.slot);
    if (!has(share.sections, slot) && !has(share.sectionFields, `${slot}.job`)) {
      terms(`the job of section ${slot}`, "the section's job", section.job, `sections[#${slot}]`);
    }
  });
  allBeats(map).forEach(({ beat, slot }) => {
    const id = beatIdOf(beat);
    if (has(share.addedBeats, id) || has(share.beatFields, `${id}.move`)) return;
    terms(`beat ${id}'s move`, moveWords(beat), beat.move, beatPlace(slot, beat));
  });
  if (!has(share.fields, 'weaveChanges')) {
    objectsOf(map.weaveChanges).forEach((change) => {
      terms(`the change to the weave "${textOf(change.change)}"`, 'a change the map made to the weave', withoutNames(change.change, directorsNames), 'weaveChanges');
    });
  }

  // Each of the writer's beats in a section carries a thread and has evidence; every piece of
  // every beat passes the evidence check. A beat the director added is theirs: the article
  // writer finds its evidence (spec 5.3), and its pieces, once a writer gives it some, are the
  // writer's (R6).
  sectionBeats(map).forEach(({ beat, slot }) => {
    const id = beatIdOf(beat);
    if (has(share.addedBeats, id)) return;
    const place = beatPlace(slot, beat);
    if (stringsOf(beat.threads).length === 0) {
      fail('beat-without-threads', `Beat ${id} carries no thread. Name in its threads the ids of the settled weave's threads it carries.`,
        `${opening(moveWords(beat))} carries none of the story's threads.`, place);
    }
    if (objectsOf(beat.evidence).length === 0) {
      fail('beat-without-evidence', `Beat ${id} has no evidence. Give it the pieces of the record that tell it: from its threads' evidence in <SETTLED_WEAVE>, and anything else the record gives that moment.`,
        `${opening(moveWords(beat))} has nothing behind it: no piece of the record tells it.`, place);
    }
  });
  if (evidence) {
    allBeats(map).forEach(({ beat, slot }) => {
      const problems = evidenceProblems(beat.evidence, evidence);
      if (problems.length === 0) return;
      const { what, fix } = describeEvidenceProblems(problems);
      fail('evidence-not-in-record', `Beat ${beatIdOf(beat)}: ${what}. ${fix}`,
        `The evidence behind ${moveWords(beat)} ${evidenceProblemsSaid(problems)}.`, beatPlace(slot, beat));
    });
  }

  // Every roster player appears in a beat, or is raised in the gap note (C7).
  const tally = mapTally(map, { roster, keptPhotos: kept });
  const raised = new Set(tally.raised);
  const missing = tally.unplaced.filter((name) => !raised.has(name));
  const writersMissing = [];
  missing.forEach((name) => {
    const ids = editsRemovingPlayer(edits, name, roster);
    if (ids.length > 0) concern('player-not-placed', ids, `${name} is in no move and not in the gap note.`);
    else writersMissing.push(name);
  });
  if (writersMissing.length > 0) {
    fail('player-not-placed', `Players in no beat: ${writersMissing.join(', ')}. Place each in a section's beat, or name them among gapNote's players, as C7 (\`<craft-material>\`) sets out.`,
      `${listOf(writersMissing)} ${writersMissing.length > 1 ? 'are' : 'is'} in no move and not in the gap note.`);
  }

  // Every kept photo is placed once, and only kept photos are placed (T13). The director's words
  // name a photo by their description of it, where they gave one, as the map's page does; the
  // rework's keep the filename (fix round 2).
  const keptKeys = kept.map(photoKey);
  const placed = placedPhotos(map);
  const nameOfKey = (key) => (kept.find((f) => photoKey(f) === key) || placed.get(key));
  const photoSaid = (filename) => {
    const description = photoDescriptionFor(inputs.photoDescriptions, filename);
    return description ? `"${description}"` : filename;
  };
  const writersPhotos = (type, filenames, directorsFinding) => filenames.filter((filename) => {
    const ids = editsOnPhoto(entries, filename);
    if (ids.length > 0) concern(type, ids, directorsFinding(photoSaid(filename)));
    return ids.length === 0;
  });
  const nowhere = writersPhotos('photo-not-placed', kept.filter((filename) => !placed.has(photoKey(filename))), (said) => `The photo ${said} is placed nowhere.`);
  if (nowhere.length > 0) {
    fail('photo-not-placed', `Photos placed nowhere: ${nowhere.join(', ')}. Place each photo once: as topPhoto, or among the photos of the section where it belongs, beside its beat or with its people, as C2 (\`<craft-form>\`) sets out.`,
      `${nowhere.length > 1 ? 'These photos are' : 'This photo is'} placed nowhere: ${listOf(nowhere.map(photoSaid))}.`);
  }
  writersPhotos('photo-placed-twice', [...repeatedPhotos(map).keys()].filter((key) => keptKeys.includes(key)).map(nameOfKey), (said) => `The photo ${said} is placed more than once.`)
    .forEach((filename) => {
      fail('photo-placed-twice', `The photo ${filename} is placed more than once. Place each photo once.`, `The photo ${photoSaid(filename)} is placed more than once.`, photoPlace(map, filename));
    });
  writersPhotos('photo-not-offered', [...placed.keys()].filter((key) => !keptKeys.includes(key)).map(nameOfKey), (said) => `The photo ${said} is not among the photos kept for the article.`)
    .forEach((filename) => {
      fail('photo-not-offered', `The photo ${filename} is placed, and it is not among the photos offered. Place only the photos offered: ${kept.join(', ') || 'none'}.`,
        `The photo ${photoSaid(filename)} is not among the photos kept for the article.`, photoPlace(map, filename));
    });

  // Each beat marked as a card flags one piece, whose source is a document in the record (R4),
  // and the cards, as the tally counts them through beatCardOf, number three to five (C9). A
  // fault is the director's concern only when the card marker they set or cleared made it; the
  // evidence is never their edit (R6).
  sectionBeats(map).forEach(({ beat, slot }) => {
    const fault = cardFault(beat, evidence);
    if (!fault) return;
    const said = `${opening(moveWords(beat))} ${fault.said}.`;
    const ids = fault.marker ? editsOnCardMarker(entries, beatIdOf(beat), fault.marker) : [];
    if (ids.length > 0) concern('card-not-in-record', ids, said);
    else fail('card-not-in-record', fault.message, said, beatPlace(slot, beat));
  });
  if (tally.cards < MAP_CARDS.min || tally.cards > MAP_CARDS.max) {
    const owners = cardCountOwners(tally.cards, entries, map);
    const carries = `The map carries ${tally.cards} card${tally.cards === 1 ? '' : 's'}`;
    const said = `${carries}; the article carries ${MAP_CARDS.min} to ${MAP_CARDS.max}.`;
    if (owners.editIds.length > 0) concern('card-count', owners.editIds, said);
    if (owners.writers) {
      fail('card-count', `${carries}. Mark ${MAP_CARDS.min} to ${MAP_CARDS.max} beats as cards, each flagging the piece whose document it prints, as C9 (\`<craft-cards>\`) sets out.`, said);
    }
  }

  // Every thread in the story lands in a section's beat that names it (R3). One the director
  // put in the story at the meeting, added or brought in from left out, may be named in the gap
  // note instead, when the record cannot carry it, by its name matched loosely (threadNamePattern;
  // fix round 4).
  const carried = new Set(sectionBeats(map).flatMap(({ beat }) => stringsOf(beat.threads)));
  const gapLine = map.gapNote && typeof map.gapNote === 'object' ? textOf(map.gapNote.line) : '';
  const threadName = (thread) => `"${thread.name || thread.id}"`;
  const namedInGapNote = (thread) => {
    const pattern = thread.name && gapLine ? threadNamePattern(thread.name) : null;
    return Boolean(pattern) && pattern.test(gapLine);
  };
  const unlanded = { writers: [], directors: [] };
  storyThreadsOf(inputs.threads).forEach((thread) => {
    if (carried.has(thread.id)) return;
    const directors = thread.added || thread.broughtIn;
    if (directors && namedInGapNote(thread)) return;
    const ids = editsRemovingThread(entries, thread.id);
    if (ids.length > 0) concern('thread-not-landed', ids, `The thread ${threadName(thread)} lands in no move.`);
    else unlanded[directors ? 'directors' : 'writers'].push(thread);
  });
  const threadsWords = (threads) => `${threads.length > 1 ? 'The threads' : 'The thread'} ${listOf(threads.map(threadName))}`;
  const lands = (threads) => (threads.length > 1 ? 'land' : 'lands');
  if (unlanded.writers.length > 0) {
    const named = listOf(unlanded.writers.map((thread) => `${threadName(thread)} (${thread.id})`));
    fail('thread-not-landed', `Threads in the story that no beat carries: ${named}. Land each in the beat that carries it, by its id in that beat's threads.`,
      `${threadsWords(unlanded.writers)} ${lands(unlanded.writers)} in no move.`);
  }
  if (unlanded.directors.length > 0) {
    const named = listOf(unlanded.directors.map((thread) => `${threadName(thread)} (${thread.id})`));
    const how = unlanded.directors.every((thread) => thread.added) ? 'you added'
      : unlanded.directors.every((thread) => !thread.added) ? 'you brought into the story' : 'you put in the story';
    fail('thread-not-landed', `Threads the director added or brought into the story at the meeting that no beat carries and gapNote's line does not name: ${named}. Give each a beat with the evidence that tells it, or, when the record cannot carry it, name it in gapNote's line by its name, without quotation marks, as C16 (\`<craft-story>\`) sets out.`,
      `${threadsWords(unlanded.directors)} ${how} at the meeting ${lands(unlanded.directors)} in no move, and the gap note does not name ${unlanded.directors.length > 1 ? 'them' : 'it'}.`);
  }

  // Every connection the settled weave keeps lands in a beat.
  const landed = new Set(sectionBeats(map).map(({ beat }) => textOf(beat.connection)).filter(Boolean));
  const connectionName = (connection) => `"${connection.line || connection.id}"`;
  const unlandedConnections = [];
  storyConnectionsOf(inputs.connections).forEach((connection) => {
    if (landed.has(connection.id)) return;
    const ids = editsRemovingConnection(entries, connection.id);
    if (ids.length > 0) concern('connection-not-landed', ids, `The connection ${connectionName(connection)} lands in no move.`);
    else unlandedConnections.push(connection);
  });
  if (unlandedConnections.length > 0) {
    fail('connection-not-landed', `Connections from the settled weave that land in no beat: ${unlandedConnections.map((c) => c.id).join(', ')}. Land each in the beat where it does its work, by its id in that beat's connection.`,
      `${unlandedConnections.length > 1 ? 'The connections' : 'The connection'} ${listOf(unlandedConnections.map(connectionName))} ${unlandedConnections.length > 1 ? 'land' : 'lands'} in no move.`);
  }

  // Each change to the weave names its source, and there is none the director did not ask for.
  const changes = objectsOf(map.weaveChanges);
  const meetingEdits = (Array.isArray(inputs.meetingEdits) ? inputs.meetingEdits : []).map(textOf).filter(Boolean);
  const sources = new Set([...meetingEdits, ...(inputs.meetingNote ? [MEETING_NOTE_SOURCE] : [])]);
  const directorsChanges = edits.filter((edit) => Array.isArray(edit.at) && edit.at[0] && edit.at[0].key === 'weaveChanges').map((edit) => edit.id);
  if (changes.length > 0 && sources.size === 0) {
    if (directorsChanges.length > 0) concern('weave-change-unasked', directorsChanges, 'The map lists changes to the weave the meeting did not ask for.');
    else {
      fail('weave-change-unasked', 'The map lists changes to the weave, and the director changed nothing and left no approval note at the meeting. Leave weaveChanges empty.',
        'The map lists changes to the weave, and you changed nothing and left no approval note at the meeting.', 'weaveChanges');
    }
  } else {
    const unnamed = changes.map((change) => textOf(change.source)).filter((source) => !sources.has(source));
    if (unnamed.length > 0) {
      const allowed = [...meetingEdits, ...(inputs.meetingNote ? [`"${MEETING_NOTE_SOURCE}"`] : [])];
      if (directorsChanges.length > 0) concern('weave-change-source', directorsChanges, 'A change to the weave names a change the meeting does not hold.');
      else {
        fail('weave-change-source', `Changes to the weave name sources the meeting does not hold: ${unnamed.map((s) => `"${s}"`).join(', ')}. Name each change's source: ${listOf(allowed)}.`,
          `${unnamed.length > 1 ? 'Changes' : 'A change'} the map made to the weave ${unnamed.length > 1 ? 'name' : 'names'} no change of yours at the meeting.`, 'weaveChanges');
      }
    }
  }

  // The writer's own words on the page as it first opens stay within its allowance (R5;
  // lib/word-count.js pageLengthOf's rule).
  const length = inputs.length;
  if (length && Number.isFinite(length.writer) && Number.isFinite(length.allowance) && length.writer > length.allowance) {
    const longest = writersLinesInPrint(map, share).slice(0, 3).map((line) => `${line.name} (${line.words} words)`);
    fail('over-length', `The map's page runs to ${length.page} words, ${length.writer} of them in the lines you write, past the ${length.allowance} those lines may use (${MAP_WORD_AIM}, or more while the whole page stays within ${MAP_WORD_BOUND}). Cut ${length.writer - length.allowance} words or more from your lines${longest.length > 0 ? `, starting with the longest: ${listOf(longest)}` : ''}. Say each move in a few words, and move into leftOut the beats the story does not need. The rest of the page (the settled story, the photos' descriptions and the counts) is printed by code.`,
      `The writer's part of the map runs to ${length.writer} words, past the ${length.allowance} it may use.`);
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
 * dropped slot may name. The writer, its rework and the prompt's <SCHEMA> read it. The line
 * for a change's source ends on where the prompt holds the meeting's approval note
 * (MEETING_NOTE_POINTER), the pointer the map writer's task prints too (brief 4.6e). Each
 * piece of a beat's evidence, in a section and in left out, is lib/evidence.js
 * EVIDENCE_PIECE_SCHEMA, the shape the weave's evidence has too (phase 4b, brief 1D; R10).
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
    [schema.properties.sections.items.properties.beats.items, schema.properties.leftOut.items]
      .forEach((beat) => { beat.properties.evidence.items = structuredClone(EVIDENCE_PIECE_SCHEMA); });
    const source = schema.properties.weaveChanges.items.properties.source;
    source.description = `${source.description}: ${MEETING_NOTE_POINTER}`;
    writerSchemas.set(theme, schema);
  }
  return writerSchemas.get(theme);
}

/**
 * The map as the director leaves it (R12): the writer's schema for the theme, derived in
 * code, with a beat the director added or brought back allowed whole: a beat needs only its
 * id and its move, in a section and in leftOut (phase 4b, brief 1D), since the article writer
 * finds the evidence for a move the director adds (spec 5.3). The payload gate validates against it
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
      .forEach((beat) => { beat.required = ['id', 'move']; });
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
 * checks find repeats by the same rules (repeatedBeatIds, repeatedPhotos), which build on
 * the console's mapRepeats, the rule its validator and the map on screen read (task 4.6c).
 * The gate reads the map the stop showed through the helper the console's validator calls
 * (shownMapOf): a value that is no map is no map shown, so every repeat is the director's
 * (tasks 4.6d and 4.6e). Past the repeats, a top photo the director left out of the article
 * that their changes put at the top is refused, since the article would print no top photo
 * (leftOutTopPhoto, the rule the console's validator reads too; task 4.14b).
 *
 * @param {*} map - the map as the director left it
 * @param {Object} options
 * @param {string} options.theme
 * @param {*} [options.shown] - the map the stop showed; a value that is no map is read as none
 * @param {string[]} [options.leftOut] - the photos the director left out (mapLeftOutPhotos)
 * @returns {string|null}
 */
function directorMapProblems(map, { theme, shown = null, leftOut = [] } = {}) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) return 'The map must be an object: the map as the director left it.';
  if (!directorValidators.has(theme)) {
    directorValidators.set(theme, new Ajv({ allErrors: true, strict: true }).compile(directorMapSchemaFor(theme)));
  }
  const validate = directorValidators.get(theme);
  if (!validate(map)) {
    const errors = (validate.errors || []).map((e) => `${e.instancePath || '/'} ${e.message}`).join('; ');
    return `The map as the director left it failed the director-side schema: ${errors}`;
  }
  const shownMap = shownMapOf(shown);
  const writers = new Set(repeatedBeatIds(shownMap));
  const theirs = repeatedBeatIds(map).filter((id) => !writers.has(id));
  if (theirs.length > 0) {
    return `Two beats share the id ${listOf(theirs.map((id) => `"${id}"`))}: the director's changes made ${theirs.length > 1 ? 'these repeats' : 'this repeat'}. Give each beat an id of its own.`;
  }
  const writersPhotos = repeatedPhotos(shownMap);
  const theirPhotos = [...repeatedPhotos(map)].filter(([key]) => !writersPhotos.has(key)).map(([, filename]) => `"${filename}"`);
  if (theirPhotos.length > 0) {
    const many = theirPhotos.length > 1;
    return `${listOf(theirPhotos)} ${many ? 'are' : 'is'} placed more than once: the director's changes made ${many ? 'these repeats' : 'this repeat'}. Place each photo once: as the top photo, or in one section.`;
  }
  const leftOutTop = leftOutTopPhoto(map, shownMap, leftOut);
  if (leftOutTop) {
    return `The top photo "${leftOutTop}" is a photo the director left out of the article, so it would not print: the director's changes put it at the top. Move another photo to the top.`;
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
 * The gate refuses a photo the director left out of the article as the top photo their changes
 * chose (mapLeftOutPhotos, directorMapProblems), and stores the director's version as every
 * later reader takes it (task 4.14b): each photo a strike freed by itself in its section
 * (freeStruckBeatPhotos), and each section the director emptied in the dropped list, with the
 * line that says so (dropEmptiedSections).
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
  const sent = body.map === undefined || body.map === null ? shown : body.map;
  const problems = directorMapProblems(sent, { theme, shown, leftOut: mapLeftOutPhotos(currentState, sent) });
  if (problems) return refuse(problems);

  const left = dropEmptiedSections(freeStruckBeatPhotos(sent), shown);
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

/**
 * The director's changes at the story meeting that the weave carries, in the meeting's order,
 * each `{id, place}` (brief 4.14a): its id in the meeting's own form, M and the edit's number,
 * as the settled weave marks it (lib/prompt-renderers/settled-weave.js meetingChangeId), and
 * where it sits as the meeting names the line (lib/meeting.js meetingChangePlace), such as
 * `the role of "Morgan paid Riley at the bar"`.
 *
 * @param {Object} state
 * @returns {Array<{id: string, place: string}>}
 */
function meetingChangesOf(state) {
  const weave = state && state.weave;
  return carriedEdits(state && state._weaveHandEdits, weave)
    .map((edit) => ({ id: meetingChangeId(edit.id), place: meetingChangePlace(edit, weave) }));
}

/**
 * The ids of the director's changes at the story meeting that the weave carries, in the
 * meeting's own form (meetingChangesOf): the sources a change to the weave may name.
 */
function meetingEditIdsOf(state) {
  return meetingChangesOf(state).map((change) => change.id);
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
 * The beats the director added on the map that the map carries, by id (their standing edits;
 * mapDirectorsShare): the map's page says the article writer finds the evidence for such a beat,
 * at whatever look the director added it (spec 2026-10-05 section 5.3), where a beat of the
 * writer's with none is a check's failure, shown beside it.
 *
 * @param {Object} state
 * @returns {string[]}
 */
function mapAddedBeats(state) {
  if (!state || !isMapValue(state.outline)) return [];
  return Object.keys(mapDirectorsShare(carriedEdits(state._outlineHandEdits, state.outline)).addedBeats);
}

/**
 * The payload the map's stop sends (brief 4.6; server.js getCheckpointData adds the trace):
 * the map; the theme's slots, for the screen; the settled story, which the map cannot
 * change; each exposed document by its id (`evidenceIndex`), by which the page names each
 * piece's sources in a move's fold, as the story meeting's folds do (phase 4b, brief 1D); the
 * director's photo descriptions (`photoDescriptions`), by which the page names each photo, and the
 * beats the director added (`addedBeats`, mapAddedBeats), whose fold says the article writer finds
 * their evidence (phase 4b, brief 1D; spec 9); the
 * roster and the kept photos, from which the console builds Everyone and the counts as the
 * director edits (checkpoint-view-logic.js mapTallyOf, through mapTally, the checks' count),
 * so the payload carries no count of its own (task 4.6d); the photos the map places that the
 * director has left out since (`leftOutPhotos`, mapLeftOutPhotos), which the page marks as left
 * out and the console's gate refuses as a top photo the director chose (task 4.14b); a check
 * still failing on the map in hand; the concerns beside their lines; the edits a send-back
 * changed (the report); the standing notes; the round's counters and its note, the one the
 * director sent the map back with, read from the director's notes (lib/workflow/state.js
 * roundNoteOf; task 4.12e), since the rework clears `_outlineFeedback` before the stop opens; and
 * a send-back whose rework did not run, with its note (lib/workflow/state.js roundDidNotRunAt;
 * task 4.14e). `meetingChanges` (brief 4.14a) lists each change of the director's at the story
 * meeting that the weave carries, `{id, place}` (meetingChangesOf), so the page names a map
 * change's source by its place, as the meeting names the line.
 *
 * @param {Object} state
 * @param {Object} options
 * @param {string[]} options.keptPhotos - the photos kept for the article
 * @param {Object} options.evidenceIndex - each exposed document, by its id (server.js buildEvidenceIndex)
 * @param {number} options.maxRevisions - the automated budget of a round
 * @returns {Object}
 */
function mapCheckpointData(state, { keptPhotos = [], evidenceIndex = {}, maxRevisions } = {}) {
  const s = state || {};
  const roster = mapRosterOf(s.sessionConfig, s.canonicalCharacters);
  return {
    outline: s.outline || null,
    mapSlots: mapSlotsOf(s.theme || 'journalist'),
    settledStory: settledStoryOf(s.weave),
    evidenceIndex,
    roster,
    keptPhotos,
    leftOutPhotos: mapLeftOutPhotos(s, s.outline),
    checkFailures: mapCheckFailures(s),
    concerns: mapConcerns(s),
    handEditReport: handEditReportOf(s._outlineHandEditReport),
    directorGateNotes: s.directorGateNotes || [],
    previousFeedback: roundNoteOf(CHECKPOINT_TYPES.OUTLINE, s),
    revisionCount: s.outlineRevisionCount || 0,
    humanRevisionCount: s.humanOutlineRevisionCount || 0,
    maxRevisions,
    roundDidNotRun: roundDidNotRunAt(CHECKPOINT_TYPES.OUTLINE, s),
    meetingChanges: meetingChangesOf(s),
    photoDescriptions: s.photoDescriptions && typeof s.photoDescriptions === 'object' && !Array.isArray(s.photoDescriptions) ? s.photoDescriptions : {},
    addedBeats: mapAddedBeats(s)
  };
}

module.exports = {
  MAP_BEAT_KINDS,
  MAP_CARDS,
  // Phase 4b (brief 1D; R5): the map's page at most 450 words as it first opens, aiming for 300
  MAP_WORD_BOUND,
  MAP_WORD_AIM,
  MAP_CHECKS_SOURCE,
  MEETING_NOTE_SOURCE,
  MEETING_NOTE_POINTER,
  MAP_ACTIONS,
  mapKey,
  mapRosterOf,
  mapFindings,
  // Phase 4b (brief 1D): the director's share of the map, which the checks never fail, and the
  // writer's share, which the check node counts the page on; the beats the director added
  mapDirectorsShare,
  mapWritersShareOf,
  // The length rule (MAP_WORD_BOUND's): the page with the writer's text left blank, for its
  // overhead, and the length the check reads
  mapWritersTextBlank,
  mapLengthOf,
  mapAddedBeats,
  mapSchemaFor,
  directorMapSchemaFor,
  directorMapProblems,
  topPhotoOf,
  mapLeftOutPhotos,
  mapResume,
  mapCheckFailures,
  mapConcerns,
  meetingChangesOf,
  meetingEditIdsOf,
  meetingNoteOf,
  settledStoryOf,
  mapCheckpointData
};
