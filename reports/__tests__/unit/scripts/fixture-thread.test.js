/**
 * The fixture cutter's pure parts (phase 3 gate, step 4): scripts/lib/fixture-thread.js.
 */
const path = require('path');
const { isProductionDb, applyPlants, splitPlants, stopOfWrites } = require('../../../scripts/lib/fixture-thread');

describe('isProductionDb', () => {
  it('names a checkpoints.sqlite under data/ as production, in any case and separator', () => {
    expect(isProductionDb(path.join('reports', 'data', 'checkpoints.sqlite'))).toBe(true);
    expect(isProductionDb('C:\\x\\reports\\Data\\Checkpoints.sqlite')).toBe(true);
  });

  it('leaves copies and other names alone', () => {
    expect(isProductionDb('/tmp/gate-p3/db/gate.sqlite')).toBe(false);
    expect(isProductionDb('/tmp/data/checkpoints-copy.sqlite')).toBe(false);
    expect(isProductionDb('/tmp/db/checkpoints.sqlite')).toBe(false);
  });
});

describe('applyPlants', () => {
  it('replaces a channel and leaves the input untouched', () => {
    const cv = { a: 1, b: { c: 2 } };
    const out = applyPlants(cv, { a: 5 });
    expect(out).toEqual({ a: 5, b: { c: 2 } });
    expect(cv).toEqual({ a: 1, b: { c: 2 } });
  });

  it('sets a nested field by a dotted path, creating objects on the way', () => {
    const out = applyPlants({ cache: { plan: 'x' } }, { 'cache.writerQuestions': [{ kind: 'player' }], 'new.deep.key': 1 });
    expect(out.cache).toEqual({ plan: 'x', writerQuestions: [{ kind: 'player' }] });
    expect(out.new).toEqual({ deep: { key: 1 } });
  });

  it('appends one item, or each item of an array, under a + key', () => {
    expect(applyPlants({ h: [1] }, { '+h': 2 }).h).toEqual([1, 2]);
    expect(applyPlants({ h: [1] }, { '+h': [2, 3] }).h).toEqual([1, 2, 3]);
    expect(applyPlants({}, { '+h': 1 }).h).toEqual([1]);
  });

  it('throws on an append to a value that is not an array, and on an empty key segment', () => {
    expect(() => applyPlants({ h: {} }, { '+h': 1 })).toThrow(/not an array/);
    expect(() => applyPlants({}, { 'a..b': 1 })).toThrow(/Bad plant key/);
  });
});

describe('splitPlants', () => {
  it('sends interrupt: keys to the stop payload, without the prefix, and the rest to the state', () => {
    expect(splitPlants({ 'interrupt:sessionConfig.accusation': 1, '+evaluationHistory': 2, a: 3 })).toEqual({
      state: { '+evaluationHistory': 2, a: 3 },
      interrupt: { 'sessionConfig.accusation': 1 }
    });
    expect(splitPlants({})).toEqual({ state: {}, interrupt: {} });
  });
});

describe('stopOfWrites', () => {
  it('reads the stop from an __interrupt__ write as SqliteSaver stores it', () => {
    const writes = [
      { channel: 'currentPhase', value: '2.3' },
      { channel: '__interrupt__', value: { id: 'abc', value: { type: 'arc-selection', narrativeArcs: [] } } }
    ];
    expect(stopOfWrites(writes)).toBe('arc-selection');
  });

  it('is null when the checkpoint has no interrupt', () => {
    expect(stopOfWrites([{ channel: 'currentPhase', value: '2.3' }])).toBeNull();
    expect(stopOfWrites([])).toBeNull();
  });
});
