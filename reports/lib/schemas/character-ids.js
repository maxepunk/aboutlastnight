/**
 * Character ID Schema and Template
 *
 * Shared between photo-nodes.js and image-prompt-builder.js
 * Extracted to break circular dependency (Commit 8.11 fix)
 *
 * @module lib/schemas/character-ids
 */

/**
 * Template for character ID photo structure - single source of truth (DRY)
 * Used by both PARSED_CHARACTER_IDS_SCHEMA and image-prompt-builder.js
 * to keep schema and prompt examples in sync.
 */
const CHARACTER_IDS_PHOTO_TEMPLATE = {
  filename: '',  // Will be filled with actual filename
  characterMappings: [],
  additionalCharacters: [],
  corrections: {},
  exclude: false
};

/**
 * JSON schema for parsed character ID mappings
 *
 * Commit 8.11+: Changed from additionalProperties (dynamic keys) to array-based
 * structure. The additionalProperties keyword was being interpreted literally
 * by Claude's structured output as a key name instead of a schema construct.
 *
 * Array structure with explicit filename property avoids this ambiguity.
 */
const PARSED_CHARACTER_IDS_SCHEMA = {
  type: 'object',
  required: ['photos'],
  properties: {
    photos: {
      type: 'array',
      items: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string' },
          characterMappings: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                descriptionIndex: { type: 'number' },
                characterName: { type: 'string' }
              },
              required: ['descriptionIndex', 'characterName']
            }
          },
          additionalCharacters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                characterName: { type: 'string' },
                role: { type: 'string' }
              },
              required: ['description', 'characterName']
            }
          },
          corrections: {
            type: 'object',
            properties: {
              location: { type: 'string' },
              context: { type: 'string' },
              other: { type: 'string' }
            }
          },
          exclude: { type: 'boolean' }
        }
      }
    }
  }
};

module.exports = {
  CHARACTER_IDS_PHOTO_TEMPLATE,
  PARSED_CHARACTER_IDS_SCHEMA
};
