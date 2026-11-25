/**
 * The rule set (phase 3, task 3.1; phase 18, the brief and the limits:
 * docs/superpowers/specs/2026-11-20-the-brief-and-the-limits-design.md, sections 1 and 9).
 *
 * The rule files under .claude/skills/journalist-report/references/rules/ are the eight the
 * director settled on 2026-11-20: the world and the limits, which every writer and judge
 * reads; the brief and each writer's own part (job-weave, job-map, job-article), which only
 * the writers read; and the two parts about where Nova was this session, one of which reaches
 * each prompt in a `this-session` tag. lib/rule-set.js hands each call the files R2 gives it.
 *
 * Four parts:
 * - the loader: the list per call, the files, the throws, the stub root;
 * - the rule files: each pinned whole by hash (R4), and the lint over them (R5);
 * - the removed-phrase fixture's helpers, which the lint and the gate use;
 * - instructionText, which reads only the pipeline's own instructions.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  loadRuleSet, loadModeBlock, setDefaultRulesRoot, rulesFolderOf, RULE_SET_CALLS
} = require('../rule-set');
const { REMOVED_PHRASES, instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');

const RULES_ROOT = path.join(__dirname, '..', '..', '.claude', 'skills', 'journalist-report', 'references', 'rules');
const STUB_ROOT = path.join(__dirname, 'fixtures', 'rules');
/** Brief 4.13 (R14): a call names the theme whose rules folder it reads; these read the journalist's. */
const JOURNALIST = { theme: 'journalist' };

/** R2: every writer and judge reads the world, then the limits. */
const CORE_FILES = ['world', 'limits'];
/**
 * R2: each call's own files, after the core. Each writer reads the brief and its own part; the
 * judges read neither (the spec's section 1). Every writer reads the brief first, then its own
 * part, as the spec's sections 1 and 3 give it (run 2h, R45, reversing run 2b's R24).
 */
const CALL_FILES = {
  arc: ['brief', 'job-weave'],
  outline: ['brief', 'job-map'],
  article: ['brief', 'job-article'],
  'judge-arc': [],
  'judge-article': []
};
const MODE_FILES = ['mode-on-site', 'mode-remote'];
const ALL_FILES = [...CORE_FILES, ...MODE_FILES, 'brief', 'job-weave', 'job-map', 'job-article'];
const WRITERS = ['arc', 'outline', 'article'];

/**
 * The label buildRevisionContext (node-helpers.js) prints over the director's note in a rework, and
 * the opening of the block that always comes after it, the rule over WHAT THIS REWORK DOES (run 2c,
 * R36: the note's NOTE lines went, and its end is where the context's next block begins).
 */
const DIRECTOR_NOTE_LINE = "THE DIRECTOR'S NOTE:";
const REWORK_SCOPE = '═══════════════════════════════════════════════════════════════════════════════\nWHAT THIS REWORK DOES:';

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
  // Brief 4.13 (R14): there is no default folder; the journalist's config names its skill's.
  it('reads the journalist skill\'s rules folder for the journalist', () => {
    expect(rulesFolderOf('journalist')).toBe(path.resolve(RULES_ROOT));
  });

  it('serves exactly the five calls, each with R2\'s list', () => {
    expect(Object.keys(RULE_SET_CALLS).sort()).toEqual(Object.keys(CALL_FILES).sort());
    for (const [call, files] of Object.entries(CALL_FILES)) {
      expect(`${call}: ${RULE_SET_CALLS[call].join(',')}`).toBe(`${call}: ${files.join(',')}`);
    }
  });

  it('the stubs are the eight files, one line each', () => {
    expect(fs.readdirSync(STUB_ROOT).sort()).toEqual(ALL_FILES.map((name) => `${name}.md`).sort());
    for (const name of ALL_FILES) {
      expect(fs.readFileSync(path.join(STUB_ROOT, `${name}.md`), 'utf8').trim()).toBe(`STUB ${name}`);
    }
  });

  it.each(Object.keys(CALL_FILES))('%s: the core is the world then the limits, each in its own tag', (call) => {
    const { core } = loadRuleSet(call, { root: STUB_ROOT });
    expect(core).toBe('<world>\nSTUB world\n</world>\n\n<limits>\nSTUB limits\n</limits>');
  });

  it.each(Object.keys(CALL_FILES))('%s: the call\'s own files are R2\'s, in its order, each in a tag named after it', (call) => {
    const { craft } = loadRuleSet(call, { root: STUB_ROOT });
    expect(tagsOf(craft)).toEqual(CALL_FILES[call]);
    expect(craft).toBe(CALL_FILES[call].map((name) => `<${name}>\nSTUB ${name}\n</${name}>`).join('\n\n'));
  });

  it.each(Object.keys(CALL_FILES))('%s: the real files are read once each, each in its own tag, holding its file\'s text', (call) => {
    const { core, craft } = loadRuleSet(call, JOURNALIST);
    expect(tagsOf(core)).toEqual(CORE_FILES);
    expect(tagsOf(craft)).toEqual(CALL_FILES[call]);
    for (const name of [...CORE_FILES, ...CALL_FILES[call]]) {
      expect(`${call}: ${name}: ${count(`${core}\n${craft}`, `</${name}>`)}`).toBe(`${call}: ${name}: 1`);
      const text = fs.readFileSync(path.join(RULES_ROOT, `${name}.md`), 'utf8').trim();
      expect(`${core}\n${craft}`).toContain(`<${name}>\n${text}\n</${name}>`);
    }
  });

  it.each(Object.keys(CALL_FILES))('%s: no other rule file reaches the call', (call) => {
    const { core, craft } = loadRuleSet(call, JOURNALIST);
    const others = ALL_FILES.filter((name) => ![...CORE_FILES, ...CALL_FILES[call]].includes(name));
    for (const name of others) {
      expect(`${call}: ${name}: ${count(`${core}\n${craft}`, `<${name}>`)}`).toBe(`${call}: ${name}: 0`);
    }
  });

  it('throws on a call it does not know, naming the calls it does', () => {
    expect(() => loadRuleSet('revision', { root: STUB_ROOT })).toThrow(/revision.*arc.*outline/s);
  });

  it('throws naming every missing or empty file a call needs, and the call', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'job-weave.md'));
    fs.writeFileSync(path.join(root, 'limits.md'), '  \n');
    expect(() => loadRuleSet('arc', { root })).toThrow(/call "arc".*limits\.md.*job-weave\.md/s);
  });

  it('does not throw for a broken file the call does not read', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'job-map.md'));
    expect(() => loadRuleSet('outline', { root })).toThrow(/job-map\.md/);
    for (const call of ['arc', 'article', 'judge-arc', 'judge-article']) {
      expect(() => loadRuleSet(call, { root })).not.toThrow();
    }
  });

  it('throws for a missing brief.md in every writer, and in neither judge', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'brief.md'));
    WRITERS.forEach((call) => {
      expect(() => loadRuleSet(call, { root })).toThrow(/brief\.md/);
    });
    expect(() => loadRuleSet('judge-arc', { root })).not.toThrow();
    expect(() => loadRuleSet('judge-article', { root })).not.toThrow();
  });
});

describe('the mode block', () => {
  // Wrapped in one tag (review of 3.1, finding 4): the block sits in the middle of a system
  // prompt, and its closing tag ends it. Phase 18 (R2): the tag is `this-session` whichever
  // file it came from, the name the world and the limits call it by.
  it.each(['on-site', 'remote'])('%s: returns the mode file\'s text in one <this-session> tag', (mode) => {
    expect(loadModeBlock(mode, { root: STUB_ROOT })).toBe(`<this-session>\nSTUB mode-${mode}\n</this-session>`);
  });

  it.each(['on-site', 'remote'])('%s: the real block holds its own file\'s text, once', (mode) => {
    const text = fs.readFileSync(path.join(RULES_ROOT, `mode-${mode}.md`), 'utf8').trim();
    const block = loadModeBlock(mode, JOURNALIST);
    expect(block).toBe(`<this-session>\n${text}\n</this-session>`);
    expect(tagsOf(block)).toEqual(['this-session']);
  });

  it('the two real blocks differ', () => {
    expect(loadModeBlock('on-site', JOURNALIST)).not.toBe(loadModeBlock('remote', JOURNALIST));
  });

  it('throws on a mode it does not know', () => {
    expect(() => loadModeBlock('hybrid', { root: STUB_ROOT })).toThrow(/hybrid/);
  });

  it('throws naming a missing mode file', () => {
    const root = tempStubRoot();
    fs.unlinkSync(path.join(root, 'mode-remote.md'));
    expect(() => loadModeBlock('remote', { root })).toThrow(/mode-remote\.md/);
    expect(() => loadModeBlock('on-site', { root })).not.toThrow();
  });
});

// Brief 4.13 (R14): the stand-in is read in place of the folder each call's theme names.
describe('the default root, which a test can point at the stubs', () => {
  afterEach(() => setDefaultRulesRoot(null));

  it('serves the stubs to every call that passes no root, and returns the previous root', () => {
    expect(setDefaultRulesRoot(STUB_ROOT)).toBeNull();
    expect(loadRuleSet('arc', JOURNALIST).core).toContain('STUB world');
    expect(loadModeBlock('remote', JOURNALIST)).toBe('<this-session>\nSTUB mode-remote\n</this-session>');
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
 * R4: each rule file is pinned whole by hash. A deliberate change to a rule file updates its
 * row here, in the same commit, with the reason; a change that was not meant fails here.
 * The hash is sha256 of the file's bytes, and the length is in characters.
 */
const RULE_FILE_PINS = {
  world: ['191569ff5475068322fd4d392132ef5101dc832e72de91bcac1b5018e15e3e3a', 5763,
    'phase 18, run 2c: the group statement\'s line as the director approved it on 2026-11-24'],
  limits: ['c46d70bc7eccabcf18bba1d43eebd1a59851d73f93077431124a2668740db5c2', 9692,
    'phase 18, run 2h: the sentence on "we" for a session where Nova was in the warehouse, as the director approved it on 2026-11-24'],
  'mode-on-site': ['8fbacd078d0c52df7185128d1408c090cc6f769fca1d44997545eed7bbc559bd', 1012,
    'phase 18: the text the director settled on 2026-11-20'],
  'mode-remote': ['e0c7db4180d5595bc8f7048347c443e311c264b690347e933638642af72e2e5a', 749,
    'phase 18: the text the director settled on 2026-11-20'],
  brief: ['4a092808793901714d8e2b02a5548a0c8b1223b9d0b2450275246ade4aff6351', 9715,
    'phase 18, run 2h: the evidence the argument needs, in "Nova", as the director approved it on 2026-11-24'],
  'job-weave': ['1560ccbdacc48d7a63fde9eba916f80d0ceb6f5ff3ba67f71b111ed2038f0de7', 5209,
    'phase 18: the text the director settled on 2026-11-20'],
  'job-map': ['0b689f706af16dea27253433a59a202e3516141e6bdf9ffe142b6730bff12f1c', 5417,
    "phase 18, run 2h: a section's heading says what the section is about and does not give away what it finds, as the director approved it on 2026-11-24"],
  'job-article': ['6dbb8d529b0ada6b065c6a27242069e30192bd3defb4cc2675671fd7b786cfd5', 3068,
    "phase 18, run 2h: what a card's headline and a sidebar entry's lines say, as the director approved it on 2026-11-24"]
};

describe('the rule files', () => {
  // Read here, not in a test: a missing file fails the tests that need it, one by one.
  const read = (name) => {
    const file = path.join(RULES_ROOT, `${name}.md`);
    return fs.existsSync(file) ? fs.readFileSync(file) : Buffer.alloc(0);
  };
  const bytes = Object.fromEntries(ALL_FILES.map((name) => [name, read(name)]));
  const files = Object.fromEntries(ALL_FILES.map((name) => [name, bytes[name].toString('utf8')]));

  it('the folder holds the eight rule files and nothing else', () => {
    // A retired file left on disk invites a loader or a person to read it again (the
    // integrator's ruling: deleted, not archived).
    expect(fs.readdirSync(RULES_ROOT).sort()).toEqual(ALL_FILES.map((name) => `${name}.md`).sort());
  });

  it('every file is pinned, with a reason', () => {
    expect(Object.keys(RULE_FILE_PINS).sort()).toEqual([...ALL_FILES].sort());
    for (const [name, [, , reason]] of Object.entries(RULE_FILE_PINS)) {
      expect(`${name}: ${typeof reason === 'string' && reason.trim().length > 0}`).toBe(`${name}: true`);
    }
  });

  it.each(ALL_FILES)('%s.md matches its pin (R4)', (name) => {
    const [hash, length] = RULE_FILE_PINS[name];
    // Length first: when it differs, the size of the change says where to look.
    expect(`${name}.md length ${files[name].length}`).toBe(`${name}.md length ${length}`);
    const actual = crypto.createHash('sha256').update(bytes[name]).digest('hex');
    expect(`${name}.md sha256 ${actual}`).toBe(`${name}.md sha256 ${hash}`);
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

  // The director (2026-11-19): the writer lifts any finished sentence, so the rule files hold
  // no "such as" aside and no example.
  it.each(ALL_FILES)('%s.md says neither "such as" nor "for example"', (name) => {
    expect(files[name]).not.toMatch(/\bsuch as\b/i);
    expect(files[name]).not.toMatch(/\bfor example\b/i);
  });

  // The director (2026-11-19): "The 'room' didn't do anything." People did each thing.
  it.each(ALL_FILES)('%s.md never says "the room"', (name) => {
    expect(files[name]).not.toMatch(/\bthe room\b/i);
  });

  // The spec's section 7: a part is named by its name, never by a number.
  it.each(ALL_FILES)('%s.md cites no rule by number', (name) => {
    expect(files[name].match(/\b[TC]\d{1,2}\b/g) || []).toEqual([]);
  });

  // The director's ruling of 2026-10-10: a player's character sheet is never an in-world
  // document, so no rule file tells a writer or a judge how to use one.
  it.each(ALL_FILES)('%s.md never speaks of a character sheet', (name) => {
    expect(files[name]).not.toMatch(/character sheet/i);
  });

  it('come together to less than half the eight craft files of bad9781', () => {
    // The eight journalist craft files at bad9781 (writing-principles, anti-patterns,
    // character-voice, evidence-boundaries, narrative-structure, section-rules,
    // editorial-design, formatting): 100,005 characters, so the cap is 50,002.
    const CAP = 50002;
    const size = Object.values(files).reduce((sum, text) => sum + text.length, 0);
    expect(size).toBeLessThan(CAP);
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
      `${DIRECTOR_NOTE_LINE}\nCut the resolution cascade line.\n\n${REWORK_SCOPE}`,
      '- p1.jpg: The director\'s description, word for word: Nova and her camera'
    ].join('\n\n');
    const text = instructionText(render);
    expect(findRemovedPhrases(text)).toEqual([]);
    expect(text).toContain('Write the article.');
    expect(text).toContain('A model made this index.');
    expect(text).toContain('<RECORD></RECORD>');
    expect(text).toContain(`${DIRECTOR_NOTE_LINE}\n\n${REWORK_SCOPE}`);
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
 * bundle, the whiteboard reading) and every paragraph of the director's note in a rework.
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

  it('strips every paragraph of the director\'s note, up to the context\'s next block', () => {
    const { contextSection } = buildRevisionContext({
      phase: 'outline', revisionCount: 0, validationResults: null, previousOutput: null, humanFeedback: NOTE, round: 2
    });
    expect(contextSection).toContain('Third paragraph');
    const text = instructionText(contextSection);
    for (const paragraph of NOTE.split('\n\n')) expect(text).not.toContain(paragraph);
    expect(text).toContain(`${DIRECTOR_NOTE_LINE}\n\n${REWORK_SCOPE}`);
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

    // Phase 18, run 2h (R48): the preamble's approved words.
    it('keeps the pipeline\'s label lines, the standing-notes preamble', () => {
      const text = instructionText(section);
      expect(text).toContain("The director's notes from the stops so far, in order, in the director's own words.");
      expect(text).toContain('act on it where it bears on your work.');
    });

    it('scans the preamble: a removed phrase there is found', () => {
      const preamble = section.replace('act on it where it bears', 'act on who killed Marcus where it bears');
      expect(findRemovedPhrases(instructionText(preamble))).toEqual(['who killed Marcus']);
    });

    it('a block in the retired guidance shape, with no standing-notes preamble, cannot be read, and says so', () => {
      const retired = '<DIRECTOR_GUIDANCE>\nThe director reviewed the arcs and asks for this emphasis. It outranks the craft rules above where they conflict:\n\nLead with the money.\n</DIRECTOR_GUIDANCE>';
      expect(() => instructionText(retired)).toThrow(/The director's notes from the stops so far/);
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
        settledWeaveOf(state), state.outline, state.shellAccounts, null, state.directorNotes,
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
    it("a director's note with no block of the rework's after it", () => {
      expect(() => instructionText(`${DIRECTOR_NOTE_LINE}\nCut it.\n\nThe end.`)).toThrow(/THE DIRECTOR'S NOTE:/);
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
    'ACCUSATION: none (the verdict names no culprit: an accident)',
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
 * the real builders: the director's Blake and Valet sentences (the arc writer's heading; the
 * article writer printed them under <NARRATIVE_TENSIONS> until phase 18, run 2c, and prints
 * them only in the notes now). The pipeline's labels around them
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
    settledWeaveOf(s), s.outline, s.shellAccounts, null, s.directorNotes,
    { evidenceBundle: s.evidenceBundle }
  ));

  // Phase 18, run 2c (the wording doc's parts 4 and 6): the article writer prints no
  // <NARRATIVE_TENSIONS>; the director's sentence stands once, in the notes, which the scan strips.
  it("prints the director's sentence once, in the notes, with no <NARRATIVE_TENSIONS> or its label, and the scan finds nothing", async () => {
    const render = await articleRender();
    expect(render).not.toContain(`- ${SENTENCE}`);
    expect(render.split(SENTENCE)).toHaveLength(2);
    expect(render).not.toContain('NARRATIVE_TENSIONS');
    expect(render).not.toContain(DERIVED_LABELS.narrativeTensions);
    expect(findRemovedPhrases(instructionText(render))).toEqual([]);
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
