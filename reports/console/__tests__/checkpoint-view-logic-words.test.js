/**
 * The director's words at the stops (phase 2, brief 2.2): the pure view logic
 * behind the input review's verdict and exposures, the character-IDs payload and
 * its photo pairing, and the arc stop's note across a remount.
 *
 * The console has no DOM harness; the components are thin consumers of these.
 */
const {
  verdictView,
  exposuresView,
  characterIdCards,
  characterIdsPayload,
  arcNoteInitial
} = require('../checkpoint-view-logic');

describe('verdictView', () => {
  it('says a no-culprit verdict is one, so an empty accused is not "not parsed"', () => {
    expect(verdictView({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' }))
      .toEqual({ verdictKind: 'overdose', noCulprit: true, label: 'an overdose' });
    expect(verdictView({ verdictKind: 'accident' }).noCulprit).toBe(true);
    expect(verdictView({ verdictKind: 'self-harm' }).noCulprit).toBe(true);
    expect(verdictView({ verdictKind: 'other' }).noCulprit).toBe(true);
  });

  it('a culprit verdict names someone', () => {
    expect(verdictView({ verdictKind: 'culprit', accused: ['Vic'] }))
      .toEqual({ verdictKind: 'culprit', noCulprit: false, label: 'the room named a culprit' });
  });

  it('a parse from before verdict kinds, or an unknown kind, reports none', () => {
    expect(verdictView({ accused: ['Vic'] })).toEqual({ verdictKind: '', noCulprit: false, label: '' });
    expect(verdictView({ verdictKind: 'suicide-pact' })).toEqual({ verdictKind: '', noCulprit: false, label: '' });
    expect(verdictView(null)).toEqual({ verdictKind: '', noCulprit: false, label: '' });
  });
});

describe('exposuresView', () => {
  it('keeps each exposed memory\'s exposer, time and owner as parsed', () => {
    const view = exposuresView([
      { tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '09:06 PM', owner: 'Alex Reeves' },
      { tokenId: 'ash003', exposer: 'Ashe', time: '09:40 PM', owner: 'Ashe Motoko' }
    ]);
    expect(view.count).toBe(2);
    expect(view.rows[1]).toEqual({ tokenId: 'ash003', exposer: 'Ashe', time: '09:40 PM', owner: 'Ashe Motoko' });
  });

  it('drops rows with no token id and blanks the fields the log did not carry', () => {
    const view = exposuresView([{ exposer: 'Ashe' }, null, { tokenId: 'mel004' }]);
    expect(view).toEqual({ rows: [{ tokenId: 'mel004', exposer: '', time: '', owner: '' }], count: 1 });
    expect(exposuresView(undefined)).toEqual({ rows: [], count: 0 });
  });
});

describe('characterIdCards: pairing by filename, not by position', () => {
  const analyses = [
    { filename: 'aln (7 of 9).jpg', visualContent: 'two people at a table', characterDescriptions: [{ description: 'person in red', role: 'CENTRAL' }] },
    { filename: 'aln (1 of 9).jpg', visualContent: 'a group' }
  ];
  // The session photos arrive in another order than the analyses.
  const photos = ['C:/data/092026/photos/aln (1 of 9).jpg', 'C:/data/092026/photos/ALN (7 OF 9).JPG'];

  it('gives each analysis the thumbnail with its own filename', () => {
    const cards = characterIdCards(analyses, photos);
    expect(cards.map((c) => [c.filename, c.path])).toEqual([
      ['aln (7 of 9).jpg', 'C:/data/092026/photos/ALN (7 OF 9).JPG'],
      ['aln (1 of 9).jpg', 'C:/data/092026/photos/aln (1 of 9).jpg']
    ]);
    expect(cards[0].displayName).toBe('aln (7 of 9).jpg');
    expect(cards[0].analysis).toBe(analyses[0]);
  });

  it('a photo with no match gets no thumbnail rather than a neighbour\'s', () => {
    const cards = characterIdCards([{ filename: 'missing.jpg' }], photos);
    expect(cards[0].path).toBe('');
    expect(cards[0].displayName).toBe('missing.jpg');
  });

  it('an analysis with no filename still gets a card and a stable key', () => {
    const cards = characterIdCards([{}], photos);
    expect(cards[0]).toMatchObject({ key: 'photo-0', filename: '', displayName: 'Photo 1', path: '' });
  });
});

describe('characterIdsPayload', () => {
  const cards = characterIdCards([
    { filename: 'seven.jpg', visualContent: 'two people at a table', characterDescriptions: [{ description: 'person in red', role: 'CENTRAL' }] },
    { filename: 'one.jpg', visualContent: 'a group' }
  ], ['p/one.jpg', 'p/seven.jpg']);

  it('keeps the raw text the parser reads, under each photo\'s own filename', () => {
    const payload = characterIdsPayload(cards, { 'seven.jpg': 'Alex and Sam react to a memory they\'ve just unlocked.' });
    expect(payload.characterIdsRaw).toBe([
      'Photo seven.jpg:',
      '  AI Description: two people at a table',
      '  Character Descriptions: [person in red, role: CENTRAL]',
      '  User Input: Alex and Sam react to a memory they\'ve just unlocked.',
      'Photo one.jpg:',
      '  AI Description: a group'
    ].join('\n'));
  });

  it('sends each description word for word, keyed by filename, beside the raw text', () => {
    const payload = characterIdsPayload(cards, {
      'seven.jpg': '  Alex and Sam react to a memory they\'ve just unlocked.  ',
      'one.jpg': '   '
    });
    expect(payload.photoDescriptions).toEqual({
      'seven.jpg': 'Alex and Sam react to a memory they\'ve just unlocked.'
    });
  });

  it('omits photoDescriptions when every box is blank', () => {
    expect(characterIdsPayload(cards, {})).not.toHaveProperty('photoDescriptions');
  });
});

describe('arcNoteInitial: the arc stop keeps its note across a remount', () => {
  it('restores the note the director typed before the remount', () => {
    expect(arcNoteInitial('Keep the vote arc.', 'Last send-back note.')).toBe('Keep the vote arc.');
  });

  it('falls back to the send-back pre-fill in a new round (the slot is cleared)', () => {
    expect(arcNoteInitial(undefined, 'Last send-back note.')).toBe('Last send-back note.');
    expect(arcNoteInitial('', 'Last send-back note.')).toBe('Last send-back note.');
    expect(arcNoteInitial(undefined, undefined)).toBe('');
  });
});
