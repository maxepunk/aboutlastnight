/**
 * Contradiction Surfacing Node (PROGRAMMATIC — no LLM)
 *
 * Gathers the director's own sentences about Blake and the Valet into one narrative
 * tension the arc and article writers read. Respects evidence boundaries:
 * - CAN see: director observations, as written
 * - CANNOT see: whose specific memories went to which accounts
 * - CANNOT reference: token IDs, buried content
 *
 * Phase 3 (3.6): the named-account and transparency tensions are gone. They read an
 * account named after a roster character as that character's own ("used their own
 * name for a burial account... a deliberate choice to be identifiable"), and an
 * account's name is a message its seller chose, never a reason to suspect its
 * namesake (T4).
 * The ledger's accounts and totals reach the writers through the financial summary.
 */

const { traceNode } = require('../../observability');

/**
 * The director's prose as sentences, each a verbatim piece of the notes. A sentence
 * ends at whitespace after ".", "!" or "?" (or after one of them and a closing
 * quotation mark) outside the director's quotation marks, and at a paragraph break
 * (a blank line, LF or CRLF), which also closes a quotation left open. A full stop
 * inside a quoted line does not end the director's sentence: on 092626 `Blake to
 * Remi: "Remi, I hope that we can work together. I may have acquired something for
 * you."` used to be cut after "together.".
 *
 * @param {string} rawProse
 * @returns {string[]}
 */
function proseSentences(rawProse) {
  const prose = String(rawProse || '');
  const sentences = [];
  let start = 0;
  let inQuote = false;
  for (let i = 0; i < prose.length; i++) {
    const ch = prose[i];
    // A blank line, with LF or CRLF line endings (notes pasted from Windows).
    if (ch === '\n' && /^[ \t\r]*\n/.test(prose.slice(i + 1))) {
      sentences.push(prose.slice(start, i));
      start = i + 1;
      inQuote = false;
    } else if (ch === '"') {
      inQuote = !inQuote;
    } else if (ch === '“') {
      inQuote = true;
    } else if (ch === '”') {
      inQuote = false;
    } else if (/\s/.test(ch) && !inQuote && /[.!?]["”]?$/.test(prose.slice(Math.max(0, i - 2), i))) {
      sentences.push(prose.slice(start, i));
      start = i + 1;
    }
  }
  sentences.push(prose.slice(start));
  return sentences.map(s => s.trim()).filter(Boolean);
}

function surfaceContradictions(state) {
  if (state.narrativeTensions) {
    console.log('[surfaceContradictions] Skipping — already exists');
    return {};
  }

  // Enriched schema (2026-04): search the director's raw prose, sentence by sentence.
  const sentences = proseSentences(state.directorNotes?.rawProse || '');

  const tensions = [];

  // The director's sentences about Blake or the Valet, printed as written. The note
  // used to say "Director observed multiple characters interacting with Blake" even
  // when one sentence named one character.
  const blakeProximity = sentences.filter(p =>
    p.toLowerCase().includes('blake') || p.toLowerCase().includes('valet')
  );

  if (blakeProximity.length > 0) {
    tensions.push({
      type: 'blake-proximity',
      character: null, // No single character — pattern-level observation
      observations: blakeProximity,
      // A sentence wrapped across lines prints on one line, so the list stays a list.
      narrativeNote: `The director's notes name Blake or the Valet in these sentences:\n${blakeProximity.map(s => `  - ${s.replace(/\s*\n\s*/g, ' ')}`).join('\n')}`
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
    stateFields: ['directorNotes']
  }),
  _testing: { surfaceContradictions, proseSentences }
};
