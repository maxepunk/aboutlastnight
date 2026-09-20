const { _testing } = require('../workflow/graph');
const { incrementArcRevision, incrementOutlineRevision, incrementArticleRevision, routeAfterArcCheckpoint, routeArcValidation, routeArcEvaluation } = _testing;

describe('incrementArcRevision', () => {
  test('adds evaluation invalidation entry with source', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result.evaluationHistory).toEqual(expect.objectContaining({
      phase: 'arcs',
      ready: false,
      reason: 'revision-invalidated',
      source: 'evaluator'
    }));
  });

  test('increments evaluator count when no human feedback', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0, _arcFeedback: null };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(1);
    expect(result.humanArcRevisionCount).toBe(0);
  });

  test('a send back opens a round and resets the automated budget at the arc stop', async () => {
    // Integrator ruling after wave 2: the arc stop's automated counter is per round like
    // the outline's and article's, so the banner's "this round" is true here too.
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 2, humanArcRevisionCount: 0, _arcFeedback: 'fix burial stuff' };
    const result = await incrementArcRevision(state);
    expect(result.arcRevisionCount).toBe(0);
    expect(result.humanArcRevisionCount).toBe(1);
  });

  test('falls back to _previousArcs when narrativeArcs is empty', async () => {
    const prevArcs = [{ id: 'a1' }];
    const state = { narrativeArcs: [], _previousArcs: prevArcs, arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result._previousArcs).toEqual(prevArcs);
  });

  test('sets _previousArcs to undefined when both sources empty (double timeout)', async () => {
    const state = { narrativeArcs: [], _previousArcs: undefined, arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result._previousArcs).toBeUndefined();
  });

  test('preserves narrativeArcs when present', async () => {
    const arcs = [{ id: 'a1' }, { id: 'a2' }];
    const state = { narrativeArcs: arcs, arcRevisionCount: 0 };
    const result = await incrementArcRevision(state);
    expect(result._previousArcs).toEqual(arcs);
    expect(result.narrativeArcs).toBeNull();
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

describe('routeAfterArcCheckpoint', () => {
  test('returns forward when selectedArcs populated', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: ['a1', 'a2'] })).toBe('forward');
  });

  test('returns revise when no selectedArcs', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 0 })).toBe('revise');
  });

  // Brief 1.4: the arc stop never forces forward. A fourth send back used to push an
  // EMPTY selection through the whole paid pipeline — an outline about nothing — on
  // the theory that the director had run out of rounds. The director's rounds are
  // not limited, so there is nothing left to run out of.
  test('never forces forward, however many rounds the director has taken', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 4 })).toBe('revise');
    expect(routeAfterArcCheckpoint({ selectedArcs: [], humanArcRevisionCount: 9 })).toBe('revise');
  });
});

describe('routeArcValidation', () => {
  test('evaluates when structural checks pass', () => {
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: true }
    })).toBe('evaluate');
  });

  test('revises when structural issues and arcs exist to revise', () => {
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: false, missingRoster: ['Sarah'] },
      narrativeArcs: [{ id: 'a1' }],
      _previousArcs: null,
      arcRevisionCount: 0
    })).toBe('revise');
  });

  test('evaluates (not revise) when 0 arcs AND no previous arcs — futile revision prevention', () => {
    // This is the key fix: initial generation failure should not burn revision slots
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: false, missingRoster: ['Sarah', 'Alex'] },
      narrativeArcs: [],
      _previousArcs: null,
      arcRevisionCount: 0
    })).toBe('evaluate');
  });

  test('evaluates when 0 arcs, empty previous arcs', () => {
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: false },
      narrativeArcs: [],
      _previousArcs: [],
      arcRevisionCount: 0
    })).toBe('evaluate');
  });

  test('revises when 0 current arcs but previous arcs exist (timeout recovery)', () => {
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: false, missingRoster: ['Sarah'] },
      narrativeArcs: [],
      _previousArcs: [{ id: 'a1' }],
      arcRevisionCount: 0
    })).toBe('revise');
  });

  test('evaluates when at revision cap regardless', () => {
    expect(routeArcValidation({
      _arcValidation: { structuralPassed: false },
      narrativeArcs: [{ id: 'a1' }],
      arcRevisionCount: 2
    })).toBe('evaluate');
  });

  test('evaluates when no validation data', () => {
    expect(routeArcValidation({ _arcValidation: null })).toBe('evaluate');
  });
});

describe('routeArcEvaluation - futile revision guard', () => {
  test('routes to checkpoint (not revise) when 0 arcs and no previous arcs', () => {
    expect(routeArcEvaluation({
      narrativeArcs: [],
      _previousArcs: null,
      evaluationHistory: [{ phase: 'arcs', ready: false }],
      arcRevisionCount: 0
    })).toBe('checkpoint');
  });

  test('routes to revise when 0 current arcs but previous arcs exist', () => {
    expect(routeArcEvaluation({
      narrativeArcs: [],
      _previousArcs: [{ id: 'a1' }],
      evaluationHistory: [{ phase: 'arcs', ready: false }],
      arcRevisionCount: 0
    })).toBe('revise');
  });

  test('routes to checkpoint when 0 arcs and _previousArcs is empty array', () => {
    expect(routeArcEvaluation({
      narrativeArcs: [],
      _previousArcs: [],
      evaluationHistory: [{ phase: 'arcs', ready: false }],
      arcRevisionCount: 0
    })).toBe('checkpoint');
  });

  test('still routes to checkpoint when evaluation ready', () => {
    expect(routeArcEvaluation({
      narrativeArcs: [{ id: 'a1' }],
      evaluationHistory: [{ phase: 'arcs', ready: true }],
      arcRevisionCount: 0
    })).toBe('checkpoint');
  });
});
