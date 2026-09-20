process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
/**
 * CHECKPOINT_DB_PATH and PORT (spec 2026-09-19 §7.4 [C2]): a gate must be able to run
 * the server against a COPY of the checkpoint database on a port of its own, never the
 * production file and never the director's port. `server.js` hardcoded PORT = 3001.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Captured inside the one isolateModules require below, so the resolvePort cases never
// load server.js a second time (a second load opens a second SqliteSaver handle).
let serverModule = null;

/**
 * Global constraint: the production database data/checkpoints.sqlite is never opened by
 * a test. server.js opens SqliteSaver at module load, and seven pre-existing suites
 * require it, so the guarantee is made once in __tests__/setup/checkpoint-db-path.js
 * (jest.config.js `setupFiles`) rather than suite by suite.
 */
test('the Jest setup points CHECKPOINT_DB_PATH away from the production database', () => {
  expect(process.env.CHECKPOINT_DB_PATH).toBeTruthy();
  const resolved = path.resolve(process.env.CHECKPOINT_DB_PATH);
  expect(resolved).not.toBe(path.join(__dirname, '..', '..', 'data', 'checkpoints.sqlite'));
  expect(resolved.startsWith(path.resolve(os.tmpdir()))).toBe(true);
});

/**
 * M2: honouring an already-set CHECKPOINT_DB_PATH is how a deliberate override wins,
 * but a shell that exported the DEFAULT explicitly would have pointed the seven
 * server suites straight at production. The setup file refuses that value. The check
 * is a pure string comparison — this test never creates or opens the real file.
 */
describe('the setup file refuses the production database', () => {
  const setup = require('../setup/checkpoint-db-path');
  const production = path.join(__dirname, '..', '..', 'data', 'checkpoints.sqlite');

  test('an exported CHECKPOINT_DB_PATH that resolves to production throws', () => {
    expect(() => setup.assertNotProduction({ CHECKPOINT_DB_PATH: production }, production))
      .toThrow(/CHECKPOINT_DB_PATH/);
    // A different spelling of the same file is the same file.
    const spelled = path.join(__dirname, '..', '..', 'data', '.', 'checkpoints.sqlite');
    expect(() => setup.assertNotProduction({ CHECKPOINT_DB_PATH: spelled }, production))
      .toThrow(/production/);
  });

  test('an unset value and any other path are allowed', () => {
    expect(() => setup.assertNotProduction({}, production)).not.toThrow();
    expect(() => setup.assertNotProduction({ CHECKPOINT_DB_PATH: path.join(os.tmpdir(), 'copy.sqlite') }, production)).not.toThrow();
  });

  test('the production path it guards is the repo one', () => {
    expect(setup.PRODUCTION_DB_PATH).toBe(path.resolve(production));
  });
});

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
      serverModule = server;
    });
    expect(fs.existsSync(file)).toBe(true);                          // SqliteSaver created the COPY, not data/
  } finally {
    if (previous.db === undefined) delete process.env.CHECKPOINT_DB_PATH; else process.env.CHECKPOINT_DB_PATH = previous.db;
    if (previous.port === undefined) delete process.env.PORT; else process.env.PORT = previous.port;
  }
});

/**
 * resolvePort fails loud (the project's rule). `Number(process.env.PORT) || 3001`
 * silently fell back to the director's production port for exactly the values a typo
 * produces — which is the collision the override exists to prevent.
 */
describe('resolvePort', () => {
  test('an unset or empty PORT is the default 3001', () => {
    expect(serverModule.resolvePort({})).toBe(3001);
    expect(serverModule.resolvePort({ PORT: '' })).toBe(3001);
  });

  test('a positive integer string is that port', () => {
    expect(serverModule.resolvePort({ PORT: '3011' })).toBe(3011);
  });

  test('a non-numeric PORT throws and names the value', () => {
    expect(() => serverModule.resolvePort({ PORT: 'abc' })).toThrow(/abc/);
  });

  test('a zero PORT throws rather than falling back to 3001', () => {
    expect(() => serverModule.resolvePort({ PORT: '0' })).toThrow(/PORT/);
  });
});
