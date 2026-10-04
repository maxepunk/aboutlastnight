/**
 * The story meeting (phase 4, task 4.8; spec 4.3 and 4.4): the arc stop, where the
 * director settles the weave before anything is planned. A page of about 400 words, in
 * the spec's order: the verdict; the story, the question and the working headline; "from
 * your notes"; the threads with their roles and receipts; the connections and where they
 * converge; the optional stronger main thread; the questions, each with its answer box.
 * Beside them: a concern beside its line, the marks after a round, a code check still
 * failing, the edits a send-back changed with their reasons, a round that did not run,
 * the note box with the standing notes folded under it, and the three buttons.
 *
 * The director edits the story, the question, the headline and the convergence in place,
 * changes a thread's role, adds a thread with a role, strikes a connection and answers
 * each question; then approves, reweaves or sends back.
 *
 * Thin: every decision is in checkpoint-view-logic.js. The page is meetingView's, the
 * changes are its operations, the payloads are meetingPayload's (4.5's), each held first
 * to meetingWeaveProblems (the gate's decisions), and the buttons are meetingButtons'.
 * The director's weave and note go to the meeting's pendingEdits slot on every change,
 * under the weave's version (meetingPendingSlot), so they survive a remount of that
 * version and clear when a new one arrives (pendingEditsAfterCheckpoint, in state.js).
 * Exports to window.Console.checkpoints.ArcSelection
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, CHECKPOINT_LABELS } = window.Console.utils;
const ViewLogic = window.Console.checkpointViewLogic;

function ArcSelection({ data, onApprove, onReject, onRollback, dispatch, pendingEdits, pendingNote }) {
  const version = ViewLogic.meetingVersion(data);
  const [draft, setDraft] = React.useState(function () { return ViewLogic.meetingDraftOf(data, pendingEdits); });
  const [note, setNote] = React.useState(function () { return ViewLogic.meetingNoteOf(data, pendingEdits, pendingNote); });
  const [newClaim, setNewClaim] = React.useState('');
  const [newRole, setNewRole] = React.useState('grounds-it');
  // Send back takes two clicks, as at the map and the desk: this flag says the first one
  // happened, and ViewLogic.sendBackButton decides what it means on screen.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);
  const [error, setError] = React.useState('');

  // A new weave version opens the meeting on it; the same version keeps what the
  // director had (the pending slot survives CHECKPOINT_RECEIVED only for that version).
  React.useEffect(function () {
    setDraft(ViewLogic.meetingDraftOf(data, pendingEdits));
    setNote(ViewLogic.meetingNoteOf(data, pendingEdits, pendingNote));
    setNewClaim('');
    setSendBackArmed(false);
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const shown = data && data.weave;
  const view = ViewLogic.meetingView(data, draft);
  const buttons = ViewLogic.meetingButtons(shown, draft, note, sendBackArmed);
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

  function editField(field, text) { keep(ViewLogic.setMeetingField(draft, field, text), note); }
  function editRole(index, role) { keep(ViewLogic.setThreadRole(draft, index, role), note); }
  function removeThread(index) { keep(ViewLogic.removeMeetingThread(draft, index), note); }
  function strike(index, struck) { keep(ViewLogic.setConnectionStruck(draft, index, struck), note); }
  function answer(index, text) { keep(ViewLogic.setQuestionAnswer(draft, index, text), note); }
  function editNote(text) { keep(draft, text); setSendBackArmed(false); }

  function addThread() {
    const next = ViewLogic.addMeetingThread(draft, newClaim, newRole);
    if (next === draft) return;
    keep(next, note);
    setNewClaim('');
  }

  /**
   * One of the three actions. The weave is held to the gate's decisions first, so a refusal
   * is shown here rather than posted; the weave and note are saved before the post, so a
   * refusal from the server, which remounts this screen, gives them back.
   */
  function send(action) {
    const problem = ViewLogic.meetingWeaveProblems(draft, shown);
    if (problem) {
      setError(problem);
      setSendBackArmed(false);
      return;
    }
    const payload = ViewLogic.meetingPayload(action, shown, draft, note);
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

  /** The concerns and the marks beside a line. */
  function beside(line) {
    return React.createElement(React.Fragment, null,
      line.concerns.map(function (text, i) {
        return React.createElement('p', { key: 'concern-' + i, className: 'meeting__concern', role: 'note' }, text);
      }),
      line.marks.map(function (text, i) {
        return React.createElement('p', { key: 'mark-' + i, className: 'meeting__mark' }, text);
      })
    );
  }

  function roleOptions() {
    return view.roles.map(function (role) {
      return React.createElement('option', { key: role.value, value: role.value }, role.label);
    });
  }

  function fieldEditor(field, label, line, rows) {
    return React.createElement('div', { key: field, className: 'meeting__field' },
      React.createElement('label', { className: 'meeting__label', htmlFor: 'meeting-' + field }, label),
      React.createElement('textarea', {
        id: 'meeting-' + field,
        className: 'input meeting__input',
        rows: rows,
        value: line.text,
        onChange: function (e) { editField(field, e.target.value); }
      }),
      beside(line)
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

    story: function () {
      return React.createElement('section', { key: 'story', className: 'meeting__section' },
        fieldEditor('story', 'The story', view.story, 3),
        view.thinNotes && React.createElement('p', { className: 'meeting__thin-notes' }, view.thinNotes),
        fieldEditor('question', 'The question it carries', view.question, 2),
        fieldEditor('headline', 'Working headline', view.headline, 1)
      );
    },

    fromYourNotes: function () {
      return React.createElement('section', { key: 'fromYourNotes', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'From your notes'),
        React.createElement('blockquote', { className: 'meeting__quote' }, '"' + view.fromYourNotes.text + '"'),
        beside(view.fromYourNotes)
      );
    },

    threads: function () {
      return React.createElement('section', { key: 'threads', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'The threads'),
        React.createElement('ul', { className: 'meeting__list' },
          view.threads.map(function (thread) {
            return React.createElement('li', {
              key: thread.key,
              className: 'meeting__thread' + (thread.role === 'left-out' ? ' meeting__thread--left-out' : '')
            },
              React.createElement('div', { className: 'meeting__head' },
                React.createElement('span', { className: 'meeting__id' }, thread.id),
                React.createElement('select', {
                  className: 'meeting__role',
                  value: thread.role,
                  disabled: thread.repeatedId,
                  onChange: function (e) { editRole(thread.index, e.target.value); },
                  'aria-label': 'Role of thread ' + thread.id
                }, roleOptions()),
                thread.verdict && React.createElement(Badge, { label: "the room's verdict", color: 'var(--accent-cyan)' }),
                thread.added && React.createElement('button', {
                  type: 'button',
                  className: 'btn btn-ghost btn-sm',
                  onClick: function () { removeThread(thread.index); },
                  'aria-label': 'Take out the thread you added: ' + thread.claim
                }, 'Take out')
              ),
              React.createElement('p', { className: 'meeting__claim' }, thread.claim),
              React.createElement('p', {
                className: 'meeting__receipt text-xs text-muted',
                title: thread.receipt && thread.receipt.firstLine ? thread.receipt.firstLine : undefined
              }, thread.receipt ? 'Receipt: ' + thread.receipt.label : (thread.added ? 'Added by you' : 'No receipt')),
              thread.role === 'left-out' && thread.reason && React.createElement('p', { className: 'text-xs text-muted' },
                'Left out because: ' + thread.reason),
              beside(thread)
            );
          })
        ),
        view.repeatedIdHint && React.createElement('p', { className: 'meeting__hint' }, view.repeatedIdHint),
        // Add a thread the writer missed, in one line, with a role.
        React.createElement('div', { className: 'meeting__add' },
          React.createElement('input', {
            type: 'text',
            className: 'input meeting__add-claim',
            value: newClaim,
            placeholder: 'A thread the writer missed, in one line',
            onChange: function (e) { setNewClaim(e.target.value); },
            'aria-label': 'A thread to add, in one line'
          }),
          React.createElement('select', {
            className: 'meeting__role',
            value: newRole,
            onChange: function (e) { setNewRole(e.target.value); },
            'aria-label': 'Role of the thread to add'
          }, roleOptions()),
          React.createElement('button', {
            type: 'button',
            className: 'btn btn-secondary btn-sm',
            disabled: !newClaim.trim(),
            onClick: addThread
          }, 'Add a thread')
        )
      );
    },

    connections: function () {
      return React.createElement('section', { key: 'connections', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'Where they touch'),
        React.createElement('ul', { className: 'meeting__list' },
          view.connections.map(function (connection) {
            return React.createElement('li', {
              key: connection.key,
              className: 'meeting__connection' + (connection.struck ? ' meeting__connection--struck' : '')
            },
              React.createElement('div', { className: 'meeting__head' },
                React.createElement('span', { className: 'meeting__id' }, connection.id),
                React.createElement('span', { className: 'text-xs text-muted' },
                  connection.kindLabel + (connection.joins ? ' · joins ' + connection.joins : '')),
                React.createElement('button', {
                  type: 'button',
                  className: 'btn btn-ghost btn-sm',
                  disabled: connection.repeatedId,
                  onClick: function () { strike(connection.index, !connection.struck); },
                  'aria-pressed': connection.struck,
                  'aria-label': (connection.struck ? 'Unstrike connection ' : 'Strike connection ') + connection.id
                }, connection.struck ? 'Unstrike' : 'Strike')
              ),
              React.createElement('p', { className: 'meeting__detail' }, connection.detail),
              beside(connection)
            );
          })
        ),
        fieldEditor('convergence', 'Where they converge', view.convergence, 2)
      );
    },

    strongerMainThread: function () {
      const stronger = view.strongerMainThread;
      return React.createElement('section', { key: 'strongerMainThread', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'A stronger main thread'),
        React.createElement('p', null,
          React.createElement('span', { className: 'meeting__id' }, stronger.thread), ' ', stronger.claim),
        React.createElement('p', { className: 'text-sm text-secondary' }, stronger.reason),
        beside(stronger)
      );
    },

    questions: function () {
      return React.createElement('section', { key: 'questions', className: 'meeting__section' },
        React.createElement('h4', { className: 'meeting__label' }, 'Questions'),
        view.questions.map(function (question) {
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
              'aria-label': 'Your answer: ' + question.question
            }),
            question.marks.map(function (text, i) {
              return React.createElement('p', { key: 'mark-' + i, className: 'meeting__mark' }, text);
            })
          );
        })
      );
    }
  };

  if (!view.hasWeave) {
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      view.didNotRun && React.createElement('p', { className: 'meeting__did-not-run', role: 'status' }, view.didNotRun),
      React.createElement('div', { className: 'revision-diff__warning' }, view.emptyLine),
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function () { if (onRollback) onRollback('arc-selection'); },
        'aria-label': 'Go back to the story meeting, which writes the weave fresh'
      }, 'Back to the story meeting')
    );
  }

  const roundLines = view.didNotRun || view.checkFailures.length > 0 || view.changedEdits.length > 0 || view.marked
    || view.removed.length > 0 || view.otherMarks.length > 0 || view.otherConcerns.length > 0;

  return React.createElement('div', { className: 'meeting flex flex-col gap-md' },

    // What happened since the director last looked: a round that did not run, a check
    // still failing, the edits a send-back changed, the marks' banner, and anything no line shows.
    roundLines && React.createElement('section', { className: 'meeting__round', 'aria-label': 'Since you last looked' },
      view.didNotRun && React.createElement('p', { className: 'meeting__did-not-run', role: 'status' }, view.didNotRun),
      view.checkFailures.map(function (text, i) {
        return React.createElement('p', { key: 'check-' + i, className: 'meeting__check', role: 'alert' }, text);
      }),
      view.changedEdits.length > 0 && React.createElement('div', null,
        React.createElement('p', { className: 'meeting__label' }, 'Your edits the send-back changed'),
        React.createElement('ul', { className: 'meeting__list' },
          view.changedEdits.map(function (text, i) { return React.createElement('li', { key: 'changed-' + i, className: 'meeting__changed' }, text); })
        )
      ),
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
        'With Approve it stands for every later writer. With Reweave the writer fits it in with your changes. ' +
        'With Send back the writer rethinks the weave as it asks; Send back needs one.'),
      React.createElement('textarea', {
        id: 'meeting-note',
        className: 'input feedback-area',
        value: note,
        rows: 3,
        onChange: function (e) { editNote(e.target.value); },
        placeholder: 'e.g. Connect the ledger thread to the vote. Keep the heir thread out of the story.',
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

    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn action-modes__btn--active btn btn-primary',
        onClick: function () { setSendBackArmed(false); send('approve'); },
        'aria-label': buttons.approve.ariaLabel
      }, buttons.approve.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-secondary',
        disabled: buttons.reweave.disabled,
        title: buttons.reweave.hint || undefined,
        onClick: function () { setSendBackArmed(false); send('reweave'); },
        'aria-label': buttons.reweave.ariaLabel
      }, buttons.reweave.label),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        disabled: buttons.sendBack.disabled,
        onClick: handleSendBackClick,
        'aria-label': buttons.sendBack.ariaLabel
      }, buttons.sendBack.label)
    )
  );
}

window.Console.checkpoints.ArcSelection = ArcSelection;
