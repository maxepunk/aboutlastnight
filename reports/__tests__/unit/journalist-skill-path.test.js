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

/**
 * Phase 4b, piece 1 (brief 1H; spec docs/superpowers/specs/2026-10-05-story-level-and-evidence.md
 * sections 3 to 5 and 11): the story meeting and the map stay at the level of the story, and the
 * evidence behind each line travels underneath it to the article writer. The standalone path
 * follows the pipeline (R13):
 * - the two stops' pages and the two planning agents hold the bounds the code holds;
 * - schemas.md gives the weave no field beyond the pipeline's, and gives a beat and its pieces of
 *   evidence the pipeline's shape. lib/schemas/outline.schema.json leaves a piece's shape to
 *   lib/evidence.js, which lib/map.js mapSchemaFor fills in code, so the outline generator reads
 *   the piece here;
 * - the article generator writes each beat from its evidence and prints a card from its flagged
 *   piece;
 * - no file describes what went: a thread's claim and its receipt, a beat's material, the weave's
 *   old bound and the pages of about 400 and 450 words. The beat kind `receipt` and the craft
 *   file craft-material.md keep their names (the footprint survey's dismissed hits).
 */
describe('the story level, with the evidence underneath (phase 4b, piece 1)', () => {
  const { WEAVE_SCHEMA } = require('../../lib/sdk-client/subagents');
  const { MEETING_WORD_BOUND } = require('../../lib/weave');
  const { MAP_WORD_BOUND, MAP_WORD_AIM, MAP_BEAT_KINDS } = require('../../lib/map');
  const { EVIDENCE_PIECE_SCHEMA, EVIDENCE_SOURCES, EVIDENCE_STANCES } = require('../../lib/evidence');
  const { WEAVE_ANSWER_KEY } = require('../../lib/writer-questions');
  const outlineSchema = require('../../lib/schemas/outline.schema.json');

  /** The text of SKILL.md from `from` to `to`. */
  function skillBetween(from, to) {
    const text = FILES['SKILL.md'];
    const at = text.indexOf(from);
    if (at < 0) return '';
    const end = text.indexOf(to, at);
    return end < 0 ? text.slice(at) : text.slice(at, end);
  }
  /** The first code block of schemas.md after `heading`. */
  function schemasBlock(heading) {
    const doc = FILES['schemas.md'];
    const at = doc.indexOf(heading);
    if (at < 0) return '';
    const found = doc.slice(at).match(/```\n([\s\S]*?)\n```/);
    return found ? found[1] : '';
  }
  const keysOf = (block) => [...new Set([...block.matchAll(/"([A-Za-z]+)":/g)].map((m) => m[1]))];
  /**
   * A block split at the array under `key`: the array's text (`inside`) and the block with the
   * array emptied (`outside`), read by bracket depth outside quoted strings. So the keys of the
   * objects in the array are read apart from the keys around it.
   */
  function splitAtArray(block, key) {
    const open = block.indexOf(`"${key}": [`);
    if (open < 0) return { inside: '', outside: block };
    const from = block.indexOf('[', open);
    let depth = 0;
    let quoted = false;
    for (let i = from; i < block.length; i += 1) {
      const c = block[i];
      if (c === '"') quoted = !quoted;
      else if (!quoted && c === '[') depth += 1;
      else if (!quoted && c === ']' && (depth -= 1) === 0) {
        return { inside: block.slice(from + 1, i), outside: block.slice(0, from + 1) + block.slice(i) };
      }
    }
    return { inside: '', outside: block };
  }
  /** The values a block lists for a key, as `"key": "a | b"` or `"key": ["a | b"]`, each kept as written. */
  function listedIn(block, key) {
    const found = block.match(new RegExp(`"${key}": \\[?"([^"]+)"`));
    return found ? found[1].split('|').map((s) => s.trim()) : null;
  }
  const atMost = (words) => new RegExp(`\\bat most ${words} words\\b`);
  const aimingFor = new RegExp(`\\baim(?:ing)? for ${MAP_WORD_AIM}\\b`);
  const BEAT = outlineSchema.properties.sections.items.properties.beats.items.properties;
  const PIECE = EVIDENCE_PIECE_SCHEMA.properties;
  const SOURCES = ['<document id>', ...Object.values(EVIDENCE_SOURCES)];

  it("the story meeting's page and the arc analyzer hold the meeting's bound", () => {
    expect(skillBetween('**Stop: the story meeting.**', '### 9.')).toMatch(atMost(MEETING_WORD_BOUND));
    expect(section(agent('arc-analyzer'), 'Job')).toMatch(atMost(MEETING_WORD_BOUND));
  });

  it("the map's page and the outline generator hold the map's bound and its aim", () => {
    const stop = skillBetween('**Stop: the map.**', '### 10.');
    expect(stop).toMatch(atMost(MAP_WORD_BOUND));
    expect(stop).toMatch(aimingFor);
    const job = section(agent('outline-generator'), 'Job');
    expect(job).toMatch(atMost(MAP_WORD_BOUND));
    expect(job).toMatch(aimingFor);
  });

  it("schemas.md gives the weave no field beyond the pipeline's and the director's, and its pieces the pipeline's sources and stances", () => {
    const block = schemasBlock('### analysis/weave.json');
    const items = (prop) => Object.keys(WEAVE_SCHEMA.properties[prop].items.properties);
    const allowed = new Set([
      ...Object.keys(WEAVE_SCHEMA.properties), ...items('threads'), ...items('connections'), ...items('questions'),
      ...Object.keys(WEAVE_SCHEMA.properties.strongerMainThread.properties),
      ...Object.keys(WEAVE_SCHEMA.properties.threads.items.properties.evidence.items.properties),
      WEAVE_ANSWER_KEY, 'struck', 'directorChanges', 'change'
    ]);
    keysOf(block).forEach((key) => expect(`${key}: ${allowed.has(key)}`).toBe(`${key}: true`));
    expect(listedIn(block, 'sources')).toEqual(SOURCES);
    expect(listedIn(block, 'stance')).toEqual([...EVIDENCE_STANCES]);
  });

  it("schemas.md gives a beat, and each piece of its evidence, the pipeline's shape", () => {
    const block = schemasBlock('### analysis/article-outline.json');
    expect(block).not.toBe('');
    const { inside: piece, outside: beat } = splitAtArray(block, 'evidence');
    expect(piece).not.toBe('');
    expect(keysOf(beat).sort()).toEqual(Object.keys(BEAT).sort());
    expect(keysOf(piece).sort()).toEqual(Object.keys(PIECE).sort());
    expect(listedIn(beat, 'kind')).toEqual([...MAP_BEAT_KINDS]);
    expect(listedIn(piece, 'sources')).toEqual(SOURCES);
    expect(listedIn(piece, 'stance')).toEqual([...EVIDENCE_STANCES]);
  });

  it("the outline generator reads the beat's shape in schemas.md", () => {
    expect(section(agent('outline-generator'), 'Input')).toContain('.claude/skills/journalist-report/references/schemas.md');
  });

  it("the article generator writes each beat from its evidence, and prints a card from the flagged piece", () => {
    const job = section(agent('article-generator'), 'Job');
    expect(job).toContain('each written from the pieces of its `evidence`');
    expect(job).toContain('print an inline card of the document named by its piece flagged `card`');
  });

  it.each(NAMES)('%s describes no thread claim or receipt, no beat material, and none of the old bounds', (name) => {
    const text = FILES[name].split(MAP_BEAT_KINDS.join(' | ')).join('');
    const old = {
      claimField: /["`]claim["`]/,
      receipt: /\breceipts?\b/i,
      material: /(?<!craft-)\bmaterial\b/i,
      weaveBound: /WEAVE_WORD_BOUND/,
      oldPages: /\babout (?:400|450) words\b/
    };
    Object.entries(old).forEach(([what, pattern]) => expect(`${name}: ${what}: ${pattern.test(text)}`).toBe(`${name}: ${what}: false`));
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
