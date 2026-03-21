const { _testing } = require('../workflow/graph');
const { incrementArcRevision, incrementOutlineRevision, incrementArticleRevision, routeAfterArcCheckpoint, routeArcValidation } = _testing;

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

  test('increments human count when human feedback present', async () => {
    const state = { narrativeArcs: [{ id: 'a1' }], arcRevisionCount: 0, humanArcRevisionCount: 0, _arcFeedback: 'fix burial stuff' };
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

  test('increments revision count', async () => {
    const state = { outline: {}, outlineRevisionCount: 1 };
    const result = await incrementOutlineRevision(state);
    expect(result.outlineRevisionCount).toBe(2);
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
});

describe('routeAfterArcCheckpoint', () => {
  test('returns forward when selectedArcs populated', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: ['a1', 'a2'] })).toBe('forward');
  });

  test('returns revise when no selectedArcs and under human cap', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 0 })).toBe('revise');
  });

  test('returns forward when at human revision cap', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 4 })).toBe('forward');
  });

  test('returns revise when human count below cap', () => {
    expect(routeAfterArcCheckpoint({ selectedArcs: null, humanArcRevisionCount: 3 })).toBe('revise');
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
