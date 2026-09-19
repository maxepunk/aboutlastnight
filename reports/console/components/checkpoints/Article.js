/**
 * Article Checkpoint Component
 * Rich article preview with inline per-block editing, photo thumbnails,
 * styled evidence cards, verbatim/crystallization pull quotes, and
 * formatted financial tracker. Supports approve (with/without edits),
 * JSON editor (advanced), reject with feedback, and HTML preview.
 * Exports to window.Console.checkpoints.Article
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, CollapsibleSection, safeStringify, editBtn, EvalBar } = window.Console.utils;
const { RevisionDiff } = window.Console;
const ArticleEditLogic = window.Console.outlineEditLogic;
const ViewLogic = window.Console.checkpointViewLogic;

/**
 * Photos in the HTML preview, and scripts in it (R5 F9).
 *
 * The assembled article references photos relatively (`sessionphotos/<id>/x.jpg`).
 * The server injects `<base href="/">` into `htmlPreview` so they resolve; this
 * strips <script> tags instead of granting `allow-scripts`, which removes the
 * three "Blocked script execution in 'about:srcdoc'" console errors without
 * giving the previewed document script access to its own (same-origin) frame.
 */
function stripScripts(html) {
  return String(html == null ? '' : html)
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*\/>/gi, '');
}

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

/** Last path segment, tolerating both separators (the photo paths are Windows). */
function baseName(filepath) {
  const value = String(filepath == null ? '' : filepath);
  const cut = Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\'));
  return cut >= 0 ? value.slice(cut + 1) : value;
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
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { onSave(sectionIdx, blockIdx, localBlock); },
          'aria-label': 'Save block edit'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
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
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { onSave(local); },
          'aria-label': 'Save headline edit'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

function PullQuoteEditor({ pq, idx, original, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { text: pq.text || '', attribution: pq.attribution || '', placement: pq.placement || 'right', type: pq.type || 'verbatim' };
  });

  return React.createElement('div', { key: 'pq-edit-' + idx, className: 'pull-quote article-block--editing fade-in' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Quote Text'),
      React.createElement('textarea', {
        className: 'input',
        value: local.text,
        onChange: function (e) { setLocal(Object.assign({}, local, { text: e.target.value })); },
        rows: 3,
        'aria-label': 'Pull quote text'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Attribution (empty for crystallization)'),
      React.createElement('input', {
        className: 'input',
        value: local.attribution,
        onChange: function (e) { setLocal(Object.assign({}, local, { attribution: e.target.value })); },
        'aria-label': 'Attribution'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Placement'),
      React.createElement('select', {
        className: 'input',
        value: local.placement,
        onChange: function (e) { setLocal(Object.assign({}, local, { placement: e.target.value })); },
        'aria-label': 'Placement'
      },
        React.createElement('option', { value: 'left' }, 'Left'),
        React.createElement('option', { value: 'right' }, 'Right'),
        React.createElement('option', { value: 'center' }, 'Center')
      ),
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { onSave('pullQuotes', idx, Object.assign({}, original, local)); },
          'aria-label': 'Save pull quote'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

function SidebarEvidenceCardEditor({ card, idx, original, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return {
      headline: card.headline || '',
      content: card.content || '',
      summary: card.summary || '',
      owner: card.owner || '',
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
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Content'),
      React.createElement('textarea', {
        className: 'input',
        value: local.content,
        onChange: function (e) { setLocal(Object.assign({}, local, { content: e.target.value })); },
        rows: 4,
        'aria-label': 'Card content'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Owner'),
      React.createElement('input', {
        className: 'input',
        value: local.owner,
        onChange: function (e) { setLocal(Object.assign({}, local, { owner: e.target.value })); },
        'aria-label': 'Card owner'
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
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { onSave('evidenceCards', idx, Object.assign({}, original, local)); },
          'aria-label': 'Save evidence card'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

function FinancialEntryEditor({ entry, idx, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return { description: entry.description || '', amount: entry.amount || '', date: entry.date || '', category: entry.category || '' };
  });

  return React.createElement('tr', { key: 'ft-edit-' + idx, className: 'article-block--editing' },
    React.createElement('td', { colSpan: 3 },
      React.createElement('div', { className: 'article-block__edit-form' },
        React.createElement('div', { className: 'flex gap-sm' },
          React.createElement('input', {
            className: 'input',
            placeholder: 'Description',
            value: local.description,
            onChange: function (e) { setLocal(Object.assign({}, local, { description: e.target.value })); },
            style: { flex: 2 }
          }),
          React.createElement('input', {
            className: 'input',
            placeholder: 'Amount',
            value: local.amount,
            onChange: function (e) { setLocal(Object.assign({}, local, { amount: e.target.value })); },
            style: { flex: 1 }
          }),
          React.createElement('input', {
            className: 'input',
            placeholder: 'Category',
            value: local.category,
            onChange: function (e) { setLocal(Object.assign({}, local, { category: e.target.value })); },
            style: { flex: 1 }
          })
        ),
        React.createElement('div', { className: 'flex gap-sm mt-sm' },
          React.createElement('button', {
            className: 'btn btn-primary btn-sm',
            onClick: function () { onSave(idx, local); }
          }, 'Save'),
          React.createElement('button', {
            className: 'btn btn-ghost btn-sm',
            onClick: onCancel
          }, 'Cancel')
        )
      )
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
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () {
            onSave(Object.assign({}, hero, {
              caption: local.caption,
              characters: local.characters.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
            }));
          },
          'aria-label': 'Save hero image edit'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

function BylineEditor({ byline, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return {
      author: byline.author || '',
      title: byline.title || '',
      location: byline.location || '',
      date: byline.date || ''
    };
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
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Location'),
          React.createElement('input', {
            className: 'input',
            value: local.location,
            onChange: function (e) { setLocal(Object.assign({}, local, { location: e.target.value })); },
            'aria-label': 'Byline location'
          })
        ),
        React.createElement('div', { style: { flex: 1 } },
          React.createElement('label', { className: 'form-group__label' }, 'Date'),
          React.createElement('input', {
            className: 'input',
            value: local.date,
            onChange: function (e) { setLocal(Object.assign({}, local, { date: e.target.value })); },
            'aria-label': 'Byline date'
          })
        )
      ),
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () { onSave(local); },
          'aria-label': 'Save byline edit'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

function GalleryPhotoEditor({ photo, idx, onSave, onCancel }) {
  const [local, setLocal] = React.useState(function () {
    return {
      caption: photo.caption || '',
      characters: (photo.characters || []).join(', '),
      afterSection: photo.afterSection || ''
    };
  });

  return React.createElement('div', { className: 'article-photos-gallery__item article-block--editing fade-in' },
    React.createElement('div', { className: 'article-block__edit-form' },
      React.createElement('label', { className: 'form-group__label' }, 'Caption'),
      React.createElement('input', {
        className: 'input',
        value: local.caption,
        onChange: function (e) { setLocal(Object.assign({}, local, { caption: e.target.value })); },
        'aria-label': 'Photo caption'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'Characters (comma-separated)'),
      React.createElement('input', {
        className: 'input',
        value: local.characters,
        onChange: function (e) { setLocal(Object.assign({}, local, { characters: e.target.value })); },
        'aria-label': 'Photo characters'
      }),
      React.createElement('label', { className: 'form-group__label mt-sm' }, 'After Section'),
      React.createElement('input', {
        className: 'input',
        value: local.afterSection,
        onChange: function (e) { setLocal(Object.assign({}, local, { afterSection: e.target.value })); },
        'aria-label': 'Place after section'
      }),
      React.createElement('div', { className: 'flex gap-sm mt-sm' },
        React.createElement('button', {
          className: 'btn btn-primary btn-sm',
          onClick: function () {
            onSave('photos', idx, Object.assign({}, photo, {
              caption: local.caption,
              characters: local.characters.split(',').map(function (s) { return s.trim(); }).filter(Boolean),
              afterSection: local.afterSection
            }));
          },
          'aria-label': 'Save photo edit'
        }, 'Save'),
        React.createElement('button', {
          className: 'btn btn-ghost btn-sm',
          onClick: onCancel,
          'aria-label': 'Cancel edit'
        }, 'Cancel')
      )
    )
  );
}

// ── Main Article Component ──

function Article({ data, sessionId: propSessionId, theme, onApprove, onReject, dispatch, revisionCache, pendingEdits }) {
  const contentBundle = (data && data.contentBundle) || {};

  // Theme detection: prop > metadata > fallback
  const isDetective = theme === 'detective' ||
    (!theme && contentBundle.metadata && contentBundle.metadata.theme === 'detective');
  // H13: the preview used to be gated on `assembledHtml`, which is null until
  // assembleHtml runs TWO NODES LATER — so the button did not exist on the first
  // pass, i.e. at the only gate where it matters. Task 3 renders `htmlPreview`
  // from the pending bundle with the same TemplateAssembler the pipeline
  // publishes with.
  const previewHtml = (data && data.htmlPreview) || (data && data.assembledHtml) ||
    (data && data.articleHtml) || '';
  // H6: `data.evaluationHistory` is an append-only ARRAY mixing all three phases;
  // the old renderEvalBar read `.overallScore` (and `advisoryNotes`, not a field)
  // off it and rendered null in every session.
  const evaluation = ViewLogic.evaluationView(ViewLogic.lastEvaluationFrom(data, 'article'));
  // Absolute paths of this session's photos, for photoUrl (H13/F9).
  const sessionPhotos = (data && data.sessionPhotos) || [];
  // Task 3.6's programmatic fact-check of THIS bundle (baseline §5).
  const factCheck = ViewLogic.factCheckSummary((data && data.factCheck) || null);
  const previousArticle = (revisionCache && revisionCache.article) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;
  const sessionId = propSessionId || (data && data.sessionId) || '';

  const headline = contentBundle.headline || {};
  const byline = contentBundle.byline || {};
  const sections = contentBundle.sections || [];
  const pullQuotes = contentBundle.pullQuotes || [];
  const evidenceCards = contentBundle.evidenceCards || [];
  const financialTracker = contentBundle.financialTracker || null;
  const heroImage = contentBundle.heroImage || null;
  const photos = contentBundle.photos || [];

  // -- State --
  const [editedBundle, setEditedBundle] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json' | 'reject'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  // B6: inline error for an edited bundle that fails the client shape gate.
  const [editError, setEditError] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');
  const [showHtmlPreview, setShowHtmlPreview] = React.useState(false);
  const [expandedPhoto, setExpandedPhoto] = React.useState(null);

  // Reset when data changes
  const dataKey = ArticleEditLogic.computeResetKey(contentBundle, revisionCount);
  React.useEffect(function () {
    setEditedBundle(null);
    setEditingBlock(null);
    setHasEdits(false);
    setMode('view');
    setJsonText('');
    setJsonError('');
    setEditError('');
    setFeedbackText('');
    setShowHtmlPreview(false);
    setExpandedPhoto(null);
  }, [dataKey]);

  // Restore edits from reducer state if component remounted after processing error
  React.useEffect(function () {
    if (pendingEdits && !editedBundle) {
      setEditedBundle(pendingEdits);
      setHasEdits(true);
    }
  }, [pendingEdits]);

  // Word count
  const wordCount = React.useMemo(function () {
    var count = 0;
    sections.forEach(function (section) {
      (section.content || []).forEach(function (block) {
        if (block.type === 'paragraph' && block.text) {
          count += block.text.split(/\s+/).filter(Boolean).length;
        }
      });
    });
    return count;
  }, [sections]);

  // Get the current bundle (edited or original)
  function getCurrentBundle() {
    return editedBundle || contentBundle;
  }

  // Deep clone contentBundle for editing
  function ensureEditedBundle() {
    if (editedBundle) return editedBundle;
    var clone = JSON.parse(safeStringify(contentBundle));
    setEditedBundle(clone);
    return clone;
  }

  // -- Edit helpers --

  function startBlockEdit(sectionIdx, blockIdx) {
    setEditingBlock({ type: 'block', sectionIdx: sectionIdx, blockIdx: blockIdx });
  }

  function startSidebarEdit(category, idx) {
    setEditingBlock({ type: 'sidebar', category: category, idx: idx });
  }

  function startHeadlineEdit() {
    setEditingBlock({ type: 'headline' });
  }

  function isEditing(type, a, b) {
    if (!editingBlock) return false;
    if (type === 'block') return editingBlock.type === 'block' && editingBlock.sectionIdx === a && editingBlock.blockIdx === b;
    if (type === 'sidebar') return editingBlock.type === 'sidebar' && editingBlock.category === a && editingBlock.idx === b;
    if (type === 'headline') return editingBlock.type === 'headline';
    return false;
  }

  function cancelEdit() {
    setEditingBlock(null);
  }

  function saveBlockEdit(sectionIdx, blockIdx, updatedBlock) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    if (clone.sections && clone.sections[sectionIdx] && clone.sections[sectionIdx].content) {
      clone.sections[sectionIdx].content[blockIdx] = updatedBlock;
    }
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveSidebarEdit(category, idx, updatedItem) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    if (clone[category] && clone[category][idx] !== undefined) {
      clone[category][idx] = updatedItem;
    }
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveFinancialEntryEdit(idx, updatedEntry) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    if (clone.financialTracker && clone.financialTracker.entries && clone.financialTracker.entries[idx] !== undefined) {
      clone.financialTracker.entries[idx] = updatedEntry;
    }
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveHeadlineEdit(updatedHeadline) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    clone.headline = updatedHeadline;
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveHeroImageEdit(updatedHero) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    clone.heroImage = updatedHero;
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveBylineEdit(updatedByline) {
    var bundle = ensureEditedBundle();
    var clone = JSON.parse(safeStringify(bundle));
    clone.byline = updatedByline;
    setEditedBundle(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  // -- Actions --

  /**
   * B6 (client half): check an edited bundle's shape before the POST.
   *
   * Task 3 added the server-side content-bundle schema gate, which returns a 400
   * the console renders as a banner. This runs the same class of check inline, in
   * the existing validation-error slot, and BLOCKS Approve — because before
   * either gate existed a hand-edit reached validateContentBundle, which routes a
   * bad bundle straight to END: ten checkpoints and five-plus Opus calls spent,
   * Retry failing identically, and rollback discarding the approved draft.
   *
   * @returns {boolean} whether the edits may be sent
   */
  function gateEdits(bundle, setError) {
    var result = ArticleEditLogic.validateBundleShape(bundle);
    if (result.valid) {
      setError('');
      return true;
    }
    setError('Cannot approve, edited article is invalid: ' +
      result.errors.map(function (e) { return e.path + ' ' + e.message; }).join('; '));
    return false;
  }

  function handleApprove() {
    if (hasEdits && editedBundle) {
      if (!gateEdits(editedBundle, setEditError)) return;
      // Persist edits in reducer state so they survive unmount during processing
      if (dispatch) {
        dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: editedBundle });
      }
      onApprove({ article: true, articleEdits: editedBundle });
    } else {
      setEditError('');
      onApprove({ article: true });
    }
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
    if (dispatch) {
      dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'article', edits: parsed });
    }
    onApprove({ article: true, articleEdits: parsed });
  }

  function handleModeChange(newMode) {
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'json') {
      setJsonText(safeStringify(getCurrentBundle(), 2));
      setJsonError('');
    }
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleReject() {
    if (!feedbackText.trim()) return;
    if (dispatch) {
      dispatch({ type: 'CACHE_REVISION', contentType: 'article', data: contentBundle });
    }
    onReject({ article: false, articleFeedback: feedbackText.trim() });
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


  // -- Block renderers --

  function renderBlock(block, sectionIdx, blockIdx) {
    if (!block || !block.type) return null;
    var currentBundle = getCurrentBundle();
    var currentBlock = (currentBundle.sections && currentBundle.sections[sectionIdx] &&
      currentBundle.sections[sectionIdx].content && currentBundle.sections[sectionIdx].content[blockIdx]) || block;
    var editing = isEditing('block', sectionIdx, blockIdx);

    if (editing) {
      return React.createElement(BlockEditor, {
        key: 'edit-' + sectionIdx + '-' + blockIdx,
        block: currentBlock,
        sectionIdx: sectionIdx,
        blockIdx: blockIdx,
        onSave: saveBlockEdit,
        onCancel: cancelEdit
      });
    }

    switch (currentBlock.type) {
      case 'paragraph':
        return React.createElement('div', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block article-block--paragraph article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          React.createElement('p', { className: 'text-sm' }, currentBlock.text || '')
        );

      case 'quote':
        return React.createElement('blockquote', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block article-block--quote article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          React.createElement('p', { className: 'article-block__quote-text' },
            '\u201C' + (currentBlock.text || '') + '\u201D'
          ),
          currentBlock.attribution && React.createElement('cite', { className: 'article-block__quote-cite' },
            '\u2014 ' + currentBlock.attribution
          )
        );

      case 'evidence-reference':
        return React.createElement('div', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block article-block--evidence article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          React.createElement('div', { className: 'article-block__evidence-header' },
            React.createElement(Badge, { label: 'Evidence', color: 'var(--accent-amber)' }),
            currentBlock.tokenId && React.createElement('span', { className: 'text-xs text-muted' }, currentBlock.tokenId)
          ),
          currentBlock.text && React.createElement('p', { className: 'text-sm' }, currentBlock.text),
          currentBlock.caption && React.createElement('p', { className: 'text-xs text-secondary' }, currentBlock.caption)
        );

      case 'evidence-card':
        return React.createElement('aside', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-evidence-card article-evidence-card--' + (currentBlock.significance || 'supporting') + ' article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          React.createElement('div', { className: 'article-evidence-card__label' }, currentBlock.headline || 'Evidence'),
          React.createElement('div', { className: 'article-evidence-card__content' }, currentBlock.content || ''),
          (currentBlock.owner || currentBlock.significance) && React.createElement('div', { className: 'article-evidence-card__meta' },
            currentBlock.owner && React.createElement('span', { className: 'article-evidence-card__owner' }, currentBlock.owner),
            currentBlock.significance && React.createElement(Badge, {
              label: currentBlock.significance,
              color: currentBlock.significance === 'critical' ? 'var(--accent-red)' :
                     currentBlock.significance === 'supporting' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
            })
          )
        );

      case 'photo':
        return React.createElement('figure', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block article-block--photo-rich article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          photoUrl(currentBlock.filename)
            ? React.createElement('img', {
                src: photoUrl(currentBlock.filename),
                alt: currentBlock.caption || currentBlock.filename,
                className: 'article-photo__thumbnail',
                loading: 'lazy',
                onClick: function () { setExpandedPhoto(expandedPhoto === currentBlock.filename ? null : currentBlock.filename); }
              })
            : React.createElement('div', { className: 'article-block__photo-placeholder' },
                '[Photo' + (currentBlock.filename ? ': ' + currentBlock.filename : '') + ']'
              ),
          currentBlock.caption && React.createElement('figcaption', { className: 'article-photo__caption' }, currentBlock.caption),
          currentBlock.characters && currentBlock.characters.length > 0 && React.createElement('div', { className: 'tag-list mt-sm' },
            currentBlock.characters.map(function (c, j) {
              return React.createElement(Badge, { key: 'char-' + j, label: c, color: 'var(--accent-cyan)' });
            })
          )
        );

      case 'list':
        return React.createElement('div', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block article-block--list article-block--editable'
        },
          editBtn(function () { startBlockEdit(sectionIdx, blockIdx); }),
          React.createElement('ul', { className: 'checkpoint-section__list text-sm' },
            (currentBlock.items || []).map(function (item, j) {
              return React.createElement('li', { key: 'item-' + j },
                typeof item === 'string' ? item : (item.text || safeStringify(item))
              );
            })
          )
        );

      default:
        return React.createElement('div', {
          key: 'block-' + sectionIdx + '-' + blockIdx,
          className: 'article-block text-xs text-muted'
        }, '[' + currentBlock.type + ' block]');
    }
  }

  // -- Pull quote renderer --

  function renderPullQuote(pq, idx) {
    var currentPq = (getCurrentBundle().pullQuotes || [])[idx] || pq;
    var isVerbatim = currentPq.type === 'verbatim';
    var editing = isEditing('sidebar', 'pullQuotes', idx);

    if (editing) {
      return React.createElement(PullQuoteEditor, {
        key: 'pq-edit-' + idx,
        pq: currentPq,
        idx: idx,
        original: pq,
        onSave: saveSidebarEdit,
        onCancel: cancelEdit
      });
    }

    return React.createElement('div', {
      key: 'pq-' + idx,
      className: 'pull-quote ' + (isVerbatim ? 'pull-quote--verbatim' : 'pull-quote--crystallization') + ' article-block--editable'
    },
      editBtn(function () { startSidebarEdit('pullQuotes', idx); }),
      !isVerbatim && React.createElement('span', { className: 'pull-quote__type-label' }, isDetective ? "Detective's Note" : "Nova's Insight"),
      React.createElement('p', { className: 'pull-quote__text' },
        '\u201C' + (currentPq.text || '') + '\u201D'
      ),
      isVerbatim && currentPq.attribution && React.createElement('p', { className: 'pull-quote__attribution' },
        '\u2014 ' + currentPq.attribution
      ),
      React.createElement('div', { className: 'tag-list mt-sm' },
        React.createElement(Badge, { label: isVerbatim ? 'verbatim' : 'crystallization', color: isVerbatim ? 'var(--accent-amber)' : 'var(--accent-cyan)' }),
        currentPq.placement && React.createElement(Badge, { label: currentPq.placement, color: 'var(--text-muted)' })
      )
    );
  }

  // -- Evidence card renderer (sidebar) --

  function renderSidebarEvidenceCard(card, idx) {
    var currentCard = (getCurrentBundle().evidenceCards || [])[idx] || card;
    var editing = isEditing('sidebar', 'evidenceCards', idx);

    if (editing) {
      return React.createElement(SidebarEvidenceCardEditor, {
        key: 'ec-edit-' + idx,
        card: currentCard,
        idx: idx,
        original: card,
        onSave: saveSidebarEdit,
        onCancel: cancelEdit
      });
    }

    return React.createElement('div', {
      key: 'ec-' + idx,
      className: 'article-evidence-card article-evidence-card--' + (currentCard.significance || 'supporting') + ' article-block--editable mb-md'
    },
      editBtn(function () { startSidebarEdit('evidenceCards', idx); }),
      React.createElement('div', { className: 'article-evidence-card__label' }, currentCard.headline || currentCard.tokenId || 'Card ' + (idx + 1)),
      currentCard.content && React.createElement('div', { className: 'article-evidence-card__content' }, currentCard.content),
      !currentCard.content && currentCard.summary && React.createElement('div', { className: 'article-evidence-card__content text-xs' }, currentCard.summary),
      React.createElement('div', { className: 'article-evidence-card__meta' },
        currentCard.owner && React.createElement('span', { className: 'article-evidence-card__owner' }, currentCard.owner),
        React.createElement('div', { className: 'tag-list' },
          currentCard.significance && React.createElement(Badge, {
            label: currentCard.significance,
            color: currentCard.significance === 'critical' ? 'var(--accent-red)' :
                   currentCard.significance === 'supporting' ? 'var(--accent-amber)' : 'var(--accent-cyan)'
          }),
          currentCard.layer && React.createElement(Badge, {
            label: currentCard.layer,
            color: currentCard.layer === 'exposed' ? 'var(--layer-exposed)' :
                   currentCard.layer === 'buried' ? 'var(--layer-buried)' : 'var(--accent-amber)'
          }),
          currentCard.placement && React.createElement(Badge, { label: currentCard.placement, color: 'var(--text-muted)' })
        )
      ),
      currentCard.tokenId && React.createElement('span', { className: 'text-xs text-muted d-block mt-sm' }, currentCard.tokenId)
    );
  }

  // -- Financial tracker renderer --

  function renderFinancialTracker(tracker) {
    if (!tracker) return null;
    var entries = tracker.entries || [];
    var currentTracker = getCurrentBundle().financialTracker || tracker;
    var currentEntries = currentTracker.entries || [];

    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'FINANCIAL TRACKER'),
      entries.length > 0 && React.createElement('table', { className: 'financial-table' },
        React.createElement('thead', null,
          React.createElement('tr', null,
            React.createElement('th', null, 'Description'),
            React.createElement('th', null, 'Amount'),
            React.createElement('th', null, 'Category')
          )
        ),
        React.createElement('tbody', null,
          currentEntries.map(function (entry, i) {
            var editing = isEditing('sidebar', 'financialEntry', i);
            if (editing) {
              return React.createElement(FinancialEntryEditor, {
                key: 'ft-edit-' + i,
                entry: entry,
                idx: i,
                onSave: saveFinancialEntryEdit,
                onCancel: cancelEdit
              });
            }
            return React.createElement('tr', {
              key: 'ft-' + i,
              className: 'financial-table__row article-block--editable'
            },
              React.createElement('td', null,
                entry.date && React.createElement('span', { className: 'text-xs text-muted' }, entry.date + ' '),
                entry.description || ''
              ),
              React.createElement('td', { className: 'financial-table__amount' }, entry.amount || ''),
              React.createElement('td', { className: 'text-xs text-muted' },
                entry.category || '',
                editBtn(function () { startSidebarEdit('financialEntry', i); })
              )
            );
          })
        ),
        currentTracker.totalExposed && React.createElement('tfoot', null,
          React.createElement('tr', { className: 'financial-table__total' },
            React.createElement('td', null, 'Total Buried'),
            React.createElement('td', { className: 'financial-table__amount' }, currentTracker.totalExposed),
            React.createElement('td', null)
          )
        )
      ),
      entries.length === 0 && React.createElement('p', { className: 'text-xs text-muted' }, 'No financial entries.')
    );
  }

  // -- Hero image --

  function renderHeroImage() {
    var currentHero = getCurrentBundle().heroImage || heroImage;
    if (!currentHero || !currentHero.filename) return null;
    var editing = isEditing('sidebar', 'heroImage', 0);

    if (editing) {
      return React.createElement(HeroImageEditor, {
        key: 'hero-edit',
        hero: currentHero,
        onSave: saveHeroImageEdit,
        onCancel: cancelEdit
      });
    }

    var heroSrc = photoUrl(currentHero.filename);
    return React.createElement('figure', { className: 'article-hero mb-md article-block--editable' },
      editBtn(function () { startSidebarEdit('heroImage', 0); }),
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
  }

  // -- Photos gallery --

  function renderPhotosGallery() {
    var currentPhotos = getCurrentBundle().photos || photos;
    if (!currentPhotos || currentPhotos.length === 0) return null;
    return React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'ARTICLE PHOTOS (' + currentPhotos.length + ')'),
      React.createElement('div', { className: 'article-photos-gallery' },
        currentPhotos.map(function (photo, i) {
          var editing = isEditing('sidebar', 'photos', i);
          if (editing) {
            return React.createElement(GalleryPhotoEditor, {
              key: 'gallery-edit-' + i,
              photo: photo,
              idx: i,
              onSave: saveSidebarEdit,
              onCancel: cancelEdit
            });
          }
          return React.createElement('figure', { key: 'gallery-' + i, className: 'article-photos-gallery__item article-block--editable' },
            editBtn(function () { startSidebarEdit('photos', i); }),
            photoUrl(photo.filename)
              ? React.createElement('img', {
                  src: photoUrl(photo.filename),
                  alt: photo.caption || photo.filename,
                  className: 'article-photos-gallery__img',
                  loading: 'lazy'
                })
              : React.createElement('div', { className: 'article-block__photo-placeholder' }, photo.filename || 'Photo'),
            photo.caption && React.createElement('figcaption', { className: 'text-xs text-secondary mt-xs' }, photo.caption),
            photo.characters && photo.characters.length > 0 && React.createElement('div', { className: 'tag-list mt-xs' },
              photo.characters.map(function (c, j) {
                return React.createElement(Badge, { key: 'gc-' + j, label: c, color: 'var(--accent-cyan)' });
              })
            ),
            photo.afterSection && React.createElement('span', { className: 'text-xs text-muted d-block' }, 'After: ' + photo.afterSection)
          );
        })
      )
    );
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

  // tokenId -> headline for the fact-check card group, so a flagged card is
  // identifiable by what it SAYS and not only by its id.
  var cardHeadlines = {};
  (getCurrentBundle().evidenceCards || []).forEach(function (card) {
    if (card && card.tokenId && card.headline) cardHeadlines[card.tokenId] = card.headline;
  });
  (getCurrentBundle().sections || []).forEach(function (section) {
    (section && section.content || []).forEach(function (block) {
      if (block && block.type === 'evidence-card' && block.tokenId && block.headline) {
        cardHeadlines[block.tokenId] = block.headline;
      }
    });
  });

  var currentHeadline = getCurrentBundle().headline || headline;
  var currentByline = getCurrentBundle().byline || byline;
  var currentSections = (getCurrentBundle().sections || sections);
  var currentPullQuotes = (getCurrentBundle().pullQuotes || pullQuotes);
  var currentEvidenceCards = (getCurrentBundle().evidenceCards || evidenceCards);

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff
    React.createElement(RevisionDiff, {
      previous: previousArticle,
      current: contentBundle,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: 0,
      maxHumanRevisions: 0
    }),

    // Evaluation bar
    React.createElement(EvalBar, { view: evaluation }),

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

    // Headline (editable)
    isEditing('headline')
      ? React.createElement(HeadlineEditor, {
          key: 'headline-edit',
          headline: currentHeadline,
          onSave: saveHeadlineEdit,
          onCancel: cancelEdit
        })
      : (currentHeadline.main || currentHeadline.kicker || currentHeadline.deck) && React.createElement('div', {
          className: 'outline-section article-block--editable'
        },
          editBtn(startHeadlineEdit),
          currentHeadline.kicker && React.createElement('p', { className: 'text-xs text-muted mb-sm article-headline__kicker' }, currentHeadline.kicker),
          currentHeadline.main && React.createElement('h3', { className: 'article-headline__main' }, currentHeadline.main),
          currentHeadline.deck && React.createElement('p', { className: 'text-sm text-secondary mt-sm article-headline__deck' }, currentHeadline.deck)
        ),

    // Byline (editable)
    isEditing('sidebar', 'byline', 0)
      ? React.createElement(BylineEditor, {
          key: 'byline-edit',
          byline: currentByline,
          onSave: saveBylineEdit,
          onCancel: cancelEdit
        })
      : (currentByline.author || currentByline.title) && React.createElement('div', {
          className: 'text-xs text-muted mb-md article-block--editable'
        },
          editBtn(function () { startSidebarEdit('byline', 0); }),
          [currentByline.author, currentByline.title, currentByline.location, currentByline.date].filter(Boolean).join(' \u2022 ')
        ),

    // Content sections with inline editing
    currentSections.map(function (section, i) {
      return React.createElement('div', {
        key: (section.id || 'section') + '-' + i,
        className: 'outline-section'
      },
        React.createElement('h4', { className: 'outline-section__title' },
          section.heading || section.id || 'Section ' + (i + 1)
        ),
        section.type && React.createElement(Badge, { label: section.type, color: 'var(--accent-cyan)' }),
        React.createElement('div', { className: 'outline-section__content mt-sm' },
          (section.content || []).map(function (block, j) {
            return renderBlock(block, i, j);
          })
        )
      );
    }),

    // Pull quotes (journalist theme only — detective reports don't use pull quotes)
    !isDetective && currentPullQuotes.length > 0 && React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'PULL QUOTES (' + currentPullQuotes.length + ')'),
      currentPullQuotes.map(function (pq, i) {
        return renderPullQuote(pq, i);
      })
    ),

    // Evidence cards (journalist theme only)
    !isDetective && currentEvidenceCards.length > 0 && React.createElement('div', { className: 'outline-section' },
      React.createElement('h4', { className: 'outline-section__title' }, 'EVIDENCE CARDS (' + currentEvidenceCards.length + ')'),
      currentEvidenceCards.map(function (card, i) {
        return renderSidebarEvidenceCard(card, i);
      })
    ),

    // Financial tracker (journalist theme only)
    !isDetective && renderFinancialTracker(getCurrentBundle().financialTracker || financialTracker),

    // Photos gallery
    renderPhotosGallery(),

    // HTML Preview toggle
    previewHtml && React.createElement('div', { className: 'mt-md' },
      React.createElement('button', {
        className: 'btn btn-secondary btn-sm',
        onClick: function () { setShowHtmlPreview(!showHtmlPreview); },
        'aria-label': showHtmlPreview ? 'Hide HTML preview' : 'Show HTML preview'
      }, showHtmlPreview ? 'Hide HTML Preview' : 'Show HTML Preview'),

      showHtmlPreview && React.createElement('div', { className: 'html-preview mt-md fade-in' },
        React.createElement('iframe', {
          className: 'html-preview__frame',
          // The string is used as-is apart from the <script> strip: the server
          // already injected `<base href="/">` so the relative sessionphotos/
          // URLs resolve instead of hitting the /console/* SPA catch-all.
          srcDoc: stripScripts(previewHtml),
          sandbox: 'allow-same-origin',
          title: 'Article HTML Preview'
        })
      )
    ),

    // Inline validation error (B6: shown when Approve is blocked)
    editError && React.createElement('p', { className: 'validation-error', role: 'alert' }, editError),

    // Action buttons
    React.createElement('div', { className: 'action-modes mt-md' },
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'view' ? ' action-modes__btn--active' : '') + ' btn btn-primary',
        onClick: handleApprove,
        // When the fact-check found something, shipping it has to READ like a
        // choice. Four of the last five articles were approved first-pass here
        // and then needed 20-41 manual fixes.
        'aria-label': factCheck.total > 0
          ? 'Approve the article despite ' + factCheck.total + ' unresolved fact-check item(s)'
          : (hasEdits ? 'Approve article with edits' : 'Approve article')
      }, factCheck.total > 0
        ? (hasEdits ? 'Approve with Edits anyway (' : 'Approve anyway (') + factCheck.total + ' unresolved)'
        : (hasEdits ? 'Approve with Edits' : 'Approve')),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'json' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('json'); },
        'aria-label': 'Open JSON editor'
      }, 'JSON Editor'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject article with feedback'
      }, 'Reject')
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
      jsonError && React.createElement('p', { className: 'validation-error' }, jsonError),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleJsonApprove,
        'aria-label': 'Save JSON and approve'
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
    ),

    // Expanded photo overlay
    renderExpandedPhoto()
  );
}

window.Console.checkpoints.Article = Article;
