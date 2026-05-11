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
 * Output: a single line with the full diagnostic envelope, regardless of
 * success or failure.
 *
 * Usage: node scripts/probe-content-bundle-channel.js
 */

const fs = require('fs');
const path = require('path');
const { sdkQuery } = require('../lib/llm');
const { createPromptBuilder } = require('../lib/prompt-builder');
const contentBundleSchema = require('../lib/schemas/content-bundle.schema.json');

const SESSION_ID = process.env.PROBE_SESSION_ID || '050926';
const DATA_DIR = path.join(__dirname, '..', 'data', SESSION_ID);

const REQUIRED_FILES = [
  'inputs/session-config.json',
  'inputs/director-notes.json',
  'fetched/tokens.json',
  'fetched/paper-evidence.json'
];

function loadJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
}

(async function main() {
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
  const sessionConfig = loadJson('inputs/session-config.json');
  const directorNotes = loadJson('inputs/director-notes.json');
  const tokensFile = loadJson('fetched/tokens.json');
  const paperFile = loadJson('fetched/paper-evidence.json');
  const tokens = Array.isArray(tokensFile) ? tokensFile : (tokensFile.tokens || []);
  const paperEvidence = Array.isArray(paperFile) ? paperFile : (paperFile.items || paperFile.paperEvidence || []);

  console.log(`Loaded: ${tokens.length} tokens, ${paperEvidence.length} paper items, roster=${sessionConfig.roster.length}`);

  // Build canonicalCharacters map (name → name for roster members)
  const canonicalCharacters = {};
  for (const name of sessionConfig.roster) {
    canonicalCharacters[name] = name;
  }

  // Build representative arcEvidencePackages — 5 arcs, each with 8-15 evidence items
  // drawn from real tokens so prompt size is in the same range as the failed call.
  // Each item carries fullContent so the prompt's "QUOTABLE EXCERPTS" + "FULL EVIDENCE" sections fill out.
  const arcNames = [
    "The Marcus Problem: Vic and Morgan's Convergent Interests",
    "Sarah's Coronation: The Quietest Person in the Room",
    "Marcus's Stolen Empire: Convergent Victims",
    "The Black Market Confessional: Named Accounts, Performed Innocence",
    "Remi's Engineered Exposure: The Cleanest Operator in the Room"
  ];

  const itemsPerArc = [13, 11, 21, 16, 12]; // matches the real failed call
  let tokenIdx = 0;
  const arcEvidencePackages = arcNames.map((arcTitle, arcIdx) => {
    const count = itemsPerArc[arcIdx];
    const items = [];
    for (let i = 0; i < count && tokenIdx < tokens.length; i++, tokenIdx = (tokenIdx + 1) % tokens.length) {
      const t = tokens[tokenIdx];
      items.push({
        id: t.id || t.tokenId,
        type: 'memory-token',
        fullContent: t.fullDescription || t.description || t.summary || '',
        summary: t.summary || '',
        quotableExcerpts: []
      });
    }
    return {
      arcId: `arc-${arcIdx}`,
      arcTitle,
      evidenceItems: items,
      photos: [
        { filename: `aln0509 (${arcIdx + 1} of 10).jpg`, characters: sessionConfig.roster.slice(0, 3) }
      ]
    };
  });

  // Synthetic outline matching the real one's shape (the user's edited version was ~17KB).
  // We need similar prompt size and structure to trigger the same conditions.
  const outline = {
    metadata: { sessionId: SESSION_ID, theme: 'journalist' },
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

  const template = await promptBuilder.theme.loadTemplate().catch(() => '');

  const { systemPrompt, userPrompt } = await promptBuilder.buildArticlePrompt(
    outline,
    template,
    arcEvidencePackages,
    'aln0509 (10 of 10).jpg',
    shellAccounts,
    sessionFacts,
    directorNotes,
    null
  );

  console.log(`\nBuilt prompt: system=${systemPrompt.length} chars, user=${userPrompt.length} chars\n`);

  // Make the call with new instrumentation watching
  let captured = null;
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
    console.log(`output keys: ${Object.keys(result).join(', ')}`);
  } catch (err) {
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
})().catch(err => {
  console.error('Probe crashed:', err);
  process.exit(1);
});
