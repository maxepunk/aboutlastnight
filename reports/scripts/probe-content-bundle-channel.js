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
 * `{ tokens }`, fetched/paper-evidence.json `{ evidence }`), in the record view the real
 * article writer reads. Until 2026-09-25 the probe misread the paper file's shape and sent
 * no paper documents. Phase 4 (brief 4.6; R5): the arc packages went, so the probe
 * packages nothing; its record is the documents its synthetic arcs draw on.
 *
 * Phase 4 (brief 4.7b): the article writer writes from the settled weave and the story
 * map, so the probe builds its call from the fixed weave and map render-prompts.js plants
 * (scripts/lib/fixed-weave.js, scripts/lib/fixed-map.js), through the writer's own inputs
 * (articleWriterInputs) and builder. The synthetic arcs' names and outline went with the
 * outline.
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

// The record's documents, in five shares with the evidence counts of the five synthetic
// arcs of the 050926 call this probe was built to reproduce, so the prompt size is in the
// same range.
const ITEMS_PER_ARC = [13, 11, 21, 16, 12];

/**
 * The probe's record and each synthetic arc's share of it. The documents are drawn from
 * one pool that alternates paper documents and tokens (the 092026 article prompt carried
 * 24 paper documents and 15 tokens), skipping items with no text, as many as the five
 * synthetic arcs of the 050926 call drew on (ITEMS_PER_ARC), wrapping when an arc asks for
 * more than the pool holds. Each arc's share names its documents by their ids in the
 * record view.
 *
 * @param {{tokens: Object[], paperEvidence: Object[]}} session
 * @returns {{evidenceBundle: Object, arcDocuments: string[][]}}
 */
function buildProbeRecord({ tokens, paperEvidence }) {
  // Loaded here, not at the top: requiring the probe must not load the pipeline.
  const { extractFullContent } = require('../lib/workflow/nodes/node-helpers');
  const { recordIdOf } = require('../lib/prompt-renderers/record-view');

  const withText = (items) => items.filter((item) => extractFullContent(item).length > 0 && recordIdOf(item));
  const paper = withText(paperEvidence);
  const memories = withText(tokens);
  const pool = [];
  for (let i = 0; i < Math.max(paper.length, memories.length); i++) {
    if (i < paper.length) pool.push(paper[i]);
    if (i < memories.length) pool.push(memories[i]);
  }
  if (pool.length === 0) throw new Error('the session has no memory token or paper document with any text');

  let next = 0;
  const arcItems = ITEMS_PER_ARC.map((count) => Array.from({ length: count }, () => pool[next++ % pool.length]));
  const drawn = new Set(arcItems.flat());
  return {
    evidenceBundle: {
      exposed: {
        tokens: tokens.filter((t) => drawn.has(t)),
        paperEvidence: paperEvidence.filter((p) => drawn.has(p))
      }
    },
    arcDocuments: arcItems.map((items) => items.map((item) => recordIdOf(item)))
  };
}

/**
 * The money figures the probe's FINANCIAL_SUMMARY prints: three accounts, the totals of
 * the 050926 call this probe was built to reproduce.
 */
const PROBE_SHELL_ACCOUNTS = [
  { name: 'Jamie', total: 1299997, tokenCount: 7 },
  { name: 'Person', total: 930000, tokenCount: 4 },
  { name: 'Sarah', total: 385003, tokenCount: 6 }
];

/**
 * The state the probe's article call is built from (phase 4, brief 4.7b): the session's
 * saved inputs and the probe's record, past the story meeting and the map. The weave and
 * the map are the fixed ones scripts/render-prompts.js plants when a thread holds none
 * (scripts/lib/fixed-weave.js, scripts/lib/fixed-map.js), the map as the director left
 * it. The session's photos are the map's, each naming the first three of the roster, and
 * the hero is the map's top photo, as code writes it at the map's approve (R7).
 *
 * @param {{sessionId: string, sessionConfig: Object, directorNotes: Object, tokens: Object[], paperEvidence: Object[]}} session
 * @returns {Object} a state for articleWriterInputs
 */
function probeArticleState({ sessionId, sessionConfig, directorNotes, tokens, paperEvidence }) {
  const { fixedWeave } = require('./lib/fixed-weave');
  const { fixedMap } = require('./lib/fixed-map');

  // Build canonicalCharacters map (name → name for roster members)
  const canonicalCharacters = {};
  for (const name of sessionConfig.roster) {
    canonicalCharacters[name] = name;
  }
  const { evidenceBundle } = buildProbeRecord({ tokens, paperEvidence });
  const map = fixedMap();
  const mapPhotos = [map.topPhoto, ...map.sections.flatMap((section) => section.photos.map((photo) => photo.filename))];
  return {
    theme: 'journalist',
    sessionId,
    sessionConfig,
    canonicalCharacters,
    directorNotes,
    evidenceBundle,
    weave: fixedWeave(),
    outline: map,
    heroImage: map.topPhoto,
    sessionPhotos: mapPhotos,
    photoAnalyses: { analyses: mapPhotos.map((filename) => ({ filename, identifiedCharacters: sessionConfig.roster.slice(0, 3) })) },
    shellAccounts: PROBE_SHELL_ACCOUNTS
  };
}

/**
 * The article-generation prompt the probe sends, built as generateContentBundle builds
 * it: the writer's own inputs (articleWriterInputs) from the probe's state, the settled
 * weave and the map among them, through the writer's own builder.
 *
 * @param {{sessionId: string, sessionConfig: Object, directorNotes: Object, tokens: Object[], paperEvidence: Object[]}} session
 * @returns {Promise<{systemPrompt: string, userPrompt: string, evidenceBundle: Object}>}
 */
async function buildProbePrompt(session) {
  const { createPromptBuilder } = require('../lib/prompt-builder');
  const { articleWriterInputs } = require('../lib/workflow/nodes/ai-nodes');

  const state = probeArticleState(session);
  const promptBuilder = createPromptBuilder({
    theme: 'journalist',
    sessionConfig: state.sessionConfig,
    canonicalCharacters: state.canonicalCharacters,
    characterData: {}
  });
  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(...articleWriterInputs(state));
  return { systemPrompt, userPrompt, evidenceBundle: state.evidenceBundle };
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

  const { systemPrompt, userPrompt, evidenceBundle } = await buildProbePrompt({ sessionId: SESSION_ID, ...session });
  console.log(`Record: ${evidenceBundle.exposed.paperEvidence.length} paper documents and ` +
    `${evidenceBundle.exposed.tokens.length} memory tokens`);

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

module.exports = { main, tokensOf, paperEvidenceOf, loadSession, buildProbeRecord, probeArticleState, buildProbePrompt, ITEMS_PER_ARC };
