/**
 * Mock for checkpoint-helpers.js
 *
 * Used in unit tests to prevent GraphInterrupt errors.
 * In unit tests, we don't have a LangGraph checkpointer,
 * so interrupt() would throw. This mock makes checkpointInterrupt a no-op.
 *
 * Usage in test files:
 *   jest.mock('../../../lib/workflow/checkpoint-helpers',
 *     () => require('../../mocks/checkpoint-helpers.mock'));
 */

const CHECKPOINT_TYPES = {
  INPUT_REVIEW: 'input-review',
  PAPER_EVIDENCE_SELECTION: 'paper-evidence-selection',
  CHARACTER_IDS: 'character-ids',
  PRE_CURATION: 'pre-curation',
  EVIDENCE_AND_PHOTOS: 'evidence-and-photos',
  ARC_SELECTION: 'arc-selection',
  OUTLINE: 'outline',
  ARTICLE: 'article',
  // Incremental input checkpoints (for parallel branch architecture)
  AWAIT_ROSTER: 'await-roster',
  AWAIT_FULL_CONTEXT: 'await-full-context'
};

/**
 * Mock checkpointInterrupt - no-op that returns skip condition or data
 * Prevents GraphInterrupt from being thrown in unit tests
 */
const checkpointInterrupt = jest.fn((type, data, skipCondition) => {
  return skipCondition || data;
});

/**
 * Mock buildInterruptResponse - returns standard format
 */
const buildInterruptResponse = jest.fn((sessionId, interruptData, currentPhase) => ({
  sessionId,
  interrupted: true,
  checkpoint: interruptData,
  currentPhase
}));

/**
 * Mock isGraphInterrupted - returns false in tests
 */
const isGraphInterrupted = jest.fn(() => false);

/**
 * Mock getInterruptData - returns null in tests
 */
const getInterruptData = jest.fn(() => null);

module.exports = {
  CHECKPOINT_TYPES,
  checkpointInterrupt,
  buildInterruptResponse,
  isGraphInterrupted,
  getInterruptData
};
