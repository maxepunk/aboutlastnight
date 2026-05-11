/**
 * Session-Report Parser Probe
 *
 * Verifies that parseRawInput Step 2 (session-report parsing) handles the
 * current orchestrator output format ("Scoring Timeline" + "Final Standings"
 * section names) and produces non-empty buriedTokens/shellAccounts.
 *
 * Triggered by session 050926 failure: parser returned shellAccounts=[]
 * because its prompt looked for "Black Market Scans table" sections that
 * the current orchestrator format doesn't use.
 *
 * Usage: node scripts/probe-session-parser.js
 */

const { sdkQuery } = require('../lib/llm');

const SESSION_REPORT_SCHEMA = require('../lib/workflow/nodes/input-nodes')._testing
  ? require('../lib/workflow/nodes/input-nodes')._testing.SESSION_REPORT_SCHEMA
  : null;

// Minimal-but-representative excerpt of session 050926's actual session report.
// Uses the section names from the current orchestrator format. The parser must
// extract buriedTokens from the Scoring Timeline's Sale rows and shellAccounts
// from Final Standings.
const SAMPLE_REPORT = `# Session Report: 0509game
**Saturday, May 9, 2026 | Duration: 3h 35m | Teams: 8**

## Session Summary

- **Teams:** Anonymous Tip, First Burial Bonus, Jamie, Person, Ss, Ashe, Sarah, Ie
- **Total Transactions:** 14 (8 detective, 6 black market)
- **Player Scans:** 30

### Final Standings

1. **Jamie** — $1,299,997 ($1,250,000 transactions +$49,997 adjustments)
2. **Person** — $930,000
3. **Ie** — $655,000
4. **Sarah** — $385,003 ($385,000 transactions +$3 adjustments)
5. **Ashe** — $225,000 ($150,000 transactions +$75,000 adjustments)
6. **Ss** — $75,000 ($75,000 transactions +$0 adjustments)

## Detective Evidence Log

| Token | Owner | Exposed By | Time | Evidence |
|-------|-------|------------|------|----------|
| ale004 | Alex Reeves | Anonymous Tip | 10:09 PM | Alex shows VIC the specs |
| cas001 | Cass Zhang | Anonymous Tip | 10:05 PM | CASS tells QUINN about MARCUS |

## Scoring Timeline

| Time | Type | Detail | Team | Amount |
|------|------|--------|------|--------|
| 07:23 PM | Adjustment | Manual GM adjustment | First Burial Bonus | +$50,000 |
| 08:58 PM | Sale | fli001/Flip (2★ Party, $25,000 × 5x) | Jamie | +$125,000 |
| 09:08 PM | Sale | sar001/Sarah Blackwood (4★ Mention, $75,000 × 3x) | Person | +$225,000 |
| 09:19 PM | Sale | sar002/Sarah Blackwood (4★ Mention, $75,000 × 3x) | Person | +$225,000 |
| 09:34 PM | Sale | qui003/Quinn Sterling (2★ Mention, $25,000 × 3x) | Jamie | +$75,000 |
| 09:34 PM | Sale | ash004/Ashe Motoko (1★ Mention, $10,000 × 3x) | Person | +$30,000 |
| 09:45 PM | Sale | ril004/Riley Torres (2★ Mention, $25,000 × 3x) | Ashe | +$75,000 |
| 10:14 PM | Sale | mel001/Mel Nilsson (1★ Mention, $10,000 × 3x) | Ie | +$30,000 |
| 10:14 PM | Sale | jam002/Jamie 'Volt' Woods (3★ Party, $50,000 × 5x) | Ie | +$250,000 |
| 10:14 PM | Sale | sam002/Sam Thorne (4★ Party, $75,000 × 5x) | Ie | +$375,000 |
| 10:15 PM | Sale | tay001/Taylor Chase (1★ Mention, $10,000 × 3x) | Sarah | +$30,000 |
| 10:15 PM | Sale | ash001/Ashe Motoko (2★ Mention, $25,000 × 3x) | Ss | +$75,000 |
`;

// We can't easily import the SESSION_REPORT_SCHEMA without exporting it.
// Instead, replicate the schema inline for the probe.
const SCHEMA = {
  type: 'object',
  required: ['exposedTokens', 'buriedTokens'],
  properties: {
    sessionId: { type: 'string' },
    sessionName: { type: 'string' },
    exposedTokens: { type: 'array', items: { type: 'string' } },
    exposedCount: { type: 'number' },
    buriedTokens: {
      type: 'array',
      items: {
        type: 'object',
        required: ['tokenId', 'shellAccount', 'amount'],
        properties: {
          tokenId: { type: 'string' },
          shellAccount: { type: 'string' },
          amount: { type: 'number' },
          time: { type: 'string' }
        }
      }
    },
    buriedCount: { type: 'number' },
    shellAccounts: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'total', 'tokenCount', 'rank'],
        properties: {
          name: { type: 'string' },
          total: { type: 'number' },
          tokenCount: { type: 'number' },
          rank: { type: 'number' }
        }
      }
    },
    totalBuried: { type: 'number' },
    teamsRegistered: { type: 'array', items: { type: 'string' } }
  }
};

// Same prompt as the production parser (kept in sync with input-nodes.js).
const PARSER_PROMPT = `Parse the following session gameplay report into structured JSON.

SESSION REPORT:
${SAMPLE_REPORT}

Section names vary between session-report generations. Recognize ALL of these patterns:

EXPOSED tokens (sold to Detective, become public evidence):
- "Detective Evidence Log" table (current orchestrator format)
- "Detective Scans" table (older format)
- Token IDs appear in the leftmost "Token" column

BURIED tokens (sold to Black Market, buried in shell accounts):
- "Scoring Timeline" table rows where Type = "Sale" (current orchestrator format)
- "Black Market Scans" table (older format)
- For each Sale row: Detail column contains "<tokenId>/<Character Name>", Team column = shell account name, Amount column = dollar amount
- Adjustment rows on the Scoring Timeline are NOT buried tokens — skip them
- Only count true buries: rows whose Detail field begins with a tokenId like "fli001/" or "sar002/"

SHELL ACCOUNTS:
- "Final Standings" or "Final Totals" section (current orchestrator format)
- "Shell Account Standings" section (older format)
- Each shell account has a name, a total dollar amount, and a rank
- tokenCount = number of unique buried tokens routed to that account (count from the Scoring Timeline; if unavailable, use 0)
- IMPORTANT: only include team names that appear in BOTH Final Standings AND as a Sale-target in the Scoring Timeline. Skip placeholder/bonus rows like "First Burial Bonus" if they don't represent a player shell account.

OTHER FIELDS:
- "Session ID" / "session UUID" → sessionId
- "Teams Registered" or the comma-separated team list under "Session Summary" → teamsRegistered

If you can't find a section, return an empty array for that field rather than failing. The downstream pipeline tolerates missing data better than wrong data.

Return structured JSON matching the schema.`;

(async function main() {
  console.log('Probing session-report parser against current orchestrator format...\n');

  const result = await sdkQuery({
    prompt: PARSER_PROMPT,
    systemPrompt: 'You parse game session reports with token and transaction data. Be precise with numbers and IDs.',
    model: 'sonnet',
    jsonSchema: SCHEMA,
    loadProjectSettings: false,
    label: 'session-parser probe'
  });

  console.log('\n=== Parser output ===');
  console.log(`exposedTokens: ${result.exposedTokens?.length || 0} (expected: 2)`);
  console.log(`buriedTokens: ${result.buriedTokens?.length || 0} (expected: 11 — all Sale rows)`);
  console.log(`shellAccounts: ${result.shellAccounts?.length || 0} (expected: 6 — Jamie, Person, Ie, Sarah, Ashe, Ss)`);
  console.log(`teamsRegistered: ${result.teamsRegistered?.length || 0} (expected: 8)`);

  if (result.shellAccounts?.length) {
    console.log('\nShell accounts:');
    result.shellAccounts
      .sort((a, b) => (a.rank || 99) - (b.rank || 99))
      .forEach(a => console.log(`  ${a.rank}. ${a.name}: $${a.total.toLocaleString('en-US')} (${a.tokenCount} tokens)`));
  }

  if (result.buriedTokens?.length) {
    console.log('\nFirst 3 buried tokens:');
    result.buriedTokens.slice(0, 3).forEach(t =>
      console.log(`  ${t.tokenId} → ${t.shellAccount} ($${t.amount.toLocaleString('en-US')}, ${t.time})`)
    );
  }

  // Pass/fail summary
  const passed =
    (result.exposedTokens?.length || 0) >= 2 &&
    (result.buriedTokens?.length || 0) >= 8 &&
    (result.shellAccounts?.length || 0) >= 5;
  console.log(`\n${passed ? '✓ PASS' : '✗ FAIL'}: parser produces non-empty data for current orchestrator format`);
  process.exit(passed ? 0 : 1);
})().catch(err => {
  console.error('Probe crashed:', err.message);
  process.exit(1);
});
