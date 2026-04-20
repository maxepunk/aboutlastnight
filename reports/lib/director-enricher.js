/**
 * Director Notes Enricher
 *
 * Replaces the legacy Haiku 3-bucket compressor with an Opus-backed enricher
 * that preserves the director's prose verbatim and adds four context-grounded
 * indexes over it (entity resolution, transaction cross-references, quote
 * bank, post-investigation developments).
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

const DIRECTOR_NOTES_ENRICHED_SCHEMA = {
  type: 'object',
  required: ['rawProse'],
  properties: {
    rawProse: {
      type: 'string',
      description: 'Original director prose, verbatim. MUST equal input exactly.'
    },
    characterMentions: {
      type: 'object',
      description: 'Keys = canonical roster names. Arrays = excerpts mentioning each.',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['excerpt'],
          properties: {
            excerpt: { type: 'string', description: 'Verbatim passage from rawProse' },
            proseOffset: { type: 'number', description: 'Byte index into rawProse' },
            timeAnchor: { type: 'string', description: 'Temporal cue if present (e.g., "throughout morning")' },
            linkedCharacters: {
              type: 'array',
              items: { type: 'string' },
              description: 'Co-mentioned roster members'
            },
            kind: { type: 'string', description: 'Freeform tag (e.g., behavioral_pattern, dialogue, interpretation)' }
          }
        }
      }
    },
    entityNotes: {
      type: 'object',
      properties: {
        npcsReferenced: {
          type: 'array',
          items: { type: 'string' },
          description: 'Known NPC names referenced (Blake, Marcus, Nova, etc.)'
        },
        shellAccountsReferenced: {
          type: 'array',
          items: {
            type: 'object',
            required: ['account'],
            properties: {
              account: { type: 'string', description: 'Shell account name as it appears in scoring timeline' },
              directorSuspicion: { type: 'string', description: 'Director\'s stated suspicion or note about this account' }
            }
          }
        }
      }
    },
    transactionReferences: {
      type: 'array',
      items: {
        type: 'object',
        required: ['excerpt', 'linkedTransactions', 'confidence'],
        properties: {
          excerpt: { type: 'string', description: 'Observation text that references a transaction' },
          proseOffset: { type: 'number' },
          linkedTransactions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                timestamp: { type: 'string', description: 'e.g., "09:40 PM"' },
                tokenId: { type: 'string' },
                tokenOwner: { type: 'string' },
                sellingTeam: { type: 'string' },
                amount: { type: 'string', description: 'Formatted string, e.g., "$450,000"' }
              }
            }
          },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          linkReasoning: { type: 'string', description: 'Why these transactions match (or why no match)' }
        }
      }
    },
    quotes: {
      type: 'array',
      items: {
        type: 'object',
        required: ['speaker', 'text'],
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string', description: 'Verbatim quote' },
          addressee: { type: 'string', description: 'Who the speaker was addressing, if known' },
          context: { type: 'string', description: 'Surrounding context from prose' },
          proseOffset: { type: 'number' },
          confidence: { type: 'string', enum: ['high', 'low'], description: 'high = speaker named adjacent' }
        }
      }
    },
    postInvestigationDevelopments: {
      type: 'array',
      items: {
        type: 'object',
        required: ['headline'],
        properties: {
          headline: { type: 'string', description: 'One-line summary of the development' },
          detail: { type: 'string', description: 'Full text from prose' },
          subjects: { type: 'array', items: { type: 'string' }, description: 'Characters involved' },
          bearingOnNarrative: { type: 'string', description: 'Why this matters for the article' },
          proseOffset: { type: 'number' }
        }
      }
    }
  }
};

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA
};
