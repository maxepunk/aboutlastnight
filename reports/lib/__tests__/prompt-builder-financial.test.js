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
  // Phases 14 and 15 (brief E, R8): "during the investigation", which ran in the morning or
  // the afternoon, never a fixed "this morning".
  test('says the total is what the buyer paid out during the investigation, naming no buyer', () => {
    const result = createPromptBuilder('journalist')._buildFinancialSummary([{ name: 'Burns', total: 1300000, tokenCount: 7 }]);
    expect(result).toContain('All accounts together: $1,300,000. That is what the buyer paid out during the investigation');
    expect(result).not.toMatch(/NeurAI|board/);
  });
});

/**
 * Final review (data-harness-docs[0]): where the ledger's rows disagree with the session
 * report's Final Standings, or credit nothing to an account the standings list (053126's
 * L, paid on the game master's own adjustment rows), the account's total is the
 * standings' figure, and lib/session-ledger.js buildLedger keeps what the rows add up to
 * as `computedTotal`. The account's line says where its figure came from, so a writer or
 * a judge never reads it as sales plus transfers, and the sum stays what the rows add up
 * to: the sales and the first-burial bonus, what the buyer paid out.
 */
describe("financial summary - a total that is the session report's final figure", () => {
  const ACCOUNTS_053126 = [
    { name: 'Ft', total: 1155000, tokenCount: 2, rank: 1 },
    { name: 'L', total: 1100000, tokenCount: 0, rank: 2, computedTotal: 0 },
    { name: 'Zoe', total: 30000, tokenCount: 0, rank: 3, computedTotal: 0 },
    { name: 'Vic', total: 0, tokenCount: 1, rank: 4, computedTotal: 375000 },
    { name: 'Phil', total: 0, tokenCount: 1, rank: 5, computedTotal: 750000 }
  ];
  const FINAL_FIGURE = "the session report's final total for this account, which the ledger's sales, bonus and transfers do not add up to";
  const summary = () => createPromptBuilder('journalist')._buildFinancialSummary(ACCOUNTS_053126);

  test("says on the account's own line that its figure is the session report's final total", () => {
    const result = summary();
    expect(result).toContain('- Ft: $1,155,000 (2 sales)\n');
    expect(result).toContain(`- L: $1,100,000 (0 sales; ${FINAL_FIGURE})\n`);
    expect(result).toContain(`- Zoe: $30,000 (0 sales; ${FINAL_FIGURE})\n`);
    expect(result).not.toMatch(/- Vic|- Phil/);
    expect(result).not.toMatch(/NeurAI|board/);
  });

  test('sums what the ledger adds up to, the sales and the bonus, and says so', () => {
    expect(summary()).toContain("All accounts together, by the ledger's sales, bonus and transfers: $2,280,000. That is what the buyer paid out during the investigation, the sales and the first-burial bonus;");
  });

  test('a ledger the Final Standings agree with prints exactly as before', () => {
    const result = createPromptBuilder('journalist')._buildFinancialSummary([
      { name: 'Ember', total: 925000, tokenCount: 2, rank: 1 },
      { name: 'L', total: 375000, tokenCount: 0, rank: 2 },
      { name: 'Vic', total: 25000, tokenCount: 1, rank: 3 }
    ]);
    expect(result).toBe([
      '',
      '<FINANCIAL_SUMMARY>',
      "The ledger's accounts, with figures code computed from the session report. Each account's total is its sales, plus the first-burial bonus and the transfers it received, less the transfers it sent; beside it, how many sales it took.",
      '- Ember: $925,000 (2 sales)',
      '- L: $375,000 (0 sales)',
      '- Vic: $25,000 (1 sale)',
      'All accounts together: $1,325,000. That is what the buyer paid out during the investigation, the sales and the first-burial bonus; a transfer moves money between accounts and adds nothing to it.',
      '</FINANCIAL_SUMMARY>'
    ].join('\n'));
  });
});
