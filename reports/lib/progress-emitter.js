/**
 * Progress Event Emitter - Session-scoped SSE streaming
 *
 * Commit 8.16: SSE progress streaming to prevent client timeout
 *
 * Single shared instance with session-based event channels.
 * Nodes emit via createProgressLogger → SSE endpoint subscribes.
 *
 * @module progress-emitter
 */

const EventEmitter = require('events');

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
      type: 'complete',
      timestamp: new Date().toISOString(),
      result
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

module.exports = { progressEmitter };
