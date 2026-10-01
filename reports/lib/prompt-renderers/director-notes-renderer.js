/**
 * Director Notes Enrichment Renderer
 *
 * Produces the XML-tagged director-notes block consumed by:
 * - lib/workflow/nodes/arc-specialist-nodes.js (buildCoreArcPrompt, buildArcRevisionPrompt)
 * - lib/prompt-builder.js (buildOutlinePrompt, buildArticlePrompt)
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

const { renderDirectorCorrectionsBlock, normalizeCorrections } = require('./director-words-renderer');
const { buriedTransactionFields } = require('./record-view');
const { sessionClockOf } = require('./session-clock');
const { DERIVED_LABELS } = require('./derived-labels');
const { isVerbatimIn } = require('../grounding');

/** What a quote whose speaker the notes do not record prints in the speaker's place. */
const SPEAKER_NOT_RECORDED = '(speaker not recorded)';

/**
 * One quote of <QUOTE_BANK> (phase 3, 3.6): its speaker, or "speaker not recorded",
 * then the director's words around it and the correction that applied, each on its
 * own line. A line is printed only when the notes, or the corrections, hold it word
 * for word: a thread enriched before 3.6 stored the enricher's own prose as context
 * (092026), and the line's label says it is the director's words.
 *
 * @param {Object} quote - a stored quote ({speaker?, addressee?, text, context?, correction?})
 * @param {string} rawProse - the director's notes
 * @param {string[]} corrections - the director's input-review corrections
 * @returns {string}
 */
function quoteEntry(quote, rawProse, corrections) {
  const speaker = typeof quote.speaker === 'string' ? quote.speaker.trim() : '';
  // An enricher from before 3.6 wrote "unknown" where it could not name the speaker.
  const who = speaker && speaker.toLowerCase() !== 'unknown' ? speaker : SPEAKER_NOT_RECORDED;
  const lines = [`- ${who}${quote.addressee ? ` (to ${quote.addressee})` : ''}: "${quote.text}"`];
  if (quote.context && isVerbatimIn(quote.context, rawProse)) {
    lines.push(`  In the notes: ${quote.context}`);
  }
  if (quote.correction && corrections.some(c => isVerbatimIn(quote.correction, c))) {
    lines.push(`  The director's correction: ${quote.correction}`);
  }
  return lines.join('\n');
}

/**
 * The epilogue as the director wrote it (phase 3, 3.6): each item's `detail` that
 * the notes hold word for word. An item stored before 3.6 also carries the
 * enricher's headline, subjects and "why this matters"; only its detail prints, and
 * an item with no detail prints nothing.
 *
 * @param {Array} items - stored postInvestigationDevelopments
 * @param {string} rawProse - the director's notes
 * @returns {string[]}
 */
function epilogueSentences(items, rawProse) {
  return (Array.isArray(items) ? items : [])
    .map(item => (item && typeof item.detail === 'string' ? item.detail.trim() : ''))
    .filter(detail => detail && isVerbatimIn(detail, rawProse));
}

/**
 * One linked transaction, as account, amount and time only, through the record
 * view's own transaction formatter, with the time on the session clock (phase 3,
 * brief 3.5: every logged time a prompt prints goes through the one clock, so an
 * evening session's links read the morning times the timeline reads).
 *
 * The transactions the enricher links are buried memories. A thread enriched before
 * the phase 2 final fix wave stored each with its memory id and owner (`tokenId`,
 * `tokenOwner`), and this line printed the id, whose prefix names the owner, to every
 * writer, reworker and judge. Only the three transaction fields are read here, so
 * neither can reach a prompt whatever a stored link carries.
 *
 * @param {Object} tx - a linked transaction ({timestamp, amount, sellingTeam})
 * @param {Object|null} [sessionConfig] - the session's parse, whose clock decision
 *   (session-clock.js sessionClockOf) the time prints on; without it, as logged. The
 *   callers pass it through withSessionClock with the bundle, so a thread with no
 *   stamped clock reads the decision the record view's timeline reads
 * @returns {string}
 */
function linkedTransactionLine(tx, sessionConfig = null) {
  const link = tx && typeof tx === 'object' ? tx : {};
  const clock = sessionConfig ? sessionClockOf(sessionConfig) : null;
  return buriedTransactionFields({ account: link.sellingTeam, amount: link.amount, time: link.timestamp }, clock);
}

/**
 * Render the enriched director-notes block as XML tags.
 *
 * @param {Object} ctx - Director-notes context
 * @param {string} [ctx.rawProse] - Verbatim director prose
 * @param {Array} [ctx.quotes] - Extracted quotes, each printed with the director's
 *   words around it (see quoteEntry)
 * @param {Array} [ctx.transactionReferences] - Observation → transaction links
 *   (each transaction printed as account, amount and time only)
 * @param {Array} [ctx.postInvestigationDevelopments] - The epilogue items, printed as
 *   the director's sentences under <EPILOGUE> (see epilogueSentences)
 * @param {string[]|string|null} [ctx.corrections] - the director's input-review
 *   corrections, in order (phase 2, brief 2.2). They follow the notes, which are
 *   never rewritten: the uncorrected sentence stays, and the correction sits beside it.
 * @param {Object|null} [ctx.sessionConfig] - the session's parse, for the session clock
 *   the transaction links print their times on (phase 3, brief 3.5); without it the
 *   times print as logged
 * @returns {string} Multi-block XML-tagged string. Omits optional blocks when their arrays are empty.
 */
function renderDirectorEnrichmentBlock({
  rawProse = '',
  quotes = [],
  transactionReferences = [],
  postInvestigationDevelopments = [],
  corrections = null,
  sessionConfig = null
} = {}) {
  const blocks = [];

  blocks.push(`<DIRECTOR_NOTES>
${rawProse || '(no director notes provided)'}
</DIRECTOR_NOTES>`);

  const correctionsBlock = renderDirectorCorrectionsBlock(corrections);
  if (correctionsBlock) blocks.push(correctionsBlock);

  if (quotes.length > 0) {
    const correctionList = normalizeCorrections(corrections);
    const lines = quotes
      .filter(q => q && typeof q === 'object')
      .map(q => quoteEntry(q, rawProse, correctionList))
      .join('\n');
    blocks.push(`<QUOTE_BANK>
${DERIVED_LABELS.directorNotesIndex}
The lines the director's notes quote, each with its speaker as the notes and corrections give it:
${lines}
</QUOTE_BANK>`);
  }

  if (transactionReferences.length > 0) {
    const lines = transactionReferences.map(t => {
      const txs = (t.linkedTransactions || []).map((tx) => linkedTransactionLine(tx, sessionConfig)).join('; ');
      return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
    }).join('\n');
    blocks.push(`<TRANSACTION_LINKS>
${DERIVED_LABELS.transactionLinks}
Each line: an observation, the sales paired with it (each shown as account, amount and time), and the model's confidence in the pairing:
${lines}
</TRANSACTION_LINKS>`);
  }

  // Phase 3 (3.6): the director's sentences as written, under the glossary's name.
  const epilogue = epilogueSentences(postInvestigationDevelopments, rawProse);
  if (epilogue.length > 0) {
    blocks.push(`<EPILOGUE>
${DERIVED_LABELS.epilogue}
${epilogue.map(sentence => `- ${sentence}`).join('\n')}
</EPILOGUE>`);
  }

  return blocks.join('\n\n');
}

/**
 * The director's sentences a print site of the narrative tensions shows (phase 3,
 * brief 3.3, carry-over from 3.6).
 *
 * Since 3.6 the tensions node (contradiction-nodes.js) stores one tension, type
 * `blake-proximity`, whose `observations` are the director's sentences that name Blake
 * or the Valet. A thread surfaced before 3.6 may still store `named-account` and
 * `transparency-vs-burial` tensions, which read an account's name as its holder (T4),
 * and a `blake-proximity` tension whose `narrativeNote` is a generic line. Only the
 * stored observations are read, and only the ones the notes hold word for word, so
 * every sentence a print site shows is the director's, as DERIVED_LABELS.narrativeTensions
 * says. A sentence wrapped across lines prints on one line. It is the one filter for
 * both journalist print sites (fix 3.2b): the arc writer's Blake section and the
 * article writer's <NARRATIVE_TENSIONS>.
 *
 * @param {Object|null} narrativeTensions - state.narrativeTensions ({tensions: [...]})
 * @param {string} rawProse - the director's notes
 * @returns {string[]} the sentences, in stored order, each once
 */
function directorTensionSentences(narrativeTensions, rawProse) {
  const tensions = Array.isArray(narrativeTensions?.tensions) ? narrativeTensions.tensions : [];
  const sentences = tensions
    .filter(t => t && t.type === 'blake-proximity' && Array.isArray(t.observations))
    .flatMap(t => t.observations)
    .filter(s => typeof s === 'string' && s.trim() && isVerbatimIn(s, rawProse))
    .map(s => s.trim().replace(/\s*\n\s*/g, ' '));
  return [...new Set(sentences)];
}

module.exports = { renderDirectorEnrichmentBlock, directorTensionSentences };
