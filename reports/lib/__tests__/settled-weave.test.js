/**
 * The settled weave (phase 4, brief 4.5; spec 4.4 and 5.1; phase 4b, piece 3, brief 3B; spec
 * 2026-10-06 section 8): one renderer prints the story the director settled at the story meeting,
 * for every later writer (the map writer and the article writer call it, 4.6 and 4.7): the angle
 * the director picked, as they left it (lib/weave.js settledAngleOf):
 * - its headline, story, question, why it lands and where it ends up, and the director's words
 *   it rests on only when it is the first angle, the one that rests on them (R11);
 * - the threads it tells, in its order, a thread the director added after the angle's own, each
 *   by its id, its name and its line, and under each its evidence, one piece a line (phase 4b,
 *   brief 1B; R7): the map writer gives each beat the pieces that tell it; then the threads the
 *   angle leaves out, by name and nothing more (fix round, fix 5): the map writer adds no thread;
 * - the connections between its threads, each by its line and the names of the threads it joins;
 *   a struck connection is gone;
 * - every question with the thread it sits beside, the director's answer word for word, or marked
 *   unanswered, and what its answer changes;
 * - each change the director made at the meeting, marked by its edit's id.
 *
 * The fact check after a director's round reads the answers through the same module
 * (renderDirectorAnswers). Invented text: the repo is public.
 */

const { renderSettledWeave, renderDirectorAnswers, SETTLED_WEAVE_TAG, DIRECTOR_ANSWERS_TAG } = require('../prompt-renderers/settled-weave');
const { standingAtMeeting, carriedEdits } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

/** The writer's weave as the meeting showed it: two angles over four threads. */
const WRITERS = {
  angles: [
    {
      id: 'a1', headline: 'Ellis Pointed the Room at Rowan', gist: 'The case against Rowan landed on Ellis.',
      story: 'The room built a case against Rowan, and it landed on Ellis.', question: 'Will the verdict cost Ellis anything?',
      lands: 'Every player argued the case against Rowan.', ends: 'The retainer and the empty chair meet the old sign-off.',
      threads: ['t1', 't2', 't3']
    },
    {
      id: 'a2', headline: 'The Money Moved in the Last Two Minutes', gist: 'The last sales of the morning ran into one account.',
      story: 'The RowanVale account took the last sales of the morning while the room voted.', question: 'Who was selling while the room voted?',
      lands: 'The players watched the scoreboard and not the sales.', ends: 'The vote and the sales close in one minute.',
      threads: ['t2', 't1']
    }
  ],
  fromYourNotes: 'the frame this morning did not land the way it was meant to',
  threads: [
    {
      id: 't1', name: 'The case against Rowan', line: 'The case against Rowan held at four votes, and the room named Ellis.', verdict: true,
      evidence: [piece(['notes'], 'The room named Ellis at the vote.'), piece(['ledger', 'evidence-log'], 'A sale into RowanVale a minute after the warning was turned in.', 'cuts-against')]
    },
    { id: 't2', name: 'The last two minutes', line: 'The RowanVale account took the last two minutes of selling.', evidence: [piece(['ledger'], 'The late sales into RowanVale.')] },
    { id: 't3', name: 'The bathroom', line: 'Two allies split over the same secret.', evidence: [piece(['row001'], 'Rowan to Sloane: "Not a word to Ellis."')] },
    { id: 't4', name: 'The coat check', line: 'A side deal at the coat check.', evidence: [piece(['kai004'], 'Kai trades a favour at the coat check.')] }
  ],
  connections: [
    { id: 'c1', joins: ['t1', 't3'], line: 'Sloane turned the room against Rowan.', kind: 'person', evidence: [piece(['row001'], 'Sloane in the bathroom.')] },
    { id: 'c2', joins: ['t1', 't2'], line: 'The scoreboard brought the money into the vote.', kind: 'moment', evidence: [piece(['ledger'], 'The late sales.')] },
    { id: 'c3', joins: ['t3', 't4'], line: 'The coat check sits beside the bathroom.', kind: 'moment', evidence: [piece(['kai004'], 'The coat check.')] }
  ],
  questions: [
    { id: 'q1', kind: 'figure', about: 'RowanVale, "more than double the second"', question: 'The room heard more than double; the ledger has less. Print it as the room said it?', changes: "The money section's key line.", thread: 't2' },
    { id: 'q2', kind: 'player', about: 'Kai', question: 'The record holds nothing Kai did: what did Kai do?', changes: 'Where Kai appears.' },
    { id: 'q3', kind: 'pronoun', about: 'Sloane', question: 'The roster gives Sloane no pronoun: which one?', changes: "Sloane's pronoun in print." }
  ]
};

/** The director's version: angle 1 kept, t3's line rewritten, a thread added to it, c2 struck, q1 and q3 answered. */
function directors() {
  const weave = clone(WRITERS);
  weave.threads[2].line = 'Two allies split over the secret Rowan kept.';
  weave.threads.push({ id: 't7', name: 'The guest list', line: 'The guest list was rewritten that morning.' });
  weave.angles[0].threads.push('t7');
  weave.connections[1].struck = true;
  weave.questions[0].answer = 'Print it as the room said it, as their exaggeration.';
  weave.questions[2].answer = 'she/her';
  return weave;
}

const settled = () => {
  const weave = directors();
  return renderSettledWeave(weave, carriedEdits(standingAtMeeting(null, WRITERS, weave), weave));
};

describe('renderSettledWeave: the angle the director settled (briefs 4.5 and 3B)', () => {
  it('is one tagged block', () => {
    const text = settled();
    expect(SETTLED_WEAVE_TAG).toBe('SETTLED_WEAVE');
    expect(text.startsWith('<SETTLED_WEAVE>\n')).toBe(true);
    expect(text.endsWith('\n</SETTLED_WEAVE>')).toBe(true);
  });

  it("prints the angle's headline, story, question, why it lands and where it ends up, and the director's words it rests on", () => {
    const text = settled();
    const [a1] = WRITERS.angles;
    expect(text).toContain(`HEADLINE: ${a1.headline}`);
    expect(text).toContain(`STORY: ${a1.story}`);
    expect(text).toContain(`QUESTION: ${a1.question}`);
    expect(text).toContain(`WHY IT LANDS: ${a1.lands}`);
    expect(text).toContain(`WHERE IT ENDS UP: ${a1.ends}`);
    expect(text).toContain(`FROM THE DIRECTOR'S NOTES: "${WRITERS.fromYourNotes}"`);
    expect(text).not.toContain(WRITERS.angles[1].headline);
  });

  it("prints the angle's threads in its order by id, name and line, the director's after the angle's own, then the left-out threads by name", () => {
    const lines = settled().split('\n').filter((line) => /^- t\d/.test(line));
    expect(lines.map((line) => line.slice(0, line.indexOf(' ', 2)))).toEqual(['- t1', '- t2', '- t3', '- t7']);
    expect(lines[0]).toBe(`- t1 The case against Rowan: ${WRITERS.threads[0].line} It carries the room's verdict.`);
    expect(settled()).toContain('THREADS LEFT OUT: The coat check');
    expect(settled()).not.toMatch(/\((main thread|grounds it|left out)\)|Why it is left out/);
  });

  // Fix round, fix 5: the map writer adds no thread, so a left-out thread's line and evidence
  // are noise in its prompt. The settled weave prints a left-out thread by its name only.
  it('prints a left-out thread by its name, and nothing more: no id, no line, no evidence, no verdict flag', () => {
    const text = settled();
    ['Kai trades a favour at the coat check.', WRITERS.threads[3].line, '- t4'].forEach((text_) => expect(text).not.toContain(text_));
  });

  // R7: the settled weave carries each thread's evidence to the map writer, which gives each beat
  // the pieces that tell it.
  it("prints each thread's evidence under it, one piece a line: its stance, its sources and what it shows", () => {
    const lines = settled().split('\n');
    const at = lines.findIndex((line) => line.startsWith('- t1 '));
    expect(lines.slice(at + 1, at + 3)).toEqual([
      '  - supports, from notes: The room named Ellis at the vote.',
      '  - cuts against, from ledger and evidence-log: A sale into RowanVale a minute after the warning was turned in.'
    ]);
    expect(lines[lines.findIndex((line) => line.startsWith('- t3 ')) + 1]).toBe('  - supports, from row001: Rowan to Sloane: "Not a word to Ellis."');
  });

  // Review focus 1 of phase 4b: a thread the director added carries no evidence; the map writer finds it.
  it('says a thread in the story has no evidence yet, such as one the director added', () => {
    const lines = settled().split('\n');
    expect(lines[lines.findIndex((line) => line.startsWith('- t7 ')) + 1]).toBe('  - No evidence yet.');
  });

  it('prints the live connections between its threads, each by its line and the names of the threads it joins; a struck one and one to a left-out thread are gone', () => {
    const text = settled();
    expect(text).toContain('- c1, joining "The case against Rowan" and "The bathroom": Sloane turned the room against Rowan.');
    expect(text).not.toContain('c2');
    expect(text).not.toContain(WRITERS.connections[1].line);
    expect(text).not.toContain(WRITERS.connections[2].line);
  });

  it("keeps a connection's kind underneath: the settled weave never prints it", () => {
    expect(settled()).not.toMatch(/a shared person|a moment,|person|kind/);
  });

  it('prints every question with what its answer changes and the thread it sits beside, each answer word for word, and each question with no answer marked unanswered, of each kind', () => {
    const text = settled();
    expect(text).toContain(`- q1 (a figure; about: ${WRITERS.questions[0].about}; beside the thread "The last two minutes"): ${WRITERS.questions[0].question} Its answer changes: ${WRITERS.questions[0].changes}`);
    expect(text).toContain(`  The director's answer, word for word: "${directors().questions[0].answer}"`);
    expect(text).toContain(`- q2 (a player; about: Kai): ${WRITERS.questions[1].question} Its answer changes: ${WRITERS.questions[1].changes}\n  Unanswered.`);
    expect(text).toContain(`- q3 (a pronoun; about: Sloane): ${WRITERS.questions[2].question} Its answer changes: ${WRITERS.questions[2].changes}\n  The director's answer, word for word: "she/her"`);
  });

  // Brief 4.14a: by its id in the meeting's own form, M and the edit's number (E1 is M1), so
  // no later prompt holds a meeting change and a later stop's edit under one id.
  it("marks each change the director made at the meeting by its id in the meeting's own form; a strike leaves no line to mark", () => {
    const text = settled();
    expect(text.split('\n').find((line) => line.startsWith('- t3'))).toMatch(/\[the director's change M1: the line\]$/);
    expect(text.split('\n').find((line) => line.startsWith('- t7'))).toMatch(/\[the director's change M2: a thread they added\]$/);
    expect(text).not.toContain('M3');
    expect(text).not.toMatch(/\bE\d+\b/);
  });

  it('marks nothing when the director changed nothing', () => {
    const text = renderSettledWeave(clone(WRITERS), []);
    expect(text).not.toMatch(/\[the director's changes? [EM]\d/);
    expect(text).toContain('- c2, joining "The case against Rowan" and "The last two minutes": The scoreboard brought the money into the vote.');
  });

  it('prints no "from your notes" line when angle 1 did not start from the director\'s read', () => {
    const { fromYourNotes: _f, ...thin } = clone(WRITERS);
    expect(renderSettledWeave(thin, [])).not.toContain("FROM THE DIRECTOR'S NOTES");
  });

  // R11: "from your notes" travels with the first angle, the one that rests on the director's read.
  it('prints the picked angle, and no "from your notes" when another angle is picked', () => {
    const weave = { ...clone(WRITERS), picked: 'a2' };
    const text = renderSettledWeave(weave, []);
    expect(text).toContain(`HEADLINE: ${WRITERS.angles[1].headline}`);
    expect(text).not.toContain("FROM THE DIRECTOR'S NOTES");
    expect(text.split('\n').filter((line) => /^- t\d/.test(line)).map((line) => line.slice(0, 4))).toEqual(['- t2', '- t1']);
    expect(text).toContain('THREADS LEFT OUT: The bathroom; The coat check');
    expect(text).toContain('- c2, joining "The case against Rowan" and "The last two minutes"');
    expect(text).not.toContain(WRITERS.connections[0].line);
  });

  it('is empty for no weave and for a weave with no angle', () => {
    expect(renderSettledWeave(null, [])).toBe('');
    expect(renderSettledWeave({ story: 'x' }, [])).toBe('');
    expect(renderSettledWeave({ ...clone(WRITERS), angles: [] }, [])).toBe('');
  });

  it('carries no em-dash and names no theme in its own words', () => {
    const own = renderSettledWeave({
      angles: [{ id: 'a1', headline: 'h', gist: 'g', story: 's', question: 'q', lands: 'l', ends: 'e', threads: ['t1'] }],
      threads: [{ id: 't1', name: 'n', line: 'l', verdict: true, evidence: [piece(['ledger'], 'x')] }], connections: [], questions: []
    }, []);
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
  const { WEAVE_QUESTION_KINDS } = require('../writer-questions');

  /** The writer's weave as the meeting showed it: two angles, a connection of each kind, two questions of each kind. */
  const planted = () => ({
    angles: [
      {
        id: 'a1', headline: 'The Room Chose One Account', gist: 'The room built its case on one account.',
        story: 'The room built its case on one account, and the ledger points at another.', question: 'Who gained from the sale the room set aside?',
        lands: 'Every player voted on the account.', ends: 'The vote, the ledger and the old email meet at the empty chair.',
        threads: ['t1', 't2', 't3', 't4', 't5', 't8']
      },
      {
        id: 'a2', headline: 'The Overflow Account', gist: 'A second account took the overflow.',
        story: 'A second account took the overflow while the room argued.', question: 'Whose was the second account?',
        lands: 'No player named the second account.', ends: 'The overflow outlasts the vote.',
        threads: ['t8', 't1']
      }
    ],
    fromYourNotes: 'the account on top was the wrong one',
    threads: [
      { id: 't1', name: 'The final vote', line: 'The room named one account holder in the final vote.', verdict: true, evidence: [piece(['notes'], 'The final vote.')] },
      { id: 't2', name: 'The late sales', line: 'The account took its sales in the last two minutes.', evidence: [piece(['ledger'], 'The late sales.'), piece(['evidence-log'], 'A turn-in after them.', 'cuts-against')] },
      { id: 't3', name: 'Two stories', line: 'Two allies told the room different stories.', evidence: [piece(['row001'], 'One ally.')] },
      { id: 't4', name: 'A year ago', line: 'An old email shows the same move a year ago.', evidence: [piece(['row002'], 'The old email.')] },
      { id: 't5', name: 'The empty chair', line: 'The plan for the empty chair goes on after the vote.', evidence: [piece(['row003'], 'The plan.')] },
      { id: 't6', name: 'The coat rack', line: 'A side deal by the coat rack.', evidence: [piece(['row004'], 'The coat rack.')] },
      { id: 't8', name: 'The overflow', line: 'A second account took the overflow.', evidence: [piece(['ledger'], 'The overflow sales.')] }
    ],
    connections: [
      { id: 'c1', joins: ['t1', 't3'], line: 'Sloane stood with both sides.', kind: 'person', evidence: [piece(['row001'], 'Sloane.')] },
      { id: 'c2', joins: ['t1', 't2'], line: 'The scoreboard went up before the vote.', kind: 'moment', evidence: [piece(['ledger'], 'The scoreboard.')] },
      { id: 'c3', joins: ['t2', 't4'], line: 'The same email thread runs through both.', kind: 'document', evidence: [piece(['row002'], 'The thread.')] },
      { id: 'c4', joins: ['t3', 't5'], line: 'One sign-off comes back at the end.', kind: 'line', evidence: [piece(['row003'], 'The sign-off.')] },
      { id: 'c5', joins: ['t4', 't5'], line: 'The two dates fall in one week.', kind: 'moment', evidence: [piece(['row002', 'row003'], 'The dates.')] }
    ],
    questions: WEAVE_QUESTION_KINDS.flatMap((kind) => [
      { id: `q-${kind}`, kind, about: `the ${kind} asked about`, question: `What about the ${kind}?`, changes: `The line the ${kind} prints in.`, thread: 't2' },
      { id: `q-${kind}-open`, kind, about: `the ${kind} left open`, question: `What else about the ${kind}?`, changes: `Another line the ${kind} prints in.` }
    ])
  });

  /**
   * The director's version: "from your notes" rewritten, t8 given a new name and a new line (two
   * marks on one line), t7 added to the angle, c5 struck, and one question of each kind answered.
   */
  const directors = () => {
    const weave = planted();
    weave.fromYourNotes = 'the account on top was the wrong one, and the room knew it';
    const t8 = weave.threads.find((thread) => thread.id === 't8');
    t8.name = 'The second account';
    t8.line = 'A second account took the overflow, under a name no one claimed.';
    weave.threads.push({ id: 't7', name: 'The guest list', line: 'The guest list changed that morning.' });
    weave.angles[0].threads.push('t7');
    weave.connections.find((connection) => connection.id === 'c5').struck = true;
    weave.questions.filter((q) => !q.id.endsWith('-open')).forEach((q) => { q.answer = `The director's answer about ${q.about}.`; });
    return weave;
  };

  const render = () => {
    const weave = directors();
    return renderSettledWeave(weave, carriedEdits(standingAtMeeting(null, planted(), weave), weave));
  };

  it('the render prints every label: the pitch, an added thread, the evidence of each stance, the threads left out, live connections, each question kind both ways and beside its thread, and changes by their edit ids', () => {
    const text = render();
    const lines = text.split('\n');
    const labels = [
      '<SETTLED_WEAVE>', 'The story the director settled at the story meeting', 'HEADLINE: ', 'STORY: ', 'QUESTION: ', 'WHY IT LANDS: ', 'WHERE IT ENDS UP: ',
      "FROM THE DIRECTOR'S NOTES: \"", 'THREADS IN THE STORY:', " It carries the room's verdict.", 'THREADS LEFT OUT: ',
      '  - supports, from ', '  - cuts against, from ', '  - No evidence yet.',
      'CONNECTIONS:', ', joining ', "QUESTIONS TO THE DIRECTOR, WITH THE DIRECTOR'S ANSWERS:", '; beside the thread "', ' Its answer changes: ',
      "  The director's answer, word for word: \"", '  Unanswered.', '</SETTLED_WEAVE>'
    ];
    labels.forEach((label) => expect(`${label}: ${text.includes(label)}`).toBe(`${label}: true`));
    expect(text).not.toContain('c5,');
    WEAVE_QUESTION_KINDS.forEach((kind) => {
      expect(lines[lines.findIndex((line) => line.startsWith(`- q-${kind} `)) + 1]).toMatch(/^ {2}The director's answer, word for word: "/);
      expect(lines[lines.findIndex((line) => line.startsWith(`- q-${kind}-open `)) + 1]).toBe('  Unanswered.');
    });
    // Brief 4.14a: each change by its id in the meeting's own form (M and the edit's number).
    expect(lines.find((line) => line.startsWith("FROM THE DIRECTOR'S NOTES: "))).toMatch(/ \[the director's change M\d+\]$/);
    expect(lines.find((line) => line.startsWith('- t7 '))).toMatch(/ \[the director's change M\d+: a thread they added\]$/);
    expect(lines.find((line) => line.startsWith('- t8 '))).toMatch(/ \[the director's changes M\d+: the (name|line); M\d+: the (name|line)\]$/);
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

  // Meeting 2; piece 3: a connection that joins a thread the angle leaves out is out of the story.
  it('leaves out a connection that joins a thread the angle leaves out, and prints it again when the angle tells the thread', () => {
    const left = clone(WRITERS);
    left.angles[0].threads = ['t1', 't2'];
    const out = renderSettledWeave(left, []);
    expect(out).not.toContain(WRITERS.connections[0].line);
    expect(out).toContain('- c2, joining "The case against Rowan" and "The last two minutes": The scoreboard brought the money into the vote.');
    expect(renderSettledWeave(clone(WRITERS), [])).toContain('- c1, joining "The case against Rowan" and "The bathroom": Sloane turned the room against Rowan.');
  });

  // Meeting 3: the meeting's changes have an id form of their own wherever a prompt shows them.
  it("names a meeting change M and the edit's number, and refuses an id that is no meeting edit's", () => {
    expect(meetingChangeId('E1')).toBe('M1');
    expect(meetingChangeId('E12')).toBe('M12');
    expect(() => meetingChangeId('M1')).toThrow(/E and a number/);
    expect(() => meetingChangeId(undefined)).toThrow(/E and a number/);
  });
});
