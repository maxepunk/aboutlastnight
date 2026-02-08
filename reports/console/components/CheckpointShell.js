/**
 * CheckpointShell Component
 * Shared wrapper for all checkpoint-specific components.
 * Renders header with type label + phase, children content,
 * and a collapsible raw JSON viewer.
 * Exports to window.Console.CheckpointShell
 */

window.Console = window.Console || {};

const { CHECKPOINT_LABELS, CollapsibleSection, safeStringify } = window.Console.utils;

function CheckpointShell({ type, phase, data, children }) {
  const label = CHECKPOINT_LABELS[type] || type;

  return React.createElement('div', { className: 'checkpoint-shell glass-panel fade-in' },

    // Checkpoint header
    React.createElement('div', { className: 'checkpoint-header' },
      React.createElement('h3', { className: 'checkpoint-header__type' }, label),
      phase && React.createElement('span', { className: 'checkpoint-header__phase badge badge--amber' }, phase)
    ),

    // Checkpoint-specific content
    React.createElement('div', { className: 'checkpoint-shell__content' }, children),

    // Raw JSON viewer
    React.createElement(CollapsibleSection, {
      title: 'View Raw JSON',
      defaultOpen: false
    },
      React.createElement('pre', null, safeStringify(data))
    )
  );
}

window.Console.CheckpointShell = CheckpointShell;
