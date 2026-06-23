const { validateRosterEntry, knownCharacterList } = require('../await-roster-logic');

describe('validateRosterEntry (F1 capture validation)', () => {
  const canon = { Vic: 'Vic Kingsley', Sarah: 'Sarah Blackwood' };
  it('matches an exact canonical key', () => {
    expect(validateRosterEntry('Vic', canon)).toEqual({ matched: true, canonical: 'Vic Kingsley' });
  });
  it('matches case-insensitively', () => {
    expect(validateRosterEntry('sarah', canon)).toEqual({ matched: true, canonical: 'Sarah Blackwood' });
  });
  it('matches a full canonical name', () => {
    expect(validateRosterEntry('Vic Kingsley', canon)).toEqual({ matched: true, canonical: 'Vic Kingsley' });
  });
  it('reports no match for an unknown (human) name', () => {
    expect(validateRosterEntry('Alice', canon)).toEqual({ matched: false, canonical: null });
  });
  it('reports no match for empty/null map', () => {
    expect(validateRosterEntry('Vic', null)).toEqual({ matched: false, canonical: null });
    expect(validateRosterEntry('', canon)).toEqual({ matched: false, canonical: null });
  });
  it('matches a full canonical name with trailing whitespace (8.9 reality)', () => {
    expect(validateRosterEntry('Riley Torres ', { Riley: 'Riley Torres' }))
      .toEqual({ matched: true, canonical: 'Riley Torres' });
  });
});

describe('knownCharacterList', () => {
  it('returns sorted {first, full} from canonicalCharacters', () => {
    const out = knownCharacterList({ Vic: 'Vic Kingsley', Alex: 'Alex Reeves' });
    expect(out).toEqual([{ first: 'Alex', full: 'Alex Reeves' }, { first: 'Vic', full: 'Vic Kingsley' }]);
  });
  it('returns [] for empty/null', () => {
    expect(knownCharacterList(null)).toEqual([]);
    expect(knownCharacterList({})).toEqual([]);
  });
});
