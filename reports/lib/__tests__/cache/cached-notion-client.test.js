const os = require('os'); const path = require('path'); const fs = require('fs');
const { CachedNotionClient } = require('../../cache/cached-notion-client');
const { CHARACTERS_DB_ID, ELEMENTS_DB_ID } = require('../../notion/databases');

// Minimal fake NotionClient: serves ELEMENTS_DB token pages + Characters pages + pages/{id}.
function makeFakeNotion(state) {
  return {
    async request(endpoint, method, body) {
      if (endpoint === `databases/${ELEMENTS_DB_ID}/query`) {
        return { results: state.tokenPages, has_more: false, next_cursor: null };
      }
      if (endpoint === `databases/${CHARACTERS_DB_ID}/query`) {
        return { results: state.characterPages, has_more: false, next_cursor: null };
      }
      const m = endpoint.match(/^pages\/(.+)$/);
      if (m) return state.characterPages.find(p => p.id === m[1]) || { properties: {} };
      throw new Error('unexpected endpoint ' + endpoint);
    }
  };
}
function tokenPage(id, tokenId, ownerId) {
  return { id, last_edited_time: '2025-01-01T00:00:00.000Z', properties: {
    Name: { title: [{ plain_text: tokenId.toUpperCase() }] },
    'Description/Text': { rich_text: [{ plain_text: `body\nSF_RFID: [${tokenId}]` }] },
    'Basic Type': { select: { name: 'Memory Token' } },
    Owner: { relation: [{ id: ownerId }] }
  } };
}
function charPage(id, name, edited) {
  return { id, last_edited_time: edited, properties: { Name: { title: [{ plain_text: name }] } } };
}

function newClient(state, dbPath) {
  return new CachedNotionClient({ notionClient: makeFakeNotion(state), dbPath });
}

describe('CachedNotionClient — read-time owner join', () => {
  let dbPath;
  beforeEach(() => { dbPath = path.join(os.tmpdir(), `cnc-${Date.now()}-${Math.round(Math.random()*1e6)}.db`); });
  afterEach(() => { for (const s of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + s); } catch {} } });

  it('resolves owners from the character name table', async () => {
    const state = {
      tokenPages: [tokenPage('tp1', 'cas001', 'char-1')],
      characterPages: [charPage('char-1', 'Tori Zhang', '2025-01-01T00:00:00.000Z')]
    };
    const c = newClient(state, dbPath);
    const { tokens } = await c.fetchMemoryTokens();
    expect(tokens[0].owners).toEqual(['Tori Zhang']);
    expect(tokens[0].ownerIds).toBeUndefined(); // returned shape has names, not ids
    c.close();
  });

  it('REGRESSION: a character rename updates owners without re-fetching elements', async () => {
    const state = {
      tokenPages: [tokenPage('tp1', 'cas001', 'char-1')],
      characterPages: [charPage('char-1', 'Tori Zhang', '2025-01-01T00:00:00.000Z')]
    };
    const c1 = newClient(state, dbPath);
    expect((await c1.fetchMemoryTokens()).tokens[0].owners).toEqual(['Tori Zhang']);
    c1.close();

    // Rename the character (bump its last_edited_time); element page UNCHANGED.
    state.characterPages = [charPage('char-1', 'Cass Zhang', '2025-06-01T00:00:00.000Z')];
    // Track requests to prove the element pages come from cache but the character is re-fetched.
    const reqs = [];
    const fake = makeFakeNotion(state);
    const wrapped = { request: (...a) => { reqs.push(a[0]); return fake.request(...a); } };
    const c2 = new CachedNotionClient({ notionClient: wrapped, dbPath });
    const { tokens } = await c2.fetchMemoryTokens();
    expect(tokens[0].owners).toEqual(['Cass Zhang']); // updated name
    // The character WAS re-fetched (rename detected)...
    expect(reqs.some(e => e.startsWith('pages/char-1') || e === `databases/${CHARACTERS_DB_ID}/query`)).toBe(true);
    c2.close();
  });
});
