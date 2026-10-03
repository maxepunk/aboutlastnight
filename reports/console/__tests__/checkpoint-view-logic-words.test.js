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
  characterIdLeaveOutTicks,
  characterIdsSkipPayload,
  arcNoteInitial
} = require('../checkpoint-view-logic');

describe('verdictView', () => {
  it('says a no-culprit verdict is one, so an empty accused is not "not parsed"', () => {
    expect(verdictView({ verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' }))
      .toEqual({ verdictKind: 'overdose', noCulprit: true, blamesNoCharacter: false, label: 'an overdose' });
    expect(verdictView({ verdictKind: 'accident' }).noCulprit).toBe(true);
    expect(verdictView({ verdictKind: 'self-harm' }).noCulprit).toBe(true);
    expect(verdictView({ verdictKind: 'other' }).noCulprit).toBe(true);
  });

  it('a culprit verdict names someone', () => {
    expect(verdictView({ verdictKind: 'culprit', accused: ['Vic'] }))
      .toEqual({ verdictKind: 'culprit', noCulprit: false, blamesNoCharacter: false, label: 'the room named a culprit' });
  });

  it('a parse from before verdict kinds, or an unknown kind, reports none', () => {
    expect(verdictView({ accused: ['Vic'] })).toEqual({ verdictKind: '', noCulprit: false, blamesNoCharacter: false, label: '' });
    expect(verdictView({ verdictKind: 'suicide-pact' })).toEqual({ verdictKind: '', noCulprit: false, blamesNoCharacter: false, label: '' });
    expect(verdictView(null)).toEqual({ verdictKind: '', noCulprit: false, blamesNoCharacter: false, label: '' });
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
    const view = exposuresView([{ exposer: 'Ashe' }, null, { tokenId: 'mel004' }], 1);
    expect(view).toEqual({ rows: [{ tokenId: 'mel004', exposer: '', time: '', owner: '' }], count: 1, noneExposed: false, logEmpty: false });
    expect(exposuresView(undefined, undefined)).toEqual({ rows: [], count: 0, noneExposed: false, logEmpty: false });
  });

  it('says every memory counts as buried from the exposed-memory list disposition reads, not the per-row log (fix batch, finding 4)', () => {
    const row = { tokenId: 'ale003', exposer: 'Ashe', time: '09:06 PM' };
    // exposedTokens empty: every memory is buried, whatever the per-row log holds.
    expect(exposuresView([], 0)).toMatchObject({ noneExposed: true, logEmpty: false });
    expect(exposuresView([row], 0)).toMatchObject({ noneExposed: true, count: 1 });
    // exposedTokens held memories: no alarm, and an empty per-row log is its own line.
    expect(exposuresView([], 3)).toMatchObject({ noneExposed: false, logEmpty: true });
    expect(exposuresView([row], 3)).toMatchObject({ noneExposed: false, logEmpty: false });
    // A parse from before the count: nothing to say about disposition.
    expect(exposuresView([], undefined)).toMatchObject({ noneExposed: false, logEmpty: true });
    expect(exposuresView(undefined, undefined)).toMatchObject({ noneExposed: false, logEmpty: false });
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

/**
 * The leave-out box (phase 4, brief 4.2): one "leave this photo out" box on each photo
 * card. The boxes start from the director's unsent ticks, else from the photos the
 * server already lists, and the payloads carry the ticked filenames.
 */
describe('the leave-out box (brief 4.2)', () => {
  const analyses = [{ filename: 'aln (7 of 9).jpg' }, { filename: 'aln (8 of 9).jpg' }, {}];
  const photos = ['p/aln (7 of 9).jpg', 'p/aln (8 of 9).jpg'];

  it('each card says whether the server lists its photo as left out, by basename whatever the case', () => {
    const cards = characterIdCards(analyses, photos, ['photos/ALN (8 OF 9).JPG']);
    expect(cards.map((c) => [c.key, c.leftOut])).toEqual([
      ['aln (7 of 9).jpg', false], ['aln (8 of 9).jpg', true], ['photo-2', false]
    ]);
    expect(characterIdCards(analyses, photos).map((c) => c.leftOut)).toEqual([false, false, false]);
  });

  it("the boxes start from the server's list, and a tick the director has not sent survives a remount", () => {
    const cards = characterIdCards(analyses, photos, ['aln (8 of 9).jpg']);
    expect(characterIdLeaveOutTicks(cards, undefined))
      .toEqual({ 'aln (7 of 9).jpg': false, 'aln (8 of 9).jpg': true, 'photo-2': false });
    // The stop's pendingEdits slot holds the director's ticks: they win over the list.
    expect(characterIdLeaveOutTicks(cards, { leftOut: { 'aln (7 of 9).jpg': true, 'aln (8 of 9).jpg': false } }))
      .toEqual({ 'aln (7 of 9).jpg': true, 'aln (8 of 9).jpg': false, 'photo-2': false });
  });

  it('Submit sends the ticked filenames beside the raw text and the descriptions, none when every box is clear', () => {
    const cards = characterIdCards(analyses, photos);
    const ticked = characterIdsPayload(cards, { 'aln (7 of 9).jpg': 'Kai at the bar.' }, { 'aln (8 of 9).jpg': true, 'photo-2': true });
    expect(ticked.leftOutPhotos).toEqual(['aln (8 of 9).jpg']);   // a card with no filename cannot be left out
    expect(ticked.photoDescriptions).toEqual({ 'aln (7 of 9).jpg': 'Kai at the bar.' });
    expect(characterIdsPayload(cards, {}, {}).leftOutPhotos).toEqual([]);
    expect(characterIdsPayload(cards, {}).leftOutPhotos).toEqual([]);
  });

  it('Skip sends no identifications, and still the ticked filenames', () => {
    const cards = characterIdCards(analyses, photos);
    expect(characterIdsSkipPayload(cards, { 'aln (7 of 9).jpg': true }))
      .toEqual({ characterIds: {}, leftOutPhotos: ['aln (7 of 9).jpg'] });
    expect(characterIdsSkipPayload(cards, {})).toEqual({ characterIds: {}, leftOutPhotos: [] });
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

// ── Phase 3, brief 3.5: the split vote and the institution verdict ──

const { votesView } = require('../checkpoint-view-logic');

describe('verdictView: a culprit verdict that names no character', () => {
  it('says the room blamed an institution or an unnamed person, so an empty accused is not "not parsed"', () => {
    expect(verdictView({ verdictKind: 'culprit', accused: [], charge: 'NeurAI\'s board' })).toEqual({
      verdictKind: 'culprit', noCulprit: false, blamesNoCharacter: true,
      label: 'the room blamed an institution or an unnamed person'
    });
  });

  it('a culprit parse with neither accused nor charge stays "not parsed" (fix batch, finding 6)', () => {
    expect(verdictView({ verdictKind: 'culprit', accused: [], charge: '' })).toEqual({
      verdictKind: 'culprit', noCulprit: false, blamesNoCharacter: false, label: 'the room named a culprit'
    });
    expect(verdictView({ verdictKind: 'culprit', accused: [] }).blamesNoCharacter).toBe(false);
  });
});

describe('votesView: the split final vote', () => {
  it('lists every option with its count, the adopted one marked', () => {
    expect(votesView({ votes: [{ option: 'Remi', count: 7, adopted: true }, { option: 'Vic', count: 4, adopted: false }] }))
      .toEqual({ split: true, line: 'Remi 7 (adopted by the group statement), Vic 4' });
  });

  it('says when the statement adopted none of them', () => {
    expect(votesView({ votes: [{ option: 'Alex', count: 4, adopted: false }, { option: 'Vic', count: 4, adopted: false }] }))
      .toEqual({ split: true, line: 'Alex 4, Vic 4 (the group statement adopted none of these)' });
  });

  it('is empty when there is no split vote', () => {
    expect(votesView({ accused: ['Vic'] })).toEqual({ split: false, line: '' });
    expect(votesView(null)).toEqual({ split: false, line: '' });
  });
});
