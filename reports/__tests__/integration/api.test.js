/**
 * API Endpoint Integration Tests
 *
 * Tests the /api/generate endpoint logic including:
 * - Input validation (sessionId, theme required)
 * - Response structure for approval checkpoints
 * - Response structure for completed pipelines
 * - Error handling
 *
 * Uses mock graph approach - the endpoint handler logic is tested
 * with mocked graph.invoke() results. Full graph testing is in workflow.test.js.
 * Manual HTTP testing with browser supplements these tests.
 */

const { PHASES } = require('../../lib/workflow/state');
const { CHECKPOINT_TYPES } = require('../../lib/workflow/checkpoint-helpers');

// Fixtures for mock responses
const mockEvidenceBundle = require('../fixtures/mock-responses/evidence-bundle.json');
const mockArcAnalysis = require('../fixtures/mock-responses/arc-analysis.json');
const mockOutline = require('../fixtures/mock-responses/outline.json');
const mockValidationPassed = require('../fixtures/mock-responses/validation-results.json');

/**
 * Simulates the /api/generate endpoint handler logic.
 * This mirrors the handler in server.js for testability.
 *
 * NOTE: Updated for interrupt() migration - uses interrupted: true + checkpoint
 * instead of awaitingApproval/approvalType
 *
 * @param {Object} req - Mock request object with body
 * @param {Object} graph - Mock graph with invoke() function
 * @returns {Object} Response object with status and json
 */
async function handleGenerateRequest(req, graph) {
    const { sessionId, theme, approvals } = req.body;

    // Validate required fields
    if (!sessionId) {
        return { status: 400, json: { error: 'sessionId is required' } };
    }

    if (!theme) {
        return { status: 400, json: { error: 'theme is required' } };
    }

    if (!['journalist', 'detective'].includes(theme)) {
        return {
            status: 400,
            json: { error: `Invalid theme: ${theme}. Use 'journalist' or 'detective'.` }
        };
    }

    try {
        const config = {
            configurable: {
                sessionId,
                theme,
                thread_id: sessionId
            }
        };

        // Build initial state from approvals (for resuming)
        // NOTE: interrupt() migration - no awaitingApproval field needed
        let initialState = {};
        if (approvals) {
            if (approvals.selectedArcs && Array.isArray(approvals.selectedArcs)) {
                if (approvals.selectedArcs.length === 0) {
                    return {
                        status: 400,
                        json: { error: 'selectedArcs cannot be empty. At least one arc must be selected.' }
                    };
                }
                initialState.selectedArcs = approvals.selectedArcs;
            }
        }

        const result = await graph.invoke(initialState, config);

        // Build response based on current state
        // NOTE: New format uses interrupted: true + checkpoint instead of awaitingApproval/approvalType
        const response = {
            sessionId,
            currentPhase: result.currentPhase
        };

        // Check for interrupt (new pattern)
        if (result.interrupted && result.checkpoint) {
            response.interrupted = true;
            response.checkpoint = result.checkpoint;

            // Include data for approval UI based on checkpoint type
            switch (result.checkpoint.type) {
                case CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS:
                    response.evidenceBundle = result.evidenceBundle;
                    break;
                case CHECKPOINT_TYPES.ARC_SELECTION:
                    response.narrativeArcs = result.narrativeArcs;
                    break;
                case CHECKPOINT_TYPES.OUTLINE:
                    response.outline = result.outline;
                    break;
            }
        } else {
            response.interrupted = false;
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

        return { status: 200, json: response };

    } catch (error) {
        console.error(`handleGenerateRequest error:`, error);
        return {
            status: 500,
            json: {
                sessionId,
                currentPhase: PHASES.ERROR,
                error: 'Internal server error',
                details: 'POST /api/generate. Check server logs.'
            }
        };
    }
}

// ============================================================================
// Mock Graph Factories - Updated for interrupt() migration
// ============================================================================

/**
 * Create a mock graph that returns a completed state
 */
function createMockCompletedGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.COMPLETE,
            interrupted: false,
            assembledHtml: '<html><body>Test Article</body></html>',
            validationResults: mockValidationPassed
        })
    };
}

/**
 * Create a mock graph that pauses at evidence approval (interrupt pattern)
 */
function createMockEvidenceApprovalGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.CURATE_EVIDENCE,
            interrupted: true,
            checkpoint: { type: CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS },
            evidenceBundle: mockEvidenceBundle
        })
    };
}

/**
 * Create a mock graph that pauses at arc selection (interrupt pattern)
 */
function createMockArcSelectionGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.ANALYZE_ARCS,
            interrupted: true,
            checkpoint: { type: CHECKPOINT_TYPES.ARC_SELECTION },
            narrativeArcs: mockArcAnalysis.narrativeArcs
        })
    };
}

/**
 * Create a mock graph that pauses at outline approval (interrupt pattern)
 */
function createMockOutlineApprovalGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.GENERATE_OUTLINE,
            interrupted: true,
            checkpoint: { type: CHECKPOINT_TYPES.OUTLINE },
            outline: mockOutline
        })
    };
}

/**
 * Create a mock graph that returns an error state
 */
function createMockErrorGraph(errors = [{ path: '/sections', message: 'validation failed' }]) {
    return {
        invoke: async () => ({
            currentPhase: PHASES.ERROR,
            interrupted: false,
            errors
        })
    };
}

/**
 * Create a mock graph that throws an exception
 */
function createMockThrowingGraph(message = 'Graph execution failed') {
    return {
        invoke: async () => {
            throw new Error(message);
        }
    };
}

describe('API /api/generate endpoint', () => {
    describe('input validation', () => {
        it('returns 400 when sessionId is missing', async () => {
            const req = { body: { theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(400);
            expect(response.json.error).toBe('sessionId is required');
        });

        it('returns 400 when theme is missing', async () => {
            const req = { body: { sessionId: 'test-123' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(400);
            expect(response.json.error).toBe('theme is required');
        });

        it('returns 400 for invalid theme value', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'invalid-theme' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(400);
            expect(response.json.error).toContain('Invalid theme');
            expect(response.json.error).toContain('invalid-theme');
        });

        it('accepts journalist theme', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
        });

        it('accepts detective theme', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'detective' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
        });
    });

    describe('approval checkpoint responses (interrupt pattern)', () => {
        it('returns evidenceBundle when interrupted at evidence checkpoint', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockEvidenceApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.interrupted).toBe(true);
            expect(response.json.checkpoint.type).toBe(CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS);
            expect(response.json.evidenceBundle).toBeDefined();
        });

        it('returns narrativeArcs when interrupted at arc selection', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockArcSelectionGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.interrupted).toBe(true);
            expect(response.json.checkpoint.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
            expect(response.json.narrativeArcs).toBeDefined();
        });

        it('returns outline when interrupted at outline checkpoint', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockOutlineApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.interrupted).toBe(true);
            expect(response.json.checkpoint.type).toBe(CHECKPOINT_TYPES.OUTLINE);
            expect(response.json.outline).toBeDefined();
        });

        it('does not include unrelated checkpoint data', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockEvidenceApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.evidenceBundle).toBeDefined();
            // Should NOT include other checkpoint data
            expect(response.json.narrativeArcs).toBeUndefined();
            expect(response.json.outline).toBeUndefined();
        });
    });

    describe('completed pipeline response', () => {
        it('returns assembledHtml on completion', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.currentPhase).toBe(PHASES.COMPLETE);
            expect(response.json.assembledHtml).toBeDefined();
            expect(response.json.assembledHtml).toContain('<html>');
        });

        it('returns validationResults on completion', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.validationResults).toBeDefined();
            expect(response.json.validationResults.passed).toBe(true);
        });

        it('does not include interrupt fields when complete', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.interrupted).toBe(false);
            expect(response.json.checkpoint).toBeUndefined();
        });
    });

    describe('approval processing (interrupt pattern)', () => {
        // NOTE: interrupt() migration - approvals now use Command({ resume })
        // These tests verify the handler properly passes approval data to the graph

        it('sets selectedArcs in initial state when provided', async () => {
            let capturedInitialState = null;
            const graph = {
                invoke: async (initialState) => {
                    capturedInitialState = initialState;
                    return { currentPhase: PHASES.COMPLETE, interrupted: false };
                }
            };

            const req = {
                body: {
                    sessionId: 'test-123',
                    theme: 'journalist',
                    approvals: { selectedArcs: ['The Money Trail', 'Hidden Truth'] }
                }
            };

            await handleGenerateRequest(req, graph);

            expect(capturedInitialState.selectedArcs).toEqual(['The Money Trail', 'Hidden Truth']);
            // NOTE: awaitingApproval no longer exists in state
        });

        it('returns 400 when selectedArcs is empty array', async () => {
            const req = {
                body: {
                    sessionId: 'test-123',
                    theme: 'journalist',
                    approvals: { selectedArcs: [] }
                }
            };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(400);
            expect(response.json.error).toContain('selectedArcs cannot be empty');
        });
    });

    describe('error handling', () => {
        it('returns 500 with error details when graph throws', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockThrowingGraph('Graph execution failed');

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(500);
            expect(response.json.currentPhase).toBe(PHASES.ERROR);
            expect(response.json.error).toBe('Internal server error');
            expect(response.json.sessionId).toBe('test-123');
        });

        it('returns errors array when graph returns ERROR phase', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockErrorGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.currentPhase).toBe(PHASES.ERROR);
            expect(response.json.errors).toBeDefined();
            expect(response.json.errors.length).toBeGreaterThan(0);
        });

        it('includes details message in 500 response', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockThrowingGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.details).toBe('POST /api/generate. Check server logs.');
        });
    });

    describe('response structure (interrupt pattern)', () => {
        it('always includes sessionId in response', async () => {
            const req = { body: { sessionId: 'my-session-id', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.sessionId).toBe('my-session-id');
        });

        it('always includes currentPhase in response', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.currentPhase).toBeDefined();
            expect(typeof response.json.currentPhase).toBe('string');
        });

        it('always includes interrupted boolean in response', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(typeof response.json.interrupted).toBe('boolean');
        });

        it('includes checkpoint only when interrupted', async () => {
            // When not interrupted
            const req1 = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph1 = createMockCompletedGraph();
            const response1 = await handleGenerateRequest(req1, graph1);
            expect(response1.json.checkpoint).toBeUndefined();

            // When interrupted
            const req2 = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph2 = createMockArcSelectionGraph();
            const response2 = await handleGenerateRequest(req2, graph2);
            expect(response2.json.checkpoint).toBeDefined();
            expect(response2.json.checkpoint.type).toBe(CHECKPOINT_TYPES.ARC_SELECTION);
        });
    });
});
