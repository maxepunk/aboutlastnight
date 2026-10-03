/**
 * The weave (phase 4, brief 4.4; spec 2026-10-02 sections 4.2 and 4.5).
 *
 * The arc writer writes one weave of about 400 words in place of the arcs: the story,
 * its question and a working headline; the director's words it rests on; the threads,
 * each with its role and strongest receipt; the connections and the convergence; an
 * optional stronger main thread; and the questions for the director, each saying what
 * its answer changes. Code checks it (checkWeave), and the fact check marks the weave it
 * judged.
 *
 * The weave below is in 0926262's shape (spec section 4.3's worked example: five threads
 * in five roles, four connections of four kinds, a figure question), with invented text:
 * the repo is public.
 */

const Ajv = require('ajv');
const {
  WEAVE_ROLES, MAIN_THREAD_ROLE, LEFT_OUT_ROLE, CONNECTION_KINDS, LEDGER_RECEIPT, WEAVE_WORD_BOUND,
  WEAVE_CHECKS_SOURCE, FACT_CHECK_MARK_KEY,
  isWeave, weaveWordCount, weaveKey, weaveForPrompt, factCheckMarkOf, isWeaveJudged, withFactCheckMark,
  isMeetingApproved, checkWeave
} = require('../weave');
const { WEAVE_SCHEMA } = require('../sdk-client/subagents');
const {
  WEAVE_QUESTIONS_KEY, WEAVE_QUESTION_KINDS, WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf, carriedWeaveQuestions,
  WRITER_QUESTIONS_PROPERTY
} = require('../writer-questions');

const clone = (v) => JSON.parse(JSON.stringify(v));

const NOTES = 'Rowan argued with Ellis at the bar. In the end the frame this morning did not land the way it was meant to, and the room turned on Ellis.';
const CORRECTION = 'The deal at the coat check was Kai to Sloane, not Sloane to Kai.';

/** 0926262's shape, invented text. */
const WEAVE = {
  story: 'Someone built a case to pin the death on Rowan Vale. It failed in the room and landed on Ellis Marr, and the people with the money are already writing the next version.',
  question: 'Will the verdict cost Ellis anything?',
  headline: 'Ellis Marr Pointed the Room at Rowan Vale. It Named Him Instead.',
  fromYourNotes: 'the frame this morning did not land the way it was meant to',
  threads: [
    { id: 't1', claim: 'The case against Rowan held at four votes, and the room named Ellis.', role: 'main-thread', receipt: 'ledger', verdict: true },
    { id: 't2', claim: 'The RowanVale account took most of the last two minutes of selling.', role: 'grounds-it', receipt: 'ledger' },
    { id: 't3', claim: 'Two allies split over the same secret in the bathroom.', role: 'complicates-it', receipt: 'row001' },
    { id: 't4', claim: 'A plan to replace the founder may outlive the verdict.', role: 'carries-it-forward', receipt: 'vic002' },
    { id: 't5', claim: 'Last winter a story about the company vanished the same way.', role: 'mirrors-it', receipt: 'p-email' },
    { id: 't6', claim: 'A side deal at the coat check.', role: 'left-out', receipt: 'kai004', reason: 'It touches no thread the story follows.' }
  ],
  connections: [
    { id: 'c1', kind: 'person', joins: ['t1', 't3'], detail: "Sloane: Rowan's ally and the voice that turned the room." },
    { id: 'c2', kind: 'moment', joins: ['t1', 't2'], detail: 'The scoreboard: the money enters the vote.' },
    { id: 'c3', kind: 'document', joins: ['t4', 't5'], detail: 'The firm that wrote the January demand is the firm on retainer now.' },
    { id: 'c4', kind: 'line', joins: ['t5', 't1'], detail: '"Truth is a negotiation": planted early, paid off at the end.' }
  ],
  convergence: 'Near the end the retainer, the empty chair and the flight abroad meet the old sign-off.',
  strongerMainThread: { thread: 't4', reason: 'The replacement plan reaches past the morning.' },
  questions: [
    {
      id: 'q1', kind: 'figure', about: 'RowanVale, "more than double the second"',
      question: "The room heard more than double; the ledger has less. Print it as the room's exaggeration?",
      changes: "The money section's key line."
    }
  ]
};

const RECORD_IDS = new Set(['row001', 'vic002', 'p-email', 'kai004', 'Kai Coat Check Note']);
const DIRECTOR_WORDS = [NOTES, CORRECTION];
const check = (weave, overrides = {}) => checkWeave(weave, { recordIds: RECORD_IDS, directorWords: DIRECTOR_WORDS, ...overrides });
const typesOf = (failures) => failures.map((f) => f.type);
/** The weave with one thread changed. */
const withThread = (id, change) => ({ ...clone(WEAVE), threads: clone(WEAVE).threads.map((t) => (t.id === id ? change(t) : t)) });

describe('the weave\'s shape (WEAVE_SCHEMA)', () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(WEAVE_SCHEMA);
  const valid = (value) => {
    const ok = validate(value);
    return ok ? 'valid' : JSON.stringify(validate.errors.map((e) => `${e.instancePath} ${e.message}`));
  };

  it('compiles in strict mode and accepts a weave in 0926262\'s shape', () => {
    expect(valid(WEAVE)).toBe('valid');
  });

  it('requires the story, its question, the headline, the threads, the connections, the convergence and the questions', () => {
    expect(WEAVE_SCHEMA.required).toEqual(['story', 'question', 'headline', 'threads', 'connections', 'convergence', 'questions']);
    for (const field of WEAVE_SCHEMA.required) {
      const { [field]: _gone, ...rest } = clone(WEAVE);
      expect(`${field}: ${valid(rest)}`).not.toBe(`${field}: valid`);
    }
  });

  it('holds "from your notes" and a stronger main thread only when the writer has them', () => {
    const { fromYourNotes: _f, strongerMainThread: _s, ...plain } = clone(WEAVE);
    expect(valid(plain)).toBe('valid');
    expect(WEAVE_SCHEMA.properties.fromYourNotes.type).toBe('string');
    expect(WEAVE_SCHEMA.properties.strongerMainThread.required).toEqual(['thread', 'reason']);
    expect(valid({ ...plain, strongerMainThread: { thread: 't4' } })).not.toBe('valid');
  });

  it('gives each thread an id, its claim and its role; a thread with no receipt and no reason, as the director adds one, is valid', () => {
    const thread = WEAVE_SCHEMA.properties.threads.items;
    expect(thread.required).toEqual(['id', 'claim', 'role']);
    expect(Object.keys(thread.properties)).toEqual(['id', 'claim', 'role', 'receipt', 'reason', 'verdict']);
    expect(thread.properties.role.enum).toEqual([...WEAVE_ROLES]);
    expect(thread.properties.verdict.type).toBe('boolean');
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { id: 't7', claim: 'The guest list was rewritten that morning.', role: 'grounds-it' }] };
    expect(valid(added)).toBe('valid');
    expect(valid(withThread('t2', (t) => ({ ...t, role: 'supports-it' })))).not.toBe('valid');
  });

  it('the roles are the main thread, the four roles toward it, and left out', () => {
    expect([...WEAVE_ROLES]).toEqual(['main-thread', 'grounds-it', 'complicates-it', 'mirrors-it', 'carries-it-forward', 'left-out']);
    expect(MAIN_THREAD_ROLE).toBe('main-thread');
    expect(LEFT_OUT_ROLE).toBe('left-out');
  });

  it('gives each connection an id, its kind, the two threads it joins and what it is', () => {
    const connection = WEAVE_SCHEMA.properties.connections.items;
    expect(connection.required).toEqual(['id', 'kind', 'joins', 'detail']);
    expect(connection.properties.kind.enum).toEqual([...CONNECTION_KINDS]);
    expect([...CONNECTION_KINDS]).toEqual(['person', 'moment', 'document', 'line']);
    expect(connection.properties.joins).toMatchObject({ type: 'array', items: { type: 'string' } });
    const cause = { ...clone(WEAVE), connections: [{ id: 'c9', kind: 'cause', joins: ['t1', 't2'], detail: 'x' }] };
    expect(valid(cause)).not.toBe('valid');
  });

  it('carries the questions in their own property, the one writer-questions.js defines', () => {
    expect(WEAVE_SCHEMA.properties[WEAVE_QUESTIONS_KEY]).toBe(WEAVE_QUESTIONS_PROPERTY);
    expect(WEAVE_QUESTIONS_KEY).toBe('questions');
    expect(WEAVE_SCHEMA.properties.writerQuestions).toBeUndefined();
  });

  it('every description in the schema is free of an em-dash and names no theme', () => {
    const text = JSON.stringify(WEAVE_SCHEMA);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/Nova|NovaNews|detective/i);
  });
});

describe("the weave's questions (C15)", () => {
  it('each carries an id, its kind, what it is about, the question and what its answer changes', () => {
    expect(WEAVE_QUESTIONS_PROPERTY.type).toBe('array');
    expect(WEAVE_QUESTIONS_PROPERTY.items.required).toEqual(['id', 'kind', 'about', 'question', 'changes']);
    expect(WEAVE_QUESTIONS_PROPERTY.items.properties.kind.enum).toEqual([...WEAVE_QUESTION_KINDS]);
  });

  it("the kinds are C15's three cases: a player, a pronoun, and a figure that looks wrong", () => {
    expect([...WEAVE_QUESTION_KINDS]).toEqual(['player', 'pronoun', 'figure']);
    expect(WEAVE_QUESTIONS_PROPERTY.items.properties.about.description).toMatch(/figure/);
  });

  it('the outline and bundle keep their own property until their writers drop the field', () => {
    expect(WRITER_QUESTIONS_PROPERTY).not.toBe(WEAVE_QUESTIONS_PROPERTY);
    expect(WRITER_QUESTIONS_PROPERTY.items.properties.kind.enum).toEqual(['player', 'pronoun', 'ledger']);
  });

  describe('weaveQuestionsOf', () => {
    it('keeps each well-formed question, trimmed at the ends, in order', () => {
      const q = { id: ' q1 ', kind: 'player', about: ' Kai ', question: ' What did Kai do? ', changes: ' Where Kai appears. ' };
      expect(weaveQuestionsOf([q])).toEqual([{ id: 'q1', kind: 'player', about: 'Kai', question: 'What did Kai do?', changes: 'Where Kai appears.' }]);
    });

    it.each([
      ['no id', { kind: 'player', about: 'Kai', question: 'Q?', changes: 'C.' }],
      ['an unknown kind', { id: 'q1', kind: 'ledger', about: 'Kai', question: 'Q?', changes: 'C.' }],
      ['no question', { id: 'q1', kind: 'player', about: 'Kai', changes: 'C.' }],
      ['a blank about', { id: 'q1', kind: 'player', about: '  ', question: 'Q?', changes: 'C.' }],
      ['no changes', { id: 'q1', kind: 'player', about: 'Kai', question: 'Q?' }]
    ])('leaves out an entry with %s', (_name, entry) => {
      expect(weaveQuestionsOf([entry])).toEqual([]);
    });

    it('reads anything that is not a list as no questions', () => {
      expect(weaveQuestionsOf(undefined)).toEqual([]);
      expect(weaveQuestionsOf({ id: 'q1' })).toEqual([]);
    });
  });

  describe('carriedWeaveQuestions', () => {
    const Q1 = { id: 'q1', kind: 'player', about: 'Kai', question: 'What did Kai do?', changes: 'Where Kai appears.' };
    const Q2 = { id: 'q2', kind: 'pronoun', about: 'Sloane', question: 'Which pronoun for Sloane?', changes: "Sloane's pronoun." };
    const Q3 = { id: 'q3', kind: 'figure', about: 'The 9:40 sale', question: 'A duplicate?', changes: 'The sale count.' };

    it('an automatic pass keeps each question it left out, in its place, and takes its own version of one it returned', () => {
      const reworded = { ...Q2, question: 'Which pronoun does Sloane use?' };
      expect(carriedWeaveQuestions([reworded, Q3], [Q1, Q2], { afterDirectorNote: false })).toEqual([Q1, reworded, Q3]);
    });

    it("after the director's note, the rework's list replaces the old one", () => {
      expect(carriedWeaveQuestions([Q3], [Q1, Q2], { afterDirectorNote: true })).toEqual([Q3]);
    });

    it('a rework that returns no list keeps the previous one', () => {
      expect(carriedWeaveQuestions(undefined, [Q1], { afterDirectorNote: true })).toEqual([Q1]);
      expect(carriedWeaveQuestions(undefined, [Q1], { afterDirectorNote: false })).toEqual([Q1]);
    });

    it('throws when the caller does not say whether the rework acts on the director\'s note', () => {
      expect(() => carriedWeaveQuestions([Q1], [Q1])).toThrow(/afterDirectorNote/);
    });
  });
});

describe('the weave helpers', () => {
  it('a weave is an object with a list of threads', () => {
    expect(isWeave(WEAVE)).toBe(true);
    expect(isWeave({ story: 'x' })).toBe(false);
    expect(isWeave(null)).toBe(false);
    expect(isWeave([WEAVE])).toBe(false);
  });

  it("counts the writer's words in the fields the meeting prints, without the director's own", () => {
    const words = (text) => text.split(/\s+/).filter(Boolean).length;
    const expected = [
      WEAVE.story, WEAVE.question, WEAVE.headline, WEAVE.convergence,
      ...WEAVE.threads.flatMap((t) => [t.claim, t.reason || '']),
      ...WEAVE.connections.map((c) => c.detail),
      WEAVE.strongerMainThread.reason,
      ...WEAVE.questions.flatMap((q) => [q.about, q.question, q.changes])
    ].reduce((sum, text) => sum + words(text), 0);
    expect(weaveWordCount(WEAVE)).toBe(expected);
    const { fromYourNotes: _notes, ...withoutNotes } = clone(WEAVE);
    expect(weaveWordCount(withoutNotes)).toBe(expected);
  });

  it('states the bound once: 500 words for a weave of about 400', () => {
    expect(WEAVE_WORD_BOUND).toBe(500);
  });

  it('stamps a version from the content alone: key order and the fact check\'s mark leave it unchanged', () => {
    const reordered = Object.fromEntries(Object.entries(clone(WEAVE)).reverse());
    expect(weaveKey(reordered)).toBe(weaveKey(WEAVE));
    expect(weaveKey(withFactCheckMark(WEAVE, { at: 't', ready: false, fixes: 0 }))).toBe(weaveKey(WEAVE));
    expect(weaveKey({ ...clone(WEAVE), story: 'Another story.' })).not.toBe(weaveKey(WEAVE));
    expect(weaveKey(WEAVE)).toMatch(/^[0-9a-f]{12}$/);
  });

  it("marks the weave the fact check judged on the weave itself, and leaves the mark out of what a prompt prints", () => {
    expect(FACT_CHECK_MARK_KEY).toBe('_factCheck');
    expect(isWeaveJudged(WEAVE)).toBe(false);
    expect(factCheckMarkOf(WEAVE)).toBeNull();
    const marked = withFactCheckMark(WEAVE, { at: '2026-10-03T00:00:00.000Z', ready: true, fixes: 0 });
    expect(isWeaveJudged(marked)).toBe(true);
    expect(factCheckMarkOf(marked)).toEqual({ at: '2026-10-03T00:00:00.000Z', ready: true, fixes: 0 });
    expect(weaveForPrompt(marked)).toEqual(WEAVE);
    expect(WEAVE).not.toHaveProperty('_factCheck');
  });

  it('the meeting is approved once the director has approved the stop', () => {
    expect(isMeetingApproved({ selectedArcs: ['weave'] })).toBe(true);
    expect(isMeetingApproved({ selectedArcs: [] })).toBe(false);
    expect(isMeetingApproved({})).toBe(false);
  });

  it('names the source the weave checks stamp on validationResults', () => {
    expect(WEAVE_CHECKS_SOURCE).toBe('weave-checks');
    expect(LEDGER_RECEIPT).toBe('ledger');
  });
});

describe('the weave checks (checkWeave)', () => {
  it('a weave in 0926262\'s shape passes every check', () => {
    expect(check(WEAVE)).toEqual([]);
  });

  it('each failure is one line that names the defect and its fix', () => {
    const broken = {
      ...withThread('t3', ({ receipt: _r, ...t }) => t),
      fromYourNotes: 'words the director never wrote'
    };
    const failures = check(broken);
    expect(failures.length).toBe(2);
    failures.forEach(({ message }) => {
      expect(message).not.toContain('\n');
      expect(message.length).toBeGreaterThan(40);
    });
  });

  describe('each thread has a receipt naming a document in the record, or the ledger', () => {
    it('fires on a thread with no receipt, naming the thread and the fix', () => {
      const failures = check(withThread('t3', ({ receipt: _r, ...t }) => t));
      expect(typesOf(failures)).toEqual(['thread-without-receipt']);
      expect(failures[0].message).toMatch(/"t3"/);
      expect(failures[0].message).toMatch(/<RECORD>/);
      expect(failures[0].message).toMatch(/"ledger"/);
    });

    it('fires on a receipt that names no document, naming the receipt', () => {
      const failures = check(withThread('t3', (t) => ({ ...t, receipt: 'zzz999' })));
      expect(typesOf(failures)).toEqual(['receipt-not-in-record']);
      expect(failures[0].message).toMatch(/"t3"/);
      expect(failures[0].message).toMatch(/"zzz999"/);
    });

    it('is silent on a document id in another case, a paper document named as the record names it, and "Ledger"', () => {
      expect(check(withThread('t3', (t) => ({ ...t, receipt: 'ROW001' })))).toEqual([]);
      expect(check(withThread('t3', (t) => ({ ...t, receipt: 'Kai Coat Check Note' })))).toEqual([]);
      expect(check(withThread('t2', (t) => ({ ...t, receipt: ' Ledger ' })))).toEqual([]);
    });
  });

  describe("the room's verdict is one of the threads", () => {
    it('fires when no thread carries the verdict', () => {
      const failures = check(withThread('t1', ({ verdict: _v, ...t }) => t));
      expect(typesOf(failures)).toEqual(['no-verdict-thread']);
      expect(failures[0].message).toMatch(/"verdict": true/);
    });

    it('fires when the thread that carries it is left out', () => {
      const failures = check(withThread('t1', (t) => ({ ...t, role: 'left-out', reason: 'Not needed.' })));
      expect(typesOf(failures)).toEqual(['no-verdict-thread']);
    });

    it('is silent when the verdict is a thread in any role but left out', () => {
      const moved = withThread('t1', (t) => ({ ...t, role: 'grounds-it' }));
      expect(check(moved)).toEqual([]);
    });
  });

  describe('every connection joins two threads the weave holds', () => {
    const withConnection = (connection) => ({ ...clone(WEAVE), connections: [connection] });

    it('fires on a connection that names a thread the weave does not hold', () => {
      const failures = check(withConnection({ id: 'c9', kind: 'person', joins: ['t1', 't9'], detail: 'x' }));
      expect(typesOf(failures)).toEqual(['connection-joins-unknown-thread']);
      expect(failures[0].message).toMatch(/"c9"/);
      expect(failures[0].message).toMatch(/"t9"/);
    });

    it.each([
      ['one thread', ['t1']],
      ['three threads', ['t1', 't2', 't3']],
      ['the same thread twice', ['t1', 't1']]
    ])('fires on a connection that joins %s', (_name, joins) => {
      expect(typesOf(check(withConnection({ id: 'c9', kind: 'moment', joins, detail: 'x' })))).toEqual(['connection-joins-unknown-thread']);
    });

    it('is silent on a connection between two threads of the weave, a left-out one included', () => {
      expect(check(withConnection({ id: 'c9', kind: 'line', joins: ['t6', 't1'], detail: 'x' }))).toEqual([]);
    });
  });

  describe('each left-out thread has its reason', () => {
    it('fires on a left-out thread with no reason', () => {
      const failures = check(withThread('t6', ({ reason: _r, ...t }) => t));
      expect(typesOf(failures)).toEqual(['left-out-without-reason']);
      expect(failures[0].message).toMatch(/"t6"/);
    });

    it('fires on a blank reason, and is silent on a thread in the story with none', () => {
      expect(typesOf(check(withThread('t6', (t) => ({ ...t, reason: '  ' }))))).toEqual(['left-out-without-reason']);
      expect(check(withThread('t2', (t) => ({ ...t, reason: undefined })))).toEqual([]);
    });
  });

  describe('"from your notes" is word for word in the director\'s notes or corrections', () => {
    it('fires on words the director did not write', () => {
      const failures = check({ ...clone(WEAVE), fromYourNotes: 'the frame this morning failed completely' });
      expect(typesOf(failures)).toEqual(['from-your-notes-not-verbatim']);
      expect(failures[0].message).toMatch(/the frame this morning failed completely/);
    });

    it('is silent on the notes\' words, a correction\'s words, the words in quotation marks, and no field at all', () => {
      expect(check({ ...clone(WEAVE), fromYourNotes: 'Kai to Sloane, not Sloane to Kai' })).toEqual([]);
      expect(check({ ...clone(WEAVE), fromYourNotes: `"${WEAVE.fromYourNotes}"` })).toEqual([]);
      expect(check({ ...clone(WEAVE), fromYourNotes: `“${WEAVE.fromYourNotes}”` })).toEqual([]);
      const { fromYourNotes: _f, ...thin } = clone(WEAVE);
      expect(check(thin)).toEqual([]);
    });

    it('a session whose notes hold no read passes with no "from your notes"', () => {
      const { fromYourNotes: _f, ...thin } = clone(WEAVE);
      expect(checkWeave(thin, { recordIds: RECORD_IDS, directorWords: ['Short notes.'] })).toEqual([]);
    });
  });

  describe("the writer's words come to no more than the bound", () => {
    const longClaim = (words) => Array.from({ length: words }, (_, i) => `word${i}`).join(' ');

    it('fires past the bound, naming the count and the bound', () => {
      const over = WEAVE_WORD_BOUND - weaveWordCount(WEAVE) + 1;
      const long = withThread('t2', (t) => ({ ...t, claim: `${t.claim} ${longClaim(over)}` }));
      const failures = check(long);
      expect(typesOf(failures)).toEqual(['over-length']);
      expect(failures[0].message).toContain(String(weaveWordCount(long)));
      expect(failures[0].message).toContain(String(WEAVE_WORD_BOUND));
    });

    it('is silent at the bound, and the director\'s words in "from your notes" do not count', () => {
      const room = WEAVE_WORD_BOUND - weaveWordCount(WEAVE);
      const atBound = withThread('t2', (t) => ({ ...t, claim: `${t.claim} ${longClaim(room)}` }));
      expect(weaveWordCount(atBound)).toBe(WEAVE_WORD_BOUND);
      expect(check(atBound)).toEqual([]);
      const longNotes = `${NOTES} ${longClaim(600)}`;
      const quoted = { ...atBound, fromYourNotes: longNotes };
      expect(checkWeave(quoted, { recordIds: RECORD_IDS, directorWords: [longNotes] })).toEqual([]);
    });
  });
});
