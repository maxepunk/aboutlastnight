/**
 * session-outcome — durable-enough record of the LAST terminal outcome per session.
 *
 * DEL-1: the approve endpoint returns 200 {status:'processing'} immediately and
 * delivers the real result via the unbuffered SSE emitter. If no subscriber is
 * attached (early-400, reconnect gap, tab closed) that outcome is lost. We also
 * record it here so GET /state can surface it after the fact.
 *
 * Process-local, in-memory, last-write-wins. NOT restart-durable — unlike the
 * SqliteSaver checkpointer, this store is lost on process restart. The durable
 * interrupt/checkpoint state is the authoritative recovery surface; this is only
 * a best-effort surface for a dropped SSE within a single process lifetime.
 *
 * @module session-outcome
 */

const _store = new Map();

/**
 * Normalize a workflow result/response into a single outcome record.
 * @param {object} result - { interrupted?, checkpoint?, currentPhase, outputPath?, error?, details?, errors? }
 * @returns {object} record with a discriminating `outcome` field
 */
function buildOutcomeRecord(result = {}) {
  const recordedAt = new Date().toISOString();
  if (result.interrupted) {
    return {
      outcome: 'interrupted',
      currentPhase: result.currentPhase ?? null,
      checkpointType: result.checkpoint?.type || null,
      recordedAt
    };
  }
  if (result.currentPhase === 'error') {
    return {
      outcome: 'failed',
      currentPhase: 'error',
      error: result.error || 'Workflow error',
      details: result.details || null,
      errors: result.errors || [],
      recordedAt
    };
  }
  return {
    outcome: 'complete',
    currentPhase: result.currentPhase ?? 'complete',
    outputPath: result.outputPath || null,
    photosCopied: result.photosCopied || null,
    recordedAt
  };
}

function recordSessionOutcome(sessionId, record) {
  if (!sessionId) return;
  _store.set(sessionId, record);
}

function getSessionOutcome(sessionId) {
  return _store.get(sessionId) || null;
}

function clearSessionOutcome(sessionId) {
  _store.delete(sessionId);
}

/** Test-only: wipe the whole store. */
function _resetOutcomeStore() {
  _store.clear();
}

module.exports = {
  buildOutcomeRecord,
  recordSessionOutcome,
  getSessionOutcome,
  clearSessionOutcome,
  _resetOutcomeStore
};
