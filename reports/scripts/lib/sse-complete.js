/**
 * Resolve the workflow-completion payload from an SSE 'complete' (or 'failed') event.
 *
 * The server's progressEmitter.emitComplete (lib/observability/progress-emitter.js)
 * spreads the result FLAT onto the event: { ...result, type:'complete' } — there is
 * no `.result` wrapper. Older/alternate emitters may nest under `.result`. Accept both;
 * fail loud on a missing event rather than letting `currentData` become undefined.
 *
 * @param {object} event - The parsed SSE event object (type === 'complete' | 'failed').
 * @returns {object} The completion payload (currentPhase, outputPath, interrupted, checkpoint, ...).
 */
function resolveCompletePayload(event) {
  if (!event || typeof event !== 'object') {
    throw new Error('resolveCompletePayload: missing or invalid completion event');
  }
  return event.result || event;
}

module.exports = { resolveCompletePayload };
