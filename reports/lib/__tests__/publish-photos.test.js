/**
 * Publishing the printed photos (brief F2; spec section 9).
 *
 * assembleHtml used to copy every top-level file of data/<id>/photos into
 * outputs/sessionphotos/<id>/ at full camera size: 0926262's eleven photos came to
 * 87.8 MB and were cut to 2.2 MB by hand (commit 715c86e). The copy also put files the
 * page never prints into a public repository: a photo the director excluded, the
 * whiteboard. The publish step now writes only the photos the page prints, each turned
 * upright from its EXIF orientation, then fitted to 1600 px on the long edge (never
 * enlarged), in sRGB with no metadata: a JPEG at quality 85 by mozjpeg, any other format in
 * its own format, under its own name. Every image here is made with sharp; none comes from
 * data/.
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { createTemplateAssembler } = require('../template-assembler');
const { printedPhotos, publishPhotos, missingPrintedPhotos } = require('../publish-photos');

const RED = { r: 255, g: 0, b: 0 };
const BLUE = { r: 0, g: 0, b: 255 };
const XMP = '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
  '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
  '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:creator>A player</dc:creator>' +
  '</rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>';

const roots = [];
afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop(), { recursive: true, force: true });
});

/** A session's photo folder and its published folder, laid out as the pipeline lays them. */
function sessionFolders() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aln-publish-photos-'));
  roots.push(root);
  const sourceDir = path.join(root, 'data', '0926262', 'photos');
  fs.mkdirSync(sourceDir, { recursive: true });
  return { root, sourceDir, destDir: path.join(root, 'outputs', 'sessionphotos', '0926262') };
}

/**
 * A flat photo made with sharp in `colour`. When `tagged`, it carries EXIF, XMP and a
 * Display P3 profile, with its colour stored in P3's numbers, as a phone stores a photo.
 */
async function writePhoto(file, { width, height, format = 'jpeg', tagged = false, colour = BLUE }) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let image = sharp({ create: { width, height, channels: 3, background: colour } });
  if (tagged) {
    image = image.withExif({ IFD0: { Make: 'TestCam', Copyright: 'A player' } }).withIccProfile('p3').withXmp(XMP);
  }
  await image.toFormat(format).toFile(file);
}

// An sRGB red whose Display P3 numbers differ from it by 16 on the red channel.
const WIDE_GAMUT_RED = { r: 200, g: 60, b: 60 };

/** The first pixel of an image as sharp reads it. */
async function firstPixel(image) {
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  return { r: data[0], g: data[1], b: data[2] };
}
/** The largest difference between two pixels on any channel. */
const furthest = (a, b) => Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));

/**
 * A portrait photo stored sideways, as a camera turned on its side stores it: the pixels
 * are the upright view turned a quarter turn anticlockwise, so the photo's top (red) sits
 * on the left, and EXIF orientation 6 tells a viewer to turn it a quarter turn clockwise.
 */
async function writeSidewaysPortrait(file) {
  await sharp({ create: { width: 2000, height: 1000, channels: 3, background: BLUE } })
    .composite([{ input: { create: { width: 1000, height: 1000, channels: 3, background: RED } }, left: 0, top: 0 }])
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toFile(file);
}

/** The first row of a JPEG's luminance quantization table, in natural order. */
function lumaTableFirstRow(file) {
  const bytes = fs.readFileSync(file);
  for (let i = 2; i < bytes.length && bytes[i] === 0xFF; i += 2 + bytes.readUInt16BE(i + 2)) {
    if (bytes[i + 1] === 0xDB) {
      const zigzag = bytes.subarray(i + 5, i + 5 + 64);
      return [0, 1, 5, 6, 14, 15, 27, 28].map((k) => zigzag[k]);
    }
  }
  return null;
}

async function pixelAt(file, x, y) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}
const isRed = (p) => p.r > 200 && p.g < 60 && p.b < 60;
const isBlue = (p) => p.b > 200 && p.r < 60 && p.g < 60;

/** A bundle whose one section prints `filenames` as photo blocks, with the hero when given. */
function bundlePrinting(filenames, { hero } = {}) {
  return {
    ...(hero ? { heroImage: { filename: hero, caption: 'The room at the start.' } } : {}),
    sections: [{
      id: 'the-story',
      type: 'narrative',
      content: filenames.flatMap((filename) => [
        { type: 'paragraph', text: 'A paragraph.' },
        { type: 'photo', filename, caption: 'A caption.' }
      ])
    }]
  };
}

/** Every file under `dir`, with a hash of its bytes. */
function filesUnder(dir) {
  const files = {};
  (function walk(d) {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else files[path.relative(dir, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
    }
  })(dir);
  return files;
}

describe('printedPhotos', () => {
  const bundle = {
    heroImage: { filename: 'hero.jpg', caption: 'The hero.' },
    photos: [{ filename: 'listed-only.jpg', caption: 'The top-level list never prints.' }],
    sections: [
      { id: 'lede', type: 'narrative', content: [
        { type: 'paragraph', text: 'P.' },
        { type: 'photo', filename: 'aln0926262 (2 of 11).jpg', caption: 'C.' }
      ] },
      { id: 'the-story', type: 'narrative', content: [
        { type: 'paragraph', text: 'P.' },
        { type: 'photo', filename: 'hero.jpg', caption: 'The hero again, inline.' },
        { type: 'paragraph', text: 'P.' },
        { type: 'photo', filename: 'aln0926262 (2 of 11).jpg', caption: 'Printed twice.' }
      ] }
    ]
  };

  test('the journalist page prints the hero, then every photo block in order, each filename once', () => {
    expect(printedPhotos(bundle, 'journalist')).toEqual(['hero.jpg', 'aln0926262 (2 of 11).jpg']);
  });

  test('the detective page prints no hero', () => {
    expect(printedPhotos({ ...bundle, sections: [bundle.sections[0]] }, 'detective'))
      .toEqual(['aln0926262 (2 of 11).jpg']);
  });

  test('a hero that names no file is not printed', () => {
    expect(printedPhotos({ ...bundle, heroImage: { caption: 'The hero, its file not named.' } }, 'journalist'))
      .toEqual(['aln0926262 (2 of 11).jpg', 'hero.jpg']);
  });

  test('a theme with no known layout throws, naming it', () => {
    expect(() => printedPhotos(bundle, 'noir')).toThrow(/"noir"/);
  });
});

// The page and the publish read one rule for the hero (printedHero, lib/theme-config.js),
// so the photos the HTML names are always the photos published: never a hero printed
// and left unpublished, and never src=".../undefined" for a hero that names no file.
describe('printedPhotos is what the assembled page prints', () => {
  const HEROES = {
    'a hero that names a file': { filename: 'aln0926262 (1 of 11).jpg', caption: 'The six in the huddle.' },
    'a hero that names no file': { caption: 'The six in the huddle.' },
    'no hero': null
  };
  const pageBundle = (theme, hero) => ({
    metadata: { sessionId: '0926262', theme, generatedAt: '2026-10-02T00:00:00Z' },
    headline: { main: 'A headline long enough for the schema' },
    ...(hero ? { heroImage: hero } : {}),
    photos: [{ filename: 'aln0926262 (9 of 11).jpg', caption: 'Listed at the top level, never printed.' }],
    sections: [
      { id: 'lede', type: 'narrative', content: [
        { type: 'paragraph', text: 'The lede.' },
        { type: 'photo', filename: 'aln0926262 (2 of 11).jpg', caption: "Mel's theory." }
      ] },
      { id: 'the-story', type: 'narrative', heading: 'The Story', content: [
        { type: 'paragraph', text: 'The story.' },
        { type: 'photo', filename: 'aln0926262 (3 of 11).jpg', caption: 'The two cards.' },
        { type: 'paragraph', text: 'More of the story.' },
        { type: 'photo', filename: 'aln0926262 (2 of 11).jpg', caption: "Mel's theory, again." }
      ] }
    ]
  });

  const cases = ['journalist', 'detective'].flatMap((theme) => Object.keys(HEROES).map((hero) => [theme, hero]));
  test.each(cases)('%s, %s: the photos the HTML names are the printed photos', async (theme, hero) => {
    const bundle = pageBundle(theme, HEROES[hero]);
    const html = await createTemplateAssembler(theme).assemble(bundle, { sessionId: '0926262' });
    const named = [...html.matchAll(/src="sessionphotos\/0926262\/([^"]+)"/g)].map((m) => m[1]);
    expect([...new Set(named)].sort()).toEqual([...printedPhotos(bundle, theme)].sort());
  });
});

// One rule for "the page prints a photo the folder lacks": the article stop's approve
// asks it before the director leaves the stop (server.js), and publish refuses the same
// names. A filename that leads outside the folder counts as missing.
describe('missingPrintedPhotos', () => {
  test('names each printed photo that is not a file inside the folder, in print order', async () => {
    const { sourceDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'kept.jpg'), { width: 40, height: 30 });
    fs.mkdirSync(path.join(sourceDir, 'a-folder.jpg'));
    const bundle = bundlePrinting(['kept.jpg', 'gone.jpg', 'a-folder.jpg', '../outside.jpg'], { hero: 'hero.jpg' });
    expect(missingPrintedPhotos(bundle, 'journalist', sourceDir)).toEqual(['hero.jpg', 'gone.jpg', 'a-folder.jpg', '../outside.jpg']);
  });

  test('reads what the theme prints: the detective page prints no hero', () => {
    const { sourceDir } = sessionFolders();
    expect(missingPrintedPhotos(bundlePrinting([], { hero: 'hero.jpg' }), 'detective', sourceDir)).toEqual([]);
  });
});

describe('publishPhotos', () => {
  test('a large landscape photo comes out at 1600 px on its long edge', async () => {
    const { sourceDir, destDir } = sessionFolders();
    const name = 'aln0926262 (1 of 11).jpg';
    await writePhoto(path.join(sourceDir, name), { width: 3200, height: 1800 });

    await publishPhotos({ bundle: bundlePrinting([name]), theme: 'journalist', sourceDir, destDir });

    const meta = await sharp(path.join(destDir, name)).metadata();
    expect([meta.width, meta.height]).toEqual([1600, 900]);
  });

  test('a portrait photo stored sideways with EXIF orientation 6 comes out upright', async () => {
    const { sourceDir, destDir } = sessionFolders();
    const name = 'portrait.jpg';
    await writeSidewaysPortrait(path.join(sourceDir, name));

    await publishPhotos({ bundle: bundlePrinting([name]), theme: 'journalist', sourceDir, destDir });

    const out = path.join(destDir, name);
    const meta = await sharp(out).metadata();
    expect([meta.width, meta.height]).toEqual([800, 1600]);
    expect(meta.orientation).toBeUndefined();
    expect(isRed(await pixelAt(out, 400, 100))).toBe(true);
    expect(isBlue(await pixelAt(out, 400, 1500))).toBe(true);
  });

  test('no output carries EXIF or an ICC profile, and each is sRGB, its colours converted from the source profile', async () => {
    const { sourceDir, destDir } = sessionFolders();
    const names = ['tagged.jpg', 'tagged.png'];
    await writePhoto(path.join(sourceDir, names[0]), { width: 2400, height: 1600, tagged: true, colour: WIDE_GAMUT_RED });
    await writePhoto(path.join(sourceDir, names[1]), { width: 2400, height: 1600, format: 'png', tagged: true, colour: WIDE_GAMUT_RED });
    const colour = {};
    for (const name of names) {
      const source = path.join(sourceDir, name);
      const input = await sharp(source).metadata();
      expect([!!input.exif, !!input.icc, !!input.xmp]).toEqual([true, true, true]);
      // The colour the source shows, in sRGB, and the P3 numbers it stores, which differ.
      colour[name] = await firstPixel(sharp(source));
      expect(furthest(await firstPixel(sharp(source, { ignoreIcc: true })), colour[name])).toBeGreaterThan(10);
    }

    await publishPhotos({ bundle: bundlePrinting(names), theme: 'journalist', sourceDir, destDir });

    for (const name of names) {
      const published = path.join(destDir, name);
      const meta = await sharp(published).metadata();
      expect({ name, exif: meta.exif, icc: meta.icc, xmp: meta.xmp, space: meta.space })
        .toEqual({ name, exif: undefined, icc: undefined, xmp: undefined, space: 'srgb' });
      // A copy relabelled sRGB without converting would keep the P3 numbers, and a red 16
      // levels off. The published pixel shows the source's colour.
      const pixel = await firstPixel(sharp(published));
      expect({ name, pixel, within3: furthest(pixel, colour[name]) <= 3 })
        .toEqual({ name, pixel, within3: true });
    }
  });

  test('a JPEG is written at quality 85 by mozjpeg, the encoder of the 0926262 hand resize', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'photo.jpg'), { width: 2400, height: 1600 });

    await publishPhotos({ bundle: bundlePrinting(['photo.jpg']), theme: 'journalist', sourceDir, destDir });

    // mozjpeg's default table starts 16,16,16,18,25,37,56,85; quality 85 scales it to 30%.
    const quality85 = [16, 16, 16, 18, 25, 37, 56, 85].map((v) => Math.floor((v * (200 - 2 * 85) + 50) / 100));
    expect(lumaTableFirstRow(path.join(destDir, 'photo.jpg'))).toEqual(quality85);
  });

  test('a small photo is not enlarged', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'small.jpg'), { width: 800, height: 600 });

    await publishPhotos({ bundle: bundlePrinting(['small.jpg']), theme: 'journalist', sourceDir, destDir });

    const meta = await sharp(path.join(destDir, 'small.jpg')).metadata();
    expect([meta.width, meta.height]).toEqual([800, 600]);
  });

  test('a PNG stays a PNG', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'board.png'), { width: 2400, height: 1600, format: 'png' });

    await publishPhotos({ bundle: bundlePrinting(['board.png']), theme: 'journalist', sourceDir, destDir });

    const meta = await sharp(path.join(destDir, 'board.png')).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 1600, 1067]);
  });

  test('only printed photos are written: an unprinted file and the whiteboard are not', async () => {
    const { sourceDir, destDir } = sessionFolders();
    for (const name of ['aln (1 of 2).jpg', 'aln (2 of 2).jpg', 'whiteboard.jpg', path.join('group', 'g1.jpg')]) {
      await writePhoto(path.join(sourceDir, name), { width: 400, height: 300 });
    }

    const published = await publishPhotos({
      bundle: bundlePrinting(['aln (1 of 2).jpg']), theme: 'journalist', sourceDir, destDir
    });

    expect(published).toEqual(['aln (1 of 2).jpg']);
    expect(fs.readdirSync(destDir)).toEqual(['aln (1 of 2).jpg']);
  });

  test('a hero that names no file publishes nothing for it', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'inline.jpg'), { width: 400, height: 300 });
    const bundle = { ...bundlePrinting(['inline.jpg']), heroImage: { caption: 'The room at the start.' } };

    expect(await publishPhotos({ bundle, theme: 'journalist', sourceDir, destDir })).toEqual(['inline.jpg']);
    expect(fs.readdirSync(destDir)).toEqual(['inline.jpg']);
  });

  test('the hero is published for the journalist theme only', async () => {
    const { root, sourceDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'hero.jpg'), { width: 400, height: 300 });
    await writePhoto(path.join(sourceDir, 'inline.jpg'), { width: 400, height: 300 });
    const bundle = bundlePrinting(['inline.jpg'], { hero: 'hero.jpg' });

    for (const [theme, expected] of [['journalist', ['hero.jpg', 'inline.jpg']], ['detective', ['inline.jpg']]]) {
      const destDir = path.join(root, theme, 'sessionphotos', '0926262');
      expect(await publishPhotos({ bundle, theme, sourceDir, destDir })).toEqual(expected);
      expect(fs.readdirSync(destDir).sort()).toEqual(expected);
    }
  });

  test('a missing printed photo throws, naming it and the folder, before anything is written', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'present.jpg'), { width: 400, height: 300 });

    const publishing = publishPhotos({
      bundle: bundlePrinting(['present.jpg', 'missing (3 of 11).jpg']), theme: 'journalist', sourceDir, destDir
    });

    await expect(publishing).rejects.toThrow('"missing (3 of 11).jpg"');
    await expect(publishing).rejects.toThrow(sourceDir);
    expect(fs.existsSync(destDir)).toBe(false);
  });

  // The failure card offers Retry and Roll back. Retry resumes the run, which publishes
  // the approved article once the file is back; a rollback to the article stop clears
  // the article and writes it again, so the message names Retry.
  test('the missing-photo error tells the director to put the file back and retry the publish', async () => {
    const { sourceDir, destDir } = sessionFolders();

    const one = publishPhotos({ bundle: bundlePrinting(['gone.jpg']), theme: 'journalist', sourceDir, destDir });
    await expect(one).rejects.toThrow(
      `missing from ${sourceDir}: published without it, the page would show a broken image. ` +
      'Put it back in that folder and retry the publish: Retry resumes the run and publishes the approved ' +
      'article, while a rollback to the article stop would write the article again.'
    );

    const two = publishPhotos({ bundle: bundlePrinting(['gone.jpg', 'also gone.jpg']), theme: 'journalist', sourceDir, destDir });
    await expect(two).rejects.toThrow('"gone.jpg", "also gone.jpg"');
    await expect(two).rejects.toThrow('Put them back in that folder and retry the publish');
  });

  test('the source folder is never changed, and nothing is written outside the published folder', async () => {
    const { root, sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'aln (1 of 2).jpg'), { width: 3200, height: 1800, tagged: true });
    await writePhoto(path.join(sourceDir, 'aln (2 of 2).jpg'), { width: 400, height: 300 });
    const sourceBefore = filesUnder(sourceDir);
    const everyFileBefore = filesUnder(root);

    await publishPhotos({ bundle: bundlePrinting(['aln (1 of 2).jpg']), theme: 'journalist', sourceDir, destDir });

    expect(filesUnder(sourceDir)).toEqual(sourceBefore);
    const written = Object.keys(filesUnder(root)).filter((file) => !(file in everyFileBefore));
    expect(written).toEqual([path.relative(root, path.join(destDir, 'aln (1 of 2).jpg'))]);
  });

  test('a filename that leads outside the photo folders throws, and nothing is written', async () => {
    const { root, sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, '..', 'escape.jpg'), { width: 400, height: 300 });
    const everyFileBefore = filesUnder(root);

    await expect(publishPhotos({
      bundle: bundlePrinting(['../escape.jpg']), theme: 'journalist', sourceDir, destDir
    })).rejects.toThrow('"../escape.jpg"');

    expect(filesUnder(root)).toEqual(everyFileBefore);
  });

  test('files already in the published folder are left as they are; a printed photo replaces its namesake', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'aln (1 of 1).jpg'), { width: 3200, height: 1800 });
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(path.join(destDir, 'added-by-hand.jpg'), 'a photo copied in by hand');
    fs.copyFileSync(path.join(sourceDir, 'aln (1 of 1).jpg'), path.join(destDir, 'aln (1 of 1).jpg'));

    expect(await publishPhotos({
      bundle: bundlePrinting(['aln (1 of 1).jpg']), theme: 'journalist', sourceDir, destDir
    })).toEqual(['aln (1 of 1).jpg']);

    expect(fs.readFileSync(path.join(destDir, 'added-by-hand.jpg'), 'utf8')).toBe('a photo copied in by hand');
    expect((await sharp(path.join(destDir, 'aln (1 of 1).jpg')).metadata()).width).toBe(1600);
  });

  test('a page that prints no photo publishes nothing and creates no folder', async () => {
    const { sourceDir, destDir } = sessionFolders();
    await writePhoto(path.join(sourceDir, 'unprinted.jpg'), { width: 400, height: 300 });

    expect(await publishPhotos({ bundle: bundlePrinting([]), theme: 'journalist', sourceDir, destDir })).toEqual([]);
    expect(fs.existsSync(destDir)).toBe(false);
  });
});
