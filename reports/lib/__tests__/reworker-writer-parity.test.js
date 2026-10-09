/**
 * Each reworker sees what its writer saw (phase 2, brief 2.3).
 *
 * On 092026 the article reworker had no document text, no outline, no roster and
 * few craft rules, and deleted four correct evidence cards. Each reworker is now
 * built from its writer's own builders and inputs: the writer's sections, then the
 * revision block (the revision context, <HAND_EDITS>, the previous version, the
 * task), then <DIRECTOR_GUIDANCE> last.
 *
 * These tests run the real nodes on the same state, writer and reworker, with the
 * real PromptBuilder over the real craft files, and a recording stand-in for the
 * model (getSdkClient returns config.configurable.sdkClient as-is). They compare
 * the section markers of the two prompts, and check the writer's sections are the
 * reworker's opening text, byte for byte.
 */

const { reworkFixtureState, DOCUMENT_TEXT, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const {
  generateOutline, reviseOutline, generateContentBundle, reviseContentBundle,
  _testing: { outlineRevisionRules, articleRevisionRules }
} = require('../workflow/nodes/ai-nodes');
const {
  reviseArcs,
  _testing: { generateWeave, arcRevisionRules: arcRulesFor }
} = require('../workflow/nodes/arc-specialist-nodes');

// Brief 4.13: a rework's rules open with its theme's rework identity; these are the journalist's.
const OUTLINE_REVISION_RULES = outlineRevisionRules('journalist');
const ARTICLE_REVISION_RULES = articleRevisionRules('journalist');
const arcRevisionRules = (round) => arcRulesFor(round, 'journalist');
const { standingOnMap, diffBundle } = require('../hand-edit-diff');
const { PromptBuilder } = require('../prompt-builder');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/**
 * The lines that open a section: an XML tag alone on its line, a <document> tag, a
 * markdown heading, or a line-leading CAPS label ("HERO IMAGE:", "SELECTED ARCS (…):").
 */
function sectionMarkers(text) {
  return text.split('\n').filter((line) =>
    /^<[A-Za-z_][A-Za-z0-9_-]*>$/.test(line) ||
    /^<document [^>]*>$/.test(line) ||
    /^#{1,3} \S/.test(line) ||
    /^[A-Z][A-Z0-9 '&-]{2,}( \([^)]*\))?:/.test(line)
  );
}

/** A model stand-in that records every call and returns `value`. */
function recordingSdk(value) {
  return jest.fn(async () => clone(value));
}

const cfg = (sdk, theme) => ({ configurable: { sdkClient: sdk, theme } });
const call = (sdk) => ({ user: sdk.mock.calls[0][0].prompt, system: sdk.mock.calls[0][0].systemPrompt });

/** The director's send back at a stop: a rejection note that is also the feedback. */
function notesFor(gate, note) {
  return [
    { gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep Riley in view.', at: 't1' },
    { gate, kind: 'rejection', round: 1, text: note, at: 't2' }
  ];
}

/**
 * The writer's sections are the reworker's opening text, and every section marker
 * of the writer is among the reworker's, in the same order, before the revision block.
 */
function expectWriterSectionsFirst(writer, rework, revisionHeading) {
  const writerMarkers = sectionMarkers(writer);
  expect(writerMarkers.length).toBeGreaterThan(10);
  expect(sectionMarkers(rework).slice(0, writerMarkers.length)).toEqual(writerMarkers);
  expect(rework.startsWith(writer)).toBe(true);
  expect(rework.slice(writer.length).replace(/^\n+/, '').startsWith(`---\n\n${revisionHeading}`)).toBe(true);
}

/**
 * One <RECORD>, one <DIRECTOR_GUIDANCE>, and the guidance last. Each section is counted by
 * the line that opens it: the map's task names <DIRECTOR_GUIDANCE> in prose (brief 4.6).
 */
function expectOneRecordAndGuidanceLast(rework) {
  expect(count(rework, '\n<RECORD>\n')).toBe(1);
  expect(rework.match(/^<DIRECTOR_GUIDANCE>$/gm)).toHaveLength(1);
  expect(rework.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

// Phase 4 (brief 4.6): the outline is the story map, and the map writer is the journalist's
// alone (R1: the outline stage's detective branches went).
describe('journalist map stop', () => {
  const theme = 'journalist';
  const EDITED = (() => { const m = clone(OUTLINE); m.headline = 'The Headline the Director Wrote'; return m; })();
  const NOTE = 'Open on the vote, not the sale.';

  /**
   * The writer runs on the thread as it stood when it wrote the map, with the notes the
   * meeting left (brief 4.6c: the map's task points at the meeting's approval note only when
   * the notes hold it, so the writer and its rework read one set of meeting notes). Its own
   * <DIRECTOR_GUIDANCE> tail is not among the sections its rework carries, so it is set aside.
   */
  async function writerAndRework(reworkOverrides) {
    const state = reworkFixtureState(theme);
    const meetingNotes = (reworkOverrides.directorGateNotes || []).filter((note) => note.gate === 'arc-selection');
    const writerSdk = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline({ ...state, outline: null, directorGateNotes: meetingNotes }, cfg(writerSdk, theme));
    const reworkSdk = recordingSdk(EDITED);
    await reviseOutline({ ...state, heroImage, outline: null, ...reworkOverrides }, cfg(reworkSdk, theme));
    const writer = call(writerSdk);
    const guidanceAt = writer.user.lastIndexOf('\n<DIRECTOR_GUIDANCE>\n');
    return { writer: { ...writer, user: guidanceAt === -1 ? writer.user : writer.user.slice(0, guidanceAt) }, rework: call(reworkSdk) };
  }

  const SEND_BACK = {
    _previousOutline: EDITED,
    _outlineFeedback: NOTE,
    _outlineHandEdits: standingOnMap(null, OUTLINE, EDITED),
    humanOutlineRevisionCount: 1,
    outlineRevisionCount: 0,
    directorGateNotes: notesFor('outline', NOTE),
    validationResults: { phase: 'outline', passed: true, structuralIssues: [], advisoryWarnings: [] }
  };

  it('the reworker carries every section of its writer, then the revision block, then <DIRECTOR_GUIDANCE> last', async () => {
    const { writer, rework } = await writerAndRework(SEND_BACK);
    expectWriterSectionsFirst(writer.user, rework.user, '# Map Revision Request\n');
    expectOneRecordAndGuidanceLast(rework.user);
    // The meeting's approval note stands for both, so both tasks point at it (brief 4.6c).
    expect(writer.user).toContain("each change the director's note from the meeting asks for");

    // The settled weave first, as the writer's task; the record: every document in full.
    expect(rework.user.startsWith('<SETTLED_WEAVE>\n')).toBe(true);
    Object.values(DOCUMENT_TEXT).forEach((text) => expect(rework.user.slice(0, writer.user.length)).toContain(text));

    // The revision block, in phase 1's order, after the writer's sections.
    const at = (s) => rework.user.indexOf(s);
    expect(at('HUMAN FEEDBACK (HIGHEST PRIORITY):')).toBeGreaterThan(writer.user.length);
    expect(at('<HAND_EDITS>')).toBeGreaterThan(at('HUMAN FEEDBACK'));
    expect(at('PREVIOUS MAP OUTPUT')).toBeGreaterThan(at('</HAND_EDITS>'));
    expect(at('## YOUR TASK')).toBeGreaterThan(at('END PREVIOUS OUTPUT'));
    expect(at('\n<DIRECTOR_GUIDANCE>\n')).toBeGreaterThan(at('## YOUR TASK'));
    expect(rework.user).toContain('The Headline the Director Wrote');
  });

  it("the reworker's system prompt is its writer's, then the rework rules", async () => {
    const { writer, rework } = await writerAndRework(SEND_BACK);
    expect(rework.system).toBe(`${writer.system}\n\n${OUTLINE_REVISION_RULES}`);
    // Phase 3 (3.2): the journalist's system prompt carries the world and the truth rules.
    expect(writer.system).toContain('<world>');
    expect(writer.system).toContain('<truth-rules>');
  });

  it("the guidance keeps phase 1's note filtering: every note but the one being acted on", async () => {
    const { rework } = await writerAndRework(SEND_BACK);
    const guidance = rework.user.slice(rework.user.indexOf('\n<DIRECTOR_GUIDANCE>\n'));
    expect(guidance).toContain('- [arc-selection, approval 1] Keep Riley in view.');
    expect(guidance).not.toContain(NOTE);
  });

  it("a send back's banner names the director's round; the check's rework names the pass and the checks' lines", async () => {
    const sendBack = (await writerAndRework(SEND_BACK)).rework.user;
    expect(sendBack).toContain("REVISION CONTEXT: MAP (round 2: the director's send back)");
    expect(sendBack).not.toContain('automated pass 0');

    const { writer, rework } = await writerAndRework({
      _previousOutline: OUTLINE, outlineRevisionCount: 1, humanOutlineRevisionCount: 1,
      validationResults: { phase: 'outline', source: 'map-checks', passed: false, structuralIssues: ['Players in no beat: Sarah.'] }
    });
    expect(rework.user).toContain('REVISION CONTEXT: MAP (automated pass 1)');
    expect(rework.user).toContain('MAP CHECK FAILURES:\n  - Players in no beat: Sarah.');
    expectWriterSectionsFirst(writer.user, rework.user, '# Map Revision Request\n');
  });
});

// Phase 4 (brief 4.7b; R1): the article writer is the journalist's alone: the article
// stage's detective branch went with the old stages.
describe('journalist article stop', () => {
  const theme = 'journalist';
  const EDITED = (() => { const b = clone(PREVIOUS_BUNDLE); b.headline.main = 'Hand-edited headline'; return b; })();
  const NOTE = 'Put the test before the sale.';

  async function writerAndRework(reworkOverrides) {
    const state = { ...reworkFixtureState(theme), heroImage: 'hero.jpg' };
    const writerSdk = recordingSdk(PREVIOUS_BUNDLE);
    await generateContentBundle({ ...state, contentBundle: null }, cfg(writerSdk, theme));
    const reworkSdk = recordingSdk(EDITED);
    await reviseContentBundle({ ...state, contentBundle: null, ...reworkOverrides }, cfg(reworkSdk, theme));
    return { writer: call(writerSdk), rework: call(reworkSdk) };
  }

  const SEND_BACK = {
    _previousContentBundle: EDITED,
    _articleFeedback: NOTE,
    _articleHandEdits: diffBundle(PREVIOUS_BUNDLE, EDITED),
    humanArticleRevisionCount: 1,
    articleRevisionCount: 0,
    directorGateNotes: notesFor('article', NOTE),
    validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] }
  };

  it('the reworker carries every section of its writer, then the revision block, then <DIRECTOR_GUIDANCE> last', async () => {
    const { writer, rework } = await writerAndRework(SEND_BACK);
    expectWriterSectionsFirst(writer.user, rework.user, '## REVISION CONTEXT\n');
    expectOneRecordAndGuidanceLast(rework.user);

    // The writer's rules and schema replace the reworker's own smaller copies.
    // Phase 3 (3.2): the journalist's rules are its craft files, once.
    expect(count(rework.user, '<RULES>')).toBe(0);
    expect(count(rework.user, '<craft-voice>')).toBe(1);
    expect(count(rework.user, '<SCHEMA>')).toBe(1);
    expect(rework.user).not.toContain('## OUTPUT SCHEMA');
    // Brief 4.7b: the settled weave first, then the map as the director left it.
    expect(rework.user.startsWith('<SETTLED_WEAVE>\n')).toBe(true);
    expect(count(rework.user, '\n<STORY_MAP>\n')).toBe(1);

    const at = (s) => rework.user.indexOf(s);
    expect(at('HUMAN FEEDBACK (HIGHEST PRIORITY):')).toBeGreaterThan(writer.user.length);
    expect(at('<HAND_EDITS>')).toBeGreaterThan(at('HUMAN FEEDBACK'));
    expect(at('## PREVIOUS ARTICLE OUTPUT (to revise)')).toBeGreaterThan(at('</HAND_EDITS>'));
    expect(at('<DIRECTOR_GUIDANCE>')).toBeGreaterThan(at('## YOUR TASK'));
    expect(rework.user).toContain("REVISION CONTEXT: ARTICLE (round 2: the director's send back)");
  });

  it("holds the full text of every card's document, in the writer's part, before the previous version", async () => {
    // Brief 2.3's done-criterion, in miniature: the cards the reworker is asked to
    // keep or fix can be checked against their documents.
    const { writer, rework } = await writerAndRework(SEND_BACK);
    const cardIds = [
      ...PREVIOUS_BUNDLE.sections.flatMap((s) => s.content.filter((b) => b.type === 'evidence-card').map((b) => b.tokenId)),
      ...PREVIOUS_BUNDLE.evidenceCards.map((c) => c.tokenId)
    ];
    expect(cardIds).toEqual(['ale003', 'p-dna', 'mor001', 'p-rescued']);
    const writerPart = rework.user.slice(0, writer.user.length);
    cardIds.forEach((id) => expect(writerPart).toContain(DOCUMENT_TEXT[id]));
  });

  it("the reworker's system prompt is its writer's (the roster with pronouns, the world and the truth rules), then the rework rules", async () => {
    const { writer, rework } = await writerAndRework(SEND_BACK);
    expect(rework.system).toBe(`${writer.system}\n\n${ARTICLE_REVISION_RULES}`);
    expect(writer.system).toContain('CANONICAL CHARACTER ROSTER');
    expect(writer.system).toContain('Morgan → Morgan Reed');
    expect(writer.system).toContain('<truth-rules>');
  });

  it("the guidance keeps phase 1's note filtering", async () => {
    const { rework } = await writerAndRework(SEND_BACK);
    const guidance = rework.user.slice(rework.user.indexOf('<DIRECTOR_GUIDANCE>'));
    expect(guidance).toContain('- [arc-selection, approval 1] Keep Riley in view.');
    expect(guidance).not.toContain(NOTE);
  });
});

// Phase 4 (brief 4.4): the arc writer writes the weave, and its rework returns the weave
// in the writer's own schema, so the rework adds no fields to the writer's OUTPUT FORMAT.
// The arc stage's detective branch went (R1).
describe('journalist arc stop', () => {
  const theme = 'journalist';
  const NOTE = 'Riley is not the buyer; Morgan is.';

  async function writerAndRework(reworkOverrides) {
    const state = reworkFixtureState(theme);
    const writerSdk = recordingSdk(state.weave);
    await generateWeave({ ...state, weave: null, arcRevisionCount: 0 }, cfg(writerSdk, theme));
    const reworkSdk = recordingSdk(state.weave);
    await reviseArcs({ ...state, ...reworkOverrides }, cfg(reworkSdk, theme));
    return { writer: call(writerSdk), rework: call(reworkSdk) };
  }

  // Brief 4.5 (ruling 1): a send-back is the director's round by its mark.
  const SEND_BACK = {
    _meetingRound: 'send-back',
    _arcFeedback: NOTE,
    humanArcRevisionCount: 1,
    arcRevisionCount: 0,
    directorGateNotes: [
      { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'Drop the succession thread.', at: 't1' },
      { gate: 'arc-selection', kind: 'rejection', round: 2, text: NOTE, at: 't2' }
    ],
    validationResults: { phase: 'arcs', passed: true, structuralIssues: [] }
  };

  it('the reworker carries every section of its writer, then the revision block, then <DIRECTOR_GUIDANCE> last', async () => {
    const { writer, rework } = await writerAndRework(SEND_BACK);
    expectWriterSectionsFirst(writer.user, rework.user, '# Weave Rework\n');
    expectOneRecordAndGuidanceLast(rework.user);

    // What the reworker used to lack (rework-inputs.md Step 2): the whiteboard, the
    // investigation focus, the character context, the rules and the record. Phase 3
    // (3.3): the rule set's craft files come last. Phase 4 (brief 4.4): the weave's
    // sections.
    [
      '### The Whiteboard', '### Primary Investigation Focus', '### Character Context',
      '## SECTION 2: THE RECORD', '## SECTION 3: THE WEAVE', '## SECTION 4: CRAFT GUIDANCE', '<craft-story>'
    ].forEach((heading) => expect(rework.user).toContain(heading));
    Object.values(DOCUMENT_TEXT).forEach((text) => expect(rework.user).toContain(text));

    // The sources a piece may name follow the writer's id rule, so a rescued document is named
    // by its Notion id in both (wave-2 ruling W2; phase 4b, brief 1B: the Sources list).
    expect(rework.user).toContain("### Sources\nA piece of evidence names each of its sources by one of these document ids, or as \"ledger\" for a sale, the bonus or a transfer on the investigation's timeline, \"evidence-log\" for an exposure on it, or \"notes\" for the director's own words: the notes, the input-review corrections, the accusation, the answers at the story meeting and the notes at the stops.\n[\"ale003\",\"mor001\",\"p-dna\",\"p-rescued\"]");
    expect(rework.user).not.toContain('## SESSION CONTEXT');

    const at = (s) => rework.user.indexOf(s);
    expect(at('HUMAN FEEDBACK (HIGHEST PRIORITY):')).toBeGreaterThan(writer.user.length);
    expect(at('PREVIOUS WEAVE OUTPUT')).toBeGreaterThan(at('HUMAN FEEDBACK'));
    expect(at('## YOUR TASK')).toBeGreaterThan(at('END PREVIOUS OUTPUT'));
    expect(rework.user).toContain("REVISION CONTEXT: WEAVE (round 2: the director's send back)");
  });

  it("the reworker's system prompt is its writer's, then the rework rules for its kind", async () => {
    const sendBack = await writerAndRework(SEND_BACK);
    expect(sendBack.rework.system).toBe(`${sendBack.writer.system}\n\n${arcRevisionRules('send-back')}`);
    // Brief 4.5: a reweave, marked, with no note.
    const reweave = await writerAndRework({ _meetingRound: 'reweave', _arcFeedback: null, humanArcRevisionCount: 1, arcRevisionCount: 0 });
    expect(reweave.rework.system).toBe(`${reweave.writer.system}\n\n${arcRevisionRules('reweave')}`);
    expect(reweave.rework.user).toContain("REVISION CONTEXT: WEAVE (round 2: the director's reweave)");
    const automated = await writerAndRework({
      arcRevisionCount: 1, humanArcRevisionCount: 0,
      validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['The thread "The sale" is in the story with no piece of evidence that supports it.'] }
    });
    expect(automated.rework.system).toBe(`${automated.writer.system}\n\n${arcRevisionRules(null)}`);
    expect(automated.rework.user).toContain('REVISION CONTEXT: WEAVE (automated pass 1)');
    expect(automated.rework.user).not.toContain('REVISION 1: Address these issues');
  });

  it("the standing notes keep phase 1's filtering", async () => {
    const { rework } = await writerAndRework(SEND_BACK);
    const guidance = rework.user.slice(rework.user.indexOf('<DIRECTOR_GUIDANCE>'));
    expect(guidance).toContain('- [arc-selection, rejection 1] Drop the succession thread.');
    expect(guidance).not.toContain(NOTE);
  });
});

describe('a later change to a writer reaches its reworker (by construction)', () => {
  afterEach(() => {
    PromptBuilder.prototype.buildOutlineUserSections.mockRestore?.();
    PromptBuilder.prototype.buildArticleUserSections.mockRestore?.();
    PromptBuilder.prototype.buildArticleSystemPrompt.mockRestore?.();
  });

  it('a section added to the article writer is in the article rework, user and system', async () => {
    const userSections = PromptBuilder.prototype.buildArticleUserSections;
    const systemPrompt = PromptBuilder.prototype.buildArticleSystemPrompt;
    jest.spyOn(PromptBuilder.prototype, 'buildArticleUserSections').mockImplementation(async function (...args) {
      return `${await userSections.apply(this, args)}\n<A_NEW_WRITER_SECTION>\n</A_NEW_WRITER_SECTION>`;
    });
    jest.spyOn(PromptBuilder.prototype, 'buildArticleSystemPrompt').mockImplementation(async function () {
      return `${await systemPrompt.apply(this)}\nA NEW SYSTEM RULE`;
    });
    const state = { ...reworkFixtureState('journalist'), heroImage: 'hero.jpg' };
    const writerSdk = recordingSdk(PREVIOUS_BUNDLE);
    await generateContentBundle({ ...state, contentBundle: null }, cfg(writerSdk, 'journalist'));
    const reworkSdk = recordingSdk(PREVIOUS_BUNDLE);
    await reviseContentBundle({ ...state, contentBundle: null, _previousContentBundle: PREVIOUS_BUNDLE, articleRevisionCount: 1 }, cfg(reworkSdk, 'journalist'));
    for (const sdk of [writerSdk, reworkSdk]) {
      expect(call(sdk).user).toContain('<A_NEW_WRITER_SECTION>');
      expect(call(sdk).system).toContain('A NEW SYSTEM RULE');
    }
  });

  it('a section added to the outline writer is in the outline rework', async () => {
    const userSections = PromptBuilder.prototype.buildOutlineUserSections;
    jest.spyOn(PromptBuilder.prototype, 'buildOutlineUserSections').mockImplementation(async function (...args) {
      return `${await userSections.apply(this, args)}\n<A_NEW_WRITER_SECTION>\n</A_NEW_WRITER_SECTION>`;
    });
    const state = reworkFixtureState('journalist');
    const writerSdk = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(writerSdk, 'journalist'));
    const reworkSdk = recordingSdk(OUTLINE);
    await reviseOutline({ ...state, heroImage, outline: null, _previousOutline: OUTLINE, outlineRevisionCount: 1 }, cfg(reworkSdk, 'journalist'));
    expect(call(writerSdk).user).toContain('<A_NEW_WRITER_SECTION>');
    expect(call(reworkSdk).user).toContain('<A_NEW_WRITER_SECTION>');
  });
});

describe("the map's rework recomputes what its writer computed and never stored", () => {
  it('the available photos and the session facts come from state, as the writer built them', async () => {
    const state = reworkFixtureState('journalist');
    const reworkSdk = recordingSdk(OUTLINE);
    // Brief 4.6: the rework offers code's pick for the top photo first, as the writer does.
    await reviseOutline({ ...state, outline: null, _previousOutline: OUTLINE, outlineRevisionCount: 1 }, cfg(reworkSdk, 'journalist'));
    const { user } = call(reworkSdk);
    expect(user).toContain('1. [hero image] hero.jpg');
    expect(user).toContain("p2.jpg: Alex\n   The director's description, word for word: Alex leans over the ledger and points at a line.");
    expect(user).not.toContain('whiteboard.jpg:');
    expect(user).toContain('INVESTIGATION ROSTER (4 players):');
    expect(user).toContain('CHARGE: Accidental overdose');
  });
});
