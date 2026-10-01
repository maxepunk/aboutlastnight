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
  });

  it("prints the addressee, and the director's words around the quote on their own line (phase 3, 3.6)", () => {
    const prose = 'After unlocking a box, Remi said "do you want to trade a little" to Mel.';
    const out = renderDirectorEnrichmentBlock({
      rawProse: prose,
      quotes: [{ speaker: 'Remi', text: 'do you want to trade a little', addressee: 'Mel', context: prose, confidence: 'high' }],
      transactionReferences: [],
      postInvestigationDevelopments: []
    });
    expect(out).toContain(`- Remi (to Mel): "do you want to trade a little"
  In the notes: ${prose}
</QUOTE_BANK>`);
    // The model's own rating is not printed: the director's words say how the speaker is known.
    expect(out).not.toContain('[high]');
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
    // Phase 3 (3.6): a link is the model's pairing of an observation with sales, and
    // its label says so.
    expect(out).toContain(`<TRANSACTION_LINKS>
${DERIVED_LABELS.transactionLinks}
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

  it("emits <EPILOGUE> with the director's sentence (phase 3, 3.6)", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'p. It has just been announced that Sarah is interim CEO.',
      quotes: [],
      transactionReferences: [],
      postInvestigationDevelopments: [{ detail: 'It has just been announced that Sarah is interim CEO.', subjects: ['Sarah'] }]
    });
    expect(out).toContain('<EPILOGUE>');
    expect(out).toMatch(/\n- It has just been announced that Sarah is interim CEO\.\n<\/EPILOGUE>$/);
    expect(out).not.toContain('POST_INVESTIGATION_NEWS');
  });

  it('omits optional sections when their arrays are empty', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: 'p', quotes: [], transactionReferences: [], postInvestigationDevelopments: [] });
    expect(out).not.toContain('<QUOTE_BANK>');
    expect(out).not.toContain('<TRANSACTION_LINKS>');
    expect(out).not.toContain('<EPILOGUE>');
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

/**
 * Phase 3 (3.6): the director's notes reach the writers as written, and the
 * machine's readings of them are labelled as readings. The quote bank used to tell
 * the writers to "prefer these", forced a speaker onto every line and separated its
 * parts with em-dashes; the epilogue block printed the enricher's own headline,
 * subject list and "why this matters" ahead of the director's sentence.
 */
describe("renderDirectorEnrichmentBlock: the director's notes, unguessed (phase 3, 3.6)", () => {
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const PROSE = [
    'Overheard near the end: "Oh, Sam exposed everything."',
    'Vic to Ashe: "My company is very interesting."',
    'Remi was not available for comment after the investigation.',
    'At the time of writing this article, Nova intercepted a communication between the NeurAI board of directors and Blake.'
  ].join('\n');
  const CORRECTION = 'The line to Ashe was Blake, not Vic, and Blake said "my company would be very interested".';
  const QUOTES = [
    { text: 'Oh, Sam exposed everything.', context: 'Overheard near the end: "Oh, Sam exposed everything."', confidence: 'low' },
    {
      speaker: 'Blake', addressee: 'Ashe', text: 'my company would be very interested',
      context: 'Vic to Ashe: "My company is very interesting."', correction: CORRECTION, confidence: 'high'
    }
  ];
  const block = (out, tag) => out.slice(out.indexOf(`<${tag}>`), out.indexOf(`</${tag}>`) + tag.length + 3);

  it("prints a quote whose speaker the notes do not record as \"speaker not recorded\", with the director's words around it", () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: QUOTES, corrections: [CORRECTION] });
    expect(out).toContain('- (speaker not recorded): "Oh, Sam exposed everything."\n  In the notes: Overheard near the end: "Oh, Sam exposed everything."\n');
  });

  it('prints a stored "unknown" speaker the same way (a thread enriched before 3.6)', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: [{ speaker: 'unknown', text: 'Oh, Sam exposed everything.', confidence: 'low' }] });
    expect(out).toContain('- (speaker not recorded): "Oh, Sam exposed everything."');
    expect(out).not.toContain('- unknown:');
  });

  it('keeps a corrected speaker and wording, and names the correction that applied', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: QUOTES, corrections: [CORRECTION] });
    expect(block(out, 'QUOTE_BANK')).toContain([
      '- Blake (to Ashe): "my company would be very interested"',
      '  In the notes: Vic to Ashe: "My company is very interesting."',
      `  The director's correction: ${CORRECTION}`
    ].join('\n'));
  });

  it("prints a context only when the notes hold it word for word (a stored context was the enricher's own prose on 092026)", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      quotes: [{ speaker: 'Blake', text: 'My company is very interesting.', context: "Prose attributes this to 'Vic to Ashe' but DIRECTOR_CORRECTIONS states this was Blake -> Ashe.", confidence: 'high' }]
    });
    expect(out).toContain('- Blake: "My company is very interesting."\n</QUOTE_BANK>');
    expect(out).not.toContain('Prose attributes');
  });

  it("prints a correction only when the director's corrections hold it word for word", () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: QUOTES, corrections: [] });
    expect(out).not.toContain("The director's correction:");
  });

  it('drops "prefer these" and every em-dash from the quote bank, and keeps its derived label', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: QUOTES, corrections: [CORRECTION] });
    const bank = block(out, 'QUOTE_BANK');
    expect(bank).toContain(`<QUOTE_BANK>\n${DERIVED_LABELS.directorNotesIndex}\n`);
    expect(bank).not.toMatch(/prefer these/i);
    expect(bank).not.toContain('\u2014');
  });

  it("labels the transaction links as the model's reading, with no \"pre-linked\" claim", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      transactionReferences: [{ excerpt: 'Remi was not available for comment after the investigation.', linkedTransactions: [{ timestamp: '10:13 AM', amount: '$400,000', sellingTeam: 'RW' }], confidence: 'low' }]
    });
    const links = block(out, 'TRANSACTION_LINKS');
    expect(links).toContain(`<TRANSACTION_LINKS>\n${DERIVED_LABELS.transactionLinks}\n`);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/model \(Opus\)/);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/reading/);
    expect(links).not.toMatch(/pre-linked|burial transactions/);
    expect(links).not.toContain('\u2014');
  });

  it("prints the epilogue as the director's sentences under <EPILOGUE>, labelled as a model's selection", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      postInvestigationDevelopments: [
        { detail: 'Remi was not available for comment after the investigation.', subjects: ['Remi'] },
        { detail: 'At the time of writing this article, Nova intercepted a communication between the NeurAI board of directors and Blake.', subjects: ['Remi'] }
      ]
    });
    expect(block(out, 'EPILOGUE')).toBe([
      '<EPILOGUE>',
      DERIVED_LABELS.epilogue,
      '- Remi was not available for comment after the investigation.',
      '- At the time of writing this article, Nova intercepted a communication between the NeurAI board of directors and Blake.',
      '</EPILOGUE>'
    ].join('\n'));
  });

  it("renders an old epilogue item with a headline as the director's sentence alone", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      postInvestigationDevelopments: [{
        headline: 'Remi unavailable; reportedly offshore',
        detail: 'Remi was not available for comment after the investigation.',
        subjects: ['Remi'],
        bearingOnNarrative: 'The accused has left for an offshore location after the verdict.'
      }]
    });
    const epilogue = block(out, 'EPILOGUE');
    expect(epilogue).toContain('\n- Remi was not available for comment after the investigation.\n</EPILOGUE>');
    ['Remi unavailable; reportedly offshore', 'subjects:', 'offshore location', '\u2014'].forEach((part) => expect(epilogue).not.toContain(part));
  });

  it('prints no epilogue line for an old item with only a headline, nor one the notes do not hold', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      postInvestigationDevelopments: [
        { headline: 'Riley left town' },
        { headline: 'Remi fled', detail: 'Remi fled to the Cayman Islands.' }
      ]
    });
    expect(out).not.toContain('<EPILOGUE>');
    expect(out).not.toContain('Riley left town');
    expect(out).not.toContain('Cayman');
  });
});
