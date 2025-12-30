/**
 * Checkpoint Helpers - Native LangGraph interrupt() pattern utilities
 *
 * DRY extraction of checkpoint logic from graph.js routing functions
 * and checkpoint-setting nodes. Uses native interrupt() instead of
 * custom awaitingApproval/approvalType state fields.
 *
 * Migration: Replaces APPROVAL_TYPES constant and 8 routing functions.
 *
 * @module checkpoint-helpers
 */

const { interrupt } = require('@langchain/langgraph');

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKPOINT TYPES
// ═══════════════════════════════════════════════════════════════════════════════
//
// String constants for checkpoint types. Used in interrupt() payloads.
// Replaces APPROVAL_TYPES from state.js - same values, simpler pattern.

/**
 * Checkpoint type identifiers
 *
 * These match the old APPROVAL_TYPES values for API compatibility.
 * Scripts (e2e-walkthrough.js, continue-flow.js) depend on these names.
 */
const CHECKPOINT_TYPES = {
  INPUT_REVIEW: 'input-review',
  PAPER_EVIDENCE_SELECTION: 'paper-evidence-selection',  // Match old APPROVAL_TYPES name
  CHARACTER_IDS: 'character-ids',
  PRE_CURATION: 'pre-curation',
  EVIDENCE_AND_PHOTOS: 'evidence-and-photos',  // Match old APPROVAL_TYPES name
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline',
  ARTICLE: 'article',
  // Incremental input checkpoints (new - for parallel branch architecture)
  AWAIT_ROSTER: 'await-roster',
  AWAIT_FULL_CONTEXT: 'await-full-context'
};

// ═══════════════════════════════════════════════════════════════════════════════
// CHECKPOINT INTERRUPT HELPER
// ═══════════════════════════════════════════════════════════════════════════════
//
// DRY helper that handles the common pattern:
// 1. Check if resume data exists (skip interrupt if so)
// 2. Call interrupt() with typed payload
// 3. Return resume data for state update
//
// This replaces 6 checkpoint-setting nodes and their "skip if data exists" logic.

/**
 * Create a checkpoint that pauses for human approval
 *
 * Implements the skip-if-data-exists pattern:
 * - If skipCondition is truthy, return it immediately (already resumed)
 * - Otherwise, call interrupt() to pause execution
 * - When resumed via Command({ resume: value }), interrupt() returns the value
 *
 * Usage in node:
 * ```javascript
 * const resume = checkpointInterrupt(
 *   CHECKPOINT_TYPES.ARC_SELECTION,
 *   { narrativeArcs: state.narrativeArcs },
 *   state.selectedArcs?.length > 0 ? state.selectedArcs : null
 * );
 * return { selectedArcs: resume.selectedArcs || resume };
 * ```
 *
 * @param {string} type - Checkpoint type from CHECKPOINT_TYPES
 * @param {Object} data - Data to surface to the client for approval UI
 * @param {*} skipCondition - If truthy, skip interrupt and return this value
 * @returns {*} Resume data from Command, or skipCondition if already resumed
 */
function checkpointInterrupt(type, data, skipCondition) {
  // Skip pattern - if data already exists from prior resume, don't re-interrupt
  if (skipCondition) {
    console.log(`[checkpoint:${type}] Skipping - resume data exists`);
    return skipCondition;
  }

  console.log(`[checkpoint:${type}] Pausing for approval`);

  // interrupt() throws GraphInterrupt, caught by LangGraph
  // When resumed with Command({ resume: value }), this returns that value
  return interrupt({ type, ...data });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
//
// Helpers for building API responses when graph is interrupted.
// Replaces getApprovalData() pattern from server.js.

/**
 * Build API response when graph is interrupted
 *
 * Standardizes the response format for checkpoint pauses.
 *
 * @param {string} sessionId - Session identifier
 * @param {Object} interruptData - Data from interrupt() payload (includes type)
 * @param {string} currentPhase - Current workflow phase
 * @returns {Object} API response object
 */
function buildInterruptResponse(sessionId, interruptData, currentPhase) {
  return {
    sessionId,
    interrupted: true,
    checkpoint: interruptData,
    currentPhase
  };
}

/**
 * Check if state indicates an interrupted graph
 *
 * After graph.invoke(), check if execution paused at an interrupt.
 * Uses the LangGraph state.tasks[].interrupts structure.
 *
 * @param {Object} state - Graph state from getState()
 * @returns {boolean} True if graph is interrupted
 */
function isGraphInterrupted(state) {
  return state?.tasks?.[0]?.interrupts?.length > 0;
}

/**
 * Extract interrupt data from graph state
 *
 * Gets the interrupt payload that was passed to interrupt().
 *
 * @param {Object} state - Graph state from getState()
 * @returns {Object|null} Interrupt payload or null
 */
function getInterruptData(state) {
  if (!isGraphInterrupted(state)) return null;
  return state.tasks[0].interrupts[0]?.value || null;
}

module.exports = {
  // Checkpoint types (replaces APPROVAL_TYPES)
  CHECKPOINT_TYPES,

  // Main helper for nodes
  checkpointInterrupt,

  // Server response helpers
  buildInterruptResponse,
  isGraphInterrupted,
  getInterruptData
};
