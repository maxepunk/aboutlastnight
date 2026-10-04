/**
 * The rule set: one loader for the model-facing rules every journalist writer and
 * judge reads (phase 3, task 3.1; spec docs/superpowers/specs/2026-09-30-rule-set.md).
 *
 * The rules live as Markdown files in the journalist skill,
 * `.claude/skills/journalist-report/references/rules/`:
 * - `world.md`: the purpose of the article, the world (spec section 2) and how a
 *   memory moves through the game (3a);
 * - `truth-rules.md`: T1 to T15, with T8's mode-independent part;
 * - eight `craft-*.md` files, the craft items C1 to C19 grouped by the writer's job
 *   (spec section 5; task 3.8): story (C1, C3, C16), form (C2, C5, C6, C17, C18,
 *   C19, C14), material (C8, C7, C10, C11), voice (C12), judgement (C13), telling
 *   (C4), cards (C9) and questions (C15). Each call reads the files RULE_SET_CALLS gives
 *   it: the phase 4 spec's section 11, who reads what
 *   (docs/superpowers/specs/2026-10-02-story-meeting-and-map.md), which was the rule-set
 *   spec's section 8;
 * - `mode-on-site.md` and `mode-remote.md`: T8's mode part, the reporting-mode block,
 *   which loadModeBlock hands back in its tag as loadRuleSet does each file.
 *
 * Synchronous on purpose: it reads with readFileSync and caches, so every prompt
 * builder that calls it stays synchronous. The cache lives for the process: a
 * changed rule file reaches the prompts on the next server start.
 *
 * Journalist only. Since phase 4 the detective is parked at start (R1), so the arc
 * stage's calls read this folder for every session; the outline and article callers
 * still branch on the theme before calling here. A theme's own rules folder, read
 * through the theme, is the phase 4 integrator's ruling R14.
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
 * Each call's craft files, every list in one order: story, form, material, voice,
 * judgement, telling, cards, questions. The arc writer writes the weave and reads the
 * story, form, material, judgement and questions files; the map writer lays it across the
 * sections and reads all but the voice and the questions; the article writer reads all
 * eight. A reworker passes its writer's call.
 *
 * Phase 4: the lists follow the phase 4 spec's section 11 (who reads what; it was the
 * rule-set spec's section 8). The interweaving call is gone, and the judges read the
 * world, the truth rules and the mode block alone: they write no notes on the writing, so
 * they read no craft file (the story meeting's fact check, brief 4.4; the article judge,
 * brief 4.7a). The map writer asks nothing, so it reads no craft-questions, and the
 * outline judge went with the map (brief 4.6).
 */
const ARC_CRAFT = ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions'];
const OUTLINE_CRAFT = [
  'craft-story', 'craft-form', 'craft-material', 'craft-judgement',
  'craft-telling', 'craft-cards'
];
const ARTICLE_CRAFT = [
  'craft-story', 'craft-form', 'craft-material', 'craft-voice',
  'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions'
];

const RULE_SET_CALLS = Object.freeze({
  arc: ARC_CRAFT,
  outline: OUTLINE_CRAFT,
  article: ARTICLE_CRAFT,
  'judge-arc': [],
  'judge-article': []
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
 * @param {'arc'|'outline'|'article'|'judge-arc'|'judge-article'} call
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
 * The reporting-mode block for one mode: T8's mode part. It goes in a system prompt
 * right after the identity line (buildReportingModeBlock in lib/prompt-builder.js),
 * with the prompt's own text after it.
 *
 * Wrapped in one tag named after its file (`<mode-remote>`), as loadRuleSet wraps each
 * file, and the caller inserts it unchanged. The file opens with its "## T8" heading
 * (the lint counts the id there); the closing tag ends the block, so the text that
 * follows it in the prompt is not read as part of T8.
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
  return tagged(name, readRuleFiles([name], folder, `the ${mode} mode block`)[name]);
}

module.exports = {
  loadRuleSet,
  loadModeBlock,
  setDefaultRulesRoot,
  DEFAULT_RULES_ROOT,
  RULE_SET_CALLS
};
