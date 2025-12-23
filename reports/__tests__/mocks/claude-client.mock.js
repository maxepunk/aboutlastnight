/**
 * Mock Claude Client for Testing
 *
 * Provides deterministic responses for unit and integration tests.
 * Allows setting mock responses based on prompt patterns or systemPrompt content.
 *
 * Usage:
 *   jest.mock('../../lib/claude-client', () => require('../mocks/claude-client.mock'));
 *
 *   const { setMockResponse, clearMocks } = require('../mocks/claude-client.mock');
 *   setMockResponse('evidence', JSON.stringify({ tokens: [] }));
 */

// Store mock responses: pattern -> response (or function)
const mockResponses = new Map();

// Store call history for assertions
const callHistory = [];

// Default response when no pattern matches
let defaultResponse = JSON.stringify({
  metadata: {
    sessionId: 'mock-session',
    theme: 'journalist',
    generatedAt: new Date().toISOString()
  },
  headline: { main: 'Mock Test Headline With Enough Length' },
  sections: [
    {
      id: 'mock-section',
      type: 'narrative',
      content: [
        { type: 'paragraph', text: 'Mock paragraph content for testing.' }
      ]
    }
  ]
});

/**
 * Mock implementation of callClaude
 * Finds matching response based on prompt/systemPrompt patterns
 *
 * @param {Object} options - Same interface as real callClaude
 * @returns {Promise<string>} - Mock response
 */
async function callClaude(options) {
  const { prompt, systemPrompt, model, jsonSchema, outputFormat } = options;

  // Record this call for test assertions
  callHistory.push({
    prompt,
    systemPrompt,
    model,
    jsonSchema,
    outputFormat,
    calledAt: new Date().toISOString()
  });

  // Find matching mock response
  for (const [pattern, response] of mockResponses) {
    const patternLower = pattern.toLowerCase();
    const promptLower = (prompt || '').toLowerCase();
    const systemPromptLower = (systemPrompt || '').toLowerCase();

    if (promptLower.includes(patternLower) || systemPromptLower.includes(patternLower)) {
      // If response is a function, call it with options
      if (typeof response === 'function') {
        return await response(options);
      }
      return response;
    }
  }

  // Return default response
  if (typeof defaultResponse === 'function') {
    return await defaultResponse(options);
  }
  return defaultResponse;
}

/**
 * Set a mock response for a specific pattern
 *
 * @param {string} pattern - Pattern to match in prompt or systemPrompt
 * @param {string|Function} response - Response string or function(options) => string
 */
function setMockResponse(pattern, response) {
  mockResponses.set(pattern, response);
}

/**
 * Set the default response when no patterns match
 *
 * @param {string|Function} response - Response string or function(options) => string
 */
function setDefaultResponse(response) {
  defaultResponse = response;
}

/**
 * Clear all mock responses and reset to defaults
 */
function clearMocks() {
  mockResponses.clear();
  callHistory.length = 0;
  defaultResponse = JSON.stringify({
    metadata: {
      sessionId: 'mock-session',
      theme: 'journalist',
      generatedAt: new Date().toISOString()
    },
    headline: { main: 'Mock Test Headline With Enough Length' },
    sections: [
      {
        id: 'mock-section',
        type: 'narrative',
        content: [
          { type: 'paragraph', text: 'Mock paragraph content for testing.' }
        ]
      }
    ]
  });
}

/**
 * Get the call history for assertions
 * @returns {Array} - Array of call records
 */
function getCallHistory() {
  return [...callHistory];
}

/**
 * Get the last call for assertions
 * @returns {Object|null} - Last call record or null
 */
function getLastCall() {
  return callHistory.length > 0 ? callHistory[callHistory.length - 1] : null;
}

/**
 * Check if Claude was called with specific parameters
 *
 * @param {Object} expectedParams - Parameters to check
 * @returns {boolean}
 */
function wasCalledWith(expectedParams) {
  return callHistory.some(call => {
    for (const [key, value] of Object.entries(expectedParams)) {
      if (call[key] !== value) return false;
    }
    return true;
  });
}

/**
 * Mock implementation of getModelTimeout
 */
function getModelTimeout(model) {
  const MODEL_TIMEOUTS = {
    opus: 10 * 60 * 1000,
    sonnet: 5 * 60 * 1000,
    haiku: 2 * 60 * 1000
  };
  return MODEL_TIMEOUTS[model] || MODEL_TIMEOUTS.sonnet;
}

/**
 * Mock implementation of isClaudeAvailable
 * Always returns true in tests
 */
async function isClaudeAvailable() {
  return true;
}

module.exports = {
  callClaude,
  setMockResponse,
  setDefaultResponse,
  clearMocks,
  getCallHistory,
  getLastCall,
  wasCalledWith,
  getModelTimeout,
  isClaudeAvailable,
  MODEL_TIMEOUTS: {
    opus: 10 * 60 * 1000,
    sonnet: 5 * 60 * 1000,
    haiku: 2 * 60 * 1000
  }
};
