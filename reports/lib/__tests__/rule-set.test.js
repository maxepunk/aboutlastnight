/**
 * The rule set (phase 3, task 3.1; spec docs/superpowers/specs/2026-09-30-rule-set.md).
 *
 * The rule files under .claude/skills/journalist-report/references/rules/ state the
 * world (spec sections 1, 2 and 3a), the truth rules T1 to T15 and the craft items C1
 * to C19, each once. lib/rule-set.js hands each call the files the phase 4 spec's section 11 gives
 * it, and the reporting-mode block for the session's mode.
 *
 * Task 3.8 (spec round 7): the craft items are regrouped by the writer's job into
 * eight files (story, form, material, voice, judgement, telling, cards, questions),
 * C17 to C19 are new, and a body may point at another item ("(T1)", "as T5 sets
 * out"), so the lint counts an item by its heading.
 *
 * Three parts:
 * - the loader: the map per call, the files, the throws, the stub root;
 * - a lint over the real rule files;
 * - the removed-phrase fixture's helpers, which the lint and the gate use.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  loadRuleSet, loadModeBlock, setDefaultRulesRoot, rulesFolderOf, RULE_SET_CALLS
} = require('../rule-set');
const { REMOVED_PHRASES, instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');

const RULES_ROOT = path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'rules');
const STUB_ROOT = path.join(__dirname, 'fixtures', 'rules');
/** Brief 4.13 (R14): a call names the theme whose rules folder it reads; these read the journalist's. */
const JOURNALIST = { theme: 'journalist' };

const CORE_FILES = ['world', 'truth-rules'];
/**
 * The eight craft files, in the order a call reads the ones it is given: story, form,
 * material, voice, judgement, telling, cards, questions (task 3.8).
 */
const CRAFT_FILES = [
  'craft-story', 'craft-form', 'craft-material', 'craft-voice',
  'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions'
];
const MODE_FILES = ['mode-on-site', 'mode-remote'];
const ALL_FILES = [...CORE_FILES, ...CRAFT_FILES, ...MODE_FILES];

const ALL_TRUTH = Array.from({ length: 15 }, (_, i) => `T${i + 1}`);
const ALL_CRAFT = Array.from({ length: 19 }, (_, i) => `C${i + 1}`);

/**
 * Spec section 5: the craft items each file holds, grouped by the writer's job, in the
 * order the director's read gives them (rule-text-read-2.md, section A).
 */
const CRAFT_ITEMS = {
  'craft-story': ['C1', 'C3', 'C16'],
  'craft-form': ['C2', 'C5', 'C6', 'C17', 'C18', 'C19', 'C14'],
  'craft-material': ['C8', 'C7', 'C10', 'C11'],
  'craft-voice': ['C12'],
  'craft-judgement': ['C13'],
  'craft-telling': ['C4'],
  'craft-cards': ['C9'],
  'craft-questions': ['C15']
};

/**
 * The phase 4 spec's section 11 (who reads what; it was the rule-set spec's section 8),
 * item by item: the arc writer reads neither the voice (C12), the telling (C4) nor the
 * cards (C9); the map writer reads neither the voice nor the questions (C15), since it
 * asks nothing (brief 4.6). The interweaving call is gone, and neither judge reads a craft
 * file: the story meeting's fact check (brief 4.4) and the article judge (brief 4.7a).
 */
const SPEC_SECTION_11 = {
  arc: ALL_CRAFT.filter((id) => !['C4', 'C9', 'C12'].includes(id)),
  outline: ALL_CRAFT.filter((id) => !['C12', 'C15'].includes(id)),
  article: ALL_CRAFT
};
SPEC_SECTION_11['judge-arc'] = [];
SPEC_SECTION_11['judge-article'] = [];

/** The brief's map (the phase 4 spec's section 11; the read's section C): each call's craft files, in order. */
const BRIEF_MAP = {
  arc: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions'],
  outline: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-telling', 'craft-cards'],
  article: [
    'craft-story', 'craft-form', 'craft-material', 'craft-voice',
    'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions'
  ]
};
BRIEF_MAP['judge-arc'] = [];
BRIEF_MAP['judge-article'] = [];

/** The line buildRevisionContext (node-helpers.js) prints after the director's send-back note. */
const SEND_BACK_NOTE_LINE = 'NOTE: The human reviewer has explicitly requested these changes.';

/** Every rule id ("T8", "C16") in a text, in order. */
const ruleIds = (text) => (String(text).match(/\b[TC]\d{1,2}\b/g) || []);
/** The items a text states, in order: the rule id that opens a heading ("## C16. ...", "## T8, remote: ..."). */
const itemIds = (text) => [...String(text).matchAll(/^#{1,6} ([TC]\d{1,2})\b/gm)].map((m) => m[1]);
/** The rule ids a text's bodies point at ("(T1)", "as T5 sets out"): every id outside a heading. */
const pointerIds = (text) => ruleIds(String(text).split('\n').filter((line) => !/^#{1,6} /.test(line)).join('\n'));
/** The tag names a loaded string carries, in order. */
const tagsOf = (text) => (String(text).match(/^<([a-z-]+)>$/gm) || []).map((t) => t.slice(1, -1));
const count = (haystack, needle) => haystack.split(needle).length - 1;
/** One item's text in a real rule file: its heading line, through the line before the next heading. */
const itemText = (name, id) => {
  const file = path.join(RULES_ROOT, `${name}.md`);
  const lines = (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '').split('\n');
  const start = lines.findIndex((line) => new RegExp(`^#{1,6} ${id}\\b`).test(line));
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && /^#{1,6} /.test(line));
  return lines.slice(start, end < 0 ? lines.length : end).join('\n');
};

/** A temporary copy of the stub root, to break one file in. */
function tempStubRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-set-'));
  for (const name of ALL_FILES) fs.copyFileSync(path.join(STUB_ROOT, `${name}.md`), path.join(dir, `${name}.md`));
  return dir;
}

describe('the loader', () => {
  // Brief 4.13 (R14): there is no default folder; the journalist's config names its skill's.
  it('reads the journalist skill\'s rules folder for the journalist', () => {
    expect(rulesFolderOf('journalist')).toBe(path.resolve(RULES_ROOT));
  });

  // Phase 4 (brief 4.6): the outline judge's call went with it.
  it('serves exactly the five calls of the plan', () => {
    expect(Object.keys(RULE_SET_CALLS).sort()).toEqual(Object.keys(BRIEF_MAP).sort());
  });

  it.each(Object.keys(BRIEF_MAP))('%s: the core is the world then the truth rules, each in its own tag', (call) => {
    const { core } = loadRuleSet(call, { root: STUB_ROOT });
    expect(core).toBe('<world>\nSTUB world\n</world>\n\n<truth-rules>\nSTUB truth-rules\n</truth-rules>');
  });

  it.each(Object.keys(BRIEF_MAP))('%s: the craft files are the map\'s, in its order', (call) => {
    const { craft } = loadRuleSet(call, { root: STUB_ROOT });
    expect(tagsOf(craft)).toEqual(BRIEF_MAP[call]);
    expect(craft).toBe(BRIEF_MAP[call].map((name) => `<${name}>\nSTUB ${name}\n</${name}>`).join('\n\n'));
  });

  it.each(Object.keys(SPEC_SECTION_11))('%s: the real files give exactly the craft items spec section 11 lists, each once', (call) => {
    const { core, craft } = loadRuleSet(call, JOURNALIST);
    // An item is counted by its heading; a body may point at an item another file states.
    const crafted = itemIds(craft).filter((id) => id.startsWith('C'));
    expect(crafted.sort()).toEqual([...SPEC_SECTION_11[call]].sort());
    // The core states no craft item: every call reads all of the world and the truth rules.
    expect(itemIds(core).filter((id) => id.startsWith('C'))).toEqual([]);
  });

  it.each(Object.keys(BRIEF_MAP))('%s: the real files are read once each, each in its own tag', (call) => {
    const { core, craft } = loadRuleSet(call, JOURNALIST);
    expect(tagsOf(core)).toEqual(CORE_FILES);
    expect(tagsOf(craft)).toEqual(BRIEF_MAP[call]);
    for (const name of [...CORE_FILES, ...BRIEF_MAP[call]]) {
      expect(`${call}: ${name}: ${count(`${core}\n${craft}`, `</${name}>`)}`).toBe(`${call}: ${name}: 1`);
    }
  });

  it.each(ALL_FILES)('the real %s.md exists and is not empty', (name) => {
    const file = path.join(RULES_ROOT, `${name}.md`);
    expect(`${name}.md: ${fs.existsSync(file)}`).toBe(`${name}.md: true`);
    expect(fs.readFileSync(file, 'utf8').trim().length).toBeGreaterThan(0);
  });

  it('the rules folder holds the twelve rule files and nothing else', () => {
    // A retired file left on disk invites a loader or a person to read it again (the
    // integrator's ruling: deleted, not archived).
    expect(fs.readdirSync(RULES_ROOT).sort()).toEqual(ALL_FILES.map((name) => `${name}.md`).sort());
  });

  it('throws on a call it does not know, naming the calls it does', () => {
    expect(() => loadRuleSet('revision', { root: STUB_ROOT })).toThrow(/revision.*arc.*outline/s);
  });

  it('throws naming every missing or empty file a call needs', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'craft-story.md'));
    fs.writeFileSync(path.join(root, 'truth-rules.md'), '  \n');
    expect(() => loadRuleSet('arc', { root })).toThrow(/truth-rules\.md.*craft-story\.md/s);
  });

  it('does not throw for a broken file the call does not read', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'craft-voice.md'));
    expect(() => loadRuleSet('outline', { root })).not.toThrow();
    expect(() => loadRuleSet('article', { root })).toThrow(/craft-voice\.md/);
  });
});

describe('the mode block', () => {
  // Wrapped as loadRuleSet wraps each file (review of 3.1, finding 4): the block sits in
  // the middle of a system prompt, and its closing tag ends it, so the text after it is
  // not read as part of T8.
  it.each(['on-site', 'remote'])('%s: returns the mode file\'s text in one tag named after the file', (mode) => {
    expect(loadModeBlock(mode, { root: STUB_ROOT })).toBe(`<mode-${mode}>\nSTUB mode-${mode}\n</mode-${mode}>`);
  });

  it('the two real blocks differ, and each carries T8', () => {
    const onSite = loadModeBlock('on-site', JOURNALIST);
    const remote = loadModeBlock('remote', JOURNALIST);
    expect(onSite).not.toBe(remote);
    // Task A of phases 14 and 15: the on-site block's body points at T12 and T8 (Nova's
    // lines in prose, no side in the verdict), so each block states T8 as its one item and
    // its body points only at items the set states (the lint below).
    expect(itemIds(onSite)).toEqual(['T8']);
    expect(itemIds(remote)).toEqual(['T8']);
    expect(ruleIds(onSite)).toEqual(['T8', 'T12', 'T8']);
    expect(ruleIds(remote)).toEqual(['T8']);
  });

  it('throws on a mode it does not know', () => {
    expect(() => loadModeBlock('hybrid', { root: STUB_ROOT })).toThrow(/hybrid/);
  });

  it('throws naming a missing mode file', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'mode-remote.md'));
    expect(() => loadModeBlock('remote', { root })).toThrow(/mode-remote\.md/);
  });
});

// Brief 4.13 (R14): the stand-in is read in place of the folder each call's theme names.
describe('the default root, which a test can point at the stubs', () => {
  afterEach(() => setDefaultRulesRoot(null));

  it('serves the stubs to every call that passes no root, and returns the previous root', () => {
    expect(setDefaultRulesRoot(STUB_ROOT)).toBeNull();
    expect(loadRuleSet('arc', JOURNALIST).core).toContain('STUB world');
    expect(loadModeBlock('remote', JOURNALIST)).toBe('<mode-remote>\nSTUB mode-remote\n</mode-remote>');
    expect(setDefaultRulesRoot(STUB_ROOT)).toBe(path.resolve(STUB_ROOT));
  });

  it('goes back to the skill\'s folder on null', () => {
    setDefaultRulesRoot(STUB_ROOT);
    setDefaultRulesRoot(null);
    expect(loadModeBlock('remote', JOURNALIST)).not.toContain('STUB mode-remote');
  });

  it('stands in for a theme\'s folder, and gives no rules to a theme that names none', () => {
    setDefaultRulesRoot(STUB_ROOT);
    expect(() => loadRuleSet('arc', { theme: 'detective' })).toThrow(/"detective" names no rules folder/);
    expect(() => loadModeBlock('remote')).toThrow(/theme is required/);
  });
});

/**
 * The lint over the real rule files (the brief's tests). Model-facing text: each rule
 * once, no em-dash, Nova never gendered, nothing on the removed list, and the examples
 * carry placeholders, never the old examples' accounts or sums.
 */
describe('the rule files', () => {
  // Read here, not in a test: a missing file fails the tests that need it, one by one.
  const read = (name) => {
    const file = path.join(RULES_ROOT, `${name}.md`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  };
  const files = Object.fromEntries(ALL_FILES.map((name) => [name, read(name)]));
  const T8_HOMES = ['truth-rules', 'mode-on-site', 'mode-remote'];

  it('state each of T1 to T15 and C1 to C19 as an item exactly once, T8 once in the truth rules and once in each mode file', () => {
    const counts = {};
    for (const [name, text] of Object.entries(files)) {
      for (const id of itemIds(text)) {
        const key = id === 'T8' ? `T8@${name}` : id;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    const want = Object.fromEntries([...ALL_TRUTH, ...ALL_CRAFT].filter((id) => id !== 'T8').map((id) => [id, 1]));
    for (const home of T8_HOMES) want[`T8@${home}`] = 1;
    expect(counts).toEqual(want);
  });

  it('name a rule in a body only to point at an item the set states', () => {
    // Round 7's text points across files ("(T1)", "as T5 sets out", "(C16)"): each
    // pointer names one of T1 to T15 or C1 to C19, never a retired or unknown id.
    const items = new Set([...ALL_TRUTH, ...ALL_CRAFT]);
    for (const [name, text] of Object.entries(files)) {
      const unknown = pointerIds(text).filter((id) => !items.has(id));
      expect(`${name}: ${unknown.join(',')}`).toBe(`${name}: `);
    }
  });

  it('put each item in its file, in the order the read gives', () => {
    const where = {
      world: [],
      'truth-rules': ALL_TRUTH,
      ...CRAFT_ITEMS,
      'mode-on-site': ['T8'],
      'mode-remote': ['T8']
    };
    expect(Object.keys(where).sort()).toEqual([...ALL_FILES].sort());
    for (const [name, ids] of Object.entries(where)) {
      expect(`${name}: ${itemIds(files[name]).join(',')}`).toBe(`${name}: ${ids.join(',')}`);
    }
  });

  it.each(ALL_FILES)('%s.md has no em-dash', (name) => {
    expect(files[name]).not.toMatch(/—/);
  });

  it.each(ALL_FILES)('%s.md carries nothing on the removed list, and never genders Nova', (name) => {
    expect(findRemovedPhrases(files[name])).toEqual([]);
  });

  it.each(ALL_FILES)('%s.md names none of the old examples\' accounts, sums or sessions', (name) => {
    // The accounts the coverage pass found in the retired files' examples
    // (coverage-journalist-craft-1.md section 3; -2.md X-2).
    for (const account of ['ChaseT', 'Gorlan', 'Offbeat', 'John D.', 'Dominic', 'Motherofmen']) {
      expect(`${name}: ${account}: ${files[name].includes(account)}`).toBe(`${name}: ${account}: false`);
    }
    expect(files[name]).not.toMatch(/\$\s?\d/);
    expect(files[name]).not.toMatch(/\b\d{6,7}\b/);
    expect(files[name]).not.toMatch(/\bDec(ember)? 21\b/);
  });

  it('state when an exposure is anonymous only with both of T6\'s conditions, wherever they state it', () => {
    // T6 lifts anonymity on either of two records: a name in the evidence log, or the
    // director's own words recording who turned the memory in (their notes, corrections,
    // accusation or meeting answers; the director's ruling, 2026-10-04). The mode files restate the
    // rule beside T6 (plan review I6), so a copy that carries only the first condition
    // would tell a judge that a credit taken from the notes breaks anonymity.
    const statements = [];
    for (const [name, text] of Object.entries(files)) {
      const body = text.split('\n').filter((line) => !/^#{1,6} /.test(line)).join('\n');
      for (const sentence of body.split(/(?<=[.!?])\s+/)) {
        if (/anonymous unless/i.test(sentence)) statements.push({ name, sentence });
      }
    }
    expect(statements.map(({ name }) => name).sort()).toEqual(['mode-on-site', 'mode-remote', 'truth-rules']);
    for (const { name, sentence } of statements) {
      expect(`${name}: ${/\bevidence log\b/.test(sentence)}`).toBe(`${name}: true`);
      expect(`${name}: ${/the director's own words record who turned the memory in/.test(sentence)}`).toBe(`${name}: true`);
    }
  });

  it('open the world with the purpose of the article, without its length', () => {
    expect(files.world).toMatch(/how your choices shaped the official story/);
    expect(files.world).not.toMatch(/1,500/);
  });

  it('come to less than half the eight craft files they replace', () => {
    // The eight journalist craft files at bad9781 (writing-principles, anti-patterns,
    // character-voice, evidence-boundaries, narrative-structure, section-rules,
    // editorial-design, formatting): 100,005 characters. 3.2 deletes them, so the
    // figure is fixed here.
    const EIGHT_FILES_CHARACTERS = 100005;
    const size = Object.values(files).reduce((sum, text) => sum + text.length, 0);
    expect(size).toBeLessThan(EIGHT_FILES_CHARACTERS / 2);
  });
});

/**
 * Phase 4, task 4.1: the rule text the director approved on 2026-10-03
 * (rule-text-read-3.md in the phase 4 workspace, sections A and B). Phase 4 moves the
 * stages' jobs: the story meeting settles the story, the map lays it across the
 * sections, and the article writer writes all the prose. Each changed item carries one
 * of the read's sentences inside its own item, and C8 and C15 carry the read's titles.
 * The lint above holds the rest: each item once, every pointer, no em-dash, no gendered
 * Nova and nothing on the removed list.
 */
describe('the items phase 4 rewrites (task 4.1)', () => {
  it.each([
    // Task 3A (phase 4b piece 3's read, 2026-10-06) rewrote C1's and C16's sentences these
    // rows pinned, on the angles and the threads' roles; its block below pins the new ones.
    ['C2', 'craft-form', 'The map decides, from the settled story, which sections exist, their order and their headings.'],
    ['C4', 'craft-telling', "The article writer gives each beat the sentences its job needs, a supporting player's beat a line or two and a decisive scene more, and aims at the map's expected length: a session that gives less makes a shorter article, never a padded one."],
    // Task 1A (phase 4b's read, 2026-10-05) rewrote the sentence this row pinned, on where
    // the map places each line, and pins it in its own block below; this row pins the
    // phase 4 read's sentence that stands.
    ['C8', 'craft-material', 'The article carries each line word for word and in the right mouth (T12).'],
    ['C7', 'craft-material', 'The map places every player in a beat, through something the record shows they did or said, in the section where it matters, never as a roll call.'],
    ['C15', 'craft-questions', "The director answers each in its own box at the story meeting, and the answer travels with its question to every later writer as the director's words."],
    // Task A of phases 14 and 15 (2026-10-09) rewrote the T1 sentence this row pinned, so the
    // director's words take in every note they send at a stop; its block below pins it.
    // T2 gained the desk clause on the director's ruling (2026-10-04): the desk edits come first.
    ['T2', 'truth-rules', "The map places each alternative theory the room debated, a line each, and the article reports every one the map carries, as the director's desk edits leave it; a theory the director strikes from the map or cuts at the desk stays out."],
    ['T5', 'truth-rules', 'An entry that looks like a mistake is raised as a question at the story meeting (C15); with no answer, a later writer leaves that entry out of print.'],
    ['T9', 'truth-rules', "A pronoun the director's own words give that player counts as the answer; with none, a later writer uses the player's name in place of a pronoun."]
  ])('%s, in %s.md, carries the approved sentence', (id, name, sentence) => {
    expect(itemText(name, id)).toContain(sentence);
  });

  it.each([
    ['C8', 'craft-material', "## C8. The director's lines: weighed by the arc writer, chosen by the map"],
    ['C15', 'craft-questions', '## C15. Questions to the director, at the story meeting']
  ])('%s, in %s.md, carries the approved title', (id, name, heading) => {
    expect(itemText(name, id).split('\n')[0]).toBe(heading);
  });

  // The director's change of 2026-10-03, on thin notes: the article is capped at about
  // 1,500 words, and the C4 clause pinned above aims it at the map's expected length.
  it('C4 caps the article at about 1,500 words', () => {
    expect(itemText('craft-telling', 'C4')).toContain('The article runs to about 1,500 words at most.');
  });
});

/**
 * Phase 4b, piece 1, task 1A: the rule text the director approved on 2026-10-05
 * (rule-text-read.md in the phase 4b workspace; the piece 1 spec's section 8). The weave
 * and the map stay at the level of the story, with the evidence under each line: C16 sets
 * that out for the threads, the connections and the convergence, C2 for the beats, C8 for
 * the director's lines and C9 for the cards. Each changed item carries one of the read's
 * new sentences inside its own item. The lint above holds the rest: each item once, every
 * pointer, no em-dash, no gendered Nova and nothing on the removed list.
 */
describe('the items phase 4b rewrites (task 1A)', () => {
  it.each([
    // Task 3A rewrote the C16 sentence this row pinned, for the angles, and task 4A the C2
    // sentence, for the summary and the order; their blocks below pin them.
    ['C8', 'craft-material', 'The map chooses, from the notes and the record, the lines the settled story needs, and places each as evidence under the beat where it makes sense, a line from the room under the moment it was said.'],
    ['C9', 'craft-cards', "The map chooses the cards with the story: it marks each beat whose evidence prints as a card, and names the card's document under that beat."]
  ])('%s, in %s.md, carries the approved sentence', (id, name, sentence) => {
    expect(itemText(name, id)).toContain(sentence);
  });
});

/**
 * Phase 4b, piece 3, task 3A: the rule text the director approved on 2026-10-06
 * (rule-text-read.md in the piece 3 workspace; the piece 3 spec's section 11). The arc
 * writer pitches two or three angles over one shared set of threads, and the director
 * settles the story by picking one: C1 says how the thesis is pitched, C16 how the threads
 * make each angle with no main thread and no roles, and C15 how the questions are asked,
 * once per subject. Each changed item carries one of the read's new sentences inside its
 * own item. The lint above holds the rest: each item once, every pointer, no em-dash, no
 * gendered Nova and nothing on the removed list.
 */
describe('the items phase 4b piece 3 rewrites (task 3A)', () => {
  it.each([
    ['C1', 'craft-story', 'The arc writer pitches the thesis at the story meeting as two or three angles, each a different story the article could tell.'],
    ['C1', 'craft-story', 'The director settles the thesis by picking an angle and adjusting it, and every later writer works from the settled story.'],
    ['C16', 'craft-story', "The arc writer weighs each thread by how it bears on the room's verdict, and that weight decides which angles use it and where in each it falls."],
    ['C16', 'craft-story', "Each angle's story, question and ending, each thread, each connection and every beat on the map are said in plain words, with people's names, and with no quotation from the record, no figure, no clock time and no document id."],
    ['C15', 'craft-questions', 'It asks once about each subject, each player, each pronoun and each figure, however many threads the answer touches.']
  ])('%s, in %s.md, carries the approved sentence', (id, name, sentence) => {
    expect(itemText(name, id)).toContain(sentence);
  });

  // The read retires the main thread, the roles and the left-out thread's reason from C1 and C16.
  it.each([
    'main thread', 'grounds it', 'complicates it', 'mirrors it', 'carries it forward', 'left out, with one line on why'
  ])('C1 and C16 no longer say "%s"', (phrase) => {
    const text = `${itemText('craft-story', 'C1')}
${itemText('craft-story', 'C16')}`.toLowerCase();
    expect(text).not.toContain(phrase);
  });
});

/**
 * Phase 4b, piece 4, task 4A: the rule text the director approved on 2026-10-07
 * (rule-text-read.md in the piece 4 workspace; the piece 4 spec's section 12). Each beat on
 * the map is also summed up in one sentence saying what the article tells there, and the
 * order of a section's beats is the map's: C2 says what a beat is, and C16 how the article
 * writer tells the beats, in the map's order, each as its sentence says. Each changed item
 * carries one of the read's new sentences inside its own item. The lint above holds the
 * rest: each item once, every pointer, no em-dash, no gendered Nova and nothing on the
 * removed list.
 */
describe('the items phase 4b piece 4 rewrites (task 4A)', () => {
  it.each([
    ['C2', 'craft-form', "A section's beats are the moves of its story, in the order the article tells them."],
    ['C2', 'craft-form', 'The article writer tells each beat as its sentence says, from its evidence, in its own words.'],
    ['C16', 'craft-story', "It tells each beat as the beat's sentence says, from the evidence the beat carries, and cites it."]
  ])('%s, in %s.md, carries the approved sentence', (id, name, sentence) => {
    expect(itemText(name, id)).toContain(sentence);
  });

  // The read takes the order of the beats out of the article writer's list: the order is the map's.
  it('C16 no longer gives the article writer the order of the beats within each section', () => {
    expect(itemText('craft-story', 'C16')).not.toContain('the order of the beats within each section');
  });
});

/**
 * Phases 14 and 15, task A: the rule text the director approved on 2026-10-09
 * (rule-text-read.md in the phases' workspace; the spec's section 13). The article sits in
 * its world: its authors in the story (Nova on site a character in the room, remote no part
 * in it, in both no side in the verdict; the guest reporter when there is one), only what
 * exists in the world (a character sheet backs only its backstory), the game's rules off the
 * page, the account-name rule the director set, opinion and a theory past the room, the
 * closing with no forced form, the time of day the session's facts give, and every note the
 * director sends at a stop among their words. Each changed item carries one of the read's
 * new sentences inside its own item, and world.md its new paragraphs. The lint above holds
 * the rest: each item once, every pointer, no em-dash, no gendered Nova and nothing on the
 * removed list.
 */
describe('the items phases 14 and 15 rewrite (task A)', () => {
  const world = fs.readFileSync(path.join(RULES_ROOT, 'world.md'), 'utf8');

  it.each([
    "**The investigation** is the game itself, in the warehouse, the day after the party. It cannot begin before 5 AM: Marcus died around 4 AM. A session played from 5 PM on runs in the morning in the story, and one played earlier runs in the afternoon, at the hours it was played; the session's facts say when this one ran.",
    "Partway through the investigation, Blake gathers everyone to take the room's temperature;",
    'Nova takes no side in the verdict and no part in the statement.',
    'the reporting-mode block says which for this session, and what part Nova took in the room.',
    "- **A guest reporter**, when the session has one, shares Nova's byline for what they contributed. A memory they turned in under their name is their reporting for this article. Many sessions have none.",
    'Nova writes that evening, with the follow-up reporting of the hours after it.',
    'Everything above is what Nova knows, and the players know it too, because they played it. The article never explains it to them (T14).',
    "The players' character sheets are the one exception: each is a player's private instructions for their character, which no one in the world could hand Nova.",
    "Their backstory, what happened before the party and who people are to each other, is true in the world, and T1 says how Nova uses it.",
    "Together they make the investigation's timeline in the record: what was going public, set against what was being erased."
  ])('world.md carries the approved text: %s', (text) => {
    expect(world).toContain(text);
  });

  it.each([
    ['T1', 'truth-rules', "A player's character sheet backs only its backstory: Nova may report and quote it as evidence, never names the sheet as its source, and never uses its suspected motive, its goals or its instructions to the player."],
    ['T1', 'truth-rules', "What happened or was said in the room, as the director's own words record it (their notes and corrections, the accusation, their answers at the story meeting, and every note they send at a stop), Nova reports as the reporting mode sets out (T8), with each quoted line in its speaker's mouth (T12)."],
    ['T1', 'truth-rules', "A note that gives the article a direction, such as a theory to pursue, is the director's direction, not a fact: Nova writes it as Nova's own reading."],
    ['T1', 'truth-rules', "or an opinion Nova commits to and marks as Nova's"],
    ['T1', 'truth-rules', "A theory may reach past the room, toward where the epilogue takes the world, and stays Nova's."],
    ['T4', 'truth-rules', "Otherwise Nova may wonder about the character an account is named after, or read the name as someone's attempt to frame them, as Nova's opinion or a question"],
    ['T4', 'truth-rules', "Totals show where the investigation's money went."],
    ['T5', 'truth-rules', "The ledger holds the investigation's payments for erasure. Money from before the party, such as an investment, a fortune or an inheritance, is the characters' backstory, from the documents."],
    ['T6', 'truth-rules', 'their answers at the story meeting, or a note they sent at a stop.'],
    ['T7', 'truth-rules', "The investigation is told at the time of day the session's facts give, morning or afternoon, and never called by the other."],
    ['T8', 'truth-rules', 'Nova takes no side in the verdict: Nova never votes, joins the room\'s accusation or exposes a memory. "Uninterested" is about what the room decides, not the story, which Nova works.'],
    ['T8', 'truth-rules', 'It also says where Nova stood and what part Nova took in the room.'],
    ['T14', 'truth-rules', 'Nor does the article explain how the game works: the players played it.'],
    ['C4', 'craft-telling', 'Where the record stops on something that matters, Nova reasons inside the world (T14) and lets it lead into the suspicion, the opinion or the question it raises.'],
    ['C12', 'craft-voice', "Nova commits to a reading: where the session gives reason, Nova offers a theory as Nova's own opinion, and it may reach past the room toward where the epilogue takes the world (T1)."],
    ['C12', 'craft-voice', "tells each player's choices in their character's terms, and takes a player's suspicion as a lead to follow, not as their belief alone."],
    ['C11', 'craft-material', "A guest reporter's name on a turn-in is their reporting for this article, and the article credits it that way;"],
    ['C13', 'craft-judgement', "it aims where this session's evidence and its epilogue lead, such as NeurAI, its board, its technology and the business of buying memories, written as Nova's suspicion or opinion (T1, T5)."],
    ['C2', 'craft-form', 'A section whose job is done elsewhere is dropped, with one line on why. The story is told through every section'],
    ['C14', 'craft-form', "It may look ahead to what is still at stake, who stands to profit or what Nova is chasing next, or close on the theory the article has built, whichever this session's story and its epilogue make strongest."],
    ['C9', 'craft-cards', "Memories come first; a document card quotes only the passage that matters, and no card prints a player's character sheet (T1)."]
  ])('%s, in %s.md, carries the approved sentence', (id, name, sentence) => {
    expect(itemText(name, id)).toContain(sentence);
  });

  it('C14 carries the approved title', () => {
    expect(itemText('craft-form', 'C14').split('\n')[0]).toBe('## C14. The closing lands where the story leads');
  });

  // The read retires these wordings from the rule files (the spec's section 15; R12).
  it.each([
    ['truth-rules', 'is never one of the room'],
    ['truth-rules', 'from outside its choices'],
    ['truth-rules', 'is never a reason to suspect its namesake'],
    ['truth-rules', 'on the morning clock'],
    ['truth-rules', "the morning's"],
    ['truth-rules', 'motive background'],
    ['mode-on-site', 'for being there and for nothing more'],
    ['craft-telling', 'Nova says so in one plain line'],
    ['craft-voice', "One honest line about Nova's own motive"],
    ['craft-voice', "the morning's"],
    ['craft-form', 'what is still open often belongs in the closing'],
    ['craft-form', 'The closing looks ahead from the thesis'],
    ['world', 'this morning, in the warehouse'],
    ['world', 'through the morning']
  ])('%s.md no longer says "%s"', (name, phrase) => {
    const text = fs.readFileSync(path.join(RULES_ROOT, `${name}.md`), 'utf8');
    expect(text).not.toContain(phrase);
  });
});

describe('the removed-phrase fixture', () => {
  it('is a list of strings and patterns', () => {
    expect(REMOVED_PHRASES.length).toBeGreaterThan(0);
    for (const entry of REMOVED_PHRASES) {
      expect(typeof entry === 'string' || entry instanceof RegExp).toBe(true);
    }
  });

  it('starts with the murder framing exactly as the spec names it', () => {
    for (const phrase of ['the murder victim', 'hint at the murder', 'the murder revelation', 'who killed Marcus']) {
      expect(REMOVED_PHRASES).toContain(phrase);
    }
  });

  it('finds the brief\'s phrase and today\'s remote block: exposures as tips', () => {
    expect(findRemovedPhrases('Remember: exposures reached you as tips.')).toHaveLength(1);
    expect(findRemovedPhrases('Every exposure, observation, and the verdict reached you as tips from people who were there')).toHaveLength(1);
  });

  it('finds Nova with a gendered pronoun in one clause, and nothing across clauses', () => {
    expect(findRemovedPhrases('Nova acknowledges her own motivations.')).toHaveLength(1);
    expect(findRemovedPhrases('She told Nova everything.')).toHaveLength(1);
    expect(findRemovedPhrases('Nova reported it. She left.')).toEqual([]);
    expect(findRemovedPhrases('NovaNews ran it and he denied it.')).toEqual([]);
    expect(findRemovedPhrases('Nova monitored the room, and Marcus kept his secrets.')).toEqual([]);
  });

  it('matches its strings in any case', () => {
    expect(findRemovedPhrases('Marcus, The Murder Victim, was found')).toHaveLength(1);
  });

  it('scans instruction text only: the director\'s words and <RECORD> are stripped', () => {
    const render = [
      'Write the article.',
      '<DIRECTOR_NOTES>\nafter the murder investigation blows over, one more went to the black market\n</DIRECTOR_NOTES>',
      '<DIRECTOR_CORRECTIONS>\n- who killed Marcus was the question\n</DIRECTOR_CORRECTIONS>',
      '<DIRECTOR_ACCUSATION>\nThe murder victim was poisoned by Vic.\n</DIRECTOR_ACCUSATION>',
      '<EPILOGUE>\nthe murder revelation came at noon\n</EPILOGUE>',
      '<RECORD>\n<document id="x">the shape of the silence</document>\n</RECORD>',
      '<QUOTE_BANK>\nA model made this index.\n- Vic: "the murder victim had it coming"\n</QUOTE_BANK>',
      `HUMAN FEEDBACK (HIGHEST PRIORITY):\nCut the resolution cascade line.\n\n${SEND_BACK_NOTE_LINE}`,
      '- p1.jpg: The director\'s description, word for word: Nova and her camera'
    ].join('\n\n');
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain('Write the article.');
    expect(text).toContain('A model made this index.');
    expect(text).toContain('<RECORD></RECORD>');
    expect(text).toContain(SEND_BACK_NOTE_LINE);
  });

  it('still finds a removed phrase in the instruction text around them', () => {
    const render = '<DIRECTOR_NOTES>\nnotes\n</DIRECTOR_NOTES>\n\nMarcus is the murder victim.';
    expect(findRemovedPhrases(instructionText(render))).toEqual(['the murder victim']);
  });
});

/**
 * instructionText reads only the pipeline's own instructions (the integrator's ruling
 * on review finding 3 of 3.1). Besides the director's words and <RECORD>, it strips the
 * model output a prompt carries as data (a previous version shown in a rework, the
 * approved outline, the arcs and the rest of the arc analysis, the plans, the content
 * bundle, the whiteboard reading) and every paragraph of the director's send-back note.
 * It keeps the pipeline's label lines, those inside <DIRECTOR_GUIDANCE> included, so
 * they are scanned.
 *
 * The real builders make the renders here, so a reworded label fails these tests
 * instead of letting a scan read the director's words or skip the pipeline's.
 */
describe('instructionText: the pipeline\'s own instructions only', () => {
  const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
  const { buildDirectorGuidanceSection, PromptBuilder } = require('../prompt-builder');

  const NOTE = [
    'First paragraph: lead with the money.',
    'Second paragraph: drop the line about the murder victim.',
    'Third paragraph: nobody asked who killed Marcus.'
  ].join('\n\n');

  it('strips every paragraph of the director\'s send-back note, up to the pipeline\'s NOTE line', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'outline', revisionCount: 0, validationResults: null, previousOutput: null, humanFeedback: NOTE, round: 2
    });
    expect(contextSection).toContain('Third paragraph');
    const text = instructionText(contextSection);
    for (const paragraph of NOTE.split('\n\n')) expect(text).not.toContain(paragraph);
    expect(text).toContain('HUMAN FEEDBACK (HIGHEST PRIORITY):');
    expect(text).toContain(SEND_BACK_NOTE_LINE);
    expect(text).toContain('Address human feedback FIRST');
    expect(findRemovedPhrases(text)).not.toContain('the murder victim');
    expect(findRemovedPhrases(text)).not.toContain('who killed Marcus');
  });

  it('strips the previous version a rework shows, and keeps its header and its end', () => {
    const { previousOutputSection } = buildRevisionContext({
      phase: 'outline', revisionCount: 1, validationResults: null,
      previousOutput: { lede: { hook: 'Marcus, the murder victim, sold the company.' } }, humanFeedback: null
    });
    const text = instructionText(previousOutputSection);
    expect(text).not.toContain('the murder victim');
    expect(text).toMatch(/^PREVIOUS OUTLINE OUTPUT\b/m);
    expect(text).toMatch(/^END PREVIOUS OUTPUT$/m);
  });

  // Brief 4.7b: the article writer prints the map in <STORY_MAP>, where it printed the
  // approved outline under APPROVED OUTLINE.
  it('strips a <STORY_MAP> carrying "the murder victim", and still scans the text after it', () => {
    const render = [
      '<STORY_MAP>',
      'The story map as the director left it.',
      JSON.stringify({ headline: 'Marcus, the murder victim, sold the company.', sections: [] }, null, 2),
      '</STORY_MAP>',
      '',
      'Write the article from the settled weave and the story map above.'
    ].join('\n');
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain('<STORY_MAP></STORY_MAP>');
    expect(text).toContain('Write the article from the settled weave and the story map above.');
    expect(findRemovedPhrases(instructionText(`${render}\nRemember who killed Marcus.`))).toEqual(['who killed Marcus']);
  });

  // Brief 4.7c: the section carries the standing notes alone. The arc stop's guidance and
  // its label ("It outranks the craft rules above where they conflict:") went, and the
  // parser reads the one label left, the standing-notes preamble.
  describe('<DIRECTOR_GUIDANCE>', () => {
    const NOTES = [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Ask who killed Marcus.\nThen ask why.' },
      { gate: 'outline', kind: 'approval', round: 1, text: 'Keep the shape of the silence.' }
    ];
    const section = buildDirectorGuidanceSection(NOTES);

    it('strips the director\'s notes, every line of them', () => {
      const text = instructionText(section);
      expect(findRemovedPhrases(text)).toEqual([]);
      for (const words of ['Ask who killed', 'Then ask why.', 'Keep the shape']) {
        expect(text).not.toContain(words);
      }
    });

    it('keeps the pipeline\'s label lines, the standing-notes preamble', () => {
      const text = instructionText(section);
      expect(text).toContain('Standing notes the director gave at earlier stops, in order.');
      expect(text).toContain('Keep honoring each in what you write now.');
    });

    it('scans the preamble: a removed phrase there is found', () => {
      const preamble = section.replace('Keep honoring each', 'Keep honoring who killed Marcus and each');
      expect(findRemovedPhrases(instructionText(preamble))).toEqual(['who killed Marcus']);
    });

    it('a block in the retired guidance shape, with no standing-notes preamble, cannot be read, and says so', () => {
      const retired = '<DIRECTOR_GUIDANCE>\nThe director reviewed the arcs and asks for this emphasis. It outranks the craft rules above where they conflict:\n\nLead with the money.\n</DIRECTOR_GUIDANCE>';
      expect(() => instructionText(retired)).toThrow(/Standing notes the director gave at earlier stops/);
    });
  });

  it('strips the whiteboard reading and keeps its labels, in the shape 3.5 prints too', () => {
    const { renderWhiteboardConnections } = require('../prompt-renderers/director-words-renderer');
    const today = renderWhiteboardConnections({ suspectsExplored: ['Vic'], connections: [], notes: ['the murder victim?'], namesFound: [] });
    // The shape task 3.5 prints (the integrator merges it into this branch).
    const regions = [
      '### The Whiteboard (a model\'s reading of the photo)',
      'A model\'s reading of the photo of the whiteboard where the room kept its working notes during the investigation: context for how the room reasoned toward its verdict, not a source.',
      '**Regions, each under the heading the players wrote:**',
      '- "SUSPECTS" (top left): Vic, the murder victim',
      '**Lines drawn:** []',
      '**Other writing:** ["who killed Marcus"]'
    ].join('\n');
    for (const reading of [today, regions]) {
      const text = instructionText(`${reading}\n\n- a pipeline list line that stays`);
      expect(findRemovedPhrases(text)).toEqual([]);
      expect(text).toMatch(/^### (Whiteboard Connections|The Whiteboard)/);
      expect(text).toContain('- a pipeline list line that stays');
    }
    expect(instructionText(regions)).toContain('A model\'s reading of the photo of the whiteboard');
    expect(instructionText(regions)).toContain('**Other writing:**');
  });

  it('strips the model output every writer, reworker and judge prints as data', async () => {
    const { reworkFixtureState } = require('./fixtures/rework-state');
    const { stubThemeLoader } = require('./fixtures/render-writers');
    const { PHASE_REQUIREMENTS } = require('../theme-loader');
    const { _testing: arcs } = require('../workflow/nodes/arc-specialist-nodes');
    const { _testing: judges } = require('../workflow/nodes/evaluator-nodes');
    const { settledWeaveOf } = require('../prompt-renderers/settled-weave');
    const MODEL = 'MODEL-OUTPUT-SENTINEL';

    const state = reworkFixtureState('journalist');
    // Phase 4 (brief 4.4): the weave the arc reworker and the fact check print back, and
    // (brief 4.6) the map writer prints first as the settled weave. The old arcs went (R4).
    // Piece 3 (brief 3B): the story is the first angle's, the angle the settled weave prints.
    state.weave = { ...state.weave, angles: state.weave.angles.map((angle, i) => (i === 0 ? { ...angle, story: `${MODEL} story` } : angle)) };
    // Brief 4.6: the map, which the article writer prints back
    state.outline = { ...state.outline, headline: `${MODEL} headline of the map` };
    state.contentBundle = { headline: { main: `${MODEL} headline` }, sections: [] };
    state.playerFocus = {
      ...state.playerFocus, whiteboardContext: { ...state.playerFocus.whiteboardContext, notes: [`${MODEL} whiteboard`] }
    };

    const builder = new PromptBuilder(
      stubThemeLoader(PHASE_REQUIREMENTS), 'journalist', state.sessionConfig,
      state.canonicalCharacters, state.characterData.characters
    );
    const join = ({ systemPrompt, userPrompt }) => `${systemPrompt}\n${userPrompt}`;
    const { contextSection, previousOutputSection } = buildRevisionContext({
      phase: 'arcs', outputName: 'weave', revisionCount: 0, validationResults: null, previousOutput: state.weave, humanFeedback: NOTE, round: 1
    });
    const renders = {
      'map writer': join(await builder.buildOutlinePrompt(
        settledWeaveOf(state), [], state.shellAccounts, null, { evidenceBundle: state.evidenceBundle }
      )),
      'article writer': join(await builder.buildArticlePrompt(
        settledWeaveOf(state), state.outline, state.shellAccounts, null, state.directorNotes, null,
        { evidenceBundle: state.evidenceBundle }
      )),
      'arc writer': arcs.buildWeavePrompt(state),
      'arc reworker': arcs.buildArcRevisionPrompt(state, contextSection, previousOutputSection),
      'arc judge': judges.buildEvaluationUserPrompt('arcs', state, {}),
      'article judge': judges.buildEvaluationUserPrompt('article', state, {})
    };

    for (const [name, render] of Object.entries(renders)) {
      expect(`${name}: ${render.includes(MODEL)}`).toBe(`${name}: true`);
      expect(`${name}: ${instructionText(render).includes(MODEL)}`).toBe(`${name}: false`);
    }
  });

  describe('fails loud on a shape it cannot read, rather than scan the director\'s words or skip the pipeline\'s', () => {
    it('a send-back note with no NOTE line after it', () => {
      expect(() => instructionText('HUMAN FEEDBACK (HIGHEST PRIORITY):\nCut it.\n\nThe end.')).toThrow(/NOTE: The human reviewer/);
    });

    it('model output whose JSON never closes', () => {
      expect(() => instructionText('CONTENT BUNDLE:\n{\n  "sections": []\n')).toThrow(/CONTENT BUNDLE:/);
    });

    it('a previous version with no end line', () => {
      const { previousOutputSection } = buildRevisionContext({
        phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: {} }, humanFeedback: null
      });
      expect(() => instructionText(previousOutputSection.replace('END PREVIOUS OUTPUT', 'THE END'))).toThrow(/END PREVIOUS OUTPUT/);
    });

    it('a <DIRECTOR_GUIDANCE> block without the pipeline\'s label, the standing-notes preamble', () => {
      expect(() => instructionText('<DIRECTOR_GUIDANCE>\nLead with the money.\n</DIRECTOR_GUIDANCE>')).toThrow(/DIRECTOR_GUIDANCE/);
    });
  });
});

/**
 * The 3.6b fix batch: the phrases the tasks of waves 1 and 2 reported removing join the
 * list (removed-phrases-reported.md in the phase workspace), with 3.4's suggested
 * patterns. Each task's own wording is found, and a line that only resembles one is not.
 */
describe('the removed-phrase fixture: the phrases waves 1 and 2 reported removing', () => {
  const found = (text) => `${text}: ${findRemovedPhrases(text).length > 0}`;

  it.each([
    // 3.4's wording the patterns are for.
    'Every exposure, observation and the verdict reached them as tips from people who were there',
    'every exposure, observation and the verdict arrived as a tip from someone who was there',
    'by attributing it to the people who told you',
    'Attribute the action to whoever took it',
    'Where do all threads meet (the murder, the accusation)?',
    'Are photos placed for emotional pacing (breathe before escalation)?',
    "directorNotes: The director's observations are ground truth - never question them",
    'NovaNews first-person participatory voice (I, my, we)',
    "Nova (the journalist narrator) - may appear as the article's narrator/voice",
    'Marcus (the murder victim) - should appear in most arcs as the central victim',
    // A phrase an earlier entry finds.
    'Who killed Marcus Blackwood?',
    'Tokens sold to Black Market',
    'Buried memories appear only in <buried-transactions>, as account, amount and time',
    'The murder revelation / accusation climax',
    "PRESERVE EVERYTHING THAT'S WORKING - Do NOT regenerate from scratch",
    // Patterns for quotation marks, an elision and the old headings.
    'A memory-altering drug called "the memory drug"',
    'A memory-altering drug called “the memory drug”',
    'Never use "token" (say "memory")',
    "Vic's confident smile at the vote said she knew all along",
    'Do not just regenerate - IMPROVE',
    'You are IMPROVING, not regenerating',
    '### Whiteboard Connections (players drew these)',
    '**Names Identified:** Riley',
    'HARD CONSTRAINTS:',
    'OMIT for a detective session',
    'WHAT TO PRESERVE',
    'Low-scoring criteria need targeted fixes',
    'Remember: it reached her as tips.',
    '<POST_INVESTIGATION_NEWS>',
    "Verbatim quotes extracted from the director's prose: prefer these when citing what someone said"
  ])('finds "%s"', (text) => {
    expect(found(text)).toBe(`${text}: true`);
  });

  it.each([
    // The judges' photo lists; the old heading was title case.
    "each gives the names identified in it, the director's description joined by filename",
    // Lower case: ordinary words, not the old headings and labels.
    'name the hard constraints the record sets',
    'omit for brevity',
    'say what to fix first',
    'the record is the ground truth for the timeline'
  ])('does not find "%s"', (text) => {
    expect(found(text)).toBe(`${text}: false`);
  });
});

/**
 * Task 3.8 (spec round 7): the wording the rule files retire joins the list. The
 * buyer stated as fact, "a reading" as the rules' word for Nova's inference, the
 * absence carried by attribution, the closing that ends on a question, the old
 * deliberation, tracing and exposure items and the payday example. Each is found as
 * the old files worded it, and the words that stay legal are not.
 */
describe('the removed-phrase fixture: the wording 3.8 retires from the rule files', () => {
  const found = (text) => `${text}: ${findRemovedPhrases(text).length > 0}`;

  it.each([
    'bury: sell it to be erased for ever. NeurAI\'s board pays the seller into an account the seller names',
    '## T5. NeurAI\'s board pays the seller',
    'since NeurAI\'s board pays more the more sensitive the memory',
    '- A reading across the counts that names no one is Nova\'s to make.',
    'It never proves who holds the account, and several sellers can share one.',
    'Nova presents as a reading, an unproven claim or a question',
    'states the absence at most once in the whole article; the attribution carries it everywhere else.',
    'Nova reports as seen or heard on site, or as reported to Nova remotely, with the speaker named.',
    'such as the exposures and sales around it, and present that placement as Nova\'s reading.',
    'It ends on an open question, never a generic op-ed.',
    '## C6. The deliberation is its own movement',
    'Read an exposure as an act with a motive, such as putting a memory on the Evidence Board',
    'ask: "how does a lobbyist know exactly where the money is hidden?"',
    'The room accused <character>. So where is <character>\'s payday?',
    'So where is Vic’s payday?'
  ])('finds "%s"', (text) => {
    expect(found(text)).toBe(`${text}: true`);
  });

  it.each([
    // The verdict labels and T2 say a no-culprit verdict names no one.
    'A verdict with no culprit, such as an overdose or an accident, names no one.',
    "ACCUSATION: none (the room's verdict names no culprit: an accident)",
    // Round 7's own lines.
    'Money runs from the buyer to the seller\'s chosen account. Nova suspects the buyer is NeurAI and its board, and writes it as a suspicion (T1).',
    'The game tells the players that NeurAI\'s board wants the memories gone (T5).',
    'where the placement is Nova\'s inference, write it as T1 sets out.',
    'Nova says so once, early, as the start of Nova\'s questions.',
    // Task A of phases 14 and 15 retired round 7's C14 sentence; C14's sentence now.
    "It may look ahead to what is still at stake, who stands to profit or what Nova is chasing next, or close on the theory the article has built, whichever this session's story and its epilogue make strongest.",
    'The deliberation is usually the room\'s decisive scene: the theories debated and dropped, and how the room came to its verdict.',
    'Why someone exposed a memory is Nova\'s to suggest where the room\'s talk or the timing points to it',
    'where it stops, ask the question a reporter would ask of that gap.',
    'So where is the money going?',
    'The section raises an open question about the arc.'
  ])('does not find "%s"', (text) => {
    expect(found(text)).toBe(`${text}: false`);
  });
});

/**
 * The 3.6b fix batch: instructionText also strips the data prompts carry, built here by
 * the real builders: the director's Blake and Valet sentences (the article writer's
 * <NARRATIVE_TENSIONS> and the arc writer's heading). The pipeline's labels around them
 * stay scanned. The arc packages' excerpts and the outline judge's photo analyses it
 * stripped too went with the packages and the outline judge (phase 4, brief 4.6).
 */
describe('instructionText: the tension sentences (3.6b fix batch)', () => {
  const { reworkFixtureState } = require('./fixtures/rework-state');
  const { stubThemeLoader } = require('./fixtures/render-writers');
  const { PHASE_REQUIREMENTS } = require('../theme-loader');
  const { PromptBuilder } = require('../prompt-builder');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const { _testing: arcs } = require('../workflow/nodes/arc-specialist-nodes');

  // Data that carries a removed phrase, as the director's and the documents' words may.
  const SENTENCE = 'Blake said the murder victim had paid the Valet twice.';

  const state = () => {
    const s = reworkFixtureState('journalist');
    s.directorNotes.rawProse = `${s.directorNotes.rawProse} ${SENTENCE}`;
    s.narrativeTensions = { tensions: [{ type: 'blake-proximity', observations: [SENTENCE] }] };
    return s;
  };
  const builderFor = (s) => new PromptBuilder(
    stubThemeLoader(PHASE_REQUIREMENTS), 'journalist', s.sessionConfig, s.canonicalCharacters, s.characterData.characters
  );
  const join = ({ systemPrompt, userPrompt }) => `${systemPrompt}\n${userPrompt}`;
  const { settledWeaveOf } = require('../prompt-renderers/settled-weave');
  const articleRender = async (s = state()) => join(await builderFor(s).buildArticlePrompt(
    settledWeaveOf(s), s.outline, s.shellAccounts, null, s.directorNotes, s.narrativeTensions,
    { evidenceBundle: s.evidenceBundle }
  ));

  it("strips the director's sentences under <NARRATIVE_TENSIONS>, and keeps the label", async () => {
    const render = await articleRender();
    expect(render).toContain(`- ${SENTENCE}`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain(`<NARRATIVE_TENSIONS>\n${DERIVED_LABELS.narrativeTensions}\n-\n</NARRATIVE_TENSIONS>`);
  });

  it("strips the director's sentences under the arc writer's Blake and Valet heading, and keeps the label and what follows", () => {
    const render = arcs.buildWeavePrompt(state());
    expect(render).toContain(`- ${SENTENCE}`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain(`### Blake and the Valet in the director's notes\n${DERIVED_LABELS.narrativeTensions}\n\n-\n`);
    const after = render.indexOf(`- ${SENTENCE}`) + `- ${SENTENCE}`.length;
    const relabelled = `${render.slice(0, after)}\n\nRemember who killed Marcus.${render.slice(after)}`;
    expect(findRemovedPhrases(instructionText(relabelled))).toEqual(['who killed Marcus']);
  });
});
