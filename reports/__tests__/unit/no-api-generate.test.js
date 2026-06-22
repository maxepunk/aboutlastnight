/**
 * GEN-1: the deprecated /api/generate endpoint must be removed.
 * No supertest harness exists; assert the route is not registered in source.
 */
const fs = require('fs');
const path = require('path');

const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

describe('GEN-1 /api/generate removal', () => {
  it('does not register the deprecated /api/generate route', () => {
    expect(SERVER_SRC).not.toMatch(/app\.post\(\s*['"`]\/api\/generate['"`]/);
  });

  it('still registers the supported /start and /approve routes', () => {
    expect(SERVER_SRC).toMatch(/\/api\/session\/:id\/start/);
    expect(SERVER_SRC).toMatch(/\/api\/session\/:id\/approve/);
  });

  it('no longer advertises /api/generate in the /api/health endpoints listing', () => {
    expect(SERVER_SRC).not.toMatch(/generate:\s*['"`]\/api\/generate/);
  });
});
