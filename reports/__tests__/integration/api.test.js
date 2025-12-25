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

const { PHASES, APPROVAL_TYPES } = require('../../lib/workflow/state');

// Fixtures for mock responses
const mockEvidenceBundle = require('../fixtures/mock-responses/evidence-bundle.json');
const mockArcAnalysis = require('../fixtures/mock-responses/arc-analysis.json');
const mockOutline = require('../fixtures/mock-responses/outline.json');
const mockValidationPassed = require('../fixtures/mock-responses/validation-results.json');

/**
 * Simulates the /api/generate endpoint handler logic.
 * This mirrors the handler in server.js for testability.
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

        // Build initial state from approvals
        let initialState = {};
        if (approvals) {
            if (approvals.evidenceBundle === true) {
                initialState.awaitingApproval = false;
            }
            if (approvals.selectedArcs && Array.isArray(approvals.selectedArcs)) {
                if (approvals.selectedArcs.length === 0) {
                    return {
                        status: 400,
                        json: { error: 'selectedArcs cannot be empty. At least one arc must be selected.' }
                    };
                }
                initialState.selectedArcs = approvals.selectedArcs;
                initialState.awaitingApproval = false;
            }
            if (approvals.outline === true) {
                initialState.awaitingApproval = false;
            }
        }

        const result = await graph.invoke(initialState, config);

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
                case APPROVAL_TYPES.EVIDENCE_BUNDLE:
                    response.evidenceBundle = result.evidenceBundle;
                    break;
                case APPROVAL_TYPES.ARC_SELECTION:
                    response.narrativeArcs = result.narrativeArcs;
                    break;
                case APPROVAL_TYPES.OUTLINE:
                    response.outline = result.outline;
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

        return { status: 200, json: response };

    } catch (error) {
        return {
            status: 500,
            json: {
                sessionId,
                currentPhase: PHASES.ERROR,
                error: error.message,
                details: 'Report generation failed. Check server logs.'
            }
        };
    }
}

// ============================================================================
// Mock Graph Factories
// ============================================================================

/**
 * Create a mock graph that returns a completed state
 */
function createMockCompletedGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.COMPLETE,
            awaitingApproval: false,
            approvalType: null,
            assembledHtml: '<html><body>Test Article</body></html>',
            validationResults: mockValidationPassed
        })
    };
}

/**
 * Create a mock graph that pauses at evidence approval
 */
function createMockEvidenceApprovalGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.CURATE_EVIDENCE,
            awaitingApproval: true,
            approvalType: APPROVAL_TYPES.EVIDENCE_BUNDLE,
            evidenceBundle: mockEvidenceBundle
        })
    };
}

/**
 * Create a mock graph that pauses at arc selection
 */
function createMockArcSelectionGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.ANALYZE_ARCS,
            awaitingApproval: true,
            approvalType: APPROVAL_TYPES.ARC_SELECTION,
            narrativeArcs: mockArcAnalysis.narrativeArcs
        })
    };
}

/**
 * Create a mock graph that pauses at outline approval
 */
function createMockOutlineApprovalGraph() {
    return {
        invoke: async () => ({
            currentPhase: PHASES.GENERATE_OUTLINE,
            awaitingApproval: true,
            approvalType: APPROVAL_TYPES.OUTLINE,
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
            awaitingApproval: false,
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

    describe('approval checkpoint responses', () => {
        it('returns evidenceBundle when awaiting evidence approval', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockEvidenceApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.awaitingApproval).toBe(true);
            expect(response.json.approvalType).toBe(APPROVAL_TYPES.EVIDENCE_BUNDLE);
            expect(response.json.evidenceBundle).toBeDefined();
        });

        it('returns narrativeArcs when awaiting arc selection', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockArcSelectionGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.awaitingApproval).toBe(true);
            expect(response.json.approvalType).toBe(APPROVAL_TYPES.ARC_SELECTION);
            expect(response.json.narrativeArcs).toBeDefined();
        });

        it('returns outline when awaiting outline approval', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockOutlineApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.status).toBe(200);
            expect(response.json.awaitingApproval).toBe(true);
            expect(response.json.approvalType).toBe(APPROVAL_TYPES.OUTLINE);
            expect(response.json.outline).toBeDefined();
        });

        it('does not include unrelated approval data', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockEvidenceApprovalGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.evidenceBundle).toBeDefined();
            // Should NOT include other approval data
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

        it('does not include approval fields when complete', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.awaitingApproval).toBe(false);
            expect(response.json.approvalType).toBeNull();
        });
    });

    describe('approval processing', () => {
        it('sets awaitingApproval to false when evidenceBundle approval is true', async () => {
            // This test verifies the approval logic in the handler
            // Create a graph that captures the initial state passed to it
            let capturedInitialState = null;
            const graph = {
                invoke: async (initialState) => {
                    capturedInitialState = initialState;
                    return { currentPhase: PHASES.COMPLETE, awaitingApproval: false };
                }
            };

            const req = {
                body: {
                    sessionId: 'test-123',
                    theme: 'journalist',
                    approvals: { evidenceBundle: true }
                }
            };

            await handleGenerateRequest(req, graph);

            expect(capturedInitialState.awaitingApproval).toBe(false);
        });

        it('sets selectedArcs in initial state when provided', async () => {
            let capturedInitialState = null;
            const graph = {
                invoke: async (initialState) => {
                    capturedInitialState = initialState;
                    return { currentPhase: PHASES.COMPLETE, awaitingApproval: false };
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
            expect(capturedInitialState.awaitingApproval).toBe(false);
        });

        it('sets awaitingApproval to false when outline approval is true', async () => {
            let capturedInitialState = null;
            const graph = {
                invoke: async (initialState) => {
                    capturedInitialState = initialState;
                    return { currentPhase: PHASES.COMPLETE, awaitingApproval: false };
                }
            };

            const req = {
                body: {
                    sessionId: 'test-123',
                    theme: 'journalist',
                    approvals: { outline: true }
                }
            };

            await handleGenerateRequest(req, graph);

            expect(capturedInitialState.awaitingApproval).toBe(false);
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
            expect(response.json.error).toBe('Graph execution failed');
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

            expect(response.json.details).toBe('Report generation failed. Check server logs.');
        });
    });

    describe('response structure', () => {
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

        it('always includes awaitingApproval boolean in response', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(typeof response.json.awaitingApproval).toBe('boolean');
        });

        it('always includes approvalType in response (null when not awaiting)', async () => {
            const req = { body: { sessionId: 'test-123', theme: 'journalist' } };
            const graph = createMockCompletedGraph();

            const response = await handleGenerateRequest(req, graph);

            expect(response.json.approvalType).toBeNull();
        });
    });
});
