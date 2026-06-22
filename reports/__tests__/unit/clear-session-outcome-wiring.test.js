const fs = require('fs');
const path = require('path');
const SERVER_SRC = fs.readFileSync(path.join(__dirname, '..', '..', 'server.js'), 'utf8');

describe('DEL-1 staleness: clearSessionOutcome wired on rollback + fresh-start (#17)', () => {
  it('imports clearSessionOutcome from lib/session-outcome', () => {
    expect(SERVER_SRC).toMatch(/require\(['"`]\.\/lib\/session-outcome['"`]\)/);
    expect(SERVER_SRC).toMatch(/clearSessionOutcome/);
  });
  it('calls clearSessionOutcome(sessionId) at least twice (rollback + fresh-start)', () => {
    const calls = SERVER_SRC.match(/clearSessionOutcome\(sessionId\)/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });
});
