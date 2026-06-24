const { extractRichText, parseSFFields, parseTokenPage, parseEvidencePage } = require('../parse');

const tokenPage = {
  id: 'page-1',
  properties: {
    Name: { title: [{ plain_text: 'CAS001 - Cass and Quinn' }] },
    'Description/Text': { rich_text: [{ plain_text: 'They catch up.\nSF_RFID: [CAS001]\nSF_Summary: [catch up]\nSF_ValueRating: [3]\nSF_MemoryType: [Sentimental]\nSF_Group: [Friends]' }] },
    'Basic Type': { select: { name: 'Memory Token' } },
    Owner: { relation: [{ id: 'char-1' }, { id: 'char-2' }] }
  }
};
const evidencePage = {
  id: 'page-2',
  properties: {
    Name: { title: [{ plain_text: 'Cease & Desist' }] },
    'Description/Text': { rich_text: [{ plain_text: 'Legal letter.' }] },
    'Basic Type': { select: { name: 'Document' } },
    'Narrative Threads': { multi_select: [{ name: 'Memory Drug' }] },
    Owner: { relation: [{ id: 'char-1' }] },
    Container: { relation: [{ id: 'should-be-ignored' }] }, // must NOT be read
    'Files & media': { files: [{ name: 'a b.png', type: 'file', file: { url: 'http://x/a.png' } }] }
  }
};

describe('parseSFFields', () => {
  it('splits description and extracts SF fields (tokenId lowercased)', () => {
    const sf = parseSFFields('Body text.\nSF_RFID: [JAM001]\nSF_Summary: [s]');
    expect(sf.fullDescription).toBe('Body text.');
    expect(sf.tokenId).toBe('jam001');
    expect(sf.summary).toBe('s');
  });
});
describe('parseTokenPage', () => {
  it('parses a token with ownerIds, no resolved names, no containerIds', () => {
    const t = parseTokenPage(tokenPage);
    expect(t).toMatchObject({
      notionId: 'page-1', tokenId: 'cas001', name: 'CAS001 - Cass and Quinn',
      fullDescription: 'They catch up.', summary: 'catch up', valueRating: '3',
      memoryType: 'Sentimental', group: 'Friends', basicType: 'Memory Token',
      ownerIds: ['char-1', 'char-2']
    });
    expect(t.owners).toBeUndefined();
    expect(t).not.toHaveProperty('containerIds');
  });
  it('returns null when there is no SF_RFID token id', () => {
    expect(parseTokenPage({ id: 'x', properties: { 'Description/Text': { rich_text: [{ plain_text: 'no sf' }] } } })).toBeNull();
  });
});
describe('parseEvidencePage', () => {
  it('parses evidence with ownerIds + files, and NO container fields', () => {
    const e = parseEvidencePage(evidencePage, { includeFiles: true });
    expect(e).toMatchObject({
      notionId: 'page-2', name: 'Cease & Desist', basicType: 'Document',
      description: 'Legal letter.', narrativeThreads: ['Memory Drug'], ownerIds: ['char-1']
    });
    expect(e).not.toHaveProperty('containerIds');
    expect(e).not.toHaveProperty('containers');
    expect(e.files).toEqual([{ name: 'a b.png', type: 'file', url: 'http://x/a.png' }]);
  });
  it('omits files when includeFiles is false', () => {
    expect(parseEvidencePage(evidencePage, { includeFiles: false }).files).toBeUndefined();
  });
});
