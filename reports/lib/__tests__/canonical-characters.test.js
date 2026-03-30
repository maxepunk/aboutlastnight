const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

describe('extractCanonicalCharacters', () => {
  test('derives firstName -> fullName map from Notion owner strings', () => {
    const tokens = [
      { owners: ['Sarah Blackwood'] },
      { owners: ['Alex Reeves'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah']).toBe('Sarah Blackwood');
    expect(result['Alex']).toBe('Alex Reeves');
  });

  test('handles single-name owners (no last name)', () => {
    const tokens = [{ owners: ['Flip'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Flip']).toBe('Flip');
  });

  test('does not warn for any Notion-provided names', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['Nova', 'Blake', 'Marcus Blackwood'] }];
    extractCanonicalCharacters(tokens, 'journalist');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('skips null/empty owners', () => {
    const tokens = [{ owners: [null, '', 'Sarah Blackwood'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });

  test('normalizes first name to title case for key', () => {
    const tokens = [{ owners: ['sarah blackwood'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah']).toBe('sarah blackwood');
  });

  test('first occurrence wins for duplicate first names', () => {
    const tokens = [
      { owners: ['Sarah Blackwood'] },
      { owners: ['Sarah B.'] }  // Different format, same first name
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });
});
