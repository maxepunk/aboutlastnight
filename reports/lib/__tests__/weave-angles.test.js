/**
 * The weave as angles (phase 4b, piece 3, brief 3B; spec 2026-10-06 sections 4, 8, 9.1 and 17;
 * rulings R1, R4, R8 to R11).
 *
 * The arc writer pitches two or three angles over one shared set of threads. Each angle is a
 * headline, a card line (`gist`), its story, its question, why it lands and where it ends up,
 * told through the threads it names in its own order; a thread is a name and a line with its
 * evidence, and no role. The director's pick, `picked`, rides on the weave and is code's, as an
 * answer is. Every later writer reads the settled angle through one helper (settledAngleOf).
 *
 * Every weave here is in session 100326's shape with invented text (fixtures/angles-weave.js).
 */

const Ajv = require('ajv');
const weaveLib = require('../weave');
const {
  ANGLE_FIELDS, PICKED_KEY, MEETING_WORD_BOUND, MEETING_WORD_FLOOR, QUESTION_WORD_BOUND,
  pickedAngleOf, settledAngleOf, storyConnections, weaveFindings
} = weaveLib;
const { WEAVE_SCHEMA } = require('../sdk-client/subagents');
const { DIRECTOR_WEAVE_SCHEMA, directorWeaveProblems, meetingResume } = require('../meeting');
const { WEAVE_QUESTION_THREAD_KEY, WEAVE_QUESTIONS_PROPERTY, weaveQuestionsOf } = require('../writer-questions');
const { evidenceContextOf } = require('../evidence');
const { renderSettledWeave } = require('../prompt-renderers/settled-weave');
const { standingAtMeeting, carriedEdits } = require('../hand-edit-diff');
const { settledStoryOf } = require('../map');
const { _testing: arcTesting } = require('../workflow/nodes/arc-specialist-nodes');
const { NOTES, anglesRecord, anglesWeave } = require('./fixtures/angles-weave');

const clone = (v) => JSON.parse(JSON.stringify(v));
const EVIDENCE = evidenceContextOf({ evidenceBundle: anglesRecord(), directorNotes: { rawProse: NOTES } });
const findings = (weave) => weaveFindings(weave, { evidence: EVIDENCE, directorWords: [NOTES] });
const failuresOf = (weave, type) => findings(weave).failures.filter((f) => f.type === type);

describe("the shape: angles over one shared set of threads (spec 17)", () => {
  test('the names this run fixes', () => {
    expect(ANGLE_FIELDS).toEqual(['headline', 'gist', 'story', 'question', 'lands', 'ends']);
    expect(Object.isFrozen(ANGLE_FIELDS)).toBe(true);
    expect(PICKED_KEY).toBe('picked');
    expect(MEETING_WORD_BOUND).toBe(450);
    expect(MEETING_WORD_FLOOR).toBe(350);
    expect(QUESTION_WORD_BOUND).toBe(40);
    expect(WEAVE_QUESTION_THREAD_KEY).toBe('thread');
  });

  test("the writer's schema takes a weave in 100326's shape", () => {
    const validate = new Ajv({ allErrors: true, strict: true }).compile(WEAVE_SCHEMA);
    expect(validate(anglesWeave())).toBe(true);
  });

  test('the weave is its angles, "from your notes", threads, connections and questions; the single story went', () => {
    expect(Object.keys(WEAVE_SCHEMA.properties).sort()).toEqual(['angles', 'connections', 'fromYourNotes', 'questions', 'threads']);
    expect(WEAVE_SCHEMA.required).toEqual(['angles', 'threads', 'connections', 'questions']);
  });

  test('an angle is its id, its printed fields and the ids of its threads, each required', () => {
    const angle = WEAVE_SCHEMA.properties.angles.items;
    expect(Object.keys(angle.properties)).toEqual(['id', ...ANGLE_FIELDS, 'threads']);
    expect(angle.required).toEqual(['id', ...ANGLE_FIELDS, 'threads']);
    expect(angle.properties.threads).toMatchObject({ type: 'array', items: { type: 'string' } });
  });

  test('a thread is its id, name, line, verdict flag and evidence, with no role and no reason', () => {
    const thread = WEAVE_SCHEMA.properties.threads.items;
    expect(Object.keys(thread.properties)).toEqual(['id', 'name', 'line', 'verdict', 'evidence']);
    expect(thread.required).toEqual(['id', 'name', 'line', 'evidence']);
  });

  test("a question may name the thread it sits beside, read beside the answer and never required", () => {
    const question = WEAVE_QUESTIONS_PROPERTY.items;
    expect(question.properties[WEAVE_QUESTION_THREAD_KEY]).toMatchObject({ type: 'string' });
    expect(question.required).not.toContain(WEAVE_QUESTION_THREAD_KEY);
    const [byPitch, beside] = weaveQuestionsOf(anglesWeave().questions);
    expect(byPitch).not.toHaveProperty('thread');
    expect(beside.thread).toBe('t6');
    expect(weaveQuestionsOf([{ ...beside, thread: '  ', answer: 'Yes.' }])[0]).toEqual({ ...beside, thread: undefined, answer: 'Yes.' });
  });

  test("the director-side schema adds the pick, the answer, and a thread the director adds by its name and line alone", () => {
    expect(DIRECTOR_WEAVE_SCHEMA.properties[PICKED_KEY]).toMatchObject({ type: 'string' });
    expect(DIRECTOR_WEAVE_SCHEMA.properties.questions.items.properties.answer).toMatchObject({ type: 'string' });
    expect(DIRECTOR_WEAVE_SCHEMA.properties.threads.items.required).toEqual(['id', 'name', 'line']);
    const left = anglesWeave();
    left.picked = 'a1';
    left.threads.push({ id: 't8', name: 'Jess turned in the meeting', line: 'Jess turned in the memory of Vic meeting Morgan.' });
    left.angles[0].threads.push('t8');
    expect(directorWeaveProblems(left, { shown: anglesWeave() })).toBeNull();
  });

  test("the console's copy of the pick's key is the server's", () => {
    expect(require('../../console/checkpoint-view-logic').PICKED_KEY).toBe(PICKED_KEY);
  });

  test('the director-side schema refuses a repeated angle id the director made, as it refuses any repeat', () => {
    const left = anglesWeave();
    left.angles.push({ ...clone(left.angles[2]) });
    expect(directorWeaveProblems(left, { shown: anglesWeave() })).toMatch(/two angles share the id "a3"/i);
  });
});

describe('the pick (R1)', () => {
  test('pickedAngleOf reads the pick, else the first angle, else nothing', () => {
    const weave = anglesWeave();
    expect(pickedAngleOf(weave).id).toBe('a1');
    expect(pickedAngleOf({ ...weave, picked: 'a3' }).id).toBe('a3');
    expect(pickedAngleOf({ ...weave, picked: 'a9' }).id).toBe('a1');
    expect(pickedAngleOf({ ...weave, angles: [] })).toBeNull();
    expect(pickedAngleOf(null)).toBeNull();
  });

  test("code strips a pick from a writer's output", () => {
    const output = { ...anglesWeave(), picked: 'a2' };
    expect(arcTesting.weaveFromOutput(output, 'weave writer')).not.toHaveProperty(PICKED_KEY);
  });

  test("a rework keeps the director's pick while its angle survives by id", () => {
    const previous = { ...anglesWeave(), picked: 'a2' };
    const output = { ...anglesWeave(), picked: 'a3' };
    output.angles[1].headline = 'A reworded headline for the second angle';
    expect(arcTesting.weaveFromRework(output, previous, { directorRound: false })[PICKED_KEY]).toBe('a2');
  });

  test('a rework that drops the picked angle opens the first angle', () => {
    const previous = { ...anglesWeave(), picked: 'a2' };
    const output = anglesWeave();
    output.angles.splice(1, 1);
    const reworked = arcTesting.weaveFromRework(output, previous, { directorRound: true });
    expect(reworked).not.toHaveProperty(PICKED_KEY);
    expect(pickedAngleOf(reworked).id).toBe('a1');
  });
});

describe('the checks on the angles (spec 9.1; R4)', () => {
  test("the weave in 100326's shape passes every check", () => {
    expect(findings(anglesWeave())).toEqual({ failures: [], concerns: [] });
  });

  test('one angle fails: the writer pitches two or three', () => {
    const weave = anglesWeave();
    weave.angles = weave.angles.slice(0, 1);
    expect(failuresOf(weave, 'angle-count')).toHaveLength(1);
  });

  test('four angles fail', () => {
    const weave = anglesWeave();
    weave.angles.push({ ...clone(weave.angles[2]), id: 'a4' });
    expect(failuresOf(weave, 'angle-count')).toHaveLength(1);
  });

  test('an angle that lacks a field fails beside that angle', () => {
    const weave = anglesWeave();
    delete weave.angles[1].lands;
    weave.angles[2].threads = [];
    const failures = failuresOf(weave, 'angle-incomplete');
    expect(failures.map((f) => f.place)).toEqual(['angles[#a2]', 'angles[#a3]']);
  });

  test('an angle naming a thread the weave lacks fails beside that angle', () => {
    const weave = anglesWeave();
    weave.angles[1].threads.push('t9');
    const [failure] = failuresOf(weave, 'angle-names-unknown-thread');
    expect(failure.place).toBe('angles[#a2]');
    expect(failure.line).not.toMatch(/\bt9\b|\ba2\b/);
  });

  test("an angle without the verdict's thread fails beside that angle, naming the thread", () => {
    const weave = anglesWeave();
    weave.angles[2].threads = ['t5', 't2'];
    const [failure] = failuresOf(weave, 'angle-without-verdict');
    expect(failure.place).toBe('angles[#a3]');
    expect(failure.line).toContain('Morgan, named by her own memories');
  });

  test('story terms on each angle\'s lines: a clock time and a figure in where it ends up fail; the headline is exempt', () => {
    const weave = anglesWeave();
    weave.angles[0].ends = 'At 9:15 PM the room named Morgan, and $50,000 moved to the buyer.';
    weave.angles[1].headline = 'At 9:15 PM, $50,000 Moved';
    const failures = failuresOf(weave, 'story-terms');
    expect(failures.map((f) => f.place)).toEqual(['angles[#a1]']);
  });

  test('a question of 79 words fails', () => {
    const weave = anglesWeave();
    const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
    weave.questions[0] = { ...weave.questions[0], about: words(19), question: `${words(39)}?`, changes: `${words(21)}.` };
    const [failure] = failuresOf(weave, 'question-too-long');
    expect(failure.place).toBe('questions[#q1]');
    expect(failure.message).toContain('79');
  });

  test('a question of 40 words passes', () => {
    const weave = anglesWeave();
    const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
    weave.questions[0] = { ...weave.questions[0], about: words(10), question: `${words(20)}?`, changes: `${words(10)}.` };
    expect(failuresOf(weave, 'question-too-long')).toEqual([]);
  });

  test('a question beside a thread the weave lacks fails', () => {
    const weave = anglesWeave();
    weave.questions[1].thread = 't9';
    const [failure] = failuresOf(weave, 'question-thread-unknown');
    expect(failure.place).toBe('questions[#q2]');
  });

  test('a thread no angle uses still needs a piece that supports it', () => {
    const weave = anglesWeave();
    weave.threads[6].evidence = weave.threads[6].evidence.map((p) => ({ ...p, stance: 'cuts-against' }));
    expect(failuresOf(weave, 'thread-without-evidence').map((f) => f.place)).toEqual(['threads[#t7]']);
  });

  test('angles need ids of their own', () => {
    const weave = anglesWeave();
    weave.angles[2].id = 'a2';
    expect(failuresOf(weave, 'duplicate-id').map((f) => f.place)).toEqual(['angles[#a2]']);
  });

  test('no check names a role, a left-out reason, the convergence or the stronger main thread', () => {
    const weave = anglesWeave();
    const types = findings(weave).failures.map((f) => f.type);
    ['left-out-without-reason', 'stronger-main-thread-unknown'].forEach((type) => expect(types).not.toContain(type));
  });
});

describe('the gate (R8, R9)', () => {
  const stateAt = () => ({ weave: anglesWeave(), _weaveBaseline: anglesWeave(), sessionConfig: {}, directorGateNotes: [] });

  test("refuses a director's version whose picked angle lacks the verdict's thread, naming it (Review focus 5)", () => {
    const left = anglesWeave();
    left.picked = 'a2';
    left.angles[1].threads = ['t3', 't6'];
    const refusal = directorWeaveProblems(left, { shown: anglesWeave() });
    expect(refusal).toContain('Morgan, named by her own memories');
    const { error } = meetingResume({ meeting: 'approve', weave: left }, stateAt());
    expect(error).toContain('Morgan, named by her own memories');
  });

  test('refuses a pick that names no angle the weave holds', () => {
    const left = { ...anglesWeave(), picked: 'a9' };
    expect(directorWeaveProblems(left, { shown: anglesWeave() })).toMatch(/pick/i);
  });

  test("stores every angle but the picked one as the meeting showed it, by id", () => {
    const left = anglesWeave();
    left.picked = 'a2';
    left.angles[0].headline = 'A change to an angle the director did not send';
    left.angles[1].headline = 'The headline the director gave the angle they sent';
    left.angles[2].threads = ['t5', 't1'];
    const { error, stateUpdates } = meetingResume({ meeting: 'approve', weave: left }, stateAt());
    expect(error).toBeNull();
    const stored = stateUpdates.weave;
    expect(stored[PICKED_KEY]).toBe('a2');
    expect(stored.angles[0]).toEqual(anglesWeave().angles[0]);
    expect(stored.angles[1].headline).toBe('The headline the director gave the angle they sent');
    expect(stored.angles[2]).toEqual(anglesWeave().angles[2]);
  });
});

describe('the settled reading: the picked angle (spec 8; R11)', () => {
  /** The director picks angle 2 and adds a thread to it, which goes after the angle's own. */
  function pickedSecond() {
    const left = anglesWeave();
    left.picked = 'a2';
    left.threads.push({ id: 't8', name: 'Jess turned in the meeting', line: 'Jess turned in the memory of Vic meeting Morgan.' });
    left.angles[1].threads.push('t8');
    left.questions[1].answer = 'Yes, with the first sale.';
    return left;
  }

  test('settledAngleOf gives the picked angle, its threads in its order, the rest left out, and the connections between its threads', () => {
    const settled = settledAngleOf(pickedSecond());
    expect(settled.angle.id).toBe('a2');
    expect(settled.threads.map((t) => t.id)).toEqual(['t3', 't1', 't6', 't8']);
    expect(settled.leftOut.map((t) => t.id)).toEqual(['t2', 't4', 't5', 't7']);
    expect(settled.connections.map((c) => c.id)).toEqual(['c1']);
    expect(storyConnections(pickedSecond()).map((c) => c.id)).toEqual(['c1']);
    expect(settledAngleOf({ ...anglesWeave(), angles: [] })).toBeNull();
  });

  test("angle 2 settled prints its pitch, no \"from your notes\", its threads in order with the director's after, and only its connections (Review focus 3)", () => {
    const left = pickedSecond();
    const edits = carriedEdits(standingAtMeeting(null, anglesWeave(), left), left);
    const text = renderSettledWeave(left, edits);
    const a2 = left.angles[1];
    [a2.headline, a2.story, a2.question, a2.lands, a2.ends].forEach((line) => expect(text).toContain(line));
    expect(text).not.toContain(left.angles[0].headline);
    expect(text).not.toContain(left.angles[2].story);
    expect(text).not.toContain("FROM THE DIRECTOR'S NOTES");
    expect(text).not.toContain(left.fromYourNotes);
    const order = ['t3', 't1', 't6', 't8'].map((id) => text.indexOf(`- ${id} `));
    order.forEach((at) => expect(at).toBeGreaterThan(-1));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain(left.connections[0].line);
    expect(text).not.toContain(left.connections[1].line);
    expect(text).not.toContain(left.connections[2].line);
    ['Vic, nearly named with Morgan', 'The suspects the room let go', 'Alex, untouched and rising', "Marcus's stolen code"]
      .forEach((name) => expect(text).toContain(name));
    expect(text).not.toContain(left.threads[1].line);
    expect(text).toContain('Yes, with the first sale.');
    expect(text).toMatch(/beside the thread "Memories sold while the room argued"/);
  });

  test('angle 1 settled prints "from your notes", the director\'s read it rests on', () => {
    const text = renderSettledWeave(anglesWeave(), []);
    expect(text).toContain(`FROM THE DIRECTOR'S NOTES: "${anglesWeave().fromYourNotes}"`);
  });

  test("the map's settled story is the picked angle's story and question", () => {
    const left = pickedSecond();
    expect(settledStoryOf(left)).toEqual({ story: left.angles[1].story, question: left.angles[1].question });
    expect(settledStoryOf(anglesWeave())).toEqual({ story: anglesWeave().angles[0].story, question: anglesWeave().angles[0].question });
  });
});

describe('a question whose thread a rework drops sits by the pitch, with its answer (R10; Review focus 4)', () => {
  test('the stale thread goes and the answer stays, answered or not, and the settled weave prints the answer', () => {
    const previous = anglesWeave();
    previous.questions[1].answer = 'Yes, with the first sale.';
    const output = anglesWeave();
    output.threads = output.threads.filter((t) => t.id !== 't6');
    output.angles[1].threads = ['t3', 't1'];
    const reworked = arcTesting.weaveFromRework(output, previous, { directorRound: false });
    const q2 = reworked.questions.find((q) => q.id === 'q2');
    expect(q2).not.toHaveProperty('thread');
    expect(q2.answer).toBe('Yes, with the first sale.');
    const text = renderSettledWeave(reworked, []);
    expect(text).toContain('Yes, with the first sale.');
    expect(text).not.toContain('beside the thread');
  });

  test("an unanswered question beside a thread the rework renumbered loses the stale thread", () => {
    const previous = anglesWeave();
    const output = anglesWeave();
    output.threads[5].id = 't16';
    output.angles[1].threads = ['t3', 't1', 't16'];
    output.questions[1].thread = 't6';
    const reworked = arcTesting.weaveFromRework(output, previous, { directorRound: false });
    expect(reworked.questions.find((q) => q.id === 'q2')).not.toHaveProperty('thread');
  });
});
