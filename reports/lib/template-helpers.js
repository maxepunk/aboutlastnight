/**
 * Handlebars Helpers for NovaNews Template System
 *
 * Provides formatting and logic helpers for the journalist template.
 * Designed for the noir cyberpunk aesthetic of NovaNews articles.
 *
 * Helper Categories:
 * - Date/Time formatting
 * - CSS class generation
 * - Content block routing
 * - Conditional logic
 * - Text formatting
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

// ============================================================================
// Internal Utilities (DRY extraction)
// ============================================================================

/**
 * Parse a date input to a Date object
 * Returns null if parsing fails
 *
 * @param {string|Date} dateInput - Date to parse
 * @returns {Date|null} Parsed Date or null if invalid
 */
function parseDate(dateInput) {
  if (!dateInput) return null;
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Map a value to a CSS class using a lookup object
 *
 * @param {string} value - Value to look up
 * @param {Object} mappings - Map of value -> CSS class
 * @param {string} defaultClass - Default class if value not found
 * @returns {string} CSS class name
 */
function mapToClass(value, mappings, defaultClass = '') {
  return mappings[value] || defaultClass;
}

/**
 * Compile a Handlebars partial (handles pre-compiled and string partials)
 *
 * @param {Object} handlebars - Handlebars instance
 * @param {Function|string} partial - Partial template
 * @returns {Function} Compiled template function
 */
function compilePartial(handlebars, partial) {
  return typeof partial === 'function' ? partial : handlebars.compile(partial);
}

// ============================================================================
// CSS Class Mappings
// ============================================================================

const SIGNIFICANCE_CLASSES = {
  critical: 'evidence-card--critical',
  supporting: 'evidence-card--supporting',
  contextual: 'evidence-card--contextual'
};

const SECTION_CLASSES = {
  'narrative': 'nn-section--narrative',
  'evidence-highlight': 'nn-section--evidence',
  'investigation-notes': 'nn-section--notes',
  'conclusion': 'nn-section--conclusion',
  'case-summary': 'nn-section--summary'
};

const PLACEMENT_CLASSES = {
  left: 'pull-quote--left',
  right: 'pull-quote--right',
  center: 'pull-quote--center'
};

const CONTENT_BLOCK_PARTIALS = {
  'paragraph': 'content-blocks/paragraph',
  'quote': 'content-blocks/quote',
  'evidence-reference': 'content-blocks/evidence-reference',
  'list': 'content-blocks/list',
  'photo': 'content-blocks/photo',
  'evidence-card': 'content-blocks/evidence-card'
};

// ============================================================================
// Date/Time Helpers
// ============================================================================

/**
 * Format a date string for display
 * Supports ISO dates, "YYYY-MM-DD", and Date objects
 *
 * @param {string|Date} dateInput - Date to format
 * @param {string} format - Format type: 'long', 'short', 'datetime'
 * @returns {string} Formatted date string
 *
 * Examples:
 *   formatDate("2024-12-23") → "December 23, 2024"
 *   formatDate("2024-12-23", "short") → "Dec 23, 2024"
 *   formatDate("2024-12-23T10:30:00Z", "datetime") → "December 23, 2024 at 10:30 AM"
 */
function formatDate(dateInput, format = 'long') {
  const date = parseDate(dateInput);

  if (!date) {
    // If parsing fails, return the original string (might be pre-formatted)
    return dateInput ? String(dateInput) : '';
  }

  const options = {
    long: { year: 'numeric', month: 'long', day: 'numeric' },
    short: { year: 'numeric', month: 'short', day: 'numeric' },
    datetime: {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }
  };

  return date.toLocaleDateString('en-US', options[format] || options.long);
}

/**
 * Format a date for datetime attribute (ISO format)
 *
 * @param {string|Date} dateInput - Date to format
 * @returns {string} ISO date string (YYYY-MM-DD)
 */
function formatDatetime(dateInput) {
  const date = parseDate(dateInput);
  return date ? date.toISOString().split('T')[0] : '';
}

// ============================================================================
// CSS Class Helpers
// ============================================================================

/**
 * Generate CSS class for evidence significance level
 *
 * @param {string} significance - 'critical', 'supporting', or 'contextual'
 * @returns {string} CSS class name
 */
function significanceClass(significance) {
  return mapToClass(significance, SIGNIFICANCE_CLASSES, 'evidence-card--contextual');
}

/**
 * Generate CSS class for section type
 *
 * @param {string} sectionType - Section type from ContentBundle
 * @returns {string} CSS class name
 */
function sectionClass(sectionType) {
  return mapToClass(sectionType, SECTION_CLASSES, '');
}

/**
 * Generate CSS class for pull quote placement
 *
 * @param {string} placement - 'left', 'right', or 'center'
 * @returns {string} CSS class name
 */
function pullQuotePlacement(placement) {
  return mapToClass(placement, PLACEMENT_CLASSES, 'pull-quote--right');
}

// ============================================================================
// Content Block Helpers
// ============================================================================

/**
 * Determine which partial to use for a content block
 *
 * @param {string} contentType - Content block type
 * @returns {string} Partial name
 */
function contentBlockPartial(contentType) {
  return mapToClass(contentType, CONTENT_BLOCK_PARTIALS, 'content-blocks/paragraph');
}

// ============================================================================
// Metadata Helpers
// ============================================================================

/**
 * Generate article ID from session metadata
 * Format: {PREFIX}-{MMDD}-{HH}
 * Prefix from theme-config.js display.articleIdPrefix (NNA for journalist, DCR for detective)
 *
 * @param {Object} metadata - ContentBundle metadata (must include .theme for non-default prefix)
 * @returns {string} Article ID
 */
function articleId(metadata) {
  // Lazy-require to avoid circular dependency (template-helpers loaded early)
  const { getThemeConfig } = require('./theme-config');
  const theme = (metadata && metadata.theme) || 'journalist';
  const config = getThemeConfig(theme);
  const prefix = (config && config.display && config.display.articleIdPrefix) || 'NNA';

  if (!metadata || !metadata.generatedAt) {
    return `${prefix}-0000-00`;
  }

  const date = parseDate(metadata.generatedAt);
  if (!date) {
    return `${prefix}-0000-00`;
  }

  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');

  return `${prefix}-${month}${day}-${hour}`;
}

// ============================================================================
// Logic Helpers
// ============================================================================

/**
 * Check if a value equals another (for conditionals)
 *
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {boolean} True if equal
 */
function eq(a, b) {
  return a === b;
}

/**
 * Check if array has items
 *
 * @param {Array} arr - Array to check
 * @returns {boolean} True if array has items
 */
function hasItems(arr) {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * Get first N items from array
 *
 * @param {Array} arr - Source array
 * @param {number} n - Number of items
 * @returns {Array} First N items
 */
function take(arr, n) {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, n);
}

// ============================================================================
// Formatting Helpers
// ============================================================================

/**
 * Format currency amount (already formatted string passthrough)
 *
 * @param {string} amount - Amount string (e.g., "$150,000")
 * @returns {string} Formatted amount
 */
function formatCurrency(amount) {
  if (!amount) return '$0';
  // If already formatted, return as-is
  if (typeof amount === 'string' && amount.startsWith('$')) {
    return amount;
  }
  // If number, format it
  if (typeof amount === 'number') {
    return '$' + amount.toLocaleString('en-US');
  }
  return String(amount);
}

// ============================================================================
// Handlebars Registration
// ============================================================================

/**
 * Register all helpers with a Handlebars instance
 *
 * @param {Object} handlebars - Handlebars instance
 */
function registerHelpers(handlebars) {
  // Date helpers
  handlebars.registerHelper('formatDate', function(dateInput, format, options) {
    // Handlebars passes: (value, [optional args...], options)
    // When called as {{formatDate date}}: format = options object
    // When called as {{formatDate date "short"}}: format = "short", options = options object
    const actualFormat = typeof format === 'string' ? format : 'long';
    return formatDate(dateInput, actualFormat);
  });

  handlebars.registerHelper('formatDatetime', formatDatetime);

  // CSS class helpers
  handlebars.registerHelper('significanceClass', significanceClass);
  handlebars.registerHelper('sectionClass', sectionClass);
  handlebars.registerHelper('pullQuotePlacement', pullQuotePlacement);

  // Content routing helper - returns partial name for dynamic partial
  handlebars.registerHelper('contentBlockPartial', contentBlockPartial);

  // Metadata helpers
  handlebars.registerHelper('articleId', articleId);

  // Logic helpers
  handlebars.registerHelper('eq', eq);
  handlebars.registerHelper('hasItems', hasItems);
  handlebars.registerHelper('take', take);

  // Formatting helpers
  handlebars.registerHelper('formatCurrency', formatCurrency);

  // Block helper for iterating with index
  handlebars.registerHelper('eachWithIndex', function(array, options) {
    if (!Array.isArray(array)) return '';

    let result = '';
    for (let i = 0; i < array.length; i++) {
      result += options.fn({
        ...array[i],
        '@index': i,
        '@first': i === 0,
        '@last': i === array.length - 1
      });
    }
    return result;
  });

  // Render content block using dynamic partial
  // Returns SafeString to prevent Handlebars from escaping the rendered HTML
  handlebars.registerHelper('renderContentBlock', function(block, options) {
    if (!block || !block.type) return '';

    const partialName = contentBlockPartial(block.type);
    const partial = handlebars.partials[partialName];

    if (!partial) {
      // Fallback to paragraph if partial not found
      const fallback = handlebars.partials['content-blocks/paragraph'];
      if (fallback) {
        return new handlebars.SafeString(compilePartial(handlebars, fallback)(block));
      }
      return '';
    }

    return new handlebars.SafeString(compilePartial(handlebars, partial)(block));
  });
}

module.exports = {
  // Individual helpers for testing
  formatDate,
  formatDatetime,
  significanceClass,
  sectionClass,
  contentBlockPartial,
  articleId,
  eq,
  hasItems,
  take,
  formatCurrency,
  pullQuotePlacement,

  // Registration function
  registerHelpers,

  // Internal utilities for testing
  _testing: {
    parseDate,
    mapToClass,
    compilePartial,
    SIGNIFICANCE_CLASSES,
    SECTION_CLASSES,
    PLACEMENT_CLASSES,
    CONTENT_BLOCK_PARTIALS
  }
};
