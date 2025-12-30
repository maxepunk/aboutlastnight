/**
 * Message Formatter
 *
 * DRY formatting utilities for progress messages.
 * Used by both console logging and SSE emission.
 */

const { SDK_MESSAGE_TYPES } = require('./constants');

// Icons for different message types
const MESSAGE_ICONS = {
  [SDK_MESSAGE_TYPES.ASSISTANT]: '🤖',
  [SDK_MESSAGE_TYPES.USER]: '👤',
  [SDK_MESSAGE_TYPES.TOOL_PROGRESS]: '🔧',
  [SDK_MESSAGE_TYPES.TOOL_RESULT]: '📦',
  [SDK_MESSAGE_TYPES.SYSTEM]: '⚙️',
  [SDK_MESSAGE_TYPES.ERROR]: '❌',
  [SDK_MESSAGE_TYPES.RESULT]: '✅'
};

/**
 * Format a progress message for display
 *
 * @param {Object} msg - SDK message object
 * @param {Object} options - Formatting options
 * @param {number} options.maxLength - Max length for preview (default: 150)
 * @param {boolean} options.includeIcon - Whether to include emoji icon (default: true)
 * @returns {Object} { icon, preview, formatted }
 */
function formatProgressMessage(msg, options = {}) {
  const { maxLength = 150, includeIcon = true } = options;
  const icon = includeIcon ? (MESSAGE_ICONS[msg.type] || '📝') : '';
  const content = msg.content || msg.message || '';
  const preview = maxLength > 0 ? truncate(content, maxLength) : content;
  return {
    icon,
    preview,
    formatted: `${icon} ${preview}`.trim()
  };
}

/**
 * Truncate string to max length with ellipsis
 *
 * @param {string} str - String to truncate
 * @param {number} max - Maximum length
 * @returns {string} Truncated string
 */
function truncate(str, max) {
  if (!str) return '';
  if (max <= 0 || str.length <= max) return str;
  return str.substring(0, max - 3) + '...';
}

module.exports = {
  MESSAGE_ICONS,
  formatProgressMessage,
  truncate
};
