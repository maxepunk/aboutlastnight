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
  getArticleRules,
  getCanonicalName,
  getThemeCharacters
} = require('../theme-config');
// getArticleRules is intentionally still destructured above to PROVE it is
// undefined after deletion (see "F9: dead bannedPatterns config removed").

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

    it('should include word budgets for all sections', () => {
      const rules = getOutlineRules('journalist');
      expect(rules.wordBudgets).toBeDefined();
      expect(rules.wordBudgets.lede).toEqual({ min: 75, max: 150 });
      expect(rules.wordBudgets.theStory).toEqual({ min: 350, max: 550 });
      expect(rules.wordBudgets.followTheMoney).toEqual({ min: 75, max: 200 });
      expect(rules.wordBudgets.thePlayers).toEqual({ min: 150, max: 250 });
      expect(rules.wordBudgets.whatsMissing).toEqual({ min: 75, max: 150 });
      expect(rules.wordBudgets.closing).toEqual({ min: 75, max: 150 });
    });

    it('should return empty object for unknown theme', () => {
      const rules = getOutlineRules('unknown');
      expect(rules).toEqual({});
    });
  });

  describe('F9: dead bannedPatterns config removed', () => {
    it('getArticleRules is no longer exported', () => {
      expect(getArticleRules).toBeUndefined();
    });

    it('journalist config carries no articleRules', () => {
      expect(THEME_CONFIGS.journalist.articleRules).toBeUndefined();
    });

    it('detective config carries no articleRules', () => {
      expect(THEME_CONFIGS.detective.articleRules).toBeUndefined();
    });

    it('no theme retains a bannedPatterns array', () => {
      for (const cfg of Object.values(THEME_CONFIGS)) {
        expect(cfg.articleRules).toBeUndefined();
      }
    });
  });

  describe('detective theme', () => {
    it('isValidTheme returns true for detective', () => {
      expect(isValidTheme('detective')).toBe(true);
    });

    it('getThemeNPCs returns detective NPCs', () => {
      const npcs = getThemeNPCs('detective');
      expect(npcs).toContain('Marcus');
      expect(npcs).toContain('Blake');
      expect(npcs).toContain('Valet');
      // Detective Anondono is the narrator, not an NPC in arcs
      expect(npcs).not.toContain('Anondono');
    });

    it('getThemeConfig returns detective config with all required keys', () => {
      const config = getThemeConfig('detective');
      expect(config).not.toBeNull();
      expect(config.npcs).toBeDefined();
      expect(config.outlineRules).toBeDefined();
    });

    it('detective outlineRules has correct required sections', () => {
      const rules = getOutlineRules('detective');
      expect(rules.requiredSections).toEqual(
        expect.arrayContaining(['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'])
      );
    });

    it('detective does not include Nova as NPC', () => {
      const npcs = getThemeNPCs('detective');
      expect(npcs).not.toContain('Nova');
    });
  });

  describe('display config', () => {
    it('journalist has articleIdPrefix NNA', () => {
      const config = getThemeConfig('journalist');
      expect(config.display.articleIdPrefix).toBe('NNA');
    });

    it('detective has articleIdPrefix DCR', () => {
      const config = getThemeConfig('detective');
      expect(config.display.articleIdPrefix).toBe('DCR');
    });

    it('journalist has crystallizationLabel', () => {
      const config = getThemeConfig('journalist');
      expect(config.display.crystallizationLabel).toBe("Nova's Insight");
    });

    it('detective has crystallizationLabel', () => {
      const config = getThemeConfig('detective');
      expect(config.display.crystallizationLabel).toBe("Detective's Note");
    });

    it('journalist has postGenValidation rules', () => {
      const config = getThemeConfig('journalist');
      expect(config.display.postGenValidation.minInlineEvidenceCards).toBe(3);
    });

    it('detective has no postGenValidation minimums', () => {
      const config = getThemeConfig('detective');
      expect(config.display.postGenValidation.minInlineEvidenceCards).toBe(0);
    });

    it('journalist has storyDate for in-world article date', () => {
      const config = getThemeConfig('journalist');
      expect(config.display.storyDate).toBe('2027-02-22');
    });

    it('detective does not have storyDate (no in-world date constraint)', () => {
      const config = getThemeConfig('detective');
      expect(config.display.storyDate).toBeUndefined();
    });
  });

  describe('getCanonicalName (Notion-derived map)', () => {
    it('looks up first name in provided map', () => {
      const map = { 'Sarah': 'Sarah Blackwood', 'Vic': 'Vic Kingsley' };
      expect(getCanonicalName('Sarah', map)).toBe('Sarah Blackwood');
      expect(getCanonicalName('Vic', map)).toBe('Vic Kingsley');
    });

    it('normalizes to title case for lookup', () => {
      const map = { 'Sarah': 'Sarah Blackwood' };
      expect(getCanonicalName('sarah', map)).toBe('Sarah Blackwood');
      expect(getCanonicalName('SARAH', map)).toBe('Sarah Blackwood');
    });

    it('returns input unchanged when not in map', () => {
      const map = { 'Sarah': 'Sarah Blackwood' };
      expect(getCanonicalName('Unknown', map)).toBe('Unknown');
    });

    it('returns input unchanged when map is empty', () => {
      expect(getCanonicalName('Sarah', {})).toBe('Sarah');
      expect(getCanonicalName('Sarah')).toBe('Sarah');
    });

    it('handles null/empty input gracefully', () => {
      const map = { 'Sarah': 'Sarah Blackwood' };
      expect(getCanonicalName(null, map)).toBeNull();
      expect(getCanonicalName('', map)).toBe('');
    });
  });

  describe('getThemeCharacters (deprecated)', () => {
    it('returns empty array and logs deprecation warning', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = getThemeCharacters('journalist');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('DEPRECATED'));
      warnSpy.mockRestore();
    });
  });

  describe('canonicalCharacters removed from theme configs', () => {
    it('journalist config should not have canonicalCharacters', () => {
      const config = getThemeConfig('journalist');
      expect(config.canonicalCharacters).toBeUndefined();
    });

    it('detective config should not have canonicalCharacters', () => {
      const config = getThemeConfig('detective');
      expect(config.canonicalCharacters).toBeUndefined();
    });
  });

  describe('module exports', () => {
    it('should export all required functions', () => {
      expect(typeof getThemeNPCs).toBe('function');
      expect(typeof getThemeConfig).toBe('function');
      expect(typeof isValidTheme).toBe('function');
      expect(typeof getOutlineRules).toBe('function');
    });

    it('should export THEME_CONFIGS', () => {
      expect(THEME_CONFIGS).toBeDefined();
      expect(typeof THEME_CONFIGS).toBe('object');
    });
  });

  // Anti-drift: journalist NPCs must stay consistent with hardcoded NPC sets in
  // evaluator-nodes.js (NPC_DESCRIPTIONS ~line 284) and character-data-nodes.js (~line 81-85).
  // If this test fails after changing one of those, update ALL THREE locations together.
  describe('journalist NPC anti-drift', () => {
    it('getThemeNPCs(journalist) is exactly the canonical 4-NPC set', () => {
      const npcs = getThemeNPCs('journalist');
      expect(npcs).toHaveLength(4);
      expect(npcs).toEqual(expect.arrayContaining(['Marcus', 'Nova', 'Blake', 'Valet']));
    });
  });
});
