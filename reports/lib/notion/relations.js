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
