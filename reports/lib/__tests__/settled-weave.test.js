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

  it("marks each change the director made at the meeting by its edit's id; a strike leaves no line to mark", () => {
    const text = settled();
    expect(text).toContain(`STORY: ${directors().story} [the director's change E1]`);
    expect(text.split('\n').find((line) => line.startsWith('- t3'))).toMatch(/\[the director's change E2: the role\]$/);
    expect(text.split('\n').find((line) => line.startsWith('- t7'))).toMatch(/\[the director's change E3: a thread they added\]$/);
    expect(text).not.toContain('E4');
    expect(text.split('\n').find((line) => line.startsWith('QUESTION:'))).not.toMatch(/\[the director's change/);
  });

  it('marks nothing when the director changed nothing', () => {
    const text = renderSettledWeave(clone(WRITERS), []);
    expect(text).not.toMatch(/\[the director's changes? E\d/);
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
