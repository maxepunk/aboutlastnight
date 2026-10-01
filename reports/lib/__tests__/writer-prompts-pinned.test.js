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
 * - Phase 3, task 3.1 fix batch item 4: the mode block comes in one tag named after
 *   its file (<mode-remote> ... </mode-remote>), as loadRuleSet wraps each file, so
 *   the text after it is not read as part of T8. Two lines added around the block in
 *   each journalist writer's system prompt; the detective is unchanged.
 * - Phase 3 brief 3.5: the record view's <buried-transactions> list becomes the
 *   <morning-timeline> (its intro line, and the fixture's 07:50 PM sale on the evening
 *   clock as 07:50 AM), in the outline and article writers of both themes; and the
 *   whiteboard section is relabelled "The Whiteboard (a model's reading of the photo)"
 *   with its regions, in every writer that prints it (both arc writers, both outline
 *   writers through SESSION_FACTS, the journalist article writer).
 * - Integration of 3.1 and 3.5: the journalist pins compose both changes; each length
 *   is the base plus 3.1's change plus 3.5's (outline 14628 - 292 + 602; article
 *   43537 - 292 + 602; arcs 14301 - 292 + 262). The detective pins are 3.5's.
 * - Phase 3 (3.6), the narrative tensions: their label drops the account-name
 *   matching the code no longer does (T4). Every writer that carries the tensions:
 *   both arc writers (the detective one too, since the arc writer is shared) and
 *   the journalist article writer.
 * - Phase 3 (3.6), the director's notes indexes: <QUOTE_BANK>'s intro drops "prefer
 *   these" and its em-dash, and a quote line drops the enricher's [confidence]; the
 *   renamed <EPILOGUE> block prints an item's director's sentence alone. Every
 *   writer that carries the director's notes: both arc writers (the detective one
 *   too) and the journalist outline and article writers.
 * - Phase 3 (3.6 fix batch, item 4), the narrative tensions' label: a printed tension
 *   is the director's own sentences naming Blake or the Valet, gathered by code, and
 *   the label says they are record.
 * - Phase 3 (3.6 fix batch, item 10), the fixture's epilogue item carries a `detail`
 *   its notes hold word for word, so every writer that carries the director's notes
 *   prints an <EPILOGUE> block.
 * - Integration of 3.6 onto 3.1 and 3.5: each length is the base plus both sides'
 *   changes (outline-journalist 14628 + 310 + 195; article-journalist 43537 + 310 +
 *   221; arcs-journalist 14301 - 30 + 221; arcs-detective 14247 + 262 + 221); the
 *   detective outline and article pins are 3.5's.
 * - Phase 3 (3.2), the content-bundle schema's descriptions are shape only (the
 *   content rules and implementation notes went): the journalist article writer
 *   embeds the schema, so its pin moves. The detective prints a frozen copy of the
 *   schema as it was (lib/schemas/content-bundle.detective-prompt.json), so its pin
 *   does not.
 * - Phase 3 (3.2), the canon lines (theme-config.js, T15, M26): Marcus is the man
 *   whose death the room investigates, Nova has no pronoun, Blake carries D7's line.
 *   The journalist article writer prints the roster block; the detective's NPC lines
 *   are its own and unchanged.
 * - Phase 3 (3.2), the journalist outline and article writers read the rule set: the
 *   world and the truth rules (stubs here) in the system prompt after the mode block,
 *   the craft files (stubs) last in the user prompt; the retired craft files' stubs,
 *   the hard constraints, <TEMPORAL_DISCIPLINE>, <arc-interweaving>, <visual-rules>,
 *   <visual-principles>, <arc-section-flow>, <ARC_FLOW>, <VISUAL_DISTRIBUTION>,
 *   <VISUAL_COMPONENT_TYPES>, <ANTI_PATTERNS>, <VOICE_CHECKPOINT>, the temporal context
 *   key, the outline's JSON shape and the article's second roster (M20) go; the notes
 *   header, FINANCIAL_SUMMARY, SESSION_FACTS's agency rule, the arc packages' excerpt
 *   label, the narrative tensions (only the director's Blake sentences print, so the
 *   fixture's other tension prints nothing) and the generation instruction are
 *   rewritten. The journalist pins only; the detective and arc pins are unchanged.
 */
const PINNED = {
  'outline-journalist': ['f217ef6bf5ca8c32eb626e3d0c3dff56ca5aa2456f6f85a99d26527067bcef5c', 8712],
  'article-journalist': ['b204e2a94219bd5557fa6eb0c9d5d66cf41bbff1a7f4f52b1ea883700716e57d', 27149],
  'arcs-journalist': ['671adab390beee1a4d9dfcdf38f6c4a58565562f609c5f3bec85425e37530ba4', 14492],
  'outline-detective': ['b5404dd77db9e23ba879bfc25242bff96d83264308da5c59066056166b2f8aaf', 8828],
  'article-detective': ['59cfdf31e6c071a5b619492692771177e5e2ed74e29ca1679c244bd03f6cbf03', 29436],
  'arcs-detective': ['41dace98218cf3f360893b995fa56031d926994f6c495a2568b217623df3df15', 14730]
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
