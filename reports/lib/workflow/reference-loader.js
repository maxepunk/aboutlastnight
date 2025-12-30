/**
 * Reference Loader - Centralized loading of reference prompts for AI calls
 *
 * DRY pattern: All AI nodes (specialists, synthesis, evaluators) import rules
 * from this single source. Cached to avoid repeated file reads.
 *
 * Reference files location: .claude/skills/journalist-report/references/prompts/
 *
 * Files loaded:
 * - evidence-boundaries.md: Three-layer model rules (exposed/buried/director)
 * - anti-patterns.md: What NOT to do (voice failures, language failures)
 * - writing-principles.md: How to write (synthesize, don't catalog)
 *
 * Commit 8.13: Created for Phase 2 arc selection fixes
 */

const fs = require('fs').promises;
const path = require('path');

// References are in the skill directory
const REFERENCES_DIR = path.join(__dirname, '../../.claude/skills/journalist-report/references/prompts');

// Cache for loaded rules (avoid repeated file reads)
let cachedRules = null;

/**
 * Load all reference rules from files
 * Caches results for subsequent calls
 *
 * @returns {Promise<{evidenceBoundaries: string, antiPatterns: string, writingPrinciples: string}>}
 */
async function loadReferenceRules() {
  if (cachedRules) return cachedRules;

  try {
    const [evidenceBoundaries, antiPatterns, writingPrinciples] = await Promise.all([
      fs.readFile(path.join(REFERENCES_DIR, 'evidence-boundaries.md'), 'utf-8'),
      fs.readFile(path.join(REFERENCES_DIR, 'anti-patterns.md'), 'utf-8'),
      fs.readFile(path.join(REFERENCES_DIR, 'writing-principles.md'), 'utf-8')
    ]);

    cachedRules = { evidenceBoundaries, antiPatterns, writingPrinciples };
    return cachedRules;
  } catch (error) {
    console.warn(`[reference-loader] Failed to load reference files: ${error.message}`);
    // Return empty strings to allow graceful degradation
    return { evidenceBoundaries: '', antiPatterns: '', writingPrinciples: '' };
  }
}

/**
 * Clear cached rules (for testing)
 */
function clearCache() {
  cachedRules = null;
}

// ═══════════════════════════════════════════════════════════════════════════
// COMPACT SUMMARIES FOR PROMPTS
// ═══════════════════════════════════════════════════════════════════════════
// These are condensed versions to avoid overwhelming AI context.
// Full files can be loaded with loadReferenceRules() when needed.

/**
 * Get compact evidence boundaries summary for injection into prompts
 * Focuses on Layer 2/3 rules that are commonly violated
 *
 * @returns {string} Compact rules summary
 */
function getEvidenceBoundariesSummary() {
  return `EVIDENCE BOUNDARIES (THREE-LAYER MODEL):

LAYER 1 - EXPOSED EVIDENCE (Full Reportability):
- CAN quote full memory contents, describe what memory reveals
- CAN draw conclusions from content, name who exposed each memory
- These are the FACTS of the article

LAYER 2 - BURIED PATTERNS (Observable Only):
- CAN report: shell account names, dollar amounts, timing patterns, transaction counts
- CAN note: suspicious correlations (ChaseT = Taylor Chase?), timing clusters
- CAN report: who was OBSERVED at Valet (if director noted)
- CANNOT report: whose memories went to which accounts
- CANNOT report: content of buried memories
- CANNOT infer: specific content from transaction patterns
- These are the MYSTERIES of the article

LAYER 3 - DIRECTOR NOTES (Priority Hierarchy):
1. ACCUSATION = PRIMARY (what players concluded)
2. DIRECTOR OBSERVATIONS = HIGHEST NARRATIVE WEIGHT (ground truth of what happened)
3. WHITEBOARD = SUPPORTING CONTEXT (notes captured during investigation)

The accusation drives arc prioritization. Director observations are ground truth.
The whiteboard supports but does NOT determine narrative focus.`;
}

/**
 * Get compact anti-patterns summary for injection into prompts
 * Focuses on most common violations
 *
 * @returns {string} Compact anti-patterns summary
 */
function getAntiPatternsSummary() {
  return `ANTI-PATTERNS TO AVOID:

LANGUAGE:
- Never use "token" (say "memory", "extracted memory", "stolen memory")
- Never use em-dashes (use periods, restructure sentences)
- Never use game mechanics language ("Act 3 unlock", "first burial", "token scan")

CONTENT:
- Never list evidence as catalog (weave into narrative)
- Never fabricate moments not documented in director notes
- Never claim to know buried memory content or ownership
- Never shame those who buried (understand, don't judge)
- Never skip roster characters (everyone who was there should appear)

VOICE:
- Never use neutral wire-service voice (reporter has opinions, was there)
- Never use breathless tech hype (reporter has seen too much)
- Never use academic detachment (this matters, show it)
- Never claim moral superiority (reporter is in this story, not above it)`;
}

/**
 * Get compact writing principles summary
 *
 * @returns {string} Compact writing principles summary
 */
function getWritingPrinciplesSummary() {
  return `WRITING PRINCIPLES:

SYNTHESIZE, DON'T CATALOG:
Evidence supports narrative. Narrative is not a list of evidence.
Weave evidence into story, don't enumerate it.

GROUND SPECULATION IN EVIDENCE:
The reporter can speculate, but earns it with evidence first.
Show the evidence. Let implications land. Don't overreach.

THE GAP IS PART OF THE STORY:
Buried memories aren't failures. They're narrative tension.
What people chose to hide tells a story too.

PROPORTIONAL COVERAGE:
More exposed evidence = more detailed coverage.
Heavy burying = acknowledge the gap, don't invent content.

EMOTIONAL TRUTH OVER COMPLETENESS:
A vivid moment beats a comprehensive summary.
One real moment teaches more than ten bullet points.`;
}

/**
 * Get combined rules summary for arc generation
 * Includes all three summaries in a single block
 *
 * @returns {string} Combined rules summary
 */
function getCombinedRulesSummary() {
  return `${getEvidenceBoundariesSummary()}

---

${getAntiPatternsSummary()}`;
}

module.exports = {
  // Full file loading
  loadReferenceRules,
  clearCache,

  // Compact summaries for prompts
  getEvidenceBoundariesSummary,
  getAntiPatternsSummary,
  getWritingPrinciplesSummary,
  getCombinedRulesSummary,

  // Export path for testing
  _testing: {
    REFERENCES_DIR
  }
};

// Self-test when run directly
if (require.main === module) {
  console.log('Reference Loader Self-Test\n');

  loadReferenceRules().then(rules => {
    console.log('Full files loaded:');
    console.log(`  - evidence-boundaries.md: ${rules.evidenceBoundaries.length} chars`);
    console.log(`  - anti-patterns.md: ${rules.antiPatterns.length} chars`);
    console.log(`  - writing-principles.md: ${rules.writingPrinciples.length} chars`);

    console.log('\nCompact summaries:');
    console.log(`  - Evidence boundaries: ${getEvidenceBoundariesSummary().length} chars`);
    console.log(`  - Anti-patterns: ${getAntiPatternsSummary().length} chars`);
    console.log(`  - Writing principles: ${getWritingPrinciplesSummary().length} chars`);
    console.log(`  - Combined: ${getCombinedRulesSummary().length} chars`);

    console.log('\nEvidence Boundaries Summary:');
    console.log(getEvidenceBoundariesSummary());

    console.log('\n\nSelf-test complete.');
  }).catch(err => {
    console.error('Self-test failed:', err.message);
    process.exit(1);
  });
}
