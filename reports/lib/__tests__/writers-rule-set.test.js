/**
 * The outline and article writers, and their reworkers, read the rule set (phase 3,
 * task 3.2; spec docs/superpowers/specs/2026-09-30-rule-set.md, sections 4, 5 and 8).
 *
 * These render the four journalist calls through their own nodes (generateOutline,
 * reviseOutline, generateContentBundle, reviseContentBundle), with the real
 * PromptBuilder over the real rule files and a recording stand-in for the model,
 * in both reporting modes, and check what every render carries:
 * - the world and the truth rules once, in the system prompt; the call's craft files
 *   once, in the user prompt, after the data and before <DIRECTOR_GUIDANCE> (the
 *   integrator's placement ruling); the outline writer reads every craft file but
 *   the voice (spec section 8);
 * - none of the removed phrases in the pipeline's own instruction text, a gendered
 *   Nova included (the lint the brief asks for), and no em-dash (R171);
 * - no retired craft file loaded on any journalist path.
 */

const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');
const { loadRuleSet } = require('../rule-set');
const { ThemeLoader } = require('../theme-loader');
const {
  generateOutline, reviseOutline, generateContentBundle, reviseContentBundle
} = require('../workflow/nodes/ai-nodes');
const { diffOutline, diffBundle } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** The eight journalist craft files phase 3 retires. */
const RETIRED = [
  'writing-principles', 'anti-patterns', 'character-voice', 'evidence-boundaries',
  'narrative-structure', 'section-rules', 'editorial-design', 'formatting'
];

/**
 * Lines the rule set now states, or that contradicted it, which no journalist writer
 * or reworker carries any more (brief 3.2, "Removal"). The integrator's removed-phrase
 * fixture holds the spec's list; these are the inline lines this task removed.
 */
const REMOVED_INLINE = [
  'HOW THE BLACK MARKET WORKS',
  'Blake now possesses all buried memories',
  'Black Market',
  'exposed to the Detective',
  'State conclusions confidently',
  'participatory',
  'implicated',
  'who has a stake in this',
  'someone this story happened to',
  'TEMPORAL CONTEXT KEY',
  'temporalContext',
  'where one arc ends and another begins',
  'It has just been announced',
  'POST_INVESTIGATION_NEWS',
  'What happened during the investigation this morning',
  'Humanize BEFORE damning revelation',
  'All arcs must converge at a specific point in THE STORY',
  'Each arc should appear in multiple sections',
  'Every section (except LEDE) must have "arcConnections"',
  'SECTION APPROPRIATENESS',
  'pull quotes',
  'Pull quotes',
  'Return JSON with the following structure',
  'If anything above this point contradicts the schema, the schema wins',
  'anthropics/claude-agent-sdk-typescript#277',
  'Commit 8.26',
  'Phase 1 Fix',
  'NEVER give non-roster characters actions',
  'Include tokenId prefix and timestamp',
  'Celebrating sources who exposed',
  'Systemic critique woven throughout',
  'fix voice issues you identified',
  'the journalist narrator',
  'the valet NPC',
  'Total buried'
];

const cfg = (sdk, theme = 'journalist') => ({ configurable: { sdkClient: sdk, theme } });
const recordingSdk = (value) => jest.fn(async () => clone(value));
const sent = (sdk) => sdk.mock.calls[0][0];

/** The four journalist calls for one reporting mode: system and user prompt each. */
async function renderJournalistCalls(mode) {
  const state = reworkFixtureState('journalist');
  state.sessionConfig = { ...state.sessionConfig, reportingMode: mode };
  state._outlineGuidance = 'Lead with the money.';
  state.directorGateNotes = [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep Riley in view.', at: 't1' }];
  state.validationResults = { phase: 'arcs', passed: true, structuralIssues: [], advisoryWarnings: ['An arc advisory.'] };

  const outlineSdk = recordingSdk(OUTLINE);
  const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(outlineSdk));

  const editedOutline = clone(OUTLINE);
  editedOutline.lede.hook = 'Hand-edited hook.';
  const outlineReworkSdk = recordingSdk(editedOutline);
  await reviseOutline({
    ...state, heroImage, outline: null, _previousOutline: editedOutline,
    _outlineFeedback: 'Open on the vote.', _outlineHandEdits: diffOutline(OUTLINE, editedOutline),
    humanOutlineRevisionCount: 1, outlineRevisionCount: 0,
    validationResults: { phase: 'outline', passed: true, structuralIssues: [], advisoryWarnings: [] }
  }, cfg(outlineReworkSdk));

  const articleState = { ...state, heroImage: 'hero.jpg', validationResults: { phase: 'outline', passed: true, advisoryWarnings: ['An outline advisory.'] } };
  const articleSdk = recordingSdk(PREVIOUS_BUNDLE);
  await generateContentBundle({ ...articleState, contentBundle: null }, cfg(articleSdk));

  const editedBundle = clone(PREVIOUS_BUNDLE);
  editedBundle.headline.main = 'Hand-edited headline';
  const articleReworkSdk = recordingSdk(editedBundle);
  await reviseContentBundle({
    ...articleState, contentBundle: null, _previousContentBundle: editedBundle,
    _articleFeedback: 'Put the test before the sale.', _articleHandEdits: diffBundle(PREVIOUS_BUNDLE, editedBundle),
    humanArticleRevisionCount: 1, articleRevisionCount: 0,
    validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] }
  }, cfg(articleReworkSdk));

  return {
    'outline writer': sent(outlineSdk),
    'outline reworker': sent(outlineReworkSdk),
    'article writer': sent(articleSdk),
    'article reworker': sent(articleReworkSdk)
  };
}

/** Which rule-set call each render reads. */
const CALL_OF = {
  'outline writer': 'outline',
  'outline reworker': 'outline',
  'article writer': 'article',
  'article reworker': 'article'
};

let loadPromptSpy;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  loadPromptSpy = jest.spyOn(ThemeLoader.prototype, 'loadPrompt');
});
afterAll(() => jest.restoreAllMocks());

describe.each(['remote', 'on-site'])('the journalist outline and article calls, %s session', (mode) => {
  let renders;
  beforeAll(async () => {
    loadPromptSpy.mockClear();
    renders = await renderJournalistCalls(mode);
  });

  it.each(Object.keys(CALL_OF))('%s: the world and the truth rules once, in the system prompt', (name) => {
    const { core } = loadRuleSet(CALL_OF[name]);
    expect(count(renders[name].systemPrompt, core)).toBe(1);
    expect(renders[name].prompt).not.toContain('<truth-rules>');
    expect(renders[name].prompt).not.toContain('<world>');
  });

  it.each(Object.keys(CALL_OF))('%s: its craft files once, in the user prompt, after the data and before <DIRECTOR_GUIDANCE>', (name) => {
    const { craft } = loadRuleSet(CALL_OF[name]);
    const user = renders[name].prompt;
    expect(count(user, craft)).toBe(1);
    expect(renders[name].systemPrompt).not.toContain('<craft-');
    expect(user.indexOf(craft)).toBeGreaterThan(user.indexOf('</RECORD>'));
    expect(user.indexOf(craft)).toBeGreaterThan(user.indexOf('</SESSION_FACTS>'));
    expect(user.indexOf(craft)).toBeLessThan(user.indexOf('<DIRECTOR_GUIDANCE>'));
    expect(user.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
    expect(count(user, '\n<RECORD>\n')).toBe(1);
  });

  it('the outline calls read every craft file but the voice; the article calls read the voice too', () => {
    expect(renders['outline writer'].prompt).not.toContain('<craft-voice>');
    expect(renders['outline reworker'].prompt).not.toContain('<craft-voice>');
    expect(renders['article writer'].prompt).toContain('<craft-voice>');
    expect(renders['article reworker'].prompt).toContain('<craft-voice>');
  });

  it("each reworker's prompts open with its writer's", () => {
    // The writer's user sections end where its tail opens: <SHOULD_CONSIDER> when it has
    // one, else <DIRECTOR_GUIDANCE> (phase 4, brief 4.6: the article writer reads no
    // <SHOULD_CONSIDER> since the outline judge left).
    const writerUser = (name) => {
      const { prompt } = renders[name];
      const tails = ['<SHOULD_CONSIDER>', '<DIRECTOR_GUIDANCE>'].map((tag) => prompt.indexOf(tag)).filter((i) => i >= 0);
      return prompt.slice(0, Math.min(...tails));
    };
    expect(renders['outline reworker'].systemPrompt.startsWith(`${renders['outline writer'].systemPrompt}\n\n`)).toBe(true);
    expect(renders['article reworker'].systemPrompt.startsWith(`${renders['article writer'].systemPrompt}\n\n`)).toBe(true);
    expect(renders['outline reworker'].prompt.startsWith(writerUser('outline writer'))).toBe(true);
    expect(renders['article reworker'].prompt.startsWith(writerUser('article writer'))).toBe(true);
  });

  it.each(Object.keys(CALL_OF))('%s: no removed phrase, gendered Nova included, in the instruction text', (name) => {
    const text = instructionText(`${renders[name].systemPrompt}\n${renders[name].prompt}`);
    // The rework rules a reworker adds after its writer's prompt (OUTLINE_REVISION_RULES,
    // articleRevisionRules, buildRevisionContext) are task 3.3's, which removes their
    // fixed "preserve, do not regenerate" lines; the integrator's composed scan holds
    // them once both land. Every other phrase is held here, the gendered Nova included.
    const reworkRules = (entry) => entry instanceof RegExp && /regenerate|PRESERVE/.test(entry.source);
    const found = findRemovedPhrases(text).filter((entry) => !(name.endsWith('reworker') && reworkRules(entry)));
    expect(found).toEqual([]);
    REMOVED_INLINE.forEach((phrase) => {
      expect(`${name}: ${phrase}: ${text.includes(phrase)}`).toBe(`${name}: ${phrase}: false`);
    });
  });

  it.each(Object.keys(CALL_OF))('%s: no em-dash in the pipeline\'s own text', (name) => {
    // The fixture's data carries no em-dash, so any in the render is the pipeline's.
    const text = instructionText(`${renders[name].systemPrompt}\n${renders[name].prompt}`);
    expect(text).not.toMatch(/[—–]/);
  });

  it('no journalist call loads a retired craft file', () => {
    const asked = loadPromptSpy.mock.calls.map(([name]) => name);
    RETIRED.forEach((name) => expect(`${name}: ${asked.includes(name)}`).toBe(`${name}: false`));
  });
});
