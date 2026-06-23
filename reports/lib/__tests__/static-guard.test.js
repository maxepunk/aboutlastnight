const { isDeniedStaticPath } = require('../static-guard');

describe('isDeniedStaticPath (P7.8 static exposure guard)', () => {
  // BLOCKED — sensitive trees / files that must never be served unauthenticated
  test.each([
    '/data/checkpoints.sqlite',
    '/data/1221/analysis/arc-analysis.json',
    '/node_modules/express/package.json',
    '/lib/notion-client.js',
    '/scripts/e2e-walkthrough.js',
    '/__tests__/unit/x.test.js',
    '/templates/journalist/layouts/article.hbs',
    '/emailer/send_followup_emails_smart.py',
    '/docs/PIPELINE_DEEP_DIVE.md',
    '/audit/x.md',
    '/coverage/lcov.info',
    '/config/x.json',
    '/archive/old.html',
    '/server.js',
    '/jest.config.js',
    '/package.json',
    '/package-lock.json',
    '/langgraph.json',
    '/cloudflared-config-template.yml',
    '/CLAUDE.md',
    '/ENV_SETUP.md',
    '/BEHAVIORAL_ANALYSIS_COMPREHENSIVE.json',
    '/test-request.json',
    '/start-everything.bat',
    '/outputs/report-040426-refsheet.md',
    '/server%2Ejs',
    '/server%2ejs',
    '/CLAUDE%2Emd',
    '/package%2Ejson',
    '/jest%2Econfig%2Ejs',
    '/data%2Fcheckpoints.sqlite',
    '/%2e%2e/data/x.sqlite',
    '//data/x.sqlite',
    '/console/../data/x.sqlite',
    '/console\\..\\server.js',
    '/cookies.txt',
    '/tmp-cookies.txt',
    '/server.log',
    '/e2e-output.log',
    '/secrets.pem',
  ])('blocks %s', (p) => {
    expect(isDeniedStaticPath(p)).toBe(true);
  });

  test.each([
    '/%ZZ/x',
    '/foo%00.js',
    '/bad%/x',
  ])('fails closed (denies) on malformed/NUL input %s', (p) => {
    expect(isDeniedStaticPath(p)).toBe(true);
  });

  // ALLOWED — legitimately public files the live site serves
  test.each([
    '/report1116.html',
    '/report20251221ALL15.html',
    '/detlogv3.html',
    '/frame-picker.html',
    '/outputs/report-032026.html',
    '/console/app.js',
    '/console/components/checkpoints/Outline.js',
    '/console/console.css',
    '/sessionphotos/1221/whiteboard.jpg',
    '/assets/images/041026/photo.jpg',
    '/',
    '/index.html',
  ])('allows %s', (p) => {
    expect(isDeniedStaticPath(p)).toBe(false);
  });

  test('handles non-string / empty input safely', () => {
    expect(isDeniedStaticPath('')).toBe(false);
    expect(isDeniedStaticPath(null)).toBe(false);
    expect(isDeniedStaticPath(undefined)).toBe(false);
  });
});
