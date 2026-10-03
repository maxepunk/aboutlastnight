/**
 * The rule set (phase 3, task 3.1; spec docs/superpowers/specs/2026-09-30-rule-set.md).
 *
 * The rule files under .claude/skills/journalist-report/references/rules/ state the
 * world (spec sections 1, 2 and 3a), the truth rules T1 to T15 and the craft items C1
 * to C19, each once. lib/rule-set.js hands each call the files spec section 8 gives
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
  loadRuleSet, loadModeBlock, setDefaultRulesRoot, DEFAULT_RULES_ROOT, RULE_SET_CALLS
} = require('../rule-set');
const { REMOVED_PHRASES, instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');

const RULES_ROOT = path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'rules');
const STUB_ROOT = path.join(__dirname, 'fixtures', 'rules');

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
 * Spec section 8, item by item: the arc writer reads neither the voice (C12), the
 * telling (C4) nor the cards (C9); the interweaving call has no output for questions
 * (C15) either; the outline writer reads all but the voice.
 */
const SPEC_SECTION_8 = {
  arc: ALL_CRAFT.filter((id) => !['C4', 'C9', 'C12'].includes(id)),
  interweaving: ALL_CRAFT.filter((id) => !['C4', 'C9', 'C12', 'C15'].includes(id)),
  outline: ALL_CRAFT.filter((id) => id !== 'C12'),
  article: ALL_CRAFT
};
SPEC_SECTION_8['judge-arc'] = SPEC_SECTION_8.arc;
SPEC_SECTION_8['judge-outline'] = SPEC_SECTION_8.outline;
SPEC_SECTION_8['judge-article'] = SPEC_SECTION_8.article;

/** The brief's map (spec section 8; the read's section C): each call's craft files, in order. */
const BRIEF_MAP = {
  arc: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions'],
  interweaving: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement'],
  outline: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions'],
  article: [
    'craft-story', 'craft-form', 'craft-material', 'craft-voice',
    'craft-judgement', 'craft-telling', 'craft-cards', 'craft-questions'
  ]
};
BRIEF_MAP['judge-arc'] = BRIEF_MAP.arc;
BRIEF_MAP['judge-outline'] = BRIEF_MAP.outline;
BRIEF_MAP['judge-article'] = BRIEF_MAP.article;

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

/** A temporary copy of the stub root, to break one file in. */
function tempStubRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rule-set-'));
  for (const name of ALL_FILES) fs.copyFileSync(path.join(STUB_ROOT, `${name}.md`), path.join(dir, `${name}.md`));
  return dir;
}

describe('the loader', () => {
  it('reads the journalist skill\'s rules folder by default', () => {
    expect(path.resolve(DEFAULT_RULES_ROOT)).toBe(path.resolve(RULES_ROOT));
  });

  it('serves exactly the seven calls of the plan', () => {
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

  it.each(Object.keys(SPEC_SECTION_8))('%s: the real files give exactly the craft items spec section 8 lists, each once', (call) => {
    const { core, craft } = loadRuleSet(call);
    // An item is counted by its heading; a body may point at an item another file states.
    const crafted = itemIds(craft).filter((id) => id.startsWith('C'));
    expect(crafted.sort()).toEqual([...SPEC_SECTION_8[call]].sort());
    // The core states no craft item: every call reads all of the world and the truth rules.
    expect(itemIds(core).filter((id) => id.startsWith('C'))).toEqual([]);
  });

  it.each(Object.keys(BRIEF_MAP))('%s: the real files are read once each, each in its own tag', (call) => {
    const { core, craft } = loadRuleSet(call);
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
    expect(() => loadRuleSet('revision', { root: STUB_ROOT })).toThrow(/revision.*arc.*interweaving/s);
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
    const onSite = loadModeBlock('on-site');
    const remote = loadModeBlock('remote');
    expect(onSite).not.toBe(remote);
    expect(ruleIds(onSite)).toEqual(['T8']);
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

describe('the default root, which a test can point at the stubs', () => {
  afterEach(() => setDefaultRulesRoot(null));

  it('serves the stubs to every call that passes no root, and returns the previous root', () => {
    const previous = setDefaultRulesRoot(STUB_ROOT);
    expect(path.resolve(previous)).toBe(path.resolve(DEFAULT_RULES_ROOT));
    expect(loadRuleSet('arc').core).toContain('STUB world');
    expect(loadModeBlock('remote')).toBe('<mode-remote>\nSTUB mode-remote\n</mode-remote>');
  });

  it('goes back to the skill\'s folder on null', () => {
    setDefaultRulesRoot(STUB_ROOT);
    setDefaultRulesRoot(null);
    expect(loadModeBlock('remote')).not.toContain('STUB mode-remote');
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
    // director's notes recording who turned the memory in. The mode files restate the
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
      expect(`${name}: ${/the director's notes record who turned the memory in/.test(sentence)}`).toBe(`${name}: true`);
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
  const read = (name) => {
    const file = path.join(RULES_ROOT, `${name}.md`);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  };
  /** One item's text: its heading line, through the line before the next heading. */
  const itemText = (name, id) => {
    const lines = read(name).split('\n');
    const start = lines.findIndex((line) => new RegExp(`^#{1,6} ${id}\\b`).test(line));
    if (start < 0) return '';
    const end = lines.findIndex((line, i) => i > start && /^#{1,6} /.test(line));
    return lines.slice(start, end < 0 ? lines.length : end).join('\n');
  };

  it.each([
    ['C1', 'craft-story', 'The director settles the thesis at the meeting, and every later writer works from the settled story.'],
    ['C16', 'craft-story', "The arc writer weighs each thread by how it bears on the room's verdict, and that weight decides its role."],
    ['C2', 'craft-form', 'The map decides, from the settled story, which sections exist, their order and their headings.'],
    ['C4', 'craft-telling', "The article writer gives each beat the sentences its job needs, a supporting player's beat a line or two and a decisive scene more, and aims at the map's expected length: a session that gives less makes a shorter article, never a padded one."],
    ['C8', 'craft-material', 'The map chooses, from the notes and the record, the lines the settled story needs, places each where it makes sense in its context, a line from the room in its moment, and lists what it considered and did not use as left out, one line each.'],
    ['C7', 'craft-material', 'The map places every player in a beat, through something the record shows they did or said, in the section where it matters, never as a roll call.'],
    ['C15', 'craft-questions', "The director answers each in its own box at the story meeting, and the answer travels with its question to every later writer as the director's words."],
    ['T1', 'truth-rules', "What happened or was said in the room, as the director's notes or their answers at the story meeting record it, Nova reports as the reporting mode sets out (T8), with each quoted line in its speaker's mouth (T12)."],
    ['T2', 'truth-rules', 'The map places each alternative theory the room debated, a line each, and the article reports every one the map carries; a theory the director strikes from the map stays out.'],
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

  it('strips an APPROVED OUTLINE carrying "the murder victim", and still scans the text after it', () => {
    const render = [
      'APPROVED OUTLINE:',
      JSON.stringify({ lede: { hook: 'Marcus, the murder victim, sold the company.', primaryArc: 'arc-sale' } }, null, 2),
      '',
      'HERO IMAGE (CRITICAL - do NOT duplicate):'
    ].join('\n');
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain('APPROVED OUTLINE:');
    expect(text).toContain('HERO IMAGE (CRITICAL - do NOT duplicate):');
    expect(findRemovedPhrases(instructionText(`${render}\nRemember who killed Marcus.`))).toEqual(['who killed Marcus']);
  });

  describe('<DIRECTOR_GUIDANCE>', () => {
    const GUIDANCE = 'Lead with the money.\n\nThe murder victim is Marcus; say so once.';
    const NOTES = [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Ask who killed Marcus.\nThen ask why.' },
      { gate: 'outline', kind: 'approval', round: 1, text: 'Keep the shape of the silence.' }
    ];
    const section = buildDirectorGuidanceSection(GUIDANCE, NOTES);

    it('strips the director\'s guidance and notes, every line of them', () => {
      const text = instructionText(section);
      expect(findRemovedPhrases(text)).toEqual([]);
      for (const words of ['Lead with the money.', 'say so once', 'Ask who killed', 'Then ask why.', 'Keep the shape']) {
        expect(text).not.toContain(words);
      }
    });

    it('keeps the pipeline\'s label lines, the standing-notes preamble included', () => {
      const text = instructionText(section);
      expect(text).toContain('It outranks the craft rules above where they conflict');
      expect(text).toContain('Standing notes the director gave at earlier stops, in order.');
      expect(text).toContain('Keep honoring each in what you write now.');
      expect(instructionText(buildDirectorGuidanceSection('', NOTES))).toContain('Standing notes the director gave at earlier stops');
    });

    it('scans a guidance label line: a removed phrase there is found', () => {
      const relabelled = section.replace('It outranks the craft rules', 'It outranks the murder victim and the craft rules');
      expect(findRemovedPhrases(instructionText(relabelled))).toEqual(['the murder victim']);
      const preamble = section.replace('Keep honoring each', 'Keep honoring who killed Marcus and each');
      expect(findRemovedPhrases(instructionText(preamble))).toEqual(['who killed Marcus']);
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
    const MODEL = 'MODEL-OUTPUT-SENTINEL';

    const state = reworkFixtureState('journalist');
    state.narrativeArcs[0] = { ...state.narrativeArcs[0], summary: `${MODEL} summary`, caveats: [`${MODEL} caveat`] };
    state._arcAnalysisCache = {
      ...state._arcAnalysisCache,
      synthesisNotes: `${MODEL} synthesis`,
      interweavingPlan: { ...state._arcAnalysisCache.interweavingPlan, convergencePoint: `${MODEL} plan` },
      // Fix 3.7b: the arc writer's questions, which the arc reworker and the arc judge
      // print back under their own labels
      writerQuestions: [{ kind: 'player', about: `${MODEL} about`, question: `${MODEL} question` }]
    };
    state.outline = { ...state.outline, lede: { ...state.outline.lede, hook: `${MODEL} hook` } };
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
      phase: 'arcs', revisionCount: 0, validationResults: null, previousOutput: state.narrativeArcs, humanFeedback: NOTE, round: 1
    });
    const renders = {
      'outline writer': join(await builder.buildOutlinePrompt(
        { narrativeArcs: state.narrativeArcs, ...state._arcAnalysisCache }, state.selectedArcs, 'hero.jpg',
        [], state.arcEvidencePackages, state.shellAccounts, null, { evidenceBundle: state.evidenceBundle }
      )),
      'article writer': join(await builder.buildArticlePrompt(
        state.outline, state.arcEvidencePackages, 'hero.jpg', state.shellAccounts, null, state.directorNotes, null,
        { evidenceBundle: state.evidenceBundle }
      )),
      'arc writer': arcs.buildCoreArcPrompt(state),
      interweaving: arcs.buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle),
      'arc reworker': arcs.buildArcRevisionPrompt(state, contextSection, previousOutputSection),
      'arc judge': judges.buildEvaluationUserPrompt('arcs', state, {}),
      'outline judge': judges.buildEvaluationUserPrompt('outline', state, {}),
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
      expect(() => instructionText('APPROVED OUTLINE:\n{\n  "lede": {}\n')).toThrow(/APPROVED OUTLINE:/);
    });

    it('a previous version with no end line', () => {
      const { previousOutputSection } = buildRevisionContext({
        phase: 'outline', revisionCount: 1, validationResults: null, previousOutput: { lede: {} }, humanFeedback: null
      });
      expect(() => instructionText(previousOutputSection.replace('END PREVIOUS OUTPUT', 'THE END'))).toThrow(/END PREVIOUS OUTPUT/);
    });

    it('a <DIRECTOR_GUIDANCE> block with neither of the pipeline\'s labels', () => {
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
    'The closing looks ahead from the thesis: what is still at stake, who stands to profit, what Nova is chasing next.',
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
 * The 3.6b fix batch: instructionText also strips the data three prompts carry, built
 * here by the real builders: the arc packages' excerpts (the documents' own words, in
 * the outline writer's <arc-evidence> and the article writer's packages), the outline
 * judge's photo analyses (Haiku's output), and the director's Blake and Valet sentences
 * (the article writer's <NARRATIVE_TENSIONS> and the arc writer's heading). The
 * pipeline's labels around them stay scanned.
 */
describe('instructionText: the excerpts, the photo analyses and the tension sentences (3.6b fix batch)', () => {
  const { reworkFixtureState } = require('./fixtures/rework-state');
  const { stubThemeLoader } = require('./fixtures/render-writers');
  const { PHASE_REQUIREMENTS } = require('../theme-loader');
  const { PromptBuilder } = require('../prompt-builder');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const { _testing: arcs } = require('../workflow/nodes/arc-specialist-nodes');
  const { _testing: judges } = require('../workflow/nodes/evaluator-nodes');

  // Data that carries a removed phrase, as the director's and the documents' words may.
  const EXCERPT = 'Marcus, the murder victim, owed a favour\nto who killed Marcus (EXCERPT-SENTINEL)';
  const SENTENCE = 'Blake said the murder victim had paid the Valet twice.';
  const ANALYSIS = "Nova and her camera stand by the murder victim's portrait.";

  const state = () => {
    const s = reworkFixtureState('journalist');
    s.arcEvidencePackages[0].evidenceItems[0].quotableExcerpts = [EXCERPT, '"Worth it."'];
    s.directorNotes.rawProse = `${s.directorNotes.rawProse} ${SENTENCE}`;
    s.narrativeTensions = { tensions: [{ type: 'blake-proximity', observations: [SENTENCE] }] };
    s.photoAnalyses.analyses[1] = { ...s.photoAnalyses.analyses[1], visualContent: ANALYSIS };
    return s;
  };
  const builderFor = (s) => new PromptBuilder(
    stubThemeLoader(PHASE_REQUIREMENTS), 'journalist', s.sessionConfig, s.canonicalCharacters, s.characterData.characters
  );
  const join = ({ systemPrompt, userPrompt }) => `${systemPrompt}\n${userPrompt}`;
  const outlineRender = async (s = state()) => join(await builderFor(s).buildOutlinePrompt(
    { narrativeArcs: s.narrativeArcs, ...s._arcAnalysisCache }, s.selectedArcs, 'hero.jpg',
    [], s.arcEvidencePackages, s.shellAccounts, null, { evidenceBundle: s.evidenceBundle }
  ));
  const articleRender = async (s = state()) => join(await builderFor(s).buildArticlePrompt(
    s.outline, s.arcEvidencePackages, 'hero.jpg', s.shellAccounts, null, s.directorNotes, s.narrativeTensions,
    { evidenceBundle: s.evidenceBundle }
  ));

  it("strips the outline writer's excerpts, a multi-line one included, and keeps each document's line and its label", async () => {
    const render = await outlineRender();
    expect(render).toContain(`  Excerpts: "${EXCERPT}" | ""Worth it.""`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).not.toContain('EXCERPT-SENTINEL');
    expect(text).toMatch(/^- ale003: memory\n {2}Excerpts:\n- p-dna: paper\n {2}Excerpts:\n\*\*Photos in which/m);
    // The photos label after the excerpts is the pipeline's, and stays scanned.
    expect(findRemovedPhrases(instructionText(render.replace("**Photos in which this arc's", "**Photos in which the murder victim and this arc's"))))
      .toEqual(['the murder victim']);
  });

  it("strips the article writer's excerpts, a multi-line one included, and keeps EXCERPTS:, DOCUMENTS: and the documents", async () => {
    const render = await articleRender();
    expect(render).toContain(`- "${EXCERPT}" (from ale003)`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).not.toContain('EXCERPT-SENTINEL');
    expect(text).toMatch(/^EXCERPTS:\nDOCUMENTS:\nale003 \(memory\)\np-dna \(paper\)$/m);
    expect(findRemovedPhrases(instructionText(render.replace('DOCUMENTS:\nale003', 'DOCUMENTS:\nthe murder victim\nale003'))))
      .toEqual(['the murder victim']);
  });

  it("strips the outline judge's photo analyses, and keeps each photo's line and the analysis label", () => {
    const render = judges.buildEvaluationUserPrompt('outline', state(), {});
    expect(render).toContain(ANALYSIS);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).not.toContain('camera');
    expect(text).toMatch(/^ {3}Photo analysis: \{\n {3}\}$/m);
    expect(text).toContain('PHOTOS (all ');
  });

  it("strips the director's sentences under <NARRATIVE_TENSIONS>, and keeps the label", async () => {
    const render = await articleRender();
    expect(render).toContain(`- ${SENTENCE}`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain(`<NARRATIVE_TENSIONS>\n${DERIVED_LABELS.narrativeTensions}\n-\n</NARRATIVE_TENSIONS>`);
  });

  it("strips the director's sentences under the arc writer's Blake and Valet heading, and keeps the label and what follows", () => {
    const render = arcs.buildCoreArcPrompt(state());
    expect(render).toContain(`- ${SENTENCE}`);
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain(`### Blake and the Valet in the director's notes\n${DERIVED_LABELS.narrativeTensions}\n\n-\n`);
    const after = render.indexOf(`- ${SENTENCE}`) + `- ${SENTENCE}`.length;
    const relabelled = `${render.slice(0, after)}\n\nRemember who killed Marcus.${render.slice(after)}`;
    expect(findRemovedPhrases(instructionText(relabelled))).toEqual(['who killed Marcus']);
  });

  describe('fails loud on a shape it cannot read', () => {
    it('excerpts in the outline writer with no next document or photos line after them', () => {
      expect(() => instructionText('- ale003: memory\n  Excerpts: "the murder victim"\nSomething else.')).toThrow(/Excerpts:/);
    });

    it('an EXCERPTS: list with no DOCUMENTS: line after it', () => {
      expect(() => instructionText('EXCERPTS:\n- "the murder victim" (from ale003)\n\nARC PHOTOS:')).toThrow(/DOCUMENTS:/);
    });

    it('a photo analysis whose JSON never closes', () => {
      expect(() => instructionText('1. hero.jpg: Alex\n   Photo analysis: {\n     "visualContent": "x"\n')).toThrow(/photo analysis/);
    });
  });
});
