// lib/llm/__tests__/sdk-fields.test.js — readers the 2.0 gate depends on.
const { servedModelsOf, servedModelMatches, hasMemoryPaths } = require('../sdk-fields');

// Moved here from scripts/lib/probe-verdicts.js: the wrapper uses it too.
describe('servedModelMatches', () => {
  test.each([
    ['claude-opus-5-5', 'claude-opus-5-5', true],
    ['claude-opus-5-5[1m]', 'claude-opus-5-5', true],
    ['claude-haiku-4-5-20251001', 'claude-haiku-4-5', true],
    ['claude-opus-4-8', 'claude-opus-5-5', false],
    ['claude-opus-5-5-lite', 'claude-opus-5-5', false],
    ['claude-opus-5', 'claude-opus-5-5', false],
    [null, 'claude-opus-5-5', false]
  ])('%s vs %s -> %s', (served, pinned, expected) => {
    expect(servedModelMatches(served, pinned)).toBe(expected);
  });
});

describe('servedModelsOf', () => {
  test('prefers canonicalModel, falls back to the key, de-duplicates', () => {
    expect(servedModelsOf({
      'claude-opus-5-5[1m]': { canonicalModel: 'claude-opus-5-5' },
      'claude-opus-5-5': { canonicalModel: 'claude-opus-5-5' },
      'claude-haiku-4-5': {}
    })).toEqual(['claude-opus-5-5', 'claude-haiku-4-5']);
  });

  test('null without modelUsage; empty for an empty map', () => {
    expect(servedModelsOf(undefined)).toBeNull();
    expect(servedModelsOf(null)).toBeNull();
    expect(servedModelsOf({})).toEqual([]);
  });
});

describe('hasMemoryPaths', () => {
  test.each([
    [{ auto: 'C:/Users/x/.claude/projects/p/memory' }, true],
    [['/home/x/memory'], true],
    ['/home/x/memory', true],
    [{ nested: { auto: '/m' } }, true],
    [undefined, false],
    [null, false],
    [{}, false],
    [[], false],
    [{ auto: null }, false],
    [{ auto: '' }, false],
    ['   ', false]
  ])('%j -> %s', (value, expected) => {
    expect(hasMemoryPaths(value)).toBe(expected);
  });
});
