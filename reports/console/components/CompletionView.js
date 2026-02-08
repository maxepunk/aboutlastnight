/**
 * CompletionView Component
 * Rendered when the workflow completes successfully.
 * Shows success banner, session summary, report link, and validation results.
 * Exports to window.Console.CompletionView
 */

window.Console = window.Console || {};

const { Badge, safeStringify } = window.Console.utils;

function CompletionView({ result, onNewSession }) {
  const sessionId = result.sessionId || result.session || null;
  const outputPath = result.outputPath || result.htmlUrl || null;
  const validationResults = result.validationResults || null;

  const handleViewReport = () => {
    const url = result.htmlUrl || result.outputPath;
    if (url) {
      window.open(url, '_blank', 'noopener');
    }
  };

  return React.createElement('div', { className: 'completion-view fade-in' },
    // Success banner
    React.createElement('div', { className: 'completion-view__banner glass-panel' },
      React.createElement('h2', { className: 'completion-view__title' }, 'Workflow Complete'),
      React.createElement('p', { className: 'text-secondary mt-sm' },
        'The article pipeline has finished successfully.'
      )
    ),

    // Session summary
    React.createElement('div', { className: 'completion-view__summary glass-panel mt-md' },
      React.createElement('h4', { className: 'text-secondary mb-sm' }, 'Session Summary'),
      React.createElement('ul', { className: 'completion-view__details' },
        sessionId && React.createElement('li', { key: 'session' },
          React.createElement('span', { className: 'text-muted' }, 'Session: '),
          React.createElement('span', { className: 'text-primary' }, sessionId)
        ),
        outputPath && React.createElement('li', { key: 'output' },
          React.createElement('span', { className: 'text-muted' }, 'Output: '),
          React.createElement('code', { className: 'text-xs' }, outputPath)
        )
      )
    ),

    // Validation results
    validationResults && React.createElement('div', { className: 'glass-panel mt-md' },
      React.createElement('h4', { className: 'text-secondary mb-sm' }, 'Validation Results'),
      React.createElement('div', { className: 'tag-list' },
        Array.isArray(validationResults)
          ? validationResults.map((v, i) =>
              React.createElement(Badge, {
                key: (v.name || v.rule || 'v') + '-' + i,
                label: (v.name || v.rule || 'Check ' + (i + 1)) + ': ' + (v.passed ? 'Pass' : 'Fail'),
                color: v.passed ? 'var(--accent-green)' : 'var(--accent-red)'
              })
            )
          : React.createElement('p', { className: 'text-muted text-sm' },
              typeof validationResults === 'string'
                ? validationResults
                : safeStringify(validationResults)
            )
      )
    ),

    // Actions
    React.createElement('div', { className: 'completion-view__actions mt-lg' },
      (result.htmlUrl || result.outputPath) &&
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: handleViewReport,
          'aria-label': 'View generated report'
        }, 'View Report'),
      React.createElement('button', {
        className: 'btn btn-secondary',
        onClick: onNewSession,
        'aria-label': 'Start a new session'
      }, 'Start New Session')
    )
  );
}

window.Console.CompletionView = CompletionView;
