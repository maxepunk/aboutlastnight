const { _testing } = require('../workflow/graph');
const { incrementArcRevision, incrementOutlineRevision, incrementArticleRevision, routeAfterArcCheckpoint, routeArcValidation, routeArcEvaluation } = _testing;
const { weaveKey } = require('../weave');

/** A weave the checks and the fact check read (phase 4, brief 4.4). */
const WEAVE = {
  story: 'The room named Vic.', question: 'Why Vic?', headline: 'H',
  threads: [{ id: 't1', claim: 'The room named Vic.', role: 'main-thread', receipt: 'ledger', verdict: true }],
  connections: [], convergence: 'C', questions: []
};

describe('incrementArcRevision', () => {
  // Phase 4 (brief 4.4): the fact check skips by its mark on the weave, so the increment
  // writes no history stub.
  test('writes no evaluation stub: the fact check skips by its mark on the weave', async () => {
    const result = await incrementArcRevision({ weave: WEAVE, arcRevisionCount: 0 });
    expect(result).not.toHaveProperty('evaluationHistory');
  });

  test('increments evaluator count when no human feedback', async () => {
    const state = { weave: WEAVE, arcRevisionCount: 0, _arcFeedback: null };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(1);
    expect(result.humanArcRevisionCount).toBe(0);
  });

  test('a send back opens a round and resets the automated budget at the arc stop', async () => {
    // Integrator ruling after wave 2: the arc stop's automated counter is per round like
    // the outline's and article's, so the banner's "this round" is true here too.
    // Brief 4.5: the round is the director's by its explicit mark.
    const state = { weave: WEAVE, arcRevisionCount: 2, humanArcRevisionCount: 0, _meetingRound: 'send-back', _arcFeedback: 'fix burial stuff' };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(0);
    expect(result.humanArcRevisionCount).toBe(1);
  });

  // Brief 4.5 (ruling 1): the mark, never the note's presence, makes a round the director's.
  test('a reweave with no note is a round of the director\'s: it spends no automated budget and opens a new one', async () => {
    const result = await incrementArcRevision({ weave: WEAVE, arcRevisionCount: 1, humanArcRevisionCount: 0, _meetingRound: 'reweave', _arcFeedback: null });
    expect(result).toEqual({ arcRevisionCount: 0, humanArcRevisionCount: 1 });
  });

  test('a note left in the slot without the mark is an automatic pass', async () => {
    const result = await incrementArcRevision({ weave: WEAVE, arcRevisionCount: 0, humanArcRevisionCount: 2, _arcFeedback: 'a stale note' });
    expect(result).toEqual({ arcRevisionCount: 1, humanArcRevisionCount: 2 });
  });

  test('leaves the weave where it is: the rework reads it as the version it starts from', async () => {
    const result = await incrementArcRevision({ weave: WEAVE, arcRevisionCount: 0 });
    expect(Object.keys(result).sort()).toEqual(['arcRevisionCount', 'humanArcRevisionCount']);
  });
});

describe('incrementOutlineRevision', () => {
  test('adds evaluation invalidation entry for outline phase', async () => {
    const state = { outline: { sections: [] }, outlineRevisionCount: 0 };
    const result = await incrementOutlineRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'outline',
      ready: false,
      reason: 'revision-invalidated'
    }));
  });

  test('an automated pass bumps the automated counter and leaves the round alone', async () => {
    const state = { outline: {}, outlineRevisionCount: 1, humanOutlineRevisionCount: 2 };
    const result = await incrementOutlineRevision(state);
    expect(result.outlineRevisionCount).toBe(2);
    expect(result.humanOutlineRevisionCount).toBe(2);
    expect(result.evaluationHistory.source).toBe('evaluator');
  });

  // Brief 1.4: one counter used to serve both the machine and the director, so two
  // send-backs exhausted the automated budget and the console declared the outline
  // final. A send back opens a NEW round with a fresh automated budget.
  test('a send back opens a round and resets the automated budget', async () => {
    const state = { outline: {}, outlineRevisionCount: 2, humanOutlineRevisionCount: 0, _outlineFeedback: 'Rethink the closing.' };
    const result = await incrementOutlineRevision(state);
    expect(result.humanOutlineRevisionCount).toBe(1);
    expect(result.outlineRevisionCount).toBe(0);
    expect(result.evaluationHistory.source).toBe('human');
  });
});

describe('incrementArticleRevision', () => {
  test('adds evaluation invalidation entry for article phase', async () => {
    const state = { contentBundle: {}, articleRevisionCount: 0 };
    const result = await incrementArticleRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'article',
      ready: false,
      reason: 'revision-invalidated'
    }));
  });

  test('clears assembledHtml', async () => {
    const state = { contentBundle: {}, articleRevisionCount: 0, assembledHtml: '<html>' };
    const result = await incrementArticleRevision(state);
    expect(result.assembledHtml).toBeNull();
  });

  test('an automated pass bumps the automated counter and leaves the round alone', async () => {
    const state = { contentBundle: {}, articleRevisionCount: 1, humanArticleRevisionCount: 3 };
    const result = await incrementArticleRevision(state);
    expect(result.articleRevisionCount).toBe(2);
    expect(result.humanArticleRevisionCount).toBe(3);
    expect(result.evaluationHistory.source).toBe('evaluator');
  });

  test('a send back opens a round and resets the automated budget', async () => {
    const state = { contentBundle: {}, articleRevisionCount: 2, humanArticleRevisionCount: 1, _articleFeedback: 'Name the shell company.' };
    const result = await incrementArticleRevision(state);
    expect(result.humanArticleRevisionCount).toBe(2);
    expect(result.articleRevisionCount).toBe(0);
    expect(result.evaluationHistory.source).toBe('human');
  });

  test('a rework the check triggered is stamped fact-check, not evaluator', async () => {
    const state = {
      contentBundle: {},
      articleRevisionCount: 0,
      evaluationHistory: [
        { phase: 'outline', ready: true },
        { phase: 'article', ready: false, source: 'fact-check' }
      ]
    };
    const result = await incrementArticleRevision(state);
    expect(result.evaluationHistory.source).toBe('fact-check');
  });
});

// Brief 2.7: the increments are the only nodes that see both the version a pass
// starts from and why the pass runs, so they write the trace entry. Only on an
// automatic pass: a send-back rework is the director's, not the machine's.
describe('the trace entry (phase 2, brief 2.7)', () => {
  const OUTLINE_VERDICT = {
    phase: 'outline',
    passed: false,
    structuralIssues: ['The LEDE names no roster member.'],
    advisoryWarnings: ['The closing repeats the hook.'],
    issues: ['The LEDE names no roster member.'],
    criteriaScores: { rosterCoverage: { score: 0.4, type: 'structural', notes: 'Zia is missing.', fix: 'Name Zia in the LEDE.' } },
    confidence: 'high',
    revisionGuidance: 'Put Zia in the LEDE.',
    feedback: 'Put Zia in the LEDE.'
  };

  test('an outline pass the evaluation triggered records its number, round, findings and the version before it', async () => {
    const outline = { lede: { hook: 'Before the pass' } };
    const state = { outline, outlineRevisionCount: 0, humanOutlineRevisionCount: 0, validationResults: OUTLINE_VERDICT, evaluationHistory: [{ phase: 'outline', ready: false }] };
    const result = await incrementOutlineRevision(state);
    expect(result._outlineTrace).toHaveLength(1);
    const [entry] = result._outlineTrace;
    expect(entry).toEqual({
      pass: 1,
      round: 1,
      trigger: 'evaluation',
      findings: {
        structuralIssues: ['The LEDE names no roster member.'],
        advisoryWarnings: ['The closing repeats the hook.'],
        criteriaScores: OUTLINE_VERDICT.criteriaScores,
        revisionGuidance: 'Put Zia in the LEDE.'
      },
      before: outline,
      at: expect.any(String)
    });
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
  });

  test('the findings are copies, so the next evaluation overwriting validationResults cannot change them', async () => {
    const verdict = JSON.parse(JSON.stringify(OUTLINE_VERDICT));
    const result = await incrementOutlineRevision({ outline: {}, outlineRevisionCount: 0, validationResults: verdict });
    verdict.structuralIssues.push('added later');
    verdict.criteriaScores.extra = { score: 1 };
    const { findings } = result._outlineTrace[0];
    expect(findings.structuralIssues).toEqual(['The LEDE names no roster member.']);
    expect(findings.criteriaScores).not.toHaveProperty('extra');
  });

  test('an article pass the check triggered is stamped `check`, with the check\'s findings and no scores', async () => {
    const bundle = { headline: { main: 'Before' } };
    const state = {
      contentBundle: bundle,
      articleRevisionCount: 0,
      humanArticleRevisionCount: 2,
      evaluationHistory: [{ phase: 'article', ready: false, source: 'fact-check' }],
      validationResults: {
        phase: 'article',
        passed: false,
        structuralIssues: ['Roster coverage gap: Zia is never named.'],
        advisoryWarnings: [],
        feedback: 'Roster coverage gap: Zia is never named.'
      }
    };
    const result = await incrementArticleRevision(state);
    expect(result._articleTrace).toEqual([{
      pass: 1,
      round: 3,
      trigger: 'check',
      findings: {
        structuralIssues: ['Roster coverage gap: Zia is never named.'],
        advisoryWarnings: [],
        criteriaScores: null,
        revisionGuidance: null
      },
      before: bundle,
      at: expect.any(String)
    }]);
  });

  test('a second pass in the same round is appended after the first', async () => {
    const first = { pass: 1, round: 1, trigger: 'check', findings: {}, before: { headline: { main: 'v1' } }, at: '2026-09-26T10:00:00.000Z' };
    const state = { contentBundle: { headline: { main: 'v2' } }, articleRevisionCount: 1, _articleTrace: [first] };
    const result = await incrementArticleRevision(state);
    expect(result._articleTrace).toHaveLength(2);
    expect(result._articleTrace[0]).toBe(first);
    expect(result._articleTrace[1]).toEqual(expect.objectContaining({ pass: 2, round: 1, before: { headline: { main: 'v2' } } }));
  });

  test('a send-back rework writes no entry, at either stop', async () => {
    const outline = await incrementOutlineRevision({ outline: {}, outlineRevisionCount: 2, _outlineFeedback: 'Rethink the closing.', _outlineTrace: null });
    const article = await incrementArticleRevision({ contentBundle: {}, articleRevisionCount: 1, _articleFeedback: 'Name the shell company.' });
    expect(outline).not.toHaveProperty('_outlineTrace');
    expect(article).not.toHaveProperty('_articleTrace');
  });

  test('a verdict stamped for another phase is not this pass\'s reason', async () => {
    const result = await incrementOutlineRevision({
      outline: {},
      outlineRevisionCount: 0,
      validationResults: { phase: 'arcs', structuralIssues: ['Missing roster arc.'], revisionGuidance: 'Add an arc.' }
    });
    expect(result._outlineTrace[0].findings).toEqual({
      structuralIssues: [], advisoryWarnings: [], criteriaScores: null, revisionGuidance: null
    });
  });

  test('entries from an earlier round are dropped as the new pass is added', async () => {
    const stale = { pass: 1, round: 1, trigger: 'evaluation', findings: {}, before: {}, at: 't' };
    const result = await incrementOutlineRevision({ outline: {}, outlineRevisionCount: 0, humanOutlineRevisionCount: 1, _outlineTrace: [stale] });
    expect(result._outlineTrace).toEqual([expect.objectContaining({ pass: 1, round: 2 })]);
  });

  test('nothing about the counters or the history stub changes', async () => {
    const result = await incrementOutlineRevision({ outline: {}, outlineRevisionCount: 1, humanOutlineRevisionCount: 2, validationResults: OUTLINE_VERDICT });
    expect(result.outlineRevisionCount).toBe(2);
    expect(result.humanOutlineRevisionCount).toBe(2);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({ phase: 'outline', reason: 'revision-invalidated', source: 'evaluator' }));
  });
});

// Brief 4.5: the story meeting's route has three outcomes. Approve goes to the photos; a
// reweave and a send-back go to the rework.
describe('routeAfterArcCheckpoint', () => {
  test('an approved meeting goes forward, to the photos', () => {
    expect(routeAfterArcCheckpoint({ meetingApproved: true })).toBe('forward');
  });

  test.each(['reweave', 'send-back'])('a %s goes to the rework', (round) => {
    expect(routeAfterArcCheckpoint({ meetingApproved: false, _meetingRound: round })).toBe('revise');
  });

  // Brief 1.4: the arc stop never forces forward. A fourth send back used to push an
  // EMPTY selection through the whole paid pipeline — an outline about nothing — on
  // the theory that the director had run out of rounds. The director's rounds are
  // not limited, so there is nothing left to run out of.
  test('never forces forward, however many rounds the director has taken', () => {
    expect(routeAfterArcCheckpoint({ _meetingRound: 'send-back', humanArcRevisionCount: 4 })).toBe('revise');
    expect(routeAfterArcCheckpoint({ _meetingRound: 'reweave', humanArcRevisionCount: 9 })).toBe('revise');
  });

  test('the old arc selection approves nothing, and a stop left with neither an approval nor a round fails loud', () => {
    expect(() => routeAfterArcCheckpoint({ selectedArcs: ['a1', 'a2'] })).toThrow(/approve, reweave or send-back/);
    expect(() => routeAfterArcCheckpoint({ _arcFeedback: 'a note' })).toThrow(/approve, reweave or send-back/);
  });
});

// Phase 4 (brief 4.4; R6): the routing reads the weave checks' result, stamped for the
// weave they checked, and the fact check's mark on the weave.
describe('routeArcValidation', () => {
  const failed = { weaveKey: weaveKey(WEAVE), passed: false, failures: [{ type: 'receipt-not-in-record', message: 'x' }] };

  test('evaluates when the checks pass', () => {
    expect(routeArcValidation({ weave: WEAVE, _arcValidation: { weaveKey: weaveKey(WEAVE), passed: true, failures: [] } })).toBe('evaluate');
  });

  test('revises when a check failed on a weave the fact check has not judged', () => {
    expect(routeArcValidation({ weave: WEAVE, _arcValidation: failed, arcRevisionCount: 0 })).toBe('revise');
  });

  test('evaluates (not revise) when there is no weave to rework', () => {
    expect(routeArcValidation({ weave: null, _arcValidation: failed, arcRevisionCount: 0 })).toBe('evaluate');
  });

  test('evaluates when the round\'s check rework is spent', () => {
    expect(routeArcValidation({ weave: WEAVE, _arcValidation: failed, arcRevisionCount: 1 })).toBe('evaluate');
  });

  test('evaluates when no validation data', () => {
    expect(routeArcValidation({ weave: WEAVE, _arcValidation: null })).toBe('evaluate');
  });

  test('evaluates on a weave the fact check judged: its fix is the round\'s last pass', () => {
    const judged = { ...WEAVE, _factCheck: { at: 't', ready: false, fixes: 1 } };
    expect(routeArcValidation({ weave: judged, _arcValidation: { ...failed, weaveKey: weaveKey(judged) }, arcRevisionCount: 0 })).toBe('evaluate');
  });

  test('ends the run when a rework failed', () => {
    expect(routeArcValidation({ weave: WEAVE, _arcValidation: failed, currentPhase: 'error' })).toBe('error');
  });
});

describe('routeArcEvaluation', () => {
  test('routes to the stop when there is no weave', () => {
    expect(routeArcEvaluation({ weave: null, evaluationHistory: [{ phase: 'arcs', ready: false }] })).toBe('checkpoint');
  });

  test('routes to the fix when the fact check found a breach and no fix has run', () => {
    expect(routeArcEvaluation({ weave: { ...WEAVE, _factCheck: { at: 't', ready: false, fixes: 0 } } })).toBe('revise');
  });

  test('routes to the stop after the fix, with no second judge call', () => {
    expect(routeArcEvaluation({ weave: { ...WEAVE, _factCheck: { at: 't', ready: false, fixes: 1 } } })).toBe('checkpoint');
  });

  test('still routes to checkpoint when the fact check found no breach', () => {
    expect(routeArcEvaluation({ weave: { ...WEAVE, _factCheck: { at: 't', ready: true, fixes: 0 } } })).toBe('checkpoint');
  });
});
