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
 *
 * The desk's marks (task 4.10): nothing sits in front of the article. A fact the judge could
 * not fix within its budget and a code check's flag are marked in the row of the paragraph,
 * card or photo they are about; a concern about one of the director's edits, and an edit a
 * rework changed, in the row of the edit; a mark with no piece to sit beside, in one line
 * beside the approve button. There is no score and no note on the writing. The settled story
 * echoes above the headline, and the round's record folds below the article: the marks the
 * director's edits may have resolved, the fact check's list, the trace and the round. Where
 * each mark sits is console/checkpoint-view-logic.js deskView's, node-tested.
 *
 * Input that lands (task 4.14d): an open editor holds Approve, Send back and the JSON editor's
 * Save & Approve, and a line beside them says to save or cancel it first (unsavedInputLine), so
 * an approve never publishes the writer's text over an edit the director left open. JSON typed
 * in the JSON editor holds Approve and Send back the same way, since only the JSON editor's own
 * Save & Approve sends it, and a change made on the desk after the JSON editor opened holds that
 * Save & Approve, since its JSON lacks the change (fix round 1).
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, safeStringify, editBtn, TracePanel } = window.Console.utils;
const { RevisionDiff } = window.Console;
const ArticleEditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;
// The desk's block operations, checks and change report (task 4.3).
const DeskLogic = window.Console.articleDeskLogic;
const { unsavedInputLine } = window.Console.unsavedInputLogic;

/** How long the desk waits after a change before it asks for the page again, so a run of moves asks once. */
const ARTICLE_PREVIEW_DELAY_MS = 400;

/** The preview before the page has come back. */
const NO_PREVIEW = { html: null, error: '', pending: false };

/**
 * The programmatic fact-check's whole list (baseline §5: "half the refinement work was
 * already on screen as an advisory and was ignored" - in fact it was not on screen at all;
 * lib/content-bundle-fact-check.js reached the reviser as prompt text and the operator never).
 * Task 4.10: each finding is marked beside its piece of the article, and this list folds
 * below the article, under the fold's title, which gives its counts.
 *
 * The four measured failure classes it reports are evidence cards carrying
 * invented text under real token ids (15 items across 4 of 5 sessions, each a
 * section-level rewrite), roster members never named, invalid photo references,
 * and reporter-mode violations. Structural reads as an error, advisory as amber.
 */
function FactCheckPanel({ summary, cardHeadlines }) {
  if (!summary || summary.groups.length === 0) return null;

  return React.createElement('div', { className: 'fact-check mb-md' },
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
 * One line of the echo above the headline (spec 2026-09-19 §6.2; task 4.10): the settled
 * story or its question, as the view's deskEcho gives it, text in every field, with an
 * "(empty)" line for a blank one.
 */
function echoLine(label, value) {
  return React.createElement('p', { className: 'text-sm mb-sm' },
    React.createElement('strong', null, label + ': '),
    value || React.createElement('span', { className: 'text-muted' }, '(empty)')
  );
}

/**
 * A list of marks (task 4.10): each mark's label, then its text, in the tone deskMarks gives
 * it, and, with `showWhere`, the piece it was about in brackets. Under a piece in its row, the
 * marks beside it; beside the approve button, the marks with no piece; in the fold below the
 * article, the marks possibly resolved. Nothing for no marks.
 */
function deskMarksList(marks, showWhere) {
  if (!marks || marks.length === 0) return null;
  return React.createElement('ul', { className: 'desk-marks' },
    marks.map(function (mark) {
      return React.createElement('li', { key: mark.key, className: 'desk-mark desk-mark--' + mark.tone },
        React.createElement('strong', { className: 'desk-mark__label' }, mark.label + ': '),
        mark.text,
        showWhere && mark.where && React.createElement('span', { className: 'desk-mark__where' }, ' (' + mark.where + ')')
      );
    })
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
      // The page prints a photo's file and caption; the characters in it stay as the bundle has them.
      formFields.push(
        React.createElement('label', { key: 'l1', className: 'form-group__label' }, 'Caption'),
        React.createElement('input', {
          key: 'f1',
          className: 'input',
          value: localBlock.caption || '',
          onChange: function (e) { updateField('caption', e.target.value); },
          'aria-label': 'Photo caption'
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
 * seeds it, and the writer is no longer asked for it. Task 4.3b: nor its `placement`
 * (templates/journalist/partials/sidebar/evidence-card.hbs reads neither). An entry that
 * has either keeps it through the same Object.assign; the schema keeps both optional.
 *
 * Task 4.3c: only the fields the director changed are saved (DeskLogic.changedFields), as
 * in the other editors. A card with no significance seeds its select blank, offered as
 * "None", so saving another field writes no significance the card never had.
 */
function SidebarEvidenceCardEditor({ card, idx, original, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return DeskLogic.sidebarCardForm(card);
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
      React.createElement('div', { className: 'form-group mt-sm' },
        React.createElement('label', { className: 'form-group__label' }, 'Significance'),
        React.createElement('select', {
          className: 'input',
          value: local.significance,
          onChange: function (e) { setLocal(Object.assign({}, local, { significance: e.target.value })); },
          'aria-label': 'Sidebar entry significance'
        },
          !card.significance && React.createElement('option', { value: '' }, 'None'),
          React.createElement('option', { value: 'critical' }, 'Critical'),
          React.createElement('option', { value: 'supporting' }, 'Supporting'),
          React.createElement('option', { value: 'contextual' }, 'Contextual')
        )
      ),
      editorActions(function () { onSave(idx, Object.assign({}, original, DeskLogic.changedFields(original, local))); }, onCancel, 'Save evidence card')
    )
  );
}

/**
 * A row of the writer's money tracker as the page prints it: its description and amount
 * (templates/journalist/partials/sidebar/financial-tracker.hbs). The row keeps every other
 * field it has, and only the fields the director changed are saved into it.
 */
function FinancialEntryEditor({ entry, idx, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { description: entry.description || '', amount: entry.amount || '' };
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
        })
      ),
      editorActions(function () {
        onSave(idx, Object.assign({}, entry, DeskLogic.changedFields(entry, local)));
      }, onCancel, 'Save tracker row')
    )
  );
}

/**
 * The hero as the page prints it: its photo and caption (templates/journalist/layouts/
 * article.hbs). The characters in it stay as the bundle has them (DeskLogic.setHero keeps
 * every field the editor does not save).
 */
function HeroImageEditor({ hero, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { caption: hero.caption || '' };
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
      editorActions(function () { onSave(DeskLogic.changedFields(hero, local)); }, onCancel, 'Save hero image edit')
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
  // Brief 2.7: what the automatic passes of this round did before the director arrived,
  // folded below the article (task 4.10). Final review (reworks[0]): the theme decides
  // whether a pass's rework was given the evaluation's guidance, which the panel's label says.
  const trace = ViewLogic.traceView(data && data.trace, theme);
  // Absolute paths of this session's photos, for photoUrl (H13/F9).
  const sessionPhotos = (data && data.sessionPhotos) || [];
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
  // The page as it will print, from the preview route.
  const [preview, setPreview] = React.useState(NO_PREVIEW);
  // Whether the page prints the writer's money tracker (task 4.3b): 'unknown', 'prints' or
  // 'does-not-print'. The stop's payload says it first and each preview's answer keeps it
  // current (DeskLogic.writerTrackerState).
  const [trackerState, setTrackerState] = React.useState(function () {
    return DeskLogic.writerTrackerState(data && data.writerTrackerPrints);
  });
  const [mode, setMode] = React.useState('view'); // 'view' | 'json'
  const [jsonText, setJsonText] = React.useState('');
  // Task 4.14d: the text the JSON editor opened with and the desk's count of changes (deskVersion)
  // then, set each time it opens and read while it is open. The JSON differs from the seed once the
  // director types, and the count moves once the desk changes after it opened.
  const [jsonSeed, setJsonSeed] = React.useState('');
  const [jsonSeededAt, setJsonSeededAt] = React.useState(0);
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

  // The desk (task 4.10): the settled story's echo, every mark beside its piece of the bundle on
  // the desk or apart, and what folds below the article. Built again only when the stop's payload
  // or the bundle on the desk changes, not on each keystroke in the note box.
  const desk = React.useMemo(function () {
    return ViewLogic.deskView(data, editedBundle || contentBundle);
  }, [data, editedBundle]);

  /** The marks beside one piece of the article, as deskView placed them. */
  function marksAt(anchor) {
    return ViewLogic.deskMarksAt(desk.marks, anchor);
  }

  // Task 4.14d: an open editor's form reaches the desk only when the director saves it, and JSON
  // typed in the JSON editor reaches a payload only through its own Save & Approve, which sends
  // nothing changed on the desk after the JSON editor opened. The desk sends two things, so it asks
  // twice: `held` for Approve and Send back, which send the bundle on the desk, and `jsonHeld` for
  // the JSON editor's Save & Approve, which sends the JSON. While an answer holds, its buttons wait,
  // and its line beside them says why.
  const unsaved = {
    editor: editingBlock,
    bundle: editedBundle || contentBundle,
    json: mode === 'json' ? { text: jsonText, seed: jsonSeed, seededAt: jsonSeededAt } : null,
    deskVersion: deskVersion
  };
  const held = unsavedInputLine('article', unsaved);
  const jsonHeld = unsavedInputLine('article-json', unsaved);

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
    setTrackerState(DeskLogic.writerTrackerState(data && data.writerTrackerPrints));
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
  // says whether the page prints the writer's money tracker, which keeps trackerState
  // current; a failure says why in the preview's status line (task 4.3b).
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
            setPreview({ html: result.body.html || '', error: '', pending: false });
            setTrackerState(function (state) { return DeskLogic.writerTrackerState(result.body.writerTrackerPrints, state); });
          } else {
            setPreview(function (p) {
              return Object.assign({}, p, { html: null, pending: false, error: result.body.error || 'The page could not be rendered.' });
            });
          }
        })
        .catch(function (err) {
          if (!cancelled) {
            setPreview(function (p) { return Object.assign({}, p, { pending: false, error: DeskLogic.previewFailure(err) }); });
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

  /** One step up or down for a Key Evidence entry, within the sidebar (task 4.14c). */
  function sidebarStep(idx, direction) {
    var bundle = getCurrentBundle();
    var to = DeskLogic.sidebarStepTarget(bundle, idx, direction);
    if (to !== null) applyDesk(DeskLogic.moveSidebarCard(bundle, idx, to));
  }

  /** A Key Evidence entry's delete takes two clicks, as a block's does; it arms as 'sidebar:<index>'. */
  function sidebarDeleteClick(idx) {
    var key = 'sidebar:' + idx;
    if (armedDelete !== key) {
      setArmedDelete(key);
      return;
    }
    applyDesk(DeskLogic.deleteSidebarCard(getCurrentBundle(), idx));
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
    if (held) return;
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
    if (jsonHeld) return;
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
      // The JSON editor opens on the bundle on the desk, and keeps that text as its seed and the
      // desk's count of changes then.
      var seed = safeStringify(getCurrentBundle(), 2);
      setJsonText(seed);
      setJsonSeed(seed);
      setJsonSeededAt(deskVersion);
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
    if (held) return;
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
   * One editable piece of the article: its content with its marks under it (task 4.10), and
   * its rail, a column of its own beside it holding the pencil and any other control, so
   * every editor is visible and neither a control nor a mark covers the prose (spec
   * 2026-10-02 section 6.3).
   */
  function deskRow(key, className, body, onEdit, controls, marks) {
    return React.createElement('div', { key: key, className: 'desk-row ' + className },
      React.createElement('div', { className: 'desk-row__body' }, body, deskMarksList(marks)),
      React.createElement('div', { className: 'desk-rail' }, editBtn(onEdit), controls || null)
    );
  }

  /** A piece's open editor with the piece's marks under it, so the director fixes what they flag with them in view. */
  function withMarks(key, editor, marks) {
    return React.createElement(React.Fragment, { key: key }, editor, deskMarksList(marks));
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

  /**
   * A Key Evidence entry's controls beside the pencil (task 4.14c): one step up or down within
   * the sidebar, and delete. Spec 6.3: cards can be moved or deleted, and C9 puts every inline
   * card in the sidebar too.
   */
  function sidebarControls(idx) {
    var bundle = getCurrentBundle();
    var armed = armedDelete === 'sidebar:' + idx;
    return React.createElement(React.Fragment, null,
      deskButton('\u2191', 'Move this entry up', function () { sidebarStep(idx, 'up'); },
        { disabled: DeskLogic.sidebarStepTarget(bundle, idx, 'up') === null }),
      deskButton('\u2193', 'Move this entry down', function () { sidebarStep(idx, 'down'); },
        { disabled: DeskLogic.sidebarStepTarget(bundle, idx, 'down') === null }),
      deskButton(armed ? 'Delete?' : '\u2715', armed ? 'Click again to delete this entry' : 'Delete this entry',
        function () { sidebarDeleteClick(idx); }, { armed: armed })
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
          block.caption && React.createElement('figcaption', { className: 'article-photo__caption' }, block.caption)
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
    var marks = marksAt({ kind: 'block', section: sectionIdx, block: blockIdx });

    if (isEditing('block', sectionIdx, blockIdx)) {
      return withMarks('edit-' + sectionIdx + '-' + blockIdx, React.createElement(BlockEditor, {
        block: block,
        sectionIdx: sectionIdx,
        blockIdx: blockIdx,
        onSave: saveBlockEdit,
        onCancel: cancelEdit
      }), marks);
    }

    return deskRow('block-' + sectionIdx + '-' + blockIdx,
      'desk-row--block' + (DeskLogic.isEmptyBlock(block) ? ' desk-row--empty' : ''),
      blockBody(block),
      function () { startBlockEdit(sectionIdx, blockIdx); },
      blockControls(sectionIdx, blockIdx),
      marks);
  }

  // -- Section heading: its editor, and insertion at the top of the section --

  function renderSectionHeading(section, sectionIdx) {
    var marks = marksAt({ kind: 'heading', section: sectionIdx });
    if (isEditing('heading', sectionIdx)) {
      return withMarks('heading-edit-' + sectionIdx, React.createElement(SectionHeadingEditor, {
        heading: section.heading || '',
        onSave: function (heading) { saveHeadingEdit(sectionIdx, heading); },
        onCancel: cancelEdit
      }), marks);
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
      ),
      marks);
  }

  // -- Evidence card renderer (sidebar) --

  function renderSidebarEvidenceCard(card, idx) {
    var marks = marksAt({ kind: 'sidebar', index: idx });
    if (isEditing('sidebar', 'evidenceCards', idx)) {
      return withMarks('ec-edit-' + idx, React.createElement(SidebarEvidenceCardEditor, {
        card: card,
        idx: idx,
        original: card,
        onSave: saveSidebarCardEdit,
        onCancel: cancelEdit
      }), marks);
    }

    // What the sidebar prints (templates/journalist/partials/sidebar/evidence-card.hbs): the
    // headline, the summary and the significance badge, and the document's id, which the page
    // carries as the card's data-token-id and the fact check names the card by. Never the
    // content, the owner or the placement, which it does not print.
    var body = React.createElement('div', {
      className: 'article-evidence-card article-evidence-card--' + (card.significance || 'supporting') + ' mb-md'
    },
      React.createElement('div', { className: 'article-evidence-card__label' }, card.headline || card.tokenId || 'Card ' + (idx + 1)),
      card.summary && React.createElement('div', { className: 'article-evidence-card__content' }, card.summary),
      card.significance && React.createElement('div', { className: 'article-evidence-card__meta' },
        React.createElement(Badge, {
          label: card.significance,
          color: card.significance === 'critical' ? 'var(--accent-red)' :
                 card.significance === 'supporting' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
        })
      ),
      card.tokenId && React.createElement('span', { className: 'text-xs text-muted d-block mt-sm' }, card.tokenId)
    );
    return deskRow('ec-' + idx, 'desk-row--card', body, function () { startSidebarEdit('evidenceCards', idx); }, sidebarControls(idx), marks);
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
        // The row as the page prints it: the account and its amount.
        var body = React.createElement('div', { className: 'desk-tracker-row' },
          React.createElement('span', null, entry.description || ''),
          React.createElement('span', { className: 'financial-table__amount' }, entry.amount || '')
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
    var marks = marksAt({ kind: 'hero' });

    if (isEditing('sidebar', 'heroImage', 0)) {
      return withMarks('hero-edit', React.createElement(HeroImageEditor, {
        hero: currentHero,
        onSave: saveHeroImageEdit,
        onCancel: cancelEdit
      }), marks);
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
      currentHero.caption && React.createElement('figcaption', { className: 'article-photo__caption' }, currentHero.caption)
    );
    return deskRow('hero', 'desk-row--hero', body, function () { startSidebarEdit('heroImage', 0); }, null, marks);
  }

  // -- Headline and byline --

  function renderHeadline() {
    var currentHeadline = getCurrentBundle().headline || {};
    var marks = marksAt({ kind: 'headline' });
    if (isEditing('headline')) {
      return withMarks('headline-edit', React.createElement(HeadlineEditor, {
        headline: currentHeadline,
        onSave: saveHeadlineEdit,
        onCancel: cancelEdit
      }), marks);
    }
    var body = React.createElement('div', { className: 'outline-section' },
      currentHeadline.kicker && React.createElement('p', { className: 'text-xs text-muted mb-sm article-headline__kicker' }, currentHeadline.kicker),
      React.createElement('h3', { className: 'article-headline__main' + (currentHeadline.main ? '' : ' text-muted') }, currentHeadline.main || 'No headline'),
      currentHeadline.deck && React.createElement('p', { className: 'text-sm text-secondary mt-sm article-headline__deck' }, currentHeadline.deck)
    );
    return deskRow('headline', 'desk-row--headline', body, startHeadlineEdit, null, marks);
  }

  function renderByline() {
    var currentByline = getCurrentBundle().byline || {};
    var marks = marksAt({ kind: 'byline' });
    if (isEditing('sidebar', 'byline', 0)) {
      return withMarks('byline-edit', React.createElement(BylineEditor, {
        byline: currentByline,
        onSave: saveBylineEdit,
        onCancel: cancelEdit
      }), marks);
    }
    // As the page prints it (DeskLogic.bylineLabel, the header partial's rule): the title and
    // the guest reporter's credit print only with an author.
    var body = React.createElement('div', { className: 'text-xs text-muted mb-md' }, DeskLogic.bylineLabel(currentByline));
    return deskRow('byline', 'desk-row--byline', body, function () { startSidebarEdit('byline', 0); }, null, marks);
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

  // The count on the button is the fact check's structural issues alone (approveLabel).
  var approve = ViewLogic.approveLabel(desk.folds.factCheck.summary, hasEdits);
  const sendBack = ViewLogic.sendBackButton(sendBackArmed, feedbackText, 'article');
  // Task 4.14e: a send-back whose rework did not run, read by what the note box holds.
  const didNotRun = ViewLogic.reworkDidNotRunLine(data && data.roundDidNotRun, feedbackText, 'article');

  var currentSections = deskBundleNow.sections || [];
  var currentEvidenceCards = deskBundleNow.evidenceCards || [];
  var writerTracker = deskBundleNow.financialTracker || null;
  // The writer's money tracker on the desk (task 4.3b): its editor while the page prints it,
  // the ledger's note while the ledger's prints in its place, neither while the desk does not know.
  var trackerDisplay = DeskLogic.writerTrackerDisplay(trackerState, deskBundleNow);
  // The word count reads the bundle as edited.
  var wordCount = DeskLogic.wordCount(deskBundleNow);
  // What would stop an approve or a send-back now, shown before the click.
  var deskIssues = DeskLogic.deskProblems(deskBundleNow);
  // The page as it will print: the preview route's answer once it comes; until then, the
  // stop's own render of the draft while the desk still holds it.
  var previewHtml = typeof preview.html === 'string' ? preview.html : (hasEdits ? '' : ((data && data.htmlPreview) || ''));

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Nothing sits in front of the article (task 4.10): the marks sit beside their pieces,
    // and the round's record folds below the article.

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

    // The echo (spec 2026-09-19 §6.2; task 4.10): the story the director settled at the
    // meeting and its question, read-only, so the headline is judged against the story it
    // must serve. No pencil: the story is changed at the meeting.
    desk.echo && React.createElement('div', { className: 'desk-echo', 'aria-label': desk.echo.title },
      React.createElement('h4', { className: 'outline-section__title' }, desk.echo.title),
      echoLine(desk.echo.storyLabel, desk.echo.story),
      echoLine(desk.echo.questionLabel, desk.echo.question)
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

    // The money tracker (journalist theme only), as trackerDisplay decides.
    !isDetective && trackerDisplay === 'editor' && renderFinancialTracker(writerTracker),
    !isDetective && trackerDisplay === 'ledger-note' && React.createElement('p', { className: 'text-xs text-muted' },
      'The page prints the money tracker from the ledger, which the preview shows.'),

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

    // Task 4.14e: a send-back whose rework did not run, above the note box it is retried from.
    didNotRun && React.createElement('p', { className: 'desk__did-not-run', role: 'status' }, didNotRun),

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

    // The marks with no piece to sit beside, such as a roster gap, one line each beside the
    // approve button, where its count is (task 4.10).
    desk.apart.any && React.createElement('div', { className: 'desk-apart', role: 'status' },
      React.createElement('p', { className: 'desk-apart__title' }, desk.apart.title),
      deskMarksList(desk.apart.items)
    ),

    // Action buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        disabled: !!held,
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
        disabled: !!held || sendBack.disabled,
        'aria-label': sendBack.ariaLabel
      }, sendBack.label)
    ),

    // Task 4.14d: what holds the buttons, beside them.
    held && React.createElement('p', { className: 'validation-error', role: 'status' }, held),

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
        disabled: !!jsonHeld,
        onClick: handleJsonApprove,
        'aria-label': 'Save JSON and approve'
      }, 'Save & Approve'),
      // Task 4.14d: what holds the JSON editor's Save & Approve, beside it.
      jsonHeld && React.createElement('p', { className: 'validation-error', role: 'status' }, jsonHeld)
    ),

    // Folded below the article (task 4.10; spec 6.3): the marks the director's edits may have
    // resolved, the fact check's whole list, what the automatic passes did, and the round's
    // record (its banner, the note it was sent back with, every change to the director's
    // edits, code's restores among them, and the standing notes).
    desk.folds.resolved.any && React.createElement(CollapsibleSection, { title: desk.folds.resolved.title },
      React.createElement('div', { className: 'desk-resolved' },
        React.createElement('p', { className: 'text-xs text-muted' }, desk.folds.resolved.hint),
        deskMarksList(desk.folds.resolved.items, true)
      )
    ),
    desk.folds.factCheck.any && React.createElement(CollapsibleSection, { title: desk.folds.factCheck.title },
      React.createElement(FactCheckPanel, { summary: desk.folds.factCheck.summary, cardHeadlines: cardHeadlines })),
    trace.any && React.createElement(CollapsibleSection, { title: trace.title },
      React.createElement(TracePanel, { view: trace })),
    React.createElement(CollapsibleSection, { title: desk.folds.rounds.title },
      React.createElement(RevisionDiff, {
        previous: previousArticle,
        current: contentBundle,
        revisionCount: revisionCount,
        maxRevisions: maxRevisions,
        previousFeedback: previousFeedback,
        humanRevisionCount: (data && data.humanRevisionCount) || 0,
        handEditReport: (data && data.handEditReport) || null,
        gateNotes: (data && data.directorGateNotes) || []
      })),

    // Expanded photo overlay
    renderExpandedPhoto()
  );
}

window.Console.checkpoints.Article = Article;
