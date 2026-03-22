/**
 * Character Data Extraction Node
 *
 * Extracts structured character data (groups, relationships, roles) from
 * ALL paper evidence + exposed memory tokens. Runs before curation so that
 * character sheet data is captured regardless of curation scoring.
 *
 * Uses Haiku for fast extraction — this is a factual parsing task, not creative.
 */

const { PHASES } = require('../state');
const { getSdkClient } = require('./node-helpers');
const { traceNode } = require('../../observability');

const CHARACTER_EXTRACTION_SCHEMA = {
  type: 'object',
  properties: {
    characters: {
      type: 'object',
      description: 'Map of character first names to their extracted data',
      additionalProperties: {
        type: 'object',
        properties: {
          groups: {
            type: 'array',
            items: { type: 'string' },
            description: 'Named groups this character belongs to (e.g., "Stanford Four", "Ezra\'s mentees")'
          },
          relationships: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of other character names to relationship description'
          },
          role: {
            type: 'string',
            description: 'Professional or social role (e.g., "Attorney", "Bartender", "Investor")'
          }
        }
      }
    }
  },
  required: ['characters']
};

async function extractCharacterData(state, config) {
  // Skip if already extracted
  if (state.characterData) {
    console.log('[extractCharacterData] Skipping — characterData already exists');
    return {};
  }

  const roster = state.sessionConfig?.roster || [];
  const paperEvidence = state.paperEvidence || [];
  const tokens = (state.memoryTokens || []).filter(t => t.disposition === 'exposed');

  if (paperEvidence.length === 0 && tokens.length === 0) {
    console.log('[extractCharacterData] No evidence available');
    return { characterData: { characters: {}, source: 'empty' } };
  }

  const sdk = getSdkClient(config, 'extractCharacterData');

  // Build context from ALL paper evidence (not just curated)
  const paperContext = paperEvidence
    .filter(p => p.description && p.description.length > 20)
    .map(p => `[${p.name}] ${p.description.substring(0, 500)}`)
    .join('\n\n');

  // Build context from exposed tokens (first 200 chars each)
  const tokenContext = tokens
    .slice(0, 30) // Cap to prevent prompt overflow
    .map(t => `[${t.tokenId}] ${(t.fullDescription || t.summary || '').substring(0, 200)}`)
    .join('\n\n');

  const prompt = `Extract character relationship data from these documents and memories.

ROSTER (characters in this session): ${roster.join(', ')}
Marcus Blackwood is the deceased victim (NPC, not on roster).
Blake/Valet is the Black Market operator (NPC, not on roster).

PAPER EVIDENCE:
${paperContext}

EXPOSED MEMORY CONTENT:
${tokenContext}

For each roster character mentioned, extract:
1. Named groups they belong to (e.g., "Stanford Four" — include ALL members)
2. Key relationships with other characters (role-based: "attorney for", "mentor to", "friend of")
3. Their professional/social role

Only include data explicitly stated or strongly implied by the evidence. Do not infer or speculate.`;

  try {
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence. Be factual and precise. Only report what the evidence explicitly states.',
      model: 'haiku',
      jsonSchema: CHARACTER_EXTRACTION_SCHEMA,
      timeoutMs: 60000,
      disableTools: true,
      label: 'Character data extraction'
    });

    const charCount = Object.keys(result.characters || {}).length;
    console.log(`[extractCharacterData] Extracted data for ${charCount} characters`);

    return {
      characterData: {
        characters: result.characters || {},
        source: 'extracted',
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error('[extractCharacterData] Error:', error.message);
    // Non-fatal — pipeline can proceed without character data
    return {
      characterData: { characters: {}, source: 'error', error: error.message }
    };
  }
}

module.exports = {
  extractCharacterData: traceNode(extractCharacterData, 'extractCharacterData', {
    stateFields: ['paperEvidence', 'memoryTokens']
  }),
  _testing: { extractCharacterData }
};
