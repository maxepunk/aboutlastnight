const { collectRelationIds, applyRelationNames } = require('../relations');
const { CHARACTERS_DB_ID } = require('../databases');

const tokens = [
  { tokenId: 'a', ownerIds: ['c1', 'c2'] },
  { tokenId: 'b', ownerIds: ['c2'] },
  { tokenId: 'c', ownerIds: [] }
];

describe('collectRelationIds', () => {
  it('groups unique relation ids by target DB', () => {
    expect(collectRelationIds(tokens, 'memory_token')).toEqual({ [CHARACTERS_DB_ID]: ['c1', 'c2'] });
  });
});
describe('applyRelationNames', () => {
  const nameMaps = { [CHARACTERS_DB_ID]: { c1: 'Cass Zhang', c2: 'Quinn Vale' } };
  it('joins names, omits idField, is non-mutating', () => {
    const out = applyRelationNames(tokens, 'memory_token', nameMaps);
    expect(out[0]).toEqual({ tokenId: 'a', owners: ['Cass Zhang', 'Quinn Vale'] });
    expect(out[1]).toEqual({ tokenId: 'b', owners: ['Quinn Vale'] });
    expect(out[2]).toEqual({ tokenId: 'c', owners: [] });
    // inputs untouched (still have ownerIds, no owners)
    expect(tokens[0]).toEqual({ tokenId: 'a', ownerIds: ['c1', 'c2'] });
    expect(tokens[0].owners).toBeUndefined();
  });
  it('falls back to Unknown for ids missing from the name map', () => {
    const out = applyRelationNames([{ tokenId: 'x', ownerIds: ['missing'] }], 'memory_token', nameMaps);
    expect(out[0].owners).toEqual(['Unknown']);
  });
});
