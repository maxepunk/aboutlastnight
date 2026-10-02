const { createPromptBuilder } = require('../prompt-builder');

/**
 * Phase 3 (3.2): the summary says how the ledger's figures were made and what the
 * grand total sums. The "Black Market mechanics" it used to explain ("account holders
 * are PAID for surrendering their memories", Blake keeping every buried memory) went:
 * the world and T3 to T5 state how the money moves, and those lines contradicted them.
 */
describe('financial summary - the ledger figures', () => {
  test('lists each account with its total and its sales, and labels the grand total for what it sums', () => {
    const pb = createPromptBuilder('journalist');
    const accounts = [
      { name: 'Burns', total: 1300000, tokenCount: 7 },
      { name: 'Skyler', total: 155000, tokenCount: 1 }
    ];
    const result = pb._buildFinancialSummary(accounts);
    expect(result).toContain('- Burns: $1,300,000 (7 sales)');
    expect(result).toContain('- Skyler: $155,000 (1 sale)');
    expect(result).toContain('All accounts together: $1,455,000');
    expect(result).toMatch(/the sales and the first-burial bonus/);
    expect(result).not.toMatch(/surrendering|collects|Black Market|\btokens?\b/);
  });

  // Phase 3 (3.9; T5, R11): the total is what the buyer paid out. NeurAI and its board are
  // Nova's suspicion, so the summary the writers copy from never names them as the payer
  // (rule-text read 2, section D).
  test('says the total is what the buyer paid out this morning, naming no buyer', () => {
    const result = createPromptBuilder('journalist')._buildFinancialSummary([{ name: 'Burns', total: 1300000, tokenCount: 7 }]);
    expect(result).toContain('All accounts together: $1,300,000. That is what the buyer paid out this morning');
    expect(result).not.toMatch(/NeurAI|board/);
  });
});
