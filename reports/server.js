/**
 * ALN Director Console - Backend Server
 * Uses Claude Agent SDK via LangGraph workflow for AI operations
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');

// LangGraph workflow modules
const { MemorySaver } = require('@langchain/langgraph');
const { createReportGraphWithCheckpointer } = require('./lib/workflow/graph');
const {
  PHASES,
  APPROVAL_TYPES,
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  VALID_ROLLBACK_POINTS
} = require('./lib/workflow/state');
const { backgroundPipelineManager } = require('./lib/background-pipeline-manager');
const { sanitizePath } = require('./lib/workflow/nodes/input-nodes');
const { progressEmitter } = require('./lib/progress-emitter');

// Shared checkpointer instance - must persist across API calls for resume to work
const sharedCheckpointer = new MemorySaver();

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
 * Build response data for a specific approval type (DRY helper)
 * Extracts relevant fields from state based on checkpoint type
 * @param {string} approvalType - The approval type constant
 * @param {object} state - The current state object
 * @returns {object} - Checkpoint-specific data for response
 */
function getApprovalData(approvalType, state) {
    switch (approvalType) {
        case APPROVAL_TYPES.INPUT_REVIEW:
            return {
                parsedInput: state._parsedInput,
                sessionConfig: state.sessionConfig,
                directorNotes: state.directorNotes,
                playerFocus: state.playerFocus
            };
        case APPROVAL_TYPES.PAPER_EVIDENCE_SELECTION:
            return { paperEvidence: state.paperEvidence };
        case APPROVAL_TYPES.CHARACTER_IDS:
            return {
                sessionPhotos: state.sessionPhotos,
                photoAnalyses: state.photoAnalyses,
                sessionConfig: state.sessionConfig
            };
        case APPROVAL_TYPES.EVIDENCE_AND_PHOTOS:
            return { evidenceBundle: state.evidenceBundle };
        case APPROVAL_TYPES.ARC_SELECTION:
            return { narrativeArcs: state.narrativeArcs };
        case APPROVAL_TYPES.OUTLINE:
            return { outline: state.outline };
        case APPROVAL_TYPES.ARTICLE:
            return {
                contentBundle: state.contentBundle,
                articleHtml: state.assembledHtml
            };
        case APPROVAL_TYPES.PRE_CURATION:
            return {
                preCurationSummary: state.preCurationSummary,
                preprocessedEvidence: state.preprocessedEvidence
            };
        default:
            return {};
    }
}

/**
 * Build state updates from approval decisions (DRY helper)
 * Used by /api/generate and /api/session/:id/approve endpoints
 *
 * Only clears awaitingApproval when a VALID approval type is detected.
 * This prevents invalid approval requests from advancing the workflow.
 *
 * @param {object} approvals - Approval decisions from request body
 * @returns {object} - { state: updates to apply, error: validation error or null }
 */
function buildApprovalState(approvals) {
    const updates = {};
    let error = null;
    let validApprovalDetected = false;

    // Input review approval (Commit 8.9)
    if (approvals.inputReview === true) {
        validApprovalDetected = true;
        if (approvals.inputEdits) {
            updates._inputEdits = approvals.inputEdits;
        }
    }

    // Paper evidence selection (Commit 8.9.4)
    if (approvals.selectedPaperEvidence && Array.isArray(approvals.selectedPaperEvidence)) {
        validApprovalDetected = true;
        updates.selectedPaperEvidence = approvals.selectedPaperEvidence;
    }

    // Character ID mappings (Commit 8.9.5, 8.9.x) - two input formats supported
    if (approvals.characterIdsRaw && typeof approvals.characterIdsRaw === 'string') {
        validApprovalDetected = true;
        updates.characterIdsRaw = approvals.characterIdsRaw;
    } else if (approvals.characterIds && typeof approvals.characterIds === 'object') {
        validApprovalDetected = true;
        updates.characterIdMappings = approvals.characterIds;
    }

    // Evidence bundle approval with rescue mechanism (Commit 8.10+)
    if (approvals.evidenceBundle === true) {
        validApprovalDetected = true;
        if (approvals.rescuedItems && Array.isArray(approvals.rescuedItems) && approvals.rescuedItems.length > 0) {
            // Validate: filter to non-empty strings only
            const validItems = approvals.rescuedItems.filter(item =>
                typeof item === 'string' && item.trim().length > 0
            );

            if (validItems.length > 0) {
                updates._rescuedItems = validItems;
            }
        }
    }

    // Arc selection with validation
    if (approvals.selectedArcs) {
        if (!Array.isArray(approvals.selectedArcs) || approvals.selectedArcs.length === 0) {
            error = 'selectedArcs must be a non-empty array';
        } else {
            validApprovalDetected = true;
            updates.selectedArcs = approvals.selectedArcs;
        }
    }

    // Outline approval (boolean)
    if (approvals.outline === true) {
        validApprovalDetected = true;
    }

    // Article approval (boolean) (Commit 8.9.7)
    if (approvals.article === true) {
        validApprovalDetected = true;
    }

    // Pre-curation approval (Phase 4f)
    if (approvals.preCuration === true) {
        validApprovalDetected = true;
        updates.preCurationApproved = true;
    }

    // Only clear awaitingApproval if a valid approval type was detected
    if (validApprovalDetected) {
        updates.awaitingApproval = false;
    }

    return { state: updates, error };
}

/**
 * Valid theme values for validation
 */
const VALID_THEMES = ['journalist', 'detective'];

const { isClaudeAvailable } = require('./lib/sdk-client');

const app = express();
const PORT = 3001;

// Server timeout: workflow steps can take several minutes
// (e.g., finalizePhotoAnalyses ~90s, preprocessEvidence ~110s)
const SERVER_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes (matches e2e-walkthrough client timeout)

// SSE heartbeat interval to keep connections alive (Commit 8.16)
const SSE_HEARTBEAT_MS = 15000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

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
 * Response (on checkpoint):
 *   sessionId, currentPhase, awaitingApproval, approvalType
 *   Plus relevant data for the approval UI:
 *     - INPUT_REVIEW: parsedInput, sessionConfig, directorNotes, playerFocus
 *     - PAPER_EVIDENCE_SELECTION: paperEvidence (Commit 8.9.4)
 *     - CHARACTER_IDS: sessionPhotos, photoAnalyses, sessionConfig (Commit 8.9.5)
 *     - EVIDENCE_AND_PHOTOS: evidenceBundle
 *     - ARC_SELECTION: narrativeArcs
 *     - OUTLINE: outline
 *
 * Response (on completion):
 *   sessionId, currentPhase: 'complete', assembledHtml, validationResults
 *
 * Response (on error):
 *   sessionId, currentPhase: 'error', errors[]
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
                thread_id: threadId
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
            initialState.awaitingApproval = false;
            initialState.approvalType = null;
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

            // Clear approval state to allow re-entry at checkpoint
            initialState.awaitingApproval = false;
            initialState.approvalType = null;

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
            const { state: approvalState, error: validationError } = buildApprovalState(approvals);
            if (validationError) {
                return res.status(400).json({ error: validationError });
            }
            Object.assign(initialState, approvalState);
        }

        // Run graph until it pauses at checkpoint or completes
        console.log(`[${new Date().toISOString()}] Invoking graph with initialState:`, JSON.stringify(initialState));
        const result = await graph.invoke(initialState, config);
        console.log(`[${new Date().toISOString()}] Graph completed. Phase: ${result.currentPhase}, awaitingApproval: ${result.awaitingApproval}`);

        // Build response based on current state
        const response = {
            sessionId,
            currentPhase: result.currentPhase,
            awaitingApproval: result.awaitingApproval || false,
            approvalType: result.approvalType || null
        };

        // Include data for approval UI based on approval type
        if (result.awaitingApproval) {
            switch (result.approvalType) {
                case APPROVAL_TYPES.INPUT_REVIEW:
                    // Return parsed input data for user review (Commit 8.9)
                    response.parsedInput = result._parsedInput;
                    response.sessionConfig = result.sessionConfig;
                    response.directorNotes = result.directorNotes;
                    response.playerFocus = result.playerFocus;
                    break;
                case APPROVAL_TYPES.PAPER_EVIDENCE_SELECTION:
                    // Return available paper evidence for selection (Commit 8.9.4)
                    response.paperEvidence = result.paperEvidence;
                    break;
                case APPROVAL_TYPES.CHARACTER_IDS:
                    // Return photo analyses for character identification (Commit 8.9.5)
                    // User identifies who is in each photo based on Haiku's descriptions
                    // Roster comes from sessionConfig (DRY - already in pipeline)
                    response.sessionPhotos = result.sessionPhotos;
                    response.photoAnalyses = result.photoAnalyses;
                    response.sessionConfig = result.sessionConfig;  // Contains roster for dropdown
                    break;
                case APPROVAL_TYPES.EVIDENCE_AND_PHOTOS:
                    response.evidenceBundle = result.evidenceBundle;
                    break;
                case APPROVAL_TYPES.ARC_SELECTION:
                    response.narrativeArcs = result.narrativeArcs;
                    break;
                case APPROVAL_TYPES.OUTLINE:
                    response.outline = result.outline;
                    break;
                case APPROVAL_TYPES.ARTICLE:
                    // Return content bundle for article preview (Commit 8.9.7)
                    response.contentBundle = result.contentBundle;
                    response.articleHtml = result.assembledHtml;  // May be available for preview
                    break;
            }
        }

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
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = session.state;

        res.json({
            sessionId,
            exists: true,
            checkpoint: {
                id: session.checkpointId,
                timestamp: session.timestamp,
                currentPhase: state.currentPhase,
                awaitingApproval: state.awaitingApproval || false,
                approvalType: state.approvalType || null
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
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        res.json({
            sessionId,
            approvalType: session.state.approvalType || null,
            currentPhase: session.state.currentPhase,
            awaitingApproval: session.state.awaitingApproval || false
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

    // Validate required fields
    if (!rawSessionInput) {
        return res.status(400).json({ error: 'rawSessionInput is required' });
    }

    const requiredFields = ['roster', 'accusation', 'sessionReport', 'directorNotes'];
    const missingFields = requiredFields.filter(f => !rawSessionInput[f]);
    if (missingFields.length > 0) {
        return res.status(400).json({
            error: `rawSessionInput missing required fields: ${missingFields.join(', ')}`
        });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/start: theme=${theme}`);

    try {
        // Phase 3: Start EVIDENCE pipeline immediately (context-free preprocessing)
        // Evidence pipeline only needs sessionId - no playerFocus or sessionConfig required
        const pipelineConfig = {
            configurable: {
                sessionId,
                theme,
                dataDir: path.join(__dirname, 'data')
            }
        };
        backgroundPipelineManager.startEvidencePipeline(sessionId, { sessionId }, pipelineConfig);
        console.log(`[${new Date().toISOString()}] Started evidence pipeline for session ${sessionId}`);

        // Phase 4e: Start PHOTO pipeline at T+0 (not after parseRawInput)
        // photosPath is available now - reuse sanitizePath from input-nodes.js (DRY)
        // Photo analysis takes ~60s - starting now hides it behind user think time during checkpoints.
        const photosPath = sanitizePath(rawSessionInput.photosPath);
        if (photosPath) {
            backgroundPipelineManager.startPhotoPipeline(sessionId, {
                sessionId,
                sessionConfig: { photosPath }
            }, pipelineConfig);
            console.log(`[${new Date().toISOString()}] Started photo pipeline for session ${sessionId}`);
        }

        // Use sessionId as thread_id for consistency with /api/session/:id/approve
        // (Commit 8.9.9 - Fix for thread_id mismatch that caused infinite loops)
        const threadId = sessionId;

        // Use shared graph
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = {
            configurable: {
                sessionId,
                theme,
                thread_id: threadId
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
        initialState.awaitingApproval = false;
        initialState.approvalType = null;
        const result = await graph.invoke(initialState, config);

        // Phase 4e: Fallback photo pipeline start (only if not started at T+0)
        // If photosPath wasn't in rawSessionInput but is in parsed sessionConfig, start now.
        // startPhotoPipeline has internal guard preventing duplicate starts.
        if (result.sessionConfig?.photosPath && !photosPath) {
            backgroundPipelineManager.startPhotoPipeline(sessionId, {
                sessionId,
                sessionConfig: result.sessionConfig
            }, pipelineConfig);
            console.log(`[${new Date().toISOString()}] Started photo pipeline for session ${sessionId} (fallback)`);
        }

        // Build response with checkpoint data
        const response = {
            sessionId,
            currentPhase: result.currentPhase,
            awaitingApproval: result.awaitingApproval || false,
            approvalType: result.approvalType || null
        };

        // Add approval-specific data using DRY helper
        if (result.awaitingApproval && result.approvalType) {
            Object.assign(response, getApprovalData(result.approvalType, result));
        }

        res.json(response);

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
 * Approve current checkpoint and advance workflow
 */
app.post('/api/session/:id/approve', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const approvals = req.body;

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve:`, JSON.stringify(approvals));

    try {
        // Check current state first
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const state = session.state;
        if (!state.awaitingApproval) {
            return res.status(400).json({
                sessionId,
                error: 'Session is not awaiting approval',
                currentPhase: state.currentPhase
            });
        }

        // Use buildApprovalState helper (DRY)
        const { state: approvalState, error: validationError } = buildApprovalState(approvals);
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        // NOTE: Background pipelines now start earlier with staggered timing (Phase 3 optimization):
        // - Evidence pipeline: starts at session start (context-free, no playerFocus needed)
        // - Photo pipeline: starts after parseRawInput completes (needs sessionConfig.photosPath)
        // See POST /api/session/:id/start handler for pipeline triggers

        // Use theme from session state (not hardcoded)
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = {
            configurable: {
                sessionId,
                theme: state.theme || 'journalist',
                thread_id: sessionId
            }
        };

        const result = await graph.invoke(approvalState, config);

        // Build response
        const response = {
            sessionId,
            previousPhase: state.currentPhase,
            currentPhase: result.currentPhase,
            awaitingApproval: result.awaitingApproval || false,
            approvalType: result.approvalType || null
        };

        // Add approval-specific data using DRY helper
        if (result.awaitingApproval && result.approvalType) {
            Object.assign(response, getApprovalData(result.approvalType, result));
        }

        // Include completion data
        if (result.currentPhase === PHASES.COMPLETE) {
            response.assembledHtml = result.assembledHtml;
            response.validationResults = result.validationResults;
        }

        // Include errors
        if (result.errors?.length > 0) {
            response.errors = result.errors;
        }

        res.json(response);

    } catch (error) {
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve error:`, error);
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
                thread_id: sessionId
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

        // Clear approval state
        initialState.awaitingApproval = false;
        initialState.approvalType = null;

        // Apply overrides
        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        const result = await graph.invoke(initialState, config);

        // Build response with approval data (same pattern as /start and /approve)
        const response = {
            sessionId,
            rolledBackTo: rollbackTo,
            currentPhase: result.currentPhase,
            awaitingApproval: result.awaitingApproval || false,
            approvalType: result.approvalType || null,
            fieldsCleared: fieldsToClear
        };

        // Add approval-specific data using DRY helper
        if (result.awaitingApproval && result.approvalType) {
            Object.assign(response, getApprovalData(result.approvalType, result));
        }

        res.json(response);

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
 * Get background pipeline status for debugging
 */
app.get('/api/session/:id/background', requireAuth, (req, res) => {
    const { id: sessionId } = req.params;
    const status = backgroundPipelineManager.getFullStatus(sessionId);
    res.json({
        sessionId,
        ...status
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
