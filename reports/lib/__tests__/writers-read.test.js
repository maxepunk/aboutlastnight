/**
 * What the writers are told and read (phase 17, brief B; spec
 * docs/superpowers/specs/2026-10-18-the-writing-design.md, sections 3 and 4; rulings R2 and R3).
 *
 * - Every writer reads its craft files in one order, story, form, material, judgement, cards,
 *   questions, telling, voice (R2), so the two that say how the prose reads sit last, right
 *   before the director's notes. Each rework reads its writer's files in its writer's order,
 *   every way it runs: the arc rework as an automatic pass, a reweave and a send-back, the map
 *   rework as an automatic pass and a send-back, and the article rework. The renders run the
 *   real nodes over the real rule files, with a recording stand-in for the model.
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

/** R2: each writer's craft files, in the one order. */
const R2 = {
  arc: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-questions', 'craft-voice'],
  outline: ['craft-story', 'craft-form', 'craft-material', 'craft-judgement', 'craft-cards', 'craft-telling', 'craft-voice'],
  article: [
    'craft-story', 'craft-form', 'craft-material', 'craft-judgement',
    'craft-cards', 'craft-questions', 'craft-telling', 'craft-voice'
  ]
};

/**
 * Every craft file a prompt carries, by the line that opens it, in order. The tasks name
 * <craft-story>, <craft-form>, <craft-voice> and the others in prose, so a tag is counted only
 * where it stands alone on its line.
 */
const craftTagsOf = (text) => [...text.matchAll(/^<(craft-[a-z]+)>$/gm)].map((match) => match[1]);

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

describe("R2: every writer and every rework reads its craft files in the one order, telling and voice last", () => {
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
  ])("%s: its craft files in R2's order, in the user prompt alone, <craft-voice> once", (name) => {
    const [call, { prompt, systemPrompt }] = renders[name];
    expect(craftTagsOf(prompt)).toEqual(R2[call]);
    expect(craftTagsOf(systemPrompt)).toEqual([]);
    expect(`${name}: ${(prompt.match(/^<craft-voice>$/gm) || []).length}`).toBe(`${name}: 1`);
  });

  it.each([
    'arc writer', 'arc rework, send-back', 'arc rework, reweave', 'arc rework, automatic',
    'map writer', 'map rework, send-back', 'map rework, automatic',
    'article writer', 'article rework'
  ])('%s: the craft ends on the voice, after the telling where the call reads it, before <DIRECTOR_GUIDANCE>', (name) => {
    const [call, { prompt }] = renders[name];
    const opening = (tag) => prompt.search(new RegExp(`^<${tag}>$`, 'm'));
    const voiceEnd = prompt.search(/^<\/craft-voice>$/m);
    const guidance = prompt.search(/^<DIRECTOR_GUIDANCE>$/m);
    expect(guidance).toBeGreaterThan(voiceEnd);
    expect(voiceEnd).toBeGreaterThan(opening('craft-voice'));
    R2[call].filter((tag) => tag !== 'craft-voice').forEach((tag) => {
      expect(`${name}: ${tag} before the voice: ${opening(tag) < opening('craft-voice')}`).toBe(`${name}: ${tag} before the voice: true`);
    });
    if (R2[call].includes('craft-telling')) {
      // Telling and voice are the last two, with nothing between them but the blank line.
      const tellingEnd = prompt.search(/^<\/craft-telling>$/m);
      expect(prompt.slice(tellingEnd, opening('craft-voice'))).toBe('</craft-telling>\n\n');
    }
    // A writer's prompt ends on its standing notes; a rework's carries its revision block between.
    expect(prompt.trimEnd().endsWith('</DIRECTOR_GUIDANCE>')).toBe(true);
  });

  it.each(['article writer', 'article rework'])("%s: the task opens on one cohesive story and ends on the prose, its lines between kept", (name) => {
    const [, { prompt }] = renders[name];
    const opening = "Write the article: one cohesive story that argues the settled angle's thesis, built on the headline and the deck, with the story map above as its plan. The weave is the story the director settled at the meeting, and the map lays it across the article's sections as the director left it at the map's stop. Write it as C16 (`<craft-story>`) sets out the article writer's part:\n- the beats: ";
    const last = "\n- the headline and the deck: the director's own where the director has edited one, otherwise the map's, as written;\n- the prose: every sentence, paragraph and section as C4 (`<craft-telling>`) sets out, in the voice C12 (`<craft-voice>`) sets out, at about the map's expected length.\n";
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
    expect(task).toContain("Lay the settled weave above across the article's sections: the story map the article writer writes the article from. The map's only prose is the copy the article prints as you write it: the deck under the settled angle's headline, which the map carries word for word, and each section's heading, written as C5 (`<craft-form>`) sets out, in the voice C12 (`<craft-voice>`) sets out. Every other line stays in story terms. The director reads it as a board ");
  });
});

describe('R3: the identity line and the map schema say what the read says', () => {
  it("the article writer's identity line names the one story and who it is for", () => {
    expect(THEME_CONFIGS.journalist.identities.article).toBe(
      'You are Nova, writing a NovaNews investigative article in the first person: one story, for the players who were in the room, each of whom saw only part of it.'
    );
  });

  it("the map schema's description: the evidence it can be told from, and its only prose the deck and the headings", () => {
    expect(OUTLINE_SCHEMA.description).toBe(
      "The story map: the settled weave laid across the article's sections. Each beat is a move of the story in a few plain words, with the evidence it can be told from underneath; its only prose is the deck and the section headings the article prints, under the settled angle's headline."
    );
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
