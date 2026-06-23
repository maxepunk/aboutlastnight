/**
 * Tests for extractCanonicalCharacters in node-helpers.js
 */

describe('extractCanonicalCharacters', () => {
  const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

  it('should derive firstName -> fullName map from Notion owner strings', () => {
    const tokens = [
      { owners: ['Vic Kingsley'] },
      { owners: ['Alex Reeves', 'Vic Kingsley'] },
      { owners: ['Sarah Blackwood'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Vic']).toBe('Vic Kingsley');
    expect(result['Alex']).toBe('Alex Reeves');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });

  it('should handle single-name owners without last name', () => {
    const tokens = [{ owners: ['Flip'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Flip']).toBe('Flip');
  });

  it('should handle empty token array', () => {
    const result = extractCanonicalCharacters([], 'journalist');
    expect(result).toEqual({});
  });

  it('should handle tokens with no owners', () => {
    const tokens = [{ owners: [] }, { owners: null }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result).toEqual({});
  });

  it('should not warn for any Notion-provided names (no hardcoded validation)', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['UnknownPerson'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Unknownperson']).toBe('UnknownPerson');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should deduplicate owners across multiple tokens (first occurrence wins)', () => {
    const tokens = [
      { owners: ['Alex Reeves'] },
      { owners: ['Alex Reeves'] },
      { owners: ['Alex Reeves', 'Sarah Blackwood'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Alex']).toBe('Alex Reeves');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });
});

describe('normalizeRosterPronounsToCanonical', () => {
  const { normalizeRosterPronounsToCanonical } = require('../workflow/nodes/node-helpers');
  const canonical = { Victoria: 'Victoria Kingsley', Sam: 'Sam Rivera' };

  it('passes through an exact canonical-key match', () => {
    const out = normalizeRosterPronounsToCanonical({ Victoria: 'she/her' }, canonical);
    expect(out).toEqual({ Victoria: 'she/her' });
  });

  it('re-keys a case-divergent typed name to the canonical key', () => {
    const out = normalizeRosterPronounsToCanonical({ victoria: 'she/her' }, canonical);
    expect(out.Victoria).toBe('she/her');
    expect(out.victoria).toBeUndefined();
  });

  it('re-keys a full-name typed entry to the canonical first-name key', () => {
    // Director typed the full name; canonical key is the first name.
    const out = normalizeRosterPronounsToCanonical({ 'Victoria Kingsley': 'she/her' }, canonical);
    expect(out.Victoria).toBe('she/her');
    expect(out['Victoria Kingsley']).toBeUndefined();
  });

  it('keeps an unmatched typed name under its original key (no data loss)', () => {
    const out = normalizeRosterPronounsToCanonical({ Mystery: 'they/them' }, canonical);
    expect(out.Mystery).toBe('they/them');
  });

  it('returns an empty object for empty/null inputs', () => {
    expect(normalizeRosterPronounsToCanonical(null, canonical)).toEqual({});
    expect(normalizeRosterPronounsToCanonical({}, null)).toEqual({});
  });
});

describe('F1 pronoun key chain (X-1 + X-7): normalize then render', () => {
  const { normalizeRosterPronounsToCanonical } = require('../workflow/nodes/node-helpers');
  const { generateRosterSection } = require('../prompt-builder');

  it('a full-name typed pronoun reaches the rendered roster line (not they/them)', () => {
    const canonicalCharacters = { Victoria: 'Victoria Kingsley', Sam: 'Sam Rivera' };
    // Director typed the full name with a pronoun; X-1 re-keys to "Victoria".
    const typed = { 'Victoria Kingsley': 'she/her' };
    const normalized = normalizeRosterPronounsToCanonical(typed, canonicalCharacters);
    const section = generateRosterSection('journalist', canonicalCharacters, null, normalized);
    expect(section).toContain('Victoria → Victoria Kingsley (she/her)');
    // Sam unset -> still they/them; proves we did not over-apply.
    expect(section).toContain('Sam → Sam Rivera (they/them)');
    // Regression guard for the masking default the audit called out.
    expect(section).not.toContain('Victoria Kingsley (they/them)');
  });
});
