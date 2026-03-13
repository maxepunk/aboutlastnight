/**
 * Tests for extractCanonicalCharacters in node-helpers.js
 */

describe('extractCanonicalCharacters', () => {
  const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

  it('should extract unique owner names from token data', () => {
    const tokens = [
      { owners: ['Vic'] },
      { owners: ['Alex', 'Vic'] },
      { owners: ['Sarah'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Vic']).toBe('Vic Kingsley');
    expect(result['Alex']).toBe('Alex Reeves');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });

  it('should use theme-config as fallback for full name resolution', () => {
    const tokens = [{ owners: ['Kai'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Kai']).toBe('Kai Andersen');
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

  it('should log warning for unknown first names not in theme-config', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['UnknownPerson'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['UnknownPerson']).toBe('UnknownPerson');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('UnknownPerson')
    );
    consoleSpy.mockRestore();
  });

  it('should not warn for known NPCs that resolve to themselves', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['Flip'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Flip']).toBe('Flip');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should deduplicate owners across multiple tokens', () => {
    const tokens = [
      { owners: ['Alex'] },
      { owners: ['Alex'] },
      { owners: ['Alex', 'Sarah'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(Object.keys(result)).toHaveLength(2);
    expect(result['Alex']).toBe('Alex Reeves');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });
});
