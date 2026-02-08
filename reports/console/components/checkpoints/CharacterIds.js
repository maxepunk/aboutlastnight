/**
 * CharacterIds Checkpoint Component
 * Photo gallery with character descriptions, plus input modes
 * (skip, natural text, JSON) for character-to-photo mapping.
 * Exports to window.Console.checkpoints.CharacterIds
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;

function CharacterIds({ data, onApprove }) {
  const sessionPhotos = (data && data.sessionPhotos) || [];
  const photoAnalyses = (data && data.photoAnalyses && data.photoAnalyses.analyses) || [];
  const roster = (data && data.sessionConfig && data.sessionConfig.roster) || [];

  const [inputMode, setInputMode] = React.useState('skip');
  const [naturalText, setNaturalText] = React.useState('');
  const [jsonText, setJsonText] = React.useState('');
  const [jsonError, setJsonError] = React.useState('');

  function handleSubmit() {
    if (inputMode === 'skip') {
      onApprove({ characterIds: {} });
    } else if (inputMode === 'natural') {
      onApprove({ characterIdsRaw: naturalText });
    } else if (inputMode === 'json') {
      try {
        const parsed = JSON.parse(jsonText);
        setJsonError('');
        onApprove({ characterIds: parsed });
      } catch (err) {
        setJsonError('Invalid JSON: ' + err.message);
      }
    }
  }

  function getScoreClass(score) {
    if (score > 7) return 'photo-card__score--high';
    if (score >= 4) return 'photo-card__score--medium';
    return 'photo-card__score--low';
  }

  function getRoleColor(role) {
    const upper = (role || '').toUpperCase();
    if (upper === 'CENTRAL') return 'var(--accent-amber)';
    if (upper === 'SUPPORTING') return 'var(--accent-cyan)';
    return 'var(--text-muted)';
  }

  const isSubmitDisabled = (inputMode === 'natural' && !naturalText.trim()) ||
    (inputMode === 'json' && !!jsonError);

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Roster sidebar
    roster.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Session Roster'),
      React.createElement('div', { className: 'tag-list' },
        roster.map(function (name) {
          return React.createElement(Badge, { key: name, label: name, color: 'var(--accent-cyan)' });
        })
      )
    ),

    // Photo gallery
    photoAnalyses.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' },
        'Photo Analyses (' + photoAnalyses.length + ')'
      ),
      React.createElement('div', { className: 'photo-gallery' },
        photoAnalyses.map(function (photo, i) {
          const filename = sessionPhotos[i] || 'Photo ' + (i + 1);
          // Extract just the filename from path
          const displayName = filename.split('/').pop().split('\\').pop();
          const score = photo.relevanceScore || 0;
          const visual = photo.visualContent || '';
          const charDescs = photo.characterDescriptions || [];
          const caption = photo.suggestedCaption || '';

          return React.createElement('div', { key: 'photo-' + i, className: 'photo-card' },
            // Header: filename + relevance
            React.createElement('div', { className: 'photo-card__header' },
              React.createElement('span', { className: 'text-sm' }, displayName),
              React.createElement('span', { className: 'photo-card__score ' + getScoreClass(score) },
                score + '/10'
              )
            ),

            // Visual content
            visual && React.createElement('p', { className: 'text-sm text-secondary mb-sm' },
              truncate(visual, 120)
            ),

            // Character descriptions
            charDescs.length > 0 && React.createElement('div', { className: 'flex flex-col gap-sm' },
              charDescs.map(function (desc, j) {
                return React.createElement('div', {
                  key: 'char-' + i + '-' + j,
                  className: 'character-desc'
                },
                  React.createElement('div', { className: 'character-desc__role' },
                    React.createElement(Badge, { label: desc.role || 'UNKNOWN', color: getRoleColor(desc.role) })
                  ),
                  desc.description && React.createElement('span', { className: 'text-xs text-secondary' },
                    truncate(desc.description, 100)
                  ),
                  desc.physicalMarkers && React.createElement('span', { className: 'text-xs text-muted' },
                    'Markers: ' + truncate(desc.physicalMarkers, 80)
                  )
                );
              })
            ),

            // Caption
            caption && React.createElement('p', { className: 'text-xs text-muted mt-sm' },
              'Caption: ' + truncate(caption, 80)
            )
          );
        })
      )
    ),

    // Input mode selection
    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Character Mapping'),
      React.createElement('p', { className: 'text-xs text-muted mb-sm' },
        'Map players to photos, or skip if no mapping is needed.'
      ),
      React.createElement('div', { className: 'input-mode' },
        // Skip option
        React.createElement('label', {
          className: 'input-mode__option' + (inputMode === 'skip' ? ' input-mode__option--active' : '')
        },
          React.createElement('input', {
            type: 'radio',
            name: 'charIdMode',
            value: 'skip',
            checked: inputMode === 'skip',
            onChange: function () { setInputMode('skip'); }
          }),
          React.createElement('span', null, 'Skip'),
          React.createElement('span', { className: 'text-xs text-muted' }, 'No character mapping needed')
        ),
        // Natural text option
        React.createElement('label', {
          className: 'input-mode__option' + (inputMode === 'natural' ? ' input-mode__option--active' : '')
        },
          React.createElement('input', {
            type: 'radio',
            name: 'charIdMode',
            value: 'natural',
            checked: inputMode === 'natural',
            onChange: function () { setInputMode('natural'); }
          }),
          React.createElement('span', null, 'Natural Text'),
          React.createElement('span', { className: 'text-xs text-muted' }, 'Describe mappings in plain English')
        ),
        // JSON option
        React.createElement('label', {
          className: 'input-mode__option' + (inputMode === 'json' ? ' input-mode__option--active' : '')
        },
          React.createElement('input', {
            type: 'radio',
            name: 'charIdMode',
            value: 'json',
            checked: inputMode === 'json',
            onChange: function () { setInputMode('json'); setJsonError(''); }
          }),
          React.createElement('span', null, 'JSON'),
          React.createElement('span', { className: 'text-xs text-muted' }, 'Structured key-value mappings')
        )
      ),

      // Input areas based on mode
      inputMode === 'natural' && React.createElement('div', { className: 'form-group mt-md' },
        React.createElement('label', { className: 'form-group__label' }, 'Character Descriptions'),
        React.createElement('textarea', {
          className: 'input',
          rows: 5,
          value: naturalText,
          onChange: function (e) { setNaturalText(e.target.value); },
          placeholder: 'e.g., Alice is the woman in the red dress in photo 3, Bob is the tall man with glasses in photo 1...'
        })
      ),

      inputMode === 'json' && React.createElement('div', { className: 'form-group mt-md' },
        React.createElement('label', { className: 'form-group__label' }, 'JSON Mapping'),
        React.createElement('textarea', {
          className: 'input input-mono',
          rows: 8,
          value: jsonText,
          onChange: function (e) { setJsonText(e.target.value); setJsonError(''); },
          placeholder: '{\n  "photo-1": "Alice",\n  "photo-3": "Bob"\n}'
        }),
        jsonError && React.createElement('span', { className: 'validation-error' }, jsonError)
      )
    ),

    // Submit button
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        disabled: isSubmitDisabled,
        onClick: handleSubmit
      }, inputMode === 'skip' ? 'Skip Character IDs' : 'Submit Character IDs')
    )
  );
}

window.Console.checkpoints.CharacterIds = CharacterIds;
