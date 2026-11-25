/**
 * The closing scan (phase 18, brief G3; plan rulings R12 and R56).
 *
 * Every writer's prompt and every rework's, rendered through its own node with the real rule
 * files and a recording stand-in for the model, in both reporting modes, holds:
 * - no rule number: none of the old craft rules' C1 to C19 anywhere in the render, and none of
 *   the limits' T1 to T15 in the pipeline's own instruction text (only the judges keep the
 *   codes, and the judges are outside this scan);
 * - no old rule tag and no phrase the integrator's removed list names (R12's among them), in
 *   the instruction text;
 * - the `this-session` block once, in the system prompt, and never in the user prompt.
 *
 * The instruction text is the fixture's (fixtures/removed-phrases.js instructionText): the
 * director's words, the record and a model's output are left out, since they may say anything.
 * A judge's finding that a rework carries is the judge's material too: under ISSUES TO ADDRESS
 * or SHOULD CONSIDER, a line that opens with a limit's code or its name is left out the same
 * way, and a code check's line, which code writes, stays in.
 *
 * The renders cover the weave writer and its three reworks (the automatic pass after the weave's
 * checks or its judge, the reweave, the send-back), the map writer and its two (the automatic
 * pass after the map's checks, the send-back), and the article writer and its two (the automatic
 * pass after the judge, the send-back).
 */

const { reworkFixtureState, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const { REMOVED_PHRASES, instructionText, findRemovedPhrases } = require('./fixtures/removed-phrases');
const {
  generateOutline, reviseOutline, generateContentBundle, reviseContentBundle
} = require('../workflow/nodes/ai-nodes');
const { reviseArcs, _testing: { generateWeave } } = require('../workflow/nodes/arc-specialist-nodes');
const { WEAVE_CHECKS_SOURCE } = require('../weave');
const { MAP_CHECKS_SOURCE } = require('../map');
const { standingOnMap, diffBundle } = require('../hand-edit-diff');

const clone = (v) => JSON.parse(JSON.stringify(v));
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** A judge's must-fix line as the judge stores it: two codes it opens with, and one more inside. */
const JUDGE_FINDING = 'T4, T5: The second section names who holds the Melanie account; T5 says the buyer is not known.';
const JUDGE_SUGGESTION = 'T12: The quote at the bar reads "Not here" in the record.';

/** The judge's verdict an automatic pass reads, for a stage. */
const judgeVerdict = (phase) => ({
  phase, passed: false, structuralIssues: [JUDGE_FINDING], advisoryWarnings: [JUDGE_SUGGESTION],
  criteriaScores: {}, revisionGuidance: ''
});

const sent = (sdk) => sdk.mock.calls[0][0];
const recordingSdk = (value) => jest.fn(async () => clone(value));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

/** Every writer and rework, for one reporting mode: name -> { systemPrompt, prompt }. */
async function renderWritersAndReworks(mode) {
  const state = reworkFixtureState('journalist');
  state.sessionConfig = { ...state.sessionConfig, reportingMode: mode };
  state.directorGateNotes = [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep Riley in view.', at: 't1' }];
  const out = {};

  // The weave writer and its reworks.
  const weaveSdk = recordingSdk(state.weave);
  await generateWeave({ ...state, weave: null }, cfg(weaveSdk));
  out['weave writer'] = sent(weaveSdk);

  const weaveReworks = {
    'weave rework, after the checks': {
      arcRevisionCount: 1,
      validationResults: {
        phase: 'arcs', source: WEAVE_CHECKS_SOURCE, passed: false,
        structuralIssues: ['Thread "t2" has no receipt. Give it its strongest receipt: the id of a document in <RECORD>, or "ledger".']
      }
    },
    'weave rework, after the judge': { arcRevisionCount: 1, validationResults: judgeVerdict('arcs') },
    'weave rework, the reweave': { _meetingRound: 'reweave', _arcFeedback: 'Bring the heir closer to the vote.', humanArcRevisionCount: 1, arcRevisionCount: 0 },
    'weave rework, the send-back': { _meetingRound: 'send-back', _arcFeedback: 'Rethink the money thread from scratch.', humanArcRevisionCount: 1, arcRevisionCount: 0 }
  };
  for (const [name, overrides] of Object.entries(weaveReworks)) {
    const sdk = recordingSdk(state.weave);
    await reviseArcs({ ...state, ...overrides }, cfg(sdk));
    out[name] = sent(sdk);
  }

  // The map writer and its reworks.
  const mapSdk = recordingSdk(state.outline);
  const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(mapSdk));
  out['map writer'] = sent(mapSdk);

  const editedMap = clone(state.outline);
  editedMap.headline = 'The Headline the Director Wrote';
  const mapReworks = {
    'map rework, after the checks': {
      outlineRevisionCount: 1,
      validationResults: {
        phase: 'outline', source: MAP_CHECKS_SOURCE, passed: false,
        structuralIssues: ['Beat "b3" names no thread. Name the threads it carries.']
      }
    },
    'map rework, the send-back': {
      _outlineFeedback: 'Open on the vote.', humanOutlineRevisionCount: 1, outlineRevisionCount: 0,
      validationResults: { phase: 'outline', passed: true, structuralIssues: [], advisoryWarnings: [] }
    }
  };
  for (const [name, overrides] of Object.entries(mapReworks)) {
    const sdk = recordingSdk(editedMap);
    await reviseOutline({
      ...state, heroImage, outline: null, _previousOutline: editedMap,
      _outlineHandEdits: standingOnMap(null, state.outline, editedMap), ...overrides
    }, cfg(sdk));
    out[name] = sent(sdk);
  }

  // The article writer and its reworks.
  const articleState = { ...state, heroImage: 'hero.jpg' };
  const articleSdk = recordingSdk(PREVIOUS_BUNDLE);
  await generateContentBundle({ ...articleState, contentBundle: null }, cfg(articleSdk));
  out['article writer'] = sent(articleSdk);

  const editedBundle = clone(PREVIOUS_BUNDLE);
  editedBundle.headline.main = 'Hand-edited headline';
  const articleReworks = {
    'article rework, after the judge': { articleRevisionCount: 1, validationResults: judgeVerdict('article') },
    'article rework, the send-back': {
      _articleFeedback: 'Put the test before the sale.', humanArticleRevisionCount: 1, articleRevisionCount: 0,
      validationResults: judgeVerdict('article')
    }
  };
  for (const [name, overrides] of Object.entries(articleReworks)) {
    const sdk = recordingSdk(editedBundle);
    await reviseContentBundle({
      ...articleState, contentBundle: null, _previousContentBundle: editedBundle,
      _articleHandEdits: diffBundle(PREVIOUS_BUNDLE, editedBundle), ...overrides
    }, cfg(sdk));
    out[name] = sent(sdk);
  }
  return out;
}

/**
 * What the closing scan finds in one render ("system\n=====\nuser"): an old craft rule's number
 * anywhere, a limit's code in the instruction text, and each removed phrase in it.
 */
function closingScan(render) {
  const text = instructionText(render);
  return [
    ...(render.match(/\bC\d{1,2}\b/g) || []),
    ...(text.match(/\bT\d{1,2}\b/g) || []),
    ...findRemovedPhrases(text).map(String)
  ];
}

const renderOf = ({ systemPrompt, prompt }) => `${systemPrompt}\n=====\n${prompt}`;

const NAMES = [
  'weave writer', 'weave rework, after the checks', 'weave rework, after the judge',
  'weave rework, the reweave', 'weave rework, the send-back',
  'map writer', 'map rework, after the checks', 'map rework, the send-back',
  'article writer', 'article rework, after the judge', 'article rework, the send-back'
];

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe.each(['remote', 'on-site'])('the closing scan, %s session', (mode) => {
  let renders;
  beforeAll(async () => {
    renders = await renderWritersAndReworks(mode);
  });

  it('renders every writer and every rework', () => {
    expect(Object.keys(renders).sort()).toEqual([...NAMES].sort());
    NAMES.forEach((name) => {
      expect(typeof renders[name].systemPrompt).toBe('string');
      expect(typeof renders[name].prompt).toBe('string');
    });
  });

  it.each(NAMES)('%s: no rule number, old rule tag or removed phrase', (name) => {
    expect(`${name}: ${JSON.stringify(closingScan(renderOf(renders[name])))}`).toBe(`${name}: []`);
  });

  it.each(NAMES)('%s: the this-session block once, in the system prompt, and not in the user prompt', (name) => {
    expect(`${name}: ${count(renders[name].systemPrompt, '<this-session>')}`).toBe(`${name}: 1`);
    expect(`${name}: ${count(renders[name].prompt, '<this-session>')}`).toBe(`${name}: 0`);
  });

  it("the judge's finding a rework carries is the judge's material, left out of the scan", () => {
    ['weave rework, after the judge', 'article rework, after the judge', 'article rework, the send-back'].forEach((name) => {
      const render = renderOf(renders[name]);
      // The rework reads the finding with the names of the limits it opens with, and the code
      // inside it as the judge wrote it.
      expect(`${name}: ${render.includes('Whose account it is, The money: The second section names')}`).toBe(`${name}: true`);
      expect(`${name}: ${/\bT5\b/.test(render)}`).toBe(`${name}: true`);
      expect(`${name}: ${/\bT5\b/.test(instructionText(render))}`).toBe(`${name}: false`);
    });
  });

  it("a code check's line, which code writes, stays in the scan", () => {
    const text = instructionText(renderOf(renders['map rework, after the checks']));
    expect(text).toContain('Beat "b3" names no thread. Name the threads it carries.');
  });
});

describe('the closing scan fails on a planted line', () => {
  let render;
  beforeAll(async () => {
    render = renderOf((await renderWritersAndReworks('remote'))['article writer']);
  });

  /** The render with `line` put before <DIRECTOR_GUIDANCE>, where the pipeline's own text is. */
  const planted = (line) => render.replace(/^<DIRECTOR_GUIDANCE>$/m, `${line}\n\n<DIRECTOR_GUIDANCE>`);

  // R12's "in story terms" and "the room's verdict" are not on the list yet: the skill still carries
  // them, and the integrator adds them once it does not.
  it("R12's phrases, the retired notes preamble, the old list labels and the old pointer are on the removed list", () => {
    [
      'the reporting-mode block', 'the mode block', 'CRAFT GUIDANCE', 'exposer', '<truth-rules>', '<craft-', 'Standing notes the director gave at earlier stops',
      'ROSTER PCs', 'NON-ROSTER PCs', 'the approval note marked arc-selection'
    ].forEach((phrase) => expect(`${phrase}: ${REMOVED_PHRASES.includes(phrase)}`).toBe(`${phrase}: true`));
  });

  it('a removed phrase planted in an instruction fails the scan', () => {
    expect(closingScan(render)).toEqual([]);
    expect(closingScan(planted('Name the tips as the mode block says.'))).toEqual(['the mode block']);
    expect(closingScan(planted('Name the exposer of each memory.'))).toEqual(['exposer']);
    expect(closingScan(planted('<truth-rules>\nA rule.\n</truth-rules>'))).toEqual(['<truth-rules>']);
  });

  it('a rule number planted in an instruction fails the scan', () => {
    expect(closingScan(planted('Follow C7 for the closing.'))).toEqual(['C7']);
    expect(closingScan(planted('Hold to T6 for who made a memory public.'))).toEqual(['T6']);
  });

  it("the same phrase in the director's words or the record does not", () => {
    const inNotes = render.replace('</DIRECTOR_GUIDANCE>', '- [the story meeting, approved] Say who the exposer was, as the mode block says.\n</DIRECTOR_GUIDANCE>');
    expect(inNotes).not.toBe(render);
    expect(closingScan(inNotes)).toEqual([]);
    const inRecord = render.replace('</RECORD>', "The exposer wrote T6 on the board.\n</RECORD>");
    expect(inRecord).not.toBe(render);
    expect(closingScan(inRecord)).toEqual([]);
  });
});
