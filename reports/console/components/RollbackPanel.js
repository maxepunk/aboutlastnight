/**
 * RollbackPanel Component
 * Modal dialog for confirming rollback to a previous checkpoint.
 * Shows warning, target checkpoint, and optional state overrides.
 * Exports to window.Console.RollbackPanel
 */

window.Console = window.Console || {};

const { CHECKPOINT_LABELS, CollapsibleSection } = window.Console.utils;

function RollbackPanel({ targetCheckpoint, onConfirm, onCancel }) {
  const [overridesText, setOverridesText] = React.useState('');
  const [parseError, setParseError] = React.useState(null);

  const checkpointLabel = CHECKPOINT_LABELS[targetCheckpoint] || targetCheckpoint;

  const handleConfirm = () => {
    if (overridesText.trim()) {
      try {
        const parsed = JSON.parse(overridesText);
        setParseError(null);
        onConfirm(targetCheckpoint, parsed);
      } catch (err) {
        setParseError('Invalid JSON: ' + err.message);
        return;
      }
    } else {
      onConfirm(targetCheckpoint, null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onCancel();
    }
  };

  return React.createElement('div', {
    className: 'rollback-modal',
    onClick: handleBackdropClick,
    onKeyDown: handleKeyDown,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Confirm rollback to ' + checkpointLabel
  },
    React.createElement('div', { className: 'rollback-modal__panel glass-panel fade-in' },
      // Title
      React.createElement('h3', { className: 'rollback-modal__title' },
        'Rollback to ' + checkpointLabel
      ),

      // Warning
      React.createElement('p', { className: 'rollback-modal__warning mt-md' },
        'This will clear all data from this point forward.'
      ),

      // State Overrides (collapsed by default)
      React.createElement('div', { className: 'mt-md' },
        React.createElement(CollapsibleSection, {
          title: 'State Overrides (Advanced)',
          defaultOpen: false
        },
          React.createElement('textarea', {
            className: 'input input-mono rollback-modal__overrides',
            value: overridesText,
            onChange: (e) => {
              setOverridesText(e.target.value);
              setParseError(null);
            },
            placeholder: '{"key": "value"}',
            'aria-label': 'State overrides JSON',
            rows: 6
          }),
          parseError && React.createElement('p', {
            className: 'validation-error'
          }, parseError)
        )
      ),

      // Actions
      React.createElement('div', { className: 'rollback-modal__actions mt-lg' },
        React.createElement('button', {
          className: 'btn btn-danger',
          onClick: handleConfirm,
          'aria-label': 'Confirm rollback'
        }, 'Confirm Rollback'),
        React.createElement('button', {
          className: 'btn btn-ghost',
          onClick: onCancel,
          'aria-label': 'Cancel rollback'
        }, 'Cancel')
      )
    )
  );
}

window.Console.RollbackPanel = RollbackPanel;
