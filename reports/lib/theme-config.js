/**
 * Theme Configuration - Theme-specific settings for report generation
 *
 * Commit 8.17: Centralized theme config for DRY/SOLID compliance
 * F9/CR-5: articleRules (bannedPatterns) removed — ban enforcement is prompt-only.
 * Phase 4 (brief 4.6; R1): the outline rules went with the outline stage, the
 * journalist's in phase 3 and the parked detective's with its outline branch.
 *
 * Each theme defines:
 * - npcs: Characters valid in characterPlacements but not on player roster
 * - display: constants for the printed page, including printsHero, whether the theme's
 *   layout prints the bundle's hero (read through printedHero)
 * - map: the story map's slots (phase 4, brief 4.6), each with its key, its label on
 *   the screen and its default heading, in their usual order (read through mapSlotsOf).
 *   The map writer lays the settled weave across them; a theme without them has no map
 *
 * To add a new theme:
 * 1. Add entry to THEME_CONFIGS with theme name as key
 * 2. Define npcs, display.printsHero and, for a theme with a story map, map.slots
 * 3. No changes needed to validation code (Open/Closed principle)
 */

const THEME_CONFIGS = {
  journalist: {
    // NPCs for the NovaNews investigative journalism theme.
    // Valid in arc characterPlacements but don't count toward roster coverage.
    //
    // `pronouns` is here because the NPCs are FIXED CANON while rosterPronouns is
    // per-session and keyed by the roster. The victim is never on the roster, so
    // Marcus had no pronoun anywhere in the prompt and the model guessed -- 26
    // pronoun/fact errors across 4 of 5 sessions, "above all Marcus written
    // they/them" (BASELINE.md §4 class 3). Omit the field rather than invent it:
    // the references use they/them for Blake in prose but never DECLARE Blake's
    // pronouns, so Blake carries none.
    //
    // Phase 3 (3.2): the roles are the canon, stated once, here (spec T15 and D7;
    // M26). The roster block prints them to every writer and judge, and character
    // extraction reads them too. What Marcus's death was is the room's verdict (T2),
    // so the line names no murder. Nova has no pronoun field: Nova is never gendered
    // (T9), and writes in the first person.
    npcs: [
      { name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him', role: 'the man whose death the room investigates' },
      { name: 'Nova', fullName: 'Nova', role: 'the NovaNews reporter who writes the article' },
      { name: 'Blake', fullName: 'Blake', role: 'manages operations at NeurAI; Marcus called Blake his Valet' },
      { name: 'Valet', aliasOf: 'Blake', role: 'alias for Blake' }
    ],

    // Article content rules: REMOVED (F9/CR-5). The bannedPatterns/getArticleRules
    // config had zero runtime consumers. Since phase 3 the writers read the rule set
    // (lib/rule-set.js), and the evaluator holds the checks.

    // The story map's slots (phase 4, brief 4.6; spec 5.2): the article's house
    // sections, in their usual order, each with its label for the screen and the heading
    // the map starts from. The map uses a slot, gives it its own heading, or drops it
    // with a reason (C2), and orders the slots it uses. The lede and the closing print no
    // heading (C14: the closing is untitled). The schema's slot names, the writer's list
    // and the stop's payload all come from here, so a theme brings its own slots in its
    // config and no code names them.
    map: {
      slots: [
        { key: 'lede', label: 'Lede', heading: '' },
        { key: 'theStory', label: 'The Story', heading: 'The Story' },
        { key: 'followTheMoney', label: 'Follow the Money', heading: 'Follow the Money' },
        { key: 'thePlayers', label: 'The Players', heading: 'The Players' },
        { key: 'whatsMissing', label: "What's Missing", heading: "What's Missing" },
        { key: 'closing', label: 'Closing', heading: '' }
      ]
    },

    // canonicalCharacters REMOVED — now derived from Notion Character database
    // via extractCanonicalCharacters() in node-helpers.js at fetch time.
    // Stored in state.canonicalCharacters for downstream use.

    // Display constants for template rendering and post-generation validation
    // Used by template-helpers.js (articleIdPrefix), Article.js (crystallizationLabel),
    // and ai-nodes.js (postGenValidation)
    display: {
      articleIdPrefix: 'NNA',           // NovaNews Article
      crystallizationLabel: "Nova's Insight",
      storyDate: '2027-02-22',           // In-world article date (always Feb 22, 2027)
      printsHero: true,                  // The layout prints heroImage above the first section
      postGenValidation: {
        minInlineEvidenceCards: 3
      }
    }
  },

  detective: {
    // NPCs for the detective investigation theme.
    // Same game universe, different narrator (Detective Anondono).
    npcs: [
      { name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him', role: 'the murder victim' },
      { name: 'Blake', fullName: 'Blake', role: 'the valet NPC' },
      { name: 'Valet', aliasOf: 'Blake', role: 'alias for Blake' }
    ],

    // Article content rules: REMOVED (F9/CR-5) — ban enforcement is PROMPT-ONLY.

    // canonicalCharacters REMOVED — now derived from Notion Character database
    // via extractCanonicalCharacters() in node-helpers.js at fetch time.

    // Display constants for template rendering and post-generation validation
    // Detective case reports use a different ID prefix and no evidence-card minimum (minInlineEvidenceCards: 0)
    display: {
      articleIdPrefix: 'DCR',           // Detective Case Report
      crystallizationLabel: "Detective's Note",
      printsHero: false,                 // The case file prints no hero
      postGenValidation: {
        minInlineEvidenceCards: 0
      }
    }
  }
};

/**
 * Get the raw NPC entries for a theme.
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @returns {Array<{name: string, fullName?: string, pronouns?: string, aliasOf?: string, role?: string}>}
 */
function getThemeNPCEntries(theme) {
  return THEME_CONFIGS[theme]?.npcs || [];
}

/**
 * Get NPC NAMES for a theme.
 *
 * Unchanged contract (a flat array of name strings) so every consumer
 * -- getNonRosterPCs, the arc writer's character-categories block, the
 * director-notes enrichment -- keeps working after the entries gained fields.
 *
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @returns {string[]} Array of NPC names, empty array if theme not found
 */
function getThemeNPCs(theme) {
  return getThemeNPCEntries(theme).map(n => (typeof n === 'string' ? n : n.name)).filter(Boolean);
}

/**
 * Get a name -> pronouns map for the NPCs whose pronouns the canon states.
 *
 * Consumed by the article roster block (the authority the pronoun rule points at)
 * and by the fact-check's pronoun scan. Aliases and NPCs without declared
 * pronouns are absent, so nothing here is an invention.
 *
 * @param {string} theme
 * @returns {Object<string,string>}
 */
function getThemeNPCPronouns(theme) {
  const out = {};
  for (const entry of getThemeNPCEntries(theme)) {
    if (entry && typeof entry === 'object' && entry.pronouns && !entry.aliasOf) {
      out[entry.name] = entry.pronouns;
    }
  }
  return out;
}

/**
 * Get full config for a theme
 * @param {string} theme - Theme name
 * @returns {Object|null} Theme config or null if not found
 */
function getThemeConfig(theme) {
  return THEME_CONFIGS[theme] || null;
}

/**
 * Check if a theme exists
 * @param {string} theme - Theme name
 * @returns {boolean}
 */
function isValidTheme(theme) {
  return theme in THEME_CONFIGS;
}

/**
 * The hero the theme's page prints, or null. This is the one rule for the hero: the
 * assembler reads it for the page and its photo spacing, and printedPhotos
 * (lib/publish-photos.js) for its list of the photos a page prints.
 *
 * A page prints a hero when the theme's layout prints one (display.printsHero: the
 * journalist's does, the detective's case file does not) and the bundle's heroImage
 * names a file. A hero with no filename would print as a broken image, so it does not
 * print, and nothing is published for it.
 *
 * @param {Object} bundle - ContentBundle
 * @param {string} theme - Theme name
 * @returns {Object|null} the bundle's heroImage when the page prints it
 * @throws {Error} for a theme whose display config does not say whether its page prints
 *   a hero, naming the theme
 */
function printedHero(bundle, theme) {
  const printsHero = Object.prototype.hasOwnProperty.call(THEME_CONFIGS, theme)
    ? THEME_CONFIGS[theme].display?.printsHero
    : undefined;
  if (typeof printsHero !== 'boolean') {
    throw new Error(
      `[printedHero] No layout is known for the theme "${theme}": give its display config ` +
      'printsHero, saying whether its page prints the hero.'
    );
  }
  const hero = bundle && bundle.heroImage;
  const namesFile = Boolean(hero) && typeof hero === 'object' &&
    typeof hero.filename === 'string' && hero.filename !== '';
  return printsHero && namesFile ? hero : null;
}

/**
 * The story map's slots for a theme (phase 4, brief 4.6), in their usual order, each
 * `{key, label, heading}`: a copy, so no caller changes the config. A theme with no map
 * in its config, such as the parked detective (R1), has none.
 *
 * @param {string} theme - Theme name
 * @returns {Array<{key: string, label: string, heading: string}>}
 */
function mapSlotsOf(theme) {
  const slots = Object.prototype.hasOwnProperty.call(THEME_CONFIGS, theme) ? THEME_CONFIGS[theme].map?.slots : null;
  return Array.isArray(slots) ? slots.map((slot) => ({ ...slot })) : [];
}

/**
 * Get canonical full name for a character first name
 *
 * Looks up a first name in a Notion-derived canonical characters map.
 * The map is built by extractCanonicalCharacters() from token owner data.
 *
 * @param {string} firstName - First name (e.g., 'Vic')
 * @param {Object} canonicalCharacters - Notion-derived map of firstName -> fullName
 * @returns {string} Full canonical name (e.g., 'Vic Kingsley') or firstName if not found
 */
function getCanonicalName(firstName, canonicalCharacters = {}) {
  if (!firstName) return firstName;
  // Normalize to title case for lookup
  const normalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return canonicalCharacters[normalized] || firstName;
}

/**
 * @deprecated Use Object.keys(state.canonicalCharacters) instead.
 * Character names are now derived from Notion at fetch time, not hardcoded.
 *
 * @param {string} theme - Theme name (unused)
 * @returns {string[]} Always returns empty array
 */
function getThemeCharacters(theme = 'journalist') {
  console.warn('[getThemeCharacters] DEPRECATED: Use Object.keys(state.canonicalCharacters) instead. Hardcoded character maps have been removed.');
  return [];
}

module.exports = {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeNPCEntries,
  getThemeNPCPronouns,
  getThemeConfig,
  isValidTheme,
  mapSlotsOf,
  getCanonicalName,
  getThemeCharacters,
  printedHero
};
