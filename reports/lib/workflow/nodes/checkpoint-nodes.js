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

const fs = require('fs');
const path = require('path');
const { PHASES } = require('../state');
const { CHECKPOINT_TYPES, checkpointInterrupt } = require('../checkpoint-helpers');
const { traceNode } = require('../../observability');

// Same convention as fetch-nodes.js / photo-nodes.js / input-nodes.js.
const DEFAULT_DATA_DIR = path.join(__dirname, '..', '..', '..', 'data');

// Same extension list fetchSessionPhotos scans with.
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

/** Images directly in `dir`, or 0 when the directory is missing or unreadable. */
function countImages(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => IMAGE_EXTENSIONS.includes(path.extname(f).toLowerCase()))
      .length;
  } catch {
    return 0;
  }
}

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
 * Photos Checkpoint (photo late-join)
 *
 * The head of the photo branch, reached from checkpointArcSelection's `forward`
 * leg. It exists so a session can be started, parsed, curated and arc-analysed
 * with no photos at all while the director curates and cleans them.
 *
 * SKIP SIGNAL: `state.photosPath`, and nothing else (C1/C2). It does NOT read the
 * filesystem to decide. preprocessPhotos copies every photo into
 * `data/<id>/photos`, so a `found > 0` skip could never fire again after a first
 * run — and because ROLLBACK_CLEARS['photos'] nulls photosPath, this gate ALWAYS
 * re-asks on a rollback to it. `found` is reported for information only.
 *
 * PRE-FILL: `state.photosPath || state._previousPhotosPath ||
 * state.rawSessionInput?.photosPath` (R4 + v2 M1). All three are DISPLAY ONLY —
 * none can make this gate skip or redirect fetchSessionPhotos, which reads
 * state.photosPath alone. The purpose is that a thread which supplied a path at
 * start (including every thread started on the previous graph) stops here once,
 * pre-filled and answered with one click; and that a rollback after a gate-time
 * CORRECTION offers the corrected path, not the original typo, because /rollback
 * stashes the cleared value in _previousPhotosPath.
 *
 * NO CAPTURE BRANCH (v2 I2): this node never writes photosPath. /approve invokes
 * Command({resume, update: stateUpdates}) and the update is applied BEFORE the
 * interrupted node re-executes (F25), so on re-execution state.photosPath already
 * holds the approved value, skipCondition is truthy, and a capture branch would be
 * unreachable on every HTTP path (console and harness alike) — the ROLL-4
 * dead-branch pattern. `buildResumePayload`'s photos arm is the writer: it
 * validates the folder, writes the channel, and nulls the consumed pre-fill stash.
 *
 * @param {Object} state - Current state with sessionId, photosPath
 * @param {Object} config - Graph config with optional configurable.dataDir
 * @returns {Object} Partial state update with currentPhase
 */
async function checkpointPhotos(state, config) {
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const defaultDir = path.join(dataDir, state.sessionId, 'photos');

  const skipCondition = state.photosPath ? state.photosPath : null;

  checkpointInterrupt(
    CHECKPOINT_TYPES.PHOTOS,
    {
      photosPath: state.photosPath || state._previousPhotosPath || state.rawSessionInput?.photosPath || null,
      defaultDir,
      found: countImages(defaultDir),
      sessionId: state.sessionId
    },
    skipCondition
  );

  return { currentPhase: PHASES.PHOTOS };
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
  // C5: this gate moved BEHIND arc selection. A thread paused here on the previous
  // graph fires this node on its first Resume (a plain edge is a channel named
  // after the TARGET node, so the pending write survives the rewiring), and its
  // outgoing writes then follow the NEW graph: straight into
  // buildArcEvidencePackages with zero arcs and a paid generateOutline +
  // evaluateOutline, pausing at `outline` on an outline for no arcs. Stop here
  // instead, with the recovery in the message.
  //
  // v2 I1: the discriminator is whether arcs were ever ANALYSED, not whether any
  // were SELECTED. routeAfterArcCheckpoint forces `forward` with an empty
  // selection once the human revision cap is reached, and that legitimate path now
  // runs through this gate; keying on selectedArcs would kill it with a false
  // message and the wrong recovery.
  //
  // `narrativeArcs` alone is not enough either: validateArcStructure FILTERS arcs
  // with no evidence and no characters, and routeArcValidation/routeArcEvaluation
  // deliberately escalate a 0-arc result to the human gate rather than revise
  // futilely — so a genuinely analysed run can arrive here with narrativeArcs: []
  // and no _previousArcs stash. Two more signals cover that:
  //   - `_arcAnalysisCache`, written by analyzeArcsPlayerFocusGuided itself;
  //   - an `arcs` entry in evaluationHistory, which every new-graph path to this
  //     gate has (checkpointArcSelection is only reachable via evaluateArcs).
  // Both are cleared by every rollback list that clears narrativeArcs and by a
  // fresh start, so they say "the arc phase ran on THIS graph" without saying
  // anything about how many arcs survived. An old-graph thread paused at
  // character-ids (phase 1.66, upstream of all of it) has none of the four.
  const arcPhaseRan = Boolean(
    state.narrativeArcs?.length
    || state._previousArcs?.length
    || state._arcAnalysisCache
    || (state.evaluationHistory || []).some(entry => entry?.phase === 'arcs')
  );
  if (!arcPhaseRan) {
    throw new Error(
      '[checkpointCharacterIds] Reached before any arc analysis has run. This thread was started ' +
      'on the previous graph, where character-ids ran before arc analysis. Roll back to ' +
      'await-full-context and re-run from there (a rollback replays from START, so nothing ' +
      'already collected is lost).'
    );
  }

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
 * Enables: the pronoun authority for every downstream reference, and the
 * character ID mapping that runs later in the Phase 2.36 photo branch — which is
 * why a rollback to this point clears photoAnalyses + characterIdMappings.
 *
 * @param {Object} state - Current state with roster and canonicalCharacters
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
      // M3: no photo keys. The photo chain runs after arc selection now, so
      // photoAnalyses and whiteboardPhotoPath are necessarily empty at this gate
      // and the console rendered two permanently-empty sections from them.
      canonicalCharacters: state.canonicalCharacters || {},
      message: 'Provide the roster (names and pronouns). Photos are not needed yet.'
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
  checkpointPhotos: traceNode(checkpointPhotos, 'checkpointPhotos', {
    stateFields: ['photosPath', 'sessionPhotos']
  }),
  checkpointCharacterIds: traceNode(checkpointCharacterIds, 'checkpointCharacterIds', {
    stateFields: ['photoAnalyses', 'characterIdMappings']
  }),
  checkpointPreCuration: traceNode(checkpointPreCuration, 'checkpointPreCuration', {
    stateFields: ['preprocessedEvidence', 'preCurationApproved']
  }),
  checkpointAwaitRoster: traceNode(checkpointAwaitRoster, 'checkpointAwaitRoster', {
    stateFields: ['roster', 'rosterPronouns', 'canonicalCharacters']
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
    checkpointPhotos,
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
