/**
 * `/start` refuses the parked detective theme (phase 4, brief 4.4; ruling R1).
 *
 * The detective theme stays in the repo as the worked example of a second theme, but it
 * has no story meeting, map or article stage yet, so a session cannot start on it. The
 * refusal comes before any graph is built or any state is read: the graph module is
 * mocked here, and a graph that is touched fails the test.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const http = require('http');

const mockGraph = {
  getState: jest.fn(() => { throw new Error('the graph was read'); }),
  invoke: jest.fn(() => { throw new Error('the graph was invoked'); })
};
jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app } = require('../../server.js');

let server;
let cookie;

function send(method, urlPath, body) {
  const payload = body === undefined ? null : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const headers = {};
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: '127.0.0.1', port: server.address().port, path: urlPath, method, headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
        resolve({ status: res.statusCode, body: parsed, headers: res.headers });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const login = await send('POST', '/api/auth/login', { password: 'test-password' });
  expect(login.status).toBe(200);
  cookie = login.headers['set-cookie'][0].split(';')[0];
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('POST /api/session/:id/start with the detective theme (R1)', () => {
  it('is refused with a message, before any graph is touched', async () => {
    const res = await send('POST', '/api/session/100326/start', { theme: 'detective', rawSessionInput: { roster: 'Vic' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/detective theme is parked/i);
    expect(res.body.error).toMatch(/story meeting, the map and the article/);
    expect(res.body.error).toMatch(/journalist theme/);
    expect(mockGraph.getState).not.toHaveBeenCalled();
    expect(mockGraph.invoke).not.toHaveBeenCalled();
  });

  it('still refuses an unknown theme with the invalid-theme message', async () => {
    const res = await send('POST', '/api/session/100326/start', { theme: 'pirate', rawSessionInput: { roster: 'Vic' } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid theme: pirate/);
    expect(res.body.error).not.toMatch(/detective/);
  });
});
