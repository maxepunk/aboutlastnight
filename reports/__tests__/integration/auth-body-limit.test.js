/**
 * SEC-6: the unauthenticated auth surface must reject oversized / malformed
 * bodies with a clean 413/400 (not buffer the 50mb global limit or leak a
 * stack trace). server.js does not export its app, so this pins the
 * parser+error-handler CONTRACT via a tiny mounted app mirroring the SEC-6
 * middleware. The real server.js wiring is verified by the Step-3 diff +
 * the deferred manual curl.
 */
const http = require('http');
const express = require('express');

function makeApp() {
  const app = express();
  app.use('/api/auth/login', express.json({ limit: '1kb' }));
  app.use(express.json({ limit: '50mb' }));
  app.post('/api/auth/login', (req, res) => res.json({ ok: true }));
  app.post('/api/other', (req, res) => res.json({ ok: true, size: JSON.stringify(req.body).length }));
  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request body too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
    return next(err);
  });
  return app;
}

function post(app, urlPath, body, contentType = 'application/json') {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      const req = http.request(
        { host: '127.0.0.1', port, path: urlPath, method: 'POST', headers: { 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) } },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => { server.close(); resolve({ status: res.statusCode, body: data }); });
        }
      );
      req.write(body);
      req.end();
    });
  });
}

describe('SEC-6 auth-route body limit (contract)', () => {
  const app = makeApp();

  test('rejects a >1kb body on /api/auth/login with 413', async () => {
    const big = JSON.stringify({ password: 'x'.repeat(2000) });
    const r = await post(app, '/api/auth/login', big);
    expect(r.status).toBe(413);
  });

  test('accepts a small login body with 200', async () => {
    const r = await post(app, '/api/auth/login', JSON.stringify({ password: 'secret' }));
    expect(r.status).toBe(200);
  });

  test('rejects malformed JSON with 400', async () => {
    const r = await post(app, '/api/auth/login', '{not valid json');
    expect(r.status).toBe(400);
  });

  test('a non-auth route still accepts a >1kb body (global 50mb parser)', async () => {
    const big = JSON.stringify({ data: 'x'.repeat(5000) });
    const r = await post(app, '/api/other', big);
    expect(r.status).toBe(200);
  });
});
