/**
 * ThemeLoader - Load and cache prompt files from journalist-report skill
 *
 * Provides deterministic prompt loading for server-integrated pipeline.
 * Caches files for performance; validates existence on startup.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Each phase's prompt files, by theme. A phase loads only what it needs.
 *
 * Phase 3 (task 3.2): the journalist's outline and article writers, their reworkers
 * and the judges read the rule set (lib/rule-set.js), and its eight craft files are
 * deleted, so the journalist lists only the image calls' files. The detective is
 * parked (spec D13) and keeps its craft files and these lists as they were. Its
 * 'validation' list went with the dead validation builder that alone read it.
 *
 * Phase 2 (2.3): there is no 'revision' phase. Each reworker carries its writer's
 * whole prompt, and checks its writer's phase (PromptBuilder.requirePhasePrompts).
 */
const PHASE_REQUIREMENTS = {
  journalist: {
    imageAnalysis: [
      'whiteboard-analysis',
      'photo-analysis',
      'photo-enrichment'
    ]
  },
  detective: {
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
    ]
  }
};

/** Every prompt file each theme's skill should hold, checked by validate(). */
const ALL_PROMPTS = {
  journalist: [
    'photo-analysis',
    'photo-enrichment',
    'whiteboard-analysis'
  ],
  detective: [
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
  ]
};

class ThemeLoader {
  /**
   * @param {string} skillPath - Path to the theme's skill directory
   * @param {'journalist'|'detective'} [themeName] - whose phase lists apply
   */
  constructor(skillPath, themeName = 'journalist') {
    this.skillPath = skillPath;
    this.themeName = themeName;
    this.promptsPath = path.join(skillPath, 'references', 'prompts');
    this.assetsPath = path.join(skillPath, 'assets');
    this.cache = new Map();
    this.validated = false;
  }

  /** This theme's phase lists. */
  get phaseRequirements() {
    return PHASE_REQUIREMENTS[this.themeName] || {};
  }

  /**
   * Validate all required files exist
   * Call once on server startup
   * @returns {Promise<{valid: boolean, missing: string[]}>}
   */
  async validate() {
    const missing = [];

    // Check all prompt files
    for (const name of ALL_PROMPTS[this.themeName] || []) {
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
   * Load all prompts required for a phase of this theme
   * @param {string} phase - Phase name (imageAnalysis, outlineGeneration, etc.)
   * @returns {Promise<Object>} - Map of prompt name to content
   * @throws {Error} on a phase this theme does not list: since phase 3 that is the
   *   journalist's outline and article phases, whose rules are the rule set
   */
  async loadPhasePrompts(phase) {
    const phases = this.phaseRequirements;
    const requirements = phases[phase];
    if (!requirements) {
      throw new Error(
        `Unknown phase: ${phase} for theme "${this.themeName}". Valid phases: ${Object.keys(phases).join(', ')}` +
        (this.themeName === 'journalist' ? '. The journalist writers read the rule set (lib/rule-set.js).' : '')
      );
    }

    const bundle = {};
    for (const name of requirements) {
      bundle[name] = await this.loadPrompt(name);
    }
    return bundle;
  }

  /**
   * Load CSS files for the template
   * Discovers .css files from the assets/css directory (theme-agnostic).
   * Files are loaded in alphabetical order for deterministic output.
   * @returns {Promise<Object>} - Map of CSS filename to content
   */
  async loadStyles() {
    const cacheKey = 'styles:all';

    if (!this.cache.has(cacheKey)) {
      const cssPath = path.join(this.assetsPath, 'css');
      const entries = await fs.readdir(cssPath);
      const cssFiles = entries.filter(f => f.endsWith('.css')).sort();

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
   * Get one theme's phase requirements, for configuration/debugging
   * @param {string} [theme='journalist']
   * @returns {Object} - A copy of that theme's phase -> prompt names map
   */
  static getPhaseRequirements(theme = 'journalist') {
    return Object.fromEntries(
      Object.entries(PHASE_REQUIREMENTS[theme] || {}).map(([phase, names]) => [phase, [...names]])
    );
  }

  /**
   * Get one theme's prompt names
   * @param {string} [theme='journalist']
   * @returns {string[]} - Prompt names
   */
  static getAllPrompts(theme = 'journalist') {
    return [...(ALL_PROMPTS[theme] || [])];
  }
}

// Factory function for creating loader with default or theme-specific skill path
function createThemeLoader(options = null) {
  // Legacy: support direct string argument (custom path)
  if (typeof options === 'string') {
    return new ThemeLoader(options);
  }

  const { theme = 'journalist', customPath = null } = options || {};

  const skillPath = customPath || path.resolve(
    __dirname,      // lib/
    '..',           // reports/
    '.claude',
    'skills',
    `${theme}-report`
  );
  return new ThemeLoader(skillPath, theme);
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
      const prompts = await loader.loadPhasePrompts('imageAnalysis');
      console.log(`Loaded ${Object.keys(prompts).length} prompts for imageAnalysis:`);
      Object.keys(prompts).forEach(name => {
        console.log(`  - ${name}: ${prompts[name].length} chars`);
      });
    } catch (err) {
      console.error(`Error loading prompts: ${err.message}`);
    }

    console.log('\nCache stats:', loader.getCacheStats());
  })();
}
