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

const { Badge, CollapsibleSection, safeStringify, editBtn, renderTextEditForm, renderListEditForm } = window.Console.utils;
const { RevisionDiff } = window.Console;

// ═══════════════════════════════════════════════════════
// Editor components at module scope
// ═══════════════════════════════════════════════════════

function LedeEditor({ lede, onSave, onCancel }) {
  const [hook, setHook] = React.useState(lede.hook || '');
  const [keyTension, setKeyTension] = React.useState(lede.keyTension || '');
  const [evidence, setEvidence] = React.useState(Array.isArray(lede.selectedEvidence) ? lede.selectedEvidence.join(', ') : (lede.selectedEvidence || ''));

  function handleSave() {
    onSave({
      hook: hook,
      keyTension: keyTension,
      selectedEvidence: evidence.split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    });
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Hook'),
    React.createElement('textarea', { className: 'input', value: hook, onChange: function (e) { setHook(e.target.value); }, rows: 2, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Key Tension'),
    React.createElement('textarea', { className: 'input', value: keyTension, onChange: function (e) { setKeyTension(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Selected Evidence (comma-separated IDs)'),
    React.createElement('input', { className: 'input', value: evidence, onChange: function (e) { setEvidence(e.target.value); } }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

function ArcOutlineEditor({ arc, onSave, onCancel }) {
  const [name, setName] = React.useState(arc.name || '');
  const [paragraphCount, setParagraphCount] = React.useState(arc.paragraphCount != null ? String(arc.paragraphCount) : '');
  const [keyPoints, setKeyPoints] = React.useState(Array.isArray(arc.keyPoints) ? arc.keyPoints.slice() : (arc.keyPoints ? [arc.keyPoints] : []));
  const [photoPlacement, setPhotoPlacement] = React.useState(typeof arc.photoPlacement === 'string' ? arc.photoPlacement : (arc.photoPlacement ? safeStringify(arc.photoPlacement) : ''));

  function updateKeyPoint(idx, val) { const c = keyPoints.slice(); c[idx] = val; setKeyPoints(c); }
  function removeKeyPoint(idx) { setKeyPoints(keyPoints.filter(function (_, i) { return i !== idx; })); }
  function addKeyPoint() { setKeyPoints(keyPoints.concat([''])); }

  function handleSave() {
    const updated = Object.assign({}, arc, {
      name: name,
      keyPoints: keyPoints.filter(function (s) { return s && s.trim(); }),
      photoPlacement: photoPlacement
    });
    if (paragraphCount !== '') {
      const n = parseInt(paragraphCount, 10);
      if (!isNaN(n)) updated.paragraphCount = n;
    }
    onSave(updated);
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Name'),
    React.createElement('input', { className: 'input', value: name, onChange: function (e) { setName(e.target.value); }, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Paragraph Count'),
    React.createElement('input', { className: 'input', type: 'number', value: paragraphCount, onChange: function (e) { setParagraphCount(e.target.value); } }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Key Points'),
    keyPoints.map(function (kp, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: kp, onChange: function (e) { updateKeyPoint(idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeKeyPoint(idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: addKeyPoint }, '+ Add point'),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Photo Placement'),
    React.createElement('input', { className: 'input', value: photoPlacement, onChange: function (e) { setPhotoPlacement(e.target.value); } }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );

  // Note: evidenceCards intentionally not editable — IDs come from evidence bundle.
  // If a user wants to change which evidence an arc cites, they should reject and re-run.
}

function NamedSectionEditor({ section, onSave, onCancel }) {
  const [focus, setFocus] = React.useState(typeof section.arcConnections === 'string' ? section.arcConnections : (typeof section.focus === 'string' ? section.focus : ''));
  const [shellAccounts, setShellAccounts] = React.useState(Array.isArray(section.shellAccounts) ? section.shellAccounts.slice() : (section.shellAccounts ? [section.shellAccounts] : []));
  const [characterHighlights, setCharacterHighlights] = React.useState(typeof section.characterHighlights === 'string' ? section.characterHighlights : '');
  const [buriedItems, setBuriedItems] = React.useState(Array.isArray(section.buriedItems) ? section.buriedItems.slice() : (section.buriedItems ? [section.buriedItems] : []));

  function updateList(setter, list, idx, val) { const c = list.slice(); c[idx] = val; setter(c); }
  function removeFromList(setter, list, idx) { setter(list.filter(function (_, i) { return i !== idx; })); }
  function addToList(setter, list) { setter(list.concat([''])); }

  function handleSave() {
    const updated = Object.assign({}, section, {
      // Preserve original key (focus vs arcConnections) — write to whichever was present
      [section.arcConnections != null ? 'arcConnections' : 'focus']: focus,
      shellAccounts: shellAccounts.filter(function (s) { return s && s.trim(); }),
      characterHighlights: characterHighlights,
      buriedItems: buriedItems.filter(function (s) { return s && s.trim(); })
    });
    onSave(updated);
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, 'Focus'),
    React.createElement('textarea', { className: 'input', value: focus, onChange: function (e) { setFocus(e.target.value); }, rows: 3, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Shell Accounts'),
    shellAccounts.map(function (s, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: s, onChange: function (e) { updateList(setShellAccounts, shellAccounts, idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeFromList(setShellAccounts, shellAccounts, idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: function () { addToList(setShellAccounts, shellAccounts); } }, '+ Add'),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Character Highlights'),
    React.createElement('textarea', { className: 'input', value: characterHighlights, onChange: function (e) { setCharacterHighlights(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Buried Items'),
    buriedItems.map(function (s, idx) {
      return React.createElement('div', { key: idx, className: 'flex gap-sm mb-sm' },
        React.createElement('input', { className: 'input flex-1', value: s, onChange: function (e) { updateList(setBuriedItems, buriedItems, idx, e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: function () { removeFromList(setBuriedItems, buriedItems, idx); } }, '×')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: function () { addToList(setBuriedItems, buriedItems); } }, '+ Add'),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

function ClosingEditor({ closing, onSave, onCancel }) {
  const resolutionsKey = closing.arcResolutions != null ? 'arcResolutions' : 'theme';
  const [resolutions, setResolutions] = React.useState(typeof closing[resolutionsKey] === 'string' ? closing[resolutionsKey] : '');
  const [systemicAngle, setSystemicAngle] = React.useState(typeof closing.systemicAngle === 'string' ? closing.systemicAngle : '');
  const [finalLine, setFinalLine] = React.useState(typeof closing.finalLine === 'string' ? closing.finalLine : '');

  function handleSave() {
    onSave(Object.assign({}, closing, {
      [resolutionsKey]: resolutions,
      systemicAngle: systemicAngle,
      finalLine: finalLine
    }));
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    React.createElement('label', { className: 'text-xs text-muted' }, resolutionsKey === 'arcResolutions' ? 'Arc Resolutions' : 'Theme'),
    React.createElement('textarea', { className: 'input', value: resolutions, onChange: function (e) { setResolutions(e.target.value); }, rows: 3, autoFocus: true }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Systemic Angle'),
    React.createElement('textarea', { className: 'input', value: systemicAngle, onChange: function (e) { setSystemicAngle(e.target.value); }, rows: 2 }),
    React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Final Line'),
    React.createElement('textarea', { className: 'input', value: finalLine, onChange: function (e) { setFinalLine(e.target.value); }, rows: 2 }),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: handleSave }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

function PullQuotesEditor({ pullQuotes, onSave, onCancel }) {
  const [quotes, setQuotes] = React.useState(JSON.parse(safeStringify(pullQuotes)));

  function update(idx, field, val) {
    const c = JSON.parse(safeStringify(quotes));
    c[idx][field] = val;
    setQuotes(c);
  }

  function remove(idx) {
    setQuotes(quotes.filter(function (_, i) { return i !== idx; }));
  }

  function add() {
    setQuotes(quotes.concat([{ text: '', attribution: '', placement: '' }]));
  }

  return React.createElement('div', { className: 'article-block__edit-form' },
    quotes.map(function (q, idx) {
      return React.createElement('div', { key: idx, className: 'mb-md' },
        React.createElement('label', { className: 'text-xs text-muted' }, 'Quote ' + (idx + 1)),
        React.createElement('textarea', { className: 'input', value: q.text || '', onChange: function (e) { update(idx, 'text', e.target.value); }, rows: 2 }),
        React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Attribution'),
        React.createElement('input', { className: 'input', value: q.attribution || '', onChange: function (e) { update(idx, 'attribution', e.target.value); } }),
        React.createElement('label', { className: 'text-xs text-muted mt-sm' }, 'Placement'),
        React.createElement('input', { className: 'input', value: q.placement || '', onChange: function (e) { update(idx, 'placement', e.target.value); } }),
        React.createElement('button', { className: 'btn btn-sm btn-ghost mt-sm', onClick: function () { remove(idx); } }, 'Remove')
      );
    }),
    React.createElement('button', { className: 'btn btn-sm btn-ghost mb-sm', onClick: add }, '+ Add Quote'),
    React.createElement('div', { className: 'edit-form__actions flex gap-sm mt-sm' },
      React.createElement('button', { className: 'btn btn-sm btn-primary', onClick: function () { onSave(quotes); } }, 'Save'),
      React.createElement('button', { className: 'btn btn-sm btn-ghost', onClick: onCancel }, 'Cancel')
    )
  );
}

function Outline({ data, onApprove, onReject, dispatch, revisionCache, theme, pendingEdits }) {
  const outline = (data && data.outline) || {};
  const evaluationHistory = (data && data.evaluationHistory) || {};
  const previousOutline = (revisionCache && revisionCache.outline) || null;
  const previousFeedback = (data && data.previousFeedback) || null;
  const revisionCount = (data && data.revisionCount) || 0;
  const maxRevisions = (data && data.maxRevisions) || 3;

  // Detect theme from outline data if not passed via props
  const isDetective = theme === 'detective' || (!theme && outline.executiveSummary != null);

  // Edit state — mirrors Article.js
  const [editedOutline, setEditedOutline] = React.useState(null);
  const [editingBlock, setEditingBlock] = React.useState(null);
  const [hasEdits, setHasEdits] = React.useState(false);
  const [mode, setMode] = React.useState('view'); // 'view' | 'json' | 'reject'
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');
  const [feedbackText, setFeedbackText] = React.useState('');

  // Reset state when data changes
  const dataKey = safeStringify(outline).slice(0, 100);
  React.useEffect(function () {
    setEditedOutline(null);
    setEditingBlock(null);
    setHasEdits(false);
    setMode('view');
    setJsonText('');
    setJsonError('');
    setFeedbackText('');
  }, [dataKey]);

  // Restore pending edits from cache
  React.useEffect(function () {
    if (pendingEdits && !editedOutline) {
      setEditedOutline(pendingEdits);
      setHasEdits(true);
    }
  }, [pendingEdits]);

  function getCurrentOutline() { return editedOutline || outline; }

  function ensureEditedOutline() {
    if (editedOutline) return editedOutline;
    const clone = JSON.parse(safeStringify(outline));
    setEditedOutline(clone);
    return clone;
  }

  function isEditing(type, key) {
    if (!editingBlock) return false;
    return editingBlock.type === type && editingBlock.key === key;
  }

  function cancelEdit() { setEditingBlock(null); }

  function saveSectionEdit(sectionKey, updatedSection) {
    const next = ensureEditedOutline();
    const clone = JSON.parse(safeStringify(next));
    clone[sectionKey] = updatedSection;
    setEditedOutline(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveTheStoryArc(arcIdx, updatedArc) {
    const next = ensureEditedOutline();
    const clone = JSON.parse(safeStringify(next));
    if (!clone.theStory) clone.theStory = { arcs: [], arcInterweaving: '' };
    if (!Array.isArray(clone.theStory.arcs)) clone.theStory.arcs = [];
    clone.theStory.arcs[arcIdx] = updatedArc;
    setEditedOutline(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function saveInterweaving(updatedText) {
    const next = ensureEditedOutline();
    const clone = JSON.parse(safeStringify(next));
    if (!clone.theStory) clone.theStory = { arcs: [], arcInterweaving: '' };
    clone.theStory.arcInterweaving = updatedText;
    setEditedOutline(clone);
    setHasEdits(true);
    setEditingBlock(null);
  }

  function handleModeChange(newMode) {
    if (newMode === mode) {
      setMode('view');
      return;
    }
    setMode(newMode);
    if (newMode === 'json') {
      setJsonText(safeStringify(getCurrentOutline(), 2));
      setJsonError('');
    }
    if (newMode === 'reject') {
      setFeedbackText('');
    }
  }

  function handleApprove() {
    if (hasEdits && editedOutline) {
      if (dispatch) dispatch({ type: 'SAVE_PENDING_EDITS', checkpoint: 'outline', edits: editedOutline });
      onApprove({ outline: true, outlineEdits: editedOutline });
    } else {
      onApprove({ outline: true });
    }
  }

  function handleJsonApprove() {
    try {
      const parsed = JSON.parse(jsonText);
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
    const editing = isEditing('section', 'lede');

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
        React.createElement(LedeEditor, { lede: lede, onSave: function (updated) { saveSectionEdit('lede', updated); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: 'outline-section' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'LEDE'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'lede' }); })
      ),
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
          if (isEditing('theStoryArc', i)) {
            return React.createElement('div', { key: i, className: 'outline-section__arc outline-section__arc--editing mb-sm' },
              React.createElement(ArcOutlineEditor, {
                arc: arc,
                onSave: function (updated) { saveTheStoryArc(i, updated); },
                onCancel: cancelEdit
              })
            );
          }
          return React.createElement('div', { key: (arc.name || 'arc') + '-' + i, className: 'outline-section__arc mb-sm' },
            React.createElement('div', { className: 'flex items-center gap-sm' },
              React.createElement('p', { className: 'text-sm flex-1' },
                React.createElement('strong', null, arc.name || 'Arc ' + (i + 1)),
                arc.paragraphCount != null && React.createElement('span', { className: 'text-xs text-muted' }, ' (' + arc.paragraphCount + ' paragraphs)')
              ),
              editBtn(function () { setEditingBlock({ type: 'theStoryArc', key: i }); })
            ),
            arc.keyPoints && React.createElement('ul', { className: 'checkpoint-section__list text-xs text-secondary' },
              (Array.isArray(arc.keyPoints) ? arc.keyPoints : [arc.keyPoints]).map(function (point, j) {
                return React.createElement('li', { key: 'kp-' + j }, typeof point === 'string' ? point : safeStringify(point));
              })
            ),
            arc.evidenceCards && React.createElement('div', { className: 'tag-list mt-sm' },
              (Array.isArray(arc.evidenceCards) ? arc.evidenceCards : [arc.evidenceCards]).map(function (card, j) {
                return React.createElement(Badge, { key: 'ec-' + j, label: typeof card === 'string' ? card : (card.id || card.title || 'Card ' + (j + 1)), color: 'var(--accent-amber)' });
              })
            ),
            arc.photoPlacement && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
              'Photo: ' + (typeof arc.photoPlacement === 'string' ? arc.photoPlacement : safeStringify(arc.photoPlacement))
            )
          );
        }),
        // Arc interweaving — edit affordance
        isEditing('theStoryInterweaving', 'interweaving')
          ? renderTextEditForm({
              value: typeof theStory.arcInterweaving === 'string' ? theStory.arcInterweaving : safeStringify(theStory.arcInterweaving || ''),
              multiline: true,
              rows: 3,
              onSave: function (val) { saveInterweaving(val); },
              onCancel: cancelEdit
            })
          : (theStory.arcInterweaving && React.createElement('div', { className: 'flex items-center gap-sm mt-sm' },
              React.createElement('p', { className: 'text-xs text-muted flex-1' },
                React.createElement('strong', null, 'Arc Interweaving: '),
                typeof theStory.arcInterweaving === 'string' ? theStory.arcInterweaving : safeStringify(theStory.arcInterweaving)
              ),
              editBtn(function () { setEditingBlock({ type: 'theStoryInterweaving', key: 'interweaving' }); })
            ))
      )
    );
  }

  function renderNamedSection(title, section, sectionKey) {
    if (!section) return null;
    const editing = isEditing('namedSection', sectionKey);
    const focus = section.arcConnections || section.focus || null;

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, title),
        React.createElement(NamedSectionEditor, {
          section: section,
          onSave: function (updated) { saveSectionEdit(sectionKey, updated); },
          onCancel: cancelEdit
        })
      );
    }

    return React.createElement('div', { className: 'outline-section' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, title),
        editBtn(function () { setEditingBlock({ type: 'namedSection', key: sectionKey }); })
      ),
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
    const editing = isEditing('section', 'closing');
    const resolutions = closing.arcResolutions || closing.theme || null;

    if (editing) {
      return React.createElement('div', { className: 'outline-section outline-section--editing' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        React.createElement(ClosingEditor, { closing: closing, onSave: function (u) { saveSectionEdit('closing', u); }, onCancel: cancelEdit })
      );
    }

    return React.createElement('div', { className: 'outline-section' },
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'CLOSING'),
        editBtn(function () { setEditingBlock({ type: 'section', key: 'closing' }); })
      ),
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
      React.createElement('div', { className: 'outline-section__header flex items-center gap-sm' },
        React.createElement('h4', { className: 'outline-section__title' }, 'PULL QUOTES'),
        editBtn(function () { setEditingBlock({ type: 'pullQuotesAll', key: 'all' }); })
      ),
      React.createElement('div', { className: 'outline-section__content' },
        isEditing('pullQuotesAll', 'all')
          ? React.createElement(PullQuotesEditor, { pullQuotes: pullQuotes, onSave: function (u) { saveSectionEdit('pullQuotes', u); }, onCancel: cancelEdit })
          : pullQuotes.map(function (pq, i) {
              return React.createElement('div', { key: 'pq-' + i, className: 'pull-quote' },
                React.createElement('p', { className: 'pull-quote__text' },
                  '"' + (pq.text || '') + '"'
                ),
                (pq.attribution || pq.placement) && React.createElement('div', { className: 'pull-quote__attribution' },
                  pq.attribution && React.createElement('span', null, '— ' + pq.attribution),
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
    const current = getCurrentOutline();
    if (isDetective) {
      return [
        renderExecutiveSummary(current.executiveSummary),
        renderEvidenceLocker(current.evidenceLocker),
        renderMemoryAnalysis(current.memoryAnalysis),
        renderSuspectNetwork(current.suspectNetwork),
        renderOutstandingQuestions(current.outstandingQuestions),
        renderFinalAssessment(current.finalAssessment)
      ];
    }
    // Journalist (default)
    return [
      renderLede(current.lede),
      renderTheStory(current.theStory),
      renderNamedSection('FOLLOW THE MONEY', current.followTheMoney, 'followTheMoney'),
      renderNamedSection('THE PLAYERS', current.thePlayers, 'thePlayers'),
      renderNamedSection('WHAT\'S MISSING', current.whatsMissing, 'whatsMissing'),
      renderClosing(current.closing),
      renderPullQuotes(current.pullQuotes)
    ];
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Revision diff (if this is a revision)
    React.createElement(RevisionDiff, {
      previous: previousOutline,
      current: outline,
      revisionCount: revisionCount,
      maxRevisions: maxRevisions,
      previousFeedback: previousFeedback,
      humanRevisionCount: 0,
      maxHumanRevisions: 0
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
        className: 'action-modes__btn' + (mode === 'json' ? ' action-modes__btn--active' : '') + ' btn btn-secondary',
        onClick: function () { handleModeChange('json'); },
        'aria-label': 'Edit outline before approving'
      }, 'Edit & Approve'),
      React.createElement('button', {
        className: 'action-modes__btn' + (mode === 'reject' ? ' action-modes__btn--active' : '') + ' btn btn-danger',
        onClick: function () { handleModeChange('reject'); },
        'aria-label': 'Reject outline with feedback'
      }, 'Reject')
    ),

    // JSON edit mode
    mode === 'json' && React.createElement('div', { className: 'flex flex-col gap-sm mt-md fade-in' },
      React.createElement('label', { className: 'form-group__label' }, 'Edit Outline JSON'),
      React.createElement('textarea', {
        className: 'input input-mono edit-area',
        value: jsonText,
        onChange: function (e) { setJsonText(e.target.value); setJsonError(''); },
        rows: 20,
        'aria-label': 'Edit outline JSON'
      }),
      jsonError && React.createElement('p', { className: 'validation-error' }, jsonError),
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleJsonApprove,
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
