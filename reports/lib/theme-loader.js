/**
 * ThemeLoader - Load and cache prompt files from journalist-report skill
 *
 * Provides deterministic prompt loading for server-integrated pipeline.
 * Caches files for performance; validates existence on startup.
 */

const fs = require('fs').promises;
const path = require('path');

// Phase-specific prompt requirements
// Each phase only loads what it needs to minimize context
const PHASE_REQUIREMENTS = {
  imageAnalysis: [
    'whiteboard-analysis',
    'photo-analysis',
    'photo-enrichment'
  ],
  arcAnalysis: [
    'character-voice',
    'evidence-boundaries',
    'narrative-structure',
    'anti-patterns'
  ],
  outlineGeneration: [
    'section-rules',
    'editorial-design',
    'narrative-structure',
    // 'formatting' removed - describes ContentBundle format, not Outline format (Fix 7.3)
    'evidence-boundaries'
  ],
  articleGeneration: [
    'character-voice',
    'writing-principles',
    'evidence-boundaries',
    'section-rules',
    'narrative-structure',
    'formatting',
    'anti-patterns',
    'editorial-design'
  ],
  validation: [
    'anti-patterns',
    'character-voice',
    'evidence-boundaries'
  ]
};

// All prompt files that should exist
const ALL_PROMPTS = [
  'anti-patterns',
  'character-voice',
  'editorial-design',
  'evidence-boundaries',
  'formatting',
  'narrative-structure',
  'photo-analysis',
  'photo-enrichment',
  'section-rules',
  'whiteboard-analysis',
  'writing-principles'
];

class ThemeLoader {
  /**
   * @param {string} skillPath - Path to journalist-report skill directory
   */
  constructor(skillPath) {
    this.skillPath = skillPath;
    this.promptsPath = path.join(skillPath, 'references', 'prompts');
    this.assetsPath = path.join(skillPath, 'assets');
    this.cache = new Map();
    this.validated = false;
  }

  /**
   * Validate all required files exist
   * Call once on server startup
   * @returns {Promise<{valid: boolean, missing: string[]}>}
   */
  async validate() {
    const missing = [];

    // Check all prompt files
    for (const name of ALL_PROMPTS) {
      const filePath = path.join(this.promptsPath, `${name}.md`);
      try {
        await fs.access(filePath);
      } catch {
        missing.push(`prompts/${name}.md`);
      }
    }

    // Check template
    const templatePath = path.join(this.assetsPath, 'article.html');
    try {
      await fs.access(templatePath);
    } catch {
      missing.push('assets/article.html');
    }

    // Check schemas
    const schemasPath = path.join(this.skillPath, 'references', 'schemas.md');
    try {
      await fs.access(schemasPath);
    } catch {
      missing.push('references/schemas.md');
    }

    this.validated = missing.length === 0;
    return { valid: this.validated, missing };
  }

  /**
   * Load a single prompt file (cached)
   * Graceful degradation: returns empty string if file not found (Commit 8.18)
   * @param {string} name - Prompt name without extension
   * @returns {Promise<string>} - Prompt content or empty string
   */
  async loadPrompt(name) {
    const cacheKey = `prompt:${name}`;

    if (!this.cache.has(cacheKey)) {
      const filePath = path.join(this.promptsPath, `${name}.md`);
      try {
        const content = await fs.readFile(filePath, 'utf8');
        this.cache.set(cacheKey, content);
      } catch (error) {
        console.warn(
          `[theme-loader] Failed to load prompt "${name}": ${error.message}\n` +
          `  Expected path: ${filePath}\n` +
          `  Pipeline will continue with empty prompt content.`
        );
        this.cache.set(cacheKey, '');
      }
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Load all prompts required for a phase
   * @param {string} phase - Phase name (arcAnalysis, outlineGeneration, etc.)
   * @returns {Promise<Object>} - Map of prompt name to content
   */
  async loadPhasePrompts(phase) {
    const requirements = PHASE_REQUIREMENTS[phase];
    if (!requirements) {
      throw new Error(`Unknown phase: ${phase}. Valid phases: ${Object.keys(PHASE_REQUIREMENTS).join(', ')}`);
    }

    const bundle = {};
    for (const name of requirements) {
      bundle[name] = await this.loadPrompt(name);
    }
    return bundle;
  }

  /**
   * Load the HTML article template (cached)
   * @returns {Promise<string>} - Template HTML
   */
  async loadTemplate() {
    const cacheKey = 'template:article';

    if (!this.cache.has(cacheKey)) {
      const filePath = path.join(this.assetsPath, 'article.html');
      const content = await fs.readFile(filePath, 'utf8');
      this.cache.set(cacheKey, content);
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Load CSS files for the template
   * @returns {Promise<Object>} - Map of CSS filename to content
   */
  async loadStyles() {
    const cacheKey = 'styles:all';

    if (!this.cache.has(cacheKey)) {
      const cssPath = path.join(this.assetsPath, 'css');
      const cssFiles = ['variables.css', 'base.css', 'layout.css', 'components.css', 'sidebar.css'];

      const styles = {};
      for (const file of cssFiles) {
        const filePath = path.join(cssPath, file);
        styles[file] = await fs.readFile(filePath, 'utf8');
      }

      this.cache.set(cacheKey, styles);
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Load JavaScript files for the template
   * @returns {Promise<Object>} - Map of JS filename to content
   */
  async loadScripts() {
    const cacheKey = 'scripts:all';

    if (!this.cache.has(cacheKey)) {
      const jsPath = path.join(this.assetsPath, 'js');
      const jsFiles = ['article.js'];

      const scripts = {};
      for (const file of jsFiles) {
        const filePath = path.join(jsPath, file);
        scripts[file] = await fs.readFile(filePath, 'utf8');
      }

      this.cache.set(cacheKey, scripts);
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Load schemas reference (cached)
   * @returns {Promise<string>} - Schemas markdown content
   */
  async loadSchemas() {
    const cacheKey = 'ref:schemas';

    if (!this.cache.has(cacheKey)) {
      const filePath = path.join(this.skillPath, 'references', 'schemas.md');
      const content = await fs.readFile(filePath, 'utf8');
      this.cache.set(cacheKey, content);
    }

    return this.cache.get(cacheKey);
  }

  /**
   * Clear the cache (useful for development/hot reload)
   */
  clearCache() {
    this.cache.clear();
    this.validated = false;
  }

  /**
   * Get cache statistics
   * @returns {Object} - Cache stats
   */
  getCacheStats() {
    return {
      entries: this.cache.size,
      keys: Array.from(this.cache.keys()),
      validated: this.validated
    };
  }

  /**
   * Get phase requirements for configuration/debugging
   * @returns {Object} - Phase requirements map
   */
  static getPhaseRequirements() {
    return { ...PHASE_REQUIREMENTS };
  }

  /**
   * Get list of all prompt names
   * @returns {string[]} - Prompt names
   */
  static getAllPrompts() {
    return [...ALL_PROMPTS];
  }
}

// Factory function for creating loader with default skill path
function createThemeLoader(customPath = null) {
  // Path resolves from lib/ -> reports/.claude/skills/journalist-report
  const skillPath = customPath || path.resolve(
    __dirname,      // lib/
    '..',           // reports/
    '.claude',
    'skills',
    'journalist-report'
  );
  return new ThemeLoader(skillPath);
}

module.exports = {
  ThemeLoader,
  createThemeLoader,
  PHASE_REQUIREMENTS,
  ALL_PROMPTS
};

// Self-test when run directly
if (require.main === module) {
  (async () => {
    console.log('ThemeLoader Self-Test\n');

    const loader = createThemeLoader();
    console.log(`Skill path: ${loader.skillPath}\n`);

    // Validate
    console.log('Validating files...');
    const validation = await loader.validate();
    if (validation.valid) {
      console.log('All files present.\n');
    } else {
      console.log('Missing files:');
      validation.missing.forEach(f => console.log(`  - ${f}`));
      console.log('');
    }

    // Test loading
    console.log('Testing prompt loading...');
    try {
      const prompts = await loader.loadPhasePrompts('arcAnalysis');
      console.log(`Loaded ${Object.keys(prompts).length} prompts for arcAnalysis:`);
      Object.keys(prompts).forEach(name => {
        console.log(`  - ${name}: ${prompts[name].length} chars`);
      });
    } catch (err) {
      console.error(`Error loading prompts: ${err.message}`);
    }

    console.log('\nCache stats:', loader.getCacheStats());
  })();
}
