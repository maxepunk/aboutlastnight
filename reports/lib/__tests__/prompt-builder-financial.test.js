const { createPromptBuilder } = require('../prompt-builder');

describe('financial summary - transaction mechanics', () => {
  test('includes Black Market mechanics explanation', () => {
    const pb = createPromptBuilder('journalist');
    const accounts = [
      { name: 'Burns', total: 1300000, tokenCount: 7 },
      { name: 'Skyler', total: 155000, tokenCount: 2 }
    ];
    const result = pb._buildFinancialSummary(accounts);
    expect(result).toContain('surrendering');
    expect(result).toContain('collects');
    expect(result).toContain('buried');
  });
});
