/**
 * TemplateAssembler - Handlebars template assembly for report generation
 *
 * Assembles HTML from ContentBundle JSON using theme-specific templates.
 * Handles layout, partials, helpers, and CSS path resolution.
 *
 * Design:
 * - Theme-aware: loads from templates/{theme}/
 * - Lazy initialization with caching
 * - Validates ContentBundle before rendering
 * - CSS paths configurable per theme
 *
 * Usage:
 *   const assembler = new TemplateAssembler('journalist');
 *   await assembler.initialize();
 *   const html = await assembler.assemble(contentBundle);
 *
 * See ARCHITECTURE_DECISIONS.md for design rationale.
 */

const Handlebars = require('handlebars');
const fs = require('fs').promises;
const path = require('path');
const { registerHelpers } = require('./template-helpers');
const { SchemaValidator } = require('./schema-validator');
const { createThemeLoader } = require('./theme-loader');

/**
 * Default base directory for templates
 */
const DEFAULT_TEMPLATE_DIR = path.join(__dirname, '..', 'templates');

/**
 * Default CSS paths per theme (relative paths for HTML output)
 */
const DEFAULT_CSS_PATHS = {
  journalist: {
    // CSS served from skill assets directory
    basePath: 'css/',
    files: [
      'variables.css',
      'base.css',
      'layout.css',
      'components.css',
      'sidebar.css'
    ]
  },
  detective: {
    basePath: 'css/',
    files: [
      'variables.css',
      'base.css',
      'layout.css',
      'components.css'
    ]
  }
};

/**
 * Default JavaScript paths per theme
 */
const DEFAULT_JS_PATHS = {
  journalist: {
    basePath: 'js/',
    files: ['article.js']
  },
  detective: {
    basePath: 'js/',
    files: ['article.js']
  }
};

class TemplateAssembler {
  /**
   * Create a TemplateAssembler instance
   *
   * @param {string} theme - Theme name ('journalist' or 'detective')
   * @param {Object} options - Configuration options
   * @param {string} options.templateDir - Base template directory
   * @param {Object} options.cssPaths - CSS path configuration
   * @param {Object} options.jsPaths - JS path configuration
   * @param {boolean} options.validateSchema - Whether to validate ContentBundle (default: true)
   * @param {boolean} options.inlineCss - Whether to inline CSS (default: true for standalone HTML)
   * @param {boolean} options.inlineJs - Whether to inline JS (default: true for standalone HTML)
   * @param {Object} options.themeLoader - ThemeLoader instance for loading assets (optional)
   * @param {string} options.sessionId - Session ID for photo path generation
   */
  constructor(theme, options = {}) {
    this.theme = theme;
    this.templateDir = options.templateDir || DEFAULT_TEMPLATE_DIR;
    this.themeDir = path.join(this.templateDir, theme);
    this.cssPaths = options.cssPaths || DEFAULT_CSS_PATHS[theme] || DEFAULT_CSS_PATHS.journalist;
    this.jsPaths = options.jsPaths || DEFAULT_JS_PATHS[theme] || DEFAULT_JS_PATHS.journalist;
    this.validateSchema = options.validateSchema !== false;
    this.inlineCss = options.inlineCss !== false;  // Default true for standalone HTML
    this.inlineJs = options.inlineJs !== false;    // Default true for standalone HTML
    this.sessionId = options.sessionId || null;    // For photo path generation

    // Create isolated Handlebars instance
    this.handlebars = Handlebars.create();

    // Lazy initialization state
    this.initialized = false;
    this.mainTemplate = null;

    // Schema validator
    this.validator = new SchemaValidator();

    // ThemeLoader for CSS/JS (needed if inlining assets)
    this.themeLoader = options.themeLoader || ((this.inlineCss || this.inlineJs) ? createThemeLoader({ theme }) : null);
  }

  /**
   * Initialize the assembler
   *
   * Loads layout template, registers partials and helpers.
   * Safe to call multiple times (idempotent).
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    if (this.initialized) return;

    // Register helpers first
    registerHelpers(this.handlebars);

    // Load and register partials
    await this.loadPartials();

    // Load main layout template
    const layoutPath = path.join(this.themeDir, 'layouts', 'article.hbs');
    const layoutContent = await fs.readFile(layoutPath, 'utf-8');
    this.mainTemplate = this.handlebars.compile(layoutContent);

    this.initialized = true;
  }

  /**
   * Load all partials from theme directory
   *
   * @private
   */
  async loadPartials() {
    const partialsDir = path.join(this.themeDir, 'partials');

    // Load partials recursively
    await this.loadPartialsFromDir(partialsDir, '');
  }

  /**
   * Recursively load partials from a directory
   *
   * @private
   * @param {string} dir - Directory to load from
   * @param {string} prefix - Partial name prefix (for subdirectories)
   */
  async loadPartialsFromDir(dir, prefix) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err) {
      // Directory doesn't exist - not an error, just no partials here
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectory
        const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        await this.loadPartialsFromDir(fullPath, newPrefix);
      } else if (entry.name.endsWith('.hbs')) {
        // Register partial
        const partialName = prefix
          ? `${prefix}/${entry.name.replace('.hbs', '')}`
          : entry.name.replace('.hbs', '');

        const content = await fs.readFile(fullPath, 'utf-8');
        this.handlebars.registerPartial(partialName, content);
      }
    }
  }

  /**
   * Assemble HTML from ContentBundle
   *
   * @param {Object} contentBundle - ContentBundle JSON
   * @param {Object} options - Assembly options
   * @param {boolean} options.skipValidation - Skip schema validation
   * @param {string} options.sessionId - Session ID for photo paths (overrides constructor)
   * @returns {Promise<string>} Assembled HTML
   * @throws {Error} If ContentBundle is invalid
   */
  async assemble(contentBundle, options = {}) {
    await this.initialize();

    // Validate ContentBundle schema
    if (this.validateSchema && !options.skipValidation) {
      const validation = this.validator.validate('content-bundle', contentBundle);
      if (!validation.valid) {
        const errorMsg = validation.errors
          .map(e => `${e.path}: ${e.message}`)
          .join('; ');
        throw new Error(`Invalid ContentBundle: ${errorMsg}`);
      }
    }

    // Use sessionId from options or constructor
    const sessionId = options.sessionId || this.sessionId;

    // Build template context (async for CSS loading)
    const context = await this.buildContext(contentBundle, sessionId);

    // Render template
    return this.mainTemplate(context);
  }

  /**
   * Build template context from ContentBundle
   *
   * Adds computed properties and theme-specific data.
   * When inlineCss/inlineJs is enabled, loads and embeds asset content.
   * When sessionId is provided, transforms photo paths to use session-specific URLs.
   *
   * @private
   * @param {Object} contentBundle - ContentBundle JSON
   * @param {string} sessionId - Session ID for photo path transformation
   * @returns {Promise<Object>} Template context
   */
  async buildContext(contentBundle, sessionId) {
    // Calculate photos base path for session-specific photo serving
    // Use relative path (no leading /) for standalone HTML compatibility (GitHub Pages, file://)
    const photosBasePath = sessionId ? `sessionphotos/${sessionId}/` : 'photos/';

    // Load inline CSS if enabled
    let inlineCss = null;
    if (this.inlineCss && this.themeLoader) {
      try {
        const styles = await this.themeLoader.loadStyles();
        // Concatenate all CSS files in order
        inlineCss = Object.values(styles).join('\n\n');
      } catch (err) {
        console.warn('[TemplateAssembler] Failed to load inline CSS:', err.message);
        // Fall back to external CSS references
      }
    }

    // Load inline JS if enabled
    let inlineJs = null;
    if (this.inlineJs && this.themeLoader) {
      try {
        const scripts = await this.themeLoader.loadScripts();
        // Concatenate all JS files in order
        inlineJs = Object.values(scripts).join('\n\n');
      } catch (err) {
        console.warn('[TemplateAssembler] Failed to load inline JS:', err.message);
        // Fall back to external JS references
      }
    }

    return {
      // Pass through ContentBundle data
      ...contentBundle,

      // Photos base path for session-specific photo serving
      photosBasePath,

      // Transform heroImage to use session-specific path
      heroImage: contentBundle.heroImage ? {
        ...contentBundle.heroImage,
        src: `${photosBasePath}${contentBundle.heroImage.filename}`
      } : null,

      // Transform photos array to use session-specific paths
      photos: Array.isArray(contentBundle.photos)
        ? contentBundle.photos.map(photo => ({
            ...photo,
            src: `${photosBasePath}${photo.filename}`
          }))
        : [],

      // Transform sections to update photo content blocks with session-specific paths
      sections: Array.isArray(contentBundle.sections)
        ? contentBundle.sections.map(section => ({
            ...section,
            content: Array.isArray(section.content)
              ? section.content.map(block =>
                  block.type === 'photo'
                    ? { ...block, src: `${photosBasePath}${block.filename}` }
                    : block
                )
              : section.content
          }))
        : contentBundle.sections,

      // Inline CSS for standalone HTML (takes precedence over external)
      inlineCss,

      // Inline JS for standalone HTML (takes precedence over external)
      inlineJs,

      // External CSS configuration (fallback when inlineCss is null)
      css: inlineCss ? null : {
        basePath: this.cssPaths.basePath,
        files: this.cssPaths.files.map(file => ({
          href: `${this.cssPaths.basePath}${file}`
        }))
      },

      // External JS configuration (fallback when inlineJs is null)
      js: inlineJs ? null : {
        basePath: this.jsPaths.basePath,
        files: this.jsPaths.files.map(file => ({
          src: `${this.jsPaths.basePath}${file}`
        }))
      },

      // Theme identifier
      theme: this.theme,

      // Computed values
      hasFinancialTracker: contentBundle.financialTracker &&
        Array.isArray(contentBundle.financialTracker.entries) &&
        contentBundle.financialTracker.entries.length > 0,

      // Transform financialTracker to include bar widths
      financialTracker: contentBundle.financialTracker ? {
        ...contentBundle.financialTracker,
        entries: this._calculateBarWidths(contentBundle.financialTracker.entries)
      } : null,

      hasPullQuotes: Array.isArray(contentBundle.pullQuotes) &&
        contentBundle.pullQuotes.length > 0,

      hasEvidenceCards: Array.isArray(contentBundle.evidenceCards) &&
        contentBundle.evidenceCards.length > 0,

      // Section navigation items (for sidebar)
      sectionNav: this.buildSectionNav(contentBundle.sections)
    };
  }

  /**
   * Calculate bar widths as percentages for financial tracker visualization
   *
   * @private
   * @param {Array} entries - Financial tracker entries with amount field
   * @returns {Array} Entries with barWidth percentage added
   */
  _calculateBarWidths(entries) {
    if (!entries?.length) return entries;

    const parseAmount = (amount) => {
      if (typeof amount === 'number') return amount;
      return parseFloat(String(amount).replace(/[$,]/g, '')) || 0;
    };

    const amounts = entries.map(e => parseAmount(e.amount));
    const maxAmount = Math.max(...amounts);

    return entries.map((entry, i) => ({
      ...entry,
      barWidth: maxAmount > 0 ? Math.round((amounts[i] / maxAmount) * 100) : 0
    }));
  }

  /**
   * Build section navigation from sections array
   *
   * @private
   * @param {Array} sections - ContentBundle sections
   * @returns {Array} Navigation items with id, label, href
   */
  buildSectionNav(sections) {
    if (!Array.isArray(sections)) return [];

    return sections
      .filter(section => section.heading) // Only sections with headings
      .map(section => ({
        id: section.id,
        label: section.heading,
        href: `#${section.id}`
      }));
  }

  /**
   * Get list of registered partials (for debugging)
   *
   * @returns {string[]} Partial names
   */
  getRegisteredPartials() {
    return Object.keys(this.handlebars.partials);
  }

  /**
   * Check if assembler is initialized
   *
   * @returns {boolean}
   */
  isInitialized() {
    return this.initialized;
  }
}

/**
 * Create a TemplateAssembler for the specified theme
 *
 * Factory function for dependency injection.
 *
 * @param {string} theme - Theme name
 * @param {Object} options - Configuration options
 * @returns {TemplateAssembler}
 */
function createTemplateAssembler(theme, options = {}) {
  return new TemplateAssembler(theme, options);
}

module.exports = {
  TemplateAssembler,
  createTemplateAssembler,

  // Export for testing
  _testing: {
    DEFAULT_TEMPLATE_DIR,
    DEFAULT_CSS_PATHS,
    DEFAULT_JS_PATHS
  }
};
