/**
 * Director Notes Enrichment Renderer
 *
 * Produces the XML-tagged director-notes block consumed by:
 * - lib/workflow/nodes/arc-specialist-nodes.js (buildCoreArcPrompt, buildArcRevisionPrompt)
 * - lib/prompt-builder.js (buildArticlePrompt)
 *
 * Spec: docs/superpowers/specs/2026-04-20-director-notes-enrichment-design.md
 */

/**
 * Render the enriched director-notes block as XML tags.
 *
 * @param {Object} ctx - Director-notes context
 * @param {string} [ctx.rawProse] - Verbatim director prose
 * @param {Array} [ctx.quotes] - Extracted quotes
 * @param {Array} [ctx.transactionReferences] - Observation → transaction links
 * @param {Array} [ctx.postInvestigationDevelopments] - Post-investigation news items
 * @returns {string} Multi-block XML-tagged string. Omits optional blocks when their arrays are empty.
 */
function renderDirectorEnrichmentBlock({
  rawProse = '',
  quotes = [],
  transactionReferences = [],
  postInvestigationDevelopments = []
} = {}) {
  const blocks = [];

  blocks.push(`<DIRECTOR_NOTES>
${rawProse || '(no director notes provided)'}
</DIRECTOR_NOTES>`);

  if (quotes.length > 0) {
    const lines = quotes.map(q =>
      `- ${q.speaker}${q.addressee ? ` (to ${q.addressee})` : ''}: "${q.text}"${q.context ? ` — ${q.context}` : ''} [${q.confidence}]`
    ).join('\n');
    blocks.push(`<QUOTE_BANK>
Verbatim quotes extracted from the director's prose — prefer these when citing what someone said:
${lines}
</QUOTE_BANK>`);
  }

  if (transactionReferences.length > 0) {
    const lines = transactionReferences.map(t => {
      const txs = (t.linkedTransactions || [])
        .map(tx => `${tx.timestamp} ${tx.tokenId} ${tx.amount} → ${tx.sellingTeam}`)
        .join('; ');
      return `- "${t.excerpt}" → [${txs || 'no link'}] (${t.confidence})`;
    }).join('\n');
    blocks.push(`<TRANSACTION_LINKS>
Behavioral observations pre-linked to specific burial transactions:
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
