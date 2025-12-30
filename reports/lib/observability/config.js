/**
 * Observability Configuration
 *
 * Centralizes all observability settings and environment checks.
 * Single Responsibility: Only configuration, no tracing logic.
 *
 * @module observability/config
 */

const DEFAULTS = {
  project: 'aln-director-console',
  endpoint: 'https://api.smith.langchain.com'
};

/**
 * Check if LangSmith tracing is enabled
 * Requires both LANGSMITH_TRACING=true and LANGSMITH_API_KEY to be set
 *
 * @returns {boolean}
 */
function isTracingEnabled() {
  return process.env.LANGSMITH_TRACING === 'true' &&
         !!process.env.LANGSMITH_API_KEY;
}

/**
 * Check if progress logging is enabled
 * Progress can be enabled independently of tracing
 *
 * @returns {boolean}
 */
function isProgressEnabled() {
  return process.env.SDK_PROGRESS !== 'false';
}

/**
 * Get the LangSmith project name
 *
 * @returns {string}
 */
function getProject() {
  return process.env.LANGSMITH_PROJECT || DEFAULTS.project;
}

/**
 * Get the LangSmith API endpoint
 *
 * @returns {string}
 */
function getEndpoint() {
  return process.env.LANGSMITH_ENDPOINT || DEFAULTS.endpoint;
}

/**
 * Get the LangSmith API key
 *
 * @returns {string|undefined}
 */
function getApiKey() {
  return process.env.LANGSMITH_API_KEY;
}

/**
 * Get full tracing configuration object
 *
 * @returns {Object} Configuration object with all tracing settings
 */
function getTracingConfig() {
  return {
    enabled: isTracingEnabled(),
    project: getProject(),
    endpoint: getEndpoint(),
    apiKey: getApiKey()
  };
}

module.exports = {
  isTracingEnabled,
  isProgressEnabled,
  getProject,
  getEndpoint,
  getApiKey,
  getTracingConfig,
  DEFAULTS
};
