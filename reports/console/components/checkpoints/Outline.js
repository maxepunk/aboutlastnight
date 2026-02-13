/**
 * Outline Checkpoint Component
 * Displays article outline with structured sections.
 * Journalist: LEDE, THE STORY, FOLLOW THE MONEY, THE PLAYERS, WHAT'S MISSING, CLOSING
 * Detective: EXECUTIVE SUMMARY, EVIDENCE LOCKER, MEMORY ANALYSIS, SUSPECT NETWORK,
 *            OUTSTANDING QUESTIONS, FINAL ASSESSMENT
 * Supports approve, edit-and-approve, and reject with revision loop.
 * Exports to window.Console.checkpoints.Outline
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, safeStringify } = window.Console.utils;
const { RevisionDiff } = window.Console;

function Outline({ data, onApprove, onReject, dispatch, revisionCache, theme }) {
  const outline = (data && data.outline) || {};
  const evaluationHistory = (data && data.evaluationHistory) || {};
  const previousOutline = (revisionCache && revisionCache.outline) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  // Detect theme from outline data if not passed via props
  const isDetective = theme === 'detective' || (!theme && outline.executiveSummary != null);

  // Internal state
  const [mode, setMode] = React.useState('view');
  const [editText, setEditText] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');

  // Reset state when data changes
  const dataKey = safeStringify(outline).slice(0, 100);
  React.useEffect(function () {
    setMode('view');
    setEditText('');
    setFeedbackText('');
    setJsonError('');
  }, [dataKey]);

  function handleModeChange(newMode) {
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'edit') {
      setEditText(safeStringify(outline, 2));
      setJsonError('');
    }
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleApprove() {
    onApprove({ outline: true });
  }

  function handleEditApprove() {
    try {
      const parsed = JSON.parse(editText);
      setJsonError('');
      onApprove({ outline: true, outlineEdits: parsed });
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
    }
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    // Cache current outline for diff on next revision
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'outline', data: outline });
    }
    onReject({ outline: false, outlineFeedback: feedbackText.trim() });
  }

  // ═══════════════════════════════════════════════════════
  // Journalist section renderers
  // ═══════════════════════════════════════════════════════

  function renderLede(lede) {
    if (!lede) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
      React.createElement('div', { className: 'outline-section__content' },
        lede.hook && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Hook: '),
          typeof lede.hook === 'string' ? lede.hook : safeStringify(lede.hook)
        ),
        lede.keyTension && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Key Tension: '),
          typeof lede.keyTension === 'string' ? lede.keyTension : safeStringify(lede.keyTension)
        ),
        lede.selectedEvidence && React.createElement('p', { className: 'text-xs text-muted' },
          'Evidence: ' + (Array.isArray(lede.selectedEvidence) ? lede.selectedEvidence.join(', ') : lede.selectedEvidence)
        )
      )
    );
  }

  function renderTheStory(theStory) {
    if (!theStory) return null;
    const arcs = theStory.arcs || [];
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'THE STORY'),
      React.createElement('div', { className: 'outline-section__content' },
        arcs.map(function (arc, i) {
          return React.createElement('div', {
            key: (arc.name || 'arc') + '-' + i,
            className: 'outline-section__arc mb-sm'
          },
            React.createElement('p', { className: 'text-sm' },
              React.createElement('strong', null, arc.name || 'Arc ' + (i + 1)),
              arc.paragraphCount != null && React.createElement('span', { className: 'text-xs text-muted' },
                ' (' + arc.paragraphCount + ' paragraphs)'
              )
            ),
            arc.keyPoints && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
              (Array.isArray(arc.keyPoints) ? arc.keyPoints : [arc.keyPoints]).map(function (point, j) {
                return React.createElement('li', { key: 'kp-' + j },
                  typeof point === 'string' ? point : safeStringify(point)
                );
              })
            ),
            arc.evidenceCards && React.createElement('div', { className: 'tag-list mt-sm' },
              (Array.isArray(arc.evidenceCards) ? arc.evidenceCards : [arc.evidenceCards]).map(function (card, j) {
                return React.createElement(Badge, {
                  key: 'ec-' + j,
                  label: typeof card === 'string' ? card : (card.id || card.title || 'Card ' + (j + 1)),
                  color: 'var(--accent-amber)'
                });
              })
            ),
            arc.photoPlacement && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
              'Photo: ' + (typeof arc.photoPlacement === 'string' ? arc.photoPlacement : safeStringify(arc.photoPlacement))
            )
          );
        }),
        theStory.arcInterweaving && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
          React.createElement('strong', null, 'Arc Interweaving: '),
          typeof theStory.arcInterweaving === 'string' ? theStory.arcInterweaving : safeStringify(theStory.arcInterweaving)
        )
      )
    );
  }

  function renderNamedSection(title, section) {
    if (!section) return null;
    const focus = section.arcConnections || section.focus || null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, title),
      React.createElement('div', { className: 'outline-section__content' },
        focus && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Focus: '),
          typeof focus === 'string' ? focus : safeStringify(focus)
        ),
        section.shellAccounts && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Shell Accounts: '),
          Array.isArray(section.shellAccounts) ? section.shellAccounts.join(', ') : section.shellAccounts
        ),
        section.characterHighlights && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Character Highlights: '),
          typeof section.characterHighlights === 'string' ? section.characterHighlights : safeStringify(section.characterHighlights)
        ),
        section.buriedItems && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Buried Items: '),
          Array.isArray(section.buriedItems) ? section.buriedItems.join(', ') : section.buriedItems
        )
      )
    );
  }

  function renderClosing(closing) {
    if (!closing) return null;
    const resolutions = closing.arcResolutions || closing.theme || null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
      React.createElement('div', { className: 'outline-section__content' },
        resolutions && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Resolutions: '),
          typeof resolutions === 'string' ? resolutions : safeStringify(resolutions)
        ),
        closing.systemicAngle && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Systemic Angle: '),
          typeof closing.systemicAngle === 'string' ? closing.systemicAngle : safeStringify(closing.systemicAngle)
        ),
        closing.finalLine && React.createElement('p', { className: 'text-sm text-secondary text-italic' },
          typeof closing.finalLine === 'string' ? closing.finalLine : safeStringify(closing.finalLine)
        )
      )
    );
  }

  function renderPullQuotes(pullQuotes) {
    if (!pullQuotes || pullQuotes.length === 0) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'PULL QUOTES'),
      React.createElement('div', { className: 'outline-section__content' },
        pullQuotes.map(function (pq, i) {
          return React.createElement('div', { key: 'pq-' + i, className: 'pull-quote' },
            React.createElement('p', { className: 'pull-quote__text' },
              '\u201C' + (pq.text || '') + '\u201D'
            ),
            (pq.attribution || pq.placement) && React.createElement('div', { className: 'pull-quote__attribution' },
              pq.attribution && React.createElement('span', null, '\u2014 ' + pq.attribution),
              pq.placement && React.createElement('span', { className: 'text-xs text-muted' },
                ' [' + pq.placement + ']'
              )
            )
          );
        })
      )
    );
  }

  // ═══════════════════════════════════════════════════════
  // Detective section renderers
  // ═══════════════════════════════════════════════════════

  function renderExecutiveSummary(section) {
    if (!section) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'EXECUTIVE SUMMARY'),
      React.createElement('div', { className: 'outline-section__content' },
        section.hook && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Hook: '),
          typeof section.hook === 'string' ? section.hook : safeStringify(section.hook)
        ),
        section.caseOverview && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Case Overview: '),
          typeof section.caseOverview === 'string' ? section.caseOverview : safeStringify(section.caseOverview)
        ),
        section.primaryFindings && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          (Array.isArray(section.primaryFindings) ? section.primaryFindings : [section.primaryFindings]).map(function (finding, i) {
            return React.createElement('li', { key: 'finding-' + i },
              typeof finding === 'string' ? finding : safeStringify(finding)
            );
          })
        )
      )
    );
  }

  function renderEvidenceLocker(section) {
    if (!section) return null;
    const groups = section.evidenceGroups || [];
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE LOCKER'),
      React.createElement('div', { className: 'outline-section__content' },
        groups.map(function (group, i) {
          return React.createElement('div', {
            key: 'eg-' + i,
            className: 'outline-section__arc mb-sm'
          },
            React.createElement('p', { className: 'text-sm' },
              React.createElement('strong', null, group.theme || 'Evidence Group ' + (i + 1))
            ),
            group.synthesis && React.createElement('p', { className: 'text-xs text-secondary mb-sm' },
              typeof group.synthesis === 'string' ? group.synthesis : safeStringify(group.synthesis)
            ),
            group.evidenceIds && React.createElement('div', { className: 'tag-list mt-sm' },
              (Array.isArray(group.evidenceIds) ? group.evidenceIds : [group.evidenceIds]).map(function (id, j) {
                return React.createElement(Badge, {
                  key: 'eid-' + j,
                  label: typeof id === 'string' ? id : safeStringify(id),
                  color: 'var(--accent-amber)'
                });
              })
            )
          );
        })
      )
    );
  }

  function renderMemoryAnalysis(section) {
    if (!section) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'MEMORY ANALYSIS'),
      React.createElement('div', { className: 'outline-section__content' },
        section.focus && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Focus: '),
          typeof section.focus === 'string' ? section.focus : safeStringify(section.focus)
        ),
        section.keyPatterns && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          (Array.isArray(section.keyPatterns) ? section.keyPatterns : [section.keyPatterns]).map(function (pattern, i) {
            return React.createElement('li', { key: 'mp-' + i },
              typeof pattern === 'string' ? pattern : safeStringify(pattern)
            );
          })
        ),
        section.significance && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
          React.createElement('strong', null, 'Significance: '),
          typeof section.significance === 'string' ? section.significance : safeStringify(section.significance)
        )
      )
    );
  }

  function renderSuspectNetwork(section) {
    if (!section) return null;
    const relationships = section.keyRelationships || [];
    const assessments = section.assessments || [];
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'SUSPECT NETWORK'),
      React.createElement('div', { className: 'outline-section__content' },
        relationships.length > 0 && React.createElement('div', { className: 'mb-sm' },
          React.createElement('strong', { className: 'text-sm' }, 'Key Relationships:'),
          React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
            relationships.map(function (rel, i) {
              const chars = Array.isArray(rel.characters) ? rel.characters.join(' \u2194 ') : safeStringify(rel.characters);
              return React.createElement('li', { key: 'rel-' + i },
                chars + (rel.nature ? ' \u2014 ' + rel.nature : '')
              );
            })
          )
        ),
        assessments.length > 0 && React.createElement('div', null,
          React.createElement('strong', { className: 'text-sm' }, 'Suspect Assessments:'),
          React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
            assessments.map(function (a, i) {
              return React.createElement('li', { key: 'assess-' + i },
                React.createElement('strong', null, a.name || 'Unknown'),
                ' \u2014 ' + (a.role || 'Role unknown'),
                a.suspicionLevel && React.createElement(Badge, {
                  label: a.suspicionLevel,
                  color: a.suspicionLevel === 'high' ? 'var(--accent-red)' :
                         a.suspicionLevel === 'moderate' ? 'var(--accent-amber)' :
                         'var(--accent-teal)'
                })
              );
            })
          )
        )
      )
    );
  }

  function renderOutstandingQuestions(section) {
    if (!section) return null;
    const questions = section.questions || [];
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'OUTSTANDING QUESTIONS'),
      React.createElement('div', { className: 'outline-section__content' },
        questions.length > 0 && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
          questions.map(function (q, i) {
            return React.createElement('li', { key: 'oq-' + i },
              typeof q === 'string' ? q : safeStringify(q)
            );
          })
        ),
        section.investigativeGaps && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
          React.createElement('strong', null, 'Investigative Gaps: '),
          typeof section.investigativeGaps === 'string' ? section.investigativeGaps : safeStringify(section.investigativeGaps)
        )
      )
    );
  }

  function renderFinalAssessment(section) {
    if (!section) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'FINAL ASSESSMENT'),
      React.createElement('div', { className: 'outline-section__content' },
        section.accusationHandling && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Accusation: '),
          typeof section.accusationHandling === 'string' ? section.accusationHandling : safeStringify(section.accusationHandling)
        ),
        section.verdict && React.createElement('p', { className: 'text-sm mb-sm' },
          React.createElement('strong', null, 'Verdict: '),
          typeof section.verdict === 'string' ? section.verdict : safeStringify(section.verdict)
        ),
        section.closingLine && React.createElement('p', { className: 'text-sm text-secondary text-italic' },
          typeof section.closingLine === 'string' ? section.closingLine : safeStringify(section.closingLine)
        )
      )
    );
  }

  // ═══════════════════════════════════════════════════════
  // Evaluation bar (shared)
  // ═══════════════════════════════════════════════════════

  function renderEvalBar() {
    const score = evaluationHistory.overallScore;
    const issues = evaluationHistory.structuralIssues;
    const advisory = evaluationHistory.advisoryNotes;
    if (score == null && issues == null && advisory == null) return null;

    return React.createElement('div', { className: 'eval-bar mb-md' },
      score != null && React.createElement('span', { className: 'eval-bar__score' },
        'Score: ' + score + '/10'
      ),
      issues != null && React.createElement('span', { className: 'eval-bar__issues' },
        issues + ' structural issue' + (issues !== 1 ? 's' : '')
      ),
      advisory != null && React.createElement('span', { className: 'text-xs text-muted' },
        Array.isArray(advisory) ? advisory.length + ' advisory note' + (advisory.length !== 1 ? 's' : '') : advisory
      )
    );
  }

  // ═══════════════════════════════════════════════════════
  // Render outline sections based on theme
  // ═══════════════════════════════════════════════════════

  function renderOutlineSections() {
    if (isDetective) {
      return [
        renderExecutiveSummary(outline.executiveSummary),
        renderEvidenceLocker(outline.evidenceLocker),
        renderMemoryAnalysis(outline.memoryAnalysis),
        renderSuspectNetwork(outline.suspectNetwork),
        renderOutstandingQuestions(outline.outstandingQuestions),
        renderFinalAssessment(outline.finalAssessment)
      ];
    }
    // Journalist (default)
    return [
      renderLede(outline.lede),
      renderTheStory(outline.theStory),
      renderNamedSection('FOLLOW THE MONEY', outline.followTheMoney),
      renderNamedSection('THE PLAYERS', outline.thePlayers),
      renderNamedSection('WHAT\'S MISSING', outline.whatsMissing),
      renderClosing(outline.closing),
      renderPullQuotes(outline.pullQuotes)
    ];
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousOutline,
      current: outline,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback
    }),

    // Evaluation bar
    renderEvalBar(),

    // Outline sections (theme-aware)
    ...renderOutlineSections(),

    // Action mode buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        'aria-label': 'Approve outline'
      }, 'Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'edit' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('edit'); },
        'aria-label': 'Edit outline before approving'
      }, 'Edit & Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject outline with feedback'
      }, 'Reject')
    ),

    // Edit mode
    mode === 'edit' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Edit Outline JSON'),
      React.createElement('textarea', {
        className: 'input input-mono edit-area',
        value: editText,
        onChange: function (e) { setEditText(e.target.value); setJsonError(''); },
        rows: 20,
        'aria-label': 'Edit outline JSON'
      }),
      jsonError && React.createElement('p', { className: 'validation-error' }, jsonError),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleEditApprove,
        'aria-label': 'Save edits and approve'
      }, 'Save & Approve')
    ),

    // Reject mode
    mode === 'reject' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Feedback for revision'),
      React.createElement('textarea', {
        className: 'input feedback-area',
        value: feedbackText,
        onChange: function (e) { setFeedbackText(e.target.value); },
        rows: 4,
        placeholder: 'Describe what needs to change...',
        'aria-label': 'Rejection feedback for outline'
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

window.Console.checkpoints.Outline = Outline;
