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
 * - Phase 3 brief 3.5: the record view's <buried-transactions> list becomes the
 *   <morning-timeline> (its intro line, and the fixture's 07:50 PM sale on the evening
 *   clock as 07:50 AM), in the outline and article writers of both themes; and the
 *   whiteboard section is relabelled "The Whiteboard (a model's reading of the photo)"
 *   with its regions, in every writer that prints it (both arc writers, both outline
 *   writers through SESSION_FACTS, the journalist article writer).
 */
const PINNED = {
  'outline-journalist': ['8b6e03af8768adf55a44de6f5b6353062f0b38aeb147e6c27f527c16dfa7b9da', 15230],
  'article-journalist': ['1c3f960f998bc630202506491998006b0acff9037f43483a109242e98e172608', 44139],
  'arcs-journalist': ['9d594bf2c6163733bed15d1c202dd32c6464188c95fdc688ba0e12d85977408c', 14563],
  'outline-detective': ['b5404dd77db9e23ba879bfc25242bff96d83264308da5c59066056166b2f8aaf', 8828],
  'article-detective': ['59cfdf31e6c071a5b619492692771177e5e2ed74e29ca1679c244bd03f6cbf03', 29436],
  'arcs-detective': ['9b78874634d5b1db7cf7b119b15e9c77e7ba0e7d409f28d93f591c5e96285f0b', 14509]
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
