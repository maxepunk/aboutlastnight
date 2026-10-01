/**
 * The rule set: one loader for the model-facing rules every journalist writer and
 * judge reads (phase 3, task 3.1; spec docs/superpowers/specs/2026-09-30-rule-set.md).
 *
 * The rules live as Markdown files in the journalist skill,
 * `.claude/skills/journalist-report/references/rules/`:
 * - `world.md`: the purpose of the article, the world (spec section 2) and how a
 *   memory moves through the game (3a);
 * - `truth-rules.md`: T1 to T15, with T8's mode-independent part;
 * - ten `craft-*.md` files, split so each call reads exactly the craft items spec
 *   section 8 gives it (RULE_SET_CALLS);
 * - `mode-on-site.md` and `mode-remote.md`: T8's mode part, the reporting-mode block.
 *
 * Synchronous on purpose: it reads with readFileSync and caches, so every prompt
 * builder that calls it stays synchronous. The cache lives for the process: a
 * changed rule file reaches the prompts on the next server start.
 *
 * Journalist only. A detective caller keeps its own text (spec D13), and branches on
 * the theme before calling here.
 */

const fs = require('fs');
const path = require('path');

/** The journalist skill's rules folder, where every call reads unless told otherwise. */
const DEFAULT_RULES_ROOT = path.resolve(
  __dirname, '..', '.claude', 'skills', 'journalist-report', 'references', 'rules'
);

/** Every writer and judge reads these first: the world, then the truth rules. */
const CORE_FILES = ['world', 'truth-rules'];

/**
 * Each call's craft files, in the order they are given (spec section 8). A reworker
 * passes its writer's call; a judge reads its writer's list.
 */
const ARC_CRAFT = ['craft-thesis', 'craft-arcs', 'craft-room', 'craft-tracing', 'craft-judgement', 'craft-questions'];
const INTERWEAVING_CRAFT = ['craft-thesis', 'craft-arcs', 'craft-room', 'craft-tracing', 'craft-judgement'];
const OUTLINE_CRAFT = [
  'craft-thesis', 'craft-sections', 'craft-arcs', 'craft-room', 'craft-tracing',
  'craft-telling', 'craft-cards', 'craft-judgement', 'craft-questions'
];
const ARTICLE_CRAFT = [
  'craft-thesis', 'craft-sections', 'craft-arcs', 'craft-room', 'craft-tracing',
  'craft-telling', 'craft-cards', 'craft-voice', 'craft-judgement', 'craft-questions'
];

const RULE_SET_CALLS = Object.freeze({
  arc: ARC_CRAFT,
  interweaving: INTERWEAVING_CRAFT,
  outline: OUTLINE_CRAFT,
  article: ARTICLE_CRAFT,
  'judge-arc': ARC_CRAFT,
  'judge-outline': OUTLINE_CRAFT,
  'judge-article': ARTICLE_CRAFT
});

const MODE_FILES = Object.freeze({ 'on-site': 'mode-on-site', remote: 'mode-remote' });

let defaultRoot = DEFAULT_RULES_ROOT;
const cache = new Map();

/**
 * Point every later call that passes no root at another folder. For tests: the
 * pinned renders read one-line stubs (lib/__tests__/fixtures/rules/), so a change
 * to the rule text does not move their hashes. Jest gives each test file its own
 * module registry, so the setting never leaks into another file.
 *
 * @param {string|null} root - a folder holding the rule files; null restores the skill's
 * @returns {string} the root that was in force before
 */
function setDefaultRulesRoot(root) {
  const previous = defaultRoot;
  defaultRoot = root ? path.resolve(root) : DEFAULT_RULES_ROOT;
  return previous;
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

/** One file, wrapped in one tag named after it. */
function tagged(name, text) {
  return `<${name}>\n${text}\n</${name}>`;
}

/**
 * The rule set for one call.
 *
 * @param {'arc'|'interweaving'|'outline'|'article'|'judge-arc'|'judge-outline'|'judge-article'} call
 * @param {Object} [options]
 * @param {string} [options.root] - the folder to read; the default root otherwise
 * @returns {{core: string, craft: string}} `core`: <world> then <truth-rules>; `craft`:
 *   the call's craft files in RULE_SET_CALLS order. Each file is in its own tag; the
 *   caller inserts both strings unchanged.
 * @throws {Error} on an unknown call, or naming every missing or empty file
 */
function loadRuleSet(call, { root } = {}) {
  const craftFiles = RULE_SET_CALLS[call];
  if (!craftFiles) {
    throw new Error(
      `[rule-set] Unknown call "${call}". Calls: ${Object.keys(RULE_SET_CALLS).join(', ')}.`
    );
  }
  const folder = root ? path.resolve(root) : defaultRoot;
  const texts = readRuleFiles([...CORE_FILES, ...craftFiles], folder, `call "${call}"`);
  return {
    core: CORE_FILES.map((name) => tagged(name, texts[name])).join('\n\n'),
    craft: craftFiles.map((name) => tagged(name, texts[name])).join('\n\n')
  };
}

/**
 * The reporting-mode block for one mode: T8's mode part, untagged. It goes in a
 * system prompt right after the identity line (buildReportingModeBlock in
 * lib/prompt-builder.js).
 *
 * @param {'on-site'|'remote'} mode
 * @param {Object} [options]
 * @param {string} [options.root] - the folder to read; the default root otherwise
 * @returns {string}
 * @throws {Error} on an unknown mode, or a missing or empty mode file
 */
function loadModeBlock(mode, { root } = {}) {
  const name = MODE_FILES[mode];
  if (!name) {
    throw new Error(`[rule-set] Unknown reporting mode "${mode}". Modes: ${Object.keys(MODE_FILES).join(', ')}.`);
  }
  const folder = root ? path.resolve(root) : defaultRoot;
  return readRuleFiles([name], folder, `the ${mode} mode block`)[name];
}

module.exports = {
  loadRuleSet,
  loadModeBlock,
  setDefaultRulesRoot,
  DEFAULT_RULES_ROOT,
  RULE_SET_CALLS
};
