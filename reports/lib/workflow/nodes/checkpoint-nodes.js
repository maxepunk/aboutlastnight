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
const { isWeave, isMeetingApproved, MEETING_ROUNDS } = require('../../weave');

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
 * @returns {Object} Partial state update with inputReviewApproved, _inputCorrections,
 *   inputReviewCorrections (brief 2.2: the session's corrections, in order)
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
    // Brief 2.2: the correction is also kept for the session, in order, after every
    // earlier one. `_inputCorrections` is consumed by the re-parse; this list is what
    // every later parse and every writer reads.
    const kept = Array.isArray(state.inputReviewCorrections) ? state.inputReviewCorrections : [];
    return {
      inputReviewApproved: false,
      _inputCorrections: feedback,
      inputReviewCorrections: [...kept, feedback],
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
 * The director's per-photo descriptions from a character-IDs resume, written to the
 * session folder (phase 2, brief 2.2).
 *
 * The server has already validated the map and put it in state through the Command
 * update (buildResumePayload); this re-captures it, as the node does for the IDs
 * themselves, and writes data/<id>/inputs/photo-descriptions.json beside the parse's
 * inputs/*.json. A failed write throws: the record would otherwise exist in state only.
 *
 * @param {Object} state
 * @param {Object} config - may carry configurable.dataDir
 * @param {Object|undefined} descriptions - {filename: text}
 * @returns {Object|null} the map, or null when the resume carried none
 */
function capturePhotoDescriptions(state, config, descriptions) {
  if (!descriptions || typeof descriptions !== 'object' || Array.isArray(descriptions)) return null;
  if (Object.keys(descriptions).length === 0) return null;
  const sessionId = state.sessionId || config?.configurable?.sessionId;
  if (sessionId) {
    const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
    const inputsDir = path.join(dataDir, sessionId, 'inputs');
    fs.mkdirSync(inputsDir, { recursive: true });
    fs.writeFileSync(
      path.join(inputsDir, 'photo-descriptions.json'),
      JSON.stringify(descriptions, null, 2),
      'utf-8'
    );
    console.log(`[checkpointCharacterIds] Wrote ${Object.keys(descriptions).length} photo description(s) to ${inputsDir}`);
  } else {
    console.warn('[checkpointCharacterIds] No sessionId; photo descriptions kept in state only');
  }
  return descriptions;
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
  // C5, then brief 4.5 (R2): this gate runs behind the story meeting, and every later
  // stage works from the weave the meeting settled. A thread that reaches it with no weave
  // was started on an older graph: before the story meeting (arcs, no weave), or before the
  // photo late-join (this gate ran before arc analysis). A paused write survives the
  // rewiring (a plain edge is a channel named after the TARGET node), so its first Resume
  // fires this node, and its outgoing writes then follow the new graph into stages that
  // need a weave, and pay for them. Stop here instead, with the recovery in the message:
  // the rollback to the story meeting keeps the parse, the curation and the photos, and
  // writes the weave fresh.
  if (!isWeave(state.weave)) {
    throw new Error(
      '[checkpointCharacterIds] Reached with no weave: this thread was started before the story ' +
      'meeting existed. Roll back to the story meeting (arc-selection): the rollback keeps the ' +
      'parse, the curation and the photos, and writes the weave fresh for the meeting.'
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
  // Brief 2.2: either one may carry the director's per-photo descriptions beside it;
  // they are captured the same way and written to the session folder.
  // Brief 4.2: the leave-out choices ride beside them too. buildResumePayload also writes
  // them through the update, which is what keeps them on the structured path, where this
  // node skips on the mappings.
  if (!skipCondition) {
    const photoDescriptions = capturePhotoDescriptions(state, config, resumeValue?.photoDescriptions);
    const leftOut = Array.isArray(resumeValue?.leftOutPhotos) ? { leftOutPhotos: resumeValue.leftOutPhotos } : {};
    if (resumeValue?.characterIdMappings) {
      console.log(`[checkpointCharacterIds] Captured mappings from resume`);
      return {
        characterIdMappings: resumeValue.characterIdMappings,
        ...(photoDescriptions && { photoDescriptions }),
        ...leftOut,
        currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
      };
    }
    if (resumeValue?.characterIdsRaw) {
      console.log(`[checkpointCharacterIds] Captured raw character IDs from resume`);
      return {
        characterIdsRaw: resumeValue.characterIdsRaw,
        ...(photoDescriptions && { photoDescriptions }),
        ...leftOut,
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
 * Write the weave the director approved at the story meeting to the session folder
 * (brief 4.5; R8): `data/<id>/analysis/weave.approved.json`, beside the map's and the
 * article's approved versions, for the readout that asks whether the story changed after
 * the meeting (spec section 13). The update the payload sends is applied before this node
 * re-executes, so state.weave here is the weave as the director left it. The session id is
 * the state's; a failed write is logged and never costs the director the approval.
 *
 * @param {Object} state
 * @param {Object} config - may carry configurable.dataDir
 */
function writeApprovedWeave(state, config) {
  const sessionId = state.sessionId || config?.configurable?.sessionId;
  if (!sessionId) {
    console.warn('[checkpointArcSelection] No sessionId; not writing the approved weave');
    return;
  }
  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const analysisDir = path.join(dataDir, String(sessionId), 'analysis');
  const target = path.join(analysisDir, 'weave.approved.json');
  try {
    fs.mkdirSync(analysisDir, { recursive: true });
    fs.writeFileSync(target, JSON.stringify(state.weave ?? null, null, 2), 'utf-8');
    console.log(`[checkpointArcSelection] Approved weave written to ${target}`);
  } catch (error) {
    console.error(`[checkpointArcSelection] Could not write ${target}: ${error.message}`);
  }
}

/**
 * The story meeting's stop (phase 4, brief 4.5; spec 4.3 and 4.4): the arc stop, where the
 * director settles the weave.
 *
 * It shows the weave and pauses until the director acts. The payload (server.js
 * buildResumePayload, lib/meeting.js meetingResume) has already written the weave as the
 * director left it and the standing edits through the update, which LangGraph applies
 * before this node re-executes; the resume value says which action it was:
 * - an approve (`{approved: true}`): this node sets the meeting's approval, which every
 *   arc-stage skip reads (lib/weave.js isMeetingApproved), ends the round's report and
 *   marks, and writes the approved weave. The standing edits and their baseline stay: they
 *   stand past approve (K3);
 * - a reweave or a send-back (`{round}`): the director's round, marked, which the route
 *   takes to the rework.
 * Anything else is a resume the meeting does not know, and fails loud. Skips once the
 * meeting is approved, so a replay passes through.
 *
 * @param {Object} state - Current state with the weave
 * @param {Object} config - Graph config, with configurable.dataDir for the approved weave
 * @returns {Object} Partial state update
 */
async function checkpointArcSelection(state, config) {
  const skipCondition = isMeetingApproved(state) ? true : null;

  const resumeValue = checkpointInterrupt(
    CHECKPOINT_TYPES.ARC_SELECTION,
    { weave: state.weave },
    skipCondition
  );

  if (skipCondition) {
    return { currentPhase: PHASES.ARC_SELECTION };
  }

  if (resumeValue?.approved === true) {
    console.log('[checkpointArcSelection] The story meeting is approved');
    writeApprovedWeave(state, config);
    return {
      meetingApproved: true,
      _meetingRound: null,
      _weaveHandEditReport: null,
      _weaveMarks: null,
      currentPhase: PHASES.ARC_SELECTION
    };
  }

  if (MEETING_ROUNDS.includes(resumeValue?.round)) {
    console.log(`[checkpointArcSelection] The director asked for a ${resumeValue.round}`);
    return {
      _meetingRound: resumeValue.round,
      currentPhase: PHASES.ARC_SELECTION
    };
  }

  throw new Error(`[checkpointArcSelection] The story meeting resumed with neither an approval nor a round: it takes approve, reweave or send-back (got ${JSON.stringify(resumeValue)}).`);
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
      // Spec 2026-09-19 §4.4: the director's hand-edit diff and the rework report belong
      // to this gate only; the revisers keep them for the whole round (C3), so the gate
      // is where they end.
      _outlineHandEdits: null,
      _outlineHandEditReport: null,
      // Brief 2.7 (integrator ruling): the trace describes the current round, and
      // approval ends it. The llm-log keeps every pass for a later readout.
      _outlineTrace: null,
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
 * Write the bundle the director approved to the session folder (brief 1.6).
 *
 * The writer's last version lives in the checkpoint database and the published
 * report is rendered HTML, so the director's approved version — edits included —
 * existed nowhere a run could be read back from afterwards.
 *
 * The session id comes from the state, never from the bundle: parseRawInput's
 * post-mortem (input-nodes.js) is a model-supplied id that wrote session 071126's
 * inputs to data/0711/. A failed write is logged and swallowed; the file is a side
 * effect of the stop, not its product, and must never cost the director an approval.
 *
 * @param {Object} state - Current state with sessionId and contentBundle
 * @param {Object} config - Graph config with optional configurable.dataDir
 */
function writeApprovedBundle(state, config) {
  const sessionId = state.sessionId || config?.configurable?.sessionId;
  if (!sessionId) {
    console.warn('[checkpointArticle] No sessionId; not writing the approved bundle');
    return;
  }

  const dataDir = config?.configurable?.dataDir || DEFAULT_DATA_DIR;
  const outputDir = path.join(dataDir, String(sessionId), 'output');
  const target = path.join(outputDir, 'content-bundle.approved.json');

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(target, JSON.stringify(state.contentBundle ?? null, null, 2), 'utf-8');
    console.log(`[checkpointArticle] Approved bundle written to ${target}`);
  } catch (error) {
    console.error(`[checkpointArticle] Could not write ${target}: ${error.message}`);
  }
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
    writeApprovedBundle(state, config);
    return {
      articleApproved: true,
      // Spec 2026-09-19 §4.4: the director's hand-edit diff and the rework report belong
      // to this gate only; the revisers keep them for the whole round (C3), so the gate
      // is where they end.
      _articleHandEdits: null,
      _articleHandEditReport: null,
      // Brief 2.7 (integrator ruling): approval ends the round the trace describes.
      _articleTrace: null,
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
    stateFields: ['weave', 'meetingApproved', '_meetingRound']
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
