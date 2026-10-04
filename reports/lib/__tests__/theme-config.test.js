/**
 * Theme Config Unit Tests
 * Commit 8.19: Tests for config-driven validation rules
 */

const fs = require('fs');
const path = require('path');
const {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getArticleRules,
  getCanonicalName,
  getThemeCharacters,
  printedHero
} = require('../theme-config');
// getArticleRules is intentionally still destructured above to PROVE it is
// undefined after deletion (see "F9: dead bannedPatterns config removed").

describe('theme-config', () => {
  describe('THEME_CONFIGS', () => {
    it('should have journalist theme defined', () => {
      expect(THEME_CONFIGS.journalist).toBeDefined();
    });

    it('journalist should have npcs array', () => {
      // BASELINE §4 class 3: the entries are objects now, so each NPC can carry
      // the pronouns the canon states (the victim is never on the session roster
      // and so had no pronoun anywhere in the prompt). getThemeNPCs still returns
      // plain names for every existing consumer.
      expect(Array.isArray(THEME_CONFIGS.journalist.npcs)).toBe(true);
      expect(THEME_CONFIGS.journalist.npcs.map(n => n.name)).toContain('Marcus');
      expect(THEME_CONFIGS.journalist.npcs.map(n => n.name)).toContain('Nova');
      expect(getThemeNPCs('journalist')).toContain('Marcus');
      expect(getThemeNPCs('journalist')).toContain('Nova');
    });

    // Fix 3.2b (finding 6): the journalist's outline rules (a fixed list of required
    // sections and per-section word budgets) had no reader and stated the contract
    // TH4 and C2 retired. The detective's stay (D13).
    it('journalist has no outlineRules', () => {
      expect(THEME_CONFIGS.journalist).not.toHaveProperty('outlineRules');
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
      expect(config.outlineRules).toBeUndefined();
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

  // Phase 4 (brief 4.6; R1): the outline rules went with the outline stage, the parked
  // detective's with its outline branch; no code read them.
  it('the outline rules are gone, for every theme', () => {
    expect(require('../theme-config').getOutlineRules).toBeUndefined();
    Object.values(THEME_CONFIGS).forEach((config) => expect(config).not.toHaveProperty('outlineRules'));
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
      expect(config.display).toBeDefined();
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

  // FB: one rule says whether a page prints a hero, read by the assembler (the page and
  // its photo spacing) and by printedPhotos (the publish and the fact check). It used to
  // be stated twice, and the two disagreed on a hero with no filename.
  describe('printedHero', () => {
    const hero = { filename: 'aln0926262 (10 of 11).jpg', caption: 'The six in the huddle.' };

    it("is the bundle's hero on a page whose layout prints one", () => {
      expect(printedHero({ heroImage: hero }, 'journalist')).toBe(hero);
    });

    it("is null on a page whose layout prints none: the detective's case file", () => {
      expect(printedHero({ heroImage: hero }, 'detective')).toBeNull();
    });

    it('is null for a hero that names no file, which would print as a broken image', () => {
      for (const heroImage of [{ caption: 'The six in the huddle.' }, { filename: '' }, { filename: 7 }, 'hero.jpg', null, undefined]) {
        expect(printedHero({ heroImage }, 'journalist')).toBeNull();
      }
      expect(printedHero(undefined, 'journalist')).toBeNull();
    });

    it('throws for a theme that does not say whether its page prints a hero, naming it', () => {
      expect(() => printedHero({ heroImage: hero }, 'noir')).toThrow(/"noir"/);
    });

    it("says what each theme's layout does", () => {
      for (const theme of Object.keys(THEME_CONFIGS)) {
        const layout = fs.readFileSync(path.join(__dirname, '..', '..', 'templates', theme, 'layouts', 'article.hbs'), 'utf8');
        expect({ theme, printsHero: THEME_CONFIGS[theme].display.printsHero })
          .toEqual({ theme, printsHero: layout.includes('heroImage') });
      }
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

describe("4.6: the map's slots are the theme's", () => {
  const { mapSlotsOf } = require('../theme-config');

  it('the journalist has six slots, in their usual order, each with its label and its default heading', () => {
    expect(mapSlotsOf('journalist')).toEqual([
      { key: 'lede', label: 'Lede', heading: '' },
      { key: 'theStory', label: 'The Story', heading: 'The Story' },
      { key: 'followTheMoney', label: 'Follow the Money', heading: 'Follow the Money' },
      { key: 'thePlayers', label: 'The Players', heading: 'The Players' },
      { key: 'whatsMissing', label: "What's Missing", heading: "What's Missing" },
      { key: 'closing', label: 'Closing', heading: '' }
    ]);
  });

  it('a theme with no map in its config, such as the parked detective, has no slots; the list is a copy', () => {
    expect(mapSlotsOf('detective')).toEqual([]);
    expect(mapSlotsOf('unknown')).toEqual([]);
    mapSlotsOf('journalist').pop();
    expect(mapSlotsOf('journalist')).toHaveLength(6);
  });
});

/**
 * 4.13b: a theme's identity lines, as a theme author meets them (phase 4; the integrator's
 * ruling 2 on 4.13's minors). A future theme is new files rather than new code, so a theme
 * author who gets an identity line wrong is told so, naming the theme and the call, before
 * any prompt is built. The brief's three tests:
 * - one list of calls: the identity calls are the rule set's calls (lib/rule-set.js
 *   RULE_SET_CALLS), each writer's rework beside its call;
 * - a rework's line is a clause that code completes with the rework's task, so a line that
 *   ends a sentence is refused;
 * - every refusal of identityLineOf, in one table.
 */
describe("4.13b: a theme's identity lines", () => {
  const { identityLineOf, IDENTITY_CALLS } = require('../theme-config');
  const { RULE_SET_CALLS } = require('../rule-set');

  /** A theme planted with one identity line for one row, gone after each test. */
  const PLANTED = 'planted-lines';
  const plant = (call, line) => {
    THEME_CONFIGS[PLANTED] = { npcs: [], identities: { [call]: line } };
  };
  afterEach(() => {
    delete THEME_CONFIGS[PLANTED];
  });

  /** The error identityLineOf throws for the theme and the call, or null. */
  const refusalOf = (theme, call) => {
    try {
      identityLineOf(theme, call);
      return null;
    } catch (error) {
      return error;
    }
  };

  describe('one list of calls', () => {
    it("today: the rule set's five calls and the three writers' reworks, and the journalist gives a line for each", () => {
      expect(Object.keys(RULE_SET_CALLS)).toEqual(['arc', 'outline', 'article', 'judge-arc', 'judge-article']);
      expect(IDENTITY_CALLS).toEqual([
        'arc', 'arc-rework', 'outline', 'outline-rework', 'article', 'article-rework', 'judge-arc', 'judge-article'
      ]);
      for (const call of IDENTITY_CALLS) {
        expect([call, typeof identityLineOf('journalist', call)]).toEqual([call, 'string']);
      }
    });

    // The list is derived, not restated: a call the rule set gains is an identity call
    // with no edit here, and a writer's call brings its rework's. A judge's has none.
    it('a call the rule set gains is an identity call, with its rework beside it when a writer makes it', () => {
      let derived;
      try {
        jest.isolateModules(() => {
          jest.doMock('../rule-set', () => ({
            RULE_SET_CALLS: { arc: [], captions: ['craft-form'], 'judge-arc': [], 'judge-captions': [] }
          }));
          ({ IDENTITY_CALLS: derived } = require('../theme-config'));
        });
      } finally {
        jest.dontMock('../rule-set');
      }
      expect(derived).toEqual(['arc', 'arc-rework', 'captions', 'captions-rework', 'judge-arc', 'judge-captions']);
    });
  });

  describe("a rework's line is a clause", () => {
    // The journalist's arc rework line reads "You are reworking the weave you wrote", and
    // code completes it: ": the director sent it back, ...". A line that ends a sentence
    // would print "...wrote.: the director sent it back".
    it.each([
      ['a full stop', 'You are reworking the weave you wrote.'],
      ['a question mark', 'Are you reworking the weave you wrote?'],
      ['an exclamation mark', 'You are reworking the weave you wrote!'],
      ['an ellipsis', 'You are reworking the weave you wrote\u2026'],
      ['a full stop inside a closing quotation mark', 'You are reworking "the weave you wrote."'],
      ['a full stop and a trailing space', 'You are reworking the weave you wrote. ']
    ])('a rework line that ends a sentence with %s is refused, naming the theme and the call', (_mark, line) => {
      for (const call of ['arc-rework', 'outline-rework', 'article-rework']) {
        plant(call, line);
        const error = refusalOf(PLANTED, call);
        expect([call, error && error.message]).toEqual([call, expect.stringMatching(/ends a sentence/)]);
        expect(error.message).toContain(`"${PLANTED}"`);
        expect(error.message).toContain(`"${call}"`);
      }
    });

    it("takes a rework line that runs on into its task, and a writer's or a judge's line that ends a sentence", () => {
      plant('arc-rework', 'You are reworking the weave you wrote');
      expect(identityLineOf(PLANTED, 'arc-rework')).toBe('You are reworking the weave you wrote');
      plant('outline-rework', 'You are reworking the "map"');
      expect(identityLineOf(PLANTED, 'outline-rework')).toBe('You are reworking the "map"');
      for (const call of ['arc', 'outline', 'article', 'judge-arc', 'judge-article']) {
        plant(call, 'You are the planted writer.');
        expect(identityLineOf(PLANTED, call)).toBe('You are the planted writer.');
      }
    });
  });

  describe("identityLineOf's refusals, each naming the theme and the call", () => {
    it.each([
      ['an unknown call', 'journalist', 'map', undefined, /Unknown call/],
      ['no theme', undefined, 'arc', undefined, /theme is required/],
      ['an empty theme name', '', 'outline', undefined, /theme is required/],
      ['an unknown theme', 'noir', 'article', undefined, /Unknown theme/],
      ['no line for the call: the parked detective (R1)', 'detective', 'judge-arc', undefined, /has no identity line/],
      ['an empty line', PLANTED, 'judge-article', '   ', /an empty identity line/],
      ['a line of more than one line', PLANTED, 'arc', 'You are the planted writer.\nYou write the weave.', /more than one line/],
      ['a rework line that ends a sentence', PLANTED, 'outline-rework', 'You are reworking the map you wrote.', /ends a sentence/]
    ])('%s', (_case, theme, call, line, reason) => {
      if (line !== undefined) plant(call, line);
      const error = refusalOf(theme, call);
      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(reason);
      // The theme as it was given (a string quoted, a missing one as undefined), and the call.
      expect(error.message).toContain(`${JSON.stringify(theme)}`);
      expect(error.message).toContain(`"${call}"`);
    });
  });
});
