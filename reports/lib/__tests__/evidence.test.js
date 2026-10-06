/**
 * The evidence underneath (phase 4b, piece 1, brief 1B; spec 2026-10-05 sections 3, 5 and 6.1).
 *
 * A thread, a connection and a beat each carry the pieces of the record that tell them. One
 * module, lib/evidence.js, holds what the weave and the map share: a piece's shape, the sources a
 * piece may name besides a document, the stances, the evidence check, the story-terms check over a
 * writer's line, and the one function from a document id to its text (documentTextsOf, which was
 * the article fact check's buildSourceMap).
 *
 * The record below is in 100226's shape (memories, a paper document, a sale into an account, an
 * exposure on the evidence log), with invented text: the repo is public.
 */

const Ajv = require('ajv');
const {
  EVIDENCE_SOURCES, EVIDENCE_STANCES, EVIDENCE_PIECE_SCHEMA,
  evidenceProblems, storyTermsProblems, describeStoryTerms, STORY_TERMS_FIX,
  documentTextsOf, documentIdsOf, evidenceContextOf
} = require('../evidence');

const clone = (v) => JSON.parse(JSON.stringify(v));

const JES = 'JES002 - 11:05PM - Jess tells Sarah: "You know he tests every batch on himself first."';
const SAM = 'SAM001 - 10:12PM - Sam reads the journal over Marcus’s shoulder. “I think he is trying the new batch on himself,” Sam writes in the margin.';
const EMAIL = 'From Marcus to Quinn: raise the dose for the pilot.\nThe board wants the results by Friday.';

/** The curated bundle: two exposed memories, a paper email, and one buried memory sold into an account. */
function bundle() {
  return {
    exposed: {
      tokens: [
        { id: 'jes002', tokenId: 'jes002', fullContent: JES, summary: 'Jess warns Sarah', rawData: { tokenId: 'jes002', fullDescription: JES, owners: ['Jess Moreau'] } },
        { id: 'sam001', tokenId: 'sam001', fullContent: SAM, summary: 'Sam watches Marcus', rawData: { tokenId: 'sam001', fullDescription: SAM, owners: ['Sam Okafor'] } }
      ],
      paperEvidence: [
        { notionId: 'p-email', id: 'p-email', pageId: 'page-7731', name: 'Email to Quinn', description: EMAIL, fullContent: EMAIL }
      ]
    },
    buried: {
      transactions: [
        { id: 'kai009', tokenId: 'kai009', sourceType: 'memory-token', shellAccount: 'Rich', amount: 150000, time: '09:58 PM', summary: 'Kai hides the vial' }
      ]
    }
  };
}

/** A state at the story meeting: the bundle, the evidence log, the director's words. */
function state() {
  return {
    evidenceBundle: bundle(),
    sessionConfig: {
      accusationRaw: 'Ten votes for an accidental overdose; two for Alex.',
      exposures: [{ tokenId: 'jes002', exposer: 'NovaNews (Anonymous)', time: '09:56 PM' }]
    },
    directorNotes: { rawProse: 'Alex asked the room, "Could it be that Marcus dosed us all?" Then the vote.' },
    inputReviewCorrections: ['Quinn spoke first at the vote, not Alex.'],
    weave: {
      threads: [],
      questions: [{ id: 'q1', kind: 'player', about: 'Remi', question: 'What did Remi do?', changes: 'Where Remi appears.', answer: 'Remi kept the door all night.' }]
    }
  };
}

const context = () => evidenceContextOf(state());
const problemsOf = (pieces) => evidenceProblems(pieces, context());
const piece = (sources, shows, stance = 'supports') => ({ sources, shows, stance });

describe("a piece's shape (EVIDENCE_PIECE_SCHEMA)", () => {
  const validate = new Ajv({ allErrors: true, strict: true }).compile(EVIDENCE_PIECE_SCHEMA);
  const valid = (value) => (validate(value) ? 'valid' : JSON.stringify(validate.errors.map((e) => `${e.instancePath} ${e.message}`)));

  it('is its sources, what it shows and its stance, with a card flag only a beat\'s piece uses', () => {
    expect(Object.keys(EVIDENCE_PIECE_SCHEMA.properties)).toEqual(['sources', 'shows', 'stance', 'card']);
    expect(EVIDENCE_PIECE_SCHEMA.required).toEqual(['sources', 'shows', 'stance']);
    expect(EVIDENCE_PIECE_SCHEMA.properties.sources).toMatchObject({ type: 'array', items: { type: 'string' }, minItems: 1 });
    expect(EVIDENCE_PIECE_SCHEMA.properties.stance.enum).toEqual([...EVIDENCE_STANCES]);
    expect(EVIDENCE_PIECE_SCHEMA.properties.card.type).toBe('boolean');
  });

  it('compiles in strict mode, takes one or more sources, and refuses none, a missing line or another stance', () => {
    expect(valid(piece(['jes002'], 'Jess says he tests every batch on himself.'))).toBe('valid');
    expect(valid(piece(['ledger', 'evidence-log'], 'Five sales into Rich two minutes after the warning was turned in.', 'cuts-against'))).toBe('valid');
    expect(valid({ ...piece(['sam001'], 'The journal.'), card: true })).toBe('valid');
    expect(valid(piece([], 'Nothing named.'))).not.toBe('valid');
    expect(valid({ sources: ['jes002'], stance: 'supports' })).not.toBe('valid');
    expect(valid(piece(['jes002'], 'x', 'proves'))).not.toBe('valid');
  });

  it('the sources besides a document are the ledger, the evidence log and the director\'s notes; the stances, supports and cuts against', () => {
    expect(EVIDENCE_SOURCES).toEqual({ LEDGER: 'ledger', EVIDENCE_LOG: 'evidence-log', NOTES: 'notes' });
    expect(Object.isFrozen(EVIDENCE_SOURCES)).toBe(true);
    expect([...EVIDENCE_STANCES]).toEqual(['supports', 'cuts-against']);
    expect(Object.isFrozen(EVIDENCE_STANCES)).toBe(true);
  });

  it('its descriptions carry no em-dash and name no theme', () => {
    const text = JSON.stringify(EVIDENCE_PIECE_SCHEMA);
    expect(text).not.toMatch(/[–—]/);
    expect(text).not.toMatch(/Nova|NovaNews|detective/i);
    Object.values(EVIDENCE_SOURCES).forEach((source) => expect(EVIDENCE_PIECE_SCHEMA.properties.sources.description).toContain(`"${source}"`));
  });
});

describe('documentTextsOf: a document id to its text (the fact check\'s buildSourceMap, moved)', () => {
  it('enters each exposed document under every id it answers to, its name among them, with its quotable text', () => {
    const texts = documentTextsOf(bundle());
    ['jes002', 'sam001', 'p-email', 'page-7731', 'Email to Quinn'].forEach((id) => expect(texts.has(id)).toBe(true));
    expect(texts.get('jes002')).toBe(JES);
    expect(texts.get('page-7731')).toBe(EMAIL);
  });

  it('never a summary, and never a buried memory', () => {
    const texts = documentTextsOf(bundle());
    expect([...texts.values()].join('\n')).not.toMatch(/Jess warns Sarah|Kai hides the vial/);
    expect(texts.has('kai009')).toBe(false);
    expect(documentTextsOf(null).size).toBe(0);
  });
});

describe('the evidence check (evidenceProblems)', () => {
  it('passes a piece whose sources the record holds, in any case, and whose quotation its source holds', () => {
    expect(problemsOf([
      piece(['JES002'], 'Jess tells Sarah, "You know he tests every batch on himself first."'),
      piece(['ledger', 'evidence-log'], 'A sale into Rich two minutes after the warning was turned in.', 'cuts-against'),
      piece(['notes'], 'Alex asks, "Could it be that Marcus dosed us all?"'),
      piece(['Email to Quinn'], 'Marcus asks Quinn to "raise the dose for the pilot".')
    ])).toEqual([]);
  });

  it('fires on a source the record lacks, naming the piece and the source, and saying how to name one', () => {
    const [problem, ...rest] = problemsOf([piece(['jes002'], 'Fine.'), piece(['zzz999', 'ledger'], 'A memory no one turned in.')]);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ index: 1, kinds: ['source'] });
    expect(problem.what).toMatch(/"zzz999"/);
    expect(problem.what).toMatch(/no document in <RECORD>/);
    expect(problem.fix).toMatch(/"ledger", "evidence-log" or "notes"/);
  });

  // Review focus 5: a quotation that differs in its words fails, naming the piece and its source.
  it('fires on a quotation its source does not hold word for word', () => {
    const [problem] = problemsOf([piece(['jes002'], 'Jess tells Sarah, "You know he tests each batch on himself first."')]);
    expect(problem).toMatchObject({ index: 0, kinds: ['quotation'] });
    expect(problem.what).toContain('"You know he tests each batch on himself first."');
    expect(problem.fix).toMatch(/word for word/);
  });

  // Review focus 5: a quotation that differs only in its quotation marks, case or spacing is word for word.
  it.each([
    ['curly marks for straight ones', 'Jess, “You know he tests every batch on himself first.”'],
    ['straight marks for curly ones, in another case', 'Sam writes, "i think he is trying the new batch on himself,"'],
    ['single marks for double ones', "Jess, 'You know he tests every batch on himself first.'"],
    ['doubled spaces and a tab', 'Jess, "You know he tests  every\tbatch on himself first."']
  ])('is silent on a quotation that differs only in %s', (_name, shows) => {
    const source = /Sam/.test(shows) ? 'sam001' : 'jes002';
    expect(problemsOf([piece([source], shows)])).toEqual([]);
  });

  it('reads a quotation across a line break of its source, and each part of an elided quotation', () => {
    expect(problemsOf([piece(['p-email'], 'Marcus writes, "raise the dose for the pilot. The board wants the results by Friday."')])).toEqual([]);
    expect(problemsOf([piece(['sam001'], 'Sam writes, "I think he is trying ... on himself"')])).toEqual([]);
    expect(problemsOf([piece(['sam001'], 'Sam writes, "I think he is trying ... on everyone"')])).toHaveLength(1);
  });

  it('reads a quotation in any of the piece\'s sources, and only in them', () => {
    expect(problemsOf([piece(['ledger', 'jes002'], 'Jess, "You know he tests every batch on himself first."')])).toEqual([]);
    expect(problemsOf([piece(['sam001'], 'Jess, "You know he tests every batch on himself first."')])).toHaveLength(1);
  });

  it("reads the director's notes, corrections, accusation and answers as the notes' words", () => {
    expect(problemsOf([
      piece(['notes'], 'The correction: "Quinn spoke first at the vote, not Alex."'),
      piece(['notes'], 'The accusation: "Ten votes for an accidental overdose"'),
      piece(['notes'], 'The answer: "Remi kept the door all night."')
    ])).toEqual([]);
  });

  // A buried memory is never a source, and the line that says so reads as any other unknown
  // source's: it names the id the writer gave and nothing the record keeps of the memory.
  it('fires on a buried memory as a source, worded as any source the record lacks', () => {
    const [problem] = problemsOf([piece(['kai009'], 'Kai sold the memory.')]);
    expect(problem).toMatchObject({ index: 0, kinds: ['source'] });
    expect(problem.what).toBe(problemsOf([piece(['zzz999'], 'x')])[0].what.replace('zzz999', 'kai009'));
    expect(`${problem.what} ${problem.fix}`).not.toMatch(/buried|Rich|vial|150,000/i);
  });

  it('a buried memory stays out even when a careless upstream lists it as a document', () => {
    const ctx = context();
    ctx.documents = new Map([...ctx.documents, ['kai009', 'KAI009 - Kai hides the vial.']]);
    expect(evidenceProblems([piece(['kai009'], 'Kai hides "the vial".')], ctx).map((p) => p.kinds)).toEqual([['source']]);
  });

  it('fires once on a piece with no sources, no line or another stance, saying what it lacks', () => {
    const problems = problemsOf([{ sources: [], shows: 'Nothing.', stance: 'supports' }, { sources: ['jes002'], stance: 'supports' }, piece(['jes002'], 'x', 'proves'), 'not a piece']);
    expect(problems.map((p) => [p.index, p.kinds])).toEqual([[0, ['malformed']], [1, ['malformed']], [2, ['malformed']], [3, ['malformed']]]);
    expect(problems[0].what).toMatch(/its sources/);
    expect(problems[1].what).toMatch(/what it shows/);
    expect(problems[2].what).toMatch(/its stance/);
  });

  it('is one problem per failing piece, naming every fault it has', () => {
    const [problem, ...rest] = problemsOf([piece(['zzz999', 'jes002'], 'Jess, "words Jess never said"')]);
    expect(rest).toEqual([]);
    expect(problem.kinds).toEqual(['source', 'quotation']);
    expect(problem.what).toMatch(/"zzz999".*"words Jess never said"/);
  });

  it('reads no evidence in a value that is not a list', () => {
    expect(problemsOf(undefined)).toEqual([]);
    expect(problemsOf({ sources: ['zzz999'] })).toEqual([]);
  });
});

describe('the story-terms check (storyTermsProblems)', () => {
  const terms = (text) => storyTermsProblems(text, context());

  // Review focus 2: what it flags.
  it.each([
    ['a document id the record holds', 'Jess warns Sarah in jes002.', 'document-id', 'jes002'],
    ['a document id in another case', 'SAM001 shows the journal.', 'document-id', 'SAM001'],
    ['a quotation in quotation marks', 'The room heard "Tonight is the test run" and voted.', 'quotation', '"Tonight is the test run"'],
    ['a quotation in single marks', "Quinn said 'not here' and left.", 'quotation', "'not here'"],
    ['a clock time', 'The sales came at 9:58.', 'clock-time', '9:58'],
    ['a clock time with its half of the day', 'The vote closed at 10:18 AM.', 'clock-time', '10:18 AM'],
    ['an hour with its half of the day, dotted', 'The party began at 8 p.m. sharp.', 'clock-time', '8 p.m.'],
    ['a money figure', 'Rich took $450,000 for it.', 'money', '$450,000'],
    ['a money figure in millions', 'The board paid $1.2 million.', 'money', '$1.2 million']
  ])('fires on %s', (_name, text, kind, excerpt) => {
    expect(terms(text)).toEqual([{ kind, excerpt }]);
  });

  // Review focus 2: what it reads as story terms.
  it.each([
    ['a possessive name', "Marcus's own dosing: he had been testing the batch on himself."],
    ['another possessive', "Kai's quarrel with Remi."],
    ['numbers in words', 'Ten votes called it an accident, five to four on the second count.'],
    ['a thread named for a line of the room', 'Reality is negotiable'],
    ['a plural possessive and a contraction', "The players' votes say they're done."],
    ['a count beside a word that opens like a half of the day', 'Rich took 2 amounts in 10 minutes.'],
    ['a paper document by its name', 'The email to Quinn asks for a higher dose.']
  ])('is silent on %s', (_name, text) => {
    expect(terms(text)).toEqual([]);
  });

  it('reads an id only as a whole word, and names each hit once, in the order the line holds them', () => {
    expect(terms('The batch sam0012 is no document.')).toEqual([]);
    expect(terms('At 9:58 Rich took $450,000, and at 9:58 again "the rest".')).toEqual([
      { kind: 'clock-time', excerpt: '9:58' }, { kind: 'money', excerpt: '$450,000' }, { kind: 'quotation', excerpt: '"the rest"' }
    ]);
  });

  it('says what a line holds, and how to fix it, in one place for the weave and the map', () => {
    expect(describeStoryTerms(terms('At 9:58 Rich took $450,000 in jes002.'))).toBe('holds the clock time "9:58", the money figure "$450,000" and the document id "jes002"');
    expect(describeStoryTerms(terms('"Not here," said Quinn.'))).toBe('holds the quotation "Not here,"');
    expect(STORY_TERMS_FIX).toMatch(/story terms/);
    expect(STORY_TERMS_FIX).toMatch(/C16 \(<craft-story>\)/);
    expect(STORY_TERMS_FIX).not.toMatch(/[–—]/);
  });

  it('is silent on a line that is not text', () => {
    expect(storyTermsProblems(undefined, context())).toEqual([]);
    expect(storyTermsProblems('', context())).toEqual([]);
  });
});

describe('evidenceContextOf: what the checks read a piece against', () => {
  it("reads the documents, the ids a line may not name, the ledger's and the evidence log's rows, and the director's words", () => {
    const ctx = context();
    expect(ctx.documents.get('jes002')).toBe(JES);
    expect([...ctx.documentIds].sort()).toEqual(['jes002', 'p-email', 'page-7731', 'sam001']);
    expect(ctx.texts.ledger.join('\n')).toMatch(/Rich/);
    expect(ctx.texts.ledger.join('\n')).toMatch(/\$150,000/);
    expect(ctx.texts['evidence-log'].join('\n')).toMatch(/jes002/);
    expect(ctx.texts.notes).toEqual([
      state().directorNotes.rawProse, state().inputReviewCorrections[0], state().sessionConfig.accusationRaw, 'Remi kept the door all night.'
    ]);
  });

  it('knows the buried memories by every id their rows carry, and their rows reach it only as sales', () => {
    const ctx = context();
    expect([...ctx.buried]).toEqual(['kai009']);
    expect(JSON.stringify(ctx.texts)).not.toMatch(/kai009|Kai hides the vial/);
  });

  it('reads an empty state as an empty record', () => {
    const ctx = evidenceContextOf({});
    expect(ctx.documents.size).toBe(0);
    expect(ctx.texts).toEqual({ ledger: [], 'evidence-log': [], notes: [] });
    expect(evidenceProblems([piece(['jes002'], 'x')], ctx)).toHaveLength(1);
  });
});

describe('documentIdsOf: the ids, never the names', () => {
  it('lists each id a document answers to, and leaves out its name', () => {
    expect([...documentIdsOf(bundle())].sort()).toEqual(['jes002', 'p-email', 'page-7731', 'sam001']);
    expect(documentIdsOf(clone({}))).toEqual(new Set());
  });
});
