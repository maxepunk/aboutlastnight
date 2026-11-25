/**
 * The rule set: one loader for the model-facing rules every writer and judge reads
 * (phase 3, task 3.1), from the rules folder of the theme the caller holds. Phase 18 set
 * the files and the lists it reads today (R1, R2; the brief-and-the-limits spec, section 1:
 * docs/superpowers/specs/2026-11-20-the-brief-and-the-limits-design.md).
 *
 * The journalist's rules live as Markdown files in its skill,
 * `.claude/skills/journalist-report/references/rules/`, and a theme's folder holds files of
 * the same names, eight in all, each the text the director settled on 2026-11-20:
 * - `world.md`: the world, what became of each memory, and what the writer is given and
 *   what each thing is in the story;
 * - `limits.md`: the fifteen limits on what the article may claim;
 * - `brief.md`: how a reporter approaches this article, with reasons, which the three
 *   writers read;
 * - `job-weave.md`, `job-map.md` and `job-article.md`: each writer's own part, read beside
 *   the brief by the writer whose work it is (the spec's section 3);
 * - `mode-on-site.md` and `mode-remote.md`: where Nova was this session, the part about this
 *   session, which loadModeBlock hands back in a `this-session` tag.
 * Each call reads the files RULE_SET_CALLS gives it.
 *
 * Synchronous on purpose: it reads with readFileSync and caches, so every prompt
 * builder that calls it stays synchronous. The cache lives for the process: a
 * changed rule file reaches the prompts on the next server start.
 *
 * Each theme's own rules (phase 4, the integrator's ruling R14). A theme's config names its
 * rules folder (lib/theme-config.js `rules`), and every caller passes the theme it holds,
 * so a second theme brings its rules as files. The parked detective (R1) names none, so a
 * call for it throws here, naming it.
 */

const fs = require('fs');
const path = require('path');

/** The folder a theme's `rules` path is relative to: the reports folder. */
const REPORTS_ROOT = path.resolve(__dirname, '..');

/** Every writer and judge reads these first: the world, then the limits. */
const CORE_FILES = ['world', 'limits'];

/**
 * Each call's own files, after the core (phase 18, R2; the spec's sections 1 and 3): each
 * writer reads the brief, then its own part, right after it. The weave writer's part is
 * `job-weave`, the map writer's `job-map` and the article writer's `job-article`. The article
 * writer read its own part first for a while (run 2b, R24); run 2h (R45) reversed that, so all
 * three read the brief first, as the spec gives it. A reworker passes its writer's call, so it
 * reads what its writer reads. The judges read the world, the limits and the part
 * about this session alone: they write no notes on the writing, so they read neither the
 * brief nor a writer's part (the story meeting's fact check, brief 4.4; the article judge,
 * brief 4.7a).
 *
 * The calls are one list (brief 4.13b): lib/theme-config.js derives its identity calls from
 * RULE_SET_CALLS, each call and each writer's rework (a judge's call opens `judge-`), so a
 * call added here needs its identity line in each theme's config.
 */
const RULE_SET_CALLS = Object.freeze({
  arc: ['brief', 'job-weave'],
  outline: ['brief', 'job-map'],
  article: ['brief', 'job-article'],
  'judge-arc': [],
  'judge-article': []
});

/** The two parts about where Nova was, by reporting mode. */
const MODE_FILES = Object.freeze({ 'on-site': 'mode-on-site', remote: 'mode-remote' });
/** The tag the part about this session reaches every prompt in, whichever file it came from. */
const MODE_TAG = 'this-session';

/** The folder a test has every call read in place of its theme's (setDefaultRulesRoot), or null. */
let standInRoot = null;
const cache = new Map();

/**
 * Point every later call that passes no root at another folder, in place of the folder its
 * theme names. For tests: the pinned renders read one-line stubs
 * (lib/__tests__/fixtures/rules/), so a change to the rule text does not move their
 * hashes. The theme must still name a rules folder: the stand-in changes where a theme's
 * rules are read, never whether it has any. Jest gives each test file its own module
 * registry, so the setting never leaks into another file.
 *
 * @param {string|null} root - a folder holding the rule files; null reads each theme's own again
 * @returns {string|null} the stand-in that was in force before, or null
 */
function setDefaultRulesRoot(root) {
  const previous = standInRoot;
  standInRoot = root ? path.resolve(root) : null;
  return previous;
}

/**
 * The folder a theme's rules are read from: the one its config names, resolved against
 * the reports folder.
 *
 * @param {string} theme - the theme the caller holds
 * @returns {string} an absolute path
 * @throws {Error} without a theme, for a theme the config does not know, and for a theme
 *   whose config names no rules folder (the parked detective, R1), naming the theme
 */
function rulesFolderOf(theme) {
  // The theme configs, required here rather than at the top: lib/theme-config.js requires
  // this module, deriving its identity calls from RULE_SET_CALLS (brief 4.13b).
  const { THEME_CONFIGS } = require('./theme-config');
  if (typeof theme !== 'string' || !theme) {
    throw new Error(
      '[rule-set] The theme is required: each call reads the rules folder its theme names ' +
      '(lib/theme-config.js), and a call with none would read another theme\'s rules.'
    );
  }
  if (!Object.prototype.hasOwnProperty.call(THEME_CONFIGS, theme)) {
    throw new Error(`[rule-set] Unknown theme "${theme}": no config in lib/theme-config.js names its rules folder.`);
  }
  const rules = THEME_CONFIGS[theme].rules;
  if (typeof rules !== 'string' || !rules.trim()) {
    throw new Error(
      `[rule-set] The theme "${theme}" names no rules folder: its config (lib/theme-config.js) gives no ` +
      '`rules`, so its writers and judges have no rules to read.'
    );
  }
  return path.resolve(REPORTS_ROOT, rules);
}

/**
 * The folder one call reads: `root` when the call passes one (tests); otherwise the
 * folder its theme names, or the stand-in a test set in its place.
 *
 * @param {string} theme
 * @param {string} [root]
 * @returns {string}
 * @throws {Error} as rulesFolderOf does, and naming the folder when it does not exist
 */
function folderFor(theme, root) {
  if (root) return path.resolve(root);
  const folder = rulesFolderOf(theme);
  if (standInRoot) return standInRoot;
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
    throw new Error(
      `[rule-set] The theme "${theme}" has no rules folder at ${folder}, the folder its config ` +
      '(lib/theme-config.js) names. A call built without it would run without the rules every ' +
      'writer and judge must read.'
    );
  }
  return folder;
}

/**
 * Read the named files under `root`, failing loud on any that is missing or empty.
 *
 * @param {string[]} names - file names without `.md`
 * @param {string} root
 * @param {string} what - who asked, for the error
 * @returns {Object<string, string>} name -> trimmed text
 */
function readRuleFiles(names, root, what) {
  const texts = {};
  const broken = [];
  for (const name of names) {
    const file = path.join(root, `${name}.md`);
    if (!cache.has(file)) {
      let text = '';
      try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      if (text.trim()) cache.set(file, text.trim());
    }
    if (cache.has(file)) texts[name] = cache.get(file);
    else broken.push(`${name}.md`);
  }
  if (broken.length > 0) {
    throw new Error(
      `[rule-set] Missing or empty rule file${broken.length > 1 ? 's' : ''} for ${what}: ` +
      `${broken.join(', ')} (in ${root}). A call built without them would run without the rules ` +
      'every writer and judge must read.'
    );
  }
  return texts;
}

/** One file's text, wrapped in one tag: the file's name, or the name a block goes by. */
function tagged(name, text) {
  return `<${name}>\n${text}\n</${name}>`;
}

/**
 * The rule set for one call, from the rules folder of the theme the caller holds.
 *
 * @param {'arc'|'outline'|'article'|'judge-arc'|'judge-article'} call
 * @param {Object} options
 * @param {string} [options.theme] - the caller's theme, whose rules folder is read
 * @param {string} [options.root] - a folder to read instead (tests); the theme is not read then
 * @returns {{core: string, craft: string}} `core`: <world> then <limits>; `craft`: the
 *   call's own files in RULE_SET_CALLS order, for a writer <brief> and its <job-...>, and
 *   for a judge nothing. Each file is in its own tag named after it; the caller inserts both
 *   strings unchanged. (The key `craft` keeps the name its callers read.)
 * @throws {Error} on an unknown call; without a theme or a root; for a theme with no rules
 *   folder, naming the theme or the folder; or naming every missing or empty file
 */
function loadRuleSet(call, { theme, root } = {}) {
  const callFiles = RULE_SET_CALLS[call];
  if (!callFiles) {
    throw new Error(
      `[rule-set] Unknown call "${call}". Calls: ${Object.keys(RULE_SET_CALLS).join(', ')}.`
    );
  }
  const folder = folderFor(theme, root);
  const texts = readRuleFiles([...CORE_FILES, ...callFiles], folder, `call "${call}"`);
  return {
    core: CORE_FILES.map((name) => tagged(name, texts[name])).join('\n\n'),
    craft: callFiles.map((name) => tagged(name, texts[name])).join('\n\n')
  };
}

/**
 * The part about this session for one mode: where Nova was, from one of the two mode files.
 * It goes in a system prompt right after the identity line (buildReportingModeBlock in
 * lib/prompt-builder.js), with the prompt's own text after it.
 *
 * Wrapped in one tag, `<this-session>`, whichever file it came from (phase 18, R2): the
 * world and the limits point at "the part about this session", so the name is one the
 * reader can find. The caller inserts it unchanged, and the closing tag ends the block, so
 * the text that follows it in the prompt is not read as part of it.
 *
 * @param {'on-site'|'remote'} mode
 * @param {Object} options
 * @param {string} [options.theme] - the caller's theme, whose rules folder holds the mode files
 * @param {string} [options.root] - a folder to read instead (tests); the theme is not read then
 * @returns {string}
 * @throws {Error} on an unknown mode; without a theme or a root; for a theme with no rules
 *   folder, naming the theme or the folder; or on a missing or empty mode file
 */
function loadModeBlock(mode, { theme, root } = {}) {
  const name = MODE_FILES[mode];
  if (!name) {
    throw new Error(`[rule-set] Unknown reporting mode "${mode}". Modes: ${Object.keys(MODE_FILES).join(', ')}.`);
  }
  const folder = folderFor(theme, root);
  return tagged(MODE_TAG, readRuleFiles([name], folder, `the ${mode} mode block`)[name]);
}

module.exports = {
  loadRuleSet,
  loadModeBlock,
  setDefaultRulesRoot,
  rulesFolderOf,
  RULE_SET_CALLS
};
