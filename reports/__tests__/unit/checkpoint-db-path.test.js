process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * CHECKPOINT_DB_PATH and PORT (spec 2026-09-19 §7.4 [C2]): a gate must be able to run
 * the server against a COPY of the checkpoint database on a port of its own, never the
 * production file and never the director's port. `server.js` hardcoded PORT = 3001.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

test('resolveCheckpointDbPath: the env override wins, else data/checkpoints.sqlite under the base dir', () => {
  // Load the resolver from a require that is itself pointed at a temp file (see below);
  // the pure function is what we exercise here.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-db-'));
  const file = path.join(dir, 'copy.sqlite');
  const previous = { db: process.env.CHECKPOINT_DB_PATH, port: process.env.PORT };
  process.env.CHECKPOINT_DB_PATH = file;
  process.env.PORT = '3011';
  try {
    jest.isolateModules(() => {
      const server = require('../../server.js');
      expect(server.resolveCheckpointDbPath({ CHECKPOINT_DB_PATH: 'rel/copy.sqlite' }, '/base')).toBe(path.resolve('rel/copy.sqlite'));
      expect(server.resolveCheckpointDbPath({}, '/base')).toBe(path.join('/base', 'data', 'checkpoints.sqlite'));
      expect(server.CHECKPOINT_DB_PATH).toBe(path.resolve(file));   // the module used the override
      expect(server.PORT).toBe(3011);
    });
    expect(fs.existsSync(file)).toBe(true);                          // SqliteSaver created the COPY, not data/
  } finally {
    if (previous.db === undefined) delete process.env.CHECKPOINT_DB_PATH; else process.env.CHECKPOINT_DB_PATH = previous.db;
    if (previous.port === undefined) delete process.env.PORT; else process.env.PORT = previous.port;
  }
});
