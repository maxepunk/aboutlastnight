/**
 * Render the three writers' prompts through their own nodes, with no model call and
 * no craft files (phase 2, 2.3).
 *
 * writer-prompts-pinned.test.js pins these renders by hash, so a refactor of a
 * writer's builder cannot change a byte of what the writer is sent. The craft files
 * are replaced by stubs so the pin covers the builders' assembly, not the files'
 * contents. `req` resolves a repo-relative module path, so the same renders can be
 * produced from another tree (the pin's hashes were taken from df51bc0, before the
 * writers were split into section builders).
 *
 * The rule set's files are stubs too (phase 3, task 3.1): the render points the rule
 * set's default root at fixtures/rules/, one line per file, so an edit to the rule
 * text never moves a pin. A tree without lib/rule-set.js renders without it.
 *
 * Not a test file (jest's testMatch is *.test.js).
 */

const path = require('path');
const { reworkFixtureState } = require('./rework-state');

/** One-line stand-ins for the rule set's files (lib/rule-set.js). */
const STUB_RULES_ROOT = path.join(__dirname, 'rules');

const TAIL_NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'PIN NOTE A', at: '2026-01-01T00:00:00.000Z' },
  { gate: 'outline', kind: 'approval', round: 1, text: 'PIN NOTE B', at: '2026-01-01T00:00:01.000Z' }
];

/** A theme loader whose files are one line each, named after the file. */
function stubThemeLoader(PHASE_REQUIREMENTS) {
  return {
    loadPhasePrompts: async (phase) => Object.fromEntries(
      (PHASE_REQUIREMENTS[phase] || []).map((name) => [name, `STUB ${name} for {{JOURNALIST_FIRST_NAME}} ({{REPORTING_MODE}})`])
    ),
    validate: async () => ({ valid: true, missing: [] })
  };
}

/** A model stand-in that records what it was sent and returns `value`. */
function recordingSdk(value) {
  const calls = [];
  const sdk = async (options) => { calls.push(options); return JSON.parse(JSON.stringify(value)); };
  sdk.calls = calls;
  return sdk;
}

/**
 * @param {Function} req - (repoRelativePath) => module
 * @returns {Promise<Object>} name -> "SYSTEM\n=====\nUSER" for each writer and theme
 */
async function renderWriters(req) {
  // Only a MISSING module is expected (a tree from before the rule set).
  let ruleSet = null;
  try { ruleSet = req('lib/rule-set.js'); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  const previousRoot = ruleSet ? ruleSet.setDefaultRulesRoot(STUB_RULES_ROOT) : null;
  try {
    return await renderAll(req);
  } finally {
    if (ruleSet) ruleSet.setDefaultRulesRoot(previousRoot);
  }
}

async function renderAll(req) {
  const { PromptBuilder } = req('lib/prompt-builder.js');
  const { PHASE_REQUIREMENTS } = req('lib/theme-loader.js');
  const aiNodes = req('lib/workflow/nodes/ai-nodes.js');
  const { _testing: arcNodes } = req('lib/workflow/nodes/arc-specialist-nodes.js');

  const out = {};
  for (const theme of ['journalist', 'detective']) {
    const base = reworkFixtureState(theme);
    // Phase 3 (3.2): PHASE_REQUIREMENTS is keyed by theme; a tree from before that
    // has the phases at its top level.
    const builder = new PromptBuilder(
      stubThemeLoader(PHASE_REQUIREMENTS[theme] || PHASE_REQUIREMENTS), theme, base.sessionConfig,
      base.canonicalCharacters, base.characterData.characters
    );
    const tail = { _outlineGuidance: 'PIN GUIDANCE: lead with the money.', directorGateNotes: TAIL_NOTES };

    const outlineSdk = recordingSdk({ lede: {} });
    await aiNodes.generateOutline(
      { ...base, ...tail, outline: null, validationResults: { phase: 'arcs', advisoryWarnings: ['PIN ARC ADVISORY'] } },
      { configurable: { sdkClient: outlineSdk, promptBuilder: builder, theme } }
    );
    out[`outline-${theme}`] = `${outlineSdk.calls[0].systemPrompt}\n=====\n${outlineSdk.calls[0].prompt}`;

    const articleSdk = recordingSdk({ sections: [], evidenceCards: [], metadata: {} });
    await aiNodes.generateContentBundle(
      // Phase 4 (brief 4.6): no outline evaluation's advisories reach the article writer.
      { ...base, ...tail, heroImage: 'hero.jpg', contentBundle: null },
      { configurable: { sdkClient: articleSdk, promptBuilder: builder, theme } }
    );
    out[`article-${theme}`] = `${articleSdk.calls[0].systemPrompt}\n=====\n${articleSdk.calls[0].prompt}`;

    // The arc writer, with arcRevisionCount > 0 and standing notes, so its tail is
    // pinned too. Since phase 3 (3.3) the journalist's tail is the notes alone. Phase 4
    // (brief 4.4): the arc writer writes the weave, and the arc stage is the
    // journalist's alone (R1), so the detective renders no arc writer.
    if (theme === 'journalist') {
      const arcSdk = recordingSdk(base.weave);
      await arcNodes.generateWeave(
        {
          ...base, ...tail, weave: null, arcRevisionCount: 1,
          validationResults: { phase: 'arcs', issues: ['PIN ARC ISSUE'], feedback: 'PIN ARC FEEDBACK', criteriaScores: { rosterCoverage: { score: 0.5, notes: 'Riley missing' } } }
        },
        { configurable: { sdkClient: arcSdk } }
      );
      out[`arcs-${theme}`] = `${arcSdk.calls[0].systemPrompt}\n=====\n${arcSdk.calls[0].prompt}`;
    }
  }
  return out;
}

module.exports = { renderWriters, stubThemeLoader, recordingSdk, TAIL_NOTES, STUB_RULES_ROOT };
