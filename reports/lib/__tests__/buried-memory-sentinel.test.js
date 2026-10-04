/**
 * A buried memory reaches no prompt as an id, an owner or text (phase 2, brief 2.1's
 * invariant; final fix wave item 1).
 *
 * On 092026 the director-notes <TRANSACTION_LINKS> printed each linked sale with its
 * memory id (sar004, tay001, fli001, rem003, ash001, kai001), and an id's prefix names
 * the owner. It reached the arc, outline and article writers and reworkers and all
 * three judges. The enricher's own prompt carried the ids too, and the Haiku
 * preprocessor sent every buried memory with its id and name.
 *
 * This test plants one buried memory with a unique id, owner and text everywhere a
 * buried memory can enter: the fetched memories, the session report's parse, the
 * curated bundle (with every field a careless upstream could leave on it), and a
 * director-notes link stored the old way (with tokenId and tokenOwner). It then
 * builds every prompt through its own node, with a recording stand-in for the model,
 * and asserts none of them carries the id, the owner or the text.
 *
 * Phase 4 (brief 4.4): the arc stage writes the weave, so no prompt of its writer, its
 * rework or its fact check may carry the memory, and none reaches the weave. The arc
 * stage is the journalist's alone (R1).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { generateOutline, reviseOutline, generateContentBundle, reviseContentBundle } = require('../workflow/nodes/ai-nodes');
const { analyzeArcsPlayerFocusGuided, reviseArcs } = require('../workflow/nodes/arc-specialist-nodes');
const { evaluateArcs, evaluateArticle } = require('../workflow/nodes/evaluator-nodes');
const { extractCharacterData } = require('../workflow/nodes/character-data-nodes');
const { parseRawInput } = require('../workflow/nodes/input-nodes');
const { createEvidencePreprocessor } = require('../evidence-preprocessor');
const { REVISION_CAPS } = require('../workflow/state');

const SENTINEL_ID = 'qzx913';
const SENTINEL_OWNER = 'Octavia Quillfeather';
const SENTINEL_TEXT = 'QZX913 - 10:02PM - Octavia slides the vial under the piano bench and says nothing.';

/** Every fragment that would identify the memory. Matched case-insensitively. */
const SENTINELS = [SENTINEL_ID, 'Quillfeather', 'Octavia', 'piano bench', 'the vial'];

function leaksIn(text) {
  const lower = String(text).toLowerCase();
  return SENTINELS.filter((s) => lower.includes(s.toLowerCase()));
}

const clone = (v) => JSON.parse(JSON.stringify(v));

/** A model stand-in that records every call and answers by `answer(options)`. */
function recordingSdk(answer) {
  return jest.fn(async (options) => clone(answer(options)));
}

const promptsOf = (sdk) => sdk.mock.calls.map(([options]) => `${options.systemPrompt || ''}\n=====\n${options.prompt || ''}`);
const cfg = (sdk, theme = 'journalist') => ({ configurable: { sdkClient: sdk, theme } });

/** The buried memory as the Notion fetch returns it, tagged buried with its sale. */
const BURIED_TOKEN = {
  tokenId: SENTINEL_ID,
  id: SENTINEL_ID,
  name: `${SENTINEL_ID.toUpperCase()} - The vial`,
  disposition: 'buried',
  fullDescription: SENTINEL_TEXT,
  owners: [SENTINEL_OWNER],
  owner: { name: SENTINEL_OWNER, logline: `${SENTINEL_OWNER}, the pianist` },
  shellAccount: 'Gorlan',
  transactionAmount: 125000,
  sessionTransactionTime: '08:16 PM'
};

/** The same memory as a careless upstream could leave it on the curated bundle. */
const HOSTILE_BURIED_ROW = {
  ...BURIED_TOKEN,
  ownerLogline: SENTINEL_OWNER,
  owner: SENTINEL_OWNER,
  content: SENTINEL_TEXT,
  summary: SENTINEL_TEXT,
  text: SENTINEL_TEXT,
  rawData: { ...BURIED_TOKEN },
  sourceType: 'memory-token',
  amount: 125000,
  time: '08:16 PM',
  temporalContext: 'INVESTIGATION'
};

/** A director-notes link as a thread enriched before the fix stored it. */
const OLD_LINK = {
  excerpt: 'Someone lingered at the Valet just after eight.',
  linkedTransactions: [{ timestamp: '08:16 PM', tokenId: SENTINEL_ID, tokenOwner: SENTINEL_OWNER, amount: '$125,000', sellingTeam: 'Gorlan' }],
  confidence: 'high',
  linkReasoning: 'The time and the account converge.'
};

/**
 * The evidence log as the model-filled parse could leave it (phase 3, brief 3.5;
 * Review Focus 3): an entry for the buried memory, with its owner as the name on the
 * turn-in, beside a real exposure. The morning timeline reads exposures only for
 * memories the bundle holds as exposed.
 */
const EXPOSURES_WITH_BURIED = [
  { tokenId: SENTINEL_ID, exposer: SENTINEL_OWNER, time: '08:16 PM', owner: SENTINEL_OWNER },
  { tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '07:37 PM', owner: 'Alex Reeves' }
];

/** The session state every writer, reworker and judge is built from. */
function sentinelState(theme = 'journalist') {
  const state = reworkFixtureState(theme);
  state.evidenceBundle.buried.transactions.push(clone(HOSTILE_BURIED_ROW));
  state.directorNotes.transactionReferences = [clone(OLD_LINK)];
  // A stored link prints only when the notes hold its observation word for word (3.6b
  // fix batch), so the notes hold this one, and the prompts print it.
  state.directorNotes.rawProse = `${state.directorNotes.rawProse} ${OLD_LINK.excerpt}`;
  state.sessionConfig.exposures = clone(EXPOSURES_WITH_BURIED);
  return state;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe('the fixture plants the buried memory where it can enter', () => {
  it('the bundle and the director\'s links carry the id, the owner and the text', () => {
    const state = sentinelState();
    expect(leaksIn(JSON.stringify(state.evidenceBundle.buried))).toEqual(SENTINELS);
    expect(leaksIn(JSON.stringify(state.directorNotes))).toEqual([SENTINEL_ID, 'Quillfeather', 'Octavia']);
    expect(leaksIn(JSON.stringify(state.sessionConfig.exposures))).toEqual([SENTINEL_ID, 'Quillfeather', 'Octavia']);
  });
});

describe('the arc stage: no prompt carries the buried memory, so none reaches the weave', () => {
  it('the arc writer', async () => {
    const sdk = recordingSdk(() => sentinelState().weave);
    await analyzeArcsPlayerFocusGuided({ ...sentinelState(), weave: null }, cfg(sdk));
    const prompts = promptsOf(sdk);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('<TRANSACTION_LINKS>');
    // Phase 3 (3.5): the arc writer reads the morning timeline, with the sale and the
    // real exposure on it, and the buried memory's evidence-log entry left out.
    expect(prompts[0]).toContain('<morning-timeline>');
    expect(prompts[0]).toContain('| sale | account: Gorlan | amount: $125,000');
    expect(prompts[0]).toContain('| exposure | document: ale003 | anonymous');
    expect(leaksIn(prompts[0])).toEqual([]);
  });

  it('the arc reworker', async () => {
    const state = sentinelState();
    const sdk = recordingSdk(() => state.weave);
    await reviseArcs({ ...state, _arcFeedback: 'Tighten it.', humanArcRevisionCount: 1 }, cfg(sdk));
    const [prompt] = promptsOf(sdk);
    expect(prompt).toContain('<TRANSACTION_LINKS>');
    expect(prompt).toContain('PREVIOUS WEAVE OUTPUT');
    expect(leaksIn(prompt)).toEqual([]);
  });

  it('the fact check', async () => {
    const verdict = () => ({ ready: true, structuralPassed: true, overallScore: 1, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' });
    const sdk = recordingSdk(verdict);
    await evaluateArcs({ ...sentinelState(), selectedArcs: [], evaluationHistory: [] }, cfg(sdk));
    const prompts = promptsOf(sdk);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('<TRANSACTION_LINKS>');
    expect(prompts[0]).toContain('<morning-timeline>');
    expect(leaksIn(prompts[0])).toEqual([]);
  });
});

describe.each(['journalist', 'detective'])('%s: no writer, reworker or judge prompt carries the buried memory', (theme) => {
  it('the outline writer and its reworker', async () => {
    const state = sentinelState(theme);
    const writer = recordingSdk(() => OUTLINE);
    const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(writer, theme));
    const rework = recordingSdk(() => OUTLINE);
    await reviseOutline({ ...state, heroImage, outline: null, _previousOutline: OUTLINE, outlineRevisionCount: 1 }, cfg(rework, theme));
    for (const prompt of [...promptsOf(writer), ...promptsOf(rework)]) {
      // The detective writers carry no director-notes block at all.
      expect(prompt.includes('<TRANSACTION_LINKS>')).toBe(theme === 'journalist');
      // Both themes read the record view, so both get the morning timeline (3.5).
      expect(prompt).toContain('<morning-timeline>');
      expect(leaksIn(prompt)).toEqual([]);
    }
  });

  it('the article writer and its reworker', async () => {
    const state = { ...sentinelState(theme), heroImage: 'hero.jpg' };
    const writer = recordingSdk(() => PREVIOUS_BUNDLE);
    await generateContentBundle({ ...state, contentBundle: null }, cfg(writer, theme));
    const rework = recordingSdk(() => PREVIOUS_BUNDLE);
    await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: PREVIOUS_BUNDLE, articleRevisionCount: 1 }, cfg(rework, theme));
    for (const prompt of [...promptsOf(writer), ...promptsOf(rework)]) {
      // The detective writers carry no director-notes block at all.
      expect(prompt.includes('<TRANSACTION_LINKS>')).toBe(theme === 'journalist');
      expect(prompt).toContain('<morning-timeline>');
      expect(leaksIn(prompt)).toEqual([]);
    }
  });

  // Phase 4 (brief 4.6): the outline judge went; the article judge stays.
  it('the article judge', async () => {
    const verdict = () => ({ ready: true, structuralPassed: true, overallScore: 0.9, criteriaScores: {}, structuralIssues: [], advisoryWarnings: [], confidence: 'high' });
    const state = { ...sentinelState(theme), heroImage: 'hero.jpg', evaluationHistory: [] };
    // At the cap the article judge runs whatever the fact check found.
    const article = recordingSdk(verdict);
    await evaluateArticle({ ...state, contentBundle: PREVIOUS_BUNDLE, articleApproved: false, articleRevisionCount: REVISION_CAPS.ARTICLE }, cfg(article, theme));
    const prompts = promptsOf(article);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('<TRANSACTION_LINKS>');
    expect(leaksIn(prompts[0])).toEqual([]);
    // The article judge reads the whole record view, timeline included.
    expect(prompts[0]).toContain('<morning-timeline>');
  });
});

describe('no call before the writers carries the buried memory', () => {
  const EXPOSED_TOKEN = {
    tokenId: 'ale003', id: 'ale003', name: 'ALE003 - The sale', disposition: 'exposed',
    fullDescription: 'ALE003 - 11:32PM - MARCUS brags about the BizAI sale.', owners: ['Alex Reeves']
  };
  const PAPER = { notionId: 'p-dna', id: 'p-dna', name: 'DNA test', basicType: 'Document', description: 'Paternity test result.', owners: ['Sarah Blackwood'] };

  it('the Haiku preprocessor input, and the buried memory still comes out keyed to its id', async () => {
    const sdk = recordingSdk((options) => {
      const items = JSON.parse(options.prompt.slice(options.prompt.indexOf('[')));
      return { items: items.map((i) => ({ id: i.id, sourceType: i.sourceType, summary: 's' })) };
    });
    const result = await createEvidencePreprocessor({ sdkClient: sdk }).process({
      memoryTokens: [clone(EXPOSED_TOKEN), clone(BURIED_TOKEN)], paperEvidence: [clone(PAPER)], sessionId: 'sentinel'
    });
    const prompts = promptsOf(sdk);
    expect(prompts.length).toBeGreaterThan(0);
    prompts.forEach((p) => expect(leaksIn(p)).toEqual([]));

    const buried = result.items.find((i) => i.id === SENTINEL_ID);
    expect(buried).toMatchObject({ disposition: 'buried', shellAccount: 'Gorlan', transactionAmount: 125000, sessionTransactionTime: '08:16 PM' });
    expect(leaksIn(JSON.stringify({ ...buried, id: null }))).toEqual([]);
  });

  it('character extraction', async () => {
    const sdk = recordingSdk(() => ({ characters: {} }));
    await extractCharacterData({
      sessionConfig: { roster: ['Alex', 'Sarah'] }, characterData: null,
      memoryTokens: [clone(EXPOSED_TOKEN), clone(BURIED_TOKEN)], paperEvidence: [clone(PAPER)]
    }, cfg(sdk));
    const [prompt] = promptsOf(sdk);
    expect(prompt).toContain('BizAI');
    expect(leaksIn(prompt)).toEqual([]);
  });

  describe('the director-notes enricher', () => {
    let dataDir;
    beforeEach(() => { dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-sentinel-')); });
    afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

    it('never sees the memory id; its link names the row by key, and the code maps it back to the sale', async () => {
      const enrichmentCalls = [];
      const sdk = jest.fn(async (options) => {
        if (options.label === 'Director notes enrichment') {
          enrichmentCalls.push(options);
          return {
            characterMentions: {}, quotes: [], postInvestigationDevelopments: [],
            transactionReferences: [{ excerpt: 'Someone lingered at the Valet just after eight.', linkedTransactions: [{ key: 'tx-1' }], confidence: 'high' }]
          };
        }
        if (options.model === 'haiku') return { sessionId: 'SENTINEL', roster: ['Alex'], accusation: { accused: ['Alex'], charge: 'Murder' } };
        return {
          exposedTokens: ['ale003'],
          buriedTokens: [{ tokenId: SENTINEL_ID, shellAccount: 'Gorlan', amount: 125000, time: '08:16 PM' }],
          shellAccounts: [{ name: 'Gorlan', total: 125000, tokenCount: 1, rank: 1 }],
          exposedCount: 1, buriedCount: 1, totalBuried: 125000
        };
      });

      const result = await parseRawInput({
        accusation: 'The room accused Alex.',
        sessionReport: `| 08:16 PM | Sale | ${SENTINEL_ID}/${SENTINEL_OWNER} | Gorlan | +$125,000 |`,
        directorNotesRaw: 'Someone lingered at the Valet just after eight.',
        sessionConfig: {},
        rawSessionInput: {}
      }, { configurable: { sdkClient: sdk, dataDir, sessionId: 'SENTINEL' } });

      expect(enrichmentCalls).toHaveLength(1);
      const prompt = `${enrichmentCalls[0].systemPrompt}\n${enrichmentCalls[0].prompt}`;
      expect(prompt).toContain('"key": "tx-1"');
      expect(prompt).toContain('Gorlan');
      expect(leaksIn(prompt)).toEqual([]);

      const [link] = result.directorNotes.transactionReferences[0].linkedTransactions;
      expect(link).toEqual({ timestamp: '08:16 PM', amount: '$125,000', sellingTeam: 'Gorlan' });
      expect(leaksIn(JSON.stringify(result.directorNotes))).toEqual([]);
    });
  });
});
