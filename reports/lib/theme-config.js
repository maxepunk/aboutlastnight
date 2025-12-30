/**
 * Theme Configuration - Theme-specific settings for report generation
 *
 * Commit 8.17: Centralized theme config for DRY/SOLID compliance
 * Commit 8.19: Added outlineRules and articleRules for programmatic validation
 *
 * Each theme defines:
 * - npcs: Characters valid in characterPlacements but not on player roster
 * - outlineRules: Structural requirements for article outlines
 * - articleRules: Content rules for generated articles
 *
 * To add a new theme:
 * 1. Add entry to THEME_CONFIGS with theme name as key
 * 2. Define npcs, outlineRules, articleRules
 * 3. No changes needed to validation code (Open/Closed principle)
 */

const THEME_CONFIGS = {
  journalist: {
    // NPCs for the NovaNews investigative journalism theme
    // These characters are valid in arc characterPlacements but don't count toward roster coverage
    npcs: [
      'Marcus',   // The murder victim - central to every arc
      'Nova',     // The journalist narrator (matches "Nova" or "* Nova" patterns)
      'Blake',    // The valet NPC
      'Valet',    // Alias for Blake
    ],

    // Outline structure rules (Commit 8.19)
    // Used by programmatic validation BEFORE LLM evaluation
    outlineRules: {
      // Sections that MUST exist (structural requirement)
      requiredSections: ['lede', 'theStory', 'thePlayers', 'closing'],
      // Sections that MAY exist
      optionalSections: ['followTheMoney', 'whatsMissing'],
      // Target word counts per section (advisory)
      wordBudgets: {
        lede: { min: 50, max: 150 },
        theStory: { min: 200, max: 800 },
        thePlayers: { min: 100, max: 400 },
        closing: { min: 50, max: 200 }
      }
    },

    // Article content rules (Commit 8.19)
    // Used by programmatic validation BEFORE LLM evaluation
    articleRules: {
      // Voice markers that MUST appear (structural - first-person participatory voice)
      requiredVoiceMarkers: ['I ', 'my ', 'we '],
      // Anti-patterns that MUST NOT appear (structural)
      // Extracted from anti-patterns.md "Quick Reference: Never Do This" and "Game Mechanics Language"
      bannedPatterns: [
        // Typography
        { pattern: '—', name: 'em-dash', description: 'Use hyphen (-) not em-dash (—)' },
        // Game mechanics terminology
        { pattern: 'token', name: 'token-term', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'Act \\d', name: 'game-mechanics', isRegex: true, description: 'Game structure references' },
        { pattern: 'script beat', name: 'script-beat', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'final call', name: 'final-call', caseSensitive: false, description: 'Game structure terminology' },
        { pattern: 'token scan', name: 'token-scan', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'orchestrator', name: 'orchestrator', caseSensitive: false, description: 'Game mechanic terminology' },
        { pattern: 'unlock', name: 'unlock', caseSensitive: false, description: 'Game mechanic terminology' },
        // Meta terminology
        { pattern: 'buried memory', name: 'buried-memory', caseSensitive: false, description: 'Meta terminology' },
        { pattern: 'First burial', name: 'first-burial', caseSensitive: false, description: 'Meta terminology' },
        // Vague attributions (voice anti-patterns)
        { pattern: 'From my notes', name: 'vague-notes', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'From the investigation', name: 'vague-investigation', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'Sources confirm', name: 'vague-sources', caseSensitive: false, description: 'Vague attribution - cite specific evidence' },
        { pattern: 'Anonymous source', name: 'anonymous-source', caseSensitive: false, description: 'Vague attribution - cite specific evidence' }
      ],
      // Minimum roster coverage (advisory)
      minRosterMentions: 1  // Each roster member should be mentioned at least once
    },

    // Canonical character names (Commit 8.26)
    // Maps first names to full canonical names for consistent attribution
    // Source: docs/PIPELINE_DEEP_DIVE.md character roster
    canonicalCharacters: {
      // 20 Playable Characters (PCs)
      'Sarah': 'Sarah Blackwood',
      'Alex': 'Alex Reeves',
      'James': 'James Whitman',
      'Victoria': 'Victoria Kingsley',
      'Derek': 'Derek Thorne',
      'Ashe': 'Ashe Motoko',
      'Diana': 'Diana Nilsson',
      'Jessicah': 'Jessicah Kane',
      'Morgan': 'Morgan Reed',
      'Flip': 'Flip',  // No known last name
      'Taylor': 'Taylor Chase',
      'Leila': 'Leila Bishara',
      'Rachel': 'Rachel Torres',
      'Howie': 'Howie Sullivan',
      'Kai': 'Kai Andersen',
      'Jamie': 'Jamie "Volt" Woods',
      'Sofia': 'Sofia Francisco',
      'Oliver': 'Oliver Sterling',
      'Skyler': 'Skyler Iyer',
      'Tori': 'Tori Zhang',
      // 3 NPCs
      'Marcus': 'Marcus Blackwood',
      'Nova': 'Nova',
      'Blake': 'Blake'
    }
  }
};

/**
 * Get NPCs for a theme
 * @param {string} theme - Theme name (e.g., 'journalist')
 * @returns {string[]} Array of NPC names, empty array if theme not found
 */
function getThemeNPCs(theme) {
  return THEME_CONFIGS[theme]?.npcs || [];
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
 * Get outline rules for a theme (Commit 8.19)
 * @param {string} theme - Theme name
 * @returns {Object} Outline rules or empty object if theme not found
 */
function getOutlineRules(theme) {
  return THEME_CONFIGS[theme]?.outlineRules || {};
}

/**
 * Get article rules for a theme (Commit 8.19)
 * @param {string} theme - Theme name
 * @returns {Object} Article rules or empty object if theme not found
 */
function getArticleRules(theme) {
  return THEME_CONFIGS[theme]?.articleRules || {};
}

/**
 * Get canonical full name for a character first name (Commit 8.26)
 *
 * Used by extractOwnerName() in node-helpers.js to ensure consistent
 * character attribution across the pipeline.
 *
 * @param {string} firstName - First name (e.g., 'Victoria')
 * @param {string} theme - Theme name (default: 'journalist')
 * @returns {string} Full canonical name (e.g., 'Victoria Kingsley') or firstName if not found
 */
function getCanonicalName(firstName, theme = 'journalist') {
  if (!firstName) return firstName;
  // Normalize to title case for lookup
  const normalized = firstName.charAt(0).toUpperCase() + firstName.slice(1).toLowerCase();
  return THEME_CONFIGS[theme]?.canonicalCharacters?.[normalized] || firstName;
}

/**
 * Get all playable character first names for a theme (Commit 8.xx)
 *
 * Returns only PC names, not NPCs. Used for non-roster PC derivation.
 * Non-roster PCs = getThemeCharacters(theme) - roster - npcs
 *
 * @param {string} theme - Theme name (default: 'journalist')
 * @returns {string[]} Array of PC first names
 */
function getThemeCharacters(theme = 'journalist') {
  const config = THEME_CONFIGS[theme];
  if (!config?.canonicalCharacters) return [];

  const npcs = config.npcs || [];
  const npcSet = new Set(npcs.map(n => n.toLowerCase()));

  // Return first names of characters that aren't NPCs
  return Object.keys(config.canonicalCharacters)
    .filter(name => !npcSet.has(name.toLowerCase()));
}

module.exports = {
  THEME_CONFIGS,
  getThemeNPCs,
  getThemeConfig,
  isValidTheme,
  getOutlineRules,
  getArticleRules,
  getCanonicalName,
  getThemeCharacters
};
