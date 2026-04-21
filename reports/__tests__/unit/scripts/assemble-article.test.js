const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

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
