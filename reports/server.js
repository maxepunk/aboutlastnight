/**
 * ALN Director Console - Backend Server
 * Uses Claude Agent SDK via LangGraph workflow for AI operations
 */

require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

// LangGraph workflow modules
const { Command } = require('@langchain/langgraph');
const { SqliteSaver } = require('@langchain/langgraph-checkpoint-sqlite');
const { createReportGraphWithCheckpointer, RECURSION_LIMIT } = require('./lib/workflow/graph');
const {
  PHASES,
  ROLLBACK_CLEARS,
  VALID_ROLLBACK_POINTS,
  REVISION_CAPS
} = require('./lib/workflow/state');
const {
  CHECKPOINT_TYPES,
  isGraphInterrupted,
  getInterruptData,
  buildInterruptResponse
} = require('./lib/workflow/checkpoint-helpers');
const { sanitizePath } = require('./lib/workflow/nodes/input-nodes');
const { progressEmitter } = require('./lib/observability');
const { createPromptBuilder } = require('./lib/prompt-builder');
const { buildRollbackState, buildFreshStartState, createGraphAndConfig, sendErrorResponse, confineToBase, rollbackNotesUpdate } = require('./lib/api-helpers');
const { diffOutline, diffBundle, scopeKeys, standingAfterSendBack, handEditReportOf } = require('./lib/hand-edit-diff');
// FA (requirement 9): the roster's names as the coverage check reads them, which each
// send-back records a cut's or a rewrite's names against.
const { rosterNames } = require('./lib/content-bundle-fact-check');
// FA (requirement 12): the printed photos the session's folder lacks, which the article
// approve checks by publish's own rule.
const { missingPrintedPhotos } = require('./lib/publish-photos');
// Brief 4.2: the leave-out box, the list the character-IDs stop's boxes write.
const { leftOutPhotosOf, listAfterStopChoices } = require('./lib/photo-leave-out');
// Phase 3 (3.7): the writers' questions for the director, sent at the three stops.
const { writerQuestionsOf } = require('./lib/writer-questions');
// Brief 4.5: the story meeting's payloads and what its stop sends.
const { meetingResume, meetingCheckpointData } = require('./lib/meeting');
// Phase 4 (brief 4.6): the map's payloads and what its stop shows; the photos kept for the
// article, which Everyone and the counts read.
const { mapResume, mapCheckpointData } = require('./lib/map');
const { keptPhotoFilenames } = require('./lib/workflow/nodes/ai-nodes');
const { isWeave } = require('./lib/weave');
const { createLoginRateLimiter } = require('./lib/login-rate-limiter');
const { staticGuard } = require('./lib/static-guard');
const { buildOutcomeRecord, recordSessionOutcome, getSessionOutcome, clearSessionOutcome } = require('./lib/session-outcome');
const { isSessionLocked } = require('./lib/session-locks');
const { runGraphInBackground } = require('./lib/api-background-runner');
const { SchemaValidator } = require('./lib/schema-validator');
// Task 4.3: the article as it will print, one renderer for htmlPreview and the desk's preview route.
const { previewOptionsOf, articlePreviewHtml, writerTrackerPrints } = require('./lib/article-preview');
const outlineValidator = new SchemaValidator();

// Shared checkpointer instance - DURABLE (DUR-1): sessions survive restart/crash/deploy.
// SqliteSaver.fromConnString opens (and creates) the db; .db is the better-sqlite3 handle.
/**
 * Spec 2026-09-19 §7.4: a live gate runs against a COPY of the checkpoint database,
 * never the production file, so the path is overridable through the environment.
 * Pure so the default can be tested without opening any database.
 * Under Jest, `__tests__/setup/checkpoint-db-path.js` (setupFiles) points this at a
 * per-worker temp file before any test module loads, so no test opens the production db.
 */
function resolveCheckpointDbPath(env = process.env, baseDir = __dirname) {
    return env.CHECKPOINT_DB_PATH
        ? path.resolve(env.CHECKPOINT_DB_PATH)
        : path.join(baseDir, 'data', 'checkpoints.sqlite');
}
const CHECKPOINT_DB_PATH = resolveCheckpointDbPath();
fs.mkdirSync(path.dirname(CHECKPOINT_DB_PATH), { recursive: true });

/**
 * Spec 2026-09-19 §7.4: a throwaway gate server listens on a port of its own so it
 * cannot collide with the director's production 3001 — which means a PORT the
 * environment got wrong must FAIL, not quietly resolve to that very port.
 * Unset or empty is the only fallback; anything that is not a positive integer throws.
 * Pure, so it can be tested without starting a listener.
 */
function resolvePort(env = process.env) {
    const raw = env.PORT;
    if (raw === undefined || raw === null || String(raw).trim() === '') return 3001;
    const text = String(raw).trim();
    if (!/^\d+$/.test(text) || Number(text) === 0) {
        throw new Error(
            `Invalid PORT "${raw}": must be a positive integer (unset it to use the default 3001). ` +
            "Refusing to fall back to 3001, which is the director's production port."
        );
    }
    return Number(text);
}
const sharedCheckpointer = SqliteSaver.fromConnString(CHECKPOINT_DB_PATH);

// Base directory all browse/file requests are confined to (SEC-1/SEC-2)
const DATA_DIR = path.join(__dirname, 'data');

// Login brute-force protection (SEC-5): 5 failures / 15 min per IP, 15 min lockout
const loginRateLimiter = createLoginRateLimiter({
    maxAttempts: 5,
    windowMs: 15 * 60 * 1000,
    lockoutMs: 15 * 60 * 1000
});

// Shared promptBuilder - created at startup, injected into workflow config (Commit 8.18)
// Persists cache across all graph invocations for efficient prompt loading
let sharedPromptBuilder = null;

// In-flight background tasks (DUR-2): the /approve handler runs the graph in a
// setImmediate; SIGINT must await these (and refuse new ones) before exit so a
// resume's checkpoint write + SSE emit are never severed mid-flight.
const inFlightTasks = new Set();
let shuttingDown = false;
let httpServer = null; // hoisted so SIGINT (module scope) can drain + close it

/**
 * Drain in-flight background tasks, then close the durable checkpointer's
 * sqlite handle, then close the HTTP server — in that order. Pure + injectable
 * so it is unit-testable (the SIGINT handler itself calls process.exit).
 * @param {{inFlight:Set<Promise>, checkpointer:{db:{close:Function}}, server?:{close:Function}}} deps
 */
async function drainAndClose({ inFlight, checkpointer, server, closeTimeoutMs = 5000 }) {
  if (inFlight && inFlight.size > 0) {
    // allSettled: a rejected resume must not abort the drain of the others
    await Promise.allSettled(Array.from(inFlight));
  }
  if (checkpointer && checkpointer.db && typeof checkpointer.db.close === 'function') {
    checkpointer.db.close();
  }
  if (server && typeof server.close === 'function') {
    // server.close() stops accepting NEW connections but does not terminate existing
    // keep-alive / SSE connections (the /progress stream is long-lived), so its callback
    // may never fire. Backstop with a timeout so SIGINT still exits cleanly — by this point
    // the checkpoint write + db handle close are already done, so nothing is lost.
    // (clear the timer when close() does call back, so we never leave a dangling handle.)
    await new Promise(resolve => {
      const timer = setTimeout(resolve, closeTimeoutMs);
      server.close(() => { clearTimeout(timer); resolve(); });
    });
  }
}

/**
 * Get session state from checkpointer without invoking the graph
 * Used by read-only endpoints to inspect state at any checkpoint
 * @param {string} sessionId - The session/thread ID
 * @returns {object|null} - { checkpointId, timestamp, state } or null if not found
 */
/**
 * Pure shaper: turn a graph.getState() snapshot (+ persisted outcome) into the
 * /state response body. Interrupt-aware (READ-1) and outcome-aware (DEL-1).
 * @param {object} graphState - result of graph.getState(config)
 * @param {object|null} outcome - getSessionOutcome(sessionId) result
 * @returns {object}
 */
function shapeSessionState(graphState, outcome) {
    const interruptTask = (graphState.tasks || []).find(t => t.interrupts && t.interrupts.length > 0);
    const interrupted = !!interruptTask;
    const checkpointType = interrupted
        ? (interruptTask.interrupts[0]?.value?.type || null)
        : null;
    return {
        checkpointId: graphState.config?.configurable?.checkpoint_id || null,
        timestamp: graphState.createdAt || null,
        interrupted,
        checkpointType,
        state: graphState.values || {},
        lastOutcome: outcome || null
    };
}

async function getSessionState(sessionId) {
    const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
    const config = { configurable: { thread_id: sessionId } };
    const graphState = await graph.getState(config);

    if (!graphState || !graphState.values || Object.keys(graphState.values).length === 0) {
        return null;
    }

    return shapeSessionState(graphState, getSessionOutcome(sessionId));
}

/**
 * The most recent evaluation FOR ONE PHASE (H6).
 *
 * evaluationHistory is append-only and mixes all three phases plus
 * 'revision-invalidated' stubs, so "the last entry" is routinely another phase's
 * verdict. Every gate shipped the whole array and the console rendered none of
 * it: the operator approved arcs/outline/article without ever seeing what the
 * Opus evaluation said, including its escalations.
 *
 * @param {Array} history - state.evaluationHistory
 * @param {string} phase - 'arcs' | 'outline' | 'article'
 * @returns {object|null}
 */
function lastEvaluationFor(history, phase) {
    const entries = (Array.isArray(history) ? history : []).filter(e => e && e.phase === phase);
    return entries.length > 0 ? entries[entries.length - 1] : null;
}

/**
 * Render the pending ContentBundle to HTML for the article gate (H13).
 *
 * Uses the same TemplateAssembler the pipeline publishes with, so the operator
 * approves the thing they can read rather than a JSON blob. Nothing is written
 * to disk and no photos are copied — that is assembleHtml's job, after approval.
 * The render, its `<base href="/">` included, is lib/article-preview.js's, which the
 * desk's preview route shares (task 4.3).
 *
 * Returns null on ANY failure: a bundle too malformed to render is exactly when
 * the operator most needs the gate to open (with the JSON and the reject box).
 *
 * @param {object} state
 * @returns {Promise<string|null>}
 */
async function renderArticlePreview(state) {
    if (!state.contentBundle) return null;
    try {
        return await articlePreviewHtml(state.contentBundle, previewOptionsOf(state));
    } catch (err) {
        console.warn(`[renderArticlePreview] preview unavailable: ${err.message}`);
        return null;
    }
}

/**
 * Counts of what the director-notes enricher actually indexed (H25).
 *
 * An enrichment that came back empty looked identical to a session whose notes
 * had nothing in them. `_enrichmentFallback` (the enricher's own marker for "this
 * is a fallback, not a result") was carried in directorNotes and read by nobody.
 *
 * @param {object|null} directorNotes
 * @returns {{quotes:number, characterMentions:number, transactionReferences:number, fallback:object|null, warnings:object|null}}
 */
function summarizeEnrichment(directorNotes) {
    const notes = directorNotes || {};
    return {
        quotes: (notes.quotes || []).length,
        characterMentions: Object.keys(notes.characterMentions || {}).length,
        transactionReferences: (notes.transactionReferences || []).length,
        fallback: notes._enrichmentFallback || null,
        warnings: notes._enrichmentWarnings || null
    };
}

/** The approved outline's thesis for the article gate (spec 2026-09-19 §6.2). Journalist only. */
function outlineThesisOf(state) {
    if ((state.theme || 'journalist') === 'detective') return null;
    const lede = state.outline && state.outline.lede;
    if (!lede || typeof lede !== 'object') return null;
    return { hook: lede.hook || '', keyTension: lede.keyTension || '', primaryArc: lede.primaryArc || '' };
}

/**
 * The trace a stop shows (phase 2, brief 2.7): each automatic pass of the current
 * round, with what it changed.
 *
 * The channel keeps each pass's `before` (the version the rework started from); the
 * version the pass produced is the next pass's `before`, or, for the last pass, the
 * object the stop is showing. The diff is computed here, with the hand-edit helpers,
 * so the payload carries what changed and none of the whole versions. `diff` is null
 * when either side is not an object (a rework that errored leaves no version).
 *
 * Only the current round is sent. The increments and the send-back reset already keep
 * the channel to one round; this is the last guard before the screen.
 *
 * @param {Array|null} entries - state._outlineTrace or state._articleTrace
 * @param {Object|null} current - the outline or bundle at the stop
 * @param {Function} diffFn - diffOutline or diffBundle
 * @param {number} round - the current round, 1-based (human counter + 1)
 * @returns {Array<{pass, round, trigger, findings, at, diff, changedScopes}>}
 */
function traceForStop(entries, current, diffFn, round) {
    const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
    const passes = (Array.isArray(entries) ? entries : []).filter(e => isObject(e) && e.round === round);
    return passes.map((entry, i) => {
        const after = i + 1 < passes.length ? passes[i + 1].before : current;
        const diff = isObject(entry.before) && isObject(after) ? diffFn(entry.before, after) : null;
        return {
            pass: entry.pass,
            round: entry.round,
            trigger: entry.trigger,
            findings: entry.findings || null,
            at: entry.at || null,
            diff,
            changedScopes: diff ? scopeKeys(diff) : null
        };
    });
}

/** How much of a document's first line the arc card shows. */
const EVIDENCE_FIRST_LINE_MAX = 160;

/** The first non-blank line of a document, for the arc cards. */
function firstLineOf(item) {
    const text = String(item.fullContent || item.content || item.description || item.text || '');
    const line = text.split(/\r?\n/).map(l => l.trim()).find(l => l.length > 0) || '';
    return line.length > EVIDENCE_FIRST_LINE_MAX ? line.slice(0, EVIDENCE_FIRST_LINE_MAX).trimEnd() + '...' : line;
}

/**
 * The owner of a document, as a name.
 *
 * `owners` is the resolved relation (lib/notion/relations.js deletes `ownerIds`
 * on the join), `owner`/`ownerLogline` are what the preprocessor carries. Never a
 * relation id: an id is exactly what this whole index exists to keep off the
 * screen.
 */
function ownerNameOf(item) {
    const candidate = item.owner || item.ownerLogline || (Array.isArray(item.owners) ? item.owners[0] : null);
    if (typeof candidate === 'string') return candidate.trim();
    if (candidate && typeof candidate === 'object') {
        return String(candidate.name || candidate.logline || '').trim();
    }
    return '';
}

/**
 * Every exposed document at the arc stop, keyed by the id an arc may cite
 * (phase 1, brief 1.2).
 *
 * The arc cards rendered `keyEvidence` as bare ids, so the director was asked to
 * judge an arc by `85620c6f-befd-4799-a877-8fc25c040d8e`. Ids resolve here the
 * way the claim-side check resolves them (`lib/content-bundle-fact-check.js`
 * buildSourceMap: id, then tokenId, then notionId, then pageId, then name), so
 * the console and the check agree on what an id means. First one wins, as there.
 *
 * A memory token keeps the fetched element under `rawData` and has no name of its
 * own; paper evidence is spread flat. Both are read, and a document with no name
 * falls back to its id so the card always has something to show.
 *
 * @param {object} evidenceBundle - state.evidenceBundle
 * @returns {Object<string, {name: string, owner: string, type: string, firstLine: string}>}
 */
function buildEvidenceIndex(evidenceBundle) {
    const exposed = (evidenceBundle && evidenceBundle.exposed) || {};
    const index = {};
    const add = (item, type) => {
        if (!item || typeof item !== 'object') return;
        const raw = (item.rawData && typeof item.rawData === 'object') ? item.rawData : {};
        const id = item.id || item.tokenId || item.notionId || item.pageId || item.name;
        if (!id || index[String(id)]) return;
        index[String(id)] = {
            name: String(item.name || raw.name || raw.title || id).trim(),
            owner: ownerNameOf(item) || ownerNameOf(raw),
            type,
            firstLine: firstLineOf(item) || firstLineOf(raw)
        };
    };
    (Array.isArray(exposed.tokens) ? exposed.tokens : []).forEach(item => add(item, 'memory'));
    (Array.isArray(exposed.paperEvidence) ? exposed.paperEvidence : []).forEach(item => add(item, 'paper'));
    return index;
}

/**
 * Build response data for a specific checkpoint type (DRY helper)
 * Extracts relevant fields from state based on checkpoint type
 *
 * ASYNC because the article gate renders an HTML preview (H13).
 *
 * Brief 1.4: at the three writer stops `revisionCount` is the AUTOMATED passes spent
 * in the current round and `maxRevisions` the automated budget, while
 * `humanRevisionCount` is the rounds the director has taken. The console reads
 * "Round N" off the latter; nothing caps it.
 *
 * @param {string} checkpointType - The checkpoint type constant
 * @param {object} state - The current state object
 * @returns {Promise<object>} - Checkpoint-specific data for response
 */
async function getCheckpointData(checkpointType, state) {
    switch (checkpointType) {
        case CHECKPOINT_TYPES.INPUT_REVIEW: {
            // Phase 3 (brief 3.5): the ledger as the director checks it: which clock
            // rule applied, the adjustments beside each account's total and sale
            // count, and a totals mismatch or "adjustments not parsed".
            const { ledgerReviewOf } = require('./lib/session-ledger');
            return {
                // `_parsedInput` is deliberately absent: it was never an Annotation
                // channel, so LangGraph dropped every write and this key was always
                // undefined. The writes are gone too (fetch-nodes, input-nodes).
                sessionConfig: state.sessionConfig,
                directorNotes: state.directorNotes,
                playerFocus: state.playerFocus,
                enrichment: summarizeEnrichment(state.directorNotes),
                ledger: ledgerReviewOf(state)
            };
        }
        case CHECKPOINT_TYPES.PAPER_EVIDENCE_SELECTION:
            return { paperEvidence: state.paperEvidence };
        case CHECKPOINT_TYPES.CHARACTER_IDS:
            return {
                sessionPhotos: state.sessionPhotos,
                photoAnalyses: state.photoAnalyses,
                sessionConfig: state.sessionConfig,
                // Brief 4.2: the photos left out so far, so the boxes show them on a remount.
                leftOutPhotos: leftOutPhotosOf(state)
            };
        case CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS:
            return { evidenceBundle: state.evidenceBundle };
        case CHECKPOINT_TYPES.ARC_SELECTION:
            // Brief 4.5: the story meeting (lib/meeting.js meetingCheckpointData): the weave,
            // the verdict as the parse holds it, the questions with any answers, a code check
            // still failing on the weave in hand, the concerns beside their lines, the marks
            // after a round, the edits a send-back changed, the standing notes, the round
            // counters and a round that did not run. Brief 1.2: evidenceIndex names each
            // receipt's document.
            return meetingCheckpointData(state, {
                evidenceIndex: buildEvidenceIndex(state.evidenceBundle),
                maxRevisions: REVISION_CAPS.ARCS
            });
        case CHECKPOINT_TYPES.OUTLINE:
            // Brief 4.6: the map (lib/map.js mapCheckpointData): the map, the theme's slots,
            // the settled story, Everyone and the counts, a check still failing on the map in
            // hand, the concerns beside their lines, the edits a send-back changed, the
            // standing notes, the round's note and counters. No judge reads the map and the
            // map writer asks nothing, so the stop sends no evaluation and no questions.
            // Brief 2.7: the automatic passes of this round, with what each changed.
            return {
                ...mapCheckpointData(state, {
                    keptPhotos: keptPhotoFilenames(state, state.outline && state.outline.topPhoto),
                    maxRevisions: REVISION_CAPS.OUTLINE
                }),
                trace: traceForStop(state._outlineTrace, state.outline, diffOutline, (state.humanOutlineRevisionCount || 0) + 1)
            };
        case CHECKPOINT_TYPES.ARTICLE:
            return {
                contentBundle: state.contentBundle,
                articleHtml: state.assembledHtml,
                htmlPreview: await renderArticlePreview(state),
                // Task 4.3b: whether the page prints the writer's money tracker, by the page's own
                // rule, so the desk knows from the start; each preview keeps it current.
                writerTrackerPrints: writerTrackerPrints(state.contentBundle, state.shellAccounts),
                sessionPhotos: state.sessionPhotos,
                factCheck: state._articleFactCheck || null,
                lastEvaluation: lastEvaluationFor(state.evaluationHistory, 'article'),
                evaluationHistory: state.evaluationHistory,
                sessionId: state.sessionId,
                revisionCount: state.articleRevisionCount || 0,
                humanRevisionCount: state.humanArticleRevisionCount || 0,
                maxRevisions: REVISION_CAPS.ARTICLE,
                previousFeedback: state._articleFeedback || null,
                handEditReport: handEditReportOf(state._articleHandEditReport),   // F1, as at the outline stop
                directorGateNotes: state.directorGateNotes || [],
                outlineThesis: outlineThesisOf(state),
                // Brief 2.7: the automatic passes of this round, with what each changed.
                trace: traceForStop(state._articleTrace, state.contentBundle, diffBundle, (state.humanArticleRevisionCount || 0) + 1),
                // Brief 3.7: the article writer's questions for the director (C15)
                writerQuestions: writerQuestionsOf(state.contentBundle?.writerQuestions)
            };
        case CHECKPOINT_TYPES.PRE_CURATION:
            return {
                preCurationSummary: state.preCurationSummary,
                preprocessedEvidence: state.preprocessedEvidence
            };
        default:
            return {};
    }
}

/**
 * Is `p` a directory that exists? (v2 I1)
 *
 * `fs.existsSync` is TRUE for a FILE, and both photos-path entry points used it.
 * A director who pastes the path of a photograph instead of the folder holding it
 * (typed/pasted paths are the documented route for anything outside `data/` —
 * Browse is in `directory` mode) therefore passed both gates, passed
 * `fetchSessionPhotos`'s `fs.access`, and died on `fs.readdir`'s ENOTDIR AFTER the
 * paid arc analysis, with a raw scandir error instead of the recovery sentence.
 *
 * @param {string} p
 * @returns {boolean}
 */
function isDirectory(p) {
    try { return fs.statSync(p).isDirectory(); } catch { return false; }
}

/**
 * Sanitize and validate a photos folder supplied over the API (v2 I1).
 *
 * The same chain at both entry points (`POST /start` and the `photos`-gate arm of
 * `buildResumePayload`): strip a pasted path's quotes and surrounding whitespace,
 * `path.resolve` so `state.photosPath` holds an absolute path like the gate's own
 * `defaultDir` (the process cwd is not guaranteed to be the same after a
 * rollback), then refuse anything that is not a directory on disk.
 *
 * The caller owns the ERROR TEXT it shows: `/start` appends the "leave it blank"
 * alternative, which is not an option at the gate itself.
 *
 * @param {string} raw - the caller's path
 * @returns {{path: string|null, error: string|null}}
 */
function sanitizePhotosPath(raw) {
    const resolved = path.resolve(raw.trim().replace(/^["']|["']$/g, ''));
    if (!isDirectory(resolved)) {
        return { path: null, error: `Photos directory not found or not a directory: ${resolved}` };
    }
    return { path: resolved, error: null };
}

/**
 * Append one director gate note (spec 2026-09-19 §5.2). The channel is a REPLACE
 * channel, so this writes the full array; buildResumePayload has the current state
 * and the per-session lock rules out a concurrent writer. `round` counts the
 * SURVIVING notes for the gate, so it restarts after a pruning rollback.
 *
 * Phase 1 brief 1.1: `kind` is the caller's, not a constant. The note box at a stop
 * is sent with whatever the director presses, so one stop can hold both an approval
 * note and a rejection note, and `round` counts per gate AND kind so the two series
 * do not share numbers ([outline, approval 1] and [outline, rejection 1] coexist).
 *
 * @param {string} kind - 'rejection' (sent with a send back) or 'approval' (sent with an approve)
 */
function appendGateNote(stateUpdates, currentState, gate, text, kind) {
    const existing = Array.isArray(currentState.directorGateNotes)
        ? currentState.directorGateNotes.filter(n => n && typeof n === 'object')
        : [];
    const round = existing.filter(n => n.gate === gate && (n.kind || 'rejection') === kind).length + 1;
    stateUpdates.directorGateNotes = [...existing, { gate, kind, round, text, at: new Date().toISOString() }];
}

/**
 * The per-photo descriptions a character-IDs approval carries (phase 2, brief 2.2).
 *
 * `{filename: text}`. Blank descriptions are dropped (the director left the box
 * empty); every other value is the director's text trimmed at the ends, nothing
 * else. Anything that is not an object of strings is refused, so a malformed
 * payload never reaches a writer as the director's words.
 *
 * @param {*} value - approvals.photoDescriptions
 * @returns {{map: Object|null, error: string|null}} map is null when nothing was described
 */
function normalizePhotoDescriptions(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { map: null, error: 'photoDescriptions must be an object of photo filename -> description text' };
    }
    const map = {};
    for (const [filename, text] of Object.entries(value)) {
        if (typeof text !== 'string') {
            return { map: null, error: `photoDescriptions["${filename}"] must be a string` };
        }
        const name = String(filename).trim();
        if (name && text.trim()) map[name] = text.trim();
    }
    return { map: Object.keys(map).length > 0 ? map : null, error: null };
}

/**
 * The refusal for a structured character-IDs answer that does not hold mappings, or null
 * (task 4.3c). The answer is an object of photo filename -> mapping object, as the parse
 * and the console's payloads write it; an empty one is the stop's Skip. A value that is
 * text or a list would sit in the mappings where photoMappingOf passes it over, and the
 * photo's identifications and exclusion would go unread.
 *
 * @param {*} value - approvals.characterIds
 * @returns {string|null}
 */
function characterIdsRefusal(value) {
    const isMapping = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
    if (!isMapping(value)) return 'characterIds must be an object of photo filename -> mapping';
    const key = Object.keys(value).find((k) => !isMapping(value[k]));
    return key === undefined ? null : `characterIds["${key}"] must be a mapping object`;
}

/**
 * What a send-back records its edits with (FA, requirement 9): the roster's names, so a
 * cut or a rewrite records which of them the director's version no longer names, and a
 * roster gap is blamed on the director only for those. Nothing when there is no roster.
 *
 * @param {object} currentState
 * @returns {{names?: string[]}}
 */
function sendBackRecordOptions(currentState) {
    const names = rosterNames(currentState.sessionConfig && currentState.sessionConfig.roster);
    return names.length > 0 ? { names } : {};
}

/**
 * The refusal for an article approve whose page would print a photo the session's photos
 * folder lacks, or null (FA, requirement 12). The photos are publish's own: each printed
 * filename that is not a file inside the folder, a name that leads outside it included
 * (lib/publish-photos.js missingPrintedPhotos), so this asks before the director leaves
 * the stop. Without a session id nothing is checked: publish copies no photo then either.
 *
 * @param {object|null} bundle - the bundle the approve would publish
 * @param {string} theme
 * @param {string|undefined} sessionId
 * @param {string} dataDir - the folder that holds each session's data/<id>/
 * @returns {string|null}
 */
function printedPhotosRefusal(bundle, theme, sessionId, dataDir) {
    if (!sessionId) return null;
    const photosDir = path.join(dataDir, String(sessionId), 'photos');
    const missing = missingPrintedPhotos(bundle || {}, theme === 'detective' ? 'detective' : 'journalist', photosDir);
    if (missing.length === 0) return null;
    const one = missing.length === 1;
    return `The article prints ${missing.map((f) => `"${f}"`).join(', ')}, which ${one ? 'is' : 'are'} not in the session's photos folder (${photosDir}). ` +
        `Put ${one ? 'it' : 'them'} in that folder, or take ${one ? 'it' : 'them'} out of the article, then approve again.`;
}

/** Schema-check a director's edited object the same way the approve path does. */
function validateEdits(schemaName, edits, noun) {
    const { valid, errors } = outlineValidator.validate(schemaName, edits);
    if (valid) return null;
    const detail = (errors || []).map(function (e) { return (e.path || '/') + ' ' + e.message; }).join('; ');
    return 'Edited ' + noun + ' failed schema validation (' + schemaName + '): ' + detail;
}

/**
 * The keys with which each stop other than the story meeting is approved or sent back
 * (brief 4.5b): the story meeting refuses a request that carries one (meetingOnlyRefusal).
 * Each of their arms in buildResumePayload writes the resume its own stop reads, and the
 * meeting's stop reads `{approved: true}` as its own approval. The photos folder is not
 * among them: at the meeting it rides along with the meeting's own action
 * (PHOTOS_PATH_GATES), and alone it approves nothing there.
 */
const OTHER_STOPS_APPROVAL_KEYS = Object.freeze([
    'inputReview', 'selectedPaperEvidence', 'roster', 'fullContext', 'preCuration',
    'evidenceBundle', 'characterIdsRaw', 'characterIds', 'outline', 'article'
]);

/**
 * The refusal for a request posted while the thread is paused at the story meeting that
 * carries another stop's approval key, or null (brief 4.5b). The meeting is approved only by
 * its own action: a stale console tab's `{outline: true}` approved it with no weave, no
 * edits and no note, and wrote the approved weave the readout takes as the director's
 * settled story.
 *
 * @param {object} approvals - the request body
 * @returns {string|null}
 */
function meetingOnlyRefusal(approvals) {
    const carried = Object.keys(approvals || {}).filter((key) => OTHER_STOPS_APPROVAL_KEYS.includes(key) && approvals[key] !== undefined);
    if (carried.length === 0) return null;
    const keys = carried.length > 1 ? `${carried.slice(0, -1).join(', ')} and ${carried[carried.length - 1]}` : carried[0];
    return 'The thread is paused at the story meeting (arc-selection), which takes only its own action: ' +
        '{meeting: "approve" | "reweave" | "send-back", weave, note}. ' +
        `This request carries ${keys}, ${carried.length > 1 ? "other stops' approvals" : "another stop's approval"}. ` +
        'Reload the console to act at the story meeting.';
}

/**
 * Build resume payload from approval decisions (DRY helper)
 * Used by /api/session/:id/approve endpoint with Command({ resume })
 *
 * Returns a payload that will be passed to graph.invoke(new Command({ resume: payload }))
 * The payload becomes the return value of interrupt() in the paused node.
 *
 * @param {object} approvals - Approval decisions from request body
 * @param {object} currentState - Current graph state values (theme default + rawSessionInput merge)
 * @param {string} [theme]
 * @param {string|null} [checkpointType] - The interrupt's `type` (CHECKPOINT_TYPES value).
 *   I3: some approval shapes are only meaningful at one gate. `{photosPath}` posted at
 *   `outline`/`article`/`arc-selection` used to count as a valid approval whose resume
 *   value was neither an approve nor a reject-with-feedback, which routes straight into
 *   a PAID revision loop. Gate those shapes on the type. Brief 4.5b: at the story meeting
 *   (`arc-selection`) only the meeting's own arm is taken, and another stop's approval key
 *   is refused (meetingOnlyRefusal).
 * @param {object} [options]
 * @param {string} [options.dataDir] - the folder holding each session's data/<id>/ (default
 *   the server's data/); the article approve checks the printed photos against its
 *   <id>/photos (FA, requirement 12)
 * @returns {object} - { resume: payload for Command, stateUpdates: direct state updates, error: validation error or null }
 */
function buildResumePayload(approvals, currentState = {}, theme = (currentState.theme || 'journalist'), checkpointType = null, { dataDir = DATA_DIR } = {}) {
    const resume = {};
    const stateUpdates = {};
    let error = null;
    let validApprovalDetected = false;

    // Brief 4.5b: while the thread is paused at the story meeting, only the meeting's own
    // arm is taken (4.5's guard, I3, the other way round). Refused before any arm runs, so
    // nothing is written.
    if (checkpointType === CHECKPOINT_TYPES.ARC_SELECTION) {
        const refusal = meetingOnlyRefusal(approvals);
        if (refusal) return { resume: {}, stateUpdates: {}, error: refusal };
    }

    // Input review: approve the parse, or reject it with written corrections (B2/B8).
    //
    // `inputEdits` is gone: it wrote a `_inputEdits` state key that was never an
    // Annotation channel (LangGraph drops undeclared keys) and that no node read.
    // A reject sends the director's prose corrections back through interrupt();
    // checkpointInputReview stores them as _inputCorrections and routes the graph
    // back to parseRawInput, which appends them to every parse prompt.
    if (approvals.inputReview === true) {
        validApprovalDetected = true;
        resume.approved = true;
    } else if (approvals.inputReview === false && typeof approvals.inputFeedback === 'string' && approvals.inputFeedback.trim()) {
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.inputFeedback.trim();
    }

    // Paper evidence selection (Commit 8.9.4)
    if (approvals.selectedPaperEvidence && Array.isArray(approvals.selectedPaperEvidence)) {
        validApprovalDetected = true;
        stateUpdates.selectedPaperEvidence = approvals.selectedPaperEvidence;
        resume.selectedPaperEvidence = approvals.selectedPaperEvidence;
    }

    // Character ID mappings (Commit 8.9.5, 8.9.x) - two input formats supported
    if (approvals.characterIdsRaw && typeof approvals.characterIdsRaw === 'string') {
        validApprovalDetected = true;
        stateUpdates.characterIdsRaw = approvals.characterIdsRaw;
        resume.characterIdsRaw = approvals.characterIdsRaw;
    } else if (approvals.characterIds !== undefined) {
        // Task 4.3c: the structured form holds one mapping object per photo, refused
        // otherwise with the key at fault; {} is the stop's Skip.
        const refusal = characterIdsRefusal(approvals.characterIds);
        if (refusal) {
            return { resume, stateUpdates, error: refusal };
        }
        validApprovalDetected = true;
        stateUpdates.characterIdMappings = approvals.characterIds;
        resume.characterIdMappings = approvals.characterIds;
        // Brief 4.2b: the structured form (the stop's Skip) carries no text, so it clears
        // the raw text beside the mappings and the parse takes its no-text path: the boxes
        // decide for every photo. characterIdsRaw survives a rollback to this stop
        // (ROLLBACK_CLEARS_EXEMPT), and the parse would otherwise read the earlier round's
        // text again, a paid call whose identifications and exclusions come back on photos
        // whose box is clear. The update carries the clear, because the stop skips on its
        // mappings.
        stateUpdates.characterIdsRaw = null;
    }
    // Brief 2.2: the director's description of each photo, keyed by filename, sent
    // beside the IDs. Never an approval on its own. Kept word for word (trimmed at the
    // ends); checkpointCharacterIds re-captures it and writes the session folder copy.
    if (approvals.photoDescriptions !== undefined
        && (stateUpdates.characterIdsRaw !== undefined || stateUpdates.characterIdMappings !== undefined)) {
        const described = normalizePhotoDescriptions(approvals.photoDescriptions);
        if (described.error) {
            return { resume, stateUpdates, error: described.error };
        }
        if (described.map) {
            stateUpdates.photoDescriptions = described.map;
            resume.photoDescriptions = described.map;
        }
    }
    // Brief 4.2: the leave-out box. The stop sends the filenames whose "leave this photo
    // out" box is ticked, beside the descriptions; never an approval on its own. For every
    // photo the stop showed, the box decides the list (lib/photo-leave-out.js), and the
    // parse then writes each choice into the photo's mapping, which isPhotoExcluded reads
    // first. The list goes through the update as well as the resume: on the structured
    // form the stop skips on its mappings and captures nothing.
    if (approvals.leftOutPhotos !== undefined
        && (stateUpdates.characterIdsRaw !== undefined || stateUpdates.characterIdMappings !== undefined)) {
        const chosen = listAfterStopChoices(currentState, approvals.leftOutPhotos);
        if (chosen.error) {
            return { resume, stateUpdates, error: chosen.error };
        }
        stateUpdates.leftOutPhotos = chosen.list;
        resume.leftOutPhotos = chosen.list;
    }

    // Evidence bundle approval with rescue mechanism (Commit 8.10+)
    if (approvals.evidenceBundle === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.rescuedItems && Array.isArray(approvals.rescuedItems) && approvals.rescuedItems.length > 0) {
            // Validate: filter to non-empty strings only
            const validItems = approvals.rescuedItems.filter(item =>
                typeof item === 'string' && item.trim().length > 0
            );

            if (validItems.length > 0) {
                stateUpdates._rescuedItems = validItems;
                resume.rescuedItems = validItems;
            }
        }
    }

    // The story meeting (phase 4, brief 4.5): `{meeting: 'approve' | 'reweave' | 'send-back',
    // weave, note}`. lib/meeting.js meetingResume holds the weave to the director-side
    // schema, refusing a malformed one with its reason, and writes the director's version
    // and their standing edits; a reweave and a send-back are the director's round, marked.
    // The note joins the standing notes: an approval note on an approve (the arc
    // selection's _outlineGuidance is written no more), a rejection note on a round. Taken
    // only at the meeting's own stop (I3): `{approved: true}` posted at another stop would
    // approve that stop. The arc selection's old shape is refused by name.
    if (approvals.meeting !== undefined) {
        if (checkpointType !== null && checkpointType !== CHECKPOINT_TYPES.ARC_SELECTION) {
            return { resume: {}, stateUpdates: {}, error: `The story meeting's actions are taken at the story meeting (arc-selection), not at ${checkpointType}.` };
        }
        const meeting = meetingResume(approvals, currentState, sendBackRecordOptions(currentState));
        if (meeting.error) return { resume: {}, stateUpdates: {}, error: meeting.error };
        validApprovalDetected = true;
        Object.assign(resume, meeting.resume);
        Object.assign(stateUpdates, meeting.stateUpdates);
        if (meeting.note) appendGateNote(stateUpdates, currentState, 'arc-selection', meeting.note.text, meeting.note.kind);
    } else if (['selectedArcs', 'arcFeedback', 'outlineGuidance'].some((key) => approvals[key] !== undefined)) {
        return {
            resume: {}, stateUpdates: {},
            error: 'The arc selection is gone: the story meeting takes {meeting: "approve" | "reweave" | "send-back", weave, note}.'
        };
    }

    // The map (phase 4, brief 4.6): `{outline: 'approve' | 'send-back', map, note}`.
    // lib/map.js mapResume holds the map to the director-side schema, refusing a malformed
    // one with its reason, and writes the director's version, their standing edits against
    // the writer's last map and the hero, its top photo; a send-back is the director's round,
    // with its note. The note joins the standing notes: an approval note on an approve, a
    // rejection note on a send-back. Taken only at the map's own stop (I3). The old outline
    // payload (`outline: true | false`, outlineEdits, outlineFeedback, outlineNote) is refused
    // by name.
    if (approvals.outline !== undefined || ['outlineEdits', 'outlineFeedback', 'outlineNote'].some((key) => approvals[key] !== undefined)) {
        if (checkpointType !== null && checkpointType !== CHECKPOINT_TYPES.OUTLINE) {
            return { resume: {}, stateUpdates: {}, error: `The map's actions are taken at the map (outline), not at ${checkpointType}.` };
        }
        const map = mapResume(approvals, currentState, { theme, ...sendBackRecordOptions(currentState) });
        if (map.error) return { resume: {}, stateUpdates: {}, error: map.error };
        validApprovalDetected = true;
        Object.assign(resume, map.resume);
        Object.assign(stateUpdates, map.stateUpdates);
        if (map.note) appendGateNote(stateUpdates, currentState, 'outline', map.note.text, map.note.kind);
    }

    // Article: approve, approve-with-edits, or reject-with-feedback
    if (approvals.article === true) {
        validApprovalDetected = true;
        resume.approved = true;
        if (approvals.articleEdits && typeof approvals.articleEdits === 'object') {
            // B6: mirror the outline gate. An unvalidated hand-edit reached
            // validateContentBundle, which routes a bad bundle straight to END --
            // after ten checkpoints and five-plus Opus calls, with Retry failing
            // identically and rollback discarding the approved draft.
            error = validateEdits('content-bundle', approvals.articleEdits, 'article');
            if (error) return { resume, stateUpdates, error };
        }
        // FA (requirement 12; final review of the photos, finding 1): every photo the page
        // will print must be in data/<id>/photos. Refused here, with the filename, while
        // the article stop is still open: past it, publish's throw (its backstop) leaves
        // only a rollback, which regenerates the article and loses the director's desk.
        const photoRefusal = printedPhotosRefusal(
            approvals.articleEdits && typeof approvals.articleEdits === 'object' ? approvals.articleEdits : currentState.contentBundle,
            theme, currentState.sessionId, dataDir
        );
        if (photoRefusal) return { resume: {}, stateUpdates: {}, error: photoRefusal };
        if (approvals.articleEdits && typeof approvals.articleEdits === 'object') {
            stateUpdates.contentBundle = approvals.articleEdits;
        }
        // Phase 1 brief 1.1: as at the outline stop — the note box is sent with the
        // approve, and stands as an 'approval' note for any writer a later rollback
        // puts in front of it. AFTER the edit validation. Blank appends nothing.
        if (typeof approvals.articleNote === 'string' && approvals.articleNote.trim()) {
            appendGateNote(stateUpdates, currentState, 'article', approvals.articleNote.trim(), 'approval');
        }
    } else if (approvals.article === false && typeof approvals.articleFeedback === 'string' && approvals.articleFeedback.trim()) {
        const hasEdits = approvals.articleEdits && typeof approvals.articleEdits === 'object';
        if (hasEdits) {
            error = validateEdits('content-bundle', approvals.articleEdits, 'article');
            if (error) return { resume, stateUpdates, error };
        }
        validApprovalDetected = true;
        resume.approved = false;
        resume.feedback = approvals.articleFeedback.trim();
        stateUpdates._articleFeedback = resume.feedback;
        appendGateNote(stateUpdates, currentState, 'article', resume.feedback, 'rejection');
        // F1: as at the outline stop, the director's edits stand across every send-back.
        stateUpdates._articleHandEdits = standingAfterSendBack(currentState._articleHandEdits, currentState.contentBundle,
            hasEdits ? approvals.articleEdits : currentState.contentBundle, 'bundle', sendBackRecordOptions(currentState));
        stateUpdates._articleHandEditReport = null;
        stateUpdates._articleTrace = null;   // brief 2.7: a new round starts an empty trace
        if (hasEdits) {
            stateUpdates.contentBundle = approvals.articleEdits;   // incrementArticleRevision hands it to the reviser
        }
    }

    // Pre-curation approval (Phase 4f)
    if (approvals.preCuration === true) {
        validApprovalDetected = true;
        stateUpdates.preCurationApproved = true;
        resume.preCurationApproved = true;
    }

    // Await roster checkpoint (Parallel branch architecture)
    // User provides roster to enable character ID mapping.
    // F1 (CR-1): pronouns captured alongside the roster MUST ride along on both
    // the Command resume AND the direct state update, or every character defaults
    // to they/them downstream (generateRosterSection.resolvePronouns).
    if (approvals.roster && Array.isArray(approvals.roster)) {
        validApprovalDetected = true;
        stateUpdates.roster = approvals.roster;
        resume.roster = approvals.roster;
        if (approvals.rosterPronouns && typeof approvals.rosterPronouns === 'object') {
            stateUpdates.rosterPronouns = approvals.rosterPronouns;
            resume.rosterPronouns = approvals.rosterPronouns;
        }
    }

    // Await full context checkpoint (Parallel branch architecture)
    // ROLL-4: full-context is now written as first-class channels (accusation/
    // sessionReport/directorNotesRaw); rawSessionInput (with photosPath from /start)
    // is left untouched so it still carries the at-start config.
    if (approvals.fullContext) {
        const { accusation, sessionReport, directorNotes } = approvals.fullContext;
        if (accusation && sessionReport && directorNotes) {
            validApprovalDetected = true;
            // ROLL-4: write first-class channels (no rawSessionInput merge). parseRawInput
            // and the checkpoint gate read these top-level.
            stateUpdates.accusation = accusation;
            stateUpdates.sessionReport = sessionReport;
            stateUpdates.directorNotesRaw = directorNotes;
            // Clear the parse these inputs replace. loadDirectorNotes rehydrates
            // sessionConfig/directorNotes from data/<id>/inputs/*.json on any replay
            // where directorNotes is null (a forced Start Fresh of a reused id, a
            // rollback to await-full-context), and parseRawInput skips whenever
            // sessionConfig is populated. The interrupted node re-executes with this
            // update already applied, so the gate's own capture branch never runs on
            // the API path: the re-parse trigger has to ride on the update itself
            // (operator gate 2026-09-19; plan-review-v2 I3).
            stateUpdates.sessionConfig = null;
            stateUpdates.directorNotes = null;
            stateUpdates.playerFocus = null;
            resume.fullContext = approvals.fullContext;
        }
    }

    // Photos folder (photo late-join).
    //
    // WHERE THE STATE WRITE IS ACCEPTED (v2 M2): the three gates at or before the
    // fetch. evidence-and-photos and arc-selection carry it as a convenience, so a
    // director whose photos are already clean is not stopped later. It is NOT
    // accepted at character-ids, outline or article: those run AFTER
    // fetchSessionPhotos has already scanned sessionPhotos from some other value,
    // so the write would only make state lie about where the photos came from.
    //
    // WHERE IT IS AN APPROVAL (I3): `photos` only. Posted alone at
    // outline/article/arc-selection, its resume value is neither an approve nor a
    // reject-with-feedback, and that routes straight into a PAID revision loop
    // (checkpointOutline -> routeAfterOutlineCheckpoint -> incrementOutlineRevision
    // -> reviseOutline).
    const PHOTOS_PATH_GATES = [
        CHECKPOINT_TYPES.EVIDENCE_AND_PHOTOS,
        CHECKPOINT_TYPES.ARC_SELECTION,
        CHECKPOINT_TYPES.PHOTOS
    ];
    if (PHOTOS_PATH_GATES.includes(checkpointType)
        && typeof approvals.photosPath === 'string' && approvals.photosPath.trim()) {
        // v2 C1: refuse a folder that is not there, HERE. fetchSessionPhotos is the
        // backstop, but it runs after arc analysis and the console's failure card
        // can only offer a rollback to the last GATE seen, which re-pays the arcs
        // and then throws again on the same bad path (F26). v2 I1: "not there"
        // includes "is a file" — existsSync() said yes to a pasted photo path.
        const sanitized = sanitizePhotosPath(approvals.photosPath);
        if (sanitized.error) {
            error = sanitized.error;
            return { resume, stateUpdates, error };
        }
        const p = sanitized.path;
        stateUpdates.photosPath = p;
        if (checkpointType === CHECKPOINT_TYPES.PHOTOS) {
            validApprovalDetected = true;
            resume.photosPath = p;
            // v2 I2: the approval that ANSWERS the gate consumes the pre-fill stash.
            // checkpointPhotos cannot: this update is applied before the interrupted
            // node re-executes (F25), so the node skips and never runs a capture.
            stateUpdates._previousPhotosPath = null;
        }
    }

    // Whiteboard photo, added late (R1). It rides along with the full-context
    // approval or an input-review reject — the two points from which the parse
    // still runs — and is NEVER itself a valid approval. rawSessionInput is
    // EXEMPT from rollback, so this write survives one.
    const WHITEBOARD_PATH_GATES = [CHECKPOINT_TYPES.AWAIT_FULL_CONTEXT, CHECKPOINT_TYPES.INPUT_REVIEW];
    if (WHITEBOARD_PATH_GATES.includes(checkpointType)
        && typeof approvals.whiteboardPhotoPath === 'string' && approvals.whiteboardPhotoPath.trim()) {
        stateUpdates.rawSessionInput = {
            ...(currentState.rawSessionInput || {}),
            whiteboardPhotoPath: approvals.whiteboardPhotoPath.trim().replace(/^["']|["']$/g, '')
        };
    }

    if (!validApprovalDetected) {
        error = 'No valid approval detected in request';
    }

    return { resume, stateUpdates, error };
}

/**
 * Valid theme values for validation
 */
// 'journalist' = NovaNews investigative article (first-person, ~3000 words)
// 'detective' = Detective Anondono case file (third-person, ~750 words)
const VALID_THEMES = ['journalist', 'detective'];

/**
 * Themes that start no session (phase 4, brief 4.4; ruling R1). The detective theme stays
 * as the worked example of a second theme, with its skill folder, templates and theme
 * config, but it has no story meeting, map or article stage yet: a session on it would
 * break at the arc stop. `/start` refuses it up front with a message instead.
 */
const PARKED_THEMES = {
    detective: 'The detective theme is parked until it has its own files for the story meeting, the map and the article. Start this session with the journalist theme.'
};

/**
 * Session-ID contract (B1 companion).
 *
 * The session ID is the session DATE as MMDDYY, optionally with one extra digit
 * for a second session the same day. It is not a free-form label: the follow-up
 * emailer builds each player's report link from it, `data/<id>/` and
 * `outputs/report-<id>.html` are named after it, and a non-date id (071126 ->
 * "0711", "march-15") silently splits a session's artifacts across directories.
 *
 * ALLOW_NONSTANDARD_SESSION_ID=true opts out for throwaway harness runs.
 */
const SESSION_ID_PATTERN = /^\d{6}\d?$/;   // emailer contract: MMDDYY + optional session number

function isAllowedSessionId(id) {
    return SESSION_ID_PATTERN.test(id) || process.env.ALLOW_NONSTANDARD_SESSION_ID === 'true';
}

/**
 * Shape the terminal (non-interrupted) response the /approve, /resume and
 * /rollback completions deliver over SSE. ONE shaper for all three.
 *
 * H5: `outputPath` is an absolute filesystem path under outputs/.
 * The console's "View Report" button opened it directly, so the browser resolved
 * it relatively, hit the /console/* catch-all, and opened a second copy of the
 * console. `htmlUrl` is the same file as a path the browser can actually GET --
 * outputs/ is served by the root static mount and is not denied by static-guard.
 *
 * @param {object} result - graph.invoke() result
 * @param {string} sessionId
 * @param {object} [extra] - endpoint-specific fields (e.g. previousPhase)
 * @returns {object}
 */
function buildCompletionResponse(result, sessionId, extra = {}) {
    const response = { sessionId, ...extra, currentPhase: result.currentPhase };
    if (result.currentPhase === PHASES.COMPLETE) {
        response.assembledHtml = result.assembledHtml;
        response.validationResults = result.validationResults;
        response.outputPath = result.outputPath;
        response.photosCopied = result.photosCopied;
        if (result.outputPath) response.htmlUrl = '/outputs/' + path.basename(result.outputPath);
    }
    if (result.errors?.length > 0) response.errors = result.errors;
    return response;
}

/**
 * Build complete checkpoint data by merging state-based data with interrupt payload
 *
 * The interrupt() call only includes data explicitly passed to checkpointInterrupt().
 * But scripts expect full checkpoint data (e.g., CHARACTER_IDS needs sessionPhotos + sessionConfig).
 * This helper merges getCheckpointData() results with the interrupt payload.
 *
 * @param {Object} interruptData - Data from interrupt() payload (includes type)
 * @param {Object} state - Current graph state values
 * @returns {Promise<Object>} Complete checkpoint data for response
 */
async function buildCompleteCheckpointData(interruptData, state) {
    const checkpointType = interruptData?.type;
    const stateBasedData = await getCheckpointData(checkpointType, state);
    // Merge: state-based data first, then interrupt data (interrupt takes precedence)
    return { ...stateBasedData, ...interruptData };
}

const { isClaudeAvailable } = require('./lib/llm');

const app = express();
const PORT = resolvePort();   // throwaway gate servers must not collide with the director's 3001

// Server timeout: workflow steps can take several minutes
// (e.g., finalizePhotoAnalyses ~90s, preprocessEvidence ~110s)
const SERVER_TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes for long-running workflows

// SSE heartbeat interval to keep connections alive (Commit 8.16)
const SSE_HEARTBEAT_MS = 15000;

// Middleware
// SEC-6: the unauthenticated /api/auth/login surface gets a 1kb parser
// mounted BEFORE the 50mb global parser, so a pre-auth client cannot
// buffer 50mb and exhaust memory on this single-process server. Express's
// json parser is a no-op once req._body is set, so the global parser skips
// the already-parsed login body; a >1kb login body throws entity.too.large
// (413) before any handler.
app.use('/api/auth/login', express.json({ limit: '1kb' }));
app.use(express.json({ limit: '50mb' }));
// SEC (P7.8): block sensitive paths (data/, source, config, internal docs)
// before the root static mount, which is unauthenticated and would otherwise
// serve the entire repo (incl. data/checkpoints.sqlite) over the tunnel.
app.use(staticGuard);
app.use(express.static(__dirname));

// Serve console SPA
app.use('/console', express.static(path.join(__dirname, 'console')));
app.get('/console/*', (req, res) => res.sendFile(path.join(__dirname, 'console', 'index.html')));

// Session middleware for authentication.
// SECURITY (SEC-4): refuse to start without a real secret — the in-repo
// fallback let anyone forge {authenticated:true} cookies over the tunnel.
if (!process.env.SESSION_SECRET) {
    console.error(
        '\nFATAL: SESSION_SECRET is not set.\n' +
        'Generate one with:  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"\n' +
        'and add it to .env before starting the server.\n'
    );
    process.exit(1);
}

// Behind the Cloudflare tunnel the public origin is HTTPS, but Express sees
// the proxied (http) hop — trust the proxy so secure cookies are honored.
app.set('trust proxy', 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        // 'auto' = mark the cookie Secure whenever the request is HTTPS. With
        // `trust proxy` set (above) Express derives this from x-forwarded-proto,
        // so the cookie is Secure behind the tunnel and plain on http://localhost
        // dev — WITHOUT depending on NODE_ENV, which the launch scripts never set.
        secure: 'auto',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    }
}));

// Auth middleware - protects routes
function requireAuth(req, res, next) {
    if (req.session && req.session.authenticated) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized', message: 'Please log in' });
}

// Serve session photos at /sessionphotos/{sessionId}/*, mapped to data/{sessionId}/photos/*
// for the article preview's photo references. FA (requirement 13): login first. The folder
// holds every photo at full size, the excluded ones and any whiteboard included, and the
// route used to serve it to anyone over the tunnel. The console's preview loads it
// same-origin and logged in. Mounted after the session middleware, which requireAuth reads.
app.use('/sessionphotos/:sessionId', requireAuth, (req, res, next) => {
    const { sessionId } = req.params;
    const photosDir = path.join(__dirname, 'data', sessionId, 'photos');
    express.static(photosDir)(req, res, next);
});

// ===== AUTH ENDPOINTS =====

// Login endpoint - validates password
app.post('/api/auth/login', (req, res) => {
    const { password } = req.body;
    const correctPassword = process.env.ACCESS_PASSWORD;
    const ip = req.ip;

    if (!correctPassword) {
        console.warn('WARNING: ACCESS_PASSWORD not set in .env file');
        return res.status(500).json({
            success: false,
            message: 'Server configuration error'
        });
    }

    // SEC-5: refuse before checking the password if this IP is locked out.
    const gate = loginRateLimiter.check(ip);
    if (!gate.allowed) {
        const retryAfterSec = Math.ceil(gate.retryAfterMs / 1000);
        console.warn(`[${new Date().toISOString()}] Login blocked (rate limit) from ${ip}, retry in ${retryAfterSec}s`);
        res.set('Retry-After', String(retryAfterSec));
        return res.status(429).json({
            success: false,
            message: `Too many attempts. Try again in ${Math.ceil(retryAfterSec / 60)} minute(s).`,
            retryAfterMs: gate.retryAfterMs
        });
    }

    if (password === correctPassword) {
        loginRateLimiter.recordSuccess(ip);
        req.session.authenticated = true;
        console.log(`[${new Date().toISOString()}] Successful login from ${ip}`);
        res.json({
            success: true,
            message: 'Authentication successful'
        });
    } else {
        loginRateLimiter.recordFailure(ip);
        console.warn(`[${new Date().toISOString()}] Failed login attempt from ${ip}`);
        res.status(401).json({
            success: false,
            message: 'Incorrect password'
        });
    }
});

// Check auth status
app.get('/api/auth/check', (req, res) => {
    res.json({
        authenticated: !!(req.session && req.session.authenticated)
    });
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
            return res.status(500).json({
                success: false,
                message: 'Logout failed'
            });
        }
        res.json({
            success: true,
            message: 'Logged out successfully'
        });
    });
});

// ===== API ENDPOINTS (Protected) =====

// ===== SESSION STATE ENDPOINTS (8.9.7) =====
// Read-only endpoints for inspecting state without advancing workflow

/**
 * GET /api/session/:id
 * Get summary of current session state (phase, checkpoint status, counts)
 */
app.get('/api/session/:id', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        // Use graph.getState() to properly detect interrupt status
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = { configurable: { thread_id: sessionId } };
        const graphState = await graph.getState(config);

        if (!graphState || !graphState.values) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const state = graphState.values;
        const interrupted = isGraphInterrupted(graphState);
        const interruptData = interrupted ? getInterruptData(graphState) : null;

        res.json({
            sessionId,
            exists: true,
            checkpoint: {
                id: graphState.config?.configurable?.checkpoint_id,
                currentPhase: state.currentPhase,
                interrupted,
                checkpointType: interruptData?.type || null
            },
            counts: {
                memoryTokens: state.memoryTokens?.length || 0,
                paperEvidence: state.paperEvidence?.length || 0,
                sessionPhotos: state.sessionPhotos?.length || 0,
                photoAnalyses: state.photoAnalyses?.length || 0,
                // Brief 4.6: the weave's threads, where the old arc channels' count was (R4)
                threads: state.weave?.threads?.length || 0
            },
            errors: state.errors || []
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}`);
    }
});

/**
 * GET /api/session/:id/state
 * Get full state object for debugging
 */
app.get('/api/session/:id/state', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        res.json({
            sessionId,
            checkpointId: session.checkpointId,
            timestamp: session.timestamp,
            interrupted: session.interrupted,
            checkpointType: session.checkpointType,
            lastOutcome: session.lastOutcome,
            state: session.state
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/state`);
    }
});

/**
 * GET /api/session/:id/checkpoint
 * Get current checkpoint info (convenience endpoint)
 */
app.get('/api/session/:id/checkpoint', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    try {
        // Use graph.getState() to properly detect interrupt status
        const graph = createReportGraphWithCheckpointer(sharedCheckpointer);
        const config = { configurable: { thread_id: sessionId } };
        const graphState = await graph.getState(config);

        if (!graphState || !graphState.values) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const interrupted = isGraphInterrupted(graphState);
        const interruptData = interrupted ? getInterruptData(graphState) : null;

        // H1: ship the SAME payload the SSE/approve path delivers. A bare interrupt
        // payload is missing the state-based extras (e.g. CHARACTER_IDS needs
        // sessionPhotos + sessionConfig), so a session reattached through this
        // endpoint renders degraded. H2: theme, or a journalist thread is rendered
        // with whatever the console's toggle happens to say. H8: inProgress +
        // lastOutcome let a client reattach to a run instead of 409-ing blind.
        const checkpoint = interrupted
            ? await buildCompleteCheckpointData(interruptData, graphState.values)
            : null;
        res.json({
            sessionId,
            currentPhase: graphState.values.currentPhase,
            interrupted,
            checkpointType: interruptData?.type || null,
            checkpoint,
            theme: graphState.values.theme || 'journalist',
            inProgress: isSessionLocked(sessionId),
            lastOutcome: getSessionOutcome(sessionId) || null
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/checkpoint`);
    }
});

/**
 * GET /api/session/:id/progress
 * SSE endpoint for real-time progress streaming (Commit 8.16)
 *
 * Streams progress events from SDK calls to the client to prevent
 * browser timeout during long-running operations (arc analysis, etc.)
 *
 * Event format: { timestamp, context, type, elapsed, message, toolName? }
 *
 * Connection lifecycle:
 * - Client connects at session start, stays connected throughout
 * - Server sends heartbeat every SSE_HEARTBEAT_MS to keep connection alive
 * - Connection closes when client disconnects or session completes
 */
app.get('/api/session/:id/progress', requireAuth, (req, res) => {
    const { id: sessionId } = req.params;
    let connectionClosed = false;  // Guard against double cleanup

    console.log(`[${new Date().toISOString()}] SSE connected: session ${sessionId}`);

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');  // Disable nginx buffering if proxied

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

    // Heartbeat to prevent connection timeout
    const heartbeat = setInterval(() => {
        res.write(`: heartbeat\n\n`);
    }, SSE_HEARTBEAT_MS);

    // Subscribe to progress events for this session
    const unsubscribe = progressEmitter.subscribe(sessionId, (data) => {
        if (connectionClosed) return;
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        } catch (err) {
            if (connectionClosed) return;
            connectionClosed = true;
            console.error(`[SSE] Error writing to session ${sessionId}:`, err.message);
            clearInterval(heartbeat);
            unsubscribe();
            try { res.end(); } catch { /* already closed */ }
        }
    });

    // Cleanup on client disconnect
    req.on('close', () => {
        if (connectionClosed) return;
        connectionClosed = true;
        console.log(`[${new Date().toISOString()}] SSE disconnected: session ${sessionId}`);
        clearInterval(heartbeat);
        unsubscribe();
    });
});

/**
 * GET /api/session/:id/state/:field
 * Get specific state field value
 */
app.get('/api/session/:id/state/:field', requireAuth, async (req, res) => {
    const { id: sessionId, field } = req.params;

    try {
        const session = await getSessionState(sessionId);

        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }

        const hasField = Object.prototype.hasOwnProperty.call(session.state, field);

        res.json({
            sessionId,
            field,
            exists: hasField,
            value: hasField ? session.state[field] : null
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/state/${field}`);
    }
});

// Table-driven resource GET endpoints (Phase 2 - replaces 4 near-identical handlers)
const RESOURCE_ENDPOINTS = [
    { path: 'evidence', minPhase: 1.8,
      fields: state => ({ evidenceBundle: state.evidenceBundle || null }),
      check: state => !!state.evidenceBundle },
    // Brief 4.5: the story meeting's weave, as the director last left it.
    { path: 'arcs', minPhase: 2.3,
      fields: state => ({ weave: state.weave || null }),
      check: state => isWeave(state.weave) },
    // Phase 4 (brief 4.6): the map, once the map writer has returned it. The writer and its
    // rework stamp OUTLINE_GENERATION and the map checks MAP_CHECKS, on a replay too (brief
    // 4.6b), so the map reads as available at its stop on every path to it.
    { path: 'outline', minPhase: parseFloat(PHASES.OUTLINE_GENERATION),
      fields: state => ({ outline: state.outline || null }),
      check: state => !!state.outline },
    { path: 'article', minPhase: 4.2,
      fields: state => ({ contentBundle: state.contentBundle || null, articleHtml: state.assembledHtml || null }),
      check: state => !!state.contentBundle }
];

for (const endpoint of RESOURCE_ENDPOINTS) {
    app.get(`/api/session/:id/${endpoint.path}`, requireAuth, async (req, res) => {
        const { id: sessionId } = req.params;
        try {
            const session = await getSessionState(sessionId);
            if (!session) {
                return res.status(404).json({ sessionId, exists: false });
            }
            const state = session.state;
            const phaseNum = parseFloat(state.currentPhase || '0');
            res.json({
                sessionId,
                available: phaseNum >= endpoint.minPhase && endpoint.check(state),
                ...endpoint.fields(state)
            });
        } catch (error) {
            sendErrorResponse(res, sessionId, error, `GET /api/session/${sessionId}/${endpoint.path}`);
        }
    });
}

/**
 * POST /api/session/:id/article/preview
 * The desk's preview (phase 4, task 4.3; spec 2026-10-02 section 6.3): the bundle the
 * console sends, as it will print. `htmlPreview` shows the writer's draft; at the desk the
 * director sees the page as they have it. Rendered by lib/article-preview.js, as htmlPreview
 * is, with the session's theme, photo paths and ledger: the photos spaced, the ledger's
 * money tracker in place of the writer's, `<base href="/">` for the photo links. Read-only:
 * nothing is stored and no graph runs.
 *
 * Body `{contentBundle}`. Answers `{html, writerTrackerPrints}`, which tells the desk whether
 * the writer's money tracker prints at all; 400 without a bundle; 404 for a session with no
 * thread; 422 with the reason for a bundle the page cannot print, which the desk shows in
 * place of the page.
 */
app.post('/api/session/:id/article/preview', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const bundle = req.body && req.body.contentBundle;
    if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
        return res.status(400).json({ error: 'The preview needs the article as an object: {contentBundle}' });
    }
    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false });
        }
        const options = previewOptionsOf(session.state);
        let html;
        try {
            html = await articlePreviewHtml(bundle, options);
        } catch (err) {
            return res.status(422).json({ error: err.message });
        }
        res.json({ html, writerTrackerPrints: writerTrackerPrints(bundle, options.shellAccounts) });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/article/preview`);
    }
});

// ===== SESSION ACTION ENDPOINTS (8.9.7) =====

/**
 * POST /api/session/:id/start
 * Start a fresh workflow with raw session input
 */
app.post('/api/session/:id/start', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;

    if (!isAllowedSessionId(sessionId)) {
        return res.status(400).json({
            error: `Session ID must be the session date as MMDDYY (e.g. 091826), with a single extra digit for a second session the same day (e.g. 0918262). The follow-up emailer builds the report link from it. Got: ${sessionId}`
        });
    }

    const { theme = 'journalist', rawSessionInput, force } = req.body;

    // Validate theme
    if (!VALID_THEMES.includes(theme)) {
        return res.status(400).json({
            error: `Invalid theme: ${theme}. Use 'journalist'.`
        });
    }
    // R1: a parked theme starts no session, before any graph is built or state read.
    if (Object.prototype.hasOwnProperty.call(PARKED_THEMES, theme)) {
        return res.status(400).json({ error: PARKED_THEMES[theme] });
    }

    // Validate minimal required input for incremental flow.
    // Photo late-join: NOTHING but sessionId is required to start. The roster
    // arrives at await-roster, the full context at await-full-context, and the
    // photo folder at the `photos` gate AFTER arc selection — so a session can be
    // parsed, curated and arc-analysed while the photos are still being curated.
    if (!rawSessionInput) {
        return res.status(400).json({ error: 'rawSessionInput is required' });
    }

    // Sanitize photosPath when the caller gave one (a pasted path often carries
    // quotes). `delete` rather than '' so downstream reads see undefined.
    if (typeof rawSessionInput.photosPath === 'string' && rawSessionInput.photosPath.trim()) {
        // v2 C1: refuse a folder that is not there. fetchSessionPhotos is the
        // backstop, but it does not run until AFTER arc analysis, and the console's
        // failure card then offers a rollback to the last GATE seen (arc-selection),
        // which re-pays the Opus arc analysis and throws again — `photos` is not a
        // clickable step in that state (F26). v2 I1: "not there" includes "is a
        // file", which existsSync() accepted.
        const sanitized = sanitizePhotosPath(rawSessionInput.photosPath);
        if (sanitized.error) {
            return res.status(400).json({
                sessionId,
                error: `${sanitized.error}. `
                     + 'Leave the field blank to supply it at the photos step after arc selection.'
            });
        }
        rawSessionInput.photosPath = sanitized.path;
    } else {
        delete rawSessionInput.photosPath;
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/start: theme=${theme}`);

    try {
        const { graph, config } = createGraphAndConfig(sessionId, theme, {
            checkpointer: sharedCheckpointer
        });

        // C1: a thread already exists for this id. Start Fresh is the most likely
        // action after a mistake, and it is destructive: it discards the run's state
        // and re-pays for everything. Refuse unless the caller says so out loud.
        // (An unrun thread reports `values: {}` — see getSessionState.)
        const existingPhase = (await graph.getState(config))?.values?.currentPhase;
        if (existingPhase && force !== true) {
            return res.status(409).json({
                sessionId,
                error: `Session ${sessionId} already exists (phase ${existingPhase}). Start Fresh would discard its state and re-run everything. Use Resume, or POST { "force": true } to start over deliberately.`,
                currentPhase: existingPhase
            });
        }

        clearSessionOutcome(sessionId); // DEL-1: a fresh start wipes any prior run's outcome for this id

        // Clear all state fields for fresh start (C1: buildFreshStartState, NOT a
        // rollback list — buildRollbackState('input-review') preserved the photo
        // list, roster, raw context and parse, so a second start silently reused
        // them and never read the new photosPath).
        // CRITICAL: theme must be in state (not just config) because initializeSession
        // and all nodes read state.theme, which defaults to 'journalist' in the annotation.
        const initialState = { theme, rawSessionInput, ...buildFreshStartState() };
        // I2: AFTER the spread. FRESH_START_CLEARS is derived from every channel,
        // so a seed written before it would be nulled and the `photos` gate would
        // ask for the folder the director had just supplied.
        if (rawSessionInput.photosPath) {
            initialState.photosPath = rawSessionInput.photosPath;
        }
        const result = await graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT });

        // Check if graph is interrupted at a checkpoint
        const graphState = await graph.getState(config);
        const interrupted = isGraphInterrupted(graphState);

        // Build response with new interrupt format
        if (interrupted) {
            const interruptData = getInterruptData(graphState);
            const checkpointData = await buildCompleteCheckpointData(interruptData, graphState.values);
            return res.json(buildInterruptResponse(sessionId, checkpointData, result.currentPhase));
        }

        // Non-interrupted response (shouldn't happen on fresh start, but handle gracefully)
        res.json({
            sessionId,
            currentPhase: result.currentPhase
        });

    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/start`);
    }
});

/**
 * POST /api/session/:id/approve
 * Approve current checkpoint and advance workflow using Command({ resume })
 */
app.post('/api/session/:id/approve', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const approvals = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve:`, JSON.stringify(approvals));

    try {
        // Create graph and config (theme resolved from state below)
        const { graph, config } = createGraphAndConfig(sessionId, 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Check if graph is interrupted using native LangGraph pattern
        const graphState = await graph.getState(config);
        if (!graphState || !isGraphInterrupted(graphState)) {
            const stateValues = graphState?.values || {};
            if (stateValues.currentPhase === 'error' && stateValues.articleApproved === true) {
                console.log(`[${new Date().toISOString()}] Recovering from article error state for session ${sessionId}`);
                return res.status(400).json({
                    sessionId,
                    error: 'Session ended with error after article approval. Use rollback to return to article checkpoint.',
                    recoverable: true,
                    rollbackTo: 'article'
                });
            }
            return res.status(400).json({
                sessionId,
                error: 'Session is not at a checkpoint',
                currentPhase: stateValues.currentPhase || null
            });
        }

        // Resolve theme from state
        const theme = graphState.values?.theme || 'journalist';
        config.configurable.theme = theme;

        // Build resume payload from approvals (pass current state for incremental input merging)
        const { resume, stateUpdates, error: validationError } = buildResumePayload(
            approvals, graphState.values, theme, getInterruptData(graphState)?.type || null
        );
        if (validationError) {
            return res.status(400).json({ sessionId, error: validationError });
        }

        const previousPhase = graphState.values?.currentPhase;

        // Non-blocking via the shared runner: it acquires the sessionId lock (409 on a
        // second concurrent approve), returns {status:'processing'}, runs the graph in the
        // background, records the outcome, and emits the result via SSE.
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(
                new Command({ resume, update: stateUpdates }),
                { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }
            ),
            getState: () => graph.getState(config),
            buildResponse: async (result, newGraphState) => {
                if (isGraphInterrupted(newGraphState)) {
                    const interruptData = getInterruptData(newGraphState);
                    const checkpointData = await buildCompleteCheckpointData(interruptData, newGraphState.values);
                    return {
                        ...buildInterruptResponse(sessionId, checkpointData, result.currentPhase),
                        previousPhase
                    };
                }
                return buildCompletionResponse(result, sessionId, { previousPhase });
            },
            res,
            inFlightTasks,
            processingExtra: { previousPhase }
        });
    } catch (error) {
        // Only fires for an UNEXPECTED error BEFORE the runner scheduled the background task
        // (validation throw, getState throw). The runner owns the lock, so there is no lock to
        // release here. Emit an SSE completion so the console's open SSE doesn't hang.
        console.error(`[${new Date().toISOString()}] POST /api/session/${sessionId}/approve error:`, error);
        const earlyFailure = {
            sessionId,
            currentPhase: PHASES.ERROR,
            error: 'Internal server error',
            details: 'Approval operation failed. Check server logs.'
        };
        recordSessionOutcome(sessionId, buildOutcomeRecord(earlyFailure));
        progressEmitter.emitComplete(sessionId, earlyFailure);
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/approve`);
    }
});

/**
 * POST /api/session/:id/rollback
 * Rollback to a specific checkpoint
 */
app.post('/api/session/:id/rollback', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { rollbackTo, stateOverrides } = req.body;

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    // Validate rollbackTo
    if (!rollbackTo) {
        return res.status(400).json({ error: 'rollbackTo is required' });
    }
    if (!VALID_ROLLBACK_POINTS.includes(rollbackTo)) {
        return res.status(400).json({
            error: `Invalid rollbackTo: '${rollbackTo}'. Valid values: ${VALID_ROLLBACK_POINTS.join(', ')}`
        });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/rollback: rollbackTo=${rollbackTo}`);

    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        const { graph, config } = createGraphAndConfig(sessionId, session.state.theme || 'journalist', {
            checkpointer: sharedCheckpointer
        });

        // Build rollback state (synchronous setup).
        const initialState = buildRollbackState(rollbackTo);

        // ROLL-4: stash prior full-context so AwaitFullContext pre-fills re-collection
        // whenever the rollback CLEARS those channels. buildRollbackState nulls the
        // channels; capture their current values first.
        if (ROLLBACK_CLEARS[rollbackTo]?.includes('accusation')) {
            initialState._previousFullContext = {
                accusation: session.state.accusation || null,
                sessionReport: session.state.sessionReport || null,
                directorNotes: session.state.directorNotesRaw || null
            };
        }

        // v2 M1: same pattern as _previousFullContext above. ROLLBACK_CLEARS['photos']
        // nulls photosPath so the gate always re-asks (C2), and rawSessionInput is
        // EXEMPT — so without this the gate would pre-fill the ORIGINAL start-time
        // path on every rollback, i.e. the typo the director corrected at the gate.
        if (ROLLBACK_CLEARS[rollbackTo]?.includes('photosPath')) {
            initialState._previousPhotosPath = session.state.photosPath || null;
        }

        // Spec 2026-09-19 §5.4: a rollback to the story meeting or into the map and article
        // region drops the director's gate notes about content this point regenerates and
        // keeps the earlier ones (brief 4.5: its own table, STOPS_INVALIDATED_BY, apart from
        // the evaluation stubs). The points above the meeting clear the whole channel through
        // ROLLBACK_CLEARS, and the update writes nothing there.
        Object.assign(initialState, rollbackNotesUpdate(rollbackTo, session.state.directorGateNotes));

        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // DEL-1: a rolled-back session's prior TERMINAL outcome is stale the moment we
        // commit the rollback — clear it synchronously so a dropped SSE mid-rollback can't
        // surface the pre-rollback outcome via GET /state. The rollback's own completion
        // records a fresh outcome.
        clearSessionOutcome(sessionId);

        // Non-blocking: rollback re-invokes from the rollback point. Usually re-pauses fast,
        // but a rollback upstream of a long node can exceed the proxy timeouts on a held POST.
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: async (result, graphState) => {
                const interrupted = isGraphInterrupted(graphState);
                const base = interrupted
                    ? buildInterruptResponse(
                        sessionId,
                        await buildCompleteCheckpointData(getInterruptData(graphState), graphState.values),
                        result.currentPhase
                      )
                    : buildCompletionResponse(result, sessionId);
                return { ...base, rolledBackTo: rollbackTo, fieldsCleared: ROLLBACK_CLEARS[rollbackTo] };
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/rollback`);
    }
});

/**
 * POST /api/session/:id/resume
 * Resume existing workflow (re-invoke graph at current state)
 * Replaces /api/generate's resume mode
 */
app.post('/api/session/:id/resume', requireAuth, async (req, res) => {
    const { id: sessionId } = req.params;
    const { stateOverrides, force = false } = req.body || {};

    if (shuttingDown) {
        return res.status(503).json({ sessionId, error: 'Server is shutting down; retry shortly' });
    }

    console.log(`[${new Date().toISOString()}] POST /api/session/${sessionId}/resume`);

    try {
        const session = await getSessionState(sessionId);
        if (!session) {
            return res.status(404).json({ sessionId, exists: false, error: 'Session not found' });
        }

        // B9: re-invoking a COMPLETE thread replays it from START. Every checkpoint's
        // skip condition is already satisfied, so it never pauses: the whole paid
        // pipeline re-runs unattended and overwrites data/<id>/inputs/* and the
        // published report. Refuse unless the caller asked for it explicitly.
        if (session.state.currentPhase === PHASES.COMPLETE && force !== true) {
            return res.status(409).json({
                sessionId,
                currentPhase: PHASES.COMPLETE,
                error: 'Session is complete. Resuming would re-run the entire pipeline from the start (paid model calls, files overwritten). Use rollback to revisit a checkpoint, or POST { "force": true } to re-run deliberately.'
            });
        }

        const theme = session.state.theme || 'journalist';
        const { graph, config } = createGraphAndConfig(sessionId, theme, {
            checkpointer: sharedCheckpointer
        });

        const initialState = {};
        if (stateOverrides) {
            Object.assign(initialState, stateOverrides);
        }

        // Non-blocking: run graph.invoke in the background; deliver the result via SSE.
        // (A long re-invoke — e.g. generateContentBundle ~400s — used to exceed undici's
        //  5-min headersTimeout / Cloudflare's ~100s edge timeout on the held-open POST.)
        runGraphInBackground({
            sessionId,
            invoke: () => graph.invoke(initialState, { ...config, durability: 'sync', recursionLimit: RECURSION_LIMIT }),
            getState: () => graph.getState(config),
            buildResponse: async (result, graphState) => {
                if (isGraphInterrupted(graphState)) {
                    const interruptData = getInterruptData(graphState);
                    const checkpointData = await buildCompleteCheckpointData(interruptData, graphState.values);
                    return buildInterruptResponse(sessionId, checkpointData, result.currentPhase);
                }
                return buildCompletionResponse(result, sessionId);
            },
            res,
            inFlightTasks
        });
    } catch (error) {
        sendErrorResponse(res, sessionId, error, `POST /api/session/${sessionId}/resume`);
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Server running',
        timestamp: new Date().toISOString(),
        endpoints: {
            config: '/api/config (GET)',
            auth: {
                login: '/api/auth/login (POST)',
                check: '/api/auth/check (GET)',
                logout: '/api/auth/logout (POST)'
            },
            session: {
                summary: '/api/session/:id (GET)',
                state: '/api/session/:id/state (GET)',
                progress: '/api/session/:id/progress (GET SSE)',
                evidence: '/api/session/:id/evidence (GET)',
                arcs: '/api/session/:id/arcs (GET)',
                outline: '/api/session/:id/outline (GET)',
                article: '/api/session/:id/article (GET)',
                start: '/api/session/:id/start (POST)',
                approve: '/api/session/:id/approve (POST)',
                rollback: '/api/session/:id/rollback (POST)',
                resume: '/api/session/:id/resume (POST)'
            }
        }
    });
});

// Config endpoint - serves NON-SECRET client configuration (protected).
// SEC-3: NOTION_TOKEN is NEVER sent to the client — all Notion access is
// server-side (lib/notion-client.js). The console SPA does not read it.
app.get('/api/config', requireAuth, (req, res) => {
    res.json({
        notionConfigured: Boolean(process.env.NOTION_TOKEN),
        // The console enforces the same session-ID contract /start does, so it has
        // to know when the opt-out is on — otherwise it would reject a harness id
        // the route would have accepted.
        allowNonstandardSessionId: process.env.ALLOW_NONSTANDARD_SESSION_ID === 'true',
        // R1 (task 4.8): the themes /start refuses, each with the line it refuses them with,
        // so the start form says a parked theme is parked in the server's own words.
        parkedThemes: PARKED_THEMES
    });
});

// Browse local filesystem for directory/file selection (local dev tool)
app.get('/api/browse', requireAuth, async (req, res) => {
    const rawDir = req.query.dir || DATA_DIR;
    let targetDir;
    try {
        targetDir = confineToBase(DATA_DIR, sanitizePath(rawDir) || DATA_DIR);
    } catch (err) {
        return res.status(400).json({ error: 'Invalid path' });
    }

    try {
        const stat = await fs.promises.stat(targetDir);
        if (!stat.isDirectory()) {
            return res.status(400).json({ error: 'Not a directory' });
        }

        const dirents = await fs.promises.readdir(targetDir, { withFileTypes: true });
        const entries = dirents
            .filter(d => !d.name.startsWith('.'))
            .map(d => ({
                name: d.name,
                type: d.isDirectory() ? 'directory' : 'file',
                path: path.join(targetDir, d.name)
            }))
            .sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });

        const parentDir = path.dirname(targetDir);
        const atRoot = path.resolve(targetDir) === path.resolve(DATA_DIR);
        res.json({
            path: targetDir,
            parent: atRoot ? null : parentDir,
            entries
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            return res.status(404).json({ error: 'Directory not found' });
        }
        sendErrorResponse(res, null, err, 'GET /api/browse');
    }
});

// Serve individual files by absolute path (for photo thumbnails in console)
app.get('/api/file', requireAuth, (req, res) => {
    const raw = sanitizePath(req.query.path || '');
    if (!raw) return res.status(400).json({ error: 'Missing path parameter' });
    let filePath;
    try {
        filePath = confineToBase(DATA_DIR, raw);
    } catch (err) {
        return res.status(400).json({ error: 'Invalid path' });
    }
    res.sendFile(filePath, (err) => {
        if (err && !res.headersSent) {
            res.status(err.status || 404).json({ error: 'File not found' });
        }
    });
});

// Redirect root to console SPA
app.get('/', (req, res) => {
    res.redirect('/console');
});

/**
 * Notion reachability + auth startup probe.
 * One lightweight authenticated GET; returns {ok, error} instead of throwing so the
 * startup IIFE can render a single loud failure card (mirrors isClaudeAvailable).
 * @param {{request: Function}} client - a NotionClient (injected for testing)
 */
async function probeNotionReachable(client) {
    try {
        await client.request('users/me');
        return { ok: true };
    } catch (error) {
        return { ok: false, error: error.message };
    }
}

// Body-size / malformed-JSON guard (SEC-6): return a clean 413/400 instead
// of leaking a stack trace for oversized or malformed request bodies.
app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request body too large' });
    }
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Malformed JSON body' });
    }
    return next(err);
});

// Start server with Claude Agent SDK health check
// Only start in normal runtime (not during tests)
if (require.main === module) {
(async () => {
    console.log('Checking Claude Agent SDK availability...');
    const claudeAvailable = await isClaudeAvailable();

    if (!claudeAvailable) {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Claude Agent SDK not available                    ║
║                                                           ║
║  The Claude Agent SDK is required for report generation.  ║
║  Please ensure:                                           ║
║    1. Dependencies installed: npm install                 ║
║    2. Claude Code authenticated: claude /login            ║
║                                                           ║
║  Server startup aborted.                                  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }

    console.log('Claude Agent SDK available ✓');

    // Notion-reachability probe — fail loud at startup, not per-session.
    console.log('Checking Notion reachability...');
    const { NotionClient } = require('./lib/notion-client');
    if (!process.env.NOTION_TOKEN) {
        console.error('ERROR: NOTION_TOKEN is not set. Notion fetches will fail. Aborting startup.');
        process.exit(1);
    }
    const notionProbe = await probeNotionReachable(new NotionClient(process.env.NOTION_TOKEN));
    if (!notionProbe.ok) {
        console.error(`
╔═══════════════════════════════════════════════════════════╗
║  ERROR: Notion not reachable                              ║
║                                                           ║
║  ${String(notionProbe.error).slice(0, 53).padEnd(53)}║
║                                                           ║
║  Check NOTION_TOKEN validity and network access.          ║
║  Server startup aborted.                                  ║
╚═══════════════════════════════════════════════════════════╝
        `);
        process.exit(1);
    }
    console.log('Notion reachable ✓');

    // Validate theme files at startup (Commit 8.18)
    console.log('Validating theme files...');
    sharedPromptBuilder = createPromptBuilder();
    const themeValidation = await sharedPromptBuilder.theme.validate();
    if (!themeValidation.valid) {
        console.warn(`[startup] Missing theme files: ${themeValidation.missing.join(', ')}`);
    } else {
        console.log(`Theme files validated (${sharedPromptBuilder.theme.cache.size} cached) ✓`);
    }

    // SEC-A-3: bind loopback only — the Cloudflare tunnel (→ localhost) is the
    // sole remote ingress. Prevents a direct-LAN client from spoofing
    // X-Forwarded-For (trusted via `trust proxy`, Task 7.3) to rotate req.ip and
    // evade the SEC-5 login rate-limiter. Console is reachable via the public
    // tunnel URL or http://localhost:3001 — NOT via the host's LAN IP.
    httpServer = app.listen(PORT, '127.0.0.1', () => {
        console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║         ALN Director Console - Server Running            ║
║                                                           ║
║  Local Access:    http://localhost:${PORT}                   ║
║                                                           ║
║  Share with teammates:                                    ║
║  - Local network: http://[your-ip]:${PORT}                   ║
║  - Internet:      Use cloudflared or ngrok               ║
║                                                           ║
║  Using Claude Agent SDK via LangGraph workflow            ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
        `);
        console.log('Press Ctrl+C to stop\n');
    });

    // Configure server timeouts (default 2min is too short for workflow steps)
    httpServer.timeout = SERVER_TIMEOUT_MS;
    httpServer.requestTimeout = SERVER_TIMEOUT_MS;  // Node 18+ default is 5min, we need 20min
    httpServer.keepAliveTimeout = SERVER_TIMEOUT_MS;
    httpServer.headersTimeout = SERVER_TIMEOUT_MS + 1000; // Must be > keepAliveTimeout
})();
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\nShutting down gracefully...');
    shuttingDown = true; // refuse new /approve resumes (DUR-2)
    try {
        if (inFlightTasks.size > 0) {
            console.log(`Draining ${inFlightTasks.size} in-flight task(s)...`);
        }
        await drainAndClose({
            inFlight: inFlightTasks,
            checkpointer: sharedCheckpointer,
            server: httpServer
        });
        console.log('Drained in-flight work; closed checkpointer + server.');
    } catch (err) {
        console.warn('Drain/close error:', err.message);
    }
    // Close cached Notion client (SQLite connection)
    try {
        const { resetCachedNotionClient } = require('./lib/cache');
        resetCachedNotionClient();
        console.log('Closed cache connections.');
    } catch (err) {
        console.warn('Cache cleanup skipped:', err.message);
    }
    process.exit(0);
});

// Export helpers for testing. `app` is exported so integration tests can boot the
// real route table over http (listen() stays behind the require.main guard above).
module.exports = { app, isAllowedSessionId, buildResumePayload, getCheckpointData, buildCompleteCheckpointData, RESOURCE_ENDPOINTS, buildCompletionResponse, drainAndClose, _inFlight: inFlightTasks, probeNotionReachable, getSessionOutcome, shapeSessionState, resolveCheckpointDbPath, resolvePort, CHECKPOINT_DB_PATH, PORT };
