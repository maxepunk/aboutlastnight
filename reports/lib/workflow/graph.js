/**
 * Report Generation Graph - Commit 8.9.5: Input Layer + File-Based Specialists + Character IDs
 *
 * Assembles the complete LangGraph StateGraph for report generation.
 * Connects all nodes with edges, conditional routing, and checkpointing.
 *
 * Graph Flow (23 nodes - Commit 8.9.5):
 *
 * PHASE 0: Input Parsing (Commit 8.9 - conditional entry)
 * START → [conditional] → parseRawInput OR initializeSession
 * 0.1 parseRawInput → [checkpoint: input-review] → 0.2 finalizeInput
 *
 * PHASE 1: Data Acquisition
 * 1.1 initializeSession → 1.2 loadDirectorNotes → 1.3 fetchMemoryTokens
 * → 1.4 fetchPaperEvidence → [checkpoint: paper-evidence-selection] → 1.5 fetchSessionPhotos
 *
 * PHASE 1.6-1.8: Early Processing
 * → 1.65 analyzePhotos (Haiku vision) → [checkpoint: character-ids] → 1.67 finalizePhotoAnalyses
 * → 1.7 preprocessEvidence → 1.8 curateEvidenceBundle → [checkpoint: evidence-and-photos]
 *
 * PHASE 2: Arc Analysis (Orchestrated Subagents - Commit 8.8/8.9)
 * → 2 analyzeArcs (orchestrator with 3 file-based subagents) → 2.3 evaluateArcs → [revision loop]
 * → [checkpoint: arc-selection]
 *
 * PHASE 3: Outline Generation
 * → 3.1 generateOutline → 3.2 evaluateOutline → [revision loop]
 * → [checkpoint: outline]
 *
 * PHASE 4: Article Generation
 * → 4.1 generateContentBundle → 4.2 evaluateArticle → [revision loop]
 * → [checkpoint: article] → 4.3 validateContentBundle
 *
 * PHASE 5: Assembly
 * → 5 assembleHtml → COMPLETE
 *
 * Checkpointing:
 * - MemorySaver for testing (in-memory)
 * - SqliteSaver for production (persistent)
 *
 * See ARCHITECTURE_DECISIONS.md 8.8/8.9 for design rationale.
 */

const { StateGraph, START, END, MemorySaver } = require('@langchain/langgraph');
const { ReportStateAnnotation, PHASES, APPROVAL_TYPES, REVISION_CAPS } = require('./state');
const nodes = require('./nodes');

// ═══════════════════════════════════════════════════════════════════════════
// ROUTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Route function for conditional entry (Commit 8.9)
 * Determines whether to parse raw input or skip to initialization
 *
 * Decision logic:
 * - If rawSessionInput exists and sessionConfig doesn't → parse raw input
 * - If rawSessionInput exists but sessionConfig does → input already parsed, skip to init
 * - If no rawSessionInput → assume pre-populated files, skip to init
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'parseInput' or 'initialize'
 */
function routeEntryPoint(state) {
  const hasRawInput = state.rawSessionInput !== null && state.rawSessionInput !== undefined;
  // sessionConfig defaults to {} so check if it has actual content
  const hasSessionConfig = state.sessionConfig && Object.keys(state.sessionConfig).length > 0;

  // If raw input provided but not yet parsed → parse it
  if (hasRawInput && !hasSessionConfig) {
    console.log('[routeEntryPoint] Raw input detected, routing to parseRawInput');
    return 'parseInput';
  }

  // Otherwise skip to initialization (pre-populated files or resume)
  console.log('[routeEntryPoint] No raw input or already parsed, routing to initializeSession');
  return 'initialize';
}

/**
 * Route function for input review approval checkpoint (Commit 8.9)
 * After raw input is parsed, user reviews before proceeding
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeInputReview(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route function for paper evidence selection checkpoint (Commit 8.9.4)
 * After paper evidence is fetched, user selects which items were unlocked
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routePaperEvidenceSelection(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route function for character ID checkpoint (Commit 8.9.5)
 * After photo analysis, user provides character-to-photo mappings
 *
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeCharacterIdCheckpoint(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route function for evidence+photos approval checkpoint
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeEvidenceApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route function for arc evaluation results
 * Returns 'checkpoint' if ready for human, 'revise' if needs work, 'error' on failure
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArcEvaluation(state) {
  // Check for errors
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  // Check if evaluation says ready or hit revision cap
  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.arcRevisionCount || 0) >= REVISION_CAPS.ARCS;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for outline evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeOutlineEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.outlineRevisionCount || 0) >= REVISION_CAPS.OUTLINE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for article evaluation results
 * @param {Object} state - Current graph state
 * @returns {string} 'checkpoint', 'revise', or 'error'
 */
function routeArticleEvaluation(state) {
  if (state.currentPhase === PHASES.ERROR) {
    return 'error';
  }

  const evalHistory = state.evaluationHistory || [];
  const lastEval = evalHistory[evalHistory.length - 1];
  const atCap = (state.articleRevisionCount || 0) >= REVISION_CAPS.ARTICLE;

  if (lastEval?.ready || atCap) {
    return 'checkpoint';
  }

  return 'revise';
}

/**
 * Route function for schema validation
 * @param {Object} state - Current graph state
 * @returns {string} 'error' or 'continue'
 */
function routeSchemaValidation(state) {
  const hasErrors = state.errors && state.errors.some(e => e.type === 'schema-validation');
  return hasErrors ? 'error' : 'continue';
}

/**
 * Route after arc selection approval
 * Continues to outline generation
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeArcSelectionApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route after outline approval
 * Continues to article generation
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeOutlineApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

/**
 * Route after article approval
 * Continues to schema validation and assembly
 * @param {Object} state - Current graph state
 * @returns {string} 'wait' or 'continue'
 */
function routeArticleApproval(state) {
  return state.awaitingApproval ? 'wait' : 'continue';
}

// ═══════════════════════════════════════════════════════════════════════════
// WRAPPER NODES FOR APPROVAL CHECKPOINTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Set paper evidence selection checkpoint (Commit 8.9.4)
 * Called after paper evidence is fetched
 * Skips if selectedPaperEvidence already exists (resume case)
 */
async function setPaperEvidenceCheckpoint(state) {
  // Skip if evidence already selected (resume after approval)
  if (state.selectedPaperEvidence && state.selectedPaperEvidence.length > 0) {
    console.log('[setPaperEvidenceCheckpoint] Skipping - selectedPaperEvidence already exists');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.SELECT_PAPER_EVIDENCE
    };
  }

  // Skip if no paper evidence to select from
  if (!state.paperEvidence || state.paperEvidence.length === 0) {
    console.log('[setPaperEvidenceCheckpoint] Skipping - no paper evidence available');
    return {
      awaitingApproval: false,
      selectedPaperEvidence: [],
      currentPhase: PHASES.SELECT_PAPER_EVIDENCE
    };
  }

  console.log(`[setPaperEvidenceCheckpoint] Waiting for user to select from ${state.paperEvidence.length} evidence items`);
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.PAPER_EVIDENCE_SELECTION,
    currentPhase: PHASES.SELECT_PAPER_EVIDENCE
  };
}

/**
 * Set character ID checkpoint (Commit 8.9.5)
 * Called after photo analysis, user provides character-to-photo mappings
 * Skips if characterIdMappings already exists (resume case)
 * Skips if no photos to identify (empty photoAnalyses)
 */
async function setCharacterIdCheckpoint(state) {
  // Skip if character IDs already provided (empty object means user skipped mappings)
  // Check for explicit existence (null/undefined = not yet provided, {} = user skipped)
  if (state.characterIdMappings !== undefined && state.characterIdMappings !== null) {
    const mappingCount = Object.keys(state.characterIdMappings).length;
    console.log(`[setCharacterIdCheckpoint] Skipping - characterIdMappings provided (${mappingCount} mappings)`);
    return {
      awaitingApproval: false,
      currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
    };
  }

  // Skip if natural language input provided (Commit 8.9.x)
  // parseCharacterIds node will convert to structured format
  if (state.characterIdsRaw) {
    console.log(`[setCharacterIdCheckpoint] Skipping - characterIdsRaw provided (${state.characterIdsRaw.length} chars)`);
    return {
      awaitingApproval: false,
      currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
    };
  }

  // Skip if no photo analyses to map characters to
  if (!state.photoAnalyses || !state.photoAnalyses.analyses || state.photoAnalyses.analyses.length === 0) {
    console.log('[setCharacterIdCheckpoint] Skipping - no photo analyses available');
    return {
      awaitingApproval: false,
      characterIdMappings: {},  // Empty mappings
      currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
    };
  }

  console.log(`[setCharacterIdCheckpoint] Waiting for user to identify characters in ${state.photoAnalyses.analyses.length} photos`);
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.CHARACTER_IDS,
    currentPhase: PHASES.CHARACTER_ID_CHECKPOINT
  };
}

/**
 * Set arc selection approval checkpoint
 * Called after arc evaluation passes or hits revision cap
 * Skips if selectedArcs already exist (resume case)
 */
async function setArcSelectionCheckpoint(state) {
  // Skip if arcs already selected (resume after approval)
  if (state.selectedArcs && state.selectedArcs.length > 0) {
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARC_EVALUATION
    };
  }

  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARC_SELECTION,
    currentPhase: PHASES.ARC_EVALUATION
  };
}

/**
 * Set outline approval checkpoint
 * Called after outline evaluation passes or hits revision cap
 *
 * Detection logic:
 * 1. If contentBundle exists → already past approval, continue
 * 2. If user approved THIS checkpoint (awaitingApproval=false AND approvalType=OUTLINE) → continue
 * 3. Otherwise → wait for approval (set approvalType to mark this checkpoint)
 *
 * Key insight: approvalType identifies WHICH checkpoint is active.
 * After arc approval, approvalType is still ARC_SELECTION, not OUTLINE.
 * Only when user approves the outline checkpoint does awaitingApproval=false WITH approvalType=OUTLINE.
 */
async function setOutlineCheckpoint(state) {
  // Skip if content already generated (resume after approval completed)
  if (state.contentBundle) {
    console.log('[setOutlineCheckpoint] Skipping - contentBundle already exists');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.OUTLINE_EVALUATION
    };
  }

  // Check if user approved THIS checkpoint
  // - awaitingApproval=false means user sent approval
  // - approvalType=OUTLINE means this specific checkpoint was waiting
  // - outlineEval.ready means outline passed evaluation
  const evalHistory = state.evaluationHistory || [];
  const outlineEval = evalHistory.find(e => e.phase === 'outline' && e.ready === true);
  if (state.awaitingApproval === false &&
      state.approvalType === APPROVAL_TYPES.OUTLINE &&
      outlineEval &&
      state.outline) {
    console.log('[setOutlineCheckpoint] User approved outline, continuing to article generation');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.OUTLINE_EVALUATION
    };
  }

  // First time at checkpoint - wait for approval
  console.log('[setOutlineCheckpoint] Waiting for user approval');
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.OUTLINE,
    currentPhase: PHASES.OUTLINE_EVALUATION
  };
}

/**
 * Set article approval checkpoint
 * Called after article evaluation passes or hits revision cap
 *
 * Detection logic:
 * 1. If assembledHtml exists → already past approval, continue
 * 2. If user approved THIS checkpoint (awaitingApproval=false AND approvalType=ARTICLE) → continue
 * 3. Otherwise → wait for approval (set approvalType to mark this checkpoint)
 */
async function setArticleCheckpoint(state) {
  // Skip if HTML already assembled (resume after approval completed)
  if (state.assembledHtml) {
    console.log('[setArticleCheckpoint] Skipping - assembledHtml already exists');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARTICLE_EVALUATION
    };
  }

  // Check if user approved THIS checkpoint
  // - awaitingApproval=false means user sent approval
  // - approvalType=ARTICLE means this specific checkpoint was waiting
  // - articleEval.ready means article passed evaluation
  const evalHistory = state.evaluationHistory || [];
  const articleEval = evalHistory.find(e => e.phase === 'article' && e.ready === true);
  if (state.awaitingApproval === false &&
      state.approvalType === APPROVAL_TYPES.ARTICLE &&
      articleEval &&
      state.contentBundle) {
    console.log('[setArticleCheckpoint] User approved article, continuing to schema validation');
    return {
      awaitingApproval: false,
      currentPhase: PHASES.ARTICLE_EVALUATION
    };
  }

  // First time at checkpoint - wait for approval
  console.log('[setArticleCheckpoint] Waiting for user approval');
  return {
    awaitingApproval: true,
    approvalType: APPROVAL_TYPES.ARTICLE,
    currentPhase: PHASES.ARTICLE_EVALUATION
  };
}

/**
 * Increment arc revision count and clear arcs for re-analysis
 * Clears narrativeArcs so analyzeArcs skip logic doesn't trigger
 */
async function incrementArcRevision(state) {
  console.log(`[incrementArcRevision] Incrementing count to ${(state.arcRevisionCount || 0) + 1}, clearing arcs for regeneration`);
  return {
    arcRevisionCount: (state.arcRevisionCount || 0) + 1,
    narrativeArcs: null, // Clear for regeneration (replaceReducer now handles null)
    awaitingApproval: false
  };
}

/**
 * Increment outline revision count and clear outline for regeneration
 * Clears outline so generateOutline skip logic doesn't trigger
 */
async function incrementOutlineRevision(state) {
  console.log(`[incrementOutlineRevision] Incrementing count to ${(state.outlineRevisionCount || 0) + 1}, clearing outline for regeneration`);
  return {
    outlineRevisionCount: (state.outlineRevisionCount || 0) + 1,
    outline: null, // Clear for regeneration
    awaitingApproval: false
  };
}

/**
 * Increment article revision count and clear content for regeneration
 * Clears contentBundle and assembledHtml so generateContentBundle skip logic doesn't trigger
 */
async function incrementArticleRevision(state) {
  console.log(`[incrementArticleRevision] Incrementing count to ${(state.articleRevisionCount || 0) + 1}, clearing content for regeneration`);
  return {
    articleRevisionCount: (state.articleRevisionCount || 0) + 1,
    contentBundle: null, // Clear for regeneration
    assembledHtml: null, // Clear assembled output too
    awaitingApproval: false
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH BUILDER
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create the report generation StateGraph
 *
 * @returns {Object} Uncompiled StateGraph builder
 */
function createGraphBuilder() {
  const builder = new StateGraph(ReportStateAnnotation);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 0: Input Parsing (Commit 8.9)
  // ═══════════════════════════════════════════════════════

  builder.addNode('parseRawInput', nodes.parseRawInput);
  builder.addNode('finalizeInput', nodes.finalizeInput);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1: Data Acquisition
  // ═══════════════════════════════════════════════════════

  builder.addNode('initializeSession', nodes.initializeSession);
  builder.addNode('loadDirectorNotes', nodes.loadDirectorNotes);
  builder.addNode('fetchMemoryTokens', nodes.fetchMemoryTokens);
  builder.addNode('fetchPaperEvidence', nodes.fetchPaperEvidence);
  builder.addNode('setPaperEvidenceCheckpoint', setPaperEvidenceCheckpoint);  // Commit 8.9.4
  builder.addNode('fetchSessionPhotos', nodes.fetchSessionPhotos);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 1.6-1.8: Early Processing
  // ═══════════════════════════════════════════════════════

  builder.addNode('analyzePhotos', nodes.analyzePhotos);
  builder.addNode('setCharacterIdCheckpoint', setCharacterIdCheckpoint);  // Commit 8.9.5
  builder.addNode('parseCharacterIds', nodes.parseCharacterIds);          // Commit 8.9.x: parse natural language
  builder.addNode('finalizePhotoAnalyses', nodes.finalizePhotoAnalyses);  // Commit 8.9.5
  builder.addNode('preprocessEvidence', nodes.preprocessEvidence);
  builder.addNode('curateEvidenceBundle', nodes.curateEvidenceBundle);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 2: Arc Analysis (Orchestrated Subagents - Commit 8.8)
  // ═══════════════════════════════════════════════════════

  // Single orchestrator node replaces 4 sequential nodes (Commit 8.8)
  // Orchestrator coordinates 3 specialist subagents and synthesizes results
  builder.addNode('analyzeArcs', nodes.analyzeArcsWithSubagents);

  // Arc evaluation
  builder.addNode('evaluateArcs', nodes.evaluateArcs);

  // Arc revision handling
  builder.addNode('setArcSelectionCheckpoint', setArcSelectionCheckpoint);
  builder.addNode('incrementArcRevision', incrementArcRevision);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateOutline', nodes.generateOutline);
  builder.addNode('evaluateOutline', nodes.evaluateOutline);
  builder.addNode('setOutlineCheckpoint', setOutlineCheckpoint);
  builder.addNode('incrementOutlineRevision', incrementOutlineRevision);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addNode('generateContentBundle', nodes.generateContentBundle);
  builder.addNode('evaluateArticle', nodes.evaluateArticle);
  builder.addNode('setArticleCheckpoint', setArticleCheckpoint);
  builder.addNode('incrementArticleRevision', incrementArticleRevision);
  builder.addNode('validateContentBundle', nodes.validateContentBundle);

  // ═══════════════════════════════════════════════════════
  // ADD NODES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addNode('assembleHtml', nodes.assembleHtml);

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 0: Input Parsing (Commit 8.9)
  // Conditional entry: raw input → parse → review → initialize
  //                   no raw input → skip directly to initialize
  // ═══════════════════════════════════════════════════════

  builder.addConditionalEdges(START, routeEntryPoint, {
    parseInput: 'parseRawInput',
    initialize: 'initializeSession'
  });

  // Input review checkpoint (after parsing, before proceeding)
  builder.addConditionalEdges('parseRawInput', routeInputReview, {
    wait: END,
    continue: 'finalizeInput'
  });

  // After input finalized, continue to initialization
  builder.addEdge('finalizeInput', 'initializeSession');

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1: Data Acquisition (linear)
  // ═══════════════════════════════════════════════════════

  builder.addEdge('initializeSession', 'loadDirectorNotes');
  builder.addEdge('loadDirectorNotes', 'fetchMemoryTokens');
  builder.addEdge('fetchMemoryTokens', 'fetchPaperEvidence');

  // Paper evidence selection checkpoint (Commit 8.9.4)
  builder.addEdge('fetchPaperEvidence', 'setPaperEvidenceCheckpoint');
  builder.addConditionalEdges('setPaperEvidenceCheckpoint', routePaperEvidenceSelection, {
    wait: END,
    continue: 'fetchSessionPhotos'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 1.6-1.8: Early Processing
  // ═══════════════════════════════════════════════════════

  builder.addEdge('fetchSessionPhotos', 'analyzePhotos');

  // Character ID checkpoint after photo analysis (Commit 8.9.5)
  builder.addEdge('analyzePhotos', 'setCharacterIdCheckpoint');
  builder.addConditionalEdges('setCharacterIdCheckpoint', routeCharacterIdCheckpoint, {
    wait: END,
    continue: 'parseCharacterIds'  // Parse natural language input (Commit 8.9.x)
  });

  // Parse natural language character IDs into structured format (Commit 8.9.x)
  builder.addEdge('parseCharacterIds', 'finalizePhotoAnalyses');

  // Photo finalization enriches analyses with character IDs (Commit 8.9.5)
  builder.addEdge('finalizePhotoAnalyses', 'preprocessEvidence');
  builder.addEdge('preprocessEvidence', 'curateEvidenceBundle');

  // Evidence + Photos approval checkpoint
  builder.addConditionalEdges('curateEvidenceBundle', routeEvidenceApproval, {
    wait: END,
    continue: 'analyzeArcs'  // Start orchestrated arc analysis (Commit 8.8)
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 2: Arc Analysis (Orchestrated Subagents - Commit 8.8)
  // ═══════════════════════════════════════════════════════

  // Single orchestrator node handles all arc analysis and synthesis
  // Subagents run in parallel via SDK Task tool
  builder.addEdge('analyzeArcs', 'evaluateArcs');

  // Arc evaluation routing
  builder.addConditionalEdges('evaluateArcs', routeArcEvaluation, {
    checkpoint: 'setArcSelectionCheckpoint',
    revise: 'incrementArcRevision',
    error: END
  });

  // Revision loop back to orchestrator (Commit 8.8)
  builder.addEdge('incrementArcRevision', 'analyzeArcs');

  // Arc selection checkpoint
  builder.addConditionalEdges('setArcSelectionCheckpoint', routeArcSelectionApproval, {
    wait: END,
    continue: 'generateOutline'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 3: Outline Generation
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateOutline', 'evaluateOutline');

  // Outline evaluation routing
  builder.addConditionalEdges('evaluateOutline', routeOutlineEvaluation, {
    checkpoint: 'setOutlineCheckpoint',
    revise: 'incrementOutlineRevision',
    error: END
  });

  // Revision loop back to outline generation
  builder.addEdge('incrementOutlineRevision', 'generateOutline');

  // Outline checkpoint
  builder.addConditionalEdges('setOutlineCheckpoint', routeOutlineApproval, {
    wait: END,
    continue: 'generateContentBundle'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 4: Article Generation
  // ═══════════════════════════════════════════════════════

  builder.addEdge('generateContentBundle', 'evaluateArticle');

  // Article evaluation routing
  builder.addConditionalEdges('evaluateArticle', routeArticleEvaluation, {
    checkpoint: 'setArticleCheckpoint',
    revise: 'incrementArticleRevision',
    error: END
  });

  // Revision loop back to article generation
  builder.addEdge('incrementArticleRevision', 'generateContentBundle');

  // Article checkpoint → schema validation
  builder.addConditionalEdges('setArticleCheckpoint', routeArticleApproval, {
    wait: END,
    continue: 'validateContentBundle'
  });

  // Schema validation routing
  builder.addConditionalEdges('validateContentBundle', routeSchemaValidation, {
    error: END,
    continue: 'assembleHtml'
  });

  // ═══════════════════════════════════════════════════════
  // ADD EDGES - Phase 5: Assembly
  // ═══════════════════════════════════════════════════════

  builder.addEdge('assembleHtml', END);

  return builder;
}

// ═══════════════════════════════════════════════════════════════════════════
// GRAPH FACTORY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create compiled report graph with MemorySaver checkpointing
 * Use for testing or ephemeral sessions
 *
 * @returns {Object} Compiled StateGraph
 */
// Default recursion limit - graph has 20+ nodes and revision loops can exceed 25 steps
const RECURSION_LIMIT = 75;

function createReportGraph() {
  const builder = createGraphBuilder();
  const checkpointer = new MemorySaver();

  return builder.compile({ checkpointer, recursionLimit: RECURSION_LIMIT });
}

/**
 * Create compiled report graph with custom checkpointer
 * Use for production with SqliteSaver or other persistent storage
 *
 * @param {Object} checkpointer - Checkpointer instance (MemorySaver, SqliteSaver, etc.)
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphWithCheckpointer(checkpointer) {
  const builder = createGraphBuilder();
  return builder.compile({ checkpointer, recursionLimit: RECURSION_LIMIT });
}

/**
 * Create compiled report graph without checkpointing
 * Use for simple one-shot execution (no pause/resume)
 *
 * @returns {Object} Compiled StateGraph
 */
function createReportGraphNoCheckpoint() {
  const builder = createGraphBuilder();
  return builder.compile({ recursionLimit: RECURSION_LIMIT });
}

module.exports = {
  // Main factory functions
  createReportGraph,
  createReportGraphWithCheckpointer,
  createReportGraphNoCheckpoint,

  // For testing
  _testing: {
    createGraphBuilder,
    // Routing functions - Entry (Commit 8.9)
    routeEntryPoint,
    routeInputReview,
    // Routing functions - Checkpoints
    routePaperEvidenceSelection,  // Commit 8.9.4
    routeCharacterIdCheckpoint,   // Commit 8.9.5
    routeEvidenceApproval,
    routeArcEvaluation,
    routeOutlineEvaluation,
    routeArticleEvaluation,
    routeSchemaValidation,
    routeArcSelectionApproval,
    routeOutlineApproval,
    routeArticleApproval,
    // Checkpoint nodes
    setPaperEvidenceCheckpoint,   // Commit 8.9.4
    setCharacterIdCheckpoint,     // Commit 8.9.5
    setArcSelectionCheckpoint,
    setOutlineCheckpoint,
    setArticleCheckpoint,
    incrementArcRevision,
    incrementOutlineRevision,
    incrementArticleRevision
  }
};
