/**
 * SEC-1 / SEC-2: /api/file and /api/browse must confine to data/.
 * supertest is absent (zero-new-dep constraint); server.js does not export its
 * `app`. So we pin the confine-then-serve CONTRACT through a tiny mounted app
 * that mirrors the routes. The real server.js wiring is verified by the Step-3
 * diff + the deferred manual live probe.
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { confineToBase } = require('../../lib/api-helpers');

function makeApp() {
  const app = express();
  const DATA_DIR = path.join(__dirname, '..', '..', 'data');
  app.get('/api/file', (req, res) => {
    let resolved;
    try {
      resolved = confineToBase(DATA_DIR, req.query.path || '');
    } catch (e) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    res.json({ ok: true, resolved });
  });
  app.get('/api/browse', (req, res) => {
    let resolved;
    try {
      resolved = confineToBase(DATA_DIR, req.query.dir || DATA_DIR);
    } catch (e) {
      return res.status(400).json({ error: 'Invalid path' });
    }
    res.json({ ok: true, resolved });
  });
  return app;
}

function get(app, urlPath) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const port = server.address().port;
      http.get(`http://127.0.0.1:${port}${urlPath}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body });
        });
      });
    });
  });
}

describe('SEC-1/SEC-2 path confinement (route contract)', () => {
  const app = makeApp();

  test('/api/file rejects ../ escape with 400', async () => {
    const r = await get(app, '/api/file?path=' + encodeURIComponent('../CLAUDE.md'));
    expect(r.status).toBe(400);
  });

  test('/api/file rejects absolute host path with 400', async () => {
    const evil = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd';
    const r = await get(app, '/api/file?path=' + encodeURIComponent(evil));
    expect(r.status).toBe(400);
  });

  test('/api/file allows a data/ child path with 200', async () => {
    const r = await get(app, '/api/file?path=' + encodeURIComponent('1221/photos/x.jpg'));
    expect(r.status).toBe(200);
  });

  test('/api/browse rejects C:/Users enumeration with 400', async () => {
    const evil = process.platform === 'win32' ? 'C:\\Users' : '/home';
    const r = await get(app, '/api/browse?dir=' + encodeURIComponent(evil));
    expect(r.status).toBe(400);
  });
});
