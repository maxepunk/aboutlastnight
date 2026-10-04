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
const writerQuestions = require('../writer-questions');
const {
  WEAVE_QUESTIONS_KEY, WEAVE_QUESTION_KINDS, WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf, carriedWeaveQuestions
} = writerQuestions;

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

  // Brief 4.6: the outline's questions went with the map; brief 4.7b: the article's, the
  // last writer's questions after the meeting (spec section 10). The weave's are the only
  // questions a writer asks.
  it("the map and the article carry none: the weave's are the only writer's questions", () => {
    expect(writerQuestions).not.toHaveProperty('WRITER_QUESTIONS_PROPERTY');
    expect(require('../schemas/content-bundle.schema.json').properties).not.toHaveProperty('writerQuestions');
    expect(require('../schemas/outline.schema.json').properties).not.toHaveProperty('writerQuestions');
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

    // Brief 4.5 (ruling 4): the director's answer travels with its question.
    it("keeps the director's answer, trimmed at the ends only; a blank answer is no answer", () => {
      const q = { id: 'q1', kind: 'player', about: 'Kai', question: 'What did Kai do?', changes: 'Where Kai appears.' };
      expect(weaveQuestionsOf([{ ...q, answer: '  Kai sold the  first memory.  ' }])).toEqual([{ ...q, answer: 'Kai sold the  first memory.' }]);
      expect(weaveQuestionsOf([{ ...q, answer: '   ' }])).toEqual([q]);
      expect(weaveQuestionsOf([{ ...q, answer: 42 }])).toEqual([q]);
    });
  });

  // Brief 4.5 (C15, ruling 4): every rework keeps each question the director has not
  // answered, and code keeps each answered question whole, apart from the model's output.
  describe('carriedWeaveQuestions', () => {
    const Q1 = { id: 'q1', kind: 'player', about: 'Kai', question: 'What did Kai do?', changes: 'Where Kai appears.' };
    const Q2 = { id: 'q2', kind: 'pronoun', about: 'Sloane', question: 'Which pronoun for Sloane?', changes: "Sloane's pronoun." };
    const Q3 = { id: 'q3', kind: 'figure', about: 'The 9:40 sale', question: 'A duplicate?', changes: 'The sale count.' };
    const ANSWERED = { ...Q1, answer: 'Kai ran the coat check all night.' };

    it('a rework keeps each question it left out, in its place, and takes its own version of one it returned', () => {
      const reworded = { ...Q2, question: 'Which pronoun does Sloane use?' };
      expect(carriedWeaveQuestions([reworded, Q3], [Q1, Q2])).toEqual([Q1, reworded, Q3]);
    });

    it("an unanswered question a director's round left out comes back: only an answer settles a question", () => {
      expect(carriedWeaveQuestions([Q3], [Q1, Q2])).toEqual([Q1, Q2, Q3]);
    });

    it('a rework that returns no list keeps the previous one', () => {
      expect(carriedWeaveQuestions(undefined, [Q1, ANSWERED])).toEqual([Q1, ANSWERED]);
      expect(carriedWeaveQuestions(undefined, [ANSWERED])).toEqual([ANSWERED]);
    });

    it('an answered question stays whole, as the director answered it, whatever the rework returns', () => {
      const reworded = { ...Q1, question: 'Where was Kai?', changes: 'Nothing.' };
      expect(carriedWeaveQuestions([reworded, Q3], [ANSWERED, Q2])).toEqual([ANSWERED, Q2, Q3]);
      expect(carriedWeaveQuestions([], [Q2, ANSWERED])).toEqual([Q2, ANSWERED]);
    });

    it("no answer is read from a rework's questions", () => {
      expect(carriedWeaveQuestions([{ ...Q2, answer: 'he/him' }, { ...Q3, answer: 'Yes.' }], [Q2])).toEqual([Q2, Q3]);
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

  // Brief 4.5 (ruling 1): the meeting's own approval, which the director's approve sets.
  // The old arc selection approves nothing.
  it('the meeting is approved once the director has approved the stop', () => {
    expect(isMeetingApproved({ meetingApproved: true })).toBe(true);
    expect(isMeetingApproved({ meetingApproved: false })).toBe(false);
    expect(isMeetingApproved({ meetingApproved: null, selectedArcs: ['weave'] })).toBe(false);
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

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: the meeting's plumbing (spec 4.3, 4.4; rulings 2 and 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// The director strikes a connection by marking it `struck: true`, so the meeting can show
// it struck; every reader of the story reads the live connections alone. The checks read
// only the writer's text (R11): the director's share of the weave, read from their
// standing edits, is never a check's failure, and a receipt the director typed that names
// no document is a concern.
describe('4.5: struck connections, the round mark and the views of the weave', () => {
  const {
    MEETING_ROUNDS, STRUCK_KEY, isStruck, liveConnections, meetingRoundOf, weaveForRework, weaveForJudge, withStruckConnections
  } = require('../weave');
  const struck = () => ({ ...clone(WEAVE), connections: clone(WEAVE).connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c)) });

  it('a connection the director struck carries struck: true, and the live connections leave it out', () => {
    expect(STRUCK_KEY).toBe('struck');
    const weave = struck();
    expect(isStruck(weave.connections[1])).toBe(true);
    expect(isStruck(weave.connections[0])).toBe(false);
    expect(liveConnections(weave).map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(liveConnections(null)).toEqual([]);
  });

  it("a struck connection's words are not the weave's", () => {
    const weave = struck();
    const detailWords = WEAVE.connections[1].detail.split(/\s+/).filter(Boolean).length;
    expect(weaveWordCount(weave)).toBe(weaveWordCount(WEAVE) - detailWords);
  });

  it('the round mark is the reweave or the send-back, and nothing else', () => {
    expect([...MEETING_ROUNDS]).toEqual(['reweave', 'send-back']);
    expect(meetingRoundOf({ _meetingRound: 'reweave' })).toBe('reweave');
    expect(meetingRoundOf({ _meetingRound: 'send-back' })).toBe('send-back');
    expect(meetingRoundOf({ _meetingRound: 'approve' })).toBeNull();
    expect(meetingRoundOf({ _arcFeedback: 'Rethink it.' })).toBeNull();
    expect(meetingRoundOf({})).toBeNull();
  });

  it('a rework reads the weave without its code-owned keys or its struck connections, answers kept', () => {
    const weave = withFactCheckMark({ ...struck(), questions: [{ ...WEAVE.questions[0], answer: 'Print it as the room said it.' }] }, { at: 't', ready: true, fixes: 0 });
    const view = weaveForRework(weave);
    expect(view).not.toHaveProperty('_factCheck');
    expect(view.connections.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(view.questions[0].answer).toBe('Print it as the room said it.');
    expect(weave.connections).toHaveLength(4);
  });

  it("the fact check reads the weave with no struck connection and no answer: the answers are the director's words, read apart", () => {
    const weave = { ...struck(), questions: [{ ...WEAVE.questions[0], answer: 'Print it as the room said it.' }] };
    const view = weaveForJudge(weave);
    expect(view.connections.map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(view.questions[0]).not.toHaveProperty('answer');
    expect(view.questions[0].question).toBe(WEAVE.questions[0].question);
  });

  describe('withStruckConnections: the struck connections a rework never saw come back where they sat', () => {
    it('puts each one the output lacks back in its place', () => {
      const previous = struck();
      const output = { ...clone(WEAVE), connections: clone(WEAVE).connections.filter((c) => c.id !== 'c2') };
      const back = withStruckConnections(output, previous);
      expect(back.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
      expect(back.connections[1]).toEqual(previous.connections[1]);
      expect(output.connections).toHaveLength(3);
    });

    // Brief 4.14a: the struck connection itself; another connection under its id takes an id
    // of its own (the 4.14a block below).
    it('leaves the struck connection the output returned under its id as the output has it', () => {
      const previous = struck();
      const output = clone(WEAVE);
      expect(withStruckConnections(output, previous)).toEqual(output);
    });

    it('returns the output as it is when nothing was struck', () => {
      const output = clone(WEAVE);
      expect(withStruckConnections(output, clone(WEAVE))).toBe(output);
    });
  });
});

describe('4.5: every id is unique, and the stronger main thread names a thread (ruling 3)', () => {
  it('fires on two threads that share an id, naming the id and the fix', () => {
    const doubled = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[1] }] };
    const failures = check(doubled);
    expect(typesOf(failures)).toEqual(['duplicate-id']);
    expect(failures[0].message).toMatch(/threads share the id "t2"/);
  });

  it('fires on two connections, and on two questions, that share an id', () => {
    const connections = { ...clone(WEAVE), connections: [...clone(WEAVE).connections, { ...clone(WEAVE).connections[0], detail: 'Another.' }] };
    expect(check(connections).map((f) => f.message)).toEqual([expect.stringMatching(/connections share the id "c1"/)]);
    const questions = { ...clone(WEAVE), questions: [...clone(WEAVE).questions, { ...clone(WEAVE).questions[0], question: 'Again?' }] };
    expect(check(questions).map((f) => f.message)).toEqual([expect.stringMatching(/questions share the id "q1"/)]);
  });

  it('fires on a stronger main thread that names no thread of the weave', () => {
    const failures = check({ ...clone(WEAVE), strongerMainThread: { thread: 't9', reason: 'A stronger story.' } });
    expect(typesOf(failures)).toEqual(['stronger-main-thread-unknown']);
    expect(failures[0].message).toMatch(/"t9"/);
  });

  it('is silent on the weave as written', () => {
    expect(check(WEAVE)).toEqual([]);
  });
});

describe("4.5: the checks read only the writer's text (R11, ruling 2)", () => {
  const { weaveFindings } = require('../weave');
  /** The director's share of the weave, as lib/hand-edit-diff.js weaveDirectorsShare reads it from the edits. */
  const share = (parts = {}) => ({ addedThreads: {}, reroledThreads: {}, fields: {}, threadFields: {}, ...parts });
  const concerns = (weave, directorsShare) => weaveFindings(weave, { recordIds: RECORD_IDS, directorsShare }).concerns;

  it('a thread the director added, with no receipt and no reason, is no failure', () => {
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { id: 't7', claim: 'The guest list was rewritten that morning.', role: 'left-out' }] };
    expect(typesOf(check(added))).toEqual(['thread-without-receipt', 'left-out-without-reason']);
    expect(check(added, { directorsShare: share({ addedThreads: { t7: 'E1' } }) })).toEqual([]);
  });

  it('a thread the director re-roled may have no reason, and no receipt', () => {
    const reroled = withThread('t2', ({ receipt: _r, ...t }) => ({ ...t, role: 'left-out' }));
    expect(typesOf(check(reroled))).toEqual(['thread-without-receipt', 'left-out-without-reason']);
    expect(check(reroled, { directorsShare: share({ reroledThreads: { t2: 'E2' } }) })).toEqual([]);
  });

  it('a receipt the director typed that names no document is a concern, never a failure', () => {
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { id: 't7', claim: 'The guest list was rewritten.', role: 'grounds-it', receipt: 'zzz999' }] };
    const directorsShare = share({ addedThreads: { t7: 'E1' } });
    expect(check(added, { directorsShare })).toEqual([]);
    const found = concerns(added, directorsShare);
    expect(found).toEqual([{ type: 'receipt-not-in-record', editIds: ['E1'], finding: expect.stringMatching(/"t7".*"zzz999"/) }]);
    // The same receipt typed over a writer's thread.
    const typed = withThread('t3', (t) => ({ ...t, receipt: 'zzz999' }));
    expect(check(typed, { directorsShare: share({ threadFields: { 't3.receipt': 'E4' } }) })).toEqual([]);
    expect(concerns(typed, share({ threadFields: { 't3.receipt': 'E4' } })).map((c) => c.editIds)).toEqual([['E4']]);
    // A receipt the writer wrote stays the writer's failure.
    expect(typesOf(check(typed))).toEqual(['receipt-not-in-record']);
    expect(concerns(typed, share())).toEqual([]);
  });

  it("a verdict thread the director left out is a concern on that edit, not the writer's failure", () => {
    const leftOut = withThread('t1', (t) => ({ ...t, role: 'left-out', reason: 'The director cut it.' }));
    const directorsShare = share({ reroledThreads: { t1: 'E2' } });
    expect(check(leftOut, { directorsShare })).toEqual([]);
    expect(concerns(leftOut, directorsShare)).toEqual([{ type: 'no-verdict-thread', editIds: ['E2'], finding: expect.stringMatching(/"t1".*verdict/) }]);
  });

  it("the director's typed words and the threads they added add no length", () => {
    const longText = Array.from({ length: WEAVE_WORD_BOUND }, (_, i) => `word${i}`).join(' ');
    const typed = { ...clone(WEAVE), story: longText, threads: [...clone(WEAVE).threads, { id: 't7', claim: longText, role: 'grounds-it' }] };
    expect(typesOf(check(typed))).toContain('over-length');
    expect(check(typed, { directorsShare: share({ fields: { story: 'E1' }, addedThreads: { t7: 'E2' } }) })).toEqual([]);
    expect(weaveWordCount(typed, share({ fields: { story: 'E1' }, addedThreads: { t7: 'E2' } }))).toBe(weaveWordCount(WEAVE) - weaveWordCount({ story: WEAVE.story, threads: [] }));
  });

  it('"from your notes" the director typed is not checked against the notes', () => {
    const typed = { ...clone(WEAVE), fromYourNotes: 'the director put this in their own words' };
    expect(typesOf(check(typed))).toEqual(['from-your-notes-not-verbatim']);
    expect(check(typed, { directorsShare: share({ fields: { fromYourNotes: 'E1' } }) })).toEqual([]);
  });

  it('a struck connection is no failure, whatever it joins', () => {
    const weave = { ...clone(WEAVE), connections: [...clone(WEAVE).connections, { id: 'c9', kind: 'person', joins: ['t1', 't99'], detail: 'x', struck: true }] };
    expect(check(weave)).toEqual([]);
  });
});

// Fix round 1, finding 3: every id join at the story meeting reads an id one way
// (weaveIdOf) and a repeated id by one rule (repeatedIds), which the meeting's gate
// (lib/meeting.js), the checks and the diff (lib/hand-edit-diff.js) all call.
describe('4.5 fix round 1: one reading of an id, one rule for a repeated id (finding 3)', () => {
  const { weaveIdOf, repeatedIds } = require('../weave');

  it('reads an id trimmed, and nothing else as an id', () => {
    expect(weaveIdOf({ id: ' t6 ' })).toBe('t6');
    expect([weaveIdOf({ id: 7 }), weaveIdOf({}), weaveIdOf(null), weaveIdOf('t6')]).toEqual(['', '', '', '']);
  });

  it('names each id more than one element carries, once, in the order it first repeats', () => {
    expect(repeatedIds([{ id: 't6' }, { id: 't1' }, { id: 't1 ' }, { id: 't6' }, { id: 't6' }, { id: '' }, { id: ' ' }, null, 'x'])).toEqual(['t1', 't6']);
    expect(repeatedIds(undefined)).toEqual([]);
  });

  it('the checks read a repeat by it: "t2" and "t2 " are one id', () => {
    const doubled = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[1], id: 't2 ' }] };
    expect(check(doubled).map((f) => f.message)).toEqual([expect.stringMatching(/threads share the id "t2"/)]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: the weave's follow-ups (brief 4.5b)
// ═══════════════════════════════════════════════════════════════════════════

// R11 exempts the thread the director added, not the writer's duplicate of its id. Filed
// as a concern on the director's edit, the writer's repeat sent no rework, and the
// director's next change to their own thread was refused (4.5 review, minor 6). The
// failure's line tells the rework which thread keeps the id: the director's edits find
// their thread by it.
describe("4.5b: a writer's repeat is the writer's failure", () => {
  const { weaveFindings } = require('../weave');
  const share = (parts = {}) => ({ addedThreads: {}, reroledThreads: {}, fields: {}, threadFields: {}, ...parts });
  const findings = (weave, directorsShare) => weaveFindings(weave, { recordIds: RECORD_IDS, directorWords: DIRECTOR_WORDS, directorsShare });
  const ADDED = { id: 't7', claim: 'The guest list was rewritten that morning.', role: 'grounds-it' };
  const WRITERS_T7 = { id: 't7', claim: 'A thread the writer put under t7.', role: 'grounds-it', receipt: 'ledger' };

  it("a repeat under the id of a thread the director added is a failure, not a concern, and says which thread keeps the id", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, clone(ADDED), clone(WRITERS_T7)] };
    const { failures, concerns } = findings(weave, share({ addedThreads: { t7: 'E1' } }));
    expect(failures).toEqual([{
      type: 'duplicate-id',
      message: 'Two threads share the id "t7", and one of them is the thread the director added (E1 in <HAND_EDITS>). Keep "t7" on the director\'s thread, since their edits find it by its id, and give the other thread an id of its own; make each connection and the stronger main thread name the thread they mean.'
    }]);
    expect(concerns).toEqual([]);
  });

  it("a repeat under the id of a thread the director re-roled or rewrote names each of their edits there", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[2], claim: 'A second t3 the writer wrote.' }] };
    const { failures, concerns } = findings(weave, share({ reroledThreads: { t3: 'E2' }, threadFields: { 't3.claim': 'E4' } }));
    expect(failures.map((f) => f.message)).toEqual([expect.stringMatching(/^Two threads share the id "t3", and one of them is the thread the director changed \(E2 and E4 in <HAND_EDITS>\)\. Keep "t3" on the director's thread/)]);
    expect(concerns).toEqual([]);
  });

  it('a repeat no edit of the director\'s is under keeps its line', () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[1] }] };
    expect(findings(weave, share({ addedThreads: { t7: 'E1' } })).failures).toEqual([{
      type: 'duplicate-id',
      message: 'Two threads share the id "t2". Give each thread an id of its own, and make each connection and the stronger main thread name the thread they mean.'
    }]);
  });
});

// The fields the story meeting prints are one list (WEAVE_PRINTED_FIELDS), which the edits'
// reading of a weave (lib/hand-edit-diff.js weaveParts) and the writer's length
// (weaveWordCount) both walk, so a field added to the weave is added once (4.5 review,
// minor 10). "From your notes" is the one field they read differently: it quotes the
// director, so it adds nothing to the writer's length.
describe("4.5b: one list of the weave's printed fields", () => {
  const { WEAVE_PRINTED_FIELDS, printedWeaveFields } = require('../weave');
  const { _testing: { printedLeaves } } = require('../hand-edit-diff');

  /** A weave whose every printed field holds a word of its own, and a struck connection. */
  function marked() {
    const word = (where) => `w-${where}`;
    const weave = Object.fromEntries(WEAVE_PRINTED_FIELDS.weave.map((field) => [field, word(field)]));
    const element = (part, i) => Object.fromEntries(WEAVE_PRINTED_FIELDS[part].map((field) => [field, word(`${part}${i}-${field}`)]));
    weave.threads = [0, 1].map((i) => ({ id: `t${i}`, role: 'grounds-it', ...element('threads', i) }));
    weave.connections = [{ id: 'c0', kind: 'person', joins: ['t0', 't1'], ...element('connections', 0) }, { id: 'c1', kind: 'line', joins: ['t0', 't1'], detail: 'struck words', struck: true }];
    weave.strongerMainThread = { thread: 't1', ...element('strongerMainThread', 0) };
    weave.questions = [{ id: 'q0', kind: 'player', ...element('questions', 0) }];
    return weave;
  }

  it('names each part of the weave and its fields, and flags "from your notes" as the director\'s words', () => {
    expect(WEAVE_PRINTED_FIELDS).toEqual({
      weave: ['story', 'question', 'headline', 'fromYourNotes', 'convergence'],
      threads: ['claim', 'reason'],
      connections: ['detail'],
      strongerMainThread: ['reason'],
      questions: ['about', 'question', 'changes'],
      directorsWords: ['fromYourNotes']
    });
    expect(Object.isFrozen(WEAVE_PRINTED_FIELDS)).toBe(true);
  });

  it('the edits read every printed field, in the order the meeting prints it, and no struck connection', () => {
    const weave = marked();
    const texts = printedWeaveFields(weave).map((entry) => entry.text);
    expect(printedLeaves(weave)).toEqual(texts);
    expect(texts).toEqual([
      'w-story', 'w-question', 'w-headline', 'w-fromYourNotes', 'w-convergence',
      'w-threads0-claim', 'w-threads0-reason', 'w-threads1-claim', 'w-threads1-reason',
      'w-connections0-detail', 'w-strongerMainThread0-reason',
      'w-questions0-about', 'w-questions0-question', 'w-questions0-changes'
    ]);
  });

  it('the writer\'s length counts the same fields but "from your notes"', () => {
    const weave = marked();
    const fields = printedWeaveFields(weave);
    expect(fields.filter((entry) => entry.directorsWords).map((entry) => entry.field)).toEqual(['fromYourNotes']);
    expect(weaveWordCount(weave)).toBe(fields.length - 1);
  });
});

// The questions' carry pairs a repeated id's elements by their place under it, as the diff
// pairs them (brief 4.5b): one rule for that place, beside the one reading of an id.
describe("4.5b: an element's place under its id (occurrenceKeys)", () => {
  const { occurrenceKeys } = require('../weave');

  it('numbers each element under its id in order, index for index with the list, and gives an element with no id no place', () => {
    expect(occurrenceKeys([{ id: 'q1' }, { id: 'q2' }, { id: ' q1 ' }, { id: '' }, null, { id: 'q1' }]))
      .toEqual(['0:q1', '0:q2', '1:q1', null, null, '2:q1']);
    expect(occurrenceKeys(undefined)).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the meeting's last defects (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
//
// Meeting 2: a connection that joins a thread the director left out stayed in the story, so
// the map check demanded it land in a beat and spent the map's one rework. It goes out of the
// story with its thread, as a struck connection does, and comes back when the thread does;
// the weave's own checks still read every connection the director did not strike.
describe('4.14a: a connection that joins a left-out thread goes out of the story with it', () => {
  const { storyConnections, liveConnections, leftOutThreadsJoined } = require('../weave');
  /** WEAVE with one thread's role set. c1 joins t1 and t3; c3 joins t4 and t5. */
  const withRole = (weave, id, role) => ({ ...weave, threads: weave.threads.map((t) => (t.id === id ? { ...t, role } : t)) });

  it('leaves out a connection that joins a left-out thread, as it leaves out a struck one, and names the thread it goes with', () => {
    const weave = withRole(clone(WEAVE), 't3', 'left-out');
    weave.connections[1].struck = true;
    expect(storyConnections(weave).map((c) => c.id)).toEqual(['c3', 'c4']);
    expect(liveConnections(weave).map((c) => c.id)).toEqual(['c1', 'c3', 'c4']);
    expect(leftOutThreadsJoined(weave.connections[0], weave)).toEqual(['t3']);
    expect(leftOutThreadsJoined(weave.connections[2], weave)).toEqual([]);
    const both = withRole(withRole(clone(WEAVE), 't4', 'left-out'), 't5', 'left-out');
    expect(leftOutThreadsJoined(both.connections[2], both)).toEqual(['t4', 't5']);
    expect(storyConnections(null)).toEqual([]);
  });

  it('a connection to the thread comes back when the thread does', () => {
    const out = withRole(clone(WEAVE), 't3', 'left-out');
    expect(storyConnections(out).map((c) => c.id)).not.toContain('c1');
    expect(storyConnections(withRole(out, 't3', 'mirrors-it')).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it("a thread id that also names a thread in the story keeps the connection in it: the writer's repeat is the checks' to name", () => {
    const weave = withRole(clone(WEAVE), 't3', 'left-out');
    weave.threads.push({ id: 't3', claim: 'A second thread under t3.', role: 'grounds-it', receipt: 'ledger' });
    expect(storyConnections(weave).map((c) => c.id)).toContain('c1');
  });

  it("the weave's own checks still read it: a connection that joins a thread the weave does not hold is the writer's failure", () => {
    const weave = withRole(clone(WEAVE), 't3', 'left-out');
    weave.threads[2].reason = 'The director left it out.';
    weave.connections.push({ id: 'c5', kind: 'person', joins: ['t3', 't9'], detail: 'Someone the weave never names.' });
    expect(typesOf(check(weave))).toEqual(['connection-joins-unknown-thread']);
  });
});

// Meeting 1: a rework shown the weave without its struck connections numbered a new connection
// with a struck one's id, and code wrote the struck connection over it. Code strikes again only
// the struck one; any other connection under a struck id keeps its words and joins under a
// fresh id, numbered after every connection id in use, and the struck one goes back where it sat.
describe("4.14a: a rework never takes a struck connection's id", () => {
  const { withStruckConnections, isSameConnection, freshConnectionId } = require('../weave');
  /** WEAVE with c2 (a moment joining t1 and t2) struck. */
  const struck = () => ({ ...clone(WEAVE), connections: clone(WEAVE).connections.map((c) => (c.id === 'c2' ? { ...c, struck: true } : c)) });
  /** A rework's output: WEAVE without c2, with `added` where c2 sat. */
  const reworkWith = (added) => ({ ...clone(WEAVE), connections: [WEAVE.connections[0], added, WEAVE.connections[2], WEAVE.connections[3]] });
  const NEW = { id: 'c2', kind: 'person', joins: ['t6', 't3'], detail: 'Kai: at the coat check, then in the bathroom.' };

  it('another connection under a struck id keeps its words and joins under a fresh id, and the struck one goes back where it sat', () => {
    const previous = struck();
    const output = reworkWith(NEW);
    const back = withStruckConnections(output, previous);
    expect(back.connections.map((c) => [c.id, c.struck === true])).toEqual([['c1', false], ['c2', true], ['c5', false], ['c3', false], ['c4', false]]);
    expect(back.connections[1]).toEqual(previous.connections[1]);
    expect(back.connections[2]).toEqual({ ...NEW, id: 'c5' });
    expect(output.connections[1].id).toBe('c2');
  });

  it('another kind of connection between the same two threads is another connection too', () => {
    const back = withStruckConnections(reworkWith({ id: 'c2', kind: 'person', joins: ['t1', 't2'], detail: 'Sloane: at the scoreboard and at the bar.' }), struck());
    expect(back.connections.map((c) => [c.id, c.struck === true])).toEqual([['c1', false], ['c2', true], ['c5', false], ['c3', false], ['c4', false]]);
  });

  it('the struck one brought back under its id, in other words or with its joins the other way round, stays as the rework wrote it: the restore strikes it again', () => {
    const output = reworkWith({ ...WEAVE.connections[1], joins: ['t2', 't1'], detail: 'The scoreboard: the sale reaches the vote.' });
    expect(withStruckConnections(output, struck())).toEqual(output);
    expect(isSameConnection(output.connections[1], struck().connections[1])).toBe(true);
    expect(isSameConnection(NEW, struck().connections[1])).toBe(false);
  });

  it("the fresh id is numbered after every connection id in use: the output's, the version it started from and the weave the round started from", () => {
    expect(freshConnectionId(new Set(['c1', 'c2', 'c4']))).toBe('c5');
    expect(freshConnectionId(new Set(['link-a']))).toBe('c1');
    const roundStart = { ...struck(), connections: [...struck().connections, { id: 'c7', kind: 'line', joins: ['t1', 't5'], detail: 'A line the round took out.' }] };
    const back = withStruckConnections(reworkWith(NEW), struck(), { roundStart });
    expect(back.connections.find((c) => c.detail === NEW.detail).id).toBe('c8');
  });
});
