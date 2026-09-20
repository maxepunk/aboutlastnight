/**
 * ArcSelection Checkpoint Component
 * Displays narrative arcs as selectable cards in a responsive grid.
 * Each card shows title, summary, hook, key evidence, caveats, unanswered
 * questions, source and strength badges, and character placements. The evidence
 * is named, not listed as ids: `data.evidenceIndex` says what each id refers to
 * (phase 1, brief 1.2).
 * One note box is always on screen and is sent with whichever button the
 * director presses: with Approve as the outline's guidance, with Send back as
 * the arc rework's feedback, which also stands as a note for every later writer.
 * Exports to window.Console.checkpoints.ArcSelection
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, EvalBar } = window.Console.utils;
const { RevisionDiff } = window.Console;
const ViewLogic = window.Console.checkpointViewLogic;
// computeResetKey: the collision-resistant, content-sensitive reset key
// Outline.js and Article.js already use. Loaded before this file in index.html.
const EditLogic = window.Console.outlineEditLogic;

function ArcSelection({ data, onApprove, onReject, onRollback, dispatch, revisionCache }) {
  const arcs = (data && data.narrativeArcs) || [];
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  // The round the director's send back actually advances. arcRevisionCount
  // (above) counts only the automated budget: incrementArcRevision holds it
  // FLAT on a human-driven pass (graph.js, `isHumanDriven = !!state._arcFeedback`).
  const humanRevisionCount = (data && data.humanRevisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 2;
  const previousArcs = (revisionCache && revisionCache.arcs) || null;
  // Brief 1.2: id -> {name, owner, type, firstLine} for every exposed document,
  // built by server.js#buildEvidenceIndex. Without it a card lists raw ids.
  const evidenceIndex = (data && data.evidenceIndex) || {};
  // What the director wrote on the send back that produced this round. The box
  // comes back holding it, so carrying it forward as guidance costs no retyping.
  const notePrefill = ViewLogic.arcNotePrefill((data && data.directorGateNotes) || []);
  // H6: `data.evaluationHistory` is an append-only ARRAY mixing all three
  // phases, and this screen looked for a per-arc `arc.evaluationHistory` that
  // nothing populates, so the Opus arc verdict rendered nowhere.
  const evaluation = ViewLogic.evaluationView(ViewLogic.lastEvaluationFrom(data, 'arcs'));

  // Selected arc IDs. H15: every arc used to arrive checked, which pushed the
  // director to approve all five; 5+ arcs routinely costs an outline revision.
  const [selectedArcs, setSelectedArcs] = React.useState(function () {
    return new Set(ViewLogic.defaultArcSelection(arcs));
  });

  // Track which cards are expanded (for long evidence and caveat lists)
  const [expandedCards, setExpandedCards] = React.useState(new Set());

  // The stop's ONE note box (brief 1.2). It used to be two: an optional guidance
  // box for the approve and a feedback box behind the Reject button, which is why
  // the director wrote "there's just a reject button that doesn't allow me to give
  // any feedback". One box, on screen, sent with whichever button is pressed.
  const [noteText, setNoteText] = React.useState(notePrefill);
  // Send back takes two clicks, as it does at the outline and article stops: this
  // flag says the first one happened. ViewLogic.sendBackButton decides what that
  // means on screen. An arc rework is about eight minutes of Opus.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);

  // Reset selection when arcs change (e.g., after rollback or revision).
  // The key must see CONTENT, not ids: the arc reviser is told to make targeted
  // fixes and preserve the set, so a rework routinely returns the same ids with
  // new text, and an id list cannot tell the two rounds apart. computeResetKey
  // serializes the arcs themselves. The round in the key is humanRevisionCount,
  // the counter the director's send back advances; revisionCount (arcRevisionCount)
  // stays flat on exactly that pass, which is the only pass this reset exists for.
  // The pre-fill is its own term: it comes from directorGateNotes, not from arcs.
  const resetKey = EditLogic.computeResetKey(arcs, humanRevisionCount) + '|' + notePrefill;
  React.useEffect(function () {
    setSelectedArcs(new Set(ViewLogic.defaultArcSelection(arcs)));
    setExpandedCards(new Set());
    setNoteText(notePrefill);
    setSendBackArmed(false);
  }, [resetKey]);

  function toggleArc(arcId) {
    setSelectedArcs(function (prev) {
      var next = new Set(prev);
      if (next.has(arcId)) {
        next.delete(arcId);
      } else {
        next.add(arcId);
      }
      return next;
    });
  }

  function toggleExpanded(arcId) {
    setExpandedCards(function (prev) {
      var next = new Set(prev);
      if (next.has(arcId)) {
        next.delete(arcId);
      } else {
        next.add(arcId);
      }
      return next;
    });
  }

  function handleSubmit() {
    setSendBackArmed(false);
    // The note rides the approve as outlineGuidance: the director's emphasis for
    // the outline AND article prompts. On a send back the same box is the arc
    // rework's feedback instead, which is why the key assembly is one pure
    // function (ViewLogic.arcReviewPayload) rather than two inline literals.
    onApprove(ViewLogic.arcReviewPayload(Array.from(selectedArcs), noteText, 'approve'));
  }

  /**
   * The brake on the send back. One box serves both actions here too, so Send
   * back sits beside a note the director may have written for an approve, and a
   * mis-click costs a round and about eight minutes of Opus. The first click
   * arms the button, the second sends; editing the note, pressing Approve or a
   * reset of the screen disarms it.
   */
  function handleSendBackClick() {
    if (!noteText.trim()) return;
    if (!sendBackArmed) {
      setSendBackArmed(true);
      return;
    }
    handleSendBack();
  }

  function handleSendBack() {
    const payload = ViewLogic.arcReviewPayload(Array.from(selectedArcs), noteText, 'send-back');
    if (!payload) return;
    // Cache current arcs for diff on next revision
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'arcs', data: arcs });
    }
    onReject(payload);
  }

  // The arc schema's evidenceStrength enum is strong | moderate | weak |
  // speculative (arc-specialist-nodes.js). The old map tested HIGH/MEDIUM, so
  // every badge came out red whatever the strength was.
  function getStrengthColor(strength) {
    var value = (strength || '').toLowerCase();
    if (value === 'strong') return 'var(--accent-green)';
    if (value === 'moderate') return 'var(--accent-amber)';
    if (value === 'weak' || value === 'speculative') return 'var(--accent-red)';
    return 'var(--accent-amber)';
  }

  const isValid = selectedArcs.size >= 1;
  const sendBack = ViewLogic.sendBackButton(sendBackArmed, noteText, 'arcs');

  if (arcs.length === 0) {
    var isGenTimeout = data && data._generationTimedOut;
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      React.createElement('div', {
        className: 'revision-diff__warning',
        style: isGenTimeout ? { background: 'rgba(212, 168, 83, 0.12)', borderColor: 'rgba(212, 168, 83, 0.4)', color: 'var(--accent-amber)' } : undefined
      },
        isGenTimeout
          ? 'Arc generation timed out after multiple retries. Roll back to try again, or check if the evidence bundle is unusually large.'
          : 'No arcs available. This usually means generation failed.'
      ),
      previousFeedback && React.createElement('div', { className: 'revision-diff__feedback' },
        React.createElement('span', { className: 'revision-diff__feedback-label' }, 'Your Last Feedback'),
        React.createElement('p', { className: 'revision-diff__feedback-text' }, previousFeedback)
      ),
      // R5 F16: this dispatched a SHOW_ROLLBACK action no reducer handles, so
      // the only offered recovery from a zero-arc dead end logged
      // "[state] Unknown action" and did nothing. App passes onRollback now.
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: function () { if (onRollback) onRollback('evidence-and-photos'); },
        'aria-label': 'Roll back to the evidence bundle and regenerate arcs'
      }, 'Roll Back to Regenerate')
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousArcs,
      current: arcs,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: (data && data.humanRevisionCount) || 0,
      handEditReport: null,
      gateNotes: (data && data.directorGateNotes) || []
    }),

    // Timeout recovery banner — user should know these are preserved arcs, not fresh output
    (data && data._revisionTimedOut) && React.createElement('div', { className: 'revision-diff__warning', style: { background: 'rgba(212, 168, 83, 0.12)', borderColor: 'rgba(212, 168, 83, 0.4)', color: 'var(--accent-amber)' } },
      'Revision timed out. These are the arcs from before your feedback was applied. You can approve them as-is, reject with the same feedback to retry, or roll back.'
    ),

    // Evaluation bar (what Opus said about THESE arcs)
    React.createElement(EvalBar, { view: evaluation }),

    // Hint text
    React.createElement('p', { className: 'text-sm text-muted' },
      'Select 3\u20135 arcs to develop. ' + selectedArcs.size + ' of ' + arcs.length + ' selected.'
    ),

    // H15: say when the selection has left the band the outline prompt expects.
    ViewLogic.arcSelectionNote(selectedArcs.size) && React.createElement('p', {
      className: 'arc-selection__note'
    }, ViewLogic.arcSelectionNote(selectedArcs.size)),

    // Arc cards grid
    React.createElement('div', { className: 'arc-grid' },
      arcs.map(function (arc, index) {
        var arcId = arc.id || arc.title;
        var isSelected = selectedArcs.has(arcId);
        var isExpanded = expandedCards.has(arcId);
        // H7: every list the cards used to render (keyMoments,
        // financialConnections, thematicLinks, emotionalTone) is a field the arc
        // schema does not emit, so the cards showed a title, a red strength
        // badge and nothing else. arcCardModel reads the real names.
        var model = ViewLogic.arcCardModel(arc, evidenceIndex);
        var evidencePreview = isExpanded ? model.keyEvidence : model.keyEvidence.slice(0, 4);
        var hasMoreEvidence = model.keyEvidence.length > 4;
        var expandLabel = isExpanded
          ? 'Show fewer'
          : (hasMoreEvidence ? 'Show all ' + model.keyEvidence.length + ' documents' : 'Show the documents');
        var evalHistory = arc.evaluationHistory || {};

        return React.createElement('div', {
          key: arcId + '-' + index,
          className: 'arc-card' + (isSelected ? ' arc-card--selected' : '')
        },
          // Selection checkbox + title row
          React.createElement('div', { className: 'arc-card__header' },
            React.createElement('label', { className: 'checkbox-item' },
              React.createElement('input', {
                type: 'checkbox',
                className: 'checkbox-item__checkbox',
                checked: isSelected,
                onChange: function () { toggleArc(arcId); },
                'aria-label': 'Select arc: ' + (model.title || arcId)
              })
            ),
            React.createElement('span', { className: 'arc-card__title' }, model.title || arcId),
            React.createElement(Badge, {
              label: model.strength || 'strength unknown',
              color: getStrengthColor(model.strength)
            })
          ),

          // Source badge
          model.source && React.createElement('div', { className: 'arc-card__meta' },
            React.createElement(Badge, { label: 'source: ' + model.source, color: 'var(--accent-cyan)' })
          ),

          // Summary: the plain claim this thread makes about what happened
          model.summary && React.createElement('p', { className: 'text-sm text-secondary' },
            model.summary
          ),

          // Hook
          model.hook && React.createElement('p', { className: 'arc-card__hook text-sm text-secondary' },
            model.hook
          ),

          // Key evidence, by name. Collapsed it is a row of badges reading
          // "document (owner)"; expanded it lists every document with its id and
          // its first line, which is what the director needs to judge whether the
          // arc rests on anything (brief 1.2).
          model.keyEvidence.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' },
              'Key Evidence (' + model.keyEvidence.length + ')'
            ),
            isExpanded
              ? React.createElement('ul', { className: 'arc-card__moments' },
                  model.keyEvidence.map(function (entry, j) {
                    return React.createElement('li', { key: 'ev-' + j, className: 'text-xs text-secondary' },
                      entry.label,
                      React.createElement('span', { className: 'arc-card__document-line text-xs text-muted' }, entry.id),
                      entry.firstLine && React.createElement('span', {
                        className: 'arc-card__document-line text-xs text-muted'
                      }, entry.firstLine)
                    );
                  })
                )
              : React.createElement('div', { className: 'tag-list' },
                  evidencePreview.map(function (entry, j) {
                    return React.createElement(Badge, {
                      key: 'ev-' + j,
                      label: entry.label,
                      color: 'var(--layer-exposed)'
                    });
                  })
                ),
            React.createElement('button', {
              className: 'btn btn-ghost btn-sm',
              onClick: function () { toggleExpanded(arcId); },
              'aria-label': isExpanded
                ? 'Show fewer documents for this arc'
                : 'Show every document this arc rests on, with its first line'
            }, expandLabel)
          ),

          // Caveats: what complicates this arc
          model.caveats.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Caveats'),
            React.createElement('ul', { className: 'arc-card__moments' },
              model.caveats.map(function (caveat, j) {
                return React.createElement('li', { key: 'cav-' + j, className: 'text-xs arc-card__caveat' },
                  caveat
                );
              })
            )
          ),

          // Unanswered questions: what the arc cannot close
          model.unansweredQuestions.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Unanswered Questions'),
            React.createElement('ul', { className: 'arc-card__moments' },
              model.unansweredQuestions.map(function (question, j) {
                return React.createElement('li', { key: 'uq-' + j, className: 'text-xs text-secondary' },
                  question
                );
              })
            )
          ),

          // Character placements (an object map of roster name -> role)
          model.characters.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Characters'),
            React.createElement('div', { className: 'tag-list' },
              model.characters.map(function (character, j) {
                return React.createElement('span', {
                  key: 'ch-' + j,
                  className: 'character-tag'
                },
                  React.createElement('span', { className: 'character-tag__name' }, character.name),
                  React.createElement('span', { className: 'character-tag__role' }, character.role)
                );
              })
            )
          ),

          // Per-arc evaluation. Nothing populates arc.evaluationHistory today
          // (R5 F4) - the gate-level EvalBar above is the real verdict - but the
          // `.length` read is correct now rather than printing "[object Object]
          // issues" if a future payload does carry it.
          evalHistory.overallScore != null && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('div', { className: 'arc-card__eval' },
              React.createElement('span', { className: 'text-xs text-muted' }, 'Score'),
              React.createElement('span', { className: 'text-xs text-secondary' },
                String(evalHistory.overallScore)
              ),
              Array.isArray(evalHistory.structuralIssues) && React.createElement('span', { className: 'text-xs text-muted' },
                evalHistory.structuralIssues.length + ' issue' + (evalHistory.structuralIssues.length !== 1 ? 's' : '')
              )
            )
          )
        );
      })
    ),

    // Validation hint
    !isValid && React.createElement('p', { className: 'validation-error' },
      'Select at least 1 arc to continue.'
    ),

    // The stop's ONE note box (brief 1.2), always on screen and above the
    // actions. It was two boxes, one of them behind the Reject button, so the
    // director found "just a reject button that doesn't allow me to give any
    // feedback" and the cheapest intervention on the screen went unused.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'arc-note' },
        'Note to the writer, sent with whichever button you press'),
      React.createElement('p', { className: 'text-xs text-muted' },
        'With Approve it steers the outline and the article. With Send back it drives the arc rework, and then stands. Send back needs one.'),
      React.createElement('textarea', {
        id: 'arc-note',
        className: 'input feedback-area',
        value: noteText,
        onChange: function (e) { setNoteText(e.target.value); setSendBackArmed(false); },
        rows: 4,
        placeholder: 'e.g. Lead with the vote, not the money. Play down the Sarah ' +
          'succession thread. Answer: who decided Vic was guilty before the vote?',
        'aria-label': 'Note to the writer, sent with approve or send back'
      })
    ),

    // Action buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn action-modes__btn--active btn btn-primary',
        disabled: !isValid,
        onClick: handleSubmit,
        'aria-label': 'Approve the arc selection, sending the note with it'
      }, 'Approve Selection (' + selectedArcs.size + ' arc' + (selectedArcs.size !== 1 ? 's' : '') + ')'),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        onClick: handleSendBackClick,
        disabled: sendBack.disabled,
        'aria-label': sendBack.ariaLabel
      }, sendBack.label)
    )
  );
}

window.Console.checkpoints.ArcSelection = ArcSelection;
