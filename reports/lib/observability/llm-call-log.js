/**
 * lib/observability/llm-call-log.js — per-call prompt/response log (spec 2026-09-19 §3).
 *
 * One JSON file per model call under <root>/<sessionId>/llm-log/, written on
 * llm_start (so a crash mid-call still leaves the prompt) and rewritten on
 * llm_complete / llm_error with the response, diagnostics and timings, plus one
 * line per completion in index.jsonl. Keyed by the client's `callId`.
 *
 * Never throws into the pipeline: every fs call is wrapped, the first failure per
 * process warns once, later failures are silent.
 *
 * Disabled under Jest (JEST_WORKER_ID) unless a test calls setLogRoot(), so the
 * bridge's own tests never write into data/. LLM_CALL_LOG_DIR overrides the root.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_ROOT = path.resolve(__dirname, '..', '..', 'data');
const LOGGED_TYPES = new Set(['llm_start', 'llm_complete', 'llm_error']);

let logRoot = process.env.LLM_CALL_LOG_DIR || null;
let explicitlyEnabled = false;
let warned = false;
const inFlight = new Map(); // callId -> { file, record }

function setLogRoot(dir) {
  logRoot = dir;
  explicitlyEnabled = true;
  inFlight.clear();
  warned = false;
}

function _resetForTests() {
  logRoot = process.env.LLM_CALL_LOG_DIR || null;
  explicitlyEnabled = false;
  warned = false;
  inFlight.clear();
}

function isEnabled() {
  if (process.env.JEST_WORKER_ID && !explicitlyEnabled) return false;
  return true;
}

function resolveLogDir(sessionId) {
  return path.join(logRoot || DEFAULT_ROOT, String(sessionId), 'llm-log');
}

function sanitize(s) {
  return String(s || 'call').replace(/[^A-Za-z0-9_-]/g, '_');
}

/** UTC YYYYMMDD-HHMMSS from an ISO timestamp (or now). */
function stamp(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

function shortId(callId) {
  return String(callId).replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'nocallid';
}

function warnOnce(err, where) {
  if (warned) return;
  warned = true;
  console.warn(`[llm-call-log] disabled after a write failure at ${where}: ${err && (err.code || err.message)}`);
}

function writeJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

function diagnosticsOf(msg) {
  return {
    channel: msg.channel ?? null,
    stopReason: msg.stopReason ?? null,
    durationApiMs: msg.durationApiMs ?? null,
    numTurns: msg.numTurns ?? null,
    usage: msg.usage ?? null,
    apiErrorStatus: msg.apiErrorStatus ?? null,
    terminalReason: msg.terminalReason ?? null,
    structuredOutputPresent: msg.structuredOutputPresent ?? null,
    resultTextLength: msg.resultTextLength ?? null
  };
}

function recordLlmEvent(sessionId, context, msg) {
  if (!sessionId || !msg || !LOGGED_TYPES.has(msg.type) || !isEnabled()) return;
  const callId = msg.callId || `nocall-${Date.now()}`;
  const dir = resolveLogDir(sessionId);
  try {
    if (msg.type === 'llm_start') {
      const startedAt = new Date().toISOString();
      const file = path.join(dir, `${stamp(startedAt)}-${sanitize(context)}-${shortId(callId)}.json`);
      const record = {
        callId, context, label: msg.label || null, model: msg.model || null, startedAt,
        prompt: { system: msg.systemPrompt || '', user: msg.prompt || '', schema: msg.jsonSchema || null }
      };
      inFlight.set(callId, { file, record });
      writeJson(file, record);
      return;
    }

    const entry = inFlight.get(callId) || {
      file: path.join(dir, `${stamp()}-${sanitize(context)}-${shortId(callId)}.json`),
      record: { callId, context, label: msg.label || null, model: msg.model || null, startedAt: null, prompt: null }
    };
    const completedAt = new Date().toISOString();
    const diagnostics = diagnosticsOf(msg);
    const record = {
      ...entry.record,
      completedAt,
      elapsed: msg.elapsed ?? null,
      diagnostics,
      outcome: msg.type === 'llm_complete' ? 'complete' : 'error'
    };
    if (msg.type === 'llm_complete') {
      const full = msg.result === undefined ? null : msg.result;
      const text = full === null ? '' : (typeof full === 'string' ? full : JSON.stringify(full));
      record.response = { full, length: text.length, structured: !!msg.jsonSchema };
    } else {
      record.error = { message: msg.error || null, errorName: msg.errorName || null, schemaErrors: msg.schemaErrors || null };
    }
    writeJson(entry.file, record);
    fs.appendFileSync(path.join(dir, 'index.jsonl'), JSON.stringify({
      ts: completedAt, callId, context, model: record.model, elapsed: record.elapsed,
      channel: diagnostics.channel, usage: diagnostics.usage, file: path.basename(entry.file), outcome: record.outcome
    }) + '\n');
    inFlight.delete(callId);
  } catch (err) {
    warnOnce(err, dir);
  }
}

module.exports = { recordLlmEvent, setLogRoot, resolveLogDir, isEnabled, _resetForTests };
