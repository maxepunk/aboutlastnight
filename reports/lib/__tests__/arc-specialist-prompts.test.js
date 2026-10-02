/**
 * Arc-specialist prompt builders consume enriched director-notes shape
 *
 * Verifies that both the core arc prompt and the revision prompt surface
 * the enriched director-notes fields (rawProse, quotes, transactionReferences,
 * postInvestigationDevelopments) and no longer emit the legacy 3-bucket
 * observations shape.
 */

describe('arc-specialist prompt builders consume enriched director-notes', () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');

  const state = {
    sessionConfig: { roster: ['Alex', 'Vic', 'Morgan'] },
    playerFocus: {
      accusation: { accused: ['Alex'], charge: 'Murder', reasoning: 'Motive present' },
      whiteboardContext: { suspectsExplored: ['Vic'], connections: [], notes: [], namesFound: ['Alex'] },
      primaryInvestigation: 'Who killed Marcus'
    },
    directorNotes: {
      // Phase 3 (3.6): an epilogue item prints as the director's sentence, so the
      // sentence is in the notes.
      // The link's observation too (3.6b fix batch: a link prints only when the notes hold it).
      rawProse: 'Alex was seen with Sam in the corner. "we had to act" Alex said. Alex paid Blake. Alex was detained after the investigation.',
      quotes: [{ speaker: 'Alex', text: 'we had to act', confidence: 'high' }],
      transactionReferences: [{
        excerpt: 'Alex paid Blake',
        linkedTransactions: [{ timestamp: '09:40 PM', tokenId: 'tay004', amount: '$450,000' }],
        confidence: 'high'
      }],
      postInvestigationDevelopments: [{ detail: 'Alex was detained after the investigation.' }],
      whiteboard: {}
    },
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] }, allEvidenceIds: [] },
    theme: 'journalist',
    canonicalCharacters: {}
  };

  it('buildCoreArcPrompt includes rawProse and NOT legacy 3-bucket JSON', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
    expect(prompt).not.toMatch(/\*\*Suspicious Correlations:\*\*/);
    expect(prompt).not.toMatch(/\*\*Notable Moments:\*\*/);
  });

  it('buildCoreArcPrompt surfaces quotes, transactionReferences, postInvestigationDevelopments', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).toContain('we had to act');
    // The linked sale is a buried memory's: account, amount and time, never its id
    // (phase 2 final fix wave).
    expect(prompt).toContain('amount: $450,000 | time: 09:40 PM');
    expect(prompt).not.toContain('tay004');
    expect(prompt).toContain('<EPILOGUE>');
    expect(prompt).toContain('- Alex was detained after the investigation.');
  });

  it('buildArcRevisionPrompt includes rawProse and NOT legacy arrays', () => {
    const revisionState = { ...state, validationResults: { structuralIssues: [], issues: [] } };
    const prompt = arcModule._testing.buildArcRevisionPrompt(revisionState, '', '');
    expect(prompt).toContain('Alex was seen with Sam in the corner.');
    expect(prompt).not.toMatch(/\*\*Behavior Patterns:\*\*/);
  });

  it('asks for a plain claim in the summary, not the reporter telling it (brief 1.2)', () => {
    // The summaries are what the director reads on the arc cards and what the
    // outline is built from, and they came back in the reporter's voice with
    // presence claims in them. The field's own instruction is where that is said.
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).not.toContain('"summary": "2-3 sentences describing this narrative thread"');
    const summaryLine = prompt.split(String.fromCharCode(10)).find(l => l.trim().startsWith('"summary":'));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toMatch(/1 to 3 plain sentences/);
    expect(summaryLine).toMatch(/what this thread claims happened/);
    expect(summaryLine).toMatch(/[Tt]hird person/);
    expect(summaryLine).toMatch(/no reporter persona/);
    expect(summaryLine).toMatch(/no presence claims/);
  });

  it('the arc system prompts state the reporting mode of the session (brief 1.5)', () => {
    // The arc writer was never told where the reporter was, so a remote session's
    // arc summaries said "I watched". The block is the same one the article system
    // prompt carries, in the same position: after the identity line. Phase 3 (3.1):
    // the journalist's is the rule set's mode file; the detective keeps the old block.
    const { loadModeBlock } = require('../rule-set');
    const { DETECTIVE_REPORTING_MODE_BLOCKS } = require('../prompt-builder');
    const remote = { reportingMode: 'remote' };

    expect(arcModule._testing.coreArcSystemPrompt(remote, 'journalist')).toContain(loadModeBlock('remote'));
    expect(arcModule._testing.interweavingSystemPrompt(remote, 'journalist')).toContain(loadModeBlock('remote'));
    expect(arcModule._testing.coreArcSystemPrompt({}, 'journalist')).toContain(loadModeBlock('on-site'));
    expect(arcModule._testing.getArcRevisionSystemPrompt(true, remote, 'journalist')).toContain(loadModeBlock('remote'));
    // No theme: the arc file's own default, the journalist.
    expect(arcModule._testing.coreArcSystemPrompt(remote)).toContain(loadModeBlock('remote'));
    expect(arcModule._testing.coreArcSystemPrompt(remote, 'detective')).toContain(DETECTIVE_REPORTING_MODE_BLOCKS.remote);
    expect(arcModule._testing.interweavingSystemPrompt(remote, 'detective')).toContain(DETECTIVE_REPORTING_MODE_BLOCKS.remote);
    expect(arcModule._testing.getArcRevisionSystemPrompt(false, remote, 'detective')).toContain(DETECTIVE_REPORTING_MODE_BLOCKS.remote);
  });

  it('enrichWithInterweaving takes the theme from the graph config: a detective session gets the detective block', async () => {
    // The interweaving call has no state, so the session's theme reaches it only through
    // configurable.theme (server.js sets it on start, approve, rollback and resume). A
    // caller that dropped it would fall back to the arc file's journalist default and put
    // the journalist block in a detective prompt with no error (review of 3.1, finding 2).
    const { loadModeBlock } = require('../rule-set');
    const { DETECTIVE_REPORTING_MODE_BLOCKS } = require('../prompt-builder');
    const sdk = jest.fn().mockResolvedValue({ arcInterweaving: [], interweavingPlan: {} });
    const arcs = [{ id: 'arc-1', title: 'T', summary: 'S', arcSource: 'accusation', characterPlacements: {} }];

    await arcModule._testing.enrichWithInterweaving(
      arcs, ['Alex'], { configurable: { sdkClient: sdk, theme: 'detective' } }, { reportingMode: 'remote' }
    );

    const { systemPrompt } = sdk.mock.calls[0][0];
    expect(systemPrompt).toContain(DETECTIVE_REPORTING_MODE_BLOCKS.remote);
    expect(systemPrompt).not.toContain(loadModeBlock('remote'));
    expect(systemPrompt).toBe(arcModule._testing.interweavingSystemPrompt({ reportingMode: 'remote' }, 'detective'));
  });

  it('no arc system prompt hands the writer a first-person presence marker (integrator ruling, phase 1)', () => {
    const { CORE_ARC_SYSTEM_PROMPT, INTERWEAVING_SYSTEM_PROMPT } = require('../sdk-client/subagents');
    for (const text of [CORE_ARC_SYSTEM_PROMPT, INTERWEAVING_SYSTEM_PROMPT]) {
      expect(text).not.toContain('I watched');
      expect(text).not.toContain('I saw');
      expect(text).not.toContain('Nova WAS there');
    }
  });
});

/**
 * Brief 2.1 — the arc writer and the interweaving call read the record view.
 *
 * The arc writer used to read Haiku's summary of each memory's name and the first
 * 200 characters of each paper document. SECTION 3's exposed items are now the
 * record view's documents, in full; its buried transactions stay as they were (R2),
 * so they appear once. Phase 3 (3.3): the journalist writer's SECTION 3 is the whole
 * view, the sales on its morning timeline; the detective keeps its own list.
 */
describe('arc prompts carry the record view (brief 2.1)', () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');
  const { buildValidEvidenceIds } = require('../workflow/nodes/node-helpers');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');

  const LONG_PAPER = 'Paternity test result. ' + 'The probability of paternity is 99.9 percent. '.repeat(10);
  const MEMORY_TEXT = 'ALEX.3 - 11:32PM - MARCUS brags about the BizAI sale. Worth it. Finally worth it.';
  const evidenceBundle = {
    exposed: {
      tokens: [{
        id: 'ale003', sourceType: 'memory-token', owner: 'Derived Guess',
        summary: 'Haiku summary of the name', characterRefs: ['Marcus'],
        fullContent: MEMORY_TEXT, content: MEMORY_TEXT, temporalContext: 'PARTY',
        rawData: { tokenId: 'ale003', name: 'ALE003 - Alex fight', fullDescription: MEMORY_TEXT, owners: ['Alex Reeves'] }
      }],
      paperEvidence: [
        { notionId: 'p-dna', name: 'DNA test', basicType: 'Document', description: LONG_PAPER,
          owners: ['Sarah Blackwood'], id: 'p-dna', fullContent: LONG_PAPER, sourceType: 'paper-evidence' },
        // A rescued item: the raw record, no id, no fullContent.
        { notionId: 'p-rescued', name: 'Rescued letter', basicType: 'Prop',
          description: 'Dear Marcus, I know what you did.', owners: [], rescuedByHuman: true }
      ]
    },
    buried: {
      transactions: [{ sourceType: 'memory-token', shellAccount: 'Melanie', amount: 75000, time: '07:50 PM', temporalContext: 'INVESTIGATION' }]
    }
  };
  const state = {
    sessionConfig: { roster: ['Alex'] },
    playerFocus: { accusation: { accused: ['Alex'], charge: 'Murder' }, whiteboardContext: {} },
    directorNotes: { rawProse: 'Alex argued with Sarah.' },
    evidenceBundle,
    theme: 'journalist',
    canonicalCharacters: {}
  };
  const count = (haystack, needle) => haystack.split(needle).length - 1;

  it('SECTION 3 holds every exposed document in full, once, labelled from the record', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    const section3 = prompt.slice(prompt.indexOf('## SECTION 3'), prompt.indexOf('## SECTION 4:'));
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(section3).toContain('<RECORD>');
    expect(count(prompt, MEMORY_TEXT)).toBe(1);
    expect(count(prompt, LONG_PAPER.trim())).toBe(1);   // past the old 200-character cut
    expect(section3).toContain('<document id="ale003" kind="memory" name="ALE003 - Alex fight" owner="Alex Reeves" layer="exposed">');
    expect(section3).toContain('<document id="p-rescued" kind="Prop" name="Rescued letter" layer="exposed">');
    // The summaries of names no longer stand in for a document.
    expect(prompt).not.toContain('Haiku summary of the name');
    expect(prompt).not.toContain('Derived Guess');
    // Phase 3 (3.3): SECTION 3 is the whole record view, its intro counting the documents.
    expect(section3).toContain('The 1 exposed memories and 2 paper documents in full, then the morning timeline');
  });

  it('the sales appear once, on the record view\'s morning timeline (phase 3, 3.3); the detective keeps its list (R2)', () => {
    // Brief 2.1 kept the writer's own Buried Transactions list beside the documents;
    // 3.3 gives the journalist writer the record view's timeline in its place.
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    expect(prompt).not.toContain('### Buried Transactions');
    expect(prompt).toContain('- 07:50 AM | sale | account: Melanie | amount: $75,000');
    expect(prompt).not.toContain('<buried-transactions>');
    expect(count(prompt, 'Melanie')).toBe(1);

    const detective = arcModule._testing.buildCoreArcPrompt({ ...state, theme: 'detective' });
    expect(detective).toContain('### Buried Transactions (1 items - Layer 2, INVESTIGATION ACTIONS)');
    expect(detective).toContain('"shellAccount": "Melanie"');
    expect(detective).not.toContain('<morning-timeline>\n');
    expect(count(detective, 'Melanie')).toBe(1);
  });

  it('names a rescued document by the id the view gives it, in the id list and the arc check', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt(state);
    const idList = prompt.slice(prompt.indexOf('### All Valid Evidence IDs'), prompt.indexOf('CRITICAL: keyEvidence'));
    expect(idList).toContain('"p-rescued"');
    expect(idList).not.toContain('"Rescued letter"');
    expect(buildValidEvidenceIds(evidenceBundle).has('p-rescued')).toBe(true);
  });

  it('labels the character context as a model\'s extraction that the record overrules', () => {
    const prompt = arcModule._testing.buildCoreArcPrompt({
      ...state,
      characterData: { characters: { Alex: { groups: ['Stanford Four'], relationships: {}, role: 'CEO' } } }
    });
    expect(prompt).toContain(`### Character Context (${DERIVED_LABELS.characterContext})`);
    expect(prompt).not.toContain('use for accuracy');
    expect(prompt).not.toContain('as ground truth');
  });

  it('the interweaving call holds the whole view once: documents and the morning timeline', () => {
    const arcs = [{ id: 'arc-1', title: 'T', summary: 'S', arcSource: 'accusation', characterPlacements: {} }];
    // Phase 3 (3.5): the session config reaches the record view, so the timeline
    // carries the exposure beside the sale, on the evening clock.
    const sessionConfig = { exposures: [{ tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '07:37 PM' }] };
    const prompt = arcModule._testing.buildInterweavingPrompt(arcs, ['Alex'], evidenceBundle, sessionConfig);
    expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
    expect(count(prompt, MEMORY_TEXT)).toBe(1);
    expect(count(prompt, LONG_PAPER.trim())).toBe(1);
    expect(prompt).toContain('- 07:37 AM | exposure | document: ale003 | anonymous\n- 07:50 AM | sale | account: Melanie | amount: $75,000');
    expect(prompt.indexOf('</RECORD>')).toBeLessThan(prompt.indexOf('## YOUR TASK'));
  });

  it('enrichWithInterweaving hands the bundle to the prompt', async () => {
    const sdk = jest.fn().mockResolvedValue({ arcInterweaving: [], interweavingPlan: {} });
    const arcs = [{ id: 'arc-1', title: 'T', summary: 'S', arcSource: 'accusation', characterPlacements: {} }];
    await arcModule._testing.enrichWithInterweaving(arcs, ['Alex'], { configurable: { sdkClient: sdk } }, {}, evidenceBundle);
    expect(sdk.mock.calls[0][0].prompt).toContain(MEMORY_TEXT);
  });
});

/**
 * The director's words in the arc writer and the arc reworker (phase 2, brief 2.2):
 * standing notes through filterGateNotes with the gate `arc-selection`, the
 * input-review corrections after the notes, and the accusation beside the
 * director's account of it, with a no-culprit verdict said as such.
 */
describe("arc prompts: the director's words as record", () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');
  const { buildCoreArcPrompt, buildArcRevisionPrompt } = arcModule._testing;
  const { renderWhiteboardConnections } = require('../prompt-renderers/director-words-renderer');

  const RAW_ACCUSATION = 'Six votes for an accidental overdose, in a final round that had already deadlocked 4 to 4 between Alex and Vic.';
  const CORRECTION = 'This was actually Blake -> Ashe, and what was said was my company would be very interested.';
  const NOTES = [
    { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the succession thread.', at: 't1' },
    { gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Put the vote first.', at: 't2' }
  ];

  const base = {
    sessionConfig: {
      roster: ['Alex', 'Vic'],
      accusation: { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose' },
      accusationRaw: RAW_ACCUSATION
    },
    playerFocus: {
      accusation: { verdictKind: 'overdose', accused: [], charge: 'Accidental overdose', reasoning: 'deadlocked 4 to 4' },
      whiteboardContext: { suspectsExplored: [], connections: [], notes: [], namesFound: [] },
      primaryInvestigation: 'Accidental overdose'
    },
    directorNotes: {
      rawProse: 'Vic to Ashe: "My company is very interesting."',
      quotes: [], transactionReferences: [], postInvestigationDevelopments: []
    },
    inputReviewCorrections: [CORRECTION],
    evidenceBundle: { exposed: { tokens: [], paperEvidence: [] }, buried: { transactions: [] } },
    theme: 'journalist',
    canonicalCharacters: {}
  };

  describe('standing notes', () => {
    it('the reworker shows every earlier arc note and leaves out the one it is acting on', () => {
      const prompt = buildArcRevisionPrompt({ ...base, directorGateNotes: NOTES, _arcFeedback: 'Put the vote first.' }, 'CTX', 'PREV');
      expect(prompt).toContain('<DIRECTOR_GUIDANCE>');
      expect(prompt).toContain('- [arc-selection, rejection 1] Drop the succession thread.');
      expect(prompt).not.toContain('- [arc-selection, rejection 2] Put the vote first.');
      expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    });

    it('the writer renders them through the same function', () => {
      const prompt = buildCoreArcPrompt({ ...base, directorGateNotes: NOTES });
      expect(prompt).toContain('- [arc-selection, rejection 1] Drop the succession thread.');
      expect(prompt).toContain('- [arc-selection, rejection 2] Put the vote first.');
    });

    it('adds nothing when there are no notes', () => {
      expect(buildCoreArcPrompt({ ...base, directorGateNotes: [] })).not.toContain('DIRECTOR_GUIDANCE');
      expect(buildArcRevisionPrompt({ ...base, directorGateNotes: null }, '', '')).not.toContain('DIRECTOR_GUIDANCE');
    });
  });

  describe('input-review corrections', () => {
    it('follow the notes in the writer and the reworker, which keep the uncorrected sentence', () => {
      for (const prompt of [buildCoreArcPrompt(base), buildArcRevisionPrompt(base, '', '')]) {
        expect(prompt).toContain('Vic to Ashe: "My company is very interesting."');
        expect(prompt).toContain(CORRECTION);
        expect(prompt.indexOf('</DIRECTOR_NOTES>')).toBeLessThan(prompt.indexOf('<DIRECTOR_CORRECTIONS>'));
      }
    });
  });

  describe('the accusation', () => {
    it("carries the director's account word for word and names no culprit for an overdose", () => {
      for (const prompt of [buildCoreArcPrompt(base), buildArcRevisionPrompt(base, '', '')]) {
        expect(prompt).toContain(RAW_ACCUSATION);
        expect(prompt).toContain("**Accused:** none (the room's verdict names no culprit: an overdose)");
        expect(prompt).toContain('**Charge:** Accidental overdose');
        expect(prompt).toMatch(/Place no one as the accused, and never the victim\./);
      }
    });

    it('a culprit verdict prints as before', () => {
      const culprit = {
        ...base,
        sessionConfig: { roster: ['Alex'] },
        playerFocus: { ...base.playerFocus, accusation: { accused: ['Alex'], charge: 'Murder', reasoning: 'Motive present' } }
      };
      const prompt = buildCoreArcPrompt(culprit);
      expect(prompt).toContain('**Accused:** ["Alex"]\n**Charge:** Murder\n**Players\' Reasoning:** Motive present\n\nYou MUST generate');
      expect(prompt).not.toContain('<DIRECTOR_ACCUSATION>');
    });
  });

  describe('the whiteboard section', () => {
    it('is rendered by the shared function, labelled as a model\'s reading of the photo (phase 3, 3.5)', () => {
      const prompt = buildCoreArcPrompt(base);
      expect(prompt).toContain(renderWhiteboardConnections(base.playerFocus.whiteboardContext));
      expect(prompt).toContain("### The Whiteboard (a model's reading of the photo)\nA model's reading of the photo of the whiteboard where the room kept its working notes during the investigation: context for how the room reasoned toward its verdict, not a source.\n**Regions, each under the heading the players wrote:** none");
      expect(prompt).not.toContain('Players drew these');
    });
  });

  describe('the interweaving plan in the reworker', () => {
    it('shows the previous plan and asks for the plan back', () => {
      const plan = { suggestedOrder: ['arc-a', 'arc-b'], convergencePoint: 'the vote', keyCallbacks: [] };
      const prompt = buildArcRevisionPrompt({ ...base, _arcAnalysisCache: { interweavingPlan: plan } }, '', '');
      expect(prompt).toContain('### PREVIOUS INTERWEAVING PLAN');
      expect(prompt).toContain('"convergencePoint": "the vote"');
      expect(prompt).toMatch(/Return the interweavingPlan \(suggestedOrder, convergencePoint, keyCallbacks\)/);
    });
  });
});

/**
 * Phase 3, brief 3.3: the arc calls read the rule set.
 *
 * The arc writer, the interweaving call and the arc reworker decide the story, and
 * until now read no rule file: their inline text asked for each memory's exposer,
 * read accounts as people, converged every arc on "the murder revelation", described
 * burial as a drug and called the director's notes "GROUND TRUTH". Each journalist
 * call now carries the world, the truth rules and the mode block in its system prompt
 * and its craft files in its user prompt (the placement ruling); the inline text the
 * rule set states or contradicts is gone. The detective keeps today's text (D13).
 */
describe('phase 3 (3.3): the arc calls read the rule set', () => {
  const arcModule = require('../workflow/nodes/arc-specialist-nodes');
  const { reviseArcs } = arcModule;
  const {
    buildCoreArcPrompt, buildCoreArcSections, buildInterweavingPrompt,
    coreArcSystemPrompt, interweavingSystemPrompt, generateCoreArcs
  } = arcModule._testing;
  const { loadRuleSet, loadModeBlock } = require('../rule-set');
  const { reworkFixtureState } = require('./fixtures/rework-state');
  const { instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');
  const { DERIVED_LABELS } = require('../prompt-renderers/derived-labels');

  const clone = (v) => JSON.parse(JSON.stringify(v));
  const count = (haystack, needle) => haystack.split(needle).length - 1;

  /** The phrases this slice takes out of the arc calls, in today's wording (reported to the integrator). */
  const ARC_REMOVED = [
    'name who exposed each memory',
    'Account naming that suggests involvement',
    'Victim/operator relationships',
    'Targeting patterns',
    'murder',
    'memory-altering drug',
    'the memory drug',
    'GROUND TRUTH',
    // The removed line called the director's prose "the AUTHORITATIVE source". Since
    // 3.10 the arc calls print the roster section, whose NPC lines are "as
    // authoritative as the roster's", so the entry names the removed line itself.
    'is the AUTHORITATIVE source',
    'Sarah exposed three memories',
    'Never use "token"',
    'Black Market',
    'maximum payoff',
    'maximum interweaving potential',
    'confident smile',
    'knew all along',
    'completely missed',
    'before Marcus died',
    'Do not just regenerate',
    'She was NOT there',
    'reached her as tips'
  ];
  const leftovers = (render) => {
    const text = instructionText(render).toLowerCase();
    return ARC_REMOVED.filter((phrase) => text.includes(phrase.toLowerCase()));
  };

  /** A state whose tensions are the three stored shapes: one new, two retired. */
  function journalistState(overrides = {}) {
    const base = reworkFixtureState('journalist');
    return {
      ...base,
      // The director's sentences the stored blake-proximity tension carries are the
      // notes' own, as surfaceContradictions gathers them.
      directorNotes: {
        ...base.directorNotes,
        rawProse: `${base.directorNotes.rawProse} Blake pulled Morgan into the corner by the bar. The Valet waved Riley over twice.`
      },
      sessionConfig: {
        ...base.sessionConfig,
        exposures: [{ tokenId: 'ale003', exposer: 'NovaNews (Anonymous)', time: '07:37 PM' }]
      },
      narrativeTensions: {
        tensions: [
          { type: 'named-account', narrativeNote: 'Morgan used their own name for a burial account.' },
          { type: 'transparency-vs-burial', narrativeNote: 'Alex exposed memories yet an account took money.' },
          {
            type: 'blake-proximity',
            observations: ['Blake pulled Morgan into the corner by the bar.', 'The Valet waved Riley over twice.'],
            narrativeNote: 'Director observed multiple characters interacting with Blake'
          }
        ]
      },
      ...overrides
    };
  }

  async function arcRework(state, reworkOverrides) {
    const sdk = jest.fn(async () => ({
      narrativeArcs: clone(state.narrativeArcs), synthesisNotes: 's', interweavingPlan: state._arcAnalysisCache.interweavingPlan
    }));
    await reviseArcs(
      { ...state, narrativeArcs: null, _previousArcs: clone(state.narrativeArcs), ...reworkOverrides },
      { configurable: { sdkClient: sdk, theme: state.theme } }
    );
    return sdk.mock.calls[0][0];
  }
  const SEND_BACK = { _arcFeedback: 'Rethink the money thread from scratch.', humanArcRevisionCount: 1, arcRevisionCount: 0 };
  const AUTOMATED = {
    arcRevisionCount: 1,
    validationResults: {
      phase: 'arcs', passed: false, structuralIssues: ['Riley has no placement'],
      criteriaScores: { coherence: { score: 0.5, type: 'advisory', notes: 'thin', fix: 'tie the threads' } }
    }
  };

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  describe('the rule sections, placed by the placement ruling', () => {
    it('the arc writer: identity, mode block, the world and the truth rules in the system prompt; its craft files in the user prompt', () => {
      const state = journalistState();
      const { core, craft } = loadRuleSet('arc');
      const system = coreArcSystemPrompt(state.sessionConfig, 'journalist');
      expect(count(system, core)).toBe(1);
      expect(system.indexOf(loadModeBlock('remote'))).toBeLessThan(system.indexOf('<world>'));
      expect(system.indexOf('<world>')).toBeLessThan(system.indexOf('<truth-rules>'));
      expect(system).not.toContain('<craft-');

      const user = buildCoreArcPrompt({
        ...state,
        directorGateNotes: [{ gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the succession thread.', at: 't1' }]
      });
      expect(count(user, craft)).toBe(1);
      expect(user).not.toContain('<world>');
      // The craft files come after the data and before <DIRECTOR_GUIDANCE>, which stays last.
      expect(user.indexOf(craft)).toBeGreaterThan(user.indexOf('</RECORD>'));
      expect(user.indexOf(craft)).toBeLessThan(user.indexOf('<DIRECTOR_GUIDANCE>'));
      expect(user.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    });

    it('the interweaving call: the world and the truth rules in the system prompt, its craft files (no questions) in the user prompt', () => {
      const state = journalistState();
      const { core, craft } = loadRuleSet('interweaving');
      const system = interweavingSystemPrompt(state.sessionConfig, 'journalist');
      expect(count(system, core)).toBe(1);
      expect(system.indexOf(loadModeBlock('remote'))).toBeLessThan(system.indexOf('<world>'));
      const user = buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle, state.sessionConfig, 'journalist');
      expect(count(user, craft)).toBe(1);
      expect(user.indexOf(craft)).toBeGreaterThan(user.indexOf('</RECORD>'));
      expect(user).not.toContain('<craft-questions>');
    });

    it("the arc reworker carries the rule set through its writer's builders (M23)", async () => {
      const state = journalistState();
      const { core, craft } = loadRuleSet('arc');
      for (const overrides of [SEND_BACK, AUTOMATED]) {
        const { systemPrompt, prompt } = await arcRework(state, overrides);
        expect(count(systemPrompt, core)).toBe(1);
        expect(count(prompt, craft)).toBe(1);
        expect(prompt.startsWith(buildCoreArcSections(state))).toBe(true);
      }
    });

    it("the detective calls carry no rule file and keep today's text (D13)", () => {
      const state = reworkFixtureState('detective');
      const writer = `${coreArcSystemPrompt(state.sessionConfig, 'detective')}\n${buildCoreArcPrompt(state)}`;
      const interweaving = `${interweavingSystemPrompt(state.sessionConfig, 'detective')}\n${buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle, state.sessionConfig, 'detective')}`;
      for (const render of [writer, interweaving]) {
        expect(render).not.toMatch(/<(world|truth-rules|craft-[a-z]+)>/);
      }
      expect(writer).toContain('A memory-altering drug called "the memory drug"');
      expect(writer).toContain('### Buried Transactions (1 items - Layer 2, INVESTIGATION ACTIONS)');
      expect(interweaving).toContain('All arcs should connect to the central event (murder/accusation)');
    });
  });

  describe("what stays, in C16's terms, stated once", () => {
    // Spec section 8: each rule appears once. C16, in <craft-story> since task 3.8,
    // states the lenses, the order (TH2) and the convergence with their reason; the
    // inline text maps them onto the output fields (analysisNotes, suggestedOrder,
    // convergencePoint) and states none of them again, so an edit to the rule file
    // leaves no stale copy. Task 3.10: each pointer names the file C16 is in now.
    const C16_TERMS = [
      /bears? on the room's verdict/g, /cuts? against/g, /its own material/g,
      /culmination/g, /where the thesis lands/g, /near (its|the) end/g
    ];
    /** The C16 terms the render carries more often than the rule set it was given. */
    const restated = (render, rules) => C16_TERMS
      .filter((term) => (render.match(term) || []).length !== (rules.match(term) || []).length)
      .map(String);
    const { INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_SCHEMA, PLAYER_FOCUS_GUIDED_SCHEMA } = require('../sdk-client/subagents');

    it('the arc writer reads the three lenses from C16 in <craft-story> and writes them into analysisNotes', () => {
      const prompt = buildCoreArcSections(journalistState());
      const { craft } = loadRuleSet('arc');
      expect(craft).toMatch(/<craft-story>\n[\s\S]*## C16\.[\s\S]*<\/craft-story>/);
      expect(count(prompt, craft)).toBe(1);
      expect(restated(prompt, craft)).toEqual([]);
      const section = prompt.slice(prompt.indexOf('## SECTION 5'), prompt.indexOf('## SECTION 6'));
      expect(section).toContain('as C16 (<craft-story>) sets them out');
      ['financial', 'behavioral', 'victimization'].forEach((field) => expect(section).toMatch(new RegExp(`^- ${field}: `, 'm')));
    });

    it('the interweaving call reads the convergence and the order from C16 in <craft-story>, and its task names the fields that hold them', () => {
      const state = journalistState();
      const system = interweavingSystemPrompt(state.sessionConfig, 'journalist');
      const user = buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle, state.sessionConfig, 'journalist');
      const { core, craft } = loadRuleSet('interweaving');
      expect(restated(`${system}\n${user}`, `${core}\n${craft}`)).toEqual([]);
      // Task 3.10: the principles hold a convergence role that points at C16, and no
      // order of their own.
      expect(INTERWEAVING_SYSTEM_PROMPT).not.toMatch(/\bORDER\b/);
      const task = user.slice(user.indexOf('## YOUR TASK'), user.indexOf('## OUTPUT FORMAT'));
      expect(task).toMatch(/^- suggestedOrder: .*C16 \(<craft-story>\)/m);
      expect(task).toMatch(/^- convergencePoint: .*C16 \(<craft-story>\)/m);
      // The interweaving call's own mechanics stay, as the brief keeps them: bridges, callback seeds, the bridge types.
      ['SHARED CHARACTERS ARE BRIDGES', 'CALLBACK SEEDS', 'shared_character', 'causal_chain', 'temporal', 'contradiction']
        .forEach((s) => expect(`${system}\n${user}`).toContain(s));
    });

    it('the schema descriptions refer to C16 in <craft-story> for the order and the convergence, and restate neither', () => {
      for (const schema of [INTERWEAVING_SCHEMA, PLAYER_FOCUS_GUIDED_SCHEMA]) {
        const plan = schema.properties.interweavingPlan.properties;
        for (const field of ['suggestedOrder', 'convergencePoint']) {
          expect(plan[field].description).toMatch(/C16 \(<craft-story>\)/);
          expect(plan[field].description).not.toMatch(/verdict|culmination|thesis|end of the article/);
        }
        expect(JSON.stringify(schema)).not.toMatch(/murder|maximum/i);
      }
    });

    // Task 3.10: craft-arcs, craft-thesis, craft-sections, craft-room and craft-tracing
    // are gone (task 3.8). No prompt text, schema description or comment in the code
    // names one; the tests that pin their retirement name them, as they must.
    it('no code in lib/ or scripts/ names a retired craft file', () => {
      const fs = require('fs');
      const path = require('path');
      const RETIRED = ['craft-thesis', 'craft-sections', 'craft-arcs', 'craft-room', 'craft-tracing'];
      const root = path.join(__dirname, '..', '..');
      const files = [];
      const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== '__tests__' && entry.name !== 'node_modules') walk(full);
        } else if (/\.(js|json|md)$/.test(entry.name)) {
          files.push(full);
        }
      });
      walk(path.join(root, 'lib'));
      walk(path.join(root, 'scripts'));
      expect(files.length).toBeGreaterThan(50);
      const naming = files.flatMap((file) => {
        const text = fs.readFileSync(file, 'utf8');
        return RETIRED.filter((name) => text.includes(name)).map((name) => `${path.relative(root, file)}: ${name}`);
      });
      expect(naming).toEqual([]);
    });

    it('the arc rework carries C16 once too: its output addendum prints the schema descriptions', async () => {
      const state = journalistState();
      const { core, craft } = loadRuleSet('arc');
      for (const overrides of [SEND_BACK, AUTOMATED]) {
        const { systemPrompt, prompt } = await arcRework(state, overrides);
        expect(prompt).toContain('## WHAT THIS REWORK RETURNS');
        expect(restated(instructionText(`${systemPrompt}\n${prompt}`), `${core}\n${craft}`)).toEqual([]);
      }
    });
  });

  describe('the removed lines', () => {
    it('are absent from the instruction text of the arc writer, the interweaving call and the arc rework', async () => {
      const state = journalistState();
      const renders = {
        writer: `${coreArcSystemPrompt(state.sessionConfig, 'journalist')}\n=====\n${buildCoreArcPrompt({ ...state, arcRevisionCount: 1, validationResults: { phase: 'arcs', issues: ['x'] } })}`,
        interweaving: `${interweavingSystemPrompt(state.sessionConfig, 'journalist')}\n=====\n${buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle, state.sessionConfig, 'journalist')}`
      };
      for (const [name, overrides] of [['send-back rework', SEND_BACK], ['automated rework', AUTOMATED]]) {
        const { systemPrompt, prompt } = await arcRework(state, overrides);
        renders[name] = `${systemPrompt}\n=====\n${prompt}`;
      }
      Object.entries(renders).forEach(([name, render]) => {
        expect(`${name}: ${JSON.stringify(findRemovedPhrases(instructionText(render)).map(String))}`).toBe(`${name}: []`);
        expect(`${name}: ${JSON.stringify(leftovers(render))}`).toBe(`${name}: []`);
      });
    });

    it("the arc writer's own revision hook is gone for the journalist: a rework goes through reviseArcs", () => {
      const prompt = buildCoreArcPrompt({ ...journalistState(), arcRevisionCount: 1, validationResults: { phase: 'arcs', issues: ['x'] } });
      expect(prompt).not.toContain('REVISION 1: Address these issues');
    });
  });

  describe("the director's notes, under T1", () => {
    // Task 3.10 (spec R12; rule-text read 2, section D): backstory in the notes is what
    // Nova knows but the record cannot back, T1's third point. "Reading" is retired as
    // the rules' word for Nova's inference: it came back as a tic in print.
    it("the label names the notes T1's record for the room and backstory in them T1's third point, and restates no rule", () => {
      const state = journalistState();
      const prompt = buildCoreArcSections(state);
      const label = prompt.slice(prompt.indexOf("### The Director's Notes"), prompt.indexOf('<DIRECTOR_NOTES>'));
      expect(label).toMatch(/^### The Director's Notes \(the record for the room, under T1\)$/m);
      expect(label).toMatch(/[Bb]ackstory[^.]*what Nova knows but the record cannot back: T1's third point\./);
      expect(label).not.toMatch(/\breading\b/i);
      expect(prompt).not.toMatch(/ground truth/i);
      // T1 says how the room's record and what the record cannot back are written, and
      // T12 and the world say the director's words stay exact: the label states none
      // of it again.
      expect(label).not.toMatch(/what happened and was said|never changed|as written|unproven claim|open question|suspicion|allegation|careful reporter|worded fresh/);
      const system = coreArcSystemPrompt(state.sessionConfig, 'journalist');
      expect(count(`${system}\n${prompt}`, "as the director's notes record it")).toBe(1);
    });

    // Post-merge fix: the arc judge prints the arc writer's own label, so the label has
    // one source. The module exports it at the top level for evaluator-nodes.js.
    it('the label is ARC_NOTES_LABEL, the one text the arc writer prints and the arc judge imports', () => {
      const { ARC_NOTES_LABEL } = arcModule;
      expect(typeof ARC_NOTES_LABEL).toBe('string');
      expect(ARC_NOTES_LABEL).toMatch(/^The Director's Notes \(the record for the room, under T1\)\n[Bb]ackstory[^.]*what Nova knows but the record cannot back: T1's third point\.$/);
      expect(ARC_NOTES_LABEL).not.toContain("Nova's reading");
      const prompt = buildCoreArcSections(journalistState());
      expect(count(prompt, ARC_NOTES_LABEL)).toBe(1);
      expect(prompt).toContain(`### ${ARC_NOTES_LABEL}\n`);
      const { buildEvaluationSystemPrompt, getPhaseCriteria } = require('../workflow/nodes/evaluator-nodes')._testing;
      const judge = buildEvaluationSystemPrompt('arcs', getPhaseCriteria('arcs', 'journalist'), 'journalist', { sessionConfig: journalistState().sessionConfig });
      expect(judge).toContain(`- directorNotes: ${ARC_NOTES_LABEL}\n`);
    });
  });

  /**
   * Task 3.10 (final review rules-writers[2]): the interweaving principles are one text.
   * The interweaving call writes each arc's shared characters, bridges, callback seeds
   * and convergence role by them, and the arc reworker returns the same fields, so it
   * gets the same text, once, beside the fields. At the gate the reworker had only the
   * schema's field descriptions, and six of the nine breaches the judge found in
   * reworked arcs sat in bridges or callback seeds. The principles point at C16 for its
   * craft: the plant and payoff, and where the threads can meet.
   */
  describe('the interweaving principles, one text for the call and the reworker', () => {
    const { INTERWEAVING_PRINCIPLES, INTERWEAVING_SYSTEM_PROMPT, DETECTIVE_INTERWEAVING_SYSTEM_PROMPT } = require('../sdk-client/subagents');
    const C16_TERMS = [
      /bears? on the room's verdict/, /cuts? against/, /its own material/,
      /culmination/, /where the thesis lands/, /near (its|the) end/, /comes? back changed later/
    ];

    it('holds the principles for every interweaving field, and points at C16 for its craft', () => {
      expect(typeof INTERWEAVING_PRINCIPLES).toBe('string');
      expect(INTERWEAVING_PRINCIPLES).toMatch(/^INTERWEAVING PRINCIPLES:\n/);
      ['1. SHARED CHARACTERS ARE BRIDGES', '2. CALLBACK SEEDS', '3. BRIDGE TYPES', '4. CONVERGENCE ROLE']
        .forEach((heading) => expect(INTERWEAVING_PRINCIPLES).toContain(heading));
      expect(INTERWEAVING_PRINCIPLES).toMatch(/A seed is a detail the record holds[^\n]*C16[^\n]*the payoff stays true to it/);
      expect(INTERWEAVING_PRINCIPLES).toContain("A memory's time is the party's clock and the timeline's is the morning's, so the two never line up");
      expect(INTERWEAVING_PRINCIPLES).toMatch(/4\. CONVERGENCE ROLE\n {3}- [^\n]*where the threads can meet \(C16\)/);
      C16_TERMS.forEach((term) => expect(`${term}: ${term.test(INTERWEAVING_PRINCIPLES)}`).toBe(`${term}: false`));
    });

    it('the interweaving call carries it once, in its system prompt, and finds where the threads can meet', () => {
      const state = journalistState();
      const system = interweavingSystemPrompt(state.sessionConfig, 'journalist');
      const user = buildInterweavingPrompt(state.narrativeArcs, state.sessionConfig.roster, state.evidenceBundle, state.sessionConfig, 'journalist');
      expect(count(INTERWEAVING_SYSTEM_PROMPT, INTERWEAVING_PRINCIPLES)).toBe(1);
      expect(count(`${system}\n${user}`, INTERWEAVING_PRINCIPLES)).toBe(1);
      expect(INTERWEAVING_SYSTEM_PROMPT.split('\n')[0]).toMatch(/and find where they can meet\.$/);
      // The task names the fields and leaves their principles to the system prompt.
      const task = user.slice(user.indexOf('## YOUR TASK'), user.indexOf('## OUTPUT FORMAT'));
      expect(task).not.toMatch(/natural bridge points|changed later/);
      expect(task).toContain('3. **callbackSeeds** - Which details in this arc are callback seeds?');
    });

    it('the arc rework carries it once, beside the interweaving fields it returns, on a send back and an automatic pass', async () => {
      const state = journalistState();
      for (const overrides of [SEND_BACK, AUTOMATED]) {
        const { systemPrompt, prompt } = await arcRework(state, overrides);
        expect(count(`${systemPrompt}\n${prompt}`, INTERWEAVING_PRINCIPLES)).toBe(1);
        const addendum = prompt.slice(prompt.indexOf('## WHAT THIS REWORK RETURNS'), prompt.indexOf('## YOUR TASK'));
        expect(addendum).toContain(`The interweaving and the plan follow these principles:\n\n${INTERWEAVING_PRINCIPLES}`);
      }
      // The arc writer returns no interweaving, so it reads none.
      expect(buildCoreArcPrompt(state)).not.toContain('INTERWEAVING PRINCIPLES');
    });

    // The 4b fix batch (3.10 review minor 4): each point once. The rework's WHAT THIS
    // REWORK RETURNS printed the schema's field descriptions and then the principles, so
    // shared characters as bridges and the convergence role were stated twice a few lines
    // apart, and callbackSeeds' "recontextualized later for aha moments" restated C16's
    // plant and payoff. The principles carry the meaning; a field's description says what
    // the field holds.
    it('the arc rework states each point once: the principles carry the meaning, the field lines say what each field holds', async () => {
      const { prompt } = await arcRework(journalistState(), AUTOMATED);
      const addendum = prompt.slice(prompt.indexOf('## WHAT THIS REWORK RETURNS'), prompt.indexOf('## YOUR TASK'));
      const fields = addendum.slice(0, addendum.indexOf('INTERWEAVING PRINCIPLES:'));
      expect(fields).toContain('- "sharedCharacters" (a list): The characters in this arc who also appear in other arcs\n');
      expect(fields).toContain('- "callbackSeeds" (a list): The details in this arc that are callback seeds\n');
      expect(fields).toContain('- "convergenceRole": This arc\'s convergence role\n');
      expect(fields).not.toMatch(/bridges? for transitions|recontextuali[sz]ed later|aha moments|brings to the convergence/);
      expect(count(addendum, 'brings to')).toBe(1);
    });

    it("the detective's schemas keep today's descriptions for the same fields (D13)", () => {
      const { DETECTIVE_INTERWEAVING_SCHEMA, DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA } = require('../sdk-client/subagents');
      for (const schema of [DETECTIVE_INTERWEAVING_SCHEMA, DETECTIVE_PLAYER_FOCUS_GUIDED_SCHEMA]) {
        const fields = (schema.properties.narrativeArcs || schema.properties.arcInterweaving).items.properties.interweaving.properties;
        expect(fields.sharedCharacters.description).toBe('Characters that appear in this AND other arcs - bridges for transitions');
        expect(fields.callbackSeeds.description).toBe('Details in this arc that can be recontextualized later for aha moments');
        expect(fields.convergenceRole.description).toBe('How this arc contributes to the convergence point (murder/accusation)');
      }
    });

    it("the detective keeps its interweaving prompt and its rework's addendum (D13)", async () => {
      expect(DETECTIVE_INTERWEAVING_SYSTEM_PROMPT).not.toContain(INTERWEAVING_PRINCIPLES);
      expect(DETECTIVE_INTERWEAVING_SYSTEM_PROMPT).toContain('Example: "Vic\'s confident smile" planted early');
      const state = reworkFixtureState('detective');
      const { prompt } = await arcRework(state, SEND_BACK);
      expect(prompt).not.toContain('INTERWEAVING PRINCIPLES');
      expect(prompt).not.toContain('follow these principles');
    });
  });

  describe("the record: the morning timeline in place of the writer's own buried list", () => {
    it('carries the whole view once, with the session config, and no Buried Transactions list', () => {
      const prompt = buildCoreArcSections(journalistState());
      expect(prompt.match(/^<RECORD>$/gm)).toHaveLength(1);
      expect(prompt.match(/^<morning-timeline>$/gm)).toHaveLength(1);
      expect(prompt).toContain('- 07:37 AM | exposure | document: ale003 | anonymous\n- 07:50 AM | sale | account: Melanie | amount: $75,000');
      expect(prompt).not.toContain('### Buried Transactions');
      expect(prompt).not.toContain('"shellAccount"');
      expect(count(prompt, 'Melanie')).toBe(1);
    });
  });

  describe("the director's sentences about Blake and the Valet (the narrative tensions)", () => {
    it("print from the stored observations, drop the retired types, and label the sentences as the director's", () => {
      const prompt = buildCoreArcSections(journalistState());
      expect(prompt).toContain(DERIVED_LABELS.narrativeTensions);
      expect(prompt).toContain('- Blake pulled Morgan into the corner by the bar.\n- The Valet waved Riley over twice.');
      expect(prompt).not.toContain('used their own name');
      expect(prompt).not.toContain('Alex exposed memories yet');
      expect(prompt).not.toContain('Director observed multiple characters');
      expect(prompt).not.toContain('[blake-proximity]');
      const heading = prompt.split('\n').find((l) => l.startsWith('#') && l.includes('Blake and the Valet'));
      expect(heading).toBeDefined();
      expect(heading).not.toMatch(/[–—]/);
    });

    it('leave no section when nothing printable is stored', () => {
      const prompt = buildCoreArcSections(journalistState({ narrativeTensions: { tensions: [{ type: 'named-account', narrativeNote: 'x' }] } }));
      expect(prompt).not.toContain(DERIVED_LABELS.narrativeTensions);
    });
  });

  it('the arc analysis logs the whiteboard regions, the field the parse carries since 3.5', async () => {
    const sdk = jest.fn(async (options) => (options.label.startsWith('Interweaving')
      ? { arcInterweaving: [], interweavingPlan: {} }
      : { narrativeArcs: [{ id: 'arc-a' }], synthesisNotes: '' }));
    const state = journalistState({ narrativeArcs: null });
    state.playerFocus = { ...state.playerFocus, whiteboardContext: { regions: [{ label: 'SUSPECTS', entries: ['Alex'] }] } };
    console.log.mockClear();
    await arcModule.analyzeArcsPlayerFocusGuided(state, { configurable: { sdkClient: sdk, theme: 'journalist' } });
    const lines = console.log.mock.calls.map((c) => c.join(' '));
    expect(lines.some((l) => l.includes('whiteboard.regions') && l.includes('SUSPECTS'))).toBe(true);
    expect(lines.some((l) => l.includes('suspectsExplored'))).toBe(false);
  });

  it('generateCoreArcs sends the journalist rule set', async () => {
    const sdk = jest.fn(async () => ({ narrativeArcs: [], synthesisNotes: '' }));
    await generateCoreArcs(journalistState(), { configurable: { sdkClient: sdk } });
    expect(sdk.mock.calls[0][0].systemPrompt).toContain(loadRuleSet('arc').core);
  });
});
