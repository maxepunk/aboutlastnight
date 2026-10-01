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
const { getThemeNPCEntries } = require('../../theme-config');

/**
 * The NPCs as the canon states them (theme-config.js, spec T15; M26). The journalist
 * entries hold the canon, written theme-neutral; the detective's are parked with the
 * detective (spec D13) and still carry the old wording, so this shared call reads the
 * journalist's whatever the session's theme.
 */
const CANON_NPC_LINES = getThemeNPCEntries('journalist')
  .filter(entry => entry && typeof entry === 'object' && !entry.aliasOf)
  .map(entry => `- ${entry.fullName || entry.name}: ${entry.role}`)
  .join('\n');

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
            description: 'Named groups this character is a member of (e.g., "Stanford Four")'
          },
          relationships: {
            type: 'object',
            additionalProperties: { type: 'string' },
            description: 'Map of another character\'s name to this character\'s relationship to them'
          },
          role: {
            type: 'string',
            description: 'Their professional or social role (e.g., "Attorney", "Investor")'
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
  // (T15, D7). The document-only rule is stated once, last, with its reason (3.6 fix
  // batch, item 5): the field list, the schema and the system prompt only name the
  // fields. Phase 3 (3.2; M26): the NPC lines are theme-config's canon lines, read
  // from there, so the canon is worded once for this call and every writer and judge.
  const prompt = `Extract character relationship data from these documents and memories.

ROSTER (characters in this session): ${roster.join(', ')}

NPCs (not on the roster, so the result gives them no entry of their own):
${CANON_NPC_LINES}
NPCs may appear as relationship targets (e.g., "Marcus": "old friend").

THE PAPER DOCUMENTS AND EXPOSED MEMORIES:
${record}

For each ROSTER character the documents mention, give:
1. groups: the named groups (e.g., "Stanford Four") they are a member of.
2. relationships: their relationship to each other character (e.g., "attorney for", "mentor to", "friend of").
3. role: their professional or social role.

Take each entry from what a document states about that character, and leave a field empty when no document states it. The writers read these entries as what the documents say about each character, so an inferred group, relationship or role would reach the article as a claim no document makes.`;

  try {
    const result = await sdk({
      prompt,
      systemPrompt: 'You extract structured character data from narrative evidence.',
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
