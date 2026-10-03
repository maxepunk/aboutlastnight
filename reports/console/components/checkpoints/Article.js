/**
 * Article Checkpoint Component: the director's desk (spec 2026-10-02 section 6.3; phase 4,
 * task 4.3).
 *
 * The article as it will print, with every editor visible. Each piece of the article is a
 * row whose controls sit in a rail, a column of its own beside it (deskRow), so no control
 * covers the prose: the pencil on every piece and, on each block, move, delete and insert.
 * The director edits any text in place (the headline, the deck, the captions and the
 * section headings included), moves, deletes or inserts any block, and sees the page as
 * they have it (the preview route renders the bundle on the desk). Approve sends exactly the
 * bundle on the desk. An empty block and a headline outside the schema's limits are caught
 * before every approve and every send-back, edited or not.
 *
 * The block operations, the checks and the change report are console/article-desk-logic.js,
 * pure and node-tested; this component is a thin consumer. The JSON editor stays as the
 * advanced path. Exports to window.Console.checkpoints.Article
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, safeStringify, editBtn, EvalBar, TracePanel, WriterQuestionsPanel } = window.Console.utils;
const { RevisionDiff } = window.Console;
const ArticleEditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;
// The desk's block operations, checks and change report (task 4.3).
const DeskLogic = window.Console.articleDeskLogic;

/** How long the desk waits after a change before it asks for the page again, so a run of moves asks once. */
const ARTICLE_PREVIEW_DELAY_MS = 400;

/** The preview before the page has come back. */
const NO_PREVIEW = { html: null, error: '', pending: false, writerTrackerPrints: false };

/**
 * The programmatic fact-check, in front of the person approving the article
 * (baseline §5: "half the refinement work was already on screen as an advisory
 * and was ignored" - in fact it was not on screen at all; lib/content-bundle-
 * fact-check.js reached the reviser as prompt text and the operator never).
 *
 * The four measured failure classes it reports are evidence cards carrying
 * invented text under real token ids (15 items across 4 of 5 sessions, each a
 * section-level rewrite), roster members never named, invalid photo references,
 * and reporter-mode violations. Structural reads as an error, advisory as amber.
 */
function FactCheckPanel({ summary, cardHeadlines }) {
  if (!summary || summary.groups.length === 0) return null;

  return React.createElement('div', { className: 'fact-check mb-md' },
    React.createElement('h4', { className: 'fact-check__title' },
      'Fact-check: ' + summary.structural + ' structural, ' + summary.advisory + ' advisory'
    ),
    summary.groups.map(function (group) {
      return React.createElement('div', { key: group.key, className: 'fact-check__group' },
        React.createElement('p', {
          className: 'fact-check__group-label fact-check__group-label--' + group.severity
        }, group.label + ' (' + group.items.length + ')'),
        React.createElement('ul', { className: 'fact-check__list fact-check__list--' + group.severity },
          group.items.map(function (item, i) {
            var headline = item.tokenId && cardHeadlines ? cardHeadlines[item.tokenId] : null;
            return React.createElement('li', { key: group.key + '-' + i },
              item.text,
              headline && React.createElement('span', { className: 'text-muted' },
                ' \u2014 \u201C' + headline + '\u201D'
              )
            );
          })
        )
      );
    })
  );
}

/**
 * One thesis-echo line (spec 2026-09-19 §6.2), through the same
 * string-or-'(empty)' guard the outline THESIS panel uses: `outlineThesis` comes
 * off the approved outline, where a field can be absent or non-string, and a raw
 * render of a number or object throws on a read-only panel.
 */
function thesisField(label, value, className) {
  return React.createElement('p', { className: className },
    React.createElement('strong', null, label + ': '),
    typeof value === 'string' && value.trim() ? value : React.createElement('span', { className: 'text-muted' }, '(empty)')
  );
}

/** Last path segment, tolerating both separators (the photo paths are Windows). */
function baseName(filepath) {
  const value = String(filepath == null ? '' : filepath);
  const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return cut >= 0 ? value.slice(cut + 1) : value;
}

/** The Save and Cancel buttons every editor ends with. */
function editorActions(onSave, onCancel, saveLabel) {
  return React.createElement('div', { className: 'flex gap-sm mt-sm' },
    React.createElement('button', {
      className: 'btn btn-primary btn-sm',
      onClick: onSave,
      'aria-label': saveLabel
    }, 'Save'),
    React.createElement('button', {
      className: 'btn btn-ghost btn-sm',
      onClick: onCancel,
      'aria-label': 'Cancel edit'
    }, 'Cancel')
  );
}

// ── Editor components (module-level to isolate hooks from Article) ──

function BlockEditor({ block, sectionIdx, blockIdx, onSave, onCancel }) {
  const [localBlock, setLocalBlock] = React.useState(function () {
    return JSON.parse(JSON.stringify(block));
  });

  function updateField(field, value) {
    setLocalBlock(function (prev) {
      var next = Object.assign({}, prev);
      next[field] = value;
      return next;
    });
  }

  var formFields = [];

  switch (block.type) {
    case 'paragraph':
      formFields.push(
        React.createElement('label', { key: 'l', className: 'form-group__label' }, 'Text'),
        React.createElement('textarea', {
          key: 'f',
          className: 'input',
          value: localBlock.text || '',
          onChange: function (e) { updateField('text', e.target.value); },
          rows: 6,
          'aria-label': 'Paragraph text'
        })
      );
      break;
    case 'quote':
      formFields.push(
        React.createElement('label', { key: 'l1', className: 'form-group__label' }, 'Quote Text'),
        React.createElement('textarea', {
          key: 'f1',
          className: 'input',
          value: localBlock.text || '',
          onChange: function (e) { updateField('text', e.target.value); },
          rows: 4,
          'aria-label': 'Quote text'
        }),
        React.createElement('label', { key: 'l2', className: 'form-group__label mt-sm' }, 'Attribution'),
        React.createElement('input', {
          key: 'f2',
          className: 'input',
          value: localBlock.attribution || '',
          onChange: function (e) { updateField('attribution', e.target.value); },
          'aria-label': 'Quote attribution'
        })
      );
      break;
    case 'evidence-reference':
      formFields.push(
        React.createElement('label', { key: 'l1', className: 'form-group__label' }, 'Token ID'),
        React.createElement('input', {
          key: 'f1',
          className: 'input input-mono',
          value: localBlock.tokenId || '',
          onChange: function (e) { updateField('tokenId', e.target.value); },
          'aria-label': 'Token ID'
        }),
        React.createElement('label', { key: 'l2', className: 'form-group__label mt-sm' }, 'Caption'),
        React.createElement('textarea', {
          key: 'f2',
          className: 'input',
          value: localBlock.caption || '',
          onChange: function (e) { updateField('caption', e.target.value); },
          rows: 2,
          'aria-label': 'Evidence caption'
        })
      );
      break;
    case 'evidence-card':
      formFields.push(
        React.createElement('label', { key: 'l1', className: 'form-group__label' }, 'Headline'),
        React.createElement('input', {
          key: 'f1',
          className: 'input',
          value: localBlock.headline || '',
          onChange: function (e) { updateField('headline', e.target.value); },
          'aria-label': 'Evidence card headline'
        }),
        React.createElement('label', { key: 'l2', className: 'form-group__label mt-sm' }, 'Content'),
        React.createElement('textarea', {
          key: 'f2',
          className: 'input',
          value: localBlock.content || '',
          onChange: function (e) { updateField('content', e.target.value); },
          rows: 4,
          'aria-label': 'Evidence card content'
        }),
        React.createElement('label', { key: 'l3', className: 'form-group__label mt-sm' }, 'Owner'),
        React.createElement('input', {
          key: 'f3',
          className: 'input',
          value: localBlock.owner || '',
          onChange: function (e) { updateField('owner', e.target.value); },
          'aria-label': 'Evidence owner'
        }),
        React.createElement('label', { key: 'l4', className: 'form-group__label mt-sm' }, 'Significance'),
        React.createElement('select', {
          key: 'f4',
          className: 'input',
          value: localBlock.significance || 'supporting',
          onChange: function (e) { updateField('significance', e.target.value); },
          'aria-label': 'Evidence significance'
        },
          React.createElement('option', { value: 'critical' }, 'Critical'),
          React.createElement('option', { value: 'supporting' }, 'Supporting'),
          React.createElement('option', { value: 'contextual' }, 'Contextual')
        )
      );
      break;
    case 'photo':
      formFields.push(
        React.createElement('label', { key: 'l1', className: 'form-group__label' }, 'Caption'),
        React.createElement('input', {
          key: 'f1',
          className: 'input',
          value: localBlock.caption || '',
          onChange: function (e) { updateField('caption', e.target.value); },
          'aria-label': 'Photo caption'
        }),
        React.createElement('label', { key: 'l2', className: 'form-group__label mt-sm' }, 'Characters (comma-separated)'),
        React.createElement('input', {
          key: 'f2',
          className: 'input',
          value: (localBlock.characters || []).join(', '),
          onChange: function (e) {
            updateField('characters', e.target.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean));
          },
          'aria-label': 'Characters in photo'
        })
      );
      break;
    case 'list':
      formFields.push(
        React.createElement('label', { key: 'l', className: 'form-group__label' }, 'Items (one per line)'),
        React.createElement('textarea', {
          key: 'f',
          className: 'input',
          value: (localBlock.items || []).join('\n'),
          onChange: function (e) {
            updateField('items', e.target.value.split('\n').filter(function (s) { return s.trim(); }));
          },
          rows: 6,
          'aria-label': 'List items'
        })
      );
      break;
    default:
      formFields.push(
        React.createElement('label', { key: 'l', className: 'form-group__label' }, 'Raw JSON'),
        React.createElement('textarea', {
          key: 'f',
          className: 'input input-mono',
          value: safeStringify(localBlock, 2),
          onChange: function (e) {
            try { setLocalBlock(JSON.parse(e.target.value)); } catch (err) { /* ignore parse errors while typing */ }
          },
          rows: 6,
          'aria-label': 'Block JSON'
        })
      );
  }

  return React.createElement('div', {
    className: 'article-block article-block--editing fade-in'
  },
    React.createElement('div', { className: 'article-block__edit-form' },
      formFields,
      editorActions(function () { onSave(sectionIdx, blockIdx, localBlock); }, onCancel, 'Save block edit')
    )
  );
}

/** A section's heading, edited in place: the page prints it above the section, and a blank one prints none. */
function SectionHeadingEditor({ heading, onSave, onCancel }) {
  const [local, setLocal] = React.useState(heading || '');

  return React.createElement('div', { className: 'article-block article-block--editing fade-in' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Section heading (leave it blank to print none)'),
      React.createElement('input', {
        className: 'input',
        value: local,
        onChange: function (e) { setLocal(e.target.value); },
        'aria-label': 'Section heading'
      }),
      editorActions(function () { onSave(local); }, onCancel, 'Save section heading')
    )
  );
}

function HeadlineEditor({ headline, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { main: headline.main || '', kicker: headline.kicker || '', deck: headline.deck || '' };
  });

  return React.createElement('div', { className: 'article-block article-block--editing fade-in' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Main Headline'),
      React.createElement('input', {
        className: 'input',
        value: local.main,
        onChange: function (e) { setLocal(Object.assign({}, local, { main: e.target.value })); },
        'aria-label': 'Main headline'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Kicker'),
      React.createElement('input', {
        className: 'input',
        value: local.kicker,
        onChange: function (e) { setLocal(Object.assign({}, local, { kicker: e.target.value })); },
        'aria-label': 'Kicker'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Deck'),
      React.createElement('input', {
        className: 'input',
        value: local.deck,
        onChange: function (e) { setLocal(Object.assign({}, local, { deck: e.target.value })); },
        'aria-label': 'Deck subheadline'
      }),
      editorActions(function () { onSave(DeskLogic.changedFields(headline, local)); }, onCancel, 'Save headline edit')
    )
  );
}

/**
 * A sidebar entry prints its headline and its summary (and significance as the
 * badge); its `content` never prints, so the editor offers the summary and not
 * the content. An existing `content` is carried through untouched by the
 * Object.assign on save.
 *
 * Phase 3 (3.2; HY1): nor does its `owner` print, so the editor no longer offers or
 * seeds it, and the writer is no longer asked for it. An entry that has one keeps
 * it through the same Object.assign; the schema keeps the field optional.
 */
function SidebarEvidenceCardEditor({ card, idx, original, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return {
      headline: card.headline || '',
      summary: card.summary || '',
      significance: card.significance || 'supporting',
      placement: card.placement || 'sidebar'
    };
  });

  return React.createElement('div', { key: 'ec-edit-' + idx, className: 'article-evidence-card article-block--editing fade-in mb-md' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Headline'),
      React.createElement('input', {
        className: 'input',
        value: local.headline,
        onChange: function (e) { setLocal(Object.assign({}, local, { headline: e.target.value })); },
        'aria-label': 'Card headline'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Summary'),
      React.createElement('textarea', {
        className: 'input',
        value: local.summary,
        onChange: function (e) { setLocal(Object.assign({}, local, { summary: e.target.value })); },
        rows: 3,
        'aria-label': 'Sidebar entry summary'
      }),
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('div', { className: 'form-group', style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Significance'),
          React.createElement('select', {
            className: 'input',
            value: local.significance,
            onChange: function (e) { setLocal(Object.assign({}, local, { significance: e.target.value })); }
          },
            React.createElement('option', { value: 'critical' }, 'Critical'),
            React.createElement('option', { value: 'supporting' }, 'Supporting'),
            React.createElement('option', { value: 'contextual' }, 'Contextual')
          )
        ),
        React.createElement('div', { className: 'form-group', style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Placement'),
          React.createElement('select', {
            className: 'input',
            value: local.placement,
            onChange: function (e) { setLocal(Object.assign({}, local, { placement: e.target.value })); }
          },
            React.createElement('option', { value: 'sidebar' }, 'Sidebar'),
            React.createElement('option', { value: 'inline' }, 'Inline')
          )
        )
      ),
      editorActions(function () { onSave(idx, Object.assign({}, original, local)); }, onCancel, 'Save evidence card')
    )
  );
}

function FinancialEntryEditor({ entry, idx, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { description: entry.description || '', amount: entry.amount || '', date: entry.date || '', category: entry.category || '' };
  });

  return React.createElement('div', { className: 'article-block article-block--editing fade-in' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('div', { className: 'flex gap-sm' },
        React.createElement('input', {
          className: 'input',
          placeholder: 'Description',
          value: local.description,
          onChange: function (e) { setLocal(Object.assign({}, local, { description: e.target.value })); },
          style: { flex: 2 },
          'aria-label': 'Tracker row description'
        }),
        React.createElement('input', {
          className: 'input',
          placeholder: 'Amount',
          value: local.amount,
          onChange: function (e) { setLocal(Object.assign({}, local, { amount: e.target.value })); },
          style: { flex: 1 },
          'aria-label': 'Tracker row amount'
        }),
        React.createElement('input', {
          className: 'input',
          placeholder: 'Category',
          value: local.category,
          onChange: function (e) { setLocal(Object.assign({}, local, { category: e.target.value })); },
          style: { flex: 1 },
          'aria-label': 'Tracker row category'
        })
      ),
      editorActions(function () { onSave(idx, local); }, onCancel, 'Save tracker row')
    )
  );
}

function HeroImageEditor({ hero, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { caption: hero.caption || '', characters: (hero.characters || []).join(', ') };
  });

  return React.createElement('div', { className: 'article-hero article-block--editing fade-in mb-md' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Caption'),
      React.createElement('input', {
        className: 'input',
        value: local.caption,
        onChange: function (e) { setLocal(Object.assign({}, local, { caption: e.target.value })); },
        'aria-label': 'Hero image caption'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Characters (comma-separated)'),
      React.createElement('input', {
        className: 'input',
        value: local.characters,
        onChange: function (e) { setLocal(Object.assign({}, local, { characters: e.target.value })); },
        'aria-label': 'Hero image characters'
      }),
      editorActions(function () {
        onSave({
          caption: local.caption,
          characters: local.characters.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
        });
      }, onCancel, 'Save hero image edit')
    )
  );
}

/**
 * The byline as the page prints it: the author, their title, and the guest reporter's
 * credit beside them. Only the fields the director changed are saved (DeskLogic.setByline
 * keeps every other one, the credit included).
 */
function BylineEditor({ byline, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { author: byline.author || '', title: byline.title || '', guestReporter: byline.guestReporter || '' };
  });

  return React.createElement('div', { className: 'article-block article-block--editing fade-in mb-md' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('div', { className: 'flex gap-sm' },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Author'),
          React.createElement('input', {
            className: 'input',
            value: local.author,
            onChange: function (e) { setLocal(Object.assign({}, local, { author: e.target.value })); },
            'aria-label': 'Byline author'
          })
        ),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Title'),
          React.createElement('input', {
            className: 'input',
            value: local.title,
            onChange: function (e) { setLocal(Object.assign({}, local, { title: e.target.value })); },
            'aria-label': 'Byline title'
          })
        )
      ),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Guest reporter (Name | Role)'),
      React.createElement('input', {
        className: 'input',
        value: local.guestReporter,
        onChange: function (e) { setLocal(Object.assign({}, local, { guestReporter: e.target.value })); },
        'aria-label': 'Guest reporter credit'
      }),
      editorActions(function () { onSave(DeskLogic.changedFields(byline, local)); }, onCancel, 'Save byline edit')
    )
  );
}

// ── Main Article Component ──

function Article({ data, sessionId: propSessionId, theme, onApprove, onReject, dispatch, revisionCache, pendingEdits, pendingNote }) {
  const contentBundle = (data && data.contentBundle) || {};

  // Theme detection: prop > metadata > fallback
  const isDetective = theme === 'detective' ||
    (!theme && contentBundle.metadata && contentBundle.metadata.theme === 'detective');
  // H6: `data.evaluationHistory` is an append-only ARRAY mixing all three phases;
  // the old renderEvalBar read `.overallScore` (and `advisoryNotes`, not a field)
  // off it and rendered null in every session.
  const evaluation = ViewLogic.evaluationView(ViewLogic.lastEvaluationFrom(data, 'article'));
  // Brief 2.7: what the automatic passes of this round did before the director arrived.
  // Final review (reworks[0]): the theme decides whether a pass's rework was given the
  // evaluation's guidance, which the panel's label says.
  const trace = ViewLogic.traceView(data && data.trace, theme);
  // Brief 3.7: the article writer's questions for the director; task 3.11: the stop's
  // hint says answers go with a send back, since Approve publishes the article as it is.
  const writerQuestions = ViewLogic.writerQuestionsView(data && data.writerQuestions, 'article');
  // Absolute paths of this session's photos, for photoUrl (H13/F9).
  const sessionPhotos = (data && data.sessionPhotos) || [];
  // Task 3.6's programmatic fact-check of THIS bundle (baseline §5).
  const factCheck = ViewLogic.factCheckSummary((data && data.factCheck) || null);
  // Thesis echo (spec 2026-09-19 §6.2): the approved outline's LEDE thesis, read-only.
  const outlineThesis = (data && data.outlineThesis) || null;
  const previousArticle = (revisionCache && revisionCache.article) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 0;
  const sessionId = propSessionId || (data && data.sessionId) || '';

  // -- State --
  const [editedBundle, setEditedBundle] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  // The block whose delete was clicked once ('section:block'): the second click deletes it.
  const [armedDelete, setArmedDelete] = React.useState(null);
  // Counts the changes on the desk, so the preview asks for the page again after each.
  const [deskVersion, setDeskVersion] = React.useState(0);
  // The page as it will print, from the preview route, and whether it prints the writer's money tracker.
  const [preview, setPreview] = React.useState(NO_PREVIEW);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  // B6: inline error for a bundle that fails the desk's checks or the client shape gate.
  const [editError, setEditError] = React.useState('');
  // The stop's ONE note box (phase 1, brief 1.1). On screen in the view mode and
  // sent with whatever the director presses: with Approve it becomes a standing note
  // for every later writer, with Send back it is the rework's HUMAN FEEDBACK and then
  // stands. The name stays `feedbackText` — the server still reads it as feedback on
  // a send back.
  const [feedbackText, setFeedbackText] = React.useState('');
  // Send back takes two clicks (review fix round 1): this flag says the first one
  // happened. ViewLogic.sendBackButton decides what that means on screen.
  const [sendBackArmed, setSendBackArmed] = React.useState(false);
  const [showHtmlPreview, setShowHtmlPreview] = React.useState(false);
  const [expandedPhoto, setExpandedPhoto] = React.useState(null);

  // Reset when data changes
  // Both counters: the automated one resets to 0 at every round of the director's,
  // so on its own it repeats across rounds and could leak stale edits.
  const dataKey = ArticleEditLogic.computeResetKey(contentBundle, ((data && data.humanRevisionCount) || 0) * 1000 + revisionCount);
  React.useEffect(function () {
    setEditedBundle(null);
    setEditingBlock(null);
    setHasEdits(false);
    setArmedDelete(null);
    setDeskVersion(0);
    setPreview(NO_PREVIEW);
    setMode('view');
    setJsonText('');
    setJsonError('');
    setEditError('');
    setFeedbackText('');
    setSendBackArmed(false);
    setShowHtmlPreview(false);
    setExpandedPhoto(null);
  }, [dataKey]);

  // Restore edits from reducer state if component remounted after processing error
  React.useEffect(function () {
    if (pendingEdits && !editedBundle) {
      setEditedBundle(pendingEdits);
      setHasEdits(true);
      setDeskVersion(function (v) { return v + 1; });
    }
  }, [pendingEdits]);

  // The note is restored the same way, from its sibling slot: a processing error
  // that remounts this screen must not cost the director what they just typed.
  React.useEffect(function () {
    if (typeof pendingNote === 'string' && pendingNote && !feedbackText) {
      setFeedbackText(pendingNote);
    }
  }, [pendingNote]);

  // The page as it will print: asked of the preview route when the stop opens and after
  // each change on the desk, a moment later so a run of moves asks once. The answer also
  // says whether the page prints the writer's money tracker, which decides its editor.
  React.useEffect(function () {
    var bundle = editedBundle || contentBundle;
    if (!sessionId || !Array.isArray(bundle.sections)) return undefined;
    var cancelled = false;
    setPreview(function (p) { return Object.assign({}, p, { pending: true }); });
    var request = DeskLogic.previewRequest(sessionId, bundle);
    var timer = setTimeout(function () {
      fetch(request.url, request.init)
        .then(function (res) {
          return res.json().then(function (body) { return { ok: res.ok, body: body || {} }; });
        })
        .then(function (result) {
          if (cancelled) return;
          if (result.ok) {
            setPreview({ html: result.body.html || '', error: '', pending: false, writerTrackerPrints: result.body.writerTrackerPrints === true });
          } else {
            setPreview(function (p) {
              return Object.assign({}, p, { html: null, pending: false, error: result.body.error || 'The page could not be rendered.' });
            });
          }
        })
        .catch(function () {
          if (!cancelled) {
            setPreview(function (p) { return Object.assign({}, p, { pending: false, error: 'The preview could not be reached.' }); });
          }
        });
    }, ARTICLE_PREVIEW_DELAY_MS);
    return function () { cancelled = true; clearTimeout(timer); };
  }, [deskVersion, dataKey]);

  // The bundle on the desk: the director's, once they have changed anything.
  function getCurrentBundle() {
    return editedBundle || contentBundle;
  }

  /**
   * Put a new bundle on the desk. Blocks are addressed by index, so a move, a delete or
   * an insert closes the open editor; an insert opens it on the block it added.
   */
  function applyDesk(next, openEditor) {
    setEditedBundle(next);
    setHasEdits(true);
    setEditingBlock(openEditor || null);
    setArmedDelete(null);
    setEditError('');
    setDeskVersion(function (v) { return v + 1; });
  }

  // -- Edit helpers --

  function startBlockEdit(sectionIdx, blockIdx) {
    setArmedDelete(null);
    setEditingBlock({ type: 'block', sectionIdx: sectionIdx, blockIdx: blockIdx });
  }

  function startHeadingEdit(sectionIdx) {
    setArmedDelete(null);
    setEditingBlock({ type: 'heading', sectionIdx: sectionIdx });
  }

  function startSidebarEdit(category, idx) {
    setArmedDelete(null);
    setEditingBlock({ type: 'sidebar', category: category, idx: idx });
  }

  function startHeadlineEdit() {
    setArmedDelete(null);
    setEditingBlock({ type: 'headline' });
  }

  function isEditing(type, a, b) {
    if (!editingBlock) return false;
    if (type === 'block') return editingBlock.type === 'block' && editingBlock.sectionIdx === a && editingBlock.blockIdx === b;
    if (type === 'heading') return editingBlock.type === 'heading' && editingBlock.sectionIdx === a;
    if (type === 'sidebar') return editingBlock.type === 'sidebar' && editingBlock.category === a && editingBlock.idx === b;
    if (type === 'headline') return editingBlock.type === 'headline';
    return false;
  }

  function cancelEdit() {
    setEditingBlock(null);
  }

  function saveBlockEdit(sectionIdx, blockIdx, updatedBlock) {
    applyDesk(DeskLogic.setBlock(getCurrentBundle(), sectionIdx, blockIdx, updatedBlock));
  }

  function saveHeadingEdit(sectionIdx, heading) {
    applyDesk(DeskLogic.setSectionHeading(getCurrentBundle(), sectionIdx, heading));
  }

  function saveSidebarCardEdit(idx, updatedCard) {
    applyDesk(DeskLogic.setSidebarCard(getCurrentBundle(), idx, updatedCard));
  }

  function saveFinancialEntryEdit(idx, updatedEntry) {
    applyDesk(DeskLogic.setTrackerEntry(getCurrentBundle(), idx, updatedEntry));
  }

  function saveHeadlineEdit(changedFields) {
    applyDesk(DeskLogic.setHeadline(getCurrentBundle(), changedFields));
  }

  function saveHeroImageEdit(fields) {
    applyDesk(DeskLogic.setHero(getCurrentBundle(), fields));
  }

  function saveBylineEdit(changedFields) {
    applyDesk(DeskLogic.setByline(getCurrentBundle(), changedFields));
  }

  // -- The desk's hands: move, delete, insert --

  function moveStep(sectionIdx, blockIdx, direction) {
    var bundle = getCurrentBundle();
    var to = DeskLogic.stepTarget(bundle, sectionIdx, blockIdx, direction);
    if (to) applyDesk(DeskLogic.moveBlock(bundle, { section: sectionIdx, block: blockIdx }, to));
  }

  function moveToSection(sectionIdx, blockIdx, targetSection) {
    applyDesk(DeskLogic.moveToSection(getCurrentBundle(), { section: sectionIdx, block: blockIdx }, targetSection));
  }

  /** A delete takes two clicks, as a send back does: the first arms it on that block. */
  function deleteClick(sectionIdx, blockIdx) {
    var key = sectionIdx + ':' + blockIdx;
    if (armedDelete !== key) {
      setArmedDelete(key);
      return;
    }
    applyDesk(DeskLogic.deleteBlock(getCurrentBundle(), sectionIdx, blockIdx));
  }

  function insertAt(sectionIdx, blockIdx, type) {
    applyDesk(DeskLogic.insertBlock(getCurrentBundle(), sectionIdx, blockIdx, type),
      { type: 'block', sectionIdx: sectionIdx, blockIdx: blockIdx });
  }

  // -- Actions --

  /**
   * The desk's checks and the client shape gate, on every approve and every send-back,
   * edited or not (B6; task 4.3).
   *
   * The desk's checks catch what would otherwise differ between the desk and the page: an
   * empty block (validateContentBundle drops a blank paragraph without a word after the
   * approve) and a headline outside the schema's limits (refused by the server's schema
   * gate, or by validateContentBundle, which ends the run). The shape check mirrors the
   * server's schema gate, which stays the last word on shape, because before either gate
   * existed a hand edit reached validateContentBundle, which routes a bad bundle straight
   * to END: ten checkpoints and five-plus Opus calls spent, Retry failing identically, and
   * rollback discarding the approved draft.
   *
   * `verb` names what the click would have done, so the send-back does not read
   * "Cannot approve" (review round 2, M13).
   *
   * @returns {boolean} whether the bundle may be sent
   */
  function gateEdits(bundle, setError, verb) {
    var problems = DeskLogic.deskProblems(bundle).map(function (p) { return p.message; })
      .concat(ArticleEditLogic.validateBundleShape(bundle).errors.map(function (e) { return e.path + ' ' + e.message; }));
    if (problems.length === 0) {
      setError('');
      return true;
    }
    setError('Cannot ' + (verb || 'approve') + ' yet. Fix these first:' + '\n- ' + problems.join('\n- '));
    return false;
  }

  function handleApprove() {
    setSendBackArmed(false);
    const note = feedbackText.trim();
    const deskBundle = getCurrentBundle();
    if (!gateEdits(deskBundle, setEditError)) return;
    // Persist the edits and the note in reducer state so they survive an unmount during processing
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: hasEdits ? deskBundle : undefined, note: note });
    }
    // Approve sends exactly the bundle on the desk, edited or not.
    onApprove(ViewLogic.articleReviewPayload(deskBundle, note, 'approve'));
  }

  function handleJsonApprove() {
    var parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      setJsonError('Invalid JSON: ' + err.message);
      return;
    }
    if (!gateEdits(parsed, setJsonError)) return;
    const note = feedbackText.trim();
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: parsed, note: note });
    }
    onApprove(ViewLogic.articleReviewPayload(parsed, note, 'approve'));
  }

  function handleModeChange(newMode) {
    setSendBackArmed(false);
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'json') {
      setJsonText(safeStringify(getCurrentBundle(), 2));
      setJsonError('');
    }
  }

  /**
   * The brake on the send back (review fix round 1). One box now serves both
   * actions, so Send back sits next to a note the director also fills in for an
   * approve; a mis-click here costs a round and about nine minutes of Opus. The
   * first click arms the button, the second sends. Editing the note, pressing
   * anything else in the action row, or a reset of the screen disarms it.
   */
  function handleSendBackClick() {
    if (!feedbackText.trim()) return;
    if (!sendBackArmed) {
      setSendBackArmed(true);
      return;
    }
    handleReject();
  }

  function handleReject() {
    const note = feedbackText.trim();
    if (!note) return;
    const deskBundle = getCurrentBundle();
    // Spec 2026-09-19 §4.6: the desk travels with the note, checked by the SAME gate
    // approve uses (review fix 1, finding 1 — two copies of the gate drift, and the
    // one that drifts loose ships an invalid bundle). A send blocked by a check
    // disarms the button: the next attempt costs two clicks again.
    setSendBackArmed(false);
    if (!gateEdits(deskBundle, setEditError, 'send')) return;
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: hasEdits ? deskBundle : undefined, note: note });
      dispatch({ type: 'CACHE_REVISION', contentType: 'article', data: deskBundle });
    }
    onReject(ViewLogic.articleReviewPayload(deskBundle, note, 'send-back'));
  }

  // -- Photo URL --

  /**
   * A servable URL for one photo filename (R4 H13, R5 F9).
   *
   * `/sessionphotos/<id>/<file>` only exists AFTER assembleHtml copies the
   * photos, which happens after this gate — so every photo on the article
   * checkpoint was a broken image. `data.sessionPhotos` holds the absolute
   * source paths, which `/api/file?path=` serves directly (the same route
   * CharacterIds.js uses for its thumbnails). The old path stays as a fallback
   * for a payload that carries no sessionPhotos (a raw /checkpoint read).
   */
  function photoUrl(filename) {
    if (!filename) return '';
    var target = baseName(filename);
    for (var i = 0; i < sessionPhotos.length; i += 1) {
      var candidate = String(sessionPhotos[i] || '');
      var base = baseName(candidate);
      if (base && target && base.toLowerCase() === target.toLowerCase()) {
        return '/api/file?path=' + encodeURIComponent(candidate);
      }
    }
    if (!sessionId) return '';
    return '/sessionphotos/' + encodeURIComponent(sessionId) + '/' + encodeURIComponent(filename);
  }

  // -- The desk's rows --

  /**
   * One editable piece of the article: its content, and its rail, a column of its own
   * beside it holding the pencil and any other control, so every editor is visible and
   * none covers the prose (spec 2026-10-02 section 6.3).
   */
  function deskRow(key, className, body, onEdit, controls) {
    return React.createElement('div', { key: key, className: 'desk-row ' + className },
      React.createElement('div', { className: 'desk-row__body' }, body),
      React.createElement('div', { className: 'desk-rail' }, editBtn(onEdit), controls || null)
    );
  }

  /** One control in a block's rail. */
  function deskButton(label, title, onClick, options) {
    var opts = options || {};
    return React.createElement('button', {
      type: 'button',
      className: 'desk-rail__btn' + (opts.armed ? ' desk-rail__btn--armed' : ''),
      onClick: function (e) { e.stopPropagation(); onClick(); },
      disabled: !!opts.disabled,
      'aria-label': title,
      title: title
    }, label);
  }

  /** A block's controls beside the pencil: one step up or down, to another section, delete, and insert after it. */
  function blockControls(sectionIdx, blockIdx) {
    var bundle = getCurrentBundle();
    var armed = armedDelete === sectionIdx + ':' + blockIdx;
    return React.createElement(React.Fragment, null,
      deskButton('\u2191', 'Move this block up', function () { moveStep(sectionIdx, blockIdx, 'up'); },
        { disabled: !DeskLogic.stepTarget(bundle, sectionIdx, blockIdx, 'up') }),
      deskButton('\u2193', 'Move this block down', function () { moveStep(sectionIdx, blockIdx, 'down'); },
        { disabled: !DeskLogic.stepTarget(bundle, sectionIdx, blockIdx, 'down') }),
      React.createElement('select', {
        className: 'desk-rail__move',
        value: '',
        onChange: function (e) { if (e.target.value !== '') moveToSection(sectionIdx, blockIdx, Number(e.target.value)); },
        'aria-label': 'Move this block to the end of a section',
        title: 'Move this block to the end of a section'
      },
        React.createElement('option', { value: '' }, 'Move to'),
        (bundle.sections || []).map(function (section, s) {
          return React.createElement('option', { key: 'to-' + s, value: String(s) }, DeskLogic.sectionLabel(section, s));
        })
      ),
      deskButton(armed ? 'Delete?' : '\u2715', armed ? 'Click again to delete this block' : 'Delete this block',
        function () { deleteClick(sectionIdx, blockIdx); }, { armed: armed }),
      deskButton('+\u00B6', 'Insert a paragraph after this block', function () { insertAt(sectionIdx, blockIdx + 1, 'paragraph'); }),
      deskButton('+\u275D', 'Insert a quote after this block', function () { insertAt(sectionIdx, blockIdx + 1, 'quote'); })
    );
  }

  /** What a block shows on the desk: what it prints, or, for an empty block, what to do about it. */
  function blockBody(block) {
    var emptyNote = DeskLogic.emptyBlockNote(block);
    var note = emptyNote && React.createElement('p', { className: 'desk-empty-note text-sm' }, emptyNote);
    switch (block.type) {
      case 'paragraph':
        return React.createElement('div', { className: 'article-block article-block--paragraph' },
          note || React.createElement('p', { className: 'text-sm' }, block.text)
        );

      case 'quote':
        return React.createElement('blockquote', { className: 'article-block article-block--quote' },
          note || React.createElement('p', { className: 'article-block__quote-text' }, '\u201C' + block.text + '\u201D'),
          block.attribution && React.createElement('cite', { className: 'article-block__quote-cite' }, '\u2014 ' + block.attribution)
        );

      case 'evidence-reference':
        return React.createElement('div', { className: 'article-block article-block--evidence' },
          React.createElement('div', { className: 'article-block__evidence-header' },
            React.createElement(Badge, { label: 'Evidence', color: 'var(--accent-amber)' }),
            block.tokenId && React.createElement('span', { className: 'text-xs text-muted' }, block.tokenId)
          ),
          note,
          block.text && React.createElement('p', { className: 'text-sm' }, block.text),
          block.caption && React.createElement('p', { className: 'text-xs text-secondary' }, block.caption)
        );

      case 'evidence-card':
        return React.createElement('aside', {
          className: 'article-evidence-card article-evidence-card--' + (block.significance || 'supporting')
        },
          React.createElement('div', { className: 'article-evidence-card__label' }, block.headline || 'Evidence'),
          note || React.createElement('div', { className: 'article-evidence-card__content' }, block.content || ''),
          (block.owner || block.significance) && React.createElement('div', { className: 'article-evidence-card__meta' },
            block.owner && React.createElement('span', { className: 'article-evidence-card__owner' }, block.owner),
            block.significance && React.createElement(Badge, {
              label: block.significance,
              color: block.significance === 'critical' ? 'var(--accent-red)' :
                     block.significance === 'supporting' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
            })
          )
        );

      case 'photo':
        return React.createElement('figure', { className: 'article-block article-block--photo-rich' },
          note,
          photoUrl(block.filename)
            ? React.createElement('img', {
                src: photoUrl(block.filename),
                alt: block.caption || block.filename,
                className: 'article-photo__thumbnail',
                loading: 'lazy',
                onClick: function () { setExpandedPhoto(expandedPhoto === block.filename ? null : block.filename); }
              })
            : !note && React.createElement('div', { className: 'article-block__photo-placeholder' },
                '[Photo' + (block.filename ? ': ' + block.filename : '') + ']'
              ),
          block.caption && React.createElement('figcaption', { className: 'article-photo__caption' }, block.caption),
          block.characters && block.characters.length > 0 && React.createElement('div', { className: 'tag-list mt-sm' },
            block.characters.map(function (c, j) {
              return React.createElement(Badge, { key: 'char-' + j, label: c, color: 'var(--accent-cyan)' });
            })
          )
        );

      case 'list':
        return React.createElement('div', { className: 'article-block article-block--list' },
          note || React.createElement('ul', { className: 'checkpoint-section__list text-sm' },
            (block.items || []).map(function (item, j) {
              return React.createElement('li', { key: 'item-' + j },
                typeof item === 'string' ? item : (item.text || safeStringify(item))
              );
            })
          )
        );

      default:
        return React.createElement('div', { className: 'article-block text-xs text-muted' }, '[' + block.type + ' block]');
    }
  }

  // -- Block renderer --

  function renderBlock(block, sectionIdx, blockIdx) {
    if (!block || !block.type) return null;

    if (isEditing('block', sectionIdx, blockIdx)) {
      return React.createElement(BlockEditor, {
        key: 'edit-' + sectionIdx + '-' + blockIdx,
        block: block,
        sectionIdx: sectionIdx,
        blockIdx: blockIdx,
        onSave: saveBlockEdit,
        onCancel: cancelEdit
      });
    }

    return deskRow('block-' + sectionIdx + '-' + blockIdx,
      'desk-row--block' + (DeskLogic.isEmptyBlock(block) ? ' desk-row--empty' : ''),
      blockBody(block),
      function () { startBlockEdit(sectionIdx, blockIdx); },
      blockControls(sectionIdx, blockIdx));
  }

  // -- Section heading: its editor, and insertion at the top of the section --

  function renderSectionHeading(section, sectionIdx) {
    if (isEditing('heading', sectionIdx)) {
      return React.createElement(SectionHeadingEditor, {
        key: 'heading-edit-' + sectionIdx,
        heading: section.heading || '',
        onSave: function (heading) { saveHeadingEdit(sectionIdx, heading); },
        onCancel: cancelEdit
      });
    }
    var body = React.createElement('div', { className: 'flex gap-sm items-center' },
      React.createElement('h4', { className: 'outline-section__title' + (section.heading ? '' : ' text-muted') },
        section.heading || 'No heading (this section prints without one)'
      ),
      section.type && React.createElement(Badge, { label: section.type, color: 'var(--accent-cyan)' })
    );
    return deskRow('heading-' + sectionIdx, 'desk-row--heading', body,
      function () { startHeadingEdit(sectionIdx); },
      React.createElement(React.Fragment, null,
        deskButton('+\u00B6', 'Insert a paragraph at the top of this section', function () { insertAt(sectionIdx, 0, 'paragraph'); }),
        deskButton('+\u275D', 'Insert a quote at the top of this section', function () { insertAt(sectionIdx, 0, 'quote'); })
      ));
  }

  // -- Evidence card renderer (sidebar) --

  function renderSidebarEvidenceCard(card, idx) {
    if (isEditing('sidebar', 'evidenceCards', idx)) {
      return React.createElement(SidebarEvidenceCardEditor, {
        key: 'ec-edit-' + idx,
        card: card,
        idx: idx,
        original: card,
        onSave: saveSidebarCardEdit,
        onCancel: cancelEdit
      });
    }

    var body = React.createElement('div', {
      className: 'article-evidence-card article-evidence-card--' + (card.significance || 'supporting') + ' mb-md'
    },
      React.createElement('div', { className: 'article-evidence-card__label' }, card.headline || card.tokenId || 'Card ' + (idx + 1)),
      // The summary, which the sidebar prints; never the content, which it does not.
      card.summary && React.createElement('div', { className: 'article-evidence-card__content' }, card.summary),
      React.createElement('div', { className: 'article-evidence-card__meta' },
        card.owner && React.createElement('span', { className: 'article-evidence-card__owner' }, card.owner),
        React.createElement('div', { className: 'tag-list' },
          card.significance && React.createElement(Badge, {
            label: card.significance,
            color: card.significance === 'critical' ? 'var(--accent-red)' :
                   card.significance === 'supporting' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
          }),
          card.layer && React.createElement(Badge, {
            label: card.layer,
            color: card.layer === 'exposed' ? 'var(--layer-exposed)' :
                   card.layer === 'buried' ? 'var(--layer-buried)' : 'var(--accent-amber)'
          }),
          card.placement && React.createElement(Badge, { label: card.placement, color: 'var(--text-muted)' })
        )
      ),
      card.tokenId && React.createElement('span', { className: 'text-xs text-muted d-block mt-sm' }, card.tokenId)
    );
    return deskRow('ec-' + idx, 'desk-row--card', body, function () { startSidebarEdit('evidenceCards', idx); });
  }

  // -- Financial tracker: the writer's, only when the page prints it --

  function renderFinancialTracker(tracker) {
    var entries = tracker && Array.isArray(tracker.entries) ? tracker.entries : [];
    if (entries.length === 0) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'FINANCIAL TRACKER'),
      entries.map(function (entry, i) {
        if (isEditing('sidebar', 'financialEntry', i)) {
          return React.createElement(FinancialEntryEditor, {
            key: 'ft-edit-' + i,
            entry: entry,
            idx: i,
            onSave: saveFinancialEntryEdit,
            onCancel: cancelEdit
          });
        }
        var body = React.createElement('div', { className: 'desk-tracker-row' },
          React.createElement('span', null,
            entry.date && React.createElement('span', { className: 'text-xs text-muted' }, entry.date + ' '),
            entry.description || ''
          ),
          React.createElement('span', { className: 'financial-table__amount' }, entry.amount || ''),
          React.createElement('span', { className: 'text-xs text-muted' }, entry.category || '')
        );
        return deskRow('ft-' + i, 'desk-row--tracker', body, function () { startSidebarEdit('financialEntry', i); });
      }),
      tracker.totalExposed && React.createElement('p', { className: 'text-sm mt-sm' }, 'Total Buried: ' + tracker.totalExposed)
    );
  }

  // -- Hero image --

  function renderHeroImage() {
    var currentHero = getCurrentBundle().heroImage || null;
    if (!currentHero || !currentHero.filename) return null;

    if (isEditing('sidebar', 'heroImage', 0)) {
      return React.createElement(HeroImageEditor, {
        key: 'hero-edit',
        hero: currentHero,
        onSave: saveHeroImageEdit,
        onCancel: cancelEdit
      });
    }

    var heroSrc = photoUrl(currentHero.filename);
    var body = React.createElement('figure', { className: 'article-hero mb-md' },
      heroSrc
        ? React.createElement('img', {
            src: heroSrc,
            alt: currentHero.caption || 'Hero image',
            className: 'article-hero__image',
            loading: 'lazy'
          })
        : React.createElement('div', { className: 'article-block__photo-placeholder' },
            currentHero.filename + ' (not among the photos this session carries)'),
      currentHero.caption && React.createElement('figcaption', { className: 'article-photo__caption' }, currentHero.caption),
      currentHero.characters && currentHero.characters.length > 0 && React.createElement('div', { className: 'tag-list mt-sm' },
        currentHero.characters.map(function (c, j) {
          return React.createElement(Badge, { key: 'hero-char-' + j, label: c, color: 'var(--accent-cyan)' });
        })
      )
    );
    return deskRow('hero', 'desk-row--hero', body, function () { startSidebarEdit('heroImage', 0); });
  }

  // -- Headline and byline --

  function renderHeadline() {
    var currentHeadline = getCurrentBundle().headline || {};
    if (isEditing('headline')) {
      return React.createElement(HeadlineEditor, {
        key: 'headline-edit',
        headline: currentHeadline,
        onSave: saveHeadlineEdit,
        onCancel: cancelEdit
      });
    }
    var body = React.createElement('div', { className: 'outline-section' },
      currentHeadline.kicker && React.createElement('p', { className: 'text-xs text-muted mb-sm article-headline__kicker' }, currentHeadline.kicker),
      React.createElement('h3', { className: 'article-headline__main' + (currentHeadline.main ? '' : ' text-muted') }, currentHeadline.main || 'No headline'),
      currentHeadline.deck && React.createElement('p', { className: 'text-sm text-secondary mt-sm article-headline__deck' }, currentHeadline.deck)
    );
    return deskRow('headline', 'desk-row--headline', body, startHeadlineEdit);
  }

  function renderByline() {
    var currentByline = getCurrentBundle().byline || {};
    if (isEditing('sidebar', 'byline', 0)) {
      return React.createElement(BylineEditor, {
        key: 'byline-edit',
        byline: currentByline,
        onSave: saveBylineEdit,
        onCancel: cancelEdit
      });
    }
    // As the page prints it: the author and their title, then the guest reporter's credit.
    var line = [currentByline.author, currentByline.title].filter(Boolean).join(' | ') +
      (currentByline.guestReporter ? ' || ' + currentByline.guestReporter : '');
    var body = React.createElement('div', { className: 'text-xs text-muted mb-md' }, line || 'No byline');
    return deskRow('byline', 'desk-row--byline', body, function () { startSidebarEdit('byline', 0); });
  }

  // -- Expanded photo overlay --

  function renderExpandedPhoto() {
    if (!expandedPhoto) return null;
    return React.createElement('div', {
      className: 'article-photo-overlay',
      onClick: function () { setExpandedPhoto(null); }
    },
      React.createElement('img', {
        src: photoUrl(expandedPhoto),
        alt: 'Expanded photo',
        className: 'article-photo-overlay__img'
      })
    );
  }

  // -- Main render --

  var deskBundleNow = getCurrentBundle();

  // tokenId -> headline for the fact-check card group, so a flagged card is
  // identifiable by what it SAYS and not only by its id.
  var cardHeadlines = {};
  (deskBundleNow.evidenceCards || []).forEach(function (card) {
    if (card && card.tokenId && card.headline) cardHeadlines[card.tokenId] = card.headline;
  });
  (deskBundleNow.sections || []).forEach(function (section) {
    (section && section.content || []).forEach(function (block) {
      if (block && block.type === 'evidence-card' && block.tokenId && block.headline) {
        cardHeadlines[block.tokenId] = block.headline;
      }
    });
  });

  var approve = ViewLogic.approveLabel(factCheck, hasEdits);
  const sendBack = ViewLogic.sendBackButton(sendBackArmed, feedbackText, 'article');

  var currentSections = deskBundleNow.sections || [];
  var currentEvidenceCards = deskBundleNow.evidenceCards || [];
  var writerTracker = deskBundleNow.financialTracker || null;
  var hasWriterTrackerRows = !!(writerTracker && Array.isArray(writerTracker.entries) && writerTracker.entries.length > 0);
  // The word count reads the bundle as edited.
  var wordCount = DeskLogic.wordCount(deskBundleNow);
  // What would stop an approve or a send-back now, shown before the click.
  var deskIssues = DeskLogic.deskProblems(deskBundleNow);
  // The page as it will print: the preview route's answer once it comes; until then, the
  // stop's own render of the draft while the desk still holds it.
  var previewHtml = typeof preview.html === 'string' ? preview.html : (hasEdits ? '' : ((data && data.htmlPreview) || ''));

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff
    React.createElement(RevisionDiff, {
      previous: previousArticle,
      current: contentBundle,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: (data && data.humanRevisionCount) || 0,
      handEditReport: (data && data.handEditReport) || null,
      gateNotes: (data && data.directorGateNotes) || []
    }),

    // Evaluation bar
    React.createElement(EvalBar, { view: evaluation }),

    // The trace (brief 2.7): the automatic reworks of this round, before the director
    React.createElement(TracePanel, { view: trace }),

    // The writer's questions (brief 3.7), above the article
    React.createElement(WriterQuestionsPanel, { view: writerQuestions }),

    // Fact-check defect list, above the article body
    React.createElement(FactCheckPanel, { summary: factCheck, cardHeadlines: cardHeadlines }),

    // Word count + edit indicator
    React.createElement('div', { className: 'flex gap-md items-center' },
      wordCount > 0 && React.createElement('div', { className: 'word-count' },
        React.createElement('span', { className: 'word-count__value' }, wordCount.toLocaleString()),
        React.createElement('span', { className: 'word-count__label' }, ' words')
      ),
      hasEdits && React.createElement(Badge, { label: 'Edited', color: 'var(--accent-amber)' })
    ),

    // Hero image
    renderHeroImage(),

    // Thesis echo (spec 2026-09-19 §6.2): read-only, from the approved outline, so the
    // headline is judged against the thesis it must serve. No pencil.
    outlineThesis && React.createElement('div', { className: 'article-thesis-echo' },
      React.createElement('h4', { className: 'outline-section__title' }, 'THESIS (from the approved outline)'),
      thesisField('Hook', outlineThesis.hook, 'text-sm mb-sm'),
      thesisField('Key tension', outlineThesis.keyTension, 'text-sm mb-sm'),
      thesisField('Primary arc', outlineThesis.primaryArc, 'text-sm')
    ),

    // Headline and byline
    renderHeadline(),
    renderByline(),

    // The sections: each heading, then its blocks, every one with its rail
    currentSections.map(function (section, i) {
      return React.createElement('div', {
        key: (section.id || 'section') + '-' + i,
        className: 'outline-section desk-section'
      },
        renderSectionHeading(section, i),
        React.createElement('div', { className: 'outline-section__content mt-sm' },
          (section.content || []).map(function (block, j) {
            return renderBlock(block, i, j);
          })
        )
      );
    }),

    // Evidence cards (journalist theme only)
    !isDetective && currentEvidenceCards.length > 0 && React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE CARDS (' + currentEvidenceCards.length + ')'),
      currentEvidenceCards.map(function (card, i) {
        return renderSidebarEvidenceCard(card, i);
      })
    ),

    // The money tracker (journalist theme only): the writer's prints only when the ledger
    // has no account to print in its place, so its editor shows only then.
    !isDetective && (preview.writerTrackerPrints
      ? renderFinancialTracker(writerTracker)
      : hasWriterTrackerRows && React.createElement('p', { className: 'text-xs text-muted' },
          'The page prints the money tracker from the ledger, which the preview shows.')),

    // The page as it will print, from the bundle on the desk
    React.createElement('div', { className: 'mt-md' },
      React.createElement('button', {
        className: 'btn btn-secondary btn-sm',
        onClick: function () { setShowHtmlPreview(!showHtmlPreview); },
        'aria-label': showHtmlPreview ? 'Hide the page as it will print' : 'Show the page as it will print'
      }, showHtmlPreview ? 'Hide the page' : 'Show the page as it will print'),

      showHtmlPreview && React.createElement('div', { className: 'desk-preview mt-md fade-in' },
        (preview.pending || preview.error) && React.createElement('p', {
          className: 'desk-preview__status text-xs' + (preview.error ? ' desk-preview__status--error' : ' text-muted'),
          role: 'status'
        }, preview.error ? 'The page cannot be shown yet: ' + preview.error : 'Updating the page\u2026'),
        previewHtml && React.createElement('div', { className: 'html-preview' },
          React.createElement('iframe', {
            className: 'html-preview__frame',
            // The scripts are taken out (DeskLogic.stripScripts); the server already put
            // in `<base href="/">`, so the relative sessionphotos/ links resolve instead
            // of hitting the /console/* catch-all.
            srcDoc: DeskLogic.stripScripts(previewHtml),
            sandbox: 'allow-same-origin',
            title: 'The page as it will print'
          })
        )
      )
    ),

    // What would stop an approve or a send-back, before the click
    deskIssues.length > 0 && React.createElement('div', { className: 'desk-problems', role: 'status' },
      React.createElement('p', { className: 'desk-problems__title' },
        'To fix before you approve or send back (' + deskIssues.length + ')'),
      React.createElement('ul', { className: 'desk-problems__list' },
        deskIssues.map(function (problem, i) {
          return React.createElement('li', { key: problem.path + '-' + i }, problem.message);
        })
      )
    ),

    // Inline validation error (B6: shown when Approve or Send back is blocked)
    editError && React.createElement('p', { className: 'validation-error desk-error', role: 'alert' }, editError),

    // The stop's ONE note box (phase 1, brief 1.1), always on screen and above the
    // actions, because it is sent with whichever action the director takes. It used
    // to live behind the Reject button, so a note the director had ready at an
    // approve could only reach a writer through a paid rework.
    React.createElement('div', { className: 'form-group mt-md' },
      React.createElement('label', { className: 'form-group__label', htmlFor: 'article-note' },
        'Note to the writer, sent with whichever button you press'),
      React.createElement('p', { className: 'text-xs text-muted' },
        'With Approve it stands for every later writer. With Send back it drives the rework, and then stands. Send back needs one.'),
      hasEdits && React.createElement('p', { className: 'text-xs text-muted', role: 'status' },
        'Your hand edits are sent with this note. The writer is told to keep them.'),
      React.createElement('textarea', {
        id: 'article-note',
        className: 'input feedback-area',
        value: feedbackText,
        onChange: function (e) { setFeedbackText(e.target.value); setSendBackArmed(false); },
        rows: 4,
        placeholder: 'What should the writer do differently, or keep?',
        'aria-label': 'Note to the writer, sent with approve or send back'
      })
    ),

    // Action buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        // When the fact-check found something STRUCTURAL, shipping it has to READ
        // like a choice. Four of the last five articles were approved first-pass
        // here and then needed 20-41 manual fixes. Advisories are counted
        // separately: they are suggestions, not blockers (see approveLabel).
        'aria-label': approve.ariaLabel
      }, approve.label),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'json' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('json'); },
        'aria-label': 'Open JSON editor'
      }, 'JSON Editor'),
      React.createElement('button', {
        className: 'action-modes__btn btn btn-danger',
        onClick: handleSendBackClick,
        disabled: sendBack.disabled,
        'aria-label': sendBack.ariaLabel
      }, sendBack.label)
    ),

    // JSON editor mode
    mode === 'json' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Edit Article JSON (Advanced)'),
      React.createElement('textarea', {
        className: 'input input-mono edit-area',
        value: jsonText,
        onChange: function (e) { setJsonText(e.target.value); setJsonError(''); },
        rows: 20,
        'aria-label': 'Edit article JSON'
      }),
      jsonError && React.createElement('p', { className: 'validation-error desk-error' }, jsonError),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleJsonApprove,
        'aria-label': 'Save JSON and approve'
      }, 'Save & Approve')
    ),

    // Expanded photo overlay
    renderExpandedPhoto()
  );
}

window.Console.checkpoints.Article = Article;
