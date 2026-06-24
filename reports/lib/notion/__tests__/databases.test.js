const db = require('../databases');

describe('notion/databases', () => {
  it('exports the two DB ids and version', () => {
    expect(db.ELEMENTS_DB_ID).toBe('18c2f33d-583f-8020-91bc-d84c7dd94306');
    expect(db.CHARACTERS_DB_ID).toBe('18c2f33d-583f-8060-a6ab-de32ff06bca2');
    expect(db.NOTION_VERSION).toBe('2022-06-28');
  });
  it('registers Owner -> Characters and nothing for Container', () => {
    expect(db.RELATION_REGISTRY.Owner).toEqual({
      notionProperty: 'Owner', idField: 'ownerIds', nameField: 'owners',
      targetDb: db.CHARACTERS_DB_ID, cacheType: 'character'
    });
    expect(db.RELATION_REGISTRY.Container).toBeUndefined();
  });
  it('lists Owner for both entity types, no Container', () => {
    expect(db.ENTITY_RELATIONS.memory_token).toEqual(['Owner']);
    expect(db.ENTITY_RELATIONS.paper_evidence).toEqual(['Owner']);
  });
  it('token filter targets the 4 Memory Token basic types', () => {
    const names = db.TOKEN_FILTER.or.map(c => c.select.equals);
    expect(names).toEqual(['Memory Token', 'Memory Token Video', 'Memory Token Audio + Image', 'Memory Token Audio']);
  });
});
