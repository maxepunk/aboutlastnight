/**
 * CharacterIds Checkpoint Component
 * Per-photo character identification with thumbnails.
 * Shows AI analysis (read-only) alongside user input fields.
 * Submits combined AI + user descriptions as characterIdsRaw.
 * Exports to window.Console.checkpoints.CharacterIds
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { Badge, truncate } = window.Console.utils;

function CharacterIds({ data, onApprove }) {
  const sessionPhotos = (data && data.sessionPhotos) || [];
  const photoAnalyses = (data && data.photoAnalyses && data.photoAnalyses.analyses) || [];
  const roster = (data && data.sessionConfig && data.sessionConfig.roster) || [];

  // Per-photo user descriptions keyed by index
  const [descriptions, setDescriptions] = React.useState({});
  // Track which cards are expanded (show full AI analysis)
  const [expanded, setExpanded] = React.useState({});

  function getDisplayName(filepath) {
    return (filepath || '').split('/').pop().split('\\').pop();
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

  function toggleExpanded(index) {
    setExpanded(function (prev) {
      var next = Object.assign({}, prev);
      next[index] = !prev[index];
      return next;
    });
  }

  function updateDescription(index, value) {
    setDescriptions(function (prev) {
      var next = Object.assign({}, prev);
      next[index] = value;
      return next;
    });
  }

  function buildPayload() {
    // Concatenate per-photo blocks with AI context + user input
    var blocks = [];
    photoAnalyses.forEach(function (photo, i) {
      var filename = getDisplayName(sessionPhotos[i]) || 'Photo ' + (i + 1);
      var userText = (descriptions[i] || '').trim();
      var aiVisual = (photo.visualContent || '').trim();
      var charDescs = (photo.characterDescriptions || [])
        .map(function (d) {
          return '[' + (d.description || 'unknown') + ', role: ' + (d.role || 'UNKNOWN') + ']';
        })
        .join(', ');

      var lines = ['Photo ' + filename + ':'];
      if (aiVisual) lines.push('  AI Description: ' + aiVisual);
      if (charDescs) lines.push('  Character Descriptions: ' + charDescs);
      if (userText) lines.push('  User Input: ' + userText);
      blocks.push(lines.join('\n'));
    });
    return blocks.join('\n');
  }

  function handleSubmit() {
    var payload = buildPayload();
    onApprove({ characterIdsRaw: payload });
  }

  function handleSkip() {
    onApprove({ characterIds: {} });
  }

  var hasAnyInput = Object.keys(descriptions).some(function (k) {
    return (descriptions[k] || '').trim().length > 0;
  });

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    // Roster reference bar
    roster.length > 0 && React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Session Roster'),
      React.createElement('div', { className: 'tag-list' },
        roster.map(function (name) {
          return React.createElement(Badge, { key: name, label: name, color: 'var(--accent-cyan)' });
        })
      )
    ),

    // Photo cards
    photoAnalyses.length > 0 && React.createElement('div', { className: 'flex flex-col gap-md' },
      photoAnalyses.map(function (photo, i) {
        var filepath = sessionPhotos[i] || '';
        var displayName = getDisplayName(filepath) || 'Photo ' + (i + 1);
        var score = photo.relevanceScore || 0;
        var visual = photo.visualContent || '';
        var charDescs = photo.characterDescriptions || [];
        var caption = photo.suggestedCaption || '';
        var isExpanded = !!expanded[i];
        var thumbUrl = filepath
          ? '/api/file?path=' + encodeURIComponent(filepath)
          : null;

        return React.createElement('div', {
          key: 'photo-' + i,
          className: 'photo-card'
        },
          // Card body: thumbnail + content
          React.createElement('div', { className: 'photo-card__body' },

            // Thumbnail
            thumbUrl && React.createElement('div', {
              className: 'photo-card__thumb-wrap',
              onClick: function () { toggleExpanded(i); }
            },
              React.createElement('img', {
                src: thumbUrl,
                alt: displayName,
                className: 'photo-card__thumbnail'
              })
            ),

            // Right side: header, AI analysis, user input
            React.createElement('div', { className: 'photo-card__content' },

              // Header: filename + score
              React.createElement('div', {
                className: 'photo-card__header',
                onClick: function () { toggleExpanded(i); },
                style: { cursor: 'pointer' }
              },
                React.createElement('span', { className: 'text-sm' }, displayName),
                React.createElement('span', {
                  className: 'photo-card__score ' + getScoreClass(score)
                }, score + '/10'),
                React.createElement('span', {
                  className: 'text-xs text-muted',
                  style: { marginLeft: 'auto' }
                }, isExpanded ? '\u25B2' : '\u25BC')
              ),

              // AI Analysis (read-only) — always show summary, expand for full
              React.createElement('div', { className: 'photo-card__ai-section' },
                React.createElement('span', {
                  className: 'photo-card__ai-label'
                }, 'AI Analysis'),

                // Visual content
                visual && React.createElement('p', { className: 'text-xs text-secondary' },
                  isExpanded ? visual : truncate(visual, 100)
                ),

                // Character descriptions (always visible — key reference)
                charDescs.length > 0 && React.createElement('div', {
                  className: 'flex flex-col gap-sm mt-xs'
                },
                  charDescs.map(function (desc, j) {
                    return React.createElement('div', {
                      key: 'char-' + i + '-' + j,
                      className: 'character-desc'
                    },
                      React.createElement('div', { className: 'character-desc__role' },
                        React.createElement(Badge, {
                          label: desc.role || 'UNKNOWN',
                          color: getRoleColor(desc.role)
                        })
                      ),
                      desc.description && React.createElement('span', {
                        className: 'text-xs text-secondary'
                      }, isExpanded ? desc.description : truncate(desc.description, 80)),
                      isExpanded && desc.physicalMarkers && React.createElement('span', {
                        className: 'text-xs text-muted'
                      }, 'Markers: ' + desc.physicalMarkers)
                    );
                  })
                ),

                // Caption (expanded only)
                isExpanded && caption && React.createElement('p', {
                  className: 'text-xs text-muted mt-xs'
                }, 'Caption: ' + caption)
              ),

              // User input (separate field)
              React.createElement('div', { className: 'photo-card__user-section mt-sm' },
                React.createElement('label', {
                  className: 'photo-card__user-label',
                  htmlFor: 'char-input-' + i
                }, 'Your Description'),
                React.createElement('textarea', {
                  id: 'char-input-' + i,
                  className: 'input text-sm photo-card__input',
                  rows: 2,
                  value: descriptions[i] || '',
                  onChange: function (e) { updateDescription(i, e.target.value); },
                  placeholder: 'e.g., ' + (roster.length > 0
                    ? roster[0] + ' is the person in red, ' + (roster[1] || '...') + ' is behind them...'
                    : 'Sarah is in the red dress, Marcus is behind her...')
                })
              )
            )
          )
        );
      })
    ),

    // No photos fallback
    photoAnalyses.length === 0 && React.createElement('p', {
      className: 'text-muted text-sm'
    }, 'No photo analyses available.'),

    // Global actions
    React.createElement('div', { className: 'flex gap-md mt-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleSubmit
      }, 'Submit Character IDs'),
      React.createElement('button', {
        className: 'btn btn-ghost',
        onClick: handleSkip
      }, 'Skip')
    )
  );
}

window.Console.checkpoints.CharacterIds = CharacterIds;
