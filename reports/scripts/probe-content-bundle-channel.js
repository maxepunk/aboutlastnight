/**
 * Content Bundle Channel-Skip Probe
 *
 * Phase 3 of the investigation: reproduces the generateContentBundle call
 * conditions with the new diagnostic instrumentation, so we can capture
 * the actual `stop_reason`, `usage`, `terminalReason`, and channel for
 * the failing pattern.
 *
 * Strategy: builds the same article-generation prompt as the real node
 * using saved session 050926 inputs, then calls sdkQuery directly with
 * the real content-bundle schema. Bypasses the LangGraph runtime so we
 * don't need to re-run upstream nodes.
 *
 * Evidence: the session's memory tokens AND paper documents (fetched/tokens.json
 * `{ tokens }`, fetched/paper-evidence.json `{ evidence }`), packaged by the pipeline's
 * own buildArcEvidencePackages, so the prompt carries what the real article writer gets.
 * Until 2026-09-25 the probe misread the paper file's shape and sent no paper documents.
 *
 * Output: the full diagnostic envelope, regardless of success or failure.
 *
 * Exit code (phase 2 brief 2.0 gate): 0 only when the structured output arrived
 * through the SDK channel; 1 on the text fallback, on a failed call, and on missing
 * session data (scripts/lib/probe-verdicts.js channelVerdict).
 *
 * Usage: node scripts/probe-content-bundle-channel.js
 *   PROBE_SESSION_ID=092026   the session whose saved inputs build the prompt (default 050926)
 *   PROBE_DATA_ROOT=<dir>     where session folders live (default reports/data); lets a
 *                             worktree without data/ read the main checkout's, read-only
 *
 * Requiring this file makes no call (require.main guard).
 */

const fs = require('fs');
const path = require('path');
const { channelVerdict } = require('./lib/probe-verdicts');

const SESSION_ID = process.env.PROBE_SESSION_ID || '050926';
const DATA_DIR = path.join(process.env.PROBE_DATA_ROOT || path.join(__dirname, '..', 'data'), SESSION_ID);

const REQUIRED_FILES = [
  'inputs/session-config.json',
  'inputs/director-notes.json',
  'fetched/tokens.json',
  'fetched/paper-evidence.json'
];

function loadJson(dataDir, file) {
  return JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
}

/**
 * The token list in fetched/tokens.json. fetchMemoryTokens writes
 * `{ tokens, fetchedAt, totalCount }`; a bare array is an older shape.
 *
 * @param {Object|Array} file - the parsed file
 * @returns {Object[]}
 * @throws when the file holds no token list (a silent empty list hid the paper bug)
 */
function tokensOf(file) {
  if (Array.isArray(file)) return file;
  if (file && Array.isArray(file.tokens)) return file.tokens;
  throw new Error('fetched/tokens.json holds no token list (expected { tokens: [...] } or an array)');
}

/**
 * The paper documents in fetched/paper-evidence.json. fetchPaperEvidence writes
 * `{ evidence, fetchedAt, totalCount }` (092026 has 42 under `evidence`); a bare array,
 * `items` and `paperEvidence` are older shapes. Before this reader the probe looked only
 * at the older shapes and loaded 0 paper documents from every current session.
 *
 * @param {Object|Array} file - the parsed file
 * @returns {Object[]}
 * @throws when the file holds no evidence list
 */
function paperEvidenceOf(file) {
  if (Array.isArray(file)) return file;
  for (const key of ['evidence', 'items', 'paperEvidence']) {
    if (file && Array.isArray(file[key])) return file[key];
  }
  throw new Error('fetched/paper-evidence.json holds no evidence list (expected { evidence: [...] } or an array)');
}

/**
 * A session's saved inputs, read-only.
 *
 * @param {string} dataDir - data/<sessionId>
 * @returns {{sessionConfig: Object, directorNotes: Object, tokens: Object[], paperEvidence: Object[]}}
 */
function loadSession(dataDir) {
  return {
    sessionConfig: loadJson(dataDir, 'inputs/session-config.json'),
    directorNotes: loadJson(dataDir, 'inputs/director-notes.json'),
    tokens: tokensOf(loadJson(dataDir, 'fetched/tokens.json')),
    paperEvidence: paperEvidenceOf(loadJson(dataDir, 'fetched/paper-evidence.json'))
  };
}

// Five synthetic arcs with the evidence counts of the 050926 call this probe was built
// to reproduce, so the prompt size is in the same range.
const ARC_NAMES = [
  "The Marcus Problem: Vic and Morgan's Convergent Interests",
  "Sarah's Coronation: The Quietest Person in the Room",
  "Marcus's Stolen Empire: Convergent Victims",
  "The Black Market Confessional: Named Accounts, Performed Innocence",
  "Remi's Engineered Exposure: The Cleanest Operator in the Room"
];
const ITEMS_PER_ARC = [13, 11, 21, 16, 12];

/**
 * The probe's arc evidence packages, shaped by the pipeline's own packaging node
 * (buildArcEvidencePackages), so every item is what the real article writer gets: a
 * memory token as `memory`, a paper document as `paper`, each with its owner, its full
 * text and its quotable excerpts. The evidence is drawn from one pool that alternates
 * paper documents and tokens (the 092026 article prompt carried 24 paper documents and 15
 * tokens), skipping items with no text, and wraps when an arc asks for more than the
 * pool holds.
 *
 * @param {{tokens: Object[], paperEvidence: Object[], roster: string[]}} session
 * @returns {Promise<Object[]>} arcEvidencePackages
 */
async function buildProbePackages({ tokens, paperEvidence, roster }) {
  // Loaded here, not at the top: requiring the probe must not load the pipeline.
  const { buildArcEvidencePackages } = require('../lib/workflow/nodes/ai-nodes');
  const { extractFullContent } = require('../lib/workflow/nodes/node-helpers');

  // The id the packaging node looks each item up by (ai-nodes.js buildArcEvidencePackages).
  const withText = (items, idOf) => items
    .filter((item) => extractFullContent(item).length > 0)
    .map((item) => idOf(item))
    .filter(Boolean);
  const paperIds = withText(paperEvidence, (p) => p.notionId || p.id || p.pageId || p.name);
  const tokenIds = withText(tokens, (t) => t.tokenId || t.id);
  const pool = [];
  for (let i = 0; i < Math.max(paperIds.length, tokenIds.length); i++) {
    if (i < paperIds.length) pool.push(paperIds[i]);
    if (i < tokenIds.length) pool.push(tokenIds[i]);
  }
  if (pool.length === 0) throw new Error('the session has no memory token or paper document with any text');

  let next = 0;
  const narrativeArcs = ARC_NAMES.map((title, arcIdx) => ({
    id: `arc-${arcIdx}`,
    title,
    characterPlacements: {},
    keyEvidence: Array.from({ length: ITEMS_PER_ARC[arcIdx] }, () => pool[next++ % pool.length])
  }));

  const { arcEvidencePackages } = await buildArcEvidencePackages({
    selectedArcs: narrativeArcs.map((arc) => arc.id),
    narrativeArcs,
    evidenceBundle: { exposed: { tokens, paperEvidence } },
    photoAnalyses: { analyses: [] }
  }, {});

  return arcEvidencePackages.map((pkg, arcIdx) => ({
    ...pkg,
    photos: [
      { filename: `aln0509 (${arcIdx + 1} of 10).jpg`, characters: roster.slice(0, 3) }
    ]
  }));
}

/**
 * The article-generation prompt the probe sends, built the way generateContentBundle
 * builds it, from a session's saved inputs, synthetic arcs and a synthetic outline.
 *
 * @param {{sessionId: string, sessionConfig: Object, directorNotes: Object, tokens: Object[], paperEvidence: Object[]}} session
 * @returns {Promise<{systemPrompt: string, userPrompt: string, arcEvidencePackages: Object[]}>}
 */
async function buildProbePrompt({ sessionId, sessionConfig, directorNotes, tokens, paperEvidence }) {
  const { createPromptBuilder } = require('../lib/prompt-builder');

  // Build canonicalCharacters map (name → name for roster members)
  const canonicalCharacters = {};
  for (const name of sessionConfig.roster) {
    canonicalCharacters[name] = name;
  }

  const arcEvidencePackages = await buildProbePackages({ tokens, paperEvidence, roster: sessionConfig.roster });
  const arcNames = ARC_NAMES;

  // Synthetic outline matching the real one's shape (the user's edited version was ~17KB).
  // We need similar prompt size and structure to trigger the same conditions.
  const outline = {
    metadata: { sessionId, theme: 'journalist' },
    lede: {
      hook: 'Eight people walked into that warehouse last night with a name on their lips. Marcus Blackwood.',
      keyTension: 'The accusation that started the investigation landed on Vic. The verdict landed somewhere else entirely.',
      primaryArc: 'arc-0',
      selectedEvidence: tokens.slice(0, 2).map(t => t.id || t.tokenId)
    },
    theStory: {
      arcInterweaving: {
        interleavingPlan: 'Five arcs intercut around a 1:08 AM convergence point. Open with motive, plant the operator early, expose the fraud, recontextualize through the back-channel coordination.',
        callbackOpportunities: [
          { plantIn: 'arc-0', payoffIn: 'arc-4', detail: 'Open with the 8:23 PM meeting; pay off when Remi reveals who choreographed the moment.' },
          { plantIn: 'arc-1', payoffIn: 'arc-3', detail: 'Plant Riley handing Mel the legal arsenal; pay off with the named-account ledger.' }
        ],
        convergencePoint: 'Arc 3 final paragraph: 1:08 AM, Remi turns Sam\'s laptop toward Vic and Alex.'
      },
      arcs: arcEvidencePackages.map((pkg, idx) => ({
        name: pkg.arcId,
        paragraphCount: 3,
        evidenceCards: [
          { tokenId: pkg.evidenceItems[0]?.id, placement: 'after para 1', loopFunction: 'OPENER' },
          { tokenId: pkg.evidenceItems[1]?.id, placement: 'after para 3', loopFunction: 'CLOSER' }
        ],
        photoPlacement: { filename: pkg.photos[0]?.filename, afterParagraph: 2, purpose: 'humanize' }
      }))
    },
    followTheMoney: {
      arcConnections: arcNames.map((name, i) => ({ arcName: `arc-${i}`, financialAngle: 'Shell account analysis with named vs pseudonymous routing patterns.' })),
      shellAccounts: [
        { name: 'Jamie', total: 1299997, inference: 'Bartender account, largest sum.', relatedArc: 'arc-3' },
        { name: 'Person', total: 930000, inference: 'Anonymity by stylistic choice.', relatedArc: 'arc-3' },
        { name: 'Sarah', total: 385003, inference: 'Six fragmented transactions in the widow\'s named account.', relatedArc: 'arc-1' }
      ],
      photoPlacement: null
    },
    thePlayers: {
      arcConnections: arcNames.map((name, i) => ({ arcName: `arc-${i}`, characterAngle: 'Character role in this arc and how their exposure pattern relates.' })),
      buried: ['Jamie', 'Sarah', 'Ashe'],
      exposed: ['Alex', 'Remi', 'Vic'],
      characterHighlights: {
        Remi: 'Engineered the convergence. Walked away with nothing in her name.',
        Vic: 'Confessed to the meeting, pled ignorance of the rest, and the room let him.'
      },
      pullQuotes: [
        { type: 'verbatim', text: "He's out. You're in. Trust me. It's done.", attribution: 'Overheard by Jamie', advancesArc: 'arc-0' },
        { type: 'crystallization', text: 'The quietest person in the room got the cleanest ending.', attribution: null, advancesArc: 'arc-1' }
      ]
    },
    whatsMissing: {
      arcConnections: arcNames.map((name, i) => ({ arcName: `arc-${i}`, openQuestion: 'Specific question this arc leaves unresolved.' })),
      knownUnknowns: [
        'What is in the three pseudonymous accounts totaling $1.66 million',
        'Where Remi was between 9:37 PM and 11:29 PM'
      ],
      buriedItems: ['Jamie\'s 7 transactions', 'Person\'s 4 transactions'],
      narrativePurpose: 'The gaps are not symmetrical. Some arcs end with mysteries; others end with suspicion that the visible answer is only part of the answer.'
    },
    closing: {
      accusationHandling: 'The group unanimously concluded Marcus died by his own hand. State the verdict, then sit with what it does not address.',
      arcResolutions: arcNames.map((name, i) => ({ arcName: `arc-${i}`, resolution: 'How this arc resolves under the chosen verdict.' })),
      systemicAngle: 'A unanimous verdict in a room full of beneficiaries is the price of getting everyone out the door.',
      finalLine: 'Eight people walked out this morning with a verdict. Whether they walked out with the truth is a question the ledger is not built to answer.'
    }
  };

  // Shell accounts (need by buildArticlePrompt for financial summary)
  const shellAccounts = outline.followTheMoney.shellAccounts;

  // sessionFacts for roster + accusation
  const sessionFacts = {
    roster: sessionConfig.roster,
    accusation: sessionConfig.accusation?.accused?.join(' and ') || 'Unknown',
    playerCount: sessionConfig.roster.length
  };

  // Build the prompt the same way generateContentBundle does
  const promptBuilder = createPromptBuilder({
    theme: 'journalist',
    sessionConfig,
    canonicalCharacters,
    characterData: {}
  });

  // Brief 2.1: the article writer reads each document once, in full, in <RECORD>, and
  // the packages name them by id. The probe's record is the documents its arcs cite,
  // which keeps the prompt near a real session's size.
  const citedIds = new Set(arcEvidencePackages.flatMap((pkg) => (pkg.evidenceItems || []).map((item) => item.id)));
  const evidenceBundle = {
    exposed: {
      tokens: tokens.filter((t) => citedIds.has(t.tokenId || t.id)),
      paperEvidence: paperEvidence.filter((p) => citedIds.has(p.notionId || p.id || p.pageId || p.name))
    }
  };

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    outline,
    arcEvidencePackages,
    'aln0509 (10 of 10).jpg',
    shellAccounts,
    sessionFacts,
    directorNotes,
    null,
    { evidenceBundle }
  );

  return { systemPrompt, userPrompt, arcEvidencePackages };
}

async function main() {
  // Loaded here, not at the top: requiring the probe must not load the SDK.
  const { sdkQuery } = require('../lib/llm');
  const contentBundleSchema = require('../lib/schemas/content-bundle.schema.json');

  // Verify session data exists before doing any work. The probe needs a real
  // session's inputs to build a representative prompt; failing fast with a
  // useful message beats crashing inside loadJson with ENOENT.
  if (!fs.existsSync(DATA_DIR)) {
    console.error(`Session data not found at ${DATA_DIR}`);
    console.error(`Set PROBE_SESSION_ID=<session> to use a different session, or`);
    console.error(`run a session to completion first to populate inputs/ and fetched/.`);
    process.exit(1);
  }
  const missing = REQUIRED_FILES.filter(f => !fs.existsSync(path.join(DATA_DIR, f)));
  if (missing.length > 0) {
    console.error(`Session ${SESSION_ID} is missing required files:`);
    missing.forEach(f => console.error(`  - ${f}`));
    console.error(`The probe needs a session that has at least reached the curation phase.`);
    process.exit(1);
  }

  console.log(`Probing generateContentBundle channel choice with session ${SESSION_ID} inputs...\n`);

  // Load saved session inputs
  const session = loadSession(DATA_DIR);
  console.log(`Loaded: ${session.tokens.length} tokens, ${session.paperEvidence.length} paper items, roster=${session.sessionConfig.roster.length}`);

  const { systemPrompt, userPrompt, arcEvidencePackages } = await buildProbePrompt({ sessionId: SESSION_ID, ...session });
  const packaged = arcEvidencePackages.flatMap((pkg) => pkg.evidenceItems || []);
  console.log(`Packaged: ${packaged.filter((i) => i.type === 'paper').length} paper documents and ` +
    `${packaged.filter((i) => i.type === 'memory').length} memory tokens across ${arcEvidencePackages.length} arcs`);

  console.log(`\nBuilt prompt: system=${systemPrompt.length} chars, user=${userPrompt.length} chars\n`);

  // Make the call with new instrumentation watching
  let captured = null;
  let probeError = null;
  try {
    const result = await sdkQuery({
      prompt: userPrompt,
      systemPrompt,
      model: 'opus',
      jsonSchema: contentBundleSchema,
      disableTools: true,
      label: 'phase-3-channel-probe',
      onProgress: (msg) => {
        if (msg.type === 'llm_complete' || msg.type === 'llm_error') {
          captured = msg;
        }
      }
    });

    console.log('\n=== SUCCESS ===');
    console.log(`channel: ${captured?.channel}`);
    console.log(`stopReason: ${captured?.stopReason}`);
    console.log(`durationApiMs: ${captured?.durationApiMs}`);
    console.log(`usage: ${JSON.stringify(captured?.usage)}`);
    console.log(`structuredOutputPresent: ${captured?.structuredOutputPresent}`);
    console.log(`resultTextLength: ${captured?.resultTextLength}`);
    console.log(`terminalReason: ${captured?.terminalReason}`);
    console.log(`servedModels: ${JSON.stringify(captured?.servedModels ?? null)}`);
    console.log(`output keys: ${Object.keys(result).join(', ')}`);
  } catch (err) {
    probeError = err.message || String(err);
    console.log('\n=== EXTRACTION FAILURE (Phase 3 target case) ===');
    console.log(`error: ${err.message?.slice(0, 200)}`);
    console.log(`errorName: ${err.name}`);
    console.log(`structuredOutputPresent: ${err.structuredOutputPresent}`);
    console.log(`resultTextLength: ${err.resultTextLength}`);
    console.log(`schemaError count: ${err.schemaErrors?.length || 0}`);
    if (captured) {
      console.log(`\nFrom llm_error event:`);
      console.log(`  stopReason: ${captured.stopReason}`);
      console.log(`  durationApiMs: ${captured.durationApiMs}`);
      console.log(`  usage: ${JSON.stringify(captured.usage)}`);
      console.log(`  terminalReason: ${captured.terminalReason}`);
    }
    if (err.schemaErrors && err.schemaErrors.length > 0) {
      console.log('\nFirst 5 schema errors:');
      err.schemaErrors.slice(0, 5).forEach(e => {
        console.log(`  ${e.instancePath || '/'}: ${e.message}`);
      });
    }
    if (err.lastText) {
      console.log(`\nFirst 500 chars of model output:\n${err.lastText.slice(0, 500)}`);
    }
  }

  const verdict = channelVerdict({ channel: captured?.channel ?? null, error: probeError });
  console.log(`\n${verdict.ok ? 'PASS' : 'FAIL'}: ${verdict.ok ? 'structured output arrived through the SDK channel' : verdict.failures.join('; ')}`);
  process.exitCode = verdict.ok ? 0 : 1;
}

if (require.main === module) {
  main().catch(err => {
    console.error('Probe crashed:', err);
    process.exit(1);
  });
}

module.exports = { main, tokensOf, paperEvidenceOf, loadSession, buildProbePackages, buildProbePrompt, ARC_NAMES, ITEMS_PER_ARC };
