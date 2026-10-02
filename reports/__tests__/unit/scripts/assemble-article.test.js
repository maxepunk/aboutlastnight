const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { getThemeConfig } = require('../../../lib/theme-config');
const { formatDate, formatDatetime } = require('../../../lib/template-helpers');

const VALID_BUNDLE = require('../../fixtures/content-bundles/valid-journalist.json');
const SCRIPT = path.join(__dirname, '..', '..', '..', 'scripts', 'assemble-article.js');

describe('assemble-article CLI', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assemble-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renders a valid ContentBundle to HTML and writes it to the output path', () => {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const outPath = path.join(tmpDir, 'article.html');
    fs.writeFileSync(bundlePath, JSON.stringify(VALID_BUNDLE));

    execFileSync('node', [SCRIPT, '--bundle', bundlePath, '--out', outPath], { stdio: 'pipe' });

    expect(fs.existsSync(outPath)).toBe(true);
    const html = fs.readFileSync(outPath, 'utf-8');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain(VALID_BUNDLE.headline.main);
  });

  /**
   * The dateline prints metadata.storyDate, and falls back to generatedAt, the day the
   * bundle was made. The pipeline stamps storyDate from the theme config
   * (generateContentBundle in ai-nodes.js), over whatever the writer gave, and the
   * standalone path's writer gives none, so the script stamps it as that node does.
   */
  it.each([
    ['gives no storyDate', undefined],
    ['gives another storyDate', '2031-06-01']
  ])('prints the theme\'s in-world date in the dateline when the writer %s', (label, writerDate) => {
    const storyDate = getThemeConfig('journalist').display.storyDate;
    const metadata = { ...VALID_BUNDLE.metadata };
    delete metadata.storyDate;
    if (writerDate) metadata.storyDate = writerDate;
    const bundle = { ...VALID_BUNDLE, metadata };
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const outPath = path.join(tmpDir, 'article.html');
    fs.writeFileSync(bundlePath, JSON.stringify(bundle));

    execFileSync('node', [SCRIPT, '--bundle', bundlePath, '--out', outPath], { stdio: 'pipe' });

    const html = fs.readFileSync(outPath, 'utf-8');
    const dateline = html.match(/<time class="nn-article__date" datetime="([^"]*)">\s*([^<]*?)\s*<\/time>/);
    expect(dateline && { datetime: dateline[1], printed: dateline[2] })
      .toEqual({ datetime: formatDatetime(storyDate), printed: formatDate(storyDate) });
    expect(formatDate(storyDate)).not.toBe(formatDate(metadata.generatedAt));
  });

  it('exits non-zero with an informative message when the bundle is missing required fields', () => {
    const bundlePath = path.join(tmpDir, 'bundle.json');
    const outPath = path.join(tmpDir, 'article.html');
    fs.writeFileSync(bundlePath, JSON.stringify({ metadata: { theme: 'journalist' } }));

    expect(() => {
      execFileSync('node', [SCRIPT, '--bundle', bundlePath, '--out', outPath], { stdio: 'pipe' });
    }).toThrow();

    expect(fs.existsSync(outPath)).toBe(false);
  });
});
