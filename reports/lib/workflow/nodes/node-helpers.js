/**
 * Node Helpers - Shared utilities for workflow nodes
 *
 * DRY extraction from photo-nodes.js, arc-specialist-nodes.js, evaluator-nodes.js, ai-nodes.js
 * These functions were duplicated 4x across node files.
 *
 * @module node-helpers
 */

const { sdkQuery } = require('../../sdk-client');

/**
 * Safely parse JSON with informative error messages
 *
 * Used by all nodes that receive Claude responses.
 * Provides context and response preview in error messages for debugging.
 *
 * @param {string} response - JSON string to parse
 * @param {string} context - Description for error messages (e.g., "arc analysis")
 * @returns {Object} Parsed JSON object
 * @throws {Error} With actionable message including context and response preview
 */
function safeParseJson(response, context = 'response') {
  try {
    return JSON.parse(response);
  } catch (error) {
    // Truncate response for logging (avoid huge error messages)
    const preview = response.length > 500
      ? response.substring(0, 500) + '... [truncated]'
      : response;

    throw new Error(
      `Failed to parse ${context}: ${error.message}\n` +
      `Response preview: ${preview}`
    );
  }
}

/**
 * Get SDK client from config or use default
 *
 * Supports dependency injection for testing - nodes can receive
 * a mock client via config.configurable.sdkClient
 *
 * @param {Object} config - Graph config with optional configurable.sdkClient
 * @returns {Function} SDK query function
 */
function getSdkClient(config) {
  return config?.configurable?.sdkClient || sdkQuery;
}

/**
 * Create a timestamped result object
 *
 * Standardizes the structure of empty/error results across nodes.
 *
 * @param {string} type - Type of result (e.g., 'photo-analysis', 'specialist-analysis')
 * @param {Object} options - Additional fields to include
 * @returns {Object} Timestamped result object
 */
function createTimestampedResult(type, options = {}) {
  return {
    type,
    analyzedAt: new Date().toISOString(),
    ...options
  };
}

/**
 * Validate that required fields exist in an object
 *
 * @param {Object} obj - Object to validate
 * @param {string[]} requiredFields - Array of field names that must exist
 * @param {string} context - Description for error messages
 * @throws {Error} If any required field is missing
 */
function validateRequiredFields(obj, requiredFields, context) {
  const missing = requiredFields.filter(field => obj[field] === undefined);
  if (missing.length > 0) {
    throw new Error(`${context} missing required fields: ${missing.join(', ')}`);
  }
}

/**
 * Safely convert issues array to string for error messages
 *
 * Handles cases where issues may be undefined, non-array, or contain objects.
 *
 * @param {*} issues - Issues array (or undefined/other)
 * @returns {string} Human-readable issues string
 */
function formatIssuesForMessage(issues) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return 'unspecified issues';
  }
  return issues
    .map(i => typeof i === 'string' ? i : JSON.stringify(i))
    .join(', ');
}

/**
 * Synthesize playerFocus from session config and director notes
 *
 * SINGLE SOURCE OF TRUTH for playerFocus structure.
 * Used by:
 * - input-nodes.js (parseRawInput) when processing raw input
 * - fetch-nodes.js (loadDirectorNotes) for backwards compatibility with legacy files
 *
 * PlayerFocus drives arc analysis via the playerFocusAlignment criterion (15%).
 *
 * @param {Object} sessionConfig - Session configuration with roster, accusation
 * @param {Object} directorNotes - Director notes with observations, whiteboard
 * @returns {Object} PlayerFocus object with investigation context
 */
function synthesizePlayerFocus(sessionConfig, directorNotes) {
  const whiteboard = directorNotes?.whiteboard || {};
  const observations = directorNotes?.observations || {};

  // Extract suspects from whiteboard if available
  const suspectsGroup = whiteboard.groups?.find(g =>
    g.label?.toLowerCase().includes('suspect')
  );
  const whiteboardSuspects = suspectsGroup?.members || [];

  // Extract connections as context
  const whiteboardConnections = (whiteboard.connections || []).map(c =>
    `${c.from} → ${c.to}${c.label ? ` (${c.label})` : ''}`
  );

  // Primary suspects from accusation
  const primarySuspects = sessionConfig?.accusation?.accused || [];

  // Secondary suspects from whiteboard not in primary
  const secondarySuspects = whiteboardSuspects.filter(s =>
    !primarySuspects.some(p => p.toLowerCase() === s.toLowerCase())
  );

  return {
    // What the article is about
    primaryInvestigation: sessionConfig?.accusation?.charge || 'Who killed Marcus Blackwood?',

    // Who was accused (primary) vs explored (secondary)
    primarySuspects,
    secondarySuspects,
    allSuspects: [...primarySuspects, ...secondarySuspects],

    // The formal accusation details
    accusation: {
      accused: sessionConfig?.accusation?.accused || [],
      charge: sessionConfig?.accusation?.charge || '',
      reasoning: sessionConfig?.accusation?.notes || ''
    },

    // Director observations (what ACTUALLY happened - highest weight for narrative)
    directorObservations: {
      behaviorPatterns: observations.behaviorPatterns || [],
      suspiciousCorrelations: observations.suspiciousCorrelations || [],
      notableMoments: observations.notableMoments || []
    },

    // Whiteboard context (what players explored during investigation)
    whiteboardContext: {
      namesFound: whiteboard.names || [],
      suspectsExplored: whiteboardSuspects,
      connections: whiteboardConnections,
      notes: whiteboard.notes || [],
      structureType: whiteboard.structureType || 'unknown',
      ambiguities: whiteboard.ambiguities || []
    },

    // Emotional hook - synthesized from accusation reasoning
    emotionalHook: sessionConfig?.accusation?.notes || '',

    // Open questions - things to explore in article
    openQuestions: [
      ...(whiteboard.notes || []),
      ...whiteboardConnections
    ]
  };
}

module.exports = {
  safeParseJson,
  getSdkClient,
  createTimestampedResult,
  validateRequiredFields,
  formatIssuesForMessage,
  synthesizePlayerFocus
};
