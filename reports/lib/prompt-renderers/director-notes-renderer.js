/**
 * Director Notes Enrichment Renderer
 *
 * Produces the XML-tagged director-notes block consumed by:
 * - lib/workflow/nodes/arc-specialist-nodes.js (buildCoreArcPrompt, buildArcRevisionPrompt)
 * - lib/prompt-builder.js (buildOutlinePrompt, buildArticlePrompt)
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

const { renderDirectorCorrectionsBlock } = require('./director-words-renderer');
const { buriedTransactionFields } = require('./record-view');
const { sessionClockOf } = require('./session-clock');
const { DERIVED_LABELS } = require('./derived-labels');

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
 * @param {Array} [ctx.quotes] - Extracted quotes
 * @param {Array} [ctx.transactionReferences] - Observation → transaction links
 *   (each transaction printed as account, amount and time only)
 * @param {Array} [ctx.postInvestigationDevelopments] - Post-investigation news items
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
    const lines = quotes.map(q =>
      `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`
    ).join('\n');
    blocks.push(`<QUOTE_BANK>
${DERIVED_LABELS.directorNotesIndex}
Verbatim quotes extracted from the director's prose — prefer these when citing what someone said:
${lines}
</QUOTE_BANK>`);
  }

  if (transactionReferences.length > 0) {
    const lines = transactionReferences.map(t => {
      const txs = (t.linkedTransactions || []).map((tx) => linkedTransactionLine(tx, sessionConfig)).join('; ');
      return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
    }).join('\n');
    blocks.push(`<TRANSACTION_LINKS>
${DERIVED_LABELS.directorNotesIndex}
Behavioral observations pre-linked to specific burial transactions, each shown as account, amount and time:
${lines}
</TRANSACTION_LINKS>`);
  }

  if (postInvestigationDevelopments.length > 0) {
    const lines = postInvestigationDevelopments.map(d =>
      `- ${d.headline}${d.detail ? `: ${d.detail}` : ''}${d.subjects?.length ? ` [subjects: ${d.subjects.join(', ')}]` : ''}${d.bearingOnNarrative ? ` — ${d.bearingOnNarrative}` : ''}`
    ).join('\n');
    blocks.push(`<POST_INVESTIGATION_NEWS>
Developments that occurred AFTER the investigation concluded — distinct epistemic status:
${lines}
</POST_INVESTIGATION_NEWS>`);
  }

  return blocks.join('\n\n');
}

module.exports = { renderDirectorEnrichmentBlock };
