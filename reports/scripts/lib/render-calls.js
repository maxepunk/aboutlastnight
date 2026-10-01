'use strict';
/**
 * The interweaving call's and the three judges' prompts, built from a thread's state
 * as their nodes build them, with no model call (brief 3.0, fix round 1).
 *
 * render-prompts.js writes interweaving.txt and judge-*.txt through these functions.
 * The nodes keep their argument lists inline (analyzeArcsPlayerFocusGuided calling
 * enrichWithInterweaving; createEvaluator's criteria and fact check), so this module
 * repeats them. __tests__/unit/scripts/render-calls.test.js runs each node with a
 * recording stand-in for the model and fails when the node sends anything other than
 * these renders: a change to what a node passes its builders lands here in the same
 * commit.
 *
 * `req` resolves a repo-relative module path, so the renders come from whichever
 * tree render-prompts.js was pointed at (--repo).
 */

/** The judges' phases, in the order render-prompts.js writes their files. */
const JUDGE_PHASES = ['arcs', 'outline', 'article'];

/** Throw, naming the module and the export, when a tree lacks a builder a render goes through. */
function requireExports(where, mod, names) {
  const missing = names.filter((n) => !mod || mod[n] === undefined);
  if (missing.length > 0) throw new Error(`${where} does not export ${missing.join(', ')}: this tree cannot render every call`);
}

/**
 * The builders these renders go through, from the tree `req` reads.
 * @param {Function} req - (repoRelativePath) => module
 */
function loadCallModules(req) {
  const { _testing: arcNodes } = req('lib/workflow/nodes/arc-specialist-nodes.js');
  const { _testing: evalNodes } = req('lib/workflow/nodes/evaluator-nodes.js');
  const { factCheckContentBundle } = req('lib/content-bundle-fact-check.js');
  const { getThemeNPCPronouns } = req('lib/theme-config.js');
  requireExports('arc-specialist-nodes.js _testing', arcNodes, ['interweavingSystemPrompt', 'buildInterweavingPrompt']);
  requireExports('evaluator-nodes.js _testing', evalNodes, ['buildEvaluationSystemPrompt', 'buildEvaluationUserPrompt',
    'getOutlineCriteria', 'getArticleCriteria', 'QUALITY_CRITERIA']);
  requireExports('content-bundle-fact-check.js', { factCheckContentBundle }, ['factCheckContentBundle']);
  requireExports('theme-config.js', { getThemeNPCPronouns }, ['getThemeNPCPronouns']);
  return { arcNodes, evalNodes, factCheckContentBundle, getThemeNPCPronouns };
}

/**
 * The interweaving call (call 2 of the arc analysis), as analyzeArcsPlayerFocusGuided
 * calls enrichWithInterweaving. The stored arcs stand in for call 1's: the call reads
 * only their id, title, summary, source and placements.
 * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
 */
async function renderInterweaving({ arcNodes }, state) {
  const roster = state.sessionConfig?.roster || [];
  return {
    systemPrompt: await arcNodes.interweavingSystemPrompt(state.sessionConfig, state.theme || 'journalist'),
    userPrompt: await arcNodes.buildInterweavingPrompt(state.narrativeArcs || [], roster, state.evidenceBundle)
  };
}

/**
 * One judge, as createEvaluator's evaluatePhase builds it, without its skip logic:
 * the phase's criteria for the state's theme and, for the article, the fact check run
 * on the stored bundle with the evaluator's arguments (none when there is no bundle).
 * @param {string} phase - one of JUDGE_PHASES
 * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
 */
async function renderJudge({ evalNodes, factCheckContentBundle, getThemeNPCPronouns }, state, phase) {
  const theme = state.theme || 'journalist';
  const criteria = phase === 'article' ? evalNodes.getArticleCriteria(theme)
    : phase === 'outline' ? evalNodes.getOutlineCriteria(theme)
      : evalNodes.QUALITY_CRITERIA[phase];
  const factCheck = phase === 'article' && state.contentBundle
    ? await factCheckContentBundle({
      contentBundle: state.contentBundle,
      arcEvidencePackages: state.arcEvidencePackages,
      evidenceBundle: state.evidenceBundle,
      roster: state.sessionConfig?.roster,
      sessionPhotos: state.sessionPhotos,
      reportingMode: state.sessionConfig?.reportingMode,
      npcPronouns: getThemeNPCPronouns(theme),
      theme
    })
    : null;
  return {
    systemPrompt: await evalNodes.buildEvaluationSystemPrompt(phase, criteria, theme),
    userPrompt: await evalNodes.buildEvaluationUserPrompt(phase, state, { factCheck })
  };
}

module.exports = { JUDGE_PHASES, requireExports, loadCallModules, renderInterweaving, renderJudge };
