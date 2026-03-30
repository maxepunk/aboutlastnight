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
