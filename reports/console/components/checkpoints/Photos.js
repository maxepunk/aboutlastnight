/**
 * Photos Checkpoint Component
 *
 * The photo branch's entry gate. It fires only when no photo folder has been
 * supplied yet — the whole point of the photo late-join is that parsing,
 * curation and arc analysis happen while the director is still curating and
 * cleaning the photos.
 *
 * Posts { photosPath } (valid at this checkpoint only — server.js gates it on
 * the interrupt type). Exports to window.Console.checkpoints.Photos
 */

window.Console = window.Console || {};
window.Console.checkpoints = window.Console.checkpoints || {};

const { FileBrowser } = window.Console;

function Photos({ data, onApprove, onRollback }) {
  const defaultDir = (data && data.defaultDir) || '';
  const found = (data && typeof data.found === 'number') ? data.found : 0;
  const prefill = (data && data.photosPath) || '';

  const [photosPath, setPhotosPath] = React.useState(prefill || defaultDir);
  const [browseOpen, setBrowseOpen] = React.useState(false);

  // v2 M5: key the reset on the payload's CONTENT, not on `data`'s identity. A
  // reattach re-dispatches CHECKPOINT_RECEIVED for the same gate with an
  // equivalent payload, and `[data]` would wipe a path the director had typed but
  // not yet submitted. Same discipline as Outline.js's computeResetKey.
  const resetKey = [
    (data && data.sessionId) || '',
    (data && data.defaultDir) || '',
    (data && data.photosPath) || ''
  ].join('|');

  React.useEffect(function () {
    setPhotosPath(((data && data.photosPath) || '') || ((data && data.defaultDir) || ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const trimmed = photosPath.trim();

  function handleSubmit() {
    if (!trimmed) return;
    onApprove({ photosPath: trimmed });
  }

  return React.createElement('div', { className: 'flex flex-col gap-md' },

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Why This Stop Is Here'),
      React.createElement('p', { className: 'text-sm text-secondary' },
        'Photos are the one input that needs work outside the pipeline, so the run does not wait for them. ' +
        'Parsing, evidence curation and arc analysis are already done. From here the photos are resized, ' +
        'analysed by Haiku, and mapped to the roster at the next stop.'
      )
    ),

    React.createElement('div', { className: 'checkpoint-section' },
      React.createElement('h4', { className: 'checkpoint-section__title' }, 'Photos Folder'),
      React.createElement('div', { className: 'file-browser__input-row' },
        React.createElement('input', {
          id: 'photos-checkpoint-path',
          type: 'text',
          className: 'input input-mono text-sm',
          placeholder: defaultDir || 'data/{sessionId}/photos',
          value: photosPath,
          onChange: (e) => setPhotosPath(e.target.value),
          'aria-label': 'Directory containing session photos'
        }),
        React.createElement('button', {
          className: 'btn btn-secondary btn-sm',
          onClick: () => setBrowseOpen(true),
          type: 'button',
          'aria-label': 'Browse for photos directory'
        }, 'Browse')
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        found > 0
          ? found + ' image' + (found === 1 ? '' : 's') + ' were in ' + defaultDir + ' when the pipeline reached this step.'
          : 'No images were in ' + defaultDir + ' when the pipeline reached this step.'
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'Browse only reaches folders under data/. A folder anywhere else has to be typed or pasted.'
      ),
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'A folder that does not exist is refused here, with the path in the message, so a typo ' +
        'cannot quietly produce a report with no photographs.'
      ),
      // v2 I4: the ONLY way through for a session that genuinely has no photographs.
      // The fetch throws on a missing folder, so "leave it blank" is not an answer;
      // an EMPTY existing folder is, and it reproduces the pre-plan behaviour.
      React.createElement('p', { className: 'text-muted text-xs mt-xs' },
        'For a session with no photographs, point this at an empty folder. The report is then ' +
        'written without photos.'
      )
    ),

    React.createElement('div', { className: 'flex gap-md' },
      React.createElement('button', {
        className: 'btn btn-primary',
        onClick: handleSubmit,
        disabled: !trimmed
      }, 'Use This Folder'),
      // v2 M3: name the cost. This rollback clears narrativeArcs and
      // evaluationHistory and re-runs the Opus arc analysis and evaluation, and the
      // RollbackPanel's own warning ("This will clear all data from this point
      // forward", RollbackPanel.js:61) does not say that.
      React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: () => onRollback('arc-selection'),
        type: 'button'
      }, 'Roll back to Arc Selection (re-runs arc analysis)')
    ),

    React.createElement(FileBrowser, {
      open: browseOpen,
      mode: 'directory',
      initialPath: trimmed || defaultDir || '',
      onSelect: (selected) => { setPhotosPath(selected); setBrowseOpen(false); },
      onCancel: () => setBrowseOpen(false)
    })
  );
}

window.Console.checkpoints.Photos = Photos;
