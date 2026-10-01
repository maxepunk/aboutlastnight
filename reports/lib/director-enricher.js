/**
 * Director Notes Enricher
 *
 * Replaces the legacy Haiku 3-bucket compressor with an Opus-backed enricher
 * that preserves the director's prose verbatim and adds four context-grounded
 * indexes over it (entity resolution, transaction cross-references, quote
 * bank, the epilogue).
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

const { formatAccused, buildParseCorrectionsBlock, normalizeCorrections } = require('./prompt-renderers/director-words-renderer');
const { normalizeForGrounding, isVerbatimIn } = require('./grounding');

/**
 * How a quote's speaker is known: one wording for the schema and both rule lists
 * (M5: the rules said "same sentence" where the schema said "adjacent").
 */
const QUOTE_CONFIDENCE_BANDS =
  '"high" = the prose or a correction names the speaker in the same sentence as the quote; ' +
  '"medium" = the prose names the speaker in the surrounding paragraph, outside the quote\'s sentence; ' +
  '"low" = neither names the speaker, and the speaker is left out.';

/**
 * The quote rule and the epilogue rule, stated once and given in both the system
 * rules and the user rules (phase 3, 3.6). A quote's speaker and wording come from
 * the notes as the director corrected them at the input review; its context is the
 * director's own words; an epilogue item is the director's sentence.
 */
const QUOTE_RULE =
  'quotes: each phrase the prose puts in quotation marks, and each unambiguous direct speech. ' +
  'Copy the wording, the speaker and the addressee as the prose gives them. Where a director\'s correction changes who said a line, ' +
  'to whom, or its wording, take that from the correction and copy the correction into the quote\'s correction field. ' +
  'The context is the director\'s words around the quote, copied from the prose: its sentence, and the sentence that names the speaker when that is another one. ' +
  'Leave the speaker out when neither the prose nor a correction names who said it. Confidence: ' + QUOTE_CONFIDENCE_BANDS;

const EPILOGUE_RULE =
  'postInvestigationDevelopments (the epilogue): each passage with an explicit post-investigation marker ("just been announced", ' +
  '"currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article\'s writing"). ' +
  'Copy the director\'s sentence or sentences into detail, word for word, and list the characters they name in subjects.';

const VERBATIM_RULE =
  'Every excerpt, quote, context and epilogue detail you emit is a verbatim substring of the prose, except a speaker, addressee or wording ' +
  'that a director\'s correction gives, which you copy from that correction; where you would rewrite the director\'s words, quote them instead.';

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
          // Phase 2 final fix wave: a link names its <SCORING_TIMELINE> row by the row's
          // opaque key, and the code maps the key back to the row. The rows are buried
          // memories' sales; they carry no memory id or owner, so the model never sees
          // one and cannot echo one.
          linkedTransactions: {
            type: 'array',
            items: {
              type: 'object',
              required: ['key'],
              additionalProperties: false,
              properties: {
                key: { type: 'string', description: 'The key of the matching <SCORING_TIMELINE> row, exactly as given (e.g., "tx-3")' }
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
        // Phase 3 (3.6): the speaker may be unknown. The words and the director's
        // words around them are always there to give.
        required: ['text', 'context'],
        properties: {
          speaker: { type: 'string', description: 'Who said it, as the prose or a correction names them. Left out when neither does.' },
          text: { type: 'string', description: 'The words said, copied from the prose, or from the correction that gives the wording' },
          addressee: { type: 'string', description: 'Who it was said to, as the prose or a correction names them. Left out when neither does.' },
          context: { type: 'string', description: "The director's words around the quote, copied from the prose: its sentence, and the sentence that names the speaker when that is another one" },
          correction: { type: 'string', description: "The director's correction that changed this quote's speaker, addressee or wording, copied from <DIRECTOR_CORRECTIONS>. Left out when no correction applies." },
          proseOffset: { type: 'integer', minimum: 0 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: QUOTE_CONFIDENCE_BANDS }
        }
      }
    },
    postInvestigationDevelopments: {
      type: 'array',
      description: 'The epilogue: what happened after the investigation, as the director wrote it into the notes',
      items: {
        type: 'object',
        required: ['detail'],
        properties: {
          detail: { type: 'string', description: "The director's sentence or sentences reporting the development, copied from the prose word for word" },
          subjects: { type: 'array', items: { type: 'string' }, description: 'The characters those sentences name, as an index' },
          proseOffset: { type: 'integer', minimum: 0 }
        }
      }
    }
  }
};

/**
 * Above this many characters of prose, an enrichment that indexed NOTHING is
 * treated as a failure rather than an accurate report of empty notes.
 */
const EMPTY_ENRICHMENT_PROSE_THRESHOLD = 400;

const ENRICHMENT_SYSTEM_PROMPT = `You enrich director notes with context-grounded indexes. You do NOT summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*.

Hard rules:
1. ${VERBATIM_RULE}
2. Character mentions use canonical names from the provided <ROSTER> only. Non-roster names go to entityNotes (npcsReferenced for known NPCs from <NPCS>, otherwise leave unflagged).
3. transactionReferences: link an observation to a scoring-timeline row ONLY when timestamp, actor, and amount converge, naming each linked row by its key. If no row matches cleanly, emit linkedTransactions: [] with confidence: "low" and a linkReasoning explaining the ambiguity. Do NOT fabricate.
4. ${QUOTE_RULE}
5. ${EPILOGUE_RULE}
6. Never fabricate. Empty arrays are always valid. A missing anchor is better than an invented one.

You are an INDEXER, not a SUMMARIZER.`;

/**
 * The scoring timeline as the enricher's prompt prints it: each row keyed `tx-1`,
 * `tx-2`, … in order, with its time, type, account (`team`) and amount, and nothing
 * else.
 *
 * The rows are buried memories' sales. Only these fields are read, so a row that
 * still carries its memory id (the projection used to put it in `detail`) cannot
 * print it. The key is the join: the model names a row by it, and
 * resolveTransactionLinks maps it back to the row.
 *
 * @param {Array} scoringTimeline - rows ({time, type, team, amount})
 * @returns {Array<{key: string, time: string, type: string, team: string, amount: string}>}
 */
function keyedScoringTimeline(scoringTimeline) {
  const text = (value) => (value === null || value === undefined ? '' : String(value));
  return (Array.isArray(scoringTimeline) ? scoringTimeline : [])
    .map((row, i) => {
      const r = row && typeof row === 'object' ? row : {};
      return { key: `tx-${i + 1}`, time: text(r.time), type: text(r.type), team: text(r.team), amount: text(r.amount) };
    });
}

/**
 * Map the model's links back to the timeline rows they name, by key. A link whose
 * key names no row is dropped and counted. Each resolved link carries the row's
 * time, amount and account only (the fields a <buried-transactions> line carries),
 * so the stored enrichment holds no memory id or owner either.
 *
 * @param {Array} references - the model's transactionReferences
 * @param {Array} scoringTimeline - the rows the prompt was built from
 * @returns {{transactionReferences: Array, droppedLinks: number}}
 */
function resolveTransactionLinks(references, scoringTimeline) {
  const rowsByKey = new Map(keyedScoringTimeline(scoringTimeline).map(row => [row.key, row]));
  let droppedLinks = 0;
  const transactionReferences = (Array.isArray(references) ? references : [])
    .filter(ref => ref && typeof ref === 'object')
    .map(ref => {
      const linkedTransactions = [];
      for (const link of (Array.isArray(ref.linkedTransactions) ? ref.linkedTransactions : [])) {
        const key = link && typeof link.key === 'string' ? link.key.trim() : '';
        const row = rowsByKey.get(key);
        if (!row) {
          droppedLinks += 1;
          continue;
        }
        linkedTransactions.push({ timestamp: row.time, amount: row.amount.replace(/^\+/, ''), sellingTeam: row.team });
      }
      return {
        excerpt: ref.excerpt,
        ...(Number.isInteger(ref.proseOffset) && { proseOffset: ref.proseOffset }),
        linkedTransactions,
        confidence: ref.confidence,
        ...(typeof ref.linkReasoning === 'string' && { linkReasoning: ref.linkReasoning })
      };
    });
  return { transactionReferences, droppedLinks };
}

/**
 * Keep a transaction link only when the notes hold its observation word for word
 * (phase 3, 3.6 fix). <TRANSACTION_LINKS> prints each link's `excerpt` under a label
 * that calls it the director's words, and a link is the pairing of that observation
 * with sales, so a link whose excerpt the notes do not hold is dropped whole and
 * counted (`droppedExcerpts`).
 *
 * @param {Array} references - the model's transactionReferences
 * @param {string} rawProse - the director's notes
 * @returns {{references: Array, dropped: number}}
 */
function groundLinkExcerpts(references, rawProse) {
  const all = (Array.isArray(references) ? references : []).filter(ref => ref && typeof ref === 'object');
  const kept = all.filter(ref => typeof ref.excerpt === 'string' && isVerbatimIn(ref.excerpt, rawProse));
  return { references: kept, dropped: all.length - kept.length };
}

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
  const timelineArr = keyedScoringTimeline(scoringTimeline);

  const rosterBlock = rosterArr.length > 0 ? rosterArr.join(', ') : '(none provided)';

  // accusation.accused may arrive as string, array, or missing. Brief 2.2: a verdict
  // with no culprit says so instead of naming anyone (formatAccused, shared with the
  // writers), and the parse's notes on the accusation are no longer dropped.
  const accusationLines = accusation
    ? [
        `Accused: ${formatAccused(accusation, { joiner: ', ', empty: 'unspecified' })}`,
        `Charge: ${accusation.charge || 'unspecified'}`,
        ...(typeof accusation.notes === 'string' && accusation.notes.trim()
          ? [`Notes: ${accusation.notes.trim()}`]
          : [])
      ]
    : null;
  const accusationBlock = accusationLines ? accusationLines.join('\n') : '(none provided)';

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
  // wrong. Placed LAST so it carries the most weight. The block is the one every
  // parse prompt shares (brief 2.2); `corrections` is a string or the session's list.
  const correctionsBlock = buildParseCorrectionsBlock(corrections);

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
1. ${VERBATIM_RULE}
2. Use ONLY roster names from the roster section as keys in characterMentions.
3. Link transactionReferences only when timestamp, actor, and amount converge with the scoring timeline, naming each linked row by its key. Otherwise confidence: "low" and empty linkedTransactions.
4. ${QUOTE_RULE}
5. ${EPILOGUE_RULE}
6. Empty arrays are valid. Never fabricate.
</ENRICHMENT_RULES>${correctionsBlock}
`;

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

/** Words in a name that name no one ("the Valet" is named by "Valet"). */
const NAME_FILLER = new Set(['the', 'a', 'an', 'and', 'of', 'to', 'mr', 'ms', 'mrs', 'dr']);

/**
 * Whether one of `sources` names `name` in the director's own words: a word of the
 * name, matched whole and in any case, outside the quoted words themselves. A line
 * such as "Oh, Sam exposed everything." names Sam without saying who spoke it.
 *
 * @param {string} name - a speaker or addressee
 * @param {string[]} sources - the quote's context and correction
 * @param {string} quoteText - the quoted words, which never count as naming
 * @returns {boolean}
 */
function namedOutsideQuote(name, sources, quoteText) {
  const words = (String(name || '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || [])
    .filter(word => word.length >= 2 && !NAME_FILLER.has(word.toLowerCase()));
  if (words.length === 0) return false;
  const quoted = normalizeForGrounding(quoteText);
  return sources.some(source => {
    const outside = quoted ? normalizeForGrounding(source).split(quoted).join(' ') : normalizeForGrounding(source);
    return words.some(word => {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(outside);
    });
  });
}

/**
 * Keep each quote as the director's words give it (phase 3, 3.6).
 *
 * - The words are in the notes, or in the correction that gives the wording;
 *   otherwise the quote is dropped (`droppedQuotes`).
 * - The context is kept only when the notes hold it word for word
 *   (`droppedContexts`), and the correction only when a correction does
 *   (`droppedCorrections`).
 * - The speaker and the addressee are kept only when the kept context or
 *   correction names them outside the quoted words, and never when the quote
 *   carries a correction the corrections do not hold. A speaker left out is not
 *   recorded (`unrecordedSpeakers`), and the quote's confidence is "low".
 *
 * @param {Array} quotes - the model's quotes
 * @param {string} rawProse - the director's notes
 * @param {string[]} corrections - the director's input-review corrections
 * @returns {{quotes: Array, counts: Object}}
 */
function groundQuotes(quotes, rawProse, corrections) {
  const counts = { droppedQuotes: 0, droppedContexts: 0, droppedCorrections: 0, unrecordedSpeakers: 0 };
  const text = (value) => (typeof value === 'string' && value.trim() ? value : null);
  const kept = [];
  for (const q of Array.isArray(quotes) ? quotes : []) {
    const quote = q && typeof q === 'object' ? q : {};
    const words = text(quote.text);
    if (!words || ![rawProse, ...corrections].some(source => isVerbatimIn(words, source))) {
      counts.droppedQuotes += 1;
      continue;
    }
    const context = text(quote.context) && isVerbatimIn(quote.context, rawProse) ? quote.context : null;
    if (text(quote.context) && !context) counts.droppedContexts += 1;
    const correction = text(quote.correction) && corrections.some(c => isVerbatimIn(quote.correction, c)) ? quote.correction : null;
    const correctionFailed = Boolean(text(quote.correction) && !correction);
    if (correctionFailed) counts.droppedCorrections += 1;

    // A correction the director's corrections do not hold still says the director
    // changed this quote, so the notes' own names may be the ones corrected away: the
    // speaker and addressee are left out rather than printed in the wrong mouth (T12).
    const witnesses = correctionFailed ? [] : [context, correction].filter(Boolean);
    const speaker = text(quote.speaker) && namedOutsideQuote(quote.speaker, witnesses, words) ? quote.speaker : null;
    if (text(quote.speaker) && !speaker) counts.unrecordedSpeakers += 1;
    const addressee = text(quote.addressee) && namedOutsideQuote(quote.addressee, witnesses, words) ? quote.addressee : null;

    kept.push({
      ...(speaker && { speaker }),
      ...(addressee && { addressee }),
      text: words,
      ...(context && { context }),
      ...(correction && { correction }),
      ...(Number.isInteger(quote.proseOffset) && { proseOffset: quote.proseOffset }),
      ...(speaker ? (quote.confidence && { confidence: quote.confidence }) : { confidence: 'low' })
    });
  }
  return { quotes: kept, counts };
}

/**
 * Keep each epilogue item as the director's sentence alone (phase 3, 3.6): its
 * `detail` when the notes hold it word for word, with its subjects as an index. The
 * enricher's own headline and "why this matters" are not kept; an item the notes
 * do not hold is dropped (`droppedEpilogueItems`).
 *
 * @param {Array} items - the model's postInvestigationDevelopments
 * @param {string} rawProse - the director's notes
 * @returns {{items: Array, dropped: number}}
 */
function groundEpilogue(items, rawProse) {
  let dropped = 0;
  const kept = [];
  for (const item of Array.isArray(items) ? items : []) {
    const detail = item && typeof item.detail === 'string' ? item.detail : '';
    if (!isVerbatimIn(detail, rawProse)) {
      dropped += 1;
      continue;
    }
    kept.push({
      detail,
      ...(Array.isArray(item.subjects) && { subjects: item.subjects.filter(subject => typeof subject === 'string') }),
      ...(Number.isInteger(item.proseOffset) && { proseOffset: item.proseOffset })
    });
  }
  return { items: kept, dropped };
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
 * and counted in `_enrichmentWarnings.droppedQuotes`. Since phase 3 (3.6) a quote's
 * words may come from a correction instead, its context and correction must be the
 * director's words, its speaker must be named in them, an epilogue item is the
 * director's sentence, and a transaction link's observation is the director's words
 * (groundQuotes, groundEpilogue, groundLinkExcerpts).
 *
 * @param {Object} context - { rawProse, roster, accusation, npcs, shellAccounts, detectiveEvidenceLog, scoringTimeline, corrections }
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
      // Extraction, not judgement. At the client's global xhigh, Opus 4.8 ended its
      // first turn after thinking alone (~320s, no output), the SDK's structured-output
      // enforcement re-requested, and the call cycled for 20 minutes without completing
      // (operator gate 2026-09-19). medium completed in 165s with the full result; high
      // in 375s. The verbatim-substring validation below catches anything a lighter
      // think gets wrong.
      effort: 'medium',
      disableTools: true,
      jsonSchema: DIRECTOR_NOTES_ENRICHED_SCHEMA,
      label: 'Director notes enrichment'
    });

    if (!result || typeof result !== 'object') {
      console.warn('[enrichDirectorNotes] SDK returned no object; falling back');
      return { ...createFallback(rawProse), _enrichmentFallback: { reason: 'SDK returned no object' } };
    }

    // An all-empty but SCHEMA-VALID reply used to be indistinguishable from
    // director notes that genuinely had nothing in them. Over substantial prose
    // it is a failure, and the input-review banner needs to be able to say so.
    const indexedNothing =
      Object.keys(result.characterMentions || {}).length === 0 &&
      (result.quotes || []).length === 0 &&
      (result.transactionReferences || []).length === 0;
    const substantialProse = rawProse.length > EMPTY_ENRICHMENT_PROSE_THRESHOLD;
    if (indexedNothing && substantialProse) {
      console.warn(`[enrichDirectorNotes] model returned no indexes over ${rawProse.length} chars of prose`);
    }

    // Phase 3 (3.6): every quote, context, correction and epilogue item is checked
    // against the director's own words, and a speaker they do not name is left out.
    const { quotes, counts: quoteCounts } =
      groundQuotes(result.quotes, rawProse, normalizeCorrections(context.corrections || []));
    const { items: epilogue, dropped: droppedEpilogueItems } =
      groundEpilogue(result.postInvestigationDevelopments, rawProse);
    const { droppedQuotes, droppedContexts, droppedCorrections, unrecordedSpeakers } = quoteCounts;
    if (droppedQuotes > 0) {
      console.warn(`[enrichDirectorNotes] dropped ${droppedQuotes} quote(s) not found verbatim in the notes or corrections`);
    }
    if (droppedContexts + droppedCorrections + unrecordedSpeakers + droppedEpilogueItems > 0) {
      console.warn(`[enrichDirectorNotes] not in the director's words: ${droppedContexts} context(s), ${droppedCorrections} correction(s), ${unrecordedSpeakers} speaker(s), ${droppedEpilogueItems} epilogue item(s)`);
    }

    // A link's observation is the director's words (phase 3, 3.6 fix). The model
    // names each linked row by its key; the row itself comes from the timeline this
    // call was given (phase 2 final fix wave).
    const { references: groundedLinks, dropped: droppedExcerpts } =
      groundLinkExcerpts(result.transactionReferences, rawProse);
    if (droppedExcerpts > 0) {
      console.warn(`[enrichDirectorNotes] dropped ${droppedExcerpts} transaction link(s) whose observation is not in the notes word for word`);
    }
    const { transactionReferences, droppedLinks } =
      resolveTransactionLinks(groundedLinks, context.scoringTimeline);
    if (droppedLinks > 0) {
      console.warn(`[enrichDirectorNotes] dropped ${droppedLinks} transaction link(s) whose key names no scoring-timeline row`);
    }
    const warnings = {
      ...(droppedQuotes > 0 && { droppedQuotes }),
      ...(droppedLinks > 0 && { droppedLinks }),
      ...(droppedExcerpts > 0 && { droppedExcerpts }),
      ...(droppedContexts > 0 && { droppedContexts }),
      ...(droppedCorrections > 0 && { droppedCorrections }),
      ...(unrecordedSpeakers > 0 && { unrecordedSpeakers }),
      ...(droppedEpilogueItems > 0 && { droppedEpilogueItems })
    };

    // Normalize optional fields so downstream consumers always see the expected shape
    return {
      rawProse,
      characterMentions: result.characterMentions || {},
      entityNotes: result.entityNotes || { npcsReferenced: [], shellAccountsReferenced: [] },
      quotes,
      transactionReferences,
      postInvestigationDevelopments: epilogue,
      ...(Object.keys(warnings).length > 0 && { _enrichmentWarnings: warnings }),
      ...(indexedNothing && substantialProse && {
        _enrichmentFallback: { reason: 'model returned no indexes' }
      })
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
  createFallback,
  keyedScoringTimeline,
  resolveTransactionLinks
};
