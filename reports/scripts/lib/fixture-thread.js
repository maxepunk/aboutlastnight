/**
 * The fixture cutter's pure parts (phase 3 gate, step 4), unit-tested without a
 * database (__tests__/unit/scripts/fixture-thread.test.js).
 *
 *   scripts/cut-fixture-thread.js -> isProductionDb, applyPlants, splitPlants, stopOfWrites
 */
'use strict';

const path = require('path');

/**
 * True when a path names a production checkpoint database: any `checkpoints.sqlite`
 * under a `data` directory. A fixture is always cut from a copy.
 *
 * @param {string} dbPath
 * @returns {boolean}
 */
function isProductionDb(dbPath) {
  const parts = path.resolve(String(dbPath)).split(/[\\/]+/).map((p) => p.toLowerCase());
  return parts[parts.length - 1] === 'checkpoints.sqlite' && parts[parts.length - 2] === 'data';
}

/**
 * Plant cases into a checkpoint's channel values, returning a new object.
 *
 * A key sets one channel, or a nested field with a dotted path
 * (`_arcAnalysisCache.writerQuestions`), creating the objects on the way. A key that
 * starts with `+` appends its value to the array there (`+evaluationHistory`); an
 * array value appends each item. Every other value replaces what was there.
 *
 * @param {Object} channelValues
 * @param {Object} plants
 * @returns {Object}
 */
function applyPlants(channelValues, plants) {
  const out = JSON.parse(JSON.stringify(channelValues || {}));
  for (const [rawKey, value] of Object.entries(plants || {})) {
    const append = rawKey.startsWith('+');
    const keys = (append ? rawKey.slice(1) : rawKey).split('.');
    if (keys.some((k) => !k)) throw new Error(`[fixture-thread] Bad plant key "${rawKey}"`);
    let node = out;
    for (const k of keys.slice(0, -1)) {
      if (node[k] === null || typeof node[k] !== 'object' || Array.isArray(node[k])) node[k] = {};
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (append) {
      const current = node[last] == null ? [] : node[last];
      if (!Array.isArray(current)) throw new Error(`[fixture-thread] "${rawKey}" appends to a value that is not an array`);
      node[last] = current.concat(Array.isArray(value) ? value : [value]);
    } else {
      node[last] = value;
    }
  }
  return out;
}

/**
 * Split plants by where they go. A key that starts with `interrupt:` plants into the
 * stop's own interrupt payload (what the input review reads its session config from);
 * every other key plants into the checkpoint's state. The prefix is removed.
 *
 * @param {Object} plants
 * @returns {{state: Object, interrupt: Object}}
 */
function splitPlants(plants) {
  const state = {};
  const interrupt = {};
  for (const [key, value] of Object.entries(plants || {})) {
    if (key.startsWith('interrupt:')) interrupt[key.slice('interrupt:'.length)] = value;
    else state[key] = value;
  }
  return { state, interrupt };
}

/**
 * The stop a checkpoint is paused at, from its pending writes: the `checkpointType`
 * of an `__interrupt__` write's value, or null.
 *
 * @param {Array<{channel: string, value: *}>} writes - values already parsed
 * @returns {string|null}
 */
function stopOfWrites(writes) {
  for (const w of writes || []) {
    if (w.channel !== '__interrupt__') continue;
    const items = Array.isArray(w.value) ? w.value : [w.value];
    for (const item of items) {
      const v = item && (item.value !== undefined ? item.value : item);
      if (v && typeof v.checkpointType === 'string') return v.checkpointType;
      if (v && typeof v.type === 'string') return v.type;
    }
  }
  return null;
}

module.exports = { isProductionDb, applyPlants, splitPlants, stopOfWrites };
