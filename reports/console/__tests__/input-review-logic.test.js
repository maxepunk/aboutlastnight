/**
 * Node-env unit tests for the InputReview pronoun resolver (F1 / X-4).
 * Pure logic extracted to a dual-export module per reports/CLAUDE.md.
 */
const { resolveRosterPronoun } = require('../input-review-logic');

describe('resolveRosterPronoun (X-4 review-gate lookup)', () => {
  const map = { Victoria: 'she/her', Sam: 'he/him' };

  it('returns the exact-key pronoun', () => {
    expect(resolveRosterPronoun('Victoria', map)).toBe('she/her');
  });

  it('is case-insensitive (parsed "victoria" still finds the director-set pronoun)', () => {
    expect(resolveRosterPronoun('victoria', map)).toBe('she/her');
  });

  it('defaults to they/them for an unknown name', () => {
    expect(resolveRosterPronoun('Mystery', map)).toBe('they/them');
  });

  it('defaults to they/them for a null/empty map', () => {
    expect(resolveRosterPronoun('Victoria', null)).toBe('they/them');
    expect(resolveRosterPronoun('Victoria', {})).toBe('they/them');
  });

  it('resolves a full-name key (feeder may key by the free-typed roster name)', () => {
    expect(resolveRosterPronoun('Sarah Blackwood', { 'Sarah Blackwood': 'she/her' })).toBe('she/her');
  });

  it('returns they/them for an Object.prototype key name (no inherited-member leak)', () => {
    expect(resolveRosterPronoun('constructor', {})).toBe('they/them');
    expect(resolveRosterPronoun('toString', {})).toBe('they/them');
  });
});
