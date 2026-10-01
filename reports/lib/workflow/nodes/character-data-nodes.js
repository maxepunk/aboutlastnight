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
            description: 'Named groups a document says this character belongs to (e.g., "Stanford Four"); empty when no document names one'
          },
          relationships: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of another character\'s name to the relationship a document states between them; empty when no document states one'
          },
          role: {
            type: 'string',
            description: 'The professional or social role a document states (e.g., "Attorney", "Investor"); left out when no document states one'
          }
        },
        // Phase 3 (3.6): no field the record may not give is required. A role was,
        // so the model gave every character one.
        required: ['groups', 'relationships']
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

  // Phase 3 (3.6): every field rests on a document's own words. The prompt used to
  // accept relationships "strongly implied", ask for ALL members of a group, and give
  // Blake as "the Black Market operator"; Blake and Marcus are now the canon lines
  // (T15, D7).
  const prompt = `Extract character relationship data from these documents and memories.

ROSTER (characters in this session): ${roster.join(', ')}

NPCs (not on the roster, so the result gives them no entry of their own):
- Marcus Blackwood: founder of NeurAI, the man whose death the room investigates
- Blake: manages operations at NeurAI; Marcus called Blake his Valet
- Nova: the NovaNews reporter who writes the article
NPCs may appear as relationship targets (e.g., "Marcus": "old friend").

THE PAPER DOCUMENTS AND EXPOSED MEMORIES:
${record}

For each ROSTER character the documents mention, extract what a document states:
1. groups: each named group (e.g., "Stanford Four") a document names them as a member of.
2. relationships: each relationship a document states between them and another character (e.g., "attorney for", "mentor to", "friend of").
3. role: their professional or social role, when a document states it.

Every entry rests on a document's own words, and a field stays empty when no document states it.`;

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
