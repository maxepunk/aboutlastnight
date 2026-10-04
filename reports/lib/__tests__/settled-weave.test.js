/**
 * The settled weave (phase 4, brief 4.5; spec 4.4 and 5.1): one renderer prints the weave
 * as the director left it at the story meeting, for every later writer (the map writer
 * and the article writer call it, 4.6 and 4.7):
 * - the story, its question and the working headline, the director's words it rests on;
 * - every thread with its role, a thread the director added among them;
 * - the live connections and the convergence; a struck connection is gone;
 * - every question with the director's answer word for word, or marked unanswered, and
 *   what its answer changes;
 * - each change the director made at the meeting, marked by its edit's id.
 *
 * The fact check after a director's round reads the answers through the same module
 * (renderDirectorAnswers). Invented text: the repo is public.
 */

const { renderSettledWeave, renderDirectorAnswers, SETTLED_WEAVE_TAG, DIRECTOR_ANSWERS_TAG } = require('../prompt-renderers/settled-weave');
const { standingAtMeeting, carriedEdits } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));

/** The writer's weave as the meeting showed it. */
const WRITERS = {
  story: 'The room built a case against Rowan, and it landed on Ellis.',
  question: 'Will the verdict cost Ellis anything?',
  headline: 'Ellis Pointed the Room at Rowan',
  fromYourNotes: 'the frame this morning did not land the way it was meant to',
  threads: [
    { id: 't1', claim: 'The case against Rowan held at four votes, and the room named Ellis.', role: 'main-thread', receipt: 'ledger', verdict: true },
    { id: 't2', claim: 'The RowanVale account took the last two minutes of selling.', role: 'grounds-it', receipt: 'ledger' },
    { id: 't3', claim: 'Two allies split over the same secret.', role: 'complicates-it', receipt: 'row001' },
    { id: 't4', claim: 'A side deal at the coat check.', role: 'left-out', receipt: 'kai004', reason: 'It touches no thread the story follows.' }
  ],
  connections: [
    { id: 'c1', kind: 'person', joins: ['t1', 't3'], detail: 'Sloane turned the room against Rowan.' },
    { id: 'c2', kind: 'moment', joins: ['t1', 't2'], detail: 'The scoreboard brought the money into the vote.' }
  ],
  convergence: 'The retainer and the empty chair meet the old sign-off.',
  strongerMainThread: { thread: 't2', reason: 'The money reaches past the morning.' },
  questions: [
    { id: 'q1', kind: 'figure', about: 'RowanVale, "more than double the second"', question: 'The room heard more than double; the ledger has less. Print it as the room said it?', changes: "The money section's key line." },
    { id: 'q2', kind: 'player', about: 'Kai', question: 'The record holds nothing Kai did: what did Kai do?', changes: 'Where Kai appears.' },
    { id: 'q3', kind: 'pronoun', about: 'Sloane', question: 'The roster gives Sloane no pronoun: which one?', changes: "Sloane's pronoun in print." }
  ]
};

/** The director's version: the story rewritten, t3 re-roled, a thread added, c2 struck, q1 and q3 answered. */
function directors() {
  const weave = clone(WRITERS);
  weave.story = 'Someone built the case against Rowan, and it failed in the room.';
  weave.threads[2].role = 'mirrors-it';
  weave.threads.push({ id: 't7', claim: 'The guest list was rewritten that morning.', role: 'grounds-it' });
  weave.connections[1].struck = true;
  weave.questions[0].answer = 'Print it as the room said it, as their exaggeration.';
  weave.questions[2].answer = 'she/her';
  return weave;
}

const settled = () => {
  const weave = directors();
  return renderSettledWeave(weave, carriedEdits(standingAtMeeting(null, WRITERS, weave), weave));
};

describe('renderSettledWeave: the weave as the director left it (brief 4.5)', () => {
  it('is one tagged block', () => {
    const text = settled();
    expect(SETTLED_WEAVE_TAG).toBe('SETTLED_WEAVE');
    expect(text.startsWith('<SETTLED_WEAVE>\n')).toBe(true);
    expect(text.endsWith('\n</SETTLED_WEAVE>')).toBe(true);
  });

  it('prints the story, the question, the working headline and the director\'s words it rests on', () => {
    const text = settled();
    expect(text).toContain(`STORY: ${directors().story}`);
    expect(text).toContain(`QUESTION: ${WRITERS.question}`);
    expect(text).toContain(`WORKING HEADLINE: ${WRITERS.headline}`);
    expect(text).toContain(`FROM THE DIRECTOR'S NOTES: "${WRITERS.fromYourNotes}"`);
  });

  it('prints every thread with its role, the main thread first and the left-out threads last, a thread the director added among them', () => {
    const lines = settled().split('\n').filter((line) => /^- t\d/.test(line));
    expect(lines.map((line) => line.slice(0, line.indexOf(':')))).toEqual([
      '- t1 (main thread)', '- t2 (grounds it)', '- t7 (grounds it)', '- t3 (mirrors it)', '- t4 (left out)'
    ]);
    expect(lines[0]).toContain(WRITERS.threads[0].claim);
    expect(lines[0]).toContain("It carries the room's verdict.");
    expect(lines[0]).toContain('Receipt: ledger.');
    expect(lines[4]).toContain(`Why it is left out: ${WRITERS.threads[3].reason}`);
  });

  it('prints the live connections and the convergence; a struck connection is gone from it', () => {
    const text = settled();
    expect(text).toContain('- c1, a shared person, joining t1 and t3: Sloane turned the room against Rowan.');
    expect(text).not.toContain('c2');
    expect(text).not.toContain(WRITERS.connections[1].detail);
    expect(text).toContain(`CONVERGENCE: ${WRITERS.convergence}`);
  });

  it("leaves out the writer's stronger-main-thread proposal: the roles say which thread the director made the main thread", () => {
    expect(settled()).not.toContain(WRITERS.strongerMainThread.reason);
  });

  it('prints every question with what its answer changes, each answer word for word, and each question with no answer marked unanswered, of each kind', () => {
    const text = settled();
    expect(text).toContain(`- q1 (a figure; about: ${WRITERS.questions[0].about}): ${WRITERS.questions[0].question} Its answer changes: ${WRITERS.questions[0].changes}`);
    expect(text).toContain(`  The director's answer, word for word: "${directors().questions[0].answer}"`);
    expect(text).toContain(`- q2 (a player; about: Kai): ${WRITERS.questions[1].question} Its answer changes: ${WRITERS.questions[1].changes}\n  Unanswered.`);
    expect(text).toContain(`- q3 (a pronoun; about: Sloane): ${WRITERS.questions[2].question} Its answer changes: ${WRITERS.questions[2].changes}\n  The director's answer, word for word: "she/her"`);
  });

  // Brief 4.14a: by its id in the meeting's own form, M and the edit's number (E1 is M1), so
  // no later prompt holds a meeting change and a later stop's edit under one id.
  it("marks each change the director made at the meeting by its id in the meeting's own form; a strike leaves no line to mark", () => {
    const text = settled();
    expect(text).toContain(`STORY: ${directors().story} [the director's change M1]`);
    expect(text.split('\n').find((line) => line.startsWith('- t3'))).toMatch(/\[the director's change M2: the role\]$/);
    expect(text.split('\n').find((line) => line.startsWith('- t7'))).toMatch(/\[the director's change M3: a thread they added\]$/);
    expect(text).not.toContain('M4');
    expect(text).not.toMatch(/\bE\d+\b/);
    expect(text.split('\n').find((line) => line.startsWith('QUESTION:'))).not.toMatch(/\[the director's change/);
  });

  it('marks nothing when the director changed nothing', () => {
    const text = renderSettledWeave(clone(WRITERS), []);
    expect(text).not.toMatch(/\[the director's changes? [EM]\d/);
    expect(text).toContain('- c2, a moment, joining t1 and t2: The scoreboard brought the money into the vote.');
  });

  it('prints no "from your notes" line when the story did not start from the director\'s read', () => {
    const { fromYourNotes: _f, ...thin } = clone(WRITERS);
    expect(renderSettledWeave(thin, [])).not.toContain("FROM THE DIRECTOR'S NOTES");
  });

  it('is empty for no weave', () => {
    expect(renderSettledWeave(null, [])).toBe('');
    expect(renderSettledWeave({ story: 'x' }, [])).toBe('');
  });

  it('carries no em-dash and names no theme in its own words', () => {
    const own = renderSettledWeave({ story: 's', question: 'q', headline: 'h', threads: [{ id: 't1', claim: 'c', role: 'main-thread', verdict: true }], connections: [], convergence: 'v', questions: [] }, []);
    expect(own).not.toMatch(/[–—]/);
    expect(own).not.toMatch(/Nova|NovaNews|detective/i);
  });
});

describe('renderDirectorAnswers: the answers, for the fact check after a director\'s round (brief 4.5)', () => {
  it('prints each answered question with its answer word for word, in a tagged block', () => {
    const text = renderDirectorAnswers(directors().questions);
    expect(DIRECTOR_ANSWERS_TAG).toBe('DIRECTOR_ANSWERS');
    expect(text.startsWith('<DIRECTOR_ANSWERS>\n')).toBe(true);
    expect(text.endsWith('\n</DIRECTOR_ANSWERS>')).toBe(true);
    expect(text).toContain(`- q1 (a figure; about: ${WRITERS.questions[0].about}): ${WRITERS.questions[0].question}`);
    expect(text).toContain(`  The director's answer, word for word: "${directors().questions[0].answer}"`);
    expect(text).toContain("  The director's answer, word for word: \"she/her\"");
    expect(text).not.toContain('q2');
  });

  it('is empty when the director has answered nothing', () => {
    expect(renderDirectorAnswers(WRITERS.questions)).toBe('');
    expect(renderDirectorAnswers(undefined)).toBe('');
  });
});

// 4.5b (4.5 review, minor 11): every kind of question, both ways. The map writer and the
// article writer read each answer as the director's words, and an unanswered question as
// one the director left open, whatever C15 case it raises.
describe('4.5b: the settled weave prints each question kind, answered and unanswered', () => {
  const KIND_WORDS = { player: 'a player', pronoun: 'a pronoun', figure: 'a figure' };
  const asked = (kind) => ({ id: `q-${kind}`, kind, about: `the ${kind} asked about`, question: `What about the ${kind}?`, changes: `The line the ${kind} prints in.` });

  it.each(Object.keys(KIND_WORDS))('%s: answered, the answer word for word; unanswered, marked so', (kind) => {
    const weave = clone(WRITERS);
    weave.questions = [{ ...asked(kind), answer: `The director's answer about the ${kind}.` }, { ...asked(kind), id: `q-${kind}-open` }];
    const lines = renderSettledWeave(weave, []).split('\n');
    const at = (id) => lines.findIndex((line) => line.startsWith(`- ${id} `));
    const question = asked(kind);
    expect(lines[at(question.id)]).toBe(`- ${question.id} (${KIND_WORDS[kind]}; about: ${question.about}): ${question.question} Its answer changes: ${question.changes}`);
    expect(lines[at(question.id) + 1]).toBe(`  The director's answer, word for word: "The director's answer about the ${kind}."`);
    expect(lines[at(`q-${kind}-open`)]).toBe(`- q-${kind}-open (${KIND_WORDS[kind]}; about: ${question.about}): ${question.question} Its answer changes: ${question.changes}`);
    expect(lines[at(`q-${kind}-open`) + 1]).toBe('  Unanswered.');
  });
});

// 4.6b (4.6 review, ruling 2): the removed-phrase and em-dash scans skip <SETTLED_WEAVE>
// whole, since it holds the writer's output and the director's words
// (lib/__tests__/fixtures/removed-phrases.js WHOLE_BLOCKS). Its own labels are the
// pipeline's words, so they are held to the list here: a settled weave that prints every
// label, rendered from clean planted data, carries nothing on the list and no dash.
describe("4.6b: the settled weave's own labels hold to the removed-phrase list", () => {
  const { findRemovedPhrases } = require('./fixtures/removed-phrases');
  const { WEAVE_ROLES } = require('../weave');
  const { WEAVE_QUESTION_KINDS } = require('../writer-questions');

  /** The writer's weave as the meeting showed it: a thread in each role, a connection of each kind, two questions of each kind. */
  const planted = () => ({
    story: 'The room built its case on one account, and the ledger points at another.',
    question: 'Who gained from the sale the room set aside?',
    headline: 'The Room Chose One Account',
    fromYourNotes: 'the account on top was the wrong one',
    threads: [
      { id: 't1', claim: 'The room named one account holder in the final vote.', role: 'main-thread', receipt: 'ledger', verdict: true },
      { id: 't2', claim: 'The account took its sales in the last two minutes.', role: 'grounds-it', receipt: 'ledger' },
      { id: 't3', claim: 'Two allies told the room different stories.', role: 'complicates-it', receipt: 'row001' },
      { id: 't4', claim: 'An old email shows the same move a year ago.', role: 'mirrors-it', receipt: 'row002' },
      { id: 't5', claim: 'The plan for the empty chair goes on after the vote.', role: 'carries-it-forward', receipt: 'row003' },
      { id: 't6', claim: 'A side deal by the coat rack.', role: 'left-out', receipt: 'row004', reason: 'It touches no thread the story follows.' },
      { id: 't8', claim: 'A second account took the overflow.', role: 'grounds-it', receipt: 'ledger' }
    ],
    connections: [
      { id: 'c1', kind: 'person', joins: ['t1', 't3'], detail: 'Sloane stood with both sides.' },
      { id: 'c2', kind: 'moment', joins: ['t1', 't2'], detail: 'The scoreboard went up before the vote.' },
      { id: 'c3', kind: 'document', joins: ['t2', 't4'], detail: 'The same email thread runs through both.' },
      { id: 'c4', kind: 'line', joins: ['t3', 't5'], detail: 'One sign-off comes back at the end.' },
      { id: 'c5', kind: 'moment', joins: ['t4', 't5'], detail: 'The two dates fall in one week.' }
    ],
    convergence: 'The vote, the ledger and the old email meet at the empty chair.',
    questions: WEAVE_QUESTION_KINDS.flatMap((kind) => [
      { id: `q-${kind}`, kind, about: `the ${kind} asked about`, question: `What about the ${kind}?`, changes: `The line the ${kind} prints in.` },
      { id: `q-${kind}-open`, kind, about: `the ${kind} left open`, question: `What else about the ${kind}?`, changes: `Another line the ${kind} prints in.` }
    ])
  });

  /**
   * The director's version: every field the meeting marks rewritten, t8 given a new role and
   * a new claim (two marks on one line), t7 added, c5 struck, and one question of each kind
   * answered.
   */
  const directors = () => {
    const weave = planted();
    weave.story = 'Someone put one account on top, and the room followed it.';
    weave.question = 'Will the vote cost the account holder anything?';
    weave.headline = 'The Account on Top Was the Wrong One';
    weave.fromYourNotes = 'the account on top was the wrong one, and the room knew it';
    weave.convergence = 'The vote and the old email meet at the empty chair.';
    const t8 = weave.threads.find((thread) => thread.id === 't8');
    t8.role = 'complicates-it';
    t8.claim = 'A second account took the overflow, under a name no one claimed.';
    weave.threads.push({ id: 't7', claim: 'The guest list changed that morning.', role: 'grounds-it' });
    weave.connections.find((connection) => connection.id === 'c5').struck = true;
    weave.questions.filter((q) => !q.id.endsWith('-open')).forEach((q) => { q.answer = `The director's answer about ${q.about}.`; });
    return weave;
  };

  const render = () => {
    const weave = directors();
    return renderSettledWeave(weave, carriedEdits(standingAtMeeting(null, planted(), weave), weave));
  };

  it('the render prints every label: each role and an added thread, live connections and the convergence, each question kind both ways, and changes by their edit ids', () => {
    const text = render();
    const lines = text.split('\n');
    const labels = [
      '<SETTLED_WEAVE>', 'The weave as the director settled it at the story meeting', 'STORY: ', 'QUESTION: ', 'WORKING HEADLINE: ',
      "FROM THE DIRECTOR'S NOTES: \"", 'THREADS:', ' Receipt: ', " It carries the room's verdict.", ' Why it is left out: ',
      'CONNECTIONS:', ', joining ', 'CONVERGENCE: ', "QUESTIONS TO THE DIRECTOR, WITH THE DIRECTOR'S ANSWERS:", ' Its answer changes: ',
      "  The director's answer, word for word: \"", '  Unanswered.', '</SETTLED_WEAVE>'
    ];
    labels.forEach((label) => expect(`${label}: ${text.includes(label)}`).toBe(`${label}: true`));
    WEAVE_ROLES.forEach((role) => expect(text).toContain(`(${role.replace(/-/g, ' ')}):`));
    ['a shared person', 'a moment', 'a document', 'a line'].forEach((kind) => expect(text).toContain(`, ${kind}, joining `));
    expect(text).not.toContain('c5,');
    WEAVE_QUESTION_KINDS.forEach((kind) => {
      expect(lines[lines.findIndex((line) => line.startsWith(`- q-${kind} `)) + 1]).toMatch(/^ {2}The director's answer, word for word: "/);
      expect(lines[lines.findIndex((line) => line.startsWith(`- q-${kind}-open `)) + 1]).toBe('  Unanswered.');
    });
    // Brief 4.14a: each change by its id in the meeting's own form (M and the edit's number).
    ['STORY', 'QUESTION', 'WORKING HEADLINE', "FROM THE DIRECTOR'S NOTES", 'CONVERGENCE'].forEach((field) => {
      expect(lines.find((line) => line.startsWith(`${field}: `))).toMatch(/ \[the director's change M\d+\]$/);
    });
    expect(lines.find((line) => line.startsWith('- t7 '))).toMatch(/ \[the director's change M\d+: a thread they added\]$/);
    expect(lines.find((line) => line.startsWith('- t8 '))).toMatch(/ \[the director's changes M\d+: the (role|claim); M\d+: the (role|claim)\]$/);
  });

  it("carries nothing on the removed-phrase list and no dash: the planted data is clean, so what the scan reads is the labels'", () => {
    expect(findRemovedPhrases(JSON.stringify([planted(), directors()])).map(String)).toEqual([]);
    const text = render();
    expect(findRemovedPhrases(text).map(String)).toEqual([]);
    expect(text).not.toMatch(/[–—]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4.14a: the meeting's last defects (the final review, ruling 1)
// ═══════════════════════════════════════════════════════════════════════════
describe('4.14a: the settled weave tells the story the director settled', () => {
  const { meetingChangeId } = require('../prompt-renderers/settled-weave');

  // Meeting 2: a connection that joins a left-out thread is out of the story, as a struck one is.
  it('leaves out a connection that joins a thread the director left out, and prints it again when the thread comes back', () => {
    const left = clone(WRITERS);
    left.threads[2].role = 'left-out';
    left.threads[2].reason = 'The director left it out.';
    const out = renderSettledWeave(left, carriedEdits(standingAtMeeting(null, WRITERS, left), left));
    expect(out).not.toContain(WRITERS.connections[0].detail);
    expect(out).toContain('- c2, a moment, joining t1 and t2: The scoreboard brought the money into the vote.');
    expect(out.split('\n').find((line) => line.startsWith('- t3'))).toMatch(/^- t3 \(left out\): .*\[the director's changes M1: the role; M2: the reason\]$/);
    const back = clone(left);
    back.threads[2].role = 'mirrors-it';
    expect(renderSettledWeave(back, [])).toContain('- c1, a shared person, joining t1 and t3: Sloane turned the room against Rowan.');
  });

  // Meeting 3: the meeting's changes have an id form of their own wherever a prompt shows them.
  it("names a meeting change M and the edit's number, and refuses an id that is no meeting edit's", () => {
    expect(meetingChangeId('E1')).toBe('M1');
    expect(meetingChangeId('E12')).toBe('M12');
    expect(() => meetingChangeId('M1')).toThrow(/E and a number/);
    expect(() => meetingChangeId(undefined)).toThrow(/E and a number/);
  });
});
