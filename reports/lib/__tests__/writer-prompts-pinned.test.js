/**
 * The writers' prompts are pinned byte for byte (phase 2, brief 2.3).
 *
 * 2.3 split each writer's builder into section builders so its reworker could be
 * built from the same functions: buildOutlinePrompt into buildOutlineSystemPrompt +
 * buildOutlineUserSections + its tail, buildArticlePrompt likewise, buildCoreArcPrompt
 * into buildCoreArcSections + its tail, and the nodes' inputs into
 * outlineWriterInputs / articleWriterInputs / selectHeroImage. None of that may
 * change a byte of what a writer is sent.
 *
 * Each hash below is of "system\n=====\nuser" as the writer NODE sends it to the
 * model (generateOutline, generateContentBundle, generateCoreArcs), for the fixture
 * state in fixtures/rework-state.js with every tail input set (arc-stop guidance,
 * standing notes, the previous stage's advisories; the arc writer's revision hook).
 * The craft files are stubs (fixtures/render-writers.js), so the pin covers the
 * builders' assembly, not the files' contents.
 *
 * The hashes were taken from df51bc0, the tree before the split, and the split
 * reproduces them. A deliberate change to a writer updates its hash here, in the
 * same commit, with the reason; a change that was not meant to touch a writer
 * fails here.
 */

const path = require('path');
const crypto = require('crypto');
const { renderWriters } = require('./fixtures/render-writers');

const REPO = path.join(__dirname, '..', '..');

/** sha256 and length of each render at df51bc0. */
const PINNED = {
  'outline-journalist': ['676ca98350dd84dd65dd2eb1454bf840e5d655d541c3d7f57bf00ea39085ed57', 14459],
  'article-journalist': ['8f4decd875b896d5abe1465bdcf71a57bab9e318d8af6f454c03d4e30359e637', 43048],
  'arcs-journalist': ['6d96968ee3cb2bfcddb127b77ffe092885720e0d84ef321e0a04645622aa8dec', 14132],
  'outline-detective': ['20a166c6d64dd82a4d76da9d278a258ecac12b9e785402cece3dca1431cbcef6', 8226],
  'article-detective': ['30dec185c3fecf7b839d81acdc9b980b1edea7720da098917d5e3e7e50ac1d17', 29004],
  'arcs-detective': ['598ab31ff8d12994b9371bacc9201af48aa09425aa4926f41f7913b8a15153ef', 14078]
};

describe('the writers send exactly what they sent before the reworkers were built from them', () => {
  let rendered;
  beforeAll(async () => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    rendered = await renderWriters((p) => require(path.join(REPO, p)));
  });
  afterAll(() => jest.restoreAllMocks());

  it('renders every pinned writer, and nothing unpinned', () => {
    expect(Object.keys(rendered).sort()).toEqual(Object.keys(PINNED).sort());
  });

  it.each(Object.keys(PINNED))('%s', (name) => {
    const text = rendered[name];
    const hash = crypto.createHash('sha256').update(text).digest('hex');
    // Length first: when it differs, the size of the change says where to look.
    expect(`${name} length ${text.length}`).toBe(`${name} length ${PINNED[name][1]}`);
    expect(`${name} sha256 ${hash}`).toBe(`${name} sha256 ${PINNED[name][0]}`);
  });
});
