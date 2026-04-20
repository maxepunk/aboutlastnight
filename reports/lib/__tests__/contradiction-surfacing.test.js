describe('surfaceContradictions', () => {
  const { surfaceContradictions } = require('../workflow/nodes/contradiction-nodes')._testing;

  test('flags named shell accounts matching roster members', () => {
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

    const result = surfaceContradictions(state);
    const tensions = result.narrativeTensions.tensions;

    // Skyler gets transparency-vs-burial (NOT named-account)
    const transparencyTensions = tensions.filter(t => t.type === 'transparency-vs-burial');
    expect(transparencyTensions.length).toBe(1);
    expect(transparencyTensions[0].character).toBe('Skyler');
    expect(transparencyTensions[0].publicBehavior).toContain('nothing to hide');
    expect(transparencyTensions[0].burialData.total).toBe(155000);

    // Alex and Mel get named-account
    const namedAccounts = tensions.filter(t => t.type === 'named-account');
    expect(namedAccounts.length).toBe(2); // Alex and Mel only
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
    const result = surfaceContradictions(state);
    expect(result.narrativeTensions).toBeDefined();
    // transactionReferences pass through state unchanged (not consumed by this node directly)
    expect(state.directorNotes.transactionReferences[0].linkedTransactions[0].tokenId).toBe('tay004');
  });
});
