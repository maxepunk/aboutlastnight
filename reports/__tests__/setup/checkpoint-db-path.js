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
 * With ONE exception: a value that resolves to the production file is refused here
 * (M2), because "an exported value wins" would otherwise let a shell that exported
 * the default hand the seven server suites the real database.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const PRODUCTION_DB_PATH = path.resolve(path.join(__dirname, '..', '..', 'data', 'checkpoints.sqlite'));

/**
 * Refuse an already-set CHECKPOINT_DB_PATH that names the production database.
 * Pure: compares resolved strings, opens nothing.
 *
 * @param {Object} env - environment to read CHECKPOINT_DB_PATH from
 * @param {string} productionPath - the file no test may open
 */
function assertNotProduction(env, productionPath) {
    const set = env && env.CHECKPOINT_DB_PATH;
    if (!set) return;
    if (path.resolve(set) !== path.resolve(productionPath)) return;
    throw new Error(
        'CHECKPOINT_DB_PATH resolves to the production database (' + path.resolve(productionPath) + '). ' +
        'No test may open data/checkpoints.sqlite (spec 2026-09-19 §7.4): unset the variable so this ' +
        'setup file picks a temp file, or point it at a COPY.'
    );
}

assertNotProduction(process.env, PRODUCTION_DB_PATH);

if (!process.env.CHECKPOINT_DB_PATH) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-jest-ckpt-'));
    process.env.CHECKPOINT_DB_PATH = path.join(dir, 'checkpoints.sqlite');
}

module.exports = { assertNotProduction, PRODUCTION_DB_PATH };
