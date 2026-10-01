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

/**
 * sha256 and length of each render at df51bc0, then each deliberate change since:
 *
 * - Final fix wave item 1: <QUOTE_BANK> opens with the machine-made label
 *   (DERIVED_LABELS.directorNotesIndex). One added line in every writer that carries
 *   the director's notes; the detective outline and article writers carry none.
 * - Final fix wave item 5: the article writer's evidenceCards lines and the schema
 *   description it embeds say a sidebar entry is a headline and a summary, and only
 *   the inline evidence-card block carries content. Both article writers.
 * - Final fix wave item 6: the journalist voiceQuestion's "events Nova observed"
 *   defers to the reporting mode. The journalist article writer only.
 * - Phase 3, task 3.1: the journalist's reporting-mode block is the rule set's mode
 *   file, read here from the stub root (fixtures/rules/mode-remote.md, "STUB
 *   mode-remote"), in place of the one-line remote string. One line changes in each
 *   journalist writer's system prompt; the detective keeps its block.
 */
const PINNED = {
  'outline-journalist': ['bc7386eca7dd39c97c4ec87004a3ba1bcf3c21efc265e546fb0b9541bb7e549c', 14307],
  'article-journalist': ['8511e0ba1704de1af53d3b347aa7d6fa15005e59e8a1fba17f8643f7793b7f78', 43216],
  'arcs-journalist': ['351b4d7a32d00569fda7e570afe0aaf7391f366792f0fac9b6627c5cb4c45e1c', 13980],
  'outline-detective': ['20a166c6d64dd82a4d76da9d278a258ecac12b9e785402cece3dca1431cbcef6', 8226],
  'article-detective': ['ddaf75cf913fac7dd89ae7d2b5939071b97e54d64f8c5d17dcd541c72f310506', 29096],
  'arcs-detective': ['604b12053d9604c7baea83fdc2c6d289274b63e01532497cc3781745d007fe21', 14247]
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
