/**
 * ALN Director Console - Backend Server
 * Uses Claude Agent SDK via LangGraph workflow for AI operations
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// LangGraph workflow modules
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('./lib/workflow/graph');
const {
  PHASES,
  ROLLBACK_CLEARS,
  VALID_ROLLBACK_POINTS,
  REVISION_CAPS
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
const { buildRollbackState, createGraphAndConfig, sendErrorResponse, confineToBase } = require('./lib/api-helpers');
const { createLoginRateLimiter } = require('./lib/login-rate-limiter');
const { staticGuard } = require('./lib/static-guard');
const { buildOutcomeRecord, recordSessionOutcome, getSessionOutcome, clearSessionOutcome } = require('./lib/session-outcome');
const { acquireSessionLock, releaseSessionLock } = require('./lib/session-locks');
const { runGraphInBackground } = require('./lib/api-background-runner');
const { SchemaValidator } = require('./lib/schema-validator');
const outlineValidator = new SchemaValidator();

// Shared checkpointer instance - DURABLE (DUR-1): sessions survive restart/crash/deploy.
// SqliteSaver.fromConnString opens (and creates) the db; .db is the better-sqlite3 handle.
const CHECKPOINT_DB_PATH = path.join(__dirname, 'data', 'checkpoints.sqlite');
fs.mkdirSync(path.dirname(CHECKPOINT_DB_PATH), { recursive: true });
const sharedCheckpointer = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);

// Base directory all browse/file requests are confined to (SEC-1/SEC-2)
const DATA_DIR = path.join(__dirname, 'data');

// Login brute-force protection (SEC-5): 5 failures / 15 min per IP, 15 min lockout
const loginRateLimiter = createLoginRateLimiter({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000
});

// Shared promptBuilder - created at startup, injected into workflow config (Commit 8.18)
// Persists cache across all graph invocations for efficient prompt loading
let sharedPromptBuilder = null;

// In-flight background tasks (DUR-2): the /approve handler runs the graph in a
// setImmediate; SIGINT must await these (and refuse new ones) before exit so a
// resume's checkpoint write + SSE emit are never severed mid-flight.
const inFlightTasks = new Set();
let shuttingDown = false;
let httpServer = null; // hoisted so SIGINT (module scope) can drain + close it

/**
 * Drain in-flight background tasks, then close the durable checkpointer's
 * sqlite handle, then close the HTTP server — in that order. Pure + injectable
 * so it is unit-testable (the SIGINT handler itself calls process.exit).
 * @param {{inFlight:Set<Promise>, checkpointer:{db:{close:Function}}, server?:{close:Function}}} deps
 */
async function drainAndClose({ inFlight, checkpointer, server, closeTimeoutMs = 5000 }) {
  if (inFlight && inFlight.size > 0) {
    // allSettled: a rejected resume must not abort the drain of the others
    await Promise.allSettled(Array.from(inFlight));
  }
  if (checkpointer && checkpointer.db && typeof checkpointer.db.close === 'function') {
    checkpointer.db.close();
  }
  if (server && typeof server.close === 'function') {
    // server.close() stops accepting NEW connections but does not terminate existing
    // keep-alive / SSE connections (the /progress stream is long-lived), so its callback
    // may never fire. Backstop with a timeout so SIGINT still exits cleanly — by this point
    // the checkpoint write + db handle close are already done, so nothing is lost.
    // (clear the timer when close() does call back, so we never leave a dangling handle.)
    await new Promise(resolve => {
      const timer = setTimeout(resolve, closeTimeoutMs);
      server.close(() => { clearTimeout(timer); resolve(); });
    });
  }
}

/**
 * Get session state from checkpointer without invoking the graph
 * Used by read-only endpoints to inspect state at any checkpoint
 * @param {string} sessionId - The session/thread ID
 * @returns {object|null} - { checkpointId, timestamp, state } or null if not found
 */
/**
 * Pure shaper: turn a graph.getState() snapshot (+ persisted outcome) into the
 * /state response body. Interrupt-aware (READ-1) and outcome-aware (DEL-1).
 * @param {object} graphState - result of graph.getState(config)
 * @param {object|null} outcome - getSessionOutcome(sessionId) result
 * @returns {object}
 */
function shapeSessionState(graphState, outcome) {
    const interruptTask = (graphState.tasks || []).find(t => t.interrupts && t.interrupts.length > 0);
    const interrupted = !!interruptTask;
    const checkpointType = interrupted
        ? (interruptTask.interrupts[0]?.value?.type || null)
        : null;
    return {
        checkpointId: graphState.config?.configurable?.checkpoint_id || null,
        timestamp: graphState.createdAt || null,
        interrupted,
        checkpointType,
        state: graphState.values || {},
        lastOutcome: outcome || null
    };
}

async function getSessionState(sessionId) {
    const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
    const config = { configurable: { thread_id: sessionId } };
    const graphState = await graph.getState(config);

    if (!graphState || !graphState.values || Object.keys(graphState.values).length === 0) {
        return null;
    }

    return shapeSessionState(graphState, getSessionOutcome(sessionId));
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
            return {
                narrativeArcs: state.narrativeArcs,
                revisionCount: state.arcRevisionCount || 0,
                humanRevisionCount: state.humanArcRevisionCount || 0,
                maxRevisions: REVISION_CAPS.ARCS,
                maxHumanRevisions: REVISION_CAPS.HUMAN_ARCS,
                previousFeedback: state._arcFeedback || null,
                _revisionTimedOut: state._arcAnalysisCache?._revisionTimedOut || false,
                _generationTimedOut: state._arcAnalysisCache?._generationTimedOut || false
            };
        case CHECKPOINT_TYPES.OUTLINE:
            return {
                outline: state.outline,
                revisionCount: state.outlineRevisionCount || 0,
                maxRevisions: REVISION_CAPS.OUTLINE,
                previousFeedback: state._outlineFeedback || null
            };
        case CHECKPOINT_TYPES.ARTICLE:
            return {
                contentBundle: state.contentBundle,
                articleHtml: state.assembledHtml,
                sessionId: state.sessionId,
                revisionCount: state.articleRevisionCount || 0,
                maxRevisions: REVISION_CAPS.ARTICLE,
                previousFeedback: state._articleFeedback || null
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
 * @param {object} currentState - Current graph state values (used for the theme default)
 * @returns {object} - { resume: payload for Command, stateUpdates: direct state updates, error: validation error or null }
 */
function buildResumePayload(approvals, currentState = {}, theme = (currentState.theme || 'journalist')) {
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

    // Arc selection: approve with selection, or reject-with-feedback
    if (Array.isArray(approvals.selectedArcs) && approvals.selectedArcs.length > 0) {
        validApprovalDetected = true;
        stateUpdates.selectedArcs = approvals.selectedArcs;
        resume.selectedArcs = approvals.selectedArcs;
    } else if (approvals.selectedArcs === false && typeof approvals.arcFeedback === 'string' && approvals.arcFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.arcFeedback.trim();
        stateUpdates._arcFeedback = approvals.arcFeedback.trim();
    } else if (approvals.selectedArcs && !Array.isArray(approvals.selectedArcs)) {
        error = 'selectedArcs must be an array or false (for rejection)';
    }

    // Outline: approve, approve-with-edits, or reject-with-feedback
    if (approvals.outline === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.outlineEdits && typeof approvals.outlineEdits === 'object') {
            const schemaName = theme === 'detective' ? 'detective-outline' : 'outline';
            const { valid, errors } = outlineValidator.validate(schemaName, approvals.outlineEdits);
            if (!valid) {
                const detail = (errors || [])
                    .map(function (e) { return (e.path || '/') + ' ' + e.message; })
                    .join('; ');
                error = 'Edited outline failed schema validation (' + schemaName + '): ' + detail;
                return { resume, stateUpdates, error };
            }
            stateUpdates.outline = approvals.outlineEdits;
        }
    } else if (approvals.outline === false && typeof approvals.outlineFeedback === 'string' && approvals.outlineFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.outlineFeedback.trim();
        stateUpdates._outlineFeedback = approvals.outlineFeedback.trim();
    }

    // Article: approve, approve-with-edits, or reject-with-feedback
    if (approvals.article === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.articleEdits && typeof approvals.articleEdits === 'object') {
            stateUpdates.contentBundle = approvals.articleEdits;
        }
    } else if (approvals.article === false && typeof approvals.articleFeedback === 'string' && approvals.articleFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.articleFeedback.trim();
        stateUpdates._articleFeedback = approvals.articleFeedback.trim();
    }

    // Pre-curation approval (Phase 4f)
    if (approvals.preCuration === true) {
        validApprovalDetected = true;
        stateUpdates.preCurationApproved = true;
        resume.preCurationApproved = true;
    }

    // Await roster checkpoint (Parallel branch architecture)
    // User provides roster to enable character ID mapping.
    // F1 (CR-1): pronouns captured alongside the roster MUST ride along on both
    // the Command resume AND the direct state update, or every character defaults
    // to they/them downstream (generateRosterSection.resolvePronouns).
    if (approvals.roster && Array.isArray(approvals.roster)) {
        validApprovalDetected = true;
        stateUpdates.roster = approvals.roster;
        resume.roster = approvals.roster;
        if (approvals.rosterPronouns && typeof approvals.rosterPronouns === 'object') {
            stateUpdates.rosterPronouns = approvals.rosterPronouns;
            resume.rosterPronouns = approvals.rosterPronouns;
        }
    }

    // Await full context checkpoint (Parallel branch architecture)
    // ROLL-4: full-context is now written as first-class channels (accusation/
    // sessionReport/directorNotesRaw); rawSessionInput (with photosPath from /start)
    // is left untouched so it still carries the at-start config.
    if (approvals.fullContext) {
        const { accusation, sessionReport, directorNotes } = approvals.fullContext;
        if (accusation && sessionReport && directorNotes) {
            validApprovalDetected = true;
            // ROLL-4: write first-class channels (no rawSessionInput merge). parseRawInput
            // and the checkpoint gate read these top-level.
            stateUpdates.accusation = accusation;
            stateUpdates.sessionReport = sessionReport;
            stateUpdates.directorNotesRaw = directorNotes;
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
// Both themes fully supported by LangGraph pipeline.
// 'journalist' = NovaNews investigative article (first-person, ~3000 words)
// 'detective' = Detective Anondono case file (third-person, ~750 words)
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
// SEC-6: the unauthenticated /api/auth/login surface gets a 1kb parser
// mounted BEFORE the 50mb global parser, so a pre-auth client cannot
// buffer 50mb and exhaust memory on this single-process server. Express's
// json parser is a no-op once req._body is set, so the global parser skips
// the already-parsed login body; a >1kb login body throws entity.too.large
// (413) before any handler.
app.use('/api/auth/login', express.json({ limit: '1kb' }));
app.use(express.json({ limit: '50mb' }));
// SEC (P7.8): block sensitive paths (data/, source, config, internal docs)
// before the root static mount, which is unauthenticated and would otherwise
// serve the entire repo (incl. data/checkpoints.sqlite) over the tunnel.
app.use(staticGuard);
app.use(express.static(__dirname));

// Serve console SPA
app.use('/console', express.static(path.join(__dirname, 'console')));
app.get('/console/*', (req, res) => res.sendFile(path.join(__dirname, 'console', 'index.html')));

// Serve session photos at /sessionphotos/{sessionId}/*
// Maps to data/{sessionId}/photos/* for article photo references
app.use('/sessionphotos/:sessionId', (req, res, next) => {
    const { sessionId } = req.params;
    const photosDir = path.join(__dirname, 'data', sessionId, 'photos');
    express.static(photosDir)(req, res, next);
});

// Session middleware for authentication.
// SECURITY (SEC-4): refuse to start without a real secret — the in-repo
// fallback let anyone forge {authenticated:true} cookies over the tunnel.
if (!process.env.SESSION_SECRET) {
    console.error(
        '\nFATAL: SESSION_SECRET is not set.\n' +
        'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'and add it to .env before starting the server.\n'
    );
    process.exit(1);
}

// Behind the Cloudflare tunnel the public origin is HTTPS, but Express sees
// the proxied (http) hop — trust the proxy so secure cookies are honored.
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // 'auto' = mark the cookie Secure whenever the request is HTTPS. With
        // `trust proxy` set (above) Express derives this from x-forwarded-proto,
        // so the cookie is Secure behind the tunnel and plain on http://localhost
        // dev — WITHOUT depending on NODE_ENV, which the launch scripts never set.
        secure: 'auto',
        sameSite: 'lax',
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
    const ip = req.ip;

    if (!correctPassword) {
        console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error'
        });
    }

    // SEC-5: refuse before checking the password if this IP is locked out.
    const gate = loginRateLimiter.check(ip);
    if (!gate.allowed) {
        const retryAfterSec = Math.ceil(gate.retryAfterMs / 1000);
        console.warn(`[${new Date().toISOString()}] Login blocked (rate limit) from ${ip}, retry in ${retryAfterSec}s`);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            success: false,
            message: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
            retryAfterMs: gate.retryAfterMs
        });
    }

    if (password === correctPassword) {
        loginRateLimiter.recordSuccess(ip);
        req.session.authenticated = true;
        console.log(`[${new Date().toISOString()}] Successful login from ${ip}`);
        res.json({
            success: true,
            message: 'Authentication successful'
        });
    } else {
        loginRateLimiter.recordFailure(ip);
        console.warn(`[${new Date().toISOString()}] Failed login attempt from ${ip}`);
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
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}`);
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
            interrupted: session.interrupted,
            checkpointType: session.checkpointType,
            lastOutcome: session.lastOutcome,
            state: session.state
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/state`);
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
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/checkpoint`);
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
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/state/${field}`);
    }
});

// Table-driven resource GET endpoints (Phase 2 - replaces 4 near-identical handlers)
const RESOURCE_ENDPOINTS = [
    { path: 'evidence', minPhase: 1.8,
      fields: state => ({ evidenceBundle: state.evidenceBundle || null }),
      check: state => !!state.evidenceBundle },
    { path: 'arcs', minPhase: 2.3,
      fields: state => ({ narrativeArcs: state.narrativeArcs || null, selectedArcs: state.selectedArcs || null }),
      check: state => !!state.narrativeArcs },
    { path: 'outline', minPhase: 3.2,
      fields: state => ({ outline: state.outline || null }),
      check: state => !!state.outline },
    { path: 'article', minPhase: 4.2,
      fields: state => ({ contentBundle: state.contentBundle || null, articleHtml: state.assembledHtml || null }),
      check: state => !!state.contentBundle }
];

for (const endpoint of RESOURCE_ENDPOINTS) {
    app.get(`/api/session/:id/${endpoint.path}`, requireAuth, async (req, res) => {
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
                available: phaseNum >= endpoint.minPhase && endpoint.check(state),
                ...endpoint.fields(state)
            });
        } catch (error) {
            sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/${endpoint.path}`);
        }
    });
}

// ===== SESSION ACTION ENDPOINTS (8.9.7) =====

/**
 * POST /api/session/:id/start
 * Start a fresh workflow with raw session input
 */
app.post('/api/session/:id/start', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    clearSessionOutcome(sessionId); // DEL-1: a fresh start wipes any prior run's outcome for this id
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
        const { graph, config } = createGraphAndConfig(sessionId, theme, {
            checkpointer: sharedCheckpointer
        });

        // Clear all state fields for fresh start
        // CRITICAL: theme must be in state (not just config) because initializeSession
        // and all nodes read state.theme, which defaults to 'journalist' in the annotation.
        const initialState = { theme, rawSessionInput, ...buildRollbackState('input-review') };
        const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });

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
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/start`);
    }
});

/**
 * POST /api/session/:id/approve
 * Approve current checkpoint and advance workflow using Command({ resume })
 */
app.post('/api/session/:id/approve', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const approvals = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve:`, JSON.stringify(approvals));

    let lockAcquired = false;

    try {
        // Create graph and config (theme resolved from state below)
        const { graph, config } = createGraphAndConfig(sessionId, 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Check if graph is interrupted using native LangGraph pattern
        const graphState = await graph.getState(config);
        if (!graphState || !isGraphInterrupted(graphState)) {
            // Recovery path: if graph ended with error after article approval,
            // guide user to rollback to article checkpoint
            const stateValues = graphState?.values || {};
            if (stateValues.currentPhase === 'error' && stateValues.articleApproved === true) {
                console.log(`[${new Date().toISOString()}] Recovering from article error state for session ${sessionId}`);
                return res.status(400).json({
                    sessionId,
                    error: 'Session ended with error after article approval. Use rollback to return to article checkpoint.',
                    recoverable: true,
                    rollbackTo: 'article'
                });
            }

            return res.status(400).json({
                sessionId,
                error: 'Session is not at a checkpoint',
                currentPhase: stateValues.currentPhase || null
            });
        }

        // Resolve theme from state
        const theme = graphState.values?.theme || 'journalist';
        config.configurable.theme = theme;

        // Build resume payload from approvals (pass current state for incremental input merging)
        const { resume, stateUpdates, error: validationError } = buildResumePayload(approvals, graphState.values, theme);
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        // CONC-1: reject a second concurrent approve on this session. After all 400
        // paths (so they never leak the lock); before res.json(processing) (so the
        // loser gets a 409, not a 200 'processing').
        if (!acquireSessionLock(sessionId)) {
            return res.status(409).json({
                sessionId,
                error: 'An approval is already in progress for this session. Please wait for it to finish.'
            });
        }
        lockAcquired = true;

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

        // Run workflow in background using Command({ resume }) pattern.
        // Wrap in a tracked promise so SIGINT can drain it (DUR-2).
        const task = new Promise((resolve) => {
        setImmediate(async () => {
            try {
                // Resume graph with Command - resume value becomes the return of interrupt()
                // Also pass stateUpdates for any direct state modifications
                const command = new Command({ resume, update: stateUpdates });
                const result = await graph.invoke(command, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });

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
                        response.outputPath = result.outputPath;
                        response.photosCopied = result.photosCopied;
                    }

                    // Include errors
                    if (result.errors?.length > 0) {
                        response.errors = result.errors;
                    }
                }

                // Persist the outcome FIRST so a dropped SSE is recoverable via GET /state (DEL-1)
                recordSessionOutcome(sessionId, buildOutcomeRecord(response));
                // Emit completion via SSE
                progressEmitter.emitComplete(sessionId, response);

            } catch (error) {
                console.error(`[${new Date().toISOString()}] Background workflow error for session ${sessionId}:`, error);
                const failedResponse = {
                    sessionId,
                    currentPhase: PHASES.ERROR,
                    error: 'Internal server error',
                    details: 'Approval operation failed. Check server logs.'
                };
                recordSessionOutcome(sessionId, buildOutcomeRecord(failedResponse));
                progressEmitter.emitComplete(sessionId, failedResponse);
            } finally {
                releaseSessionLock(sessionId);   // CONC-1 (P4.3)
                resolve();                       // DUR-2 drain (P1.4)
            }
        });
        }).finally(() => inFlightTasks.delete(task));
        inFlightTasks.add(task);

    } catch (error) {
        // If we acquired the lock but the background task never started (e.g. res.json
        // threw before setImmediate was scheduled), release it so the session isn't
        // permanently locked. Guarded by lockAcquired so a pre-acquire throw never
        // releases a DIFFERENT in-flight request's lock for this session.
        if (lockAcquired) releaseSessionLock(sessionId);
        // This only catches errors BEFORE the background task starts (validation, etc.)
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve error:`, error);

        // Emit SSE completion for sync errors so client doesn't hang waiting
        const earlyFailure = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Approval operation failed. Check server logs.'
        };
        recordSessionOutcome(sessionId, buildOutcomeRecord(earlyFailure));
        progressEmitter.emitComplete(sessionId, earlyFailure);

        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/approve`);
    }
});

/**
 * POST /api/session/:id/rollback
 * Rollback to a specific checkpoint
 */
app.post('/api/session/:id/rollback', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { rollbackTo, stateOverrides } = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

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
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const { graph, config } = createGraphAndConfig(sessionId, session.state.theme || 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Build rollback state (synchronous setup).
        const initialState = buildRollbackState(rollbackTo);

        // ROLL-4: stash prior full-context so AwaitFullContext pre-fills re-collection
        // whenever the rollback CLEARS those channels. buildRollbackState nulls the
        // channels; capture their current values first.
        if (ROLLBACK_CLEARS[rollbackTo]?.includes('accusation')) {
            initialState._previousFullContext = {
                accusation: session.state.accusation || null,
                sessionReport: session.state.sessionReport || null,
                directorNotes: session.state.directorNotesRaw || null
            };
        }

        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // DEL-1: a rolled-back session's prior TERMINAL outcome is stale the moment we
        // commit the rollback — clear it synchronously so a dropped SSE mid-rollback can't
        // surface the pre-rollback outcome via GET /state. The rollback's own completion
        // records a fresh outcome.
        clearSessionOutcome(sessionId);

        // Non-blocking: rollback re-invokes from the rollback point. Usually re-pauses fast,
        // but a rollback upstream of a long node can exceed the proxy timeouts on a held POST.
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: (result, graphState) => {
                const base = isGraphInterrupted(graphState)
                    ? buildInterruptResponse(
                        sessionId,
                        buildCompleteCheckpointData(getInterruptData(graphState), graphState.values),
                        result.currentPhase
                      )
                    : { sessionId, currentPhase: result.currentPhase };
                if (!isGraphInterrupted(graphState) && result.errors?.length > 0) {
                    base.errors = result.errors;
                }
                return { ...base, rolledBackTo: rollbackTo, fieldsCleared: ROLLBACK_CLEARS[rollbackTo] };
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/rollback`);
    }
});

/**
 * POST /api/session/:id/resume
 * Resume existing workflow (re-invoke graph at current state)
 * Replaces /api/generate's resume mode
 */
app.post('/api/session/:id/resume', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { stateOverrides } = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/resume`);

    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const theme = session.state.theme || 'journalist';
        const { graph, config } = createGraphAndConfig(sessionId, theme, {
            checkpointer: sharedCheckpointer
        });

        const initialState = {};
        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // Non-blocking: run graph.invoke in the background; deliver the result via SSE.
        // (A long re-invoke — e.g. generateContentBundle ~400s — used to exceed undici's
        //  5-min headersTimeout / Cloudflare's ~100s edge timeout on the held-open POST.)
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: (result, graphState) => {
                if (isGraphInterrupted(graphState)) {
                    const interruptData = getInterruptData(graphState);
                    const checkpointData = buildCompleteCheckpointData(interruptData, graphState.values);
                    return buildInterruptResponse(sessionId, checkpointData, result.currentPhase);
                }
                const response = { sessionId, currentPhase: result.currentPhase };
                if (result.currentPhase === PHASES.COMPLETE) {
                    response.assembledHtml = result.assembledHtml;
                    response.validationResults = result.validationResults;
                    response.outputPath = result.outputPath;
                    response.photosCopied = result.photosCopied;
                }
                if (result.errors?.length > 0) {
                    response.errors = result.errors;
                }
                return response;
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/resume`);
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server running',
        timestamp: new Date().toISOString(),
        endpoints: {
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
                resume: '/api/session/:id/resume (POST)'
            }
        }
    });
});

// Config endpoint - serves NON-SECRET client configuration (protected).
// SEC-3: NOTION_TOKEN is NEVER sent to the client — all Notion access is
// server-side (lib/notion-client.js). The console SPA does not read it.
app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        notionConfigured: Boolean(process.env.NOTION_TOKEN)
    });
});

// Browse local filesystem for directory/file selection (local dev tool)
app.get('/api/browse', requireAuth, async (req, res) => {
    const rawDir = req.query.dir || DATA_DIR;
    let targetDir;
    try {
        targetDir = confineToBase(DATA_DIR, sanitizePath(rawDir) || DATA_DIR);
    } catch (err) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    try {
        const stat = await fs.promises.stat(targetDir);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true });
        const entries = dirents
            .filter(d => !d.name.startsWith('.'))
            .map(d => ({
                name: d.name,
                type: d.isDirectory() ? 'directory' : 'file',
                path: path.join(targetDir, d.name)
            }))
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        const parentDir = path.dirname(targetDir);
        const atRoot = path.resolve(targetDir) === path.resolve(DATA_DIR);
        res.json({
            path: targetDir,
            parent: atRoot ? null : parentDir,
            entries
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Directory not found' });
        }
        sendErrorResponse(res, null, err, 'GET /api/browse');
    }
});

// Serve individual files by absolute path (for photo thumbnails in console)
app.get('/api/file', requireAuth, (req, res) => {
    const raw = sanitizePath(req.query.path || '');
    if (!raw) return res.status(400).json({ error: 'Missing path parameter' });
    let filePath;
    try {
        filePath = confineToBase(DATA_DIR, raw);
    } catch (err) {
        return res.status(400).json({ error: 'Invalid path' });
    }
    res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
            res.status(err.status || 404).json({ error: 'File not found' });
        }
    });
});

// Redirect root to console SPA
app.get('/', (req, res) => {
    res.redirect('/console');
});

/**
 * Notion reachability + auth startup probe.
 * One lightweight authenticated GET; returns {ok, error} instead of throwing so the
 * startup IIFE can render a single loud failure card (mirrors isClaudeAvailable).
 * @param {{request: Function}} client - a NotionClient (injected for testing)
 */
async function probeNotionReachable(client) {
    try {
        await client.request('users/me');
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

// Body-size / malformed-JSON guard (SEC-6): return a clean 413/400 instead
// of leaking a stack trace for oversized or malformed request bodies.
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Malformed JSON body' });
    }
    return next(err);
});

// Start server with Claude Agent SDK health check
// Only start in normal runtime (not during tests)
if (require.main === module) {
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

    // Notion-reachability probe — fail loud at startup, not per-session.
    console.log('Checking Notion reachability...');
    const { NotionClient } = require('./lib/notion-client');
    if (!process.env.NOTION_TOKEN) {
        console.error('ERROR: NOTION_TOKEN is not set. Notion fetches will fail. Aborting startup.');
        process.exit(1);
    }
    const notionProbe = await probeNotionReachable(new NotionClient(process.env.NOTION_TOKEN));
    if (!notionProbe.ok) {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Notion not reachable                              ║
║                                                           ║
║  ${String(notionProbe.error).slice(0, 53).padEnd(53)}║
║                                                           ║
║  Check NOTION_TOKEN validity and network access.          ║
║  Server startup aborted.                                  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }
    console.log('Notion reachable ✓');

    // Validate theme files at startup (Commit 8.18)
    console.log('Validating theme files...');
    sharedPromptBuilder = createPromptBuilder();
    const themeValidation = await sharedPromptBuilder.theme.validate();
    if (!themeValidation.valid) {
        console.warn(`[startup] Missing theme files: ${themeValidation.missing.join(', ')}`);
    } else {
        console.log(`Theme files validated (${sharedPromptBuilder.theme.cache.size} cached) ✓`);
    }

    // SEC-A-3: bind loopback only — the Cloudflare tunnel (→ localhost) is the
    // sole remote ingress. Prevents a direct-LAN client from spoofing
    // X-Forwarded-For (trusted via `trust proxy`, Task 7.3) to rotate req.ip and
    // evade the SEC-5 login rate-limiter. Console is reachable via the public
    // tunnel URL or http://localhost:3001 — NOT via the host's LAN IP.
    httpServer = app.listen(PORT, '127.0.0.1', () => {
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
    httpServer.timeout = SERVER_TIMEOUT_MS;
    httpServer.requestTimeout = SERVER_TIMEOUT_MS;  // Node 18+ default is 5min, we need 20min
    httpServer.keepAliveTimeout = SERVER_TIMEOUT_MS;
    httpServer.headersTimeout = SERVER_TIMEOUT_MS + 1000; // Must be > keepAliveTimeout
})();
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...');
    shuttingDown = true; // refuse new /approve resumes (DUR-2)
    try {
        if (inFlightTasks.size > 0) {
            console.log(`Draining ${inFlightTasks.size} in-flight task(s)...`);
        }
        await drainAndClose({
            inFlight: inFlightTasks,
            checkpointer: sharedCheckpointer,
            server: httpServer
        });
        console.log('Drained in-flight work; closed checkpointer + server.');
    } catch (err) {
        console.warn('Drain/close error:', err.message);
    }
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

// Export helpers for testing
module.exports = { buildResumePayload, drainAndClose, _inFlight: inFlightTasks, probeNotionReachable, getSessionOutcome, shapeSessionState };
