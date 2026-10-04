/**
 * unsaved-input-logic.js — PURE logic for input the director has typed at a stop and not saved
 * (phase 4, task 4.14d: input that lands).
 *
 * Dual-export: registers on window.Console.unsavedInputLogic for the browser AND exposes the same
 * surface via module.exports under Node, so it is unit-tested in node-env Jest
 * (console/__tests__/unsaved-input-logic.test.js; reports/CLAUDE.md: the console has no DOM harness).
 *
 * Nothing the director types is lost by pressing one of a stop's actions. The actions send what the
 * stop holds: the weave, the map or the bundle on the desk, and the note box. Text typed in an editor
 * the director has not saved, or in an add line whose button they have not pressed, is in none of
 * them, and the final review saw each screen drop it without a word (screens 1): at the desk,
 * Approve published the writer's paragraph over the director's open edit; on the map, a headline
 * typed in its open editor never reached the map the article writer reads; at the story meeting, a
 * thread typed in the add line was missing from the approved weave. So while a stop has such input
 * its actions wait (Approve, Reweave, Send back, and the desk's JSON Save & Approve), and one line
 * beside the buttons names each unsaved piece and says to save or discard it first.
 *
 * unsavedInputLine(stop, open) is the one rule. Each stop's component asks it once per render, with
 * what it has open, and gets back that line, or null when nothing waits:
 *   - 'article', the desk: { editor, bundle }. `editor` is Article.js's editingBlock: an open
 *     editor holds the actions whatever it holds, since the desk cannot see an editor's form.
 *   - 'outline', the map: { editor, adding, sections }. `editor` is Outline.js's editing, an open
 *     editor; `adding` its add-a-beat line, which holds the actions once it holds text; `sections`
 *     the page's sections as mapView lists them, whose labels name a section.
 *   - 'arc-selection', the story meeting: { addLine }, the add-a-thread line's text, which holds
 *     the actions once it holds text. Every other change at the meeting is kept as it is typed.
 * An editor this module cannot name still holds the actions: a new kind of editor is named
 * generically, never dropped. The line names a stop's actions from the list its payload builder
 * takes (checkpoint-view-logic.js MEETING_ACTIONS and MAP_ACTIONS; the desk's two), and a desk
 * section as the desk's move control names it (article-desk-logic.js sectionLabel).
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

  /** What the line asks of an open editor it cannot name. */
  var UNNAMED_EDITOR = 'save or cancel the edit you have open';

  /** An open editor's instruction: its two buttons, Save and Cancel, and what it edits. */
  function saveOrCancel(name) {
    return name ? 'save or cancel your edit to ' + name : UNNAMED_EDITOR;
  }

  // ── The actions that wait ─────────────────────────────────────────────────

  /**
   * console/checkpoint-view-logic.js, whose MEETING_ACTIONS and MAP_ACTIONS are the meeting's and
   * the map's actions as their payload builders take them, read when a line is asked for: the
   * stops load it before they render.
   */
  function viewLogic() {
    var view = (typeof window !== 'undefined' && window.Console && window.Console.checkpointViewLogic)
      || (typeof require === 'function' ? require('./checkpoint-view-logic') : null);
    if (!view || !Array.isArray(view.MEETING_ACTIONS) || !Array.isArray(view.MAP_ACTIONS)) {
      throw new Error('unsaved-input-logic: the meeting\'s and the map\'s actions are console/checkpoint-view-logic.js\'s, which is not loaded');
    }
    return view;
  }

  /** Each stop's actions, by their ids: the desk's two are the ones articleReviewPayload takes. */
  var ACTIONS = {
    'arc-selection': function () { return viewLogic().MEETING_ACTIONS; },
    outline: function () { return viewLogic().MAP_ACTIONS; },
    article: function () { return ['approve', 'send-back']; }
  };

  /** The word the line gives each action, by its id. */
  var ACTION_WORDS = { approve: 'approve', reweave: 'reweave', 'send-back': 'send back' };

  /** The actions that wait at a stop, in the line's words, joined as a list is read: "approve, reweave or send back". */
  function actionsAt(stop) {
    var words = ACTIONS[stop]().map(function (id) {
      if (!Object.prototype.hasOwnProperty.call(ACTION_WORDS, id)) {
        throw new Error('unsavedInputLine: the ' + stop + ' stop takes ' + String(id) + ', which the line has no word for');
      }
      return ACTION_WORDS[id];
    });
    return words.length > 1 ? words.slice(0, -1).join(', ') + ' or ' + words[words.length - 1] : words.join('');
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

  function deskInstructions(open) {
    if (!isPlainObject(open.editor)) return [];
    return [saveOrCancel(deskEditorName(open.editor, open.bundle))];
  }

  // ── The map ───────────────────────────────────────────────────────────────

  /** A map section by the label the page heads it with, else by its slot. */
  function mapSectionName(sections, slot) {
    var found = (Array.isArray(sections) ? sections : []).filter(function (section) {
      return isPlainObject(section) && section.slot === slot;
    })[0];
    return quoted(found && holdsText(found.label) ? found.label : asString(slot));
  }

  /** What an open map editor edits (Outline.js's editing), or '' for one it cannot name. */
  function mapEditorName(editor, sections) {
    if (editor.line === 'head') return 'the headline and deck';
    if (editor.line === 'gapNote') return 'the gap note';
    if (editor.line === 'section') return 'the heading and job of ' + mapSectionName(sections, editor.key);
    if (editor.line === 'beat') return holdsText(editor.key) ? 'beat ' + editor.key : '';
    if (editor.line === 'length') return 'the expected length';
    return '';
  }

  function mapInstructions(open) {
    var instructions = [];
    if (isPlainObject(open.editor)) instructions.push(saveOrCancel(mapEditorName(open.editor, open.sections)));
    var adding = open.adding;
    if (isPlainObject(adding) && (holdsText(adding.material) || holdsText(adding.players))) {
      // The add line's two buttons: Add the beat, and Cancel.
      instructions.push('add or cancel the new beat in ' + mapSectionName(open.sections, adding.slot));
    }
    return instructions;
  }

  // ── The story meeting ─────────────────────────────────────────────────────

  function meetingInstructions(open) {
    // The add line's button, Add a thread; clearing the line discards it.
    return holdsText(open.addLine) ? ['add or clear the new thread you typed'] : [];
  }

  var INSTRUCTIONS = {
    'arc-selection': meetingInstructions,
    outline: mapInstructions,
    article: deskInstructions
  };

  /**
   * The line beside a stop's buttons while it holds input the director has not saved, or null when
   * nothing waits, so the stop's actions behave as they always have. The line names each unsaved
   * piece and says to save or discard it before the stop's actions: "Before you approve or send
   * back, save or cancel your edit to the paragraph in "The Story"."
   *
   * @param {string} stop - 'arc-selection', 'outline' or 'article'
   * @param {Object} open - what the stop has open (see the header)
   * @returns {string|null}
   */
  function unsavedInputLine(stop, open) {
    if (!Object.prototype.hasOwnProperty.call(INSTRUCTIONS, stop)) {
      throw new Error('unsavedInputLine: no rule for the stop ' + String(stop) + '; the story meeting, the map and the desk have one');
    }
    if (!isPlainObject(open)) {
      throw new Error('unsavedInputLine: the ' + stop + ' stop must say what it has open');
    }
    var instructions = INSTRUCTIONS[stop](open);
    if (instructions.length === 0) return null;
    var before = 'Before you ' + actionsAt(stop);
    if (instructions.length === 1) return before + ', ' + instructions[0] + '.';
    return before + ': ' + instructions.join('; ') + '.';
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
