/**
 * ALN Director Console - Backend Server
 * Uses Claude Agent SDK via LangGraph workflow for AI operations
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// LangGraph workflow modules
const { MemorySaver, Command } = require('@langchain/langgraph');
const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('./lib/workflow/graph');
const {
  PHASES,
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS
} = require('./lib/workflow/state');
const {
  CHECKPOINT_TYPES,
  isGraphInterrupted,
  getInterruptData,
  buildInterruptResponse
} = require('./lib/workflow/checkpoint-helpers');
const { sanitizePath } = require('./lib/workflow/nodes/input-nodes');
const { progressEmitter } = require('./lib/observability');
const { createPromptBuilder } = require('./lib/prompt-builder');

// Shared checkpointer instance - must persist across API calls for resume to work
const sharedCheckpointer = new MemorySaver();

// Shared promptBuilder - created at startup, injected into workflow config (Commit 8.18)
// Persists cache across all graph invocations for efficient prompt loading
let sharedPromptBuilder = null;

/**
 * Get session state from checkpointer without invoking the graph
 * Used by read-only endpoints to inspect state at any checkpoint
 * @param {string} sessionId - The session/thread ID
 * @returns {object|null} - { checkpointId, timestamp, state } or null if not found
 */
async function getSessionState(sessionId) {
    const config = { configurable: { thread_id: sessionId } };
    const tuple = await sharedCheckpointer.getTuple(config);

    if (!tuple) return null;

    return {
        checkpointId: tuple.checkpoint?.id,
        timestamp: tuple.checkpoint?.ts,
        state: tuple.checkpoint?.channel_values || {}
    };
}

/**
 * Build response data for a specific checkpoint type (DRY helper)
 * Extracts relevant fields from state based on checkpoint type
 * @param {string} checkpointType - The checkpoint type constant
 * @param {object} state - The current state object
 * @returns {object} - Checkpoint-specific data for response
 */
function getCheckpointData(checkpointType, state) {
    switch (checkpointType) {
        case CHECKPOINT_TYPES.INPUT_REVIEW:
            return {
                parsedInput: state._parsedInput,
                sessionConfig: state.sessionConfig,
                directorNotes: state.directorNotes,
                playerFocus: state.playerFocus
            };
        case CHECKPOINT_TYPES.PAPER_EVIDENCE_SELECTION:
            return { paperEvidence: state.paperEvidence };
        case CHECKPOINT_TYPES.CHARACTER_IDS:
            return {
                sessionPhotos: state.sessionPhotos,
                photoAnalyses: state.photoAnalyses,
                sessionConfig: state.sessionConfig
            };
        case CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS:
            return { evidenceBundle: state.evidenceBundle };
        case CHECKPOINT_TYPES.ARC_SELECTION:
            return { narrativeArcs: state.narrativeArcs };
        case CHECKPOINT_TYPES.OUTLINE:
            return { outline: state.outline };
        case CHECKPOINT_TYPES.ARTICLE:
            return {
                contentBundle: state.contentBundle,
                articleHtml: state.assembledHtml
            };
        case CHECKPOINT_TYPES.PRE_CURATION:
            return {
                preCurationSummary: state.preCurationSummary,
                preprocessedEvidence: state.preprocessedEvidence
            };
        default:
            return {};
    }
}

/**
 * Build resume payload from approval decisions (DRY helper)
 * Used by /api/session/:id/approve endpoint with Command({ resume })
 *
 * Returns a payload that will be passed to graph.invoke(new Command({ resume: payload }))
 * The payload becomes the return value of interrupt() in the paused node.
 *
 * @param {object} approvals - Approval decisions from request body
 * @param {object} currentState - Current graph state values (for merging incremental inputs)
 * @returns {object} - { resume: payload for Command, stateUpdates: direct state updates, error: validation error or null }
 */
function buildResumePayload(approvals, currentState = {}) {
    const resume = {};
    const stateUpdates = {};
    let error = null;
    let validApprovalDetected = false;

    // Input review approval (Commit 8.9)
    if (approvals.inputReview === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.inputEdits) {
            stateUpdates._inputEdits = approvals.inputEdits;
        }
    }

    // Paper evidence selection (Commit 8.9.4)
    if (approvals.selectedPaperEvidence && Array.isArray(approvals.selectedPaperEvidence)) {
        validApprovalDetected = true;
        stateUpdates.selectedPaperEvidence = approvals.selectedPaperEvidence;
        resume.selectedPaperEvidence = approvals.selectedPaperEvidence;
    }

    // Character ID mappings (Commit 8.9.5, 8.9.x) - two input formats supported
    if (approvals.characterIdsRaw && typeof approvals.characterIdsRaw === 'string') {
        validApprovalDetected = true;
        stateUpdates.characterIdsRaw = approvals.characterIdsRaw;
        resume.characterIdsRaw = approvals.characterIdsRaw;
    } else if (approvals.characterIds && typeof approvals.characterIds === 'object') {
        validApprovalDetected = true;
        stateUpdates.characterIdMappings = approvals.characterIds;
        resume.characterIdMappings = approvals.characterIds;
    }

    // Evidence bundle approval with rescue mechanism (Commit 8.10+)
    if (approvals.evidenceBundle === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.rescuedItems && Array.isArray(approvals.rescuedItems) && approvals.rescuedItems.length > 0) {
            // Validate: filter to non-empty strings only
            const validItems = approvals.rescuedItems.filter(item =>
                typeof item === 'string' && item.trim().length > 0
            );

            if (validItems.length > 0) {
                stateUpdates._rescuedItems = validItems;
                resume.rescuedItems = validItems;
            }
        }
    }

    // Arc selection with validation
    if (approvals.selectedArcs) {
        if (!Array.isArray(approvals.selectedArcs) || approvals.selectedArcs.length === 0) {
            error = 'selectedArcs must be a non-empty array';
        } else {
            validApprovalDetected = true;
            stateUpdates.selectedArcs = approvals.selectedArcs;
            resume.selectedArcs = approvals.selectedArcs;
        }
    }

    // Outline approval (boolean)
    if (approvals.outline === true) {
        validApprovalDetected = true;
        resume.approved = true;
    }

    // Article approval (boolean) (Commit 8.9.7)
    if (approvals.article === true) {
        validApprovalDetected = true;
        resume.approved = true;
    }

    // Pre-curation approval (Phase 4f)
    if (approvals.preCuration === true) {
        validApprovalDetected = true;
        stateUpdates.preCurationApproved = true;
        resume.preCurationApproved = true;
    }

    // Await roster checkpoint (Parallel branch architecture)
    // User provides roster to enable character ID mapping
    if (approvals.roster && Array.isArray(approvals.roster)) {
        validApprovalDetected = true;
        stateUpdates.roster = approvals.roster;
        resume.roster = approvals.roster;
    }

    // Await full context checkpoint (Parallel branch architecture)
    // User provides accusation, sessionReport, directorNotes for input parsing
    // CRITICAL: Merge with existing rawSessionInput to preserve photosPath from /start
    if (approvals.fullContext) {
        const { accusation, sessionReport, directorNotes } = approvals.fullContext;
        if (accusation && sessionReport && directorNotes) {
            validApprovalDetected = true;
            // Merge with existing rawSessionInput to preserve photosPath from /start
            const existingRawInput = currentState.rawSessionInput || {};
            stateUpdates.rawSessionInput = {
                ...existingRawInput,
                accusation,
                sessionReport,
                directorNotes
            };
            resume.fullContext = approvals.fullContext;
        }
    }

    if (!validApprovalDetected) {
        error = 'No valid approval detected in request';
    }

    return { resume, stateUpdates, error };
}

/**
 * Valid theme values for validation
 */
const VALID_THEMES = ['journalist', 'detective'];

/**
 * Build complete checkpoint data by merging state-based data with interrupt payload
 *
 * The interrupt() call only includes data explicitly passed to checkpointInterrupt().
 * But scripts expect full checkpoint data (e.g., CHARACTER_IDS needs sessionPhotos + sessionConfig).
 * This helper merges getCheckpointData() results with the interrupt payload.
 *
 * @param {Object} interruptData - Data from interrupt() payload (includes type)
 * @param {Object} state - Current graph state values
 * @returns {Object} Complete checkpoint data for response
 */
function buildCompleteCheckpointData(interruptData, state) {
    const checkpointType = interruptData?.type;
    const stateBasedData = getCheckpointData(checkpointType, state);
    // Merge: state-based data first, then interrupt data (interrupt takes precedence)
    return { ...stateBasedData, ...interruptData };
}

const { isClaudeAvailable } = require('./lib/llm');

const app = express();
const PORT = 3001;

// Server timeout: workflow steps can take several minutes
// (e.g., finalizePhotoAnalyses ~90s, preprocessEvidence ~110s)
const SERVER_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes for long-running workflows

// SSE heartbeat interval to keep connections alive (Commit 8.16)
const SSE_HEARTBEAT_MS = 15000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Serve session photos at /sessionphotos/{sessionId}/*
// Maps to data/{sessionId}/photos/* for article photo references
app.use('/sessionphotos/:sessionId', (req, res, next) => {
    const { sessionId } = req.params;
    const photosDir = path.join(__dirname, 'data', sessionId, 'photos');
    express.static(photosDir)(req, res, next);
});

// Session middleware for authentication
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-change-this',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: false, // Set to true if using HTTPS only
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Auth middleware - protects routes
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
}

// ===== AUTH ENDPOINTS =====

// Login endpoint - validates password
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.ACCESS_PASSWORD;

    if (!correctPassword) {
        console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error'
        });
    }

    if (password === correctPassword) {
        req.session.authenticated = true;
        console.log(`[${new Date().toISOString()}] Successful login from ${req.ip}`);
        res.json({
            success: true,
            message: 'Authentication successful'
        });
    } else {
        console.warn(`[${new Date().toISOString()}] Failed login attempt from ${req.ip}`);
        res.status(401).json({
            success: false,
            message: 'Incorrect password'
        });
    }
});

// Check auth status
app.get('/api/auth/check', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.authenticated)
    });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

// ===== API ENDPOINTS (Protected) =====

/**
 * POST /api/generate
 * Unified report generation endpoint using LangGraph workflow
 *
 * Request body:
 *   sessionId: string - Session identifier (MMDD format, e.g., "1221")
 *   theme: 'journalist' | 'detective' - Report theme
 *
 *   rawSessionInput?: object - Raw input for new sessions (Commit 8.9.1)
 *     roster: string - Comma-separated character names
 *     accusation: string - Murder accusation narrative
 *     sessionReport: string - Session gameplay report (tokens, shell accounts)
 *     directorNotes: string - Director observations
 *     photosPath?: string - Path to session photos
 *     whiteboardPhotoPath?: string - Path to whiteboard photo
 *
 *   rollbackTo?: string - Rollback to checkpoint and regenerate (Commit 8.9.3)
 *     Valid values: 'input-review', 'paper-evidence-selection', 'character-ids',
 *                   'evidence-bundle', 'arc-selection', 'outline', 'article'
 *     Clears state from that checkpoint forward, resets revision counters.
 *
 *   stateOverrides?: object - Inject state changes before resuming (Commit 8.9.3)
 *     Common use: { playerFocus: { primaryInvestigation: "new angle" } }
 *     Applied after rollback clears, before graph resumes.
 *
 *   approvals?: object - Approval decisions for checkpoints
 *     inputReview?: boolean - Approve parsed input (Commit 8.9.1)
 *     inputEdits?: object - User edits to parsed input (Commit 8.9.1)
 *     selectedPaperEvidence?: object[] - Selected paper evidence items (Commit 8.9.4)
 *     characterIds?: object - Character ID mappings per photo (Commit 8.9.5)
 *       Format: { "photo.jpg": {
 *         characterMappings: [{ descriptionIndex: 0, characterName: "Victoria" }],
 *         additionalCharacters: [{ description: "...", characterName: "...", role: "..." }],
 *         corrections: { location: "...", context: "...", other: "..." },
 *         exclude: false
 *       }}
 *     evidenceBundle?: boolean - Approve evidence bundle
 *     selectedArcs?: string[] - Selected narrative arc IDs
 *     outline?: boolean - Approve outline
 *
 * Response (on checkpoint - interrupted: true):
 *   {
 *     sessionId, interrupted: true, currentPhase,
 *     checkpoint: { type, ...checkpointData }
 *   }
 *   Checkpoint types and their data:
 *     - input-review: parsedInput, sessionConfig, directorNotes, playerFocus
 *     - paper-evidence-selection: paperEvidence
 *     - character-ids: sessionPhotos, photoAnalyses, sessionConfig
 *     - pre-curation: preCurationSummary, preprocessedEvidence
 *     - evidence-and-photos: evidenceBundle
 *     - arc-selection: narrativeArcs
 *     - outline: outline
 *     - article: contentBundle, articleHtml
 *
 * Response (on completion):
 *   { sessionId, currentPhase: 'complete', assembledHtml, validationResults }
 *
 * Response (on error):
 *   { sessionId, currentPhase: 'error', errors[] }
 */
app.post('/api/generate', requireAuth, async (req, res) => {
    const { sessionId, theme, rawSessionInput, rollbackTo, stateOverrides, approvals, mode } = req.body;

    // Validate required fields
    if (!sessionId) {
        return res.status(400).json({ error: 'sessionId is required' });
    }

    if (!theme) {
        return res.status(400).json({ error: 'theme is required' });
    }

    if (!['journalist', 'detective'].includes(theme)) {
        return res.status(400).json({
            error: `Invalid theme: ${theme}. Use 'journalist' or 'detective'.`
        });
    }

    // Validate rollbackTo if provided (Commit 8.9.3)
    if (rollbackTo && !VALID_ROLLBACK_POINTS.includes(rollbackTo)) {
        return res.status(400).json({
            error: `Invalid rollbackTo: '${rollbackTo}'. Valid values: ${VALID_ROLLBACK_POINTS.join(', ')}`
        });
    }

    // Validate stateOverrides is object if provided (Commit 8.9.3)
    if (stateOverrides && typeof stateOverrides !== 'object') {
        return res.status(400).json({
            error: 'stateOverrides must be an object'
        });
    }

    // Validate rawSessionInput structure if provided (Commit 8.9.1)
    if (rawSessionInput) {
        const requiredRawFields = ['roster', 'accusation', 'sessionReport', 'directorNotes'];
        const missingFields = requiredRawFields.filter(f => !rawSessionInput[f]);
        if (missingFields.length > 0) {
            return res.status(400).json({
                error: `rawSessionInput missing required fields: ${missingFields.join(', ')}`
            });
        }
    }

    // Always use sessionId as thread_id for consistent session continuity
    // This allows both fresh and resume modes to be resumable via /api/session/:id/approve
    // (Commit 8.9.9 - Fixed thread_id mismatch that caused OUTLINE infinite loop)
    const threadId = sessionId;

    console.log(`[${new Date().toISOString()}] /api/generate: sessionId=${sessionId}, theme=${theme}, mode=${mode || 'resume'}, rollbackTo=${rollbackTo || 'none'}, hasRawInput=${!!rawSessionInput}, hasOverrides=${!!stateOverrides}, approvals=${JSON.stringify(approvals || {})}`);

    try {
        // Use shared checkpointer to persist state across API calls
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);

        // Build config for graph execution
        // sessionId = our logical session ID, thread_id = checkpointer key
        const config = {
            configurable: {
                sessionId,
                theme,
                thread_id: threadId,
                promptBuilder: sharedPromptBuilder
            }
        };

        // Build initial state from rollback, overrides, rawSessionInput, and approvals
        let initialState = {};

        // Fresh mode: clear all state fields (Commit 8.9.9 - Fix for thread_id mismatch)
        // Uses ROLLBACK_CLEARS['input-review'] which clears everything for a true fresh start
        // This replaces the old timestamped thread_id approach that caused mismatches
        // with /api/session/:id/approve endpoint
        if (mode === 'fresh') {
            const fieldsToClear = ROLLBACK_CLEARS['input-review'];
            fieldsToClear.forEach(field => {
                initialState[field] = null;
            });
            // Reset all revision counters
            const counterResets = ROLLBACK_COUNTER_RESETS['input-review'];
            Object.assign(initialState, counterResets);
            // Reset control flow
            initialState.currentPhase = null;
            console.log(`[${new Date().toISOString()}] Fresh mode: Cleared ${fieldsToClear.length} fields via ROLLBACK_CLEARS`);
        }

        // Apply rollback if specified (Commit 8.9.3)
        // This clears state from the rollback point forward, triggering regeneration
        if (rollbackTo) {
            console.log(`[${new Date().toISOString()}] Applying rollback to '${rollbackTo}'`);

            // Clear fields from this checkpoint forward
            const fieldsToClear = ROLLBACK_CLEARS[rollbackTo];
            fieldsToClear.forEach(field => {
                initialState[field] = null;
            });

            // Reset revision counters for fresh attempts
            const counterResets = ROLLBACK_COUNTER_RESETS[rollbackTo];
            Object.assign(initialState, counterResets);

            console.log(`[${new Date().toISOString()}] Rollback cleared ${fieldsToClear.length} fields, reset counters:`, Object.keys(counterResets));
        }

        // Apply state overrides after rollback (Commit 8.9.3)
        // Common use: inject modified playerFocus before regenerating arcs
        if (stateOverrides) {
            console.log(`[${new Date().toISOString()}] Applying stateOverrides:`, Object.keys(stateOverrides));
            Object.assign(initialState, stateOverrides);
        }

        // Include rawSessionInput for parsing (Commit 8.9.1)
        if (rawSessionInput) {
            initialState.rawSessionInput = rawSessionInput;
        }

        // Apply approval decisions using shared helper (DRY - Commit 8.10+)
        if (approvals) {
            const { stateUpdates, error: validationError } = buildResumePayload(approvals);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }
            Object.assign(initialState, stateUpdates);
        }

        // Run graph until it pauses at checkpoint or completes
        console.log(`[${new Date().toISOString()}] Invoking graph with initialState:`, JSON.stringify(initialState));
        const result = await graph.invoke(initialState, { ...config, recursionLimit: RECURSION_LIMIT });

        // Check if graph is interrupted at a checkpoint
        const graphState = await graph.getState(config);
        const interrupted = isGraphInterrupted(graphState);

        console.log(`[${new Date().toISOString()}] Graph completed. Phase: ${result.currentPhase}, interrupted: ${interrupted}`);

        // Handle interrupted state (checkpoint pause)
        if (interrupted) {
            const interruptData = getInterruptData(graphState);
            // Merge interrupt payload with state-based checkpoint data for complete response
            const checkpointData = buildCompleteCheckpointData(interruptData, graphState.values);
            return res.json(buildInterruptResponse(sessionId, checkpointData, result.currentPhase));
        }

        // Build response for non-interrupted states (completion or error)
        const response = {
            sessionId,
            currentPhase: result.currentPhase
        };

        // Include final outputs on completion
        if (result.currentPhase === PHASES.COMPLETE) {
            response.assembledHtml = result.assembledHtml;
            response.validationResults = result.validationResults;
        }

        // Include errors if present
        if (result.currentPhase === PHASES.ERROR) {
            // Always include errors array when in ERROR phase
            response.errors = result.errors || [];
        } else if (result.errors && result.errors.length > 0) {
            // Also include errors if present but not in ERROR phase (e.g., warnings)
            response.errors = result.errors;
        }

        res.json(response);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] /api/generate error:`, error);
        res.status(500).json({
            sessionId,
            currentPhase: PHASES.ERROR,
            error: error.message,
            details: 'Report generation failed. Check server logs.'
        });
    }
});

// ===== SESSION STATE ENDPOINTS (8.9.7) =====
// Read-only endpoints for inspecting state without advancing workflow

/**
 * GET /api/session/:id
 * Get summary of current session state (phase, checkpoint status, counts)
 */
app.get('/api/session/:id', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        // Use graph.getState() to properly detect interrupt status
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = { configurable: { thread_id: sessionId } };
        const graphState = await graph.getState(config);

        if (!graphState || !graphState.values) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = graphState.values;
        const interrupted = isGraphInterrupted(graphState);
        const interruptData = interrupted ? getInterruptData(graphState) : null;

        res.json({
            sessionId,
            exists: true,
            checkpoint: {
                id: graphState.config?.configurable?.checkpoint_id,
                currentPhase: state.currentPhase,
                interrupted,
                checkpointType: interruptData?.type || null
            },
            counts: {
                memoryTokens: state.memoryTokens?.length || 0,
                paperEvidence: state.paperEvidence?.length || 0,
                sessionPhotos: state.sessionPhotos?.length || 0,
                photoAnalyses: state.photoAnalyses?.length || 0,
                narrativeArcs: state.narrativeArcs?.length || 0
            },
            errors: state.errors || []
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId} error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/state
 * Get full state object for debugging
 */
app.get('/api/session/:id/state', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        res.json({
            sessionId,
            checkpointId: session.checkpointId,
            timestamp: session.timestamp,
            state: session.state
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/state error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/checkpoint
 * Get current checkpoint info (convenience endpoint)
 */
app.get('/api/session/:id/checkpoint', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        // Use graph.getState() to properly detect interrupt status
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = { configurable: { thread_id: sessionId } };
        const graphState = await graph.getState(config);

        if (!graphState || !graphState.values) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const interrupted = isGraphInterrupted(graphState);
        const interruptData = interrupted ? getInterruptData(graphState) : null;

        res.json({
            sessionId,
            currentPhase: graphState.values.currentPhase,
            interrupted,
            checkpointType: interruptData?.type || null,
            // Include checkpoint data for UI if interrupted
            checkpoint: interruptData
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/checkpoint error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/progress
 * SSE endpoint for real-time progress streaming (Commit 8.16)
 *
 * Streams progress events from SDK calls to the client to prevent
 * browser timeout during long-running operations (arc analysis, etc.)
 *
 * Event format: { timestamp, context, type, elapsed, message, toolName? }
 *
 * Connection lifecycle:
 * - Client connects at session start, stays connected throughout
 * - Server sends heartbeat every SSE_HEARTBEAT_MS to keep connection alive
 * - Connection closes when client disconnects or session completes
 */
app.get('/api/session/:id/progress', requireAuth, (req, res) => {
    const { id: sessionId } = req.params;
    let connectionClosed = false;  // Guard against double cleanup

    console.log(`[${new Date().toISOString()}] SSE connected: session ${sessionId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering if proxied

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Heartbeat to prevent connection timeout
    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, SSE_HEARTBEAT_MS);

    // Subscribe to progress events for this session
    const unsubscribe = progressEmitter.subscribe(sessionId, (data) => {
        if (connectionClosed) return;
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            if (connectionClosed) return;
            connectionClosed = true;
            console.error(`[SSE] Error writing to session ${sessionId}:`, err.message);
            clearInterval(heartbeat);
            unsubscribe();
            try { res.end(); } catch { /* already closed */ }
        }
    });

    // Cleanup on client disconnect
    req.on('close', () => {
        if (connectionClosed) return;
        connectionClosed = true;
        console.log(`[${new Date().toISOString()}] SSE disconnected: session ${sessionId}`);
        clearInterval(heartbeat);
        unsubscribe();
    });
});

/**
 * GET /api/session/:id/state/:field
 * Get specific state field value
 */
app.get('/api/session/:id/state/:field', requireAuth, async (req, res) => {
    const { id: sessionId, field } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const hasField = Object.prototype.hasOwnProperty.call(session.state, field);

        res.json({
            sessionId,
            field,
            exists: hasField,
            value: hasField ? session.state[field] : null
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/state/${field} error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/evidence
 * Get evidence bundle (available after Phase 1.8)
 */
app.get('/api/session/:id/evidence', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = session.state;
        const phaseNum = parseFloat(state.currentPhase || '0');

        res.json({
            sessionId,
            available: phaseNum >= 1.8 && !!state.evidenceBundle,
            evidenceBundle: state.evidenceBundle || null
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/evidence error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/arcs
 * Get narrative arcs (available after Phase 2.3)
 */
app.get('/api/session/:id/arcs', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = session.state;
        const phaseNum = parseFloat(state.currentPhase || '0');

        res.json({
            sessionId,
            available: phaseNum >= 2.3 && !!state.narrativeArcs,
            narrativeArcs: state.narrativeArcs || null,
            selectedArcs: state.selectedArcs || null
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/arcs error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/outline
 * Get article outline (available after Phase 3.2)
 */
app.get('/api/session/:id/outline', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = session.state;
        const phaseNum = parseFloat(state.currentPhase || '0');

        res.json({
            sessionId,
            available: phaseNum >= 3.2 && !!state.outline,
            outline: state.outline || null
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/outline error:`, error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * GET /api/session/:id/article
 * Get generated article (available after Phase 4.2)
 */
app.get('/api/session/:id/article', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = session.state;
        const phaseNum = parseFloat(state.currentPhase || '0');

        res.json({
            sessionId,
            available: phaseNum >= 4.2 && !!state.contentBundle,
            contentBundle: state.contentBundle || null,
            articleHtml: state.assembledHtml || null
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] GET /api/session/${sessionId}/article error:`, error);
        res.status(500).json({ error: error.message });
    }
});

// ===== SESSION ACTION ENDPOINTS (8.9.7) =====

/**
 * POST /api/session/:id/start
 * Start a fresh workflow with raw session input
 */
app.post('/api/session/:id/start', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { theme = 'journalist', rawSessionInput } = req.body;

    // Validate theme
    if (!VALID_THEMES.includes(theme)) {
        return res.status(400).json({
            error: `Invalid theme: ${theme}. Use 'journalist' or 'detective'.`
        });
    }

    // Validate minimal required input for incremental flow
    // Phase 1: Only sessionId + photosPath required to start
    // Roster provided at await-roster checkpoint
    // Full context (accusation, sessionReport, directorNotes) at await-full-context checkpoint
    if (!rawSessionInput) {
        return res.status(400).json({ error: 'rawSessionInput is required' });
    }

    // photosPath is the only required field for incremental start
    // If not provided, will use default: data/{sessionId}/photos
    if (!rawSessionInput.photosPath) {
        rawSessionInput.photosPath = `data/${sessionId}/photos`;
    }

    // Sanitize photosPath - strip surrounding quotes (user may paste path with quotes)
    rawSessionInput.photosPath = rawSessionInput.photosPath.replace(/^["']|["']$/g, '');

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/start: theme=${theme}`);

    try {
        // NOTE: Background pipelines removed - parallel branches in graph handle this now
        // Evidence and photo fetching run in parallel within the LangGraph workflow

        // Use sessionId as thread_id for consistency with /api/session/:id/approve
        // (Commit 8.9.9 - Fix for thread_id mismatch that caused infinite loops)
        const threadId = sessionId;

        // Use shared graph
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = {
            configurable: {
                sessionId,
                theme,
                thread_id: threadId,
                promptBuilder: sharedPromptBuilder
            }
        };

        // Clear all state fields for fresh start using ROLLBACK_CLEARS pattern
        const initialState = { rawSessionInput };
        const fieldsToClear = ROLLBACK_CLEARS['input-review'];
        fieldsToClear.forEach(field => {
            initialState[field] = null;
        });
        Object.assign(initialState, ROLLBACK_COUNTER_RESETS['input-review']);
        initialState.currentPhase = null;
        const result = await graph.invoke(initialState, { ...config, recursionLimit: RECURSION_LIMIT });

        // Check if graph is interrupted at a checkpoint
        const graphState = await graph.getState(config);
        const interrupted = isGraphInterrupted(graphState);

        // Build response with new interrupt format
        if (interrupted) {
            const interruptData = getInterruptData(graphState);
            const checkpointData = buildCompleteCheckpointData(interruptData, graphState.values);
            return res.json(buildInterruptResponse(sessionId, checkpointData, result.currentPhase));
        }

        // Non-interrupted response (shouldn't happen on fresh start, but handle gracefully)
        res.json({
            sessionId,
            currentPhase: result.currentPhase
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/start error:`, error);
        res.status(500).json({
            sessionId,
            currentPhase: PHASES.ERROR,
            error: error.message,
            details: 'Session start failed. Check server logs.'
        });
    }
});

/**
 * POST /api/session/:id/approve
 * Approve current checkpoint and advance workflow using Command({ resume })
 */
app.post('/api/session/:id/approve', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const approvals = req.body;

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve:`, JSON.stringify(approvals));

    try {
        // Create graph and config first (needed for getState)
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = {
            configurable: {
                sessionId,
                thread_id: sessionId,
                promptBuilder: sharedPromptBuilder
            }
        };

        // Check if graph is interrupted using native LangGraph pattern
        const graphState = await graph.getState(config);
        if (!graphState || !isGraphInterrupted(graphState)) {
            return res.status(400).json({
                sessionId,
                error: 'Session is not at a checkpoint',
                currentPhase: graphState?.values?.currentPhase || null
            });
        }

        // Get theme from state for config
        const theme = graphState.values?.theme || 'journalist';
        config.configurable.theme = theme;

        // Build resume payload from approvals (pass current state for incremental input merging)
        const { resume, stateUpdates, error: validationError } = buildResumePayload(approvals, graphState.values);
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        // NOTE: Background pipelines now start earlier with staggered timing (Phase 3 optimization):
        // - Evidence pipeline: starts at session start (context-free, no playerFocus needed)
        // - Photo pipeline: starts after parseRawInput completes (needs sessionConfig.photosPath)
        // See POST /api/session/:id/start handler for pipeline triggers

        // Return immediately - workflow runs in background
        const previousPhase = graphState.values?.currentPhase;
        res.json({
            sessionId,
            status: 'processing',
            previousPhase
        });

        // Run workflow in background using Command({ resume }) pattern
        setImmediate(async () => {
            try {
                // Resume graph with Command - resume value becomes the return of interrupt()
                // Also pass stateUpdates for any direct state modifications
                const command = new Command({ resume, update: stateUpdates });
                const result = await graph.invoke(command, { ...config, recursionLimit: RECURSION_LIMIT });

                // Check if graph paused at another checkpoint
                const newGraphState = await graph.getState(config);
                const interrupted = isGraphInterrupted(newGraphState);

                console.log(`[${new Date().toISOString()}] Workflow complete for session ${sessionId}, phase: ${result.currentPhase}, interrupted: ${interrupted}`);

                // Build SSE response
                let response;
                if (interrupted) {
                    const interruptData = getInterruptData(newGraphState);
                    const checkpointData = buildCompleteCheckpointData(interruptData, newGraphState.values);
                    response = {
                        ...buildInterruptResponse(sessionId, checkpointData, result.currentPhase),
                        previousPhase
                    };
                } else {
                    response = {
                        sessionId,
                        previousPhase,
                        currentPhase: result.currentPhase
                    };

                    // Include completion data
                    if (result.currentPhase === PHASES.COMPLETE) {
                        response.assembledHtml = result.assembledHtml;
                        response.validationResults = result.validationResults;
                    }

                    // Include errors
                    if (result.errors?.length > 0) {
                        response.errors = result.errors;
                    }
                }

                // Emit completion via SSE
                progressEmitter.emitComplete(sessionId, response);

            } catch (error) {
                console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
                progressEmitter.emitComplete(sessionId, {
                    sessionId,
                    currentPhase: PHASES.ERROR,
                    error: error.message,
                    details: 'Approval operation failed. Check server logs.'
                });
            }
        });

    } catch (error) {
        // This only catches errors BEFORE the background task starts (validation, etc.)
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve error:`, error);

        // Emit SSE completion for sync errors so client doesn't hang waiting
        progressEmitter.emitComplete(sessionId, {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: error.message,
            details: 'Approval operation failed. Check server logs.'
        });

        res.status(500).json({
            sessionId,
            currentPhase: PHASES.ERROR,
            error: error.message,
            details: 'Approval operation failed. Check server logs.'
        });
    }
});

/**
 * POST /api/session/:id/rollback
 * Rollback to a specific checkpoint
 */
app.post('/api/session/:id/rollback', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { rollbackTo, stateOverrides } = req.body;

    // Validate rollbackTo
    if (!rollbackTo) {
        return res.status(400).json({ error: 'rollbackTo is required' });
    }
    if (!VALID_ROLLBACK_POINTS.includes(rollbackTo)) {
        return res.status(400).json({
            error: `Invalid rollbackTo: '${rollbackTo}'. Valid values: ${VALID_ROLLBACK_POINTS.join(', ')}`
        });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/rollback: rollbackTo=${rollbackTo}`);

    try {
        // Check current state first
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        // Use theme from session state (not hardcoded)
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = {
            configurable: {
                sessionId,
                theme: session.state.theme || 'journalist',
                thread_id: sessionId,
                promptBuilder: sharedPromptBuilder
            }
        };

        // Build rollback state
        let initialState = {};

        // Clear fields from this checkpoint forward
        const fieldsToClear = ROLLBACK_CLEARS[rollbackTo];
        fieldsToClear.forEach(field => {
            initialState[field] = null;
        });

        // Reset revision counters
        const counterResets = ROLLBACK_COUNTER_RESETS[rollbackTo];
        Object.assign(initialState, counterResets);

        // Apply overrides
        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        const result = await graph.invoke(initialState, { ...config, recursionLimit: RECURSION_LIMIT });

        // Check if graph is interrupted at a checkpoint
        const graphState = await graph.getState(config);
        const interrupted = isGraphInterrupted(graphState);

        // Build response with new interrupt format
        if (interrupted) {
            const interruptData = getInterruptData(graphState);
            const checkpointData = buildCompleteCheckpointData(interruptData, graphState.values);
            return res.json({
                ...buildInterruptResponse(sessionId, checkpointData, result.currentPhase),
                rolledBackTo: rollbackTo,
                fieldsCleared: fieldsToClear
            });
        }

        // Non-interrupted response
        res.json({
            sessionId,
            rolledBackTo: rollbackTo,
            currentPhase: result.currentPhase,
            fieldsCleared: fieldsToClear
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/rollback error:`, error);
        res.status(500).json({
            sessionId,
            currentPhase: PHASES.ERROR,
            error: error.message,
            details: 'Rollback operation failed. Check server logs.'
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server running',
        timestamp: new Date().toISOString(),
        endpoints: {
            generate: '/api/generate (POST)',
            config: '/api/config (GET)',
            auth: {
                login: '/api/auth/login (POST)',
                check: '/api/auth/check (GET)',
                logout: '/api/auth/logout (POST)'
            },
            session: {
                summary: '/api/session/:id (GET)',
                state: '/api/session/:id/state (GET)',
                progress: '/api/session/:id/progress (GET SSE)',
                evidence: '/api/session/:id/evidence (GET)',
                arcs: '/api/session/:id/arcs (GET)',
                outline: '/api/session/:id/outline (GET)',
                article: '/api/session/:id/article (GET)',
                start: '/api/session/:id/start (POST)',
                approve: '/api/session/:id/approve (POST)',
                rollback: '/api/session/:id/rollback (POST)',
                background: '/api/session/:id/background (GET)'
            }
        }
    });
});

/**
 * GET /api/session/:id/background
 * @deprecated Background pipelines removed - parallel branches in graph handle this now
 */
app.get('/api/session/:id/background', requireAuth, (req, res) => {
    const { id: sessionId } = req.params;
    res.json({
        sessionId,
        deprecated: true,
        message: 'Background pipelines removed. Evidence and photo fetching now use native LangGraph parallel branches.'
    });
});

// Config endpoint - serves environment variables to frontend (protected)
app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        notionToken: process.env.NOTION_TOKEN || ''
    });
});

// Serve frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'detlogv3.html'));
});

// Start server with Claude Agent SDK health check
(async () => {
    console.log('Checking Claude Agent SDK availability...');
    const claudeAvailable = await isClaudeAvailable();

    if (!claudeAvailable) {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Claude Agent SDK not available                    ║
║                                                           ║
║  The Claude Agent SDK is required for report generation.  ║
║  Please ensure:                                           ║
║    1. Dependencies installed: npm install                 ║
║    2. Claude Code authenticated: claude /login            ║
║                                                           ║
║  Server startup aborted.                                  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }

    console.log('Claude Agent SDK available ✓');

    // Validate theme files at startup (Commit 8.18)
    console.log('Validating theme files...');
    sharedPromptBuilder = createPromptBuilder();
    const themeValidation = await sharedPromptBuilder.theme.validate();
    if (!themeValidation.valid) {
        console.warn(`[startup] Missing theme files: ${themeValidation.missing.join(', ')}`);
    } else {
        console.log(`Theme files validated (${sharedPromptBuilder.theme.cache.size} cached) ✓`);
    }

    const server = app.listen(PORT, () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         ALN Director Console - Server Running            ║
║                                                           ║
║  Local Access:    http://localhost:${PORT}                   ║
║                                                           ║
║  Share with teammates:                                    ║
║  - Local network: http://[your-ip]:${PORT}                   ║
║  - Internet:      Use cloudflared or ngrok               ║
║                                                           ║
║  Using Claude Agent SDK via LangGraph workflow            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
        console.log('Press Ctrl+C to stop\n');
    });

    // Configure server timeouts (default 2min is too short for workflow steps)
    server.timeout = SERVER_TIMEOUT_MS;
    server.requestTimeout = SERVER_TIMEOUT_MS;  // Node 18+ default is 5min, we need 20min
    server.keepAliveTimeout = SERVER_TIMEOUT_MS;
    server.headersTimeout = SERVER_TIMEOUT_MS + 1000; // Must be > keepAliveTimeout
})();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    // Close cached Notion client (SQLite connection)
    try {
        const { resetCachedNotionClient } = require('./lib/cache');
        resetCachedNotionClient();
        console.log('Closed cache connections.');
    } catch (err) {
        console.warn('Cache cleanup skipped:', err.message);
    }
    process.exit(0);
});
