/**
 * Phase 18, run 2h, brief X: the judges' lines (the run 2c wording doc's part 10, "The judges").
 *
 * The second prompt read found lines a judge read loosely: a breach defined only against the record
 * and the director's words, though four limits are broken against the limit itself; a line on Nova's
 * opinion that would pass a suspicion stated flat; no word on the limits no question scores; the weave
 * judge told not to judge wording by a question that judges wording; and an OUTPUT FORMAT that asked
 * for the fix three times, the third as numbered steps no rework reads. The director approved a
 * wording for each on 2026-11-24. Each approved line is held here word for word, in the prompt that
 * prints it, and a verdict with no numbered steps is followed through every reader.
 */
const evaluatorNodes = require('../workflow/nodes/evaluator-nodes');
const { evaluateArticle, LIMIT_CODES, _testing: evalTesting } = evaluatorNodes;
const {
  getPhaseCriteria, buildEvaluationSystemPrompt, buildEvaluationUserPrompt,
  guardDirectorEdits, truthOnlyVerdict, TRUTH_ONLY_EVALUATION_JSON_SCHEMA
} = evalTesting;
const { buildRevisionContext } = require('../workflow/nodes/node-helpers');
const { _testing: graphTesting } = require('../workflow/graph');
const { getPromptBuilder } = require('../workflow/nodes/ai-nodes');
const { REVISION_CAPS } = require('../workflow/state');
const { standingAfterSendBack } = require('../hand-edit-diff');
const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const ViewLogic = require('../../console/checkpoint-view-logic');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (text, part) => text.split(part).length - 1;

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

const stateFor = (extra = {}) => {
  const state = { ...reworkFixtureState('journalist'), contentBundle: clone(PREVIOUS_BUNDLE), articleApproved: false, evaluationHistory: [], ...extra };
  state.sessionConfig = { ...state.sessionConfig, reportingMode: 'remote' };
  return state;
};
const systemFor = (phase, state = stateFor()) => buildEvaluationSystemPrompt(phase, getPhaseCriteria(phase, 'journalist'), 'journalist', { sessionConfig: state.sessionConfig });
const userFor = (phase, state = stateFor()) => (phase === 'arcs'
  ? buildEvaluationUserPrompt('arcs', state)
  : buildEvaluationUserPrompt('article', state, { factCheck: null }));
const PHASES = ['arcs', 'article'];

// ─── The approved lines, word for word (part 10, "The judges") ──────────────────────────────────

const BREACH_LINE = "A breach is something you can show: the sentence, and what it goes against, in the record, in the director's words or in the limit itself. A line you only doubt is not a breach. A line that shows by how it is said that it is what Nova suspects, asks or believes needs no label to pass.";
const WORDS_LINE = "The director's words are the director's notes, the corrections at the input review, the accusation as the director wrote it, the answers at the story meeting and the notes at the stops. A line the director wrote or changed, marked as theirs, counts with them.";
const FIX_HOLDS = "and says what is wrong: what the record or the director's words show instead, or what the limit rules out. Do not write the new sentence. The writer words it, and a sentence you write is printed as it stands.";
const UNASKED = {
  article: 'No question below asks about the head count. Code checks it.',
  arcs: 'No question below asks about the head count, photos or words from running the game. Code checks the first, and the other two are checked on the article.'
};
const WEAVE_OPENING = "Check this weave against the record and the director's words. The weave is the writer's notes to the director. Only an angle's headline is printed. A line here is a note, so do not hold it to the manner of printed prose. A line breaks a limit when the article it leads to would state as fact something the record and the director's words do not support. The weave pitches two or three angles, each a story told through the threads it names, and the director may pick any of them, so check every angle. The evidence under a line is the first place to look. The record and the director's words decide. Each thread and each connection carries its evidence: the pieces of the record it rests on, each with its sources, what it shows, and whether it supports the line or cuts against it. Read each line against its evidence, and each piece against the record.";
const NOTES = {
  arcs: 'the breach: the text at fault, the angle, thread or connection it is in, the piece of evidence where one is at fault, and what is wrong with it',
  article: 'the breach: the sentence at fault, its section, and what is wrong with it'
};
const FIX_FIELD = 'what has to change, in a few words, with no new sentence';
const ISSUES_FIELD = 'each breach, written as described above';

describe('what a breach is, and what the director\'s words are', () => {
  it.each(PHASES)('the %s judge reads both lines once, after the pass mark and before the first question', (phase) => {
    const system = systemFor(phase);
    expect(system).toContain(`One breach fails it: score it below 0.8.\n${BREACH_LINE}\n${WORDS_LINE}\n- evidenceTruth (`);
    expect(count(system, BREACH_LINE)).toBe(1);
    expect(count(system, WORDS_LINE)).toBe(1);
    expect(system).not.toContain('A plain statement of what Nova thinks');
    expect(system).not.toContain("what in the record or the director's words it goes against");
  });

  it('the added sentence comes after the five sources, which keep the order lib/director-words.js lists them in', () => {
    const { DIRECTOR_WORDS_SOURCES } = require('../director-words');
    const PHRASE = {
      notes: "the director's notes", corrections: 'the corrections at the input review', accusation: 'the accusation as the director wrote it',
      answers: 'the answers at the story meeting', stopNotes: 'the notes at the stops'
    };
    const at = DIRECTOR_WORDS_SOURCES.map((source) => WORDS_LINE.indexOf(PHRASE[source.key]));
    expect(at.every((i) => i > -1)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(WORDS_LINE.indexOf('A line the director wrote or changed')).toBeGreaterThan(Math.max(...at));
  });
});

// Part 10, "Limits no question asks about": each judge is told which limits of the fifteen it lists
// no question of its own scores. Derived here from LIMIT_CODES and the judge's criteria, so a question
// that gains or loses a code fails this test before the sentence goes stale.
describe('the limits no question asks about', () => {
  /** What each sentence calls a limit no question scores, by code. */
  const NAMED_AS = { T10: 'the head count', T13: 'photos', T14: 'words from running the game' };
  const unasked = (phase) => {
    const scored = new Set(Object.values(getPhaseCriteria(phase, 'journalist')).flatMap((criterion) => criterion.rules));
    return LIMIT_CODES.map(({ code }) => code).filter((code) => !scored.has(code));
  };

  it('the code gives the head count alone for the article\'s judge, and the head count, photos and words from running the game for the weave\'s', () => {
    expect(unasked('article')).toEqual(['T10']);
    expect(unasked('arcs')).toEqual(['T10', 'T13', 'T14']);
  });

  it.each(PHASES)('the %s judge\'s sentence names exactly the limits none of its questions scores', (phase) => {
    const sentence = UNASKED[phase];
    unasked(phase).forEach((code) => expect([code, sentence.includes(NAMED_AS[code])]).toEqual([code, true]));
    Object.entries(NAMED_AS).filter(([code]) => !unasked(phase).includes(code))
      .forEach(([code, words]) => expect([code, sentence.includes(words)]).toEqual([code, false]));
  });

  it.each(PHASES)('the %s judge prints its sentence once, on the line right after the list of the fifteen limits', (phase) => {
    const lines = systemFor(phase).split('\n');
    const list = lines.findIndex((line) => line.startsWith('T1 What can be stated as fact.'));
    expect(list).toBeGreaterThan(-1);
    expect(lines[list + 1]).toBe(UNASKED[phase]);
    expect(lines[list + 2].startsWith('Each criterion below scores the limits it names')).toBe(true);
    expect(count(systemFor(phase), UNASKED[phase])).toBe(1);
    const other = UNASKED[phase === 'arcs' ? 'article' : 'arcs'];
    expect(systemFor(phase)).not.toContain(other);
  });
});

describe('what a finding says', () => {
  const FINDING_QUOTE = {
    arcs: 'quotes the text at fault, names the angle, thread or connection it is in by its id (for an angle, with its line: the headline, its card line, the story, the question, why it lands or where it ends up) and, where a piece of evidence is at fault, the piece by its sources',
    article: 'quotes the sentence and names its section'
  };

  it.each(PHASES)('the %s judge: what is wrong, or what the limit rules out, then the sample entry as it stood', (phase) => {
    const system = systemFor(phase);
    expect(system).toContain(`The entry opens with the limits' codes and a colon, ${FINDING_QUOTE[phase]}, ${FIX_HOLDS}\nT3: "<the text at fault>" states what a sold memory held; the record holds only its sale (<time>, <amount>, <account>). Report the sale instead.\n`);
    expect(system).not.toContain('Say what is wrong and what is true.');
  });
});

describe("the weave judge's opening", () => {
  it('its first paragraph: the first three sentences and the last two as they stood, the fourth and fifth as approved', () => {
    const prompt = userFor('arcs');
    expect(prompt.split('\n')[0]).toBe(WEAVE_OPENING);
    expect(prompt).not.toContain('Judge what each line claims, not how it is worded');
    expect(prompt).not.toContain('each line of its pitch against the evidence of its threads');
  });
});

describe('what a judge is asked to write', () => {
  const formatOf = (system) => system.slice(system.indexOf('OUTPUT FORMAT (JSON):'));

  it.each(PHASES)('the %s judge\'s OUTPUT FORMAT: its notes, the fix, the list of breaches, and no numbered steps', (phase) => {
    const format = formatOf(systemFor(phase));
    expect(format).toContain(`      "notes": "${NOTES[phase]}",\n`);
    expect(format).toContain(`      "fix": "only for a score below 0.8: ${FIX_FIELD}"\n`);
    expect(format).toContain(`  "structuralIssues": [ "${ISSUES_FIELD}" ],\n`);
    expect(format).not.toContain('revisionGuidance');
    expect(format).not.toMatch(/Step 1|the record it contradicts|one concrete action|MUST be fixed/);
    // The rest of the contract stands: advisoryWarnings, then confidence.
    expect(format).toContain(`  "advisoryWarnings": [ "only a concern about one of the director's edits; empty when there is none" ],\n  "confidence": "high" | "medium" | "low"\n}`);
  });

  it('the schema the judges are sent carries the same words, and no numbered steps', () => {
    const { properties } = TRUTH_ONLY_EVALUATION_JSON_SCHEMA;
    expect(properties.criteriaScores.additionalProperties.properties.fix.description).toBe(`Only for a score below 0.8: ${FIX_FIELD}`);
    expect(properties.structuralIssues.description).toBe('Each breach, written as described above');
    expect(Object.keys(properties)).not.toContain('revisionGuidance');
    expect(TRUTH_ONLY_EVALUATION_JSON_SCHEMA.required).toEqual(['ready', 'overallScore', 'structuralPassed']);
  });

  it.each(PHASES)('the %s judge: "must pass" comes off each question\'s line, and the heading keeps it', (phase) => {
    const system = systemFor(phase);
    Object.entries(getPhaseCriteria(phase, 'journalist')).forEach(([key, { rules, description }]) => {
      expect(system).toContain(`\n- ${key} (${rules.join(', ')}): ${description}\n`);
    });
    expect(system).not.toContain('; must pass)');
    expect(system).toContain('THE LIMITS (MUST PASS: a breach is a definite error, so the output goes back for a rework)');
  });
});

// Part 10, "The summary of the characters": the judges have the documents; the list of names with
// pronouns stays. The article writer's roster already prints without it (R22), through one option.
describe('the roster block both judges print', () => {
  it('prints the list of names with pronouns and no summary of the characters, byte-equal for the two judges', () => {
    const state = stateFor();
    const withSummary = getPromptBuilder(null, state)._rosterSection();
    expect(withSummary).toContain('CHARACTER CONTEXT');
    const roster = getPromptBuilder(null, state)._rosterSection({ withCharacterContext: false });
    expect(roster).not.toContain('CHARACTER CONTEXT');
    PHASES.forEach((phase) => {
      const prompt = userFor(phase, state);
      expect([phase, count(prompt, roster)]).toEqual([phase, 1]);
      expect([phase, prompt.includes('CHARACTER CONTEXT')]).toEqual([phase, false]);
    });
  });
});

// R49: the judge is no longer asked for numbered steps. Code that reads one from a stored verdict
// stays; a verdict that holds none flows through each reader with no error and no empty label.
describe('R49: a verdict with no numbered steps', () => {
  const ISSUE = 'T5: "a $75,000 sale at 07:50 PM" prints a figure the story meeting left unanswered: the director\'s answer gives none.';
  const verdict = () => ({
    ready: false, structuralPassed: false, overallScore: 0.3, confidence: 'high',
    criteriaScores: { moneyTruth: { score: 0.3, notes: 'the breach: the figure in the opening, and what is wrong with it', fix: 'take the figure out' } },
    structuralIssues: [ISSUE],
    advisoryWarnings: []
  });
  const criteria = getPhaseCriteria('article', 'journalist');

  it('the guard and truthOnlyVerdict give an empty guidance, on the path with no edits and the path with edits', () => {
    const plain = guardDirectorEdits({ evaluation: verdict(), criteria, edits: [], output: null });
    expect(plain.revisionGuidance).toBe('');
    expect(truthOnlyVerdict(plain, criteria).revisionGuidance).toBe('');
    const writers = clone(PREVIOUS_BUNDLE);
    const directors = clone(PREVIOUS_BUNDLE);
    directors.sections[0].content.push({ type: 'paragraph', text: 'The director added this paragraph at the desk.' });
    const edits = evalTesting.judgedEdits('article', stateFor({ contentBundle: directors, _articleHandEdits: standingAfterSendBack(null, writers, directors, 'bundle') }));
    expect(edits.length).toBeGreaterThan(0);
    const edited = guardDirectorEdits({ evaluation: verdict(), criteria, edits, output: directors });
    expect(edited.revisionGuidance).toBe('');
    expect(edited.kept).toEqual([ISSUE]);
  });

  it('the evaluator writes the verdict with one empty text under both names, and the rework, the trace and the desk read it', async () => {
    const state = stateFor({ articleRevisionCount: REVISION_CAPS.ARTICLE });
    const sdk = jest.fn(async () => verdict());
    const update = await evaluateArticle(state, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    expect(update.validationResults.revisionGuidance).toBe('');
    expect(update.validationResults.feedback).toBe('');
    expect(update.validationResults.structuralIssues).toContain(ISSUE);

    // The rework's findings: the must-fix line under its heading, no guidance line, no stray label.
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 1, validationResults: update.validationResults, previousOutput: state.contentBundle
    });
    expect(contextSection).toContain('ISSUES TO ADDRESS:\n  - The money: "a $75,000 sale at 07:50 PM"');
    expect(contextSection).not.toMatch(/undefined|null|guidance/i);

    // The automatic pass's trace entry and the trace panel.
    const after = { ...state, ...update, evaluationHistory: [...state.evaluationHistory, update.evaluationHistory] };
    const inc = await graphTesting.incrementArticleRevision(after);
    const entry = inc._articleTrace[inc._articleTrace.length - 1];
    expect(entry.findings.revisionGuidance).toBeNull();
    const [pass] = ViewLogic.traceView(inc._articleTrace, 'journalist').passes;
    expect(pass.guidance).toBe('');
    expect(pass.mustFix.items.length).toBeGreaterThan(0);
    expect(pass.noFindings).toBe(false);
  });

  it('a stored verdict that holds steps still shows them in the trace', () => {
    const [pass] = ViewLogic.traceView([{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: [ISSUE], advisoryWarnings: [], revisionGuidance: 'Step 1: take the figure out.' } }], 'journalist').passes;
    expect(pass.guidance).toBe("The evaluation's guidance, not sent to the rework: Step 1: take the figure out.");
  });

  it('a trace entry with no guidance and no finding reads as a pass with nothing found', () => {
    const [pass] = ViewLogic.traceView([{ pass: 1, round: 1, trigger: 'evaluation', findings: { structuralIssues: [], advisoryWarnings: [], revisionGuidance: null } }], 'journalist').passes;
    expect(pass.guidance).toBe('');
    expect(pass.noFindings).toBe(true);
  });
});

// The brief: a question's fix still reaches a rework for a failed question the judge wrote no breach
// for. The verdict guard writes the must-fix line from the question's notes and fix (truthIssueLines),
// and the rework reads it with the limits' names in place of their codes.
describe("a failed question's fix, in a rework", () => {
  it('reads as the breach, then what has to change, under the limits\' names', async () => {
    const notes = 'the breach: "she never sold a thing" in the opening calls Alex she, and what is wrong with it: the roster gives they';
    const fix = 'use the pronoun the roster gives';
    const evaluation = {
      ready: false, structuralPassed: false, overallScore: 0.3, confidence: 'high',
      criteriaScores: { playersTruth: { score: 0.3, notes, fix } }, structuralIssues: [], advisoryWarnings: []
    };
    const state = stateFor({ articleRevisionCount: REVISION_CAPS.ARTICLE });
    const update = await evaluateArticle(state, { configurable: { sdkClient: jest.fn(async () => clone(evaluation)), theme: 'journalist' } });
    expect(update.validationResults.structuralIssues).toContain(`T9, T11: ${notes} ${fix}`);
    const { contextSection } = buildRevisionContext({
      phase: 'article', revisionCount: 1, validationResults: update.validationResults, previousOutput: state.contentBundle
    });
    expect(contextSection).toContain(`ISSUES TO ADDRESS:\n  - Pronouns, Characters, never the players: ${notes} ${fix}`);
  });
});
