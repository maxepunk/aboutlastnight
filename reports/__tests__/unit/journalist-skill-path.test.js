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
 * pipeline's (lib/sdk-client/subagents.js WEAVE_SCHEMA, with the director's pick and answers
 * the meeting adds), so its roles and kinds cannot drift from lib/weave.js and
 * lib/writer-questions.js. The map's shape is lib/schemas/outline.schema.json with the
 * theme's slots, which the path points at rather than copies.
 */
describe('the stages (phase 4)', () => {
  const { WEAVE_SCHEMA } = require('../../lib/sdk-client/subagents');
  const { PICKED_KEY, CONNECTION_KINDS } = require('../../lib/weave');
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

  // Piece 3 (brief 3B): the weave is its angles over one set of threads, with the director's pick;
  // a thread has no role and no reason, and the single story went into each angle.
  it('schemas.md gives the weave the pipeline\'s shape and kinds, its angles and the pick', () => {
    const doc = FILES['schemas.md'];
    const at = doc.indexOf('### analysis/weave.json');
    expect(at).toBeGreaterThan(-1);
    const block = doc.slice(at).match(/```\n([\s\S]*?)\n```/)[1];
    const kinds = [...block.matchAll(/"kind": "([^"<]+)"/g)].map((m) => m[1].split('|').map((s) => s.trim()));
    expect(kinds).toEqual([[...CONNECTION_KINDS], [...WEAVE_QUESTION_KINDS]]);
    const keys = new Set([...block.matchAll(/"([A-Za-z]+)":/g)].map((m) => m[1]));
    // Piece 3 (brief 3C; R7): the strike on a connection went from the weave.
    ['role', 'reason', 'convergence', 'strongerMainThread', 'struck'].forEach((key) => expect(`${key}: ${keys.has(key)}`).toBe(`${key}: false`));
    const items = (prop) => Object.keys(WEAVE_SCHEMA.properties[prop].items.properties);
    [...Object.keys(WEAVE_SCHEMA.properties), ...items('angles'), ...items('threads'), ...items('connections'), ...items('questions'), WEAVE_ANSWER_KEY, PICKED_KEY]
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
  const { MEETING_WORD_BOUND, PICKED_KEY } = require('../../lib/weave');
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
      ...Object.keys(WEAVE_SCHEMA.properties), ...items('angles'), ...items('threads'), ...items('connections'), ...items('questions'),
      ...Object.keys(WEAVE_SCHEMA.properties.threads.items.properties.evidence.items.properties),
      WEAVE_ANSWER_KEY, PICKED_KEY, 'directorChanges', 'change'
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

/**
 * Phase 4b, piece 3 (brief 3F; spec docs/superpowers/specs/2026-10-06-meeting-as-angles.md
 * sections 5 to 7 and 14): the story meeting pitches two or three angles over one set of threads,
 * and the director picks one, flips threads in or out and approves, reweaves or sends back. The
 * roles, the main thread, the stronger main thread and the strike on a connection went, and so
 * did the meeting's page of 300 words.
 */
describe('the story meeting as angles (phase 4b, piece 3)', () => {
  it.each(NAMES)('%s describes no role, no main thread and no strike on a connection', (name) => {
    const old = {
      mainThread: /\bmain thread\b/i,
      roleLabel: /\b(?:grounds it|complicates it|mirrors it|carries it forward)\b/i,
      threadRole: /\b(?:a thread's role|its role|their roles?|in a role)\b/i,
      strike: /\bstruck connection|\bstrike a connection|\bconnections? (?:they|the director) struck\b/i,
      oldPage: /\b300 words\b/
    };
    // schemas.md's weave section gives the pipeline's shape, which keeps `struck` until slice 3C
    // takes the strike out of the code; its own test above holds it to WEAVE_SCHEMA.
    const text = name === 'schemas.md'
      ? FILES[name].replace(/\n## The weave\n[\s\S]*?\n## The map\n/, '\n## The map\n')
      : FILES[name];
    Object.entries(old).forEach(([what, pattern]) => expect(`${name}: ${what}: ${pattern.test(text)}`).toBe(`${name}: ${what}: false`));
  });

  // The stop's controls as SKILL.md writes them, each the bold name its list item opens with, so a
  // word elsewhere in the stop ("`picked`") holds nothing: what the director can do, the console's
  // operations at the meeting (pickMeetingAngle, the line edits, flipMeetingThread,
  // addMeetingThread, setQuestionAnswer, the note box), then the three buttons, the console's
  // MEETING_ACTIONS.
  it("the story meeting's stop has the director pick an angle, rewrite a line, flip or add a thread, answer and note, then press one of three buttons", () => {
    const { MEETING_ACTIONS } = require('../../console/checkpoint-view-logic');
    const text = FILES['SKILL.md'];
    const stop = text.slice(text.indexOf('**Stop: the story meeting.**'), text.indexOf('### 9.'));
    const controls = [...stop.matchAll(/^- \*\*([^*\n]+)\*\*/gm)].map((m) => m[1]);
    const buttons = MEETING_ACTIONS.map((action) => action.charAt(0).toUpperCase() + action.slice(1).replace(/-/g, ' '));
    expect(buttons).toEqual(['Approve', 'Reweave', 'Send back']);
    expect(controls).toEqual(['Pick an angle', 'Rewrite a line', 'Flip a thread', 'Add a thread', 'Answer a question', 'Leave a note', ...buttons]);
  });

  it('the arc analyzer pitches angles, and the outline generator reads the angle the director picked', () => {
    expect(section(agent('arc-analyzer'), 'Job')).toMatch(/\btwo or three angles\b/);
    expect(section(agent('outline-generator'), 'Input')).toContain('`picked`');
  });
});

/**
 * Phase 4b, piece 4 (brief 4E; spec docs/superpowers/specs/2026-10-07-map-as-corkboard.md
 * sections 3, 4, 8, 11 and 14): each move carries a summary (the beat's `synopsis`), the order of
 * a section's moves is the map's, and the page is counted twice, as it opens and with every
 * summary open. The map's page as one column, its Everyone list, "(card)" and the article
 * writer's own order within a section went, here and in the docs that describe the map.
 */
describe('the map as a corkboard (phase 4b, piece 4)', () => {
  const { MAP_WORD_BOUND, MAP_OPEN_WORD_BOUND, MAP_SYNOPSIS_AIM } = require('../../lib/map');
  const atMost = (words) => new RegExp(`\\bat most ${words} words\\b`);
  const mapStop = () => {
    const text = FILES['SKILL.md'];
    return text.slice(text.indexOf('**Stop: the map.**'), text.indexOf('### 10.'));
  };
  const DOCS = {
    'CONTEXT.md': read(path.join(REPO, 'CONTEXT.md')),
    'PIPELINE_DEEP_DIVE.md': read(path.join(REPO, 'docs', 'PIPELINE_DEEP_DIVE.md')),
    'first-run-sheet.md': read(path.join(REPO, 'docs', 'runbook', 'first-run-sheet.md'))
  };
  const ALL = { ...FILES, ...DOCS };

  it("the map's stop and the outline generator hold both pages' bounds, and the summaries' aim", () => {
    for (const text of [mapStop(), section(agent('outline-generator'), 'Job')]) {
      expect(text).toMatch(atMost(MAP_WORD_BOUND));
      expect(text).toMatch(atMost(MAP_OPEN_WORD_BOUND));
      expect(text).toMatch(new RegExp(`\\babout ${MAP_SYNOPSIS_AIM} words\\b`));
    }
  });

  it("the outline generator writes each move's synopsis and orders each section's moves as the article tells them", () => {
    const job = section(agent('outline-generator'), 'Job');
    expect(job).toContain('`synopsis`');
    expect(job).toMatch(/in the order the article (?:will )?tells? them/);
  });

  it("the article generator tells each section's beats in the map's order, each as its synopsis says", () => {
    const job = section(agent('article-generator'), 'Job');
    expect(job).toMatch(/in the map's order/);
    // Fix B6: a beat the director added may have no synopsis, as the pipeline's STORY_MAP_LABEL says.
    expect(job).toContain('as its `synopsis` says, where it has one');
  });

  it("the map's stop shows each move with its summary, in the article's order, with both counts", () => {
    const stop = mapStop();
    expect(stop).toMatch(/\bsummary\b/);
    expect(stop).toMatch(/order the article tells them/);
    expect(stop).toMatch(/\bIn no move\b/);
    expect(stop).toMatch(/"Card"/);
  });

  it("CONTEXT.md gives a beat its sentence and the map's order, and the map its corkboard", () => {
    const entry = (term) => {
      const at = DOCS['CONTEXT.md'].indexOf(`**${term}**:`);
      return at < 0 ? '' : DOCS['CONTEXT.md'].slice(at, DOCS['CONTEXT.md'].indexOf('_Avoid_', at));
    };
    expect(entry('Beat')).toContain('one sentence on what the article tells there');
    expect(entry('Beat')).toContain("tells every beat in the map's order, as its sentence says");
    expect(entry('Story map')).toContain('its beats in the order the article tells them');
    expect(entry('Story map')).toContain('On screen it is a corkboard');
  });

  // Fix D2: a move the director added may have no summary (in docs, its `synopsis`), as STORY_MAP_LABEL and the article
  // generator say, so every place that tells the article writer to follow a summary qualifies it.
  it.each([...Object.keys(ALL), 'CLAUDE.md'])("%s tells the article writer to follow a move's summary only where it has one", (name) => {
    const text = name === 'CLAUDE.md' ? read(path.join(REPO, 'CLAUDE.md')) : ALL[name];
    const follows = /as (?:its (?:summary|sentence|`?synopsis`?) says|their summaries say)(?!,? where)/g;
    expect(`${name}: ${(text.replace(/\s*│\s*/g, ' ').match(follows) || []).length}`).toBe(`${name}: 0`);
  });

  it.each(Object.keys(ALL))("%s describes none of the map's retired page or the article writer's own order", (name) => {
    const old = {
      cardInBrackets: /\(card\)/,
      inNoBeat: /\bIn no beat\b/,
      everyoneList: /\bEveryone(?::| line| list)/,
      writersOrder: /the order of the beats within/i
    };
    Object.entries(old).forEach(([what, pattern]) => expect(`${name}: ${what}: ${pattern.test(ALL[name])}`).toBe(`${name}: ${what}: false`));
  });
});

/**
 * Phases 14 and 15 (brief G; spec docs/superpowers/specs/2026-10-09-your-words-and-the-world.md
 * sections 3, 4, 7, 10 and 15): the standalone path and the docs follow the pipeline.
 * - The curator marks a player's character sheet with the record view's own kind and leaves out
 *   its suspected motive and starting instructions (R6), lines up ledger rows logged off the
 *   game's clock (R3), and writes the time of day the writers read (R7), which the planning and
 *   writing agents read with the record.
 * - The article generator's byline names a guest reporter only when the session has one (R5).
 * - The deep dive describes the sheets, the notes at the stops and the shift; the run sheet
 *   quotes the input review's shift lines as the console builds them.
 * - No file describes what the phases retire (gate 5).
 */
describe('your words and the world (phases 14 and 15)', () => {
  const { CHARACTER_SHEET_KIND } = require('../../lib/prompt-renderers/record-view');
  const { ledgerView } = require('../../console/input-review-logic');
  const DOCS = {
    'CONTEXT.md': read(path.join(REPO, 'CONTEXT.md')),
    'PIPELINE_DEEP_DIVE.md': read(path.join(REPO, 'docs', 'PIPELINE_DEEP_DIVE.md')),
    'first-run-sheet.md': read(path.join(REPO, 'docs', 'runbook', 'first-run-sheet.md'))
  };
  const ALL = { ...FILES, ...DOCS };
  const curator = () => section(agent('evidence-curator'), 'Job');
  const recordBlock = () => {
    const doc = FILES['schemas.md'];
    const at = doc.indexOf('### analysis/evidence-bundle.json');
    return at < 0 ? '' : (doc.slice(at).match(/```\n([\s\S]*?)\n```/) || ['', ''])[1];
  };
  const contextEntry = (term) => {
    const text = DOCS['CONTEXT.md'];
    const at = text.indexOf(`**${term}**:`);
    return at < 0 ? '' : text.slice(at, text.indexOf('_Avoid_', at));
  };

  it("the curator marks a character sheet with the record's kind and leaves out its motive and starting instructions", () => {
    expect(curator()).toMatch(/Character Sheet/);
    expect(curator()).toContain('SUSPECTED MOTIVE');
    expect(curator()).toContain('WHERE TO START');
    expect(recordBlock()).toContain(`| ${CHARACTER_SHEET_KIND}"`);
  });

  it("the curator lines up ledger rows logged off the game's clock, and the record says what moved", () => {
    expect(curator()).toMatch(/off the game's clock/);
    expect(curator()).toMatch(/\bthree hours\b/);
    expect(curator()).toMatch(/\bfirst sale\b/);
    expect(recordBlock()).toContain('"shift":');
  });

  it('the curator writes when the investigation ran, and every planning and writing agent reads it with the record', () => {
    expect(curator()).toContain('The investigation ran this');
    expect(recordBlock()).toContain('"timeOfDay":');
    ['arc-analyzer', 'outline-generator', 'article-generator'].forEach((name) =>
      expect(`${name}: ${/when the investigation ran/.test(section(agent(name), 'Input'))}`).toBe(`${name}: true`));
  });

  // Final fix wave (K7): the validator reads the session's facts the other agents name, and the
  // shift's placeholder in the record allows the singular forms the console prints.
  it("the validator reads the session's facts the other agents name", () => {
    const input = section(agent('article-validator'), 'Input');
    expect(input).toMatch(/when the investigation ran \(`timeOfDay`\)/);
    expect(input).toMatch(/Nova's first name for the session/);
    expect(input).toMatch(/the guest reporter, when there is one/);
  });

  it("the shift's placeholder in the record allows each form the console prints", () => {
    const shift = recordBlock().match(/"shift": "([^"]*)"/)[1];
    ["It's | They're", '<row sits | rows sit>', 'lines <it | them> up', '<It prints | They print>', '<back | forward>'].forEach((form) =>
      expect(`${form}: ${shift.includes(form)}`).toBe(`${form}: true`));
    expect(shift).toMatch(/the first-burial bonus/);
  });

  it("the article generator's byline names a guest reporter only when the session has one", () => {
    expect(section(agent('article-generator'), 'Job')).toMatch(/no `guestReporter` when it has none/);
  });

  it("the deep dive describes the character sheets, the notes at the stops and the ledger's shift", () => {
    const doc = DOCS['PIPELINE_DEEP_DIVE.md'];
    expect(doc).toContain('isCharacterSheet');
    expect(doc).toContain('SUSPECTED MOTIVE');
    expect(doc).toContain('<DIRECTOR_STOP_NOTES>');
    expect(doc).toContain('lib/director-words.js');
    expect(doc).toContain('clockShift');
  });

  it("the run sheet quotes the input review's shift lines as the console builds them", () => {
    const moved = ledgerView({ adjustmentsParsed: true, clockShift: { hours: -9, moved: 5, bonus: true } }).shiftLine;
    const unfit = ledgerView({ adjustmentsParsed: true, offClock: { rows: 3 } }).shiftLine;
    expect(DOCS['first-run-sheet.md']).toContain(moved);
    expect(DOCS['first-run-sheet.md']).toContain(unfit);
  });

  it("CONTEXT.md's Exposer names a note at a stop among the director's words, and its Record names opinion", () => {
    expect(contextEntry('Exposer')).toMatch(/a note (?:they sent|sent) at a stop/);
    expect(contextEntry('Record')).toMatch(/\bopinion\b/);
  });

  it.each(Object.keys(ALL))('%s describes nothing the phases retire (gate 5)', (name) => {
    const old = {
      morning: /\bthis morning\b|\bmorning(?: |-)(?:timeline|clock)\b|\bmorning's market\b/i,
      fourSources: /\bfour sources\b/i,
      oneOfTheRoom: /never one of the room/i,
      plainLine: /Nova says so in one plain line|one plain line where the record stops/i,
      motiveLine: /Nova's own motive/i,
      namesake: /reason to suspect its namesake/i,
      chasingNext: /what Nova is chasing next/i
    };
    Object.entries(old).forEach(([what, pattern]) => expect(`${name}: ${what}: ${pattern.test(ALL[name])}`).toBe(`${name}: ${what}: false`));
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
