/**
 * Progress Event Emitter - Session-scoped SSE streaming
 *
 * Single shared instance with session-based event channels.
 * Nodes emit via createProgressLogger -> SSE endpoint subscribes.
 *
 * Moved from lib/progress-emitter.js to consolidate observability code.
 *
 * @module observability/progress-emitter
 */

const EventEmitter = require('events');

/**
 * Map a terminal workflow response to its SSE event type (SSE-1).
 * - error  -> 'failed' (distinct; client renders a retry affordance)
 * - interrupted / complete -> 'complete' (client disambiguates on the payload)
 * @param {object} result
 * @returns {'complete'|'failed'}
 */
function outcomeEventType(result = {}) {
  if (!result.interrupted && result.currentPhase === 'error') return 'failed';
  return 'complete';
}

class ProgressEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // Support multiple concurrent sessions
  }

  /**
   * Emit progress for a specific session
   * @param {string} sessionId - Session identifier
   * @param {object} data - Progress data (context, type, elapsed, etc.)
   */
  emitProgress(sessionId, data) {
    if (!sessionId) return;
    this.emit(`progress:${sessionId}`, {
      timestamp: new Date().toISOString(),
      ...data
    });
  }

  /**
   * Emit workflow completion event with full result
   * Used by non-blocking approve endpoint to signal completion via SSE
   * @param {string} sessionId - Session identifier
   * @param {object} result - Workflow result (currentPhase, awaitingApproval, etc.)
   */
  emitComplete(sessionId, result) {
    if (!sessionId) return;
    this.emit(`progress:${sessionId}`, {
      timestamp: new Date().toISOString(),
      ...result,
      // SSE-1: failures get a DISTINCT type so the client can show a retry
      // affordance; interrupted/complete stay 'complete' (client disambiguates
      // on interrupted/currentPhase). Must be last to override any inbound type.
      type: outcomeEventType(result)
    });
  }

  /**
   * Subscribe to session progress events
   * @param {string} sessionId - Session identifier
   * @param {Function} handler - Event handler: (data) => void
   * @returns {Function} Cleanup function to unsubscribe
   */
  subscribe(sessionId, handler) {
    const eventName = `progress:${sessionId}`;
    this.on(eventName, handler);

    // Return cleanup function for caller to unsubscribe
    return () => this.off(eventName, handler);
  }
}

// Singleton instance shared across all nodes and server
const progressEmitter = new ProgressEmitter();

module.exports = { progressEmitter, ProgressEmitter, outcomeEventType };
