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
  const notPrinted = window.Console.sessionStartLogic.notPrintedPhotosView(result);

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

    // The director's ruling at the end of phase 4 (2026-10-04): the published files the page does
    // not print, named for the director to remove before committing (publish deletes nothing).
    notPrinted && React.createElement('div', { className: 'completion-view__not-printed glass-panel mt-md', role: 'note' },
      React.createElement('h4', { className: 'text-secondary mb-sm' }, 'Photos not on the page'),
      React.createElement('p', { className: 'text-sm' }, notPrinted.line),
      React.createElement('ul', { className: 'completion-view__details' },
        notPrinted.files.map((name) => React.createElement('li', { key: name },
          React.createElement('code', { className: 'text-xs' }, name)
        ))
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
