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
    // Task 3.11: a stored speaker prints when the director's words around the quote name them.
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'At the vote Alex said "we had to act".',
      quotes: [{ speaker: 'Alex', text: 'we had to act', context: 'At the vote Alex said "we had to act".', confidence: 'high' }],
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
    // A link prints only when the notes hold its observation (3.6b fix batch).
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'Kai paid Blake',
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
    const out = renderDirectorEnrichmentBlock({ rawProse: 'Kai paid Blake', transactionReferences: [{ excerpt: 'Kai paid Blake', linkedTransactions: [tx], confidence: 'high' }] });
    expect(out).toContain(buriedTransactionFields({ account: 'Cass', amount: '$450,000', time: '09:40 PM' }));
  });

  it("never prints a buried memory's id or owner, though a thread enriched before the fix stored both (092026)", () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: 'Kai paid Blake',
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
      rawProse: 'Kai paid Blake',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [{ excerpt: 'Kai paid Blake', linkedTransactions: [], confidence: 'low' }]
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
      rawProse: 'An ambiguous observation.',
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

  // Final review (data-harness-docs[1]): the correction names Ashe, but so do the notes,
  // so code cannot tell which Ashe the correction brings in, and the addressee is left
  // out; the correction printed under the line says "to Ashe".
  it('keeps a corrected speaker and wording, and names the correction that applied', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: QUOTES, corrections: [CORRECTION] });
    expect(block(out, 'QUOTE_BANK')).toContain([
      '- Blake: "my company would be very interested"',
      '  In the notes: Vic to Ashe: "My company is very interesting."',
      `  The director's correction: ${CORRECTION}`
    ].join('\n'));
  });

  // Task 3.11 (final review, session-data finding 2): 092026's stored quote keeps Blake
  // only because the stored correction names Blake. Its stored context was the enricher's
  // own prose, which the notes do not hold, so it neither prints nor names anyone.
  it("prints a context only when the notes hold it word for word, and keeps 092026's Blake only because the stored correction names Blake", () => {
    const stored = {
      speaker: 'Blake', text: 'My company is very interesting.',
      context: "Prose attributes this to 'Vic to Ashe' but DIRECTOR_CORRECTIONS states this was Blake -> Ashe.",
      correction: CORRECTION, confidence: 'high'
    };
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: [stored], corrections: [CORRECTION] });
    expect(block(out, 'QUOTE_BANK')).toContain(`- Blake: "My company is very interesting."\n  The director's correction: ${CORRECTION}\n</QUOTE_BANK>`);
    expect(out).not.toContain('Prose attributes');

    const bare = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes: [{ ...stored, correction: undefined }] });
    expect(bare).toContain('- (speaker not recorded): "My company is very interesting."\n</QUOTE_BANK>');
    expect(bare).not.toContain('- Blake');
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

/**
 * Task 3.11 (final review, session-data finding 2): a stored speaker prints only when a
 * verified context or correction names them, by the enricher's rule (lib/grounding.js
 * namedOutsideQuote). The enricher used before phase 3 required a speaker on every
 * quote, so threads it enriched (092026, 092626) store speakers whose only support was
 * a context the renderer drops, or none at all. 092626's bank printed "Mel" for a line
 * the notes give only as a thought in Mel's memory, which Remi exposed.
 */
describe("renderDirectorEnrichmentBlock: a stored speaker prints only when the director's words name them (task 3.11)", () => {
  const PROSE = [
    'Remi exposed a memory of Mel\'s, one in which she thinks "Marcus has no idea what\'s coming."',
    'Jess told the room she had found a bedroom in the warehouse.',
    'Vic to Ashe: "My company is very interesting."'
  ].join('\n');
  const bankOf = (quotes, corrections = []) => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes, corrections });
    return out.slice(out.indexOf('<QUOTE_BANK>'), out.indexOf('</QUOTE_BANK>'));
  };

  it('prints "speaker not recorded" for a stored speaker with no context or correction (092626\'s Mel)', () => {
    const bank = bankOf([{ speaker: 'Mel', text: 'Marcus has no idea what\'s coming.', confidence: 'high' }]);
    expect(bank).toContain('- (speaker not recorded): "Marcus has no idea what\'s coming."');
    expect(bank).not.toContain('- Mel');
  });

  it('prints "speaker not recorded" when the verified context names someone else, and keeps the addressee it names', () => {
    const bank = bankOf([{ speaker: 'Blake', addressee: 'Ashe', text: 'My company is very interesting.', context: 'Vic to Ashe: "My company is very interesting."', confidence: 'high' }]);
    expect(bank).toContain('- (speaker not recorded) (to Ashe): "My company is very interesting."\n  In the notes: Vic to Ashe: "My company is very interesting."');
  });

  it('never counts the quoted words as naming the speaker or the addressee (092626\'s "How would you know that, Jess?")', () => {
    const bank = bankOf([{ speaker: 'Sarah', addressee: 'Jess', text: 'How would you know that, Jess?', confidence: 'high' }]);
    expect(bank).toContain('- (speaker not recorded): "How would you know that, Jess?"');
    expect(bank).not.toMatch(/Sarah|\(to Jess\)/);
  });

  it('keeps a speaker and addressee the verified context names outside the quote', () => {
    const bank = bankOf([{ speaker: 'Vic', addressee: 'Ashe', text: 'My company is very interesting.', context: 'Vic to Ashe: "My company is very interesting."', confidence: 'high' }]);
    expect(bank).toContain('- Vic (to Ashe): "My company is very interesting."');
  });

  it('keeps the speaker the verified context names and leaves out an addressee only the quoted words name (092626\'s Jess)', () => {
    const bank = bankOf([{
      speaker: 'Jess', addressee: 'Sarah', text: 'So I assume that is not where he spent time with you, Sarah.',
      context: 'Jess told the room she had found a bedroom in the warehouse.', confidence: 'high'
    }]);
    expect(bank).toContain('- Jess: "So I assume that is not where he spent time with you, Sarah."\n  In the notes: Jess told the room she had found a bedroom in the warehouse.');
  });

  it('reads the rule from the grounding module, which the enricher shares', () => {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'prompt-renderers', 'director-notes-renderer.js'), 'utf8');
    expect(src).toMatch(/const \{[^}]*\bgroundQuote\b[^}]*\} = require\('\.\.\/grounding'\);/);
  });
});

/**
 * Final review (data-harness-docs[1]; T12): the renderer decides a stored quote's
 * speaker by the enricher's own rule (lib/grounding.js groundQuote). When a correction
 * the director's corrections hold is about the line, attached to the quote or not, a
 * speaker prints only when the correction names them and the notes' account of the line
 * does not: the name the correction brings in. A thread enriched before the rule can
 * store the notes' speaker beside the correction that moved the line, and the bank
 * printed the line in that mouth with the correction right under it.
 */
describe("renderDirectorEnrichmentBlock: a corrected line prints in no corrected-away mouth (final review)", () => {
  const PROSE = [
    'Jess told the room she had found a bedroom in the warehouse.',
    'Vic to Ashe: "My company is very interesting."'
  ].join('\n');
  const CORRECTION = 'The quote attributed to Vic, speaking to Ashe ("My company is very interesting"), was actually said by Blake to Ashe.';
  const VIC = { speaker: 'Vic', addressee: 'Ashe', text: 'My company is very interesting.', context: 'Vic to Ashe: "My company is very interesting."', confidence: 'high' };
  const bankOf = (quotes, corrections) => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, quotes, corrections });
    return out.slice(out.indexOf('<QUOTE_BANK>'), out.indexOf('</QUOTE_BANK>'));
  };

  it("prints \"speaker not recorded\" for the notes' Vic stored beside the correction that moved the line", () => {
    const bank = bankOf([{ ...VIC, correction: CORRECTION }], [CORRECTION]);
    expect(bank).toContain([
      '- (speaker not recorded): "My company is very interesting."',
      '  In the notes: Vic to Ashe: "My company is very interesting."',
      `  The director's correction: ${CORRECTION}`
    ].join('\n'));
    expect(bank).not.toMatch(/- Vic|\(to Ashe\)/);
  });

  it.each([
    ['double quotation marks', CORRECTION],
    ['single quotation marks', "The quote attributed to Vic, speaking to Ashe ('My company is very interesting'), was actually said by Blake to Ashe."],
    ['other case', 'The quote attributed to Vic, speaking to Ashe ("MY COMPANY IS VERY INTERESTING"), was actually said by Blake to Ashe.']
  ])('prints "speaker not recorded" for a stored Vic when a correction quoting the line in %s was never attached', (_case, correction) => {
    const bank = bankOf([VIC], [correction]);
    expect(bank).toContain('- (speaker not recorded): "My company is very interesting."\n  In the notes: Vic to Ashe: "My company is very interesting."');
    expect(bank).not.toMatch(/- Vic|\(to Ashe\)/);
  });

  it('prints Blake, whom the correction brings in, attached or not', () => {
    const blake = { ...VIC, speaker: 'Blake' };
    expect(bankOf([{ ...blake, correction: CORRECTION }], [CORRECTION])).toContain('- Blake: "My company is very interesting."');
    expect(bankOf([blake], [CORRECTION])).toContain('- Blake: "My company is very interesting."');
  });

  it('keeps the notes\' speaker and addressee for a line no correction is about', () => {
    expect(bankOf([VIC], ['Jess is she/her, not he/him.'])).toContain('- Vic (to Ashe): "My company is very interesting."');
  });
});

/**
 * 3.6b fix batch, finding 7: the enricher keeps a link only when the notes hold its
 * observation word for word (groundLinkExcerpts), but a thread enriched before that
 * check stored the model's own wording, and <TRANSACTION_LINKS> prints each excerpt
 * under a label that says it is quoted from the director's notes. The renderer
 * re-checks a stored excerpt, as it does a quote's context and an epilogue detail,
 * and prints nothing of a link whose observation the notes do not hold: the link is
 * the pairing of that observation with sales.
 */
describe('renderDirectorEnrichmentBlock: a stored transaction link prints only when the notes hold its observation (3.6b fix batch)', () => {
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');
  const PROSE = 'Kai was seen handing Blake an envelope at the Valet desk.\nRemi kept to the bar - all night.';
  const KAI = { excerpt: 'Kai was seen handing Blake an envelope at the Valet desk.', linkedTransactions: [{ timestamp: '09:40 PM', amount: '$450,000', sellingTeam: 'Cass' }], confidence: 'high' };
  const MODEL_WORDS = { excerpt: 'Remi appeared to coordinate a sale with Blake.', linkedTransactions: [{ timestamp: '10:13 PM', amount: '$400,000', sellingTeam: 'RW' }], confidence: 'medium' };

  it("prints a link whose observation the notes hold word for word, under the label that says it is quoted from them", () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, transactionReferences: [KAI] });
    expect(out).toContain(`<TRANSACTION_LINKS>\n${DERIVED_LABELS.transactionLinks}\n`);
    expect(DERIVED_LABELS.transactionLinks).toMatch(/quoted from the director's notes/);
    expect(out).toContain('- "Kai was seen handing Blake an envelope at the Valet desk." → [account: Cass | amount: $450,000 | time: 09:40 PM] (high)');
  });

  it('prints nothing of a stored link whose observation the notes do not hold: not its words, not its sales', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, transactionReferences: [KAI, MODEL_WORDS] });
    expect(out).not.toContain('coordinate a sale');
    expect(out).not.toContain('RW');
    expect(out).not.toContain('$400,000');
    expect(out.match(/^- "/gm)).toHaveLength(1);
  });

  it('prints no <TRANSACTION_LINKS> block when the notes hold none of the stored observations', () => {
    const out = renderDirectorEnrichmentBlock({ rawProse: PROSE, transactionReferences: [MODEL_WORDS, { linkedTransactions: [], confidence: 'low' }, null] });
    expect(out).not.toContain('TRANSACTION_LINKS');
  });

  it('reads the notes as the enricher does: an observation retyped with a different dash or line break is the same words', () => {
    const out = renderDirectorEnrichmentBlock({
      rawProse: PROSE,
      transactionReferences: [{ excerpt: 'Remi kept to the bar \u2014 all night.', linkedTransactions: [], confidence: 'low' }]
    });
    expect(out).toContain('- "Remi kept to the bar \u2014 all night." → [no link] (low)');
  });
});
