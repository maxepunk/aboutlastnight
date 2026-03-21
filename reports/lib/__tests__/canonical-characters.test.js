const { extractCanonicalCharacters } = require('../workflow/nodes/node-helpers');

describe('extractCanonicalCharacters', () => {
  test('resolves full names like "Sarah Blackwood" without warning', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [
      { owners: ['Sarah Blackwood'] },
      { owners: ['Alex Reeves'] }
    ];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah Blackwood']).toBe('Sarah Blackwood');
    expect(result['Alex Reeves']).toBe('Alex Reeves');
    // Should NOT warn for known characters passed as full names
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('resolves first names correctly', () => {
    const tokens = [{ owners: ['Sarah'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });

  test('warns for truly unknown characters', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['UnknownPerson'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown character "UnknownPerson"')
    );
    consoleSpy.mockRestore();
  });

  test('does not warn for NPCs (Nova, Blake, Marcus)', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['Nova', 'Blake', 'Marcus'] }];
    extractCanonicalCharacters(tokens, 'journalist');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('does not warn for Flip (PC whose canonical name equals first name)', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const tokens = [{ owners: ['Flip'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(result['Flip']).toBe('Flip');
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  test('skips null/empty owners', () => {
    const tokens = [{ owners: [null, '', 'Sarah'] }];
    const result = extractCanonicalCharacters(tokens, 'journalist');
    expect(Object.keys(result)).toHaveLength(1);
    expect(result['Sarah']).toBe('Sarah Blackwood');
  });
});
