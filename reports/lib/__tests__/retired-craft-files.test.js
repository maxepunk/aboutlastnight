/**
 * The eight journalist craft files are retired (phase 3, task 3.2; the integrator's
 * ruling: deleted, not archived, and git keeps their history). The journalist
 * writers, reworkers and judges read the rule set (lib/rule-set.js) instead. The
 * detective is parked (spec D13) and keeps its own files and phase lists.
 *
 * Task 3.12: the standalone path's agent definitions and SKILL.md name neither the
 * eight nor the five rule files task 3.8 retired. Task 4c-fix: each agent definition
 * lists exactly the rule files its pipeline counterpart reads.
 *
 * Real files on disk: nothing here is mocked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createThemeLoader, PHASE_REQUIREMENTS, ALL_PROMPTS } = require('../theme-loader');
const { createPromptBuilder, PromptBuilder } = require('../prompt-builder');
const { setDefaultRulesRoot, rulesFolderOf, RULE_SET_CALLS } = require('../rule-set');

const REPO = path.join(__dirname, '..', '..');
const SKILLS = path.join(REPO, '.claude', 'skills');
const RETIRED = [
  'writing-principles', 'anti-patterns', 'character-voice', 'evidence-boundaries',
  'narrative-structure', 'section-rules', 'editorial-design', 'formatting'
];

/**
 * The five rule-set craft files task 3.8 retires (spec round 7), when the craft items
 * were regrouped by the writer's job (spec section 5): craft-thesis's C1 and C3 and
 * craft-arcs's C16 are in craft-story; craft-sections's C2 and craft-room's C6 in
 * craft-form; craft-room's C7 and C8 and craft-tracing's C10 and C11 in
 * craft-material. Deleted, not archived; git keeps them.
 */
const RETIRED_RULE_FILES = ['craft-thesis', 'craft-sections', 'craft-arcs', 'craft-room', 'craft-tracing'];
const STUB_RULES = path.join(__dirname, 'fixtures', 'rules');

describe('the five craft files the rule set retires (task 3.8)', () => {
  it.each(RETIRED_RULE_FILES)('%s.md is gone from the rules folder and from the stubs', (name) => {
    expect(fs.existsSync(path.join(rulesFolderOf('journalist'), `${name}.md`))).toBe(false);
    expect(fs.existsSync(path.join(STUB_RULES, `${name}.md`))).toBe(false);
  });

  it('no call, writer or judge, reads one', () => {
    for (const [call, files] of Object.entries(RULE_SET_CALLS)) {
      const retired = files.filter((name) => RETIRED_RULE_FILES.includes(name));
      expect(`${call}: ${retired.join(',')}`).toBe(`${call}: `);
    }
  });
});

describe('the retired journalist craft files', () => {
  it.each(RETIRED)('%s.md is gone from the journalist skill, and the detective keeps its own', (name) => {
    expect(fs.existsSync(path.join(SKILLS, 'journalist-report', 'references', 'prompts', `${name}.md`))).toBe(false);
    expect(fs.existsSync(path.join(SKILLS, 'detective-report', 'references', 'prompts', `${name}.md`))).toBe(true);
  });

  it('no journalist phase names one, and the journalist has no outline or article phase', () => {
    const journalist = PHASE_REQUIREMENTS.journalist;
    expect(Object.keys(journalist)).toEqual(['imageAnalysis']);
    Object.values(journalist).flat().forEach((name) => expect(RETIRED).not.toContain(name));
    expect(ALL_PROMPTS.journalist.filter((name) => RETIRED.includes(name))).toEqual([]);
  });

  it('the journalist theme loader refuses the old phases instead of reading the old files', async () => {
    const loader = createThemeLoader({ theme: 'journalist' });
    await expect(loader.loadPhasePrompts('outlineGeneration')).rejects.toThrow(/outlineGeneration/);
    await expect(loader.loadPhasePrompts('articleGeneration')).rejects.toThrow(/articleGeneration/);
  });

  it('the journalist skill and the agent definitions point at the rule files, not the retired ones', () => {
    const files = [
      path.join(SKILLS, 'journalist-report', 'SKILL.md'),
      ...fs.readdirSync(path.join(REPO, '.claude', 'agents')).map((f) => path.join(REPO, '.claude', 'agents', f))
    ];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      RETIRED.forEach((name) => {
        expect(`${path.basename(file)}: ${name}: ${text.includes(`prompts/${name}.md`)}`).toBe(`${path.basename(file)}: ${name}: false`);
      });
      // Task 3.12: nor at the five rule files task 3.8 retired, by path or by tag. An
      // agent told to read one finds no file, and misses the items its successor holds.
      RETIRED_RULE_FILES.forEach((name) => {
        expect(`${path.basename(file)}: ${name}: ${text.includes(name)}`).toBe(`${path.basename(file)}: ${name}: false`);
      });
    }
    expect(fs.readFileSync(files[0], 'utf8')).toContain('references/rules/');
  });

  /**
   * Task 4c-fix (3.12 review minor 5): each standalone agent lists exactly the rule files
   * its pipeline counterpart reads, so an agent's list cannot fall behind a change to
   * RULE_SET_CALLS. Every call reads the world and the truth rules, then its craft files
   * in RULE_SET_CALLS order, then the reporting-mode block (spec section 8). The evidence
   * curator and the image analyzer write no story text, so they read the world file
   * alone, for the game's facts and what each memory became. The three specialists left
   * the skill path when the standalone path was rewritten to defer to the rule set:
   * nothing started them.
   */
  const AGENT_CALLS = {
    'journalist-arc-analyzer.md': 'arc',
    'journalist-outline-generator.md': 'outline',
    'journalist-article-generator.md': 'article',
    'journalist-article-validator.md': 'article',
    'journalist-evidence-curator.md': null,
    'journalist-image-analyzer.md': null
  };

  it('maps every agent definition to its pipeline counterpart', () => {
    expect(fs.readdirSync(path.join(REPO, '.claude', 'agents')).sort()).toEqual(Object.keys(AGENT_CALLS).sort());
  });

  it.each(Object.entries(AGENT_CALLS))('%s lists exactly the rule files the %s call reads', (agent, call) => {
    const text = fs.readFileSync(path.join(REPO, '.claude', 'agents', agent), 'utf8');
    const listed = [...text.matchAll(/references\/rules\/([a-z-]+)\.md/g)].map((match) => match[1]);
    expect(listed).toEqual(call ? ['world', 'truth-rules', ...RULE_SET_CALLS[call], 'mode-on-site'] : ['world']);
    if (call) expect(text).toContain('mode-remote.md');
  });
});

describe("the detective's phase lists still resolve (it is parked, spec D13)", () => {
  // Phase 4 (brief 4.6; R1): the detective's outline phase went with its outline writer.
  it.each(['articleGeneration'])('%s: every file loads, none empty', async (phase) => {
    const names = PHASE_REQUIREMENTS.detective[phase];
    expect(names.length).toBeGreaterThan(0);
    const prompts = await createThemeLoader({ theme: 'detective' }).loadPhasePrompts(phase);
    expect(Object.keys(prompts)).toEqual(names);
    names.forEach((name) => expect(`${name}: ${prompts[name].trim().length > 0}`).toBe(`${name}: true`));
  });

  it('validate() finds every prompt file each theme lists, and the journalist skill whole', async () => {
    // The server validates the journalist skill at startup. The detective skill has
    // never carried article.html or schemas.md, so only its prompt files are checked.
    const journalist = await createThemeLoader({ theme: 'journalist' }).validate();
    expect(journalist.missing).toEqual([]);
    const detective = await createThemeLoader({ theme: 'detective' }).validate();
    expect(detective.missing.filter((m) => m.startsWith('prompts/'))).toEqual([]);
  });
});

describe('requirePhasePrompts: the reworkers\' guard', () => {
  let emptyRoot;
  beforeAll(() => { emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-rules-')); });
  afterAll(() => { setDefaultRulesRoot(null); fs.rmSync(emptyRoot, { recursive: true, force: true }); });

  it.each(['outlineGeneration', 'articleGeneration'])('journalist %s: passes on the rule set, and fails loud naming a missing rule file', async (phase) => {
    const builder = createPromptBuilder({ theme: 'journalist' });
    await expect(builder.requirePhasePrompts(phase)).resolves.toBeUndefined();
    setDefaultRulesRoot(emptyRoot);
    try {
      await expect(builder.requirePhasePrompts(phase)).rejects.toThrow(/truth-rules\.md/);
    } finally {
      setDefaultRulesRoot(null);
    }
  });

  // Brief 4.7c (R1): the parked detective's branch, which checked its own craft files, went
  // with the old stages its writers wrote: the check is the rule set's for every builder,
  // and it never asks the theme loader. Brief 4.13 (R14): it reads the rules folder of the
  // builder's theme, so it fails the parked detective, which names none, naming it.
  it.each(['outlineGeneration', 'articleGeneration'])('%s: the check never asks the theme loader, for any theme', async (phase) => {
    const loader = { loadPhasePrompts: jest.fn(async () => { throw new Error('asked the theme loader'); }) };
    await expect(new PromptBuilder(loader, 'journalist').requirePhasePrompts(phase)).resolves.toBeUndefined();
    await expect(new PromptBuilder(loader, 'detective').requirePhasePrompts(phase)).rejects.toThrow(/"detective" names no rules folder/);
    expect(loader.loadPhasePrompts).not.toHaveBeenCalled();
  });
});
