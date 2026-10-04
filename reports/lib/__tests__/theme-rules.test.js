/**
 * 4.13: a theme's own rules (phase 4; the integrator's ruling R14, and the plan's global
 * constraint "Themes").
 *
 * A future theme is new files rather than new code. Everything a theme decides for the new
 * stages lives in its own files: its rules folder (the world, the truth rules, the craft
 * files and the two mode files), which its config names, and its identity lines, which its
 * config holds (lib/theme-config.js). Code reads both through the theme it holds.
 *
 * Three parts, the brief's three tests:
 * - a planted second theme, with its own rules folder, mode files and identity lines: each
 *   writer's, rework's and judge's prompt of the new stages opens with its identity and
 *   reads its rules;
 * - a theme with no rules folder throws, naming it;
 * - no identity line sits in code (a source scan of the files that held them).
 *
 * Real files on disk and no model call: every prompt here is built by its own builder.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const { THEME_CONFIGS } = require('../theme-config');
const { loadRuleSet, loadModeBlock, RULE_SET_CALLS } = require('../rule-set');
const { PromptBuilder } = require('../prompt-builder');
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const {
  _testing: {
    weaveSystemPrompt, buildWeavePrompt, getArcRevisionSystemPrompt, buildArcRevisionPrompt
  }
} = require('../workflow/nodes/arc-specialist-nodes');
const {
  _testing: {
    buildOutlineRevisionSystemPrompt, buildOutlineRevisionPrompt,
    buildArticleRevisionSystemPrompt, buildArticleRevisionPrompt
  }
} = require('../workflow/nodes/ai-nodes');
const {
  _testing: { buildEvaluationSystemPrompt, getPhaseCriteria }
} = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState, WEAVE, MAP } = require('./fixtures/rework-state');

const REPO = path.join(__dirname, '..', '..');
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** Every file a rules folder holds: the core, the eight craft files and the two mode files. */
const RULE_FILES = [
  'world', 'truth-rules',
  'craft-story', 'craft-form', 'craft-material', 'craft-voice',
  'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions',
  'mode-on-site', 'mode-remote'
];

const PLANTED = 'planted';

/** The planted theme's identity lines, one per call of the new stages. */
const PLANTED_IDENTITIES = {
  arc: 'You are the planted theme\'s weave writer.',
  'arc-rework': 'You are the planted theme\'s weave rework',
  outline: 'You are the planted theme\'s map writer.',
  'outline-rework': 'You are the planted theme\'s map rework',
  article: 'You are the planted theme\'s article writer.',
  'article-rework': 'You are the planted theme\'s article rework',
  'judge-arc': 'You are the planted theme\'s weave judge.',
  'judge-article': 'You are the planted theme\'s article judge.'
};

/** A rules folder whose every file is one line naming it, in a temporary folder. */
function plantRulesFolder(prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  for (const name of RULE_FILES) fs.writeFileSync(path.join(dir, `${name}.md`), `PLANTED ${name}\n`);
  return dir;
}

/** A theme config with the planted identities and slots of its own, reading `rules`. */
function plantedConfig(rules) {
  return {
    npcs: [],
    rules,
    identities: { ...PLANTED_IDENTITIES },
    map: {
      slots: [
        { key: 'opening', label: 'Opening', heading: '' },
        { key: 'body', label: 'Body', heading: 'The Body' }
      ]
    },
    display: { articleIdPrefix: 'PLT', printsHero: false, postGenValidation: { minInlineEvidenceCards: 0 } }
  };
}

/** The planted folder's text, as the loader wraps each file. */
const tagged = (name) => `<${name}>\nPLANTED ${name}\n</${name}>`;
const PLANTED_CORE = `${tagged('world')}\n\n${tagged('truth-rules')}`;
const PLANTED_MODE = tagged('mode-remote');
const plantedCraft = (call) => RULE_SET_CALLS[call].map(tagged).join('\n\n');

/** A theme loader that no writer of the new stages may ask for a file. */
const refusingLoader = () => ({
  loadPhasePrompts: async (phase) => { throw new Error(`a writer asked the theme loader for ${phase}`); },
  validate: async () => ({ valid: true, missing: [] })
});

describe('4.13: a planted second theme reads its own rules and identity lines', () => {
  let rulesRoot;
  let state;
  let builder;
  const SETTLED_WEAVE = renderSettledWeave(WEAVE, null);

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    rulesRoot = plantRulesFolder('planted-rules-');
    THEME_CONFIGS[PLANTED] = plantedConfig(rulesRoot);
    // The fixture's session is remote: every system prompt carries the remote mode block.
    state = { ...reworkFixtureState(), theme: PLANTED };
    builder = new PromptBuilder(
      refusingLoader(), PLANTED, state.sessionConfig, state.canonicalCharacters, state.characterData.characters
    );
  });

  afterAll(() => {
    delete THEME_CONFIGS[PLANTED];
    fs.rmSync(rulesRoot, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  /**
   * A system prompt of the planted theme: its identity line for the call, its remote mode
   * block right after it, then its world and truth rules, each once, and nothing of another
   * theme's core.
   */
  function expectPlantedSystem(system, identity) {
    expect(system.startsWith(`${identity}\n\n${PLANTED_MODE}\n\n${PLANTED_CORE}`)).toBe(true);
    expect(count(system, '<world>')).toBe(1);
    expect(count(system, '<truth-rules>')).toBe(1);
    expect(count(system, '<mode-on-site>') + count(system, '<mode-remote>')).toBe(1);
  }

  /**
   * A user prompt of the planted theme: the call's craft files from its folder, once each.
   * A file's tag opens a line of its own; a task names the tag in prose ("C1 (<craft-story>)").
   */
  function expectPlantedCraft(user, call) {
    expect(count(user, plantedCraft(call))).toBe(1);
    const opened = (name) => user.split('\n').filter((line) => line === `<${name}>`).length;
    for (const name of RULE_SET_CALLS[call]) expect(`${name}: ${opened(name)}`).toBe(`${name}: 1`);
  }

  describe('the writers', () => {
    it('the weave writer opens with the theme\'s identity and reads its rules', () => {
      expectPlantedSystem(weaveSystemPrompt(state.sessionConfig, PLANTED), PLANTED_IDENTITIES.arc);
      expectPlantedCraft(buildWeavePrompt(state), 'arc');
    });

    it('the map writer opens with the theme\'s identity and reads its rules', async () => {
      const { systemPrompt, userPrompt } = await builder.buildOutlinePrompt(SETTLED_WEAVE, [], [], null, {});
      expect(systemPrompt).toBe(`${PLANTED_IDENTITIES.outline}\n\n${PLANTED_MODE}\n\n${PLANTED_CORE}`);
      expectPlantedCraft(userPrompt, 'outline');
    });

    it('the article writer opens with the theme\'s identity and reads its rules', async () => {
      const { systemPrompt, userPrompt } = await builder.buildArticlePrompt(SETTLED_WEAVE, MAP, [], null, null, null, {});
      expectPlantedSystem(systemPrompt, PLANTED_IDENTITIES.article);
      expectPlantedCraft(userPrompt, 'article');
    });
  });

  describe('the reworks', () => {
    it.each(['send-back', 'reweave', null])('the weave rework (%s) is its writer\'s prompt, then the theme\'s rework identity', (round) => {
      const writer = weaveSystemPrompt(state.sessionConfig, PLANTED);
      const system = getArcRevisionSystemPrompt(round, state.sessionConfig, PLANTED);
      expectPlantedSystem(system, PLANTED_IDENTITIES.arc);
      expect(system.startsWith(`${writer}\n\n${PLANTED_IDENTITIES['arc-rework']}`)).toBe(true);
      expectPlantedCraft(buildArcRevisionPrompt(state, 'CONTEXT', 'PREVIOUS'), 'arc');
    });

    it('the map rework is its writer\'s prompt, then the theme\'s rework identity, and reads its writer\'s rules', async () => {
      const writer = await builder.buildOutlineSystemPrompt();
      const system = await buildOutlineRevisionSystemPrompt(builder);
      expect(system.startsWith(`${writer}\n\n${PLANTED_IDENTITIES['outline-rework']}`)).toBe(true);
      expectPlantedSystem(system, PLANTED_IDENTITIES.outline);
      expectPlantedCraft(await buildOutlineRevisionPrompt(state, 'CONTEXT', 'PREVIOUS', builder), 'outline');
    });

    it('the article rework is its writer\'s prompt, then the theme\'s rework identity, and reads its writer\'s rules', async () => {
      const writer = await builder.buildArticleSystemPrompt();
      const system = await buildArticleRevisionSystemPrompt(builder);
      expect(system.startsWith(`${writer}\n\n${PLANTED_IDENTITIES['article-rework']}`)).toBe(true);
      expectPlantedSystem(system, PLANTED_IDENTITIES.article);
      expectPlantedCraft(await buildArticleRevisionPrompt(state, 'CONTEXT', 'PREVIOUS', builder), 'article');
    });
  });

  describe('the judges', () => {
    it.each([['arcs', 'judge-arc'], ['article', 'judge-article']])('the %s judge opens with the theme\'s identity and reads its core and mode block, no craft', (phase, call) => {
      const system = buildEvaluationSystemPrompt(phase, getPhaseCriteria(phase, PLANTED), PLANTED, { sessionConfig: state.sessionConfig });
      expectPlantedSystem(system, PLANTED_IDENTITIES[call]);
      expect(system).not.toMatch(/<craft-[a-z]+>/);
    });
  });

  it('the planted folder is the one read: the loaders hand back its files for the theme', () => {
    for (const call of Object.keys(RULE_SET_CALLS)) {
      expect(loadRuleSet(call, { theme: PLANTED })).toEqual({ core: PLANTED_CORE, craft: plantedCraft(call) });
    }
    expect(loadModeBlock('on-site', { theme: PLANTED })).toBe(tagged('mode-on-site'));
    expect(loadModeBlock('remote', { theme: PLANTED })).toBe(PLANTED_MODE);
  });
});

describe('4.13: a theme with no rules folder throws, naming it', () => {
  const ROOMLESS = 'roomless';
  const HOLED = 'holed';
  let missingRoot;
  let holedRoot;

  beforeAll(() => {
    // A folder the config names that does not exist.
    missingRoot = path.join(os.tmpdir(), `no-such-rules-${process.pid}-${Date.now()}`);
    THEME_CONFIGS[ROOMLESS] = plantedConfig(missingRoot);
    // A folder that exists, with one file a call reads gone.
    holedRoot = plantRulesFolder('holed-rules-');
    fs.unlinkSync(path.join(holedRoot, 'craft-story.md'));
    THEME_CONFIGS[HOLED] = plantedConfig(holedRoot);
  });

  afterAll(() => {
    delete THEME_CONFIGS[ROOMLESS];
    delete THEME_CONFIGS[HOLED];
    fs.rmSync(holedRoot, { recursive: true, force: true });
  });

  it('a theme whose rules folder does not exist: every loader throws naming the theme and the folder', () => {
    const named = new RegExp(`roomless[\\s\\S]*${path.basename(missingRoot)}`);
    expect(() => loadRuleSet('arc', { theme: ROOMLESS })).toThrow(named);
    expect(() => loadModeBlock('remote', { theme: ROOMLESS })).toThrow(named);
    // and so does the first prompt that reads it
    expect(() => weaveSystemPrompt({ reportingMode: 'remote' }, ROOMLESS)).toThrow(named);
  });

  it('a theme whose config names no rules folder (the parked detective, R1): throws naming the theme', () => {
    expect(() => loadRuleSet('arc', { theme: 'detective' })).toThrow(/"detective" names no rules folder/);
    expect(() => loadModeBlock('on-site', { theme: 'detective' })).toThrow(/"detective" names no rules folder/);
  });

  it('a theme the config does not know, and a call with no theme: each throws, naming what is missing', () => {
    expect(() => loadRuleSet('arc', { theme: 'noir' })).toThrow(/"noir"/);
    expect(() => loadRuleSet('arc')).toThrow(/theme is required/);
    expect(() => loadModeBlock('remote')).toThrow(/theme is required/);
  });

  it('a missing file in the theme\'s folder throws naming the file, for the calls that read it', () => {
    expect(() => loadRuleSet('arc', { theme: HOLED })).toThrow(/craft-story\.md/);
    expect(() => loadRuleSet('judge-arc', { theme: HOLED })).not.toThrow();
  });
});

/**
 * The parked detective (R1) keeps its config as it is, with no rules folder and no identity
 * line, so it has no prompt of the new stages: every call for it fails loud, naming what it
 * lacks, and no judge's node pays for a model call. Its judges' prompts, which the
 * journalist's rules and lines used to stand in for, are gone with that.
 */
describe('4.13: the parked detective has no prompt of the new stages (R1)', () => {
  const { evaluateArcs, evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
  const { REVISION_CAPS, PHASES } = require('../workflow/state');
  const { loadCallModules, renderJudge } = require('../../scripts/lib/render-calls');
  const { PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
  const VERDICT = { ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' };
  /** Each judge's node, and the state that keeps it from skipping its model call (scripts/lib/render-calls.js's test). */
  const JUDGES = {
    arcs: [evaluateArcs, { meetingApproved: false }],
    article: [evaluateArticle, { articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE }]
  };
  const detectiveState = (phase) => ({
    ...reworkFixtureState('detective'), contentBundle: JSON.parse(JSON.stringify(PREVIOUS_BUNDLE)), evaluationHistory: [], ...JUDGES[phase][1]
  });

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  it('each writer, rework and judge throws, naming the theme', async () => {
    const builder = new PromptBuilder(refusingLoader(), 'detective', {}, null, null);
    expect(() => weaveSystemPrompt({}, 'detective')).toThrow(/"detective" has no identity line for the call "arc"/);
    expect(() => getArcRevisionSystemPrompt('send-back', {}, 'detective')).toThrow(/"detective"/);
    // The map and the article refuse it first for its missing story map (lib/map.js).
    await expect(builder.buildOutlineSystemPrompt()).rejects.toThrow(/The "detective" theme has no story map/);
    await expect(builder.buildArticleSystemPrompt()).rejects.toThrow(/The "detective" theme has no story map/);
    await expect(builder.requirePhasePrompts('outlineGeneration')).rejects.toThrow(/"detective" names no rules folder/);
    for (const phase of ['arcs', 'article']) {
      expect(() => buildEvaluationSystemPrompt(phase, getPhaseCriteria(phase, 'detective'), 'detective', { sessionConfig: {} }))
        .toThrow(/"detective" names no rules folder/);
    }
  });

  it.each(['arcs', 'article'])('the %s judge\'s node calls no model, and records why', async (phase) => {
    const sdk = jest.fn(async () => VERDICT);
    const result = await JUDGES[phase][0](detectiveState(phase), { configurable: { sdkClient: sdk, theme: 'detective' } });
    expect(sdk).not.toHaveBeenCalled();
    expect(result.evaluationHistory._error).toMatch(/"detective" names no rules folder/);
    expect(result.currentPhase).toBe(PHASES.ERROR);
  });

  it.each(['arcs', 'article'])('the render script renders no %s judge for it, as the node sends none', async (phase) => {
    const calls = loadCallModules((p) => require(path.join(REPO, p)));
    await expect(renderJudge(calls, detectiveState(phase), phase)).rejects.toThrow(/"detective" names no rules folder/);
  });
});

describe('4.13: no identity line sits in code', () => {
  /** The files that held the new stages' identity lines before 4.13. */
  const FILES = [
    'lib/sdk-client/subagents.js',
    'lib/workflow/nodes/arc-specialist-nodes.js',
    'lib/prompt-builder.js',
    'lib/workflow/nodes/ai-nodes.js',
    'lib/workflow/nodes/evaluator-nodes.js'
  ];

  // Every identity line opens "You are" (the narrator, the publication and the form of
  // output are the theme's to name). A string in one of these files that opens so is an
  // identity line back in code.
  it.each(FILES)('%s holds no string that opens an identity line', (file) => {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8');
    const identityLines = source.split('\n').filter((line) => /['"`]You are\b/.test(line));
    expect(identityLines).toEqual([]);
  });

  it.each(FILES)('%s names neither the journalist\'s narrator nor its publication in an identity line', (file) => {
    const source = fs.readFileSync(path.join(REPO, file), 'utf8');
    expect(source).not.toMatch(/You are Nova\b/);
    expect(source).not.toMatch(/You are [^'"`\n]*NovaNews/);
  });
});
