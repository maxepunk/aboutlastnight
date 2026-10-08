/**
 * The map (phase 4, task 4.9; piece 4, brief 4D: spec 2026-10-07 sections 4 to 7): the outline
 * stop, where the director sees the article's shape at a glance and arranges it by hand on a
 * corkboard. The page renders mapView's parts in its `order`:
 * - the round's lines: a send-back whose rework did not run (task 4.14e), the round and its note,
 *   a check still failing, the edits a rework changed that no move, section or the top of the
 *   article shows, that the director's edits stand, and the concerns no line shows;
 * - the counts, with the expected length's editor;
 * - the settled story, read-only, with the way back to the story meeting, and the gap note
 *   beside it with its editor;
 * - the threads: picking one shows its line, outlines the cards that carry it and dims the rest;
 *   picking it again, or Show all, clears it;
 * - the top of the article: the headline and the deck with their editor, and the top photo;
 * - the board: the button that opens or closes every summary, then a column per section, each
 *   with its head and its editor, its cards in the order the article tells them, its photos by
 *   themselves and its add line;
 * - the tray of the moves left out, always open (R8);
 * - the dropped sections and what the map changed to fit the meeting;
 * - the note box with the standing notes folded under it, Approve and Send back, and the trace
 *   of an automatic rework, folded.
 *
 * A card shows its title with the arrow that opens its summary, its people, its dots (each names
 * its thread in its title), the "Card" mark and its thumbnails, and what the round says of it
 * under its title (spec 7). Selecting a card (a click, or Enter where it has focus) opens it in
 * place with its summary, its people, its threads by name, its photos with their descriptions, its
 * controls and what's behind it; clicking it again, Escape, or selecting something else closes it.
 * A move in the tray and a photo open the same way. The summaries' toggles and the selection are
 * this screen's own state, folded each time the page opens.
 *
 * Thin: the page is mapView's, its lines and labels among it; every change goes through
 * outline-edit-logic.js's editors (init, build, merge) and moves, each move through one handler
 * here (moveCard, moveCardBy, leaveOut, takeOut, bringBack, movePhotoTo, photoBeside, placePhoto),
 * which a drop calls too (R10); the payloads are mapPayload's (4.6's), each held first to
 * mapProblems (the gate's decisions), and the buttons are mapButtons'. The director's map and note
 * go to the map's pendingEdits slot on every change, under the map's version (mapPendingSlot), so
 * they survive a remount of that version and clear when a new one arrives
 * (pendingEditsAfterCheckpoint, in state.js).
 * Drag and drop is the browser's own (spec 6): a card moves within its column, into another column,
 * into the tray and out of it; a photo drops onto a move, onto a column or onto the top. A drag
 * carries what it moves in its dataTransfer (DRAG_TYPE), the drop reads it and calls the handler
 * the matching button calls, and the target the drag is over shows where it will land.
 *
 * An open editor, or an add line that holds text, holds both buttons, and a line beside them says
 * to save or discard it first (unsavedInputLine, task 4.14d). Nor does any other control drop it
 * (task 4.14g): while an editor is open every pencil waits, since a pencil opens its editor in the
 * open one's place, and while the add line holds text every "+ Add a move" waits, since it opens
 * the add line in another section; each is disabled with the rule's line as its tooltip, and the
 * line shows under the open editor or the add line, in the hold's own style (heldLine). On the
 * board (R9) selecting something else and every control on the selected card wait for both: a click
 * on another card or photo shows the line on what was clicked, and each control is disabled with the
 * line as its tooltip and the line under the controls. Closing what is selected waits for nothing,
 * and neither does a drop: an editor is keyed by its line, and a card whose editor is open does not
 * drag.
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { CollapsibleSection, TracePanel, editBtn, CHECKPOINT_LABELS } = window.Console.utils;
const EditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;
// The words the board's controls show are the view's (fix B1).
const CONTROLS = ViewLogic.MAP_CONTROLS;
const { unsavedInputLine } = window.Console.unsavedInputLogic;

// Every line the director edits on the map in place is a pencil host in the always-visible mode
// (the integrator's ruling 6): the line sits at the host's left and its controls under it, so the
// top-right corner is free for the pencil. A move's words are edited from its selected card.
// Pinned by __tests__/unit/console-editable-pencils.test.js.
const ALWAYS = 'article-block--editable article-block--editable-always';

// What inside a card or a photo is its own control or its open part, where a click does not
// select or close the card: a control, an editor's form, a selected card's details, a photo's panel.
const INNER = 'button, select, input, textarea, a, label, .map__card-detail, .map__photo-panel, .article-block__edit-form';

// What a drag carries in its dataTransfer: what it moves, as JSON. A type of the board's own, so a
// drop elsewhere on the page (the note box among them) takes nothing from it.
const DRAG_TYPE = 'application/x-aln-map';

// What a drop target's land returns for a drag that is where it would land already: the card
// dragged over itself, or a photo over the move it sits beside. The target stops the drag there and
// shows no landing, so the column around it never makes a move of a drop that changes nothing.
const STAYS = 'stays';

/**
 * The line beside what waits for unsaved input (tasks 4.14d and 4.14g): the rule's line, or nothing
 * for none. A hold, not an error, so it is styled .held-line, calmer than a refusal's red.
 */
function heldLine(text) {
  return text ? React.createElement('p', { className: 'held-line', role: 'status' }, text) : null;
}

/** What a drop carries: the thing dragged, as its drag start set it, or null for anything else. */
function droppedOf(e) {
  const text = e && e.dataTransfer && typeof e.dataTransfer.getData === 'function' ? e.dataTransfer.getData(DRAG_TYPE) : '';
  if (!text) return null;
  try {
    const what = JSON.parse(text);
    return what && (what.kind === 'beat' || what.kind === 'photo') ? what : null;
  } catch (err) {
    return null;
  }
}

/** Whether a click or a key reached a card or a photo from one of its controls or open parts (INNER). */
function fromInside(e) {
  if (!e || !e.target || !e.currentTarget || e.target === e.currentTarget || typeof e.target.closest !== 'function') return false;
  const inner = e.target.closest(INNER);
  return Boolean(inner && inner !== e.currentTarget && (typeof e.currentTarget.contains !== 'function' || e.currentTarget.contains(inner)));
}

// ═══════════════════════════════════════════════════════
// The editors: each opens on its line's init, and saves its build
// ═══════════════════════════════════════════════════════

function actionsRow(onSave, onCancel, saveDisabled) {
  return React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
    React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: onSave, disabled: !!saveDisabled }, 'Save'),
    React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
  );
}

function TextField({ label, value, onChange, multiline, rows, hint }) {
  return React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
    React.createElement('span', { className: 'text-xs text-muted' }, label),
    React.createElement(multiline ? 'textarea' : 'input', {
      className: 'input',
      value: value || '',
      rows: multiline ? (rows || 3) : undefined,
      onChange: function (e) { onChange(e.target.value); }
    }),
    hint && React.createElement('span', { className: 'text-xs text-muted' }, hint)
  );
}

/** A setter for one field of an editor's form. */
function fieldSetter(setForm) {
  return function (key) {
    return function (value) { setForm(function (prev) { return Object.assign({}, prev, { [key]: value }); }); };
  };
}

function HeadEditor({ map, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initMapHead(map); });
  const set = fieldSetter(setForm);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Headline', value: form.headline, onChange: set('headline') }),
    React.createElement(TextField, { label: 'Deck', value: form.deck, onChange: set('deck'), multiline: true, rows: 2 }),
    actionsRow(function () { onSave(EditLogic.buildMapHead(form)); }, onCancel)
  );
}

function GapNoteEditor({ gapNote, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initGapNote(gapNote); });
  const set = fieldSetter(setForm);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'The gap, in one line', value: form.line, onChange: set('line'), multiline: true, rows: 2 }),
    actionsRow(function () { onSave(EditLogic.buildGapNote(form, gapNote)); }, onCancel)
  );
}

function SectionEditor({ section, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initMapSection(section); });
  const set = fieldSetter(setForm);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'Heading', value: form.heading, onChange: set('heading'), hint: 'Leave it empty for a section that prints no heading.' }),
    React.createElement(TextField, { label: 'Job: what the section does to the question', value: form.job, onChange: set('job'), multiline: true, rows: 2 }),
    actionsRow(function () { onSave(EditLogic.buildMapSection(form)); }, onCancel)
  );
}

// Phase 4b (brief 1D) and piece 4 (spec 5): a move's editor takes its title, its summary and its
// people; the rest of the beat, its evidence among it, is the writers' and stays as it is
// (EditLogic.buildBeat).
function BeatEditor({ beat, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initBeat(beat); });
  const set = fieldSetter(setForm);
  const words = CONTROLS.beatEditor;
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: words.move, value: form.move, onChange: set('move'), multiline: true, rows: 2, hint: words.moveHint }),
    React.createElement(TextField, { label: words.synopsis, value: form.synopsis, onChange: set('synopsis'), multiline: true, rows: 2, hint: words.synopsisHint }),
    React.createElement(TextField, { label: words.players, value: form.players, onChange: set('players'), hint: words.playersHint }),
    actionsRow(function () { onSave(EditLogic.buildBeat(form, beat)); }, onCancel)
  );
}

function LengthEditor({ map, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initMapLength(map); });
  const length = EditLogic.buildMapLength(form);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, {
      label: 'Expected length, in words', value: form.expectedLength, onChange: fieldSetter(setForm)('expectedLength'),
      hint: 'A whole number. The article writer aims at it, so set it lower when you leave moves out.'
    }),
    actionsRow(function () { if (length !== null) onSave(length); }, onCancel, length === null)
  );
}

// ═══════════════════════════════════════════════════════
// The map
// ═══════════════════════════════════════════════════════

/** What is selected, by what a move or a photo keeps through a move: a move by its id, a photo by its filename, or by its place when a control cannot find it. */
function selectionOf(kind, item) {
  if (kind === 'beat') return 'beat:' + (item.locked || !item.id ? item.key : item.id);
  return 'photo:' + (item.locked || !item.filename ? (item.key || 'top') : item.filename);
}

function Outline({ data, sessionId, theme, onApprove, onReject, onRollback, dispatch, pendingEdits, pendingNote }) {
  const version = ViewLogic.mapVersion(data);
  const [draft, setDraft] = React.useState(function () { return ViewLogic.mapDraftOf(data, pendingEdits); });
  const [note, setNote] = React.useState(function () { return ViewLogic.mapNoteOf(data, pendingEdits, pendingNote); });
  // The line whose editor is open, `{line, key}`, and the section an "add a beat" line is open in.
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(null);
  // Send back takes two clicks, as at the meeting and the desk: this flag says the first one
  // happened, and ViewLogic.sendBackButton decides what it means on screen.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);
  const [error, setError] = React.useState('');
  // Piece 4 (spec 4 and 5): the one thing selected (selectionOf), the summaries opened (each by
  // its move's selection), the thread picked (its legend key), and the thumbnails that could not load.
  const [selected, setSelected] = React.useState(null);
  const [opened, setOpened] = React.useState({});
  const [picked, setPicked] = React.useState(null);
  const [missing, setMissing] = React.useState({});
  // The drag in flight, as its drag start set it, and the drop target it is over, which shows where
  // it will land; and the card or photo a held click reached, which shows the hold's line.
  const [dragging, setDragging] = React.useState(null);
  const [dropAt, setDropAt] = React.useState(null);
  const [heldAt, setHeldAt] = React.useState(null);

  // A new map version opens the map on it, with every summary folded and nothing selected; the
  // same version keeps what the director had (the pending slot survives CHECKPOINT_RECEIVED only
  // for that version).
  React.useEffect(function () {
    setDraft(ViewLogic.mapDraftOf(data, pendingEdits));
    setNote(ViewLogic.mapNoteOf(data, pendingEdits, pendingNote));
    setEditing(null);
    setAdding(null);
    setSendBackArmed(false);
    setError('');
    setSelected(null);
    setOpened({});
    setPicked(null);
    setDragging(null);
    setDropAt(null);
    setHeldAt(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const view = ViewLogic.mapView(data, draft);
  const buttons = ViewLogic.mapButtons(note, sendBackArmed);
  // Task 4.14d: an editor's form and the add line reach the map only when the director saves or
  // adds them, so while either holds input both buttons wait, and this line says why.
  const unsaved = { editor: editing, adding: adding, sections: view.sections };
  const held = unsavedInputLine('outline', unsaved);
  // Task 4.14g: a pencil opens its editor in place of the open one, and "+ Add a move" opens the add
  // line in its section in place of the open one, so each waits as the buttons do.
  const editHeld = unsavedInputLine('outline', unsaved, 'edit');
  const addHeld = unsavedInputLine('outline', unsaved, 'add');
  // R9: selecting something else, and every control on the selected card, wait for both.
  const selectHeld = unsavedInputLine('outline', unsaved, 'select');
  const moveHeld = unsavedInputLine('outline', unsaved, 'move');
  const standing = ViewLogic.standingNotesView(data && data.directorGateNotes, CHECKPOINT_LABELS);
  // Brief 2.7: what the automatic rework of this round did before the director arrived.
  const trace = ViewLogic.traceView(data && data.trace, theme);
  // Task 4.14e: a send-back whose rework did not run, read by what the note box holds.
  const didNotRun = ViewLogic.reworkDidNotRunLine(data && data.roundDidNotRun, note, 'map');
  const pickedThread = picked ? view.legend.threads.filter(function (t) { return t.key === picked; })[0] || null : null;
  const withSummary = view.sections.reduce(function (all, section) {
    return all.concat(section.beats.filter(function (beat) { return beat.synopsis; }).map(function (beat) { return selectionOf('beat', beat); }));
  }, []);
  const allOpen = withSummary.length > 0 && withSummary.every(function (sel) { return opened[sel]; });

  /** Every change: on screen, and in the map's pending slot under the version it was made on. */
  function keep(nextDraft, nextNote) {
    setDraft(nextDraft);
    setNote(nextNote);
    setError('');
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: ViewLogic.mapPendingSlot(data, nextDraft), note: nextNote });
    }
  }

  /** A change to the map; one that changes nothing keeps nothing. */
  function change(nextDraft) {
    if (nextDraft !== draft) keep(nextDraft, note);
  }

  /** An editor's save: the line merged into the map, and the editor closed. */
  function save(nextDraft) {
    change(nextDraft);
    setEditing(null);
    setHeldAt(null);
  }

  function isEditing(line, key) { return editing !== null && editing.line === line && editing.key === key; }

  /** A pencil: opens its line's editor in place of the open one, so it waits while one is open (task 4.14g). */
  function open(line, key) {
    if (editHeld) return;
    setEditing({ line: line, key: key });
  }

  /** "+ Add a move": opens the add line in its section in place of the open one, so it waits while that holds text (task 4.14g). */
  function openAddLine(slot) {
    if (addHeld) return;
    setAdding({ slot: slot, move: '', players: '' });
  }

  function cancel() { setEditing(null); setHeldAt(null); }
  function editNote(text) { keep(draft, text); setSendBackArmed(false); }
  function backToMeeting() { if (onRollback) onRollback('arc-selection'); }

  // ── Selecting, the summaries and the threads (spec 4 and 5) ──

  /**
   * Selecting a move or a photo opens it in place; selecting it again closes it, and selecting
   * something else closes the one open. Selecting something else waits while an editor is open or
   * the add line holds text (R9), and the hold's line shows on what was clicked; closing waits for nothing.
   */
  function select(sel) {
    if (selected === sel) {
      setSelected(null);
      return;
    }
    if (selectHeld) {
      setHeldAt(sel);
      return;
    }
    setHeldAt(null);
    setSelected(sel);
  }

  /** A control on the selected card or photo: it waits while an editor is open or the add line holds text (R9). */
  function whenFree(run) {
    return function (e) {
      if (moveHeld) return;
      run(e);
    };
  }

  function isSelected(sel) { return selected === sel; }

  /** A card's or a photo's click and keys: a click or Enter selects it, Escape closes it; one from its own controls or open parts does neither. */
  function selectHandlers(sel) {
    return {
      onClick: function (e) { if (!fromInside(e)) select(sel); },
      onKeyDown: function (e) {
        if (!e) return;
        if (closeOnEscape(sel, e)) return;
        if (e.key === 'Enter' && (!e.target || e.target === e.currentTarget)) {
          if (typeof e.preventDefault === 'function') e.preventDefault();
          select(sel);
        }
      }
    };
  }

  /** Escape closes what is selected, from anywhere inside it. */
  function closeOnEscape(sel, e) {
    if (!e || e.key !== 'Escape' || !isSelected(sel)) return false;
    setSelected(null);
    return true;
  }

  function toggleSummary(sel) {
    setOpened(Object.assign({}, opened, { [sel]: !opened[sel] }));
  }

  /** The board's button: opens every summary, or closes every one once all are open. */
  function toggleAllSummaries() {
    if (allOpen) {
      setOpened({});
      return;
    }
    const next = {};
    withSummary.forEach(function (sel) { next[sel] = true; });
    setOpened(next);
  }

  function pickThread(key) { setPicked(picked === key ? null : key); }

  // ── The moves: one handler each, which a button and a drop both call (R10) ──

  /** A move to the place `index` in the section `toSlot`, or to its foot with none. */
  function moveCard(id, toSlot, index) {
    change(EditLogic.moveBeat(draft, id, toSlot, index));
  }

  /** Move up (-1) or Move down (+1) within its section. */
  function moveCardBy(id, delta) {
    change(EditLogic.moveBeatBy(draft, id, delta));
  }

  /** Leave it out: into the tray. */
  function leaveOut(id) {
    change(EditLogic.strikeBeat(draft, id));
  }

  /** Take it out: a move the director added at this look, gone whole. */
  function takeOut(id) {
    change(EditLogic.removeBeat(draft, id));
  }

  /** Bring it back from the tray into the section `toSlot`, at the place `index`, or at its foot with none. */
  function bringBack(id, toSlot, index) {
    change(EditLogic.bringBackBeat(draft, id, toSlot, index));
  }

  /** A photo from its place to the top, or into another section by itself. */
  function movePhotoTo(fromSlot, fromIndex, toSlot) {
    change(EditLogic.movePhoto(draft, fromSlot, fromIndex, toSlot));
  }

  /** A photo of a section beside one of its moves, or by itself with `beatId` blank. */
  function photoBeside(slot, index, beatId) {
    change(EditLogic.setPhotoBeside(draft, slot, index, beatId));
  }

  /** A photo from its place beside the move `beatId` of the section `toSlot`, any section, in one op. */
  function placePhoto(fromSlot, fromIndex, toSlot, beatId) {
    change(EditLogic.placePhotoBeside(draft, fromSlot, fromIndex, toSlot, beatId));
  }

  function addTheBeat() {
    if (!adding) return;
    change(EditLogic.addBeat(draft, adding.slot, adding.move, adding.players));
    setAdding(null);
    setHeldAt(null);
  }

  // ── Drag and drop (spec 6): each drop calls the handler its button calls (R10) ──

  /** A card or a photo that drags: what it moves goes in the drag's dataTransfer, as JSON. */
  function dragSource(item) {
    return {
      draggable: true,
      onDragStart: function (e) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(item));
          e.dataTransfer.effectAllowed = 'move';
        }
        setDragging(item);
      },
      onDragEnd: function () {
        setDragging(null);
        setDropAt(null);
      }
    };
  }

  /**
   * A drop target, by its key (dropAt): `land(what)` returns the move a drop of `what` runs, or null
   * for a drag the target does not take, which goes on to the target around it, or STAYS for a drag
   * that is where it would land already, which goes no further, so the target around it (a card's
   * column) never makes a move of it. While a drag it takes is over it, it shows where that will
   * land; a drop runs the move.
   */
  function dropTarget(key, land) {
    return {
      onDragOver: function (e) {
        if (!dragging) return;
        const run = land(dragging);
        if (run === STAYS) {
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          if (dropAt !== null) setDropAt(null);
          return;
        }
        if (!run) return;
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
        if (dropAt !== key) setDropAt(key);
      },
      onDragLeave: function (e) {
        const inside = e && e.relatedTarget && e.currentTarget && typeof e.currentTarget.contains === 'function' && e.currentTarget.contains(e.relatedTarget);
        if (dropAt === key && !inside) setDropAt(null);
      },
      onDrop: function (e) {
        const what = droppedOf(e);
        const run = what ? land(what) : null;
        if (run === STAYS) {
          e.preventDefault();
          if (typeof e.stopPropagation === 'function') e.stopPropagation();
          return;
        }
        if (!run) return;
        e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        setDragging(null);
        setDropAt(null);
        run();
      }
    };
  }

  /** The place among a column's moves that a move dropped just before `beat` takes, once it has left its own place. */
  function placeBefore(section, beat, id) {
    return section.beats.filter(function (b) { return b.id !== id; }).indexOf(beat);
  }

  /**
   * A card as a drop target: a move lands just before it, and a photo goes beside it. The card
   * itself, or a photo already beside it, STAYS.
   */
  function landOnCard(section, beat) {
    return function (what) {
      if (beat.locked) return null;
      if (what.kind === 'beat') {
        if (what.id === beat.id) return STAYS;
        const index = placeBefore(section, beat, what.id);
        return what.from === null
          ? function () { bringBack(what.id, section.slot, index); }
          : function () { moveCard(what.id, section.slot, index); };
      }
      if (what.from === section.slot && what.beat === beat.id) return STAYS;
      return function () { placePhoto(what.from, what.index, section.slot, beat.id); };
    };
  }

  /**
   * A column as a drop target: a move lands at its foot, and a photo stands there by itself. A move
   * of the column itself goes to its last place there, which no card's drop gives, since a card takes
   * a move just before it; the move already last there is not taken, as that drop would change nothing.
   */
  function landOnColumn(section) {
    return function (what) {
      if (what.kind === 'beat') {
        if (what.from === section.slot) {
          const last = section.beats[section.beats.length - 1];
          if (!last || last.id === what.id) return null;
          return function () { moveCard(what.id, section.slot, section.beats.length - 1); };
        }
        return what.from === null
          ? function () { bringBack(what.id, section.slot); }
          : function () { moveCard(what.id, section.slot); };
      }
      if (what.from === section.slot) {
        return what.beat ? function () { photoBeside(section.slot, what.index, ''); } : null;
      }
      return function () { movePhotoTo(what.from, what.index, section.slot); };
    };
  }

  /** The tray as a drop target: a move from a column is left out, or taken out when the director added it, as its button does. */
  function landInTray(what) {
    if (what.kind !== 'beat' || what.from === null) return null;
    return what.added ? function () { takeOut(what.id); } : function () { leaveOut(what.id); };
  }

  /** The top of the article as a drop target: a photo becomes the top photo. */
  function landOnTop(what) {
    if (what.kind !== 'photo' || what.from === EditLogic.MAP_TOP_PHOTO) return null;
    return function () { movePhotoTo(what.from, what.index, EditLogic.MAP_TOP_PHOTO); };
  }

  /**
   * One of the two actions. The map is held to the gate's decisions first, so a refusal is
   * shown here rather than posted; the map and note are saved before the post, so a refusal
   * from the server, which remounts this screen, gives them back.
   * Nothing is sent while an editor or the add line holds input (task 4.14d).
   */
  function send(action) {
    if (held) return;
    const problem = ViewLogic.mapProblems(draft, data);
    if (problem) {
      setError(problem);
      setSendBackArmed(false);
      return;
    }
    const payload = ViewLogic.mapPayload(action, draft, note);
    if (!payload) return;
    keep(draft, note);
    if (action === 'approve') onApprove(payload);
    else onReject(payload);
  }

  function handleSendBackClick() {
    if (buttons.sendBack.disabled) return;
    if (!sendBackArmed) {
      setSendBackArmed(true);
      return;
    }
    send('send-back');
  }

  // ── Pieces of the page ──

  function concernsOf(concerns) {
    return (concerns || []).map(function (text, i) {
      return React.createElement('p', { key: 'concern-' + i, className: 'map__concern', role: 'note' }, text);
    });
  }

  /** The code checks still failing under the line they name, in the director's words (phase 4b, briefs 1D and 1F; spec 6.3). */
  function failuresOf(failures) {
    return (failures || []).map(function (text, i) {
      return React.createElement('p', { key: 'failure-' + i, className: 'map__check map__check--beside', role: 'alert' }, text);
    });
  }

  /** The edits of the director's a rework changed, beside their line (spec 7). */
  function changedOf(lines) {
    return (lines || []).map(function (text, i) {
      return React.createElement('p', { key: 'changed-' + i, className: 'map__changed' }, text);
    });
  }

  /** What the round says of a line, under it (spec 7): its failures, its concerns and its changed lines. */
  function marginOf(line) {
    return React.createElement(React.Fragment, null, failuresOf(line.failures), concernsOf(line.concerns), changedOf(line.changed));
  }

  /**
   * The changed lines about the gap note, the expected length or the map's changes to the weave
   * (`key`), which mapView gives in `changedBeside` (the run 2 contract); none when it gives none.
   */
  function changedBesideOf(key) {
    return (view.changedBeside && view.changedBeside[key]) || [];
  }

  /**
   * A move control: picking a place moves the line, and the control reads as itself again. Like every
   * control on what is selected, it waits while an editor is open or the add line holds text (R9).
   */
  function moveSelect(placeholder, targets, disabled, ariaLabel, onPick) {
    return React.createElement('select', {
      className: 'map__move',
      value: '',
      disabled: disabled || targets.length === 0 || !!moveHeld,
      title: moveHeld || undefined,
      onChange: whenFree(function (e) { if (e.target.value) onPick(e.target.value); }),
      'aria-label': ariaLabel
    },
      React.createElement('option', { value: '' }, placeholder),
      targets.map(function (t) { return React.createElement('option', { key: t.value, value: t.value }, t.label); })
    );
  }

  /** A thread's dot, its tone the view's, naming its thread when pointed at (spec 4). */
  function dot(d, i) {
    return React.createElement('span', {
      key: 'dot-' + i,
      className: 'map__dot map__dot--tone-' + d.tone,
      title: d.name || undefined
    });
  }

  /**
   * A photo's thumbnail (R7): the picture, its description in its title, and the description in its
   * place when the picture cannot load; a button that selects the photo.
   */
  function thumb(photo, sel) {
    const url = ViewLogic.mapPhotoUrl(sessionId, photo.filename);
    const words = photo.description || photo.filename;
    return React.createElement('button', {
      type: 'button',
      className: 'map__thumb-button' + (isSelected(sel) ? ' map__thumb-button--selected' : ''),
      'aria-label': photo.labels.select,
      'aria-pressed': isSelected(sel),
      title: !isSelected(sel) && selectHeld ? selectHeld : undefined,
      onClick: function () { select(sel); }
    },
      url && !missing[photo.filename]
        ? React.createElement('img', {
            className: 'map__thumb',
            src: url,
            alt: words,
            title: photo.description || undefined,
            loading: 'lazy',
            onError: function () { setMissing(Object.assign({}, missing, { [photo.filename]: true })); }
          })
        : React.createElement('span', { className: 'map__thumb map__thumb--missing' }, words)
    );
  }

  /**
   * A selected photo, opened in place (spec 5): its description, and where it can go: beside a move
   * of its own section or by itself there (a section's photo), beside a move in any section, to the
   * top or into another section by itself. A photo the director has since left out shows that it
   * does not print (among its concerns), with no controls.
   */
  function photoPanel(photo, fromSlot, fromIndex, moveLabel) {
    return React.createElement('div', { className: 'map__photo-panel', role: 'group', 'aria-label': photo.labels.select },
      photo.description
        ? React.createElement('p', { className: 'map__photo-description' }, photo.description)
        : React.createElement('p', { className: 'map__filename' }, photo.filename),
      !photo.locked && React.createElement('div', { className: 'map__controls' },
        photo.besideOptions && React.createElement('select', {
          className: 'map__move',
          value: photo.beat,
          disabled: !!moveHeld,
          title: moveHeld || undefined,
          onChange: whenFree(function (e) { photoBeside(fromSlot, fromIndex, e.target.value); }),
          'aria-label': photo.labels.beside
        }, photo.besideOptions.map(function (o) {
          return React.createElement('option', { key: o.value || 'itself', value: o.value }, o.label);
        })),
        moveSelect(CONTROLS.photo.placeBeside, photo.besideTargets, false, photo.labels.placeBeside, function (beatId) {
          const target = photo.besideTargets.filter(function (t) { return t.value === beatId; })[0];
          if (target) placePhoto(fromSlot, fromIndex, target.slot, beatId);
        }),
        moveSelect(moveLabel, photo.moveTargets, false, photo.labels.moveTo, function (to) { movePhotoTo(fromSlot, fromIndex, to); })
      ),
      !photo.locked && heldLine(moveHeld)
    );
  }

  /** What a photo's drag carries: where it sits, and the move it sits beside, if any. A locked photo does not drag. */
  function photoDrag(photo, fromSlot, fromIndex) {
    return photo.locked ? {} : dragSource({ kind: 'photo', from: fromSlot, index: fromIndex, beat: photo.beat || '' });
  }

  /** The hold's line on a card or a photo a held click reached (R9). */
  function heldHere(sel) {
    return heldAt === sel && !isSelected(sel) ? heldLine(selectHeld) : null;
  }

  /** A photo of a section where it sits (on its move's card, or by itself at the column's foot): its thumbnail, its margin, and its panel when selected. */
  function photoItem(photo, Tag) {
    const sel = selectionOf('photo', photo);
    return React.createElement(Tag, Object.assign({
      key: photo.key,
      className: 'map__photo' + (photo.locked ? ' map__photo--locked' : '') + (isSelected(sel) ? ' map__photo--selected' : ''),
      onKeyDown: function (e) { closeOnEscape(sel, e); }
    }, photoDrag(photo, photo.slot, photo.index)),
      thumb(photo, sel),
      heldHere(sel),
      failuresOf(photo.failures),
      concernsOf(photo.concerns),
      isSelected(sel) && photoPanel(photo, photo.slot, photo.index, CONTROLS.photo.moveTo)
    );
  }

  /** What's behind a selected move (spec 5): each piece, the one that prints as the card marked so, where its threads meet, or why it has none. */
  function behindIt(beat) {
    return React.createElement('div', { className: 'map__behind', role: 'group', 'aria-label': beat.labels.fold },
      React.createElement('p', { className: 'map__label' }, view.evidenceTitle),
      beat.evidence.length > 0 && React.createElement('ul', { className: 'map__pieces' },
        beat.evidence.map(function (piece) {
          return React.createElement('li', { key: piece.key, className: 'map__piece' + (piece.cutsAgainst ? ' map__cuts-against' : '') },
            piece.printsAsCard && React.createElement('span', { className: 'map__prints-as-card' }, ViewLogic.MAP_PRINTS_AS_CARD),
            piece.text);
        })
      ),
      beat.meets && React.createElement('p', { className: 'map__meets' }, beat.meets),
      beat.noEvidence && React.createElement('p', { className: 'map__no-evidence' }, beat.noEvidence)
    );
  }

  /** A selected move's threads, each by its dot and its name (spec 5). */
  function threadsByName(beat) {
    return beat.dots.length > 0 && React.createElement('ul', { className: 'map__threads' },
      beat.dots.map(function (d, i) {
        return React.createElement('li', { key: 'thread-' + i, className: 'map__thread-name' }, dot(d, i), d.name);
      })
    );
  }

  /**
   * A selected card's controls (spec 5), each through its move's one handler. Edit the words is a
   * pencil and waits for an open editor, as every pencil does (task 4.14g); every other control waits
   * for an open editor or a typed add line (R9), with the hold's line under them.
   */
  function cardControls(beat, slot) {
    if (beat.locked) return null;
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'map__controls' },
        React.createElement('button', {
          type: 'button', className: 'btn btn-ghost btn-sm', disabled: !!editHeld, title: editHeld || undefined,
          onClick: function () { open('beat', beat.id); }
        }, CONTROLS.card.editWords),
        React.createElement('button', {
          type: 'button', className: 'btn btn-ghost btn-sm', disabled: !beat.canMoveUp || !!moveHeld, title: moveHeld || undefined, 'aria-label': beat.labels.moveUp,
          onClick: whenFree(function () { moveCardBy(beat.id, -1); })
        }, CONTROLS.card.moveUp),
        React.createElement('button', {
          type: 'button', className: 'btn btn-ghost btn-sm', disabled: !beat.canMoveDown || !!moveHeld, title: moveHeld || undefined, 'aria-label': beat.labels.moveDown,
          onClick: whenFree(function () { moveCardBy(beat.id, 1); })
        }, CONTROLS.card.moveDown),
        moveSelect(CONTROLS.card.moveTo, beat.moveTargets, false, beat.labels.moveTo, function (to) { moveCard(beat.id, to); }),
        moveSelect(CONTROLS.card.photoBeside, beat.photoChoices, false, beat.labels.photoBeside, function (value) {
          const choice = beat.photoChoices.filter(function (c) { return c.value === value; })[0];
          if (choice) placePhoto(choice.slot, choice.index, slot, beat.id);
        }),
        beat.added
          ? React.createElement('button', {
              type: 'button', className: 'btn btn-ghost btn-sm', disabled: !!moveHeld, title: moveHeld || undefined, 'aria-label': beat.labels.takeOut,
              onClick: whenFree(function () { takeOut(beat.id); })
            }, CONTROLS.card.takeOut)
          : React.createElement('button', {
              type: 'button', className: 'btn btn-ghost btn-sm', disabled: !!moveHeld, title: moveHeld || undefined, 'aria-label': beat.labels.strike,
              onClick: whenFree(function () { leaveOut(beat.id); })
            }, CONTROLS.card.leaveOut)
      ),
      heldLine(moveHeld)
    );
  }

  /**
   * A card's class: selected, outlined or dimmed by the thread picked, locked, being edited, being
   * dragged, and where a drag over it will land: a move just before it, a photo beside it.
   */
  function cardClass(beat, extra) {
    const follows = pickedThread ? (beat.legendKeys.indexOf(pickedThread.key) !== -1 ? ' map__card--follows' : ' map__card--dimmed') : '';
    const dragged = dragging && dragging.kind === 'beat' && dragging.id === beat.id && !beat.locked ? ' map__card--dragging' : '';
    const landing = dropAt === 'card:' + beat.key && dragging ? (dragging.kind === 'beat' ? ' map__card--drop-before' : ' map__card--drop-beside') : '';
    return 'map__card' + extra + follows + (beat.locked ? ' map__card--locked' : '') + dragged + landing;
  }

  /**
   * What a card's drag carries: the move by its id, where it sits (null in the tray), and whether the
   * director added it at this look. A locked card, or one whose editor is open, does not drag.
   */
  function cardDrag(beat, from, editingHere) {
    if (beat.locked || editingHere) return { draggable: false };
    return dragSource({ kind: 'beat', id: beat.id, from: from, added: Boolean(beat.added) });
  }

  /**
   * A move's card in its column (spec 4, 5 and 7), keyed by its beat's id (mapView's `key`), so an
   * editor open on it keeps what was typed when a card above it moves (task 4.14b).
   */
  function card(beat, section) {
    const slot = section.slot;
    const sel = selectionOf('beat', beat);
    const selectedHere = isSelected(sel);
    const summaryOpen = Boolean(beat.synopsis && (selectedHere || opened[sel]));
    const editingHere = isEditing('beat', beat.id);
    return React.createElement('li', Object.assign({
      key: beat.key,
      className: cardClass(beat, (selectedHere ? ' map__card--selected' : '') + (editingHere ? ' map__editing' : '')),
      tabIndex: 0,
      'aria-expanded': selectedHere,
      title: !selectedHere && selectHeld ? selectHeld : undefined
    }, selectHandlers(sel), cardDrag(beat, slot, editingHere), dropTarget('card:' + beat.key, landOnCard(section, beat))),
      React.createElement('div', { className: 'map__card-head' },
        beat.synopsis && React.createElement('button', {
          type: 'button',
          className: 'map__summary-toggle',
          'aria-expanded': summaryOpen,
          'aria-label': summaryOpen ? beat.labels.hideSummary : beat.labels.showSummary,
          disabled: selectedHere,
          onClick: function () { toggleSummary(sel); }
        }, summaryOpen ? '▾' : '▸'),
        React.createElement('p', { className: 'map__card-title' }, beat.label)
      ),
      heldHere(sel),
      marginOf(beat),
      editingHere
        ? React.createElement(React.Fragment, null,
            React.createElement(BeatEditor, {
              beat: EditLogic.beatWithId(draft, beat.id),
              onSave: function (built) { save(EditLogic.mergeBeat(draft, beat.id, built)); },
              onCancel: cancel
            }),
            heldLine(editHeld))
        : React.createElement(React.Fragment, null,
            summaryOpen && React.createElement('p', { className: 'map__synopsis' }, beat.synopsis),
            beat.players && React.createElement('p', { className: 'map__people' }, beat.players),
            React.createElement('div', { className: 'map__card-marks' },
              beat.dots.map(dot),
              beat.cardMark && React.createElement('span', { className: 'map__card-mark' }, beat.cardMark))),
      beat.photos.length > 0 && React.createElement('ul', { className: 'map__thumbs' }, beat.photos.map(function (photo) { return photoItem(photo, 'li'); })),
      selectedHere && !editingHere && React.createElement('div', { className: 'map__card-detail' },
        threadsByName(beat),
        beat.photos.map(function (photo) {
          return React.createElement('p', { key: 'about-' + photo.key, className: 'map__photo-description' }, photo.description || photo.filename);
        }),
        cardControls(beat, slot),
        behindIt(beat))
    );
  }

  /** A move in the tray (spec 4 and 5): its title and its dots; selected, its summary, its people, its threads, Bring it back and what's behind it. */
  function trayItem(item) {
    const sel = selectionOf('beat', item);
    const selectedHere = isSelected(sel);
    return React.createElement('li', Object.assign({
      key: item.key,
      className: cardClass(item, ' map__card--tray' + (selectedHere ? ' map__card--selected' : '')),
      tabIndex: 0,
      'aria-expanded': selectedHere,
      title: !selectedHere && selectHeld ? selectHeld : undefined
    }, selectHandlers(sel), cardDrag(item, null, false)),
      React.createElement('div', { className: 'map__card-head' },
        React.createElement('p', { className: 'map__card-title' }, item.label)),
      heldHere(sel),
      React.createElement('div', { className: 'map__card-marks' }, item.dots.map(dot)),
      marginOf(item),
      selectedHere && React.createElement('div', { className: 'map__card-detail' },
        item.synopsis && React.createElement('p', { className: 'map__synopsis' }, item.synopsis),
        item.players && React.createElement('p', { className: 'map__people' }, item.players),
        threadsByName(item),
        React.createElement('div', { className: 'map__controls' },
          moveSelect(CONTROLS.tray.bringBack, item.targets, item.locked, item.labels.bringBack,
            function (to) { bringBack(item.id, to); })),
        !item.locked && heldLine(moveHeld),
        behindIt(item))
    );
  }

  function addLine(slot) {
    if (!adding || adding.slot !== slot) {
      return React.createElement('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm map__add-open',
        disabled: !!addHeld,
        title: addHeld || undefined,
        onClick: function () { openAddLine(slot); }
      }, CONTROLS.addLine.open);
    }
    return React.createElement('div', { className: 'map__add' },
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-move',
        value: adding.move,
        placeholder: CONTROLS.addLine.move,
        onChange: function (e) { setAdding(Object.assign({}, adding, { move: e.target.value })); },
        'aria-label': CONTROLS.addLine.moveLabel
      }),
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-players',
        value: adding.players,
        placeholder: CONTROLS.addLine.players,
        onChange: function (e) { setAdding(Object.assign({}, adding, { players: e.target.value })); },
        'aria-label': CONTROLS.addLine.playersLabel
      }),
      React.createElement('button', { type: 'button', className: 'btn btn-secondary btn-sm', disabled: !adding.move.trim(), onClick: addTheBeat }, CONTROLS.addLine.add),
      React.createElement('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: function () { setAdding(null); setHeldAt(null); } }, 'Cancel'),
      heldLine(addHeld)
    );
  }

  /** A column (spec 4): its head with its editor, and what the round says of it under the head while the editor is open too; its cards in order; its photos by themselves; its add line. */
  function column(section) {
    const landing = dropAt === 'column:' + section.slot && dragging ? ' map__column--drop' : '';
    return React.createElement('section', Object.assign({ key: section.key, className: 'map__column' + landing, 'aria-label': section.label },
      dropTarget('column:' + section.slot, landOnColumn(section))),
      isEditing('section', section.slot)
        ? React.createElement('div', { className: 'map__section-head map__editing' },
            React.createElement(SectionEditor, {
              section: EditLogic.sectionWithSlot(draft, section.slot),
              onSave: function (fields) { save(EditLogic.mergeMapSection(draft, section.slot, fields)); },
              onCancel: cancel
            }),
            heldLine(editHeld),
            marginOf(section))
        : React.createElement('div', { className: 'map__section-head ' + ALWAYS },
            editBtn(function () { open('section', section.slot); }, editHeld),
            React.createElement('h4', { className: 'map__label' }, section.label),
            section.heading
              ? React.createElement('p', { className: 'map__heading' }, section.heading)
              : React.createElement('p', { className: 'map__heading map__heading--none' }, ViewLogic.MAP_NO_HEADING_LINE),
            React.createElement('p', { className: 'map__job' }, section.job),
            marginOf(section)),
      React.createElement('ul', { className: 'map__cards' }, section.beats.map(function (beat) { return card(beat, section); })),
      section.emptied && React.createElement('p', { className: 'map__hint' }, section.emptied),
      section.byThemselves.length > 0 && React.createElement('ul', { className: 'map__loose' }, section.byThemselves.map(function (photo) { return photoItem(photo, 'li'); })),
      addLine(section.slot)
    );
  }

  // ── The page's parts, in mapView's order ──

  const PARTS = {
    // What happened since the director last looked.
    round: function () {
      return React.createElement('section', { key: 'round', className: 'map__round', 'aria-label': 'Since you last looked' },
        didNotRun && React.createElement('p', { className: 'map__did-not-run', role: 'status' }, didNotRun),
        view.round && React.createElement('p', { className: 'text-sm' },
          React.createElement('strong', null, view.round.label), view.round.note ? '. ' + view.round.note : ''),
        view.checkFailures.map(function (text, i) {
          return React.createElement('p', { key: 'check-' + i, className: 'map__check', role: 'alert' }, text);
        }),
        view.changedEdits.length > 0 && React.createElement('div', null,
          React.createElement('p', { className: 'map__label' }, 'Your edits a rework changed'),
          React.createElement('ul', { className: 'map__list' },
            view.changedEdits.map(function (text, i) { return React.createElement('li', { key: 'changed-' + i, className: 'map__changed' }, text); })
          )
        ),
        view.kept && React.createElement('p', { className: 'text-xs text-muted' }, view.kept),
        concernsOf(view.otherConcerns)
      );
    },

    // The counts, from the map as edited: everyone placed or who is not, the cards, the photos and the expected length.
    tally: function () {
      return React.createElement('section', { key: 'tally', className: 'map__tally', 'aria-label': 'The counts' },
        view.tally.placed && React.createElement('p', null, view.tally.placed),
        view.tally.unplaced && React.createElement('p', { className: 'map__unplaced' }, view.tally.unplaced),
        view.tally.raised && React.createElement('p', { className: 'text-sm text-muted' }, view.tally.raised),
        React.createElement('p', null, view.tally.cards),
        React.createElement('p', null, view.tally.photos),
        // What the round says of the length shows under it while its editor is open too, as a section head's does.
        isEditing('length', 'length')
          ? React.createElement('div', { className: 'map__length map__editing' },
              React.createElement(LengthEditor, { map: draft, onSave: function (n) { save(EditLogic.mergeMapLength(draft, n)); }, onCancel: cancel }),
              heldLine(editHeld),
              marginOf({ concerns: view.tally.lengthConcerns, changed: changedBesideOf('length') }))
          : React.createElement('div', { className: 'map__length ' + ALWAYS },
              editBtn(function () { open('length', 'length'); }, editHeld),
              React.createElement('p', null, view.tally.length),
              marginOf({ concerns: view.tally.lengthConcerns, changed: changedBesideOf('length') }))
      );
    },

    // The settled story, read-only: the meeting's. Changing it means going back there. The gap note beside it.
    settledStory: function () {
      return React.createElement('div', { key: 'settledStory', className: 'map__story-row' },
        React.createElement('section', { className: 'map__story', 'aria-label': 'The settled story' },
          React.createElement('h4', { className: 'map__label' }, 'The settled story'),
          view.settledStory && React.createElement('p', { className: 'map__story-line' }, view.settledStory.story),
          view.settledStory && view.settledStory.question && React.createElement('p', { className: 'text-sm' },
            React.createElement('span', { className: 'text-muted' }, 'The question it carries: '), view.settledStory.question),
          React.createElement('p', { className: 'text-xs text-muted' }, view.storyHint),
          React.createElement('button', {
            type: 'button',
            className: 'btn btn-ghost btn-sm',
            onClick: backToMeeting,
            'aria-label': 'Go back to the story meeting, which reopens as you left it'
          }, 'Back to the story meeting')
        ),
        // What the round says of the gap note shows under it while its editor is open too, as a section head's does.
        view.gapNote && (isEditing('gapNote', 'gap')
          ? React.createElement('div', { className: 'map__gap map__editing' },
              React.createElement(GapNoteEditor, { gapNote: draft.gapNote, onSave: function (g) { save(EditLogic.mergeGapNote(draft, g)); }, onCancel: cancel }),
              heldLine(editHeld),
              marginOf({ failures: view.gapNote.failures, concerns: view.gapNote.concerns, changed: changedBesideOf('gapNote') }))
          : React.createElement('div', { className: 'map__gap ' + ALWAYS },
              editBtn(function () { open('gapNote', 'gap'); }, editHeld),
              React.createElement('p', { className: 'map__label' }, 'The gap'),
              React.createElement('p', null, view.gapNote.line),
              view.gapNote.players && React.createElement('p', { className: 'text-xs text-muted' }, 'It raises: ' + view.gapNote.players),
              marginOf({ failures: view.gapNote.failures, concerns: view.gapNote.concerns, changed: changedBesideOf('gapNote') }))),
        // A map with no gap note left, whose gap note the director had edited, still shows what became of that edit.
        !view.gapNote && changedBesideOf('gapNote').length > 0 && React.createElement('div', { className: 'map__gap' },
          React.createElement('p', { className: 'map__label' }, 'The gap'),
          changedOf(changedBesideOf('gapNote')))
      );
    },

    // The threads (R4): picking one shows its line, outlines the cards that carry it and dims the rest.
    legend: function () {
      return React.createElement('section', { key: 'legend', className: 'map__legend', 'aria-label': view.legend.title },
        React.createElement('h4', { className: 'map__label' }, view.legend.title),
        React.createElement('div', { className: 'map__threads-row' },
          view.legend.threads.map(function (thread) {
            return React.createElement('button', {
              key: thread.key,
              type: 'button',
              className: 'map__thread' + (picked === thread.key ? ' map__thread--picked' : ''),
              'aria-pressed': picked === thread.key,
              'aria-label': thread.labels.pick,
              onClick: function () { pickThread(thread.key); }
            }, dot(thread, 0), thread.label);
          }),
          pickedThread && React.createElement('button', {
            type: 'button', className: 'btn btn-ghost btn-sm map__show-all', onClick: function () { setPicked(null); }
          }, view.legend.showAll)
        ),
        pickedThread && pickedThread.line && React.createElement('p', { className: 'map__thread-line' }, pickedThread.line)
      );
    },

    // The top of the article: the headline, the deck and the top photo.
    top: function () {
      const topSel = view.topPhoto ? selectionOf('photo', view.topPhoto) : null;
      const landing = dropAt === 'top' && dragging ? ' map__top--drop' : '';
      return React.createElement('section', Object.assign({ key: 'top', className: 'map__top' + landing, 'aria-label': 'The headline, the deck and the top photo' },
        dropTarget('top', landOnTop)),
        isEditing('head', 'head')
          ? React.createElement('div', { className: 'map__head map__editing' },
              React.createElement(HeadEditor, { map: draft, onSave: function (head) { save(EditLogic.mergeMapHead(draft, head)); }, onCancel: cancel }),
              heldLine(editHeld))
          : React.createElement('div', { className: 'map__head ' + ALWAYS },
              editBtn(function () { open('head', 'head'); }, editHeld),
              React.createElement('p', { className: 'map__headline' }, view.headline.text),
              concernsOf(view.headline.concerns),
              React.createElement('p', { className: 'map__deck' }, view.deck.text),
              concernsOf(view.deck.concerns)),
        view.topPhoto && React.createElement('div', Object.assign({
          className: 'map__photo map__photo--top' + (view.topPhoto.locked ? ' map__photo--locked' : '') + (isSelected(topSel) ? ' map__photo--selected' : ''),
          onKeyDown: function (e) { closeOnEscape(topSel, e); }
        }, photoDrag(view.topPhoto, EditLogic.MAP_TOP_PHOTO, 0)),
          thumb(view.topPhoto, topSel),
          heldHere(topSel),
          failuresOf(view.topPhoto.failures),
          concernsOf(view.topPhoto.concerns),
          isSelected(topSel) && photoPanel(view.topPhoto, EditLogic.MAP_TOP_PHOTO, 0, CONTROLS.photo.topMoveTo)),
        // Spec 2026-10-07 section 7: an edit a rework changed that is about the headline, the deck or the top photo sits here.
        changedOf(view.top.changed)
      );
    },

    // The board: the summaries' one button, then a column per section, in the map's order.
    sections: function () {
      return React.createElement('div', { key: 'sections', className: 'map__board' },
        view.lockedHint && React.createElement('p', { className: 'map__hint' }, view.lockedHint),
        withSummary.length > 0 && React.createElement('button', {
          type: 'button', className: 'btn btn-ghost btn-sm map__summaries', 'aria-pressed': allOpen, onClick: toggleAllSummaries
        }, allOpen ? view.summaries.close : view.summaries.open),
        React.createElement('div', { className: 'map__columns' }, view.sections.map(column))
      );
    },

    // Left out, always open (R8): each move by its title and its dots, opening in place when selected.
    leftOut: function () {
      const landing = dropAt === 'tray' && dragging ? ' map__tray--drop' : '';
      return React.createElement('section', Object.assign({ key: 'leftOut', className: 'map__tray' + landing, 'aria-label': view.leftOut.title },
        dropTarget('tray', landInTray)),
        React.createElement('h4', { className: 'map__label' }, view.leftOut.title),
        view.leftOut.items.length === 0
          ? React.createElement('p', { className: 'text-xs text-muted' }, 'Nothing was left out.')
          : React.createElement('ul', { className: 'map__cards map__cards--tray' }, view.leftOut.items.map(trayItem))
      );
    },

    // The dropped sections, each with its reason.
    dropped: function () {
      return React.createElement('section', { key: 'dropped', className: 'map__dropped', 'aria-label': 'Dropped sections' },
        React.createElement('h4', { className: 'map__label' }, 'Dropped'),
        React.createElement('ul', { className: 'map__list' },
          view.dropped.map(function (entry) {
            return React.createElement('li', { key: entry.key, className: 'text-sm' },
              React.createElement('strong', null, entry.label), ': ', entry.reason, concernsOf(entry.concerns));
          })
        )
      );
    },

    // What the map changed in the weave to fit the director's meeting, each with its source.
    weaveChanges: function () {
      return React.createElement('section', { key: 'weaveChanges', className: 'map__changes', 'aria-label': 'The map\'s changes to the weave' },
        React.createElement('h4', { className: 'map__label' }, 'What the map changed to fit your meeting'),
        React.createElement('ul', { className: 'map__list' },
          view.weaveChanges.map(function (c) {
            return React.createElement('li', { key: c.key, className: 'text-sm' },
              React.createElement('span', { className: 'text-muted' }, c.source + ': '), c.change);
          })
        ),
        failuresOf(view.weaveChangesFailures),
        concernsOf(view.weaveChangesConcerns),
        changedOf(changedBesideOf('weaveChanges'))
      );
    }
  };

  return React.createElement('div', { className: 'map flex flex-col gap-md' },

    view.order.map(function (part) { return PARTS[part](); }),

    // The note box, sent with whichever button the director presses, the standing notes folded under it.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'map-note' },
        'Note to the writer, sent with whichever button you press'),
      React.createElement('p', { className: 'text-xs text-muted' },
        'With Approve it stands for every later writer. With Send back the writer reworks the map as it asks, and then it stands; Send back needs one.'),
      React.createElement('textarea', {
        id: 'map-note',
        className: 'input feedback-area',
        value: note,
        rows: 3,
        onChange: function (e) { editNote(e.target.value); },
        placeholder: 'e.g. Move the vote earlier, and keep the ledger beats together.'
      }),
      standing.any && React.createElement(CollapsibleSection, { title: standing.title },
        React.createElement('ul', { className: 'map__list' },
          standing.items.map(function (item) {
            return React.createElement('li', { key: item.key, className: 'text-sm' },
              React.createElement('span', { className: 'text-muted' }, item.label + ': '), item.text);
          })
        )
      )
    ),

    error && React.createElement('p', { className: 'validation-error', role: 'alert' }, error),

    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn action-modes__btn--active btn btn-primary',
        disabled: !!held,
        onClick: function () { setSendBackArmed(false); send('approve'); },
        'aria-label': buttons.approve.ariaLabel
      }, buttons.approve.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        disabled: !!held || buttons.sendBack.disabled,
        onClick: handleSendBackClick,
        'aria-label': buttons.sendBack.ariaLabel
      }, buttons.sendBack.label)
    ),

    // Task 4.14d: what holds the buttons, beside them.
    heldLine(held),

    // The trace of an automatic rework, folded below the map.
    trace.any && React.createElement(CollapsibleSection, { title: trace.title },
      React.createElement(TracePanel, { view: trace }))
  );
}

window.Console.checkpoints.Outline = Outline;
