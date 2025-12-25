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

// Shared checkpointer instance - must persist across API calls for resume to work
const sharedCheckpointer = new MemorySaver();
const { isClaudeAvailable } = require('./lib/sdk-client');

const app = express();
const PORT = 3001;

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
 *     - EVIDENCE_BUNDLE: evidenceBundle
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
    const { sessionId, theme, rawSessionInput, rollbackTo, stateOverrides, approvals } = req.body;

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

    console.log(`[${new Date().toISOString()}] /api/generate: sessionId=${sessionId}, theme=${theme}, rollbackTo=${rollbackTo || 'none'}, hasRawInput=${!!rawSessionInput}, hasOverrides=${!!stateOverrides}, approvals=${JSON.stringify(approvals || {})}`);

    try {
        // Use shared checkpointer to persist state across API calls
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);

        // Build config for graph execution
        const config = {
            configurable: {
                sessionId,
                theme,
                thread_id: sessionId  // For checkpointer to track session
            }
        };

        // Build initial state from rollback, overrides, rawSessionInput, and approvals
        let initialState = {};

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

        if (approvals) {
            // Input review approval (Commit 8.9): apply edits and clear approval flag
            if (approvals.inputReview === true) {
                initialState.awaitingApproval = false;
                // Apply user edits if provided
                if (approvals.inputEdits) {
                    initialState._inputEdits = approvals.inputEdits;
                }
            }

            // Paper evidence selection (Commit 8.9.4): set selectedPaperEvidence and clear approval flag
            if (approvals.selectedPaperEvidence && Array.isArray(approvals.selectedPaperEvidence)) {
                initialState.selectedPaperEvidence = approvals.selectedPaperEvidence;
                initialState.awaitingApproval = false;
            }

            // Character ID mappings (Commit 8.9.5): set characterIdMappings and clear approval flag
            // Format: { "photo1.jpg": { characters: ["Victoria", "Morgan"], locationCorrection: null }, ... }
            if (approvals.characterIds && typeof approvals.characterIds === 'object') {
                initialState.characterIdMappings = approvals.characterIds;
                initialState.awaitingApproval = false;
            }

            // Evidence bundle approval: clear awaitingApproval flag
            if (approvals.evidenceBundle === true) {
                initialState.awaitingApproval = false;
            }

            // Arc selection: set selectedArcs and clear approval flag
            if (approvals.selectedArcs && Array.isArray(approvals.selectedArcs)) {
                if (approvals.selectedArcs.length === 0) {
                    return res.status(400).json({
                        error: 'selectedArcs cannot be empty. At least one arc must be selected.'
                    });
                }
                initialState.selectedArcs = approvals.selectedArcs;
                initialState.awaitingApproval = false;
            }

            // Outline approval: clear awaitingApproval flag
            if (approvals.outline === true) {
                initialState.awaitingApproval = false;
            }

            // Article approval: clear awaitingApproval flag (Commit 8.9.7)
            if (approvals.article === true) {
                initialState.awaitingApproval = false;
            }
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
                case APPROVAL_TYPES.EVIDENCE_BUNDLE:
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
            }
        }
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

    app.listen(PORT, () => {
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
})();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n\nShutting down gracefully...');
    process.exit(0);
});
