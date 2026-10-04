/**
 * The standalone journalist skill path: SKILL.md, references/schemas.md and the
 * agents in .claude/agents/. Since phase 3 the rule set (references/rules/, spec
 * docs/superpowers/specs/2026-09-30-rule-set.md) holds every writing rule, and these
 * files hold only the steps, each agent's job, inputs and outputs, and the shapes of
 * the files passed between steps. So the lint the rule files get
 * (lib/__tests__/rule-set.test.js) runs over them too, with the text spec section 7
 * removes, and the agents folder holds exactly the agents SKILL.md starts.
 *
 * Real files on disk: nothing here is mocked.
 */

const fs = require('fs');
const path = require('path');
const { findRemovedPhrases } = require('../../lib/__tests__/fixtures/removed-phrases');

const REPO = path.join(__dirname, '..', '..');
const SKILL_DIR = path.join(REPO, '.claude', 'skills', 'journalist-report');
const AGENTS_DIR = path.join(REPO, '.claude', 'agents');
const RULES_DIR = path.join(SKILL_DIR, 'references', 'rules');

const read = (file) => fs.readFileSync(file, 'utf8');

const AGENTS = fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, ''));
const FILES = {
  'SKILL.md': read(path.join(SKILL_DIR, 'SKILL.md')),
  'schemas.md': read(path.join(SKILL_DIR, 'references', 'schemas.md')),
  ...Object.fromEntries(AGENTS.map((name) => [`${name}.md`, read(path.join(AGENTS_DIR, `${name}.md`))]))
};
const NAMES = Object.keys(FILES);

describe('the agents', () => {
  it('are exactly the ones SKILL.md starts', () => {
    const started = [...FILES['SKILL.md'].matchAll(/^\|[^|\n]*\|\s*`(journalist-[a-z-]+)`/gm)].map((m) => m[1]);
    expect(started.length).toBeGreaterThan(0);
    expect([...started].sort()).toEqual([...AGENTS].sort());
  });

  it.each(AGENTS)('%s carries its own name in its frontmatter', (name) => {
    expect(FILES[`${name}.md`]).toMatch(new RegExp(`^---\\nname: ${name}\\n`));
  });

  it.each(AGENTS)('%s reads the world first, and every rule file it names exists', (name) => {
    const text = FILES[`${name}.md`];
    const named = [...text.matchAll(/references\/rules\/([a-z-]+\.md)/g)].map((m) => m[1]);
    expect(named[0]).toBe('world.md');
    named.forEach((file) => expect(`${file}: ${fs.existsSync(path.join(RULES_DIR, file))}`).toBe(`${file}: true`));
  });
});

describe('the paths the skill path names', () => {
  it.each(NAMES)('%s: every script, schema, lib and skill file it names exists', (name) => {
    const paths = [...FILES[name].matchAll(/(?:\.claude\/[\w./-]+|lib\/[\w./-]+|scripts\/[\w.-]+)\.(?:json|md|js)\b/g)]
      .map((m) => m[0]);
    paths.forEach((p) => expect(`${p}: ${fs.existsSync(path.join(REPO, p))}`).toBe(`${p}: true`));
  });
});

/**
 * Phase 4 (brief 4.12b; R13): the standalone path follows the pipeline's stages. The arc
 * analyzer writes the weave, which the director settles at the story meeting; the outline
 * generator lays it across the sections as the story map, which the director settles at the
 * map's stop; the article generator writes from both. The weave's shape in schemas.md is the
 * pipeline's (lib/sdk-client/subagents.js WEAVE_SCHEMA, with the director's answers and
 * strikes the meeting adds), so its roles and kinds cannot drift from lib/weave.js and
 * lib/writer-questions.js. The map's shape is lib/schemas/outline.schema.json with the
 * theme's slots, which the path points at rather than copies.
 */
describe('the stages (phase 4)', () => {
  const { WEAVE_SCHEMA } = require('../../lib/sdk-client/subagents');
  const { WEAVE_ROLES, CONNECTION_KINDS } = require('../../lib/weave');
  const { WEAVE_QUESTION_KINDS, WEAVE_ANSWER_KEY } = require('../../lib/writer-questions');

  /** The text under a `## <heading>` of an agent definition, to the next `## `. */
  function section(text, heading) {
    const at = text.indexOf(`\n## ${heading}\n`);
    if (at < 0) return '';
    const rest = text.slice(at + heading.length + 5);
    const end = rest.search(/\n## /);
    return end < 0 ? rest : rest.slice(0, end);
  }
  const filesIn = (text) => [...text.matchAll(/`((?:analysis|output|inputs|summaries)\/[\w.-]+\.json)`/g)].map((m) => m[1]);
  const agent = (name) => FILES[`journalist-${name}.md`];

  it('the arc analyzer writes the weave, and reads it back for a round at the story meeting', () => {
    expect(filesIn(section(agent('arc-analyzer'), 'Output'))).toEqual(['analysis/weave.json']);
    expect(filesIn(section(agent('arc-analyzer'), 'Input'))).toContain('analysis/weave.json');
  });

  it('the outline generator reads the settled weave and writes the map', () => {
    expect(filesIn(section(agent('outline-generator'), 'Input'))).toContain('analysis/weave.json');
    expect(filesIn(section(agent('outline-generator'), 'Output'))).toEqual(['analysis/article-outline.json']);
    expect(section(agent('outline-generator'), 'Input')).toContain('lib/schemas/outline.schema.json');
    expect(section(agent('outline-generator'), 'Input')).toContain('lib/theme-config.js');
  });

  it('the article generator reads both, and the validator reads the map it checks the players against', () => {
    const input = filesIn(section(agent('article-generator'), 'Input'));
    expect(input).toEqual(expect.arrayContaining(['analysis/weave.json', 'analysis/article-outline.json']));
    expect(filesIn(section(agent('article-validator'), 'Input'))).toEqual(expect.arrayContaining(['analysis/weave.json', 'analysis/article-outline.json']));
  });

  it('schemas.md gives the weave the pipeline\'s shape, roles and kinds', () => {
    const doc = FILES['schemas.md'];
    const at = doc.indexOf('### analysis/weave.json');
    expect(at).toBeGreaterThan(-1);
    const block = doc.slice(at).match(/```\n([\s\S]*?)\n```/)[1];
    const listed = (key) => {
      const m = block.match(new RegExp(`"${key}": "([^"<]+)"`));
      return m ? m[1].split('|').map((s) => s.trim()) : null;
    };
    expect(listed('role')).toEqual([...WEAVE_ROLES]);
    const kinds = [...block.matchAll(/"kind": "([^"<]+)"/g)].map((m) => m[1].split('|').map((s) => s.trim()));
    expect(kinds).toEqual([[...CONNECTION_KINDS], [...WEAVE_QUESTION_KINDS]]);
    const keys = new Set([...block.matchAll(/"([A-Za-z]+)":/g)].map((m) => m[1]));
    const items = (prop) => Object.keys(WEAVE_SCHEMA.properties[prop].items.properties);
    // The integrator, on the review of 4.12b: the stronger main thread's own fields too.
    const own = (prop) => Object.keys(WEAVE_SCHEMA.properties[prop].properties);
    [...Object.keys(WEAVE_SCHEMA.properties), ...items('threads'), ...items('connections'), ...items('questions'), ...own('strongerMainThread'), WEAVE_ANSWER_KEY, 'struck']
      .forEach((key) => expect(`${key}: ${keys.has(key)}`).toBe(`${key}: true`));
  });

  it.each(NAMES)('%s names no file or field of the old arc and outline stages', (name) => {
    const retired = [
      'arc-analysis.json', 'arc-summary.json', 'outline-summary.json', 'userSelections', 'writerQuestions',
      'interweaving', 'narrativeArcs', 'analysisNotes', 'characterPlacements', 'heroSuggestion', 'shouldConsider'
    ];
    retired.forEach((word) => expect(`${name}: ${word}: ${FILES[name].includes(word)}`).toBe(`${name}: ${word}: false`));
  });
});

describe('the skill path carries no retired text', () => {
  it.each(NAMES)('%s has no em-dash', (name) => {
    expect(FILES[name]).not.toMatch(/—/);
  });

  it.each(NAMES)('%s carries nothing on the removed list, and never genders Nova', (name) => {
    expect(findRemovedPhrases(FILES[name])).toEqual([]);
  });

  it.each(NAMES)('%s names none of the old examples\' accounts, sums or sessions', (name) => {
    for (const account of ['ChaseT', 'Gorlan', 'Offbeat', 'John D.', 'Dominic', 'Motherofmen']) {
      expect(`${name}: ${account}: ${FILES[name].includes(account)}`).toBe(`${name}: ${account}: false`);
    }
    expect(FILES[name]).not.toMatch(/\$\s?\d/);
    expect(FILES[name]).not.toMatch(/\b\d{6,7}\b/);
    expect(FILES[name]).not.toMatch(/\bDec(ember)? 21\b/);
  });

  it.each(NAMES)('%s keeps the fiction whole: no Detective, no Valet station, no Black Market (T14)', (name) => {
    expect(FILES[name]).not.toMatch(/\bDetective\b/);
    expect(FILES[name]).not.toMatch(/Valet station/i);
    expect(FILES[name]).not.toMatch(/Black Market/i);
  });

  it.each(NAMES)('%s gives Nova no place in the room: no "I was there", no "I watched" (T8)', (name) => {
    expect(FILES[name]).not.toMatch(/\bI was there\b/i);
    expect(FILES[name]).not.toMatch(/\bI watched\b/i);
    expect(FILES[name]).not.toMatch(/participatory/i);
  });
});
