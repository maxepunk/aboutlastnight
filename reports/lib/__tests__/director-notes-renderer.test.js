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

  it('emits <TRANSACTION_LINKS> when references present, each linked transaction as account, amount and time', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [],
      transactionReferences: [{
        excerpt: 'Kai paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', amount: '$450,000', sellingTeam: 'Cass' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: []
    });
    expect(out).toContain('<TRANSACTION_LINKS>');
    expect(out).toContain('- "Kai paid Blake" → [account: Cass | amount: $450,000 | time: 09:40 PM] (high)');
  });

  it("prints a linked transaction with the <buried-transactions> line's own formatter", () => {
    const { buriedTransactionFields } = require('../prompt-renderers/record-view');
    const tx = { timestamp: '09:40 PM', amount: '$450,000', sellingTeam: 'Cass' };
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p', transactionReferences: [{ excerpt: 'x', linkedTransactions: [tx], confidence: 'high' }] });
    expect(out).toContain(buriedTransactionFields({ account: 'Cass', amount: '$450,000', time: '09:40 PM' }));
  });

  it("never prints a buried memory's id or owner, though a thread enriched before the fix stored both (092026)", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      transactionReferences: [{
        excerpt: 'Kai paid Blake',
        linkedTransactions: [
          { timestamp: '09:40 PM', tokenId: 'tay004', tokenOwner: 'Taylor Chase', amount: '$450,000', sellingTeam: 'Cass' },
          { timestamp: '09:52 PM', tokenId: 'sar004', tokenOwner: 'Sarah Blackwood', amount: '$75,000', sellingTeam: 'Elephant' }
        ],
        confidence: 'high'
      }]
    });
    expect(out).toContain('[account: Cass | amount: $450,000 | time: 09:40 PM; account: Elephant | amount: $75,000 | time: 09:52 PM]');
    ['tay004', 'sar004', 'Taylor', 'Sarah'].forEach((leak) => expect(out).not.toContain(leak));
  });

  it('labels <QUOTE_BANK> and <TRANSACTION_LINKS> as machine-made (integrator ruling)', () => {
    const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [{ excerpt: 'x', linkedTransactions: [], confidence: 'low' }]
    });
    expect(out).toContain(`<QUOTE_BANK>
${DERIVED_LABELS.directorNotesIndex}
`);
    expect(out).toContain(`<TRANSACTION_LINKS>
${DERIVED_LABELS.directorNotesIndex}
`);
    expect(DERIVED_LABELS.directorNotesIndex).toMatch(/^A model \(Opus\) built this .* the record decides\.$/);
    // The director's own words carry no label.
    expect(out.slice(0, out.indexOf('<QUOTE_BANK>'))).not.toContain(DERIVED_LABELS.directorNotesIndex);
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

describe('renderDirectorEnrichmentBlock: the input-review corrections (phase 2, brief 2.2)', () => {
  const PROSE = 'Vic to Ashe: "My company is very interesting."';

  it('puts the corrections right after the notes, which stay as written', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      quotes: [{ speaker: 'Blake', text: 'My company', confidence: 'high' }],
      corrections: ['This was actually Blake -> Ashe.']
    });
    expect(out).toContain(`<DIRECTOR_NOTES>\n${PROSE}\n</DIRECTOR_NOTES>\n\n<DIRECTOR_CORRECTIONS>`);
    expect(out).toContain("The director's corrections to the notes above, written at the input review, in the order given. They are the director's own words and override the notes where the two differ.\nThis was actually Blake -> Ashe.\n</DIRECTOR_CORRECTIONS>\n\n<QUOTE_BANK>");
  });

  it('numbers several corrections in the order the director sent them', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, corrections: ['first', 'second'] });
    expect(out).toContain('1. first\n\n2. second');
  });

  it('adds nothing without corrections', () => {
    expect(renderDirectorEnrichmentBlock({ rawProse: PROSE, corrections: [] })).not.toContain('DIRECTOR_CORRECTIONS');
    expect(renderDirectorEnrichmentBlock({ rawProse: PROSE })).not.toContain('DIRECTOR_CORRECTIONS');
  });
});
