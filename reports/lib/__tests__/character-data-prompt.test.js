/**
 * Character Data Prompt Integration Tests
 *
 * Verifies that characterData (groups, roles, relationships) extracted
 * in Task C flows correctly through the prompt assembly pipeline.
 */

const { generateRosterSection, createPromptBuilder } = require('../prompt-builder');

// Mock ThemeLoader so createPromptBuilder doesn't hit filesystem
jest.mock('../theme-loader', () => {
  const actual = jest.requireActual('../theme-loader');
  return {
    ...actual,
    createThemeLoader: jest.fn(() => ({
      loadPhasePrompts: jest.fn(),
      loadTemplate: jest.fn(),
      validate: jest.fn()
    }))
  };
});

describe('character data in prompts', () => {
  test('generateRosterSection includes character groups and roles', () => {
    const charData = {
      'Mel': { groups: ['Stanford Four'], relationships: { 'Sarah': 'divorce attorney' }, role: 'Attorney' },
      'Alex': { groups: [], relationships: {}, role: 'Wronged Partner' }
    };
    const result = generateRosterSection('journalist', null, charData);
    expect(result).toContain('CANONICAL CHARACTER ROSTER');
    expect(result).toContain('CHARACTER CONTEXT');
    expect(result).toContain('Stanford Four');
    expect(result).toContain('Attorney');
    expect(result).toContain('Mel');
  });

  test('generateRosterSection handles null characterData gracefully', () => {
    const result = generateRosterSection('journalist', null, null);
    expect(result).toContain('CANONICAL CHARACTER ROSTER');
    expect(result).not.toContain('CHARACTER CONTEXT');
  });

  test('generateRosterSection handles empty characterData object', () => {
    const result = generateRosterSection('journalist', null, {});
    expect(result).not.toContain('CHARACTER CONTEXT');
  });

  test('PromptBuilder stores and passes characterData', () => {
    const charData = { 'Mel': { groups: ['Stanford Four'], role: 'Attorney', relationships: {} } };
    const pb = createPromptBuilder({ theme: 'journalist', characterData: charData });
    expect(pb.characterData).toEqual(charData);
  });
});
