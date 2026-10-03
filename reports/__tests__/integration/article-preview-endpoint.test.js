/**
 * The desk's preview (phase 4, task 4.3; spec 2026-10-02 section 6.3: the article as it will
 * print).
 *
 * `htmlPreview` renders the writer's draft, so the article stop showed the director a page
 * without their edits. POST /api/session/:id/article/preview renders the bundle the desk
 * sends through the publishing TemplateAssembler, with the session's theme, photo paths and
 * ledger: the photos spaced, the ledger's money tracker in place of the writer's, and the
 * same `<base href="/">` as htmlPreview. The console takes the scripts out of both
 * (article-desk-logic.js stripScripts).
 *
 * Boots the real `app` exported by server.js. The LangGraph module is mocked, as in
 * session-id-and-resume-guard.test.js, so the session's state is planted and no graph runs.
 * The bundles are invented text in a real session's shape: the repo is public.
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-not-used-for-signing-in-tests';
process.env.ACCESS_PASSWORD = 'test-password';

const http = require('http');

// Assigned per test; the factory only closes over it ("mock" prefix).
let mockGraph = null;

jest.mock('../../lib/workflow/graph', () => ({
  createReportGraphWithCheckpointer: () => mockGraph,
  RECURSION_LIMIT: 100
}));

const { app } = require('../../server.js');
const Desk = require('../../console/article-desk-logic');

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

/** A thread paused at the article stop, holding `values`. */
function threadWith(values) {
  return {
    getState: jest.fn().mockResolvedValue({ values, config: { configurable: { checkpoint_id: 'ckpt-1' } }, createdAt: 'now', tasks: [] })
  };
}

const paragraph = (text) => ({ type: 'paragraph', text });
const photo = (filename, caption) => ({ type: 'photo', filename, caption });

const WRITERS_LINE = 'The room spent the last two minutes looking at one account.';
const DIRECTORS_LINE = 'Thirteen sales landed in the JessKane account in the last two minutes.';
const AFTER_PHOTOS = 'By the second round the room had stopped asking who held the account.';

/** The writer's draft, as the stop stores it. */
const storedBundle = () => ({
  metadata: { sessionId: '0926262', theme: 'journalist', generatedAt: '2026-10-02T17:09:31.000Z' },
  headline: { main: 'The Room Named Alex, Five Votes to Four', deck: 'Nine players and one verdict.' },
  byline: { author: 'Nova', title: 'Independent Reporter', guestReporter: 'Remi Vale | Field Reporter' },
  heroImage: { filename: 'huddle.jpg', caption: 'The six in the huddle.' },
  sections: [
    { id: 'lede', type: 'narrative', content: [paragraph(WRITERS_LINE)] },
    {
      id: 'the-story', type: 'narrative', heading: 'The Story',
      content: [paragraph('Mel built the first theory.'), photo('theory.jpg', 'Mel lays out the theory.'), paragraph(AFTER_PHOTOS), photo('cards.jpg', 'The two cards.')]
    }
  ],
  financialTracker: { entries: [{ description: 'WritersAccount', amount: '$1' }], totalExposed: '$1' }
});

const LEDGER = [{ name: 'JessKane', total: 3235000, tokenCount: 13 }];

/** Where each needle first appears in the html, in order. */
const order = (html, needles) => needles.map((n) => html.indexOf(n));

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  mockGraph = threadWith({ theme: 'journalist', sessionId: '0926262', contentBundle: storedBundle(), shellAccounts: LEDGER });
});

/** The route the desk posts to, as the desk builds it. */
const previewPath = (sessionId) => Desk.previewRequest(sessionId, {}).url;

test('the route the desk posts to needs a login', async () => {
  cookie = null;
  const res = await send('POST', previewPath('0926262'), { contentBundle: storedBundle() });
  expect(res.status).toBe(401);
});

describe('logged in', () => {
  beforeAll(async () => {
    cookie = null;
    const login = await send('POST', '/api/auth/login', { password: 'test-password' });
    expect(login.status).toBe(200);
    cookie = login.headers['set-cookie'][0].split(';')[0];
  });

  test('renders the bundle on the desk, not the stored draft, with photos spaced as the page prints them', async () => {
    // At the desk the director rewrote the lede and moved the second photo up beside the
    // first. The page never prints two photos in a row, so it prints the paragraph between.
    let desk = Desk.setBlock(storedBundle(), 0, 0, paragraph(DIRECTORS_LINE));
    desk = Desk.moveBlock(desk, { section: 1, block: 3 }, { section: 1, block: 2 });
    expect(desk.sections[1].content.map((b) => b.type)).toEqual(['paragraph', 'photo', 'photo', 'paragraph']);

    const res = await send('POST', previewPath('0926262'), { contentBundle: desk });
    expect(res.status).toBe(200);
    const { html } = res.body;
    expect(html).toContain('<base href="/">');
    expect(html).toContain(DIRECTORS_LINE);
    expect(html).not.toContain(WRITERS_LINE);
    const [first, between, second] = order(html, ['sessionphotos/0926262/theory.jpg', AFTER_PHOTOS, 'sessionphotos/0926262/cards.jpg']);
    expect(first).toBeGreaterThan(-1);
    expect(between).toBeGreaterThan(first);
    expect(second).toBeGreaterThan(between);
    // The console shows it with every script taken out, as it shows htmlPreview.
    expect(html).toMatch(/<script/i);
    expect(Desk.stripScripts(html)).not.toMatch(/<script/i);
  });

  test('prints the ledger\'s money tracker in place of the writer\'s, and says the writer\'s does not print', async () => {
    const res = await send('POST', previewPath('0926262'), { contentBundle: storedBundle() });
    expect(res.status).toBe(200);
    expect(res.body.writerTrackerPrints).toBe(false);
    expect(res.body.html).toContain('JessKane');
    expect(res.body.html).not.toContain('WritersAccount');
  });

  test('says the writer\'s tracker prints when no ledger account has a total', async () => {
    mockGraph = threadWith({ theme: 'journalist', sessionId: '0926262', contentBundle: storedBundle(), shellAccounts: [] });
    const res = await send('POST', previewPath('0926262'), { contentBundle: storedBundle() });
    expect(res.status).toBe(200);
    expect(res.body.writerTrackerPrints).toBe(true);
    expect(res.body.html).toContain('WritersAccount');
  });

  test('a bundle the page cannot print is refused with the reason, which the desk shows in place of the page', async () => {
    const desk = Desk.insertBlock(storedBundle(), 0, 1, 'paragraph');
    const res = await send('POST', previewPath('0926262'), { contentBundle: desk });
    expect(res.status).toBe(422);
    expect(res.body.error).toContain('/sections/0/content/1');
  });

  test('a request with no bundle is refused, and a session with no thread is not found', async () => {
    expect((await send('POST', previewPath('0926262'), { contentBundle: [] })).status).toBe(400);
    expect((await send('POST', previewPath('0926262'), {})).status).toBe(400);
    mockGraph = { getState: jest.fn().mockResolvedValue({ values: {}, tasks: [] }) };
    expect((await send('POST', previewPath('0926262'), { contentBundle: storedBundle() })).status).toBe(404);
  });
});
