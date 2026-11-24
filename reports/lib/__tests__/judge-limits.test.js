/**
 * Phase 18, brief F: the judges check the limits.
 *
 * The judges keep T1 to T15 as the codes their findings open with, since code reads the code to
 * tell which criterion a finding belongs to, and stored sessions hold findings in that form. The
 * limits file carries no codes, so each judge's own instructions list the fifteen limits by code
 * and name, in the file's order (R8; the brief-and-the-limits spec, section 7): one constant,
 * LIMIT_CODES, which a test here holds equal to the bold lead-ins of limits.md.
 *
 * The judges' own instructions take the rule-text read's part 5e, word for word, and the article
 * judge's line on where Nova was its part 5c, from the session config the mode block is chosen by.
 *
 * Run 2b (R28): both judges read the director's notes under one label with its line on backstory,
 * and the weave's judge reads the roster block and the money totals the article's judge reads.
 * Run 2c (R30) takes back R28's shorter lists: each judge lists all fifteen limits again. Run 2c
 * also adds what a breach is and what the director's words are, the fixed facts to the first
 * question, what a fix holds, what a weave is to its judge and what the map is to the article's.
 *
 * Review focus 1: a thread from before the merge holds findings in today's form ("T5: …", and a
 * concern "Director's edit E1: T1: …"). They still match their criteria and still read past their
 * codes at the desk.
 */
const fs = require('fs');
const path = require('path');
const evaluatorNodes = require('../workflow/nodes/evaluator-nodes');
const { evaluateArticle, LIMIT_CODES, _testing: evalTesting } = evaluatorNodes;
const { getPhaseCriteria, buildEvaluationSystemPrompt, buildEvaluationUserPrompt, judgedEdits } = evalTesting;
const ruleSet = require('../rule-set');
const { standingAfterSendBack, standingAtMeeting, DIRECTOR_EDIT_PREFIX } = require('../hand-edit-diff');
const { leadingRuleIds } = require('../workflow/nodes/node-helpers');
const { REVISION_CAPS } = require('../workflow/state');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const ViewLogic = require('../../console/checkpoint-view-logic');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (text, part) => text.split(part).length - 1;
const loadModeBlock = (mode) => ruleSet.loadModeBlock(mode, { theme: 'journalist' });

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

/** The journalist's limits file, as every writer and judge reads it. */
const LIMITS_FILE = path.join(__dirname, '../../.claude/skills/journalist-report/references/rules/limits.md');

/** The words between `**` at the start of each paragraph of limits.md, without the full stop. */
function boldLeadIns(text) {
  return text.split(/\n\s*\n/)
    .map((paragraph) => /^\*\*([^*]+?)\.?\*\*/.exec(paragraph.trim()))
    .filter(Boolean)
    .map((m) => m[1]);
}

/**
 * Each judge's own list of the limits, each entry word for word from the rule-text read's part 4.
 * Run 2c (R30): each judge lists all fifteen, as the spec's section 7 says; run 2b's shorter lists
 * (R28) are taken back.
 */
const LIMITS_LINE = 'T1 What can be stated as fact. T2 The verdict. T3 Sold memories. T4 Whose account it is. T5 The money. T6 Who made a memory public. T7 Three stretches of time. T8 Nova takes no side, with the part about this session. T9 Pronouns. T10 How many people. T11 Characters, never the players. T12 Quotes are exact. T13 Photos. T14 Nothing from outside the story. T15 Fixed facts.';

/** The two paragraphs run 2c adds after "One breach fails it", word for word (the wording doc's part 7). */
const BREACH_LINE = "A breach is something you can show: the sentence, and what in the record or the director's words it goes against. A line you only doubt is not a breach. A plain statement of what Nova thinks is Nova's opinion, and it needs no label to pass.";
const WORDS_LINE = "The director's words are the director's notes, the corrections at the input review, the accusation as the director wrote it, the answers at the story meeting and the notes at the stops.";

const RULE = '═══════════════════════════════════════════════════════════════════════════';

const stateFor = (mode = 'remote', extra = {}) => {
  const state = { ...reworkFixtureState('journalist'), contentBundle: clone(PREVIOUS_BUNDLE), articleApproved: false, evaluationHistory: [], ...extra };
  state.sessionConfig = { ...state.sessionConfig, reportingMode: mode };
  return state;
};
const systemFor = (phase, state) => buildEvaluationSystemPrompt(phase, getPhaseCriteria(phase, 'journalist'), 'journalist', { sessionConfig: state.sessionConfig });

describe('R8: the judges\' list of the limits', () => {
  it('LIMIT_CODES is the fifteen limits in order, T1 to T15, each with its code and name', () => {
    expect(LIMIT_CODES.map((limit) => limit.code)).toEqual(Array.from({ length: 15 }, (_, i) => `T${i + 1}`));
    LIMIT_CODES.forEach((limit) => expect(Object.keys(limit).sort()).toEqual(['code', 'name']));
    expect(Object.isFrozen(LIMIT_CODES)).toBe(true);
  });

  it("each name is the bold lead-in of limits.md, in the file's order; T8's adds the part about this session", () => {
    const leadIns = boldLeadIns(fs.readFileSync(LIMITS_FILE, 'utf8'));
    expect(leadIns).toHaveLength(15);
    const SUFFIX = ', with the part about this session';
    expect(LIMIT_CODES.find((limit) => limit.code === 'T8').name).toBe(`${leadIns[7]}${SUFFIX}`);
    expect(LIMIT_CODES.map((limit) => (limit.code === 'T8' ? limit.name.slice(0, -SUFFIX.length) : limit.name))).toEqual(leadIns);
  });

  // Run 2c (the wording doc's part 7): the first question of each judge names the fixed facts among
  // its codes, so T15 is scored; T10, the head count, is the code fact check's and stays in no criterion.
  it('every code a criterion scores is a limit\'s code; T10 is in no criterion, and T15 is the first question\'s', () => {
    const codes = LIMIT_CODES.map((limit) => limit.code);
    const scored = ['arcs', 'article'].flatMap((phase) => Object.values(getPhaseCriteria(phase, 'journalist')).flatMap((c) => c.rules));
    expect(scored.filter((code) => !codes.includes(code))).toEqual([]);
    expect(scored).not.toContain('T10');
    ['arcs', 'article'].forEach((phase) => {
      const owners = Object.entries(getPhaseCriteria(phase, 'journalist')).filter(([, c]) => c.rules.includes('T15')).map(([key]) => key);
      expect([phase, owners]).toEqual([phase, ['evidenceTruth']]);
    });
  });

  // Run 2f (left from run 2c, whose shorter lists took the assertion with them): a question names a
  // limit by its code in brackets, and a finding is matched to its criterion by that code, so every
  // code a judge's questions cite is one its criteria score. Derived from the criteria themselves,
  // so a question that gains a code no criterion scores fails here. The money question cites T1 for
  // a figure the director's words give, which the first question scores.
  it.each(['arcs', 'article'])("the %s judge: every code its questions cite is a code its criteria score", (phase) => {
    const criteria = Object.values(getPhaseCriteria(phase, 'journalist'));
    const scored = new Set(criteria.flatMap((criterion) => criterion.rules));
    const cited = new Set(criteria.flatMap((criterion) => criterion.description.match(/\bT\d{1,2}\b/g) || []));
    expect(cited.size).toBeGreaterThan(0);
    expect([...cited].filter((code) => !scored.has(code))).toEqual([]);
    // Each criterion's own codes are all cited in its own question.
    criteria.forEach((criterion) => {
      const own = criterion.description.match(/\bT\d{1,2}\b/g) || [];
      expect(criterion.rules.filter((code) => !own.includes(code))).toEqual([]);
    });
  });

  it.each(['arcs', 'article'])('the %s judge prints its list once, as one line, right under its heading', (phase) => {
    const system = systemFor(phase, stateFor());
    expect(count(system, LIMITS_LINE)).toBe(1);
    expect(system).toContain(`${RULE}\nTHE LIMITS (MUST PASS: a breach is a definite error, so the output goes back for a rework)\n${RULE}\n${LIMITS_LINE}\nEach criterion below scores the limits it names by their codes, against the record and the director's words in the evaluation prompt. One breach fails it: score it below 0.8.\n`);
    expect(system).not.toContain('TRUTH RULES');
  });
});

// Run 2c (R30): R28's shorter lists are withdrawn. A judge is for catching every breach, and the
// spec's section 7 has each judge list the fifteen limits by code and name, in the limits' order.
describe('R30: each judge lists the fifteen limits', () => {
  /** The codes on the line right under the heading THE LIMITS and its closing rule. */
  const printedCodes = (phase) => {
    const lines = systemFor(phase, stateFor()).split('\n');
    const heading = lines.findIndex((line) => line.startsWith('THE LIMITS ('));
    expect(heading).toBeGreaterThan(-1);
    return lines[heading + 2].match(/\bT\d{1,2}\b/g) || [];
  };

  it.each(['arcs', 'article'])('the %s judge lists T1 to T15, in order, whatever its criteria score', (phase) => {
    expect(printedCodes(phase)).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12', 'T13', 'T14', 'T15']);
  });
});

// Run 2c (the wording doc's part 7, "After 'One breach fails it'"): two paragraphs, in this order,
// after the pass mark and before the questions, for both judges: what a breach is and what a judge
// does with doubt, then the one statement of the director's words the questions point at.
describe('run 2c: what a breach is, and what the director\'s words are', () => {
  it.each(['arcs', 'article'])('the %s judge reads both paragraphs once, between the pass mark and the first question', (phase) => {
    const system = systemFor(phase, stateFor());
    expect(system).toContain(`One breach fails it: score it below 0.8.\n${BREACH_LINE}\n${WORDS_LINE}\n- evidenceTruth (`);
    expect(count(system, BREACH_LINE)).toBe(1);
    expect(count(system, WORDS_LINE)).toBe(1);
  });

  it('the statement names the five sources of the director\'s words, in the order lib/director-words.js lists them', () => {
    const { DIRECTOR_WORDS_SOURCES } = require('../director-words');
    const PHRASE = {
      notes: "the director's notes", corrections: 'the corrections at the input review', accusation: 'the accusation as the director wrote it',
      answers: 'the answers at the story meeting', stopNotes: 'the notes at the stops'
    };
    const at = DIRECTOR_WORDS_SOURCES.map((source) => WORDS_LINE.indexOf(PHRASE[source.key]));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

// Run 2c (the wording doc's part 7, "The fixed facts"): each judge's first question gains the clause
// and names T15 among its codes. Everything that reads a criterion's codes follows from its `rules`:
// the line that says which limits it scores, the reading of a finding's opening code, the verdict
// guard on the director's edits, and the rework's criteriaRules.
describe('run 2c: the fixed facts are the first question\'s', () => {
  const CLAUSE = 'say who it was (T6); and does nothing in it go against the fixed facts (T15)?';
  const FIXED_FACTS_ISSUE = 'T15: "Blake owns NeurAI" goes against the fixed facts: Blake manages operations there.';

  it.each(['arcs', 'article'])('the %s judge: the question ends on the clause, and its line names T15 among its codes', (phase) => {
    const { evidenceTruth } = getPhaseCriteria(phase, 'journalist');
    expect(evidenceTruth.rules).toEqual(['T1', 'T3', 'T4', 'T6', 'T15']);
    expect(evidenceTruth.description.endsWith(CLAUSE)).toBe(true);
    expect(systemFor(phase, stateFor())).toContain(`\n- evidenceTruth (T1, T3, T4, T6, T15; must pass): ${evidenceTruth.description}\n`);
  });

  it('a finding that opens with T15 is read as the first question\'s: no second line for it, and it holds the output', () => {
    const { guardDirectorEdits } = evalTesting;
    const guard = guardDirectorEdits({
      evaluation: {
        structuralPassed: false,
        criteriaScores: { evidenceTruth: { score: 0.3, notes: 'Blake is called the owner.' }, moneyTruth: { score: 1 } },
        structuralIssues: [FIXED_FACTS_ISSUE]
      },
      criteria: getPhaseCriteria('article', 'journalist'),
      edits: [],
      output: null
    });
    expect(leadingRuleIds(FIXED_FACTS_ISSUE)).toEqual(['T15']);
    expect(guard.kept).toEqual([FIXED_FACTS_ISSUE]);
    expect(guard.holding).toEqual(['evidenceTruth']);
    expect(guard.ready).toBe(false);
  });
});

// Run 2b (R28; the prompt read's judges' findings 13 and 19): the two judges read the same notes
// the same way, and the weave's judge reads the roster block and the money totals the article's
// judge reads, each from the function the other judge calls, so the blocks are byte-equal for one
// session.
describe('R28: the two judges read the same notes, roster and totals', () => {
  const { ARC_NOTES_LABEL } = require('../workflow/nodes/arc-specialist-nodes');
  const { buildSessionFacts, getPromptBuilder } = require('../workflow/nodes/ai-nodes');
  const users = (state) => ({
    arcs: buildEvaluationUserPrompt('arcs', state),
    article: buildEvaluationUserPrompt('article', state, { factCheck: null })
  });

  it.each(['arcs', 'article'])('the %s judge prints the notes under the label and the line on backstory, once', (phase) => {
    const prompt = users(stateFor())[phase];
    expect(count(prompt, `${ARC_NOTES_LABEL}\n<DIRECTOR_NOTES>`)).toBe(1);
    expect(count(prompt, 'Backstory in the notes')).toBe(1);
    expect(prompt).not.toContain("THE DIRECTOR'S NOTES (the director's own account of the investigation");
  });

  it('the weave\'s judge prints the session roster block the article\'s judge prints, byte for byte, with the roster with pronouns after it', () => {
    const state = stateFor();
    const { arcs, article } = users(state);
    // The block opens on the time-of-day line, as SESSION_FACTS does; the fixture's sale gives one.
    const facts = buildSessionFacts(state);
    expect(typeof facts.timeOfDayLine).toBe('string');
    const block = `${facts.timeOfDayLine}\n\nSESSION ROSTER (${facts.playerCount} players who were present at this session's investigation):\n${facts.roster.join('\n')}\n\n${getPromptBuilder(null, state)._rosterSection()}`;
    expect(count(arcs, block)).toBe(1);
    expect(count(article, block)).toBe(1);
    expect(count(arcs, 'SESSION ROSTER (4 players who were present at this session\'s investigation):')).toBe(1);
    expect(count(arcs, 'Every character of the game, first name and then the full name the article prints.')).toBe(1);
    expect(count(arcs, facts.timeOfDayLine)).toBe(1);
  });

  it('a guest reporter\'s line sits once in the weave\'s judge, where the article\'s judge prints it', () => {
    const state = stateFor('remote');
    state.sessionConfig = { ...state.sessionConfig, guestReporters: [{ name: 'Taylor Chase', role: 'guest reporter' }] };
    const facts = buildSessionFacts(state);
    expect(typeof facts.guestReporterLine).toBe('string');
    const { arcs, article } = users(state);
    expect(count(arcs, facts.guestReporterLine)).toBe(1);
    expect(arcs).toContain(`${facts.roster[facts.roster.length - 1]}\n\n${facts.guestReporterLine}\n\n`);
    expect(article).toContain(`${facts.roster[facts.roster.length - 1]}\n\n${facts.guestReporterLine}\n\n`);
  });

  it('the weave\'s judge prints the money totals the article\'s judge prints, once, after the record', () => {
    const state = stateFor();
    const { arcs, article } = users(state);
    const totals = getPromptBuilder(null, state)._buildFinancialSummary(state.shellAccounts).trim();
    expect(totals.startsWith('<FINANCIAL_SUMMARY>')).toBe(true);
    for (const prompt of [arcs, article]) {
      expect(count(prompt, totals)).toBe(1);
      expect(count(prompt, '<FINANCIAL_SUMMARY>')).toBe(1);
      expect(prompt.indexOf(totals)).toBeGreaterThan(prompt.indexOf('</RECORD>'));
    }
    expect(arcs).toContain(`</RECORD>\n\n${totals}\n\nDoes the weave keep within the limits?`);
  });

  it('no question\'s words change: the weave\'s money question names no FINANCIAL_SUMMARY', () => {
    expect(getPhaseCriteria('arcs', 'journalist').moneyTruth.description).not.toContain('FINANCIAL_SUMMARY');
  });
});

// The rule-text read's part 5e: the nine rows of the judges' own instructions. The first row's
// "article writer" and "the article" are the article judge's; the weave's judge keeps its own.
describe("5e: the judges' own instructions", () => {
  const JUDGED = { arcs: ['arc writer', 'the weave'], article: ['article writer', 'the article'] };
  /** How each judge's finding quotes the text at fault, as it stood before run 2c. */
  const FINDING_QUOTE = {
    arcs: 'quotes the text at fault, names the angle, thread or connection it is in by its id (for an angle, with its line: the headline, its card line, the story, the question, why it lands or where it ends up) and, where a piece of evidence is at fault, the piece by its sources',
    article: 'quotes the sentence and names its section'
  };

  it.each(['arcs', 'article'])('the %s judge: its task, its frame, how a finding is written, the sample and the first evaluation rule', (phase) => {
    const [writer, judged] = JUDGED[phase];
    const system = systemFor(phase, stateFor());
    expect(system).toContain(`\n\nYour task is to find each place where ${judged} breaks a limit. The world and the limits above are the ones the ${writer} followed: judge ${judged} by them, against the record and the director's words in the evaluation prompt.\n\n`);
    expect(system).toContain('The entry opens with the limits\' codes and a colon, ');
    // Run 2c (the wording doc's part 7, "What a fix holds"): what the record or the director's words
    // show instead, and no new sentence; the sample entry follows, as it stood.
    expect(system).toContain(`, ${FINDING_QUOTE[phase]}, and says what the record or the director's words show instead. Say what is wrong and what is true. Do not write the new sentence. The writer words it, and a sentence you write is printed as it stands.\nT3: "<the text at fault>" states what a sold memory held; the record holds only its sale (<time>, <amount>, <account>). Report the sale instead.\n`);
    expect(system).not.toContain('names the record it contradicts, and gives the fix');
    expect(system).toContain('EVALUATION RULES:\n1. The truth criteria above are the whole evaluation: each finding is a place where a limit is broken.\n');
    ['breach of the truth rules', 'truth rule', 'opens with the rule ids', 'buried memory said', 'The rules above'].forEach((gone) => {
      expect(`${gone}: ${system.includes(gone)}`).toBe(`${gone}: false`);
    });
  });

  it('each closes on its own question', () => {
    expect(buildEvaluationUserPrompt('arcs', stateFor()).trim().endsWith('Does the weave keep within the limits?')).toBe(true);
    expect(buildEvaluationUserPrompt('article', stateFor(), { factCheck: null }).trim().endsWith('Does the article keep within the limits?')).toBe(true);
  });

  it("the weave's judge files a concern about the director's change under the code of the limit it concerns", () => {
    const state = stateFor();
    const left = clone(state.weave);
    left.threads[0].line = 'The director rewrote this line at the meeting.';
    const edited = { ...state, weave: left, _weaveHandEdits: standingAtMeeting(null, clone(state.weave), left) };
    const prompt = buildEvaluationUserPrompt('arcs', edited, { directorEdits: judgedEdits('arcs', edited) });
    expect(prompt).toContain(`Where a change of the director's breaks a limit, write the concern in advisoryWarnings, opening with the change's id and then the code of the limit it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>.`);
    expect(prompt).not.toContain('breaks a truth rule');
  });
});

// Run 2c (the wording doc's part 7): what each judge is told its material is. The weave is the
// writer's notes to the director, of which only an angle's headline is printed; the map's settled
// lines are printed as given, and a concern about one is the director's; a concern about one of the
// director's edits names the limit it concerns.
describe('run 2c: what each judge reads its material as', () => {
  const WEAVE_OPENING = "Check this weave against the record and the director's words. The weave is the writer's notes to the director. Only an angle's headline is printed. Judge what each line claims, not how it is worded: a line breaks a limit when the article it leads to would state something the record and the director's words do not support. It pitches two or three angles, each a story told through the threads it names, and the director may pick any of them, so check every angle: each line of its pitch against the evidence of its threads. Each thread and each connection carries its evidence: the pieces of the record it rests on, each with its sources, what it shows, and whether it supports the line or cuts against it. Read each line against its evidence, and each piece against the record.";
  const MAP_LINE = "The map below is the one the article writer wrote from, as the director left it. The headline, the line under it and each section's heading were settled on it before the article was written, and the writer prints them as given. A concern about one of them is for the director, reported the way a concern about one of the director's edits is. Whether the article follows the map is not yours to judge.";

  it("the weave's judge opens on what a weave is, after its first sentence", () => {
    expect(buildEvaluationUserPrompt('arcs', stateFor()).split('\n')[0]).toBe(WEAVE_OPENING);
  });

  it("the article's judge reads the map under the line on its settled lines, once", () => {
    const prompt = buildEvaluationUserPrompt('article', stateFor(), { factCheck: null });
    expect(prompt).toContain(`\n${MAP_LINE}\nMAP:\n{`);
    expect(count(prompt, MAP_LINE)).toBe(1);
    expect(prompt).not.toContain('the beats in its sections are what the article tells');
  });

  it("the article's judge files a concern about one of the director's edits under the limit it concerns", () => {
    const writers = clone(PREVIOUS_BUNDLE);
    const directors = clone(PREVIOUS_BUNDLE);
    directors.sections[0].content.push({ type: 'paragraph', text: 'The director added this paragraph at the desk.' });
    const state = stateFor('remote', { contentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle') });
    const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null, directorEdits: judgedEdits('article', state) });
    expect(prompt).toContain(`write the concern in advisoryWarnings, opening with the edit's id and then the limit it concerns, as in: ${DIRECTOR_EDIT_PREFIX}E1: T1: <the concern>.`);
    expect(prompt).not.toContain('the rule or criterion it concerns');
  });
});

// The rule-text read's part 5c, last row: the article judge's line on where Nova was, from the
// session config the mode block in its system prompt is chosen by (review focus 2).
describe("5c: the article judge's line on where Nova was", () => {
  const LINE = (where) => `WHERE NOVA WAS THIS SESSION: ${where} (the part about this session in your instructions says what Nova saw, heard and did; stagesTruth and novaPositionTruth score the article against it)`;

  it.each([['remote', 'outside the warehouse'], ['on-site', 'in the warehouse']])('a %s session: "%s", beside that mode\'s block in the system prompt', (mode, where) => {
    const state = stateFor(mode);
    const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null });
    expect(count(prompt, LINE(where))).toBe(1);
    expect(prompt).not.toContain('REPORTING MODE FOR THIS SESSION');
    expect(prompt).not.toContain('the mode block');
    const system = systemFor('article', state);
    expect(count(system, '<this-session>')).toBe(1);
    expect(system).toContain(loadModeBlock(mode));
  });

  // session-authors.js isOnSite: only "remote" is remote, so a config with no mode is on site.
  it('a session config with no mode is on site, in the line and the block alike', () => {
    const state = stateFor('remote');
    delete state.sessionConfig.reportingMode;
    expect(buildEvaluationUserPrompt('article', state, { factCheck: null })).toContain(LINE('in the warehouse'));
    expect(systemFor('article', state)).toContain(loadModeBlock('on-site'));
  });
});

// Review focus 1: a thread from before the merge. Its stored findings open with T codes, which
// the guard, the rework's criteriaRules and the desk read as before.
describe("review focus 1: a stored finding in today's form", () => {
  const DIRECTORS = 'The director wrote this whole sentence about the vote.';
  const STORED_ISSUE = 'T5: "a $75,000 sale at 07:50 PM" prints a figure the story meeting left unanswered. Cut the figure.';
  const STORED_CONCERN = `${DIRECTOR_EDIT_PREFIX}E1: T1: "${DIRECTORS}" says more than the notes.`;
  const atCap = (state) => ({ ...state, articleRevisionCount: REVISION_CAPS.ARTICLE });
  const cfg = (verdict) => ({ configurable: { sdkClient: jest.fn(async () => clone(verdict)), theme: 'journalist' } });
  const editedState = () => {
    const writers = clone(PREVIOUS_BUNDLE);
    const directors = clone(PREVIOUS_BUNDLE);
    directors.sections[0].content.push({ type: 'paragraph', text: DIRECTORS });
    return atCap(stateFor('remote', { contentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle') }));
  };
  const verdict = (structuralIssues) => ({
    ready: false, structuralPassed: false, overallScore: 0.3, confidence: 'high',
    criteriaScores: {
      evidenceTruth: { score: 0.3, notes: 'The director\'s sentence says more than the notes.' },
      moneyTruth: { score: structuralIssues.length > 0 ? 0.3 : 1 }
    },
    structuralIssues,
    advisoryWarnings: [STORED_CONCERN]
  });

  it('the codes still parse: leadingRuleIds reads them, and each matches its criterion\'s rules', () => {
    const criteria = getPhaseCriteria('article', 'journalist');
    expect(leadingRuleIds(STORED_ISSUE)).toEqual(['T5']);
    expect(criteria.moneyTruth.rules).toEqual(['T5']);
    expect(leadingRuleIds(STORED_CONCERN.slice(`${DIRECTOR_EDIT_PREFIX}E1: `.length))).toEqual(['T1']);
    expect(criteria.evidenceTruth.rules).toContain('T1');
  });

  it('the T5 finding holds the article under moneyTruth; the T1 concern covers evidenceTruth and holds nothing', async () => {
    const held = await evaluateArticle(editedState(), cfg(verdict([STORED_ISSUE])));
    expect(held.evaluationHistory.ready).toBe(false);
    expect(held.evaluationHistory.structuralIssues).toEqual([STORED_ISSUE]);
    expect(held.evaluationHistory.advisoryWarnings).toContain(STORED_CONCERN);
    // Run 2c: the first question names the fixed facts among its codes.
    expect(held.validationResults.criteriaRules).toMatchObject({ moneyTruth: ['T5'], evidenceTruth: ['T1', 'T3', 'T4', 'T6', 'T15'] });
    // The concern covers evidenceTruth, so its notes stay away from the rework.
    expect(held.validationResults.criteriaScores.evidenceTruth).toEqual({ score: 0.3, type: 'structural' });

    const clear = await evaluateArticle(editedState(), cfg(verdict([])));
    expect(clear.evaluationHistory.ready).toBe(true);
    expect(clear.evaluationHistory.advisoryWarnings).toContain(STORED_CONCERN);
  });

  // Run 2c: a concern about one of the director's edits filed under the fixed facts' code covers the
  // first question, as a T1 concern does, so the guard on the director's edits reads T15 as that
  // question's: its notes stay away from the rework, and it holds nothing.
  it('a T15 concern about the director\'s edit covers evidenceTruth and holds nothing', async () => {
    const T15_CONCERN = `${DIRECTOR_EDIT_PREFIX}E1: T15: "${DIRECTORS}" calls Blake the owner of NeurAI.`;
    const fixedFacts = { ...verdict([]), advisoryWarnings: [T15_CONCERN] };
    const update = await evaluateArticle(editedState(), cfg(fixedFacts));
    expect(update.evaluationHistory.ready).toBe(true);
    expect(update.evaluationHistory.structuralIssues).toEqual([]);
    expect(update.evaluationHistory.advisoryWarnings).toContain(T15_CONCERN);
    expect(update.validationResults.criteriaScores.evidenceTruth).toEqual({ score: 0.3, type: 'structural' });
  });

  it('at the desk each reads past its codes: a must-fix line in the trace, a concern beside its line', () => {
    const [pass] = ViewLogic.traceView([{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: [STORED_ISSUE, 'T15: "Blake owns NeurAI" goes against the fixed facts.'], advisoryWarnings: [] } }], 'journalist').passes;
    expect(pass.mustFix.items).toEqual(['"a $75,000 sale at 07:50 PM" prints a figure the story meeting left unanswered. Cut the figure.', '"Blake owns NeurAI" goes against the fixed facts.']);
    const placed = ViewLogic.concernsBesideLines([{ text: STORED_CONCERN, places: [] }], new Set(), () => null);
    expect(placed.other).toEqual([`Concern: "${DIRECTORS}" says more than the notes.`]);
  });
});
