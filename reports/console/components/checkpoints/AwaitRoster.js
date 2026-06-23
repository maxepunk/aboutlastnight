/**
 * AwaitRoster Checkpoint Component
 * Tag-style input for entering player roster names.
 * Displays generic photo analyses and whiteboard status if available.
 * Exports to window.Console.checkpoints.AwaitRoster
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;
const { validateRosterEntry, knownCharacterList } = window.Console.awaitRosterLogic;

function AwaitRoster({ data, onApprove }) {
  const rawAnalyses = data && data.genericPhotoAnalyses;
  const genericPhotoAnalyses = Array.isArray(rawAnalyses) ? rawAnalyses : (rawAnalyses && rawAnalyses.analyses) || [];
  const whiteboardPhotoPath = (data && data.whiteboardPhotoPath) || null;
  const canonicalCharacters = (data && data.canonicalCharacters) || {};
  const knownCharacters = knownCharacterList(canonicalCharacters);
  const hasCanon = knownCharacters.length > 0;

  const PRONOUN_OPTIONS = ['they/them', 'she/her', 'he/him'];

  // Each tag: { name, pronouns }. Roster stays string[]; pronouns travel separately.
  const [tags, setTags] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');

  function addTag(raw) {
    const name = raw.trim();
    if (!name) return;
    setTags(function (prev) {
      const exists = prev.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); });
      if (exists) return prev;
      return prev.concat([{ name: name, pronouns: 'they/them' }]);
    });
    setInputValue('');
  }

  function removeTag(index) {
    setTags(function (prev) { return prev.filter(function (_, i) { return i !== index; }); });
  }

  function setPronouns(index, pronouns) {
    setTags(function (prev) {
      return prev.map(function (t, i) { return i === index ? { name: t.name, pronouns: pronouns } : t; });
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  function handleChange(e) {
    const val = e.target.value;
    if (val.includes(',')) {
      const parts = val.split(',');
      parts.forEach(function (part, i) { if (i < parts.length - 1) { addTag(part); } });
      setInputValue(parts[parts.length - 1]);
    } else {
      setInputValue(val);
    }
  }

  function buildPayload(allTags) {
    const roster = allTags.map(function (t) { return t.name; });
    const rosterPronouns = {};
    allTags.forEach(function (t) { rosterPronouns[t.name] = t.pronouns; });
    return { roster: roster, rosterPronouns: rosterPronouns };
  }

  function handleSubmit() {
    const finalTags = inputValue.trim()
      ? tags.concat([{ name: inputValue.trim(), pronouns: 'they/them' }])
      : tags;
    onApprove(buildPayload(finalTags));
  }

  const previewAnalyses = genericPhotoAnalyses.slice(0, 3);

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Why Roster Is Needed'),
      React.createElement('p', { className: 'text-sm text-secondary' },
        'The roster is the set of CHARACTERS who were played this session \u2014 their in-game identities, not the real people. It sets each character\u2019s pronouns (the universe is gender-neutral, so the roster is the pronoun authority). This drives article references, enables character ID mapping, and prevents pronoun errors.'
      )
    ),

    previewAnalyses.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' },
        'Photo Analyses (' + genericPhotoAnalyses.length + ' total)'
      ),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        previewAnalyses.map(function (analysis, i) {
          const content = (analysis && analysis.visualContent) || (typeof analysis === 'string' ? analysis : '');
          return React.createElement('div', { key: 'analysis-' + i, className: 'evidence-item' },
            React.createElement('div', { className: 'evidence-item__header' },
              React.createElement('span', { className: 'evidence-item__number' }, '#' + (i + 1)),
              React.createElement('span', { className: 'text-sm text-secondary' },
                truncate(typeof content === 'string' ? content : String(content), 120)
              )
            )
          );
        })
      ),
      genericPhotoAnalyses.length > 3 && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
        '+ ' + (genericPhotoAnalyses.length - 3) + ' more analyses'
      )
    ),

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Whiteboard Status'),
      React.createElement('div', { className: 'flex gap-sm items-center' },
        whiteboardPhotoPath
          ? React.createElement(Badge, { label: 'Detected', color: 'var(--accent-green)' })
          : React.createElement(Badge, { label: 'Not Found', color: 'var(--accent-red)' }),
        whiteboardPhotoPath && React.createElement('span', { className: 'text-xs text-muted' }, whiteboardPhotoPath)
      )
    ),

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Enter Character Names'),
      React.createElement('p', { className: 'text-xs text-muted mb-sm' },
        'Enter the CHARACTER names as they appear in the game (not the real players). Type a name and press Enter or comma to add. Set pronouns per character (defaults to they/them). Click \u2715 to remove.'
      ),
      hasCanon && React.createElement('div', { className: 'mb-sm' },
        React.createElement('p', { className: 'text-xs text-muted mb-sm' }, 'Known characters \u2014 click to add:'),
        React.createElement('div', { className: 'tag-list' },
          knownCharacters.map(function (c) {
            const alreadyAdded = tags.some(function (t) { return t.name.toLowerCase() === c.first.toLowerCase(); });
            return React.createElement('button', {
              key: c.first,
              type: 'button',
              className: 'char-mention-tag' + (alreadyAdded ? ' is-selected' : ''),
              onClick: function () { addTag(c.first); },
              disabled: alreadyAdded,
              title: c.full,
              'aria-label': 'Add character ' + c.first + ' (' + c.full + ')'
            }, c.first);
          })
        )
      ),
      React.createElement('div', { className: 'tag-input' },
        React.createElement('input', {
          className: 'tag-input__field',
          type: 'text',
          value: inputValue,
          onChange: handleChange,
          onKeyDown: handleKeyDown,
          placeholder: tags.length === 0 ? 'e.g., Sarah, Vic, Remi' : 'Add another name...'
        })
      ),
      tags.length > 0 && React.createElement('div', { className: 'flex flex-col gap-sm mt-sm' },
        tags.map(function (tag, i) {
          const isUnknown = hasCanon && !validateRosterEntry(tag.name, canonicalCharacters).matched;
          return React.createElement('div', { key: tag.name + '-' + i, className: 'flex gap-sm items-center' },
            React.createElement('span', { className: 'tag-chip' },
              React.createElement('span', null, tag.name),
              React.createElement('button', {
                className: 'tag-chip__remove',
                onClick: function () { removeTag(i); },
                'aria-label': 'Remove ' + tag.name
              }, '\u2715')
            ),
            React.createElement('select', {
              className: 'input',
              value: tag.pronouns,
              onChange: function (e) { setPronouns(i, e.target.value); },
              'aria-label': 'Pronouns for ' + tag.name
            },
              PRONOUN_OPTIONS.map(function (p) {
                return React.createElement('option', { key: p, value: p }, p);
              })
            ),
            isUnknown && React.createElement('span', {
              className: 'text-xs',
              style: { color: 'var(--accent-amber)' },
              title: 'This name does not match any known character. Pronouns may not reach the article unless it matches a character identity.'
            }, '\u26a0 not a known character')
          );
        })
      )
    ),

    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        disabled: tags.length === 0 && !inputValue.trim(),
        onClick: handleSubmit
      }, 'Submit Roster (' + (tags.length + (inputValue.trim() ? 1 : 0)) + ')')
    )
  );
}

window.Console.checkpoints.AwaitRoster = AwaitRoster;
