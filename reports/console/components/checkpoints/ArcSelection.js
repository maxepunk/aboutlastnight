/**
 * The story meeting (phase 4, task 4.8; phase 4b, piece 3, briefs 3B and 3D; spec 2026-10-06
 * sections 5 and 6): the arc stop, where the director settles the story before anything is planned.
 * A memo of at most 450 words with any angle open, in the spec's order: the verdict; "from your
 * notes", or the line that says the notes end without the director's read; the angles side by side,
 * each a card that opens it, the open one saying only that it is open below; the open angle's pitch,
 * its headline, story, question, why it lands and where it ends up, with the questions that sit by
 * it; its threads in the story, each its name and its line, the verdict's always in, with the
 * questions beside it and a "What's behind it" toggle that opens its evidence in place; the threads
 * left out, each by its name, opening in place to its name and line; where the threads in the story
 * meet. Beside them: a code check still failing under the line it names, a concern beside its line,
 * the marks after a round, the edits a send-back changed with their reasons, a round that did not
 * run, the note box with the standing notes folded under it, and the three buttons. No tag on the
 * page: every line and every aria-label names an element by its words.
 *
 * What the director does here (spec 6; slice 3D): picks an angle by its card; rewrites any line of
 * the open pitch, and any thread's name or line, in place; flips a thread in or out of the open
 * angle, the verdict's locked in; adds a thread with a name and a line; answers each question in
 * its box; then approves, reweaves or sends back. A connection has no control: one the director
 * wants gone while both its threads stay in goes with a note.
 *
 * Thin: every decision is in checkpoint-view-logic.js. The page is meetingView's, the
 * changes are its operations, the payloads are meetingPayload's (4.5's), each held first
 * to meetingWeaveProblems (the gate's decisions), and the buttons are meetingButtons'.
 * The director's weave and note go to the meeting's pendingEdits slot on every change,
 * under the weave's version (meetingPendingSlot), so they survive a remount of that
 * version and clear when a new one arrives (pendingEditsAfterCheckpoint, in state.js).
 * A note restored into the box after a round that did not run goes with Approve only once
 * the director says so (meetingApproveAsk, task 4.5c).
 * A thread typed in the add line and not added holds every button, and a line beside them says
 * to add or clear it first (unsavedInputLine, task 4.14d).
 * Exports to window.Console.checkpoints.ArcSelection
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, CHECKPOINT_LABELS } = window.Console.utils;
const ViewLogic = window.Console.checkpointViewLogic;
const { unsavedInputLine } = window.Console.unsavedInputLogic;

function ArcSelection({ data, onApprove, onReject, onRollback, dispatch, pendingEdits, pendingNote }) {
  const version = ViewLogic.meetingVersion(data);
  const [draft, setDraft] = React.useState(function () { return ViewLogic.meetingDraftOf(data, pendingEdits); });
  const [note, setNote] = React.useState(function () { return ViewLogic.meetingNoteOf(data, pendingEdits, pendingNote); });
  const [newName, setNewName] = React.useState('');
  const [newLine, setNewLine] = React.useState('');
  // Send back takes two clicks, as at the map and the desk: this flag says the first one
  // happened, and ViewLogic.sendBackButton decides what it means on screen.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);
  // Task 4.5c: Approve has asked about a note restored into the box (meetingApproveAsk).
  const [askingApprove, setAskingApprove] = React.useState(false);
  const [error, setError] = React.useState('');

  // A new weave version opens the meeting on it; the same version keeps what the
  // director had (the pending slot survives CHECKPOINT_RECEIVED only for that version).
  React.useEffect(function () {
    setDraft(ViewLogic.meetingDraftOf(data, pendingEdits));
    setNote(ViewLogic.meetingNoteOf(data, pendingEdits, pendingNote));
    setNewName('');
    setNewLine('');
    setSendBackArmed(false);
    setAskingApprove(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const shown = data && data.weave;
  // The page reads the note box too: after a round that did not run, its line says how to
  // retry by what the box holds.
  const view = ViewLogic.meetingView(data, draft, note);
  // A note the box holds from a round that did not run was typed for that round: Approve
  // asks whether to keep it, as an approval note, or to clear it.
  const approveAsk = ViewLogic.meetingApproveAsk(data, note);
  // Each line's heading, the name a mark is listed under when the round took its line out.
  const LABELS = ViewLogic.MEETING_LINE_LABELS;
  // The buttons and the payloads read the stop's payload: the weave it showed, and a round
  // that did not run, whose changes a reweave still has to fit in.
  const buttons = ViewLogic.meetingButtons(data, draft, note, sendBackArmed);
  // Task 4.14d: a thread typed in the add line is in no payload until "Add a thread" puts it in
  // the weave, so while the line holds one every button waits, and this line says why.
  const held = unsavedInputLine('arc-selection', { addLine: newName + newLine });
  const standing = ViewLogic.meetingStandingNotes(data && data.directorGateNotes, CHECKPOINT_LABELS);

  /** Every change: on screen, and in the meeting's pending slot under the version it was made on. */
  function keep(nextDraft, nextNote) {
    setDraft(nextDraft);
    setNote(nextNote);
    setError('');
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'arc-selection', edits: ViewLogic.meetingPendingSlot(data, nextDraft), note: nextNote });
    }
  }

  // The open angle's card opens nothing new, and an angle with no id cannot be named by a pick.
  function pick(angle) { if (!angle.open && angle.id) keep(ViewLogic.pickMeetingAngle(draft, angle.id), note); }
  function editPitch(field, text) { keep(ViewLogic.setAngleField(draft, view.pitch.id, field, text), note); }
  function editThread(index, field, text) { keep(ViewLogic.setThreadField(draft, index, field, text), note); }
  function flip(thread) { keep(ViewLogic.flipMeetingThread(draft, thread.id, !thread.inStory), note); }
  function removeThread(index) { keep(ViewLogic.removeMeetingThread(draft, index), note); }
  function answer(index, text) { keep(ViewLogic.setQuestionAnswer(draft, index, text), note); }
  function editNote(text) { keep(draft, text); setSendBackArmed(false); setAskingApprove(false); }

  function addThread() {
    const next = ViewLogic.addMeetingThread(draft, newName, newLine);
    if (next === draft) return;
    keep(next, note);
    setNewName('');
    setNewLine('');
  }

  /**
   * One of the three actions, with the note box, or with `typed` when Approve's question
   * cleared it (task 4.5c). The weave is held to the gate's decisions first, so a refusal
   * is shown here rather than posted; the weave and note are saved before the post, so a
   * refusal from the server, which remounts this screen, gives them back.
   * Nothing is sent while the add line holds a thread (task 4.14d).
   */
  function send(action, typed) {
    if (held) return;
    const sentNote = typeof typed === 'string' ? typed : note;
    const problem = ViewLogic.meetingWeaveProblems(draft, shown);
    if (problem) {
      setError(problem);
      setSendBackArmed(false);
      setAskingApprove(false);
      return;
    }
    const payload = ViewLogic.meetingPayload(action, data, draft, sentNote);
    if (!payload) return;
    keep(draft, sentNote);
    if (action === 'approve') onApprove(payload);
    else onReject(payload);
  }

  /** Approve: straight away, or, with a restored note in the box, once the director answers approveAsk. */
  function handleApproveClick() {
    setSendBackArmed(false);
    if (approveAsk) {
      setAskingApprove(true);
      return;
    }
    send('approve');
  }

  function handleSendBackClick() {
    setAskingApprove(false);
    if (buttons.sendBack.disabled) return;
    if (!sendBackArmed) {
      setSendBackArmed(true);
      return;
    }
    send('send-back');
  }

  /**
   * What sits under a line: a code check still failing on it, in the director's words (spec
   * 6.3), the concerns about the director's edit on it and the marks of what the round changed
   * on it. `label` names the line they sit under where the line above them is another's: a
   * left-out thread's, under the names of the threads left out.
   */
  function beside(line, label) {
    const lead = function () {
      return label ? React.createElement('span', { className: 'text-muted' }, label + ': ') : null;
    };
    return React.createElement(React.Fragment, null,
      (line.failures || []).map(function (text, i) {
        return React.createElement('p', { key: 'check-' + i, className: 'meeting__check meeting__check--beside', role: 'alert' }, lead(), text);
      }),
      (line.concerns || []).map(function (text, i) {
        return React.createElement('p', { key: 'concern-' + i, className: 'meeting__concern', role: 'note' }, lead(), text);
      }),
      (line.marks || []).map(function (text, i) {
        return React.createElement('p', { key: 'mark-' + i, className: 'meeting__mark' }, lead(), text);
      })
    );
  }

  /**
   * A line's evidence under it (phase 4b, briefs 1B and 1C; spec 5.4 and 9): a "What's behind it"
   * toggle that opens it in place, each piece as evidenceFoldView words it, a piece that cuts
   * against the line marked so, or, for a thread the director added that has none, why
   * (`noEvidence`). The group is named for a screen reader by the line's `labels.fold`, which
   * meetingView gives it.
   */
  function evidenceFold(pieces, noEvidence, foldLabel) {
    if (pieces.length === 0 && !noEvidence) return null;
    return React.createElement('div', { className: 'meeting__fold', role: 'group', 'aria-label': foldLabel },
      React.createElement(CollapsibleSection, { title: view.evidenceTitle },
        React.createElement('ul', { className: 'meeting__pieces' },
          pieces.map(function (piece) {
            return React.createElement('li', { key: piece.key, className: 'meeting__piece' + (piece.cutsAgainst ? ' meeting__cuts-against' : '') }, piece.text);
          })
        ),
        noEvidence && React.createElement('p', { className: 'meeting__no-evidence' }, noEvidence)
      )
    );
  }

  /** A line of the open angle's pitch, rewritten in place (setAngleField). */
  function fieldEditor(field, label, line, rows) {
    return React.createElement('div', { key: field, className: 'meeting__field' },
      React.createElement('label', { className: 'meeting__label', htmlFor: 'meeting-' + field }, label),
      React.createElement('textarea', {
        id: 'meeting-' + field,
        className: 'input meeting__input meeting__inline meeting__input--' + field,
        rows: rows,
        value: line.text,
        onChange: function (e) { editPitch(field, e.target.value); }
      }),
      beside(line)
    );
  }

  /**
   * A thread's name and its line, each rewritten in place (setThreadField): the thread is shared,
   * so the change shows in every angle that tells it. Off under an id the writer repeated.
   */
  function threadFields(thread) {
    return React.createElement('div', { className: 'meeting__line' },
      React.createElement('input', {
        type: 'text',
        className: 'input meeting__inline meeting__thread-name',
        value: thread.name,
        disabled: thread.repeatedId,
        onChange: function (e) { editThread(thread.index, 'name', e.target.value); },
        'aria-label': thread.labels.name
      }),
      React.createElement('textarea', {
        className: 'input meeting__inline meeting__thread-line',
        rows: 2,
        value: thread.line,
        disabled: thread.repeatedId,
        onChange: function (e) { editThread(thread.index, 'line', e.target.value); },
        'aria-label': thread.labels.line
      })
    );
  }

  /**
   * A thread's controls: its flip, out of the open angle's story or into it after the angle's own
   * threads (flipMeetingThread), which the verdict's thread has none of (it is `locked`, R8); and,
   * for a thread the director added at this look, the control that takes it out again.
   */
  function threadControls(thread) {
    return React.createElement('div', { className: 'meeting__controls' },
      thread.verdict && React.createElement(Badge, { label: "the room's verdict", color: 'var(--accent-cyan)' }),
      !thread.locked && React.createElement('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm meeting__flip',
        disabled: thread.repeatedId,
        onClick: function () { flip(thread); },
        'aria-label': thread.labels.flip
      }, thread.inStory ? 'Leave out' : 'Bring in'),
      thread.added && React.createElement('button', {
        type: 'button',
        className: 'btn btn-ghost btn-sm',
        onClick: function () { removeThread(thread.index); },
        'aria-label': thread.labels.takeOut
      }, 'Take out')
    );
  }

  /** A question where it sits, beside a thread or by the pitch: what it asks, what its answer changes, and its answer box. */
  function questionBlock(question) {
    return React.createElement('div', { key: question.key, className: 'meeting__question' },
      React.createElement('p', null,
        question.kindLabel && React.createElement('span', { className: 'meeting__kind' }, question.kindLabel),
        React.createElement('strong', null, question.about), ': ', question.question),
      React.createElement('p', { className: 'text-xs text-muted' }, 'Its answer changes: ' + question.changes),
      React.createElement('textarea', {
        className: 'input meeting__answer',
        rows: 2,
        value: question.answer,
        disabled: question.index === -1,
        placeholder: 'Your answer',
        onChange: function (e) { answer(question.index, e.target.value); },
        'aria-label': question.labels.answer
      }),
      // A check still failing on the question, and the marks of what the round changed on it.
      beside(question)
    );
  }

  const SECTIONS = {
    verdict: function () {
      const verdict = view.verdict;
      return React.createElement('section', { key: 'verdict', className: 'meeting__section', 'aria-label': 'The verdict' },
        React.createElement('h4', { className: 'meeting__label' }, 'The verdict'),
        verdict.parsed
          ? React.createElement('p', { className: 'meeting__verdict' },
              verdict.who,
              verdict.charge && React.createElement('span', { className: 'text-muted' }, ' · Charge: ' + verdict.charge),
              verdict.vote && React.createElement('span', { className: 'text-muted' }, ' · Final vote: ' + verdict.vote))
          : React.createElement('p', { className: 'validation-error' }, 'The verdict was not parsed.')
      );
    },

    fromYourNotes: function () {
      return React.createElement('section', { key: 'fromYourNotes', className: 'meeting__section' },
        view.fromYourNotes
          ? React.createElement(React.Fragment, null,
              React.createElement('h4', { className: 'meeting__label' }, LABELS.fromYourNotes),
              React.createElement('blockquote', { className: 'meeting__quote' }, '"' + view.fromYourNotes.text + '"'),
              beside(view.fromYourNotes))
          : React.createElement('p', { className: 'meeting__thin-notes' }, view.thinNotes)
      );
    },

    // The angles side by side, each card opening its angle (pickMeetingAngle); the open one says
    // only that it is open below, where its pitch prints its headline (spec 5).
    angles: function () {
      return React.createElement('section', { key: 'angles', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'The angles'),
        React.createElement('ul', { className: 'meeting__angles' },
          view.angles.map(function (angle) {
            return React.createElement('li', { key: angle.key, className: 'meeting__angle-card' },
              React.createElement('button', {
                type: 'button',
                className: 'meeting__angle' + (angle.open ? ' meeting__angle--open' : ''),
                disabled: !angle.id,
                onClick: function () { pick(angle); },
                'aria-pressed': angle.open,
                'aria-label': angle.labels.pick
              },
                React.createElement('span', { className: 'meeting__angle-number' }, angle.number),
                angle.open
                  ? React.createElement('span', { className: 'meeting__angle-open' }, view.angleOpenLine)
                  : React.createElement(React.Fragment, null,
                      React.createElement('strong', { className: 'meeting__angle-headline' }, angle.headline),
                      React.createElement('span', { className: 'meeting__angle-gist' }, angle.gist))
              ),
              beside(angle)
            );
          })
        )
      );
    },

    pitch: function () {
      const pitch = view.pitch;
      return React.createElement('section', { key: 'pitch', className: 'meeting__section meeting__pitch' },
        fieldEditor('headline', LABELS.headline, pitch.headline, 2),
        fieldEditor('story', LABELS.story, pitch.story, 3),
        fieldEditor('question', LABELS.question, pitch.question, 2),
        fieldEditor('lands', LABELS.lands, pitch.lands, 2),
        fieldEditor('ends', LABELS.ends, pitch.ends, 2),
        beside(pitch),
        pitch.questions.map(questionBlock)
      );
    },

    threads: function () {
      /** One thread in the story: its name and its line, its controls, the verdict's lock, what sits under it, its questions, and what's behind it. */
      function threadRow(thread) {
        return React.createElement('li', { key: thread.key, className: 'meeting__thread' },
          React.createElement('div', { className: 'meeting__head' },
            threadFields(thread),
            threadControls(thread)
          ),
          thread.lockedLine && React.createElement('p', { className: 'text-xs text-muted' }, thread.lockedLine),
          beside(thread),
          thread.questions.map(questionBlock),
          evidenceFold(thread.evidence, thread.noEvidence, thread.labels.fold)
        );
      }

      const leftOut = view.leftOut;
      return React.createElement('section', { key: 'threads', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'In the story'),
        React.createElement('ul', { className: 'meeting__list' }, view.threads.map(threadRow)),
        // The threads left out, each by its name, opening in place to its name and line to rewrite,
        // with its control to bring it in; what sits under one, under its name; the questions
        // beside them.
        leftOut.threads.length > 0 && React.createElement('div', { className: 'meeting__out' },
          React.createElement('p', { className: 'meeting__label' }, leftOut.title),
          React.createElement('ul', { className: 'meeting__out-list' },
            leftOut.threads.map(function (thread) {
              return React.createElement('li', { key: thread.key, className: 'meeting__out-thread' },
                React.createElement(CollapsibleSection, { title: thread.label }, threadFields(thread)),
                threadControls(thread)
              );
            })
          ),
          leftOut.threads.map(function (thread) {
            return React.createElement(React.Fragment, { key: thread.key }, beside(thread, thread.label));
          }),
          leftOut.questions.map(questionBlock)
        ),
        view.repeatedIdHint && React.createElement('p', { className: 'meeting__hint' }, view.repeatedIdHint),
        // Add a thread the writer missed: its name and its line, in the open angle's story (addMeetingThread).
        React.createElement('div', { className: 'meeting__add' },
          React.createElement('input', {
            type: 'text',
            className: 'input meeting__add-name',
            value: newName,
            placeholder: view.add.placeholders.name,
            onChange: function (e) { setNewName(e.target.value); },
            'aria-label': view.add.labels.name
          }),
          React.createElement('input', {
            type: 'text',
            className: 'input meeting__add-line',
            value: newLine,
            placeholder: view.add.placeholders.line,
            onChange: function (e) { setNewLine(e.target.value); },
            'aria-label': view.add.labels.line
          }),
          React.createElement('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            disabled: !newName.trim() && !newLine.trim(),
            onClick: addThread
          }, view.add.button)
        )
      );
    },

    // Where the threads in the story meet: each connection its line alone, its evidence folded.
    connections: function () {
      return React.createElement('section', { key: 'connections', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'Where they meet'),
        React.createElement('ul', { className: 'meeting__list' },
          view.connections.map(function (connection) {
            return React.createElement('li', { key: connection.key, className: 'meeting__connection' },
              React.createElement('p', { className: 'meeting__detail' }, connection.line),
              beside(connection),
              evidenceFold(connection.evidence, '', connection.labels.fold)
            );
          })
        )
      );
    }
  };

  const roundLines = view.didNotRun || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.kept || view.marked
    || view.removed.length > 0 || view.otherMarks.length > 0 || view.otherConcerns.length > 0;

  return React.createElement('div', { className: 'meeting flex flex-col gap-md' },

    // What happened since the director last looked: a round that did not run, a check still
    // failing, the edits a round changed that no mark beside their line shows, or that the
    // director's edits stand, the marks' banner, and anything no line shows.
    roundLines && React.createElement('section', { className: 'meeting__round', 'aria-label': 'Since you last looked' },
      view.didNotRun && React.createElement('p', { className: 'meeting__did-not-run', role: 'status' }, view.didNotRun),
      view.checkFailures.map(function (text, i) {
        return React.createElement('p', { key: 'check-' + i, className: 'meeting__check', role: 'alert' }, text);
      }),
      view.changedEdits.length > 0 && React.createElement('div', null,
        React.createElement('p', { className: 'meeting__label' }, 'Your edits a rework changed'),
        React.createElement('ul', { className: 'meeting__list' },
          view.changedEdits.map(function (text, i) { return React.createElement('li', { key: 'changed-' + i, className: 'meeting__changed' }, text); })
        )
      ),
      view.kept && React.createElement('p', { className: 'text-xs text-muted' }, view.kept),
      view.marked && React.createElement('p', { className: 'meeting__mark' }, view.marked),
      view.removed.concat(view.otherMarks).map(function (text, i) {
        return React.createElement('p', { key: 'elsewhere-' + i, className: 'meeting__mark' }, text);
      }),
      view.otherConcerns.map(function (text, i) {
        return React.createElement('p', { key: 'other-concern-' + i, className: 'meeting__concern', role: 'note' }, text);
      })
    ),

    // The page, in the spec's order.
    view.order.map(function (section) { return SECTIONS[section](); }),

    // The note box, sent with whichever button the director presses, the standing notes folded under it.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'meeting-note' },
        'Note to the writer, sent with whichever button you press'),
      React.createElement('p', { className: 'text-xs text-muted' },
        'With Approve it stands for every later writer. With Reweave the writer fits it into the open angle with your changes. ' +
        'With Send back the writer rethinks the angles as it asks; Send back needs one.'),
      React.createElement('textarea', {
        id: 'meeting-note',
        className: 'input feedback-area',
        value: note,
        rows: 3,
        onChange: function (e) { editNote(e.target.value); },
        placeholder: 'e.g. Lead with the money. Leave the connection between the heir and the sale out of the story.',
        'aria-label': 'Note to the writer, sent with approve, reweave or send back'
      }),
      standing.any && React.createElement(CollapsibleSection, { title: standing.title },
        React.createElement('ul', { className: 'meeting__list' },
          standing.items.map(function (item) {
            return React.createElement('li', { key: item.key, className: 'text-sm' },
              React.createElement('span', { className: 'text-muted' }, item.label + ': '), item.text);
          })
        )
      )
    ),

    error && React.createElement('p', { className: 'validation-error', role: 'alert' }, error),

    // Task 4.5c: Approve's question about a note restored after a round that did not run;
    // each answer approves, with the note kept as an approval note or with the box cleared.
    askingApprove && approveAsk && React.createElement('div', { className: 'meeting__did-not-run flex flex-col gap-sm', role: 'status' },
      React.createElement('p', null, approveAsk.question),
      React.createElement('div', { className: 'flex gap-sm' },
        React.createElement('button', {
          type: 'button',
          className: 'btn btn-primary btn-sm',
          disabled: !!held,
          onClick: function () { setAskingApprove(false); send('approve'); },
          'aria-label': approveAsk.keep.ariaLabel
        }, approveAsk.keep.label),
        React.createElement('button', {
          type: 'button',
          className: 'btn btn-secondary btn-sm',
          disabled: !!held,
          onClick: function () { setAskingApprove(false); send('approve', ''); },
          'aria-label': approveAsk.clear.ariaLabel
        }, approveAsk.clear.label)
      )
    ),

    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn action-modes__btn--active btn btn-primary',
        disabled: !!held,
        onClick: handleApproveClick,
        'aria-label': buttons.approve.ariaLabel
      }, buttons.approve.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-secondary',
        disabled: !!held || buttons.reweave.disabled,
        title: buttons.reweave.hint || undefined,
        onClick: function () { setSendBackArmed(false); setAskingApprove(false); send('reweave'); },
        'aria-label': buttons.reweave.ariaLabel
      }, buttons.reweave.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        disabled: !!held || buttons.sendBack.disabled,
        onClick: handleSendBackClick,
        'aria-label': buttons.sendBack.ariaLabel
      }, buttons.sendBack.label)
    ),

    // Task 4.14d: what holds the buttons, beside them; a hold, not an error (task 4.14g).
    held && React.createElement('p', { className: 'held-line', role: 'status' }, held)
  );
}

window.Console.checkpoints.ArcSelection = ArcSelection;
