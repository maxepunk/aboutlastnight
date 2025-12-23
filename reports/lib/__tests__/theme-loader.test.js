/**
 * ThemeLoader Unit Tests
 */

const path = require('path');
const {
  ThemeLoader,
  createThemeLoader,
  PHASE_REQUIREMENTS,
  ALL_PROMPTS
} = require('../theme-loader');

// Mock fs.promises
jest.mock('fs', () => ({
  promises: {
    access: jest.fn(),
    readFile: jest.fn()
  }
}));

const fs = require('fs').promises;

describe('ThemeLoader', () => {
  let loader;
  const testSkillPath = '/test/skill/path';

  beforeEach(() => {
    jest.clearAllMocks();
    loader = new ThemeLoader(testSkillPath);
  });

  describe('constructor', () => {
    it('should initialize with correct paths', () => {
      expect(loader.skillPath).toBe(testSkillPath);
      expect(loader.promptsPath).toBe(path.join(testSkillPath, 'references', 'prompts'));
      expect(loader.assetsPath).toBe(path.join(testSkillPath, 'assets'));
    });

    it('should initialize empty cache', () => {
      expect(loader.cache.size).toBe(0);
    });

    it('should start as not validated', () => {
      expect(loader.validated).toBe(false);
    });
  });

  describe('validate', () => {
    it('should return valid when all files exist', async () => {
      fs.access.mockResolvedValue(undefined);

      const result = await loader.validate();

      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
      expect(loader.validated).toBe(true);
    });

    it('should return missing files when prompts are missing', async () => {
      // Make anti-patterns.md fail, rest succeed
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('anti-patterns')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve(undefined);
      });

      const result = await loader.validate();

      expect(result.valid).toBe(false);
      expect(result.missing).toContain('prompts/anti-patterns.md');
      expect(loader.validated).toBe(false);
    });

    it('should check template file', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('article.html')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve(undefined);
      });

      const result = await loader.validate();

      expect(result.missing).toContain('assets/article.html');
    });

    it('should check schemas file', async () => {
      fs.access.mockImplementation((filePath) => {
        if (filePath.includes('schemas.md')) {
          return Promise.reject(new Error('ENOENT'));
        }
        return Promise.resolve(undefined);
      });

      const result = await loader.validate();

      expect(result.missing).toContain('references/schemas.md');
    });

    it('should check all prompt files', async () => {
      fs.access.mockResolvedValue(undefined);

      await loader.validate();

      // Should call access for each prompt + template + schemas
      const expectedCalls = ALL_PROMPTS.length + 2;
      expect(fs.access).toHaveBeenCalledTimes(expectedCalls);
    });
  });

  describe('loadPrompt', () => {
    it('should load and cache prompt file', async () => {
      const mockContent = '# Character Voice\n\nBe snarky...';
      fs.readFile.mockResolvedValue(mockContent);

      const result = await loader.loadPrompt('character-voice');

      expect(result).toBe(mockContent);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testSkillPath, 'references', 'prompts', 'character-voice.md'),
        'utf8'
      );
    });

    it('should return cached content on second call', async () => {
      const mockContent = '# Test content';
      fs.readFile.mockResolvedValue(mockContent);

      await loader.loadPrompt('test-prompt');
      await loader.loadPrompt('test-prompt');

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });

    it('should throw on missing file', async () => {
      fs.readFile.mockRejectedValue(new Error('ENOENT'));

      await expect(loader.loadPrompt('nonexistent'))
        .rejects.toThrow('ENOENT');
    });
  });

  describe('loadPhasePrompts', () => {
    it('should load all prompts for arcAnalysis phase', async () => {
      fs.readFile.mockImplementation((filePath) => {
        const name = path.basename(filePath, '.md');
        return Promise.resolve(`Content for ${name}`);
      });

      const result = await loader.loadPhasePrompts('arcAnalysis');

      expect(Object.keys(result)).toEqual(PHASE_REQUIREMENTS.arcAnalysis);
      expect(result['character-voice']).toBe('Content for character-voice');
      expect(result['evidence-boundaries']).toBe('Content for evidence-boundaries');
    });

    it('should load all prompts for outlineGeneration phase', async () => {
      fs.readFile.mockResolvedValue('content');

      const result = await loader.loadPhasePrompts('outlineGeneration');

      expect(Object.keys(result)).toEqual(PHASE_REQUIREMENTS.outlineGeneration);
    });

    it('should load all prompts for articleGeneration phase', async () => {
      fs.readFile.mockResolvedValue('content');

      const result = await loader.loadPhasePrompts('articleGeneration');

      expect(Object.keys(result)).toEqual(PHASE_REQUIREMENTS.articleGeneration);
    });

    it('should load all prompts for validation phase', async () => {
      fs.readFile.mockResolvedValue('content');

      const result = await loader.loadPhasePrompts('validation');

      expect(Object.keys(result)).toEqual(PHASE_REQUIREMENTS.validation);
    });

    it('should throw for unknown phase', async () => {
      await expect(loader.loadPhasePrompts('unknownPhase'))
        .rejects.toThrow('Unknown phase: unknownPhase');
    });

    it('should include valid phase names in error message', async () => {
      await expect(loader.loadPhasePrompts('bad'))
        .rejects.toThrow('Valid phases: arcAnalysis, outlineGeneration, articleGeneration, validation');
    });
  });

  describe('loadTemplate', () => {
    it('should load and cache template', async () => {
      const mockTemplate = '<html>...</html>';
      fs.readFile.mockResolvedValue(mockTemplate);

      const result = await loader.loadTemplate();

      expect(result).toBe(mockTemplate);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testSkillPath, 'assets', 'article.html'),
        'utf8'
      );
    });

    it('should return cached template on second call', async () => {
      fs.readFile.mockResolvedValue('<template>');

      await loader.loadTemplate();
      await loader.loadTemplate();

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('loadStyles', () => {
    it('should load all CSS files', async () => {
      fs.readFile.mockImplementation((filePath) => {
        const name = path.basename(filePath);
        return Promise.resolve(`/* ${name} */`);
      });

      const result = await loader.loadStyles();

      expect(result['variables.css']).toBe('/* variables.css */');
      expect(result['base.css']).toBe('/* base.css */');
      expect(result['layout.css']).toBe('/* layout.css */');
      expect(result['components.css']).toBe('/* components.css */');
      expect(result['sidebar.css']).toBe('/* sidebar.css */');
    });

    it('should cache styles', async () => {
      fs.readFile.mockResolvedValue('/* css */');

      await loader.loadStyles();
      await loader.loadStyles();

      // 5 CSS files, only loaded once
      expect(fs.readFile).toHaveBeenCalledTimes(5);
    });
  });

  describe('loadSchemas', () => {
    it('should load and cache schemas', async () => {
      const mockSchemas = '# Schemas\n## Evidence Bundle...';
      fs.readFile.mockResolvedValue(mockSchemas);

      const result = await loader.loadSchemas();

      expect(result).toBe(mockSchemas);
      expect(fs.readFile).toHaveBeenCalledWith(
        path.join(testSkillPath, 'references', 'schemas.md'),
        'utf8'
      );
    });

    it('should cache schemas', async () => {
      fs.readFile.mockResolvedValue('# Schemas');

      await loader.loadSchemas();
      await loader.loadSchemas();

      expect(fs.readFile).toHaveBeenCalledTimes(1);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached entries', async () => {
      fs.readFile.mockResolvedValue('content');

      // Populate cache
      await loader.loadPrompt('test');
      await loader.loadTemplate();
      expect(loader.cache.size).toBeGreaterThan(0);

      loader.clearCache();

      expect(loader.cache.size).toBe(0);
    });

    it('should reset validated flag', async () => {
      fs.access.mockResolvedValue(undefined);
      await loader.validate();
      expect(loader.validated).toBe(true);

      loader.clearCache();

      expect(loader.validated).toBe(false);
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      fs.readFile.mockResolvedValue('content');

      await loader.loadPrompt('test-prompt');
      await loader.loadTemplate();

      const stats = loader.getCacheStats();

      expect(stats.entries).toBe(2);
      expect(stats.keys).toContain('prompt:test-prompt');
      expect(stats.keys).toContain('template:article');
      expect(stats.validated).toBe(false);
    });

    it('should reflect validation status', async () => {
      fs.access.mockResolvedValue(undefined);
      await loader.validate();

      const stats = loader.getCacheStats();

      expect(stats.validated).toBe(true);
    });
  });

  describe('static getPhaseRequirements', () => {
    it('should return copy of phase requirements', () => {
      const reqs = ThemeLoader.getPhaseRequirements();

      expect(reqs.arcAnalysis).toEqual(PHASE_REQUIREMENTS.arcAnalysis);
      expect(reqs.outlineGeneration).toEqual(PHASE_REQUIREMENTS.outlineGeneration);
      expect(reqs.articleGeneration).toEqual(PHASE_REQUIREMENTS.articleGeneration);
      expect(reqs.validation).toEqual(PHASE_REQUIREMENTS.validation);
    });

    it('should return a copy (not the original)', () => {
      const reqs = ThemeLoader.getPhaseRequirements();
      reqs.arcAnalysis = ['modified'];

      expect(PHASE_REQUIREMENTS.arcAnalysis).not.toEqual(['modified']);
    });
  });

  describe('static getAllPrompts', () => {
    it('should return all prompt names', () => {
      const prompts = ThemeLoader.getAllPrompts();

      expect(prompts).toContain('anti-patterns');
      expect(prompts).toContain('character-voice');
      expect(prompts).toContain('editorial-design');
      expect(prompts).toContain('evidence-boundaries');
      expect(prompts).toContain('formatting');
      expect(prompts).toContain('narrative-structure');
      expect(prompts).toContain('section-rules');
      expect(prompts).toContain('writing-principles');
    });

    it('should return a copy (not the original)', () => {
      const prompts = ThemeLoader.getAllPrompts();
      prompts.push('hacked');

      expect(ALL_PROMPTS).not.toContain('hacked');
    });
  });

  describe('createThemeLoader factory', () => {
    it('should create loader with custom path', () => {
      const customLoader = createThemeLoader('/custom/path');
      expect(customLoader.skillPath).toBe('/custom/path');
    });

    it('should create loader with default path when null', () => {
      const defaultLoader = createThemeLoader(null);
      expect(defaultLoader.skillPath).toContain('journalist-report');
    });

    it('should create loader with default path when no arg', () => {
      const defaultLoader = createThemeLoader();
      expect(defaultLoader.skillPath).toContain('journalist-report');
    });
  });

  describe('module exports', () => {
    it('should export ThemeLoader class', () => {
      expect(ThemeLoader).toBeDefined();
      expect(typeof ThemeLoader).toBe('function');
    });

    it('should export createThemeLoader factory', () => {
      expect(createThemeLoader).toBeDefined();
      expect(typeof createThemeLoader).toBe('function');
    });

    it('should export PHASE_REQUIREMENTS', () => {
      expect(PHASE_REQUIREMENTS).toBeDefined();
      expect(PHASE_REQUIREMENTS.arcAnalysis).toBeDefined();
      expect(PHASE_REQUIREMENTS.outlineGeneration).toBeDefined();
      expect(PHASE_REQUIREMENTS.articleGeneration).toBeDefined();
      expect(PHASE_REQUIREMENTS.validation).toBeDefined();
    });

    it('should export ALL_PROMPTS', () => {
      expect(ALL_PROMPTS).toBeDefined();
      expect(Array.isArray(ALL_PROMPTS)).toBe(true);
      expect(ALL_PROMPTS.length).toBe(8);
    });
  });
});
