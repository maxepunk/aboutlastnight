/**
 * The record view (phase 2, brief 2.1; wave-1 ruling R1).
 *
 * One renderer turns the evidence bundle into the <RECORD> section every writer
 * reads: each exposed document in its own labelled tag with its full text, and the
 * buried memories as sales only, on the morning timeline (phase 3, brief 3.5).
 */

const {
  renderRecordView,
  renderRecordDocuments,
  renderMorningTimeline,
  recordIdOf,
  DOCUMENT_POINTER
} = require('../prompt-renderers/record-view');
// Phase 4b (brief 1B; R10): the fact check's source map is lib/evidence.js documentTextsOf.
const { documentTextsOf: buildSourceMap } = require('../evidence');

const ALEX_TEXT = 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Again. Worth it. Finally worth it.';
const TEST_TEXT = 'DDC - DNA Diagnostics Center\nCertainty Non-Invasive Prenatal Paternity Test\nResult: 99.9% & "conclusive"';

/** An exposed memory as curation builds it (routeTokensByDisposition). */
function bundleToken(overrides = {}) {
  return {
    id: 'ale003',
    sourceType: 'memory-token',
    owner: 'Riley',                       // the preprocessor's ownerLogline guess: never rendered
    summary: 'Alex memory: fight with Marcus',
    fullContent: ALEX_TEXT,
    content: ALEX_TEXT,
    characterRefs: ['Marcus'],
    temporalContext: 'PARTY',
    rawData: {
      notionId: 'n-ale003',
      tokenId: 'ale003',
      name: 'ALE003 - Alex’s fight with Marcus',
      fullDescription: ALEX_TEXT,
      summary: 'Notion one-liner',
      basicType: 'Memory Token Video',
      owners: ['Alex Reeves']
    },
    ...overrides
  };
}

/** A paper document as curation builds it: the raw Notion record spread, plus id. */
function bundlePaper(overrides = {}) {
  return {
    notionId: 'p-test-1',
    name: 'Paternity test',
    basicType: 'Document',
    description: TEST_TEXT,
    narrativeThreads: ['Marriage Troubles'],
    owners: ['Sarah Blackwood'],
    id: 'p-test-1',
    fullContent: TEST_TEXT,
    sourceType: 'paper-evidence',
    temporalContext: 'BACKGROUND',
    ...overrides
  };
}

/** A rescued paper item (processRescuedItems): the raw record, no id, no fullContent. */
function rescuedPaper() {
  return {
    notionId: 'p-rescued-9',
    name: 'Rescued letter',
    basicType: 'Prop',
    description: 'Dear Marcus, I know what you did.',
    owners: [],
    rescuedByHuman: true
  };
}

function bundle({ tokens = [bundleToken()], paper = [bundlePaper()], transactions = [] } = {}) {
  return {
    exposed: { tokens, paperEvidence: paper },
    buried: { transactions, relationships: [] }
  };
}

describe('record view: document tags', () => {
  it('renders an exposed memory as one labelled tag with its full text as the body', () => {
    const out = renderRecordDocuments(bundle({ paper: [] }));
    expect(out).toBe(
      '<document id="ale003" kind="memory" name="ALE003 - Alex’s fight with Marcus" owner="Alex Reeves" layer="exposed">\n' +
      ALEX_TEXT + '\n' +
      '</document>'
    );
  });

  it('takes the owner from the record\'s own owners[], never the bundle\'s derived owner', () => {
    const out = renderRecordDocuments(bundle({ paper: [] }));
    expect(out).toContain('owner="Alex Reeves"');
    expect(out).not.toContain('Riley');
  });

  it('gives a paper document its basicType as kind, and joins several owners', () => {
    const out = renderRecordDocuments(bundle({
      tokens: [],
      paper: [bundlePaper({ owners: ['Sarah Blackwood', 'Alex Reeves'] })]
    }));
    expect(out).toContain('<document id="p-test-1" kind="Document" name="Paternity test" owner="Sarah Blackwood, Alex Reeves" layer="exposed">');
  });

  it('leaves out an attribute the record has no value for, never guessing one', () => {
    const out = renderRecordDocuments(bundle({
      tokens: [],
      paper: [bundlePaper({ owners: [], basicType: undefined })]
    }));
    expect(out).toContain('<document id="p-test-1" name="Paternity test" layer="exposed">');
    expect(out).not.toMatch(/owner=/);
    expect(out).not.toMatch(/kind=/);
  });

  it('drops the relation layer\'s "Unknown" placeholder rather than printing it as an owner', () => {
    const out = renderRecordDocuments(bundle({
      tokens: [bundleToken({ rawData: { ...bundleToken().rawData, owners: ['Unknown'] } })],
      paper: []
    }));
    expect(out).not.toMatch(/owner=/);
  });

  it('escapes " and & in attribute values, and leaves the body text as the record has it', () => {
    const out = renderRecordDocuments(bundle({
      tokens: [],
      paper: [bundlePaper({ name: 'Lab "B" & C' })]
    }));
    expect(out).toContain('name="Lab &quot;B&quot; &amp; C"');
    // The body is what a card copies word for word; escaping it would break the copy.
    expect(out).toContain('Result: 99.9% & "conclusive"');
  });

  it('never truncates the text', () => {
    const long = 'A'.repeat(5000) + ' the end.';
    const out = renderRecordDocuments(bundle({
      tokens: [bundleToken({ rawData: { ...bundleToken().rawData, fullDescription: long } })],
      paper: []
    }));
    expect(out).toContain(long);
  });

  it('never lets a summary stand in for the text', () => {
    const out = renderRecordDocuments(bundle());
    expect(out).not.toContain('Alex memory: fight with Marcus');
    expect(out).not.toContain('Notion one-liner');
  });

  it('says so when the record holds no text for a document', () => {
    const out = renderRecordDocuments(bundle({ tokens: [], paper: [bundlePaper({ description: '', fullContent: 'Paternity test' })] }));
    expect(out).toContain('<document id="p-test-1"');
    expect(out).toContain('(The record holds no text for this document.)');
  });

  it('renders a rescued paper item with its Notion id and its description as text', () => {
    const out = renderRecordDocuments(bundle({ tokens: [], paper: [rescuedPaper()] }));
    expect(out).toBe(
      '<document id="p-rescued-9" kind="Prop" name="Rescued letter" layer="exposed">\n' +
      'Dear Marcus, I know what you did.\n' +
      '</document>'
    );
  });

  it('lists memories first, then paper documents, each once', () => {
    const out = renderRecordDocuments(bundle({ paper: [bundlePaper(), rescuedPaper()] }));
    const ids = [...out.matchAll(/<document id="([^"]+)"/g)].map(m => m[1]);
    expect(ids).toEqual(['ale003', 'p-test-1', 'p-rescued-9']);
  });
});

describe('record view: the id rule', () => {
  it('is id, else tokenId, else notionId', () => {
    expect(recordIdOf({ id: 'a', tokenId: 'b', notionId: 'c' })).toBe('a');
    expect(recordIdOf({ tokenId: 'b', notionId: 'c' })).toBe('b');
    expect(recordIdOf({ notionId: 'c', name: 'n' })).toBe('c');
    expect(recordIdOf({ name: 'n' })).toBeNull();
  });

  it('names every document by a key the fact check\'s source map uses, with the same text', () => {
    // A card's tokenId must name a document the writer can see (brief 2.1 invariant).
    const b = bundle({ paper: [bundlePaper(), rescuedPaper()] });
    const out = renderRecordDocuments(b);
    const sourceMap = buildSourceMap(b);
    const docs = [...out.matchAll(/<document id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/document>/g)];
    expect(docs).toHaveLength(3);
    for (const [, id, body] of docs) {
      expect(sourceMap.has(id)).toBe(true);
      expect(sourceMap.get(id)).toBe(body);
    }
  });
});

describe('record view: buried memories reach the timeline as sales only', () => {
  const transactions = [
    { sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' },
    { sourceType: 'memory-token', shellAccount: 'Deez', amount: '$225,000', time: '08:00 PM', temporalContext: 'INVESTIGATION' }
  ];

  it('prints each sale on one line: time, account, amount (phase 3: the timeline replaced <buried-transactions>)', () => {
    const out = renderMorningTimeline(bundle({ transactions }), {});
    expect(out).toContain(
      '- 07:50 AM | sale | account: Melanie | amount: $75,000\n' +
      '- 08:00 AM | sale | account: Deez | amount: $225,000\n' +
      '</morning-timeline>'
    );
  });

  it('carries no id, owner or text, even when a malformed item holds them', () => {
    const leaky = {
      id: 'ril001', tokenId: 'ril001', owner: 'Riley Chen', owners: ['Riley Chen'],
      name: 'RIL001 - Riley knows about the paternity test',
      fullDescription: 'Riley saw the test result.', summary: 'Riley knows',
      shellAccount: 'Melanie', amount: 75000, time: '07:50 PM'
    };
    const out = renderRecordView(bundle({ tokens: [], paper: [], transactions: [leaky] }));
    expect(out).toContain('- 07:50 AM | sale | account: Melanie | amount: $75,000');
    for (const secret of ['ril001', 'Riley', 'RIL001', 'paternity', 'saw the test']) {
      expect(out).not.toContain(secret);
    }
  });

  it('marks a missing field, and skips a row with no account, amount or time (a memory never sold)', () => {
    const out = renderMorningTimeline(bundle({
      transactions: [
        { shellAccount: 'Jinin', amount: null, time: '09:10 PM' },
        { shellAccount: null, amount: null, time: null }
      ]
    }), {});
    expect(out.split('\n').slice(2)).toEqual([
      '- 09:10 AM | sale | account: Jinin | amount: (not recorded)',
      '</morning-timeline>'
    ]);
  });

  it('says (none) when nothing was sold or exposed', () => {
    expect(renderMorningTimeline(bundle(), {})).toMatch(/\n\(none\)\n<\/morning-timeline>$/);
  });
});

describe('record view: the whole view', () => {
  it('is one <RECORD> section holding the documents, then the morning timeline', () => {
    const out = renderRecordView(bundle({
      transactions: [{ shellAccount: 'Melanie', amount: 75000, time: '07:50 PM' }]
    }));
    expect(out.startsWith('<RECORD>\n')).toBe(true);
    expect(out.endsWith('\n</RECORD>')).toBe(true);
    expect(out.match(/<RECORD>/g)).toHaveLength(1);
    expect(out.indexOf('<document id="ale003"')).toBeLessThan(out.indexOf('<document id="p-test-1"'));
    expect(out.indexOf('<document id="p-test-1"')).toBeLessThan(out.indexOf('<morning-timeline>\n'));
    expect(out).toContain(renderRecordDocuments(bundle()));
  });

  it('takes the documents alone when the prompt lists the buried transactions itself (R2; the arc writer and judge until 3.3 and 3.4)', () => {
    const out = renderRecordView(bundle({
      transactions: [{ shellAccount: 'Melanie', amount: 75000, time: '07:50 PM' }]
    }), { buried: false });
    expect(out).toContain('<document id="ale003"');
    expect(out).not.toContain('morning-timeline');
    expect(out).not.toContain('Melanie');
  });

  it('renders an empty bundle as an empty record, not as nothing', () => {
    for (const empty of [{}, null, undefined, { exposed: {}, buried: {} }]) {
      const out = renderRecordView(empty);
      expect(out).toContain('<RECORD>');
      expect(out).toContain('(The record holds no exposed documents.)');
      expect(out).toMatch(/<morning-timeline>\n[^\n]+\n\(none\)\n<\/morning-timeline>/);
      expect(out).not.toContain('<document');
    }
  });

  it('exports the one pointer wording every instruction uses (R1)', () => {
    expect(DOCUMENT_POINTER).toBe('the document with that id in <RECORD>');
  });
});
