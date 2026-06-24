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
