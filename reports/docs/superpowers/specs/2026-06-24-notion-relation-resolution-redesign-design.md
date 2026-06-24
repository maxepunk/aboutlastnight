# Notion Relation-Resolution & Cache Redesign — Design

**Status:** Approved (brainstorming complete). Next step: implementation plan (`writing-plans`).
**Date:** 2026-06-24
**Branch:** `feat/notion-relation-cache-redesign`

## Goal

Make the Notion data-access + caching layer **correct under relation changes** and **maintainable/extensible**, by unifying three duplicated fetch paths into one source of truth and making relation resolution correct-by-construction. The trigger: the roster UI showed a stale character name ("Tori Zhang" for a character renamed to "Cass Zhang") because the cache bakes *resolved relation names* into cached element blobs and only freshness-checks each element's own timestamp — so renaming the *related* Character page never invalidates the elements that point at it. This is a general silent-staleness class for any cached resolved relation.

## Background / root cause (grounded, verified)

- The pipeline reads one Notion database, **ELEMENTS_DB** (`18c2f33d-583f-8020-91bc-d84c7dd94306`, "About Last Night…Elements"), holding both memory tokens and paper evidence (split by `Basic Type`). The Notion API version pinned is `2022-06-28`.
- The only relation resolved to names is **`Owner`**, which points to a **separate** database, **CHARACTERS_DB** (`18c2f33d-583f-8060-a6ab-de32ff06bca2`, "About Last Night…Characters") — **25 pages**, `Name` title + `Last edited time`. `extractCanonicalCharacters` derives `canonicalCharacters` (firstName→fullName) from `token.owners`.
- The cache (`lib/cache/cached-notion-client.js`) does a two-phase fetch: a light timestamp fetch of ELEMENTS_DB, a freshness check (`fresh`/`stale`/`new`/`deleted`) against each element's own `last_edited_time`, then full-fetches only stale/new elements, resolves `Owner` to names, and **stores the resolved `owners` names in the element blob, discarding `ownerIds`** (`resolveRelationNames` deletes the id field). Notion's `last_edited_time` reflects edits to a page's *own* content, not pages it relates to — so a Character rename never bumps the element, the element stays `fresh`, and the stale resolved name persists until the element itself is edited or the cache is cleared.
- **Three duplicated fetch+parse+resolve implementations exist:** `lib/notion-client.js` (raw `NotionClient`), `lib/cache/cached-notion-client.js` (re-implements `_parseTokenPage`/`_parseEvidencePage` + filters), and the two standalone `.claude/skills/journalist-report/scripts/{fetch-notion-tokens,fetch-paper-evidence}.js`. Duplication is *why* this class of bug drifts between copies (and why the dead `Container` read survives in all three).
- **`Container` is currently dead but was historically live.** Today's ELEMENTS_DB has no `Container` relation (only `Container Puzzle` → a Puzzles DB), so `props['Container']` is always `undefined` → `containers` is always `[]`. But a legacy session snapshot (`data/20251221/fetched/paper-evidence.json`, Dec 2025) has 32 evidence items with real `containers` ("Coat Check", "Sarah's black purse", …) — the relation was live and the schema later changed. Decision: physical containers stay in the game but are **not relevant to post-game reports**, so the report pipeline drops `Container` entirely.

## Decisions (settled during brainstorming)

1. **Scope = unify everywhere (C):** one Notion data-access layer used by both the server pipeline *and* the standalone skill scripts.
2. **Skill integration = thin wrappers over the *uncached* `NotionClient` (A):** skill scripts `require` the shared client and stay fresh/uncached (they never had the staleness bug). The SQLite cache stays a server-only decorator.
3. **Core mechanism = read-time join over freshness-checked name tables, registry-driven (1):** cache stores element relation **IDs** + a separate, independently freshness-checked **name table** per target DB; resolution is a read-time join driven by a declarative **relation registry**.
4. **`Container` = drop (A):** remove the dead parse/resolve + the always-empty `containers` field; update the tests/fixtures that name it.

## Architecture

Three layers with a single shared core:

```
lib/notion/                          ← NEW shared core (single source of truth)
  databases.js  — ELEMENTS_DB_ID, CHARACTERS_DB_ID, the token/evidence query filters,
                  the RELATION_REGISTRY + ENTITY_RELATIONS (declarative config)
  parse.js      — pure: extractRichText, parseSFFields, parseTokenPage(page),
                  parseEvidencePage(page)  (page → parsed element with relation *IDs*)
  relations.js  — pure: applyRelationNames(elements, entityType, nameMapsByTargetDb)
                  (registry-driven JOIN: idField → nameField)

lib/notion-client.js                 ← NotionClient (uncached source of truth)
  uses lib/notion/*; request/downloadFile/downloadAttachments unchanged.
  Resolution path: fetch target-DB names live → applyRelationNames.

lib/cache/cached-notion-client.js    ← decorator (server-only)
  uses the SAME lib/notion/parse + relations. Stores element blobs WITH relation IDs
  (not resolved names) + a freshness-checked "character" name-table entity type.
  Resolution path: freshness-checked name table → applyRelationNames at read time.

.claude/skills/journalist-report/scripts/{fetch-notion-tokens,fetch-paper-evidence}.js
  ← thin wrappers over the uncached NotionClient (preserve CLI/env/IO/exit codes exactly)
```

**Design principle:** name-map *acquisition* differs by layer (raw = live page fetch; cache = freshness-checked table), but the *join* is one shared registry-driven pure function. A new resolved relation is one registry entry, correct-by-construction in both layers.

## Components

### `lib/notion/databases.js`
- Exports `ELEMENTS_DB_ID`, `CHARACTERS_DB_ID`, `NOTION_VERSION`.
- Exports the query filters as data: `TOKEN_FILTER` (Basic Type ∈ the 4 Memory Token variants) and `EVIDENCE_FILTER` (Basic Type ∈ {Prop, Document, Set Dressing} AND Narrative Threads ∈ the 4 threads). These are currently duplicated in 4 places; centralize here.
- Exports the registry:
  ```js
  const RELATION_REGISTRY = {
    Owner: { notionProperty: 'Owner', idField: 'ownerIds', nameField: 'owners',
             targetDb: CHARACTERS_DB_ID, cacheType: 'character' },
  };
  const ENTITY_RELATIONS = { memory_token: ['Owner'], paper_evidence: ['Owner'] };
  ```
  Adding a future resolved relation = one `RELATION_REGISTRY` line + its entity listing; both layers pick it up.

### `lib/notion/parse.js` (pure)
- `extractRichText(arr)`, `parseSFFields(descText)` (moved verbatim from `NotionClient`).
- `parseTokenPage(page)` → `{ notionId, tokenId, name, fullDescription, summary, valueRating, memoryType, group, basicType, ownerIds }` or `null` if no `tokenId`. (Replaces the duplicated logic in `NotionClient.fetchMemoryTokens` and `CachedNotionClient._parseTokenPage`.)
- `parseEvidencePage(page)` → `{ notionId, name, basicType, description, narrativeThreads, ownerIds, files? }`. **No `containerIds`.** (Replaces both duplicated copies.)
- Parsing populates each registered relation's `idField` for the entity type. No name resolution here.

### `lib/notion/relations.js` (pure)
- `applyRelationNames(elements, entityType, nameMapsByTargetDb) → elements'` — **pure; returns NEW objects, never mutates inputs.** For each relation registered for `entityType`, the returned object gains `nameField = idField.map(id => nameMapsByTargetDb[targetDb]?.[id] ?? 'Unknown')` and **omits** `idField` (preserving today's output shape: names present, ids removed). Non-mutation is load-bearing in the cache: the persisted element blob keeps `ownerIds` for the *next* read-time join; only the per-fetch returned objects carry resolved `owners`. `nameMapsByTargetDb` is `{ [targetDb]: { [pageId]: Name } }`, supplied by the caller (raw: live fetch; cache: freshness-checked table).

### `lib/notion-client.js` (refactored, uncached source of truth)
- `fetchMemoryTokens(tokenIds)` / `fetchPaperEvidence(includeFiles)`: query ELEMENTS_DB via the shared filters, parse via `lib/notion/parse`, build name maps by fetching the registered target pages' `Name` for the IDs present (a `resolveRelationNames`-equivalent that returns a `{targetDb: {id: name}}` map), then `applyRelationNames`. Return `{tokens|evidence, fetchedAt, totalCount}`.
- Keep `request`, `downloadFile`, `downloadAttachments`, `createNotionClient`, `ELEMENTS_DB_ID` export (re-export from `databases.js`), constructor (token required), error contract. Skill scripts and the server startup probe depend on these.

### `lib/cache/cached-notion-client.js` (refactored decorator)
- Cache entity types: `memory_token`, `paper_evidence` (blobs now retain `ownerIds`, no resolved names), and new **`character`** (`notionId → Name` from CHARACTERS_DB).
- `_fetchFullEntities` parses via `lib/notion/parse` (no more private `_parseTokenPage`/`_parseEvidencePage`); blobs carry `ownerIds`.
- New `_ensureNameTable(targetDb, cacheType)`: light-fetch the target DB's `{id, last_edited_time}`, `checkFreshness(cacheType, …)`, full-fetch stale/new pages (`id → Name`), upsert; return the in-memory `{id: Name}` map. Shared across token + evidence fetches in one call.
- On `fetchMemoryTokens`/`fetchPaperEvidence`: do the element two-phase fetch (unchanged), ensure the name tables for the entity's registered relations are fresh, then `applyRelationNames(elements, entityType, nameMaps)` at read time. Return `{…, fetchedAt, totalCount, cacheStats?}`.
- Keep the singleton (`createCachedNotionClient`), `resetCachedNotionClient`, `close`, `clearCache`, `invalidateAll`, `getUnderlyingClient`, `getStats`, and the cache-error→uncached-fallback try/catch.

### Skill scripts → thin wrappers
- Preserve the full CLI/behavior surface: `fetch-notion-tokens.js` (`--pretty`, `--token-ids`, `--output`); `fetch-paper-evidence.js` (`--pretty`, `--with-files`, `--download`, `--output-dir`, `--output`); two-tier `NOTION_TOKEN` env/.env fallback; strict stdout=JSON / stderr=logs; exit(1) on missing token / API error; file download via `downloadAttachments` on `--download` with the `{new,replaced,cached,total}` stats + `outputDirectory` + `downloadErrors`.
- Body becomes: parse argv → load token → `new NotionClient(token)` → `fetchMemoryTokens`/`fetchPaperEvidence` (+ `downloadAttachments` if `--download`) → assemble the documented output JSON → write/stdout → stderr logs → exit. No reimplemented fetch/parse/resolve/filters.

## Data flow (cached token fetch)

1. Light-fetch ELEMENTS_DB token timestamps → `checkFreshness('memory_token', …)`.
2. Full-fetch stale/new token pages → `parseTokenPage` → blobs with `ownerIds` → upsert.
3. `_ensureNameTable(CHARACTERS_DB_ID, 'character')`: light-fetch Characters timestamps → `checkFreshness('character', …)` → full-fetch renamed/new characters → upsert → return `{id: Name}`.
4. `applyRelationNames(tokens, 'memory_token', { [CHARACTERS_DB_ID]: nameMap })` → returns tokens with `owners` (names) and no `ownerIds`; the persisted cache blobs keep `ownerIds`.
5. Return `{ tokens, fetchedAt, totalCount, cacheStats }`. Disposition is grafted later by `tagTokensWithDisposition` (not cached).

A Character rename bumps that page's `last_edited_time` → step 3 marks it stale → name table updated → step 4 yields the new name, with the element cache untouched.

## Migration

- Bump `SCHEMA_VERSION` in `lib/cache/notion-cache-store.js` (currently `'1'` → `'2'`). On open, a version mismatch clears the cache (existing behavior) — legacy blobs have resolved `owners` and no `ownerIds`, so they must not survive into the read-time join. Result: one cold re-fetch after deploy. No lazy migration.

## Preserved contracts (must not break)

- Return shapes `{ tokens|evidence, fetchedAt, totalCount, cacheStats? }`; `cacheStats` optional (mocks omit it).
- Returned tokens/evidence carry **`owners: string[]` (resolved names)** — consumed by `extractCanonicalCharacters` (node-helpers.js:966), `ai-nodes.js:193` (curation scoring), and `ai-nodes.js:398` (rawData spread into the exposed bundle). The cache stores IDs; the *return value* carries names.
- `canonicalCharacters` (firstName→fullName) unchanged.
- `disposition` and buried-transaction data are session-specific and stay **out** of the cache (grafted post-fetch).
- Singular `owner`/`ownerLogline` are synthesized downstream (preprocessor/curation) and are **not** part of the Notion-client contract; do not introduce or rename them here.
- Test-injection seam: `config.configurable.notionClient` (mock) vs the `createCachedNotionClient()` singleton (`getNotionClient`, fetch-nodes.js:43-50).
- Singleton lifecycle + `resetCachedNotionClient()` on SIGINT (server.js shutdown). Uncached startup probe `request('users/me')`.
- Skill script CLI/env/IO/exit-code surface (above), and `downloadFile`/`downloadAttachments`.

## Error handling

- Unresolved/deleted relation target (name-table miss or live-fetch failure) → `'Unknown'` (today's behavior).
- Cache errors → fall back to the uncached `NotionClient` (existing try/catch in each cached method).
- Notion API non-2xx → throw `Notion API error: …` (existing). Missing `NOTION_TOKEN` → throw (existing).

## Testing

**New (pure, node-env):**
- `lib/notion/parse` — token/evidence parsing incl. SF fields, trailing-space handling, no-tokenId → null, no `containerIds` emitted.
- `lib/notion/relations#applyRelationNames` — registry join, multiple IDs, `'Unknown'` fallback, `idField` removed, names present.
- Cache character name-table freshness + read-time join — **the regression test that started this: a Character rename invalidates only the name-table row and updates `owners`, with the element cache untouched** (assert element rows not re-fetched). Plus: a new character page → table grows; a deleted character → `'Unknown'`.
- `SCHEMA_VERSION` bump clears legacy blobs (no `ownerIds` rows surviving).

**Preserved / updated:**
- `lib/__tests__/notion-client.test.js` (now exercises the shared parse path; container assertions removed), the cache store/freshness tests (add the `character` entity type), `__tests__/unit/workflow/fetch-nodes.test.js` (container field removed; token/evidence shape otherwise unchanged), `lib/__tests__/canonical-characters.test.js` and `node-helpers.test.js` (unchanged — still `owners[]`→firstName).
- Full `npx jest` green.

**Operator-verified (no automated harness):**
- The two skill wrappers produce byte-equivalent output + side effects on a real run (`--token-ids`/`--output`, and `--download`/`--output-dir`).
- After deploy: the live console roster shows the current character names (cache cold-rebuilds via the SCHEMA_VERSION bump), and a subsequent Character rename in Notion is reflected on the next fetch without a manual cache clear.

## Out of scope (explicitly)

- The preprocessor's `token.owner?.logline` read (evidence-preprocessor.js:230/510) is a pre-existing shape mismatch (Notion never emits a nested `owner.logline`); not introduced or fixed here.
- The `preprocessed-evidence.schema.json` `ownerLogline` property (downstream of the preprocessor) is untouched.
- The legacy `detlogv3.html` debug tool and `scripts/investigate-notion-elements.js` (standalone, not part of the pipeline) are left as-is.
- Re-mapping physical containers to their current Notion home (decision A: drop from reports).
