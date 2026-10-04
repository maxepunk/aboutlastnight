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
 * model (generateOutline, generateContentBundle, generateWeave), for the fixture
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
 * - Phase 3 (3.3), the journalist arc writer reads the rule set: its system prompt is
 *   the new identity, the mode block, <world> and <truth-rules> (the stubs), then its
 *   role, its honest-uncertainty lines and its output list, without the game context,
 *   the drug line, the evidence boundaries, the anti-patterns and the timelines;
 *   SECTION 3 is the whole record view with its morning timeline (no Buried
 *   Transactions list); the director's notes are labelled record for the room (T1);
 *   the old SECTION 4 and 4.5 give way to the stages line; the lenses are written in
 *   C16's terms; the six arc craft files (stubs) come last; the fixture's
 *   `public-vs-private` tension is not printed (only a blake-proximity tension's
 *   sentences are); and the writer's revision hook is gone. arcs-journalist only;
 *   arcs-detective is unchanged (the detective keeps today's text).
 * - Phase 3 (3.3 fix round 1), each rule once (spec section 8): the arc writer's
 *   inline text stops restating what its rule files say. The director's notes label
 *   names the notes T1's record for the room and keeps only the mapping T1 does not
 *   state (backstory in the notes is Nova's reading); SECTION 5 and the analysisNotes
 *   placeholders point at <craft-arcs> for the lenses and map them onto the three
 *   fields, without C16's reason or its supports-and-cuts-against wording.
 *   arcs-journalist only (10881 -> 10347).
 * - Integration of 3.3 onto 3.2: arcs-journalist is 3.3’s own render (10347); 3.2 leaves the
 *   arc writer unchanged, and the other five pins are 3.2’s.
 * - Phase 3 (fix 3.2b, finding 7), SESSION_FACTS's agency line: "Every other character
 *   except Blake appears only through the memories and documents", and the head count
 *   in T10's words, "When the article counts the people at the investigation, it
 *   counts these N players." The journalist outline and article writers (8712 -> 8718,
 *   27149 -> 27155); the detective keeps its own lines.
 * - Phase 3 (fix 3.2b, finding 10), the journalist outline writer embeds
 *   outline.schema.json as a <SCHEMA> block (one line saying the outline is JSON in
 *   that shape, then the file printed), after SESSION_FACTS and before the craft
 *   files, as the article writer embeds the content-bundle schema. outline-journalist
 *   only (8718 -> 19876); the detective outline keeps its own JSON shape.
 * - Phase 3 (3.7), the writers' questions for the director (C15): outline.schema.json
 *   and content-bundle.schema.json gain the optional top-level `writerQuestions`, so
 *   the journalist outline and article writers' <SCHEMA> blocks print it (19876 ->
 *   20471, 27155 -> 27750). The journalist arc writer's OUTPUT FORMAT lists the field,
 *   and its three roster lines (the output list in the system prompt, the Session
 *   Roster heading, the ROSTER PCs label) count a player covered by a placement the
 *   record shows or by a question about them (10347 -> 10614). The detective pins do
 *   not move: its arc schemas and roster lines are unchanged, and its <SCHEMA> prints
 *   the frozen copy without the field.
 * - Phase 3 (fix 3.7b, finding 2): the journalist arc writer's OUTPUT FORMAT shows
 *   `writerQuestions` as an empty list, then a line saying it stays empty unless the
 *   record leaves something only the director can settle (C15) and one entry's shape,
 *   its `about` in the schema's wording. arcs-journalist only (10614 -> 10735).
 * - Phase 3 (fix 3.7b, finding 1): each question carries `kind` (player, pronoun or
 *   ledger), and `about` and the field's description are reworded to match. The
 *   journalist outline and article <SCHEMA> blocks print the new item shape (20471 ->
 *   20722, 27750 -> 28001). The journalist arc writer's OUTPUT FORMAT entry lists the
 *   kinds, and its two roster lines (the system prompt's output list, the ROSTER PCs
 *   label) say a question covers a player only when its kind is "player" (10735 ->
 *   10799). The detective pins do not move.
 * - Phase 3 (3.8), the craft regrouped by the writer's job (spec round 7): the craft
 *   stubs each journalist writer reads at the end of its user prompt are the new
 *   files, in spec section 8's order (story, form, material, voice, judgement,
 *   telling, cards, questions). The outline writer's nine stub blocks become seven
 *   (20722 -> 20622), the article writer's ten become eight (28001 -> 27901) and the
 *   arc writer's six become five (10799 -> 10755); nothing else in the renders moves.
 *   The detective pins do not move.
 * - Phase 3 (task 3.11), a stored quote's speaker: <QUOTE_BANK> prints a stored
 *   speaker only when a verified context or correction names them. The fixture's quote
 *   (Riley, "I only kept the books") stores neither, so its line reads "(speaker not
 *   recorded)" for "Riley", 17 characters more, and nothing else moves. Every writer
 *   that carries the director's notes: the journalist outline, article and arc writers
 *   and the detective arc writer, which shares the renderer (20722 -> 20739, 28001 ->
 *   28018, 10799 -> 10816, 14730 -> 14747).
 * - Integration of 3.11 onto 3.8: the journalist pins carry both changes, the new
 *   craft stubs and the quote-bank line (20622 -> 20639, 27901 -> 27918, 10755 ->
 *   10772); arcs-detective is 3.11’s (14747), and the other detective pins do not move.
 * - Phase 3 (task 3.9), the money line. FINANCIAL_SUMMARY's last sentence says the
 *   total is what the buyer paid out this morning, where it said NeurAI's board (T5,
 *   R11): the journalist outline and article writers. The outline writer's <SCHEMA>
 *   describes an account's inference as "What the section infers from the account", no
 *   longer "the section's reading" (spec section 7). outline-journalist 20639 -> 20638,
 *   article-journalist 27918 -> 27913; the detective and arc pins do not move.
 * - Phase 3 (task 3.9), every photo the director kept. The article writer lists them
 *   under PHOTOS, the hero first, each entry once (T13, the integrator's ruling); the
 *   HERO IMAGE line points at the list, the packages' header says they name their photos
 *   by filename, and ARC PHOTOS gives filenames only (article-journalist 27913 ->
 *   28269). The other pins do not move.
 * - Phase 3 (task 3.10), the arc writer's notes label and lenses line: the label's
 *   backstory sentence names T1's third point in place of "Nova's reading under T1",
 *   and SECTION 5 points at C16 in <craft-story> in place of the retired <craft-arcs>
 *   (10772 -> 10816). arcs-journalist only.
 * - Phase 3 (task 3.10), the roster with pronouns (T9): the journalist outline writer
 *   prints the article writer's roster section (_rosterSection, without the character
 *   context) after SESSION_FACTS, and the journalist arc writer prints it under a
 *   "### Names and Pronouns" heading after its character categories (20639 -> 21198,
 *   10816 -> 11398). The article writer and the detective pins do not move.
 * - Integration of 3.10 onto 3.9: outline-journalist carries both, 3.9’s money sentence and
 *   schema description and 3.10’s roster section (20638 -> 21197); article-journalist is
 *   3.9’s (28269) and arcs-journalist 3.10’s (11398). The detective pins do not move.
 * - The 4b fix batch (item 8), one builder for the roster without the character context
 *   (rosterWithPronounsSection): the journalist outline writer's roster section prints
 *   under the "### Names and Pronouns" heading the arc writer and the interweaving call
 *   give it (21197 -> 21220), outline-journalist only. The arc writer's roster lines do
 *   not move. (Item 7: the article writer's PHOTOS entries come from one builder shared
 *   with its judge, renderPhotoListEntry, and do not move a byte.)
 * - The 4b fix batch (item 10): the journalist outline writer's <arc-metadata> line says
 *   what an arc is in C16's words, "one thread of the story, as the arc writer found it",
 *   where it said "the arc writer's reading of one thread" ("reading" is retired, spec
 *   section 7). 21220 -> 21233, outline-journalist only. No detective pin moves.
 * - The final fix (final review rules-writers[0]; R11, T5, T14): SESSION_FACTS's agency
 *   line says Blake "was in the room too, making deals", as world.md words Blake, where it
 *   said "working it for NeurAI", a fact about whom the deals were for, which is Nova's
 *   suspicion. The journalist outline and article writers (21233 -> 21224, 28269 ->
 *   28260); restoring the phrase gives back the previous hashes. The arc and detective
 *   pins do not move: the fixture's one correction quotes no line, so the shared quote
 *   rule (lib/grounding.js groundQuote) prints its quote bank as before.
 * - Phase 4 (brief 4.4), the weave: the arc writer (generateWeave, in place of
 *   generateCoreArcs) writes one weave of about 400 words in one call. Its system prompt
 *   is the weave's identity and role, with the mode block and the rule set's core where
 *   they were, and without the every-player line and the output list; its user prompt
 *   opens on the weave's OUTPUT FORMAT, keeps what the room concluded (the ROSTER PCs
 *   line without the every-player clause, the character categories without the
 *   placements), the record and its morning timeline, the receipts in place of the valid
 *   evidence ids, then the weave's task in place of the stages line and the three lenses
 *   (11398 -> 9831). arcs-journalist only. arcs-detective goes: the arc stage's detective
 *   branch went with R1, so the detective renders no arc writer. The outline and article
 *   pins do not move.
 * - Phase 4 (brief 4.5, the integrator's rulings 10 and 11): the weave's task names which
 *   field holds what and points at C1 and C16 for the rest, keeping the field mappings
 *   ("from your notes" only when the story starts from the director's read, the verdict
 *   flag, the receipt from the Receipts list, the stronger main thread's shape); and the
 *   sentence a verdict naming no culprit adds to the accusation is worded for the weave
 *   ("the thread that tells the verdict holds no one as the accused, and never the
 *   victim", where it said "the accusation arc"). arcs-journalist only (9831 -> 9892).
 * - Phase 4 (brief 4.6; R5), the arc packages go, whole: each render loses its package
 *   section and nothing else, the record being whole in every one. The journalist outline
 *   writer's <arc-evidence> (21224 -> 20492) and the detective's <evidence-context>
 *   (8828 -> 8471); the journalist article writer's ARC EVIDENCE PACKAGES (28260 -> 27631)
 *   and the detective's (29436 -> 28610). arcs-journalist does not move.
 */
const PINNED = {
  'outline-journalist': ['8618f4b21202eb6cd23df199649b30f5e272db817fcb261fb820b74203adf263', 20492],
  'article-journalist': ['e85630a0f011ce58931455d6e19cd1e0fba2b357552cbad1050defda27465fa3', 27631],
  'arcs-journalist': ['0dc2111d5eec80aa9cb56062a02f369ac626c991d7b846f64fe08118ac76734f', 9892],
  'outline-detective': ['0521b490325112f9d3f8db05979b53f936a809b21719557ad28e76323e672017', 8471],
  'article-detective': ['8e9a7637c4658265d021a4c4ee771cbc9bbe1aec3a685668b2f3d9799a24d22c', 28610]
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
