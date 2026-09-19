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
 * Input Review Checkpoint (CODE-REVIEW B2, B8)
 *
 * Pauses for the director to review the AI-parsed session input before the run
 * commits to it.
 *
 * WHY THIS IS ITS OWN NODE (B2): the interrupt used to live at the bottom of
 * parseRawInput, after three SDK calls and three file writes. LangGraph
 * re-executes an interrupted node from its top on resume, so every approve
 * re-paid the entire parse. The interrupt belongs in a node that does nothing
 * else (the SRP pattern every other checkpoint in this file follows).
 *
 * WHY IT GATES ON inputReviewApproved (B8): the old skip condition was
 * `sessionConfig.roster?.length > 0`, satisfied by the parse that had just run,
 * so the checkpoint never fired in any of the last five real sessions. The gate
 * now has its own approval channel.
 *
 * The parse OUTPUTS are deliberately not cleared by a rollback to this point:
 * loadDirectorNotes rehydrates sessionConfig/directorNotes from inputs/*.json on
 * every replay, so the checkpoint shows the restored parse. A REJECT with
 * corrections is what nulls them (here, immediately before parseRawInput) and
 * triggers the re-parse.
 *
 * @param {Object} state - Current state with the parse outputs
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with inputReviewApproved, _inputCorrections
 */
async function checkpointInputReview(state, config) {
  // Skip only when the director has explicitly approved this parse.
  const skipCondition = state.inputReviewApproved === true ? true : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.INPUT_REVIEW,
    {
      sessionConfig: state.sessionConfig,
      directorNotes: state.directorNotes,
      playerFocus: state.playerFocus,
      canonicalCharacters: state.canonicalCharacters || {}
    },
    skipCondition
  );

  if (skipCondition) {
    return {
      inputReviewApproved: true,
      currentPhase: PHASES.REVIEW_INPUT
    };
  }

  // Reject WITH corrections → re-parse. Null the parse outputs so parseRawInput
  // (which skips when sessionConfig is populated) actually re-runs.
  const feedback = typeof resumeValue?.feedback === 'string' ? resumeValue.feedback.trim() : '';
  if (resumeValue?.approved === false && feedback) {
    console.log('[checkpointInputReview] Rejected with corrections — re-parsing input');
    return {
      inputReviewApproved: false,
      _inputCorrections: feedback,
      sessionConfig: null,
      directorNotes: null,
      playerFocus: null,
      currentPhase: PHASES.REVIEW_INPUT
    };
  }

  // Approve (the only other resume shape the API produces). A reject with no
  // usable feedback is treated as an approve so the graph cannot loop forever.
  console.log('[checkpointInputReview] Parse approved');
  return {
    inputReviewApproved: true,
    _inputCorrections: null,
    currentPhase: PHASES.REVIEW_INPUT
  };
}

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
      genericPhotoAnalyses: state.photoAnalyses,
      whiteboardPhotoPath: state.whiteboardPhotoPath,
      canonicalCharacters: state.canonicalCharacters || {},
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
      rosterPronouns: resumeValue.rosterPronouns || {},
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
  // ROLL-4: gate on the first-class channels (not rawSessionInput sub-fields) so a
  // rollback that nulls them re-pauses here. parseRawInput reads these top-level too.
  const hasFullContext = state.accusation && state.sessionReport && state.directorNotesRaw;

  const skipCondition = hasFullContext ? true : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.AWAIT_FULL_CONTEXT,
    {
      roster: state.roster,
      whiteboardAnalysis: state.whiteboardAnalysis,
      previousFullContext: state._previousFullContext,  // ROLL-4: pre-fill on rollback re-collection
      message: 'Provide accusation, sessionReport, and directorNotes to continue'
    },
    skipCondition
  );

  // If resumed with fullContext data, capture it into the first-class channels.
  if (resumeValue?.fullContext && !skipCondition) {
    console.log(`[checkpointAwaitContext] Captured fullContext: accusation=${!!resumeValue.fullContext.accusation}, report=${!!resumeValue.fullContext.sessionReport}, notes=${!!resumeValue.fullContext.directorNotes}`);
    return {
      accusation: resumeValue.fullContext.accusation,
      sessionReport: resumeValue.fullContext.sessionReport,
      directorNotesRaw: resumeValue.fullContext.directorNotes,
      // ROLL-4 re-parse: null the parse OUTPUTS here so parseRawInput (next node, skips
      // when sessionConfig is populated) actually re-parses the re-collected inputs.
      // This runs AFTER loadDirectorNotes may have rehydrated stale sessionConfig/
      // directorNotes from inputs/*.json on the rollback replay — the clear-list alone
      // is defeated by that disk reload, so re-null them here, right before parseRawInput.
      sessionConfig: null,
      directorNotes: null,
      playerFocus: null,
      _previousFullContext: null,  // consumed — clear the pre-fill stash
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
  const analysisCount = state.photoAnalyses?.analyses?.length || 0;
  const whiteboardDetected = state.whiteboardPhotoPath ? 'yes' : 'no';

  console.log(`[joinParallelBranches] Evidence: ${evidenceCount} items, Tokens: ${tokenCount}, Photos: ${photoCount}, Analyses: ${analysisCount}, Whiteboard: ${whiteboardDetected}`);

  return {
    currentPhase: PHASES.JOIN_PARALLEL
  };
}

/**
 * Evidence and Photos Checkpoint
 *
 * Pauses for user to review curated three-layer evidence bundle and photo analyses.
 * Handles rescue of excluded paper evidence items.
 * Requires: state.evidenceBundle (from curateEvidenceBundle)
 *
 * SRP: This node contains ONLY the interrupt. Data generation happens in curateEvidenceBundle.
 *
 * @param {Object} state - Current state with evidenceBundle
 * @param {Object} config - Graph config
 * @returns {Object} Partial state update with _rescuedItems, _evidenceApproved, currentPhase
 */
async function checkpointEvidenceAndPhotos(state, config) {
  // Skip if already approved (resume case)
  const skipCondition = state._evidenceApproved ? state.evidenceBundle : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
    {
      evidenceBundle: state.evidenceBundle,
      _excludedItemsCache: state._excludedItemsCache
    },
    skipCondition
  );

  // Process rescue items if user specified any
  const rescuedItems = resumeValue?.rescuedItems || [];

  return {
    _rescuedItems: rescuedItems,
    _evidenceApproved: true,
    currentPhase: PHASES.CURATE_EVIDENCE
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

  // Approve: resumed with arc selection
  if (resumeValue?.selectedArcs && !skipCondition) {
    console.log(`[checkpointArcSelection] Approved with ${resumeValue.selectedArcs.length} arcs selected`);
    return {
      selectedArcs: resumeValue.selectedArcs,
      currentPhase: PHASES.ARC_SELECTION
    };
  }

  // Reject with feedback — routing function sends to revision loop
  if (resumeValue?.approved === false && resumeValue?.feedback) {
    console.log(`[checkpointArcSelection] Rejected by human with feedback`);
    return {
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

  // Approve (with or without edits — edits applied via Command update before this runs)
  if (resumeValue?.approved === true && !skipCondition) {
    console.log(`[checkpointOutline] Approved by human`);
    return {
      outlineApproved: true,
      currentPhase: PHASES.OUTLINE_CHECKPOINT
    };
  }

  // Reject with feedback — routing function sends to revision loop
  if (resumeValue?.approved === false && resumeValue?.feedback) {
    console.log(`[checkpointOutline] Rejected by human with feedback`);
    return {
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

  // Approve (with or without edits — edits applied via Command update before this runs)
  if (resumeValue?.approved === true && !skipCondition) {
    console.log(`[checkpointArticle] Approved by human`);
    return {
      articleApproved: true,
      currentPhase: PHASES.ARTICLE_CHECKPOINT
    };
  }

  // Reject with feedback — routing function sends to revision loop
  if (resumeValue?.approved === false && resumeValue?.feedback) {
    console.log(`[checkpointArticle] Rejected by human with feedback`);
    return {
      currentPhase: PHASES.ARTICLE_CHECKPOINT
    };
  }

  return {
    currentPhase: PHASES.ARTICLE_CHECKPOINT
  };
}

module.exports = {
  // Checkpoint nodes (wrapped with LangSmith tracing)
  checkpointInputReview: traceNode(checkpointInputReview, 'checkpointInputReview', {
    stateFields: ['sessionConfig', 'directorNotes', 'playerFocus', 'inputReviewApproved']
  }),
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
    stateFields: ['photoAnalyses', 'roster', 'whiteboardPhotoPath']
  }),
  checkpointAwaitContext: traceNode(checkpointAwaitContext, 'checkpointAwaitContext', {
    stateFields: ['accusation', 'sessionReport', 'directorNotesRaw', 'roster']
  }),

  // Join node for parallel branches
  joinParallelBranches: traceNode(joinParallelBranches, 'joinParallelBranches', {
    stateFields: ['memoryTokens', 'paperEvidence', 'sessionPhotos', 'whiteboardPhotoPath']
  }),

  // Evidence curation checkpoint (SRP: separate from curateEvidenceBundle data node)
  checkpointEvidenceAndPhotos: traceNode(checkpointEvidenceAndPhotos, 'checkpointEvidenceAndPhotos', {
    stateFields: ['evidenceBundle', '_excludedItemsCache', '_evidenceApproved']
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
    checkpointInputReview,
    checkpointPaperEvidence,
    checkpointCharacterIds,
    checkpointPreCuration,
    checkpointAwaitRoster,
    checkpointAwaitContext,
    joinParallelBranches,
    checkpointEvidenceAndPhotos,
    checkpointArcSelection,
    checkpointOutline,
    checkpointArticle
  }
};
