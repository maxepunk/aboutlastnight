/**
 * Checkpoint Nodes - Dedicated checkpoint nodes for human-in-the-loop approval
 *
 * Following LangGraph best practices: separate data fetching from checkpoints.
 * Each node contains ONLY a checkpointInterrupt() call - no data fetching.
 *
 * This enables:
 * - Pure data nodes that can be called outside LangGraph (no interrupt errors)
 * - Native LangGraph parallel branches
 * - Clean separation of concerns (SRP)
 *
 * All nodes follow the LangGraph pattern:
 * - Accept (state, config) parameters
 * - Return partial state updates
 * - Use PHASES constants for currentPhase values
 */

const { PHASES } = require('../state');
const { CHECKPOINT_TYPES, checkpointInterrupt } = require('../checkpoint-helpers');
const { traceNode } = require('../../observability');

/**
 * Paper Evidence Selection Checkpoint
 *
 * Pauses for user to select which paper evidence items were unlocked during gameplay.
 * Requires: state.paperEvidence (from fetchPaperEvidencePure)
 *
 * @param {Object} state - Current state with paperEvidence
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase
 */
async function checkpointPaperEvidence(state, config) {
  // Skip if already have selection (resume case)
  const skipCondition = state.selectedPaperEvidence?.length > 0
    ? state.selectedPaperEvidence
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.PAPER_EVIDENCE_SELECTION,
    { paperEvidence: state.paperEvidence },
    skipCondition
  );

  // If resumed with selection, capture it in state return
  // This ensures subsequent nodes see the selection (Command({ update }) may not persist)
  if (resumeValue?.selectedPaperEvidence && !skipCondition) {
    console.log(`[checkpointPaperEvidence] Captured selection from resume: ${resumeValue.selectedPaperEvidence.length} items`);
    return {
      selectedPaperEvidence: resumeValue.selectedPaperEvidence,
      currentPhase: PHASES.SELECT_PAPER_EVIDENCE
    };
  }

  return {
    currentPhase: PHASES.SELECT_PAPER_EVIDENCE
  };
}

/**
 * Character IDs Checkpoint
 *
 * Pauses for user to map photo character descriptions to roster names.
 * Requires: state.photoAnalyses (from analyzePhotosGeneric or analyzePhotos)
 *
 * @param {Object} state - Current state with photoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase
 */
async function checkpointCharacterIds(state, config) {
  // Skip if already have mappings (resume case)
  const skipCondition = state.characterIdMappings !== null && state.characterIdMappings !== undefined
    ? state.characterIdMappings
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.CHARACTER_IDS,
    {
      photoAnalyses: state.photoAnalyses,
      roster: state.roster  // Include roster for character mapping display
    },
    skipCondition
  );

  // If resumed with character mappings, capture it in state return
  // This ensures subsequent nodes see the mappings (Command({ update }) may not persist)
  // Support both formats: characterIdMappings (structured) and characterIdsRaw (text)
  if (!skipCondition) {
    if (resumeValue?.characterIdMappings) {
      console.log(`[checkpointCharacterIds] Captured mappings from resume`);
      return {
        characterIdMappings: resumeValue.characterIdMappings,
        currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
      };
    }
    if (resumeValue?.characterIdsRaw) {
      console.log(`[checkpointCharacterIds] Captured raw character IDs from resume`);
      return {
        characterIdsRaw: resumeValue.characterIdsRaw,
        currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
      };
    }
  }

  return {
    currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
  };
}

/**
 * Pre-Curation Checkpoint
 *
 * Pauses for user to review preprocessed evidence before curation.
 * Requires: state.preprocessedEvidence (from preprocessEvidencePure)
 *
 * @param {Object} state - Current state with preprocessedEvidence
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with preCurationApproved, currentPhase
 */
async function checkpointPreCuration(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state.preCurationApproved === true
    ? true
    : null;

  checkpointInterrupt(
    CHECKPOINT_TYPES.PRE_CURATION,
    { preprocessedEvidence: state.preprocessedEvidence },
    skipCondition
  );

  return {
    preCurationApproved: true,
    currentPhase: PHASES.PRE_CURATION_CHECKPOINT
  };
}

/**
 * Await Roster Checkpoint
 *
 * Pauses for user to provide roster via /approve endpoint.
 * This is a NEW checkpoint for incremental input flow.
 * Enables: Whiteboard OCR with roster disambiguation, character ID mapping
 *
 * @param {Object} state - Current state with genericPhotoAnalyses
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase
 */
async function checkpointAwaitRoster(state, config) {
  // Skip if roster already provided
  const skipCondition = state.roster?.length > 0
    ? state.roster
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.AWAIT_ROSTER,
    {
      genericPhotoAnalyses: state.genericPhotoAnalyses,
      whiteboardPhotoPath: state.whiteboardPhotoPath,
      message: 'Provide roster to enable whiteboard OCR and character identification'
    },
    skipCondition
  );

  // If resumed with roster data, capture it in state return
  // This ensures subsequent nodes see the roster (Command({ update }) may not persist)
  if (resumeValue?.roster && !skipCondition) {
    console.log(`[checkpointAwaitRoster] Captured roster from resume: ${resumeValue.roster.length} characters`);
    return {
      roster: resumeValue.roster,
      currentPhase: PHASES.AWAIT_ROSTER
    };
  }

  return {
    currentPhase: PHASES.AWAIT_ROSTER
  };
}

/**
 * Await Full Context Checkpoint
 *
 * Pauses for user to provide accusation, sessionReport, and directorNotes.
 * This is a NEW checkpoint for incremental input flow.
 * Enables: Input review checkpoint, token tagging, arc analysis
 *
 * @param {Object} state - Current state with roster
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with currentPhase
 */
async function checkpointAwaitContext(state, config) {
  // Skip if full context already provided
  const hasFullContext = state.rawSessionInput?.accusation &&
                         state.rawSessionInput?.sessionReport &&
                         state.rawSessionInput?.directorNotes;

  const skipCondition = hasFullContext
    ? state.rawSessionInput
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.AWAIT_FULL_CONTEXT,
    {
      roster: state.roster,
      whiteboardAnalysis: state.whiteboardAnalysis,
      message: 'Provide accusation, sessionReport, and directorNotes to continue'
    },
    skipCondition
  );

  // If resumed with fullContext data, capture it in state return
  // This ensures parseRawInput sees the data (Command({ update }) may not persist)
  if (resumeValue?.fullContext && !skipCondition) {
    const existingRawInput = state.rawSessionInput || {};
    const newRawSessionInput = {
      ...existingRawInput,
      accusation: resumeValue.fullContext.accusation,
      sessionReport: resumeValue.fullContext.sessionReport,
      directorNotes: resumeValue.fullContext.directorNotes
    };
    console.log(`[checkpointAwaitContext] Captured fullContext from resume: accusation=${!!newRawSessionInput.accusation}, report=${!!newRawSessionInput.sessionReport}, notes=${!!newRawSessionInput.directorNotes}`);
    return {
      rawSessionInput: newRawSessionInput,
      currentPhase: PHASES.AWAIT_FULL_CONTEXT
    };
  }

  return {
    currentPhase: PHASES.AWAIT_FULL_CONTEXT
  };
}

/**
 * Join node for parallel branches
 *
 * This node acts as a synchronization point. When used with { defer: true },
 * LangGraph waits for ALL incoming parallel branches to complete before
 * executing this node.
 *
 * @param {Object} state - Merged state from all parallel branches
 * @param {Object} config - Graph config
 * @returns {Object} Empty state update (synchronization only)
 */
async function joinParallelBranches(state, config) {
  console.log('[joinParallelBranches] All parallel branches complete');

  // Log what we received from each branch
  const evidenceCount = state.paperEvidence?.length || 0;
  const tokenCount = state.memoryTokens?.length || 0;
  const photoCount = state.sessionPhotos?.length || 0;
  const analysisCount = state.genericPhotoAnalyses?.analyses?.length || 0;
  const whiteboardDetected = state.whiteboardPhotoPath ? 'yes' : 'no';

  console.log(`[joinParallelBranches] Evidence: ${evidenceCount} items, Tokens: ${tokenCount}, Photos: ${photoCount}, Analyses: ${analysisCount}, Whiteboard: ${whiteboardDetected}`);

  return {
    currentPhase: PHASES.JOIN_PARALLEL
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EVALUATION CHECKPOINT NODES
// ═══════════════════════════════════════════════════════════════════════════
//
// These checkpoint nodes separate the interrupt logic from expensive evaluation.
// Evaluator nodes now ONLY evaluate and return evaluationHistory.
// These checkpoint nodes ONLY call interrupt() - no computation.
//
// This follows Single Responsibility Principle (SRP) and prevents the bug where
// evaluationHistory was lost when checkpointInterrupt() threw before return.

/**
 * Arc Selection Checkpoint
 *
 * Pauses for user to select which narrative arcs to include in the article.
 * Requires: state.narrativeArcs (from evaluateArcs with ready=true)
 *
 * @param {Object} state - Current state with narrativeArcs
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with selectedArcs
 */
async function checkpointArcSelection(state, config) {
  // Skip if already have selection (resume case)
  const skipCondition = state.selectedArcs?.length > 0
    ? state.selectedArcs
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.ARC_SELECTION,
    {
      narrativeArcs: state.narrativeArcs,
      evaluationHistory: state.evaluationHistory
    },
    skipCondition
  );

  // If resumed with selection, capture it in state return
  if (resumeValue?.selectedArcs && !skipCondition) {
    console.log(`[checkpointArcSelection] Captured selection from resume: ${resumeValue.selectedArcs.length} arcs`);
    return {
      selectedArcs: resumeValue.selectedArcs,
      currentPhase: PHASES.ARC_SELECTION
    };
  }

  return {
    currentPhase: PHASES.ARC_SELECTION
  };
}

/**
 * Outline Checkpoint
 *
 * Pauses for user to approve the article outline.
 * Requires: state.outline (from evaluateOutline with ready=true)
 *
 * @param {Object} state - Current state with outline
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with outlineApproved
 */
async function checkpointOutline(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state.outlineApproved === true
    ? true
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.OUTLINE,
    {
      outline: state.outline,
      evaluationHistory: state.evaluationHistory
    },
    skipCondition
  );

  // If resumed with approval, capture it in state return
  if (resumeValue?.outline === true && !skipCondition) {
    console.log(`[checkpointOutline] Captured approval from resume`);
    return {
      outlineApproved: true,
      currentPhase: PHASES.OUTLINE_CHECKPOINT
    };
  }

  return {
    currentPhase: PHASES.OUTLINE_CHECKPOINT
  };
}

/**
 * Article Checkpoint
 *
 * Pauses for user to approve the final article content.
 * Requires: state.contentBundle (from evaluateArticle with ready=true)
 *
 * @param {Object} state - Current state with contentBundle
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with articleApproved
 */
async function checkpointArticle(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state.articleApproved === true
    ? true
    : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.ARTICLE,
    {
      contentBundle: state.contentBundle,
      evaluationHistory: state.evaluationHistory
    },
    skipCondition
  );

  // If resumed with approval, capture it in state return
  if (resumeValue?.article === true && !skipCondition) {
    console.log(`[checkpointArticle] Captured approval from resume`);
    return {
      articleApproved: true,
      currentPhase: PHASES.ARTICLE_CHECKPOINT
    };
  }

  return {
    currentPhase: PHASES.ARTICLE_CHECKPOINT
  };
}

module.exports = {
  // Checkpoint nodes (wrapped with LangSmith tracing)
  checkpointPaperEvidence: traceNode(checkpointPaperEvidence, 'checkpointPaperEvidence', {
    stateFields: ['paperEvidence', 'selectedPaperEvidence']
  }),
  checkpointCharacterIds: traceNode(checkpointCharacterIds, 'checkpointCharacterIds', {
    stateFields: ['photoAnalyses', 'characterIdMappings']
  }),
  checkpointPreCuration: traceNode(checkpointPreCuration, 'checkpointPreCuration', {
    stateFields: ['preprocessedEvidence', 'preCurationApproved']
  }),
  checkpointAwaitRoster: traceNode(checkpointAwaitRoster, 'checkpointAwaitRoster', {
    stateFields: ['genericPhotoAnalyses', 'roster', 'whiteboardPhotoPath']
  }),
  checkpointAwaitContext: traceNode(checkpointAwaitContext, 'checkpointAwaitContext', {
    stateFields: ['rawSessionInput', 'roster']
  }),

  // Join node for parallel branches
  joinParallelBranches: traceNode(joinParallelBranches, 'joinParallelBranches', {
    stateFields: ['memoryTokens', 'paperEvidence', 'sessionPhotos', 'whiteboardPhotoPath']
  }),

  // Evaluation checkpoint nodes (SRP: separate from expensive evaluation)
  checkpointArcSelection: traceNode(checkpointArcSelection, 'checkpointArcSelection', {
    stateFields: ['narrativeArcs', 'selectedArcs', 'evaluationHistory']
  }),
  checkpointOutline: traceNode(checkpointOutline, 'checkpointOutline', {
    stateFields: ['outline', 'outlineApproved', 'evaluationHistory']
  }),
  checkpointArticle: traceNode(checkpointArticle, 'checkpointArticle', {
    stateFields: ['contentBundle', 'articleApproved', 'evaluationHistory']
  }),

  // Export for testing
  _testing: {
    checkpointPaperEvidence,
    checkpointCharacterIds,
    checkpointPreCuration,
    checkpointAwaitRoster,
    checkpointAwaitContext,
    joinParallelBranches,
    checkpointArcSelection,
    checkpointOutline,
    checkpointArticle
  }
};
