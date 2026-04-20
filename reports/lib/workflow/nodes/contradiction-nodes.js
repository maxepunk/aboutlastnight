/**
 * Contradiction Surfacing Node (PROGRAMMATIC — no LLM)
 *
 * Cross-references shell accounts vs roster and director observations
 * to surface narrative tensions. Respects evidence boundaries:
 * - CAN see: shell account names, amounts, timing
 * - CAN see: director observations about public behavior
 * - CANNOT see: whose specific memories went to which accounts
 * - CANNOT reference: token IDs, buried content
 */

const { traceNode } = require('../../observability');

function surfaceContradictions(state) {
  if (state.narrativeTensions) {
    console.log('[surfaceContradictions] Skipping — already exists');
    return {};
  }

  const rawRoster = state.sessionConfig?.roster || [];
  // Roster may contain strings or objects with .name — normalize to strings
  const roster = rawRoster.map(r => (typeof r === 'string' ? r : r?.name || '')).filter(Boolean);
  const shellAccounts = state.shellAccounts || [];
  // Enriched schema (2026-04): search raw prose instead of the removed 3-bucket arrays.
  // We split on sentence boundaries to preserve the per-sentence match semantics the
  // old behaviorPatterns array provided.
  const rawProse = state.directorNotes?.rawProse || '';
  const behaviorPatterns = rawProse
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);
  const rosterLower = new Set(roster.map(r => r.toLowerCase()));

  const tensions = [];

  // 1. Flag named shell accounts matching roster members
  for (const account of shellAccounts) {
    if (account.total <= 0) continue;

    const isNamed = rosterLower.has(account.name.toLowerCase());
    if (!isNamed) continue;

    const rosterName = roster.find(r => r.toLowerCase() === account.name.toLowerCase());

    // Check for transparency contradiction: director noted public behavior + burial
    const transparencyNotes = behaviorPatterns.filter(p => {
      const pLower = p.toLowerCase();
      return pLower.includes(rosterName.toLowerCase()) &&
        (pLower.includes('submit') || pLower.includes('expos') || pLower.includes('public') ||
         pLower.includes('nothing to hide') || pLower.includes('boldly') || pLower.includes('transparent'));
    });

    if (transparencyNotes.length > 0) {
      tensions.push({
        type: 'transparency-vs-burial',
        character: rosterName,
        publicBehavior: transparencyNotes[0],
        burialData: { accountName: account.name, total: account.total, tokenCount: account.tokenCount },
        narrativeNote: `${rosterName} publicly demonstrated transparency while also maintaining a named burial account with $${account.total.toLocaleString('en-US')}. This contradiction is visible to Nova.`
      });
    } else {
      tensions.push({
        type: 'named-account',
        character: rosterName,
        burialData: { accountName: account.name, total: account.total, tokenCount: account.tokenCount },
        narrativeNote: `${rosterName} used their own name for a burial account ($${account.total.toLocaleString('en-US')}). Unlike anonymous accounts, this is a deliberate choice to be identifiable.`
      });
    }
  }

  // 2. Flag Blake-proximity patterns from director observations
  const blakeProximity = behaviorPatterns.filter(p =>
    p.toLowerCase().includes('blake') || p.toLowerCase().includes('valet')
  );

  if (blakeProximity.length > 0) {
    tensions.push({
      type: 'blake-proximity',
      character: null, // No single character — pattern-level observation
      observations: blakeProximity,
      narrativeNote: 'Director observed multiple characters interacting with Blake. Nova can note these patterns without knowing transaction details.'
    });
  }

  console.log(`[surfaceContradictions] Found ${tensions.length} narrative tensions`);

  return {
    narrativeTensions: {
      tensions,
      surfacedAt: new Date().toISOString()
    }
  };
}

module.exports = {
  surfaceContradictions: traceNode(surfaceContradictions, 'surfaceContradictions', {
    stateFields: ['shellAccounts', 'sessionConfig']
  }),
  _testing: { surfaceContradictions }
};
