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
      expect(config.articleRules).toBeDefined();
      expect(config.canonicalCharacters).toBeDefined();
    });

    it('detective outlineRules has correct required sections', () => {
      const rules = getOutlineRules('detective');
      expect(rules.requiredSections).toEqual(
        expect.arrayContaining(['executiveSummary', 'evidenceLocker', 'suspectNetwork', 'outstandingQuestions', 'finalAssessment'])
      );
    });

    it('detective articleRules bans game mechanics but not em-dashes', () => {
      const rules = getArticleRules('detective');
      // Detective voice allows em-dashes (used in noir style)
      const patternNames = rules.bannedPatterns.map(p => p.name);
      expect(patternNames).not.toContain('em-dash');
      // Still bans game mechanics
      expect(patternNames).toContain('token-term');
    });

    it('detective requiredVoiceMarkers are third-person investigative', () => {
      const rules = getArticleRules('detective');
      // Detective uses third-person investigative, not first-person participatory
      expect(rules.requiredVoiceMarkers).not.toContain('I ');
      expect(rules.requiredVoiceMarkers).toEqual(
        expect.arrayContaining(['the investigation', 'evidence'])
      );
    });

    it('detective canonicalCharacters matches journalist PCs (same game)', () => {
      const detective = getThemeConfig('detective');
      const journalist = getThemeConfig('journalist');
      // Extract PC names only (exclude NPCs)
      const journalistPCs = Object.keys(journalist.canonicalCharacters)
        .filter(name => !['Marcus', 'Nova', 'Blake'].includes(name));
      const detectivePCs = Object.keys(detective.canonicalCharacters)
        .filter(name => !['Marcus', 'Blake'].includes(name));
      expect(detectivePCs.sort()).toEqual(journalistPCs.sort());
    });

    it('getCanonicalName works with detective theme', () => {
      expect(getCanonicalName('Sarah', 'detective')).toBe('Sarah Blackwood');
      expect(getCanonicalName('Vic', 'detective')).toBe('Vic Kingsley');
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
      expect(config.display.postGenValidation.minPullQuotes).toBe(2);
      expect(config.display.postGenValidation.minInlineEvidenceCards).toBe(3);
    });

    it('detective has no postGenValidation minimums', () => {
      const config = getThemeConfig('detective');
      expect(config.display.postGenValidation.minPullQuotes).toBe(0);
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

  describe('canonical character names (current Notion names)', () => {
    it('journalist canonicalCharacters has current first names', () => {
      const config = getThemeConfig('journalist');
      const chars = config.canonicalCharacters;
      // Updated names (Notion source of truth)
      expect(chars['Remi']).toBe('Remi Whitman');
      expect(chars['Vic']).toBe('Vic Kingsley');
      expect(chars['Sam']).toBe('Sam Thorne');
      expect(chars['Mel']).toBe('Mel Nilsson');
      expect(chars['Jess']).toBe('Jess Kane');
      expect(chars['Zia']).toBe('Zia Bishara');
      expect(chars['Riley']).toBe('Riley Torres');
      expect(chars['Ezra']).toBe('Ezra Sullivan');
      expect(chars['Nat']).toBe('Nat Francisco');
      expect(chars['Quinn']).toBe('Quinn Sterling');
      // Unchanged names
      expect(chars['Sarah']).toBe('Sarah Blackwood');
      expect(chars['Alex']).toBe('Alex Reeves');
      expect(chars['Ashe']).toBe('Ashe Motoko');
      expect(chars['Morgan']).toBe('Morgan Reed');
      expect(chars['Flip']).toBe('Flip');
      expect(chars['Taylor']).toBe('Taylor Chase');
      expect(chars['Kai']).toBe('Kai Andersen');
      expect(chars['Jamie']).toBe("Jamie \"Volt\" Woods");
      expect(chars['Skyler']).toBe('Skyler Iyer');
      expect(chars['Tori']).toBe('Tori Zhang');
    });

    it('journalist should NOT have stale names', () => {
      const config = getThemeConfig('journalist');
      const chars = config.canonicalCharacters;
      expect(chars['James']).toBeUndefined();
      expect(chars['Victoria']).toBeUndefined();
      expect(chars['Derek']).toBeUndefined();
      expect(chars['Diana']).toBeUndefined();
      expect(chars['Jessicah']).toBeUndefined();
      expect(chars['Leila']).toBeUndefined();
      expect(chars['Rachel']).toBeUndefined();
      expect(chars['Howie']).toBeUndefined();
      expect(chars['Sofia']).toBeUndefined();
      expect(chars['Oliver']).toBeUndefined();
    });

    it('detective canonicalCharacters matches journalist PCs', () => {
      const journalist = getThemeConfig('journalist');
      const detective = getThemeConfig('detective');
      const journalistPCs = Object.keys(journalist.canonicalCharacters)
        .filter(name => !['Marcus', 'Nova', 'Blake'].includes(name));
      const detectivePCs = Object.keys(detective.canonicalCharacters)
        .filter(name => !['Marcus', 'Blake'].includes(name));
      expect(detectivePCs.sort()).toEqual(journalistPCs.sort());
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
