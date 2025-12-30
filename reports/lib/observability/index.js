/**
 * Observability Module - Public API
 *
 * Consolidated exports for tracing, progress, and state snapshot utilities.
 * Single import point for all observability functionality.
 *
 * @module observability
 *
 * @example
 * const { traceNode, progressEmitter, isTracingEnabled } = require('./observability');
 */

// Constants
const { SDK_MESSAGE_TYPES, SSE_EVENT_TYPES } = require('./constants');

// Configuration
const {
  isTracingEnabled,
  isProgressEnabled,
  getProject,
  getTracingConfig
} = require('./config');

// State utilities
const { extractStateSnapshot } = require('./state-snapshot');

// Message formatting
const { MESSAGE_ICONS, formatProgressMessage, truncate: formatTruncate } = require('./message-formatter');

// Progress streaming
const { progressEmitter, ProgressEmitter } = require('./progress-emitter');
const { createProgressFromTrace, formatProgressEvent, PROGRESS_ICONS } = require('./progress-bridge');

// Tracing wrappers
const { createTracedSdkQuery, traceLLMCall, traceBatch, truncate } = require('./llm-tracer');
const { traceNode } = require('./node-tracer');

module.exports = {
  // Constants
  SDK_MESSAGE_TYPES,
  SSE_EVENT_TYPES,

  // Configuration
  isTracingEnabled,
  isProgressEnabled,
  getProject,
  getTracingConfig,

  // State utilities
  extractStateSnapshot,

  // Message formatting
  MESSAGE_ICONS,
  formatProgressMessage,

  // Progress streaming
  progressEmitter,
  ProgressEmitter,
  createProgressFromTrace,
  formatProgressEvent,
  PROGRESS_ICONS,

  // Tracing wrappers
  traceNode,
  createTracedSdkQuery,
  traceLLMCall,
  traceBatch,
  truncate
};
