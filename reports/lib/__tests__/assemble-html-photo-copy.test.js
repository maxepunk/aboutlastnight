/**
 * assembleHtml publishes the printed photos (brief F2; the operator gate of 2026-09-19
 * before it).
 *
 * The publish step copied every top-level file of data/<id>/photos into
 * outputs/sessionphotos/<id>/ at full size. It took files only after a subfolder (the
 * 071826 photo set's group/) made copyFileSync throw EPERM at the last node of the run,
 * after every paid call had completed. It now publishes only the photos the page prints,
 * at web size, through lib/publish-photos.js: a subfolder, the whiteboard and an
 * unprinted photo are never read, and `photosCopied` is the count published. The HTML is
 * the assembler's, unchanged: it names each photo verbatim, spaces and brackets included.
 */

jest.mock('../observability', () => ({
  traceNode: (fn) => fn,
  progressEmitter: { emit: jest.fn() },
  createTracedSdkQuery: (fn) => fn,
  createProgressFromTrace: () => jest.fn()
}));

const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { assembleHtml, createMockTemplateAssembler } = require('../workflow/nodes/template-nodes');

const SESSION = '0919269';
const roots = [];
afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

/** A repo-shaped base folder: data/<id>/photos holds `photos` ({name: [width, height]}). */
async function baseDirWith(photos) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-assemble-photos-'));
  roots.push(baseDir);
  const photosDir = path.join(baseDir, 'data', SESSION, 'photos');
  for (const [name, [width, height]] of Object.entries(photos)) {
    const file = path.join(photosDir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await sharp({ create: { width, height, channels: 3, background: { r: 30, g: 30, b: 90 } } }).jpeg().toFile(file);
  }
  return { baseDir, photosDir, publishedDir: path.join(baseDir, 'outputs', 'sessionphotos', SESSION) };
}

function bundlePrinting(filenames) {
  return {
    metadata: { sessionId: SESSION, theme: 'journalist', generatedAt: '2026-10-02T00:00:00Z' },
    headline: { main: 'A headline long enough for the schema' },
    sections: [{
      id: 'the-story',
      type: 'narrative',
      heading: 'The Story',
      content: [
        { type: 'paragraph', text: 'A paragraph.' },
        ...filenames.flatMap((filename) => [
          { type: 'photo', filename, caption: 'A caption.' },
          { type: 'paragraph', text: 'Another paragraph.' }
        ])
      ]
    }]
  };
}

const mockConfig = (baseDir) => ({
  configurable: { templateAssembler: createMockTemplateAssembler({ html: '<html>ok</html>' }), baseDir, theme: 'journalist' }
});

describe('assembleHtml publishes the printed photos', () => {
  test('only the printed photo, at web size, under its own name; a subfolder and the whiteboard are never read', async () => {
    const { baseDir, publishedDir } = await baseDirWith({
      'aln0919269 (1 of 2).jpg': [3200, 1800],
      'aln0919269 (2 of 2).jpg': [400, 300],
      'whiteboard.jpg': [400, 300],
      [path.join('group', 'g1.jpg')]: [400, 300]
    });

    const result = await assembleHtml(
      { contentBundle: bundlePrinting(['aln0919269 (1 of 2).jpg']), sessionId: SESSION, theme: 'journalist' },
      mockConfig(baseDir)
    );

    expect(result.photosCopied).toBe(1);
    expect(fs.readdirSync(publishedDir)).toEqual(['aln0919269 (1 of 2).jpg']);
    const meta = await sharp(path.join(publishedDir, 'aln0919269 (1 of 2).jpg')).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 900]);
  });

  test('a page that prints no photo publishes none, though the photos folder holds some', async () => {
    const { baseDir, publishedDir } = await baseDirWith({ 'aln0919269 (1 of 2).jpg': [400, 300], 'whiteboard.jpg': [400, 300] });

    const result = await assembleHtml(
      { contentBundle: bundlePrinting([]), sessionId: SESSION, theme: 'journalist' }, mockConfig(baseDir)
    );

    expect(result.photosCopied).toBe(0);
    expect(fs.existsSync(publishedDir)).toBe(false);
  });

  test('a page that prints no photo needs no photos folder', async () => {
    const { baseDir, publishedDir } = await baseDirWith({});

    const result = await assembleHtml(
      { contentBundle: bundlePrinting([]), sessionId: SESSION, theme: 'journalist' }, mockConfig(baseDir)
    );

    expect(result.photosCopied).toBe(0);
    expect(fs.existsSync(publishedDir)).toBe(false);
  });

  test('the HTML is unchanged: the report names each photo verbatim, spaces and brackets included', async () => {
    const { baseDir, publishedDir } = await baseDirWith({ 'aln0919269 (1 of 2).jpg': [400, 300] });

    const result = await assembleHtml(
      { contentBundle: bundlePrinting(['aln0919269 (1 of 2).jpg']), sessionId: SESSION, theme: 'journalist' },
      { configurable: { baseDir, theme: 'journalist' } }
    );

    expect(fs.readFileSync(result.outputPath, 'utf8')).toBe(result.assembledHtml);
    expect(result.assembledHtml).toContain(`src="sessionphotos/${SESSION}/aln0919269 (1 of 2).jpg"`);
    expect(fs.existsSync(path.join(publishedDir, 'aln0919269 (1 of 2).jpg'))).toBe(true);
  });
});

// FB (known item 9): the node resolves the theme once, the thread's before the config's,
// for both what the page renders and what is published. It used to render with the
// config's theme and publish with the thread's, so a journalist page could print a hero
// the detective's set left unpublished, or the reverse publish a hero no page printed.
describe('assembleHtml renders and publishes in one theme', () => {
  test.each([
    ['detective', 'journalist', ['inline.jpg']],
    ['journalist', 'detective', ['hero.jpg', 'inline.jpg']]
  ])("the thread's %s theme over the config's %s: the page names exactly the photos published", async (threadTheme, configTheme, printed) => {
    const { baseDir, publishedDir } = await baseDirWith({ 'hero.jpg': [400, 300], 'inline.jpg': [400, 300] });
    const bundle = { ...bundlePrinting(['inline.jpg']), heroImage: { filename: 'hero.jpg', caption: 'The room at the start.' } };

    const result = await assembleHtml(
      { contentBundle: bundle, sessionId: SESSION, theme: threadTheme },
      { configurable: { baseDir, theme: configTheme } }
    );

    const named = [...new Set([...result.assembledHtml.matchAll(/src="sessionphotos\/0919269\/([^"]+)"/g)].map((m) => m[1]))];
    expect({ named: named.sort(), published: fs.readdirSync(publishedDir).sort() }).toEqual({ named: printed, published: printed });
    expect(result.photosCopied).toBe(printed.length);
  });
});

// The director's ruling at the end of phase 4 (2026-10-04): publish deletes nothing (F2), and
// it names each file in the session's published folder that the page does not print, such as
// a photo an earlier publish wrote that the director has since left out or deleted. The folder
// is public once committed, so the completion lists them for the director to remove.
describe('assembleHtml names the published files the page no longer prints', () => {
  test("an earlier publish's photo the page no longer prints stays in the folder, and is named", async () => {
    const { baseDir, publishedDir } = await baseDirWith({ 'aln0919269 (1 of 2).jpg': [400, 300], 'aln0919269 (2 of 2).jpg': [400, 300] });
    const both = ['aln0919269 (1 of 2).jpg', 'aln0919269 (2 of 2).jpg'];
    const first = await assembleHtml({ contentBundle: bundlePrinting(both), sessionId: SESSION, theme: 'journalist' }, mockConfig(baseDir));
    expect(first.photosNotPrinted).toEqual([]);
    const again = await assembleHtml(
      { contentBundle: bundlePrinting(['aln0919269 (1 of 2).jpg']), sessionId: SESSION, theme: 'journalist' }, mockConfig(baseDir)
    );
    expect(again.photosNotPrinted).toEqual(['aln0919269 (2 of 2).jpg']);
    expect(fs.readdirSync(publishedDir).sort()).toEqual(both);
  });

  test('a page with no published folder names nothing', async () => {
    const { baseDir } = await baseDirWith({});
    const result = await assembleHtml({ contentBundle: bundlePrinting([]), sessionId: SESSION, theme: 'journalist' }, mockConfig(baseDir));
    expect(result.photosNotPrinted).toEqual([]);
  });
});
