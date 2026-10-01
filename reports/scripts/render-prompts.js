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
 * Phase 2 (2.3): the arc writer and the arc reworker (a send back) are rendered too,
 * as arc-generation.txt and arc-revision.txt, for the plain prompt diff; --compare
 * reads only the four files above.
 *
 * Phase 3 (brief 3.0): every call the phase rewires is rendered, ten files in all:
 *   outline-generation.txt, outline-revision.txt, article-generation.txt,
 *   article-revision.txt, arc-generation.txt, arc-revision.txt  (as above)
 *   interweaving.txt   the interweaving call (call 2 of the arc analysis), from the
 *                      stored arcs, the session roster and the evidence bundle, as
 *                      enrichWithInterweaving builds it
 *   judge-arc.txt, judge-outline.txt, judge-article.txt
 *                      the three judges, from the thread's state, as createEvaluator
 *                      builds them; the article judge's user prompt carries the fact
 *                      check run on the stored bundle (factCheckContentBundle)
 * Every builder is awaited. The run fails (exit 1, naming the file) when a render's
 * system or user prompt is empty, when it contains "[object Promise]", or when no line
 * opens with one of the file's markers in REQUIRED_MARKERS below; a file in that table
 * that is not rendered fails too. A tree that lacks a builder fails (exit 2, naming it).
 *
 * --theme overrides the thread's theme for every render, so the detective prompts
 * can be rendered from a journalist thread and diffed against a baseline.
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

/**
 * The markers each render must carry: for each, a line that opens with it. Each is
 * one that every render of that call carries at bad9781, for both themes, on 092026
 * and 092626, whatever the session's data: every call prints the record view, and
 * the six writer renders print the fixed gate notes inside <DIRECTOR_GUIDANCE>. A
 * render without one is missing its frame, and an absence scan over it would pass
 * for nothing.
 */
const REQUIRED_MARKERS = {
  'outline-generation.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'outline-revision.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'article-generation.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'article-revision.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'arc-generation.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'arc-revision.txt': ['<RECORD>', '<DIRECTOR_GUIDANCE>'],
  'interweaving.txt': ['<RECORD>'],
  'judge-arc.txt': ['<RECORD>'],
  'judge-outline.txt': ['<RECORD>'],
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
/** Rendered as well, but not compared (phase 2, 2.3): the arc writer and its reworker. */
const ARC_FILES = ['arc-generation.txt', 'arc-revision.txt'];
/** Rendered as well, but not compared (phase 3, 3.0): the interweaving call and the judges. */
const INTERWEAVING_FILE = 'interweaving.txt';
const JUDGE_FILES = [['judge-arc.txt', 'arcs'], ['judge-outline.txt', 'outline'], ['judge-article.txt', 'article']];
const FIXED_FEEDBACK = 'RENDER-DIFF FIXED FEEDBACK: tighten the second section.';
/** The round a fixed send back opens, for the rework banner (2.3; an older tree ignores it). */
const FIXED_ROUND = 2;
const FIXED_NOTES = [
  { gate: 'arc-selection', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE A', at: '2026-09-19T00:00:00.000Z' },
  { gate: 'outline', kind: 'rejection', round: 1, text: 'RENDER-DIFF NOTE B', at: '2026-09-19T00:00:01.000Z' }
];
/** The previous stage's advisories, so the diff shows <SHOULD_CONSIDER> and where it sits. */
const FIXED_ADVISORIES = ['RENDER-DIFF ADVISORY A', 'RENDER-DIFF ADVISORY B'];

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

async function loadState(dbPath, threadId) {
  if (path.resolve(dbPath) === PRODUCTION_DB) {
    console.error('refusing to open the production database ' + PRODUCTION_DB + ' - render against a COPY (spec 2026-09-19 §7.3)');
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
  const { _testing: { buildOutlineRevisionPrompt, buildArticleRevisionPrompt, getOutlineRevisionSystemPrompt, getArticleRevisionSystemPrompt,
    buildOutlineRevisionSystemPrompt, buildArticleRevisionSystemPrompt,
    buildSessionFacts, buildAvailablePhotos } } = req('lib/workflow/nodes/ai-nodes.js');
  const { _testing: arcNodes } = req('lib/workflow/nodes/arc-specialist-nodes.js');
  // Brief 3.0: the judges, and the fact check the article judge reads, as createEvaluator uses them.
  const { _testing: evalNodes } = req('lib/workflow/nodes/evaluator-nodes.js');
  const { factCheckContentBundle } = req('lib/content-bundle-fact-check.js');
  const { getThemeNPCPronouns } = req('lib/theme-config.js');
  requireExports('arc-specialist-nodes.js _testing', arcNodes, ['coreArcSystemPrompt', 'buildCoreArcPrompt',
    'getArcRevisionSystemPrompt', 'buildArcRevisionPrompt', 'interweavingSystemPrompt', 'buildInterweavingPrompt']);
  requireExports('evaluator-nodes.js _testing', evalNodes, ['buildEvaluationSystemPrompt', 'buildEvaluationUserPrompt',
    'getOutlineCriteria', 'getArticleCriteria', 'QUALITY_CRITERIA']);
  requireExports('content-bundle-fact-check.js', { factCheckContentBundle }, ['factCheckContentBundle']);
  requireExports('theme-config.js', { getThemeNPCPronouns }, ['getThemeNPCPronouns']);
  let diffMod = null;
  // Only a MISSING module is expected (main has no hand-edit module). Anything else -
  // a syntax error, a throwing dependency - would make the guard pass vacuously (M4).
  try { diffMod = req('lib/hand-edit-diff.js'); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

  const state = await loadState(dbPath, sessionId);
  // --theme renders every call for that theme, whatever the thread ran as: every
  // builder below reads the theme from state.theme or from this one value.
  if (args.theme) state.theme = args.theme;
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
  const nameOf = (p) => typeof p === 'string' ? p.split(/[/\\]/).pop() : p && p.filename;
  const whiteboard = state.whiteboardPhotoPath ? nameOf(state.whiteboardPhotoPath) : null;
  const heroImage = state.heroImage || null;
  // Joined by filename, as generateOutline does since brief 1.6 (the old index
  // join read the wrong analysis for every photo after the filtered hero).
  const analysisByName = new Map(((state.photoAnalyses && state.photoAnalyses.analyses) || [])
    .filter((a) => a && a.filename)
    .map((a) => [String(a.filename).split(/[/\\]/).pop().toLowerCase(), a]));
  const availablePhotos = buildAvailablePhotos ? await buildAvailablePhotos(state, heroImage, whiteboard) : (state.sessionPhotos || [])
    .filter((p) => nameOf(p) !== heroImage && (!whiteboard || nameOf(p) !== whiteboard))
    .map((p, i) => {
      const a = analysisByName.get(String(nameOf(p) || `photo-${i}.jpg`).toLowerCase()) || {};
      return { filename: nameOf(p) || `photo-${i}.jpg`, fullPath: p,
        characters: (a.characterDescriptions || []).map((c) => typeof c === 'string' ? c : c.description), visualContent: a.visualContent || '' };
    });
  // Brief 2.2: the director's own words the writers now read (ignored by an older tree).
  const directorWords = {
    directorCorrections: state.inputReviewCorrections || [],
    photoDescriptions: state.photoDescriptions || null
  };
  const { timing, architecture, ...cache } = state._arcAnalysisCache || {};
  const arcAnalysis = { ...cache, narrativeArcs: state.narrativeArcs || [] };
  const guidance = state._outlineGuidance || null;

  // Every render is written, then checked (brief 3.0); the run fails after all are written.
  const written = [];
  const problems = [];
  const write = (name, systemPrompt, userPrompt) => {
    fs.writeFileSync(path.join(outDir, name), `===== SYSTEM =====\n${systemPrompt}\n\n===== USER =====\n${userPrompt}\n`);
    written.push(name);
    problems.push(...renderProblems(name, systemPrompt, userPrompt, REQUIRED_MARKERS[name]));
  };

  // 1. outline generation
  const og = await promptBuilder.buildOutlinePrompt(arcAnalysis, state.selectedArcs || [], heroImage, availablePhotos,
    state.arcEvidencePackages || [], state.shellAccounts || [], sessionFacts,
    { directorGuidance: guidance, gateNotes: FIXED_NOTES, directorNotes: state.directorNotes || null, shouldConsider: FIXED_ADVISORIES,
      evidenceBundle: state.evidenceBundle || null, ...directorWords });
  write(FILES[0], og.systemPrompt, og.userPrompt);

  // 2. outline revision (fixed hand edit: lede.hook)
  const outline = state.outline || {};
  const editedOutline = JSON.parse(JSON.stringify(outline));
  if (editedOutline.lede) editedOutline.lede.hook = String(editedOutline.lede.hook || '') + ' [RENDER-DIFF EDIT]';
  const outlineDiff = diffMod ? await diffMod.diffOutline(outline, editedOutline) : null;
  const orc = await buildRevisionContext({ phase: 'outline', revisionCount: 1, round: FIXED_ROUND, validationResults: state.validationResults || null,
    previousOutput: editedOutline, humanFeedback: FIXED_FEEDBACK, handEdits: outlineDiff });
  const orPrompt = await buildOutlineRevisionPrompt({ ...state, _outlineGuidance: guidance }, orc.contextSection, orc.previousOutputSection, promptBuilder, FIXED_NOTES);
  // Brief 2.3: a tree whose reworker is built from its writer composes the rework
  // system prompt from the writer's; an older tree took the theme.
  const orSystem = buildOutlineRevisionSystemPrompt
    ? await buildOutlineRevisionSystemPrompt(promptBuilder)
    : await getOutlineRevisionSystemPrompt(theme, state.sessionConfig || {});
  write(FILES[1], orSystem, orPrompt);

  // 3. article generation
  const ag = await promptBuilder.buildArticlePrompt(outline, state.arcEvidencePackages || [], heroImage, state.shellAccounts || [],
    sessionFacts, state.directorNotes || null, state.narrativeTensions || null,
    { directorGuidance: guidance, gateNotes: FIXED_NOTES, shouldConsider: FIXED_ADVISORIES,
      evidenceBundle: state.evidenceBundle || null, ...directorWords });
  write(FILES[2], ag.systemPrompt, ag.userPrompt);

  // 4. article revision (fixed hand edit: headline.main)
  const bundle = state.contentBundle || {};
  const editedBundle = JSON.parse(JSON.stringify(bundle));
  if (editedBundle.headline) editedBundle.headline.main = String(editedBundle.headline.main || '') + ' [RENDER-DIFF EDIT]';
  const bundleDiff = diffMod ? await diffMod.diffBundle(bundle, editedBundle) : null;
  const arc = await buildRevisionContext({ phase: 'article', revisionCount: 1, round: FIXED_ROUND, validationResults: state.validationResults || null,
    previousOutput: editedBundle, humanFeedback: FIXED_FEEDBACK, handEdits: bundleDiff });
  const arPrompt = await buildArticleRevisionPrompt({ ...state, _outlineGuidance: guidance }, arc.contextSection, arc.previousOutputSection, promptBuilder, FIXED_NOTES);
  const arSystem = buildArticleRevisionSystemPrompt
    ? await buildArticleRevisionSystemPrompt(promptBuilder, theme)
    : await getArticleRevisionSystemPrompt(theme, state.sessionConfig || {});
  write(FILES[3], arSystem, arPrompt);

  // 5. arc generation (call 1) and 6. arc revision (a send back). Rendered for the
  // plain prompt diff only; --compare reads FILES. The fixed notes stand in for the
  // director's, the fixed feedback for the note the send back acts on, and the
  // persisted arcs for the previous version.
  const arcState = { ...state, directorGateNotes: FIXED_NOTES };
  write(ARC_FILES[0], await arcNodes.coreArcSystemPrompt(state.sessionConfig || {}), await arcNodes.buildCoreArcPrompt(arcState));
  const crc = await buildRevisionContext({ phase: 'arcs', revisionCount: 0, round: FIXED_ROUND, validationResults: state.validationResults || null,
    previousOutput: state.narrativeArcs || [], humanFeedback: FIXED_FEEDBACK });
  write(ARC_FILES[1], await arcNodes.getArcRevisionSystemPrompt(true, state.sessionConfig || {}),
    await arcNodes.buildArcRevisionPrompt({ ...arcState, _arcFeedback: FIXED_FEEDBACK }, crc.contextSection, crc.previousOutputSection));

  // 7. the interweaving call, as enrichWithInterweaving builds it: the stored arcs
  // stand in for call 1's (the call reads only their id, title, summary, source and
  // placements), with the session roster and the evidence bundle.
  write(INTERWEAVING_FILE, await arcNodes.interweavingSystemPrompt(state.sessionConfig),
    await arcNodes.buildInterweavingPrompt(state.narrativeArcs || [], roster, state.evidenceBundle));

  // 8-10. the three judges, as createEvaluator builds them, from the thread's state.
  // Only the article judge reads a fact check: factCheckContentBundle on the stored
  // bundle, with createEvaluator's arguments, or none when there is no bundle.
  const criteriaFor = (phase) => (phase === 'article' ? evalNodes.getArticleCriteria(theme)
    : phase === 'outline' ? evalNodes.getOutlineCriteria(theme)
      : evalNodes.QUALITY_CRITERIA[phase]);
  for (const [file, phase] of JUDGE_FILES) {
    const factCheck = phase === 'article' && state.contentBundle
      ? await factCheckContentBundle({
        contentBundle: state.contentBundle,
        arcEvidencePackages: state.arcEvidencePackages,
        evidenceBundle: state.evidenceBundle,
        roster: state.sessionConfig?.roster,
        sessionPhotos: state.sessionPhotos,
        reportingMode: state.sessionConfig?.reportingMode,
        npcPronouns: getThemeNPCPronouns(theme),
        theme
      })
      : null;
    write(file, await evalNodes.buildEvaluationSystemPrompt(phase, criteriaFor(phase), theme),
      await evalNodes.buildEvaluationUserPrompt(phase, state, { factCheck }));
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

/** Throw, naming the module and the export, when a tree lacks a builder this script renders through. */
function requireExports(where, mod, names) {
  const missing = names.filter((n) => !mod || mod[n] === undefined);
  if (missing.length > 0) throw new Error(`${where} does not export ${missing.join(', ')}: this tree cannot render every call`);
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
