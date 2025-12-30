/**
 * State Snapshot Utilities
 *
 * Extracts relevant state for trace metadata.
 * Prevents logging massive objects (evidenceBundle can be 100KB+).
 *
 * @module observability/state-snapshot
 */

/**
 * Extract relevant state snapshot for trace metadata
 * Avoids logging entire evidenceBundle (can be 100KB+)
 *
 * @param {Object} state - LangGraph state
 * @param {string[]} additionalFields - Extra fields to include
 * @returns {Object} State snapshot for metadata
 */
function extractStateSnapshot(state, additionalFields = []) {
  if (!state) return {};

  const snapshot = {
    sessionId: state.sessionId,
    currentPhase: state.currentPhase,
    theme: state.theme,
    // NOTE: awaitingApproval/approvalType removed in interrupt() migration
    // Checkpoint state now handled via graph.getState().tasks[0].interrupts
    // Revision counts
    arcRevisionCount: state.arcRevisionCount || 0,
    outlineRevisionCount: state.outlineRevisionCount || 0,
    articleRevisionCount: state.articleRevisionCount || 0,
    // Counts (not full data)
    rosterSize: state.sessionConfig?.roster?.length || 0,
    tokenCount: state.memoryTokens?.length || 0,
    paperEvidenceCount: state.paperEvidence?.length || 0,
    arcCount: state.narrativeArcs?.length || 0,
    errorCount: state.errors?.length || 0
  };

  // Add any additional fields requested
  for (const field of additionalFields) {
    if (state[field] !== undefined) {
      const value = state[field];
      // For arrays/objects, just include length/keys
      if (Array.isArray(value)) {
        snapshot[`${field}Count`] = value.length;
      } else if (typeof value === 'object' && value !== null) {
        snapshot[`${field}Keys`] = Object.keys(value);
      } else {
        snapshot[field] = value;
      }
    }
  }

  return snapshot;
}

module.exports = { extractStateSnapshot };
