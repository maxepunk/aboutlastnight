/**
 * The eight journalist craft files are retired (phase 3, task 3.2; the integrator's
 * ruling: deleted, not archived, and git keeps their history). The journalist
 * writers, reworkers and judges read the rule set (lib/rule-set.js) instead. The
 * detective is parked (spec D13) and keeps its own files and phase lists.
 *
 * Real files on disk: nothing here is mocked.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createThemeLoader, PHASE_REQUIREMENTS, ALL_PROMPTS } = require('../theme-loader');
const { createPromptBuilder, PromptBuilder } = require('../prompt-builder');
const { setDefaultRulesRoot } = require('../rule-set');

const REPO = path.join(__dirname, '..', '..');
const SKILLS = path.join(REPO, '.claude', 'skills');
const RETIRED = [
  'writing-principles', 'anti-patterns', 'character-voice', 'evidence-boundaries',
  'narrative-structure', 'section-rules', 'editorial-design', 'formatting'
];

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
    }
    expect(fs.readFileSync(files[0], 'utf8')).toContain('references/rules/');
  });
});

describe("the detective's phase lists still resolve (it is parked, spec D13)", () => {
  it.each(['outlineGeneration', 'articleGeneration'])('%s: every file loads, none empty', async (phase) => {
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

  it.each(['outlineGeneration', 'articleGeneration'])('detective %s: passes on its files, and fails loud naming an empty one', async (phase) => {
    await expect(createPromptBuilder({ theme: 'detective' }).requirePhasePrompts(phase)).resolves.toBeUndefined();
    const names = PHASE_REQUIREMENTS.detective[phase];
    const loader = { loadPhasePrompts: async () => Object.fromEntries(names.map((n, i) => [n, i === 0 ? '' : 'text'])) };
    await expect(new PromptBuilder(loader, 'detective').requirePhasePrompts(phase)).rejects.toThrow(names[0]);
  });
});
