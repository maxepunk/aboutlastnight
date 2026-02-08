/**
 * PipelineProgress Component
 * Horizontal stepper bar showing all 10 pipeline checkpoints.
 * Completed steps are clickable for rollback, active step pulses cyan,
 * pending steps are dimmed.
 * Exports to window.Console.PipelineProgress
 */

window.Console = window.Console || {};

const { CHECKPOINT_ORDER, CHECKPOINT_LABELS } = window.Console.utils;

function PipelineProgress({ currentCheckpoint, completedCheckpoints, onRollback }) {
  // Compute completed set: all checkpoints before currentCheckpoint in order
  const completedSet = React.useMemo(() => {
    if (completedCheckpoints) return new Set(completedCheckpoints);

    const set = new Set();
    if (!currentCheckpoint) return set;

    const currentIndex = CHECKPOINT_ORDER.indexOf(currentCheckpoint);
    if (currentIndex <= 0) return set;

    for (let i = 0; i < currentIndex; i++) {
      set.add(CHECKPOINT_ORDER[i]);
    }
    return set;
  }, [currentCheckpoint, completedCheckpoints]);

  return React.createElement('div', { className: 'pipeline-progress' },
    CHECKPOINT_ORDER.map((type, index) => {
      const isCompleted = completedSet.has(type);
      const isActive = currentCheckpoint === type;
      const isPending = !isCompleted && !isActive;

      const stepClass = 'pipeline-step'
        + (isCompleted ? ' pipeline-step--completed' : '')
        + (isActive ? ' pipeline-step--active' : '')
        + (isPending ? ' pipeline-step--pending' : '');

      return React.createElement(React.Fragment, { key: type },
        // Connector line (between steps, not before first)
        index > 0 && React.createElement('div', {
          className: 'pipeline-connector' + (isCompleted || isActive ? ' pipeline-connector--filled' : '')
        }),

        // Step dot + label
        React.createElement('div', {
          className: stepClass,
          onClick: isCompleted && onRollback ? () => onRollback(type) : undefined,
          title: isCompleted ? 'Rollback to ' + CHECKPOINT_LABELS[type] : CHECKPOINT_LABELS[type],
          role: isCompleted ? 'button' : undefined,
          tabIndex: isCompleted ? 0 : undefined,
          onKeyDown: isCompleted && onRollback ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRollback(type);
            }
          } : undefined
        },
          React.createElement('div', { className: 'pipeline-step__dot' }),
          React.createElement('div', { className: 'pipeline-step__label' }, CHECKPOINT_LABELS[type] || type)
        )
      );
    })
  );
}

window.Console.PipelineProgress = PipelineProgress;
