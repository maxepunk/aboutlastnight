/**
 * ProgressStream Component
 * Shown during workflow processing. Displays real-time SSE progress:
 * pulsing spinner, operation label, elapsed timer, rolling messages,
 * and collapsible LLM activity panel.
 * Exports to window.Console.ProgressStream
 */

window.Console = window.Console || {};

const { formatElapsed, CollapsibleSection } = window.Console.utils;

function ProgressStream({ processing, llmActivity, progressMessages }) {
  const [elapsed, setElapsed] = React.useState(0);

  // Elapsed time counter — ticks every second while LLM is active
  React.useEffect(() => {
    if (!llmActivity || !llmActivity.startTime) {
      setElapsed(0);
      return;
    }

    // Set initial elapsed immediately
    setElapsed(Date.now() - llmActivity.startTime);

    const interval = setInterval(() => {
      setElapsed(Date.now() - llmActivity.startTime);
    }, 1000);

    return () => clearInterval(interval);
  }, [llmActivity]);

  if (!processing) return null;

  // Last 10 progress messages (most recent at bottom)
  const recentMessages = progressMessages.slice(-10);

  return React.createElement('div', { className: 'progress-stream glass-panel fade-in' },

    // Pulsing spinner indicator
    React.createElement('div', { className: 'progress-spinner' },
      React.createElement('span', { className: 'progress-spinner__dot' })
    ),

    // Operation label + model
    llmActivity
      ? React.createElement('div', { className: 'progress-operation' },
          React.createElement('span', { className: 'progress-operation__label' }, llmActivity.label || 'Processing'),
          React.createElement('span', { className: 'progress-operation__model badge badge--cyan' }, llmActivity.model || 'unknown')
        )
      : React.createElement('div', { className: 'progress-operation' },
          React.createElement('span', { className: 'progress-operation__label' }, 'Processing...')
        ),

    // Elapsed time
    llmActivity && React.createElement('div', { className: 'progress-elapsed' },
      formatElapsed(elapsed)
    ),

    // Rolling progress messages
    recentMessages.length > 0 && React.createElement('div', { className: 'progress-messages' },
      recentMessages.map((msg, i) =>
        React.createElement('div', {
          key: i,
          className: 'progress-messages__item' + (i === recentMessages.length - 1 ? ' progress-messages__item--latest' : '')
        }, msg)
      )
    ),

    // Collapsible LLM activity details
    llmActivity && React.createElement(CollapsibleSection, {
      title: 'Full LLM Activity',
      defaultOpen: false
    },
      React.createElement('div', { className: 'progress-llm-panel' },
        React.createElement('pre', null, JSON.stringify(llmActivity, null, 2))
      )
    )
  );
}

window.Console.ProgressStream = ProgressStream;
