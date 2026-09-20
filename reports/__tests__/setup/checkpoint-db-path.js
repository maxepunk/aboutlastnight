/**
 * Jest `setupFiles` module — runs BEFORE any test module is loaded, in every worker.
 *
 * Binding constraint (spec 2026-09-19 §7.4): the production database
 * `data/checkpoints.sqlite` is never opened by a test. `server.js` opens SqliteSaver at
 * MODULE LOAD, so every suite that requires it — server-build-resume-payload,
 * get-checkpoint-data, get-session-state, sigint-drain, notion-reachability-probe,
 * server-completion-response, session-id-and-resume-guard — would otherwise create and
 * open the real file. Rather than repeat an override in each of them, point
 * CHECKPOINT_DB_PATH at a throwaway file in the OS temp directory here, once per worker.
 *
 * A test that wants its own path (see `__tests__/unit/checkpoint-db-path.test.js`) sets
 * CHECKPOINT_DB_PATH itself; an already-set value is left alone, so a deliberate
 * override — including one from the environment a gate run supplies — still wins.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

if (!process.env.CHECKPOINT_DB_PATH) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-jest-ckpt-'));
    process.env.CHECKPOINT_DB_PATH = path.join(dir, 'checkpoints.sqlite');
}
