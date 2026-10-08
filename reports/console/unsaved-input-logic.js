/**
 * unsaved-input-logic.js — PURE logic for input the director has typed at a stop and not saved
 * (phase 4, tasks 4.14d and 4.14g: input that lands, and no control drops it).
 *
 * Dual-export: registers on window.Console.unsavedInputLogic for the browser AND exposes the same
 * surface via module.exports under Node, so it is unit-tested in node-env Jest
 * (console/__tests__/unsaved-input-logic.test.js; reports/CLAUDE.md: the console has no DOM harness).
 *
 * Nothing the director types is lost by any click. The actions send what the stop holds: the weave,
 * the map or the bundle on the desk, and the note box. Text typed in an editor the director has not
 * saved, or in an add line whose button they have not pressed, is in none of them, and the final
 * review saw each screen drop it without a word (screens 1): at the desk, Approve published the
 * writer's paragraph over the director's open edit; on the map, a headline typed in its open editor
 * never reached the map the article writer reads; at the story meeting, a thread typed in the add
 * line was missing from the approved weave. So while a stop has such input its actions wait
 * (Approve, Reweave, Send back, and the desk's JSON Save & Approve), and one line beside the buttons
 * names each unsaved piece and says to save or discard it first.
 *
 * Other controls dropped it the same way (task 4.14g; the review of 4.14d, minor 4). At the desk the
 * pencil on another piece opened its editor in place of the open one, and a move, a delete or an
 * insert put a new bundle on the desk, which closed it (Article.js applyDesk). On the map another
 * line's pencil replaced the open editor, and "+ Add a move" in another section reset an add line
 * holding a typed move. So every control that would close or replace an editor or an add line
 * holding input waits for it as the actions do, and its line names the unsaved piece. On the board
 * (piece 4, R9) selecting something else and every control on the selected card wait the same way,
 * so nothing typed is dropped while the director works the board.
 *
 * The desk sends two things (fix round 1). Approve and Send back send the bundle on the desk, so JSON
 * the director typed in the JSON editor holds them too: only that editor's own Save & Approve sends
 * it, and the review saw Approve drop it without a word. Save & Approve sends the JSON, so it waits
 * for what the JSON leaves out: an open editor's form, and every change made on the desk after the
 * JSON editor took its text from it. The review saved a block edit, as the line asked, and Save &
 * Approve then sent the JSON from before the save. With an editor open too, its line names every
 * step that releases it, in order (task 4.14g): a save changes the desk, so after one the JSON
 * editor takes the desk's text again, and a cancel changes nothing.
 *
 * unsavedInputLine(stop, open, control) is the one rule. Each stop's component asks it once per
 * render for each set of buttons that sends one thing, and for each kind of control that would close
 * or replace what it has open, with what it has open, and gets back the line for those buttons or
 * that control, or null when nothing waits:
 *   - 'article', the desk's Approve and Send back: { editor, bundle, json, deskVersion }. `editor` is
 *     Article.js's editingBlock: an open editor holds the actions whatever it holds, since the desk
 *     cannot see an editor's form. `deskVersion` is Article.js's count of the changes on the desk.
 *     `json` is the JSON editor while it is open, { text, seed, seededAt }: the text it holds, the
 *     text it opened with, and the desk's count when it opened. The text differs from the seed once
 *     the director types, and the count moves once the desk changes after the editor opened. `json`
 *     is null while the editor is closed, since the editor takes the desk's text again when it opens.
 *   - 'article-json', the JSON editor's Save & Approve: the desk's { editor, bundle, json, deskVersion }.
 *   - 'outline', the map: { editor, adding, sections }. `editor` is Outline.js's editing, an open
 *     editor; `adding` its add line, `{slot, move, players}`, which holds the actions once its move
 *     or its players hold text; `sections` the page's sections as mapView lists them, whose labels
 *     name a section and whose beats' moves name a move (phase 4b, brief 1F).
 *   - 'arc-selection', the story meeting: { addLine }, the add-a-thread line's text, which holds
 *     the actions once it holds text. Every other change at the meeting (a pick, a flip, a line
 *     rewritten, an answer) is kept as the director makes it.
 * `control`, when given, is a kind of control at the desk or on the map (CONTROLS below); without it,
 * the rule answers for the stop's actions. An editor this module cannot name still holds them: a new
 * kind of editor is named generically, never dropped. The line names a stop's actions from the list
 * its payload builder takes (checkpoint-view-logic.js MEETING_ACTIONS, MAP_ACTIONS and DESK_ACTIONS),
 * and a desk section as the desk's move control names it (article-desk-logic.js sectionLabel).
 *
 * MUST NOT reference React, and must not touch `window` at module-evaluation time except the
 * guarded window.Console write.
 */
(function () {
  'use strict';

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function asString(value) {
    return typeof value === 'string' ? value : '';
  }

  /** Whether a line the director types in holds anything but whitespace. */
  function holdsText(value) {
    return asString(value).trim() !== '';
  }

  function quoted(text) {
    return '"' + text + '"';
  }

  /** Words joined as a list is read: "a", "a or b", "a, b or c". */
  function listOf(words) {
    return words.length > 1 ? words.slice(0, -1).join(', ') + ' or ' + words[words.length - 1] : words.join('');
  }

  /** What the line asks of an open editor it cannot name. */
  var UNNAMED_EDITOR = 'save or cancel the edit you have open';

  /** An open editor's instruction: its two buttons, Save and Cancel, and what it edits. */
  function saveOrCancel(name) {
    return name ? 'save or cancel your edit to ' + name : UNNAMED_EDITOR;
  }

  // ── The actions that wait ─────────────────────────────────────────────────

  /**
   * console/checkpoint-view-logic.js, whose MEETING_ACTIONS, MAP_ACTIONS and DESK_ACTIONS are the
   * meeting's, the map's and the desk's actions as their payload builders take them, read when a
   * line is asked for: the stops load it before they render.
   */
  function viewLogic() {
    var view = (typeof window !== 'undefined' && window.Console && window.Console.checkpointViewLogic)
      || (typeof require === 'function' ? require('./checkpoint-view-logic') : null);
    if (!view || !Array.isArray(view.MEETING_ACTIONS) || !Array.isArray(view.MAP_ACTIONS) || !Array.isArray(view.DESK_ACTIONS)) {
      throw new Error('unsaved-input-logic: the meeting\'s, the map\'s and the desk\'s actions are console/checkpoint-view-logic.js\'s, which is not loaded');
    }
    return view;
  }

  /**
   * Each stop's actions, by their ids. The JSON editor's Save & Approve is one of the desk's: an
   * approve that sends the JSON (articleReviewPayload takes it as one).
   */
  var ACTIONS = {
    'arc-selection': function () { return viewLogic().MEETING_ACTIONS; },
    outline: function () { return viewLogic().MAP_ACTIONS; },
    article: function () { return viewLogic().DESK_ACTIONS; },
    'article-json': function () { return ['approve']; }
  };

  /** The word the line gives each action, by its id. */
  var ACTION_WORDS = { approve: 'approve', reweave: 'reweave', 'send-back': 'send back' };

  /** The actions that wait at a stop, in the line's words, joined as a list is read: "approve, reweave or send back". */
  function actionsAt(stop) {
    return listOf(ACTIONS[stop]().map(function (id) {
      if (!Object.prototype.hasOwnProperty.call(ACTION_WORDS, id)) {
        throw new Error('unsavedInputLine: the ' + stop + ' stop takes ' + String(id) + ', which the line has no word for');
      }
      return ACTION_WORDS[id];
    }));
  }

  // ── The desk ──────────────────────────────────────────────────────────────

  /**
   * console/article-desk-logic.js, which names a section as the desk's move control names it
   * (sectionLabel), read when a line is asked for: Article.js loads both before it renders.
   */
  function deskLogic() {
    var desk = (typeof window !== 'undefined' && window.Console && window.Console.articleDeskLogic)
      || (typeof require === 'function' ? require('./article-desk-logic') : null);
    if (!desk || typeof desk.sectionLabel !== 'function') {
      throw new Error('unsaved-input-logic: the desk names a section through console/article-desk-logic.js, which is not loaded');
    }
    return desk;
  }

  /** What each kind of block is called. */
  var BLOCK_WORDS = {
    paragraph: 'the paragraph',
    quote: 'the quote',
    'evidence-card': 'the evidence card',
    'evidence-reference': 'the evidence reference',
    photo: 'the photo',
    list: 'the list'
  };

  function sectionAt(bundle, index) {
    var sections = isPlainObject(bundle) && Array.isArray(bundle.sections) ? bundle.sections : [];
    return sections[index];
  }

  /** A desk section as the desk's move control names it: its heading, else its id. */
  function deskSectionName(bundle, index) {
    return quoted(deskLogic().sectionLabel(sectionAt(bundle, index), index));
  }

  function itemAt(list, index) {
    return Array.isArray(list) && isPlainObject(list[index]) ? list[index] : null;
  }

  /** What an open desk editor edits (Article.js's editingBlock), or '' for one it cannot name. */
  function deskEditorName(editor, bundle) {
    var b = isPlainObject(bundle) ? bundle : {};
    if (editor.type === 'headline') return 'the headline';
    if (editor.type === 'heading') return 'the heading of ' + deskSectionName(b, editor.sectionIdx);
    if (editor.type === 'block') {
      var section = sectionAt(b, editor.sectionIdx);
      var block = itemAt(isPlainObject(section) ? section.content : null, editor.blockIdx);
      var kind = block && Object.prototype.hasOwnProperty.call(BLOCK_WORDS, block.type) ? BLOCK_WORDS[block.type] : 'the block';
      return kind + ' in ' + deskSectionName(b, editor.sectionIdx);
    }
    if (editor.type !== 'sidebar') return '';
    var position = (Number(editor.idx) || 0) + 1;
    if (editor.category === 'evidenceCards') {
      var card = itemAt(b.evidenceCards, editor.idx);
      return card && holdsText(card.headline) ? 'the Evidence Cards entry ' + quoted(card.headline.trim()) : 'Evidence Cards entry ' + position;
    }
    if (editor.category === 'financialEntry') {
      var entry = itemAt(isPlainObject(b.financialTracker) ? b.financialTracker.entries : null, editor.idx);
      return entry && holdsText(entry.description) ? 'the financial tracker row ' + quoted(entry.description.trim()) : 'row ' + position + ' of the financial tracker';
    }
    if (editor.category === 'heroImage') return 'the hero image caption';
    if (editor.category === 'byline') return 'the byline';
    return '';
  }

  /** An open editor's instruction, which every button at the desk takes: no payload holds its form. */
  function deskEditorInstructions(open) {
    if (!isPlainObject(open.editor)) return [];
    return [saveOrCancel(deskEditorName(open.editor, open.bundle))];
  }

  /**
   * The desk's JSON editor while it is open, as { typed, behind }, or null while it is closed.
   * `typed`: its text differs from the text it opened with. `behind`: the desk's count of changes
   * has moved since it opened, so its text lacks those changes.
   */
  function deskJson(open) {
    var json = open.json;
    if (json === undefined || json === null) return null;
    if (!isPlainObject(json) || typeof json.text !== 'string' || typeof json.seed !== 'string') {
      throw new Error('unsavedInputLine: the desk\'s open JSON editor must say the text it holds and the text it opened with ({ text, seed })');
    }
    if (typeof json.seededAt !== 'number' || typeof open.deskVersion !== 'number') {
      throw new Error('unsavedInputLine: the desk\'s open JSON editor must say the desk\'s count of changes when it opened (json.seededAt), and the desk its count now (deskVersion)');
    }
    return { typed: json.text !== json.seed, behind: json.seededAt !== open.deskVersion };
  }

  /**
   * What the row's line asks of JSON the director typed in the JSON editor, which Approve and Send
   * back would leave behind: discard it by closing the editor, or send it with the editor's own Save
   * & Approve. Once the desk has changed since the editor opened, Save & Approve would drop that
   * change, so closing is the one way on.
   */
  var JSON_TYPED = 'close the JSON editor to discard what you typed in it, or send what you typed with Save & Approve';
  var JSON_TYPED_BEHIND = 'close the JSON editor to discard what you typed in it';

  /**
   * What Save & Approve's line asks once the desk has changed since the JSON editor took its text:
   * closed and opened again, the editor takes the desk's text, and closing it discards anything typed
   * in it.
   */
  var JSON_BEHIND = 'close the JSON editor and open it again so it holds your latest changes on the desk';
  var JSON_BEHIND_TYPED = 'close the JSON editor, which discards what you typed in it, and open it again so it holds your latest changes on the desk';

  /** Approve and Send back send the bundle on the desk: neither an open editor's form nor typed JSON is in it. */
  function deskInstructions(open) {
    var instructions = deskEditorInstructions(open);
    var json = deskJson(open);
    if (json && json.typed) instructions.push(json.behind ? JSON_TYPED_BEHIND : JSON_TYPED);
    return instructions;
  }

  /**
   * The JSON editor's Save & Approve sends the JSON typed there: neither an open editor's form nor a
   * change made on the desk after the editor opened is in it.
   *
   * With an editor open too, the one instruction names every step that releases it, in order (task
   * 4.14g): a save puts the edit on the desk, after which the JSON editor must take the desk's text
   * again; a cancel leaves the desk as it is, so it releases Save & Approve on its own while the desk
   * is as the JSON editor took it, and with JSON typed, Save & Approve then sends what was typed.
   */
  function jsonEditorInstructions(open) {
    var json = deskJson(open);
    var reopen = json && json.typed ? JSON_BEHIND_TYPED : JSON_BEHIND;
    if (json && isPlainObject(open.editor)) {
      var name = deskEditorName(open.editor, open.bundle);
      var edit = name ? 'your edit to ' + name : 'the edit you have open';
      return [json.behind
        ? 'save or cancel ' + edit + ', then ' + reopen
        : 'cancel ' + edit + ', or save it and then ' + reopen];
    }
    var instructions = deskEditorInstructions(open);
    if (json && json.behind) instructions.push(reopen);
    return instructions;
  }

  // ── The map ───────────────────────────────────────────────────────────────

  /** A map section by the label the page heads it with, else by its slot. */
  function mapSectionName(sections, slot) {
    var found = (Array.isArray(sections) ? sections : []).filter(function (section) {
      return isPlainObject(section) && section.slot === slot;
    })[0];
    return quoted(found && holdsText(found.label) ? found.label : asString(slot));
  }

  /**
   * A beat as the line names its open editor: by its move's words, found by its id among the
   * beats of the page's sections, since the page shows no tag (phase 4b, brief 1F; spec 9), or
   * '' for a beat it cannot find or one with no words.
   */
  function mapBeatName(sections, id) {
    var beat = (Array.isArray(sections) ? sections : []).reduce(function (found, section) {
      if (found || !isPlainObject(section) || !Array.isArray(section.beats)) return found;
      return section.beats.filter(function (b) { return isPlainObject(b) && b.id === id; })[0] || null;
    }, null);
    return beat && holdsText(beat.move) ? 'the move ' + quoted(beat.move.trim()) : '';
  }

  /** What an open map editor edits (Outline.js's editing), or '' for one it cannot name. */
  function mapEditorName(editor, sections) {
    if (editor.line === 'head') return 'the headline and deck';
    if (editor.line === 'gapNote') return 'the gap note';
    if (editor.line === 'section') return 'the heading and job of ' + mapSectionName(sections, editor.key);
    if (editor.line === 'beat') return holdsText(editor.key) ? mapBeatName(sections, editor.key) : '';
    if (editor.line === 'length') return 'the expected length';
    return '';
  }

  /** An open map editor's instruction. */
  function mapEditorInstructions(open) {
    return isPlainObject(open.editor) ? [saveOrCancel(mapEditorName(open.editor, open.sections))] : [];
  }

  /** The add line's instruction once it holds text, its move or its players: its two buttons, Add the move and Cancel. */
  function mapAddLineInstructions(open) {
    var adding = open.adding;
    if (!isPlainObject(adding) || !(holdsText(adding.move) || holdsText(adding.players))) return [];
    return ['add or cancel the new move in ' + mapSectionName(open.sections, adding.slot)];
  }

  function mapInstructions(open) {
    return mapEditorInstructions(open).concat(mapAddLineInstructions(open));
  }

  // ── The story meeting ─────────────────────────────────────────────────────

  function meetingInstructions(open) {
    // The add line's button, Add a thread; clearing the line discards it.
    return holdsText(open.addLine) ? ['add or clear the new thread you typed'] : [];
  }

  var INSTRUCTIONS = {
    'arc-selection': meetingInstructions,
    outline: mapInstructions,
    article: deskInstructions,
    'article-json': jsonEditorInstructions
  };

  // ── The controls that wait (task 4.14g) ───────────────────────────────────

  /**
   * The controls besides a stop's actions that would close or replace what the director has open,
   * grouped by the piece that holds them: each group's `controls` are the kinds a component asks
   * about, named by their verbs, which the line joins before the group's `object` ("Before you edit,
   * move, delete or insert anything else, ..."), and `instructions` is that piece's instruction while
   * it holds input.
   * - The desk: a pencil opens its editor in place of the open one, and a move, a delete or an insert
   *   puts a new bundle on the desk, which closes the open editor (Article.js applyDesk). None of them
   *   closes the JSON editor, so JSON typed there holds none of them.
   * - The map: a pencil opens its editor in place of the open one, and "+ Add a move" opens the add
   *   line in its section in place of the open one. Neither closes what the other holds. Selecting
   *   something else on the board, and every control on the selected card ('move': Move up, Move
   *   down, Move to another section, Put a photo beside it, Leave it out, Take it out, Bring it back,
   *   and a selected photo's places), wait for both, an open editor and a typed add line (R9), so
   *   the director saves or discards what they typed before the board changes under it. A drag waits
   *   for nothing: an editor is keyed by its line, and a card whose editor is open does not drag.
   * The story meeting has none: no control there closes or replaces its add line. Its other
   * controls (an angle's card, a flip, a line rewritten in place) change the weave as the director
   * acts, and an angle's card leaves the add line as typed, so a thread added after a pick goes into
   * the angle then open (spec 2026-10-06 section 6).
   */
  var CONTROLS = {
    article: [
      { controls: ['edit', 'move', 'delete', 'insert'], object: 'anything else', instructions: deskEditorInstructions }
    ],
    outline: [
      { controls: ['edit'], object: 'another line', instructions: mapEditorInstructions },
      { controls: ['add'], object: 'a move in another section', instructions: mapAddLineInstructions },
      { controls: ['select', 'move'], object: 'anything else', instructions: mapInstructions }
    ]
  };

  /** The group of controls a control belongs to at a stop, refusing a control the stop does not have. */
  function controlGroup(stop, control) {
    if (!Object.prototype.hasOwnProperty.call(CONTROLS, stop)) {
      throw new Error('unsavedInputLine: the ' + stop + ' stop has no control that closes or replaces what the director has open; ask it about its actions');
    }
    var group = CONTROLS[stop].filter(function (g) { return g.controls.indexOf(control) !== -1; })[0];
    if (!group) {
      var kinds = CONTROLS[stop].reduce(function (all, g) { return all.concat(g.controls); }, []);
      throw new Error('unsavedInputLine: the ' + stop + ' stop has no control ' + String(control) + '; its controls are ' + listOf(kinds));
    }
    return group;
  }

  /**
   * The line: "Before you <what waits>, <instruction>." or, for more than one, "...: <a>; <b>." Null
   * for none, without asking what waits.
   */
  function lineOf(instructions, waiting) {
    if (instructions.length === 0) return null;
    var before = 'Before you ' + waiting();
    if (instructions.length === 1) return before + ', ' + instructions[0] + '.';
    return before + ': ' + instructions.join('; ') + '.';
  }

  /**
   * The line beside a stop's buttons, or beside a control, while it holds input the director has not
   * saved, or null when nothing waits, so the buttons and the controls behave as they always have.
   * The line names each unsaved piece and says to save or discard it first: "Before you approve or
   * send back, save or cancel your edit to the paragraph in "The Story"."
   *
   * @param {string} stop - 'arc-selection', 'outline', 'article', or 'article-json' for the desk's
   *   JSON editor
   * @param {Object} open - what the stop has open (see the header)
   * @param {string} [control] - a kind of control at the desk ('edit', 'move', 'delete', 'insert')
   *   or on the map ('edit', 'add', 'select', 'move'); omitted, the stop's actions
   * @returns {string|null}
   */
  function unsavedInputLine(stop, open, control) {
    if (!Object.prototype.hasOwnProperty.call(INSTRUCTIONS, stop)) {
      throw new Error('unsavedInputLine: no rule for the stop ' + String(stop) + '; the story meeting, the map, the desk and the desk\'s JSON editor have one');
    }
    if (!isPlainObject(open)) {
      throw new Error('unsavedInputLine: the ' + stop + ' stop must say what it has open');
    }
    if (control === undefined) return lineOf(INSTRUCTIONS[stop](open), function () { return actionsAt(stop); });
    var group = controlGroup(stop, control);
    return lineOf(group.instructions(open), function () { return listOf(group.controls) + ' ' + group.object; });
  }

  var api = {
    unsavedInputLine: unsavedInputLine
  };

  if (typeof window !== 'undefined') {
    window.Console = window.Console || {};
    window.Console.unsavedInputLogic = api;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
