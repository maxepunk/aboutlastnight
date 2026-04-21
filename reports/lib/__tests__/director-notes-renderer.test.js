const { renderDirectorEnrichmentBlock } = require('../prompt-renderers/director-notes-renderer');

describe('renderDirectorEnrichmentBlock', () => {
  it('renders <DIRECTOR_NOTES> with the prose when rawProse provided', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'Vic worked the room.',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<DIRECTOR_NOTES>');
    expect(out).toContain('Vic worked the room.');
    expect(out).toContain('</DIRECTOR_NOTES>');
  });

  it('emits "(no director notes provided)" when rawProse is empty', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: '', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] });
    expect(out).toContain('(no director notes provided)');
  });

  it('emits <QUOTE_BANK> when quotes present', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<QUOTE_BANK>');
    expect(out).toContain('- Alex: "we had to act"');
    expect(out).toContain('[high]');
  });

  it('includes addressee and context in quote line when present', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', addressee: 'Mel', context: 'after unlocking a box', confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('- Remi (to Mel): "do you want to trade a little" — after unlocking a box [high]');
  });

  it('emits <TRANSACTION_LINKS> when references present, formatting each linked transaction', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [{
        excerpt: 'Kai paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000', sellingTeam: 'Cass' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<TRANSACTION_LINKS>');
    expect(out).toContain('"Kai paid Blake"');
    expect(out).toContain('09:40 PM tay004 $450,000 → Cass');
    expect(out).toContain('(high)');
  });

  it('emits "no link" marker when linkedTransactions is empty', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [{ excerpt: 'ambiguous observation', linkedTransactions: [], confidence: 'low' }],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('[no link]');
    expect(out).toContain('(low)');
  });

  it('emits <POST_INVESTIGATION_NEWS> with headline, detail, subjects, and bearing', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: [{
        headline: 'Sarah named interim CEO',
        detail: 'Just been announced',
        subjects: ['Sarah'],
        bearingOnNarrative: 'power consolidation'
      }]
    });
    expect(out).toContain('<POST_INVESTIGATION_NEWS>');
    expect(out).toContain('- Sarah named interim CEO: Just been announced [subjects: Sarah] — power consolidation');
  });

  it('omits optional sections when their arrays are empty', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] });
    expect(out).not.toContain('<QUOTE_BANK>');
    expect(out).not.toContain('<TRANSACTION_LINKS>');
    expect(out).not.toContain('<POST_INVESTIGATION_NEWS>');
  });

  it('accepts missing optional arrays (undefined) without throwing', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p' });
    expect(out).toContain('<DIRECTOR_NOTES>');
    expect(out).not.toContain('<QUOTE_BANK>');
  });
});
