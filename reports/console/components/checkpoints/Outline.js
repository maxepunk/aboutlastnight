/**
 * The map (phase 4, task 4.9; spec 5.2 and 5.3): the outline stop, where the director reads
 * the story map in minutes and edits any line. The page, in order:
 * - the settled story, read-only, with the way back to the story meeting;
 * - what happened since the director last looked: a send-back whose rework did not run (task
 *   4.14e), the round and its note, a check still failing, the edits a rework changed that no
 *   move, section or the top of the article shows (a send-back's with its reasons; each other one
 *   sits on its move, under its section's head or at the top: spec 2026-10-07 section 7), the
 *   concerns no line shows;
 * - the gap note; the headline, the deck and the top photo;
 * - the sections in the map's order, under the theme's slot labels, each with its job, beats
 *   and photos: every line editable, move and strike controls on each beat, move controls on
 *   each photo, and an "add a beat" line with its players. Each beat shows its move's words, its
 *   people and the "Card" mark where it has the marker, with a "What's behind it" toggle that opens its
 *   evidence in place; each photo shows the director's description beside its thumbnail; a check
 *   still failing shows under the line it names (phase 4b, briefs 1D and 1F; spec 9);
 * - the dropped sections with their reasons; the counts (everyone placed or who is not, the cards,
 *   the photos and the expected length), rebuilt from the map as edited; left out, always open
 *   (piece 4, R8), each item with "bring back to";
 *   the map's changes to the weave, each with its source;
 * - the note box with the standing notes folded under it, the two buttons, and the trace of
 *   an automatic rework folded below.
 * Each concern sits beside the line of the edit it is about.
 *
 * Thin: the page is mapView's, its labels among it (no tag and no label is built here: a move's
 * controls and its fold, and a photo's controls, are named by mapView's `labels`), every change
 * goes through outline-edit-logic.js's editors (init, build, merge) and moves, the payloads are
 * mapPayload's (4.6's), each held first to mapProblems (the gate's decisions), and the buttons
 * are mapButtons'. The director's map and note go to the map's pendingEdits slot on every
 * change, under the map's version (mapPendingSlot), so they survive a remount of that version
 * and clear when a new one arrives (pendingEditsAfterCheckpoint, in state.js).
 * An open editor, or an add line that holds text, holds both buttons, and a line beside them says
 * to save or discard it first (unsavedInputLine, task 4.14d). Nor does any other control drop it
 * (task 4.14g): while an editor is open every pencil waits, since a pencil opens its editor in the
 * open one's place, and while the add line holds text every "+ Add a beat" waits, since it opens
 * the add line in another section; each is disabled with the rule's line as its tooltip, and the
 * line shows under the open editor or the add line, in the hold's own style (heldLine).
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { CollapsibleSection, TracePanel, editBtn, CHECKPOINT_LABELS } = window.Console.utils;
const EditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;
const { unsavedInputLine } = window.Console.unsavedInputLogic;

// Every line the director edits on the map is a pencil host in the always-visible mode (the
// integrator's ruling 6): the line sits at the host's left and its controls under it, so the
// top-right corner is free for the pencil. Pinned by __tests__/unit/console-editable-pencils.test.js.
const ALWAYS = 'article-block--editable article-block--editable-always';

/**
 * The line beside what waits for unsaved input (tasks 4.14d and 4.14g): the rule's line, or nothing
 * for none. A hold, not an error, so it is styled .held-line, calmer than a refusal's red.
 */
function heldLine(text) {
  return text ? React.createElement('p', { className: 'held-line', role: 'status' }, text) : null;
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

// Phase 4b (brief 1D): a beat's editor takes its move's words and its people; the rest of the
// beat, its evidence among it, is the writers' and stays as it is (EditLogic.buildBeat).
function BeatEditor({ beat, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initBeat(beat); });
  const set = fieldSetter(setForm);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, { label: 'The move', value: form.move, onChange: set('move'), multiline: true, rows: 2, hint: 'A few plain words of the story.' }),
    React.createElement(TextField, { label: 'Players it shows', value: form.players, onChange: set('players'), hint: 'Names, separated by commas.' }),
    actionsRow(function () { onSave(EditLogic.buildBeat(form, beat)); }, onCancel)
  );
}

function LengthEditor({ map, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initMapLength(map); });
  const length = EditLogic.buildMapLength(form);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement(TextField, {
      label: 'Expected length, in words', value: form.expectedLength, onChange: fieldSetter(setForm)('expectedLength'),
      hint: 'A whole number. The article writer aims at it, so set it lower when you strike beats.'
    }),
    actionsRow(function () { if (length !== null) onSave(length); }, onCancel, length === null)
  );
}

// ═══════════════════════════════════════════════════════
// The map
// ═══════════════════════════════════════════════════════

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

  // A new map version opens the map on it; the same version keeps what the director had (the
  // pending slot survives CHECKPOINT_RECEIVED only for that version).
  React.useEffect(function () {
    setDraft(ViewLogic.mapDraftOf(data, pendingEdits));
    setNote(ViewLogic.mapNoteOf(data, pendingEdits, pendingNote));
    setEditing(null);
    setAdding(null);
    setSendBackArmed(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const view = ViewLogic.mapView(data, draft);
  const buttons = ViewLogic.mapButtons(note, sendBackArmed);
  // Task 4.14d: an editor's form and the add line reach the map only when the director saves or
  // adds them, so while either holds input both buttons wait, and this line says why.
  const unsaved = { editor: editing, adding: adding, sections: view.sections };
  const held = unsavedInputLine('outline', unsaved);
  // Task 4.14g: a pencil opens its editor in place of the open one, and "+ Add a beat" opens the add
  // line in its section in place of the open one, so each waits as the buttons do.
  const editHeld = unsavedInputLine('outline', unsaved, 'edit');
  const addHeld = unsavedInputLine('outline', unsaved, 'add');
  const standing = ViewLogic.standingNotesView(data && data.directorGateNotes, CHECKPOINT_LABELS);
  // Brief 2.7: what the automatic rework of this round did before the director arrived.
  const trace = ViewLogic.traceView(data && data.trace, theme);
  // Task 4.14e: a send-back whose rework did not run, read by what the note box holds.
  const didNotRun = ViewLogic.reworkDidNotRunLine(data && data.roundDidNotRun, note, 'map');

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
  }

  function isEditing(line, key) { return editing !== null && editing.line === line && editing.key === key; }

  /** A pencil: opens its line's editor in place of the open one, so it waits while one is open (task 4.14g). */
  function open(line, key) {
    if (editHeld) return;
    setEditing({ line: line, key: key });
  }

  /** "+ Add a beat": opens the add line in its section in place of the open one, so it waits while that holds text (task 4.14g). */
  function openAddLine(slot) {
    if (addHeld) return;
    setAdding({ slot: slot, move: '', players: '' });
  }

  function cancel() { setEditing(null); }
  function editNote(text) { keep(draft, text); setSendBackArmed(false); }
  function backToMeeting() { if (onRollback) onRollback('arc-selection'); }

  function movePhotoTo(fromSlot, fromIndex, toSlot) {
    change(EditLogic.movePhoto(draft, fromSlot, fromIndex, toSlot));
  }

  function addTheBeat() {
    if (!adding) return;
    change(EditLogic.addBeat(draft, adding.slot, adding.move, adding.players));
    setAdding(null);
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
    return concerns.map(function (text, i) {
      return React.createElement('p', { key: 'concern-' + i, className: 'map__concern', role: 'note' }, text);
    });
  }

  /** The code checks still failing under the line they name, in the director's words (phase 4b, briefs 1D and 1F; spec 6.3). */
  function failuresOf(failures) {
    return (failures || []).map(function (text, i) {
      return React.createElement('p', { key: 'failure-' + i, className: 'map__check map__check--beside', role: 'alert' }, text);
    });
  }

  /** A move control: picking a place moves the line, and the control reads as itself again. */
  function moveSelect(placeholder, targets, disabled, ariaLabel, onPick) {
    return React.createElement('select', {
      className: 'map__move',
      value: '',
      disabled: disabled || targets.length === 0,
      onChange: function (e) { if (e.target.value) onPick(e.target.value); },
      'aria-label': ariaLabel
    },
      React.createElement('option', { value: '' }, placeholder),
      targets.map(function (t) { return React.createElement('option', { key: t.value, value: t.value }, t.label); })
    );
  }

  /** A photo as the page shows it beside its thumbnail: the director's description, or its filename when there is none (spec 9). */
  function photoText(photo) {
    return photo.description
      ? React.createElement('p', { className: 'map__photo-description' }, photo.description)
      : React.createElement('p', { className: 'map__filename' }, photo.filename);
  }

  function thumb(filename) {
    const url = ViewLogic.mapPhotoUrl(sessionId, filename);
    return url && React.createElement('img', {
      className: 'map__thumb',
      src: url,
      alt: filename,
      loading: 'lazy',
      onError: function (e) { e.currentTarget.classList.add('map__thumb--missing'); }
    });
  }

  /**
   * A move's evidence under it (phase 4b, briefs 1D and 1F; spec 5.4 and 9): a "What's behind it"
   * toggle that opens it in place, each piece as evidenceFoldView words it, a piece that cuts
   * against the move marked so, or, for a move the director added that has none, why
   * (`noEvidence`). The group is named for a screen reader by the view (`labels.fold`).
   */
  function evidenceFold(beat) {
    if (beat.evidence.length === 0 && !beat.noEvidence) return null;
    return React.createElement('div', { className: 'map__fold', role: 'group', 'aria-label': beat.labels.fold },
      React.createElement(CollapsibleSection, { title: view.evidenceTitle },
        beat.evidence.length > 0 && React.createElement('ul', { className: 'map__pieces' },
          beat.evidence.map(function (piece) {
            return React.createElement('li', { key: piece.key, className: 'map__piece' + (piece.cutsAgainst ? ' map__cuts-against' : '') }, piece.text);
          })
        ),
        beat.noEvidence && React.createElement('p', { className: 'map__no-evidence' }, beat.noEvidence)
      )
    );
  }

  // Phase 4b (briefs 1D and 1F; spec 9): a beat prints its move's words, the "Card" mark where it has the
  // marker, and its people, with its evidence folded under "What's behind it"; its kind, its
  // connection and its id stay underneath.
  function beatBody(beat) {
    return React.createElement(React.Fragment, null,
      React.createElement('p', { className: 'map__move-words' }, beat.move,
        beat.card && React.createElement(React.Fragment, null, ' ', React.createElement('span', { className: 'map__card-mark' }, ViewLogic.MAP_CARD_MARK))),
      beat.players && React.createElement('p', { className: 'text-xs text-muted' }, 'Shows: ' + beat.players),
      failuresOf(beat.failures),
      concernsOf(beat.concerns),
      // Piece 4 (spec 2026-10-07 section 7): an edit a rework changed that is about this move sits on it.
      beat.changed.map(function (text, i) { return React.createElement('p', { key: 'changed-' + i, className: 'map__changed' }, text); }),
      evidenceFold(beat)
    );
  }

  // A beat's row is keyed by its beat's id (mapView's `key`), not its place, so an editor open
  // on a beat keeps what was typed when a beat above it is struck or moved (task 4.14b).
  function beatRow(beat) {
    if (isEditing('beat', beat.id)) {
      return React.createElement('li', { key: beat.key, className: 'map__beat map__editing' },
        React.createElement(BeatEditor, {
          beat: EditLogic.beatWithId(draft, beat.id),
          onSave: function (built) { save(EditLogic.mergeBeat(draft, beat.id, built)); },
          onCancel: cancel
        }),
        heldLine(editHeld)
      );
    }
    return React.createElement('li', { key: beat.key, className: 'map__beat ' + ALWAYS + (beat.locked ? ' map__beat--locked' : '') },
      !beat.locked && editBtn(function () { open('beat', beat.id); }, editHeld),
      beatBody(beat),
      React.createElement('div', { className: 'map__controls' },
        moveSelect('Move to…', beat.moveTargets, beat.locked, beat.labels.moveTo,
          function (to) { change(EditLogic.moveBeat(draft, beat.id, to)); }),
        beat.added
          ? React.createElement('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              onClick: function () { change(EditLogic.removeBeat(draft, beat.id)); },
              'aria-label': beat.labels.takeOut
            }, 'Take out')
          : React.createElement('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              disabled: beat.locked,
              onClick: function () { change(EditLogic.strikeBeat(draft, beat.id)); },
              'aria-label': beat.labels.strike
            }, 'Strike')
      )
    );
  }

  function photoRow(photo) {
    return React.createElement('li', { key: photo.key, className: 'map__photo' + (photo.locked ? ' map__photo--locked' : '') },
      thumb(photo.filename),
      React.createElement('div', { className: 'map__photo-body' },
        photoText(photo),
        failuresOf(photo.failures),
        concernsOf(photo.concerns),
        React.createElement('div', { className: 'map__controls' },
          React.createElement('select', {
            className: 'map__move',
            value: photo.beat,
            disabled: photo.locked,
            onChange: function (e) { change(EditLogic.setPhotoBeside(draft, photo.slot, photo.index, e.target.value)); },
            'aria-label': photo.labels.beside
          }, photo.besideOptions.map(function (o) {
            return React.createElement('option', { key: o.value || 'itself', value: o.value }, o.label);
          })),
          moveSelect('Move to…', photo.moveTargets, photo.locked, photo.labels.moveTo,
            function (to) { movePhotoTo(photo.slot, photo.index, to); })
        )
      )
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
      }, '+ Add a beat');
    }
    return React.createElement('div', { className: 'map__add' },
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-move',
        value: adding.move,
        placeholder: 'The move, in a few plain words',
        onChange: function (e) { setAdding(Object.assign({}, adding, { move: e.target.value })); },
        'aria-label': 'The move to add'
      }),
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-players',
        value: adding.players,
        placeholder: 'Its players, separated by commas',
        onChange: function (e) { setAdding(Object.assign({}, adding, { players: e.target.value })); },
        'aria-label': 'The players the beat shows'
      }),
      React.createElement('button', { type: 'button', className: 'btn btn-secondary btn-sm', disabled: !adding.move.trim(), onClick: addTheBeat }, 'Add the beat'),
      React.createElement('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: function () { setAdding(null); } }, 'Cancel'),
      heldLine(addHeld)
    );
  }

  const roundLines = didNotRun || view.round || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.kept || view.otherConcerns.length > 0;

  return React.createElement('div', { className: 'map flex flex-col gap-md' },

    // The settled story, read-only: the meeting's. Changing it means going back there.
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

    // What happened since the director last looked.
    roundLines && React.createElement('section', { className: 'map__round', 'aria-label': 'Since you last looked' },
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
    ),

    view.lockedHint && React.createElement('p', { className: 'map__hint' }, view.lockedHint),

    // The gap note: the one line at the top of the map.
    view.gapNote && (isEditing('gapNote', 'gap')
      ? React.createElement('div', { className: 'map__gap map__editing' },
          React.createElement(GapNoteEditor, { gapNote: draft.gapNote, onSave: function (g) { save(EditLogic.mergeGapNote(draft, g)); }, onCancel: cancel }),
          heldLine(editHeld))
      : React.createElement('div', { className: 'map__gap ' + ALWAYS },
          editBtn(function () { open('gapNote', 'gap'); }, editHeld),
          React.createElement('p', { className: 'map__label' }, 'The gap'),
          React.createElement('p', null, view.gapNote.line),
          view.gapNote.players && React.createElement('p', { className: 'text-xs text-muted' }, 'It raises: ' + view.gapNote.players),
          failuresOf(view.gapNote.failures),
          concernsOf(view.gapNote.concerns))),

    // The headline, the deck and the top photo.
    React.createElement('section', { className: 'map__top', 'aria-label': 'The headline, the deck and the top photo' },
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
      view.topPhoto && React.createElement('div', { className: 'map__photo map__photo--top' + (view.topPhoto.locked ? ' map__photo--locked' : '') },
        thumb(view.topPhoto.filename),
        React.createElement('div', { className: 'map__photo-body' },
          React.createElement('p', { className: 'text-xs text-muted' }, 'Top photo, printed above the article'),
          photoText(view.topPhoto),
          failuresOf(view.topPhoto.failures),
          concernsOf(view.topPhoto.concerns),
          React.createElement('div', { className: 'map__controls' },
            moveSelect('Move into a section…', view.topPhoto.moveTargets, view.topPhoto.locked, view.topPhoto.labels.moveTo,
              function (to) { movePhotoTo(EditLogic.MAP_TOP_PHOTO, 0, to); })))),
      // Spec 2026-10-07 section 7: an edit a rework changed that is about the headline, the deck or the top photo sits here.
      view.top.changed.map(function (text, i) { return React.createElement('p', { key: 'changed-' + i, className: 'map__changed' }, text); })
    ),

    // The sections, in the map's order.
    view.sections.map(function (section) {
      return React.createElement('section', { key: section.key, className: 'map__section', 'aria-label': section.label },
        isEditing('section', section.slot)
          ? React.createElement('div', { className: 'map__section-head map__editing' },
              React.createElement(SectionEditor, {
                section: EditLogic.sectionWithSlot(draft, section.slot),
                onSave: function (fields) { save(EditLogic.mergeMapSection(draft, section.slot, fields)); },
                onCancel: cancel
              }),
              heldLine(editHeld))
          : React.createElement('div', { className: 'map__section-head ' + ALWAYS },
              editBtn(function () { open('section', section.slot); }, editHeld),
              React.createElement('h4', { className: 'map__label' }, section.label),
              React.createElement('p', { className: 'text-sm' },
                React.createElement('span', { className: 'text-muted' }, 'Heading: '), section.heading || 'none printed'),
              React.createElement('p', { className: 'text-sm' },
                React.createElement('span', { className: 'text-muted' }, 'Job: '), section.job),
              failuresOf(section.failures),
              concernsOf(section.concerns),
              // Spec 2026-10-07 section 7: an edit a rework changed that is about this section sits under its head.
              section.changed.map(function (text, i) { return React.createElement('p', { key: 'changed-' + i, className: 'map__changed' }, text); })),
        section.beats.length === 0 && React.createElement('p', { className: 'text-xs text-muted' }, 'No beats in this section.'),
        React.createElement('ul', { className: 'map__list' }, section.beats.map(beatRow)),
        section.photos.length > 0 && React.createElement('ul', { className: 'map__list' }, section.photos.map(photoRow)),
        addLine(section.slot)
      );
    }),

    // The dropped sections, each with its reason.
    view.dropped.length > 0 && React.createElement('section', { className: 'map__dropped', 'aria-label': 'Dropped sections' },
      React.createElement('h4', { className: 'map__label' }, 'Dropped'),
      React.createElement('ul', { className: 'map__list' },
        view.dropped.map(function (entry) {
          return React.createElement('li', { key: entry.key, className: 'text-sm' },
            React.createElement('strong', null, entry.label), ': ', entry.reason, concernsOf(entry.concerns));
        })
      )
    ),

    // The counts, from the map as edited: everyone placed or who is not, the cards, the photos and the expected length.
    React.createElement('section', { className: 'map__tally', 'aria-label': 'The counts' },
      view.tally.placed && React.createElement('p', null, view.tally.placed),
      view.tally.unplaced && React.createElement('p', { className: 'map__unplaced' }, view.tally.unplaced),
      view.tally.raised && React.createElement('p', { className: 'text-sm text-muted' }, view.tally.raised),
      React.createElement('p', null, view.tally.cards + ' · ' + view.tally.photos),
      isEditing('length', 'length')
        ? React.createElement('div', { className: 'map__length map__editing' },
            React.createElement(LengthEditor, { map: draft, onSave: function (n) { save(EditLogic.mergeMapLength(draft, n)); }, onCancel: cancel }),
            heldLine(editHeld))
        : React.createElement('div', { className: 'map__length ' + ALWAYS },
            editBtn(function () { open('length', 'length'); }, editHeld),
            React.createElement('p', null, view.tally.length),
            concernsOf(view.tally.lengthConcerns))
    ),

    // Left out, always open (piece 4, R8): each item whole, with the sections it can come back to.
    React.createElement('section', { className: 'map__tray', 'aria-label': view.leftOut.title },
      React.createElement('h4', { className: 'map__label' }, view.leftOut.title),
      view.leftOut.items.length === 0
        ? React.createElement('p', { className: 'text-xs text-muted' }, 'Nothing was left out.')
        : React.createElement('ul', { className: 'map__list' },
            view.leftOut.items.map(function (item) {
              return React.createElement('li', { key: item.key, className: 'map__left-out' },
                beatBody(item),
                React.createElement('div', { className: 'map__controls' },
                  moveSelect('Bring back to…', item.targets, item.locked, item.labels.bringBack,
                    function (to) { change(EditLogic.bringBackBeat(draft, item.id, to)); })));
            })
          )
    ),

    // What the map changed in the weave to fit the director's meeting, each with its source.
    (view.weaveChanges.length > 0 || view.weaveChangesConcerns.length > 0 || view.weaveChangesFailures.length > 0) && React.createElement('section', { className: 'map__changes', 'aria-label': 'The map\'s changes to the weave' },
      React.createElement('h4', { className: 'map__label' }, 'What the map changed to fit your meeting'),
      React.createElement('ul', { className: 'map__list' },
        view.weaveChanges.map(function (c) {
          return React.createElement('li', { key: c.key, className: 'text-sm' },
            React.createElement('span', { className: 'text-muted' }, c.source + ': '), c.change);
        })
      ),
      failuresOf(view.weaveChangesFailures),
      concernsOf(view.weaveChangesConcerns)
    ),

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
        placeholder: 'e.g. Move the vote earlier, and keep the ledger beats together.',
        'aria-label': 'Note to the writer, sent with approve or send back'
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
