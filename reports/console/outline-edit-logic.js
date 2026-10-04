/**
 * outline-edit-logic.js — PURE logic for the map, the outline stop (phase 4).
 *
 * Dual-export: registers on window.Console.outlineEditLogic for the browser
 * (React editors call these as thin wrappers) AND exposes the same surface via
 * module.exports under Node so it can be unit-tested in node-env Jest.
 *
 * It holds the rules the map's readers share and the map's editors:
 *   - the map's client gate, validateMapShape (I): the gate's decisions, held to the
 *     director-side map schema and to lib/map.js directorMapProblems by tests (brief 4.6;
 *     task 4.9, ruling 3), so the server refuses nothing the console sends;
 *   - Everyone and the counts, mapTally (K), which the stop's payload, the map checks
 *     (lib/map.js) and the map on screen read alike;
 *   - the map's editors (D, task 4.9; spec 5.3): each line's init, build and merge, and the
 *     map's moves. Each returns a new map and leaves the one it was given as it was, and what
 *     the director types is kept as typed;
 *   - the article's client gate, validateBundleShape (I2), and the reset key both stops use.
 *
 * MUST NOT reference React or window at module-evaluation time except the
 * guarded window.Console write.
 */
(function () {
  'use strict';

  // ── (A) GENERIC PURE PRIMITIVES ──────────────────────────────────────────
  function deepClone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function splitCsv(str) {
    if (typeof str !== 'string') return [];
    return str.split(',').map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 0; });
  }

  function joinCsv(arr) {
    if (!Array.isArray(arr)) return '';
    return arr.join(', ');
  }

  function nonEmpty(value) {
    return typeof value === 'string' && value.trim().length > 0;
  }

  // ── (B) RESET-KEY HELPER ──────────────────────────────────────────────────
  function computeResetKey(obj, revisionCount) {
    var rc = (typeof revisionCount === 'number' && !Number.isNaN(revisionCount)) ? revisionCount : 0;
    var serialized;
    try { serialized = JSON.stringify(obj); } catch (e) { serialized = String(obj); }
    if (serialized == null) serialized = '';
    return String(rc) + ':' + serialized.length + ':' + serialized.slice(0, 64);
  }

  // ── (D) THE MAP'S EDITORS (phase 4, task 4.9; spec 5.3) ──────────────────
  //
  // The director edits the map at its stop. Each line has an editor: its init (the form the
  // editor opens on), its build (what the director typed, as typed) and its merge (the line
  // written into the map as it is now, so a move made while the editor was open stands). The
  // lines: the headline and the deck, the gap note's line, a section's heading and job, a
  // beat, the expected length. The map's moves: a beat moved to another section, struck into
  // left out, brought back into a section the director picks, added with its players, or
  // taken out again; a photo moved to another section or to the top, or set beside a beat of
  // its section. Every function returns a new map and leaves the one it was given as it was.
  // A beat is found by its id, as every edit on the map finds it (lib/hand-edit-diff.js), and
  // a photo by its place, since a writer can place one twice.

  /** The map's place for its top photo: a copy of lib/hand-edit-diff.js MAP_TOP_PHOTO (a test holds the two equal). */
  var MAP_TOP_PHOTO = 'topPhoto';

  /** Is `value` a story map: an object with a list of sections? */
  function isMapValue(value) {
    return isPlainObject(value) && Array.isArray(value.sections);
  }

  /** A copy of the map to change, or a throw naming the operation for anything that is no map. */
  function editedMap(map, operation) {
    if (!isMapValue(map)) throw new Error(operation + ': the map editors change a story map, an object with a list of sections');
    return deepClone(map);
  }

  function textOrEmpty(value) {
    return typeof value === 'string' ? value : '';
  }

  /** A beat's id as every join on the map reads it, trimmed (lib/map.js repeatedBeatIds). */
  function beatIdOf(beat) {
    return isPlainObject(beat) && typeof beat.id === 'string' ? beat.id.trim() : '';
  }

  /** The section of `map` that fills `slot`. */
  function sectionAt(map, slot, operation) {
    var section = map.sections.filter(function (s) { return isPlainObject(s) && s.slot === slot; })[0];
    if (!section) throw new Error(operation + ': the map has no section for the slot ' + String(slot));
    return section;
  }

  /** Every beat of `map`: the sections' in order, then left out's, as the edits read them. */
  function allBeats(map) {
    var out = [];
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (isPlainObject(section) && Array.isArray(section.beats)) out.push.apply(out, section.beats);
    });
    if (Array.isArray(map.leftOut)) out.push.apply(out, map.leftOut);
    return out;
  }

  /** Where the beat with `id` sits: its list and index, and its section (null in left out). */
  function beatAt(map, id, operation) {
    var wanted = typeof id === 'string' ? id.trim() : '';
    var sections = map.sections.filter(isPlainObject);
    for (var s = 0; s < sections.length; s += 1) {
      var beats = Array.isArray(sections[s].beats) ? sections[s].beats : [];
      for (var b = 0; b < beats.length; b += 1) {
        if (wanted && beatIdOf(beats[b]) === wanted) return { section: sections[s], list: beats, index: b };
      }
    }
    var left = Array.isArray(map.leftOut) ? map.leftOut : [];
    for (var l = 0; l < left.length; l += 1) {
      if (wanted && beatIdOf(left[l]) === wanted) return { section: null, list: left, index: l };
    }
    throw new Error(operation + ': the map holds no beat ' + String(id));
  }

  /** An id no beat of the map holds: b and one more than the highest b-number, so b10 after b9. */
  function freshBeatId(map) {
    var taken = {};
    var top = 0;
    allBeats(map).forEach(function (beat) {
      var id = beatIdOf(beat);
      if (!id) return;
      taken[id] = true;
      var m = /^b(\d+)$/.exec(id);
      if (m) top = Math.max(top, Number(m[1]));
    });
    var n = top + 1;
    while (taken['b' + n]) n += 1;
    return 'b' + n;
  }

  // The headline and the deck.

  function initMapHead(map) {
    var m = isPlainObject(map) ? map : {};
    return { headline: textOrEmpty(m.headline), deck: textOrEmpty(m.deck) };
  }

  function buildMapHead(form) {
    return { headline: textOrEmpty(form.headline), deck: textOrEmpty(form.deck) };
  }

  function mergeMapHead(map, head) {
    var next = editedMap(map, 'mergeMapHead');
    next.headline = head.headline;
    next.deck = head.deck;
    return next;
  }

  // The gap note's line; the players it raises stay as the writer named them.

  function initGapNote(gapNote) {
    return { line: isPlainObject(gapNote) ? textOrEmpty(gapNote.line) : '' };
  }

  function buildGapNote(form, gapNote) {
    var out = isPlainObject(gapNote) ? deepClone(gapNote) : { line: '', players: [] };
    out.line = textOrEmpty(form.line);
    if (!Array.isArray(out.players)) out.players = [];
    return out;
  }

  function mergeGapNote(map, gapNote) {
    var next = editedMap(map, 'mergeGapNote');
    next.gapNote = gapNote;
    return next;
  }

  // A section's heading and job, written onto the section as it is now.

  function initMapSection(section) {
    var s = isPlainObject(section) ? section : {};
    return { heading: textOrEmpty(s.heading), job: textOrEmpty(s.job) };
  }

  function buildMapSection(form) {
    return { heading: textOrEmpty(form.heading), job: textOrEmpty(form.job) };
  }

  function mergeMapSection(map, slot, fields) {
    var next = editedMap(map, 'mergeMapSection');
    var section = sectionAt(next, slot, 'mergeMapSection');
    section.heading = fields.heading;
    section.job = fields.job;
    return next;
  }

  // A beat: its material as typed, its kind, the players it shows (a list, typed with commas),
  // the document it prints as a card and the connection that lands in it. A field left blank
  // leaves no key, so a beat the director added keeps the shape they gave it.

  function initBeat(beat) {
    var b = isPlainObject(beat) ? beat : {};
    return {
      kind: textOrEmpty(b.kind),
      material: textOrEmpty(b.material),
      players: joinCsv(b.players),
      card: textOrEmpty(b.card),
      connection: textOrEmpty(b.connection)
    };
  }

  /** An id field: trimmed, or no key at all when blank. */
  function setOrDeleteId(obj, key, value) {
    var id = typeof value === 'string' ? value.trim() : '';
    if (id) obj[key] = id; else delete obj[key];
  }

  function buildBeat(form, beat) {
    var out = isPlainObject(beat) ? deepClone(beat) : {};
    out.material = textOrEmpty(form.material);
    if (BEAT_KINDS.indexOf(form.kind) !== -1) out.kind = form.kind; else delete out.kind;
    var players = splitCsv(form.players);
    if (players.length > 0 || Array.isArray(out.players)) out.players = players;
    setOrDeleteId(out, 'card', form.card);
    setOrDeleteId(out, 'connection', form.connection);
    return out;
  }

  /** The beat with `id`, replaced where it sits now: a section or left out. */
  function mergeBeat(map, id, beat) {
    var next = editedMap(map, 'mergeBeat');
    var place = beatAt(next, id, 'mergeBeat');
    place.list[place.index] = deepClone(beat);
    return next;
  }

  // The expected length: the words the article runs to, a whole number.

  function initMapLength(map) {
    return { expectedLength: isPlainObject(map) && Number.isInteger(map.expectedLength) ? String(map.expectedLength) : '' };
  }

  /** The length typed, as a whole number of words (commas and spaces allowed), or null. */
  function buildMapLength(form) {
    var text = typeof form.expectedLength === 'string' ? form.expectedLength.replace(/[,\s]/g, '') : '';
    return /^\d+$/.test(text) ? Number(text) : null;
  }

  function mergeMapLength(map, length) {
    if (!Number.isInteger(length) || length < 0) throw new Error('mergeMapLength: the expected length is a whole number of words, not ' + String(length));
    var next = editedMap(map, 'mergeMapLength');
    next.expectedLength = length;
    return next;
  }

  // The map's moves.

  /** The photos of `section` that sit beside the beat `id`. */
  function besideBeat(section, id) {
    return (Array.isArray(section.photos) ? section.photos : []).filter(function (photo) {
      return isPlainObject(photo) && typeof photo.beat === 'string' && photo.beat.trim() === id;
    });
  }

  /**
   * A beat moved to the end of the section `toSlot`, from a section or from left out. A photo
   * beside it goes with it, beside it still, so the photo stays with its moment. The order of
   * the beats within a section is the article writer's, so the end is as good as any place.
   */
  function moveBeat(map, id, toSlot) {
    var next = editedMap(map, 'moveBeat');
    var place = beatAt(next, id, 'moveBeat');
    var target = sectionAt(next, toSlot, 'moveBeat');
    if (place.section === target) return map;
    var beat = place.list.splice(place.index, 1)[0];
    if (!Array.isArray(target.beats)) target.beats = [];
    target.beats.push(beat);
    if (place.section) {
      var going = besideBeat(place.section, beatIdOf(beat));
      if (going.length > 0) {
        place.section.photos = place.section.photos.filter(function (photo) { return going.indexOf(photo) === -1; });
        if (!Array.isArray(target.photos)) target.photos = [];
        target.photos.push.apply(target.photos, going);
      }
    }
    return next;
  }

  /**
   * A beat struck: out of its section into the end of left out, whole, so one brought back is
   * the beat it was. A photo beside it stays placed, by itself in its section with its people,
   * since no photo is struck on the map and a struck moment is out of the story.
   */
  function strikeBeat(map, id) {
    var next = editedMap(map, 'strikeBeat');
    var place = beatAt(next, id, 'strikeBeat');
    if (!place.section) return map;
    var beat = place.list.splice(place.index, 1)[0];
    if (!Array.isArray(next.leftOut)) next.leftOut = [];
    next.leftOut.push(beat);
    besideBeat(place.section, beatIdOf(beat)).forEach(function (photo) { delete photo.beat; });
    return next;
  }

  /** A beat brought back from left out, whole, into the end of the section `toSlot`. */
  function bringBackBeat(map, id, toSlot) {
    if (beatAt(editedMap(map, 'bringBackBeat'), id, 'bringBackBeat').section) {
      throw new Error('bringBackBeat: ' + String(id) + ' is not in left out');
    }
    return moveBeat(map, id, toSlot);
  }

  /**
   * A beat the director adds to the end of the section `toSlot`: its material as typed and the
   * players it shows (typed with commas, or a list), under an id no beat holds. The
   * director-side schema asks a beat added for its id and its material alone. A blank line
   * adds none.
   */
  function addBeat(map, toSlot, material, players) {
    if (typeof material !== 'string' || !material.trim()) return map;
    var next = editedMap(map, 'addBeat');
    var target = sectionAt(next, toSlot, 'addBeat');
    if (!Array.isArray(target.beats)) target.beats = [];
    var names = Array.isArray(players)
      ? players.filter(nonEmpty).map(function (name) { return name.trim(); })
      : splitCsv(players);
    target.beats.push({ id: freshBeatId(next), material: material, players: names });
    return next;
  }

  /** A beat taken out of the map whole: the screen offers it for a beat the director added at this look. */
  function removeBeat(map, id) {
    var next = editedMap(map, 'removeBeat');
    var place = beatAt(next, id, 'removeBeat');
    place.list.splice(place.index, 1);
    return next;
  }

  /** The photo list of the section `slot`, holding a photo at `index`. */
  function photosAt(map, slot, index, operation) {
    var section = sectionAt(map, slot, operation);
    if (!Array.isArray(section.photos) || !isPlainObject(section.photos[index])) {
      throw new Error(operation + ': the section ' + String(slot) + ' holds no photo at ' + String(index));
    }
    return section.photos;
  }

  /**
   * A photo moved from its place (`fromSlot` a section, with the photo's `fromIndex` there, or
   * MAP_TOP_PHOTO) to the end of the section `toSlot`, or to the top. Every photo stays placed
   * once (T13): a photo moved to the top trades places with the top photo, which takes its
   * place, by itself; the top photo moved into a section leaves the map with no top photo. A
   * photo moved into a section sits there by itself, with its people; the director can set it
   * beside a beat of that section.
   */
  function movePhoto(map, fromSlot, fromIndex, toSlot) {
    if (fromSlot === toSlot) return map;
    var next = editedMap(map, 'movePhoto');
    var filename;
    var left = null;
    if (fromSlot === MAP_TOP_PHOTO) {
      if (!nonEmpty(next.topPhoto)) throw new Error('movePhoto: the map has no top photo');
      filename = next.topPhoto;
      delete next.topPhoto;
    } else {
      var from = photosAt(next, fromSlot, fromIndex, 'movePhoto');
      filename = from[fromIndex].filename;
      from.splice(fromIndex, 1);
      left = { list: from, index: fromIndex };
    }
    if (toSlot === MAP_TOP_PHOTO) {
      var previous = nonEmpty(next.topPhoto) ? next.topPhoto : null;
      next.topPhoto = filename;
      if (previous) left.list.splice(left.index, 0, { filename: previous });
      return next;
    }
    var target = sectionAt(next, toSlot, 'movePhoto');
    if (!Array.isArray(target.photos)) target.photos = [];
    target.photos.push({ filename: filename });
    return next;
  }

  /** A photo of the section `slot` set beside one of the section's beats, or by itself with `beatId` blank. */
  function setPhotoBeside(map, slot, index, beatId) {
    var next = editedMap(map, 'setPhotoBeside');
    var photo = photosAt(next, slot, index, 'setPhotoBeside')[index];
    var id = typeof beatId === 'string' ? beatId.trim() : '';
    if (!id) {
      delete photo.beat;
      return next;
    }
    var section = sectionAt(next, slot, 'setPhotoBeside');
    var held = (Array.isArray(section.beats) ? section.beats : []).some(function (beat) { return beatIdOf(beat) === id; });
    if (!held) throw new Error('setPhotoBeside: the section ' + String(slot) + ' holds no beat ' + id);
    photo.beat = id;
    return next;
  }

  // ── (I) CLIENT-SIDE STRUCTURAL VALIDATION (dependency-free fast-fail gate) ──
  function isPlainObject(val) { return val !== null && typeof val === 'object' && !Array.isArray(val); }
  function isNonEmptyString(val) { return typeof val === 'string' && val.trim().length > 0; }

  // The map's client gate (phase 4, brief 4.6): the director-side map schema's rules, held
  // equal to it by a test (lib/map.js directorMapSchemaFor; never stricter, and a corpus
  // the two decide alike), then the gate's rules for a repeat (task 4.9, ruling 3: lib/map.js
  // directorMapProblems, whose decisions a test holds this to). The root keys, a beat's kinds
  // and the headline limits are the schema's; the slots, when the stop's payload gives them,
  // are the theme's.
  var MAP_ROOT_KEYS = ['headline', 'deck', 'topPhoto', 'gapNote', 'sections', 'dropped', 'leftOut', 'expectedLength', 'weaveChanges'];
  var MAP_REQUIRED_KEYS = ['headline', 'deck', 'sections', 'dropped', 'leftOut', 'expectedLength', 'weaveChanges'];
  // A beat's kind, one of the schema's four (lib/map.js MAP_BEAT_KINDS; a test holds the
  // two lists equal).
  var BEAT_KINDS = ['scene', 'receipt', 'line', 'figure'];
  var SECTION_KEYS = ['slot', 'heading', 'job', 'beats', 'photos'];
  var BEAT_KEYS = ['id', 'kind', 'material', 'players', 'card', 'connection'];
  // A beat the director added or brought back needs only these (R12).
  var BEAT_REQUIRED_KEYS = ['id', 'material'];
  var PHOTO_KEYS = ['filename', 'beat'];

  /**
   * The headline and deck limits: the content bundle's, one constant
   * (console/article-desk-logic.js HEADLINE_LIMITS), which the map's schema states too.
   * Read when a map is checked, since article-desk-logic.js loads after this module.
   */
  function headlineLimits() {
    if (typeof window !== 'undefined' && window.Console && window.Console.articleDeskLogic) {
      return window.Console.articleDeskLogic.HEADLINE_LIMITS;
    }
    if (typeof module !== 'undefined' && module.exports && typeof require === 'function') {
      return require('./article-desk-logic').HEADLINE_LIMITS;
    }
    return null;
  }

  /** A text's length as the schema counts it, in code points. */
  function codePoints(text) {
    return Array.from(text).length;
  }

  function onlyKeys(errors, path, value, allowed) {
    Object.keys(value).forEach(function (k) {
      if (allowed.indexOf(k) === -1) errors.push({ path: path + '/' + k, message: 'is not an allowed key' });
    });
  }

  function requiredKeys(errors, path, value, required) {
    required.forEach(function (k) {
      if (value[k] === undefined) errors.push({ path: path, message: "must have required property '" + k + "'" });
    });
  }

  function stringAt(errors, path, value) {
    if (value !== undefined && typeof value !== 'string') errors.push({ path: path, message: 'must be a string' });
  }

  function stringList(errors, path, value) {
    if (value === undefined) return;
    if (!Array.isArray(value)) { errors.push({ path: path, message: 'must be an array of strings' }); return; }
    value.forEach(function (item, i) {
      if (typeof item !== 'string') errors.push({ path: path + '/' + i, message: 'must be a string' });
    });
  }

  function objectList(errors, path, value, each) {
    if (value === undefined) return;
    if (!Array.isArray(value)) { errors.push({ path: path, message: 'must be an array' }); return; }
    value.forEach(function (item, i) {
      if (!isPlainObject(item)) { errors.push({ path: path + '/' + i, message: 'must be an object' }); return; }
      each(item, path + '/' + i);
    });
  }

  function slotAt(errors, path, value, slots) {
    if (typeof value !== 'string') { errors.push({ path: path, message: 'must be a string' }); return; }
    if (slots && slots.indexOf(value) === -1) errors.push({ path: path, message: 'must be one of the slots: ' + slots.join(', ') });
  }

  function validateBeat(errors, beat, path) {
    onlyKeys(errors, path, beat, BEAT_KEYS);
    requiredKeys(errors, path, beat, BEAT_REQUIRED_KEYS);
    ['id', 'material', 'card', 'connection'].forEach(function (k) { stringAt(errors, path + '/' + k, beat[k]); });
    if (beat.kind !== undefined && BEAT_KINDS.indexOf(beat.kind) === -1) {
      errors.push({ path: path + '/kind', message: 'must be one of ' + BEAT_KINDS.join(', ') });
    }
    stringList(errors, path + '/players', beat.players);
  }

  /**
   * Each beat id of a map with its place and path, in the order the gate reads them
   * (lib/map.js repeatedBeatIds: the sections' beats, then left out's, each id trimmed).
   */
  function beatEntries(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section, s) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.beats) ? section.beats : []).forEach(function (beat, b) {
        if (beatIdOf(beat)) out.push({ key: beatIdOf(beat), name: beatIdOf(beat), place: section.slot, path: '/sections/' + s + '/beats/' + b });
      });
    });
    (Array.isArray(map.leftOut) ? map.leftOut : []).forEach(function (beat, b) {
      if (beatIdOf(beat)) out.push({ key: beatIdOf(beat), name: beatIdOf(beat), place: 'leftOut', path: '/leftOut/' + b });
    });
    return out;
  }

  /**
   * Each photo a map places with its place and path, as mapPhotoPlacements reads them (the
   * top photo, then each section's), keyed by photoKey, the one join key for a photo.
   */
  function photoEntries(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    if (typeof map.topPhoto === 'string' && map.topPhoto.trim()) {
      out.push({ key: photoKey(map.topPhoto), name: map.topPhoto, place: MAP_TOP_PHOTO, path: '/topPhoto' });
    }
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section, s) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.photos) ? section.photos : []).forEach(function (photo, p) {
        if (isPlainObject(photo) && typeof photo.filename === 'string' && photo.filename.trim()) {
          out.push({ key: photoKey(photo.filename), name: photo.filename, place: section.slot, path: '/sections/' + s + '/photos/' + p });
        }
      });
    });
    return out;
  }

  /** The keys more than one entry carries, each once, in the order they first repeat. */
  function repeatedKeys(entries) {
    var seen = {};
    var repeated = [];
    entries.forEach(function (entry) {
      if (seen[entry.key] && repeated.indexOf(entry.key) === -1) repeated.push(entry.key);
      seen[entry.key] = true;
    });
    return repeated;
  }

  /**
   * The repeats the director's changes made, by the gate's rule for repeats: a key the map
   * repeats that the map the stop showed does not. Each comes with the entry to name: the
   * first one in a place where the map shown does not hold the key, else the last.
   */
  function directorsRepeats(entries, shownEntries) {
    var writers = repeatedKeys(shownEntries);
    return repeatedKeys(entries).filter(function (key) { return writers.indexOf(key) === -1; }).map(function (key) {
      var mine = entries.filter(function (entry) { return entry.key === key; });
      var shownPlaces = shownEntries.filter(function (entry) { return entry.key === key; }).map(function (entry) { return entry.place; });
      return mine.filter(function (entry) { return shownPlaces.indexOf(entry.place) === -1; })[0] || mine[mine.length - 1];
    });
  }

  /**
   * The map's client gate: the decisions the gate makes (lib/map.js directorMapProblems), so a
   * map the server would refuse is caught before the POST, and a map it accepts passes:
   * - the director-side schema's checks. With `slots` (the stop's `mapSlots`, as keys or as
   *   `{key}`), a section's slot and a dropped slot must be one of them;
   * - a beat id the director's changes repeat: the edits find a beat by its id. A repeat the
   *   map the stop showed (`shown`) holds is the writer's, which the map checks report;
   * - a photo the director's changes place more than once (4.6b's rule, the same reading of a
   *   repeat): each kept photo is placed once (T13).
   *
   * @param {*} map
   * @param {Object} [options]
   * @param {Array} [options.slots]
   * @param {Object|null} [options.shown] - the map the stop showed; without it every repeat is the director's
   * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
   */
  function validateMapShape(map, options) {
    if (!isPlainObject(map)) return { valid: false, errors: [{ path: '/', message: 'the map must be an object' }] };
    var opts = options || {};
    var slots = Array.isArray(opts.slots)
      ? opts.slots.map(function (slot) { return isPlainObject(slot) ? slot.key : slot; }).filter(function (k) { return typeof k === 'string'; })
      : null;
    var errors = [];
    onlyKeys(errors, '', map, MAP_ROOT_KEYS);
    requiredKeys(errors, '/', map, MAP_REQUIRED_KEYS);

    var limits = headlineLimits();
    if (map.headline !== undefined) {
      if (typeof map.headline !== 'string') errors.push({ path: '/headline', message: 'must be a string' });
      else if (limits && (codePoints(map.headline) < limits.main.min || codePoints(map.headline) > limits.main.max)) {
        errors.push({ path: '/headline', message: 'must be ' + limits.main.min + ' to ' + limits.main.max + ' characters' });
      }
    }
    if (map.deck !== undefined) {
      if (typeof map.deck !== 'string') errors.push({ path: '/deck', message: 'must be a string' });
      else if (limits && codePoints(map.deck) > limits.deck.max) errors.push({ path: '/deck', message: 'must be at most ' + limits.deck.max + ' characters' });
    }
    stringAt(errors, '/topPhoto', map.topPhoto);
    if (map.gapNote !== undefined) {
      if (!isPlainObject(map.gapNote)) errors.push({ path: '/gapNote', message: 'must be an object' });
      else {
        onlyKeys(errors, '/gapNote', map.gapNote, ['line', 'players']);
        requiredKeys(errors, '/gapNote', map.gapNote, ['line', 'players']);
        stringAt(errors, '/gapNote/line', map.gapNote.line);
        stringList(errors, '/gapNote/players', map.gapNote.players);
      }
    }
    objectList(errors, '/sections', map.sections, function (section, path) {
      onlyKeys(errors, path, section, SECTION_KEYS);
      requiredKeys(errors, path, section, SECTION_KEYS);
      if (section.slot !== undefined) slotAt(errors, path + '/slot', section.slot, slots);
      stringAt(errors, path + '/heading', section.heading);
      stringAt(errors, path + '/job', section.job);
      objectList(errors, path + '/beats', section.beats, function (beat, beatPath) { validateBeat(errors, beat, beatPath); });
      objectList(errors, path + '/photos', section.photos, function (photo, photoPath) {
        onlyKeys(errors, photoPath, photo, PHOTO_KEYS);
        requiredKeys(errors, photoPath, photo, ['filename']);
        stringAt(errors, photoPath + '/filename', photo.filename);
        stringAt(errors, photoPath + '/beat', photo.beat);
      });
    });
    objectList(errors, '/dropped', map.dropped, function (dropped, path) {
      onlyKeys(errors, path, dropped, ['slot', 'reason']);
      requiredKeys(errors, path, dropped, ['slot', 'reason']);
      if (dropped.slot !== undefined) slotAt(errors, path + '/slot', dropped.slot, slots);
      stringAt(errors, path + '/reason', dropped.reason);
    });
    objectList(errors, '/leftOut', map.leftOut, function (beat, path) { validateBeat(errors, beat, path); });
    if (map.expectedLength !== undefined && !Number.isInteger(map.expectedLength)) {
      errors.push({ path: '/expectedLength', message: 'must be an integer' });
    }
    objectList(errors, '/weaveChanges', map.weaveChanges, function (change, path) {
      onlyKeys(errors, path, change, ['source', 'change']);
      requiredKeys(errors, path, change, ['source', 'change']);
      stringAt(errors, path + '/source', change.source);
      stringAt(errors, path + '/change', change.change);
    });
    var shown = opts.shown === undefined ? null : opts.shown;
    directorsRepeats(beatEntries(map), beatEntries(shown)).forEach(function (entry) {
      errors.push({ path: entry.path, message: 'shares its id with another beat: your changes made this repeat. Give each beat an id of its own.' });
    });
    directorsRepeats(photoEntries(map), photoEntries(shown)).forEach(function (entry) {
      errors.push({ path: entry.path, message: 'places ' + entry.name + ' a second time: your changes made this repeat. Place each photo once.' });
    });
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * The outline stop's client gate, by its old name: the map's gate. The outline stage's
   * detective branch went with it (R1).
   *
   * @param {*} outline - the map
   * @param {string} [theme] - unused: every theme's map has one shape
   * @param {Array} [slots] - the stop's mapSlots
   * @param {Object|null} [shown] - the map the stop showed, whose repeats are the writer's
   */
  function validateOutlineShape(outline, theme, slots, shown) {
    return validateMapShape(outline, { slots: slots, shown: shown });
  }

  // ── (I2) ARTICLE CLIENT GATE (B6) ─────────────────────────────────────────
  //
  // The mirror of validateOutlineShape for the ContentBundle. Task 3 added the
  // server-side content-bundle schema check (a 400 the console already renders);
  // this catches the obvious breakage before the POST and in the same inline
  // error slot, because an unvalidated hand-edit used to reach
  // validateContentBundle, which routes a bad bundle straight to END — after ten
  // checkpoints and five-plus Opus calls, with Retry failing identically.
  //
  // NOT STRICTER THAN THE SERVER, on purpose: content-bundle.schema.json makes
  // `heading` optional on a section, so requiring it here would block Approve on
  // a bundle the server would have accepted. This gate checks only what is
  // unambiguously required, and leaves the fine grain to the schema.

  /** The content-block `type` values content-bundle.schema.json allows. */
  var CONTENT_BLOCK_TYPES = [
    'paragraph', 'quote', 'evidence-reference', 'list', 'photo', 'evidence-card'
  ];

  /**
   * Dependency-free structural check on an edited ContentBundle.
   *
   * @param {*} bundle
   * @returns {{valid: boolean, errors: Array<{path: string, message: string}>}}
   */
  function validateBundleShape(bundle) {
    if (!isPlainObject(bundle)) {
      return { valid: false, errors: [{ path: '/', message: 'article bundle must be an object' }] };
    }
    var errors = [];

    ['metadata', 'headline'].forEach(function (key) {
      if (!isPlainObject(bundle[key])) {
        errors.push({ path: '/' + key, message: "must be a required object '" + key + "'" });
      }
    });

    if (!Array.isArray(bundle.sections) || bundle.sections.length === 0) {
      errors.push({ path: '/sections', message: 'must be a non-empty array of sections' });
      return { valid: false, errors: errors };
    }

    bundle.sections.forEach(function (section, i) {
      var base = '/sections/' + i;
      if (!isPlainObject(section)) {
        errors.push({ path: base, message: 'must be an object' });
        return;
      }
      if (!isNonEmptyString(section.id)) {
        errors.push({ path: base + '/id', message: "must have required string 'id'" });
      }
      if (section.heading !== undefined && typeof section.heading !== 'string') {
        errors.push({ path: base + '/heading', message: 'must be a string when present' });
      }
      if (!Array.isArray(section.content)) {
        errors.push({ path: base + '/content', message: 'must be an array of content blocks' });
        return;
      }
      section.content.forEach(function (block, j) {
        var blockPath = base + '/content/' + j;
        if (!isPlainObject(block)) {
          errors.push({ path: blockPath, message: 'must be an object' });
          return;
        }
        if (typeof block.type !== 'string' || block.type.length === 0) {
          errors.push({ path: blockPath + '/type', message: "must have a string 'type'" });
          return;
        }
        if (CONTENT_BLOCK_TYPES.indexOf(block.type) === -1) {
          errors.push({
            path: blockPath + '/type',
            message: "'" + block.type + "' is not a content block type (" + CONTENT_BLOCK_TYPES.join(', ') + ')'
          });
        }
      });
    });

    return { valid: errors.length === 0, errors: errors };
  }

  // ── (K) THE MAP: EVERYONE AND THE COUNTS (phase 4, brief 4.6) ──────────────
  //
  // Everyone, the cards and the photos are built by one function from the beats, so the
  // stop's payload, the map on screen as the director edits it (task 4.9) and the map checks
  // (lib/map.js) count alike. A name in a beat counts for the roster member it names.

  /**
   * The roster member a name names, by the member's roster name: the first name, the full
   * name, or a name whose first word is the first name, each in any case; null for a name
   * that is no roster member's, such as an NPC or a character off the roster.
   *
   * @param {*} name - a name as a beat or the gap note gives it
   * @param {Array<string|{name: string, fullName?: string|null}>} roster
   * @returns {string|null}
   */
  function rosterMemberOf(name, roster) {
    var wanted = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!wanted) return null;
    var firstWord = wanted.split(/\s+/)[0];
    var list = Array.isArray(roster) ? roster : [];
    for (var i = 0; i < list.length; i += 1) {
      var entry = list[i];
      var first = isPlainObject(entry) ? entry.name : entry;
      if (typeof first !== 'string' || !first.trim()) continue;
      var own = first.trim().toLowerCase();
      var full = isPlainObject(entry) && typeof entry.fullName === 'string' ? entry.fullName.trim().toLowerCase() : '';
      if (wanted === own || firstWord === own || (full && wanted === full)) return first.trim();
    }
    return null;
  }

  /**
   * A photo's filename as every join reads it: the basename, lower case. The console's copy
   * of the server's one join key (lib/prompt-renderers/director-words-renderer.js photoKey),
   * which it cannot require; a test holds the two equal (brief 4.6, fix round 1).
   */
  function photoKey(filename) {
    return String(filename || '').split(/[/\\]/).pop().toLowerCase();
  }

  /**
   * The id of the document a beat prints as a card, trimmed, or '' for a beat that is no
   * card: the one rule for which beats are cards, for the counts and the map checks.
   */
  function beatCardOf(beat) {
    return isPlainObject(beat) && typeof beat.card === 'string' ? beat.card.trim() : '';
  }

  /**
   * Where the map places each photo, in order: the top photo first (`at: 'topPhoto'`),
   * then each section's photos (`at`: the section's slot). A photo placed twice is listed
   * twice.
   *
   * @param {*} map
   * @returns {Array<{filename: string, at: string}>}
   */
  function mapPhotoPlacements(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    if (typeof map.topPhoto === 'string' && map.topPhoto.trim()) out.push({ filename: map.topPhoto, at: 'topPhoto' });
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.photos) ? section.photos : []).forEach(function (photo) {
        if (isPlainObject(photo) && typeof photo.filename === 'string' && photo.filename.trim()) {
          out.push({ filename: photo.filename, at: section.slot });
        }
      });
    });
    return out;
  }

  /**
   * Everyone and the counts (spec 5.2): where each roster player appears, each under the
   * first section whose beat shows them; the roster players in no section's beat
   * (`unplaced`) and those the gap note raises (`raised`); the cards in the sections; and
   * how many of the photos kept for the article the map places, the top photo included.
   * A left-out beat places no one and carries no card.
   *
   * @param {*} map
   * @param {Object} [options]
   * @param {Array} [options.roster] - rosterMemberOf's roster
   * @param {string[]} [options.keptPhotos] - the filenames of the photos kept for the article
   * @returns {{everyone: Array<{slot: string, heading: string, players: string[]}>,
   *   unplaced: string[], raised: string[], cards: number, photos: {placed: number, of: number}}}
   */
  function mapTally(map, options) {
    var opts = options || {};
    var roster = Array.isArray(opts.roster) ? opts.roster : [];
    var kept = Array.isArray(opts.keptPhotos) ? opts.keptPhotos : [];
    var everyone = [];
    var seen = {};
    var cards = 0;
    (isPlainObject(map) && Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (!isPlainObject(section)) return;
      var players = [];
      (Array.isArray(section.beats) ? section.beats : []).forEach(function (beat) {
        if (!isPlainObject(beat)) return;
        if (beatCardOf(beat)) cards += 1;
        (Array.isArray(beat.players) ? beat.players : []).forEach(function (name) {
          var member = rosterMemberOf(name, roster);
          if (member && !seen[member]) {
            seen[member] = true;
            players.push(member);
          }
        });
      });
      if (players.length > 0) {
        everyone.push({ slot: section.slot, heading: typeof section.heading === 'string' ? section.heading : '', players: players });
      }
    });
    var names = [];
    roster.forEach(function (entry) {
      var first = isPlainObject(entry) ? entry.name : entry;
      if (typeof first === 'string' && first.trim() && names.indexOf(first.trim()) === -1) names.push(first.trim());
    });
    var raised = [];
    var gapPlayers = isPlainObject(map) && isPlainObject(map.gapNote) && Array.isArray(map.gapNote.players) ? map.gapNote.players : [];
    gapPlayers.forEach(function (name) {
      var member = rosterMemberOf(name, roster);
      if (member && raised.indexOf(member) === -1) raised.push(member);
    });
    var keptKeys = kept.map(photoKey);
    var placed = [];
    mapPhotoPlacements(map).forEach(function (placement) {
      var key = photoKey(placement.filename);
      if (keptKeys.indexOf(key) !== -1 && placed.indexOf(key) === -1) placed.push(key);
    });
    return {
      everyone: everyone,
      unplaced: names.filter(function (name) { return !seen[name]; }),
      raised: raised,
      cards: cards,
      photos: { placed: placed.length, of: kept.length }
    };
  }

  // ── (J) PUBLIC SURFACE ────────────────────────────────────────────────────
  var api = {
    deepClone: deepClone,
    splitCsv: splitCsv,
    joinCsv: joinCsv,
    nonEmpty: nonEmpty,
    computeResetKey: computeResetKey,

    // Task 4.9: the map's editors (init, build, merge) and its moves
    MAP_TOP_PHOTO: MAP_TOP_PHOTO,
    initMapHead: initMapHead,
    buildMapHead: buildMapHead,
    mergeMapHead: mergeMapHead,
    initGapNote: initGapNote,
    buildGapNote: buildGapNote,
    mergeGapNote: mergeGapNote,
    initMapSection: initMapSection,
    buildMapSection: buildMapSection,
    mergeMapSection: mergeMapSection,
    initBeat: initBeat,
    buildBeat: buildBeat,
    mergeBeat: mergeBeat,
    initMapLength: initMapLength,
    buildMapLength: buildMapLength,
    mergeMapLength: mergeMapLength,
    freshBeatId: freshBeatId,
    moveBeat: moveBeat,
    strikeBeat: strikeBeat,
    bringBackBeat: bringBackBeat,
    addBeat: addBeat,
    removeBeat: removeBeat,
    movePhoto: movePhoto,
    setPhotoBeside: setPhotoBeside,

    validateOutlineShape: validateOutlineShape,
    validateMapShape: validateMapShape,
    validateBundleShape: validateBundleShape,
    CONTENT_BLOCK_TYPES: CONTENT_BLOCK_TYPES,
    MAP_ROOT_KEYS: MAP_ROOT_KEYS,
    BEAT_KINDS: BEAT_KINDS,

    // Phase 4 (brief 4.6): Everyone and the counts, one function from the beats
    rosterMemberOf: rosterMemberOf,
    photoKey: photoKey,
    beatCardOf: beatCardOf,
    mapPhotoPlacements: mapPhotoPlacements,
    mapTally: mapTally
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.outlineEditLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
