/**
 * The transaction links on the session clock (phase 3, brief 3.5; spec section 6:
 * "Every logged time any input prints uses this one clock, the transaction links
 * included"; the plan review's I15).
 *
 * <TRANSACTION_LINKS> prints each linked sale's time. It used to print the real
 * clock, so an evening session's links read 9:40 PM beside a timeline that read
 * 9:40 AM. The block takes the session config and prints each time through the one
 * session clock. The director's notes themselves are never changed.
 */

const { renderDirectorEnrichmentBlock } = require('../prompt-renderers/director-notes-renderer');

const LINK = {
  excerpt: 'Kai paid Blake just before ten.',
  linkedTransactions: [{ timestamp: '09:40 PM', amount: '$450,000', sellingTeam: 'Cass' }],
  confidence: 'high'
};

function render(sessionConfig) {
  return renderDirectorEnrichmentBlock({
    rawProse: 'Kai paid Blake just before ten. At 9:40 PM the room went quiet.',
    transactionReferences: [LINK],
    sessionConfig
  });
}

describe('<TRANSACTION_LINKS> on the session clock', () => {
  it('an evening session prints each linked sale\'s time as morning', () => {
    const out = render({ sessionClock: { decided: true, evening: true, firstTime: '07:37 PM' } });
    expect(out).toContain('[account: Cass | amount: $450,000 | time: 09:40 AM]');
  });

  it('a daytime session prints the time as logged', () => {
    const out = render({ sessionClock: { decided: true, evening: false, firstTime: '01:10 PM' } });
    expect(out).toContain('[account: Cass | amount: $450,000 | time: 09:40 PM]');
  });

  it('a thread from before phase 3 decides the clock from its exposures', () => {
    const out = render({ exposures: [{ tokenId: 'ale003', time: '07:37 PM' }] });
    expect(out).toContain('time: 09:40 AM]');
  });

  it('never changes the director\'s notes: their own times stay as written', () => {
    const out = render({ sessionClock: { decided: true, evening: true, firstTime: '07:37 PM' } });
    expect(out).toContain('<DIRECTOR_NOTES>\nKai paid Blake just before ten. At 9:40 PM the room went quiet.\n</DIRECTOR_NOTES>');
  });

  it('with no session config, prints the time as logged', () => {
    expect(render(undefined)).toContain('time: 09:40 PM]');
  });
});
