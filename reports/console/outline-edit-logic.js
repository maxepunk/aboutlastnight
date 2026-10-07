/**
 * outline-edit-logic.js — PURE logic for the map, the outline stop (phase 4).
 *
 * Dual-export: registers on window.Console.outlineEditLogic for the browser
 * (React editors call these as thin wrappers) AND exposes the same surface via
 * module.exports under Node so it can be unit-tested in node-env Jest.
 *
 * It holds the rules the map's readers share and the map's editors:
 *   - the map's readers (K): whether a value is a map, a beat's id and card, where the map
 *     places each beat and photo, and what it repeats (mapRepeats). The client gate, the moves
 *     and the map on screen (checkpoint-view-logic.js) take each of these from here;
 *   - the map's client gate, validateMapShape (I): the gate's decisions, held to the
 *     director-side map schema and to lib/map.js directorMapProblems by tests (brief 4.6;
 *     task 4.9, ruling 3), so the server refuses nothing the console sends;
 *   - the counts, mapTally (K): who is placed, the cards and the photos, which the stop's
 *     payload, the map checks (lib/map.js) and the map on screen read alike;
 *   - the map's editors (D, task 4.9; spec 5.3): each line's init, build and merge, and the
 *     map's moves. Each returns a new map and leaves the one it was given as it was, and what
 *     the director types is kept as typed;
 *   - the map as the gate stores it (D, task 4.14b): a struck beat's photos freed
 *     (freeStruckBeatPhotos, read so everywhere through photoBeatOf) and each section the
 *     director emptied dropped (dropEmptiedSections), which lib/map.js mapResume applies; and
 *     the drop held after an automatic pass (holdDroppedSections, fix round 1), which
 *     lib/hand-edit-diff.js settleEdits applies;
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

  /** A copy of the map to change, or a throw naming the operation for anything that is no map. */
  function editedMap(map, operation) {
    if (!isMapValue(map)) throw new Error(operation + ': the map editors change a story map, an object with a list of sections');
    return deepClone(map);
  }

  function textOrEmpty(value) {
    return typeof value === 'string' ? value : '';
  }

  /**
   * The section of the map that fills `slot`, as the editors and the moves find it: the first
   * section with that slot. The section a section's editor opens on (task 4.6c). Null for
   * anything that is no map, and for a slot no section fills.
   *
   * @param {*} map
   * @param {string} slot
   * @returns {Object|null}
   */
  function sectionWithSlot(map, slot) {
    if (!isMapValue(map)) return null;
    return map.sections.filter(function (s) { return isPlainObject(s) && s.slot === slot; })[0] || null;
  }

  /** The section of `map` that fills `slot` (sectionWithSlot), or a throw naming the operation. */
  function sectionAt(map, slot, operation) {
    var section = sectionWithSlot(map, slot);
    if (!section) throw new Error(operation + ': the map has no section for the slot ' + String(slot));
    return section;
  }

  /**
   * Where the beat with `id` sits, as every move finds it: the first beat with that id
   * (beatIdOf), in the sections in order, then in left out. Its list and index, and its section
   * (null in left out); null when no beat holds the id.
   */
  function placeOfBeat(map, id) {
    var wanted = typeof id === 'string' ? id.trim() : '';
    if (!wanted) return null;
    var sections = map.sections.filter(isPlainObject);
    for (var s = 0; s < sections.length; s += 1) {
      var beats = Array.isArray(sections[s].beats) ? sections[s].beats : [];
      for (var b = 0; b < beats.length; b += 1) {
        if (beatIdOf(beats[b]) === wanted) return { section: sections[s], list: beats, index: b };
      }
    }
    var left = Array.isArray(map.leftOut) ? map.leftOut : [];
    for (var l = 0; l < left.length; l += 1) {
      if (beatIdOf(left[l]) === wanted) return { section: null, list: left, index: l };
    }
    return null;
  }

  /** placeOfBeat, or a throw naming the operation when no beat holds the id. */
  function beatAt(map, id, operation) {
    var place = placeOfBeat(map, id);
    if (!place) throw new Error(operation + ': the map holds no beat ' + String(id));
    return place;
  }

  /**
   * The beat with `id` as the moves find it (placeOfBeat): the beat its editor opens on and
   * builds from. Null for anything that is no map, and for an id no beat holds.
   *
   * @param {*} map
   * @param {string} id
   * @returns {Object|null}
   */
  function beatWithId(map, id) {
    var place = isMapValue(map) ? placeOfBeat(map, id) : null;
    return place ? place.list[place.index] : null;
  }

  /** An id no beat of the map holds: b and one more than the highest b-number, so b10 after b9. */
  function freshBeatId(map) {
    var taken = new Set();
    var top = 0;
    mapBeatPlacements(map).forEach(function (placement) {
      taken.add(placement.id);
      var m = /^b(\d+)$/.exec(placement.id);
      if (m) top = Math.max(top, Number(m[1]));
    });
    var n = top + 1;
    while (taken.has('b' + n)) n += 1;
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

  // A beat (phase 4b, brief 1D): its move as typed, its summary as typed (its synopsis; piece 4,
  // R1) and the players it shows (a list, typed with commas). Every other field of the beat (the
  // threads it carries, its card marker, its connection, its kind and its evidence) is the
  // writer's, and stays as it is: the evidence is never the director's edit (R6). A beat with no
  // summary, such as one the director added or one on a map from before piece 4, gains one only
  // when the director writes it.

  function initBeat(beat) {
    var b = isPlainObject(beat) ? beat : {};
    return { move: textOrEmpty(b.move), synopsis: textOrEmpty(b.synopsis), players: joinCsv(b.players) };
  }

  function buildBeat(form, beat) {
    var out = isPlainObject(beat) ? deepClone(beat) : {};
    out.move = textOrEmpty(form.move);
    var synopsis = textOrEmpty(form.synopsis);
    if (synopsis || typeof out.synopsis === 'string') out.synopsis = synopsis;
    var players = splitCsv(form.players);
    if (players.length > 0 || Array.isArray(out.players)) out.players = players;
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

  /** The beat a photo names, trimmed, or '' for a photo that names none. */
  function namedBeatOf(photo) {
    return isPlainObject(photo) && typeof photo.beat === 'string' ? photo.beat.trim() : '';
  }

  /** The photos of `section` that name the beat `id`. */
  function besideBeat(section, id) {
    return (Array.isArray(section.photos) ? section.photos : []).filter(function (photo) {
      var named = namedBeatOf(photo);
      return named !== '' && named === id;
    });
  }

  /**
   * The photos of `section` beside the beat `id`, left in the section by themselves, with
   * their people: what the take-out does when the beat leaves the section (task 4.6d), and what
   * the gate does with a struck beat's photos (freeStruckBeatPhotos; task 4.14b). A move takes
   * them along instead (moveBeat).
   */
  function freePhotosBeside(section, id) {
    besideBeat(section, id).forEach(function (photo) { delete photo.beat; });
  }

  /**
   * Is the beat `id` struck: held by the map only in left out (task 4.14b)? The beat is found
   * as every move finds it (placeOfBeat): the first beat with the id, in the sections, then in
   * left out.
   *
   * @param {*} map
   * @param {string} id
   * @returns {boolean}
   */
  function isStruckBeat(map, id) {
    var place = isMapValue(map) ? placeOfBeat(map, id) : null;
    return Boolean(place) && !place.section;
  }

  /**
   * The beat a photo sits beside, as every reader of the map reads it (task 4.14b): the beat it
   * names, or '' for a photo by itself. A photo beside a struck beat sits by itself, with its
   * people: the strike freed it, and the photo keeps the beat's name only so that bringing the
   * beat back reattaches it (strikeBeat, moveBeat).
   *
   * @param {*} map
   * @param {*} photo
   * @returns {string}
   */
  function photoBeatOf(map, photo) {
    var id = namedBeatOf(photo);
    return id && !isStruckBeat(map, id) ? id : '';
  }

  /**
   * The map as the gate stores it (lib/map.js mapResume; task 4.14b): each photo beside a struck
   * beat freed, by itself in its section with its people, through the one helper that frees a
   * beat's photos (freePhotosBeside). So the map every later reader takes, the article writer's
   * among them, holds the photo where the director saw it, and the strike records no edit of
   * the photo's place. The same map when no photo sits beside a struck beat.
   *
   * @param {*} map
   * @returns {*}
   */
  function freeStruckBeatPhotos(map) {
    if (!isMapValue(map)) return map;
    var struck = [];
    map.sections.filter(isPlainObject).forEach(function (section) {
      (Array.isArray(section.photos) ? section.photos : []).forEach(function (photo) {
        var id = namedBeatOf(photo);
        if (id && isStruckBeat(map, id) && struck.indexOf(id) === -1) struck.push(id);
      });
    });
    if (struck.length === 0) return map;
    var next = deepClone(map);
    next.sections.filter(isPlainObject).forEach(function (section) {
      struck.forEach(function (id) { freePhotosBeside(section, id); });
    });
    return next;
  }

  /**
   * The reason the gate writes in the dropped list for a section the director emptied (task
   * 4.14b). The article writer and the map's rework read the dropped list, so it names the
   * director in the third person; the map's page says it in the director's own words
   * (checkpoint-view-logic.js mapView).
   */
  var EMPTIED_SECTION_REASON = 'The director emptied this section on the map.';

  /** Does a section hold nothing: no beat and no photo? */
  function holdsNothing(section) {
    return !(Array.isArray(section.beats) && section.beats.length > 0)
      && !(Array.isArray(section.photos) && section.photos.length > 0);
  }

  /**
   * The map as the gate stores it at approve and at send-back (lib/map.js mapResume; task
   * 4.14b), with each section the director emptied moved to the dropped list under
   * EMPTIED_SECTION_REASON: a section that holds no beat and no photo, where the map the stop
   * showed (`shown`, read through shownMapOf) held one in its section of that slot. The map has
   * no section delete, so a director who strikes or moves every beat out of a section has
   * dropped it, and the article writer gets no section with nothing to write. A section that
   * still holds a photo stays, since each kept photo is placed once (T13); a section the writer
   * left empty stays, since the director did not empty it; and a slot the dropped list already
   * names keeps its one entry. The same map when the director emptied none.
   *
   * @param {*} map - the map as the director left it
   * @param {*} shown - the map the stop showed
   * @returns {*}
   */
  function dropEmptiedSections(map, shown) {
    var was = shownMapOf(shown);
    if (!isMapValue(map) || !was) return map;
    var emptied = map.sections.filter(function (section) {
      if (!isPlainObject(section) || !holdsNothing(section)) return false;
      var before = sectionWithSlot(was, section.slot);
      return Boolean(before) && !holdsNothing(before);
    }).map(function (section) { return section.slot; });
    if (emptied.length === 0) return map;
    var next = deepClone(map);
    next.sections = next.sections.filter(function (section) {
      return !(isPlainObject(section) && emptied.indexOf(section.slot) !== -1 && holdsNothing(section));
    });
    if (!Array.isArray(next.dropped)) next.dropped = [];
    emptied.forEach(function (slot) {
      var listed = next.dropped.some(function (entry) { return isPlainObject(entry) && entry.slot === slot; });
      if (!listed) next.dropped.push({ slot: slot, reason: EMPTIED_SECTION_REASON });
    });
    return next;
  }

  /**
   * The map with each slot the director dropped held, as code stores an automatic pass on the
   * map once it has put back the director's other edits (lib/hand-edit-diff.js settleEdits; task
   * 4.14b, fix round 1; R11). A section the pass put back under a dropped slot goes again when it
   * holds nothing, by the rule the gate drops it by (holdsNothing, dropEmptiedSections), so the
   * director's dropped entry names the slot alone. One that holds a beat or a photo the pass put
   * there stays, since code takes out only what the director took out (and each kept photo stays
   * placed, T13), and the dropped list gives up the slot, so the map names each slot once; the
   * report records the section's cut as come back, for the stop to show. The same map when no
   * section fills a dropped slot, and anything that is no map as it was.
   *
   * @param {*} map - the pass's map, with the director's other edits put back
   * @param {string[]} slots - the slots the director dropped
   * @returns {*}
   */
  function holdDroppedSections(map, slots) {
    if (!isMapValue(map)) return map;
    var dropped = Array.isArray(slots) ? slots : [];
    var back = dropped.filter(function (slot) { return sectionWithSlot(map, slot) !== null; });
    if (back.length === 0) return map;
    var next = deepClone(map);
    back.forEach(function (slot) {
      next.sections = next.sections.filter(function (section) {
        return !(isPlainObject(section) && section.slot === slot && holdsNothing(section));
      });
      if (sectionWithSlot(next, slot) && Array.isArray(next.dropped)) {
        next.dropped = next.dropped.filter(function (entry) { return !(isPlainObject(entry) && entry.slot === slot); });
      }
    });
    return next;
  }

  /**
   * A beat moved into the section `toSlot`, from a section or from left out, at the place `index`
   * among that section's beats (0 its head), or at its foot when `index` is undefined or past the
   * last place (piece 4; R2: the order of a section's beats is the order the article tells them).
   * Within its own section, a beat with no place, or moved to the place it holds, leaves the map as
   * it was. A photo beside it goes with it, beside it still, so the photo stays with its moment:
   * from the beat's section, or, for a beat brought back from left out, from the section its strike
   * left the photo in, still naming the beat (strikeBeat; task 4.14b).
   */
  function moveBeat(map, id, toSlot, index) {
    var next = editedMap(map, 'moveBeat');
    var place = beatAt(next, id, 'moveBeat');
    var target = sectionAt(next, toSlot, 'moveBeat');
    var placed = typeof index === 'number' && isFinite(index);
    if (place.section === target && (!placed || Math.min(Math.max(0, Math.floor(index)), place.list.length - 1) === place.index)) return map;
    var beat = place.list.splice(place.index, 1)[0];
    if (!Array.isArray(target.beats)) target.beats = [];
    var at = placed ? Math.min(Math.max(0, Math.floor(index)), target.beats.length) : target.beats.length;
    target.beats.splice(at, 0, beat);
    var from = place.section ? [place.section] : next.sections.filter(isPlainObject);
    from.forEach(function (section) {
      if (section === target) return;
      var going = besideBeat(section, beatIdOf(beat));
      if (going.length === 0) return;
      section.photos = section.photos.filter(function (photo) { return going.indexOf(photo) === -1; });
      if (!Array.isArray(target.photos)) target.photos = [];
      target.photos.push.apply(target.photos, going);
    });
    return next;
  }

  /**
   * Move up (`delta` -1) or Move down (`delta` +1): a beat one place up or down within its section
   * (piece 4), through moveBeat. At the head or the foot of its section, and for a beat in left
   * out, whose order the article does not tell, the map is left as it was.
   */
  function moveBeatBy(map, id, delta) {
    var place = beatAt(editedMap(map, 'moveBeatBy'), id, 'moveBeatBy');
    if (!place.section) return map;
    var to = place.index + (delta < 0 ? -1 : 1);
    if (to < 0 || to >= place.list.length) return map;
    return moveBeat(map, id, place.section.slot, to);
  }

  /**
   * A beat struck: out of its section into the end of left out, whole, so one brought back is
   * the beat it was. A photo beside it stays placed in its section, and the strike frees it: no
   * photo is struck on the map, and a struck moment is out of the story, so the photo sits by
   * itself with its people, as every reader reads it (photoBeatOf) and the gate stores it
   * (freeStruckBeatPhotos). On the director's map it keeps the beat's name, so bringing the beat
   * back reattaches it (task 4.14b).
   */
  function strikeBeat(map, id) {
    var next = editedMap(map, 'strikeBeat');
    var place = beatAt(next, id, 'strikeBeat');
    if (!place.section) return map;
    var beat = place.list.splice(place.index, 1)[0];
    if (!Array.isArray(next.leftOut)) next.leftOut = [];
    next.leftOut.push(beat);
    return next;
  }

  /**
   * A beat brought back from left out, whole, into the section `toSlot` at the place `index`, or at
   * its foot with none (moveBeat; piece 4), with the photos its strike freed beside it again (task
   * 4.14b).
   */
  function bringBackBeat(map, id, toSlot, index) {
    if (beatAt(editedMap(map, 'bringBackBeat'), id, 'bringBackBeat').section) {
      throw new Error('bringBackBeat: ' + String(id) + ' is not in left out');
    }
    return moveBeat(map, id, toSlot, index);
  }

  /**
   * A beat the director adds to the end of the section `toSlot`: its move as typed and the
   * players it shows (typed with commas, or a list), `{id, move, players}` under an id no beat
   * holds. The director-side schema asks a beat added for its id and its move alone; the article
   * writer finds its evidence (spec 5.3). A blank move adds none.
   */
  function addBeat(map, toSlot, move, players) {
    if (typeof move !== 'string' || !move.trim()) return map;
    var next = editedMap(map, 'addBeat');
    var target = sectionAt(next, toSlot, 'addBeat');
    if (!Array.isArray(target.beats)) target.beats = [];
    var names = Array.isArray(players)
      ? players.filter(nonEmpty).map(function (name) { return name.trim(); })
      : splitCsv(players);
    target.beats.push({ id: freshBeatId(next), move: move, players: names });
    return next;
  }

  /**
   * A beat taken out of the map whole: the screen offers it for a beat the director added at
   * this look. A photo beside it stays in its section, by itself with its people, as one
   * beside a struck beat is read (task 4.6c), freed by the helper the gate frees a struck beat's
   * photos with (freePhotosBeside; tasks 4.6d and 4.14b). A beat taken out does not come back,
   * so its photo keeps no name.
   */
  function removeBeat(map, id) {
    var next = editedMap(map, 'removeBeat');
    var place = beatAt(next, id, 'removeBeat');
    var beat = place.list.splice(place.index, 1)[0];
    if (place.section) freePhotosBeside(place.section, beatIdOf(beat));
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

  /**
   * A photo put beside a beat of any section (piece 4; R10), in one op: from its place (`fromSlot`
   * a section, with the photo's `fromIndex` there, or MAP_TOP_PHOTO) into the section `toSlot`,
   * beside the beat `beatId` that section holds. A photo already in that section is set beside the
   * beat where it sits (setPhotoBeside); one from elsewhere goes to the foot of the section's
   * photos (movePhoto), so every photo stays placed once (T13), and the top photo moved this way
   * leaves the map with no top photo. A beat the section does not hold is refused, and the map is
   * left as it was.
   */
  function placePhotoBeside(map, fromSlot, fromIndex, toSlot, beatId) {
    var id = typeof beatId === 'string' ? beatId.trim() : '';
    var section = sectionAt(editedMap(map, 'placePhotoBeside'), toSlot, 'placePhotoBeside');
    var held = id !== '' && (Array.isArray(section.beats) ? section.beats : []).some(function (beat) { return beatIdOf(beat) === id; });
    if (!held) throw new Error('placePhotoBeside: the section ' + String(toSlot) + ' holds no beat ' + id);
    if (fromSlot === toSlot) return setPhotoBeside(map, toSlot, fromIndex, id);
    var next = movePhoto(map, fromSlot, fromIndex, toSlot);
    var photos = sectionAt(next, toSlot, 'placePhotoBeside').photos;
    photos[photos.length - 1].beat = id;
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
  // A beat (phase 4b, brief 1D; R1): a move with its people, its summary (its synopsis; piece 4),
  // the threads it carries, the connection that lands in it, its card marker, its kind and its
  // evidence, in the schema's key order (a test holds the two equal).
  var BEAT_KEYS = ['id', 'move', 'players', 'synopsis', 'threads', 'connection', 'card', 'kind', 'evidence'];
  // A beat the director added or brought back needs only these (R12).
  var BEAT_REQUIRED_KEYS = ['id', 'move'];
  var PHOTO_KEYS = ['filename', 'beat'];
  // A piece of a beat's evidence (lib/evidence.js EVIDENCE_PIECE_SCHEMA, which the browser
  // cannot import; a test holds each copy equal): the keys it needs, its stances, and the sources
  // it may name besides a document (EVIDENCE_SOURCES' values).
  var EVIDENCE_PIECE_REQUIRED = ['sources', 'shows', 'stance'];
  var EVIDENCE_PIECE_STANCES = ['supports', 'cuts-against'];
  var EVIDENCE_NAMED_SOURCES = ['ledger', 'evidence-log', 'notes'];

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

  function booleanAt(errors, path, value) {
    if (value !== undefined && typeof value !== 'boolean') errors.push({ path: path, message: 'must be true or false' });
  }

  /** A piece of a beat's evidence, as EVIDENCE_PIECE_SCHEMA holds it: any other key passes. */
  function validatePiece(errors, piece, path) {
    requiredKeys(errors, path, piece, EVIDENCE_PIECE_REQUIRED);
    stringList(errors, path + '/sources', piece.sources);
    if (Array.isArray(piece.sources) && piece.sources.length === 0) errors.push({ path: path + '/sources', message: 'must name at least one source' });
    stringAt(errors, path + '/shows', piece.shows);
    if (piece.stance !== undefined && EVIDENCE_PIECE_STANCES.indexOf(piece.stance) === -1) {
      errors.push({ path: path + '/stance', message: 'must be one of ' + EVIDENCE_PIECE_STANCES.join(', ') });
    }
    booleanAt(errors, path + '/card', piece.card);
  }

  function validateBeat(errors, beat, path) {
    onlyKeys(errors, path, beat, BEAT_KEYS);
    requiredKeys(errors, path, beat, BEAT_REQUIRED_KEYS);
    ['id', 'move', 'synopsis', 'connection'].forEach(function (k) { stringAt(errors, path + '/' + k, beat[k]); });
    if (beat.kind !== undefined && BEAT_KINDS.indexOf(beat.kind) === -1) {
      errors.push({ path: path + '/kind', message: 'must be one of ' + BEAT_KINDS.join(', ') });
    }
    stringList(errors, path + '/players', beat.players);
    stringList(errors, path + '/threads', beat.threads);
    booleanAt(errors, path + '/card', beat.card);
    objectList(errors, path + '/evidence', beat.evidence, function (piece, piecePath) { validatePiece(errors, piece, piecePath); });
  }

  /**
   * The repeats the director's changes made, by the gate's rule for repeats: a key the map
   * repeats that the map the stop showed does not, both as mapRepeats reads them. Each comes
   * with the placement to name: the first one in a place where the map shown does not hold the
   * key, else the last.
   *
   * @param {string[]} repeated - the map's repeats, of one kind
   * @param {string[]} shownRepeated - the map shown's: the writer's
   * @param {Array<{at: string, path: string}>} placements - the map's (mapBeatPlacements or mapPhotoPlacements)
   * @param {Array<{at: string}>} shownPlacements - the map shown's
   * @param {function(Object): string} keyOf - the key a placement is read under
   * @returns {Array<Object>} one placement for each repeat the director made
   */
  function directorsRepeats(repeated, shownRepeated, placements, shownPlacements, keyOf) {
    return repeated.filter(function (key) { return shownRepeated.indexOf(key) === -1; }).map(function (key) {
      var mine = placements.filter(function (placement) { return keyOf(placement) === key; });
      var shownPlaces = shownPlacements.filter(function (placement) { return keyOf(placement) === key; }).map(function (placement) { return placement.at; });
      return mine.filter(function (placement) { return shownPlaces.indexOf(placement.at) === -1; })[0] || mine[mine.length - 1];
    });
  }

  /**
   * The top photo, when it is a photo the director left out of the article and their changes put
   * it at the top (task 4.14b): the map the stop showed (`shown`, read through shownMapOf) has
   * another top photo, or none. The article reads the map without such a photo (ai-nodes.js
   * articleMapOf), so it would print no top photo: the gate refuses it (lib/map.js
   * directorMapProblems), and the console's gate with it (validateMapShape). A left-out top photo
   * the map shown holds is no change of the director's. '' for any other map.
   *
   * @param {*} map
   * @param {*} shown - the map the stop showed
   * @param {string[]} leftOut - the filenames of the photos the director left out
   * @returns {string} the top photo's filename, or ''
   */
  function leftOutTopPhoto(map, shown, leftOut) {
    var top = isPlainObject(map) && typeof map.topPhoto === 'string' ? map.topPhoto.trim() : '';
    if (!top) return '';
    var keys = (Array.isArray(leftOut) ? leftOut : []).filter(nonEmpty).map(photoKey);
    if (keys.indexOf(photoKey(top)) === -1) return '';
    var was = shownMapOf(shown);
    var shownTop = was && typeof was.topPhoto === 'string' ? was.topPhoto.trim() : '';
    return shownTop && photoKey(shownTop) === photoKey(top) ? '' : top;
  }

  /**
   * The map's client gate: the decisions the gate makes (lib/map.js directorMapProblems), so a
   * map the server would refuse is caught before the POST, and a map it accepts passes:
   * - the director-side schema's checks. With `slots` (the stop's `mapSlots`, as keys or as
   *   `{key}`), a section's slot and a dropped slot must be one of them;
   * - a beat id the director's changes repeat: the edits find a beat by its id. A repeat the
   *   map the stop showed (`shown`) holds is the writer's, which the map checks report;
   * - a photo the director's changes place more than once (4.6b's rule, the same reading of a
   *   repeat): each kept photo is placed once (T13);
   * - a top photo the director left out of the article that their changes put at the top
   *   (leftOutTopPhoto; task 4.14b), given the photos left out (`leftOut`, the stop's
   *   `leftOutPhotos`).
   * mapRepeats reads both maps' repeats: the rule by which the map on screen locks the writer's.
   * The map shown is read as the gate reads it (shownMapOf; task 4.6e).
   *
   * @param {*} map
   * @param {Object} [options]
   * @param {Array} [options.slots]
   * @param {*} [options.shown] - the map the stop showed; without it, or with a value that is no map, every repeat is the director's
   * @param {string[]} [options.leftOut] - the filenames of the photos the director left out
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
    var shown = shownMapOf(opts.shown);
    var repeats = mapRepeats(map);
    var writers = mapRepeats(shown);
    directorsRepeats(repeats.beatIds, writers.beatIds, mapBeatPlacements(map), mapBeatPlacements(shown), beatPlacementKey)
      .forEach(function (placement) {
        errors.push({ path: placement.path, message: 'shares its id with another beat: your changes made this repeat. Give each beat an id of its own.' });
      });
    directorsRepeats(repeats.photoKeys, writers.photoKeys, mapPhotoPlacements(map), mapPhotoPlacements(shown), photoPlacementKey)
      .forEach(function (placement) {
        errors.push({ path: placement.path, message: 'places ' + placement.filename + ' a second time: your changes made this repeat. Place each photo once.' });
      });
    var leftOutTop = leftOutTopPhoto(map, shown, opts.leftOut);
    if (leftOutTop) {
      errors.push({ path: '/topPhoto', message: 'is ' + leftOutTop + ', a photo you left out of the article, so it would not print. Move another photo to the top.' });
    }
    return { valid: errors.length === 0, errors: errors };
  }

  /**
   * The outline stop's client gate, by its old name: the map's gate. The outline stage's
   * detective branch went with it (R1).
   *
   * @param {*} outline - the map
   * @param {string} [theme] - unused: every theme's map has one shape
   * @param {Array} [slots] - the stop's mapSlots
   * @param {*} [shown] - the map the stop showed, whose repeats are the writer's; a value that is
   *   no map is read as none (shownMapOf, task 4.6e)
   * @param {string[]} [leftOut] - the photos the director left out, the stop's leftOutPhotos (task 4.14b)
   */
  function validateOutlineShape(outline, theme, slots, shown, leftOut) {
    return validateMapShape(outline, { slots: slots, shown: shown, leftOut: leftOut });
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

  // ── (K) THE MAP'S READERS, AND EVERYONE AND THE COUNTS (phase 4, brief 4.6) ──
  //
  // How the map is read: whether a value is a map, a beat's id and card, where the map places
  // each beat and photo, and what it repeats. The client gate, the moves and the map on screen
  // (checkpoint-view-logic.js, task 4.9) take each of these from here, so the lines the page
  // locks sit under exactly the repeats the client gate takes as the writer's.
  //
  // The counts (who is placed, the cards and the photos) are built by one function from the beats, so the map
  // on screen as the director edits it (task 4.9) and the map checks (lib/map.js) count alike,
  // on the roster and the kept photos the stop's payload carries (task 4.6d: the payload sends
  // no count of its own). A name in a beat counts for the roster member it names.

  /** Is `value` a story map: an object with a list of sections? */
  function isMapValue(value) {
    return isPlainObject(value) && Array.isArray(value.sections);
  }

  /**
   * The map the stop showed, as the client gate (validateMapShape) and the server's
   * (lib/map.js directorMapProblems) both read it: the value when it is a map (isMapValue),
   * else null. A value that is no map is no map shown, so every repeat in the director's map
   * is theirs (task 4.6e).
   *
   * @param {*} shown
   * @returns {Object|null}
   */
  function shownMapOf(shown) {
    return isMapValue(shown) ? shown : null;
  }

  /**
   * A beat's id as every reader and move on the map reads it: its text trimmed, or '' for a
   * beat with no string id (the director-side schema requires one).
   */
  function beatIdOf(beat) {
    return isPlainObject(beat) && typeof beat.id === 'string' ? beat.id.trim() : '';
  }

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
   * The pieces of a beat's evidence flagged as its card's document (`card: true`), in order
   * (phase 4b, brief 1D; R4). A beat marked as a card flags one.
   */
  function cardPiecesOf(beat) {
    var evidence = isPlainObject(beat) && Array.isArray(beat.evidence) ? beat.evidence : [];
    return evidence.filter(function (piece) { return isPlainObject(piece) && piece.card === true; });
  }

  /**
   * The document a beat prints as a card, or null (phase 4b, brief 1D; R4): on a beat marked as a
   * card (`card: true`), the source of its first flagged piece (cardPiecesOf) that is a document,
   * trimmed: the first that is none of EVIDENCE_NAMED_SOURCES, since a piece that sets the ledger
   * beside a document cites both and prints the document. Null for a beat with no marker, one that
   * flags no piece, and a piece that names no document. The one reader of a beat's card: the
   * counts (mapTally), the map checks (lib/map.js) and the article writer's inline card line.
   *
   * @param {*} beat
   * @returns {string|null}
   */
  function beatCardOf(beat) {
    if (!isPlainObject(beat) || beat.card !== true) return null;
    var flagged = cardPiecesOf(beat)[0];
    if (!flagged) return null;
    var sources = (Array.isArray(flagged.sources) ? flagged.sources : [])
      .filter(function (source) { return typeof source === 'string' && source.trim(); })
      .map(function (source) { return source.trim(); });
    var document = sources.filter(function (source) { return EVIDENCE_NAMED_SOURCES.indexOf(source.toLowerCase()) === -1; })[0];
    return document || null;
  }

  /**
   * Where the map places each photo, in order: the top photo first (`at: 'topPhoto'`),
   * then each section's photos (`at`: the section's slot). A photo placed twice is listed
   * twice. `path` is the place as the client gate's paths name it (`/topPhoto`,
   * `/sections/1/photos/0`). A photo with no filename is not listed.
   *
   * @param {*} map
   * @returns {Array<{filename: string, at: string, path: string}>}
   */
  function mapPhotoPlacements(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    if (typeof map.topPhoto === 'string' && map.topPhoto.trim()) out.push({ filename: map.topPhoto, at: MAP_TOP_PHOTO, path: '/topPhoto' });
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section, s) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.photos) ? section.photos : []).forEach(function (photo, p) {
        if (isPlainObject(photo) && typeof photo.filename === 'string' && photo.filename.trim()) {
          out.push({ filename: photo.filename, at: section.slot, path: '/sections/' + s + '/photos/' + p });
        }
      });
    });
    return out;
  }

  /**
   * Where the map places each beat, in order: the sections' beats (`at`: the section's slot),
   * then left out's (`at: 'leftOut'`), each under its id (beatIdOf). `path` is the place as the
   * client gate's paths name it (`/sections/1/beats/0`, `/leftOut/0`). A beat with no id, which
   * no edit can find, is not listed.
   *
   * @param {*} map
   * @returns {Array<{id: string, at: string, path: string}>}
   */
  function mapBeatPlacements(map) {
    var out = [];
    if (!isPlainObject(map)) return out;
    (Array.isArray(map.sections) ? map.sections : []).forEach(function (section, s) {
      if (!isPlainObject(section)) return;
      (Array.isArray(section.beats) ? section.beats : []).forEach(function (beat, b) {
        var id = beatIdOf(beat);
        if (id) out.push({ id: id, at: section.slot, path: '/sections/' + s + '/beats/' + b });
      });
    });
    (Array.isArray(map.leftOut) ? map.leftOut : []).forEach(function (beat, b) {
      var id = beatIdOf(beat);
      if (id) out.push({ id: id, at: 'leftOut', path: '/leftOut/' + b });
    });
    return out;
  }

  /** The key a beat's placement is read under: its id. */
  function beatPlacementKey(placement) {
    return placement.id;
  }

  /** The key a photo's placement is read under: its join key (photoKey). */
  function photoPlacementKey(placement) {
    return photoKey(placement.filename);
  }

  /** The keys a list holds more than once, each once, in the order of its first place. */
  function repeatedKeys(keys) {
    var counts = new Map();
    keys.forEach(function (key) { counts.set(key, (counts.get(key) || 0) + 1); });
    var repeated = [];
    counts.forEach(function (count, key) { if (count > 1) repeated.push(key); });
    return repeated;
  }

  /**
   * What a map repeats: each beat id more than one of its beats carries, in the sections and
   * in left out, and each photo it places more than once, the top photo included, by its join
   * key; each once, in the order of its first place. No edit can find a beat or a photo by a
   * repeated key, so a repeat in the map the stop showed is the writer's: the client gate takes
   * it (validateMapShape), and the map on screen turns off the controls of the lines under it
   * (checkpoint-view-logic.js mapView). The gate decides repeats alike (lib/map.js
   * directorMapProblems; a test holds the decisions equal).
   *
   * @param {*} map
   * @returns {{beatIds: string[], photoKeys: string[]}}
   */
  function mapRepeats(map) {
    return {
      beatIds: repeatedKeys(mapBeatPlacements(map).map(beatPlacementKey)),
      photoKeys: repeatedKeys(mapPhotoPlacements(map).map(photoPlacementKey))
    };
  }

  /**
   * The counts (spec 2026-10-07 section 4), which the map's page prints, and what they are built
   * from: where each roster player appears, each under the first section whose beat shows them
   * (`everyone`, which the page no longer prints); the roster players in no section's beat
   * (`unplaced`), in roster order, and those the gap note raises (`raised`); the cards in the
   * sections; and how many of the photos kept for the article the map places, the top photo
   * included. A left-out beat places no one and carries no card. A roster name counts
   * whatever it is, one every object carries (constructor) included (task 4.6c).
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
    var seen = new Set();
    var cards = 0;
    (isPlainObject(map) && Array.isArray(map.sections) ? map.sections : []).forEach(function (section) {
      if (!isPlainObject(section)) return;
      var players = [];
      (Array.isArray(section.beats) ? section.beats : []).forEach(function (beat) {
        if (!isPlainObject(beat)) return;
        if (beatCardOf(beat)) cards += 1;
        (Array.isArray(beat.players) ? beat.players : []).forEach(function (name) {
          var member = rosterMemberOf(name, roster);
          if (member && !seen.has(member)) {
            seen.add(member);
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
      unplaced: names.filter(function (name) { return !seen.has(name); }),
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
    beatWithId: beatWithId,
    // Task 4.6c: the section a section's editor opens on, as the editors and moves find it
    sectionWithSlot: sectionWithSlot,
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
    moveBeatBy: moveBeatBy,
    strikeBeat: strikeBeat,
    bringBackBeat: bringBackBeat,
    addBeat: addBeat,
    removeBeat: removeBeat,
    movePhoto: movePhoto,
    setPhotoBeside: setPhotoBeside,
    placePhotoBeside: placePhotoBeside,
    // Task 4.14b: a struck beat's photos, read as by itself and stored so; the sections the
    // director emptied, dropped; and a left-out photo the director put at the top
    isStruckBeat: isStruckBeat,
    photoBeatOf: photoBeatOf,
    freeStruckBeatPhotos: freeStruckBeatPhotos,
    EMPTIED_SECTION_REASON: EMPTIED_SECTION_REASON,
    dropEmptiedSections: dropEmptiedSections,
    holdDroppedSections: holdDroppedSections,
    leftOutTopPhoto: leftOutTopPhoto,

    validateOutlineShape: validateOutlineShape,
    validateMapShape: validateMapShape,
    validateBundleShape: validateBundleShape,
    CONTENT_BLOCK_TYPES: CONTENT_BLOCK_TYPES,
    MAP_ROOT_KEYS: MAP_ROOT_KEYS,
    BEAT_KINDS: BEAT_KINDS,
    // Phase 4b (brief 1D): the gate's copy of a beat's shape and of a piece's, which tests hold
    // to the director-side schema and to lib/evidence.js
    BEAT_KEYS: BEAT_KEYS,
    BEAT_REQUIRED_KEYS: BEAT_REQUIRED_KEYS,
    EVIDENCE_PIECE_REQUIRED: EVIDENCE_PIECE_REQUIRED,
    EVIDENCE_PIECE_STANCES: EVIDENCE_PIECE_STANCES,
    EVIDENCE_NAMED_SOURCES: EVIDENCE_NAMED_SOURCES,

    // Phase 4 (brief 4.6): the counts, one function from the beats
    rosterMemberOf: rosterMemberOf,
    photoKey: photoKey,
    beatCardOf: beatCardOf,
    cardPiecesOf: cardPiecesOf,
    mapPhotoPlacements: mapPhotoPlacements,
    mapTally: mapTally,

    // Task 4.9: the map's readers, which the client gate, the moves and the map on screen share
    isMapValue: isMapValue,
    beatIdOf: beatIdOf,
    mapBeatPlacements: mapBeatPlacements,
    mapRepeats: mapRepeats,
    // Task 4.6e: the map the stop showed, as the client gate and the server's read it
    shownMapOf: shownMapOf
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.outlineEditLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
