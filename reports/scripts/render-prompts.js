#!/usr/bin/env node
/**
 * scripts/render-prompts.js — render the pipeline's prompts from a thread's PERSISTED
 * state, with NO model calls (spec 2026-09-19 §7.3), or compare two renders.
 *
 *   node scripts/render-prompts.js --session 0919269 --db <copy.sqlite> --out <dir> [--repo <path>] [--theme <journalist|detective>]
 *   node scripts/render-prompts.js --compare <dirA> <dirB>
 *   node scripts/render-prompts.js --sections <dirA> <dirB>
 *
 * --repo points at the tree whose lib/ renders (default: this repo). Run once with the
 * `main` worktree and once with the branch, then --compare: the only permitted
 * differences are the <HAND_EDITS> block and the standing-notes paragraph inside
 * <DIRECTOR_GUIDANCE>. Anything else fails (exit 1).
 *
 * Transient inputs are faked deterministically: the "previous" output is the persisted
 * outline/bundle, feedback is a fixed string, revisionCount is 1, a fixed hand-edit
 * (one edited field) and two fixed gate notes are supplied. On a tree without
 * lib/hand-edit-diff.js (main) the hand-edit diff is simply absent.
 *
 * Phase 2 (2.3): the arc writer and the arc reworker are rendered too,
 * as arc-generation.txt and arc-revision.txt, for the plain prompt diff; --compare
 * reads only the four files above.
 *
 * Phase 3 (brief 3.0): every call the phase rewires is rendered:
 *   outline-generation.txt, outline-revision.txt, article-generation.txt,
 *   article-revision.txt, arc-generation.txt, arc-revision.txt  (as above)
 *   judge-arc.txt, judge-article.txt
 *                      the judges, from the thread's state, as createEvaluator
 *                      builds them; the article judge's user prompt carries the fact
 *                      check run on the stored bundle (factCheckContentBundle)
 * The judges render through scripts/lib/render-calls.js, which repeats each node's
 * argument list; __tests__/unit/scripts/render-calls.test.js fails when a node sends
 * anything else, so a change to what a node passes its builders goes there too.
 *
 * Phase 4 (brief 4.4): the arc writer writes the weave (arc-generation.txt), and
 * judge-arc.txt is the story meeting's fact check on it. The interweaving call and its
 * render went. Brief 4.5: eleven files. The arc rework renders as reviseArcs sends it
 * (arcReworkCall), three ways: arc-revision.txt is its automatic pass after the weave
 * checks, arc-reweave.txt the director's reweave with no note, and arc-send-back.txt the
 * director's send-back with the fixed note. When the thread holds no weave, the fixed
 * story meeting of scripts/lib/fixed-weave.js is planted, as the fixed notes are:
 * invented text, the writer's weave as the baseline and the director's version with an
 * edit, an answer, a struck connection and a new main thread, its changes the standing
 * edits; one receipt the record does not hold gives the automatic pass a check failure to
 * fix. A thread whose weave carries no edits gets the fixed edit on its story, as the
 * outline and the article get theirs, so every arc rework render shows <HAND_EDITS>.
 * Every builder is awaited. The run fails (exit 1, naming the file) when a render's
 * system or user prompt is empty, when it contains "[object Promise]", or when no line
 * opens with one of the file's markers in REQUIRED_MARKERS below; a file in that table
 * that is not rendered fails too. A tree that lacks a builder fails (exit 2, naming it).
 *
 * Phase 4 (brief 4.6): the outline is the story map. outline-generation.txt is the map
 * writer, and outline-revision.txt and outline-check-rework.txt its rework as reviseOutline
 * sends it (mapReworkCall): the director's send-back with the fixed note, and the automatic
 * pass after the map checks, with the checks' lines. When the thread holds no map, the
 * fixed map of scripts/lib/fixed-map.js is planted, as the fixed story meeting is:
 * invented text, with a struck beat and a moved photo as the director's standing edits. A
 * thread whose map carries no edits gets the fixed edit on its headline. The outline
 * judge's render went with the outline judge, and the outline's <SHOULD_CONSIDER> with the
 * arc selection.
 *
 * Phase 4 (brief 4.7a): judge-article.txt is the article judge on the truth criteria
 * alone, rendered after the weave and the map are planted, so it reads the settled weave
 * and the map as the director left it, the planted ones on a thread that holds none.
 *
 * --theme overrides the thread's theme for every render, so the detective prompts
 * can be rendered from a journalist thread and diffed against a baseline. The parked
 * detective has no map, so its map renders fail, naming the theme (R1).
 *
 * --sections is a report for the integrator, not a check: for each .txt file present in both
 * directories, the file is split into its top-level sections (an XML-style tag that
 * opens a line, through its matching close; the text between sections is a section
 * of its own; the SYSTEM and USER parts are split apart) and the report prints, per
 * file, which sections differ, which exist in only one directory, and each section's
 * size in both (bytes). An unclosed tag is reported. It always exits 0. The splitter
 * is scripts/lib/prompt-sections.js.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { compareSections, renderProblems } = require('./lib/prompt-sections');
const { JUDGE_PHASES, requireExports, loadCallModules, renderJudge } = require('./lib/render-calls');
const { fixedWeave, fixedBaseline } = require('./lib/fixed-weave');
const { fixedMap, fixedMapBaseline } = require('./lib/fixed-map');

/**
 * The markers each render must carry: for each, a line that opens with it. Each is
 * one that every render of that call carries at bad9781, for both themes, on 092026
 * and 092626, whatever the session's data: every call prints the record view, and
 * the six writer renders print the fixed gate notes inside <DIRECTOR_GUIDANCE>. A
 * render without one is missing its frame, and an absence scan over it would pass
 * for nothing.
 */
const REQUIRED_MARKERS = {
  'outline-generation.txt': ['<SETTLED_WEAVE>', '<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'outline-revision.txt': ['<SETTLED_WEAVE>', '<RECORD>', '<DIRECTOR_GUIDANCE>', '<HAND_EDITS>'],
  'outline-check-rework.txt': ['<SETTLED_WEAVE>', '<RECORD>', '<DIRECTOR_GUIDANCE>', '<HAND_EDITS>'],
  'article-generation.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'article-revision.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'arc-generation.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'arc-revision.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>', '<HAND_EDITS>'],
  'arc-reweave.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>', '<HAND_EDITS>'],
  'arc-send-back.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>', '<HAND_EDITS>'],
  'judge-arc.txt': ['<RECORD>'],
  'judge-article.txt': ['<RECORD>']
};

const THEMES = ['journalist', 'detective'];

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; }
    else out._.push(a);
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));

/** The one database this script must never open, whichever tree renders (M3). */
const PRODUCTION_DB = path.resolve(path.join(__dirname, '..', 'data', 'checkpoints.sqlite'));

const FILES = ['outline-generation.txt', 'outline-revision.txt', 'article-generation.txt', 'article-revision.txt'];
/**
 * Rendered as well, but not compared (phase 2, 2.3): the arc writer and its reworker,
 * since brief 4.5 the reworker's automatic pass, reweave and send-back.
 */
const ARC_FILES = ['arc-generation.txt', 'arc-revision.txt', 'arc-reweave.txt', 'arc-send-back.txt'];
/** Rendered as well, but not compared (phase 4, brief 4.6): the map's automatic rework. */
const MAP_FILES = ['outline-check-rework.txt'];
/**
 * Rendered as well, but not compared (phase 3, 3.0): the judges, by phase. Phase 4
 * (brief 4.6): judge-outline.txt went with the outline judge.
 */
const JUDGE_FILES = { arcs: 'judge-arc.txt', article: 'judge-article.txt' };
const FIXED_FEEDBACK = 'RENDER-DIFF FIXED FEEDBACK: tighten the second section.';
/** The round a fixed send back opens, for the rework banner (2.3; an older tree ignores it). */
const FIXED_ROUND = 2;
const FIXED_NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE A', at: '2026-09-19T00:00:00.000Z' },
  { gate: 'outline', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE B', at: '2026-09-19T00:00:01.000Z' }
];

if (args.compare) {
  // `--compare <dirA> <dirB>`: parseArgs swallows dirA as the flag's value, so dirB is
  // the only positional. `<dirA> <dirB> --compare` puts both in `_`. Accept either.
  const [dirA, dirB] = typeof args.compare === 'string' ? [args.compare, args._[0]] : [args._[0], args._[1]];
  if (!dirA || !dirB) { console.error('usage: render-prompts.js --compare <dirA> <dirB>'); process.exit(2); }
  compare(dirA, dirB);
} else if (args.sections) {
  // Same argument shapes as --compare.
  const [dirA, dirB] = typeof args.sections === 'string' ? [args.sections, args._[0]] : [args._[0], args._[1]];
  if (!dirA || !dirB || ![dirA, dirB].every((d) => fs.existsSync(d) && fs.statSync(d).isDirectory())) {
    console.error('usage: render-prompts.js --sections <dirA> <dirB> (two existing directories)');
    process.exit(2);
  }
  sections(dirA, dirB);
} else {
  if (args.theme !== undefined && !THEMES.includes(args.theme)) {
    console.error(`usage: --theme takes one of ${THEMES.join(', ')}`);
    process.exit(2);
  }
  render().catch((e) => { console.error(e); process.exit(2); });
}

/**
 * The production database, from any checkout. Run from a worktree, PRODUCTION_DB is
 * the worktree's own data/ (which holds none), not the director's in the main
 * checkout, so any checkpoints.sqlite directly in a data folder is refused (brief 3.0's
 * invariant, from the worktrees every phase 3 slice renders in).
 */
function isProductionDb(dbPath) {
  const resolved = path.resolve(dbPath);
  return resolved === PRODUCTION_DB
    || (path.basename(resolved).toLowerCase() === 'checkpoints.sqlite' && path.basename(path.dirname(resolved)).toLowerCase() === 'data');
}

async function loadState(dbPath, threadId) {
  if (isProductionDb(dbPath)) {
    console.error('refusing to open the production database ' + path.resolve(dbPath) + ' - render against a COPY (spec 2026-09-19 §7.3)');
    process.exit(2);
  }
  const Database = require('better-sqlite3');
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  const row = db.prepare(`SELECT type, checkpoint FROM checkpoints WHERE thread_id=? AND checkpoint_ns='' ORDER BY checkpoint_id DESC LIMIT 1`).get(threadId);
  db.close();
  if (!row) throw new Error(`no checkpoint for thread ${threadId} in ${dbPath}`);
  // Every row this repo writes is type 'json'. A JsonPlus row would need a serializer
  // the installed package does not export, so say so instead of failing obscurely (M6).
  if (row.type !== 'json') {
    throw new Error(`unsupported checkpoint serializer type "${row.type}" - this script reads only 'json' rows`);
  }
  const cp = JSON.parse(Buffer.isBuffer(row.checkpoint) ? row.checkpoint.toString('utf8') : String(row.checkpoint));
  return cp.channel_values || {};
}

async function render() {
  const repo = path.resolve(args.repo || path.join(__dirname, '..'));
  const outDir = path.resolve(args.out);
  const sessionId = String(args.session);
  const dbPath = path.resolve(args.db);
  fs.mkdirSync(outDir, { recursive: true });

  const req = (p) => require(path.join(repo, p));
  const { createPromptBuilder } = req('lib/prompt-builder.js');
  const { buildRevisionContext } = req('lib/workflow/nodes/node-helpers.js');
  const { _testing: aiTesting } = req('lib/workflow/nodes/ai-nodes.js');
  const { buildArticleRevisionPrompt, getArticleRevisionSystemPrompt, buildArticleRevisionSystemPrompt,
    buildSessionFacts, articleWriterInputs } = aiTesting;
  // Phase 4 (brief 4.6): the map writer's inputs and its rework call, as the nodes build them.
  requireExports('ai-nodes.js _testing', aiTesting, ['outlineWriterInputs', 'mapReworkCall']);
  const mapNodes = req('lib/workflow/nodes/map-nodes.js');
  requireExports('map-nodes.js _testing', mapNodes._testing, ['checkMap']);
  const arcModule = req('lib/workflow/nodes/arc-specialist-nodes.js');
  const { _testing: arcNodes } = arcModule;
  requireExports('arc-specialist-nodes.js _testing', arcNodes, ['weaveSystemPrompt', 'buildWeavePrompt', 'arcReworkCall']);
  requireExports('arc-specialist-nodes.js', arcModule, ['validateArcStructure']);
  const weaveModule = req('lib/weave.js');
  requireExports('weave.js', weaveModule, ['isWeave', 'weaveForPrompt']);
  // Brief 3.0: the judges render through scripts/lib/render-calls.js, which a test holds
  // to what their nodes send.
  const calls = loadCallModules(req);
  let diffMod = null;
  // Only a MISSING module is expected (main has no hand-edit module). Anything else -
  // a syntax error, a throwing dependency - would make the guard pass vacuously (M4).
  try { diffMod = req('lib/hand-edit-diff.js'); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

  const state = await loadState(dbPath, sessionId);
  // --theme renders every call for that theme, whatever the thread ran as: every
  // builder below reads the theme from state.theme or from this one value.
  if (args.theme) state.theme = args.theme;
  // Phase 4 (briefs 4.4 and 4.5): a thread from before the weave holds none, so the fixed
  // story meeting is planted, as the fixed notes are, for the arc reworks and the fact
  // check to read: the writer's weave as the baseline, the director's version, and their
  // changes as the standing edits. A thread whose weave carries no edits of the director's
  // gets the fixed edit on its story.
  requireExports('hand-edit-diff.js', diffMod, ['standingAtMeeting', 'carriedEdits', 'isMap', 'standingOnMap']);
  if (!weaveModule.isWeave(state.weave)) {
    state.weave = fixedWeave();
    state._weaveBaseline = fixedBaseline();
    state._weaveHandEdits = null;
    console.log('the thread holds no weave: planted the fixed story meeting (scripts/lib/fixed-weave.js)');
  }
  if (diffMod.carriedEdits(state._weaveHandEdits, weaveModule.weaveForPrompt(state.weave)).length === 0) {
    const baseline = weaveModule.isWeave(state._weaveBaseline) ? state._weaveBaseline : weaveModule.weaveForPrompt(state.weave);
    if (JSON.stringify(baseline) === JSON.stringify(weaveModule.weaveForPrompt(state.weave))) {
      state.weave = { ...state.weave, story: `${state.weave.story || ''} [RENDER-DIFF EDIT]` };
    }
    state._weaveHandEdits = diffMod.standingAtMeeting(null, baseline, weaveModule.weaveForPrompt(state.weave));
  }
  // Brief 4.6: a thread from before the map holds none, so the fixed map is planted, with the
  // director's struck beat and moved photo as the standing edits. A thread whose map carries
  // no edits of the director's gets the fixed edit on its headline.
  if (!diffMod.isMap(state.outline)) {
    state.outline = fixedMap();
    state._mapBaseline = fixedMapBaseline();
    state._outlineHandEdits = diffMod.standingOnMap(null, state._mapBaseline, state.outline);
    console.log('the thread holds no map: planted the fixed map (scripts/lib/fixed-map.js)');
  }
  if (diffMod.carriedEdits(state._outlineHandEdits, state.outline).length === 0) {
    const baseline = diffMod.isMap(state._mapBaseline) ? state._mapBaseline : JSON.parse(JSON.stringify(state.outline));
    if (JSON.stringify(baseline) === JSON.stringify(state.outline)) {
      state.outline = { ...state.outline, headline: `${state.outline.headline || ''} [RENDER-DIFF EDIT]` };
    }
    state._outlineHandEdits = diffMod.standingOnMap(null, baseline, state.outline);
  }
  const theme = state.theme || 'journalist';
  const promptBuilder = createPromptBuilder({
    theme, sessionConfig: state.sessionConfig || {},
    canonicalCharacters: state.canonicalCharacters || null,
    characterData: (state.characterData && state.characterData.characters) || null
  });

  // Mirror ai-nodes.js generateOutline / generateContentBundle (as data/review-2026-09-18/render-p1.js did).
  // Brief 2.2: a tree that exports the writers' own builders (buildSessionFacts,
  // buildAvailablePhotos) renders through them, so this script cannot drift from the
  // nodes; the inline copies below are for a tree from before they existed (main).
  const roster = (state.sessionConfig && state.sessionConfig.roster) || [];
  const canonical = state.canonicalCharacters || {};
  const sessionFacts = buildSessionFacts ? await buildSessionFacts(state) : (roster.length > 0 ? {
    roster: roster.map((p) => { const n = p.name || p; return canonical[n] || n; }),
    accusation: (state.sessionConfig && state.sessionConfig.accusation && state.sessionConfig.accusation.accused || []).join(' and ') || 'Unknown',
    playerCount: roster.length
  } : null);
  const heroImage = state.heroImage || null;
  // Brief 2.2: the director's own words the writers now read (ignored by an older tree).
  const directorWords = {
    directorCorrections: state.inputReviewCorrections || [],
    photoDescriptions: state.photoDescriptions || null
  };
  const guidance = state._outlineGuidance || null;

  // Every render is written, then checked (brief 3.0); the run fails after all are written.
  const written = [];
  const problems = [];
  const write = (name, systemPrompt, userPrompt) => {
    fs.writeFileSync(path.join(outDir, name), `===== SYSTEM =====\n${systemPrompt}\n\n===== USER =====\n${userPrompt}\n`);
    written.push(name);
    problems.push(...renderProblems(name, systemPrompt, userPrompt, REQUIRED_MARKERS[name]));
  };

  // 1. the map writer, from its own inputs (outlineWriterInputs), with the fixed notes
  const mapState = { ...state, directorGateNotes: FIXED_NOTES };
  const og = await promptBuilder.buildOutlinePrompt(...await aiTesting.outlineWriterInputs(mapState));
  write(FILES[0], og.systemPrompt, og.userPrompt);

  // 2. the map's rework as reviseOutline sends it (mapReworkCall), from the map in hand with
  // the director's standing edits: the director's send-back with the fixed note, round
  // FIXED_ROUND; then the automatic pass after the map checks, with the checks' lines, as
  // the check node writes them on the map.
  const rework = { ...mapState, _previousOutline: state.outline, outline: null, humanOutlineRevisionCount: FIXED_ROUND - 1 };
  const sendBack = await aiTesting.mapReworkCall({ ...rework, _outlineFeedback: FIXED_FEEDBACK, outlineRevisionCount: 0 }, promptBuilder, theme);
  write(FILES[1], sendBack.systemPrompt, sendBack.prompt);
  const { validationResults: mapChecks } = mapNodes._testing.checkMap({ ...state, _mapCheck: null, outlineApproved: false, currentPhase: null });
  const checkPass = await aiTesting.mapReworkCall({ ...rework, _outlineFeedback: null, outlineRevisionCount: 1, validationResults: mapChecks }, promptBuilder, theme);
  write(MAP_FILES[0], checkPass.systemPrompt, checkPass.prompt);

  // 3. article generation
  // Phase 3 (3.9): the article writer's photos, as its node builds them
  // (articleWriterInputs: the hero, then every photo the director kept). An older tree's
  // inputs carry none, and its builder renders as it did. The hero is the node's too:
  // a stored hero the director excluded is none (3.9 fix round 1).
  const articleInputs = articleWriterInputs ? await articleWriterInputs(state) : null;
  const articlePhotos = articleInputs ? (articleInputs[articleInputs.length - 1] || {}).photos : undefined;
  const articleHero = articleInputs ? (articleInputs[1] || null) : heroImage;
  const ag = await promptBuilder.buildArticlePrompt(state.outline || {}, articleHero, state.shellAccounts || [],
    sessionFacts, state.directorNotes || null, state.narrativeTensions || null,
    { directorGuidance: guidance, gateNotes: FIXED_NOTES,
      evidenceBundle: state.evidenceBundle || null, ...directorWords, ...(articlePhotos && { photos: articlePhotos }) });
  write(FILES[2], ag.systemPrompt, ag.userPrompt);

  // 4. article revision (fixed hand edit: headline.main)
  const bundle = state.contentBundle || {};
  const editedBundle = JSON.parse(JSON.stringify(bundle));
  if (editedBundle.headline) editedBundle.headline.main = String(editedBundle.headline.main || '') + ' [RENDER-DIFF EDIT]';
  const bundleDiff = diffMod ? await diffMod.diffBundle(bundle, editedBundle) : null;
  const arc = await buildRevisionContext({ phase: 'article', revisionCount: 1, round: FIXED_ROUND, validationResults: state.validationResults || null,
    previousOutput: editedBundle, humanFeedback: FIXED_FEEDBACK, handEdits: bundleDiff, theme });
  const arPrompt = await buildArticleRevisionPrompt({ ...state, _outlineGuidance: guidance }, arc.contextSection, arc.previousOutputSection, promptBuilder, FIXED_NOTES, theme);
  const arSystem = buildArticleRevisionSystemPrompt
    ? await buildArticleRevisionSystemPrompt(promptBuilder, theme)
    : await getArticleRevisionSystemPrompt(theme, state.sessionConfig || {});
  write(FILES[3], arSystem, arPrompt);

  // 5. the arc writer (the weave), then 6-8. the arc rework as reviseArcs sends it
  // (arcReworkCall; briefs 4.4 and 4.5): its automatic pass after the weave checks, the
  // director's reweave with no note, and the director's send-back with the fixed note,
  // each round's banner reading round FIXED_ROUND. Rendered for the plain prompt diff
  // only; --compare reads FILES. The fixed notes stand in for the director's, and the
  // weave the thread holds (or the fixed one planted above) is the version each rework
  // starts from, with the director's standing edits; the checks run on it as the check
  // node runs them, with the meeting still open.
  const arcState = { ...state, directorGateNotes: FIXED_NOTES };
  write(ARC_FILES[0], await arcNodes.weaveSystemPrompt(state.sessionConfig || {}, theme), await arcNodes.buildWeavePrompt(arcState));
  const { validationResults: weaveChecks } = await arcModule.validateArcStructure({ ...state, meetingApproved: false }, {});
  const reworks = [
    [ARC_FILES[1], { _meetingRound: null, _arcFeedback: null, arcRevisionCount: 1, validationResults: weaveChecks }],
    [ARC_FILES[2], { _meetingRound: 'reweave', _arcFeedback: null, arcRevisionCount: 0 }],
    [ARC_FILES[3], { _meetingRound: 'send-back', _arcFeedback: FIXED_FEEDBACK, arcRevisionCount: 0 }]
  ];
  for (const [file, round] of reworks) {
    const call = await arcNodes.arcReworkCall({ ...arcState, humanArcRevisionCount: FIXED_ROUND - 1, ...round });
    write(file, call.systemPrompt, call.prompt);
  }

  // 7-8. the judges, from the thread's state; the arcs judge is the story meeting's fact
  // check on the weave, and the article judge's fact check is run on the stored bundle.
  // Brief 4.7a: the article judge reads the settled weave and the map, planted above when
  // the thread holds none.
  for (const phase of JUDGE_PHASES) {
    const judge = await renderJudge(calls, state, phase);
    write(JUDGE_FILES[phase], judge.systemPrompt, judge.userPrompt);
  }

  for (const f of written) console.log(`${f}: ${fs.statSync(path.join(outDir, f)).size.toLocaleString()} bytes`);

  // Every file in the marker table must have been rendered, so the table and the
  // renders cannot drift apart unnoticed.
  for (const f of Object.keys(REQUIRED_MARKERS)) {
    if (!written.includes(f)) problems.push(`${f}: was not rendered`);
  }
  if (problems.length > 0) {
    problems.forEach((p) => console.error(`FAIL  ${p}`));
    process.exit(1);
  }
}

/**
 * Strip the three permitted additions from a rendered prompt. Nothing else: a
 * byte-identity guard that normalises is not one, and the blank-run collapse this
 * used to end with could absorb a real difference (M5). Each removal consumes its
 * own adjacent newlines, so equality stays exact without normalising.
 */
function stripPermitted(text) {
  let t = text.replace(/<HAND_EDITS>[\s\S]*?<\/HAND_EDITS>\n*/g, '');
  // Anchored on the first two words only: brief 1.1 reworded the preamble.
  t = t.replace(/\n*Standing notes[\s\S]*?(?=\n<\/DIRECTOR_GUIDANCE>)/g, '');
  t = t.replace(/\n*<DIRECTOR_GUIDANCE>\n<\/DIRECTOR_GUIDANCE>/g, '');
  return t.trim();
}

function compare(dirA, dirB) {
  let failed = false;
  for (const f of FILES) {
    const a = stripPermitted(fs.readFileSync(path.join(dirA, f), 'utf8'));
    const b = stripPermitted(fs.readFileSync(path.join(dirB, f), 'utf8'));
    if (a === b) { console.log(`OK    ${f}`); continue; }
    failed = true;
    const la = a.split('\n'), lb = b.split('\n');
    let i = 0; while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
    console.log(`DIFF  ${f} — first difference at line ${i + 1}:\n  A: ${JSON.stringify(la[i] || '')}\n  B: ${JSON.stringify(lb[i] || '')}`);
  }
  process.exit(failed ? 1 : 0);
}

/**
 * `--sections <dirA> <dirB>`: the section report (brief 3.0). For each .txt file in
 * both directories, every top-level section with its status and its size in A and B.
 * The pass and fail rules are the integrator's, so this always exits 0.
 */
function sections(dirA, dirB) {
  const txt = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.txt')).sort();
  const inA = txt(dirA);
  const inB = txt(dirB);
  const both = inA.filter((f) => inB.includes(f));
  const LABEL = { same: 'same', differs: 'DIFFERS', 'only-a': 'ONLY A', 'only-b': 'ONLY B' };
  const size = (n) => (n === null ? '-' : n.toLocaleString());
  console.log(`A: ${path.resolve(dirA)}\nB: ${path.resolve(dirB)}`);
  for (const f of inA.filter((x) => !inB.includes(x))) console.log(`\nONLY A  ${f} (not compared)`);
  for (const f of inB.filter((x) => !inA.includes(x))) console.log(`\nONLY B  ${f} (not compared)`);
  for (const f of both) {
    const result = compareSections(fs.readFileSync(path.join(dirA, f), 'utf8'), fs.readFileSync(path.join(dirB, f), 'utf8'));
    console.log(`\n== ${f}: ${result.differences === 0 ? 'no differences' : `${result.differences} section(s) differ or exist in one directory only`}`);
    const width = Math.max(...result.rows.map((r) => r.key.length), 0);
    for (const r of result.rows) {
      console.log(`  ${LABEL[r.status].padEnd(7)}  ${r.key.padEnd(width)}  A ${size(r.sizeA).padStart(9)}  B ${size(r.sizeB).padStart(9)}`);
    }
    for (const u of result.unclosed) console.log(`  UNCLOSED in ${u.side}: ${u.key} at line ${u.line}`);
  }
  process.exit(0);
}
