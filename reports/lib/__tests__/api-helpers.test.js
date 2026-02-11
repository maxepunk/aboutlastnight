/**
 * API Helpers Unit Tests
 *
 * Tests for shared helpers extracted from server.js:
 * - buildRollbackState: Builds state object for rollback operations
 * - createGraphAndConfig: Creates graph instance and config object
 * - sendErrorResponse: Sends sanitized 500 error responses
 */

const {
  ROLLBACK_CLEARS,
  ROLLBACK_COUNTER_RESETS,
  PHASES
} = require('../workflow/state');

// Mock createReportGraphWithCheckpointer before requiring api-helpers
jest.mock('../workflow/graph', () => ({
  createReportGraphWithCheckpointer: jest.fn(() => ({ mockGraph: true }))
}));

const { createReportGraphWithCheckpointer } = require('../workflow/graph');
const { buildRollbackState, createGraphAndConfig, sendErrorResponse } = require('../api-helpers');

// ═══════════════════════════════════════════════════════
// buildRollbackState
// ═══════════════════════════════════════════════════════

describe('buildRollbackState', () => {
  test('returns object with all ROLLBACK_CLEARS fields set to null', () => {
    const state = buildRollbackState('arc-selection');
    const expectedFields = ROLLBACK_CLEARS['arc-selection'];

    for (const field of expectedFields) {
      expect(state).toHaveProperty(field, null);
    }
  });

  test('includes counter resets from ROLLBACK_COUNTER_RESETS', () => {
    const state = buildRollbackState('arc-selection');
    const expectedCounters = ROLLBACK_COUNTER_RESETS['arc-selection'];

    for (const [key, value] of Object.entries(expectedCounters)) {
      expect(state[key]).toBe(value);
    }
  });

  test('sets currentPhase to null', () => {
    const state = buildRollbackState('arc-selection');
    expect(state.currentPhase).toBeNull();
  });

  test('defaults to input-review when no argument provided', () => {
    const state = buildRollbackState();
    const expectedFields = ROLLBACK_CLEARS['input-review'];

    for (const field of expectedFields) {
      expect(state).toHaveProperty(field, null);
    }

    const expectedCounters = ROLLBACK_COUNTER_RESETS['input-review'];
    for (const [key, value] of Object.entries(expectedCounters)) {
      expect(state[key]).toBe(value);
    }
  });

  test('works for each valid rollback point', () => {
    for (const point of Object.keys(ROLLBACK_CLEARS)) {
      const state = buildRollbackState(point);

      // All fields from ROLLBACK_CLEARS should be null
      for (const field of ROLLBACK_CLEARS[point]) {
        expect(state).toHaveProperty(field, null);
      }

      // Counter resets should be present
      const counters = ROLLBACK_COUNTER_RESETS[point];
      for (const [key, value] of Object.entries(counters)) {
        expect(state[key]).toBe(value);
      }

      // currentPhase always null
      expect(state.currentPhase).toBeNull();
    }
  });

  test('does not include extra unexpected fields', () => {
    const state = buildRollbackState('article');
    const expectedKeys = [
      ...ROLLBACK_CLEARS['article'],
      ...Object.keys(ROLLBACK_COUNTER_RESETS['article']),
      'currentPhase'
    ];

    for (const key of Object.keys(state)) {
      expect(expectedKeys).toContain(key);
    }
  });

  test('throws on invalid rollback point', () => {
    expect(() => buildRollbackState('nonexistent')).toThrow("Invalid rollback point: 'nonexistent'");
  });
});

// ═══════════════════════════════════════════════════════
// createGraphAndConfig
// ═══════════════════════════════════════════════════════

describe('createGraphAndConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns { graph, config } object', () => {
    const result = createGraphAndConfig('1221', 'journalist', {
      checkpointer: { mockCheckpointer: true },
      promptBuilder: { mockPromptBuilder: true }
    });

    expect(result).toHaveProperty('graph');
    expect(result).toHaveProperty('config');
  });

  test('config.configurable includes sessionId, theme, thread_id (no promptBuilder)', () => {
    const result = createGraphAndConfig('1221', 'journalist', {
      checkpointer: {}
    });

    expect(result.config.configurable).toEqual({
      sessionId: '1221',
      theme: 'journalist',
      thread_id: '1221'
    });
  });

  test('calls createReportGraphWithCheckpointer with provided checkpointer', () => {
    const checkpointer = { mockCheckpointer: true };
    createGraphAndConfig('1221', 'journalist', {
      checkpointer
    });

    expect(createReportGraphWithCheckpointer).toHaveBeenCalledWith(checkpointer);
  });

  test('defaults theme to journalist when not provided', () => {
    const result = createGraphAndConfig('1221', undefined, {
      checkpointer: {},
      promptBuilder: {}
    });

    expect(result.config.configurable.theme).toBe('journalist');
  });

  test('thread_id matches sessionId', () => {
    const result = createGraphAndConfig('0225', 'detective', {
      checkpointer: {},
      promptBuilder: {}
    });

    expect(result.config.configurable.thread_id).toBe('0225');
    expect(result.config.configurable.sessionId).toBe('0225');
  });
});

// ═══════════════════════════════════════════════════════
// sendErrorResponse
// ═══════════════════════════════════════════════════════

describe('sendErrorResponse', () => {
  let mockRes;
  let consoleSpy;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('calls console.error with full error and context string', () => {
    const error = new Error('Something broke');
    sendErrorResponse(mockRes, '1221', error, 'POST /api/test');

    expect(consoleSpy).toHaveBeenCalledTimes(1);
    const logMessage = consoleSpy.mock.calls[0][0];
    expect(logMessage).toContain('POST /api/test');
    expect(consoleSpy.mock.calls[0][1]).toBe(error);
  });

  test('calls res.status(500).json() with sanitized response', () => {
    const error = new Error('Internal details should not leak');
    sendErrorResponse(mockRes, '1221', error, 'test context');

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledTimes(1);

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
    // Must NOT contain the raw error message
    expect(JSON.stringify(response)).not.toContain('Internal details should not leak');
  });

  test('response includes generic error message', () => {
    sendErrorResponse(mockRes, '1221', new Error('secret'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
  });

  test('when sessionId provided, adds sessionId and PHASES.ERROR', () => {
    sendErrorResponse(mockRes, '1221', new Error('test'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.sessionId).toBe('1221');
    expect(response.currentPhase).toBe(PHASES.ERROR);
    expect(response.details).toContain('ctx');
    expect(response.details).toContain('Check server logs');
  });

  test('when sessionId is null, returns simple error object', () => {
    sendErrorResponse(mockRes, null, new Error('test'), 'ctx');

    const response = mockRes.json.mock.calls[0][0];
    expect(response.error).toBe('Internal server error');
    expect(response).not.toHaveProperty('sessionId');
    expect(response).not.toHaveProperty('currentPhase');
  });
});
