/**
 * "The director's description: none given" is only said when it is true (phase 2
 * final fix wave, item 4).
 *
 * The photoDescriptions channel is null on every thread in flight when brief 2.2
 * merged, and on 092026 until the descriptions are re-entered. The outline and
 * article writers, their reworkers and the outline judge were then told the director
 * gave nothing for every photo. With no map, the line is left out; "none given" is
 * printed only when a map exists and lacks that photo. Phase 4 (brief 4.6): the outline
 * judge went; the article judge's PHOTOS shows the rule.
 */

const { renderPhotoEntry } = require('../prompt-renderers/director-words-renderer');
const { generateOutline, reviseOutline, generateContentBundle } = require('../workflow/nodes/ai-nodes');
const { _testing: { buildEvaluationUserPrompt } } = require('../workflow/nodes/evaluator-nodes');
const { reworkFixtureState, OUTLINE, PREVIOUS_BUNDLE } = require('./fixtures/rework-state');

const DESCRIBED = "The director's description, word for word:";
const NONE_GIVEN = "The director's description: none given";

describe('renderPhotoEntry', () => {
  it('with no description map, prints the filename and names and says nothing of a description', () => {
    expect(renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, null)).toBe('p2.jpg: Alex');
    expect(renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, undefined)).toBe('p2.jpg: Alex');
  });

  it('with a map that lacks the photo, says the director gave none', () => {
    expect(renderPhotoEntry({ filename: 'p2.jpg', names: ['Alex'] }, {}, '  ')).toBe(`p2.jpg: Alex\n  ${NONE_GIVEN}`);
    expect(renderPhotoEntry({ filename: 'p2.jpg', names: [] }, { 'hero.jpg': 'x' }, '  ')).toBe(`p2.jpg: Unknown\n  ${NONE_GIVEN}`);
  });

  it('with the photo in the map, gives the description word for word', () => {
    expect(renderPhotoEntry({ filename: 'P2.JPG', names: ['Alex'] }, { 'p2.jpg': 'Alex points.' }, '  '))
      .toBe(`P2.JPG: Alex\n  ${DESCRIBED} Alex points.`);
  });
});

describe('a thread with no description map (every thread from before the channel)', () => {
  const record = (sdk) => sdk.mock.calls[0][0].prompt;
  const recordingSdk = (value) => jest.fn(async () => JSON.parse(JSON.stringify(value)));
  const cfg = (sdk) => ({ configurable: { sdkClient: sdk, theme: 'journalist' } });

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => jest.restoreAllMocks());

  it('the outline writer and its reworker say nothing of a description', async () => {
    const state = { ...reworkFixtureState('journalist'), photoDescriptions: null };
    const writer = recordingSdk(OUTLINE);
    const { heroImage } = await generateOutline({ ...state, outline: null }, cfg(writer));
    const rework = recordingSdk(OUTLINE);
    await reviseOutline({ ...state, heroImage, outline: null, _previousOutline: OUTLINE, outlineRevisionCount: 1 }, cfg(rework));
    for (const prompt of [record(writer), record(rework)]) {
      expect(prompt).toContain('p2.jpg: Alex');
      expect(prompt).not.toContain("The director's description");
    }
  });

  it('the article writer says nothing of a description', async () => {
    const state = { ...reworkFixtureState('journalist'), photoDescriptions: null, heroImage: 'hero.jpg' };
    const writer = recordingSdk(PREVIOUS_BUNDLE);
    await generateContentBundle({ ...state, contentBundle: null }, cfg(writer));
    expect(record(writer)).toContain('p2.jpg: Alex');
    expect(record(writer)).not.toContain("The director's description");
  });

  it('with a map, a photo the director did not describe still reads "none given"', async () => {
    const state = { ...reworkFixtureState('journalist'), photoDescriptions: { 'hero.jpg': 'The room.' }, heroImage: 'hero.jpg' };
    const prompt = buildEvaluationUserPrompt('article', state, { factCheck: null });
    expect(prompt).toContain(`p2.jpg: Alex\n   ${NONE_GIVEN}`);
  });
});
