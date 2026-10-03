/**
 * /sessionphotos/:id requires login (before phase 4, FA, requirement 13).
 *
 * The route serves data/<id>/photos at full size, the excluded photos and any
 * whiteboard in that folder included. It was mounted before the session middleware
 * with no login check, so anyone could read it over the tunnel (final review of the
 * photos, finding 3). The console's article preview loads the photos same-origin and
 * logged in, so it keeps working.
 *
 * Boots the real `app` exported by server.js (its listen() is behind
 * `require.main === module`). No session data is read: the logged-in request names a
 * session id no folder has, and the route answers 404 for it.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const http = require('http');

const { app } = require('../../server.js');

let server;

function send(method, urlPath, { body, cookie } = {}) {
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
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

const PHOTO = '/sessionphotos/zz-no-such-session-for-tests/photo.jpg';

test('a request without a login is refused before any file is looked up', async () => {
  const res = await send('GET', PHOTO);
  expect(res.status).toBe(401);
});

test('a logged-in request reaches the route', async () => {
  const login = await send('POST', '/api/auth/login', { body: { password: 'test-password' } });
  expect(login.status).toBe(200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const res = await send('GET', PHOTO, { cookie });
  expect(res.status).toBe(404);
});
