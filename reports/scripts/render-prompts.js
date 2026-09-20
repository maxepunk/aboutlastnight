#!/usr/bin/env node
/**
 * scripts/render-prompts.js — render the four director-facing prompts from a thread's
 * PERSISTED state, with NO model calls (spec 2026-09-19 §7.3), or compare two renders.
 *
 *   node scripts/render-prompts.js --session 0919269 --db <copy.sqlite> --out <dir> [--repo <path>]
 *   node scripts/render-prompts.js --compare <dirA> <dirB>
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
 */
'use strict';
const path = require('path');
const fs = require('fs');

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
const FIXED_FEEDBACK = 'RENDER-DIFF FIXED FEEDBACK: tighten the second section.';
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
} else { render().catch((e) => { console.error(e); process.exit(2); }); }

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
  const { _testing: { buildOutlineRevisionPrompt, buildArticleRevisionPrompt, getOutlineRevisionSystemPrompt, getArticleRevisionSystemPrompt } } = req('lib/workflow/nodes/ai-nodes.js');
  let diffMod = null;
  // Only a MISSING module is expected (main has no hand-edit module). Anything else -
  // a syntax error, a throwing dependency - would make the guard pass vacuously (M4).
  try { diffMod = req('lib/hand-edit-diff.js'); }
  catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }

  const state = await loadState(dbPath, sessionId);
  const theme = state.theme || 'journalist';
  const promptBuilder = createPromptBuilder({
    theme, sessionConfig: state.sessionConfig || {},
    canonicalCharacters: state.canonicalCharacters || null,
    characterData: (state.characterData && state.characterData.characters) || null
  });

  // Mirror ai-nodes.js generateOutline / generateContentBundle (as data/review-2026-09-18/render-p1.js did).
  const roster = (state.sessionConfig && state.sessionConfig.roster) || [];
  const canonical = state.canonicalCharacters || {};
  const sessionFacts = roster.length > 0 ? {
    roster: roster.map((p) => { const n = p.name || p; return canonical[n] || n; }),
    accusation: (state.sessionConfig && state.sessionConfig.accusation && state.sessionConfig.accusation.accused || []).join(' and ') || 'Unknown',
    playerCount: roster.length
  } : null;
  const nameOf = (p) => typeof p === 'string' ? p.split(/[/\\]/).pop() : p && p.filename;
  const whiteboard = state.whiteboardPhotoPath ? nameOf(state.whiteboardPhotoPath) : null;
  const heroImage = state.heroImage || null;
  // Joined by filename, as generateOutline does since brief 1.6 (the old index
  // join read the wrong analysis for every photo after the filtered hero).
  const analysisByName = new Map(((state.photoAnalyses && state.photoAnalyses.analyses) || [])
    .filter((a) => a && a.filename)
    .map((a) => [String(a.filename).split(/[/\\]/).pop().toLowerCase(), a]));
  const availablePhotos = (state.sessionPhotos || [])
    .filter((p) => nameOf(p) !== heroImage && (!whiteboard || nameOf(p) !== whiteboard))
    .map((p, i) => {
      const a = analysisByName.get(String(nameOf(p) || `photo-${i}.jpg`).toLowerCase()) || {};
      return { filename: nameOf(p) || `photo-${i}.jpg`, fullPath: p,
        characters: (a.characterDescriptions || []).map((c) => typeof c === 'string' ? c : c.description), visualContent: a.visualContent || '' };
    });
  const { timing, architecture, ...cache } = state._arcAnalysisCache || {};
  const arcAnalysis = { ...cache, narrativeArcs: state.narrativeArcs || [] };
  const guidance = state._outlineGuidance || null;

  const write = (name, systemPrompt, userPrompt) =>
    fs.writeFileSync(path.join(outDir, name), `===== SYSTEM =====\n${systemPrompt}\n\n===== USER =====\n${userPrompt}\n`);

  // 1. outline generation
  const og = await promptBuilder.buildOutlinePrompt(arcAnalysis, state.selectedArcs || [], heroImage, availablePhotos,
    state.arcEvidencePackages || [], state.shellAccounts || [], sessionFacts,
    { directorGuidance: guidance, gateNotes: FIXED_NOTES, directorNotes: state.directorNotes || null, shouldConsider: FIXED_ADVISORIES });
  write(FILES[0], og.systemPrompt, og.userPrompt);

  // 2. outline revision (fixed hand edit: lede.hook)
  const outline = state.outline || {};
  const editedOutline = JSON.parse(JSON.stringify(outline));
  if (editedOutline.lede) editedOutline.lede.hook = String(editedOutline.lede.hook || '') + ' [RENDER-DIFF EDIT]';
  const outlineDiff = diffMod ? diffMod.diffOutline(outline, editedOutline) : null;
  const orc = buildRevisionContext({ phase: 'outline', revisionCount: 1, validationResults: state.validationResults || null,
    previousOutput: editedOutline, humanFeedback: FIXED_FEEDBACK, handEdits: outlineDiff });
  const orPrompt = await buildOutlineRevisionPrompt({ ...state, _outlineGuidance: guidance }, orc.contextSection, orc.previousOutputSection, promptBuilder, FIXED_NOTES);
  write(FILES[1], getOutlineRevisionSystemPrompt(theme, state.sessionConfig || {}), orPrompt);

  // 3. article generation
  const ag = await promptBuilder.buildArticlePrompt(outline, state.arcEvidencePackages || [], heroImage, state.shellAccounts || [],
    sessionFacts, state.directorNotes || null, state.narrativeTensions || null,
    { directorGuidance: guidance, gateNotes: FIXED_NOTES, shouldConsider: FIXED_ADVISORIES });
  write(FILES[2], ag.systemPrompt, ag.userPrompt);

  // 4. article revision (fixed hand edit: headline.main)
  const bundle = state.contentBundle || {};
  const editedBundle = JSON.parse(JSON.stringify(bundle));
  if (editedBundle.headline) editedBundle.headline.main = String(editedBundle.headline.main || '') + ' [RENDER-DIFF EDIT]';
  const bundleDiff = diffMod ? diffMod.diffBundle(bundle, editedBundle) : null;
  const arc = buildRevisionContext({ phase: 'article', revisionCount: 1, validationResults: state.validationResults || null,
    previousOutput: editedBundle, humanFeedback: FIXED_FEEDBACK, handEdits: bundleDiff });
  const arPrompt = await buildArticleRevisionPrompt({ ...state, _outlineGuidance: guidance }, arc.contextSection, arc.previousOutputSection, promptBuilder, FIXED_NOTES);
  write(FILES[3], getArticleRevisionSystemPrompt(theme, state.sessionConfig || {}), arPrompt);

  for (const f of FILES) console.log(`${f}: ${fs.statSync(path.join(outDir, f)).size.toLocaleString()} bytes`);
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
