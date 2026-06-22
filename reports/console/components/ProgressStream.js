/**
 * ProgressStream Component
 * Live LLM call feed: four-phase ribbon (preparing→thinking→writing→done|failed),
 * a raw auto-scrolling token stream, a token/TTFT liveness counter, the scrollable
 * macro event log, and an inline failure card with [Retry] (=/resume) / [Roll back].
 * Exports to window.Console.ProgressStream
 */

window.Console = window.Console || {};

const { formatElapsed, CollapsibleSection, safeStringify } = window.Console.utils;
const StreamLogicView = window.Console.llmStreamLogic;

function ProgressStream({ processing, llmActivity, lastLlmActivity, eventLog, onRetry, onRollback }) {
  const [elapsed, setElapsed] = React.useState(0);
  const streamRef = React.useRef(null);

  // Liveness: tick every second while a call is active and not failed.
  React.useEffect(() => {
    if (!llmActivity || !llmActivity.startTime || llmActivity.phase === 'failed') {
      return;
    }
    setElapsed(Date.now() - llmActivity.startTime);
    const interval = setInterval(() => {
      setElapsed(Date.now() - llmActivity.startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [llmActivity]);

  // Auto-scroll the raw stream pane to the newest token.
  React.useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [llmActivity && llmActivity.streamText]);

  if (!processing && !(llmActivity && llmActivity.phase === 'failed')) return null;

  const phase = llmActivity ? llmActivity.phase : 'preparing';
  const failed = phase === 'failed';
  const order = StreamLogicView.phaseOrder();
  const recentEvents = (eventLog || []).slice(-12);

  return React.createElement('div', { className: 'progress-stream glass-panel fade-in' },

    // ── Phase ribbon: preparing → thinking → writing → done|failed ──
    React.createElement('div', { className: 'progress-phases', role: 'list', 'aria-label': 'LLM call phase' },
      order.map((p) => {
        const d = StreamLogicView.describePhase(p);
        const reached = StreamLogicView.isPhaseReached(phase, p);
        const active = phase === p;
        return React.createElement('div', {
          key: p,
          role: 'listitem',
          className: 'progress-phases__step'
            + (reached ? ' progress-phases__step--reached' : '')
            + (active ? ' progress-phases__step--active' : '')
        }, d.label);
      }),
      failed && React.createElement('div', {
        role: 'listitem',
        className: 'progress-phases__step progress-phases__step--failed'
      }, 'Failed')
    ),

    // ── Operation label + model ──
    React.createElement('div', { className: 'progress-operation' },
      React.createElement('span', { className: 'progress-operation__label' },
        (llmActivity && llmActivity.label) || 'Processing'),
      llmActivity && llmActivity.model && React.createElement('span', {
        className: 'progress-operation__model badge badge--cyan'
      }, llmActivity.model)
    ),

    // ── Liveness counter: elapsed · tokens · ttft ──
    llmActivity && !failed && React.createElement('div', { className: 'progress-liveness' },
      React.createElement('span', { className: 'progress-liveness__elapsed' }, formatElapsed(elapsed)),
      React.createElement('span', { className: 'progress-liveness__sep' }, '·'),
      React.createElement('span', { className: 'progress-liveness__tokens' },
        (llmActivity.tokenCount || 0) + ' tok'),
      llmActivity.ttftMs != null && React.createElement(React.Fragment, null,
        React.createElement('span', { className: 'progress-liveness__sep' }, '·'),
        React.createElement('span', { className: 'progress-liveness__ttft' },
          'ttft ' + llmActivity.ttftMs + 'ms')
      )
    ),

    // ── Raw live token stream (auto-scroll). Structured calls stream raw JSON — chosen transparency. ──
    llmActivity && llmActivity.streamText && React.createElement('pre', {
      className: 'progress-stream__raw',
      ref: streamRef,
      'aria-label': 'Live model output'
    }, llmActivity.streamText),

    // ── Inline failure card ──
    failed && React.createElement('div', { className: 'progress-failure', role: 'alert' },
      React.createElement('div', { className: 'progress-failure__title' },
        '\u274C ' + (llmActivity.error || 'LLM call failed')),
      React.createElement('div', { className: 'progress-failure__actions' },
        React.createElement('button', {
          className: 'btn btn-primary',
          onClick: () => onRetry && onRetry(),
          'aria-label': 'Retry the failed step'
        }, 'Retry'),
        React.createElement('button', {
          className: 'btn btn-ghost',
          onClick: () => onRollback && onRollback(),
          'aria-label': 'Roll back to an earlier checkpoint'
        }, 'Roll back')
      )
    ),

    // ── Scrollable macro event log (retired .slice(-49) cap) ──
    recentEvents.length > 0 && React.createElement('div', { className: 'progress-eventlog' },
      recentEvents.map((ev) =>
        React.createElement('div', {
          key: ev.seq,
          className: 'progress-eventlog__item progress-eventlog__item--' + (ev.kind || 'progress')
        }, ev.message)
      )
    ),

    // ── Collapsible last-completed details (prompt/response) ──
    lastLlmActivity && React.createElement(CollapsibleSection, {
      title: 'Last call details',
      defaultOpen: false
    },
      React.createElement('pre', { className: 'progress-llm-panel__content' },
        typeof lastLlmActivity.response === 'string'
          ? lastLlmActivity.response
          : safeStringify(lastLlmActivity.response || lastLlmActivity)
      )
    )
  );
}

window.Console.ProgressStream = ProgressStream;
