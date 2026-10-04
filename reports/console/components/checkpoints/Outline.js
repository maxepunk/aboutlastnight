/**
 * The map (phase 4, task 4.9; spec 5.2 and 5.3): the outline stop, where the director reads
 * the story map in minutes and edits any line. The page, in order:
 * - the settled story, read-only, with the way back to the story meeting;
 * - what happened since the director last looked: the round and its note, a check still
 *   failing, the edits a rework changed (a send-back's with its reasons), the concerns no
 *   line shows;
 * - the gap note; the headline, the deck and the top photo;
 * - the sections in the map's order, under the theme's slot labels, each with its job, beats
 *   and photos: every line editable, move and strike controls on each beat, move controls on
 *   each photo, and an "add a beat" line with its players;
 * - the dropped sections with their reasons; Everyone, the cards, the photos and the expected
 *   length, rebuilt from the map as edited; left out, folded, each item with "bring back to";
 *   the map's changes to the weave, each with its source;
 * - the note box with the standing notes folded under it, the two buttons, and the trace of
 *   an automatic rework folded below.
 * Each concern sits beside the line of the edit it is about.
 *
 * Thin: the page is mapView's, every change goes through outline-edit-logic.js's editors
 * (init, build, merge) and moves, the payloads are mapPayload's (4.6's), each held first to
 * mapProblems (the gate's decisions), and the buttons are mapButtons'. The director's map and
 * note go to the map's pendingEdits slot on every change, under the map's version
 * (mapPendingSlot), so they survive a remount of that version and clear when a new one
 * arrives (pendingEditsAfterCheckpoint, in state.js).
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, TracePanel, editBtn, CHECKPOINT_LABELS } = window.Console.utils;
const EditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;

// Every line the director edits on the map is a pencil host in the always-visible mode (the
// integrator's ruling 6): the line sits at the host's left and its controls under it, so the
// top-right corner is free for the pencil. Pinned by __tests__/unit/console-editable-pencils.test.js.
const ALWAYS = 'article-block--editable article-block--editable-always';

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

function BeatEditor({ beat, onSave, onCancel }) {
  const [form, setForm] = React.useState(function () { return EditLogic.initBeat(beat); });
  const set = fieldSetter(setForm);
  const kinds = Object.keys(ViewLogic.BEAT_KIND_LABELS);
  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'flex flex-col gap-sm mb-sm' },
      React.createElement('span', { className: 'text-xs text-muted' }, 'Kind'),
      React.createElement('select', {
        className: 'input',
        value: form.kind,
        onChange: function (e) { set('kind')(e.target.value); }
      },
        kinds.indexOf(form.kind) === -1 && React.createElement('option', { value: '' }, '(none)'),
        kinds.map(function (kind) { return React.createElement('option', { key: kind, value: kind }, ViewLogic.BEAT_KIND_LABELS[kind]); })
      )
    ),
    React.createElement(TextField, { label: 'Material', value: form.material, onChange: set('material'), multiline: true, rows: 2, hint: 'A document id, a speaker and the line, or a ledger entry.' }),
    React.createElement(TextField, { label: 'Players it shows', value: form.players, onChange: set('players'), hint: 'Names, separated by commas.' }),
    React.createElement(TextField, { label: 'Card', value: form.card, onChange: set('card'), hint: 'The id of the document it prints as a card; empty for none.' }),
    React.createElement(TextField, { label: 'Connection', value: form.connection, onChange: set('connection'), hint: 'The id of the weave connection that lands here; empty for none.' }),
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
  const standing = ViewLogic.standingNotesView(data && data.directorGateNotes, CHECKPOINT_LABELS);
  // Brief 2.7: what the automatic rework of this round did before the director arrived.
  const trace = ViewLogic.traceView(data && data.trace, theme);

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
  function open(line, key) { setEditing({ line: line, key: key }); }
  function cancel() { setEditing(null); }
  function editNote(text) { keep(draft, text); setSendBackArmed(false); }
  function backToMeeting() { if (onRollback) onRollback('arc-selection'); }

  function movePhotoTo(fromSlot, fromIndex, toSlot) {
    change(EditLogic.movePhoto(draft, fromSlot, fromIndex, toSlot));
  }

  function addTheBeat() {
    if (!adding) return;
    change(EditLogic.addBeat(draft, adding.slot, adding.material, adding.players));
    setAdding(null);
  }

  /**
   * One of the two actions. The map is held to the gate's decisions first, so a refusal is
   * shown here rather than posted; the map and note are saved before the post, so a refusal
   * from the server, which remounts this screen, gives them back.
   */
  function send(action) {
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

  function beatBody(beat) {
    return React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'map__beat-head' },
        React.createElement('span', { className: 'map__id' }, beat.id),
        beat.kindLabel && React.createElement('span', { className: 'map__kind' }, beat.kindLabel),
        beat.card && React.createElement(Badge, { label: 'Card: ' + beat.card, color: 'var(--accent-amber)' }),
        beat.connection && React.createElement(Badge, { label: 'Connection ' + beat.connection + ' lands here', color: 'var(--accent-cyan)' })
      ),
      React.createElement('p', { className: 'map__material' }, beat.material),
      beat.players && React.createElement('p', { className: 'text-xs text-muted' }, 'Shows: ' + beat.players),
      concernsOf(beat.concerns)
    );
  }

  function beatRow(beat) {
    if (isEditing('beat', beat.id)) {
      return React.createElement('li', { key: beat.key, className: 'map__beat map__editing' },
        React.createElement(BeatEditor, {
          beat: EditLogic.beatWithId(draft, beat.id),
          onSave: function (built) { save(EditLogic.mergeBeat(draft, beat.id, built)); },
          onCancel: cancel
        })
      );
    }
    return React.createElement('li', { key: beat.key, className: 'map__beat ' + ALWAYS + (beat.locked ? ' map__beat--locked' : '') },
      !beat.locked && editBtn(function () { open('beat', beat.id); }),
      beatBody(beat),
      React.createElement('div', { className: 'map__controls' },
        moveSelect('Move to…', beat.moveTargets, beat.locked, 'Move beat ' + beat.id + ' to another section',
          function (to) { change(EditLogic.moveBeat(draft, beat.id, to)); }),
        beat.added
          ? React.createElement('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              onClick: function () { change(EditLogic.removeBeat(draft, beat.id)); },
              'aria-label': 'Take out the beat you added: ' + beat.material
            }, 'Take out')
          : React.createElement('button', {
              type: 'button',
              className: 'btn btn-ghost btn-sm',
              disabled: beat.locked,
              onClick: function () { change(EditLogic.strikeBeat(draft, beat.id)); },
              'aria-label': 'Strike beat ' + beat.id + ' into left out'
            }, 'Strike')
      )
    );
  }

  function photoRow(photo) {
    return React.createElement('li', { key: photo.key, className: 'map__photo' + (photo.locked ? ' map__photo--locked' : '') },
      thumb(photo.filename),
      React.createElement('div', { className: 'map__photo-body' },
        React.createElement('p', { className: 'map__filename' }, photo.filename),
        concernsOf(photo.concerns),
        React.createElement('div', { className: 'map__controls' },
          React.createElement('select', {
            className: 'map__move',
            value: photo.beat,
            disabled: photo.locked,
            onChange: function (e) { change(EditLogic.setPhotoBeside(draft, photo.slot, photo.index, e.target.value)); },
            'aria-label': 'Where ' + photo.filename + ' sits in its section'
          }, photo.besideOptions.map(function (o) {
            return React.createElement('option', { key: o.value || 'itself', value: o.value }, o.label);
          })),
          moveSelect('Move to…', photo.moveTargets, photo.locked, 'Move ' + photo.filename + ' to the top or to another section',
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
        onClick: function () { setAdding({ slot: slot, material: '', players: '' }); }
      }, '+ Add a beat');
    }
    return React.createElement('div', { className: 'map__add' },
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-material',
        value: adding.material,
        placeholder: 'The beat: a document id, a speaker and the line, or a ledger entry',
        onChange: function (e) { setAdding(Object.assign({}, adding, { material: e.target.value })); },
        'aria-label': 'The beat to add, naming its material'
      }),
      React.createElement('input', {
        type: 'text',
        className: 'input map__add-players',
        value: adding.players,
        placeholder: 'Its players, separated by commas',
        onChange: function (e) { setAdding(Object.assign({}, adding, { players: e.target.value })); },
        'aria-label': 'The players the beat shows'
      }),
      React.createElement('button', { type: 'button', className: 'btn btn-secondary btn-sm', disabled: !adding.material.trim(), onClick: addTheBeat }, 'Add the beat'),
      React.createElement('button', { type: 'button', className: 'btn btn-ghost btn-sm', onClick: function () { setAdding(null); } }, 'Cancel')
    );
  }

  if (!view.hasMap) {
    return React.createElement('div', { className: 'map flex flex-col gap-md' },
      React.createElement('div', { className: 'revision-diff__warning' }, view.emptyLine),
      React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: backToMeeting,
        'aria-label': 'Go back to the story meeting'
      }, 'Back to the story meeting')
    );
  }

  const roundLines = view.round || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.kept || view.otherConcerns.length > 0;

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
          React.createElement(GapNoteEditor, { gapNote: draft.gapNote, onSave: function (g) { save(EditLogic.mergeGapNote(draft, g)); }, onCancel: cancel }))
      : React.createElement('div', { className: 'map__gap ' + ALWAYS },
          editBtn(function () { open('gapNote', 'gap'); }),
          React.createElement('p', { className: 'map__label' }, 'The gap'),
          React.createElement('p', null, view.gapNote.line),
          view.gapNote.players && React.createElement('p', { className: 'text-xs text-muted' }, 'It raises: ' + view.gapNote.players),
          concernsOf(view.gapNote.concerns))),

    // The headline, the deck and the top photo.
    React.createElement('section', { className: 'map__top', 'aria-label': 'The headline, the deck and the top photo' },
      isEditing('head', 'head')
        ? React.createElement('div', { className: 'map__head map__editing' },
            React.createElement(HeadEditor, { map: draft, onSave: function (head) { save(EditLogic.mergeMapHead(draft, head)); }, onCancel: cancel }))
        : React.createElement('div', { className: 'map__head ' + ALWAYS },
            editBtn(function () { open('head', 'head'); }),
            React.createElement('p', { className: 'map__headline' }, view.headline.text),
            concernsOf(view.headline.concerns),
            React.createElement('p', { className: 'map__deck' }, view.deck.text),
            concernsOf(view.deck.concerns)),
      view.topPhoto && React.createElement('div', { className: 'map__photo map__photo--top' + (view.topPhoto.locked ? ' map__photo--locked' : '') },
        thumb(view.topPhoto.filename),
        React.createElement('div', { className: 'map__photo-body' },
          React.createElement('p', { className: 'text-xs text-muted' }, 'Top photo, printed above the article'),
          React.createElement('p', { className: 'map__filename' }, view.topPhoto.filename),
          concernsOf(view.topPhoto.concerns),
          React.createElement('div', { className: 'map__controls' },
            moveSelect('Move into a section…', view.topPhoto.moveTargets, view.topPhoto.locked, 'Move the top photo ' + view.topPhoto.filename + ' into a section',
              function (to) { movePhotoTo(EditLogic.MAP_TOP_PHOTO, 0, to); }))))
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
              }))
          : React.createElement('div', { className: 'map__section-head ' + ALWAYS },
              editBtn(function () { open('section', section.slot); }),
              React.createElement('h4', { className: 'map__label' }, section.label),
              React.createElement('p', { className: 'text-sm' },
                React.createElement('span', { className: 'text-muted' }, 'Heading: '), section.heading || 'none printed'),
              React.createElement('p', { className: 'text-sm' },
                React.createElement('span', { className: 'text-muted' }, 'Job: '), section.job),
              concernsOf(section.concerns)),
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

    // Everyone, the cards, the photos and the expected length, from the map as edited.
    React.createElement('section', { className: 'map__tally', 'aria-label': 'Everyone and the counts' },
      React.createElement('p', null, React.createElement('span', { className: 'text-muted' }, 'Everyone: '), view.tally.everyone || 'no roster player is in a beat'),
      view.tally.unplaced && React.createElement('p', { className: 'map__unplaced' }, view.tally.unplaced),
      view.tally.raised && React.createElement('p', { className: 'text-sm text-muted' }, view.tally.raised),
      React.createElement('p', null, view.tally.cards + ' · ' + view.tally.photos),
      isEditing('length', 'length')
        ? React.createElement('div', { className: 'map__length map__editing' },
            React.createElement(LengthEditor, { map: draft, onSave: function (n) { save(EditLogic.mergeMapLength(draft, n)); }, onCancel: cancel }))
        : React.createElement('div', { className: 'map__length ' + ALWAYS },
            editBtn(function () { open('length', 'length'); }),
            React.createElement('p', null, view.tally.length),
            concernsOf(view.tally.lengthConcerns))
    ),

    // Left out, folded: each item whole, with the sections it can come back to.
    React.createElement(CollapsibleSection, { title: view.leftOut.title, defaultOpen: view.leftOut.open },
      view.leftOut.items.length === 0
        ? React.createElement('p', { className: 'text-xs text-muted' }, 'Nothing was left out.')
        : React.createElement('ul', { className: 'map__list' },
            view.leftOut.items.map(function (item) {
              return React.createElement('li', { key: item.key, className: 'map__left-out' },
                beatBody(item),
                React.createElement('div', { className: 'map__controls' },
                  moveSelect('Bring back to…', item.targets, item.locked, 'Bring beat ' + item.id + ' back into a section',
                    function (to) { change(EditLogic.bringBackBeat(draft, item.id, to)); })));
            })
          )
    ),

    // What the map changed in the weave to fit the director's meeting, each with its source.
    (view.weaveChanges.length > 0 || view.weaveChangesConcerns.length > 0) && React.createElement('section', { className: 'map__changes', 'aria-label': 'The map\'s changes to the weave' },
      React.createElement('h4', { className: 'map__label' }, 'What the map changed to fit your meeting'),
      React.createElement('ul', { className: 'map__list' },
        view.weaveChanges.map(function (c) {
          return React.createElement('li', { key: c.key, className: 'text-sm' },
            React.createElement('span', { className: 'text-muted' }, c.source + ': '), c.change);
        })
      ),
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
        onClick: function () { setSendBackArmed(false); send('approve'); },
        'aria-label': buttons.approve.ariaLabel
      }, buttons.approve.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        disabled: buttons.sendBack.disabled,
        onClick: handleSendBackClick,
        'aria-label': buttons.sendBack.ariaLabel
      }, buttons.sendBack.label)
    ),

    // The trace of an automatic rework, folded below the map.
    trace.any && React.createElement(CollapsibleSection, { title: trace.title },
      React.createElement(TracePanel, { view: trace }))
  );
}

window.Console.checkpoints.Outline = Outline;
