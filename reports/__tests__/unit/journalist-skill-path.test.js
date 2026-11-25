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
 *   old bound and the pages of about 400 and 450 words. Since phase 18's run 3 the skill names
 *   neither the beat kind `receipt` nor craft-material.md, the two hits this scan once let pass.
 */
describe('the story level, with the evidence underneath (phase 4b, piece 1)', () => {
  const { WEAVE_SCHEMA } = require('../../lib/sdk-client/subagents');
  const { MEETING_WORD_BOUND, PICKED_KEY } = require('../../lib/weave');
  const { MAP_WORD_BOUND, MAP_WORD_AIM } = require('../../lib/map');
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
  // Phase 18, run 2b (brief J; R21): the writer's schema no longer holds a beat's kind. Run 3 (G1):
  // schemas.md drops it too, so the skill's beat is held to outlineSchema's, the map writer's.
  const BEAT = outlineSchema.properties.sections.items.properties.beats.items.properties;
  const PIECE = EVIDENCE_PIECE_SCHEMA.properties;
  const SOURCES = ['<document id>', ...Object.values(EVIDENCE_SOURCES)];

  // Phase 18, run 3 (G1): the arc analyzer's task opens as the weave writer's does (WEAVE_TASK),
  // which gives the writer's own lines and not the page's bound; the test below in "the skill
  // reads what the pipeline reads" holds that. The stop keeps the page's bound.
  it("the story meeting's page holds the meeting's bound", () => {
    expect(skillBetween('**Stop: the story meeting.**', '### 9.')).toMatch(atMost(MEETING_WORD_BOUND));
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
    expect(keysOf(beat)).not.toContain('kind');
    expect(listedIn(piece, 'sources')).toEqual(SOURCES);
    expect(listedIn(piece, 'stance')).toEqual([...EVIDENCE_STANCES]);
  });

  it("the outline generator reads the beat's shape in schemas.md", () => {
    expect(section(agent('outline-generator'), 'Input')).toContain('.claude/skills/journalist-report/references/schemas.md');
  });

  // Phase 18, run 3 (G1; R54): how a beat draws on its evidence is job-article.md's to say, so the
  // agent keeps only the shape: a card block for each beat the map marks, from its flagged piece.
  it("the article generator prints a card block for each beat the map marks `card`, from its flagged piece", () => {
    const job = section(agent('article-generator'), 'Job');
    expect(job).toMatch(/one for each beat the map marks `card`, by the `tokenId` of the document its piece flagged `card` names/);
  });

  it.each(NAMES)('%s describes no thread claim or receipt, no beat material, and none of the old bounds', (name) => {
    const text = FILES[name];
    const old = {
      claimField: /["`]claim["`]/,
      receipt: /\breceipts?\b/i,
      material: /\bmaterial\b/i,
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

  // Phase 18, run 3 (G1; R54): how each beat is told, as its synopsis says, is job-article.md's;
  // the agent keeps the order the map gives, as the pipeline's ARTICLE_TASK does.
  it("the article generator tells each section's beats in the map's order", () => {
    expect(section(agent('article-generator'), 'Job')).toMatch(/in the map's order/);
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
  // CLAUDE.md and the docs/architecture/ files it maps (2026-10-11), where the article writer's account now lives.
  const ARCHITECTURE_DOCS = Object.fromEntries(['CLAUDE.md', ...fs.readdirSync(path.join(REPO, 'docs', 'architecture')).map((f) => `docs/architecture/${f}`)]
    .map((name) => [name, read(path.join(REPO, name))]));
  it.each([...Object.keys(ALL), ...Object.keys(ARCHITECTURE_DOCS)])("%s tells the article writer to follow a move's summary only where it has one", (name) => {
    const text = ARCHITECTURE_DOCS[name] ?? ALL[name];
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
 * - The curator leaves every player's character sheet out of the record (the director's ruling,
 *   2026-10-10: a sheet is never an in-world document), lines up ledger rows logged off the
 *   game's clock (R3), and writes the time of day the writers read (R7), which the planning and
 *   writing agents read with the record.
 * - The article generator's byline names a guest reporter only when the session has one (R5).
 * - The deep dive says no sheet is ever in the record, and describes the notes at the stops and the shift; the run sheet
 *   quotes the input review's shift lines as the console builds them.
 * - No file describes what the phases retire (gate 5).
 */
describe('your words and the world (phases 14 and 15)', () => {
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

  it('the curator leaves every character sheet out of the record, and the record has no kind for one', () => {
    expect(curator()).toMatch(/name ends "Character Sheet" in any case, is never one/);
    expect(curator()).toMatch(/the record leaves it out/);
    expect(curator()).not.toContain('SUSPECTED MOTIVE');
    expect(recordBlock()).not.toMatch(/character sheet/i);
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
    // Phase 17 (brief E; R5): the session holds its guest reporters as a list, each apart.
    expect(input).toMatch(/each guest reporter, when the session has any/);
  });

  it("the shift's placeholder in the record allows each form the console prints", () => {
    const shift = recordBlock().match(/"shift": "([^"]*)"/)[1];
    ["It's | They're", '<row sits | rows sit>', 'lines <it | them> up', '<It prints | They print>', '<back | forward>'].forEach((form) =>
      expect(`${form}: ${shift.includes(form)}`).toBe(`${form}: true`));
    expect(shift).toMatch(/the first-burial bonus/);
  });

  // Phase 17 (brief E; R5, the read's addendum f): the byline credits each guest reporter whole,
  // "Name | Role" or "Name", joined with " || ", as the pipeline's byline instruction gives it.
  it("the article generator's byline credits each guest reporter, and names none when the session has none", () => {
    const job = section(agent('article-generator'), 'Job');
    expect(job).toContain('each guest reporter in `guestReporters`');
    expect(job).toContain('`<name> | <role>`, or `<name>` with no role, joined with ` || `');
    expect(job).toMatch(/no `guestReporter` when the session has none/);
  });

  it("the deep dive says no character sheet is ever in the record, and describes the notes at the stops and the ledger's shift", () => {
    const doc = DOCS['PIPELINE_DEEP_DIVE.md'];
    expect(doc).toContain('isCharacterSheet');
    expect(doc).toContain('never in the record, never cited and never printed');
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

/**
 * Phase 17 (brief E; spec docs/superpowers/specs/2026-10-18-the-writing-design.md sections 3, 4,
 * 6 and 8): the standalone path and the docs follow the pipeline.
 * - The outline generator's only printed lines are the deck under the settled angle's headline,
 *   which it carries word for word, and the headings, as mapTask (addendum a) gives it.
 * - The guest reporters are a list, `guestReporters`, empty when the session has none (R5).
 * - The deep dive names the rule files it reads (since phase 18, the eight of the brief and the limits).
 * - No file says what gate 5 retires.
 * Phase 18's run 3 (G1) retired the tests here that pinned the agents' pointers at the craft
 * rules by number (C4, C12, C16) and G2 moved the deep dive's test from two craft rules' titles to its table of the eight rule files: the rule files
 * that held them are gone, and the agents now point at brief.md and their own part by name.
 */
describe('the writing (phase 17)', () => {
  const DOCS = {
    'CONTEXT.md': read(path.join(REPO, 'CONTEXT.md')),
    'PIPELINE_DEEP_DIVE.md': read(path.join(REPO, 'docs', 'PIPELINE_DEEP_DIVE.md')),
    'first-run-sheet.md': read(path.join(REPO, 'docs', 'runbook', 'first-run-sheet.md'))
  };
  const ALL = { ...FILES, ...DOCS };
  const step = (n) => {
    const text = FILES['SKILL.md'];
    return text.slice(text.indexOf(`### ${n}. `), text.indexOf(`### ${n + 1}. `));
  };

  // Phase 18, run 3 (G1): the map's printed lines as the pipeline's map task names them (lib/prompt-builder.js
  // mapTask); how each is written is brief.md's and job-map.md's.
  it("the outline generator's task names the deck and the headings as the only lines the article prints as written", () => {
    expect(section(agent('outline-generator'), 'Job')).toContain("The only lines on the map that the article prints as you write them are the deck under the settled angle's headline, which the map carries word for word, and each section's heading.");
  });

  it('the session config and the record hold the guest reporters as a list, empty when the session has none', () => {
    const schemas = FILES['schemas.md'];
    expect(schemas).toContain('"guestReporters": [{"name": "<name>", "role": "<role>"}],');
    expect(schemas).toContain('"journalistFirstName", "guestReporters"}');
    expect(schemas).toMatch(/`guestReporters` holds one entry for each guest reporter, and is empty when the session has none/);
    expect(step(1)).toMatch(/each guest reporter's name and role when the session has any/);
    expect(step(1)).toMatch(/`guestReporters`/);
  });

  // The curator copies the session's facts into the record (its Job); the others read them there.
  it.each([['arc-analyzer', 'Input'], ['outline-generator', 'Input'], ['article-generator', 'Input'], ['article-validator', 'Input'], ['evidence-curator', 'Job']])(
    "%s reads each guest reporter apart (its %s)", (name, heading) => {
      expect(section(agent(name), heading)).toMatch(/each guest reporter, when the session has any/);
    });

  // Phase 18 (run 3, G2): the deep dive's rule files are the eight of phase 18, so this test, which
  // held its rows of the old craft files, holds the new table and the weave writer's fourth section.
  it("the deep dive names the eight rule files of phase 18 and the weave writer's brief and part", () => {
    const doc = DOCS['PIPELINE_DEEP_DIVE.md'];
    ['world', 'limits', 'brief', 'job-weave', 'job-map', 'job-article'].forEach((file) => {
      expect(doc).toContain(`| \`references/rules/${file}.md\` |`);
    });
    expect(doc).not.toMatch(/references\/rules\/craft-|references\/rules\/truth-rules/);
    expect(doc).not.toMatch(/Each call reads the ones the phase 4 spec's section 11 gives it/);
    expect(doc).toContain('SECTION 4: THE BRIEF AND YOUR PART (<brief>, then <job-weave>)');
  });

  it.each(Object.keys(ALL))('%s describes nothing phase 17 retires (gate 5)', (name) => {
    const old = {
      sixNames: /Kara Swisher|Casey Newton|Heather Cox Richardson|Marisa Kabas|Hunter S\. Thompson/,
      noProse: /\b(?:writes|with) no prose\b/i,
      markedOpinion: /\bmarks? as Nova's\b|\bmarked as Nova's\b|\bworded fresh\b/i,
      sharpLine: /\bevery sharp line\b/i,
      writeTheMap: /\bWrite the map as\b|\bthe evidence it carries\b|\bfrom the evidence the beat carries\b|\bwritten from the pieces of its\b/i,
      mapReadsNoVoice: /but `?craft-voice(?:\.md)?`? and|working reporter with a stake|every paragraph pulling/i,
      oneGuest: /\bthe guest reporter,? when there is one\b|"guestReporter": \{|\ba guest reporter's name and role\b/i
    };
    Object.entries(old).forEach(([what, pattern]) => expect(`${name}: ${what}: ${pattern.test(ALL[name])}`).toBe(`${name}: ${what}: false`));
  });
});

/**
 * Phase 18, run 3 (brief G1; R53, R54; the brief-and-the-limits spec, sections 7 and 10): the skill
 * reads what the pipeline reads and asks for the shapes the pipeline asks for.
 * - Each agent's text keeps what is the skill's alone, and points at its own part by file name
 *   (job-weave.md, job-map.md, job-article.md) where the pipeline's task points at its tag.
 * - No line cites a rule by number. The validator's one exception is the list of the fifteen
 *   limits by code and name, as the judges print it (LIMIT_CODES), since its `rule` field opens
 *   with a code.
 * - The arc analyzer's task opens as the weave writer's (WEAVE_TASK), less the sentence on the
 *   check that counts the words: the skill runs no such check.
 * - The article's blocks are the four the article writer is offered (WRITER_BUNDLE_SCHEMA), and
 *   the line above the headline is the theme's (display.kicker), which the console stamps by code
 *   and the skill's article generator writes as given.
 * - A section's `job` is its step; a beat carries no kind.
 * - Gate 6's words and R12's phrases are in no file of the skill.
 */
describe('the skill reads what the pipeline reads (phase 18, run 3)', () => {
  const { _testing: { WEAVE_TASK } } = require('../../lib/workflow/nodes/arc-specialist-nodes');
  const { WRITER_BUNDLE_SCHEMA } = require('../../lib/prompt-builder');
  const { LIMIT_CODES } = require('../../lib/workflow/nodes/evaluator-nodes');
  const { getThemeConfig } = require('../../lib/theme-config');
  const CHECK_SENTENCE = ' A check counts the words and says when a page runs over.';
  const LIMITS_LIST = LIMIT_CODES.map(({ code, name }) => `${code} ${name}.`).join(' ');
  const RULE_NUMBER = /\b[TC]\d{1,2}\b/;
  const OWN_PART = { 'arc-analyzer': 'job-weave.md', 'outline-generator': 'job-map.md', 'article-generator': 'job-article.md' };
  /** An agent's text outside its fenced list of rule files. */
  const prose = (name) => agent(name).replace(/\n```\n[\s\S]*?\n```\n/g, '\n');

  it("the arc analyzer's task opens as the weave writer's does, less the check the skill does not run, and points at job-weave.md", () => {
    expect(WEAVE_TASK).toContain(CHECK_SENTENCE);
    const opening = WEAVE_TASK.slice(0, WEAVE_TASK.indexOf(' <job-weave> below says')).replace(CHECK_SENTENCE, '');
    const job = section(agent('arc-analyzer'), 'Job').trimStart();
    expect(job.startsWith(opening)).toBe(true);
    expect(job).toContain('`job-weave.md` says what an angle, a thread and a connection are, and how each line is said. The fields hold them:');
  });

  it.each(Object.entries(OWN_PART))('%s points at its own part, %s, and at no other writer\'s, outside its list of rule files', (name, file) => {
    const text = prose(name);
    expect(text).toContain(`\`${file}\``);
    Object.values(OWN_PART).filter((other) => other !== file)
      .forEach((other) => expect(`${name}: ${other}: ${text.includes(other)}`).toBe(`${name}: ${other}: false`));
  });

  it.each(NAMES)('%s cites no rule by number, outside the validator\'s list of the limits', (name) => {
    const text = name === 'journalist-article-validator.md' ? FILES[name].split(LIMITS_LIST).join('') : FILES[name];
    expect(`${name}: ${(text.match(new RegExp(RULE_NUMBER.source, 'g')) || []).join(',')}`).toBe(`${name}: `);
  });

  it('the validator lists the fifteen limits by code and name, as the judges print them, once', () => {
    expect(FILES['journalist-article-validator.md'].split(LIMITS_LIST).length).toBe(2);
    expect(section(agent('article-validator'), 'Job')).toContain(LIMITS_LIST);
  });

  it("schemas.md gives the validator's rule field as a limit's code, or placed-player", () => {
    const doc = FILES['schemas.md'];
    const block = doc.slice(doc.indexOf('### Validation result')).match(/```\n([\s\S]*?)\n```/)[1];
    const rule = block.match(/"rule": "<([^>]*)>"/)[1];
    expect(rule).toMatch(/\bcode of the limit\b/);
    expect(rule).toMatch(/\bplaced-player\b/);
  });

  it("the article generator offers the four blocks the article writer is offered, and writes the bundle's printed fields", () => {
    const job = section(agent('article-generator'), 'Job');
    const offered = WRITER_BUNDLE_SCHEMA.properties.sections.items.properties.content.items.oneOf.map((block) => block.properties.type.const);
    const content = job.slice(job.indexOf('`content`'), job.indexOf('\n2. '));
    const kinds = [...content.matchAll(/\{"type": "([a-z-]+)"/g)].map((m) => m[1]);
    expect([...kinds].sort()).toEqual([...offered].sort());
    // The skill's renderer reads no ledger, so the agent writes the money tracker the console's code prints.
    const fields = [...job.matchAll(/^\d\. `([A-Za-z]+)`/gm)].map((m) => m[1]);
    expect([...fields].sort()).toEqual([...Object.keys(WRITER_BUNDLE_SCHEMA.properties), 'financialTracker'].sort());
  });

  it("the line above the headline is the theme's, which the article generator writes as given", () => {
    const kicker = getThemeConfig('journalist').display.kicker;
    expect(typeof kicker).toBe('string');
    const job = section(agent('article-generator'), 'Job');
    expect(job).toContain(`"kicker": "${kicker}"`);
    expect(job).toContain('`display.kicker` in `lib/theme-config.js`');
    expect(FILES['schemas.md']).toContain('`display.kicker` in `lib/theme-config.js`');
  });

  it("a section's job is its step, on the map's stop, in the outline generator's task and in schemas.md", () => {
    const text = FILES['SKILL.md'];
    expect(text.slice(text.indexOf('**Stop: the map.**'), text.indexOf('### 10.'))).toMatch(/\bits step\b/);
    expect(section(agent('outline-generator'), 'Job')).toContain("The job is the section's step, in one sentence of about 25 words at most.");
    expect(FILES['schemas.md']).toMatch(/A section's `job` is its step/);
  });

  it('SKILL.md names each of the rule files, and the agents read them from the folder that holds them', () => {
    fs.readdirSync(RULES_DIR).forEach((file) => expect(`${file}: ${FILES['SKILL.md'].includes(`\`${file}\``)}`).toBe(`${file}: true`));
  });

  it.each(NAMES)("%s carries none of gate 6's words and none of R12's phrases", (name) => {
    const words = [
      'craft-', 'truth-rules', 'T1 to T15', 'C1 to C19', 'reporting-mode block', 'CRAFT GUIDANCE', 'story terms',
      'the mode block', "the room's verdict", 'exposer', '<truth-rules>', '<craft-'
    ];
    const lower = FILES[name].toLowerCase();
    words.forEach((word) => expect(`${name}: ${word}: ${lower.includes(word.toLowerCase())}`).toBe(`${name}: ${word}: false`));
  });

  it("the record names a turn-in's name as the writers' record does: name given, or no name given", () => {
    const doc = FILES['schemas.md'];
    const block = doc.slice(doc.indexOf('### analysis/evidence-bundle.json')).match(/```\n([\s\S]*?)\n```/)[1];
    expect(block).toContain('"turnedIn": "no name given | name given: <name>"');
    expect(block).not.toMatch(/anonymous/i);
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
