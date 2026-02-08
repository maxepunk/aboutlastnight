/**
 * Article Checkpoint Component
 * Displays final article content bundle with headline, byline,
 * typed content blocks, pull quotes, evidence cards, financial tracker.
 * Supports approve, edit-and-approve, and reject with revision loop.
 * Includes HTML preview via sandboxed iframe.
 * Exports to window.Console.checkpoints.Article
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, safeStringify } = window.Console.utils;
const { RevisionDiff } = window.Console;

function Article({ data, onApprove, onReject, dispatch, revisionCache }) {
  const contentBundle = (data && data.contentBundle) || {};
  const assembledHtml = (data && data.assembledHtml) || '';
  const evaluationHistory = (data && data.evaluationHistory) || {};
  const previousArticle = (revisionCache && revisionCache.article) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  const headline = contentBundle.headline || {};
  const byline = contentBundle.byline || {};
  const sections = contentBundle.sections || [];
  const pullQuotes = contentBundle.pullQuotes || [];
  const evidenceCards = contentBundle.evidenceCards || [];
  const financialTracker = contentBundle.financialTracker || null;

  // Internal state
  const [mode, setMode] = React.useState('view');
  const [editText, setEditText] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  const [showHtmlPreview, setShowHtmlPreview] = React.useState(false);

  // Reset state when data changes
  const dataKey = safeStringify(contentBundle).slice(0, 100);
  React.useEffect(function () {
    setMode('view');
    setEditText('');
    setFeedbackText('');
    setJsonError('');
    setShowHtmlPreview(false);
  }, [dataKey]);

  // Word count across all paragraph blocks
  const wordCount = React.useMemo(function () {
    let count = 0;
    sections.forEach(function (section) {
      const content = section.content || [];
      content.forEach(function (block) {
        if (block.type === 'paragraph' && block.text) {
          count += block.text.split(/\s+/).filter(Boolean).length;
        }
      });
    });
    return count;
  }, [sections]);

  function handleModeChange(newMode) {
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'edit') {
      setEditText(safeStringify(contentBundle, 2));
      setJsonError('');
    }
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleApprove() {
    onApprove({ article: true });
  }

  function handleEditApprove() {
    try {
      const parsed = JSON.parse(editText);
      setJsonError('');
      onApprove({ article: true, articleEdits: parsed });
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
    }
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    // Cache current content bundle for diff on next revision
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'article', data: contentBundle });
    }
    onReject({ article: false, articleFeedback: feedbackText.trim() });
  }

  // -- Content block renderers --

  function renderContentBlock(block, index) {
    if (!block || !block.type) return null;

    switch (block.type) {
      case 'paragraph':
        return React.createElement('div', {
          key: 'block-' + index,
          className: 'article-block article-block--paragraph'
        },
          React.createElement('p', { className: 'text-sm' }, block.text || '')
        );

      case 'quote':
        return React.createElement('blockquote', {
          key: 'block-' + index,
          className: 'article-block article-block--quote'
        },
          React.createElement('p', { className: 'article-block__quote-text' },
            '\u201C' + (block.text || '') + '\u201D'
          ),
          block.attribution && React.createElement('cite', { className: 'article-block__quote-cite' },
            '\u2014 ' + block.attribution
          )
        );

      case 'evidence-reference':
        return React.createElement('div', {
          key: 'block-' + index,
          className: 'article-block article-block--evidence'
        },
          React.createElement('div', { className: 'article-block__evidence-header' },
            React.createElement(Badge, { label: 'Evidence', color: 'var(--accent-amber)' }),
            block.id && React.createElement('span', { className: 'text-xs text-muted' }, block.id)
          ),
          block.text && React.createElement('p', { className: 'text-sm' }, block.text),
          block.description && React.createElement('p', { className: 'text-xs text-secondary' }, block.description)
        );

      case 'photo':
        return React.createElement('div', {
          key: 'block-' + index,
          className: 'article-block article-block--photo'
        },
          React.createElement('div', { className: 'article-block__photo-placeholder' },
            '[Photo' + (block.filename ? ': ' + block.filename : '') + ']'
          ),
          block.caption && React.createElement('p', { className: 'text-xs text-secondary mt-sm' }, block.caption)
        );

      case 'list':
        return React.createElement('div', {
          key: 'block-' + index,
          className: 'article-block article-block--list'
        },
          React.createElement('ul', { className: 'checkpoint-section__list text-sm' },
            (block.items || []).map(function (item, j) {
              return React.createElement('li', { key: 'item-' + j }, typeof item === 'string' ? item : (item.text || safeStringify(item)));
            })
          )
        );

      default:
        return React.createElement('div', {
          key: 'block-' + index,
          className: 'article-block text-xs text-muted'
        }, '[' + block.type + ' block]');
    }
  }

  // -- Evaluation bar --
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

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousArticle,
      current: contentBundle,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback
    }),

    // Evaluation bar
    renderEvalBar(),

    // Word count
    wordCount > 0 && React.createElement('div', { className: 'word-count' },
      React.createElement('span', { className: 'word-count__value' }, wordCount.toLocaleString()),
      React.createElement('span', { className: 'word-count__label' }, ' words')
    ),

    // Headline
    (headline.main || headline.kicker || headline.deck) && React.createElement('div', { className: 'outline-section' },
      headline.kicker && React.createElement('p', { className: 'text-xs text-muted mb-sm article-headline__kicker' },
        headline.kicker
      ),
      headline.main && React.createElement('h3', { className: 'article-headline__main' },
        headline.main
      ),
      headline.deck && React.createElement('p', { className: 'text-sm text-secondary mt-sm article-headline__deck' },
        headline.deck
      )
    ),

    // Byline
    (byline.author || byline.title) && React.createElement('div', { className: 'text-xs text-muted mb-md' },
      [byline.author, byline.title, byline.location, byline.date].filter(Boolean).join(' \u2022 ')
    ),

    // Content sections
    sections.map(function (section, i) {
      return React.createElement('div', {
        key: (section.id || 'section') + '-' + i,
        className: 'outline-section'
      },
        React.createElement('h4', { className: 'outline-section__title' },
          section.heading || section.id || 'Section ' + (i + 1)
        ),
        section.type && React.createElement(Badge, {
          label: section.type,
          color: 'var(--accent-cyan)'
        }),
        React.createElement('div', { className: 'outline-section__content mt-sm' },
          (section.content || []).map(function (block, j) {
            return renderContentBlock(block, i + '-' + j);
          })
        )
      );
    }),

    // Pull quotes summary
    pullQuotes.length > 0 && React.createElement(CollapsibleSection, {
      title: 'Pull Quotes (' + pullQuotes.length + ')',
      defaultOpen: false
    },
      pullQuotes.map(function (pq, i) {
        return React.createElement('div', { key: 'pq-' + i, className: 'pull-quote' },
          React.createElement('p', { className: 'pull-quote__text' },
            '\u201C' + (pq.text || '') + '\u201D'
          ),
          pq.attribution && React.createElement('p', { className: 'pull-quote__attribution' },
            '\u2014 ' + pq.attribution
          )
        );
      })
    ),

    // Evidence cards summary
    evidenceCards.length > 0 && React.createElement(CollapsibleSection, {
      title: 'Evidence Cards (' + evidenceCards.length + ')',
      defaultOpen: false
    },
      evidenceCards.map(function (card, i) {
        return React.createElement('div', { key: 'ec-' + i, className: 'evidence-item mb-sm' },
          React.createElement('div', { className: 'evidence-item__header' },
            React.createElement('span', { className: 'evidence-item__name' },
              card.title || card.id || 'Card ' + (i + 1)
            ),
            card.layer && React.createElement(Badge, {
              label: card.layer,
              color: card.layer === 'exposed' ? 'var(--layer-exposed)' :
                     card.layer === 'buried' ? 'var(--layer-buried)' : 'var(--accent-amber)'
            })
          ),
          card.description && React.createElement('p', { className: 'text-xs text-secondary' }, card.description)
        );
      })
    ),

    // Financial tracker summary
    financialTracker && React.createElement(CollapsibleSection, {
      title: 'Financial Tracker',
      defaultOpen: false
    },
      React.createElement('pre', { className: 'text-xs' }, safeStringify(financialTracker, 2))
    ),

    // HTML Preview toggle
    assembledHtml && React.createElement('div', { className: 'mt-md' },
      React.createElement('button', {
        className: 'btn btn-secondary btn-sm',
        onClick: function () { setShowHtmlPreview(!showHtmlPreview); },
        'aria-label': showHtmlPreview ? 'Hide HTML preview' : 'Show HTML preview'
      }, showHtmlPreview ? 'Hide HTML Preview' : 'Show HTML Preview'),

      showHtmlPreview && React.createElement('div', { className: 'html-preview mt-md fade-in' },
        React.createElement('iframe', {
          className: 'html-preview__frame',
          srcDoc: assembledHtml,
          sandbox: 'allow-same-origin',
          title: 'Article HTML Preview'
        })
      )
    ),

    // Action mode buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        'aria-label': 'Approve article'
      }, 'Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'edit' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('edit'); },
        'aria-label': 'Edit article before approving'
      }, 'Edit & Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject article with feedback'
      }, 'Reject')
    ),

    // Edit mode
    mode === 'edit' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Edit Article JSON'),
      React.createElement('textarea', {
        className: 'input input-mono edit-area',
        value: editText,
        onChange: function (e) { setEditText(e.target.value); setJsonError(''); },
        rows: 20,
        'aria-label': 'Edit article JSON'
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
        'aria-label': 'Rejection feedback for article'
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

window.Console.checkpoints.Article = Article;
