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

const ENRICHMENT_SYSTEM_PROMPT = `You enrich director notes with context-grounded indexes. You do NOT summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*.

Hard rules:
1. \`rawProse\` in your output MUST equal the input prose exactly (verbatim, including punctuation, line breaks, and typos).
2. Character mentions use canonical names from the provided <ROSTER> only. Non-roster names go to entityNotes (npcsReferenced for known NPCs from <NPCS>, otherwise leave unflagged).
3. transactionReferences: link an observation to a scoring-timeline row ONLY when timestamp, actor, and amount converge. If no row matches cleanly, emit linkedTransactions: [] with confidence: "low" and a linkReasoning explaining the ambiguity. Do NOT fabricate.
4. quotes: only extract phrases that appear in quotation marks in the prose, or unambiguous direct speech. Preserve wording exactly. confidence: "high" iff speaker is named adjacent to the quote; otherwise "low".
5. postInvestigationDevelopments: only passages with explicit post-investigation temporal markers ("just been announced", "currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article's writing").
6. Never fabricate. Empty arrays are always valid. A missing anchor is better than an invented one.

You are an INDEXER, not a SUMMARIZER. If you find yourself rewriting the director's words, stop — quote them verbatim in excerpts instead.`;

function buildEnrichmentPrompt({
  rawProse,
  roster = [],
  accusation = null,
  npcs = [],
  shellAccounts = [],
  detectiveEvidenceLog = [],
  scoringTimeline = []
}) {
  const rosterBlock = roster.length > 0 ? roster.join(', ') : '(none provided)';
  const accusationBlock = accusation
    ? `Accused: ${(accusation.accused || []).join(', ') || 'unspecified'}\nCharge: ${accusation.charge || 'unspecified'}`
    : '(none provided)';
  const npcsBlock = npcs.length > 0 ? npcs.join(', ') : '(none)';
  const shellAccountsBlock = shellAccounts.length > 0
    ? JSON.stringify(shellAccounts, null, 2)
    : '(none)';
  const evidenceLogBlock = detectiveEvidenceLog.length > 0
    ? JSON.stringify(detectiveEvidenceLog, null, 2)
    : '(none)';
  const timelineBlock = scoringTimeline.length > 0
    ? JSON.stringify(scoringTimeline, null, 2)
    : '(none)';

  const userPrompt = `<ROSTER>
${rosterBlock}
</ROSTER>

<ACCUSATION>
${accusationBlock}
</ACCUSATION>

<NPCS>
${npcsBlock}
</NPCS>

<SHELL_ACCOUNTS>
${shellAccountsBlock}
</SHELL_ACCOUNTS>

<DETECTIVE_EVIDENCE_LOG>
${evidenceLogBlock}
</DETECTIVE_EVIDENCE_LOG>

<SCORING_TIMELINE>
${timelineBlock}
</SCORING_TIMELINE>

<DIRECTOR_NOTES_RAW>
${rawProse}
</DIRECTOR_NOTES_RAW>

<ENRICHMENT_RULES>
1. Preserve rawProse verbatim — your output's rawProse field MUST equal the director notes above, exactly.
2. Use ONLY roster names from the roster section as keys in characterMentions.
3. Link transactionReferences only when timestamp, actor, and amount converge with the scoring timeline. Otherwise confidence: "low" and empty linkedTransactions.
4. Extract quotes verbatim; confidence "high" iff speaker named adjacent, else "low".
5. postInvestigationDevelopments only for passages with explicit post-investigation markers.
6. Empty arrays are valid. Never fabricate.
</ENRICHMENT_RULES>
`;

  return { systemPrompt: ENRICHMENT_SYSTEM_PROMPT, userPrompt };
}

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA,
  buildEnrichmentPrompt
};
