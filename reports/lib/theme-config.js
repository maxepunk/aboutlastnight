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
 * - rules: the theme's rules folder (phase 4, R14), relative to the reports folder, which
 *   lib/rule-set.js reads for every writer, rework and judge of the theme
 * - identities: by call, the theme's identity lines for the new stages (phase 4, briefs 4.13
 *   and 4.13b; read through identityLineOf). A writer's or a judge's line opens its call's
 *   system prompt. A rework's line opens its rework rules, which follow its writer's system
 *   prompt, and code completes it with the rework's task
 *
 * To add a new theme:
 * 1. Add entry to THEME_CONFIGS with theme name as key
 * 2. Define npcs, display.printsHero, rules and identities, and, for a theme with a story
 *    map, map.slots
 * 3. No changes needed to validation code (Open/Closed principle)
 */

// Brief 4.13b: the identity calls are derived from the rule set's calls. lib/rule-set.js
// reads THEME_CONFIGS where it uses them, not at its top, so the two modules load in
// either order.
const { RULE_SET_CALLS } = require('./rule-set');

/** What a rework's call adds to its writer's call: `arc-rework` reworks what `arc` wrote. */
const REWORK_SUFFIX = '-rework';

/**
 * The calls a theme gives an identity line for (phase 4, briefs 4.13 and 4.13b): the rule
 * set's calls (lib/rule-set.js RULE_SET_CALLS), each writer's rework beside its call. They
 * are derived from that list, so a call the rule set gains is one here too. A judge's call
 * opens `judge-` and has no rework. `arc` is the weave writer, `outline` the map writer;
 * `judge-arc` is the story meeting's fact check.
 *
 * A writer's or a judge's line opens its call's system prompt. A rework's line opens its
 * rework rules, not its call's prompt: the rework's system prompt is its writer's, then the
 * rework rules, whose first line is the rework's identity line completed by code with the
 * rework's task.
 */
const IDENTITY_CALLS = Object.freeze(Object.keys(RULE_SET_CALLS).flatMap(
  (call) => (call.startsWith('judge-') ? [call] : [call, `${call}${REWORK_SUFFIX}`])
));

/**
 * A line that runs on into its task: it ends on a letter or a digit, or on a closing quotation
 * mark or bracket that follows one, with nothing after it. A rework's line must (identityLineOf):
 * code completes it with the rework's task, so a full stop, a comma, a colon, a dash or a
 * trailing space at its end prints a broken first line (the integrator, at 4.13b's merge).
 */
const RUNS_ON_INTO_ITS_TASK = /[\p{L}\p{N}]['"\u2019\u201d)\]]*$/u;

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
    //
    // Phases 14 and 15 (R4; spec section 5): the NPC who writes the article carries
    // `writer`, the text code builds Nova's lines from (lib/prompt-renderers/
    // session-authors.js), so no code names Nova. `{first}` is the session's first name for
    // Nova (sessionConfig.journalistFirstName, else defaultFirstName), `{name}` a name as a
    // photo gives it.
    // - signs: joins Nova's line in the roster section, which every writer and judge reads.
    // - inPhotos: on site only, the character-IDs parse and the photo enrichment read it
    //   beside the roster, so neither corrects Nova's name to a player's.
    // - inAPhoto: on site only, a photo entry's name for Nova, which no roster player has.
    // - inAPhotoByName: the same for a name that already holds Nova's own name ("Nova", or the
    //   first name with it), so the mark does not repeat it (the final fix wave, K4).
    // - inTheRoom: on site only, SESSION_FACTS' line beside Blake's (the final fix wave, K1),
    //   which points at the mode block rather than restating it.
    npcs: [
      { name: 'Marcus', fullName: 'Marcus Blackwood', pronouns: 'he/him', role: 'the man whose death the room investigates' },
      {
        name: 'Nova',
        fullName: 'Nova',
        role: 'the NovaNews reporter who writes the article',
        writer: {
          defaultFirstName: 'Cassandra',
          signs: "Nova signs it {first} Nova, and the director's notes may call Nova {first}.",
          inPhotos: 'Nova, the NovaNews reporter who writes this article and signs it {first} Nova, was in the room and may be in a photo. ' +
            'A name a roster player has names that player; any other "Nova" or "{first}" names Nova: keep it as written.',
          inAPhoto: '{name} (Nova, who writes this article)',
          inAPhotoByName: '{name} (who writes this article)',
          inTheRoom: 'Nova was in the room too, working it for the story, as the reporting-mode block sets out (T8).'
        }
      },
      { name: 'Blake', fullName: 'Blake', role: 'manages operations at NeurAI; Marcus called Blake his Valet' },
      { name: 'Valet', aliasOf: 'Blake', role: 'alias for Blake' }
    ],

    // Article content rules: REMOVED (F9/CR-5). The bannedPatterns/getArticleRules
    // config had zero runtime consumers. Since phase 3 the writers read the rule set
    // (lib/rule-set.js), and the evaluator holds the checks.

    // The rules folder (phase 4, R14): the world, the truth rules, the eight craft files and
    // the two mode files, which every writer, rework and judge of this theme reads through
    // lib/rule-set.js.
    rules: '.claude/skills/journalist-report/references/rules',

    // The identity lines (phase 4, brief 4.13): who is writing, reworking or judging, the
    // first line of each writer's and judge's system prompt and of each rework's rework
    // rules. The narrator, the publication and the form of the output are the theme's to
    // name, so the lines live here and none sits in code. A writer's and a judge's line is a
    // sentence of its own. A rework's line is the opening of its rework rules, which code
    // completes with the rework's task (": the director sent it back, ..." or " after an
    // automatic check ..."), so it ends where that task begins (identityLineOf refuses one
    // that ends a sentence; brief 4.13b).
    identities: {
      arc: 'You are the arc writer for an investigative article about one session of the game: you pitch the angles the article could take, for the director to pick one and settle it at the story meeting.',
      'arc-rework': 'You are reworking the weave you wrote',
      outline: 'You are laying out the story map of a NovaNews investigative article.',
      'outline-rework': 'You are reworking the story map you wrote',
      article: 'You are Nova, writing a NovaNews investigative article in the first person.',
      'article-rework': 'You are Nova, reworking your article',
      'judge-arc': 'You are the WEAVE fact check for an investigative article about one session of the game: you check the weave the arc writer wrote, before the director reads it at the story meeting.',
      'judge-article': 'You are the ARTICLE judge for an investigative article about one session of the game: you check the article the article writer wrote, before the director reads it.'
    },

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
 * The theme's identity line for one call (phase 4, briefs 4.13 and 4.13b). Every call reads
 * its line here, through the theme it holds, so a theme brings its narrator, its publication
 * and its form of output in its own config. One line of text. A writer's or a judge's line
 * opens its system prompt, with the session's mode block after it. A rework's line opens its
 * rework rules: a clause that code completes with the rework's task, so it runs on into that
 * task and never ends a sentence.
 *
 * Each refusal names the theme as it was given and the call, so a theme author who gets a
 * line wrong is told which, before that call's prompt is built. The suite runs every call of
 * every theme that names a rules folder (lib/__tests__/theme-config.test.js), so a bad line
 * fails there first.
 *
 * @param {string} theme - Theme name
 * @param {string} call - one of IDENTITY_CALLS
 * @returns {string}
 * @throws {Error} without a theme; for a theme the config does not know; on a call not in
 *   IDENTITY_CALLS; for a theme whose config gives no line for the call (the parked
 *   detective, R1); for an empty line or a line of more than one line; and for a rework's
 *   line that ends a sentence
 */
function identityLineOf(theme, call) {
  if (typeof theme !== 'string' || !theme) {
    throw new Error(
      `[identityLineOf] The theme is required (got ${JSON.stringify(theme)}): the identity line of the call ` +
      `"${call}" is its theme's (lib/theme-config.js).`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(THEME_CONFIGS, theme)) {
    throw new Error(`[identityLineOf] Unknown theme "${theme}": no config in lib/theme-config.js gives its identity line for the call "${call}".`);
  }
  if (!IDENTITY_CALLS.includes(call)) {
    throw new Error(
      `[identityLineOf] Unknown call "${call}" for the theme "${theme}": a theme gives an identity line for each of ` +
      `${IDENTITY_CALLS.join(', ')}.`
    );
  }
  const identities = THEME_CONFIGS[theme].identities || {};
  const line = Object.prototype.hasOwnProperty.call(identities, call) ? identities[call] : undefined;
  const fix = `give its config (lib/theme-config.js) identities["${call}"], one line of text.`;
  if (typeof line !== 'string') {
    throw new Error(`[identityLineOf] The theme "${theme}" has no identity line for the call "${call}": ${fix}`);
  }
  if (!line.trim()) {
    throw new Error(`[identityLineOf] The theme "${theme}" gives the call "${call}" an empty identity line: ${fix}`);
  }
  if (line.includes('\n')) {
    throw new Error(`[identityLineOf] The theme "${theme}" gives the call "${call}" an identity line of more than one line: ${fix}`);
  }
  if (call.endsWith(REWORK_SUFFIX) && !RUNS_ON_INTO_ITS_TASK.test(line)) {
    throw new Error(
      `[identityLineOf] The theme "${theme}" gives the call "${call}" an identity line that does not end on a word ` +
      `(${JSON.stringify(line)}): a rework's line is a clause that opens its rework rules, and code completes it with ` +
      'the rework\'s task (": the director sent it back, ..."), so end it on its last word, with no mark after it but a closing quotation mark or bracket.'
    );
  }
  return line;
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
  IDENTITY_CALLS,
  identityLineOf,
  getCanonicalName,
  getThemeCharacters,
  printedHero
};
