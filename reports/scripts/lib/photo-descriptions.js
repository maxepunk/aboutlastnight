/**
 * The director's photo descriptions for the e2e harness (phase 2 final fix wave).
 *
 * At the character-IDs stop the harness sent only the character ids, so a harness
 * run could never give the writers the director's description of a photo.
 * `--photo-descriptions <file.json>` names a `{filename: description}` map, which
 * rides on every character-IDs approval the harness sends as `photoDescriptions`:
 * the key buildResumePayload (server.js) validates and stores.
 */

const fs = require('fs');

/**
 * Read and check a `{filename: description}` file. The server refuses anything that
 * is not an object of strings, so the harness fails here first, naming the flag.
 *
 * @param {string} filePath
 * @returns {Object<string, string>}
 * @throws {Error} on a missing file, bad JSON, or a value that is not a string
 */
function loadPhotoDescriptionsFile(filePath) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`--photo-descriptions ${filePath}: ${error.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`--photo-descriptions ${filePath}: expected an object of photo filename -> description text`);
  }
  for (const [filename, text] of Object.entries(parsed)) {
    if (typeof text !== 'string') {
      throw new Error(`--photo-descriptions ${filePath}: the description for "${filename}" must be a string`);
    }
  }
  return parsed;
}

/**
 * Add the map to a character-IDs approval. Any other stop, no map, or a payload that
 * already carries its own `photoDescriptions` (an --approve-file) is returned as it is.
 *
 * @param {string} checkpointType
 * @param {Object} approvals - the payload the harness is about to send
 * @param {Object<string, string>|null} photoDescriptions
 * @returns {Object} the payload to send
 */
function withPhotoDescriptions(checkpointType, approvals, photoDescriptions) {
  if (checkpointType !== 'character-ids' || !photoDescriptions) return approvals;
  if (!approvals || typeof approvals !== 'object' || approvals.photoDescriptions !== undefined) return approvals;
  return { ...approvals, photoDescriptions };
}

module.exports = { loadPhotoDescriptionsFile, withPhotoDescriptions };
