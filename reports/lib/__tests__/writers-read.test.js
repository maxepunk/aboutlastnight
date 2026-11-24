/**
 * What the writers are told and read (phase 17, brief B; spec
 * docs/superpowers/specs/2026-10-18-the-writing-design.md, sections 3 and 4; rulings R2 and R3).
 *
 * - Every writer reads the brief, then its own part (phase 18, R2 and R3; the brief-and-the-
 *   limits spec, section 1), where its craft files sat, right before the director's notes. Each
 *   rework reads its writer's files in its writer's order, every way it runs: the arc rework as
 *   an automatic pass, a reweave and a send-back, the map rework as an automatic pass and a
 *   send-back, and the article rework. The renders run the real nodes over the real rule
 *   files, with a recording stand-in for the model.
 * - The code-built lines say what the director's rule-text read says (R3): the article writer's
 *   identity line, and the map schema's descriptions the map writer reads.
 */

const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');
const {
  generateOutline, reviseOutline, generateContentBundle, reviseContentBundle
} = require('../workflow/nodes/ai-nodes');
const { reviseArcs, _testing: { generateWeave } } = require('../workflow/nodes/arc-specialist-nodes');
const { standingOnMap, diffBundle } = require('../hand-edit-diff');
const { RULE_SET_CALLS } = require('../rule-set');
const { THEME_CONFIGS } = require('../theme-config');
const OUTLINE_SCHEMA = require('../schemas/outline.schema.json');

const clone = (v) => JSON.parse(JSON.stringify(v));
const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });
const recordingSdk = (value) => jest.fn(async () => clone(value));
const sent = (sdk) => sdk.mock.calls[0][0];

/**
 * Phase 18, R2: each writer's own files, the brief then its own part. Run 2b (R24): the article
 * writer reads its own part, then the brief.
 */
const R2 = {
  arc: ['brief', 'job-weave'],
  outline: ['brief', 'job-map'],
  article: ['job-article', 'brief']
};

/**
 * Every writer's file a prompt carries, the brief and the writers' parts, by the line that
 * opens it, in order. A tag is counted only where it stands alone on its line.
 */
const callTagsOf = (text) => [...text.matchAll(/^<(brief|job-[a-z]+)>$/gm)].map((match) => match[1]);

/** Each writer and each way its rework runs, with the call it reads. */
async function renderAll() {
  // A standing note, so every writer's and rework's prompt ends on <DIRECTOR_GUIDANCE>.
  const meetingNotes = [{ gate: 'arc-selection', kind: 'approval', round: 1, text: 'Keep Riley in view.', at: 't1' }];
  const state = { ...reworkFixtureState('journalist'), directorGateNotes: meetingNotes };
  const renders = {};

  const weaveSdk = recordingSdk(state.weave);
  await generateWeave({ ...state, weave: null, arcRevisionCount: 0 }, cfg(weaveSdk));
  renders['arc writer'] = ['arc', sent(weaveSdk)];
  const arcRework = async (overrides) => {
    const sdk = recordingSdk(state.weave);
    await reviseArcs({ ...state, ...overrides }, cfg(sdk));
    return sent(sdk);
  };
  renders['arc rework, send-back'] = ['arc', await arcRework({
    _meetingRound: 'send-back', _arcFeedback: 'Riley is not the buyer; Morgan is.',
    humanArcRevisionCount: 1, arcRevisionCount: 0,
    directorGateNotes: [...meetingNotes, { gate: 'arc-selection', kind: 'rejection', round: 2, text: 'Riley is not the buyer; Morgan is.', at: 't2' }],
    validationResults: { phase: 'arcs', passed: true, structuralIssues: [] }
  })];
  renders['arc rework, reweave'] = ['arc', await arcRework({
    _meetingRound: 'reweave', _arcFeedback: null, humanArcRevisionCount: 1, arcRevisionCount: 0
  })];
  renders['arc rework, automatic'] = ['arc', await arcRework({
    arcRevisionCount: 1, humanArcRevisionCount: 0,
    validationResults: { phase: 'arcs', source: 'weave-checks', passed: false, structuralIssues: ['The thread "The sale" is in the story with no piece of evidence that supports it.'] }
  })];

  const mapSdk = recordingSdk(OUTLINE);
  const { heroImage } = await generateOutline({ ...state, outline: null, directorGateNotes: meetingNotes }, cfg(mapSdk));
  renders['map writer'] = ['outline', sent(mapSdk)];
  const edited = clone(OUTLINE);
  edited.headline = 'The Headline the Director Wrote';
  const mapRework = async (overrides) => {
    const sdk = recordingSdk(edited);
    await reviseOutline({ ...state, heroImage, outline: null, directorGateNotes: meetingNotes, ...overrides }, cfg(sdk));
    return sent(sdk);
  };
  renders['map rework, send-back'] = ['outline', await mapRework({
    _previousOutline: edited, _outlineFeedback: 'Open on the vote.', _outlineHandEdits: standingOnMap(null, OUTLINE, edited),
    humanOutlineRevisionCount: 1, outlineRevisionCount: 0,
    validationResults: { phase: 'outline', passed: true, structuralIssues: [], advisoryWarnings: [] }
  })];
  renders['map rework, automatic'] = ['outline', await mapRework({
    _previousOutline: OUTLINE, outlineRevisionCount: 1, humanOutlineRevisionCount: 1,
    validationResults: { phase: 'outline', source: 'map-checks', passed: false, structuralIssues: ['Players in no beat: Sarah.'] }
  })];

  const articleState = { ...state, heroImage: 'hero.jpg' };
  const articleSdk = recordingSdk(PREVIOUS_BUNDLE);
  await generateContentBundle({ ...articleState, contentBundle: null }, cfg(articleSdk));
  renders['article writer'] = ['article', sent(articleSdk)];
  const editedBundle = clone(PREVIOUS_BUNDLE);
  editedBundle.headline.main = 'Hand-edited headline';
  const articleReworkSdk = recordingSdk(editedBundle);
  await reviseContentBundle({
    ...articleState, contentBundle: null, _previousContentBundle: editedBundle,
    _articleFeedback: 'Put the test before the sale.', _articleHandEdits: diffBundle(PREVIOUS_BUNDLE, editedBundle),
    humanArticleRevisionCount: 1, articleRevisionCount: 0,
    directorGateNotes: [...meetingNotes, { gate: 'article', kind: 'rejection', round: 1, text: 'Put the test before the sale.', at: 't2' }],
    validationResults: { phase: 'article', passed: true, structuralIssues: [], advisoryWarnings: [] }
  }, cfg(articleReworkSdk));
  renders['article rework'] = ['article', sent(articleReworkSdk)];

  return renders;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterAll(() => jest.restoreAllMocks());

describe("R2: every writer and every rework reads the brief, then its own part, last before the director's notes", () => {
  let renders;
  beforeAll(async () => { renders = await renderAll(); });

  it("the rule set's lists are R2's, and the judges read none", () => {
    expect(RULE_SET_CALLS.arc).toEqual(R2.arc);
    expect(RULE_SET_CALLS.outline).toEqual(R2.outline);
    expect(RULE_SET_CALLS.article).toEqual(R2.article);
    expect(RULE_SET_CALLS['judge-arc']).toEqual([]);
    expect(RULE_SET_CALLS['judge-article']).toEqual([]);
  });

  it('renders every writer and every way each rework runs', () => {
    expect(Object.keys(renders)).toEqual([
      'arc writer', 'arc rework, send-back', 'arc rework, reweave', 'arc rework, automatic',
      'map writer', 'map rework, send-back', 'map rework, automatic',
      'article writer', 'article rework'
    ]);
  });

  it.each([
    'arc writer', 'arc rework, send-back', 'arc rework, reweave', 'arc rework, automatic',
    'map writer', 'map rework, send-back', 'map rework, automatic',
    'article writer', 'article rework'
  ])("%s: its files in R2's order, in the user prompt alone, each once", (name) => {
    const [call, { prompt, systemPrompt }] = renders[name];
    expect(callTagsOf(prompt)).toEqual(R2[call]);
    expect(callTagsOf(systemPrompt)).toEqual([]);
    R2[call].forEach((tag) => {
      expect(`${name}: ${tag}: ${(prompt.match(new RegExp(`^</${tag}>$`, 'gm')) || []).length}`).toBe(`${name}: ${tag}: 1`);
    });
  });

  it.each([
    'arc writer', 'arc rework, send-back', 'arc rework, reweave', 'arc rework, automatic',
    'map writer', 'map rework, send-back', 'map rework, automatic',
    'article writer', 'article rework'
  ])("%s: the call's two files in its order, together, then <DIRECTOR_GUIDANCE>", (name) => {
    const [call, { prompt }] = renders[name];
    // The first and the second file the call reads (R2; R24 for the article call).
    const [brief, job] = R2[call];
    const opening = (tag) => prompt.search(new RegExp(`^<${tag}>$`, 'm'));
    const jobEnd = prompt.search(new RegExp(`^</${job}>$`, 'm'));
    const guidance = prompt.search(/^<DIRECTOR_GUIDANCE>$/m);
    expect(opening(brief)).toBeGreaterThan(-1);
    expect(guidance).toBeGreaterThan(jobEnd);
    expect(jobEnd).toBeGreaterThan(opening(job));
    // The two files sit together, with nothing between them but the blank line.
    const briefEnd = prompt.search(new RegExp(`^</${brief}>$`, 'm'));
    expect(prompt.slice(briefEnd, opening(job))).toBe(`</${brief}>\n\n`);
    // A writer's prompt ends on its standing notes; a rework's carries its revision block between.
    expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  // Phase 18 (the read's part 2, "The article writer's task"): the task points at the brief and
  // the writer's own part by their tags, cites no rule by number, and ends on the length.
  it.each(['article writer', 'article rework'])("%s: the task opens on the brief and its own part and ends on the length, its lines between kept", (name) => {
    const [, { prompt }] = renders[name];
    const opening = "Write the article. The weave above is the story the director settled at the meeting, and the story map lays it across the article's sections as the director left it at the map's stop. `<brief>` below says what the article has to be, and `<job-article>` says what is yours to decide. For this article:\n- the beats: ";
    const last = "\n- the headline and the deck: the director's own where the director has edited one, otherwise the map's, as written;\n- the length: about the map's expected length.\n";
    expect(prompt.split(opening)).toHaveLength(2);
    expect(prompt.split(last)).toHaveLength(2);
    expect(prompt.indexOf(last)).toBeGreaterThan(prompt.indexOf(opening));
    expect(prompt).not.toContain('Write the map as C16');
    expect(prompt).not.toContain("- about the map's expected length");
  });

  it.each(['map writer', 'map rework, send-back', 'map rework, automatic'])("%s: the settled angle's headline reaches it above the task that names the deck under it", (name) => {
    const [, { prompt }] = renders[name];
    const weave = prompt.slice(0, prompt.indexOf('</SETTLED_WEAVE>'));
    expect(weave).toMatch(/^HEADLINE: \S/m);
    const task = prompt.slice(prompt.indexOf('</SETTLED_WEAVE>'));
    expect(task).toContain("Lay the settled weave above across the article's sections: the story map the article writer writes the article from. `<job-map>` below says how. The only lines on the map that the article prints as you write them are the deck under the settled angle's headline, which the map carries word for word, and each section's heading. The director reads the map as a board ");
  });
});

describe('R3: the identity line and the map schema say what the read says', () => {
  it("the article writer's identity line names the one story and who it is for", () => {
    expect(THEME_CONFIGS.journalist.identities.article).toBe(
      'You are Nova, writing a NovaNews investigative article in the first person: one story, for the players who were in the room, each of whom saw only part of it.'
    );
  });

  // Phase 18, run 2b (brief J): the description is cut to its first sentence; the rest said the
  // map's only prose was the deck and the headings, where a section's step and a beat's synopsis
  // are now sentences too.
  it("the map schema's description: its first sentence alone", () => {
    expect(OUTLINE_SCHEMA.description).toBe("The story map: the settled weave laid across the article's sections.");
  });

  it("the evidence field's description, in a section's beat and in leftOut's", () => {
    const beatOf = (items) => items.properties.evidence.description;
    const sectionBeat = OUTLINE_SCHEMA.properties.sections.items.properties.beats.items;
    const leftOutBeat = OUTLINE_SCHEMA.properties.leftOut.items;
    [beatOf(sectionBeat), beatOf(leftOutBeat)].forEach((description) => {
      expect(description).toBe('The pieces of the record the article writer can tell the move from');
    });
  });
});
