/**
 * AwaitRoster Checkpoint Component
 * Tag-style input for entering player roster names.
 * Displays generic photo analyses and whiteboard status if available.
 * Exports to window.Console.checkpoints.AwaitRoster
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;

function AwaitRoster({ data, onApprove }) {
  const genericPhotoAnalyses = (data && data.genericPhotoAnalyses) || [];
  const whiteboardPhotoPath = (data && data.whiteboardPhotoPath) || null;

  const [tags, setTags] = React.useState([]);
  const [inputValue, setInputValue] = React.useState('');

  function addTag(raw) {
    const name = raw.trim();
    if (!name) return;
    setTags(function (prev) {
      // Prevent duplicates (case-insensitive) using prev, not stale closure
      const exists = prev.some(function (t) {
        return t.toLowerCase() === name.toLowerCase();
      });
      if (exists) return prev;
      return prev.concat([name]);
    });
    setInputValue('');
  }

  function removeTag(index) {
    setTags(function (prev) {
      return prev.filter(function (_, i) { return i !== index; });
    });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    }
    // Backspace on empty input removes last tag
    if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  function handleChange(e) {
    const val = e.target.value;
    // If user types a comma, treat it as a delimiter
    if (val.includes(',')) {
      const parts = val.split(',');
      parts.forEach(function (part, i) {
        if (i < parts.length - 1) {
          addTag(part);
        }
      });
      setInputValue(parts[parts.length - 1]);
    } else {
      setInputValue(val);
    }
  }

  function handleSubmit() {
    // Add any remaining text as a tag before submitting
    if (inputValue.trim()) {
      const finalTags = tags.concat([inputValue.trim()]);
      onApprove({ roster: finalTags });
    } else {
      onApprove({ roster: tags });
    }
  }

  const previewAnalyses = genericPhotoAnalyses.slice(0, 3);

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Explanation
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Why Roster Is Needed'),
      React.createElement('p', { className: 'text-sm text-secondary' },
        'The roster maps real player names to character identities. This enables the article to reference players by name and track individual narrative arcs through the investigation.'
      )
    ),

    // Generic photo analyses (first 3)
    previewAnalyses.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' },
        'Photo Analyses (' + genericPhotoAnalyses.length + ' total)'
      ),
      React.createElement('div', { className: 'flex flex-col gap-sm' },
        previewAnalyses.map(function (analysis, i) {
          const content = (analysis && analysis.visualContent) || (typeof analysis === 'string' ? analysis : '');
          return React.createElement('div', {
            key: 'analysis-' + i,
            className: 'evidence-item'
          },
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

    // Whiteboard status
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Whiteboard Status'),
      React.createElement('div', { className: 'flex gap-sm items-center' },
        whiteboardPhotoPath
          ? React.createElement(Badge, { label: 'Detected', color: 'var(--accent-green)' })
          : React.createElement(Badge, { label: 'Not Found', color: 'var(--accent-red)' }),
        whiteboardPhotoPath && React.createElement('span', { className: 'text-xs text-muted' }, whiteboardPhotoPath)
      )
    ),

    // Tag input area
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Enter Player Names'),
      React.createElement('p', { className: 'text-xs text-muted mb-sm' },
        'Type a name and press Enter or comma to add. Click \u2715 to remove.'
      ),
      React.createElement('div', { className: 'tag-input' },
        // Existing tags
        tags.map(function (tag, i) {
          return React.createElement('span', { key: tag + '-' + i, className: 'tag-chip' },
            React.createElement('span', null, tag),
            React.createElement('button', {
              className: 'tag-chip__remove',
              onClick: function () { removeTag(i); },
              'aria-label': 'Remove ' + tag
            }, '\u2715')
          );
        }),
        // Input field
        React.createElement('input', {
          className: 'tag-input__field',
          type: 'text',
          value: inputValue,
          onChange: handleChange,
          onKeyDown: handleKeyDown,
          placeholder: tags.length === 0 ? 'e.g., Alice, Bob, Charlie' : 'Add another name...'
        })
      )
    ),

    // Submit button
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
