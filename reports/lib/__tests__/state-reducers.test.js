const { _testing, getDefaultState, REVISION_CAPS, ROLLBACK_COUNTER_RESETS } = require('../workflow/state');
const { appendSingleReducer, appendReducer } = _testing;

describe('appendSingleReducer', () => {
  test('appends single item to array', () => {
    expect(appendSingleReducer(['a'], 'b')).toEqual(['a', 'b']);
  });

  test('ignores null (normal append behavior)', () => {
    expect(appendSingleReducer(['a'], null)).toEqual(['a']);
  });

  test('ignores undefined', () => {
    expect(appendSingleReducer(['a'], undefined)).toEqual(['a']);
  });

  test('clears array when passed empty array []', () => {
    // Empty array = explicit clear for rollback
    expect(appendSingleReducer(['a', 'b', 'c'], [])).toEqual([]);
  });

  test('handles clearing from empty state', () => {
    expect(appendSingleReducer([], [])).toEqual([]);
  });

  test('handles clearing from null state', () => {
    expect(appendSingleReducer(null, [])).toEqual([]);
  });
});

describe('appendReducer', () => {
  test('appends arrays together', () => {
    expect(appendReducer(['a'], ['b'])).toEqual(['a', 'b']);
  });

  test('clears array when passed empty array []', () => {
    expect(appendReducer(['a', 'b'], [])).toEqual([]);
  });

  test('handles clearing from null state', () => {
    expect(appendReducer(null, [])).toEqual([]);
  });
});

describe('humanArcRevisionCount', () => {
  test('exists in default state with value 0', () => {
    const defaults = getDefaultState();
    expect(defaults.humanArcRevisionCount).toBe(0);
  });

  // Brief 1.4: REVISION_CAPS caps the machine's own reworks only. The director's
  // rounds at the arc stop are not counted against anything.
  test('REVISION_CAPS no longer caps the director at the arc stop', () => {
    expect(REVISION_CAPS.HUMAN_ARCS).toBeUndefined();
  });

  test('ROLLBACK_COUNTER_RESETS includes humanArcRevisionCount', () => {
    expect(ROLLBACK_COUNTER_RESETS['evidence-and-photos'].humanArcRevisionCount).toBe(0);
    expect(ROLLBACK_COUNTER_RESETS['arc-selection'].humanArcRevisionCount).toBe(0);
  });

  test('ROLLBACK_COUNTER_RESETS does NOT include humanArcRevisionCount for outline/article', () => {
    expect(ROLLBACK_COUNTER_RESETS['outline'].humanArcRevisionCount).toBeUndefined();
    expect(ROLLBACK_COUNTER_RESETS['article'].humanArcRevisionCount).toBeUndefined();
  });
});
