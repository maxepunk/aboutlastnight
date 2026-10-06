/**
 * The weave (phase 4, brief 4.4; spec 2026-10-02 sections 4.2 and 4.5; phase 4b, piece 1, brief
 * 1B; spec 2026-10-05 sections 4.1, 5 and 6.1).
 *
 * The arc writer writes one weave at the level of the story: since phase 4b, piece 3 (brief 3B),
 * two or three angles, each a pitch told through the threads it names; the director's words angle
 * 1 rests on; the threads, each a short name and one line in story terms, with its evidence
 * underneath; the connections, each one line with its evidence; and the questions for the
 * director. Code checks it (checkWeave): the angles, the evidence, the story terms, the structure,
 * and the meeting's page within its bound (the count its node passes). The fact check marks the
 * weave it judged.
 *
 * Two weaves below, each in a real session's shape with invented text (the repo is public): the
 * shape and the story level are held on a weave in 100226's shape (fixtures/story-level-weave.js),
 * and the rest on one in 0926262's shape (two angles over six threads, one thread no angle uses,
 * four connections of four kinds, a figure question).
 */

const Ajv = require('ajv');
const weaveLib = require('../weave');
const {
  ANGLE_FIELDS, CONNECTION_KINDS, MEETING_WORD_BOUND, MEETING_WORD_FLOOR,
  WEAVE_CHECKS_SOURCE, FACT_CHECK_MARK_KEY,
  isWeave, weaveKey, weaveForPrompt, factCheckMarkOf, isWeaveJudged, withFactCheckMark,
  isMeetingApproved, checkWeave, weaveFindings, writersShareOf
} = weaveLib;
const { WEAVE_SCHEMA } = require('../sdk-client/subagents');
const { EVIDENCE_PIECE_SCHEMA, evidenceContextOf } = require('../evidence');
const writerQuestions = require('../writer-questions');
const {
  WEAVE_QUESTIONS_KEY, WEAVE_QUESTION_KINDS, WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf, carriedWeaveQuestions
} = writerQuestions;
const story = require('./fixtures/story-level-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

const NOTES = 'Rowan argued with Ellis at the bar. In the end the frame this morning did not land the way it was meant to, and the room turned on Ellis.';
const CORRECTION = 'The deal at the coat check was Kai to Sloane, not Sloane to Kai.';

/** 0926262's record, invented text: three memories and a paper email. */
const RECORD = {
  exposed: {
    tokens: [
      { id: 'row001', fullContent: 'ROW001 - 10:40PM - Rowan and Sloane in the bathroom. "Not a word to Ellis," Rowan says.' },
      { id: 'vic002', fullContent: 'VIC002 - 9:15PM - Vic drafts the plan to replace the founder before the board meets.' },
      { id: 'kai004', fullContent: 'KAI004 - 8:30PM - Kai trades a favour at the coat check.' }
    ],
    paperEvidence: [
      { id: 'p-email', name: 'Kai Coat Check Note', description: 'January: the firm asks for the story to come down. The same firm is on retainer now.' }
    ]
  },
  buried: { transactions: [{ shellAccount: 'RowanVale', amount: 90000, time: '07:58 PM' }] }
};
const EVIDENCE = evidenceContextOf({ evidenceBundle: RECORD, directorNotes: { rawProse: NOTES }, inputReviewCorrections: [CORRECTION] });

/** 0926262's shape, invented text: two angles over six threads, t6 in no angle. */
const WEAVE = {
  angles: [
    {
      id: 'a1',
      headline: 'Ellis Marr Pointed the Room at Rowan Vale. It Named Him Instead.',
      gist: 'The case built against Rowan landed on Ellis.',
      story: 'Someone built a case to pin the death on Rowan Vale. It failed in the room and landed on Ellis Marr, and the people with the money are already writing the next version.',
      question: 'Will the verdict cost Ellis anything?',
      lands: 'Every player watched the case turn.',
      ends: 'Near the end the retainer, the empty chair and the flight abroad meet the old sign-off.',
      threads: ['t1', 't2', 't3', 't4', 't5']
    },
    {
      id: 'a2',
      headline: 'The Plan to Replace the Founder Outlives the Verdict',
      gist: 'While the room named Ellis, a plan to replace the founder went on.',
      story: 'The room named Ellis, and a plan drafted before the board met goes on without him.',
      question: 'Who takes the empty chair?',
      lands: 'The players argued the verdict and never saw the plan.',
      ends: 'The verdict closes the morning, and the plan opens the next one.',
      threads: ['t4', 't1', 't5']
    }
  ],
  fromYourNotes: 'the frame this morning did not land the way it was meant to',
  threads: [
    { id: 't1', name: 'The case against Rowan', line: 'The case against Rowan held at four votes, and the room named Ellis.', verdict: true, evidence: [piece(['notes'], 'Rowan argued with Ellis at the bar.')] },
    { id: 't2', name: 'The last two minutes', line: 'The RowanVale account took most of the last two minutes of selling.', evidence: [piece(['ledger'], 'The sales into RowanVale at the close.')] },
    { id: 't3', name: 'The bathroom', line: 'Two allies split over the same secret in the bathroom.', evidence: [piece(['row001'], 'Rowan to Sloane: "Not a word to Ellis."')] },
    { id: 't4', name: 'The replacement plan', line: 'A plan to replace the founder may outlive the verdict.', evidence: [piece(['vic002'], 'Vic drafts the plan before the board meets.')] },
    { id: 't5', name: 'Last winter', line: 'Last winter a story about the company vanished the same way.', evidence: [piece(['p-email'], 'The firm "asks for the story to come down."')] },
    { id: 't6', name: 'The coat check', line: 'A side deal at the coat check.', evidence: [piece(['kai004'], 'Kai trades a favour.')] }
  ],
  connections: [
    { id: 'c1', joins: ['t1', 't3'], line: "Sloane, Rowan's ally, is the voice that turned the room.", kind: 'person', evidence: [piece(['row001'], 'Sloane is in the bathroom with Rowan.')] },
    { id: 'c2', joins: ['t1', 't2'], line: 'The scoreboard brings the money into the vote.', kind: 'moment', evidence: [piece(['ledger'], 'The late sales into RowanVale.')] },
    { id: 'c3', joins: ['t4', 't5'], line: 'The firm that wrote the January demand is the firm on retainer now.', kind: 'document', evidence: [piece(['p-email'], 'The same firm is on retainer now.')] },
    { id: 'c4', joins: ['t5', 't1'], line: 'Truth is a negotiation, planted early and paid off at the end.', kind: 'line', evidence: [piece(['notes'], 'The room turned on Ellis.')] }
  ],
  questions: [
    {
      id: 'q1', kind: 'figure', about: 'RowanVale, "more than double the second"',
      question: "The room heard more than double; the ledger has less. Print it as the room's exaggeration?",
      changes: "The money section's key line."
    }
  ]
};

const DIRECTOR_WORDS = [NOTES, CORRECTION];
const check = (weave, overrides = {}) => checkWeave(weave, { evidence: EVIDENCE, directorWords: DIRECTOR_WORDS, ...overrides });
const typesOf = (failures) => failures.map((f) => f.type);
/** The weave with one thread changed. */
const withThread = (id, change) => ({ ...clone(WEAVE), threads: clone(WEAVE).threads.map((t) => (t.id === id ? change(t) : t)) });
/** The weave with one angle changed. */
const withAngle = (id, change) => ({ ...clone(WEAVE), angles: clone(WEAVE).angles.map((a) => (a.id === id ? change(a) : a)) });
/** The director's share of the weave, as lib/hand-edit-diff.js weaveDirectorsShare reads it from the edits. */
const share = (parts = {}) => ({ fields: {}, angleFields: {}, flippedIn: {}, flippedOut: {}, addedThreads: {}, threadFields: {}, addedConnections: {}, connectionFields: {}, ...parts });

describe("the weave's shape (WEAVE_SCHEMA), on a weave in 100226's shape", () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  const validate = ajv.compile(WEAVE_SCHEMA);
  const valid = (value) => {
    const ok = validate(value);
    return ok ? 'valid' : JSON.stringify(validate.errors.map((e) => `${e.instancePath} ${e.message}`));
  };
  const STORY = story.storyLevelWeave();

  it('compiles in strict mode and accepts the story level, its evidence underneath', () => {
    expect(valid(STORY)).toBe('valid');
    expect(valid(WEAVE)).toBe('valid');
  });

  it('requires the angles, the threads, the connections and the questions', () => {
    expect(WEAVE_SCHEMA.required).toEqual(['angles', 'threads', 'connections', 'questions']);
    for (const field of WEAVE_SCHEMA.required) {
      const { [field]: _gone, ...rest } = clone(STORY);
      expect(`${field}: ${valid(rest)}`).not.toBe(`${field}: valid`);
    }
  });

  it('holds "from your notes" only when the writer has it', () => {
    const { fromYourNotes: _f, ...plain } = clone(STORY);
    expect(valid(plain)).toBe('valid');
    expect(WEAVE_SCHEMA.properties.fromYourNotes.type).toBe('string');
  });

  it('gives each thread an id, a short name, its line and its evidence; the verdict flag when it has it', () => {
    const thread = WEAVE_SCHEMA.properties.threads.items;
    expect(Object.keys(thread.properties)).toEqual(['id', 'name', 'line', 'verdict', 'evidence']);
    expect(thread.required).toEqual(['id', 'name', 'line', 'evidence']);
    expect(thread.properties.verdict.type).toBe('boolean');
    expect(thread.properties.evidence).toEqual({ type: 'array', items: EVIDENCE_PIECE_SCHEMA, description: expect.any(String) });
    ['name', 'line', 'evidence'].forEach((field) => {
      const without = { ...clone(STORY), threads: clone(STORY).threads.map((t, i) => (i === 1 ? (({ [field]: _gone, ...rest }) => rest)(t) : t)) };
      expect(`${field}: ${valid(without)}`).not.toBe(`${field}: valid`);
    });
  });

  it('gives each connection an id, the two threads it joins, its line, its kind underneath and its evidence', () => {
    const connection = WEAVE_SCHEMA.properties.connections.items;
    expect(Object.keys(connection.properties)).toEqual(['id', 'joins', 'line', 'kind', 'evidence']);
    expect(connection.required).toEqual(['id', 'joins', 'line', 'kind', 'evidence']);
    expect(connection.properties.kind.enum).toEqual([...CONNECTION_KINDS]);
    expect([...CONNECTION_KINDS]).toEqual(['person', 'moment', 'document', 'line']);
    expect(connection.properties.joins).toMatchObject({ type: 'array', items: { type: 'string' } });
    expect(connection.properties.evidence.items).toBe(EVIDENCE_PIECE_SCHEMA);
    const cause = { ...clone(STORY), connections: [{ ...clone(STORY).connections[0], kind: 'cause' }] };
    expect(valid(cause)).not.toBe('valid');
  });

  it("a thread's claim and receipt and a connection's detail are gone", () => {
    const thread = WEAVE_SCHEMA.properties.threads.items.properties;
    const connection = WEAVE_SCHEMA.properties.connections.items.properties;
    expect(['claim', 'receipt'].filter((field) => field in thread)).toEqual([]);
    expect('detail' in connection).toBe(false);
  });

  // Piece 3 (brief 3B): the angles took the roles' place, and the single story's fields.
  it('an angle is its id, its pitch and the ids of its threads, each required; the roles went', () => {
    const angle = WEAVE_SCHEMA.properties.angles.items;
    expect(Object.keys(angle.properties)).toEqual(['id', ...ANGLE_FIELDS, 'threads']);
    expect(angle.required).toEqual(['id', ...ANGLE_FIELDS, 'threads']);
    ['WEAVE_ROLES', 'MAIN_THREAD_ROLE', 'LEFT_OUT_ROLE', 'leftOutThreadsJoined'].forEach((name) => expect(weaveLib).not.toHaveProperty(name));
    ['story', 'question', 'headline', 'convergence', 'strongerMainThread'].forEach((field) => expect(WEAVE_SCHEMA.properties).not.toHaveProperty(field));
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
    expect(text).not.toMatch(/named exactly|receipt/i);
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

  // Spec 4.1 (R5): the meeting's page within its bound; piece 3 (R5): 450 words with any angle
  // open, and a floor of 350. The old bound on the writer's own fields and the receipt that named
  // the ledger went with their last readers.
  it("states the meeting's bound once: 450 words of the page with any angle open", () => {
    expect(MEETING_WORD_BOUND).toBe(450);
    expect(MEETING_WORD_FLOOR).toBe(350);
    expect(weaveLib).not.toHaveProperty('WEAVE_WORD_BOUND');
    expect(weaveLib).not.toHaveProperty('weaveWordCount');
    expect(weaveLib).not.toHaveProperty('LEDGER_RECEIPT');
  });

  it('stamps a version from the content alone: key order and the fact check\'s mark leave it unchanged', () => {
    const reordered = Object.fromEntries(Object.entries(clone(WEAVE)).reverse());
    expect(weaveKey(reordered)).toBe(weaveKey(WEAVE));
    expect(weaveKey(withFactCheckMark(WEAVE, { at: 't', ready: false, fixes: 0 }))).toBe(weaveKey(WEAVE));
    // The final review: the pick is no change (R1), so it leaves the stamp unchanged too.
    expect(weaveKey({ ...clone(WEAVE), picked: 'a2' })).toBe(weaveKey(WEAVE));
    expect(weaveKey(withAngle('a1', (a) => ({ ...a, story: 'Another story.' })))).not.toBe(weaveKey(WEAVE));
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
  });
});

describe('the weave checks (checkWeave)', () => {
  it("a weave in 0926262's shape, and one in 100226's, pass every check", () => {
    expect(check(WEAVE)).toEqual([]);
    const state = story.storyLevelState();
    expect(checkWeave(state.weave, { evidence: evidenceContextOf(state), directorWords: [story.NOTES, story.CORRECTION], length: { page: 280, writer: 242, allowance: 262 } })).toEqual([]);
  });

  it("each failure is one line that names the line it is about in the director's words, its fix, and its place", () => {
    const broken = {
      ...withThread('t3', (t) => ({ ...t, evidence: [] })),
      fromYourNotes: 'words the director never wrote'
    };
    const failures = check(broken);
    expect(failures.map((f) => [f.type, f.place])).toEqual([['from-your-notes-not-verbatim', 'fromYourNotes'], ['thread-without-evidence', 'threads[#t3]']]);
    failures.forEach(({ message }) => {
      expect(message).not.toContain('\n');
      expect(message.length).toBeGreaterThan(40);
    });
    expect(failures[1].message).toMatch(/^The thread "The bathroom" /);
    expect(failures[1].message).not.toMatch(/\bt3\b/);
  });

  describe('each thread the writer put in the story has a piece that supports it, and every piece passes the evidence check', () => {
    it('fires on a thread in the story with no evidence, or with none that supports it', () => {
      const none = check(withThread('t3', (t) => ({ ...t, evidence: [] })));
      expect(typesOf(none)).toEqual(['thread-without-evidence']);
      expect(none[0].message).toMatch(/"supports"/);
      const against = check(withThread('t3', (t) => ({ ...t, evidence: t.evidence.map((p) => ({ ...p, stance: 'cuts-against' })) })));
      expect(typesOf(against)).toEqual(['thread-without-evidence']);
      expect(typesOf(check(withThread('t3', ({ evidence: _e, ...t }) => t)))).toEqual(['thread-without-evidence']);
    });

    // Piece 3 (spec 9.1): every thread the writer wrote, a thread no angle uses among them.
    it('fires on a thread no angle uses with no evidence, at its place', () => {
      expect(check(withThread('t6', (t) => ({ ...t, evidence: [] }))).map((f) => [f.type, f.place])).toEqual([['thread-without-evidence', 'threads[#t6]']]);
    });

    it('fires on a piece naming a document the record lacks, on a thread, a left-out thread or a connection, naming the line and the piece', () => {
      const thread = check(withThread('t4', (t) => ({ ...t, evidence: [...t.evidence, piece(['zzz999'], 'A memory no one turned in.')] })));
      expect(thread).toEqual([{
        type: 'evidence-not-in-record',
        place: 'threads[#t4]',
        message: expect.stringMatching(/^The thread "The replacement plan": piece 2 names "zzz999", which is no document in the record/),
        line: 'The evidence behind the thread "The replacement plan" cites a document the record does not hold.'
      }]);
      expect(typesOf(check(withThread('t6', (t) => ({ ...t, evidence: [piece(['zzz999'], 'x')] }))))).toEqual(['evidence-not-in-record']);
      const connection = check({ ...clone(WEAVE), connections: clone(WEAVE).connections.map((c) => (c.id === 'c3' ? { ...c, evidence: [piece(['zzz999'], 'x')] } : c)) });
      expect(connection.map((f) => [f.type, f.place])).toEqual([['evidence-not-in-record', 'connections[#c3]']]);
      expect(connection[0].message).toMatch(/^The connection "The firm that wrote the January demand is the firm on retainer now\.": piece 1 names "zzz999"/);
    });

    it("fires on a quotation its source does not hold word for word, and is silent on one that differs only in its marks or case", () => {
      const reworded = check(withThread('t3', (t) => ({ ...t, evidence: [piece(['row001'], 'Rowan to Sloane: "Not one word to Ellis."')] })));
      expect(reworded.map((f) => f.type)).toEqual(['evidence-not-in-record']);
      expect(reworded[0].message).toMatch(/quotes "Not one word to Ellis\.", which none of its sources holds word for word/);
      expect(check(withThread('t3', (t) => ({ ...t, evidence: [piece(['row001'], 'Rowan to Sloane: “not a word to ellis.”')] })))).toEqual([]);
    });
  });

  describe("each of the writer's lines is in story terms (R8)", () => {
    it.each([
      ['a thread\'s line', () => withThread('t2', (t) => ({ ...t, line: 'RowanVale took $90,000 at 7:58.' })), 'threads[#t2]', /^The thread "The last two minutes": its line holds the money figure "\$90,000" and the clock time "7:58"\./],
      ['a thread\'s name', () => withThread('t3', (t) => ({ ...t, name: 'row001' })), 'threads[#t3]', /its name holds the document id "row001"/],
      ['a connection\'s line', () => ({ ...clone(WEAVE), connections: clone(WEAVE).connections.map((c) => (c.id === 'c2' ? { ...c, line: 'The scoreboard at 7:58 brings the money in.' } : c)) }), 'connections[#c2]', /^The connection ".*": its line holds the clock time "7:58"/],
      ['an angle\'s story', () => withAngle('a1', (a) => ({ ...a, story: `${a.story} The account took $90,000.` })), 'angles[#a1]', /^The angle "Ellis Marr Pointed the Room at Rowan Vale\. It Named Him Instead\.": its story holds the money figure "\$90,000"\./],
      ['an angle\'s question', () => withAngle('a2', (a) => ({ ...a, question: 'Who takes "the empty chair"?' })), 'angles[#a2]', /^The angle "The Plan to Replace the Founder Outlives the Verdict": its question holds the quotation "the empty chair"\./],
      ['an angle\'s card line', () => withAngle('a2', (a) => ({ ...a, gist: 'A plan in vic002 went on.' })), 'angles[#a2]', /its gist holds the document id "vic002"\./],
      ['why an angle lands', () => withAngle('a2', (a) => ({ ...a, lands: 'The players argued until 9 PM.' })), 'angles[#a2]', /its lands holds the clock time "9 PM"\./],
      ['where an angle ends up', () => withAngle('a1', (a) => ({ ...a, ends: `${a.ends} It lands at 9 PM.` })), 'angles[#a1]', /its ends holds the clock time "9 PM"\./]
    ])('fires on %s that holds an id, a quotation, a time or a figure, with its place and C16\'s fix', (_name, change, place, message) => {
      const failures = check(change());
      expect(failures.map((f) => [f.type, f.place])).toEqual([['story-terms', place]]);
      expect(failures[0].message).toMatch(message);
      expect(failures[0].message).toMatch(/Say it in story terms, as C16 \(<craft-story>\) sets out/);
    });

    it('reads an angle\'s headline, "from your notes" and the questions as exempt (R2)', () => {
      expect(check(withAngle('a2', (a) => ({ ...a, headline: 'RowanVale Took $90,000 at 7:58' })))).toEqual([]);
      expect(WEAVE.questions[0].about).toMatch(/"more than double the second"/);
      expect(check(WEAVE)).toEqual([]);
    });

    // Review focus 2.
    it('is silent on possessives, names and numbers in words', () => {
      const plain = withThread('t5', (t) => ({ ...t, name: 'Reality is negotiable', line: "Ellis's ten votes and Kai's five to four on the count." }));
      plain.angles[0].story = "Marcus's death, by ten votes, five to four on the second count.";
      expect(check(plain)).toEqual([]);
    });

    it("is silent on the director's own lines: a thread's line they typed, a thread they added", () => {
      const typed = withThread('t3', (t) => ({ ...t, line: 'The bathroom deal at 10:40 PM.' }));
      typed.threads.push({ id: 't7', name: 'The 7:58 sale', line: 'RowanVale took "the rest".' });
      expect(typesOf(check(typed))).toEqual(['story-terms', 'story-terms', 'thread-without-evidence']);
      expect(check(typed, { directorsShare: share({ threadFields: { 't3.line': 'E2' }, addedThreads: { t7: 'E3' } }) })).toEqual([]);
    });

    // Fix round 1, finding 2 (R11): a connection's line is the director's own line too when
    // they rewrote it or added the connection, so a time or a quotation in it is no failure.
    it("is silent on a connection's line the director rewrote and on a connection they added", () => {
      const typed = { ...clone(WEAVE), connections: clone(WEAVE).connections.map((c) => (c.id === 'c2' ? { ...c, line: 'The scoreboard at 7:58 brings the money in.' } : c)) };
      typed.connections.push({ id: 'c9', joins: ['t1', 't2'], line: 'RowanVale took "the rest" at 7:58.', kind: 'moment' });
      expect(check(typed).map((f) => [f.type, f.place])).toEqual([['story-terms', 'connections[#c2]'], ['story-terms', 'connections[#c9]']]);
      expect(check(typed, { directorsShare: share({ connectionFields: { 'c2.line': 'E1' }, addedConnections: { c9: 'E2' } }) })).toEqual([]);
    });
  });

  describe("the room's verdict is one of the threads", () => {
    it('fires when no thread carries the verdict', () => {
      const failures = check(withThread('t1', ({ verdict: _v, ...t }) => t));
      expect(typesOf(failures)).toEqual(['no-verdict-thread']);
      expect(failures[0].message).toMatch(/"verdict": true/);
      expect(failures[0]).not.toHaveProperty('place');
    });

    // Piece 3 (spec 9.1; C16): the verdict's thread is in every angle.
    it("fires on an angle that leaves out the verdict's thread, at that angle's place", () => {
      const failures = check(withAngle('a2', (a) => ({ ...a, threads: ['t4', 't5'] })));
      expect(failures.map((f) => [f.type, f.place])).toEqual([['angle-without-verdict', 'angles[#a2]']]);
      expect(failures[0].message).toMatch(/^The angle "The Plan to Replace the Founder Outlives the Verdict" leaves out "The case against Rowan", the thread that carries the room's verdict/);
    });

    it("is silent when every angle tells the verdict's thread, wherever it falls", () => {
      expect(check(withAngle('a2', (a) => ({ ...a, threads: ['t1', 't4', 't5'] })))).toEqual([]);
    });
  });

  describe('every connection joins two threads the weave holds', () => {
    const withConnection = (connection) => ({ ...clone(WEAVE), connections: [connection] });
    const C9 = { id: 'c9', joins: ['t1', 't9'], line: 'Someone the weave never names.', kind: 'person', evidence: [piece(['notes'], 'The bar.')] };

    it('fires on a connection that names a thread the weave does not hold, naming the connection by its line', () => {
      const failures = check(withConnection(C9));
      expect(failures.map((f) => [f.type, f.place])).toEqual([['connection-joins-unknown-thread', 'connections[#c9]']]);
      expect(failures[0].message).toMatch(/^The connection "Someone the weave never names\." joins a thread the weave does not hold/);
    });

    it.each([
      ['one thread', ['t1']],
      ['three threads', ['t1', 't2', 't3']],
      ['the same thread twice', ['t1', 't1']]
    ])('fires on a connection that joins %s', (_name, joins) => {
      expect(typesOf(check(withConnection({ ...C9, joins })))).toEqual(['connection-joins-unknown-thread']);
    });

    it('is silent on a connection between two threads of the weave, one no angle uses included', () => {
      expect(check(withConnection({ ...C9, joins: ['t6', 't1'] }))).toEqual([]);
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
      expect(checkWeave(thin, { evidence: EVIDENCE, directorWords: ['Short notes.'] })).toEqual([]);
    });
  });

  // Spec 4.1 and 6.1 (R5; fix round 4, lib/word-count.js pageLengthOf): the node counts the
  // meeting's page as it first opens (lib/stop-pages.js wordsShown) and its overhead, and passes
  // their length; the check holds the writer's own words to their allowance.
  describe("the writer's own words on the meeting's page stay within their allowance", () => {
    // Piece 3 (R5): the count is the worst angle's, and the check names that angle by its headline.
    it('fires past the allowance, naming the angle open and the counts, with no place', () => {
      const failures = check(WEAVE, { length: { page: 301, writer: 263, allowance: 262, angle: 'a2' } });
      const open = `With the angle "${WEAVE.angles.find((angle) => angle.id === 'a2').headline}" open, the`;
      expect(failures).toEqual([{
        type: 'over-length',
        message: expect.stringContaining(`${open} meeting's page runs to 301 words, 263 of them in the lines you write, past the 262 those lines may use (350, or more while the whole page stays within 450). Cut 1 words or more from your lines on that page, starting with the longest: `),
        line: `${open} writer's part of the meeting runs to 263 words, past the 262 it may use.`
      }]);
      expect(failures[0].message).toContain("angle a2's pitch (");
    });

    it('names no angle when the count names none', () => {
      const [failure] = check(WEAVE, { length: { page: 301, writer: 263, allowance: 262, angle: null } });
      expect(failure.line).toBe("The writer's part of the meeting runs to 263 words, past the 262 it may use.");
      expect(failure.message).toMatch(/^The meeting's page runs to 301 words/);
    });

    it('is silent at the allowance, however long the page, and with no length', () => {
      expect(check(WEAVE, { length: { page: 340, writer: 200, allowance: 200 } })).toEqual([]);
      expect(check(WEAVE)).toEqual([]);
    });
  });
});

// Fix round (the integrator's ruling on the review's minors, fix 1; spec 6.3): a check still
// failing after the rework reaches the director in story terms. Each failure carries the
// rework's `message`, unchanged, and the director's `line`: what is wrong at that place, in plain
// words, naming a thread by its name and never an id, a piece's number, a source's code, a rule
// item, a tag or a field's name.
describe("each failure says what is wrong to the director in plain words (its line)", () => {
  /** A weave that fails every check the writer's text can fail, each once. */
  function brokenWeave() {
    const weave = clone(WEAVE);
    weave.angles[0].story = 'Rowan took $90,000 at 7:58, as row001 shows.';
    weave.angles[1].threads.push('t77');
    weave.fromYourNotes = 'words the director never wrote';
    weave.threads[0].verdict = false;
    weave.threads[1].evidence = [];
    weave.threads[2].evidence = [piece(['zzz999', 'evidence-log'], 'Rowan to Sloane: "Not one word to Ellis."'), { sources: [], shows: '', stance: 'proves' }];
    weave.threads[3].line = 'Vic\'s plan, in vic002, says "replace the founder" by 9 PM.';
    weave.threads.push({ ...clone(WEAVE.threads[4]), name: 'A second winter' });
    weave.connections[0].joins = ['t1', 't99'];
    weave.connections.push({ ...clone(WEAVE.connections[1]), line: 'The scoreboard again.' });
    weave.questions.push({ ...clone(WEAVE.questions[0]), question: 'Another question under the same id?' });
    return weave;
  }
  const failures = () => check(brokenWeave(), { length: { page: MEETING_WORD_BOUND + 40, writer: 300, allowance: 262 } });
  /** What no line the director reads holds: an id, a piece's number, a source's code, a rule item, a tag, a field's name. */
  const UNSAID = [
    /\b[tcqa]\d+\b/, /\b(row001|vic002|zzz999)\b/i, /\bpiece \d/i, /evidence-log/, /"(ledger|notes)"/,
    /\b[CT]\d+\b/, /[<>]/, /"verdict"|strongerMainThread|fromYourNotes|\bsupports"|"cuts-against"/, /OUTPUT FORMAT/
  ];

  it('gives every failure a line beside its message, the message unchanged for the rework', () => {
    const found = failures();
    expect(found.map((f) => f.type).sort()).toEqual([
      'angle-names-unknown-thread', 'connection-joins-unknown-thread', 'duplicate-id', 'duplicate-id', 'duplicate-id',
      'evidence-not-in-record', 'from-your-notes-not-verbatim', 'no-verdict-thread', 'over-length',
      'story-terms', 'story-terms', 'thread-without-evidence'
    ]);
    found.forEach((f) => {
      expect(typeof f.line).toBe('string');
      expect(f.line.length).toBeGreaterThan(20);
      expect(f.line).not.toBe(f.message);
      expect(f.line).not.toContain('\n');
      expect(f.line).not.toMatch(/[–—]/);
    });
    expect(found.find((f) => f.type === 'evidence-not-in-record').message).toMatch(/piece 1 names "zzz999"/);
  });

  it.each(UNSAID.map((pattern) => [String(pattern), pattern]))('no line holds %s', (_name, pattern) => {
    expect(failures().map((f) => f.line).filter((line) => pattern.test(line))).toEqual([]);
  });

  it('names each line as the meeting does, and says what is wrong there', () => {
    const lineOf = (type, place) => failures().find((f) => f.type === type && f.place === place).line;
    expect(lineOf('story-terms', 'angles[#a1]')).toBe(
      "The angle \"Ellis Marr Pointed the Room at Rowan Vale. It Named Him Instead.\": its story gives the figure $90,000, the time 7:58 and a document's id. The meeting tells the story in plain words; the record's quotations, times, figures and documents go in the evidence underneath."
    );
    expect(lineOf('angle-names-unknown-thread', 'angles[#a2]')).toBe('The angle "The Plan to Replace the Founder Outlives the Verdict" names a thread the weave does not hold.');
    expect(lineOf('story-terms', 'threads[#t4]')).toMatch(/^The thread "The replacement plan": its line gives the quotation "replace the founder", the time 9 PM and a document's id\. /);
    expect(lineOf('evidence-not-in-record', 'threads[#t3]')).toBe(
      'The evidence behind the thread "The bathroom" cites a document the record does not hold; has a piece that quotes words its source does not hold; and has a piece that does not say where it comes from, what it shows or whether it supports the line.'
    );
    expect(lineOf('thread-without-evidence', 'threads[#t2]')).toBe('The thread "The last two minutes" has nothing behind it: no piece of the record supports it.');
    expect(lineOf('from-your-notes-not-verbatim', 'fromYourNotes')).toBe('"From your notes" quotes words your notes and corrections do not hold word for word.');
    expect(lineOf('no-verdict-thread', undefined)).toBe("No thread tells the room's verdict.");
    expect(lineOf('connection-joins-unknown-thread', 'connections[#c1]')).toBe('The connection "Sloane, Rowan\'s ally, is the voice that turned the room." joins a thread the weave does not hold.');
    expect(lineOf('duplicate-id', 'threads[#t5]')).toBe('The writer gave the threads "Last winter" and "A second winter" one id, so the meeting cannot change them.');
    expect(lineOf('duplicate-id', 'connections[#c2]')).toBe('The writer gave the connections "The scoreboard brings the money into the vote." and "The scoreboard again." one id, so the meeting cannot change them.');
    expect(lineOf('duplicate-id', 'questions[#q1]')).toMatch(/^The writer gave the questions ".*" and "Another question under the same id\?" one id\.$/);
    expect(lineOf('over-length', undefined)).toBe("The writer's part of the meeting runs to 300 words, past the 262 it may use.");
  });

  it("an angle without the verdict's thread, an angle count outside two or three, and a weave with no threads each have their line", () => {
    const without = check(withAngle('a2', (a) => ({ ...a, threads: ['t4', 't5'] })));
    expect(without.find((f) => f.type === 'angle-without-verdict').line).toBe('The angle "The Plan to Replace the Founder Outlives the Verdict" leaves out "The case against Rowan", the thread that tells the room\'s verdict.');
    expect(check({ ...clone(WEAVE), angles: [clone(WEAVE).angles[0]] }).find((f) => f.type === 'angle-count').line).toBe('The writer pitched 1 angle, and the meeting reads two or three.');
    expect(check({ story: 'x' })).toEqual([{ type: 'no-weave', message: expect.any(String), line: 'The writer returned no threads.' }]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5: the meeting's plumbing (spec 4.3, 4.4; rulings 2 and 3)
// ═══════════════════════════════════════════════════════════════════════════
//
// The checks read only the writer's text (R11): the director's share of the weave, read from their
// standing edits, is never a check's failure.
describe('4.5: the round mark and the views of the weave', () => {
  const { MEETING_ROUNDS, meetingRoundOf, weaveForRework, weaveForJudge } = require('../weave');

  it('the round mark is the reweave or the send-back, and nothing else', () => {
    expect([...MEETING_ROUNDS]).toEqual(['reweave', 'send-back']);
    expect(meetingRoundOf({ _meetingRound: 'reweave' })).toBe('reweave');
    expect(meetingRoundOf({ _meetingRound: 'send-back' })).toBe('send-back');
    expect(meetingRoundOf({ _meetingRound: 'approve' })).toBeNull();
    expect(meetingRoundOf({ _arcFeedback: 'Rethink it.' })).toBeNull();
    expect(meetingRoundOf({})).toBeNull();
  });

  it('a rework reads the weave without its code-owned keys, every connection, answer and evidence kept', () => {
    const weave = withFactCheckMark({ ...clone(WEAVE), questions: [{ ...WEAVE.questions[0], answer: 'Print it as the room said it.' }] }, { at: 't', ready: true, fixes: 0 });
    const view = weaveForRework(weave);
    expect(view).not.toHaveProperty('_factCheck');
    expect(view.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(view.questions[0].answer).toBe('Print it as the room said it.');
    expect(view.threads[2].evidence).toEqual(WEAVE.threads[2].evidence);
    expect(weave.connections).toHaveLength(4);
  });

  it("the fact check reads the weave with every connection, no answer, and every line's evidence", () => {
    const weave = { ...clone(WEAVE), questions: [{ ...WEAVE.questions[0], answer: 'Print it as the room said it.' }] };
    const view = weaveForJudge(weave);
    expect(view.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(view.questions[0]).not.toHaveProperty('answer');
    expect(view.questions[0].question).toBe(WEAVE.questions[0].question);
    expect(view.connections[0].evidence).toEqual(WEAVE.connections[0].evidence);
  });
});

describe('4.5: every id is unique (ruling 3)', () => {
  it('fires on two threads that share an id, naming both by their names and the fix', () => {
    const doubled = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[1], name: 'The second count' }] };
    const failures = check(doubled);
    expect(failures.map((f) => [f.type, f.place])).toEqual([['duplicate-id', 'threads[#t2]']]);
    expect(failures[0].message).toBe('Two threads share one id: "The last two minutes" and "The second count". Give each thread an id of its own, and make each angle, connection and question name the thread it means.');
  });

  it('fires on two connections, and on two questions, that share an id', () => {
    const connections = { ...clone(WEAVE), connections: [...clone(WEAVE).connections, { ...clone(WEAVE).connections[0], line: 'Another touch.' }] };
    expect(check(connections).map((f) => [f.place, f.message])).toEqual([['connections[#c1]', expect.stringMatching(/^Two connections share one id: ".*" and "Another touch\."\. Give each connection an id of its own\.$/)]]);
    const questions = { ...clone(WEAVE), questions: [...clone(WEAVE).questions, { ...clone(WEAVE).questions[0], question: 'Again?' }] };
    expect(check(questions).map((f) => [f.place, f.message])).toEqual([['questions[#q1]', expect.stringMatching(/^Two questions share one id: ".*" and "Again\?"\. Give each question an id of its own\.$/)]]);
  });

  it('is silent on the weave as written', () => {
    expect(check(WEAVE)).toEqual([]);
  });
});

describe("4.5: the checks read only the writer's text (R11, ruling 2)", () => {
  const concerns = (weave, directorsShare) => weaveFindings(weave, { evidence: EVIDENCE, directorWords: DIRECTOR_WORDS, directorsShare }).concerns;
  const ADDED = { id: 't7', name: 'The guest list', line: 'The guest list was rewritten that morning.' };

  // Review focus 1: a thread the director adds needs only its id, name and line; the map writer
  // finds its evidence.
  it('a thread the director added, with no evidence, is no failure', () => {
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, clone(ADDED), { ...clone(ADDED), id: 't8' }] };
    expect(typesOf(check(added))).toEqual(['thread-without-evidence', 'thread-without-evidence']);
    expect(check(added, { directorsShare: share({ addedThreads: { t7: 'E1', t8: 'E2' } }) })).toEqual([]);
  });

  it("the writer's pieces under a director's thread are still checked: the evidence is never the director's", () => {
    const added = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(ADDED), evidence: [piece(['zzz999'], 'x')] }] };
    expect(check(added, { directorsShare: share({ addedThreads: { t7: 'E1' } }) }).map((f) => [f.type, f.place])).toEqual([['evidence-not-in-record', 'threads[#t7]']]);
  });

  it('a verdict flag the director took off is a concern on that edit', () => {
    const unflagged = withThread('t1', ({ verdict: _v, ...t }) => t);
    const directorsShare = share({ threadFields: { 't1.verdict': 'E3' } });
    expect(check(unflagged, { directorsShare })).toEqual([]);
    expect(concerns(unflagged, directorsShare)).toEqual([{ type: 'no-verdict-thread', editIds: ['E3'], finding: "No thread carries the room's verdict." }]);
  });

  it('"from your notes" the director typed is not checked against the notes', () => {
    const typed = { ...clone(WEAVE), fromYourNotes: 'the director put this in their own words' };
    expect(typesOf(check(typed))).toEqual(['from-your-notes-not-verbatim']);
    expect(check(typed, { directorsShare: share({ fields: { fromYourNotes: 'E1' } }) })).toEqual([]);
  });

});

// Review focus 3: only the writer's output is held to the bound. The node counts the page of the
// writer's share (writersShareOf): the director's lines read empty, the threads they added are left
// out, and a thread they brought into an angle is off its list (piece 3, brief 3C), so a page the
// director lengthened never fails the check.
describe("the writer's share of the page (writersShareOf)", () => {
  it("reads the director's rewritten lines empty, leaves out the threads they added and off the angle the threads they brought in, and drops the answers", () => {
    const weave = clone(WEAVE);
    weave.threads.push({ id: 't7', name: 'The guest list', line: 'A very long line the director typed.' });
    weave.threads[2] = { ...weave.threads[2], line: 'The director typed this line.' };
    weave.angles[1].threads.push('t6', 't7');
    weave.angles[1].ends = 'Where the director said it ends, at length.';
    weave.questions[0] = { ...weave.questions[0], answer: 'The director answered at length.' };
    const writers = writersShareOf(weave, share({
      threadFields: { 't3.line': 'E2' }, addedThreads: { t7: 'E3' }, flippedIn: { 'a2.t6': 'E4' }, angleFields: { 'a2.ends': 'E5' }
    }));
    expect(writers.threads.map((t) => t.id)).toEqual(['t1', 't2', 't3', 't4', 't5', 't6']);
    expect(writers.angles[1]).toMatchObject({ threads: ['t4', 't1', 't5', 't7'], ends: '' });
    expect(writers.angles[0]).toEqual(WEAVE.angles[0]);
    expect(writers.threads[2].line).toBe('');
    expect(writers.questions[0]).not.toHaveProperty('answer');
    expect(weave.threads[2].line).toBe('The director typed this line.');
  });

  // Fix round 1, finding 2: a connection's line the director rewrote reads empty, and a
  // connection they added is left out, as their threads' lines and threads are.
  it("reads a connection's line the director rewrote empty, and leaves out a connection they added", () => {
    const weave = clone(WEAVE);
    weave.connections[1] = { ...weave.connections[1], line: 'A connection line the director typed at length.' };
    weave.connections.push({ id: 'c9', joins: ['t1', 't2'], line: 'A connection the director added.', kind: 'moment' });
    const writers = writersShareOf(weave, share({ connectionFields: { 'c2.line': 'E1' }, addedConnections: { c9: 'E2' } }));
    expect(writers.connections.map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
    expect(writers.connections[1]).toEqual({ ...WEAVE.connections[1], line: '' });
    expect(writers.connections[0]).toEqual(WEAVE.connections[0]);
    expect(weave.connections[1].line).toBe('A connection line the director typed at length.');
  });

  it('keeps "from your notes" as the page prints it, since an empty one would print the thin-notes line', () => {
    expect(writersShareOf(clone(WEAVE), share({ fields: { fromYourNotes: 'E1' } })).fromYourNotes).toBe(WEAVE.fromYourNotes);
  });

  it('is the weave as it is, its answers dropped, when the director changed nothing', () => {
    expect(writersShareOf(clone(WEAVE), share())).toEqual(WEAVE);
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
    expect(check(doubled).map((f) => f.type)).toEqual(['duplicate-id']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.5b: the weave's follow-ups (brief 4.5b)
// ═══════════════════════════════════════════════════════════════════════════

// R11 exempts the thread the director added, not the writer's duplicate of its id. Filed
// as a concern on the director's edit, the writer's repeat sent no rework, and the
// director's next change to their own thread was refused (4.5 review, minor 6). The
// failure's line tells the rework which thread keeps the id: the director's edits find
// their thread by it. Phase 4b (brief 1B): the line names the threads by their names, as the
// director knows them, never by their id or the edits' ids.
describe("4.5b: a writer's repeat is the writer's failure", () => {
  const findings = (weave, directorsShare) => weaveFindings(weave, { evidence: EVIDENCE, directorWords: DIRECTOR_WORDS, directorsShare });
  const ADDED = { id: 't7', name: 'The guest list', line: 'The guest list was rewritten that morning.' };
  const WRITERS_T7 = { id: 't7', name: 'The writer\'s seventh', line: 'A thread the writer put under the same id.', evidence: [piece(['ledger'], 'A sale.')] };

  it("a repeat under the id of a thread the director added is a failure, not a concern, and says which thread keeps the id", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, clone(ADDED), clone(WRITERS_T7)] };
    const { failures, concerns } = findings(weave, share({ addedThreads: { t7: 'E1' } }));
    expect(failures).toEqual([{
      type: 'duplicate-id',
      place: 'threads[#t7]',
      message: 'Two threads share one id: "The guest list" and "The writer\'s seventh", and one of them is the thread the director added. Keep the id on the director\'s thread, since their edits find it by its id, and give the other thread an id of its own; make each angle, connection and question name the thread it means.',
      line: 'The writer gave the threads "The guest list" and "The writer\'s seventh" one id, so the meeting cannot change them, and one of them is yours.'
    }]);
    expect(concerns).toEqual([]);
  });

  it("a repeat under the id of a thread the director flipped or rewrote says the director changed one of them", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[2], name: 'A second bathroom' }] };
    const { failures, concerns } = findings(weave, share({ flippedOut: { 'a1.t3': 'E2' }, threadFields: { 't3.line': 'E4' } }));
    expect(failures.map((f) => f.message)).toEqual([expect.stringMatching(/^Two threads share one id: "The bathroom" and "A second bathroom", and one of them is the thread the director changed\. Keep the id on the director's thread/)]);
    expect(failures[0].message).not.toMatch(/\bE\d\b|<HAND_EDITS>|\bt3\b/);
    expect(concerns).toEqual([]);
  });

  // Fix round, fix 3: the rework must know which of the two names keeps the id. The share says
  // where the director's edits find their thread (lib/hand-edit-diff.js weaveDirectorsShare,
  // given the weave), and the line names it, whichever of the two comes first.
  it("names the director's thread, where their edits find it, and the writer's that gives up the id", () => {
    [[ADDED, WRITERS_T7, 6], [WRITERS_T7, ADDED, 7]].forEach(([one, two, theirs]) => {
      const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, clone(one), clone(two)] };
      const { failures } = findings(weave, share({ addedThreads: { t7: 'E1' }, threadIndexes: { t7: [theirs] } }));
      expect(failures).toEqual([{
        type: 'duplicate-id',
        place: 'threads[#t7]',
        message: expect.stringContaining('and "The guest list" is the thread the director added. Keep the id on "The guest list", since their edits find it by its id, and give "The writer\'s seventh" an id of its own; make each angle, connection and question name the thread it means.'),
        line: 'The writer gave the thread "The writer\'s seventh" the id of your thread "The guest list", so the meeting cannot change them.'
      }]);
    });
  });

  it("names the thread the director changed, and gives each of the writer's threads under its id an id of its own", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[2], name: 'A second bathroom' }, { ...clone(WEAVE).threads[2], name: 'A third bathroom' }] };
    const { failures } = findings(weave, share({ flippedIn: { 'a2.t3': 'E2' }, threadIndexes: { t3: [2] } }));
    expect(failures.map((f) => f.message)).toEqual([expect.stringContaining('and "The bathroom" is the thread the director changed. Keep the id on "The bathroom", since their edits find it by its id, and give "A second bathroom" and "A third bathroom" each an id of its own;')]);
    expect(failures[0].line).toBe('The writer gave the threads "A second bathroom" and "A third bathroom" the id of your thread "The bathroom", so the meeting cannot change them.');
  });

  it("keeps the line that says one of them is the director's when their edits find no one thread under the id", () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, clone(ADDED), clone(WRITERS_T7)] };
    [{}, { t7: [6, 7] }, { t7: [2] }].forEach((threadIndexes) => {
      expect(findings(weave, share({ addedThreads: { t7: 'E1' }, threadIndexes })).failures[0].message)
        .toMatch(/, and one of them is the thread the director added\. Keep the id on the director's thread/);
    });
  });

  it('a repeat no edit of the director\'s is under keeps its line', () => {
    const weave = { ...clone(WEAVE), threads: [...clone(WEAVE).threads, { ...clone(WEAVE).threads[1] }] };
    expect(findings(weave, share({ addedThreads: { t7: 'E1' } })).failures).toEqual([{
      type: 'duplicate-id',
      place: 'threads[#t2]',
      message: 'Two threads share one id: "The last two minutes" and "The last two minutes". Give each thread an id of its own, and make each angle, connection and question name the thread it means.',
      line: 'The writer gave the threads "The last two minutes" and "The last two minutes" one id, so the meeting cannot change them.'
    }]);
  });
});

// The fields the story meeting prints are one list (WEAVE_PRINTED_FIELDS), which the edits'
// reading of a weave (lib/hand-edit-diff.js weaveParts) walks, so a field added to the weave is
// added once (4.5 review, minor 10). Phase 4b (brief 1B): a thread prints its name and its line,
// and a connection its line; the evidence underneath is no printed field.
describe("4.5b: one list of the weave's printed fields", () => {
  const { WEAVE_PRINTED_FIELDS, printedWeaveFields } = require('../weave');
  const { _testing: { printedLeaves } } = require('../hand-edit-diff');

  /** A weave whose every printed field holds a word of its own, and its evidence. */
  function marked() {
    const word = (where) => `w-${where}`;
    const weave = Object.fromEntries(WEAVE_PRINTED_FIELDS.weave.map((field) => [field, word(field)]));
    const element = (part, i) => Object.fromEntries(WEAVE_PRINTED_FIELDS[part].map((field) => [field, word(`${part}${i}-${field}`)]));
    weave.angles = [0, 1].map((i) => ({ id: `a${i}`, ...element('angles', i), threads: ['t0', 't1'] }));
    weave.picked = 'a1';
    weave.threads = [0, 1].map((i) => ({ id: `t${i}`, ...element('threads', i), evidence: [piece(['ledger'], `unprinted evidence ${i}`)] }));
    weave.connections = [
      { id: 'c0', joins: ['t0', 't1'], kind: 'person', ...element('connections', 0), evidence: [piece(['notes'], 'unprinted connection evidence')] }
    ];
    weave.questions = [{ id: 'q0', kind: 'player', ...element('questions', 0) }];
    return weave;
  }

  it('names each part of the weave and its fields, and flags "from your notes" as the director\'s words', () => {
    // Piece 3 (brief 3B): each angle's pitch; the pick is no printed field (R1).
    expect(WEAVE_PRINTED_FIELDS).toEqual({
      weave: ['fromYourNotes'],
      angles: [...ANGLE_FIELDS],
      threads: ['name', 'line'],
      connections: ['line'],
      questions: ['about', 'question', 'changes'],
      directorsWords: ['fromYourNotes']
    });
    expect(Object.isFrozen(WEAVE_PRINTED_FIELDS)).toBe(true);
  });

  it('the edits read every printed field, in the order the meeting prints it, and no evidence', () => {
    const weave = marked();
    const texts = printedWeaveFields(weave).map((entry) => entry.text);
    expect(printedLeaves(weave)).toEqual(texts);
    expect(texts).toEqual([
      'w-fromYourNotes',
      ...[0, 1].flatMap((i) => ANGLE_FIELDS.map((field) => `w-angles${i}-${field}`)),
      'w-threads0-name', 'w-threads0-line', 'w-threads1-name', 'w-threads1-line',
      'w-connections0-line',
      'w-questions0-about', 'w-questions0-question', 'w-questions0-changes'
    ]);
    expect(texts.join(' ')).not.toMatch(/unprinted|a1\b/);
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
// story with its thread, and comes back when the thread does; the weave's own checks still read
// every connection.
describe('4.14a: a connection that joins a thread the settled angle leaves out goes out of the story with it', () => {
  const { storyConnections } = require('../weave');
  /** WEAVE with angle 1 telling these threads. c1 joins t1 and t3; c3 joins t4 and t5. */
  const telling = (weave, ids) => ({ ...weave, angles: weave.angles.map((a) => (a.id === 'a1' ? { ...a, threads: ids } : a)) });

  // Piece 3 (brief 3B): the settled angle decides which threads are in the story.
  it('leaves out a connection that joins a thread the angle leaves out', () => {
    const weave = telling(clone(WEAVE), ['t1', 't2', 't4', 't5']);
    expect(storyConnections(weave).map((c) => c.id)).toEqual(['c2', 'c3', 'c4']);
    expect(storyConnections(null)).toEqual([]);
  });

  it('a connection to the thread comes back when the angle tells the thread', () => {
    const out = telling(clone(WEAVE), ['t1', 't2', 't4', 't5']);
    expect(storyConnections(out).map((c) => c.id)).not.toContain('c1');
    expect(storyConnections(telling(out, ['t1', 't2', 't3', 't4', 't5'])).map((c) => c.id)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('the picked angle decides: angle 2 keeps the connections between its own threads', () => {
    expect(storyConnections({ ...clone(WEAVE), picked: 'a2' }).map((c) => c.id)).toEqual(['c3', 'c4']);
  });

  it("the weave's own checks still read it: a connection that joins a thread the weave does not hold is the writer's failure", () => {
    const weave = telling(clone(WEAVE), ['t1', 't2', 't4', 't5']);
    weave.connections.push({ id: 'c5', joins: ['t3', 't9'], line: 'Someone the weave never names.', kind: 'person', evidence: [piece(['notes'], 'The bar.')] });
    expect(typesOf(check(weave))).toEqual(['connection-joins-unknown-thread']);
  });
});
