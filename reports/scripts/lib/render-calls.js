'use strict';
/**
 * The three judges' prompts, built from a thread's state as their nodes build them,
 * with no model call (brief 3.0, fix round 1). Phase 4 (brief 4.4): the arc stage's
 * judge is the story meeting's fact check, and the interweaving call went.
 *
 * render-prompts.js writes judge-*.txt through these functions. The nodes keep their
 * argument lists inline (createEvaluator's criteria, fact check and director's edits),
 * so this module repeats them. __tests__/unit/scripts/render-calls.test.js runs each
 * node with a recording stand-in for the model and fails when the node sends anything
 * other than these renders: a change to what a node passes its builders lands here in
 * the same commit.
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
  const { _testing: evalNodes } = req('lib/workflow/nodes/evaluator-nodes.js');
  const { factCheckContentBundle } = req('lib/content-bundle-fact-check.js');
  const { getThemeNPCPronouns } = req('lib/theme-config.js');
  requireExports('evaluator-nodes.js _testing', evalNodes, ['buildEvaluationSystemPrompt', 'buildEvaluationUserPrompt',
    'getOutlineCriteria', 'getArticleCriteria']);
  requireExports('content-bundle-fact-check.js', { factCheckContentBundle }, ['factCheckContentBundle']);
  requireExports('theme-config.js', { getThemeNPCPronouns }, ['getThemeNPCPronouns']);
  return { evalNodes, factCheckContentBundle, getThemeNPCPronouns };
}

/**
 * One judge, as createEvaluator's evaluatePhase builds it, without its skip logic:
 * the phase's criteria for the state's theme and, for the article, the fact check run
 * on the stored bundle with the evaluator's arguments (none when there is no bundle).
 *
 * Phase 4 (brief 4.4): the arcs judge is the story meeting's fact check on
 * `state.weave`, with its truth criteria (getPhaseCriteria) and no code fact check, as
 * createEvaluator calls it. Brief 4.5: after a director's round it reads the director's
 * standing edits (judgedEdits) and their answers, as the outline and article judges read
 * theirs. A tree from before getPhaseCriteria reads its arc criteria from QUALITY_CRITERIA.
 *
 * Phase 3 (3.4): a tree that exports getPhaseCriteria and buildFactCheckArgs builds
 * both through the evaluator's own functions, and its system prompt takes the session
 * config (the mode block). An older tree (a baseline render through --repo) gets the
 * argument lists its evaluator used, below.
 *
 * F1 (before phase 4): the outline and article judges' user prompts take the director's
 * edits the judged output carries, through the evaluator's own judgedEdits. An older tree
 * exports none, and its builder ignores the option.
 * @param {string} phase - one of JUDGE_PHASES
 * @returns {Promise<{systemPrompt: string, userPrompt: string}>}
 */
async function renderJudge({ evalNodes, factCheckContentBundle, getThemeNPCPronouns }, state, phase) {
  const theme = state.theme || 'journalist';
  const criteria = evalNodes.getPhaseCriteria ? evalNodes.getPhaseCriteria(phase, theme)
    : phase === 'article' ? evalNodes.getArticleCriteria(theme)
      : phase === 'outline' ? evalNodes.getOutlineCriteria(theme)
        : evalNodes.QUALITY_CRITERIA[phase];
  const factCheckArgs = evalNodes.buildFactCheckArgs ? evalNodes.buildFactCheckArgs(state) : {
    contentBundle: state.contentBundle,
    arcEvidencePackages: state.arcEvidencePackages,
    evidenceBundle: state.evidenceBundle,
    roster: state.sessionConfig?.roster,
    sessionPhotos: state.sessionPhotos,
    reportingMode: state.sessionConfig?.reportingMode,
    npcPronouns: getThemeNPCPronouns(theme),
    theme
  };
  const factCheck = phase === 'article' && state.contentBundle
    ? await factCheckContentBundle(factCheckArgs)
    : null;
  const directorEdits = evalNodes.judgedEdits ? evalNodes.judgedEdits(phase, state) : undefined;
  return {
    systemPrompt: await evalNodes.buildEvaluationSystemPrompt(phase, criteria, theme, { sessionConfig: state.sessionConfig || null }),
    userPrompt: await evalNodes.buildEvaluationUserPrompt(phase, state, { factCheck, directorEdits })
  };
}

module.exports = { JUDGE_PHASES, requireExports, loadCallModules, renderJudge };
