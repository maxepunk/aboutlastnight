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
const { normalizeForGrounding, isVerbatimIn, namedOutsideQuote } = require('./grounding');

/**
 * How a quote's speaker is known: one wording for the schema and the rules
 * (M5: the rules said "same sentence" where the schema said "adjacent").
 */
const QUOTE_CONFIDENCE_BANDS =
  '"high" = the prose or a correction names the speaker in the same sentence as the quote; ' +
  '"medium" = the prose names the speaker in the surrounding paragraph, outside the quote\'s sentence; ' +
  '"low" = neither names the speaker, and the speaker is left out.';

/**
 * The enrichment rules, each stated once per call, in <ENRICHMENT_RULES> after the
 * notes in the user prompt, with its reason (3.6 fix batch, item 5; the system prompt
 * points there by the tag alone, since the corrections block follows the rules when
 * there are corrections: 3.6b fix batch, finding 4). Code keeps a context, an epilogue detail or a link's observation
 * only when the notes hold it as one piece (groundQuotes, groundEpilogue,
 * groundLinkExcerpts), so the quote and epilogue rules ask for one unbroken passage
 * (item 1). A link needs the notes to describe the sale; an account's name never
 * makes one (item 9, T4).
 */
const VERBATIM_RULE =
  'Every excerpt, quote, context and epilogue detail you emit is a verbatim substring of the prose, except a speaker, addressee or wording ' +
  "that a director's correction gives, which you copy from that correction; where you would rewrite the director's words, quote them instead. " +
  "The writers print these as the director's own words, so code keeps only what the prose or a correction holds word for word.";

/**
 * The roster and empty rules (3.6b fix batch, finding 5): stated as what to do, each
 * with its reason. The input review's character-mentions panel (InputReview.js
 * CharacterMentionsSection) lists the mentions under each roster name, and every
 * index reaches the writers or the director as resting on the notes.
 */
const ROSTER_RULE =
  "characterMentions: key each entry by the character's name as <ROSTER> gives it, and list a known NPC from <NPCS> in entityNotes.npcsReferenced; " +
  'a name on neither list stays in the excerpts that carry it. ' +
  "The input review shows each character's mentions under that character's roster name, so an entry keyed by any other name never reaches the director.";

const LINK_RULE =
  'transactionReferences: link an observation to a <SCORING_TIMELINE> row only when the notes describe that sale ' +
  '(someone seen selling, or a deal with Blake) and its time and amount converge with the row, naming each linked row by its key. ' +
  "An account's name matching a character never makes a link: a seller can give an account any name, another character's included, " +
  'so the name says nothing about who sold. When no row matches cleanly, emit linkedTransactions: [] with confidence: "low" ' +
  'and a linkReasoning explaining the ambiguity.';

const QUOTE_RULE =
  'quotes: each phrase the prose puts in quotation marks, and each unambiguous direct speech. ' +
  "Copy the wording, the speaker and the addressee as the prose gives them. Where a director's correction changes who said a line, " +
  "to whom, or its wording, take that from the correction and copy the correction into the quote's correction field. " +
  "The context is one unbroken passage copied whole from the prose: the quote's sentence, together with the sentence that names the speaker " +
  'and every sentence between them when that is another one. ' +
  'Leave the speaker out when neither the prose nor a correction names who said it. ' +
  "The writers print each line in its speaker's mouth, so code keeps a speaker only when the context or correction you copy names them. " +
  'Confidence: ' + QUOTE_CONFIDENCE_BANDS;

const EPILOGUE_RULE =
  'postInvestigationDevelopments (the epilogue): each passage with an explicit post-investigation marker ("just been announced", ' +
  '"currently whereabouts unknown", "is on his way to", "following the investigation", "at the time of this article\'s writing"). ' +
  "Copy each item's detail word for word as one unbroken passage of the prose (a development the notes report in two separate places is two items), " +
  'and list the characters it names in subjects. ' +
  "The writers take the article's follow-up news from these details alone, printed as the director's own words.";

const EMPTY_RULE =
  'When the notes hold nothing for an index, return that index empty: [] for a list, {} for characterMentions. ' +
  'Each entry reaches the writers or the director as resting on the notes, so an empty index is a complete and correct answer.';

const ENRICHMENT_RULES = [VERBATIM_RULE, ROSTER_RULE, LINK_RULE, QUOTE_RULE, EPILOGUE_RULE, EMPTY_RULE];

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
        // words around them are always there to give. The descriptions give each
        // field's shape; the one-passage rule is in QUOTE_RULE and EPILOGUE_RULE alone
        // (3.6b fix batch, finding 1), since this schema reaches the model too.
        required: ['text', 'context'],
        properties: {
          speaker: { type: 'string', description: 'Who said it, as the prose or a correction names them' },
          text: { type: 'string', description: 'The words said, copied from the prose, or from the correction that gives the wording' },
          addressee: { type: 'string', description: 'Who it was said to, as the prose or a correction names them' },
          context: { type: 'string', description: "The director's words around the quote" },
          correction: { type: 'string', description: "The director's correction that changed this quote's speaker, addressee or wording, copied from <DIRECTOR_CORRECTIONS>" },
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
          detail: { type: 'string', description: "The director's sentence or sentences reporting the development" },
          subjects: { type: 'array', items: { type: 'string' }, description: 'The characters the detail names, as an index' },
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

const ENRICHMENT_SYSTEM_PROMPT = `You enrich director notes with context-grounded indexes. You do NOT summarize, paraphrase, or compress. The director's prose is the source of truth; your job is to build *indexes into it*. The rules for every index are in <ENRICHMENT_RULES>.

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
${ENRICHMENT_RULES.map((rule, i) => `${i + 1}. ${rule}`).join('\n')}
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

/**
 * The passages a piece of text puts in double quotation marks, normalized as
 * isVerbatimIn reads them (curly marks straightened).
 *
 * @param {*} value
 * @returns {string[]}
 */
function quotedPassages(value) {
  return (normalizeForGrounding(value).match(/"[^"]+"/g) || [])
    .map(passage => passage.slice(1, -1).trim())
    .filter(Boolean);
}

/**
 * Whether a director's correction is about this quote (task 3.11): it shares a quoted
 * fragment with the quote's words, or with the quoted passage of the quote's context,
 * one holding the other word for word as isVerbatimIn reads them. 092026's correction
 * quotes "My company is very interesting", a sentence of the passage its context
 * quotes.
 *
 * @param {string} correction - one of the director's input-review corrections
 * @param {string} words - the quote's words
 * @param {string|null} context - the quote's context
 * @returns {boolean}
 */
function correctionQuotesTheLine(correction, words, context) {
  const lines = [words, ...quotedPassages(context)];
  return quotedPassages(correction).some(fragment =>
    lines.some(line => isVerbatimIn(fragment, line) || isVerbatimIn(line, fragment)));
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
 *   correction names them outside the quoted words (namedOutsideQuote, which the
 *   renderer shares), and never when the quote carries a correction the corrections
 *   do not hold, or carries none while one of the director's corrections quotes the
 *   line (task 3.11). A speaker left out is not recorded (`unrecordedSpeakers`), and
 *   the quote's confidence is "low".
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

    // Task 3.11: a correction of the director's that quotes this line, which the model
    // did not attach. It decides the speaker and addressee in place of the notes, but
    // a correction names the old speaker as well as the new one ("attributed to Vic …
    // said by Blake"), so code cannot read the speaker from it.
    const unattachedCorrection = !text(quote.correction)
      && corrections.some(c => correctionQuotesTheLine(c, words, context));

    // A correction the director's corrections do not hold, or one of theirs the model
    // did not attach, says the director changed this quote, so the notes' own names may
    // be the ones corrected away: the speaker and addressee are left out rather than
    // printed in the wrong mouth (T12).
    const witnesses = correctionFailed || unattachedCorrection ? [] : [context, correction].filter(Boolean);
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
