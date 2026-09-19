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

// B3: the model is NOT asked to echo the prose back. The caller already holds it,
// and requiring a byte-exact round trip made a single stray character discard the
// entire enrichment (see enrichDirectorNotes).
const DIRECTOR_NOTES_ENRICHED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    characterMentions: {
      type: 'object',
      description: 'Keys = canonical roster names. Arrays = excerpts mentioning each.',
      additionalProperties: {
        type: 'array',
        items: {
          type: 'object',
          required: ['excerpt'],
          properties: {
            excerpt: { type: 'string', description: 'Verbatim passage from the director prose' },
            proseOffset: { type: 'integer', minimum: 0, description: 'Byte index into the director prose' },
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
          proseOffset: { type: 'integer', minimum: 0 },
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
          proseOffset: { type: 'integer', minimum: 0 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'high = speaker named adjacent' }
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
          proseOffset: { type: 'integer', minimum: 0 }
        }
      }
    }
  }
};

const ENRICHMENT_SYSTEM_PROMPT = `You enrich director notes with context-grounded indexes. You do NOT summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*.

Hard rules:
1. Every excerpt and quote you emit is a verbatim substring of the prose; where you would rewrite the director's words, quote them instead.
2. Character mentions use canonical names from the provided <ROSTER> only. Non-roster names go to entityNotes (npcsReferenced for known NPCs from <NPCS>, otherwise leave unflagged).
3. transactionReferences: link an observation to a scoring-timeline row ONLY when timestamp, actor, and amount converge. If no row matches cleanly, emit linkedTransactions: [] with confidence: "low" and a linkReasoning explaining the ambiguity. Do NOT fabricate.
4. quotes: only extract phrases that appear in quotation marks in the prose, or unambiguous direct speech. Preserve wording exactly. confidence: "high" iff speaker is named adjacent to the quote; otherwise "low".
5. postInvestigationDevelopments: only passages with explicit post-investigation temporal markers ("just been announced", "currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article's writing").
6. Never fabricate. Empty arrays are always valid. A missing anchor is better than an invented one.

You are an INDEXER, not a SUMMARIZER.`;

function buildEnrichmentPrompt({
  rawProse,
  roster,
  accusation = null,
  npcs,
  shellAccounts,
  detectiveEvidenceLog,
  scoringTimeline,
  corrections = null
} = {}) {
  // Coerce any non-array input to an empty array for safe downstream handling
  const rosterArr = Array.isArray(roster) ? roster : [];
  const npcsArr = Array.isArray(npcs) ? npcs : [];
  const shellAccountsArr = Array.isArray(shellAccounts) ? shellAccounts : [];
  const evidenceLogArr = Array.isArray(detectiveEvidenceLog) ? detectiveEvidenceLog : [];
  const timelineArr = Array.isArray(scoringTimeline) ? scoringTimeline : [];

  const rosterBlock = rosterArr.length > 0 ? rosterArr.join(', ') : '(none provided)';

  // accusation.accused may arrive as string, array, or missing
  const accusedValue = accusation?.accused;
  const accusedStr = Array.isArray(accusedValue)
    ? (accusedValue.join(', ') || 'unspecified')
    : (typeof accusedValue === 'string' && accusedValue.trim() ? accusedValue : 'unspecified');
  const accusationBlock = accusation
    ? `Accused: ${accusedStr}\nCharge: ${accusation.charge || 'unspecified'}`
    : '(none provided)';

  const npcsBlock = npcsArr.length > 0 ? npcsArr.join(', ') : '(none)';
  const shellAccountsBlock = shellAccountsArr.length > 0
    ? JSON.stringify(shellAccountsArr, null, 2)
    : '(none)';
  const evidenceLogBlock = evidenceLogArr.length > 0
    ? JSON.stringify(evidenceLogArr, null, 2)
    : '(none)';
  const timelineBlock = timelineArr.length > 0
    ? JSON.stringify(timelineArr, null, 2)
    : '(none)';

  // B2: on a re-parse the director rejected the previous parse and typed what was
  // wrong. Placed LAST so it carries the most weight.
  const correctionsBlock = (typeof corrections === 'string' && corrections.trim())
    ? `
<DIRECTOR_CORRECTIONS>
${corrections.trim()}
</DIRECTOR_CORRECTIONS>
Apply these corrections; they override anything in the source text.
`
    : '';

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
1. Every excerpt and quote you emit is a verbatim substring of the prose; where you would rewrite the director's words, quote them instead.
2. Use ONLY roster names from the roster section as keys in characterMentions.
3. Link transactionReferences only when timestamp, actor, and amount converge with the scoring timeline. Otherwise confidence: "low" and empty linkedTransactions.
4. Extract quotes verbatim; confidence "high" iff speaker named adjacent, else "low".
5. postInvestigationDevelopments only for passages with explicit post-investigation markers.
6. Empty arrays are valid. Never fabricate.
</ENRICHMENT_RULES>
${correctionsBlock}`;

  return { systemPrompt: ENRICHMENT_SYSTEM_PROMPT, userPrompt };
}

function createFallback(rawProse) {
  return {
    rawProse: rawProse || '',
    characterMentions: {},
    entityNotes: { npcsReferenced: [], shellAccountsReferenced: [] },
    quotes: [],
    transactionReferences: [],
    postInvestigationDevelopments: []
  };
}

/**
 * Normalize for substring comparison: curly quotes to straight, runs of
 * whitespace to one space. A quote the model retyped with a different dash or
 * line wrap is still the director's quote.
 */
function normalizeForGrounding(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Enrich director prose with four indexes over it.
 *
 * B3: the prose is supplied BY THE CALLER and returned unchanged -- it is never
 * round-tripped through the model. The previous contract required the model to
 * echo rawProse byte-for-byte and discarded the entire payload on any mismatch,
 * which silently emptied the quote and transaction indexes on two of the last
 * three sessions. Only two things now produce a fallback (a thrown SDK call, or
 * a non-object result) and both mark it with `_enrichmentFallback.reason` so the
 * emptiness is visible instead of looking like prose with nothing in it.
 *
 * Quotes are still grounded: one that is not a substring of the prose is dropped
 * and counted in `_enrichmentWarnings.droppedQuotes`.
 *
 * @param {Object} context - { rawProse, roster, accusation, npcs, shellAccounts, detectiveEvidenceLog, scoringTimeline }
 * @param {Function} sdk - sdkQuery-compatible client
 * @returns {Promise<Object>} enriched director notes (never throws)
 */
async function enrichDirectorNotes(context, sdk) {
  const rawProse = context?.rawProse || '';
  if (!rawProse) {
    return createFallback('');
  }

  const { systemPrompt, userPrompt } = buildEnrichmentPrompt(context);

  try {
    const result = await sdk({
      prompt: userPrompt,
      systemPrompt,
      model: 'opus',
      disableTools: true,
      jsonSchema: DIRECTOR_NOTES_ENRICHED_SCHEMA,
      label: 'Director notes enrichment'
    });

    if (!result || typeof result !== 'object') {
      console.warn('[enrichDirectorNotes] SDK returned no object; falling back');
      return { ...createFallback(rawProse), _enrichmentFallback: { reason: 'SDK returned no object' } };
    }

    const proseNorm = normalizeForGrounding(rawProse);
    const quotes = (result.quotes || []).filter(
      q => q && normalizeForGrounding(q.text) && proseNorm.includes(normalizeForGrounding(q.text))
    );
    const droppedQuotes = (result.quotes || []).length - quotes.length;
    if (droppedQuotes > 0) {
      console.warn(`[enrichDirectorNotes] dropped ${droppedQuotes} quote(s) not found verbatim in prose`);
    }

    // Normalize optional fields so downstream consumers always see the expected shape
    return {
      rawProse,
      characterMentions: result.characterMentions || {},
      entityNotes: result.entityNotes || { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes,
      transactionReferences: result.transactionReferences || [],
      postInvestigationDevelopments: result.postInvestigationDevelopments || [],
      ...(droppedQuotes > 0 && { _enrichmentWarnings: { droppedQuotes } })
    };
  } catch (error) {
    console.warn(`[enrichDirectorNotes] SDK call failed: ${error.message}; falling back`);
    return { ...createFallback(rawProse), _enrichmentFallback: { reason: error.message } };
  }
}

module.exports = {
  DIRECTOR_NOTES_ENRICHED_SCHEMA,
  buildEnrichmentPrompt,
  enrichDirectorNotes,
  createFallback
};
