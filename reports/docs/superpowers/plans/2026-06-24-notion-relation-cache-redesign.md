# Notion Relation-Resolution & Cache Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the three duplicated Notion fetch/parse/resolve implementations into one shared core, and make relation resolution correct under relation-target renames via a registry-driven read-time join over freshness-checked name tables — eliminating the silent staleness that showed a renamed character's old name.

**Architecture:** A new `lib/notion/` core holds the single source of truth (DB IDs + filters + a declarative relation registry; pure page-parsers; a pure registry-driven join). `NotionClient` (uncached) and `CachedNotionClient` (server-only decorator) both consume it; the cache stores element relation **IDs** + a separately freshness-checked **character name table** and joins at read time. The standalone `journalist-report` skill scripts become thin wrappers over the uncached `NotionClient`. `Container` (dead in the report pipeline) is dropped.

**Tech Stack:** Node, `better-sqlite3` (cache), Jest (node-env), Notion REST API `2022-06-28`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-24-notion-relation-resolution-redesign-design.md` (read it for full rationale + grounded facts).

## Global Constraints

- **Zero new dependencies.** Pure JS + existing modules only.
- **Commit messages END with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. NEVER `git commit --no-verify` (a pre-commit HTML-validation hook runs; JS/MD changes pass it).
- **Git root is the PARENT dir** `C:\Users\spide\Documents\claudecode\aboutlastnight`; this project is `reports/`. Run all `npx jest` / `node` from `reports/`. Branch: `feat/notion-relation-cache-redesign`.
- **Preserve these contracts exactly** (verified consumers depend on them):
  - `fetchMemoryTokens`/`fetchPaperEvidence` return `{ tokens|evidence, fetchedAt, totalCount }` (cached adds optional `cacheStats`).
  - Returned tokens/evidence carry `owners: string[]` of **resolved names** (NOT ids). Consumers: `extractCanonicalCharacters` (node-helpers.js:966), `ai-nodes.js:193` (curation scoring reads `rawData.owners`), `ai-nodes.js:398` (spreads `rawData` incl. `owners` into the exposed bundle).
  - Token shape keys: `notionId, tokenId, name, fullDescription, summary, valueRating, memoryType, group, basicType, owners`. Evidence shape keys: `notionId, name, basicType, description, narrativeThreads, owners` (+ `files` when included). **No `containers`/`containerIds` anywhere.**
  - `disposition` and buried-transaction fields are grafted post-fetch by `tagTokensWithDisposition` (fetch-nodes.js) and must NOT be cached.
  - `config.configurable.notionClient` test-injection seam (getNotionClient, fetch-nodes.js:43-50); the `createCachedNotionClient()` singleton + `resetCachedNotionClient()` on SIGINT (server.js); the uncached startup probe `request('users/me')`; `downloadFile`/`downloadAttachments`; `ELEMENTS_DB_ID` export.
- **Unresolved/deleted relation target → `'Unknown'`** (today's behavior).
- **Notion API version is `2022-06-28`** (so `databases/{id}` retrieve exposes `relation.database_id`, already used to ground the registry).

---

## File Structure

- **Create** `lib/notion/databases.js` — `ELEMENTS_DB_ID`, `CHARACTERS_DB_ID`, `NOTION_VERSION`, `TOKEN_FILTER`, `EVIDENCE_FILTER`, `RELATION_REGISTRY`, `ENTITY_RELATIONS`. (Task 1)
- **Create** `lib/notion/parse.js` — `extractRichText`, `parseSFFields`, `parseTokenPage`, `parseEvidencePage` (pure). (Task 2)
- **Create** `lib/notion/relations.js` — `applyRelationNames` (pure), `collectRelationIds`. (Task 3)
- **Create** `lib/notion/__tests__/parse.test.js`, `lib/notion/__tests__/relations.test.js`. (Tasks 2, 3)
- **Modify** `lib/notion-client.js` — consume `lib/notion/*`; registry-driven resolution; drop Container. (Task 4)
- **Modify** `lib/cache/notion-cache-store.js` — bump `SCHEMA_VERSION` + add version-mismatch clear. (Task 5)
- **Modify** `lib/cache/cached-notion-client.js` — shared parse, store IDs, character name-table, read-time join; drop Container. (Task 6)
- **Modify** tests: `lib/__tests__/notion-client.test.js` (Task 4), `__tests__/unit/workflow/fetch-nodes.test.js` (Task 7); add cache name-table tests (Task 6).
- **Modify** `.claude/skills/journalist-report/scripts/fetch-notion-tokens.js` (Task 8), `fetch-paper-evidence.js` (Task 9) — thin wrappers.
- **Verification + docs** (Task 10).

---

## Task 1: `lib/notion/databases.js` — schema constants + relation registry

**Files:**
- Create: `lib/notion/databases.js`
- Test: `lib/notion/__tests__/databases.test.js`

**Interfaces:**
- Produces: `ELEMENTS_DB_ID`, `CHARACTERS_DB_ID`, `NOTION_VERSION` (strings); `TOKEN_FILTER`, `EVIDENCE_FILTER` (Notion filter objects); `RELATION_REGISTRY` (`{ [relName]: { notionProperty, idField, nameField, targetDb, cacheType } }`); `ENTITY_RELATIONS` (`{ memory_token: string[], paper_evidence: string[] }`).

- [ ] **Step 1: Write the failing test.** Create `lib/notion/__tests__/databases.test.js`:
```javascript
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
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx jest lib/notion/__tests__/databases.test.js` — FAIL (`Cannot find module '../databases'`).

- [ ] **Step 3: Create `lib/notion/databases.js`:**
```javascript
/**
 * notion/databases — single source of truth for Notion schema constants:
 * database IDs, query filters, and the declarative relation registry that
 * drives read-time relation-name resolution. Adding a resolved relation =
 * one RELATION_REGISTRY entry + its entity listing in ENTITY_RELATIONS.
 */
const ELEMENTS_DB_ID = '18c2f33d-583f-8020-91bc-d84c7dd94306';
const CHARACTERS_DB_ID = '18c2f33d-583f-8060-a6ab-de32ff06bca2';
const NOTION_VERSION = '2022-06-28';

// Memory tokens (4 Basic Type variants) in the Elements DB.
const TOKEN_FILTER = {
  or: [
    { property: 'Basic Type', select: { equals: 'Memory Token' } },
    { property: 'Basic Type', select: { equals: 'Memory Token Video' } },
    { property: 'Basic Type', select: { equals: 'Memory Token Audio + Image' } },
    { property: 'Basic Type', select: { equals: 'Memory Token Audio' } }
  ]
};

// Paper evidence: relevant Basic Types AND relevant Narrative Threads.
const EVIDENCE_FILTER = {
  and: [
    { or: [
      { property: 'Basic Type', select: { equals: 'Prop' } },
      { property: 'Basic Type', select: { equals: 'Document' } },
      { property: 'Basic Type', select: { equals: 'Set Dressing' } }
    ] },
    { or: [
      { property: 'Narrative Threads', multi_select: { contains: 'Funding & Espionage' } },
      { property: 'Narrative Threads', multi_select: { contains: 'Marriage Troubles' } },
      { property: 'Narrative Threads', multi_select: { contains: 'Memory Drug' } },
      { property: 'Narrative Threads', multi_select: { contains: 'Underground Parties' } }
    ] }
  ]
};

// Declarative relation registry. Each entry: how to read the relation IDs from a
// parsed element (idField), where to put resolved names (nameField), the target
// DB whose names to join, and the cache entity-type for that DB's name table.
const RELATION_REGISTRY = {
  Owner: {
    notionProperty: 'Owner',
    idField: 'ownerIds',
    nameField: 'owners',
    targetDb: CHARACTERS_DB_ID,
    cacheType: 'character'
  }
  // Future resolved relations go here (auto freshness-checked + joined).
};

// Which registered relations apply to each entity type.
const ENTITY_RELATIONS = {
  memory_token: ['Owner'],
  paper_evidence: ['Owner']  // Container intentionally dropped (not relevant to reports)
};

module.exports = {
  ELEMENTS_DB_ID, CHARACTERS_DB_ID, NOTION_VERSION,
  TOKEN_FILTER, EVIDENCE_FILTER,
  RELATION_REGISTRY, ENTITY_RELATIONS
};
```

- [ ] **Step 4: Run it, expect pass.** Run: `npx jest lib/notion/__tests__/databases.test.js` — PASS (4 tests).

- [ ] **Step 5: Commit.**
```bash
git add reports/lib/notion/databases.js reports/lib/notion/__tests__/databases.test.js
git commit -m "feat(notion): add databases module (ids, filters, relation registry)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `lib/notion/parse.js` — pure page parsers (no Container)

**Files:**
- Create: `lib/notion/parse.js`
- Test: `lib/notion/__tests__/parse.test.js`

**Interfaces:**
- Produces: `extractRichText(richTextArray) → string`; `parseSFFields(descText) → { fullDescription, tokenId, summary, valueRating, memoryType, group }`; `parseTokenPage(page) → element | null` (keys: `notionId, tokenId, name, fullDescription, summary, valueRating, memoryType, group, basicType, ownerIds`); `parseEvidencePage(page, { includeFiles = true }) → element` (keys: `notionId, name, basicType, description, narrativeThreads, ownerIds`, `files?`). **Neither emits `containerIds`.**

- [ ] **Step 1: Write the failing test.** Create `lib/notion/__tests__/parse.test.js`:
```javascript
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
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx jest lib/notion/__tests__/parse.test.js` — FAIL (module not found).

- [ ] **Step 3: Create `lib/notion/parse.js`** (logic lifted verbatim from `lib/notion-client.js` parseSFFields + the token/evidence parse blocks, minus Container):
```javascript
/**
 * notion/parse — pure Notion page → parsed element. Single source of parsing
 * for both NotionClient and CachedNotionClient. Emits relation IDs (ownerIds),
 * NOT resolved names; resolution is a separate read-time join (notion/relations).
 * Container is intentionally NOT parsed (dropped from the report pipeline).
 */
function extractRichText(richTextArray) {
  if (!richTextArray || !Array.isArray(richTextArray)) return '';
  return richTextArray.map(t => t.plain_text || '').join('');
}

function parseSFFields(descText) {
  const result = { fullDescription: '', tokenId: '', summary: '', valueRating: '', memoryType: '', group: '' };
  if (!descText) return result;
  const sfIndex = descText.indexOf('SF_');
  if (sfIndex > 0) result.fullDescription = descText.substring(0, sfIndex).trim();
  else if (sfIndex === -1) result.fullDescription = descText.trim();
  const rfid = descText.match(/SF_RFID:\s*\[([^\]]*)\]/i);
  if (rfid) result.tokenId = rfid[1].trim().toLowerCase();
  const summary = descText.match(/SF_Summary:\s*\[([^\]]*)\]/i);
  if (summary) result.summary = summary[1].trim();
  const rating = descText.match(/SF_ValueRating:\s*\[([^\]]*)\]/i);
  if (rating) result.valueRating = rating[1].trim();
  const type = descText.match(/SF_MemoryType:\s*\[([^\]]*)\]/i);
  if (type) result.memoryType = type[1].trim();
  const group = descText.match(/SF_Group:\s*\[([^\]]*)\]/i);
  if (group) result.group = group[1].trim();
  return result;
}

function parseTokenPage(page) {
  const props = page.properties || {};
  const name = extractRichText(props['Name']?.title);
  const descText = extractRichText(props['Description/Text']?.rich_text);
  const basicType = props['Basic Type']?.select?.name || '';
  const sf = parseSFFields(descText);
  if (!sf.tokenId) return null;
  return {
    notionId: page.id,
    tokenId: sf.tokenId,
    name,
    fullDescription: sf.fullDescription,
    summary: sf.summary,
    valueRating: sf.valueRating,
    memoryType: sf.memoryType,
    group: sf.group,
    basicType,
    ownerIds: props['Owner']?.relation?.map(r => r.id) || []
  };
}

function parseEvidencePage(page, { includeFiles = true } = {}) {
  const props = page.properties || {};
  const item = {
    notionId: page.id,
    name: extractRichText(props['Name']?.title),
    basicType: props['Basic Type']?.select?.name || '',
    description: extractRichText(props['Description/Text']?.rich_text),
    narrativeThreads: props['Narrative Threads']?.multi_select?.map(s => s.name) || [],
    ownerIds: props['Owner']?.relation?.map(r => r.id) || []
  };
  if (includeFiles && props['Files & media']?.files) {
    item.files = props['Files & media'].files.map(f => ({
      name: f.name, type: f.type,
      url: f.type === 'external' ? f.external?.url : f.file?.url
    }));
  }
  return item;
}

module.exports = { extractRichText, parseSFFields, parseTokenPage, parseEvidencePage };
```

- [ ] **Step 4: Run it, expect pass.** Run: `npx jest lib/notion/__tests__/parse.test.js` — PASS (6 tests).

- [ ] **Step 5: Commit.**
```bash
git add reports/lib/notion/parse.js reports/lib/notion/__tests__/parse.test.js
git commit -m "feat(notion): add pure page parsers (token/evidence; no Container)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `lib/notion/relations.js` — pure registry-driven join

**Files:**
- Create: `lib/notion/relations.js`
- Test: `lib/notion/__tests__/relations.test.js`

**Interfaces:**
- Consumes: `RELATION_REGISTRY`, `ENTITY_RELATIONS` from `./databases`.
- Produces:
  - `collectRelationIds(elements, entityType) → { [targetDb]: string[] }` — unique relation IDs grouped by target DB (for name-map acquisition).
  - `applyRelationNames(elements, entityType, nameMapsByTargetDb) → elements'` — **pure, non-mutating.** Returns new objects: each gains `nameField = idField.map(id => nameMapsByTargetDb[targetDb]?.[id] ?? 'Unknown')` and **omits** `idField`. `nameMapsByTargetDb` is `{ [targetDb]: { [pageId]: Name } }`.

- [ ] **Step 1: Write the failing test.** Create `lib/notion/__tests__/relations.test.js`:
```javascript
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
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx jest lib/notion/__tests__/relations.test.js` — FAIL (module not found).

- [ ] **Step 3: Create `lib/notion/relations.js`:**
```javascript
/**
 * notion/relations — pure, registry-driven relation-name resolution.
 *
 * collectRelationIds: gather the IDs to resolve, grouped by target DB (callers
 *   acquire names however they like — live fetch or freshness-checked table).
 * applyRelationNames: NON-MUTATING join — returns new element objects with
 *   resolved name arrays and the raw id field removed. Non-mutation is
 *   load-bearing: the cache's persisted blob must keep ownerIds for the next read.
 */
const { RELATION_REGISTRY, ENTITY_RELATIONS } = require('./databases');

function _relationsFor(entityType) {
  return (ENTITY_RELATIONS[entityType] || []).map(name => RELATION_REGISTRY[name]).filter(Boolean);
}

function collectRelationIds(elements, entityType) {
  const byDb = {};
  for (const reg of _relationsFor(entityType)) {
    const set = (byDb[reg.targetDb] = byDb[reg.targetDb] || new Set());
    for (const el of elements) for (const id of (el[reg.idField] || [])) set.add(id);
  }
  const out = {};
  for (const [db, set] of Object.entries(byDb)) out[db] = [...set];
  return out;
}

function applyRelationNames(elements, entityType, nameMapsByTargetDb = {}) {
  const regs = _relationsFor(entityType);
  return elements.map(el => {
    const out = { ...el };
    for (const reg of regs) {
      const map = nameMapsByTargetDb[reg.targetDb] || {};
      out[reg.nameField] = (el[reg.idField] || []).map(id => map[id] || 'Unknown');
      delete out[reg.idField];
    }
    return out;
  });
}

module.exports = { collectRelationIds, applyRelationNames };
```

- [ ] **Step 4: Run it, expect pass.** Run: `npx jest lib/notion/__tests__/relations.test.js` — PASS (3 tests).

- [ ] **Step 5: Commit.**
```bash
git add reports/lib/notion/relations.js reports/lib/notion/__tests__/relations.test.js
git commit -m "feat(notion): add pure registry-driven relation join (applyRelationNames)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Refactor `lib/notion-client.js` onto the shared core (drop Container)

**Files:**
- Modify: `lib/notion-client.js` (constants ~17-18; `fetchMemoryTokens` 134-201; `fetchPaperEvidence` 212-286; `resolveRelationNames` 296-321; exports 431-435)
- Modify (test): `lib/__tests__/notion-client.test.js` (remove any Container assertions; the paper-evidence/token tests otherwise unchanged)

**Interfaces:**
- Consumes: `lib/notion/databases` (`ELEMENTS_DB_ID`, `NOTION_VERSION`, `TOKEN_FILTER`, `EVIDENCE_FILTER`), `lib/notion/parse` (`parseTokenPage`, `parseEvidencePage`, `parseSFFields`, `extractRichText`), `lib/notion/relations` (`collectRelationIds`, `applyRelationNames`).
- Produces: unchanged public surface — `NotionClient` with `request`, `fetchMemoryTokens(tokenIds)`, `fetchPaperEvidence(includeFiles)`, `resolveRelationNames(items, idField, nameField)` (retained for compat + its tests), `downloadFile`, `downloadAttachments`; `createNotionClient`; `ELEMENTS_DB_ID` (re-exported from databases). Return shapes unchanged except evidence no longer has `containers`.

**Implementation notes:** keep `request`, `downloadFile`, `downloadAttachments`, `createNotionClient` as-is. Replace the inline parse/filter with the shared modules. Add a private `_fetchPageName(id)` (the page-Name fetch extracted from the old `resolveRelationNames` loop) and a private `_buildNameMaps(elements, entityType)` that uses `collectRelationIds` + `_fetchPageName`. The fetch methods parse → `_buildNameMaps` → `applyRelationNames`. Keep `resolveRelationNames` (reimplemented on `_fetchPageName`) so its existing tests stay green.

- [ ] **Step 1: Run the existing tests first (baseline).** Run: `npx jest lib/__tests__/notion-client.test.js` — note current pass count (expected green pre-change). Read the file to find any `containers`/`containerIds` assertions (per the surface map, the token/evidence tests do NOT assert owners/containers, so likely none — confirm).

- [ ] **Step 2: Replace the top constants + add requires.** In `lib/notion-client.js`, replace lines 13-18 (the `fs`/`path` requires + `ELEMENTS_DB_ID`/`NOTION_VERSION` consts) with:
```javascript
const fs = require('fs').promises;
const path = require('path');
const notionParse = require('./notion/parse');
const { parseTokenPage, parseEvidencePage } = notionParse;
const { collectRelationIds, applyRelationNames } = require('./notion/relations');
const { ELEMENTS_DB_ID, NOTION_VERSION, TOKEN_FILTER, EVIDENCE_FILTER } = require('./notion/databases');
```
Then **re-implement** the class's `extractRichText` (70-73) and `parseSFFields` (89-126) methods as thin delegations to the shared module — do **NOT** delete them. Keeping the methods preserves the public surface, keeps their existing `notion-client.test.js` describe-blocks green, and keeps the (not-yet-refactored) `CachedNotionClient`'s `this.notionClient.parseSFFields` call working until Task 6 removes it:
```javascript
  extractRichText(richTextArray) { return notionParse.extractRichText(richTextArray); }
  parseSFFields(descText) { return notionParse.parseSFFields(descText); }
```
The parsing logic now lives only in `notion/parse`; these are thin pass-throughs (retire them in a later cleanup once nothing external calls them).

- [ ] **Step 3: Replace `fetchMemoryTokens` (134-201)** with:
```javascript
  async fetchMemoryTokens(tokenIds = null) {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter: TOKEN_FILTER };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) {
        const item = parseTokenPage(page);
        if (item) allResults.push(item);
      }
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    allResults = applyRelationNames(allResults, 'memory_token', await this._buildNameMaps(allResults, 'memory_token'));
    if (tokenIds && Array.isArray(tokenIds) && tokenIds.length > 0) {
      const filterSet = new Set(tokenIds.map(id => id.toLowerCase()));
      allResults = allResults.filter(t => filterSet.has(t.tokenId));
    }
    return { tokens: allResults, fetchedAt: new Date().toISOString(), totalCount: allResults.length };
  }
```

- [ ] **Step 4: Replace `fetchPaperEvidence` (212-286)** with:
```javascript
  async fetchPaperEvidence(includeFiles = true) {
    let allResults = [];
    let hasMore = true;
    let startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter: EVIDENCE_FILTER };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this.request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) allResults.push(parseEvidencePage(page, { includeFiles }));
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    allResults = applyRelationNames(allResults, 'paper_evidence', await this._buildNameMaps(allResults, 'paper_evidence'));
    return { evidence: allResults, fetchedAt: new Date().toISOString(), totalCount: allResults.length };
  }
```

- [ ] **Step 5: Replace `resolveRelationNames` (296-321)** with a shared page-Name primitive + a compat method + the name-map builder:
```javascript
  /** Fetch a related page's Name title (→ 'Unknown' on failure). @private */
  async _fetchPageName(id) {
    try {
      const data = await this.request(`pages/${id}`);
      return notionParse.extractRichText(data.properties?.Name?.title) || 'Unknown';
    } catch {
      return 'Unknown';
    }
  }

  /** Build { [targetDb]: { [id]: Name } } for the registered relations of entityType. @private */
  async _buildNameMaps(elements, entityType) {
    const idsByDb = collectRelationIds(elements, entityType);
    const maps = {};
    for (const [db, ids] of Object.entries(idsByDb)) {
      const map = {};
      for (const id of ids) map[id] = await this._fetchPageName(id);
      maps[db] = map;
    }
    return maps;
  }

  /**
   * Legacy relation resolver (retained for backward-compat + tests): mutates
   * `items`, setting items[nameField] from items[idField] and deleting idField.
   */
  async resolveRelationNames(items, idField, nameField) {
    const ids = new Set();
    items.forEach(it => (it[idField] || []).forEach(id => ids.add(id)));
    const nameMap = new Map();
    for (const id of ids) nameMap.set(id, await this._fetchPageName(id));
    items.forEach(it => {
      it[nameField] = (it[idField] || []).map(id => nameMap.get(id) || 'Unknown');
      delete it[idField];
    });
    return items;
  }
```

- [ ] **Step 6: Re-export `ELEMENTS_DB_ID` from databases.** The exports block (431-435) already exports `ELEMENTS_DB_ID`; since it's now imported from `./notion/databases`, the same binding is re-exported. Confirm the `module.exports` still lists `NotionClient, createNotionClient, ELEMENTS_DB_ID`.

- [ ] **Step 7: Run tests.** Run: `npx jest lib/__tests__/notion-client.test.js` — PASS. If any assertion referenced `containers`/`containerIds`, remove it (Container is gone). Run `node --check lib/notion-client.js`.

- [ ] **Step 8: Commit.**
```bash
git add reports/lib/notion-client.js reports/lib/__tests__/notion-client.test.js
git commit -m "refactor(notion): NotionClient consumes shared core; registry-driven owners; drop Container

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Bump `SCHEMA_VERSION` + add version-mismatch clear

**Files:**
- Modify: `lib/cache/notion-cache-store.js` (`SCHEMA_VERSION` line 23; `_ensureSchema` 49-77)
- Test: `lib/__tests__/cache/notion-cache-store.test.js` (append a migration test)

**Interfaces:**
- Produces: on construction, if the stored `schema_version` differs from `SCHEMA_VERSION`, the entity table is cleared and the version reset — so legacy resolved-owners blobs (no `ownerIds`) never survive into the read-time join.

**Note:** today `_ensureSchema` only *sets* the version when absent — there is NO mismatch handling. This task ADDS it (the spec's "version mismatch clears the cache" is new behavior, implemented here).

- [ ] **Step 1: Write the failing test.** Append to `lib/__tests__/cache/notion-cache-store.test.js`:
```javascript
describe('schema version migration', () => {
  const os = require('os'); const path = require('path'); const fs = require('fs');
  const { NotionCacheStore, SCHEMA_VERSION } = require('../../cache/notion-cache-store');
  it('clears entities when the stored schema version is older', () => {
    const p = path.join(os.tmpdir(), `notion-cache-migrate-${Date.now()}.db`);
    // Seed a store, then force an old version + an entity.
    let store = new NotionCacheStore(p);
    store.upsertEntities([{ notion_id: 'x', entity_type: 'memory_token', last_edited_time: '2025-01-01T00:00:00.000Z', data: { tokenId: 't', owners: ['Old Name'] } }]);
    store.setMetadata('schema_version', '0'); // simulate a pre-bump db
    store.close();
    // Reopen: mismatch (0 !== current) must clear entities and set current version.
    store = new NotionCacheStore(p);
    expect(store.getEntityCount('memory_token')).toBe(0);
    expect(store.getMetadata('schema_version')).toBe(SCHEMA_VERSION);
    store.close();
    fs.unlinkSync(p); try { fs.unlinkSync(p + '-wal'); } catch {} try { fs.unlinkSync(p + '-shm'); } catch {}
  });
});
```

- [ ] **Step 2: Run it, expect failure.** Run: `npx jest lib/__tests__/cache/notion-cache-store.test.js -t 'schema version migration'` — FAIL (entities survive; count is 1).

- [ ] **Step 3: Bump the version.** Change line 23: `const SCHEMA_VERSION = '1';` → `const SCHEMA_VERSION = '2';`

- [ ] **Step 4: Add mismatch handling.** In `_ensureSchema`, replace the version block (72-76):
```javascript
    // Set schema version if not exists
    const version = this.getMetadata('schema_version');
    if (!version) {
      this.setMetadata('schema_version', SCHEMA_VERSION);
    }
```
with:
```javascript
    // Schema version: on a mismatch (or first run after a bump), drop cached
    // entities so a stale-shape blob can never survive into a new read path.
    const version = this.getMetadata('schema_version');
    if (version !== SCHEMA_VERSION) {
      this.db.exec('DELETE FROM notion_entities;');
      this.setMetadata('schema_version', SCHEMA_VERSION);
    }
```
(Note: deletes entities directly rather than calling `clear()`, since `clear()` also wipes non-version metadata — entity-only is the right scope here.)

- [ ] **Step 5: Run tests.** Run: `npx jest lib/__tests__/cache/notion-cache-store.test.js` — PASS (existing + the migration test).

- [ ] **Step 6: Commit.**
```bash
git add reports/lib/cache/notion-cache-store.js reports/lib/__tests__/cache/notion-cache-store.test.js
git commit -m "feat(cache): bump SCHEMA_VERSION to 2 + clear entities on version mismatch

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: Refactor `CachedNotionClient` — shared parse, store IDs, character name-table, read-time join

**Files:**
- Modify: `lib/cache/cached-notion-client.js` (requires ~16-19; `_fetchWithCache` 116-187; `_fetchFullEntities` 222-258; remove `_parseTokenPage` 268-291 + `_parseEvidencePage` 297-324 + `_extractRichText` 330-333; add a name-table helper + read-time join)
- Test: `lib/__tests__/cache/cached-notion-client.test.js` (create or extend — the regression test)

**Interfaces:**
- Consumes: `lib/notion/parse` (`parseTokenPage`, `parseEvidencePage`), `lib/notion/relations` (`collectRelationIds`, `applyRelationNames`), `lib/notion/databases` (`RELATION_REGISTRY`, `ENTITY_RELATIONS`, `ELEMENTS_DB_ID`); the existing `NotionCacheStore`/`FreshnessChecker`.
- Produces: `fetchMemoryTokens`/`fetchPaperEvidence` return `{ tokens|evidence, fetchedAt, totalCount, cacheStats }` with `owners` resolved at read time. New cache entity type `'character'` (the name table). The persisted element blobs carry `ownerIds` (NOT resolved names).

**Implementation notes:**
- `_fetchFullEntities` (222-258): parse with the shared `parseTokenPage`/`parseEvidencePage` (delete the private `_parseTokenPage`/`_parseEvidencePage`/`_extractRichText`), and **stop calling `notionClient.resolveRelationNames`** — the cached blob now keeps `ownerIds`.
- Add `async _ensureNameTable(entityType)`: for each target DB the entity's registered relations need, light-fetch that DB's `{id,last_edited_time}`, `checkFreshness(cacheType, …)`, full-fetch stale/new pages' `Name`, upsert as that `cacheType`, delete stale, and return `{ [targetDb]: { [id]: Name } }`.
- After assembling `allEntities` in `_fetchWithCache`, do the read-time join: `allEntities = applyRelationNames(allEntities, entityType, await this._ensureNameTable(entityType))` BEFORE the post-filter (tokenIds) and return.

- [ ] **Step 1: Write the failing regression test.** Create `lib/__tests__/cache/cached-notion-client.test.js` (uses an injected fake `notionClient` + a temp db; drives a character rename):
```javascript
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
    // Spy: element pages must come from cache (no ELEMENTS_DB full re-query needed),
    // but the character must be re-fetched. Track requests.
    const reqs = [];
    const fake = makeFakeNotion(state);
    const wrapped = { request: (...a) => { reqs.push(a[0]); return fake.request(...a); } };
    const c2 = new CachedNotionClient({ notionClient: wrapped, dbPath });
    const { tokens } = await c2.fetchMemoryTokens();
    expect(tokens[0].owners).toEqual(['Cass Zhang']); // updated name
    // The character page WAS re-fetched (rename detected)...
    expect(reqs.some(e => e.startsWith('pages/char-1') || e === `databases/${CHARACTERS_DB_ID}/query`)).toBe(true);
    c2.close();
  });
});
```
(If the cache resolves the name table via a `databases/{CHARACTERS_DB_ID}/query` light-fetch + per-id `pages/{id}` full-fetch, the regression assertion covers both shapes.)

- [ ] **Step 2: Run it, expect failure.** Run: `npx jest lib/__tests__/cache/cached-notion-client.test.js` — FAIL (current cache resolves via `notionClient.resolveRelationNames`, which the fake doesn't implement → throws; or owners undefined).

- [ ] **Step 3: Add requires.** In `lib/cache/cached-notion-client.js`, replace the requires (16-19) to add the shared core:
```javascript
const path = require('path');
const { NotionClient, createNotionClient, ELEMENTS_DB_ID } = require('../notion-client');
const { NotionCacheStore } = require('./notion-cache-store');
const { FreshnessChecker } = require('./freshness-checker');
const { parseTokenPage, parseEvidencePage } = require('../notion/parse');
const { collectRelationIds, applyRelationNames } = require('../notion/relations');
const { RELATION_REGISTRY, ENTITY_RELATIONS, CHARACTERS_DB_ID } = require('../notion/databases');
```

- [ ] **Step 4: Use the shared parser in `_fetchFullEntities`** (222-258). Replace the `entityType === 'memory_token' ? this._parseTokenPage(page) : this._parseEvidencePage(page)` branch with `parseTokenPage(page)` / `parseEvidencePage(page, { includeFiles: true })`, and **delete the resolve-relations block** (251-257) entirely — blobs keep `ownerIds`:
```javascript
  async _fetchFullEntities(entityType, filter, targetIds) {
    const targetSet = new Set(targetIds);
    const entities = [];
    let hasMore = true, startCursor = undefined;
    while (hasMore) {
      const body = { page_size: 100, filter };
      if (startCursor) body.start_cursor = startCursor;
      const data = await this._request(`databases/${ELEMENTS_DB_ID}/query`, 'POST', body);
      for (const page of data.results) {
        if (!targetSet.has(page.id)) continue;
        const parsed = entityType === 'memory_token'
          ? parseTokenPage(page)
          : parseEvidencePage(page, { includeFiles: true });
        if (parsed) entities.push(parsed);
      }
      hasMore = data.has_more;
      startCursor = data.next_cursor;
    }
    return entities; // blobs carry ownerIds; names resolved at read time
  }
```
Then DELETE the now-unused private methods `_parseTokenPage` (268-291), `_parseEvidencePage` (297-324), and `_extractRichText` (330-333).

- [ ] **Step 5: Add the name-table helper.** Add this method to the class (near `_fetchFullEntities`):
```javascript
  /**
   * Ensure the cached name tables for entityType's registered relations are fresh,
   * and return { [targetDb]: { [pageId]: Name } } for the read-time join.
   * The Characters table is freshness-checked against the Characters DB, so a
   * character rename invalidates only its name row — element cache untouched.
   * @private
   */
  async _ensureNameTable(entityType) {
    const relNames = ENTITY_RELATIONS[entityType] || [];
    const targets = [...new Set(relNames.map(n => ({ db: RELATION_REGISTRY[n].targetDb, type: RELATION_REGISTRY[n].cacheType })).map(t => JSON.stringify(t)))].map(s => JSON.parse(s));
    const maps = {};
    for (const { db, type } of targets) {
      // Light fetch: ids + timestamps from the target DB.
      const notionTs = [];
      let hasMore = true, cursor = undefined;
      while (hasMore) {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const data = await this._request(`databases/${db}/query`, 'POST', body);
        for (const p of data.results) notionTs.push({ id: p.id, last_edited_time: p.last_edited_time });
        hasMore = data.has_more; cursor = data.next_cursor;
      }
      const fresh = this.freshnessChecker.checkFreshness(type, notionTs);
      const idsToFetch = [...fresh.stale, ...fresh.new];
      if (idsToFetch.length > 0) {
        const tsMap = new Map(notionTs.map(t => [t.id, t.last_edited_time]));
        const toUpsert = [];
        for (const id of idsToFetch) {
          const page = await this._request(`pages/${id}`);
          const name = (page.properties?.Name?.title || []).map(t => t.plain_text || '').join('') || 'Unknown';
          toUpsert.push({ notion_id: id, entity_type: type, last_edited_time: tsMap.get(id) || new Date().toISOString(), data: { name } });
        }
        this.cacheStore.upsertEntities(toUpsert);
      }
      if (fresh.deleted.length > 0) this.cacheStore.deleteStaleEntities(type, notionTs.map(t => t.id));
      // Build the id->Name map from the (now fresh) cache.
      const map = {};
      for (const row of this.cacheStore.getEntitiesByType(type)) map[row.notion_id] = row.data.name;
      maps[db] = map;
    }
    return maps;
  }
```

- [ ] **Step 6: Read-time join in `_fetchWithCache`.** In `_fetchWithCache` (116-187), after `let allEntities = [...cachedEntities, ...refreshedEntities];` (159) and BEFORE the post-filter (162), insert:
```javascript
    // Resolve relation names via the freshness-checked name table (read-time join).
    allEntities = applyRelationNames(allEntities, entityType, await this._ensureNameTable(entityType));
```

- [ ] **Step 7: Run the tests.** Run: `npx jest lib/__tests__/cache/cached-notion-client.test.js` — PASS (3 tests incl. the regression). Run `node --check lib/cache/cached-notion-client.js`.

- [ ] **Step 8: Run the cache suite + a load smoke.** Run: `npx jest lib/__tests__/cache/` — green. Run: `node -e "require('./lib/cache'); require('./lib/notion-client'); console.log('load OK')"`.

- [ ] **Step 9: Commit.**
```bash
git add reports/lib/cache/cached-notion-client.js reports/lib/__tests__/cache/cached-notion-client.test.js
git commit -m "feat(cache): store relation IDs + freshness-checked character name table; read-time owner join

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Update `fetch-nodes.test.js` (drop Container; confirm shape)

**Files:**
- Modify (test): `__tests__/unit/workflow/fetch-nodes.test.js` (paper-evidence structure test ~344-357)

**Interfaces:**
- Consumes: the new token/evidence shapes (owners resolved; no containers).

- [ ] **Step 1: Run it to see the failure.** Run: `npx jest __tests__/unit/workflow/fetch-nodes.test.js` — the paper-evidence structure test asserting a `containers` property will FAIL (field removed).

- [ ] **Step 2: Remove the `containers` assertion.** In the paper-evidence structure test (~344-357), delete the line asserting `containers` exists (e.g. `expect(evidence[0]).toHaveProperty('containers')` or a `containers` key in a `toMatchObject`). Leave the `owners`, `notionId`, `name`, `basicType`, `description`, `narrativeThreads`, `files` assertions intact. If the test's mock client returns evidence objects with a `containers` field, drop it from the mock too so the mock matches the real shape.

- [ ] **Step 3: Run it, expect pass.** Run: `npx jest __tests__/unit/workflow/fetch-nodes.test.js` — PASS.

- [ ] **Step 4: Commit.**
```bash
git add reports/__tests__/unit/workflow/fetch-nodes.test.js
git commit -m "test(workflow): drop Container assertions from fetch-nodes evidence shape

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Skill wrapper — `fetch-notion-tokens.js`

**Files:**
- Modify: `.claude/skills/journalist-report/scripts/fetch-notion-tokens.js`

**Interfaces:**
- Consumes: `lib/notion-client.js` (`NotionClient`).
- Produces: identical CLI/IO behavior — flags `--pretty`, `--token-ids=a,b` (comma-sep, lowercased), `--output=path`; `NOTION_TOKEN` from env OR `reports/.env` fallback; output JSON `{ tokens, fetchedAt, totalCount }` to stdout OR `--output` file (dir auto-created); status/errors to **stderr**; `exit(1)` on missing token / API error.

**Implementation note:** This is a behavior-preserving rewrite of a standalone script. **Read the current script first** and preserve every observable behavior (exact flag names, exact error strings, exact output field names, stdout/stderr split, exit codes, file-dir creation). Replace ONLY the inline fetch/parse/SF/resolve logic with a `NotionClient` call. The skill scripts have no automated test harness; verification is a require-load + an operator run (Task 10).

- [ ] **Step 1: Rewrite the body as a thin wrapper.** Keep the shebang, argv parsing, and `.env`/token loading exactly as they are. Replace the fetch/parse/resolve section so `main()` does:
```javascript
const path = require('path');
const { NotionClient } = require(path.join(__dirname, '..', '..', '..', '..', 'lib', 'notion-client'));
// ...existing argv + NOTION_TOKEN loading (unchanged: --pretty, --token-ids, --output, env/.env fallback)...
const client = new NotionClient(NOTION_TOKEN);
const result = await client.fetchMemoryTokens(tokenIds); // tokenIds = parsed --token-ids array or null
// result is already { tokens, fetchedAt, totalCount } with owners resolved — the exact output contract.
// ...existing output routing (unchanged: --output file write with mkdir, else stdout; --pretty; stderr summary; exit codes)...
```
Verify the require path resolves: the script lives at `reports/.claude/skills/journalist-report/scripts/`, which is FOUR levels under `reports/` (`scripts → journalist-report → skills → .claude → reports`), so it's `../../../../lib/notion-client`. The `__dirname`-based `path.join` is cwd-independent; confirm with the load check in Step 2.

- [ ] **Step 2: Syntax + load check.** Run from `reports/`: `node --check .claude/skills/journalist-report/scripts/fetch-notion-tokens.js`. Then a dry require-resolve: `node -e "const {NotionClient}=require('./lib/notion-client'); console.log(typeof NotionClient)"` → `function`.

- [ ] **Step 3: Commit.**
```bash
git add reports/.claude/skills/journalist-report/scripts/fetch-notion-tokens.js
git commit -m "refactor(skill): fetch-notion-tokens is a thin wrapper over shared NotionClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Skill wrapper — `fetch-paper-evidence.js` (incl. downloads)

**Files:**
- Modify: `.claude/skills/journalist-report/scripts/fetch-paper-evidence.js`

**Interfaces:**
- Consumes: `lib/notion-client.js` (`NotionClient` → `fetchPaperEvidence`, `downloadAttachments`).
- Produces: identical CLI/IO — flags `--pretty`, `--with-files`, `--download` (implies files), `--output-dir=` (default `./assets/images/notion`), `--output=`; two-tier `NOTION_TOKEN` env/.env fallback; output JSON `{ evidence, fetchedAt, totalCount }` plus, when `--download`, `downloads: {new, replaced, cached, total}` + `outputDirectory` + `downloadErrors`; stdout=JSON / stderr=logs; `exit(1)` on missing token / API error; **no `containers` in output**.

**Implementation note:** Behavior-preserving rewrite. **Read the current script first.** Preserve flags/env/output/stderr/exit exactly; replace inline fetch/parse/resolve/download with `NotionClient`. The `--download` side effect maps to `client.downloadAttachments(evidence, outputDir)` whose returned `{ newFiles, replacedFiles, cachedFiles, errors }` must be reshaped into the existing output `downloads: { new, replaced, cached, total }` + `downloadErrors` exactly as today.

- [ ] **Step 1: Rewrite the body as a thin wrapper.** `main()` becomes:
```javascript
const path = require('path');
const { NotionClient } = require(path.join(__dirname, '..', '..', '..', '..', 'lib', 'notion-client')); // four levels up to reports/
// ...existing argv (--pretty, --with-files, --download, --output-dir, --output) + NOTION_TOKEN env/.env loading (unchanged)...
const client = new NotionClient(NOTION_TOKEN);
const includeFiles = withFiles || download;
const result = await client.fetchPaperEvidence(includeFiles); // { evidence, fetchedAt, totalCount }; no containers
if (download) {
  const stats = await client.downloadAttachments(result.evidence, outputDir); // mutates files[].localPath
  // reshape into the existing output contract:
  result.downloads = {
    new: stats.newFiles, replaced: stats.replacedFiles, cached: stats.cachedFiles,
    total: stats.newFiles + stats.replacedFiles + stats.cachedFiles
  };
  result.outputDirectory = outputDir;
  if (stats.errors && stats.errors.length) result.downloadErrors = stats.errors;
}
// ...existing output routing (unchanged: --output file write w/ mkdir, else stdout; --pretty; stderr summary; exit codes)...
```
Confirm `downloadAttachments`'s stat keys (`newFiles/replacedFiles/cachedFiles/errors`, per `lib/notion-client.js:356-361`) map to the script's historical `downloads.{new,replaced,cached,total}` shape — adjust the reshape if the current script used different stat names so the output stays byte-identical.

- [ ] **Step 2: Syntax + load check.** Run from `reports/`: `node --check .claude/skills/journalist-report/scripts/fetch-paper-evidence.js`.

- [ ] **Step 3: Commit.**
```bash
git add reports/.claude/skills/journalist-report/scripts/fetch-paper-evidence.js
git commit -m "refactor(skill): fetch-paper-evidence is a thin wrapper (NotionClient + downloadAttachments); drop Container

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Verification + docs

**Files:**
- Modify (docs): `reports/CLAUDE.md` (the Notion/cache section — note the unified `lib/notion/` core + registry + read-time join)

- [ ] **Step 1: Full suite.** Run from `reports/`: `npx jest 2>&1 | tail -12` — expect `0 failed`. Pay attention to: `lib/notion/__tests__/*`, `lib/__tests__/notion-client.test.js`, `lib/__tests__/cache/*`, `lib/__tests__/canonical-characters.test.js`, `lib/__tests__/node-helpers.test.js`, `__tests__/unit/workflow/fetch-nodes.test.js`. If any suite asserted a now-removed `containers` field or the old resolve path, update it to the new behavior and note it in the commit.

- [ ] **Step 2: Load smokes + syntax.** Run:
```bash
node -e "require('./server.js'); require('./lib/cache'); require('./lib/notion-client'); require('./lib/notion/databases'); require('./lib/notion/parse'); require('./lib/notion/relations'); console.log('load OK')"
node --check .claude/skills/journalist-report/scripts/fetch-notion-tokens.js && node --check .claude/skills/journalist-report/scripts/fetch-paper-evidence.js
```
Expect `load OK` and no `node --check` output.

- [ ] **Step 3: Update `reports/CLAUDE.md`.** In the Notion caching section ("Background Images Are in CSS" is unrelated — find the `lib/cache/` / `lib/notion-client.js` description under Key Files), add a concise note:
```markdown
**Notion data layer (unified):** `lib/notion/` is the single source of truth — `databases.js` (DB IDs, query filters, the `RELATION_REGISTRY` + `ENTITY_RELATIONS`), `parse.js` (pure page→element parsers, emit relation IDs not names), `relations.js` (pure registry-driven `applyRelationNames` join). `NotionClient` (uncached) and `CachedNotionClient` (server-only decorator) both consume it; the standalone `journalist-report` skill scripts are thin wrappers over the uncached `NotionClient`. Resolved relation names are produced by a **read-time join**: the cache stores element relation IDs + a separately freshness-checked name table per target DB (`character` ← Characters DB), so renaming a related page (e.g. a character) is reflected on the next fetch without a manual cache clear. Add a resolved relation by adding one `RELATION_REGISTRY` entry. (`Container` is intentionally not resolved — it exists in-game but is irrelevant to reports.)
```

- [ ] **Step 4: Operator verification (manual; no automated harness for these).**
  - **Skill wrappers byte-equivalence:** run `node .claude/skills/journalist-report/scripts/fetch-notion-tokens.js --token-ids=cas001,cas002 --pretty` and a `--download` paper-evidence run; confirm the JSON shape + the `owners` names + (for `--download`) the `downloads` stats + files on disk match prior behavior, and stderr/stdout separation holds.
  - **Cache cold-rebuild + live rename:** delete `data/.cache/notion-cache.db`, restart the server, and confirm the console roster shows current character names; then rename a Character in Notion and confirm the next session fetch reflects it WITHOUT a manual cache clear (the regression this whole change fixes).

- [ ] **Step 5: Commit docs (+ any test fixes from Step 1).**
```bash
git add reports/CLAUDE.md
git commit -m "docs: describe the unified lib/notion data layer + read-time relation join

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Final whole-branch review.** Dispatch a final adversarial reviewer over `git merge-base main HEAD`..HEAD (single source of truth honored; the cache never caches `owners`/disposition; `applyRelationNames` non-mutation preserved end-to-end; the character name-table freshness genuinely invalidates on rename; no remaining Container reads; skill wrappers preserve the full CLI/IO surface; all return-shape contracts intact). Then finish per `superpowers:finishing-a-development-branch`.

---

## Notes / out of scope

- The preprocessor's `token.owner?.logline` read (evidence-preprocessor.js) and the `preprocessed-evidence.schema.json` `ownerLogline` property are downstream of the Notion client and pre-existing; untouched here.
- `scripts/investigate-notion-elements.js` and the legacy `detlogv3.html` debug tool are standalone and left as-is.
- Physical containers are not re-mapped (decision A: dropped from reports).
- `getStats()` in the cache store still reports `tokenCount`/`evidenceCount` only; the new `character` rows are not counted there (cosmetic; out of scope).
