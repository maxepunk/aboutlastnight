/**
 * ProgressStream Component
 * Shown during workflow processing. Displays real-time SSE progress:
 * pulsing spinner, operation label, elapsed timer, rolling messages,
 * and collapsible LLM activity panel.
 * Exports to window.Console.ProgressStream
 */

window.Console = window.Console || {};

const { formatElapsed, CollapsibleSection, safeStringify } = window.Console.utils;

function ProgressStream({ processing, llmActivity, lastLlmActivity, progressMessages }) {
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
          key: msg + '-' + i,
          className: 'progress-messages__item' + (i === recentMessages.length - 1 ? ' progress-messages__item--latest' : '')
        }, msg)
      )
    ),

    // Collapsible LLM activity details (current or last completed)
    (llmActivity || lastLlmActivity) && React.createElement(CollapsibleSection, {
      title: 'LLM Activity Details',
      defaultOpen: false
    },
      React.createElement('div', { className: 'progress-llm-panel' },
        // Show current activity prompt if available
        llmActivity && llmActivity.prompt && React.createElement(React.Fragment, null,
          React.createElement('h4', { className: 'progress-llm-panel__heading' }, 'Prompt'),
          React.createElement('pre', { className: 'progress-llm-panel__content' },
            typeof llmActivity.prompt === 'string' ? llmActivity.prompt : safeStringify(llmActivity.prompt)
          )
        ),
        llmActivity && llmActivity.systemPrompt && React.createElement(React.Fragment, null,
          React.createElement('h4', { className: 'progress-llm-panel__heading' }, 'System Prompt'),
          React.createElement('pre', { className: 'progress-llm-panel__content' },
            typeof llmActivity.systemPrompt === 'string' ? llmActivity.systemPrompt : safeStringify(llmActivity.systemPrompt)
          )
        ),
        // Show last completed response if available
        lastLlmActivity && lastLlmActivity.response && React.createElement(React.Fragment, null,
          React.createElement('h4', { className: 'progress-llm-panel__heading' },
            'Last Response (' + (lastLlmActivity.label || 'unknown') + ')'
          ),
          React.createElement('pre', { className: 'progress-llm-panel__content' },
            typeof lastLlmActivity.response === 'string' ? lastLlmActivity.response : safeStringify(lastLlmActivity.response)
          )
        ),
        // Fallback: show raw activity if no structured data
        !llmActivity?.prompt && !lastLlmActivity?.response && React.createElement('pre', { className: 'progress-llm-panel__content' },
          safeStringify(llmActivity || lastLlmActivity)
        )
      )
    )
  );
}

window.Console.ProgressStream = ProgressStream;
