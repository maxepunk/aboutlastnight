/**
 * Character Data Extraction Node
 *
 * Extracts structured character data (groups, relationships, roles) from
 * the paper documents the director selected + every exposed memory token, each in
 * full, through the record view (brief 2.1). Runs before curation so that
 * character sheet data is captured regardless of curation scoring.
 *
 * Uses Haiku for fast extraction — this is a factual parsing task, not creative.
 */

const { getSdkClient } = require('./node-helpers');
const { traceNode } = require('../../observability');
const { renderRecordView } = require('../../prompt-renderers/record-view');

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
        },
        required: ['groups', 'relationships', 'role']
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
  // The director's selection at the paper-evidence stop, as the preprocessor reads it
  // (brief 2.1). Every fetched item used to go in, including the ones the players never
  // unlocked, so a relationship stated only there could reach the arc and article writers.
  const paperEvidence = state.selectedPaperEvidence || state.paperEvidence || [];
  const tokens = (state.memoryTokens || []).filter(t => t.disposition === 'exposed');

  if (paperEvidence.length === 0 && tokens.length === 0) {
    console.log('[extractCharacterData] No evidence available');
    return { characterData: { characters: {}, source: 'empty' } };
  }

  const sdk = getSdkClient(config, 'extractCharacterData');

  // Every selected paper document and every exposed memory, in full, labelled as the
  // writers see them. The old 30-memory and 200-character caps dropped memories and
  // cut the rest mid-sentence; the whole record fits easily.
  const record = renderRecordView(
    { exposed: { tokens, paperEvidence } },
    { buried: false }
  );

  const prompt = `Extract character relationship data from these documents and memories.

ROSTER (characters in this session): ${roster.join(', ')}

NPCs (not on roster, do NOT create top-level entries for these):
- Marcus Blackwood: the deceased victim, founder of NeurAI
- Blake/Valet: the Black Market operator
- Nova: the journalist narrator
NPCs may appear as relationship targets (e.g., "Marcus": "old friend") but should not have their own character entries.

THE PAPER DOCUMENTS AND EXPOSED MEMORIES:
${record}

For each ROSTER character mentioned in the evidence, extract:
1. Named groups they belong to (e.g., "Stanford Four" — include ALL members of the group)
2. Key relationships with other characters (role-based: "attorney for", "mentor to", "friend of")
3. Their professional/social role

Only include data explicitly stated or strongly implied by the evidence. Do not infer or speculate.`;

  try {
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence. Be factual and precise. Only report what the evidence explicitly states.',
      model: 'haiku',
      jsonSchema: CHARACTER_EXTRACTION_SCHEMA,
      // Inherits the standardized 10-min model default (lib/llm/client.js).
      // Per-call timeout overrides have been removed across the codebase — see
      // git history for the failure cases that motivated standardization.
      disableTools: true,
      label: 'Character data extraction',
      loadProjectSettings: false
    });

    const charCount = Object.keys(result.characters || {}).length;
    console.log(`[extractCharacterData] Extracted data for ${charCount} characters`);

    // Wrap SDK result with metadata (source/extractedAt are node-level, not schema fields)
    return {
      characterData: {
        characters: result.characters || {},
        source: 'extracted',
        extractedAt: new Date().toISOString()
      }
    };
  } catch (error) {
    // N6 fail-loud: empty character data silences the "don't infer group composition"
    // guard, drifting affiliations. Throw so retryPolicy + the pre-node snapshot handle it.
    console.error('[extractCharacterData] Error:', error.message);
    throw new Error(`Failed to extract character data: ${error.message}`, { cause: error });
  }
}

module.exports = {
  extractCharacterData: traceNode(extractCharacterData, 'extractCharacterData', {
    stateFields: ['paperEvidence', 'selectedPaperEvidence', 'memoryTokens']
  }),
  _testing: { extractCharacterData }
};
