/**
 * ArcSelection Checkpoint Component
 * Displays narrative arcs as selectable cards in a responsive grid.
 * Each card shows title, evidence strength, source, tone, hook,
 * key moments, evidence breakdown, character placements, financial
 * connections, thematic links, and evaluation score.
 * Supports approve with selection and reject-with-feedback for revision.
 * Exports to window.Console.checkpoints.ArcSelection
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;
const { RevisionDiff } = window.Console;

function ArcSelection({ data, onApprove, onReject, dispatch, revisionCache }) {
  const arcs = (data && data.narrativeArcs) || [];
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 2;
  const previousArcs = (revisionCache && revisionCache.arcs) || null;

  // Selected arc IDs
  const [selectedArcs, setSelectedArcs] = React.useState(function () {
    var initial = new Set();
    arcs.forEach(function (arc) {
      initial.add(arc.id || arc.title);
    });
    return initial;
  });

  // Track which cards are expanded (for key moments overflow)
  const [expandedCards, setExpandedCards] = React.useState(new Set());

  // Action mode: 'view' (default) or 'reject'
  const [mode, setMode] = React.useState('view');
  const [feedbackText, setFeedbackText] = React.useState('');

  // Reset selection when arcs change (e.g., after rollback or revision)
  // Use serialized IDs (not just length) to detect same-count data swaps
  const arcIdKey = arcs.map(function (arc) { return arc.id || arc.title; }).join(',');
  React.useEffect(function () {
    var all = new Set();
    arcs.forEach(function (arc) {
      all.add(arc.id || arc.title);
    });
    setSelectedArcs(all);
    setExpandedCards(new Set());
    setMode('view');
    setFeedbackText('');
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
    onApprove({ selectedArcs: Array.from(selectedArcs) });
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

  function getStrengthColor(strength) {
    var upper = (strength || '').toUpperCase();
    if (upper === 'HIGH') return 'var(--accent-green)';
    if (upper === 'MEDIUM') return 'var(--accent-amber)';
    return 'var(--accent-red)';
  }

  function getStrengthBarClass(strength) {
    var upper = (strength || '').toUpperCase();
    if (upper === 'HIGH') return 'arc-card__score-fill--high';
    if (upper === 'MEDIUM') return 'arc-card__score-fill--medium';
    return 'arc-card__score-fill--low';
  }

  const isValid = selectedArcs.size >= 1;

  if (arcs.length === 0) {
    return React.createElement('div', { className: 'flex flex-col gap-md' },
      React.createElement('p', { className: 'text-muted text-sm' }, 'No narrative arcs available.'),
      React.createElement('div', { className: 'flex gap-md mt-md' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: function () { onApprove({ selectedArcs: [] }); }
        }, 'Continue')
      )
    );
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousArcs,
      current: arcs,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback
    }),

    // Hint text
    React.createElement('p', { className: 'text-sm text-muted' },
      'Select 3\u20135 arcs to develop. ' + selectedArcs.size + ' of ' + arcs.length + ' selected.'
    ),

    // Arc cards grid
    React.createElement('div', { className: 'arc-grid' },
      arcs.map(function (arc) {
        var arcId = arc.id || arc.title;
        var isSelected = selectedArcs.has(arcId);
        var isExpanded = expandedCards.has(arcId);
        var keyMoments = arc.keyMoments || [];
        var evidence = arc.evidence || [];
        var placements = arc.characterPlacements || {};
        var financials = arc.financialConnections || [];
        var thematic = arc.thematicLinks || [];
        var evalHistory = arc.evaluationHistory || {};

        // Evidence breakdown
        var exposedEvidence = evidence.filter(function (e) { return e.layer === 'exposed'; }).length;
        var buriedEvidence = evidence.filter(function (e) { return e.layer === 'buried'; }).length;

        // Key moments: normalize to strings
        var momentStrings = keyMoments.map(function (m) {
          return typeof m === 'string' ? m : (m.description || '');
        });
        var previewMoments = momentStrings.slice(0, 3);
        var hasMoreMoments = momentStrings.length > 3;

        // Financial connections: normalize to strings
        var financialStrings = financials.map(function (f) {
          return typeof f === 'string' ? f : (f.description || '');
        });

        // Character placement entries
        var placementEntries = Object.entries(placements);

        return React.createElement('div', {
          key: arcId + '-' + arcs.indexOf(arc),
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
                'aria-label': 'Select arc: ' + (arc.title || arcId)
              })
            ),
            React.createElement('span', { className: 'arc-card__title' }, arc.title || arcId),
            React.createElement(Badge, {
              label: arc.evidenceStrength || 'UNKNOWN',
              color: getStrengthColor(arc.evidenceStrength)
            })
          ),

          // Source + tone
          React.createElement('div', { className: 'arc-card__meta' },
            arc.arcSource && React.createElement('span', { className: 'text-xs text-muted' },
              'Source: ' + arc.arcSource
            ),
            arc.emotionalTone && React.createElement('span', { className: 'text-xs text-muted' },
              'Tone: ' + arc.emotionalTone
            )
          ),

          // Hook
          arc.hook && React.createElement('p', { className: 'arc-card__hook text-sm text-secondary' },
            arc.hook
          ),

          // Key Moments
          previewMoments.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Key Moments'),
            React.createElement('ul', { className: 'arc-card__moments' },
              (isExpanded ? momentStrings : previewMoments).map(function (moment, j) {
                return React.createElement('li', { key: 'moment-' + j, className: 'text-xs text-secondary' },
                  truncate(moment, 60)
                );
              })
            ),
            hasMoreMoments && React.createElement('button', {
              className: 'btn btn-ghost btn-sm',
              onClick: function () { toggleExpanded(arcId); }
            }, isExpanded ? 'Show fewer' : '+' + (momentStrings.length - 3) + ' more')
          ),

          // Evidence breakdown
          evidence.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Evidence'),
            React.createElement('div', { className: 'tag-list' },
              React.createElement(Badge, {
                label: evidence.length + ' total',
                color: 'var(--accent-amber)'
              }),
              exposedEvidence > 0 && React.createElement(Badge, {
                label: exposedEvidence + ' exposed',
                color: 'var(--layer-exposed)'
              }),
              buriedEvidence > 0 && React.createElement(Badge, {
                label: buriedEvidence + ' buried',
                color: 'var(--layer-buried)'
              })
            )
          ),

          // Character Placements
          placementEntries.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Characters'),
            React.createElement('div', { className: 'tag-list' },
              placementEntries.map(function (entry) {
                return React.createElement('span', {
                  key: entry[0],
                  className: 'character-tag'
                },
                  React.createElement('span', { className: 'character-tag__name' }, entry[0]),
                  React.createElement('span', { className: 'character-tag__role' }, entry[1])
                );
              })
            )
          ),

          // Financial Connections
          financialStrings.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Financial Connections'),
            React.createElement('ul', { className: 'arc-card__moments' },
              financialStrings.slice(0, 2).map(function (fc, j) {
                return React.createElement('li', { key: 'fc-' + j, className: 'text-xs text-secondary' },
                  truncate(fc, 50)
                );
              })
            ),
            financialStrings.length > 2 && React.createElement('span', { className: 'text-xs text-muted' },
              '+' + (financialStrings.length - 2) + ' more'
            )
          ),

          // Thematic Links
          thematic.length > 0 && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Themes'),
            React.createElement('div', { className: 'tag-list' },
              thematic.map(function (theme) {
                return React.createElement(Badge, {
                  key: theme,
                  label: theme,
                  color: 'var(--accent-cyan)'
                });
              })
            )
          ),

          // Evaluation score
          evalHistory.overallScore != null && React.createElement('div', { className: 'arc-card__section' },
            React.createElement('div', { className: 'arc-card__eval' },
              React.createElement('span', { className: 'text-xs text-muted' }, 'Score'),
              React.createElement('div', { className: 'arc-card__score-bar' },
                React.createElement('div', {
                  className: 'arc-card__score-fill ' + getStrengthBarClass(
                    evalHistory.overallScore >= 7 ? 'HIGH' :
                    evalHistory.overallScore >= 4 ? 'MEDIUM' : 'LOW'
                  ),
                  style: { width: Math.min(evalHistory.overallScore * 10, 100) + '%' }
                })
              ),
              React.createElement('span', { className: 'text-xs text-secondary' },
                evalHistory.overallScore + '/10'
              ),
              evalHistory.structuralIssues != null && React.createElement('span', { className: 'text-xs text-muted' },
                evalHistory.structuralIssues + ' issue' + (evalHistory.structuralIssues !== 1 ? 's' : '')
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
