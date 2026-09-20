/**
 * ArcSelection Checkpoint Component
 * Displays narrative arcs as selectable cards in a responsive grid.
 * Each card shows title, summary, hook, key evidence, caveats, unanswered
 * questions, source and strength badges, and character placements.
 * Supports approve with selection (plus optional outline guidance) and
 * reject-with-feedback for revision.
 * Exports to window.Console.checkpoints.ArcSelection
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, EvalBar } = window.Console.utils;
const { RevisionDiff } = window.Console;
const ViewLogic = window.Console.checkpointViewLogic;

function ArcSelection({ data, onApprove, onReject, onRollback, dispatch, revisionCache }) {
  const arcs = (data && data.narrativeArcs) || [];
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 2;
  const previousArcs = (revisionCache && revisionCache.arcs) || null;
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

  // Action mode: 'view' (default) or 'reject'
  const [mode, setMode] = React.useState('view');
  const [feedbackText, setFeedbackText] = React.useState('');
  // Q2: optional emphasis, carried into the outline AND article prompts.
  const [guidanceText, setGuidanceText] = React.useState('');

  // Reset selection when arcs change (e.g., after rollback or revision)
  // Use serialized IDs (not just length) to detect same-count data swaps
  const arcIdKey = arcs.map(function (arc) { return arc.id || arc.title; }).join(',');
  React.useEffect(function () {
    setSelectedArcs(new Set(ViewLogic.defaultArcSelection(arcs)));
    setExpandedCards(new Set());
    setMode('view');
    setFeedbackText('');
    setGuidanceText('');
  }, [arcIdKey]);

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
    const payload = { selectedArcs: Array.from(selectedArcs) };
    // Only on an APPROVAL: a rejection regenerates the arcs and arcFeedback is
    // the channel for that (server.js buildResumePayload).
    if (guidanceText.trim()) payload.outlineGuidance = guidanceText.trim();
    onApprove(payload);
  }

  function handleModeChange(newMode) {
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    // Cache current arcs for diff on next revision
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'arcs', data: arcs });
    }
    onReject({ selectedArcs: false, arcFeedback: feedbackText.trim() });
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
      maxHumanRevisions: (data && data.maxHumanRevisions) || 0,
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
        var model = ViewLogic.arcCardModel(arc);
        var evidencePreview = isExpanded ? model.keyEvidence : model.keyEvidence.slice(0, 4);
        var hasMoreEvidence = model.keyEvidence.length > 4;
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

          // Summary: the 2-3 sentences that say what this arc IS
          model.summary && React.createElement('p', { className: 'text-sm text-secondary' },
            model.summary
          ),

          // Hook
          model.hook && React.createElement('p', { className: 'arc-card__hook text-sm text-secondary' },
            model.hook
          ),

          // Key evidence (ids, with owners where the package carries them)
          evidencePreview.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' },
              'Key Evidence (' + model.keyEvidence.length + ')'
            ),
            React.createElement('div', { className: 'tag-list' },
              evidencePreview.map(function (id, j) {
                return React.createElement(Badge, {
                  key: 'ev-' + j,
                  label: id,
                  color: 'var(--layer-exposed)'
                });
              })
            ),
            hasMoreEvidence && React.createElement('button', {
              className: 'btn btn-ghost btn-sm',
              onClick: function () { toggleExpanded(arcId); },
              'aria-label': isExpanded ? 'Show fewer evidence ids' : 'Show all evidence ids'
            }, isExpanded ? 'Show fewer' : '+' + (model.keyEvidence.length - 4) + ' more')
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
    !isValid && mode !== 'reject' && React.createElement('p', { className: 'validation-error' },
      'Select at least 1 arc to continue.'
    ),

    // Q2: the director's emphasis for the outline. This is the cheapest
    // intervention on the whole screen - a sentence here steers the outline and
    // article prompts, instead of a rejection that regenerates the arcs.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'outline-guidance' },
        'Note to the outline (optional): what to lead with, what to play down, ' +
        'what question the piece should answer'
      ),
      React.createElement('textarea', {
        id: 'outline-guidance',
        className: 'input',
        value: guidanceText,
        onChange: function (e) { setGuidanceText(e.target.value); },
        rows: 3,
        placeholder: 'e.g. Lead with the vote, not the money. Play down the Sarah ' +
          'succession thread. Answer: who decided Vic was guilty before the vote?',
        'aria-label': 'Note to the outline'
      })
    ),

    // Action mode buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        disabled: !isValid,
        onClick: handleSubmit,
        'aria-label': 'Approve arc selection'
      }, 'Approve Selection (' + selectedArcs.size + ' arc' + (selectedArcs.size !== 1 ? 's' : '') + ')'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject arcs with feedback for revision'
      }, 'Reject')
    ),

    // Reject mode
    mode === 'reject' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Feedback for arc revision'),
      React.createElement('textarea', {
        className: 'input feedback-area',
        value: feedbackText,
        onChange: function (e) { setFeedbackText(e.target.value); },
        rows: 4,
        placeholder: 'Describe what needs to change about the arcs...',
        'aria-label': 'Rejection feedback for arcs'
      }),
      React.createElement('button', {
        className: 'btn btn-danger',
        onClick: handleReject,
        disabled: !feedbackText.trim(),
        'aria-label': 'Submit rejection with feedback'
      }, 'Submit Rejection')
    )
  );
}

window.Console.checkpoints.ArcSelection = ArcSelection;
