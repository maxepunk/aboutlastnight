/**
 * Theme Config Unit Tests
 * Commit 8.19: Tests for config-driven validation rules
 */

const {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getArticleRules
} = require('../theme-config');

describe('theme-config', () => {
  describe('THEME_CONFIGS', () => {
    it('should have journalist theme defined', () => {
      expect(THEME_CONFIGS.journalist).toBeDefined();
    });

    it('journalist should have npcs array', () => {
      expect(Array.isArray(THEME_CONFIGS.journalist.npcs)).toBe(true);
      expect(THEME_CONFIGS.journalist.npcs).toContain('Marcus');
      expect(THEME_CONFIGS.journalist.npcs).toContain('Nova');
    });

    it('journalist should have outlineRules object', () => {
      expect(THEME_CONFIGS.journalist.outlineRules).toBeDefined();
      expect(typeof THEME_CONFIGS.journalist.outlineRules).toBe('object');
    });

    it('journalist should have articleRules object', () => {
      expect(THEME_CONFIGS.journalist.articleRules).toBeDefined();
      expect(typeof THEME_CONFIGS.journalist.articleRules).toBe('object');
    });
  });

  describe('getThemeNPCs', () => {
    it('should return NPCs for journalist theme', () => {
      const npcs = getThemeNPCs('journalist');
      expect(npcs).toContain('Marcus');
      expect(npcs).toContain('Nova');
      expect(npcs).toContain('Blake');
      expect(npcs).toContain('Valet');
    });

    it('should return empty array for unknown theme', () => {
      const npcs = getThemeNPCs('unknown');
      expect(npcs).toEqual([]);
    });
  });

  describe('getThemeConfig', () => {
    it('should return full config for journalist theme', () => {
      const config = getThemeConfig('journalist');
      expect(config).toBeDefined();
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
      expect(config.articleRules).toBeDefined();
    });

    it('should return null for unknown theme', () => {
      const config = getThemeConfig('unknown');
      expect(config).toBeNull();
    });
  });

  describe('isValidTheme', () => {
    it('should return true for journalist theme', () => {
      expect(isValidTheme('journalist')).toBe(true);
    });

    it('should return false for unknown theme', () => {
      expect(isValidTheme('unknown')).toBe(false);
    });
  });

  describe('getOutlineRules', () => {
    it('should return outline rules for journalist theme', () => {
      const rules = getOutlineRules('journalist');
      expect(rules).toBeDefined();
      expect(rules.requiredSections).toBeDefined();
    });

    it('should include required sections', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.requiredSections).toContain('lede');
      expect(rules.requiredSections).toContain('theStory');
      expect(rules.requiredSections).toContain('thePlayers');
      expect(rules.requiredSections).toContain('closing');
    });

    it('should include optional sections', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.optionalSections).toContain('followTheMoney');
      expect(rules.optionalSections).toContain('whatsMissing');
    });

    it('should include word budgets', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.wordBudgets).toBeDefined();
      expect(rules.wordBudgets.lede).toEqual({ min: 50, max: 150 });
      expect(rules.wordBudgets.theStory).toEqual({ min: 200, max: 800 });
    });

    it('should return empty object for unknown theme', () => {
      const rules = getOutlineRules('unknown');
      expect(rules).toEqual({});
    });
  });

  describe('getArticleRules', () => {
    it('should return article rules for journalist theme', () => {
      const rules = getArticleRules('journalist');
      expect(rules).toBeDefined();
      expect(rules.requiredVoiceMarkers).toBeDefined();
      expect(rules.bannedPatterns).toBeDefined();
    });

    it('should include required voice markers', () => {
      const rules = getArticleRules('journalist');
      expect(rules.requiredVoiceMarkers).toContain('I ');
      expect(rules.requiredVoiceMarkers).toContain('my ');
      expect(rules.requiredVoiceMarkers).toContain('we ');
    });

    it('should include banned patterns with metadata', () => {
      const rules = getArticleRules('journalist');
      expect(Array.isArray(rules.bannedPatterns)).toBe(true);

      const emDash = rules.bannedPatterns.find(p => p.name === 'em-dash');
      expect(emDash).toBeDefined();
      expect(emDash.pattern).toBe('—');
      expect(emDash.description).toBeDefined();

      const tokenTerm = rules.bannedPatterns.find(p => p.name === 'token-term');
      expect(tokenTerm).toBeDefined();
      expect(tokenTerm.caseSensitive).toBe(false);

      const gameMechanics = rules.bannedPatterns.find(p => p.name === 'game-mechanics');
      expect(gameMechanics).toBeDefined();
      expect(gameMechanics.isRegex).toBe(true);
    });

    it('should include min roster mentions', () => {
      const rules = getArticleRules('journalist');
      expect(rules.minRosterMentions).toBe(1);
    });

    it('should return empty object for unknown theme', () => {
      const rules = getArticleRules('unknown');
      expect(rules).toEqual({});
    });
  });

  describe('module exports', () => {
    it('should export all required functions', () => {
      expect(typeof getThemeNPCs).toBe('function');
      expect(typeof getThemeConfig).toBe('function');
      expect(typeof isValidTheme).toBe('function');
      expect(typeof getOutlineRules).toBe('function');
      expect(typeof getArticleRules).toBe('function');
    });

    it('should export THEME_CONFIGS', () => {
      expect(THEME_CONFIGS).toBeDefined();
      expect(typeof THEME_CONFIGS).toBe('object');
    });
  });
});
