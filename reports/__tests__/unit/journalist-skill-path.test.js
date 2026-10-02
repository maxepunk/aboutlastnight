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
  it.each(NAMES)('%s: every script, schema and skill file it names exists', (name) => {
    const paths = [...FILES[name].matchAll(/(?:\.claude\/[\w./-]+|lib\/schemas\/[\w.-]+|scripts\/[\w.-]+)\.(?:json|md|js)\b/g)]
      .map((m) => m[0]);
    paths.forEach((p) => expect(`${p}: ${fs.existsSync(path.join(REPO, p))}`).toBe(`${p}: true`));
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
