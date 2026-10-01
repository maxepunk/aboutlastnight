describe('surfaceContradictions', () => {
  const { surfaceContradictions } = require('../workflow/nodes/contradiction-nodes')._testing;

  test('an account named after a roster character produces no claim about its holder (phase 3, 3.6; T4)', () => {
    // An account's name is a message its seller chose: a joke, a borrowed identity,
    // the seller's own name or a frame. The named-account and transparency tensions
    // read it as the character's own account ("used their own name ... a deliberate
    // choice to be identifiable"); 26 sessions on disk have such an account.
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Skyler', 'Alex', 'Mel', 'Remi'] },
      shellAccounts: [
        { name: 'Skyler', total: 155000, tokenCount: 2 },
        { name: 'Burns', total: 1300000, tokenCount: 7 },
        { name: 'Alex', total: 775000, tokenCount: 4 },
        { name: 'Mel', total: 810000, tokenCount: 5 }
      ],
      directorNotes: {
        rawProse: 'Skyler was the first to submit information to Nova, boldly declaring he had nothing to hide',
        transactionReferences: []
      }
    };

    const { tensions } = surfaceContradictions(state).narrativeTensions;
    expect(tensions).toEqual([]);
    const json = JSON.stringify(tensions);
    ['used their own name', 'deliberate choice', 'identifiable', 'maintaining', 'transparency'].forEach((claim) => expect(json).not.toContain(claim));
  });

  test('does NOT flag anonymous accounts as roster matches', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Sarah', 'Morgan'] },
      shellAccounts: [
        { name: 'Burns', total: 1300000, tokenCount: 7 },
        { name: 'Daisy', total: 1312500, tokenCount: 3 }
      ],
      directorNotes: { rawProse: '', transactionReferences: [] }
    };

    const result = surfaceContradictions(state);
    const namedAccounts = result.narrativeTensions.tensions.filter(t => t.type === 'named-account');
    expect(namedAccounts.length).toBe(0);
  });

  test('does NOT reference specific token IDs or buried content', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Skyler'] },
      shellAccounts: [{ name: 'Skyler', total: 155000, tokenCount: 2 }],
      directorNotes: { rawProse: '', transactionReferences: [] }
    };

    const result = surfaceContradictions(state);
    const json = JSON.stringify(result.narrativeTensions);
    expect(json).not.toMatch(/sky\d{3}/);
    expect(json).not.toContain('tokenId');
  });

  test('skips if narrativeTensions already exists', () => {
    const state = { narrativeTensions: { tensions: [] } };
    const result = surfaceContradictions(state);
    expect(result.narrativeTensions).toBeUndefined();
  });

  test('flags Blake-proximity patterns', () => {
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Jamie'] },
      shellAccounts: [],
      directorNotes: {
        rawProse: 'Jamie discussed literature with Blake several times',
        transactionReferences: []
      }
    };

    const result = surfaceContradictions(state);
    const blakeProx = result.narrativeTensions.tensions.filter(t => t.type === 'blake-proximity');
    expect(blakeProx.length).toBe(1);
    expect(blakeProx[0].observations[0]).toContain('Blake');
  });

  test("the Valet tension prints the director's own sentences, not a generic claim (phase 3, 3.6)", () => {
    // One sentence about Blake became "Director observed multiple characters
    // interacting with Blake", a claim the notes never made.
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Remi', 'Jamie'] },
      shellAccounts: [],
      directorNotes: {
        rawProse: 'Jamie read quietly. Blake to Remi: "Remi, I hope that we can work together. I may have acquired something for you." The Valet kept moving.',
        transactionReferences: []
      }
    };

    const [tension] = surfaceContradictions(state).narrativeTensions.tensions;
    expect(tension.type).toBe('blake-proximity');
    // A sentence that ends inside the director's quotation marks is not where the
    // director's sentence ends.
    expect(tension.observations).toEqual([
      'Blake to Remi: "Remi, I hope that we can work together. I may have acquired something for you."',
      'The Valet kept moving.'
    ]);
    expect(tension.narrativeNote).toContain('- Blake to Remi: "Remi, I hope that we can work together. I may have acquired something for you."');
    expect(tension.narrativeNote).toContain('- The Valet kept moving.');
    expect(tension.narrativeNote).not.toMatch(/multiple characters/);
    expect(tension.narrativeNote).not.toContain('Jamie read quietly.');
    expect(tension.narrativeNote).not.toContain('\u2014');
  });

  test("splits the notes into the director's sentences: a wrapped line stays whole, a paragraph break ends an open quote", () => {
    const { proseSentences } = require('../workflow/nodes/contradiction-nodes')._testing;
    expect(proseSentences('Blake told Vic that the room\nwas running out of time. Vic said "wait.\n\nThe Valet left.')).toEqual([
      'Blake told Vic that the room\nwas running out of time.',
      'Vic said "wait.',
      'The Valet left.'
    ]);
  });

  test('a CRLF paragraph break ends a sentence and an open quote, as an LF one does (3.6 fix batch, item 6)', () => {
    // Notes pasted from Windows carry CRLF. With one unclosed quotation mark, the
    // rest of the notes used to be one "sentence", and all of it printed in the
    // tension when it named Blake.
    const { proseSentences } = require('../workflow/nodes/contradiction-nodes')._testing;
    const lf = 'Vic said "wait.\n\nBlake left. Mel stayed.\n\nThe Valet returned.';
    const crlf = lf.replace(/\n/g, '\r\n');
    const sentences = ['Vic said "wait.', 'Blake left.', 'Mel stayed.', 'The Valet returned.'];
    expect(proseSentences(lf)).toEqual(sentences);
    expect(proseSentences(crlf)).toEqual(sentences);
    // A CRLF line wrap inside a sentence still keeps it whole.
    expect(proseSentences('Blake told Vic that the room\r\nwas running out of time.')).toEqual(['Blake told Vic that the room\r\nwas running out of time.']);
  });

  test('handles missing state fields gracefully', () => {
    const state = { narrativeTensions: null };
    const result = surfaceContradictions(state);
    expect(result.narrativeTensions.tensions).toEqual([]);
  });

  test('transactionReferences from enriched notes are available in state for downstream use', () => {
    // This test documents that pre-computed transaction refs survive into the contradiction
    // surfacing step's state. The current programmatic logic doesn't consume them directly,
    // but they're available for future checks and for downstream prompt assembly.
    const state = {
      narrativeTensions: null,
      sessionConfig: { roster: ['Kai'] },
      shellAccounts: [],
      directorNotes: {
        rawProse: 'Kai was seen with Blake.',
        transactionReferences: [{
          excerpt: 'Kai was seen with Blake',
          linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
          confidence: 'high'
        }]
      }
    };
    const originalTxRefs = JSON.parse(JSON.stringify(state.directorNotes.transactionReferences));
    const result = surfaceContradictions(state);

    // Node correctly produces tensions (Kai's Blake-proximity flag)
    expect(result.narrativeTensions).toBeDefined();
    expect(result.narrativeTensions.tensions.length).toBeGreaterThan(0);
    const blakeTension = result.narrativeTensions.tensions.find(t => t.type === 'blake-proximity');
    expect(blakeTension).toBeDefined();

    // Node does NOT mutate transactionReferences on the input state
    expect(state.directorNotes.transactionReferences).toEqual(originalTxRefs);

    // Node does NOT expose transactionReferences on its output (current contract — pure pass-through)
    expect(result.directorNotes).toBeUndefined();
  });
});
